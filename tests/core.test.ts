// Reine Logik aus src/core: Katalog, Plist, ps, Umgebung, Login-Shell, Ringpuffer, Versionen, Pfade, Finder, i18n.
import { describe, expect, it } from "vitest";
import { CATALOG, MAIN_ORDER, isProgramId, programByAppName, programByBundleId, programByChatApp, programById, soonPrograms } from "../src/core/catalog";
import { buildPath, cleanEnv, knownNodeDirs, parseShellProbe, SHELL_MARK, SHELL_PROBE, SHELL_PROBE_FISH, shellProbeFor } from "../src/core/env";
import { keepSpotlightHit, matchRegistry, mdfindQuery, parseRegQuery, pickBest } from "../src/core/finder";
import { TEXTS, detectLang, translate } from "../src/core/i18n";
import path from "node:path";
import { fromStoredPath, toStoredPath } from "../src/core/paths";
import { matchProgram, parsePlistJson } from "../src/core/plist";
import { parsePs, parseTasklist, procsOfApp, procsOfDevProject } from "../src/core/procs";
import { LineSplitter, RingLog, stripAnsi } from "../src/core/ringlog";
import { isNewer, newest } from "../src/core/version";

describe("Katalog", () => {
  it("enthält die acht Programme mit Kennungen und Ordnern aus dem Auftrag", () => {
    expect(CATALOG.map(p => p.id).sort()).toEqual(["crew", "db", "lj", "ljl", "net", "pl", "vd", "vj"]);
    expect(programById("lj")!.bundleIds).toContain("dev.ljlinkpro");
    expect(programById("lj")!.appNames).toContain("LJ-Link-PRO.app");
    expect(programById("vj")!.bundleIds).toEqual(["de.nextphilm.vjlink"]);
    expect(programById("vd")!.bundleIds).toEqual(["de.nextphilm.vdlink"]);
    const dirs = Object.fromEntries(CATALOG.filter(p => p.devDir).map(p => [p.id, p.devDir]));
    expect(dirs).toEqual({ vj: "~/VJ-Link", vd: "~/VD-Link", net: "~/NET-Link", crew: "~/Crew-Link", pl: "~/PL-Link", db: "~/dB-Link" });
    for (const p of CATALOG) { expect(p.line.de).toBeTruthy(); expect(p.line.en).toBeTruthy(); expect(p.icon).toMatch(/\.(svg|png)$/); }
  });

  it("prüft Kennungen aus der Oberfläche streng", () => {
    expect(isProgramId("vj")).toBe(true);
    expect(isProgramId("../etc")).toBe(false);
    expect(isProgramId(7)).toBe(false);
    expect(programById("__proto__")).toBeNull();
  });

  it("findet Programme über Kennung, App-Namen und Chat-Namen", () => {
    expect(programByBundleId("dev.ljlinkpro")!.id).toBe("lj");
    expect(programByAppName("LJL Link.app")!.id).toBe("ljl");
    expect(programByChatApp("VJ-Link")!.id).toBe("vj");
    expect(programByChatApp("LJ Link")!.id).toBe("lj");
    expect(programByChatApp("Link-Suite")).toBeNull();
  });

  it("Reihenfolge: große Karten und „Kommt bald“ in Release-Reihenfolge", () => {
    expect(MAIN_ORDER).toEqual(["lj", "vj", "vd", "ljl"]);
    expect(soonPrograms().map(p => p.id)).toEqual(["net", "crew", "pl", "db"]);
  });
});

describe("Info.plist (plutil -convert json)", () => {
  const json = JSON.stringify({ CFBundleIdentifier: "dev.ljlinkpro", CFBundleShortVersionString: "1.7.10", CFBundleExecutable: "LJ Link", CFBundleName: "LJ Link" });
  it("liest die Felder und ordnet zu – auch bei umbenannter App", () => {
    const info = parsePlistJson(json)!;
    expect(info).toEqual({ bundleId: "dev.ljlinkpro", version: "1.7.10", executable: "LJ Link", name: "LJ Link" });
    expect(matchProgram(info, "LJ-Link-PRO.app")!.id).toBe("lj");
    expect(matchProgram(info, "Irgendwas.app")!.id).toBe("lj");
  });
  it("fremde Kennung zählt nicht, auch wenn der Name passt; LJL Link nur über den Namen", () => {
    const fake = parsePlistJson(JSON.stringify({ CFBundleIdentifier: "com.example.fake", CFBundleShortVersionString: "9" }))!;
    expect(matchProgram(fake, "VJ-Link.app")).toBeNull();
    const ljl = parsePlistJson(JSON.stringify({ CFBundleIdentifier: "de.example.ljl", CFBundleShortVersionString: "0.3.1", CFBundleName: "LJL Link" }))!;
    expect(matchProgram(ljl, "LJL Link.app")!.id).toBe("ljl");
    // nur der Dateiname reicht nicht (QA 0.1 Nr. 13)
    const evil = parsePlistJson(JSON.stringify({ CFBundleIdentifier: "com.evil", CFBundleShortVersionString: "1", CFBundleName: "Evil", CFBundleExecutable: "evil" }))!;
    expect(matchProgram(evil, "LJL Link.app")).toBeNull();
    const byExe = parsePlistJson(JSON.stringify({ CFBundleIdentifier: "x.y", CFBundleShortVersionString: "0.3.1", CFBundleExecutable: "LJL-Link" }))!;
    expect(matchProgram(byExe, "LJL Link.app")!.id).toBe("ljl");
  });
  it("kaputtes JSON, Arrays, fehlende Felder → null; zu lange Werte fallen weg", () => {
    expect(parsePlistJson("nicht json")).toBeNull();
    expect(parsePlistJson("[1,2]")).toBeNull();
    expect(parsePlistJson("{}")).toBeNull();
    expect(parsePlistJson(JSON.stringify({ CFBundleIdentifier: "a.b", CFBundleShortVersionString: "x".repeat(100) }))!.version).toBe("");
    expect(parsePlistJson(JSON.stringify({ CFBundleIdentifier: "a.b", CFBundleVersion: "42" }))!.version).toBe("42");
  });
});

describe("Prozessliste (ps -axo pid=,comm=)", () => {
  const out = [
    "    1 /sbin/launchd",
    "  512 /Applications/VD-Link.app/Contents/MacOS/VD-Link",
    "  513 /Applications/VD-Link.app/Contents/Frameworks/VD-Link Helper (GPU).app/Contents/MacOS/VD-Link Helper (GPU)",
    "48211 /Users/dj/VJ-Link/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    "48212 /Users/dj/VJ-Link/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper",
    "48300 /Users/dj/VJ-Link/node_modules/electron/dist/VJ-Link.app/Contents/MacOS/VJ-Link",
    "  700 /Applications/LJ-Link-PRO.app/Contents/MacOS/LJ Link",
    "kaputt",
    "",
  ].join("\n");
  const procs = parsePs(out);
  it("liest PID und vollen Pfad (auch mit Leerzeichen)", () => {
    expect(procs).toHaveLength(7);
    expect(procs.find(p => p.pid === 700)!.comm).toBe("/Applications/LJ-Link-PRO.app/Contents/MacOS/LJ Link");
  });
  it("ordnet installierten Apps zu (Präfix <app>/Contents/MacOS/)", () => {
    expect(procsOfApp(procs, "/Applications/VD-Link.app").map(p => p.pid)).toEqual([512]);
    expect(procsOfApp(procs, "/Applications/VD-Link")).toEqual([]);
  });
  it("ordnet Entwicklerstarts zu: Electron und Klon-App, ohne Helfer", () => {
    expect(procsOfDevProject(procs, "/Users/dj/VJ-Link").map(p => p.pid)).toEqual([48211, 48300]);
    expect(procsOfDevProject(procs, "/Users/dj/VJ-Lin")).toEqual([]);
  });
});

describe("Windows: tasklist", () => {
  it("liest Namen und PIDs und ordnet über den .exe-Namen zu", () => {
    const p = parseTasklist('"System Idle Process","0","Services","0","8 K"\r\n"VJ-Link.exe","4321","Console","1","120.000 K"\r\n"LJ Link.exe","77","Console","1","90 K"\r\n');
    expect(p.map(x => x.pid)).toEqual([0, 4321, 77]);
    expect(procsOfApp(p, "C:\\Users\\x\\AppData\\Local\\Programs\\VJ-Link\\VJ-Link.exe").map(x => x.pid)).toEqual([4321]);
    expect(procsOfApp(p, "C:\\Program Files\\LJ Link\\lj link.exe").map(x => x.pid)).toEqual([77]);
    expect(procsOfApp(p, "C:\\x\\VD-Link.exe")).toEqual([]);
  });
});

describe("Umgebung säubern", () => {
  it("entfernt ELECTRON_*, npm_*, VITE_*, NODE_OPTIONS, __CFBundleIdentifier, behält den Rest", () => {
    const env = cleanEnv({
      HOME: "/Users/x", PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1", ELECTRON_OVERRIDE_DIST_PATH: "/x", npm_lifecycle_event: "start",
      npm_config_cache: "/c", VITE_DEV_SERVER_URL: "http://localhost:5199", NODE_OPTIONS: "--inspect", __CFBundleIdentifier: "de.nextphilm.linksuite",
      XPC_SERVICE_NAME: "x", INIT_CWD: "/y", LINKSUITE_CHAT_PORT: "47684", VJLINK_DATA: "/d", LANG: "de_DE.UTF-8", UNDEF: undefined,
    });
    expect(env).toEqual({ HOME: "/Users/x", PATH: "/usr/bin", LANG: "de_DE.UTF-8", FORCE_COLOR: "0" });
  });
  it("setzt Werte danach (z. B. PATH)", () => {
    expect(cleanEnv({ PATH: "/a" }, { PATH: "/b" }).PATH).toBe("/b");
  });
});

describe("Login-Shell mit Marker", () => {
  it("findet npm, node und PATH zwischen fremdem Text der Shell", () => {
    const out = `Willkommen!\nnvm: using node v22\n\n${SHELL_MARK}npm=/opt/homebrew/bin/npm\n${SHELL_MARK}node=/opt/homebrew/bin/node\n${SHELL_MARK}path=/opt/homebrew/bin:/usr/bin:relativ:/bin\nTschüss`;
    expect(parseShellProbe(out)).toEqual({ npm: "/opt/homebrew/bin/npm", node: "/opt/homebrew/bin/node", path: "/opt/homebrew/bin:/usr/bin:/bin" });
  });
  it("ohne npm oder mit relativem Pfad → null", () => {
    expect(parseShellProbe(`${SHELL_MARK}npm=\n${SHELL_MARK}path=/usr/bin`)).toBeNull();
    expect(parseShellProbe(`${SHELL_MARK}npm=npm`)).toBeNull();
    expect(parseShellProbe("")).toBeNull();
  });
  it("fish: eigener Befehl mit string join, sonst der POSIX-Befehl", () => {
    expect(shellProbeFor("/opt/homebrew/bin/fish")).toBe(SHELL_PROBE_FISH);
    expect(shellProbeFor("/bin/zsh")).toBe(SHELL_PROBE);
    expect(shellProbeFor("/usr/local/bin/notfish")).toBe(SHELL_PROBE);
    expect(SHELL_PROBE_FISH).toContain("string join : $PATH");
    expect(SHELL_PROBE_FISH).not.toContain("$(");
  });
  it("Befehl gibt alle drei Marker aus", () => {
    expect(SHELL_PROBE).toContain(`${SHELL_MARK}npm=`);
    expect(SHELL_PROBE).toContain(`${SHELL_MARK}path=`);
  });
  it("PATH: Login-Shell, dann node/npm, dann System, ohne Doppelte", () => {
    expect(buildPath({ npm: "/opt/homebrew/bin/npm", node: "/opt/homebrew/bin/node", path: "/opt/homebrew/bin:/usr/bin" }, null))
      .toBe("/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    expect(buildPath(null, "/x/bin")).toBe("/x/bin:/usr/bin:/bin:/usr/sbin:/sbin");
  });
  it("bekannte Orte: höchste nvm-Version zuerst", () => {
    const dirs = knownNodeDirs("/h", ["v18.20.0", "v22.1.0", "v20.11.1"]);
    expect(dirs[0]).toBe("/opt/homebrew/bin");
    expect(dirs.filter(d => d.includes(".nvm"))).toEqual(["/h/.nvm/versions/node/v22.1.0/bin", "/h/.nvm/versions/node/v20.11.1/bin", "/h/.nvm/versions/node/v18.20.0/bin"]);
  });
});

describe("Log: Ringpuffer und Zeilen", () => {
  it("hält höchstens max Zeilen, ältere fallen vorne weg", () => {
    const log = new RingLog(5000);
    for (let i = 1; i <= 5003; i++) log.push(i % 2 ? "out" : "err", `Zeile ${i}`);
    expect(log.size).toBe(5000);
    expect(log.dropped).toBe(3);
    expect(log.since(0)[0]).toMatchObject({ n: 4, t: "Zeile 4", s: "err" });
    expect(log.since(5001).map(l => l.n)).toEqual([5002, 5003]);
    expect(log.since(5003)).toEqual([]);
  });
  it("stdout und stderr bleiben getrennt markiert; Leeren", () => {
    const log = new RingLog(10);
    log.push("out", "a"); log.push("err", "b"); log.push("sys", "c");
    expect(log.since(0).map(l => l.s)).toEqual(["out", "err", "sys"]);
    log.clear();
    expect(log.size).toBe(0);
    log.push("out", "d");
    expect(log.since(0).map(l => l.t)).toEqual(["d"]);
  });
  it("kürzt überlange Zeilen", () => {
    const log = new RingLog(2);
    expect(log.push("out", "x".repeat(10_000)).t.length).toBeLessThan(4100);
  });
  it("ANSI-Farben und Steuerzeichen weg, Tabs bleiben", () => {
    expect(stripAnsi("\x1b[32mok\x1b[0m\tda\x07")).toBe("ok\tda");
    expect(stripAnsi("\x1b]0;Titel\x07Text")).toBe("Text");
  });
  it("zerlegt Datenstrom in Zeilen, Rest wartet", () => {
    const got: string[] = [];
    const s = new LineSplitter(l => got.push(l));
    s.write("eins\nzw"); s.write("ei\r\ndrei\rvier"); expect(got).toEqual(["eins", "zwei", "drei"]);
    s.flush(); expect(got).toEqual(["eins", "zwei", "drei", "vier"]);
  });
});

describe("Versionen", () => {
  it("isNewer wie VJ-Link", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("v1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("0.9.9", "1.0.0")).toBe(false);
    expect(isNewer("", "1.0.0")).toBe(false);
  });
  it("newest", () => {
    expect(newest(["0.1.7", "", null, "0.1.8", "0.1.10"])).toBe("0.1.10");
    expect(newest([])).toBeNull();
  });
});

describe("Pfade für die Einstellungen", () => {
  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("unter dem Benutzerordner als ~/…, sonst absolut", () => {
    expect(toStoredPath("/Users/dj/VJ-Link", "/Users/dj")).toBe("~/VJ-Link");
    expect(toStoredPath("/Users/dj/a/b/../c", "/Users/dj")).toBe("~/a/c");
    expect(toStoredPath("/Users/dj", "/Users/dj")).toBe("~");
    expect(toStoredPath("/Volumes/Projekte/PL", "/Users/dj")).toBe("/Volumes/Projekte/PL");
    expect(toStoredPath("/Users/djX/a", "/Users/dj")).toBe("/Users/djX/a");
    expect(toStoredPath("relativ", "/Users/dj")).toBeNull();
  });
  // POSIX-Pfade, Symlinks bzw. .app-Bundles (macOS); unter Windows echt in der VM geprüft
  it.skipIf(process.platform === "win32")("lesen: ~ auflösen, nicht aus dem Benutzerordner hinaus, relative und kaputte → null", () => {
    expect(fromStoredPath("~/VJ-Link", "/Users/dj")).toBe("/Users/dj/VJ-Link");
    expect(fromStoredPath("~", "/Users/dj")).toBe("/Users/dj");
    expect(fromStoredPath("/opt/x", "/Users/dj")).toBe("/opt/x");
    expect(fromStoredPath("~/../root", "/Users/dj")).toBeNull();
    expect(fromStoredPath("VJ-Link", "/Users/dj")).toBeNull();
    expect(fromStoredPath("a\0b", "/Users/dj")).toBeNull();
    expect(fromStoredPath(5, "/Users/dj")).toBeNull();
  });
});

describe("Finden", () => {
  it("Spotlight-Treffer filtern: release, node_modules, Papierkorb, Datenordner, Volumes, Entwicklerordner", () => {
    const dev = ["/Users/dj/VD-Link"];
    expect(keepSpotlightHit("/Applications/VD-Link.app", dev)).toBe(true);
    expect(keepSpotlightHit("/Users/dj/Downloads/VD-Link.app", dev)).toBe(true);
    expect(keepSpotlightHit("/Users/dj/VD-Link/release/mac-arm64/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Users/dj/Other/release/mac/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Users/dj/VJ-Link/node_modules/electron/dist/VJ-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Users/dj/.Trash/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Users/dj/Library/Application Support/Claude/x/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Users/dj/VD-Link/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Volumes/VD-Link/VD-Link.app", dev)).toBe(false);
    expect(keepSpotlightHit("/Volumes/CLUB/LJL Link.app", dev, true)).toBe(true);
  });
  it("Spotlight-Abfrage nur mit sauberer Kennung", () => {
    expect(mdfindQuery("de.nextphilm.vdlink")).toBe("kMDItemCFBundleIdentifier == 'de.nextphilm.vdlink'");
    expect(mdfindQuery("x' || true")).toBeNull();
  });
  it("mehrere Treffer: neueste Version, sonst /Applications vor dem Rest", () => {
    const r = pickBest([
      { path: "/Users/x/Downloads/VD-Link.app", version: "0.1.9", bundleId: "", via: "spotlight" },
      { path: "/Applications/VD-Link.app", version: "0.2.0", bundleId: "", via: "known" },
      { path: "/Users/x/Applications/VD-Link.app", version: "0.2.0", bundleId: "", via: "known" },
    ], "/Users/x");
    expect(r.best!.path).toBe("/Applications/VD-Link.app");
    expect(r.others.map(o => o.path)).toEqual(["/Users/x/Applications/VD-Link.app", "/Users/x/Downloads/VD-Link.app"]);
    expect(pickBest([], "/h").best).toBeNull();
  });
  it("Windows-Registry (Gerüst): reg query lesen und zuordnen", () => {
    const text = [
      "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\a1b2",
      "    DisplayName    REG_SZ    VJ-Link 0.1.8",
      "    DisplayVersion    REG_SZ    0.1.8",
      "    DisplayIcon    REG_SZ    C:\\Users\\x\\AppData\\Local\\Programs\\VJ-Link\\VJ-Link.exe,0",
      "",
      "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{LJ}",
      "    DisplayName    REG_SZ    LJ Link",
      "    DisplayVersion    REG_SZ    1.7.11",
      "    InstallLocation    REG_SZ    C:\\Users\\x\\AppData\\Local\\LJ Link\\",
      "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\other",
      "    DisplayName    REG_SZ    VJ-Linker Pro",
    ].join("\r\n");
    const e = parseRegQuery(text);
    expect(e).toHaveLength(3);
    expect(matchRegistry(e, "VJ-Link", "VJ-Link.exe")).toEqual([{ path: "C:\\Users\\x\\AppData\\Local\\Programs\\VJ-Link\\VJ-Link.exe", version: "0.1.8", bundleId: "", via: "registry" }]);
    expect(matchRegistry(e, "LJ Link", "LJ Link.exe")[0]!.path).toBe("C:\\Users\\x\\AppData\\Local\\LJ Link\\LJ Link.exe");
  });
});

describe("Texte", () => {
  it("jeder Schlüssel hat Deutsch und Englisch, Platzhalter gleich", () => {
    for (const [k, e] of Object.entries(TEXTS)) {
      expect(e.de, k).toBeTruthy();
      expect(e.en, k).toBeTruthy();
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
      expect(vars(e.en), k).toEqual(vars(e.de));
    }
  });
  it("übersetzt mit Platzhaltern; unbekannter Schlüssel bleibt stehen", () => {
    expect(translate("de", "top.running", { n: 2 })).toBe("2 laufen");
    expect(translate("en", "pill.update", { v: "1.7.11" })).toBe("UPDATE 1.7.11");
    expect(translate("en", "gibt.es.nicht")).toBe("gibt.es.nicht");
    expect(detectLang(["fr-FR", "de-AT"])).toBe("de");
    expect(detectLang(["ja"])).toBe("en");
  });
});

describe("Pfade unter Windows (path.win32, auf jeder Plattform)", () => {
  const W = path.win32;
  it("toStoredPath: Benutzerordner als ~/…, Groß-/Kleinschreibung des Laufwerks egal, anderes Laufwerk absolut", () => {
    expect(toStoredPath("C:\\Users\\dj\\Projekte\\VJ-Link", "C:\\Users\\dj", W)).toBe("~/Projekte/VJ-Link");
    expect(toStoredPath("c:\\users\\DJ\\VJ-Link", "C:\\Users\\dj", W)).toBe("~/VJ-Link");
    expect(toStoredPath("C:\\Users\\dj", "C:\\Users\\dj", W)).toBe("~");
    expect(toStoredPath("D:\\Show\\VD-Link", "C:\\Users\\dj", W)).toBe("D:\\Show\\VD-Link");
    expect(toStoredPath("C:\\Users\\djx\\a", "C:\\Users\\dj", W)).toBe("C:\\Users\\djx\\a");
    expect(toStoredPath("C:\\Users\\dj\\a\\..\\..\\other", "C:\\Users\\dj", W)).toBe("C:\\Users\\other");
    expect(toStoredPath("relativ\\x", "C:\\Users\\dj", W)).toBeNull();
  });
  it("fromStoredPath: ~ auflösen, .. bleibt im Benutzerordner, laufwerksrelative Pfade abgelehnt", () => {
    expect(fromStoredPath("~/VJ-Link", "C:\\Users\\dj", W)).toBe("C:\\Users\\dj\\VJ-Link");
    expect(fromStoredPath("~", "C:\\Users\\dj", W)).toBe("C:\\Users\\dj");
    expect(fromStoredPath("~/../Public", "C:\\Users\\dj", W)).toBeNull();
    expect(fromStoredPath("D:\\Show\\VD-Link", "C:\\Users\\dj", W)).toBe("D:\\Show\\VD-Link");
    expect(fromStoredPath("C:Show", "C:\\Users\\dj", W)).toBeNull();
    expect(fromStoredPath("Show\\x", "C:\\Users\\dj", W)).toBeNull();
  });
});
