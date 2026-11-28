# Suite-Diagnose v1 – Debug-Infos für den Hilfe-Assistenten

Stand 28.11.2026 · Auftrag des Entwicklers: „Der Chatbot soll direkt in die Programme schauen können. Alle Programme
bekommen mit dem nächsten Update eine Schnittstelle, um dem Chatbot Debugging-Infos zu geben.“

Gemeinsamer Baustein – bitte nicht neu erfinden: Spezifikation hier, Schreiber zum Kopieren in `diagnose-writer.ts`.
**Vorlage v1.2 (28.11.2026):** IPv4 wird nicht mehr in längeren Versionsnummern erkannt, der Ordner `Link-Suite` wird
nie angelegt. **Vorlage v1.1:** `clean()` filtert jetzt alles aus „Was nie hinein darf“ (vorher nur den exakten
Benutzerordner). Wer v1 kopiert hat (z. B. Crew Link), bitte `clean()` und `isShowIp()` aus v1.1 übernehmen.
Der Leser steckt im Launcher (`src/main/diagnose.ts`, ab Link-Suite 1.0.7).

## Idee in einem Satz

Jedes Suite-Programm hält eine kleine Datei `diagnose/<id>.json` im **Datenordner der Link-Suite** aktuell. Der
Launcher liest sie, zeigt sie im Hilfe-Assistenten vorher an und schickt sie **nur mit, wenn der Nutzer das Häkchen
„Diagnose mitschicken“ setzt**. Kein Netzwerkdienst, kein offener Port, kein eigener Server – nur eine Datei.

## Ort

Derselbe Ordner, in dem `suite.json` liegt (alle Programme lesen ihn schon):

| System | Datei |
|---|---|
| macOS | `~/Library/Application Support/Link-Suite/diagnose/<id>.json` |
| Windows | `%APPDATA%\Link-Suite\diagnose\<id>.json` |

`<id>` ist die Kennung aus dem Katalog des Launchers: `lj`, `ljl`, `vj`, `vd`, `net`, `crew`, `pl`, `db`.
Nur schreiben, wenn der Ordner `Link-Suite` schon existiert (also Link-Suite installiert ist) – nie anlegen; darin
`diagnose/` bei Bedarf anlegen. Atomar schreiben (erst `<id>.json.tmp`, dann umbenennen). Ist der Ordner nicht
beschreibbar: still weiter ohne Diagnose (nie die Show stören).

## Wann schreiben

- beim Start und beim Beenden (`running: false`),
- wenn sich etwas Wichtiges ändert (Verbindung da/weg, Fehler, Ausgang an/aus),
- sonst höchstens alle 30 s, solange das Programm läuft. Nie öfter als 1×/s.

## Format (JSON, UTF-8, höchstens 16 KB)

```json
{
  "suite": "diagnose",
  "v": 1,
  "id": "vj",
  "app": "VJ-Link",
  "version": "0.1.18",
  "at": "2026-11-28T14:03:12Z",
  "running": true,
  "os": "macOS 15.1",
  "arch": "arm64",
  "summary": { "Ausgänge": "2 (Beamer 1920×1080, LED-Wand 768×384)", "Takt": "LJ Link, 128 BPM", "Art-Net": "hört auf 2.0.0.10, Universe 1–4" },
  "checks": [
    { "name": "Art-Net", "ok": true, "detail": "Pakete von 2.0.0.1 (grandMA3)" },
    { "name": "Beamer", "ok": false, "detail": "Ausgang 2 hat seit 30 s kein Bild" }
  ],
  "errors": [
    { "at": "2026-11-28T14:01:55Z", "text": "Renderer: WebGL context lost" }
  ]
}
```

| Feld | Pflicht | Inhalt |
|---|---|---|
| `suite`, `v` | ja | immer `"diagnose"`, `1` |
| `id`, `app`, `version` | ja | Katalog-Kennung, Anzeigename, Programmversion |
| `at` | ja | Zeitpunkt (ISO 8601, UTC) |
| `running` | ja | läuft gerade |
| `os`, `arch` | nein | z. B. `macOS 15.1`, `Windows 11 (26100)`, `arm64`/`x64` |
| `summary` | nein | höchstens 20 Paare Text → Text (je ≤ 200 Zeichen): der Zustand, den ein Helfer zuerst wissen will |
| `checks` | nein | höchstens 20 Prüfungen `{name, ok, detail}` – was das Programm selbst prüfen kann |
| `errors` | nein | die letzten höchstens 20 Fehler/Warnungen `{at, text}` (je ≤ 300 Zeichen), neueste zuletzt |

Unbekannte Felder ignoriert der Launcher. Was nicht passt (zu groß, falsches `id`, kein `v: 1`), zeigt er nicht.
Er liest nur genau `<id>.json` (nie `.tmp`).

**Präzisierungen (Fragen von LJ Link, 28.11.2026):**
- Sprache von Schlüsseln und Texten ist frei (Deutsch oder Englisch, wie im Programm); der Assistent versteht beides.
- `os` ist freier Text; ohne Build-Nummer (z. B. Java: „Windows 11 (10.0)“) ist in Ordnung.
- Wiederholte Fehler dürfen zusammengefasst werden: `"text": "… (3x)"`, `at` = letztes Auftreten.
- Nach einem Absturz bleibt `running: true` stehen. Der Launcher urteilt deshalb nach dem Alter von `at`: Wer läuft,
  schreibt spätestens alle 30 s; ist `at` älter als 2 Minuten, gilt der Stand als veraltet (Programm vermutlich beendet
  oder abgestürzt) – das sagt er auch dem Assistenten (ab Link-Suite 1.0.8).

## Was nie hinein darf (Datenschutz)

- **keine** Namen von Personen, Chat-Texte, Chat-Namen, E-Mail-Adressen, Telefonnummern
- **keine** Passwörter, Schlüssel, Tokens, Lizenzschlüssel, Seriennummern
- **keine** vollständigen Pfade mit dem Benutzernamen – den Benutzerordner als `~` schreiben
- **keine** öffentlichen IP-Adressen, MAC-Adressen, Rechnernamen
- IP-Adressen aus dem lokalen Show-Netz (10.x, 172.16–31.x, 192.168.x, 2.x/10.x für Art-Net) nur, wenn sie für die
  Fehlersuche nötig sind (z. B. „Art-Net von 2.0.0.1“)
- Dateinamen von Medien, Songtiteln oder Playlists nur, wenn sie für den Fehler nötig sind; im Zweifel weglassen

Der Nutzer sieht vor dem Senden genau diesen Inhalt (Launcher: „Ansehen“) und entscheidet selbst.

## Was der Launcher daraus macht

- Im Assistenten erscheint unter der Programmauswahl **„Diagnose von VJ-Link mitschicken“** mit Stand und **Ansehen**.
  **Ab Werk aus.** Beim Ankreuzen zeigt der Launcher den Text; genau dieser Stand geht mit. Nach dem Senden wieder aus.
- Der Launcher filtert zusätzlich (zweite Schranke, `scrubDiag` in `src/core/diagnose.ts`): Benutzerordner, `file:`-Adressen,
  Laufwerks- und Freigabenamen, E-Mail, MAC, IPv6, öffentliche IPv4, Rechnernamen, lange Schlüssel. Das ersetzt nicht die
  Sorgfalt der Programme – was nie hinein darf, gehört gar nicht erst in die Datei.
- Mitgeschickt wird eine kompakte Textfassung (keine Rohdatei) hinter der Nachricht, mit `log: true` (der Dienst erlaubt
  dann bis zu 12 000 Zeichen).
- Für Link-Suite selbst baut der Launcher die Diagnose ohne Datei (Version, Prüfstand der Releases, installierte
  Programme, letzte Fehler aus `main.log`).

## Einbau je Programm

| Programm | Weg |
|---|---|
| VJ-Link, VD-Link, Crew Link, NET Link, PL Link, dB Link (Electron/Node) | `diagnose-writer.ts` kopieren (Herkunft im Kopfkommentar lassen), `startDiagnose()` beim Start aufrufen, `report()` an den passenden Stellen |
| LJ Link (Java) | dieselbe Datei und dasselbe Format selbst schreiben (z. B. Jackson/Gson), Ort wie oben |
| LJL Link (Swift, vom Stick) | dieselbe Datei; läuft auf dem Mac eines Gast-DJs – nur schreiben, wenn der Ordner schon existiert (also Link-Suite dort installiert ist) |

Tests je Programm: Datei entsteht beim Start, `running: false` nach dem Beenden, Größe ≤ 16 KB, nichts aus der Liste
„nie hinein“, Schreibfehler stören nicht.

Fragen an die Sitzung „Suite-Launcher“.
