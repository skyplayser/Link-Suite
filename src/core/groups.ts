// Gruppen der Programmkarten (INSTALLIERT, ENTWICKLUNG, VERFÜGBAR, KOMMT BALD) und wann umsortiert werden darf.
// 1.0.1 (Windows-Realtest 1.0.0 Befund 2): Ein neu installiertes Programm wechselt nach „Installiert“ – auch wenn es
// von außen installiert wurde –, aber nie unter dem Mauszeiger: beim nächsten ruhigen Moment bzw. sofort nach dem Ende
// einer eigenen Installation. Reine Logik, getestet.

export type Group = "installed" | "dev" | "avail" | "soon";
export const GROUPS: readonly Group[] = ["installed", "dev", "avail", "soon"];

/** Fenster im Hintergrund und so lange ohne Eingabe: ruhig, auch wenn der Zeiger noch über den Karten steht. */
export const CALM_MS = 2500;

export interface GroupInput {
  /** Installierte App gefunden. */
  app: boolean;
  /** Entwicklerweg vorhanden oder ein Entwicklerstart läuft. */
  dev: boolean;
  /** Nur auf den Stick (LJL Link): immer „Verfügbar“. */
  stickOnly: boolean;
  /** Ein Release ist bekannt (auch aus dem Zwischenspeicher). */
  release: boolean;
}

export function groupFor(x: GroupInput): Group {
  if (x.app) return "installed";
  if (x.dev) return "dev";
  if (x.stickOnly || x.release) return "avail";
  return "soon";
}

export interface RegroupInput {
  /** Neu sortieren ohne Rücksicht (erster Suchlauf, Entwickleransicht umgeschaltet, eigene Installation fertig). */
  force: boolean;
  /** Ein Programm hat noch gar keine Gruppe. */
  fresh: boolean;
  /** Mindestens ein Programm gehört jetzt in eine andere Gruppe. */
  differs: boolean;
  /** Zeiger über dem Raster. */
  hovering: boolean;
  /** Ein ⋯-Menü ist offen. */
  menuOpen: boolean;
  /** Das Fenster hat den Fokus. */
  focused: boolean;
  /** Zeit seit der letzten Eingabe (Maus, Rad, Tasten) in ms. */
  idleMs: number;
}

/**
 * Darf jetzt umsortiert werden? Nie bei offenem Menü und nie unter dem Mauszeiger des Nutzers. Steht der Zeiger nur noch
 * über dem Raster, während ein anderes Fenster vorn ist (z. B. der Installer), gilt das nach CALM_MS als ruhig.
 */
export function mayRegroup(x: RegroupInput): boolean {
  if (x.force || x.fresh) return true;
  if (!x.differs || x.menuOpen) return false;
  return !x.hovering || (!x.focused && x.idleMs >= CALM_MS);
}
