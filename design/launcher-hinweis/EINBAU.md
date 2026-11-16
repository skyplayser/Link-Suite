# Hinweis „Link-Suite laden“ – Einbau

> Stand: 16.11.2026 · Baustein 1.0. Für VJ-Link, VD-Link, LJ Link, NET Link, PL Link, Crew Link, dB Link (LJL: siehe
> `LJL-SWIFT.md`). **Nicht anpassen, nur einbauen** – Änderungen hier im Suite-Launcher (`design/launcher-hinweis/`).

Zweck: Auf dem Startbildschirm steht eine kleine Karte, **wenn der Launcher Link-Suite nicht installiert ist**:
„Alle Programme an einem Ort – Link-Suite installiert und aktualisiert LJ Link, VJ-Link und die anderen mit einem Klick.“
Ist Link-Suite installiert, steht dort nichts.

Bilder: `demo-nacht-de.png`, `demo-tag-de.png`, `demo-nacht-en.png`, `demo-tag-en.png` (Startkarte wie VJ/VD),
`demo-lj-nacht-de.png` (LJ-Willkommen). Ausprobieren: `demo.html?theme=light&lang=en&layout=start|lj&installed=1`.

## Datenschutz

**Die Prüfung ist lokal.** Sie liest nur, ob es `Link-Suite.app` bzw. `Link-Suite.exe` und ihren Eintrag auf diesem
Rechner gibt. **Es geht nichts ins Netz**, es wird nichts gezählt und nichts gemeldet – bis jemand auf „Link-Suite laden“
klickt. Dann öffnet der Browser `https://skyplayser.github.io/Link-Suite/`, sonst nichts.

## Dateien

| Datei | Wofür | Wohin |
|---|---|---|
| `launcher-detect.ts` (+ `launcher-detect.test.ts`) | Erkennung im **Hauptprozess** (Node) | VJ, VD, NET, PL, Crew, dB: neben den Hauptprozess, z. B. `src/main/suite/` |
| `java/LauncherDetect.java` (+ `LauncherDetectTest.java`) | Erkennung in LJ Link (Java 21, nur JDK) | `src/main/java/dev/ljlinkpro/suite/`, Test nach `src/test/java/dev/ljlinkpro/suite/` |
| `launcher-hint.js`, `launcher-hint.d.ts`, `launcher-hint.css` | Karte in der Oberfläche (ES-Modul, CSP-fest: kein `innerHTML`, keine `style`-Attribute) | Oberfläche, z. B. `src/renderer/suite/` bzw. LJ `src/main/resources/web/suite/` |
| `icons/link-suite-icon.svg` | Suite-Icon (Kopie von `Link-Suite/Suite/SVG/icon.svg`) | neben die Karte |

## 1 · Erkennung (Hauptprozess)

| System | Reihenfolge | Dauer (gemessen) |
|---|---|---|
| macOS | `/Applications/Link-Suite.app`, `~/Applications/Link-Suite.app`: `Contents/Info.plist` lesen, `CFBundleIdentifier` = `de.nextphilm.linksuite`, Version = `CFBundleShortVersionString`. Nur wenn beide nichts finden: `mdfind "kMDItemCFBundleIdentifier == 'de.nextphilm.linksuite'"` mit 150 ms Zeitlimit; Papierkorb und `/Volumes/` (DMG) zählen nicht | 1 ms (installiert), 47 ms (Spotlight-Rückfall) |
| Windows | `%LOCALAPPDATA%\Programs\Link-Suite\Link-Suite.exe` und `%ProgramFiles%\Link-Suite\…` (Ordner von electron-builder/NSIS), dann `reg query HKCU\…\Uninstall /s /f Link-Suite /d`, HKLM als Rückfall, 400 ms Zeitlimit. `DisplayName` muss genau „Link-Suite“ oder „Link-Suite 0.3.0“ sein; Eintrag ohne EXE (Reste) zählt nicht | auf Windows noch nicht gemessen |
| Linux | nichts (`via:"unsupported"`, keine Karte) | – |

```ts
// Hauptprozess (Electron)
import { detectLauncher } from "./suite/launcher-detect";
let launcher: Awaited<ReturnType<typeof detectLauncher>> | null = null;
app.whenReady().then(async () => { launcher = await detectLauncher(); });            // einmal je Start
ipcMain.handle("suite:launcher", async () => launcher ?? (launcher = await detectLauncher()));
ipcMain.handle("suite:launcher-page", () => shell.openExternal("https://skyplayser.github.io/Link-Suite/"));   // feste Adresse, nie aus der Oberfläche
win.on("focus", async () => { launcher = await detectLauncher({ search: false }); win.webContents.send("suite:launcher", launcher); });  // gerade installiert → Karte weg
```

- Ergebnis `{ installed, path, version, via, ms }`. Die Oberfläche bekommt nur `installed` (und `version`), keinen Pfad.
- Tests: `node --test --experimental-strip-types launcher-detect.test.ts` (14 Tests, ohne Abhängigkeiten; in Programmen
  mit vitest genauso lauffähig). LJ Link: `./gradlew test` mit `LauncherDetectTest.java` (JUnit 5).
- LJ Link: `LauncherDetect.detect()` beim Start im Server-Thread, Ergebnis ins vorhandene Info-JSON der Weboberfläche
  (`info.launcher = {installed, version}`, `Info.toJson()`); öffnen über `java.awt.Desktop.getDesktop().browse(...)`
  im Java-Teil – **nur für den Rechner selbst** (`info.controller`), nie für Tablets.

## 2 · Karte (Oberfläche)

```ts
import { showLauncherHint } from "./suite/launcher-hint.js";
const launcher = await window.api.suiteLauncher();                  // {installed, version}
const intro = new Promise(r => addEventListener("linksuite-intro-done", r, { once: true }));
const hint = showLauncherHint({
  host: document.querySelector(".start-right .lsh-slot")!,          // Platz: siehe 4
  launcher, iconSrc: "./suite/icons/link-suite-icon.svg",
  lang: currentLang(),                                              // "de" | "en" oder eigene Texte aus der i18n
  hidden: settings.hideLauncherHint,                                // Merker „Nicht mehr zeigen“ – liegt im Programm
  allowed: !isOutput && !showRunning && !(demoMode && !settings.hintInDemo),
  compact: true,                                                    // rechte Spalte: Knöpfe unter dem Text
  after: introShown ? intro : true,                                 // erst nach der Startanimation einblenden
  onGet: () => window.api.openLauncherPage(),                      // Hauptprozess: shell.openExternal
  onHide: () => saveSetting("hideLauncherHint", true),
});
window.api.onSuiteLauncher(l => hint.update(l));                    // installiert → Karte verschwindet
```

- **Aussehen:** Karte in `--panel` mit `--line`, Icon 40 px, Titel, ein Satz, Zeile „Kostenlos · macOS und Windows“ in
  Monospace. **Pink nur auf dem Knopf** „Link-Suite laden“ (`#FF5C93`, Schrift `#141821`). „Nicht mehr zeigen“ ist ein
  stiller Textknopf. Tag und Nacht über die Tokens des Programms (`--panel`, `--line`, `--text`, `--dim`, `--focus`);
  ohne Tokens die Klasse `lsh-light`.
- **Nicht aufdringlich:** kein Popup, kein Ton, keine Bewegung. Nur 400 ms Einblenden nach dem Intro (bei
  „Bewegung reduzieren“ ohne Blende). Der Platz ist schon beim Aufbau reserviert (`visibility:hidden`) – nichts springt.
- **Nicht in `revealTargets`** der Startanimation aufnehmen; die Karte blendet selbst danach ein.
- „In Link-Suite öffnen“: **später.** Der Launcher hat heute kein URL-Schema (`linksuite://`). Wenn er eins bekommt,
  zeigt die Karte bei `installed:true` statt nichts einen kleinen Link.

## 3 · Wann nicht

| Fall | Regel |
|---|---|
| Link-Suite installiert | keine Karte (`launcher.installed`) |
| „Nicht mehr zeigen“ gewählt | nie wieder (Merker im Programm, z. B. `hideLauncherHint`) – nicht in `suite.json` |
| Ausgänge | Beamer, Videowände, Ausgabefenster (VJ `output.html`, VD-Ausgänge, dB Alarm- und Tablet-Fenster): nie |
| Laufende Show bzw. Messung | nie, wo das Programm es weiß (VJ: Show läuft, VD: Projekt offen und Ausgabe aktiv, dB: Messung läuft, LJ: Decks verbunden) – `allowed:false` |
| Demo- und Screenshot-Modus | nur mit eigenem Schalter (`--hint` o. Ä.); sonst `allowed:false` |
| Erkennung unbekannt/fehlgeschlagen | `launcher:null` → keine Karte (im Zweifel still) |
| Linux | keine Karte (es gibt den Launcher nicht) |

## 4 · Platz je Programm

| Programm | Datei | Platz | Hinweise |
|---|---|---|---|
| **VJ-Link** | `src/renderer/startscreen.ts:118–161` | in `.start-right` **über** der Instagram-Karte („love“, Zeile 157), `compact:true` | nicht in `output.html` |
| **VD-Link** | `src/ui/startscreen.ts:135–174` | in `.start-right` über der Instagram-Karte (Zeile 174), unter Sprache/Update, `compact:true` | `render()` baut neu (`replaceChildren`) → Karte bei jedem `render()` neu mit `showLauncherHint` anlegen (kein Einblenden beim zweiten Mal: `after:true`) |
| **LJ Link** | `src/main/resources/web/index.html:57–61` | in `#view-welcome` direkt **unter** `ol.steps`, breit (`compact:false`, max. 684 px wie die drei Schritte) | nur wenn `info.controller` (`app.js:1820`), nie in der Fernansicht/auf Tablets. Modul mit `<script type="module">` |
| **NET Link** | `src/renderer/startscreen.ts` (`right`, Zeile 17) | am Ende von `.start-right`, `compact:true` | `revealTargets` dort ist `.start-right > *` → Karte erst nach dem Intro anhängen |
| **PL Link** | `src/ui/main.ts:183` | am Ende von `.start-right`, `compact:true` | `revealTargets` (`main.ts:435`) ebenso |
| **Crew Link** | `src/renderer/app.ts:187` | am Ende von `.start-right` (nach `extra`), `compact:true` | `revealTargets` (`app.ts:230`) ebenso |
| **dB Link** | `src/renderer/app.ts:439` | am Ende von `.start-right`, `compact:true` | nie während einer Messung (`s.measuring`), nicht im Tablet (`src/tablet/`) und nicht im Alarmfenster |
| **LJL Link** | `Welcome.swift` | **vorerst nicht** (Gast-Mac, „Installiert wird nichts“) | siehe `LJL-SWIFT.md` |

Abstand zur pinken Hauptkachel („Weiter“) halten: die Karte steht in der anderen Spalte bzw. unter den Schritten,
nie direkt neben einem anderen Pink-Knopf.

## 5 · Prüfen

1. Ohne Link-Suite starten → Karte erscheint nach dem Intro, rechts unten bzw. unter den Schritten.
2. „Link-Suite laden“ → Browser öffnet die Suite-Seite (vorher kein Netzverkehr – im Netzwerkmonitor prüfen).
3. Link-Suite installieren, zurück ins Programm → Karte verschwindet (Erkennung bei `focus`).
4. „Nicht mehr zeigen“ → weg, auch nach Neustart.
5. Tag/Nacht, DE/EN, „Bewegung reduzieren“, Fokus mit Tab (pinker Ring), Ausgänge und Show-Modus: keine Karte.
