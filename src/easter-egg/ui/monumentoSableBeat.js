import * as THREE from 'three';
import { cineClip } from '../net/gauchoSkin';
import { gilVincha } from '../net/gilLook';
import { sableModel, bladeFrame, BLADE_L } from '../weapons/sableModels';
import { PERSONA_T } from './cineCrew';
import { yawTo } from './cineActors';
import { warmScene } from './cineWarm';
import { smooth, lerp } from './castleCine';
import { assetUrl } from '../../lib/assets';

// El sable de San Martín para el Gauchito Gil (ui/MonumentoEnding, entre el
// mate de Belgrano y su despedida). Solo de escena: el Sable Corvo de los
// jugadores, el premio y markEgg no cambian.
//  - Se raja el aire en el camino del Parque: un desgarro violeta y negro, con
//    el borde rosa y blanco (el de Eclipse Matero, no los portales azules).
//  - Cada uno a su manera (ui/cineCrew): el Valiente se sobresalta y da dos
//    pasos al frente con los puños; el Miedoso se agacha y tiembla; el Viejo
//    trastabilla; el Canchero se sacude el polvo del poncho y sigue cebando.
//  - Sale el Gil (el bueno, el de Mate no Numa: el gaucho de poncho colorado).
//    Lo reconocen: el Miedoso se santigua y reza, el Viejo se arrodilla.
//  - El Valiente se arrodilla, levanta del piso el sable (estaba ahí desde el
//    principio, al pie del mástil) y se lo presenta en las palmas. El Gil cierra
//    la derecha en el puño, apoya la hoja en la izquierda y se lo lleva.
//    "San Martín lo va a necesitar." Lo alza; el Valiente le contesta con el
//    puño en alto, Belgrano asiente, el Canchero cabecea.
//  - El Gil se da vuelta y se vuelve por el desgarro, que se cierra.
// Clips de Blender: E/sable-gil/sable_clips.py → modelos/gaucho/cine-sable.json
// (anim_qa). El sable sale de las manos de verdad, como en Blender: con dos
// manos, los puntos de las palmas sobre la curva de la hoja; con una, pegado a
// la mano con lo que tenía al soltar la otra.
// En línea cada compu la ve en la suya: todo va con el reloj de la escena,
// contado desde la hora programada del paso (ui/castleCine stepAt).
// Luces: ninguna nueva (los fogonazos son los de fx, que ya existen); el
// desgarro, el Gil y el sable se arman escondidos y se compilan al empezar la
// escena (ui/cineWarm). globalThis.__mduNoSableGil: la escena como antes.

const URL = '/assets/sotano/modelos/gaucho/cine-sable.json';
let CLIPS = null;
let LOAD = null;
function loadSableClips() {
  LOAD ||= fetch(assetUrl(URL))
    .then((r) => (r.ok ? r.json() : null))
    .then((J) => {
      if (!J) return null;
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
      return C;
    })
    .catch(() => null);
  return LOAD;
}

// las medidas de sable_clips.py (sg_meta.json): el Gil a DIST del Valiente
const DIST = 0.85;
const TRANSFER = 1.5;
const REL_T = 3.75;
const GR_T = 1.2;
const V_GROUND = [0.28, -0.47, 0.012];
const S_VL = 0.14;
const S_VR = 0.42;
const S_GL = 0.64;
const SUP = 0.047;
const GRIP_IN = 0.005;
const GRIP_S = -0.075;
// el centro de la manopla desde el hueso de la mano y la normal de la palma,
// en reposo (medido en Blender, pasado a three)
const C_REST = { Right: new THREE.Vector3(0.006, -0.112, 0.023), Left: new THREE.Vector3(-0.008, -0.114, 0.027) };
const N_REST = { Right: new THREE.Vector3(1, 0, 0), Left: new THREE.Vector3(-1, 0, 0) };

// dónde (respecto del mástil) y cuánto dura
const LINE = 'San Martín lo va a necesitar.';
const GIL_ID = 900;
const PONCHO_GIL = 0xb01c14;
const DUR = 19.9;
// La despedida con más aire (el usuario, 2026-10-07: las tomas del final iban
// apuradas, y la de Belgrano saludando al Gil duraba 1 s): cuánto más dura la
// toma del sable en alto y cuánto más la de Belgrano; lo que sigue se corre.
// (globalThis.__mduNoGilPausa: como antes)
const LIFT_X = 0.5;
const NOD_X = 1.9;
// el desgarro: alto, ancho (medio, en el medio) y el plano del halo
const RIFT_H = 2.7;
const RIFT_W = 0.6;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const Z3 = new THREE.Vector3(0, 0, 1);
const smoothW = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));

// ---------------- la hoja (la misma curva que weapons/sableModels) ----------------
const _bf = {};
function center(s, out) {
  if (s <= 0) return out.set(0, s, 0);
  const f = bladeFrame(s / BLADE_L, _bf);
  return out.set(f.x + (f.nx * f.w) / 2, f.y + (f.ny * f.w) / 2, 0);
}
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const f2 = new THREE.Vector3();
const f3 = new THREE.Vector3();
const wv = new THREE.Vector3();
const mL = new THREE.Matrix4();
const mW = new THREE.Matrix4();
// El sable con el punto sa de la hoja en A y la línea hacia sb pasando por B,
// el plano de la hoja lo más para arriba posible.
export function sableTwo(A, sa, B, sb, out) {
  center(sa, pa);
  center(sb, pb);
  e1.subVectors(pb, pa).normalize();
  e2.crossVectors(Z3, e1);
  wv.subVectors(B, A).normalize();
  f3.copy(UP).addScaledVector(wv, -UP.dot(wv)).normalize();
  f2.crossVectors(f3, wv);
  mL.makeBasis(e1, e2, Z3).transpose();
  mW.makeBasis(wv, f2, f3);
  out.multiplyMatrices(mW, mL);
  pa.applyMatrix4(out);
  out.setPosition(tmpV.copy(A).sub(pa));
  return out;
}
const lA = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
const lB = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
export function mixM(A, B, k, out) {
  A.decompose(lA.p, lA.q, lA.s);
  B.decompose(lB.p, lB.q, lB.s);
  return out.compose(lA.p.lerp(lB.p, k), lA.q.slerp(lB.q, k), ONE);
}

// La mano de un gaucho (gauchoSkin): el centro de la manopla, la normal de la
// palma y el giro desde el reposo (el hueso por su inversa de reposo).
const HQ = new WeakMap();
export function hand(a, side, out) {
  const G = a.gs;
  const B = G.bones[side + 'Hand'];
  let h = HQ.get(B);
  if (!h) {
    const sk = G.mesh.skeleton;
    const qInv = new THREE.Quaternion();
    sk.boneInverses[sk.bones.indexOf(B)].decompose(tmpS, qInv, tmpW);
    const qBind = new THREE.Quaternion();
    G.mesh.bindMatrix.decompose(tmpS, qBind, tmpW);
    h = { qInv, qBind };
    HQ.set(B, h);
  }
  B.getWorldPosition(out.p);
  B.getWorldQuaternion(out.q).multiply(h.qInv).multiply(h.qBind);
  out.c.copy(C_REST[side]).applyQuaternion(out.q).add(out.p);
  out.n.copy(N_REST[side]).applyQuaternion(out.q);
  return out;
}
const hv = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), c: new THREE.Vector3(), n: new THREE.Vector3() });
const HL = hv();
const HR = hv();
const A_ = new THREE.Vector3();
const B_ = new THREE.Vector3();

// ---------------- el desgarro ----------------
const RIFT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// (x en m a lo ancho, y en m desde el piso: el desgarro toca el piso en un
// punto, redondo, y termina en punta arriba; el borde, de a saltos)
const RIFT_COMMON = `
uniform float uT;
uniform float uOpen;
uniform float uCrack;
uniform float uFlash;
varying vec2 vUv;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return s;
}
float riftD(vec2 p) {
  float u = clamp(p.y / ${RIFT_H.toFixed(2)}, 0.0, 1.0);
  float s = max(sin(3.14159 * u), 0.0);
  float w = ${RIFT_W.toFixed(2)} * pow(s + 0.0001, 0.4) * (1.0 - 0.25 * u);
  w += (fbm(vec2(p.y * 5.0, uT * 0.6)) - 0.5) * 0.12 * s;
  // (rasgado: dientes chicos que tiemblan)
  w += (vn(vec2(p.y * 23.0, uT * 2.2)) - 0.5) * 0.07 * s + (vn(vec2(p.y * 61.0, 7.0)) - 0.5) * 0.025 * s;
  float crack = 0.011 * pow(s + 0.0001, 0.5) * uCrack;
  float hw = max(w * uOpen, crack);
  // (la raja no es derecha: se tuerce un poco a lo alto)
  float bend = (fbm(vec2(p.y * 0.9, 3.1)) - 0.5) * 0.22;
  return hw - abs(p.x - bend);
}`;
const RIFT_FRAG = `${RIFT_COMMON}
uniform vec2 uSize;
void main() {
  vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
  float d = riftD(p);
  float inside = smoothstep(-0.006, 0.006, d);
  // adentro: negro con remolinos violetas que giran despacio y chispas rosas
  float ca = cos(uT * 0.3);
  float sa = sin(uT * 0.3);
  vec2 q = p - vec2(0.0, ${(RIFT_H / 2).toFixed(2)});
  q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  float sw = fbm(q * 2.4 + vec2(0.0, -uT * 0.35) + length(q) * 1.6);
  vec3 col = vec3(0.012, 0.0, 0.028) + vec3(0.34, 0.05, 0.62) * sw * sw * 0.7;
  float spk = step(0.992, hh(floor(p * 70.0) + floor(uT * 6.0)));
  col += vec3(1.0, 0.55, 0.9) * spk * 0.8;
  // el borde: rosa que se vuelve blanco en el filo
  float rim = 1.0 - smoothstep(0.0, 0.05 + 0.03 * uFlash, abs(d));
  float on = step(0.0005, uOpen + uCrack);
  vec3 rc = mix(vec3(1.0, 0.42, 0.86), vec3(1.0, 0.95, 1.0), rim * rim) * (2.0 + 3.0 * uFlash);
  col = mix(col, rc, rim);
  float a = max(inside * 0.97, rim * 0.92) * on;
  gl_FragColor = vec4(col, a);
}`;
const GLOW_FRAG = `${RIFT_COMMON}
uniform vec2 uSize;
void main() {
  vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
  float d = riftD(p);
  float out_ = max(0.0, -d);
  float g = exp(-out_ * 5.5) * (1.0 - step(0.0, d));
  float fl = 0.8 + 0.2 * sin(uT * 7.0 + p.y * 3.0);
  // (se apaga hacia los bordes del plano: sin cortes rectos)
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(1.0, 0.8, vUv.y);
  vec3 c = vec3(0.55, 0.12, 0.85) * g * fl * (uOpen * 1.1 + uFlash * 1.5) * edge;
  gl_FragColor = vec4(c, 1.0);
}`;
const FLOOR_FRAG = `
uniform float uOpen;
uniform float uFlash;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(vec2(p.x, p.y * 1.6));
  float g = max(0.0, 1.0 - r);
  vec3 c = vec3(0.5, 0.1, 0.8) * g * g * (uOpen * 0.55 + uFlash * 0.8);
  gl_FragColor = vec4(c, 1.0);
}`;

// (las medidas del pase, para ui/eclipseSableTrip: el mismo pase del otro lado)
export const SB = { DIST, TRANSFER, REL_T, GR_T, V_GROUND, S_VL, S_VR, S_GL, SUP, GRIP_IN, GRIP_S, LINE, PONCHO_GIL, RIFT_VERT, RIFT_FRAG, GLOW_FRAG, FLOOR_FRAG, RIFT_H };
export { loadSableClips };
export const sableClips = () => CLIPS;

export function sableBeatOn(cine) {
  // (el Gil viene a buscar el sable; el usuario la quiso en el juego antes de
  // que salga el mapa que sigue, 2026-10-06. __mduNoSableGil: la escena como antes)
  return globalThis.__mduNoSableGil !== true && !!cine.crew;
}

export default class SableBeat {
  constructor(cine) {
    this.cine = cine;
    const g = (this.g = cine.g);
    const C = (this.C = cine.crew);
    loadSableClips();
    // (los clips de esta escena, además de los de cine-medias y los de siempre)
    const base = C.clipOf.bind(C);
    C.clipOf = (name) => CLIPS?.[name] || base(name);
    const B = cine.B;
    const fl = (x, z) => C.floor(x, z);
    // el desgarro, en el camino entre los troncos, mirando a la fila (+z)
    this.P = new THREE.Vector3(100.2, fl(100.2, 25.9), 25.9);
    // adonde da los dos pasos el Valiente (mirando al desgarro) y el Gil enfrente
    this.V = new THREE.Vector3(B.x - 3.15, 0, 29.1);
    this.V.y = fl(this.V.x, this.V.z);
    this.G = new THREE.Vector3(this.V.x, 0, this.V.z - DIST);
    this.G.y = fl(this.G.x, this.G.z);
    this.buildRift();
    this.buildGil();
    this.buildSable();
    this.events = [];
    this.on = false;
    this.done = false;
    // todo lo nuevo, compilado ya (escondido): no traba el primer cuadro
    warmScene(g);
  }

  // ---------------- armado ----------------
  buildRift() {
    const root = (this.rift = new THREE.Group());
    root.position.copy(this.P).add(tmpV.set(0, 0.01, 0));
    root.visible = false;
    const U = (this.U = { uT: { value: 0 }, uOpen: { value: 0 }, uCrack: { value: 0 }, uFlash: { value: 0 } });
    const mk = (w, h, frag, o) => {
      const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
      const m = new THREE.ShaderMaterial({ uniforms: { ...U, uSize: { value: new THREE.Vector2(w, h) } }, vertexShader: RIFT_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...o });
      return new THREE.Mesh(geo, m);
    };
    // (el halo atrás, el corazón adelante: el corazón tapa lo que pasa del otro lado)
    this.glow = mk(3.2, RIFT_H + 0.6, GLOW_FRAG, { blending: THREE.AdditiveBlending });
    this.core = mk(1.9, RIFT_H, RIFT_FRAG, {});
    this.core.renderOrder = 2;
    this.glow.renderOrder = 1;
    // la luz en el piso (sin luces: un brillo sumado)
    const fg = new THREE.PlaneGeometry(3.6, 2.4).rotateX(-Math.PI / 2).translate(0, 0.012, 0.35);
    this.floorGlow = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: RIFT_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    root.add(this.glow, this.core, this.floorGlow);
    this.cine.root.add(root);
  }

  // El Gil bueno (el de Mate no Numa): el gaucho de siempre, poncho colorado,
  // escondido (dead) hasta que sale del desgarro. Va con los cuatro (CineActors):
  // los mismos clips, el mismo piso, el mate escondido.
  buildGil() {
    const C = this.C;
    const r = { id: GIL_ID, name: 'Antonio Gil', noTag: true, pos: this.P.clone().add(tmpV.set(0, 0, -0.45)), yaw: Math.PI, pitch: 0, speed: 0, moving: false, persona: 'gil', dead: true };
    r.pos.y = C.floor(r.pos.x, r.pos.z);
    C.people.add(r);
    const a = C.people.list.get(r.id);
    a.M.poncho.color.set(PONCHO_GIL).multiplyScalar(1.7);
    r.a = a;
    r.mate = false;
    C.list.push(r);
    C.by.gil = r;
    // (parado desde ya, escondido: si no, el cuerpo queda en la pose de caído
    // y al salir se levantaba del piso)
    C.act(r, 'gilStand', { loop: true });
    this.gil = r;
  }

  // El sable (una malla propia: weapons/sableModels, el forjado), en el piso al
  // pie del mástil desde que empieza la escena, delante de donde se va a
  // arrodillar el Valiente: de través, el puño a su izquierda, el plano arriba.
  buildSable() {
    const s = (this.sable = new THREE.Group());
    s.matrixAutoUpdate = false;
    const m = sableModel(0);
    s.add(m);
    // lo más bajo del sable acostado (el eje z del sable es el del plano)
    const bb = new THREE.Box3().setFromObject(m);
    this.sableLow = -bb.min.z;
    this.cine.root.add(s);
    this.Sground = this.authorM(this.V, 0, V_GROUND, new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1));
    // (apoyado de verdad: lo más bajo a 2 mm del piso)
    this.Sground.elements[13] = this.V.y + this.sableLow + 0.002;
    this.S = new THREE.Matrix4().copy(this.Sground);
    this.Sfrom = new THREE.Matrix4();
    this.state = 'ground';
    this.place();
  }

  // Una pose del sable en el espacio de autor de un clip (Blender: mira a -Y,
  // la izquierda +X, arriba +Z) puesta en el mundo desde el origen del clip
  // (r.pos) mirando a yaw (como poseCineClip: yaw + PI).
  authorM(pos, yaw, o, ex, ey, ez) {
    const toW = (v, out) => out.set(v.x ?? v[0], v.z ?? v[2], -(v.y ?? v[1])).applyAxisAngle(UP, yaw + Math.PI);
    const X = toW(ex, new THREE.Vector3());
    const Y = toW(ey, new THREE.Vector3());
    const Z = toW(ez, new THREE.Vector3());
    const M = new THREE.Matrix4().makeBasis(X, Y, Z);
    const t = toW({ x: o[0], y: o[1], z: o[2] }, new THREE.Vector3()).add(pos);
    return M.setPosition(t);
  }

  place() {
    const s = this.sable;
    s.matrix.copy(this.S);
    s.matrixWorldNeedsUpdate = true;
  }

  // ---------------- el paso del guion ----------------
  // Lo arma todo con el reloj de la escena desde la hora programada del paso
  // (en línea, una compu trabada se pone al día en orden).
  step() {
    const cine = this.cine;
    // (sin los clips todavía: la escena sigue sin el paso)
    if (!CLIPS || !this.gil.a?.gs?.on) return 0;
    this.on = true;
    this.t0 = cine.stepAt ?? cine.t;
    const C = this.C;
    const b = C.by;
    const g = this.g;
    const P = this.P;
    const V = this.V;
    const G = this.G;
    const gil = this.gil;
    const my = P.y;
    const ev = (t, fn) => this.events.push({ t, fn });
    const act = (r, clip, o = {}) => (late) => r && C.act(r, clip, { ...o, t: (o.t || 0) + (o.keep ? 0 : late) });
    const pd = (k) => PERSONA_T[k]?.delay || 0;
    const portalAt = new THREE.Vector3(P.x, P.y, P.z - 1.2);
    const slow = globalThis.__mduNoGilPausa !== true;
    // (x1: lo que se corre la toma de Belgrano; x2: todo lo de después)
    const x1 = slow ? LIFT_X : 0;
    const x2 = slow ? LIFT_X + NOD_X : 0;

    // 1. se raja el aire (la cámara, del lado del río, entre los troncos)
    ev(0, () => {
      cine.shot(2.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.set(lerp(102.25, 101.95, k), my + lerp(1.5, 1.45, k), lerp(28.15, 27.8, k));
        look.set(P.x, my + 1.35, P.z);
      });
      this.rift.visible = true;
      this.sfx('crack');
    });
    ev(0.55, () => {
      this.opening = { t: 0.55, d: 1.5 };
      this.flash(1, 0.9);
      g.fx.flash(tmpV.copy(P).setY(my + 1.3), 0xd070ff, 30, 0.6, 12);
      g.fx.sparkle(tmpV.copy(P).setY(my + 1.2), [0.85, 0.45, 1], 30, 0.9);
      this.sfx('tear');
    });
    // cada uno a su manera y a su tiempo
    ev(0.7 + pd('valiente'), act(b.valiente, 'flinch', { fade: 0.2 }));
    ev(0.7 + pd('miedoso'), act(b.miedoso, 'duck', { fade: 0.15 }));
    ev(0.7 + pd('canchero'), () => C.turnTo(b.canchero, P));
    // (el Viejo se da vuelta, trastabilla y después retrocede: queda atrás, hacia la calle)
    ev(0.5 + pd('viejo'), () => C.turnTo(b.viejo, P, 0.7));
    ev(1.25 + pd('viejo'), act(b.viejo, 'stagger', { fade: 0.3 }));
    // (el viento del desgarro: el Canchero se sacude el poncho, sin el mate)
    ev(1.75, (late) => {
      b.canchero.mate = false;
      C.act(b.canchero, 'dust', { fade: 0.4, t: late });
    });
    // el Valiente da dos pasos al frente, entre los otros y el desgarro
    ev(2.1, () => C.walkTo(b.valiente, V, 1.2, 'fists', { loop: true, fade: 0.4 }));

    // 2. los cuatro, desde el lado del desgarro (lo que ve el que sale)
    ev(2.4, () => {
      cine.shot(2.2, (u, lt, pos, look) => {
        pos.set(lerp(100.95, 100.85, u), my + 1.3, lerp(26.75, 26.6, u));
        look.set(99.95, my + 1.05, 30.0);
      });
    });
    ev(2.42, act(b.miedoso, 'cower', { loop: true, fade: 0.5 }));
    ev(2.75 + pd('viejo'), () => {
      // (trastabilló para atrás: queda donde quedó, sin volver resbalando) y retrocede un poco más
      this.settle(b.viejo, 'stagger');
      this.stepBack(b.viejo, 0.7, 1.2);
    });
    // (despacio: girando de golpe en el lugar los pies patinaban)
    ev(3.35, () => C.turnTo(b.valiente, portalAt.set(V.x, 0, P.z - 1), 0.9));
    ev(3.75, (late) => {
      b.canchero.mate = true;
      C.act(b.canchero, 'cebar', { loop: true, fade: 0.5, t: late });
    });

    // 3. sale el Gil (por encima del hombro del Valiente)
    ev(4.3, () => {
      gil.dead = false;
      gil.pos.copy(P).add(tmpV.set(0, 0, -0.45));
      gil.pos.y = C.floor(gil.pos.x, gil.pos.z);
      gil.yaw = Math.PI;
      C.walkTo(gil, G, 2.9, 'gilStand', { loop: true, fade: 0.4 });
      cine.bel.lookAt = gil.pos;
    });
    ev(4.6, () => {
      cine.shot(2.2, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.set(lerp(101.45, 101.4, k), my + lerp(1.6, 1.55, k), lerp(29.55, 29.45, k));
        look.set(100.2, my + 1.15, lerp(26.4, gil.pos.z, k));
      });
    });
    ev(4.9, () => g.fx.sparkle(tmpV.copy(gil.pos).setY(my + 1.0), [0.9, 0.5, 1], 14, 0.6));
    // lo reconocen
    ev(5.4, act(b.valiente, 'chestHand', { loop: true, fade: 0.6 }));
    ev(5.4 + pd('miedoso'), () => C.turnTo(b.miedoso, gil.pos));
    ev(5.75, act(b.miedoso, 'santiguar', { fade: 0.5 }));
    ev(5.3, () => C.turnTo(b.viejo, gil.pos));
    ev(5.9, act(b.viejo, 'kneelDown', { fade: 0.5 }));
    ev(6.9, act(b.viejo, 'kneelHold', { loop: true, fade: 0.35 }));
    // 4. el Valiente se arrodilla y levanta el sable (de costado, desde el río)
    ev(6.1, act(b.valiente, 'sableKneel', { fade: 0.4 }));
    ev(6.8, () => {
      cine.shot(2.6, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.set(lerp(98.85, 98.95, k), my + lerp(1.35, 1.3, k), lerp(27.0, 27.15, k));
        look.set(100.4, my + lerp(1.0, 0.95, k), 28.8);
      });
    });
    ev(7.75, act(b.miedoso, 'pray', { loop: true, look: 0.15, fade: 0.6 }));
    ev(9.1, act(b.valiente, 'sablePresent', { loop: true, fade: 0.15 }));
    // 5. el Gil lo toma (las manos de cerca)
    const TK = 9.25;
    ev(TK, (late) => {
      gil.yaw = Math.PI;
      gil.pos.x = G.x;
      gil.pos.z = G.z;
      C.act(gil, 'gilTake', { fade: 0.4, t: late });
    });
    ev(9.4, () => {
      // (del lado del río, al costado del Valiente: la cara del Gil, las cuatro
      // manos y la hoja de costado; el desgarro atrás)
      cine.shot(1.8, (u, lt, pos, look) => {
        pos.set(lerp(101.6, 101.5, u), my + lerp(1.3, 1.28, u), lerp(29.45, 29.4, u));
        look.set(100.22, my + 0.97, 28.6);
      });
    });
    ev(TK + TRANSFER, act(b.valiente, 'sableRise', { fade: 0.15 }));
    // 6. el Gil lo mira y habla (por encima del hombro del Valiente, el desgarro atrás)
    ev(11.2, () => {
      cine.shot(2.2, (u, lt, pos, look) => {
        pos.set(lerp(101.3, 101.25, u), my + lerp(1.45, 1.5, u), lerp(29.45, 29.5, u));
        look.set(100.2, my + 1.35, 28.15);
      });
    });
    ev(TK + 2.6, () => cine.say('gil', LINE));
    // (el Valiente se para y da un paso atrás: le deja lugar; y al alzar el Gil
    // el sable, le contesta con el puño en alto, que sube desde el costado: desde
    // la mano en el pecho pasaba por la cara)
    ev(TK + 3.7, () => this.stepBack(b.valiente, 0.6, 1.0, 'fistUp'));
    // 7. lo alza: todos (de atrás de la fila, el mástil a la derecha)
    ev(13.4, () => {
      cine.shot(1.7 + x1, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.set(lerp(102.3, 102.2, k), my + lerp(1.45, 1.5, k), lerp(29.6, 29.5, k));
        look.set(100.35, my + lerp(1.7, 1.95, k), 28.1);
      });
    });
    // Belgrano lo saluda: una inclinación de cabeza lenta, con la cámara que se le acerca
    ev(15.1 + x1, () => {
      cine.shot(1.0 + (slow ? NOD_X : 0), (u, lt, pos, look) => {
        const k = slow ? smooth(u) : u;
        pos.set(lerp(101.0, slow ? 101.3 : 101.05, k), my + 1.45, lerp(28.7, slow ? 29.0 : 28.75, k));
        look.set(103.0, my + 1.55, 30.75);
      });
    });
    ev(15.15 + x1 + (slow ? 0.45 : 0), () => (this.nodAt = cine.t));
    ev(15.0, (late) => {
      b.canchero.mate = false;
      C.act(b.canchero, 'cool', { loop: true, fade: 0.5, t: late });
    });
    ev(14.3, () => cine.quiet());
    // 8. se da vuelta y se vuelve por el desgarro (de atrás de los cuatro)
    ev(TK + 6.85 + x2, () => {
      const pts = [new THREE.Vector3(G.x + 0.48, 0, G.z - 0.3), new THREE.Vector3(G.x + 0.28, 0, G.z - 1.05), new THREE.Vector3(P.x + 0.02, 0, P.z + 0.55), new THREE.Vector3(P.x, 0, P.z), new THREE.Vector3(P.x, 0, P.z - 0.8)];
      C.walkPath(gil, pts, 1.15, 'gilWalkSable', { loop: true });
      C.act(gil, 'gilWalkSable', { loop: true, fade: 0.6, rate: 0 });
    });
    ev(16.0 + x2, () => {
      cine.shot(3.9, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.set(lerp(101.35, 101.2, k), my + lerp(1.55, 1.5, k), lerp(29.45, 29.2, k));
        look.set(100.2, my + 1.15, lerp(26.6, 26.0, k));
      });
    });
    ev(16.6 + x2, act(b.valiente, 'chestHand', { loop: true, fade: 0.6 }));
    ev(17.1 + x2, act(b.miedoso, 'wave', { fade: 0.6 }));
    ev(17.3 + x2, (late) => {
      b.canchero.mate = true;
      C.act(b.canchero, 'cebar', { loop: true, fade: 0.5, t: late });
    });
    ev(19.0 + x2, act(b.miedoso, 'pray', { loop: true, look: 0.15, fade: 0.6 }));
    // el Viejo se levanta despacio (como en el paso 5)
    ev(19.4 + x2, act(b.viejo, 'kneelDown', { t: 1.0, rate: -0.7, fade: 0.3, keep: true }));
    this.events.sort((x, y) => x.t - y.t);
    return DUR + x2;
  }

  // El cuerpo terminó un clip que lo corre (la cadera): queda ahí (como EsterosEnding settle).
  settle(r, name) {
    const c = this.C.clipOf(name);
    if (!c) return;
    const n = c.n - 1;
    const h = c.hips;
    tmpV.set(h[n * 3] - h[0], 0, h[n * 3 + 2] - h[2]).applyAxisAngle(UP, r.yaw + Math.PI);
    r.pos.add(tmpV);
    r.pos.y = this.C.floor(r.pos.x, r.pos.z);
  }

  // Un paso para atrás sin darse vuelta (el clip 'back', al paso de lo que se corre).
  stepBack(r, dist, dur, then = 'chestHand') {
    const fw = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
    (this.backs ||= []).push({ r, from: r.pos.clone(), to: r.pos.clone().addScaledVector(fw, -dist), t: 0, dur, then });
    this.C.act(r, 'back', { loop: true, fade: 0.35, rate: 0 });
  }

  // fogonazo del borde (0-1, se apaga solo)
  flash(k, d = 0.6) {
    this.flashK = Math.max(this.flashK || 0, k);
    this.flashD = d;
  }

  sfx(kind) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.copy(this.P).setY(this.P.y + 1.3), gain: 1, reverb: 0.7, ref: 7 });
    const t = A.now;
    if (kind === 'crack') {
      for (let i = 0; i < 7; i++) A.noise(o, { t: t + i * 0.07 + Math.random() * 0.03, dur: 0.06, type: 'highpass', freq: 2600 + i * 300, q: 1.2, gain: 0.25, attack: 0.002 });
    } else if (kind === 'tear') {
      A.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 320, freqEnd: 2600, q: 1.6, gain: 0.55, attack: 0.04 });
      A.tone(o, { t, dur: 1.8, type: 'sawtooth', freq: 62, freqEnd: 36, gain: 0.22, attack: 0.05 });
      A.tone(o, { t: t + 0.1, dur: 2.4, type: 'sine', freq: 880, freqEnd: 1320, gain: 0.05, attack: 0.3 });
    } else if (kind === 'close') {
      A.noise(o, { t, dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 120, gain: 0.6, attack: 0.01 });
      A.tone(o, { t: t + 0.55, dur: 0.9, type: 'sine', freq: 95, freqEnd: 30, gain: 0.55, attack: 0.004 });
      A.bell?.(o, t + 0.6, 74, { gain: 0.06, dur: 3 });
    }
  }

  // ---------------- cada cuadro ----------------
  // Después de crew.tick (los huesos ya puestos). dt: el del reloj de la escena.
  tick(dt) {
    const C = this.C;
    const cine = this.cine;
    // la vincha colorada del Gil (net/gilLook: lo distingue del gaucho colorado
    // del jugador; se le pone apenas carga su modelo, escondido todavía)
    gilVincha(this.gil?.a);
    // (en 1812 no están: tampoco el sable del piso)
    const shown = C.people.root.visible;
    this.sable.visible = shown && this.state !== 'gone';
    if (!this.on) return;
    const bt = cine.t - this.t0;
    // los eventos que vencieron, en orden (late: cuánto tarde corren)
    while (this.events.length && this.events[0].t <= bt) {
      const e = this.events.shift();
      e.fn(Math.max(0, bt - e.t));
    }
    // el desgarro: la raja, se abre, late, se cierra
    const U = this.U;
    U.uT.value += dt;
    U.uCrack.value = Math.min(1, U.uCrack.value + dt / 0.5);
    if (this.opening) U.uOpen.value = this.closing ? U.uOpen.value : 1 - (1 - smoothW(bt, this.opening.t, this.opening.t + this.opening.d)) ** 2;
    if (this.closing) {
      const k = (bt - this.closing) / 0.9;
      U.uOpen.value = Math.max(0, 1 - smooth(Math.min(1, k)));
      U.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1.05 && this.rift.visible) {
        this.rift.visible = false;
        const p = tmpV.copy(this.P).setY(this.P.y + 1.3);
        this.g.fx.flash(p, 0xff9ce8, 34, 0.45, 12);
        this.g.fx.sparkle(p, [1, 0.6, 0.95], 24, 0.5);
      }
    }
    this.flashK = Math.max(0, (this.flashK || 0) - dt / (this.flashD || 0.6));
    U.uFlash.value = this.flashK;
    // los que dan pasos para atrás (el Viejo, el Valiente)
    for (const Bk of this.backs || []) {
      Bk.t += dt;
      const k = Math.min(1, Bk.t / Bk.dur);
      const prev = tmpW.copy(Bk.r.pos);
      Bk.r.pos.lerpVectors(Bk.from, Bk.to, smooth(k));
      Bk.r.pos.y = C.floor(Bk.r.pos.x, Bk.r.pos.z);
      const c = C.clipOf('back');
      if (c?.speed && Bk.r.cc?.name === 'back' && dt > 0) Bk.r.cc.rate = Math.min(2, prev.distanceTo(Bk.r.pos) / dt / c.speed);
      if (k >= 1) {
        Bk.done = true;
        C.act(Bk.r, Bk.then, { loop: true, fade: 0.5 });
      }
    }
    if (this.backs?.some((x) => x.done)) this.backs = this.backs.filter((x) => !x.done);
    // Belgrano asiente cuando el Gil alza el sable
    const bel = cine.bel;
    // (despacio: baja la cabeza, la sostiene y vuelve; antes, un cabeceo de 1,3 s)
    if (bel && globalThis.__mduNoGilPausa !== true) {
      const k = this.nodAt != null ? Math.min(1, Math.max(0, (cine.t - this.nodAt) / 2.1)) : 0;
      bel.nod = 0.36 * smoothW(k, 0, 0.32) * (1 - smoothW(k, 0.68, 1));
    } else if (bel) bel.nod = this.nodAt != null ? 0.32 * Math.sin(Math.PI * Math.min(1, Math.max(0, (cine.t - this.nodAt) / 1.3))) : 0;
    // el Gil entra al desgarro: del otro lado ya no está
    const gil = this.gil;
    if (!gil.dead && bt > 12 && gil.pos.z < this.P.z - 0.45) {
      gil.dead = true;
      this.state = 'gone';
      this.closing = bt;
      if (bel) bel.lookAt = null;
      this.sfx('close');
    }
    this.fill();
    this.updateSable(dt);
  }

  // La luz del desgarro en las caras (sin luces: el relleno de cada gaucho,
  // gauchoSkin uFill). El Gil la trae encima.
  fill() {
    const open = this.U.uOpen.value + this.U.uFlash.value * 0.5;
    for (const r of this.C.list) {
      const u = r.a?.M?.gaucho?.userData.life?.uFill;
      if (!u) continue;
      const d = Math.hypot(r.pos.x - this.P.x, r.pos.z - this.P.z);
      let k = open * 0.16 * (1 - smooth(Math.min(1, Math.max(0, (d - 1) / 5))));
      if (r === this.gil) k = Math.max(k, 0.12 * Math.min(1, open + 0.3));
      u.value.setRGB(0.55 * k, 0.16 * k, 0.9 * k);
    }
  }

  // El sable: en el piso, en las palmas del Valiente, en las manos del Gil,
  // en el puño del Gil, o ya del otro lado.
  updateSable(dt) {
    const v = this.C.by.valiente;
    const gil = this.gil;
    const Sv = this.Sv || (this.Sv = new THREE.Matrix4());
    const Sg = this.Sg || (this.Sg = new THREE.Matrix4());
    const ready = (r) => r?.a?.gs?.on;
    const ruleV = () => {
      if (!ready(v)) return false;
      hand(v.a, 'Left', HL);
      hand(v.a, 'Right', HR);
      A_.copy(HL.c).addScaledVector(HL.n, SUP);
      B_.copy(HR.c).addScaledVector(HR.n, SUP);
      sableTwo(A_, S_VL, B_, S_VR, Sv);
      return true;
    };
    const ruleG = () => {
      if (!ready(gil)) return false;
      hand(gil.a, 'Right', HR);
      hand(gil.a, 'Left', HL);
      A_.copy(HR.c).addScaledVector(HR.n, GRIP_IN);
      B_.copy(HL.c).addScaledVector(HL.n, SUP);
      sableTwo(A_, GRIP_S, B_, S_GL, Sg);
      return true;
    };
    const vc = v?.cc;
    const gc = gil.cc;
    if (this.state === 'ground') {
      if (vc?.name === 'sableKneel' && vc.lt >= GR_T - 0.02 && ruleV()) {
        this.state = 'V';
        this.Sfrom.copy(this.S);
        this.blend = 0;
      }
    }
    if (this.state === 'V') {
      if (ruleV()) {
        this.blend = Math.min(1, this.blend + dt / 0.25);
        if (this.blend < 1) mixM(this.Sfrom, Sv, smooth(this.blend), this.S);
        else this.S.copy(Sv);
      }
      if (gc?.name === 'gilTake' && gc.lt >= TRANSFER && ruleG()) {
        this.state = 'G2';
        this.Sfrom.copy(this.S);
        this.blend = 0;
      }
    }
    if (this.state === 'G2') {
      if (ruleG()) {
        this.blend = Math.min(1, this.blend + dt / 0.25);
        // (en el pase, desde el Valiente que todavía lo sostiene)
        if (this.blend < 1 && ruleV()) mixM(Sv, Sg, smooth(this.blend), this.S);
        else this.S.copy(Sg);
      }
      if (gc?.name === 'gilTake' && gc.lt >= REL_T) {
        // suelta la izquierda: queda pegado al puño con lo que tiene
        hand(gil.a, 'Right', HR);
        this.Hf = this.Hf || new THREE.Matrix4();
        this.O = (this.O || new THREE.Matrix4()).copy(this.Hf.compose(HR.c, HR.q, ONE).invert()).multiply(this.S);
        this.state = 'G1';
      }
    }
    if (this.state === 'G1' && ready(gil)) {
      hand(gil.a, 'Right', HR);
      this.S.copy(this.Hf.compose(HR.c, HR.q, ONE)).multiply(this.O);
    }
    this.place();
  }

  dispose() {
    this.events.length = 0;
    this.on = false;
    if (this.cine.bel) {
      this.cine.bel.lookAt = null;
      this.cine.bel.nod = 0;
    }
    for (const m of [this.core, this.glow, this.floorGlow]) {
      m?.geometry.dispose();
      m?.material.dispose();
    }
    this.rift?.removeFromParent();
    // (el sable: geometrías y materiales compartidos con el de la mano; no se tiran)
    this.sable?.removeFromParent();
  }
}
