// Baut aus der unveränderten Kopie der gemeinsamen Startanimation (vendor/startanimation/startanimation.html, Quelle:
// Link-Suite/Konzepte/_Startanimation) ein Modul für die Oberfläche. Grund: Die CSP des Launchers erlaubt keine
// Inline-Skripte und -Styles. Ablauf, Zeiten, Regeln und Bilder bleiben, wie sie sind; das Modul legt die Animation in
// einen Shadow-Root (keine Namenskonflikte mit launcher.css) und schickt am Ende wie das Original
// `linksuite-intro-done` an window. Änderungen (alle hier geprüft, sonst bricht der Bau ab):
//  - `<style>` → startanimation.css (geladen per <link> aus dem eigenen Paket), `:root`/`html,body` → `:host`,
//    `.under` (Platzhalter-Startbildschirm) und `.bar` (Prüfleiste) ausgeblendet – darunter liegt das echte PROGRAMME.
//  - `document.getElementById/querySelector` → Shadow-Root; `location.search` → `?app=<app>&ui=0`.
//  - Text „Überspringen: Taste oder Klick“ über i18n.
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("vendor/startanimation/startanimation.html");
const outDir = path.resolve("src/renderer/intro");
const html = fs.readFileSync(src, "utf8");

const one = (re, what) => {
  const m = re.exec(html);
  if (!m) throw new Error(`make-intro: ${what} nicht gefunden – hat sich startanimation.html geändert?`);
  return m[1];
};
const must = (s, a, b, what) => {
  if (!s.includes(a)) throw new Error(`make-intro: ${what} nicht gefunden`);
  return s.split(a).join(b);
};

let css = one(/<style>([\s\S]*?)<\/style>/, "<style>");
css = must(css, ":root{", ":host{", ":root");
css = must(css, "html,body{", ":host{", "html,body");
css += "\n/* Link-Suite: Platzhalter und Prüfleiste aus, darunter liegt das echte Programm */\n.under,.bar{display:none!important}\n";

let body = one(/<body>([\s\S]*?)<script>/, "<body>");
body = must(body, '<div class="skip" id="skip">Überspringen: <kbd>Taste</kbd> oder Klick</div>',
  '<div class="skip" id="skip"><span data-k="intro.skip"></span> <kbd data-k="intro.key"></kbd> <span data-k="intro.or"></span></div>', "Überspringen-Text");

let js = one(/<script>([\s\S]*?)<\/script>/, "<script>");
js = must(js, "new URLSearchParams(location.search)", "new URLSearchParams(QUERY)", "location.search");
js = js.split("document.getElementById(").join("root.getElementById(");
js = js.split("document.querySelector(").join("root.querySelector(");
if (/\bdocument\.(getElementById|querySelector)\(/.test(js)) throw new Error("make-intro: Dokumentzugriff übrig");
if (!js.includes("dispatchEvent(new CustomEvent('linksuite-intro-done'")) throw new Error("make-intro: Ereignis linksuite-intro-done fehlt");

const head = `// ERZEUGT von scripts/make-intro.mjs aus vendor/startanimation/startanimation.html – nicht von Hand ändern.
// Quelle: Link-Suite/Konzepte/_Startanimation (gemeinsame Startanimation der Suite).
/* eslint-disable */
import cssUrl from "./startanimation.css?url";

const MARKUP = ${JSON.stringify(body.trim())};

/** Startanimation als Schicht in \`host\` (Shadow-Root). \`app\`: suite | lj | vj | vd | pl | net | cr | db. */
export function mountIntro(host, app, text) {
  const root = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl;
  // Bis die Styles da sind, nichts zeigen (sonst blitzt der Platzhalter ungestaltet auf); die Schicht deckt ab.
  const shadowBox = document.createElement("div");
  shadowBox.style.visibility = "hidden";
  link.addEventListener("load", () => { shadowBox.style.visibility = ""; }, { once: true });
  root.append(link, shadowBox);
  const wrap = document.createElement("div");
  wrap.innerHTML = MARKUP;
  shadowBox.append(...wrap.childNodes);
  for (const el of root.querySelectorAll("[data-k]")) el.textContent = text(el.getAttribute("data-k"));
  const QUERY = "?app=" + encodeURIComponent(app) + "&ui=0";
`;
const tail = `
}
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "startanimation.css"), "/* ERZEUGT von scripts/make-intro.mjs – nicht von Hand ändern. */\n" + css);
fs.writeFileSync(path.join(outDir, "startanimation.js"), head + js + tail);
fs.writeFileSync(path.join(outDir, "startanimation.d.ts"), "// ERZEUGT von scripts/make-intro.mjs.\nexport function mountIntro(host: HTMLElement, app: string, text: (key: string) => string): void;\n");
console.log("make-intro: src/renderer/intro/startanimation.{js,css} erzeugt");
