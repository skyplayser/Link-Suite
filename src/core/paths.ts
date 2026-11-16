// Pfade für die Einstellungen: Ordner unter dem Benutzerordner als „~/…“, alles andere absolut.
import path from "node:path";

/** posix oder win32 (für Tests beider Systeme auf jeder Plattform). */
type PlatformPath = typeof path.win32;

/** Absoluten Pfad zum Speichern: unter `home` → „~/rest“, sonst absolut (normalisiert). Ungültig → null. */
export function toStoredPath(abs: string, home: string, P: PlatformPath = path): string | null {
  if (typeof abs !== "string" || !P.isAbsolute(abs)) return null;
  const p = P.resolve(abs);
  const h = P.resolve(home);
  const rel = P.relative(h, p); // Windows: vergleicht ohne Groß-/Kleinschreibung (auch beim Laufwerk)
  if (rel === "") return "~";
  if (rel !== ".." && !rel.startsWith(".." + P.sep) && !P.isAbsolute(rel)) return "~/" + rel.split(P.sep).join("/");
  return p;
}

/** Gespeicherten Pfad lesen: „~“ / „~/rest“ → unter `home`, absolut → wie er ist, sonst (relativ, kaputt) null. */
export function fromStoredPath(stored: unknown, home: string, P: PlatformPath = path): string | null {
  if (typeof stored !== "string" || !stored || stored.length > 1024 || stored.includes("\0")) return null;
  if (stored === "~") return P.resolve(home);
  if (stored.startsWith("~/")) {
    const p = P.resolve(home, stored.slice(2));
    // „~/../x“ darf nicht aus dem Benutzerordner hinaus
    const rel = P.relative(P.resolve(home), p);
    return rel === ".." || rel.startsWith(".." + P.sep) || P.isAbsolute(rel) ? null : p;
  }
  // Windows: „C:x“ (laufwerksrelativ) ist nicht absolut und fällt hier heraus
  return P.isAbsolute(stored) && !(P.sep === "\\" && /^[A-Za-z]:(?![\\/])/.test(stored)) ? P.resolve(stored) : null;
}
