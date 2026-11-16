// Kleine Bausteine: Elemente bauen (nur textContent, nie HTML aus Daten), Icons, Toast, Dialoge.
import { t } from "./i18n";

type Attrs = Record<string, string | number | boolean | undefined | null | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

/** Element mit Attributen (on… = Ereignis, class/text besonders) und Kindern. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const SVG = "http://www.w3.org/2000/svg";
/** Icon aus dem Symbol-Sprite in index.html. */
export function icon(id: string, fill = false): SVGSVGElement {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("class", fill ? "ico fill" : "ico");
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(SVG, "use");
  u.setAttribute("href", "#i-" + id);
  s.append(u);
  return s;
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function hhmm(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Laufzeit „12:04“ (mm:ss) bzw. „1:02:03“. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

let toastTimer = 0;
export function toast(text: string, kind: "ok" | "err" | "info" = "ok"): void {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast" + (kind === "ok" ? "" : " " + kind);
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 3500);
}

export interface ModalSpec {
  role?: "dialog" | "alertdialog";
  icon?: string;
  title: string;
  sub?: string;
  body: Node[];
  /** Knöpfe von links nach rechts; der letzte mit primary ist der Hauptknopf. `focus`: bekommt den Fokus. */
  buttons: { label: string; value: string; primary?: boolean; ghost?: boolean; focus?: boolean }[];
  wide?: boolean;
}

/**
 * Dialog wie VD-Link: role=dialog/alertdialog, Esc = Abbrechen (Wert „cancel“), Fokus bleibt im Dialog und geht
 * danach zurück auf den auslösenden Knopf.
 */
export function modal(spec: ModalSpec): Promise<string> {
  return new Promise(resolve => {
    const back = document.activeElement as HTMLElement | null;
    const titleId = "m-" + Math.random().toString(36).slice(2);
    const close = (v: string) => { wrap.remove(); back?.focus(); resolve(v); };
    const btns = spec.buttons.map(b => h("button", {
      class: "btn" + (b.primary ? " primary" : "") + (b.ghost ? " ghost" : ""), type: "button", text: b.label, onclick: () => close(b.value),
    }));
    const box = h("div", { class: "modal" + (spec.wide ? " wide" : ""), role: spec.role ?? "dialog", "aria-modal": "true", "aria-labelledby": titleId },
      h("div", { class: "modal-head" },
        spec.icon ? h("img", { src: spec.icon, alt: "" }) : null,
        h("div", {}, h("h3", { class: "modal-title", id: titleId, text: spec.title }), spec.sub ? h("small", { text: spec.sub }) : null)),
      h("div", { class: "modal-body" }, ...spec.body),
      h("div", { class: "modal-foot" }, ...btns));
    const wrap = h("div", { class: "modal-back" }, box);
    wrap.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); close("cancel"); }
      if (e.key === "Tab") {
        const f = [...box.querySelectorAll<HTMLElement>("button,input,[tabindex]")].filter(x => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]!.focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus(); }
      }
    });
    wrap.addEventListener("mousedown", e => { if (e.target === wrap) close("cancel"); });
    $("modal-root").append(wrap);
    const fi = spec.buttons.findIndex(b => b.focus);
    (btns[fi >= 0 ? fi : 0] ?? box).focus();
  });
}

/** Einfacher Hinweis-Dialog (Lizenzen, Marken). */
export function info(title: string, text: string): Promise<string> {
  return modal({ title, body: [h("p", { text })], buttons: [{ label: t("common.close"), value: "ok", primary: true, focus: true }] });
}
