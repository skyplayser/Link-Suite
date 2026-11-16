// suite.json und launcher.json lesen und schreiben (Format aus dem Konzept „Gemeinsame Einstellungen“).
import { describe, expect, it } from "vitest";
import { boundsVisible, parseBounds, parseInstalledCache, applySuitePatch, isoLocal, parseLauncherJson, parseSuiteJson, serializeLauncher, serializeSuite, SUITE_DEFAULTS } from "../src/core/settings";

describe("suite.json", () => {
  it("liest das Beispiel aus dem Konzept", () => {
    const f = parseSuiteJson('{"format":"link-suite-settings","v":1,"lang":"de","theme":"dark","chat":{"nick":"Max","where":"Booth","on":true},"intro":true,"updatedAt":"2026-11-15T17:30:00+01:00"}');
    expect(f.settings).toEqual({ lang: "de", theme: "dark", chat: { nick: "Max", where: "Booth", on: true }, intro: true });
    expect(f.readOnly).toBe(false);
    expect(f.extra).toEqual({});
  });
  it("fehlt, kaputt oder fremdes Format → Werte ab Werk", () => {
    expect(parseSuiteJson(null).settings).toEqual(SUITE_DEFAULTS);
    expect(parseSuiteJson("{kaputt").settings).toEqual(SUITE_DEFAULTS);
    expect(parseSuiteJson('{"format":"anders","lang":"en"}').settings.lang).toBe("system");
  });
  it("falsche Werte fallen auf ab Werk, Namen werden bereinigt und gekürzt", () => {
    const f = parseSuiteJson(JSON.stringify({ lang: "fr", theme: 3, intro: "ja", chat: { nick: "  Max\n" + "x".repeat(40), where: 5, on: "no" } }));
    expect(f.settings.lang).toBe("system");
    expect(f.settings.theme).toBe("dark");
    expect(f.settings.intro).toBe(true);
    expect(f.settings.chat.on).toBe(true);
    expect([...f.settings.chat.nick].length).toBeLessThanOrEqual(24);
    expect(f.settings.chat.where).toBe("");
  });
  it("unbekannte Felder bleiben beim Schreiben erhalten; neuere Hauptversion → nur lesen", () => {
    const f = parseSuiteJson(JSON.stringify({ format: "link-suite-settings", v: 1, lang: "en", future: { a: 1 }, chat: { nick: "A", color: "pink" } }));
    const text = serializeSuite(f.settings, f.extra, new Date(2026, 10, 15, 17, 30, 0));
    const back = JSON.parse(text);
    expect(back).toMatchObject({ format: "link-suite-settings", v: 1, lang: "en", future: { a: 1 }, chat: { nick: "A", color: "pink", where: "", on: true }, intro: true });
    expect(back.updatedAt).toMatch(/^2026-11-15T17:30:00[+-]\d\d:\d\d$/);
    expect(parseSuiteJson('{"format":"link-suite-settings","v":2}').readOnly).toBe(true);
  });
  it("Änderungen aus der Oberfläche werden geprüft", () => {
    const s = applySuitePatch(SUITE_DEFAULTS, { lang: "en", theme: "light", intro: false, chat: { nick: "Lena", where: "VJ", on: false }, evil: 1 });
    expect(s).toEqual({ lang: "en", theme: "light", intro: false, chat: { nick: "Lena", where: "VJ", on: false } });
    expect(applySuitePatch(s, { lang: "xx", theme: null, chat: "no" })).toEqual(s);
    expect(applySuitePatch(s, null)).toEqual(s);
    expect(SUITE_DEFAULTS.chat.nick).toBe(""); // Werte ab Werk unverändert
  });
  it("Zeit mit Zeitzone", () => {
    expect(isoLocal(new Date(2026, 0, 2, 3, 4, 5))).toMatch(/^2026-01-02T03:04:05[+-]\d\d:\d\d$/);
  });
});

describe("launcher.json", () => {
  it("liest Entwicklerordner (~ oder absolut), Startwege und Hintergrund; Fremdes fällt weg", () => {
    const s = parseLauncherJson(JSON.stringify({
      devDirs: { vj: "~/Code/VJ-Link", vd: "/Volumes/P/VD", lj: "relativ", evil: "/x", crew: "" },
      routes: { vd: "dev", vj: "hack", foo: "app" }, background: true,
    }));
    expect(s.devDirs).toEqual({ vj: "~/Code/VJ-Link", vd: "/Volumes/P/VD", crew: "" });
    expect(s.routes).toEqual({ vd: "dev" });
    expect(s.background).toBe(true);
    expect(parseLauncherJson("nix")).toEqual({ devDirs: {}, routes: {}, background: false, checkUpdates: true, notify: true, welcomed: false });
    expect(parseLauncherJson('{"checkUpdates":false}').checkUpdates).toBe(false);
  });
  it("hin und zurück", () => {
    const s = { devDirs: { vj: "~/VJ-Link" }, routes: { vd: "app" as const }, background: false, checkUpdates: true, notify: true, welcomed: true, window: { x: 10, y: 20, width: 1320, height: 880, zoomed: false } };
    expect(parseLauncherJson(serializeLauncher(s))).toEqual(s);
  });
});

describe("Fensterlage (macOS M2)", () => {
  it("prüft Zahlen und Grenzen", () => {
    expect(parseBounds({ x: 10, y: 20, width: 1320, height: 880 })).toEqual({ x: 10, y: 20, width: 1320, height: 880, zoomed: false });
    expect(parseBounds({ x: 10, y: 20, width: 100, height: 880 })).toBeNull();
    expect(parseBounds({ x: "1", y: 0, width: 1000, height: 800 })).toBeNull();
    expect(parseBounds(null)).toBeNull();
  });
  it("nur übernehmen, wenn ≥ 50 % auf einem Bildschirm liegen", () => {
    const areas = [{ x: 0, y: 25, width: 1512, height: 920 }];
    expect(boundsVisible({ x: 100, y: 100, width: 1320, height: 800 }, areas)).toBe(true);
    expect(boundsVisible({ x: 1200, y: 100, width: 1320, height: 800 }, areas)).toBe(false);
    expect(boundsVisible({ x: 3000, y: 100, width: 1320, height: 800 }, areas)).toBe(false);
  });
});

describe("Zwischenspeicher installierter Programme (QA Windows 0.3.1 R1)", () => {
  it("nimmt nur gültige Einträge", () => {
    const c = parseInstalledCache({ at: 5, apps: {
      lj: { path: "C:\\Program Files\\LJ Link\\LJ Link.exe", version: "1.7.11", bundleId: "" },
      vj: { path: "/Applications/VJ-Link.app", version: "0.1.8", bundleId: "de.nextphilm.vjlink", onVolume: false },
      evil: { path: "/x", version: "1", bundleId: "" },
      vd: { path: "relativ", version: "1", bundleId: "" },
    } })!;
    expect(Object.keys(c.apps).sort()).toEqual(["lj", "vj"]);
    expect(parseInstalledCache({ apps: {} })).toBeNull();
  });
});
