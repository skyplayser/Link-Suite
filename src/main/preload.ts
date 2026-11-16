// Schmale Brücke zur Oberfläche: nur benannte Funktionen. Argumente sind Kennungen aus catalog.ts („vj“, „app“ …),
// nie Pfade oder Befehle; der Hauptprozess prüft sie noch einmal.
import { contextBridge, ipcRenderer } from "electron";

const IDS = new Set(["lj", "ljl", "vj", "vd", "net", "crew", "pl", "db"]);
const id = (v: unknown) => (typeof v === "string" && IDS.has(v) ? v : "");
const SRC = new Set(["lj", "vj", "ljl", "suite"]);
const src = (v: unknown) => (typeof v === "string" && SRC.has(v) ? v : "");
const route = (v: unknown) => (v === "app" || v === "dev" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const on = (channel: string, cb: (payload: unknown) => void) => { ipcRenderer.on(channel, (_e, p) => cb(p)); };

const api = {
  info: () => ipcRenderer.invoke("app:info"),
  state: () => ipcRenderer.invoke("state:get"),
  scan: () => ipcRenderer.invoke("state:scan"),
  /** Skript-Weg (`mode` „script“) nur anstoßen: die Rückfrage stellt der Hauptprozess selbst. */
  launch: (p: unknown, r: unknown, mode: unknown, force: unknown) =>
    ipcRenderer.invoke("launch", id(p), route(r), mode === "script" ? "script" : "auto", force === true),
  stop: (p: unknown) => ipcRenderer.invoke("stop", id(p)),
  reveal: (p: unknown, r: unknown) => ipcRenderer.invoke("reveal", id(p), route(r)),
  setRoute: (p: unknown, r: unknown) => ipcRenderer.invoke("route:set", id(p), route(r)),
  logGet: (p: unknown, since: unknown) => ipcRenderer.invoke("log:get", id(p), num(since)),
  logClear: (p: unknown) => ipcRenderer.invoke("log:clear", id(p)),
  logCopy: (p: unknown) => ipcRenderer.invoke("log:copy", id(p)),
  network: () => ipcRenderer.invoke("net:get"),
  openNetLink: () => ipcRenderer.invoke("netlink:open"),
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: unknown) => ipcRenderer.invoke("settings:set", patch),
  pickDevDir: (p: unknown) => ipcRenderer.invoke("devdir:pick", id(p)),
  resetDevDir: (p: unknown) => ipcRenderer.invoke("devdir:reset", id(p)),
  shotReady: () => ipcRenderer.invoke("shot:ready"),
  // Installieren/Aktualisieren (0.2): nur Kennungen lj, vj, ljl, suite
  updates: () => ipcRenderer.invoke("updates:get"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  install: (p: unknown) => ipcRenderer.invoke("install", src(p)),
  cancelInstall: (p: unknown) => ipcRenderer.invoke("install:cancel", src(p)),
  openReleasePage: (p: unknown) => ipcRenderer.invoke("release:page", src(p)),
  onUpdates: (cb: (u: unknown) => void) => on("updates", cb),
  // macOS-Feinschliff (0.3): Fensterzustand, Menübefehle, Ende der Startanimation, Willkommen gesehen
  onWin: (cb: (w: unknown) => void) => on("win", cb),
  onMenu: (cb: (m: unknown) => void) => on("menu", cb),
  introDone: () => { ipcRenderer.send("ui:introDone"); },
  welcomeDone: () => ipcRenderer.invoke("welcome:done"),
  openHelp: () => ipcRenderer.invoke("help:readme"),
  // Suite-Chat (Namen wie VJ-Link preload)
  chatGet: (since: unknown) => ipcRenderer.invoke("chat:get", num(since)),
  chatPost: (text: unknown, urgent: unknown) => ipcRenderer.invoke("chat:post", typeof text === "string" ? text.slice(0, 2000) : "", urgent === true),
  chatSettings: (c: unknown) => ipcRenderer.invoke("chat:settings", c),
  chatAttention: () => { ipcRenderer.send("chat:attention"); },
  onChat: (cb: () => void) => on("chat", () => cb()),
  onState: (cb: (s: unknown) => void) => on("state", cb),
  onLogs: (cb: (b: unknown) => void) => on("logs", cb),
  onNet: (cb: () => void) => on("net", () => cb()),
  onSettings: (cb: (s: unknown) => void) => on("settings", cb),
};

contextBridge.exposeInMainWorld("suite", api);
export type SuiteApi = typeof api;
