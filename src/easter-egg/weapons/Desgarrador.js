import * as THREE from 'three';
import { WEAPONS, weaponStats } from '../config/weapons';
import { MAP_ID } from '../config/map';
import { zombieHealth, bossHealth, PLAYER } from '../config/rules';
import { keyLabel } from '../core/controls';
import { furiaKills, dashCd as dashCdOf } from '../entities/eclipse/catalizador';
import { walkLine } from '../world/Levels';
import { VM, registerMate } from './viewmodels';
import { buildScythe, cosmicMats, cloneMats, setCosmicEnv, tintMats, driftCosmos, animScythe, desgarradorModel, GRIP_L_Y, MID_Y, TOP_Y, SHAFT_R, GRIP_RAD } from './desgarradorModels';
import { gripHand } from './desgarradorHands';
import Cazador from './Cazador';
import DesgarradorFx, { PAL } from './desgarradorFx';
import { VoidBleed, OrbitShards } from './desgarradorAura';
import { OLD_FURIA11, CONC, SND_OFF, FURIA_SND, concPose, FuriaGather, concWorld, concBurst, furiaSnd, stopSnd } from './desgarradorFuria';
import { eclSfx } from '../fx/eclipseSfx';
import { VMS, ELBOW_R, ELBOW_L, ELBOW_FOLLOW, LEFT_OFF, shaftQuat, REST_P, MOVES, COMBO, THROW, THROW_KEYS, THROW_AT, DASH_KEYS, DRAW, DRAW_KEYS, INSPECT, INSPECT_KEYS, BEAM_P, CHARGE_P, SPIN_UP, SPIN_TURNS, NP, sample, mix, DESG_POSES } from './desgarradorMoves';

// El Desgarrador Cósmico: la maravilla de Eclipse Matero. Una guadaña violeta y
// negra que desgarra el espacio-tiempo con cada golpe (no sale de la caja: la
// da el mapa con weapons.cosmic.give(); la mejora, Desgarrador del Eclipse, la
// da la misión del temple con weapons.cosmic.upgrade(): no entra en el
// Pack-a-Pava).
//  · Izquierdo (mantenido sigue): tres tajos en combo (diagonal, revés y de
//    arriba) y un remate ancho. Cada tajo deja una grieta en el aire donde
//    pasó la hoja (~1,5 s): el que la cruza se lastima.
//  · Derecho: tira una guadaña espectral que gira, atraviesa y vuelve a la
//    hoja; a los que mata los parte al medio. Gasta cargas (mag/reserve).
//  · V (la tecla del facón) con la guadaña en la mano: la embestida, un dash
//    corto que corta todo lo que cruza (nunca atraviesa paredes ni se tira
//    por un borde; durante la embestida no te tocan).
//  · R: la gira en círculos por arriba de la cabeza: carga las guadañas y
//    empuja a los que están pegados.
//  · E: la muestra.
//  · Mejorada: la Furia Cósmica se llena con las bajas. Llena, H (acción
//    'furia', se cambia en Opciones): ~20 s de violeta neón, todo más rápido y
//    fuerte, se corre más, el derecho mantenido es un rayo que pulveriza y cada
//    baja cura. (furia11: la H primero concentra el poder ~1,5 s —el báculo
//    parado delante, camina despacio y no lo tocan— y con el golpe del regatón
//    se desata; weapons/desgarradorFuria.js. globalThis.__mduOldFuria11: de una)
//  · Reservado (el potenciador Cazador del Caos lo prende con exec()): la
//    ejecutora, violeta y rosa: cada tajo mata de una a cualquiera que no sea
//    jefe, las guadañas no gastan, la embestida no espera, los ejecutados
//    revientan en una nube rosa y la Furia se llena el doble.
// Weapons le pasa las teclas (keys), el gatillo (input), cada cuadro (update),
// la pose de la mano (pose), las stats (boost) y el final (clear). El daño va
// por zombies.damage (el invitado se lo pasa al anfitrión); los demás ven todo
// por 'desg' (ghost). API para otros: give, upgrade, exec, endExec, listen.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const _he = new THREE.Euler();
const _hq = new THREE.Quaternion();
const near = [];
const hitTmp = {};
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const aimY = (z) => (z.dog ? (z.yacY ?? z.pos.y) + 0.35 : z.pos.y + 1.15 * (z.scale || 1));
const big = (z) => !!(z.boss || z.pombero || z.crow || z.mandinga || z.yasy);
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rnd = () => Math.random() - 0.5;
const ID = 'desgarrador';
// (las stats sin la mano: un estallido de la espectral que vuelve con otra arma en la mano)
const weaponStatsOf = (up) => weaponStats(ID, up ? 1 : 0);
const tmpF2 = new THREE.Vector3();

// ---------------- en la mano ----------------
// (la escala, los codos y las poses: weapons/desgarradorMoves.js)
export { VMS, DESG_POSES };
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SLEEVE_L = 0.8;

// Las manos: la de la derecha abraza el asta en el origen (atrás, cerca del
// regatón); la izquierda, más adelante, hacia la hoja (o suelta). v3: un puño de
// verdad (weapons/desgarradorHands.js) que gira alrededor del asta para que el
// antebrazo vaya derecho al codo. Los antebrazos van aparte, de la muñeca al
// codo. (globalThis.__mduDesgOldHands: la mano de wrapHand, como antes)
const HAND_S = 0.86;
function hand(M, left) {
  if (globalThis.__mduDesgOldHands !== true) {
    const H = gripHand(M, { r: GRIP_RAD[left ? 1 : 0] * VMS, s: HAND_S, left });
    return { h: H.h, at: H.at, roll: true };
  }
  const r = (SHAFT_R + 0.0045) * VMS;
  const h = VM.wrapHand(M, left ? { radius: r, y0: -0.036, side: -Math.PI / 2, dir: -1, arm: new THREE.Vector3(-0.3, -0.9, 0.3), scale: 0.95 } : { radius: r, y0: -0.036, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 });
  for (const o of [...h.children]) if (o.material === M.sleeve || o.material === M.cuff) o.removeFromParent();
  // dónde arranca el antebrazo (atrás de la palma, como en wrapHand)
  const out = new THREE.Vector3(0, 0, left ? -1 : 1);
  const at = out.multiplyScalar(r + 0.0135).setY(-0.036 + 0.004);
  return { h, at };
}
function forearm(M) {
  const arm = new THREE.Group();
  arm.userData.hand = true;
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.01, 8, 18), M.cuff);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = 0.012;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.048, SLEEVE_L, 16, 1, true), M.sleeve);
  sleeve.position.y = 0.012 + SLEEVE_L / 2;
  arm.add(cuff, sleeve);
  return arm;
}

registerMate(ID, (up, T) => {
  const M = VM.mats(T);
  const C = cosmicMats('vm');
  const s = buildScythe(up, C);
  const scy = s.group;
  scy.scale.setScalar(VMS);
  // el asta se puede correr en la mano (el giro la agarra del medio)
  const slide = new THREE.Group();
  slide.add(scy);
  const wrist = new THREE.Group();
  wrist.add(slide);
  const R = hand(M, false);
  wrist.add(R.h);
  const L = hand(M, true);
  const handL = new THREE.Group();
  handL.add(L.h);
  const armR = forearm(M);
  const armL = forearm(M);
  const root = new THREE.Group();
  root.add(wrist, handL, armR, armL);
  // (v4) la cabeza del arma (el cristal / el eclipse arriba del asta): de ahí
  // nace el rayo de la Furia
  const head = new THREE.Object3D();
  head.position.set(0, TOP_Y + 0.02, 0);
  scy.add(head);
  // (v4) la del Eclipse: un anillo de eclipse que orbita la cabeza (dos aros
  // de oro y violeta y una lunita negra con su corona que da vueltas)
  let orb = null;
  if (up && globalThis.__mduNoDesgOrb !== true) {
    const OM = orbMats();
    orb = new THREE.Group();
    orb.position.copy(head.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.0042, 6, 56), OM.gold);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.0026, 6, 48), OM.violet);
    const moon = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.019, 14, 10), OM.black);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 24), OM.gold);
    moon.add(ball, crown);
    moon.position.x = 0.13;
    ring.add(moon);
    for (const o of [ring, ring2, ball, crown]) o.renderOrder = 5;
    orb.add(ring, ring2);
    orb.userData = { ring, ring2, moon, crown };
    scy.add(orb);
  }
  const m = { wrist, slide, scy, handL, handR: R.h, handLi: L.h, roll: !!R.roll, armR, armL, atR: R.at, atL: L.at, tip: s.tip, mid: s.mid, head, orb, bolts: s.bolts, up: !!up, M: C, rel: 0 };
  setPose(m, REST_P, 0);
  root.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  s.tip.getWorldPosition(tip);
  return { root, muzzle: s.tip, anim: { spin: [], glow: [], wobble: null }, upgraded: !!up, tip, mouth: null, mate: wrist, bombGroup: null, yerba: null, cosmic: m };
});

// (v4) los materiales del anillo de eclipse (de luz: no se tiñen)
let ORB = null;
function orbMats() {
  if (ORB) return ORB;
  const add = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  ORB = { gold: add(new THREE.Color(1, 0.72, 0.3).multiplyScalar(1.6)), violet: add(new THREE.Color(0.6, 0.25, 1).multiplyScalar(1.4)), black: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }) };
  return ORB;
}

// Pone la mano en la pose P (11 números: posición extra, hacia dónde va el
// asta, hacia dónde sale la hoja, cuánto se corrió el asta en la mano y cuánto
// soltó la izquierda), con un giro extra (spin) sobre el eje `ax` (en la mano).
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _w = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
const _eL = new THREE.Vector3();
function setPose(m, P, spin = 0, ax = null) {
  shaftQuat(P[3], P[4], P[5], P[6], P[7], P[8], _q);
  if (spin) _q.premultiply(_q2.setFromAxisAngle(ax || _w.set(P[3], P[4], P[5]).normalize(), spin));
  m.wrist.quaternion.copy(_q);
  const slide = P[9] || 0;
  m.slide.position.set(0, -slide * VMS, 0);
  // la izquierda: en el asta, o soltándola hacia abajo
  const rel = smooth(clamp01(P[10] || 0));
  m.rel = rel;
  // (v3: las dos manos se corren juntas por el asta, a la misma distancia)
  _w.set(0, (globalThis.__mduDesgOldGrip === true ? GRIP_L_Y - slide : GRIP_L_Y) * VMS, 0).applyQuaternion(_q).add(m.wrist.position);
  m.handL.position.copy(_w).lerp(LEFT_OFF, rel);
  m.handL.quaternion.copy(_q).multiply(_lq);
  m.handL.visible = rel < 0.98;
  m.armL.visible = m.handL.visible;
  // (v4) el codo izquierdo sigue a la mano cuando ella cruza a la derecha (la
  // quieta nueva: las dos manos a la derecha); si no, el antebrazo cruzaba la
  // pantalla entera. (globalThis.__mduDesgOldElbow: el codo fijo, como antes)
  _eL.copy(ELBOW_L);
  if (globalThis.__mduDesgOldElbow !== true) {
    _eL.x = Math.max(ELBOW_L.x, m.handL.position.x - ELBOW_FOLLOW[0]);
    // (guadana5: con la guadaña acostada el codo va más abajo y atrás: el
    // antebrazo baja casi derecho y no tapa el medio de la pantalla)
    _eL.y += ELBOW_FOLLOW[1];
    _eL.z += ELBOW_FOLLOW[2];
  }
  // (v3) cada puño gira alrededor del asta hasta que el antebrazo mira al codo
  let rollR = 0;
  let rollL = 0;
  if (m.roll) {
    _qi.copy(_q).invert();
    _w2.subVectors(ELBOW_R, m.wrist.position).applyQuaternion(_qi);
    rollR = -Math.atan2(_w2.z, _w2.x);
    m.handR.rotation.set(0, rollR, 0);
    _w2.subVectors(_eL, m.handL.position).applyQuaternion(_qi);
    rollL = -Math.atan2(_w2.z, _w2.x);
    m.handLi.rotation.set(0, rollL, 0);
  }
  // los antebrazos: de la muñeca al codo
  _w.copy(m.atR).applyAxisAngle(Y_AXIS, rollR).applyQuaternion(_q).add(m.wrist.position);
  m.armR.position.copy(_w);
  m.armR.quaternion.setFromUnitVectors(Y_AXIS, _w2.subVectors(ELBOW_R, _w).normalize());
  _w.copy(m.atL).applyAxisAngle(Y_AXIS, rollL).applyQuaternion(m.handL.quaternion).add(m.handL.position);
  m.armL.position.copy(_w);
  m.armL.quaternion.setFromUnitVectors(Y_AXIS, _w2.subVectors(_eL, _w).normalize());
}

// (v4) el muñeco del compañero: cómo va la guadaña en su mano (base del giro
// y cuánto se corre el asta en la mano: y < 0, la mano más arriba en el asta).
// Antes iba parada delante de la cara, agarrada del regatón; ahora la agarra
// por el medio, cruzada en diagonal: la hoja arriba de su hombro derecho y el
// regatón abajo hacia su pie izquierdo (hoja guadana/shots/_ag_vars2.png, v6).
// (globalThis.__mduDesgOldAvatar: como antes)
const AV_T = globalThis.__mduDesgOldAvatar === true ? { rx: 0.12, ry: Math.PI / 2 + 0.25, rz: 0.08, pk: 0.85, y: 0 } : { rx: -0.3, ry: Math.PI / 2 + 0.25, rz: 0.9, pk: 0.85, y: -0.55 };
// (furia11) cuánto levanta la guadaña el muñeco de un compañero que concentra
// la Furia (radianes de mirada hacia arriba: net/gauchoSkin desgLift).
// (globalThis.__desgAvLift: para afinarlo desde las pruebas)
const AV_LIFT = 0.7;
const _avR = new THREE.Vector3();
const _avL = new THREE.Vector3();
const _avF = new THREE.Vector3();
const _avD = new THREE.Vector3();
const _avU = new THREE.Vector3();
const _avI = new THREE.Matrix4();
const _avQ = new THREE.Quaternion();
const _avQ2 = new THREE.Quaternion();
const TRAIL_MAX = 24;
const TRAIL_LIFE = 0.13;
// (v3) la del Eclipse deja la estela más larga
const TRAIL_LIFE_UP = 0.22;
const HOLD = 0.2;
// (guadana5) el clic izquierdo de la del Eclipse: hasta acá es un toque (tajo al soltar)
const TAP = 0.2;

export default class Desgarrador {
  // ¿Se arma en la carga? Solo en Eclipse Matero (Weapons.prebuild: en los
  // demás mapas, ni sus modelos ni sus materiales; si alguien la da igual —la
  // prueba de armas—, se arma al darla).
  static atLoad() {
    return MAP_ID === 'eclipse' || globalThis.__mduNoDesgSleep === true;
  }

  constructor(w) {
    this.w = w;
    this.g = w.g;
    // Dormida: en los mapas que no son Eclipse y sin la guadaña nunca dada en
    // esta partida no arma nada (ni efectos, ni sonidos, ni texturas) y su
    // update vuelve enseguida. Se despierta (wake) al darla, al tenerla en las
    // manos, con la de un compañero o en Eclipse (en la carga: Arrival bake/warm).
    // (globalThis.__mduNoDesgSleep: despierta siempre, como antes)
    this.awake = false;
    this._fx = null;
    this.mode = 'none';
    this.t = 0;
    this.dt = 1 / 60;
    this.combo = 0;
    this.move = 'diag';
    this.lastEnd = -9;
    this.cd = 0;
    this.dashCd = 0;
    this.kills = 0;
    this.furiaT = 0;
    this.execT = 0;
    this.execLink = null;
    this.stopT = 0;
    this.rHold = -1;
    this.queued = false;
    this.P = new Array(NP).fill(0);
    this.O = [0, 0, 0, 0, 0, 0, 0, 0];
    this.prevState = '';
    this.counted = new WeakMap();
    this.listeners = new Set();
    this.avMats = new Map();
    this.remoteBeams = [];
    this.beam = { want: false, inputT: -1, on: false, k: 0, pk: 0, grow: 0, tickT: 0, shareT: 0, rig: null, loop: null, kills: [], from: new THREE.Vector3(), to: new THREE.Vector3() };
    this.dash = null;
    // (v3) la del Eclipse: los muertos frenados por la burbuja, la lluvia de la
    // Furia, el rasgón de la pantalla (fx/PostFX lee rip y ripA) y los tragados
    // que hay que avisar ('w')
    this.slowed = new Set();
    this.rainT = 0;
    this.rip = 0;
    this.ripA = 0;
    this.swq = [];
    // (v4) el golpe cargado (cuánto lleva mantenido el izquierdo, la espera, la
    // fuerza del que se soltó), la Furia divina (el Eclipse: eclK lo lee
    // fx/PostFX; el aura que los mata de a poco) y la ejecutora que llena la Furia
    this.holdL = 0;
    this.chargeCd = 0;
    this.chargedK = 0;
    this.eclK = 0;
    this.auraT = 0;
    this.auraN = new WeakMap();
    this.fillT = 0;
    this.bleed = null;
    this.orbit = null;
    // (furia11) concentrar antes de la Furia: la pose de la que salió, si ya
    // se desató (lit), cuánto junta (concK), la tensión de la pantalla (tens:
    // fx/PostFX), la H que espera a que termine un golpe (furiaQ), el grabado
    // que suena (concSnd), el anillo que se cierra (concRing) y las chispas de
    // la mano (gather)
    this.concFrom = new Array(NP).fill(0);
    this.concLit = false;
    this.concK = 0;
    this.tens = 0;
    this.furiaQ = 0;
    this.concSnd = null;
    this.concRing = null;
    this.gather = null;
    // el Cazador del Caos (el potenciador de Eclipse: su arma temporal propia)
    this.cazador = new Cazador(this);
    this.rawR = false;
    this.trailPts = [];
    this.trailFree = [];
    this.trailOn = false;
    this.trailFrame = -1;
    this.trail = null;
    // (los efectos, dormida: no hacen nada; slice despierta, por si llega un
    // muerto partido de un compañero)
    this.noFx = {
      flyers: [],
      rifts: [],
      baked: false,
      bake() {},
      warm() {},
      update() {},
      clear() {},
      play: () => null,
      loop: () => null,
      slice: (z, dir) => {
        this.wake();
        this.fx.slice(z, dir);
      },
      sliceMats() {},
    };
  }

  // ¿Despierta? En Eclipse siempre; en los demás mapas, si la dieron.
  wanted() {
    return this.awake || MAP_ID === 'eclipse' || globalThis.__mduNoDesgSleep === true;
  }

  // ¿La tiene el jugador (en las manos o guardada)?
  held() {
    const w = this.w;
    return w.temp?.id === ID || w.slots?.some((s) => s.id === ID);
  }

  get fx() {
    if (this._fx) return this._fx;
    if (!this.wanted()) return this.noFx;
    this.wake();
    return this._fx;
  }

  // Arma lo suyo (una sola vez): materiales con el reflejo de la sala, los
  // efectos, la estela de la mano y lo que escucha del mouse.
  wake() {
    this.awake = true;
    if (this._fx) return;
    const w = this.w;
    // (los de la caja y los compañeros, armados ya: el reflejo de la sala es
    // parte del programa; armados después compilaban uno nuevo en plena partida)
    cosmicMats('vm');
    cosmicMats('world');
    setCosmicEnv(w.envMap);
    this._fx = new DesgarradorFx(this);
    // la estela del tajo: una cinta que sigue a la hoja de verdad (escena de la mano)
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    const nv = TRAIL_MAX * 3;
    for (let i = 0; i < nv - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 10;
    w.vmRoot.add(this.trail);
    // (v4) la del Eclipse: la hoja que sangra vacío (escena de la mano) y las
    // esquirlas que orbitan (en el mundo, con los efectos)
    this.bleed = new VoidBleed();
    w.vmRoot.add(this.bleed.mesh);
    this.orbit = new OrbitShards();
    this._fx.root.add(this.orbit.mesh);
    // (furia11) las chispas que se le meten al concentrar (escena de la mano)
    // y los tres grabados de la Furia, bajados ya
    this.gather = new FuriaGather();
    w.vmRoot.add(this.gather.mesh);
    if (!OLD_FURIA11()) eclSfx(this.g).load(FURIA_SND);
    const vs = w.vmScene;
    const prev = vs.onBeforeRender;
    vs.onBeforeRender = (...a) => {
      prev?.apply(vs, a);
      this.trailTick();
      this.gatherTick();
    };
    // (el derecho mantenido de verdad: con la mira en modo "alternar" el juego
    // no se entera de cuándo se suelta; la Furia lo necesita para el rayo)
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', (e) => e.button === 2 && document.pointerLockElement && (this.rawR = true));
      document.addEventListener('mouseup', (e) => e.button === 2 && (this.rawR = false));
      document.addEventListener('pointerlockchange', () => !document.pointerLockElement && (this.rawR = false));
      window.addEventListener('blur', () => (this.rawR = false));
    }
  }

  // Los modelos de la mano en el grupo escondido de los mates (para la carga):
  // si la partida empezó en otro mapa, Weapons.prebuild no los armó.
  prepare() {
    const w = this.w;
    for (const up of [0, 1]) {
      const m = w.modelOf(ID, up);
      if (!m.root.parent) w.warm.add(m.root);
    }
  }

  // ---------------- lo que usan otros ----------------
  // Da la guadaña (up: 1 la del Eclipse). Si ya la tiene, la saca.
  give(up = 0) {
    this.wake();
    return this.w.give(ID, up);
  }

  // La mejora (la misión del temple): el Desgarrador del Eclipse a la que tiene
  // el jugador (la de la mano, o la otra). true si la mejoró.
  upgrade() {
    const w = this.w;
    const s = w.slot?.id === ID ? w.slot : w.slots.find((x) => x.id === ID);
    if (!s || s.up) return false;
    s.up = 1;
    const st = WEAPONS[ID].pap;
    s.mag = st.mag;
    s.reserve = st.reserve;
    if (w.slot === s) {
      w.equipModel();
      this.mode = 'draw';
      this.t = 0;
    }
    w.updateHud();
    const g = this.g;
    this.fx.play('desg-mejora', { gain: 1 });
    g.post?.flash?.(0.12);
    g.fx.addShake(0.25);
    this.emit({ type: 'upgrade' });
    return true;
  }

  // La ejecutora (reservado: el potenciador Cazador del Caos). secs: cuánto
  // dura. link: la clave del potenciador en powerups.active (p. ej. 'caos'):
  // si el reloj de los potenciadores personales se pone a cero (agarrar otro,
  // Powerups.endPersonal), se apaga también.
  exec(secs, { link = null } = {}) {
    const X = WEAPONS[ID].exec;
    this.execT = Math.max(0.1, secs ?? X.time);
    this.execLink = link;
    this.fx.play('desg-rosa', { gain: 1, rate: 0.75 });
    this.g.net?.share('desg', { k: 'x', id: this.g.net.id, on: 1 });
    this.emit({ type: 'exec', on: true });
    return true;
  }

  endExec() {
    if (this.execT <= 0) return;
    this.execT = 0;
    this.execLink = null;
    this.g.net?.share('desg', { k: 'x', id: this.g.net.id, on: 0 });
    this.emit({ type: 'exec', on: false });
  }

  get execOn() {
    return this.execT > 0;
  }

  get furiaOn() {
    return this.furiaT > 0;
  }

  // Avisos para las misiones (el temple, los pasos del mapa): fn({ type, ... }).
  //  'cut' { how, o, fwd, range }   cada tajo (how: diag, rev, alto, remate)
  //  'kill' { how, z, pos }         cada baja (how: tajo, grieta, guadaña, embestida, giro, rayo, nube)
  //  'dash' { from, to }            cada embestida
  //  'throw' { o, f }               cada guadaña espectral
  //  'spin' {}                      cada giro
  //  'furia' { on }  'exec' { on }  'upgrade' {}
  // Devuelve la función para dejar de escuchar. También llama g.ee.onCosmic(ev).
  listen(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(ev) {
    for (const fn of this.listeners) {
      try {
        fn(ev);
      } catch (e) {
        console.error(e);
      }
    }
    this.g.ee?.onCosmic?.(ev);
  }

  get st() {
    return this.w.slot?.id === ID ? this.w.stats : null;
  }

  get up() {
    return !!this.w.model?.cosmic?.up && this.w.slot?.id === ID;
  }

  // El estado de la hoja: 'exec' (la ejecutora) | 'furia' | 'base'.
  pal() {
    return this.execOn ? 'exec' : this.furiaOn ? 'furia' : 'base';
  }

  // Las stats con la Furia (Weapons.stats): más rápida y se corre más.
  boost(st) {
    if (!st || st.id !== ID) return st;
    // (furia11) concentrando camina despacio (no queda clavado)
    if (this.mode === 'conc' && !this.concLit) return { ...st, moveMult: (st.moveMult || 1) * CONC.move };
    if (this.furiaOn && st.furia && globalThis.__mduNoFuria !== true) {
      const F = st.furia;
      return { ...st, rpm: st.rpm * F.rate, moveMult: (st.moveMult || 1) * F.move, furiaOn: true };
    }
    return st;
  }

  // ---------------- las teclas (antes que nadie) ----------------
  // V: la embestida; R: el giro; H: la Furia. true si se quedó con la tecla.
  keys(input, st, p) {
    const w = this.w;
    if (!w.model?.cosmic) return false;
    if (!this.awake) this.wake();
    // (la H no es del juego: la Furia la mira siempre que la tengas en la mano)
    if (input.hit('KeyH')) this.tryFuria(st);
    // (furia11) concentrando: ni embestida ni giro (las teclas se las queda)
    if (this.mode === 'conc') return input.hit('KeyV') || input.hit('KeyR');
    const busy = ['knife', 'throw', 'drink'].includes(w.state);
    if (input.hit('KeyV')) {
      if (!p.downed && !busy) this.tryDash(st);
      return true;
    }
    if (input.hit('KeyR')) {
      if (!p.downed && !busy) this.trySpin(st);
      return true;
    }
    return false;
  }

  // ---------------- el gatillo ----------------
  input(input, st, p) {
    const w = this.w;
    const g = this.g;
    if (!this.awake) this.wake();
    if (p.downed) return;
    if (w.state !== 'idle' && w.state !== 'cosmic') return;
    // (furia11) concentrando (y en el golpe que la desata) no hay gatillo
    if (this.mode === 'conc') {
      this.holdL = 0;
      return;
    }
    // (v4) la del Eclipse: mantener el izquierdo después de un tajo carga el
    // golpe (la ruptura grande); se suelta y baja. (globalThis.__mduNoCharge: sin cargar)
    const CH = st.charge && globalThis.__mduNoCharge !== true ? st.charge : null;
    this.holdL = input.mouse.left ? this.holdL + this.dt : 0;
    if (this.mode === 'charge') {
      if (!input.mouse.left || this.t > 4) this.releaseCharge(st);
      return;
    }
    // el derecho: con la Furia, mantenido es el rayo y un toque tira; sin
    // Furia, tira (gasta una carga)
    const held = g.input?.adsToggle ? this.rawR : input.mouse.right;
    const furia = this.furiaOn && !!st.furia;
    if (furia) {
      if (input.mouse.rightPressed && (this.mode === 'idle' || this.mode === 'beam')) this.rHold = 0;
      if (this.rHold >= 0) {
        if (held) {
          this.rHold += this.dt;
          if (this.rHold >= HOLD) {
            this.beam.want = true;
            this.beam.inputT = g.time;
          }
        } else {
          if (this.rHold < HOLD && !this.beam.on && this.mode === 'idle') this.tryThrow(st);
          this.rHold = -1;
        }
      }
      if (this.beam.on || this.mode === 'beam') return;
    } else if (input.mouse.rightPressed && (this.mode === 'idle' || (this.mode === 'slash' && this.t > this.dur * 0.55))) {
      this.tryThrow(st);
      return;
    }
    if (this.mode === 'slash') {
      if (input.mouse.leftPressed && this.t > this.dur * 0.35) this.queued = true;
      return;
    }
    if (this.mode !== 'idle') return;
    // (guadana5: "cuando querés cargar el clic izquierdo te tira sí o sí un
    // ataque y luego carga". Con la del Eclipse: apretar no corta; un toque
    // (soltar antes de TAP s) es el tajo; mantener carga sin tajo antes. En
    // la cadena del combo (recién terminó un tajo) o con un tajo en cola, corta
    // al apretar, sin esperar. globalThis.__mduDesgOldChargeInput: como antes)
    if (CH && globalThis.__mduDesgOldChargeInput !== true) {
      const chain = g.time - this.lastEnd < 0.34;
      if (input.mouse.leftPressed && !this.queued && !chain) this.pend = 0;
      if (this.pend != null) {
        if (input.mouse.left) {
          this.pend += this.dt;
          if (this.pend >= TAP) {
            this.pend = null;
            if (this.chargeCd <= 0) this.startCharge(st);
            else this.startSlash(st);
          }
          return;
        }
        this.pend = null;
        this.startSlash(st);
        return;
      }
      if ((input.mouse.leftPressed && chain) || this.queued) {
        this.queued = false;
        this.startSlash(st);
      }
      return;
    }
    if (CH && input.mouse.left && !this.queued && this.holdL >= CH.hold && this.chargeCd <= 0) {
      this.startCharge(st);
      return;
    }
    if (input.mouse.left || this.queued) {
      this.queued = false;
      this.startSlash(st);
    }
  }

  // ---------------- el golpe cargado (v4, la del Eclipse) ----------------
  startCharge(st) {
    const g = this.g;
    this.mode = 'charge';
    this.t = 0;
    this.w.state = 'cosmic';
    this.w.stateT = 0;
    this.chargeLoop?.stop(0.05);
    this.chargeLoop = this.fx.loop('desg-carga', null, { gain: 0.75, fadeIn: 0.35, from: 2, to: 4 });
    this.fx.play('desg-saca', { gain: 0.6, rate: 0.6 });
    g.net?.share('desg', { k: 'q', id: g.net.id, on: 1 });
  }

  // Mientras carga: la hoja chupa luz, la pantalla tiembla y se empieza a rajar.
  stepCharge(dt, st) {
    const g = this.g;
    const CH = st.charge;
    const k = Math.min(1, this.t / CH.full);
    this.chargeK = k;
    g.fx.addShake(dt * (0.15 + 0.5 * k));
    // lo que entra a la hoja (polvo violeta y oro de alrededor)
    const at = this.handWorld(tmpV2, 0.1, 0.45, -0.55);
    const n = Math.random() < 0.6 + k * 0.4 ? 2 + Math.round(k * 3) : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * 1.4;
      const r = 1.6 + Math.random() * 2.2;
      const x = at.x + Math.cos(a) * Math.cos(b) * r;
      const y = at.y + Math.sin(b) * r;
      const z = at.z + Math.sin(a) * Math.cos(b) * r;
      const tt = 0.35;
      g.fx.add.spawn(x, y, z, (at.x - x) / tt, (at.y - y) / tt, (at.z - z) / tt, { color: i % 2 ? [1.3, 0.95, 0.45] : PAL.furia.dust[i % 3], size: 0.05, size1: 0.01, life: tt, drag: 0 });
    }
    if (k >= 1 && !this.chargeFull) {
      this.chargeFull = true;
      this.fx.play('desg-lista', { gain: 0.7, rate: 0.8 });
      g.fx.flash(at, 0xffc860, 4, 0.2, 5);
    }
  }

  // Soltó: si cargó lo mínimo, baja la siega por arriba y abre la ruptura grande.
  releaseCharge(st) {
    const g = this.g;
    const CH = st.charge;
    this.chargeLoop?.stop(0.15);
    this.chargeLoop = null;
    this.chargeFull = false;
    g.net?.share('desg', { k: 'q', id: g.net?.id ?? 0, on: 0 });
    if (!CH || this.t < CH.min) {
      this.chargeK = 0;
      this.toIdle();
      // (guadana5: soltar antes del mínimo es un tajo común, no nada)
      if (CH && globalThis.__mduDesgOldChargeInput !== true) this.startSlash(st);
      return;
    }
    this.chargedK = Math.max(0.5, Math.min(1, this.t / CH.full));
    this.chargeK = 0;
    this.chargeCd = CH.cd;
    this.combo = COMBO.indexOf('alto') - 1;
    this.lastEnd = g.time;
    this.startSlash(st);
    // (la siega arranca desde la pose de la carga, no desde la quieta: sin salto)
    this.relBlend = globalThis.__mduDesgOldRelease === true ? 0 : 1;
  }

  // ---------------- los tajos ----------------
  startSlash(st) {
    const g = this.g;
    const w = this.w;
    this.relBlend = 0;
    const chain = g.time - this.lastEnd < 0.34;
    this.combo = chain ? (this.combo + 1) % COMBO.length : 0;
    this.move = COMBO[this.combo];
    const mv = MOVES[this.move];
    const rate = (g.player.perks.has('doubletap') ? 1.2 : 1) * (this.execOn ? 1.1 : 1);
    this.dur = (60 / st.rpm / rate) * mv.len;
    this.mode = 'slash';
    this.t = 0;
    this.cut = false;
    this.hit = false;
    w.state = 'cosmic';
    w.stateT = 0;
  }

  // El tajo arranca a cortar: el silbido, el tirón y la grieta en el aire.
  onCut(st, mv) {
    const g = this.g;
    const up = this.up;
    const pal = this.pal();
    this.fx.play(up ? 'desg-tajo-up' : 'desg-tajo', { gain: 0.75 * mv.k, rate: (this.furiaOn ? 1.12 : 1) * (mv.wide ? 0.85 : 1) });
    g.player.addRecoil(mv.kick[0], mv.kick[1]);
    if (this.move === 'alto' || this.move === 'remate') g.fx.addShake(mv.wide ? 0.12 : 0.06);
    // el remate: un paso adelante
    if (mv.wide && !g.player.ride && (g.player.swim || 0) < 2) this.step(0.9);
    const fwd = this.aim(tmpF, true);
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const P = g.player.pos;
    const eye = this.eye(tmpV2);
    const o = tmpV.set(P.x, eye.y - 0.42, P.z);
    const RF = mv.rift;
    const S = mv.wide ? st.finisher : st.slash;
    const life = (st.rift?.life || 1.5) * (mv.wide ? 1.2 : 1);
    const sweep = Math.max(0.05, (mv.trail[1] - mv.cut) * this.dur * 0.75);
    const R = RF.R * (S.range / 4);
    this.lastRift = this.fx.rift({ o, yaw, roll: RF.roll, kind: 'arc', R, half: RF.half, w: RF.w * (this.furiaOn ? 1.25 : 1), life, sweep, flip: RF.flip, pal, own: true, st, swallow: !!st.rift?.swallow, glass: st.rift?.swallow ? 14 : 0 });
    this.fx.play('desg-grieta', { gain: 0.45 * mv.k, rate: 0.9 + Math.random() * 0.2 });
    // con la Furia, cada tajo larga su onda: la grieta sale volando hacia
    // adelante y corta todo lo que cruza (una vez a cada uno)
    if (this.furiaOn && st.furia?.wave) this.furiaWave(o, fwd, yaw, mv, R, st, pal, true);
    // (v3) la ejecutora: cada tajo larga una onda rosa que ejecuta lo que cruza
    else if (this.execOn && WEAPONS[ID].exec.wave && globalThis.__mduNoExecWave !== true) this.furiaWave(o, fwd, yaw, mv, R, st, pal, true, WEAPONS[ID].exec.wave);
    g.net?.share('desg', { k: 's', id: g.net?.id ?? 0, p: r2(o), y: +yaw.toFixed(2), m: COMBO.indexOf(this.move), R: +R.toFixed(2), L: +life.toFixed(2), w: +sweep.toFixed(2), u: up ? 1 : 0, c: pal === 'exec' ? 2 : pal === 'furia' ? 1 : 0 });
    this.emit({ type: 'cut', how: this.move, o: eye.clone(), fwd: fwd.clone(), range: S.range });
  }

  doSlash(st, mv) {
    const g = this.g;
    const S = mv.wide ? st.finisher : st.slash;
    const P = g.player.pos;
    const fwd = this.aim(tmpF, true);
    const eye = this.eye(new THREE.Vector3());
    const list = [];
    for (const { z, d } of g.zombies.inRadius(P, S.range + 0.7, near)) {
      const dx = z.pos.x - P.x;
      const dz = z.pos.z - P.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len > 0.9 && (dx / len) * fwd.x + (dz / len) * fwd.z < S.cos) continue;
      if (Math.abs(z.pos.y - P.y) > 2.6 && !z.crow) continue;
      if (len > 1.2 && !g.world.clear(eye, tmpV2.set(z.pos.x, aimY(z), z.pos.z))) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    let hit = 0;
    const pal = PAL[this.pal()];
    // (v4) la del Eclipse (y la ejecutora): cada tajo abre un agujero negro chico
    // donde pega (en el medio de los que corta) y se traga a los que mata
    // (regla, no de vez en cuando). globalThis.__mduNoSlashHole: como en la v3
    let hole = null;
    const HC = st.hole || (this.execOn && WEAPONS[ID].exec.hole ? WEAPONS[ID].pap.hole : null);
    if (HC && !mv.wide && globalThis.__mduNoSlashHole !== true) {
      let n = 0;
      const c = new THREE.Vector3();
      for (const { z } of list.slice(0, S.targets)) {
        if (big(z)) continue;
        c.x += z.pos.x;
        c.z += z.pos.z;
        n++;
      }
      if (n) {
        c.x /= n;
        c.z /= n;
        const dx = c.x - P.x;
        const dz = c.z - P.z;
        const dl = Math.hypot(dx, dz) || 1;
        const rr = Math.max(2.4, Math.min(3.4, dl));
        hole = c.set(P.x + (dx / dl) * rr, eye.y - 0.35, P.z + (dz / dl) * rr);
        const R = HC.R * (1 + Math.min(4, n - 1) * 0.1);
        this.fx.hole(hole, R, HC.life, { pal: this.pal(), gold: !this.execOn, own: true });
        g.net?.share('desg', { k: 'h', id: g.net.id, p: r2(hole), R: +R.toFixed(2), L: HC.life, c: this.execOn ? 2 : 0 });
      }
    }
    for (const { z } of list.slice(0, S.targets)) {
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      // (el remate los levanta y los tira para afuera: 'blast'; a los jefes, el tajo)
      const fling = mv.wide && !big(z) && globalThis.__mduNoRemateFling !== true;
      const out = fling ? new THREE.Vector3(z.pos.x - P.x, 0, z.pos.z - P.z).normalize().addScaledVector(fwd, 0.6).normalize().setY(0.6) : fwd.clone();
      // (v3, la del Eclipse) los del tajo se los traga la grieta: un punto de la
      // raja entre el jugador y el muerto
      let sw = null;
      if (hole && !big(z)) sw = hole;
      else if (st.rift?.swallow && !big(z) && !mv.wide) {
        const dl = Math.hypot(z.pos.x - P.x, z.pos.z - P.z) || 1;
        const rr = Math.min(dl * 0.75, this.lastRift?.R || 2.5);
        sw = new THREE.Vector3(P.x + ((z.pos.x - P.x) / dl) * rr, eye.y - 0.42, P.z + ((z.pos.z - P.z) / dl) * rr);
      } else if (mv.wide && S.rupture && !big(z) && globalThis.__mduNoRupture !== true) {
        // (el remate del Eclipse: se los traga la ruptura de adelante)
        sw = new THREE.Vector3(P.x + fwd.x * S.rupture.at, P.y + 1.4, P.z + fwd.z * S.rupture.at);
      }
      this.hitZ(z, this.dmg(z, S, 1), { type: fling && !S.rupture ? 'blast' : 'scythe', zone: 'torso', point, dir: out, decap: Math.random() < (this.move === 'alto' ? 0.7 : 0.45), melee: true, swallow: sw, swallowDur: hole ? 0.32 + Math.random() * 0.2 : undefined }, mv.wide ? 'remate' : 'tajo');
      g.fx.sparks(point, 0.3, tmpV2.set(fwd.x, 0.5, fwd.z), pal.dust[1]);
      g.fx.sparkle(point, pal.edge, 4, 0.5);
      // (v4) la raja del corte en los primeros tres
      if (hit < 3) this.fx.cutMark(point, out, this.pal());
      hit++;
    }
    if (hit) {
      // (el peso: frena la mano, sacude y tira la vista; más con más muertos)
      this.stopT = mv.stop + Math.min(0.04, hit * 0.008);
      g.hud.hitmarker(false);
      this.fx.play('desg-corte', { gain: Math.min(1.3, 0.75 + hit * 0.12) });
      g.fx.addShake(0.11 + Math.min(0.26, hit * 0.04) + (mv.wide ? 0.12 : 0));
      g.player.addRecoil(mv.kick[0] * 0.8, mv.kick[1] * 0.5);
    }
    // (v4) el golpe cargado de la del Eclipse: la ruptura grande
    if (this.chargedK > 0 && st.charge) {
      const k = this.chargedK;
      this.chargedK = 0;
      const R0 = st.charge.rupture;
      this.rupture({ ...R0, kill: R0.kill * (0.7 + 0.3 * k), radius: R0.radius * (0.75 + 0.25 * k) }, fwd, st, true);
    }
    // el remate revienta: la onda que levanta y tira a los que mata y empuja
    // a los que quedan, adelante
    else if (mv.wide && S.rupture && globalThis.__mduNoRupture !== true) this.rupture(S.rupture, fwd, st);
    else if (mv.wide && S.wave) {
      const c = new THREE.Vector3(P.x + fwd.x * 1.6, P.y, P.z + fwd.z * 1.6);
      this.fx.nova(c, S.wave.radius, { pal: this.pal(), dust: true, big: globalThis.__mduNoDesgFx4 === true ? 1.2 : 1.5 });
      this.novaHits(c, S.wave, 'remate');
    }
    g.stats.shots++;
    g.yasy?.onMelee?.();
  }

  // Cuánto le pega a uno: de un golpe hasta la ronda oneHit; después de a dos
  // (12 rondas más) y de a tres. A los jefes, una parte de su vida, nunca de
  // una. La Furia: x furia.dmg. La ejecutora: a los comunes, siempre de uno.
  dmg(z, S, k = 1) {
    const g = this.g;
    const st = this.st;
    const fk = this.furiaOn && st?.furia ? st.furia.dmg : 1;
    if (big(z)) return Math.max(S.bossMin || 0, (z.maxHp || bossHealth(g.rounds?.round || 1)) * (S.boss || 0)) * k * fk;
    const r = g.rounds?.round || 1;
    const one = Math.max(zombieHealth(r), z.maxHp || 0) * 1.12;
    if (this.execOn) return one;
    if (r <= (S.oneHit ?? st?.slash?.oneHit ?? 45)) return one * k * fk;
    return (zombieHealth(r) / (r <= (S.oneHit ?? 45) + 12 ? 1.9 : 2.8)) * k * fk;
  }

  // El golpe (y la cuenta de las bajas: la Furia, la cura, la nube rosa).
  // how: qué lo mató (para las misiones).
  hitZ(z, amount, info, how) {
    const g = this.g;
    const was = !!z.dead;
    // (de invitado: hacia dónde va el corte, para cuando llegue el muerto partido)
    if (info.type === 'slice' && info.dir) z.sliceDir = { x: info.dir.x, z: info.dir.z, t: g.time };
    // (v3) tragado por la grieta: muere 'slice' y desgarradorFx.slice lo hace
    // entrar en el punto (los demás se enteran por 'w')
    if (info.swallow && !big(z) && !z.dead && globalThis.__mduNoSwallow !== true) {
      const dur = info.swallowDur || 0.55;
      z.swallowAt = { p: info.swallow.clone(), t: g.time, dur };
      info.type = 'slice';
      if (g.net) (this.swq ||= []).push([z === g.zombies.boss ? 0xffff : z.id & 0xffff, +info.swallow.x.toFixed(2), +info.swallow.y.toFixed(2), +info.swallow.z.toFixed(2), +dur.toFixed(2)]);
    }
    g.zombies.damage(z, amount, info);
    if (big(z)) return false;
    // (de invitado lo mata el anfitrión: alcanza con que el golpe lo mate)
    // (el rayo los hace polvo: 'luz' los libera en el acto y dead ya volvió a false)
    const killed = g.net?.guest ? amount >= zombieHealth(g.rounds?.round || 1) * 0.95 : !was && (z.dead || !z.active);
    if (!killed || (this.counted.get(z) ?? -9) > g.time - 2) return false;
    this.counted.set(z, g.time);
    this.onKill(z, how);
    return true;
  }

  onKill(z, how) {
    const g = this.g;
    const st = this.st;
    const p = g.player;
    if (this.furiaOn && st?.furia) {
      // la Furia: cada baja cura
      if (p.alive && !p.downed) p.health = Math.min(p.maxHealth, p.health + st.furia.heal);
    } else if (st?.furia) this.addKill(st.furia, this.execOn ? WEAPONS[ID].exec.furia : 1);
    // (la Furia del Eclipse: el ejecutado se hace polvo de estrellas que va al jugador)
    if (this.furiaOn && st?.furia?.dust && p.alive) this.fx.stardust(new THREE.Vector3(z.pos.x, (z.baseY ?? z.pos.y) + 1, z.pos.z), this.handWorld(tmpV2, 0, -0.35, -0.3));
    // la ejecutora: revienta en la nube rosa (los de la nube no hacen otra)
    if (this.execOn && how !== 'nube') {
      this.fx.execMark(tmpV3.set(z.pos.x, (z.baseY ?? z.pos.y) + 1.1, z.pos.z));
      this.fx.play('desg-exec', { pos: tmpV3, gain: 0.7 });
      this.burst(z);
    }
    this.emit({ type: 'kill', how, z, pos: z.pos.clone() });
  }

  addKill(F, n = 1) {
    // (el Catalizador Caótico pide menos bajas: entities/eclipse/catalizador.js)
    const need = furiaKills(this.g, F.kills);
    if (this.kills >= need) return;
    this.kills = Math.min(need, this.kills + n);
    if (this.kills >= need) {
      // (furia11: "Cuando la barra se llena 'furia se cargo.mp3'": el grabado
      // en vez del horneado, una vez por llenado)
      if (OLD_FURIA11()) this.fx.play('desg-lista', { gain: 0.8 });
      else furiaSnd(this.g, 'furia-cargada', { gain: 1, reverb: 0.2 });
      if (!this.furiaTold && !globalThis.__mduNoFuriaHint) {
        this.furiaTold = true;
        // (la acción 'furia' está en Controles solo con el mapa prendido: si no, la H)
        const k = keyLabel('furia');
        this.g.hud.subtitle?.(`¡Furia Cósmica lista! [${k && k !== '—' ? k : 'H'}]`, 3.5);
      }
    }
  }

  // La nube rosa de la ejecutora: lastima a los de al lado (una vez).
  burst(z) {
    const g = this.g;
    const X = WEAPONS[ID].exec.cloud;
    const p = new THREE.Vector3(z.pos.x, (z.baseY ?? z.pos.y) + 1.1, z.pos.z);
    this.fx.cloud(p);
    g.net?.share('desg', { k: 'c', id: g.net.id, p: r2(p) });
    const r = g.rounds?.round || 1;
    for (const { z: o } of g.zombies.inRadius(p, X.radius, near)) {
      if (o === z || big(o)) continue;
      const dir = new THREE.Vector3(o.pos.x - p.x, 0.4, o.pos.z - p.z).normalize();
      this.hitZ(o, zombieHealth(r) * X.frac, { type: 'blast', zone: 'torso', point: new THREE.Vector3(o.pos.x, aimY(o), o.pos.z), dir }, 'nube');
    }
  }

  // ---------------- las grietas ----------------
  // Las propias lastiman a los que las cruzan (cada RIFT.tick; a cada uno, no
  // más seguido que eso).
  riftHits(rf, dt) {
    const g = this.g;
    const st = rf.st;
    if (!st?.rift) return;
    // (las suyas: la onda de la Furia, la raja del piso; la que vuela mira cada cuadro)
    const RF = rf.spec || rf.frac != null ? { ...st.rift, ...(rf.frac != null ? { frac: rf.frac } : null), ...rf.spec } : st.rift;
    rf.tickT -= dt;
    if (rf.tickT > 0) return;
    rf.tickT = rf.vel ? 0 : RF.tick;
    // (lo que ya se abrió de la grieta)
    const open = Math.min(1, rf.t / rf.sweep);
    const reach = rf.kind === 'line' ? rf.len / 2 + 1.5 : rf.R + 1.5;
    let n = 0;
    for (const { z } of g.zombies.inRadius(rf.o, reach, near)) {
      if ((rf.hits.get(z) ?? -9) > g.time) continue;
      let inside = false;
      for (const h of [0.45, 0.95, 1.45]) {
        tmpV.set(z.pos.x - rf.o.x, (z.dog ? (z.yacY ?? z.pos.y) + 0.3 : z.pos.y + h * (z.scale || 1)) - rf.o.y, z.pos.z - rf.o.z).applyQuaternion(rf.qi);
        if (Math.abs(tmpV.y) > rf.w * 1.6 + 0.3) continue;
        if (rf.kind === 'line') {
          inside = Math.abs(tmpV.x) < rf.len / 2 + 0.25 && Math.abs(tmpV.z) < (rf.fault ? 0.6 : 0.5);
        } else {
          const rr = Math.hypot(tmpV.x, tmpV.z);
          const a = Math.atan2(tmpV.x, -tmpV.z);
          const u = (rf.half - a) / (2 * rf.half);
          const uu = rf.U.uFlip.value > 0.5 ? 1 - u : u;
          inside = Math.abs(rr - rf.R) < 0.55 + 0.2 * (z.scale || 1) && u >= -0.03 && u <= 1.03 && uu <= open;
        }
        if (inside) break;
      }
      if (!inside) continue;
      rf.hits.set(z, g.time + (rf.again ?? RF.again));
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const amount = big(z) ? Math.max(RF.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * RF.boss) : this.dmg(z, st.slash, RF.frac);
      // (la del Eclipse: el punto de la grieta más cerca; la falla, abajo del piso)
      let sw = null;
      if (rf.swallow && !big(z)) {
        tmpV.set(z.pos.x - rf.o.x, z.pos.y + 1 - rf.o.y, z.pos.z - rf.o.z).applyQuaternion(rf.qi);
        if (rf.kind === 'line') tmpV.set(Math.max(-rf.len / 2, Math.min(rf.len / 2, tmpV.x)), 0, rf.fault ? -0.7 : 0);
        else {
          const a = Math.atan2(tmpV.x, -tmpV.z);
          tmpV.set(Math.sin(a) * rf.R, 0, -Math.cos(a) * rf.R);
        }
        sw = tmpV.applyQuaternion(rf.q).add(rf.o).clone();
      }
      this.hitZ(z, amount, { type: 'scythe', zone: 'torso', point, dir: tmpV2.set(z.pos.x - rf.o.x, 0, z.pos.z - rf.o.z).normalize().clone(), decap: Math.random() < 0.4, melee: true, swallow: sw, swallowDur: rf.fault ? 0.7 : 0.5 }, rf.fault ? 'falla' : 'grieta');
      g.fx.sparkle(point, PAL[rf.pal]?.edge || PAL.base.edge, 5, 0.5);
      n++;
    }
    if (n) g.hud.hitmarker(false);
  }

  // La onda de la Furia: la grieta del tajo sale volando hacia adelante (hasta
  // la pared o su alcance) y crece; la propia corta a los que cruza (una vez).
  furiaWave(o, fwd, yaw, mv, R, st, pal, own, Wv = null) {
    const g = this.g;
    const W = Wv || st?.furia?.wave || WEAPONS[ID].furia.wave;
    const RF = mv.rift;
    const wall = g.world.raycast(tmpV3.set(o.x, o.y, o.z), tmpF2.set(fwd.x, 0, fwd.z).normalize(), W.range + R, hitTmp);
    const travel = Math.max(1, Math.min(W.range, (Number.isFinite(wall) ? wall : W.range + R) - R - 0.3));
    this.fx.rift({ o, yaw, roll: RF.roll, kind: 'arc', R: R * 0.85 * (W.wide || 1), half: RF.half * 0.9, w: 0.09 * (W.wide || 1), life: travel / W.speed + 0.3, sweep: 0.05, flip: RF.flip, pal, own, st: own ? st : null, vel: tmpF2.clone().multiplyScalar(W.speed), travel, grow: { to: R * 1.5, time: 0.45 }, spec: { frac: W.frac, boss: W.boss, bossMin: W.bossMin }, again: 99 });
    this.fx.play('desg-onda', { pos: own ? null : o, gain: 0.7 });
  }

  // Un estallido: a todos los del radio. Los comunes que mata salen volando
  // (los levanta y los tira para afuera: 'blast'); los que quedan, empujados
  // (el anfitrión; el invitado se lo pide con 'p'). A los jefes, una parte.
  novaHits(p, N, how) {
    const g = this.g;
    const st = this.st || weaponStatsOf(this.up);
    if (!N || !st) return 0;
    let n = 0;
    for (const { z } of g.zombies.inRadius(p, N.radius, near)) {
      if (Math.abs(z.pos.y - p.y) > 2.4 && !z.crow) continue;
      const dir = new THREE.Vector3(z.pos.x - p.x, 0, z.pos.z - p.z);
      if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      if (big(z)) {
        this.hitZ(z, Math.max(N.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * N.boss), { type: 'scythe', zone: 'torso', point, dir, melee: true }, how);
        continue;
      }
      const killed = this.hitZ(z, this.dmg(z, st.slash, N.frac), { type: 'blast', zone: 'torso', point, dir: dir.clone().setY(0.6), melee: true }, how);
      if (!killed && !g.net?.guest) this.shove(z, dir, N.push);
      n++;
    }
    if (n && g.net?.guest) g.net.share('desg', { k: 'p', id: g.net.id, p: r2(p), r: N.radius, v: N.push });
    if (n) g.hud.hitmarker(false);
    return n;
  }

  // ---------------- la guadaña espectral ----------------
  usesAmmo() {
    return !this.execOn && globalThis.__mduNoDesgAmmo !== true;
  }

  tryThrow(st) {
    const w = this.w;
    const s = w.slot;
    if (this.cd > 0 || (this.mode !== 'idle' && this.mode !== 'slash')) return false;
    if (this.usesAmmo() && s.mag <= 0) {
      this.g.audio.empty?.();
      if (s.reserve > 0) this.trySpin(st);
      return false;
    }
    this.mode = 'throw';
    this.t = 0;
    this.thrown = false;
    w.state = 'cosmic';
    w.stateT = 0;
    this.g.net?.act?.('throw', 0.4);
    return true;
  }

  // dónde está la hoja en el mundo (del jugador, no de la cámara: las
  // cinemáticas y las pruebas la mueven)
  handWorld(out, x = 0.22, y = -0.05, z = -0.75) {
    const p = this.g.player;
    _he.set(p.pitch, p.yaw, 0, 'YXZ');
    _hq.setFromEuler(_he);
    return out.set(x, y, z).applyQuaternion(_hq).add(tmpV3.set(p.pos.x, p.pos.y + (p.eye || 1.6), p.pos.z));
  }

  aim(out, flat = false) {
    const p = this.g.player;
    const cp = flat ? 1 : Math.cos(p.pitch);
    return out.set(-Math.sin(p.yaw) * cp, flat ? 0 : Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  eye(out) {
    const p = this.g.player;
    return out.set(p.pos.x, p.pos.y + (p.eye || 1.6), p.pos.z);
  }

  launch(st) {
    const g = this.g;
    const T = st.throw;
    const f = this.aim(new THREE.Vector3());
    f.y = Math.max(-0.4, Math.min(0.4, f.y));
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
    const o = this.handWorld(new THREE.Vector3());
    const up = this.up;
    const pal = this.pal();
    const home = (out) => this.handWorld(out, 0.1, 0.1, -0.6);
    if (T.trio && globalThis.__mduNoTrio !== true) {
      // (v3) tres: la del medio derecho a la punta (el pozo), las otras dos abiertas
      this.fx.throwStart({ id: g.net?.id ?? 0, own: true, up, o, f, r, R: T.reach * T.well.at, A: 0, T: T.time, st, pal, cfg: { well: T.well }, home });
      // (v4) las de los costados, al llegar, orbitan el pozo mientras dura
      const orbit = T.trio.orbit && globalThis.__mduNoTrioOrbit !== true ? { c: o.clone().addScaledVector(f, T.reach * T.well.at), time: T.well.time, w: T.trio.orbit } : null;
      this.fx.throwStart({ id: g.net?.id ?? 0, own: true, up, o, f, r, R: T.reach * 0.85, A: -T.side, T: T.time, st, pal, cfg: { pull: T.pull, burst: T.burst, orbit }, home, delay: T.trio.lag });
      this.fx.throwStart({ id: g.net?.id ?? 0, own: true, up, o, f, r, R: T.reach * 0.85, A: T.side, T: T.time, st, pal, cfg: { pull: T.pull, burst: T.burst, orbit: orbit && { ...orbit, w: -orbit.w } }, home, delay: T.trio.lag * 2 });
    } else this.fx.throwStart({ id: g.net?.id ?? 0, own: true, up, o, f, r, R: T.reach, A: T.side, T: T.time, st, pal, cfg: { pull: T.pull, burst: T.burst }, home });
    this.cd = T.cd;
    const s = this.w.slot;
    if (this.usesAmmo() && s?.id === ID) {
      s.mag = Math.max(0, s.mag - 1);
      this.w.updateHud();
    }
    this.fx.launchFx(o, f, pal, up);
    this.fx.play(T.trio && globalThis.__mduNoTrio !== true ? 'desg-lanza-up' : 'desg-lanza', { gain: 0.8 });
    g.player.addRecoil(0.02, -0.012);
    g.stats.shots++;
    g.net?.share('desg', { k: 't', id: g.net.id, p: r2(o), f: r2(f), r: r2(r), R: T.reach, A: T.side, T: T.time, u: up ? 1 : 0, c: pal === 'exec' ? 2 : pal === 'furia' ? 1 : 0, n: T.trio && globalThis.__mduNoTrio !== true ? 3 : 1 });
    this.emit({ type: 'throw', o: o.clone(), f: f.clone() });
  }

  // La espectral corta a lo que cruza (una vez a cada uno): los comunes que
  // mata quedan partidos al medio.
  flyHits(fl) {
    const g = this.g;
    const st = fl.st;
    const T = st.throw;
    const a = fl.prev;
    const b = fl.pos;
    const ab = tmpV.subVectors(b, a);
    const len = ab.length();
    const dir = len > 1e-4 ? ab.clone().divideScalar(len) : fl.f.clone();
    for (const { z } of g.zombies.inRadius(b, T.radius + len + 1.6, near)) {
      if (fl.hits.has(z)) continue;
      const c = tmpV2.set(z.pos.x, aimY(z), z.pos.z);
      const k = len > 1e-4 ? clamp01(tmpV3.subVectors(c, a).dot(dir) / len) : 0;
      const q = tmpV3.copy(a).addScaledVector(dir, k * len);
      const reach = T.radius + (big(z) ? 0.9 : 0.35);
      if (Math.hypot(q.x - c.x, q.z - c.z) > reach || Math.abs(q.y - c.y) > 1.7) continue;
      fl.hits.add(z);
      const point = c.clone();
      const boss = big(z);
      this.hitZ(z, boss ? Math.max(T.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * T.boss) : this.dmg(z, st.slash, T.frac), { type: boss ? 'scythe' : 'slice', zone: 'torso', point, dir: tmpV.set(dir.x, 0, dir.z).normalize().clone() }, 'guadaña');
      g.fx.sparks(point, 0.4, { x: dir.x, y: 0.4, z: dir.z }, PAL[fl.pal]?.dust[1] || PAL.base.dust[1]);
      this.fx.play('desg-corte', { pos: point, gain: 0.8 });
      g.hud.hitmarker(false);
    }
  }

  onBounce(fl) {
    const g = this.g;
    g.net?.share('desg', { k: 'tb', id: g.net.id, p: r2(fl.pos) });
  }

  // El destello al sacar la del Eclipse: chispas de oro y violeta que salen de
  // la hoja y una luz de oro un instante (de las del pool: no es luz nueva).
  drawFlash() {
    const g = this.g;
    const at = this.handWorld(tmpV2, 0.12, 0.3, -0.75);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 2.2;
      g.fx.add.spawn(at.x, at.y, at.z, Math.cos(a) * s, Math.random() * 1.6, Math.sin(a) * s, { color: i % 2 ? [1.4, 1, 0.35] : PAL.furia.dust[1], size: 0.04 + Math.random() * 0.03, size1: 0, life: 0.45 + Math.random() * 0.3, drag: 2.5 });
    }
    g.fx.flash(at, 0xffc860, 5, 0.3, 6);
  }

  // Volvió: se mete en la hoja (un brillo y su sonido).
  onCatch() {
    const g = this.g;
    g.net?.share('desg', { k: 'tc', id: g.net.id });
    this.fx.play('desg-vuelve', { gain: 0.6 });
    this.glowK = 1;
  }

  // ---------------- la embestida ----------------
  tryDash(st) {
    const g = this.g;
    const p = g.player;
    const D = st.dash;
    if (!D || this.dash) return false;
    if (this.dashCd > 0) {
      this.fx.play('desg-whoop', { gain: 0.25, rate: 0.6 });
      return false;
    }
    if (p.ride || (p.swim || 0) >= 2 || !p.alive) return false;
    const f = this.aim(new THREE.Vector3(), true);
    const len = this.dashReach(f, D.len);
    const time = D.time * (len / D.len) + 0.06;
    const a = p.pos.clone();
    this.dash = { t: 0, time, len, f, a, prev: a.clone(), hits: new Set(), st };
    if (len > 0.3) this.slideM = { a: a.clone(), f, len, t: 0, time };
    // durante la embestida no te tocan (y los muertos no arrancan a pegarte)
    p.guardT = Math.max(p.guardT || 0, g.time + time + 0.18);
    this.dashCd = this.execOn ? WEAPONS[ID].exec.dashCd : dashCdOf(g, D.cd);
    this.mode = 'dash';
    this.t = 0;
    this.w.state = 'cosmic';
    this.w.stateT = 0;
    this.fx.play('desg-embestida', { gain: 0.9 });
    g.fx.addShake(0.12);
    g.player.addRecoil(-0.01, 0);
    return true;
  }

  // Hasta dónde se puede ir derecho: de a pasitos, sin paredes (ni ventanas
  // tapiadas), sin bordes (ni escalones más altos que un escalón) y sin salir
  // del mapa. En las escaleras y las gradas sigue el piso.
  dashReach(f, len) {
    const g = this.g;
    const W = g.world;
    const P = g.player.pos;
    const R = (PLAYER.radius || 0.35) + 0.04;
    let x = P.x;
    let z = P.z;
    let y = P.y;
    let d = 0;
    const step = 0.25;
    const lv = W.levels || W.tower;
    while (d + step <= len + 1e-6) {
      const nx = x + f.x * step;
      const nz = z + f.z * step;
      if (W.inside && !W.inside(Math.floor(nx), Math.floor(nz))) break;
      const ny = W.floorAt(nx, nz, y + 0.5);
      if (!Number.isFinite(ny) || ny - y > 0.5 || y - ny > 0.9) break;
      // (y adelante del cuerpo también hay piso: no queda medio colgado del borde)
      const fy = W.floorAt(nx + f.x * R, nz + f.z * R, ny + 0.5);
      if (!Number.isFinite(fy) || ny - fy > 0.9) break;
      // (el paso de la navegación de los muertos frenaba en cada escalón de las
      // gradas: alcanza con lo de arriba y las barandas, que son cajas;
      // globalThis.__mduDashWalkLine: también con ese paso)
      if (lv && globalThis.__mduDashWalkLine === true && !walkLine(W, x, z, nx, nz, y)) break;
      const hy = Math.max(y, ny);
      if (!this.bodyFree(nx, nz, R, hy + 0.12, hy + 1.7)) break;
      x = nx;
      z = nz;
      y = ny;
      d += step;
    }
    return d;
  }

  // ¿Entra el cuerpo parado ahí? (como World.circleFree, con las ventanas)
  bodyFree(x, z, r, y0, y1) {
    const W = this.g.world;
    if (!W.cellBoxes) return W.circleFree ? W.circleFree(x, z, r, y0, y1) : true;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const rr = r * r;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!W.inside(cx + dx, cz + dz)) continue;
        for (const b of W.cellBoxes[W.idx(cx + dx, cz + dz)]) {
          if (!b.active || !b.solid) continue;
          if (b.y1 <= y0 || b.y0 >= y1) continue;
          const nx = Math.max(b.x0, Math.min(x, b.x1));
          const nz = Math.max(b.z0, Math.min(z, b.z1));
          if ((x - nx) ** 2 + (z - nz) ** 2 < rr) return false;
        }
      }
    }
    return true;
  }

  stepDash(dt) {
    const g = this.g;
    const D = this.dash;
    D.t += dt;
    const P = g.player.pos;
    this.dashHits(D, D.prev, P);
    D.prev.copy(P);
    if (D.t >= D.time) {
      this.dash = null;
      const b = P.clone();
      const pal = this.pal();
      // la raja en el piso (lastima al que la pisa) y el estallido del final
      this.fx.dashFx(D.a, b, pal, true, D.st.dash, D.st);
      this.novaHits(b, D.st.dash.burst, 'embestida');
      g.player.addRecoil(0.03, 0);
      g.net?.share('desg', { k: 'd', id: g.net.id, a: r2(D.a), b: r2(b), u: this.up ? 1 : 0, c: pal === 'exec' ? 2 : pal === 'furia' ? 1 : 0 });
      this.emit({ type: 'dash', from: D.a.clone(), to: b });
    }
  }

  // Los que cruza la embestida (el pasillo de a a b, una vez a cada uno).
  dashHits(D, a, b) {
    const g = this.g;
    const st = D.st;
    const DS = st.dash;
    const fx = b.x - a.x;
    const fz = b.z - a.z;
    const len = Math.hypot(fx, fz);
    const dir = len > 1e-4 ? tmpF.set(fx / len, 0, fz / len) : tmpF.copy(D.f);
    const c = tmpV.set((a.x + b.x) / 2, b.y + 1, (a.z + b.z) / 2);
    let n = 0;
    for (const { z } of g.zombies.inRadius(c, len / 2 + DS.half + 1.2, near)) {
      if (D.hits.has(z)) continue;
      const dx = z.pos.x - a.x;
      const dz = z.pos.z - a.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < -0.6 || along > len + 1.0) continue;
      const lat = Math.abs(dx * -dir.z + dz * dir.x);
      if (lat > DS.half + 0.3 * (z.scale || 1)) continue;
      if (Math.abs(z.pos.y - b.y) > 2 && !z.crow) continue;
      D.hits.add(z);
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const boss = big(z);
      const amount = boss ? Math.max(DS.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * DS.boss) : this.dmg(z, st.slash, DS.frac);
      this.hitZ(z, amount, { type: boss ? 'scythe' : 'slice', zone: 'torso', point, dir: dir.clone(), melee: true }, 'embestida');
      g.fx.sparks(point, 0.5, { x: dir.x, y: 0.5, z: dir.z }, PAL[this.pal()].dust[1]);
      n++;
    }
    if (n) {
      g.hud.hitmarker(false);
      this.fx.play('desg-corte', { gain: Math.min(1.3, 0.8 + n * 0.1) });
      this.stopT = 0.04;
    }
  }

  // Un pasito (el remate): como el facón, sin atravesar nada.
  step(len) {
    const p = this.g.player;
    const f = this.aim(new THREE.Vector3(), true);
    const d = this.dashReach(f, len);
    if (d < 0.2 || this.slideM) return;
    this.slideM = { a: p.pos.clone(), f, len: d, t: 0, time: 0.16 };
  }

  // El envión de la embestida y del remate: el jugador va por el camino que
  // se midió, exacto (Player.lunge se pasaba hasta un cuadro entero: en un
  // borde sin baranda, abajo). Lo de las teclas no lo empuja mientras tanto.
  glide(dt) {
    const M = this.slideM;
    const P = this.g.player;
    M.t += dt;
    const k = Math.min(1, M.t / M.time);
    const want = M.len * (1 - (1 - k) * (1 - k));
    P.pos.x = M.a.x + M.f.x * want;
    P.pos.z = M.a.z + M.f.z * want;
    P.vel.x = 0;
    P.vel.z = 0;
    if (k >= 1) this.slideM = null;
  }

  // ---------------- la ruptura (el remate del Desgarrador del Eclipse) ----------------
  // R: { at, kill, radius, push, reel, boss, bossMin, bubble }. Adelante, a R.at
  // m, el espacio se rompe: se traga a los de R.kill m, tumba a los de R.radius
  // m, el tiempo se frena en la burbuja y la pantalla se rasga.
  // (v4) big: el golpe cargado (más grande, el agujero negro en el medio, la
  // pantalla rasgada más tiempo y el cielo que responde)
  rupture(R, fwd, st, bigR = false) {
    const g = this.g;
    const P = g.player.pos;
    const c = new THREE.Vector3(P.x + fwd.x * R.at, P.y, P.z + fwd.z * R.at);
    const pal = this.pal();
    this.fx.rupture(c, R, pal, true, bigR);
    this.rip = bigR ? 1.6 : 1;
    this.ripA = (Math.random() - 0.5) * 0.9 + Math.PI / 2;
    this.ripSeed = Math.random() * 50;
    const hole = new THREE.Vector3(c.x, P.y + 1.4, c.z);
    if (bigR) {
      // (el cielo de Eclipse responde: w.eclipse.pulse, el estallido del eclipse)
      if (globalThis.__mduNoDesgSky !== true) g.world?.eclipse?.pulse?.(1);
      g.post?.flash?.(0.12);
    }
    let n = 0;
    let pushed = 0;
    for (const { z } of g.zombies.inRadius(c, R.radius, near)) {
      if (Math.abs(z.pos.y - P.y) > 3 && !z.crow) continue;
      const dir = new THREE.Vector3(z.pos.x - c.x, 0, z.pos.z - c.z);
      const d = dir.length();
      if (d < 1e-3) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      if (big(z)) {
        if (d < R.kill) this.hitZ(z, Math.max(R.bossMin, (z.maxHp || bossHealth(g.rounds?.round || 1)) * R.boss), { type: 'scythe', zone: 'torso', point, dir, melee: true }, 'remate');
        continue;
      }
      if (d < R.kill) {
        const r = g.rounds?.round || 1;
        this.hitZ(z, Math.max(zombieHealth(r), z.maxHp || 0) * 1.2, { type: 'scythe', zone: 'torso', point, dir, melee: true, swallow: hole, swallowDur: bigR ? 0.45 + d * 0.07 : 0.38 + d * 0.06 }, 'remate');
        n++;
      } else if (!g.net?.guest) {
        this.shove(z, dir, R.push * (1 - (d / R.radius) * 0.5), R.reel);
        pushed++;
      } else pushed++;
    }
    if (pushed && g.net?.guest) g.net.share('desg', { k: 'p', id: g.net.id, p: r2(c), r: R.radius, v: R.push, d: R.reel });
    // la burbuja: el tiempo se frena para los muertos (el anfitrión los mueve;
    // el invitado lo hace igual para que se vean lentos)
    if (R.bubble) this.slowZone(c, R.bubble.radius, R.bubble.time, R.bubble.slow);
    if (n) g.hud.hitmarker(false);
    g.fx.addShake(bigR ? 0.8 : 0.5);
    g.player.addRecoil(bigR ? 0.09 : 0.05, 0);
    g.net?.share('desg', { k: 'u', id: g.net.id, p: r2(c), c: pal === 'exec' ? 2 : pal === 'furia' ? 1 : 0, b: bigR ? 1 : 0 });
  }

  // La burbuja del tiempo: los muertos de r m andan a s de su velocidad unos
  // segundos (y después vuelven a la suya).
  slowZone(c, r, time, s) {
    const g = this.g;
    if (globalThis.__mduNoTimeBubble === true) return;
    for (const { z } of g.zombies.inRadius(c, r, near)) {
      if (z.dead || z.boss || big(z)) continue;
      if (z.tbOrig == null) z.tbOrig = z.speed;
      z.speed = z.tbOrig * s;
      z.tbUntil = g.time + time;
      this.slowed.add(z);
    }
  }

  stepSlowed() {
    const g = this.g;
    for (const z of this.slowed) {
      if (!z.active || z.dead || g.time >= (z.tbUntil || 0)) {
        if (z.tbOrig != null) z.speed = z.tbOrig;
        z.tbOrig = null;
        this.slowed.delete(z);
      }
    }
  }

  // El pozo se cerró (la propia): se traga a los del medio, a los jefes les saca.
  wellHits(p, W) {
    const g = this.g;
    const r = g.rounds?.round || 1;
    let n = 0;
    for (const { z } of g.zombies.inRadius(p, W.core + 0.6, near)) {
      if (Math.abs(z.pos.y - p.y) > 3.2 && !z.crow) continue;
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const dir = new THREE.Vector3(p.x - z.pos.x, 0, p.z - z.pos.z).normalize();
      if (big(z)) this.hitZ(z, Math.max(W.bossMin, (z.maxHp || bossHealth(r)) * W.boss), { type: 'scythe', zone: 'torso', point, dir, melee: true }, 'pozo');
      else this.hitZ(z, Math.max(zombieHealth(r), z.maxHp || 0) * 1.2, { type: 'scythe', zone: 'torso', point, dir, swallow: p, swallowDur: 0.32 + Math.random() * 0.15 }, 'pozo');
      n++;
    }
    if (n) g.hud.hitmarker(false);
  }

  // La lluvia de guadañas de la Furia del Eclipse: cada tanto caen sobre los
  // muertos de alrededor (el que tiene la Furia elige y pega).
  rain(st) {
    const g = this.g;
    const R = st.furia.rain;
    const P = g.player.pos;
    const list = [];
    for (const { z } of g.zombies.inRadius(P, R.radius, near)) if (!z.dead && z.active && z.state !== 'rise' && Math.abs(z.pos.y - P.y) < 4) list.push(z);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const pts = [];
    for (let i = 0; i < R.n; i++) {
      const z = list[i];
      let to;
      if (z) to = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      else {
        // (sin muertos: caen igual alrededor, a la vista)
        const a = Math.random() * Math.PI * 2;
        const d = 4 + Math.random() * (R.radius * 0.5);
        const x = P.x + Math.cos(a) * d;
        const zz = P.z + Math.sin(a) * d;
        const fy = g.world.floorAt(x, zz, P.y + 1);
        to = new THREE.Vector3(x, (Number.isFinite(fy) ? fy : P.y) + 1, zz);
      }
      this.fx.fall(to, true, this.up ? 1 : 0, this.pal(), st);
      pts.push(r2(to));
    }
    g.net?.share('desg', { k: 'r', id: g.net.id, l: pts, u: this.up ? 1 : 0 });
  }

  // Una de la lluvia se clavó en p: lo parte al medio y revienta alrededor.
  rainHit(p, st) {
    const g = this.g;
    const R = (st || this.st || weaponStatsOf(1)).furia?.rain;
    if (!R) return;
    const r = g.rounds?.round || 1;
    for (const { z } of g.zombies.inRadius(p, 2.4, near)) {
      if (Math.abs(z.pos.y - p.y) > 2.5) continue;
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      const dir = new THREE.Vector3(z.pos.x - p.x, 0, z.pos.z - p.z);
      if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
      dir.normalize();
      if (big(z)) this.hitZ(z, Math.max(R.bossMin, (z.maxHp || bossHealth(r)) * R.boss), { type: 'scythe', zone: 'torso', point, dir, melee: true }, 'lluvia');
      else this.hitZ(z, Math.max(zombieHealth(r), z.maxHp || 0) * 1.2, { type: 'slice', zone: 'torso', point, dir }, 'lluvia');
    }
  }

  // ---------------- el giro (la recarga) ----------------
  trySpin(st) {
    const w = this.w;
    const s = w.slot;
    if (this.mode !== 'idle' || s?.id !== ID) return false;
    if (s.mag >= st.mag || s.reserve <= 0) return false;
    const g = this.g;
    this.mode = 'spin';
    this.t = 0;
    this.spinT = st.spin.time * (g.player.reloadMult || 1);
    this.pushT = 0;
    w.state = 'cosmic';
    w.stateT = 0;
    this.fx.play('desg-giro', { gain: 0.9, rate: 1.1 / this.spinT });
    const p = g.player.pos;
    const o = tmpV.set(p.x, p.y + 1.25, p.z);
    this.fx.rift({ o, yaw: 0, kind: 'arc', R: 1.25, half: Math.PI, w: 0.06, life: this.spinT * 0.8, sweep: this.spinT * 0.55, pal: this.pal(), own: false });
    // el polvo que levanta y el anillo a ras del piso
    this.fx.spinFx(p.clone(), this.spinT, this.pal());
    g.net?.share('desg', { k: 'g', id: g.net.id, p: r2(o), d: +this.spinT.toFixed(2) });
    this.emit({ type: 'spin' });
    return true;
  }

  // Empuja (y lastima un poco) a los que están pegados. En línea, el empujón lo
  // hace el anfitrión ('p').
  spinPush(st) {
    const g = this.g;
    const S = st.spin;
    const P = g.player.pos;
    const pts = [];
    for (const { z } of g.zombies.inRadius(P, S.radius, near)) {
      if (Math.abs(z.pos.y - P.y) > 2) continue;
      const dir = new THREE.Vector3(z.pos.x - P.x, 0, z.pos.z - P.z);
      dir.normalize();
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      this.hitZ(z, big(z) ? 400 : this.dmg(z, st.slash, S.dmg), { type: 'scythe', zone: 'torso', point, dir, melee: true }, 'giro');
      if (!g.net?.guest) this.shove(z, dir, S.push);
      pts.push(z);
    }
    if (pts.length && g.net?.guest) g.net.share('desg', { k: 'p', id: g.net.id, p: r2(P), r: S.radius, v: S.push });
  }

  shove(z, dir, v, t = 0.55) {
    const g = this.g;
    if (!z || z.dead || z.boss || z.dog || !(z.state === 'chase' || z.state === 'attack' || z.state === 'reel')) return;
    g.zombies.setState(z, 'reel');
    z.reelT = t;
    z.reelV = { x: dir.x * v, z: dir.z * v };
  }

  finishSpin(st) {
    const w = this.w;
    const s = w.slot;
    if (s?.id === ID) {
      const take = Math.min(st.mag - s.mag, s.reserve);
      s.mag += take;
      s.reserve -= take;
      w.updateHud();
    }
  }

  // ---------------- la Furia Cósmica ----------------
  // (furia11) lit: ya concentró y pegó el golpe (igniteConc): ahora sí prende.
  // Sin lit, la H arranca la concentración (startConc) y la Furia espera.
  tryFuria(st, lit = false) {
    const g = this.g;
    const F = st?.furia;
    if (!F || this.furiaOn || this.kills < furiaKills(g, F.kills) || globalThis.__mduNoFuria === true) return false;
    const p = g.player;
    if (!p.alive || p.downed) return false;
    if (!lit && !OLD_FURIA11()) return this.startConc(st);
    this.kills = 0;
    this.furiaT = F.time;
    this.furiaMax = F.time;
    this.furiaLive = true;
    // (furia11: el grabado "se activo la furia" ya viene sonando desde que
    // empezó a concentrar; los bucles entran más de a poco, por debajo)
    if (!lit) this.fx.play('desg-furia', { gain: 1 });
    this.furiaLoop?.stop(0.1);
    this.furiaLoop = this.fx.loop('desg-furia-loop', null, { gain: 0.5, fadeIn: lit ? 2.4 : 0.6 });
    // (v3) y de fondo, el coro que zumba (el tramo parejo del horneado)
    this.furiaChoir?.stop(0.1);
    this.furiaChoir = this.fx.loop('desg-furia-coro', null, { gain: 0.24, fadeIn: lit ? 3 : 1.2, from: 2, to: 6 });
    // (guadana5: "cuando se entra en modo furia no se ve nada": sin el
    // destello de pantalla, la luz más chica y sin el rasgón de la pantalla.
    // globalThis.__mduNoFuriaSoft: como antes)
    const SOFT = globalThis.__mduNoFuriaSoft !== true;
    if (!SOFT) g.post?.flash?.(0.1);
    g.fx.addShake(SOFT ? 0.2 : 0.35);
    const at = tmpV.set(p.pos.x, p.pos.y + 1, p.pos.z);
    g.fx.flash(at, 0xb050ff, SOFT ? 5 : 12, 0.4, 10);
    // (furia11: nacían a 0,6 m de la cámara y de cerca eran bolas redondas
    // delante de la cara; ahora salen de más afuera y más chicas)
    const pr = lit ? 1.5 : 0.6;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fx.add.spawn(at.x + Math.cos(a) * pr, at.y + rnd() * 1.4, at.z + Math.sin(a) * pr, Math.cos(a) * 5, Math.random() * 2, Math.sin(a) * 5, { color: PAL.furia.dust[i % 3], size: lit ? 0.05 : 0.08, size1: 0, life: 0.7, drag: 2.5 });
    }
    // (v4) prende con un estallido alrededor (solo se ve)
    if (globalThis.__mduNoDesgFx4 !== true) this.fx.nova(p.pos.clone(), F.eclipse ? 9 : 6, { pal: 'furia', dust: true, big: 1.3, sound: false });
    // (v4) la del Eclipse: el Eclipse (la pantalla oscura con grietas de oro, el
    // cielo que estalla, el gong)
    if (F.eclipse && globalThis.__mduNoEclTint !== true) {
      this.fx.play('desg-eclipse', { gain: 0.7 });
      if (globalThis.__mduNoDesgSky !== true) g.world?.eclipse?.pulse?.(1.2);
      this.auraT = 0.6;
      if (!SOFT) this.rip = Math.max(this.rip, 0.8);
      this.ripA = Math.PI / 2 - 0.4;
      this.ripSeed = Math.random() * 50;
    }
    g.net?.share('desg', { k: 'f', id: g.net.id, on: 1 });
    this.emit({ type: 'furia', on: true });
    return true;
  }

  // (furia11) quiet: sin el sonido del final (partida nueva, limpiar)
  endFuria(quiet = false) {
    if (!this.furiaOn && !this.furiaLoop && !this.furiaLive) return;
    const g = this.g;
    // ("cuando la furia se acaba 'furia se acaba.mp3'"; furiaLive: estaba
    // prendida de verdad —el reloj ya llegó a cero cuando se llama desde update—)
    if (this.furiaLive && !quiet && !OLD_FURIA11() && g.state === 'playing') furiaSnd(g, 'furia-fin', { gain: 0.95, reverb: 0.25 });
    this.furiaLive = false;
    this.furiaT = 0;
    this.furiaLoop?.stop(0.8);
    this.furiaLoop = null;
    this.furiaChoir?.stop(1.2);
    this.furiaChoir = null;
    this.stopBeam();
    g.net?.share('desg', { k: 'f', id: g.net?.id ?? 0, on: 0 });
    this.emit({ type: 'furia', on: false });
  }

  // ---------------- (furia11) concentrar el poder y desatarlo ----------------
  // La H con la barra llena: para la guadaña delante como un báculo y junta
  // (CONC.time s): camina despacio, no lo tocan, el grabado va entrando, el
  // polvo se le mete en la cabeza del arma, un anillo se cierra sobre él y la
  // pantalla se tensa. Después baja el regatón contra el piso (CONC.hit s) y se
  // desata (igniteConc: la Furia de siempre). A mitad de otro golpe la H queda
  // esperando a que termine (furiaQ, hasta 2 s). La barra recién se gasta al
  // desatarse: si algo lo corta (otra arma, una granada), no se pierde.
  startConc(st) {
    const g = this.g;
    const w = this.w;
    const p = g.player;
    if (this.mode === 'conc') return false;
    if (this.mode !== 'idle' || (w.state !== 'idle' && w.state !== 'inspect')) {
      this.furiaQ = g.time + 2;
      return false;
    }
    this.furiaQ = 0;
    this.mode = 'conc';
    this.t = 0;
    this.concLit = false;
    this.concK = 0;
    this.concFlashT = 0;
    for (let j = 0; j < NP; j++) this.concFrom[j] = this.P[j];
    w.state = 'cosmic';
    w.stateT = 0;
    this.rHold = -1;
    this.holdL = 0;
    this.queued = false;
    // (Player.canBeHit: mientras junta, y un instante después del golpe, nadie lo toca)
    this.concGuard = g.time + CONC.time + CONC.hit + CONC.guard;
    p.guardT = Math.max(p.guardT || 0, this.concGuard);
    // ("Mientras se está prendiendo sonará esto... un fade in para que acumule
    // volumen": entra fundido y adelantado, para que su subida caiga con el golpe)
    stopSnd(g, this.concSnd, 0.1);
    this.concSnd = furiaSnd(g, 'furia-activa', { gain: 1, reverb: 0.3, offset: SND_OFF, fadeIn: CONC.sndFade });
    const fy = this.floorY(p.pos);
    this.concRing = this.fx.rift({ o: tmpV.set(p.pos.x, fy + 0.3, p.pos.z), yaw: 0, kind: 'arc', half: Math.PI, R: 5.4, grow: { to: 0.75, time: CONC.time + CONC.hit }, w: 0.11, life: CONC.time + CONC.hit + 0.06, sweep: 0.3, pal: 'furia', own: false });
    g.net?.share('desg', { k: 'fc', id: g.net.id, on: 1 });
    return true;
  }

  floorY(pos) {
    const fy = this.g.world.floorAt(pos.x, pos.z, pos.y + 0.5);
    return Number.isFinite(fy) && fy > pos.y - 3 ? fy : pos.y;
  }

  stepConc(dt, st) {
    const g = this.g;
    const p = g.player;
    if (this.concLit) {
      if (this.t >= CONC.time + CONC.hit + CONC.out) this.toIdle();
      return;
    }
    const k = Math.min(1, this.t / CONC.time);
    this.concK = k;
    this.tens = k * k * (3 - 2 * k);
    g.fx.addShake(dt * (0.06 + 0.4 * k * k));
    const gold = !!this.w.model?.cosmic?.up;
    const fy = this.floorY(p.pos);
    // el polvo del mundo que va hacia la cabeza del arma (delante de la cara)
    concWorld(g, this.handWorld(tmpV2, 0.16, 0.08, -0.7), fy, k, dt, gold, 1, 0.5);
    // el anillo que se cierra lo sigue
    const r = this.concRing;
    if (r?.on) {
      r.o.set(p.pos.x, fy + 0.3, p.pos.z);
      r.m.position.copy(r.o);
    }
    if (this.t >= CONC.time + CONC.hit) this.igniteConc(st);
  }

  // El golpe del regatón: se desata.
  igniteConc(st) {
    const g = this.g;
    const p = g.player;
    this.concLit = true;
    this.concK = 0;
    this.concRing = null;
    if (!this.tryFuria(st, true)) {
      this.cancelConc();
      this.toIdle();
      return;
    }
    // (el grabado sigue solo hasta el final)
    this.concSnd = null;
    this.gather?.burst();
    // (en primera persona, un corro de chispas alrededor, no pegado a la cara)
    concBurst(g, p.pos, this.floorY(p.pos), !!this.w.model?.cosmic?.up, 1.5, 2.5);
    g.fx.addShake(0.22);
    // la pantalla, de tensa, se suelta de golpe (fx/PostFX uTens)
    this.tens = -0.85;
  }

  // Algo la cortó antes del golpe: nada se gasta.
  cancelConc() {
    const g = this.g;
    const p = g.player;
    stopSnd(g, this.concSnd, 0.35);
    this.concSnd = null;
    const r = this.concRing;
    if (r?.on) r.life = Math.min(r.life, r.t + 0.3);
    this.concRing = null;
    this.concK = 0;
    this.concLit = false;
    this.furiaQ = 0;
    // (la guarda era la nuestra: se va enseguida)
    if (this.concGuard && p.guardT === this.concGuard) p.guardT = Math.min(p.guardT, g.time + 0.3);
    this.concGuard = 0;
    g.net?.share('desg', { k: 'fc', id: g.net?.id ?? 0, on: 0 });
  }

  // ---------------- el rayo (Furia, derecho mantenido) ----------------
  updateBeam(dt, st) {
    const g = this.g;
    const B = this.beam;
    const p = g.player;
    const live = B.want && g.time - B.inputT < 0.15 && this.furiaOn && (this.mode === 'idle' || this.mode === 'beam') && p.alive && !p.downed && this.w.state !== 'inspect';
    B.want = false;
    if (live && !B.on) this.startBeam();
    else if (!live && B.on) this.stopBeam();
    B.k = live ? Math.min(1, B.k + dt / 0.07) : Math.max(0, B.k - dt / 0.16);
    B.pk = live ? Math.min(1, B.pk + dt / 0.14) : Math.max(0, B.pk - dt / 0.22);
    if (B.k > 0 && B.rig) this.drawBeam(st, dt, live);
    else if (B.rig) {
      B.rig.release();
      B.rig = null;
    }
  }

  startBeam() {
    const g = this.g;
    const B = this.beam;
    B.on = true;
    B.grow = 0;
    B.tickT = 0;
    B.shareT = 0;
    B.rig ||= this.fx.rig();
    this.mode = 'beam';
    this.w.state = 'cosmic';
    B.loop?.stop(0.05);
    // (guadana5: el encendido y el rugido del rayo de vacío; globalThis.__mduDesgOldBeam: los de antes)
    if (globalThis.__mduDesgOldBeam === true) {
      this.fx.play('desg-rayo', { gain: 0.9 });
      B.loop = this.fx.loop('desg-rayo-loop', null, { gain: 0.7, fadeIn: 0.12 });
    } else {
      this.fx.play('desg-rayo5', { gain: 1 });
      B.loop = this.fx.loop('desg-rayo5-loop', null, { gain: 0.95, fadeIn: 0.1, from: 0.5, to: 2.5 });
    }
    g.fx.addShake(globalThis.__mduDesgOldBeam === true ? 0.15 : 0.4);
  }

  stopBeam() {
    const g = this.g;
    const B = this.beam;
    if (!B.on) return;
    B.on = false;
    B.loop?.stop(0.25);
    B.loop = null;
    if (this.mode === 'beam') this.toIdle();
    g.net?.share('desg', { k: 'b', id: g.net?.id ?? 0, o: 1 });
  }

  // La punta de la hoja en el mundo, donde se la ve en la pantalla (la mano se
  // dibuja con su propia cámara, de otro ángulo de visión).
  tipWorld(out, obj = null) {
    const w = this.w;
    const cam = this.g.camera;
    (obj || w.model.muzzle).getWorldPosition(out);
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(w.vmCamera.fov / 2));
    out.x *= k;
    out.y *= k;
    return cam.localToWorld(out);
  }

  drawBeam(st, dt, live) {
    const g = this.g;
    const B = this.beam;
    const R = st.furia.beam;
    const origin = g.camera.position;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const wall = g.world.raycast(origin, fwd, R.range, hitTmp);
    const reach = Math.min(R.range, wall);
    const end = B.to.copy(origin).addScaledVector(fwd, reach);
    // (v4: nace en la cabeza del arma, a la derecha a la altura del pecho; antes
    // en la punta de la hoja, que en la pose del rayo quedaba abajo y tapaba;
    // globalThis.__mduDesgBeamTip: desde la punta, como antes)
    const hd = globalThis.__mduDesgBeamTip !== true && this.w.model?.cosmic?.head;
    const tip = this.tipWorld(B.from, hd || null);
    if (live) B.grow = Math.min(B.grow + dt * 85, 99);
    const hitWall = Number.isFinite(wall) && wall < R.range;
    const len = tip.distanceTo(end);
    B.rig.set(tip, end, B.k, B.grow, hitWall, g.time, dt, false, R.ws ?? 0.85);
    if (!live) return;
    const fwdC = fwd.clone();
    // (guadana5: el rayo nuevo pesa: tiembla más y menos motitas, que se leían
    // como burbujas; globalThis.__mduDesgOldBeam: como antes)
    const NEWB = globalThis.__mduDesgOldBeam !== true;
    this.fx.motes(tip, end, len, dt, NEWB ? 0.35 : 1);
    if (hitWall && B.grow >= len) this.fx.impact(end, hitTmp.normal, dt, true);
    g.fx.addShake(dt * (NEWB ? 0.8 : 0.3));
    B.tickT -= dt;
    if (B.tickT <= 0) {
      B.tickT = R.tick;
      this.beamTick(st, origin, fwdC, Math.min(reach, Math.max(0, B.grow - 0.4)));
    }
    B.shareT -= dt;
    if (B.shareT <= 0 && g.net) {
      B.shareT = 0.1;
      g.net.share('desg', { k: 'b', id: g.net.id, a: r2(tip), b: r2(end), w: hitWall && B.grow >= len ? 1 : 0, z: B.kills.splice(0, 5) });
    }
  }

  // Cada tick: los que toca el rayo (un palo parado cada uno). Los comunes se
  // hacen polvo; a los jefes les saca de a poco.
  beamTick(st, origin, fwd, reach) {
    const g = this.g;
    if (reach <= 0.3) return;
    const R = st.furia.beam;
    let n = 0;
    for (const { z } of g.zombies.inRadius(origin, reach + 2, near)) {
      if (n >= 24) break;
      const k = z.scale || 1;
      const cy = aimY(z);
      const hh = z.dog ? 0.3 : 0.85 * k;
      let t = (z.pos.x - origin.x) * fwd.x + (cy - origin.y) * fwd.y + (z.pos.z - origin.z) * fwd.z;
      const y = Math.max(cy - hh, Math.min(cy + hh, origin.y + fwd.y * t));
      t = (z.pos.x - origin.x) * fwd.x + (y - origin.y) * fwd.y + (z.pos.z - origin.z) * fwd.z;
      if (t < 0.3 || t > reach + 0.3 * k) continue;
      const dx = z.pos.x - (origin.x + fwd.x * t);
      const dy = y - (origin.y + fwd.y * t);
      const dz = z.pos.z - (origin.z + fwd.z * t);
      if (dx * dx + dy * dy + dz * dz > (R.width + 0.3 * k) ** 2) continue;
      const point = new THREE.Vector3(z.pos.x, y, z.pos.z);
      n++;
      if (big(z)) {
        g.zombies.damage(z, Math.min(R.cap, R.boss * R.tick), { type: 'scythe', zone: 'torso', point, dir: fwd.clone(), cap: R.cap });
        if (Math.random() < 0.6) g.fx.sparks(point, 1, { x: -fwd.x, y: 0.5, z: -fwd.z }, PAL.furia.dust[0]);
        continue;
      }
      this.fx.dust(z, n < 5 ? 4 : 2, this.pal());
      if (this.beam.kills.length < 8) this.beam.kills.push(r2(point));
      this.hitZ(z, 1e9, { type: 'luz', zone: 'torso', point, dir: fwd.clone() }, 'rayo');
    }
    if (n) g.hud.hitmarker(false);
    g.water?.shot?.(origin, fwd, reach);
    g.ee?.onShot?.(origin, fwd, reach);
    g.secrets?.onShot?.(origin, fwd, reach);
  }

  // (v4) se cortó la carga (cambió de mate, lo tumbaron): sin golpe
  cancelCharge() {
    this.chargeLoop?.stop(0.1);
    this.chargeLoop = null;
    this.chargeK = 0;
    this.chargeFull = false;
    if (this.mode === 'charge') this.mode = 'idle';
    this.g.net?.share('desg', { k: 'q', id: this.g.net?.id ?? 0, on: 0 });
  }

  // (v4) El aura del Eclipse (la Furia divina): todo lo que está a A.radius m
  // muere de a poco (A.ticks golpes; los primeros no lo matan, el último lo
  // hace polvo); a los jefes, A.boss de su vida por golpe.
  auraTick(A) {
    const g = this.g;
    const P = g.player.pos;
    const r = g.rounds?.round || 1;
    let n = 0;
    for (const { z } of g.zombies.inRadius(P, A.radius, near)) {
      if (z.dead || !z.active || z.state === 'rise' || Math.abs(z.pos.y - P.y) > 4) continue;
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      if (big(z)) {
        g.zombies.damage(z, Math.max(A.bossMin, (z.maxHp || bossHealth(r)) * A.boss), { type: 'scythe', zone: 'torso', point, dir: tmpV.set(0, 1, 0).clone() });
        continue;
      }
      const k = (this.auraN.get(z) || 0) + 1;
      this.auraN.set(z, k);
      // el vacío se los va comiendo: humo negro y chispas de oro que suben
      for (let i = 0; i < 3; i++) g.fx.alpha.spawn(z.pos.x + rnd() * 0.5, (z.baseY ?? z.pos.y) + 0.3 + Math.random() * 1.5, z.pos.z + rnd() * 0.5, rnd() * 0.3, 0.6 + Math.random() * 0.6, rnd() * 0.3, { color: [0.03, 0.0, 0.06], size: 0.25, size1: 0.6, life: 0.7, alpha: 0.6, drag: 1 });
      g.fx.sparkle(point, [1.3, 0.95, 0.45], 2, 0.8);
      if (k >= A.ticks) {
        this.fx.dust(z, 3, 'furia');
        this.hitZ(z, 1e9, { type: 'luz', zone: 'torso', point, dir: tmpV.set(0, 1, 0).clone() }, 'eclipse');
      } else this.hitZ(z, Math.max(zombieHealth(r), z.maxHp || 0) * A.frac * 0.5, { type: 'chain', zone: 'torso', point }, 'eclipse');
      n++;
    }
    if (n) g.hud.hitmarker(false);
  }

  // (v4) La presencia de la del Eclipse, siempre: la hoja que sangra vacío, el
  // anillo de eclipse que orbita la cabeza y las esquirlas alrededor del
  // jugador (y de los compañeros que la tienen).
  presence(dt, m, mine) {
    const g = this.g;
    const w = this.w;
    // (guadana5: las gotas de vacío de la hoja se veían como burbujitas
    // -"salen unas burbujitas que están totalmente de más"-: fuera.
    // globalThis.__mduDesgOldBubbles: vuelven)
    const on = mine && !!m?.up && w.holder?.visible !== false && globalThis.__mduNoDesgPresence !== true && globalThis.__mduDesgOldBubbles === true;
    if (this.bleed) {
      const cam = w.vmCamera;
      const H = g.renderer?.domElement?.height || 720;
      const scale = cam ? H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) : 600;
      const rate = this.furiaOn ? 80 : this.mode === 'slash' || this.mode === 'charge' ? 70 : 34;
      this.bleed.update(dt, m, on, rate, scale);
    }
    // (furia11) concentrando: las chispas que se le meten en la cabeza y el
    // resplandor que crece (escena de la mano); los aros giran cada vez más rápido
    // (las chispas se mueven al dibujar la mano, con la pose del cuadro ya
    // puesta —gatherTick—: acá, la cabeza del arma era la del cuadro anterior y
    // en el golpe, que baja de un tirón, el destello quedaba arriba)
    const ck = mine && this.mode === 'conc' && !this.concLit ? Math.max(0.02, this.concK) : 0;
    this.gatherK = w.holder?.visible !== false ? ck : 0;
    if (ck) this.concPh = (this.concPh || 0) + dt * 16 * ck;
    this.orbK = (this.orbK || 0) + (ck - (this.orbK || 0)) * Math.min(1, dt * 9);
    if (m?.orb) {
      const O = m.orb.userData;
      const t = g.time;
      const fast = this.furiaOn || this.mode === 'charge' ? 3 : 1;
      const ph = this.concPh || 0;
      O.ring.rotation.set(1.1 + Math.sin(t * 0.7) * 0.2, t * 1.4 * fast + ph, 0);
      O.ring2.rotation.set(-0.6, -t * 2.1 * fast - ph * 1.4, 0.4);
      O.crown.rotation.y = t * 3;
      m.orb.scale.setScalar(1 + 0.06 * Math.sin(t * 2.3) + (this.chargeK || 0) * 0.4 + this.orbK * 0.3);
    }
    if (this.orbit) {
      const L = (this.orbList ||= [{ pos: new THREE.Vector3(), on: false }, { pos: new THREE.Vector3(), on: false }, { pos: new THREE.Vector3(), on: false }, { pos: new THREE.Vector3(), on: false }]);
      L[0].on = mine && !!m?.up && g.player.alive && globalThis.__mduNoDesgPresence !== true;
      L[0].pos.copy(g.player.pos);
      let s = 1;
      const list = g.net?.avatars?.list;
      if (list) {
        for (const [, a] of list) {
          if (s >= 4) break;
          if (!a.desg || !(+(a.wkey?.split('|')[1] || 0) >= 1) || !a.group) continue;
          L[s].on = a.group.visible !== false;
          L[s].pos.copy(a.group.position);
          s++;
        }
      }
      for (; s < 4; s++) L[s].on = false;
      this.orbit.update(dt, g.time, L);
      if (this.orbit.mesh.visible) this.fx.attach?.();
    }
  }

  toIdle() {
    this.mode = 'idle';
    this.t = 0;
    if (this.w.state === 'cosmic') this.w.state = 'idle';
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const w = this.w;
    // dormida (otro mapa, nadie la tiene): nada que hacer
    if (!this.awake) {
      if (this.wanted() || this.held() || this.remoteHeld()) this.wake();
      else return;
    }
    // (las pruebas: los golpes en cámara lenta, para sacar cuadros)
    if (this.dbgRate) dt *= this.dbgRate;
    this.dt = dt;
    this.cd -= dt;
    this.dashCd -= dt;
    this.chargeCd -= dt;
    this.stopT = Math.max(0, this.stopT - dt);
    const m = w.model?.cosmic || null;
    const mine = !!m && w.slot?.id === ID;
    // (furia11) algo cortó la concentración (otra arma, una granada, tumbado):
    // la barra no se gastó; ya desatada, sigue la Furia y se corta solo el gesto
    if (this.mode === 'conc' && (w.state !== 'cosmic' || !mine || !g.player.alive || g.player.downed)) {
      if (!this.concLit) this.cancelConc();
      if (mine && w.state === 'cosmic') this.toIdle();
      else this.mode = mine ? 'idle' : 'none';
    }
    // (furia11) la H apretada a mitad de otro golpe: concentra en cuanto termina
    if (this.furiaQ) {
      if (g.time > this.furiaQ || this.furiaOn || !mine) this.furiaQ = 0;
      else if (this.mode === 'idle' && w.state === 'idle') this.tryFuria(this.st);
    }
    // sacarla (cambiar de mate, terminar de tomar): el floreo
    if (w.state === 'raise' && this.prevState !== 'raise' && mine) {
      this.mode = 'draw';
      this.t = 0;
      this.rHold = -1;
      this.fx.play('desg-saca', { gain: 0.7 });
      // el destello al sacarla (la del Eclipse: el sol de oro y las chispas)
      this.glowK = m.up ? 1 : 0.6;
      if (m.up) this.drawFlash();
    }
    if (!mine) {
      if (this.mode !== 'none') this.mode = 'none';
      this.rHold = -1;
      if (this.beam.on) this.stopBeam();
    } else if (this.mode === 'none') this.mode = 'idle';
    // algo cortó el golpe (la faka, una granada, tomar, inspeccionar)
    if (['slash', 'throw', 'spin', 'beam', 'charge'].includes(this.mode) && w.state !== 'cosmic') {
      if (this.mode === 'charge') this.cancelCharge();
      this.mode = mine ? 'idle' : 'none';
      this.rHold = -1;
      if (this.beam.on) this.stopBeam();
    }
    if (this.mode === 'charge' && !mine) this.cancelCharge();
    if (this.mode === 'dash' && !['cosmic', 'idle'].includes(w.state) && !this.dash) this.mode = mine ? 'idle' : 'none';
    if (this.mode === 'draw' && !['raise', 'idle', 'cosmic'].includes(w.state)) this.mode = 'idle';
    // sin la guadaña en las manos, la Furia se vacía
    if (this.kills && !w.slots.some((s) => s.id === ID)) this.kills = 0;
    this.prevState = w.state;
    const p = g.player;
    // la Furia: el reloj corre (con la guadaña en la mano o no); tumbado se corta
    if (this.furiaOn) {
      this.furiaT -= dt;
      if (this.furiaT <= 0 || !p.alive || p.downed) this.endFuria();
    }
    // la ejecutora: su reloj, o el del potenciador que la prendió
    if (this.execOn) {
      this.execT -= dt;
      const pup = this.execLink ? g.powerups?.active?.[this.execLink] : null;
      if (this.execT <= 0 || !p.alive || (this.execLink && !(pup > 0))) this.endExec();
      // (v4) con la guadaña en la mano la Furia se llena sola
      const X = WEAPONS[ID].exec;
      const sF = this.st?.furia;
      if (X.fill && sF && !this.furiaOn && globalThis.__mduNoExecFill !== true) {
        this.fillT += dt * X.fill;
        while (this.fillT >= 1) {
          this.fillT -= 1;
          this.addKill(sF, 1);
        }
      }
    }
    // (v4) la Furia divina del Eclipse: el aura que los mata de a poco
    const sAura = this.furiaOn && mine && this.st?.furia?.aura && globalThis.__mduNoEclAura !== true ? this.st.furia.aura : null;
    if (sAura) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = sAura.every;
        this.auraTick(sAura);
      }
    }
    const eWant = this.furiaOn && mine && this.st?.furia?.eclipse && globalThis.__mduNoEclTint !== true ? 1 : 0;
    this.eclK += (eWant - this.eclK) * Math.min(1, dt * (eWant ? 2 : 3));
    if (this.eclK < 1e-3) this.eclK = 0;
    this.t += dt * (this.stopT > 0 ? 0.08 : 1);
    const st = this.st;
    if (this.slideM) this.glide(dt);
    if (this.dash) this.stepDash(dt);
    switch (this.mode) {
      case 'draw':
        if (this.t >= DRAW) this.mode = 'idle';
        break;
      case 'slash': {
        const mv = MOVES[this.move];
        const k = this.t / this.dur;
        if (!this.cut && k >= mv.cut && st) {
          this.cut = true;
          this.onCut(st, mv);
        }
        if (!this.hit && k >= mv.hit && st) {
          this.hit = true;
          this.doSlash(st, mv);
        }
        if (k >= 1) {
          this.toIdle();
          this.lastEnd = g.time;
        }
        break;
      }
      case 'throw':
        if (!this.thrown && this.t >= THROW * THROW_AT && st) {
          this.thrown = true;
          this.launch(st);
        }
        if (this.t >= THROW) this.toIdle();
        break;
      case 'dash':
        if (this.t >= 0.42 && !this.dash) this.toIdle();
        break;
      case 'charge':
        if (st?.charge) this.stepCharge(dt, st);
        else this.cancelCharge();
        break;
      case 'spin':
        this.pushT -= dt;
        if (this.pushT <= 0 && st && this.t > 0.12) {
          this.pushT = 0.16;
          this.spinPush(st);
        }
        if (this.t >= this.spinT) {
          if (st) this.finishSpin(st);
          this.toIdle();
        }
        break;
      case 'conc':
        this.stepConc(dt, st);
        break;
      default:
        break;
    }
    // (furia11) la tensión de la pantalla: sube concentrando (stepConc), el
    // golpe la suelta (negativa: el tirón) y vuelve sola
    if (this.mode !== 'conc' || this.concLit) {
      this.tens += (0 - this.tens) * Math.min(1, dt * 7);
      if (Math.abs(this.tens) < 1e-3) this.tens = 0;
    }
    if (mine && st) this.updateBeam(dt, st);
    else if (this.beam.rig && this.beam.k <= 0) {
      this.beam.rig.release();
      this.beam.rig = null;
    }
    // la hoja: el cosmos se mueve, las esquirlas flotan, el filo respira; la
    // Furia y la ejecutora la tiñen (y la Furia, con rayos); al sacarla y al
    // volver la espectral, el destello
    const pal = this.pal();
    const beat = 0.5 + 0.5 * Math.sin(g.time * (pal === 'base' ? 3 : 9));
    const breath = 0.5 + 0.5 * Math.sin(g.time * 2.1);
    this.glowK = Math.max(0, (this.glowK || 0) - dt * 2.2);
    // (furia11) concentrando: la hoja se va encendiendo hacia el neón de la
    // Furia (late cada vez más rápido) y a la mitad le saltan los rayos
    const ck = mine && this.mode === 'conc' && !this.concLit ? this.concK : 0;
    if (ck > 0) this.concBeatPh = (this.concBeatPh || 0) + dt * (4 + 16 * ck);
    if (m) {
      if (pal !== 'base') tintMats(m.M, pal, 1, beat, breath);
      else if (ck > 0) tintMats(m.M, 'furia', smooth(ck) * 0.92, 0.5 + 0.5 * Math.sin(this.concBeatPh), breath, m.up && globalThis.__mduNoDivineGlow !== true ? 'divine' : null);
      else if (this.glowK > 0) tintMats(m.M, 'flare', this.glowK, beat, breath);
      else tintMats(m.M, m.up && globalThis.__mduNoDivineGlow !== true ? 'divine' : 'base', 1, beat, breath);
      if (m.bolts) m.bolts.visible = (pal !== 'base' || ck > 0.5) && mine;
    }
    driftCosmos(dt, pal === 'base' ? 1 + 2 * ck : 3);
    animScythe(g.time, dt, pal !== 'base' || ck > 0.5 || g.time - (this.remoteFuriaT ?? -9) < 0.5);
    // la Furia en pantalla (fx/PostFX lee tint)
    // (v4: en el Eclipse, la pantalla oscura y con grietas de oro: el violeta, apenas)
    // (guadana5: la Furia apenas tiñe; fx/PostFX la deja en los bordes)
    const SOFT = globalThis.__mduNoFuriaSoft !== true;
    const want = mine && this.furiaOn ? (this.st?.furia?.eclipse && globalThis.__mduNoEclTint !== true ? 0.3 : SOFT ? 0.7 : 1) : mine && this.execOn ? (SOFT ? 0.4 : 0.6) : 0;
    // (v4) el Cazador del Caos en la mano: el violeta, apenas
    const wantC0 = this.cazador.on && globalThis.__mduCazV3 !== true ? Math.max(want, 0.28) : want;
    // (furia11) concentrando: el violeta de los bordes va entrando
    const wantC = Math.max(wantC0, 0.55 * smooth(ck));
    this.tint = (this.tint || 0) + (wantC - (this.tint || 0)) * Math.min(1, dt * 5);
    if (this.tint < 1e-3) this.tint = 0;
    this.tintBeat = beat;
    // el aura de la Furia: polvo violeta que sube de la hoja (en el mundo)
    // (guadana5: eran puntitos redondos que subían como burbujas -"salen unas
    // burbujitas que están totalmente de más"-: fuera. globalThis.__mduDesgOldBubbles: vuelven)
    if ((this.furiaOn || this.execOn) && mine && globalThis.__mduDesgOldBubbles === true && Math.random() < dt * 30) {
      const at = this.handWorld(tmpV2, 0.15 + rnd() * 0.3, 0.1 + Math.random() * 0.4, -0.7);
      g.fx.add.spawn(at.x, at.y, at.z, rnd() * 0.4, 0.4 + Math.random() * 0.6, rnd() * 0.4, { color: PAL[pal].dust[(Math.random() * 3) | 0], size: 0.05, size1: 0, life: 0.6, drag: 1 });
    }
    // (v3) la burbuja del tiempo, la lluvia de la Furia del Eclipse, la luz de
    // la del Eclipse, el rasgón y los tragados que hay que avisar
    if (this.slowed.size) this.stepSlowed();
    if (this.furiaOn && mine && st?.furia?.rain && globalThis.__mduNoRain !== true) {
      this.rainT -= dt;
      if (this.rainT <= 0) {
        this.rainT = st.furia.rain.every;
        this.rain(st);
      }
    }
    const L = this.fx.light;
    if (L) {
      // (furia11) concentrando, la luz de la guadaña crece (la común, que no
      // tiene luz propia, la prende para esto)
      const lit = mine && (m?.up || ck > 0) && w.holder?.visible !== false && globalThis.__mduNoDesgLight !== true;
      if (lit) {
        // (su raíz en la escena y la luz adoptada por el mundo: fx.attach)
        this.fx.attach();
        this.handWorld(L.position, -0.1, 0.25, -0.9);
        L.color.setHex(pal === 'exec' ? 0xff60c0 : pal === 'furia' || ck > 0 ? 0xc070ff : 0xb880ff);
        // (v4: luz propia más fuerte)
        L.intensity = (2.1 + 0.7 * breath) * (pal === 'base' ? 1 : 1.6) * (m.up ? 1 + 2.2 * ck * ck : 3 * ck * ck);
      } else L.intensity = 0;
    }
    this.presence(dt, m, mine);
    this.rip = Math.max(0, this.rip - dt / 0.7);
    if (this.swq.length && g.net) {
      g.net.share('desg', { k: 'w', id: g.net.id, l: this.swq.splice(0, 12) });
    } else if (this.swq.length) this.swq.length = 0;
    this.cazador.update(dt);
    this.fx.update(dt);
    this.updateHud();
    this.updateRemote(dt);
  }

  // La pose de la mano para Weapons.animate: [x, y, z, rx, ry, rz, lower
  // (-1: la de siempre), snap (1: sin suavizar)].
  pose(dt) {
    const O = this.O;
    O.fill(0);
    O[6] = -1;
    const w = this.w;
    const m = w.model?.cosmic;
    if (!m) return O;
    if (!this.awake) this.wake();
    const P = this.P;
    if (['knife', 'throw', 'drink', 'empty'].includes(w.state)) {
      setPose(m, REST_P, 0);
      this.trailOn = false;
      return O;
    }
    let trail = false;
    let lower = -1;
    let snap = 0;
    let spin = 0;
    let ax = null;
    const g = this.g;
    for (let j = 0; j < NP; j++) P[j] = REST_P[j];
    const dbg = this.dbg;
    if (dbg) {
      // (las pruebas: una pose fija)
      const K = typeof dbg.keysName === 'string' ? DESG_POSES[dbg.keysName] : dbg.keys;
      const FP = typeof dbg.P === 'string' ? DESG_POSES[dbg.P] : dbg.P;
      if (K) sample(K, dbg.k, P);
      else if (dbg.move) sample(MOVES[dbg.move].keys, dbg.k, P);
      else if (FP) for (let j = 0; j < NP; j++) P[j] = FP[j] ?? P[j];
      if (dbg.spin) {
        spin = dbg.spin;
        ax = Y_AXIS;
      }
      snap = 1;
      lower = 0;
      trail = !!dbg.trail;
    } else if (w.state === 'inspect') {
      const k = Math.min(1, w.stateT / INSPECT);
      sample(INSPECT_KEYS, k, P);
      // el floreo del final: una vuelta entera sobre el asta
      const f = clamp01((k - 0.8) / 0.12);
      spin = smooth(f) * Math.PI * 2;
      lower = 0;
      if (k >= 1) w.state = 'idle';
    } else
      switch (this.mode) {
        case 'draw': {
          const k = Math.min(1, this.t / DRAW);
          sample(DRAW_KEYS, k, P);
          spin = (1 - smooth(Math.min(1, k / 0.7))) * Math.PI * 2;
          lower = 0;
          snap = 1;
          break;
        }
        case 'slash': {
          const mv = MOVES[this.move];
          const k = Math.min(1, this.t / this.dur);
          sample(mv.keys, k, P);
          if (this.relBlend > 0) {
            if (k > 0.2) this.relBlend = 0;
            else mix(P, CHARGE_P, 1 - smooth(k / 0.2), P);
          }
          snap = 1;
          trail = k >= mv.trail[0] && k <= mv.trail[1];
          break;
        }
        case 'throw': {
          const k = Math.min(1, this.t / THROW);
          sample(THROW_KEYS, k, P);
          snap = 1;
          trail = k > 0.36 && k < 0.74;
          break;
        }
        case 'dash': {
          const k = Math.min(1, this.t / 0.42);
          sample(DASH_KEYS, k, P);
          snap = 1;
          trail = k > 0.12 && k < 0.7;
          break;
        }
        case 'spin': {
          // sube, gira acostada sobre la cabeza (vueltas enteras) y baja
          const k = Math.min(1, this.t / this.spinT);
          const into = smooth(clamp01(k / 0.14));
          const out = smooth(clamp01((k - 0.84) / 0.16));
          mix(REST_P, SPIN_UP, into, P);
          mix(P, REST_P, out, P);
          const turn = clamp01((k - 0.08) / 0.8);
          spin = -(turn * turn * (3 - 2 * turn)) * Math.PI * 2 * SPIN_TURNS;
          ax = Y_AXIS;
          snap = 1;
          trail = k > 0.12 && k < 0.88;
          break;
        }
        case 'charge': {
          // (v4) la levanta por arriba del hombro y tiembla más cuanto más carga
          const k = this.chargeK || 0;
          mix(REST_P, CHARGE_P, smooth(Math.min(1, this.t / 0.22)), P);
          P[0] += Math.sin(g.time * 43) * 0.004 * k;
          P[1] += Math.sin(g.time * 51 + 1) * 0.004 * k - 0.02 * k;
          P[2] += 0.03 * k;
          snap = 1;
          break;
        }
        case 'conc': {
          // (furia11) el báculo parado delante, el temblor que crece y el golpe
          // del regatón (desde la pose en la que estaba: sin salto)
          concPose(this.t, this.concFrom, g.time, P);
          lower = 0;
          snap = 1;
          break;
        }
        case 'beam': {
          const k = smooth(this.beam.pk);
          mix(REST_P, BEAM_P, k, P);
          if (this.beam.on) {
            P[0] += Math.sin(g.time * 47) * 0.0016;
            P[1] += Math.sin(g.time * 53 + 1) * 0.0016;
          }
          break;
        }
        default: {
          // quieta: respira, la hoja se mece apenas (con la Furia, tiembla)
          P[3] += Math.sin(g.time * 0.9) * 0.012;
          P[4] += Math.sin(g.time * 1.3) * 0.01;
          if (this.furiaOn) {
            P[0] += Math.sin(g.time * 31) * 0.0009;
            P[1] += Math.sin(g.time * 37 + 1) * 0.0009;
          }
          // (volviendo del rayo)
          if (this.beam.pk > 0) mix(P, BEAM_P, smooth(this.beam.pk), P);
          break;
        }
      }
    O[0] = P[0];
    O[1] = P[1];
    O[2] = P[2];
    O[6] = lower;
    O[7] = snap;
    setPose(m, P, spin, ax);
    this.trailOn = trail && m.scy.visible;
    return O;
  }

  // (furia11) Las chispas de concentrar la Furia: igual que la estela, al
  // dibujar la escena de la mano (una vez por cuadro), con la pose ya puesta.
  gatherTick() {
    const g = this.g;
    const w = this.w;
    if (!this.gather || this.gatherFrame === g.time) return;
    const dt = (this.gatherFrame == null ? 0 : Math.max(0, Math.min(0.1, g.time - this.gatherFrame))) * (this.dbgRate || 1);
    this.gatherFrame = g.time;
    const m = w.model?.cosmic || null;
    const cam = w.vmCamera;
    const H = g.renderer?.domElement?.height || 720;
    const scale = cam ? H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) : 600;
    this.gather.update(dt, m, m ? this.gatherK || 0 : 0, !!m?.up, scale, w.vmRoot, g.time);
  }

  // La estela: se toma al dibujar la escena de la mano (onBeforeRender), con
  // la pose del cuadro ya puesta.
  trailTick() {
    const g = this.g;
    const now = g.time;
    if (this.trailFrame === now) return;
    const dt = (this.trailFrame < 0 ? 0 : Math.max(0, Math.min(0.1, now - this.trailFrame))) * (this.dbgRate || 1);
    this.trailFrame = now;
    const pts = this.trailPts;
    for (const s of pts) s.age += dt;
    const life = this.up ? TRAIL_LIFE_UP : TRAIL_LIFE;
    while (pts.length && pts[pts.length - 1].age > life) this.trailFree.push(pts.pop());
    const m = this.w.model?.cosmic;
    if (this.trailOn && m && this.w.holder.visible) {
      const s = this.trailFree.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      m.tip.getWorldPosition(s.a);
      m.mid.getWorldPosition(s.b);
      s.age = 0;
      pts.unshift(s);
      if (pts.length > TRAIL_MAX) this.trailFree.push(pts.pop());
    }
    const tg = this.trail.geometry;
    if (pts.length < 2) {
      tg.setDrawRange(0, 0);
      return;
    }
    const P = tg.attributes.position.array;
    const Cc = tg.attributes.color.array;
    const col = PAL[this.pal()].edge.map((c, i) => c * (this.furiaOn || this.execOn ? 0.6 : 0.5) + (this.up && !this.execOn ? [0.18, 0.12, 0.02][i] : 0));
    const n = pts.length;
    let v = 0;
    const cr = (p0, p1, p2, p3, t, c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t * t * t);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(n - 1, i + 2)];
      const steps = 3 + (i === n - 2 ? 1 : 0);
      for (let j = 0; j < steps && v < TRAIL_MAX * 3; j++) {
        const u = j / 3;
        const age = p1.age + (p2.age - p1.age) * u;
        const f = Math.max(0, 1 - age / life) ** 1.5;
        P[v * 6] = cr(p0.a, p1.a, p2.a, p3.a, u, 'x');
        P[v * 6 + 1] = cr(p0.a, p1.a, p2.a, p3.a, u, 'y');
        P[v * 6 + 2] = cr(p0.a, p1.a, p2.a, p3.a, u, 'z');
        P[v * 6 + 3] = cr(p0.b, p1.b, p2.b, p3.b, u, 'x');
        P[v * 6 + 4] = cr(p0.b, p1.b, p2.b, p3.b, u, 'y');
        P[v * 6 + 5] = cr(p0.b, p1.b, p2.b, p3.b, u, 'z');
        Cc[v * 6] = col[0] * f;
        Cc[v * 6 + 1] = col[1] * f;
        Cc[v * 6 + 2] = col[2] * f;
        Cc[v * 6 + 3] = col[0] * f * 0.06;
        Cc[v * 6 + 4] = col[1] * f * 0.06;
        Cc[v * 6 + 5] = col[2] * f * 0.06;
        v++;
      }
    }
    tg.setDrawRange(0, Math.max(0, v - 1) * 6);
    tg.attributes.position.needsUpdate = true;
    tg.attributes.color.needsUpdate = true;
  }

  // ---------------- en la pantalla ----------------
  // Abajo de la mira: un arquito violeta que se llena con las bajas (la Furia,
  // solo la mejorada; durante la Furia se va vaciando) y un rombito que se
  // prende cuando la embestida está lista. Se escribe solo lo que cambia.
  updateHud() {
    const g = this.g;
    const st = this.st;
    const p = g.player;
    const on = !!st && p?.alive && !p.downed;
    if (!this.hudEl) {
      if (!on || !g.hud?.root) return;
      const el = document.createElement('div');
      el.className = 'mdu-desg';
      el.style.cssText = 'position:absolute;left:50%;top:50%;width:76px;height:30px;margin-left:-38px;margin-top:20px;pointer-events:none;opacity:0;transition:opacity .25s;z-index:3';
      el.innerHTML = `<svg viewBox="0 0 76 30" width="76" height="30" style="overflow:visible">
<defs><linearGradient id="mduDsG" x1="0" x2="1"><stop offset="0" stop-color="#7a3cff"/><stop offset=".5" stop-color="#f0c8ff"/><stop offset="1" stop-color="#7a3cff"/></linearGradient></defs>
<g class="a"><path d="M6 5 Q38 22 70 5" pathLength="100" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3" stroke-linecap="round"/>
<path class="f" d="M6 5 Q38 22 70 5" pathLength="100" fill="none" stroke="url(#mduDsG)" stroke-width="3" stroke-linecap="round" stroke-dasharray="0 100"/>
<circle class="s" cx="38" cy="13.5" r="3.6" fill="#0a0410" stroke="#c88cff" stroke-width="1.4" opacity="0"/></g>
<path class="d" d="M38 21 l3.4 3.6 l-3.4 3.6 l-3.4 -3.6 z" fill="#b070ff" opacity=".25"/></svg>`;
      g.hud.root.appendChild(el);
      this.hudEl = el;
      this.hudA = el.querySelector('.a');
      this.hudF = el.querySelector('.f');
      this.hudS = el.querySelector('.s');
      this.hudD = el.querySelector('.d');
      this.hudK = -1;
    }
    if (this.hudEl.parentNode !== g.hud?.root && g.hud?.root) g.hud.root.appendChild(this.hudEl);
    const vis = on ? '1' : '0';
    if (this.hudVis !== vis) {
      this.hudVis = vis;
      this.hudEl.style.opacity = vis;
    }
    if (!on) return;
    const F = st.furia || null;
    const arc = F ? '1' : '0';
    if (this.hudArc !== arc) {
      this.hudArc = arc;
      this.hudA.setAttribute('opacity', arc);
    }
    if (F) {
      const k = this.furiaOn ? Math.max(0, this.furiaT / (this.furiaMax || F.time)) : Math.min(1, this.kills / furiaKills(g, F.kills));
      const q = Math.round(k * 100);
      if (q !== this.hudK) {
        this.hudK = q;
        this.hudF.setAttribute('stroke-dasharray', `${q} 100`);
      }
      // llena: el eclipse del medio late; durante la Furia queda prendido
      const sun = this.furiaOn ? '1' : k >= 1 ? (0.6 + 0.4 * Math.sin(g.time * 6)).toFixed(1) : '0';
      if (sun !== this.hudSun) {
        this.hudSun = sun;
        this.hudS.setAttribute('opacity', sun);
      }
    }
    const dk = this.dashCd <= 0 ? '1' : '.25';
    if (dk !== this.hudDk) {
      this.hudDk = dk;
      this.hudD.setAttribute('opacity', dk);
    }
  }

  // ---------------- en línea ----------------
  // Lo de otro jugador: lo mismo que se ve acá, sin daño.
  ghost(m) {
    const g = this.g;
    if (m.id != null && m.id === g.net?.id) return;
    // (la de un compañero: despierta)
    if (!this.awake) this.wake();
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const ok = (a, n = 3) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
    const pal = ['base', 'furia', 'exec'][m.c | 0] || 'base';
    switch (m.k) {
      case 's': {
        if (!ok(m.p)) return;
        const move = COMBO[m.m] || 'diag';
        const RF = MOVES[move].rift;
        const life = Math.max(0.3, Math.min(3, +m.L || 1.5));
        this.fx.rift({ o: V(m.p), yaw: +m.y || 0, roll: RF.roll, kind: 'arc', R: Math.max(1, Math.min(5, +m.R || RF.R)), half: RF.half, w: RF.w * (pal === 'furia' ? 1.25 : 1), life, sweep: Math.max(0.04, Math.min(0.6, +m.w || 0.1)), flip: RF.flip, pal, own: false });
        this.fx.play(m.u ? 'desg-tajo-up' : 'desg-tajo', { pos: V(m.p), gain: 0.8 });
        this.fx.play('desg-grieta', { pos: V(m.p), gain: 0.5 });
        this.avatarAct(m.id, 'swing', move);
        const yw = +m.y || 0;
        const fwd = new THREE.Vector3(-Math.sin(yw), 0, -Math.cos(yw));
        const S = (m.u ? WEAPONS[ID].pap : WEAPONS[ID]).finisher;
        // (el remate: su onda; con la Furia: la onda que sale volando)
        if (move === 'remate' && S.wave) this.fx.nova(V(m.p).addScaledVector(fwd, 1.6).setY(m.p[1] - 1.1), S.wave.radius, { pal, dust: true, big: 1.2 });
        if (pal === 'furia') this.furiaWave(V(m.p), fwd, yw, MOVES[move], Math.max(1, Math.min(5, +m.R || RF.R)), null, pal, false);
        break;
      }
      case 't': {
        if (!ok(m.p) || !ok(m.f) || !ok(m.r)) return;
        const id = m.id;
        // (la del Eclipse tira tres; la del medio abre el pozo: el tirón lo hace el anfitrión)
        if (m.n === 3 && m.u) {
          const PT = WEAPONS[ID].pap.throw;
          const homeOf = (o) => (out) => {
            const r = g.net?.remote?.get(id);
            return r?.pos ? out.set(r.pos.x, (r.pos.y || 0) + 1.5, r.pos.z) : out.copy(o);
          };
          const o = V(m.p);
          const base = { id, own: false, up: true, pal, o, f: V(m.f).normalize(), r: V(m.r).normalize(), T: Math.max(0.5, Math.min(3, +m.T || 1.5)), home: homeOf(o) };
          const R = Math.min(30, +m.R || 18);
          const A = Math.min(10, +m.A || 5);
          this.fx.throwStart({ ...base, R: R * PT.well.at, A: 0, cfg: { well: PT.well } });
          const orbit = PT.trio.orbit && globalThis.__mduNoTrioOrbit !== true ? { c: o.clone().addScaledVector(base.f, R * PT.well.at), time: PT.well.time, w: PT.trio.orbit } : null;
          this.fx.throwStart({ ...base, R: R * 0.85, A: -A, cfg: { pull: PT.pull, burst: PT.burst, orbit }, delay: PT.trio.lag });
          this.fx.throwStart({ ...base, R: R * 0.85, A, cfg: { pull: PT.pull, burst: PT.burst, orbit: orbit && { ...orbit, w: -orbit.w } }, delay: PT.trio.lag * 2 });
          this.fx.play('desg-lanza-up', { pos: o, gain: 0.9 });
          this.avatarAct(id, 'swing', 'rev');
          break;
        }
        const fl = this.fx.throwStart({
          id,
          own: false,
          up: !!m.u,
          pal,
          o: V(m.p),
          f: V(m.f).normalize(),
          r: V(m.r).normalize(),
          R: Math.min(30, +m.R || 15),
          A: Math.min(10, +m.A || 4),
          T: Math.max(0.5, Math.min(3, +m.T || 1.4)),
          // (el tirón lo hace el anfitrión también con la de un compañero; el estallido se ve)
          cfg: { pull: (m.u ? WEAPONS[ID].pap : WEAPONS[ID]).throw.pull, burst: (m.u ? WEAPONS[ID].pap : WEAPONS[ID]).throw.burst },
          home: (out) => {
            const r = g.net?.remote?.get(id);
            return r?.pos ? out.set(r.pos.x, (r.pos.y || 0) + 1.5, r.pos.z) : out.copy(fl.o);
          },
        });
        this.fx.play('desg-lanza', { pos: fl.o, gain: 0.8 });
        this.avatarAct(id, 'swing', 'rev');
        break;
      }
      case 'tb': {
        const fl = this.fx.flyers.find((x) => x.on && !x.own && x.id === m.id);
        if (fl && fl.mode === 'arc') {
          if (ok(m.p)) fl.pos.copy(V(m.p));
          this.fx.bounce(fl, null);
        }
        break;
      }
      case 'tc': {
        const fl = this.fx.flyers.find((x) => x.on && !x.own && x.id === m.id);
        if (fl) this.fx.endFlyer(fl);
        break;
      }
      case 'd': {
        if (!ok(m.a) || !ok(m.b)) return;
        this.fx.dashFx(V(m.a), V(m.b), pal, false, (m.u ? WEAPONS[ID].pap : WEAPONS[ID]).dash);
        this.avatarAct(m.id, 'swing', 'remate');
        break;
      }
      case 'g': {
        if (!ok(m.p)) return;
        const d = Math.max(0.4, Math.min(3, +m.d || 1.1));
        this.fx.rift({ o: V(m.p), yaw: 0, kind: 'arc', R: 1.25, half: Math.PI, w: 0.06, life: d * 0.8, sweep: d * 0.55, pal, own: false });
        this.fx.spinFx(V(m.p).setY(m.p[1] - 1.25), d, pal);
        this.fx.play('desg-giro', { pos: V(m.p), gain: 0.9, rate: 1.1 / d });
        this.avatarAct(m.id, 'spin', d);
        break;
      }
      // (el anfitrión: el empujón del giro de un invitado)
      case 'p': {
        if (!g.net?.host || !ok(m.p)) return;
        const P = V(m.p);
        const r = Math.min(11, +m.r || 2.6);
        const v = Math.min(14, +m.v || 7);
        const tt = Math.max(0.3, Math.min(1.6, +m.d || 0.55));
        for (const { z } of g.zombies.inRadius(P, r, near)) this.shove(z, new THREE.Vector3(z.pos.x - P.x, 0, z.pos.z - P.z).normalize(), v, tt);
        break;
      }
      case 'f': {
        this.avatarFlag(m.id, 'furia', !!m.on);
        const r = g.net?.remote?.get(m.id);
        const D = this.avatarOf(m.id)?.desg;
        // (furia11) venía concentrando: el grabado ya suena; acá el golpe y el estallido
        const conc = D?.conc;
        if (conc) D.conc = null;
        if (m.on && r?.pos) {
          const at = tmpV.set(r.pos.x, (r.pos.y || 0) + 1.4, r.pos.z);
          if (conc) this.avatarIgnite(m.id, r);
          else this.fx.play('desg-furia', { pos: at, gain: 0.9 });
        } else if (!m.on && r?.pos && !OLD_FURIA11()) furiaSnd(g, 'furia-fin', { pos: new THREE.Vector3(r.pos.x, (r.pos.y || 0) + 1.4, r.pos.z), gain: 0.8, reverb: 0.3 });
        break;
      }
      // (furia11) un compañero concentra la Furia (on: 0, se cortó)
      case 'fc':
        this.avatarConc(m.id, !!m.on);
        break;
      case 'x':
        this.avatarFlag(m.id, 'exec', !!m.on);
        break;
      case 'c':
        if (ok(m.p)) this.fx.cloud(V(m.p));
        break;
      case 'b':
        this.ghostBeam(m);
        break;
      // (v3) tragados por una grieta de otro: [id, x, y, z, segundos]
      case 'w':
        for (const it of Array.isArray(m.l) ? m.l : []) {
          if (!Array.isArray(it) || it.length < 5 || !it.every(Number.isFinite)) continue;
          this.fx.swallowIds([it[0]], new THREE.Vector3(it[1], it[2], it[3]), Math.max(0.2, Math.min(1.5, it[4])));
        }
        break;
      // la ruptura de otro (lo que se ve, y lo lento en su burbuja)
      case 'u': {
        if (!ok(m.p)) return;
        const R = m.b ? WEAPONS[ID].pap.charge.rupture : WEAPONS[ID].pap.finisher.rupture;
        const c = V(m.p);
        this.fx.rupture(c, R, pal, false, !!m.b);
        this.slowZone(c, R.bubble.radius, R.bubble.time, R.bubble.slow);
        this.avatarAct(m.id, 'swing', 'remate');
        break;
      }
      // la lluvia de guadañas de otro (solo se ve: el daño lo pone el que la largó)
      case 'r':
        for (const q of Array.isArray(m.l) ? m.l.slice(0, 8) : []) if (ok(q)) this.fx.fall(V(q), false, m.u ? 1 : 0, 'furia', null);
        break;
      // (v4) un agujero negro de otro (el tajo de la del Eclipse, la ejecutora)
      case 'h':
        if (ok(m.p)) this.fx.hole(V(m.p), Math.max(0.2, Math.min(2, +m.R || 0.5)), Math.max(0.3, Math.min(2, +m.L || 0.95)), { pal: m.c === 2 ? 'exec' : 'base', gold: m.c !== 2, own: false });
        break;
      // (v4) carga el golpe (su guadaña sube y chupa luz)
      case 'q':
        this.avatarFlag(m.id, 'charge', !!m.on);
        break;
      // el Cazador del Caos de otro (weapons/Cazador.js)
      case 'zc':
      case 'zx':
      case 'zm':
      case 'zs':
        this.cazador.ghost(m);
        break;
      default:
        break;
    }
  }

  // El rayo de otro jugador (solo se ve y se oye).
  ghostBeam(m) {
    const g = this.g;
    let r = this.remoteBeams.find((x) => x.id === m.id);
    if (m.o) {
      if (r) r.t = 0;
      return;
    }
    const ok = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!ok(m.a) || !ok(m.b)) return;
    if (!r) {
      const rig = this.fx.rig();
      if (!rig) return;
      r = { id: m.id, rig, a: new THREE.Vector3().fromArray(m.a), b: new THREE.Vector3().fromArray(m.b), ta: new THREE.Vector3(), tb: new THREE.Vector3(), k: 0, t: 0, grow: 0, loop: null, wall: false };
      if (globalThis.__mduDesgOldBeam === true) {
        r.loop = this.fx.loop('desg-rayo-loop', r.a, { gain: 1.1, fadeIn: 0.12 });
        this.fx.play('desg-rayo', { pos: r.a, gain: 0.9 });
      } else {
        r.loop = this.fx.loop('desg-rayo5-loop', r.a, { gain: 1.2, fadeIn: 0.1, from: 0.5, to: 2.5 });
        this.fx.play('desg-rayo5', { pos: r.a, gain: 1 });
      }
      this.remoteBeams.push(r);
    }
    r.ta.fromArray(m.a);
    r.tb.fromArray(m.b);
    r.t = 0.35;
    r.wall = !!m.w;
    for (const p of Array.isArray(m.z) ? m.z : []) {
      if (!ok(p)) continue;
      tmpV.fromArray(p);
      for (let i = 0; i < 16; i++) g.fx.add.spawn(tmpV.x + rnd() * 0.5, tmpV.y - 0.6 + Math.random() * 1.2, tmpV.z + rnd() * 0.5, rnd() * 0.6, 0.6 + Math.random() * 1.6, rnd() * 0.6, { color: PAL.furia.dust[i % 3], size: 0.09, size1: 0, life: 0.8 + Math.random() * 0.6, gravity: -1.5, drag: 0.6 });
    }
  }

  // ---------------- la guadaña en el muñeco de un compañero ----------------
  // La copia de primera persona que arma net/Avatars viene inclinada para la
  // cámara: se esconde y va la de tamaño real, parada en la mano, con sus
  // propios materiales (la Furia de uno no tiñe la de otro). Se mueve sola con
  // los tajos, el giro y lo demás que llega por 'desg'.
  avatarOf(id) {
    return this.g.net?.avatars?.list?.get(id) || null;
  }

  avatarAct(id, act, arg) {
    const a = this.avatarOf(id);
    const D = a?.desg;
    if (!D) return;
    D.act = act;
    D.actT = 0;
    D.arg = arg;
  }

  avatarFlag(id, k, on) {
    const a = this.avatarOf(id);
    if (a?.desg) a.desg[k] = on;
    else if (a) (this.pendingFlags ||= new Map()).set(id, { ...(this.pendingFlags?.get(id) || {}), [k]: on });
  }

  // (furia11) Un compañero concentra la Furia: su muñeco levanta la guadaña
  // hacia el eclipse (net/gauchoSkin lee desgLift: los brazos y la mirada
  // suben, como cuando mira para arriba), la hoja tiembla y se enciende, el
  // polvo de alrededor se le mete en la cabeza del arma, la luz crece y un
  // anillo se cierra sobre él; el grabado suena desde donde está (poseAvatar
  // lo anima). La hoja no da vueltas enteras: con la cabeza del arma abajo
  // se metía en el piso (hoja furia11/shots/_nB_av.png).
  avatarConc(id, on) {
    const g = this.g;
    const a = this.avatarOf(id);
    const D = a?.desg;
    const r = g.net?.remote?.get(id);
    if (!on) {
      const C = D?.conc;
      if (C) {
        stopSnd(g, C.snd, 0.35);
        if (C.ring?.on) C.ring.life = Math.min(C.ring.life, C.ring.t + 0.3);
        D.conc = null;
      }
      if (r) r.desgLift = 0;
      return;
    }
    if (!D || OLD_FURIA11()) return;
    const pos = r?.pos ? new THREE.Vector3(r.pos.x, (r.pos.y || 0) + 1.4, r.pos.z) : null;
    const fy = r?.pos ? this.floorY(tmpV.set(r.pos.x, r.pos.y || 0, r.pos.z)) : 0;
    D.conc = {
      t: 0,
      flashT: 0,
      snd: pos ? furiaSnd(g, 'furia-activa', { pos, gain: 0.85, reverb: 0.35, offset: SND_OFF, fadeIn: CONC.sndFade, ref: 7 }) : null,
      ring: r?.pos ? this.fx.rift({ o: tmpV.set(r.pos.x, fy + 0.3, r.pos.z), yaw: 0, kind: 'arc', half: Math.PI, R: 5.4, grow: { to: 0.75, time: CONC.time + CONC.hit }, w: 0.11, life: CONC.time + CONC.hit + 0.06, sweep: 0.3, pal: 'furia', own: false }) : null,
    };
  }

  // (furia11) ...y la desata: el golpe, la columna de chispas y el estallido.
  avatarIgnite(id, r) {
    const g = this.g;
    const p = tmpV3.set(r.pos.x, r.pos.y || 0, r.pos.z);
    const fy = this.floorY(p);
    const a = this.avatarOf(id);
    concBurst(g, p, fy, +(a?.wkey?.split('|')[1] || 0) >= 1);
    if (globalThis.__mduNoDesgFx4 !== true) this.fx.nova(p.clone(), 6, { pal: 'furia', dust: true, big: 1.1, sound: false });
    // (la baja de golpe: poseAvatar suelta desgLift)
  }

  updateRemote(dt) {
    const g = this.g;
    const list = g.net?.avatars?.list;
    if (list) {
      for (const [id, a] of list) {
        const want = a.gun && a.wkey?.startsWith(`${ID}|`);
        // (furia11: si venía concentrando, eso se corta antes de soltar la guadaña del muñeco)
        if (!want) {
          if (a.desg && a.desg.holder !== a.gun) {
            if (a.desg.conc) this.avatarConc(id, false);
            a.desg = null;
          }
          continue;
        }
        if (!a.desg || a.desg.holder !== a.gun || a.desg.key !== a.wkey) {
          if (a.desg?.conc) this.avatarConc(id, false);
          this.dressAvatar(id, a);
        }
        this.poseAvatar(id, a, dt);
      }
    }
    // los rayos de los compañeros
    for (let i = this.remoteBeams.length - 1; i >= 0; i--) {
      const r = this.remoteBeams[i];
      r.t -= dt;
      const live = r.t > 0;
      r.k = live ? Math.min(1, r.k + dt / 0.07) : Math.max(0, r.k - dt / 0.16);
      if (!live && r.k <= 0) {
        r.loop?.stop(0.25);
        r.rig.release();
        this.remoteBeams.splice(i, 1);
        continue;
      }
      if (!live && r.loop) {
        r.loop.stop(0.25);
        r.loop = null;
      }
      const f = Math.min(1, dt * 14);
      r.a.lerp(r.ta, f);
      r.b.lerp(r.tb, f);
      r.grow = Math.min(99, r.grow + dt * 85);
      const len = r.a.distanceTo(r.b);
      r.rig.set(r.a, r.b, r.k, r.grow, r.wall, g.time, dt, true);
      if (!live) continue;
      this.fx.motes(r.a, r.b, len, dt, 0.6);
      if (r.wall && r.grow >= len) this.fx.impact(r.b, null, dt, false);
      if (r.loop) {
        const cam = g.camera.position;
        const d = tmpV2.subVectors(r.b, r.a);
        const u = clamp01(tmpV.subVectors(cam, r.a).dot(d) / Math.max(1e-4, d.lengthSq()));
        r.loop.move(tmpV.copy(r.a).addScaledVector(d, u));
      }
    }
  }

  avatarMats(id) {
    let M = this.avMats.get(id);
    if (!M) {
      M = cloneMats();
      this.avMats.set(id, M);
    }
    return M;
  }

  dressAvatar(id, a) {
    const holder = a.gun;
    for (const c of holder.children) c.visible = false;
    const up = +(a.wkey.split('|')[1] || 0) >= 1 ? 1 : 0;
    const M = this.avatarMats(id);
    const model = desgarradorModel(up, M);
    const pivot = new THREE.Group();
    pivot.add(model);
    holder.add(pivot);
    const pend = this.pendingFlags?.get(id);
    a.desg = { holder, key: a.wkey, pivot, model, M, act: null, actT: 0, arg: null, furia: !!pend?.furia, exec: !!pend?.exec };
    this.pendingFlags?.delete(id);
  }

  // Parada en la mano, la hoja arriba y adelante (sin seguir del todo la
  // mirada: no se acuesta al mirar abajo). Los tajos la barren por delante y
  // el giro la hace dar vueltas acostada.
  poseAvatar(id, a, dt) {
    const g = this.g;
    const D = a.desg;
    const r = g.net?.remote?.get(id);
    const pitch = Math.max(-1.2, Math.min(1.2, r?.pitch || 0));
    // (v4: la base se puede afinar desde las pruebas: globalThis.__desgAvT)
    const AT = globalThis.__desgAvT || AV_T;
    let rx = -pitch * AT.pk - AT.rx;
    let ry = AT.ry;
    let rz = AT.rz;
    D.model.position.y = AT.y;
    if (D.act) {
      D.actT += dt;
      if (D.act === 'swing') {
        const k = Math.min(1, D.actT / 0.4);
        const s = Math.sin(k * Math.PI);
        ry += 1.2 - 2.4 * smooth(k);
        rx -= 0.9 * s;
        rz += D.arg === 'alto' ? 0 : 0.4 * s;
        if (k >= 1) D.act = null;
      } else if (D.act === 'spin') {
        const dur = +D.arg || 1.1;
        const k = Math.min(1, D.actT / dur);
        const e = smooth(clamp01(k / 0.12)) * (1 - smooth(clamp01((k - 0.88) / 0.12)));
        rz += (Math.PI / 2) * e;
        ry += k * Math.PI * 2 * SPIN_TURNS;
        if (k >= 1) D.act = null;
      }
    }
    // (v4) con el cuerpo de dos manos (net/gauchoSkin TWO_HAND: la pose de arma
    // larga), el asta pasa por las dos manos de verdad: de la derecha (atrás,
    // en el puño) a la izquierda (adelante), la hoja para arriba. El tajo gira
    // la hoja alrededor del asta (las manos no se sueltan) y el giro de la R
    // también. (globalThis.__mduDesgOldAvatar: como antes, en la mano derecha)
    if (!this.avatarTwoHands(a, D) || globalThis.__mduDesgOldAvatar === true) {
      D.model.quaternion.identity();
      D.model.position.set(0, AT.y, 0);
      D.pivot.position.set(0, 0, 0);
      D.pivot.rotation.set(rx, ry, rz, 'YXZ');
    }
    // la Furia (o la ejecutora) del compañero: su guadaña de neón y el polvo
    // (con el filo que respira, como la de la mano; y los rayos con la Furia)
    const pal = D.exec ? 'exec' : D.furia ? 'furia' : 'base';
    D.pal = pal;
    // (furia11) concentrando: la hoja se enciende de a poco, el polvo de
    // alrededor va a la cabeza del arma, la luz late cada vez más fuerte y el
    // anillo que se cierra lo sigue
    const C = D.conc;
    let ck = 0;
    // (se desató o se cortó: baja la guadaña de golpe)
    if (!C && r?.desgLift) r.desgLift = 0;
    if (C) {
      C.t += dt;
      ck = Math.min(1, C.t / CONC.time);
      C.ph2 = (C.ph2 || 0) + dt * (14 + 30 * ck);
      C.roll = Math.sin(C.ph2) * (0.03 + 0.12 * ck * ck);
      // (levanta la guadaña: entra en 0,35 s; net/gauchoSkin desgLift)
      if (r) r.desgLift = (globalThis.__desgAvLift ?? AV_LIFT) * smooth(Math.min(1, C.t / 0.35));
      // (el aviso de que se desató no llegó: se apaga solo)
      if (C.t > CONC.time + CONC.hit + 1.2) {
        this.avatarConc(id, false);
        ck = 0;
      } else if (a.group?.visible !== false && r?.pos) {
        const head = D.model.localToWorld(tmpV2.set(0, TOP_Y, 0));
        const fy = this.floorY(tmpV3.set(r.pos.x, r.pos.y || 0, r.pos.z));
        concWorld(g, head, fy, ck, dt, +(a.wkey?.split('|')[1] || 0) >= 1, 0.8);
        C.flashT -= dt;
        if (C.flashT <= 0) {
          C.flashT = 0.2;
          g.fx.flash(head, 0xb860ff, 1.5 + 6 * ck * ck, 0.3, 5 + 4 * ck);
        }
        if (C.ring?.on) {
          C.ring.o.set(r.pos.x, fy + 0.3, r.pos.z);
          C.ring.m.position.copy(C.ring.o);
        }
      }
    }
    if (ck > 0) C.ph = (C.ph || 0) + dt * (4 + 16 * ck);
    if (ck > 0 && pal === 'base') tintMats(D.M, 'furia', smooth(ck) * 0.92, 0.5 + 0.5 * Math.sin(C.ph), 0.5 + 0.5 * Math.sin(g.time * 2.1 + id));
    else tintMats(D.M, pal, pal === 'base' ? 0 : 1, 0.5 + 0.5 * Math.sin(g.time * 9), 0.5 + 0.5 * Math.sin(g.time * 2.1 + id));
    const bolts = D.model.userData.cosmic?.bolts;
    if (bolts) bolts.visible = pal !== 'base' || ck > 0.5;
    if (ck > 0.5) this.remoteFuriaT = g.time;
    if (pal !== 'base') this.remoteFuriaT = g.time;
    if (pal !== 'base' && Math.random() < dt * 22 && a.group) {
      const p = a.group.position;
      g.fx.add.spawn(p.x + rnd() * 0.7, p.y + 0.3 + Math.random() * 1.6, p.z + rnd() * 0.7, rnd() * 0.3, 0.6 + Math.random() * 0.8, rnd() * 0.3, { color: PAL[pal].dust[(Math.random() * 3) | 0], size: 0.06, size1: 0, life: 0.7, drag: 0.8 });
    }
  }

  // El asta por las dos manos del muñeco (los huesos del cuadro anterior,
  // como la matriz del agarre: van juntos). false si no hay cuerpo de dos manos.
  avatarTwoHands(a, D) {
    const G = a.gs;
    const B = G?.bones;
    if (!B?.RightHand || !B?.LeftHand || !G.two || globalThis.__mduDesgOldAvatar === true) return false;
    const holder = D.holder;
    // (la palma: un poco más allá de la muñeca, hacia los dedos)
    const palm = (hand, fore, out) => {
      hand.getWorldPosition(out);
      fore.getWorldPosition(_avF);
      return out.addScaledVector(_avD.subVectors(out, _avF).normalize(), 0.075);
    };
    palm(B.RightHand, B.RightForeArm, _avR);
    palm(B.LeftHand, B.LeftForeArm, _avL);
    _avI.copy(holder.matrixWorld).invert();
    _avR.applyMatrix4(_avI);
    _avL.applyMatrix4(_avI);
    const d = _avD.subVectors(_avL, _avR);
    if (d.lengthSq() < 1e-4) return false;
    d.normalize();
    // la hoja para arriba (el arriba del mundo, en el agarre)
    _avU.set(0, 1, 0).transformDirection(_avI);
    shaftQuat(d.x, d.y, d.z, _avU.x, _avU.y, _avU.z, _avQ);
    // el tajo y el giro: la hoja da la vuelta alrededor del asta
    let roll = 0;
    if (D.act === 'swing') {
      const k = Math.min(1, D.actT / 0.4);
      roll = (D.arg === 'rev' ? -1 : 1) * Math.PI * 2 * smooth(k);
    } else if (D.act === 'spin') roll = Math.min(1, D.actT / (+D.arg || 1.1)) * Math.PI * 2 * SPIN_TURNS;
    // (furia11) concentrando: la hoja tiembla sobre el asta, cada vez más
    else if (D.conc) roll = D.conc.roll || 0;
    if (roll) _avQ.multiply(_avQ2.setFromAxisAngle(Y_AXIS, roll));
    D.pivot.position.copy(_avR);
    D.pivot.quaternion.copy(_avQ);
    D.pivot.scale.setScalar(1);
    // (el puño derecho en su lugar del asta: el modelo tiene el origen ahí)
    D.model.position.set(0, 0, 0);
    D.model.quaternion.identity();
    return true;
  }

  // ¿Algún compañero la tiene en la mano? (Session 'wpn')
  remoteHeld() {
    const W = this.g.net?.wpn;
    if (!W) return false;
    for (const x of W.values()) if (x.w === ID) return true;
    return false;
  }

  clear() {
    // (dormida y sin nada armado: nada que limpiar)
    if (!this._fx) {
      this.kills = 0;
      this.mode = 'none';
      return;
    }
    this.fx.clear();
    this.stopBeam();
    if (this.beam.rig) {
      this.beam.rig.release();
      this.beam.rig = null;
    }
    this.beam.k = 0;
    this.beam.pk = 0;
    for (const r of this.remoteBeams) {
      r.loop?.stop(0.1);
      r.rig.release();
    }
    this.remoteBeams.length = 0;
    // (furia11) sin el sonido del final, y la concentración a medias, fuera
    this.endFuria(true);
    if (this.mode === 'conc' && !this.concLit) this.cancelConc();
    stopSnd(this.g, this.concSnd, 0.1);
    this.concSnd = null;
    this.concRing = null;
    this.concLit = false;
    this.concK = 0;
    this.tens = 0;
    this.furiaQ = 0;
    this.furiaLive = false;
    this.gather?.clear();
    this.endExec();
    this.dash = null;
    this.slideM = null;
    for (const z of this.slowed) {
      if (z.tbOrig != null) z.speed = z.tbOrig;
      z.tbOrig = null;
    }
    this.slowed.clear();
    this.rip = 0;
    this.swq.length = 0;
    // (v4)
    this.cancelCharge();
    this.chargeCd = 0;
    this.chargedK = 0;
    this.eclK = 0;
    this.fillT = 0;
    this.bleed?.clear();
    this.cazador.clear();
    this.rHold = -1;
    this.trailPts.length = 0;
    this.trail.geometry.setDrawRange(0, 0);
    this.tint = 0;
    if (!this.w.slots?.some((s) => s.id === ID)) this.kills = 0;
    if (this.mode !== 'none') this.mode = 'idle';
    // (partida nueva o escena: sin la guadaña y fuera de Eclipse, a dormir)
    if (MAP_ID !== 'eclipse' && !this.held() && globalThis.__mduNoDesgSleep !== true) this.awake = false;
  }
}
