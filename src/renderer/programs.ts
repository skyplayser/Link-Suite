// Tab PROGRAMME: Programmkarten, „Kommt bald“, Detailspalte, ⋯-Menü, Rückfragen vor dem Start (Design
// „Programmkarte im Detail“, „Dialoge“). Die Oberfläche schickt nur Kennungen; was startbar ist, entscheidet der
// Hauptprozess (und prüft es beim Start erneut).
import { updateTarget } from "../core/card";
import { CATALOG, MAIN_ORDER, programById, soonPrograms, type Program, type ProgramId } from "../core/catalog";
import { groupFor, GROUPS, mayRegroup, type Group } from "../core/groups";
import { firstMissing, type NeedKey } from "../core/need";
import type { Route } from "../core/settings";
import type { ProgramState, Snapshot } from "../core/state";
import { SOON_PUBLIC, sourceById } from "../core/sources";
import { isNewer } from "../core/version";
import type { UpdateEntry, UpdatesSnapshot } from "../main/installer";
import { api } from "./api";
import { currentLang, t } from "./i18n";
import type { LogDock } from "./logdock";
import { $, clock, duration, h, hhmm, icon, modal, toast } from "./ui";

const ICON = (p: Program) => "./icons/" + p.icon;


export class ProgramsView {
  snap: Snapshot | null = null;
  upd: UpdatesSnapshot | null = null;
  /** Eigene Version; die Kachel UPDATE zählt Link-Suite selbst mit (wie Dock und Tray, Windows-Test 1.0.2). */
  selfVersion = "";
  private selected: ProgramId | null = null;
  private openMenu: ProgramId | null = null;
  private busy = new Set<ProgramId>();
  private scanningNow = false;
  log!: LogDock;

  constructor(private readonly goTab: (tab: string) => void) {
    $("rescan").addEventListener("click", () => { void this.rescan(); });
    $("check-all").addEventListener("click", () => { void api.checkUpdates().then(u => this.updates(u)); });
    // Nie unter dem Mauszeiger umsortieren (QA Windows F3): Umgruppieren wartet, bis die Maus das Raster verlässt
    // bzw. das Fenster im Hintergrund ruht (1.0.1); geprüft beim Verlassen, beim Fokuswechsel und jede Sekunde
    $("prog-pane").addEventListener("pointerenter", () => { this.hovering = true; });
    $("prog-pane").addEventListener("pointerleave", () => { this.hovering = false; this.regroupWhenCalm(); });
    for (const ev of ["pointermove", "pointerdown", "wheel", "keydown"]) document.addEventListener(ev, () => { this.lastInput = Date.now(); }, { passive: true, capture: true });
    window.addEventListener("blur", () => this.regroupWhenCalm());
    window.setInterval(() => this.regroupWhenCalm(), 1000);
    document.addEventListener("click", e => {
      if (this.openMenu && !(e.target as Element).closest?.(".menu-wrap")) { this.openMenu = null; this.render(); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && this.openMenu) { const id = this.openMenu; this.openMenu = null; this.render(); this.focusKey(`${id}:more`); }
    });
    window.setInterval(() => this.tickClocks(), 1000);
  }

  state(id: ProgramId): ProgramState | null { return this.snap?.programs.find(p => p.id === id) ?? null; }

  async rescan(): Promise<void> {
    this.scanningNow = true; this.renderBar();
    try { this.update(await api.scan()); } finally { this.scanningNow = false; this.renderBar(); }
  }

  /** Entwickleransicht (QA Windows U1): aus = Entwicklerwege, Pfade und npm sind unsichtbar. */
  devView = true;
  private raw: Snapshot | null = null;
  setDevView(on: boolean): void {
    if (on === this.devView) return;
    this.devView = on;
    this.forceRegroup = true;
    if (this.raw) this.update(this.raw);
  }

  update(s: Snapshot): void {
    this.raw = s;
    // Erster vollständiger Suchlauf: Gruppen jetzt bilden (vorher kein „Noch nichts installiert“). Spätere Wechsel
    // (Suchlauf nach dem Zwischenspeicher, von außen installiert) sortieren still im nächsten ruhigen Moment ein.
    if (s.scannedAt && !this.snap?.scannedAt) this.forceRegroup = true;
    this.snap = this.devView ? s : { ...s, programs: s.programs.map(st => {
      const running = !!st.run && (st.run.state === "running" || st.run.state === "stopping");
      if (running) return st; // ein laufender Entwicklerstart bleibt sichtbar
      const routes = st.routes.filter(r => r !== "dev");
      return { ...st, dev: null, run: null, routes, route: st.route === "dev" ? routes[0] ?? null : st.route };
    }) };
    this.render();
    this.log?.update();
  }

  // ------------------------------------------------------------------ Darstellung (Design 0.3: Hero, Gruppen, eine Pille)
  /** Während der Startanimation keine Karten neu erzeugen (die animierten Elemente würden weggeworfen). */
  frozen = false;
  private pending = false;
  freeze(on: boolean): void {
    this.frozen = on;
    if (!on && this.pending) { this.pending = false; this.render(); }
  }

  /** Gruppe je Programm; wechselt nur in ruhigen Momenten bzw. nach eigener Installation (Raster springt sonst). */
  private groupOf = new Map<ProgramId, Group>();
  private forceRegroup = false;
  private hovering = false;
  private lastInput = 0;
  /** Eigene Installation fertig: dieses Programm sofort einsortieren, sobald es gefunden ist (höchstens 60 s lang). */
  private justInstalled = new Map<ProgramId, number>();

  private wanted(): Map<ProgramId, Group> {
    const out = new Map<ProgramId, Group>();
    for (const p of [...MAIN_ORDER.map(id => programById(id)!), ...soonPrograms()]) {
      const st = this.state(p.id);
      if (!st) continue;
      // Release auch ohne Netz, wenn eines bekannt war (N1)
      out.set(p.id, groupFor({ app: !!st.app, dev: st.routes.includes("dev") || !!st.run, stickOnly: !!p.stickOnly, release: !!this.entry(p.id)?.latest }));
    }
    return out;
  }

  /**
   * Umgruppieren (QA Windows F3, 1.0.1): erster Suchlauf und Entwickleransicht sofort; eigene Installation sofort, sobald
   * das Programm gefunden ist; alles andere (auch von außen installiert) nur bei geschlossenem Menü und ohne Zeiger über
   * dem Raster (mayRegroup).
   */
  private groups(): Map<Group, Program[]> {
    const want = this.wanted();
    const now = Date.now();
    let own = false;
    for (const [id, at] of this.justInstalled) {
      if (now - at > 60_000) this.justInstalled.delete(id);
      else if (want.get(id) === "installed" && this.groupOf.get(id) !== "installed") { own = true; this.justInstalled.delete(id); }
    }
    const fresh = [...want.keys()].some(id => !this.groupOf.has(id));
    const differs = [...want].some(([id, g]) => this.groupOf.get(id) !== g);
    if (mayRegroup({ force: this.forceRegroup || own, fresh, differs, hovering: this.hovering, menuOpen: !!this.openMenu, focused: document.hasFocus(), idleMs: now - this.lastInput })) {
      this.forceRegroup = false;
      for (const [id, g] of want) this.groupOf.set(id, g);
    }
    const out = new Map<Group, Program[]>(GROUPS.map(g => [g, []]));
    for (const p of [...MAIN_ORDER.map(id => programById(id)!), ...soonPrograms()]) out.get(this.groupOf.get(p.id) ?? "soon")!.push(p);
    return out;
  }

  /** Steht ein Wechsel aus und ist es jetzt ruhig: neu zeichnen (sortiert dabei um). */
  private regroupWhenCalm(): void {
    if (!this.snap || this.frozen) return;
    const want = this.wanted();
    const differs = [...want].some(([id, g]) => this.groupOf.get(id) !== g);
    if (differs && mayRegroup({ force: false, fresh: false, differs, hovering: this.hovering, menuOpen: !!this.openMenu, focused: document.hasFocus(), idleMs: Date.now() - this.lastInput })) this.render();
  }

  render(): void {
    if (!this.snap) return;
    if (this.frozen) { this.pending = true; this.renderBar(); return; }
    const key = (document.activeElement as HTMLElement | null)?.dataset?.key;
    this.renderBar();
    const groups = this.groups();
    for (const g of GROUPS) {
      const list = groups.get(g)!;
      const sec = $(`grp-${g}`);
      // INSTALLIERT leer: gestrichelter Hinweis statt leerer Gruppe
      const showEmpty = g === "installed" && !list.length && !!this.snap.scannedAt && (groups.get("avail")!.length > 0);
      sec.hidden = !list.length && !showEmpty;
      $(`n-${g}`).textContent = String(list.length);
      $(`progs-${g}`).replaceChildren(...(showEmpty ? [h("div", { class: "empty", text: t("g.installed.empty") })] : list.map(p => (g === "soon" ? this.soonCard(p, this.state(p.id)!) : this.card(p, this.state(p.id)!)))));
    }
    this.renderHero();
    this.renderDetail();
    if (key) this.focusKey(key);
  }

  private renderHero(): void {
    if (!this.snap) return;
    const ps = this.snap.programs;
    const self = this.entry("suite");
    const updates = ps.filter(st => { const e = this.entry(st.id); return !!st.app && !!e?.latest && isNewer(e.latest.version, st.app.version); }).length
      + (this.selfVersion && self?.latest && isNewer(self.latest.version, this.selfVersion) ? 1 : 0);
    const installed = ps.filter(st => st.app).length;
    const running = this.runningCount();
    const dev = [...this.groupOf.values()].filter(g => g === "dev").length;
    $("hero-sub").textContent = t("hero.sub", { n: CATALOG.length, k: installed });
    const ghDown = this.ghDown();
    const stat = (n: number, cls: string, word: string) => h("div", { class: `stat ${n > 0 ? cls : "zero"}` }, h("dd", { class: "num", text: String(n) }), h("dt", { text: word }));
    const stats: HTMLElement[] = [];
    if (!ghDown) stats.push(stat(updates, "warn", t(updates === 1 ? "stat.updates.one" : "stat.updates.other")));
    stats.push(stat(running, "ok", t(running === 1 ? "stat.running.one" : "stat.running.other")));
    stats.push(stat(installed, "", t("stat.installed")));
    if (dev > 0) stats.push(stat(dev, "dev", t("stat.dev")));
    $("hero-stats").replaceChildren(...stats);
  }

  /** GitHub nicht erreichbar: alle Prüfungen mit Fehler, keine gelungen. */
  private ghDown(): boolean {
    const es = this.upd?.entries ?? [];
    return es.some(e => e.check === "error") && !es.some(e => e.check === "ok" || e.check === "missing");
  }


  private lastPhase = new Map<string, string>();
  private lastStamp = new Map<string, number>();
  updates(u: UpdatesSnapshot): void {
    // Ende von Laden/Installieren: Toast statt bleibendem Hinweis in der Karte (Karte bleibt gleich hoch)
    for (const e of u.entries) {
      const before = this.lastPhase.get(e.id);
      if (before && before !== e.phase && e.phase === "done" && programById(e.id)) this.justInstalled.set(e.id as ProgramId, Date.now());
      // Jedes Ende mit Meldung zeigt einen Toast, auch wenn die Phase gleich bleibt (Windows-Test 1.0.2: zweiter Klick
      // bei GitHub-Limit blieb stumm); Programme ohne Karte (Link-Suite selbst) zeigen ihre Meldung in den Einstellungen
      const stamped = (e.stamp ?? 0) !== (this.lastStamp.get(e.id) ?? 0);
      if (before && (before !== e.phase || stamped) && (e.phase === "done" || e.phase === "failed" || e.phase === "cancelled") && e.message) {
        toast(e.message, e.phase === "failed" ? "err" : e.phase === "done" ? "ok" : "info");
      }
      this.lastPhase.set(e.id, e.phase);
      this.lastStamp.set(e.id, e.stamp ?? 0);
    }
    this.upd = u;
    this.render();
  }

  entry(id: string): UpdateEntry | null { return this.upd?.entries.find(e => e.id === id) ?? null; }

  private renderBar(): void {
    const u = this.upd;
    const gh = $("gh-when");
    const down = !u?.checking && this.ghDown();
    const limited = !!u?.rateLimitedUntil;
    gh.textContent = u?.checking ? t("progs.checkingGh")
      : limited ? (u!.lastGood ? t("gh.ratelimit", { time: hhmm(u!.lastGood) }) : t("gh.ratelimit0"))
      : down ? t("gh.unreachable") : u?.checkedAt ? t("progs.checked", { time: hhmm(u.checkedAt) }) : "";
    gh.classList.toggle("warn", down || limited);
    ($("check-all") as HTMLButtonElement).disabled = !!u?.checking;
    $("scan-when").textContent = this.scanningNow ? t("progs.scanning") : this.snap?.scannedAt ? t("progs.scanned", { time: hhmm(this.snap.scannedAt) }) : "";
    ($("rescan") as HTMLButtonElement).disabled = this.scanningNow;
  }

  private focusKey(key: string): void {
    document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  }

  private tickClocks(): void {
    for (const el of document.querySelectorAll<HTMLElement>("[data-since]")) {
      el.textContent = `PID ${el.dataset.pid} · ${clock(Date.now() - Number(el.dataset.since))}`;
    }
  }

  private runEm(st: ProgramState): HTMLElement {
    const r = st.run!;
    return h("em", { "data-since": r.startedAt, "data-pid": r.pid, text: `PID ${r.pid} · ${clock(Date.now() - r.startedAt)}` });
  }

  private updateDue(p: Program, st: ProgramState): boolean { return this.updateTo(p, st) !== null; }
  /** Zielversion des Updates (auch während einer laufenden Prüfung, aus dem letzten Stand). */
  private updateTo(p: Program, st: ProgramState): string | null { return updateTarget(this.entry(p.id)?.latest, st.app?.version, !!p.stickOnly); }


  private devRunning(st: ProgramState): boolean { return !!st.run && (st.run.state === "running" || st.run.state === "stopping"); }

  /**
   * GENAU EINE Zustands-Pille je Karte (Design 0.3, P1.1). Die erste zutreffende gewinnt: Fehler · läuft · Update ·
   * Entwickler · nur vom Stick · Prüfung fehlt · Konzept/in Entwicklung/bald verfügbar · sonst keine.
   */
  private pill(p: Program, st: ProgramState): HTMLElement | null {
    const e = this.entry(p.id);
    if (st.route === "dev" && st.run?.state === "failed") return h("span", { class: "pill err", text: t("pill.failed") });
    if (this.devRunning(st)) {
      if (st.run!.state === "stopping") return h("span", { class: "pill ok run" }, h("span", { class: "dot" }), t("pill.stopping"));
      return h("span", { class: "pill ok run" }, h("span", { class: "dot" }), t("pill.running") + " ", this.runEm(st));
    }
    if ((st.route === "app" && st.app?.running) || (st.dev?.externalPids.length ?? 0) > 0) {
      return h("span", { class: "pill ok run", title: st.dev?.externalPids.length ? t("pill.external") : undefined }, h("span", { class: "dot" }), t("pill.running"));
    }
    if (this.updateDue(p, st)) return h("span", { class: "pill warn", text: t("pill.updateShort") });
    if (st.route === "dev") return h("span", { class: "pill kind" }, icon("code"), t("pill.dev"));
    if (p.stickOnly) return h("span", { class: "pill off", text: t(this.snap?.platform === "win32" ? "pill.macOnly" : "pill.stickOnly") });
    if (e?.check === "error") return h("span", { class: "pill off", title: e.error, text: t("pill.checkMissing") });
    if (!st.app && SOON_PUBLIC.has(p.id)) return h("span", { class: "pill off", title: t("detail.notPublic"), text: t("pill.notPublic") });
    if (!st.route && p.stage === "concept") return h("span", { class: "pill dev", text: t("pill.concept") });
    if (!st.route && p.stage === "dev") return h("span", { class: "pill dev", text: t("pill.inDev") });
    return null;
  }

  private stageWord(p: Program): string {
    return p.stage === "beta" ? t("stage.beta") : p.stage === "alpha" ? t("stage.alpha") : t("stage.release");
  }

  /** Pfade mit „~“ statt /Users/<name> (kürzer, keine Namen im Bild); `title` behält den vollen Pfad. */
  private tilde(path: string): string { return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~"); }

  /** Zeile Version und Weg (`.prog-meta`, Design 0.3 P1.2). */
  private meta(p: Program, st: ProgramState): HTMLElement {
    const e = this.entry(p.id);
    const l = e?.check === "ok" ? e.latest : null;
    const vers = h("span", { class: "vers" });
    if (st.app) {
      vers.append(h("b", { text: st.app.version || "?" }));
      const to = this.updateTo(p, st);
      if (to) vers.append(" ", h("span", { class: "to", text: `→ ${to}` }));
    } else if (st.dev && st.route === "dev") {
      vers.append(h("b", { text: st.dev.version || "?" }));
      if (l && !p.stickOnly) vers.append(h("span", { class: "chan", text: t("meta.chan", { stage: this.stageWord(p), v: l.version }) }));
    } else if (p.stickOnly) {
      const v = l?.version ?? p.knownRelease;
      if (v) vers.append(h("b", { text: `${this.stageWord(p)} ${v}` }));
    } else if (l) {
      vers.append(h("b", { text: `${this.stageWord(p)} ${l.version}` }));
    }
    let path: HTMLElement | null = null;
    if (st.route === "app" && st.app) {
      path = h("span", { class: "path", title: st.app.path }, icon(st.app.onVolume ? "usb" : "app"), h("span", { text: this.tilde(st.app.path) }));
    } else if (st.route === "dev" && st.dev) {
      const cmd = st.run && this.devRunning(st) ? st.run.cmd : st.dev.status === "ready" ? "electron ." : st.dev.scriptCmd;
      path = h("span", { class: "path", title: `${st.dev.dir}${cmd ? ` · ${cmd}` : ""}` }, icon("folder"), h("span", { text: `${this.tilde(st.dev.dir)}${cmd ? ` · ${cmd}` : ""}` }));
    } else if (p.stickOnly) {
      path = h("span", { class: "path", title: t("route.stick") }, icon("usb"), h("span", { text: t("route.stick") }));
    } else if (st.dev) {
      const miss = firstMissing(st.dev);
      path = h("span", { class: "path", title: st.dev.dir }, icon("folder"), h("span", { text: miss ? t("meta.missing", { what: t(`need.short.${miss}`) }) : this.tilde(st.dev.dir) }));
    }
    const out = h("div", { class: "prog-meta" });
    if (vers.childNodes.length) out.append(vers);
    if (vers.childNodes.length && path) out.append(h("span", { class: "sep", text: "·" }));
    if (path) out.append(path);
    return out;
  }

  /** Installieren/Aktualisieren/Auf den Stick bzw. Seite öffnen; null, wenn nichts zu tun ist. */
  private installButton(p: Program, st: ProgramState): HTMLElement | null {
    const e = this.entry(p.id);
    const l = e?.check === "ok" ? e.latest : null;
    if (!l) return null;
    if (st.app && !this.updateDue(p, st) && !p.stickOnly) return null;
    // Pink-Fläche nur für Aktualisieren, Installieren (Gruppe VERFÜGBAR) und Auf den Stick
    const primary = this.updateDue(p, st) || p.stickOnly || this.groupOf.get(p.id) === "avail";
    if (!(l.url && l.sha256)) {
      return h("button", { class: "btn", type: "button", "data-key": `${p.id}:page`, onclick: (ev: Event) => { ev.stopPropagation(); void api.openReleasePage(p.id); } }, icon("ext"), h("span", { text: t("prog.openPage") }));
    }
    const label = p.stickOnly ? t("prog.ljlGet") : st.app ? t("prog.update") : t("prog.install");
    return h("button", {
      class: "btn" + (primary ? " primary main" : ""), type: "button", "data-key": `${p.id}:install`,
      onclick: (ev: Event) => { ev.stopPropagation(); void api.install(p.id).then(u => { if (u.error) toast(u.error, "err"); this.updates(u); }); },
    }, icon(p.stickOnly ? "usb" : "download"), h("span", { text: label }));
  }

  /** Laden/Prüfen/Einsetzen: feste Zeile gleicher Höhe statt der Knöpfe (Design 0.3 P2.8). */
  private loadRow(p: Program, e: UpdateEntry): HTMLElement[] {
    // Installer offen (Windows): Hinweis ohne Balken und „Zurücksetzen“ (1.0.1); der Hinweis kürzt sich, nichts überlappt
    if (e.phase === "waiting") return [
      h("div", { class: "prog-load wait" }, h("span", { class: "lbl", text: t("inst.phase.waiting") })),
      h("button", { class: "btn", type: "button", title: t("prog.reset.tip"), "data-key": `${p.id}:reset`, onclick: (ev: Event) => { ev.stopPropagation(); void api.cancelInstall(p.id); } }, h("span", { text: t("prog.reset") })),
    ];
    const bar = h("i");
    const full = e.phase !== "download";
    bar.style.width = `${full ? 100 : Math.round(e.progress * 100)}%`; // CSSOM, kein style-Attribut
    return [
      h("div", { class: "prog-load" }, h("span", { class: "lbl", text: t(`inst.phase.${e.phase}`) }), h("div", { class: "progress" }, bar),
        h("span", { class: "pct", text: full ? "" : `${Math.round(e.progress * 100)} %` })),
      h("button", { class: "btn", type: "button", disabled: full, "data-key": `${p.id}:cancel`, onclick: (ev: Event) => { ev.stopPropagation(); void api.cancelInstall(p.id); } }, h("span", { text: t("prog.cancel") })),
    ];
  }


  private routeSeg(p: Program, st: ProgramState, small: boolean): HTMLElement {
    const btn = (r: Route, label: string, ico: string, enabled: boolean) => h("button", {
      type: "button", role: "radio", "aria-checked": String(st.route === r), disabled: !enabled || this.devRunning(st),
      title: !enabled ? (r === "app" ? t("detail.appMissing") : t("detail.devMissing")) : undefined,
      "data-key": `${p.id}:route-${r}${small ? "" : "-d"}`,
      onclick: (e: Event) => { e.stopPropagation(); void this.setRoute(p.id, r); },
    }, icon(ico), h("span", { text: label }));
    return h("div", { class: "seg" + (small ? " small" : ""), role: "radiogroup", "aria-label": t("route.aria") },
      btn("app", t("route.app"), "app", st.routes.includes("app")), btn("dev", t("route.dev"), "code", st.routes.includes("dev")));
  }

  private needList(st: ProgramState, p: Program): HTMLElement | null {
    const d = st.dev;
    if (!d) return null;
    const label = (k: NeedKey, have: boolean): (Node | string)[] => {
      const code = (s: string) => h("code", { text: s });
      switch (k) {
        case "folder": return [t("need.folder") + " ", code(d.dir), have ? "" : " " + t("need.missSuffix")];
        case "suite": return [have ? t("need.suite", { pkg: p.pkgName ?? "" }) : t("need.suite.miss", { pkg: p.pkgName ?? "" })];
        case "built": return [have ? t("need.built") : t("need.built.miss"), d.main ? " (" : "", d.main ? code(d.main) : "", d.main ? ")" : ""];
        default: return [t(`need.${k}${have ? "" : ".miss"}`)];
      }
    };
    const first = firstMissing(d);
    const items = d.need.map(n => h("li", { class: n.have ? "have" : "miss" }, h("span", {}, ...label(n.key, n.have))));
    if (first) items.push(h("li", { class: "next" }, h("span", { text: t(`need.next.${first}`) })));
    return h("ul", { class: "need", "aria-label": t("need.aria") }, ...items);
  }

  private card(p: Program, st: ProgramState): HTMLElement {
    const running = this.devRunning(st);
    const failed = st.route === "dev" && st.run?.state === "failed";
    const startable = st.route !== null;
    const art = h("article", {
      class: "prog" + (this.selected === p.id ? " sel" : "") + (failed ? " err" : ""), tabindex: 0, "aria-labelledby": `p-${p.id}`,
      "aria-current": this.selected === p.id ? "true" : undefined, "data-key": `${p.id}:card`,
      onclick: (e: Event) => { if (!(e.target as Element).closest("button,.menu")) this.select(p.id, true); },
      onkeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key !== "Enter" || k.target !== art) return;
        k.preventDefault();
        // Enter auf der gewählten Karte = ihr Startknopf, sonst auswählen
        const go = art.querySelector<HTMLButtonElement>(".btn.go:not(:disabled)");
        if (this.selected === p.id && go && !art.querySelector(".btn.primary")) go.click(); else this.select(p.id, true);
      },
    });
    const pill = this.pill(p, st);
    const body = h("div", { class: "prog-body" },
      h("div", { class: "prog-head" }, h("h3", { id: `p-${p.id}`, text: p.name }), pill ? h("span", { class: "pills" }, pill) : null),
      h("p", { class: "prog-line", title: p.line[currentLang()], text: p.line[currentLang()] }),
      this.meta(p, st));
    if (failed) {
      const r = st.run!;
      body.append(h("div", { class: "prog-err" }, icon("alert"), h("div", {},
        h("b", { text: t("prog.err.exit", { code: r.code ?? r.signal ?? "?", took: duration(r.endedAt - r.startedAt) }) }), " ",
        h("span", { text: r.lastLine ? t("prog.err.last", { line: r.lastLine }) : t("prog.err.none") }))));
    }
    if (!startable && st.dev && !p.stickOnly && this.groupOf.get(p.id) !== "avail") { const n = this.needList(st, p); if (n) body.append(n); }

    const act = h("div", { class: "prog-act" }, h("span", { class: "sp" }));
    const btn = (key: string, label: string, ico: string, fill: boolean, cls: string, fn: () => void, extra: Record<string, string> = {}) =>
      h("button", { class: `btn ${cls}`.trim(), type: "button", "data-key": `${p.id}:${key}`, disabled: this.busy.has(p.id) && cls.includes("main"), onclick: (e: Event) => { e.stopPropagation(); fn(); }, ...extra },
        icon(ico, fill), h("span", { text: label }));
    const e = this.entry(p.id);
    const loading = !!e && (e.phase === "download" || e.phase === "verify" || e.phase === "install" || e.phase === "waiting");
    if (loading) {
      act.replaceChildren(...this.loadRow(p, e!));
    } else {
      // [Neben-Knopf] [Hauptknopf] [⋯]; „Starten“ ist keine Pink-Fläche (btn main go)
      let start: HTMLElement | null = null;
      const side: HTMLElement[] = [];
      if (st.route === "app" && st.app) {
        start = st.app.running ? btn("main", t("prog.front"), "front", false, "main go", () => void this.start(p.id, "app"))
          : btn("main", t("prog.start"), "play", true, "main go", () => void this.start(p.id, "app"));
      } else if (st.route === "dev" && st.dev) {
        if (running) {
          side.push(btn("log", t("prog.log"), "log", false, "", () => this.log.show(p.id), { "aria-pressed": String(this.log.visibleId === p.id) }));
          start = btn("stop", t("prog.stop"), "stop", true, "main", () => void this.stop(p.id));
          if (st.run!.state === "stopping") (start as HTMLButtonElement).disabled = true;
        } else if (failed) {
          side.push(btn("log", t("prog.log"), "log", false, "", () => this.log.show(p.id)));
          start = btn("main", t("prog.retry"), "refresh", false, "main go", () => void this.start(p.id, "dev"));
        } else if (st.dev.externalPids.length) {
          // läuft im Terminal: nichts zu starten
        } else if (st.dev.status === "ready") {
          start = btn("main", t("prog.startDev"), "play", true, "main go", () => void this.start(p.id, "dev"));
        } else if (st.dev.status === "needs-build") {
          start = btn("main", t("prog.buildStart"), "play", true, "main go", () => void this.start(p.id, "dev", "script"));
        }
      } else if (st.dev && st.dev.need[0]?.have && !p.stickOnly) {
        side.push(btn("reveal", this.revealLabel(), "folder", false, "", () => void api.reveal(p.id, "dev")));
      }
      // LJL unter Windows: immer „Auf den Stick“ (Erklärung im Club-Stick-Tab), nie wechselnd mit „Seite öffnen“
      const inst = p.stickOnly && this.snap?.platform === "win32" ? null : this.installButton(p, st);
      if (!inst && p.stickOnly && !st.app) {
        side.push(btn("stick", t("prog.prepareStick"), "usb", false, "", () => this.goTab("stick")));
      }
      if (inst && inst.classList.contains("primary")) act.append(...side, ...(start ? [start] : []), inst);
      else act.append(...(inst ? [inst] : []), ...side, ...(start ? [start] : []));
    }
    act.append(this.menu(p, st));
    body.append(act);
    art.append(h("img", { class: "prog-icon", src: ICON(p), alt: "" }), body);
    return art;
  }


  private revealLabel(): string { return this.snap?.platform === "win32" ? t("prog.revealWin") : t("prog.reveal"); }

  private menu(p: Program, st: ProgramState): HTMLElement {
    const open = this.openMenu === p.id;
    const more = h("button", {
      class: "btn more", type: "button", "aria-label": t("prog.more", { name: p.name }), "aria-haspopup": "menu", "aria-expanded": String(open), "data-key": `${p.id}:more`,
      onclick: (e: Event) => { e.stopPropagation(); this.openMenu = open ? null : p.id; this.render(); if (!open) document.querySelector<HTMLElement>(`[data-key="${p.id}:menu0"]`)?.focus(); },
    }, icon("more", true));
    const wrap = h("div", { class: "menu-wrap" }, more);
    if (!open) return wrap;
    const items: HTMLElement[] = [];
    let n = 0;
    const item = (role: string, label: string, ico: string, fn: (() => void) | null, extra: Record<string, string> = {}, small?: string) => {
      const b = h("button", {
        role, type: "button", disabled: !fn, "data-key": `${p.id}:menu${n++}`, ...extra,
        onclick: (e: Event) => { e.stopPropagation(); this.openMenu = null; this.render(); fn?.(); },
      }, icon(ico), h("span", { text: label }), small ? h("small", { text: small }) : null);
      items.push(b);
    };
    if (st.routes.length === 2) {
      items.push(h("div", { class: "menu-label", text: t("menu.route") }));
      item("menuitemradio", t("route.app"), "app", () => void this.setRoute(p.id, "app"), { "aria-checked": String(st.route === "app") }, st.app?.path.startsWith("/Applications/") ? "/Applications" : undefined);
      item("menuitemradio", t("route.dev"), "code", () => void this.setRoute(p.id, "dev"), { "aria-checked": String(st.route === "dev") }, st.dev?.status === "ready" ? "electron ." : st.dev?.scriptCmd);
      items.push(h("hr"));
    }
    const revealRoute: Route | null = st.route ?? (st.app ? "app" : st.dev?.need[0]?.have ? "dev" : null);
    item("menuitem", this.revealLabel(), "folder", revealRoute ? () => void api.reveal(p.id, revealRoute) : null);
    item("menuitem", t("menu.lastLog"), "log", this.log.has(p.id) ? () => this.log.show(p.id) : null);
    if (st.dev?.status === "ready" && st.dev.script && !this.devRunning(st)) {
      item("menuitem", t("menu.script", { cmd: st.dev.scriptCmd }), "package", () => void this.start(p.id, "dev", "script"));
    }
    item("menuitem", t("menu.page"), "ext", null, {}, t("common.v02"));
    item("menuitem", t("menu.changes"), "info", null, {}, t("common.v02"));
    const menu = h("div", {
      class: "menu", role: "menu",
      onkeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key !== "ArrowDown" && k.key !== "ArrowUp") return;
        k.preventDefault();
        const list = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(i + (k.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
      },
    }, ...items);
    wrap.append(menu);
    return wrap;
  }

  private soonCard(p: Program, st: ProgramState): HTMLElement {
    const pill = this.pill(p, st);
    return h("article", {
      class: "prog small openable" + (this.selected === p.id ? " sel" : ""), tabindex: 0, "aria-labelledby": `s-${p.id}`, "data-key": `${p.id}:card`,
      onclick: () => this.select(p.id, true),
      onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); this.select(p.id, true); } },
    },
    h("img", { class: "prog-icon", src: ICON(p), alt: "" }),
    h("div", { class: "prog-body" },
      h("div", { class: "prog-head" }, h("h3", { id: `s-${p.id}`, text: p.name }), pill ? h("span", { class: "pills" }, pill) : null),
      h("p", { class: "prog-line", title: p.line[currentLang()], text: p.line[currentLang()] }),
      // ohne Entwickleransicht bzw. ohne Ordner nur Name, Einzeiler und Pille (QA Windows U1)
      st.dev ? this.meta(p, st) : null));
  }


  // ------------------------------------------------------------------ Detailspalte
  /** Auswahl (Detailspalte). `keep`: Klick auf die Karte wählt nur aus, schließt nicht (Schließen über ✕). */
  select(id: ProgramId | null, keep = false): void {
    this.selected = keep ? id : this.selected === id ? null : id;
    this.render();
  }

  private renderDetail(): void {
    const aside = $("detail");
    const split = $("prog-split");
    const st = this.selected ? this.state(this.selected) : null;
    const p = this.selected ? programById(this.selected) : null;
    if (!st || !p) { aside.hidden = true; split.classList.remove("has-detail"); return; }
    aside.hidden = false; split.classList.add("has-detail");
    const running = this.devRunning(st);
    const sub = st.route === "app" ? (st.app?.running ? t("detail.appRun") : t("detail.appReady"))
      : st.route === "dev" ? (running || st.dev?.externalPids.length ? t("detail.devRun") : t("detail.devReady"))
      : p.stickOnly ? t("detail.stick") : st.dev ? t("detail.notStartable") : t("detail.notInstalled");
    const kids: Node[] = [
      h("div", { class: "detail-head" }, h("img", { src: ICON(p), alt: "" }), h("div", {}, h("b", { id: `d-${p.id}`, text: p.name }), h("small", { text: sub })),
        h("button", { class: "iconbtn small ghost", type: "button", "aria-label": t("detail.close"), "data-key": "detail:close", onclick: () => this.select(null) }, icon("x"))),
    ];
    if (st.app || st.dev) {
      kids.push(h("div", { class: "sec", text: t("detail.route") }), this.routeSeg(p, st, false));
    }
    const kv = h("dl", { class: "kv" });
    const row = (k: string, v: string | Node, txt = false) => kv.append(h("dt", { text: k }), h("dd", { class: txt ? "txt" : undefined }, v));
    const hints: HTMLElement[] = [];
    const hint = (text: string) => hints.push(h("div", { class: "hint" }, icon("info"), h("div", { text })));
    if (st.route === "app" && st.app) {
      row(t("detail.path"), st.app.path);
      if (st.app.bundleId) row(t("detail.bundle"), st.app.bundleId);
      row(t("detail.version"), st.app.version || "–");
      if (st.app.others.length) row(t("detail.others"), st.app.others.join("\n"));
    } else if (st.dev && (st.route === "dev" || !st.route)) {
      const d = st.dev;
      row(t("detail.folder"), d.dir);
      if (st.route === "dev") {
        row(t("detail.command"), st.run && running ? st.run.cmd : d.status === "ready" ? "electron ." : d.scriptCmd);
        if (d.script) row(t("detail.script"), `${d.script}: ${d.scriptText}`);
      }
      if (d.version) row(t("detail.version"), h("span", {}, d.version + " ", h("span", { class: "muted", text: t("detail.pkg") })));
      if (st.run && running) {
        row(t("detail.pid"), String(st.run.pid));
        row(t("detail.since"), h("span", { text: hhmm(st.run.startedAt) }));
      }
      if (st.route === "dev") {
        if (st.run?.mode === "script" && running) hint(t("detail.hint.script", { cmd: st.run.cmd }));
        else if (d.status === "ready") hint(t("detail.hint.direct"));
        else if (d.status === "needs-build") hint(t("detail.hint.script", { cmd: d.scriptCmd }));
        if (d.stale) hint(t("detail.hint.stale"));
        if (d.externalPids.length) hint(t("detail.hint.external"));
      }
    } else if (!st.route && !st.dev && !p.stickOnly) {
      kids.push(h("p", { class: "muted small", text: p.devDir !== undefined ? t("need.short.dir") : t("detail.appMissing") }));
    } else if (p.stickOnly) {
      kids.push(h("p", { class: "muted small", text: t("prog.ljl.none") }));
    }
    if (st.app && st.dev && (p.id === "vj" || p.id === "vd")) hint(t("detail.hint.single"));
    if (kv.childElementCount) kids.push(kv);
    if (!st.route && st.dev) { const n = this.needList(st, p); if (n) kids.push(h("div", { class: "sec", text: t("detail.need") }), n); }
    kids.push(...hints);
    kids.push(h("div", { class: "sec" }, h("span", { text: t("detail.release") })));
    const rel = h("dl", { class: "kv" });
    const ue = this.entry(p.id);
    const src = sourceById(p.id);
    if (ue?.latest) {
      const l = ue.latest;
      rel.append(h("dt", { text: t("detail.latest") }), h("dd", { text: `${l.version}${l.prerelease ? ` (${t("detail.pre")})` : ""}` }));
      if (src) rel.append(h("dt", { text: t("detail.origin") }), h("dd", { class: "txt", text: `github.com/${src.repo}` }));
      if (l.size) rel.append(h("dt", { text: t("detail.size") }), h("dd", { text: `${(l.size / 1_048_576).toFixed(1)} MB · ${l.asset}` }));
      if (l.sha256) rel.append(h("dt", { text: "SHA-256" }), h("dd", { text: l.sha256.slice(0, 16) + "…", title: l.sha256 }));
    } else if (SOON_PUBLIC.has(p.id)) {
      rel.append(h("dt", { text: t("detail.known") }), h("dd", { class: "txt", text: t("detail.notPublic") }));
    } else {
      rel.append(h("dt", { text: t("detail.known") }), h("dd", { class: "txt", text: p.knownRelease ? t("detail.knownNote", { v: p.knownRelease }) : t("detail.noRelease") }));
    }
    kids.push(rel);
    if (ue?.latest?.notes) {
      kids.push(h("div", { class: "sec", text: t("detail.notes") }));
      kids.push(h("div", { class: "notes relnotes", text: ue.latest.notes.split("\n").slice(0, 14).join("\n") }));
    }
    if (ue?.latest) kids.push(h("div", { class: "note amber" }, h("span", { text: t("inst.note") })));
    const btns = h("div", { class: "btns" });
    const revealRoute: Route | null = st.route ?? (st.app ? "app" : st.dev?.need[0]?.have ? "dev" : null);
    if (revealRoute) btns.append(h("button", { class: "btn", type: "button", "data-key": "detail:reveal", onclick: () => void api.reveal(p.id, revealRoute) }, icon("folder"), h("span", { text: this.revealLabel() })));
    if (this.log.has(p.id)) btns.append(h("button", { class: "btn", type: "button", "aria-pressed": String(this.log.visibleId === p.id), "data-key": "detail:log", onclick: () => this.log.show(p.id) }, icon("log"), h("span", { text: t("prog.log") })));
    if (btns.childElementCount) kids.push(btns);
    aside.setAttribute("aria-labelledby", `d-${p.id}`);
    aside.replaceChildren(...kids);
  }

  // ------------------------------------------------------------------ Aktionen
  private async setRoute(id: ProgramId, r: Route): Promise<void> {
    this.update(await api.setRoute(id, r));
  }

  async stop(id: ProgramId): Promise<void> {
    this.update(await api.stop(id));
  }

  /**
   * Starten: läuft dieselbe App schon (Einzelinstanz) → Hinweis hier. Den Skript-Weg (Build) stößt die Oberfläche nur
   * an; die Rückfrage „Das ändert Dateien im Projektordner“ stellt der Hauptprozess selbst (nativer Dialog).
   */
  async start(id: ProgramId, route: Route, mode: "auto" | "script" = "auto"): Promise<void> {
    const p = programById(id)!;
    if (this.busy.has(id)) return;
    this.busy.add(id);
    try {
      let force = false;
      for (let i = 0; i < 2; i++) {
        const r = await api.launch(id, route, mode, force);
        if (r.ok) {
          if (r.demo) toast(t("toast.demo", { name: p.name }), "info");
          else toast(t(route === "app" && this.state(id)?.app?.running ? "toast.front" : "toast.started", { name: p.name }));
          if (route === "dev") this.log.show(id);
          break;
        }
        if ("ask" in r && r.ask === "single") {
          const name = p.name;
          const v = await modal({
            role: "alertdialog", icon: ICON(p), title: t("ask.single.title", { name }),
            body: [h("p", { text: t(r.other === "app" ? "ask.single.app" : "ask.single.dev", { name }) })],
            buttons: [{ label: t("common.cancel"), value: "cancel", ghost: true, focus: true }, { label: t("ask.anyway"), value: "go", primary: true }],
          });
          if (v !== "go") break;
          force = true;
          continue;
        }
        if ("cancelled" in r) break; // Rückfrage im Hauptprozess abgebrochen
        if ("error" in r) { toast(r.error, "err"); break; }
      }
    } finally {
      this.busy.delete(id);
      this.update(await api.state());
    }
  }

  /** Menübefehle für die gewählte Karte (⌘↩, ⌥⌘R, ⌘L). */
  menuCommand(cmd: string): void {
    const id = this.selected;
    if (!id) return;
    const st = this.state(id);
    if (!st) return;
    if (cmd === "startSelected") {
      if (st.route === "dev" && st.run && (st.run.state === "running" || st.run.state === "stopping")) return;
      if (st.route) void this.start(id, st.route, st.route === "dev" && st.dev?.status === "needs-build" ? "script" : "auto");
    } else if (cmd === "revealSelected") {
      const r: Route | null = st.route ?? (st.app ? "app" : st.dev?.need[0]?.have ? "dev" : null);
      if (r) void api.reveal(id, r);
    } else if (cmd === "logSelected" && this.log.has(id)) void this.log.show(id);
  }

  /** Für Screenshots: ⋯-Menü einer Karte offen zeigen. */
  showMenu(id: ProgramId): void { this.openMenu = id; this.render(); }

  /** Zahl der laufenden Programme (Apps und Entwicklerstarts) für den Kopf. */
  runningCount(): number {
    if (!this.snap) return 0;
    return this.snap.programs.filter(st => st.app?.running || this.devRunning(st) || (st.dev?.externalPids.length ?? 0) > 0).length;
  }

  /** Programmname für ein Kennzeichen (Log-Leiste). */
  name(id: ProgramId): string { return programById(id)?.name ?? id; }
  icon(id: ProgramId): string { const p = programById(id); return p ? ICON(p) : ""; }
  all(): readonly Program[] { return CATALOG; }
}
