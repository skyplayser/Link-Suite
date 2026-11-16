// Info.plist einer App lesen: Ausgabe von `/usr/bin/plutil -convert json -o - <app>/Contents/Info.plist`
// (liest XML und binär, Recherche „Starten (0.1)“ 1). Hier nur die Auswertung, ohne Dateisystem.
import { programByAppName, programByBundleId, type Program } from "./catalog";

export interface AppInfo {
  bundleId: string;
  version: string;
  executable: string;
  name: string;
}

const str = (v: unknown, max = 200): string => (typeof v === "string" && v.length <= max ? v : "");

/** JSON von plutil → die Felder, die der Launcher braucht; kaputt oder ohne Kennung und Namen → null. */
export function parsePlistJson(text: string): AppInfo | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const info: AppInfo = {
    bundleId: str(o.CFBundleIdentifier),
    version: str(o.CFBundleShortVersionString, 40) || str(o.CFBundleVersion, 40),
    executable: str(o.CFBundleExecutable),
    name: str(o.CFBundleDisplayName) || str(o.CFBundleName),
  };
  if (!info.bundleId && !info.name) return null;
  return info;
}

/**
 * Gehört diese App zu einem Programm der Liste? Mit Kennung: die Kennung entscheidet (auch umbenannte Apps).
 * Programme ohne bekannte Kennung (LJL Link) nur über den Namen des Bundles.
 */
export function matchProgram(info: AppInfo, bundleFile: string): Program | null {
  if (info.bundleId) {
    const p = programByBundleId(info.bundleId);
    if (p) return p;
  }
  const byName = programByAppName(bundleFile);
  if (!byName || byName.bundleIds.length) return null;
  // Ohne bekannte Kennung (LJL Link) nicht nur am Dateinamen: Name bzw. Programm im Bundle muss passen (QA 0.1 Nr. 13)
  const norm = (x: string) => x.toLowerCase().replace(/[\s_-]+/g, "");
  const want = norm(byName.name);
  return norm(info.name) === want || norm(info.executable) === want ? byName : null;
}
