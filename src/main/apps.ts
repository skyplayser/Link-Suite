// Installierte Programme finden, läuft-Erkennung und Starten (Recherche „Starten (0.1)“ 1, Entscheidung E1).
// Alle Systembefehle über execFile mit festen Pfaden und Argumentliste, nie über eine Shell.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CATALOG, type Program, type ProgramId } from "../core/catalog";
import { keepSpotlightHit, matchRegistry, mdfindQuery, parseRegQuery, pickBest, type Found } from "../core/finder";
import { matchProgram, parsePlistJson } from "../core/plist";
import { parsePs, parseTasklist, type Proc } from "../core/procs";
import { parseSetupOutput, SETUP_PS, withShellDiag, type SetupExit } from "../core/winsetup";

const PLUTIL = "/usr/bin/plutil";
const MDFIND = "/usr/bin/mdfind";
const OPEN = "/usr/bin/open";
const PS = "/bin/ps";

function run(file: string, args: string[], timeout = 4000, maxBuffer = 4 * 1024 * 1024): Promise<string> {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout)));
  });
}

export interface FindOptions {
  /** Feste Orte (Standard: /Applications, ~/Applications). */
  roots: string[];
  /** Spotlight fragen (im Demo-Modus aus). */
  spotlight: boolean;
  /** Wechseldatenträger nach LJL Link absuchen (Standard /Volumes). */
  volumes: string | null;
  /** Entwicklerordner: Treffer darin zählen nicht als installiert. */
  devDirs: string[];
}

export interface Installed extends Found { program: ProgramId; others: string[]; onVolume: boolean }

async function readApp(appPath: string): Promise<{ program: Program; found: Found } | null> {
  const plist = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plist)) return null;
  const info = parsePlistJson(await run(PLUTIL, ["-convert", "json", "-o", "-", plist], 3000, 1024 * 1024));
  if (!info) return null;
  const program = matchProgram(info, path.basename(appPath));
  if (!program) return null;
  return { program, found: { path: appPath, version: info.version, bundleId: info.bundleId, via: "known" } };
}

/** LJL Link auf Sticks: /Volumes/<X>/LJL Link.app und eine Ordnerebene tiefer („LJL Link für den Club/“). */
function volumeCandidates(volumes: string, names: readonly string[]): string[] {
  const out: string[] = [];
  let vols: string[] = [];
  try { vols = fs.readdirSync(volumes); } catch { return out; }
  for (const v of vols.slice(0, 32)) {
    const base = path.join(volumes, v);
    for (const n of names) out.push(path.join(base, n));
    let subs: fs.Dirent[] = [];
    try { subs = fs.readdirSync(base, { withFileTypes: true }).slice(0, 200); } catch { continue; }
    for (const s of subs) if (s.isDirectory() && !s.name.startsWith(".") && !s.name.endsWith(".app")) for (const n of names) out.push(path.join(base, s.name, n));
  }
  return out;
}

/** macOS: feste Orte + Spotlight + Info.plist; LJL Link zusätzlich unter /Volumes. */
export async function findInstalledMac(opt: FindOptions): Promise<Map<ProgramId, Installed>> {
  const candidates = new Map<string, "known" | "spotlight" | "volume">();
  for (const root of opt.roots) for (const p of CATALOG) for (const n of p.appNames) candidates.set(path.join(root, n), "known");
  if (opt.spotlight) {
    const ids = CATALOG.flatMap(p => p.bundleIds);
    const hits = await Promise.all(ids.map(id => { const q = mdfindQuery(id); return q ? run(MDFIND, [q], 3000) : Promise.resolve(""); }));
    for (const text of hits) for (const line of text.split("\n")) {
      const f = line.trim();
      if (f && keepSpotlightHit(f, opt.devDirs) && !candidates.has(f)) candidates.set(f, "spotlight");
    }
  }
  if (opt.volumes) {
    const ljl = CATALOG.filter(p => p.stickOnly);
    for (const p of ljl) for (const c of volumeCandidates(opt.volumes, p.appNames)) candidates.set(c, "volume");
  }
  const byProgram = new Map<ProgramId, Found[]>();
  await Promise.all([...candidates].map(async ([file, via]) => {
    if (!fs.existsSync(file)) return;
    const r = await readApp(file);
    if (!r) return;
    // Vom Stick nur LJL Link
    if (via === "volume" && !r.program.stickOnly) return;
    const l = byProgram.get(r.program.id) ?? [];
    l.push({ ...r.found, via });
    byProgram.set(r.program.id, l);
  }));
  const out = new Map<ProgramId, Installed>();
  for (const [id, list] of byProgram) {
    const { best, others } = pickBest(list, os.homedir());
    if (best) out.set(id, { ...best, program: id, others: others.map(o => o.path), onVolume: best.path.startsWith("/Volumes/") });
  }
  return out;
}

function runOk(file: string, args: string[], timeout: number, maxBuffer = 16 * 1024 * 1024): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer, windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout ?? "") }));
  });
}

/**
 * Windows: Registry lesen (QA Windows 0.3.1 R1). Der ganze Uninstall-Zweig mit /s dauerte unter Last über 8 s.
 * Deshalb: je Hive (HKCU, HKLM) und Sicht (/reg:64, /reg:32) **nacheinander** eine gefilterte Suche nach „Link“ in den
 * Daten (`/f Link /d`, kleine Ausgabe), dann nur die gefundenen Schlüssel einzeln lesen. Zeitlimit 20 s je Abfrage.
 * `complete` = alle Abfragen haben geantwortet; sonst entfernt der Aufrufer kein bekanntes Programm.
 */
export async function findInstalledWin(): Promise<{ map: Map<ProgramId, Installed>; complete: boolean }> {
  const REG = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
  const KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
  const answered = (r: { ok: boolean; out: string }) => r.ok || /ERROR:.*(unable to find|nicht gefunden|konnte|find the specified)/i.test(r.out) || r.out.trim() === "";
  let complete = true;
  const keys: { key: string; view: string }[] = [];
  const names = CATALOG.filter(p => p.winName).map(p => p.winName!.toLowerCase());
  for (const hive of ["HKCU", "HKLM"]) for (const view of ["/reg:64", "/reg:32"]) {
    const r = await runOk(REG, ["query", `${hive}\\${KEY}`, "/s", "/f", "Link", "/d", view], 20_000, 4 * 1024 * 1024);
    if (!answered(r)) complete = false;
    for (const e of parseRegQuery(r.out)) {
      const dn = (e.values.DisplayName ?? "").toLowerCase();
      if (names.some(n => dn === n || dn.startsWith(n + " ")) && !keys.some(k => k.key === e.key)) keys.push({ key: e.key, view });
    }
  }
  const entries = [];
  for (const k of keys) {
    const r = await runOk(REG, ["query", k.key, k.view], 20_000, 1024 * 1024);
    if (!answered(r)) complete = false;
    entries.push(...parseRegQuery(r.out).filter(e => e.key === k.key));
  }
  const out = new Map<ProgramId, Installed>();
  for (const p of CATALOG) {
    if (!p.winName) continue;
    const { best, others } = pickBest(matchRegistry(entries, p.winName, `${p.winName}.exe`), os.homedir());
    if (best && fs.existsSync(best.path)) out.set(p.id, { ...best, program: p.id, others: others.map(o => o.path), onVolume: false });
  }
  return { map: out, complete };
}

/** Prozessliste (macOS: voller Pfad in `comm`). */
export async function processList(): Promise<Proc[]> {
  if (process.platform === "win32") {
    // tasklist liefert nur Programmnamen; zugeordnet wird über den Namen der .exe (QA Win F4)
    const SYS = process.env.SystemRoot ?? "C:\\Windows";
    return parseTasklist((await run(path.join(SYS, "System32", "tasklist.exe"), ["/fo", "csv", "/nh"], 5000, 8 * 1024 * 1024)));
  }
  return parsePs(await run(PS, ["-axo", "pid=,comm="], 3000, 8 * 1024 * 1024));
}

/** Installierte App starten bzw. nach vorn holen: `open -a <gefundener Pfad>` (E1, nicht `open -b`). */
export function launchApp(appPath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise(resolve => {
    if (process.platform === "win32") {
      try {
        const c = spawn(appPath, [], { detached: true, stdio: "ignore", windowsHide: false });
        c.on("error", e => resolve({ ok: false, error: e.message }));
        c.unref();
        setTimeout(() => resolve({ ok: true }), 300);
      } catch (e) { resolve({ ok: false, error: (e as Error).message }); }
      return;
    }
    execFile(OPEN, ["-a", appPath], { timeout: 15000 }, err => resolve(err ? { ok: false, error: err.message } : { ok: true }));
  });
}

/**
 * Windows (1.0.1): Installer über PowerShell Start-Process öffnen (ShellExecuteEx – UAC-Abfrage wie beim Doppelklick)
 * und warten, bis genau dieser Prozess endet. Fester Pfad zu powershell.exe, Pfad der .exe nur über die Umgebung.
 * Windows-Test 1.0.1: mit `detached` (DETACHED_PROCESS, ohne Konsole) blieb die Ausgabe leer. Darum ohne `detached`,
 * mit verborgener Konsole (`windowsHide`) und Pipes; stderr und Exit-Code von PowerShell gehen ins Log.
 * Ohne `detached` liegt PowerShell im Job-Objekt von Node und endet mit der Link-Suite; der Installer selbst ist ein
 * Enkel und verlässt den Job (libuv: SILENT_BREAKAWAY_OK) – er läuft weiter, wenn die Link-Suite beendet wird.
 */
export function runSetup(file: string): Promise<SetupExit> {
  const SYS = process.env.SystemRoot ?? "C:\\Windows";
  const ps = path.join(SYS, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise(resolve => {
    let out = "", err = "";
    let settled = false;
    const finish = (r: SetupExit) => { if (!settled) { settled = true; resolve(r); } };
    try {
      const c = spawn(ps, ["-NoProfile", "-NonInteractive", "-Command", SETUP_PS], {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LINKSUITE_SETUP: file },
      });
      c.stdout!.setEncoding("utf8");
      c.stderr!.setEncoding("utf8");
      c.stdout!.on("data", (d: string) => { if (out.length < 64_000) out += d; });
      c.stderr!.on("data", (d: string) => { if (err.length < 4000) err += d; });
      c.once("error", e => finish({ code: null, error: e.message, pid: null, noShell: true }));
      c.once("close", (code, signal) => finish(withShellDiag(parseSetupOutput(out), code, signal, err)));
    } catch (e) { finish({ code: null, error: (e as Error).message, pid: null, noShell: true }); }
  });
}
