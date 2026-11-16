// Fenster „Über Link-Suite“: Icon, Logo, Claim, Version, Pillen, Lizenzen (THIRD_PARTY.md als Text), Laufzeiten.
import { translate, type Lang } from "../core/i18n";

interface AboutInfo { version: string; arch: string; lang: Lang; theme: "dark" | "light"; update: string; electron: string; chrome: string; node: string }
const about = (window as unknown as { about: { info(): Promise<AboutInfo>; licenses(): Promise<string>; github(): Promise<boolean>; resize(h: number): void; onLicenses(cb: () => void): void } }).about;
const $ = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const i = await about.info();
  const t = (k: string, v?: Record<string, string | number>) => translate(i.lang, k, v);
  if (navigator.userAgent.includes("Mac")) document.documentElement.classList.add("mac");
  if (i.theme === "light") document.documentElement.dataset.theme = "light";
  document.documentElement.lang = i.lang;
  document.title = t("mm.about");
  $("ab-claim").textContent = t("hero.claim");
  $("ab-ver").textContent = `${i.version} (${i.arch})`;
  const pill = (cls: string, text: string) => { const s = document.createElement("span"); s.className = `pill ${cls}`; s.textContent = text; return s; };
  $("ab-pills").append(pill("off", t("pill.notSigned")), ...(i.update ? [pill("warn", t("pill.update", { v: i.update }))] : []));
  $("ab-lic").textContent = t("set.licenses");
  $("ab-tech").textContent = `Electron ${i.electron} · Chromium ${i.chrome} · Node ${i.node}`;
  const notes = $("ab-notes");
  const showLic = async () => {
    if (notes.hidden) { notes.textContent = await about.licenses(); notes.hidden = false; }
    else notes.hidden = true;
    about.resize(document.body.scrollHeight + 40);
  };
  $("ab-lic").addEventListener("click", () => void showLic());
  $("ab-gh").addEventListener("click", () => void about.github());
  about.onLicenses(() => { if (notes.hidden) void showLic(); });
  addEventListener("keydown", e => { if (e.key === "Escape") window.close(); });
  if (new URLSearchParams(location.search).get("licenses") === "1") void showLic();
}
void main();
