// Suite-Diagnose v1 lesen (Spezifikation: design/diagnose/SPEC.md). Reine Logik: Datei prüfen und als kompakten Text
// für den Hilfe-Assistenten aufbereiten. Was nicht passt, wird verworfen.

export interface Diag {
  id: string; app: string; version: string; at: string; running: boolean; os: string; arch: string;
  summary: [string, string][]; checks: { name: string; ok: boolean; detail: string }[]; errors: { at: string; text: string }[];
}

export const DIAG_MAX_BYTES = 16 * 1024;
/** Älter als das: nicht mehr ab Werk angehakt (Stand von gestern hilft selten). */
export const DIAG_FRESH_MS = 24 * 3600_000;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").slice(0, max) : "");

export function parseDiagnose(text: string, id: string): Diag | null {
  if (text.length > DIAG_MAX_BYTES) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.suite !== "diagnose" || o.v !== 1 || o.id !== id) return null;
  const at = s(o.at, 40);
  if (!at || Number.isNaN(Date.parse(at))) return null;
  const summary: [string, string][] = [];
  if (o.summary && typeof o.summary === "object" && !Array.isArray(o.summary)) {
    for (const [k, x] of Object.entries(o.summary as Record<string, unknown>).slice(0, 20)) { const val = s(x, 200); if (k && val) summary.push([s(k, 60), val]); }
  }
  const checks = Array.isArray(o.checks) ? o.checks.slice(0, 20).flatMap(c => {
    if (!c || typeof c !== "object") return [];
    const x = c as Record<string, unknown>;
    const name = s(x.name, 60);
    return name ? [{ name, ok: x.ok === true, detail: s(x.detail, 200) }] : [];
  }) : [];
  const errors = Array.isArray(o.errors) ? o.errors.slice(-20).flatMap(e => {
    if (!e || typeof e !== "object") return [];
    const x = e as Record<string, unknown>;
    const t = s(x.text, 300);
    return t ? [{ at: s(x.at, 40), text: t }] : [];
  }) : [];
  return { id, app: s(o.app, 40), version: s(o.version, 40), at, running: o.running === true, os: s(o.os, 60), arch: s(o.arch, 20), summary, checks, errors };
}

/** Show-Netz: privat, Loopback, Link-Local und Art-Net (2.x/10.x). Alles andere gilt als öffentlich. */
function showNet(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 2 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Zweite Schranke (Rechtsprüfung 28.11.2026, A2): was nie in die Diagnose darf (SPEC.md), auch wenn ein Programm es doch
 * schreibt – Benutzerordner, file:-Adressen, Laufwerks- und Freigabenamen, E-Mail, MAC, IPv6, öffentliche IPv4,
 * Rechnernamen, lange Schlüssel. Vorschau und Senden laufen beide hierüber.
 */
export function scrubDiag(t: string, host = ""): string {
  const h = host.replace(/\.local$/i, "");
  if (h.length > 2) t = t.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<Rechner>"); // z. B. in NDI-Quellnamen
  return t
    .replace(/file:\/\/\/?[^\s"'<>]*/gi, "<Datei>")
    .replace(/[A-Za-z]:[\\/]+(?:Users|Dokumente und Einstellungen|Documents and Settings)[\\/]+[^\\/\s"']+/gi, "~")
    .replace(/\/(?:Users|home)\/[^/\s"']+/g, "~")
    .replace(/\/private\/var\/folders\/[^\s"']*/g, "<tmp>")
    .replace(/\/Volumes\/[^/\s"']+/g, "/Volumes/<Laufwerk>")
    .replace(/\\\\[^\\\s"']+\\[^\\\s"']+/g, "\\\\<Freigabe>")
    .replace(/\b[A-Za-z]:[\\/][^\s"']*/g, "<Pfad>")                       // übrige Windows-Pfade
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<E-Mail>")
    .replace(/\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, "<MAC>")
    .replace(/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, "<IPv6>")
    .replace(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?!\.?\d)/g, ip => (showNet(ip) ? ip : "<IP>")) // nicht in Versionen wie 21.0.13.0.3
    .replace(/\b[\w-]+\.(?:local|lan|fritz\.box)\b/gi, "<Rechner>")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "<Schlüssel>");
}

/** „HH:MM“ aus einem ISO-Zeitpunkt (Ortszeit), sonst der Text. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Wer läuft, schreibt spätestens alle 30 s; älter als das gilt der Stand als veraltet (Absturz, kill -9). */
export const DIAG_STALE_MS = 2 * 60_000;

/** Kompakte Textfassung (so geht sie an den Assistenten und so sieht der Nutzer sie vorher). */
export function formatDiagnose(d: Diag, lang: "de" | "en", o: { now?: number; host?: string } = {}): string {
  const de = lang === "de";
  const head = `${d.app || d.id} ${d.version}`.trim();
  const stale = d.running && (o.now ?? Date.now()) - Date.parse(d.at) > DIAG_STALE_MS;
  const state = stale ? (de ? "Stand veraltet – Programm vermutlich beendet oder abgestürzt" : "state outdated – program probably quit or crashed")
    : d.running ? (de ? "läuft" : "running") : (de ? "beendet" : "not running");
  const lines = [`${de ? "Diagnose" : "Diagnostics"} ${head} – ${de ? "Stand" : "as of"} ${d.at.slice(0, 10)} ${hhmm(d.at)}, ${state}${d.os ? `, ${d.os}` : ""}${d.arch ? ` ${d.arch}` : ""}`];
  for (const [k, v] of d.summary) lines.push(`${k}: ${v}`);
  if (d.checks.length) {
    lines.push(de ? "Prüfungen:" : "Checks:");
    for (const c of d.checks) lines.push(`- ${c.ok ? "OK" : (de ? "FEHLER" : "FAIL")} ${c.name}${c.detail ? ` – ${c.detail}` : ""}`);
  }
  if (d.errors.length) {
    lines.push(de ? "Letzte Fehler:" : "Recent errors:");
    for (const e of d.errors) lines.push(`- ${e.at ? hhmm(e.at) + " " : ""}${e.text}`);
  }
  return scrubDiag(lines.join("\n"), o.host);
}

/** Zeilen aus main.log, die nach Fehlern aussehen (für die Diagnose von Link-Suite selbst), die letzten `n`. */
export function logErrors(log: string, n = 15): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [];
  for (const line of log.split("\n")) {
    if (!/fail|error|exception|unknown source|rate limit|crash|gone/i.test(line)) continue;
    const m = line.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(.*)$/);
    // Stacks nur bis zur ersten Zeile (log.ts schreibt Zeilenumbrüche als „ ⏎ “), damit keine Pfadliste mitgeht
    const text = (m ? m[2]! : line).split(" ⏎ ")[0]!.slice(0, 300);
    out.push({ at: m ? m[1]! : "", text });
  }
  return out.slice(-n);
}
