// Startbarkeit von Entwicklerprojekten mit Fixture-Ordnern im Temp (nie die echten Projektordner).
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assessDevProject, firstMissing, insideRel, looksLikeAppBinary, realInside } from "../src/core/devproject";

// realpath: unter macOS ist /var ein Symlink auf /private/var
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "linksuite-dev-")));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function write(rel: string, text = "", mtime?: number): string {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (mtime) fs.utimesSync(f, mtime / 1000, mtime / 1000);
  return f;
}
const pkg = (dir: string, o: Record<string, unknown>) => write(`${dir}/package.json`, JSON.stringify(o));
const electron = (dir: string, pathTxt = "Electron.app/Contents/MacOS/Electron") => {
  write(`${dir}/node_modules/electron/package.json`, "{}");
  write(`${dir}/node_modules/electron/path.txt`, pathTxt);
  write(`${dir}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, "#!/bin/sh\n");
};
const at = (dir: string) => path.join(root, dir);

describe("Entwicklerprojekt: startbar?", () => {
  it("Ordner fehlt", () => {
    const a = assessDevProject(at("fehlt"), "net-link");
    expect(a.status).toBe("no-folder");
    expect(a.need).toEqual([{ key: "folder", have: false }]);
    expect(firstMissing(a)).toBe("folder");
  });

  it("nur docs/ → kein package.json (NET Link heute)", () => {
    write("net/docs/KONZEPT.md", "#");
    const a = assessDevProject(at("net"), "net-link");
    expect(a.status).toBe("no-package");
    expect(firstMissing(a)).toBe("package");
  });

  it("kaputtes package.json zählt als fehlend", () => {
    write("broken/package.json", "{nicht json");
    expect(assessDevProject(at("broken"), "x").status).toBe("no-package");
  });

  it("anderes Projekt im Ordner → not-suite", () => {
    pkg("other", { name: "something-else", scripts: { dev: "x" } });
    const a = assessDevProject(at("other"), "vj-link");
    expect(a.status).toBe("not-suite");
    expect(firstMissing(a)).toBe("suite");
  });

  it("ohne Skript dev/start und ohne main", () => {
    pkg("db", { name: "db-link", version: "0.1.0", scripts: { test: "vitest" } });
    expect(assessDevProject(at("db"), "db-link").status).toBe("no-script");
  });

  it("node_modules fehlt → Hinweis npm install (Launcher führt es nicht aus)", () => {
    pkg("crew", { name: "crew-link", version: "0.1.0", main: "dist/main/main.js", scripts: { dev: "node dev.mjs" } });
    const a = assessDevProject(at("crew"), "crew-link");
    expect(a.status).toBe("no-modules");
    expect(a.script).toBe("dev");
    expect(a.scriptCmd).toBe("npm run dev");
    expect(a.version).toBe("0.1.0");
  });

  it("Electron fehlt (path.txt oder Programm) → no-electron, nichts nachladen", () => {
    pkg("noel", { name: "pl-link", main: "main.js", scripts: { start: "electron ." } });
    write("noel/node_modules/.keep");
    expect(assessDevProject(at("noel"), "pl-link").status).toBe("no-electron");
    pkg("evil", { name: "pl-link", main: "main.js", scripts: { start: "electron ." } });
    electron("evil", "../../../../../bin/sh");
    expect(assessDevProject(at("evil"), "pl-link").status).toBe("no-electron");
  });

  it("gebaut (main und Renderer) → ready: Electron direkt; dev vor start", () => {
    pkg("vd", { name: "vd-link", version: "0.2.0", main: "dist-electron/main.cjs", scripts: { start: "npm run build && electron .", dev: "node scripts/dev.mjs" } });
    electron("vd");
    write("vd/dist-electron/main.cjs", "//");
    write("vd/dist/index.html", "<!doctype html>");
    const a = assessDevProject(at("vd"), "vd-link", ["dist/index.html"]);
    expect(a.status).toBe("ready");
    expect(a.electronBin).toBe(path.join(root, "vd/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"));
    expect(a.script).toBe("dev");
    expect(a.mainBuilt && a.rendererBuilt).toBe(true);
    expect(a.need.every(n => n.have)).toBe(true);
    expect(firstMissing(a)).toBeNull();
  });

  it("nicht gebaut, Skript start da → needs-build (eigener Knopf mit Rückfrage)", () => {
    pkg("vj", { name: "vj-link", version: "0.1.8", main: "dist/main/main.js", scripts: { start: "npm run build && node scripts/dev-app.mjs --run" } });
    electron("vj");
    const a = assessDevProject(at("vj"), "vj-link", ["dist/renderer/index.html"]);
    expect(a.status).toBe("needs-build");
    expect(a.scriptCmd).toBe("npm start");
    expect(a.scriptText).toContain("dev-app.mjs");
    expect(firstMissing(a)).toBe("built");
  });

  it("main gebaut, Renderer fehlt → nicht gebaut", () => {
    pkg("half", { name: "vj-link", main: "dist/main/main.js", scripts: { start: "x" } });
    electron("half");
    write("half/dist/main/main.js", "//");
    expect(assessDevProject(at("half"), "vj-link", ["dist/renderer/index.html"]).status).toBe("needs-build");
  });

  it("main außerhalb des Projekts zählt nicht", () => {
    pkg("out", { name: "vj-link", main: "../../etc/passwd" });
    electron("out");
    const a = assessDevProject(at("out"), "vj-link");
    expect(a.main).toBe("");
    expect(a.status).toBe("no-script");
  });

  it("Build älter als Quelltext → Hinweis stale", () => {
    pkg("stale", { name: "crew-link", main: "dist/main/main.js", scripts: { dev: "x" } });
    electron("stale");
    write("stale/dist/main/main.js", "//", Date.now() - 3_600_000);
    write("stale/dist/index.html", "x");
    write("stale/src/main/main.ts", "//", Date.now());
    const a = assessDevProject(at("stale"), "crew-link", ["dist/index.html"]);
    expect(a.status).toBe("ready");
    expect(a.stale).toBe(true);
  });

  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("insideRel", () => {
    expect(insideRel("/p", "a/b")).toBe("/p/a/b");
    expect(insideRel("/p", "../x")).toBeNull();
    expect(insideRel("/p", "/etc")).toBeNull();
    expect(insideRel("/p", "")).toBeNull();
    expect(insideRel("/p", 3)).toBeNull();
  });

  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("Symlink dist → /bin mit path.txt=sh startet nie /bin/sh (QA Befund 2)", () => {
    pkg("symbin", { name: "net-link", main: "main.js", scripts: { start: "electron ." } });
    write("symbin/main.js", "//");
    write("symbin/node_modules/electron/package.json", "{}");
    write("symbin/node_modules/electron/path.txt", "sh");
    fs.symlinkSync("/bin", path.join(root, "symbin/node_modules/electron/dist"));
    const a = assessDevProject(at("symbin"), "net-link");
    expect(a.electronBin).toBe("");
    expect(a.status).toBe("electron-outside");
    expect(firstMissing(a)).toBe("electronOutside");
  });

  it("Electron-Programm im Projekt, aber nicht in einem App-Bundle → abgelehnt", () => {
    pkg("nobundle", { name: "net-link", main: "main.js", scripts: { start: "electron ." } });
    write("nobundle/main.js", "//");
    write("nobundle/node_modules/electron/package.json", "{}");
    write("nobundle/node_modules/electron/path.txt", "electron-runner");
    write("nobundle/node_modules/electron/dist/electron-runner", "#!/bin/sh\n");
    expect(assessDevProject(at("nobundle"), "net-link").status).toBe("no-electron");
    expect(looksLikeAppBinary("/p/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron", "darwin")).toBe(true);
    expect(looksLikeAppBinary("/bin/sh", "darwin")).toBe(false);
  });

  it("Symlink dist-electron → außerhalb: main zählt nicht als gebaut (kein Direktstart fremden Codes)", () => {
    write("outside/main.cjs", "// fremd");
    pkg("symmain", { name: "vd-link", main: "dist-electron/main.cjs", scripts: { dev: "node dev.mjs" } });
    electron("symmain");
    write("symmain/dist/index.html", "x");
    fs.symlinkSync(path.join(root, "outside"), path.join(root, "symmain/dist-electron"));
    const a = assessDevProject(at("symmain"), "vd-link", ["dist/index.html"]);
    expect(a.mainBuilt).toBe(false);
    expect(a.status).toBe("needs-build"); // nur über das eigene Skript, nach Rückfrage
  });

  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("Projektordner selbst als Symlink: alles gegen den realen Ordner geprüft, Start im realen Ordner", () => {
    pkg("realproj", { name: "crew-link", main: "dist/main/main.js", scripts: { dev: "x" } });
    electron("realproj");
    write("realproj/dist/main/main.js", "//");
    write("realproj/dist/index.html", "x");
    fs.symlinkSync(path.join(root, "realproj"), path.join(root, "linkproj"));
    const a = assessDevProject(at("linkproj"), "crew-link", ["dist/index.html"]);
    expect(a.status).toBe("ready");
    expect(a.realDir).toBe(path.join(root, "realproj"));
    expect(a.electronBin.startsWith(path.join(root, "realproj") + "/")).toBe(true);
    expect(realInside(path.join(root, "realproj"), "/bin/sh")).toBeNull();
  });

  it("node_modules/electron als Symlink nach außen → eigener Befund „Electron liegt außerhalb“, nicht „fehlt“", () => {
    write("shared/electron/package.json", "{}");
    write("shared/electron/path.txt", "Electron.app/Contents/MacOS/Electron");
    write("shared/electron/dist/Electron.app/Contents/MacOS/Electron", "#!/bin/sh\n");
    pkg("linkedel", { name: "crew-link", main: "main.js", scripts: { dev: "x" } });
    write("linkedel/main.js", "//");
    fs.mkdirSync(path.join(root, "linkedel/node_modules"), { recursive: true });
    fs.symlinkSync(path.join(root, "shared/electron"), path.join(root, "linkedel/node_modules/electron"));
    const a = assessDevProject(at("linkedel"), "crew-link");
    expect(a.status).toBe("electron-outside");
    expect(a.electronBin).toBe("");
    expect(a.need.at(-1)).toEqual({ key: "electronOutside", have: false });
    // ohne Electron bleibt es „fehlt“
    pkg("noel2", { name: "crew-link", main: "main.js", scripts: { dev: "x" } });
    write("noel2/node_modules/.keep");
    expect(assessDevProject(at("noel2"), "crew-link").status).toBe("no-electron");
  });
});
