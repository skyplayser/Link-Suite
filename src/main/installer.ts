// Installieren und Aktualisieren (Version 0.2). Vorbild: VJ-Link src/main/updater.ts (EPL-2.0, Stand 15.11.2026):
// Prüfen über die GitHub-API, Laden mit Fortschritt, SHA-256, signierte SHA256SUMS, Ersetzen der App, Selbst-Update per
// Skript. Erweitert um: eigene Umleitungsprüfung (nur GitHub-Hosts, höchstens 5), „URL gehört zum Repo“, Größe,
// Inhaltsprüfung im Image (genau eine App, Kennung, Version), Ersetzen über .neu/.alt mit Rückweg, LJL-Link-Zip.
// Alle Systembefehle über execFile mit festen Pfaden und Argumentliste. Ins Internet geht nur dieser Teil, nur zu GitHub.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parsePlistJson, type AppInfo } from "../core/plist";
import { isNewer } from "../core/version";
import { setupVerdict, type SetupExit } from "../core/winsetup";
import {
  CATALOG_VERSION, pageFor, sourceById, staleSources,
  allowedUrl, bundleMatches, checkSignature, installVerdict, kindOf, MAX_DOWNLOAD, MAX_REDIRECTS, pickRelease, REQUIRE_SIGNATURE,
  sizeOk, SOURCES, SUITE_PUBLIC_KEYS, symlinkInside, unsafeZipEntries, urlBelongsToRepo, type ReleaseInfo, type ReleaseSource, type SourceId,
} from "../core/release";

const HDIUTIL = "/usr/bin/hdiutil";
const DITTO = "/usr/bin/ditto";
const PLUTIL = "/usr/bin/plutil";
const ZIPINFO = "/usr/bin/zipinfo";
const DISKUTIL = "/usr/sbin/diskutil";

export type CheckState = "unknown" | "checking" | "ok" | "missing" | "error";
export type Phase = "idle" | "download" | "verify" | "install" | "waiting" | "done" | "failed" | "cancelled";

export interface UpdateEntry {
  id: SourceId;
  check: CheckState;
  latest: ReleaseInfo | null;
  /** Fehlertext der Prüfung (keine Verbindung o. Ä.). */
  error: string;
  phase: Phase;
  progress: number;
  message: string;
  /** Stand aus dem Zwischenspeicher (letzte Prüfung), nicht frisch: vor dem Installieren wird neu geprüft. */
  cached?: boolean;
}

export interface UpdatesSnapshot {
  entries: UpdateEntry[]; checkedAt: number; checking: boolean; platform: string; arch: string;
  /** Warum das Selbst-Update hier nicht geht (leer = geht). */
  selfBlocked: string;
  /** Ergebnis eines Selbst-Updates vom letzten Beenden (aus self-update.log), leer = nichts. */
  selfResult: string;
  demo: boolean;
  /** GitHub-Kontingent ohne Anmeldung aufgebraucht: bis wann (ms), 0 = nicht. */
  rateLimitedUntil: number;
  /** Zeit der letzten gelungenen Prüfung (auch aus dem Zwischenspeicher). */
  lastGood: number;
}

class RateLimited extends Error { constructor(readonly until: number) { super("GitHub rate limit"); } }

/** Leerlauf beim Laden: so lange ohne Daten → Abbruch. */
export const STALL_MS = 60_000;

function run(file: string, args: string[], timeout = 120_000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => resolve({ ok: !e, out: String(out), err: String(err || e?.message || "") }));
  });
}

export async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

async function readInfo(appPath: string): Promise<AppInfo | null> {
  const r = await run(PLUTIL, ["-convert", "json", "-o", "-", path.join(appPath, "Contents", "Info.plist")], 10_000);
  return r.ok ? parsePlistJson(r.out) : null;
}

/**
 * Nur eigene Arbeitsdateien löschen (Name mit eigenem Muster), nie etwas anderes. Wichtig (QA 0.3 Nr. 1): Das `fs` von
 * Electron behandelt `app.asar` als Ordner, `rm -r` bricht dann ab. Deshalb unter macOS/Linux `/bin/rm -rf` (fester Pfad,
 * Argumentliste) nach der Namensprüfung, unter Windows `fs.rm` mit `process.noAsar`. Danach wird geprüft, ob alles weg ist.
 */
export async function rmOwn(p: string): Promise<void> {
  const b = path.basename(p);
  if (!(b.startsWith(".") && (b.endsWith(".neu") || b.endsWith(".alt"))) && !p.includes(`${path.sep}link-suite-dl-`)) throw new Error(`refuse to delete ${p}`);
  const proc = process as NodeJS.Process & { noAsar?: boolean };
  const prev = proc.noAsar;
  proc.noAsar = true;
  try {
    if (process.platform !== "win32") {
      const r = await run("/bin/rm", ["-rf", "--", p], 300_000);
      if (!r.ok) throw new Error(`rm: ${r.err.trim()}`);
    } else {
      await fsp.rm(p, { recursive: true, force: true });
    }
    if (fs.existsSync(p)) throw new Error(`not removed: ${p}`);
  } finally {
    proc.noAsar = prev;
  }
}

/** Zeitlimit nur bis zu den Antwort-Kopfzeilen (QA 0.3 Nr. 2); der Body hat nur das Leerlauf-Limit. */
export async function fetchHeaders(fetchFn: typeof fetch, url: string, init: RequestInit, headerMs: number, outer: AbortSignal): Promise<Response> {
  const hdr = new AbortController();
  const timer = setTimeout(() => hdr.abort(new Error("timeout before headers")), headerMs);
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.any([outer, hdr.signal]) });
  } finally {
    clearTimeout(timer);
  }
}

/** Body lesen; bricht nur ab, wenn `idleMs` lang keine Daten kommen (nicht nach einer Gesamtzeit). */
export async function readIdle(reader: ReadableStreamDefaultReader<Uint8Array>, idleMs: number, onChunk: (b: Uint8Array) => Promise<void> | void, stallMessage: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const stalled = () => new Promise<never>((_, reject) => {
    clearTimeout(timer);
    // erst ablehnen, dann abbrechen (sonst gewinnt das „done“ des abgebrochenen Lesens das Rennen)
    timer = setTimeout(() => { reject(new Error(stallMessage)); void reader.cancel().catch(() => {}); }, idleMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stalled()]);
      if (done) break;
      await onChunk(value);
    }
  } finally {
    clearTimeout(timer);
  }
}

export const HEADER_MS = 30_000;

export type InstallWay = "self-dmg" | "dmg" | "ljl-zip" | "exe";
/**
 * Welcher Weg für welches Paket? Unter Windows immer der Installer (.exe) – nie Ersetzen über .neu/.alt mit ditto,
 * auch nicht beim Selbst-Update. Unter macOS .dmg (Selbst-Update per Skript) bzw. das LJL-Zip.
 */
export function installWay(id: SourceId, asset: string, platform: string): InstallWay | null {
  const kind = kindOf(asset);
  if (platform === "win32") return kind === "exe" ? "exe" : null;
  if (platform !== "darwin") return null;
  if (kind === "dmg") return id === "suite" ? "self-dmg" : "dmg";
  if (kind === "zip" && id === "ljl") return "ljl-zip";
  return null;
}

export interface InstallerDeps {
  version: string;
  dataDir: string;
  /** Wo die App heute liegt (aus dem Suchlauf), sonst null. */
  installedPath(id: SourceId): string | null;
  /** Läuft die App? */
  isRunning(appPath: string): Promise<boolean>;
  /** Nativer Dialog „bitte beenden“: true = erneut prüfen, false = abbrechen. */
  askQuit(name: string): Promise<boolean>;
  /** LJL Link: Ziel wählen (Ordner oder Stick); null = abgebrochen. */
  pickLjlTarget(sticks: { name: string; path: string }[]): Promise<string | null>;
  onChange(): void;
  say(key: string, vars?: Record<string, string | number>): string;
  /** Startlog (main.log); optional, damit Tests ohne auskommen. */
  log?(event: string, detail?: string): void;
  /** QA: jede GitHub-Anfrage sofort mit „keine Verbindung“ beantworten (nur Entwickler-Build/Demo). */
  offline?: boolean;
  /** Windows: Datei über die Shell öffnen (ShellExecute, damit UAC erscheinen kann); Fehlertext oder "". */
  openFile?(file: string): Promise<string>;
  /**
   * Windows (1.0.1): Installer öffnen (PowerShell Start-Process = ShellExecuteEx, UAC bleibt) und auflösen, sobald
   * genau dieser Prozess endet. Fehlt die Funktion oder PowerShell (noShell), gilt der Ersatzweg openFile + tasklist.
   */
  runInstaller?(file: string): Promise<SetupExit>;
  /** Windows: läuft noch ein Prozess mit dem Namen dieser .exe (tasklist)? */
  imageRunning?(file: string): Promise<boolean>;
  /** Windows: installierte Version neu lesen (Registry), null = nicht installiert. */
  installedVersion?(id: SourceId): Promise<string | null>;
  /** Releases zwischenspeichern (launcher.json). */
  saveCache?(c: Record<string, unknown>): void;
  /** Windows-Weg auch auf anderen Systemen testen (Tests) und Takt der Registry-Nachschau. */
  platform?: string;
  pollMs?: number;
  /** Höchstens so lange auf den Installer warten (Standard 30 min, Tests kürzer). */
  maxWaitMs?: number;
}

export class Installer {
  private readonly entries = new Map<SourceId, UpdateEntry>();
  private checkedAt = 0;
  private checking: Promise<void> | null = null;
  private readonly aborts = new Map<SourceId, AbortController>();
  private readonly etags = new Map<string, { etag: string; json: unknown }>();
  readonly platform: string;
  private rateLimitedUntil = 0;
  private lastGood = 0;
  /** Reste, die nicht gelöscht werden konnten (für die Meldung). */
  private leftover: string[] = [];
  readonly arch = process.arch;

  constructor(private readonly d: InstallerDeps) {
    for (const id of Object.keys(SOURCES) as SourceId[]) this.entries.set(id, { id, check: "unknown", latest: null, error: "", phase: "idle", progress: 0, message: "" });
    this.platform = d.platform ?? process.platform;
  }

  /**
   * Letzten Stand der Releases übernehmen (Mac-QA 0.3.1 N1: ohne Netz bleibt ein bekanntes Release sichtbar). Nur zur
   * Anzeige; jede Angabe wird geprüft, und vor dem Installieren wird immer frisch geprüft.
   */
  loadCache(c: Record<string, unknown> | undefined): void {
    if (!c) return;
    // 1.0.1 (Realtest 1.0.0 Befund 3): Programme, die der Speicher nicht kennt (neuer Katalog), prüft der Start sofort
    for (const id of staleSources(c as { catalog?: unknown; checked?: unknown; entries?: Record<string, unknown> })) this.stale.add(id);
    const at = typeof c.at === "number" ? c.at : 0;
    const entries = c.entries && typeof c.entries === "object" ? (c.entries as Record<string, unknown>) : {};
    for (const [id, v] of Object.entries(entries)) {
      const src = sourceById(id);
      if (!src || !v || typeof v !== "object") continue;
      const r = v as Partial<ReleaseInfo>;
      if (typeof r.version !== "string" || !/^[0-9][0-9A-Za-z.-]{0,30}$/.test(r.version)) continue;
      const rel: ReleaseInfo = {
        version: r.version, tag: typeof r.tag === "string" ? r.tag.slice(0, 40) : `v${r.version}`, asset: typeof r.asset === "string" ? r.asset.slice(0, 120) : "",
        url: typeof r.url === "string" && urlBelongsToRepo(r.url, src.repo) ? r.url : null, size: typeof r.size === "number" ? r.size : 0,
        sha256: typeof r.sha256 === "string" && /^[0-9a-f]{64}$/.test(r.sha256) ? r.sha256 : null,
        page: pageFor(r.page, src.repo), notes: typeof r.notes === "string" ? r.notes.slice(0, 4000) : "", prerelease: r.prerelease === true, sumsUrl: null, sigUrl: null,
      };
      Object.assign(this.entries.get(src.id)!, { check: "ok", latest: rel, cached: true });
    }
    if (at) { this.checkedAt = Math.min(at, Date.now() - 3_600_001); this.lastGood = at; } // zählt nicht als frische Prüfung
  }

  /**
   * Für launcher.json: zuletzt bekannte Releases (ohne Prüfsummenlisten), Katalog-Version und welche Programme geprüft
   * sind (auch „noch nicht veröffentlicht“), damit ein neuer Katalog erkannt wird.
   */
  cacheData(): Record<string, unknown> {
    const entries: Record<string, unknown> = {};
    const checked: string[] = [];
    for (const e of this.entries.values()) {
      if (e.latest) entries[e.id] = e.latest;
      if (!this.stale.has(e.id) && (e.latest || e.check === "missing")) checked.push(e.id);
    }
    return { at: this.lastGood || this.checkedAt, catalog: CATALOG_VERSION, checked, entries };
  }

  /** Programme, die der Zwischenspeicher noch nicht kannte und die noch nicht geprüft sind. */
  private readonly stale = new Set<SourceId>();
  staleIds(): SourceId[] { return [...this.stale]; }

  get downloadsDir(): string { return path.join(this.d.dataDir, "downloads"); }

  snapshot(): UpdatesSnapshot {
    return {
      entries: [...this.entries.values()].map(e => ({ ...e })), checkedAt: this.checkedAt, checking: !!this.checking, platform: this.platform, arch: this.arch,
      selfBlocked: this.selfBlocker(), selfResult: this.selfResult, demo: this.demo,
      rateLimitedUntil: this.rateLimitedUntil > Date.now() ? this.rateLimitedUntil : 0, lastGood: this.lastGood,
    };
  }

  // ------------------------------------------------------------------ Demo (--demo/--shot): feste Releases, kein Netz
  demo = false;
  setDemo(list: { id: SourceId; latest: ReleaseInfo | null }[]): void {
    this.demo = true;
    for (const x of list) this.set(x.id, { check: x.latest ? "ok" : "missing", latest: x.latest, error: "" });
    this.checkedAt = Date.now();
  }

  // ------------------------------------------------------------------ Selbst-Update: geht es hier?
  selfResult = "";
  /** Leer, wenn die laufende App sich selbst ersetzen kann; sonst der Grund (für Hinweis + „Seite öffnen“). */
  selfBlocker(): string {
    const bundle = runningAppBundle();
    if (this.platform !== "darwin" || !bundle) return this.d.say("inst.err.selfDev");
    if (bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return this.d.say("inst.self.move");
    try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); } catch { return this.d.say("inst.self.noWrite", { dir: path.dirname(bundle) }); }
    return "";
  }

  get selfLog(): string { return path.join(this.d.dataDir, "self-update.log"); }

  /** Beim Start: Ergebnis des Skripts vom letzten Beenden lesen (Zeile LINKSUITE-RESULT), dann Log entfernen. */
  readSelfResult(): void {
    let text = "";
    try { text = fs.readFileSync(this.selfLog, "utf8").slice(-20_000); } catch { return; }
    const m = [...text.matchAll(/^LINKSUITE-RESULT: (ok|fail)\s*(.*)$/gm)].at(-1);
    if (m && m[1] === "fail") this.selfResult = this.d.say("inst.self.failed", { why: (m[2] ?? "").slice(0, 200) });
    else if (m && m[1] === "ok") this.selfResult = this.d.say("inst.self.ok", { v: (m[2] ?? "").slice(0, 40) });
    try { fs.rmSync(this.selfLog, { force: true }); } catch { /* bleibt */ }
  }

  private set(id: SourceId, p: Partial<UpdateEntry>): void {
    Object.assign(this.entries.get(id)!, p);
    this.d.onChange();
  }

  private ua(): Record<string, string> { return { "User-Agent": `Link-Suite/${this.d.version}` }; }

  // ------------------------------------------------------------------ Prüfen
  /** releases/latest je Repo. `force`: auf Knopfdruck; sonst höchstens 1×/h. */
  check(force = false): Promise<void> {
    if (this.checking) return this.checking;
    // Nicht fällig, aber neue Programme im Katalog: nur diese prüfen (1.0.1)
    const due = force || Date.now() - this.checkedAt >= 3_600_000;
    const only = due ? null : new Set(this.stale);
    if (only && !only.size) return Promise.resolve();
    // Kontingent aufgebraucht: bis zum Zurücksetzen gar nicht fragen (keine Wiederholungs-Schleife)
    if (this.rateLimitedUntil > Date.now()) { this.d.onChange(); return Promise.resolve(); }
    this.checking = (async () => {
      const before = new Map([...this.entries].map(([id, e]) => [id, e.check]));
      // Unbekannte Programme zuerst (falls das Kontingent knapp ist)
      const list = (Object.values(SOURCES) as ReleaseSource[]).filter(s => !only || only.has(s.id))
        .sort((a, b) => Number(this.stale.has(b.id)) - Number(this.stale.has(a.id)));
      for (const src of list) this.entries.get(src.id)!.check = "checking";
      this.d.onChange();
      this.d.log?.("release check", `${only ? "new" : "all"}: ${list.map(s => s.id).join(",")}`);
      let limited = 0, okAny = false;
      // nacheinander: bei 403 „rate limit“ sofort aufhören, statt weitere Anfragen zu verbrauchen
      for (const src of list) {
        if (limited) { this.set(src.id, { check: this.entries.get(src.id)!.latest ? "ok" : "error", error: "rate limit" }); continue; }
        try {
          const json = await this.latestJson(src.repo);
          okAny = true;
          this.stale.delete(src.id);
          if (json === null) { this.set(src.id, { check: "missing", latest: null, error: "", cached: false }); continue; }
          const rel = pickRelease(json, src, this.platform, this.arch);
          this.set(src.id, { check: rel ? "ok" : "error", latest: rel, error: rel ? "" : "bad release", cached: false });
        } catch (err) {
          if (err instanceof RateLimited) {
            limited = err.until;
            this.d.log?.("github rate limit", `until ${new Date(err.until).toISOString()}`);
            const e = this.entries.get(src.id)!;
            this.set(src.id, { check: e.latest ? "ok" : (before.get(src.id) === "missing" ? "missing" : "error"), error: "rate limit" });
            continue;
          }
          this.set(src.id, { check: "error", error: (err as Error).message });
        }
      }
      if (limited) this.rateLimitedUntil = limited;
      if (!only) this.checkedAt = Date.now();
      if (okAny && !limited) { if (!only) this.lastGood = this.checkedAt; this.d.saveCache?.(this.cacheData()); }
      this.d.log?.("release check done", list.map(s => `${s.id}=${this.entries.get(s.id)!.check}`).join(" "));
    })();
    return this.checking.finally(() => { this.checking = null; this.d.onChange(); });
  }

  /** GitHub-API ohne Anmeldung, 15 s; 404 → null („noch keine Veröffentlichung“ / privat). ETag spart Datenmenge. */
  private async latestJson(repo: string): Promise<unknown | null> {
    if (this.d.offline) throw new Error(this.d.say("inst.err.offline"));
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const cached = this.etags.get(repo);
    const res = await fetch(url, {
      headers: { ...this.ua(), Accept: "application/vnd.github+json", ...(cached ? { "If-None-Match": cached.etag } : {}) },
      redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 304 && cached) return cached.json;
    if (res.status === 404) return null;
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      throw new RateLimited(Number.isFinite(reset) && reset > 0 ? Math.min(reset * 1000, Date.now() + 3_600_000) : Date.now() + 3_600_000);
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("too large");
    const json: unknown = JSON.parse(text);
    const etag = res.headers.get("etag");
    if (etag) this.etags.set(repo, { etag, json });
    return json;
  }

  // ------------------------------------------------------------------ Laden
  /** Laden mit eigener Umleitungsprüfung: nur https, nur GitHub-Hosts, höchstens 5 Sprünge; Größe und Obergrenze. */
  private async download(id: SourceId, rel: ReleaseInfo, src: ReleaseSource, dir: string, signal: AbortSignal): Promise<string> {
    if (this.d.offline) throw new Error(this.d.say("inst.err.offline"));
    if (!rel.url || !urlBelongsToRepo(rel.url, src.repo)) throw new Error(this.d.say("inst.err.url"));
    if (!(rel.size > 0 && rel.size <= MAX_DOWNLOAD)) throw new Error(this.d.say("inst.err.size"));
    let url = rel.url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!allowedUrl(url)) throw new Error(this.d.say("inst.err.host", { host: (() => { try { return new URL(url).host; } catch { return "?"; } })() }));
      res = await fetchHeaders(fetch, url, { headers: { ...this.ua(), Accept: "application/octet-stream" }, redirect: "manual" }, HEADER_MS, signal);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("redirect without location");
        url = new URL(loc, url).toString();
        res = null;
        continue;
      }
      break;
    }
    if (!res) throw new Error(this.d.say("inst.err.redirects"));
    if (!res.ok || !res.body) throw new Error(`Download ${res.status}`);
    const announced = Number(res.headers.get("content-length"));
    if (announced && announced !== rel.size) throw new Error(this.d.say("inst.err.size"));
    const file = path.join(dir, path.basename(rel.asset));
    const out = createWriteStream(file, { mode: 0o600 });
    let done = 0, last = 0;
    const reader = res.body.getReader();
    // Leerlauf: 60 s ohne Daten → abbrechen (klare Meldung statt endlosem „Lädt …“). Langsame Leitungen laufen weiter.
    try {
      await readIdle(reader, STALL_MS, async value => {
        done += value.length;
        if (done > rel.size || done > MAX_DOWNLOAD) throw new Error(this.d.say("inst.err.size"));
        if (!out.write(value)) await new Promise<void>(r => out.once("drain", () => r()));
        if (Date.now() - last > 150) { last = Date.now(); this.set(id, { progress: done / rel.size }); }
      }, this.d.say("inst.err.stall"));
    } finally {
      await new Promise<void>(r => out.end(() => r()));
    }
    if (!sizeOk((await fsp.stat(file)).size, rel.size)) throw new Error(this.d.say("inst.err.size"));
    return file;
  }

  /** Kleine Datei (SHA256SUMS, .sig) über denselben Weg; null bei Fehlern. */
  private async small(url: string | null, repo: string): Promise<Buffer | null> {
    if (!url || !urlBelongsToRepo(url, repo)) return null;
    try {
      let u = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (!allowedUrl(u)) return null;
        const r = await fetch(u, { headers: this.ua(), redirect: "manual", signal: AbortSignal.timeout(15_000) }); // kleine Datei: Gesamtzeit ok
        if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) return null; u = new URL(loc, u).toString(); continue; }
        if (!r.ok) return null;
        const b = Buffer.from(await r.arrayBuffer());
        return b.length <= 64_000 ? b : null;
      }
    } catch { /* keine Liste */ }
    return null;
  }

  cancel(id: SourceId): void { this.aborts.get(id)?.abort(); }

  // ------------------------------------------------------------------ Installieren
  /** Ganzer Ablauf: laden, prüfen, einsetzen. Das Ergebnis steht im Eintrag (phase/message). */
  async install(id: SourceId): Promise<void> {
    const e = this.entries.get(id)!;
    const src = SOURCES[id];
    if (e.cached && !this.demo) await this.check(true); // Zwischenspeicher nie zum Installieren nutzen
    const rel = e.latest;
    if (!rel || e.cached || this.aborts.has(id)) return;
    if (this.demo) { this.set(id, { phase: "done", message: this.d.say("inst.demo", { name: src.name, v: rel.version }) }); return; }
    const ctl = new AbortController();
    this.aborts.set(id, ctl);
    await fsp.mkdir(this.downloadsDir, { recursive: true, mode: 0o700 });
    const dir = await fsp.mkdtemp(path.join(this.downloadsDir, "link-suite-dl-"));
    let keepDir = false;
    try {
      if (!rel.sha256) throw new Error(this.d.say("inst.err.nodigest"));
      this.set(id, { phase: "download", progress: 0, message: "" });
      const file = await this.download(id, rel, src, dir, ctl.signal);
      this.set(id, { phase: "verify", progress: 1 });
      const hash = await sha256File(file);
      const [sums, sig] = rel.sumsUrl && rel.sigUrl ? await Promise.all([this.small(rel.sumsUrl, src.repo), this.small(rel.sigUrl, src.repo)]) : [null, null];
      const sigRes = checkSignature(sums, sig, SUITE_PUBLIC_KEYS, rel.asset, hash);
      const v = installVerdict({ expected: rel.sha256, actual: hash, sizeOk: sizeOk((await fsp.stat(file)).size, rel.size), sig: sigRes, require: REQUIRE_SIGNATURE });
      if (!v.ok) throw new Error(this.d.say(`inst.err.${v.reason}`));
      this.set(id, { phase: "install" });
      const way = installWay(id, rel.asset, this.platform);
      let msg = "";
      if (way === "self-dmg") { msg = await this.selfUpdate(file, rel, dir); keepDir = true; }
      else if (way === "dmg") msg = await this.installDmg(id, file, rel);
      else if (way === "ljl-zip") msg = await this.installLjl(file, rel, dir);
      else if (way === "exe") {
        // Installer sichtbar über die Shell; die Karte zeigt „Installer geöffnet …“ (mit „Zurücksetzen“), bis er endet
        // oder die neue Version in der Registry steht. Danach AKTUELL, ABGEBROCHEN oder FEHLER; der Download wird gelöscht.
        const r = await this.awaitWindowsSetup(id, file, rel.version, ctl.signal);
        if (r.phase !== "done") {
          this.d.log?.("installer result", `${id}: ${r.phase}`);
          this.set(id, { phase: r.phase, message: r.message });
          return;
        }
        msg = r.message;
      }
      else throw new Error("unsupported");
      if (this.leftover.length) { msg += " " + this.d.say("inst.leftover", { path: this.leftover.join(", ") }); this.leftover = []; }
      this.set(id, { phase: "done", message: msg });
    } catch (err) {
      const aborted = ctl.signal.aborted;
      this.d.log?.(aborted ? "install cancelled" : "install failed", `${id}: ${(err as Error).message}`);
      this.set(id, { phase: aborted ? "cancelled" : "failed", message: aborted ? this.d.say("inst.cancelled") : (err as Error).message });
    } finally {
      this.aborts.delete(id);
      // Download-Ordner sofort aufräumen; hält Windows die .exe noch fest, später erneut (und beim nächsten Start)
      if (!keepDir) await rmOwn(dir).catch(() => {
        for (const ms of [30_000, 120_000, 600_000]) setTimeout(() => { void rmOwn(dir).catch(e => this.d.log?.("cleanup failed", (e as Error).message)); }, ms).unref();
      });
    }
  }

  /** Ziel: LINKSUITE_INSTALL_DIR (nur QA) > Ordner der alten App > /Applications (beschreibbar) > ~/Applications. */
  private async targetDir(id: SourceId): Promise<string> {
    const forced = process.env.LINKSUITE_INSTALL_DIR;
    if (forced && path.isAbsolute(forced)) { await fsp.mkdir(forced, { recursive: true }); return forced; }
    const old = this.d.installedPath(id);
    if (old && !old.startsWith("/Volumes/")) return path.dirname(old);
    try { await fsp.access("/Applications", fs.constants.W_OK); return "/Applications"; } catch { /* kein Admin */ }
    const user = path.join(os.homedir(), "Applications");
    await fsp.mkdir(user, { recursive: true });
    return user;
  }

  /** Image einhängen, genau eine App erwarten, Inhalt prüfen; `use` bekommt den Pfad der App. Immer aushängen. */
  private async withDmgApp<T>(file: string, rel: ReleaseInfo, src: ReleaseSource, use: (app: string) => Promise<T>): Promise<T> {
    const mp = await fsp.mkdtemp(path.join(path.dirname(file), "mnt-"));
    const at = await run(HDIUTIL, ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mp, file]);
    if (!at.ok) throw new Error(this.d.say("inst.err.mount"));
    try {
      const apps = (await fsp.readdir(mp)).filter(n => n.endsWith(".app") && !n.startsWith("."));
      if (apps.length !== 1) throw new Error(this.d.say("inst.err.oneApp", { n: apps.length }));
      const appPath = path.join(mp, apps[0]!);
      const st = await fsp.lstat(appPath);
      if (!st.isDirectory()) throw new Error(this.d.say("inst.err.oneApp", { n: 0 }));
      const info = await readInfo(appPath);
      const m = info ? bundleMatches(info, src, apps[0]!, rel.version) : { ok: false, why: "Info.plist" };
      if (!m.ok) throw new Error(this.d.say("inst.err.content", { why: m.why ?? "?" }));
      return await use(appPath);
    } finally {
      const de = await run(HDIUTIL, ["detach", mp, "-quiet"], 30_000);
      if (!de.ok) await run(HDIUTIL, ["detach", mp, "-force", "-quiet"], 30_000);
      await fsp.rmdir(mp).catch(() => {});
    }
  }

  /** Läuft die alte App: bitten, sie zu beenden (nie selbst beenden). */
  private async waitQuit(id: SourceId, name: string): Promise<void> {
    const old = this.d.installedPath(id);
    while (old && (await this.d.isRunning(old))) {
      if (!(await this.d.askQuit(name))) throw new Error(this.d.say("inst.err.running", { name }));
    }
  }

  /**
   * Ersetzen ohne Lücke: ditto nach <Ziel>/.<Name>.neu (gleiches Volume), prüfen, alte App → .<alt>.alt, neue an ihren
   * Platz, alte löschen. Bei Fehler zurück. LJ Link: LJ-Link-PRO.app wird durch den Namen aus dem Image ersetzt.
   */
  private async place(srcApp: string, targetDir: string, oldApp: string | null, check: (p: string) => Promise<boolean>): Promise<string> {
    // Nur macOS: unter Windows ersetzt immer der NSIS-Installer selbst (auch beim Selbst-Update)
    if (this.platform === "win32") throw new Error("place() is macOS only");
    const name = path.basename(srcApp);
    const dest = path.join(targetDir, name);
    const staging = path.join(targetDir, `.${name}.neu`);
    await rmOwn(staging);
    const cp = await run(DITTO, [srcApp, staging], 600_000);
    if (!cp.ok) { await rmOwn(staging).catch(e => this.d.log?.("cleanup failed", (e as Error).message)); throw new Error(this.d.say("inst.err.copy")); }
    if (!(await check(staging))) { await rmOwn(staging).catch(e => this.d.log?.("cleanup failed", (e as Error).message)); throw new Error(this.d.say("inst.err.content", { why: "copy" })); }
    // Alte App(s) im Ziel: gleicher Name und ggf. alter Name (LJ-Link-PRO.app)
    const olds = [...new Set([dest, ...(oldApp && path.dirname(oldApp) === targetDir ? [oldApp] : [])])].filter(p => fs.existsSync(p));
    const moved: { from: string; to: string }[] = [];
    try {
      for (const o of olds) {
        const alt = path.join(targetDir, `.${path.basename(o)}.alt`);
        await rmOwn(alt);
        await fsp.rename(o, alt);
        moved.push({ from: o, to: alt });
      }
      await fsp.rename(staging, dest);
    } catch (err) {
      for (const m of moved.reverse()) await fsp.rename(m.to, m.from).catch(() => {});
      await rmOwn(staging).catch(e => this.d.log?.("cleanup failed", (e as Error).message));
      throw new Error(this.d.say("inst.err.replace", { msg: (err as Error).message }));
    }
    // Alte Version entfernen; klappt das nicht, ins Log und in die Meldung (nie still schlucken)
    for (const m of moved) {
      try { await rmOwn(m.to); } catch (err) { this.d.log?.("cleanup failed", (err as Error).message); this.leftover.push(m.to); }
    }
    return dest;
  }

  private async installDmg(id: SourceId, file: string, rel: ReleaseInfo): Promise<string> {
    if (this.platform !== "darwin") throw new Error("macOS only");
    const src = SOURCES[id];
    await this.waitQuit(id, src.name);
    const target = await this.targetDir(id);
    const old = this.d.installedPath(id);
    const dest = await this.withDmgApp(file, rel, src, app => this.place(app, target, old, async p => {
      const i = await readInfo(p);
      return !!i && bundleMatches(i, src, path.basename(app), rel.version).ok;
    }));
    return this.d.say("inst.done", { name: src.name, v: rel.version, path: dest });
  }

  // ------------------------------------------------------------------ LJL Link (Zip, nur macOS, für den Stick)
  private async installLjl(file: string, rel: ReleaseInfo, dir: string): Promise<string> {
    if (this.platform !== "darwin") throw new Error("macOS only");
    const src = SOURCES.ljl;
    const list = await run(ZIPINFO, ["-1", file], 30_000);
    if (!list.ok) throw new Error(this.d.say("inst.err.zip"));
    const names = list.out.split("\n").filter(Boolean);
    if (!names.length || unsafeZipEntries(names).length) throw new Error(this.d.say("inst.err.zip"));
    const out = await fsp.mkdtemp(path.join(dir, "zip-"));
    const x = await run(DITTO, ["-x", "-k", file, out], 300_000);
    if (!x.ok) throw new Error(this.d.say("inst.err.zip"));
    const real = await fsp.realpath(out);
    await this.checkTree(real);
    const found: string[] = [];
    for (const n of await fsp.readdir(real)) {
      if (n === src.appName) found.push(path.join(real, n));
      else if (!n.startsWith(".") && n !== "__MACOSX" && (await fsp.lstat(path.join(real, n))).isDirectory()) {
        for (const m of await fsp.readdir(path.join(real, n))) if (m === src.appName) found.push(path.join(real, n, m));
      }
    }
    if (found.length !== 1) throw new Error(this.d.say("inst.err.oneApp", { n: found.length }));
    const app = found[0]!;
    const info = await readInfo(app);
    const m = info ? bundleMatches(info, src, path.basename(app), rel.version) : { ok: false, why: "Info.plist" };
    if (!m.ok) throw new Error(this.d.say("inst.err.content", { why: m.why ?? "?" }));
    let target = process.env.LINKSUITE_INSTALL_DIR && path.isAbsolute(process.env.LINKSUITE_INSTALL_DIR) ? process.env.LINKSUITE_INSTALL_DIR : null;
    if (!target) target = await this.d.pickLjlTarget(await this.sticks());
    if (!target) throw new Error(this.d.say("inst.cancelled"));
    await fsp.mkdir(target, { recursive: true });
    const dest = await this.place(app, target, null, async p => !!(await readInfo(p)));
    await fsp.writeFile(path.join(target, "LIESMICH.txt"), this.d.say("ljl.readme", { v: rel.version }));
    return this.d.say("inst.done", { name: src.name, v: rel.version, path: dest });
  }

  /** Nach dem Entpacken: kein Symlink zeigt aus dem Ordner hinaus (Zip-Slip über Links). */
  private async checkTree(root: string): Promise<void> {
    let count = 0;
    const walk = async (d: string): Promise<void> => {
      for (const ent of await fsp.readdir(d, { withFileTypes: true })) {
        if (++count > 20_000) throw new Error(this.d.say("inst.err.zip"));
        const p = path.join(d, ent.name);
        if (ent.isSymbolicLink()) {
          const target = await fsp.readlink(p);
          if (!symlinkInside(root, d, target, path.join, path.resolve)) throw new Error(this.d.say("inst.err.zip"));
        } else if (ent.isDirectory()) await walk(p);
      }
    };
    await walk(root);
  }

  /** Wechseldatenträger unter /Volumes (diskutil, nur lesen). Nie die Systemplatte. */
  async sticks(): Promise<{ name: string; path: string }[]> {
    const out: { name: string; path: string }[] = [];
    let vols: string[] = [];
    try { vols = await fsp.readdir("/Volumes"); } catch { return out; }
    for (const v of vols.slice(0, 16)) {
      const p = path.join("/Volumes", v);
      const r = await run(DISKUTIL, ["info", "-plist", p], 10_000);
      if (!r.ok) continue;
      const tmp = path.join(os.tmpdir(), `link-suite-du-${process.pid}-${out.length}.plist`);
      try {
        await fsp.writeFile(tmp, r.out);
        const j = await run(PLUTIL, ["-convert", "json", "-o", "-", tmp], 10_000);
        const o = JSON.parse(j.out) as Record<string, unknown>;
        const removable = o.RemovableMedia === true || o.Ejectable === true || o.Internal === false;
        if (removable && o.MountPoint === p && p !== "/" && o.WritableVolume !== false) out.push({ name: v, path: p });
      } catch { /* nicht lesbar */ } finally { await fsp.rm(tmp, { force: true }); }
    }
    return out;
  }

  // ------------------------------------------------------------------ Windows (Gerüst, nicht live geprüft)
  /**
   * Windows: Installer über ShellExecute öffnen (QA Win B1). `spawn` (CreateProcess) startet Installer, die
   * Administratorrechte brauchen (LJ Link: MSI pro Maschine), nicht und liefert EACCES; ShellExecute zeigt die UAC-Frage.
   */
  private async runWindowsInstaller(id: SourceId, file: string): Promise<void> {
    if (this.platform !== "win32") throw new Error("Windows only");
    let err = "";
    try {
      err = this.d.openFile ? await this.d.openFile(file) : await new Promise<string>(resolve => {
        const c = spawn(file, [], { detached: true, stdio: "ignore", windowsHide: false });
        c.once("error", e => resolve(e.message));
        c.once("spawn", () => { c.unref(); resolve(""); });
      });
    } catch (e) { err = (e as Error).message; }
    if (err) {
      this.d.log?.("installer open failed", `${id}: ${err}`);
      throw new Error(this.d.say("inst.err.winOpen", { msg: err }));
    }
  }

  /**
   * Windows (1.0.1, Realtest 1.0.0 Befund 1): Installer öffnen und warten, bis er endet oder die neue Version in der
   * Registry steht. Endet er ohne Installation, noch zweimal kurz nachsehen, dann ABGEBROCHEN bzw. FEHLER (Exit-Code).
   * „Zurücksetzen“ (signal) beendet nur das Warten; der fremde Installer bleibt offen und wird nicht angefasst.
   * Startet der Installer sich unter demselben Namen neu (z. B. mit Rechten), wird per tasklist weiter gewartet.
   */
  async awaitWindowsSetup(id: SourceId, file: string, version: string, signal: AbortSignal): Promise<{ phase: "done" | "cancelled" | "failed"; message: string }> {
    if (this.platform !== "win32") throw new Error("Windows only");
    const name = SOURCES[id].name;
    const poll = this.d.pollMs ?? 4000;
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    const never = new Promise<void>(() => {});
    const current = async (): Promise<string | null> => {
      const v = this.d.installedVersion ? await this.d.installedVersion(id).catch(() => null) : null;
      return v && !isNewer(version, v) ? v : null;
    };
    const done = (v: string) => ({ phase: "done" as const, message: this.d.say("inst.done", { name, v, path: "" }).replace(/:\s*$/, "") });
    let exit: SetupExit | null = null;
    let ended: Promise<void> = never;
    let viaTasklist = false;
    let seen = false;
    const fallback = async () => { viaTasklist = true; ended = never; exit = null; await this.runWindowsInstaller(id, file); };
    if (this.d.runInstaller) {
      ended = this.d.runInstaller(file).then(r => { exit = r; }, (e: unknown) => { exit = { code: null, error: (e as Error).message, pid: null, noShell: true }; });
    } else await fallback();
    this.set(id, { phase: "waiting", progress: 1, message: "" });
    const aborted = new Promise<void>(r => { if (signal.aborted) r(); else signal.addEventListener("abort", () => r(), { once: true }); });
    const until = Date.now() + (this.d.maxWaitMs ?? 30 * 60_000);
    for (;;) {
      await Promise.race([sleep(poll), ended, aborted]);
      const v = await current();
      if (v) return done(v);
      if (signal.aborted) { this.d.log?.("installer wait reset", id); return { phase: "cancelled", message: this.d.say("inst.win.reset", { name }) }; }
      if (Date.now() > until) return { phase: "cancelled", message: this.d.say("inst.winTimeout") };
      // Ersatzweg ohne PowerShell bzw. Neustart unter demselben Namen: Ende = der Name verschwindet aus tasklist
      if (viaTasklist) {
        if (!this.d.imageRunning) continue;
        const running = await this.d.imageRunning(file).catch(() => true);
        if (running) { seen = true; continue; }
        if (!seen) continue; // UAC-Frage offen oder noch nicht gestartet
        exit = { code: null, error: "", pid: null };
      }
      const x = exit as SetupExit | null;
      if (!x) continue;
      if (x.noShell) {
        this.d.log?.("installer powershell missing", [x.error, x.diag].filter(Boolean).join(" · "));
        // Sicherheitsnetz: läuft der Installer doch schon (Ausgabe verloren), nicht ein zweites Mal öffnen
        if (this.d.imageRunning && await this.d.imageRunning(file).catch(() => false)) { viaTasklist = true; seen = true; exit = null; ended = never; continue; }
        await fallback();
        continue;
      }
      if (x.follow) { this.d.log?.("installer follow", id); viaTasklist = true; seen = true; exit = null; ended = never; continue; }
      ended = never;
      this.d.log?.("installer ended", `${id}: code ${x.code ?? "?"}${x.error ? " " + x.error : ""}${x.diag ? " · " + x.diag : ""}`);
      // Neustart unter demselben Namen (nicht bei Abbruch oder Fehler): weiter warten, bis auch dieser endet
      if (!viaTasklist && !x.error && x.code !== 1223 && this.d.imageRunning && await this.d.imageRunning(file).catch(() => false)) {
        viaTasklist = true; seen = true; exit = null; continue;
      }
      // Registry noch zweimal kurz nachsehen (der Eintrag kommt manchmal erst nach dem Ende)
      for (let i = 0; i < 2; i++) {
        await sleep(Math.min(poll, 1500));
        const w = await current();
        if (w) return done(w);
      }
      if (x.error) return { phase: "failed", message: this.d.say("inst.err.winOpen", { msg: x.error }) };
      return setupVerdict(x, false) === "failed"
        ? { phase: "failed", message: this.d.say("inst.win.failed", { name, code: String(x.code) }) }
        : { phase: "cancelled", message: this.d.say("inst.win.closed", { name }) };
    }
  }

  // ------------------------------------------------------------------ Selbst-Update
  /**
   * Wie VJ-Link: Image vorher prüfen (genau eine App, Kennung, Version), dann ein Skript, das auf das Ende des Launchers
   * wartet und Link-Suite.app über .neu/.alt ersetzt; bei Fehler zurück. Gestartet wird es erst beim Beenden.
   */
  private async selfUpdate(file: string, rel: ReleaseInfo, dir: string): Promise<string> {
    const blocked = this.selfBlocker();
    const bundle = runningAppBundle();
    if (blocked || !bundle) throw new Error(blocked || this.d.say("inst.err.selfDev"));
    await this.withDmgApp(file, rel, SOURCES.suite, async () => true);
    const script = path.join(dir, "update.sh");
    await fsp.writeFile(script, SELF_UPDATE_SH, { mode: 0o700 });
    this.pendingSelf = { script, dmg: file, app: bundle, version: rel.version };
    return this.d.say("inst.selfReady", { v: rel.version });
  }

  pendingSelf: { script: string; dmg: string; app: string; version: string } | null = null;

  /** Beim Beenden: Skript starten (es wartet auf diese PID). */
  runPendingSelfUpdate(): boolean {
    const p = this.pendingSelf;
    if (!p) return false;
    // Log im Datenordner: beim nächsten Start liest readSelfResult das Ergebnis und zeigt Fehler als Hinweis
    const log = fs.openSync(this.selfLog, "w");
    spawn("/bin/bash", [p.script, String(process.pid), p.dmg, p.app, SOURCES.suite.bundleIds[0]!, p.version], { detached: true, stdio: ["ignore", log, log] }).unref();
    return true;
  }

  /**
   * Download-Ordner leeren (beim Start und Beenden), außer ein Selbst-Update wartet noch darauf. Windows-Nachtest 1.0.1:
   * Eine gesperrte .exe (offene UAC-Abfrage) ließ sonst auch alle anderen Reste liegen. Darum Eintrag für Eintrag;
   * Fehler einzeln überspringen und loggen. Mit `retry` werden genau diese Reste später erneut versucht (nie Ordner,
   * die erst danach entstehen, z. B. ein laufender Download).
   */
  cleanupSync(retry = false): string[] {
    if (this.pendingSelf) return [];
    const left = cleanDir(this.downloadsDir, (f, why) => this.d.log?.("cleanup skipped", `${path.basename(path.dirname(f))}/${path.basename(f)}: ${why}`));
    if (retry && left.length) {
      for (const ms of [30_000, 120_000, 600_000]) setTimeout(() => {
        for (const f of left) if (fs.existsSync(f)) cleanDir(f, () => {}, true);
      }, ms).unref();
    }
    return left;
  }
}

/**
 * Inhalt von `dir` löschen, Eintrag für Eintrag (bei `self` auch `dir` selbst). Scheitert ein Ordner, werden seine
 * Einträge einzeln versucht. Gibt zurück, was liegen blieb (oberste Ebene); `skip` meldet jede gesperrte Datei.
 * Unter Windows ohne asar-Sonderbehandlung (process.noAsar), damit nichts als Archiv gelesen wird.
 */
export function cleanDir(dir: string, skip: (file: string, why: string) => void, self = false, rm: (p: string) => void = p => fs.rmSync(p, { recursive: true, force: true })): string[] {
  const prev = process.noAsar;
  process.noAsar = true;
  try {
    const one = (p: string): boolean => {
      try { rm(p); return true; } catch (e) {
        let st: fs.Stats | null = null;
        try { st = fs.lstatSync(p); } catch { return true; } // schon weg
        if (st.isDirectory()) {
          let kids: string[] = [];
          try { kids = fs.readdirSync(p); } catch { /* nicht lesbar */ }
          let all = true;
          for (const k of kids) if (!one(path.join(p, k))) all = false;
          if (all) { try { fs.rmdirSync(p); return true; } catch { /* noch belegt */ } }
          return false;
        }
        skip(p, (e as NodeJS.ErrnoException).code ?? (e as Error).message);
        return false;
      }
    };
    if (self) return one(dir) ? [] : [dir];
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { return []; }
    return names.map(n => path.join(dir, n)).filter(p => !one(p));
  } finally { process.noAsar = prev; }
}

/** Der .app-Ordner, aus dem Link-Suite läuft (nur in der fertigen App). (VJ-Link runningAppBundle) */
export function runningAppBundle(): string | null {
  let p = path.dirname(process.execPath);
  for (let i = 0; i < 3; i++) {
    if (p.endsWith(".app")) return p.includes("/node_modules/") ? null : p;
    p = path.dirname(p);
  }
  return null;
}

// Argumente: PID, DMG, APP, Kennung, Version. Prüft im Image Kennung und Version erneut, ersetzt über .neu/.alt.
const SELF_UPDATE_SH = `#!/bin/bash
# Link-Suite: ersetzt die App durch die neue Version, sobald das laufende Programm beendet ist (Vorbild VJ-Link).
PID="$1"; DMG="$2"; APP="$3"; ID="$4"; VER="$5"
for i in $(seq 1 240); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
MNT="$(mktemp -d)"
if ! /usr/bin/hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null; then rmdir "$MNT"; echo "LINKSUITE-RESULT: fail mount"; exit 1; fi
SRC="$MNT/Link-Suite.app"
GOT_ID="$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$SRC/Contents/Info.plist" 2>/dev/null)"
GOT_VER="$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$SRC/Contents/Info.plist" 2>/dev/null)"
if [ "$GOT_ID" != "$ID" ] || [ "$GOT_VER" != "$VER" ]; then /usr/bin/hdiutil detach "$MNT" -quiet; rmdir "$MNT"; echo "LINKSUITE-RESULT: fail content"; exit 2; fi
DIR="$(dirname "$APP")"; NEU="$DIR/.Link-Suite.app.neu"; ALT="$DIR/.Link-Suite.app.alt"
rm -rf "$NEU" "$ALT"
if /usr/bin/ditto "$SRC" "$NEU" && mv "$APP" "$ALT" && mv "$NEU" "$APP"; then rm -rf "$ALT"; RESULT="ok $VER"; else rm -rf "$NEU"; [ -d "$ALT" ] && [ ! -d "$APP" ] && mv "$ALT" "$APP"; RESULT="fail replace"; fi
/usr/bin/hdiutil detach "$MNT" -quiet
rmdir "$MNT" 2>/dev/null
D="$(dirname "$DMG")"; case "$(basename "$D")" in link-suite-dl-*) rm -rf "$D";; esac
echo "LINKSUITE-RESULT: $RESULT"
open "$APP"
`;

