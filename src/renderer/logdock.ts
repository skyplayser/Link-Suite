// Log-Leiste unten im Tab PROGRAMME (Design „Log-Leiste“): ein Reiter je Programm dieser Sitzung, stdout grau,
// stderr rot-orange, Zeilen des Launchers hell. Nur Text (textContent), höchstens 5000 Zeilen je Prozess.
import type { ProgramId } from "../core/catalog";
import { LOG_MAX, type LogLine } from "../core/ringlog";
import type { LogBatch } from "../core/state";
import { api } from "./api";
import { t } from "./i18n";
import type { ProgramsView } from "./programs";
import { $, clock, h, hhmm, icon, toast } from "./ui";

export class LogDock {
  private readonly lines = new Map<ProgramId, LogLine[]>();
  private readonly order: ProgramId[] = [];
  visibleId: ProgramId | null = null;
  private open = false;
  private auto = true;
  private unseen = 0;

  constructor(private readonly view: ProgramsView) {
    const body = $("log-body");
    body.addEventListener("scroll", () => {
      const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 8;
      if (!atEnd && this.auto) { this.auto = false; this.renderHead(); }
      if (atEnd && !this.auto) { this.auto = true; this.unseen = 0; this.renderHead(); }
      this.renderJump();
    });
    $("log-jump").addEventListener("click", () => { this.auto = true; this.unseen = 0; this.scrollEnd(); this.renderHead(); this.renderJump(); });
    this.grip();
    window.setInterval(() => { if (this.open) this.renderHeadPill(); }, 1000);
  }

  has(id: ProgramId): boolean { return this.lines.has(id) || !!this.view.state(id)?.run; }

  /** Neue Zeilen aus dem Hauptprozess (gebündelt alle 100 ms). */
  receive(b: LogBatch): void {
    let list = this.lines.get(b.id);
    if (!list) { list = []; this.lines.set(b.id, list); }
    if (!this.order.includes(b.id)) this.order.push(b.id);
    list.push(...b.lines);
    const cut = list.length - LOG_MAX;
    if (cut > 0) list.splice(0, cut);
    if (this.open && this.visibleId === b.id) {
      const body = $("log-body");
      if (cut > 0) this.renderBody();
      else for (const l of b.lines) body.append(this.lineEl(l));
      while (body.childElementCount > LOG_MAX) body.firstElementChild?.remove();
      if (this.auto) this.scrollEnd(); else { this.unseen += b.lines.length; this.renderJump(); }
    }
    if (!this.open && b.lines.length && this.view.state(b.id)?.run) this.renderTabs();
  }

  /** Leiste für ein Programm zeigen (erster Entwicklerstart oder Knopf „Log“). Holt fehlende Zeilen nach. */
  async show(id: ProgramId): Promise<void> {
    if (!this.order.includes(id)) this.order.push(id);
    if (!this.lines.has(id)) this.lines.set(id, await api.logGet(id, 0));
    this.visibleId = id; this.open = true; this.auto = true; this.unseen = 0;
    $("log-dock").hidden = false;
    this.render();
    this.view.render();
  }

  close(): void {
    this.open = false;
    $("log-dock").hidden = true;
    this.view.render();
  }

  /** Zustand der Programme hat sich geändert (Exit, Stoppen …). */
  update(): void {
    if (this.open) { this.renderTabs(); this.renderHead(); }
  }

  private render(): void { this.renderTabs(); this.renderHead(); this.renderBody(); this.renderJump(); }

  private dotFor(id: ProgramId): string {
    const r = this.view.state(id)?.run;
    if (!r) return "grey";
    if (r.state === "running" || r.state === "stopping") return "green";
    return r.state === "failed" ? "red" : "grey";
  }

  private renderTabs(): void {
    const tabs = this.order.map(id => {
      const r = this.view.state(id)?.run;
      const label = this.view.name(id) + (r && r.state === "exited" ? ` · Exit ${r.code ?? 0}` : "");
      return h("button", {
        role: "tab", type: "button", class: id === this.visibleId ? "on" : undefined, "aria-selected": String(id === this.visibleId),
        onclick: () => void this.show(id),
      }, h("img", { src: this.view.icon(id), alt: "" }), h("span", { class: `dot ${this.dotFor(id)}` }), label);
    });
    $("log-tabs").replaceChildren(...tabs);
  }

  private headPill(): HTMLElement | null {
    const id = this.visibleId;
    const r = id ? this.view.state(id)?.run : null;
    if (!r) return null;
    if (r.state === "running" || r.state === "stopping") {
      return h("span", { class: "pill ok run", id: "log-pill" }, h("span", { class: "dot" }), t(r.state === "stopping" ? "pill.stopping" : "pill.running") + " ",
        h("em", { text: `PID ${r.pid} · ${clock(Date.now() - r.startedAt)}` }));
    }
    const time = hhmm(r.endedAt);
    if (r.state === "stopped") return h("span", { class: "exit stop", id: "log-pill", text: t("log.stopped", { time }) });
    return h("span", { class: `exit ${r.state === "exited" ? "ok" : "err"}`, id: "log-pill", text: t("log.exit", { code: r.code ?? r.signal ?? "?", time }) });
  }

  private renderHeadPill(): void {
    const old = document.getElementById("log-pill");
    const p = this.headPill();
    if (old && p) old.replaceWith(p);
  }

  private renderHead(): void {
    const id = this.visibleId;
    if (!id) return;
    const st = this.view.state(id);
    const r = st?.run;
    const running = !!r && (r.state === "running" || r.state === "stopping");
    const btns = h("div", { class: "btns" },
      h("button", { class: "btn small", type: "button", "aria-pressed": String(this.auto), text: t("log.autoscroll"),
        onclick: () => { this.auto = !this.auto; if (this.auto) { this.unseen = 0; this.scrollEnd(); } this.renderHead(); this.renderJump(); } }),
      h("button", { class: "btn small", type: "button", onclick: () => void api.logCopy(id).then(ok => ok && toast(t("log.copied"), "info")) }, icon("copy"), h("span", { text: t("log.copy") })),
      h("button", { class: "btn small", type: "button", onclick: () => { void api.logClear(id); this.lines.set(id, []); this.renderBody(); } }, icon("clear"), h("span", { text: t("log.clear") })),
      running
        ? h("button", { class: "btn small", type: "button", disabled: r!.state === "stopping", onclick: () => void this.view.stop(id) }, icon("stop", true), h("span", { text: t("log.stop") }))
        : r ? h("button", { class: "btn small primary", type: "button", onclick: () => void this.view.start(id, "dev", r.mode === "script" ? "script" : "auto") }, icon("refresh"), h("span", { text: t("prog.retry") })) : null,
      h("button", { class: "iconbtn small ghost", type: "button", "aria-label": t("log.close"), onclick: () => this.close() }, icon("x")));
    $("log-head").replaceChildren(
      h("b", { text: this.view.name(id) }),
      h("span", { class: "log-cmd" }, r ? r.dir + " " : "", h("span", { text: r ? `$ ${r.cmd}` : "" })),
      this.headPill() ?? "",
      btns);
  }

  private lineEl(l: LogLine): HTMLElement {
    return h("span", { class: `ln ${l.s}`, text: l.t || " " });
  }

  private renderBody(): void {
    const body = $("log-body");
    const list = this.visibleId ? this.lines.get(this.visibleId) ?? [] : [];
    body.replaceChildren(...(list.length ? list.map(l => this.lineEl(l)) : [h("span", { class: "ln sys", text: t("log.empty") })]));
    if (this.auto) this.scrollEnd();
  }

  private renderJump(): void {
    const show = !this.auto && this.unseen > 0;
    $("log-jump").hidden = !show;
    $("log-jump-text").textContent = t("log.jump", { n: this.unseen });
  }

  private scrollEnd(): void { const b = $("log-body"); b.scrollTop = b.scrollHeight; }

  /** Griff zum Ziehen: Höhe per CSSOM (--log-h), keine style-Attribute. Tastatur: ↑/↓. */
  private grip(): void {
    const dock = $("log-dock"), g = $("log-grip");
    const set = (px: number) => dock.style.setProperty("--log-h", `${Math.max(120, Math.min(window.innerHeight - 200, px))}px`);
    g.addEventListener("pointerdown", e => {
      g.setPointerCapture(e.pointerId);
      const startY = e.clientY, startH = dock.getBoundingClientRect().height;
      const move = (m: PointerEvent) => set(startH + (startY - m.clientY));
      const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up);
    });
    g.addEventListener("keydown", e => {
      const hgt = dock.getBoundingClientRect().height;
      if (e.key === "ArrowUp") { e.preventDefault(); set(hgt + 20); }
      if (e.key === "ArrowDown") { e.preventDefault(); set(hgt - 20); }
    });
  }
}
