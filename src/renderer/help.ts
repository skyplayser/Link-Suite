// KI-Hilfe-Assistent (api.link-suite.de). Vorlage: Website/src/assets/js/chat.js. Die Aufrufe macht der Hauptprozess
// (src/main/helpdesk.ts); hier nur Anzeige. Vor der Bestätigung des KI-Hinweises wird nichts gesendet.
// Texte nur als textContent (Markdown wird zu Daten zerlegt, src/core/helpdesk.ts), Links öffnen nur über den
// Hauptprozess im Browser. Der Verlauf liegt nur im Arbeitsspeicher des Hauptprozesses (help:mem): übersteht ein
// Neuladen der Oberfläche (Sprachwechsel), ist aber weg, wenn Link-Suite beendet wird.
import { t } from "./i18n";
import { HELP_PRIVACY, HELP_WARN_AT, parseMarkdown, type Block, type HelpReport, type HelpSource, type Inline } from "../core/helpdesk";
import type { Bridge, HelpState } from "./api";

interface Msg { role: "user" | "bot"; text: string; sources?: HelpSource[]; ctx?: string; note?: boolean }
interface St { conv: string | null; program: string | null; log: Msg[]; left: number | null; closed: boolean; report: HelpReport | null }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fresh = (program: string | null): St => ({ conv: null, program, log: [], left: null, closed: false, report: null });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class HelpUi {
  private st: St;
  private info: HelpState | null = null;
  private open = false;
  private req = 0;
  private streaming: { msg: Msg; node: HTMLElement } | null = null;
  private raf = 0;
  /** Häkchen „Diagnose mitschicken“ (je Nachricht; nach dem Senden wieder aus). null = ab Werk (frisch → an). */
  private diagOn: boolean | null = null;
  private diagOpen = false;

  constructor(private readonly bridge: Bridge, private readonly selected: () => string | null) {
    this.st = fresh(null);
    void bridge.helpMem().then(raw => {
      let saved: St | null = null;
      try { saved = JSON.parse(raw || "null") as St | null; } catch { /* leer */ }
      if (!saved || !Array.isArray(saved.log)) return;
      this.st = saved;
      // Antwort lief beim Neuladen (z. B. Sprachwechsel) noch: als abgebrochen markieren
      const last = this.st.log[this.st.log.length - 1];
      if (last && last.role === "user") { this.st.log.push({ role: "bot", text: t("help.stopped") }); this.persist(); }
      if (this.open) this.render();
    });
    $("help-btn").addEventListener("click", () => void this.setOpen(!this.open));
    $("help-close").addEventListener("click", () => void this.setOpen(false));
    $("help-new").addEventListener("click", () => this.newChat());
    $("help-report").addEventListener("click", () => void this.requestReport());
    $("help-form").addEventListener("submit", e => { e.preventDefault(); this.sendOrStop(); });
    const input = $<HTMLTextAreaElement>("help-input");
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.sendOrStop(); } });
    $<HTMLSelectElement>("help-prog").addEventListener("change", e => { this.st.program = (e.target as HTMLSelectElement).value || null; this.diagOn = null; this.diagOpen = false; this.persist(); this.renderDiag(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && this.open && !document.querySelector("dialog[open]")) void this.setOpen(false); });
    bridge.onHelp(e => this.onEvent(e));
  }

  private persist(): void { void this.bridge.helpMem(JSON.stringify(this.st)); }

  /** Einstellungen → Zurücksetzen: alles weg, beim nächsten Öffnen kommt der Hinweis wieder. */
  async resetAll(): Promise<void> {
    if (this.streaming) void this.bridge.helpCancel(this.req);
    this.streaming = null;
    this.st = fresh(null);
    this.diagOn = null;
    this.diagOpen = false;
    this.info = await this.bridge.helpState();
    if (this.open) this.render();
  }

  async setOpen(on: boolean): Promise<void> {
    this.open = on;
    $("help-panel").hidden = !on;
    $("help-btn").setAttribute("aria-expanded", String(on));
    if (!on) { $("help-btn").focus(); return; }
    // Chat-Fenster schließen, beide liegen an derselben Stelle
    const chat = $("chat-panel");
    if (!chat.hidden) $("chat-close").click();
    this.info = await this.bridge.helpState();
    if (!this.st.log.length && !this.st.program) this.st.program = this.defaultProgram();
    this.render();
    if (this.info.consent) $("help-input").focus();
  }

  private defaultProgram(): string | null {
    const sel = this.selected();
    return sel && this.info?.programs.some(p => p.id === sel) ? sel : null;
  }

  // ------------------------------------------------------------------ Anzeige
  private render(): void {
    const consent = !!this.info?.consent;
    this.renderConsent(consent);
    const chat = consent && !!this.info?.allowed;
    $("help-list").hidden = !chat;
    $("help-foot").hidden = !chat;
    $("help-new").hidden = !chat || !this.st.log.length;
    $("help-form").hidden = !chat || this.st.closed;
    $("help-prog-row").hidden = !chat || this.st.log.length > 0;
    if (!chat) { $("help-diag").hidden = true; return; }
    this.renderPrograms();
    this.renderDiag();
    const list = $("help-list");
    list.replaceChildren(this.bubble({ role: "bot", text: t("help.hello"), note: true }));
    for (const m of this.st.log) list.append(this.bubble(m));
    if (this.st.report) list.append(this.reportBox(this.st.report));
    this.setLeft();
    $("help-report").hidden = !this.st.conv && !this.st.report;
    this.setBusy(!!this.streaming);
    list.scrollTop = list.scrollHeight;
  }

  private renderConsent(consent: boolean): void {
    const box = $("help-consent");
    box.hidden = consent;
    if (consent) { box.replaceChildren(); return; }
    const p = el("p");
    p.append(el("b", "", t("help.consent.title")), " ", t("help.consent.text"), " ");
    const lang = document.documentElement.lang === "en" ? "en" : "de";
    const a = el("a", "", t("help.consent.link"));
    a.href = HELP_PRIVACY[lang];
    a.addEventListener("click", e => { e.preventDefault(); void this.bridge.helpOpen(HELP_PRIVACY[lang]); });
    p.append(a, ".");
    const note = el("p", "muted small", t("help.consent.launcher"));
    const go = el("button", "btn primary", t("help.start"));
    go.type = "button";
    go.addEventListener("click", async () => {
      if (!(await this.bridge.helpConsent())) return;
      this.info = await this.bridge.helpState();
      if (!this.st.program) this.st.program = this.defaultProgram();
      this.render();
      $("help-input").focus();
    });
    box.replaceChildren(p, note, go);
  }

  private renderPrograms(): void {
    const sel = $<HTMLSelectElement>("help-prog");
    const opts = [el("option", "", t("help.program.none"))];
    opts[0]!.value = "";
    for (const p of this.info?.programs ?? []) {
      const o = el("option", "", p.version ? `${p.name} ${p.version}` : p.name);
      o.value = p.id;
      opts.push(o);
    }
    sel.replaceChildren(...opts);
    sel.value = this.st.program ?? "";
  }

  /** Zeile „Diagnose von … mitschicken“ mit Stand und Vorschau (Suite-Diagnose v1). */
  private renderDiag(): void {
    const box = $("help-diag");
    const p = this.info?.programs.find(x => x.id === this.st.program) ?? null;
    if (!p || this.st.closed) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    if (!p.diag) { box.replaceChildren(el("small", "muted", t("help.diag.none", { name: p.name }))); return; }
    if (this.diagOn === null) this.diagOn = false; // ab Werk aus (Art. 25 Abs. 2 DSGVO); ankreuzen zeigt den Text
    const show = el("button", "chat-link", this.diagOpen ? t("help.diag.hide") : t("help.diag.show"));
    const pre = el("pre", "help-diag-pre");
    const label = el("label", "help-diag-on");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = this.diagOn;
    cb.addEventListener("change", async () => {
      this.diagOn = cb.checked;
      // Beim Ankreuzen den Text zeigen – genau dieser Stand geht mit (der Hauptprozess merkt ihn sich)
      if (cb.checked) { this.diagOpen = true; pre.hidden = false; show.textContent = t("help.diag.hide"); pre.textContent = (await this.bridge.helpDiag(p.id)) ?? ""; }
    });
    const when = new Date(p.diag.at);
    const time = Number.isNaN(when.getTime()) ? "" : when.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    label.append(cb, " ", t("help.diag", { name: p.name }), " ", el("small", "muted", time ? t("help.diag.age", { time }) : ""));
    show.type = "button";
    pre.hidden = !this.diagOpen;
    show.addEventListener("click", async () => {
      this.diagOpen = !this.diagOpen;
      show.textContent = this.diagOpen ? t("help.diag.hide") : t("help.diag.show");
      pre.hidden = !this.diagOpen;
      if (this.diagOpen) pre.textContent = (await this.bridge.helpDiag(p.id)) ?? "";
    });
    if (this.diagOpen) void this.bridge.helpDiag(p.id).then(x => { pre.textContent = x ?? ""; });
    box.replaceChildren(label, show, pre);
  }

  private setLeft(): void {
    const n = this.st.left;
    $("help-left").textContent = this.st.closed || n === null || n > HELP_WARN_AT ? "" : n === 1 ? t("help.left1") : t("help.leftN", { n });
  }

  private setBusy(busy: boolean): void {
    const b = $<HTMLButtonElement>("help-send");
    b.textContent = busy ? t("help.stop") : t("help.send");
    b.classList.toggle("primary", !busy);
    $<HTMLTextAreaElement>("help-input").disabled = busy;
  }

  private inline(parts: Inline[], into: HTMLElement): void {
    for (const x of parts) {
      if (x.t === "text") into.append(x.v);
      else if (x.t === "b") into.append(el("b", "", x.v));
      else if (x.t === "code") into.append(el("code", "", x.v));
      else {
        const a = el("a", "", x.v);
        a.href = x.href;
        a.title = x.href;
        a.addEventListener("click", e => { e.preventDefault(); void this.bridge.helpOpen(x.href); });
        into.append(a);
      }
    }
  }

  private blocks(bs: Block[], into: HTMLElement): void {
    for (const b of bs) {
      if ("items" in b) { const l = el(b.t); for (const it of b.items) { const li = el("li"); this.inline(it, li); l.append(li); } into.append(l); continue; }
      const p = el("p");
      if (b.t === "h") { const s = el("b"); this.inline(b.c, s); p.append(s); } else this.inline(b.c, p);
      into.append(p);
    }
  }

  private fill(node: HTMLElement, m: Msg): void {
    node.replaceChildren(el("span", "sr", (m.role === "user" ? t("help.you") : t("help.bot")) + ": "));
    if (m.role === "user") {
      for (const line of m.text.split("\n")) node.append(el("p", "", line));
      if (m.ctx) node.append(el("small", "help-ctx", t("help.sentWith", { ctx: m.ctx })));
      return;
    }
    if (!m.text) { node.append(el("p", "help-wait", t("help.thinking"))); return; }
    this.blocks(parseMarkdown(m.text), node);
    if (m.sources?.length) {
      const p = el("p", "help-src");
      p.append(el("span", "", t("help.sources") + ":"));
      for (const s of m.sources) {
        const a = el("a", "", s.heading || s.title || s.url);
        a.href = s.url;
        a.addEventListener("click", e => { e.preventDefault(); void this.bridge.helpOpen(s.url); });
        p.append(" ", a);
      }
      node.append(p);
    }
  }

  private bubble(m: Msg): HTMLElement {
    const node = el("div", "chat-msg help-msg" + (m.role === "user" ? " self" : "") + (m.note ? " note" : ""));
    this.fill(node, m);
    return node;
  }

  private reportBox(rep: HelpReport): HTMLElement {
    const box = el("div", "help-report");
    const p = el("p");
    p.append(el("b", "", t("help.report.title")), el("br"), t("help.report.intro"));
    const mail = el("button", "btn primary", t("help.mail"));
    mail.type = "button";
    mail.addEventListener("click", () => void this.bridge.helpMail(rep.mailto));
    const copy = el("button", "btn", t("help.copy"));
    copy.type = "button";
    copy.addEventListener("click", async () => { if (await this.bridge.helpCopy(`${rep.subject}\n\n${rep.body}`)) copy.textContent = t("help.copied"); });
    const btns = el("p", "help-report-btns");
    btns.append(mail, copy);
    const det = el("details");
    det.append(el("summary", "", t("help.show")), el("pre", "", `${rep.to ? `→ ${rep.to}\n` : ""}${rep.subject}\n\n${rep.body}`));
    box.append(p, btns, det);
    return box;
  }

  // ------------------------------------------------------------------ Senden und Empfangen
  private sendOrStop(): void {
    if (this.streaming) { void this.bridge.helpCancel(this.req); return; }
    void this.send();
  }

  private async send(): Promise<void> {
    const input = $<HTMLTextAreaElement>("help-input");
    const text = input.value.trim();
    if (!text || this.st.closed || this.streaming) return;
    input.value = "";
    const user: Msg = { role: "user", text };
    this.st.log.push(user);
    const bot: Msg = { role: "bot", text: "", sources: [] };
    const list = $("help-list");
    $("help-prog-row").hidden = true;
    $("help-new").hidden = false;
    const userNode = this.bubble(user);
    const botNode = this.bubble(bot);
    list.append(userNode, botNode);
    list.scrollTop = list.scrollHeight;
    this.streaming = { msg: bot, node: botNode };
    this.setBusy(true);
    this.persist();
    const diag = this.diagOn === true && !!this.info?.programs.find(x => x.id === this.st.program)?.diag;
    const r = await this.bridge.helpSend({ message: text, program: this.st.program, conversationId: this.st.conv, diag });
    if ("error" in r) { bot.text = r.error; this.finish(); return; }
    this.req = r.req;
    const ctx = [r.prefix.replace(/^\[|\]$/g, ""), r.diag ? t("help.diag.sent") : ""].filter(Boolean).join(" · ");
    if (ctx) { user.ctx = ctx; this.fill(userNode, user); this.persist(); }
    if (r.diag) { this.diagOn = false; this.diagOpen = false; this.renderDiag(); }
  }

  private onEvent(e: Parameters<Parameters<Bridge["onHelp"]>[0]>[0]): void {
    if (!this.streaming || e.req !== this.req) return;
    const m = this.streaming.msg;
    if (e.ev === "meta") { if (e.conversationId) { this.st.conv = e.conversationId; $("help-report").hidden = false; } if (e.remaining !== null) this.st.left = e.remaining; this.setLeft(); }
    else if (e.ev === "sources") m.sources = e.sources;
    else if (e.ev === "delta") { m.text += e.text; if (!this.raf) this.raf = requestAnimationFrame(() => this.paint()); }
    else if (e.ev === "done") {
      if (e.remaining !== null) this.st.left = e.remaining;
      if (e.closed) { this.st.closed = true; if (e.report) this.st.report = e.report; }
      this.finish();
    } else if (e.ev === "error") {
      m.sources = [];
      m.text = e.code === "aborted" ? (m.text ? `${m.text}\n\n${t("help.stopped")}` : t("help.stopped")) : e.message || t("help.err.net");
      if (e.report) { this.st.closed = true; this.st.report = e.report; }
      this.finish();
    }
  }

  private paint(): void {
    this.raf = 0;
    if (!this.streaming) return;
    this.fill(this.streaming.node, this.streaming.msg);
    const list = $("help-list");
    list.scrollTop = list.scrollHeight;
  }

  private finish(): void {
    if (!this.streaming) return;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    const m = this.streaming.msg;
    if (!m.text) m.text = t("help.err.net");
    this.st.log.push(m);
    if (this.st.closed) this.st.log.push({ role: "bot", text: t("help.closed") });
    this.streaming = null;
    this.persist();
    this.render();
    if (!this.st.closed) $("help-input").focus();
  }

  private async requestReport(): Promise<void> {
    if (this.st.report) { this.render(); return; }
    if (!this.st.conv || this.streaming) return;
    const list = $("help-list");
    const wait = this.bubble({ role: "bot", text: "" });
    wait.replaceChildren(el("p", "help-wait", t("help.making")));
    list.append(wait);
    list.scrollTop = list.scrollHeight;
    const r = await this.bridge.helpReport(this.st.conv);
    wait.remove();
    if ("error" in r) { this.st.log.push({ role: "bot", text: r.message }); this.persist(); this.render(); return; }
    this.st.report = r;
    this.persist();
    this.render();
  }

  private newChat(): void {
    if (this.streaming) void this.bridge.helpCancel(this.req);
    if (this.st.log.length && !window.confirm(t("help.newConfirm"))) return;
    this.streaming = null;
    this.st = fresh(this.defaultProgram());
    this.persist();
    this.render();
    $("help-input").focus();
  }
}
