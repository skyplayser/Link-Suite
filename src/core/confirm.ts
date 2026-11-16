// Rückfrage vor dem Skript-Weg (npm run dev / npm start), gestellt vom Hauptprozess selbst (QA Runde 2, N1):
// Die Oberfläche kann den Skript-Weg nur anstoßen, nie bestätigen. Hier nur Texte und Prüfsumme, ohne Electron.
import { createHash } from "node:crypto";
import { translate, type Lang } from "./i18n";

export interface ScriptRef { realDir: string; script: string | null; scriptCmd: string; scriptText: string }

/** Prüfsumme über Programm, realen Ordner und Skript: ändert sich package.json während der Rückfrage, wird nicht gestartet. */
export function scriptHash(id: string, a: ScriptRef): string {
  return createHash("sha256").update(JSON.stringify([id, a.realDir, a.script, a.scriptCmd, a.scriptText])).digest("hex");
}

export interface ConfirmSpec {
  type: "warning";
  message: string;
  detail: string;
  /** [Abbrechen, Trotzdem starten]; Abbrechen ist Standard und Abbruch. */
  buttons: [string, string];
  defaultId: 0;
  cancelId: 0;
}

/** Texte für dialog.showMessageBox: Programm, Ordner, Befehl und Skripttext, ehrlich zu dem, was das Skript darf. */
export function buildConfirm(lang: Lang, name: string, a: ScriptRef): ConfirmSpec {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const detail = [
    t("ask.sub", { name, dir: a.realDir }),
    "",
    t("ask.build.text", { cmd: a.scriptCmd, name }),
    `${a.realDir} $ ${a.scriptCmd}`,
    `→ ${a.scriptText}`,
    "",
    `• ${t("ask.build.dist")}`,
    `• ${t("ask.build.src")}`,
    "",
    t("ask.build.log"),
  ].join("\n");
  return { type: "warning", message: t("ask.title"), detail, buttons: [t("common.cancel"), t("ask.anyway")], defaultId: 0, cancelId: 0 };
}
