// 1.0.6: Die Brücke (preload.ts) kannte Crew Link nicht – „Installieren“ blieb stumm. Die erlaubten Kennungen kommen
// jetzt aus Katalog und Quellen; dieser Test sorgt dafür, dass das so bleibt (auch für PL Link, NET Link, dB Link).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { CATALOG } from "../src/core/catalog";
import { SOURCES } from "../src/core/sources";
import { progArg, srcArg } from "../src/main/ipc-args";

describe("Kennungen über die Brücke", () => {
  it("jede Release-Quelle kommt durch (auch crew)", () => {
    for (const id of Object.keys(SOURCES)) expect(srcArg(id)).toBe(id);
    expect(srcArg("crew")).toBe("crew");
  });
  it("jedes Programm des Katalogs kommt durch", () => {
    for (const p of CATALOG) expect(progArg(p.id)).toBe(p.id);
  });
  it("Fremdes wird leer", () => {
    for (const v of ["", "x", "../etc", "LJ", 3, null, undefined, {}, "__proto__", "constructor"]) {
      expect(progArg(v)).toBe("");
      expect(srcArg(v)).toBe("");
    }
  });
  it("preload.ts pflegt keine eigene Liste mehr", () => {
    const src = fs.readFileSync(new URL("../src/main/preload.ts", import.meta.url), "utf8");
    expect(src).toContain('from "./ipc-args"');
    expect(src).not.toMatch(/new Set\(\s*\[/);
  });
});
