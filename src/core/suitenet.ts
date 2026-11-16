// Suite im Netz: wer ist da (aus `here` und den anderen `suite`-Werten), und Antwort `echo` auf `probe` von NET Link.
// Format nach NET-Link-Konzept „Suite-Protokoll: here mit ver, probe und echo“ (beschlossen 15.11.2026):
//   {"suite":"net","v":1,"t":"probe","peer","app","ver","seq","at"}  → nur NET Link sendet es
//   {"suite":"net","v":1,"t":"echo","peer","app","ver","to","seq","ip"} → eine Antwort je Adapter, 0–200 ms verzögert,
//   höchstens 1 je Sekunde je NET Link. Der Launcher sendet nie `probe`.
// Bis das Paket @link-suite/net (Repo suite-net) da ist, stehen die Zeilen hier lokal.
import { cleanText, GONE_AFTER_MS, MAX_DATAGRAM, MAX_NICK } from "./suitechat";

const PEER = /^[0-9a-z]{8,32}$/;

/** Datagramm lesen: JSON-Objekt mit `suite` (String), höchstens 8 KB; sonst null. */
export function parseDatagram(text: string): Record<string, unknown> | null {
  if (typeof text !== "string" || text.length > MAX_DATAGRAM) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return validEnvelope(o) ? o : null;
}

/**
 * Hülle nach Spezifikation streng prüfen: `suite` 1–16 Kleinbuchstaben, `v` ganze Zahl ≥ 1, `t` 1–32 Zeichen.
 * Prototyp-Schlüssel („toString“, „__proto__“ …) bestehen das nie als bekanntes Programm (siehe OTHER_SUITES).
 */
export function validEnvelope(o: Record<string, unknown>): boolean {
  if (typeof o.suite !== "string" || !/^[a-z]{1,16}$/.test(o.suite)) return false;
  if (typeof o.v !== "number" || !Number.isSafeInteger(o.v) || o.v < 1) return false;
  if (typeof o.t !== "string" || o.t.length < 1 || o.t.length > 32) return false;
  return true;
}

// ------------------------------------------------------------------ probe / echo

export interface Probe { peer: string; seq: number }

/** `probe` von NET Link prüfen (Kennung, Version 1, Zähler als ganze Zahl). */
export function parseProbe(o: Record<string, unknown>): Probe | null {
  if (o.suite !== "net" || o.v !== 1 || o.t !== "probe") return null;
  const peer = typeof o.peer === "string" ? o.peer : "";
  const seq = o.seq;
  if (!PEER.test(peer) || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return null;
  return { peer, seq };
}

export interface Me { peer: string; app: string; ver: string }

/** Antwort für einen Adapter (`ip` = Adresse, über die dieses Datagramm hinausgeht). */
export function echoJson(probe: Probe, me: Me, ip: string): string {
  return JSON.stringify({ suite: "net", v: 1, t: "echo", peer: me.peer, app: me.app, ver: me.ver, to: probe.peer, seq: probe.seq, ip });
}

export const ECHO_MIN_MS = 1000;
export const ECHO_MAX_DELAY_MS = 200;

/** Höchstens 1 `echo` je Sekunde je NET Link (`peer` des probe). Merkt sich höchstens `max` NET Links. */
/** Höchstens so viele `echo` je Sekunde für alle NET Links zusammen (gegen `probe` mit immer neuer Kennung). */
export const ECHO_GLOBAL_PER_S = 5;

export class EchoThrottle {
  private readonly last = new Map<string, number>();
  private recent: number[] = [];
  constructor(private readonly max = 32, private readonly perSecond = ECHO_GLOBAL_PER_S) {}
  allow(peer: string, now: number): boolean {
    const t = this.last.get(peer);
    if (t !== undefined && now - t < ECHO_MIN_MS) return false;
    this.recent = this.recent.filter(x => now - x < 1000);
    if (this.recent.length >= this.perSecond) return false;
    this.recent.push(now);
    this.last.delete(peer);
    this.last.set(peer, now);
    while (this.last.size > this.max) this.last.delete(this.last.keys().next().value!);
    return true;
  }
}

/** Zufällige Verzögerung 0–200 ms, damit nicht alle Programme gleichzeitig antworten. */
export function echoDelay(rand: () => number = Math.random): number {
  return Math.floor(Math.max(0, Math.min(0.999999, rand())) * (ECHO_MAX_DELAY_MS + 1));
}

// ------------------------------------------------------------------ wer ist im Netz

export interface NetEntry {
  peer: string;
  app: string;
  nick: string;
  where: string;
  /** Programmversion aus `here`; leer = älteres Programm ohne `ver`. */
  ver: string;
  /** Absender-IP des letzten Datagramms. */
  ip: string;
  firstSeen: number;
  lastSeen: number;
  /** Weg: `bye` oder 15 s still. */
  gone: boolean;
  goneAt: number;
  /** Dieser Launcher selbst (eigenes `here` über Multicast-Loopback). */
  self: boolean;
}

/** Andere `suite`-Werte, die zeigen, dass ein Programm lebt (Inhalte werden nicht ausgewertet). */
const OTHER_SUITES = new Map<string, string>([["net", "NET Link"], ["crew", "Crew Link"], ["db", "dB Link"], ["pl", "PL Link"]]);

export const ROSTER_MAX = 100;
/** Gegangene bleiben so lange in der Liste („weg seit 22:41“). */
export const ROSTER_KEEP_GONE_MS = 30 * 60_000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export function isIpv4(s: string): boolean {
  const m = IPV4.exec(s);
  return !!m && m.slice(1).every(x => Number(x) <= 255);
}

export class Roster {
  private readonly peers = new Map<string, NetEntry>();
  constructor(private readonly selfPeer: string) {}

  /** Ein gelesenes Datagramm von `ip` (Absender). True, wenn sich die Liste geändert hat. */
  observe(o: Record<string, unknown>, ip: string, now: number): boolean {
    if (!isIpv4(ip)) return false;
    const peer = typeof o.peer === "string" ? o.peer : "";
    if (!validEnvelope(o) || !PEER.test(peer)) return false;
    if (o.suite === "chat" && o.v !== 1) return false;
    const t = typeof o.t === "string" ? o.t : "";
    let e = this.peers.get(peer);
    if (o.suite === "chat") {
      if (t === "bye") {
        if (!e || e.gone) return false;
        e.gone = true; e.goneAt = now;
        return true;
      }
      // Verlauf (old) kommt von anderen im Namen Gegangener: zählt nicht als Lebenszeichen
      if (t === "msg" && o.old === true) return false;
      if (!e && t !== "here" && t !== "msg") return false; // „history?“ allein legt niemanden an
    } else if (!OTHER_SUITES.has(o.suite as string)) {
      return false;
    }
    let changed = false;
    if (!e) {
      if (this.peers.size >= ROSTER_MAX && !this.evict()) return false;
      e = { peer, app: "", nick: "", where: "", ver: "", ip, firstSeen: now, lastSeen: now, gone: false, goneAt: 0, self: peer === this.selfPeer };
      this.peers.set(peer, e);
      changed = true;
    }
    if (e.gone) { e.gone = false; e.goneAt = 0; changed = true; }
    if (e.ip !== ip) { e.ip = ip; changed = true; }
    e.lastSeen = now;
    const app = cleanText(o.app, MAX_NICK);
    if (o.suite === "chat" && t === "here") {
      const nick = cleanText(o.nick, MAX_NICK), where = cleanText(o.where, MAX_NICK), ver = cleanText(o.ver, MAX_NICK);
      if (nick !== e.nick || where !== e.where || app !== e.app || ver !== e.ver) changed = true;
      e.nick = nick; e.where = where; e.app = app; e.ver = ver;
    } else if (o.suite === "chat") {
      // Live-Nachricht: Namen nur ergänzen, wenn noch keiner bekannt ist (ein „here“ kann verloren gegangen sein)
      if (!e.app && app) { e.app = app; changed = true; }
      if (!e.nick) { const n = cleanText(o.nick, MAX_NICK); if (n) { e.nick = n; changed = true; } }
      if (!e.where) { const w = cleanText(o.where, MAX_NICK); if (w) { e.where = w; changed = true; } }
    } else {
      const name = app || OTHER_SUITES.get(o.suite as string)!;
      if (!e.app) { e.app = name; changed = true; }
      if (!e.ver) { const v = cleanText(o.ver, MAX_NICK); if (v) { e.ver = v; changed = true; } }
    }
    return changed;
  }

  /** Still seit 15 s → weg; nach 30 min aus der Liste. True, wenn sich etwas geändert hat. */
  tick(now: number): boolean {
    let changed = false;
    for (const [id, e] of this.peers) {
      if (!e.gone && now - e.lastSeen > GONE_AFTER_MS) { e.gone = true; e.goneAt = e.lastSeen + GONE_AFTER_MS; changed = true; }
      if (e.gone && now - e.goneAt > ROSTER_KEEP_GONE_MS) { this.peers.delete(id); changed = true; }
    }
    return changed;
  }

  /** Platz schaffen: der am längsten Gegangene fällt weg. Alle da → false. */
  private evict(): boolean {
    let oldest: NetEntry | null = null;
    for (const e of this.peers.values()) if (e.gone && (!oldest || e.goneAt < oldest.goneAt)) oldest = e;
    if (!oldest) return false;
    this.peers.delete(oldest.peer);
    return true;
  }

  clear(): void { this.peers.clear(); }

  /** Nur Einträge, die schon sagen, wer sie sind (Programmname). */
  list(): NetEntry[] {
    return [...this.peers.values()].filter(e => e.app).map(e => ({ ...e }));
  }
}

export interface HostGroup { ip: string; me: boolean; label: string; entries: NetEntry[] }

const ipKey = (ip: string) => ip.split(".").map(n => n.padStart(3, "0")).join(".");

/**
 * Nach Absender-IP gruppieren, „Dieser Rechner“ (alle eigenen Adressen in einer Gruppe) oben. Name einer Gruppe: der häufigste Platz
 * (`where`), sonst die Adresse. Innerhalb: Programme alphabetisch, Gegangene hinten.
 */
export function groupByHost(entries: readonly NetEntry[], localIps: readonly string[]): HostGroup[] {
  // Alle eigenen Adressen bilden eine Gruppe „Dieser Rechner“
  const map = new Map<string, NetEntry[]>();
  const keyOf = (e: NetEntry) => (localIps.includes(e.ip) ? "\u0000me" : e.ip);
  for (const e of entries) { const k = keyOf(e); const l = map.get(k) ?? []; l.push(e); map.set(k, l); }
  const out: HostGroup[] = [];
  for (const [k, list] of map) {
    const me = k === "\u0000me";
    const ip = me ? [...new Set(list.map(e => e.ip))].sort((a, b) => ipKey(a).localeCompare(ipKey(b))).join(", ") : k;
    const count = new Map<string, number>();
    for (const e of list) if (e.where) count.set(e.where, (count.get(e.where) ?? 0) + 1);
    const label = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
    list.sort((a, b) => Number(a.gone) - Number(b.gone) || Number(b.self) - Number(a.self) || a.app.localeCompare(b.app) || a.nick.localeCompare(b.nick));
    out.push({ ip, me, label, entries: list });
  }
  return out.sort((a, b) => Number(b.me) - Number(a.me) || ipKey(a.ip).localeCompare(ipKey(b.ip)));
}
