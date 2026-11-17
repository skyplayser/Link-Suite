// Windows-Nachtest 1.0.1: Nach einem Neustart blieben in downloads VD (125 MB) und LJ (69 MB) liegen, weil die LJ-Datei
// an einer offenen UAC-Abfrage hing und das Aufräumen am ersten Fehler abbrach. Jetzt Eintrag für Eintrag.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanDir, Installer } from "../src/main/installer";

function downloads() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-clean-"));
  const dl = path.join(data, "downloads");
  for (const [d, f] of [["link-suite-dl-aaa", "VD-Link-windows.exe"], ["link-suite-dl-bbb", "LJ-Link-windows.exe"], ["link-suite-dl-ccc", "VJ-Link-windows.exe"]]) {
    fs.mkdirSync(path.join(dl, d!), { recursive: true });
    fs.writeFileSync(path.join(dl, d!, f!), "x".repeat(1000));
  }
  return { data, dl };
}
// Attrappe für eine gesperrte Datei (unter Windows EBUSY/EPERM): alles mit „LJ-Link“ lässt sich nicht löschen
const lockedLj = (p: string) => {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).some(n => n.includes("LJ-Link"))) throw Object.assign(new Error("busy"), { code: "EBUSY" });
  if (p.includes("LJ-Link")) throw Object.assign(new Error("busy"), { code: "EBUSY" });
  fs.rmSync(p, { recursive: true, force: true });
};

describe("Download-Ordner aufräumen (1.0.1)", () => {
  it("eine gesperrte Datei hält die anderen Reste nicht auf; sie wird übersprungen und gemeldet", () => {
    const { dl } = downloads();
    const skipped: string[] = [];
    const left = cleanDir(dl, (f, why) => skipped.push(`${path.basename(f)} ${why}`), false, lockedLj);
    expect(fs.readdirSync(dl)).toEqual(["link-suite-dl-bbb"]);
    expect(left).toEqual([path.join(dl, "link-suite-dl-bbb")]);
    expect(skipped).toEqual(["LJ-Link-windows.exe EBUSY"]);
  });
  it("später erneut: ist die Sperre weg, verschwindet auch der Rest", () => {
    const { dl } = downloads();
    const left = cleanDir(dl, () => {}, false, lockedLj);
    for (const f of left) cleanDir(f, () => {}, true);
    expect(fs.readdirSync(dl)).toEqual([]);
  });
  it("ohne Sperre und ohne Ordner: kein Fehler", () => {
    const { dl } = downloads();
    expect(cleanDir(dl, () => {})).toEqual([]);
    expect(fs.readdirSync(dl)).toEqual([]);
    expect(cleanDir(path.join(dl, "gibt-es-nicht"), () => {})).toEqual([]);
  });
  it("Installer.cleanupSync löscht den Inhalt von downloads und meldet Reste ins Log", () => {
    const { data, dl } = downloads();
    const logs: string[] = [];
    const ins = new Installer({ version: "1.0.1", dataDir: data, installedPath: () => null, isRunning: async () => false, askQuit: async () => false, pickLjlTarget: async () => null, onChange() {}, say: k => k, log: (e, d) => logs.push(`${e} ${d}`) });
    expect(ins.cleanupSync()).toEqual([]);
    expect(fs.readdirSync(dl)).toEqual([]);
    expect(logs).toEqual([]);
  });
});
