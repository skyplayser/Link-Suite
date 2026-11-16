// Nur Demo. Kein innerHTML, keine style-Attribute.
import { showLauncherHint, LAUNCHER_PAGE } from './launcher-hint.js';
const Q = new URLSearchParams(location.search);
const en = Q.get('lang') === 'en';
if (Q.get('theme') === 'light') document.documentElement.dataset.theme = 'light';
document.documentElement.lang = en ? 'en' : 'de';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const img = (src, cls) => { const i = new Image(); i.src = src; i.alt = ''; if (cls) i.className = cls; return i; };
const screen = document.getElementById('screen');
let host, compact = false;

if (Q.get('layout') === 'lj') {
  const root = el('section', 'lj');
  const head = el('header'); head.append(img('../intro-programm/icons/lj-icon.svg'), el('b', '', 'LJ Link'));
  const ol = el('ol');
  for (const [b, s] of en ? [['Connect', 'Computer, players and mixer on one switch.'], ['Search', 'One button finds every player.'], ['Watch', 'Every deck, every waveform, live.']]
                          : [['Verbinden', 'Rechner, Player und Mixer am selben Switch.'], ['Suchen', 'Ein Knopf findet jeden Player.'], ['Sehen', 'Jedes Deck, jede Wellenform, live.']]) { const li = el('li'); li.append(el('b', '', b), s); ol.append(li); }
  host = el('div', 'hint-slot');
  root.append(head, img('../intro-programm/icons/lj-icon.svg', 'hero-logo'), el('h1', '', en ? 'What are the DJs playing right now?' : 'Was spielen die DJs gerade?'),
    el('p', 'lead', en ? 'LJ Link shows live which track is playing on every player.' : 'LJ Link zeigt live, welcher Track auf jedem Player läuft.'),
    el('button', 'big', en ? 'Search automatically' : 'Automatisch suchen'), ol, host);
  screen.append(root);
} else {
  const start = el('div', 'start'), card = el('div', 'start-card'), left = el('div', 'start-left');
  const logo = el('div', 'start-logo'); const dots = el('span', 'slots'); for (let i = 0; i < 5; i++) dots.append(el('i')); logo.append(dots, el('span', '', 'VD-Link'));
  const grid = el('div', 'start-grid');
  const tiles = en ? [['Continue', 'Scenario: Club', 'primary'], ['New', 'Empty project'], ['Open …', 'Project from disk'], ['Demo', 'Try without a desk'], ['Connect desk', 'Art-Net and sACN'], ['Settings', 'Language, outputs, network']]
                   : [['Weiter', 'Szenario: Club', 'primary'], ['Neu', 'Leeres Projekt'], ['Öffnen …', 'Projekt von der Platte'], ['Demo', 'Ohne Pult ausprobieren'], ['Pult verbinden', 'Art-Net und sACN'], ['Einstellungen', 'Sprache, Ausgänge, Netz']];
  for (const [b, s, c] of tiles) { const t = el('button', 'start-btn' + (c ? ' ' + c : '')); const tx = el('span', 'start-btxt'); tx.append(el('b', '', b), el('small', '', s)); t.append(el('i'), tx); grid.append(t); }
  left.append(logo, el('p', 'start-tag', en ? '3D light visualiser for Art-Net and sACN.' : '3D-Lichtvisualisierer für Art-Net und sACN.'), grid);
  const right = el('div', 'start-right'); right.append(el('h3', '', en ? 'Recently opened' : 'Zuletzt geöffnet'));
  for (const [n, p] of [['Kesselhaus', '~/Shows/kesselhaus.vdl'], ['Open Air 2026', '~/Shows/openair.vdl']]) { const r = el('div', 'start-proj'); const tx = el('div'); tx.append(el('b', '', n), el('small', '', p)); r.append(el('i'), tx); right.append(r); }
  right.append(el('div', 'grow'));
  host = el('div'); right.append(host); compact = true;
  card.append(left, right);
  const foot = el('div', 'start-foot'); foot.append(el('span', '', en ? '☐ Show at start' : '☐ Beim Start zeigen'), el('span', '', 'VD-Link 0.2.0 · EPL-2.0'));
  start.append(card, foot); screen.append(start);
}

showLauncherHint({
  host, compact,
  launcher: { installed: Q.get('installed') === '1' },
  iconSrc: 'icons/link-suite-icon.svg',
  lang: en ? 'en' : 'de',
  onGet: () => console.log('öffnen (im Programm über den Hauptprozess):', LAUNCHER_PAGE),
  onHide: () => console.log('Merker setzen'),
});
