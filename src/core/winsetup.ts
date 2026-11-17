// Windows-Installer beobachten (1.0.1, Windows-Realtest 1.0.0 Befund 1): Ende des Installer-Prozesses erkennen und
// danach AKTUELL / ABGEBROCHEN / FEHLER bestimmen. Reine Logik ohne Electron, voll getestet; der Hauptprozess startet
// PowerShell mit SETUP_PS und reicht die Ausgabe an parseSetupOutput weiter.
// Lizenz: EPL-2.0 (Link-Suite).

/**
 * PowerShell-Skript: Installer über Start-Process (ShellExecuteEx, damit die UAC-Abfrage erscheinen kann) öffnen und
 * auf das Ende genau dieses Prozesses warten. Der Pfad kommt aus der Umgebung (LINKSUITE_SETUP), nie aus der Befehlszeile.
 * Bewusst ohne `-Wait`: das wartet auch auf Nachfahren (z. B. das am Ende gestartete Programm) und legt dafür ein
 * Job-Objekt an. Ausgabe per Write-Output (geht auch im eingeschränkten Sprachmodus). `$p.Handle` früh lesen, sonst
 * fehlt der Exit-Code (bekannte .NET-Eigenheit). Startet der Installer sich selbst neu (z. B. mit Rechten), achtet die Link-Suite danach noch per tasklist auf denselben Namen.
 * 1223 = ERROR_CANCELLED (UAC-Abfrage mit „Nein“ beantwortet).
 */
export const SETUP_PS = [
  "$ErrorActionPreference = 'Stop';",
  "try {",
  "$p = Start-Process -FilePath $env:LINKSUITE_SETUP -PassThru;",
  "$null = $p.Handle;",
  "Write-Output ('LINKSUITE-STARTED:' + $p.Id);",
  "$p.WaitForExit();",
  "Write-Output ('LINKSUITE-EXIT:' + $p.ExitCode)",
  "} catch {",
  "$e = $_.Exception; $c = $null;",
  "while ($e) { if ($e.PSObject.Properties['NativeErrorCode'] -and $e.NativeErrorCode -eq 1223) { $c = 1223 }; $e = $e.InnerException };",
  "if ($c) { Write-Output ('LINKSUITE-EXIT:1223') } else { Write-Output ('LINKSUITE-ERROR:' + ($_.Exception.Message -replace '[\\r\\n]+', ' ')) }",
  "}",
].join(" "); // eine Zeile, Klartext (kein -EncodedCommand: sieht für Virenscanner verdächtig aus)

export interface SetupExit {
  /** Exit-Code des Installers; null = unbekannt (kein Code gelesen). */
  code: number | null;
  /** Der Installer ließ sich nicht öffnen (Text für die Meldung) – sonst "". */
  error: string;
  /** Prozess-ID, falls bekannt (nur fürs Log). */
  pid: number | null;
  /** PowerShell ließ sich nicht starten bzw. lieferte nichts: Ersatzweg (ShellExecute + tasklist). */
  noShell?: boolean;
  /** Gestartet, aber kein Ende gemeldet (z. B. Warten in PowerShell gesperrt): weiter per tasklist. */
  follow?: boolean;
  /** Nur fürs Log: Exit-Code bzw. Signal von PowerShell und der Anfang von stderr. */
  diag?: string;
}

/** Diagnose von PowerShell anhängen (Windows-Test 1.0.1: „powershell missing“ ohne Grund im Log). */
export function withShellDiag(r: SetupExit, code: number | null, signal: string | null, stderr: string): SetupExit {
  const text = stderr.replace(/\s+/g, " ").trim().slice(0, 300);
  const diag = `powershell ${code !== null ? `exit ${code}` : `signal ${signal ?? "?"}`}${text ? ` stderr: ${text}` : ""}`;
  return { ...r, diag };
}

/** Ausgabe von SETUP_PS lesen. Nur die eigenen Zeilen zählen; alles andere wird ignoriert. */
export function parseSetupOutput(out: string): SetupExit {
  let code: number | null = null, error = "", pid: number | null = null;
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    let m = /^LINKSUITE-EXIT:(-?\d{1,10})$/.exec(line);
    if (m) { const n = Number(m[1]); code = Number.isSafeInteger(n) ? n : null; continue; }
    m = /^LINKSUITE-STARTED:(\d{1,10})$/.exec(line);
    if (m) { pid = Number(m[1]); continue; }
    m = /^LINKSUITE-ERROR:(.*)$/.exec(line);
    if (m) error = (m[1] ?? "").trim().slice(0, 300) || "?";
  }
  // Ohne jede eigene Zeile lief Start-Process nie (z. B. gesperrte PowerShell): Ersatzweg, nicht „geschlossen“
  if (pid === null && code === null && !error) return { code, error, pid, noShell: true };
  // Gestartet, Ende unbekannt: ein Fehler NACH dem Start ist kein Öffnen-Fehler – weiter per tasklist beobachten
  if (pid !== null && code === null) return { code, error: "", pid, follow: true };
  return { code, error, pid };
}

/**
 * Exit-Codes „vom Benutzer abgebrochen“: NSIS 1 (Abbrechen), MSI 1602, Windows 1223 (UAC „Nein“), 0xC000013A
 * (Fenster/Konsole geschlossen) – als vorzeichenlose und vorzeichenbehaftete Zahl.
 */
export const CANCEL_CODES: ReadonlySet<number> = new Set([1, 1223, 1602, 0xC000013A, 0xC000013A - 0x1_0000_0000]);

export type SetupVerdict = "done" | "cancelled" | "failed";

/**
 * Ergebnis nach dem Ende des Installers (und einer letzten Nachschau in der Registry):
 *  - neue Version installiert → AKTUELL („done“), egal welcher Code
 *  - Öffnen gescheitert → FEHLER
 *  - abgebrochen, ohne Code oder Code 0 ohne Installation → ABGEBROCHEN (Fenster geschlossen, nichts installiert)
 *  - jeder andere Code → FEHLER
 */
export function setupVerdict(exit: SetupExit, installedOk: boolean): SetupVerdict {
  if (installedOk) return "done";
  if (exit.error) return "failed";
  if (exit.code === null || exit.code === 0 || CANCEL_CODES.has(exit.code)) return "cancelled";
  return "failed";
}

/** Name des Installer-Prozesses für tasklist (Ersatzweg, wenn PowerShell fehlt): nur einfache .exe-Namen. */
export function setupImageName(file: string): string | null {
  const base = file.split(/[\\/]/).pop() ?? "";
  return /^[A-Za-z0-9._ -]{1,80}\.exe$/i.test(base) ? base : null;
}
