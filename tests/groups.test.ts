// 1.0.1 (Windows-Realtest 1.0.0 Befund 2): Gruppe nach der Installation – nach „Installiert“, nie unter dem Zeiger.
import { describe, expect, it } from "vitest";
import { CALM_MS, groupFor, mayRegroup, type RegroupInput } from "../src/core/groups";

describe("Gruppe je Programm", () => {
  it("installiert vor Entwicklung vor Verfügbar vor Kommt bald", () => {
    expect(groupFor({ app: true, dev: true, stickOnly: false, release: true })).toBe("installed");
    expect(groupFor({ app: false, dev: true, stickOnly: false, release: true })).toBe("dev");
    expect(groupFor({ app: false, dev: false, stickOnly: false, release: true })).toBe("avail");
    expect(groupFor({ app: false, dev: false, stickOnly: true, release: false })).toBe("avail");
    expect(groupFor({ app: false, dev: false, stickOnly: false, release: false })).toBe("soon");
  });
});

describe("Wann umsortiert wird", () => {
  const base: RegroupInput = { force: false, fresh: false, differs: true, hovering: false, menuOpen: false, focused: true, idleMs: 0 };
  it("von außen installiert, Zeiger nicht über dem Raster → sofort", () => {
    expect(mayRegroup(base)).toBe(true);
  });
  it("Zeiger über dem Raster im aktiven Fenster → nie (auch nach langer Ruhe)", () => {
    expect(mayRegroup({ ...base, hovering: true })).toBe(false);
    expect(mayRegroup({ ...base, hovering: true, idleMs: 60_000 })).toBe(false);
  });
  it("Fenster im Hintergrund (z. B. Installer vorn), Zeiger ruht über dem Raster → nach CALM_MS", () => {
    expect(mayRegroup({ ...base, hovering: true, focused: false, idleMs: CALM_MS - 1 })).toBe(false);
    expect(mayRegroup({ ...base, hovering: true, focused: false, idleMs: CALM_MS })).toBe(true);
  });
  it("offenes Menü blockiert; ohne Änderung nichts zu tun", () => {
    expect(mayRegroup({ ...base, menuOpen: true })).toBe(false);
    expect(mayRegroup({ ...base, differs: false })).toBe(false);
  });
  it("eigene Installation fertig (force) bzw. erster Suchlauf → sofort, auch unter dem Zeiger", () => {
    expect(mayRegroup({ ...base, force: true, hovering: true, menuOpen: true })).toBe(true);
    expect(mayRegroup({ ...base, fresh: true, hovering: true })).toBe(true);
  });
});
