// Tab EINSTELLUNGEN (Design „Bildschirmaufbau“): Oberfläche, Suite-Chat, Programme, Über. Sprache, Anzeige, Chat und
// Startanimation stehen in suite.json (für die ganze Suite); Entwicklerordner und Hintergrund in launcher.json.
import { programById } from "../core/catalog";
import type { SettingsSnapshot } from "../core/state";
import { api } from "./api";
import { t } from "./i18n";
import { $, h, info, toast } from "./ui";

export class SettingsView {
  snap: SettingsSnapshot | null = null;

  constructor(private readonly onApply: (s: SettingsSnapshot) => void) {
    for (const [id, field] of [["set-lang", "lang"], ["set-theme", "theme"]] as const) {
      const seg = $(id);
      seg.addEventListener("click", e => {
        const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
        if (b) void this.set({ [field]: b.dataset.v });
      });
      seg.addEventListener("keydown", e => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const list = [...seg.querySelectorAll<HTMLButtonElement>("button[data-v]")];
        const i = list.findIndex(b => b.getAttribute("aria-checked") === "true");
        const next = list[(i + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length]!;
        e.preventDefault();
        void this.set({ [field]: next.dataset.v }).then(() => next.focus());
      });
    }
    $<HTMLInputElement>("set-intro").addEventListener("change", e => void this.set({ intro: (e.target as HTMLInputElement).checked }));
    $<HTMLInputElement>("set-background").addEventListener("change", e => void this.set({ background: (e.target as HTMLInputElement).checked }));
    $<HTMLInputElement>("set-check").addEventListener("change", e => void this.set({ checkUpdates: (e.target as HTMLInputElement).checked }));
    $<HTMLInputElement>("set-devview").addEventListener("change", e => void this.set({ devView: (e.target as HTMLInputElement).checked }));
    $<HTMLInputElement>("set-notify").addEventListener("change", e => void this.set({ notify: (e.target as HTMLInputElement).checked }));
    const commitNick = () => void this.set({ chat: { nick: $<HTMLInputElement>("set-nick").value, where: $<HTMLInputElement>("set-where").value } });
    for (const id of ["set-nick", "set-where"]) {
      $(id).addEventListener("change", commitNick);
      $(id).addEventListener("keydown", e => { if (e.key === "Enter") commitNick(); });
    }
    $("set-nav").addEventListener("click", e => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button[data-sec]");
      if (!b) return;
      for (const x of $("set-nav").querySelectorAll("button")) x.classList.toggle("on", x === b);
      $(`sec-${b.dataset.sec}`).scrollIntoView({ block: "start", behavior: "smooth" });
    });
    $("btn-licenses").addEventListener("click", () => void info(t("set.licenses"), t("set.licenses.text")));
    $("btn-trademarks").addEventListener("click", () => void info(t("set.trademarks"), t("set.trademarks.text")));
  }

  /** Schnellumschalter DE/EN oben rechts: setzt die Sprache für die ganze Suite (wie Einstellungen → Sprache). */
  setLang(v: "de" | "en"): Promise<void> { return this.set({ lang: v }); }

  private async set(patch: Record<string, unknown>): Promise<void> {
    this.apply(await api.settingsSet(patch));
  }

  apply(s: SettingsSnapshot): void {
    this.snap = s;
    for (const [id, v] of [["set-lang", s.suite.lang], ["set-theme", s.suite.theme]] as const) {
      for (const b of $(id).querySelectorAll<HTMLButtonElement>("button[data-v]")) {
        const on = b.dataset.v === v;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      }
    }
    $<HTMLInputElement>("set-intro").checked = s.suite.intro;
    $<HTMLInputElement>("set-background").checked = s.background;
    $<HTMLInputElement>("set-check").checked = s.checkUpdates;
    $<HTMLInputElement>("set-notify").checked = s.notify;
    $<HTMLInputElement>("set-devview").checked = s.devView;
    document.documentElement.classList.toggle("devview", s.devView);
    const nick = $<HTMLInputElement>("set-nick"), where = $<HTMLInputElement>("set-where");
    if (document.activeElement !== nick) nick.value = s.suite.chat.nick;
    if (document.activeElement !== where) where.value = s.suite.chat.where;
    $("set-readonly").hidden = !s.suiteReadOnly;
    $("set-file").textContent = t("set.file", { file: s.suiteFile });
    this.renderDevDirs();
    this.onApply(s);
  }

  renderDevDirs(): void {
    const s = this.snap;
    if (!s) return;
    $("set-devdirs").replaceChildren(...s.devDirs.map(d => {
      const p = programById(d.id)!;
      const ok = d.status === "ready" || d.status === "needs-build";
      const verdict = d.status === "not-suite" ? h("small", { class: "warn", text: t("set.devDir.notSuite", { pkg: p.pkgName ?? "" }) })
        : h("small", { class: ok ? "ok" : undefined, text: ok ? `✓ ${t("set.devDir.ok")}` : d.missing ? t("need.short", { what: t(`need.short.${d.missing}`) }) : "" });
      return h("div", { class: "set-row" },
        h("div", { class: "set-label" }, h("b", { text: p.name }), h("small", { text: d.custom ? d.abs : `${t("set.devDir.default")} · ${d.abs || t("set.devDir.none")}` }), verdict),
        h("div", { class: "set-ctl" },
          h("span", { class: "path", title: d.abs, text: d.stored || t("set.devDir.none") }),
          h("button", { class: "btn small", type: "button", text: t("common.change"), "aria-label": t("set.devDir.pick", { name: p.name }), onclick: () => void api.pickDevDir(d.id).then(x => {
            this.apply(x);
            if (x.devDirs.find(y => y.id === d.id)?.status === "not-suite") toast(t("set.devDir.notSuite", { pkg: p.pkgName ?? "" }), "err");
          }) }),
          d.custom ? h("button", { class: "btn small ghost", type: "button", text: t("common.reset"), onclick: () => void api.resetDevDir(d.id).then(x => this.apply(x)) }) : null));
    }));
  }
}
