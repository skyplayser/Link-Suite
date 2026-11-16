# Drittanbieter-Bausteine

Link-Suite selbst steht unter der Eclipse Public License 2.0 (`LICENSE`).

## In der App enthalten

| Baustein | Lizenz | Wofür |
|---|---|---|
| [Electron](https://github.com/electron/electron) 45.3.1 | MIT (bringt Chromium u. a. mit eigenen Lizenzen mit, siehe `LICENSES.chromium.html` im App-Paket) | Desktop-Laufzeit |

Sonst keine Laufzeit-Bibliotheken: `Info.plist` liest `/usr/bin/plutil`, die Prozessliste `/bin/ps`, Spotlight `/usr/bin/mdfind`
(Recherche: keine Plist-Bibliothek nötig).

## Aus Programmen der Suite übernommen (EPL-2.0, Herkunft im Kopfkommentar)

| Datei | Herkunft |
|---|---|
| `src/core/suitechat.ts` | VJ-Link `src/core/suitechat.ts` (+ `ver` in `here`, `app:"Link-Suite"`) |
| `src/main/suitechat.ts` | VJ-Link `src/main/suitechat.ts` (+ Liste „Im Netz“, `echo` auf `probe`, Einstellungen aus `suite.json`) |
| `src/renderer/chat.ts` | VJ-Link `src/renderer/chat.ts` (Texte als Schlüssel `chat.*`) |
| `tests/suitechat.test.ts`, `tests/chatnet.test.ts` | VJ-Link `tests/` |
| `src/core/version.ts` (`isNewer`) | VJ-Link `src/core/update.ts` |
| `src/core/release.ts` (`pickRelease`, `parseDigest`, `parseSums`, Signaturprüfung) | VJ-Link `src/core/update.ts` |
| `src/main/installer.ts` (Download, Ersetzen über Skript, Selbst-Update) | VJ-Link `src/main/updater.ts` |
| `build/after-pack.cjs`, `scripts/build-main.mjs` | VD-Link |
| `src/renderer/launcher.css`, `public/icons/` | `design/launcher.css`, `design/icons/` (Link-Suite Dachmarke und Programm-Icons) |
| `src/renderer/intro/launcher-intro.ts` | `design/intro-launcher.html` (Prototyp `playLauncherIntro`, Design 0.3), Anfang nach `Link-Suite/Konzepte/_Startanimation` |
| `src/renderer/launcher-v2.css` | `design/launcher-v2.css` (Design 0.3, Abschnitte A–H) |
| `build/dmg-background.tiff`, `public/tray-Template*.png` | `design/dmg-background*.png`, `design/tray-Template*.png` (Quellen in `design/macos/`) |
| `vendor/startanimation/startanimation.html` | `Link-Suite/Konzepte/_Startanimation/startanimation.html` (unverändert kopiert; `scripts/make-intro.mjs` erzeugt daraus `src/renderer/intro/`) |

## Nur zum Bauen und Testen (nicht in der App)

Vite (MIT), esbuild (MIT), TypeScript (Apache-2.0), electron-builder (MIT), vitest (MIT), @types/node (MIT) und deren
Abhängigkeiten. Vite bringt lightningcss (MPL-2.0) als Werkzeug mit; es landet nicht in der App.

## Marken

Link-Suite ist kein offizielles Produkt von Apple, Microsoft, GitHub, AlphaTheta / Pioneer DJ, inMusic / Denon DJ,
Serato oder anderen genannten Herstellern. Alle Marken gehören ihren Inhabern.
