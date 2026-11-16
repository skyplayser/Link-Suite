// Übernommen aus VJ-Link src/main/suitechat.ts (EPL-2.0, Stand 15.11.2026). Geändert für Link-Suite:
// - Name, Platz und An/Aus kommen aus suite.json (Store) statt chat.json; Speichern über `persist`.
// - Jedes Datagramm geht zusätzlich an die Liste „Im Netz“ (Roster, mit Absender-IP) und an die Antwort
//   `echo` auf `probe` von NET Link (eine Antwort je Adapter, 0–200 ms verzögert, höchstens 1/s je NET Link).
// - `inject` speist im Demo-Modus erfundene Datagramme über denselben Weg ein.
// Suite-Chat, Netzseite: UDP-Multicast auf jeder IPv4-Schnittstelle (docs/suite-chat.md im LJ-Link-Repo).
// Fehler beenden nur den Chat auf dieser Schnittstelle; das Starten der Programme berührt das nie.
// Chat-Texte stehen nirgends auf der Platte (nur im Speicher).
import dgram from "node:dgram";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { CHAT_GROUP, CHAT_PORT, MAX_DATAGRAM, SendGate, SuiteChat, type ChatState } from "../core/suitechat";
import { EchoThrottle, Roster, echoDelay, echoJson, parseDatagram, parseProbe } from "../core/suitenet";

export interface ChatSettings { on: boolean; nick: string; where: string }

/**
 * IPv4-Adressen der Schnittstellen für den Chat: nicht Loopback, nicht 169.254.x.x und keine Tunnel (VPN). Node kennt
 * das Multicast-Flag der Schnittstelle nicht; Tunnel erkennt VJ-Link an Name (utun, ipsec, ppp, tun, gif, stf) bzw.
 * an der Punkt-zu-Punkt-Netzmaske 255.255.255.255, so wie LJ Link (supportsMulticast, !virtual) und LJL Link
 * (IFF_MULTICAST) sie ausschließen.
 */
export function adapterList(): { name: string; ip: string }[] {
  const out: { name: string; ip: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const n of list ?? []) {
    if (n.family !== "IPv4" || n.internal || n.address.startsWith("169.254.")) continue;
    if (/^(utun|ipsec|ppp|tun|gif|stf)\d*$/i.test(name) || n.netmask === "255.255.255.255") continue;
    if (!out.some(x => x.ip === n.address)) out.push({ name, ip: n.address });
  }
  return out;
}
function adapters(): string[] { return adapterList().map(a => a.ip); }

export class ChatNet {
  readonly chat: SuiteChat;
  readonly roster: Roster;
  private readonly echoes = new EchoThrottle();
  private settings: ChatSettings;
  private recv?: dgram.Socket;
  private readonly joined = new Set<string>();
  private readonly senders = new Map<string, { sock: dgram.Socket; ready: boolean }>();
  private tickTimer?: NodeJS.Timeout;
  private rejoinTimer?: NodeJS.Timeout;
  private notifyTimer?: NodeJS.Timeout;
  private starting?: Promise<void>;
  /** Datagramme, die noch aufs Senden warten (eingeplant oder unterwegs); höchstens MAX_PENDING. */
  private readonly gate = new SendGate();

  /**
   * `port`: 47676 für den echten Raum. Tests und Demo nehmen einen eigenen Port (LINKSUITE_CHAT_PORT), damit sie nie
   * im Raum der laufenden Programme auftauchen. `persist`: Einstellungen speichern (suite.json).
   */
  constructor(
    initial: ChatSettings,
    private readonly persist: (s: ChatSettings) => void,
    private readonly notify: () => void,
    readonly port = CHAT_PORT,
    ver = "",
    private readonly notifyNet: () => void = () => {},
    /** `echo` auf `probe` senden (im Demo aus: ein Demo-Netz sendet nie probe/echo). */
    private readonly answerProbes = true,
  ) {
    this.settings = { ...initial };
    this.chat = new SuiteChat((json, delay, now) => {
      if (now) { this.sendNow(json, true); return; }
      if (delay <= 0) { this.sendNow(json); return; }
      if (!this.gate.take()) return; // Warteschlange voll: verwerfen
      setTimeout(() => { this.gate.done(); this.sendNow(json); }, delay).unref();
    }, undefined, "Link-Suite");
    this.chat.ver = ver;
    this.roster = new Roster(this.chat.peer);
  }

  async init(): Promise<void> {
    this.chat.setProfile(this.settings.nick, this.settings.where, performance.now());
    if (this.settings.on) await this.start();
  }

  private save(): void { this.persist({ ...this.settings }); }

  get enabled(): boolean { return this.settings.on && !!this.recv; }
  get error(): string { return this.chat.error ?? ""; }

  /**
   * Ein Datagramm von `ip`: an die Liste „Im Netz“, `probe` beantworten, dann an den Chat-Raum.
   * Im Demo-Modus kommen erfundene Datagramme über `inject` auf demselben Weg.
   */
  private handle(text: string, ip: string, wall = Date.now()): void {
    const o = parseDatagram(text);
    if (!o) return;
    if (this.roster.observe(o, ip, wall)) this.netChanged();
    const probe = parseProbe(o);
    if (probe) {
      if (this.answerProbes && this.chat.enabled && this.echoes.allow(probe.peer, performance.now())) {
        const t = setTimeout(() => this.sendEach(own => echoJson(probe, { peer: this.chat.peer, app: this.chat.app, ver: this.chat.ver }, own)), echoDelay());
        t.unref();
      }
      return;
    }
    if (this.chat.receive(text, performance.now())) this.changed();
  }

  /** Demo: Datagramm wie aus dem Netz (gleicher Weg wie echte Daten). */
  inject(text: string, ip: string, wall?: number): void {
    if (this.recv) this.handle(text, ip, wall);
  }
  state(since: number): ChatState { return this.chat.state(since); }

  post(text: unknown, urgent: unknown): boolean {
    const ok = this.chat.post(text, urgent === true);
    if (ok) this.changed();
    return ok;
  }

  /** Ein/aus, Name, Position (aus der Oberfläche). */
  async configure(c: { enabled?: unknown; nick?: unknown; where?: unknown }): Promise<ChatState> {
    if (typeof c.nick === "string" || typeof c.where === "string") {
      this.chat.setProfile(typeof c.nick === "string" ? c.nick : this.settings.nick, typeof c.where === "string" ? c.where : this.settings.where, performance.now());
      const p = this.chat.profile;
      this.settings.nick = p.nick; this.settings.where = p.where;
    }
    if (c.enabled === true) {
      // Auch wenn die Einstellung schon „an“ ist: lief das Netz nicht (Port war belegt), jetzt erneut binden.
      this.settings.on = true;
      if (!this.recv) await this.start();
    } else if (c.enabled === false) {
      this.settings.on = false;
      if (this.recv) this.stopNet();
    }
    this.save();
    this.changed();
    return this.chat.state(0);
  }

  // ------------------------------------------------------------------ Netz

  private start(): Promise<void> {
    if (this.starting) return this.starting;
    this.chat.error = undefined;
    this.starting = new Promise<void>(resolve => {
      const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
      this.recv = s;
      s.on("message", (buf, rinfo) => {
        if (buf.length > MAX_DATAGRAM) return;
        this.handle(buf.toString("utf8"), rinfo.address);
      });
      s.on("error", err => {
        // Port nicht nutzbar: der Chat bleibt leer, alles andere läuft weiter.
        console.error(`Suite chat: port ${this.port} not available (${err.message})`);
        this.chat.error = err.message;
        try { s.close(); } catch { /* zu */ }
        if (this.recv === s) { this.recv = undefined; this.starting = undefined; }
        this.changed();
        resolve();
      });
      s.bind(this.port, async () => {
        try { s.setMulticastTTL(1); s.setMulticastLoopback(true); } catch { /* egal */ }
        await this.rejoin();
        // Inzwischen wieder ausgeschaltet (Aus im selben Augenblick wie Ein): nicht beitreten, keine Timer.
        if (this.recv !== s) { resolve(); return; }
        this.chat.setOn(true, performance.now());
        this.tickTimer = setInterval(() => {
          if (this.chat.tick(performance.now())) this.changed();
          if (this.roster.tick(Date.now())) this.netChanged();
        }, 500);
        this.tickTimer.unref();
        this.rejoinTimer = setInterval(() => { void this.rejoin(); }, 30_000); // WLAN kommt und geht
        this.rejoinTimer.unref();
        this.changed();
        resolve();
      });
    });
    return this.starting;
  }

  /** Gruppe auf jeder Schnittstelle betreten; je Schnittstelle ein eigener Sende-Socket (fest auf sie eingestellt). */
  private async rejoin(): Promise<void> {
    const s = this.recv;
    if (!s) return;
    const now = adapters();
    for (const ip of [...this.joined]) if (!now.includes(ip)) {
      try { s.dropMembership(CHAT_GROUP, ip); } catch { /* Schnittstelle weg */ }
      this.joined.delete(ip);
    }
    for (const [ip, x] of [...this.senders]) if (!now.includes(ip)) { try { x.sock.close(); } catch { /* zu */ } this.senders.delete(ip); }
    const waits: Promise<void>[] = [];
    for (const ip of now) {
      if (!this.joined.has(ip)) {
        try { s.addMembership(CHAT_GROUP, ip); this.joined.add(ip); } catch { /* diese Schnittstelle kann kein Multicast */ }
      }
      if (!this.senders.has(ip)) {
        const sock = dgram.createSocket({ type: "udp4" });
        const x = { sock, ready: false };
        this.senders.set(ip, x);
        sock.on("error", () => { try { sock.close(); } catch { /* zu */ } if (this.senders.get(ip) === x) this.senders.delete(ip); });
        waits.push(new Promise(res => {
          sock.bind(0, ip, () => {
            try { sock.setMulticastTTL(1); sock.setMulticastLoopback(true); sock.setMulticastInterface(ip); x.ready = true; } catch { /* nicht nutzbar */ }
            res();
          });
          setTimeout(res, 1000).unref();
        }));
      }
    }
    await Promise.all(waits);
  }

  /** `force`: an der Grenze für wartende Datagramme vorbei (nur „bye“ beim Beenden). */
  private sendNow(json: string, force = false): void {
    if (!this.recv) return;
    const data = Buffer.from(json, "utf8");
    if (data.length > MAX_DATAGRAM) return;
    for (const x of this.senders.values()) {
      if (!x.ready || !this.gate.take(force)) continue;
      x.sock.send(data, this.port, CHAT_GROUP, () => { this.gate.done(); /* Fehler: Schnittstelle weg, rejoin merkt es */ });
    }
  }

  /** Je Adapter ein eigenes Datagramm (für `echo`: `ip` = Adresse dieses Adapters). */
  private sendEach(build: (ip: string) => string): void {
    if (!this.recv) return;
    for (const [ip, x] of this.senders) {
      if (!x.ready || !this.gate.take()) continue;
      const data = Buffer.from(build(ip), "utf8");
      if (data.length > MAX_DATAGRAM) { this.gate.done(); continue; }
      x.sock.send(data, this.port, CHAT_GROUP, () => { this.gate.done(); });
    }
  }

  private stopNet(): void {
    this.chat.setOn(false, performance.now()); // „bye“ geht noch über die offenen Sockets
    this.roster.clear();
    this.netChanged();
    const recv = this.recv, senders = [...this.senders.values()];
    this.recv = undefined; this.starting = undefined;
    this.senders.clear(); this.joined.clear();
    this.gate.reset();
    clearInterval(this.tickTimer); clearInterval(this.rejoinTimer);
    // kurz warten, bis „bye“ hinaus ist, dann den Port freigeben
    setTimeout(() => {
      for (const x of senders) { try { x.sock.close(); } catch { /* zu */ } }
      try { recv?.close(); } catch { /* zu */ }
    }, 100).unref();
  }

  /** Beim Beenden noch „bye“ zu senden? */
  get wantsBye(): boolean { return this.settings.on && !!this.recv; }
  /** Beenden: „bye“ sofort, damit die anderen es gleich sehen. */
  quit(): void { if (this.settings.on) this.chat.stop(); }

  /** Oberfläche benachrichtigen (gebündelt; sie holt sich dann das Neue). */
  private changed(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => { this.notifyTimer = undefined; this.notify(); }, 80);
  }

  private netTimer?: NodeJS.Timeout;
  private netChanged(): void {
    if (this.netTimer) return;
    this.netTimer = setTimeout(() => { this.netTimer = undefined; this.notifyNet(); }, 150);
  }
}
