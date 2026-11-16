// Was einem Entwicklerprojekt zum Start fehlt (ohne Dateisystem, auch für die Oberfläche).

export type NeedKey = "folder" | "package" | "suite" | "script" | "modules" | "electron" | "electronOutside" | "built";
export interface NeedItem { key: NeedKey; have: boolean }

/** Kurzform „– fehlt: package.json“ für „Kommt bald“: die erste Lücke. */
export function firstMissing(a: { need: readonly NeedItem[] }): NeedKey | null {
  return a.need.find(n => !n.have)?.key ?? null;
}
