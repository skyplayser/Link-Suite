// Suite-Diagnose v1 – Schreiber für Electron/Node-Programme der Link-Suite.
// Herkunft: Suite-Launcher/design/diagnose/diagnose-writer.ts (EPL-2.0). Spezifikation: SPEC.md daneben.
// Kopieren, nicht ändern; Fragen an die Sitzung „Suite-Launcher“.
//
// Einbau (Hauptprozess):
//   import { startDiagnose } from "./diagnose-writer";
//   const diag = startDiagnose({ id: "vj", app: "VJ-Link", version: app.getVersion() });
//   diag.report({ summary: { "Ausgänge": "2" }, checks: [{ name: "Art-Net", ok: true, detail: "…" }] });
//   diag.error("Renderer: WebGL context lost");
//   app.on("will-quit", () => diag.stop());
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DiagCheck { name: string; ok: boolean; detail?: string }
export interface DiagState { summary?: Record<string, string>; checks?: DiagCheck[] }

const MAX_BYTES = 16 * 1024;
const home = os.homedir();

/** Datenordner der Link-Suite (dort liegt auch suite.json). */
export function suiteDataDir(): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Link-Suite");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Link-Suite");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Link-Suite");
}

/** Benutzerordner als ~, Zeilenumbrüche raus, Länge begrenzen. */
function clean(s: unknown, max: number): string {
  let t = String(s ?? "");
  if (home && home.length > 1) t = t.split(home).join("~");
  return t.replace(/[\r\n\t]+/g, " ").slice(0, max);
}

function osName(): string {
  const v = typeof process.getSystemVersion === "function" ? process.getSystemVersion() : os.release();
  if (process.platform === "darwin") return `macOS ${v}`;
  if (process.platform === "win32") { const b = Number(v.split(".")[2]); return `Windows ${b >= 22000 ? 11 : 10} (${b || v})`; }
  return `${process.platform} ${v}`;
}

export function startDiagnose(o: { id: string; app: string; version: string; dir?: string }) {
  const dir = path.join(o.dir ?? suiteDataDir(), "diagnose");
  const file = path.join(dir, `${o.id}.json`);
  let state: DiagState = {};
  const errors: { at: string; text: string }[] = [];
  let lastWrite = 0;
  let pending: NodeJS.Timeout | null = null;
  let running = true;

  function write(): void {
    pending = null;
    lastWrite = Date.now();
    const summary: Record<string, string> = {};
    for (const [k, v] of Object.entries(state.summary ?? {}).slice(0, 20)) summary[clean(k, 60)] = clean(v, 200);
    const doc = {
      suite: "diagnose", v: 1, id: o.id, app: o.app, version: o.version, at: new Date().toISOString(), running,
      os: osName(), arch: process.arch, summary,
      checks: (state.checks ?? []).slice(0, 20).map(c => ({ name: clean(c.name, 60), ok: !!c.ok, detail: clean(c.detail, 200) })),
      errors: errors.slice(-20),
    };
    let text = JSON.stringify(doc, null, 1);
    while (Buffer.byteLength(text) > MAX_BYTES && doc.errors.length) { doc.errors.shift(); text = JSON.stringify(doc, null, 1); }
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + ".tmp", text);
      fs.renameSync(file + ".tmp", file);
    } catch { /* ohne Diagnose weiter – nie die Show stören */ }
  }
  /** Schreiben, aber höchstens 1×/s. */
  function soon(): void {
    if (pending) return;
    pending = setTimeout(write, Math.max(0, 1000 - (Date.now() - lastWrite)));
  }
  const tick = setInterval(() => { if (Date.now() - lastWrite >= 30_000) soon(); }, 5_000);
  tick.unref?.();
  soon();

  return {
    /** Zustand ersetzen (summary/checks); wird gebündelt geschrieben. */
    report(s: DiagState): void { state = { ...state, ...s }; soon(); },
    /** Fehler oder Warnung merken (die letzten 20). */
    error(text: string): void { errors.push({ at: new Date().toISOString(), text: clean(text, 300) }); if (errors.length > 20) errors.shift(); soon(); },
    /** Beim Beenden: running=false sofort schreiben. */
    stop(): void { running = false; clearInterval(tick); if (pending) clearTimeout(pending); write(); },
  };
}
