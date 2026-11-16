// Log eines Entwicklerstarts: Ringpuffer im Speicher (nie in eine Datei, die Ausgabe kann Chat-Text oder Pfade
// enthalten). stdout und stderr getrennt markiert, ANSI-Farben entfernt (Design „Log-Leiste“).

export type LogStream = "out" | "err" | "sys" | "exit-ok" | "exit-err" | "exit-stop";
export interface LogLine { n: number; s: LogStream; t: string }

export const LOG_MAX = 5000;
const MAX_LINE = 4000;

// CSI-, OSC- und einzelne ESC-Folgen
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** ANSI-Farben und übrige Steuerzeichen (außer Tab) entfernen. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export class RingLog {
  private lines: LogLine[] = [];
  private seq = 0;
  /** Wie viele Zeilen vorne weggefallen sind. */
  dropped = 0;
  constructor(readonly max = LOG_MAX) {}

  push(s: LogStream, text: string): LogLine {
    const t = text.length > MAX_LINE ? text.slice(0, MAX_LINE) + " …" : text;
    const line = { n: ++this.seq, s, t };
    this.lines.push(line);
    if (this.lines.length > this.max) { this.lines.splice(0, this.lines.length - this.max); this.dropped = this.seq - this.max; }
    return line;
  }

  /** Zeilen neuer als `since` (laufende Nummer). */
  since(since = 0): LogLine[] {
    if (!this.lines.length || since >= this.seq) return [];
    const first = this.lines[0]!.n;
    return this.lines.slice(Math.max(0, since + 1 - first));
  }

  get last(): number { return this.seq; }
  get size(): number { return this.lines.length; }
  clear(): void { this.dropped = this.seq; this.lines = []; }
}

/** Zerlegt einen Datenstrom in Zeilen; der Rest ohne Zeilenende wartet auf mehr (oder `flush`). */
export class LineSplitter {
  private rest = "";
  constructor(private readonly onLine: (line: string) => void) {}
  write(chunk: string): void {
    const parts = (this.rest + chunk).split(/\r?\n|\r(?!\n)/);
    this.rest = parts.pop() ?? "";
    if (this.rest.length > 64 * 1024) { this.onLine(stripAnsi(this.rest)); this.rest = ""; }
    for (const p of parts) this.onLine(stripAnsi(p));
  }
  flush(): void {
    if (this.rest) { this.onLine(stripAnsi(this.rest)); this.rest = ""; }
  }
}
