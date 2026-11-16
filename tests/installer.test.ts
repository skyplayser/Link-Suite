// Installer ohne Netz: Ergebnis des Selbst-Update-Skripts, Selbst-Update nur aus beschreibbarem Programme-Ordner, Demo.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Installer, STALL_MS } from "../src/main/installer";
import { DEMO_RELEASES } from "../src/main/demo";

function make() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-inst-"));
  const ins = new Installer({
    version: "0.2.0", dataDir: dir, installedPath: () => null, isRunning: async () => false, askQuit: async () => false,
    pickLjlTarget: async () => null, onChange() {}, say: (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k),
  });
  return { ins, dir };
}

describe("Installer", () => {
  it("liest das Ergebnis des Selbst-Updates beim nächsten Start und entfernt das Log", () => {
    const { ins, dir } = make();
    fs.writeFileSync(path.join(dir, "self-update.log"), "mv: rename failed\nLINKSUITE-RESULT: fail replace\n");
    ins.readSelfResult();
    expect(ins.snapshot().selfResult).toContain("inst.self.failed");
    expect(ins.snapshot().selfResult).toContain("replace");
    expect(fs.existsSync(path.join(dir, "self-update.log"))).toBe(false);
    fs.writeFileSync(path.join(dir, "self-update.log"), "LINKSUITE-RESULT: ok 0.2.1\n");
    const b = make().ins;
    (b as unknown as { d: { dataDir: string } }).d.dataDir = dir;
    b.readSelfResult();
    expect(b.snapshot().selfResult).toContain("inst.self.ok");
  });
  it("ohne Log kein Hinweis", () => {
    const { ins } = make();
    ins.readSelfResult();
    expect(ins.snapshot().selfResult).toBe("");
  });
  it("Selbst-Update nicht aus der Entwicklungsumgebung (kein .app-Bundle)", () => {
    expect(make().ins.snapshot().selfBlocked).not.toBe("");
  });
  it("Demo: feste Releases, Installieren nur gespielt (kein Netz)", async () => {
    const { ins } = make();
    ins.setDemo(DEMO_RELEASES);
    const s = ins.snapshot();
    expect(s.demo).toBe(true);
    expect(s.entries.find(e => e.id === "lj")!.latest!.version).toBe("1.7.11");
    expect(s.entries.find(e => e.id === "suite")!.check).toBe("missing");
    await ins.install("vj");
    expect(ins.snapshot().entries.find(e => e.id === "vj")).toMatchObject({ phase: "done" });
    expect(ins.snapshot().entries.find(e => e.id === "vj")!.message).toContain("inst.demo");
  });
  it("Leerlauf-Grenze 60 s", () => { expect(STALL_MS).toBe(60_000); });
});

import { fetchHeaders, installWay, readIdle, rmOwn } from "../src/main/installer";
import { SOURCES } from "../src/core/sources";

describe("Löschen und Ersetzen mit app.asar (QA 0.3 Nr. 1)", () => {
  const mkApp = (root: string, name: string, ver: string) => {
    const app = path.join(root, name);
    fs.mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents", "Resources", "app.asar"), "x".repeat(4096));
    fs.writeFileSync(path.join(app, "Contents", "Info.plist"), ver);
    return app;
  };
  it("rmOwn löscht eine .alt-App mit app.asar vollständig, fremde Namen nie", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-rm-"));
    const alt = mkApp(dir, ".VJ-Link.app.alt", "0.1.0");
    await rmOwn(alt);
    expect(fs.existsSync(alt)).toBe(false);
    const other = mkApp(dir, "VJ-Link.app", "0.1.0");
    await expect(rmOwn(other)).rejects.toThrow(/refuse/);
    expect(fs.existsSync(other)).toBe(true);
  });
  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("zwei Updates hintereinander: kein .alt/.neu bleibt, zweites klappt", async () => {
    const { ins } = make();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-place-"));
    const target = path.join(dir, "Applications");
    fs.mkdirSync(target);
    const place = (ins as unknown as { place(src: string, t: string, old: string | null, check: (p: string) => Promise<boolean>): Promise<string> }).place.bind(ins);
    mkApp(target, "VJ-Link.app", "0.1.0");
    for (const v of ["0.1.8", "0.1.9"]) {
      const src = mkApp(fs.mkdtempSync(path.join(dir, "img-")), "VJ-Link.app", v);
      const dest = await place(src, target, path.join(target, "VJ-Link.app"), async () => true);
      expect(fs.readFileSync(path.join(dest, "Contents", "Info.plist"), "utf8")).toBe(v);
      expect(fs.readdirSync(target).sort()).toEqual(["VJ-Link.app"]);
    }
  });
});

describe("Zeitlimits beim Laden (QA 0.3 Nr. 2)", () => {
  it("Zeitlimit gilt nur bis zu den Kopfzeilen: langsamer Body läuft weiter", async () => {
    // Kopfzeilen sofort, Body tröpfelt 600 ms lang (länger als das Kopf-Limit von 200 ms)
    const slow = new ReadableStream<Uint8Array>({
      async start(c) { for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 100)); c.enqueue(new Uint8Array(10)); } c.close(); },
    });
    const fake = (async () => new Response(slow)) as unknown as typeof fetch;
    const res = await fetchHeaders(fake, "https://github.com/x", {}, 200, new AbortController().signal);
    let n = 0;
    await readIdle(res.body!.getReader(), 300, b => { n += b.length; }, "stall");
    expect(n).toBe(60);
  });
  it("Kopfzeilen bleiben aus → Abbruch nach dem Kopf-Limit", async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    await expect(fetchHeaders(hang, "https://github.com/x", {}, 150, new AbortController().signal)).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("Leerlauf: keine Daten länger als das Limit → Abbruch mit Meldung", async () => {
    const stuck = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(1)); } });
    await expect(readIdle(stuck.getReader(), 150, () => {}, "Leerlauf")).rejects.toThrow("Leerlauf");
  });
});

describe("Windows-Installer über die Shell (QA Windows B1/R2, Harness)", () => {
  const win = (over: Record<string, unknown>) => {
    const logs: string[] = [];
    const ins = new Installer({
      version: "0.3.2", dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-win-")), installedPath: () => null,
      isRunning: async () => false, askQuit: async () => false, pickLjlTarget: async () => null, onChange() {},
      say: (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k), log: (e, d) => logs.push(`${e} ${d ?? ""}`), platform: "win32", pollMs: 10, ...over,
    });
    const x = ins as unknown as { runWindowsInstaller(id: string, f: string): Promise<void>; waitForVersion(id: string, v: string): Promise<string> };
    return { x, logs };
  };
  it("Erfolg: ShellExecute meldet nichts → weiter", async () => {
    const opened: string[] = [];
    const { x } = win({ openFile: async (f: string) => { opened.push(f); return ""; } });
    await x.runWindowsInstaller("lj", "C:\\dl\\LJ-Link-windows.exe");
    expect(opened).toEqual(["C:\\dl\\LJ-Link-windows.exe"]);
  });
  it("Fehler bzw. UAC abgebrochen: klare Meldung, Eintrag im Log", async () => {
    const { x, logs } = win({ openFile: async () => "Der Vorgang wurde durch den Benutzer abgebrochen." });
    await expect(x.runWindowsInstaller("lj", "C:\\dl\\x.exe")).rejects.toThrow(/inst\.err\.winOpen/);
    expect(logs.some(l => l.startsWith("installer open failed lj"))).toBe(true);
  });
  it("Ausnahme beim Öffnen wird ebenso gemeldet", async () => {
    const { x } = win({ openFile: async () => { throw new Error("EACCES"); } });
    await expect(x.runWindowsInstaller("vj", "C:\\dl\\x.exe")).rejects.toThrow(/EACCES/);
  });
  it("Registry-Nachschau: fertig, sobald die neue Version da ist", async () => {
    const seen = ["1.7.10", "1.7.10", "1.7.11"];
    const { x } = win({ installedVersion: async () => seen.shift() ?? "1.7.11" });
    expect(await x.waitForVersion("lj", "1.7.11")).toContain("inst.done");
  });
});

describe("Unter Windows immer der Installer, nie Ersetzen über .neu/.alt (1.0.0)", () => {
  it("Weg je Quelle und Plattform", () => {
    for (const src of Object.values(SOURCES)) {
      const exe = src.asset("win32", "x64", "1.0.0");
      if (exe) expect(installWay(src.id, exe, "win32")).toBe("exe");
      expect(installWay(src.id, "X.dmg", "win32")).toBeNull();
      expect(installWay(src.id, "X.zip", "win32")).toBeNull();
    }
    expect(installWay("suite", "Link-Suite-macos-arm64.dmg", "darwin")).toBe("self-dmg");
    expect(installWay("vd", "VD-Link-macos-x64.dmg", "darwin")).toBe("dmg");
    expect(installWay("ljl", "LJL-Link-0.3.1-macOS.zip", "darwin")).toBe("ljl-zip");
    expect(installWay("lj", "LJ-Link-windows.exe", "darwin")).toBeNull();
  });
  it("place() verweigert unter Windows", async () => {
    const ins = new Installer({
      version: "1.0.0", dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-w-")), installedPath: () => null, isRunning: async () => false,
      askQuit: async () => false, pickLjlTarget: async () => null, onChange() {}, say: k => k, platform: "win32",
    });
    const place = (ins as unknown as { place(a: string, b: string, c: null, d: () => Promise<boolean>): Promise<string> }).place.bind(ins);
    await expect(place("C:\\x\\A.app", "C:\\Programs", null, async () => true)).rejects.toThrow(/macOS only/);
  });
});

import { vi } from "vitest";
describe("GitHub-Kontingent aufgebraucht (Windows-Test 0.3.2)", () => {
  it("403 mit x-ratelimit-remaining 0: sofort aufhören, Zwischenspeicher behalten, keine Wiederholung", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) } });
    });
    try {
      const { ins } = make();
      ins.loadCache({ at: 1_700_000_000_000, entries: { vj: { version: "0.1.8", tag: "v0.1.8", asset: "VJ-Link-macos-arm64.dmg", url: "https://github.com/skyplayser/VJ-LINK/releases/download/v0.1.8/VJ-Link-macos-arm64.dmg", size: 10, sha256: "a".repeat(64) } } });
      await ins.check(true);
      expect(calls).toHaveLength(1);
      const s = ins.snapshot();
      expect(s.rateLimitedUntil).toBeGreaterThan(Date.now());
      expect(s.lastGood).toBe(1_700_000_000_000);
      expect(s.entries.find(e => e.id === "vj")).toMatchObject({ check: "ok", cached: true });
      await ins.check(true);
      expect(calls).toHaveLength(1); // keine Schleife bis zum Zurücksetzen
    } finally { vi.unstubAllGlobals(); }
  });
});
