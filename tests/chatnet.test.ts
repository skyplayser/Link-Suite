// Übernommen aus VJ-Link tests/chatnet.test.ts (EPL-2.0); angepasst an den Konstruktor von Link-Suite
// (Einstellungen aus suite.json statt chat.json). Netzseite mit echten Sockets, auf einem Testport – nie 47676.
import { describe, expect, it } from "vitest";
import dgram from "node:dgram";
import { ChatNet, type ChatSettings } from "../src/main/suitechat";
import { CHAT_PORT } from "../src/core/suitechat";

const PORT = Number(process.env.LINKSUITE_TEST_PORT) || 47683;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("Suite-Chat: Netz (Testport)", () => {
  it("Testport ist nie der echte Suite-Port", () => {
    expect(PORT).not.toBe(CHAT_PORT);
  });

  it("Port belegt beim Start: Einschalten versucht das Binden erneut; Speichern geht an persist", async () => {
    const blocker = dgram.createSocket({ type: "udp4" }); // ohne Wiederverwendung: hält den Port exklusiv
    await new Promise<void>(r => blocker.bind(PORT, r));
    const saved: ChatSettings[] = [];
    const net = new ChatNet({ on: true, nick: "Max", where: "Booth" }, s => saved.push(s), () => {}, PORT, "0.1.0");
    await net.init();
    expect(net.state(0).error).toBeTruthy();
    expect(net.state(0).enabled).toBe(false);
    expect(net.enabled).toBe(false);
    await new Promise<void>(r => blocker.close(() => r()));
    const st = await net.configure({ enabled: true }); // Einstellung war schon „an“
    expect(st.error).toBeUndefined();
    expect(st.enabled).toBe(true);
    expect(st.app).toBe("Link-Suite");
    expect(saved.at(-1)).toEqual({ on: true, nick: "Max", where: "Booth" });
    await net.configure({ enabled: false, nick: "Lena" });
    expect(saved.at(-1)).toEqual({ on: false, nick: "Lena", where: "Booth" });
    await sleep(200);
  });

  it("Aus im selben Augenblick wie Ein: bleibt aus, ohne Socket", async () => {
    const net = new ChatNet({ on: false, nick: "", where: "" }, () => {}, () => {}, PORT);
    await net.configure({ enabled: false });
    await sleep(200);
    const on = net.configure({ enabled: true });
    const off = net.configure({ enabled: false });
    await Promise.all([on, off]);
    await sleep(1500);
    expect(net.state(0).enabled).toBe(false);
    // Port ist wieder frei: ein exklusiver Socket kann ihn binden
    const probe = dgram.createSocket({ type: "udp4" });
    await new Promise<void>((res, rej) => { probe.once("error", rej); probe.bind(PORT, () => res()); });
    await new Promise<void>(r => probe.close(() => r()));
  });

  it("Demo-Datagramme gehen über denselben Weg in Liste und Chat; reuseAddr lässt Nachbarn auf dem Port zu", async () => {
    let netNotes = 0;
    const net = new ChatNet({ on: true, nick: "Max", where: "Booth" }, () => {}, () => {}, PORT, "0.1.0", () => netNotes++);
    await net.init();
    // Ein Geschwister auf demselben Rechner bindet denselben Port mit Wiederverwendung
    const sibling = dgram.createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((res, rej) => { sibling.once("error", rej); sibling.bind(PORT, () => res()); });
    net.inject(JSON.stringify({ suite: "chat", v: 1, t: "here", peer: "demovjlink02", nick: "Lena", where: "VJ-Platz", app: "VJ-Link", ver: "0.1.7" }), "192.168.1.12");
    net.inject(JSON.stringify({ suite: "chat", v: 1, t: "msg", peer: "demovjlink02", id: "demovjlink02-1abcdefgh", nick: "Lena", where: "VJ-Platz", app: "VJ-Link", text: "Hallo" }), "192.168.1.12");
    net.inject("kaputt", "192.168.1.12");
    const list = net.roster.list();
    expect(list.find(e => e.peer === "demovjlink02")).toMatchObject({ app: "VJ-Link", ver: "0.1.7", ip: "192.168.1.12" });
    expect(net.state(0).messages.map(m => m.text)).toEqual(["Hallo"]);
    await sleep(300);
    expect(netNotes).toBeGreaterThan(0);
    await new Promise<void>(r => sibling.close(() => r()));
    await net.configure({ enabled: false });
    expect(net.roster.list()).toEqual([]);
    await sleep(200);
  });
});
