# LJL Link (Swift) – Erkennung und Hinweis, kurze Notiz

> Stand 16.11.2026. LJL Link: `skyplayser/LJL-Link`, `sender/Sources/LJLLinkApp/Welcome.swift` (`WelcomePanel`).

**Empfehlung: in LJL Link vorerst keinen Hinweis zeigen.** LJL läuft vom USB-Stick des Clubs auf dem Mac eines Gast-DJs,
und `WelcomePanel` verspricht ausdrücklich „Installiert wird nichts, alles läuft vom USB-Stick des Clubs“. Eine Karte
„Link-Suite laden“ widerspricht dem und richtet sich an die falsche Person (der DJ verwaltet die Suite nicht).
Wenn doch (z. B. später nur im Club-Modus auf dem eigenen Rechner), dann so:

```swift
import AppKit

enum LauncherDetect {
    static let bundleID = "de.nextphilm.linksuite"
    /// Lokal, ohne Netz, < 5 ms: LaunchServices kennt jede registrierte App mit dieser Bundle-ID.
    static func find() -> (installed: Bool, path: String?, version: String?) {
        let ws = NSWorkspace.shared
        guard let url = ws.urlForApplication(withBundleIdentifier: bundleID),
              !url.path.contains("/.Trash/"), !url.path.hasPrefix("/Volumes/") else { return (false, nil, nil) }
        let v = Bundle(url: url)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return (true, url.path, v)
    }
}
```

- `urlForApplication(withBundleIdentifier:)` ersetzt die festen Orte und Spotlight (LaunchServices-Datenbank, kein Netz).
- Karte als SwiftUI-`Panel` unter dem `LazyVGrid` in `WelcomePanel`: Link-Suite-Icon 40 pt, Titel, Satz (Texte wie
  `launcher-hint.js` `TEXTS`), Knopf `NSWorkspace.shared.open(URL(string: "https://skyplayser.github.io/Link-Suite/")!)`,
  „Nicht mehr zeigen“ in `UserDefaults` – auf dem Stick: in der Club-Konfiguration, nicht auf dem Gast-Mac.
- Farben: LJL nutzt eigene `Palette` (Akzent Cyan `0.29/0.75/0.93`). Für die Suite-Regel den Knopf in Pink `#FF5C93`
  mit Schrift `#141821` – nur auf diesem Knopf.
- Testfälle: (1) Link-Suite in /Applications → installiert, Version; (2) nur im Papierkorb → nicht installiert;
  (3) nur auf einem gemounteten DMG → nicht installiert; (4) gar nicht → keine Karte.
