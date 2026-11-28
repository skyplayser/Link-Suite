// KI-Hilfe-Assistent: Kern (Stream lesen, Markdown als Daten, Zuordnung) und Hauptprozess-Teil mit nachgebautem Dienst.
import { describe, expect, it } from "vitest";
import { contextPrefix, helpSlug, osLabel, parseMarkdown, parseReport, parseSources, parseSse, safeHref, HELP_PROGRAMS } from "../src/core/helpdesk";
import { Helpdesk, type HelpEvent } from "../src/main/helpdesk";
import { parseLauncherJson } from "../src/core/settings";

describe("Zuordnung und Kontext", () => {
  it("Programme → Kennung des Dienstes", () => {
    expect(helpSlug("vj")).toBe("vj-link");
    expect(helpSlug("crew")).toBe("crew-link");
    expect(helpSlug("suite")).toBe("launcher");
    expect(helpSlug("net")).toBeNull();
    expect(helpSlug("__proto__")).toBeNull();
    for (const id of HELP_PROGRAMS) expect(helpSlug(id)).not.toBeNull();
  });
  it("System und Vorsatz der ersten Nachricht", () => {
    expect(osLabel("darwin", "15.1.0")).toBe("macOS 15");
    expect(osLabel("win32", "10.0.22631")).toBe("Windows 11");
    expect(osLabel("win32", "10.0.19045")).toBe("Windows 10");
    expect(contextPrefix("VJ-Link", "0.1.18", "macOS 15")).toBe("[VJ-Link 0.1.18, macOS 15] ");
    expect(contextPrefix("Crew Link", null, "Windows 11")).toBe("[Crew Link, Windows 11] ");
    expect(contextPrefix(null, null, "macOS 15")).toBe("[macOS 15] ");
  });
});

describe("Server-Sent Events", () => {
  it("zerlegt fertige Ereignisse und behält den Rest", () => {
    const { events, rest } = parseSse('event: meta\ndata: {"conversationId":"c1","remaining":24}\n\nevent: delta\ndata: {"text":"Hal"}\n\nevent: delta\ndata: {"te');
    expect(events).toEqual([{ event: "meta", data: { conversationId: "c1", remaining: 24 } }, { event: "delta", data: { text: "Hal" } }]);
    expect(rest).toBe('event: delta\ndata: {"te');
  });
  it("überspringt Kaputtes, versteht CRLF", () => {
    const { events } = parseSse("event: delta\r\ndata: {kaputt\r\n\r\nevent: done\r\ndata: {\"closed\":false}\r\n\r\n");
    expect(events).toEqual([{ event: "done", data: { closed: false } }]);
  });
});

describe("Markdown als Daten", () => {
  it("fett, Code, Links, Listen, Überschrift", () => {
    const b = parseMarkdown("# Titel\n**Wichtig:** `Art-Net` an\n1. eins\n2. [Wiki](https://link-suite.de/wiki/x/)\n- a\n\nEnde");
    expect(b[0]).toEqual({ t: "h", c: [{ t: "text", v: "Titel" }] });
    expect(b[1]).toEqual({ t: "p", c: [{ t: "b", v: "Wichtig:" }, { t: "text", v: " " }, { t: "code", v: "Art-Net" }, { t: "text", v: " an" }] });
    expect(b[2]).toEqual({ t: "ol", items: [[{ t: "text", v: "eins" }], [{ t: "a", v: "Wiki", href: "https://link-suite.de/wiki/x/" }]] });
    expect(b[3]).toEqual({ t: "ul", items: [[{ t: "text", v: "a" }]] });
    expect(b[4]).toEqual({ t: "p", c: [{ t: "text", v: "Ende" }] });
  });
  it("Links nur zu erlaubten Seiten, fremde bleiben Text mit Adresse", () => {
    const b = parseMarkdown("[Wiki](https://link-suite.de/wiki/) [Fremd](https://evil.example/?q=geheim)");
    const c = (b[0] as { c: { t: string; v: string; href?: string }[] }).c;
    expect(c[0]).toEqual({ t: "a", v: "Wiki", href: "https://link-suite.de/wiki/" });
    expect(c.slice(1).every(x => x.t === "text")).toBe(true);
    expect(c.map(x => x.v).join("")).toContain("Fremd (https://evil.example/?q=geheim)");
    expect(safeHref("https://link-suite.de:8443/")).toBeNull();
  });
  it("HTML bleibt Text, nur https-Links", () => {
    const b = parseMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](http://a.de) [z](https://u:p@a.de/)');
    const c = (b[0] as { c: { t: string; v: string }[] }).c;
    expect(c.every(x => x.t === "text")).toBe(true);
    expect(c.map(x => x.v).join("")).toContain("<img src=x onerror=alert(1)>");
    expect(safeHref("https://link-suite.de/a b")).toBeNull();
  });
  it("Quellen und Meldung prüfen", () => {
    expect(parseSources([{ url: "https://link-suite.de/wiki/a/#x", title: "A", heading: "X" }, { url: "https://link-suite.de/wiki/a/#y", title: "A", heading: "X" }, { url: "javascript:1", title: "b" }]))
      .toEqual([{ url: "https://link-suite.de/wiki/a/#x", title: "A", heading: "X" }]);
    expect(parseReport({ to: "fehlermelden@nextphilm.de", subject: "S", body: "B", mailto: "mailto:fehlermelden@nextphilm.de?subject=S" })).toMatchObject({ mailto: "mailto:fehlermelden@nextphilm.de?subject=S" });
    expect(parseReport({ mailto: "https://evil" })).toBeNull();
    expect(parseReport({ mailto: "mailto:fremd@example.com?subject=S" })).toBeNull(); // nur an fehlermelden@nextphilm.de
  });
});

describe("Einstellungen", () => {
  it("Hinweis mit Stand in launcher.json, keine Geräte-Kennung mehr", () => {
    const s = parseLauncherJson(JSON.stringify({ helpConsent: { v: 2, at: "2026-11-28T15:00:00Z" }, helpDeviceId: "0123456789abcdef-x" }));
    expect(s.helpConsent).toEqual({ v: 2, at: "2026-11-28T15:00:00Z" });
    expect("helpDeviceId" in s).toBe(false);
    expect(parseLauncherJson(JSON.stringify({ helpConsent: true })).helpConsent).toBeUndefined(); // alter Vorabstand zählt nicht
  });
});

function sse(parts: string[]): Response {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function make(fetchImpl: typeof fetch) {
  const events: HelpEvent[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const hd = new Helpdesk({
    version: "1.0.7",
    emit: (_req, e) => events.push(e), say: k => k,
    fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return fetchImpl(url, init); }) as typeof fetch,
  });
  // Warten, bis der Aufruf fertig ist (done/error), höchstens 3 s – nicht auf feste Zeit (unter Last zu knapp)
  const settle = async () => { for (let i = 0; i < 300 && !events.some(e => e.ev === "done" || e.ev === "error"); i++) await new Promise(r => setTimeout(r, 10)); };
  return { hd, events, calls, settle };
}

describe("Hauptprozess: Aufruf des Dienstes", () => {
  it("streamt meta, sources, delta, done – ohne Origin, mit Geräte-Kennung und Programm", async () => {
    const x = make(async () => sse([
      'event: meta\ndata: {"conversationId":"c1","used":1,"max":25,"remaining":24,"warn":false}\n\n',
      'event: sources\ndata: [{"url":"https://link-suite.de/wiki/vj/#a","title":"VJ","heading":"Art-Net"}]\n\nevent: delta\ndata: {"text":"Hallo "}\n\n',
      'event: delta\ndata: {"text":"Welt"}\n\nevent: done\ndata: {"remaining":24,"closed":false}\n\n',
    ]));
    x.hd.send({ conversationId: null, program: "vj-link", lang: "de", message: "[VJ-Link 0.1.18, macOS 15] Kein Bild" });
    await x.settle();
    expect(x.calls[0]!.url).toBe("https://api.link-suite.de/v1/chat");
    const h = x.calls[0]!.init.headers as Record<string, string>;
    expect(Object.keys(h).map(k => k.toLowerCase())).not.toContain("origin");
    expect(h["User-Agent"]).toBe("Link-Suite/1.0.7");
    const body = JSON.parse(String(x.calls[0]!.init.body));
    expect(body).toMatchObject({ program: "vj-link", lang: "de", page: "/launcher/", message: "[VJ-Link 0.1.18, macOS 15] Kein Bild" });
    expect(body.deviceId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(body.conversationId).toBeUndefined();
    expect(x.events.map(e => e.ev)).toEqual(["meta", "sources", "delta", "delta", "done"]);
    expect(x.events[0]).toMatchObject({ conversationId: "c1", remaining: 24 });
  });
  it("Fehler vor dem Stream: Meldung des Dienstes, bei chat_closed mit Meldung per E-Mail", async () => {
    const x = make(async () => new Response(JSON.stringify({ error: "chat_closed", message: "Chat ist zu.", report: { to: "f@n.de", subject: "S", body: "B", mailto: "mailto:fehlermelden@nextphilm.de?subject=S" } }), { status: 409 }));
    x.hd.send({ conversationId: "c1", program: null, lang: "de", message: "noch was" });
    await x.settle();
    expect(x.events).toEqual([{ ev: "error", code: "chat_closed", message: "Chat ist zu.", report: { to: "f@n.de", subject: "S", body: "B", mailto: "mailto:fehlermelden@nextphilm.de?subject=S" } }]);
  });
  it("429 und Netzfehler sind nie stumm", async () => {
    const a = make(async () => new Response(JSON.stringify({ error: "device_limit", message: "Für heute ist Schluss." }), { status: 429 }));
    a.hd.send({ conversationId: null, program: null, lang: "en", message: "x" });
    await a.settle();
    expect(a.events[0]).toMatchObject({ ev: "error", code: "device_limit", message: "Für heute ist Schluss." });
    const b = make(async () => { throw new Error("ENOTFOUND"); });
    b.hd.send({ conversationId: null, program: null, lang: "de", message: "x" });
    await b.settle();
    expect(b.events[0]).toMatchObject({ ev: "error", code: "net", message: "help.err.net" });
  });
  it("Stream bricht ab ohne done → Fehler", async () => {
    const x = make(async () => sse(['event: delta\ndata: {"text":"Halb"}\n\n']));
    x.hd.send({ conversationId: null, program: null, lang: "de", message: "x" });
    await x.settle();
    expect(x.events.map(e => e.ev)).toEqual(["delta", "error"]);
  });
  it("Kennung nur im Arbeitsspeicher: gleich im Lauf, neu nach Zurücksetzen; Meldung per E-Mail", async () => {
    const x = make(async () => new Response(JSON.stringify({ to: "fehlermelden@nextphilm.de", subject: "S", body: "B", mailto: "mailto:fehlermelden@nextphilm.de?subject=S" }), { status: 200 }));
    const r = await x.hd.report("c1", "de");
    expect(r).toMatchObject({ mailto: "mailto:fehlermelden@nextphilm.de?subject=S" });
    const id1 = JSON.parse(String(x.calls[0]!.init.body)).deviceId;
    await x.hd.report("c1", "de");
    expect(JSON.parse(String(x.calls[1]!.init.body)).deviceId).toBe(id1);
    x.hd.reset();
    await x.hd.report("c1", "de");
    expect(JSON.parse(String(x.calls[2]!.init.body)).deviceId).not.toBe(id1);
    expect(JSON.parse(String(x.calls[0]!.init.body))).toEqual({ deviceId: id1, conversationId: "c1", lang: "de" });
    expect(x.calls[0]!.url).toBe("https://api.link-suite.de/v1/report");
  });
});
