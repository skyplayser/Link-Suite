// Oberfläche von Link-Suite: Kopf mit Logo, Tabs PROGRAMME · IM NETZ · CLUB-STICK · EINSTELLUNGEN, Chips, Chat.
// Kein Startbildschirm vor dem Hauptbildschirm – PROGRAMME ist der Start; die Startanimation liegt beim Öffnen darüber.
import type { ProgramId } from "../core/catalog";
import { isProgramId } from "../core/catalog";
import type { SettingsSnapshot } from "../core/state";
import { api, type Info } from "./api";
import { ChatUi } from "./chat";
import { applyI18n, currentLang, onLang, setLang, t } from "./i18n";
import { playLauncherIntro } from "./intro/launcher-intro";
import { LogDock } from "./logdock";
import { NetworkView } from "./network";
import { ProgramsView } from "./programs";
import { SettingsView } from "./settings";
import { $, h, info as infoDialog } from "./ui";
import { isNewer } from "../core/version";

api.mark("script"); // Startzeit fürs Log (1.0.1): wann läuft das Modul?

const TABS = ["programs", "network", "stick", "settings"] as const;
type Tab = (typeof TABS)[number];
let tab: Tab = "programs";
let appInfo: Info;

const programs = new ProgramsView(t => goTab(t as Tab));
const log = new LogDock(programs);
programs.log = log;
const network = new NetworkView(() => programs.snap, () => renderChips());

// ------------------------------------------------------------------ Tabs
function goTab(next: Tab, focus = false): void {
  tab = next;
  for (const name of TABS) {
    const b = $(`tabbtn-${name}`), on = name === next;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    $(`tab-${name}`).classList.toggle("on", on);
  }
  if (focus) $(`tabbtn-${next}`).focus();
  document.body.classList.toggle("tab-programs-on", next === "programs");
  // Startbarkeit bei jedem Öffnen des Tabs neu prüfen (Ordner können sich gerade ändern)
  if (next === "programs" && programs.snap) void programs.rescan();
  if (next === "network") void network.refresh();
  renderChips();
}

const tabs = document.querySelector<HTMLElement>(".tabs")!;
tabs.addEventListener("click", e => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-tab]");
  if (b) goTab(b.dataset.tab as Tab);
});
tabs.addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const i = TABS.indexOf(tab);
  goTab(TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!, true);
});

// ------------------------------------------------------------------ Kopf: Chips
function renderChips(): void {
  const n = programs.runningCount();
  $("chip-running-dot").className = "dot " + (n ? "green" : "grey");
  $("chip-running-text").textContent = n === 0 ? t("top.running0") : n === 1 ? t("top.running1") : t("top.running", { n });
  const c = network.counts();
  const onNet = tab === "network";
  $("chip-net").hidden = onNet;
  $("chip-listen").hidden = !onNet;
  $("chip-net").replaceChildren(`${t("top.net")} `, h("b", { text: String(c.programs) }), ` ${t("top.net.programs")} · `, h("b", { text: String(c.hosts) }), ` ${t("top.net.hosts")}`);
  $("chip-listen").replaceChildren(h("span", { class: "dot " + (network.net?.on ? "green" : "grey") }), network.listenText());
  const count = $("net-count");
  count.hidden = c.programs === 0;
  count.textContent = String(c.programs);
}
$("chip-net").addEventListener("click", () => goTab("network"));
$("stick-go").addEventListener("click", () => { goTab("programs"); programs.select("ljl", true); document.querySelector<HTMLElement>('[data-key="ljl:card"]')?.scrollIntoView({ block: "center" }); });

// ------------------------------------------------------------------ Fußzeile jeder Seite
function renderFoot(): void {
  const netInstalled = !!programs.state("net")?.app;
  for (const f of document.querySelectorAll<HTMLElement>("[data-foot]")) {
    // „Netzproblem?“ nur, wenn NET Link installiert ist (QA Windows U2)
    f.replaceChildren(
      ...(netInstalled ? [h("span", { class: "netlink" }, h("img", { src: "./icons/net-link.svg", alt: "" }), h("span", { text: t("foot.netProblem") }), " ",
        h("button", { class: "linkish strong", type: "button", text: t("foot.netCheck"), onclick: () => void api.openNetLink() }))] : []),
      h("span", { class: "sp" }),
      h("span", { text: t("foot.version", { v: appInfo?.version ?? "" }) }), " · ",
      h("button", { class: "linkish", type: "button", text: t("foot.licenses"), onclick: () => void infoDialog(t("set.licenses"), t("set.licenses.text")) }));
  }
}

// ------------------------------------------------------------------ Tag / Nacht / System
// M1: Der Hauptprozess setzt nativeTheme.themeSource vor dem Fenster; matchMedia liefert damit sofort das Richtige.
const lightQuery = matchMedia("(prefers-color-scheme: light)");
let themePref: SettingsSnapshot["suite"]["theme"] = "system";
function applyTheme(): void {
  const light = themePref === "light" || (themePref === "system" && lightQuery.matches);
  if (light) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}
lightQuery.addEventListener("change", applyTheme);
applyTheme(); // beim Laden des Moduls, nicht erst nach den Einstellungen (kein Aufblitzen)
if (navigator.userAgent.includes("Mac")) document.documentElement.classList.add("mac", "focused");
if (navigator.userAgent.includes("Windows")) document.documentElement.dataset.os = "win";

const settings = new SettingsView(s => {
  programs.setDevView(s.devView);
  themePref = s.suite.theme;
  applyTheme();
  setLang(s.suite.lang, s.locale);
});

// Schnellumschalter DE/EN im Kopf (Wunsch Entwickler 17.11.): ein Klick statt Einstellungen → Sprache
const topLang = $("top-lang");
function renderTopLang(): void {
  for (const b of topLang.querySelectorAll<HTMLButtonElement>("button[data-v]")) b.setAttribute("aria-pressed", String(b.dataset.v === currentLang()));
}
topLang.addEventListener("click", e => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
  if (b && b.dataset.v !== currentLang()) void settings.setLang(b.dataset.v === "en" ? "en" : "de");
});
renderTopLang();
onLang(renderTopLang);

onLang(() => { renderSelf(); programs.render(); log.update(); network.render(); renderChips(); renderFoot(); settings.renderDevDirs(); });

// ------------------------------------------------------------------ Startanimation (?app=suite) als Schicht
/**
 * Startanimation mit Launcher-Ende (Design 0.3 Teil 2): Icons fliegen in ihre Karten, das Zeichen ins Logo.
 * Die Schicht (#intro mit .ibg) deckt ab dem Laden; gestartet wird, sobald die Karten stehen (Suchlauf fertig,
 * höchstens 1,2 s) und die Icons dekodiert sind (höchstens 300 ms). Während der Animation rendert PROGRAMME nicht.
 */
let introStarted: Promise<void> = Promise.resolve();
let skipEarly = false;
function coverIntro(): void {
  document.documentElement.classList.add("intro-run");
  $("intro").hidden = false;
  // Schon während des Wartens überspringbar (QA 0.3 Nr. 7)
  // nicht „once“: ⌘/Strg allein verbraucht den Zuhörer sonst (Mac-QA 0.3.1 N2)
  const early = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || ["Meta", "Control"].includes(e.key))) return;
    skipEarly = true;
    removeEventListener("keydown", early);
  };
  addEventListener("keydown", early);
  $("intro").addEventListener("pointerdown", early, { once: true });
  window.addEventListener("linksuite-intro-done", () => removeEventListener("keydown", early), { once: true });
}

/** Tab PROGRAMME fokussieren, ohne Ring bei Mausbedienung und ohne zu scrollen (QA 0.3 Nr. 6). */
function focusTab(): void {
  document.querySelector<HTMLElement>('.tabs [aria-selected="true"]')?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
async function intro(holdAt: number | null): Promise<void> {
  const layer = $("intro");
  // Auf den ersten vollständigen Suchlauf warten, höchstens 1,5 s (QA Windows F1: sonst landen Icons in falschen
  // Karten); wer vorher klickt oder tippt, überspringt ganz (QA 0.3 Nr. 7)
  for (let i = 0; i < 15 && !(programs.snap?.scannedAt) && !skipEarly; i++) programs.update(await api.state()), await new Promise(r => setTimeout(r, 100));
  if (skipEarly && holdAt === null) {
    layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
    setTimeout(() => layer.remove(), 160);
    document.documentElement.classList.remove("intro-run");
    api.introDone();
    focusTab();
    return;
  }
  programs.render();
  programs.freeze(true);
  const icons = [...document.querySelectorAll<HTMLImageElement>("#prog-pane .prog-icon")];
  await Promise.race([Promise.all(icons.map(i => i.decode().catch(() => {}))), new Promise(r => setTimeout(r, 300))]);
  const logoImg = () => [...document.querySelectorAll<HTMLImageElement>("#top-logo img")].find(i => i.getBoundingClientRect().width > 0) ?? document.querySelector<HTMLImageElement>("#top-logo img")!;
  const light = document.documentElement.dataset.theme === "light";
  window.addEventListener("linksuite-intro-done", () => {
    api.introDone();
    programs.freeze(false);
    focusTab();
  }, { once: true });
  playLauncherIntro({
    layer,
    logoBox: () => logoImg().getBoundingClientRect(),
    targets: () => {
      const head = document.querySelector(".top")!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>("#prog-pane .prog")].map(card => {
        const icon = card.querySelector<HTMLImageElement>(".prog-icon")!, r = icon.getBoundingClientRect();
        const visible = r.width > 0 && r.bottom > head.bottom && r.top < innerHeight - 8 && r.right > 0 && r.left < innerWidth;
        return { id: (card.dataset.key ?? "").split(":")[0]!, card, icon, src: icon.currentSrc || icon.src, visible };
      });
    },
    symbolSrc: "./icons/symbol.svg",
    logoSrc: light ? "./icons/logo-horizontal-on-light.svg" : "./icons/logo-horizontal-on-dark.svg",
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    holdAt,
    text: t,
  });
}

// ------------------------------------------------------------------ Selbst-Update (Einstellungen → Über)
function renderSelf(): void {
  const e = programs.entry("suite");
  const u = programs.upd;
  const ctl = $("self-ctl");
  const stateEl = $("self-state");
  ctl.replaceChildren();
  const page = () => h("button", { class: "btn", type: "button", text: t("prog.openPage"), onclick: () => void api.openReleasePage("suite") });
  if (u?.selfResult) { stateEl.textContent = u.selfResult; }
  else if (!e || e.check === "unknown" || e.check === "checking") { stateEl.textContent = t("set.self.unchecked"); }
  else if (e.check === "missing") stateEl.textContent = t("set.self.none");
  else if (e.check === "error") stateEl.textContent = `${t("pill.checkMissing")} · ${e.error}`;
  else if (e.latest && isNewer(e.latest.version, appInfo.version) && u?.selfBlocked) {
    // Selbst-Update geht hier nicht (nicht beschreibbar, aus dem Image, AppTranslocation): Hinweis + nur „Seite öffnen“
    stateEl.textContent = `${t("pill.update", { v: e.latest.version })} · ${u.selfBlocked}`;
    ctl.append(page());
  }
  else if (e.latest && isNewer(e.latest.version, appInfo.version)) {
    stateEl.textContent = e.message || t("pill.update", { v: e.latest.version });
    const busy = e.phase === "download" || e.phase === "verify" || e.phase === "install" || e.phase === "waiting";
    if (e.phase !== "done") ctl.append(h("button", { class: "btn primary", type: "button", disabled: busy || !e.latest.sha256, text: busy ? t(`inst.phase.${e.phase}`) : t("set.self.update", { v: e.latest.version }), onclick: () => void api.install("suite") }));
    else if (u?.selfPending) ctl.append(h("button", { class: "btn primary", type: "button", text: t("set.self.restart"), onclick: () => void api.restartForUpdate() }));
  } else stateEl.textContent = t("set.self.current", { v: appInfo.version });
  ctl.append(h("button", { class: "btn small", type: "button", text: t("progs.checkAll"), onclick: () => void api.checkUpdates().then(u => { programs.updates(u); renderSelf(); }) }));
}

// ------------------------------------------------------------------ Start
async function boot(): Promise<void> {
  appInfo = await api.info();
  programs.selfVersion = appInfo.version;
  const s = await api.settingsGet();
  settings.apply(s);
  applyI18n(document);
  $("about-name").textContent = `Link-Suite ${appInfo.version}`;
  $("chip-demo").hidden = !appInfo.demo;
  const withIntro = s.suite.intro && (!appInfo.shot || appInfo.shot.intro > 0);
  if (withIntro) coverIntro(); else { $("intro").remove(); api.introDone(); }
  // Willkommen beim ersten Start (einmalig, über dem Hero; M5)
  if (!s.welcomed) {
    $("welcome").hidden = false;
    $("w-ok").addEventListener("click", () => { $("welcome").hidden = true; void api.welcomeDone(); });
    $("w-more").addEventListener("click", () => { void api.openHelp(); });
  }
  goTab("programs");
  programs.updates(await api.updates());
  programs.update(await api.state());
  renderChips(); renderFoot();
  api.mark("cards");
  if (withIntro) introStarted = intro(appInfo.shot ? appInfo.shot.intro : null);

  api.onState(st => { programs.update(st); renderChips(); renderFoot(); });
  renderSelf();
  api.onUpdates(u => { programs.updates(u); renderSelf(); });
  api.onLogs(b => log.receive(b));
  // Fensterzustand (macOS: Ampel-Platz, Vollbild, inaktives Fenster)
  api.onWin(w => {
    const h = document.documentElement;
    h.classList.toggle("mac", w.platform === "darwin");
    h.classList.toggle("fullscreen", w.fullscreen);
    h.classList.toggle("focused", w.focused);
  });
  // Menübefehle (⌘R, ⌘1–4, ⌘↩ …) laufen über dieselben Wege wie die Knöpfe
  api.onMenu(m => {
    if (m.cmd === "tab" && m.arg && (TABS as readonly string[]).includes(m.arg)) goTab(m.arg as Tab, true);
    else if (m.cmd === "rescan") { goTab("programs"); }
    else if (m.cmd === "chat") $("chat-btn").click();
    else if (m.cmd === "select" && m.arg && isProgramId(m.arg)) { goTab("programs"); programs.select(m.arg as ProgramId, true); }
    else if (m.cmd === "log" && m.arg && isProgramId(m.arg)) { goTab("programs"); void log.show(m.arg as ProgramId); }
    else programs.menuCommand(m.cmd);
  });
  api.onNet(() => void network.refresh());
  api.onSettings(x => settings.apply(x));
  new ChatUi(api);
  void network.refresh();

  if (appInfo.shot) await shot(appInfo);
}

/** Screenshot-Lauf (--shot): gewünschten Zustand herstellen, dann dem Hauptprozess „fertig“ melden. */
async function shot(i: Info): Promise<void> {
  const s = i.shot!;
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  // Startanimation als Standbild: nach `intro` ms aufnehmen
  if (s.intro > 0) { await introStarted; await wait(400); await api.shotReady(); return; }
  await wait(400);
  const tabName = (TABS as readonly string[]).includes(s.tab) ? (s.tab as Tab) : "programs";
  if (tabName !== "programs") goTab(tabName);
  if (s.run && isProgramId(s.run)) { await wait(2200); void log.show(s.run as ProgramId); }
  if (s.open && isProgramId(s.open)) programs.select(s.open as ProgramId);
  if (s.menu && isProgramId(s.menu)) programs.showMenu(s.menu as ProgramId);
  if (s.chat) { await wait(800); $("chat-btn").click(); }
  await wait(tabName === "network" ? 1500 : 600);
  await api.shotReady();
}

// Scheitert der Start, nie hinter der Startfläche hängen bleiben
boot().catch((e: unknown) => {
  console.error("boot failed", String((e as Error)?.message ?? e));
  document.getElementById("intro")?.remove();
  document.documentElement.classList.remove("intro-run");
});
