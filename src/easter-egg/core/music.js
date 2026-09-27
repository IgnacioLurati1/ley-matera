import { streamSong, songOn } from '../world/SongEgg';
import { MAP_ID } from '../config/map';

// La música de las escenas: las entradas de cada mapa, las peleas contra los
// jefes, algunas cinemáticas y la muerte. Son mp3 de /public/assets/sotano/
// musica que se escuchan de a poco (streaming) por el bus de la música; suena
// una sola a la vez (la que arranca apaga a la anterior).
//  · boom: el segundo del golpe fuerte del principio. hit() arranca la
//    canción de modo que ese golpe caiga justo cuando aparece el jefe.
//  · loop [desde, hasta]: si la pelea dura más que la canción, al llegar a
//    `hasta` (antes del final que se apaga) vuelve a `desde`.
//  · gain: para que todas suenen parejas (algunas vienen muy fuertes).
// Cada una se apaga sola cuando deja de valer lo que pidió quien la puso
// (while: la pelea terminó, se volvió al menú...).
const DIR = '/assets/sotano/musica/';

export const TRACKS = {
  'intro-molino': { name: 'Intro del molino', gain: 1 },
  'intro-granja': { name: 'Intro de La Tapera', gain: 0.68 },
  'intro-penal': { name: 'Intro de Mate of the Dead', gain: 1 },
  'intro-torre': { name: 'Intro de la torre', gain: 0.83 },
  'intro-castillo': { name: 'Intro de Der Mateendrache', gain: 1 },
  'intro-esteros': { name: 'Intro de Mate no Numa', gain: 0.96 },
  // (el golpe fuerte del principio, a los 3,82 s: la subida suena antes y el
  // Mandinga aparece justo en el golpe; antes arrancaba cuando ya estaba)
  'jefe-molino': { name: 'Pelea final del molino', gain: 0.98, boom: 3.82, loop: [2, 193] },
  'jefe-granja': { name: 'Pelea de La Tapera', gain: 0.94, loop: [2, 236] },
  'jefe-penal': { name: 'Pelea contra el Gauchito Gil', gain: 0.6, boom: 3.1, loop: [3.1, 55.5] },
  // (el golpe de verdad es a los 23,9 s, donde se descarga todo: el de 10,75
  // es un pico chico de la intro y el de 20,6 arranca la subida que lo arma)
  'jefe-torre': { name: 'Pelea contra Francisco', gain: 0.66, boom: 23.9, loop: [23.9, 173] },
  'jefe-esteros': { name: 'Pelea contra el Luisón', gain: 0.77, boom: 33.9, loop: [33.9, 375.5] },
  'jefe-generico': { name: 'La vanguardia', gain: 0.97, loop: [2, 122.5] },
  // la otra de los jefes de ronda (sale una u otra al azar)
  'jefe-generico-2': { name: 'Pelea de los jefes de ronda', gain: 0.97, loop: [2, 190.5] },
  'defensa-granja': { name: 'La defensa del yerbal', gain: 0.95 },
  'cine-castillo-medio': { name: 'El origen de los mates', gain: 1 },
  'cine-castillo-caballeros': { name: 'Lo que dicen los caballeros', gain: 0.91 },
  'cine-penal-final': { name: 'El final del penal', gain: 1 },
  'cine-esteros-traicion': { name: 'La traición del Gauchito Gil', gain: 1 },
  'muerte-penal': { name: 'Muerte (penal)', gain: 0.7 },
  muerte: { name: 'Muerte', gain: 0.64 },
};

// Hasta dónde suena la del final del penal: ahí se acaba la paz (el Gil
// levanta la cabeza para decir algo) y se va con un fundido. La escena estira
// la calma hasta acá. (La canción termina sola a los 51,5 s, pero la escena
// es la corta: el usuario la quiere desde el principio y con la escena igual,
// así que se funde a los 39,7 s, donde antes llegaba arrancando en el 11,8.)
export const PENAL_PEACE = 39.7;
// Y desde dónde arranca: desde el principio (arrancarla en el 11,8 para
// acortar la escena la cortaba en medio de una frase y quedaba horrible).
export const PENAL_FROM = 0;
// La del Luisón arranca pasada su intro larga: desde acá hasta el golpe
// (boom) es el suspenso mientras llega del oeste.
export const LUISON_FROM = 22;

const now = () => performance.now() / 1000;

export default class Music {
  constructor(game) {
    this.g = game;
    this.cur = null;
    // (Alt+I) la escena de prueba que falta disparar cuando arranque la partida
    this.jump = null;
  }

  // Pone una canción. at: desde qué segundo; delay: cuánto esperar antes de
  // arrancarla; fadeIn: entra de a poco; loop: da la vuelta (las peleas);
  // while(g): mientras dé true sigue sonando (si no, se apaga sola).
  play(id, { at = 0, delay = 0, fadeIn = 0, loop = false, while: keep = null } = {}) {
    const T = TRACKS[id];
    if (!T || !this.g.audio?.ctx) return false;
    this.stop(0.8);
    this.cur = { id, T, at, loop: loop ? T.loop : null, keep, fadeIn, startAt: now() + delay, song: null, asked: 0 };
    if (delay <= 0) this.begin(this.cur);
    return true;
  }

  // Una pelea: que el golpe del principio caiga dentro de `secs` segundos
  // (cuando aparece el jefe). Da la vuelta sola.
  hit(id, secs, opts = {}) {
    const b = TRACKS[id]?.boom || 0;
    return this.play(id, { loop: true, ...opts, at: Math.max(0, b - secs), delay: Math.max(0, secs - b) });
  }

  begin(job) {
    const g = this.g;
    job.asked = now();
    job.song = streamSong(
      g,
      DIR + job.id + '.mp3',
      () => {
        if (this.cur === job) this.cur = null;
      },
      { at: job.at, gain: job.fadeIn ? 0.0001 : job.T.gain, cut: false },
    );
    if (!job.song) {
      if (this.cur === job) this.cur = null;
      return;
    }
    if (job.fadeIn) job.song.level(job.T.gain, job.fadeIn);
    // lo que tardó en cargar se recupera adelantándola (así el golpe no llega tarde)
    const el = job.song.el;
    el?.addEventListener(
      'playing',
      () => {
        const lag = now() - job.asked;
        if (this.cur === job && job.at > 0 && lag > 0.08 && job.song?.el) job.song.el.currentTime += lag;
      },
      { once: true },
    );
  }

  // Se apaga en `fade` segundos (0: de golpe).
  stop(fade = 1.5) {
    const j = this.cur;
    this.cur = null;
    if (!j?.song) return;
    if (fade > 0) j.song.fade(fade);
    else j.song.stop();
  }

  is(id) {
    return this.cur?.id === id;
  }

  // Por dónde va la que suena (segundos), o -1.
  time() {
    const el = this.cur?.song?.el;
    return el && !el.paused ? el.currentTime : -1;
  }

  // Cada cuadro (también en el título y en la pantalla del final).
  tick(dt = 1 / 60) {
    const g = this.g;
    const j = this.cur;
    if (j) {
      if (j.keep && !j.keep(g)) this.stop(2.2);
      else if (!j.song && now() >= j.startAt) this.begin(j);
      else if (j.loop && j.song?.el && j.song.el.currentTime >= j.loop[1]) j.song.el.currentTime = j.loop[0];
    }
    // los jefes sin canción propia (los de las rondas, el Sargento, los del
    // easter egg): la de pelea que sirve para todo, mientras viva ese jefe. No
    // en las arenas (tienen la suya), en las escenas ni con una canción de
    // easter egg sonando.
    // (el Cuervo de La Tapera y de la torre no es g.zombies.boss: va aparte)
    const zb = g.zombies?.boss;
    const cz = g.crow?.z;
    const b = zb && !zb.dead ? zb : cz?.active && !cz.dead ? cz : null;
    if (!this.cur && b && g.state === 'playing' && !g.arena?.active && !g.ee?.scene && !g.intro?.active && !songOn()) {
      this.play(Math.random() < 0.5 ? 'jefe-generico' : 'jefe-generico-2', { loop: true, while: (G) => (G.zombies?.boss === b || (G.crow?.z === b && b.active)) && !b.dead && (G.state === 'playing' || G.state === 'paused') });
    }
    // (Alt+I) arrancó la partida: se salta a la escena elegida
    const J = this.jump;
    if (J && g.state === 'playing' && !g.menuOpen) {
      if (J.intro) {
        this.jump = null;
        return;
      }
      if (g.intro?.active) {
        if (!g.intro.out) g.intro.end(false);
        return;
      }
      J.wait = (J.wait ?? 1.2) - dt;
      if (J.wait > 0) return;
      this.jump = null;
      // (una escena de prueba: el easter egg de esta partida no cuenta, core/eggs.js)
      g.cheated = true;
      try {
        J.go(g);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

// ---------------- Alt+I: las escenas con música, para probarlas ----------------
// Cada una: mapa, nombre, la canción y cómo se llega (go, ya jugando y sin la
// entrada). Las entradas son la partida misma (intro: true).
const INTROS = [
  ['molino', 'El molino'],
  ['granja', 'La Tapera'],
  ['penal', 'Mate of the Dead'],
  ['torre', 'La torre'],
  ['castillo', 'Der Mateendrache'],
  ['esteros', 'Mate no Numa'],
];

// Pelea en la arena del mapa: el easter egg listo, todo abierto y adentro.
const arena = (g) => {
  g.godMode = true;
  g.cheatFinal();
  g.arena.start();
};

export const SCENES = [
  ...INTROS.map(([map, name]) => ({ id: `intro-${map}`, map, group: 'Entradas', name: `Entrada: ${name}`, track: `intro-${map}`, intro: true })),
  { id: 'jefe-molino', map: 'molino', group: 'Jefes', name: 'Pelea final del molino (el Mandinga)', track: 'jefe-molino', go: arena },
  { id: 'jefe-granja', map: 'granja', group: 'Jefes', name: 'La Tapera: el Espantapájaros', track: 'jefe-granja', go: arena },
  { id: 'jefe-penal', map: 'penal', group: 'Jefes', name: 'Mate of the Dead: el Gauchito Gil', track: 'jefe-penal', go: arena },
  { id: 'jefe-torre', map: 'torre', group: 'Jefes', name: 'La torre: Francisco', track: 'jefe-torre', go: arena },
  {
    id: 'defensa-granja',
    map: 'granja',
    group: 'Jefes',
    name: 'La Tapera: la defensa del yerbal (la horda y el Cuervo)',
    track: 'defensa-granja',
    go: (g) => {
      g.godMode = true;
      g.ee.defense.start(g.rounds);
    },
  },
  {
    id: 'jefe-esteros',
    map: 'esteros',
    group: 'Jefes',
    name: 'Mate no Numa: el Luisón (desde que llevás la luz)',
    track: 'jefe-esteros',
    go: (g) => {
      g.godMode = true;
      g.ee.debugLuison();
    },
  },
  {
    id: 'jefe-generico',
    map: 'castillo',
    group: 'Jefes',
    name: 'Der Mateendrache: la vanguardia (Caballeros Negros)',
    track: 'jefe-generico',
    go: (g) => {
      g.godMode = true;
      g.addPoints(100000, null, true);
      g.ee.debugStep(7);
    },
  },
  {
    id: 'cine-castillo-medio',
    map: 'castillo',
    group: 'Cinemáticas',
    name: 'Der Mateendrache: el origen de los mates (Fierro en el fogón)',
    track: 'cine-castillo-medio',
    go: (g) => {
      g.godMode = true;
      g.ee.startOrigin();
    },
  },
  {
    id: 'cine-castillo-caballeros',
    map: 'castillo',
    group: 'Cinemáticas',
    name: 'Der Mateendrache: lo que dicen los cuatro caballeros (el final)',
    track: 'cine-castillo-caballeros',
    go: (g) => {
      g.win();
      // directo al negro de los caballeros
      const c = g.cine;
      const i = c?.script?.findIndex(([, fn]) => String(fn).includes('knightsWord')) ?? -1;
      if (i > 0) {
        c.step = i;
        c.next = c.t;
      }
    },
  },
  {
    id: 'cine-penal-final',
    map: 'penal',
    group: 'Cinemáticas',
    name: 'Mate of the Dead: el final (hasta que habla el Gil)',
    track: 'cine-penal-final',
    go: (g) => g.win(),
  },
  {
    id: 'cine-esteros-traicion',
    map: 'esteros',
    group: 'Cinemáticas',
    name: 'Mate no Numa: la traición del Gauchito Gil',
    track: 'cine-esteros-traicion',
    go: (g) => {
      const E = g.ee;
      E.step = 5;
      E.startEnding();
      // hasta la elección y Gil sella el pacto
      g.later(0.5, () => E.scene?.cine.skip());
      g.later(1.5, () => E.choose('kill'));
    },
  },
  // Las de mitad de partida (y los finales) que no tienen canción propia:
  // igual van, para poder verlas (el usuario, 2026-09-26).
  { id: 'cine-penal-yerba', map: 'penal', group: 'Cinemáticas', name: 'Mate of the Dead: la Voz de Arriba y la yerba de oro', go: (g) => g.ee.startYerbaScene() },
  {
    id: 'cine-torre-canon',
    map: 'torre',
    group: 'Cinemáticas',
    name: 'La torre: el cañonazo al ojo de la tormenta',
    go: (g) => {
      g.godMode = true;
      g.ee.debugFinal();
      g.ee.step = 6;
      g.ee.fire();
    },
  },
  {
    id: 'cine-torre-caida',
    map: 'torre',
    group: 'Cinemáticas',
    name: 'La torre: se rompe la escalera divina (la caída al Infierno)',
    go: (g) => {
      g.godMode = true;
      g.ee.debugFinal();
      g.ee.openStair();
      g.ee.breakStair();
    },
  },
  {
    id: 'cine-castillo-vuelo',
    map: 'castillo',
    group: 'Cinemáticas',
    name: 'Der Mateendrache: el vuelo a la Gran Guerra',
    go: (g) => {
      g.godMode = true;
      // (desde la cumbre, como en el juego: con el dragón en el techo el
      // vuelo daba una vuelta en U al despegar)
      g.ee.debugFinal();
      g.ee.startWar();
    },
  },
  {
    id: 'cine-esteros-salvados',
    map: 'esteros',
    group: 'Cinemáticas',
    name: 'Mate no Numa: el final donde Antonio los salva',
    go: (g) => {
      const E = g.ee;
      E.step = 5;
      E.startEnding();
      g.later(0.5, () => E.scene?.cine.skip());
      g.later(1.5, () => E.choose('spare'));
    },
  },
  { id: 'cine-molino-final', map: 'molino', group: 'Cinemáticas', name: 'El molino: el final', go: (g) => g.win() },
  { id: 'cine-granja-final', map: 'granja', group: 'Cinemáticas', name: 'La Tapera: el final', go: (g) => g.win() },
  { id: 'cine-torre-final', map: 'torre', group: 'Cinemáticas', name: 'La torre: el final (Francisco y el Chiquitijuein)', go: (g) => g.win() },
  { id: 'muerte-penal', map: 'penal', group: 'Muerte', name: 'Muerte en Mate of the Dead', track: 'muerte-penal', go: (g) => g.gameOver(true) },
  { id: 'muerte', map: 'molino', group: 'Muerte', name: 'Muerte (los demás mapas)', track: 'muerte', go: (g) => g.gameOver(true) },
];

// La canción de la muerte según el mapa.
export const deathTrack = () => (MAP_ID === 'penal' ? 'muerte-penal' : 'muerte');
