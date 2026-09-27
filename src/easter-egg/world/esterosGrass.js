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
export function tussockGeometry(seed, { leaves = 34, stems = 7, tip = 0.002, wide = 1 } = {}) {
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
    const w0 = (0.022 + r() * 0.018) * wide;
    const dry = r() < 0.28;
    const twist = (r() - 0.5) * 1.2;
    const pts = [];
    const widths = [];
    const cols = [];
    for (let s = 0; s <= LEAF_SEGS; s++) {
      const t = s / LEAF_SEGS;
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
    const pts = [];
    const cols = [];
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      pts.push([dx * Math.sin(lean) * top * t * t, top * t, dz * Math.sin(lean) * top * t * t]);
      cols.push(c.copy(BASE).lerp(DRY_MID, t).clone());
    }
    const side = [-dz, 0, dx];
    ribbon(pts, [0.012, 0.01, 0.009, 0.008].map((v) => v * wide), cols, side, [dx * 0.5, 0.86, dz * 0.5]);
    // la panoja: unas hebras que cuelgan de la punta, abiertas en abanico
    const [tx, ty, tz] = pts[pts.length - 1];
    const strands = 5;
    for (let j = 0; j < strands; j++) {
      const a = az + (j / strands) * Math.PI * 2 + r();
      const ex = Math.cos(a);
      const ez = Math.sin(a);
      const l = 0.16 + r() * 0.14;
      const sp = [
        [tx, ty, tz],
        [tx + ex * l * 0.35 + dx * 0.02, ty - l * 0.45, tz + ez * l * 0.35 + dz * 0.02],
        [tx + ex * l * 0.5 + dx * 0.03, ty - l, tz + ez * l * 0.5 + dz * 0.03],
      ];
      ribbon(sp, [0.03, 0.035, 0.004], [PANOJA, c.copy(PANOJA).lerp(PANOJA_TIP, 0.6).clone(), PANOJA_TIP], [-ez, 0, ex], [ex * 0.5, 0.86, ez * 0.5]);
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

// Las matas: spots = [x, y, z, alto, ángulo, ancho]. Por variante y por pedazo
// de mapa (chunk celdas de lado), una InstancedMesh con su esfera para el recorte.
export function buildTussocks(root, spots, mat, { variants = 3, chunk = 21, seed = 51, leaves = 34, stems = 7 } = {}) {
  const r = rng(seed);
  const geos = [];
  for (let k = 0; k < variants; k++) geos.push(tussockGeometry(seed * 7 + k * 131, { leaves, stems }));
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
  const meshes = [];
  for (const [key, list] of groups) {
    const vi = Number(key.split(',')[2]);
    const im = new THREE.InstancedMesh(geos[vi], mat, list.length);
    list.forEach(([x, y, z, h, a, wd = 1], k) => {
      qt.setFromAxisAngle(up, a);
      const s = h * (0.55 + r() * 0.12) * wd;
      m.compose(v.set(x, y, z), qt, sc.set(s, h, s));
      im.setMatrixAt(k, m);
      // unas más verdes, otras más secas o más oscuras
      const d = 0.78 + r() * 0.34;
      const dry = r() * 0.12;
      im.setColorAt(k, tint.setRGB(d * (1 + dry), d * (1 + dry * 0.5), d * (0.92 - dry)));
    });
    im.computeBoundingSphere();
    im.receiveShadow = true;
    root.add(im);
    meshes.push(im);
  }
  return meshes;
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
