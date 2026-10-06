import * as THREE from 'three';
import { rng } from '../core/noise';

// El pajonal del estero de cerca: matas de paja colorada de verdad, con
// volumen. Cada mata es un manojo de hojas largas y angostas que salen de la
// base y se arquean hacia afuera (las de adentro paradas, las de afuera
// caídas), más unas cañas con la panoja colorada arriba. Todo geometría
// sólida de dos caras (nada de recortes con transparencia): de cerca se ven
// las hojas una por una y de lejos arman una masa tupida.
//
// Las matas se instancian por variantes (tres semillas) y por pedazos del mapa
// (así el recorte por cámara saca las que no se ven).

const LEAF_SEGS = 5;

// Lo vegetal de doble cara: las dos caras de cada hoja con la misma normal.
// three da vuelta la normal en la cara de atrás (DoubleSide), y las normales
// puestas a mano (para arriba en las matas de planos, hacia afuera en las
// hojas y en las copas) del lado de atrás quedaban mirando al suelo o para
// adentro: la mitad de las hojas, salteadas, salían oscuras, y el pajonal se
// veía blancuzco y granulado. Así se ilumina parejo, como se pensó.
const FLIP = 'normal *= faceDirection;';
const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
export function evenFoliage(mat) {
  if (mat.userData.even) return mat;
  mat.userData.even = true;
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey;
  const base = key === PROTO_KEY ? () => prev.toString() : () => key.call(mat);
  mat.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace(FLIP, ''));
  };
  mat.customProgramCacheKey = () => `${base()}|even`;
  return mat;
}

// Colores de la mata: la base oscura y húmeda, el medio verde oliva y la punta
// pajiza; las hojas secas van de paja a marrón; la panoja, cobre.
const BASE = new THREE.Color(0x1c2010);
const MID = new THREE.Color(0x4a5228);
const TIP = new THREE.Color(0x7a7a4e);
const DRY_MID = new THREE.Color(0x645a36);
const DRY_TIP = new THREE.Color(0x8a7c54);
const PANOJA = new THREE.Color(0x6a4630);
const PANOJA_TIP = new THREE.Color(0x8a6a4a);

// Una mata de 1 m de alto (la instancia la estira a su altura).
// tip: el ancho de la punta de cada hoja (m, antes de estirar la mata).
// wide: cuánto más anchas las hojas y las cañas (1 = como siempre).
// Para las de lejos (LODS): la misma mata (las mismas hojas en el mismo lugar)
// con menos tramos por hoja (segs), una de cada `step` hojas y cañas (más
// anchas, leafWide: tapa lo mismo), y la caña y la panoja más cortadas.
export function tussockGeometry(seed, { leaves = 34, stems = 7, tip = 0.002, wide = 1, segs = LEAF_SEGS, step = 1, leafWide = 1, stemSegs = 3, strandSegs = 2, strandStep = 1 } = {}) {
  const r = rng(seed);
  const P = [];
  const N = [];
  const C = [];
  const I = [];
  const c = new THREE.Color();
  const push = (x, y, z, nx, ny, nz, col) => {
    P.push(x, y, z);
    N.push(nx, ny, nz);
    C.push(col.r, col.g, col.b);
    return P.length / 3 - 1;
  };
  // una cinta a lo largo de una curva: puntos, ancho en cada punto y color
  const ribbon = (pts, widths, cols, side, nrm) => {
    const first = P.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const [x, y, z] = pts[k];
      const w = widths[k] / 2;
      push(x - side[0] * w, y - side[1] * w, z - side[2] * w, nrm[0], nrm[1], nrm[2], cols[k]);
      push(x + side[0] * w, y + side[1] * w, z + side[2] * w, nrm[0], nrm[1], nrm[2], cols[k]);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = first + k * 2;
      I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  // las hojas
  for (let k = 0; k < leaves; k++) {
    const az = r() * Math.PI * 2;
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    // las de afuera más acostadas y más cortas
    const out = r();
    const tilt = 0.08 + out * 0.72;
    const len = (0.95 + r() * 0.3) * (1 - out * 0.3);
    const droop = 0.08 + out * 0.4 + r() * 0.12;
    const r0 = r() * 0.07;
    const w0 = (0.022 + r() * 0.018) * wide * leafWide;
    const dry = r() < 0.28;
    const twist = (r() - 0.5) * 1.2;
    // (los números de esta hoja ya salieron: la que se saltea no corre a las demás)
    if (k % step) continue;
    const pts = [];
    const widths = [];
    const cols = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const h = Math.sin(tilt) * len * t;
      const y = Math.cos(tilt) * len * t - droop * len * t * t;
      pts.push([dx * (r0 + h), Math.max(0, y), dz * (r0 + h)]);
      widths.push(w0 * Math.pow(1 - t, 0.6) + tip);
      if (t < 0.35) c.copy(BASE).lerp(dry ? DRY_MID : MID, t / 0.35);
      else c.copy(dry ? DRY_MID : MID).lerp(dry ? DRY_TIP : TIP, (t - 0.35) / 0.65);
      cols.push(c.clone());
    }
    // la cara de la hoja: de costado respecto de su dirección (con un giro)
    const side = [-dz * Math.cos(twist), Math.sin(twist) * 0.4, dx * Math.cos(twist)];
    // la normal: hacia afuera y para arriba (la luna la ilumina pareja)
    const nl = Math.hypot(dx * 0.7, 0.75, dz * 0.7);
    ribbon(pts, widths, cols, side, [(dx * 0.7) / nl, 0.75 / nl, (dz * 0.7) / nl]);
  }
  // las cañas con la panoja: más altas que las hojas
  for (let k = 0; k < stems; k++) {
    const az = r() * Math.PI * 2;
    const dx = Math.cos(az);
    const dz = Math.sin(az);
    const lean = r() * 0.22;
    const top = 1.04 + r() * 0.22;
    // (la que se saltea igual saca los números de su panoja)
    const skip = k % step !== 0;
    const pts = [];
    const cols = [];
    for (let s = 0; s <= stemSegs; s++) {
      const t = s / stemSegs;
      pts.push([dx * Math.sin(lean) * top * t * t, top * t, dz * Math.sin(lean) * top * t * t]);
      cols.push(c.copy(BASE).lerp(DRY_MID, t).clone());
    }
    const side = [-dz, 0, dx];
    const sw = [0.012, 0.01, 0.009, 0.008];
    if (!skip) ribbon(pts, pts.map((_, s) => sw[Math.round((s / stemSegs) * 3)] * wide * leafWide), cols, side, [dx * 0.5, 0.86, dz * 0.5]);
    // la panoja: unas hebras que cuelgan de la punta, abiertas en abanico
    const [tx, ty, tz] = pts[pts.length - 1];
    const strands = 5;
    for (let j = 0; j < strands; j++) {
      const a = az + (j / strands) * Math.PI * 2 + r();
      const ex = Math.cos(a);
      const ez = Math.sin(a);
      const l = 0.16 + r() * 0.14;
      if (skip || j % strandStep) continue;
      const sp = [
        [tx, ty, tz],
        [tx + ex * l * 0.35 + dx * 0.02, ty - l * 0.45, tz + ez * l * 0.35 + dz * 0.02],
        [tx + ex * l * 0.5 + dx * 0.03, ty - l, tz + ez * l * 0.5 + dz * 0.03],
      ];
      const sc = [PANOJA, c.copy(PANOJA).lerp(PANOJA_TIP, 0.6).clone(), PANOJA_TIP];
      const sws = [0.03, 0.035, 0.004].map((v) => v * leafWide);
      if (strandSegs >= 2) ribbon(sp, sws, sc, [-ez, 0, ex], [ex * 0.5, 0.86, ez * 0.5]);
      else ribbon([sp[0], sp[2]], [sws[1], sws[2]], [sc[0], sc[2]], [-ez, 0, ex], [ex * 0.5, 0.86, ez * 0.5]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  return geo;
}

// Las matas por distancia a la cámara: de cerca enteras; más allá de LOD_NEAR
// la misma mata con menos tramos por hoja (de lejos la curva no se distingue);
// más allá de LOD_MID la mitad de las hojas, más anchas; más allá de LOD_FAR,
// perdidas en la niebla, nada. Eran ~1,7 millones de triángulos por pasada
// (mundo, G-buffer y espejo): la mata más cara de la vista. Medido en Épica a
// 1440p, parado en la tranquera de la laguna mirando al campamento.
// (globalThis.__mduNoGrassLod: todas enteras, como antes)
const LODS = [
  {},
  { segs: 3, stemSegs: 2, strandSegs: 1 },
  { segs: 2, step: 2, leafWide: 1.45, stemSegs: 1, strandSegs: 1, strandStep: 2 },
];
const LOD_NEAR = 18;
const LOD_MID = 42;
const LOD_FAR = 78;
// (margen para que una mata en el borde no salte de una a otra)
const LOD_HYST = 1.5;
// (se rehace cuando la cámara anduvo esto, en metros)
const LOD_STEP = 1;

// Las matas: spots = [x, y, z, alto, ángulo, ancho]. Una InstancedMesh por
// variante y por detalle (LODS): 9 llamadas de dibujo. Antes iban en pedazos
// de mapa (chunk celdas de lado) para el recorte; con los detalles por
// distancia eran demasiadas, y ahora las de cerca y las del medio van en una
// esfera alrededor de la cámara, que corre con ella. Devuelve las mallas;
// `lod(cam)` (antes de dibujar, World.preRender) reparte cada mata en la de
// su distancia. (Los números al azar salen en el mismo orden que antes, por
// pedazo: las matas quedan iguales.)
export function buildTussocks(root, spots, mat, { variants = 3, chunk = 21, seed = 51, leaves = 34, stems = 7 } = {}) {
  const r = rng(seed);
  const geos = [];
  for (let k = 0; k < variants; k++) geos.push(LODS.map((L) => tussockGeometry(seed * 7 + k * 131, { leaves, stems, ...L })));
  // (es pasto: en Épica, poca oclusión y sin reflejo; fx/Epic.js)
  mat.userData.foliage = true;
  const groups = new Map();
  for (const s of spots) {
    const key = `${Math.floor(s[0] / chunk)},${Math.floor(s[2] / chunk)},${Math.floor(r() * variants)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const m = new THREE.Matrix4();
  const qt = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  const per = Array.from({ length: variants }, () => ({ mats: [], cols: [], xz: [] }));
  for (const [key, list] of groups) {
    const V = per[Number(key.split(',')[2])];
    for (const [x, y, z, h, a, wd = 1] of list) {
      qt.setFromAxisAngle(up, a);
      const s = h * (0.55 + r() * 0.12) * wd;
      m.compose(v.set(x, y, z), qt, sc.set(s, h, s));
      V.mats.push(...m.elements);
      // unas más verdes, otras más secas o más oscuras
      const d = 0.78 + r() * 0.34;
      const dry = r() * 0.12;
      tint.setRGB(d * (1 + dry), d * (1 + dry * 0.5), d * (0.92 - dry));
      V.cols.push(tint.r, tint.g, tint.b);
      V.xz.push(x, z);
    }
  }
  const meshes = [];
  const sets = [];
  for (const [vi, V] of per.entries()) {
    const n = V.xz.length / 2;
    if (!n) continue;
    const S = { mats: new Float32Array(V.mats), cols: new Float32Array(V.cols), xz: new Float32Array(V.xz), lod: new Uint8Array(n).fill(255), ims: [], all: null };
    for (let L = 0; L < LODS.length; L++) {
      const im = new THREE.InstancedMesh(geos[vi][L], mat, n);
      im.instanceMatrix.array.set(S.mats);
      im.instanceColor = new THREE.InstancedBufferAttribute(S.cols.slice(), 3);
      im.computeBoundingSphere();
      // (la esfera con todas: la de "todas enteras"; las otras siguen a la cámara)
      if (!L) S.all = im.boundingSphere.clone();
      im.receiveShadow = true;
      // las de lejos no van en el espejo del agua (fx/Water cullList): ahí
      // su reflejo queda detrás de la orilla
      if (L === 2) im.userData.reflect = false;
      // (hasta el primer reparto, solo las enteras, con todas)
      if (L) {
        im.count = 0;
        im.visible = false;
      }
      root.add(im);
      meshes.push(im);
      S.ims.push(im);
    }
    sets.push(S);
  }
  const at = new THREE.Vector3();
  let lastX = Infinity;
  let lastZ = Infinity;
  let lastAll = null;
  meshes.lod = (cam) => {
    at.setFromMatrixPosition(cam.matrixWorld);
    const all = globalThis.__mduNoGrassLod === true;
    if (all === lastAll && Math.hypot(at.x - lastX, at.z - lastZ) < LOD_STEP) return;
    lastAll = all;
    lastX = at.x;
    lastZ = at.z;
    for (const S of sets) relod(S, at, all);
  };
  return meshes;
}

// el radio de la esfera de cada detalle (lo más lejos que llega, más una mata)
const REACH = [LOD_NEAR + LOD_HYST + 3, LOD_MID + LOD_HYST + 3, LOD_FAR + LOD_HYST + 3];

function relod(S, at, all) {
  const n = S.lod.length;
  const cx = at.x;
  const cz = at.z;
  let changed = false;
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(S.xz[k * 2] - cx, S.xz[k * 2 + 1] - cz);
    const was = S.lod[k];
    let L;
    if (all) L = 0;
    else {
      // el borde de cada escalón, corrido hacia el lado de donde viene
      const e = (edge, lo) => edge + (was === 255 ? 0 : was <= lo ? LOD_HYST : -LOD_HYST);
      L = d < e(LOD_NEAR, 0) ? 0 : d < e(LOD_MID, 1) ? 1 : d < e(LOD_FAR, 2) ? 2 : 3;
    }
    if (L !== was) {
      S.lod[k] = L;
      changed = true;
    }
  }
  // las esferas van con la cámara (a la altura del medio de todas)
  for (let L = 0; L < S.ims.length; L++) {
    const B = S.ims[L].boundingSphere;
    if (all) B.copy(S.all);
    else {
      B.center.set(cx, S.all.center.y, cz);
      B.radius = REACH[L];
    }
  }
  if (!changed) return;
  for (let L = 0; L < S.ims.length; L++) {
    const im = S.ims[L];
    const M = im.instanceMatrix.array;
    const C = im.instanceColor.array;
    let c = 0;
    for (let k = 0; k < n; k++) {
      if (S.lod[k] !== L) continue;
      M.set(S.mats.subarray(k * 16, k * 16 + 16), c * 16);
      C.set(S.cols.subarray(k * 3, k * 3 + 3), c * 3);
      c++;
    }
    im.count = c;
    im.visible = c > 0;
    // (la pasada de profundidad comparte las matrices: fx/prepass)
    const pre = im.userData.prepass;
    if (pre) pre.count = c;
    if (!c) continue;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, c * 16);
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.clearUpdateRanges();
    im.instanceColor.addUpdateRange(0, c * 3);
    im.instanceColor.needsUpdate = true;
  }
}

// La copa de un árbol: muchas hojitas (rombos) repartidas en una bola de radio
// 1, con la normal hacia afuera desde el centro (así la copa se ilumina
// redonda y suave) y más oscuras adentro y abajo. El color lo da el material
// (el verde del monte, el rosa del lapacho); acá solo la luz y la sombra.
let crownGeo = null;
export function leafCrownGeometry() {
  if (crownGeo) return crownGeo;
  const r = rng(313);
  const P = [];
  const N = [];
  const C = [];
  const I = [];
  const d = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = 260;
  // los bultos de la copa: hacia dónde se abulta (las ramas de adentro)
  const lumps = [];
  for (let k = 0; k < 6; k++) lumps.push(new THREE.Vector3(r() * 2 - 1, r() * 1.4 - 0.4, r() * 2 - 1).normalize());
  for (let k = 0; k < n; k++) {
    // un punto en la bola (más en la cáscara), un poco aplastada
    d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (d.lengthSq() < 0.01) d.set(0, 1, 0);
    d.normalize();
    const lump = 0.62 + 0.38 * Math.max(...lumps.map((l) => l.dot(d))) ** 2;
    const rad = (0.45 + 0.55 * Math.sqrt(r())) * lump;
    const cx = d.x * rad;
    const cy = d.y * rad * 0.78;
    const cz = d.z * rad;
    // la hoja: un rombo más o menos de frente a afuera, torcido al azar
    a.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(d).normalize();
    b.crossVectors(d, a).normalize();
    const L = 0.16 + r() * 0.16;
    const W = 0.07 + r() * 0.07;
    const shade = (0.38 + 0.62 * (0.5 + 0.5 * d.y)) * (0.55 + 0.45 * rad) * (0.85 + r() * 0.3);
    const first = P.length / 3;
    const pts = [
      [cx - a.x * L, cy - a.y * L, cz - a.z * L],
      [cx + b.x * W, cy + b.y * W, cz + b.z * W],
      [cx + a.x * L, cy + a.y * L, cz + a.z * L],
      [cx - b.x * W, cy - b.y * W, cz - b.z * W],
    ];
    for (const [x, y, z] of pts) {
      P.push(x, y, z);
      N.push(d.x, d.y, d.z);
      C.push(shade, shade, shade);
    }
    I.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  crownGeo = geo;
  return geo;
}
