# Startanimation je Programm – Einbau

> Stand: 16.11.2026 · Baustein 1.0 · Grundlage: Suite-Launcher `src/renderer/intro/launcher-intro.ts`.
> Ein Baustein für alle: LJ Link, LJL Link, VJ-Link, VD-Link, NET Link, PL Link, Crew Link, dB Link. **Nicht anpassen,
> nur aufrufen** – sonst sehen die Programme verschieden aus. Änderungen bitte hier im Suite-Launcher (`design/intro-programm/`).

## Ablauf (2,5 s, Rückfall 2,7 s)

| Zeit (ms) | Was |
|---|---|
| 0–380 | Suite-Zeichen erscheint in der Mitte |
| 320–1140 | Zeichen rückt hoch, alle acht Programme fächern auf (LJ, LJL, VJ, VD, NET, Crew, PL, dB) |
| 860–1500 | Zeichen wird zum Suite-Logo, „Link-Suite“ wischt herein |
| 1450–1950 | Die anderen Programme laufen zurück ins Suite-Zeichen, das Suite-Logo löst sich auf |
| 1480–2080 | Das geöffnete Programm fliegt (FLIP, flacher Bogen) auf sein Ziel im **echten** Startbildschirm |
| 1650–2100 | Die Fläche der Schicht wird durchsichtig, der Startbildschirm liegt darunter |
| 2060–2500 | Icon → Zeichen → Logo: das Zeichen bleibt liegen, die Kachel blendet aus, der Name wischt herein |
| 1850–2500 | Elemente des Startbildschirms (`revealTargets`) blenden gestaffelt ein (8 px von unten) |

Standbilder: `demo-vj-600.png`, `demo-vj-1200.png`, `demo-vj-1800.png`, `demo-lj-1800.png`.
Ausprobieren: `demo.html?app=vj` (weitere: `lj ljl vd net cr pl db`, `&theme=light`, `&reduced=1`, `&speed=0.25`,
`&t=1800`, `&hide=1` für den Rückfall, `&lang=en`, `&loop=1`).

## 1 · Dateien kopieren

| Datei | Wohin (Vorschlag) |
|---|---|
| `program-intro.js`, `program-intro.css` | Electron: `src/renderer/intro/` bzw. `src/ui/intro/` · LJ Link: `src/main/resources/web/intro/` |
| `program-intro.d.ts` | neben die `.js` (VJ, VD, NET, PL, Crew, dB) |
| `icons/` | `…/intro/icons/` – gebraucht: `suite-symbol.svg`, `suite-logo-{dark,light}.svg`, alle acht `*-icon.*`, das eigene `<app>-logo-{dark,light}.svg` |

Keine Abhängigkeiten, kein Bundler nötig. Der Baustein setzt nur CSSOM-Eigenschaften (`el.style.left = …`) und nutzt die
Web Animations API: **keine `style`-Attribute, kein `innerHTML`, keine Inline-Skripte.** Er läuft unter
`default-src 'self'; style-src 'self'` (geprüft: `demo.html` hat genau diese CSP).

## 2 · Schicht über den Startbildschirm legen

Im HTML **als letztes Element in `<body>`**, ohne `hidden` – sie deckt so ab dem ersten Bild ab (kein Aufblitzen):

```html
<link rel="stylesheet" href="intro/program-intro.css">
…
<div id="lsi" class="lsi-layer"><div class="lsi-bg"></div></div>
```

Wird keine Animation gezeigt, `playProgramIntro({ …, enabled: false })` aufrufen oder `#lsi` entfernen – sonst bleibt die
Fläche liegen. Farben: `.lsi-layer{--lsi-bg:var(--bg)}` auf die eigenen Tokens legen; Tag-Modus über `theme:'light'`.

## 3 · Aufrufen – Ziel übergeben, Start erst nach dem ersten Layout

```ts
import { playProgramIntro, defaultImages } from "./intro/program-intro.js";

await startScreen.rendered;                         // Startbildschirm fertig aufgebaut (auch async Teile!)
await document.fonts.ready;                         // HTML-Logos mit Text: erst messen, wenn die Schrift steht
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // erstes Layout
const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
playProgramIntro({
  layer: document.getElementById("lsi")!,
  app: "vd",
  logoTarget: () => document.querySelector(".start-logo"),
  signTarget: () => document.querySelector(".start-logo .slots"),   // nur bei HTML-Logos (Zeichen + Text)
  revealTargets: () => [...document.querySelectorAll(".start-tag, .start-grid .start-btn, .start-right > *")],
  images: defaultImages("./intro/icons/", theme, "vd"),
  theme,
  enabled: introEnabled,                            // vom Hauptprozess, siehe 5
  text: k => t(`intro.${k}`),                       // „Überspringen:“ „Taste“ „oder Klick“
});
addEventListener("linksuite-intro-done", e => focusStartScreen(), { once: true });   // detail: {app, skipped, shown}
```

**Drei Arten von Ziel** (Option `targetKind`, Standard `'logo'`):

| Ziel im Startbildschirm | Optionen | Was passiert |
|---|---|---|
| Ganzes Logo als SVG/`<img>` (NET, Crew, dB, PL) | `logoTarget` = Logo oder Behälter mit `only-dark`/`only-light` (der Baustein nimmt das sichtbare Bild) | Zeichen-Box aus der viewBox (`BRANDS`), das Icon landet mit seinem Zeichen genau darauf, Name wischt herein, am Ende übernimmt das echte Element ohne Sprung |
| HTML-Logo: Zeichen + Text (VJ, VD) | zusätzlich `signTarget` = Zeichen-Element | Icon landet mit seinem Zeichen auf dem Zeichen-Element; das **echte** Logo-Element erscheint mit `clip-path` erst nur mit Zeichen, dann wischt der echte Text herein |
| Icon-Kachel (LJ Link) | `targetKind:'icon'`; `targetPadded:true`, wenn das Ziel ein Suite-Icon **mit** Rand zeigt | Icon landet deckungsgleich auf der Kachel, 150 ms Überblendung ins echte Bild. Kleine Ziele (28 px) gehen auch |

- `logoTarget` ist eine **Funktion** und wird beim Start einmal gefragt; sie darf je nach Lage verschiedene Ziele liefern.
- Ziel fehlt, ist unsichtbar oder außerhalb des Fensters → **Rückfall**: Logo landet in der Mitte und blendet aus, erst
  dann wird die Fläche frei (≈ 2,7 s).
- Das Ziel-Element und die `revealTargets` werden vom ersten Bild an per WAAPI verborgen und am Ende freigegeben. Nichts
  davon im eigenen CSS verstecken; während der Animation trägt `<html>` die Klasse `lsi-run`.
- Fenstergröße ändert sich → Animation endet weich (150 ms). Überspringen: jede Taste außer ⌘/Strg, Klick.

## 4 · Während der Animation nicht neu rendern

Die Animation hält Verweise auf die echten Elemente. Wer in dieser Zeit `replaceChildren()`/`innerHTML` auf den
Startbildschirm anwendet, wirft die animierten Elemente weg (Kacheln fehlen, Logo springt).
Neue Daten (Liste „Zuletzt geöffnet“, Netzstatus, Update-Hinweis) bis `linksuite-intro-done` **puffern** und danach einmal
rendern. Muss doch neu gerendert werden: vorher `finish(true)` aufrufen (Rückgabe von `playProgramIntro`).

## 5 · Wann zeigen – und wer entscheidet

| Regel | Umsetzung |
|---|---|
| Abschaltbar | **Der Schalter bleibt Sache des Programms.** Der Baustein bekommt nur `enabled` (und `reduced`) |
| Wert aus der Suite | `suite.json` → Feld `intro` (`true`/`false`, Format: Link-Suite/Konzepte/Suite-Launcher/KONZEPT.md „Gemeinsame Einstellungen“; Pfad `~/Library/Application Support/Link-Suite/suite.json` bzw. `%APPDATA%\Link-Suite\suite.json`). Eigener Wert im Programm geht vor (Merker `own.intro`), „Wie die Suite“ nimmt ihn zurück |
| Electron (VJ, VD, NET, PL, Crew, dB) | **`suite.json` liest der Hauptprozess**, der Wert geht per IPC an die Oberfläche → `enabled`. Die Oberfläche liest nie selbst Dateien |
| Einmal je Programmstart | Merker im Hauptprozess (wie PL Link heute): nur das erste Laden des Hauptfensters bekommt `enabled:true`; Neuladen (⌘R), weitere Fenster, Sprachwechsel nicht |
| Nicht auf Ausgängen | Beamer, Videowände, Ausgabefenster (VJ `output.html`, VD-Ausgänge, dB Alarm- und Tablet-Fenster): Baustein gar nicht laden |
| Nicht nach einem Absturz | Hauptprozess legt beim Start `running.lock` in den Datenordner und löscht sie beim sauberen Beenden. Liegt sie beim Start schon da → letzter Lauf ist abgestürzt → `enabled:false`. Ebenso bei `app.relaunch()` nach Absturz und bei Wiederherstellung einer Sicherung |
| Screenshots, Tests | `--shot`, `--no-anim`, CI: `enabled:false`; Standbilder über `holdAt` |
| Weboberfläche (LJ Link, Tablets) | `once:'session'`: der Baustein prüft `sessionStorage` (`linksuite-intro:<app>`) selbst – einmal je Browser-Sitzung, nicht bei jedem Neuladen. Ausschaltbar mit `once:false` |
| Bewegung reduzieren | Standard: `prefers-reduced-motion`. Dann keine Bewegung: Suite-Logo blendet ein und aus, Oberfläche blendet auf (≈ 1 s) |
| Kein Ton, kein Strobe | Fläche = Hintergrund des Programms, jede Blende ≥ 150 ms (außer deckungsgleichem Bildtausch) |

## 6 · Je Programm

| Programm | Ort | Ziel (`logoTarget`) | Art | `revealTargets` | Hinweise |
|---|---|---|---|---|---|
| **VJ-Link** | `src/renderer/startscreen.ts:88–94` | `.start-logo` (`span.slots.big` mit fünf `i` + `span` „VJ-Link“) | HTML-Logo, `signTarget: .start-logo .slots` (166 × 26 px = Zeichen-Box von VJ) | `.start-tag`, `.start-grid .start-btn`, `.start-right > *` | Fokus auf `.start-btn` (`startscreen.ts:80`) erst nach `linksuite-intro-done`. Nicht in `output.html` |
| **VD-Link** | `src/ui/startscreen.ts:66–75` | `div.start-logo` (`logoSlots(true)` = `span.slots.big` mit SVG 166 × 52 + `span` „VD-Link“) | HTML-Logo, `signTarget: .start-logo .slots` | `.start-tag`, die Kacheln `.start-btn` in `.start-grid`, rechts `.start-right` mit „Zuletzt geöffnet“ (`.start-recent .start-proj`) | `render()` ist async (`await projectRecent()`) und ruft `replaceChildren()`: Animation erst nach dem fertigen `render()`. Hinweis: `.start-card` ist die ganze Karte, die Kacheln heißen `.start-btn` |
| **LJ Link** | `src/main/resources/web/` (`index.html:42`, `app.js`) | `#view-welcome .hero-logo`, wenn sichtbar, sonst `#topbar img.logo` (klein) | `targetKind:'icon'` | `#view-welcome h1`, `.lead`, `#controls`, `.steps li` | Einbinden mit `<script type="module" src="intro/start.js">` (klassische Skripte bleiben). Keine CSP. `once:'session'`. `prefers-reduced-motion` steht schon in `style.css`. `.hero-logo` zeigt das alte `logo.svg`: am schönsten mit `icons/lj-icon.svg` (dann `targetPadded:true`), sonst 150 ms Überblendung |
| **LJL Link** | läuft im LJ-Link-Fenster | wie LJ Link | `app:'ljl'` → immer Icon-Landung (es gibt noch kein LJL-Logo) | wie LJ Link | Bild `icons/ljl-icon.png` |
| **NET Link** | `src/renderer/startscreen.ts:47–53` | `#start-logo` (`img.only-dark` + `img.only-light`, ganzes Logo) | SVG-Logo (Standard) | `.start-tag`, `.start-grid .start-btn`, rechte Spalte | ersetzt `src/renderer/intro/intro.ts`, `intro.css`, `brands.json`. Schalter `intro` und `--no-anim` bleiben, `--shot` nie. CSP passt |
| **PL Link** | `src/ui/main.ts:145–146` | `.start-logo` mit Inline-SVG (`LOGO_PL`, `design/icons.ts` → `logoEl()`) – der Baustein misst das `svg` darin | SVG-Logo | `.start-tag`, `.start-grid .start-btn` | ersetzt `src/ui/intro.ts`; Merker im Hauptprozess bleibt. **Prüfen:** viewBox von `LOGO_PL` muss `-8 4.35 513.55 83.65` sein (wie `icons/pl-logo-dark.svg`), sonst sitzt das Zeichen schief → dann dort ein `<img>` des Logos nehmen |
| **Crew Link** | `src/renderer/app.ts:137–146` | `#start-logo` (`img.on-dark` + `img.on-light`) | SVG-Logo | `.start-grid .start-btn` | Pfade zu den Icons wie `../assets/` |
| **dB Link** | `src/renderer/app.ts:427–430`, Kopf `src/renderer/index.html:75` | `.start-logo` (`img.on-dark` + `img.on-light`); ist der Startbildschirm aus (`app.ts:724`: Messung läuft, Demo, abgewählt), dann `.logo` im Kopf | SVG-Logo | `.start-grid .start-btn` | Nicht im Tablet (`src/tablet/`) und nicht im Alarmfenster |

## 7 · Schnittstelle in Kürze

`playProgramIntro(options) → { finish(skipped), done: Promise<{app, skipped, shown}> }` und Ereignis
`linksuite-intro-done` auf `window` mit demselben `detail`. `shown:false`, wenn `enabled:false` oder schon in dieser
Sitzung gezeigt. Alle Optionen mit Beschreibung: `program-intro.d.ts`. Helfer `defaultImages(base, theme, app)` liefert
die Pfade aus `icons/`. Neues Programm: Eintrag in `ORDER` und `BRANDS` (`program-intro.js`, Werte aus
`Link-Suite/Konzepte/_Startanimation/make_startanimation.py`) und Icon/Logo in `icons/`.

## Nachtrag 16.11.2026: gemeinsame Schalter für Prüfen und Screenshots

| Schalter | Wirkung |
|---|---|
| `--intro=<ms>[,<ms>…]` | Standbild(er) der Animation bei diesen Zeitpunkten (`holdAt`), wie im Launcher. Liste mit Komma erlaubt |
| `--no-intro` | Animation für diesen Start aus (gleichbedeutend mit dem älteren `--no-anim`; beide annehmen) |
| `--shot` | Screenshot-Lauf: nie eine Animation, außer `--intro=` ist gesetzt |

`holdAt` gilt je Aufruf von `playProgramIntro`. Für eine Bildfolge die Schicht `#lsi` je Bild neu anlegen (bzw.
das Fenster neu laden) – mehrfaches `holdAt` auf derselben Schicht ist nicht vorgesehen.

Achtung (Hinweis PL Link): Nach `finish()` wird die Schicht erst nach ~160 ms entfernt. Ein sofort folgender Aufruf
mit derselben `#lsi` landet in der verschwindenden Schicht. Für Bildfolgen je Zeitpunkt einen eigenen Start bzw.
Neuladen verwenden oder auf `done` plus 200 ms warten.

## Nachtrag 2 (16.11.2026, Erfahrungen aus den Programmen)

- **Ein Lauf je Seite.** `playProgramIntro` ist für genau einen Aufruf je geladener Seite gedacht – auch ein Aufruf mit
  `enabled:false` zählt. Ein zweiter Aufruf im selben Fenster zeigt nichts. Für Bildfolgen neu laden.
- **Tag-Modus ohne dunklen Blitz:** Kommt das Theme erst per IPC, startet die Schicht kurz dunkel. Lösung (PL Link,
  dB Link): Der Hauptprozess setzt `backgroundColor` nach dem Theme und gibt das Theme vor dem ersten Bild mit
  (`?theme=` an der URL oder `additionalArguments` → Preload), ein kleines Skript im `<head>` setzt `data-theme` sofort.
- **Fokus nach dem Klick-Überspringen** kann an `<body>` fallen: nach `done` den Hauptknopf fokussieren, ggf. ein zweiter
  Versuch nach ~80 ms (dB Link).
- **Taste zum Überspringen abfangen**, damit sie keine Tastenzuordnung des Programms auslöst (VJ-Link).

## Nachtrag 3 (16.11.2026): Fehlerfalle beim Lesen von `--intro=`

`"".split(",").map(Number)` ergibt `[0]` – ohne Schalter (oder mit leerem Wert) würde jeder normale Start das Intro bei
0 ms festhalten. Leere Angabe = **kein** Standbild: nur endliche Zahlen ≥ 0 aus nicht-leeren Teilen übernehmen
(`s.split(",").map(x => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite)`). Fund: PL Link.
