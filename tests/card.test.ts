// Windows-Test 1.0.1: „Cannot read properties of null (reading 'version')“ direkt nach „release check all“ beim Start mit
// Zwischenspeicher. Ursache: Während der Prüfung steht jede Quelle auf „checking“; die Karte zeigte den Pfeil
// „1.7.11 → 1.7.12“ (Update aus dem Speicher fällig), las die Zielversion aber nur bei „ok“ (null).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { updateTarget } from "../src/core/card";

describe("Zielversion eines Updates auf der Karte", () => {
  it("Update fällig: Zielversion, auch während die Prüfung läuft (Stand aus dem Speicher)", () => {
    // Eintrag wie während „release check all“: check = checking, latest aus dem Zwischenspeicher
    const during = { check: "checking", latest: { version: "1.7.12" }, cached: true };
    expect(updateTarget(during.latest, "1.7.11", false)).toBe("1.7.12");
  });
  it("kein Update, nichts installiert, nur vom Stick, kein Release → null (nie ein Absturz)", () => {
    expect(updateTarget({ version: "1.7.11" }, "1.7.11", false)).toBeNull();
    expect(updateTarget({ version: "1.7.12" }, null, false)).toBeNull();
    expect(updateTarget({ version: "1.7.12" }, "1.7.11", true)).toBeNull();
    expect(updateTarget(null, "1.7.11", false)).toBeNull();
    expect(updateTarget(undefined, undefined, false)).toBeNull();
  });
  it("die Karte liest die Zielversion nicht mehr aus einem nur bei „ok“ gesetzten Wert", () => {
    const src = fs.readFileSync(new URL("../src/renderer/programs.ts", import.meta.url), "utf8");
    expect(src).not.toContain("l!.version");
    expect(src).toContain("updateTarget(");
  });
});
