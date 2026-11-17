// 1.0.1 (Windows-Realtest 1.0.0 Befund 4): erstes Bild = Startfläche in der Fensterfarbe, kein leeres bzw. halbfertiges Bild.
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

describe("Erstes Bild beim Start", () => {
  it("die Startfläche (#intro) liegt ab dem Laden deckend da (nicht hidden)", () => {
    const m = /<div id="intro"[^>]*>/.exec(read("index.html"));
    expect(m).not.toBeNull();
    expect(m![0]).not.toMatch(/hidden/);
  });
  it("Fensterfarbe des Hauptprozesses = --bg der Oberfläche (Nacht und Tag)", () => {
    const main = read("src/main/main.ts");
    const css = read("src/renderer/launcher.css");
    const bg = /nativeTheme\.shouldUseDarkColors \? "(#[0-9A-F]{6})" : "(#[0-9A-F]{6})"/i.exec(main);
    expect(bg).not.toBeNull();
    const dark = /:root\{[^}]*?--bg:(#[0-9A-F]{6})/i.exec(css)![1];
    const light = /\[data-theme=light\]\{[^}]*?--bg:(#[0-9A-F]{6})/i.exec(css)![1];
    expect(bg![1]!.toUpperCase()).toBe(dark!.toUpperCase());
    expect(bg![2]!.toUpperCase()).toBe(light!.toUpperCase());
    // vor dem Skript (noch kein data-theme): Tag nach prefers-color-scheme in derselben Farbe
    expect(read("src/renderer/launcher-v2.css")).toContain(`@media (prefers-color-scheme:light){html:not([data-theme]) .intro-layer .ibg{`);
    expect(read("src/renderer/launcher-v2.css")).toContain(`${light}}}`);
  });
  it("Windows zeigt das Fenster sofort, sonst spätestens nach 1,5 s; Startzeiten stehen im Log", () => {
    const main = read("src/main/main.ts");
    expect(main).toContain(`if (process.platform === "win32" && !shotSpec) reveal("early");`);
    expect(main).toContain(`reveal("timeout 1.5s"), 1500`);
    expect(read("src/renderer/main.ts")).toContain(`api.mark("script")`);
  });
});
