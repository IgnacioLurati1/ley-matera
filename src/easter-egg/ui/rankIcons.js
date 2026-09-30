// Las insignias del nivel y los emblemas de prestigio (SVG, sin archivos).
//
// Sin prestigio: una insignia por rango (cada 5 niveles), de bronce, plata u
// oro, con un mate en el medio y un punto por cada nivel dentro del rango.
// Con prestigio: un sol de mayo, cada prestigio con sus colores y más rayos.
// Maestro: la calavera con dos bombillas cruzadas.

import { LEVELS, MASTER, PRESTIGE_NAMES } from '../core/progress';

let uid = 0;

// El mate: calabaza, virola y bombilla (centrado en 0,0, ~28 de alto).
const mate = (fill, dark, metal) => `
  <path d="M-9.5 -4 C-12.5 1 -11 9 -6 11.5 C-3 13 3 13 6 11.5 C11 9 12.5 1 9.5 -4 Z" fill="${fill}" stroke="${dark}" stroke-width="1.2"/>
  <path d="M-6 -1 C-7.5 3 -6.5 7 -3.5 9" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="-10.2" y="-6.6" width="20.4" height="3.4" rx="1.2" fill="${metal}" stroke="${dark}" stroke-width=".8"/>
  <path d="M2.5 -5.5 L8.5 -15.5" stroke="${metal}" stroke-width="2" stroke-linecap="round"/>
  <path d="M7.2 -16.8 h3.6" stroke="${metal}" stroke-width="2.2" stroke-linecap="round"/>`;

const METALS = [
  // bronce
  { a: '#f0b57a', b: '#9a5a2a', c: '#4a2410', gourd: '#7b4a26' },
  // plata
  { a: '#f4f6fa', b: '#9aa3ae', c: '#3a4048', gourd: '#6c5a44' },
  // oro
  { a: '#fff0a8', b: '#d19a1c', c: '#5a3a06', gourd: '#8a5a22' },
  // rojo (los últimos)
  { a: '#ffb0a0', b: '#c0281c', c: '#3e0606', gourd: '#5a2a18' },
];

const star = (n, R, r, rot = -Math.PI / 2) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const k = i % 2 ? r : R;
    p.push(`${(Math.cos(a) * k).toFixed(2)},${(Math.sin(a) * k).toFixed(2)}`);
  }
  return p.join(' ');
};

// Insignia de nivel (prestigio 0).
function levelBadge(level, id) {
  const t = Math.min(10, Math.floor((Math.min(level, LEVELS) - 1) / 5));
  const M = METALS[t < 3 ? 0 : t < 6 ? 1 : t < 9 ? 2 : 3];
  const pips = ((Math.min(level, LEVELS) - 1) % 5) + 1;
  const g = `url(#m${id})`;
  let frame;
  if (t < 3) {
    // escudo redondo, con más anillos por rango
    frame = `<circle r="30" fill="${g}" stroke="${M.c}" stroke-width="2"/>`;
    for (let i = 0; i < t; i++) frame += `<circle r="${26 - i * 3.2}" fill="none" stroke="${M.c}" stroke-opacity=".55" stroke-width="1"/>`;
  } else if (t < 6) {
    // escudo de punta
    frame = `<path d="M0 -34 L28 -24 L26 8 C22 22 10 30 0 35 C-10 30 -22 22 -26 8 L-28 -24 Z" fill="${g}" stroke="${M.c}" stroke-width="2"/>`;
    for (let i = 0; i < t - 2; i++) frame += `<path d="M${-22 + i * 5} ${-30 + i * 2}h${44 - i * 10}" stroke="${M.c}" stroke-opacity=".5" stroke-width="1.2"/>`;
  } else if (t < 9) {
    // escudo con laureles
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.36;
      for (const s of [-1, 1]) leaves.push(`<ellipse cx="${(s * Math.cos(a) * 36).toFixed(1)}" cy="${(Math.sin(a) * 30 - 6).toFixed(1)}" rx="6" ry="2.6" transform="rotate(${((s * (a * 57 + 90)) | 0)} ${(s * Math.cos(a) * 36).toFixed(1)} ${(Math.sin(a) * 30 - 6).toFixed(1)})" fill="#6a8a3a" stroke="#2a3a14" stroke-width=".8"/>`);
    }
    frame = leaves.join('') + `<path d="M0 -32 L25 -22 L23 8 C20 20 9 28 0 32 C-9 28 -20 20 -23 8 L-25 -22 Z" fill="${g}" stroke="${M.c}" stroke-width="2"/>`;
    for (let i = 0; i < t - 5; i++) frame += `<circle cx="${-8 + i * 8}" cy="-25" r="1.8" fill="${M.c}"/>`;
  } else {
    // estrella de ocho puntas
    frame = `<polygon points="${star(8, 38, 27)}" fill="${g}" stroke="${M.c}" stroke-width="2"/><circle r="24" fill="none" stroke="${M.c}" stroke-opacity=".5"/>`;
  }
  let dots = '';
  for (let i = 0; i < pips; i++) dots += `<circle cx="${(i - (pips - 1) / 2) * 7}" cy="${t < 3 ? 22 : 25}" r="2.4" fill="${M.a}" stroke="${M.c}" stroke-width=".8"/>`;
  return `<defs><linearGradient id="m${id}" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="${M.a}"/><stop offset=".55" stop-color="${M.b}"/><stop offset="1" stop-color="${M.c}"/></linearGradient></defs>
    ${frame}<g transform="translate(0 -2) scale(.95)">${mate(M.gourd, M.c, M.a)}</g>${dots}`;
}

// Colores de cada prestigio (el sol, sus rayos y el fondo).
const SUNS = [
  null,
  { sun: '#e89a5a', ray: '#b8642a', bg: '#3a1c0a' },
  { sun: '#e8ecf2', ray: '#9aa3ae', bg: '#1e232a' },
  { sun: '#ffd84a', ray: '#d49a14', bg: '#3a2604' },
  { sun: '#ffd84a', ray: '#e0301c', bg: '#3a0808' },
  { sun: '#ffe27a', ray: '#74acdf', bg: '#0c2238' },
  { sun: '#d8f07a', ray: '#4a8a2a', bg: '#10240a' },
  { sun: '#e8c8ff', ray: '#9a4aff', bg: '#1c0a30' },
  { sun: '#ffd24a', ray: '#2a2a2a', bg: '#050505' },
  { sun: '#fff0a0', ray: '#ff6a1a', bg: '#3a0c02' },
  { sun: '#ffffff', ray: '#74acdf', bg: '#0a1a2e', gold: true },
];

// Sol de mayo con cara de mate: más rayos (rectos y flamígeros) con cada prestigio.
function prestigeSun(p, id) {
  const S = SUNS[Math.min(10, p)];
  const n = 8 + p * 2;
  let rays = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (i % 2) rays += `<path d="M0 -21 C3 -27 -3 -31 1 -38 C-2 -32 4 -28 0 -21" transform="rotate(${deg.toFixed(1)})" fill="${S.ray}" stroke="${S.ray}" stroke-width="1.2" stroke-linejoin="round"/>`;
    else rays += `<path d="M-2.4 -20 L0 -${36 + (p > 6 ? 3 : 0)} L2.4 -20 Z" transform="rotate(${deg.toFixed(1)})" fill="${S.ray}"/>`;
  }
  const ring = S.gold ? `<circle r="41" fill="none" stroke="#ffd24a" stroke-width="2.4"/><circle r="44" fill="none" stroke="#ffd24a" stroke-opacity=".4" stroke-width="1"/>` : '';
  return `<defs><radialGradient id="s${id}"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${S.sun}"/><stop offset="1" stop-color="${S.ray}"/></radialGradient></defs>
    <circle r="40" fill="${S.bg}" stroke="${S.ray}" stroke-opacity=".6" stroke-width="1.5"/>${ring}${rays}
    <circle r="19" fill="url(#s${id})" stroke="${S.ray}" stroke-width="1.4"/>
    <g transform="translate(0 1.5) scale(.62)">${mate('#6a4020', '#2a1206', '#f4f0e0')}</g>
    <text y="37" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="11" fill="${S.sun}" stroke="#000" stroke-width="2.4" paint-order="stroke">${PRESTIGE_NAMES[p]}</text>`;
}

// Maestro: la calavera matera con las bombillas cruzadas.
function masterSkull(id) {
  return `<defs><radialGradient id="k${id}"><stop offset="0" stop-color="#ff5a3a" stop-opacity=".9"/><stop offset="1" stop-color="#300" stop-opacity="0"/></radialGradient></defs>
    <circle r="44" fill="url(#k${id})"/>
    <polygon points="${star(12, 42, 33)}" fill="#1a0404" stroke="#c0281c" stroke-width="2"/>
    <path d="M-30 -26 L30 26 M30 -26 L-30 26" stroke="#e8e2cc" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M-33 -29 h7 M26 -29 h7" stroke="#e8e2cc" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M0 -24 C14 -24 20 -14 20 -3 C20 5 15 9 12 10 L12 17 L-12 17 L-12 10 C-15 9 -20 5 -20 -3 C-20 -14 -14 -24 0 -24 Z" fill="#efe8d4" stroke="#2a0a04" stroke-width="1.6"/>
    <ellipse cx="-7.5" cy="-2" rx="5" ry="5.6" fill="#1a0000"/><ellipse cx="7.5" cy="-2" rx="5" ry="5.6" fill="#1a0000"/>
    <circle cx="-7.5" cy="-2" r="2" fill="#ff3b2a"/><circle cx="7.5" cy="-2" r="2" fill="#ff3b2a"/>
    <path d="M0 4 l-3 5 h6 Z" fill="#1a0000"/>
    <path d="M-8 13 v4 M-3 13 v4 M2 13 v4 M7 13 v4" stroke="#2a0a04" stroke-width="1.2"/>`;
}

// El emblema para un rango: { level, prestige } (lo de core/progress rank()).
export function rankSvg(r, size = 64) {
  const id = `r${++uid}`;
  const body = r.prestige >= MASTER ? masterSkull(id) : r.prestige > 0 ? prestigeSun(r.prestige, id) : levelBadge(r.level, id);
  return `<svg class="mdu-rank" width="${size}" height="${size}" viewBox="-46 -46 92 92" aria-hidden="true">${body}</svg>`;
}

// El peso (la moneda de la pulpería): un peso de plata viejo.
export function pesoSvg(size = 22) {
  return `<svg class="mdu-peso" width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true"><circle r="11" fill="#d9dde2" stroke="#6a7078" stroke-width="1.4"/><circle r="8.4" fill="none" stroke="#8a9098" stroke-width=".8" stroke-dasharray="1.2 1.2"/><text y="4.6" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="13" fill="#4a5058">$</text></svg>`;
}
