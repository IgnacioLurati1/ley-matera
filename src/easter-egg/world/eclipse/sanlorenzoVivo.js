import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { F, hLoc, edgeU, farBank, WATER_Y, IC } from './sanlorenzoCampo';

// Lo que se mueve del campo de San Lorenzo (world/eclipse/sanlorenzoCampo.js):
//  · los fuegos (llamas en el sombreador, un brillo en el piso y cuatro luces
//    de evento: World.adoptLight, se prenden desde la carga),
//  · el humo que sube de cada fuego y de la otra orilla,
//  · las banderas (la Cruz de Borgoña de los realistas, la de la escuadra y las
//    nuestras), que flamean con el viento del río,
//  · las cascadas: el Paraná se cae al vacío por los dos extremos de la isla,
//  · el agua que corre,
//  · los botes de los realistas que van de los barcos a la playa (los remos
//    reman en el sombreador); avisan cuando desembarcan (onLand).
// Todo instanciado y movido en los sombreadores: por cuadro, un uniforme de
// tiempo y las matrices de seis botes. Todo en coordenadas del campo (va
// adentro del grupo del campo). __mduNoSlVivo: sin esto.

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const fract = (x) => x - Math.floor(x);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// ---------------- el fuego ----------------
const FIRE_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 wc = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(dot(wc.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float s = length(instanceMatrix[0].xyz);
  // (de cara a la cámara, parada: el "arriba" del mundo en la vista)
  vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 rt = normalize(cross(up, vec3(0.0, 0.0, 1.0)));
  float sway = sin(uTime * 2.3 + vSeed * 9.0) * 0.12 * position.y;
  c.xyz += rt * (position.x + sway) * s + up * position.y * s * (1.0 + 0.12 * sin(uTime * 7.0 + vSeed * 20.0));
  gl_Position = projectionMatrix * c;
}`;
const FIRE_FRAG = /* glsl */ `
uniform float uTime, uK;
varying vec2 vUv;
varying float vSeed;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float t = uTime * 1.9 + vSeed * 13.0;
  float n = vn(vec2(p.x * 3.0 + vSeed * 7.0, p.y * 3.2 - t * 1.6)) * 0.65 + vn(vec2(p.x * 7.0, p.y * 6.0 - t * 2.7)) * 0.35;
  // la lágrima: ancha abajo, en punta arriba, comida por el ruido
  float w = (1.0 - p.y) * (0.55 + 0.45 * smoothstep(0.0, 0.25, p.y));
  float d = abs(p.x) / max(w, 1e-3);
  float a = (1.0 - smoothstep(0.55, 1.0, d + (n - 0.5) * 0.9 + p.y * 0.35)) * smoothstep(0.0, 0.08, p.y);
  a *= smoothstep(1.0, 0.55, p.y + (n - 0.5) * 0.5);
  float core = clamp(1.0 - d * 1.4 - p.y * 0.9, 0.0, 1.0);
  vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.6, 0.12), clamp(core * 1.6, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.95, 0.7), clamp(core * core * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * a * 1.6 * uK, 1.0);
}`;
// El brillo del fuego en el piso: una mancha naranja que late.
const GLOW_FRAG = /* glsl */ `
uniform float uTime, uK;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = pow(max(0.0, 1.0 - r), 2.0) * (0.75 + 0.25 * sin(uTime * 9.0 + vUv.x * 3.0));
  gl_FragColor = vec4(vec3(1.0, 0.42, 0.1) * a * 0.55 * uK, 1.0);
}`;
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;

// ---------------- el humo ----------------
// Cada bocanada sube por su columna (la matriz de la instancia: la base, el
// alto en la escala y) y vuelve a empezar; crece y se apaga.
const SMOKE_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uWind;
attribute float aSeed;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  float H = instanceMatrix[1][1];
  float S = instanceMatrix[0][0];
  vec3 base = instanceMatrix[3].xyz;
  float k = fract(uTime * (0.05 + 0.03 * fract(aSeed * 7.1)) + aSeed);
  vec3 c = base + vec3(0.0, k * H, 0.0) + uWind * (k * k * H * 0.8) + vec3(sin(aSeed * 40.0), 0.0, cos(aSeed * 33.0)) * S * 0.6 * k;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float sz = S * (0.6 + 2.6 * k);
  float a = aSeed * 6.2831 + uTime * 0.2;
  vec2 q = vec2(cos(a) * position.x - sin(a) * position.y, sin(a) * position.x + cos(a) * position.y);
  mv.xy += q * sz;
  vA = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.55, 1.0, k));
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uK;
varying vec2 vUv;
varying float vA;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA * 0.42 * uK;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uCol * (0.8 + 0.3 * (1.0 - r)), a);
}`;

// ---------------- las cascadas ----------------
const FALL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // vUv.x: a lo largo del borde (m / 6); vUv.y: cuánto cayó (0 arriba, 1 abajo)
  float y = vUv.y;
  float s = vn(vec2(vUv.x * 3.0, y * 6.0 - uTime * 2.2)) * 0.6 + vn(vec2(vUv.x * 9.0, y * 14.0 - uTime * 4.0)) * 0.4;
  float foam = smoothstep(0.08, 0.0, y) * 0.8;
  float a = (0.35 + 0.65 * smoothstep(0.35, 0.75, s)) * (1.0 - smoothstep(0.35, 1.0, y)) + foam;
  vec3 col = mix(vec3(0.34, 0.42, 0.5), vec3(0.85, 0.9, 0.95), clamp(s * 0.8 + foam, 0.0, 1.0));
  // (abajo se tiñe del violeta del vacío)
  col = mix(col, vec3(0.45, 0.2, 0.7), smoothstep(0.4, 1.0, y) * 0.6);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
}`;

// ---------------- las banderas ----------------
// Las tres en una textura: la Cruz de Borgoña, la de la escuadra (roja y
// amarilla) y la nuestra (celeste y blanca).
function flagAtlas() {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 64;
  const x = c.getContext('2d');
  // Borgoña: blanca con el aspa colorada de palos nudosos
  x.fillStyle = '#ece6d6';
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#a8141a';
  x.lineWidth = 9;
  x.lineCap = 'round';
  for (const [a, b, cc, d] of [
    [6, 6, 58, 58],
    [58, 6, 6, 58],
  ]) {
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(cc, d);
    x.stroke();
  }
  x.fillStyle = '#a8141a';
  for (let k = 0; k < 6; k++) {
    const t = 0.15 + k * 0.14;
    x.fillRect(6 + 52 * t - 3, 6 + 52 * t - 7, 6, 4);
    x.fillRect(58 - 52 * t - 3, 6 + 52 * t + 3, 6, 4);
  }
  // la de la escuadra: roja, amarilla, roja
  x.fillStyle = '#b0181a';
  x.fillRect(64, 0, 64, 64);
  x.fillStyle = '#e8b830';
  x.fillRect(64, 16, 64, 32);
  // la nuestra
  x.fillStyle = '#74acdf';
  x.fillRect(128, 0, 64, 64);
  x.fillStyle = '#f4f4ee';
  x.fillRect(128, 21, 64, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------- los botes ----------------
// Una chalupa: el casco, ocho remeros (casaca azul, correaje blanco, morrión
// negro y los ojos violetas) y ocho remos. Los remos llevan aOar (el lado) y
// aPiv (la chumacera): el sombreador los hace remar.
function chalupa() {
  const parts = [];
  const oar = [];
  const col = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const hull = new THREE.BoxGeometry(2.0, 0.9, 7.2, 1, 1, 6);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / 3.6;
    const yy = p.getY(i);
    p.setX(i, p.getX(i) * (z > 0 ? 1 - z * z * 0.9 : 1 - z * z * 0.35) * (yy < 0 ? 0.6 : 1));
    if (yy > 0) p.setY(i, yy + Math.abs(z) * 0.2);
  }
  parts.push(col(hull.translate(0, 0.35, 0), 0x3a2a1c));
  parts.push(col(new THREE.BoxGeometry(1.9, 0.12, 6.2).translate(0, 0.82, -0.2), 0x5a4028));
  for (let r = 0; r < 4; r++) {
    for (const s of [-1, 1]) {
      const z = 1.9 - r * 1.25;
      const x = s * 0.45;
      parts.push(col(new THREE.BoxGeometry(0.42, 0.55, 0.3).translate(x, 1.15, z), 0x1c2a5a));
      parts.push(col(new THREE.BoxGeometry(0.44, 0.06, 0.32).translate(x, 1.2, z), 0xd8d0c0));
      parts.push(col(new THREE.IcosahedronGeometry(0.15, 0).translate(x, 1.58, z), 0x6a6670));
      parts.push(col(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 6).translate(x, 1.82, z), 0x101014));
      // los ojos violetas
      parts.push(col(new THREE.BoxGeometry(0.12, 0.03, 0.02).translate(x, 1.6, z + 0.15), 0xd890ff));
      // el remo: de la mano a la chumacera y al agua
      const g = col(new THREE.BoxGeometry(0.06, 0.06, 3.6).rotateY(s * -1.2).rotateZ(s * -0.35).translate(s * 1.6, 0.85, z - 0.15), 0x7a5a36);
      const n = g.attributes.position.count;
      g.setAttribute('aOar', new THREE.Float32BufferAttribute(new Array(n).fill(s), 1));
      const piv = [];
      for (let i = 0; i < n; i++) piv.push(s * 0.95, 0.9, z);
      g.setAttribute('aPiv', new THREE.Float32BufferAttribute(piv, 3));
      oar.push(g);
    }
  }
  for (const g of parts) {
    const n = g.attributes.position.count;
    g.setAttribute('aOar', new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
    g.setAttribute('aPiv', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0), 3));
  }
  const geo = mergeGeometries([...parts, ...oar]);
  geo.computeVertexNormals();
  return geo;
}

export default class CampoVivo {
  // campo: lo que devolvió buildCampo; g: el juego
  constructor(g, campo) {
    this.g = g;
    this.campo = campo;
    this.root = new THREE.Group();
    this.root.name = 'slVivo';
    campo.root.add(this.root);
    this.time = { value: 0 };
    this.k = { value: 1 };
    this.off = globalThis.__mduNoSlVivo === true;
    if (this.off) return;
    this.buildFires();
    this.buildSmoke();
    this.buildFlags();
    this.buildFalls();
    this.flowWater();
    this.buildBoats();
  }

  // ---------------- los fuegos ----------------
  buildFires() {
    const spots = F.fires.map(([u, v, s]) => [u, v, hLoc(u, v), s]);
    // lo que arde lejos: el rancho de la otra orilla y un bote en la playa
    const ru = farBank(38) + 14;
    spots.push([ru, 38, hLoc(ru, 38) + 2.0, 2.2]);
    const bu = edgeU(-31) + 10.5;
    spots.push([bu, -31, hLoc(bu, -31) + 0.3, 0.9]);
    this.fireSpots = spots;
    const list = [];
    for (const [u, v, y, s] of spots) {
      const n = Math.round(4 + s * 4);
      for (let i = 0; i < n; i++) {
        const a = hash(u + i, v) * Math.PI * 2;
        const d = i === 0 ? 0 : (0.3 + hash(i, u) * 0.9) * s;
        const sz = (i === 0 ? 1.5 : 0.7 + hash(v, i) * 0.7) * s;
        list.push([u + Math.cos(a) * d, y - 0.05, v + Math.sin(a) * d, sz]);
      }
    }
    const geo = new THREE.PlaneGeometry(1, 2.2).translate(0, 1.1, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: this.k }, vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([u, y, v, s], i) => im.setMatrixAt(i, tmpM.compose(tmpV.set(u, y, v), tmpQ.identity(), tmpS.set(s, s, s))));
    im.frustumCulled = false;
    im.renderOrder = 5;
    im.name = 'slFuego';
    this.root.add(im);
    this.fire = im;
    // el brillo en el piso
    const gg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const gm = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uK: this.k }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const gi = new THREE.InstancedMesh(gg, gm, spots.length);
    spots.forEach(([u, v, y, s], i) => gi.setMatrixAt(i, tmpM.compose(tmpV.set(u, y + 0.08, v), tmpQ.identity(), tmpS.set(9 * s, 1, 9 * s))));
    gi.frustumCulled = false;
    gi.renderOrder = 2;
    gi.name = 'slFuegoPiso';
    this.root.add(gi);
    this.fireGlow = gi;
    // las luces (de evento: se prenden en la arena, las representa el pool)
    this.lights = [];
    const w = this.g.world;
    for (const [u, v, y, s] of spots.slice(0, 4)) {
      const l = new THREE.PointLight(0xff7a2a, 0, 16 + 8 * s, 2);
      l.position.set(u, y + 1.6 * s, v);
      l.userData.noShadow = true;
      this.root.add(l);
      w?.adoptLight?.(l, 0.8);
      this.lights.push({ l, base: 5 + 4 * s, ph: hash(u, v) * 10 });
    }
  }

  // ---------------- el humo ----------------
  buildSmoke() {
    const cols = [];
    for (const [u, v, y, s] of this.fireSpots) cols.push([u, y + 1.2 * s, v, 14 + 16 * s, 1.0 + 0.8 * s]);
    // el humo de la pelea sobre el río y en la otra orilla
    for (const [u, v] of [
      [90, -30],
      [100, 26],
      [150, -70],
      [235, -10],
      [250, 70],
    ])
      cols.push([u, hLoc(u, v) + 1, v, 34, 4.5]);
    const per = 12;
    const n = cols.length * per;
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = (i % per) / per + hash(i, 3.3) * 0.05;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uK: this.k, uWind: { value: new THREE.Vector3(-0.5, 0, 0.25) }, uCol: { value: new THREE.Color(0x2e2a30) } },
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const im = new THREE.InstancedMesh(geo, mat, n);
    let i = 0;
    for (const [u, y, v, H, S] of cols) {
      for (let k = 0; k < per; k++) {
        // (la matriz guarda la base, el alto en [1][1] y el ancho en [0][0])
        tmpM.set(S, 0, 0, u, 0, H, 0, y, 0, 0, 1, v, 0, 0, 0, 1);
        im.setMatrixAt(i++, tmpM);
      }
    }
    im.frustumCulled = false;
    im.renderOrder = 4;
    im.name = 'slHumo';
    this.root.add(im);
    this.smoke = im;
  }

  // ---------------- las banderas ----------------
  buildFlags() {
    const S = this.campo.flagSpots || { ship: [], R: [], P: [] };
    const list = [];
    for (const p of S.R) list.push([p, 0, 1]);
    for (const p of S.P) list.push([p, 2, 1.1]);
    for (const p of S.ship) list.push([p, 1, 1.6]);
    const geo = new THREE.PlaneGeometry(1.5, 1.0, 12, 6).translate(0.75, -0.5, 0);
    const kind = new Float32Array(list.length);
    list.forEach(([, k], i) => (kind[i] = k));
    geo.setAttribute('aFlag', new THREE.InstancedBufferAttribute(kind, 1));
    const mat = new THREE.MeshStandardMaterial({ map: flagAtlas(), side: THREE.DoubleSide, roughness: 0.9 });
    const T = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFlag;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float fph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
          float fw = position.x / 1.5;
          transformed.z += (sin(position.x * 3.2 - uTime * 5.2 + position.y * 0.6 + fph) * 0.16 + sin(position.x * 7.0 - uTime * 9.1 + fph) * 0.03) * fw;
          transformed.y -= fw * fw * 0.1;`,
        )
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + aFlag) / 3.0;\n#endif');
    };
    mat.customProgramCacheKey = () => 'slBandera';
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    // (el viento viene del río: flamean hacia -u, un poco al norte)
    const yaw = Math.atan2(0.25, 1) + Math.PI;
    list.forEach(([p, , s], i) => im.setMatrixAt(i, tmpM.compose(p, tmpQ.setFromEuler(tmpE.set(0, yaw, 0)), tmpS.set(s, s, s))));
    im.castShadow = true;
    im.name = 'slBanderas';
    this.root.add(im);
    this.flags = im;
  }

  // ---------------- las cascadas ----------------
  buildFalls() {
    const pts = this.campo.rim || [];
    const N = pts.length;
    if (!N) return;
    const ROWS = [
      [0.0, 0.2],
      [0.012, -7],
      [0.028, -28],
      [0.04, -64],
      [0.05, -110],
    ];
    const pos = [];
    const uv = [];
    const mist = [];
    let along = 0;
    for (let i = 0; i < N; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % N];
      const seg = Math.hypot(b.u - a.u, b.v - a.v);
      if (a.river && b.river) {
        for (let r = 0; r < ROWS.length - 1; r++) {
          const q = (P, row) => {
            const [o, dy] = ROWS[row];
            return [IC.u + Math.cos(P.a) * P.R * (1 + o), WATER_Y + dy, IC.v + Math.sin(P.a) * P.R * (1 + o)];
          };
          const A = q(a, r);
          const B = q(b, r);
          const C = q(a, r + 1);
          const D = q(b, r + 1);
          const y0 = r / (ROWS.length - 1);
          const y1 = (r + 1) / (ROWS.length - 1);
          const x0 = along / 6;
          const x1 = (along + seg) / 6;
          pos.push(...A, ...C, ...B, ...B, ...C, ...D);
          uv.push(x0, y0, x0, y1, x1, y0, x1, y0, x0, y1, x1, y1);
        }
        if (i % 5 === 0) mist.push([a.u, a.v, a.a, a.R]);
      }
      along += seg;
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time }, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'slCascadas';
    m.renderOrder = 3;
    this.root.add(m);
    this.falls = m;
    // la niebla de las cascadas: bocanadas blancas en el borde (con el humo, otro color)
    const per = 4;
    const n = mist.length * per;
    const g2 = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g2.index = base.index;
    g2.attributes.position = base.attributes.position;
    g2.attributes.uv = base.attributes.uv;
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = (i % per) / per + hash(i, 9.1) * 0.1;
    g2.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const m2 = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uK: this.k, uWind: { value: new THREE.Vector3(0, -0.35, 0) }, uCol: { value: new THREE.Color(0x4a5060) } },
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const im = new THREE.InstancedMesh(g2, m2, n);
    let i = 0;
    for (const [, , a, R] of mist) {
      for (let k = 0; k < per; k++) {
        tmpM.set(3.5, 0, 0, IC.u + Math.cos(a) * R * 1.03, 0, 7, 0, WATER_Y - 6, 0, 0, 1, IC.v + Math.sin(a) * R * 1.03, 0, 0, 0, 1);
        im.setMatrixAt(i++, tmpM);
      }
    }
    im.frustumCulled = false;
    im.renderOrder = 4;
    im.name = 'slNieblaCascada';
    this.root.add(im);
    this.mist = im;
  }

  // El Paraná corre: ondas que bajan hacia el sur en la normal (sin texturas).
  flowWater() {
    const w = this.campo.water;
    if (!w) return;
    const T = this.time;
    const mat = w.material;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRio;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRio = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vRio;').replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 q = vRio;
          vec2 r1 = vec2(q.x * 0.83 + q.y * 0.56, -q.x * 0.56 + q.y * 0.83);
          float a = sin(r1.x * 0.37 + sin(r1.y * 0.11) * 2.3 + uTime * 0.7) + 0.6 * sin(q.x * 0.71 - q.y * 0.29 + uTime * 1.3 + sin(q.y * 0.05) * 3.0);
          float b = sin(q.y * 0.43 + uTime * 1.9 + sin(q.x * 0.17) * 2.0) + 0.5 * sin(r1.y * 1.1 + r1.x * 0.3 + uTime * 2.6);
          vec3 dn = (viewMatrix * vec4(a * 0.035, 0.0, b * 0.045, 0.0)).xyz;
          normal = normalize(normal + dn);
        }`,
      );
    };
    mat.customProgramCacheKey = () => 'slRio';
    mat.needsUpdate = true;
  }

  // ---------------- los botes ----------------
  buildBoats() {
    const geo = chalupa();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const T = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aOar;\nattribute vec3 aPiv;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (aOar != 0.0) {
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.29;
          float sw = sin(uTime * 2.4 + ph) * 0.5;
          vec3 d = transformed - aPiv;
          float c = cos(sw * aOar), s = sin(sw * aOar);
          d.xz = vec2(c * d.x - s * d.z, s * d.x + c * d.z);
          d.y += cos(uTime * 2.4 + ph) * 0.25 * abs(d.x) * 0.3;
          transformed = aPiv + d;
        }`,
      );
    };
    mat.customProgramCacheKey = () => 'slChalupa';
    const n = 6;
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = true;
    im.name = 'slBotes';
    this.root.add(im);
    this.boatMesh = im;
    // el farol violeta de cada bote
    const lg = new THREE.OctahedronGeometry(0.22, 0);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc070ff).multiplyScalar(2.4), toneMapped: false });
    const li = new THREE.InstancedMesh(lg, lm, n);
    li.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    li.frustumCulled = false;
    li.name = 'slBotesFarol';
    this.root.add(li);
    this.boatLamp = li;
    // cada bote: de qué barco sale y a qué playa va (al pie de una bajada)
    this.boats = [];
    for (let i = 0; i < n; i++) {
      const sh = F.ships[i % F.ships.length];
      const b = F.bajadas[i % 2];
      const lv = b + (i < 2 ? 0 : (i % 3) - 1) * 4.2 + (i >= 4 ? (i % 2 ? 6 : -6) : 0);
      const from = [sh[0] - 4 + (i % 2) * 2, sh[1] + (i % 2 ? 6 : -6)];
      const to = [edgeU(lv) + 13.2, lv];
      this.boats.push({ i, from, to, k: 0, state: 'wait', t: 2 + i * 3.1, dur: 13 + (i % 3) * 2, rush: 0 });
    }
    this.boatsOn = false;
    this.place();
  }

  // Los botes: on (las fases del desembarco) y onLand(punto u, v) cuando uno toca la playa.
  setBoats(on, onLand = null) {
    this.boatsOn = on;
    if (onLand) this.onLand = onLand;
  }

  // La invocación de El Eclipse: los que esperan salen ya, a todo remo.
  rush() {
    for (const B of this.boats) {
      if (B.state === 'wait') B.t = 0;
      B.rush = 1;
    }
  }

  place() {
    const im = this.boatMesh;
    if (!im) return;
    const t = this.time.value;
    for (const B of this.boats) {
      const k = B.k;
      const u = B.from[0] + (B.to[0] - B.from[0]) * k;
      const v = B.from[1] + (B.to[1] - B.from[1]) * k + Math.sin(k * Math.PI) * (B.i % 2 ? 9 : -9);
      const du = B.to[0] - B.from[0];
      const dv = B.to[1] - B.from[1] + Math.cos(k * Math.PI) * Math.PI * (B.i % 2 ? 9 : -9);
      const back = B.state === 'back';
      let yaw = Math.atan2(du, dv) + (back ? Math.PI : 0);
      const bob = Math.sin(t * 1.7 + B.i) * 0.06;
      // (la matriz [1][0]: rema o no — lo lee el sombreador de los remos)
      tmpQ.setFromEuler(tmpE.set(bob, yaw, Math.sin(t * 1.3 + B.i * 2) * 0.05, 'YXZ'));
      tmpM.compose(tmpV.set(u, WATER_Y - 0.15 + bob * 0.5, v), tmpQ, tmpS.set(1, 1, 1));
      im.setMatrixAt(B.i, tmpM);
      tmpV.set(0, 1.4, 3.3).applyMatrix4(tmpM);
      tmpM.compose(tmpV, tmpQ.identity(), tmpS.setScalar(B.state === 'wait' ? 0.6 : 1 + 0.25 * Math.sin(t * 6 + B.i)));
      this.boatLamp.setMatrixAt(B.i, tmpM);
    }
    im.instanceMatrix.needsUpdate = true;
    this.boatLamp.instanceMatrix.needsUpdate = true;
  }

  updateBoats(dt) {
    if (!this.boats) return;
    for (const B of this.boats) {
      B.t -= dt;
      const sp = B.rush ? 1.7 : 1;
      if (B.state === 'wait') {
        B.k = 0;
        if (B.t <= 0 && this.boatsOn) {
          B.state = 'go';
          B.t = B.dur / sp;
        }
      } else if (B.state === 'go') {
        B.k = Math.min(1, B.k + (dt * sp) / B.dur);
        if (B.k >= 1) {
          B.state = 'land';
          B.t = 4;
          this.onLand?.(B.to[0] - 1.5, B.to[1], B.i);
        }
      } else if (B.state === 'land') {
        if (B.t <= 0) {
          B.state = 'back';
          B.rush = 0;
        }
      } else if (B.state === 'back') {
        B.k = Math.max(0, B.k - dt / (B.dur * 0.9));
        if (B.k <= 0) {
          B.state = 'wait';
          B.t = 3 + B.i * 0.7;
        }
      }
    }
    this.place();
  }

  // k: cuánto se ven el fuego y el humo (1); al amanecer, menos
  update(dt, t) {
    if (this.off) return;
    this.time.value = t;
    for (const L of this.lights) L.l.intensity = L.base * this.k.value * (0.75 + 0.15 * Math.sin(t * 11 + L.ph) + 0.1 * Math.sin(t * 23.7 + L.ph * 3));
    this.updateBoats(dt);
  }

  // Lo de las luces de evento afuera (al irse de la arena)
  lightsOff() {
    for (const L of this.lights || []) L.l.intensity = 0;
  }

  dispose() {
    this.lightsOff();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}
