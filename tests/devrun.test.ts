// Entwicklerstarts mit Fixture-Programmen im Temp: Log getrennt nach stdout/stderr, Stoppen über die Prozessgruppe,
// nach 5 s SIGKILL. Startet nie echte Projekte.
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanEnv } from "../src/core/env";
import { translate } from "../src/core/i18n";
import type { LogLine } from "../src/core/ringlog";
import { DevRunner, devEnv, nodeProbe } from "../src/main/devrun";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-run-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function script(name: string, body: string): string {
  const f = path.join(root, name);
  fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return f;
}

function runner() {
  const lines: LogLine[] = [];
  let changes = 0;
  const r = new DevRunner((_id, l) => lines.push(...l), () => changes++, (k, v) => translate("de", k, v));
  return { r, lines, changes: () => changes };
}

describe.skipIf(process.platform === "win32")("Entwicklerstarts", () => {
  it("Log getrennt, Exit 0 → exited; Umgebung ohne ELECTRON_*", async () => {
    const bin = script("ok.sh", 'echo "hallo $1"; echo "fehler" 1>&2; echo "run_as_node=${ELECTRON_RUN_AS_NODE:-leer}"; exit 0');
    const { r, lines } = runner();
    const env = cleanEnv({ ...process.env, ELECTRON_RUN_AS_NODE: "1" });
    expect((await r.start("crew", { mode: "direct", bin, args: [root], cmd: "electron .", dir: root, env })).ok).toBe(true);
    await sleep(1200);
    expect(r.info("crew")!.state).toBe("exited");
    expect(r.info("crew")!.code).toBe(0);
    const text = lines.map(l => `${l.s}:${l.t}`);
    expect(text[0]).toMatch(/^sys:.*Start in .*electron \.$/);
    expect(text).toContain(`out:hallo ${root}`);
    expect(text).toContain("err:fehler");
    expect(text).toContain("out:run_as_node=leer");
    expect(text.at(-1)).toMatch(/^exit-ok:.*Exit-Code 0/);
  });

  // Zeitabhängig (echte Prozesse, Signale): unter Last durch parallele Builds anderer Sitzungen gelegentlich zu früh/zu spät.
  // Bis zur Umstellung auf eine Uhr-Attrappe: bis zu zwei Wiederholungen (1.0.8).
  it("Exit ≠ 0 → failed mit letzter Zeile", { retry: 2 }, async () => {
    const bin = script("fail.sh", 'echo "Cannot find module electron" 1>&2; exit 3');
    const { r } = runner();
    await r.start("vj", { mode: "direct", bin, args: [], cmd: "electron .", dir: root, env: cleanEnv(process.env) });
    await sleep(1000);
    expect(r.info("vj")).toMatchObject({ state: "failed", code: 3, lastLine: "Cannot find module electron" });
  });

  it("Stoppen: SIGTERM an die Gruppe beendet auch Kinder", async () => {
    const child = script("child.sh", "sleep 30");
    const bin = script("long.sh", `"${child}" & echo "läuft"; trap 'echo "TERM"; exit 0' TERM; while true; do sleep 0.2; done`);
    const { r, lines } = runner();
    await r.start("vd", { mode: "direct", bin, args: [], cmd: "npm run dev", dir: root, env: cleanEnv(process.env) });
    await sleep(500);
    const pid = r.info("vd")!.pid;
    expect(r.running.map(x => x.id)).toEqual(["vd"]);
    await r.stop("vd");
    await sleep(300);
    expect(r.info("vd")!.state).toBe("stopped");
    expect(() => process.kill(-pid, 0)).toThrow(); // ganze Gruppe weg (auch sleep 30)
    expect(lines.some(l => l.s === "sys" && l.t.includes(`SIGTERM an Prozessgruppe ${pid}`))).toBe(true);
    expect(lines.at(-1)!.s).toBe("exit-stop");
  });

  // Zeitabhängig (echte Prozesse, Signale): unter Last durch parallele Builds anderer Sitzungen gelegentlich zu früh/zu spät.
  // Bis zur Umstellung auf eine Uhr-Attrappe: bis zu zwei Wiederholungen (1.0.8).
  it("wer SIGTERM ignoriert, bekommt nach 5 s SIGKILL", { timeout: 15_000, retry: 2 }, async () => {
    // Node ignoriert SIGTERM zuverlässig (eine Shell mit `trap '' TERM` beendet sich unter neueren macOS-Versionen trotzdem,
    // dann lief der Stopp ohne SIGKILL durch und der Test schlug zufällig fehl)
    const bin = script("stubborn.sh", `exec "${process.execPath}" -e "process.on('SIGTERM',()=>{});console.log('stur');setInterval(()=>{},200)"`);
    const { r, lines } = runner();
    await r.start("pl", { mode: "direct", bin, args: [], cmd: "electron .", dir: root, env: cleanEnv(process.env) });
    await sleep(300);
    const t0 = Date.now();
    await r.stop("pl");
    await sleep(800);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(5000);
    expect(r.info("pl")!.state).toBe("stopped");
    expect(lines.some(l => l.t.includes("SIGKILL"))).toBe(true);
  });

  it("zweiter Start, während es läuft, wird abgelehnt", async () => {
    const bin = script("wait.sh", "sleep 5");
    const { r } = runner();
    await r.start("db", { mode: "direct", bin, args: [], cmd: "electron .", dir: root, env: cleanEnv(process.env) });
    expect(await r.start("db", { mode: "direct", bin, args: [], cmd: "electron .", dir: root, env: cleanEnv(process.env) })).toEqual({ ok: false, error: "running" });
    await r.stopAll();
    expect(r.running).toEqual([]);
    expect(r.logText("db", "dB Link")).toContain("# dB Link");
  });

  it("Skript-Weg: npm run dev über PATH aus der Login-Shell (nur im Temp-Projekt)", async () => {
    const probe = await nodeProbe();
    if (!probe) return; // ohne Node auf diesem Rechner nichts zu prüfen
    const dir = path.join(root, "proj");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "vd-link", scripts: { dev: "node -e \"console.log('dev läuft'); console.error('warnung')\"" } }));
    const { r, lines } = runner();
    await r.start("vd", { mode: "script", bin: probe.npm, args: ["run", "dev"], cmd: "npm run dev", dir, env: devEnv(probe) });
    await sleep(4000);
    expect(r.info("vd")!.state).toBe("exited");
    expect(lines.some(l => l.s === "out" && l.t === "dev läuft")).toBe(true);
    expect(lines.some(l => l.s === "err" && l.t === "warnung")).toBe(true);
  }, 20_000);
});
