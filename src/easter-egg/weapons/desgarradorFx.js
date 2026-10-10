import * as THREE from 'three';
import { flareTexture, raysTexture } from './supremoFx';
import { spectralGeos, spectralCenter, bladeEdge, cosmicMats, VIOLET, GOLD, desgarradorModel, boltsWarmMesh } from './desgarradorModels';
import { PART_COUNT } from '../entities/skeleton';
import { bakeV4 } from './desgarradorSfx';
import { bakeV5 } from './desgarradorSfx5';

// Lo que se ve y se oye en el mundo del Desgarrador Cósmico (weapons/Desgarrador.js):
//  · las grietas: cada tajo deja el espacio-tiempo rajado donde pasó la hoja
//    (negro con estrellas adentro y el borde violeta encendido, ~1,5 s); la
//    embestida deja una recta y el giro de la recarga, un círculo. Las propias
//    lastiman a los que las cruzan (Desgarrador.riftHits).
//  · la guadaña espectral: la copia de luz que se tira, gira, atraviesa y
//    vuelve a la hoja.
//  · el rayo de la Furia Cósmica (mantener el derecho): pulveriza.
//  · partido al medio: la mitad de arriba del muerto vuela girando y cae
//    aparte; las piernas se desploman (Zombies: el estado 'sliced').
//  · la nube rosa de la ejecutora.
//  · los sonidos, horneados en la carga (audio.bakeSound): ninguno arma nodos
//    de síntesis por golpe.
// Todo vive en `root`, que se muda a la escena nueva cuando el mapa se rearma.
// Lo propio y lo de los compañeros (sin daño: lo decide el que pega) pasa por acá.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpM3 = new THREE.Matrix4();
const _z = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _near = [];
const Z =new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const hitTmp = {};
const rnd = () => Math.random() - 0.5;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

// los colores de cada estado: borde de la grieta y el fondo
export const PAL = {
  base: { edge: [0.62, 0.3, 1], core: [0.012, 0.0, 0.03], dust: [[0.55, 0.25, 1], [0.8, 0.5, 1], [0.35, 0.15, 0.8]] },
  furia: { edge: [0.95, 0.45, 1], core: [0.03, 0.0, 0.05], dust: [[0.85, 0.4, 1], [1, 0.75, 1], [0.6, 0.25, 1]] },
  exec: { edge: [1, 0.38, 0.75], core: [0.03, 0.0, 0.02], dust: [[1, 0.45, 0.8], [1, 0.75, 0.92], [0.85, 0.25, 0.65]] },
};

// ---------------- la grieta ----------------
// Una tira (u a lo largo, v de lado: -1,8 -1 0 1 1,8; z: los dientes de la
// grieta) que el vértice dobla en arco (uKind 0: radio uR, de +uHalf a -uHalf)
// o en recta (1: largo uLen). Se abre a lo ancho (y local) y se va
// "descosiendo" a lo largo con uOpen; uK la cierra.
const RIFT_N = 56;
const RIFT_V = [-1.8, -1, 0, 1, 1.8];
function riftGeo() {
  const pos = [];
  const idx = [];
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const jt = [];
  const jb = [];
  for (let i = 0; i <= RIFT_N; i++) {
    jt.push(r() * 2 - 1);
    jb.push(r() * 2 - 1);
  }
  for (let i = 0; i <= RIFT_N; i++) {
    const u = i / RIFT_N;
    // (los dientes, un poco suavizados entre vecinos)
    const t = (jt[i] * 2 + (jt[i - 1] ?? jt[i]) + (jt[i + 1] ?? jt[i])) / 4;
    const b = (jb[i] * 2 + (jb[i - 1] ?? jb[i]) + (jb[i + 1] ?? jb[i])) / 4;
    for (const v of RIFT_V) pos.push(u, v, v > 0 ? t : v < 0 ? b : 0);
  }
  const J = RIFT_V.length;
  for (let i = 0; i < RIFT_N; i++) {
    for (let j = 0; j < J - 1; j++) {
      const a = i * J + j;
      const c = a + J;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}
const RIFT_VS = `
uniform float uKind, uR, uHalf, uLen, uW, uOpen, uK, uFlip, uTime;
varying vec2 vUv; varying vec2 vScr; varying float vDist;
void main(){
  float u = position.x;
  float v = position.y;
  float jag = position.z;
  float uu = uFlip > 0.5 ? 1.0 - u : u;
  float prof = pow(max(sin(3.14159 * u), 0.0), 0.55);
  float o = 1.0 - smoothstep(uOpen - 0.16, uOpen, uu);
  float w = uW * prof * o * uK * (0.72 + 0.32 * jag) * (1.0 + 0.05 * sin(uTime * 23.0 + u * 31.0));
  vec3 p;
  if (uKind < 0.5) {
    float a = uHalf - u * 2.0 * uHalf;
    p = vec3(sin(a) * uR, v * w, -cos(a) * uR);
  } else {
    p = vec3((u - 0.5) * uLen, v * w, 0.0);
  }
  vUv = vec2(u, v);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vScr = gl_Position.xy / max(gl_Position.w, 1e-3);
  vDist = length(mv.xyz);
}`;
const NOISE = `
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const RIFT_FS = `
uniform float uTime, uK, uSeed, uLen2, uOwn;
uniform vec3 uEdge, uCore;
varying vec2 vUv; varying vec2 vScr; varying float vDist;
${NOISE}
void main(){
  float av = abs(vUv.y);
  // una raja finita: el negro de adentro, el borde encendido y apenas un halo
  float core = 1.0 - smoothstep(0.6, 0.88, av);
  float rim = smoothstep(0.58, 0.86, av) * (1.0 - smoothstep(0.95, 1.1, av));
  float glow = (1.0 - smoothstep(1.0, 1.8, av)) * step(0.999, av);
  // adentro, el vacío con profundidad: lo de adentro va pegado a la pantalla
  // (no a la grieta), así al moverse se ve un hueco a otro lado y no una
  // tira pintada; dos capas de estrellas (las de atrás corren) y la nebulosa
  vec2 sp = gl_FragCoord.xy;
  float neb = nz(sp * 0.012 + vec2(uTime * 0.12, uSeed)) * 0.6 + nz(sp * 0.031 - vec2(0.0, uTime * 0.25)) * 0.4;
  vec2 c1 = sp / 6.0;
  vec2 s1 = floor(c1);
  float st1 = step(0.955, hh(s1 + uSeed)) * (1.0 - smoothstep(0.08, 0.36, length(fract(c1) - 0.5)));
  vec2 c2 = (sp + vec2(uTime * 14.0, 0.0)) / 11.0;
  vec2 s2 = floor(c2);
  float st2 = step(0.965, hh(s2 + 7.0)) * (1.0 - smoothstep(0.05, 0.3, length(fract(c2) - 0.5)));
  float tw = 0.6 + 0.4 * sin(uTime * 7.0 + hh(s1) * 30.0);
  // (más claro junto a las paredes de la raja, negro en lo hondo)
  float wall = smoothstep(0.0, 0.62, av);
  vec3 inside = uCore + uEdge * (neb * neb * 0.26 + wall * wall * 0.3) + vec3(1.0, 0.92, 1.0) * (st1 * tw * 1.3 + st2 * 0.6);
  float flick = 0.9 + 0.1 * sin(uTime * 41.0 + vUv.x * 57.0);
  float k = clamp(uK, 0.0, 1.0);
  // las propias se aclaran en el medio de la pantalla (no tapan la mira) y
  // nada pegado a la cámara
  float view = mix(1.0, mix(0.3, 1.0, smoothstep(0.1, 0.45, length(vScr))), uOwn) * smoothstep(0.5, 1.4, vDist);
  vec3 col = (inside * core + uEdge * rim * 1.25 * flick + uEdge * glow * 0.1) * k * view;
  float a = max(core * 0.96, max(rim * 0.8, glow * 0.1)) * k * view;
  gl_FragColor = vec4(col, a);
}`;

// ---------------- el rayo de la Furia ----------------
// (el mismo armado que el rayo de oro de la hoz, weapons/hozBeam.js: el tubo va
// de 0 a 1 en z y el largo lo pone uLen; acá violeta, con dos hebras de
// grieta negra que se enroscan y medialunas violetas que corren)
const TUBE_VS = `
uniform float uLen, uR, uTime, uTaper, uMin;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vAx; varying float vAlong; varying vec2 vNdc;
void main(){
  float along = position.z * uLen;
  // (v4) fino donde nace (cerca de la cámara) y se engrosa en uTaper m
  float t0 = smoothstep(0.0, uTaper, along);
  float t1 = 1.0 - 0.5 * smoothstep(uLen - 0.3, uLen, along);
  float pulse = 1.0 + 0.2 * sin(along * 2.1 - uTime * 30.0) + 0.08 * sin(along * 6.7 + uTime * 37.0);
  float r = uR * mix(uMin, 1.0, t0) * t1 * pulse;
  vec4 mv = modelViewMatrix * vec4(position.xy * r, along, 1.0);
  vN = normalMatrix * vec3(position.xy, 0.0);
  vAx = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  vV = -mv.xyz;
  vUv = uv;
  vAlong = along;
  gl_Position = projectionMatrix * mv;
  vNdc = gl_Position.xy / max(gl_Position.w, 1e-4);
}`;
const TUBE_FS = `
uniform float uLen, uTime, uGrow, uK, uSharp, uFlow, uGain, uNear, uEnd, uOwn;
uniform vec3 uA, uB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vAx; varying float vAlong; varying vec2 vNdc;
${NOISE}
// (guadana5, tercera vuelta: "al tirar el rayo se pone tan al medio que tapa
// todo": el propio se aclara en el medio de la pantalla, donde se apunta)
float ctrFade(vec2 ndc, float own){ return mix(1.0, mix(0.2, 1.0, smoothstep(0.05, 0.4, length(ndc))), own); }

void main(){
  if (vAlong > uGrow) discard;
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  vec3 vp = v - vAx * dot(v, vAx);
  float lp = length(vp);
  float face = lp < 1e-3 ? 1.0 : clamp(abs(dot(n, vp / lp)), 0.0, 1.0);
  float core = pow(face, uSharp);
  float a1 = vUv.x * 6.2832;
  float fl = nz(vec2(cos(a1) * 1.5 + 3.0, vAlong * 1.3 - uTime * 16.0)) * 0.6 + nz(vec2(sin(a1) * 3.0, vAlong * 3.6 - uTime * 27.0)) * 0.4;
  float energy = mix(1.0, 0.3 + fl * 1.4, uFlow);
  float head = smoothstep(uGrow - 1.2, uGrow, vAlong) * step(uGrow, uLen - 0.01);
  float cam = mix(uNear, 1.0, smoothstep(0.4, 3.5, length(vV))) * smoothstep(0.12, 0.45, length(vV));
  float tail = 1.0 - smoothstep(uLen - 0.5, uLen + 0.05, vAlong) * 0.5;
  vec3 col = mix(uA, uB, core * 0.85 + head * 0.6) * (0.75 + core * 0.55 + head * 1.2);
  // (guadana5) visto de punta (desde la cámara, mirando por donde va el rayo)
  // se transparenta: si no, un rayo grueso es un disco sobre la mira
  float endOn = 1.0 - uEnd * 0.92 * smoothstep(0.86, 0.985, abs(dot(v, vAx)));
  float a = core * energy * cam * tail * (1.0 - uK) * uGain * endOn * ctrFade(vNdc, uOwn);
  gl_FragColor = vec4(col * a, a);
}`;
const HELIX_VS = `
uniform float uLen, uTime, uR, uTaper, uMin, uDir;
varying float vSide; varying float vAlong; varying float vDist; varying vec2 vNdc;
void main(){
  float along = position.z * uLen;
  float ang = (along * 1.6 - uTime * 11.0) * uDir + position.y;
  float t0 = smoothstep(0.0, uTaper, along);
  float r = uR * mix(uMin, 1.0, t0) * (1.0 + 0.22 * sin(along * 1.8 - uTime * 8.0 + position.y));
  vec3 p = vec3(cos(ang) * r, sin(ang) * r, along + position.x * 0.08);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vSide = position.x;
  vAlong = along;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vNdc = gl_Position.xy / max(gl_Position.w, 1e-4);
}`;
const HELIX_FS = `
uniform float uLen, uTime, uGrow, uK, uOwn;
uniform vec3 uA;
varying float vSide; varying float vAlong; varying float vDist; varying vec2 vNdc;
// (guadana5, tercera vuelta: "al tirar el rayo se pone tan al medio que tapa
// todo": el propio se aclara en el medio de la pantalla, donde se apunta)
float ctrFade(vec2 ndc, float own){ return mix(1.0, mix(0.2, 1.0, smoothstep(0.05, 0.4, length(ndc))), own); }

void main(){
  if (vAlong > uGrow) discard;
  float edge = 1.0 - vSide * vSide;
  float spark = 0.5 + 0.5 * sin(vAlong * 8.0 - uTime * 44.0);
  float cam = smoothstep(0.6, 2.2, vDist);
  float tail = 1.0 - smoothstep(uLen - 1.0, uLen, vAlong);
  float a = edge * spark * cam * tail * (1.0 - uK) * 0.9 * ctrFade(vNdc, uOwn);
  gl_FragColor = vec4(uA * a, a);
}`;
// guadana5 (iteración 4: "la guadaña en el estado de furia tira un rayo láser
// súper débil que es peor que en el estado normal y es muy poco vistoso"): el
// rayo de vacío. Un núcleo GRUESO de negro con estrellas que corren y el borde
// de neón violeta (se dibuja normal, no sumado: oscurece lo que tapa), adentro
// de un resplandor grande y dos hebras que se enroscan para lados contrarios.
// (globalThis.__mduDesgOldBeam: el rayo de la v4)
const OLD_BEAM = globalThis.__mduDesgOldBeam === true;
const VOID_FS = `
uniform float uLen, uTime, uGrow, uK, uOwn;
uniform vec3 uA, uB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vAx; varying float vAlong; varying vec2 vNdc;
${NOISE}
// (guadana5, tercera vuelta: "al tirar el rayo se pone tan al medio que tapa
// todo": el propio se aclara en el medio de la pantalla, donde se apunta)
float ctrFade(vec2 ndc, float own){ return mix(1.0, mix(0.2, 1.0, smoothstep(0.05, 0.4, length(ndc))), own); }

void main(){
  if (vAlong > uGrow) discard;
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = vV / max(length(vV), 1e-4);
  vec3 vp = v - vAx * dot(v, vAx);
  float lp = length(vp);
  float face = lp < 1e-3 ? 1.0 : clamp(abs(dot(n, vp / lp)), 0.0, 1.0);
  float edge = 1.0 - face;
  float a1 = vUv.x * 6.2832;
  // estrellas que corren hacia adelante y la nebulosa que se retuerce
  float st = nz(vec2(cos(a1) * 9.0 + 7.0, vAlong * 5.0 - uTime * 34.0));
  float neb = nz(vec2(sin(a1) * 2.0, vAlong * 0.9 - uTime * 6.0));
  vec3 deep = vec3(0.012, 0.0, 0.035) + uA * (0.1 * neb) + vec3(1.0, 0.9, 1.0) * smoothstep(0.86, 0.97, st) * 1.6;
  float flick = 0.85 + 0.15 * sin(uTime * 47.0 + vAlong * 3.0);
  float rim = smoothstep(0.5, 0.93, edge);
  vec3 col = mix(deep, mix(uA, uB, smoothstep(0.85, 1.0, edge)) * 2.4 * flick, rim);
  float head = smoothstep(uGrow - 1.0, uGrow, vAlong) * step(uGrow, uLen - 0.01);
  col += uB * head * 1.5;
  float cam = smoothstep(0.3, 1.4, length(vV));
  float tail = 1.0 - smoothstep(uLen - 0.4, uLen + 0.05, vAlong) * 0.6;
  float endOn = 1.0 - 0.8 * smoothstep(0.94, 0.997, abs(dot(v, vAx)));
  float a = (1.0 - smoothstep(0.96, 1.0, edge)) * cam * tail * (1.0 - uK) * endOn * ctrFade(vNdc, uOwn);
  gl_FragColor = vec4(col * a, a);
}`;
const RINGS = 9;
let BEAM_GEO = null;
function beamGeos() {
  if (BEAM_GEO) return BEAM_GEO;
  const tube = new THREE.CylinderGeometry(1, 1, 1, 18, 48, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const N = 160;
  const pos = [];
  const idx = [];
  for (let s = 0; s < 2; s++) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pos.push(-1, s * Math.PI, u, 1, s * Math.PI, u);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const helix = new THREE.BufferGeometry();
  helix.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  helix.setIndex(idx);
  helix.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  // las medialunas que corren por el rayo (como la hoja de la guadaña)
  const ring = new THREE.TorusGeometry(0.34, 0.02, 6, 26, Math.PI * 1.1);
  const shock = new THREE.PlaneGeometry(1, 1);
  BEAM_GEO = { tube, helix, ring, shock };
  return BEAM_GEO;
}
const shader = (uniforms, vs, fs, blending = THREE.AdditiveBlending) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending, premultipliedAlpha: true, side: THREE.DoubleSide, forceSinglePass: true, fog: false, toneMapped: false });
const sprite = (map, hex, k) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
const prep = (o, order = 8) => {
  o.frustumCulled = false;
  o.renderOrder = order;
  o.userData.reflect = false;
  o.castShadow = false;
  return o;
};

// ---------------- la burbuja del tiempo / la cáscara del pozo ----------------
// Una esfera de luz: casi nada adentro y el borde encendido (fresnel), con
// ondas que corren. (sin pow sobre lo que puede dar negativo)
const OLD_BUBBLES = globalThis.__mduDesgOldBubbles === true;
const BUBBLE_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const BUBBLE_FS = `
uniform float uTime, uK; uniform vec3 uCol;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec3 v = vV / max(length(vV), 1e-4);
  float f = 1.0 - clamp(abs(dot(normalize(vN), v)), 0.0, 1.0);
  float rim = f * f * f;
  float band = 0.5 + 0.5 * sin(vP.y * 14.0 - uTime * 6.0 + sin(vP.x * 9.0 + uTime) * 1.5);
  float a = (rim * 0.85 + band * 0.03 + 0.012) * clamp(uK, 0.0, 2.5);
  gl_FragColor = vec4(uCol * a * 1.4, a);
}`;

// Un rayo armado (el propio o el de un compañero).
class Rig {
  constructor(home) {
    const G = beamGeos();
    this.home = home;
    this.root = new THREE.Group();
    this.root.userData.reflect = false;
    this.TIME = { value: 0 };
    this.LEN = { value: 1 };
    this.GROW = { value: 0 };
    this.K = { value: 1 };
    // (v4) cuántos metros tarda en engrosarse (globalThis.__mduDesgBeamTip: como antes, 1,4)
    // (guadana5: nace fino, a la derecha, y a los 4 m ya es grueso: cerca de la
    // cámara se ve de punta y tapaba la mira con un disco)
    this.TAPER = { value: globalThis.__mduDesgBeamTip === true ? 1.4 : OLD_BEAM ? 7 : 3 };
    this.MIN = { value: OLD_BEAM ? 0.07 : 0.2 };
    this.OWN = { value: 0 };
    const tube = (r, sharp, flow, gain, near, a, b, fs = TUBE_FS, blending = THREE.AdditiveBlending) =>
      prep(new THREE.Mesh(G.tube, shader({ uLen: this.LEN, uTime: this.TIME, uGrow: this.GROW, uK: this.K, uTaper: this.TAPER, uMin: this.MIN, uOwn: this.OWN, uEnd: { value: OLD_BEAM ? 0 : 1 }, uR: { value: r }, uSharp: { value: sharp }, uFlow: { value: flow }, uGain: { value: gain }, uNear: { value: near }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } }, TUBE_VS, fs, blending)));
    const helix = (r, hex, dir) => prep(new THREE.Mesh(G.helix, shader({ uLen: this.LEN, uTime: this.TIME, uGrow: this.GROW, uK: this.K, uTaper: this.TAPER, uMin: this.MIN, uOwn: this.OWN, uDir: { value: dir }, uR: { value: r }, uA: { value: new THREE.Color(hex).multiplyScalar(1.2) } }, HELIX_VS, HELIX_FS)));
    if (OLD_BEAM) {
      this.MIN.value = 0.07;
      this.glow = tube(0.24, 1.2, 1, 0.42, 0.22, 0x7a1cff, 0xd060ff);
      this.core = tube(0.06, 2.6, 0.4, 0.85, 0.8, 0xc890ff, 0xfff0ff);
      this.R0 = [0.24, 0.06, 0.4];
      this.helix = helix(0.4, 0xff6ae0, 1);
      this.root.add(this.glow, this.core, this.helix);
    } else {
      // el resplandor grande (atrás), el núcleo de vacío (encima, normal) y un
      // hilo caliente en el medio; dos hebras: rosa y violeta, al revés
      this.glow = prep(tube(0.7, 1.1, 1, 0.5, 0.12, 0x5a10e0, 0xc050ff), 7);
      this.voidT = prep(tube(0.24, 1, 0, 1, 1, 0x9a40ff, 0xf0c8ff, VOID_FS, THREE.NormalBlending), 9);
      this.core = prep(tube(0.035, 3, 0.5, 0.7, 0.6, 0xd0a0ff, 0xffffff), 10);
      this.helix = prep(helix(0.62, 0xff6ae0, 1), 10);
      this.helix2 = prep(helix(0.5, 0x9a5cff, -1.35), 10);
      this.R0 = [0.7, 0.035, 0.62, 0.24, 0.5];
      this.root.add(this.glow, this.voidT, this.core, this.helix, this.helix2);
    }
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb070ff).multiplyScalar(1.9), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, fog: false });
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = prep(new THREE.Mesh(G.ring, this.ringMat));
      m.visible = false;
      this.root.add(m);
      this.rings.push({ m, u: 0, on: false, spin: 0 });
    }
    this.ringT = 0;
    this.hit = new THREE.Group();
    this.hitFlare = prep(sprite(flareTexture(), 0xe0b0ff, 1.2));
    this.hitRays = prep(sprite(raysTexture(), 0xa040ff, 1));
    this.hit.add(this.hitRays, this.hitFlare);
    // (guadana5) donde pega: tres ondas de choque que se abren (de cara al rayo)
    this.shocks = [];
    if (!OLD_BEAM) {
      const sm = new THREE.MeshBasicMaterial({ map: ringTex(), color: new THREE.Color(0.75, 0.4, 1).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
      for (let i = 0; i < 3; i++) {
        const m = prep(new THREE.Mesh(G.shock, sm.clone()), 9);
        m.visible = false;
        this.hit.add(m);
        this.shocks.push({ m, t: i / 3 });
      }
    }
    this.root.add(this.hit);
    this.tip = prep(sprite(flareTexture(), 0xf0d0ff, 1.8));
    this.root.add(this.tip);
    this.busy = false;
    home.add(this.root);
  }

  take(scene) {
    this.busy = true;
    this.ringT = 0;
    for (const r of this.rings) {
      r.on = false;
      r.m.visible = false;
    }
    scene.add(this.root);
  }

  release() {
    this.busy = false;
    this.home.add(this.root);
  }

  // De a a b; k (0 apagado, 1 entero); grow: hasta dónde llegó la punta.
  set(a, b, k, grow, wall, time, dt, tip, ws = 1) {
    // (guadana5, tercera vuelta: el propio -sin la chispa de la punta- en
    // primera persona: nace más fino, tarda más en engrosarse y se aclara en la
    // mira; el de un compañero, visto de afuera, igual de grande.
    // globalThis.__mduDesgOldBeamFp: el propio como el de afuera)
    const own = !tip && !OLD_BEAM && globalThis.__mduDesgOldBeamFp !== true;
    this.OWN.value = own ? 1 : 0;
    if (!OLD_BEAM) {
      this.MIN.value = own ? 0.06 : 0.2;
      this.TAPER.value = own ? 6.5 : 3;
    }
    this.glow.material.uniforms.uR.value = this.R0[0] * ws;
    this.core.material.uniforms.uR.value = this.R0[1] * ws;
    this.helix.material.uniforms.uR.value = this.R0[2] * ws;
    if (this.voidT) {
      this.voidT.material.uniforms.uR.value = this.R0[3] * ws;
      this.helix2.material.uniforms.uR.value = this.R0[4] * ws;
    }
    const d = tmpV3.subVectors(b, a);
    const len = Math.max(0.05, d.length());
    d.divideScalar(len);
    this.root.position.copy(a);
    this.root.quaternion.setFromUnitVectors(Z, d);
    this.root.updateMatrixWorld(true);
    this.LEN.value = len;
    this.GROW.value = grow;
    this.K.value = 1 - k;
    this.TIME.value = time;
    const reach = Math.min(len, grow);
    this.ringT -= dt;
    if (this.ringT <= 0 && k > 0.5) {
      this.ringT = 0.07;
      const r = this.rings.find((x) => !x.on);
      if (r) {
        r.on = true;
        r.u = 0.4;
        r.spin = Math.random() * Math.PI * 2;
      }
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      r.u += dt * 46;
      if (r.u > reach) {
        r.on = false;
        r.m.visible = false;
        continue;
      }
      r.spin += dt * 17;
      const s = (0.08 + 0.92 * smooth(r.u / this.TAPER.value)) * (1 - 0.75 * smooth((r.u - (reach - 4)) / 4)) * k;
      r.m.visible = s > 0.02;
      r.m.position.set(0, 0, r.u);
      r.m.rotation.set(0, 0, r.spin);
      r.m.scale.setScalar(s);
    }
    this.ringMat.opacity = 0.9 * k * (own ? 0.4 : 1);
    const on = wall && grow >= len - 0.01;
    this.hit.visible = on;
    if (on) {
      this.hit.position.set(0, 0, len - 0.08);
      const f = 0.85 + 0.15 * Math.sin(time * 31) + rnd() * 0.12;
      this.hitFlare.scale.setScalar(1.0 * f * k);
      this.hitRays.scale.setScalar(1.6 * (0.9 + 0.1 * Math.sin(time * 9)) * k);
      this.hitRays.material.rotation = -time * 2.4;
      if (this.shocks.length) {
        // (guadana5: más grande, el rayo nuevo es grueso)
        // (el propio: el impacto cae en la mira, más chico)
        this.hitFlare.scale.multiplyScalar((own ? 0.7 : 1.5) * ws);
        this.hitRays.scale.multiplyScalar((own ? 0.9 : 1.9) * ws);
        for (const S of this.shocks) {
          S.t = (S.t + dt * 2.6) % 1;
          S.m.visible = true;
          S.m.scale.setScalar((0.3 + 2.1 * S.t) * ws * k);
          S.m.rotation.z = S.t * 3 + time;
          S.m.material.opacity = (1 - S.t) * (1 - S.t) * k * (own ? 0.35 : 1);
        }
      }
    } else for (const S of this.shocks) S.m.visible = false;
    this.tip.visible = !!tip;
    if (tip) this.tip.scale.setScalar((0.55 + rnd() * 0.12) * k);
  }
}

// el resplandor del giro de la guadaña espectral (un disco)
let RING_TEX = null;
function ringTex() {
  if (RING_TEX) return RING_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  gr.addColorStop(0.84, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.93, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  RING_TEX = new THREE.CanvasTexture(c);
  return RING_TEX;
}

// (los tajos, las ondas de la Furia, las rajas del piso y los anillos de los estallidos)
const RIFTS = 24;
const FLY_TRAIL = 30;
const FLY_TRAIL_LIFE = 0.28;
// las partes de arriba del muerto partido (torso, cabeza, brazos, sombrero, ojos)
const UPPER = [1, 2, 3, 4, 5, 6, 13, 14, 15];
const SLICE_G = 15;

// ---------------- los sonidos: capas (v3) ----------------
// Para las recetas horneadas (bake): cada golpe se arma en capas. this es el
// audio del juego con el contexto de horneado (audio.bakeSound).
// Un salón de catedral: la respuesta de una sala grande (ruido que se apaga en
// secs), para la del Eclipse.
function hallIR(ctx, secs, decay = 3) {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(secs * sr));
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    // (las primeras reflexiones más claras; la cola, más oscura)
    lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.4 * k);
    d[i] = lp * Math.exp(-k * decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
  }
  return b;
}
// Lo que entra acá suena seco y además en la catedral (wet: cuánto).
function hall(self, o, secs = 2.4, wet = 0.5) {
  const c = self.ctx;
  const dry = c.createGain();
  const cv = c.createConvolver();
  cv.buffer = hallIR(c, secs);
  const wg = c.createGain();
  wg.gain.value = wet;
  dry.connect(o);
  dry.connect(cv).connect(wg).connect(o);
  return dry;
}
// El espacio que se rasga: una tela gruesa que se desgarra (ráfagas finitas de
// ruido en resonadores que saltan) y el barrido de abajo.
function tearL(self, o, t, { dur = 0.32, f0 = 420, f1 = 3200, gain = 0.6, n = 12 } = {}) {
  self.noise(o, { t, dur, type: 'bandpass', freq: f0, freqEnd: f1, q: 1.4, gain: gain * 0.7, attack: 0.012 });
  for (let i = 0; i < n; i++) {
    const tt = t + (i / n) * dur * 0.85 + Math.random() * 0.012;
    self.noise(o, { t: tt, dur: 0.03 + Math.random() * 0.03, type: 'bandpass', freq: 900 + Math.random() * 4200, q: 5 + Math.random() * 4, gain: gain * (0.55 - (i / n) * 0.35), attack: 0.002 });
  }
}
// El grave que cae (lo pesado del golpe).
function subL(self, o, t, { f0 = 95, f1 = 38, dur = 0.42, gain = 0.4 } = {}) {
  self.tone(o, { t, dur, type: 'sine', freq: f0, freqEnd: f1, gain, attack: 0.004 });
  self.tone(o, { t, dur: dur * 0.5, type: 'triangle', freq: f0 * 2, freqEnd: f1 * 2, gain: gain * 0.15, attack: 0.004 });
}
// Un acorde corto de cristal (campanitas que se apagan).
function crystalL(self, o, t, notes, { gain = 0.03, dur = 0.6, spread = 0.012 } = {}) {
  notes.forEach((f, i) => {
    self.tone(o, { t: t + i * spread, dur, type: 'sine', freq: f, gain, attack: 0.003 });
    self.tone(o, { t: t + i * spread, dur: dur * 0.7, type: 'sine', freq: f * 1.004, gain: gain * 0.6, attack: 0.003, detune: 7 });
    self.tone(o, { t: t + i * spread, dur: dur * 0.3, type: 'sine', freq: f * 2.76, gain: gain * 0.25, attack: 0.002 });
  });
}
// La campana de la ejecutora (parciales de campana, no armónicos).
function bellL(self, o, t, f, gain = 0.05, dur = 1.2) {
  for (const [k, g] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]) self.tone(o, { t, dur: dur / Math.sqrt(k), type: 'sine', freq: f * k, gain: gain * g, attack: 0.002 });
}
// Vidrio que revienta: muchos chasquidos altos esparcidos.
function shatterL(self, o, t, { n = 18, span = 0.5, gain = 0.3 } = {}) {
  for (let i = 0; i < n; i++) self.noise(o, { t: t + Math.random() * span * (i / n) + (i / n) * span * 0.3, dur: 0.02 + Math.random() * 0.04, type: 'highpass', freq: 3000 + Math.random() * 5000, gain: gain * (1 - (i / n) * 0.7), attack: 0.001 });
}

export default class DesgarradorFx {
  constructor(d) {
    this.d = d;
    this.g = d.g;
    this.root = new THREE.Group();
    this.root.name = 'desgarradorFx';
    this.sceneRef = null;
    // las grietas: todas armadas de entrada (cada una con sus uniformes; el
    // mismo programa), escondidas
    const rg = riftGeo();
    this.riftBase = shader(this.riftUniforms(), RIFT_VS, RIFT_FS, THREE.NormalBlending);
    this.rifts = [];
    for (let i = 0; i < RIFTS; i++) {
      const mat = this.riftBase.clone();
      mat.uniforms = this.riftUniforms();
      const m = prep(new THREE.Mesh(rg, mat), 6);
      m.visible = false;
      this.root.add(m);
      this.rifts.push({ m, U: mat.uniforms, on: false, t: 0, hits: new Map(), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), o: new THREE.Vector3() });
    }
    // la guadaña espectral: materiales de luz (sumados), los mismos para todas
    const T = cosmicMats('vm');
    const add = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, fog: false, ...o });
    this.specMats = [0, 1].map((up) => ({
      hoja: add({ color: new THREE.Color(0.32, 0.1, 0.62).multiplyScalar(up ? 1.25 : 1) }),
      cosmos: add({ map: T.nebula.map, color: new THREE.Color(1.1, 0.75, 1.5).multiplyScalar(up ? 1.3 : 1) }),
      // (la del Eclipse, con el filo de oro como la de verdad)
      filo: add({ color: up ? GOLD.clone().multiplyScalar(2.4) : VIOLET.clone().multiplyScalar(2.6) }),
      asta: add({ color: new THREE.Color(0.22, 0.08, 0.42) }),
      disc: add({ map: ringTex(), color: new THREE.Color(0.7, 0.35, 1).multiplyScalar(up ? 1.5 : 1.2) }),
    }));
    this.flyers = [];
    this.trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, fog: false });
    this.discGeo = new THREE.PlaneGeometry(2.1, 2.1);
    // el rayo de la Furia: uno propio y tres de compañeros, escondidos con los mates
    this.rigs = [];
    for (let i = 0; i < 4; i++) this.rigs.push(new Rig(d.w.warm));
    // los partidos al medio que están cayendo
    this.slices = [];
    // (v3) la del Eclipse: su luz (del pool: World.adoptLight; no es luz nueva
    // en la escena), las burbujas que frenan el tiempo y los pozos de gravedad
    this.light = new THREE.PointLight(0xb070ff, 0, 7, 2);
    this.light.userData.reflect = false;
    this.root.add(this.light);
    this.lightWorld = null;
    this.bubbleMat = shader({ uTime: { value: 0 }, uK: { value: 0 }, uCol: { value: new THREE.Color(0.62, 0.3, 1) } }, BUBBLE_VS, BUBBLE_FS);
    this.bubbleGeo = new THREE.SphereGeometry(1, 40, 24);
    this.bubbles = [];
    this.wells = [];
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    for (let i = 0; i < 3; i++) this.bubbles.push(this.newBubble());
    for (let i = 0; i < 2; i++) this.wells.push(this.newWell());
    // (v4) los agujeros negros chicos (cada tajo de la del Eclipse, la ruptura,
    // la succión del Cazador): núcleo negro, la cáscara que dobla la luz y el
    // disco que gira (violeta y oro)
    this.holeDisk = add({ map: ringTex(), color: new THREE.Color(0.75, 0.35, 1).multiplyScalar(0.75) });
    this.holeDiskGold = add({ map: ringTex(), color: new THREE.Color(1, 0.72, 0.3).multiplyScalar(0.7) });
    this.holeGeo = new THREE.PlaneGeometry(1, 1);
    this.holes = [];
    for (let i = 0; i < 5; i++) this.holes.push(this.newHole());
    this.baked = false;
  }

  newBubble() {
    const mat = this.bubbleMat.clone();
    mat.uniforms.uTime = this.bubbleMat.uniforms.uTime;
    const m = prep(new THREE.Mesh(this.bubbleGeo, mat), 7);
    m.visible = false;
    this.root.add(m);
    return { m, U: mat.uniforms, on: false, t: 0, life: 1, R: 1 };
  }

  newWell() {
    const core = prep(new THREE.Mesh(this.bubbleGeo, this.coreMat), 5);
    const mat = this.bubbleMat.clone();
    mat.uniforms.uTime = this.bubbleMat.uniforms.uTime;
    const shell = prep(new THREE.Mesh(this.bubbleGeo, mat), 7);
    core.visible = shell.visible = false;
    this.root.add(core, shell);
    return { core, shell, U: mat.uniforms, on: false, t: 0, p: new THREE.Vector3(), W: null, own: false, pal: 'base', ring: null };
  }

  newHole() {
    const core = prep(new THREE.Mesh(this.bubbleGeo, this.coreMat), 5);
    const mat = this.bubbleMat.clone();
    mat.uniforms.uTime = this.bubbleMat.uniforms.uTime;
    const shell = prep(new THREE.Mesh(this.bubbleGeo, mat), 7);
    const disk = prep(new THREE.Mesh(this.holeGeo, this.holeDisk), 6);
    const disk2 = prep(new THREE.Mesh(this.holeGeo, this.holeDiskGold), 6);
    const grp = new THREE.Group();
    grp.add(core, shell, disk, disk2);
    grp.visible = false;
    this.root.add(grp);
    return { grp, core, shell, disk, disk2, U: mat.uniforms, on: false, t: 0, life: 1, R: 0.5, p: new THREE.Vector3(), spin: 0, pal: 'base', gold: false };
  }

  // ---------------- el agujero negro (v4) ----------------
  // En p, de radio R, dura life s (se cierra de golpe al final: la implosión del
  // sonido 'desg-agujero' cae a los 0,9 s). gold: el disco de oro (la del Eclipse).
  // own: el propio (el sonido en la cabeza). sound: false si ya suena otro.
  hole(p, R = 0.55, life = 0.95, { pal = 'base', gold = true, own = false, sound = true } = {}) {
    this.attach();
    let h = this.holes.find((x) => !x.on);
    if (!h) h = this.holes.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    h.on = true;
    h.t = 0;
    h.life = Math.max(0.3, life);
    h.R = R;
    h.p.copy(p);
    h.pal = pal;
    h.gold = gold;
    h.spin = Math.random() * 6;
    h.grp.position.copy(p);
    h.grp.visible = true;
    h.disk2.visible = gold;
    // (guadana5: la cáscara de luz del agujero se veía como una pompa de jabón
    // -"burbujitas totalmente de más"-: solo el núcleo negro y el disco que
    // gira. globalThis.__mduDesgOldBubbles: vuelve)
    h.shell.visible = OLD_BUBBLES;
    h.U.uCol.value.setRGB(...(PAL[pal] || PAL.base).edge);
    this.g.fx.flash(p, pal === 'exec' ? 0xff60c0 : 0x9040ff, 5, 0.25, 8);
    // (guadana5: el nuevo, con cuerpo audible y más fuerte; el de la v4 se
    // tapaba. globalThis.__mduDesgOldHoleSnd: el de antes)
    if (sound) {
      if (globalThis.__mduDesgOldHoleSnd === true) this.play('desg-agujero', { pos: own ? null : p, gain: own ? 0.75 : 0.9 });
      else this.play('desg-agujero5', { pos: own ? null : p, gain: own ? 1 : 1.15 });
    }
    return h;
  }

  stepHole(h, dt) {
    const g = this.g;
    h.t += dt;
    const k = h.t / h.life;
    const open = smooth(h.t / 0.14);
    const close = k > 0.86 ? 1 - smooth((k - 0.86) / 0.14) : 1;
    // (cerca de la cámara se achica y se apaga: no tapa ni lava la pantalla)
    const cam = g.camera;
    const dc = cam ? h.p.distanceTo(cam.position) : 5;
    const nearK = Math.max(0.3, Math.min(1, (dc - 1.2) / 2.8));
    const s = Math.max(0.01, h.R * open * close * nearK * (1 + 0.05 * Math.sin(h.t * 37)));
    h.core.scale.setScalar(s);
    h.shell.scale.setScalar(s * 1.6);
    h.U.uK.value = 1.15 * close * nearK;
    // el disco: de cara a la cámara pero inclinado, girando
    if (cam) h.grp.lookAt(cam.position);
    h.spin += dt * 7;
    h.disk.rotation.set(1.05, 0, h.spin);
    h.disk2.rotation.set(1.05, 0, -h.spin * 1.4);
    h.disk.scale.setScalar(s * 3.4);
    h.disk2.scale.setScalar(s * 2.4);
    // lo que entra en espiral (guadana5: menos y más chicos: eran puntitos
    // redondos que se leían como burbujas)
    if (Math.random() < (OLD_BUBBLES ? 0.9 : 0.45)) {
      for (let i = 0; i < (OLD_BUBBLES ? 3 : 1); i++) {
        const a = Math.random() * Math.PI * 2;
        const r = h.R * (2.5 + Math.random() * 3);
        const x = h.p.x + Math.cos(a) * r;
        const z = h.p.z + Math.sin(a) * r;
        const y = h.p.y + rnd() * h.R * 2;
        const tt = 0.3;
        g.fx.add.spawn(x, y, z, (h.p.x - x) / tt - Math.sin(a) * 3, (h.p.y - y) / tt, (h.p.z - z) / tt + Math.cos(a) * 3, { color: i ? (PAL[h.pal] || PAL.base).dust[i % 3] : [1.3, 0.95, 0.45], size: 0.05, size1: 0, life: tt, drag: 0 });
      }
    }
    if (h.t >= h.life) {
      h.on = false;
      h.grp.visible = false;
      // se cierra: el destello de oro y las chispas que salen
      g.fx.flash(h.p, 0xffc070, 5, 0.18, 7);
      g.fx.sparkle(h.p, [1.2, 0.9, 0.5], 6, h.R);
      for (let i = 0; i < 12; i++) g.fx.add.spawn(h.p.x, h.p.y, h.p.z, rnd() * 6, rnd() * 6, rnd() * 6, { color: i % 2 ? [1.3, 0.95, 0.45] : (PAL[h.pal] || PAL.base).dust[1], size: 0.05, size1: 0, life: 0.3, drag: 4 });
    }
  }

  riftUniforms() {
    return {
      uKind: { value: 0 },
      uR: { value: 2.4 },
      uHalf: { value: 1 },
      uLen: { value: 4 },
      uLen2: { value: 4 },
      uW: { value: 0.3 },
      uOpen: { value: 0 },
      uK: { value: 1 },
      uFlip: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uOwn: { value: 0 },
      uEdge: { value: new THREE.Color(0.62, 0.3, 1) },
      uCore: { value: new THREE.Color(0.012, 0, 0.03) },
    };
  }

  // (el mapa se rearmó: lo nuestro pasa a la escena nueva)
  attach() {
    const sc = this.g.scene;
    if (sc && this.sceneRef !== sc) {
      this.sceneRef = sc;
      sc.add(this.root);
    }
    const W = this.g.world;
    if (W && this.lightWorld !== W) {
      this.lightWorld = W;
      W.adoptLight?.(this.light, 1.3);
    }
  }

  // Para la carga (Weapons.warmFx): una grieta, una guadaña espectral con su
  // estela y el rayo, dibujados de verdad (los programas no se compilan al
  // primer tajo). Copias que no quedan en ninguna lista.
  warm(grp) {
    const r = this.rifts[0];
    const m = new THREE.Mesh(r.m.geometry, r.m.material);
    m.frustumCulled = false;
    grp.add(m);
    for (const up of [0, 1]) {
      const fl = this.newFlyer(up, false);
      fl.group.visible = true;
      fl.trailMesh.geometry.setDrawRange(0, 6);
      grp.add(fl.group, fl.trailMesh);
    }
    const rig = new Rig(new THREE.Group());
    rig.root.removeFromParent();
    rig.set(tmpV.set(0, 0, 0), tmpV2.set(0, 0, -3), 1, 99, true, 0, 0.016, true);
    for (const x of rig.rings) x.m.visible = true;
    for (const x of rig.shocks) x.m.visible = true;
    grp.add(rig.root);
    // la de tamaño real (el muñeco de un compañero, la caja): sus materiales en el
    // mundo, con los rayos de la Furia a la vista (escondidos no se compilaban)
    for (const up of [0, 1]) {
      const big = desgarradorModel(up);
      big.scale.setScalar(0.3);
      big.position.x = up * 0.6;
      big.userData.cosmic.bolts.visible = true;
      grp.add(big);
    }
    grp.add(boltsWarmMesh(cosmicMats('vm')));
    // (y los de la mano, en el grupo escondido de los mates, si la partida
    // empezó en otro mapa: Weapons.prebuild solo los arma en Eclipse)
    this.d.prepare?.();
    // (v3) la burbuja del tiempo y el pozo (su cáscara y el núcleo negro)
    const b = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
    b.frustumCulled = false;
    grp.add(b, new THREE.Mesh(this.bubbleGeo, this.coreMat));
    // (v4) el disco del agujero negro, la hoja que sangra vacío y las esquirlas
    for (const m of [this.holeDisk, this.holeDiskGold]) grp.add(new THREE.Mesh(this.holeGeo, m));
    if (this.d.bleed) grp.add(this.d.bleed.warmMesh(), this.d.orbit.warmMesh());
    // (furia11) las chispas de concentrar la Furia (weapons/desgarradorFuria.js)
    if (this.d.gather) grp.add(this.d.gather.warmMesh());
  }

  // ---------------- las grietas ----------------
  // P: { o (centro), yaw, pitch, roll (o q, el giro entero), kind 'arc'|'line',
  // R, half, len, w, life, sweep (lo que tarda en abrirse), flip, pal
  // ('base'|'furia'|'exec'), own (lastima: Desgarrador.riftHits; y se aclara en
  // el medio de la pantalla), st (las stats del que tajeó), harm, frac / again
  // (cuánto pega y cada cuánto al mismo, si no las de st.rift), vel (se mueve:
  // las ondas de la Furia) con travel (hasta dónde), grow { to, time } (el
  // radio crece: los anillos de los estallidos) }
  rift(P) {
    this.attach();
    let r = this.rifts.find((x) => !x.on);
    if (!r) r = this.rifts.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    const U = r.U;
    const pal = PAL[P.pal] || PAL.base;
    r.on = true;
    r.t = 0;
    r.life = P.life ?? 1.5;
    r.sweep = P.sweep ?? 0.09;
    r.kind = P.kind || 'arc';
    r.R = P.R ?? 2.4;
    r.half = P.half ?? 1;
    r.len = P.len ?? 4;
    r.w = P.w ?? 0.3;
    r.own = !!P.own;
    r.pal = P.pal || 'base';
    r.harm = P.harm !== false && r.own;
    r.st = P.st || null;
    r.frac = P.frac;
    r.again = P.again;
    r.spec = P.spec || null;
    r.tickT = 0;
    r.hits.clear();
    r.o.copy(P.o);
    r.vel = P.vel ? (r.vel || new THREE.Vector3()).copy(P.vel) : null;
    r.travel = P.travel ?? Infinity;
    r.went = 0;
    r.R0 = r.R;
    r.grow = P.grow || null;
    r.m.position.copy(P.o);
    if (P.q) r.m.quaternion.copy(P.q);
    else r.m.rotation.set(P.pitch || 0, P.yaw || 0, P.roll || 0, 'YXZ');
    r.m.updateMatrixWorld(true);
    r.q.copy(r.m.quaternion);
    r.qi.copy(r.q).invert();
    r.m.visible = true;
    U.uKind.value = r.kind === 'line' ? 1 : 0;
    U.uR.value = r.R;
    U.uHalf.value = r.half;
    U.uLen.value = r.len;
    U.uLen2.value = r.kind === 'line' ? r.len : r.R * r.half * 2;
    U.uW.value = r.w;
    U.uOpen.value = 0;
    U.uK.value = 1;
    U.uFlip.value = P.flip ? 1 : 0;
    U.uSeed.value = Math.random() * 50;
    U.uOwn.value = P.own && P.fade !== false ? 1 : 0;
    U.uEdge.value.setRGB(...pal.edge);
    U.uCore.value.setRGB(...pal.core);
    r.swallow = !!P.swallow;
    r.fault = !!P.fault;
    // (v3) la del Eclipse: esquirlas de vidrio roto que quedan en el aire
    if (P.glass) {
      const g = this.g;
      for (let i = 0; i < P.glass; i++) {
        this.riftPoint(r, 0.08 + Math.random() * 0.84, rnd() * r.w * 3, tmpV);
        const c = Math.random() < 0.35 ? [1.2, 1.1, 1.3] : pal.edge;
        g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, rnd() * 0.25, rnd() * 0.15 + 0.03, rnd() * 0.25, { color: c, size: 0.035 + Math.random() * 0.03, size1: 0.01, life: r.life * (0.6 + Math.random() * 0.4), drag: 2.5 });
      }
    }
    return r;
  }

  stepRift(r, dt) {
    r.t += dt;
    const U = r.U;
    U.uTime.value = this.g.time;
    // la que vuela (la onda de la Furia): hasta su tope o la pared
    if (r.vel && r.went < r.travel) {
      const s = r.vel.length() * dt;
      r.went += s;
      r.o.addScaledVector(r.vel, dt);
      r.m.position.copy(r.o);
    }
    // la que crece (el anillo de un estallido)
    if (r.grow) {
      const k = smooth(r.t / r.grow.time);
      r.R = r.R0 + (r.grow.to - r.R0) * k;
      U.uR.value = r.R;
      U.uLen2.value = r.R * r.half * 2;
    }
    U.uOpen.value = Math.min(1.2, (r.t / r.sweep) * 1.2);
    // se cierra al final (el último cuarto), con un temblor
    const left = r.life - r.t;
    U.uK.value = left < 0.35 ? Math.max(0, left / 0.35) : Math.min(1, r.t / 0.05 + 0.4);
    // chispitas que se escapan del borde
    if (Math.random() < dt * 14) {
      const u = Math.random();
      this.riftPoint(r, u, (Math.random() < 0.5 ? 1 : -1) * r.w * 0.8, tmpV);
      const c = (PAL[r.pal] || PAL.base).edge;
      this.g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, rnd() * 0.6, 0.2 + Math.random() * 0.5, rnd() * 0.6, { color: c, size: 0.05, size1: 0, life: 0.4 + Math.random() * 0.3, drag: 1.5 });
    }
    // (la falla del Eclipse: brasas violetas que suben de la grieta del piso)
    if (r.fault && Math.random() < dt * 30) {
      this.riftPoint(r, Math.random(), rnd() * r.w, tmpV);
      const c = (PAL[r.pal] || PAL.base).dust[(Math.random() * 3) | 0];
      this.g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, rnd() * 0.3, 1 + Math.random() * 1.6, rnd() * 0.3, { color: c, size: 0.07, size1: 0, life: 0.7 + Math.random() * 0.5, drag: 0.8 });
    }
    if (r.harm) this.d.riftHits(r, dt);
    if (r.t >= r.life) {
      r.on = false;
      r.m.visible = false;
    }
  }

  // Un punto de la grieta (u a lo largo, y de lado), en el mundo.
  riftPoint(r, u, y, out) {
    if (r.kind === 'line') out.set((u - 0.5) * r.len, y, 0);
    else {
      const a = r.half - u * 2 * r.half;
      out.set(Math.sin(a) * r.R, y, -Math.cos(a) * r.R);
    }
    return out.applyQuaternion(r.q).add(r.o);
  }

  // ---------------- la guadaña espectral ----------------
  newFlyer(up, list = true) {
    const S = spectralGeos(up);
    const C = spectralCenter(up);
    const M = this.specMats[up ? 1 : 0];
    const group = new THREE.Group();
    const spin = new THREE.Group();
    group.add(spin);
    const body = new THREE.Group();
    // (el centro del giro: entre el eclipse y la mitad de la hoja)
    body.position.copy(C).negate();
    for (const [geo, mat, order] of [[S.hoja, M.hoja, 6], [S.asta, M.asta, 6], [S.cosmos, M.cosmos, 7], [S.filo, M.filo, 8], [S.corona, M.filo, 8]]) {
      const m = prep(new THREE.Mesh(geo, mat), order);
      body.add(m);
    }
    spin.add(body);
    const disc = prep(new THREE.Mesh(this.discGeo, M.disc), 5);
    group.add(disc);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLY_TRAIL * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FLY_TRAIL * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < FLY_TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    tg.setDrawRange(0, 0);
    const trail = prep(new THREE.Mesh(tg, this.trailMat), 6);
    group.visible = false;
    if (list) this.root.add(group, trail);
    const tipL = bladeEdge(0.99, new THREE.Vector3(), 0.5, up).sub(C);
    const midL = bladeEdge(0.5, new THREE.Vector3(), 0.5, up).sub(C);
    const fl = { group, spinG: spin, disc, trailMesh: trail, tipL, midL, on: false, up, pos: new THREE.Vector3(), prev: new THREE.Vector3(), o: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), trail: [], free: [] };
    if (list) this.flyers.push(fl);
    return fl;
  }

  // F: { id, own, up, o, f, r, R (lejos), A (de costado), T (segundos), st,
  // home(out): dónde está la hoja ahora, pal, onEnd, cfg: { pull: { radius,
  // speed }, burst: { radius, ... } } (el tirón y el estallido) }
  throwStart(F) {
    this.attach();
    const fl = this.flyers.find((x) => !x.on && x.up === !!F.up) || this.newFlyer(!!F.up);
    Object.assign(fl, { id: F.id, own: F.own, st: F.st, home: F.home, onEnd: F.onEnd, R: F.R, A: F.A, T: F.T, pal: F.pal || 'base', cfg: F.cfg || null, burst: false, orbited: false });
    fl.o.copy(F.o);
    fl.f.copy(F.f);
    fl.r.copy(F.r);
    fl.on = true;
    fl.done = false;
    fl.t = -(F.delay || 0);
    fl.welled = false;
    fl.mode = 'arc';
    fl.backV = 0;
    fl.ang = Math.random() * 6;
    fl.pos.copy(F.o);
    fl.prev.copy(F.o);
    fl.hits = new Set();
    fl.whoop = 0;
    fl.trail.length = 0;
    fl.group.visible = true;
    fl.group.position.copy(F.o);
    // el disco del giro: casi acostado, inclinado hacia el lado de la vuelta
    tmpV.copy(UP).addScaledVector(F.r, -0.38).normalize();
    fl.group.quaternion.setFromUnitVectors(Z, tmpV);
    return fl;
  }

  stepFlyer(fl, dt) {
    const g = this.g;
    fl.t += dt;
    // (las tres de la del Eclipse salen una atrás de la otra)
    if (fl.t < 0) {
      fl.group.visible = false;
      return;
    }
    fl.group.visible = true;
    if (fl.mode === 'fall') {
      this.stepFall(fl, dt);
      return;
    }
    fl.prev.copy(fl.pos);
    const home = fl.home(tmpV3);
    if (fl.mode === 'arc') {
      const u = Math.min(1, fl.t / fl.T);
      const fw = fl.R * Math.sin(Math.PI * u);
      const side = fl.A * (u < 0.25 ? 0 : smooth((u - 0.25) / 0.35)) * Math.sin(Math.PI * u) ** 0.7;
      const lift = 0.3 * Math.sin(Math.PI * u);
      const back = u < 0.5 ? 0 : (u - 0.5) / 0.5;
      const b = back * back * (3 - 2 * back);
      tmpV.copy(fl.o).lerp(home, b);
      fl.pos.copy(tmpV).addScaledVector(fl.f, fw * (1 - b * 0.15)).addScaledVector(fl.r, side).addScaledVector(UP, lift);
      // de ida, contra la pared rebota y vuelve derecho
      if (fl.own && u < 0.5) {
        tmpV2.subVectors(fl.pos, fl.prev);
        const len = tmpV2.length();
        if (len > 1e-4) {
          tmpV2.divideScalar(len);
          const t = g.world.raycast(fl.prev, tmpV2, len + 0.3, hitTmp);
          if (t < len + 0.3) {
            fl.pos.copy(fl.prev).addScaledVector(tmpV2, Math.max(0, t - 0.35));
            this.bounce(fl, hitTmp.normal);
            this.d.onBounce?.(fl);
          }
        }
      }
      if (u >= 1) fl.done = true;
      // (v4) las de los costados de la del Eclipse: en la punta se ponen a
      // orbitar el pozo (cortan todo lo que el pozo arrastra) y después vuelven
      const O = fl.cfg?.orbit;
      if (O && !fl.orbited && u >= 0.5) {
        fl.orbited = true;
        fl.mode = 'orbit';
        fl.orbT = O.time;
        fl.orbA = Math.atan2(fl.pos.z - O.c.z, fl.pos.x - O.c.x);
        fl.orbR = Math.max(2.5, Math.hypot(fl.pos.x - O.c.x, fl.pos.z - O.c.z));
        fl.orbR0 = fl.orbR;
        fl.orbY = fl.pos.y;
        fl.hits.clear?.();
      }
      // la del medio de la del Eclipse: en la punta se queda girando y abre el pozo
      if (fl.cfg?.well && !fl.welled && u >= 0.5) {
        fl.welled = true;
        fl.mode = 'hold';
        fl.holdT = fl.cfg.well.time;
        this.well(fl.pos.clone(), fl.cfg.well, fl.own, fl.pal);
      }
    } else if (fl.mode === 'orbit') {
      const O = fl.cfg.orbit;
      fl.orbT -= dt;
      const k = 1 - Math.max(0, fl.orbT) / O.time;
      fl.orbA += O.w * dt;
      fl.orbR = fl.orbR0 * (1 - 0.45 * k);
      fl.pos.set(O.c.x + Math.cos(fl.orbA) * fl.orbR, fl.orbY + Math.sin(fl.orbA * 2) * 0.25, O.c.z + Math.sin(fl.orbA) * fl.orbR);
      // (cada media vuelta puede volver a cortar al mismo)
      fl.orbCut = (fl.orbCut || 0) - dt;
      if (fl.orbCut <= 0) {
        fl.orbCut = Math.PI / Math.abs(O.w);
        fl.hits.clear?.();
      }
      if (fl.orbT <= 0) {
        fl.mode = 'back';
        fl.backV = 8;
      }
    } else if (fl.mode === 'hold') {
      fl.holdT -= dt;
      if (fl.holdT <= 0) {
        fl.mode = 'back';
        fl.backV = 6;
      }
    } else {
      fl.backV = Math.min(36, (fl.backV || 14) + dt * 44);
      tmpV.subVectors(home, fl.pos);
      const dd = tmpV.length();
      if (dd < fl.backV * dt + 0.05) {
        fl.pos.copy(home);
        fl.done = true;
      } else fl.pos.addScaledVector(tmpV.divideScalar(dd), fl.backV * dt);
    }
    if (fl.t > 0.35 && fl.mode !== 'hold' && fl.mode !== 'orbit' && fl.pos.distanceTo(home) < 0.9) fl.done = true;
    // de ida arrastra a los de alrededor (lo hace el anfitrión: él mueve a los
    // muertos; también con la de un compañero) y en la vuelta, revienta
    if (fl.cfg?.pull && fl.mode === 'arc' && fl.t < fl.T * 0.5 && (!g.net || g.net.host)) this.pull(fl, dt);
    if (!fl.burst && fl.cfg?.burst && (fl.mode === 'back' || fl.t >= fl.T * 0.5)) {
      fl.burst = true;
      this.nova(fl.pos, fl.cfg.burst.radius, { pal: fl.pal, h: fl.pos.y - (this.g.world.floorAt(fl.pos.x, fl.pos.z, fl.pos.y + 0.5) || 0), w: 0.22, big: 0.9 });
      if (fl.own) this.d.novaHits(fl.pos.clone(), fl.cfg.burst, 'guadaña');
    }
    fl.group.position.copy(fl.pos);
    fl.ang += dt * (fl.up ? 25 : 22) * (fl.mode === 'hold' || fl.mode === 'orbit' ? 1.8 : 1);
    fl.spinG.rotation.z = fl.ang;
    // (sale chica de la hoja y crece; vuelve achicándose)
    const grow = Math.min(1, 0.35 + fl.t * 5) * (fl.mode === 'back' ? Math.max(0.45, Math.min(1, fl.pos.distanceTo(home) / 2.5)) : 1) * (fl.up ? 1.35 : 1);
    fl.spinG.scale.setScalar(grow);
    fl.disc.scale.setScalar(grow);
    fl.group.updateMatrixWorld(true);
    const s = fl.free.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
    s.a.copy(fl.tipL).applyMatrix4(fl.spinG.matrixWorld);
    s.b.copy(fl.midL).applyMatrix4(fl.spinG.matrixWorld);
    s.age = 0;
    fl.trail.unshift(s);
    if (fl.trail.length > FLY_TRAIL) fl.free.push(fl.trail.pop());
    fl.whoop -= dt;
    if (fl.whoop <= 0) {
      fl.whoop = 0.13;
      this.play('desg-whoop', { pos: fl.pos, gain: 0.5, rate: fl.up ? 1.1 : 1 });
    }
    // polvo de estrellas que suelta la punta
    if (Math.random() < 0.85) {
      const a = fl.trail[0].a;
      const c = (PAL[fl.pal] || PAL.base).dust[(Math.random() * 3) | 0];
      g.fx.add.spawn(a.x, a.y, a.z, rnd() * 0.6, Math.random() * 0.5, rnd() * 0.6, { color: c, size: 0.05, size1: 0, life: 0.45, drag: 1 });
    }
    if (fl.own) this.d.flyHits(fl);
  }

  bounce(fl, n) {
    const g = this.g;
    fl.mode = 'back';
    fl.backV = 12;
    g.fx.sparks(fl.pos, 1.2, n || { x: 0, y: 1, z: 0 }, [0.8, 0.5, 1]);
    g.fx.flash(fl.pos, 0xb070ff, 4, 0.08, 4);
    this.play('desg-corte', { pos: fl.pos, gain: 0.6, rate: 1.4 });
  }

  drawTrail(fl, dt) {
    const pts = fl.trail;
    for (const s of pts) s.age += dt;
    while (pts.length && pts[pts.length - 1].age > FLY_TRAIL_LIFE) fl.free.push(pts.pop());
    const tg = fl.trailMesh.geometry;
    if (pts.length < 2) {
      tg.setDrawRange(0, 0);
      return;
    }
    const P = tg.attributes.position.array;
    const C = tg.attributes.color.array;
    const e = (PAL[fl.pal] || PAL.base).edge;
    const k = fl.up ? 1.4 : 1.1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = Math.max(0, 1 - p.age / FLY_TRAIL_LIFE) ** 1.4 * k;
      P.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      C.set([e[0] * f, e[1] * f, e[2] * f, e[0] * f * 0.08, e[1] * f * 0.08, e[2] * f * 0.08], i * 6);
    }
    tg.setDrawRange(0, (pts.length - 1) * 6);
    tg.attributes.position.needsUpdate = true;
    tg.attributes.color.needsUpdate = true;
  }

  endFlyer(fl) {
    fl.on = false;
    fl.done = false;
    fl.group.visible = false;
    fl.trail.length = 0;
    fl.trailMesh.geometry.setDrawRange(0, 0);
  }

  // ---------------- el rayo ----------------
  rig() {
    const r = this.rigs.find((x) => !x.busy);
    if (r) r.take(this.g.scene);
    return r || null;
  }

  // El muerto que toca el rayo: se hace polvo violeta que sube (como el de oro
  // de la hoz, weapons/hozBeam.js dust).
  dust(z, n, pal = 'furia') {
    const g = this.g;
    const D = (PAL[pal] || PAL.furia).dust;
    const y0 = z.pos.y || 0;
    const sc = z.scale || 1;
    if (!z.mats || z.dog) {
      for (let i = 0; i < 14; i++) g.fx.add.spawn(z.pos.x + rnd() * 0.5, y0 + 0.3 + Math.random() * 0.6 * sc, z.pos.z + rnd() * 0.5, rnd() * 0.6, 0.6 + Math.random() * 1.6, rnd() * 0.6, { color: D[i % 3], size: 0.09, size1: 0, life: 0.8 + Math.random() * 0.6, gravity: -1.5, drag: 0.6 });
      return;
    }
    for (let k = 0; k < PART_COUNT; k++) {
      if (z.hidden & (1 << k)) continue;
      const e = z.mats[k]?.elements;
      if (!e) continue;
      const px = e[12];
      const py = e[13];
      const pz = e[14];
      if (!Number.isFinite(px + py + pz) || (px === 0 && py === 0 && pz === 0)) continue;
      const h = Math.max(0, py - y0);
      g.fx.add.spawn(px, py, pz, 0, 0.1, 0, { color: D[0], size: 0.17 * sc, size1: 0.05 * sc, life: 0.28 + h * 0.05, drag: 4 });
      for (let i = 0; i < n; i++) {
        const jx = rnd() * 0.2 * sc;
        const jz = rnd() * 0.2 * sc;
        g.fx.add.spawn(px + jx, py + rnd() * 0.2 * sc, pz + jz, jx, 0.1 + Math.random() * 0.3, jz, { color: D[(i + k) % 3], size: 0.045 + Math.random() * 0.035, size1: 0, life: 0.9 + h * 0.25 + Math.random() * 0.5, gravity: -(1.6 + h * 1.2), drag: 0.4 });
      }
    }
  }

  // Donde pega el rayo: chispas y la luz (de a ratos).
  impact(at, normal, dt, own) {
    const g = this.g;
    const nrm = normal || { x: 0, y: 1, z: 0 };
    this.impT = (this.impT || 0) - dt;
    if (this.impT > 0) return;
    this.impT = 0.05;
    g.fx.sparks(at, own ? 1.4 : 1, nrm, [0.85, 0.5, 1]);
    for (let i = 0; i < 4; i++) g.fx.add.spawn(at.x, at.y, at.z, nrm.x * 2 + rnd() * 5, nrm.y * 2 + Math.random() * 3.5, nrm.z * 2 + rnd() * 5, { color: PAL.furia.dust[i % 3], size: 0.07, size1: 0, life: 0.5 + Math.random() * 0.5, gravity: 7, drag: 1, bounce: 0.4 });
    g.fx.flash(at, 0xb050ff, own ? 3.5 : 2.5, 0.14, 8);
  }

  motes(a, b, len, dt, rate) {
    const g = this.g;
    this.moteAcc = (this.moteAcc || 0) + dt * 70 * rate * Math.min(1, len / 10);
    const n = Math.floor(this.moteAcc);
    this.moteAcc -= n;
    const d = tmpV2.subVectors(b, a).divideScalar(Math.max(0.01, len));
    for (let i = 0; i < n; i++) {
      const u = 1.6 + Math.random() * Math.max(0, len - 1.6);
      g.fx.add.spawn(a.x + d.x * u + rnd() * 0.3, a.y + d.y * u + rnd() * 0.3, a.z + d.z * u + rnd() * 0.3, rnd() * 0.8, 0.2 + Math.random() * 0.7, rnd() * 0.8, { color: PAL.furia.dust[(Math.random() * 3) | 0], size: 0.05 + Math.random() * 0.04, size1: 0, life: 0.5 + Math.random() * 0.5, gravity: -0.4, drag: 1.2 });
    }
  }

  // ---------------- partido al medio ----------------
  // (Zombies.kill con info.type 'slice' en el anfitrión; Zombies.applyRemote
  // cuando llega el estado 'sliced' al invitado.) dir: hacia dónde iba el corte
  // (la mitad de arriba sale para ese lado); sin dir, para atrás del muerto.
  slice(z, dir) {
    const g = this.g;
    // (v3) tragado por una grieta: z.swallowAt lo puso el que pegó (o llegó por 'desg' w)
    const W = z.swallowAt;
    if (W && g.time - W.t < 1.5 && globalThis.__mduNoSwallow !== true) {
      this.swallow(z, W.p, W.dur);
      return;
    }
    let dx = dir?.x || 0;
    let dz = dir?.z || 0;
    // (el invitado: el que cortó fue él hace un ratito)
    if (!(dx || dz) && z.sliceDir && g.time - z.sliceDir.t < 2) {
      dx = z.sliceDir.x;
      dz = z.sliceDir.z;
    }
    if (!(dx || dz)) {
      dx = -Math.sin(z.yaw || 0);
      dz = -Math.cos(z.yaw || 0);
    }
    const l = Math.hypot(dx, dz) || 1;
    const S = z.slice || (z.slice = { piv: new THREE.Vector3(), off: new THREE.Vector3(), dir: new THREE.Vector3(), axis: new THREE.Vector3(), v: new THREE.Vector3(), snap: UPPER.map(() => new THREE.Matrix4()) });
    S.t0 = g.time;
    S.ready = false;
    S.dir.set(dx / l, 0, dz / l);
    // un poco al costado, que no caigan todos igual
    S.dir.applyAxisAngle(UP, rnd() * 0.7);
    S.axis.crossVectors(UP, S.dir).normalize();
    S.spd = 1.7 + Math.random() * 1.2;
    S.up = 2.6 + Math.random() * 1.2;
    S.blood = 1.1;
    S.swallow = null;
    if (!this.slices.includes(z)) this.slices.push(z);
    // el corte: un tajo de grieta a la altura de la cintura y el ruido
    const y = (z.baseY ?? z.pos.y ?? 0) + 0.98 * (z.scale || 1);
    this.rift({ o: tmpV.set(z.pos.x, y, z.pos.z), yaw: Math.atan2(-S.axis.z, S.axis.x), kind: 'line', len: 1.0 * (z.scale || 1), w: 0.07, life: 0.55, sweep: 0.06, pal: this.d.pal(), own: false });
    this.play('desg-corte', { pos: tmpV, gain: 0.9 });
    g.audio.squish?.(tmpV);
    g.fx.sparkle?.(tmpV, PAL.base.dust[1], 6, 0.5);
  }

  // Después de armar la pose del muerto (Zombies.render): la mitad de arriba
  // va aparte, como un cuerpo suelto que vuela, gira y cae acostado.
  sliceMats(z) {
    const S = z.slice;
    if (!S || z.state !== 'sliced') {
      z.slice = null;
      return;
    }
    const g = this.g;
    const mats = z.mats;
    if (S.swallow) {
      this.swallowMats(z, S);
      return;
    }
    if (!S.ready) {
      S.ready = true;
      for (let i = 0; i < UPPER.length; i++) S.snap[i].copy(mats[UPPER[i]]);
      // el corte: entre la cadera y el torso
      S.piv.setFromMatrixPosition(mats[0]).add(tmpV.setFromMatrixPosition(mats[1])).multiplyScalar(0.5);
      const floor = (z.baseY ?? 0) + 0.15 * (z.scale || 1);
      const h = Math.max(0, S.piv.y - floor);
      S.tl = (S.up + Math.sqrt(S.up * S.up + 2 * SLICE_G * h)) / SLICE_G;
      // gira hasta quedar acostado: un cuarto de vuelta (y una más si vuela alto)
      S.turn = Math.PI / 2 + (S.tl > 0.62 ? Math.PI * 2 : 0);
    }
    const el = (g.time - S.t0) * (this.d.dbgRate || 1);
    const t = Math.min(S.tl, el);
    S.off.copy(S.dir).multiplyScalar(S.spd * t);
    S.off.y = S.up * t - 0.5 * SLICE_G * t * t;
    // (al tocar el piso se arrastra un poquito)
    const after = Math.max(0, el - S.tl);
    if (after > 0) S.off.addScaledVector(S.dir, 0.35 * (1 - Math.exp(-after * 9)));
    // se hunde con el resto del muerto (Zombies 'dead': después de 9 s)
    if ((z.corpseT || 0) > 9) S.off.y -= Math.min(1.2, (z.corpseT - 9) * 0.8);
    const ang = S.turn * (t / S.tl);
    tmpQ.setFromAxisAngle(S.axis, ang);
    tmpM.makeTranslation(-S.piv.x, -S.piv.y, -S.piv.z);
    tmpM2.makeRotationFromQuaternion(tmpQ).premultiply(tmpM3.makeTranslation(S.piv.x + S.off.x, S.piv.y + S.off.y, S.piv.z + S.off.z));
    tmpM2.multiply(tmpM);
    for (let i = 0; i < UPPER.length; i++) mats[UPPER[i]].multiplyMatrices(tmpM2, S.snap[i]);
    // (todavía en el aire: que el muerto no quede quieto: Zombies 'static')
    if (el < S.tl + 0.4) z.solvedOnce = false;
  }

  // La sangre de los dos cortes (un ratito) y los que ya no están partidos.
  stepSlices(dt) {
    const g = this.g;
    for (let i = this.slices.length - 1; i >= 0; i--) {
      const z = this.slices[i];
      const S = z.slice;
      if (!S || z.state !== 'sliced' || !z.active) {
        this.slices.splice(i, 1);
        continue;
      }
      if (S.swallow) {
        this.stepSwallow(z, S, dt);
        continue;
      }
      if (S.blood <= 0 || !S.ready) continue;
      S.blood -= dt;
      if (Math.random() < 0.7) {
        // de las piernas (sube) y de la mitad de arriba (sale para abajo del torso)
        tmpV.setFromMatrixPosition(z.mats[0]);
        tmpV.y += 0.12;
        g.fx.blood(tmpV, { x: rnd() * 0.5, y: 1.6, z: rnd() * 0.5 }, 2, 0.7);
        tmpV.copy(S.piv).add(S.off);
        g.fx.blood(tmpV, { x: -S.dir.x * 0.6 + rnd() * 0.4, y: -0.3, z: -S.dir.z * 0.6 + rnd() * 0.4 }, 2, 0.7);
      }
    }
  }

  // ---------------- tragado por la grieta (v3) ----------------
  // El muerto se estira hacia el punto p (la grieta, el pozo, la mano del
  // Cazador) y se mete adentro achicándose y retorciéndose, con luz violeta;
  // en dur s ya no está. Va por el estado 'sliced' (viaja en línea); si el
  // estado llegó antes que el aviso 'w', se pasa a tragado ahí.
  swallow(z, p, dur = 0.55) {
    const g = this.g;
    const S = z.slice || (z.slice = { piv: new THREE.Vector3(), off: new THREE.Vector3(), dir: new THREE.Vector3(), axis: new THREE.Vector3(), v: new THREE.Vector3(), snap: UPPER.map(() => new THREE.Matrix4()) });
    const sw = (S.swallow ||= { p: new THREE.Vector3(), a: new THREE.Vector3(), c: new THREE.Vector3(), snap: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()), dur: 0.55, spin: 1, done: false });
    S.t0 = g.time;
    S.ready = false;
    S.blood = 0;
    sw.p.copy(p);
    sw.dur = Math.max(0.2, dur || 0.55);
    sw.spin = Math.random() < 0.5 ? -1 : 1;
    sw.done = false;
    if (!this.slices.includes(z)) this.slices.push(z);
    tmpV.set(z.pos.x, (z.baseY ?? z.pos.y ?? 0) + 1.1 * (z.scale || 1), z.pos.z);
    g.fx.flash(tmpV.lerp(p, 0.5), 0xa050ff, 3.5, 0.22, 6);
    // (v4) suena a agujero negro, y no más de uno cada 0,1 s (se traga a muchos
    // de una: antes sonaban todos encimados). globalThis.__mduDesgOldTrago: el de antes
    if (globalThis.__mduDesgOldTrago === true) this.play('desg-trago', { pos: p, gain: 0.8, rate: 0.9 + Math.random() * 0.2 });
    else if (g.time - (this.tragoT ?? -9) > 0.1) {
      this.tragoT = g.time;
      this.play('desg-trago4', { pos: p, gain: 0.75, rate: 0.92 + Math.random() * 0.16 });
    }
  }

  swallowMats(z, S) {
    const g = this.g;
    const mats = z.mats;
    const W = S.swallow;
    if (!S.ready) {
      S.ready = true;
      for (let i = 0; i < PART_COUNT; i++) W.snap[i].copy(mats[i]);
      W.c.setFromMatrixPosition(mats[1]);
      W.a.subVectors(W.c, W.p);
      if (W.a.lengthSq() < 1e-4) W.a.set(0, 1, 0);
      W.a.normalize();
    }
    const el = (g.time - S.t0) * (this.d.dbgRate || 1);
    const k = Math.min(1, el / W.dur);
    // (entra cada vez más rápido: el agujero tira)
    const e = k * k * (1.6 - 0.6 * k);
    const a = W.a;
    const p = W.p;
    if (k >= 1) {
      // adentro: todas las piezas en un punto (no se ven)
      for (let i = 0; i < PART_COUNT; i++) mats[i].makeScale(1e-4, 1e-4, 1e-4).setPosition(p);
      return;
    }
    // se estira hacia la grieta (a lo largo de a) y se afina de costado, retorciéndose
    const ka = (1 - e) * (1 + 1.7 * Math.sin(Math.PI * Math.min(1, e * 1.15)));
    const kp = (1 - e) ** 1.8;
    const th = e * 5 * W.spin;
    const c = Math.cos(th) * kp;
    const sn = Math.sin(th) * kp;
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const L = (i, j, ai, aj, x) => ka * ai * aj + c * ((i === j ? 1 : 0) - ai * aj) + sn * x;
    const A = [ax, ay, az];
    // [a]x: la parte que gira alrededor de a
    const X = [
      [0, -az, ay],
      [az, 0, -ax],
      [-ay, ax, 0],
    ];
    const m = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.push(L(i, j, A[i], A[j], X[i][j]));
    // T(p) · L · T(-p)
    const tx = p.x - (m[0] * p.x + m[1] * p.y + m[2] * p.z);
    const ty = p.y - (m[3] * p.x + m[4] * p.y + m[5] * p.z);
    const tz = p.z - (m[6] * p.x + m[7] * p.y + m[8] * p.z);
    tmpM.set(m[0], m[1], m[2], tx, m[3], m[4], m[5], ty, m[6], m[7], m[8], tz, 0, 0, 0, 1);
    for (let i = 0; i < PART_COUNT; i++) mats[i].multiplyMatrices(tmpM, W.snap[i]);
    z.solvedOnce = false;
  }

  // Mientras se lo traga: chispas violetas que entran al agujero; al final, el destello.
  stepSwallow(z, S, dt) {
    const g = this.g;
    const W = S.swallow;
    if (!S.ready || W.done) return;
    const el = (g.time - S.t0) * (this.d.dbgRate || 1);
    const k = el / W.dur;
    if (k >= 1) {
      W.done = true;
      g.fx.flash(W.p, 0xc070ff, 4, 0.16, 5);
      g.fx.sparkle(W.p, [0.9, 0.6, 1], 8, 0.4);
      for (let i = 0; i < 10; i++) g.fx.add.spawn(W.p.x, W.p.y, W.p.z, rnd() * 4, rnd() * 4, rnd() * 4, { color: PAL.furia.dust[i % 3], size: 0.06, size1: 0, life: 0.35, drag: 4 });
      return;
    }
    if (Math.random() < 0.8) {
      const part = (Math.random() * PART_COUNT) | 0;
      if (z.mats[part]) {
        tmpV.setFromMatrixPosition(z.mats[part]);
        const vx = (W.p.x - tmpV.x) * 3;
        const vy = (W.p.y - tmpV.y) * 3;
        const vz = (W.p.z - tmpV.z) * 3;
        g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, vx, vy, vz, { color: PAL.base.dust[(Math.random() * 3) | 0], size: 0.06, size1: 0, life: 0.3, drag: 0 });
      }
    }
  }

  // Avisos 'w' de otro jugador (o del propio en otra compu): a estos se los traga p.
  swallowIds(ids, p, dur) {
    const g = this.g;
    for (const id of ids) {
      const z = g.net?.findZombie?.(id);
      if (!z || !z.active) continue;
      z.swallowAt = { p: p.clone(), t: g.time, dur };
      // (ya estaba cayendo partido: pasa a tragado)
      if (z.state === 'sliced' && z.slice && !z.slice.swallow && g.time - z.slice.t0 < 0.6) this.swallow(z, p, dur);
    }
  }

  // ---------------- la nube rosa (la ejecutora) ----------------
  cloud(p) {
    const g = this.g;
    const D = PAL.exec.dust;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      g.fx.alpha.spawn(p.x + Math.cos(a) * r, p.y + rnd() * 0.8, p.z + Math.sin(a) * r, Math.cos(a) * (1.5 + Math.random() * 2), rnd() * 1.2, Math.sin(a) * (1.5 + Math.random() * 2), { color: D[i % 3], size: 0.45, size1: 1.15, life: 0.7 + Math.random() * 0.4, alpha: 0.28, drag: 3 });
    }
    for (let i = 0; i < 18; i++) g.fx.add.spawn(p.x, p.y, p.z, rnd() * 6, rnd() * 4 + 1, rnd() * 6, { color: D[(i + 1) % 3], size: 0.07, size1: 0, life: 0.6 + Math.random() * 0.3, drag: 2 });
    g.fx.flash(p, 0xff60c0, 3, 0.18, 7);
    this.play('desg-rosa', { pos: p, gain: 0.8, rate: 0.9 + Math.random() * 0.2 });
  }

  // ---------------- la embestida ----------------
  // La raja larga en el piso por donde pasó (la propia lastima al que la pisa:
  // cfg.crack), la estela de polvo de estrellas y, al final, el estallido.
  dashFx(a, b, pal, own, cfg = null, st = null) {
    const g = this.g;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.4) return;
    const mid = tmpV.addVectors(a, b).multiplyScalar(0.5);
    mid.y += 0.05;
    // acostada en el piso (y con la pendiente de las gradas)
    const X = tmpV2.subVectors(b, a).normalize();
    const Y = tmpV3.crossVectors(UP, X).normalize();
    const Zb = _z.crossVectors(X, Y);
    tmpQ.setFromRotationMatrix(tmpM.makeBasis(X, Y, Zb));
    const C = cfg?.crack || { life: 2.2, frac: 0.5 };
    this.rift({ o: mid, q: tmpQ, kind: 'line', len: len + 0.8, w: C.w || 0.13, life: C.life, sweep: C.fault ? 0.3 : 0.14, pal, own, st, frac: C.frac, again: 0.5, fade: false, swallow: !!C.fault, fault: !!C.fault });
    // (v3) la falla del Eclipse: el piso partido, piedras que saltan y polvo
    if (C.fault) {
      const g = this.g;
      for (let i = 0; i < 46; i++) {
        const u = Math.random();
        const x = a.x + (b.x - a.x) * u + rnd() * 0.5;
        const z = a.z + (b.z - a.z) * u + rnd() * 0.5;
        const y = a.y + (b.y - a.y) * u + 0.05;
        g.fx.alpha.spawn(x, y, z, rnd() * 1.5, 2 + Math.random() * 3.5, rnd() * 1.5, { color: [0.3, 0.26, 0.24], size: 0.12 + Math.random() * 0.12, size1: 0.05, life: 0.9 + Math.random() * 0.5, alpha: 0.9, gravity: 9, drag: 0.4 });
        if (i % 2) g.fx.alpha.spawn(x, y, z, rnd() * 2, 0.4 + Math.random(), rnd() * 2, { color: [0.36, 0.32, 0.3], size: 0.5, size1: 1.6, life: 1 + Math.random() * 0.6, alpha: 0.4, drag: 2 });
      }
      this.play('desg-falla', { pos: own ? null : mid, gain: 1 });
    }
    const D = (PAL[pal] || PAL.base).dust;
    for (let i = 0; i < 40; i++) {
      const u = Math.random();
      g.fx.add.spawn(a.x + (b.x - a.x) * u + rnd() * 0.5, Math.min(a.y, b.y) + 0.3 + Math.random() * 1.5, a.z + (b.z - a.z) * u + rnd() * 0.5, rnd() * 0.5, Math.random() * 0.6, rnd() * 0.5, { color: D[i % 3], size: 0.05 + Math.random() * 0.03, size1: 0, life: 0.5 + Math.random() * 0.5, drag: 1.2 });
    }
    this.dashStreaks(a, b, pal);
    // (el estallido del final: el daño lo pone el que embistió, Desgarrador.stepDash)
    this.nova(b, cfg?.burst?.radius || 3.4, { pal, dust: true, big: globalThis.__mduNoDesgFx4 === true ? 1 : 1.3 });
    if (!own) this.play('desg-embestida', { pos: b, gain: 0.9 });
  }

  // ---------------- los estallidos ----------------
  // Un anillo de desgarro que crece a ras del piso desde p hasta R (una pared
  // finita de luz), chispas para todos lados, polvo (dust), una luz del pool y
  // el sacudón de cámara según lo cerca que esté el jugador. Solo se ve: el
  // daño va aparte (Desgarrador.novaHits).
  nova(p, R, { pal = 'base', life = 0.55, h = 0.4, w = 0.24, dust = false, big = 1, sound = true } = {}) {
    const g = this.g;
    const fy0 = g.world.floorAt(p.x, p.z, p.y + 0.5);
    const fy = Number.isFinite(fy0) && fy0 > p.y - 3 ? fy0 : p.y;
    const at = _n1.set(p.x, fy, p.z);
    this.rift({ o: tmpV.set(p.x, fy + h, p.z), yaw: 0, kind: 'arc', half: Math.PI, R: 0.35, grow: { to: R, time: life * 0.6 }, w, life, sweep: 0.01, pal, own: false });
    const D = (PAL[pal] || PAL.base).dust;
    const n = Math.round(36 * big);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 7;
      g.fx.add.spawn(at.x + Math.cos(a) * 0.3, at.y + h * 0.5 + Math.random() * 1.2, at.z + Math.sin(a) * 0.3, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, { color: D[i % 3], size: 0.06, size1: 0, life: 0.45 + Math.random() * 0.25, drag: 3 });
    }
    if (dust) {
      for (let i = 0; i < 18 * big; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 3.5;
        g.fx.alpha.spawn(at.x + Math.cos(a) * 0.4, at.y + 0.15, at.z + Math.sin(a) * 0.4, Math.cos(a) * s, 0.3 + Math.random() * 0.8, Math.sin(a) * s, { color: [0.34, 0.3, 0.27], size: 0.45, size1: 1.5, life: 0.9 + Math.random() * 0.4, alpha: 0.45, drag: 2.6 });
      }
    }
    g.fx.flash(_n2.set(at.x, at.y + 1, at.z), pal === 'exec' ? 0xff60c0 : 0xa050ff, 6 * big, 0.25, 8 * big);
    const P = g.player?.pos;
    if (P) g.fx.addShake(Math.max(0, 0.3 * big * (1 - P.distanceTo(at) / 14)));
    if (sound) this.play('desg-estallido', { pos: at, gain: 0.9 * big, rate: 0.9 + Math.random() * 0.2 });
  }

  // ---------------- v4: un escalón más de peso y lectura ----------------
  // (globalThis.__mduNoDesgFx4: como en la v3)
  // El corte en el muerto: una raja finita que lo cruza (se lee dónde pegó),
  // un soplo de vacío y chispas para el lado del tajo.
  cutMark(p, dir, pal = 'base') {
    if (globalThis.__mduNoDesgFx4 === true) return;
    const g = this.g;
    const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    this.rift({ o: p, yaw, roll: (Math.random() - 0.5) * 0.9, kind: 'line', len: 1.15, w: 0.05, life: 0.42, sweep: 0.03, pal, own: false });
    for (let i = 0; i < 4; i++) g.fx.alpha.spawn(p.x + rnd() * 0.3, p.y + rnd() * 0.4, p.z + rnd() * 0.3, dir.x * 1.5 + rnd(), 0.3 + Math.random() * 0.5, dir.z * 1.5 + rnd(), { color: [0.03, 0.0, 0.06], size: 0.18, size1: 0.5, life: 0.45, alpha: 0.55, drag: 2 });
    const D = (PAL[pal] || PAL.base).dust;
    for (let i = 0; i < 8; i++) g.fx.add.spawn(p.x, p.y, p.z, dir.x * (3 + Math.random() * 4) + rnd() * 2, Math.random() * 2.5, dir.z * (3 + Math.random() * 4) + rnd() * 2, { color: i % 3 ? D[i % 3] : [1.3, 1.1, 1.3], size: 0.045, size1: 0, life: 0.3 + Math.random() * 0.2, drag: 2.5 });
  }

  // La espectral sale: el destello en la mano y un abanico de chispas adelante.
  launchFx(o, f, pal = 'base', up = false) {
    if (globalThis.__mduNoDesgFx4 === true) return;
    const g = this.g;
    g.fx.flash(o, up ? 0xffc060 : 0xa050ff, 5, 0.16, 6);
    const D = (PAL[pal] || PAL.base).dust;
    for (let i = 0; i < 18; i++) {
      const s = 5 + Math.random() * 7;
      g.fx.add.spawn(o.x, o.y, o.z, f.x * s + rnd() * 3, f.y * s + rnd() * 2, f.z * s + rnd() * 3, { color: up && i % 3 === 0 ? [1.3, 0.95, 0.45] : D[i % 3], size: 0.05, size1: 0, life: 0.3 + Math.random() * 0.2, drag: 3 });
    }
  }

  // La embestida deja el aire rajado: estelas largas a lo largo del camino.
  dashStreaks(a, b, pal = 'base') {
    if (globalThis.__mduNoDesgFx4 === true) return;
    const g = this.g;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const D = (PAL[pal] || PAL.base).dust;
    for (let i = 0; i < 36; i++) {
      const u = Math.random();
      const s = 8 + Math.random() * 10;
      g.fx.add.spawn(a.x + dx * u + rnd() * 1.2, Math.min(a.y, b.y) + 0.4 + Math.random() * 1.4, a.z + dz * u + rnd() * 1.2, (dx / len) * s, 0, (dz / len) * s, { color: D[i % 3], size: 0.035, size1: 0.01, life: 0.18 + Math.random() * 0.12, drag: 5 });
    }
    for (let i = 0; i < 10; i++) g.fx.alpha.spawn(a.x + rnd() * 0.6, a.y + 0.1, a.z + rnd() * 0.6, rnd() * 3 - (dx / len) * 2, 0.3 + Math.random() * 0.6, rnd() * 3 - (dz / len) * 2, { color: [0.34, 0.3, 0.27], size: 0.4, size1: 1.2, life: 0.8, alpha: 0.4, drag: 2.5 });
  }

  // El giro de la R: el polvo que levanta y el anillo de desgarro a ras del piso.
  spinFx(p, dur, pal) {
    const g = this.g;
    // (v4) el aro de chispas que sale girando
    if (globalThis.__mduNoDesgFx4 !== true) {
      const D = (PAL[pal] || PAL.base).dust;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        g.fx.add.spawn(p.x + Math.cos(a) * 1.2, p.y + 1.2 + rnd() * 0.3, p.z + Math.sin(a) * 1.2, -Math.sin(a) * 7 + Math.cos(a) * 2, rnd(), Math.cos(a) * 7 + Math.sin(a) * 2, { color: D[i % 3], size: 0.05, size1: 0, life: 0.4, drag: 2 });
      }
    }
    this.nova(p, 3.1, { pal, dust: true, big: 0.6, life: Math.min(1, dur * 0.7), h: 0.25, w: 0.18, sound: false });
    // el remolino de polvo alrededor (gira con la guadaña)
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 1.6;
      g.fx.alpha.spawn(p.x + Math.cos(a) * r, p.y + 0.1 + Math.random() * 0.4, p.z + Math.sin(a) * r, -Math.sin(a) * 3.5, 0.4 + Math.random() * 0.8, Math.cos(a) * 3.5, { color: [0.36, 0.32, 0.28], size: 0.35, size1: 1.1, life: 0.8 + Math.random() * 0.5, alpha: 0.4, drag: 1.8 });
    }
  }

  // La espectral de ida tira hacia ella a los muertos que tiene cerca (el
  // anfitrión; los jefes, los perros y los que están en una ventana, no).
  pull(fl, dt) {
    const g = this.g;
    const P = fl.cfg.pull;
    for (const { z } of g.zombies.inRadius(fl.pos, P.radius, _near)) {
      if (z.boss || z.dog || z.dead || z.pombero || z.crow || z.yasy || (z.state !== 'chase' && z.state !== 'attack')) continue;
      const dx = fl.pos.x - z.pos.x;
      const dz = fl.pos.z - z.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 || Math.abs(fl.pos.y - z.pos.y) > 2.6) continue;
      const s = Math.min(d - 0.5, P.speed * dt * (1 - d / (P.radius + 0.5) * 0.4));
      const by = z.baseY || 0;
      z.pos.x += (dx / d) * s;
      z.pos.z += (dz / d) * s;
      g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
      const nf = g.world.floorAt(z.pos.x, z.pos.z, by + 0.5);
      if (Number.isFinite(nf) && Math.abs(nf - by) < 0.6) z.baseY = nf;
      z.pos.y = z.baseY || 0;
      if (Math.random() < dt * 12) {
        const c = (PAL[fl.pal] || PAL.base).dust[1];
        g.fx.add.spawn(z.pos.x, (z.baseY || 0) + 1.1, z.pos.z, (dx / d) * 5, 0.3, (dz / d) * 5, { color: c, size: 0.05, size1: 0, life: 0.3, drag: 0.5 });
      }
    }
  }

  // ---------------- la ruptura (el remate del Eclipse) ----------------
  // En c: una raja parada de espacio roto, el anillo que barre 10 m, la burbuja
  // donde se frena el tiempo, el destello y las piedras. Solo se ve: el daño, el
  // tirón y lo lento los pone Desgarrador.rupture.
  rupture(c, R, pal = 'base', own = false, big = false) {
    const g = this.g;
    const fy0 = g.world.floorAt(c.x, c.z, c.y + 0.5);
    const fy = Number.isFinite(fy0) && fy0 > c.y - 3 ? fy0 : c.y;
    // (v4) en el medio, el agujero negro que se los traga (el del golpe cargado, grande)
    if (globalThis.__mduNoSlashHole !== true) this.hole(_n2.set(c.x, fy + 1.4, c.z), big ? 0.95 : 0.6, big ? 1.25 : 1.0, { pal, gold: true, own });
    if (big) {
      // más rajas paradas alrededor, como un vidrio roto en el aire
      for (let i = 0; i < 4; i++) this.rift({ o: tmpV.set(c.x + rnd() * 5, fy + 1 + Math.random() * 2.2, c.z + rnd() * 5), yaw: Math.random() * 6, roll: Math.PI / 2 + rnd() * 1.2, kind: 'line', len: 2 + Math.random() * 2.5, w: 0.1, life: 2.4, sweep: 0.1 + Math.random() * 0.2, pal, own: false, glass: 10 });
    }
    const cam = g.camera?.position;
    const yaw = cam ? Math.atan2(c.x - cam.x, c.z - cam.z) + Math.PI / 2 : 0;
    this.rift({ o: tmpV.set(c.x, fy + 2.0, c.z), yaw, roll: Math.PI / 2, kind: 'line', len: 4.2, w: 0.2, life: 2.6, sweep: 0.12, pal, own: false, glass: 26 });
    this.rift({ o: tmpV.set(c.x, fy + 1.4, c.z), yaw: yaw + 1.2, roll: Math.PI / 2 - 0.5, kind: 'line', len: 2.6, w: 0.12, life: 2.2, sweep: 0.16, pal, own: false });
    this.nova(_n1.set(c.x, fy, c.z), R.radius, { pal, dust: true, big: 2, life: 0.75, w: 0.3, h: 0.5, sound: false });
    if (R.bubble) this.bubble(_n1.set(c.x, fy + 0.8, c.z), R.bubble.radius, R.bubble.time, pal);
    g.fx.flash(_n2.set(c.x, fy + 1.5, c.z), pal === 'exec' ? 0xff60c0 : 0xb060ff, 16, 0.5, 18);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 6;
      g.fx.alpha.spawn(c.x + Math.cos(a) * 0.6, fy + 0.1, c.z + Math.sin(a) * 0.6, Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s, { color: [0.3, 0.26, 0.24], size: 0.14 + Math.random() * 0.12, size1: 0.06, life: 1 + Math.random() * 0.5, alpha: 0.95, gravity: 10, drag: 0.3 });
    }
    const P = g.player?.pos;
    if (P) g.fx.addShake(Math.max(0, 0.7 * (1 - P.distanceTo(c) / 22)));
    // (v4: un poco más bajo: suena junto con el agujero negro del medio)
    this.play('desg-ruptura', { pos: own ? null : c, gain: 0.85 });
  }

  // La burbuja del tiempo: una esfera de luz con el borde encendido que tiembla.
  bubble(p, R, life, pal = 'base') {
    this.attach();
    let b = this.bubbles.find((x) => !x.on);
    if (!b) b = this.bubbles.reduce((a, c) => (a.t / a.life > c.t / c.life ? a : c));
    b.on = true;
    b.t = 0;
    b.life = life;
    b.R = R;
    b.m.position.copy(p);
    b.m.visible = true;
    b.U.uCol.value.setRGB(...(PAL[pal] || PAL.base).edge);
    return b;
  }

  stepBubble(b, dt) {
    b.t += dt;
    // (crece de golpe, tiembla y al final se cierra)
    const grow = smooth(b.t / 0.25);
    const end = 1 - smooth((b.t - (b.life - 0.35)) / 0.35);
    b.m.scale.setScalar(Math.max(0.01, b.R * grow * (1 + 0.015 * Math.sin(b.t * 31))));
    b.U.uK.value = end * (0.6 + 0.4 * grow);
    if (b.t >= b.life) {
      b.on = false;
      b.m.visible = false;
    }
  }

  // ---------------- el pozo de gravedad (la espectral del medio, en su punta) ----------------
  // W: { radius, time, pull, core, boss, bossMin }. Tira hacia p a los de
  // alrededor (lo hace el anfitrión, también con el de un compañero) y al final
  // se los traga (el que tiró: Desgarrador.wellHits).
  well(p, W, own, pal = 'base') {
    this.attach();
    let w = this.wells.find((x) => !x.on);
    if (!w) w = this.wells[0];
    w.on = true;
    w.t = 0;
    w.p.copy(p);
    w.W = W;
    w.own = own;
    w.pal = pal;
    w.core.position.copy(p);
    w.shell.position.copy(p);
    w.core.scale.setScalar(0.01);
    w.shell.scale.setScalar(0.01);
    w.core.visible = true;
    w.shell.visible = OLD_BUBBLES;
    w.U.uCol.value.setRGB(...(PAL[pal] || PAL.base).edge);
    // el disco que gira alrededor (un anillo de grieta casi acostado)
    w.ring = this.rift({ o: p, yaw: 0, roll: 0.25, kind: 'arc', R: W.core * 0.7, half: Math.PI, w: 0.12, life: W.time + 0.2, sweep: 0.2, pal, own: false });
    w.ring2 = this.rift({ o: p, yaw: 1, roll: -0.5, kind: 'arc', R: W.core * 0.5, half: Math.PI, w: 0.08, life: W.time + 0.2, sweep: 0.3, pal, own: false });
    this.play('desg-pozo', { pos: own ? null : p, gain: 1 });
    this.g.fx.flash(p, 0x9040ff, 6, 0.3, 10);
    return w;
  }

  stepWell(w, dt) {
    const g = this.g;
    w.t += dt;
    const W = w.W;
    const k = w.t / W.time;
    // el núcleo negro crece y late; la cáscara de luz alrededor
    const s = (0.35 + 0.55 * smooth(k / 0.3) + 0.06 * Math.sin(w.t * 23)) * 1.25;
    w.core.scale.setScalar(Math.max(0.01, s * (k > 0.9 ? 1 - (k - 0.9) / 0.1 : 1)));
    w.shell.scale.setScalar(s * 1.55);
    w.U.uK.value = 2.2;
    w.flashT = (w.flashT || 0) - dt;
    if (w.flashT <= 0) {
      w.flashT = 0.14;
      g.fx.flash(w.p, 0x9040ff, 4 + 3 * Math.random(), 0.16, 9);
    }
    for (const [r, v] of [[w.ring, 4], [w.ring2, -6]]) {
      if (!r?.on) continue;
      r.m.rotation.y += dt * v;
      r.m.updateMatrixWorld(true);
    }
    // lo que entra en espiral
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * (W.radius - 1.5);
      const x = w.p.x + Math.cos(a) * r;
      const z = w.p.z + Math.sin(a) * r;
      const y = w.p.y + rnd() * 1.6;
      const tx = -Math.sin(a) * 5;
      const tz = Math.cos(a) * 5;
      g.fx.add.spawn(x, y, z, tx + (w.p.x - x) * 1.6, (w.p.y - y) * 1.6, tz + (w.p.z - z) * 1.6, { color: (PAL[w.pal] || PAL.base).dust[i % 3], size: 0.05, size1: 0, life: 0.5, drag: 0.6 });
    }
    // los tira hacia el medio (el anfitrión mueve a los muertos)
    if (!g.net || g.net.host) this.pullTo(w.p, W.radius, W.pull, dt);
    if (w.t >= W.time) {
      w.on = false;
      w.core.visible = w.shell.visible = false;
      this.nova(w.p, W.core * 1.3, { pal: w.pal, dust: true, big: 1.3, sound: false });
      g.fx.flash(w.p, 0xd080ff, 10, 0.3, 12);
      this.play('desg-estallido', { pos: w.p, gain: 1, rate: 0.7 });
      if (w.own) this.d.wellHits?.(w.p.clone(), W);
    }
  }

  // Tira a los muertos de alrededor hacia p (como pull, sin la espectral).
  pullTo(p, R, speed, dt) {
    const g = this.g;
    for (const { z } of g.zombies.inRadius(p, R, _near)) {
      if (z.boss || z.dog || z.dead || z.pombero || z.crow || z.yasy || z.jinete || (z.state !== 'chase' && z.state !== 'attack' && z.state !== 'reel')) continue;
      const dx = p.x - z.pos.x;
      const dz = p.z - z.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6 || Math.abs(p.y - z.pos.y) > 3) continue;
      const st = Math.min(d - 0.6, speed * dt * (0.6 + 0.4 * (1 - d / R)));
      const by = z.baseY || 0;
      z.pos.x += (dx / d) * st;
      z.pos.z += (dz / d) * st;
      g.world.collide(z.pos, 0.3, by + 0.1, by + 1.7);
      const nf = g.world.floorAt(z.pos.x, z.pos.z, by + 0.5);
      if (Number.isFinite(nf) && Math.abs(nf - by) < 0.6) z.baseY = nf;
      z.pos.y = z.baseY || 0;
    }
  }

  // ---------------- la lluvia de guadañas (la Furia del Eclipse) ----------------
  // Una espectral cae del cielo girando sobre `to` (el muerto, o un punto) y se
  // clava: lo parte al medio (el que la tiró) y revienta.
  fall(to, own, up = 1, pal = 'furia', st = null) {
    this.attach();
    const fl = this.flyers.find((x) => !x.on && x.up === !!up) || this.newFlyer(!!up);
    const from = tmpV.set(to.x + rnd() * 3, to.y + 9 + Math.random() * 3, to.z + rnd() * 3);
    Object.assign(fl, { id: -1, own, st, home: null, onEnd: null, R: 0, A: 0, T: 0.32 + Math.random() * 0.08, pal, cfg: null, burst: false });
    fl.o.copy(from);
    fl.f.copy(to);
    fl.on = true;
    fl.done = false;
    fl.t = 0;
    fl.mode = 'fall';
    fl.ang = Math.random() * 6;
    fl.pos.copy(from);
    fl.prev.copy(from);
    fl.hits = new Set();
    fl.trail.length = 0;
    fl.group.visible = true;
    // girando como una rueda que cae (el eje de giro, acostado)
    const dir = tmpV2.subVectors(to, from).normalize();
    tmpV3.crossVectors(dir, UP).normalize();
    fl.group.quaternion.setFromUnitVectors(Z, tmpV3);
    return fl;
  }

  stepFall(fl, dt) {
    const u = Math.min(1, fl.t / fl.T);
    fl.prev.copy(fl.pos);
    fl.pos.lerpVectors(fl.o, fl.f, u * u);
    fl.group.position.copy(fl.pos);
    fl.ang += dt * 30;
    fl.spinG.rotation.z = fl.ang;
    fl.spinG.scale.setScalar(1.15);
    fl.disc.scale.setScalar(1.15);
    fl.group.updateMatrixWorld(true);
    const s = fl.free.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
    s.a.copy(fl.tipL).applyMatrix4(fl.spinG.matrixWorld);
    s.b.copy(fl.midL).applyMatrix4(fl.spinG.matrixWorld);
    s.age = 0;
    fl.trail.unshift(s);
    if (fl.trail.length > FLY_TRAIL) fl.free.push(fl.trail.pop());
    if (u >= 1) fl.done = true;
  }

  // Se clavó: la grieta parada, el anillo y (la propia) el corte.
  fallHit(fl) {
    const p = fl.f;
    this.rift({ o: tmpV.set(p.x, p.y + 0.4, p.z), yaw: Math.random() * 6, roll: Math.PI / 2, kind: 'line', len: 2.2, w: 0.1, life: 0.9, sweep: 0.05, pal: fl.pal, own: false, glass: 6 });
    this.nova(_n1.set(p.x, p.y - 0.6, p.z), 2.4, { pal: fl.pal, big: 0.7, sound: false });
    this.play('desg-lluvia', { pos: p, gain: 0.9, rate: 0.9 + Math.random() * 0.2 });
    if (fl.own) this.d.rainHit?.(p.clone(), fl.st);
  }

  // ---------------- el polvo de estrellas (la Furia del Eclipse: cura) ----------------
  stardust(from, to) {
    const g = this.g;
    for (let i = 0; i < 14; i++) {
      const x = from.x + rnd() * 0.5;
      const y = from.y + rnd() * 1.2;
      const z = from.z + rnd() * 0.5;
      const t = 0.45 + Math.random() * 0.15;
      g.fx.add.spawn(x, y, z, (to.x - x) / t, (to.y - y) / t, (to.z - z) / t, { color: i % 3 ? [1.4, 1.05, 0.5] : PAL.furia.dust[1], size: 0.05, size1: 0.02, life: t, drag: 0 });
    }
  }

  // ---------------- la marca de la ejecutora ----------------
  // Una X rosa en el muerto (dos rajas que se cruzan).
  execMark(p) {
    for (const r of [0.75, -0.75]) this.rift({ o: p, yaw: Math.random() * 6, roll: r, kind: 'line', len: 1.3, w: 0.07, life: 0.5, sweep: 0.04, pal: 'exec', own: false });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.baked) this.bake();
    let any = false;
    for (const r of this.rifts) {
      if (!r.on) continue;
      any = true;
      this.stepRift(r, dt);
    }
    for (const fl of this.flyers) {
      if (fl.on) {
        any = true;
        this.stepFlyer(fl, dt);
        if (fl.done) {
          const own = fl.own;
          const fall = fl.mode === 'fall';
          this.endFlyer(fl);
          if (fall) this.fallHit(fl);
          else if (own) this.d.onCatch(fl);
          else fl.onEnd?.(fl);
        }
      }
      this.drawTrail(fl, dt);
    }
    if (this.slices.length) this.stepSlices(dt);
    this.bubbleMat.uniforms.uTime.value = this.g.time;
    for (const b of this.bubbles) {
      if (!b.on) continue;
      any = true;
      this.stepBubble(b, dt);
    }
    for (const w of this.wells) {
      if (!w.on) continue;
      any = true;
      this.stepWell(w, dt);
    }
    for (const h of this.holes) {
      if (!h.on) continue;
      any = true;
      this.stepHole(h, dt);
    }
    if (any) this.attach();
  }

  clear() {
    for (const r of this.rifts) {
      r.on = false;
      r.m.visible = false;
    }
    for (const fl of this.flyers) this.endFlyer(fl);
    this.slices.length = 0;
    for (const b of this.bubbles) {
      b.on = false;
      b.m.visible = false;
    }
    for (const w of this.wells) {
      w.on = false;
      w.core.visible = w.shell.visible = false;
    }
    for (const h of this.holes) {
      h.on = false;
      h.grp.visible = false;
    }
    this.light.intensity = 0;
  }

  // ---------------- lo que se escucha ----------------
  // Todo horneado una vez (audio.bakeSound: tomas con la receta de abajo) y
  // tocado con playBuffer: un tajo no arma ni un oscilador.
  bake() {
    const a = this.g.audio;
    // (una sola vez: Arrival lo llama en cada carga de Eclipse)
    if (this.baked || !a?.ctx || !a.bakeSound) return;
    this.baked = true;
    const B = (key, dur, body, takes = 1) => a.bakeSound(key, dur, body, takes);
    // ---------------- v3: capas propias ----------------
    // el tajo: el aire cortado, el espacio que se rasga, el grave que cae y un
    // acorde corto de cristal (tres tomas)
    B('desg-tajo', 0.9, function (o, t) {
      const k = 0.92 + Math.random() * 0.16;
      this.noise(o, { t, dur: 0.24, type: 'bandpass', freq: 520 * k, freqEnd: 3400 * k, q: 1.1, gain: 0.7, attack: 0.02 });
      tearL(this, o, t + 0.03, { dur: 0.26, gain: 0.45, n: 9 });
      subL(this, o, t + 0.05, { f0: 105 * k, f1: 42, dur: 0.36, gain: 0.32 });
      crystalL(this, o, t + 0.06, [1046.5 * k, 1318.5 * k, 1661.2 * k], { gain: 0.016, dur: 0.55 });
    }, 3);
    // el tajo de la del Eclipse: lo mismo más grande, con un coro corto y la
    // catedral (el eco largo) y un sub
    B('desg-tajo-up', 2.4, function (o0, t) {
      const o = hall(this, o0, 2.2, 0.45);
      const k = 0.94 + Math.random() * 0.12;
      this.noise(o, { t, dur: 0.26, type: 'bandpass', freq: 460 * k, freqEnd: 3800 * k, q: 1.0, gain: 0.8, attack: 0.018 });
      tearL(this, o, t + 0.02, { dur: 0.34, gain: 0.6, n: 14 });
      subL(this, o, t + 0.04, { f0: 80, f1: 26, dur: 0.6, gain: 0.5 });
      crystalL(this, o, t + 0.05, [880 * k, 1318.5 * k, 1760 * k, 2217.5 * k], { gain: 0.02, dur: 0.9 });
      this.choir?.(o, t + 0.04, [62, 69, 74], { dur: 0.35, gain: 0.03, attack: 0.03, release: 0.5 });
    }, 2);
    // el corte en la carne: el golpe sordo, el desgarro corto y un pinchazo de cristal
    B('desg-corte', 0.5, function (o, t) {
      this.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 950, freqEnd: 170, gain: 0.95, attack: 0.003 });
      this.tone(o, { t, dur: 0.1, type: 'sine', freq: 115, freqEnd: 55, gain: 0.35 });
      tearL(this, o, t + 0.01, { dur: 0.1, gain: 0.3, n: 5, f0: 900, f1: 2600 });
      crystalL(this, o, t + 0.02, [2093 + Math.random() * 200], { gain: 0.018, dur: 0.25 });
    }, 3);
    // tragado por la grieta: la succión que crece (al revés), el tono que sube
    // y el "pop" grave cuando entra
    B('desg-trago', 0.9, function (o, t) {
      this.noise(o, { t, dur: 0.46, type: 'bandpass', freq: 300, freqEnd: 4200, q: 1.6, gain: 0.55, attack: 0.38 });
      this.tone(o, { t, dur: 0.45, type: 'sine', freq: 180, freqEnd: 950, gain: 0.05, attack: 0.3 });
      this.tone(o, { t, dur: 0.45, type: 'triangle', freq: 360, freqEnd: 1900, gain: 0.015, attack: 0.3 });
      subL(this, o, t + 0.44, { f0: 130, f1: 34, dur: 0.3, gain: 0.45 });
      crystalL(this, o, t + 0.45, [3136], { gain: 0.02, dur: 0.3 });
    }, 2);
    // la espectral que sale: pasa con doppler (sube mientras se acerca al
    // punto más rápido y baja cuando se aleja) y cada vuelta en el aire
    B('desg-lanza', 1.3, function (o, t) {
      this.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 380, freqEnd: 2800, q: 1, gain: 0.75, attack: 0.04 });
      this.tone(o, { t, dur: 0.32, type: 'sine', freq: 560, freqEnd: 820, gain: 0.05, attack: 0.05 });
      this.tone(o, { t: t + 0.3, dur: 0.75, type: 'sine', freq: 820, freqEnd: 330, gain: 0.045, attack: 0.02 });
      for (let i = 0; i < 10; i++) {
        const u = i / 10;
        const dop = u < 0.35 ? 1 + u : 1.35 - (u - 0.35) * 1.1;
        this.noise(o, { t: t + i * 0.105, dur: 0.09, type: 'bandpass', freq: 900 * dop, freqEnd: 1700 * dop, q: 2.4, gain: 0.5 * (u < 0.35 ? 0.5 + u * 1.4 : 1 - (u - 0.35) * 1.2), attack: 0.03 });
      }
      crystalL(this, o, t, [1568, 2093], { gain: 0.02, dur: 0.5 });
    });
    // las tres de la del Eclipse: tres pasadas desfasadas, un coro bajo y la catedral
    B('desg-lanza-up', 2.4, function (o0, t) {
      const o = hall(this, o0, 2, 0.4);
      for (const [d, k] of [[0, 1], [0.08, 1.12], [0.16, 0.89]]) {
        this.noise(o, { t: t + d, dur: 0.3, type: 'bandpass', freq: 380 * k, freqEnd: 2800 * k, q: 1, gain: 0.5, attack: 0.04 });
        this.tone(o, { t: t + d, dur: 0.32, type: 'sine', freq: 560 * k, freqEnd: 820 * k, gain: 0.035, attack: 0.05 });
        this.tone(o, { t: t + d + 0.3, dur: 0.7, type: 'sine', freq: 820 * k, freqEnd: 330 * k, gain: 0.03, attack: 0.02 });
      }
      this.choir?.(o, t + 0.05, [50, 57, 62], { dur: 0.6, gain: 0.03, attack: 0.1, release: 0.6 });
      subL(this, o, t, { f0: 70, f1: 30, dur: 0.6, gain: 0.3 });
    });
    // la ruptura: el espacio que se rompe entero (un desgarro largo), el sub que
    // se hunde, el vidrio que revienta, el coro y la catedral
    B('desg-ruptura', 3.8, function (o0, t) {
      const o = hall(this, o0, 3.2, 0.65);
      // (v4: un poco más bajo: con el agujero negro arriba saturaba)
      tearL(this, o, t, { dur: 0.75, f0: 200, f1: 3600, gain: 0.72, n: 26 });
      subL(this, o, t, { f0: 68, f1: 17, dur: 1.8, gain: 0.6 });
      this.noise(o, { t, dur: 1.2, type: 'lowpass', freq: 900, freqEnd: 80, gain: 0.55, attack: 0.005, brown: true });
      shatterL(this, o, t + 0.05, { n: 24, span: 0.7, gain: 0.35 });
      this.choir?.(o, t + 0.1, [38, 50, 57, 62, 65], { dur: 1.4, gain: 0.04, attack: 0.08, release: 1.4 });
      crystalL(this, o, t + 0.2, [587.3, 880, 1174.7, 1396.9], { gain: 0.025, dur: 1.8, spread: 0.05 });
    });
    // el pozo de gravedad: el remolino que tira (ruido que gira de un lado al
    // otro), el grave que sube y un acorde que baja
    B('desg-pozo', 2.0, function (o, t) {
      for (let i = 0; i < 9; i++) {
        const f = 300 + 900 * (0.5 + 0.5 * Math.sin(i * 1.3));
        this.noise(o, { t: t + i * 0.16, dur: 0.22, type: 'bandpass', freq: f, freqEnd: f * 0.6, q: 6, gain: 0.35 + i * 0.03, attack: 0.08 });
      }
      this.tone(o, { t, dur: 1.6, type: 'sine', freq: 38, freqEnd: 62, gain: 0.5, attack: 0.5 });
      this.tone(o, { t, dur: 1.5, type: 'sawtooth', freq: 440, freqEnd: 110, gain: 0.025, attack: 0.2 });
      this.tone(o, { t, dur: 1.5, type: 'sawtooth', freq: 523.3, freqEnd: 130.8, gain: 0.018, attack: 0.2, detune: 6 });
    });
    // la falla en el piso: el retumbo (tierra), el desgarro bajo y las piedras
    B('desg-falla', 1.8, function (o, t) {
      this.noise(o, { t, dur: 1.3, type: 'lowpass', freq: 240, freqEnd: 60, gain: 1, attack: 0.01, brown: true });
      tearL(this, o, t + 0.02, { dur: 0.45, f0: 160, f1: 1400, gain: 0.7, n: 16 });
      subL(this, o, t, { f0: 60, f1: 22, dur: 1.1, gain: 0.6 });
      for (let i = 0; i < 12; i++) this.noise(o, { t: t + 0.15 + Math.random() * 0.9, dur: 0.05, type: 'bandpass', freq: 600 + Math.random() * 1400, q: 3, gain: 0.25, attack: 0.002 });
    });
    // una de la lluvia: el silbido que cae, el golpe y el cristal
    B('desg-lluvia', 1.0, function (o, t) {
      this.tone(o, { t, dur: 0.3, type: 'sine', freq: 2600, freqEnd: 600, gain: 0.04, attack: 0.02 });
      this.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 3000, freqEnd: 700, q: 3, gain: 0.35, attack: 0.05 });
      subL(this, o, t + 0.3, { f0: 110, f1: 35, dur: 0.35, gain: 0.45 });
      tearL(this, o, t + 0.3, { dur: 0.16, gain: 0.4, n: 6 });
      crystalL(this, o, t + 0.31, [1318.5, 1975.5], { gain: 0.02, dur: 0.5 });
    }, 2);
    // la ejecución (la ejecutora): una campana rosa y un tajito
    B('desg-exec', 1.4, function (o, t) {
      bellL(this, o, t, 659.3 * (0.97 + Math.random() * 0.06), 0.16, 1.3);
      tearL(this, o, t, { dur: 0.08, gain: 0.5, n: 4, f0: 1200, f1: 4000 });
      subL(this, o, t, { f0: 90, f1: 40, dur: 0.25, gain: 0.25 });
    }, 2);
    // el Cazador del Caos: la bruma que sale (un soplo con voz), la succión
    // (aire que entra y un "pop" con coro) y los ojos que se apagan
    B('caz-bruma', 1.0, function (o, t) {
      this.noise(o, { t, dur: 0.7, type: 'bandpass', freq: 380, freqEnd: 1400, q: 1.2, gain: 1.6, attack: 0.12 });
      for (const [f, q, g] of [[650, 5, 0.7], [1080, 7, 0.45], [2650, 9, 0.22]]) this.noise(o, { t: t + 0.05, dur: 0.6, type: 'bandpass', freq: f, q, gain: g, attack: 0.15 });
      crystalL(this, o, t + 0.1, [1396.9, 1760, 2349.3], { gain: 0.03, dur: 0.7, spread: 0.04 });
      subL(this, o, t, { f0: 70, f1: 45, dur: 0.5, gain: 0.25 });
    }, 2);
    B('caz-succion', 1.4, function (o, t) {
      this.noise(o, { t, dur: 0.7, type: 'bandpass', freq: 200, freqEnd: 2600, q: 1.3, gain: 0.7, attack: 0.55 });
      this.tone(o, { t, dur: 0.7, type: 'sine', freq: 90, freqEnd: 420, gain: 0.08, attack: 0.5 });
      subL(this, o, t + 0.68, { f0: 140, f1: 40, dur: 0.3, gain: 0.45 });
      this.choir?.(o, t + 0.66, [57, 64, 69], { dur: 0.3, gain: 0.03, attack: 0.02, release: 0.4 });
    });
    B('caz-ojos', 0.9, function (o, t) {
      [2637, 2093, 1568, 1175].forEach((f, i) => crystalL(this, o, t + i * 0.07, [f], { gain: 0.08 - i * 0.012, dur: 0.4 }));
      this.noise(o, { t, dur: 0.3, type: 'highpass', freq: 3500, freqEnd: 1200, gain: 0.12, attack: 0.01 });
    });
    // la Furia mientras dura: un coro que zumba de fondo (horneado de 6 s; se
    // repite el tramo de 2 a 6 s, que es parejo: todas las notas en múltiplos de
    // 0,25 Hz dan vueltas enteras en 4 s y no chasquea)
    B('desg-furia-coro', 6.0, function (o) {
      const c = this.ctx;
      const out = c.createGain();
      out.gain.value = 1;
      out.connect(o);
      const voices = c.createGain();
      voices.gain.value = 1;
      // la respiración del coro: 0,5 Hz (dos vueltas en 4 s)
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.5;
      const lg = c.createGain();
      lg.gain.value = 0.35;
      const vg = c.createGain();
      vg.gain.value = 0.65;
      lfo.connect(lg).connect(vg.gain);
      lfo.start(0);
      voices.connect(vg);
      for (const [fq, q, k] of [[650, 4, 1], [1080, 6, 0.6], [2650, 8, 0.25]]) {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fq;
        bp.Q.value = q;
        const kg = c.createGain();
        kg.gain.value = k * 2.4;
        vg.connect(bp).connect(kg).connect(out);
      }
      for (const f of [110, 164.75, 220, 277.25, 329.5]) {
        for (const df of [0, 0.25, -0.25]) {
          const os = c.createOscillator();
          os.type = 'sawtooth';
          os.frequency.value = f + df;
          const og = c.createGain();
          og.gain.value = 0.012;
          os.connect(og).connect(voices);
          os.start(0);
        }
      }
      for (const [f, g] of [[55, 0.35], [82.5, 0.12]]) {
        const os = c.createOscillator();
        os.frequency.value = f;
        const og = c.createGain();
        og.gain.value = g;
        os.connect(og).connect(out);
        os.start(0);
      }
    });
    // la grieta que se abre: crujido de vidrio y un "uuum" que baja
    B('desg-grieta', 1.0, function (o, t) {
      for (let i = 0; i < 6; i++) this.noise(o, { t: t + i * 0.035 + Math.random() * 0.02, dur: 0.05, type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.35 - i * 0.04, attack: 0.002 });
      this.tone(o, { t, dur: 0.9, type: 'sine', freq: 880, freqEnd: 150, gain: 0.08, attack: 0.01 });
      this.tone(o, { t, dur: 0.9, type: 'triangle', freq: 1320, freqEnd: 220, gain: 0.03, attack: 0.01 });
      this.tone(o, { t, dur: 0.5, type: 'sine', freq: 70, freqEnd: 40, gain: 0.25, attack: 0.01 });
    }, 2);
    // cada vuelta en el aire
    B('desg-whoop', 0.15, function (o, t) {
      this.noise(o, { t, dur: 0.11, type: 'bandpass', freq: 950, freqEnd: 1800, q: 2.2, gain: 0.8, attack: 0.035 });
    }, 2);
    // vuelve a la hoja: un brillo que sube
    B('desg-vuelve', 0.6, function (o, t) {
      this.tone(o, { t, dur: 0.45, type: 'sine', freq: 420, freqEnd: 1680, gain: 0.06, attack: 0.08 });
      this.tone(o, { t: t + 0.1, dur: 0.45, type: 'sine', freq: 2640, gain: 0.03, attack: 0.02 });
      this.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 2200, freqEnd: 5000, q: 3, gain: 0.25, attack: 0.15 });
    });
    // la embestida: el golpe de aire, el trueno sordo y el desgarro
    B('desg-embestida', 0.7, function (o, t) {
      this.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 260, freqEnd: 1800, q: 0.8, gain: 1, attack: 0.02 });
      this.tone(o, { t, dur: 0.45, type: 'sine', freq: 95, freqEnd: 38, gain: 0.35, attack: 0.005 });
      this.tone(o, { t: t + 0.05, dur: 0.55, type: 'sawtooth', freq: 220, freqEnd: 70, gain: 0.05, attack: 0.02 });
      for (let i = 0; i < 4; i++) this.noise(o, { t: t + 0.06 + i * 0.04, dur: 0.05, type: 'highpass', freq: 3500 + Math.random() * 2500, gain: 0.2, attack: 0.002 });
    });
    // el giro de la recarga: seis vueltas que suben y el clac del final
    B('desg-giro', 1.25, function (o, t) {
      for (let i = 0; i < 6; i++) {
        const f = 700 + i * 120;
        this.noise(o, { t: t + i * 0.16, dur: 0.14, type: 'bandpass', freq: f, freqEnd: f * 1.8, q: 2, gain: 0.55 + i * 0.05, attack: 0.05 });
      }
      this.tone(o, { t, dur: 1.0, type: 'sine', freq: 330, freqEnd: 660, gain: 0.03, attack: 0.2 });
      this.noise(o, { t: t + 1.0, dur: 0.06, type: 'lowpass', freq: 1400, gain: 0.8 });
      this.tone(o, { t: t + 1.0, dur: 0.06, type: 'square', freq: 190, freqEnd: 120, gain: 0.08 });
      for (const [f, gn] of [[1180, 0.05], [2470, 0.03], [3890, 0.02]]) this.tone(o, { t: t + 1.0, dur: 0.24, type: 'sine', freq: f, gain: gn });
    });
    // arranca la Furia: el golpe, el coro violeta y el viento que sube
    B('desg-furia', 2.2, function (o, t) {
      this.tone(o, { t, dur: 1.4, type: 'sine', freq: 62, freqEnd: 31, gain: 0.45, attack: 0.01 });
      this.noise(o, { t, dur: 1.4, type: 'bandpass', freq: 300, freqEnd: 4200, q: 0.9, gain: 0.5, attack: 0.25 });
      for (const [f, d] of [[220, -6], [261.6, 4], [329.6, -3], [440, 6], [523.3, 0]]) {
        this.tone(o, { t: t + 0.05, dur: 2.0, type: 'triangle', freq: f, gain: 0.05, attack: 0.3, detune: d });
        this.tone(o, { t: t + 0.05, dur: 2.0, type: 'sawtooth', freq: f * 2, gain: 0.008, attack: 0.4, detune: -d });
      }
      for (let i = 0; i < 8; i++) this.noise(o, { t: t + i * 0.03, dur: 0.06, type: 'highpass', freq: 4000, gain: 0.25, attack: 0.002 });
    });
    // la Furia mientras dura: un latido grave (2 s exactos: da la vuelta sin chasquido)
    B('desg-furia-loop', 2.0, function (o) {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = 0.0;
      const lfo = c.createOscillator();
      lfo.frequency.value = 2;
      const lg = c.createGain();
      lg.gain.value = 0.05;
      const bias = c.createConstantSource ? c.createConstantSource() : null;
      if (bias) {
        bias.offset.value = 0.07;
        bias.connect(g.gain);
        bias.start(0);
      }
      lfo.connect(lg).connect(g.gain);
      lfo.start(0);
      for (const [f, type, gn] of [[55, 'sine', 0.9], [82.5, 'sine', 0.45], [110, 'triangle', 0.3], [220, 'sine', 0.08]]) {
        const os = c.createOscillator();
        os.type = type;
        os.frequency.value = f;
        const og = c.createGain();
        og.gain.value = gn;
        os.connect(og).connect(g);
        os.start(0);
      }
      g.connect(o);
    });
    // el rayo: prende con un trueno de vidrio y después zumba (1 s exacto)
    B('desg-rayo', 0.8, function (o, t) {
      this.tone(o, { t, dur: 0.6, type: 'sine', freq: 120, freqEnd: 45, gain: 0.35, attack: 0.005 });
      this.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 5000, freqEnd: 600, q: 1.2, gain: 0.6, attack: 0.005 });
      this.tone(o, { t, dur: 0.7, type: 'sawtooth', freq: 880, freqEnd: 220, gain: 0.04, attack: 0.01 });
    });
    B('desg-rayo-loop', 1.0, function (o) {
      const c = this.ctx;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      f.Q.value = 4;
      const g = c.createGain();
      g.gain.value = 0;
      const bias = c.createConstantSource ? c.createConstantSource() : null;
      if (bias) {
        bias.offset.value = 0.06;
        bias.connect(g.gain);
        bias.start(0);
      }
      const lfo = c.createOscillator();
      lfo.frequency.value = 9;
      const lg = c.createGain();
      lg.gain.value = 0.025;
      lfo.connect(lg).connect(g.gain);
      lfo.start(0);
      for (const [fr, type, gn] of [[110, 'sawtooth', 0.6], [111, 'sawtooth', 0.5], [220, 'square', 0.18], [55, 'sine', 0.8]]) {
        const os = c.createOscillator();
        os.type = type;
        os.frequency.value = fr;
        const og = c.createGain();
        og.gain.value = gn;
        os.connect(og).connect(f);
        os.start(0);
      }
      f.connect(g).connect(o);
    });
    // la nube rosa: un "puf" y el brillito
    B('desg-rosa', 0.8, function (o, t) {
      this.noise(o, { t, dur: 0.35, type: 'lowpass', freq: 1800, freqEnd: 300, gain: 0.7, attack: 0.01 });
      [2093, 2637, 3136, 4186].forEach((f, i) => this.tone(o, { t: t + i * 0.04, dur: 0.4, type: 'sine', freq: f, gain: 0.03, attack: 0.005 }));
    });
    // la Furia lista: el acorde violeta
    B('desg-lista', 1.1, function (o, t) {
      [659.3, 784, 987.8, 1318.5].forEach((f, i) => this.tone(o, { t: t + i * 0.07, dur: 0.8, type: 'triangle', freq: f, gain: 0.07, attack: 0.01 }));
      this.tone(o, { t, dur: 1.0, type: 'sine', freq: 2637, gain: 0.02, attack: 0.05 });
    });
    // sacarla: el acero que canta y el zumbido del cosmos
    B('desg-saca', 0.8, function (o, t) {
      this.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 1500, freqEnd: 6000, q: 2.4, gain: 0.4, attack: 0.04 });
      this.tone(o, { t: t + 0.2, dur: 0.6, type: 'sine', freq: 2960, freqEnd: 2900, gain: 0.04 });
      this.tone(o, { t, dur: 0.7, type: 'sine', freq: 110, freqEnd: 165, gain: 0.12, attack: 0.1 });
    });
    // un estallido (el remate, la espectral al volver, el final de la
    // embestida): el golpe sordo, el vidrio que revienta y el aire que barre
    B('desg-estallido', 1.0, function (o, t) {
      this.tone(o, { t, dur: 0.55, type: 'sine', freq: 85, freqEnd: 30, gain: 0.5, attack: 0.004 });
      this.noise(o, { t, dur: 0.6, type: 'lowpass', freq: 2200, freqEnd: 180, gain: 0.8, attack: 0.004 });
      for (let i = 0; i < 7; i++) this.noise(o, { t: t + 0.02 + i * 0.03 + Math.random() * 0.02, dur: 0.06, type: 'highpass', freq: 3200 + Math.random() * 3000, gain: 0.3 - i * 0.03, attack: 0.002 });
      this.tone(o, { t, dur: 0.8, type: 'triangle', freq: 660, freqEnd: 110, gain: 0.05, attack: 0.01 });
    }, 2);
    // la onda de la Furia que sale de cada tajo: un silbido que se aleja
    B('desg-onda', 0.7, function (o, t) {
      this.noise(o, { t, dur: 0.55, type: 'bandpass', freq: 3200, freqEnd: 500, q: 2.2, gain: 0.6, attack: 0.01 });
      this.tone(o, { t, dur: 0.5, type: 'sawtooth', freq: 440, freqEnd: 120, gain: 0.04, attack: 0.01 });
    });
    // la mejora (el temple): el golpe grande y el coro que brilla
    B('desg-mejora', 2.6, function (o, t) {
      this.tone(o, { t, dur: 1.8, type: 'sine', freq: 55, freqEnd: 27, gain: 0.5, attack: 0.01 });
      for (const [f, d] of [[261.6, 0], [329.6, 5], [392, -5], [523.3, 3], [659.3, -3], [784, 0]]) this.tone(o, { t: t + 0.1, dur: 2.3, type: 'triangle', freq: f, gain: 0.05, attack: 0.4, detune: d });
      this.noise(o, { t, dur: 2.0, type: 'bandpass', freq: 800, freqEnd: 6000, q: 1.2, gain: 0.35, attack: 0.6 });
    });
    // (v4) el agujero negro, el golpe cargado, la Furia divina y el Cazador (weapons/desgarradorSfx.js)
    bakeV4(B, { hall, tearL, subL, crystalL, shatterL, bellL });
    // (guadana5) el agujero negro que se oye y el rugido del rayo de vacío
    bakeV5(B, { hall, crystalL });
  }

  // Un sonido horneado. pos: dónde (null: en la cabeza). Null si no está.
  play(key, { pos = null, gain = 1, rate = 1, reverb = 0.22 } = {}) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.(key);
    if (!buf) return null;
    const go = () => a.playBuffer(buf, { pos, gain, reverb, rate, ref: pos ? 3 : undefined });
    return a.guns?.withCat ? a.guns.withCat(go) : go();
  }

  // Uno que se repite (la Furia, el rayo): { move, stop } o null.
  loop(key, pos = null, { gain = 1, fadeIn = 0.15, reverb = 0.25, from = 0, to = null } = {}) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.(key);
    if (!buf || !a.guns?.loopBuf) return null;
    return a.guns.loopBuf(buf, pos, { gain, reverb, ref: 4, fadeIn, from, to: to ?? buf.duration });
  }
}
