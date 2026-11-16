// Versionsvergleich. `isNewer` übernommen aus VJ-Link src/core/update.ts (EPL-2.0), unverändert.

/** Ist `candidate` neuer als `current`? (1.10.0 > 1.9.2, „v“ davor egal, Vorabversionen zählen nach Zahlen.) */
export function isNewer(candidate: string | null | undefined, current: string | null | undefined): boolean {
  if (!candidate || !current) return false;
  const parts = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map(x => Number.parseInt(x.replace(/\D/g, ""), 10) || 0);
  const a = parts(candidate), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Die neueste von mehreren Versionen (leere zählen nicht); null, wenn keine da ist. */
export function newest(versions: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of versions) if (v && (!best || isNewer(v, best))) best = v;
  return best;
}
