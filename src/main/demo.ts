// Demo-Modus (--demo): Testordner statt echter Programme, erfundene Teilnehmer im Netz, Testport statt 47676.
// Alles liegt in einem Temp-Ordner; nichts außerhalb wird angelegt oder geändert. Erfundene Datagramme gehen über
// denselben Weg wie echte (ChatNet.inject).
import fs from "node:fs";
import path from "node:path";
import type { ProgramId } from "../core/catalog";
import type { ReleaseInfo, SourceId } from "../core/release";

export interface Demo {
  root: string;
  apps: string;
  devDirs: Partial<Record<ProgramId, string>>;
  /** Installierte Apps, die im Demo „laufen“. */
  fakeRunning: Set<ProgramId>;
  localIps: string[];
}

const plist = (id: string, name: string, ver: string, exe: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleName</key><string>${name}</string>
<key>CFBundleExecutable</key><string>${exe}</string>
<key>CFBundleShortVersionString</key><string>${ver}</string>
</dict></plist>
`;

function write(file: string, text: string, mode = 0o644): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
}

/** Erfundenes „Electron“: ein Shell-Skript, das wie ein Programm Zeilen ausgibt und läuft, bis es gestoppt wird. */
const FAKE_ELECTRON = `#!/bin/sh
# Demo von Link-Suite: steht für das Electron-Programm eines Projekts.
echo "Electron 45.3.1 (Demo) startet $1"
echo "[main] Fenster geöffnet"
echo "(node:4711) ExperimentalWarning: VM Modules is an experimental feature" 1>&2
echo "Suite-Chat: 239.255.76.76:47676 (Demo)"
i=0
trap 'echo "[main] beendet (SIGTERM)"; exit 0' TERM
while true; do
  i=$((i+1))
  echo "[render] Bild $i · 60 fps"
  if [ $((i % 4)) -eq 0 ]; then echo "[ljlink] Bonjour: kein _ljlink._tcp gefunden, versuche erneut in 5 s" 1>&2; fi
  sleep 1
done
`;

/** Testordner anlegen: zwei Apps, sechs Entwicklerprojekte in allen Zuständen. */
export function createDemo(root: string): Demo {
  const apps = path.join(root, "Applications");
  const dev = path.join(root, "dev");
  // Installierte Apps (nur Info.plist, kein Programm darin: Starten ist im Demo nur gespielt)
  write(path.join(apps, "LJ-Link-PRO.app", "Contents", "Info.plist"), plist("dev.ljlinkpro", "LJ Link", "1.7.10", "LJ Link"));
  write(path.join(apps, "VD-Link.app", "Contents", "Info.plist"), plist("de.nextphilm.vdlink", "VD-Link", "0.2.0", "VD-Link"));

  const electron = (dir: string) => {
    write(path.join(dir, "node_modules", "electron", "package.json"), JSON.stringify({ name: "electron", version: "45.3.1" }));
    write(path.join(dir, "node_modules", "electron", "path.txt"), "Electron.app/Contents/MacOS/Electron");
    write(path.join(dir, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron"), FAKE_ELECTRON, 0o755);
  };

  // VJ-Link: gebaut → startbar ohne Bauen (Electron direkt)
  const vj = path.join(dev, "VJ-Link");
  write(path.join(vj, "package.json"), JSON.stringify({
    name: "vj-link", version: "0.1.8", main: "dist/main/main.js",
    scripts: { build: "node scripts/build.mjs", start: "npm run build && node scripts/dev-app.mjs --run" },
  }, null, 2));
  write(path.join(vj, "dist", "main", "main.js"), "// Demo\n");
  write(path.join(vj, "dist", "renderer", "index.html"), "<!doctype html><title>Demo</title>\n");
  electron(vj);

  // VD-Link: nicht gebaut, aber Skript dev → eigener Knopf mit Rückfrage (npm run dev schreibt nur in den Temp-Ordner)
  const vd = path.join(dev, "VD-Link");
  write(path.join(vd, "package.json"), JSON.stringify({
    name: "vd-link", version: "0.2.0", main: "dist-electron/main.cjs", scripts: { dev: "node scripts/dev.mjs" },
  }, null, 2));
  write(path.join(vd, "scripts", "dev.mjs"), `// Demo von Link-Suite: steht für den Entwicklungsserver eines Projekts.
console.log("vite v8.3.8 dev server running at http://localhost:5199/ (Demo)");
console.error("[vite] warning: chunk three.module.js is larger than 500 kB");
let i = 0;
setInterval(() => console.log("[hmr] update " + (++i)), 1500);
process.on("SIGTERM", () => { console.log("dev: beendet"); process.exit(0); });
`);
  electron(vd);

  // NET Link: nur docs/ → kein package.json
  write(path.join(dev, "NET-Link", "docs", "KONZEPT.md"), "# Demo\n");
  // Crew Link: package.json, aber node_modules fehlt
  write(path.join(dev, "Crew-Link", "package.json"), JSON.stringify({ name: "crew-link", version: "0.1.0", main: "dist/main/main.js", scripts: { dev: "node scripts/dev.mjs" } }, null, 2));
  // dB Link: package.json ohne Skript und ohne main
  write(path.join(dev, "dB-Link", "package.json"), JSON.stringify({ name: "db-link", version: "0.1.0", scripts: { test: "vitest run" } }, null, 2));
  // PL Link: Ordner fehlt

  return {
    root, apps,
    devDirs: {
      vj, vd, net: path.join(dev, "NET-Link"), crew: path.join(dev, "Crew-Link"), db: path.join(dev, "dB-Link"), pl: path.join(dev, "PL-Link"),
    },
    fakeRunning: new Set<ProgramId>(["vd"]),
    localIps: ["192.168.1.10"],
  };
}

/** Erfundene Teilnehmer im Netz (Datagramme wie von echten Programmen). */
export interface FakePeer { ip: string; json: Record<string, unknown> }

export const DEMO_PEERS: FakePeer[] = [
  { ip: "192.168.1.10", json: { suite: "chat", v: 1, t: "here", peer: "demoljlink01", nick: "Max", where: "Booth", app: "LJ Link", ver: "1.7.10" } },
  { ip: "192.168.1.12", json: { suite: "chat", v: 1, t: "here", peer: "demovjlink02", nick: "Lena", where: "VJ-Platz", app: "VJ-Link", ver: "0.1.7" } },
  { ip: "192.168.1.14", json: { suite: "chat", v: 1, t: "here", peer: "demovdlink03", nick: "Tom", where: "FOH", app: "VD-Link" } },
  { ip: "192.168.1.14", json: { suite: "chat", v: 1, t: "here", peer: "demonetlink4", nick: "Tom", where: "FOH", app: "NET Link", ver: "0.1.0-dev" } },
];

/** Ein Teilnehmer, der schon gegangen ist (zeigt „weg seit …“). */
export const DEMO_GONE: FakePeer = { ip: "192.168.1.21", json: { suite: "chat", v: 1, t: "here", peer: "demoljllink5", nick: "DJ Sora", where: "DJ-Pult", app: "LJL Link", ver: "0.3.1" } };

export const DEMO_MESSAGES: FakePeer[] = [
  { ip: "192.168.1.12", json: { suite: "chat", v: 1, t: "msg", peer: "demovjlink02", id: "demovjlink02-1abcdefgh", nick: "Lena", where: "VJ-Platz", app: "VJ-Link", text: "Bin startklar, LJ Link ist da." } },
  { ip: "192.168.1.14", json: { suite: "chat", v: 1, t: "msg", peer: "demovdlink03", id: "demovdlink03-1abcdefgh", nick: "Tom", where: "FOH", app: "VD-Link", text: "FOH steht. Einlass 22 Uhr." } },
];

/** Feste Releases für Demo und Screenshots (kein Netz): LJ Link mit Update, VJ-Link nicht installiert, LJL Link Alpha. */
const demoRel = (repo: string, version: string, asset: string, size: number, notes: string): ReleaseInfo => ({
  version, tag: `v${version}`, asset, url: `https://github.com/${repo}/releases/download/v${version}/${asset}`, size,
  sha256: "0".repeat(63) + "1", page: `https://github.com/${repo}/releases/tag/v${version}`, notes, prerelease: false, sumsUrl: null, sigUrl: null,
});
export const DEMO_RELEASES: { id: SourceId; latest: ReleaseInfo | null }[] = [
  { id: "lj", latest: demoRel("skyplayser/LJ-Link", "1.7.11", "LJ-Link-macos-arm64.dmg", 72_449_190, "Demo: Fehlerbehebungen für die Booth.\n- Wellenformen schneller\n- Cues stabiler") },
  { id: "vj", latest: demoRel("skyplayser/VJ-LINK", "0.1.8", "VJ-Link-macos-arm64.dmg", 135_844_430, "Demo: ver und echo im Suite-Chat.") },
  { id: "vd", latest: demoRel("skyplayser/VD-Link", "0.2.0", "VD-Link-macos-arm64.dmg", 118_000_000, "Demo: Art-Net, sACN, 3D-Vorschau.") },
  { id: "ljl", latest: demoRel("skyplayser/LJL-Link", "0.3.1", "LJL-Link-0.3.1-macOS.zip", 1_641_371, "Demo: Club-Stick.") },
  { id: "crew", latest: { ...demoRel("skyplayser/Crew-Link", "0.1.0", "Crew-Link-macos-arm64.dmg", 110_000_000, "Demo: Timetable der Nacht."), prerelease: true } },
  { id: "suite", latest: null },
];
