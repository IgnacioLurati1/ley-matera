// (primero: este módulo lee globalThis.__mduEclipse al cargarse, y en el
// paquete publicado el orden de carga lo da quién importa a quién. Sin esta
// línea la marca se ponía después y Eclipse no aparecía)
import './eclipseFlag';
import { streamSong, songOn } from '../world/SongEgg';
import { MAP_ID } from '../config/map';
import { assetUrl } from '../../lib/assets';

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

// Baja una canción de antes (queda en la caché del navegador): la que tiene
// que arrancar justo en un golpe (la llegada del Luisón, la puñalada de la
// traición) ya no espera a la red. Una vez por canción.
const fetched = new Set();
export function prefetchTrack(id) {
  if (fetched.has(id) || !TRACKS[id]) return;
  fetched.add(id);
  try {
    fetch(assetUrl(DIR + id + '.mp3')).catch(() => {});
  } catch {
    /* sin red: se baja al arrancar */
  }
}

// La pelea de Gil en la cárcel: desde un poco antes del corte (la parte fuerte
// entra con la llegada) y la vuelta adentro de la parte fuerte (15 compases).
export const PENAL_CARCEL = { at: 27.2, loop: [32.14, 54.64] };

export const TRACKS = {
  'intro-molino': { name: 'Intro del molino', gain: 1 },
  'intro-granja': { name: 'Intro de La Tapera', gain: 0.68 },
  'intro-penal': { name: 'Intro de Mate of the Dead', gain: 1 },
  'intro-torre': { name: 'Intro de la torre', gain: 0.83 },
  'intro-castillo': { name: 'Intro de Der Mateendrache', gain: 1 },
  'intro-esteros': { name: 'Intro de Mate no Numa', gain: 0.96 },
  // el Himno Nacional (la introducción orquestal): los primeros 45 s, con
  // fundido al final (la grabación viene ~3 dB más fuerte que las otras)
  'intro-monumento': { name: 'Intro del Monumento al Mate', gain: 0.73 },
  // Aurora ("Alta en el cielo", la canción a la bandera) para el final de
  // Belgrano (entities/MonumentoEgg.playEnding); debajo de las voces
  'fin-monumento': { name: 'El final del Monumento (Aurora)', gain: 0.5 },
  // (el golpe fuerte del principio, a los 3,82 s: la subida suena antes y el
  // Mandinga aparece justo en el golpe; antes arrancaba cuando ya estaba)
  'jefe-molino': { name: 'Pelea final del molino', gain: 0.98, boom: 3.82, loop: [2, 193] },
  'jefe-granja': { name: 'Pelea de La Tapera', gain: 0.94, loop: [2, 236] },
  // (dura 58 s: antes daba la vuelta del final al golpe del principio y sonaba a
  // que arrancaba de nuevo. A 160 bpm: intro hasta los 28 s, un corte y la
  // parte fuerte desde los 30,07. En el cerro da la vuelta dentro de la intro
  // (12 compases que empalman); al pasar a la cárcel world/Cerro.js salta al
  // corte y la vuelta queda en la parte fuerte: PENAL_CARCEL)
  'jefe-penal': { name: 'Pelea contra el Gauchito Gil', gain: 0.6, boom: 3.1, loop: [5.2, 23.2] },
  // (el golpe de verdad es a los 23,9 s, donde se descarga todo: el de 10,75
  // es un pico chico de la intro y el de 20,6 arranca la subida que lo arma)
  'jefe-torre': { name: 'Pelea contra Francisco', gain: 0.66, boom: 23.9, loop: [23.9, 173] },
  // (un poco más fuerte: 0,77 → 0,92, +1,5 dB; el usuario, 2026-10-05)
  'jefe-esteros': { name: 'Pelea contra el Luisón', gain: 0.92, boom: 33.9, loop: [33.9, 375.5] },
  'jefe-generico': { name: 'La vanguardia', gain: 0.97, loop: [2, 122.5] },
  // la otra de los jefes de ronda (sale una u otra al azar)
  'jefe-generico-2': { name: 'Pelea de los jefes de ronda', gain: 0.97, loop: [2, 190.5] },
  'defensa-granja': { name: 'La defensa del yerbal', gain: 0.95 },
  // el Desgarro Cósmico de Eclipse Matero (entities/eclipse/Desgarro10.js): el coro
  // (Fantasy Choir 2 de cesisco, CC0; a -12 LUFS)
  'desgarro-eclipse': { name: 'El Desgarro Cósmico', gain: 0.85 },
  // San Lorenzo (entities/eclipse/SanLorenzo.js): la pelea (Epic Boss Battle, Junkala, CC0; da la vuelta sin costura) y el clímax, la Marcha
  'jefe-eclipse': { name: 'El Combate de San Lorenzo', gain: 0.8, loop: [0.05, 123.3] },
  // (sesión 1f, el usuario: "¿quién eligió esta Marcha? Se escucha espantosa": la
  // de la Banda de la Infantería de Marina de EE.UU. —"The President's Own",
  // 1992—, dominio público: obra del gobierno de EE.UU.; Silva murió en 1920.
  // Wikimedia Commons, San_Lorenzo_-_U.S._Marine_Band.ogg. Entera, de la
  // introducción al acorde final)
  'marcha-san-lorenzo': { name: 'La Marcha de San Lorenzo', gain: 1, loop: [0.1, 230.4] },
  // el final de Eclipse Matero (ui/EclipseEnding.js): de fondo, bajita, del
  // santuario a cuando se cose el universo (Determined Pursuit, Emma_MA, CC0)
  'cine-eclipse-final': { name: 'El final de Eclipse Matero', gain: 0.45 },
  // (sesión 1f, el usuario: "casi toda la cinemática no tiene música": dos más,
  // "Ending Scene" de nene en OpenGameArt, CC0 1.0 —la orquestal y la
  // original—, una para San Lorenzo y el estero y otra para el fogón)
  'fin-eclipse-a': { name: 'El final de Eclipse Matero: la despedida', gain: 0.55 },
  'fin-eclipse-b': { name: 'El final de Eclipse Matero: el fogón', gain: 0.5 },
  // (2026-10-07, el usuario: "cierre el telón con música épica final ... y
  // pantalla final con música épica") el telón: "The Final Battle" de
  // skrjablin (OpenGameArt, CC0), de 48 a 100 s; la pantalla final: "Ending
  // Scene V3" de nene (OpenGameArt, CC0), desde 40 s (sube al final grande)
  'fin-eclipse-telon': { name: 'El final de Eclipse Matero: el telón', gain: 0.6 },
  // (loop: la vuelta que pide ui/overEclipse.js —2026-10-08—: de donde abre la
  // pieza, a los 20 s, a cuando ya se apagó la coda, a los 64,6 s)
  'fin-eclipse-pantalla': { name: 'El final de Eclipse Matero: la pantalla final', gain: 0.55, loop: [20, 64.6] },
  // la entrada de Eclipse Matero (ui/eclipseIntro.js): 32 s de silencio y la
  // pelea de San Lorenzo, que entra con el choque del sol y la luna
  'intro-eclipse': { name: 'Intro de Eclipse Matero', gain: 0.8 },
  // (2026-10-08, el usuario: "lo más flojo de todo es la música: son todas muy
  // malas, se repiten como loco, transicionan raro. Te dejé una carpeta con
  // nuevas canciones". Las suyas, de Desktop\Musica eclipse, a 192k: la intro
  // ("intro mapa"), el comienzo de la pelea ("comienzo pelea final", +2 dB) y
  // las del final —el sacrificio, el funeral, el fogón (+5 dB) y la pantalla
  // final (-1 dB)—, una por parte y sin repetir)
  'intro-eclipse-2': { name: 'Intro de Eclipse Matero (la del usuario)', gain: 0.8 },
  'pelea-eclipse-inicio': { name: 'San Lorenzo: el comienzo de la pelea', gain: 1 },
  'fin8-sacrificio': { name: 'El final de Eclipse Matero: el sacrificio del Gil', gain: 0.6 },
  'fin8-funeral': { name: 'El final de Eclipse Matero: el funeral del Gauchito', gain: 0.48 },
  'fin8-fogon': { name: 'El final de Eclipse Matero: el fogón', gain: 0.85 },
  'fin8-pantalla': { name: 'El final de Eclipse Matero: la pantalla final', gain: 0.55, loop: [0.1, 192.4] },
  // la escena de Cabral (entities/eclipse/slCabral.js). El usuario: "la escena
  // de Cabral no tiene ningún tipo de música", y entre las suyas no había una
  // para esto. "Hero Suite A" de dime (OpenGameArt, CC0: sin crédito
  // obligatorio; opengameart.org/content/hero-suite-a), hecha para cortarse en
  // tramos donde el foco es el héroe: "danger melody" (40 s) para la carga y la
  // pelea, "solo violin" (61 s) para la muerte. Las dos a -14,8 / -14,2 LUFS.
  'cabral-peligro': { name: 'San Lorenzo: Cabral salva a San Martín', gain: 0.55 },
  'cabral-violin': { name: 'San Lorenzo: la muerte de Cabral', gain: 0.5 },
  // el asedio del castillo (entities/castle/Asedio.js), después de los campanazos
  // (la eligió el usuario; al final tiene 4 s de silencio: da la vuelta antes)
  'asedio-castillo': { name: 'El asedio', gain: 1, loop: [0, 116] },
  // el baile del estero (entities/esteros/Thriller.js; el tramo que se baila, recortado)
  'baile-esteros': { name: 'El baile del estero', gain: 0.8 },
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
  // while(g): mientras dé true sigue sonando (si no, se apaga sola); gain: otro
  // volumen que el de la lista (la pantalla final de Eclipse, ui/overEclipse.js).
  play(id, { at = 0, delay = 0, fadeIn = 0, loop = false, while: keep = null, gain = null } = {}) {
    const T = TRACKS[id];
    if (!T || !this.g.audio?.ctx) return false;
    this.stop(0.8);
    this.cur = { id, T, at, loop: loop ? T.loop : null, keep, fadeIn, startAt: now() + delay, song: null, asked: 0, gain: gain ?? T.gain };
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
      { at: job.at, gain: job.fadeIn ? 0.0001 : job.gain, cut: false },
    );
    if (!job.song) {
      if (this.cur === job) this.cur = null;
      return;
    }
    if (job.fadeIn) job.song.level(job.gain, job.fadeIn);
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

  // Salta a otra parte de la que suena y cambia su vuelta (la segunda fase de
  // una pelea). false si no hay ninguna sonando.
  jumpTo(at, loop = null) {
    const j = this.cur;
    if (!j?.song?.el) return false;
    j.song.el.currentTime = at;
    if (loop) j.loop = loop;
    return true;
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
    // (g.defense.quiet: el asedio del castillo no lleva música, ni esta)
    if (!this.cur && b && g.state === 'playing' && !g.arena?.active && !g.ee?.scene && !g.intro?.active && !songOn() && !g.defense?.quiet) {
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
  ['monumento', 'Monumento al Mate'],
];

// Los mates nuevos de la caja (2026-10-08), en la mano: sin mejorar, con el
// Pack-a-Pava y con el elemento (config/weapons.js; el mapa: donde sale cada uno).
const nuevoMate = (id, map, name, pap) =>
  [
    [0, name],
    [1, `${pap} (PaP)`],
    [2, `${pap} (PaP + elemento)`],
  ].map(([up, n]) => ({ id: `mate-${id}-${up}`, map, group: 'Mates nuevos', name: n, go: (g) => g.weapons.give(id, up) }));

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
  // la Noche de la Luz Mala del molino (entities/LuzMala.js), con modo dios
  {
    id: 'noche-molino',
    map: 'molino',
    group: 'Jefes',
    name: 'El molino: la Noche de la Luz Mala (las luces y el Capataz Maldito)',
    go: (g) => {
      g.godMode = true;
      g.ee.noche?.debugStart();
    },
  },
  // el motín del penal (entities/penalMotin.js): la sirena, las celdas y el Alcaide, con modo dios
  {
    id: 'motin-penal',
    map: 'penal',
    group: 'Jefes',
    name: 'Mate of the Dead: el motín (las celdas, los tableros y el Alcaide)',
    go: (g) => {
      g.godMode = true;
      g.ee.motin?.debugStart();
    },
  },
  {
    id: 'jefe-esteros',
    map: 'esteros',
    group: 'Jefes',
    name: 'Mate no Numa: la llegada del Luisón (la horda en el algarrobo) y la pelea',
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
  // el asedio del castillo (entities/castle/Asedio.js): ya, con modo dios
  {
    id: 'asedio-castillo',
    map: 'castillo',
    group: 'Jefes',
    name: 'Der Mateendrache: el asedio (catapultas, escaleras y el ariete)',
    track: 'asedio-castillo',
    go: (g) => {
      g.godMode = true;
      g.ee.asedio?.debugStart();
    },
  },
  // el Desgarro Cósmico de Eclipse Matero (entities/eclipse/Desgarro10.js): ya, con
  // modo dios (la entrada existe solo con el mapa prendido: __mduEclipse)
  ...(globalThis.__mduEclipse === true
    ? [
        {
          id: 'desgarro-eclipse',
          map: 'eclipse',
          group: 'Jefes',
          name: 'Eclipse Matero: el Desgarro Cósmico (los jinetes y la cúpula)',
          track: 'desgarro-eclipse',
          go: (g) => {
            g.godMode = true;
            g.ee.d10?.debugStart();
          },
        },
        // San Lorenzo (entities/eclipse/SanLorenzo.js): la pelea desde la llegada, y la escena de Cabral
        { id: 'san-lorenzo', map: 'eclipse', group: 'Jefes', name: 'Eclipse Matero: el Combate de San Lorenzo (desde la llegada)', track: 'jefe-eclipse', go: (g) => { g.godMode = true; g.ee.debugFinal(); g.ee.sendEgg({ a: 'cebar' }); g.ee.sendEgg({ a: 'corte' }); } },
        { id: 'cine-cabral', map: 'eclipse', group: 'Cinemáticas', name: 'Eclipse Matero: la caída de San Martín y Cabral', go: (g) => { g.godMode = true; g.ee.debugFinal(); g.ee.sendEgg({ a: 'cebar' }); g.ee.sendEgg({ a: 'corte' }); g.later(1.5, () => g.ee.arena?.debugPhase?.(3)); } },
        // la escena del Sable (ui/eclipseCineSable.js): delante de la Llama, prendida
        { id: 'cine-eclipse-sable', map: 'eclipse', group: 'Cinemáticas', name: 'Eclipse Matero: el Sable (el Gil cruza al Monumento)', go: (g) => g.ee.scenes?.debugSableGo?.() },
        // el final (ui/EclipseEnding.js): pone la arena de San Lorenzo y arranca
        { id: 'cine-eclipse-final', map: 'eclipse', group: 'Cinemáticas', name: 'Eclipse Matero: el final (el Gil, el santuario, el fogón y la linterna)', go: (g) => g.ee.scenes?.debugEnding?.() },
        // ---- Atajos de Eclipse Matero (el usuario, 2026-10-06: "andá poniendo en Alt+I todos los atajos") ----
        // (ir a una isla: a la altura de su piso, en el medio; se activan sus zonas)
        ...['centro', 'molino', 'tapera', 'penal', 'monumento', 'torre', 'castillo', 'desgarro'].map((isla) => ({
          id: `ecl-isla-${isla}`,
          map: 'eclipse',
          group: 'Atajos',
          name: `Eclipse: ir a ${isla === 'desgarro' ? 'la Disformidad' : isla === 'centro' ? 'el claro' : 'la isla ' + isla}`,
          go: async (g) => {
            const { ISLANDS } = await import('../config/maps/eclipse');
            const I = ISLANDS[isla];
            if (!I) return;
            const [x, z] = I.center;
            const P = g.player;
            P.pos.set(x, g.world.floorAt(x, z, I.top + 2), z);
            P.vel?.set?.(0, 0, 0);
            for (const k of I.zones) g.activateZone?.(k);
          },
        })),
        { id: 'ecl-guadana', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Desgarrador Cósmico (la común)', go: (g) => g.weapons.cosmic?.give(0) },
        { id: 'ecl-guadana-up', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Desgarrador del Eclipse (la mejorada)', go: (g) => g.weapons.cosmic?.give(1) },
        { id: 'ecl-furia', map: 'eclipse', group: 'Atajos', name: 'Eclipse: la Furia Cósmica llena (H para usarla)', go: (g) => { const C = g.weapons.cosmic; if (!C) return; if (!C.held()) C.give(1); C.kills = 999; } },
        { id: 'ecl-mates', map: 'eclipse', group: 'Atajos', name: 'Eclipse: los siete mates perdidos, juntados (la ronda completa)', go: (g) => g.ee?.mates?.debugAll?.() },
        { id: 'ecl-trampa', map: 'eclipse', group: 'Atajos', name: 'Eclipse: la trampa del desgarro de esta isla, abierta', go: (g) => g.ee?.trampas?.debugOn?.() },
        { id: 'ecl-caos-piso', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Cazador del Caos tirado delante tuyo (el potenciador en el piso)', go: (g) => { const P = g.player; const p = P.pos.clone(); p.x -= Math.sin(P.yaw) * 2.2; p.z -= Math.cos(P.yaw) * 2.2; g.powerups?.drop?.(p, true, 'caos'); } },
        { id: 'ecl-caos', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Cazador del Caos (potenciador, 20 s)', go: (g) => g.powerups?.applyEffect?.('caos', true, false) },
        { id: 'ecl-portales', map: 'eclipse', group: 'Atajos', name: 'Eclipse: todos los portales abiertos', go: (g) => { for (const P of g.ee.portals.list) g.ee.portals.unlock(P.def.id); } },
        { id: 'ecl-luz', map: 'eclipse', group: 'Atajos', name: 'Eclipse: la luz prendida', go: (g) => g.turnOnPower?.() },
        { id: 'ecl-pap-cicatrices', map: 'eclipse', group: 'Atajos', name: 'Eclipse: Pack-a-Pava I, las cuatro grietas cosidas y los pilares puestos (abre la Disformidad)', go: (g) => { g.turnOnPower?.(); const T = g.papq?.termas; if (!T) return; T.skipI(); } },
        { id: 'ecl-pap-ojos', map: 'eclipse', group: 'Atajos', name: 'Eclipse: Pack-a-Pava II, los cuatro ojos abiertos (queda el ritual)', go: (g) => { g.turnOnPower?.(); const T = g.papq?.termas; if (!T) return; T.skipI(); for (const e of T.eyes) T.applyEye(e.i, T.eyeNeed(), true); } },
        { id: 'ecl-pap-ritual', map: 'eclipse', group: 'Atajos', name: 'Eclipse: Pack-a-Pava III, el ritual (en la Disformidad, ya)', go: async (g) => { g.turnOnPower?.(); const T = g.papq?.termas; if (!T) return; T.skipI(); for (const e of T.eyes) T.applyEye(e.i, T.eyeNeed(), true); const P = g.player; P.pos.set(T.pap.x, T.pap.y, T.pap.z + 3); P.vel?.set?.(0, 0, 0); g.ee.portals.unlock(g.ee.portals.darkId ?? 10); T.startRitual(); } },
        { id: 'ecl-pap-listo', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Pack-a-Pava despierto (ritual hecho)', go: (g) => { g.turnOnPower?.(); const T = g.papq?.termas; if (!T) return; T.complete(); g.papq.finish?.(); g.ee.portals.unlock(g.ee.portals.darkId ?? 10); } },
        // los pasos del easter egg (cada uno hecho de golpe)
        ...[['brasa', 'la Brasa (molino)'], ['yerba', 'la Yerba (La Tapera)'], ['bombilla', 'la Bombilla (penal)'], ['agua', 'el Agua (castillo)'], ['calabaza', 'la Calabaza (laguna)'], ['sable', 'el Sable (Monumento)'], ['canon', 'el cañón de Obligado (totalidad)'], ['guadana', 'la guadaña armada (hoja + asta + temple)']].map(([k, n]) => ({
          id: `ecl-paso-${k}`,
          map: 'eclipse',
          group: 'Atajos',
          name: `Eclipse, paso: ${n}`,
          go: (g) => {
            const S = g.ee.steps[k];
            if (!S) return;
            S.st.done = 1;
            if (k === 'guadana') { S.st.hoja = S.st.asta = S.st.forged = 1; if (!g.weapons.cosmic?.held?.()) g.weapons.cosmic?.give(0); }
            if (k === 'canon') { g.ee.totality = true; g.world.eclipse?.set?.(1, 2); }
            S.refresh?.();
            g.ee.got(k, 0);
          },
        })),
        ...[1, 2, 3, 4, 5, 6].map((n) => ({
          id: `ecl-temple-${n}`,
          map: 'eclipse',
          group: 'Atajos',
          name: `Eclipse, el Temple: etapa ${n} (${['', 'el despertar', 'fuego: el brasero del castillo', 'viento: la llama de la cima al algarrobo', 'rayo: el patio del penal', 'hielo: la muela del molino', 'el temple en la Disformidad (con totalidad)'][n]})`,
          go: (g) => {
            const T = g.ee.steps.temple;
            if (!g.weapons.cosmic?.held?.()) g.weapons.cosmic?.give(0);
            g.ee.got_.guadana = 1;
            T.st.on = 1;
            T.st.stage = n;
            if (n === 6) { g.ee.totality = true; g.world.eclipse?.set?.(1, 2); }
            T.refresh?.();
            g.hud?.subtitle?.(T.hint(n), 5);
          },
        })),
        { id: 'ecl-temple-hecho', map: 'eclipse', group: 'Atajos', name: 'Eclipse, el Temple hecho: el Desgarrador del Eclipse', go: (g) => { const T = g.ee.steps.temple; T.st.stage = 7; T.st.done = 1; T.refresh?.(); g.ee.got_.temple = 1; if (!g.weapons.cosmic?.held?.()) g.weapons.cosmic?.give(1); else g.weapons.cosmic?.upgrade(); } },
        { id: 'ecl-todo', map: 'eclipse', group: 'Atajos', name: 'Eclipse: todo junto (como Alt+K: queda cebar en el fogón)', go: (g) => g.ee.debugFinal() },
        { id: 'ecl-cebar', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el Primer Mate cebado (queda el corte con la Furia)', go: (g) => { g.ee.debugFinal(); g.ee.sendEgg({ a: 'cebar' }); } },
        { id: 'ecl-corte', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el corte: a San Lorenzo', go: (g) => { g.ee.debugFinal(); g.ee.sendEgg({ a: 'cebar' }); g.ee.sendEgg({ a: 'corte' }); } },
        ...[0, 1, 2, 3, 4, 5].map((n) => ({
          id: `ecl-arena-${n}`,
          map: 'eclipse',
          group: 'Atajos',
          name: `Eclipse, San Lorenzo fase ${n}: ${['la llegada (el sable)', 'el desembarco', 'El Eclipse y las amarras', 'Cabral', 'Febo asoma (la corona)', 'el final'][n]}`,
          go: (g) => { g.godMode = true; g.ee.debugFinal(); g.ee.sendEgg({ a: 'cebar' }); g.ee.sendEgg({ a: 'corte' }); setTimeout(() => g.ee.arena?.debugPhase?.(n), 800); },
        })),
        { id: 'ecl-choque', map: 'eclipse', group: 'Atajos', name: 'Eclipse: un choque grande en el cielo, ya', go: (g) => { const E = g.world.eclipse; if (!E) return; E.fightT = 0; E.clashBig = true; } },
        { id: 'ecl-totalidad', map: 'eclipse', group: 'Atajos', name: 'Eclipse: la totalidad (el eclipse cerrado)', go: (g) => g.world.eclipse?.set?.(1, 3) },
        { id: 'ecl-normal', map: 'eclipse', group: 'Atajos', name: 'Eclipse: el eclipse como al empezar', go: (g) => g.world.eclipse?.set?.(0.45, 3) },
        ...nuevoMate('caotico', 'eclipse', 'Mate Caótico', 'Lobizón del Caos'),
        // la entrada (ui/eclipseIntro.js): la partida misma
        { id: 'intro-eclipse', map: 'eclipse', group: 'Entradas', name: 'Entrada: Eclipse Matero', track: 'intro-eclipse', intro: true },
      ]
    : []),
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
  // la jura en la cumbre (castle/Juramento.js): el dragón posado y el jugador al lado (como Alt+K)
  {
    id: 'jura-castillo',
    map: 'castillo',
    group: 'Cinemáticas',
    name: 'Der Mateendrache: la jura en la cumbre (antes del dragón)',
    go: (g) => {
      g.godMode = true;
      g.cheatFinal();
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
  // el final entero (ui/CastleEnding.js), por el camino de verdad: el Éter, el
  // duende y el golpe final (la escena arranca sola a los 3 s de gnomeDeath)
  {
    id: 'cine-castillo-final',
    map: 'castillo',
    group: 'Cinemáticas',
    name: 'Der Mateendrache: el final (Fierro, el reinicio y el molino)',
    go: (g) => {
      g.godMode = true;
      g.arena.start();
      g.later(2, () => g.arena.debugStage('gnome'));
      g.later(3.5, () => g.arena.gnomeDeath());
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
  // el final de La Tapera (ui/FarmCinematic.js): la pelea arranca y el
  // Espantapájaros cae solo (sin canción: el usuario, 2026-09-29)
  {
    id: 'fin-granja',
    map: 'granja',
    group: 'Cinemáticas',
    name: 'La Tapera: el final (cae el Espantapájaros)',
    go: (g) => {
      g.godMode = true;
      g.cheatFinal();
      g.arena.start();
      g.later(5, () => g.cheatBoss());
    },
  },
  // el final del Monumento (ui/MonumentoEnding.js): la Bandera, Belgrano y el mate
  { id: 'fin-monumento', map: 'monumento', group: 'Cinemáticas', name: 'Monumento: el final (la Primera Bandera y Belgrano)', track: 'fin-monumento', go: (g) => g.ee.playEnding() },
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
  ...nuevoMate('labrador', 'molino', 'Mate Labrador', 'Labrador de Sol a Sol'),
  // (en la torre está la PhD Flopper: con ella los cohetes no te lastiman)
  ...nuevoMate('explosivo', 'torre', 'Mate Explosivo', 'Circo Explosivo'),
  ...nuevoMate('llamarada', 'castillo', 'Llamarada Matera', 'Llamarada del Dragón'),
];

// La canción de la muerte según el mapa.
export const deathTrack = () => (MAP_ID === 'penal' ? 'muerte-penal' : 'muerte');
