// Link-Suite (Suite-Launcher) – Hauptprozess. Aufbau wie VD-Link electron/main.ts.
// Darf, was die Oberfläche nicht darf: Apps finden und starten, Entwicklerprojekte starten/stoppen, Suite-Chat (UDP),
// Einstellungen schreiben. Die Oberfläche schickt nur Kennungen aus catalog.ts, nie Pfade oder Befehle.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, session, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildConfirm, scriptHash } from "../core/confirm";
import { CATALOG, programById, type Program, type ProgramId } from "../core/catalog";
import { assessDevProject, firstMissing, type DevAssess } from "../core/devproject";
import { detectLang, translate, type Lang } from "../core/i18n";
import { fromStoredPath, toStoredPath } from "../core/paths";
import { procsOfApp, procsOfDevProject, type Proc } from "../core/procs";
import type { Route } from "../core/settings";
import type { AppFound, LaunchResult, LogBatch, NetSnapshot, ProgramState, SettingsSnapshot, ShotSpec, Snapshot } from "../core/state";
import { CHAT_GROUP, CHAT_PORT } from "../core/suitechat";
import { findInstalledMac, findInstalledWin, launchApp, processList, runSetup, type Installed } from "./apps";
import { createDemo, DEMO_GONE, DEMO_MESSAGES, DEMO_PEERS, DEMO_RELEASES, type Demo } from "./demo";
import { DevRunner, devEnv, nodeProbe } from "./devrun";
import { Installer } from "./installer";
import { initLog, log } from "./log";
import { boundsVisible } from "../core/settings";
import { isNewer } from "../core/version";
import { Store } from "./store";
import { sourceById } from "../core/release";
import { adapterList, ChatNet } from "./suitechat";

const VERSION = app.getVersion();

// Gepackte App: Debug-Schalter ablehnen (Fuses sperren --inspect und NODE_OPTIONS; Chromium-Schalter wie
// --remote-debugging-port sperrt keine Fuse). Wer so startet, bekommt eine Meldung und die App beendet sich.
const BLOCKED_SWITCHES = ["remote-debugging-port", "remote-debugging-pipe", "remote-allow-origins", "inspect", "inspect-brk", "inspect-port", "js-flags"];
if (app.isPackaged) {
  const bad = process.argv.slice(1).find(a => BLOCKED_SWITCHES.some(s => a === `--${s}` || a.startsWith(`--${s}=`)));
  if (bad) {
    for (const s of BLOCKED_SWITCHES) app.commandLine.removeSwitch(s);
    console.error(`Link-Suite: Schalter ${bad.split("=")[0]} wird in der fertigen App nicht angenommen.`);
    app.exit(2);
  }
}

if (process.platform === "win32") app.setAppUserModelId("de.nextphilm.linksuite");

// Unser Name überall (Menüleiste, Dock, Datenordner ~/Library/Application Support/Link-Suite) – nie „Electron“.
app.setName("Link-Suite");

// ------------------------------------------------------------------ Befehlszeile
const argv = process.argv.slice(1);
const arg = (name: string): string | null => {
  const a = argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
};
const SHOT = arg("shot");
const DEMO = arg("demo") !== null;
const shotSpec: ShotSpec | null = SHOT ? {
  tab: arg("tab") || "programs",
  theme: arg("theme") === "light" ? "light" : "dark",
  lang: arg("lang") === "en" ? "en" : "de",
  open: arg("open") ?? "",
  run: arg("run") ?? "",
  chat: arg("chat") !== null,
  menu: arg("menu") ?? "",
  intro: Math.max(0, Math.min(3000, Number(arg("intro")) || 0)),
  about: arg("about") !== null,
} : null;

// Demo und Screenshots: eigener Datenordner im Temp (nie die echte suite.json), eigener Chat-Port.
let demo: Demo | null = null;
let tempRoot: string | null = null;
// Alte Demo-/Screenshot-Ordner (älter als 1 Tag, nur eigenes Muster) aufräumen (QA 0.3 Nr. 10b)
try {
  for (const n of fs.readdirSync(os.tmpdir())) {
    if (!/^link-suite-demo-[A-Za-z0-9]{6}$/.test(n)) continue;
    const p = path.join(os.tmpdir(), n);
    if (Date.now() - fs.statSync(p).mtimeMs > 86_400_000) fs.rmSync(p, { recursive: true, force: true });
  }
} catch { /* Temp nicht lesbar */ }
if (DEMO || SHOT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "link-suite-demo-"));
  tempRoot = root;
  app.setPath("userData", path.join(root, "userData"));
  if (DEMO) demo = createDemo(root);
}
// Nur für QA: eigener Datenordner (wie VD_USER_DATA bei VD-Link), damit Tests nie die echte suite.json berühren
if (!DEMO && !SHOT && process.env.LINKSUITE_USER_DATA && path.isAbsolute(process.env.LINKSUITE_USER_DATA)) app.setPath("userData", process.env.LINKSUITE_USER_DATA);
const chatPort = Number(process.env.LINKSUITE_CHAT_PORT) || (DEMO || SHOT ? 47684 : CHAT_PORT);

if (!SHOT && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const store = new Store(app.getPath("userData"));
initLog(path.join(app.getPath("userData"), "logs"));
log("start", `Link-Suite ${VERSION} ${process.platform} ${process.arch} electron ${process.versions.electron} ${os.release()}${app.isPackaged ? " packaged" : " dev"}${DEMO ? " demo" : ""}${SHOT ? " shot" : ""}`);
process.on("uncaughtException", e => { log("uncaughtException", `${e?.name}: ${e?.message} ${e?.stack ?? ""}`); console.error(e); });
process.on("unhandledRejection", e => { log("unhandledRejection", String((e as Error)?.stack ?? e)); console.error(e); });
if (shotSpec) {
  store.memoryOnly = true;
  store.suite = { ...store.suite, lang: shotSpec.lang, theme: shotSpec.theme, intro: shotSpec.intro > 0, chat: { nick: "Max", where: "Booth", on: true } };
  // Website-Bilder: so, wie es ohne Entwicklerordner aussieht
  if (arg("nodev") !== null) store.launcher.devView = false;
}
if (demo && !store.suite.chat.nick) store.suite = { ...store.suite, chat: { ...store.suite.chat, nick: "Max", where: "Booth" } };

const lang = (): Lang => (store.suite.lang === "system" ? detectLang([app.getLocale(), ...app.getPreferredSystemLanguages()]) : store.suite.lang);
const say = (key: string, vars?: Record<string, string | number>) => translate(lang(), key, vars);

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const send = (channel: string, payload?: unknown) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

// ------------------------------------------------------------------ Programme: finden, Zustand
const home = os.homedir();

function devDirOf(p: Program): { stored: string; abs: string | null; custom: boolean } | null {
  if (p.devDir === undefined) return null;
  if (demo) { const d = demo.devDirs[p.id]; return d ? { stored: d, abs: d, custom: false } : null; }
  const custom = store.launcher.devDirs[p.id];
  const stored = custom ?? p.devDir;
  return { stored, abs: stored ? fromStoredPath(stored, home) : null, custom: custom !== undefined && custom !== p.devDir };
}

let installed = new Map<ProgramId, Installed>();
const winMiss = new Map<ProgramId, number>();
/** Erster vollständiger Suchlauf dieser Sitzung fertig (vorher gilt der Zwischenspeicher). */
let fullScan = false;
const devs = new Map<ProgramId, DevAssess>();
let scannedAt = 0;
let scanning: Promise<void> | null = null;
let procs: Proc[] = [];

const runner = new DevRunner(
  (id, lines) => send("logs", { id, lines } satisfies LogBatch),
  () => { void refresh(); },
  say,
);

async function scan(): Promise<void> {
  if (scanning) return scanning;
  scanning = (async () => {
    const dirs = CATALOG.map(devDirOf).filter((d): d is NonNullable<typeof d> => !!d && !!d.abs).map(d => d.abs!);
    if (process.platform === "darwin") {
      installed = await findInstalledMac({
        roots: demo ? [demo.apps] : ["/Applications", path.join(home, "Applications")],
        spotlight: !demo, volumes: demo ? null : "/Volumes", devDirs: dirs,
      });
    } else if (process.platform === "win32") {
      // Ein fehlgeschlagener oder lückenhafter Lauf entfernt kein bekanntes Programm; erst nach zwei Läufen ohne Treffer
      // gilt es als weg (QA Windows F2: LJ Link in HKLM flackerte)
      const r = await findInstalledWin();
      const next = new Map(r.map);
      for (const [id, prev] of installed) {
        if (next.has(id)) { winMiss.delete(id); continue; }
        const miss = (winMiss.get(id) ?? 0) + (r.complete ? 1 : 0);
        winMiss.set(id, miss);
        if (miss < 2) { next.set(id, prev); log("registry kept", `${id} ${prev.version} (miss ${miss}${r.complete ? "" : ", incomplete"})`); }
      }
      if (!r.complete) log("registry incomplete");
      // Nur echte Treffer in den Zwischenspeicher (Windows-Test 1.0.2: ein behaltener Eintrag mit alter Version blieb
      // sonst bis zum Neustart stehen)
      else saveInstalledCache(r.map);
      installed = next;
    } else installed = new Map();
    devs.clear();
    for (const p of CATALOG) {
      const d = devDirOf(p);
      if (d?.abs) devs.set(p.id, assessDevProject(d.abs, p.pkgName, p.renderer));
    }
    if (process.platform === "darwin" && !demo) saveInstalledCache(installed);
    procs = await processList();
    scannedAt = Date.now();
    fullScan = true;
  })();
  try { await scanning; } finally { scanning = null; }
}

/** Letzten vollständigen Stand merken; beim nächsten Start sofort zeigen (QA Windows 0.3.1 R1). */
function saveInstalledCache(m: Map<ProgramId, Installed>): void {
  if (demo || SHOT) return;
  const apps: Record<string, { path: string; version: string; bundleId: string; onVolume: boolean }> = {};
  for (const [id, a] of m) if (!a.onVolume) apps[id] = { path: a.path, version: a.version, bundleId: a.bundleId, onVolume: false };
  store.setLauncher(s => { s.installedCache = { at: Date.now(), apps }; });
}

/** Beim Start: Zwischenspeicher übernehmen, nur Einträge, deren App noch da ist. */
function seedFromCache(): void {
  const c = store.launcher.installedCache;
  if (!c || demo || SHOT) return;
  for (const [id, a] of Object.entries(c.apps)) {
    if (!programById(id) || !fs.existsSync(a.path)) continue;
    installed.set(id as ProgramId, { path: a.path, version: a.version, bundleId: a.bundleId, via: process.platform === "win32" ? "registry" : "known", program: id as ProgramId, others: [], onVolume: false });
  }
  for (const p of CATALOG) { const d = devDirOf(p); if (d?.abs) devs.set(p.id, assessDevProject(d.abs, p.pkgName, p.renderer)); }
  if (installed.size) scannedAt = c.at;
  log("cache", `${installed.size} apps`);
}

function programState(p: Program): ProgramState {
  const inst = installed.get(p.id);
  const run = runner.info(p.id);
  const running = run && (run.state === "running" || run.state === "stopping");
  const appFound: AppFound | null = inst ? {
    path: inst.path, version: inst.version, bundleId: inst.bundleId, others: inst.others, onVolume: inst.onVolume,
    running: procsOfApp(procs, inst.path).length > 0 || !!demo?.fakeRunning.has(p.id),
  } : null;
  const d = devDirOf(p);
  const a = devs.get(p.id);
  const dev = d && a ? {
    ...a, stored: d.stored, custom: d.custom,
    externalPids: running ? [] : procsOfDevProject(procs, a.dir).map(x => x.pid),
  } : null;
  const routes: Route[] = [];
  if (appFound) routes.push("app");
  if (dev && (dev.status === "ready" || dev.status === "needs-build" || running || run)) routes.push("dev");
  const wanted = store.launcher.routes[p.id];
  // Laufender Entwicklerstart zeigt immer den Entwickler-Weg; sonst gemerkt, sonst App (Design, offener Punkt 4)
  const route: Route | null = running ? "dev" : wanted && routes.includes(wanted) ? wanted : routes[0] ?? null;
  return { id: p.id, app: appFound, dev, run, routes, route };
}

function snapshot(): Snapshot {
  return { programs: CATALOG.map(programState), scannedAt, platform: process.platform, demo: !!demo, version: VERSION, fullScan };
}

let lastSent = "";
async function refresh(full = false): Promise<Snapshot> {
  if (full) await scan();
  else procs = await processList();
  const s = snapshot();
  const json = JSON.stringify(s);
  if (json !== lastSent) { lastSent = json; send("state", s); updateTray(); updateDock(); }
  return s;
}

// ------------------------------------------------------------------ Starten
/**
 * Rückfrage vor dem Skript-Weg stellt der Hauptprozess selbst (nativer Dialog am Fenster, Abbrechen ist Standard).
 * Die Oberfläche kann den Skript-Weg nur anstoßen, nie bestätigen. Nach „Trotzdem starten“ wird der Ordner neu
 * geprüft; hat sich das Skript inzwischen geändert, startet nichts.
 */
async function confirmScript(p: Program, a: DevAssess): Promise<boolean> {
  if (!win || win.isDestroyed()) return false;
  const c = buildConfirm(lang(), p.name, a);
  showWindow();
  const { response } = await dialog.showMessageBox(win, { ...c, buttons: [...c.buttons], noLink: true });
  return response === 1;
}

/** Apps auf Datenträgern, deren Start in dieser Sitzung bestätigt wurde. */
const volumeOk = new Set<string>();

async function launch(id: ProgramId, route: Route, mode: "auto" | "script", force: boolean): Promise<LaunchResult> {
  const p = programById(id)!;
  await refresh();
  const st = programState(p);
  if (route === "app") {
    if (!st.app) return { ok: false, error: say("err.notFound") };
    const devRunning = !!st.run && (st.run.state === "running" || st.run.state === "stopping");
    if (!force && (devRunning || (st.dev?.externalPids.length ?? 0) > 0)) return { ok: false, ask: "single", other: "dev" };
    if (demo) { demo.fakeRunning.add(id); void refresh(); return { ok: true, demo: true }; }
    // App auf einem Datenträger (LJL Link vom Stick): vor dem ersten Start Datenträger und Pfad zeigen (QA 0.1 Nr. 13)
    // gemerkt mit Pfad, Kennung und Änderungszeit: ein anderer Stick mit gleichem Namen fragt erneut (QA 0.3 Nr. 11)
    let vkey = st.app.path;
    try { vkey = `${st.app.path}|${st.app.bundleId}|${fs.statSync(path.join(st.app.path, "Contents", "Info.plist")).mtimeMs}`; } catch { /* Pfad allein */ }
    if (st.app.onVolume && !volumeOk.has(vkey)) {
      if (!win) return { ok: false, cancelled: true };
      const vol = st.app.path.split("/")[2] ?? "?";
      const { response } = await dialog.showMessageBox(win, {
        type: "warning", message: say("ljl.vol.title"), detail: say("ljl.vol.text", { vol, path: st.app.path }),
        buttons: [say("common.cancel"), say("ljl.vol.start")], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1) return { ok: false, cancelled: true };
      volumeOk.add(vkey);
    }
    const r = await launchApp(st.app.path);
    setTimeout(() => void refresh(), 1500);
    return r.ok ? { ok: true } : { ok: false, error: say("err.launch", { msg: r.error ?? "?" }) };
  }
  // Entwicklerprojekt: Ordner neu prüfen (er kann sich gerade ändern, andere Sessions bauen dort)
  if (process.platform === "win32") return { ok: false, error: say("err.win") };
  const d = devDirOf(p);
  if (!d?.abs) return { ok: false, error: say("err.notStartable") };
  const a = assessDevProject(d.abs, p.pkgName, p.renderer);
  devs.set(id, a);
  if (st.run && (st.run.state === "running" || st.run.state === "stopping")) return { ok: false, error: say("err.running") };
  if (!force && st.app?.running) return { ok: false, ask: "single", other: "app" };
  if (a.status === "ready" && mode === "auto") {
    // Gleiche Umgebung wie der Skript-Weg (PATH aus der Login-Shell, QA Befund 15); Start im realen Ordner
    const probe = await nodeProbe();
    return runner.start(id, { mode: "direct", bin: a.electronBin, args: [a.realDir], cmd: "electron .", dir: a.realDir, env: devEnv(probe) })
      .then(r => (r.ok ? { ok: true } : { ok: false, error: say("err.launch", { msg: r.error ?? "?" }) }));
  }
  if ((a.status === "ready" || a.status === "needs-build") && a.script) {
    // Der Skript-Weg ändert Dateien im Projektordner: nur nach ausdrücklicher Rückfrage in der Oberfläche
    const before = scriptHash(id, a);
    if (!(await confirmScript(p, a))) return { ok: false, cancelled: true };
    const again = assessDevProject(d.abs, p.pkgName, p.renderer);
    devs.set(id, again);
    if (scriptHash(id, again) !== before || !(again.status === "ready" || again.status === "needs-build")) return { ok: false, error: say("err.changed") };
    const probe = await nodeProbe();
    if (!probe) return { ok: false, error: say("err.noNode") };
    const args = a.script === "dev" ? ["run", "dev"] : ["start"];
    return runner.start(id, { mode: "script", bin: probe.npm, args, cmd: a.scriptCmd, dir: a.realDir, env: devEnv(probe) })
      .then(r => (r.ok ? { ok: true } : { ok: false, error: say("err.launch", { msg: r.error ?? "?" }) }));
  }
  return { ok: false, error: say("err.notStartable") };
}

// ------------------------------------------------------------------ Suite-Chat und Netz
const chat = new ChatNet(
  store.suite.chat,
  s => { store.setSuite({ chat: s }); send("settings", settingsSnapshot()); },
  () => send("chat"),
  chatPort,
  VERSION,
  () => send("net"),
  !demo, // Demo-Netz beantwortet kein probe (suite-net.md, QA Befund 5)
);
let chatFlashing = false;

function netSnapshot(): NetSnapshot {
  const adapters = adapterList();
  if (demo) for (const ip of demo.localIps) if (!adapters.some(a => a.ip === ip)) adapters.push({ name: "demo", ip });
  return {
    on: chat.enabled, error: chat.error, port: chatPort, group: CHAT_GROUP, adapters,
    entries: chat.roster.list(), hostname: os.hostname().replace(/\.local$/, ""),
  };
}

function startDemoPeers(): void {
  if (!demo) return;
  const feed = () => { for (const p of DEMO_PEERS) chat.inject(JSON.stringify(p.json), p.ip); };
  // Gegangen: vor 20 min zuletzt gesehen
  chat.inject(JSON.stringify(DEMO_GONE.json), DEMO_GONE.ip, Date.now() - 20 * 60_000);
  feed();
  for (const m of DEMO_MESSAGES) chat.inject(JSON.stringify(m.json), m.ip);
  setInterval(feed, 5000).unref();
}

// ------------------------------------------------------------------ Installieren und Aktualisieren (0.2)
const installer = new Installer({
  version: VERSION,
  dataDir: app.getPath("userData"),
  installedPath: id => (id === "suite" ? null : installed.get(id as ProgramId)?.path ?? null),
  isRunning: async p => procsOfApp(await processList(), p).length > 0,
  askQuit: async name => {
    if (!win) return false;
    const { response } = await dialog.showMessageBox(win, {
      type: "warning", message: say("inst.quit.title", { name }), detail: say("inst.quit.text", { name }),
      buttons: [say("common.cancel"), say("inst.quit.again")], defaultId: 1, cancelId: 0, noLink: true,
    });
    return response === 1;
  },
  pickLjlTarget: async sticks => {
    if (!win) return null;
    const buttons = [say("common.cancel"), say("inst.ljl.folder"), ...sticks.slice(0, 3).map(s => say("inst.ljl.stick", { name: s.name }))];
    const { response } = await dialog.showMessageBox(win, {
      type: "question", message: say("inst.ljl.title"), detail: say("inst.ljl.text"), buttons, defaultId: 1, cancelId: 0, noLink: true,
    });
    if (response === 0) return null;
    if (response >= 2) return sticks[response - 2]!.path;
    const r = await dialog.showOpenDialog(win, { title: say("inst.ljl.folder"), defaultPath: path.join(home, "Downloads"), properties: ["openDirectory", "createDirectory"] });
    return r.canceled || !r.filePaths[0] ? null : path.join(r.filePaths[0], "LJL Link für den Club");
  },
  onChange: () => {
    if (updTimer) return;
    updTimer = setTimeout(() => {
      updTimer = undefined;
      const snap = installer.snapshot();
      send("updates", snap);
      // Mitteilungen bei Ende einer Installation (nur Übergänge)
      for (const e of snap.entries) {
        const before = phases.get(e.id);
        phases.set(e.id, e.phase);
        if (before === e.phase || !before || snap.demo) continue;
        const name = e.id === "suite" ? "Link-Suite" : programById(e.id)?.name ?? e.id;
        const v = e.latest?.version ?? "";
        if (e.phase === "done") notify(e.id === "suite" ? say("note.selfReady", { v }) : say("note.installed", { name, v }), e.id === "suite" ? say("note.selfReady.body") : say("note.installed.body"), e.id === "suite" ? undefined : e.id as ProgramId);
        if (e.phase === "failed") notify(say("note.failed", { name }), (e.message || "").split("\n")[0] ?? "");
      }
      updateDock(); updateTray();
    }, 120);
  },
  say,
  log,
  openFile: async f => shell.openPath(f),
  runInstaller: f => runSetup(f),
  packaged: app.isPackaged,
  imageRunning: async f => procsOfApp(await processList(), f).length > 0,
  saveCache: c => { if (!demo && !SHOT) store.setLauncher(s => { s.releaseCache = c; }); },
  installedVersion: async id => { if (id === "suite") return null; await refresh(true); return installed.get(id as ProgramId)?.version ?? null; },
  // QA-Schalter „GitHub nicht erreichbar“: nur im Entwickler-Build oder Demo, nie in der fertigen App (keine freie URL)
  offline: process.env.LINKSUITE_OFFLINE === "1" && (!app.isPackaged || DEMO),
});
let updTimer: NodeJS.Timeout | undefined;
const phases = new Map<string, string>();
if (!demo && !SHOT) installer.loadCache(store.launcher.releaseCache);
installer.readSelfResult();
// Reste früherer Downloads beim Start aufräumen; gesperrte Dateien (z. B. offene UAC-Abfrage) später erneut (1.0.1)
installer.cleanupSync(true);
// Demo und Screenshots: feste Releases ohne Netz (damit die Update-Pillen zu sehen sind)
if (demo || SHOT) installer.setDemo(DEMO_RELEASES);

// ------------------------------------------------------------------ Einstellungen
/** Entwickleransicht: gespeichert, sonst an, wenn mindestens ein Entwicklerordner existiert. */
function devView(): boolean {
  if (typeof store.launcher.devView === "boolean") return store.launcher.devView;
  return CATALOG.some(p => { const d = devDirOf(p); return !!d?.abs && fs.existsSync(d.abs); });
}

function settingsSnapshot(): SettingsSnapshot {
  return {
    suite: store.suite, suiteReadOnly: store.suiteReadOnly, background: store.launcher.background,
    devDirs: CATALOG.filter(p => p.devDir !== undefined).map(p => {
      const d = devDirOf(p)!;
      const a = d.abs ? assessDevProject(d.abs, p.pkgName, p.renderer) : null;
      return { id: p.id, stored: d.stored, abs: d.abs ?? "", custom: d.custom, status: a?.status ?? "no-folder", missing: a ? firstMissing(a) : "folder" };
    }),
    locale: app.getLocale(), suiteFile: store.suiteFile, checkUpdates: store.launcher.checkUpdates,
    notify: store.launcher.notify, devView: devView(), welcomed: store.launcher.welcomed || !!demo && !process.env.LINKSUITE_WELCOME || (!!SHOT && !process.env.LINKSUITE_WELCOME), platform: process.platform,
  };
}

function applyTheme(): void {
  nativeTheme.themeSource = store.suite.theme === "system" ? "system" : store.suite.theme;
}

// ------------------------------------------------------------------ Menüleiste (Hintergrund)
function updateTray(): void {
  if (!store.launcher.background) { tray?.destroy(); tray = null; return; }
  if (!tray) {
    // macOS: Template-Bild (macOS färbt es hell/dunkel/hervorgehoben, M8); Windows: farbiges tray.png
    const mac = process.platform === "darwin";
    const img = nativeImage.createFromPath(path.join(app.getAppPath(), "dist", mac ? "tray-Template.png" : "tray.png"));
    // Nur mit gültigem Bild (sonst gäbe es unter Windows ein unsichtbares Symbol und eine Warnung)
    if (img.isEmpty()) { log("tray", "kein Bild, kein Symbol"); return; }
    if (mac) img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip("Link-Suite");
    tray.on("click", showWindow);
  }
  const n = runner.running.length;
  const u = updateCount();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: say("tray.open"), click: showWindow },
    ...(u ? [{ label: say(u === 1 ? "tray.update1" : "tray.updates", { n: u }), click: () => { showWindow(); send("menu", { cmd: "tab", arg: "programs" }); } }] : []),
    ...runner.running.map(r => ({ label: `${programById(r.id)!.name} – ${say("pill.running")}`, enabled: false })),
    ...(n ? [] : [{ label: say("top.running0"), enabled: false }]),
    { type: "separator" },
    { label: say("progs.checkAll"), click: () => void installer.check(true) },
    { type: "separator" },
    { label: say("tray.quit"), click: () => app.quit() },
  ]));
}

/** Zahl der Updates: installierte Programme mit neuerer Version + Link-Suite selbst. */
function updateCount(): number {
  let n = 0;
  for (const e of installer.snapshot().entries) {
    if (!e.latest) continue;
    if (e.id === "suite") { if (isNewer(e.latest.version, VERSION)) n++; continue; }
    const inst = installed.get(e.id as ProgramId);
    if (inst && e.id !== "ljl" && isNewer(e.latest.version, inst.version)) n++;
  }
  return n;
}

// ------------------------------------------------------------------ Dock (M6) und Mitteilungen (M7)
let lastDock = "";
let lastUpdates = -1;
function updateDock(): void {
  if (!win || win.isDestroyed()) return;
  const snap = installer.snapshot();
  const busy = snap.entries.filter(e => e.phase === "download" || e.phase === "verify" || e.phase === "install" || e.phase === "waiting");
  const dl = busy.filter(e => e.phase === "download");
  const p = !busy.length ? -1 : dl.length === busy.length ? dl.reduce((a, e) => a + e.progress, 0) / dl.length : 2;
  win.setProgressBar(p);
  const n = updateCount();
  app.dock?.setBadge(n ? String(n) : "");
  // Mitteilung, wenn die Zahl der Updates bei einer Prüfung gestiegen ist (eine für alle)
  if (lastUpdates >= 0 && n > lastUpdates && !snap.checking) {
    const names = snap.entries.filter(e => e.latest && (e.id === "suite" ? isNewer(e.latest.version, VERSION) : installed.get(e.id as ProgramId) && isNewer(e.latest.version, installed.get(e.id as ProgramId)!.version))).map(e => e.id === "suite" ? "Link-Suite" : programById(e.id)!.name);
    notify(say(n === 1 ? "note.updates1" : "note.updates", { n }), names.join(", "));
  }
  if (!snap.checking) lastUpdates = n;
  const key = JSON.stringify([n, runner.running.map(r => r.id), [...installed.entries()].filter(([, a]) => procsOfApp(procs, a.path).length).map(([id]) => id)]);
  if (key !== lastDock && app.dock) {
    lastDock = key;
    const items: MenuItemConstructorOptions[] = [
      { label: say("progs.checkAll"), click: () => void installer.check(true) },
      { label: say("progs.rescan"), click: () => void refresh(true) },
      { type: "separator" },
    ];
    for (const p of CATALOG) {
      const st = programState(p);
      if (st.run && (st.run.state === "running" || st.run.state === "stopping")) items.push({ label: say("dock.log", { name: p.name }), click: () => { showWindow(); send("menu", { cmd: "log", arg: p.id }); } });
      else if (st.app?.running) items.push({ label: say("dock.front", { name: p.name }), click: () => void launchApp(st.app!.path) });
    }
    items.push({ type: "separator" }, { label: say("chat.button"), click: () => { showWindow(); send("menu", { cmd: "chat" }); } });
    app.dock.setMenu(Menu.buildFromTemplate(items));
  }
}

/** Stille Mitteilung, nur wenn das Fenster nicht vorn ist (M7). Kommt nur aus dem Hauptprozess. */
function notify(title: string, body: string, id?: ProgramId): void {
  if (!store.launcher.notify || SHOT || !Notification.isSupported()) return;
  if (win && win.isVisible() && win.isFocused()) return;
  const n = new Notification({ title, body, silent: true });
  n.on("click", () => { showWindow(); if (id) send("menu", { cmd: "select", arg: id }); });
  n.show();
}

function showWindow(): void {
  if (!win || win.isDestroyed()) createWindow();
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}

// ------------------------------------------------------------------ IPC
/** Nur das eigene Fenster darf fragen. */
const fromWin = (e: IpcMainInvokeEvent) => !!win && e.sender === win.webContents;
const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
  ipcMain.handle(channel, (e, ...args) => (fromWin(e) ? fn(e, ...args) : null));
const asId = (v: unknown): ProgramId | null => programById(v)?.id ?? null;
const asRoute = (v: unknown): Route | null => (v === "app" || v === "dev" ? v : null);

handle("app:info", () => ({ version: VERSION, demo: !!demo, platform: process.platform, locale: app.getLocale(), shot: shotSpec }));
handle("state:get", () => snapshot());
handle("state:scan", () => refresh(true));
handle("launch", (_e, id, route, mode, force) => {
  const i = asId(id), r = asRoute(route);
  if (!i || !r) return { ok: false, error: say("err.bad") };
  return launch(i, r, mode === "script" ? "script" : "auto", force === true);
});
handle("stop", async (_e, id) => { const i = asId(id); if (i) await runner.stop(i); return snapshot(); });
handle("reveal", (_e, id, route) => {
  const i = asId(id), r = asRoute(route);
  if (!i || !r) return false;
  const st = programState(programById(i)!);
  const target = r === "app" ? st.app?.path : st.dev?.dir;
  if (!target || !fs.existsSync(target)) return false;
  shell.showItemInFolder(target);
  return true;
});
handle("route:set", (_e, id, route) => {
  const i = asId(id), r = asRoute(route);
  if (i && r) store.setLauncher(s => { s.routes[i] = r; });
  return refresh();
});
handle("log:get", (_e, id, since) => { const i = asId(id); return i ? runner.log(i, typeof since === "number" ? since : 0) : []; });
handle("log:clear", (_e, id) => { const i = asId(id); if (i) runner.clearLog(i); return true; });
handle("log:copy", (_e, id) => { const i = asId(id); if (!i) return false; clipboard.writeText(runner.logText(i, programById(i)!.name)); return true; });
handle("net:get", () => netSnapshot());
handle("netlink:open", () => {
  const net = installed.get("net");
  if (!net || demo) return false;
  // Fester Aufruf aus dem NET-Link-Konzept, kein Teil davon kommt aus der Oberfläche
  void shell.openExternal("netlink://check?from=suite&symptom=suite");
  return true;
});
handle("chat:get", (_e, since) => chat.state(typeof since === "number" ? since : 0));
handle("chat:post", (_e, text, urgent) => chat.post(text, urgent));
handle("chat:settings", (_e, c) => (c && typeof c === "object" ? chat.configure(c as Record<string, unknown>) : null));
ipcMain.on("chat:attention", e => {
  if (!win || e.sender !== win.webContents) return;
  if (process.platform === "darwin") app.dock?.bounce("informational");
  if (!win.isFocused()) {
    win.flashFrame(true);
    if (!chatFlashing) { chatFlashing = true; const w = win; w.once("focus", () => { chatFlashing = false; if (!w.isDestroyed()) w.flashFrame(false); }); }
  }
  if (!win.isVisible()) showWindow();
});
handle("settings:get", () => settingsSnapshot());
handle("settings:set", async (_e, patch) => {
  if (!patch || typeof patch !== "object") return settingsSnapshot();
  const p = patch as Record<string, unknown>;
  const { chat: chatPatch, background, checkUpdates: _cu, notify: _nt, devView: _dv, ...suitePatch } = p;
  if (Object.keys(suitePatch).length) store.setSuite(suitePatch);
  if (chatPatch && typeof chatPatch === "object") {
    const c = chatPatch as Record<string, unknown>;
    await chat.configure({ enabled: c.on, nick: c.nick, where: c.where }); // speichert über persist in suite.json
  }
  if (typeof background === "boolean") { store.setLauncher(s => { s.background = background; }); updateTray(); }
  if (typeof p.checkUpdates === "boolean") { const v = p.checkUpdates; store.setLauncher(s => { s.checkUpdates = v; }); }
  if (typeof p.notify === "boolean") { const v = p.notify; store.setLauncher(s => { s.notify = v; }); }
  if (typeof p.devView === "boolean") { const v = p.devView; store.setLauncher(s => { s.devView = v; }); }
  applyTheme();
  buildMenu(); updateTray(); // Sprache kann sich geändert haben
  const snap = settingsSnapshot();
  send("settings", snap);
  return snap;
});
handle("devdir:pick", async (_e, id) => {
  const i = asId(id);
  const p = i ? programById(i) : null;
  if (!p || p.devDir === undefined || !win || demo) return settingsSnapshot();
  const cur = devDirOf(p)?.abs ?? home;
  const r = await dialog.showOpenDialog(win, { title: say("set.devDir.pick", { name: p.name }), defaultPath: cur, properties: ["openDirectory"] });
  const chosen = r.canceled ? null : r.filePaths[0];
  const stored = chosen ? toStoredPath(chosen, home) : null;
  if (stored) { store.setLauncher(s => { s.devDirs[p.id] = stored; }); await refresh(true); }
  return settingsSnapshot();
});
handle("devdir:reset", async (_e, id) => {
  const i = asId(id);
  if (i && !demo) { store.setLauncher(s => { delete s.devDirs[i]; }); await refresh(true); }
  return settingsSnapshot();
});
handle("updates:get", () => installer.snapshot());
handle("help:readme", () => { void shell.openExternal(`${GITHUB}#readme`); return true; });
handle("welcome:done", () => { store.setLauncher(s => { s.welcomed = true; }); return true; });
handle("updates:check", async () => { if (!demo && !SHOT) await installer.check(true); return installer.snapshot(); });
handle("install", async (_e, id) => {
  const src = sourceById(id);
  // Nie stumm (1.0.6: Crew Link fehlte in der Brücke, der Klick tat nichts): Meldung an der Oberfläche und ins Log
  if (!src) return { ...installer.snapshot(), error: unknownSource("install", id) };
  void installer.install(src.id).then(() => refresh(true));
  return installer.snapshot();
});
handle("install:cancel", (_e, id) => {
  const src = sourceById(id);
  if (!src) { unknownSource("install:cancel", id); return false; }
  installer.cancel(src.id);
  return true;
});
/** Unbekannte Release-Quelle: Log-Eintrag und Meldung mit dem Programmnamen (falls im Katalog). */
function unknownSource(what: string, id: unknown): string {
  const raw = typeof id === "string" ? id.slice(0, 16) : typeof id;
  log("install unknown source", `${what} ${JSON.stringify(raw)}`);
  return say("inst.err.unknownSource", { name: programById(id)?.name ?? (raw || "?") });
}
handle("self:restart", () => {
  if (!installer.pendingSelf) return false;
  log("self-update restart", installer.pendingSelf.version);
  app.quit(); // will-quit startet das Update; macOS-Skript bzw. Windows-Installer starten die neue Version
  return true;
});

handle("release:page", (_e, id) => {
  const src = sourceById(id);
  const e = src ? installer.snapshot().entries.find(x => x.id === src.id) : null;
  // Nur die Releaseseite aus dem eigenen Repo (pageFor prüft das beim Lesen)
  // Aus dem Zwischenspeicher kann die Seite veraltet sein (Windows-Test 1.0.2: v1.0.1 statt latest) → /releases/latest
  const page = (e?.latest && !e.cached ? e.latest.page : null) ?? (src ? `https://github.com/${src.repo}/releases/latest` : null);
  if (page && page.startsWith("https://github.com/")) void shell.openExternal(page);
  return true;
});

handle("shot:ready", () => { if (SHOT) void takeShot(); return true; });

// ------------------------------------------------------------------ Fenster
/** Fenster-Icon nur in der Entwicklung (gepackt kommt es aus .exe bzw. Bundle); nur wenn die Datei da ist. */
function windowIcon(): string | null {
  if (app.isPackaged) return null;
  const p = path.join(app.getAppPath(), "build", process.platform === "win32" ? "icon.ico" : "icon.png");
  return fs.existsSync(p) ? p : null;
}

const bgColor = () => (nativeTheme.shouldUseDarkColors ? "#0C0E13" : "#EEF0F4");
function watchTheme(): void {
  nativeTheme.on("updated", () => {
    if (win && !win.isDestroyed()) win.setBackgroundColor(bgColor());
    if (aboutWin && !aboutWin.isDestroyed()) aboutWin.setBackgroundColor(bgColor());
  });
}

/** Gespeicherte Lage nur, wenn ≥ 50 % auf einem Bildschirm liegen; sonst 1320 × 880 mittig. --shot: fest. */
function restoreBounds(): { width: number; height: number; x?: number; y?: number } {
  if (shotSpec) {
    const m = /^(\d{3,4})x(\d{3,4})$/.exec(arg("size") ?? "");
    return m ? { width: Math.max(960, Number(m[1])), height: Math.max(620, Number(m[2])) } : { width: 1480, height: 920 };
  }
  const b = store.launcher.window;
  if (b && boundsVisible(b, screen.getAllDisplays().map(d => d.workArea))) return { x: b.x, y: b.y, width: b.width, height: b.height };
  return { width: 1320, height: 880 };
}

let boundsTimer: NodeJS.Timeout | undefined;
function saveBounds(now = false): void {
  if (!win || win.isDestroyed() || shotSpec || win.isFullScreen() || win.isMinimized()) return;
  const doIt = () => { if (!win || win.isDestroyed()) return; const b = win.getNormalBounds(); store.setLauncher(s => { s.window = { ...b, zoomed: win!.isMaximized() }; }); };
  clearTimeout(boundsTimer);
  if (now) doIt(); else boundsTimer = setTimeout(doIt, 500);
}

function sendWinState(): void {
  if (win && !win.isDestroyed()) send("win", { fullscreen: win.isFullScreen(), focused: win.isFocused(), platform: process.platform });
}

function createWindow(): void {
  const mac = process.platform === "darwin";
  win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 960,
    minHeight: 620,
    title: "Link-Suite",
    // macOS: Kopf statt Titelleiste (kein Dokument), Ampel mittig im 54-px-Kopf (Design 0.3 M2)
    ...(mac ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 20 } } : {}),
    // Farbe ab dem ersten Bild nach dem echten Schema (M1; themeSource ist schon gesetzt, auch bei „System“)
    backgroundColor: bgColor(),
    show: false,
    fullscreenable: true,
    // Windows: keine Electron-Menüleiste im Bild (Alt blendet sie ein; Kürzel gehen weiter), QA Windows U4
    ...(process.platform === "win32" ? { autoHideMenuBar: true } : {}),
    // Icon nur, wenn es eine Datei gibt (sonst Warnung „Argument must be a file path or a NativeImage“). Gepackt nimmt
    // Windows das Icon aus der .exe, macOS aus dem Bundle.
    ...(windowIcon() ? { icon: windowIcon()! } : {}),
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      // Screenshots: auch verdeckt weiter zeichnen
      backgroundThrottling: !shotSpec,
    },
  });
  log("window created");
  if (store.launcher.window?.zoomed && !shotSpec) win.maximize();
  for (const ev of ["enter-full-screen", "leave-full-screen", "focus", "blur"] as const) win.on(ev as "focus", sendWinState);
  win.on("resize", () => saveBounds());
  win.on("move", () => saveBounds());
  win.webContents.on("did-finish-load", sendWinState);
  // Fenster robust zeigen (Windows-Test 0.2.0: ready-to-show kam in der VM nie): ready-to-show ODER did-finish-load
  // ODER spätestens nach 3 s – auf allen Systemen.
  const w = win;
  // 1.0.1 (Windows-Realtest: dom-ready erst nach 4 s, davor 1 s leeres Fenster): Windows zeigt das Fenster sofort in
  // der Hintergrundfarbe der Startfläche; das erste Bild der Oberfläche ist genau diese Fläche (#intro ab dem Laden),
  // es gibt also keinen Wechsel leer → Oberfläche → Startanimation. Andere Systeme: wie bisher, spätestens nach 1,5 s.
  const reveal = (why: string) => { if (!w.isDestroyed() && !w.isVisible()) { log("window show", why); w.show(); } };
  w.once("ready-to-show", () => reveal("ready-to-show"));
  w.webContents.once("did-start-loading", () => log("did-start-loading"));
  w.webContents.once("dom-ready", () => { log("dom-ready"); reveal("dom-ready"); });
  w.webContents.once("did-finish-load", () => {
    log("did-finish-load"); reveal("did-finish-load");
    try { const g = app.getGPUFeatureStatus(); log("gpu", `compositing ${g.gpu_compositing} raster ${g.rasterization}`); } catch { /* nur Log */ }
  });
  if (process.platform === "win32" && !shotSpec) reveal("early");
  setTimeout(() => reveal("timeout 1.5s"), 1500);
  w.webContents.on("did-fail-load", (_e, code, desc, url, isMain) => log("did-fail-load", `${code} ${desc} ${isMain ? "main" : "sub"} ${url}`));
  w.webContents.on("render-process-gone", (_e, d) => log("render-process-gone", `${d.reason} exit ${d.exitCode}`));
  w.webContents.on("preload-error", (_e, p, err) => log("preload-error", `${path.basename(p)} ${err?.message}`));
  w.on("unresponsive", () => log("unresponsive"));
  w.on("responsive", () => log("responsive"));
  void w.loadFile(path.join(app.getAppPath(), "dist", "index.html")).catch(e => log("loadFile failed", String((e as Error)?.message ?? e)));
  // Keine Navigation, keine neuen Fenster, keine Webviews
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.webContents.on("will-redirect", e => e.preventDefault());
  win.webContents.on("will-attach-webview", e => e.preventDefault());
  win.webContents.on("console-message", e => {
    const m = e as unknown as { message: string; level: string | number };
    // Renderer-Konsole ab Stufe Fehler ins Log (keine Chat-Texte: der Chat schreibt nie in die Konsole)
    if (m.level === "error" || m.level === 3) { console.log("[renderer error]", m.message); log("renderer error", m.message); }
  });
  win.on("close", e => {
    saveBounds(true);
    // Im Hintergrund weiterlaufen: Fenster nur verstecken (bleibt im Chat, zeigt EMERGENCY)
    if (store.launcher.background && !quitting && !SHOT) { e.preventDefault(); win?.hide(); }
  });
  win.on("closed", () => { win = null; });
}

async function takeShot(): Promise<void> {
  if (!win || !SHOT) return;
  // Ein gerade gestartetes Programm kann das Fenster verdecken; verdeckte Fenster malt macOS nicht neu.
  win.show(); win.moveTop(); win.focus();
  win.webContents.invalidate();
  await new Promise(r => setTimeout(r, shotSpec?.intro ? 0 : 900));
  if (shotSpec?.about) { openAbout(); await new Promise(r => setTimeout(r, 1500)); }
  const target = shotSpec?.about && aboutWin ? aboutWin : win;
  const img = await target.webContents.capturePage(undefined, { stayHidden: false, stayAwake: true });
  const file = path.resolve(SHOT);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, img.toPNG());
  console.log("[link-suite] screenshot", file);
  quitting = true;
  await runner.stopAll();
  app.quit();
}

const GITHUB = "https://github.com/skyplayser/Link-Suite";

function buildMenu(): void {
  // Menüs nach Design 0.3 M3; Beschriftungen über i18n. Klicks gehen als „menu“ an die Oberfläche (dieselben Wege wie Knöpfe).
  const isMac = process.platform === "darwin";
  const L = (key: string, v?: Record<string, string | number>) => say(key, v);
  const cmd = (c: string, arg?: string) => () => { showWindow(); send("menu", { cmd: c, arg }); };
  const theme = (v: "system" | "light" | "dark") => () => {
    store.setSuite({ theme: v }); applyTheme(); send("settings", settingsSnapshot()); buildMenu();
  };
  const settingsItem: MenuItemConstructorOptions = { label: L("mm.settings"), accelerator: "CmdOrCtrl+,", click: cmd("tab", "settings") };
  const t = store.suite.theme;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{
      label: "Link-Suite", submenu: [
        { label: L("mm.about"), click: () => openAbout() }, { type: "separator" },
        settingsItem, { type: "separator" },
        { role: "services", label: L("mm.services") }, { type: "separator" },
        { role: "hide", label: L("mm.hide") }, { role: "hideOthers", label: L("mm.hideOthers") }, { role: "unhide", label: L("mm.unhide") },
        { type: "separator" }, { role: "quit", label: L("mm.quit") },
      ] as MenuItemConstructorOptions[],
    }] : [{ label: L("mm.file"), submenu: [settingsItem, { type: "separator" }, { role: "quit", label: L("mm.quit") }] as MenuItemConstructorOptions[] }]),
    { label: L("mm.programs"), submenu: [
      { label: L("progs.checkAll"), accelerator: "CmdOrCtrl+R", click: () => { void installer.check(true); } },
      { label: L("progs.rescan"), accelerator: "Shift+CmdOrCtrl+R", click: cmd("rescan") },
      { type: "separator" },
      { label: L("mm.startSel"), accelerator: "CmdOrCtrl+Enter", click: cmd("startSelected") },
      { label: isMac ? L("prog.reveal") : L("prog.revealWin"), accelerator: "Alt+CmdOrCtrl+R", click: cmd("revealSelected") },
      { label: L("mm.showLog"), accelerator: "CmdOrCtrl+L", click: cmd("logSelected") },
    ] },
    { label: L("mm.edit"), submenu: [
      { role: "undo", label: L("mm.undo") }, { role: "redo", label: L("mm.redo") }, { type: "separator" },
      { role: "cut", label: L("mm.cut") }, { role: "copy", label: L("mm.copy") }, { role: "paste", label: L("mm.paste") }, { role: "selectAll", label: L("mm.selectAll") },
    ] },
    { label: L("mm.view"), submenu: [
      { label: L("tab.programs"), accelerator: "CmdOrCtrl+1", click: cmd("tab", "programs") },
      { label: L("tab.network"), accelerator: "CmdOrCtrl+2", click: cmd("tab", "network") },
      { label: L("tab.stick"), accelerator: "CmdOrCtrl+3", click: cmd("tab", "stick") },
      { label: L("tab.settings"), accelerator: "CmdOrCtrl+4", click: cmd("tab", "settings") },
      { type: "separator" },
      { label: L("mm.appearance"), submenu: [
        { label: L("set.system"), type: "radio", checked: t === "system", click: theme("system") },
        { label: L("mm.light"), type: "radio", checked: t === "light", click: theme("light") },
        { label: L("mm.dark"), type: "radio", checked: t === "dark", click: theme("dark") },
      ] },
      { type: "separator" },
      { role: "resetZoom", label: L("mm.resetZoom") }, { role: "zoomIn", label: L("mm.zoomIn") }, { role: "zoomOut", label: L("mm.zoomOut") },
      { type: "separator" }, { role: "togglefullscreen", label: L("mm.fullscreen") },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const, label: L("mm.devtools") }]),
    ] },
    { label: L("mm.window"), role: "windowMenu", submenu: [
      { role: "minimize", label: L("mm.minimize") }, { role: "zoom", label: L("mm.zoom") }, { role: "close", label: L("mm.close") },
      ...(isMac ? [{ type: "separator" as const }, { role: "front" as const, label: L("mm.front") }] : []),
      { type: "separator" },
      { label: L("chat.button"), accelerator: "Shift+CmdOrCtrl+C", click: cmd("chat") },
    ] },
    { label: L("mm.help"), role: "help", submenu: [
      { label: L("mm.helpReadme"), click: () => void shell.openExternal(`${GITHUB}#readme`) },
      { label: L("mm.whatsNew"), click: () => void shell.openExternal(`${GITHUB}/releases`) },
      { label: L("mm.report"), click: () => void shell.openExternal(`${GITHUB}/issues`) },
      { type: "separator" },
      { label: L("set.licenses"), click: () => openAbout(true) },
    ] },
  ]));
}

// ------------------------------------------------------------------ Über-Fenster (M3)
let aboutWin: BrowserWindow | null = null;
function openAbout(licenses = false): void {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.show(); aboutWin.focus(); if (licenses) aboutWin.webContents.send("about:licenses"); return; }
  const mac = process.platform === "darwin";
  aboutWin = new BrowserWindow({
    width: 380, height: licenses ? 640 : 460, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    title: say("mm.about"), backgroundColor: bgColor(), show: false,
    ...(mac ? { titleBarStyle: "hiddenInset" as const } : {}),
    ...(windowIcon() ? { icon: windowIcon()! } : {}),
    webPreferences: { preload: path.join(app.getAppPath(), "dist-electron", "preload-about.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  const a = aboutWin;
  a.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  a.webContents.on("will-navigate", e => e.preventDefault());
  a.webContents.on("will-redirect", e => e.preventDefault());
  a.webContents.on("will-attach-webview", e => e.preventDefault());
  a.once("ready-to-show", () => a.show());
  setTimeout(() => { if (!a.isDestroyed() && !a.isVisible()) a.show(); }, 3000);
  a.on("closed", () => { aboutWin = null; });
  void a.loadFile(path.join(app.getAppPath(), "dist", "about.html"), { query: licenses ? { licenses: "1" } : {} });
}
ipcMain.handle("about:info", e => {
  if (!aboutWin || e.sender !== aboutWin.webContents) return null;
  const upd = installer.snapshot().entries.find(x => x.id === "suite");
  return {
    version: VERSION, arch: process.arch, lang: lang(), theme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
    update: upd?.latest && isNewer(upd.latest.version, VERSION) ? upd.latest.version : "",
    electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
  };
});
ipcMain.handle("about:licenses", e => {
  if (!aboutWin || e.sender !== aboutWin.webContents) return "";
  try { return fs.readFileSync(path.join(app.getAppPath(), "THIRD_PARTY.md"), "utf8").slice(0, 100_000); } catch { return ""; }
});
ipcMain.handle("about:open", (e, what) => {
  if (!aboutWin || e.sender !== aboutWin.webContents) return false;
  if (what === "github") void shell.openExternal(GITHUB);
  return true;
});
ipcMain.on("about:resize", (e, h) => {
  if (!aboutWin || e.sender !== aboutWin.webContents || typeof h !== "number") return;
  aboutWin.setSize(380, Math.max(460, Math.min(700, Math.round(h))), true);
});

// ------------------------------------------------------------------ Beenden
app.on("before-quit", e => {
  if (quitting) { chat.quit(); return; }
  const running = runner.running;
  if (!running.length || !win) { quitting = true; chat.quit(); return; }
  // Laufende Entwicklerprozesse: fragen, nie stillschweigend töten
  e.preventDefault();
  void (async () => {
    const list = running.map(r => programById(r.id)!.name).join(", ");
    showWindow();
    const { response } = await dialog.showMessageBox(win!, {
      type: "question", message: say("quit.title"), detail: say("quit.text", { list }),
      buttons: [say("quit.stop"), say("quit.keep"), say("common.cancel")], defaultId: 0, cancelId: 2,
    });
    if (response === 2) return;
    if (response === 0) await runner.stopAll();
    else runner.detachAll();
    quitting = true;
    app.quit();
  })();
});

// Beendet per SIGTERM/SIGINT (z. B. pkill): sauber beenden, damit der Temp-Ordner gelöscht wird
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { quitting = true; app.quit(); setTimeout(() => app.exit(0), 3000).unref(); });

// Demo/Screenshot: eigenen Temp-Ordner beim Beenden löschen (nur genau diesen, QA Befund 9)
app.on("will-quit", () => {
  installer.runPendingSelfUpdate();
  installer.cleanupSync();
  if (tempRoot && path.basename(tempRoot).startsWith("link-suite-demo-") && tempRoot.startsWith(os.tmpdir())) {
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* bleibt im Temp */ }
  }
});

app.on("window-all-closed", () => {
  if (!store.launcher.background || SHOT) app.quit();
});

app.on("second-instance", () => showWindow());
app.on("activate", () => showWindow());

app.whenReady().then(async () => {
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(path.join(app.getAppPath(), "build", "icon.png"));
  // Keine Rechte für Kamera, Mikrofon, Benachrichtigungen o. Ä.; keine Netzanfragen aus der Oberfläche
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Nur eigene Dateien; dazu die internen Schemata von Chromium (DevTools, Fehlerseiten). Kein http(s) aus der Oberfläche.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(file|devtools|data|blob|chrome|chrome-error|chrome-extension):/i.test(details.url);
    if (!ok) log("blocked request", details.url.slice(0, 120));
    cb({ cancel: !ok });
  });
  applyTheme();
  watchTheme();
  buildMenu();
  log("ready");
  seedFromCache();
  // Fenster sofort, Suche danach (reg query / mdfind dürfen das Fenster nie verzögern)
  createWindow();
  updateTray();
  void scan().then(() => { log("scan done", `${installed.size} apps`); return refresh(); }).catch(e => log("scan failed", String((e as Error)?.message ?? e)));
  // Chat nachgeordnet: er darf den Start nicht verzögern
  // Chat erst nach der Startanimation (+500 ms), damit die macOS-Frage „Lokales Netzwerk“ nicht mitten hineinfällt (M5);
  // die Oberfläche meldet das Ende („ui:introDone“), spätestens nach 6 s geht es trotzdem los.
  let chatStarted = false;
  const startChat = () => {
    if (chatStarted) return;
    chatStarted = true;
    void chat.init().then(() => { send("chat"); send("net"); startDemoPeers(); });
  };
  ipcMain.on("ui:mark", (e, name, ms) => {
    if (!win || e.sender !== win.webContents || (name !== "script" && name !== "cards") || typeof ms !== "number" || !Number.isFinite(ms)) return;
    log(`ui ${name}`, `${Math.max(0, Math.min(600_000, Math.round(ms)))} ms nach Navigationsstart`);
  });
  ipcMain.on("ui:introDone", e => { if (win && e.sender === win.webContents) setTimeout(startChat, 500); });
  win!.webContents.once("did-finish-load", () => {
    setTimeout(startChat, 6000);
    setTimeout(() => {
      void nodeProbe(); // Login-Shell früh fragen, damit der erste Entwicklerstart nicht wartet
      // Update-Prüfung beim Start (höchstens 1×/h, abschaltbar); nie im Demo und nie beim Screenshot. Kennt der
      // Zwischenspeicher ein Programm des Katalogs nicht (neue Version der Suite), sofort und dieses zuerst (1.0.1).
      if (!demo && !SHOT && store.launcher.checkUpdates) setTimeout(() => void installer.check(false), installer.staleIds().length ? 0 : 1500);
    }, 300);
  });
  setInterval(() => { void refresh(); }, 3000).unref();
  if (shotSpec?.run) {
    const id = asId(shotSpec.run);
    if (id) setTimeout(() => void launch(id, "dev", "auto", true), 200);
  }
  if (SHOT) setTimeout(() => { console.error("[link-suite] screenshot: Zeitlimit"); app.exit(2); }, 30000).unref();
});
