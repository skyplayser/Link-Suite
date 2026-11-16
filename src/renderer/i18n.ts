// Sprache der Oberfläche: data-i18n (textContent), data-i18n-title, data-i18n-aria, data-i18n-ph
// (Konvention aus VJ-Link src/renderer/lang.ts und VD-Link src/ui/i18n.ts, nur Punkt-Schlüssel).
import { detectLang, translate, type Lang } from "../core/i18n";
import type { LangPref } from "../core/settings";

let lang: Lang = "de";
const listeners: (() => void)[] = [];

export function t(key: string, vars?: Record<string, string | number>): string { return translate(lang, key, vars); }
export function currentLang(): Lang { return lang; }
export function onLang(cb: () => void): void { listeners.push(cb); }

export function setLang(pref: LangPref, locale: string): void {
  const next: Lang = pref === "system" ? detectLang([locale, ...navigator.languages]) : pref;
  const changed = next !== lang;
  lang = next;
  document.documentElement.lang = lang;
  applyI18n(document);
  if (changed) for (const cb of listeners) cb();
}

export function applyI18n(root: ParentNode): void {
  // Plattformtexte (QA Windows B2): unter Windows gilt data-i18n-win, wenn vorhanden
  const win = document.documentElement.dataset.os === "win";
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(win && el.dataset.i18nWin ? el.dataset.i18nWin : el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle!);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria!));
  for (const el of root.querySelectorAll<HTMLInputElement>("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh!);
}
