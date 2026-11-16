// Installieren/Aktualisieren 0.2: Asset-Wahl, Hosts, Repo, digest, Größe, Signatur (Testschlüssel), Zip-Slip, Bundle.
import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import path from "node:path";
import {
  allowedUrl, bundleMatches, checkSignature, installVerdict, kindOf, LAUNCHER_REPO, pageFor, parseDigest, parseSums, pickRelease,
  sizeOk, SOURCES, sourceById, symlinkInside, unsafeZipEntries, urlBelongsToRepo, MAX_DOWNLOAD,
} from "../src/core/release";
import { isNewer } from "../src/core/version";

const H = "a".repeat(64);
const rel = (repo: string, names: string[], tag = "v1.7.11") => ({
  tag_name: tag, html_url: `https://github.com/${repo}/releases/tag/${tag}`, body: "## Neu\n- Fix", prerelease: false,
  assets: names.map(n => ({ name: n, size: 1000, digest: `sha256:${H}`, browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${n}` })),
});

describe("Asset-Wahl je Plattform und Programm", () => {
  it("LJ Link / VJ-Link / Launcher: arm64, intel, windows", () => {
    expect(SOURCES.lj.asset("darwin", "arm64", "1")).toBe("LJ-Link-macos-arm64.dmg");
    expect(SOURCES.lj.asset("darwin", "x64", "1")).toBe("LJ-Link-macos-intel.dmg");
    expect(SOURCES.vj.asset("win32", "x64", "1")).toBe("VJ-Link-windows.exe");
    expect(SOURCES.suite.asset("darwin", "arm64", "1")).toBe("Link-Suite-macos-arm64.dmg");
    expect(SOURCES.suite.repo).toBe(LAUNCHER_REPO);
    expect(SOURCES.lj.asset("linux", "x64", "1")).toBeNull();
  });
  it("LJL Link: Zip mit Version, nur macOS", () => {
    expect(SOURCES.ljl.asset("darwin", "arm64", "0.3.1")).toBe("LJL-Link-0.3.1-macOS.zip");
    expect(SOURCES.ljl.asset("win32", "x64", "0.3.1")).toBeNull();
    expect(SOURCES.ljl.asset("darwin", "arm64", "../x")).toBeNull();
  });
  it("pickRelease wählt das passende Paket, digest, Seite und Prüfsummenliste", () => {
    const r = pickRelease(rel("skyplayser/LJ-Link", ["LJ-Link-macos-arm64.dmg", "LJ-Link-macos-intel.dmg", "LJ-Link-PRO-macos-arm64.dmg", "SHA256SUMS", "SHA256SUMS.sig"]), SOURCES.lj, "darwin", "arm64")!;
    expect(r).toMatchObject({ version: "1.7.11", tag: "v1.7.11", asset: "LJ-Link-macos-arm64.dmg", size: 1000, sha256: H, prerelease: false });
    expect(r.url).toBe("https://github.com/skyplayser/LJ-Link/releases/download/v1.7.11/LJ-Link-macos-arm64.dmg");
    expect(r.sumsUrl).toContain("SHA256SUMS");
    expect(r.page).toBe("https://github.com/skyplayser/LJ-Link/releases/tag/v1.7.11");
    expect(r.notes).toContain("Fix");
  });
  it("fremdes Repo in der Download-Adresse → kein Download; fremde Seite → eigene Releaseseite", () => {
    const j = rel("skyplayser/LJ-Link", ["LJ-Link-macos-arm64.dmg"]);
    j.assets[0]!.browser_download_url = "https://github.com/evil/LJ-Link/releases/download/v1.7.11/LJ-Link-macos-arm64.dmg";
    j.html_url = "https://evil.example/x";
    const r = pickRelease(j, SOURCES.lj, "darwin", "arm64")!;
    expect(r.url).toBeNull();
    expect(r.page).toBe("https://github.com/skyplayser/LJ-Link/releases");
  });
  it("kaputte Antworten, Entwürfe und fehlende Pakete", () => {
    expect(pickRelease(null, SOURCES.lj, "darwin", "arm64")).toBeNull();
    expect(pickRelease({ tag_name: "nightly" }, SOURCES.lj, "darwin", "arm64")).toBeNull();
    expect(pickRelease({ ...rel("skyplayser/LJ-Link", []), draft: true }, SOURCES.lj, "darwin", "arm64")).toBeNull();
    const r = pickRelease(rel("skyplayser/VJ-LINK", ["VJ-Link-windows.exe"], "v0.1.8"), SOURCES.vj, "darwin", "arm64")!;
    expect(r.url).toBeNull();
    expect(r.version).toBe("0.1.8");
  });
  it("digest fehlt → sha256 null", () => {
    const j = rel("skyplayser/LJL-Link", ["LJL-Link-0.3.1-macOS.zip"], "v0.3.1");
    delete (j.assets[0] as { digest?: string }).digest;
    expect(pickRelease(j, SOURCES.ljl, "darwin", "arm64")!.sha256).toBeNull();
  });
  it("Quellen nur über eigene Kennungen; Dateiart", () => {
    expect(sourceById("lj")!.repo).toBe("skyplayser/LJ-Link");
    expect(sourceById("vd")).toBeNull();
    expect(sourceById("toString")).toBeNull();
    expect(sourceById("__proto__")).toBeNull();
    expect(kindOf("a.dmg")).toBe("dmg"); expect(kindOf("a.zip")).toBe("zip"); expect(kindOf("a.exe")).toBe("exe"); expect(kindOf("a.pkg")).toBeNull();
  });
});

describe("Hosts und Repo", () => {
  it("nur https, nur GitHub-Hosts, keine Zugangsdaten, Standardport", () => {
    for (const h of ["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]) expect(allowedUrl(`https://${h}/x`)).toBe(true);
    expect(allowedUrl("http://github.com/x")).toBe(false);
    expect(allowedUrl("https://github.com.evil.com/x")).toBe(false);
    expect(allowedUrl("https://evil.com/github.com")).toBe(false);
    expect(allowedUrl("https://user:pw@github.com/x")).toBe(false);
    expect(allowedUrl("https://github.com:8443/x")).toBe(false);
    expect(allowedUrl("file:///etc/passwd")).toBe(false);
    expect(allowedUrl("kaputt")).toBe(false);
  });
  it("URL gehört zum Repo", () => {
    expect(urlBelongsToRepo("https://github.com/skyplayser/LJ-Link/releases/download/v1/a.dmg", "skyplayser/LJ-Link")).toBe(true);
    expect(urlBelongsToRepo("https://github.com/skyplayser/lj-link/releases/download/v1/a.dmg", "skyplayser/LJ-Link")).toBe(true);
    expect(urlBelongsToRepo("https://github.com/skyplayser/LJ-Link-evil/releases/download/v1/a.dmg", "skyplayser/LJ-Link")).toBe(false);
    expect(urlBelongsToRepo("https://github.com/skyplayser/VJ-LINK/releases/download/v1/a.dmg", "skyplayser/LJ-Link")).toBe(false);
    expect(urlBelongsToRepo("https://github.com/skyplayser/LJ-Link/releases/download/%2E%2E/%2E%2E/evil/x", "skyplayser/LJ-Link")).toBe(false);
    expect(urlBelongsToRepo("https://api.github.com/repos/skyplayser/LJ-Link/releases/assets/1", "skyplayser/LJ-Link")).toBe(true);
    expect(urlBelongsToRepo("https://objects.githubusercontent.com/x", "skyplayser/LJ-Link")).toBe(false);
    expect(pageFor("https://github.com/skyplayser/LJ-Link/releases/tag/v1", "skyplayser/LJ-Link")).toContain("/tag/v1");
  });
});

describe("Prüfungen vor der Verwendung", () => {
  it("digest und Größe", () => {
    expect(parseDigest(`sha256:${H.toUpperCase()}`)).toBe(H);
    expect(parseDigest("md5:abc")).toBeNull();
    expect(sizeOk(1000, 1000)).toBe(true);
    expect(sizeOk(999, 1000)).toBe(false);
    expect(sizeOk(0, 0)).toBe(false);
    expect(sizeOk(MAX_DOWNLOAD + 1, MAX_DOWNLOAD + 1)).toBe(false);
  });
  it("Regel: ohne digest nie, Hash falsch nie, ungültige Signatur nie, Pflicht ohne Signatur nie", () => {
    const base = { expected: H, actual: H, sizeOk: true, sig: "absent" as const, require: false };
    expect(installVerdict(base)).toEqual({ ok: true });
    expect(installVerdict({ ...base, expected: null })).toEqual({ ok: false, reason: "nodigest" });
    expect(installVerdict({ ...base, actual: "b".repeat(64) })).toEqual({ ok: false, reason: "hash" });
    expect(installVerdict({ ...base, sizeOk: false })).toEqual({ ok: false, reason: "size" });
    expect(installVerdict({ ...base, sig: "invalid" })).toEqual({ ok: false, reason: "signature" });
    expect(installVerdict({ ...base, sig: "nokey" })).toEqual({ ok: true });
    expect(installVerdict({ ...base, require: true })).toEqual({ ok: false, reason: "unsigned" });
    expect(installVerdict({ ...base, require: true, sig: "valid" })).toEqual({ ok: true });
  });
  it("Signatur mit Testschlüssel (Ed25519, Format wie VJ-Link sign-release.sh)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const sums = Buffer.from(`${H}  LJ-Link-macos-arm64.dmg\n${"c".repeat(64)}  LJ-Link-windows.exe\n`);
    const sig = sign(null, sums, privateKey);
    expect(checkSignature(null, null, [pub], "LJ-Link-macos-arm64.dmg", H)).toBe("absent");
    expect(checkSignature(sums, sig, [], "LJ-Link-macos-arm64.dmg", H)).toBe("nokey");
    expect(checkSignature(sums, sig, [pub], "LJ-Link-macos-arm64.dmg", H)).toBe("valid");
    expect(checkSignature(sums, sig, [other, pub], "LJ-Link-macos-arm64.dmg", H)).toBe("valid"); // Schlüsselwechsel
    expect(checkSignature(sums, sig, [other], "LJ-Link-macos-arm64.dmg", H)).toBe("invalid");
    expect(checkSignature(sums, sig, [pub], "LJ-Link-macos-arm64.dmg", "d".repeat(64))).toBe("invalid");
    const tampered = Buffer.from(sums.toString().replace("c", "e"));
    expect(checkSignature(tampered, sig, [pub], "LJ-Link-macos-arm64.dmg", H)).toBe("invalid");
    expect(checkSignature(sums, sig, ["kein pem"], "LJ-Link-macos-arm64.dmg", H)).toBe("invalid");
    expect(parseSums(sums.toString()).get("LJ-Link-windows.exe")).toBe("c".repeat(64));
  });
  it("Zip-Slip: absolute Pfade und .. werden erkannt", () => {
    expect(unsafeZipEntries(["LJL Link.app/", "LJL Link.app/Contents/Info.plist", "__MACOSX/._x"])).toEqual([]);
    expect(unsafeZipEntries(["../evil", "/etc/passwd", "a/../../b", "C:\\x", "ok/file"])).toEqual(["../evil", "/etc/passwd", "a/../../b", "C:\\x"]);
  });
  it("Symlinks nur innerhalb des Entpack-Ordners", () => {
    const root = "/t/x";
    expect(symlinkInside(root, "/t/x/A.app/Contents/Frameworks/F.framework", "Versions/Current/F", path.join, path.resolve)).toBe(true);
    expect(symlinkInside(root, "/t/x/A.app", "../../../etc", path.join, path.resolve)).toBe(false);
    expect(symlinkInside(root, "/t/x/A.app", "/bin/sh", path.join, path.resolve)).toBe(false);
    expect(symlinkInside(root, "/t/x", "../xy", path.join, path.resolve)).toBe(false);
  });
  it("Bundle-Prüfung: Kennung bzw. Name und Version", () => {
    const info = { bundleId: "dev.ljlinkpro", version: "1.7.11", executable: "LJ Link", name: "LJ Link" };
    expect(bundleMatches(info, SOURCES.lj, "LJ Link.app", "1.7.11").ok).toBe(true);
    expect(bundleMatches(info, SOURCES.lj, "LJ Link.app", "1.7.12").ok).toBe(false);
    expect(bundleMatches({ ...info, bundleId: "com.evil" }, SOURCES.lj, "LJ Link.app", "1.7.11").ok).toBe(false);
    expect(bundleMatches({ ...info, bundleId: "x", version: "0.3.1" }, SOURCES.ljl, "LJL Link.app", "0.3.1").ok).toBe(true);
    expect(bundleMatches({ ...info, version: "0.3.1" }, SOURCES.ljl, "Evil.app", "0.3.1").ok).toBe(false);
  });
  it("isNewer für Updates", () => {
    expect(isNewer("1.7.11", "1.7.10")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
  });
});
