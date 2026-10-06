import * as THREE from 'three';
import { buildProp } from '../world/props';
import { registerEsterosProps } from '../world/esterosProps';

// Los decorados del final de Eclipse Matero (ui/EclipseEnding.js): lejos de las
// islas y del campo de San Lorenzo, en el vacío, con su propio cielo. Nada de
// luces nuevas: el cielo es un domo pintado, la luz es la de siempre (la del
// eclipse, la hemisférica y la ambiente, con otros valores mientras se ve un
// decorado) y el fuego y la linterna toman prestados fogonazos de fx.
//  · el estero de 1877: el algarrobo, el agua, los juncos; el facón clavado al
//    pie con la cinta colorada;
//  · el santuario del Gauchito: la capillita colorada, la cruz con cintas,
//    banderas coloradas, velas y botellas;
//  · el fogón del camino: el fuego con la pava, los troncos para sentarse, el
//    camino de tierra y otro santuario chico a un costado;
//  · el Primer Mate (una calabaza lisa, sin virola) y la linterna.

// dónde: al oeste de todo, a 20 m de alto
export const STAGE = new THREE.Vector3(-260, 20, 186);
// los decorados, a lo largo de x (cada uno a 40 m del otro)
export const SET = {
  campo: new THREE.Vector3(-80, 0, 0),
  estero: new THREE.Vector3(0, 0, 0),
  santuario: new THREE.Vector3(45, 0, 0),
  fogon: new THREE.Vector3(90, 0, 0),
};
export const at = (k, x = 0, z = 0, out = new THREE.Vector3()) => out.copy(STAGE).add(SET[k]).add(tmpA.set(x, 0, z));
const tmpA = new THREE.Vector3();

// ---------------- el cielo ----------------
const DOME_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DOME_FRAG = `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHor;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunK;
uniform float uStars;
uniform vec3 uMoonDir;
uniform float uMoonK;
uniform float uOpacity;
uniform float uCrack;
varying vec3 vDir;
float hh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.25, el));
  c = mix(c, uTop, smoothstep(0.25, 0.85, el));
  c = mix(c, uGround, smoothstep(0.0, -0.12, el));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * uSunK * (pow(s, 700.0) * 6.0 + pow(s, 40.0) * 0.6 + pow(s, 6.0) * 0.18);
  // estrellas: celdas en la dirección, una de cada tanto prendida
  vec3 q = floor(d * 220.0);
  float st = step(0.9965, hh(q)) * smoothstep(0.05, 0.3, el);
  c += vec3(0.9, 0.92, 1.0) * st * uStars * (0.5 + 0.5 * hh(q + 3.1));
  // la luna llena
  float m = max(dot(d, normalize(uMoonDir)), 0.0);
  c += vec3(0.95, 0.96, 1.0) * uMoonK * (smoothstep(0.9993, 0.9995, m) * 1.4 + pow(m, 60.0) * 0.12);
  // la rajadura (la entrada de Eclipse): una raya quebrada que cruza el cenit y
  // se abre desde arriba hacia los costados
  if (uCrack > 0.001) {
    float az = atan(d.z, d.x);
    float dd = abs(dot(d, normalize(vec3(0.8, 0.0, 0.6))) + 0.035 * sin(az * 13.0 + el * 21.0) + 0.012 * sin(az * 41.0 - el * 33.0));
    float along = acos(clamp(el, -1.0, 1.0));
    float on = step(along, uCrack * 1.7);
    float core = (1.0 - smoothstep(0.0, 0.006, dd)) * on;
    float glow = exp(-dd * 40.0) * on;
    c += vec3(1.0, 0.88, 1.0) * core * 2.2 + vec3(0.55, 0.15, 0.9) * glow * 0.8;
  }
  gl_FragColor = vec4(c, uOpacity);
}`;

// Un cielo pintado que sigue a la cámara (adentro del de Eclipse, que es de 300).
export function makeDome() {
  const U = {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.85, 0.6) },
    uSunK: { value: 0 },
    uStars: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonK: { value: 0 },
    uOpacity: { value: 1 },
    uCrack: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, transparent: true, toneMapped: false });
  // (con prueba de profundidad: va en la tanda de lo transparente, después de
  // todo lo sólido, y sin ella pintaba el cielo encima de los decorados)
  const m = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), mat);
  m.renderOrder = -0.5;
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.onBeforeRender = (_r, _s, cam) => {
    const e = cam.matrixWorld.elements;
    m.matrixWorld.makeTranslation(e[12], e[13], e[14]);
  };
  m.userData.U = U;
  return m;
}

// Los cielos de cada decorado (colores lineales: sin tone mapping).
export const SKIES = {
  noche: { top: 0x01030a, mid: 0x061226, hor: 0x16263a, ground: 0x030508, sun: 0, stars: 1, moon: 1 },
  manana: { top: 0x2c5ca8, mid: 0x6ea0d8, hor: 0xd8c8a8, ground: 0x4a4436, sun: 1, sunCol: 0xffe2b0, stars: 0, moon: 0 },
  tarde: { top: 0x24366a, mid: 0x8a6a8a, hor: 0xf09050, ground: 0x3a2a22, sun: 0.9, sunCol: 0xff9a50, stars: 0, moon: 0 },
  alba: { top: 0x2a4a8a, mid: 0x7a96c8, hor: 0xf4b080, ground: 0x4a3a30, sun: 1, sunCol: 0xffd090, stars: 0, moon: 0 },
};
export function setSky(dome, k, sunDir = null, moonDir = null) {
  const S = SKIES[k];
  const U = dome.userData.U;
  // (el domo va sin tone mapping: los colores, más bajos que en un cielo con exposición)
  const f = 0.78;
  U.uTop.value.set(S.top).multiplyScalar(f);
  U.uMid.value.set(S.mid).multiplyScalar(f);
  U.uHor.value.set(S.hor).multiplyScalar(f);
  U.uGround.value.set(S.ground).multiplyScalar(f);
  U.uSunK.value = S.sun;
  if (S.sunCol) U.uSunCol.value.set(S.sunCol);
  U.uStars.value = S.stars;
  U.uMoonK.value = S.moon;
  if (sunDir) U.uSunDir.value.copy(sunDir);
  if (moonDir) U.uMoonDir.value.copy(moonDir);
}

// ---------------- materiales y piezas ----------------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const addAt = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
// Un piso redondo con colores por vértice (manchas): pasto, tierra o barro.
function groundDisc(radius, a, b, seed = 1) {
  const geo = new THREE.CircleGeometry(radius, 48, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  // (más vértices adentro: una grilla polar)
  const ring = new THREE.RingGeometry(0.5, radius, 64, 24).rotateX(-Math.PI / 2);
  const p = ring.attributes.position;
  const col = new Float32Array(p.count * 3);
  const A = new THREE.Color(a);
  const B = new THREE.Color(b);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const n = 0.5 + 0.25 * Math.sin(x * 0.37 + seed) * Math.cos(z * 0.29 - seed) + 0.25 * Math.sin(x * 1.3 + z * 0.9 + seed * 2);
    c.copy(A).lerp(B, Math.max(0, Math.min(1, n)));
    col.set([c.r, c.g, c.b], i * 3);
    // (los bordes caen apenas: no se ve el canto contra el cielo)
    const r = Math.hypot(x, z) / radius;
    p.setY(i, -Math.max(0, r - 0.85) * 6);
  }
  ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ring.computeVertexNormals();
  geo.dispose();
  const m = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

// El facón clavado en el piso, con la cinta colorada atada en el cabo.
export function buildFacon() {
  const g = new THREE.Group();
  const steel = std(0xc8ccd2, { metalness: 0.9, roughness: 0.28 });
  const wood = std(0x4a2e1a);
  const silver = std(0xd8d8d0, { metalness: 1, roughness: 0.3 });
  const red = std(0xc0201a, { roughness: 0.75, side: THREE.DoubleSide, emissive: 0x500806, emissiveIntensity: 0.6 });
  // la hoja (enterrada a medias), el gavilán, el cabo y la virola
  const blade = new THREE.BoxGeometry(0.035, 0.26, 0.006).translate(0, 0.02, 0);
  addAt(g, blade, steel, 0, 0, 0);
  addAt(g, new THREE.BoxGeometry(0.1, 0.012, 0.016), silver, 0, 0.16, 0);
  addAt(g, new THREE.CylinderGeometry(0.016, 0.018, 0.12, 8), wood, 0, 0.225, 0);
  addAt(g, new THREE.CylinderGeometry(0.019, 0.019, 0.02, 8), silver, 0, 0.29, 0);
  // la cinta: un nudo y dos puntas que cuelgan y se mecen (g.userData.tails)
  addAt(g, new THREE.TorusGeometry(0.022, 0.008, 6, 10).rotateX(Math.PI / 2), red, 0, 0.24, 0);
  const tails = [];
  for (const [dx, len] of [[0.012, 0.32], [-0.01, 0.26]]) {
    const geo = new THREE.PlaneGeometry(0.03, len, 1, 6).translate(0, -len / 2, 0);
    const t = addAt(g, geo, red, dx, 0.24, 0.012);
    t.userData.len = len;
    tails.push(t);
  }
  g.userData.tails = tails;
  return g;
}

// Una bandera colorada en su caña (la tela: un plano que se mece en el vértice).
const FLAG_T = { value: 0 };
let FLAG_MAT = null;
function flagMat() {
  if (FLAG_MAT) return FLAG_MAT;
  FLAG_MAT = std(0xc0201a, { side: THREE.DoubleSide, roughness: 0.8 });
  FLAG_MAT.onBeforeCompile = (s) => {
    s.uniforms.uT = FLAG_T;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      { float u = uv.x; transformed.z += sin(u * 7.0 - uT * 3.1 + position.y * 2.0) * 0.07 * u; transformed.y -= u * u * 0.05; }`,
    );
  };
  FLAG_MAT.customProgramCacheKey = () => 'eclFlag';
  return FLAG_MAT;
}
export const tickFlags = (t) => (FLAG_T.value = t);
function flag(parent, x, z, h, rot, M) {
  addAt(parent, new THREE.CylinderGeometry(0.018, 0.022, h, 6).translate(0, h / 2, 0), M.cane, x, 0, z);
  const w = 0.75;
  const fh = 0.48;
  const geo = new THREE.PlaneGeometry(w, fh, 8, 2).translate(w / 2, -fh / 2, 0);
  addAt(parent, geo, flagMat(), x, h - 0.02, z, 0, rot, 0);
}
// velas: un cilindro y la llama (un brillo)
function candles(parent, list, M, glowTex) {
  const flames = [];
  for (const [x, z, h] of list) {
    addAt(parent, new THREE.CylinderGeometry(0.025, 0.028, h, 8).translate(0, h / 2, 0), M.candle, x, 0, z);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb050, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    s.position.set(x, h + 0.035, z);
    s.scale.setScalar(0.09);
    s.userData.base = 0.09;
    parent.add(s);
    flames.push(s);
  }
  return flames;
}
// botellas (de vidrio verde y ámbar)
function bottles(parent, list, M) {
  for (const [x, z, k] of list) {
    const mat = k ? M.glassG : M.glassA;
    addAt(parent, new THREE.CylinderGeometry(0.035, 0.038, 0.18, 8).translate(0, 0.09, 0), mat, x, 0, z);
    addAt(parent, new THREE.CylinderGeometry(0.012, 0.03, 0.08, 8).translate(0, 0.22, 0), mat, x, 0, z);
  }
}
// La capillita del Gauchito: un cajón colorado con techo a dos aguas, la
// puertita oscura y una cruz arriba.
function capilla(parent, x, z, s, rot, M) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.scale.setScalar(s);
  addAt(g, new THREE.BoxGeometry(1.1, 1.0, 0.9).translate(0, 0.5, 0), M.red, 0, 0, 0);
  // el techo
  const roof = new THREE.CylinderGeometry(0.62, 0.62, 1.0, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  const r = addAt(g, roof, M.redDark, 0, 1.18, 0);
  r.scale.set(1, 0.55, 1.0);
  addAt(g, new THREE.BoxGeometry(0.42, 0.62, 0.04), M.dark, 0, 0.36, 0.46);
  addAt(g, new THREE.BoxGeometry(0.05, 0.38, 0.05), M.white, 0, 1.68, 0);
  addAt(g, new THREE.BoxGeometry(0.24, 0.05, 0.05), M.white, 0, 1.76, 0);
  parent.add(g);
  return g;
}

// ---------------- los decorados ----------------
export function buildSets(g) {
  const root = new THREE.Group();
  root.name = 'eclipseFinSets';
  root.position.copy(STAGE);
  const W = g.world;
  // (los muebles del estero: el algarrobo, la cruz con cintas, el fogón)
  try {
    registerEsterosProps();
  } catch {
    /* ya estaban */
  }
  const M = {
    red: std(0xa0201a),
    redDark: std(0x6a140e),
    dark: std(0x120c0a),
    white: std(0xe8e0d0),
    cane: std(0x8a7048),
    candle: std(0xf0e6cc, { emissive: 0x3a2a10, emissiveIntensity: 0.6 }),
    glassG: std(0x2a6a3a, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }),
    glassA: std(0x8a5a1a, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }),
    log: std(0x5a4030),
    water: std(0x10202c, { roughness: 0.35, metalness: 0.1 }),
    reed: std(0x4a5a2a),
  };
  const glowTex = g.textures?.dot;
  const prop = (type, x, z, o = {}, seed = 7) => {
    const p = buildProp({ type, pos: [x, z], ...o }, W.M, seed);
    if (!p) return null;
    p.obj.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    root.add(p.obj);
    return p.obj;
  };
  const out = { root, M, flames: [], parts: {} };

  // el campo (solo si no está el de San Lorenzo de la arena): pasto y ombúes lejos
  {
    const o = SET.campo;
    const gr = groundDisc(48, 0x6a8a3a, 0x8a9a4a, 4);
    gr.position.copy(o);
    root.add(gr);
    for (const [x, z, s] of [[30, -18, 1.3], [26, 22, 1.1], [-20, 26, 1.2], [-28, -20, 1]]) prop('ombu', o.x + x, o.z + z, { s }, 13);
  }
  // el estero de 1877: el algarrobo, el agua con juncos y el facón al pie
  {
    const o = SET.estero;
    const gr = groundDisc(26, 0x4a5a2e, 0x667a3a, 2);
    gr.position.copy(o);
    root.add(gr);
    const water = new THREE.Mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), M.water);
    water.position.set(o.x - 9, 0.03, o.z + 7);
    water.receiveShadow = true;
    root.add(water);
    out.parts.tree = prop('algarrobo', o.x, o.z, { s: 1.25 }, 11);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const r = 8.5 + Math.sin(k * 3.7) * 0.8;
      const h = 0.9 + 0.5 * Math.abs(Math.sin(k * 1.9));
      addAt(root, new THREE.ConeGeometry(0.03, h, 4).translate(0, h / 2, 0), M.reed, o.x - 9 + Math.cos(a) * r, 0, o.z + 7 + Math.sin(a) * r, 0.1 * Math.sin(k), 0, 0.12 * Math.cos(k * 2.3));
    }
    const facon = buildFacon();
    facon.position.set(o.x + 0.95, 0, o.z + 1.2);
    facon.rotation.set(0.08, 0.6, -0.1);
    root.add(facon);
    out.parts.facon = facon;
  }
  // el santuario del Gauchito: la capillita, la cruz con cintas, banderas, velas, botellas
  {
    const o = SET.santuario;
    const gr = groundDisc(24, 0x9a7050, 0xb08a60, 5);
    gr.position.copy(o);
    root.add(gr);
    capilla(root, o.x, o.z, 1.0, 0, M);
    prop('cruzCinta', o.x - 1.1, o.z + 0.55, { h: 1.4 }, 3);
    prop('cruzCinta', o.x + 1.15, o.z + 0.5, { h: 1.2 }, 5);
    for (let k = 0; k < 14; k++) {
      const a = -1.25 + (k / 13) * 2.5;
      const r = 2.2 + (k % 3) * 0.55;
      flag(root, o.x + Math.sin(a) * r, o.z - Math.cos(a) * r * 0.55 + 0.2, 2.2 + (k % 4) * 0.35, 0.3 * Math.sin(k), M);
    }
    const cl = [];
    for (let k = 0; k < 16; k++) cl.push([o.x - 0.9 + (k % 8) * 0.26, o.z + 0.75 + Math.floor(k / 8) * 0.22 + 0.05 * Math.sin(k * 2.1), 0.1 + 0.08 * ((k * 7) % 3)]);
    out.flames.push(...candles(root, cl, M, glowTex));
    const bl = [];
    for (let k = 0; k < 12; k++) bl.push([o.x - 1.4 + k * 0.25, o.z + 1.35 + 0.08 * Math.sin(k * 1.7), k % 2]);
    bottles(root, bl, M);
  }
  // el fogón del camino: el fuego, los troncos, el camino y el santuario chico
  {
    const o = SET.fogon;
    const gr = groundDisc(24, 0x5a5034, 0x6e6040, 9);
    gr.position.copy(o);
    root.add(gr);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 46).rotateX(-Math.PI / 2), std(0x8a7058, { roughness: 1 }));
    road.position.set(o.x + 4.5, 0.012, o.z);
    road.receiveShadow = true;
    root.add(road);
    prop('fogonCampo', o.x, o.z, {}, 4);
    // los cuatro troncos alrededor (asiento a 0,40 m)
    out.seats = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = o.x + Math.cos(a) * 1.75;
      const z = o.z + Math.sin(a) * 1.75;
      const log = addAt(root, new THREE.CylinderGeometry(0.19, 0.21, 1.1, 10).rotateZ(Math.PI / 2), M.log, x, 0.2, z, 0, -a + Math.PI / 2, 0);
      log.userData.a = a;
      out.seats.push({ x, z, a });
    }
    capilla(root, o.x + 6.6, o.z - 2.4, 0.62, -Math.PI / 2, M);
    for (let k = 0; k < 5; k++) flag(root, o.x + 6.0 + (k % 2) * 1.2, o.z - 3.8 + k * 0.7, 1.9 + (k % 3) * 0.25, 0.4 * k, M);
    const cl = [];
    for (let k = 0; k < 7; k++) cl.push([o.x + 5.9 + (k % 2) * 0.18, o.z - 3.0 + k * 0.22, 0.12]);
    out.flames.push(...candles(root, cl, M, glowTex));
    bottles(root, [[o.x + 6.2, o.z - 1.1, 1], [o.x + 6.35, o.z - 1.0, 0], [o.x + 6.1, o.z - 0.9, 1]], M);
    // el fuego: llamas (brillos) arriba de las brasas
    const fire = new THREE.Group();
    fire.position.set(o.x, 0.15, o.z);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k < 2 ? 0xffe0a0 : 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
      s.position.set(Math.sin(k * 2.4) * 0.12, 0.15 + k * 0.08, Math.cos(k * 2.4) * 0.12);
      s.scale.setScalar(0.5 - k * 0.04);
      s.userData.base = 0.5 - k * 0.04;
      s.userData.ph = k * 1.7;
      fire.add(s);
    }
    root.add(fire);
    out.fire = fire;
  }
  root.visible = false;
  return out;
}

// ---------------- el Primer Mate y la linterna ----------------
// La calabaza lisa, sin virola ni adornos, con su bombilla; un brillo que
// crece cuando "muestra lo que podría ser".
export function buildPrimerMate(g) {
  const gr = new THREE.Group();
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, map: g.textures?.gourd || null, roughness: 0.6, emissive: new THREE.Color(0xffa040), emissiveIntensity: 0 }));
  gourd.scale.set(1, 1.18, 1);
  gourd.position.y = 0.06;
  gr.add(gourd);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }));
  straw.position.set(0.02, 0.15, 0);
  straw.rotation.z = -0.22;
  gr.add(straw);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot, color: 0xffc070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.0, toneMapped: false }));
  glow.position.y = 0.07;
  glow.scale.setScalar(0.5);
  gr.add(glow);
  gr.userData = { gourd, glow };
  gr.visible = false;
  return gr;
}

// La linterna del hombre dorado (la del molino: ui/introShots buildLantern).
export function buildLantern(g) {
  const T = g.textures;
  const root = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2.2), transparent: true, opacity: 0.85 });
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.17, 10, 1, true), glass);
  box.position.y = -0.14;
  root.add(box);
  for (const y of [-0.05, -0.23]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(y > -0.1 ? 0.05 : 0.09, 0.09, 0.03, 10), iron);
    cap.position.y = y;
    root.add(cap);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 12), iron);
  ring.position.y = 0.01;
  root.add(ring);
  const add = (color, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, toneMapped: false }));
    s.scale.setScalar(scale);
    s.position.y = -0.14;
    root.add(s);
    return s;
  };
  const flame = add(0xffc070, 0.22, 1);
  const halo = add(0xff9a40, 0.7, 0.3);
  root.visible = false;
  return { root, flame, halo, glass, on: 1 };
}
