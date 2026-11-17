// Quellen der Releases je Programm (Version 0.2+): ohne Node-Module, damit auch die Oberfläche sie nutzen kann
// (QA 0.3 Nr. 9: kein node:crypto im Renderer-Bundle). Prüflogik mit Krypto: release.ts.
/** Repo des Launchers selbst (Selbst-Update). Bei 404: „noch keine Veröffentlichung“. */
export const LAUNCHER_REPO = "skyplayser/Link-Suite";
export const LAUNCHER_BUNDLE_ID = "de.nextphilm.linksuite";

export type Kind = "dmg" | "zip" | "exe";
export type SourceId = "lj" | "vj" | "vd" | "ljl" | "suite";

export interface ReleaseSource {
  id: SourceId;
  name: string;
  repo: string;
  /** macOS-Kennungen, die im Image stehen dürfen; leer = über den Namen (LJL Link). */
  bundleIds: string[];
  /** Name der App im Image bzw. Zip (nur für Quellen ohne Kennung). */
  appName?: string;
  /** Datei für Plattform/Chip; null = gibt es hier nicht. `version` für Namen mit Version (LJL Link). */
  asset(platform: string, arch: string, version: string): string | null;
}

const triple = (base: string) => (platform: string, arch: string): string | null =>
  platform === "darwin" ? `${base}-macos-${arch === "arm64" ? "arm64" : "intel"}.dmg` : platform === "win32" ? `${base}-windows.exe` : null;

/** Quellen der Programme mit öffentlichen Releases (Stand 16.11.2026). VD-Link ist seit 1.0.0 öffentlich; Intel heißt dort „x64“. */
export const SOURCES: Readonly<Record<SourceId, ReleaseSource>> = {
  lj: { id: "lj", name: "LJ Link", repo: "skyplayser/LJ-Link", bundleIds: ["dev.ljlinkpro"], asset: triple("LJ-Link") },
  vj: { id: "vj", name: "VJ-Link", repo: "skyplayser/VJ-LINK", bundleIds: ["de.nextphilm.vjlink"], asset: triple("VJ-Link") },
  vd: {
    id: "vd", name: "VD-Link", repo: "skyplayser/VD-Link", bundleIds: ["de.nextphilm.vdlink"],
    asset: (platform, arch) => (platform === "darwin" ? `VD-Link-macos-${arch === "arm64" ? "arm64" : "x64"}.dmg` : platform === "win32" ? "VD-Link-windows.exe" : null),
  },
  ljl: {
    id: "ljl", name: "LJL Link", repo: "skyplayser/LJL-Link", bundleIds: [], appName: "LJL Link.app",
    asset: (platform, _arch, version) => (platform === "darwin" && /^[0-9][0-9A-Za-z.-]{0,30}$/.test(version) ? `LJL-Link-${version}-macOS.zip` : null),
  },
  suite: { id: "suite", name: "Link-Suite", repo: LAUNCHER_REPO, bundleIds: [LAUNCHER_BUNDLE_ID], asset: triple("Link-Suite") },
};

/** Programme, deren Releases es geben wird, die aber noch nicht öffentlich sind (seit 1.0.0 keins mehr). */
export const SOON_PUBLIC: ReadonlySet<string> = new Set<string>();

/**
 * Katalog-Version für den Release-Zwischenspeicher (1.0.1): erhöhen, wenn sich die Quelle eines Programms ändert
 * (Repo, Dateinamen). Neue Programme erkennt der Zwischenspeicher auch ohne Erhöhung (Liste `checked`).
 * 1 = bis 1.0.0 (ohne Angabe), 2 = ab 1.0.1.
 */
export const CATALOG_VERSION = 2;

/**
 * Welche Programme muss der Start sofort prüfen, weil der Zwischenspeicher sie nicht kennt? Alter Speicher (ohne
 * Katalog-Version): alle, die keinen Eintrag haben. Andere Katalog-Version: alle. Sonst: alle außer `checked`.
 */
export function staleSources(cache: { catalog?: unknown; checked?: unknown; entries?: Record<string, unknown> } | undefined): SourceId[] {
  const ids = Object.keys(SOURCES) as SourceId[];
  if (!cache) return [];
  const entries = cache.entries && typeof cache.entries === "object" ? cache.entries : {};
  let known: Set<string>;
  if (cache.catalog === undefined) known = new Set(Object.keys(entries));
  else if (cache.catalog !== CATALOG_VERSION) known = new Set();
  else known = new Set(Array.isArray(cache.checked) ? cache.checked.filter((x): x is string => typeof x === "string") : Object.keys(entries));
  return ids.filter(id => !known.has(id));
}

export function sourceById(id: unknown): ReleaseSource | null {
  return typeof id === "string" && Object.hasOwn(SOURCES, id) ? SOURCES[id as SourceId] : null;
}

export function kindOf(asset: string): Kind | null {
  return asset.endsWith(".dmg") ? "dmg" : asset.endsWith(".zip") ? "zip" : asset.endsWith(".exe") ? "exe" : null;
}
