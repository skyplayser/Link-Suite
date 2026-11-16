// Installieren und Aktualisieren (Version 0.2): reine Logik ohne Netz und Dateisystem.
// Übernommen und erweitert aus VJ-Link src/core/update.ts (EPL-2.0, Stand 15.11.2026): parseDigest, parseSums,
// pickRelease (hier je Programm und Plattform), isNewer (in version.ts). Neu: Quellen je Programm, Host-Allowlist,
// „URL gehört zum Repo“, Größenprüfung, Signaturregel mit mehreren Schlüsseln, Zip-Slip-Prüfung, Bundle-Prüfung.
import { verify as verifySig } from "node:crypto";
import type { AppInfo } from "./plist";
import type { ReleaseSource } from "./sources";
export * from "./sources";

/**
 * Öffentliche Ed25519-Schlüssel (PEM, SPKI) der Suite für SHA256SUMS.sig. Heute leer (Konzept „Noch offen“ 1).
 * Höchstens zwei (alt + neu beim Schlüsselwechsel).
 */
export const SUITE_PUBLIC_KEYS: readonly string[] = [];
/** Ohne gültige Signatur nichts installieren (Konzept Entscheidung 6). Heute false, bis die Releases signiert sind. */
export const REQUIRE_SIGNATURE = false;

export const MAX_DOWNLOAD = 600 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);

export interface ReleaseInfo {
  version: string;
  tag: string;
  asset: string;
  /** Download des passenden Pakets; null, wenn es für diesen Rechner keins gibt. */
  url: string | null;
  size: number;
  /** SHA-256 laut GitHub (`digest`), klein; null = unbekannt → nicht installieren, nur Seite öffnen. */
  sha256: string | null;
  page: string;
  notes: string;
  prerelease: boolean;
  sumsUrl: string | null;
  sigUrl: string | null;
}

/** „sha256:<64 Hex>“ → Hex klein; alles andere → null. (VJ-Link) */
export function parseDigest(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const m = /^sha256:([0-9a-f]{64})$/i.exec(d.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** SHA256SUMS (Zeilen „<hex>  <datei>“) → Datei → Hex. (VJ-Link) */
export function parseSums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/i.exec(line.trim());
    if (m) out.set(m[2]!.trim(), m[1]!.toLowerCase());
  }
  return out;
}

/** Ist `u` eine erlaubte Download-Adresse? Nur https, nur GitHub-Hosts, ohne Zugangsdaten, Standardport. */
export function allowedUrl(u: string): boolean {
  let x: URL;
  try { x = new URL(u); } catch { return false; }
  return x.protocol === "https:" && ALLOWED_HOSTS.has(x.hostname) && !x.username && !x.password && (x.port === "" || x.port === "443");
}

/** Gehört die Download-Adresse zum Repo aus der Liste? (github.com/<repo>/releases/download/… oder die API-Assets.) */
export function urlBelongsToRepo(u: string, repo: string): boolean {
  if (!allowedUrl(u)) return false;
  const x = new URL(u);
  const p = decodeURIComponent(x.pathname).toLowerCase();
  const r = repo.toLowerCase();
  if (x.hostname === "github.com") return p.startsWith(`/${r}/releases/download/`) && !p.includes("/../");
  if (x.hostname === "api.github.com") return p.startsWith(`/repos/${r}/releases/`) && !p.includes("/../");
  return false;
}

/** Releaseseite nur aus dem eigenen Repo. */
export function pageFor(u: unknown, repo: string): string {
  const fallback = `https://github.com/${repo}/releases`;
  if (typeof u !== "string" || !allowedUrl(u)) return fallback;
  const x = new URL(u);
  return x.hostname === "github.com" && x.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/releases`) ? x.toString() : fallback;
}

/** Antwort von GitHub (releases/latest) für eine Quelle auslesen (aus VJ-Link pickRelease, je Programm). */
export function pickRelease(json: unknown, src: ReleaseSource, platform: string, arch: string): ReleaseInfo | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown; prerelease?: unknown; draft?: unknown };
  if (r.draft === true) return null;
  const tag = typeof r.tag_name === "string" && r.tag_name.length <= 40 ? r.tag_name : "";
  const version = tag.replace(/^v/i, "");
  if (!/^[0-9][0-9A-Za-z.-]{0,30}$/.test(version)) return null;
  const want = src.asset(platform, arch, version);
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown; size?: unknown; digest?: unknown }[]) : [];
  const link = (x: { browser_download_url?: unknown } | undefined) =>
    x && typeof x.browser_download_url === "string" && urlBelongsToRepo(x.browser_download_url, src.repo) ? x.browser_download_url : null;
  const a = want ? assets.find(x => x.name === want) : undefined;
  const notes = typeof r.body === "string" ? r.body.replace(/\r/g, "").trim().slice(0, 4000) : "";
  return {
    version, tag, asset: want ?? "", url: link(a),
    size: a && typeof a.size === "number" && Number.isSafeInteger(a.size) && a.size > 0 ? a.size : 0,
    sha256: parseDigest(a?.digest),
    page: pageFor(r.html_url, src.repo), notes, prerelease: r.prerelease === true,
    sumsUrl: link(assets.find(x => x.name === "SHA256SUMS")), sigUrl: link(assets.find(x => x.name === "SHA256SUMS.sig")),
  };
}

/** Größe passt zur Angabe von GitHub und zur Obergrenze. */
export function sizeOk(actual: number, expected: number, max = MAX_DOWNLOAD): boolean {
  return expected > 0 && expected <= max && actual === expected;
}

export type SigResult = "absent" | "nokey" | "valid" | "invalid";

/**
 * Signierte Prüfsummenliste prüfen. `absent`: SHA256SUMS/.sig fehlen im Release. `nokey`: kein Suite-Schlüssel
 * bekannt. `valid`: ein Schlüssel bestätigt die Signatur und der Eintrag für `asset` ist `hash`. Sonst `invalid`.
 */
export function checkSignature(sums: Buffer | null, sig: Buffer | null, keys: readonly string[], asset: string, hash: string): SigResult {
  if (!sums || !sig) return "absent";
  if (!keys.length) return "nokey";
  if (sums.length > 64_000 || sig.length > 1_000) return "invalid";
  const okSig = keys.some(k => { try { return verifySig(null, sums, k, sig); } catch { return false; } });
  if (!okSig) return "invalid";
  return parseSums(sums.toString("utf8")).get(asset) === hash ? "valid" : "invalid";
}

export type Verdict = { ok: true } | { ok: false; reason: "nodigest" | "hash" | "size" | "signature" | "unsigned" };

/**
 * Darf installiert werden? SHA-256 = `digest` ist Pflicht (fehlt `digest`: nur „Seite öffnen“). Ist eine Signatur da
 * und ein Schlüssel bekannt, muss sie stimmen. Mit `require` ohne gültige Signatur nie.
 */
export function installVerdict(o: { expected: string | null; actual: string; sizeOk: boolean; sig: SigResult; require: boolean }): Verdict {
  if (!o.expected) return { ok: false, reason: "nodigest" };
  if (!o.sizeOk) return { ok: false, reason: "size" };
  if (o.actual !== o.expected) return { ok: false, reason: "hash" };
  if (o.sig === "invalid") return { ok: false, reason: "signature" };
  if (o.require && o.sig !== "valid") return { ok: false, reason: "unsigned" };
  return { ok: true };
}

/** Zip-Einträge (zipinfo -1): absolute Pfade, „..“-Teile, Laufwerksbuchstaben und NUL sind verboten. */
export function unsafeZipEntries(names: readonly string[]): string[] {
  return names.filter(n => !n || n.startsWith("/") || n.startsWith("\\") || /^[A-Za-z]:/.test(n) || n.includes("\0") || n.split(/[\\/]/).includes(".."));
}

/** Symlink-Ziel innerhalb des Entpack-Ordners? `linkDir` ist der Ordner des Links, alles absolut und normalisiert. */
export function symlinkInside(root: string, linkDir: string, target: string, join: (...p: string[]) => string, resolve: (...p: string[]) => string): boolean {
  if (target.startsWith("/")) return false;
  const abs = resolve(join(linkDir, target));
  return abs === root || abs.startsWith(root.endsWith("/") ? root : root + "/");
}

/** Passt die App im Image zum Programm und zur Version des Release? */
export function bundleMatches(info: AppInfo, src: ReleaseSource, appFile: string, version: string): { ok: boolean; why?: string } {
  if (src.bundleIds.length) {
    if (!src.bundleIds.includes(info.bundleId)) return { ok: false, why: `bundle id ${info.bundleId || "?"}` };
  } else if (appFile !== src.appName) return { ok: false, why: `app ${appFile}` };
  if (info.version !== version) return { ok: false, why: `version ${info.version || "?"} ≠ ${version}` };
  return { ok: true };
}
