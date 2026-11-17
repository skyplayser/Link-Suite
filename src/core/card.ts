// Angaben auf der Programmkarte, ohne DOM (getestet).
// 1.0.1 (Windows-Test 1.0.1): Während „Alle prüfen“ steht jede Prüfung auf „checking“; der Pfeil „1.7.11 → 1.7.12“ las die
// Zielversion aber nur bei „ok“ und stürzte mit „Cannot read properties of null (reading 'version')“ ab. Pfeil und
// Pille hängen jetzt an derselben Angabe.
import { isNewer } from "./version";

/** Zielversion eines fälligen Updates oder null (kein Update, nichts installiert, nur vom Stick). */
export function updateTarget(latest: { version: string } | null | undefined, appVersion: string | null | undefined, stickOnly: boolean): string | null {
  if (!latest || !appVersion || stickOnly) return null;
  return isNewer(latest.version, appVersion) ? latest.version : null;
}
