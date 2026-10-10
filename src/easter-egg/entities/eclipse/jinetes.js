import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../../lib/assets';
import { warmObject } from '../../fx/ghostMat';
import { jineteDmg } from './catalizador';
import { eclSfx } from '../../fx/eclipseSfx';
// (2026-10-08, ITERACION-8: los sonidos que dejó el usuario para los jinetes
// del caos —fx/eclipseSfx—: el ataque (el alarido antes de la picada), dos
// tomas, la 1 más baja y con eco porque venía "muy seca y con mucho volumen";
// la risa mientras rondan, de a ratos y de a uno; la risa demoníaca alguna vez,
// al rondar o al salir de la grieta. Sin grabación, los sintetizados.
// globalThis.__mduOldJineteSfx: los sintetizados, como antes)
const REC = globalThis.__mduOldJineteSfx !== true;
const REC_IDS = ['jinete-ataque-1', 'jinete-ataque-2', 'jinete-risa', 'risa-demoniaca', 'jinete-golpe'];
// (2026-10-09, el usuario: "el de cuando el jinete te ataca y te pega: sacá el
// que está ahora y poné este" —dragon-studio "ghost horror sound"—: el golpe de
// la embestida (antes sintetizado). Es la misma toma que el ataque 2: el
// alarido de antes de la picada queda con la 1, así no suena dos veces.
// globalThis.__mduOldJineteGolpe: el sintetizado y las dos tomas en el alarido)
const GOLPE = REC && globalThis.__mduOldJineteGolpe !== true;

// Los jinetes del apocalipsis del Desgarro Cósmico (entities/eclipse/Desgarro10.js):
// ánimas encapuchadas, estilo dementor, sobre caballos de hueso. Vuelan en
// círculos alto sobre la isla, de a uno se paran de manos en el aire (el
// alarido) y se tiran en picada a embestir a un jugador; si en el camino está
// la cúpula de los caballeros, le pegan a ella y rebotan aturdidos (ahí son
// blanco fácil). Se bajan a tiros, con la guadaña o con lo que sea.
//
// Baratos: un pool de POOL en una sola malla instanciada (un dibujo para
// todos), con un sombreador de ánima propio (borde que brilla, franjas, la
// capa que flamea, el destello del golpe y el deshacerse; nada de isnan).
// Mientras no está el modelo de Meshy (public/assets/sotano/modelos/jinete/
// modelo.glb, lo hornea otro agente) se ve uno de piezas; cuando aparece, se
// usa ese (la textura pasa al mismo programa: no se compila nada).
//
// Para las armas son "zombies" más: el evento los pone en g.yasy (en Eclipse
// no hay Yasy), así Zombies.raycast / inRadius / damage / annihilate y
// Session.findZombie ya los ven, sin tocar esos archivos. No cuentan para la
// ronda. En línea los mueve el anfitrión y reparte dónde están y hacia dónde
// van ('pee' k 'd10' a 'l', 10 por segundo); cada compu se cuida su jugador
// de las embestidas.

export const JIN_ID = 0xfd00;
export const POOL = 10;
const MODEL_URL = '/assets/sotano/modelos/jinete/modelo.glb';
// el largo del modelo (del hocico a la punta de la capa), en metros
const MODEL_LEN = 3.4;
// los estados (el número viaja por la red)
export const S = { off: 0, in: 1, circle: 2, wind: 3, dive: 4, rise: 5, stun: 6, die: 7, out: 8 };
const FADE_IN = 1.3;
const CIRCLE_V = 11;
const WIND_T = 0.6;
const DIVE_V0 = 11;
const DIVE_V = 25;
const DIVE_ACC = 32;
// cuánto dobla buscando al jugador (rad/s) y desde dónde ya no corrige (m): se lo puede esquivar
const TURN = 2.3;
const COMMIT = 6.5;
const RISE_T = 1.5;
const STUN_T = 1.1;
// el respiro entre una picada y la siguiente (s; con más jugadores, menos)
const DIVE_GAP = 2.4;
const DIE_T = 1.0;
const OUT_T = 2.2;
// la embestida: hasta dónde pega, cuánto saca y cuánto empuja
const RAM_R = 1.6;
const RAM_DMG = 40;
const RAM_PUSH = 8.5;
// las esferas para los tiros, en el cuerpo (x, y, z, radio, zona): el caballo,
// el jinete, la capucha y la calavera del caballo
const HS = [
  [0, 0.02, 0.12, 0.62, 'torso'],
  [0, 0.82, -0.04, 0.44, 'torso'],
  [0, 1.2, 0.12, 0.25, 'head'],
  [0, 0.55, 1.22, 0.26, 'head'],
];

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const now = () => performance.now() / 1000;
const rnd = () => Math.random() - 0.5;
const angDiff = (a, b) => {
  let d = a - b;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return d;
};

// ---------------- el sombreador de ánima ----------------
// (instanceColor: x = cuánto se ve, y = el destello del golpe, z = cuánto se deshizo)
const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vN, vC, vW, vFx;
varying vec2 vUv;
varying float vNz;
void main() {
  vec3 p = position;
  // las tiras de la capa (atrás y arriba del caballo) flamean, más cuanto más atrás
  float back = smoothstep(-0.25, -1.9, p.z) * smoothstep(0.1, 0.55, p.y);
  float ph = uTime * 8.0 + p.z * 2.6 + p.x * 3.1 + float(gl_InstanceID) * 1.7;
  p.y += sin(ph) * 0.14 * back;
  p.x += cos(ph * 0.83) * 0.07 * back;
  vec4 lp = vec4(p, 1.0);
  vec3 n = normal;
  vec3 fx = vec3(1.0, 0.0, 0.0);
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  fx = instanceColor;
#endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz;
  vN = mat3(modelMatrix) * n;
  vec3 c = vec3(1.0);
#ifdef USE_COLOR
  c = color;
#endif
  vC = c;
  vUv = uv;
  vFx = fx;
  // el ruido del deshacerse: por celdita, fijo en el cuerpo
  vNz = fract(sin(dot(floor(position * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
// (divisiones con piso; sin isnan ni pow: en la placa del usuario un NaN deja la pantalla negra)
const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D map;
uniform vec3 uRim, uSun;
varying vec3 vN, vC, vW, vFx;
varying vec2 vUv;
varying float vNz;
void main() {
  if (vNz < vFx.z) discard;
  vec3 nw = vN / max(length(vN), 1e-4);
  vec3 vw = cameraPosition - vW;
  vw /= max(length(vw), 1e-4);
  float fr = 1.0 - abs(dot(nw, vw));
  fr *= fr;
  vec3 base = vC * texture2D(map, vUv).rgb;
  // los ojos: lo que pasa de 1 en el color (el de piezas) o el magenta de la textura (el de Meshy)
  float hot = clamp(max(base.r, max(base.g, base.b)) - 1.0, 0.0, 3.0);
  float mag = smoothstep(0.25, 0.5, min(base.r, base.b) - base.g) * step(base.r + base.b, 3.0);
  // la luz del eclipse, suave (un ánima: sin las luces de la escena)
  float l = 0.45 + 0.55 * max(dot(nw, uSun), 0.0);
  float band = 0.8 + 0.2 * sin(vW.y * 5.0 - uTime * 3.5);
  vec3 col = min(base, vec3(1.0)) * l * band + uRim * (fr * 1.4);
  col += vec3(1.0, 0.35, 1.0) * (hot * 1.2 + mag * 1.4);
  col += vec3(0.9, 0.6, 1.0) * vFx.y * 0.9;
  // el borde de lo que se deshace
  col += vec3(1.0, 0.4, 1.0) * smoothstep(vFx.z + 0.12, vFx.z, vNz) * step(0.001, vFx.z) * 2.0;
  float a = clamp(0.62 + fr * 0.4 + hot + mag, 0.0, 1.0) * vFx.x;
  gl_FragColor = vec4(max(col, vec3(0.0)), a);
}`;

let WHITE = null;
function white() {
  if (!WHITE) {
    WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    WHITE.needsUpdate = true;
  }
  return WHITE;
}

function jineteMat(time) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      map: { value: white() },
      uRim: { value: new THREE.Color(0.55, 0.22, 1.0) },
      uSun: { value: new THREE.Vector3(0.405, 0.588, -0.7).normalize() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  // (una sola pasada: las tiras de la capa se ven de los dos lados)
  m.forceSinglePass = true;
  return m;
}

// ---------------- el de piezas (hasta que esté el modelo) ----------------
// Mirando a +z, el medio del cuerpo del caballo en el cero; en el salto del
// concepto (conceptos/jinete.png): las manos del caballo adelante, las patas
// estiradas atrás, el jinete inclinado con un brazo que agarra y la capa en tiras.
function paint(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function seg(a, b, r0, r1, c, rs = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, rs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, c);
}
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z));
// Una tira de capa: de a hasta b con un bulto al medio (sube `lift`), de ancho
// w0 a w1, color c0 a c1 a lo largo. Plana (se ve de los dos lados).
function ribbon(a, b, w0, w1, lift, c0, c1, twist = 0, segs = 8) {
  const pos = [];
  const col = [];
  const P = new THREE.Vector3();
  const side = new THREE.Vector3();
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  for (let k = 0; k <= segs; k++) {
    const u = k / segs;
    P.lerpVectors(a, b, u);
    P.y += Math.sin(u * Math.PI) * lift;
    side.set(1, 0, 0).applyAxisAngle(dir, twist * u);
    const w = (w0 + (w1 - w0) * u) * 0.5;
    pos.push(P.x - side.x * w, P.y - side.y * w, P.z - side.z * w, P.x + side.x * w, P.y + side.y * w, P.z + side.z * w);
    for (let s = 0; s < 2; s++) col.push(c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u);
  }
  const idx = [];
  for (let k = 0; k < segs; k++) {
    const i = k * 2;
    idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  // la punta deshilachada: un piquito más
  const last = segs * 2;
  const tip = new THREE.Vector3().copy(b).addScaledVector(dir, 0.18);
  pos.push(tip.x, tip.y - 0.04, tip.z);
  col.push(...c1);
  idx.push(last, last + 1, last + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}

let PROC = null;
export function proceduralGeo() {
  if (PROC) return PROC;
  // colores (multiplican el sombreador: violeta oscuro de la túnica, hueso lila, ojos que pasan de 1)
  const ROBE = [0.17, 0.06, 0.34];
  const ROBE2 = [0.1, 0.03, 0.2];
  const HOLE = [0, 0, 0];
  const BONE = [0.66, 0.6, 0.78];
  const EYE = [3.2, 0.5, 3.4];
  const CAPE0 = [0.15, 0.05, 0.3];
  const CAPE1 = [0.55, 0.12, 0.7];
  const P = [];
  // ---- el caballo: el cuerpo tapado por la túnica, las costillas abajo, la columna y el cogote de hueso
  P.push(at(paint(new THREE.CapsuleGeometry(0.29, 0.8, 4, 10).rotateX(Math.PI / 2), ROBE2), 0, 0.05, 0.05));
  for (let k = 0; k < 5; k++) {
    const r = 0.31 - Math.abs(k - 2) * 0.02;
    P.push(at(paint(new THREE.TorusGeometry(r, 0.022, 4, 10, Math.PI), BONE), 0, 0.04, 0.38 - k * 0.15, 0, 0, Math.PI));
  }
  P.push(seg(V(0, -0.27, 0.42), V(0, -0.25, -0.2), 0.03, 0.03, BONE, 5));
  P.push(at(paint(new THREE.BoxGeometry(0.42, 0.14, 0.3), BONE), 0, 0.12, -0.46));
  // el cogote: vértebras de la cruz a la nuca
  for (let k = 0; k < 6; k++) {
    const u = k / 5;
    P.push(at(paint(new THREE.BoxGeometry(0.1, 0.09, 0.09), BONE), 0, 0.22 + u * 0.36 + Math.sin(u * Math.PI) * 0.05, 0.52 + u * 0.48, -0.6 - u * 0.4));
  }
  // la calavera: el cráneo, el hocico largo, la quijada, las cuencas y los ojos encendidos
  const skull = [
    at(paint(new THREE.BoxGeometry(0.22, 0.22, 0.3), BONE), 0, 0.62, 1.1),
    at(paint(new THREE.BoxGeometry(0.15, 0.13, 0.36), BONE), 0, 0.53, 1.37, 0.35),
    at(paint(new THREE.BoxGeometry(0.11, 0.05, 0.3), BONE), 0, 0.44, 1.3, 0.25),
    at(paint(new THREE.ConeGeometry(0.04, 0.14, 4), BONE), 0.08, 0.77, 1.02, -0.3),
    at(paint(new THREE.ConeGeometry(0.04, 0.14, 4), BONE), -0.08, 0.77, 1.02, -0.3),
  ];
  for (const sx of [-1, 1]) {
    skull.push(at(paint(new THREE.SphereGeometry(0.055, 6, 5), HOLE), sx * 0.1, 0.66, 1.16));
    skull.push(at(paint(new THREE.SphereGeometry(0.03, 6, 5), EYE), sx * 0.115, 0.66, 1.17));
  }
  P.push(...skull);
  // las patas de hueso (en el salto): las manos adelante, las patas estiradas atrás
  const leg = (pts, r) => {
    for (let k = 0; k < pts.length - 1; k++) P.push(seg(pts[k], pts[k + 1], r * (1 - k * 0.15), r * (0.85 - k * 0.15), BONE, 5));
    for (let k = 1; k < pts.length - 1; k++) P.push(at(paint(new THREE.SphereGeometry(r * 1.15, 6, 4), BONE), pts[k].x, pts[k].y, pts[k].z));
    const h = pts[pts.length - 1];
    P.push(at(paint(new THREE.BoxGeometry(0.1, 0.07, 0.12), BONE), h.x, h.y - 0.03, h.z + 0.02));
  };
  leg([V(0.16, -0.08, 0.45), V(0.19, -0.42, 0.82), V(0.19, -0.74, 1.02)], 0.05);
  leg([V(-0.16, -0.08, 0.42), V(-0.19, -0.48, 0.72), V(-0.19, -0.82, 0.86)], 0.05);
  leg([V(0.16, -0.02, -0.46), V(0.19, -0.32, -0.66), V(0.19, -0.42, -1.06), V(0.19, -0.56, -1.36)], 0.05);
  leg([V(-0.16, -0.02, -0.46), V(-0.19, -0.36, -0.6), V(-0.19, -0.5, -0.98), V(-0.19, -0.66, -1.26)], 0.05);
  // la cola: unas vértebras para atrás y arriba
  for (let k = 0; k < 4; k++) P.push(at(paint(new THREE.BoxGeometry(0.06, 0.06, 0.08), BONE), 0, 0.16 + k * 0.05, -0.62 - k * 0.11));
  // ---- el jinete: la túnica sobre el lomo, el torso inclinado, la capucha con el hueco negro y los ojos
  P.push(at(paint(new THREE.CylinderGeometry(0.18, 0.44, 0.56, 10, 1, true), ROBE), 0, 0.48, -0.12, 0.2));
  P.push(at(paint(new THREE.CapsuleGeometry(0.19, 0.34, 4, 10), ROBE), 0, 0.82, -0.02, 0.45));
  for (const sx of [-1, 1]) P.push(at(paint(new THREE.SphereGeometry(0.12, 8, 6), ROBE), sx * 0.2, 1.0, 0.06));
  P.push(at(paint(new THREE.SphereGeometry(0.21, 12, 9).scale(1, 1.1, 1.25), ROBE), 0, 1.2, 0.12));
  P.push(at(paint(new THREE.ConeGeometry(0.13, 0.28, 8), ROBE), 0, 1.38, 0.0, -0.7));
  P.push(at(paint(new THREE.SphereGeometry(0.13, 10, 8).scale(0.85, 1.05, 0.45), HOLE), 0, 1.17, 0.27));
  for (const sx of [-1, 1]) P.push(at(paint(new THREE.SphereGeometry(0.026, 6, 5), EYE), sx * 0.05, 1.2, 0.32));
  // los brazos: mangas anchas y manos de hueso con garras (la derecha al cogote del caballo, la izquierda que agarra adelante)
  const arm = (sx, el, wr) => {
    const sh = V(sx * 0.22, 0.98, 0.04);
    P.push(seg(sh, el, 0.09, 0.11, ROBE, 8));
    P.push(seg(el, wr, 0.11, 0.15, ROBE, 8));
    const fw = new THREE.Vector3().subVectors(wr, el).normalize();
    const palm = wr.clone().addScaledVector(fw, 0.06);
    P.push(at(paint(new THREE.BoxGeometry(0.09, 0.04, 0.09), BONE), palm.x, palm.y, palm.z));
    for (let f = 0; f < 4; f++) {
      const base = palm.clone().add(V((f - 1.5) * 0.026, 0, 0));
      const tip = base.clone().addScaledVector(fw, 0.15).add(V((f - 1.5) * 0.02, -0.07, 0));
      P.push(seg(base, tip, 0.013, 0.004, BONE, 4));
    }
  };
  arm(1, V(0.3, 0.84, 0.38), V(0.14, 0.64, 0.68));
  arm(-1, V(-0.36, 0.9, 0.4), V(-0.32, 0.86, 0.8));
  // la capa: un paño sobre el lomo y siete tiras que se abren para atrás
  P.push(ribbon(V(0, 1.0, -0.1), V(0, 0.42, -0.95), 0.62, 0.7, 0.1, ROBE2, CAPE0, 0, 6));
  for (let k = 0; k < 7; k++) {
    const u = k / 6 - 0.5;
    const a = V(u * 0.5, 1.02 - Math.abs(u) * 0.12, -0.06);
    const b = V(u * 1.5 + rnd() * 0.15, 0.62 + Math.random() * 0.34 - Math.abs(u) * 0.2, -1.85 - Math.random() * 0.45 + Math.abs(u) * 0.3);
    P.push(ribbon(a, b, 0.2, 0.05, 0.16 + Math.random() * 0.1, CAPE0, CAPE1, u * 0.8));
  }
  PROC = mergeGeometries(P);
  for (const g of P) g.dispose();
  PROC.computeBoundingSphere();
  return PROC;
}

// El modelo de Meshy, si ya está: una sola malla, con su textura. Se centra,
// se lleva al largo del de piezas mirando a +z, y queda con color (blanco) y
// uv, como el de piezas (mismo programa). null si no está o no se entiende.
function modelGeo(gltf) {
  const meshes = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o);
  });
  if (!meshes.length) return null;
  let map = null;
  const parts = meshes.map((o) => {
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!map && o.material?.map) map = o.material.map;
    const out = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') out.deleteAttribute(k);
    // (caras planas: el estilo facetado)
    out.deleteAttribute('normal');
    out.computeVertexNormals();
    const n = out.attributes.position.count;
    if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!out.attributes.color || out.attributes.color.itemSize !== 3) out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return out;
  });
  const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (!geo) return null;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  // (si vino de costado, el largo en x: se lo gira a z)
  if (size.x > size.z * 1.3) {
    geo.rotateY(-Math.PI / 2);
    size.set(size.z, size.y, size.x);
  }
  const k = MODEL_LEN / Math.max(size.z, 0.01);
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  return { geo, map, size: size.multiplyScalar(k) };
}

// ---------------- los sonidos (horneados: suenan seguido) ----------------
// El alarido de dementor: tres sierras desafinadas con vibrato, por un filtro que baja, y el aliento encima.
function shriekBody(o, t) {
  const c = this.ctx;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(700, t + 1.4);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
  g.gain.setValueAtTime(0.5, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
  bp.connect(g).connect(o);
  const lfo = c.createOscillator();
  lfo.frequency.value = 7.5 + Math.random() * 2;
  const lg = c.createGain();
  lg.gain.value = 60;
  lfo.connect(lg);
  for (const [f0, f1, det] of [
    [820, 430, -12],
    [1240, 610, 9],
    [560, 300, 0],
  ]) {
    const s = c.createOscillator();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0 * (0.94 + Math.random() * 0.12), t);
    s.frequency.exponentialRampToValueAtTime(f1, t + 1.4);
    s.detune.value = det;
    lg.connect(s.detune);
    s.connect(bp);
    s.start(t);
    s.stop(t + 1.5);
  }
  lfo.start(t);
  lfo.stop(t + 1.5);
  this.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 2600, freqEnd: 900, q: 1.2, gain: 0.35, attack: 0.08 });
}
// La picada: el aire que se corta.
function whooshBody(o, t) {
  this.noise(o, { t, dur: 1.0, type: 'bandpass', freq: 260, freqEnd: 1500, q: 1.4, gain: 0.7, attack: 0.55 });
  this.noise(o, { t: t + 0.05, dur: 0.95, type: 'lowpass', freq: 400, freqEnd: 120, gain: 0.5, attack: 0.5, brown: true });
}
// Se deshace: un lamento que cae y el estallido.
function dieBody(o, t) {
  const c = this.ctx;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 1.4);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  lp.connect(g).connect(o);
  for (const [f0, f1] of [
    [980, 110],
    [1460, 160],
  ]) {
    const s = c.createOscillator();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(f1, t + 1.4);
    s.connect(lp);
    s.start(t);
    s.stop(t + 1.55);
  }
  this.noise(o, { t, dur: 0.6, type: 'highpass', freq: 1800, freqEnd: 600, gain: 0.5, attack: 0.004 });
  this.tone(o, { t, dur: 0.5, type: 'sine', freq: 90, freqEnd: 40, gain: 0.5 });
}
// La embestida que te agarra.
function ramBody(o, t) {
  this.tone(o, { t, dur: 0.35, type: 'sine', freq: 120, freqEnd: 45, gain: 0.8 });
  this.noise(o, { t, dur: 0.45, type: 'lowpass', freq: 1800, freqEnd: 200, gain: 0.7, attack: 0.003 });
}

export default class Jinetes {
  constructor(ev) {
    this.ev = ev;
    this.g = ev.g;
    this.root = new THREE.Group();
    this.root.name = 'jinetes';
    ev.root.add(this.root);
    this.T = { value: 0 };
    this.mat = jineteMat(this.T);
    this.geo = proceduralGeo();
    this.S = 1;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, POOL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < POOL; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, tmpC.setRGB(0, 0, 0));
    }
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.root.add(this.mesh);
    this.list = Array.from({ length: POOL }, (_, i) => this.make(i));
    this.gap = 0;
    this.model = 'piezas';
    this.loadModel();
    this.bake();
  }

  make(i) {
    return {
      i,
      st: S.off,
      t: 0,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      yawRate: 0,
      fade: 0,
      flash: 0,
      dis: 0,
      ang: 0,
      rad: 10,
      alt: 20,
      w: 0.4,
      cd: 0,
      tgt: null,
      aim: new THREE.Vector3(),
      commit: false,
      f: 2,
      diveN: 0,
      hitMe: -1,
      moanT: 4 + Math.random() * 8,
      trailT: 0,
      hs: HS.map(() => new THREE.Vector3()),
      net: { p: new THREE.Vector3(), v: new THREE.Vector3(), at: -1, seen: -1 },
      z: { yasy: true, jinete: true, kind: 'jinete', active: false, dead: true, boss: false, dog: false, id: JIN_ID + i, pos: new THREE.Vector3(), yaw: 0, scale: 1, hp: 1, maxHp: 1, hidden: 0, baseY: 0, state: 'chase' },
    };
  }

  // ---------------- el modelo de Meshy (si ya está) ----------------
  loadModel() {
    if (globalThis.__mduNoJineteModel === true) return;
    fetch(assetUrl(MODEL_URL))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        // (vite contesta la página con 200 si el archivo no existe: se mira que sea un glb)
        if (!buf || buf.byteLength < 20 || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'glTF') return;
        new GLTFLoader().parse(buf, '', (gltf) => this.useModel(gltf), () => {});
      })
      .catch(() => {});
  }

  useModel(gltf) {
    if (this.disposed) return;
    const M = modelGeo(gltf);
    if (!M) return;
    if (M.map) {
      M.map.colorSpace = THREE.SRGBColorSpace;
      M.map.flipY = false;
      M.map.needsUpdate = true;
      this.mat.uniforms.map.value = M.map;
      try {
        this.g.renderer?.initTexture?.(M.map);
      } catch {
        /* se sube al verlo */
      }
    }
    this.mesh.geometry = M.geo;
    this.geo = M.geo;
    this.model = `meshy ${M.size.x.toFixed(2)}x${M.size.y.toFixed(2)}x${M.size.z.toFixed(2)} m, ${M.geo.attributes.position.count / 3} tri`;
    warmObject(this.g, this.root);
  }

  // ---------------- los sonidos ----------------
  bake() {
    const A = this.g.audio;
    if (this.baked || !A?.ctx || !A.bakeSound) return;
    this.baked = true;
    if (A.baked?.d10Shriek) return;
    A.bakeSound('d10Shriek', 1.55, shriekBody, 3);
    A.bakeSound('d10Whoosh', 1.1, whooshBody, 2);
    A.bakeSound('d10Die', 1.6, dieBody, 2);
    A.bakeSound('d10Ram', 0.7, ramBody, 2);
  }

  // (ITERACION-8) Uno de los grabados (fx/eclipseSfx); false si todavía no bajó
  // (se pide) o si está apagado: suena el sintetizado.
  rec(id, pos, gain, ref, reverb) {
    if (!REC) return false;
    const E = eclSfx(this.g);
    if (!E.has(id)) {
      E.load(REC_IDS);
      return false;
    }
    return E.play(id, { pos: pos.clone(), gain, reverb, ref, rate: 0.95 + Math.random() * 0.1 });
  }

  // (la risa: no más de una cada 6 s entre todos)
  laugh(J, gain) {
    const now = this.g.time || 0;
    if (now - (this.laughAt ?? -99) < 6) return true;
    const id = Math.random() < 0.2 ? 'risa-demoniaca' : 'jinete-risa';
    if (!this.rec(id, J.pos, id === 'risa-demoniaca' ? gain * 0.9 : gain, 16, 0.55)) return false;
    this.laughAt = now;
    return true;
  }

  snd(key, pos, gain = 1, rate = 1, ref = 10) {
    const A = this.g.audio;
    const b = A?.bakedBuf?.(key);
    if (!b) return;
    A.playBuffer(b, { pos: pos.clone(), gain, reverb: 0.5, rate: rate * (0.94 + Math.random() * 0.12), ref });
  }

  // ---------------- el pool ----------------
  hittable(J) {
    return (J.st === S.in && J.fade > 0.4) || J.st === S.circle || J.st === S.wind || J.st === S.dive || J.st === S.rise || J.st === S.stun;
  }

  alive() {
    let n = 0;
    for (const J of this.list) if (J.st !== S.off && J.st !== S.die && J.st !== S.out) n++;
    return n;
  }

  idle() {
    return this.list.every((J) => J.st === S.off);
  }

  reset() {
    for (const J of this.list) this.off(J);
    this.render(0);
  }

  off(J) {
    J.st = S.off;
    J.z.active = false;
    J.z.dead = true;
    J.fade = 0;
    J.dis = 0;
    J.flash = 0;
  }

  setSt(J, s) {
    if (J.st === s) return;
    J.st = s;
    J.t = 0;
    if (s === S.wind) {
      // (el ataque: la toma 1, 3 dB más baja y con más eco)
      const one = GOLPE || Math.random() < 0.5;
      if (!this.rec(one ? 'jinete-ataque-1' : 'jinete-ataque-2', J.pos, one ? 0.95 : 1.3, 14, one ? 0.8 : 0.45)) this.snd('d10Shriek', J.pos, 1.3, 1, 14);
    }
    if (s === S.dive) {
      J.diveN++;
      J.commit = false;
      this.snd('d10Whoosh', J.pos, 1.1, 1, 10);
    }
  }

  // (anfitrión) Uno nuevo, arriba de la isla, que baja a dar vueltas.
  spawn(hp) {
    const J = this.list.find((x) => x.st === S.off);
    if (!J) return null;
    const D = this.ev.cupula;
    const a = Math.random() * Math.PI * 2;
    J.pos.set(D.c.x + Math.cos(a) * D.R * 0.6, D.c.y + D.Ry + 24 + Math.random() * 6, D.c.z + Math.sin(a) * D.R * 0.6);
    J.vel.set(0, -2, 0);
    J.ang = Math.atan2(J.pos.z - D.c.z, J.pos.x - D.c.x);
    J.w = (Math.random() < 0.5 ? -1 : 1) * (0.32 + Math.random() * 0.18);
    J.rad = D.R * (0.5 + Math.random() * 0.5);
    J.alt = D.Ry + 6 + Math.random() * 6;
    J.cd = 1.5 + Math.random() * 3;
    J.f = 2;
    J.big = !!this.ev.nextBig;
    this.ev.nextBig = false;
    J.z.hp = J.z.maxHp = J.big ? hp * 3 : hp;
    J.z.active = true;
    J.z.dead = false;
    J.fade = 0;
    J.dis = 0;
    J.yaw = a + Math.PI;
    this.setSt(J, S.in);
    this.appear(J);
    return J;
  }

  // Sale de una grieta en el cielo (en todas las compus, la primera vez que se lo ve).
  appear(J) {
    const g = this.g;
    g.fx.flash(J.pos, 0xb050ff, 10, 0.5, 30);
    for (let i = 0; i < 22; i++) g.fx.add.spawn(J.pos.x + rnd() * 1.2, J.pos.y + rnd() * 1.6, J.pos.z + rnd() * 1.2, rnd() * 3, rnd() * 3, rnd() * 3, { color: i % 3 ? [0.7, 0.25, 1] : [1, 0.6, 1], size: 0.22, size1: 0, life: 0.9 + Math.random() * 0.5, drag: 1.2 });
    this.snd('d10Shriek', J.pos, 0.8, 0.6, 16);
    // (alguna vez, la risa demoníaca al salir)
    if (REC && Math.random() < 0.3 && (this.g.time || 0) - (this.laughAt ?? -99) > 6 && this.rec('risa-demoniaca', J.pos, 0.85, 16, 0.6)) this.laughAt = this.g.time || 0;
  }

  // (en todas) Uno bajado: se deshace en luz violeta.
  die(J, p) {
    if (!J) return;
    if (p) J.pos.set(p[0], p[1], p[2]);
    J.z.active = false;
    J.z.dead = true;
    J.st = S.die;
    J.t = 0;
    J.vel.multiplyScalar(0.2);
    const g = this.g;
    const c = J.hs[1].lengthSq() ? J.hs[1] : J.pos;
    g.fx.flash(c, 0xc060ff, 9, 0.45, 16);
    for (let i = 0; i < 40; i++) g.fx.add.spawn(c.x + rnd() * 1.4, c.y + rnd() * 1.6 - 0.4, c.z + rnd() * 1.4, rnd() * 4, 1 + Math.random() * 3, rnd() * 4, { color: i % 4 ? [0.75, 0.3, 1] : [1, 0.75, 1], size: 0.16, size1: 0, life: 0.8 + Math.random() * 0.7, gravity: -1.5, drag: 1 });
    this.snd('d10Die', c, 1.4, 1, 14);
  }

  // (en todas) Se terminó: los que quedan se van para arriba, a la grieta.
  flee() {
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die || J.st === S.out) continue;
      J.z.active = false;
      J.z.dead = true;
      J.st = S.out;
      J.t = 0;
    }
  }

  // ---------------- el anfitrión los mueve ----------------
  hostTick(dt) {
    const ev = this.ev;
    const D = ev.cupula;
    const C = D.c;
    let diving = 0;
    for (const J of this.list) if (J.st === S.wind || J.st === S.dive) diving++;
    // (de a uno por jugador, hasta tres a la vez, y un respiro entre picada y picada)
    const np = ev.nPlayers();
    // (la carga: todos a la vez; si no, hasta np+1 y con menos respiro que antes)
    const charge = ev.charge > 0;
    // (el evento puede poner su ritmo: San Lorenzo, slJinetes)
    const maxDive = charge ? 12 : (ev.maxDive?.(np) ?? Math.min(4, np + 1));
    const gap = charge ? 0 : (ev.diveGap?.(np) ?? (DIVE_GAP * 0.55) / Math.sqrt(np));
    this.gap -= dt;
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die || J.st === S.out) continue;
      J.t += dt;
      switch (J.st) {
        case S.in:
        case S.circle: {
          J.ang += J.w * dt;
          tmpV.set(C.x + Math.cos(J.ang) * J.rad, C.y + J.alt + Math.sin(J.t * 0.9 + J.i) * 1.2, C.z + Math.sin(J.ang) * J.rad);
          tmpW.subVectors(tmpV, J.pos).multiplyScalar(1.4);
          // (y la vuelta: va para adelante en el círculo)
          tmpW.x += -Math.sin(J.ang) * J.w * J.rad;
          tmpW.z += Math.cos(J.ang) * J.w * J.rad;
          const sp = tmpW.length();
          if (sp > CIRCLE_V) tmpW.multiplyScalar(CIRCLE_V / sp);
          J.vel.lerp(tmpW, 1 - Math.exp(-dt * 2.2));
          J.pos.addScaledVector(J.vel, dt);
          if (J.st === S.in) {
            if (J.t >= FADE_IN) this.setSt(J, S.circle);
            break;
          }
          J.cd -= dt;
          if ((J.cd <= 0 || charge) && diving < maxDive && this.gap <= 0 && ev.st.on) {
            const T = ev.pickTarget(this.list);
            if (T) {
              J.tgt = T.id;
              this.setSt(J, S.wind);
              diving++;
              this.gap = gap;
            } else J.cd = 1;
          }
          break;
        }
        case S.wind: {
          // se para de manos en el aire y grita
          J.vel.multiplyScalar(Math.exp(-dt * 4));
          J.vel.y += (2.4 - J.vel.y) * Math.min(1, dt * 4);
          J.pos.addScaledVector(J.vel, dt);
          if (J.t >= WIND_T) {
            const tp = ev.playerPos(J.tgt);
            if (!tp) {
              this.setSt(J, S.rise);
              break;
            }
            J.aim.set(tp.x, tp.y + 1.05, tp.z);
            J.vel.subVectors(J.aim, J.pos).normalize().multiplyScalar(DIVE_V0);
            J.f = D.f(J.pos);
            this.setSt(J, S.dive);
          }
          break;
        }
        case S.dive: {
          const tp = ev.playerPos(J.tgt);
          if (tp && !J.commit) J.aim.set(tp.x, tp.y + 1.05, tp.z);
          tmpV.subVectors(J.aim, J.pos);
          const dist = tmpV.length();
          let sp = Math.min(DIVE_V, J.vel.length() + DIVE_ACC * dt);
          tmpW.copy(J.vel).normalize();
          if (!J.commit && dist > COMMIT) {
            tmpV.divideScalar(Math.max(dist, 1e-4));
            const ang = Math.acos(Math.max(-1, Math.min(1, tmpW.dot(tmpV))));
            if (ang > 1e-4) tmpW.lerp(tmpV, Math.min(1, (TURN * dt) / ang)).normalize();
          } else J.commit = true;
          J.vel.copy(tmpW).multiplyScalar(sp);
          J.pos.addScaledVector(J.vel, dt);
          // la cúpula: si entra, le pega y rebota
          const f = D.f(J.pos);
          if (ev.solid() && J.f >= 1 && f < 1) {
            ev.domeHit(J);
            break;
          }
          J.f = f;
          tmpV.subVectors(J.aim, J.pos);
          const fl = this.floor(J.pos);
          if (J.pos.y < fl + 0.8) {
            J.pos.y = fl + 0.8;
            this.setSt(J, S.rise);
          } else if (tmpV.dot(J.vel) <= 0 || dist < 0.9 || J.t > 4.5) this.setSt(J, S.rise);
          break;
        }
        case S.rise: {
          tmpW.set(J.vel.x, 0, J.vel.z);
          if (tmpW.lengthSq() < 0.01) tmpW.set(J.pos.x - C.x, 0, J.pos.z - C.z);
          tmpW.normalize().multiplyScalar(12);
          tmpW.y = 9;
          J.vel.lerp(tmpW, 1 - Math.exp(-dt * 3));
          J.pos.addScaledVector(J.vel, dt);
          if (J.t > RISE_T || J.pos.y > C.y + J.alt - 1) {
            J.ang = Math.atan2(J.pos.z - C.z, J.pos.x - C.x);
            J.cd = 2.2 + Math.random() * 2.6;
            this.setSt(J, S.circle);
          }
          break;
        }
        case S.stun: {
          J.vel.multiplyScalar(Math.exp(-dt * 1.8));
          J.vel.y += 1.4 * dt;
          J.pos.addScaledVector(J.vel, dt);
          if (J.t > STUN_T) this.setSt(J, S.rise);
          break;
        }
        default:
      }
    }
  }

  // (anfitrión) Rebote contra la cúpula: sale para afuera aturdido.
  bounce(J, n) {
    J.vel.reflect(n).multiplyScalar(0.35).addScaledVector(n, 7);
    J.vel.y += 3;
    J.pos.addScaledVector(n, 0.3);
    J.f = 2;
    J.flash = 1;
    this.setSt(J, S.stun);
  }

  floor(p) {
    const y = this.g.world.floorAt(p.x, p.z, p.y + 2);
    return Number.isFinite(y) ? y : -1e9;
  }

  // ---------------- la red ----------------
  // (anfitrión) Dónde están: [i, estado, x, y, z, vx, vy, vz] en décimas.
  snap() {
    const l = [];
    const r = (v) => Math.round(v * 10);
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die || J.st === S.out) continue;
      l.push(J.i, J.st, r(J.pos.x), r(J.pos.y), r(J.pos.z), r(J.vel.x), r(J.vel.y), r(J.vel.z));
    }
    return l;
  }

  // (invitado) Uno que no viene en tres seguidas se fue (por cuenta de
  // mensajes, no de tiempo: un cuadro largo del invitado no los borra).
  applySnap(l) {
    if (!Array.isArray(l)) return;
    const t = now();
    const got = (this.got ||= new Set());
    got.clear();
    for (let k = 0; k + 7 < l.length; k += 8) {
      const J = this.list[l[k]];
      const s = l[k + 1] | 0;
      const nums = l.slice(k + 2, k + 8).map(Number);
      if (!J || !(s > 0 && s < S.die) || !nums.every(Number.isFinite)) continue;
      got.add(J);
      if (J.st === S.die || J.st === S.out) continue;
      J.net.p.set(nums[0] / 10, nums[1] / 10, nums[2] / 10);
      J.net.v.set(nums[3] / 10, nums[4] / 10, nums[5] / 10);
      J.net.at = t;
      J.net.seen = t;
      J.net.miss = 0;
      if (J.st === S.off) {
        J.pos.copy(J.net.p);
        J.vel.copy(J.net.v);
        J.z.active = true;
        J.z.dead = false;
        J.fade = s === S.in ? 0 : 1;
        J.dis = 0;
        J.st = s;
        J.t = 0;
        if (s === S.in) this.appear(J);
      } else this.setSt(J, s);
    }
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die || J.st === S.out || got.has(J)) continue;
      if ((J.net.miss = (J.net.miss || 0) + 1) >= 3) this.off(J);
    }
  }

  guestTick(dt) {
    const t = now();
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die || J.st === S.out) continue;
      J.t += dt;
      // (se perdió del todo: el anfitrión no manda nada hace rato)
      if (t - J.net.seen > 6) {
        this.off(J);
        continue;
      }
      const age = Math.min(0.35, t - J.net.at);
      tmpV.copy(J.net.p).addScaledVector(J.net.v, age);
      J.pos.lerp(tmpV, 1 - Math.exp(-dt * 10));
      J.vel.copy(J.net.v);
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt, playing) {
    const g = this.g;
    if (playing) {
      if (g.net?.guest) this.guestTick(dt);
      else this.hostTick(dt);
    }
    // los que se van (en todas las compus igual)
    for (const J of this.list) {
      if (J.st === S.die) {
        J.t += dt;
        J.vel.y -= 3 * dt;
        J.pos.addScaledVector(J.vel, dt);
        J.dis = Math.min(1, J.t / DIE_T);
        if (J.t >= DIE_T) this.off(J);
      } else if (J.st === S.out) {
        J.t += dt;
        J.vel.y += 14 * dt;
        J.pos.addScaledVector(J.vel, dt);
        J.fade = Math.max(0, 1 - J.t / OUT_T);
        if (J.t >= OUT_T) this.off(J);
      } else if (J.st === S.in) J.fade = Math.min(1, J.fade + dt / FADE_IN);
      else if (J.st !== S.off) J.fade = Math.min(1, J.fade + dt * 2);
    }
    this.T.value += dt;
    this.render(dt);
    if (playing) {
      this.ramCheck();
      this.ambient(dt);
    }
  }

  // La pose: hacia dónde va, la nariz para abajo en la picada, de manos al gritar, ladeado en las curvas.
  orient(J, dt) {
    const v = J.vel;
    const hv = Math.hypot(v.x, v.z);
    const prev = J.yaw;
    if (hv > 0.4) J.yaw += angDiff(Math.atan2(v.x, v.z), J.yaw) * (1 - Math.exp(-dt * 5));
    J.yawRate += ((dt > 0 ? angDiff(J.yaw, prev) / dt : 0) - J.yawRate) * Math.min(1, dt * 4);
    let pt = Math.max(-0.9, Math.min(0.9, -Math.atan2(v.y, Math.max(hv, 0.5))));
    if (J.st === S.wind) pt = -0.55;
    // (aturdido: tirado para atrás, bamboleándose cada vez menos)
    if (J.st === S.stun) pt = -0.35;
    J.pitch += (pt - J.pitch) * (1 - Math.exp(-dt * 4));
    const rt = J.st === S.stun ? Math.sin(J.t * 9) * 0.75 * Math.max(0, 1 - J.t / STUN_T) : Math.max(-0.6, Math.min(0.6, -J.yawRate * 0.35));
    J.roll += (rt - J.roll) * (1 - Math.exp(-dt * (J.st === S.stun ? 10 : 3)));
    J.q.setFromEuler(tmpE.set(J.pitch, J.yaw, J.roll, 'YXZ'));
  }

  render(dt) {
    const m = this.mesh;
    let any = false;
    for (const J of this.list) {
      if (J.st === S.off) {
        m.setMatrixAt(J.i, ZERO);
        m.setColorAt(J.i, tmpC.setRGB(0, 0, 0));
        continue;
      }
      any = true;
      if (dt > 0) this.orient(J, dt);
      J.flash = Math.max(0, J.flash - dt * 5);
      tmpM.compose(J.pos, J.q, tmpU.setScalar(this.S * (J.big ? 1.6 : 1)));
      m.setMatrixAt(J.i, tmpM);
      // (de lejos se ve igual: un ánima no se apaga con la distancia)
      m.setColorAt(J.i, tmpC.setRGB(J.fade, J.flash, J.dis));
      for (let k = 0; k < HS.length; k++) J.hs[k].set(HS[k][0], HS[k][1], HS[k][2]).multiplyScalar(this.S).applyQuaternion(J.q).add(J.pos);
      const z = J.z;
      z.pos.copy(J.hs[1]);
      z.pos.y -= 1;
      z.baseY = z.pos.y;
      z.yaw = J.yaw;
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.visible = any;
  }

  // La estela de humo violeta y, de vez en cuando, un lamento de los que dan vueltas.
  ambient(dt) {
    const g = this.g;
    for (const J of this.list) {
      if (J.st === S.off || J.st === S.die) continue;
      J.trailT -= dt;
      if (J.trailT <= 0 && J.fade > 0.3) {
        const fast = J.st === S.dive || J.st === S.rise;
        J.trailT = fast ? 0.035 : 0.11;
        tmpV.set(rnd() * 0.6, 0.7 + rnd() * 0.3, -1.3 - Math.random() * 0.6).applyQuaternion(J.q).add(J.pos);
        g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, J.vel.x * 0.1 + rnd(), J.vel.y * 0.1 + rnd(), J.vel.z * 0.1 + rnd(), { color: Math.random() < 0.3 ? [0.9, 0.4, 1] : [0.45, 0.14, 0.75], size: fast ? 0.32 : 0.24, size1: 0, life: fast ? 0.55 : 0.8, drag: 1.4, alpha: J.fade });
      }
      if (J.st === S.circle) {
        J.moanT -= dt;
        if (J.moanT <= 0) {
          J.moanT = 7 + Math.random() * 9;
          // (rondando: la risa, de a ratos; si no, el lamento sintetizado)
          if (REC && this.laugh(J, 0.75)) J.moanT += 6 + Math.random() * 8;
          else this.snd('d10Shriek', J.pos, 0.45, 0.55, 14);
        }
      }
    }
  }

  // Cada compu, su jugador: la embestida (una vez por picada). Adentro de la
  // cúpula levantada no pega (el anfitrión ya lo hace rebotar; esto es por si
  // la red llega tarde).
  ramCheck() {
    const g = this.g;
    const P = g.player;
    if (!P?.canBeHit?.()) return;
    const c = tmpU.set(P.pos.x, P.pos.y + 1.0, P.pos.z);
    for (const J of this.list) {
      if (!(J.st === S.dive || (J.st === S.rise && J.t < 0.35))) continue;
      if (J.hitMe === J.diveN) continue;
      if (J.hs[0].distanceTo(c) > RAM_R && J.hs[1].distanceTo(c) > RAM_R * 0.85) continue;
      J.hitMe = J.diveN;
      if (this.ev.shielded(J.z, P.pos)) continue;
      // (el Catalizador Caótico: la mitad; entities/eclipse/catalizador.js)
      // (2026-10-10: va quién pegó —J.z, un jinete—: el Escudo de la Cúpula la frena un poco; Player.damage)
      P.damage(jineteDmg(g, J.big ? RAM_DMG * 1.5 : RAM_DMG), J.pos.clone(), false, J.z);
      // el empujón: para donde iba el jinete, y para arriba
      tmpV.set(J.vel.x, 0, J.vel.z);
      if (tmpV.lengthSq() < 0.01) tmpV.set(P.pos.x - J.pos.x, 0, P.pos.z - J.pos.z);
      tmpV.normalize();
      P.vel.x += tmpV.x * RAM_PUSH;
      P.vel.z += tmpV.z * RAM_PUSH;
      P.vel.y = Math.max(P.vel.y, 5);
      P.onGround = false;
      g.fx.addShake?.(0.55);
      g.post?.flash?.(0.18);
      g.fx.flash(c, 0xa040ff, 6, 0.3, 8);
      if (!(GOLPE && this.rec('jinete-golpe', c, 1.4, 6, 0.3))) this.snd('d10Ram', c, 1.3, 1, 6);
    }
  }

  // ---------------- para las armas ----------------
  byId(id) {
    const J = this.list[id - JIN_ID];
    return J && J.z.active ? J.z : null;
  }

  hitTest(o, d, maxT, hits) {
    for (const J of this.list) {
      if (!this.hittable(J)) continue;
      let best = Infinity;
      let zone = 'torso';
      for (let k = 0; k < HS.length; k++) {
        const r = HS[k][3] * this.S;
        tmpW.subVectors(J.hs[k], o);
        const along = tmpW.dot(d);
        if (along < 0 || along > maxT + r) continue;
        const perp2 = tmpW.lengthSq() - along * along;
        if (perp2 > r * r) continue;
        const t = along - Math.sqrt(r * r - perp2);
        if (t < best) {
          best = t;
          zone = HS[k][4];
        }
      }
      if (best <= maxT) hits.push({ z: J.z, t: Math.max(0, best), zone });
    }
  }

  inRadius(check) {
    for (const J of this.list) if (this.hittable(J)) check(J.z);
  }

  // (anfitrión) Un tiro, un tajo, una explosión. Aturdido (rebotó en la cúpula) recibe más.
  damage(z, amount, info = {}) {
    const g = this.g;
    g.zombies.lastPoints = 0;
    const J = this.list[z.id - JIN_ID];
    if (!J || !this.hittable(J) || !(amount > 0)) return false;
    let a = amount * (J.st === S.stun ? 1.4 : 1);
    // (el Farol del Cazador del Caos no se lo lleva de una: le saca un tercio)
    if (info.type === 'souls' && a >= 1e8) a = z.maxHp * 0.34;
    z.hp -= a;
    J.flash = 1;
    if (info.point) {
      const p = info.point;
      for (let i = 0; i < 6; i++) g.fx.add.spawn(p.x, p.y, p.z, rnd() * 3, rnd() * 3 + 1, rnd() * 3, { color: [0.85, 0.4, 1], size: 0.08, size1: 0, life: 0.35, drag: 2 });
    }
    if (z.hp > 0) {
      if (!info.noPoints) g.addPoints(10, info.point);
      return true;
    }
    const pts = this.ev.killPts;
    if (info.noPoints) g.zombies.lastPoints = pts;
    else g.addPoints(pts, info.point);
    this.ev.onKill(J);
    return true;
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.mat.dispose();
    if (this.geo !== PROC) this.geo.dispose();
    const map = this.mat.uniforms.map.value;
    if (map && map !== WHITE) map.dispose();
  }
}
