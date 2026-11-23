// Kennungen, die die Oberfläche über die Brücke (preload.ts) schicken darf. Abgeleitet aus dem Katalog und den
// Release-Quellen, nie von Hand gepflegt: 1.0.5 kannte die Brücke Crew Link nicht, „Installieren“ blieb stumm (1.0.6).
// Ohne Node-Module, damit es im Preload (Sandbox) gebündelt werden kann.
import { CATALOG } from "../core/catalog";
import { SOURCES } from "../core/sources";

export const PROGRAM_IDS: ReadonlySet<string> = new Set(CATALOG.map(p => p.id));
export const SOURCE_IDS: ReadonlySet<string> = new Set(Object.keys(SOURCES));

/** Programm-Kennung aus dem Katalog, sonst "". */
export function progArg(v: unknown): string {
  return typeof v === "string" && PROGRAM_IDS.has(v) ? v : "";
}

/**
 * Kennung für Installieren/Abbrechen/Seite: Release-Quellen; dazu Programme aus dem Katalog ohne Quelle, damit der
 * Hauptprozess sie mit Namen ablehnen kann (nie mehr stumm). Alles andere wird "".
 */
export function srcArg(v: unknown): string {
  return typeof v === "string" && (SOURCE_IDS.has(v) || PROGRAM_IDS.has(v)) ? v : "";
}
