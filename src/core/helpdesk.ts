// KI-Hilfe-Assistent (api.link-suite.de, Schnittstelle: Link-Suite/Helpdesk/README.md). Reine Logik ohne Node-Module:
// Zuordnung Programm → Kennung des Dienstes, Server-Sent-Events lesen, kleines sicheres Markdown (als Daten, nie HTML).
// Vorlage: Website/src/assets/js/chat.js (link-suite.de).

/** Adresse des Dienstes. Aufgerufen wird er nur aus dem Hauptprozess (CORS lässt nur link-suite.de zu). */
export const HELP_API = "https://api.link-suite.de";
/** Datenschutzerklärung, Abschnitt zum Assistenten (Link im KI-Hinweis). */
export const HELP_PRIVACY = { de: "https://link-suite.de/datenschutz/#assistent", en: "https://link-suite.de/en/datenschutz/#assistant" } as const;
/** Höchstens so viele Nachrichten pro Chat (der Dienst zählt selbst, das hier ist nur die Anzeige). */
export const HELP_MAX = 25;
/** Ab so wenigen übrigen Nachrichten zeigt die Oberfläche den Rest an. */
export const HELP_WARN_AT = 5;
/** Höchstlänge einer Nachricht beim Dienst; davon bleibt Platz für die vorangestellte Version. */
export const HELP_MAX_CHARS = 2000;
export const HELP_INPUT_MAX = 1800;
/** Mit angehängter Diagnose (`log: true`) erlaubt der Dienst so viel. */
export const HELP_MAX_LOG = 12000;

/** Programm-Kennungen, die der Dienst kennt. */
export type HelpSlug = "lj-link" | "vj-link" | "vd-link" | "ljl-link" | "crew-link" | "launcher";
const SLUGS: Readonly<Record<string, HelpSlug>> = { lj: "lj-link", vj: "vj-link", vd: "vd-link", ljl: "ljl-link", crew: "crew-link", suite: "launcher" };

/** Kennung im Launcher (catalog.ts oder „suite“) → Kennung beim Dienst; Programme ohne Wiki-Teil (noch) → null. */
export function helpSlug(id: unknown): HelpSlug | null {
  return typeof id === "string" && Object.hasOwn(SLUGS, id) ? SLUGS[id]! : null;
}
/** Launcher-Kennungen, die man im Assistenten wählen kann (Reihenfolge der Auswahl). */
export const HELP_PROGRAMS: readonly string[] = ["suite", "lj", "vj", "vd", "ljl", "crew"];

export const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** Stand des KI-Hinweises; steigt, wenn sich sein Inhalt ändert (dann fragt Link-Suite neu). */
export const HELP_NOTICE_V = 2;
/** Links aus Antworten öffnet Link-Suite nur zu diesen Seiten (Rechtsprüfung A4); andere bleiben Text mit Adresse. */
export const HELP_LINK_HOSTS: ReadonlySet<string> = new Set(["link-suite.de", "www.link-suite.de", "github.com", "discord.gg", "discord.com"]);
/** Vorbereitete Fehlermeldung nur an diese Adresse. */
export const HELP_MAILTO = /^mailto:fehlermelden@nextphilm\.de\?[^\s]*$/i;

/** macOS 15 / Windows 11 aus Plattform und Systemversion (process.getSystemVersion()). */
export function osLabel(platform: string, version: string): string {
  const v = String(version || "");
  if (platform === "darwin") { const major = v.split(".")[0]; return major ? `macOS ${major}` : "macOS"; }
  if (platform === "win32") {
    const build = Number(v.split(".")[2]);
    return Number.isFinite(build) && build > 0 ? (build >= 22000 ? "Windows 11" : "Windows 10") : "Windows";
  }
  return platform;
}

/** Vorsatz der ersten Nachricht: „[VJ-Link 0.1.18, macOS 15] “ (ohne Programm nur das System). */
export function contextPrefix(name: string | null, version: string | null, os: string): string {
  const prog = name ? (version ? `${name} ${version}` : name) : "";
  const inner = [prog, os].filter(Boolean).join(", ");
  return inner ? `[${inner.slice(0, 120)}] ` : "";
}

// ------------------------------------------------------------------ Server-Sent Events

export interface SseEvent { event: string; data: unknown }

/** Puffer in fertige Ereignisse zerlegen (Trenner: Leerzeile). `rest` ist der unvollständige Teil. */
export function parseSse(buf: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const text = buf.replace(/\r\n/g, "\n");
  let start = 0;
  for (;;) {
    const i = text.indexOf("\n\n", start);
    if (i < 0) break;
    const chunk = text.slice(start, i);
    start = i + 2;
    let event = "message";
    const data: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) continue;
    try { events.push({ event, data: JSON.parse(data.join("\n")) }); } catch { /* kaputtes Stück überspringen */ }
  }
  return { events, rest: text.slice(start) };
}

// ------------------------------------------------------------------ Markdown (klein, sicher, als Daten)

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; v: string }
  | { t: "code"; v: string }
  | { t: "a"; v: string; href: string };
export type Block = { t: "p" | "h"; c: Inline[] } | { t: "ol" | "ul"; items: Inline[][] };

/** Nur https-Links zu erlaubten Seiten (HELP_LINK_HOSTS); alles andere bleibt Text. */
export function safeHref(u: string): string | null {
  if (!/^https:\/\/[^\s<>"']+$/.test(u) || u.length > 600) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.username && !x.password && !x.port && HELP_LINK_HOSTS.has(x.hostname) ? x.toString() : null;
  } catch { return null; }
}

/** `code`, **fett**, [Text](https://…); der Rest ist Text. Nie HTML: die Oberfläche setzt nur textContent. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (v: string) => { if (v) { const prev = out[out.length - 1]; if (prev && prev.t === "text") prev.v += v; else out.push({ t: "text", v }); } };
  while ((m = re.exec(s))) {
    text(s.slice(last, m.index));
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "b", v: m[2] });
    else { const href = safeHref(m[4]!); if (href) out.push({ t: "a", v: m[3]!, href }); else text(`${m[3]} (${m[4]})`); } // fremde Seite: Adresse sichtbar, kein Link
    last = re.lastIndex;
  }
  text(s.slice(last));
  return out;
}

/** Absätze, Überschriften (#), Listen mit „1.“ oder „-“. */
export function parseMarkdown(src: string): Block[] {
  const out: Block[] = [];
  let list: { t: "ol" | "ul"; items: Inline[][] } | null = null;
  const close = () => { if (list) { out.push(list); list = null; } };
  for (const raw of String(src).replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (!list || list.t !== "ol") { close(); list = { t: "ol", items: [] }; } list.items.push(parseInline(m[1]!)); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (!list || list.t !== "ul") { close(); list = { t: "ul", items: [] }; } list.items.push(parseInline(m[1]!)); continue; }
    close();
    if (!line.trim()) continue;
    if ((m = line.match(/^#{1,4}\s+(.*)$/))) { out.push({ t: "h", c: parseInline(m[1]!) }); continue; }
    out.push({ t: "p", c: parseInline(line) });
  }
  close();
  return out;
}

// ------------------------------------------------------------------ Antworten des Dienstes prüfen

export interface HelpSource { url: string; title: string; heading: string }
export interface HelpReport { to: string; subject: string; body: string; mailto: string }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseSources(v: unknown): HelpSource[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: HelpSource[] = [];
  for (const s of v.slice(0, 20)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const url = safeHref(str(o.url, 600));
    if (!url) continue;
    const heading = str(o.heading, 200), title = str(o.title, 200);
    const key = url.split("#")[0] + heading;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title, heading });
    if (out.length >= 4) break;
  }
  return out;
}

/** Meldung des Dienstes; `mailto` muss eine mailto:-Adresse sein. */
export function parseReport(v: unknown): HelpReport | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mailto = str(o.mailto, 20000);
  if (!HELP_MAILTO.test(mailto)) return null;
  return { to: str(o.to, 200), subject: str(o.subject, 300), body: str(o.body, 15000), mailto };
}
