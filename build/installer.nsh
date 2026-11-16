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

; Deinstallieren: läuft Link-Suite noch kurz nach (Windows gibt Prozesse verzögert frei), bis zu 10 s auf das Löschen der
; letzten Dateien warten, statt Reste (Link-Suite.exe, ffmpeg.dll) liegen zu lassen. Ohne Administratorrechte geht
; „beim Neustart löschen“ nicht; bleibt danach noch etwas, nennen es die Release-Notizen.
!macro customUnInstall
  ; nicht beim Aktualisieren (dann deinstalliert der neue Installer die alte Version und legt danach neue Dateien ab)
  ${ifNot} ${isUpdated}
    StrCpy $R9 0
    linksuite_retry:
      Delete "$INSTDIR\Link-Suite.exe"
      Delete "$INSTDIR\ffmpeg.dll"
      IfFileExists "$INSTDIR\Link-Suite.exe" 0 linksuite_done
      IntOp $R9 $R9 + 1
      IntCmp $R9 10 linksuite_done
      Sleep 1000
      Goto linksuite_retry
    linksuite_done:
    RMDir "$INSTDIR"
  ${endIf}
!macroend
