// Die Brücke aus dem Preload (window.suite), mit Typen.
import type { ChatState } from "../core/suitechat";
import type { LogLine } from "../core/ringlog";
import type { UpdatesSnapshot } from "../main/installer";
import type { LaunchResult, LogBatch, NetSnapshot, SettingsSnapshot, ShotSpec, Snapshot } from "../core/state";

export interface Info { version: string; demo: boolean; platform: string; locale: string; shot: ShotSpec | null }

export interface Bridge {
  info(): Promise<Info>;
  state(): Promise<Snapshot>;
  scan(): Promise<Snapshot>;
  launch(id: string, route: string, mode: "auto" | "script", force: boolean): Promise<LaunchResult>;
  stop(id: string): Promise<Snapshot>;
  reveal(id: string, route: string): Promise<boolean>;
  setRoute(id: string, route: string): Promise<Snapshot>;
  logGet(id: string, since: number): Promise<LogLine[]>;
  logClear(id: string): Promise<boolean>;
  logCopy(id: string): Promise<boolean>;
  network(): Promise<NetSnapshot>;
  openNetLink(): Promise<boolean>;
  settingsGet(): Promise<SettingsSnapshot>;
  settingsSet(patch: unknown): Promise<SettingsSnapshot>;
  pickDevDir(id: string): Promise<SettingsSnapshot>;
  resetDevDir(id: string): Promise<SettingsSnapshot>;
  shotReady(): Promise<boolean>;
  updates(): Promise<UpdatesSnapshot>;
  checkUpdates(): Promise<UpdatesSnapshot>;
  install(id: string): Promise<UpdatesSnapshot>;
  cancelInstall(id: string): Promise<boolean>;
  /** Startzeit fürs Log (main.log): „script“ = Modul läuft, „cards“ = erste Karten stehen. */
  mark(name: "script" | "cards"): void;
  openReleasePage(id: string): Promise<boolean>;
  /** Selbst-Update wartet: Link-Suite beenden, das Update einsetzen und neu starten. */
  restartForUpdate(): Promise<boolean>;
  onUpdates(cb: (u: UpdatesSnapshot) => void): void;
  onWin(cb: (w: { fullscreen: boolean; focused: boolean; platform: string }) => void): void;
  onMenu(cb: (m: { cmd: string; arg?: string }) => void): void;
  introDone(): void;
  welcomeDone(): Promise<boolean>;
  openHelp(): Promise<boolean>;
  chatGet(since: number): Promise<ChatState | null>;
  chatPost(text: string, urgent: boolean): Promise<boolean>;
  chatSettings(c: { enabled?: boolean; nick?: string; where?: string }): Promise<ChatState | null>;
  chatAttention(): void;
  onChat(cb: () => void): void;
  onState(cb: (s: Snapshot) => void): void;
  onLogs(cb: (b: LogBatch) => void): void;
  onNet(cb: () => void): void;
  onSettings(cb: (s: SettingsSnapshot) => void): void;
}

export const api = (window as unknown as { suite: Bridge }).suite;
