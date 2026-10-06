import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import GeoBuilder from '../GeoBuilder';
import { quad } from '../monumentoKit';
import { buildProp } from '../props';
import { LIGHTS, PORTALS } from '../../config/maps/eclipse';
import { PAP as PAPDEF, ZONES } from '../../config/map';
import { fragment, orbiters, grime, voidRockMat } from './centro';

// El Desgarro (zona U): el nudo de todas las grietas, colgado arriba del claro.
// Una laja de piedra negra arrancada del mundo: el borde es un cerco de
// obsidiana quebrada (tapa la baranda de Levels, que queda adentro), con
// cristales violetas que le crecen; en el piso, grietas de luz que corren
// hacia el nudo (EE.nudo del temple, 137,5 / 98,5); arriba del nudo, un
// cristal grande que gira con piedras negras flotando alrededor; abajo de la
// isla, cristales que cuelgan de la roca (se ven desde el claro). El
// Pack-a-Pava queda donde estaba, con un telón de cristales atrás.
// (De acá salen también las herramientas que usan las otras islas: el borde
// propio, el azar fijo y la cuenta de celdas.)

const OUT = 0;
const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const RAIL = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------- herramientas comunes (las usan las otras islas) ----------------

// azar fijo por posición (0-1) y una secuencia con semilla
export const hash = (x, z, s = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Las celdas de una isla: el piso de sus zonas y el borde abierto (las celdas
// de baranda de Levels pegadas a ese piso, con su altura).
export function islandCells(w, zones) {
  const ids = new Set(zones.map((k) => w.zoneKeys.indexOf(k)));
  const isFloor = (x, z) => w.inside(x, z) && w.grid[w.idx(x, z)] === FLOOR && ids.has(w.zone[w.idx(x, z)]);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < w.grid.length; i++) {
    if (w.grid[i] !== FLOOR || !ids.has(w.zone[i])) continue;
    const x = i % w.W;
    const z = (i - x) / w.W;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const rim = new Map();
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] !== WALL || w.edge[i] !== RAIL) continue;
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, z + dz)) near = true;
      if (near) rim.set(i, { x, z, i, fy: w.fy[i] });
    }
  }
  const isRim = (x, z) => w.inside(x, z) && rim.has(w.idx(x, z));
  return { isFloor, rim, isRim, box: [x0, z0, x1, z1] };
}

// El borde propio de una isla: un muro macizo que ocupa la celda entera de la
// baranda (que queda adentro: su caja de choque sigue siendo la de siempre).
// top(cx, cz, c): altura de la tapa en cada esquina (compartida entre celdas
// vecinas: el borde sale de una pieza). Hacia afuera baja `under` (tapa la cara
// del cordón de Levels) y va 2 cm corrido (si no, titila con ella); hacia el
// piso, la cara arranca en el piso de al lado. skip(c): celdas sin muro.
export function rimWall(w, gb, cells, { key, topKey = key, top, under = 0.9, skip = null }) {
  // (4 cm: con la cámara de 0,05 a 400, a 125 m —de una isla a otra— la
  // profundidad no distingue menos de 2 cm y las caras encimadas titilaban)
  const O = 0.04;
  const { rim, isRim } = cells;
  const own = (x, z) => isRim(x, z) && !(skip && skip(rim.get(w.idx(x, z))));
  // la base de la tapa de cada tramo: su piso o el del tramo de al lado, el
  // más alto (Levels tira los caños de la baranda de una celda a la del lado a
  // la altura de la más alta: al costado de una escalera o al pie de la pared
  // de la cima asomaban arriba del muro de la más baja)
  for (const c of rim.values()) {
    c.hi = c.fy;
    for (const [dx, dz] of DIRS) {
      const n = isRim(c.x + dx, c.z + dz) ? rim.get(w.idx(c.x + dx, c.z + dz)) : null;
      if (n) c.hi = Math.max(c.hi, n.fy);
    }
  }
  for (const c of rim.values()) {
    if (skip && skip(c)) continue;
    const { x, z, fy } = c;
    // qué hay de cada lado: 0 otro tramo del borde, 1 piso o puerta, 2 afuera
    const side = DIRS.map(([dx, dz]) => {
      const nx = x + dx;
      const nz = z + dz;
      if (own(nx, nz)) return 0;
      if (!w.inside(nx, nz)) return 2;
      const t = w.grid[w.idx(nx, nz)];
      return t === FLOOR || t === DOOR ? 1 : 2;
    });
    // (contra un piso más bajo Levels pone la cara del desnivel justo en el
    // borde: la del muro va 2 cm adelante, como las de afuera)
    const low = (k) => {
      const [dx, dz] = DIRS[k];
      return side[k] === 1 && w.fy[w.idx(x + dx, z + dz)] < fy - 0.01;
    };
    const ox1 = side[0] === 2 || low(0) ? O : 0;
    const ox0 = side[1] === 2 || low(1) ? O : 0;
    const oz1 = side[2] === 2 || low(2) ? O : 0;
    const oz0 = side[3] === 2 || low(3) ? O : 0;
    const X0 = x - ox0;
    const X1 = x + 1 + ox1;
    const Z0 = z - oz0;
    const Z1 = z + 1 + oz1;
    const h = (cx, cz) => c.hi + top(cx, cz, c);
    const a = h(x, z);
    const b = h(x + 1, z);
    const cc = h(x + 1, z + 1);
    const d = h(x, z + 1);
    quad(gb, topKey, [[X0, d, Z1], [X1, cc, Z1], [X1, b, Z0], [X0, a, Z0]], [0, 1, 0]);
    // los costados
    const lowOf = (k, nx, nz) => {
      if (side[k] === 2) return fy - under;
      // contra el piso: desde el piso de al lado (más abajo, si es un desnivel)
      return Math.min(fy, w.fy[w.idx(nx, nz)]) - 0.02;
    };
    if (side[0]) {
      const lo = lowOf(0, x + 1, z);
      quad(gb, key, [[X1, lo, Z1], [X1, lo, Z0], [X1, b, Z0], [X1, cc, Z1]], [1, 0, 0]);
    }
    if (side[1]) {
      const lo = lowOf(1, x - 1, z);
      quad(gb, key, [[X0, lo, Z0], [X0, lo, Z1], [X0, d, Z1], [X0, a, Z0]], [-1, 0, 0]);
    }
    if (side[2]) {
      const lo = lowOf(2, x, z + 1);
      quad(gb, key, [[X0, lo, Z1], [X1, lo, Z1], [X1, cc, Z1], [X0, d, Z1]], [0, 0, 1]);
    }
    if (side[3]) {
      const lo = lowOf(3, x, z - 1);
      quad(gb, key, [[X1, lo, Z0], [X0, lo, Z0], [X0, a, Z0], [X1, b, Z0]], [0, 0, -1]);
    }
    // dos tramos del borde a distinta altura (al costado de una escalera): el
    // escalón, 2 cm adelante del lado del más bajo (ahí Levels tiene la cara del cordón)
    for (const [k, nx, nz] of [[0, x + 1, z], [2, x, z + 1]]) {
      if (side[k] !== 0) continue;
      const n = rim.get(w.idx(nx, nz));
      if (!n || Math.abs(n.hi - c.hi) < 0.01) continue;
      const hn = (cx, cz) => n.hi + top(cx, cz, n);
      const s = n.hi > c.hi ? -1 : 1;
      if (k === 0) {
        const X = x + 1 + s * O;
        const lo0 = Math.min(b, hn(x + 1, z));
        const hi0 = Math.max(b, hn(x + 1, z));
        const lo1 = Math.min(cc, hn(x + 1, z + 1));
        const hi1 = Math.max(cc, hn(x + 1, z + 1));
        quad(gb, key, [[X, lo0, z], [X, lo1, z + 1], [X, hi1, z + 1], [X, hi0, z]], [s, 0, 0]);
      } else {
        const Z = z + 1 + s * O;
        const lo0 = Math.min(d, hn(x, z + 1));
        const hi0 = Math.max(d, hn(x, z + 1));
        const lo1 = Math.min(cc, hn(x + 1, z + 1));
        const hi1 = Math.max(cc, hn(x + 1, z + 1));
        quad(gb, key, [[x, lo0, Z], [x + 1, lo1, Z], [x + 1, hi1, Z], [x, hi0, Z]], [0, 0, s]);
      }
    }
  }
}

// Las paredes de unas zonas (celdas de pared pegadas a su piso): la cara de
// afuera que da al vacío forrada 4 cm afuera (Levels la arma con 'exterior' o
// el 'ext' de la zona, que en Eclipse suele ser el travertino del Monumento), de
// abajo de la roca a la tapa, y la tapa de arriba (1 cm más alta) con `cap`.
export function cladWalls(w, gb, zones, key, cap = key) {
  const ids = new Set(zones.map((k) => w.zoneKeys.indexOf(k)));
  const floor = (i) => w.grid[i] === FLOOR && ids.has(w.zone[i]);
  const done = new Set();
  const O = 0.04;
  for (const k of zones) {
    const R = (ZONES[k]?.rects || []);
    for (const r of R) {
      for (let z = r[1] - 1; z <= r[3] + 1; z++) {
        for (let x = r[0] - 1; x <= r[2] + 1; x++) {
          if (!w.inside(x, z)) continue;
          const i = w.idx(x, z);
          if (done.has(i) || w.grid[i] !== WALL || w.edge[i] !== 0) continue;
          let near = false;
          for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inside(x + dx, z + dz) && floor(w.idx(x + dx, z + dz))) near = true;
          if (!near) continue;
          done.add(i);
          const top = w.top[i];
          gb.box(cap, x - 0.005, top + 0.01, z - 0.005, x + 1.005, top + 0.08, z + 1.005, 1);
          for (const [dx, dz] of DIRS) {
            const nx = x + dx;
            const nz = z + dz;
            if (w.inside(nx, nz) && w.grid[w.idx(nx, nz)] !== OUT) continue;
            const lo = w.fy[i] - 2.4;
            const mx = x + 0.5 + dx * (0.5 + O);
            const mz = z + 0.5 + dz * (0.5 + O);
            const ax = mx - dz * (0.5 + O);
            const az = mz + dx * (0.5 + O);
            const bx = mx + dz * (0.5 + O);
            const bz = mz - dx * (0.5 + O);
            gb.wall(key, ax, az, bx, bz, lo, top + 0.01, [dx, 0, dz], 3.6, ax * -dz + az * dx);
          }
        }
      }
    }
  }
}

// Lo quieto de una isla, en una malla por material (con su esfera: la cámara
// descarta la isla entera cuando queda atrás). Lo congela world/staticLean.
export function addStatic(w, gb, mats, { castShadow = true } = {}) {
  const grp = gb.build(mats, { castShadow, receiveShadow: true });
  grp.name = 'eclipseIsla';
  for (const m of grp.children) if (m.material?.userData?.noShadow) m.castShadow = false;
  w.root.add(grp);
  return grp;
}

// Un constructor de utilería por nombre (world/props.js y los registrados del
// penal y el castillo), apoyado en el piso de su celda: sus cajas de choque y
// su parte quieta van con la utilería fundida del mapa (World.addStatic).
export function placeProp(w, def, seed) {
  const d = { ...def, y: def.y ?? w.floorAt(def.pos[0], def.pos[1]) };
  const res = buildProp(d, w.M, seed);
  if (!res) return null;
  for (const b of res.boxes) w.addBox(b, { kind: 'prop', firm: !!res.firm });
  w.addStatic(res.obj);
  return res;
}

// Lo quieto de una isla, todo junto: las caras del GeoBuilder y las piezas
// sueltas (`extra`: [geometría en el mundo, clave de material]) van a UNA malla
// por material (un dibujo por material e isla). noShadow: claves sin sombra.
export function bake(w, gb, mats, extra = [], { noShadow = [], isla = '' } = {}) {
  const by = new Map();
  for (const [key, B] of gb.buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.setIndex(B.idx);
    by.set(key, [g]);
  }
  for (const [geo, key] of extra) {
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(geo);
  }
  const grp = new THREE.Group();
  grp.name = 'eclipseIsla' + (isla ? '-' + isla : '');
  for (const [key, list] of by) {
    const mat = mats[key];
    const m = mergedMesh(list, mat, { castShadow: !noShadow.includes(key) && !mat?.userData?.noShadow });
    if (mat?.isShaderMaterial || mat?.transparent) m.renderOrder = 5;
    grp.add(m);
  }
  w.root.add(grp);
  return grp;
}

// Junta geometrías sueltas (ya puestas en el mundo) en una malla.
export function mergedMesh(list, mat, { castShadow = true } = {}) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) for (const nm of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) g.deleteAttribute(nm);
  for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const geo = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

// ---------------- los materiales de esta isla ----------------
let MATS = null;
function mats(w) {
  if (MATS && MATS.w === w) return MATS;
  const T = w.T;
  MATS = {
    w,
    // la piedra negra del cerco: la roca de la cueva del castillo, teñida de
    // noche y con relieve (las caras grandes no quedan lisas)
    rimStone: new THREE.MeshStandardMaterial({ map: T.caveRock, bumpMap: T.caveRock, bumpScale: 1.6, color: 0x4e3e62, roughness: 0.62, metalness: 0.12 }),
    rimTop: new THREE.MeshStandardMaterial({ map: T.caveRock, bumpMap: T.caveRock, bumpScale: 1.2, color: 0x6a5784, roughness: 0.55, metalness: 0.1 }),
    // obsidiana: las lajas paradas, negras con brillo en los filos
    obsidian: new THREE.MeshStandardMaterial({ color: 0x1b1424, roughness: 0.3, metalness: 0.45, flatShading: true, emissive: 0x0c0414, emissiveIntensity: 1 }),
    // las piedras que flotan (instanciadas: material aparte, otro programa)
    float: new THREE.MeshStandardMaterial({ color: 0x1e1628, roughness: 0.32, metalness: 0.45, flatShading: true, emissive: 0x14061f, emissiveIntensity: 1 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x9b62ff, roughness: 0.14, metalness: 0.15, flatShading: true, emissive: 0x7428ff, emissiveIntensity: 1.25 }),
    knot: new THREE.MeshStandardMaterial({ color: 0xd2a8ff, roughness: 0.1, metalness: 0.1, flatShading: true, emissive: 0xa050ff, emissiveIntensity: 2.2 }),
    // las grietas del piso y las vetas del cerco: luz pura (el bloom las hace brillar)
    crack: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.2, 1.45), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // el labio oscuro de cada grieta (debajo de la luz)
    crackLip: new THREE.MeshBasicMaterial({ color: 0x07030c, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  MATS.crack.userData.noShadow = true;
  MATS.crackLip.userData.noShadow = true;
  return MATS;
}

// Un cristal: prisma de seis caras con la punta, de largo h y radio r, parado
// en el origen hacia +y (sin la base: nace adentro de lo que lo sostiene).
function crystalGeo(r, h, rnd) {
  const tip = r * (1.4 + rnd() * 0.8);
  const body = new THREE.CylinderGeometry(r * (0.8 + rnd() * 0.2), r, Math.max(0.05, h - tip), 6, 1, true);
  body.translate(0, (h - tip) / 2, 0);
  const cap = new THREE.ConeGeometry(r * (0.8 + rnd() * 0.2), tip, 6, 1);
  cap.translate(0, h - tip / 2, 0);
  const g = mergeGeometries([body.toNonIndexed(), cap.toNonIndexed()], false);
  body.dispose();
  cap.dispose();
  return g;
}

// Un manojo de cristales en (x, y, z): n cristales abiertos en abanico desde
// el piso (o colgando, con down).
function cluster(list, x, y, z, rnd, { n = 5, size = 1, down = false, lean = 0.45, dir = null } = {}) {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const m = new THREE.Matrix4();
  for (let k = 0; k < n; k++) {
    const big = k === 0 ? 1 : 0.45 + rnd() * 0.5;
    const h = (0.7 + rnd() * 0.9) * size * big * 1.6;
    const r = (0.07 + rnd() * 0.06) * size * (0.6 + big * 0.6);
    const g = crystalGeo(r, h, rnd);
    const a = rnd() * Math.PI * 2;
    const t = k === 0 ? lean * 0.3 : lean * (0.5 + rnd() * 0.8);
    // hacia dónde se abre (con dir: más hacia ese lado)
    let ax = Math.cos(a);
    let az = Math.sin(a);
    if (dir) {
      ax = ax * 0.4 + dir[0];
      az = az * 0.4 + dir[1];
    }
    e.set(az * t, rnd() * Math.PI, -ax * t);
    q.setFromEuler(e);
    if (down) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
    const off = k === 0 ? 0 : 0.12 * size;
    m.compose(new THREE.Vector3(x + Math.cos(a) * off, y, z + Math.sin(a) * off), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    list.push(g);
  }
}

// Una piedra quebrada: icosaedro deformado (para el borde y las que flotan)
function rockGeo(rnd, s = 1, sy = 1) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  // (los vértices repetidos se mueven igual: la deformación es función del punto)
  const ph = rnd() * 50;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.72 + 0.5 * hash(x * 3.1 + ph, z * 2.7 + y * 1.3, 5);
    p.setXYZ(i, x * k * s, y * k * s * sy, z * k * s);
  }
  return g;
}

// ---------------- la otra dimensión: monolitos con ojos ----------------
const ZONE = (k) => ZONES[k] || null;

// El ojo: una almendra violeta con el iris y la pupila de raja, que parpadea
// (cada uno a su ritmo, por la semilla del vértice). Sin pow ni normalizar:
// todo con max() y smoothstep (nada de NaN).
let EYE = null;
function eyeMat() {
  if (EYE) return EYE;
  EYE = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float b = fract(uTime * (0.09 + vSeed * 0.05) + vSeed * 7.3);
        float open = 1.0 - smoothstep(0.9, 0.94, b) * (1.0 - smoothstep(0.96, 1.0, b));
        float h = 0.5 * max(1.0 - p.x * p.x, 0.0) * open;
        float d = abs(p.y) - h;
        float ins = 1.0 - smoothstep(-0.02, 0.0, d);
        float rim = exp(-abs(d) * 26.0) * step(0.02, h);
        // el iris mira para los costados de a ratos
        float lx = sin(uTime * 0.5 + vSeed * 11.0) * 0.18;
        float r = length(vec2(p.x - lx, p.y));
        float iris = 1.0 - smoothstep(0.28, 0.32, r);
        float pupil = (1.0 - smoothstep(0.035, 0.07, abs(p.x - lx))) * (1.0 - smoothstep(0.18, 0.24, abs(p.y)));
        vec3 sclera = vec3(0.16, 0.06, 0.22);
        vec3 col = mix(sclera, vec3(1.1, 0.45, 1.9) * (0.7 + 0.3 * (1.0 - r / 0.32)), iris);
        col = mix(col, vec3(0.0), pupil * iris);
        col += vec3(0.7, 0.25, 1.3) * rim;
        float a = clamp(max(ins, rim * 0.8), 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  return EYE;
}

// Monolitos de piedra negra con vetas (la de los pedazos sueltos), parados en el
// aire alrededor de la isla, afuera de su roca; cada uno con un ojo del lado que
// mira el nudo. Todos en dos dibujos (las piedras y los ojos), quietos.
function monoliths(w, isl, rnd) {
  const [x0, z0, x1, z1] = isl.box;
  const cx = (x0 + x1 + 1) / 2;
  const cz = (z0 + z1 + 1) / 2;
  const R = Math.hypot(x1 - x0, z1 - z0) / 2;
  const y = isl.y;
  const rocks = [];
  const eyes = [];
  const seeds = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    const d = R + 12 + rnd() * 12;
    const px = cx + Math.cos(a) * d;
    const pz = cz + Math.sin(a) * d;
    const py = y - 4 + rnd() * 18;
    const s = 1.4 + rnd() * 1.4;
    const tall = 2.4 + rnd() * 1.6;
    const geo = rockGeo(rnd, s, tall);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5));
    m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    rocks.push(geo);
    // el ojo: en la cara que da a la isla, un poco afuera de la piedra
    const tx = cx - px;
    const tz = cz - pz;
    const L = Math.hypot(tx, tz) || 1;
    const ex = px + (tx / L) * s * 1.28;
    const ez = pz + (tz / L) * s * 1.28;
    const eg = new THREE.PlaneGeometry(s * 1.5, s * 0.85);
    eg.rotateY(Math.atan2(tx, tz));
    eg.translate(ex, py + s * 0.4, ez);
    eyes.push(eg);
    const sd = rnd();
    seeds.push(new Float32Array(eg.attributes.position.count).fill(sd));
  }
  const grp = new THREE.Group();
  grp.name = 'eclipseIsla-disformidad';
  grp.add(mergedMesh(rocks, voidRockMat(w)));
  // (los ojos con su semilla por vértice)
  const eg = mergeGeometries(eyes.map((g, i) => {
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds[i], 1));
    return g;
  }), false);
  eg.computeBoundingSphere();
  const em = new THREE.Mesh(eg, eyeMat());
  em.renderOrder = 3;
  em.matrixAutoUpdate = false;
  grp.add(em);
  w.root.add(grp);
  return EYE;
}

// ---------------- la isla ----------------
let LIVE = null;

export function build(w, g, isl) {
  // (__mduNoEclipseRiftArt: solo los bloques y la roca)
  if (globalThis.__mduNoEclipseRiftArt === true) return;
  const M = mats(w);
  const y = isl.y;
  const cells = islandCells(w, isl.zones);
  const { isFloor, rim } = cells;
  const rnd = rng(6811);
  // el nudo (donde el temple clava la guadaña: la luz 'nudo' de desgarro.py) y
  // el Pack-a-Pava con sus cuatro ojos del ritual (world/papDesgarro.js): no se tocan
  const LN = LIGHTS.find((l) => l.tag === 'nudo');
  const NUDO = LN ? [LN.pos[0], LN.pos[2]] : isl.center;
  const [pcx, pcz] = PAPDEF.cell;
  const [pfx, pfz] = PAPDEF.face;
  // (la máquina: dos celdas de ancho, delante de su celda de borde)
  const PAP = pfz ? [pcx, pcz + (pfz > 0 ? 1.02 : -1.12), pcx + 2, pcz + (pfz > 0 ? 2.12 : -0.02)] : [pcx + (pfx > 0 ? 1.02 : -1.12), pcz, pcx + (pfx > 0 ? 2.12 : -0.02), pcz + 2];
  const papC = [pcx + 0.5 + pfx * 1.2, pcz + 0.5 + pfz * 1.2];
  const EYES = [[-7, -5], [7, -5], [-7, 6], [7, 6]].map(([dx, dz]) => [papC[0] + dx, papC[1] + dz]);
  const PEND = PORTALS.flatMap((p) => [p.a, p.b]).find((e) => e.zone === 'U');
  const MARK = PEND ? [PEND.pos[0] + PEND.face[0] * 0.9, PEND.pos[1] + PEND.face[1] * 0.9] : null;

  // ---- el borde: un cerco de obsidiana quebrada, más bajo detrás del Pack-a-Pava
  const gb = new GeoBuilder();
  // (atrás de la máquina: la fila de borde de su celda, dos celdas a cada lado)
  const papBack = (cx, cz) => (pfz ? Math.abs(cz - (pcz + 0.5)) < 0.7 && cx > pcx - 1.5 && cx < pcx + 3.5 : Math.abs(cx - (pcx + 0.5)) < 0.7 && cz > pcz - 1.5 && cz < pcz + 3.5);
  rimWall(w, gb, cells, {
    key: 'rimStone',
    topKey: 'rimTop',
    under: 1.1,
    // (la baranda llega a 1,13: el cerco, nunca menos de 1,18)
    top: (cx, cz) => (papBack(cx, cz) ? 1.19 + 0.08 * hash(cx, cz, 3) : 1.2 + 0.34 * hash(cx, cz, 7) + 0.14 * hash(cx * 0.37, cz * 0.41, 9)),
  });
  // las vetas de luz que suben por la cara de adentro del cerco (1 cm afuera)
  for (const c of rim.values()) {
    if (papBack(c.x + 0.5, c.z + 0.5) || hash(c.x, c.z, 31) < 0.62) continue;
    for (const [dx, dz] of DIRS) {
      if (!isFloor(c.x + dx, c.z + dz)) continue;
      // el plano de la cara, mirando al piso
      const px = dx > 0 ? c.x + 1 + 0.012 : dx < 0 ? c.x - 0.012 : null;
      const pz = dz > 0 ? c.z + 1 + 0.012 : dz < 0 ? c.z - 0.012 : null;
      let u = 0.25 + hash(c.x, c.z, 32) * 0.5;
      let v = c.fy + 0.02;
      const vTop = c.fy + 1.05;
      while (v < vTop) {
        const nv = Math.min(vTop, v + 0.12 + hash(u * 9, v * 7, 33) * 0.16);
        const nu = Math.min(0.95, Math.max(0.05, u + (hash(u * 5, v * 3, 34) - 0.5) * 0.3));
        const wd = 0.02 + 0.02 * (1 - (v - c.fy) / 1.1);
        const P = (uu, vv, o) => (px != null ? [px, vv, c.z + uu + o] : [c.x + uu + o, vv, pz]);
        quad(gb, 'crack', [P(u, v, -wd), P(u, v, wd), P(nu, nv, wd * 0.8), P(nu, nv, -wd * 0.8)], [dx, 0, dz]);
        u = nu;
        v = nv;
      }
    }
  }
  // las lajas que se levantan del cerco: piedras paradas, torcidas para afuera
  const rocks = [];
  const crystals = [];
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  for (const c of rim.values()) {
    const cx = c.x + 0.5;
    const cz = c.z + 0.5;
    if (papBack(cx, cz) || hash(c.x, c.z, 21) < 0.62) continue;
    // hacia afuera: lejos del piso
    let ox = 0;
    let oz = 0;
    for (const [dx, dz] of DIRS) if (!isFloor(c.x + dx, c.z + dz) && !cells.isRim(c.x + dx, c.z + dz)) {
      ox += dx;
      oz += dz;
    }
    const L = Math.hypot(ox, oz) || 1;
    ox /= L;
    oz /= L;
    const s = 0.38 + hash(c.x, c.z, 22) * 0.32;
    const tall = 0.9 + hash(c.x, c.z, 23) * 1.3;
    const geo = rockGeo(rnd, s, tall / s);
    qq.setFromEuler(new THREE.Euler(oz * 0.28, hash(c.x, c.z, 24) * 6, -ox * 0.28));
    // (corrida hacia afuera: no se mete en el piso)
    mm.compose(new THREE.Vector3(cx + ox * 0.22, c.fy + 1.1 + tall * 0.35, cz + oz * 0.22), qq, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mm);
    rocks.push(geo);
    // y cada tanto un manojo de cristales arriba del cerco
    if (hash(c.x, c.z, 25) > 0.62) cluster(crystals, cx + ox * 0.3, c.fy + 1.25, cz + oz * 0.3, rnd, { n: 3 + Math.floor(hash(c.x, c.z, 26) * 3), size: 0.55, dir: [ox, oz] });
  }
  // los manojos grandes que alumbran (las luces 'cristal' de desgarro.py)
  for (const L of LIGHTS.filter((l) => l.zone === 'U' && l.tag === 'cristal')) {
    const ox = Math.sign(L.pos[0] - isl.center[0]);
    cluster(crystals, L.pos[0], y + 1.2, L.pos[2], rnd, { n: 7, size: 1.1, dir: [ox * 0.9, 0] });
  }
  // el telón de atrás del Pack-a-Pava: cristales altos que se abren hacia atrás
  // (sobre el cerco, del lado de afuera: la máquina queda adelante, libre)
  for (const [t, s, n] of [[-1.2, 1.3, 5], [0.4, 1.9, 6], [2.0, 1.5, 5], [3.6, 1.1, 4]]) {
    const bx = pfz ? pcx + t : pcx + 0.5 - pfx * 0.25;
    const bz = pfz ? pcz + 0.5 - pfz * 0.25 : pcz + t;
    cluster(crystals, bx, y + 1.1, bz, rnd, { n, size: s, dir: [-pfx, -pfz], lean: 0.35 });
  }

  // ---- las grietas del piso: corren desde el nudo hacia el borde
  const strips = [];
  const markR = 1.6;
  const MC = NUDO;
  const fy = y + 0.018;
  // (ni adentro de la marca del portal ni abajo de los ojos del ritual)
  const busy = (x, z) => (MARK && Math.hypot(x - MARK[0], z - MARK[1]) < 2.1) || EYES.some(([ex, ez]) => Math.hypot(x - ex, z - ez) < 1.7);
  // (lejos de lo que no es piso: contra el cerco la grieta quedaba a medias)
  const near = (x, z, r) => !isFloor(Math.floor(x + r), Math.floor(z)) || !isFloor(Math.floor(x - r), Math.floor(z)) || !isFloor(Math.floor(x), Math.floor(z + r)) || !isFloor(Math.floor(x), Math.floor(z - r));
  const blocked = (x, z) => !isFloor(Math.floor(x), Math.floor(z)) || near(x, z, 0.3) || busy(x, z) || (x > PAP[0] - 0.4 && x < PAP[2] + 0.4 && z > PAP[1] - 0.4 && z < PAP[3] + 0.4);
  const crack = (x, z, ang, len, wid, depth) => {
    let px = x;
    let pz = z;
    let pw = wid;
    let a = ang;
    let left = len;
    while (left > 0) {
      // quebrada: giros cortos que vuelven hacia el rumbo
      a += (rnd() - 0.5) * 1.1 + (ang - a) * 0.35;
      const st = 0.14 + rnd() * 0.2;
      const nx = px + Math.cos(a) * st;
      const nz = pz + Math.sin(a) * st;
      if (blocked(nx, nz)) break;
      const nw = Math.max(0.018, pw * (0.9 + rnd() * 0.08));
      // la tira: dos puntas con su ancho, de costado a la dirección
      const ux = -Math.sin(a);
      const uz = Math.cos(a);
      strips.push([px, pz, nx, nz, ux, uz, pw, nw]);
      px = nx;
      pz = nz;
      pw = nw;
      left -= st;
      if (depth < 2 && rnd() < 0.16) crack(px, pz, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), left * 0.55, pw * 0.75, depth + 1);
    }
  };
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    crack(MC[0] + Math.cos(a) * markR, MC[1] + Math.sin(a) * markR, a, 7 + rnd() * 8, 0.06 + rnd() * 0.03, 0);
  }
  // cada tramo: el labio oscuro (más ancho) y la luz adentro, 6 mm más arriba
  for (const [px, pz, nx, nz, ux, uz, pw, nw] of strips) {
    const S = (k, yy) => [[px - ux * pw * k, yy, pz - uz * pw * k], [px + ux * pw * k, yy, pz + uz * pw * k], [nx + ux * nw * k, yy, nz + uz * nw * k], [nx - ux * nw * k, yy, nz - uz * nw * k]];
    quad(gb, 'crackLip', S(2.4, fy - 0.006), [0, 1, 0]);
    quad(gb, 'crack', S(1, fy), [0, 1, 0]);
  }

  // ---- abajo de la isla: cristales que cuelgan de la roca (se ven desde el claro)
  const rock = w.root.getObjectByName('eclipseRock');
  if (rock) {
    const ray = new THREE.Raycaster();
    const up = new THREE.Vector3(0, 1, 0);
    const [bx0, bz0, bx1, bz1] = cells.box;
    for (let k = 0; k < 26; k++) {
      const x = bx0 + 1 + rnd() * (bx1 - bx0 - 1);
      const z = bz0 + 1 + rnd() * (bz1 - bz0 - 1);
      ray.set(new THREE.Vector3(x, y - 40, z), up);
      ray.far = 40;
      const hit = ray.intersectObject(rock, false)[0];
      // solo la panza (lo de abajo de verdad, no la repisa de arriba)
      if (!hit || hit.point.y > y - 2.5) continue;
      cluster(crystals, x, hit.point.y + 0.35, z, rnd, { n: 3 + Math.floor(rnd() * 4), size: 1.2 + rnd() * 1.2, down: true, lean: 0.3 });
    }
  }

  // la isla quieta: borde, grietas, lajas y cristales
  bake(w, gb, M, [...rocks.map((g) => [g, 'obsidian']), ...crystals.map((g) => [g, 'crystal'])], { noShadow: ['crystal', 'crack', 'crackLip'], isla: 'desgarro' });

  // ---- la otra dimensión: monolitos de piedra negra quietos en el aire,
  // alrededor de la isla, cada uno con un ojo que mira el nudo y parpadea
  const ojos = monoliths(w, isl, rnd);
  // ---- la piedra suelta (U9): un pedazo del piso arrancado, con su cerco y cristales
  const orbs = [];
  if (ZONE('U9')) {
    const F = fragment(w, 'U9', { tilt: [0.11, 0.4, -0.14], top: 'caveFloor', thick: 3.2, seed: 9 });
    const fr = [];
    const fc = [];
    const r9 = rng(919);
    // lajas paradas en el borde del pedazo y un manojo en el medio
    for (let k = 0; k < F.pts.length; k += 3) {
      const [px, pz] = F.pts[k];
      const geo = rockGeo(r9, 0.35 + r9() * 0.25, 2.2 + r9() * 1.6);
      geo.translate(px * 0.9, 0.5, pz * 0.9);
      fr.push(geo);
    }
    cluster(fc, 0, 0, 0, r9, { n: 6, size: 1.2 });
    if (fr.length) F.g.add(mergedMesh(fr, M.obsidian));
    F.g.add(mergedMesh(fc, M.crystal, { castShadow: false }));
    F.g.updateMatrixWorld(true);
    F.finish();
    const Z9 = ZONE('U9');
    orbs.push({ c: [F.g.position.x, Z9.y + 1.5, F.g.position.z], r: [3.2, 5.2], h: 2.5, n: 8, s: [0.12, 0.32], sp: 0.3 });
  }
  const orb9 = orbiters(w, orbs, { seed: 96 });
  // ---- el piso: charcos negros que toman el violeta, barro (sin paredes: sin hollín)
  grime(w, 'desgarro', { seed: 6901, damp: 0, moss: 0, rust: 0, drip: 0, mud: 0.03, puddles: 7, out: (x, z, r) => Math.hypot(x - papC[0], z - papC[1]) < 3 + r || EYES.some(([ex, ez]) => Math.hypot(x - ex, z - ez) < 1.8 + r) });

  // ---- lo que se mueve: el cristal del nudo y las piedras que lo rondan
  const live = new THREE.Group();
  live.name = 'eclipseDesgarroLive';
  const knot = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), M.knot);
  knot.scale.set(1, 1.9, 1);
  knot.position.set(NUDO[0], y + 6.6, NUDO[1]);
  knot.castShadow = false;
  live.add(knot);
  // la corona del nudo: tres astillas chicas de cristal que giran pegadas
  const shard = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), M.knot, 3);
  shard.scale.set(1, 1, 1);
  shard.frustumCulled = false;
  live.add(shard);
  // las piedras negras que flotan alrededor (un dibujo)
  const N = 22;
  const flo = new THREE.InstancedMesh(rockGeo(rng(77), 1, 1), M.float, N);
  flo.castShadow = true;
  flo.frustumCulled = false;
  const orb = [];
  for (let k = 0; k < N; k++) {
    const far = k >= 10;
    // (las de lejos: afuera de la isla y de su repisa, o bien arriba del cerco)
    const r = far ? 21 + rnd() * 9 : 3.2 + rnd() * 3.5;
    orb.push({
      r,
      a: rnd() * Math.PI * 2,
      w: (far ? 0.04 : 0.09) * (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.6),
      h: far ? (r > 25 ? y - 8 + rnd() * 20 : y + 4 + rnd() * 9) : y + 4.6 + rnd() * 6.5,
      bob: rnd() * 6,
      s: far ? 0.9 + rnd() * 1.1 : 0.3 + rnd() * 0.5,
      sp: new THREE.Vector3(rnd(), rnd(), rnd()).normalize(),
      rs: 0.2 + rnd() * 0.5,
    });
  }
  live.add(flo);
  w.root.add(live);
  LIVE = { w, knot, shard, flo, orb, y, NUDO, ojos, orb9, m: new THREE.Matrix4(), q: new THREE.Quaternion(), qs: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), crack: M.crack, base: M.crack.color.clone() };
  update(0, 0);
}

export function update(dt, t) {
  const L = LIVE;
  if (!L) return;
  // (lejos de la isla no se mueve nada: de lejos no se nota)
  const cam = L.w.g?.camera;
  if (cam && t > 0) {
    const dx = cam.position.x - L.NUDO[0];
    const dz = cam.position.z - L.NUDO[1];
    if (dx * dx + dz * dz > 120 * 120) return;
  }
  const { knot, shard, flo, orb, m, q, qs, v, s } = L;
  if (L.ojos) L.ojos.uniforms.uTime.value = t;
  L.orb9?.update(t);
  knot.rotation.y = t * 0.35;
  knot.position.y = L.y + 6.6 + Math.sin(t * 0.8) * 0.18;
  for (let k = 0; k < 3; k++) {
    const a = t * 0.9 + (k / 3) * Math.PI * 2;
    v.set(L.NUDO[0] + Math.cos(a) * 1.5, knot.position.y + Math.sin(t * 1.3 + k * 2) * 0.5, L.NUDO[1] + Math.sin(a) * 1.5);
    q.setFromAxisAngle(s.set(0, 1, 0), a * 2);
    m.compose(v, q, s.set(1, 1.8, 1));
    shard.setMatrixAt(k, m);
  }
  shard.instanceMatrix.needsUpdate = true;
  for (let k = 0; k < orb.length; k++) {
    const o = orb[k];
    const a = o.a + t * o.w;
    v.set(L.NUDO[0] + Math.cos(a) * o.r, o.h + Math.sin(t * 0.6 + o.bob) * 0.35, L.NUDO[1] + Math.sin(a) * o.r);
    qs.setFromAxisAngle(o.sp, t * o.rs + o.bob);
    m.compose(v, qs, s.setScalar(o.s));
    flo.setMatrixAt(k, m);
  }
  flo.instanceMatrix.needsUpdate = true;
  // las grietas laten despacio
  const k = 0.82 + 0.18 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 4.3);
  L.crack.color.copy(L.base).multiplyScalar(k);
}
