// Tab IM NETZ (Design „Bildschirmaufbau“, Konzept „Suite im Netz“): Teilnehmer aus `here`, gruppiert nach Absender-IP,
// „Dieser Rechner“ oben. Fremde Rechner werden nur angezeigt. Bonjour (Weboberflächen) kommt in 0.2.
import { programByChatApp } from "../core/catalog";
import type { NetSnapshot, Snapshot } from "../core/state";
import { groupByHost, type NetEntry } from "../core/suitenet";
import { isNewer, newest } from "../core/version";
import { api } from "./api";
import { t } from "./i18n";
import { $, h, hhmm, icon } from "./ui";

export class NetworkView {
  net: NetSnapshot | null = null;

  constructor(private readonly progs: () => Snapshot | null, private readonly onChange: () => void) {
    window.setInterval(() => { if ($("tab-network").classList.contains("on") && this.net?.entries.length) this.render(); }, 1000);
  }

  async refresh(): Promise<void> {
    this.net = await api.network();
    this.render();
    this.onChange();
  }

  /** Andere Programme im Netz (ohne diesen Launcher, ohne Gegangene) und ihre Rechner. */
  counts(): { programs: number; hosts: number } {
    const live = (this.net?.entries ?? []).filter(e => !e.gone && !e.self);
    return { programs: live.length, hosts: new Set(live.map(e => e.ip)).size };
  }

  private iconFor(e: NetEntry): string {
    if (e.app === "Link-Suite") return "./icons/link-suite.svg";
    const p = programByChatApp(e.app);
    return p ? "./icons/" + p.icon : "./icons/symbol.svg";
  }

  /**
   * Bezugsversion je Programm: veröffentlichte Version laut catalog.ts (`knownRelease`) und die hier installierte.
   * Versionen aus dem Netz zählen nicht als Bezug: ein gefälschtes `here` mit „ver: 99“ soll bei den anderen kein
   * „UPDATE 99“ auslösen (QA Befund 11). 0.1 fragt GitHub nicht.
   */
  private newestKnown(app: string): string | null {
    const p = programByChatApp(app);
    if (!p) return null;
    const st = this.progs()?.programs.find(x => x.id === p.id);
    return newest([p.knownRelease, st?.app?.version]);
  }

  private seen(e: NetEntry): string {
    if (e.gone) return t("net.goneSince", { time: hhmm(e.goneAt) });
    const s = Math.round((Date.now() - e.lastSeen) / 1000);
    if (s < 2) return t("net.now");
    return t("net.ago", { t: s < 60 ? `${s} s` : `${Math.round(s / 60)} min` });
  }

  private state(e: NetEntry, me: boolean): (Node | string)[] {
    if (e.gone) return [h("span", { class: "pill off", text: t("pill.gone") })];
    if (e.self) return [h("span", { class: "pill off", text: t("pill.self") })];
    if (!e.ver) return [h("span", { class: "pill off", text: t("pill.noVer") })];
    const best = this.newestKnown(e.app);
    if (best && isNewer(best, e.ver)) {
      return [h("span", { class: "pill warn", title: t("net.newer", { v: best }), text: t("pill.update", { v: best }) }), me ? "" : h("span", { class: "there", text: t("net.onThatHost") })];
    }
    // Entwicklerstart dieses Launchers auf diesem Rechner
    const p = programByChatApp(e.app);
    const run = p ? this.progs()?.programs.find(x => x.id === p.id)?.run : null;
    if (me && run && (run.state === "running" || run.state === "stopping")) return [h("span", { class: "pill kind" }, icon("code"), t("pill.dev"))];
    return [h("span", { class: "muted", text: "–" })];
  }

  render(): void {
    const body = $("net-body");
    const n = this.net;
    if (!n) { body.replaceChildren(); return; }
    if (!n.on) {
      body.replaceChildren(...(n.error ? [h("div", { class: "alert" }, icon("alert"), h("div", { text: t("net.error") }))] : []),
        h("div", { class: "empty" }, icon("globe"), h("b", { text: t("net.off.title") }), h("span", { text: t("net.off.text") }),
          h("button", { class: "btn primary", type: "button", onclick: () => void api.chatSettings({ enabled: true }).then(() => this.refresh()) }, h("span", { text: t("net.off.btn") }))));
      return;
    }
    const groups = groupByHost(n.entries, n.adapters.map(a => a.ip));
    if (!groups.length) {
      body.replaceChildren(h("div", { class: "empty" }, icon("globe"), h("b", { text: t("net.empty.title") }), h("span", { text: t("net.empty.text") })));
      return;
    }
    const rows: HTMLElement[] = [];
    for (const g of groups) {
      const title = g.me ? `${t("net.thisHost")} · ${n.hostname}` : g.label || g.ip;
      rows.push(h("tr", { class: "host" + (g.me ? " me" : "") }, h("td", { colspan: 7 }, title, h("span", { class: "muted", text: g.ip }))));
      for (const e of g.entries) {
        rows.push(h("tr", { class: e.gone ? "gone" : undefined },
          h("td", { class: "prg" }, h("img", { src: this.iconFor(e), alt: "" }), e.app),
          h("td", { text: [e.where, e.nick].filter(Boolean).join(" · ") || "–" }),
          h("td", { class: "mono", text: e.ip }),
          e.ver ? h("td", { class: "mono", text: e.ver }) : h("td", { class: "muted", text: t("net.verUnknown") }),
          h("td", {}, ...this.state(e, g.me)),
          h("td", { class: "muted", text: "–", title: t("net.hint.bonjour") }),
          h("td", { class: "seen", text: this.seen(e) })));
      }
    }
    const head = h("tr", {}, ...["program", "where", "addr", "ver", "state", "web", "seen"].map(k => h("th", { text: t(`net.col.${k}`) })));
    const out: Node[] = [];
    if (n.error) out.push(h("div", { class: "alert" }, icon("alert"), h("div", { text: t("net.error") })));
    out.push(h("div", { class: "table-wrap" }, h("table", { class: "net" }, h("thead", {}, head), h("tbody", {}, ...rows))));
    const noVer = n.entries.filter(e => !e.ver && !e.gone && !e.self);
    if (noVer.length) out.push(h("div", { class: "hint" }, icon("info"), h("div", {}, h("b", { text: t("net.hint.noVer", { name: [...new Set(noVer.map(e => e.app))].join(", ") }) }), " ", t("net.hint.noVer.more"))));
    out.push(h("div", { class: "hint" }, icon("info"), h("div", { text: t("net.hint.bonjour") })));
    body.replaceChildren(...out);
  }

  /** Chip im Kopf: „Hört zu · 239.255.76.76:47676 · en0 192.168.1.10“. */
  listenText(): string {
    const n = this.net;
    if (!n || !n.on) return t("net.chatOff");
    const a = n.adapters.filter(x => x.name !== "demo").map(x => `${x.name} ${x.ip}`).slice(0, 2).join(", ");
    return `${t("net.listening")} · ${n.group}:${n.port}${a ? " · " + a : ""}`;
  }
}
