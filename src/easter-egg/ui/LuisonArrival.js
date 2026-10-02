import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import Avatars from '../net/Avatars';
import CineHorde from './cineHorde';
import { warmScene } from './cineWarm';
import { EE, PROPS, SKY } from '../config/map';
import { WEAPONS, weaponStats } from '../config/weapons';
import { faconPickup } from '../weapons/Facon';
import { PART_COUNT, makePose, solvePose, solveExtras } from '../entities/skeleton';
import { luisonIdle, luisonLow, luisonGait, POUNCE } from '../entities/luison';
import { arm, leg, ground } from '../entities/zombieGaits';
import { lomaY, lomaTop } from '../world/esterosProps';
import { EXTRA_PUSH } from '../fx/grassPush';
import { prefetchTrack } from '../core/music';
import { speechPlan, voiceLength } from '../core/voice';

// "Mate no Numa": la llegada del Luisón (EsterosEgg.startLuison). Gil deja la
// luz de los ahogados en el hueco del Algarrobo de los Colgados y arranca la
// canción de la pelea final; toda la escena va al compás de la canción (el
// reloj ES la canción: si tarda en cargar, la escena la espera):
//  · la paz (0-11,7): la cajita de música. Los cuatro al pie del árbol, bajo
//    la luna llena; el hueco se apaga; miran alrededor, algo no está bien.
//  · lo que se acerca (11,7-33,8): entra el bajo. Se mueve la paja, aparecen
//    ojos entre el pajonal, aúllan los lobos del monte; los cuatro se ponen
//    espalda contra el tronco y levantan las armas. La cámara sube: el claro
//    rodeado de ojos.
//  · el primer golpe fuerte (33,85): los muertos salen del pajonal por todos
//    lados y atacan. La pelea va con la canción: Gil (el facón relámpago),
//    Anacleto (la escopeta), Cirilo (el Liquidificador) y Benito (el Camionero)
//    los aguantan; en cada golpe de la canción, uno de ellos lo remata; en el
//    último golpe grande, el rayo del facón barre a los que quedan.
//  · el respiro (56,3): todos muertos. Los cuatro se juntan, jadeando, de
//    espaldas al árbol.
//  · NIGHTMARE (61,5, cuando la canción lo grita): detrás de ellos, detrás del
//    tronco, se levanta el Luisón con la luna atrás. Se dan vuelta despacio,
//    uno por uno. Aúlla. Arranca la pelea (el Luisón de verdad, donde quedó).
// Los cuatro son siempre Gil, Anacleto, Cirilo y Benito (juegue quien juegue).
// Todo se arma de antes (EsterosEgg.prepArrival, con la luz ya en la laguna):
// los muñecos, la horda, el facón y lo que tira el Liquidificador, compilado en
// segundo plano; y la canción ya bajada. Así al dar la luz no se traba nada.
// En línea cada compu la ve con sus propios muñecos; la saltea el anfitrión.

export const SONG = 'jefe-esteros';
// Los momentos de la canción (segundos), medidos sobre el mp3.
export const AT = {
  hush: 10.45,
  calm: 11.7,
  gather: 16.8,
  wolves: 22.1,
  rise: 24.6,
  crane: 28.5,
  boom: 33.85,
  hits: [36.75, 39.5, 40.75, 41.25, 42.0, 42.75, 43.5, 44.25],
  riff: 44.75,
  big: 49.3,
  big2: 50.3,
  last: 54.8,
  quiet: 56.3,
  nightmare: 61.5,
  turn: 62.9,
  howl: 64.6,
  leap: 67.5,
  end: 68.55,
};
// lo que dura el salto de la loma al claro (cae justo al terminar)
const LEAP = AT.end - AT.leap - 0.1;
// la subida: arranca CLIMB_NM antes del grito y dura CLIMB_T (después se
// para arriba); sube caminando parejo la cuesta de atrás de la loma desde
// CLIMB_FROM metros, donde no asoma nada (medido desde la toma: tapado del todo
// desde los 5 m); asoma la cabeza de a poco y con el grito se le prenden los ojos
const CLIMB_NM = 3.2;
const CLIMB_T = 4.7;
const CLIMB_FROM = 8.5;
// los lobos del monte (audio.wolves): [cuándo, cuál, paneo]
const WOLVES = [
  [22.2, 0, -0.55],
  [24.6, 1, 0.6],
  [26.4, 2, -0.2],
  [28.5, 3, 0.35],
];

// Los cuatro. off: de qué lado del tronco pelean (grados desde el lado seco,
// el contrario a la luna: del lado de la luna, al pie del árbol, hay un charco);
// lp: dónde se paran al final, de costado en la fila (de espaldas a la loma).
const CREW = [
  { key: 'gil', id: 900, name: 'Antonio Gil', color: 0xb01c14, weapon: 'facon', off: -58, lp: 0.3 },
  { key: 'anacleto', id: 901, name: 'Anacleto', color: 0x3a6a2a, weapon: 'lata', off: 32, lp: 1.9 },
  { key: 'cirilo', id: 902, name: 'Cirilo', color: 0x2a3a7a, weapon: 'liquidificador', off: -102, lp: -0.5 },
  { key: 'benito', id: 903, name: 'Benito', color: 0x7a5a2a, weapon: 'camionero', off: -12, lp: 1.1 },
];
const WHO = { entidad: 'La voz' };
// lo que dice la voz al empezar (EsterosEgg VOZ.luison): se dice de un tirón
// y el nombre sale aparte, grande
const VOZ_A = 'Sí... Ahora queda una sola cosa. Algo viene a cobrarse lo tuyo.';
const VOZ_B = 'El séptimo hijo.';
const POST_R = 1.7;
// la fila del final, a cuánto de la cresta de la loma (en la línea de la luna)
const LINE_D = 11.9;
// y donde cae el Luisón del salto, a cuánto de la fila (adentro del claro)
const LAND_D = 4.4;
// la toma larga del final (de frente a la fila): dónde está la cámara al
// empezar (a), al aullar (b) y al saltar (c), en
// [atrás de la fila, de costado, alto]; adónde mira (entre la fila y la cima,
// look) y el ángulo
const MASTER = { a: [2.95, 0.55, 1.62], b: [2.65, 0.6, 1.5], c: [2.55, 0.62, 1.45], look: 0.3, fov: 55, crane: 0.95 };

// Las poses de Gil con el facón (la mano derecha; ver entities/skeleton.js).
const GIL = {
  rest: { shRp: -0.12, shRr: -0.12, elR: -0.3 },
  guard: { shRp: -0.95, shRr: 0.3, elR: -1.15, shLp: -0.75, shLr: 0.35, elL: -1.25, torsoP: 0.16, hipY: 0.88, knL: 0.3, knR: 0.34 },
  fore0: { torsoY: 0.65, shRp: -1.2, shRr: 1.1, elR: -0.55, torsoP: 0.1 },
  fore1: { torsoY: -0.6, shRp: -1.45, shRr: -0.35, elR: -0.1, torsoP: 0.22 },
  back0: { torsoY: -0.55, shRp: -1.3, shRr: -0.55, elR: -1.7, torsoP: 0.1 },
  back1: { torsoY: 0.6, shRp: -1.4, shRr: 1.15, elR: -0.15, torsoP: 0.2 },
  over0: { shRp: -2.95, shRr: 0.1, elR: -0.9, torsoP: -0.18, headP: 0.05 },
  over1: { shRp: -0.55, shRr: 0.05, elR: -0.08, torsoP: 0.45, headP: 0.2 },
  raise: { shRp: -3.05, shRr: 0.12, elR: -0.05, headP: -0.6, torsoP: -0.14, shLp: -0.45, shLr: 0.6, elL: -0.3 },
};
const SWINGS = ['fore', 'back', 'over'];

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
// (el paso: applyPose/stepPose)
const STEP = {};
const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
// (el yaw de Avatars mira hacia -z con yaw 0: de un punto hacia otro)
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Un valor de cuadros clave [s, ...] en st, en curva suave que pasa por cada
// cuadro sin frenar (Hermite con la pendiente de los vecinos; quieto en las
// puntas).
function keyed(K, st, j) {
  const n = K.length;
  if (st <= K[0][0]) return K[0][j];
  if (st >= K[n - 1][0]) return K[n - 1][j];
  let i = 0;
  while (i < n - 2 && st > K[i + 1][0]) i++;
  const t1 = K[i][0];
  const t2 = K[i + 1][0];
  const d = t2 - t1;
  const slope = (k) => (k <= 0 || k >= n - 1 ? 0 : (K[k + 1][j] - K[k - 1][j]) / (K[k + 1][0] - K[k - 1][0]));
  const u = (st - t1) / d;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * K[i][j] + (u3 - 2 * u2 + u) * d * slope(i) + (-2 * u3 + 3 * u2) * K[i + 1][j] + (u3 - u2) * d * slope(i + 1);
}

// La trepada (de agachado atrás de la cresta a parado arriba): tira una garra
// arriba y la clava en la cresta, después la otra; con el grito asoma la
// cabeza y se iza de los brazos; sube una pata a la cresta, empuja y se para,
// encorvado. Los brazos y la cabeza van en ángulo del mundo (se les descuenta
// el torso). [s, avance (0 atrás de la cresta, 1 arriba), subida, torso,
// cabeza, brazo der. y codo, brazo izq. y codo, abiertos, pierna der. y
// rodilla, pierna izq. y rodilla]
const CLIMB = [
  [0.0, 0, 0, 1.45, 0.1, -0.3, -0.7, -0.3, -0.7, 0.24, -1.55, 2.5, -1.55, 2.5],
  [0.35, 0, 0.05, 1.25, -0.45, -2.85, -0.25, -0.4, -0.7, 0.3, -1.45, 2.3, -1.5, 2.4],
  [0.6, 0.02, 0.09, 1.2, -0.4, -1.7, -0.1, -2.85, -0.25, 0.42, -1.4, 2.25, -1.45, 2.3],
  [0.85, 0.07, 0.14, 1.15, -0.35, -1.65, -0.2, -1.7, -0.1, 0.45, -1.35, 2.2, -1.35, 2.2],
  [1.25, 0.35, 0.5, 1.05, 0.2, -0.5, -0.8, -0.5, -0.8, 0.45, -1.25, 2.0, -1.0, 1.75],
  [1.6, 0.7, 0.8, 0.95, 0.25, -0.8, -0.6, -0.8, -0.6, 0.4, -1.2, 1.6, -0.9, 1.9],
  [CLIMB_T, 1, 1, 0.5, 0.15, -0.25, -0.6, -0.25, -0.6, 0.35, -0.5, 0.8, -0.2, 0.6],
];
function climbPose(P, st, t) {
  const v = (j) => keyed(CLIMB, st, j);
  // (resuella con el esfuerzo)
  const b = Math.sin(t * 5.2) * 0.025;
  const torso = v(3) + b;
  P.rootY = 0;
  P.rootPitch = 0;
  P.rootRoll = 0;
  P.torsoP = torso;
  P.torsoY = Math.sin(t * 1.3) * 0.04;
  P.torsoR = (v(5) - v(7)) * 0.05;
  P.headP = v(4) - torso;
  P.headY = 0;
  P.headR = 0;
  arm(P, 1, v(5) - torso, v(9), v(6));
  arm(P, 0, v(7) - torso, v(9), v(8));
  leg(P, 1, v(10), 0.14, v(11));
  leg(P, 0, v(12), 0.14, v(13));
  ground(P);
  return { f: clamp01(v(1)), rise: v(2) };
}

// La pose de la cresta: recién subido, encorvado, se endereza y abre los
// brazos (se le pasan un poco y vuelven), el pecho afuera y la cabeza arriba;
// al rato baja la mirada hacia ellos y resopla.
function epicPose(P, st, t) {
  const up = smooth(clamp01(st / 0.75));
  const over = Math.sin(clamp01(st / 1.0) * Math.PI) * 0.18;
  const glare = smooth(clamp01((st - 1.2) / 0.7));
  const b = Math.sin(t * 2.4);
  P.rootY = 0;
  P.rootPitch = 0;
  P.rootRoll = 0;
  P.torsoP = lerp(0.5, -0.3, up) - over * 0.5 + glare * 0.28 + b * 0.035 * glare;
  P.torsoY = 0;
  P.torsoR = Math.sin(t * 1.1) * 0.03;
  P.headP = lerp(-0.35, -0.55, up) + glare * 0.7;
  P.headY = 0;
  P.headR = 0;
  const pitch = lerp(-0.75, -0.45, up) - over * 0.3 - glare * 0.3;
  const out = lerp(0.35, 1.25, up) + over - glare * 0.5;
  arm(P, 0, pitch, out, lerp(-0.6, -0.55, up) - glare * 0.25 + b * 0.05);
  arm(P, 1, pitch, out, lerp(-0.6, -0.55, up) - glare * 0.25 - b * 0.05);
  // (las rodillas un poco dobladas: como arranca el aullido, ROAR[0])
  leg(P, 0, lerp(-0.2, -0.5, up), 0.22, lerp(0.6, 0.45, up));
  leg(P, 1, lerp(-0.5, 0.0, up), 0.22, lerp(0.8, 0.4, up));
  ground(P);
}

// El rugido de la cresta (el aullido grabado: resuello 0,95 s, primera
// tirada, respiro a los 2,2 y segunda): cuadros clave que se encadenan sin
// saltos. Con el resuello se arma: se le infla el pecho (echa los hombros
// atrás, los brazos abiertos y las garras cerradas), y se encoge entero,
// temblando, las rodillas dobladas, el hocico contra el pecho y las garras
// juntas abajo, adelante de la panza (de lejos se lo ve bajar); justo
// cuando suena el aullido se suelta de golpe: el lomo para atrás, el hocico a
// la luna y los brazos abiertos. Respira, aúlla más alto y termina agazapado
// mirándolos, listo para saltar.
// [s, torso, cabeza, brazos (adelante), brazos (abiertos), codos, rodillas]
const ROAR = [
  [0.0, -0.02, 0.15, -0.75, 0.75, -0.8, 0.45],
  [0.5, -0.28, -0.35, 0.1, 1.2, -0.9, 0.4],
  [0.8, 0.75, 0.55, -0.5, 0.1, -1.25, 1.3],
  [1.0, -0.42, -1.08, -1.0, 1.42, -0.35, 0.3],
  [1.95, -0.46, -1.2, -1.02, 1.5, -0.32, 0.3],
  [2.2, -0.24, -0.78, -0.88, 1.3, -0.45, 0.4],
  [2.5, -0.52, -1.32, -1.12, 1.58, -0.26, 0.3],
  [2.62, -0.5, -1.28, -1.1, 1.55, -0.28, 0.32],
  [2.9, 0.78, -0.4, -0.95, 0.38, -0.7, 1.3],
];
function roarPose(P, st, t) {
  let i = 0;
  while (i < ROAR.length - 2 && st > ROAR[i + 1][0]) i++;
  const a = ROAR[i];
  const b = ROAR[i + 1];
  const k = smooth(clamp01((st - a[0]) / (b[0] - a[0])));
  const v = (j) => a[j] + (b[j] - a[j]) * k;
  // aullando tiembla entero (menos al tomar aire y al agazaparse); encogido,
  // antes de soltarse, le tiembla todo cada vez más
  const howl = clamp01((st - 1.0) / 0.2) * (1 - clamp01((st - 2.62) / 0.2));
  const coil = clamp01((st - 0.5) / 0.3) * (1 - clamp01((st - 0.92) / 0.08));
  const q = Math.sin(t * 31) * 0.018 * howl + Math.sin(t * 38) * 0.03 * coil;
  const heave = Math.sin(t * 5.5) * 0.03 * howl;
  P.rootY = 0;
  P.rootPitch = 0;
  P.rootRoll = 0;
  P.torsoP = v(1) + heave;
  P.torsoY = Math.sin(t * 0.9) * 0.04;
  P.torsoR = q * 0.5;
  P.headP = v(2) + q;
  P.headY = Math.sin(t * 0.7) * 0.05;
  P.headR = Math.sin(t * 9) * 0.02 * howl;
  arm(P, 0, v(3) + q, v(4) + q * 0.5, v(5));
  arm(P, 1, v(3) - q, v(4) - q * 0.5, v(5));
  leg(P, 0, -0.3 - v(6) * 0.45, 0.22, v(6));
  leg(P, 1, 0.18 - v(6) * 0.4, 0.22, v(6) * 0.9);
  ground(P);
}

// La canción, bajada de antes (la escena arranca con ella: sin esperar la red).
export const prefetchSong = () => prefetchTrack(SONG);

export default class LuisonArrival extends CastleCine {
  constructor(g, egg) {
    super(g, { drive: false, kind: 'esteros' });
    this.egg = egg;
    this.el.classList.add('mdu-fcine--llegada');
    // (el nombre del que viene: ver vozLlegada)
    this.revealEl = document.createElement('p');
    this.revealEl.className = 'mdu-fcine__reveal';
    this.revealEl.innerHTML = `<small>${WHO.entidad}</small><b>${VOZ_B.replace(/\.$/, '')}</b><i></i>`;
    this.el.appendChild(this.revealEl);
    // (armada de antes: escondida hasta que arranca)
    this.el.style.display = 'none';
    this.anims = [];
    this.events = [];
    this.dtNow = 0;
    this.prepare();
    prefetchSong();
  }

  // ---------------- el lugar ----------------
  prepare() {
    const g = this.g;
    const w = g.world;
    const tree = PROPS?.find((o) => o.type === 'algarrobo')?.pos || [EE.hueco[0] + 1.1, EE.hueco[1] - 0.2];
    this.T = new THREE.Vector3(tree[0], w.floorAt(tree[0], tree[1]), tree[1]);
    // la luna: su dirección en el piso (m) y de costado (p); todo se ubica así
    const md = SKY?.moon?.dir || [0.6, 0.31, 0.74];
    const ml = Math.hypot(md[0], md[2]) || 1;
    this.m = { x: md[0] / ml, z: md[2] / ml };
    this.p = { x: this.m.z, z: -this.m.x };
    // hasta dónde llega el claro alrededor del tronco (después, el pajonal)
    this.edge = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      let r = 2.2;
      while (r < 7 && g.zombies.cellKind(this.T.x + Math.cos(a) * r, this.T.z + Math.sin(a) * r) === 0) r += 0.2;
      this.edge.push(Math.min(r, 6.5));
    }
    // la loma del Luisón (world/esterosProps 'loma'), del lado de la luna; la
    // fila de los cuatro al final, en la misma línea (la luna atrás de la loma)
    this.loma = PROPS?.find((o) => o.type === 'loma') || null;
    const lp = this.loma?.pos || [this.T.x + this.m.x * 9, this.T.z + this.m.z * 9];
    this.hill = new THREE.Vector3(lp[0], w.floorAt(lp[0], lp[1]), lp[1]);
    this.hillTop = this.hill.y + (this.loma ? lomaTop(this.loma) : 5.25);
    // (la luna de verdad: el disco está a 260 m del centro del mapa, no en el
    // infinito, así que desde acá se ve un poco corrida de SKY.moon.dir)
    const ms = w.moonSprite?.position;
    const mvx = ms ? ms.x - this.hill.x : this.m.x;
    const mvz = ms ? ms.z - this.hill.z : this.m.z;
    const mvl = Math.hypot(mvx, mvz) || 1;
    this.mv = { x: mvx / mvl, z: mvz / mvl };
    this.pv = { x: this.mv.z, z: -this.mv.x };
    this.moonAt = ms ? ms.clone() : null;
    const mv = this.mv;
    const pv = this.pv;
    this.C = this.at(this.hill.x - mv.x * LINE_D, this.hill.z - mv.z * LINE_D);
    this.lineAt = {};
    for (const c of CREW) {
      const back = c.key === 'gil' ? 0.25 : 0;
      this.lineAt[c.key] = this.at(this.C.x + pv.x * c.lp - mv.x * back, this.C.z + pv.z * c.lp - mv.z * back);
    }
    this.luLand = this.at(this.C.x + mv.x * LAND_D, this.C.z + mv.z * LAND_D);
    this.luAt = this.luLand;
    this.root.visible = false;
    this.buildCrew();
    this.horde = new CineHorde(g, 44);
    this.horde.sinkAfter = 3.5;
    this.horde.root.visible = false;
    this.buildLuison();
    this.buildFx();
    this.buildWarm();
    // lo del hueco: la luz fría del mapa (existe desde el principio: ver cineWarm)
    this.hl = this.egg.cineLight || null;
    // todo compilado ya, en segundo plano (escondido: three lo recorre igual)
    warmScene(g);
  }

  // Un punto del claro: a lo largo de la luna (a) y de costado (b), desde el tronco.
  rel(a, b, up = null) {
    const x = this.T.x + this.m.x * a + this.p.x * b;
    const z = this.T.z + this.m.z * a + this.p.z * b;
    const y = up == null ? this.g.world.floorAt(x, z) : this.T.y + up;
    return new THREE.Vector3(x, y, z);
  }

  at(x, z) {
    return new THREE.Vector3(x, this.g.world.floorAt(x, z), z);
  }

  // El borde del pajonal en la dirección `a` (radianes, del tronco).
  edgeR(a) {
    const n = this.edge.length;
    let i = Math.round(((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * n) % n;
    return this.edge[i];
  }

  // ---------------- los cuatro ----------------
  buildCrew() {
    const g = this.g;
    this.npc = new Avatars(g, null);
    this.npc.root.visible = false;
    this.people = {};
    this.crew = [];
    for (const C of CREW) {
      const ang = Math.atan2(-this.m.z, -this.m.x) + (C.off * Math.PI) / 180;
      const d = { x: Math.cos(ang), z: Math.sin(ang) };
      const post = this.at(this.T.x + d.x * POST_R, this.T.z + d.z * POST_R);
      const r = { id: C.id, name: C.name, noTag: true, pos: post.clone(), yaw: 0, pitch: -0.8, speed: 0, crouch: false, moving: false };
      this.npc.add(r);
      const a = this.npc.list.get(C.id);
      a.M.poncho.color.set(C.color).multiplyScalar(1.7);
      // (el mate de siempre no: cada uno con su arma)
      a.hand.children[0].visible = false;
      if (C.weapon !== 'facon') this.npc.setGun(a, C.weapon, 0, null);
      // (los brillos del arma de la mano, en el mundo y con el resplandor,
      // eran un sol: sin los sprites y con lo que brilla más suave; materiales
      // propios, así el arma de la mano no cambia)
      // (el mate de primera persona viene girado hacia el centro de la
      // pantalla: en la mano del muñeco, derecho hacia donde apunta)
      if (a.gun?.children[0]) a.gun.children[0].rotation.set(0, 0, 0);
      const own = new Map();
      a.gun?.traverse((o) => {
        if (o.isSprite) o.visible = false;
        else if (o.material?.isMeshBasicMaterial) {
          if (!own.has(o.material)) {
            const m = o.material.clone();
            m.color.multiplyScalar(0.35);
            own.set(o.material, m);
          }
          o.material = own.get(o.material);
        }
      });
      (this.gunMats ||= []).push(...own.values());
      const c = { ...C, r, a, pose: { v: {}, want: {}, speed: 6 }, dir: d, postPos: post, cool: rnd(0, 0.4), busy: 0, kick: 0, pump: 0, breath: 0, burst: 0, burstT: 0, aimY: null, moveK: 0, stride: 0, walking: false };
      r.poseFn = (Q) => this.applyPose(c, Q);
      this.people[C.key] = c;
      this.crew.push(c);
    }
    this.buildFacon();
  }

  // El facón relámpago en la mano de Gil (el mismo del potenciador): la hoja
  // sigue al antebrazo, saliendo del puño.
  buildFacon() {
    const gil = this.people.gil.a;
    const f = faconPickup();
    f.scale.setScalar(1.05);
    f.position.set(0, -0.22, 0.02);
    f.rotation.set(Math.PI, 0, 0);
    // (materiales propios: el filo sin tonemapping, a la luna y con el
    // resplandor, era un sol en la mano; y la hoja se enciende sola acá)
    const own = new Map();
    f.traverse((o) => {
      if (!o.material) return;
      if (!own.has(o.material)) {
        const m = o.material.clone();
        if (m.isMeshBasicMaterial) m.color.multiplyScalar(0.4);
        own.set(o.material, m);
      }
      o.material = own.get(o.material);
    });
    this.faconMats = [...own.values()];
    this.bladeMat = this.faconMats.find((m) => m.emissive) || null;
    gil.hand.add(f);
    this.facon = f;
  }

  // La punta del facón, en el mundo.
  faconTip(v = new THREE.Vector3()) {
    this.facon.updateWorldMatrix(true, false);
    return this.facon.localToWorld(v.set(0, 0.36, 0));
  }

  // ---------------- el Luisón ----------------
  // Un títere con el cuerpo de los jefes (Zombies.bossRig), vestido de Luisón.
  // No es el jefe de la partida (g.zombies.boss queda libre: el invitado sigue
  // lo del anfitrión y a la escena no la toca nadie).
  buildLuison() {
    this.lu = {
      boss: true,
      kind: 'luison',
      active: true,
      dead: false,
      P: makePose(),
      mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()),
      pos: new THREE.Vector3(),
      baseY: 0,
      yaw: 0,
      scale: 2.2,
      phase: 0,
      state: 'lurk',
      stateT: 0,
      speedType: 'walk',
      lowK: 1,
      hatHp: 0,
    };
    this.luOn = false;
  }

  // ---------------- lo que se ve ----------------
  buildFx() {
    const g = this.g;
    // fogonazos de las bocas (sprites; las luces de destello son las de fx)
    this.muzzles = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: new THREE.Color(1, 0.7, 0.34).multiplyScalar(1.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      this.root.add(s);
      this.muzzles.push({ s, life: 0 });
    }
    // el tajo del facón: una medialuna azul y blanca a la medida de un hombre
    // (la del potenciador es de 5 m: pensada para la primera persona)
    this.arcs = [];
    const geo = new THREE.RingGeometry(0.85, 1.05, 28, 1, -1.1, 2.2);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.6, 1).multiplyScalar(0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.add(m);
      pivot.visible = false;
      this.root.add(pivot);
      this.arcs.push({ pivot, m, t: 1 });
    }
  }

  // Una medialuna en `center`, hacia fwd; roll: inclinada (el de arriba, casi vertical).
  arc(center, fwd, roll) {
    const a = this.arcs.find((q) => q.t >= 1) || this.arcs[0];
    a.t = 0;
    a.pivot.position.copy(center);
    a.pivot.rotation.set(0, Math.atan2(-fwd.z, fwd.x), roll, 'YXZ');
    a.pivot.visible = true;
  }

  // Lo que tiran el facón y el Liquidificador (la medialuna, la bola, el
  // charco, el anillo) se arma una vez ahora, escondido: si no, el primer tajo
  // o el primer tiro compilaba a mitad de la escena.
  buildWarm() {
    const W = this.g.weapons;
    this.warm = new THREE.Group();
    this.root.add(this.warm);
    const far = new THREE.Vector3(this.T.x, -60, this.T.z);
    try {
      if (W.facon && !W.facon.arcs.length) {
        W.facon.addArc(far, 0, 'fore', WEAPONS.facon.slash.range);
        for (const a of W.facon.arcs) a.m.visible = false;
      }
      const L = W.liq;
      if (L) {
        L.addBolt(far.clone(), new THREE.Vector3(), 0, 1, true, false);
        const b = L.bolts.pop();
        b.mesh.removeFromParent();
        this.warm.add(b.mesh);
        L.addPuddle(far.x, far.y, far.z, 0.8, false, 0);
        const pd = L.puddles.pop();
        pd.m.removeFromParent();
        this.warm.add(pd.m);
      }
    } catch {
      /* si algo no está, se compila cuando aparece */
    }
  }

  // ---------------- poses que se mezclan (como ui/EsterosEnding) ----------------
  pose(key, fields, speed = 6) {
    const S = this.people[key].pose;
    S.speed = speed;
    for (const [f, v] of Object.entries(fields)) {
      if (v === null) delete S.want[f];
      else S.want[f] = v;
    }
  }

  unpose(key, speed = 4) {
    const S = this.people[key].pose;
    S.speed = speed;
    S.want = {};
  }

  // (Avatars: después de la pose de siempre, esta encima; y lo que se suma:
  // el culatazo, la corredera de la escopeta, el jadeo)
  applyPose(c, Q) {
    Q.torsoY = 0;
    Q.headY = 0;
    Q.hipLr = 0;
    Q.hipRr = 0;
    const S = c.pose;
    const k = Math.min(1, this.dtNow * S.speed);
    for (const f of Object.keys(S.v)) {
      const base = Q[f] ?? 0;
      const goal = f in S.want ? S.want[f] : base;
      S.v[f] += (goal - S.v[f]) * k;
      Q[f] = S.v[f];
      if (!(f in S.want) && Math.abs(S.v[f] - base) < 0.005) delete S.v[f];
    }
    for (const f of Object.keys(S.want)) if (!(f in S.v)) S.v[f] = Q[f] ?? 0;
    if (c.moveK > 0.01) this.stepPose(c, Q, c.moveK);
    if (c.kick > 0) {
      const e = Math.sin(Math.min(1, c.kick) * Math.PI * 0.5);
      Q.shRp -= 0.28 * e;
      Q.shLp -= 0.2 * e;
      Q.torsoP -= 0.1 * e;
      Q.headP -= 0.06 * e;
    }
    if (c.pump > 0) {
      const e = Math.sin(c.pump * Math.PI);
      Q.elL += 0.75 * e;
      Q.shLp += 0.3 * e;
    }
    if (c.breath > 0) {
      const b = Math.sin(this.t * 4.6 + c.id) * c.breath;
      Q.torsoP += 0.05 * b;
      Q.shLp += 0.04 * b;
      Q.shRp += 0.04 * b;
      Q.headP += 0.04 * b;
    }
  }

  // El paso de un gaucho (caminando o al trote), mezclado con lo que tenía
  // (k): las piernas por lo que avanzó, la cadera que sube y baja con cada
  // pisada, el torso que se inclina y gira contra las piernas, y los brazos
  // de Gil que bracean (los demás llevan el arma).
  stepPose(c, Q, k) {
    const jog = !!c.jog;
    const ph = ((c.stride || 0) / (jog ? 1.0 : 0.66)) * Math.PI;
    const s = Math.sin(ph);
    const co = Math.cos(ph);
    const W = STEP;
    const amp = jog ? 0.55 : 0.36;
    W.hipLp = s * amp;
    W.hipRp = -s * amp;
    W.hipLr = -0.04;
    W.hipRr = 0.04;
    W.knL = 0.08 + Math.max(0, -co) * (jog ? 1.25 : 0.62);
    W.knR = 0.08 + Math.max(0, co) * (jog ? 1.25 : 0.62);
    ground(W);
    W.hipY += jog ? Math.abs(s) * 0.035 : 0;
    for (const f of ['hipLp', 'hipRp', 'hipLr', 'hipRr', 'knL', 'knR', 'hipY']) Q[f] += (W[f] - (Q[f] ?? 0)) * k;
    Q.torsoP += (jog ? 0.2 : 0.06) * k;
    Q.torsoY -= s * (jog ? 0.14 : 0.07) * k;
    Q.headP -= (jog ? 0.1 : 0.03) * k;
    Q.headY += s * 0.04 * k;
    if (c.key === 'gil') {
      const a = jog ? 0.75 : 0.4;
      Q.shLp += (-s * a - Q.shLp) * k;
      Q.elL += ((jog ? -1.0 : -0.35) - Q.elL) * k;
      Q.shRp += (s * a * 0.6 - 0.3 - Q.shRp) * k;
      Q.elR += ((jog ? -0.9 : -0.35) - Q.elR) * k;
    }
  }

  anim(dur, fn, done) {
    this.anims.push({ t: 0, dur, fn, done });
  }

  face(key, target) {
    const r = this.people[key].r;
    r.yaw = yawTo(r.pos, target);
  }

  turn(key, target, dur = 0.5) {
    const r = this.people[key].r;
    const y0 = r.yaw;
    const y1 = yawTo(r.pos, target);
    this.anim(dur, (k) => (r.yaw = angLerp(y0, y1, smooth(k))));
  }

  // Camina (o trota: jog) por unos puntos (x, z) en `dur`; face: adónde mira
  // al llegar. El paso sale de lo que avanza de verdad (los pies no patinan),
  // arranca y frena de a poco y el cuerpo gira hacia donde va (applyPose).
  walk(key, pts, dur, face = null, jog = false, look = null) {
    const c = this.people[key];
    const r = c.r;
    const path = [r.pos.clone(), ...pts.map((q) => this.at(q.x, q.z))];
    const lens = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const l = path[i].distanceTo(path[i - 1]);
      lens.push(l);
      total += l;
    }
    if (total < 0.05) {
      if (face) this.turn(key, face, 0.6);
      return;
    }
    // (el paso de Avatars es el de los zombies: el de ellos lo arma applyPose)
    r.moving = false;
    r.speed = 0;
    c.walking = true;
    c.jog = jog;
    const prev = new THREE.Vector3();
    this.anim(
      dur,
      (k) => {
        let d = smooth(k) * total;
        let i = 0;
        while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
        const u = lens[i] > 0 ? Math.min(1, d / lens[i]) : 1;
        prev.copy(r.pos);
        r.pos.lerpVectors(path[i], path[i + 1], u);
        r.pos.y = this.g.world.floorAt(r.pos.x, r.pos.z);
        const sx = r.pos.x - prev.x;
        const sz = r.pos.z - prev.z;
        const step = Math.hypot(sx, sz);
        if (look) {
          // mirando a otro lado (retrocede o va de costado, sin darle la espalda)
          r.yaw = angLerp(r.yaw, yawTo(r.pos, look), Math.min(1, this.dtNow * 6));
        } else if (step > 1e-4) r.yaw = angLerp(r.yaw, yawTo(prev, r.pos), Math.min(1, this.dtNow * 6));
        // el paso va para adelante o para atrás según hacia dónde mira
        const fx = -Math.sin(r.yaw);
        const fz = -Math.cos(r.yaw);
        const fwd = sx * fx + sz * fz;
        c.stride = (c.stride || 0) + (Math.abs(fwd) > step * 0.3 ? fwd : step * 0.6);
      },
      () => {
        c.walking = false;
        if (face) this.turn(key, face, 0.7);
      },
    );
  }

  // Apunta (yaw y pitch del arma) a un punto, de a poco.
  aim(c, target, rate = 9) {
    const r = c.r;
    r.yaw = angLerp(r.yaw, yawTo(r.pos, target), Math.min(1, this.dtNow * rate));
    const d = Math.hypot(target.x - r.pos.x, target.z - r.pos.z);
    const want = Math.atan2(target.y - (r.pos.y + 1.4), Math.max(0.5, d));
    r.pitch += (want - r.pitch) * Math.min(1, this.dtNow * rate);
  }

  // De dónde sale el tiro: la mano derecha, adelante del arma.
  muzzle(c, v = new THREE.Vector3()) {
    const r = c.r;
    tmpE.set(Math.max(-1.2, Math.min(1.2, r.pitch)), r.yaw, 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    v.set(0, -0.19, 0).applyMatrix4(c.a.mats[6]);
    return v.add(tmpW.set(0, 0.03, -0.46).applyQuaternion(tmpQ));
  }

  // Habla la voz (solo la oye Gil; los demás no ven nada). La frase va
  // entera en un solo audio: core/voice deja cada frase a la misma altura de
  // pico, y "El séptimo hijo" suelto sonaba más fuerte que lo anterior. Los
  // subtítulos siguen al audio: lo primero mientras lo dice y el nombre,
  // aparte y grande, cuando llega.
  vozLlegada() {
    if (!this.egg.isGil()) return;
    const au = this.g.audio;
    const d = au.say(`${VOZ_A} ${VOZ_B}`, 'entidad', { cine: true }) || (VOZ_A.length + VOZ_B.length) * 0.065;
    const wait = au.sayWait || 0;
    // (dónde empieza el nombre: lo que dura cada parte, en proporción)
    const len = (text) => {
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const { segs, P } = speechPlan(text, 'entidad');
        n += voiceLength(segs, P);
      }
      return n;
    };
    const a = len(VOZ_A);
    const d1 = (d * a) / (a + len(VOZ_B));
    const el = this.textEl;
    this.later(wait, () => {
      el.innerHTML = `<span class="mdu-fcine__who">${WHO.entidad}</span>`;
      el.append(VOZ_A);
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
      this.el.classList.add('is-voz');
    });
    this.later(wait + d1 - 0.35, () => this.quiet());
    this.later(wait + d1 - 0.1, () => this.revealEl.classList.add('is-on'));
    this.later(wait + d + 0.9, () => {
      this.revealEl.classList.remove('is-on');
      this.el.classList.remove('is-voz');
    });
  }

  // ---------------- el guion ----------------
  // Cada cosa en su segundo de la canción: [cuándo, qué].
  on(at, fn) {
    this.events.push([at, fn]);
  }

  build() {
    const g = this.g;
    const T = this.T;
    const P = this.people;
    const Z = g.zombies;
    // la partida queda quieta y limpia: sin muertos ni jefe a la vista
    if (Z.boss) Z.removeBoss();
    for (const z of Z.pool) if (z.active) Z.free(z);
    g.fx.clearAll();
    g.weapons.clearProjectiles?.();
    this.hidAv = g.net?.avatars?.root.visible;
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    this.hidInteract = g.interact.root.visible;
    g.interact.root.visible = false;
    this.root.visible = true;
    this.npc.root.visible = true;
    this.horde.root.visible = true;
    this.el.style.display = '';
    this.played = true;
    // (el brillo del hueco, de cerca, era un sol: la luz ya entró)
    if (this.egg.huecoGlow) this.egg.huecoGlow.visible = false;
    // (solo el anfitrión la saltea: los demás la siguen hasta que él diga)
    if (g.net?.guest) this.el.querySelector('.mdu-cine__skip').style.display = 'none';
    // (las luciérnagas, de cerca de la cámara, eran soles: más suaves)
    const fly = g.world.night?.flyU?.uCol;
    if (fly) {
      this.fly0 = fly.value.clone();
      fly.value.multiplyScalar(0.4);
    }
    // la luna, más fuerte (SKY.moon.light la lee el mundo cada cuadro)
    this.moon0 = SKY?.moon ? SKY.moon.light : null;
    if (SKY?.moon) SKY.moon.light = (this.moon0 ?? 1) * 1.55;
    // el reloj: la canción (el golpe de la horda cae con el golpe de la canción)
    g.music?.play(SONG, { at: 0, loop: true, while: (G) => this.egg.step === 5 && (G.state === 'playing' || G.state === 'paused') });
    this.egg.luisonSong = true;
    this.wait = 0;
    this.t = 0;
    this.stagePeace();
    this.stageTension();
    this.stageFight();
    this.stageNightmare();
    this.events.sort((a, b) => a[0] - b[0]);
    this.ev = 0;
    warmScene(g);
    return [];
  }

  // ---------------- la paz (0-11,7) ----------------
  stagePeace() {
    const P = this.people;
    const H = this.egg.huecoPos || this.rel(-0.3, -0.7, 1.25);
    // Gil recién dejó la luz: la mano en el tronco, frente al hueco; los otros
    // tres, del lado seco (el claro del noroeste)
    const spots = { gil: this.at(EE.hueco[0] - 0.5, EE.hueco[1] + 0.05), anacleto: this.rel(-2.9, 0.9), cirilo: this.rel(-3.9, 0.1), benito: this.rel(-3.6, -0.9) };
    for (const c of this.crew) {
      c.r.pos.copy(spots[c.key]);
      c.r.pitch = -0.85;
    }
    this.face('gil', H);
    P.anacleto.r.yaw = yawTo(P.anacleto.r.pos, this.rel(-4, 5));
    P.cirilo.r.yaw = yawTo(P.cirilo.r.pos, this.rel(-1, 2));
    P.benito.r.yaw = yawTo(P.benito.r.pos, this.rel(-7, -2.5));
    this.pose('gil', { ...GIL.rest, shLp: -1.25, shLr: 0.15, elL: -0.35, headP: 0.1 }, 20);
    for (const k of ['anacleto', 'cirilo', 'benito']) this.pose(k, { headP: 0.05 }, 20);
    this.on(0, () => {
      // entra con blanco: la luz entró al hueco
      this.white(true);
      this.later(0.15, () => this.white(false));
      this.flare = 1;
      // de lejos, por encima del pajonal, bajando al claro: el algarrobo
      // contra la luna y los cuatro al pie
      this.setFov(46);
      const a = this.rel(-6.4, -1.0, 4.6);
      const b = this.rel(-5.0, -0.5, 2.5);
      const la = this.rel(0, 0, 2.2);
      const lb = this.rel(-1.0, -0.3, 1.4);
      this.shot(6.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.lerpVectors(a, b, k);
        // (baja tarde: primero por arriba de la paja, después adentro del claro)
        pos.y = lerp(a.y, b.y, Math.pow(k, 1.7));
        look.lerpVectors(la, lb, k);
      });
    });
    this.on(2.0, () => this.vozLlegada());
    this.on(3.2, () => {
      // Gil saca la mano del tronco
      this.pose('gil', { shLp: null, shLr: null, elL: null, headP: -0.05 }, 2.5);
      this.pose('cirilo', { headP: -0.35 }, 1.6);
    });
    this.on(5.6, () => {
      this.turn('gil', this.rel(-4, -1), 1.6);
      this.pose('anacleto', { headY: 0.7 }, 1.2);
    });
    // de cerca: Gil y atrás los otros, mirando el pajonal
    this.on(6.4, () => {
      this.setFov(38);
      const G = P.gil.r.pos;
      const to = this.rel(-4, -1);
      const f = tmpV.set(to.x - G.x, 0, to.z - G.z).normalize().clone();
      const sd = { x: -f.z, z: f.x };
      const gh = this.head('gil', 1.55);
      const a = gh.clone().add(tmpW.set(f.x * 1.7 + sd.x * 0.55, 0.05, f.z * 1.7 + sd.z * 0.55));
      const b = gh.clone().add(tmpW.set(f.x * 1.45 - sd.x * 0.25, 0.1, f.z * 1.45 - sd.z * 0.25));
      this.glide(5.3, a, b, gh, this.head('benito', 1.5).lerp(gh, 0.35));
    });
    this.on(7.4, () => {
      this.pose('anacleto', { headY: -0.6 }, 1.1);
      this.pose('cirilo', { headP: 0.05, headY: 0.6 }, 1.4);
    });
    this.on(9.2, () => this.pose('benito', { headY: -0.8 }, 2));
    // la cajita se calla: Benito levanta la mano, se quedan quietos
    this.on(AT.hush, () => {
      this.quiet();
      this.pose('benito', { shLp: -2.45, shLr: 0.3, elL: -1.2, headY: -0.3, headP: 0.12 }, 7);
      for (const k of ['gil', 'anacleto', 'cirilo']) this.pose(k, { headY: 0, headP: 0.1 }, 5);
    });
  }

  // ---------------- lo que se acerca (11,7-33,8) ----------------
  // No se los ve: se los oye (gruñidos, el roce de la paja) y se ve moverse el
  // pajonal donde van. Salen recién con el golpe (stageFight).
  stageTension() {
    const g = this.g;
    const P = this.people;
    // lo que anda adentro de la paja (fx/grassPush: hasta cuatro a la vez)
    this.phantoms = [];
    for (let i = 0; i < 9; i++) {
      const a = this.frontAngle(i / 8);
      this.phantoms.push({ a, off: rnd(1.0, 1.5), v: rnd(0.35, 0.7) * (Math.random() < 0.5 ? -1 : 1), pause: rnd(0, 2.5), pos: new THREE.Vector3(), key: {} });
    }
    // el primero: adelante de los tres, al noroeste (lo que oyen primero)
    const want = Math.atan2(this.rel(-3, 3.2).z - this.T.z, this.rel(-3, 3.2).x - this.T.x);
    const hero = this.phantoms[0];
    hero.a = want - 0.35;
    hero.v = 0.45;
    hero.pause = 99;
    hero.off = 0.9;
    this.hero = hero;
    this.phantomPos(hero);
    this.on(AT.calm, () => {
      // la paja se mueve adelante: todos miran para ahí
      this.pose('benito', { shLp: null, shLr: null, elL: null }, 3);
      hero.pause = 0;
      const hp = hero.pos.clone();
      for (const k of ['anacleto', 'cirilo', 'benito', 'gil']) {
        this.pose(k, { headY: null, headP: 0.02 }, 2);
        this.later(rnd(0.1, 0.7), () => this.turn(k, hp, 1.3));
      }
      // desde atrás de ellos, por arriba de las cabezas, hacia el borde (la
      // paja que se mueve, nada más)
      const inx = this.T.x - hp.x;
      const inz = this.T.z - hp.z;
      const il = Math.hypot(inx, inz) || 1;
      const from = hp.clone().add(tmpV.set((inx / il) * 6.2 - (inz / il) * 1.4, 0, (inz / il) * 6.2 + (inx / il) * 1.4));
      this.setFov(40);
      this.glide(AT.gather - AT.calm, from.clone().setY(this.T.y + 2.35), from.clone().lerp(hp, 0.15).setY(this.T.y + 2.2), hp.clone().setY(hp.y + 1.1), hp.clone().setY(hp.y + 1.0));
    });
    this.on(12.9, () => g.audio.growl(hero.pos.clone().setY(hero.pos.y + 1.2), 'idle'));
    this.on(14.9, () => {
      // se queda quieto... y un gruñido de otro lado
      hero.pause = 2.5;
      const o = this.phantoms[4];
      g.audio.growl(this.phantomPos(o).clone().setY(o.pos.y + 1.3), 'idle');
      this.pose('cirilo', { headY: 0.6 }, 4);
    });
    // a sus puestos, al trote: espalda contra el tronco, las armas arriba
    this.on(AT.gather, () => {
      // Gil señala el árbol
      this.pose('gil', { shLp: -1.75, shLr: 0.45, elL: -0.1, headY: 0.3 }, 7);
      this.later(0.55, () => this.pose('gil', { shLp: null, shLr: null, elL: null, headY: null }, 5));
      for (const c of this.crew) {
        const pts = this.pathTo(c.r.pos, c.postPos);
        const out = c.postPos.clone().add(tmpV.set(c.dir.x * 4, 0, c.dir.z * 4));
        const go = c.key === 'gil' ? 0.45 : rnd(0.25, 0.6);
        this.later(go, () => {
          if (c.key !== 'gil') {
            this.pose(c.key, { headP: null, headY: null }, 3);
            c.r.pitch = -0.45;
          }
          // de espaldas al árbol, mirando el pasto: retroceden hasta el tronco
          const d = Math.hypot(c.postPos.x - c.r.pos.x, c.postPos.z - c.r.pos.z);
          this.walk(c.key, pts, Math.max(1.0, d / 1.5), out, false, out);
        });
        this.later(go + 2.1, () => {
          if (c.key === 'gil') this.pose('gil', GIL.guard, 3);
          c.aimY = 0;
        });
      }
      // dando la vuelta, abajo de las ramas, del lado seco
      this.setFov(44);
      this.orbit(AT.wolves - AT.gather, 4.1, 3.7, 1.9, 2.4, Math.PI - 1.2, Math.PI + 0.7, 1.2);
    });
    this.on(19.4, () => g.audio.growl(this.phantoms[3].pos.clone().setY(this.T.y + 1.2), 'idle'));
    // los lobos del monte
    for (const [at, i, pan] of WOLVES) this.on(at, () => g.audio.wolves?.(i, { pan }));
    this.on(AT.wolves, () => {
      // Cirilo oye los lobos
      const c = P.cirilo;
      this.pose('cirilo', { headY: null }, 3);
      this.setFov(34);
      const hd = this.head('cirilo', 1.6);
      const cam = hd.clone().add(tmpV.set(c.dir.x * 1.5 - c.dir.z * 0.5, -0.12, c.dir.z * 1.5 + c.dir.x * 0.5));
      this.glide(AT.rise - AT.wolves, cam, cam.clone().add(tmpV.set(c.dir.x * -0.25, 0, c.dir.z * -0.25)), hd, hd);
      this.later(0.4, () => this.pose('cirilo', { headY: 0.5 }, 3));
      this.later(1.5, () => this.pose('cirilo', { headY: -0.35 }, 2));
    });
    // el pajonal se mueve por todos lados
    this.on(AT.rise, () => {
      const c = P.benito;
      this.pose('cirilo', { headY: null }, 2);
      for (const q of this.phantoms) {
        q.pause = Math.min(q.pause, rnd(0, 0.8));
        q.v *= 1.3;
      }
      this.setFov(42);
      const sh = c.r.pos.clone().add(tmpV.set(-c.dir.x * 0.55 + c.dir.z * 0.35, 2.45, -c.dir.z * 0.55 - c.dir.x * 0.35));
      const far = c.r.pos.clone().add(tmpV.set(c.dir.x * 5.5 - c.dir.z * 1.2, 1.3, c.dir.z * 5.5 + c.dir.x * 1.2));
      this.glide(26.4 - AT.rise, sh, sh.clone().add(tmpV.set(c.dir.x * 0.25, -0.1, c.dir.z * 0.25)), far, far.clone().add(tmpV.set(c.dir.z * 2.4, 0, -c.dir.x * 2.4)));
    });
    for (const at of [25.3, 26.2, 27.4, 28.9, 30.1, 30.9, 31.6, 32.4, 33.0, 33.4]) {
      this.on(at, () => {
        const q = this.phantoms[Math.floor(Math.random() * this.phantoms.length)];
        g.audio.growl(q.pos.clone().setY(q.pos.y + 1.4), Math.random() < 0.35 ? 'attack' : 'idle');
      });
    }
    this.on(26.4, () => {
      // Gil aprieta el facón (chisporrotea)
      const G = P.gil;
      this.setFov(32);
      const b = G.postPos;
      const cam = b.clone().add(tmpW.set(G.dir.x * 1.05 - G.dir.z * 0.55, 0.95, G.dir.z * 1.05 + G.dir.x * 0.55));
      const hand = b.clone().add(tmpV.set(G.dir.x * 0.25, 1.2, G.dir.z * 0.25));
      this.glide(AT.crane - 26.4, cam, cam.clone().add(tmpW.set(-G.dir.x * 0.2, 0.05, -G.dir.z * 0.2)), hand, b.clone().setY(b.y + 1.55));
      this.later(0.5, () => this.spark(1));
      this.later(1.3, () => this.spark(1.3));
    });
    // la cámara se va para atrás y arriba: los cuatro contra el tronco y la
    // paja que se mueve alrededor, cada vez más cerca
    this.on(AT.crane, () => {
      for (const q of this.phantoms) {
        q.pause = 0;
        q.near = true;
      }
      this.setFov(46);
      const a = this.rel(-3.7, -0.3, 2.3);
      const b = this.rel(-6.2, -0.4, 4.4);
      this.shot(AT.boom - AT.crane, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.lerpVectors(a, b, k);
        look.set(this.T.x, this.T.y + lerp(1.4, 1.0, k), this.T.z);
      });
    });
  }

  // Un ángulo del frente (del lado seco, donde miran los cuatro: los muertos
  // no llegan por atrás del árbol), de 0 a 1 de una punta a la otra.
  frontAngle(u) {
    const base = Math.atan2(-this.m.z, -this.m.x);
    return base + ((-135 + 200 * u) * Math.PI) / 180 + rnd(-0.08, 0.08);
  }

  // Dónde anda uno de los de la paja (en su ángulo, adentro del borde).
  phantomPos(q) {
    const r = this.edgeR(q.a) + (q.near ? Math.max(0.35, q.off - 0.6) : q.off);
    const x = this.T.x + Math.cos(q.a) * r;
    const z = this.T.z + Math.sin(q.a) * r;
    return q.pos.set(x, this.g.world.floorAt(x, z), z);
  }

  // Los de la paja: caminan, se paran, siguen. Los que se mueven y están a la
  // vista abren el pasto (con su roce).
  updatePhantoms(dt, t) {
    EXTRA_PUSH.length = 0;
    if (!this.phantoms || t >= AT.boom) return;
    const cam = this.g.camera.position;
    const moving = [];
    for (const q of this.phantoms) {
      if (q.pause > 0) q.pause -= dt;
      else {
        const r = this.edgeR(q.a) + q.off;
        q.a += (q.v * dt) / r;
        if (Math.random() < dt * 0.35) q.pause = rnd(0.4, 1.8);
      }
      this.phantomPos(q);
      if (q.pause <= 0) moving.push(q);
    }
    // (no se ven ni se mueve el pasto: solo se los oye; ver stageTension)
    void cam;
  }

  // Un camino alrededor del tronco (sin atravesarlo).
  pathTo(from, to) {
    const T = this.T;
    const a0 = Math.atan2(from.z - T.z, from.x - T.x);
    const a1 = Math.atan2(to.z - T.z, to.x - T.x);
    const d = angDiff(a0, a1);
    const pts = [];
    if (Math.abs(d) > 1.2) {
      const r = Math.max(2.3, Math.min(Math.hypot(from.x - T.x, from.z - T.z), 3));
      const am = a0 + d / 2;
      pts.push({ x: T.x + Math.cos(am) * r, z: T.z + Math.sin(am) * r });
    }
    pts.push({ x: to.x, z: to.z });
    return pts;
  }

  // ---------------- la horda (33,85-56,3) ----------------
  stageFight() {
    const g = this.g;
    const P = this.people;
    this.on(AT.boom, () => {
      this.fighting = true;
      this.spawnT = 0.3;
      g.fx.addShake(0.5);
      g.post?.flash?.(0.18);
      // salen de la paja por todos lados, de golpe (donde se movía el pasto y más)
      for (const q of this.phantoms || []) this.later(rnd(0, 0.15), () => this.burst(q.a, q.off));
      for (let i = 0; i < 12; i++) this.later(rnd(0, 0.3), () => this.burst(this.frontAngle(i / 11), rnd(0.9, 1.4)));
      for (let i = 0; i < 8; i++) this.later(0.35 + i * 0.1, () => this.spawnRunner());
      for (let i = 0; i < 6; i++) {
        const q = this.phantoms?.[i];
        if (q) this.later(rnd(0, 0.4), () => g.audio.growl(q.pos.clone().setY(q.pos.y + 1.5), 'scream'));
      }
      // de afuera, por encima de la paja: salen por todos lados
      this.setFov(50);
      this.glide(AT.hits[0] - AT.boom, this.rel(-5.1, 1.9, 3.3), this.rel(-4.6, 2.3, 2.7), this.rel(0, 0, 0.9), this.rel(-0.5, 0, 1.1));
    });
    // los golpes de la canción: cada uno lo remata alguien
    const [h0, h1, ...st] = AT.hits;
    this.on(h0 - 0.45, () => this.forceTargets('gil', 5));
    this.on(h0, () => {
      this.ots('gil', h1 - h0, 40);
      this.lightning(P.gil, 5);
    });
    this.on(h1 - 0.8, () => this.spawnRunner('anacleto', 5.2));
    this.on(h1 - 0.05, () => {
      this.ots('anacleto', 1.3, 38, -1, 1.2);
      this.heroShot(P.anacleto);
    });
    const who = ['benito', 'cirilo', 'gil', 'anacleto', 'benito', 'gil'];
    st.forEach((at, i) => {
      const k = who[i];
      // (que ya venga uno: el golpe cae con la canción)
      this.on(at - 0.75, () => this.spawnRunner(k, 5.2));
      this.on(at - 0.05, () => {
        this.ots(k, (st[i + 1] ?? AT.riff) - at + 0.05, 40 + (i % 3) * 3, i % 2 ? 1 : -1, i % 2 ? 1.78 : 1.3);
        this.heroShot(P[k]);
      });
    });
    // la pelea entera, abajo de las ramas, dando la vuelta
    this.on(AT.riff, () => {
      this.setFov(52);
      this.orbit(AT.big - AT.riff, 3.9, 3.6, 2.2, 2.0, Math.PI - 1.3, Math.PI + 0.9, 1.1);
    });
    // la ola grande: el Liquidificador de Cirilo y el rayo de Gil
    this.on(AT.big - 0.5, () => {
      for (let i = 0; i < 8; i++) this.later(i * 0.05, () => this.spawnRunner(i < 4 ? 'cirilo' : null, 4.8));
    });
    this.on(AT.big, () => {
      this.ots('cirilo', AT.big2 - AT.big + 0.4, 44, 1, 1.5);
      this.heroShot(P.cirilo);
    });
    this.on(AT.big2, () => {
      this.forceTargets('gil', 4);
      this.lightning(P.gil, 5);
    });
    this.on(AT.big2 + 0.4, () => {
      // de abajo, dando la vuelta al revés, entre los muertos que llegan
      this.setFov(58);
      this.inner(AT.last - AT.big2 - 0.75, Math.PI + 1.3, Math.PI - 1.1);
    });
    // el último golpe grande: Gil levanta el facón y el rayo barre a todos
    this.on(AT.last - 0.9, () => {
      this.spawning = false;
      for (let i = 0; i < 5; i++) this.later(i * 0.06, () => this.spawnRunner(null, 4.6));
    });
    this.on(AT.last - 0.35, () => {
      const G = P.gil;
      G.busy = 2;
      this.pose('gil', GIL.raise, 7);
      this.setFov(54);
      const base = G.r.pos.clone();
      const sd = { x: -G.dir.z, z: G.dir.x };
      // (de al lado, bajo y pegado al tronco: el facón contra el cielo)
      const cam = base.clone().add(tmpV.set(-G.dir.x * 0.3 + sd.x * 1.0, 0.95, -G.dir.z * 0.3 + sd.z * 1.0));
      const up = base.clone().add(tmpV.set(G.dir.x * 0.4, 2.3, G.dir.z * 0.4));
      this.glide(AT.quiet - AT.last + 0.35, cam, cam.clone().add(tmpV.set(sd.x * 0.3, -0.15, sd.z * 0.3)), up.clone().setY(up.y - 0.4), up.clone().setY(up.y - 0.8));
    });
    this.on(AT.last + 0.05, () => this.lightning(P.gil, 40, true));
    this.on(AT.last + 1.4, () => {
      for (const p of this.horde.alive) if (p.state !== 'lurk') this.horde.zap(p, tmpV.set(p.pos.x - this.T.x, 0, p.pos.z - this.T.z).normalize());
    });
    this.on(AT.quiet, () => {
      this.fighting = false;
      for (const p of this.horde.alive) this.horde.zap(p, tmpV.set(p.pos.x - this.T.x, 0, p.pos.z - this.T.z).normalize());
    });
  }

  // ---------------- NIGHTMARE (56,3-68,4) ----------------
  // Terminada la horda, los cuatro se alejan del árbol y se paran a respirar,
  // de espaldas a la loma. Con el grito de la canción, arriba de la loma y con
  // la luna llena atrás, se para el Luisón: trepa la cresta y abre los brazos.
  // Se dan vuelta despacio. Aúlla. Salta al claro y arranca la pelea (lejos de
  // ellos: el de verdad espera un momento antes de atacar; EsterosEgg).
  stageNightmare() {
    const g = this.g;
    const L = this.lu;
    const C = this.C;
    const m = this.mv;
    // la toma larga (master): de frente a los cuatro, con la loma y la luna
    // arriba de ellos, del respiro hasta que cae el Luisón, sin cortes: se lo
    // ve trepar, pararse y aullar, y a ellos oírlo y darse vuelta; el salto
    // sigue en la misma toma.
    // (en la línea de la luna y a 14-14,6 m de la cresta: de ahí la rama del
    // algarrobo queda arriba, sin taparlo)
    const camAt = ([back, side, h]) => this.at(C.x - m.x * back + this.pv.x * side, C.z - m.z * back + this.pv.z * side).add(tmpV.set(0, h, 0));
    const camA = camAt(MASTER.a);
    const camB = camAt(MASTER.b);
    const camC = camAt(MASTER.c);
    const lookAt = (lb) => new THREE.Vector3(C.x, C.y + 1.3, C.z).lerp(this.luTop.clone().setY(this.luTop.y + 2.5), lb);
    let lookA = null;
    let lookB = null;
    let lookC = null;
    // (se acerca despacio hasta el aullido y después un poco más hasta el salto)
    const MID = AT.howl - 0.05;
    const master = (t, pos, look) => {
      if (!lookA) {
        lookA = lookAt(MASTER.look - 0.03);
        lookB = lookAt(MASTER.look);
        lookC = lookAt(MASTER.look + 0.02);
      }
      if (t < MID) {
        const k = smooth(clamp01((t - AT.quiet) / (MID - AT.quiet)));
        pos.lerpVectors(camA, camB, k);
        look.lerpVectors(lookA, lookB, k);
        return;
      }
      const k = smooth(clamp01((t - MID) / (AT.leap - MID)));
      pos.lerpVectors(camB, camC, k);
      look.lerpVectors(lookB, lookC, k);
    };
    this.on(AT.quiet, () => {
      // se alejan del árbol, cansados, y se paran de espaldas a la loma
      for (const c of this.crew) {
        c.aimY = null;
        c.breath = 1;
        const to = this.lineAt[c.key];
        const away = to.clone().add(tmpV.set(-m.x * 6, 0, -m.z * 6));
        this.later(rnd(0.05, 0.4), () => {
          c.r.pitch = -0.85;
          if (c.key === 'gil') this.pose('gil', { ...GIL.rest, torsoP: 0.22, headP: 0.25 }, 2);
          else this.pose(c.key, { torsoP: 0.2, headP: 0.2 }, 2);
          const d = Math.hypot(to.x - c.r.pos.x, to.z - c.r.pos.z);
          this.walk(c.key, [{ x: to.x, z: to.z }], Math.max(1.6, d / 1.35), away);
        });
      }
      // (el cuerpo de los jefes, vestido de Luisón; escondido atrás de la
      // cresta, agachado; los ojos apagados hasta el grito)
      g.zombies.dressBoss('luison');
      this.eye0 = g.zombies.bossRig.eyeMat.color.clone();
      g.zombies.bossRig.eyeMat.color.setRGB(0, 0, 0);
      this.luFrom = this.hillAt(CLIMB_FROM, 0.15);
      this.luTop = this.hillAt(0, 0);
      L.pos.copy(this.luFrom);
      L.baseY = this.luFrom.y;
      L.yaw = Math.atan2(C.x - L.pos.x, C.z - L.pos.z);
      L.state = 'hide';
      L.stateT = 0;
      this.luOn = true;
      this.setFov(MASTER.fov);
      // (al saltar, la mirada lo sigue y la cámara sube: que se lo vea caer
      // por arriba de los sombreros)
      const lf = new THREE.Vector3();
      this.shot(AT.end + 0.2 - AT.quiet, (u, lt, pos, look) => {
        const t = AT.quiet + lt;
        master(t, pos, look);
        pos.y += MASTER.crane * smooth(clamp01((t - AT.leap) / 0.9));
        const f = smooth(clamp01((t - AT.leap) / 0.45));
        // (a medias: los cuatro no se van de cuadro mientras él vuela)
        if (f > 0) look.lerp(lf.set(L.pos.x, L.baseY + 1.5, L.pos.z).lerp(tmpW.set(C.x, C.y + 1.2, C.z), 0.2), f * 0.6);
      });
    });
    this.on(58.4, () => {
      for (const c of this.crew) this.pose(c.key, { torsoP: 0.08, headP: 0.02 }, 1.5);
      this.pose('gil', { headY: 0.35 }, 1.2);
    });
    this.on(59.7, () => {
      this.pose('anacleto', { shLp: -1.9, elL: -2.2, headP: 0.3 }, 3);
      this.later(1.2, () => this.pose('anacleto', { shLp: null, elL: null, headP: 0.02 }, 2.5));
      this.pose('gil', { headY: null }, 1.5);
    });
    // el grito de la canción: asoman las garras por la cresta, y con el grito
    // la cabeza (se le prenden los ojos); trepa y se para arriba, contra la
    // luna, y abre los brazos
    this.on(AT.nightmare - CLIMB_NM, () => {
      L.state = 'climb';
      L.stateT = 0;
      // (lo que dura: el cuerpo de verdad acomoda los últimos pasos para plantarse arriba)
      L.climbDur = CLIMB_T;
    });
    this.on(AT.nightmare - CLIMB_NM + CLIMB_T, () => {
      L.state = 'pose';
      L.stateT = 0;
    });
    // no saben que está: lo oyen recién cuando aúlla (el aullido grabado
    // arranca a los 0,95 s del resuello) y se dan vuelta, uno por uno (hear)
    const HEARD = AT.howl + 0.95;
    this.on(HEARD, () => {
      ['benito', 'anacleto', 'cirilo', 'gil'].forEach((k, i) => this.later(0.12 + i * 0.22, () => this.hear(k, k === 'gil' ? 1.5 : 1.2 + i * 0.05)));
    });
    // aúlla a la luna
    this.on(AT.howl, () => {
      L.state = 'howl';
      L.stateT = 0;
      // (cuándo salta, desde el aullido: antes se agacha)
      L.leapIn = AT.leap - AT.howl;
      g.audio.luisonHowl?.(this.luTop.clone().setY(this.luTop.y + 3.5), { prep: true });
    });
    this.on(AT.howl + 1.1, () => this.vaho());
    // salta de la loma al claro
    this.on(AT.leap, () => {
      L.state = 'leap';
      L.stateT = 0;
      g.audio.growl(this.luTop.clone().setY(this.luTop.y + 2.5), 'boss');
    });
  }

  // Lo oye (de espaldas a él): se sobresalta, la cabeza va primero hacia el
  // aullido y atrás el cuerpo, media vuelta despacio (cada uno para su lado
  // de la fila); queda mirándolo y los otros tres lo apuntan.
  hear(k, dur) {
    const c = this.people[k];
    const r = c.r;
    c.breath = 0.35;
    const y0 = r.yaw;
    let d = angDiff(y0, yawTo(r.pos, this.luTop));
    const side = c.lp >= 0.8 ? 1 : -1;
    if (Math.sign(d) !== side && Math.abs(d) > 2.3) d += side * Math.PI * 2;
    this.pose(k, { torsoP: -0.1, headP: -0.12, headY: 0.9 * Math.sign(d) }, 9);
    this.later(0.28, () => {
      this.anim(
        dur,
        (u) => (r.yaw = y0 + d * smooth(u)),
        () => {
          c.follow = true;
          if (k !== 'gil') c.aimY = 2.4;
        },
      );
      this.pose(k, k === 'gil' ? { ...GIL.guard, headY: null, headP: -0.35, torsoP: -0.05 } : { headY: null, headP: -0.4, torsoP: -0.06 }, 2.4);
    });
  }

  // ¿Está en el camino de la mirada a la loma? (ahí el monte no tiene
  // árboles: world/esterosDecor)
  clearView(x, z) {
    if (!this.loma) return false;
    const dx = x - this.hill.x;
    const dz = z - this.hill.z;
    const along = dx * this.m.x + dz * this.m.z;
    const side = Math.abs(dx * this.m.z - dz * this.m.x);
    return along > -13 && along < 16 && side < 4 + Math.max(0, along) * 0.3;
  }

  // Un punto de la loma: a lo largo de la luna (a) y de costado (b) desde la
  // cresta, a la altura del pasto de la loma.
  hillAt(a, b) {
    const x = this.hill.x + this.mv.x * a + this.pv.x * b;
    const z = this.hill.z + this.mv.z * a + this.pv.z * b;
    return new THREE.Vector3(x, this.hillY(x, z), z);
  }

  // La altura de la loma en (x, z): arriba de la losa de la cresta, o el pasto.
  // (la losa, plana arriba y con los bordes en bajada: que suba sin escalón)
  hillY(x, z) {
    if (!this.loma) return this.hillTop;
    const dx = x - this.hill.x;
    const dz = z - this.hill.z;
    const ground = this.hill.y + Math.max(lomaY(this.loma, dx, dz), -0.2);
    return Math.max(ground, this.hillTop - Math.max(0, Math.hypot(dx / 1.0, dz / 0.8) - 0.7) * 0.75);
  }

  // ---------------- la pelea ----------------
  // Un muerto que estaba entre la paja se larga contra el que tiene enfrente.
  charge(p) {
    if (!p.active || p.dead) return;
    const c = this.sectorOf(p.ang ?? Math.atan2(p.pos.z - this.T.z, p.pos.x - this.T.x));
    p.gaucho = c.key;
    p.hp = c.key === 'benito' ? 3 + Math.floor(Math.random() * 2) : 1;
    p.face = null;
    p.crouch = 0;
    const side = rnd(-0.6, 0.6);
    this.horde.run(p, c.postPos.x + c.dir.x * 0.85 - c.dir.z * side, c.postPos.z + c.dir.z * 0.85 + c.dir.x * side, Math.random() < 0.25 ? rnd(4.4, 5.2) : rnd(2.6, 3.8));
    p.face = Math.atan2(c.r.pos.x - p.to.x, c.r.pos.z - p.to.z);
    this.grass(p);
  }

  // El gaucho que cuida ese lado.
  sectorOf(a) {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let best = this.crew[0];
    let bd = -2;
    for (const c of this.crew) {
      const d = c.dir.x * dx + c.dir.z * dz;
      if (d > bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // Uno que sale de la paja en el ángulo `a` (off: qué tan adentro estaba).
  burst(a, off) {
    const r = this.edgeR(a) + off;
    const x = this.T.x + Math.cos(a) * r;
    const z = this.T.z + Math.sin(a) * r;
    const p = this.horde.spawn(x, z, Math.atan2(this.T.x - x, this.T.z - z), { state: 'lurk' });
    if (!p) return;
    p.ang = a;
    this.charge(p);
  }

  // Uno nuevo que sale del pajonal (hacia `key`, o hacia el lado con menos).
  spawnRunner(key = null, speed = null) {
    let c = key ? this.people[key] : null;
    if (!c) {
      const n = {};
      for (const q of this.crew) n[q.key] = 0;
      for (const p of this.horde.alive) if (p.gaucho) n[p.gaucho]++;
      c = this.crew.reduce((b, q) => (n[q.key] < n[b.key] ? q : b), this.crew[Math.floor(Math.random() * 4)]);
    }
    const base = Math.atan2(c.dir.z, c.dir.x);
    const a = base + rnd(-0.65, 0.65);
    const r = this.edgeR(a) + rnd(0.9, 1.6);
    const x = this.T.x + Math.cos(a) * r;
    const z = this.T.z + Math.sin(a) * r;
    const p = this.horde.spawn(x, z, Math.atan2(this.T.x - x, this.T.z - z), { state: 'lurk' });
    if (!p) return null;
    p.ang = a;
    this.charge(p);
    if (speed) p.speed = speed;
    if (Math.random() < 0.35) this.g.audio.growl(p.pos.clone().setY(p.pos.y + 1.5), Math.random() < 0.5 ? 'scream' : 'attack');
    return p;
  }

  // La paja se abre donde sale (fx/grassPush: hasta cuatro a la vez) y,
  // cuando salió, se vuelve a cerrar de a poco (no de golpe).
  grass(p) {
    this.pushers ||= [];
    if (this.pushers.length >= 4) return;
    this.pushers.push({ p, r: 0, out: false, t: 0, x: p.pos.x, y: p.baseY, z: p.pos.z });
  }

  // Los que vienen hacia él: el más cercano primero.
  targetOf(c) {
    let best = null;
    let bd = Infinity;
    for (const p of this.horde.alive) {
      if (p.gaucho !== c.key || p.state === 'lurk' || p.claimed) continue;
      const d = Math.hypot(p.pos.x - c.r.pos.x, p.pos.z - c.r.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { p: best, d: bd } : null;
  }

  chest(p, v = new THREE.Vector3()) {
    return v.set(p.pos.x, p.baseY + 1.25 * (p.scale || 1), p.pos.z);
  }

  // Cada cuadro de la pelea: cada uno apunta al que viene y le tira.
  fight(dt) {
    const g = this.g;
    if (this.fighting && this.spawning !== false && this.t < AT.last - 0.9) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = rnd(0.09, 0.15);
        if (this.horde.alive.length < 30) this.spawnRunner();
      }
    }
    for (const c of this.crew) {
      c.cool -= dt;
      c.busy -= dt;
      c.kick = Math.max(0, c.kick - dt * 7);
      if (c.pump > 0) c.pump = Math.max(0, c.pump - dt * 2.6);
      // la ráfaga del Camionero
      if (c.burst > 0) {
        c.burstT -= dt;
        if (c.burstT <= 0) {
          c.burstT = 0.08;
          c.burst--;
          const tg = this.targetOf(c);
          if (tg) this.gunShot(c, tg.p);
        }
      }
      if (!this.fighting && c.aimY == null) continue;
      if (!this.fighting) {
        // apuntando al Luisón (o al pajonal, antes de la pelea)
        const L = this.lu;
        if (this.luOn && c.key !== 'gil') this.aim(c, tmpV.set(L.pos.x, L.pos.y + c.aimY, L.pos.z), 2.5);
        else if (!c.walking && c.key !== 'gil') this.aim(c, tmpV.set(c.postPos.x + c.dir.x * 5, c.r.pos.y + 1.2, c.postPos.z + c.dir.z * 5), 3);
        continue;
      }
      const tg = this.targetOf(c);
      if (!tg) {
        if (!c.walking && c.busy <= 0) this.aim(c, tmpV.set(c.postPos.x + c.dir.x * 5, c.r.pos.y + 1.25, c.postPos.z + c.dir.z * 5), 5);
        continue;
      }
      const p = tg.p;
      const aimAt = this.chest(p, tmpV);
      if (c.busy <= 0) this.aim(c, aimAt, c.key === 'gil' ? 8 : 11);
      const err = Math.abs(angDiff(c.r.yaw, yawTo(c.r.pos, aimAt)));
      if (c.busy > 0 || c.cool > 0 || err > 0.3) continue;
      if (c.weapon === 'facon') {
        if (tg.d < 2.2) this.slash(c);
      } else if (tg.d < 3.6) {
        if (c.weapon === 'lata') this.blast(c, p);
        else if (c.weapon === 'camionero') {
          c.burst = 3 + Math.floor(Math.random() * 3);
          c.burstT = 0;
          c.cool = 0.85;
        } else this.pava(c, p);
      }
    }
    // el que llegó y pega: el gaucho retrocede un poco del zarpazo
    for (const p of this.horde.alive) {
      if (p.state === 'attack' && p.st > 0.8) {
        const c = this.people[p.gaucho];
        if (c && c.busy <= 0) {
          c.cool = 0;
          if (c.weapon === 'facon') this.slash(c);
          else this.gunShot(c, p, true);
        }
      }
    }
  }

  // Remata: un tiro de cerca (lo que pasa en cada golpe de la canción).
  heroShot(c) {
    const tg = this.targetOf(c) || { p: this.spawnRunner(c.key, 5) };
    if (!tg.p) return;
    const p = tg.p;
    // (si está lejos, lo trae al alcance: el golpe cae con la canción)
    const d = Math.hypot(p.pos.x - c.r.pos.x, p.pos.z - c.r.pos.z);
    if (d > 3.2) {
      const k = 2.6 / d;
      p.pos.set(c.r.pos.x + (p.pos.x - c.r.pos.x) * k, p.pos.y, c.r.pos.z + (p.pos.z - c.r.pos.z) * k);
      p.baseY = this.g.world.floorAt(p.pos.x, p.pos.z);
    }
    c.r.yaw = yawTo(c.r.pos, p.pos);
    c.busy = 0;
    c.cool = 0;
    if (c.weapon === 'facon') this.slash(c, 'over');
    else if (c.weapon === 'lata') this.blast(c, p, true);
    else if (c.weapon === 'camionero') {
      c.burst = 6;
      c.burstT = 0;
      c.cool = 0.6;
    } else this.pava(c, p);
  }

  // Los que va a agarrar el rayo: que vengan de su lado.
  forceTargets(key, n) {
    for (let i = 0; i < n; i++) this.spawnRunner(key, 4.4);
  }

  // ---- los tiros ----
  flashAt(pos, big = 1) {
    const m = this.muzzles.find((q) => q.life <= 0) || this.muzzles[0];
    m.s.position.copy(pos);
    m.s.scale.setScalar(0.24 * big * rnd(0.85, 1.15));
    m.s.material.rotation = Math.random() * Math.PI;
    m.s.visible = true;
    m.life = 0.05;
    this.g.fx.flash(pos, 0xffb860, 9 * big, 0.07, 7);
  }

  // Un tiro (el Camionero; o de urgencia, el que tenga pegado).
  gunShot(c, p, close = false) {
    const g = this.g;
    const mz = this.muzzle(c);
    const hit = this.chest(p, new THREE.Vector3()).add(tmpW.set(rnd(-0.15, 0.15), rnd(-0.1, 0.35), rnd(-0.15, 0.15)));
    g.fx.tracer(mz, hit, 0xffe0a0);
    this.flashAt(mz, c.weapon === 'lata' ? 1.6 : 1);
    g.audio.shot(WEAPONS[c.weapon]?.sound || 'pistol', mz);
    c.kick = 1;
    const dir = tmpW.set(hit.x - mz.x, 0, hit.z - mz.z).normalize().clone();
    g.fx.blood(hit, { x: dir.x, y: 0.2, z: dir.z }, 5, 0.8);
    p.hp = (p.hp ?? 1) - (close ? 9 : 1);
    if (p.hp <= 0) this.horde.kill(p, dir, Math.random() < 0.25 ? 'head' : 'back', 1.2);
    else this.horde.hurt(p, dir);
  }

  // La escopeta: al que tiene enfrente lo vuela, y a los de atrás en el cono.
  blast(c, p, hero = false) {
    const g = this.g;
    const mz = this.muzzle(c);
    const fwd = tmpW.set(p.pos.x - c.r.pos.x, 0, p.pos.z - c.r.pos.z).normalize().clone();
    const d0 = Math.hypot(p.pos.x - c.r.pos.x, p.pos.z - c.r.pos.z);
    for (let i = 0; i < 7; i++) {
      const hit = this.chest(p, new THREE.Vector3()).add(tmpV.set(rnd(-0.5, 0.5), rnd(-0.4, 0.5), rnd(-0.5, 0.5)));
      g.fx.tracer(mz, hit, 0xffd8a0);
    }
    this.flashAt(mz, 1.9);
    g.fx.sparks(mz, 0.6, fwd, [1, 0.7, 0.35]);
    g.audio.shot(WEAPONS.lata.sound, mz);
    c.kick = 1.4;
    c.busy = 0.25;
    c.cool = hero ? 0.8 : 1.25;
    this.later(0.28, () => (c.pump = 1));
    for (const q of this.horde.alive) {
      if (q.state === 'lurk') continue;
      const dx = q.pos.x - c.r.pos.x;
      const dz = q.pos.z - c.r.pos.z;
      const d = Math.hypot(dx, dz);
      if (q !== p && (d > d0 + 1.8 || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.9)) continue;
      const dir = tmpV.set(dx, 0, dz).normalize().clone();
      this.horde.kill(q, dir, 'fly', (hero ? 6 : 4.2) * (q === p ? 1 : 0.7));
    }
    if (hero) g.fx.addShake(0.25);
  }

  // El Liquidificador: la bola de agua hirviendo en arco; donde cae, se derriten.
  pava(c, p) {
    const g = this.g;
    const W = g.weapons;
    const mz = this.muzzle(c);
    const L = weaponStats('liquidificador', 0).liquid;
    const to = p.pos.clone().add(tmpV.set(p.vel.x * 0.1, 0.1, p.vel.z * 0.1));
    const d = to.clone().sub(mz);
    const dist = d.length();
    const vel = d.normalize().multiplyScalar(L.speed);
    vel.y += 0.5 * L.gravity * (dist / L.speed);
    W.liq?.addBolt(mz.clone(), vel, 0, 1, true, false);
    W.liq?.sndFire(mz, 0);
    g.fx.flash(mz, 0xb4ffd8, 6, 0.12, 6);
    c.kick = 0.8;
    c.cool = 1.45;
    c.busy = 0.2;
    p.claimed = true;
    this.later(dist / L.speed + 0.03, () => {
      for (const q of this.horde.alive) {
        if (q.state === 'lurk') continue;
        if (Math.hypot(q.pos.x - to.x, q.pos.z - to.z) > 1.8) continue;
        this.horde.melt(q);
        W.liq?.meltFx(q.pos.clone(), q.scale || 1, false, 0);
      }
    });
  }

  // El tajo del facón: la medialuna azul y blanca corta a los de adelante.
  slash(c, move = null) {
    const g = this.g;
    const W = g.weapons;
    const m = move || SWINGS[(this.swingN = ((this.swingN || 0) + 1) % 2)];
    c.busy = 0.46;
    c.cool = 0.6;
    this.pose('gil', GIL[`${m}0`], 16);
    this.later(0.13, () => {
      this.pose('gil', GIL[`${m}1`], 22);
      const r = c.r;
      const fwd = { x: -Math.sin(r.yaw), z: -Math.cos(r.yaw) };
      const center = new THREE.Vector3(r.pos.x, r.pos.y + 1.25, r.pos.z);
      this.arc(center, fwd, m === 'over' ? 1.35 : m === 'back' ? -0.32 : 0.35);
      W.facon?.sndCrackle(center, 0.7);
      g.audio.knife?.(true);
      for (const q of this.horde.alive) {
        if (q.state === 'lurk') continue;
        const dx = q.pos.x - r.pos.x;
        const dz = q.pos.z - r.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.7 || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.25) continue;
        const dir = tmpV.set(dx, 0, dz).normalize().clone();
        g.fx.sparks(this.chest(q, tmpW), 0.5, { x: dir.x, y: 0.4, z: dir.z }, [0.6, 0.85, 1]);
        this.horde.kill(q, dir, Math.random() < 0.55 ? 'head' : 'back', 2.2);
      }
    });
    this.later(0.46, () => this.pose('gil', GIL.guard, 7));
  }

  // El rayo: del cielo al facón y de ahí de muerto en muerto. all: el del
  // final (a todos los que quedan).
  lightning(c, n, all = false) {
    const g = this.g;
    const W = g.weapons;
    c.busy = 1;
    this.pose('gil', GIL.raise, 9);
    const go = () => {
      const tip = this.faconTip();
      const list = this.horde.alive.filter((p) => p.state !== 'lurk' && (all || Math.hypot(p.pos.x - c.r.pos.x, p.pos.z - c.r.pos.z) < 7.5));
      // en cadena: del más cercano al que sigue
      const path = [tip];
      const hits = [];
      let cur = { x: c.r.pos.x, z: c.r.pos.z };
      while (list.length && hits.length < n) {
        let bi = 0;
        let bd = Infinity;
        list.forEach((p, i) => {
          const d = Math.hypot(p.pos.x - cur.x, p.pos.z - cur.z);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        const p = list.splice(bi, 1)[0];
        hits.push(p);
        path.push(this.chest(p, new THREE.Vector3()));
        cur = p.pos;
      }
      if (path.length < 2) path.push(tip.clone().add(tmpV.set(-Math.sin(c.r.yaw) * 4, -1, -Math.cos(c.r.yaw) * 4)));
      const sky = tip.clone().add(tmpV.set(rnd(-2, 2), 26, rnd(-2, 2)));
      W.facon?.strikeFx(sky, path, true);
      // (la cadena, de a uno; el del final, más rápido)
      hits.forEach((p, i) => this.later(0.05 + i * (all ? 0.035 : 0.06), () => this.horde.zap(p, tmpV.set(p.pos.x - c.r.pos.x, 0, p.pos.z - c.r.pos.z).normalize())));
      g.post?.flash?.(all ? 0.3 : 0.12);
      g.fx.addShake(all ? 0.7 : 0.35);
      if (all) {
        g.audio.thunder?.(null, true);
        this.boltGlow = 1;
      }
      this.spark(2);
    };
    this.later(all ? 0 : 0.32, go);
    this.later(all ? 0.9 : 0.75, () => this.pose('gil', GIL.guard, 5));
  }

  // El filo chisporrotea (y se prende la hoja).
  spark(k = 1) {
    const tip = this.faconTip(tmpV);
    this.g.fx.electric(tip, Math.round(6 * k));
    this.g.fx.sparks(tip, 0.3 * k, { x: 0, y: 1, z: 0 }, [0.6, 0.85, 1]);
    this.bladeHeat = Math.max(this.bladeHeat || 0, 0.6 * k);
  }

  // El vaho podrido del aullido.
  vaho() {
    const L = this.lu;
    const g = this.g;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      g.fx.alpha.spawn(L.pos.x + Math.cos(a) * 0.9, L.baseY + 0.3, L.pos.z + Math.sin(a) * 0.9, Math.cos(a) * 4.5, 0.3, Math.sin(a) * 4.5, { color: [0.26, 0.3, 0.16], size: 0.4, size1: 1.3, life: 1.4, alpha: 0.45, drag: 2 });
    }
    g.fx.addShake(0.3);
  }

  // ---------------- tomas ----------------
  head(key, up = 1.55) {
    const r = this.people[key].r;
    return r.pos.clone().setY(r.pos.y + up);
  }

  glide(dur, a, b, lookA, lookB = lookA) {
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(a, b, k);
      look.lerpVectors(lookA, lookB, k);
    });
  }

  // Dando vueltas al tronco: radio, alto y ángulos (desde la dirección de la luna, al revés).
  orbit(dur, r0, r1, h0, h1, a0, a1, lookUp) {
    const base = Math.atan2(this.m.z, this.m.x);
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      const a = base + lerp(a0, a1, k);
      const r = lerp(r0, r1, k);
      pos.set(this.T.x + Math.cos(a) * r, this.T.y + lerp(h0, h1, k), this.T.z + Math.sin(a) * r);
      look.set(this.T.x, this.T.y + lookUp, this.T.z);
    });
  }

  // Por encima del hombro del que pelea, mirando lo que le viene.
  // side: de qué hombro (1 / -1); h: a qué altura (bajo: más épico).
  ots(key, dur, fov = 40, side = 1, h = 1.78) {
    const c = this.people[key];
    const d = c.dir;
    const s = { x: -d.z * side, z: d.x * side };
    const b = c.postPos;
    this.setFov(fov);
    const cam = new THREE.Vector3(b.x - d.x * 0.35 + s.x * 0.75, b.y + h, b.z - d.z * 0.35 + s.z * 0.75);
    const look = new THREE.Vector3(b.x + d.x * 4.5 - s.x * 0.4, b.y + 1.15 + (h - 1.78) * 0.4, b.z + d.z * 4.5 - s.z * 0.4);
    this.glide(dur, cam, cam.clone().add(tmpV.set(d.x * 0.25 + s.x * 0.12, -0.05, d.z * 0.25 + s.z * 0.12)), look);
  }

  // Adentro del círculo, dando la vuelta pegado al tronco por arriba de las
  // cabezas y mirando para afuera: los cuatro y lo que les viene.
  inner(dur, a0, a1, h = 2.7, r = 1.2) {
    const base = Math.atan2(this.m.z, this.m.x);
    this.shot(dur, (u, lt, pos, look) => {
      const a = base + lerp(a0, a1, smooth(u));
      pos.set(this.T.x + Math.cos(a) * r, this.T.y + h, this.T.z + Math.sin(a) * r);
      look.set(this.T.x + Math.cos(a) * 5, this.T.y + 1.1, this.T.z + Math.sin(a) * 5);
    });
  }

  // De frente y de costado (entre él y el pajonal), un poco de abajo.
  front(key, dur, fov = 42) {
    const c = this.people[key];
    const d = c.dir;
    const s = { x: -d.z, z: d.x };
    const b = c.postPos;
    const side = (this.frontSide = -(this.frontSide || 1));
    this.setFov(fov);
    const cam = new THREE.Vector3(b.x + d.x * 1.7 + s.x * 1.6 * side, b.y + 1.4, b.z + d.z * 1.7 + s.z * 1.6 * side);
    const look = new THREE.Vector3(b.x + d.x * 0.9, b.y + 1.45, b.z + d.z * 0.9);
    this.glide(dur, cam, cam.clone().add(tmpV.set(s.x * 0.3 * side, 0.08, s.z * 0.3 * side)), look);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!this.script || this.done) return false;
    // (las pruebas la congelan y la adelantan de a pasos: hold / stepping)
    if (this.hold && !this.stepping) dt = 0;
    // el reloj es la canción; si no suena (sin audio, silenciada), el propio
    const M = g.music;
    const st = M?.is(SONG) ? M.time() : -1;
    this.wait += dt;
    if (st >= 0) {
      this.heard = true;
      if (st < this.t + 4) this.t = Math.max(this.t, st);
    } else if (!this.heard ? this.wait > 1.8 : !M?.is(SONG)) this.t += dt;
    const t = this.t;
    this.dtNow = dt;
    g.weapons.vmRoot.visible = false;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    while (this.ev < this.events.length && this.events[this.ev][0] <= t) this.events[this.ev++][1]();
    if (this.done) return false;
    if (t >= AT.end) {
      this.finish();
      return false;
    }
    this.tick(dt, t);
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      const u = Math.max(0, Math.min(1, lt / C.dur));
      C.fn(u, lt, this.pos, this.look);
      this.shake = Math.max(0, this.shake - dt * 0.4);
      const s = (this.shake + (g.fx.shake || 0) * 0.6) * 0.08;
      cam.position.set(this.pos.x + (Math.random() - 0.5) * s, this.pos.y + (Math.random() - 0.5) * s, this.pos.z + (Math.random() - 0.5) * s);
      cam.lookAt(this.look);
      cam.updateMatrixWorld();
    }
    return true;
  }

  tick(dt, t) {
    const g = this.g;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    this.fight(dt);
    for (const c of this.crew) c.moveK += ((c.walking ? 1 : 0) - c.moveK) * Math.min(1, dt * (c.walking ? 7 : 4));
    for (const c of this.crew) if (c.follow) c.r.yaw = angLerp(c.r.yaw, yawTo(c.r.pos, this.lu.pos), Math.min(1, dt * 2.5));
    this.npc.update(dt);
    this.horde.update(dt, g.time);
    this.updateLuison(dt, t);
    // lo del facón y el Liquidificador sigue andando (Weapons no corre en una escena)
    g.weapons.facon?.update(dt);
    g.weapons.liq?.update(dt);
    // el filo del facón: chisporrotea y se prende en cada golpe
    this.bladeHeat = Math.max(0, (this.bladeHeat || 0) - dt * 1.8);
    const fm = this.bladeMat;
    if (fm) fm.emissiveIntensity = 0.05 + Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.3)) * 0.14 + this.bladeHeat;
    for (const a of this.arcs) {
      if (a.t >= 1) continue;
      a.t = Math.min(1, a.t + dt / 0.26);
      a.m.material.opacity = 0.55 * (1 - a.t) * (1 - a.t);
      a.m.scale.setScalar(0.9 + a.t * 0.3);
      if (a.t >= 1) a.pivot.visible = false;
    }
    for (const m of this.muzzles) {
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0) m.s.visible = false;
    }
    // la paja que se abre: lo que anda adentro antes del golpe y los que salen
    this.updatePhantoms(dt, t);
    if (this.pushers) {
      for (const q of this.pushers) {
        q.t += dt;
        const p = q.p;
        if (!q.out && p.active && !p.dead && q.t < 2.5) {
          q.x = p.pos.x;
          q.y = p.baseY;
          q.z = p.pos.z;
          const a = Math.atan2(p.pos.z - this.T.z, p.pos.x - this.T.x);
          if (Math.hypot(p.pos.x - this.T.x, p.pos.z - this.T.z) < this.edgeR(a) - 0.15) q.out = true;
        } else q.out = true;
        q.r += ((q.out ? 0 : 1.25) - q.r) * Math.min(1, dt * (q.out ? 1.8 : 9));
      }
      this.pushers = this.pushers.filter((q) => !q.out || q.r > 0.03);
      for (const q of this.pushers) if (EXTRA_PUSH.length < 4) EXTRA_PUSH.push({ key: q, x: q.x, y: q.y, z: q.z, r: q.r, loud: q.out ? 0 : 0.8 });
    }
    // las luces: el hueco se apaga; una luz fría de luna acompaña a los cuatro
    const hl = this.hl;
    if (hl) {
      this.flare = Math.max(0, (this.flare || 0) - dt * 0.35);
      this.boltGlow = Math.max(0, (this.boltGlow || 0) - dt * 0.8);
      if (this.flare > 0.02) {
        hl.position.copy(this.egg.huecoPos || this.T);
        hl.color.setHex(0x9ad8c8);
        hl.distance = 9;
        hl.intensity = this.flare * this.flare * 14;
      } else {
        const C = this.fillAt || (this.fillAt = new THREE.Vector3());
        // (al final, adelante del Luisón y alto: la luz fría le da en la cara)
        // (al final, con los cuatro: la luz fría de la luna en sus caras)
        const focus = t >= AT.quiet ? this.C.clone().add(tmpV.set(-this.m.x * 1.4, 2.8, -this.m.z * 1.4)) : this.T.clone().setY(this.T.y + 3.4);
        C.lerp(focus, C.lengthSq() ? Math.min(1, dt * 1.5) : 1);
        hl.position.copy(C);
        hl.color.setRGB(0.62 + this.boltGlow * 0.3, 0.72 + this.boltGlow * 0.2, 1);
        hl.distance = 12;
        hl.intensity = lerp(hl.intensity, 5.5 + this.boltGlow * 30, Math.min(1, dt * 4));
      }
    }
  }

  // El Luisón (títere): escondido atrás de la cresta, trepa con el grito de la
  // canción, se para arriba de la loma con los brazos abiertos (la luna
  // atrás), los mira, aúlla y salta al claro.
  updateLuison(dt, t) {
    if (!this.luOn) return;
    const g = this.g;
    const Z = g.zombies;
    const L = this.lu;
    const R = Z.bossRig;
    L.stateT += dt;
    const P = L.P;
    const gt = g.time;
    const st = L.stateT;
    let low = 0;
    let eye = 0;
    const C = this.C;
    if (L.state === 'hide') {
      luisonIdle(L, gt);
      low = 1;
    } else if (L.state === 'climb') {
      // de atrás de la cresta a la cima (climbPose: las garras, la cabeza
      // con el grito, se iza y se para)
      climbPose(P, st, gt);
      // (el cuerpo de verdad sube caminando parejo, con los pies en la loma:
      // arranca y frena de a poco)
      const u = clamp01(st / CLIMB_T);
      const A0 = 0.14;
      const B0 = 0.2;
      const vmax = 1 / (1 - A0 / 2 - B0 / 2);
      const f = u < A0 ? (vmax * u * u) / (2 * A0) : u > 1 - B0 ? 1 - (vmax * (1 - u) * (1 - u)) / (2 * B0) : vmax * (u - A0 / 2);
      L.pos.lerpVectors(this.luFrom, this.luTop, f);
      L.baseY = this.hillY(L.pos.x, L.pos.z);
      // los ojos se prenden con el grito (parpadean y quedan fijos)
      const e = st - CLIMB_NM;
      eye = e < 0 ? 0 : clamp01(e / 0.12) * (e < 0.45 ? 1.9 + Math.sin(e * 50) * 0.5 : lerp(1.9, 1.3, clamp01((e - 0.45) / 0.5)));
    } else if (L.state === 'pose') {
      // parado en la cresta: el pecho afuera, los brazos abiertos con las
      // garras, la cabeza arriba; después baja la mirada hacia ellos y resopla
      epicPose(P, st, gt);
      eye = 1.3;
    } else if (L.state === 'howl') {
      // (el estado se llama 'howl' para que la boca vaya con el aullido grabado)
      roarPose(P, st, gt);
      eye = 1.1;
    } else if (L.state === 'leap') {
      // el salto: un arco largo de la cima al claro
      const D = LEAP;
      const k = clamp01(st / D);
      L.pos.lerpVectors(this.luTop, this.luLand, k);
      L.baseY = lerp(this.luTop.y, this.luLand.y, k) + Math.sin(k * Math.PI) * 2.4;
      L.state = 'charge';
      L.stateT = k * POUNCE;
      L.speedType = 'run';
      luisonGait(L, dt, 7, gt);
      L.state = 'leap';
      L.stateT = st;
      P.rootY -= Math.sin(k * Math.PI) * 1.1;
      eye = 1.1;
      if (k >= 1) {
        L.state = 'landed';
        L.stateT = 0;
        L.baseY = this.luLand.y;
        g.fx.addShake(0.7);
        g.post?.flash?.(0.22);
        g.audio.bossSlam?.(this.luLand);
        g.fx.dust(tmpV.set(this.luLand.x, this.luLand.y + 0.05, this.luLand.z), { x: 0, y: 1, z: 0 }, [0.3, 0.28, 0.2], 26);
      }
    } else if (L.state === 'landed') {
      luisonIdle(L, gt);
      const k = 1 - smooth(clamp01(st / 0.45));
      P.torsoP += 0.35 * k;
      P.knL += 0.9 * k;
      P.knR += 0.9 * k;
      P.hipY -= 0.25 * k;
      eye = 1.1;
    }
    R.eyeMat.color.copy(this.eye0).multiplyScalar(eye / 3);
    // agachado (luison.luisonLow): atrás de la cresta no se lo ve
    L.lowK = low;
    if (low > 0.002) luisonLow(L, P, low, gt);
    // de una pose a la otra, en 0,35 s: desde la última que se vio (L.seen)
    if (L.state !== L.lastState) {
      L.lastState = L.state;
      L.blend = { ...(L.seen || P) };
      L.blendK = L.state === 'landed' ? 1 : 0;
    }
    if (L.blendK < 1 && L.blend) {
      L.blendK = Math.min(1, L.blendK + dt / 0.35);
      const e = smooth(L.blendK);
      for (const key in P) if (typeof P[key] === 'number' && typeof L.blend[key] === 'number') P[key] = L.blend[key] + (P[key] - L.blend[key]) * e;
    }
    L.seen = Object.assign(L.seen || {}, P);
    // la cara siempre hacia los cuatro
    L.yaw = angLerp(L.yaw, Math.atan2(C.x - L.pos.x, C.z - L.pos.z), Math.min(1, dt * 3));
    P.rootY += L.baseY;
    solvePose(L.mats, L.pos.x, L.pos.z, L.yaw, L.scale, P);
    P.rootY -= L.baseY;
    solveExtras(L.mats);
    const parts = R.parts;
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i];
      if (!m) continue;
      m.matrix.copy(L.mats[i]);
      m.matrixWorldNeedsUpdate = true;
    }
    R.hat.visible = false;
    R.rig.visible = true;
    R.tick(L, gt);
  }

  // Una toma. Se revisa una sola vez, al arrancar (cuadro a cuadro daba
  // saltos): si alguna parte del recorrido cae adentro de la paja, del monte
  // o del tronco, la toma entera se corre hacia el árbol lo que haga falta, y
  // se levanta si roza el piso. El movimiento queda parejo.
  shot(dur, fn) {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    let push = 0;
    let lift = 0;
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      fn(u, u * dur, pos, look);
      push = Math.max(push, this.pushNeeded(pos));
      lift = Math.max(lift, this.g.world.floorAt(pos.x, pos.z) + 0.4 - pos.y);
      // (pegada a uno de los cuatro, a la altura de la cabeza: por arriba)
      for (const c of this.crew) {
        const r = c.r.pos;
        if (Math.hypot(pos.x - r.x, pos.z - r.z) < 0.85 && pos.y < r.y + 2.2) lift = Math.max(lift, r.y + 2.25 - pos.y);
      }
    }
    if (push > 0.01 || lift > 0.01) {
      const f = fn;
      const T = this.T;
      fn = (u, lt, p, l) => {
        f(u, lt, p, l);
        const dx = T.x - p.x;
        const dz = T.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = Math.min(push, Math.max(0, d - 1.3)) / d;
        p.x += dx * k;
        p.z += dz * k;
        p.y += Math.max(0, lift);
      };
    }
    super.shot(dur, fn);
  }

  // Cuánto hay que correr la cámara hacia el árbol para que no quede en la
  // paja (arriba del pajonal alcanza con 3,4 m; del monte, con los árboles,
  // 9), ni en el tronco.
  pushNeeded(pos) {
    const q = tmpW.copy(pos);
    const T = this.T;
    for (let n = 0; n < 140; n++) {
      if (this.camOk(q)) return n * 0.05;
      const dx = T.x - q.x;
      const dz = T.z - q.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 1.3) return n * 0.05;
      q.x += (dx / d) * 0.05;
      q.z += (dz / d) * 0.05;
    }
    return 7;
  }

  camOk(pos) {
    const Z = this.g.zombies;
    const h = pos.y - this.T.y;
    const ok = (x, z) => {
      const k = Z.cellKind(x, z);
      return k === 0 || (k === 1 && h > 3.4) || (k === 2 && h > (this.clearView(x, z) ? 3.4 : 9));
    };
    if (!(ok(pos.x, pos.z) && ok(pos.x + 0.45, pos.z) && ok(pos.x - 0.45, pos.z) && ok(pos.x, pos.z + 0.45) && ok(pos.x, pos.z - 0.45))) return false;
    return h >= 3 || Math.hypot(pos.x - this.T.x, pos.z - this.T.z) >= 1.15;
  }

  // ---------------- el final ----------------
  // Saltear: solo el anfitrión (o jugando solo); a los demás se lo avisa.
  skip(remote = false) {
    if (this.done) return;
    if (this.g.net?.guest && !remote) return;
    this.skipped = true;
    if (!remote) this.g.net?.event('ee', { arrSkip: 1 });
    this.finish();
  }

  // Dónde queda cada uno para la pelea: el propio jugador, en el lugar de su personaje.
  placePlayer() {
    const g = this.g;
    const pl = g.player;
    if (!pl?.alive || pl.downed) return;
    const role = this.egg.roleOf?.() || 'gil';
    const at = this.lineAt?.[role] || this.lineAt?.gil || this.C;
    pl.pos.set(at.x, g.world.floorAt(at.x, at.z), at.z);
    pl.vel?.set(0, 0, 0);
    const L = this.luAt;
    pl.yaw = Math.atan2(-(L.x - at.x), -(L.z - at.z));
    pl.pitch = 0.18;
  }

  // Dónde y para dónde queda el Luisón de verdad (EsterosEgg.arrivalDone).
  get luisonYaw() {
    const C = this.C;
    return Math.atan2(C.x - this.luAt.x, C.z - this.luAt.z);
  }

  finish() {
    if (this.done) return;
    const g = this.g;
    // salteada: la canción salta al golpe (la pelea arranca con todo)
    if (this.skipped && g.music?.is(SONG) && this.t < AT.boom) g.music.jumpTo(AT.boom);
    this.fighting = false;
    this.lineAt ||= {};
    super.finish();
  }

  cleanup() {
    const g = this.g;
    EXTRA_PUSH.length = 0;
    if (g.net?.avatars) g.net.avatars.root.visible = this.hidAv ?? true;
    if (this.hidInteract !== undefined) g.interact.root.visible = this.hidInteract;
    if (SKY?.moon && this.moon0 != null) SKY.moon.light = this.moon0;
    if (this.fly0) g.world.night?.flyU?.uCol.value.copy(this.fly0);
    if (this.egg.huecoGlow) this.egg.huecoGlow.visible = true;
    // (la luz del hueco es del mapa: vuelve a como estaba, apagada)
    if (this.hl) {
      this.hl.intensity = 0;
      this.hl.color.setHex(0x9ad8c8);
      this.hl.distance = 9;
      this.hl.position.copy(this.egg.huecoPos || this.T);
    }
    const R = g.zombies.bossRig;
    if (this.luOn && !g.zombies.boss) R.rig.visible = false;
    if (this.eye0) R.eyeMat.color.copy(this.eye0);
    this.npc.dispose();
    this.horde.dispose();
    for (const m of this.muzzles) m.s.material.dispose();
    for (const m of this.faconMats || []) m.dispose();
    for (const m of this.gunMats || []) m.dispose();
    if (!this.played) return;
    g.weapons.facon?.clear?.();
    if (g.state === 'playing' || g.state === 'paused') g.hud.show(true);
  }

  // Sin haberse visto (se fue de la partida antes): se desarma.
  dispose() {
    this.onDone = null;
    if (!this.script) {
      this.done = true;
      this.el.remove();
      this.cleanup();
      this.root.removeFromParent();
      return;
    }
    this.finish();
  }
}
