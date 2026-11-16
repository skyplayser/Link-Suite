; Link-Suite – Anpassungen des NSIS-Installers (QA Windows U5).
; Immer pro Benutzer, ohne Seite „Für wen installieren?“ und ohne Administratorrechte.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Lizenz nur als Link auf der Abschlussseite (keine Pflichtseite mit Textwand)
!macro customHeader
  !define MUI_FINISHPAGE_LINK "Eclipse Public License 2.0"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://www.eclipse.org/legal/epl-2.0/"
!macroend

; Deinstaller in den Vordergrund
!macro customUnInit
  BringToFront
!macroend

; Firewall-Regeln, die Windows beim ersten Start für link-suite.exe anlegt, lassen sich ohne Administratorrechte nicht
; entfernen. Der Deinstaller lässt sie deshalb stehen (in docs/releases/v0.3.1.md genannt).
