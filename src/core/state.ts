// Was Hauptprozess und Oberfläche austauschen (nur Daten, keine Funktionen).
import type { ProgramId } from "./catalog";
import type { DevAssess } from "./devproject";
import type { LogLine } from "./ringlog";
import type { Route, SuiteSettings } from "./settings";
import type { NetEntry } from "./suitenet";

export interface AppFound {
  path: string;
  version: string;
  bundleId: string;
  /** Weitere Kopien (z. B. alte in Downloads), nur zur Anzeige. */
  others: string[];
  running: boolean;
  /** Auf einem Wechseldatenträger (LJL Link vom Stick). */
  onVolume: boolean;
}

export type RunState = "running" | "stopping" | "exited" | "stopped" | "failed";

export interface RunInfo {
  id: ProgramId;
  pid: number;
  /** direct = Electron des Projekts mit dem Ordner; script = npm run dev / npm start (nach Rückfrage). */
  mode: "direct" | "script";
  /** Anzeigebefehl (z. B. „electron .“ oder „npm run dev“). */
  cmd: string;
  dir: string;
  startedAt: number;
  endedAt: number;
  state: RunState;
  code: number | null;
  signal: string | null;
  /** Letzte Zeile der Ausgabe (für „Start fehlgeschlagen“). */
  lastLine: string;
}

export interface DevInfo extends DevAssess {
  /** Gespeicherter Ordner („~/VJ-Link“) und ob er vom Wert ab Werk abweicht. */
  stored: string;
  custom: boolean;
  /** Electron dieses Projekts läuft, aber nicht vom Launcher gestartet (Terminal). */
  externalPids: number[];
}

export interface ProgramState {
  id: ProgramId;
  app: AppFound | null;
  dev: DevInfo | null;
  run: RunInfo | null;
  /** Startwege, die es gibt, und der gewählte (gemerkt je Programm). */
  routes: Route[];
  route: Route | null;
}

export interface Snapshot {
  programs: ProgramState[];
  scannedAt: number;
  platform: string;
  demo: boolean;
  version: string;
  /** Erster vollständiger Suchlauf fertig (vorher: Stand aus dem Zwischenspeicher). */
  fullScan: boolean;
}

export interface NetSnapshot {
  on: boolean;
  error: string;
  port: number;
  group: string;
  /** Eigene IPv4-Adressen mit Adaptername. */
  adapters: { name: string; ip: string }[];
  entries: NetEntry[];
  hostname: string;
}

export interface SettingsSnapshot {
  suite: SuiteSettings;
  suiteReadOnly: boolean;
  background: boolean;
  /** Entwicklerordner mit Befund (Startbarkeit, erste Lücke), damit die Einstellung gleich zeigt, ob der Ordner passt. */
  devDirs: { id: ProgramId; stored: string; abs: string; custom: boolean; status: string; missing: string | null }[];
  /** Systemsprache (für „System“). */
  locale: string;
  suiteFile: string;
  checkUpdates: boolean;
  notify: boolean;
  /** Willkommen-Karte schon gesehen. */
  welcomed: boolean;
  /** Infobox zum Hilfe-Assistenten ausgeblendet (1.0.7). */
  helpHintHidden: boolean;
  /** Entwickleransicht an (gespeichert oder ab Werk: es gibt einen Entwicklerordner). */
  devView: boolean;
  platform: string;
}

export interface LogBatch { id: ProgramId; lines: LogLine[]; reset?: boolean }

/** Antwort auf launch(): ok, abgebrochen (Rückfrage im Hauptprozess), Fehler oder Hinweis zur Einzelinstanz. */
export type LaunchResult =
  | { ok: true; demo?: boolean }
  | { ok: false; error: string; detail?: string }
  | { ok: false; cancelled: true }
  | { ok: false; ask: "single"; other: "app" | "dev" };

/** Vorgaben für einen Screenshot-Lauf (--shot). */
export interface ShotSpec { tab: string; theme: "light" | "dark"; lang: "de" | "en"; open: string; run: string; chat: boolean; menu: string; intro: number; about: boolean }
