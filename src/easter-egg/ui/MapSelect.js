import { MAP_LIST, MAP_MODES } from '../config/map';
import './challenge.css';

// Elegir el mapa. En el título (y en la sala, para el anfitrión) hay un botón con
// el capítulo elegido; abre una pantalla propia con los seis capítulos a la
// izquierda y, del otro lado, el mapa en vivo de fondo con su nombre en la letra
// de su cinemática, de qué se trata y el récord. Pasar el mouse por un capítulo
// adelanta su cartel; hacer clic lo elige (y el fondo se rearma con ese mapa).

// Cada capítulo: número, lugar, lo que pasa ahí, letra y color de su cinemática,
// cielo y silueta (SVG 120×72) de su postal.
const MAP_LOOK = {
  molino: { place: 'Misiones · 1911', lore: 'Despertás en un galpón sin saber quién sos ni cómo llegaste. El molino no muele hace años, pero el fuego del barbacuá sigue prendido.', n: 'I', font: "'Creepster', 'Special Elite', serif", acc: '#ff6a45', sky: '#3c2a1c, #16100c 70%',
    art: `<circle class="l" cx="96" cy="16" r="7"/><path d="M0 72V62Q30 58 60 61T120 60V72Z"/><path d="M53 62L56.5 30h7L67 62Z"/><path d="M55 30L60 24L65 30Z"/><g transform="rotate(22 60 29)"><rect x="58.6" y="5" width="2.8" height="48"/><rect x="36" y="27.6" width="48" height="2.8"/></g><path d="M90 62V50h8v12Z"/><path d="M93 41h2v9h-2ZM90.5 44h7v2h-7Z"/><path d="M8 62v-5h3v-2h2v2h3v5ZM22 62v-4h2v-2h2v2h2v4Z"/>` },
  granja: { place: 'Una chacra · al atardecer', lore: 'Una tapera perdida entre los maizales. Cada diez rondas la horda viene por el yerbal, y alguien tiene que defenderlo.', n: 'II', font: "'Rye', 'Special Elite', serif", acc: '#ffb45a', sky: '#e0823a, #5a200c 75%',
    art: `<circle class="l" cx="92" cy="60" r="14"/><path d="M0 72V63Q40 60 120 63V72Z"/><path d="M16 63V47L29 37L42 47V63Z"/><path d="M34 40V33h4v10Z"/><path d="M48 63V45L61 34L74 45V63Z"/><path class="s" d="M80 63L81 41M85 63L87 38M90 63L90 44M96 63L98 40M102 63L101 43M108 63L110 39M114 63L113 45"/><path d="M8 63V52h2v11Z"/>` },
  penal: { place: 'Isla del Ceibo · en medio del río', lore: 'Un penal que nadie vigila desde hace años. El Alcaide no terminó de morirse y los presos todavía esperan que alguien los saque.', n: 'III', font: "'Stardos Stencil', 'Special Elite', serif", acc: '#ff7658', sky: '#44525e, #10161c 75%',
    art: `<path class="l o" d="M98 21L34 2L46 0Z"/><path d="M12 64V44H86V64Z"/><path d="M12 44V40h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4h4v-4h4v4Z"/><path d="M92 64V25H104V64Z"/><path d="M89 25L98 17L107 25Z"/><path class="l" d="M22 50h3v5h-3ZM34 50h3v5h-3ZM58 50h3v5h-3ZM72 50h3v5h-3ZM96 30h4v4h-4Z"/><path class="w" d="M0 63Q15 60 30 63T60 63T90 63T120 63V72H0Z"/>` },
  esteros: { place: 'Esteros del Iberá · 1877', lore: 'Antes del penal hubo un pacto. Una noche de luna llena, en medio del agua, una voz le habló a un gaucho colorado... y él contestó.', n: 'IV', font: "'Kaushan Script', 'Special Elite', serif", acc: '#e2483a', sky: '#1c3440, #05090d 75%',
    art: `<circle class="l" cx="92" cy="22" r="11"/><path class="w" d="M0 60Q20 58 40 60T80 60T120 60V72H0Z"/><path d="M14 60V46h14v14Z"/><path d="M11 47L21 38L31 47Z"/><path class="s" d="M16 60v6M26 60v6"/><path class="s" d="M50 60C50 48 49 38 52 28M52 28c-5 0-9 2-11 5M52 28c4-2 9-1 12 2M52 28c-2-4-6-6-9-6M52 28c3-4 7-5 10-4"/><path class="s" d="M62 60l1-12M66 60l-1-14M70 60l2-11M100 60l1-13M104 60l-1-10M108 60l2-12"/><path class="l o" d="M84 62h16l-3 2h-10Z"/>` },
  torre: { place: 'El ojo del remolino', lore: 'Quince pisos de una torre que no debería estar ahí. Arriba de todo, alguien sabe tu nombre.', n: 'V', font: "'Cinzel', 'Special Elite', serif", acc: '#ffd27a', sky: '#3e1f60, #0c0716 75%',
    art: `<path class="s l o" d="M60 30C18 22 22 56 62 50C104 44 98 8 58 14C30 18 34 40 60 36"/><path d="M0 72V66Q60 62 120 66V72Z"/><path d="M51 68V14L60 4L69 14V68Z"/><path class="l" d="M55 20h3v3h-3ZM62 28h3v3h-3ZM55 38h3v3h-3ZM62 48h3v3h-3ZM55 56h3v3h-3Z"/>` },
  castillo: { place: 'Cordillera de los Andes', lore: 'Un castillo gaucho enterrado en la nieve. Cuatro mates elementales, un dragón que duerme y la Gran Guerra esperando del otro lado.', n: 'VI', font: "'UnifrakturMaguntia', 'Cinzel', serif", acc: '#a8ccff', sky: '#7090b8, #0e1628 75%',
    art: `<path class="m" d="M0 72L20 36L32 48L54 16L74 42L90 26L120 58V72Z"/><path class="l o" d="M50 22L54 16L58 22L55 21L53 23Z"/><path d="M28 72V52h5v-4h3v4h4v-4h3v4h5V40h-2v-4h3v-3h3v3h3v4h-2v12h5v-4h3v4h4v-4h3v4h5v20Z"/><path d="M26 52V42l4-6l4 6v10ZM80 52V42l4-6l4 6v10Z"/><path d="M78 72V52h12v20Z"/><path class="l" d="M49.5 43h2v3h-2ZM82.5 58h3v4h-3Z"/>` },
};

const lookOf = (id) => MAP_LOOK[id] || { n: '', place: '', lore: '', font: 'inherit', acc: '#ff3b2a', sky: '#222, #000', art: '' };
// Lo que cambia en el cartel con el otro modo (el Challenge de la torre).
const MODE_LOOK = {
  challenge: { place: 'Challenge · sin historia', lore: 'Los pisos no tienen centro: el que se cae, cae hasta el fondo. Los muertos corren desde la primera ronda, los minijefes no dan respiro y el remolino se ensaña. Arriba de todo, la Supernova.', acc: '#ff4f9a' },
};
const modeName = (id, mode) => MAP_MODES[id]?.find((m) => m.id === mode && m.id !== 'story')?.name || '';
const vars = (L) => `--acc:${L.acc};--font:${L.font};--sky:${L.sky}`;
const postcard = (L) => `<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${L.art}</svg>`;

// Botón con el capítulo elegido (título y sala).
export const mapChip = () =>
  `<button class="mdu-curmap" data-act="maps" data-curmap>
    <span class="mdu-curmap__art"></span>
    <span class="mdu-curmap__txt"><small></small><b></b></span>
    <span class="mdu-curmap__go">Cambiar mapa<i aria-hidden="true">›</i></span>
  </button>`;

// La pantalla de elegir.
export const mapScreen = () =>
  `<p class="mdu-mapsel__kicker">Mate der Untoten</p>
   <h2 class="mdu-mapsel__h">Elegí el capítulo</h2>
   <div class="mdu-mapsel__list" role="group" aria-label="Mapa">${MAP_LIST.map((m) => {
     const L = lookOf(m.id);
     return `<button class="mdu-chap" data-map="${m.id}" aria-pressed="false" style="${vars(L)}">
       <span class="mdu-chap__n">${L.n}</span>
       <span class="mdu-chap__art">${postcard(L)}</span>
       <span class="mdu-chap__txt"><b>${m.name}</b><small>${L.place}</small></span>
       <span class="mdu-chap__best" data-bestof="${m.id}"></span>
     </button>`;
   }).join('')}</div>
   <div class="mdu-mapsel__modes" data-modes hidden></div>
   <div class="mdu-list mdu-mapsel__acts">
     <button class="mdu-btn" data-act="play" data-mapsplay>Jugar este mapa</button>
     <button class="mdu-btn" data-act="mapsBack">Volver</button>
   </div>
   <aside class="mdu-mapsel__hero" data-hero aria-live="polite">
     <p class="mdu-mapsel__cap"></p>
     <h3 class="mdu-mapsel__name"></h3>
     <p class="mdu-mapsel__sub"></p>
     <p class="mdu-mapsel__lore"></p>
     <p class="mdu-mapsel__best"></p>
   </aside>`;

// Cartel grande del capítulo `id` (el elegido o el que está bajo el mouse).
function showHero(screen, id, g) {
  const m = MAP_LIST.find((x) => x.id === id);
  const hero = screen.querySelector('[data-hero]');
  if (!m || !hero) return;
  // (el mapa elegido en su modo; el que se espía, en el de siempre)
  const mode = id === g.mapId ? g.modeNow : 'story';
  const L = { ...lookOf(id), ...(MODE_LOOK[mode] || {}) };
  hero.setAttribute('style', vars(L));
  hero.classList.toggle('is-peek', id !== g.mapId);
  hero.classList.toggle('is-challenge', mode === 'challenge');
  const best = g.bestOf(id, mode);
  hero.querySelector('.mdu-mapsel__cap').textContent = `Capítulo ${L.n} · ${L.place}`;
  hero.querySelector('.mdu-mapsel__name').textContent = m.name;
  hero.querySelector('.mdu-mapsel__sub').textContent = m.sub;
  hero.querySelector('.mdu-mapsel__lore').textContent = L.lore;
  hero.querySelector('.mdu-mapsel__best').textContent = best ? `Tu récord: ronda ${best}` : 'Todavía no lo jugaste';
  // la entrada se repite en cada cambio
  hero.classList.remove('is-in');
  void hero.offsetWidth;
  hero.classList.add('is-in');
}

// Pone al día botones, lista y cartel con el mapa elegido.
export function syncMapUI(root, g, screen) {
  const L = lookOf(g.mapId);
  const m = MAP_LIST.find((x) => x.id === g.mapId);
  const md = modeName(g.mapId, g.modeNow);
  for (const c of root.querySelectorAll('[data-curmap]')) {
    c.setAttribute('style', vars(L));
    c.querySelector('.mdu-curmap__art').innerHTML = postcard(L);
    c.querySelector('small').textContent = `Capítulo ${L.n} · ${L.place}`;
    c.querySelector('b').textContent = (m?.name || '') + (md ? ` · ${md}` : '');
    c.disabled = !!g.net?.guest;
  }
  if (!screen) return;
  // los modos del mapa elegido (la torre: Historia o Challenge)
  const box = screen.querySelector('[data-modes]');
  const modes = MAP_MODES[g.mapId];
  if (box) {
    box.hidden = !modes;
    box.innerHTML = modes
      ? `<span class="mdu-mapsel__modes-k">Modo</span>${modes
          .map((x) => `<button class="mdu-mode${x.id === 'challenge' ? ' mdu-mode--reto' : ''}" data-mode="${x.id}" aria-pressed="${x.id === g.modeNow}"${g.net?.guest ? ' disabled' : ''}><b>${x.name}</b><small>${x.sub}</small>${g.bestOf(g.mapId, x.id) ? `<em>R${g.bestOf(g.mapId, x.id)}</em>` : ''}</button>`)
          .join('')}`
      : '';
  }
  for (const b of screen.querySelectorAll('[data-map]')) {
    b.setAttribute('aria-pressed', String(b.dataset.map === g.mapId));
    b.disabled = !!g.net?.guest;
  }
  for (const e of screen.querySelectorAll('[data-bestof]')) {
    const best = g.bestOf(e.dataset.bestof);
    e.textContent = best ? `R${best}` : '';
    e.title = best ? `Tu récord: ronda ${best}` : '';
  }
  showHero(screen, g.mapId, g);
}

// Mouse o foco del teclado sobre un capítulo: se adelanta su cartel.
export function wireMapScreen(screen, g) {
  const list = screen.querySelector('.mdu-mapsel__list');
  let shown = null;
  const peek = (e) => {
    const id = e.target.closest('[data-map]')?.dataset.map;
    if (id && id !== shown) {
      shown = id;
      showHero(screen, id, g);
    }
  };
  const back = () => {
    if (shown === g.mapId) return;
    shown = g.mapId;
    showHero(screen, g.mapId, g);
  };
  list.addEventListener('pointerover', peek);
  list.addEventListener('focusin', peek);
  list.addEventListener('pointerleave', back);
  list.addEventListener('focusout', back);
}
