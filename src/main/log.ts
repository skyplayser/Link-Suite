// Startlog für Tester ohne Konsole: <userData>/logs/main.log, klein und rotiert (main.log → main.log.1 ab 256 KB).
// Nur Ereignisse und Fehler: Version, Plattform, Fenster, Ladefehler, Absturz des Renderers, Ausnahmen. Keine Chat-Texte,
// keine Namen; Pfade unter dem Benutzerordner werden als „~“ geschrieben.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX = 256 * 1024;
let file = "";

export function initLog(dir: string): string {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, "main.log");
    try { if (fs.statSync(file).size > MAX) fs.renameSync(file, file + ".1"); } catch { /* neu */ }
  } catch { file = ""; }
  return file;
}

const home = os.homedir();
/** Benutzerordner kürzen, Zeilenumbrüche raus, Länge begrenzen. */
export function scrub(s: string): string {
  let out = String(s);
  if (home && home.length > 1) out = out.split(home).join("~");
  return out.replace(/[\r\n]+/g, " ⏎ ").slice(0, 600);
}

export function log(event: string, detail = ""): void {
  const line = `${new Date().toISOString()} ${event}${detail ? " " + scrub(detail) : ""}\n`;
  if (!file) return;
  try {
    fs.appendFileSync(file, line);
    if (fs.statSync(file).size > MAX) fs.renameSync(file, file + ".1");
  } catch { /* ohne Log weiter */ }
}
