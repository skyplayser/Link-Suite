// Entwicklerprojekte starten und stoppen (Recherche „Electron-Projekte im Entwicklermodus starten“, E2).
// Ab Werk: das Electron-Programm des Projekts direkt mit dem Projektordner, ohne Bauen und ohne npm.
// `npm run dev` / `npm start` nur nach Rückfrage (schreibt in den Projektordner). Kein `npm install`.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProgramId } from "../core/catalog";
import { buildPath, cleanEnv, knownNodeDirs, parseShellProbe, shellProbeFor, type ShellProbe } from "../core/env";
import { procsOfDevProject } from "../core/procs";
import { LineSplitter, RingLog, type LogLine, type LogStream } from "../core/ringlog";
import type { RunInfo } from "../core/state";
import { processList } from "./apps";

export const STOP_GRACE_MS = 5000;

interface Run {
  info: RunInfo;
  child: ChildProcess | null;
  /** PIDs, die beim Start schon unter node_modules/electron/dist liefen (gehören nicht zu diesem Start). */
  before: Set<number>;
  killTimer?: NodeJS.Timeout;
  userStop: boolean;
  last: string;
}

export type Say = (key: string, vars?: Record<string, string | number>) => string;

/** Login-Shell einmal je Sitzung fragen (mit Marker und Zeitlimit), sonst bekannte Orte. */
let probeCache: Promise<ShellProbe | null> | null = null;
export function nodeProbe(): Promise<ShellProbe | null> {
  if (probeCache) return probeCache;
  probeCache = new Promise<ShellProbe | null>(resolve => {
    const shell = process.env.SHELL && /^\/[\w/.-]+$/.test(process.env.SHELL) ? process.env.SHELL : "/bin/zsh";
    const env: Record<string, string> = {};
    for (const k of ["HOME", "USER", "LOGNAME", "SHELL", "LANG", "TMPDIR"]) if (process.env[k]) env[k] = process.env[k]!;
    execFile(shell, ["-ilc", shellProbeFor(shell)], { timeout: 5000, env, maxBuffer: 1024 * 1024 }, (_err, stdout) => {
      const p = parseShellProbe(String(stdout ?? ""));
      if (p && fs.existsSync(p.npm)) { resolve(p); return; }
      // Rückfall: bekannte Orte, erster mit ausführbarem node und npm
      const home = os.homedir();
      let nvm: string[] = [];
      try { nvm = fs.readdirSync(path.join(home, ".nvm", "versions", "node")); } catch { /* kein nvm */ }
      for (const d of knownNodeDirs(home, nvm)) {
        const node = path.join(d, "node"), npm = path.join(d, "npm");
        try { fs.accessSync(node, fs.constants.X_OK); fs.accessSync(npm, fs.constants.X_OK); resolve({ npm, node, path: "" }); return; } catch { /* weiter */ }
      }
      resolve(null);
    });
  });
  return probeCache;
}

function alive(pid: number, group: boolean): boolean {
  try { process.kill(group ? -pid : pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

function hhmmss(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export class DevRunner {
  private readonly runs = new Map<ProgramId, Run>();
  private readonly logs = new Map<ProgramId, RingLog>();
  private pending = new Map<ProgramId, LogLine[]>();
  private flushTimer?: NodeJS.Timeout;

  constructor(
    private readonly onLog: (id: ProgramId, lines: LogLine[]) => void,
    private readonly onChange: () => void,
    private readonly say: Say,
  ) {}

  info(id: ProgramId): RunInfo | null { return this.runs.get(id)?.info ?? null; }
  get running(): RunInfo[] { return [...this.runs.values()].filter(r => r.info.state === "running" || r.info.state === "stopping").map(r => r.info); }

  log(id: ProgramId, since = 0): LogLine[] { return this.logs.get(id)?.since(since) ?? []; }
  clearLog(id: ProgramId): void { this.logs.get(id)?.clear(); }

  /** Text zum Kopieren: Kopfzeilen (Programm, Ordner, Befehl, Exit) und die Zeilen. */
  logText(id: ProgramId, name: string): string {
    const r = this.runs.get(id)?.info;
    const head = [`# ${name}`, r ? `# ${r.dir} $ ${r.cmd}` : "", r && r.state !== "running" ? `# ${r.state}${r.code !== null ? ` (exit ${r.code})` : ""}` : ""].filter(Boolean);
    return [...head, ...(this.logs.get(id)?.since(0) ?? []).map(l => l.t)].join("\n") + "\n";
  }

  private push(id: ProgramId, s: LogStream, text: string): void {
    let log = this.logs.get(id);
    if (!log) { log = new RingLog(); this.logs.set(id, log); }
    const line = log.push(s, text);
    // Letzte Zeile nur merken; in den Zustand kommt sie erst beim Ende (sonst änderte sich der Zustand bei jeder Zeile)
    if (s === "out" || s === "err") { const r = this.runs.get(id); if (r && text.trim()) r.last = text.slice(0, 300); }
    const l = this.pending.get(id) ?? [];
    l.push(line);
    this.pending.set(id, l);
    // gebündelt ins Fenster (alle 100 ms)
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 100);
  }

  private flush(): void {
    this.flushTimer = undefined;
    const p = this.pending;
    this.pending = new Map();
    for (const [id, lines] of p) this.onLog(id, lines);
  }

  /**
   * Startet `bin args` im Projektordner als eigene Prozessgruppe. `mode` direct: Electron des Projekts; script: npm.
   * Die Umgebung ist gesäubert (ELECTRON_*, npm_*, VITE_*, NODE_OPTIONS, __CFBundleIdentifier …).
   */
  async start(id: ProgramId, opt: { mode: "direct" | "script"; bin: string; args: string[]; cmd: string; dir: string; env: Record<string, string> }): Promise<{ ok: boolean; error?: string }> {
    const cur = this.runs.get(id);
    if (cur && (cur.info.state === "running" || cur.info.state === "stopping")) return { ok: false, error: "running" };
    const before = new Set(procsOfDevProject(await processList(), opt.dir).map(p => p.pid));
    const now = Date.now();
    const info: RunInfo = { id, pid: 0, mode: opt.mode, cmd: opt.cmd, dir: opt.dir, startedAt: now, endedAt: 0, state: "running", code: null, signal: null, lastLine: "" };
    const run: Run = { info, child: null, before, userStop: false, last: "" };
    this.push(id, "sys", this.say("log.sys.start", { time: hhmmss(new Date(now)), dir: opt.dir, cmd: opt.cmd }));
    // Aufgelöstes Programm zeigen (nicht nur „electron .“)
    this.push(id, "sys", this.say("log.sys.bin", { bin: opt.bin }));
    let child: ChildProcess;
    try {
      child = spawn(opt.bin, opt.args, { cwd: opt.dir, detached: true, stdio: ["ignore", "pipe", "pipe"], env: opt.env, windowsHide: true });
    } catch (e) {
      info.state = "failed"; info.endedAt = Date.now(); info.lastLine = (e as Error).message;
      this.push(id, "exit-err", (e as Error).message);
      this.runs.set(id, run); this.onChange();
      return { ok: false, error: (e as Error).message };
    }
    run.child = child;
    info.pid = child.pid ?? 0;
    this.runs.set(id, run);
    for (const [stream, kind] of [[child.stdout, "out"], [child.stderr, "err"]] as const) {
      if (!stream) continue;
      stream.setEncoding("utf8");
      const split = new LineSplitter(line => this.push(id, kind, line));
      stream.on("data", (d: string) => split.write(d));
      stream.on("end", () => split.flush());
      stream.on("error", () => { /* Kind weg */ });
    }
    child.on("error", err => {
      if (info.state !== "running" || ended) return;
      ended = true;
      info.state = "failed"; info.endedAt = Date.now(); info.lastLine = err.message;
      this.push(id, "exit-err", this.say("log.sys.failed", { time: hhmmss(new Date()), msg: err.message }));
      this.onChange();
    });
    // Ende erst melden, wenn auch die Ausgabe gelesen ist („close“); hält ein Enkel die Ausgabe offen, nach 500 ms.
    let ended = false, exitAt = 0, exitCode: number | null = null, exitSignal: NodeJS.Signals | null = null;
    child.on("exit", (code, signal) => {
      exitAt = Date.now(); exitCode = code; exitSignal = signal;
      setTimeout(() => finish(), 500).unref();
    });
    child.on("close", (code, signal) => {
      if (!exitAt) { exitAt = Date.now(); exitCode = code; exitSignal = signal; }
      finish();
    });
    const finish = () => {
      if (ended) return;
      ended = true;
      const code = exitCode, signal = exitSignal;
      clearTimeout(run.killTimer);
      info.endedAt = exitAt; info.code = code; info.signal = signal;
      info.lastLine = run.last;
      const took = duration(info.endedAt - info.startedAt);
      const time = hhmmss(new Date(info.endedAt));
      if (run.userStop) { info.state = "stopped"; this.push(id, "exit-stop", this.say("log.sys.stopped", { time, took })); }
      else if (code === 0) { info.state = "exited"; this.push(id, "exit-ok", this.say("log.sys.exit", { time, code: 0, took })); }
      else { info.state = "failed"; this.push(id, "exit-err", this.say("log.sys.exit", { time, code: code ?? signal ?? "?", took })); }
      run.child = null;
      this.onChange();
    };
    this.onChange();
    return { ok: true };
  }

  /**
   * Stoppen: SIGTERM an die Prozessgruppe, nach 5 s SIGKILL. Dazu Electron-Programme des Projekts, die nach dem Start
   * außerhalb der Gruppe entstanden sind (VJ-Link `npm start` startet die App über `open -W -n -a`).
   */
  async stop(id: ProgramId): Promise<void> {
    const run = this.runs.get(id);
    if (!run || run.info.state !== "running") return;
    run.userStop = true;
    run.info.state = "stopping";
    const pid = run.info.pid;
    this.push(id, "sys", this.say("log.sys.stop", { time: hhmmss(new Date()), pid }));
    const outside = procsOfDevProject(await processList(), run.info.dir).filter(p => !run.before.has(p.pid) && p.pid !== pid);
    const term = (sig: NodeJS.Signals) => {
      if (pid > 0) { try { process.kill(-pid, sig); } catch { try { process.kill(pid, sig); } catch { /* weg */ } } }
      for (const p of outside) { try { process.kill(p.pid, sig); } catch { /* weg */ } }
    };
    term("SIGTERM");
    this.onChange();
    await new Promise<void>(resolve => {
      run.killTimer = setTimeout(() => {
        if ((pid > 0 && alive(pid, true)) || outside.some(p => alive(p.pid, false))) {
          this.push(id, "sys", this.say("log.sys.kill", { time: hhmmss(new Date()) }));
          term("SIGKILL");
        }
        resolve();
      }, STOP_GRACE_MS);
      run.child?.once("exit", () => {
        // Gruppe kann noch Kinder haben (Helfer, Vite): kurz nachsehen
        setTimeout(() => {
          if (!(pid > 0 && alive(pid, true)) && !outside.some(p => alive(p.pid, false))) { clearTimeout(run.killTimer); resolve(); }
        }, 300);
      });
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.running.map(r => this.stop(r.id)));
  }

  /** Launcher beendet sich, Prozesse sollen weiterlaufen: nicht mehr auf sie warten. */
  detachAll(): void {
    for (const r of this.runs.values()) {
      r.child?.stdout?.removeAllListeners("data"); r.child?.stderr?.removeAllListeners("data");
      r.child?.unref();
    }
  }
}

/** Umgebung für einen Entwicklerstart. `npmPath`: nur für den Skript-Weg nötig. */
export function devEnv(probe: ShellProbe | null): Record<string, string> {
  return cleanEnv(process.env, { PATH: buildPath(probe, null) });
}
