// Läuft es? Ausgabe von `/bin/ps -axo pid=,comm=` auswerten. Unter macOS ist `comm` der volle Pfad des Programms
// (Recherche „Starten (0.1)“ 1, live geprüft). Darüber ordnet der Launcher Apps und Entwicklerstarts zu.

export interface Proc { pid: number; comm: string }

export function parsePs(text: string): Proc[] {
  const out: Proc[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    if (Number.isSafeInteger(pid) && pid > 0) out.push({ pid, comm: m[2]! });
  }
  return out;
}

/** Windows: `tasklist /fo csv /nh` → Name der .exe als `comm` („"VJ-Link.exe","1234",…“). */
export function parseTasklist(text: string): Proc[] {
  const out: Proc[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)"/.exec(line.trim());
    if (m) out.push({ pid: Number(m[2]), comm: m[1]! });
  }
  return out;
}

const withSlash = (p: string) => (p.endsWith("/") ? p : p + "/");

/** Prozesse einer installierten App: macOS – Programm in `<app>/Contents/MacOS/`; Windows – gleicher .exe-Name. */
export function procsOfApp(procs: readonly Proc[], appPath: string): Proc[] {
  if (/\.exe$/i.test(appPath)) {
    const exe = appPath.split(/[\\/]/).pop()!.toLowerCase();
    return procs.filter(p => p.comm.split(/[\\/]/).pop()!.toLowerCase() === exe);
  }
  const prefix = withSlash(appPath) + "Contents/MacOS/";
  return procs.filter(p => p.comm.startsWith(prefix));
}

/**
 * Electron eines Entwicklerprojekts (direkt gestartet oder über `npm start`/`dev-app.mjs` als Klon-App):
 * alles unter `<projekt>/node_modules/electron/dist/`, nur das Hauptprogramm (nicht die Helfer).
 */
export function procsOfDevProject(procs: readonly Proc[], dir: string): Proc[] {
  const prefix = withSlash(dir) + "node_modules/electron/dist/";
  return procs.filter(p => p.comm.startsWith(prefix) && /\.app\/Contents\/MacOS\/[^/]+$/.test(p.comm) && !p.comm.includes("/Frameworks/"));
}
