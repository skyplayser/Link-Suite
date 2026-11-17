// 1.0.1 (Windows-Realtest 1.0.0 Befund 1): Ende des Installers erkennen, danach AKTUELL / ABGEBROCHEN / FEHLER,
// „Zurücksetzen“ während des Wartens, Ersatzweg ohne PowerShell. Ohne Windows: alle Systemteile sind Attrappen.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Installer, type InstallerDeps } from "../src/main/installer";
import { CANCEL_CODES, parseSetupOutput, SETUP_PS, setupImageName, setupVerdict, withShellDiag, type SetupExit } from "../src/core/winsetup";

describe("PowerShell-Ausgabe", () => {
  it("liest Start, Ende und Code", () => {
    expect(parseSetupOutput("LINKSUITE-STARTED:4711\r\nLINKSUITE-EXIT:0\r\n")).toEqual({ code: 0, error: "", pid: 4711 });
    expect(parseSetupOutput("LINKSUITE-STARTED:12\nLINKSUITE-EXIT:-1073741510\n").code).toBe(-1073741510);
  });
  it("UAC „Nein“ ohne Start = 1223, Öffnen-Fehler mit Text", () => {
    expect(parseSetupOutput("LINKSUITE-EXIT:1223\n")).toEqual({ code: 1223, error: "", pid: null });
    expect(parseSetupOutput("LINKSUITE-ERROR:Datei nicht gefunden\n")).toMatchObject({ code: null, error: "Datei nicht gefunden" });
  });
  it("gar keine eigene Zeile → Ersatzweg (nie „geschlossen“)", () => {
    expect(parseSetupOutput("")).toMatchObject({ noShell: true });
    expect(parseSetupOutput("irgendwas\nLINKSUITE-EXIT:abc\n")).toMatchObject({ noShell: true });
  });
  it("gestartet, aber kein Ende (z. B. Warten gesperrt) → weiter per tasklist, kein Öffnen-Fehler", () => {
    expect(parseSetupOutput("LINKSUITE-STARTED:9\nLINKSUITE-ERROR:Method invocation is supported only on core types\n")).toEqual({ code: null, error: "", pid: 9, follow: true });
    expect(parseSetupOutput("LINKSUITE-STARTED:9\nLINKSUITE-EXIT:\n")).toMatchObject({ follow: true });
  });
  it("Skript: eine Zeile, Pfad nur aus der Umgebung, kein -Wait, ShellExecute über Start-Process", () => {
    expect(SETUP_PS).not.toMatch(/\n/);
    expect(SETUP_PS).toContain("Start-Process -FilePath $env:LINKSUITE_SETUP -PassThru");
    expect(SETUP_PS).not.toMatch(/-Wait\b/);
    expect(SETUP_PS).not.toMatch(/-Verb/);
    expect(SETUP_PS).not.toContain('"');
  });
  it("PowerShell-Helfer: ohne detached (sonst leere Ausgabe), verborgene Konsole, stdout und stderr als Pipe", () => {
    const src = fs.readFileSync(new URL("../src/main/apps.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export function runSetup"));
    expect(fn).not.toMatch(/detached/);
    expect(fn).toContain(`windowsHide: true, stdio: ["ignore", "pipe", "pipe"]`);
    expect(fn).toContain("withShellDiag(");
  });
  it("Diagnose fürs Log: Exit-Code bzw. Signal und stderr (gekürzt, eine Zeile)", () => {
    const r = withShellDiag(parseSetupOutput(""), 1, null, "Start-Process : Zugriff verweigert\r\n  + CategoryInfo ...\r\n");
    expect(r.noShell).toBe(true);
    expect(r.diag).toBe("powershell exit 1 stderr: Start-Process : Zugriff verweigert + CategoryInfo ...");
    expect(withShellDiag(parseSetupOutput(""), null, "SIGTERM", "").diag).toBe("powershell signal SIGTERM");
    expect(withShellDiag(parseSetupOutput(""), 0, null, "x".repeat(1000)).diag!.length).toBeLessThan(340);
  });
  it("Urteil", () => {
    const x = (code: number | null, error = ""): SetupExit => ({ code, error, pid: 1 });
    expect(setupVerdict(x(5), true)).toBe("done");
    expect(setupVerdict(x(0), false)).toBe("cancelled");
    expect(setupVerdict(x(1), false)).toBe("cancelled");
    expect(setupVerdict(x(1602), false)).toBe("cancelled");
    expect(setupVerdict(x(null), false)).toBe("cancelled");
    expect(setupVerdict(x(2), false)).toBe("failed");
    expect(setupVerdict(x(null, "kaputt"), false)).toBe("failed");
    expect(CANCEL_CODES.has(1223)).toBe(true);
  });
  it("Prozessname nur für einfache .exe-Namen", () => {
    expect(setupImageName("C:\\Users\\a\\AppData\\Roaming\\Link-Suite\\downloads\\link-suite-dl-x\\VD-Link-windows.exe")).toBe("VD-Link-windows.exe");
    expect(setupImageName("/tmp/a.msi")).toBeNull();
    expect(setupImageName("C:\\x\\a\"b.exe")).toBeNull();
  });
});

type Ctl = { resolve(r: SetupExit): void; reject(e: Error): void };
function harness(o: { installed?: (n: number) => string | null; run?: "pending" | "none"; image?: (n: number) => boolean; maxWaitMs?: number } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-win-"));
  const calls = { run: [] as string[], open: [] as string[], reg: 0, img: 0, log: [] as string[] };
  let ctl: Ctl | null = null;
  const phases: string[] = [];
  const deps: InstallerDeps = {
    version: "1.0.1", dataDir: dir, installedPath: () => null, isRunning: async () => false, askQuit: async () => false,
    pickLjlTarget: async () => null, onChange() { const e = ins.snapshot().entries.find(x => x.id === "vd")!; if (phases.at(-1) !== e.phase) phases.push(e.phase); },
    say: (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k), log: (e, d) => { calls.log.push(`${e} ${d ?? ""}`); },
    platform: "win32", pollMs: 5, maxWaitMs: o.maxWaitMs ?? 5000,
    installedVersion: async () => (o.installed ? o.installed(calls.reg++) : (calls.reg++, null)),
    openFile: async f => { calls.open.push(f); return ""; },
    imageRunning: o.image ? async () => o.image!(calls.img++) : undefined,
    runInstaller: o.run === "none" ? undefined : f => { calls.run.push(f); return new Promise<SetupExit>((resolve, reject) => { ctl = { resolve, reject }; }); },
  };
  const ins = new Installer(deps);
  const file = "C:\\dl\\VD-Link-windows.exe";
  const go = (signal = new AbortController().signal) => ins.awaitWindowsSetup("vd", file, "0.3.0", signal);
  return { ins, calls, go, file, phases, ctl: () => ctl!, tick: (ms = 30) => new Promise(r => setTimeout(r, ms)) };
}

describe("Windows-Installer beobachten (1.0.1)", () => {
  it("Installer ohne Installation geschlossen → ABGEBROCHEN, nicht mehr „Installer geöffnet …“", async () => {
    const h = harness();
    const p = h.go();
    await h.tick();
    expect(h.calls.run).toEqual([h.file]);
    expect(h.ins.snapshot().entries.find(e => e.id === "vd")!.phase).toBe("waiting");
    h.ctl().resolve({ code: 1, error: "", pid: 7 });
    const r = await p;
    expect(r.phase).toBe("cancelled");
    expect(r.message).toContain("inst.win.closed");
    expect(h.calls.log.some(l => l.startsWith("installer ended vd: code 1"))).toBe(true);
  });
  it("Registry-Eintrag kommt erst kurz nach dem Ende → AKTUELL", async () => {
    let ended = false;
    const h = harness({ installed: () => (ended ? "0.3.0" : null) });
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: 0, error: "", pid: 7 });
    setTimeout(() => { ended = true; }, 2); // Eintrag erscheint erst kurz nach dem Ende
    expect(await p).toMatchObject({ phase: "done" });
  });
  it("installiert, während der Installer noch offen ist (z. B. Seite „Fertig“) → AKTUELL ohne aufs Ende zu warten", async () => {
    const h = harness({ installed: n => (n >= 3 ? "0.3.0" : null) });
    const r = await h.go();
    expect(r.phase).toBe("done");
    expect(r.message).toContain("inst.done");
  });
  it("ältere Version in der Registry zählt nicht", async () => {
    const h = harness({ installed: () => "0.2.0" });
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: 0, error: "", pid: 7 });
    expect((await p).phase).toBe("cancelled");
  });
  it("Fehlercode → FEHLER mit Code", async () => {
    const h = harness();
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: 2, error: "", pid: 7 });
    const r = await p;
    expect(r.phase).toBe("failed");
    expect(r.message).toContain("inst.win.failed");
    expect(r.message).toContain('"code":"2"');
  });
  it("UAC mit „Nein“ (1223) → ABGEBROCHEN; Öffnen-Fehler → FEHLER", async () => {
    const a = harness();
    const pa = a.go();
    await a.tick();
    a.ctl().resolve({ code: 1223, error: "", pid: null });
    expect((await pa).phase).toBe("cancelled");
    const b = harness();
    const pb = b.go();
    await b.tick();
    b.ctl().resolve({ code: null, error: "Zugriff verweigert", pid: null });
    const r = await pb;
    expect(r.phase).toBe("failed");
    expect(r.message).toContain("inst.err.winOpen");
  });
  it("„Zurücksetzen“ während des Wartens: sofort zurück, fremder Installer wird nicht angefasst", async () => {
    const h = harness();
    const ac = new AbortController();
    const p = h.go(ac.signal);
    await h.tick();
    ac.abort();
    const r = await p;
    expect(r.phase).toBe("cancelled");
    expect(r.message).toContain("inst.win.reset");
  });
  it("Neustart unter demselben Namen (z. B. mit Rechten): weiter warten, bis auch dieser endet", async () => {
    let gone = false;
    const h = harness({ image: () => !gone });
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: 0, error: "", pid: 7 });
    await h.tick(60);
    expect(h.ins.snapshot().entries.find(e => e.id === "vd")!.phase).toBe("waiting"); // noch nicht entschieden
    gone = true;
    expect((await p).phase).toBe("cancelled");
  });
  it("ohne PowerShell: Ersatzweg ShellExecute + tasklist (erst gesehen, dann weg)", async () => {
    const h = harness({ image: n => n >= 2 && n < 5 });
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: null, error: "spawn ENOENT", pid: null, noShell: true });
    const r = await p;
    expect(h.calls.open).toEqual([h.file]);
    expect(r.phase).toBe("cancelled");
    expect(r.message).toContain("inst.win.closed");
  });
  it("leere Ausgabe, aber der Installer läuft schon: nicht ein zweites Mal öffnen, per tasklist weiter", async () => {
    const h = harness({ image: n => n < 3 });
    const p = h.go();
    await h.tick();
    h.ctl().resolve({ code: null, error: "", pid: null, noShell: true, diag: "powershell exit 0" });
    const r = await p;
    expect(h.calls.open).toEqual([]);
    expect(r.phase).toBe("cancelled");
    expect(h.calls.log.some(l => l.includes("installer powershell missing") && l.includes("powershell exit 0"))).toBe(true);
  });
  it("ohne runInstaller direkt der Ersatzweg; nie gesehen = weiter warten bis zur Höchstzeit", async () => {
    const h = harness({ run: "none", image: () => false, maxWaitMs: 80 });
    const r = await h.go();
    expect(h.calls.open).toEqual([h.file]);
    expect(r.phase).toBe("cancelled");
    expect(r.message).toBe("inst.winTimeout");
  });
  it("nur unter Windows", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-win-"));
    const ins = new Installer({ version: "1", dataDir: dir, installedPath: () => null, isRunning: async () => false, askQuit: async () => false, pickLjlTarget: async () => null, onChange() {}, say: k => k, platform: "darwin" });
    await expect(ins.awaitWindowsSetup("vd", "x.exe", "1", new AbortController().signal)).rejects.toThrow(/Windows only/);
  });
});
