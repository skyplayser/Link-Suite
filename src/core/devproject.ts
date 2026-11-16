// Ist ein Entwicklerprojekt startbar? Liest nur (package.json, node_modules/electron, gebaute Dateien), ändert nichts
// und lädt nichts aus dem Projekt (kein require: das würde Electron nachladen). Recherche „Startbarkeit erkennen“.
import fs from "node:fs";
import path from "node:path";

/** posix oder win32 (für Tests beider Systeme auf jeder Plattform). */
type PlatformPath = typeof path.win32;

export type DevStatus =
  | "no-folder"     // Ordner fehlt
  | "no-package"    // kein (lesbares) package.json
  | "not-suite"     // package.json gehört zu einem anderen Projekt
  | "no-script"     // weder Skript dev/start noch main
  | "no-modules"    // node_modules fehlt → npm install im Terminal
  | "no-electron"   // Electron fehlt in node_modules → npm install
  | "electron-outside" // node_modules/electron (oder sein Programm) liegt per Symlink außerhalb des Projekts
  | "ready"         // gebaut: Electron direkt mit dem Ordner starten, ohne Bauen
  | "needs-build";  // nicht gebaut, aber dev/start da → eigener Knopf mit Rückfrage

import type { NeedItem, NeedKey } from "./need";
export { firstMissing, type NeedItem, type NeedKey } from "./need";

export interface DevAssess {
  dir: string;
  /** Ordner mit aufgelösten Symlinks; gestartet wird nur hier drin (QA Befund 2). */
  realDir: string;
  status: DevStatus;
  version: string;
  /** Bevorzugtes Skript (dev vor start) und sein Inhalt. */
  script: "dev" | "start" | null;
  scriptText: string;
  /** Anzeigebefehl, z. B. „npm run dev“ / „npm start“. */
  scriptCmd: string;
  /** Datei aus `main` (relativ) und ob sie gebaut vorliegt. */
  main: string;
  mainBuilt: boolean;
  rendererBuilt: boolean;
  /** Absoluter Pfad zum Electron-Programm des Projekts (aus path.txt), wenn vorhanden. */
  electronBin: string;
  /** Build älter als der Quelltext (nur Hinweis). */
  stale: boolean;
  need: NeedItem[];
}

const MAX_PKG = 256 * 1024;

function isFile(p: string): boolean { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p: string): boolean { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function mtime(p: string): number { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }

/** Relativer Pfad innerhalb von `base` (kein „..“, nicht absolut); sonst null. */
export function insideRel(base: string, rel: unknown, P: PlatformPath = path): string | null {
  if (typeof rel !== "string" || !rel || rel.length > 512 || rel.includes("\0") || P.isAbsolute(rel)) return null;
  // Windows: Laufwerksangaben („C:foo“) und UNC sind nie relativ zum Projekt
  if (P === path.win32 || P.sep === "\\") { if (/^[A-Za-z]:/.test(rel) || rel.startsWith("\\\\")) return null; }
  const abs = P.resolve(base, rel);
  const r = P.relative(base, abs);
  return r && r !== ".." && !r.startsWith(".." + P.sep) && !r.startsWith("../") && !P.isAbsolute(r) ? abs : null;
}

/**
 * Realer Pfad (Symlinks aufgelöst) von `p`, nur wenn er im realen Ordner `realBase` liegt; sonst null.
 * Textliche Prüfung allein reicht nicht: `dist → /bin` sähe innen aus.
 */
export function realInside(realBase: string, p: string): string | null {
  let r: string;
  try { r = fs.realpathSync(p); } catch { return null; }
  const rel = path.relative(realBase, r);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? r : null;
}

/** Electron-Programm unter macOS: muss in einem App-Bundle liegen (…/X.app/Contents/MacOS/<Name>). */
export function looksLikeAppBinary(p: string, platform: string = process.platform): boolean {
  if (platform !== "darwin") return /electron(\.exe)?$/i.test(path.basename(p));
  return /\.app\/Contents\/MacOS\/[^/]+$/.test(p);
}

/** Neueste Änderungszeit unter den Quellordnern (begrenzt, ohne node_modules). */
function newestSource(dir: string, limit = 4000): number {
  let best = 0, seen = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 8 || seen > limit) return;
    let list: fs.Dirent[];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (++seen > limit) return;
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile()) best = Math.max(best, mtime(p));
    }
  };
  for (const s of ["src", "electron"]) if (isDir(path.join(dir, s))) walk(path.join(dir, s), 0);
  return best;
}

/**
 * Prüft den Ordner in der Reihenfolge des Designs (Ordner, package.json, Skript, node_modules) und dazu Electron und
 * den Build. `pkgName`: erwarteter `name` aus catalog.ts. `renderer`: mögliche Lagen der gebauten Oberfläche.
 */
export function assessDevProject(dir: string, pkgName: string | undefined, renderer: readonly string[] = []): DevAssess {
  const a: DevAssess = {
    dir, realDir: "", status: "no-folder", version: "", script: null, scriptText: "", scriptCmd: "", main: "", mainBuilt: false,
    rendererBuilt: false, electronBin: "", stale: false, need: [],
  };
  const need = (key: NeedKey, have: boolean) => { a.need.push({ key, have }); return have; };

  let real = "";
  try { real = isDir(dir) ? fs.realpathSync(dir) : ""; } catch { real = ""; }
  if (!need("folder", !!real)) return a;
  a.realDir = real;
  dir = real; // ab hier alles im realen Ordner

  let pkg: Record<string, unknown> | null = null;
  const pkgFile = realInside(real, path.join(dir, "package.json"));
  try {
    if (pkgFile && isFile(pkgFile) && fs.statSync(pkgFile).size <= MAX_PKG) {
      const v: unknown = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      if (v && typeof v === "object" && !Array.isArray(v)) pkg = v as Record<string, unknown>;
    }
  } catch { pkg = null; }
  if (!need("package", !!pkg)) { a.status = "no-package"; return a; }
  const p = pkg!;
  a.version = typeof p.version === "string" && p.version.length <= 40 ? p.version : "";
  if (pkgName && !need("suite", p.name === pkgName)) { a.status = "not-suite"; return a; }

  const scripts = p.scripts && typeof p.scripts === "object" ? (p.scripts as Record<string, unknown>) : {};
  for (const s of ["dev", "start"] as const) {
    const text = scripts[s];
    if (typeof text === "string" && text.trim()) { a.script = s; a.scriptText = text.slice(0, 500); break; }
  }
  a.scriptCmd = a.script === "dev" ? "npm run dev" : a.script === "start" ? "npm start" : "";
  const mainRel = insideRel(dir, p.main);
  const mainAbs = mainRel ? (fs.existsSync(mainRel) ? realInside(real, mainRel) : mainRel) : null;
  a.main = mainRel ? path.relative(dir, mainRel) : "";
  if (!need("script", !!a.script || !!mainAbs)) { a.status = "no-script"; return a; }

  if (!need("modules", isDir(path.join(dir, "node_modules")))) { a.status = "no-modules"; return a; }

  const eDir = path.join(dir, "node_modules", "electron");
  let bin = "";
  let outside = false;
  try {
    // Electron-Paket selbst (oder node_modules) per Symlink außerhalb des Projekts: eigener Befund, nicht „fehlt“
    if (fs.existsSync(eDir) && !realInside(real, eDir)) outside = true;
    else if (isFile(path.join(eDir, "package.json"))) {
      const rel = fs.readFileSync(path.join(eDir, "path.txt"), "utf8").trim();
      const abs = insideRel(path.join(eDir, "dist"), rel);
      // Symlinks auflösen: das Programm muss im realen Projektordner liegen und in einem App-Bundle stecken
      if (abs && fs.existsSync(abs)) {
        const realBin = realInside(real, abs);
        if (!realBin) outside = true;
        else if (isFile(realBin) && looksLikeAppBinary(realBin)) bin = realBin;
      }
    }
  } catch { bin = ""; }
  a.electronBin = bin;
  if (outside) { need("electronOutside", false); a.status = "electron-outside"; return a; }
  if (!need("electron", !!bin)) { a.status = "no-electron"; return a; }

  a.mainBuilt = !!mainAbs && isFile(mainAbs);
  a.rendererBuilt = renderer.length === 0 || renderer.some(r => { const f = insideRel(dir, r); const rf = f ? realInside(real, f) : null; return !!rf && isFile(rf); });
  const built = a.mainBuilt && a.rendererBuilt;
  if (built) {
    a.need.push({ key: "built", have: true });
    a.status = "ready";
    const src = newestSource(dir);
    a.stale = src > 0 && mtime(mainAbs!) + 1000 < src;
    return a;
  }
  a.need.push({ key: "built", have: false });
  a.status = a.script ? "needs-build" : "no-script";
  return a;
}
