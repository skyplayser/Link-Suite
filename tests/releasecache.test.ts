// 1.0.1 (Windows-Realtest 1.0.0 Befund 3): Release-Zwischenspeicher mit Katalog-Version; Programme, die er nicht kennt
// (VD-Link nach dem Update auf 1.0.0), prüft der Start sofort – nur diese, ohne „Alle prüfen“.
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Installer } from "../src/main/installer";
import { CATALOG_VERSION, staleSources } from "../src/core/sources";

const rel = (v: string) => ({ version: v, tag: `v${v}`, asset: "x.exe", url: null, size: 1, sha256: null, page: "", notes: "", prerelease: false });
// Speicher aus 0.3.2: kannte VD-Link nicht, keine Katalog-Version
const OLD = { at: Date.now() - 600_000, entries: { lj: rel("1.7.11"), vj: rel("0.1.8"), ljl: rel("1.0.0"), suite: rel("0.3.2") } };

function make(saved: Record<string, unknown>[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-rc-"));
  return new Installer({
    version: "1.0.1", dataDir: dir, installedPath: () => null, isRunning: async () => false, askQuit: async () => false,
    pickLjlTarget: async () => null, onChange() {}, say: k => k, platform: "win32", saveCache: c => { saved.push(c); },
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Katalog-Version im Zwischenspeicher", () => {
  it("alter Speicher ohne Version: nur die fehlenden Programme sind neu", () => {
    expect(staleSources(OLD)).toEqual(["vd", "crew"]);
  });
  it("gleiche Version: `checked` zählt (auch „noch nicht veröffentlicht“), andere Version: alles neu", () => {
    expect(staleSources({ catalog: CATALOG_VERSION, checked: ["lj", "vj", "vd", "ljl", "crew", "suite"], entries: {} })).toEqual([]);
    expect(staleSources({ catalog: CATALOG_VERSION, checked: ["lj", "vj", "ljl", "crew", "suite"], entries: { vd: rel("0.3.0") } })).toEqual(["vd"]);
    expect(staleSources({ catalog: CATALOG_VERSION + 1, checked: ["lj", "vj", "vd", "ljl", "crew", "suite"], entries: {} }).length).toBe(6);
    expect(staleSources(undefined)).toEqual([]);
  });
  it("Start mit altem Speicher: VD-Link sofort und zuerst geprüft; danach Speicher mit Version und `checked`", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return new Response("", { status: 404 }); }));
    const saved: Record<string, unknown>[] = [];
    const ins = make(saved);
    ins.loadCache(OLD);
    expect(ins.staleIds()).toEqual(["vd", "crew"]);
    // Bekannte Programme bleiben aus dem Speicher sichtbar
    expect(ins.snapshot().entries.find(e => e.id === "lj")).toMatchObject({ check: "ok", cached: true });
    await ins.check(false); // Start: der Speicher zählt nie als frische Prüfung
    expect(urls[0]).toBe("https://api.github.com/repos/skyplayser/VD-Link/releases/latest");
    expect(ins.staleIds()).toEqual([]);
    const c = saved.at(-1)!;
    expect(c.catalog).toBe(CATALOG_VERSION);
    expect([...(c.checked as string[])].sort()).toEqual(["crew", "lj", "ljl", "suite", "vd", "vj"]);
    // nächster Start mit diesem Speicher: nichts mehr neu
    expect(staleSources(c as never)).toEqual([]);
  });
  it("innerhalb der Stunde: nur die noch unbekannten Programme nachprüfen, bekannte bleiben im Speicher", async () => {
    const urls: string[] = [];
    let vdDown = true;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      if (String(u).includes("/VD-Link/") && vdDown) throw new Error("timeout");
      return new Response("", { status: 404 });
    }));
    const saved: Record<string, unknown>[] = [];
    const ins = make(saved);
    ins.loadCache({ ...OLD, entries: { ...OLD.entries } });
    await ins.check(false);
    expect(ins.staleIds()).toEqual(["vd"]);
    urls.length = 0; vdDown = false;
    await ins.check(false);
    expect(urls).toEqual(["https://api.github.com/repos/skyplayser/VD-Link/releases/latest"]);
    expect(ins.staleIds()).toEqual([]);
    await ins.check(false); // jetzt nichts mehr fällig
    expect(urls.length).toBe(1);
  });
  it("„Alle prüfen“ fragt alle, neue zuerst", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return new Response("", { status: 404 }); }));
    const ins = make([]);
    ins.loadCache(OLD);
    await ins.check(true);
    expect(urls.length).toBe(6);
    expect(urls[0]).toContain("/VD-Link/");
  });
  it("Prüfung scheitert (kein Netz): VD-Link bleibt neu und wird beim nächsten Mal wieder zuerst geprüft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const saved: Record<string, unknown>[] = [];
    const ins = make(saved);
    ins.loadCache(OLD);
    await ins.check(false);
    expect(ins.staleIds()).toEqual(["vd", "crew"]);
    expect(saved.length).toBe(0);
  });
  it("Crew Link (nur Vorabversionen): fragt die Release-Liste und nimmt das neueste, das kein Entwurf ist", async () => {
    const urls: string[] = [];
    const asset = (n: string) => ({ name: n, browser_download_url: `https://github.com/skyplayser/Crew-Link/releases/download/v0.1.0/${n}`, size: 100, digest: "sha256:" + "a".repeat(64) });
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      if (String(u).includes("/Crew-Link/")) return new Response(JSON.stringify([
        { tag_name: "v0.2.0", draft: true, prerelease: true, assets: [] },
        { tag_name: "v0.1.0", draft: false, prerelease: true, html_url: "https://github.com/skyplayser/Crew-Link/releases/tag/v0.1.0", assets: [asset("Crew-Link-windows.exe"), asset("SHA256SUMS")] },
      ]), { status: 200 });
      return new Response("", { status: 404 });
    }));
    const ins = make([]);
    await ins.check(true);
    expect(urls).toContain("https://api.github.com/repos/skyplayser/Crew-Link/releases?per_page=10");
    expect(urls.some(u => u.includes("/Crew-Link/releases/latest"))).toBe(false);
    const e = ins.snapshot().entries.find(x => x.id === "crew")!;
    expect(e.latest).toMatchObject({ version: "0.1.0", asset: "Crew-Link-windows.exe", prerelease: true });
    expect(e.latest!.url).toContain("/Crew-Link/releases/download/v0.1.0/Crew-Link-windows.exe");
  });
  it("Crew Link ohne Release (leere Liste): „noch keine Veröffentlichung“", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(String(u).includes("/Crew-Link/") ? "[]" : "", { status: String(u).includes("/Crew-Link/") ? 200 : 404 })));
    const ins = make([]);
    await ins.check(true);
    expect(ins.snapshot().entries.find(x => x.id === "crew")).toMatchObject({ check: "missing", latest: null });
  });
});
