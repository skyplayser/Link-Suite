// Einstellungen. `suite.json` gilt für die ganze Suite (Format aus dem Konzept „Gemeinsame Einstellungen“): nur der
// Launcher schreibt sie, die Programme lesen sie. `launcher.json` hält, was nur den Launcher angeht
// (Entwicklerordner, Startweg je Programm, Hintergrund). Hier nur Lesen/Prüfen/Schreiben als Text, ohne Dateisystem.
import { CATALOG, type ProgramId } from "./catalog";
import { cleanText, MAX_NICK } from "./suitechat";

export const SUITE_FORMAT = "link-suite-settings";
export const SUITE_V = 1;

export type LangPref = "de" | "en" | "system";
export type ThemePref = "dark" | "light" | "system";

export interface SuiteSettings {
  lang: LangPref;
  theme: ThemePref;
  chat: { nick: string; where: string; on: boolean };
  intro: boolean;
}

export const SUITE_DEFAULTS: SuiteSettings = { lang: "system", theme: "dark", chat: { nick: "", where: "", on: true }, intro: true };

export interface SuiteFile {
  settings: SuiteSettings;
  /** Unbekannte Felder der gelesenen Datei: bleiben beim Schreiben erhalten. */
  extra: Record<string, unknown>;
  /** Neuere Hauptversion `v`: nur lesen, nie überschreiben. */
  readOnly: boolean;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);

/** suite.json lesen; fehlt oder kaputt → Werte ab Werk. Unbekannte Felder werden ignoriert, aber gemerkt. */
export function parseSuiteJson(text: string | null): SuiteFile {
  const base: SuiteFile = { settings: structuredClone(SUITE_DEFAULTS), extra: {}, readOnly: false };
  if (!text) return base;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return base; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return base;
  const o = v as Record<string, unknown>;
  if (o.format !== undefined && o.format !== SUITE_FORMAT) return base;
  const ver = typeof o.v === "number" ? o.v : SUITE_V;
  const chat = o.chat && typeof o.chat === "object" && !Array.isArray(o.chat) ? (o.chat as Record<string, unknown>) : {};
  const s: SuiteSettings = {
    lang: pick(o.lang, ["de", "en", "system"] as const, SUITE_DEFAULTS.lang),
    theme: pick(o.theme, ["dark", "light", "system"] as const, SUITE_DEFAULTS.theme),
    chat: {
      nick: cleanText(chat.nick, MAX_NICK),
      where: cleanText(chat.where, MAX_NICK),
      on: typeof chat.on === "boolean" ? chat.on : SUITE_DEFAULTS.chat.on,
    },
    intro: typeof o.intro === "boolean" ? o.intro : SUITE_DEFAULTS.intro,
  };
  const extra: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) if (!["format", "v", "lang", "theme", "chat", "intro", "updatedAt"].includes(k)) extra[k] = val;
  // Unbekannte Felder in chat ebenfalls behalten
  const chatExtra: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(chat)) if (!["nick", "where", "on"].includes(k)) chatExtra[k] = val;
  if (Object.keys(chatExtra).length) extra.__chat = chatExtra;
  return { settings: s, extra, readOnly: ver > SUITE_V };
}

/** Lokale Uhrzeit mit Zeitzone, z. B. „2026-11-15T17:30:00+01:00“ (wie im Konzept). */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${off >= 0 ? "+" : "-"}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

/** suite.json als Text (Format aus dem Konzept); unbekannte Felder der gelesenen Datei bleiben stehen. */
export function serializeSuite(s: SuiteSettings, extra: Record<string, unknown>, now: Date): string {
  const { __chat, ...rest } = extra as Record<string, unknown> & { __chat?: Record<string, unknown> };
  const out = {
    format: SUITE_FORMAT, v: SUITE_V,
    lang: s.lang, theme: s.theme,
    chat: { ...(__chat ?? {}), nick: s.chat.nick, where: s.chat.where, on: s.chat.on },
    intro: s.intro,
    ...rest,
    updatedAt: isoLocal(now),
  };
  return JSON.stringify(out, null, 1) + "\n";
}

/** Änderung aus der Oberfläche prüfen und anwenden (unbekannte oder falsche Werte fallen weg). */
export function applySuitePatch(s: SuiteSettings, patch: unknown): SuiteSettings {
  const out = structuredClone(s);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out;
  const p = patch as Record<string, unknown>;
  if (p.lang !== undefined) out.lang = pick(p.lang, ["de", "en", "system"] as const, out.lang);
  if (p.theme !== undefined) out.theme = pick(p.theme, ["dark", "light", "system"] as const, out.theme);
  if (typeof p.intro === "boolean") out.intro = p.intro;
  if (p.chat && typeof p.chat === "object" && !Array.isArray(p.chat)) {
    const c = p.chat as Record<string, unknown>;
    if (typeof c.nick === "string") out.chat.nick = cleanText(c.nick, MAX_NICK);
    if (typeof c.where === "string") out.chat.where = cleanText(c.where, MAX_NICK);
    if (typeof c.on === "boolean") out.chat.on = c.on;
  }
  return out;
}

// ------------------------------------------------------------------ launcher.json

export type Route = "app" | "dev";

export interface LauncherSettings {
  /** Entwicklerordner je Programm, gespeichert als „~/…“ oder absolut. Fehlt: Wert ab Werk aus catalog.ts. */
  devDirs: Partial<Record<ProgramId, string>>;
  /** Gewählter Startweg je Programm. */
  routes: Partial<Record<ProgramId, Route>>;
  /** Im Hintergrund weiterlaufen (Menüleiste), ab Werk aus (Entscheidung 5). */
  background: boolean;
  /** Beim Start nach Updates suchen (GitHub, höchstens 1×/h), ab Werk an. */
  checkUpdates: boolean;
  /** Stille Mitteilungen (Installation fertig, Updates da), ab Werk an. */
  notify: boolean;
  /** Willkommen-Karte schon gesehen (einmalig). */
  welcomed: boolean;
  /** Lage und Größe des Fensters (Vollbild wird nicht gespeichert). */
  window?: WindowBounds;
  /** Entwickleransicht; fehlt = an, wenn es einen Entwicklerordner gibt (QA Windows U1). */
  devView?: boolean;
  /** Letzter vollständiger Suchlauf: beim Start sofort gezeigt (QA Windows 0.3.1 R1). */
  installedCache?: InstalledCache;
  /** Letzte Releases aus GitHub: ohne Netz bleibt „verfügbar“ statt „kommt bald“ (Mac-QA 0.3.1 N1). Nur Daten, keine Freigabe. */
  releaseCache?: Record<string, unknown>;
  /** KI-Hilfe-Assistent: Hinweis bestätigt, mit Stand und Zeitpunkt (vorher sendet nichts). Zurücksetzen in den Einstellungen. */
  helpConsent?: { v: number; at: string };
  /** Infobox „Funktioniert etwas nicht?“ ausgeblendet. */
  helpHintHidden?: boolean;
}

export interface CachedApp { path: string; version: string; bundleId: string; onVolume: boolean }
export interface InstalledCache { at: number; apps: Record<string, CachedApp> }

/** Zwischenspeicher prüfen (Programm-Kennungen aus catalog.ts, Pfade absolut, Längen begrenzt). */
export function parseInstalledCache(v: unknown): InstalledCache | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== "number" || !o.apps || typeof o.apps !== "object") return null;
  const apps: Record<string, CachedApp> = {};
  for (const [id, a] of Object.entries(o.apps as Record<string, unknown>)) {
    if (!IDS.has(id) || !a || typeof a !== "object") continue;
    const x = a as Record<string, unknown>;
    const str = (s: unknown, max: number) => (typeof s === "string" && s.length <= max ? s : null);
    const p = str(x.path, 1024), ver = str(x.version, 40), bid = str(x.bundleId, 200);
    if (!p || !(p.startsWith("/") || /^[A-Za-z]:\\/.test(p)) || ver === null || bid === null) continue;
    apps[id] = { path: p, version: ver, bundleId: bid, onVolume: x.onVolume === true };
  }
  return { at: o.at, apps };
}

export interface WindowBounds { x: number; y: number; width: number; height: number; zoomed: boolean }

/** Fensterlage prüfen: Zahlen in sinnvollen Grenzen, sonst null. */
export function parseBounds(v: unknown): WindowBounds | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? Math.round(x) : null);
  const x = num(o.x, -20000, 20000), y = num(o.y, -20000, 20000), width = num(o.width, 400, 20000), height = num(o.height, 300, 20000);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height, zoomed: o.zoomed === true };
}

/** Liegt das Rechteck zu mindestens 50 % in einem der Arbeitsbereiche? */
export function boundsVisible(b: { x: number; y: number; width: number; height: number }, areas: readonly { x: number; y: number; width: number; height: number }[]): boolean {
  const area = b.width * b.height;
  if (area <= 0) return false;
  return areas.some(a => {
    const w = Math.max(0, Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x));
    const h = Math.max(0, Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y));
    return w * h >= area * 0.5;
  });
}

export const LAUNCHER_DEFAULTS: LauncherSettings = { devDirs: {}, routes: {}, background: false, checkUpdates: true, notify: true, welcomed: false };

const IDS = new Set<string>(CATALOG.map(p => p.id));

export function parseLauncherJson(text: string | null): LauncherSettings {
  const out: LauncherSettings = structuredClone(LAUNCHER_DEFAULTS);
  if (!text) return out;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return out; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  const o = v as Record<string, unknown>;
  if (o.devDirs && typeof o.devDirs === "object") {
    for (const [k, d] of Object.entries(o.devDirs as Record<string, unknown>)) {
      if (IDS.has(k) && typeof d === "string" && d.length <= 1024 && (d.startsWith("~") || d.startsWith("/") || d === "")) out.devDirs[k as ProgramId] = d;
    }
  }
  if (o.routes && typeof o.routes === "object") {
    for (const [k, r] of Object.entries(o.routes as Record<string, unknown>)) if (IDS.has(k) && (r === "app" || r === "dev")) out.routes[k as ProgramId] = r;
  }
  if (typeof o.background === "boolean") out.background = o.background;
  if (typeof o.checkUpdates === "boolean") out.checkUpdates = o.checkUpdates;
  if (typeof o.notify === "boolean") out.notify = o.notify;
  if (typeof o.welcomed === "boolean") out.welcomed = o.welcomed;
  if (typeof o.devView === "boolean") out.devView = o.devView;
  if (o.helpConsent && typeof o.helpConsent === "object") {
    const c = o.helpConsent as Record<string, unknown>;
    if (typeof c.v === "number" && Number.isInteger(c.v) && c.v > 0 && typeof c.at === "string" && c.at.length <= 40) out.helpConsent = { v: c.v, at: c.at };
  }
  // helpDeviceId (1.0.7-Vorabstand) wird nicht mehr gelesen: die Kennung lebt nur noch im Arbeitsspeicher
  if (o.helpHintHidden === true) out.helpHintHidden = true;
  const ic = parseInstalledCache(o.installedCache);
  if (ic) out.installedCache = ic;
  if (o.releaseCache && typeof o.releaseCache === "object" && !Array.isArray(o.releaseCache)) out.releaseCache = o.releaseCache as Record<string, unknown>;
  const wb = parseBounds(o.window);
  if (wb) out.window = wb;
  return out;
}

export function serializeLauncher(s: LauncherSettings): string {
  return JSON.stringify({ format: "link-suite-launcher", v: 1, ...s }, null, 1) + "\n";
}
