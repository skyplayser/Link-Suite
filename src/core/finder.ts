// Installierte Programme finden: Regeln ohne Dateisystem (Recherche „Starten (0.1)“ 1, Konzept „Finden“).
import path from "node:path";
import { isNewer } from "./version";

/**
 * Treffer aus Spotlight, die nicht als „installiert“ zählen: Builds in Projektordnern (`/release/`), Pakete
 * (`node_modules`), Papierkorb, Arbeitskopien im Datenordner, Images unter /Volumes (außer `allowVolumes`, LJL Link)
 * und alles in den Entwicklerordnern.
 */
export function keepSpotlightHit(file: string, devDirs: readonly string[], allowVolumes = false): boolean {
  if (!file.startsWith("/") || !file.endsWith(".app")) return false;
  const p = file + "/";
  if (/\/(release|node_modules|\.Trash|dist|build|out)\//.test(p)) return false;
  if (p.includes("/Library/Application Support/") || p.includes("/Library/Caches/") || p.includes("/private/var/") || p.startsWith("/private/tmp/") || p.startsWith("/tmp/")) return false;
  if (p.startsWith("/Volumes/") && !allowVolumes) return false;
  for (const d of devDirs) if (d && (p.startsWith(d.endsWith("/") ? d : d + "/"))) return false;
  return true;
}

/** Spotlight-Abfrage nach Kennung (Kennung nur aus catalog.ts, trotzdem streng geprüft). */
export function mdfindQuery(bundleId: string): string | null {
  return /^[A-Za-z0-9.-]{3,100}$/.test(bundleId) ? `kMDItemCFBundleIdentifier == '${bundleId}'` : null;
}

export interface Found {
  path: string;
  version: string;
  bundleId: string;
  /** Wo gefunden: fester Ort, Spotlight, Stick. */
  via: "known" | "spotlight" | "volume" | "registry";
}

/** Rang des Ortes bei gleicher Version: /Applications vor ~/Applications vor dem Rest. */
function placeRank(p: string, home: string): number {
  if (p.startsWith("/Applications/")) return 0;
  if (p.startsWith(path.join(home, "Applications") + "/")) return 1;
  if (p.startsWith("/Volumes/")) return 3;
  return 2;
}

/** Mehrere Treffer: der neueste zählt, bei gleicher Version der übliche Ort. Doppelte Pfade fallen weg. */
export function pickBest(found: readonly Found[], home: string): { best: Found | null; others: Found[] } {
  const uniq = [...new Map(found.map(f => [f.path, f])).values()];
  const sorted = uniq.sort((a, b) => {
    if (isNewer(a.version, b.version)) return -1;
    if (isNewer(b.version, a.version)) return 1;
    return placeRank(a.path, home) - placeRank(b.path, home) || a.path.localeCompare(b.path);
  });
  return { best: sorted[0] ?? null, others: sorted.slice(1) };
}

// ------------------------------------------------------------------ Windows (Gerüst, nicht live geprüft)

export interface RegEntry { key: string; values: Record<string, string> }

/**
 * Ausgabe von `reg query <Uninstall> /s` lesen: Blöcke aus Schlüsselzeile (HKEY_…) und Werten
 * („    Name    REG_SZ    Wert“). Nur REG_SZ/REG_EXPAND_SZ/REG_DWORD.
 */
export function parseRegQuery(text: string): RegEntry[] {
  const out: RegEntry[] = [];
  let cur: RegEntry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(raw)) { cur = { key: raw.trim(), values: {} }; out.push(cur); continue; }
    const m = /^\s{2,}(.+?)\s{2,}(REG_SZ|REG_EXPAND_SZ|REG_DWORD)\s{2,}(.*)$/.exec(raw);
    if (m && cur) cur.values[m[1]!] = m[3]!.trim();
  }
  return out;
}

/** Programm in der Registry: `DisplayName` beginnt mit dem Namen; Pfad zur .exe aus DisplayIcon oder InstallLocation. */
export function matchRegistry(entries: readonly RegEntry[], winName: string, exeName: string): Found[] {
  const out: Found[] = [];
  for (const e of entries) {
    const name = e.values.DisplayName ?? "";
    if (!name || !(name === winName || name.startsWith(winName + " "))) continue;
    let exe = (e.values.DisplayIcon ?? "").replace(/^"|"$/g, "").replace(/,\s*-?\d+$/, "");
    if (!/\.exe$/i.test(exe) && e.values.InstallLocation) exe = e.values.InstallLocation.replace(/[\\/]+$/, "") + "\\" + exeName;
    if (!/^[A-Za-z]:\\/.test(exe) || !/\.exe$/i.test(exe)) continue;
    out.push({ path: exe, version: e.values.DisplayVersion ?? "", bundleId: "", via: "registry" });
  }
  return out;
}
