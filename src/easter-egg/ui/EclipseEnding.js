import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import CineActors, { yawTo } from './cineActors';
import { cineClip, eyeSpots } from '../net/gauchoSkin';
import { gilVincha } from '../net/gilLook';
import { warmScene } from './cineWarm';
import { FEATURES } from '../config/map';
import { ISLANDS, EE } from '../config/maps/eclipse';
import { PLAYER_START } from '../config/map';
import { granadero } from '../entities/skins/granadero';
import { toWorld, toLocal, hLoc } from '../world/eclipse/sanlorenzoCampo';
import { ECLIPSE_DIR } from '../world/eclipseSky';
import { sanMartin } from '../entities/skins/sanmartin';
import { Montura, addPerson } from '../entities/eclipse/montar';
import { Caballos } from '../entities/skins/caballo';
import { belgranoSkin, whenBelgrano } from '../entities/monumento/belgranoSkin';
import { makeRift } from './eclipseCineSable';
import { buildProp } from '../world/props';
import { STAGE, SET, SET_AT, at, makeDome, setSky, buildSets, buildPrimerMate, buildLantern, tickFlags } from './eclipseCineSets';
import { assetUrl } from '../../lib/assets';
import { eclSfx } from '../fx/eclipseSfx';

// El final de Eclipse Matero: "Todo tiene una razón de ser" (guion en el
// scratchpad eclipse/CINEMATICAS.md §4). Lo arranca EclipseEgg.arenaWon() al
// ganar San Lorenzo (ee.scenes.ending, ui/eclipseScenes.js), en todas las
// compus a la vez; el reloj es el de ui/castleCine (en línea, el de verdad).
// Narra Martín Fierro (murmullos, SPEAKERS.fierro).
//  1. El campo de San Lorenzo al alba, con humo: el Gil con el Primer Mate en
//     las manos; San Martín a caballo lo mira, Belgrano a pie, los tres atrás.
//  2. El mate brilla y muestra lo que podría ser (el Gil viejo, en paz, con
//     los suyos: en sepia); el Gil cierra los ojos y lo apaga.
//  3. Se lo da a San Martín, que no lo toma: mira a Belgrano. Belgrano lo
//     toma y se lo da a los compañeros (Cirilo lo recibe).
//  4. Se despide: Benito llora, Cirilo cabecea con el mate, Anacleto le da la mano.
//  5. Un desgarro al estero de 1877; el Gil entra solo, de espaldas.
//  6. El estero de noche: camina hasta el algarrobo. No se ve la muerte: la
//     cinta colorada atada al facón; el sol entre las ramas.
//  7. El santuario del Gauchito: banderas, velas, botellas, gente de espaldas.
//  8. El universo se cose: las islas, las grietas que se cierran, el sol que
//     sale de atrás de la luna y se vuelve sol de verdad.
//  9. El fogón del camino, de noche: los cuatro de siempre toman mate (el Viejo
//     ceba, el Canchero cuenta, el Miedoso se ríe, el Valiente levanta el mate
//     hacia el santuario); se acuerdan: un destello de cada uno con su luz.
// 10. Fierro llega caminando desde lo oscuro y se vuelve el hombre de la
//     linterna; la revelación; apaga la linterna. Negro. La placa.
// Después: el logro y el fin de la partida (Game.win, sin otra cinemática).
// Todo se arma al empezar (escondido) y se compila (ui/cineWarm); luces: las
// del mundo con otros valores y dos fogonazos prestados de fx (el fuego y la
// linterna). globalThis.__mduNoEclipseFin: sin escena (el mapa se da por hecho).

const FILES = ['cine-eclipse-fin.json', 'cine-eclipse.json', 'cine-introA.json', 'cine-torre2.json', 'cine-penal2.json'];
let CLIPS = null;
let LOAD = null;
export function loadFinClips() {
  LOAD ||= Promise.all(
    FILES.map((f) =>
      fetch(assetUrl(`/assets/sotano/modelos/gaucho/${f}`))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  ).then((all) => {
    const C = {};
    for (const J of all) if (J) for (const [k, c] of Object.entries(J.clips)) C[k] ||= cineClip(c);
    CLIPS = C;
    return C;
  });
  return LOAD;
}

// el Gil y sus tres compañeros (entities/EclipseEgg CAST): el Valiente es el Gil
const CAST = { valiente: 0xb01c14, miedoso: 0x7a5a2a, canchero: 0x2a3a7a, viejo: 0x3a6a2a };
// los cuatro de siempre cuando fueron caballeros (entities/castle/common)
const ELEM = { valiente: 0xff6a1a, miedoso: 0x8affb8, canchero: 0xffe45a, viejo: 0x9adcff };
const L = {
  todo: 'Hay hombres que tienen todo en la mano.',
  sueltan: 'Y lo sueltan.',
  todos: 'Lo que es de todos no lo guarda uno.',
  volvio: 'Volvió a donde lo esperaban. Sabía a qué.',
  gente: 'A los que dan la vida por otros, la gente no los deja morir.',
  cose: 'Y lo roto se cose, si alguien pone el cuerpo.',
  caballeros: 'Fueron caballeros. Ahora toman mate. Es lo mismo.',
  razon: 'Todo en esta vida tiene una razón de ser.',
  rev1: 'El primer mate se lo dejó sobre el pecho el hombre de la linterna. Eso dicen.',
  rev2: 'Lo que no dicen es que ese hombre cambia. Que alguien tiene que cargar a los dormidos hasta el primer mate, siempre.',
  rev3: 'Y que a Francisco, antes de Francisco, lo llamaban de otra manera.',
  placa: 'Mientras alguien le cebe un mate a otro, la luz no se apaga.',
};
// (sesión 1f, el usuario 2026-10-06: "en la escena donde Fierro dice todo tiene
// una razón de ser me gustaría que revele algo tremendo en lugar de repetir la
// frase del final de Der Mateendrache". La revelación junta lo que el libro
// deja abierto: el narrador es el que cuenta —el que se acuerda de todo—, el
// Chiquitijuein "se esconde en la memoria", los ojos del de la linterna son
// "dos brasas", y "esta parte todavía no pasó" (el final del capítulo 10).)
const L2 = {
  llega: 'Les debo la última parte. La que nunca conté.',
  rev1: 'El primer mate de todos lo cebé yo.',
  rev2: 'A una cosa chiquita que bajó de las nubes. Tenía frío. No sabía lo que era.',
  rev3: 'Se esconde en la memoria, dicen. Y el único que se acuerda de todo... soy yo.',
  rev4: 'Por eso cargo a los dormidos. Por eso no me puedo morir.',
  rev5: 'Si un día me olvido de ustedes... vuelve.',
  placa: 'Esta parte ya pasó.',
};
// cómo se ve cada decorado: la luz del mundo (la del eclipse, la hemisférica,
// la ambiente) y la niebla, con otros valores
const LOOKS = {
  estero: { sky: 'noche', dir: [0.38, 0.42, -0.82], sun: 0xa8c0f0, sunI: globalThis.__mduOldEclFin === true ? 1.1 : 1.7, hs: 0x34506e, hg: 0x141820, hI: globalThis.__mduOldEclFin === true ? 0.75 : 1.05, amb: 0x2a3448, ambI: globalThis.__mduOldEclFin === true ? 0.4 : 0.55, fog: 0x0b121c, fogD: globalThis.__mduOldEclFin === true ? 0.012 : 0.022 },
  manana: { sky: 'manana', dir: [-0.31, 0.83, -0.45], sun: 0xffe8c8, sunI: 1.9, hs: 0x8aaad8, hg: 0x4a4030, hI: 0.95, amb: 0x606060, ambI: 0.35, fog: 0xc8d4e0, fogD: 0.004, fogSet: 0.011 },
  tarde: { sky: 'tarde', dir: [0.55, 0.22, -0.8], sun: 0xffb070, sunI: 1.6, hs: 0x8a7a9a, hg: 0x4a3020, hI: 0.7, amb: 0x504040, ambI: 0.3, fog: 0xc08060, fogD: 0.006, fogSet: 0.013 },
  fogon: { sky: 'noche', dir: [-0.3, 0.5, 0.8], sun: 0x8090c0, sunI: 0.55, hs: 0x24304a, hg: 0x100c0a, hI: 0.55, amb: 0x1a2028, ambI: 0.3, fog: 0x05070c, fogD: 0.012 },
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// (de un ángulo hacia otro, por el lado corto)
const angTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const tmpC = new THREE.Color();
// (sesión 1f, 2026-10-06: la despedida del Gil legible —las antorchas de los
// que lo vienen a buscar, se arrodilla—, la mañana a contraluz sobre el agua,
// el pajonal del estero, el universo que se cose con luz, Fierro de cuerpo
// entero y los cuatro que lo miran llegar. globalThis.__mduOldEclFin: como antes)
const FIN2 = () => globalThis.__mduOldEclFin !== true;
// (sesión 1f, 2026-10-07, el usuario: "el final es una vergüenza ajena": los
// personajes ignoran a Fierro, un paneo que dura años, palabras sin sentido,
// casi sin música, decorados de PS1, los que ejecutan al Gil nunca aparecen,
// San Martín no hace nada. FIN3: el fogón en el claro de verdad (de noche, sin
// el eclipse: el mismo lugar donde empezó todo), los cuatro se paran y lo
// reciben, un mate de por medio, la revelación clara; San Martín le habla al
// Gil y lo saluda con el sable que le trajo; jinetes de verdad con antorchas;
// música todo el final. globalThis.__mduOldEclFin2: el FIN2, como antes)
const FIN3 = () => FIN2() && globalThis.__mduOldEclFin2 !== true;
// (2026-10-07, el usuario) el paso a dorado de los pies a la cabeza, no un
// corte (__mduOldFinGold); y el cierre: Fierro se deshace como un alma
// señalando la luna, se cierra el telón con música épica y en el silencio
// su frase (__mduOldFinCierre); el mate, a 1,1 m (__mduOldFinOffer)
const NEW_GOLD = () => globalThis.__mduOldFinGold !== true;
// (2026-10-08, ITERACION-7 E1-E2, el usuario: "el sacrificio del Gil casi ni se
// entiende, es demasiado poco explícito"; "cuando los personajes se despiden
// del Gil no hablan ni le dicen nada, es su mejor amigo"; "no da a entender
// que tiene que sacrificarse en ningún momento". Ahora se dice: San Martín, que
// el tiempo quedó roto y cada uno vuelve al suyo; el Gil, que en el suyo lo
// esperan para matarlo; en la despedida cada uno le habla y él contesta por
// qué no se queda. Con el nombre de quien habla. __mduOldFinAdios: como antes)
const FIN4 = () => globalThis.__mduOldFinAdios !== true;
const L4 = {
  roto: 'El Eclipse cayó, pero el tiempo quedó roto. Cada uno tiene que volver al suyo.',
  espera: 'En el mío me esperan para matarme. Ya lo sé.',
  quedate: '¡No vuelvas, Antonio! Quedate con nosotros.',
  // (2026-10-10, el usuario: "en los subtítulos hay un :, cambialo por una coma o punto")
  noQueda: 'Si me quedo, el tiempo no se cierra. No queda nada, Benito. Ni ustedes, ni el mate.',
  cebamos: 'Entonces cebamos por vos. Todos los días.',
  nunca: 'Así no me muero nunca.',
  anda: 'Andá tranquilo, hermano. Acá te esperamos.',
  primero: 'Cuídenlo. Es el primero.',
  // (FIN8: la muerte, dicha: lo último que dice el Gil —la leyenda: el hijo
  // del sargento se salvó— y lo que cuenta Fierro sobre el negro)
  reza: 'Rezá en mi nombre, sargento. Tu hijo se va a salvar.',
  degollado: 'Lo colgaron del algarrobo y lo degollaron con su propio facón.',
};
// (2026-10-08, ITERACION-7 E3, el usuario: "la transición entre su muerte y
// nuestro campamento es súper abrupta: pasa en el futuro y se siente que es
// contemporáneo". Carteles de cine en negro con el lugar y el tiempo: antes del
// estero, antes del santuario y antes del fogón. __mduOldFinTiempo: sin ellos)
const TIEMPO = () => globalThis.__mduOldFinTiempo !== true;
const T4 = {
  estero: 'Mercedes, Corrientes. 8 de enero de 1878.',
  santuario: 'Casi ciento cincuenta años después.',
  fogon: 'Esa misma noche, en el claro.',
};
// Belgrano con el Primer Mate en la mano del modelo (ver placeMate 'grip').
// globalThis.__mduOldBelMate: en la pieza del muñeco, como antes
const BEL9 = () => globalThis.__mduOldBelMate !== true;
// (cuánto hacia los dedos, cuánto más arriba de la muñeca y cuánto hacia el
// cuerpo va el mate)
const BEL_GRIP = [+(globalThis.__mduBelGripF ?? 0.09), +(globalThis.__mduBelGripY ?? -0.01), +(globalThis.__mduBelGripIn ?? 0.045)];
const WHO = { gil: 'Antonio Gil', benito: 'Benito', cirilo: 'Cirilo', anacleto: 'Anacleto', sanmartin: 'San Martín', belgrano: 'Manuel Belgrano' };
// (2026-10-09, el usuario: "no se entiende quién dice qué porque no pone quién
// lo dice": Fierro, que narraba sin nombre, y los cuatro del fogón también
// llevan el suyo. globalThis.__mduOldFinNombres: como antes)
const WHO10 = { fierro: 'Martín Fierro', caballeroFuego: 'El Valiente', caballeroViento: 'El Miedoso', caballeroRayo: 'El Canchero', caballeroHielo: 'El Viejo' };
const whoOf = (who) => WHO[who] || (globalThis.__mduOldFinNombres !== true ? WHO10[who] : null);
const NEW_END = () => globalThis.__mduOldFinCierre !== true;
// (2026-10-09) Cuando Fierro se deshace: cuatro desgarros, la despedida de los
// gauchos y cada uno se va por el suyo; recién después el negro (ver portales).
// globalThis.__mduOldFinPortales: el negro enseguida, como antes
const PORT9 = () => NEW_END() && globalThis.__mduOldFinPortales !== true;
// (2026-10-09, el usuario, "el toque final" del final: el orden del diálogo
// del campo, lo que el Gil le contesta a Cirilo, su despedida en el desgarro,
// sin el blanco en las islas, los giros sin salto y el resto de la lista; ver
// cada uno. globalThis.__mduOldFin10: como antes)
const FIN10 = () => globalThis.__mduOldFin10 !== true;
const L10 = {
  volvere: 'Algún día volveré, lo prometo.',
  noLloren: 'No lloren por mí, amigos míos, pues en el cielo yace nuestra patria, y ahí es donde yo iré...',
};
const L9 = {
  valiente: 'Fue un honor, compañeros.',
  canchero: 'Nos vemos en la próxima ronda.',
  miedoso: '¿Y si no nos volvemos a ver?',
  viejo: 'Siempre hay otra ronda.',
};
// (2026-10-08, ITERACION-8, el usuario, del final: "se repite la misma música.
// Las transiciones en negro son muy abruptas: se pone la pantalla negra y
// aparece instantáneamente el texto con la misma música detrás. Deberían tener
// mínimo varios segundos de negro (5 o más), luego el texto 5 segundos y recién
// arrancar una nueva canción. Durante la despedida, el diálogo es más largo que
// lo que se quedan mirando entre los personajes, así que parece que hablan al
// aire y se saltean algunos. Cuando Fierro aparece y le dan el primer mate no
// aparece en sus manos. Cuando pasa a su forma dorada lo hace en otra pose.
// Lo más flojo de todo es la música." FIN8: sus canciones (core/music fin8-*),
// una por parte y sin repetir —el sacrificio, el funeral, el fogón—; los
// carteles con 5 s de negro y silencio y 5 s de texto; la despedida al paso de
// lo que se dice, con la cámara en el que habla; el mate en las manos de
// Fierro y el dorado en su misma pose. globalThis.__mduOldFin8: como antes)
const FIN8 = () => globalThis.__mduOldFin8 !== true;
// (2026-10-10, el usuario, "ajustes cinemática final": la canción de la muerte
// del Gauchito arranca cuando aparece el cartel de "Mercedes" —no al abrirse el
// estero—; en los negros no suena el ruido de fondo de la isla (`hush`, lo mira
// fx/eclipseAmbience); y en el silencio puro de los negros —no sobre los
// textos—, el coro de "ahhh" del final de Der Mateendrache (core/audio choir),
// sin abusar: uno por cartel. globalThis.__mduOldFin11: como antes)
const FIN11 = () => globalThis.__mduOldFin11 !== true;
// (FIN8) cuál de los jinetes del estero es el sargento: el de la punta de la
// ronda (los del medio quedan detrás del tronco del algarrobo, visto desde el Gil)
const SGT = 5;
// hacia dónde queda, desde donde se arrodilla el Gil (fin2Tick: a = -0,73 + (i/6 - 0,5)·2,2)
const SGT_A = -0.73 + (SGT / 6 - 0.5) * 2.2;
// cuánto tarda en decirse una línea (la cuenta de core/audio say)
const est = (text) => Math.max(1.6, text.length * 0.064 + (text.match(/[,.;:!?…]/g) || []).length * 0.22 + 0.3);
const L3 = {
  noEsMio: 'No es mío. Es de los que vienen.',
  seras: 'Serás lo que debas ser, o no serás nada.',
  seras1: 'Serás lo que debas ser...',
  seras2: '...o no serás nada.',
  llega: '¿Hay lugar para uno más?',
  si: 'Siempre hay lugar.',
  razon: 'Todo en esta vida tiene una razón de ser.',
  molino: 'Ustedes no se acuerdan. Yo los fui a buscar al molino, la primera noche.',
  ronda: 'Y cada vez que caían, los volví a levantar.',
  porque: '¿Por qué?',
  aguantar: 'Porque alguien tenía que aguantar, hasta que uno cortara la ronda.',
  gil: 'El Gil la cortó. Ya no me necesitan.',
  // (2026-10-10, el usuario: la frase final; antes "Lo que no está vivo no se muere.")
  placa: 'Si al futuro temes, cebar un mate debes.',
};
// lo que es solo de Eclipse y en el claro no va (de noche, cosido): grietas,
// portales, cristales, lo que flota, la niebla violeta
const CLARO_AWAY = /grieta|eclPools|portal|eclMood|eclMist|cristal|crystal|orbiter|flotan|jinete|desgarro:|eclipse:huecos|abismo|trampa|papDesgarro|asador|eclipse:marca/i;
const LAYER_OFF = 1 << 30;
const CLARO_FAR = 105;

export default class EclipseEnding extends CastleCine {
  constructor(ee) {
    super(ee.g, { drive: false, kind: 'eclipse' });
    this.ee = ee;
    loadFinClips();
  }

  // Habla Fierro: el texto se va solo un rato después de la voz.
  say(who, text) {
    // (FIN8: si todavía habla el de antes, la línea espera —el texto y la voz
    // juntos—; antes el texto ya decía la que seguía mientras sonaba la anterior)
    if (FIN8()) {
      const A = this.g.audio;
      const busy = Math.max((this.voiceTill || 0) - this.t, A?.ctx ? (A.voiceEnd || 0) - A.ctx.currentTime : 0);
      if (busy > 0.08) {
        this.later(busy + 0.1, () => this.say(who, text));
        return busy + 0.1 + est(text) + 0.5;
      }
    }
    const d = super.say(who, text);
    if (FIN8()) this.voiceTill = this.t + (this.g.audio?.sayWait || 0) + d - 0.35;
    // (FIN4: quien habla, con su nombre; Fierro narra sin nombre)
    if (FIN4() && whoOf(who)) this.textEl.textContent = `${whoOf(who)}: ${text}`;
    const shown = this.textEl.textContent;
    this.later(d + 1.6, () => {
      if (this.textEl.textContent === shown) this.quiet();
    });
    return d;
  }

  // (FIN8) La canción de una parte del final: suena mientras dure la escena.
  song(id, o = {}) {
    this.g.music?.play?.(id, { while: (G) => G.ee?.scene?.cine === this, ...o });
  }

  // (FIN8) Una lista de cosas en fila: cada una dice cuánto falta para la que
  // sigue (las líneas, lo que tardan en decirse). Al terminar, el paso sigue.
  seqRun(items) {
    this.seq = { q: items.slice(), at: this.stepAt ?? this.t };
    // (el paso dura lo que dure la fila: lo corta seqTick)
    return 600;
  }
  seqTick() {
    const Q = this.seq;
    if (!Q) return;
    while (Q.q.length && this.t >= Q.at) Q.at += Q.q.shift()() || 0;
    if (!Q.q.length && this.t >= Q.at) {
      this.seq = null;
      this.next = Q.at;
    }
  }

  // ---------------- dónde ----------------
  // El campo: el de San Lorenzo si está a la vista (la arena), si no el del decorado.
  F(u, v, h = 0, out = new THREE.Vector3()) {
    if (this.campo) toWorld(u, v, null, out);
    else at('campo', u, v, out);
    out.y += h;
    return out;
  }
  S(k, x, z, h = 0, out = new THREE.Vector3()) {
    at(k, x, z, out);
    out.y += h;
    return out;
  }
  floorAt(x, z) {
    // (FIN3: el fogón del claro, en el mapa de verdad)
    const cf = SET_AT.fogon;
    if (cf && Math.abs(x - cf.x) < 45 && Math.abs(z - cf.z) < 45) return this.g.world.floorAt(x, z);
    if (Math.abs(x - STAGE.x) < 230 && Math.abs(z - STAGE.z) < 140) return STAGE.y;
    if (this.campo) {
      toLocal(x, z, tmpU);
      return hLoc(tmpU.u, tmpU.v);
    }
    return this.g.world.floorAt(x, z);
  }
  // un paso del guion: lo que pasa a tantos segundos de su hora programada (en
  // línea, una compu trabada no corre el resto)
  at(secs, fn) {
    this.timers.push({ t: (this.stepAt ?? this.t) + secs, fn });
  }
  // (sesión 1f: la lente de cada toma la pisaba la de la partida —Game.js
  // targetFov—: ahora la pide; __mduOldEclFin: como antes)
  setFov(f) {
    this.wantFov = FIN2() ? f : null;
    super.setFov(f);
  }
  cut(dur, p0, p1, l0, l1, fov = 50) {
    this.setFov(fov);
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(p0, p1, k);
      look.lerpVectors(l0, l1, k);
    });
  }

  // ---------------- el armado ----------------
  build() {
    const g = this.g;
    const ee = this.ee;
    const w = g.world;
    const ar = ee.arena;
    this.dt = 1 / 30;
    // el campo de San Lorenzo, si la arena está puesta
    this.campo = !!(ar?.built && ar.top?.parent);
    this.islands = ar?.islands || w.root;
    // lo de la partida, fuera de cuadro
    if (g.zombies?.root) g.zombies.root.visible = false;
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    if (ar?.actors) ar.actors.visible = false;
    // (FIN8: la Marcha se va de a poco sobre el campo al alba; después, el
    // viento solo hasta que el Gil suelta el mate)
    g.music?.stop?.(FIN8() ? 9 : 3);
    // el fin de la partida (Game.win) sin otra cinemática después: como el estero
    this.hookWin();
    // los decorados y el cielo
    this.sets = buildSets(g);
    this.root.add(this.sets.root);
    // las antorchas de los que vienen a buscar al Gil (paso 6): llamitas que
    // galopan desde lo oscuro; sprites, sin luces
    {
      const tg = new THREE.Group();
      const tex = g.textures?.dot;
      const stick = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 });
      const stickG = new THREE.CylinderGeometry(0.025, 0.03, 0.7, 5).translate(0, -0.35, 0);
      this.torches = [];
      for (let i = 0; i < 7; i++) {
        const o = new THREE.Group();
        o.add(new THREE.Mesh(stickG, stick));
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        fl.scale.set(0.45, 0.75, 1);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffa44a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        halo.scale.setScalar(1.7);
        o.add(fl, halo);
        tg.add(o);
        this.torches.push({ o, fl, halo });
      }
      tg.visible = false;
      this.root.add(tg);
      this.torchG = tg;
    }
    this.dome = makeDome();
    this.root.add(this.dome);
    // (FIN3: el domo puede achicarse —el claro con la cámara corta—)
    this.domeS = 1;
    {
      const dm = this.dome;
      dm.onBeforeRender = (_r, _s, cam) => {
        const e = cam.matrixWorld.elements;
        dm.matrixWorld.makeScale(this.domeS, this.domeS, this.domeS).setPosition(e[12], e[13], e[14]);
      };
    }
    // (el que pone la luz y la niebla de cada decorado: se dibuja primero)
    // (en el onBeforeRender de la escena: three lo llama antes de armar las luces
    // del cuadro; el mundo y el clima las vuelven a poner en su update)
    const sc = g.scene;
    this.sceneBR = sc.onBeforeRender;
    sc.onBeforeRender = (...a) => {
      this.sceneBR?.apply(sc, a);
      if (!this.done) this.applyLook();
    };
    // la luz que se ve del eclipse en el cielo de Eclipse: se cierra al coserse
    if (w.sky && !w.sky.userData.finWrap) {
      const prev = w.sky.onBeforeRender;
      w.sky.userData.finWrap = prev;
      w.sky.onBeforeRender = (...a) => {
        prev?.(...a);
        const u = w.sky.material.uniforms;
        if (this.crackK != null) u.uCrack.value *= this.crackK;
        if (this.nightK != null) u.uNight.value = this.nightK;
      };
    }
    this.buildCast();
    if (FIN3()) {
      this.claroFogon();
      this.buildRiders();
    }
    this.mate = buildPrimerMate(g);
    this.root.add(this.mate);
    this.lamp = buildLantern(g);
    this.root.add(this.lamp.root);
    this.rift = makeRift('estero');
    this.root.add(this.rift.root);
    this.buildSmoke();
    // los fogonazos prestados (el fuego y la linterna)
    const fl = g.fx?.flashes || [];
    this.fireL = fl[fl.length - 1] || null;
    this.lampL = fl[fl.length - 2] || null;
    const m = w.moon;
    this.base0 = {
      moon: m ? { c: m.color.clone(), i: m.intensity, p: m.position.clone(), tp: m.target.position.clone() } : null,
      hemi: w.hemi ? { c: w.hemi.color.clone(), gc: w.hemi.groundColor.clone(), i: w.hemi.intensity } : null,
      amb: w.ambient ? { c: w.ambient.color.clone(), i: w.ambient.intensity } : null,
      fog: g.scene.fog ? { c: g.scene.fog.color.clone(), d: g.scene.fog.density } : null,
    };
    this.mode('negro');
    this.fade(true);
    warmScene(g);
    return this.script0();
  }

  hookWin() {
    const g = this.g;
    const win0 = g.win;
    this.unhook = () => {
      if (g.win === wrap) g.win = win0;
    };
    const wrap = (info) => {
      this.unhook();
      // (si llega el del anfitrión con la escena andando: termina acá, sin más)
      if (!this.done) {
        this.onDone = null;
        this.finish();
      }
      // (Game.win ya va derecho a la pantalla de victoria con FEATURES.egg
      // 'primermate': sin prender el estero a escondidas)
      return win0.call(g, info);
    };
    g.win = wrap;
  }

  buildCast() {
    const g = this.g;
    const patch = (C) => {
      const base = C.clipOf.bind(C);
      C.clipOf = (n) => CLIPS?.[n] || base(n);
      return C;
    };
    const fl = (x, z) => this.floorAt(x, z);
    // el Gil y los tres (los del crew, con los ponchos de Eclipse)
    const A = (this.A = patch(new CineActors(g, { base: 560, floor: fl, parent: this.root })));
    for (const r of A.list) {
      r.a.M.poncho.color.set(CAST[r.persona]).multiplyScalar(1.7);
      r.mate = false;
    }
    this.gil = A.by.valiente;
    this.benito = A.by.miedoso;
    this.cirilo = A.by.canchero;
    this.anacleto = A.by.viejo;
    // Belgrano (el del Monumento: el modelo de Meshy sobre las piezas)
    const br = { id: 466, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false };
    const ba = addPerson(A.people, br, (a) => belgranoSkin(a));
    br.poseFn = (P) => this.belPose(P);
    // (sólido, como en San Lorenzo: en el Monumento es un ánima que aparece;
    // y más oscuro: con el sol del eclipse la textura clara se quemaba)
    whenBelgrano(() => {
      const m = ba.M.belgrano;
      if (!m) return;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.color.setScalar(0.62);
      m.needsUpdate = true;
    });
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 });
    ba.M.coat = coat;
    ba.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === ba.M.hat || o.material === ba.M.band) o.visible = false;
      if (o.material === ba.M.poncho) o.material = coat;
    });
    for (const q of ba.parts || []) if (q.material === ba.M.poncho) q.material = coat;
    this.bel = { r: br, a: ba, arm: 0, cur: {} };
    // San Martín a caballo (entities/eclipse/montar)
    this.horses = new Caballos(g, { parent: this.root });
    this.horse = this.horses.add({ x: 0, y: 0, z: 0, yaw: 0, gait: 'parado' });
    const sa = sanMartin(A.people, { id: 470, pos: new THREE.Vector3(), yaw: 0, sable: 'corvo' });
    this.sm = { a: sa, r: sa.r, head: 0, look: 0 };
    this.mont = new Montura(sa, this.horse, { brazos: 'riendas' });
    const mp = sa.r.poseFn;
    sa.r.poseFn = (P) => {
      mp(P);
      P.headY = (P.headY || 0) + this.sm.head + this.sm.look;
    };
    // la gente del santuario, de espaldas
    const S = (this.Sx = patch(new CineActors(g, { base: 600, floor: fl, parent: this.root, bandanas: false })));
    for (let k = 0; k < 4; k++) {
      const r = { id: 610 + k, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'gente' };
      S.people.add(r);
      r.a = S.people.list.get(r.id);
      r.mate = false;
      S.list.push(r);
    }
    for (const r of S.list) r.mate = false;
    // los cuatro de siempre en el fogón, Fierro (el ánima) y el hombre de la linterna
    // (los cuatro de siempre: sin las bandanas de los compañeros del Gil)
    const B = (this.B = patch(new CineActors(g, { base: 580, floor: fl, parent: this.root, bandanas: false })));
    for (const r of B.list) r.mate = false;
    const add = (id, o = {}) => {
      const r = { id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'fierro', ...o };
      B.people.add(r);
      r.a = B.people.list.get(id);
      r.mate = false;
      B.list.push(r);
      return r;
    };
    this.fierro = add(905, { ghost: !FIN2(), dead: true });
    if (FIN2()) {
      // (de cuerpo entero: el ánima azul transparente parecía un muñeco de prueba)
      const FM = this.fierro.a.M;
      FM.poncho.color.set(0x4a3a2c);
      FM.hat?.color?.set(0x1c1612);
      FM.band?.color?.set(0x6a4a2a);
    } else this.fierro.a.M.poncho.color.set(0x5a7ab0).multiplyScalar(1.7);
    this.gold = add(906, { dead: true });
    const M = this.gold.a.M;
    M.poncho.color.set(0x9a6c1e);
    M.band.color.set(0xd8a830);
    M.hat.color.set(0x3a2e22);
    M.skin.color.set(0x2a2018);
    for (const C of [A, S, B]) C.show(false);
  }

  // el humo bajo del campo: manchas grises que se arrastran
  buildSmoke() {
    const g = this.g;
    const grp = new THREE.Group();
    this.smoke = [];
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot, color: 0x9a9088, transparent: true, depthWrite: false, opacity: 0.12 }));
      s.userData = { u: 17 + (k % 7) * 4.5, v: -14 + (k % 5) * 7 + Math.floor(k / 7) * 3, s: 7 + (k % 4) * 2, ph: k * 1.3 };
      grp.add(s);
      this.smoke.push(s);
    }
    this.root.add(grp);
    this.smokeG = grp;
  }

  // ---------------- los decorados ----------------
  // negro | campo | vision | estero | manana | santuario | islas | fogon
  mode(k) {
    const g = this.g;
    const w = g.world;
    const ar = this.ee.arena;
    this.modeK = k;
    const stage = ['vision', 'estero', 'manana', 'santuario', 'fogon'].includes(k) || (k === 'campo' && !this.campo);
    this.sets.root.visible = stage;
    // (cada decorado, a la vista de a uno: ui/eclipseCineSets, F4)
    const SG = this.sets.groups;
    if (SG?.estero) {
      SG.campo.visible = k === 'campo';
      SG.estero.visible = k === 'estero' || k === 'manana';
      SG.santuario.visible = k === 'santuario';
      SG.fogon.visible = k === 'fogon' || k === 'vision' || k === 'vision3';
    }
    // ('vision3': la visión del paso 2 en el claro de verdad, de día; ver script0)
    this.dome.visible = stage || k === 'islas' || k === 'vision3';
    this.domeK = k === 'islas' ? 0 : 1;
    if (w.sky) w.sky.visible = !stage;
    if (ar?.top) ar.top.visible = k === 'campo' && this.campo;
    const isl = this.islands;
    if (k === 'islas') {
      if (!isl.parent) g.scene.add(isl);
      isl.visible = true;
    } else if (isl) isl.visible = false;
    this.smokeG.visible = k === 'campo';
    const look = k === 'campo' && !this.campo ? 'alba' : k === 'vision' || k === 'vision3' ? 'manana' : k === 'santuario' ? 'tarde' : k === 'estero' ? 'noche' : k === 'manana' ? 'manana' : k === 'fogon' ? 'noche' : 'alba';
    const L0 = LOOKS[k === 'vision' || k === 'vision3' ? 'manana' : k === 'santuario' ? 'tarde' : k];
    const sd = V3(...(L0?.dir || [ECLIPSE_DIR.x, ECLIPSE_DIR.y, ECLIPSE_DIR.z])).normalize();
    setSky(this.dome, look, k === 'islas' ? ECLIPSE_DIR : sd, V3(0.38, 0.42, -0.82).normalize());
    this.A.show(k === 'campo' || k === 'vision' || k === 'vision3' || k === 'estero');
    this.Sx.show(k === 'santuario');
    this.B.show(k === 'fogon');
    this.lookCfg = L0 || null;
    // (las islas y el campo: la luz de antes)
    if (!L0 && this.base0) this.restoreLook();
    // la sombra: sobre el decorado que se ve
    const m = w.moon;
    if (m && stage) {
      const c = k === 'vision' ? 'fogon' : k === 'manana' ? 'estero' : k === 'campo' ? 'campo' : k;
      at(c, 0, 0, tmpV);
      m.target.position.copy(tmpV);
      m.target.updateMatrixWorld();
      const sc = m.shadow.camera;
      sc.left = sc.bottom = -26;
      sc.right = sc.top = 26;
      sc.near = 1;
      sc.far = 260;
      sc.updateProjectionMatrix();
    }
    if (FIN3()) this.claroMode(k === 'fogon' || k === 'vision3');
    // (FIN8: el facón con la cinta y la cruz son la tumba: de noche, antes de
    // que lo maten, no están)
    if (FIN8() && this.sets.parts?.facon) {
      this.sets.parts.facon.visible = k === 'manana';
      this.tumba ||= this.buildTumba();
      this.tumba.visible = k === 'manana';
    }
    this.applyLook();
  }

  // (FIN8) La tumba al pie del algarrobo: un montón de tierra, la cruz de dos
  // palos atados y las cintas coloradas. Va con el facón (la cinta se mueve
  // con tickFlags, como las del facón).
  buildTumba() {
    const fc = this.sets.parts.facon;
    const grp = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });
    const dirt = new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 1, map: this.g.textures?.dirt || null });
    const red = new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x300404 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), dirt);
    mound.scale.set(0.5, 0.13, 0.98);
    mound.receiveShadow = true;
    grp.add(mound);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 6), wood);
    post.position.set(0, 0.6, -0.95);
    post.rotation.z = 0.05;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 6), wood);
    arm.position.set(0, 0.92, -0.95);
    arm.rotation.z = Math.PI / 2 + 0.06;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 5, 10), red);
    tie.position.set(0, 0.92, -0.95);
    grp.add(post, arm, tie);
    for (const m of [post, arm]) m.castShadow = true;
    // las cintas, de las puntas del travesaño
    this.tumbaTails = [];
    for (const sx of [-0.3, 0.02, 0.31]) {
      const len = 0.38 + Math.abs(sx) * 0.5;
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.05, len).translate(0, -len / 2, 0), red);
      t.position.set(sx, 0.9, -0.95);
      t.userData.len = len;
      grp.add(t);
      this.tumbaTails.push(t);
    }
    // el borde de piedras chicas
    const stone = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.9, flatShading: true });
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + 0.2;
      const r = 0.045 + ((k * 37) % 5) * 0.009;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
      st.position.set(Math.cos(a) * 0.5, r * 0.55, Math.sin(a) * 0.98);
      st.rotation.set(k * 1.7, k * 2.3, k);
      st.castShadow = true;
      grp.add(st);
    }
    // (al lado del facón, hacia el árbol; acostada hacia donde mira la toma)
    grp.position.copy(fc.position).add(V3(-1.15, 0, -0.75));
    grp.rotation.y = 0.5;
    grp.visible = false;
    fc.parent.add(grp);
    return grp;
  }

  // (2026-10-07, ITERACION-6 F11, el usuario: "cuando el Gil se iba a entregar
  // a la partida no cargaba por medio segundo y luego aparecía". Medido: el
  // primer cuadro del estero tardaba 500 ms —tres programas nuevos, los de las
  // pasadas del posproceso que ui/cineWarm no compila, y 213 mallas que subían
  // a la placa—. Los decorados se dibujan una vez antes, enteros y por el
  // camino de siempre, tapados por el blanco de la visión (en la misma tarea:
  // esos cuadros no llegan a la pantalla). __mduNoFinWarm: como antes)
  warmSets() {
    const g = this.g;
    const SG = this.sets.groups;
    if (this.warmed || !SG?.estero || globalThis.__mduNoFinWarm === true) return;
    this.warmed = true;
    const cam = g.camera;
    const k0 = this.modeK;
    const p0 = cam.position.clone();
    const q0 = cam.quaternion.clone();
    const fov0 = cam.fov;
    const m = g.world.moon;
    const sc = m?.shadow?.camera;
    const S0 = sc ? [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] : null;
    const look0 = this.lookCfg;
    const c = new THREE.Vector3();
    const tg = this.torchG?.visible;
    try {
      for (const k of ['estero', 'manana', 'santuario']) {
        this.mode(k);
        if (this.torchG) this.torchG.visible = k === 'estero';
        at(k === 'manana' ? 'estero' : k, 0, 0, c);
        // de lejos y de arriba (todo adentro del cuadro) y de cerca, de los dos lados
        for (const [x, y, z] of [[0, 70, 100], [-9, 2, 7], [8, 2.2, -9], [0.4, 2.3, 9.6]]) {
          cam.position.set(c.x + x, c.y + y, c.z + z);
          cam.lookAt(c.x, c.y + 1, c.z);
          cam.updateMatrixWorld(true);
          g.render(0);
        }
      }
    } catch {
      /* si falla, se compila sobre la marcha como siempre */
    }
    if (this.torchG) this.torchG.visible = !!tg;
    this.mode(k0);
    this.lookCfg = look0;
    if (sc && S0) {
      [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = S0;
      sc.updateProjectionMatrix();
      if (m.shadow) m.shadow.needsUpdate = true;
    }
    cam.position.copy(p0);
    cam.quaternion.copy(q0);
    cam.fov = fov0;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.applyLook();
  }

  // (FIN3) El fogón del claro: lo de Eclipse se esconde, la cámara no ve más
  // allá del claro (las otras islas) y el cielo es el domo de noche, más chico.
  claroMode(on) {
    const g = this.g;
    const w = g.world;
    if (on && !this.claroAway) {
      this.claroAway = [];
      const add = (o) => {
        if (o && o.visible) {
          o.visible = false;
          this.claroAway.push(o);
        }
      };
      // (las islas: con la arena de San Lorenzo puesta, mode() las esconde o las saca)
      const isl = this.islands;
      if (isl) {
        if (!isl.parent) g.scene.add(isl);
        isl.visible = true;
        this.claroIsl = isl;
      }
      // (por capas y no por visible: los que esconden y muestran las islas
      // según la cámara —world/eclipse centro detailCuller— no los vuelven a prender)
      this.claroLayers = [];
      g.scene.traverse((o) => {
        if (o === this.root || !o.name || !CLARO_AWAY.test(o.name)) return;
        for (let q = o.parent; q; q = q.parent) if (q === this.root) return;
        o.traverse((m) => {
          if (m.layers.mask === LAYER_OFF) return;
          this.claroLayers.push([m, m.layers.mask]);
          m.layers.mask = LAYER_OFF;
        });
      });
      add(w.sky);
      // las luces violetas del claro (la grieta, los cristales): apagadas
      const C0 = SET_AT.fogon;
      this.claroLights = [];
      if (C0) {
        g.scene.traverse((o) => {
          if (!(o.isPointLight || o.isSpotLight)) return;
          const c = o.color;
          if (!(c.b > c.g * 1.5 && c.r > c.g * 1.05)) return;
          const p = o.getWorldPosition(tmpV);
          if (p.distanceTo(C0) > 45) return;
          this.claroLights.push([o, o.intensity]);
        });
      }
      this.domeS = (CLARO_FAR - 8) / 280;
      this.claroFar = true;
      // y el campo de San Lorenzo, afuera
      const ar = this.ee.arena;
      if (ar?.top?.visible) {
        ar.top.visible = false;
        this.claroAway.push(ar.top);
      }
    } else if (!on && this.claroAway) {
      for (const o of this.claroAway) o.visible = true;
      this.claroAway = null;
      for (const [m, mask] of this.claroLayers || []) m.layers.mask = mask;
      this.claroLayers = null;
      for (const [l, i] of this.claroLights || []) l.intensity = i;
      this.claroLights = null;
      if (this.claroIsl) {
        this.claroIsl.visible = this.modeK === 'islas';
        this.claroIsl = null;
      }
      this.domeS = 1;
      this.claroFar = false;
      if (this.far0 != null) {
        g.camera.far = this.far0;
        g.camera.updateProjectionMatrix();
        this.far0 = null;
      }
    }
  }

  // (FIN3) El decorado del fogón, llevado al fogón de verdad del claro (EE.fogon):
  // sin su piso, su camino ni su fuego (el claro tiene el suyo); los cuatro se
  // sientan en los tres troncos del claro y en uno más.
  claroFogon() {
    const w = this.g.world;
    const [fx, fz] = EE.fogon;
    const fy = w.floorAt(fx, fz);
    const C = new THREE.Vector3(fx, fy, fz);
    SET_AT.fogon = C.clone();
    const G = this.sets.groups?.fogon;
    if (G) {
      G.position.copy(C).sub(STAGE).sub(SET.fogon);
      const logs = [];
      G.traverse((o) => {
        if (o.userData.setOnly) o.visible = false;
        if (o.userData.setLog) logs.push(o);
      });
      // los troncos del claro (world/eclipse/centro buildCamp) y el hueco más grande para uno más
      const toStart = Math.atan2(PLAYER_START.z - fz, PLAYER_START.x - fx);
      const angs = [1.25, 2.6, -1.35].map((d) => toStart + Math.PI + d);
      const srt = angs.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
      let best = 0;
      let a4 = 0;
      for (let i = 0; i < srt.length; i++) {
        const a0 = srt[i];
        const a1 = i + 1 < srt.length ? srt[i + 1] : srt[0] + Math.PI * 2;
        if (a1 - a0 > best) {
          best = a1 - a0;
          a4 = (a0 + a1) / 2;
        }
      }
      // (el de los recados y la leña está más afuera, a 2,8-3,1 m: no estorba)
      const all = [...angs, a4];
      this.seatsW = all.map((a) => {
        const p = new THREE.Vector3(fx + Math.cos(a) * 1.75, 0, fz + Math.sin(a) * 1.75);
        p.y = w.floorAt(p.x, p.z);
        return p;
      });
      // un tronco nuestro para el cuarto; los otros del decorado, escondidos
      logs.forEach((o, i) => {
        o.visible = i === 0;
        if (i) return;
        o.position.set(SET.fogon.x + Math.cos(a4) * 1.75, 0.2, SET.fogon.z + Math.sin(a4) * 1.75);
        o.rotation.set(0, -a4 + Math.PI / 2, 0);
      });
      // el santuario chico del decorado: del lado del algarrobo (el del Gil)
      const [ax, az] = EE.algarrobo;
      this.algarrobo = new THREE.Vector3(ax, w.floorAt(ax, az), az);
    }
  }

  // (FIN3) Los que vienen a buscar al Gil (paso 6): soldados a caballo con antorchas.
  buildRiders() {
    const A = this.A;
    this.riders = [];
    for (let i = 0; i < 6; i++) {
      const h = this.horses.add({ x: 0, y: 0, z: 0, yaw: 0, gait: null });
      h.visible = false;
      // (FIN8: el del medio es el sargento: lleva sable —envainado hasta que lo saca—)
      const a = granadero(A.people, { id: 720 + i, pos: new THREE.Vector3(), yaw: 0, sable: FIN8() && i === SGT ? 'simple' : null });
      a.r.dead = true;
      const m = new Montura(a, h, { brazos: 'senala' });
      this.riders.push({ h, a, m });
    }
  }

  // La luz y la niebla del decorado que se ve (cada cuadro, antes de dibujar:
  // el mundo y el clima las vuelven a poner en su update).
  applyLook() {
    const g = this.g;
    const w = g.world;
    if (this.claroLights) for (const [l] of this.claroLights) l.intensity = 0;
    if (this.claroFar && g.camera.far !== CLARO_FAR) {
      if (this.far0 == null) this.far0 = g.camera.far;
      g.camera.far = CLARO_FAR;
      g.camera.updateProjectionMatrix();
    }
    const L0 = this.lookCfg;
    if (!L0) {
      // (sesión 1f: el universo que se cose se aclara de a poco: de lejos las
      // islas eran manchas negras sobre violeta)
      if (FIN2() && this.modeK === 'islas' && this.sew && this.base0) {
        const d = smooth(clamp01((this.t - this.sew.t - 4) / 12));
        const B0 = this.base0;
        if (w.hemi && B0.hemi) w.hemi.intensity = B0.hemi.i * (1.4 + 1.6 * d);
        if (w.ambient && B0.amb) w.ambient.intensity = B0.amb.i * (1.4 + 1.2 * d);
        if (w.moon && B0.moon) w.moon.intensity = B0.moon.i * (1.1 + 0.8 * d);
        const f = g.scene.fog;
        if (f && B0.fog) f.color.copy(B0.fog.c).lerp(tmpC.set(0x8a6a50), 0.55 * d);
      }
      if (this.modeK === 'campo' && this.campo && this.base0?.moon && w.moon) {
        w.moon.intensity = this.base0.moon.i * 0.68;
        if (w.hemi && this.base0.hemi) w.hemi.intensity = this.base0.hemi.i * 0.8;
      }
      return;
    }
    const m = w.moon;
    if (m) {
      m.color.set(L0.sun);
      m.intensity = L0.sunI;
      tmpV.set(...L0.dir).normalize();
      m.position.copy(m.target.position).addScaledVector(tmpV, 120);
      if (m.shadow) m.shadow.needsUpdate = true;
    }
    if (w.hemi) {
      w.hemi.color.set(L0.hs);
      w.hemi.groundColor.set(L0.hg);
      w.hemi.intensity = L0.hI;
    }
    if (w.ambient) {
      w.ambient.color.set(L0.amb);
      w.ambient.intensity = L0.ambI;
    }
    const f = g.scene.fog;
    if (f) {
      f.color.set(L0.fog);
      // (F4: en los decorados de día, más bruma: el fondo se pierde en el aire)
      const haze = (this.modeK === 'manana' || this.modeK === 'santuario') && L0.fogSet && globalThis.__mduOldFinSets !== true;
      if (haze && L0.fogSetC) f.color.set(L0.fogSetC);
      if (f.density != null) f.density = haze ? L0.fogSet : L0.fogD;
    }
    g.renderer.shadowMap.needsUpdate = true;
  }

  restoreLook() {
    const g = this.g;
    const w = g.world;
    const B0 = this.base0;
    const m = w.moon;
    if (m && B0.moon) {
      m.color.copy(B0.moon.c);
      m.intensity = B0.moon.i;
      m.position.copy(B0.moon.p);
      m.target.position.copy(B0.moon.tp);
      m.target.updateMatrixWorld();
    }
    if (w.hemi && B0.hemi) {
      w.hemi.color.copy(B0.hemi.c);
      w.hemi.groundColor.copy(B0.hemi.gc);
      w.hemi.intensity = B0.hemi.i;
    }
    if (w.ambient && B0.amb) {
      w.ambient.color.copy(B0.amb.c);
      w.ambient.intensity = B0.amb.i;
    }
    if (g.scene.fog && B0.fog) {
      g.scene.fog.color.copy(B0.fog.c);
      g.scene.fog.density = B0.fog.d;
    }
  }

  // un tronco del fogón, en el mundo
  seatW(i) {
    if (this.seatsW) return this.seatsW[i].clone();
    const s = this.sets.seats[i];
    return new THREE.Vector3(STAGE.x + s.x, STAGE.y, STAGE.z + s.z);
  }

  // ---------------- los cuerpos ----------------
  // pone a uno en (pos) mirando a (to) con un clip
  put(C, r, pos, to, clip, o = {}) {
    r.pos.copy(pos);
    r.pos.y = this.floorAt(pos.x, pos.z);
    if (to) r.yaw = yawTo(r.pos, to);
    r.mv = null;
    r.turn = null;
    r.dead = false;
    // (puesto de golpe: lo que se le pida en este cuadro arranca sin mezcla; ui/cineActors act)
    r.tpAt = C.t;
    C.act(r, clip, { loop: true, fade: 0.01, ...o });
  }

  belPose(P) {
    const b = this.bel;
    const t = this.t;
    const T = { headP: 0.05, torsoP: 0.03 * Math.sin(t * 1.6), torsoR: 0.035 * Math.sin(t * 0.55), headY: 0.07 * Math.sin(t * 0.37 + 1), shLp: -0.1, shLr: 0.12, elL: -0.34, elR: -0.26, shRp: -0.06, shRr: -0.1 };
    if (b.arm === 2) {
      T.shRp = -1.1;
      T.shRr = 0.15;
      T.elR = -0.55;
    } else if (b.arm === 3) {
      // (lo lleva: el codo doblado, el mate adelante del pecho)
      T.shRp = -0.45;
      T.shRr = 0.12;
      T.elR = -1.35;
    }
    const k = Math.min(1, (this.dt || 0.016) * 4.5);
    for (const key of Object.keys(T)) {
      const c = b.cur[key] ?? T[key];
      b.cur[key] = c + (T[key] - c) * k;
      P[key] = b.cur[key];
    }
  }

  // el Primer Mate: entre las dos manos, en la palma, en la mano de Belgrano, o escondido
  // Belgrano camina por los puntos pts a v m/s y al llegar mira a face.
  belPath(pts, v, face = null) {
    const b = this.bel;
    const P = [b.r.pos.clone(), ...pts.map((q) => q.clone())];
    const seg = [];
    let L = 0;
    for (let i = 1; i < P.length; i++) {
      const d = Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      seg.push(d);
      L += d;
    }
    b.walk = { P, seg, L, v, t: 0, face };
  }

  placeMate() {
    const o = this.mateAt;
    const m = this.mate;
    // (FIN8: a la vista si se ve el elenco del que lo tiene: en el fogón —el
    // elenco B— el Primer Mate nunca aparecía en las manos de Fierro)
    const cast = FIN8() && o?.r ? [this.A, this.B, this.Sx].find((C) => C.list.includes(o.r)) || this.A : this.A;
    m.visible = !!o && cast.people.root.visible;
    if (!m.visible) return;
    if (o.kind === 'two') {
      const B = o.r.a?.gs?.bones;
      if (!B) return (m.visible = false);
      B.LeftHand.getWorldPosition(tmpV);
      B.RightHand.getWorldPosition(tmpW);
      tmpV.add(tmpW).multiplyScalar(0.5);
      // (un poco adelante de las muñecas, en el hueco de las palmas)
      tmpU.set(-Math.sin(o.r.yaw), 0, -Math.cos(o.r.yaw));
      tmpV.addScaledVector(tmpU, 0.06);
      tmpV.y += 0.02;
      m.position.copy(tmpV);
      m.quaternion.setFromAxisAngle(UP, o.r.yaw);
    } else if (o.kind === 'palm') {
      const B = o.r.a?.gs?.bones;
      if (!B) return (m.visible = false);
      B.RightHand.getWorldPosition(tmpV);
      B.RightForeArm.getWorldPosition(tmpW);
      tmpW.subVectors(tmpV, tmpW).normalize();
      tmpV.addScaledVector(tmpW, 0.07);
      tmpV.y += 0.03;
      m.position.copy(tmpV);
      m.quaternion.setFromAxisAngle(UP, o.r.yaw);
    } else if (o.kind === 'grip') {
      // (2026-10-09, el usuario: "Belgrano sigue agarrando mal el mate". Iba en
      // la pieza del antebrazo del muñeco de abajo —la izquierda, y el modelo
      // que se ve levantaba la derecha—: flotaba al lado de la mano. Ahora en
      // la mano del modelo, en el hueco de la palma. La que se dobla con el
      // brazo "R" de belPose es la izquierda del modelo: ver belgranoSkin MAP.
      // El origen del mate es la base: el porongo baja para quedar en la palma)
      const B = o.a?.gs?.bones;
      if (!B?.LeftHand) return (m.visible = false);
      B.LeftHand.getWorldPosition(tmpV);
      B.LeftForeArm.getWorldPosition(tmpW);
      tmpW.subVectors(tmpV, tmpW).normalize();
      // (la palma mira al cuerpo: el porongo, un poco hacia adentro)
      if (B.Spine) {
        B.Spine.getWorldPosition(tmpU).sub(tmpV);
        tmpU.addScaledVector(tmpW, -tmpU.dot(tmpW));
        tmpU.y = 0;
        if (tmpU.lengthSq() > 1e-6) tmpV.addScaledVector(tmpU.normalize(), BEL_GRIP[2]);
      }
      tmpV.addScaledVector(tmpW, BEL_GRIP[0]);
      tmpV.y += BEL_GRIP[1];
      m.position.copy(tmpV);
      m.quaternion.setFromAxisAngle(UP, o.r.yaw);
    } else if (o.kind === 'part') {
      tmpV.set(0, -0.2, 0).applyMatrix4(o.a.mats[6]);
      m.position.copy(tmpV).add(tmpW.set(0, 0.02, 0));
      m.quaternion.identity();
    }
  }

  // ---------------- el guion ----------------
  script0() {
    const g = this.g;
    const A = this.A;
    const gil = this.gil;
    const ben = this.benito;
    const cir = this.cirilo;
    const ana = this.anacleto;
    const bel = this.bel;
    const sm = this.sm;
    const F = (u, v, h) => this.F(u, v, h);
    const S = (k, x, z, h) => this.S(k, x, z, h);
    // dónde está cada uno en el campo (u hacia el río y el sol que sale, v de costado)
    const GIL0 = F(8, 0);
    const SMH = F(13.6, 1.2);
    const BEL0 = F(11.8, -2.6);
    const BEN0 = F(5.2, -1.5);
    const CIR0 = F(4.7, 0.3);
    const ANA0 = F(5.3, 1.9);
    // (donde Cirilo recibe el mate y se despide; ver el paso 3)
    const OB = globalThis.__mduOldFinBel === true;
    const CIR1 = OB ? F(5.4, 0.15) : F(5.75, -0.1);
    const placeCampo = () => {
      this.put(A, gil, GIL0, F(12, 0.2), 'gilMateHold');
      this.put(A, ben, BEN0, GIL0, 'cower');
      this.put(A, cir, CIR0, GIL0, 'crossArms');
      this.put(A, ana, ANA0, GIL0, 'winded');
      bel.r.pos.copy(BEL0);
      bel.r.yaw = yawTo(BEL0, GIL0);
      const h = this.horse;
      h.pos.copy(SMH);
      h.groundY = SMH.y;
      h.yaw = Math.atan2(GIL0.x - SMH.x, GIL0.z - SMH.z);
      h.speed = 0;
      this.mateAt = { kind: 'two', r: gil };
    };
    const steps = [];
    const step = (fn) => steps.push([0, fn]);
    // (E3) un cartel de tiempo, en negro, entre dos pasos
    // (FIN8: con aire —negro, silencio, texto, canción nueva—; el del santuario
    // (`soft`) no corta: va escrito sobre la imagen, con la misma canción)
    const card = (text, onBlack, hold, soft, onText, chord) => step(() => (!TIEMPO() ? 0 : FIN8() ? (soft ? 0 : this.timeCard8(text, hold, onText, chord)) : this.timeCard(text, onBlack, hold)));

    // 1. El campo de San Lorenzo al alba, con humo
    step(() => {
      this.mode('campo');
      placeCampo();
      // (El Eclipse cayó: el disco se corre del sol, las grietas casi se apagan)
      this.g.world.eclipse?.set?.(0.08, 0);
      this.crackK = 0.45;
      this.nightK = null;
      // (los cuerpos aparecen ya puestos, con el negro todavía: sin el salto de la
      // primera pose)
      A.show(false);
      this.at(0.6, () => this.modeK === 'campo' && A.show(true));
      this.wind(14);
      this.at(0.4, () => this.fade(false));
      this.cut(10, F(1.2, -5.4, 1.85), F(2.6, -4.6, 1.75), F(9.6, 0.2, 1.25), F(9.8, 0.3, 1.3), 46);
      this.at(2.2, () => this.say('fierro', L.todo));
      // (FIN3: música todo el final; la de la despedida, desde acá)
      if (FIN3() && !FIN8()) this.at(0.3, () => g.music?.play?.('fin-eclipse-a', { fadeIn: 5, while: (G) => G.ee?.scene?.cine === this }));
      return 10;
    });
    // 2. El mate brilla: lo que podría ser (el Gil viejo, en paz, con los suyos)
    step(() => {
      if (FIN3()) {
        // (FIN3: el cuadro sigue al mate, que es lo que brilla; antes, el poncho)
        const fu = F(9, 0).sub(F(8, 0)).setY(0).normalize();
        const fv = F(8, 1).sub(F(8, 0)).setY(0).normalize();
        this.shot(1.8, (u, lt, pos, look) => {
          this.mate.getWorldPosition(look);
          pos.copy(look).addScaledVector(fu, 0.95 - 0.15 * u).addScaledVector(fv, 0.32);
          pos.y += 0.3;
          look.y += 0.04;
        });
        this.setFov(34);
      } else this.cut(1.8, F(9.1, 0.35, 1.32), F(8.95, 0.3, 1.28), F(8.36, 0, 1.12), F(8.36, 0, 1.12), 34);
      this.glowTo = 1;
      this.at(1.6, () => {
        this.whiteEl.style.transition = 'opacity 0.5s';
        this.white(true);
      });
      this.at(2.2, () => {
        // la visión: en el fogón, de día, en sepia: viejos y juntos
        // (2026-10-07, el usuario: "la primera vez que aparece el campamento
        // está con los gráficos viejos y algunos están sentados sobre el
        // aire": era el decorado viejo con los asientos ya en el claro. Ahora
        // el claro de verdad, con sus troncos. __mduOldFinVision: como antes)
        // (con el blanco puesto: los decorados que vienen, dibujados una vez)
        this.warmSets();
        this.mode(FIN3() && globalThis.__mduOldFinVision !== true ? 'vision3' : 'vision');
        g.renderer.domElement.style.filter = 'sepia(0.85) brightness(1.05) contrast(0.95)';
        const fire = S('fogon', 0, 0);
        const sit = (r, i, clip) => this.put(A, r, this.seatW(i), fire, clip);
        sit(gil, 0, 'sitMate');
        sit(ana, 1, 'sitTalk');
        sit(ben, 2, 'sitLaugh');
        sit(cir, 3, 'sitTalk');
        gil.mate = true;
        this.mateAt = null;
        this.white(false);
        this.shot(5.2, (u, lt, pos, look) => {
          const a = 0.0 + u * 0.28;
          pos.copy(fire).add(tmpV.set(Math.cos(a) * 4.3, 1.75, Math.sin(a) * 4.3));
          look.copy(fire).setY(fire.y + 0.75);
        });
      });
      this.at(7.0, () => this.white(true));
      this.at(7.5, () => {
        g.renderer.domElement.style.filter = '';
        gil.mate = false;
        this.mode('campo');
        placeCampo();
        this.white(false);
        // la cara del Gil: cierra los ojos y apaga el mate
        this.cut(FIN4() ? (FIN8() ? 14.5 : 11) : 7.5, F(9.45, 0.4, 1.6), F(9.3, 0.35, 1.58), F(8.0, 0.0, 1.45), F(8.0, 0.0, 1.38), 32);
      });
      if (FIN4() && FIN8()) {
        // (cada línea cuando terminó la de antes: se pisaban y el texto iba adelantado)
        const t1 = 8.0;
        const t2 = t1 + est(L4.roto) + 0.5;
        this.at(t1, () => this.say('sanmartin', L4.roto));
        this.at(10.6, () => {
          gil.a.faint = 1;
          this.glowTo = 0;
        });
        if (FIN10()) {
          // (el usuario: "se pierde el hilo": "Y lo sueltan" va antes de que
          // el Gil diga que en el suyo lo esperan para matarlo. Lo dice Fierro,
          // como siempre —ahora con su nombre—; __mduFinSueltanSM: San Martín)
          const t3 = t2 + est(L.sueltan) + 0.6;
          this.at(t2, () => this.say(globalThis.__mduFinSueltanSM === true ? 'sanmartin' : 'fierro', L.sueltan));
          this.at(t3, () => this.say('gil', L4.espera));
          return t3 + est(L4.espera) + 0.7;
        }
        const t3 = t2 + est(L4.espera) + 0.6;
        this.at(t2, () => this.say('gil', L4.espera));
        this.at(t3, () => this.say('fierro', L.sueltan));
        return t3 + est(L.sueltan) + 0.7;
      }
      if (FIN4()) {
        // (lo dicen: San Martín, de afuera de cuadro; el Gil, que sabe a qué vuelve)
        this.at(8.0, () => this.say('sanmartin', L4.roto));
        this.at(10.6, () => {
          gil.a.faint = 1;
          this.glowTo = 0;
        });
        this.at(13.7, () => this.say('gil', L4.espera));
        this.at(16.6, () => this.say('fierro', L.sueltan));
        return 18.5;
      }
      this.at(8.6, () => {
        gil.a.faint = 1;
        this.glowTo = 0;
      });
      this.at(11.6, () => this.say('fierro', L.sueltan));
      return 15;
    });
    // 3. Se lo da a San Martín, que mira a Belgrano; Belgrano se lo da a los compañeros
    step(() => {
      gil.a.faint = 0;
      // (FIN8: "sacrificio gil" tiene 18 s de entrada suave y después sube: sube
      // justo cuando la cámara corta a Benito llorando, a los 4,2 s de la
      // despedida, y se termina sola cuando el Gil entra al desgarro)
      if (FIN8()) this.at((globalThis.__mduOldFinBel !== true ? 17.5 : 15) + 4.2 - 18, () => this.song('fin8-sacrificio'));
      this.cut(6.5, F(10.2, -4.2, 1.5), F(10.6, -3.9, 1.55), F(11.6, 0.4, 1.45), F(12.4, 0.8, 1.7), 46);
      this.at(0.3, () => {
        this.mateAt = { kind: 'palm', r: gil };
        A.walkTo(gil, F(11.9, 0.7), 2.6, 'offer', { loop: false, fade: 0.3 });
      });
      this.at(3.6, () => (this.smLook = 1));
      this.at(4.2, () => (this.smShake = this.t));
      if (FIN3()) this.at(4.5, () => this.say('sanmartin', L3.noEsMio));
      this.at(5.6, () => (this.smLook = -1));
      this.at(6.5, () => {
        this.say('fierro', L.todos);
        this.cut(8.5, F(8.4, -5.6, 1.6), F(8.1, -5.3, 1.6), F(10.6, -1.6, 1.25), F(7.6, -0.4, 1.2), 46);
        A.turnTo(gil, BEL0, 0.7);
        A.act(gil, 'idle', { loop: true, fade: 0.3 });
      });
      this.at(7.3, () => A.walkTo(gil, F(11.3, -1.9), 1.3, 'offer', { loop: false, fade: 0.3 }));
      this.at(9.0, () => (bel.arm = 2));
      this.at(9.6, () => {
        this.mateAt = BEL9() ? { kind: 'grip', a: bel.a, r: bel.r } : { kind: 'part', a: bel.a };
        if (BEL9()) this.later(0.5, () => (bel.arm = 3));
        A.act(gil, 'chestHand', { loop: true, fade: 0.5 });
      });
      // Belgrano camina hasta los compañeros y se lo da a Cirilo, que se adelanta
      // (2026-10-07, el usuario: "Belgrano se adelanta caminando como Speedy
      // González y atraviesa al Gil"; y después "sigue ahí en el medio" de las
      // despedidas. Ahora rodea al Gil a paso, se lo da a un metro y se aparta.
      // __mduOldFinBel: como antes)
      if (globalThis.__mduOldFinBel !== true) {
        this.at(10.2, () => this.belPath([F(10.3, -3.3), F(6.75, -0.75)], 1.25, CIR1));
        this.at(13.6, () => A.walkTo(cir, CIR1, 1.0, 'receive', { loop: false, fade: 0.3 }));
        // (lo estira recién para darlo)
        if (BEL9()) this.at(14.5, () => (bel.arm = 2));
        this.at(15.2, () => (this.mateAt = { kind: 'palm', r: cir }));
        this.at(15.6, () => (bel.arm = 0));
        this.at(16.2, () => this.belPath([F(8.2, -2.6), F(9.4, -3.7)], 1.1, F(6.0, -0.4)));
        this.at(16.4, () => A.act(cir, 'cebar', { loop: true, fade: 0.5 }));
        return 17.5;
      }
      this.at(10.2, () => {
        bel.walk = { from: bel.r.pos.clone(), to: F(6.6, 0.0), t: 0, d: 2.4 };
      });
      this.at(11.3, () => A.walkTo(cir, F(5.4, 0.15), 0.9, 'receive', { loop: false, fade: 0.3 }));
      this.at(13.2, () => (this.mateAt = { kind: 'palm', r: cir }));
      this.at(13.6, () => (bel.arm = 0));
      this.at(14.3, () => A.act(cir, 'cebar', { loop: true, fade: 0.5 }));
      return 15;
    });
    // 4. Se despide de los tres
    step(() => {
      if (FIN4() && FIN8() && !OB) return this.adios8(A, gil, ben, cir, ana, F, CIR1, ANA0);
      if (FIN4()) return this.adios(A, gil, ben, cir, ana, F, OB, CIR1, ANA0);
      this.cut(4.2, F(2.4, 0.9, 1.6), F(2.6, 0.7, 1.6), F(9, -0.8, 1.3), F(7, -1.0, 1.3), 46);
      A.walkTo(gil, F(6.0, -1.5), 3.8, 'chestHand', { loop: true, fade: 0.5 });
      // (FIN3: de costado, los dos enteros —de atrás, la espalda del Gil tapaba
      // al otro— y a 0,8 m: a 0,6 se metían uno en el otro)
      const f3 = FIN3();
      this.at(4.2, () => {
        if (f3) this.cut(3, F(5.65, -3.85, 1.55), F(5.75, -3.75, 1.55), F(5.6, -1.5, 1.4), F(5.6, -1.5, 1.38), 40);
        else this.cut(3, F(7.25, -2.15, 1.7), F(7.15, -2.1, 1.68), F(5.2, -1.5, 1.45), F(5.2, -1.5, 1.42), 40);
        A.act(ben, 'sob', { loop: true, fade: 0.5 });
      });
      // (2026-10-07: "no se despide con el de azul, o lo hace apuntando como el
      // orto": llegaba mirando para donde caminaba. Ahora se paran de frente)
      const GC = OB ? F(f3 ? 6.2 : 6.0, 0.25) : F(6.5, 0.3);
      this.at(7.2, () => {
        A.walkTo(gil, GC, 1.4, 'chestHand', { loop: true, fade: 0.5 });
        if (!OB) this.cut(2.6, F(7.0, 2.6, 1.7), F(6.9, 2.5, 1.68), F(6.1, 0.1, 1.42), F(6.1, 0.1, 1.4), 40);
        else if (f3) this.cut(2.6, F(7.0, 2.6, 1.7), F(6.9, 2.5, 1.68), F(5.5, 0.2, 1.42), F(5.5, 0.2, 1.4), 40);
        else this.cut(2.6, F(7.25, -0.4, 1.7), F(7.15, -0.35, 1.68), F(5.4, 0.15, 1.45), F(5.4, 0.15, 1.42), 40);
      });
      if (!OB) {
        this.at(8.4, () => {
          A.turnTo(gil, CIR1, 0.35);
          A.turnTo(cir, GC, 0.45);
        });
      }
      this.at(8.9, () => A.act(cir, 'cool', { loop: true, fade: 0.5 }));
      const ANA1 = F(f3 ? 6.15 : 5.92, 1.9);
      this.at(9.8, () => {
        A.walkTo(gil, ANA1, 1.4, 'idle', { loop: true, fade: 0.4 });
        this.cut(4.4, F(5.6, 4.6, 1.6), F(5.7, 4.4, 1.6), F(5.6, 1.9, 1.2), F(5.6, 1.9, 1.2), 40);
      });
      this.at(11.3, () => {
        A.turnTo(gil, ANA0, 0.4);
        A.act(gil, 'shake', { fade: 0.3 });
        A.turnTo(ana, ANA1, 0.4);
        A.act(ana, 'shake', { fade: 0.3 });
      });
      return 14.2;
    });
    // 5. El desgarro al estero de 1877: el Gil entra solo
    step(() => {
      const RP = F(10.2, 1.2);
      const rr = this.rift.root;
      rr.position.copy(RP);
      rr.rotation.y = Math.atan2(ANA0.x - RP.x, ANA0.z - RP.z);
      rr.visible = true;
      this.riftOpen = { t: this.stepAt ?? this.t };
      this.sfx('tear', RP);
      if (FIN3()) {
        // (FIN3) el Gil se da vuelta; San Martín, de frente, alza el sable que el
        // Gil le trajo del Monumento y le habla; el Gil entra al desgarro
        this.cut(3.4, F(2.6, 1.3, 1.62), F(3.0, 1.25, 1.62), F(9.5, 1.2, 1.5), F(10.0, 1.2, 1.6), 46);
        this.at(1.0, () => {
          A.turnTo(gil, SMH, 0.8);
        });
        // (2026-10-07, el usuario: "San Martín habla medio rápido; algo tipo
        // 'serás lo que debas ser... o no serás nada' en lugar de todo
        // corrido": dos tiempos, con la pausa. __mduOldFinSeras: de un tirón)
        const OS = globalThis.__mduOldFinSeras === true;
        const D = OS ? 0 : 1.8;
        this.at(1.6, () => {
          // (FIN10, el usuario: "cuando San Martín levanta el sable para decir
          // 'serás lo que debas ser', se tapa la cara": en alto y al costado)
          this.mont.brazos = FIN10() ? 'alza' : 'senala';
          // (de abajo y de frente, siguiendo al jinete: la cabeza y el sable en alto)
          const c0 = F(10.6, -1.3);
          const c1 = F(10.9, -1.15);
          this.shot(3.6 + D, (u, lt, pos, look) => {
            const sp = this.sm.r.pos;
            pos.lerpVectors(c0, c1, smooth(u));
            pos.y = sp.y + 0.75;
            look.copy(sp);
            look.y += 1.3;
          });
          this.setFov(32);
        });
        if (OS) this.at(2.0, () => this.say('sanmartin', L3.seras));
        else {
          this.at(2.0, () => this.say('sanmartin', L3.seras1));
          this.at(4.6, () => this.say('sanmartin', L3.seras2));
        }
        this.at(5.2 + D, () => {
          A.turnTo(gil, RP, 0.8);
          A.act(gil, 'walk', { loop: true, fade: 0.3, rate: 0.4 });
          this.cut(5.6, F(2.6, 1.3, 1.62), F(3.0, 1.25, 1.62), F(9.5, 1.2, 1.5), F(10.0, 1.2, 1.6), 46);
        });
        if (FIN10()) return 5.9 + D + this.gilAdios(A, gil, ben, cir, ana, RP, F, 5.9 + D);
        this.at(5.9 + D, () => A.walkPath(gil, [RP.clone(), F(11.6, 1.2)], 0.95, 'idle', { loop: true }));
        this.at(6.4 + D, () => this.say('fierro', L.volvio));
        this.at(6.2 + D, () => A.act(ben, 'chestHand', { loop: true, fade: 0.6 }));
        this.at(6.8 + D, () => A.act(ana, 'brimBow', { fade: 0.5 }));
        this.at(9.9 + D, () => {
          gil.dead = true;
          this.mateAt = { kind: 'palm', r: cir };
        });
        this.at(10.5 + D, () => {
          this.riftClose = this.t;
          this.mont.brazos = 'sable';
        });
        return 12 + D;
      }
      this.cut(8.5, F(2.6, 1.3, 1.62), F(3.0, 1.25, 1.62), F(9.5, 1.2, 1.5), F(10.0, 1.2, 1.6), 46);
      this.at(1.4, () => {
        A.turnTo(gil, RP, 0.8);
        A.act(gil, 'walk', { loop: true, fade: 0.3, rate: 0.4 });
      });
      this.at(2.2, () => A.walkPath(gil, [RP.clone(), F(11.6, 1.2)], 0.95, 'idle', { loop: true }));
      this.at(1.8, () => this.say('fierro', L.volvio));
      this.at(2.6, () => A.act(ben, 'chestHand', { loop: true, fade: 0.6 }));
      this.at(3.4, () => A.act(ana, 'brimBow', { fade: 0.5 }));
      this.at(6.2, () => {
        gil.dead = true;
        this.mateAt = { kind: 'palm', r: cir };
      });
      this.at(6.9, () => (this.riftClose = this.t));
      return 8.5;
    });
    // (FIN11: la canción de la muerte del Gauchito entra con el cartel de Mercedes)
    card(T4.estero, null, false, false, () => {
      if (!FIN11()) return;
      this.funeralOn = true;
      this.song('fin8-funeral', { fadeIn: 2.5 });
    }, [45, 52, 57]);
    // 6. El estero de noche: hasta el algarrobo
    step(() => {
      this.mode('estero');
      if (FIN8() && !this.funeralOn) this.at(0.2, () => this.song('fin8-funeral', { fadeIn: 2.5 }));
      this.rift.root.visible = false;
      this.mateAt = null;
      for (const r of [ben, cir, ana]) r.dead = true;
      if (FIN2()) {
        // (el Gil vuelve al algarrobo; allá lejos se prenden las antorchas de
        // los que lo vienen a buscar; se da vuelta, se saca el sombrero y se
        // arrodilla. La muerte no se ve: negro con el galope que llega)
        const T0 = S('estero', -1.4, 1.7);
        this.put(A, gil, S('estero', -7.5, 4.8), S('estero', 0, 0), 'walk', { rate: 0 });
        A.walkPath(gil, [T0], 1.0, 'idle', { loop: true });
        this.wind(22, 0.1);
        this.torchesOn = { t: this.stepAt ?? this.t, to: T0 };
        this.nextHoof = 0;
        // A: atrás del Gil, que camina al árbol; adelante, lejos, se prenden las antorchas
        const fw = new THREE.Vector3().subVectors(T0, S('estero', -7.5, 4.8)).setY(0).normalize();
        const sd = V3(-fw.z, 0, fw.x);
        this.shot(6.4, (u, lt, pos, look) => {
          pos.copy(gil.pos).addScaledVector(fw, -2.9).addScaledVector(sd, 0.7);
          pos.y += 1.75;
          look.copy(gil.pos).addScaledVector(fw, 6);
          look.y += 1.25;
        });
        this.setFov(48);
        // B: se da vuelta hacia los que vienen y se saca el sombrero (de atrás: las antorchas enfrente)
        const tw = V3(0.75, 0, -0.66).normalize();
        this.at(6.4, () => {
          A.turnTo(gil, T0.clone().addScaledVector(tw, 10), 0.9);
          A.act(gil, 'brimBow', { fade: 0.4 });
          const c = T0.clone().addScaledVector(tw, -3.3).addScaledVector(V3(-tw.z, 0, tw.x), 0.9);
          c.y += 1.55;
          this.cut(4.4, c, c.clone().addScaledVector(tw, 0.3), T0.clone().addScaledVector(tw, 6).setY(T0.y + 1.6), T0.clone().addScaledVector(tw, 6).setY(T0.y + 1.5), 46);
        });
        // C: de frente, se arrodilla (la luz de las antorchas ya le pega)
        this.at(10.8, () => {
          A.act(gil, 'svKneel', { fade: 0.4 });
          const c = T0.clone().addScaledVector(tw, 2.6).addScaledVector(V3(-tw.z, 0, tw.x), -0.6);
          c.y += 1.05;
          this.cut(2.8, c, c.clone().addScaledVector(tw, -0.25), T0.clone().setY(T0.y + 1.05), T0.clone().setY(T0.y + 0.8), 40);
        });
        // D: lejos y bajo: las antorchas cierran el círculo alrededor del árbol
        this.at(13.6, () => this.cut(3.4, T0.clone().addScaledVector(tw, -9).add(V3(0, 2.4, 0)), T0.clone().addScaledVector(tw, -8).add(V3(0, 2.2, 0)), T0.clone().setY(T0.y + 1.2), T0.clone().setY(T0.y + 1.1), 40));
        if (FIN8()) return this.muerte8(A, gil, T0, tw);
        this.at(15.4, () => this.fade(true));
        return 17;
      }
      this.put(A, gil, S('estero', -7.5, 4.8), S('estero', 0, 0), 'walk', { rate: 0 });
      A.walkPath(gil, [S('estero', -1.6, 1.4)], 1.05, 'idle', { loop: true });
      this.wind(18, 0.1);
      this.cut(6.4, S('estero', -11, 7.2, 1.7), S('estero', -9.4, 6.0, 1.75), S('estero', -3, 2, 1.6), S('estero', 0, 0, 2.6), 46);
      return 6.4;
    });
    // 7. La cinta colorada en el facón; el sol entre las ramas
    step(() => {
      this.gil.dead = true;
      this.torchesOn = null;
      if (this.torchG) this.torchG.visible = false;
      this.mode('manana');
      if (FIN2()) {
        // (la mañana: el sol bajo, del lado del agua; el facón con la cinta de
        // costado, con el tronco atrás de la cámara; después la grúa: el
        // algarrobo a contraluz con el sol sobre el agua)
        // (FIN3: el sol del lado de la cámara: a contraluz el facón y el piso quedaban negros)
        const sun = FIN3() ? [0.7, 0.34, 0.45] : [-0.75, 0.3, 0.62];
        this.lookCfg = { ...LOOKS.manana, dir: sun, sunI: 2.1, ...(FIN3() ? { hI: 1.5, hg: 0x6a5838, ambI: 0.6 } : {}) };
        setSky(this.dome, 'manana', V3(...sun).normalize(), V3(0.38, 0.42, -0.82).normalize());
        this.applyLook();
        const fp = this.sets.parts.facon.getWorldPosition(new THREE.Vector3());
        const tr = S('estero', 0, 0);
        const d = new THREE.Vector3().subVectors(fp, tr).setY(0).normalize();
        // (el facón de costado, a un metro, con lente larga: el facón y la cinta
        // enteros, el pajonal con sol atrás; después la grúa hasta el algarrobo
        // con su soga, el agua y el campo al sol)
        const c0 = fp.clone().add(V3(0.95, 0.3, 0.05));
        this.at(0.2, () => this.fade(false));
        this.cut(5.6, c0, fp.clone().add(V3(0.8, 0.27, 0.1)), fp.clone().add(V3(0, 0.15, 0)), fp.clone().add(V3(0, 0.17, 0)), 30);
        const p0 = tr.clone().add(V3(-3.1, 0.9, 3.85));
        const p1 = tr.clone().add(V3(-6.5, 4.0, 8.5));
        const l0 = fp.clone().add(V3(0, 0.25, 0));
        const l1 = tr.clone().add(V3(0, 2.4, 0));
        this.at(5.6, () => {
          this.shot(7.2, (u, lt, pos, look) => {
            const e = smooth(u);
            pos.lerpVectors(p0, p1, e);
            look.lerpVectors(l0, l1, e);
          });
          this.setFov(52);
        });
        if (FIN8() && TIEMPO()) {
          // (el sol entre las ramas se come el cuadro: del blanco sale el santuario)
          this.at(11.2, () => {
            this.whiteEl.style.transition = 'opacity 1.5s';
            this.white(true);
          });
          return 12.8;
        }
        this.at(11.6, () => this.fade(true));
        return 12.8;
      }
      // (la luz de la mañana por detrás de la cámara: con el sol de la toma de
      // las ramas, el facón quedaba a contraluz, negro)
      this.lookCfg = { ...LOOKS.manana, dir: [0.6, 0.5, 0.55] };
      const fc = this.sets.parts.facon;
      const fp = fc.getWorldPosition(new THREE.Vector3());
      this.cut(5, fp.clone().add(V3(0.42, 0.26, 0.34)), fp.clone().add(V3(0.36, 0.24, 0.29)), fp.clone().add(V3(0, 0.19, 0)), fp.clone().add(V3(0, 0.2, 0)), 34);
      this.at(5, () => {
        this.lookCfg = LOOKS.manana;
        const tp = S('estero', 0, 0);
        this.shot(5.2, (u, lt, pos, look) => {
          pos.copy(tp).add(tmpV.set(1.6 + u * 0.2, 0.6, 1.8 - u * 0.2));
          look.copy(tp).add(tmpV.set(-0.6, 6.5, -1.4));
        });
        this.setFov(58);
      });
      this.at(9.4, () => this.fade(true));
      return 10.4;
    });
    card(T4.santuario, null, false, true);
    // 8. El santuario del Gauchito
    step(() => {
      this.mode('santuario');
      const SX = this.Sx;
      // (dos grupos, con el pasillo en el medio: se ven la capillita y las velas)
      const spots = [[-2.3, 3.3], [-1.35, 3.65], [1.4, 3.6], [2.35, 3.25], [-2.0, 4.65], [-0.85, 4.95], [0.95, 4.85], [2.05, 4.45]];
      const clips = ['pray', 'chestHand', 'idle', 'pray', 'idle', 'chestHand', 'pray', 'idle'];
      SX.list.forEach((r, i) => this.put(SX, r, S('santuario', spots[i][0], spots[i][1]), S('santuario', spots[i][0] * 0.4, 0), clips[i], { t: i * 0.7 }));
      if (FIN8() && TIEMPO()) {
        // (sale del blanco; el tiempo, escrito sobre la imagen; sigue la canción del funeral)
        this.fade(false);
        this.at(0.3, () => {
          this.whiteEl.style.transition = 'opacity 2.4s';
          this.white(false);
        });
        this.at(1.3, () => this.timeTitle(T4.santuario, 5));
        this.cut(15, S('santuario', 0.4, 9.6, 2.35), S('santuario', 0.1, 7.6, 2.05), S('santuario', 0, 0, 0.75), S('santuario', 0, 0, 0.85), 44);
        this.at(7.6, () => this.say('fierro', L.gente));
        return 15;
      }
      this.at(0.3, () => this.fade(false));
      this.cut(14, S('santuario', 0.4, 9.6, 2.35), S('santuario', 0.1, 7.6, 2.05), S('santuario', 0, 0, 0.75), S('santuario', 0, 0, 0.85), 44);
      this.at(1.8, () => this.say('fierro', L.gente));
      if (!FIN8()) this.at(0.2, () => g.music?.play?.('cine-eclipse-final', { fadeIn: 4, while: (G) => G.ee?.scene?.cine === this }));
      return 14;
    });
    // 9. El universo se cose
    step(() => {
      this.whiteEl.style.transition = 'opacity 0.4s';
      this.white(true);
      this.at(0.45, () => {
        this.mode('islas');
        this.white(false);
        this.whiteEl.style.transition = 'opacity 2.5s';
        const I = ISLANDS.centro;
        const C = V3(I.center[0], I.y, I.center[1]);
        this.shot(27, (u, lt, pos, look) => {
          const a = 0.8 + u * 0.6;
          // (sesión 1f: más cerca: de lejos las islas eran manchas oscuras)
          const r = FIN2() ? lerp(72, 48, smooth(u)) : lerp(95, 70, smooth(u));
          pos.copy(C).add(tmpV.set(Math.cos(a) * r, FIN2() ? lerp(50, 28, smooth(u)) : lerp(70, 44, smooth(u)), Math.sin(a) * r));
          look.copy(C).add(tmpV.set(0, lerp(6, 18, smooth(u)), 0));
        });
        this.setFov(55);
        this.g.world.eclipse?.set?.(0, 12);
        this.sew = { t: this.t };
      });
      // (FIN8: el funeral sube un poco mientras se cose; se apaga en el cartel del fogón)
      this.at(2.0, () => g.music?.cur?.song?.level?.(FIN8() ? 0.64 : 1.0, 4));
      this.at(5.2, () => this.say('fierro', L.cose));
      // (FIN10, el usuario: "un pantallazo en blanco en medio de la escena
      // donde las islas se vuelven doradas, sacalo": el destello queda, sin
      // el blanco encima de todo)
      this.at(18.5, () => {
        g.fx?.flash?.(tmpV.copy(ECLIPSE_DIR).multiplyScalar(200).add(g.camera.position), 0xffe0a0, 60, 1.2, 400);
        if (FIN10()) return;
        this.whiteEl.style.transition = 'opacity 1.2s';
        this.white(true);
      });
      if (!FIN10()) this.at(19.8, () => this.white(false));
      if (!FIN3()) this.at(23, () => g.music?.stop?.(5));
      this.at(26.4, () => this.fade(true));
      return 27.6;
    });
    // 10. El fogón del camino, de noche: los cuatro de siempre
    if (FIN3()) {
      // (sin abrir el negro: lo abre el fogón, 0,4 s después; en ese negro se
      // compila a Fierro, ver warmFierro)
      card(T4.fogon, null, true, false, null, [50, 57, 62]);
      steps.push(...this.fogon3());
      return steps;
    }
    step(() => {
      this.mode('fogon');
      this.crackK = null;
      const B = this.B;
      const by = B.by;
      const fire = S('fogon', 0, 0);
      const seat = (i) => this.seatW(i);
      // (el Valiente mira al santuario: está del lado del camino)
      this.put(B, by.valiente, seat(0), fire, 'sitMate');
      this.put(B, by.viejo, seat(1), fire, 'sitMate', { t: 1.1 });
      this.put(B, by.canchero, seat(2), fire, 'sitTalk');
      this.put(B, by.miedoso, seat(3), fire, 'sitLaugh');
      by.viejo.mate = true;
      this.fireOn = true;
      this.at(0.4, () => this.fade(false));
      this.cut(6, S('fogon', -4.2, 3.4, 1.9), S('fogon', -3.7, 2.9, 1.75), S('fogon', 0, 0, 0.7), S('fogon', 0.5, 0, 0.75), 48);
      this.at(6, () => {
        const c = seat(2).add(seat(3)).multiplyScalar(0.5);
        this.cut(6.5, fire.clone().add(V3(0.2, 1.1, -0.1)).lerp(c, -0.45), fire.clone().add(V3(0.1, 1.05, 0)).lerp(c, -0.5), c.clone().setY(fire.y + 0.95), c.clone().setY(fire.y + 1.0), 42);
      });
      this.at(7.2, () => this.say('fierro', L.caballeros));
      // el Viejo le pasa el mate al Valiente
      this.at(12.5, () => {
        const v = seat(0);
        this.cut(7.5, v.clone().add(V3(-1.2, 1.25, 1.4)), v.clone().add(V3(-1.0, 1.2, 1.2)), v.clone().add(V3(0.6, 0.85, -0.6)), S('fogon', 6.4, -2.4, 0.8), 40);
      });
      this.at(13.4, () => {
        by.viejo.mate = false;
        by.valiente.mate = true;
      });
      this.at(15.0, () => {
        B.turnTo(by.valiente, S('fogon', 6.6, -2.4), 1.2);
        B.act(by.valiente, 'sitRaise', { fade: 0.4 });
      });
      // se acuerdan: un destello de cada uno con su luz de caballero
      const flashes = ['valiente', 'miedoso', 'canchero', 'viejo'];
      flashes.forEach((p, i) => {
        const t0 = 20 + i * 2.1;
        this.at(t0, () => {
          this.whiteEl.style.transition = 'opacity 0.12s';
          this.white(true);
        });
        this.at(t0 + 0.14, () => {
          this.white(false);
          this.memory = { p, t: this.t };
          const r = by[p];
          const h = r.pos.clone().setY(r.pos.y + 1.05);
          const fw = tmpV.subVectors(fire, r.pos).setY(0).normalize();
          const cam = h.clone().addScaledVector(fw, 1.25).add(V3(0, 0.25, 0));
          this.cut(1.9, cam, cam.clone().addScaledVector(fw, -0.25), h.clone().setY(h.y + 0.25), h.clone().setY(h.y + 0.3), 38);
        });
      });
      this.at(28.6, () => {
        this.memory = null;
        this.whiteEl.style.transition = 'opacity 0.3s';
        this.white(true);
      });
      this.at(28.9, () => {
        this.white(false);
        this.cut(6, S('fogon', -5.0, 4.2, 2.3), S('fogon', -4.6, 3.8, 2.2), S('fogon', -1.5, -0.8, 0.8), S('fogon', -2.5, -1.2, 0.9), 46);
        B.act(by.valiente, 'sitMate', { loop: true, fade: 0.5 });
      });
      return 35;
    });
    // 11. Fierro llega desde lo oscuro y se vuelve el hombre de la linterna
    step(() => {
      const B = this.B;
      const fz = this.fierro;
      const gd = this.gold;
      const from = S('fogon', -8.2, -2.6);
      const to = S('fogon', -3.3, -1.25);
      const cam = S('fogon', -1.3, -0.5, 1.2);
      this.put(B, fz, from, to, 'walk', { rate: 0 });
      B.walkPath(fz, [to], 0.52, 'fStand', { loop: true });
      this.g.fx?.sparkle?.(from.clone().setY(from.y + 1.1), [0.6, 0.75, 1], 24, 0.8);
      this.shot(24, (u, lt, pos, look) => {
        pos.lerpVectors(cam, S('fogon', -1.7, -0.62, 1.32), smooth(u));
        const hp = (fz.dead ? gd : fz).pos;
        look.set(hp.x, hp.y + 1.35, hp.z);
      });
      this.setFov(40);
      this.at(1.6, () => this.say('fierro', FIN2() ? L2.llega : L.razon));
      if (FIN2()) {
        // los cuatro lo ven llegar (contraplano desde atrás de Fierro)
        this.at(4.6, () => {
          for (const k of ['valiente', 'miedoso', 'canchero', 'viejo']) B.turnTo(B.by[k], fz.pos, 0.8);
          const fc = S('fogon', 0, 0);
          // (al costado de Fierro y más bajo: de atrás, su espalda tapaba a los cuatro)
          const away = tmpV.subVectors(fz.pos, fc).setY(0).normalize();
          const back = fz.pos.clone().addScaledVector(away, 1.0).addScaledVector(V3(-away.z, 0, away.x), 1.3);
          back.y += 1.25;
          this.cut(3.4, back, back.clone().lerp(fc, 0.06), fc.clone().setY(fc.y + 0.8), fc.clone().setY(fc.y + 0.85), 44);
        });
        this.at(8.0, () => {
          for (const k of ['valiente', 'miedoso', 'canchero', 'viejo']) B.turnTo(B.by[k], S('fogon', 0, 0), 0.9);
          this.shot(16, (u, lt, pos, look) => {
            pos.lerpVectors(cam, S('fogon', -1.7, -0.62, 1.32), smooth(u));
            const hp = (fz.dead ? gd : fz).pos;
            look.set(hp.x, hp.y + 1.35, hp.z);
          });
          this.setFov(40);
        });
      }
      // se vuelve el hombre de la linterna (en el mismo paso)
      this.at(8.2, () => {
        const p = fz.pos.clone();
        g.fx?.flash?.(p.clone().setY(p.y + 1.3), 0xffc060, 40, 0.8, 10);
        g.fx?.sparkle?.(p.clone().setY(p.y + 1.2), [1, 0.8, 0.35], 40, 1.0);
        this.whiteEl.style.transition = 'opacity 0.25s';
        if (FIN2()) {
          this.whiteEl.style.background = '#ffc86a';
          this.whiteEl.style.opacity = '0.55';
          this.at(9.2, () => (this.whiteEl.style.background = ''));
        } else this.white(true);
        const left = Math.hypot(to.x - p.x, to.z - p.z);
        fz.dead = true;
        fz.mv = null;
        this.put(B, gd, p, to, 'walk', { rate: 0 });
        if (left > 0.05) B.walkPath(gd, [to], 0.5, 'lanternStand', { loop: true });
        else B.act(gd, 'lanternStand', { loop: true, fade: 0.4 });
        this.lampOn = 1;
      });
      this.at(8.5, () => this.white(false));
      return 24;
    });
    // 12. La revelación (de cerca) y apaga la linterna
    step(() => {
      const B = this.B;
      const gd = this.gold;
      if (!gd.mv) B.act(gd, 'lanternStand', { loop: true, fade: 0.5 });
      const h = gd.pos.clone().setY(gd.pos.y + 1.6);
      const fw = V3(-Math.sin(gd.yaw), 0, -Math.cos(gd.yaw));
      this.cut(21, h.clone().addScaledVector(fw, 1.45).add(V3(0, -0.04, 0)), h.clone().addScaledVector(fw, 1.15).add(V3(0, -0.03, 0)), h, h.clone().add(V3(0, 0.01, 0)), 30);
      if (FIN2()) {
        const fc = S('fogon', 0, 0);
        this.at(1.0, () => this.say('fierro', L2.rev1));
        this.at(4.6, () => this.say('fierro', L2.rev2));
        // los cuatro, desde atrás del de la linterna: se quedan quietos
        this.at(9.6, () => {
          const back = gd.pos.clone().addScaledVector(tmpV.subVectors(gd.pos, fc).setY(0).normalize(), 1.2);
          back.y += 1.65;
          this.cut(3.6, back, back.clone().lerp(fc, 0.05), fc.clone().setY(fc.y + 0.75), fc.clone().setY(fc.y + 0.8), 46);
        });
        this.at(10.4, () => this.say('fierro', L2.rev3));
        this.at(13.2, () => this.cut(9, h.clone().addScaledVector(fw, 1.25).add(V3(0, -0.03, 0)), h.clone().addScaledVector(fw, 0.95).add(V3(0, -0.02, 0)), h, h.clone().add(V3(0, 0.01, 0)), 28));
        this.at(16.4, () => this.say('fierro', L2.rev4));
        this.at(22.2, () => {
          B.act(gd, 'lanternOut', { fade: 0.3 });
          this.cut(7.5, h.clone().addScaledVector(fw, 1.9).add(V3(0, -0.35, 0)), h.clone().addScaledVector(fw, 1.7).add(V3(0, -0.3, 0)), h.clone().add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.05, 0)), 36);
          this.quiet();
        });
        this.at(24.0, () => {
          this.lampOn = 0;
          this.fireDim = 1;
          this.sfx('out', gd.pos);
        });
        // en lo oscuro, los ojos: ya no de oro, de brasa; una risita de chico
        this.at(25.4, () => {
          this.say('fierro', L2.rev5);
          this.ember = { t: this.t };
        });
        this.at(27.6, () => this.sfx('giggle', gd.pos));
        this.at(29.4, () => this.fade(true));
        return 31;
      }
      this.at(1.2, () => this.say('fierro', L.rev1));
      this.at(6.6, () => this.say('fierro', L.rev2));
      this.at(14.4, () => this.say('fierro', L.rev3));
      this.at(21, () => {
        B.act(gd, 'lanternOut', { fade: 0.3 });
        this.cut(4.5, h.clone().addScaledVector(fw, 1.9).add(V3(0, -0.35, 0)), h.clone().addScaledVector(fw, 1.8).add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.35, 0)), 36);
        this.quiet();
      });
      this.at(22.8, () => {
        this.lampOn = 0;
        this.fireDim = 1;
        this.sfx('out', gd.pos);
      });
      this.at(23.6, () => this.fade(true));
      return 25.5;
    });
    // 13. La placa
    step(() => {
      this.cardEl.style.zIndex = '6';
      this.card(FIN2() ? L2.placa : L.placa, 6.5);
      return 8;
    });
    return steps;
  }


  // (FIN3) El fogón del claro (pasos 10 a 13): los cuatro de siempre toman mate
  // donde empezó todo; llega Fierro desde lo oscuro, lo reciben, se vuelve el
  // de la linterna y cuenta lo que nadie sabía. La placa.
  fogon3() {
    const g = this.g;
    const B = this.B;
    const by = B.by;
    const fz = this.fierro;
    const gd = this.gold;
    const C = this.S('fogon', 0, 0);
    const seats = [0, 1, 2, 3].map((i) => this.seatW(i));
    const TAU = Math.PI * 2;
    const nrm = (a) => ((a % TAU) + TAU) % TAU;
    const ang = seats.map((p) => nrm(Math.atan2(p.z - C.z, p.x - C.x)));
    const order = [0, 1, 2, 3].sort((a, b) => ang[a] - ang[b]);
    // (Fierro llega por el hueco más grande entre los troncos)
    let gi = 0;
    let gap = 0;
    for (let k = 0; k < 4; k++) {
      const a0 = ang[order[k]];
      const a1 = k < 3 ? ang[order[k + 1]] : ang[order[0]] + TAU;
      if (a1 - a0 > gap) {
        gap = a1 - a0;
        gi = k;
      }
    }
    const angF = ang[order[gi]] + gap / 2;
    const sA = order[gi];
    const sB = order[(gi + 1) % 4];
    const rest = order.filter((i) => i !== sA && i !== sB);
    const seatOf = { valiente: sA, viejo: sB, canchero: rest[0], miedoso: rest[1] };
    const dirF = V3(Math.cos(angF), 0, Math.sin(angF));
    const P = (a, r, h) => C.clone().add(V3(Math.cos(a) * r, h, Math.sin(a) * r));
    const onFloor = (v) => {
      v.y = this.floorAt(v.x, v.z);
      return v;
    };
    const FROM = onFloor(C.clone().addScaledVector(dirF, 9.5));
    const TO = onFloor(C.clone().addScaledVector(dirF, 2.85));
    const KEYS = ['valiente', 'viejo', 'canchero', 'miedoso'];
    const steps = [];
    const step = (fn) => steps.push([0, fn]);
    const flashW = (on, d = 0.12) => {
      this.whiteEl.style.transition = `opacity ${d}s`;
      this.white(on);
    };

    // 10. El fogón del claro, de noche: los cuatro de siempre
    step(() => {
      this.mode('fogon');
      this.crackK = null;
      // (B3: Fierro y el de la linterna, dibujados una vez con las luces del
      // fogón y todavía en negro: el negro se abre a los 0,4 s)
      this.at(0.03, () => globalThis.__mduOldFinWarmF !== true && this.warmFierro());
      for (const k of KEYS) this.put(B, by[k], seats[seatOf[k]], C, k === 'miedoso' ? 'sitLaugh' : k === 'canchero' ? 'sitTalk' : 'sitMate', { t: k === 'viejo' ? 1.1 : 0 });
      by.viejo.mate = true;
      this.fireOn = true;
      this.at(0.3, () => (FIN8() ? this.song('fin8-fogon', { fadeIn: 3 }) : g.music?.play?.('fin-eclipse-b', { fadeIn: 4, while: (G) => G.ee?.scene?.cine === this })));
      this.at(0.4, () => this.fade(false));
      // desde arriba, del lado de donde va a venir Fierro, bajando hasta el fuego
      this.shot(7, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(P(angF + 0.35, lerp(13, 6.2, k), lerp(8, 2.1, k)));
        look.copy(C).setY(C.y + lerp(0.2, 0.75, k));
      });
      this.setFov(46);
      this.at(3.5, () => this.say('fierro', L.caballeros));
      // el Canchero cuenta, el Miedoso se ríe (de frente, del otro lado del fuego)
      this.at(7, () => {
        const c = seats[seatOf.canchero].clone().add(seats[seatOf.miedoso]).multiplyScalar(0.5);
        const d = C.clone().sub(c).setY(0).normalize();
        const p0 = c.clone().addScaledVector(d, 3.4);
        p0.y = C.y + 1.2;
        this.cut(6, p0, p0.clone().addScaledVector(d, -0.25), c.clone().setY(C.y + 0.85), c.clone().setY(C.y + 0.9), 40);
      });
      // el Viejo le pasa el mate al Valiente
      this.at(13, () => {
        const m = seats[seatOf.valiente].clone().add(seats[seatOf.viejo]).multiplyScalar(0.5);
        const d = C.clone().sub(m).setY(0).normalize();
        const p0 = m.clone().addScaledVector(d, 3.2).add(V3(0, 1.25, 0));
        this.cut(4, p0, p0.clone().addScaledVector(d, -0.3), m.clone().setY(C.y + 0.8), m.clone().setY(C.y + 0.85), 42);
      });
      this.at(14.0, () => {
        by.viejo.mate = false;
        by.valiente.mate = true;
        B.act(by.viejo, 'sitTalk', { loop: true, fade: 0.5 });
      });
      // el Valiente levanta el mate hacia el algarrobo (el del Gil)
      this.at(17.0, () => {
        B.act(by.valiente, 'sitRaise', { fade: 0.4 });
        const v = seats[seatOf.valiente];
        const T = this.algarrobo || P(angF, 15, 0);
        const dt = T.clone().sub(v).setY(0).normalize();
        const sd = V3(-dt.z, 0, dt.x);
        const p0 = v.clone().addScaledVector(dt, -2.1).addScaledVector(sd, 0.9).add(V3(0, 1.45, 0));
        this.cut(4.6, p0, p0.clone().add(V3(0, 0.15, 0)), v.clone().addScaledVector(dt, 6).setY(v.y + 2.4), v.clone().addScaledVector(dt, 6).setY(v.y + 3.1), 46);
      });
      // se acuerdan: un destello de cada uno con su luz de caballero (de medio cuerpo)
      KEYS.forEach((p, i) => {
        const t0 = 21.6 + i * 2.0;
        this.at(t0, () => flashW(true));
        this.at(t0 + 0.14, () => {
          flashW(false);
          this.memory = { p, t: this.t };
          const r = by[p];
          const h = r.pos.clone().setY(r.pos.y + 1.0);
          const fw = C.clone().sub(r.pos).setY(0).normalize();
          const sd = V3(-fw.z, 0, fw.x);
          const cam = h.clone().addScaledVector(fw, 2.0).addScaledVector(sd, 0.45).add(V3(0, 0.22, 0));
          this.cut(1.85, cam, cam.clone().addScaledVector(fw, -0.2), h.clone().setY(h.y + 0.1), h.clone().setY(h.y + 0.14), 40);
        });
      });
      this.at(29.7, () => {
        this.memory = null;
        flashW(true, 0.3);
      });
      this.at(30.0, () => {
        flashW(false, 0.3);
        B.act(by.valiente, 'sitMate', { loop: true, fade: 0.5 });
        this.cut(4, P(angF + Math.PI + 0.6, 6.5, 2.4), P(angF + Math.PI + 0.5, 6.0, 2.2), C.clone().setY(C.y + 0.6), C.clone().setY(C.y + 0.7), 46);
      });
      return 34;
    });

    // 11. Llega Fierro: se paran, lo reciben con un mate, y se vuelve el de la linterna
    let OFFER = null;
    // (de qué lado de Fierro queda el Valiente: las tomas de cerca, del otro)
    let vs = 1;
    step(() => {
      this.put(B, fz, FROM, TO, 'walk', { rate: 0 });
      B.walkPath(fz, [TO], 0.95, 'fStand', { loop: true });
      // de atrás de los cuatro, del otro lado del fuego: Fierro sale de lo oscuro
      const pA = C.clone().addScaledVector(dirF, -3.1).add(V3(0, 1.45, 0));
      this.shot(6.2, (u, lt, pos, look) => {
        pos.copy(pA).addScaledVector(dirF, 0.3 * smooth(u));
        look.copy(fz.pos).setY(fz.pos.y + 1.3);
      });
      this.setFov(42);
      // se dan vuelta y se paran (cada uno a su tiempo)
      const up = { valiente: 2.0, viejo: 2.7, canchero: 2.3, miedoso: 3.2 };
      for (const k of KEYS) {
        const r = by[k];
        this.at(up[k], () => {
          // (del tronco para adelante: el clip arranca sentado con la cadera atrás)
          const fw = C.clone().sub(r.pos).setY(0).normalize();
          r.pos.addScaledVector(fw, 0.37);
          r.pos.y = this.floorAt(r.pos.x, r.pos.z);
          if (k === 'viejo') r.mate = false;
          B.act(r, 'standUp', { fade: 0.35 });
        });
        this.at(up[k] + 1.55, () => {
          B.turnTo(r, TO, 0.8);
          B.act(r, k === 'miedoso' ? 'cower' : k === 'canchero' ? 'crossArms' : 'cool', { loop: true, fade: 0.45 });
        });
      }
      // Fierro, de cerca, con la luz del fuego
      const fwF = C.clone().sub(TO).setY(0).normalize();
      const sdF = V3(-fwF.z, 0, fwF.x);
      const hF = TO.clone().setY(TO.y + 1.55);
      this.at(6.2, () => {
        const p0 = hF.clone().addScaledVector(fwF, 2.1).addScaledVector(sdF, -0.5);
        this.cut(4.2, p0, p0.clone().addScaledVector(fwF, -0.2), hF.clone().add(V3(0, 0.05, 0)), hF.clone().add(V3(0, 0.05, 0)), 38);
      });
      this.at(6.6, () => this.say('fierro', L3.llega));
      // el Valiente le contesta y le alcanza el mate
      this.at(10.4, () => {
        const v = by.valiente;
        const d = v.pos.clone().sub(TO).setY(0).normalize();
        OFFER = onFloor(TO.clone().addScaledVector(d, globalThis.__mduOldFinOffer === true ? 0.78 : 1.1));
        vs = sdF.dot(OFFER.clone().sub(TO)) >= 0 ? 1 : -1;
        B.walkTo(v, OFFER, 1.3, 'offer', { fade: 0.3 });
        v.mate = true;
        const mid = TO.clone().add(OFFER).multiplyScalar(0.5);
        const sd = V3(-d.z, 0, d.x);
        const side = sd.dot(C.clone().sub(mid)) > 0 ? -1 : 1;
        const p0 = mid.clone().addScaledVector(sd, 2.5 * side).add(V3(0, 1.5, 0));
        this.cut(4.6, p0, p0.clone().addScaledVector(sd, -0.2 * side), mid.clone().setY(mid.y + 1.25), mid.clone().setY(mid.y + 1.3), 40);
      });
      this.at(10.8, () => this.say('caballeroFuego', L3.si));
      this.at(12.3, () => {
        B.turnTo(fz, by.valiente.pos, 0.4);
        B.act(fz, 'receive', { fade: 0.3 });
      });
      this.at(13.4, () => {
        this.mateAt = { kind: 'two', r: fz };
        by.valiente.mate = false;
      });
      // (sesión 1f: con el mate dado, el Valiente se corre al costado de Fierro:
      // parado entre Fierro y el fuego, su espalda tapaba todas las tomas de cerca)
      this.at(14.0, () => {
        const to = onFloor(TO.clone().addScaledVector(sdF, vs * 1.15).addScaledVector(fwF, 0.5));
        B.walkTo(by.valiente, to, 1.1, 'cool', { loop: true, fade: 0.4 });
      });
      this.at(15.3, () => B.turnTo(by.valiente, TO, 0.5));
      this.at(14.7, () => {
        B.act(fz, 'gilMateHold', { loop: true, fade: 0.4 });
      });
      this.at(15.0, () => {
        const p0 = hF.clone().addScaledVector(fwF, 1.85).addScaledVector(sdF, -vs * 0.5);
        this.cut(4.6, p0, p0.clone().addScaledVector(fwF, -0.18), hF.clone(), hF.clone().add(V3(0, 0.02, 0)), 36);
      });
      this.at(15.4, () => this.say('fierro', L3.razon));
      // "yo los fui a buscar al molino": de atrás de los cuatro
      this.at(19.6, () => {
        const p0 = C.clone().addScaledVector(dirF, -3.4).addScaledVector(sdF, 0.6).add(V3(0, 1.6, 0));
        this.cut(7.4, p0, p0.clone().addScaledVector(dirF, 0.35), TO.clone().setY(TO.y + 1.4), TO.clone().setY(TO.y + 1.45), 44);
      });
      this.at(19.9, () => this.say('fierro', L3.molino));
      // se vuelve el hombre de la linterna; los cuatro lo reconocen
      if (NEW_GOLD()) {
        // (de cara al fuego: el de la linterna queda igual, sin girar de golpe)
        this.at(23.4, () => B.turnTo(fz, C, 0.6));
        // de frente, de cerca: se ve subir el corte
        this.at(23.9, () => {
          // (al costado del fuego: de frente quedaba la lente adentro de las llamas)
          const p0 = TO.clone().addScaledVector(fwF, 1.7).addScaledVector(sdF, -vs * 2.3).add(V3(0, 1.1, 0));
          this.cut(4.4, p0, p0.clone().addScaledVector(sdF, vs * 0.25), TO.clone().add(V3(0, 0.95, 0)), TO.clone().add(V3(0, 1.2, 0)), 42);
        });
        this.at(24.2, () => {
          const p = fz.pos.clone();
          g.fx?.flash?.(p.clone().setY(p.y + 0.4), 0xffc060, 12, 0.5, 6);
          // (FIN8: en la pose de Fierro —el mismo clip, en el mismo instante—: con
          // otra pose el corte que sube juntaba dos siluetas distintas; la de la
          // linterna, cuando el corte ya pasó)
          const same = FIN8() && fz.cc?.name;
          if (same) {
            this.put(B, gd, p, null, fz.cc.name, { fade: 0.01, t: fz.cc.lt || 0, rate: fz.cc.rate ?? 1, loop: fz.cc.loop });
            gd.yaw = fz.yaw;
          } else this.put(B, gd, p, C, 'lanternStand', { fade: 0.2 });
          this.clipApply();
          if (!this.clipF) {
            // (sin los cuerpos todavía: como antes, de una)
            this.mateAt = null;
            fz.dead = true;
            fz.mv = null;
            this.lampOn = 1;
            return;
          }
          // (desde ya: si no, un cuadro se veía el dorado entero)
          this.clipF.constant = -(p.y - 0.05);
          this.clipG.constant = p.y - 0.05;
          this.xform = {
            kind: 'gold',
            t: 0,
            dur: 2.7,
            y0: p.y - 0.05,
            y1: p.y + 2.05,
            pos: p,
            // (a la altura de las manos: el mate se vuelve la linterna)
            marks: [[p.y + 0.95, () => {
              this.mateAt = null;
              this.lampOn = 1;
            }]],
            done: () => {
              fz.dead = true;
              fz.mv = null;
              if (same) B.act(gd, 'lanternStand', { loop: true, fade: 0.9 });
            },
          };
        });
      }
      if (!NEW_GOLD()) this.at(24.2, () => {
        const p = fz.pos.clone();
        g.fx?.flash?.(p.clone().setY(p.y + 1.3), 0xffc060, 40, 0.8, 10);
        g.fx?.sparkle?.(p.clone().setY(p.y + 1.2), [1, 0.8, 0.35], 40, 1.0);
        this.whiteEl.style.transition = 'opacity 0.25s';
        this.whiteEl.style.background = '#ffc86a';
        this.whiteEl.style.opacity = '0.55';
        this.mateAt = null;
        fz.dead = true;
        fz.mv = null;
        this.put(B, gd, p, C, 'lanternStand', { fade: 0.2 });
        this.lampOn = 1;
      });
      this.at(24.5, () => {
        this.white(false);
        this.at(0.6, () => (this.whiteEl.style.background = ''));
      });
      this.at(24.6, () => B.act(by.miedoso, 'cower', { loop: true, fade: 0.2 }));
      this.at(24.7, () => B.act(by.canchero, 'flinch', { fade: 0.2 }));
      this.at(24.9, () => B.act(by.viejo, 'kneelDown', { fade: 0.3 }));
      this.at(25.9, () => B.act(by.viejo, 'kneelHold', { loop: true, fade: 0.35 }));
      this.at(25.6, () => B.act(by.canchero, 'chestHand', { loop: true, fade: 0.5 }));
      this.at(25.0, () => B.act(by.valiente, 'chestHand', { loop: true, fade: 0.5 }));
      return NEW_GOLD() ? 28.4 : 27;
    });

    // 12. La revelación y apaga la linterna
    step(() => {
      const h = gd.pos.clone().setY(gd.pos.y + 1.6);
      const fw = C.clone().sub(gd.pos).setY(0).normalize();
      const sd = V3(-fw.z, 0, fw.x);
      const close = (dur, d0, d1, sx) =>
        this.cut(dur, h.clone().addScaledVector(fw, d0).addScaledVector(sd, sx), h.clone().addScaledVector(fw, d1).addScaledVector(sd, sx * 0.9), h.clone().add(V3(0, -0.02, 0)), h.clone(), 34);
      close(4.5, 1.95, 1.65, -vs * 0.35);
      this.at(0.5, () => this.say('fierro', L3.ronda));
      // el Viejo, de rodillas: "¿Por qué?" (por encima del hombro del de la linterna)
      this.at(4.5, () => {
        const r = by.viejo;
        const d = r.pos.clone().sub(gd.pos).setY(0).normalize();
        const s2 = V3(-d.z, 0, d.x);
        const p0 = gd.pos.clone().addScaledVector(d, -0.9).addScaledVector(s2, 0.55).add(V3(0, 1.65, 0));
        this.cut(3.5, p0, p0.clone().addScaledVector(d, 0.12), r.pos.clone().setY(r.pos.y + 1.0), r.pos.clone().setY(r.pos.y + 1.02), 40);
      });
      this.at(4.9, () => this.say('caballeroHielo', L3.porque));
      this.at(8.0, () => close(5.6, 2.1, 1.8, -vs * 0.65));
      this.at(8.3, () => this.say('fierro', L3.aguantar));
      // "El Gil la cortó": los cinco, del costado
      this.at(13.6, () => {
        const p0 = C.clone().addScaledVector(sd, 4.2).addScaledVector(fw, -0.6).add(V3(0, 1.7, 0));
        this.cut(4.0, p0, p0.clone().addScaledVector(sd, -0.3), C.clone().lerp(gd.pos, 0.5).setY(C.y + 1.2), C.clone().lerp(gd.pos, 0.5).setY(C.y + 1.25), 46);
      });
      this.at(13.9, () => this.say('fierro', L3.gil));
      if (NEW_END()) {
        steps.cierre = true;
        return this.cierre(gd, C, h, fw, sd);
      }
      // apaga la linterna
      this.at(17.6, () => {
        B.act(gd, 'lanternOut', { fade: 0.3 });
        this.cut(5.5, h.clone().addScaledVector(fw, 1.9).add(V3(0, -0.35, 0)), h.clone().addScaledVector(fw, 1.7).add(V3(0, -0.3, 0)), h.clone().add(V3(0, -0.35, 0)), h.clone().add(V3(0, -0.05, 0)), 36);
        this.quiet();
      });
      this.at(19.2, () => {
        this.lampOn = 0;
        this.fireDim = 1;
        this.sfx('out', gd.pos);
        g.music?.stop?.(3.5);
      });
      // en lo oscuro, los ojos: de brasa; una risita de chico
      this.at(20.4, () => (this.ember = { t: this.t }));
      this.at(22.0, () => this.sfx('giggle', gd.pos));
      return 24;
    });
    // 13. La placa: abajo, sobre los ojos de brasa en lo oscuro; después, fundido
    // (el usuario: "un texto en el medio y un corte seco al menú")
    // (el cierre nuevo la dice adentro del paso 12: el paso 13 no hace nada)
    step(() => {
      if (steps.cierre) return 0;
      this.cardEl.style.zIndex = '6';
      this.cardEl.style.top = '80%';
      this.card(L3.placa, 6.4);
      this.at(5.6, () => this.fade(true));
      return 8;
    });
    return steps;
  }

  // (FIN10, 2026-10-09, el usuario: "añadí una escenita más cuando el Gil
  // está por meterse al portal para ir a su muerte: que se dé la vuelta y diga
  // 'No lloren por mí...'". Camina hasta el borde del desgarro, se da vuelta a
  // los tres, lo dice de cerca —el desgarro atrás— y recién ahí entra. Lo arma
  // el paso 5 al empezar: arranca a los t0 s del paso (el Gil hasta ahí no se
  // mueve de lugar); devuelve cuánto dura desde t0.)
  gilAdios(A, gil, ben, cir, ana, RP, F, t0) {
    const M = ben.pos.clone().add(cir.pos).add(ana.pos).multiplyScalar(1 / 3);
    const toF = M.clone().sub(RP).setY(0).normalize();
    const PRE = RP.clone().addScaledVector(toF, 0.9);
    PRE.y = this.floorAt(PRE.x, PRE.z);
    const ta = 0.2 + Math.hypot(PRE.x - gil.pos.x, PRE.z - gil.pos.z) / 0.95;
    const at = (t, fn) => this.at(t0 + t, fn);
    at(0, () => A.walkPath(gil, [PRE], 0.95, 'chestHand', { loop: true, fade: 0.6 }));
    // se da vuelta a los tres; la toma, de cerca, del lado de ellos
    at(ta, () => {
      A.turnTo(gil, M, 0.9);
      A.act(gil, 'chestHand', { loop: true, fade: 0.6 });
      const sd = V3(-toF.z, 0, toF.x);
      const p0 = PRE.clone().addScaledVector(toF, 2.5).addScaledVector(sd, 0.45);
      p0.y += 1.5;
      const l0 = PRE.clone();
      l0.y += 1.4;
      this.cut(est(L10.noLloren) + 1.6, p0, p0.clone().addScaledVector(toF, -0.35), l0, l0.clone().add(V3(0, 0.04, 0)), 38);
    });
    const tl = ta + 0.9;
    at(tl, () => this.say('gil', L10.noLloren));
    at(tl + 1.2, () => A.act(ben, 'chestHand', { loop: true, fade: 0.6 }));
    at(tl + 2.0, () => A.act(ana, 'brimBow', { fade: 0.5 }));
    // y entra: de atrás de los tres, como antes
    const tg = tl + est(L10.noLloren) + 0.7;
    at(tg, () => {
      A.turnTo(gil, RP, 0.7);
      this.cut(4.8, F(2.6, 1.3, 1.62), F(3.0, 1.25, 1.62), F(9.5, 1.2, 1.5), F(10.0, 1.2, 1.6), 46);
    });
    at(tg + 0.7, () => A.walkPath(gil, [RP.clone(), F(11.6, 1.2)], 0.95, 'idle', { loop: true }));
    at(tg + 1.8, () => {
      gil.dead = true;
      this.mateAt = { kind: 'palm', r: cir };
    });
    at(tg + 2.2, () => this.say('fierro', L.volvio));
    at(tg + 2.4, () => {
      this.riftClose = this.t;
      this.mont.brazos = 'sable';
    });
    return tg + 2.2 + est(L.volvio) + 0.8;
  }

  // (FIN4) La despedida, hablada: los mismos lugares y tomas que antes, con
  // tiempo para que cada uno le diga algo y el Gil conteste. 24,6 s.
  adios(A, gil, ben, cir, ana, F, OB, CIR1, ANA0) {
    const f3 = FIN3();
    this.cut(4.2, F(2.4, 0.9, 1.6), F(2.6, 0.7, 1.6), F(9, -0.8, 1.3), F(7, -1.0, 1.3), 46);
    A.walkTo(gil, F(6.0, -1.5), 3.8, 'chestHand', { loop: true, fade: 0.5 });
    // Benito llora y le pide que se quede
    this.at(4.2, () => {
      if (f3) this.cut(7.0, F(5.65, -3.85, 1.55), F(5.75, -3.75, 1.55), F(5.6, -1.5, 1.4), F(5.6, -1.5, 1.38), 40);
      else this.cut(7.0, F(7.25, -2.15, 1.7), F(7.15, -2.1, 1.68), F(5.2, -1.5, 1.45), F(5.2, -1.5, 1.42), 40);
      A.act(ben, 'sob', { loop: true, fade: 0.5 });
    });
    this.at(4.5, () => this.say('benito', L4.quedate));
    this.at(7.4, () => this.say('gil', L4.noQueda));
    // Cirilo, con el mate: cebar por él
    const GC = OB ? F(f3 ? 6.2 : 6.0, 0.25) : F(6.5, 0.3);
    this.at(11.2, () => {
      A.walkTo(gil, GC, 1.4, 'chestHand', { loop: true, fade: 0.5 });
      if (!OB) this.cut(5.6, F(7.0, 2.6, 1.7), F(6.9, 2.5, 1.68), F(6.1, 0.1, 1.42), F(6.1, 0.1, 1.4), 40);
      else if (f3) this.cut(5.6, F(7.0, 2.6, 1.7), F(6.9, 2.5, 1.68), F(5.5, 0.2, 1.42), F(5.5, 0.2, 1.4), 40);
      else this.cut(5.6, F(7.25, -0.4, 1.7), F(7.15, -0.35, 1.68), F(5.4, 0.15, 1.45), F(5.4, 0.15, 1.42), 40);
    });
    if (!OB) {
      this.at(12.4, () => {
        A.turnTo(gil, CIR1, 0.35);
        A.turnTo(cir, GC, 0.45);
      });
    }
    this.at(12.6, () => this.say('cirilo', L4.cebamos));
    this.at(12.9, () => A.act(cir, 'cool', { loop: true, fade: 0.5 }));
    this.at(15.2, () => this.say('gil', L4.nunca));
    // Anacleto, la mano (0,8 s después: que el Gil termine de contestarle a Cirilo)
    const ANA1 = F(f3 ? 6.15 : 5.92, 1.9);
    this.at(17.6, () => {
      A.walkTo(gil, ANA1, 1.4, 'idle', { loop: true, fade: 0.4 });
      this.cut(7.0, F(5.6, 4.6, 1.6), F(5.7, 4.4, 1.6), F(5.6, 1.9, 1.2), F(5.6, 1.9, 1.2), 40);
    });
    this.at(19.1, () => {
      A.turnTo(gil, ANA0, 0.4);
      A.act(gil, 'shake', { fade: 0.3 });
      A.turnTo(ana, ANA1, 0.4);
      A.act(ana, 'shake', { fade: 0.3 });
    });
    this.at(19.4, () => this.say('anacleto', L4.anda));
    this.at(22.0, () => this.say('gil', L4.primero));
    return 24.6;
  }

  // (FIN8, 2026-10-08, el usuario: "la muerte del Gil sigue siendo bastante poco
  // explícita". Antes: se arrodillaba, las antorchas cerraban el círculo y
  // negro. Ahora se ve y se dice: el sargento se adelanta a caballo y saca el
  // sable; el Gil, de rodillas, le dice lo último —la leyenda: que rece en su
  // nombre, que su hijo se va a salvar— y cierra los ojos; el sable sube y
  // baja; corte seco a negro con el golpe; se van al galope; y Fierro cuenta
  // qué le hicieron. Sigue a la toma D del paso 6 (a los 13,6 s). Devuelve
  // cuánto dura el paso.)
  muerte8(A, gil, T0, tw0) {
    const g = this.g;
    // (hacia el sargento, no hacia el árbol)
    const tw = V3(Math.cos(SGT_A), 0, Math.sin(SGT_A));
    const sd = V3(-tw.z, 0, tw.x);
    void tw0;
    const fadeEl = this.el.querySelector('.mdu-fcine__fade');
    // E. de atrás del Gil, bajo: el sargento se adelanta y saca el sable
    this.at(16.6, () => {
      this.sgt = { t: this.t, arm: 'riendas', sable: false };
      A.turnTo(gil, T0.clone().addScaledVector(tw, 4), 1.2);
      // (del lado del brazo del sable —su derecha—: de frente, la cabeza del
      // caballo tapaba al jinete; el algarrobo y su soga quedan atrás)
      const c0 = T0.clone().addScaledVector(tw, -1.9).addScaledVector(sd, -1.9);
      c0.y += 1.0;
      const l0 = T0.clone().addScaledVector(tw, 1.9);
      l0.y += 1.8;
      this.cut(3.8, c0, c0.clone().addScaledVector(tw, 0.3), l0, l0.clone().add(V3(0, 0.15, 0)), 44);
    });
    this.at(18.7, () => {
      this.sgt.sable = true;
      this.sgt.arm = 'sable';
      this.sfx('desenvaina', T0.clone().addScaledVector(tw, 2.1));
    });
    // F. la cara del Gil, con la luz de las antorchas: lo último que dice
    const tF = 20.4;
    this.at(tF, () => {
      const c0 = T0.clone().addScaledVector(tw, 1.25).addScaledVector(sd, -0.4);
      c0.y += 0.92;
      const l0 = T0.clone();
      l0.y += 1.02;
      this.cut(8, c0, c0.clone().addScaledVector(tw, -0.2), l0, l0.clone(), 36);
    });
    this.at(tF + 0.4, () => this.say('gil', L4.reza));
    const tG = tF + 0.4 + est(L4.reza) + 0.5;
    this.at(tG - 0.3, () => (gil.a.faint = 1));
    // G. de costado, las siluetas contra las antorchas: el sable sube... y baja
    this.at(tG + 0.5, () => {
      this.quiet();
      // (de abajo, al lado del Gil: el sargento contra las estrellas. De costado
      // se probó: las matas del estero tapaban el cuadro)
      const c0 = T0.clone().addScaledVector(tw, -0.9).addScaledVector(sd, -1.5);
      c0.y += 0.7;
      const l0 = T0.clone().addScaledVector(tw, 2.1);
      l0.y += 2.25;
      this.cut(4, c0, c0.clone().addScaledVector(tw, 0.15), l0, l0.clone().add(V3(0, 0.1, 0)), 40);
      this.sgt.arm = 'carga';
    });
    const tK = tG + 0.5 + 1.9;
    this.at(tK - 0.16, () => (this.sgt.arm = 'riendas'));
    this.at(tK, () => {
      // corte seco, con el golpe
      fadeEl.style.transition = 'opacity 0.05s';
      this.fade(true);
      this.sfx('tajo', T0);
      g.music?.cur?.song?.level?.(0.22, 0.3);
    });
    this.at(tK + 0.5, () => (fadeEl.style.transition = ''));
    // se van al galope (las antorchas ya no se ven: negro)
    for (let k = 0; k < 7; k++) this.at(tK + 1.7 + k * 0.33, () => this.hoofs(0.5 - k * 0.06));
    // lo que le hicieron, dicho (el texto, encima del negro)
    this.at(tK + 2.6, () => {
      this.textEl.style.zIndex = '6';
      this.say('fierro', L4.degollado);
      g.music?.cur?.song?.level?.(0.48, 3);
    });
    const end = tK + 2.6 + est(L4.degollado) + 1.3;
    this.at(end - 0.3, () => {
      this.quiet();
      this.sgt = null;
    });
    this.at(end + 0.6, () => (this.textEl.style.zIndex = ''));
    return end;
  }

  // (FIN8) un galope corto (tres cascos), como el de fin2Tick
  hoofs(k) {
    const A = this.g.audio;
    if (!A?.ctx || !A.hoof || k <= 0) return;
    const o = (this.hoofO ||= A.out({ gain: 1, reverb: 0.6 }));
    [0.55, 0.7, 1].forEach((v, j) => A.hoof(o, A.now + j * 0.08, v * k));
  }

  // (FIN8) La despedida al paso de lo que se dice. Antes (adios) las líneas
  // tenían hora fija y eran más largas que su toma: la voz de una seguía
  // mientras el cuadro y el texto ya eran de la otra, se atrasaban hasta 3 s
  // y la última se cortaba. Ahora van en fila —cada una arranca cuando
  // terminó la de antes—, los dos se quedan mirándose en cuadro hasta que
  // terminó la respuesta (de costado, como antes, y más de cerca cuando
  // contesta el Gil) y recién ahí el Gil camina al siguiente. ~36 s.
  // (Por sobre el hombro se probó: a contraluz del alba eran dos espaldas.)
  adios8(A, gil, ben, cir, ana, F, CIR1, ANA0) {
    const line = (who, text, gap = 0) => () => this.say(who, text) + gap;
    // los dos de costado: `near` más cerca (cuando contesta el Gil)
    const pair = (c0, c1, l0, l1, fov) => this.cut(30, c0, c1, l0, l1, fov);
    const G1 = F(6.0, -1.5);
    // (FIN10, el usuario: "cuando el Gil va a hablarle al azul, atraviesa su
    // mano mientras camina porque el otro está extendiendo el mate": pasaba a
    // 30 cm de la mano. Lo rodea por afuera y frena a un metro)
    const GC = FIN10() ? F(6.75, 0.3) : F(6.5, 0.3);
    const ANA1 = F(6.15, 1.9);
    this.cut(4.2, F(2.4, 0.9, 1.6), F(2.6, 0.7, 1.6), F(9, -0.8, 1.3), F(7, -1.0, 1.3), 46);
    A.walkTo(gil, G1, 3.8, 'chestHand', { loop: true, fade: 0.5 });
    return this.seqRun([
      () => 4.2,
      // --- Benito llora y le pide que se quede
      () => {
        A.act(ben, 'sob', { loop: true, fade: 0.5 });
        A.turnTo(gil, ben.pos, 0.3);
        pair(F(5.65, -3.85, 1.55), F(5.72, -3.45, 1.55), F(5.6, -1.5, 1.4), F(5.6, -1.5, 1.4), 40);
        return 0.5;
      },
      line('benito', L4.quedate),
      () => {
        pair(F(5.78, -3.15, 1.56), F(5.8, -2.95, 1.56), F(5.68, -1.5, 1.47), F(5.7, -1.5, 1.48), 33);
        return 0.25;
      },
      line('gil', L4.noQueda, 0.35),
      // --- Cirilo, con el mate: cebar por él
      () => {
        this.quiet();
        if (FIN10()) A.walkPath(gil, [F(6.95, -0.55), GC], 1.5, 'chestHand', { loop: true, fade: 0.5 });
        else A.walkTo(gil, GC, 1.4, 'chestHand', { loop: true, fade: 0.5 });
        pair(F(7.0, 2.6, 1.7), F(6.92, 2.3, 1.68), F(6.1, 0.1, 1.42), F(6.1, 0.1, 1.42), 40);
        return 1.3;
      },
      () => {
        A.turnTo(gil, CIR1, 0.35);
        A.turnTo(cir, GC, 0.45);
        return 0.7;
      },
      () => {
        A.act(cir, 'cool', { loop: true, fade: 0.5 });
        return 0.25;
      },
      line('cirilo', L4.cebamos),
      () => {
        pair(F(6.8, 2.0, 1.63), F(6.78, 1.85, 1.62), F(6.14, 0.1, 1.48), F(6.15, 0.1, 1.49), 33);
        return 0.2;
      },
      // (FIN10, el usuario: "cambiá la contestación del Gil a ese personaje")
      line('gil', FIN10() ? L10.volvere : L4.nunca, 0.45),
      // --- Anacleto: la mano
      () => {
        this.quiet();
        A.walkTo(gil, ANA1, 1.4, 'idle', { loop: true, fade: 0.4 });
        pair(F(5.6, 4.6, 1.6), F(5.68, 4.3, 1.6), F(5.6, 1.9, 1.2), F(5.65, 1.9, 1.25), 40);
        return 1.5;
      },
      () => {
        A.turnTo(gil, ANA0, 0.4);
        A.act(gil, 'shake', { fade: 0.3 });
        A.turnTo(ana, ANA1, 0.4);
        A.act(ana, 'shake', { fade: 0.3 });
        return 0.5;
      },
      line('anacleto', L4.anda),
      () => {
        pair(F(5.78, 3.95, 1.6), F(5.8, 3.8, 1.6), F(5.74, 1.9, 1.46), F(5.75, 1.9, 1.47), 33);
        A.act(gil, 'chestHand', { loop: true, fade: 0.5 });
        return 0.2;
      },
      line('gil', L4.primero, 0.5),
    ]);
  }

  // ---------------- el corte que sube por el cuerpo ----------------
  // Fierro (arriba del corte) y el de la linterna (abajo): un plano cada uno,
  // los dos con los mismos números de siempre (no compila nada al moverlo).
  // Se arma apenas están los cuerpos y se compila de una (compileAsync).
  clipApply() {
    if (this.clipDone || (!NEW_GOLD() && !NEW_END())) return;
    const fz = this.fierro;
    const gd = this.gold;
    if (!fz?.a?.gs || !gd?.a?.gs) return;
    this.clipDone = true;
    const R = this.g.renderer;
    if (this.clip0 == null) this.clip0 = R.localClippingEnabled;
    R.localClippingEnabled = true;
    // (se ve lo que tiene n·p + c >= 0; 1e4: todo)
    this.clipF = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
    this.clipG = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    // (los materiales de los otros muñecos no se tocan: si alguno es el mismo, va una copia)
    const others = new Set();
    for (const Cx of [this.A, this.Sx, this.B]) {
      for (const r of Cx?.list || []) {
        if (r === fz || r === gd) continue;
        r.a?.group?.traverse((o) => {
          for (const m of [].concat(o.material || [])) others.add(m);
        });
      }
    }
    const own = (r, plane) => {
      const swap = new Map();
      r.a.group.traverse((o) => {
        if (!o.material || o.isSprite) return;
        const one = (m) => {
          if (!m) return m;
          let c = m;
          if (others.has(m)) {
            c = swap.get(m);
            if (!c) {
              c = m.clone();
              c.onBeforeCompile = m.onBeforeCompile;
              c.customProgramCacheKey = m.customProgramCacheKey;
              swap.set(m, c);
            }
          }
          c.clippingPlanes = [plane];
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      });
      // (las piezas del muñeco que se pintan por su nombre: a.M)
      for (const k of Object.keys(r.a.M || {})) if (swap.has(r.a.M[k])) r.a.M[k] = swap.get(r.a.M[k]);
      if (r.a.gs && swap.has(r.a.gs.mat)) r.a.gs.mat = swap.get(r.a.gs.mat);
    };
    own(fz, this.clipF);
    own(gd, this.clipG);
    // la linterna se va con el de la linterna
    this.lamp.root.traverse((o) => {
      for (const m of [].concat(o.material || [])) m.clippingPlanes = [this.clipG];
    });
    try {
      for (const o of [fz.a.group, gd.a.group, this.lamp.root]) R.compileAsync?.(o, this.g.camera, this.g.scene);
    } catch {}
  }

  xformTick(dt) {
    const X = this.xform;
    if (!X) return;
    if (!this.clipF) {
      this.xform = null;
      X.done?.();
      return;
    }
    X.t += dt;
    const k = Math.min(1, X.t / X.dur);
    const y = X.y0 + (X.y1 - X.y0) * smooth(k);
    if (X.kind === 'gold') {
      this.clipF.constant = -y;
      this.clipG.constant = y;
    } else {
      // (el alma: se va de los pies para arriba)
      this.clipG.normal.set(0, 1, 0);
      this.clipG.constant = -y;
    }
    // (FIN8, el usuario: "cuando desaparece también queda su silueta y ojos". El
    // brillo de los ojos son sprites, sin plano de corte: quedaban dos puntos
    // flotando donde estuvo la cabeza hasta el final —y en el paso a dorado
    // estaban desde antes sobre la cara de Fierro—. Van con el corte.)
    if (FIN8()) {
      for (const sp of this.goldEyes || []) {
        sp.getWorldPosition(tmpV);
        sp.visible = X.kind === 'gold' ? tmpV.y <= y : tmpV.y > y + 0.03;
      }
    }
    for (const M of X.marks || []) {
      if (!M.done && y >= M[0]) {
        M.done = true;
        M[1]();
      }
    }
    // la franja de luz que sube, y lo que se suelta
    const g = this.g;
    const n = Math.max(1, Math.round(dt * (X.kind === 'gold' ? 90 : 70)));
    for (let i = 0; i < n && k < 1; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.22;
      const x = X.pos.x + Math.cos(a) * r;
      const z = X.pos.z + Math.sin(a) * r;
      if (X.kind === 'gold') g.fx?.add?.spawn?.(x, y, z, Math.cos(a) * 0.4, 0.3 + Math.random() * 0.5, Math.sin(a) * 0.4, { color: Math.random() < 0.5 ? [1, 0.78, 0.3] : [1, 0.95, 0.7], size: 0.07, size1: 0, life: 0.6 + Math.random() * 0.4, drag: 2 });
      else {
        const up = X.to || null;
        g.fx?.add?.spawn?.(x, y, z, (up ? up.x : 0) * 0.6 + Math.cos(a) * 0.3, 0.9 + Math.random() * 1.2, (up ? up.z : 0) * 0.6 + Math.sin(a) * 0.3, { color: Math.random() < 0.6 ? [1, 0.82, 0.38] : [1, 0.96, 0.8], size: 0.1, size1: 0.02, life: 1.6 + Math.random() * 1.2, drag: 0.4, gravity: -0.25 });
      }
    }
    if (k >= 1) {
      this.xform = null;
      X.done?.();
    }
  }

  // El cierre (paso 12, desde "El Gil la cortó"): se da vuelta a la luna, la
  // señala y se deshace como un alma; se cierra el telón con la música
  // épica; en el silencio, su frase (5 s); negro (3 s) y la pantalla final.
  cierre(gd, C, h, fw, sd) {
    const g = this.g;
    const B = this.B;
    // la luna (la del cielo de la noche del claro)
    const moonAt = new THREE.Vector3();
    const ms = g.world.moonSprite;
    if (ms) ms.getWorldPosition(moonAt);
    else moonAt.copy(gd.pos).add(V3(-0.45, 0.62, -0.64).multiplyScalar(200));
    const md = moonAt.clone().sub(gd.pos).normalize();
    const mf = V3(md.x, 0, md.z).normalize();
    const ms2 = V3(-mf.z, 0, mf.x);
    this.at(17.4, () => {
      this.quiet();
      B.turnTo(gd, moonAt, 0.9);
    });
    // primero de frente y de abajo: mira la luna y levanta el brazo; después de
    // atrás, lejos del Valiente: la silueta contra la luna mientras se deshace
    const vp = this.B.by?.valiente?.pos;
    const sv = vp && ms2.dot(vp.clone().sub(gd.pos)) > 0 ? -1 : 1;
    this.at(17.6, () => {
      const base = gd.pos.clone();
      const p0 = base.clone().addScaledVector(mf, 2.5).addScaledVector(ms2, sv * 1.0);
      p0.y = this.floorAt(p0.x, p0.z) + 0.85;
      const head = base.clone().add(V3(0, 1.72, 0));
      this.cut(3.0, p0, p0.clone().addScaledVector(mf, -0.25), head.clone().add(V3(0, 0.05, 0)), head.clone().add(V3(0, 0.3, 0)), 40);
    });
    this.at(20.6, () => {
      const base = gd.pos.clone();
      const p0 = base.clone().addScaledVector(mf, -3.4).addScaledVector(ms2, sv * 0.75);
      p0.y = this.floorAt(p0.x, p0.z) + 0.3;
      this.shot(8.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(p0).addScaledVector(mf, 0.5 * k);
        // (hacia la luna y un poco arriba: él entero abajo, la luna arriba en el cuadro)
        look.copy(pos).addScaledVector(mf, 3).add(V3(0, 0.95 + 0.3 * k, 0));
      });
      this.setFov(62);
    });
    this.at(18.1, () => B.act(gd, 'fRaise', { fade: 0.5 }));
    // (FIN8: sin otra canción encima: la del fogón sube sola acá y se apaga en el negro)
    if (!FIN8()) this.at(18.2, () => g.music?.play?.('fin-eclipse-telon', { fadeIn: 1.5, while: (G) => G.ee?.scene?.cine === this }));
    // se deshace como un alma, de los pies para arriba, y se va hacia la luna
    this.at(19.2, () => {
      this.clipApply();
      const p = gd.pos.clone();
      this.xform = {
        kind: 'alma',
        t: 0,
        dur: 6.4,
        y0: p.y - 0.05,
        y1: p.y + 2.25,
        pos: p,
        to: md,
        marks: [[p.y + 0.9, () => (this.lampOn = 0)]],
        done: () => {
          gd.dead = true;
        },
      };
      this.fireDim = 1;
    });
    // el telón (2026-10-08, ITERACION-7 E4, el usuario: "el telón final es rojo
    // y viene de los costados: eso es un telón de teatro, esto es cine". Un
    // fundido lento a negro; la frase, en el negro. __mduOldFinTelon: el telón)
    // (PORT9: antes del negro, los portales y la despedida; lo que sigue se corre D9)
    const D9 = PORT9() ? this.portales(C, 25.4) - 24.8 : 0;
    this.at(24.8 + D9, () => (globalThis.__mduOldFinTelon === true ? this.curtain(true, 3.4) : this.blackOut(3.6)));
    // (FIN11: en el negro del final, sin el ruido de fondo de la isla)
    this.at(25.6 + D9, () => (this.hush = FIN11()));
    if (FIN8()) this.at(25.6 + D9, () => g.music?.stop?.(3.6));
    else this.at(28.4 + D9, () => g.music?.stop?.(1.4));
    // en el silencio, su frase
    this.at(29.8 + D9, () => {
      const d = super.say('fierro', L3.placa);
      void d;
      this.quiet();
      this.cardEl.style.zIndex = '8';
      this.cardEl.style.top = '50%';
      this.card(L3.placa, 5);
    });
    // negro y la pantalla final
    this.at(34.9 + D9, () => {
      const k = this.curtainEl?.children[3];
      if (k) k.style.opacity = '1';
      this.fade(true);
    });
    return 38 + D9;
  }

  // (2026-10-09, el usuario: "en la escena final del fogón, cuando Fierro
  // desaparece, abrí 4 portales, que se despidan los gauchos y cada uno se
  // vaya al suyo y luego recién ahí el telón". Detrás de cada gaucho, del lado
  // de afuera de la ronda, un desgarro mirando al fuego; se paran, cada uno
  // dice lo suyo y entra al suyo, que se cierra atrás. Arranca en t0 (del
  // paso); devuelve cuándo terminó el último, para el negro.)
  portales(C, t0) {
    const B = this.B;
    const by = B.by;
    // [quién, su voz (la de su caballero), lo que dice, el gesto, el paso]
    const WHO9 = [
      ['valiente', 'caballeroFuego', 'brimBow', 1.15],
      ['canchero', 'caballeroRayo', 'wave', 0.95],
      ['miedoso', 'caballeroViento', 'chestHand', 1.3],
      ['viejo', 'caballeroHielo', 'brimBow', 0.8],
    ];
    const list = WHO9.filter(([k]) => by[k]).map(([k, voice, gest, v]) => {
      const r = by[k];
      const d = r.pos.clone().sub(C).setY(0);
      if (d.lengthSq() < 0.01) d.set(1, 0, 0);
      d.normalize();
      const at = C.clone().addScaledVector(d, 4.6);
      at.y = this.floorAt(at.x, at.z);
      return { k, r, voice, line: L9[k], gest, v, d, at, R: null, open: null, close: null, shut: false };
    });
    this.portals = list;
    // (de dónde se ve todo: del lado del hueco más grande entre los desgarros)
    const angs = list.map((P) => Math.atan2(P.d.z, P.d.x)).sort((a, b) => a - b);
    let camA = 0;
    let gap = -1;
    for (let i = 0; i < angs.length; i++) {
      const a0 = angs[i];
      const a1 = i < angs.length - 1 ? angs[i + 1] : angs[0] + Math.PI * 2;
      if (a1 - a0 > gap) {
        gap = a1 - a0;
        camA = a0 + gap / 2;
      }
    }
    const cd = V3(Math.cos(camA), 0, Math.sin(camA));
    const cs = V3(-cd.z, 0, cd.x);
    // (cada desgarro mira al fuego, girado hacia la cámara: los de los
    // costados se veían de canto, una raya)
    const face = C.clone().addScaledVector(cd, 3.2);
    for (const P of list) {
      const R = (P.R = makeRift('estero'));
      R.root.position.copy(P.at);
      R.root.rotation.y = Math.atan2(face.x - P.at.x, face.z - P.at.z);
      R.root.scale.setScalar(0.8);
      this.root.add(R.root);
    }
    const wide = (dur, k0 = 0) => {
      const p0 = C.clone().addScaledVector(cd, 9 - k0).addScaledVector(cs, 0.8).add(V3(0, 5, 0));
      const l0 = C.clone().add(V3(0, 0.9, 0));
      this.cut(dur, p0, p0.clone().addScaledVector(cd, -0.7).addScaledVector(cs, -0.4), l0, l0.clone().add(V3(0, 0.1, 0)), 52);
    };
    // los desgarros se abren, uno atrás del otro; ellos se paran y se miran
    this.at(t0, () => wide(6));
    list.forEach((P, i) =>
      this.at(t0 + 0.3 + i * 0.45, () => {
        P.open = this.t;
        P.R.root.visible = true;
        this.sfx('tear', P.at);
      }),
    );
    this.at(t0 + 0.9, () => {
      for (const P of list) {
        const r = P.r;
        B.act(r, r.cc?.name === 'kneelHold' ? 'standUp' : 'cool', { fade: 0.5, loop: r.cc?.name !== 'kneelHold' });
        B.turnTo(r, C);
      }
    });
    // la despedida: cada uno lo suyo, de frente, desde el otro lado del
    // fuego, con su desgarro atrás
    let t = t0 + 3.0;
    for (const P of list) {
      const dur = est(P.line) + 0.45;
      this.at(t - 0.25, () => {
        const r = P.r;
        const sd = V3(-P.d.z, 0, P.d.x);
        // (del costado en que ni el fuego ni los otros se meten en el medio)
        const clear = (q) => {
          let m = 9;
          for (const o of [C, ...list.filter((Q) => Q !== P).map((Q) => Q.r.pos)]) {
            const ax = r.pos.x - q.x;
            const az = r.pos.z - q.z;
            const u = clamp01(((o.x - q.x) * ax + (o.z - q.z) * az) / (ax * ax + az * az));
            m = Math.min(m, Math.hypot(q.x + ax * u - o.x, q.z + az * u - o.z));
          }
          return m;
        };
        const pa = r.pos.clone().addScaledVector(P.d, -2.6).addScaledVector(sd, 0.9);
        const pb = r.pos.clone().addScaledVector(P.d, -2.6).addScaledVector(sd, -0.9);
        const p0 = clear(pa) >= clear(pb) ? pa : pb;
        p0.y = r.pos.y + 1.45;
        const l0 = r.pos.clone().addScaledVector(P.d, 0.6);
        l0.y = r.pos.y + 1.35;
        this.cut(dur + 0.1, p0, p0.clone().addScaledVector(P.d, 0.25), l0, l0.clone().add(V3(0, 0.05, 0)), 40);
      });
      this.at(t, () => {
        this.say(P.voice, P.line);
        B.act(P.r, P.gest, { fade: 0.3 });
      });
      this.at(t + 2.4, () => B.act(P.r, 'cool', { loop: true, fade: 0.5 }));
      t += dur;
    }
    // y cada uno al suyo; atrás de él, se cierra
    t += 0.4;
    this.at(t - 0.1, () => wide(30, 1.2));
    // (FIN10, el usuario: "atraviesan los objetos que tienen en el camino:
    // que desaparezcan desvaneciéndose junto al resto de la isla (salvo el
    // fogón); que quede el fogón solo en el blanco". Ver voidStart)
    if (FIN10()) {
      this.at(t + 0.2, () => this.voidStart(C, 1.8));
      t += 2.6;
    }
    let end = t;
    list.forEach((P, i) => {
      const go = t + i * 0.7;
      const r = P.r;
      const inside = P.at.clone().addScaledVector(P.d, 0.25);
      const L = Math.hypot(inside.x - r.pos.x, inside.z - r.pos.z);
      const dur = L / P.v;
      this.at(go, () => B.walkPath(r, [inside], P.v, 'cool', { loop: true }));
      this.at(go + dur - 0.05, () => {
        r.dead = true;
        P.close = this.t;
      });
      end = Math.max(end, go + dur + 1.2);
    });
    return end;
  }

  // (FIN10) La isla se va al blanco: todo menos el fogón, los cuatro, los
  // desgarros y lo que brilla (aditivo: sobre el blanco no se ve). Un blanco por encima que deja
  // un hueco en el fuego y se cierra hasta él (`secs`); lo que está en el
  // camino de los cuatro —troncos, cajones, leña— se achica mientras; con el
  // blanco entero se esconde todo lo demás, el fondo queda blanco y el blanco
  // de encima se va. Lo deshace voidUndo (dispose).
  voidStart(C, secs) {
    const g = this.g;
    const keep = new Set([this.B.people.root, ...(this.portals || []).map((P) => P.R.root)]);
    // (el fogón del claro va fundido con el resto de lo quieto del mapa: uno
    // igual —la misma suerte, world/eclipse/centro put—, suelto, que aparece
    // en su lugar cuando lo demás se esconde)
    const w = g.world;
    const [fx, fz] = EE.fogon;
    let fogon = null;
    try {
      fogon = buildProp({ type: 'fogonCampo', pos: [fx, fz], y: w.floorAt(fx, fz) }, w.M, w.fogonSeed ?? 17)?.obj || null;
    } catch (e) {
      console.warn(e);
    }
    if (fogon) {
      fogon.visible = false;
      this.root.add(fogon);
      keep.add(fogon);
    }
    const kept = (o) => {
      for (let p = o; p; p = p.parent) if (keep.has(p)) return true;
      return false;
    };
    const hide = [];
    const shrink = [];
    g.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine) || !o.visible) return;
      if (kept(o)) return;
      const mats = [].concat(o.material || []);
      if (mats.length && mats.every((m) => m.blending === THREE.AdditiveBlending)) return;
      o.getWorldPosition(tmpV);
      const d = Math.hypot(tmpV.x - C.x, tmpV.z - C.z);
      hide.push(o);
      if (o.isInstancedMesh || d > 5.4) return;
      if (!o.geometry?.boundingSphere) o.geometry?.computeBoundingSphere?.();
      const rad = (o.geometry?.boundingSphere?.radius || 0) * o.getWorldScale(tmpW).x;
      if (rad > 0 && rad < 2.4) shrink.push({ o, s: o.scale.clone(), auto: o.matrixAutoUpdate });
    });
    // (debajo de las barras negras y del texto: va primero)
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0';
    this.el.insertBefore(el, this.el.firstChild);
    this.void = { t: this.t, secs, C: C.clone(), hide, shrink, el, fogon, swap: null };
  }

  voidTick() {
    const V = this.void;
    if (!V?.el) return;
    const g = this.g;
    const cam = g.camera;
    const W = this.el.clientWidth || innerWidth;
    const H = this.el.clientHeight || innerHeight;
    // el hueco: el fuego en la pantalla y cuánto mide un metro ahí
    const c = tmpV.copy(V.C).setY(V.C.y + 0.35).project(cam);
    const px = (c.x * 0.5 + 0.5) * W;
    const py = (0.5 - c.y * 0.5) * H;
    tmpW.set(1, 0, 0).applyQuaternion(cam.quaternion).add(V.C).setY(V.C.y + 0.35).project(cam);
    const m = Math.hypot((tmpW.x - c.x) * 0.5 * W, (tmpW.y - c.y) * 0.5 * H);
    const u = clamp01((this.t - V.t) / V.secs);
    const k = smooth(u);
    let op = k;
    if (V.swap != null) op = 1 - smooth(clamp01((this.t - V.swap) / 1.1));
    const r0 = m * lerp(3.2, 0.95, k);
    V.el.style.opacity = op.toFixed(3);
    // (del tono con que sale el fondo ya pasado por el color de la pantalla: sin salto al sacarlo)
    V.el.style.background = `radial-gradient(circle at ${px.toFixed(0)}px ${py.toFixed(0)}px, rgba(202,217,208,0) ${r0.toFixed(0)}px, rgb(202,217,208) ${(r0 * 1.5 + 12).toFixed(0)}px)`;
    // lo del camino, achicándose
    const sk = 1 - smooth(clamp01(u * 1.25));
    for (const S of V.shrink) {
      S.o.scale.copy(S.s).multiplyScalar(Math.max(0.0001, sk));
      S.o.updateMatrix();
      S.o.matrixWorldNeedsUpdate = true;
    }
    if (u >= 1 && V.swap == null) {
      V.swap = this.t;
      V.vis = V.hide.map((o) => o.visible);
      for (const o of V.hide) o.visible = false;
      if (V.fogon) V.fogon.visible = true;
      const sc = g.scene;
      V.bg = sc.background;
      sc.background = new THREE.Color(globalThis.__mduVoidBg ?? 0xb0b0b0);
      const f = sc.fog;
      if (f) V.fog = f.isFogExp2 ? { d: f.density } : { n: f.near, f: f.far };
      if (f?.isFogExp2) f.density = 0;
      else if (f) {
        f.near = 1e5;
        f.far = 2e5;
      }
    }
    if (V.swap != null && this.t - V.swap > 1.2) {
      V.el.remove();
      V.el = null;
    }
  }

  voidUndo() {
    const V = this.void;
    if (!V) return;
    this.void = null;
    V.el?.remove();
    V.fogon?.removeFromParent();
    for (const S of V.shrink) {
      S.o.scale.copy(S.s);
      S.o.updateMatrix();
    }
    if (V.swap == null) return;
    V.hide.forEach((o, i) => (o.visible = V.vis[i]));
    const sc = this.g.scene;
    sc.background = V.bg;
    const f = sc.fog;
    if (f && V.fog) {
      if (f.isFogExp2) f.density = V.fog.d;
      else {
        f.near = V.fog.n;
        f.far = V.fog.f;
      }
    }
  }

  tickPortals(dt) {
    const g = this.g;
    this.voidTick();
    for (const P of this.portals) {
      const R = P.R;
      R.tick(dt, g.camera);
      if (P.open == null || P.shut) continue;
      if (P.close == null) {
        const k = (this.t - P.open) / 1.6;
        R.U.uCrack.value = Math.min(1, Math.max(0, k * 3));
        R.U.uOpen.value = 1 - (1 - smooth(clamp01(k - 0.3))) ** 2;
      } else {
        const k = (this.t - P.close) / 0.9;
        R.U.uOpen.value = Math.max(0, 1 - smooth(Math.min(1, k)));
        R.U.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
        if (k >= 1.05) {
          P.shut = true;
          R.root.visible = false;
          const p = tmpV.copy(R.root.position).setY(R.root.position.y + 1.3);
          g.fx?.flash?.(p, 0xff9ce8, 26, 0.4, 10);
          g.fx?.sparkle?.(p, [1, 0.6, 0.95], 18, 0.5);
          this.sfx('close', R.root.position);
        }
      }
    }
  }

  // (2026-10-08, ITERACION-7 B3, el usuario: "cuando Martín aparece se laguea
  // todo y cuando cambia de forma también". Medido (luz/t_finhitch.mjs): un
  // cuadro de ~290 ms al aparecer (su cuerpo, programa nuevo) y uno de ~270 ms
  // al volverse dorado (clipApply: los materiales con plano de corte, la
  // linterna y el destello: 3 programas y 4 geometrías nuevas). Acá, en el
  // primer instante del fogón —todavía en negro y ya con sus luces—: el corte
  // puesto desde ya (los planos en 1e4 no cortan nada) y los dos cuerpos y la
  // linterna dibujados de verdad unos cuadros delante de la cámara.
  // (renderer.compile no sirve: compila la variante sin plano de corte.)
  // __mduOldFinWarmF: como antes)
  warmFierro() {
    if (this.fierroWarm) return;
    this.fierroWarm = true;
    const g = this.g;
    const fz = this.fierro;
    const gd = this.gold;
    if (!fz?.a?.group || !gd?.a?.group) return;
    this.clipApply();
    const keep = (this.warmKeep = [fz, gd].map((r) => ({ r, dead: r.dead, pos: r.pos.clone(), cc: r.cc })));
    for (const k of keep) {
      k.r.dead = false;
      // (con un clip puesto: sin clip se dibuja el muñeco de piezas, no el
      // cuerpo de verdad, que es el que hay que compilar)
      this.B.act(k.r, 'lanternStand', { loop: true, fade: 0.01 });
    }
    this.warmPlace();
    this.warmBack = () => {
      for (const k of keep) {
        k.r.dead = k.dead;
        k.r.pos.copy(k.pos);
        k.r.cc = k.cc;
      }
      this.warmBack = null;
      this.warmKeep = null;
    };
    this.later(0.3, () => this.warmBack?.());
    // (el destello del cambio, una vez, chico y en el negro)
    g.fx?.flash?.(fz.pos.clone(), 0xffc060, 0.2, 0.1, 1);
  }

  // (mientras dura: delante de la cámara de cada cuadro —la toma del fogón la
  // cambia de lugar al empezar y quedaban fuera de cuadro, sin dibujarse—)
  warmPlace() {
    // (la cámara de la toma —this.pos / this.look—: en este punto del cuadro
    // la del juego es todavía la del jugador, que está en otro lado)
    const f = tmpV.subVectors(this.look, this.pos);
    if (f.lengthSq() < 1e-6) return;
    f.normalize();
    const rt = tmpW.crossVectors(f, UP).normalize();
    (this.warmKeep || []).forEach(({ r }, i) => {
      r.pos.copy(this.pos).addScaledVector(f, 5).addScaledVector(rt, (i - 0.5) * 1.2);
      r.pos.y -= 1;
    });
  }

  // (E3) Un cartel de tiempo: negro, el texto que aparece y se va, y se abre.
  // Devuelve cuánto dura (el paso del guion).
  timeCard(text, onBlack, hold = false) {
    const D = 4.6;
    if (onBlack) this.at(1.2, onBlack);
    const fadeEl = this.el.querySelector('.mdu-fcine__fade');
    fadeEl.style.transition = 'opacity 0.8s';
    this.fade(true);
    this.quiet();
    let el = this.timeEl;
    if (!el) {
      el = this.timeEl = document.createElement('p');
      el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,86vw);margin:0;text-align:center;z-index:9;pointer-events:none;font:400 clamp(20px,2.3vw,32px)/1.4 Georgia,serif;letter-spacing:.09em;color:#ece6da;opacity:0;transition:opacity 1s';
      this.el.appendChild(el);
    }
    this.at(0.9, () => {
      el.textContent = text;
      el.style.opacity = '1';
    });
    this.at(D - 1.2, () => (el.style.opacity = '0'));
    // (se abre recién con el paso que sigue ya armado: antes asomaba un
    // instante el decorado de antes)
    if (!hold) {
      this.at(D + 0.05, () => {
        fadeEl.style.transition = 'opacity 1.6s';
        this.fade(false);
      });
    }
    // (los fundidos de los pasos que siguen, con el suyo de siempre)
    this.at(D + 1.4, () => (fadeEl.style.transition = ''));
    return D;
  }

  // (FIN8) El cartel de tiempo, con aire: se va a negro en 2 s mientras la
  // canción se apaga; 5 s de negro y silencio; el texto, 5 s enteros; y recién
  // ahí se abre el paso que sigue, que trae su canción.
  // (FIN11) onText: lo que arranca cuando aparece el texto (la canción del
  // funeral, con el de Mercedes); chord: el coro del silencio —solo en el negro
  // de antes, se apaga cuando entra el texto—; y mientras dura, sin el ruido de
  // fondo de la isla (hush).
  timeCard8(text, hold = false, onText = null, chord = null) {
    const fadeEl = this.el.querySelector('.mdu-fcine__fade');
    fadeEl.style.transition = 'opacity 2s';
    this.fade(true);
    this.quiet();
    this.g.music?.stop?.(4);
    const el = this.timeText();
    el.style.top = '50%';
    el.style.textShadow = '';
    const T0 = 2 + 5;
    if (FIN11()) {
      this.hush = true;
      if (chord) this.at(2.4, () => this.choir(0, chord, { dur: 2.3, gain: 0.045, attack: 1.5, release: 1.9 }));
    }
    this.at(T0, () => {
      el.textContent = text;
      el.style.opacity = '1';
      onText?.();
    });
    // (1 s en aparecer, 5 s a la vista)
    this.at(T0 + 6, () => (el.style.opacity = '0'));
    const D = T0 + 6 + 1.3;
    if (!hold) {
      this.at(D + 0.05, () => {
        fadeEl.style.transition = 'opacity 2.2s';
        this.fade(false);
      });
    }
    // (el fondo de la isla vuelve con la imagen)
    this.at(D + 0.05, () => (this.hush = false));
    this.at(D + 2.8, () => (fadeEl.style.transition = ''));
    return D;
  }

  // (FIN11) El coro de "ahhh" del final de Der Mateendrache (ui/CastleEnding
  // choir), por el volumen de la música.
  choir(t, notes, o) {
    const A = this.g.audio;
    if (!A?.ctx || !A.choir) return;
    this.bus ||= A.out({ gain: 1, reverb: 0.5, bus: A.music });
    A.choir(this.bus, A.now + t, notes, o);
  }

  timeText() {
    let el = this.timeEl;
    if (!el) {
      el = this.timeEl = document.createElement('p');
      el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,86vw);margin:0;text-align:center;z-index:9;pointer-events:none;font:400 clamp(20px,2.3vw,32px)/1.4 Georgia,serif;letter-spacing:.09em;color:#ece6da;opacity:0;transition:opacity 1s';
      this.el.appendChild(el);
    }
    return el;
  }

  // (FIN8) El tiempo escrito sobre la imagen (sin negro), arriba, secs segundos.
  timeTitle(text, secs) {
    const el = this.timeText();
    el.style.top = '20%';
    el.style.textShadow = '0 2px 14px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.9)';
    el.textContent = text;
    el.style.opacity = '1';
    this.later(1 + secs, () => (el.style.opacity = '0'));
  }

  // Negro de cine: un fundido de secs (debajo del cartel, que va con zIndex 8).
  blackOut(secs) {
    let el = this.blackEl;
    if (!el) {
      el = this.blackEl = document.createElement('div');
      el.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:7;background:#000;opacity:0;transition:opacity ${secs}s cubic-bezier(.4,0,.6,1)`;
      this.el.appendChild(el);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
  }

  // El telón rojo de los dos costados (on: se cierra en secs; off: se saca).
  curtain(on, secs) {
    let el = this.curtainEl;
    if (!el) {
      el = this.curtainEl = document.createElement('div');
      el.className = 'mdu-fin-telon';
      el.innerHTML = '<div class="mdu-fin-telon__a"></div><div class="mdu-fin-telon__b"></div><div class="mdu-fin-telon__top"></div><div class="mdu-fin-telon__negro"></div>';
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:7;overflow:hidden';
      const side = (k) =>
        `position:absolute;top:0;bottom:0;width:51%;${k}:0;transform:translateX(${k === 'left' ? '-101%' : '101%'});transition:transform 0s;` +
        'background:repeating-linear-gradient(90deg,#3c0508 0px,#7a0c12 22px,#a3141c 38px,#6a0a10 58px,#3c0508 80px);' +
        `box-shadow:${k === 'left' ? '' : '-'}14px 0 40px rgba(0,0,0,.65) inset, 0 0 60px rgba(0,0,0,.6);` +
        'border-bottom:10px solid #c9a24a';
      el.children[0].style.cssText = side('left');
      el.children[1].style.cssText = side('right');
      el.children[3].style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1.1s';
      el.children[2].style.cssText = 'position:absolute;left:0;right:0;top:0;height:9%;background:repeating-linear-gradient(90deg,#4a070b 0,#8c1018 30px,#4a070b 60px);border-bottom:6px solid #c9a24a;box-shadow:0 8px 24px rgba(0,0,0,.6);transform:translateY(-110%);transition:transform 0s';
      this.el.appendChild(el);
    }
    const [a, b, top, negro] = el.children;
    if (!on) negro.style.opacity = '0';
    for (const x of [a, b, top]) x.style.transition = `transform ${secs}s cubic-bezier(.45,.05,.3,1)`;
    requestAnimationFrame(() => {
      a.style.transform = on ? 'translateX(0)' : 'translateX(-101%)';
      b.style.transform = on ? 'translateX(0)' : 'translateX(101%)';
      top.style.transform = on ? 'translateY(0)' : 'translateY(-110%)';
    });
  }

  // ---------------- cada cuadro ----------------
  tick(dt, t) {
    const g = this.g;
    this.dt = dt;
    this.seqTick();
    if (this.warmKeep) this.warmPlace();
    const A = this.A;
    // Belgrano camina (de piezas: Avatars le mueve las piernas)
    const b = this.bel;
    if (b.walk?.P) {
      // (por puntos, a paso parejo: ver script0, paso 3)
      const W = b.walk;
      W.t += dt;
      const prev = tmpW.copy(b.r.pos);
      let d = Math.min(W.L, W.t * W.v);
      let i = 0;
      while (i < W.seg.length - 1 && d > W.seg[i]) d -= W.seg[i++];
      b.r.pos.lerpVectors(W.P[i], W.P[i + 1], W.seg[i] > 0 ? Math.min(1, d / W.seg[i]) : 1);
      b.r.pos.y = this.floorAt(b.r.pos.x, b.r.pos.z);
      const v = dt > 0 ? prev.distanceTo(b.r.pos) / dt : 0;
      b.r.moving = v > 0.05;
      b.r.speed = v;
      // (FIN10, el usuario: "Belgrano cuando se da la vuelta para verlos a
      // todos lo hace con un teleport": en las esquinas del camino y al llegar
      // se daba vuelta de un cuadro al otro. Ahora gira a su paso)
      if (v > 0.05) b.r.yaw = FIN10() ? angTo(b.r.yaw, yawTo(prev, b.r.pos), Math.min(1, dt * 7)) : yawTo(prev, b.r.pos);
      if (W.t * W.v >= W.L) {
        b.walk = null;
        b.r.moving = false;
        b.r.speed = 0;
        if (FIN10()) b.yawGoal = yawTo(b.r.pos, W.face || this.cirilo.pos);
        else b.r.yaw = yawTo(b.r.pos, W.face || this.cirilo.pos);
      }
    } else if (b.walk) {
      const W = b.walk;
      W.t += dt;
      const k = Math.min(1, W.t / W.d);
      const prev = tmpW.copy(b.r.pos);
      b.r.pos.lerpVectors(W.from, W.to, smooth(k));
      b.r.pos.y = this.floorAt(b.r.pos.x, b.r.pos.z);
      const v = dt > 0 ? prev.distanceTo(b.r.pos) / dt : 0;
      b.r.moving = v > 0.05;
      b.r.speed = v;
      if (v > 0.05) b.r.yaw = FIN10() ? angTo(b.r.yaw, yawTo(prev, b.r.pos), Math.min(1, dt * 7)) : yawTo(prev, b.r.pos);
      if (k >= 1) {
        b.walk = null;
        b.r.moving = false;
        b.r.speed = 0;
        if (FIN10()) b.yawGoal = yawTo(b.r.pos, this.cirilo.pos);
        else b.r.yaw = yawTo(b.r.pos, this.cirilo.pos);
      }
    }
    if (b.walk) b.yawGoal = null;
    else if (b.yawGoal != null) {
      b.r.yaw = angTo(b.r.yaw, b.yawGoal, Math.min(1, dt * 3.5));
      if (Math.abs(Math.atan2(Math.sin(b.yawGoal - b.r.yaw), Math.cos(b.yawGoal - b.r.yaw))) < 0.01) b.yawGoal = null;
    }
    // San Martín: mira al Gil, niega con la cabeza, mira a Belgrano
    const sm = this.sm;
    const want = this.smLook === -1 ? -0.55 : this.smLook === 1 ? 0.1 : 0;
    sm.look += (want - sm.look) * Math.min(1, dt * 2.5);
    sm.head = this.smShake != null ? 0.32 * Math.sin((this.t - this.smShake) * 9) * Math.max(0, 1 - (this.t - this.smShake) / 1.3) : 0;
    this.horses.update(dt);
    this.mont.update(dt);
    // los cuerpos
    for (const C of [A, this.Sx, this.B]) if (C.people.root.visible) C.tick(dt);
    for (const a of [b.a, sm.a]) if (a?.hand) a.hand.visible = false;
    gilVincha(this.gil.a);
    this.goldLook();
    // (el corte que sube: el paso a dorado y el alma)
    if (!this.clipDone && this.modeK === 'fogon') this.clipApply();
    this.xformTick(dt);
    this.placeMate();
    // el brillo del mate
    const mg = this.mate.userData;
    this.glowK = (this.glowK || 0) + ((this.glowTo || 0) - (this.glowK || 0)) * Math.min(1, dt * 1.6);
    mg.glow.material.opacity = this.glowK * 0.9;
    mg.glow.scale.setScalar(0.32 + this.glowK * 0.9 + 0.04 * Math.sin(t * 5));
    mg.gourd.material.emissiveIntensity = this.glowK * 0.9;
    // el desgarro
    const R = this.rift;
    R.tick(dt, g.camera);
    if (this.portals) this.tickPortals(dt);
    if (this.riftOpen && this.riftClose == null) {
      const k = (this.t - this.riftOpen.t) / 1.6;
      R.U.uCrack.value = Math.min(1, Math.max(0, k * 3));
      R.U.uOpen.value = 1 - (1 - smooth(clamp01(k - 0.3))) ** 2;
    }
    if (this.riftClose != null) {
      const k = (this.t - this.riftClose) / 0.9;
      R.U.uOpen.value = Math.max(0, 1 - smooth(Math.min(1, k)));
      R.U.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1.05 && R.root.visible && this.modeK === 'campo') {
        R.root.visible = false;
        const p = tmpV.copy(R.root.position).setY(R.root.position.y + 1.5);
        g.fx?.flash?.(p, 0xff9ce8, 34, 0.45, 12);
        g.fx?.sparkle?.(p, [1, 0.6, 0.95], 24, 0.6);
        this.sfx('close', R.root.position);
      }
    }
    // la cinta del facón y las banderas
    tickFlags(t);
    for (const tl of this.sets.parts.facon.userData.tails) tl.rotation.set(0.25 + 0.12 * Math.sin(t * 2.1 + tl.userData.len * 9), 0, 0.15 * Math.sin(t * 1.7 + tl.userData.len * 5));
    if (this.tumba?.visible) for (const tl of this.tumbaTails) tl.rotation.set(0.3 + 0.14 * Math.sin(t * 2.3 + tl.userData.len * 11), 0, 0.18 * Math.sin(t * 1.9 + tl.userData.len * 7));
    for (const f of this.sets.flames) f.scale.setScalar(f.userData.base * (0.85 + 0.15 * Math.sin(t * 13 + f.position.x * 7)));
    // el humo del campo
    if (this.smokeG.visible) {
      for (const s of this.smoke) {
        const d = s.userData;
        this.F(d.u + ((t * 0.25 + d.ph * 3) % 12) - 6, d.v, 1.2 + 0.5 * Math.sin(t * 0.3 + d.ph), s.position);
        s.scale.setScalar(d.s);
      }
    }
    // el cielo de Eclipse se cose: las grietas se cierran y se aclara; el alba entra encima
    if (this.sew) {
      const k = this.t - this.sew.t;
      this.crackK = 1 - smooth(clamp01((k - 3) / 11));
      // (la noche se queda: al aclarar los ocho cielos se mezclaban en un marrón;
      // el alba entra como un domo pintado encima, antes)
      this.nightK = 1;
      this.dome.userData.U.uOpacity.value = smooth(clamp01((k - 9) / 9));
      this.dome.userData.U.uSunK.value = 1.4 * smooth(clamp01((k - 15) / 6));
    } else if (this.dome.visible) this.dome.userData.U.uOpacity.value = 1;
    if (FIN2()) this.fin2Tick(t);
    // el fuego y la linterna: dos fogonazos prestados, prendidos mientras se ven
    this.fireTick(t, dt);
    // los recuerdos: el que se acuerda brilla con la luz de su elemento
    for (const r of this.B.list) {
      const u = r.a?.M?.gaucho?.userData.life?.uFill;
      if (!u) continue;
      if (this.memory?.p === r.persona) u.value.set(ELEM[r.persona]).multiplyScalar(0.75);
      else if (this.fireOn && r.persona !== 'fierro') u.value.setRGB(0.06, 0.03, 0.01);
      else if (FIN2() && r === this.fierro) u.value.setRGB(0.1, 0.11, 0.15);
      else u.value.setRGB(0, 0, 0);
    }
  }

  fireTick(t, dt) {
    const g = this.g;
    const fire = this.sets.fire;
    const on = this.fireOn && this.modeK === 'fogon';
    this.fireK = (this.fireK ?? 1) + ((this.fireDim ? 0.25 : 1) - (this.fireK ?? 1)) * Math.min(1, dt * 1.5);
    const flick = 0.85 + 0.1 * Math.sin(t * 17) + 0.08 * Math.sin(t * 7.3);
    for (const s of fire.children) {
      s.scale.setScalar(s.userData.base * (0.8 + 0.25 * Math.sin(t * 9 + s.userData.ph)) * this.fireK);
      s.position.y = 0.15 + s.userData.ph * 0.05 + 0.04 * Math.sin(t * 6 + s.userData.ph);
    }
    const FL = this.fireL;
    if (FL) {
      if (on) {
        fire.getWorldPosition(tmpV);
        FL.life = 1;
        FL.max = 1;
        FL.peak = 9 * flick * this.fireK;
        FL.light.color.setHex(0xff8a3a);
        FL.light.distance = 13;
        FL.light.position.set(tmpV.x, tmpV.y + 0.6, tmpV.z);
      } else if (this.fireWas) FL.life = 0;
    }
    this.fireWas = on;
    // la linterna, en la mano izquierda del hombre dorado
    const lp = this.lamp;
    const gd = this.gold;
    const lon = !!this.lampOn && !gd.dead && !!gd.a?.gs?.on && this.modeK === 'fogon';
    this.lampK = (this.lampK || 0) + ((lon ? 1 : 0) - (this.lampK || 0)) * Math.min(1, dt * (lon ? 3 : 6));
    lp.root.visible = !gd.dead && !!gd.a?.gs?.on && this.modeK === 'fogon';
    if (lp.root.visible) {
      gd.a.gs.bones.LeftHand.getWorldPosition(tmpV);
      lp.root.position.set(tmpV.x, tmpV.y - 0.05, tmpV.z);
      const k = this.lampK * (0.9 + 0.1 * Math.sin(t * 15));
      lp.flame.scale.setScalar(0.22 * k);
      lp.halo.material.opacity = 0.35 * k;
      lp.glass.opacity = 0.2 + 0.65 * this.lampK;
    }
    const LL = this.lampL;
    if (LL) {
      if (lp.root.visible && this.lampK > 0.02) {
        LL.life = 1;
        LL.max = 1;
        LL.peak = 1.5 * this.lampK;
        LL.light.color.setHex(0xffa04a);
        LL.light.distance = 5;
        // (un poco adelante: pegada a la tela la quemaba en blanco)
        LL.light.position.copy(lp.root.position).add(tmpW.set(-Math.sin(gd.yaw) * 0.35, 0.15, -Math.cos(gd.yaw) * 0.35));
        this.lampWas = true;
      } else if (this.lampWas) {
        LL.life = 0;
        this.lampWas = false;
      }
    }
  }

  // (sesión 1f) Las antorchas que vienen al galope (paso 6), las matas del
  // estero por distancia, y los ojos de brasa del final.
  fin2Tick(t) {
    const g = this.g;
    if (this.torchG) {
      const on = !!this.torchesOn && this.modeK === 'estero';
      this.torchG.visible = on;
      if (!on && this.torchLit) {
        this.torchLit = false;
        for (const FL of [this.fireL, this.lampL]) if (FL) FL.life = 0;
      }
      if (!on && this.riders) {
        for (const R of this.riders) {
          R.h.visible = false;
          R.a.r.dead = true;
          R.live = 0;
        }
      }
      if (on) {
        const k = this.t - this.torchesOn.t;
        const to = this.torchesOn.to;
        let sum = 0;
        this.torches.forEach((T, i) => {
          const R = FIN3() ? this.riders?.[i] : null;
          if (FIN3() && !R) {
            T.o.visible = false;
            return;
          }
          const a = -0.73 + (i / 6 - 0.5) * 2.2;
          const sx = to.x + 30 + i * 2.6 - 8, sz = to.z - 28 + (i % 3) * 3.5;
          // (FIN8: el sargento se adelanta hasta dos metros del Gil)
          const G8 = i === SGT ? this.sgt : null;
          const rad = G8 ? lerp(4.6, 2.15, smooth(clamp01((this.t - G8.t) / 2.4))) : 4.6;
          const ex = to.x + Math.cos(a) * rad, ez = to.z + Math.sin(a) * rad;
          const u = smooth(clamp01((k - 1.0 - i * 0.3) / 12.5));
          sum += u;
          const x = lerp(sx, ex, u), z = lerp(sz, ez, u);
          const bob = (1 - u) * 0.14 * Math.abs(Math.sin(this.t * 7.5 + i * 1.3));
          if (R) {
            // (FIN3) el caballo al galope por el camino de la antorcha; el jinete la lleva en alto
            const h = R.h;
            const px = h.pos.x;
            const pz = h.pos.z;
            // (el primer cuadro van escondidos: el caballo y el jinete todavía están en el origen)
            const first = !R.live;
            R.live = 1;
            h.visible = !first;
            R.a.r.dead = first;
            T.o.visible = !first;
            h.pos.set(x, this.floorAt(x, z), z);
            h.groundY = h.pos.y;
            const dt2 = this.dt || 1 / 30;
            const v = Math.hypot(x - px, z - pz) / dt2;
            h.speed = v > 30 ? 0 : v;
            // (FIN10, el usuario: "lo mismo le pasa a los caballos de partida":
            // al frenar se daban vuelta de golpe hacia el Gil. Ahora giran)
            const yw = u < 0.995 && v > 0.2 ? Math.atan2(x - px, z - pz) : Math.atan2(to.x - x, to.z - z);
            h.yaw = FIN10() && !first ? angTo(h.yaw, yw, Math.min(1, dt2 * (v > 0.2 ? 6 : 2.2))) : yw;
            if (G8) R.m.brazos = G8.arm || 'riendas';
            // (el sable del sargento: a la vista desde que lo saca)
            if (i === SGT && R.a.gs?.sable) R.a.gs.sable.visible = !!G8?.sable;
            R.m.update(dt2);
            const hb = R.a.gs?.bones?.RightHand;
            // (el sargento deja la antorcha cuando se adelanta: lleva las riendas y el sable)
            if (G8) T.o.visible = false;
            if (hb) {
              hb.getWorldPosition(T.o.position);
              T.o.position.y += 0.42;
            } else T.o.position.set(x, h.pos.y + 2.45, z);
          } else T.o.position.set(x, this.floorAt(x, z) + 2.45 + bob, z);
          T.fl.scale.set(0.42 + 0.08 * Math.sin(this.t * 17 + i), 0.72 + 0.12 * Math.sin(this.t * 23 + i * 2), 1);
          T.halo.material.opacity = 0.17 + 0.05 * Math.sin(this.t * 11 + i * 3);
        });
        // (FIN8) la luz de las antorchas, de verdad: eran solo brillos y de noche
        // el Gil, el sargento y el caballo quedaban en negro. Los dos fogonazos
        // prestados (los del fuego y la linterna del fogón, libres acá): uno del
        // lado del sargento y otro del lado del árbol; crecen a medida que llegan
        if (FIN8()) {
          const near8 = Math.min(1, sum / 6);
          const flick = 0.86 + 0.09 * Math.sin(this.t * 17) + 0.07 * Math.sin(this.t * 7.3);
          const put = (FL, a, r, peak, dist) => {
            if (!FL) return;
            FL.life = 1;
            FL.max = 1;
            FL.peak = peak * flick * near8 * near8;
            FL.light.color.setHex(0xff9a4a);
            FL.light.distance = dist;
            FL.light.position.set(to.x + Math.cos(a) * r, to.y + 2.7, to.z + Math.sin(a) * r);
          };
          put(this.fireL, SGT_A + 0.35, 3.3, 9, 17);
          put(this.lampL, -1.25, 4.0, 8.5, 16);
          this.torchLit = true;
        }
        // el galope, cada vez más cerca; cuando llegan, silencio
        const A = g.audio;
        const near = sum / this.torches.length;
        if (A?.ctx && A.hoof && near < 0.97 && this.t >= (this.nextHoof || 0)) {
          this.nextHoof = this.t + 0.34;
          const o = (this.hoofO ||= A.out({ gain: 1, reverb: 0.6 }));
          const kk = 0.1 + 0.65 * near;
          [0.55, 0.7, 1].forEach((v, j) => A.hoof(o, A.now + j * 0.08, v * kk));
        }
      }
    }
    // (las matas del estero van todas enteras: son pocas y el reparto por distancia las escondía)
    if (this.ember && this.gold?.a?.M?.eye) {
      const e = smooth(clamp01((this.t - this.ember.t) / 0.8));
      this.gold.a.M.eye.color.setRGB(lerp(1.3, 1.9, e), lerp(0.85, 0.22, e), lerp(0.03, 0.04, e));
    }
  }

  // el hombre de la linterna: oscuro, el poncho de oro gastado y los ojos de oro
  // (el del molino: ui/introShots goldGaucho)
  goldLook() {
    const a = this.gold.a;
    const G = a?.gs;
    if (!G?.on || a.goldOn) return;
    a.goldOn = true;
    G.mat.color.setScalar(0.32);
    a.M.poncho.color.set(0x9a6c1e).multiplyScalar(1.7 / 0.32);
    // (FIN10, el usuario: "Martín Fierro cuando pasa a su forma dorada, la
    // cinta de su sombrero sigue roja": la cinta, dorada como el poncho)
    if (FIN10() && G.mat.userData.life?.uBandGold) G.mat.userData.life.uBandGold.value = 1;
    const eye = new THREE.Color(0xffa818).multiplyScalar(1.3);
    a.M.eye.color.copy(eye);
    for (const o of eyeSpots(G, a.M.eye.color)) {
      const sm = new THREE.SpriteMaterial({ map: this.g.textures?.dot, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.32, toneMapped: false });
      sm.color = a.M.eye.color;
      const sp = new THREE.Sprite(sm);
      const ws = 1 / o.getWorldScale(tmpV).x;
      sp.scale.setScalar(0.06 * ws);
      sp.frustumCulled = false;
      o.add(sp);
      // (FIN8: el brillo de los ojos va con el corte que sube: xformTick)
      (this.goldEyes ||= []).push(sp);
    }
  }

  // ---------------- el sonido ----------------
  wind(dur, gain = 0.16) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = (this.bus ||= A.out({ gain: 1, reverb: 0.5, bus: A.music }));
    A.noise(o, { t: A.now, dur, type: 'bandpass', freq: 300, freqEnd: 220, q: 0.6, gain, attack: 2.5, brown: true });
  }
  sfx(kind, p) {
    // (FIN8) el sable que sale de la vaina (grabado, del usuario) y el tajo
    if (kind === 'desenvaina') {
      eclSfx(this.g).play('sable-desenvaina', { gain: 0.8, reverb: 0.35 });
      return;
    }
    if (kind === 'tajo') {
      const A = this.g.audio;
      A.knife?.(true);
      if (A?.ctx) {
        const o = A.out({ gain: 1, reverb: 0.5 });
        A.tone(o, { dur: 0.9, freq: 78, freqEnd: 30, gain: 0.5, attack: 0.005 });
        A.noise(o, { dur: 0.22, type: 'lowpass', freq: 600, freqEnd: 120, gain: 0.3 });
      }
      return;
    }
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(p).setY(p.y + 1.4).clone(), gain: 1, reverb: 0.7, ref: 7 });
    const t = A.now;
    if (kind === 'tear') {
      A.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 320, freqEnd: 2600, q: 1.6, gain: 0.55, attack: 0.04 });
      A.tone(o, { t, dur: 1.8, type: 'sawtooth', freq: 62, freqEnd: 36, gain: 0.22, attack: 0.05 });
    } else if (kind === 'close') {
      A.noise(o, { t, dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 120, gain: 0.6, attack: 0.01 });
      A.tone(o, { t: t + 0.55, dur: 0.9, type: 'sine', freq: 95, freqEnd: 30, gain: 0.55, attack: 0.004 });
    } else if (kind === 'giggle') {
      // la risita de chico del Chiquitijuein (el libro: la chispa colorada que salió de Francisco)
      for (let i = 0; i < 5; i++) A.tone(o, { t: t + i * 0.13 + (i % 2) * 0.02, dur: 0.09, type: 'triangle', freq: 980 + (i % 3) * 140, freqEnd: 760 + (i % 2) * 90, gain: 0.07 * (1 - i * 0.12), attack: 0.006 });
    } else if (kind === 'out') {
      A.noise(o, { t, dur: 0.5, type: 'highpass', freq: 2500, gain: 0.12 });
    }
  }

  cleanup() {
    const g = this.g;
    this.wantFov = null;
    if (this.clip0 != null) g.renderer.localClippingEnabled = this.clip0;
    this.curtainEl?.remove();
    if (this.claroAway) this.claroMode(false);
    delete SET_AT.fogon;
    const w = g.world;
    g.renderer.domElement.style.filter = '';
    if (this.sceneBR !== undefined) g.scene.onBeforeRender = this.sceneBR || (() => {});
    if (w.sky?.userData.finWrap !== undefined) {
      w.sky.onBeforeRender = w.sky.userData.finWrap;
      delete w.sky.userData.finWrap;
    }
    if (w.sky) w.sky.visible = true;
    if (this.fireL) this.fireL.life = 0;
    if (this.lampL) this.lampL.life = 0;
    for (const C of [this.A, this.Sx, this.B]) C?.dispose();
    this.horses?.dispose();
    this.rift?.dispose();
    for (const P of this.portals || []) P.R.dispose();
    this.voidUndo();
    if (g.zombies?.root) g.zombies.root.visible = true;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
  }
}
