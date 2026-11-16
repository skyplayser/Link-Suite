// Screenshots aller Bildschirme im Demo-Modus nach shots/ (für QA und Website). Startet die gebaute App je Bild einmal.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";

const electron = createRequire(import.meta.url)("electron");
const SHOTS = [
  ["programme-nacht", ["--tab=programs", "--theme=dark", "--lang=de", "--open=vj", "--run=vj"]],
  ["programme-tag", ["--tab=programs", "--theme=light", "--lang=de"]],
  ["programme-en", ["--tab=programs", "--theme=dark", "--lang=en", "--menu=vd"]],
  ["im-netz", ["--tab=network", "--theme=dark", "--lang=de"]],
  ["im-netz-tag", ["--tab=network", "--theme=light", "--lang=en"]],
  ["club-stick", ["--tab=stick", "--theme=dark", "--lang=de"]],
  ["einstellungen", ["--tab=settings", "--theme=dark", "--lang=de"]],
  ["einstellungen-tag", ["--tab=settings", "--theme=light", "--lang=en"]],
  ["chat", ["--tab=programs", "--theme=dark", "--lang=de", "--chat"]],
  ["startanimation", ["--theme=dark", "--lang=de", "--intro=1300"]],
];
fs.mkdirSync("shots", { recursive: true });
let failed = 0;
for (const [name, args] of SHOTS) {
  const r = spawnSync(electron, [".", "--demo", `--shot=shots/${name}.png`, ...args], { stdio: "inherit", timeout: 60_000 });
  if (r.status !== 0) { failed++; console.error(`shots: ${name} fehlgeschlagen (${r.status})`); }
}
process.exit(failed ? 1 : 0);
