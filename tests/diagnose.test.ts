// Suite-Diagnose v1 (design/diagnose/SPEC.md): Datei prüfen, Text für den Assistenten, Fehler aus main.log.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDiagnose, logErrors, parseDiagnose, scrubDiag } from "../src/core/diagnose";
// Vorlage außerhalb von src (wird in die Programme kopiert)
import { startDiagnose } from "../design/diagnose/diagnose-writer";

const ok = { suite: "diagnose", v: 1, id: "vj", app: "VJ-Link", version: "0.1.18", at: "2026-11-28T14:03:12Z", running: true, os: "macOS 15.1", arch: "arm64",
  summary: { "Ausgänge": "2", "Art-Net": "Universe 1–4" }, checks: [{ name: "Beamer", ok: false, detail: "kein Bild" }], errors: [{ at: "2026-11-28T14:01:55Z", text: "WebGL\ncontext lost" }] };

describe("Suite-Diagnose lesen", () => {
  it("gültige Datei → Text", () => {
    const d = parseDiagnose(JSON.stringify(ok), "vj")!;
    expect(d.summary).toEqual([["Ausgänge", "2"], ["Art-Net", "Universe 1–4"]]);
    expect(d.errors[0]!.text).toBe("WebGL context lost");
    const txt = formatDiagnose(d, "de");
    expect(txt.split("\n")[0]).toMatch(/^Diagnose VJ-Link 0\.1\.18 – Stand 2026-11-28 \d\d:\d\d, läuft, macOS 15\.1 arm64$/);
    expect(txt).toContain("- FEHLER Beamer – kein Bild");
    expect(txt).toContain("Letzte Fehler:");
  });
  it("verwirft Fremdes", () => {
    expect(parseDiagnose(JSON.stringify({ ...ok, id: "lj" }), "vj")).toBeNull();
    expect(parseDiagnose(JSON.stringify({ ...ok, v: 2 }), "vj")).toBeNull();
    expect(parseDiagnose(JSON.stringify({ ...ok, at: "gestern" }), "vj")).toBeNull();
    expect(parseDiagnose("x".repeat(17000), "vj")).toBeNull();
    expect(parseDiagnose("{kaputt", "vj")).toBeNull();
  });
  it("zweite Schranke: was nie mitgehen darf, wird ersetzt (Rechtsprüfung A2)", () => {
    const t = scrubDiag([
      "C:\\Users\\PHILIP~1\\AppData\\Local\\Temp\\x.log",
      "file:///Users/Max%20M/Shows/a.mp4",
      "/Users/max/Library/x", "/Volumes/Kunde X/Videos", "\\\\nas\\shows\\a",
      "max@example.com", "aa:bb:cc:dd:ee:ff", "fe80:0:0:0:1:2:3:4", "93.184.216.34", "2.0.0.1", "192.168.1.20",
      "studio-mac.local", "token abcdefghijklmnopqrstuvwxyz0123456789",
    ].join("\n"));
    expect(t).not.toMatch(/PHILIP|Max%20M|\/Users\/max|Kunde X|nas\\shows|max@example|aa:bb|fe80|93\.184|studio-mac|abcdefghijklmnop/);
    expect(t).toContain("2.0.0.1");
    expect(t).toContain("192.168.1.20");
    expect(t).toContain("<IP>");
  });
  it("Fehlerzeilen aus main.log", () => {
    const log = "2026-11-28T10:00:00.000Z start Link-Suite\n2026-11-28T10:00:01.000Z release check done lj=ok\n2026-11-28T10:00:02.000Z help fetch failed ENOTFOUND\n2026-11-28T10:00:03.000Z uncaughtException TypeError: x ⏎ at f (/Users/max/a.js:1) ⏎ at g\n";
    expect(logErrors(log)).toEqual([{ at: "2026-11-28T10:00:02.000Z", text: "help fetch failed ENOTFOUND" }, { at: "2026-11-28T10:00:03.000Z", text: "uncaughtException TypeError: x" }]);
  });
  it("Vorlage für die Programme schreibt eine Datei, die der Launcher liest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-diag-"));
    const w = startDiagnose({ id: "vj", app: "VJ-Link", version: "0.1.18", dir });
    w.report({ summary: { "Pfad": path.join(os.homedir(), "Shows", "x") }, checks: [{ name: "Art-Net", ok: true }] });
    w.error("kaputt");
    w.stop();
    const text = fs.readFileSync(path.join(dir, "diagnose", "vj.json"), "utf8");
    const d = parseDiagnose(text, "vj")!;
    expect(d.running).toBe(false);
    expect(d.summary[0]![1]).toBe(path.join("~", "Shows", "x"));
    expect(text).not.toContain(os.homedir());
    expect(d.errors.map(e => e.text)).toEqual(["kaputt"]);
  });
});
