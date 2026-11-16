// Einstellungen auf der Platte: suite.json (für die ganze Suite) und launcher.json (nur Launcher), beide im
// Datenordner ~/Library/Application Support/Link-Suite/ bzw. %APPDATA%\Link-Suite\.
import fs from "node:fs";
import path from "node:path";
import {
  applySuitePatch, parseLauncherJson, parseSuiteJson, serializeLauncher, serializeSuite,
  type LauncherSettings, type SuiteSettings,
} from "../core/settings";

function readText(file: string): string | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 256 * 1024) return null;
    return fs.readFileSync(file, "utf8");
  } catch { return null; }
}

/** Atomar schreiben (tmp + rename), damit Programme, die gerade lesen, nie eine halbe Datei sehen. */
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o644 });
  fs.renameSync(tmp, file);
}

export class Store {
  suite: SuiteSettings;
  launcher: LauncherSettings;
  private extra: Record<string, unknown>;
  /** suite.json hat eine neuere Hauptversion: nur lesen. */
  readonly suiteReadOnly: boolean;
  /** Nichts auf die Platte schreiben (Screenshot-Lauf mit Vorgaben aus der Befehlszeile). */
  memoryOnly = false;

  constructor(readonly dir: string) {
    const s = parseSuiteJson(readText(this.suiteFile));
    this.suite = s.settings; this.extra = s.extra; this.suiteReadOnly = s.readOnly;
    this.launcher = parseLauncherJson(readText(this.launcherFile));
  }

  get suiteFile(): string { return path.join(this.dir, "suite.json"); }
  get launcherFile(): string { return path.join(this.dir, "launcher.json"); }

  setSuite(patch: unknown): SuiteSettings {
    this.suite = applySuitePatch(this.suite, patch);
    if (!this.memoryOnly && !this.suiteReadOnly) {
      try { writeAtomic(this.suiteFile, serializeSuite(this.suite, this.extra, new Date())); } catch (e) { console.error("suite.json:", (e as Error).message); }
    }
    return this.suite;
  }

  setLauncher(change: (s: LauncherSettings) => void): LauncherSettings {
    change(this.launcher);
    if (!this.memoryOnly) {
      try { writeAtomic(this.launcherFile, serializeLauncher(this.launcher)); } catch (e) { console.error("launcher.json:", (e as Error).message); }
    }
    return this.launcher;
  }
}
