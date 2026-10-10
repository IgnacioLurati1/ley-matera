import * as THREE from 'three';
import CineActors from './cineActors';
import { cineClip } from '../net/gauchoSkin';
import { sableModel, bladeFrame, BLADE_L } from '../weapons/sableModels';
import { warmScene } from './cineWarm';
import { PERSONA_T } from './cineCrew';
import { ANCHORS } from '../entities/eclipse/Ingredientes';
import { EE, ISLANDS, ZONES, VOID_Y } from '../config/maps/eclipse';
import { assetUrl } from '../../lib/assets';

// La escena del Sable en Eclipse Matero: el reverso de la del Monumento
// (ui/monumentoSableBeat.js). La lanza el paso del Monumento al prender la
// Llama (entities/eclipse/Ingredientes.js SableGil: ee.scenes.sable(cb)).
// Corre en el mundo, con la cámara de cada jugador (nadie pierde el control):
//  - la Llama crece; al lado del Propileo se raja el aire y se abre un
//    desgarro: adentro se ve el Monumento de siempre, al alba (el Patio, el
//    Propileo, la Torre, el mástil con la bandera), con su clarín;
//  - salen los cuatro gauchos de siempre (ui/cineCrew), cada uno a su manera:
//    el Valiente adelante con el Sable atravesado sobre las palmas; el
//    Miedoso mira para atrás (el desgarro); el Canchero, tranquilo; el Viejo,
//    la mano en el pecho;
//  - el Valiente se arrodilla y lo presenta. Ahí cb(): el Sable queda para
//    agarrar (el aviso "recibir el Sable" va donde está el Sable, no en la
//    Llama, y el globito de luz del paso no se muestra: el Sable es el de las
//    manos del Valiente);
//  - el Gil (el jugador que es Gil) se acerca y lo recibe (F): "San Martín lo
//    va a necesitar."; el Valiente se para y levanta el puño, el Canchero
//    cabecea con la mano en alto, el Viejo saluda con el sombrero, el Miedoso
//    saluda con la mano; vuelven al desgarro, que se cierra.
// En línea cada compu la corre desde que le llega 'lit' (el paso ya viaja) y
// la entrega es el 'take' del paso: no hace falta un mensaje propio.
// Todo se arma con el mapa (escondido) y se compila en la carga; sin luces
// nuevas (fogonazos de fx). Clips de Blender: scratchpad cine/ecl_clips.py →
// modelos/gaucho/cine-eclipse.json (svWalk, svKneel, lookBack, cancheroOk,
// brimBow) + cine-sable.json (sablePresent, sableRise), anim_qa.
// globalThis.__mduNoEclipseSable: sin la escena (el Sable aparece en la Llama).

const FILES = ['cine-eclipse.json', 'cine-sable.json'];
let CLIPS = null;
let LOAD = null;
function loadClips() {
  LOAD ||= Promise.all(
    FILES.map((f) =>
      fetch(assetUrl(`/assets/sotano/modelos/gaucho/${f}`))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  ).then((all) => {
    if (all.some((J) => !J)) return null;
    const C = {};
    for (const J of all) for (const [k, c] of Object.entries(J.clips)) C[k] ||= cineClip(c);
    CLIPS = C;
    return C;
  });
  return LOAD;
}

const LINE = 'San Martín lo va a necesitar.';
// el desgarro: alto y medio ancho en el medio (m)
const RIFT_H = 3.4;
const RIFT_W = 1.5;
// las medidas de sable-gil/sable_clips.py (el sable sobre las dos palmas)
const S_VL = 0.14;
const S_VR = 0.42;
const SUP = 0.047;
const C_REST = { Right: new THREE.Vector3(0.006, -0.112, 0.023), Left: new THREE.Vector3(-0.008, -0.114, 0.027) };
const N_REST = { Right: new THREE.Vector3(1, 0, 0), Left: new THREE.Vector3(-1, 0, 0) };
// dónde va cada uno (respecto del desgarro: a lo ancho, hacia afuera) de
// dónde sale (atrás del desgarro) a dónde llega
const SPOTS = {
  valiente: { from: [0.05, -0.45], to: [0.05, 1.75], v: 0.62 },
  miedoso: { from: [-0.85, -0.45], to: [-0.95, 0.3], v: 0.75 },
  canchero: { from: [0.9, -0.45], to: [0.98, 0.42], v: 0.7 },
  viejo: { from: [0.25, -0.55], to: [0.3, 0.12], v: 0.45 },
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const Z3 = new THREE.Vector3(0, 0, 1);
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// ---------------- el sable sobre las palmas (como ui/monumentoSableBeat) ----------------
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
function sableTwo(A, sa, B, sb, out) {
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
const HQ = new WeakMap();
function hand(a, side, out) {
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

// ---------------- el desgarro, con el Monumento de siempre adentro ----------------
const RIFT_VERT = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// (x a lo ancho y y desde el piso, en m: un ojo rasgado que toca el piso en un
// punto y termina en punta arriba, el borde de a saltos)
const RIFT_COMMON = `
uniform float uT;
uniform float uOpen;
uniform float uCrack;
uniform float uFlash;
varying vec3 vPos;
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
  float w = ${RIFT_W.toFixed(2)} * pow(s + 0.0001, 0.45) * (1.0 - 0.12 * u);
  w += (fbm(vec2(p.y * 3.0, uT * 0.5)) - 0.5) * 0.2 * s;
  w += (vn(vec2(p.y * 17.0, uT * 2.0)) - 0.5) * 0.09 * s + (vn(vec2(p.y * 47.0, 7.0)) - 0.5) * 0.035 * s;
  float crack = 0.014 * pow(s + 0.0001, 0.5) * uCrack;
  float hw = max(w * uOpen, crack);
  float bend = (fbm(vec2(p.y * 0.7, 3.1)) - 0.5) * 0.35;
  return hw - abs(p.x - bend);
}`;
// El otro lado: el Monumento de siempre al alba, pintado con profundidad (lo
// que se ve por el desgarro se corre con la cámara, como por una ventana):
// el cielo del alba con el sol bajo, el patio de travertino con sus juntas,
// el mástil con la bandera, la columnata del Propileo y lejos la Torre.
const PAINT_MONUMENTO = `
vec3 hazeC = vec3(0.86, 0.56, 0.42);
vec3 skyC(vec3 d) {
  float el = d.y;
  vec3 c = mix(vec3(0.95, 0.52, 0.34), vec3(0.46, 0.6, 0.84), smoothstep(0.0, 0.22, el));
  c = mix(c, vec3(0.14, 0.24, 0.52), smoothstep(0.22, 0.75, el));
  vec3 sd = normalize(vec3(-0.6, 0.07, -0.8));
  float k = max(dot(d, sd), 0.0);
  c += vec3(1.0, 0.7, 0.4) * (pow(k, 90.0) * 1.6 + pow(k, 6.0) * 0.25);
  // nubes bajas, rosadas
  float cl = fbm(vec2(d.x / max(0.05, d.y + 0.12) * 1.3 + uT * 0.02, d.y * 9.0));
  c = mix(c, vec3(0.95, 0.58, 0.55), smoothstep(0.55, 0.8, cl) * 0.5 * (1.0 - smoothstep(0.05, 0.35, el)));
  return c;
}
vec3 haze(vec3 c, float t) {
  return mix(c, hazeC, 1.0 - exp(-t * 0.018));
}
vec3 otherSide(vec3 o, vec3 d) {
  vec3 col = skyC(d);
  float best = 1e5;
  // el patio (el piso del otro lado, a la misma altura)
  if (d.y < -0.002) {
    float t = o.y / -d.y;
    vec3 h = o + d * t;
    vec2 tl = fract(h.xz / 1.4);
    float joint = 1.0 - smoothstep(0.0, 0.03, min(min(tl.x, 1.0 - tl.x), min(tl.y, 1.0 - tl.y)));
    vec3 g = vec3(0.62, 0.52, 0.43) * (0.92 + 0.08 * vn(h.xz * 0.7)) * (1.0 - 0.22 * joint);
    // la luz del alba barre el patio desde el sol
    g *= 0.85 + 0.25 * smoothstep(-20.0, 20.0, -h.x);
    col = haze(g, t);
    best = t;
  }
  if (d.z < -0.001) {
    // la Torre, lejos (70 m): un prisma con el remate escalonado
    float t = (o.z + 70.0) / -d.z;
    vec3 h = o + d * t;
    float wdt = h.y > 44.0 ? 3.0 : 5.5;
    if (t < best && h.y > 0.0 && h.y < 50.0 && abs(h.x - 7.0) < wdt) {
      float side = smoothstep(-wdt, wdt, h.x - 7.0);
      vec3 c = mix(vec3(0.85, 0.6, 0.44), vec3(0.34, 0.32, 0.42), side);
      c *= 0.9 + 0.1 * step(0.5, fract(h.y / 3.0));
      col = haze(c, t * 1.4);
      best = t;
    }
    // la columnata del Propileo (28 m): columnas claras y el fondo en sombra
    t = (o.z + 28.0) / -d.z;
    h = o + d * t;
    if (t < best && h.y > 0.0 && h.y < 9.0 && abs(h.x) < 24.0) {
      float f = fract(h.x / 2.6);
      vec3 c = f < 0.25 ? vec3(0.78, 0.62, 0.5) * (0.85 + 0.5 * f) : vec3(0.14, 0.12, 0.16);
      if (h.y > 7.6) c = vec3(0.72, 0.58, 0.47);
      col = haze(c, t);
      best = t;
    }
    // el mástil y la bandera (14 m)
    t = (o.z + 14.0) / -d.z;
    h = o + d * t;
    if (t < best && h.y > 0.0 && h.y < 12.5 && abs(h.x + 4.0) < 0.07) {
      col = haze(vec3(0.5, 0.4, 0.25), t);
      best = t;
    }
    float fx = h.x + 4.0;
    float wave = sin(fx * 3.0 - uT * 4.0) * 0.18 * fx / 2.4;
    if (t < best && fx > 0.0 && fx < 2.4 && h.y > 10.2 + wave && h.y < 11.8 + wave) {
      float b = (h.y - 10.2 - wave) / 1.6;
      vec3 c = b > 0.333 && b < 0.666 ? vec3(0.85, 0.83, 0.8) : vec3(0.3, 0.55, 0.85);
      c *= 0.85 + 0.15 * sin(fx * 3.0 - uT * 4.0);
      col = haze(c, t);
    }
  }
  return col;
}
`;
// (2026-10-07, ITERACION-6 G1) El mismo Monumento, de noche: el final del
// Monumento —la otra mitad de esta escena— pasa de noche. Lo de arriba,
// apagado y azulado, con estrellas.
const PAINT_MONUMENTO_NOCHE = PAINT_MONUMENTO.replace('vec3 otherSide(vec3 o, vec3 d) {', 'vec3 otherSideDay(vec3 o, vec3 d) {') + `
vec3 otherSide(vec3 o, vec3 d) {
  vec3 c = otherSideDay(o, d);
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  vec3 n = mix(vec3(l), c, 0.4) * vec3(0.13, 0.16, 0.27);
  // el cielo, más negro arriba, y las estrellas
  float up = smoothstep(0.02, 0.5, d.y);
  n *= 1.0 - 0.55 * up;
  vec3 q = floor(normalize(d) * 150.0);
  float st = step(0.994, fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453)) * smoothstep(0.1, 0.3, d.y) * step(0.9, l);
  return n + vec3(0.8, 0.85, 1.0) * st * 0.7;
}
`;
// (2026-10-08, ITERACION-7 C6) El otro lado del Primer Mate: San Lorenzo, el
// 3 de febrero de 1813, al alba y con el eclipse total encima: el campo, el
// convento de San Carlos (el claustro blanco con sus tejas, la iglesia y el
// campanario), un ombú, y lejos, en el río, la silueta de El Eclipse con los
// ojos prendidos. Lo usa ui/eclipseCruce.js.
const PAINT_SANLORENZO = `
vec3 hazeC = vec3(0.3, 0.19, 0.22);
vec3 haze(vec3 c, float t) {
  return mix(c, hazeC, 1.0 - exp(-t * 0.014));
}
vec3 skySL(vec3 d) {
  float el = d.y;
  vec3 c = mix(vec3(0.95, 0.5, 0.24), vec3(0.32, 0.15, 0.3), smoothstep(0.0, 0.15, el));
  c = mix(c, vec3(0.02, 0.012, 0.045), smoothstep(0.15, 0.55, el));
  // el eclipse: el disco negro con su corona, alto y a la izquierda
  vec3 ed = normalize(vec3(-0.3, 0.52, -0.8));
  float k = max(dot(d, ed), 0.0);
  float disk = smoothstep(0.99925, 0.9994, k);
  float cor = pow(k, 1400.0) * 2.2 + pow(k, 160.0) * 0.35;
  c += vec3(1.0, 0.86, 0.62) * cor * (1.0 - disk);
  c *= 1.0 - disk;
  // las estrellas de la totalidad
  vec3 q = floor(normalize(d) * 160.0);
  c += vec3(0.75) * step(0.9955, fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453)) * smoothstep(0.22, 0.45, el);
  return c;
}
vec3 otherSide(vec3 o, vec3 d) {
  vec3 col = skySL(d);
  float best = 1e5;
  if (d.y < -0.002) {
    // el campo: pasto oscuro, la luz del alba rasante desde el fondo
    float t = o.y / -d.y;
    vec3 h = o + d * t;
    float n = vn(h.xz * 0.6) * 0.6 + vn(h.xz * 2.7) * 0.4;
    vec3 gr = mix(vec3(0.045, 0.06, 0.03), vec3(0.16, 0.14, 0.07), n);
    gr *= 0.75 + 0.45 * smoothstep(-10.0, -70.0, h.z);
    col = haze(gr, t);
    best = t;
  }
  if (d.z < -0.001) {
    // El Eclipse, lejos en el río (160 m, a la derecha): negro, el borde violeta y los ojos
    float t = (o.z + 160.0) / -d.z;
    vec3 h = o + d * t;
    vec2 qb = vec2((h.x - 44.0) / 17.0, (h.y - 22.0) / 30.0);
    vec2 qh = vec2((h.x - 44.0) / 7.5, (h.y - 58.0) / 8.5);
    float lb = length(qb) + 0.12 * (fbm(h.xy * 0.08) - 0.5);
    float lh = length(qh);
    if (t < best && h.y > 0.0 && (lb < 1.0 || lh < 1.0)) {
      float rim = max(smoothstep(0.78, 1.0, lb) * step(lb, 1.0), smoothstep(0.7, 1.0, lh) * step(lh, 1.0));
      vec3 c = vec3(0.025, 0.01, 0.045) + vec3(0.5, 0.14, 0.9) * rim * (0.55 + 0.25 * sin(uT * 2.0));
      vec2 e1 = vec2(h.x - 41.5, h.y - 59.0);
      vec2 e2 = vec2(h.x - 46.5, h.y - 59.0);
      float eye = step(length(e1 * vec2(1.0, 2.2)), 1.0) + step(length(e2 * vec2(1.0, 2.2)), 1.0);
      c += vec3(1.0, 0.25, 0.3) * eye * 2.0;
      col = haze(c, t * 0.55);
      best = t;
    }
    // el ombú (24 m, a la derecha): el tronco y la copa grande, oscuros
    t = (o.z + 24.0) / -d.z;
    h = o + d * t;
    float trunk = step(abs(h.x - 9.0 - 0.2 * sin(h.y * 0.8)), 0.9 - 0.08 * h.y) * step(h.y, 4.5);
    vec2 qc = vec2((h.x - 9.0) / 7.5, (h.y - 6.2) / 3.4);
    float crown = step(length(qc), 0.95 + 0.3 * (fbm(h.xy * 0.7) - 0.5));
    if (t < best && h.y > 0.0 && (trunk + crown) > 0.5) {
      col = haze(vec3(0.02, 0.03, 0.02) + vec3(0.12, 0.08, 0.05) * fbm(h.xy * 2.5) * crown, t);
      best = t;
    }
    // el convento (30 m): el claustro, la iglesia y el campanario, a la izquierda
    t = (o.z + 30.0) / -d.z;
    h = o + d * t;
    if (t < best && h.y > 0.0) {
      float x = h.x + 9.0;
      // (contra el alba, en sombra: se recorta; lo claro, el borde que le da el sol)
      vec3 wallC = vec3(0.32, 0.25, 0.24);
      vec3 roofC = vec3(0.2, 0.08, 0.06);
      vec3 c = vec3(-1.0);
      // el claustro: muro bajo con ventanas y el techo de tejas
      if (x > -22.0 && x < 2.0) {
        if (h.y < 4.0) {
          float win = step(0.42, fract(x / 3.2)) * step(fract(x / 3.2), 0.6) * step(1.4, h.y) * step(h.y, 2.7);
          // (algunas, con un candil adentro)
          float lit = step(0.55, hh(vec2(floor(x / 3.2), 3.0)));
          c = mix(wallC, mix(vec3(0.04, 0.03, 0.04), vec3(1.0, 0.62, 0.28) * 1.4, lit), win);
        } else if (h.y < 5.3 - 0.0) {
          c = roofC * (0.85 + 0.15 * step(0.5, fract(x * 1.6)));
        }
      }
      // la iglesia: el frente con el techo a dos aguas
      if (x >= 2.0 && x < 12.0 && h.y < 8.0 + (5.0 - abs(x - 7.0)) * 0.55) {
        c = h.y < 8.0 ? wallC * 0.92 : roofC;
        float door = step(abs(x - 7.0), 1.1) * step(h.y, 3.2);
        c = mix(c, vec3(0.08, 0.05, 0.04), door);
      }
      // el campanario, con la cúpula chica arriba
      if (x >= 12.0 && x < 15.4) {
        if (h.y < 15.0) {
          float arch = step(abs(x - 13.7), 0.7) * step(11.5, h.y) * step(h.y, 13.6);
          c = mix(wallC * 0.98, vec3(0.05, 0.03, 0.05), arch);
        } else if (abs(x - 13.7) < 1.7 * sqrt(max(0.0, 1.0 - (h.y - 15.0) / 2.2))) {
          c = wallC * 0.85;
        }
      }
      if (c.x >= 0.0) {
        // la luz del alba de un lado; el otro, en sombra
        c *= 0.72 + 0.5 * smoothstep(-24.0, 16.0, x);
        col = mix(c, hazeC, 0.18);
        best = t;
      }
    }
  }
  return col;
}
`;
// El otro lado del final: el estero de 1877 de noche, con luna llena: el agua
// que la refleja, los juncos y el algarrobo recortado contra el cielo.
const PAINT_ESTERO = `
vec3 hazeC = vec3(0.05, 0.08, 0.12);
vec3 haze(vec3 c, float t) {
  return mix(c, hazeC, 1.0 - exp(-t * 0.03));
}
vec3 otherSide(vec3 o, vec3 d) {
  vec3 md = normalize(vec3(0.38, 0.3, -0.87));
  float el = d.y;
  vec3 col = mix(vec3(0.06, 0.1, 0.15), vec3(0.012, 0.025, 0.06), smoothstep(0.0, 0.5, el));
  float m = max(dot(d, md), 0.0);
  col += vec3(0.85, 0.88, 0.95) * (smoothstep(0.9984, 0.9989, m) * 1.1 + pow(m, 40.0) * 0.16);
  col += vec3(0.7) * step(0.996, hh(floor(d.xy / max(0.2, -d.z) * 90.0))) * smoothstep(0.08, 0.3, el);
  float best = 1e5;
  if (d.y < -0.002) {
    float t = o.y / -d.y;
    vec3 h = o + d * t;
    // el agua: oscura, con la estela de la luna que tiembla
    vec3 r = reflect(d, vec3(0.0, 1.0, 0.0));
    float rip = 0.75 + 0.25 * sin(h.x * 3.1 + uT * 1.3) * sin(h.z * 2.3 - uT);
    vec3 w = vec3(0.012, 0.025, 0.04) + vec3(0.7, 0.75, 0.85) * pow(max(dot(r, md), 0.0), 24.0) * rip * 0.6;
    col = haze(w, t);
    best = t;
  }
  if (d.z < -0.001) {
    // los juncos de la orilla (6 m): rayitas oscuras
    float t = (o.z + 6.0) / -d.z;
    vec3 h = o + d * t;
    float rd = step(0.62, fract(h.x * 2.3 + 0.3 * sin(h.x * 7.0))) * step(h.y, 0.9 + 0.5 * hh(vec2(floor(h.x * 2.3), 1.0)));
    if (t < best && h.y > 0.0 && rd > 0.5) { col = haze(vec3(0.02, 0.03, 0.025), t); best = t; }
    // el algarrobo (18 m): el tronco y la copa rala recortados contra el cielo
    t = (o.z + 18.0) / -d.z;
    h = o + d * t;
    float trunk = step(abs(h.x - 1.8 - 0.15 * sin(h.y * 0.9)), 0.42 - 0.05 * h.y) * step(h.y, 3.4);
    vec2 q = vec2((h.x - 1.8) / 5.2, (h.y - 4.5) / 1.7);
    float crown = step(length(q), 0.9 + 0.35 * (fbm(h.xy * 0.9) - 0.5));
    if (t < best && h.y > 0.0 && (trunk + crown) > 0.5) {
      // (el borde, apenas iluminado por la luna)
      col = vec3(0.008, 0.012, 0.016) + vec3(0.05, 0.06, 0.08) * fbm(h.xy * 3.0);
      best = t;
    }
  }
  return col;
}`;
const riftFrag = (paint) => `${RIFT_COMMON}
uniform vec2 uSize;
uniform vec3 uCam;
${paint}
void main() {
  vec2 p = vPos.xy;
  float d = riftD(p);
  float inside = smoothstep(-0.006, 0.006, d);
  // (la cámara, en el espacio del desgarro; de atrás también se ve el otro lado)
  vec3 rd = normalize(vPos - uCam);
  rd.z = -abs(rd.z);
  vec3 world = otherSide(vec3(p, 0.0), rd);
  // cerca del borde, el remolino violeta del desgarro
  float ca = cos(uT * 0.3);
  float sa = sin(uT * 0.3);
  vec2 q = p - vec2(0.0, ${(RIFT_H / 2).toFixed(2)});
  q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  float sw = fbm(q * 2.4 + vec2(0.0, -uT * 0.35) + length(q) * 1.6);
  vec3 swirl = vec3(0.012, 0.0, 0.028) + vec3(0.34, 0.05, 0.62) * sw * sw * 0.8;
  float deep = smoothstep(0.04, 0.5, d) * smoothstep(0.35, 1.0, uOpen);
  // (sin tone mapping: el otro lado se queda abajo del brillo, que no lo vuelva blanco)
  vec3 col = mix(swirl, world * 0.62, deep);
  float spk = step(0.993, hh(floor(p * 70.0) + floor(uT * 6.0)));
  col += vec3(1.0, 0.55, 0.9) * spk * 0.8 * (1.0 - deep);
  // el borde: rosa que se vuelve blanco en el filo
  float rim = 1.0 - smoothstep(0.0, 0.06 + 0.04 * uFlash, abs(d));
  float on = step(0.0005, uOpen + uCrack);
  vec3 rc = mix(vec3(1.0, 0.42, 0.86), vec3(1.0, 0.95, 1.0), rim * rim) * (2.0 + 3.0 * uFlash);
  col = mix(col, rc, rim);
  float a = max(inside * 0.98, rim * 0.92) * on;
  gl_FragColor = vec4(col, a);
}`;
const GLOW_FRAG = `${RIFT_COMMON}
uniform vec2 uSize;
void main() {
  vec2 p = vPos.xy;
  float d = riftD(p);
  float g = exp(-max(0.0, -d) * 4.5) * (1.0 - step(0.0, d));
  float fl = 0.8 + 0.2 * sin(uT * 7.0 + p.y * 3.0);
  vec2 uv = vec2(p.x / uSize.x + 0.5, p.y / uSize.y);
  float edge = smoothstep(0.0, 0.22, uv.x) * smoothstep(1.0, 0.78, uv.x) * smoothstep(1.0, 0.82, uv.y);
  // (violeta en el borde, con algo del oro del alba que sale por la raja)
  vec3 c = mix(vec3(0.55, 0.12, 0.85), vec3(0.9, 0.55, 0.35), 0.3 * uOpen) * g * fl * (uOpen * 0.75 + uFlash * 1.5) * edge;
  gl_FragColor = vec4(c, 1.0);
}`;
const FLOOR_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FLOOR_FRAG = `
uniform float uOpen;
uniform float uFlash;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(vec2(p.x, p.y * 1.5));
  float g = max(0.0, 1.0 - r);
  // (la luz del alba que sale por el desgarro, violeta en el borde)
  vec3 c = mix(vec3(0.5, 0.1, 0.8), vec3(1.0, 0.7, 0.42), g) * g * g * (uOpen * 0.5 + uFlash * 0.8);
  gl_FragColor = vec4(c, 1.0);
}`;

// Un desgarro suelto (el del final, ui/EclipseEnding.js): kind 'estero' (el de
// 1877, de noche), 'monumento', 'monumentoNoche' o 'sanlorenzo' (ui/eclipseCruce). root mira a +z; U: uOpen, uCrack, uFlash (los
// maneja quien lo usa); tick(dt, cam): el reloj y la cámara en su espacio.
export function makeRift(kind = 'estero') {
  const root = new THREE.Group();
  root.visible = false;
  const U = { uT: { value: 0 }, uOpen: { value: 0 }, uCrack: { value: 0 }, uFlash: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const mats = [];
  const mk = (w, h, frag, o) => {
    const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, uSize: { value: new THREE.Vector2(w, h) } }, vertexShader: RIFT_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...o });
    mats.push(m);
    return new THREE.Mesh(geo, m);
  };
  const glow = mk(4.6, RIFT_H + 0.8, GLOW_FRAG, { blending: THREE.AdditiveBlending });
  glow.position.z = -0.02;
  glow.renderOrder = 1;
  const core = mk(2 * RIFT_W + 0.7, RIFT_H, riftFrag(kind === 'sanlorenzo' ? PAINT_SANLORENZO : kind === 'monumentoNoche' ? PAINT_MONUMENTO_NOCHE : kind === 'monumento' ? PAINT_MONUMENTO : PAINT_ESTERO), {});
  core.renderOrder = 2;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.2).rotateX(-Math.PI / 2).translate(0, 0.012, 0.8), new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  mats.push(fl.material);
  root.add(glow, core, fl);
  return {
    root,
    U,
    tick(dt, cam) {
      U.uT.value += dt;
      if (!root.visible) return;
      root.updateWorldMatrix(true, false);
      root.worldToLocal(U.uCam.value.copy(cam.position));
    },
    dispose() {
      root.removeFromParent();
      for (const m of [glow, core, fl]) m.geometry.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export default class EclipseSable {
  constructor(ee) {
    this.ee = ee;
    const g = (this.g = ee.g);
    this.on = false;
    this.done = false;
    this.root = new THREE.Group();
    this.root.name = 'eclipseSable';
    g.scene.add(this.root);
    loadClips();
    this.place();
    this.buildRift();
    this.buildSable();
    this.buildCrew();
    this.t = 0;
  }

  // Dónde va todo, con el mapa de ahora (las islas se reacomodan: nada de
  // coordenadas fijas). La Llama: la del paso (Ingredientes ANCHORS.llama, o
  // EE.llama si el mapa la trae); si ahí no hay piso, el medio del Propileo.
  // El desgarro: al costado de la Llama, mirando a lo que hay delante de ella
  // (hacia el medio de la isla, de donde viene el que la prende), en el primer
  // lugar que tiene piso parejo y libre para los cuatro y para el Gil.
  place() {
    const w = this.g.world;
    const fy = (x, z) => w.floorAt(x, z);
    const ll = EE.llama || ANCHORS.llama;
    const L = (this.L = new THREE.Vector3(ll?.x ?? ll?.[0] ?? 0, 0, ll?.z ?? ll?.[1] ?? 0));
    L.y = fy(L.x, L.z);
    const isla = ISLANDS.monumento;
    if (!(L.y > VOID_Y + 1) && isla) {
      const k = isla.zones.find((z) => /propileo/i.test(ZONES[z]?.name || '')) || isla.zones[0];
      const r = ZONES[k].rects[0];
      L.set((r[0] + r[2]) / 2, 0, (r[1] + r[3]) / 2);
      L.y = fy(L.x, L.z);
    }
    const c = isla?.center || [L.x - 10, L.z];
    const f = new THREE.Vector3(c[0] - L.x, 0, c[1] - L.z);
    if (f.lengthSq() < 0.01) f.set(-1, 0, 0);
    f.normalize();
    this.f = f;
    const probe = new THREE.Vector3();
    // (libre: el piso a la altura de la Llama y sin cajas sólidas cerca)
    const free = (x, z) => {
      const y = fy(x, z);
      if (!(Math.abs(y - L.y) < 0.25)) return false;
      probe.set(x, y, z);
      w.collide(probe, 0.4, y + 0.1, y + 1.8);
      return Math.hypot(probe.x - x, probe.z - z) < 1e-3;
    };
    const ok = (R, n) => {
      const tg = tmpW.set(-n.z, 0, n.x);
      const pts = [[0, 0], [-1.7, 0], [1.7, 0], [0, 2.1], [0, 1.1], [0, -0.8], [-1.1, -0.6], [1.1, -0.6]];
      for (const S of Object.values(SPOTS)) pts.push(S.to);
      return pts.every(([a, b]) => free(R.x + tg.x * a + n.x * b, R.z + tg.z * a + n.z * b));
    };
    const front = L.clone().addScaledVector(f, 2.4);
    // (al costado y un poco detrás de la Llama: se ve de frente, sin la llama
    // en el medio, y no se le viene encima al que la prendió)
    for (const dist of [3.8, 4.4, 3.4, 5.0]) {
      for (const ang of [1.9, -1.9, 2.15, -2.15, 1.6, -1.6, 1.3, -1.3, 2.4, -2.4]) {
        const R = L.clone().addScaledVector(f.clone().applyAxisAngle(UP, ang), dist);
        R.y = fy(R.x, R.z);
        const n = front.clone().sub(R).setY(0).normalize();
        if (!ok(R, n)) continue;
        this.R = R;
        this.n = n;
        this.tg = new THREE.Vector3(-n.z, 0, n.x);
        return;
      }
    }
    // (sin lugar libre: al costado igual)
    this.R = L.clone().addScaledVector(f.clone().applyAxisAngle(UP, 1.9), 3.8);
    this.R.y = L.y;
    this.n = front.clone().sub(this.R).setY(0).normalize();
    this.tg = new THREE.Vector3(-this.n.z, 0, this.n.x);
  }

  // Un punto del lugar: a lo ancho (a) y hacia afuera del desgarro (b).
  at(a, b, out = new THREE.Vector3()) {
    out.copy(this.R).addScaledVector(this.tg, a).addScaledVector(this.n, b);
    out.y = this.g.world.floorAt(out.x, out.z);
    return out;
  }

  // ---------------- armado (con el mapa, escondido) ----------------
  buildRift() {
    const root = (this.rift = new THREE.Group());
    root.position.copy(this.R).add(tmpV.set(0, 0.01, 0));
    root.rotation.y = Math.atan2(this.n.x, this.n.z);
    root.visible = false;
    const U = (this.U = { uT: { value: 0 }, uOpen: { value: 0 }, uCrack: { value: 0 }, uFlash: { value: 0 }, uCam: { value: new THREE.Vector3() } });
    const mk = (w, h, frag, o) => {
      const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
      const m = new THREE.ShaderMaterial({ uniforms: { ...U, uSize: { value: new THREE.Vector2(w, h) } }, vertexShader: RIFT_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...o });
      return new THREE.Mesh(geo, m);
    };
    // (el halo atrás, el corazón adelante: el corazón tapa lo que pasa detrás)
    this.glow = mk(4.6, RIFT_H + 0.8, GLOW_FRAG, { blending: THREE.AdditiveBlending });
    this.glow.position.z = -0.02;
    this.core = mk(2 * RIFT_W + 0.7, RIFT_H, riftFrag(PAINT_MONUMENTO), {});
    this.core.renderOrder = 2;
    this.glow.renderOrder = 1;
    const fg = new THREE.PlaneGeometry(4.4, 3.2).rotateX(-Math.PI / 2).translate(0, 0.012, 0.8);
    this.floorGlow = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    root.add(this.glow, this.core, this.floorGlow);
    this.root.add(root);
  }

  // El Sable (weapons/sableModels, el forjado), sobre las palmas del Valiente.
  buildSable() {
    const s = (this.sable = new THREE.Group());
    s.matrixAutoUpdate = false;
    s.add(sableModel(0));
    s.visible = false;
    this.S = new THREE.Matrix4();
    this.root.add(s);
  }

  // Los cuatro de siempre (los del Monumento: ui/cineCrew), escondidos.
  buildCrew() {
    const C = (this.C = new CineActors(this.g, { base: 520, parent: this.root }));
    const base = C.clipOf.bind(C);
    C.clipOf = (name) => CLIPS?.[name] || base(name);
    for (const r of C.list) {
      r.dead = true;
      r.mate = false;
      const S = SPOTS[r.persona];
      this.at(S.from[0], S.from[1], r.pos);
      r.yaw = Math.atan2(-this.n.x, -this.n.z);
    }
    C.show(false);
  }

  // ---------------- la escena ----------------
  // cb(): el Sable queda para agarrar. Devuelve false si todavía no puede
  // (sin los clips o el cuerpo del gaucho): el paso muestra el Sable en la Llama.
  play(cb) {
    const g = this.g;
    if (this.on || this.done || globalThis.__mduNoEclipseSable === true) return false;
    if (!CLIPS || !this.C.list.every((r) => r.a?.gs?.on)) return false;
    this.cb = cb;
    this.on = true;
    this.t = 0;
    this.wall = performance.now();
    this.events = [];
    this.backs = [];
    this.state = 'hands';
    this.takeT = null;
    this.flashK = 0;
    this.llamaK = 0;
    const C = this.C;
    const b = C.by;
    const ev = (t, fn) => this.events.push({ t, fn });
    const pd = (k) => PERSONA_T[k]?.delay || 0;
    for (const r of C.list) C.act(r, 'idle', { loop: true });
    // 1. la Llama crece
    ev(0, () => {
      this.llamaK = 1;
      g.fx.flash(tmpV.copy(this.L).setY(this.L.y + 1.8), 0xffb060, 26, 0.7, 10);
      g.fx.sparkle(tmpV.copy(this.L).setY(this.L.y + 1.6), [1, 0.7, 0.35], 24, 0.7);
      this.sfx('llama');
    });
    // 2. se raja el aire y se abre
    ev(0.9, () => {
      this.rift.visible = true;
      this.sfx('crack');
    });
    ev(1.5, () => {
      this.opening = { t: 1.5, d: 1.7 };
      this.flash(1, 0.9);
      g.fx.flash(tmpV.copy(this.R).setY(this.R.y + 1.6), 0xd070ff, 30, 0.6, 12);
      g.fx.sparkle(tmpV.copy(this.R).setY(this.R.y + 1.5), [0.85, 0.45, 1], 30, 1);
      this.sfx('tear');
    });
    // (del otro lado, el clarín de los Granaderos)
    ev(2.6, () => g.audio.bugle?.(tmpV.copy(this.R).addScaledVector(this.n, -6).setY(this.R.y + 2)));
    // 3. salen los cuatro, cada uno a su tiempo
    const out = (r, then, thenO = {}) => {
      const S = SPOTS[r.persona];
      r.dead = false;
      C.walkPath(r, [this.at(S.to[0], S.to[1])], S.v, then, thenO);
    };
    ev(2.3, () => {
      C.show(true);
      out(b.valiente, 'svKneel', { loop: false, fade: 0.4 });
      C.act(b.valiente, 'svWalk', { loop: true, fade: 0.01, rate: 0 });
    });
    ev(2.3 + 0.35 + pd('miedoso'), () => out(b.miedoso, 'cower', { fade: 0.4 }));
    ev(2.3 + 0.2 + pd('canchero'), () => out(b.canchero, 'cool', { fade: 0.5 }));
    ev(2.3 + 0.3 + pd('viejo'), () => out(b.viejo, 'chestHand', { fade: 0.5 }));
    ev(5.6, () => C.act(b.miedoso, 'lookBack', { loop: true, fade: 0.5 }));
    // 4. presenta el Sable (cuando termina de arrodillarse, en vuelta)
    this.presentAt = null;
    this.events.sort((x, y) => x.t - y.t);
    this.ee.steps?.sable?.live?.push(this);
    // (todo lo de la escena, compilado: ya estaba armado desde la carga)
    warmScene(g);
    return true;
  }

  // El Gil se lo llevó (el 'take' del paso, en todas las compus).
  taken() {
    const g = this.g;
    const C = this.C;
    const b = C.by;
    this.takeT = this.t;
    // el Sable se va con el Gil: hacia la cámara (si sos vos) o a la mano de su muñeco
    this.state = 'fly';
    this.flyFrom = this.S.clone();
    this.flyT = 0;
    const p = this.sable.matrix.elements;
    g.fx.sparkle(tmpV.set(p[12], p[13], p[14]), [0.9, 0.8, 1], 26, 0.5);
    this.sfx('take');
    if (g.say) g.say('gil', LINE, 'gil', { local: true });
    const T = this.t;
    const ev = (dt, fn) => this.events.push({ t: T + dt, fn });
    ev(0.35, () => C.act(b.valiente, 'sableRise', { fade: 0.2 }));
    ev(2.4, () => C.act(b.valiente, 'fistUp', { loop: true, fade: 0.5 }));
    ev(0.5 + PERSONA_T.miedoso.delay, () => C.act(b.miedoso, 'wave', { fade: 0.5 }));
    ev(0.5 + PERSONA_T.canchero.delay, () => C.act(b.canchero, 'cancheroOk', { fade: 0.4 }));
    ev(0.5 + PERSONA_T.viejo.delay, () => C.act(b.viejo, 'brimBow', { fade: 0.5 }));
    // 5. vuelven al desgarro: el Miedoso primero, el Valiente último
    ev(3.3, () => this.goBack(b.miedoso, 'walk'));
    ev(3.6, () => this.goBack(b.viejo, 'back'));
    ev(3.9, () => this.goBack(b.canchero, 'back'));
    ev(4.3, () => this.goBack(b.valiente, 'walk'));
    ev(6.6, () => (this.closing = this.t));
    this.events.sort((x, y) => x.t - y.t);
  }

  // Vuelve a su lugar de salida (atrás del desgarro): de frente o de espaldas.
  goBack(r, how) {
    const S = SPOTS[r.persona];
    const to = this.at(S.from[0], S.from[1] - 0.3);
    if (how === 'walk') {
      // (primero se da vuelta despacio, pisando en el lugar; después camina:
      // dándose vuelta caminando giraba más de 30° por cuadro)
      const turn = r.persona === 'miedoso' ? 0.7 : 0.95;
      this.C.turnTo(r, to, turn);
      this.C.act(r, 'walk', { loop: true, fade: 0.35, rate: 0.45 });
      this.events.push({ t: this.t + turn, fn: () => this.C.walkPath(r, [to], S.v + 0.15, 'idle', { loop: true }) });
      this.events.sort((x, y) => x.t - y.t);
      return;
    }
    this.backs.push({ r, from: r.pos.clone(), to, t: 0, dur: r.pos.distanceTo(to) / 0.55 });
    this.C.act(r, 'back', { loop: true, fade: 0.35, rate: 0 });
  }

  // ---------------- cada cuadro (QStep.live del paso del Sable) ----------------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    // el reloj de verdad (como ui/castleCine): en línea, una compu trabada no se atrasa
    const now = performance.now();
    const w = (now - this.wall) / 1000;
    this.wall = now;
    const step = w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    this.t += step;
    const sdt = g.net ? Math.min(step, 1) : dt;
    const C = this.C;
    const b = C.by;
    while (this.events.length && this.events[0].t <= this.t) this.events.shift().fn();
    // la entrega: cuando el Valiente ya presenta, el Sable queda para agarrar
    const pick = this.ee.steps?.sable?.pick;
    if (this.presentAt == null && b.valiente.cc?.name === 'svKneel' && b.valiente.cc.lt >= 1.9) {
      this.presentAt = this.t;
      C.act(b.valiente, 'sablePresent', { loop: true, fade: 0.25 });
    }
    if (this.presentAt != null && !this.offered && this.t - this.presentAt > 0.3) {
      this.offered = true;
      const p = this.sable.matrix.elements;
      if (pick?.it) {
        this.pick0 = pick.it.pos.clone();
        pick.it.pos.set(p[12], p[13], p[14]);
      }
      const cb = this.cb;
      this.cb = null;
      cb?.();
    }
    if (pick?.obj && this.offered && this.state !== 'gone') pick.obj.visible = false;
    if (this.offered && this.takeT == null && (pick?.taken || this.ee.steps?.sable?.st?.done)) this.taken();
    // la Llama: crece y se asienta
    const fire = g.world.eclipseArt?.llamaFire;
    if (fire) {
      this.llamaV = (this.llamaV || 0) + ((this.closing ? 0 : this.llamaK * (this.t < 3 ? 1 : 0.35)) - (this.llamaV || 0)) * Math.min(1, sdt * 2.5);
      fire.scale.set(1 + this.llamaV * 0.35, 1 + this.llamaV * 0.9, 1 + this.llamaV * 0.35);
    }
    // los que vuelven de espaldas
    for (const Bk of this.backs) {
      Bk.t += sdt;
      const k = Math.min(1, Bk.t / Bk.dur);
      const prev = tmpW.copy(Bk.r.pos);
      Bk.r.pos.lerpVectors(Bk.from, Bk.to, smooth(k));
      Bk.r.pos.y = C.floor(Bk.r.pos.x, Bk.r.pos.z);
      const c = C.clipOf('back');
      if (c?.speed && Bk.r.cc?.name === 'back' && sdt > 0) Bk.r.cc.rate = Math.min(2, prev.distanceTo(Bk.r.pos) / sdt / c.speed);
      if (k >= 1) Bk.done = true;
    }
    if (this.backs.some((x) => x.done)) this.backs = this.backs.filter((x) => !x.done);
    // del otro lado del desgarro ya no están
    if (this.takeT != null) {
      for (const r of C.list) {
        if (r.dead) continue;
        tmpV.subVectors(r.pos, this.R);
        if (tmpV.dot(this.n) < -0.3 && this.t - this.takeT > 3) r.dead = true;
      }
    }
    C.tick(sdt);
    this.updateRift(sdt);
    this.updateSable(sdt);
    this.fill();
    if (this.closing != null && this.t - this.closing > 1.3) this.end();
  }

  updateRift(dt) {
    const U = this.U;
    const t = this.t;
    U.uT.value += dt;
    if (this.rift.visible) U.uCrack.value = Math.min(1, U.uCrack.value + dt / 0.5);
    if (this.opening && this.closing == null) U.uOpen.value = 1 - (1 - smooth(clamp01((t - this.opening.t) / this.opening.d))) ** 2;
    if (this.closing != null) {
      const k = (t - this.closing) / 0.9;
      U.uOpen.value = Math.max(0, 1 - smooth(Math.min(1, k)));
      U.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1.05 && this.rift.visible) {
        this.rift.visible = false;
        const p = tmpV.copy(this.R).setY(this.R.y + 1.5);
        this.g.fx.flash(p, 0xff9ce8, 34, 0.45, 12);
        this.g.fx.sparkle(p, [1, 0.6, 0.95], 24, 0.6);
        this.sfx('close');
      }
    }
    this.flashK = Math.max(0, this.flashK - dt / (this.flashD || 0.6));
    U.uFlash.value = this.flashK;
    // la cámara en el espacio del desgarro (lo de adentro se corre con ella)
    if (this.rift.visible) {
      this.rift.updateWorldMatrix(true, false);
      this.rift.worldToLocal(U.uCam.value.copy(this.g.camera.position));
    }
  }

  // El Sable: sobre las palmas del Valiente; al recibirlo, se va con el Gil.
  updateSable(dt) {
    const v = this.C.by.valiente;
    const s = this.sable;
    if (this.state === 'hands') {
      s.visible = !v.dead && !!v.a?.gs?.on;
      if (!s.visible) return;
      hand(v.a, 'Left', HL);
      hand(v.a, 'Right', HR);
      A_.copy(HL.c).addScaledVector(HL.n, SUP);
      B_.copy(HR.c).addScaledVector(HR.n, SUP);
      sableTwo(A_, S_VL, B_, S_VR, this.S);
    } else if (this.state === 'fly') {
      // (hacia la cámara si el Gil sos vos; si no, a la mano de su muñeco)
      this.flyT += dt;
      const k = smooth(clamp01(this.flyT / 0.45));
      const g = this.g;
      const ee = this.ee;
      const to = tmpW;
      const av = ee.gil != null && g.net?.avatars?.list.get(ee.gil);
      if (!ee.isGil() && av?.hand) av.hand.getWorldPosition(to);
      else to.set(0, -0.35, -0.6).applyQuaternion(g.camera.quaternion).add(g.camera.position);
      const p = this.flyFrom.elements;
      tmpV.set(p[12], p[13], p[14]).lerp(to, k * 0.85);
      this.S.copy(this.flyFrom).setPosition(tmpV);
      if (this.flyT >= 0.45) {
        this.state = 'gone';
        g.fx.sparkle(tmpV, [1, 0.85, 0.5], 18, 0.35);
      }
    }
    if (this.state === 'gone') s.visible = false;
    s.matrix.copy(this.S);
    s.matrixWorldNeedsUpdate = true;
  }

  // La luz del alba que sale del desgarro, en las caras (gauchoSkin uFill: sin luces).
  fill() {
    const open = this.U.uOpen.value;
    const fl = this.flashK;
    for (const r of this.C.list) {
      const u = r.a?.M?.gaucho?.userData.life?.uFill;
      if (!u) continue;
      tmpV.subVectors(r.pos, this.R);
      const k = (1 - smooth(clamp01((tmpV.length() - 0.6) / 4))) * open;
      // (más suave: las palmas del Valiente brillaban de más)
      u.value.setRGB(0.08 * k + 0.3 * fl, 0.06 * k + 0.1 * fl, 0.05 * k + 0.45 * fl);
    }
  }

  flash(k, d = 0.6) {
    this.flashK = Math.max(this.flashK || 0, k);
    this.flashD = d;
  }

  sfx(kind) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const p = kind === 'llama' ? tmpS.copy(this.L).setY(this.L.y + 1.6) : tmpS.copy(this.R).setY(this.R.y + 1.4);
    const o = A.out({ pos: p.clone(), gain: 1, reverb: 0.7, ref: 7 });
    const t = A.now;
    if (kind === 'llama') {
      A.noise(o, { t, dur: 1.4, type: 'lowpass', freq: 380, freqEnd: 1200, gain: 0.5, attack: 0.06, brown: true });
      A.tone(o, { t, dur: 1.6, type: 'sine', freq: 70, freqEnd: 110, gain: 0.2, attack: 0.1 });
    } else if (kind === 'crack') {
      for (let i = 0; i < 7; i++) A.noise(o, { t: t + i * 0.07 + Math.random() * 0.03, dur: 0.06, type: 'highpass', freq: 2600 + i * 300, q: 1.2, gain: 0.25, attack: 0.002 });
    } else if (kind === 'tear') {
      A.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 320, freqEnd: 2600, q: 1.6, gain: 0.55, attack: 0.04 });
      A.tone(o, { t, dur: 1.8, type: 'sawtooth', freq: 62, freqEnd: 36, gain: 0.22, attack: 0.05 });
      A.tone(o, { t: t + 0.1, dur: 2.4, type: 'sine', freq: 880, freqEnd: 1320, gain: 0.05, attack: 0.3 });
    } else if (kind === 'take') {
      A.bell?.(o, t, 79, { gain: 0.1, dur: 3 });
      A.tone(o, { t, dur: 1.2, type: 'sine', freq: 1320, freqEnd: 1760, gain: 0.05, attack: 0.05 });
    } else if (kind === 'close') {
      A.noise(o, { t, dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 120, gain: 0.6, attack: 0.01 });
      A.tone(o, { t: t + 0.55, dur: 0.9, type: 'sine', freq: 95, freqEnd: 30, gain: 0.55, attack: 0.004 });
      A.bell?.(o, t + 0.6, 74, { gain: 0.06, dur: 3 });
    }
  }

  // Terminó: todo escondido otra vez (queda armado: no se tira a mitad de partida).
  end() {
    this.on = false;
    this.done = true;
    const live = this.ee.steps?.sable?.live;
    const i = live ? live.indexOf(this) : -1;
    if (i >= 0) live.splice(i, 1);
    this.rift.visible = false;
    this.sable.visible = false;
    this.C.show(false);
    for (const r of this.C.list) {
      r.dead = true;
      r.a?.M?.gaucho?.userData.life?.uFill?.value.setRGB(0, 0, 0);
    }
    const fire = this.g.world.eclipseArt?.llamaFire;
    if (fire) fire.scale.set(1, 1, 1);
    const pick = this.ee.steps?.sable?.pick;
    if (pick?.it && this.pick0) pick.it.pos.copy(this.pick0);
  }

  dispose() {
    this.on = false;
    const live = this.ee.steps?.sable?.live;
    const i = live ? live.indexOf(this) : -1;
    if (i >= 0) live.splice(i, 1);
    this.C?.dispose();
    for (const m of [this.core, this.glow, this.floorGlow]) {
      m?.geometry.dispose();
      m?.material.dispose();
    }
    this.root.removeFromParent();
  }
}
