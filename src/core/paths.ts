// Pfade für die Einstellungen: Ordner unter dem Benutzerordner als „~/…“, alles andere absolut.
import path from "node:path";

/** Absoluten Pfad zum Speichern: unter `home` → „~/rest“, sonst absolut (normalisiert). Ungültig → null. */
export function toStoredPath(abs: string, home: string): string | null {
  if (typeof abs !== "string" || !path.isAbsolute(abs)) return null;
  const p = path.resolve(abs);
  const h = path.resolve(home);
  if (p === h) return "~";
  const rel = path.relative(h, p);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return "~/" + rel.split(path.sep).join("/");
  return p;
}

/** Gespeicherten Pfad lesen: „~“ / „~/rest“ → unter `home`, absolut → wie er ist, sonst (relativ, kaputt) null. */
export function fromStoredPath(stored: unknown, home: string): string | null {
  if (typeof stored !== "string" || !stored || stored.length > 1024 || stored.includes("\0")) return null;
  if (stored === "~") return path.resolve(home);
  if (stored.startsWith("~/")) {
    const p = path.resolve(home, stored.slice(2));
    // „~/../x“ darf nicht aus dem Benutzerordner hinaus
    const rel = path.relative(path.resolve(home), p);
    return rel.startsWith("..") ? null : p;
  }
  return path.isAbsolute(stored) ? path.resolve(stored) : null;
}
