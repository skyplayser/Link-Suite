// Nur Demo: baut einen Platzhalter-Startbildschirm und startet die Animation. Kein innerHTML, keine style-Attribute.
import { playProgramIntro, defaultImages } from './program-intro.js';

const Q = new URLSearchParams(location.search);
const APPS = ['lj', 'ljl', 'vj', 'vd', 'net', 'cr', 'pl', 'db'];
const app = APPS.includes(Q.get('app')) ? Q.get('app') : 'vj';
const theme = Q.get('theme') === 'light' ? 'light' : 'dark';
const en = Q.get('lang') === 'en';
if (theme === 'light') document.documentElement.dataset.theme = 'light';
const NAMES = { lj: 'LJ Link', ljl: 'LJL Link', vj: 'VJ-Link', vd: 'VD-Link', net: 'NET Link', cr: 'Crew Link', pl: 'PL Link', db: 'dB Link' };
const TAGS = { lj: 'Zeigt dem LJ, was der Sound macht.', ljl: 'Serato-Decks vom Stick des Clubs in LJ Link.', vj: 'Einfache VJ-Software für LJs.',
  vd: '3D-Lichtvisualisierer für Art-Net und sACN.', net: 'Zeigt, wer im Show-Netz ist.', cr: 'Ablauf der Nacht: eine Uhr für alle.',
  pl: 'Patch & Load: DMX-Adressen und Stromlast planen.', db: 'Lautstärke messen, warnen und protokollieren.' };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const img = (src, cls) => { const i = new Image(); i.src = src; i.alt = ''; if (cls) i.className = cls; return i; };
const screen = document.getElementById('screen');
const html = app === 'vj' && Q.get('html') !== '0';
let logoTarget, signTarget, targetKind = 'logo', reveal = [];

if (app === 'lj' || app === 'ljl') {
  // LJ-Weboberfläche: Kopf mit kleinem Logo, großes .hero-logo mittig
  const root = el('section', 'lj');
  const head = el('header'); head.append(img(`icons/${app}-icon.${app === 'ljl' ? 'png' : 'svg'}`, 'logo'), el('b', '', NAMES[app]));
  const hero = img(`icons/${app}-icon.${app === 'ljl' ? 'png' : 'svg'}`, 'hero-logo');
  if (Q.get('hide') === '1') hero.classList.add('hidden-target');
  const h1 = el('h1', '', en ? 'What are the DJs playing right now?' : 'Was spielen die DJs gerade?');
  const lead = el('p', 'lead', TAGS[app]);
  const go = el('button', 'btn', en ? 'Search automatically' : 'Automatisch suchen');
  const ol = el('ol');
  for (const [b, s] of [['Verbinden', 'Rechner, Player und Mixer am selben Switch.'], ['Suchen', 'Ein Knopf findet jeden Player.'], ['Sehen', 'Jedes Deck, jede Wellenform, live.']]) { const li = el('li'); li.append(el('b', '', b), s); ol.append(li); }
  root.append(head, hero, h1, lead, go, ol);
  screen.append(root);
  targetKind = 'icon';
  // wie LJ Link: großes Logo, wenn sichtbar, sonst das kleine im Kopf
  logoTarget = () => hero.getBoundingClientRect().width > 0 && !hero.classList.contains('hidden-target') ? hero : head.querySelector('img');
  reveal = [h1, lead, go, ...ol.children];
} else {
  const start = el('div', 'start'), card = el('div', 'start-card'), left = el('div', 'start-left');
  const logo = el('div', 'start-logo');
  if (html) {
    const dots = el('span', 'slots big'); for (let i = 0; i < 5; i++) dots.append(el('i'));
    logo.append(dots, el('span', '', NAMES[app]));
    signTarget = () => dots;
  } else {
    logo.append(img(`icons/${app}-logo-dark.svg`, 'only-dark'), img(`icons/${app}-logo-light.svg`, 'only-light'));
  }
  if (Q.get('hide') === '1') logo.classList.add('hidden-target');
  logoTarget = () => logo.classList.contains('hidden-target') ? null : logo;
  const grid = el('div', 'start-grid');
  const tiles = [['Weiter', 'Szenario: Club', 'primary'], ['Neu', 'Leeres Projekt'], ['Öffnen …', 'Projekt von der Platte'], ['Demo', 'Ohne Pult ausprobieren'], ['Pult verbinden', 'Art-Net und sACN'], ['Einstellungen', 'Sprache, Ausgänge, Netz']];
  for (const [b, s, c] of tiles) { const t = el('button', 'start-btn' + (c ? ' ' + c : '')); const tx = el('span', 'start-btxt'); tx.append(el('b', '', b), el('small', '', s)); t.append(el('i'), tx); grid.append(t); }
  left.append(logo, el('p', 'start-tag', TAGS[app]), grid);
  const right = el('div', 'start-right'); right.append(el('h3', '', en ? 'Recently opened' : 'Zuletzt geöffnet'));
  const recent = [];
  for (const [n, p] of [['Kesselhaus', '~/Shows/kesselhaus.vdl'], ['Open Air 2026', '~/Shows/openair.vdl'], ['Club Nord', '~/Shows/club-nord.vdl']]) { const r = el('div', 'start-proj'); const tx = el('div'); tx.append(el('b', '', n), el('small', '', p)); r.append(el('i'), tx); right.append(r); recent.push(r); }
  card.append(left, right); start.append(card); screen.append(start);
  reveal = [left.querySelector('.start-tag'), ...grid.children, right.querySelector('h3'), ...recent];
}

const go = () => playProgramIntro({
  layer: document.getElementById('lsi'),
  app,
  logoTarget,
  signTarget,
  targetKind,
  revealTargets: () => reveal,
  images: defaultImages('icons/', theme, app),
  theme,
  reduced: Q.get('reduced') === '1' ? true : undefined,
  once: Q.get('once') === 'session' ? 'session' : false,
  speed: Number(Q.get('speed')) || 1,
  holdAt: Q.has('t') ? Number(Q.get('t')) : null,
  text: en ? k => ({ skip: 'Skip:', key: 'any key', or: 'or click' })[k] : undefined,
});
// Start erst nach dem ersten Layout und wenn die Bilder da sind
addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(go)));
if (Q.get('loop') === '1') addEventListener('linksuite-intro-done', () => setTimeout(() => location.reload(), 1200));
