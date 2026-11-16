// Umgebung für Entwicklerstarts (Recherche „Umgebung säubern“ und „PATH für npm run dev“).

/** Präfixe und Namen, die das Kind nicht vom Launcher erben darf. */
const DROP_PREFIX = ["ELECTRON_", "npm_", "VITE_", "LINKSUITE_"];
const DROP_NAMES = new Set([
  "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "INIT_CWD", "__CFBundleIdentifier", "XPC_SERVICE_NAME",
  "VJLINK_DATA", "VJLINK_CHAT_PORT", "VD_USER_DATA", "ORIGINAL_XDG_CURRENT_DESKTOP",
]);

/** Kopie der Umgebung ohne Electron-, npm- und Vite-Variablen; `set` kommt danach dazu (z. B. PATH). */
export function cleanEnv(env: Readonly<Record<string, string | undefined>>, set: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (DROP_NAMES.has(k) || DROP_PREFIX.some(p => k.startsWith(p) || k.toUpperCase().startsWith(p.toUpperCase()))) continue;
    out[k] = v;
  }
  return { ...out, FORCE_COLOR: "0", ...set };
}

export const SHELL_MARK = "__LS__";

/**
 * Befehl für die Login-Shell: gibt den Pfad von npm und node und den PATH mit Markierung aus. Interaktive Shells
 * schreiben oft eigenen Text (Begrüßung, Hinweise von nvm); nur Zeilen mit Markierung zählen.
 */
export const SHELL_PROBE = `printf '\\n${SHELL_MARK}npm=%s\\n' "$(command -v npm)"; printf '${SHELL_MARK}node=%s\\n' "$(command -v node)"; printf '${SHELL_MARK}path=%s\\n' "$PATH"`;

/** fish kennt kein `"$PATH"` als Text mit Doppelpunkten (Liste) – dort `string join : $PATH` (QA Befund 15). */
export const SHELL_PROBE_FISH = `printf '\\n${SHELL_MARK}npm=%s\\n' (command -v npm); printf '${SHELL_MARK}node=%s\\n' (command -v node); printf '${SHELL_MARK}path=%s\\n' (string join : $PATH)`;

/** Befehl passend zur Login-Shell. */
export function shellProbeFor(shell: string): string {
  return /(^|\/)fish$/.test(shell) ? SHELL_PROBE_FISH : SHELL_PROBE;
}

export interface ShellProbe { npm: string; node: string; path: string }

/** Ausgabe der Login-Shell auswerten. Nur absolute Pfade zählen. Nichts gefunden → null. */
export function parseShellProbe(stdout: string): ShellProbe | null {
  const got: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const i = line.indexOf(SHELL_MARK);
    if (i < 0) continue;
    const rest = line.slice(i + SHELL_MARK.length);
    const eq = rest.indexOf("=");
    if (eq < 0) continue;
    got[rest.slice(0, eq)] = rest.slice(eq + 1).trim();
  }
  const abs = (s: string | undefined) => (s && s.startsWith("/") && !s.includes("\0") ? s : "");
  const npm = abs(got.npm), node = abs(got.node);
  const p = (got.path ?? "").split(":").filter(x => x.startsWith("/")).join(":");
  if (!npm) return null;
  return { npm, node, path: p };
}

/** Bekannte Orte für node und npm, wenn die Login-Shell nichts liefert (Reihenfolge wie in der Recherche). */
export function knownNodeDirs(home: string, nvmVersions: readonly string[] = []): string[] {
  const nvm = [...nvmVersions].sort((a, b) => compareNodeVersion(b, a)).map(v => `${home}/.nvm/versions/node/${v}/bin`);
  return [
    "/opt/homebrew/bin", "/usr/local/bin", ...nvm, `${home}/.volta/bin`, `${home}/.local/share/fnm/aliases/default/bin`,
    `${home}/.asdf/shims`, `${home}/.local/share/mise/shims`, "/opt/local/bin",
  ];
}

function compareNodeVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number), pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

export const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

/** PATH für das Kind: aus der Login-Shell, sonst Ordner von node und npm plus System. Doppelte fallen weg. */
export function buildPath(probe: ShellProbe | null, nodeDir: string | null): string {
  const parts: string[] = [];
  const dir = (f: string) => f.slice(0, f.lastIndexOf("/")) || "/";
  if (probe?.path) parts.push(...probe.path.split(":"));
  if (probe?.node) parts.push(dir(probe.node));
  if (probe?.npm) parts.push(dir(probe.npm));
  if (nodeDir) parts.push(nodeDir);
  parts.push(...SYSTEM_PATH.split(":"));
  return [...new Set(parts.filter(Boolean))].join(":");
}
