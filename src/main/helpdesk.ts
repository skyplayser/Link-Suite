// KI-Hilfe-Assistent: Aufrufe an api.link-suite.de nur hier im Hauptprozess (Node fetch, ohne Origin-Kopf – der Dienst
// lässt per CORS nur link-suite.de zu). Der Stream (Server-Sent Events) geht Stück für Stück per IPC an die Oberfläche.
// Vor der Bestätigung des KI-Hinweises sendet nichts; die Geräte-Kennung entsteht erst mit der Bestätigung.
import { randomUUID } from "node:crypto";
import { HELP_API, HELP_MAX_CHARS, HELP_MAX_LOG, parseReport, parseSse, parseSources, type HelpReport } from "../core/helpdesk";

export type HelpEvent =
  | { ev: "meta"; conversationId: string; remaining: number | null; warn: boolean }
  | { ev: "sources"; sources: ReturnType<typeof parseSources> }
  | { ev: "delta"; text: string }
  | { ev: "done"; remaining: number | null; closed: boolean; report: HelpReport | null }
  | { ev: "error"; code: string; message: string; report: HelpReport | null };

export interface HelpSendInput { conversationId: string | null; program: string | null; lang: "de" | "en"; message: string; /** Diagnose angehängt: der Dienst erlaubt dann längere Nachrichten. */ log?: boolean }

export interface HelpDeps {
  version: string;
  emit(req: number, e: HelpEvent): void;
  say(key: string): string;
  log?(event: string, detail?: string): void;
  fetchImpl?: typeof fetch;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export class Helpdesk {
  private next = 1;
  private readonly running = new Map<number, AbortController>();
  /** Zufällige Kennung für die Limits des Dienstes: nur im Arbeitsspeicher, neu bei jedem Start (Rechtsprüfung A3). */
  private id = randomUUID();

  constructor(private readonly d: HelpDeps) {}

  private deviceId(): string { return this.id; }
  /** Zurücksetzen (Einstellungen): laufende Anfragen ab, neue Kennung. */
  reset(): void { this.cancelAll(); this.id = randomUUID(); }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Accept: "text/event-stream, application/json", "User-Agent": `Link-Suite/${this.d.version}` };
  }

  /** Nachricht senden; die Antwort kommt als Ereignisse mit der zurückgegebenen Nummer. */
  send(input: HelpSendInput): number {
    const req = this.next++;
    const ctl = new AbortController();
    this.running.set(req, ctl);
    void this.run(req, input, ctl).finally(() => this.running.delete(req));
    return req;
  }

  cancel(req: number): void { this.running.get(req)?.abort(); }
  cancelAll(): void { for (const c of this.running.values()) c.abort(); }

  private async run(req: number, input: HelpSendInput, ctl: AbortController): Promise<void> {
    const f = this.d.fetchImpl ?? fetch;
    const fail = (code: string, message?: string, report: HelpReport | null = null) =>
      this.d.emit(req, { ev: "error", code, message: message || this.d.say("help.err.net"), report });
    const timer = setTimeout(() => ctl.abort(), 180_000);
    try {
      const body = JSON.stringify({
        deviceId: this.deviceId(),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.program ? { program: input.program } : {}),
        lang: input.lang, page: "/launcher/",
        message: input.message.slice(0, input.log ? HELP_MAX_LOG : HELP_MAX_CHARS),
        ...(input.log ? { log: true } : {}),
      });
      const res = await f(`${HELP_API}/v1/chat`, { method: "POST", headers: this.headers(), body, redirect: "error", signal: ctl.signal });
      if (!res.ok || !res.body) {
        let j: Record<string, unknown> = {};
        try { j = (await res.json()) as Record<string, unknown>; } catch { /* leer */ }
        this.d.log?.("help error", `${res.status} ${str(j.error, 40)}`);
        fail(str(j.error, 40) || `http_${res.status}`, str(j.message, 500), parseReport(j.report));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (buf.length > 1_000_000) throw new Error("too large");
        const { events, rest } = parseSse(buf);
        buf = rest;
        for (const { event, data } of events) {
          const o = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
          if (event === "meta") this.d.emit(req, { ev: "meta", conversationId: str(o.conversationId, 100), remaining: num(o.remaining), warn: o.warn === true });
          else if (event === "sources") this.d.emit(req, { ev: "sources", sources: parseSources(data) });
          else if (event === "delta") { const t = str(o.text, 20000); if (t) this.d.emit(req, { ev: "delta", text: t }); }
          else if (event === "done") { ended = true; this.d.emit(req, { ev: "done", remaining: num(o.remaining), closed: o.closed === true, report: parseReport(o.report) }); }
          else if (event === "error") { ended = true; this.d.log?.("help stream error", str(o.code, 40)); fail(str(o.code, 40) || "error", str(o.message, 500)); }
        }
      }
      if (!ended) fail("cut");
    } catch (e) {
      if (ctl.signal.aborted) { this.d.emit(req, { ev: "error", code: "aborted", message: "", report: null }); return; }
      this.d.log?.("help fetch failed", (e as Error).message);
      fail("net");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Meldung per E-Mail vorbereiten (auch vor der 25. Nachricht). */
  async report(conversationId: string, lang: "de" | "en"): Promise<HelpReport | { error: string; message: string }> {
    const f = this.d.fetchImpl ?? fetch;
    try {
      const res = await f(`${HELP_API}/v1/report`, {
        method: "POST", headers: this.headers(), redirect: "error", signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ deviceId: this.deviceId(), conversationId: conversationId.slice(0, 100), lang }),
      });
      let j: Record<string, unknown> = {};
      try { j = (await res.json()) as Record<string, unknown>; } catch { /* leer */ }
      const rep = res.ok ? parseReport(j) : null;
      if (rep) return rep;
      this.d.log?.("help report failed", `${res.status} ${str(j.error, 40)}`);
      return { error: str(j.error, 40) || `http_${res.status}`, message: str(j.message, 500) || this.d.say("help.err.net") };
    } catch (e) {
      this.d.log?.("help report failed", (e as Error).message);
      return { error: "net", message: this.d.say("help.err.net") };
    }
  }
}
