// probe/echo (NET-Link-Konzept „Suite-Protokoll“) und die Liste „Im Netz“.
import { describe, expect, it } from "vitest";
import { ECHO_GLOBAL_PER_S, ECHO_MAX_DELAY_MS, EchoThrottle, validEnvelope, ROSTER_KEEP_GONE_MS, Roster, echoDelay, echoJson, groupByHost, isIpv4, parseDatagram, parseProbe } from "../src/core/suitenet";

const probe = { suite: "net", v: 1, t: "probe", peer: "n4k8x2m7p0", app: "NET Link", ver: "0.1.0", seq: 17, at: 1794685866935 };

describe("probe / echo", () => {
  it("liest probe streng", () => {
    expect(parseProbe(probe)).toEqual({ peer: "n4k8x2m7p0", seq: 17 });
    expect(parseProbe({ ...probe, t: "echo" })).toBeNull();
    expect(parseProbe({ ...probe, suite: "chat" })).toBeNull();
    expect(parseProbe({ ...probe, v: 2 })).toBeNull();
    expect(parseProbe({ ...probe, peer: "BAD PEER" })).toBeNull();
    expect(parseProbe({ ...probe, seq: 1.5 })).toBeNull();
    expect(parseProbe({ ...probe, seq: "17" })).toBeNull();
  });
  it("echo im Format des Konzepts, ip = Adapter", () => {
    const e = JSON.parse(echoJson({ peer: "n4k8x2m7p0", seq: 17 }, { peer: "q8w2e4r5t6", app: "Link-Suite", ver: "0.1.0" }, "192.168.1.12"));
    expect(e).toEqual({ suite: "net", v: 1, t: "echo", peer: "q8w2e4r5t6", app: "Link-Suite", ver: "0.1.0", to: "n4k8x2m7p0", seq: 17, ip: "192.168.1.12" });
  });
  it("höchstens 1 echo je Sekunde je NET Link", () => {
    const g = new EchoThrottle(2);
    expect(g.allow("aaaaaaaa", 0)).toBe(true);
    expect(g.allow("aaaaaaaa", 999)).toBe(false);
    expect(g.allow("bbbbbbbb", 999)).toBe(true);
    expect(g.allow("aaaaaaaa", 1000)).toBe(true);
    // Grenze der gemerkten NET Links
    g.allow("cccccccc", 1001);
    expect(g.allow("bbbbbbbb", 1002)).toBe(true); // b fiel heraus
  });
  it("globale Obergrenze: probe mit immer neuer Kennung bekommt höchstens 5 echo je Sekunde", () => {
    const g = new EchoThrottle();
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (g.allow(`p${String(i).padStart(9, "0")}`, 5000)) ok++;
    expect(ok).toBe(ECHO_GLOBAL_PER_S);
    expect(g.allow("neuepeer1", 6001)).toBe(true);
  });
  it("Verzögerung 0–200 ms", () => {
    expect(echoDelay(() => 0)).toBe(0);
    expect(echoDelay(() => 0.9999999)).toBe(ECHO_MAX_DELAY_MS);
    for (let i = 0; i < 100; i++) { const d = echoDelay(); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(200); }
  });
  it("Datagramme: nur Objekte mit suite, höchstens 8 KB", () => {
    expect(parseDatagram(JSON.stringify(probe))).not.toBeNull();
    expect(parseDatagram('{"t":"here"}')).toBeNull();
    expect(parseDatagram("[1]")).toBeNull();
    expect(parseDatagram("x".repeat(9000))).toBeNull();
    expect(parseDatagram("{kaputt")).toBeNull();
  });
});

const here = (peer: string, o: Record<string, unknown> = {}) => ({ suite: "chat", v: 1, t: "here", peer, nick: "Lena", where: "VJ-Platz", app: "VJ-Link", ver: "0.1.8", ...o });

describe("Liste „Im Netz“", () => {
  it("here legt an (mit Absender-IP und ver), bye macht „weg“", () => {
    const r = new Roster("selfpeer0001");
    expect(r.observe(here("vjpeer000001"), "192.168.1.12", 1000)).toBe(true);
    expect(r.observe(here("vjpeer000001"), "192.168.1.12", 2000)).toBe(false);
    expect(r.list()[0]).toMatchObject({ peer: "vjpeer000001", app: "VJ-Link", nick: "Lena", where: "VJ-Platz", ver: "0.1.8", ip: "192.168.1.12", gone: false, self: false });
    expect(r.observe({ suite: "chat", v: 1, t: "bye", peer: "vjpeer000001" }, "192.168.1.12", 3000)).toBe(true);
    expect(r.list()[0]).toMatchObject({ gone: true, goneAt: 3000 });
    // kommt wieder
    expect(r.observe(here("vjpeer000001"), "192.168.1.12", 4000)).toBe(true);
    expect(r.list()[0]!.gone).toBe(false);
  });
  it("ohne ver: leer (älteres Programm); eigene Kennung = self", () => {
    const r = new Roster("selfpeer0001");
    r.observe(here("vdpeer000001", { ver: undefined, app: "VD-Link" }), "10.0.0.2", 0);
    r.observe(here("selfpeer0001", { app: "Link-Suite", ver: "0.1.0" }), "10.0.0.1", 0);
    const l = r.list();
    expect(l.find(e => e.app === "VD-Link")!.ver).toBe("");
    expect(l.find(e => e.app === "Link-Suite")!.self).toBe(true);
  });
  it("15 s still → weg; nach 30 min aus der Liste", () => {
    const r = new Roster("selfpeer0001");
    r.observe(here("vjpeer000001"), "192.168.1.12", 0);
    expect(r.tick(15_000)).toBe(false);
    expect(r.tick(15_001)).toBe(true);
    expect(r.list()[0]).toMatchObject({ gone: true, goneAt: 15_000 });
    expect(r.tick(15_000 + ROSTER_KEEP_GONE_MS + 1)).toBe(true);
    expect(r.list()).toEqual([]);
  });
  it("andere suite-Werte zeigen, dass ein Programm lebt; Inhalte werden nicht ausgewertet", () => {
    const r = new Roster("selfpeer0001");
    r.observe({ suite: "crew", v: 1, t: "tick", peer: "c7m2q9x4k1", now: 1 }, "192.168.1.30", 0);
    r.observe(probe, "192.168.1.14", 0);
    const l = r.list();
    expect(l.find(e => e.peer === "c7m2q9x4k1")!.app).toBe("Crew Link");
    expect(l.find(e => e.peer === "n4k8x2m7p0")).toMatchObject({ app: "NET Link", ver: "0.1.0" });
    expect(r.observe({ suite: "foo", v: 1, peer: "zzzzzzzz" }, "1.2.3.4", 0)).toBe(false);
  });
  it("Prototyp-Schlüssel als suite legen nichts an (QA Befund 1); Liste bleibt klonbar", () => {
    const r = new Roster("selfpeer0001");
    for (const suite of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__", "tostring", "proto"]) {
      expect(r.observe({ suite, v: 1, t: "here", peer: "evilpeer01" }, "1.2.3.4", 0)).toBe(false);
    }
    expect(r.list()).toEqual([]);
    expect(parseDatagram('{"suite":"__proto__","v":1,"t":"here","peer":"evilpeer01"}')).toBeNull();
    expect(parseDatagram('{"suite":"toString","v":1,"t":"here","peer":"evilpeer01"}')).toBeNull();
    r.observe({ suite: "crew", v: 1, t: "tick", peer: "c7m2q9x4k1" }, "1.2.3.4", 0);
    expect(() => structuredClone(r.list())).not.toThrow();
    expect(typeof r.list()[0]!.app).toBe("string");
  });
  it("Hülle streng: suite a–z (1–16), v ganze Zahl ≥ 1, t 1–32 Zeichen", () => {
    const ok = { suite: "chat", v: 1, t: "here" };
    expect(validEnvelope(ok)).toBe(true);
    expect(validEnvelope({ ...ok, suite: "Chat" })).toBe(false);
    expect(validEnvelope({ ...ok, suite: "a".repeat(17) })).toBe(false);
    expect(validEnvelope({ ...ok, v: 0 })).toBe(false);
    expect(validEnvelope({ ...ok, v: 1.5 })).toBe(false);
    expect(validEnvelope({ ...ok, v: "1" })).toBe(false);
    expect(validEnvelope({ ...ok, t: "" })).toBe(false);
    expect(validEnvelope({ ...ok, t: "x".repeat(33) })).toBe(false);
    expect(validEnvelope({ suite: "crew", v: 2, t: "tick" })).toBe(true);
  });
  it("verwirft Falsches: kaputte IP, Kennung, Version; Verlauf und history? legen niemanden an", () => {
    const r = new Roster("selfpeer0001");
    expect(r.observe(here("vjpeer000001"), "not-an-ip", 0)).toBe(false);
    expect(r.observe(here("BAD"), "1.2.3.4", 0)).toBe(false);
    expect(r.observe(here("vjpeer000001", { v: 2 }), "1.2.3.4", 0)).toBe(false);
    expect(r.observe({ suite: "chat", v: 1, t: "history?", peer: "vjpeer000001" }, "1.2.3.4", 0)).toBe(false);
    expect(r.observe({ suite: "chat", v: 1, t: "msg", peer: "vjpeer000001", old: true, app: "VJ-Link" }, "1.2.3.4", 0)).toBe(false);
    expect(r.list()).toEqual([]);
    expect(isIpv4("192.168.1.256")).toBe(false);
  });
  it("Namen werden bereinigt und gekürzt", () => {
    const r = new Roster("selfpeer0001");
    r.observe(here("vjpeer000001", { nick: "A‮b\nc" + "x".repeat(50) }), "1.2.3.4", 0);
    expect(r.list()[0]!.nick.startsWith("Ab c")).toBe(true);
    expect([...r.list()[0]!.nick].length).toBeLessThanOrEqual(24);
  });
  it("gruppiert nach Rechner, dieser Rechner oben, Name = häufigster Platz", () => {
    const r = new Roster("selfpeer0001");
    r.observe(here("aaaaaaaa", { where: "FOH", app: "VD-Link" }), "192.168.1.14", 0);
    r.observe(here("bbbbbbbb", { where: "FOH", app: "NET Link" }), "192.168.1.14", 0);
    r.observe(here("cccccccc", { where: "Booth", app: "LJ Link" }), "192.168.1.10", 0);
    r.observe(here("dddddddd", { where: "VJ", app: "VJ-Link" }), "192.168.1.9", 0);
    const g = groupByHost(r.list(), ["192.168.1.10"]);
    expect(g.map(x => [x.ip, x.me, x.label])).toEqual([["192.168.1.10", true, "Booth"], ["192.168.1.9", false, "VJ"], ["192.168.1.14", false, "FOH"]]);
    expect(g[2]!.entries.map(e => e.app)).toEqual(["NET Link", "VD-Link"]);
    r.observe(here("eeeeeeee", { where: "Booth", app: "Link-Suite" }), "10.0.0.5", 0);
    const g2 = groupByHost(r.list(), ["192.168.1.10", "10.0.0.5"]);
    expect(g2[0]).toMatchObject({ ip: "10.0.0.5, 192.168.1.10", me: true });
    expect(g2[0]!.entries).toHaveLength(2);
  });
});
