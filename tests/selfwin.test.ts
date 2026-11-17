// 1.0.3 (Windows-Test 1.0.2): Selbst-Update unter Windows, Ergebnis beim nächsten Start, nie stummes „Installieren“.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Installer, installWay, type InstallerDeps } from "../src/main/installer";

function make(over: Partial<InstallerDeps> = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "ls-selfwin-"));
  const logs: string[] = [];
  const spawned: { file: string; args: string[] }[] = [];
  const d: InstallerDeps = {
    version: "1.0.2", dataDir: data, installedPath: () => null, isRunning: async () => false, askQuit: async () => false,
    pickLjlTarget: async () => null, onChange() {}, say: (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k), log: (e, x) => logs.push(`${e} ${x ?? ""}`),
    platform: "win32", packaged: true, spawnSelfSetup: (file, args) => spawned.push({ file, args }), ...over,
  };
  return { ins: new Installer(d), data, logs, spawned };
}

describe("Selbst-Update unter Windows", () => {
  it("eigener Weg self-exe nur für Link-Suite", () => {
    expect(installWay("suite", "Link-Suite-windows.exe", "win32")).toBe("self-exe");
    expect(installWay("vj", "VJ-Link-windows.exe", "win32")).toBe("exe");
  });
  it("geht in der fertigen App, nicht im Entwickler-Build", () => {
    expect(make().ins.selfBlocker()).toBe("");
    expect(make({ packaged: false }).ins.selfBlocker()).toBe("inst.err.selfDev");
    expect(make().ins.snapshot().selfPending).toBe(false);
  });
  it("beim Beenden: Marke schreiben, Installer still pro Benutzer starten (wie electron-updater)", () => {
    const { ins, data, spawned } = make();
    ins.pendingSelf = { script: "", dmg: "C:\\dl\\Link-Suite-windows.exe", app: "", version: "1.0.3" };
    expect(ins.snapshot().selfPending).toBe(true);
    expect(ins.runPendingSelfUpdate()).toBe(true);
    expect(spawned).toEqual([{ file: "C:\\dl\\Link-Suite-windows.exe", args: ["--updated", "/S", "--force-run"] }]);
    expect(JSON.parse(fs.readFileSync(path.join(data, "self-update.json"), "utf8")).version).toBe("1.0.3");
    // Download bleibt liegen, solange das Update wartet
    expect(ins.cleanupSync()).toEqual([]);
  });
  it("nächster Start: erwartete Version → „aktualisiert“, sonst Fehler; Marke wird gelöscht", () => {
    const ok = make({ version: "1.0.3" });
    fs.writeFileSync(path.join(ok.data, "self-update.json"), JSON.stringify({ version: "1.0.3" }));
    ok.ins.readSelfResult();
    expect(ok.ins.snapshot().selfResult).toBe('inst.self.ok {"v":"1.0.3"}');
    expect(fs.existsSync(path.join(ok.data, "self-update.json"))).toBe(false);
    const bad = make({ version: "1.0.2" });
    fs.writeFileSync(path.join(bad.data, "self-update.json"), JSON.stringify({ version: "1.0.3" }));
    bad.ins.readSelfResult();
    expect(bad.ins.snapshot().selfResult).toMatch(/^inst\.self\.failed .*1\.0\.2 ≠ 1\.0\.3/);
    const none = make();
    none.ins.readSelfResult();
    expect(none.ins.snapshot().selfResult).toBe("");
  });
  it("macOS bleibt beim Skript (kein Windows-Installer)", () => {
    const { ins, spawned } = make({ platform: "darwin" });
    expect(installWay("suite", "Link-Suite-macos-arm64.dmg", "darwin")).toBe("self-dmg");
    expect(ins.runPendingSelfUpdate()).toBe(false);
    expect(spawned).toEqual([]);
  });
});

describe("Installieren ohne frischen Stand ist nie stumm", () => {
  it("GitHub nicht erreichbar: Grund an der Karte statt nichts", async () => {
    const { ins, logs } = make({ offline: true });
    ins.loadCache({ at: Date.now() - 60_000, entries: { vd: { version: "0.3.0", tag: "v0.3.0", asset: "VD-Link-windows.exe", size: 1, sha256: "a".repeat(64) } } });
    await ins.install("vd");
    const e = ins.snapshot().entries.find(x => x.id === "vd")!;
    expect(e.phase).toBe("failed");
    expect(e.message).toBe("inst.err.noFresh");
    expect(logs.some(l => l.startsWith("install skipped vd"))).toBe(true);
    // zweiter Klick endet gleich → neuer Zähler, damit der Toast wieder erscheint
    const first = e.stamp ?? 0;
    await ins.install("vd");
    expect(ins.snapshot().entries.find(x => x.id === "vd")!.stamp).toBe(first + 1);
  });
});
