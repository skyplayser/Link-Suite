// Eingebaute Liste der Suite-Programme (Konzept „Die Programme der Suite“, Stand 15.11.2026).
// Nur diese Programme zeigt und startet der Launcher. Keine Liste aus dem Netz.

export type ProgramId = "lj" | "ljl" | "vj" | "vd" | "net" | "crew" | "pl" | "db";

/** Stand des Programms: veröffentlicht, Beta, Alpha, in Entwicklung (noch kein Release), Konzept. */
export type Stage = "release" | "beta" | "alpha" | "dev" | "concept";

export interface Program {
  id: ProgramId;
  name: string;
  /** Datei in public/icons/. */
  icon: string;
  line: { de: string; en: string };
  /** macOS-Kennungen (CFBundleIdentifier). Leer: nur über den Namen der App zu finden (LJL Link). */
  bundleIds: string[];
  /** Namen der App-Bundles, auch Altnamen (LJ-Link-PRO.app). */
  appNames: string[];
  /** Entwicklerordner ab Werk (gespeichert als „~/…“). Fehlt: kein Entwicklerstart (Java/Swift). */
  devDir?: string;
  /** `name` in package.json des Entwicklerprojekts (Prüfung „gehört zur Suite“, Recherche E3). */
  pkgName?: string;
  /** Mögliche Lage der gebauten Oberfläche im Projekt (eine muss da sein, sonst „nicht gebaut“). */
  renderer?: string[];
  stage: Stage;
  /** Veröffentlichte Version laut Konzept (nur Anzeige, 0.1 fragt GitHub nicht). */
  knownRelease?: string;
  /** Läuft nur vom Club-Stick (LJL Link). */
  stickOnly?: boolean;
  /** Steht unter „Kommt bald“ (noch kein Release), in dieser Reihenfolge. */
  soon?: number;
  /** Windows: Anzeigename in der Registry (Uninstall-Schlüssel). */
  winName?: string;
}

const RENDERER_DEFAULT = ["dist/index.html", "dist/renderer/index.html"];

export const CATALOG: readonly Program[] = [
  {
    id: "lj", name: "LJ Link", icon: "lj-link.svg",
    line: { de: "Alle Decks, Wellenformen und Cues für die Booth.", en: "All decks, waveforms and cues for the booth." },
    bundleIds: ["dev.ljlinkpro"], appNames: ["LJ Link.app", "LJ-Link-PRO.app", "LJ-Link.app"],
    stage: "release", knownRelease: "1.7.11", winName: "LJ Link",
  },
  {
    id: "vj", name: "VJ-Link", icon: "vj-link.svg",
    line: { de: "Visuals, gesteuert vom Lichtpult.", en: "Visuals your lighting desk controls." },
    bundleIds: ["de.nextphilm.vjlink"], appNames: ["VJ-Link.app"],
    devDir: "~/VJ-Link", pkgName: "vj-link", renderer: ["dist/renderer/index.html"],
    stage: "beta", knownRelease: "0.1.8", winName: "VJ-Link",
  },
  {
    id: "vd", name: "VD-Link", icon: "vd-link.svg",
    line: { de: "3D-Lichtvisualisierer für Art-Net und sACN.", en: "3D lighting visualiser for Art-Net and sACN." },
    bundleIds: ["de.nextphilm.vdlink"], appNames: ["VD-Link.app"],
    devDir: "~/VD-Link", pkgName: "vd-link", renderer: ["dist/index.html"],
    stage: "beta", knownRelease: "0.2.0", winName: "VD-Link",
  },
  {
    id: "ljl", name: "LJL Link", icon: "ljl-link-256.png",
    line: { de: "Serato-Decks vom Stick des Clubs in LJ Link.", en: "Serato decks from the club stick into LJ Link." },
    bundleIds: [], appNames: ["LJL Link.app", "LJL-Link.app"],
    stage: "alpha", knownRelease: "0.3.1", stickOnly: true,
  },
  {
    id: "net", name: "NET Link", icon: "net-link.svg",
    line: { de: "Wer ist im Show-Netz?", en: "Who is on the show network?" },
    bundleIds: ["de.nextphilm.netlink"], appNames: ["NET Link.app", "NET-Link.app"],
    devDir: "~/NET-Link", pkgName: "net-link", renderer: RENDERER_DEFAULT,
    stage: "dev", soon: 1, winName: "NET Link",
  },
  {
    id: "crew", name: "Crew Link", icon: "crew-link.svg",
    line: { de: "Timetable der Nacht.", en: "Tonight's timetable." },
    bundleIds: ["de.nextphilm.crewlink"], appNames: ["Crew Link.app", "Crew-Link.app"],
    devDir: "~/Crew-Link", pkgName: "crew-link", renderer: RENDERER_DEFAULT,
    stage: "concept", soon: 2, winName: "Crew Link",
  },
  {
    id: "pl", name: "PL Link", icon: "pl-link.svg",
    line: { de: "Patch und Stromlast.", en: "Patch and power load." },
    bundleIds: ["de.nextphilm.pllink"], appNames: ["PL Link.app", "PL-Link.app"],
    devDir: "~/PL-Link", pkgName: "pl-link", renderer: RENDERER_DEFAULT,
    stage: "concept", soon: 3, winName: "PL Link",
  },
  {
    id: "db", name: "dB Link", icon: "db-link.svg",
    line: { de: "Lautstärke nach DIN 15905-5.", en: "Sound levels to DIN 15905-5." },
    bundleIds: ["de.nextphilm.dblink"], appNames: ["dB Link.app", "dB-Link.app", "DB Link.app"],
    devDir: "~/dB-Link", pkgName: "db-link", renderer: RENDERER_DEFAULT,
    stage: "concept", soon: 4, winName: "dB Link",
  },
];

/** Reihenfolge der großen Karten (Design: LJ Link, VJ-Link, VD-Link, LJL Link). */
export const MAIN_ORDER: readonly ProgramId[] = ["lj", "vj", "vd", "ljl"];

const BY_ID = new Map<string, Program>(CATALOG.map(p => [p.id, p]));

/** Kennung aus dem Renderer prüfen: nur Kennungen aus der Liste, sonst null. */
export function programById(id: unknown): Program | null {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}

export function isProgramId(id: unknown): id is ProgramId {
  return programById(id) !== null;
}

/** Programm zu einer macOS-Kennung. */
export function programByBundleId(bundleId: string): Program | null {
  return CATALOG.find(p => p.bundleIds.includes(bundleId)) ?? null;
}

/** Programm zum Namen eines App-Bundles (für Treffer ohne bekannte Kennung, z. B. LJL Link auf dem Stick). */
export function programByAppName(file: string): Program | null {
  return CATALOG.find(p => p.appNames.some(n => n.toLowerCase() === file.toLowerCase())) ?? null;
}

/** Programm zum `app`-Feld aus dem Suite-Chat („VJ-Link“, „LJ Link“ …). „Link-Suite“ ist der Launcher selbst. */
export function programByChatApp(app: string): Program | null {
  const k = app.toLowerCase().replace(/[\s-]+/g, "");
  return CATALOG.find(p => p.name.toLowerCase().replace(/[\s-]+/g, "") === k) ?? null;
}

/** Programme unter „Kommt bald“, in Release-Reihenfolge. */
export function soonPrograms(): Program[] {
  return CATALOG.filter(p => p.soon !== undefined).sort((a, b) => (a.soon ?? 0) - (b.soon ?? 0));
}
