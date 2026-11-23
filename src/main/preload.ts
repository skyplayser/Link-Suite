// Schmale Brücke zur Oberfläche: nur benannte Funktionen. Argumente sind Kennungen aus catalog.ts („vj“, „app“ …),
// nie Pfade oder Befehle; der Hauptprozess prüft sie noch einmal.
import { contextBridge, ipcRenderer } from "electron";
import { progArg as id, srcArg as src } from "./ipc-args"; // aus Katalog und Quellen abgeleitet (1.0.6)

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
  // Installieren/Aktualisieren: Kennungen der Release-Quellen (SOURCES)
  updates: () => ipcRenderer.invoke("updates:get"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  install: (p: unknown) => ipcRenderer.invoke("install", src(p)),
  cancelInstall: (p: unknown) => ipcRenderer.invoke("install:cancel", src(p)),
  openReleasePage: (p: unknown) => ipcRenderer.invoke("release:page", src(p)),
  restartForUpdate: () => ipcRenderer.invoke("self:restart"),
  onUpdates: (cb: (u: unknown) => void) => on("updates", cb),
  // macOS-Feinschliff (0.3): Fensterzustand, Menübefehle, Ende der Startanimation, Willkommen gesehen
  onWin: (cb: (w: unknown) => void) => on("win", cb),
  onMenu: (cb: (m: unknown) => void) => on("menu", cb),
  introDone: () => { ipcRenderer.send("ui:introDone"); },
  // Startzeiten fürs Log (1.0.1, Windows: dom-ready erst nach 4 s): nur feste Namen und eine Zahl
  mark: (name: unknown) => { if (name === "script" || name === "cards") ipcRenderer.send("ui:mark", name, Math.round(performance.now())); },
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
