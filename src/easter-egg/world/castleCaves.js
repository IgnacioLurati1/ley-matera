import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, EE, RISERS } from '../config/map';
import { makeNoise, rng } from '../core/noise';
import { canvasTex } from './penalProps';

// Las dos cuevas del castillo: world/Levels.js las arma como cajas (paredes,
// piso y techo planos) y acá se forran por dentro con roca (o hielo):
//  · una cáscara que sigue las paredes con las esquinas redondeadas: el pie
//    de la roca entra y sale (contrafuertes y huecos, con su franja de choque
//    que lo sigue, así la cámara nunca se mete en la piedra), arriba crecen
//    bultos, cornisas y grietas, y en lo alto se cierra en bóveda;
//  · el techo colgando en domos y bolsones, con estalactitas (carámbanos en
//    la gruta) en racimos;
//  · piedras (o bloques de hielo) al pie de las paredes, con su caja para
//    chocar, pedregullo suelto y columnas del piso al techo;
//  · lo que brilla solo: vetas y cristales en las paredes y el techo (para
//    que en lo oscuro se vea la forma de la roca);
//  · La Gruta del Glaciar (I): hielo azul con escarcha en lo que sobresale,
//    una cascada congelada en la pared del este, dos columnas de hielo, vetas
//    azules adentro del hielo y grietas que brillan en el piso;
//  · La Cueva del Mateendrache (Q): roca tiznada alrededor del dragón, los
//    arañazos de sus garras, vetas de brasa, la chimenea por donde se va
//    volando, monedas del tesoro desparramadas y huesos.
// Todo sale de semillas fijas: en línea todos ven (y chocan con) lo mismo.
// Cada cueva queda en pocas mallas (una por material).

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
// ruido de posición (el mismo valor para vértices repetidos)
const hash3 = (x, y, z) => {
  const s = Math.sin(Math.round(x * 997) * 0.1271 + Math.round(y * 991) * 0.3117 + Math.round(z * 983) * 0.0747) * 43758.5453;
  return s - Math.floor(s);
};
// alto de la franja de abajo (lo que se camina, se salta y se toca)
const FOOT_H = 2.8;

// El dragón duerme acá (su tizne, su chimenea y el lugar que ocupa).
// (el mapa se elige en el menú: dónde duerme el dragón se lee al armar las cuevas)
let DRAGON = { x: 0, z: 0 };
let CHIMNEY = { x: 0, z: -2, r: 3.1, lip: 2.4 };

// Lo de cada cueva. Agujeros: por donde se entra (la cáscara no tapa la
// puerta). Seguros: lo caminable que queda por encima del piso (las
// escaleras) donde la roca no se arrima. Libres: puntos de la pared donde la
// roca no crece (los grilletes de las cadenas). Lejos: lo que no se tapa con
// piedras del piso (el easter egg, los que salen de la tierra, la utilería).
// Pasillos: por donde se camina de una puerta a la otra (nada en el medio).
function caveDefs() {
  const riserOf = (z) => (RISERS || []).filter((r) => r.zone === z).map((r) => [r.pos[0], r.pos[1], 1.6]);
  const I = {
    zone: 'I',
    ice: true,
    seed: 41,
    corners: [1.9, 1.7, 1.2, 1.9],
    low: 0.3,
    foot: 0.65,
    big: 1.2,
    vault: 1.7,
    vaultFrac: 0.42,
    drop: 1.5,
    holes: [
      { x0: 87.55, x1: 90.45, z0: 55.2, z1: 56.8, y0: 18.6, y1: 23.2 },
      { x0: 89.55, x1: 92.45, z0: 41.2, z1: 42.8, y0: 15, y1: 19.2 },
    ],
    safe: [
      { x0: 87.2, z0: 49.2, x1: 90.8, z1: 56.5, y1: 23.4 },
      { x0: 89.2, z0: 41.5, x1: 92.8, z1: 44.6, y1: 19.4 },
    ],
    free: [],
    keep: [
      [...EE.altars.hielo, 2.3],
      [...EE.erkes.hielo, 1.9],
      ...EE.hielo.penitentes.map(([x, z]) => [x, z, 1.4]),
      ...riserOf('I'),
      [86, 49.8, 2.2],
      [85.6, 43.6, 1.7],
      [98.4, 42.6, 1.1],
      [84.6, 54.4, 1.1],
    ],
    lanes: [
      [87.2, 48.6, 90.8, 56.5],
      [87.6, 41.5, 92.6, 50.5],
    ],
    columns: [
      { x: 86.1, z: 47.4, rEnd: 0.85, rMid: 0.38 },
      { x: 95.3, z: 44.05, rEnd: 0.85, rMid: 0.38 },
    ],
    falls: [{ z0: 47.3, z1: 51.5 }],
    cracks: [
      [97.9, 43.9, 3.2, 0.4],
      [85.8, 53.1, 2.8, 1.9],
      [92.6, 55.1, 2.4, 0.9],
      [99, 52.6, 2.3, 2.6],
      [85.2, 45.2, 2.3, 1.2],
    ],
    veins: 16,
    crystals: 10,
  };
  const Q = {
    zone: 'Q',
    ice: false,
    seed: 77,
    corners: [2.3, 2.3, 1.6, 2.3],
    low: 0.32,
    foot: 0.95,
    big: 1.7,
    vault: 2.8,
    vaultFrac: 0.4,
    drop: 2.8,
    holes: [{ x0: 89.55, x1: 92.45, z0: 40.2, z1: 41.8, y0: 15.3, y1: 19.2 }],
    safe: [{ x0: 89.2, z0: 34.4, x1: 92.8, z1: 41.5, y1: 19.4 }],
    free: (EE.cueva?.cadenas || []).map(([x, z]) => ({ x, y: 14.2, z, r: 0.85, fall: 0.8 })),
    keep: [
      [DRAGON.x, DRAGON.z, 7.6],
      [...EE.cueva.fogon, 2.7],
      [...EE.cueva.mate, 2.5],
      [...EE.cueva.dial, 1.7],
      ...(EE.cueva?.cadenas || []).map(([x, z]) => [x, z, 1.9]),
      ...riserOf('Q'),
      [83.2, 26.5, 2.2],
      [97.6, 28.5, 2],
      [80.7, 15.7, 1.2],
      [100.3, 15.7, 1.2],
      [81, 39.3, 1.2],
      [100, 39.2, 1.2],
    ],
    lanes: [
      [89.3, 34.2, 92.7, 41.5],
      [88.3, 31.8, 93.7, 35],
    ],
    columns: [
      { x: 84.3, z: 37.9, rEnd: 1.35, rMid: 0.62 },
      { x: 97.7, z: 17.6, rEnd: 1.3, rMid: 0.58 },
    ],
    falls: [],
    claws: [
      { wall: 'x1', a0: 23.3, a1: 27.7 },
      { wall: 'x0', a0: 23.9, a1: 27.1 },
    ],
    cracks: [
      [82.9, 19.4, 3.4, 0.3],
      [98.6, 21.1, 3.2, 2.1],
      [82.6, 33.9, 2.8, 1.4],
      [98.7, 33.1, 3, 0.8],
      [91.2, 16.9, 3.2, 2.7],
    ],
    veins: 34,
    crystals: 22,
    mites: 16,
  };
  return [I, Q];
}

// ---------------- materiales ----------------
// (uno por mundo: salen de los materiales del castillo)
const MATS = new WeakMap();
function mats(w) {
  if (MATS.has(w.M)) return MATS.get(w.M);
  const M = w.M;
  const rock = (M.caveRock || M.stone).clone();
  rock.vertexColors = true;
  const ice = (M.ice || M.stone).clone();
  ice.vertexColors = true;
  // (un poco más áspero que el hielo liso: si no, el reflejo del horizonte
  // corta las paredes con una raya a la altura de los ojos)
  ice.roughness = Math.max(ice.roughness ?? 0.18, 0.34);
  ice.envMapIntensity = 0.6;
  const bright = new THREE.MeshStandardMaterial({ map: M.ice?.map || null, color: 0xe6f6ff, vertexColors: true, roughness: 0.12, metalness: 0, emissive: 0x2a6a9a, emissiveIntensity: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.3, metalness: 0.95, emissive: 0x3a2400, emissiveIntensity: 0.45 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd6c9ab, roughness: 0.78 });
  // lo que brilla solo (vetas y cristales): el color va en cada vértice
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const crack = (key, glowC, core) =>
    new THREE.MeshBasicMaterial({ map: crackTex(key, glowC, core), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const out = {
    rock,
    ice,
    bright,
    gold,
    bone,
    glow,
    crackIce: crack('castleIceCrevasse', ['rgba(40,120,255,0.25)', 'rgba(90,180,255,0.8)'], 'rgba(220,245,255,1)'),
    crackEmber: crack('castleEmberVeins', ['rgba(255,70,10,0.22)', 'rgba(255,130,30,0.8)'], 'rgba(255,225,150,1)'),
  };
  MATS.set(w.M, out);
  return out;
}

// Grietas pintadas (se apagan hacia el borde): el hielo azul y las brasas.
function crackTex(key, glow, core) {
  return canvasTex(key, 512, 512, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    const r = rng(key.length * 131 + 7);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k < 14; k++) {
      let x = W / 2 + (r() - 0.5) * 160;
      let y = H / 2 + (r() - 0.5) * 160;
      const a0 = r() * Math.PI * 2;
      const pts = [[x, y]];
      for (let s = 0; s < 10; s++) {
        const a = a0 + (r() - 0.5) * 1.3;
        x += Math.cos(a) * 20;
        y += Math.sin(a) * 20;
        pts.push([x, y]);
      }
      for (const [lw, col] of [[10, glow[0]], [4, glow[1]], [1.5, core]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
  });
}

// ---------------- armado ----------------
export function buildCaves(w) {
  if (!ZONES.I || !ZONES.Q || !EE.cueva) return;
  DRAGON = { x: EE.cueva.dragon[0], z: EE.cueva.dragon[1] };
  CHIMNEY = { x: DRAGON.x, z: DRAGON.z - 2, r: 3.1, lip: 2.4 };
  const group = new THREE.Group();
  group.name = 'cuevas';
  for (const C of caveDefs()) buildCave(w, C, group);
  w.root.add(group);
  w.caveMeshes = group;
}

function buildCave(w, C, group) {
  const Z = ZONES[C.zone];
  const [rx0, rz0, rx1, rz1] = Z.rects[0];
  Object.assign(C, { X0: rx0, Z0: rz0, X1: rx1 + 1, Z1: rz1 + 1, F: Z.y || 0, T: Z.roof });
  C.N = makeNoise(C.seed);
  C.r = rng(C.seed * 13 + 5);
  C.ring = contour(C, 0.42);
  const M = mats(w);
  const main = [];
  const bright = [];
  const glow = [];
  const decals = [];
  const gold = [];
  const bone = [];
  main.push(wallShell(w, C));
  main.push(ceiling(C));
  if (!C.ice) main.push(chimney(C));
  for (const col of C.columns) main.push(column(C, col));
  main.push(...hanging(C));
  main.push(...rubble(w, C));
  main.push(...pebbles(C));
  if (C.mites) main.push(...stalagmites(w, C));
  for (const f of C.falls) bright.push(frozenFall(w, C, f));
  glow.push(...veins(C), ...crystals(C));
  for (const [x, z, s, a] of C.cracks) decals.push(decal(C, x, z, s, a));
  if (!C.ice) {
    gold.push(...coins(C));
    bone.push(...bones(C));
  }
  const add = (list, mat, name, order = 0) => {
    const geos = list.filter(Boolean).map(indexed);
    if (!geos.length) return;
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.name = `${name}${C.zone}`;
    m.castShadow = false;
    m.receiveShadow = !mat.isMeshBasicMaterial;
    m.renderOrder = order;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
  };
  add(main, C.ice ? M.ice : M.rock, 'cueva');
  add(bright, M.bright, 'cascada');
  add(glow, M.glow, 'vetas');
  add(gold, M.gold, 'monedas');
  add(bone, M.bone, 'huesos');
  add(decals, C.ice ? M.crackIce : M.crackEmber, 'grietas', 3);
}

// Todas las piezas con índice (así se pueden juntar), con normales y con color.
function indexed(g) {
  const n = g.attributes.position.count;
  if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) {
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  // (la geometría sin índice de 16 bits no se puede juntar con la de 32)
  if (g.index.array instanceof Uint16Array) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  return g;
}

// ---------------- el contorno de la sala ----------------
// Las paredes con las esquinas redondeadas, de a `step` metros (con cortes
// justo en los bordes de las puertas). Cada muestra: el punto en la pared, la
// normal hacia adentro, el largo recorrido y qué pared es (null en las esquinas).
function contour(C, step) {
  const { X0, Z0, X1, Z1 } = C;
  const [Ra, Rb, Rc, Rd] = C.corners;
  const out = [];
  let s = 0;
  const cutsOf = (wall) => {
    if (wall !== 'z0' && wall !== 'z1') return [];
    const at = wall === 'z0' ? Z0 : Z1;
    return C.holes.filter((h) => Math.abs((h.z0 + h.z1) / 2 - at) < 1).flatMap((h) => [h.x0, h.x1]);
  };
  const line = (ax, az, bx, bz, nx, nz, wall) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ts = new Set();
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) ts.add(+(i / n).toFixed(5));
    for (const c of cutsOf(wall)) {
      const t = (c - ax) / (bx - ax);
      if (t > 0.01 && t < 0.99) ts.add(+t.toFixed(5));
    }
    const list = [...ts].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const tn = list[i + 1] ?? 1;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx, nz, s, wall });
      s += (tn - t) * len;
    }
  };
  const arc = (cx, cz, R, a0, a1) => {
    const n = Math.max(3, Math.round((R * Math.abs(a1 - a0)) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R, nx: -Math.cos(a), nz: -Math.sin(a), s, wall: null });
      s += (R * Math.abs(a1 - a0)) / n;
    }
  };
  // (esquinas: [x0 z0], [x1 z0], [x1 z1], [x0 z1])
  line(X0 + Ra, Z0, X1 - Rb, Z0, 0, 1, 'z0');
  arc(X1 - Rb, Z0 + Rb, Rb, -Math.PI / 2, 0);
  line(X1, Z0 + Rb, X1, Z1 - Rc, -1, 0, 'x1');
  arc(X1 - Rc, Z1 - Rc, Rc, 0, Math.PI / 2);
  line(X1 - Rc, Z1, X0 + Rd, Z1, 0, -1, 'z1');
  arc(X0 + Rd, Z1 - Rd, Rd, Math.PI / 2, Math.PI);
  line(X0, Z1 - Rd, X0, Z0 + Ra, 1, 0, 'x0');
  arc(X0 + Ra, Z0 + Ra, Ra, Math.PI, Math.PI * 1.5);
  return { pts: out, len: s };
}

// Distancia de un punto a una caja (0 adentro).
function boxDist(h, x, y, z) {
  const dx = Math.max(h.x0 - x, 0, x - h.x1);
  const dy = Math.max(h.y0 - y, 0, y - h.y1);
  const dz = Math.max(h.z0 - z, 0, z - h.z1);
  return Math.hypot(dx, dy, dz);
}

// ---------------- la cáscara de las paredes ----------------
// Cuánto se mete la roca en (x, y, z) de la pared (s: el largo del contorno).
function wallDepth(C, s, x, z, y) {
  const N = C.N;
  const h = y - C.F;
  const H = C.T - C.F;
  // contrafuertes y huecos a lo largo de la pared (llegan hasta el piso)
  const but = Math.max(0, N.fbm(s * 0.12 + 7, 3.1, 3) * 1.8 - 0.62);
  // el pie: sale más abajo (como un talud) y se afina subiendo
  const foot = C.foot * but * (1 - 0.35 * smooth(h / 2.5)) + C.low * (0.3 + 0.7 * N.fbm(s * 0.5 + 3, y * 0.5, 3));
  // arriba: masas, cornisas, nervaduras y grietas
  const up = smooth((h - 2) / 2.2);
  // (dos tamaños de masas: las grandes y bultos de medio metro encima)
  const big = Math.max(0, N.fbm(s * 0.16 + 17, y * 0.16 + 4, 4) * 1.7 - 0.55) * C.big + Math.max(0, N.fbm(s * 0.42 + 60, y * 0.42, 3) - 0.45) * 0.9 + but * 0.6;
  const fine = (N.noise(s * 1.3 + 40, y * 1.3) - 0.5) * 0.14;
  let extra;
  if (C.ice) {
    // el hielo chorreado: nervaduras verticales
    extra = (N.noise(s * 1.7 + 5, y * 0.22 + 3) - 0.5) * 0.3;
  } else {
    // cornisas: franjas de roca en capas, y grietas verticales
    const k = y * 0.5 + N.fbm(s * 0.1, 7.7, 2) * 2.4;
    extra = Math.pow(Math.max(0, Math.sin(k * Math.PI)), 6) * 0.38;
    const f = Math.abs(((s * 0.19 + N.noise(y * 0.3, s * 0.05) * 1.4) % 1) - 0.5);
    extra -= smooth(1 - f / 0.045) * 0.3;
  }
  const vk = smooth((h - H * (1 - C.vaultFrac)) / (H * C.vaultFrac));
  let d = foot + up * Math.max(-0.1, big + extra + fine) + C.vault * vk * vk;
  // (detrás de la cascada congelada la roca queda chata)
  for (const f of C.falls) if (x > C.X1 - 1.5 && z > f.z0 - 0.6 && z < f.z1 + 0.6) d = Math.min(d, 0.24);
  // las puertas, los grilletes y los que salen de la tierra: la pared queda plana
  let m = 1;
  for (const hb of C.holes) m = Math.min(m, smooth((boxDist(hb, x, y, z) - 0.05) / 1.1));
  for (const p of C.free) m = Math.min(m, smooth((Math.hypot(x - p.x, y - p.y, z - p.z) - p.r) / p.fall));
  d *= m;
  // en las escaleras (se camina más arriba del piso) la roca no se arrima
  for (const v of C.safe) {
    const dx = Math.max(v.x0 - x, 0, x - v.x1);
    const dz = Math.max(v.z0 - z, 0, z - v.z1);
    const k = (1 - smooth((Math.hypot(dx, dz) - 0.2) / 0.9)) * (1 - smooth((y - v.y1) / 0.8));
    if (k > 0) d = lerp(d, Math.min(d, 0.1), k);
  }
  // cerca de donde salen los muertos, el pie de la roca no avanza
  if (h < FOOT_H + 0.5) {
    for (const [rx, rz, rr] of C.keep) {
      const k = 1 - smooth((Math.hypot(x - rx, z - rz) - rr) / 1.2);
      if (k > 0 && rr >= 1.5) d = lerp(d, Math.min(d, 0.15), k * (1 - smooth((h - FOOT_H) / 0.5)));
    }
  }
  // los arañazos del dragón: tres surcos en diagonal
  if (C.claws) {
    for (const c of C.claws) {
      const onWall = c.wall === 'x1' ? x > C.X1 - 1.4 : x < C.X0 + 1.4;
      if (!onWall || z < c.a0 || z > c.a1 || h < 0.9 || h > 4.2) continue;
      const g = claw(c, z, h);
      if (g > 0) d = Math.max(0.02, d - g * 0.18);
    }
  }
  return Math.max(0.02, d);
}

// Qué tan adentro de un arañazo está (0 afuera, 1 en el fondo del surco).
function claw(c, a, h) {
  const u = (a - c.a0) / (c.a1 - c.a0);
  const v = (h - 0.9) / 3.3;
  let best = 0;
  for (let k = 0; k < 3; k++) {
    // surcos paralelos que bajan en diagonal (más finitos en las puntas)
    const lineU = 0.2 + k * 0.28 + (1 - v) * 0.22;
    const dist = Math.abs(u - lineU) * (c.a1 - c.a0);
    const taper = Math.sin(clamp01(v) * Math.PI);
    best = Math.max(best, smooth(1 - dist / (0.11 * taper + 0.02)) * taper);
  }
  return best;
}

// Un punto de la cáscara (y su normal hacia adentro) para una muestra del contorno.
function wallPoint(C, P, y, out) {
  const d = wallDepth(C, P.s, P.x, P.z, y);
  return out.set(P.x + P.nx * d, y, P.z + P.nz * d);
}

function wallShell(w, C) {
  const pts = C.ring.pts;
  const y0 = C.F - 0.15;
  const y1 = C.T - 0.04;
  const nr = Math.round((y1 - y0) / 0.4);
  const ys = new Set();
  for (let j = 0; j <= nr; j++) ys.add(+(y0 + ((y1 - y0) * j) / nr).toFixed(4));
  for (const h of C.holes) for (const y of [h.y0, h.y1]) if (y > y0 && y < y1) ys.add(+y.toFixed(4));
  // (la franja de abajo con más filas: ahí se mide la caja de choque)
  for (let y = C.F + 0.3; y < C.F + FOOT_H; y += 0.5) ys.add(+y.toFixed(4));
  const rows = [...ys].sort((a, b) => a - b);
  const nc = pts.length;
  const NR = rows.length;
  const pos = new Float32Array(nc * NR * 3);
  const col = new Float32Array(nc * NR * 3);
  const uv = new Float32Array(nc * NR * 2);
  // lo más que sale la roca abajo, en cada columna (para la franja de choque)
  const footMax = new Float32Array(nc);
  for (let i = 0; i < nc; i++) {
    const P = pts[i];
    for (let j = 0; j < NR; j++) {
      const y = rows[j];
      const d = wallDepth(C, P.s, P.x, P.z, y);
      const k = i * NR + j;
      pos[k * 3] = P.x + P.nx * d;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = P.z + P.nz * d;
      uv[k * 2] = P.s / 2.2;
      uv[k * 2 + 1] = y / 2.2;
      if (y >= C.F - 0.01 && y <= C.F + FOOT_H) footMax[i] = Math.max(footMax[i], d);
      const c = C.ice ? iceColor(C, P.s, y, d) : rockColor(C, P, y, d);
      col.set(c, k * 3);
    }
  }
  const idx = [];
  for (let i = 0; i < nc; i++) {
    const i2 = (i + 1) % nc;
    for (let j = 0; j < NR - 1; j++) {
      // los agujeros de las puertas
      const cx = (pts[i].x + pts[i2].x) / 2;
      const cz = (pts[i].z + pts[i2].z) / 2;
      const cy = (rows[j] + rows[j + 1]) / 2;
      if (C.holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1 && cy > h.y0 && cy < h.y1)) continue;
      const a = i * NR + j;
      const b = i2 * NR + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  pads(w, C, footMax);
  return g;
}

// El color de la roca: lo que sobresale más claro, lo hundido más oscuro, el
// tizne alrededor del dragón y el fondo de los arañazos.
function rockColor(C, P, y, d) {
  const N = C.N;
  const h = y - C.F;
  let c = 0.78 + 0.42 * smooth((d - 0.2) / 1.4) + (N.noise(P.s * 0.7 + 9, y * 0.7) - 0.5) * 0.18;
  const band = N.fbm(P.s * 0.05, y * 0.35 + 9, 2);
  let r = c * (0.98 + band * 0.1);
  let g = c * 0.96;
  let b = c * (0.92 - band * 0.06);
  // el tizne: el calor del dragón subió por las paredes
  const sd = Math.hypot(P.x - DRAGON.x, P.z - DRAGON.z);
  const soot = smooth(1 - sd / 12.5) * (0.45 + 0.55 * smooth(1 - h / 10)) * 0.72;
  if (C.claws) {
    for (const cw of C.claws) {
      const onWall = cw.wall === 'x1' ? P.x > C.X1 - 1.4 : P.x < C.X0 + 1.4;
      if (onWall && P.z > cw.a0 && P.z < cw.a1 && h > 0.9 && h < 4.2) {
        c = 1 - claw(cw, P.z, h) * 0.6;
        r *= c;
        g *= c;
        b *= c;
      }
    }
  }
  const k = 1 - soot;
  return [r * k, g * k, b * k];
}

// El hielo: azul hondo en lo hundido, escarcha blanca en lo que sobresale.
function iceColor(C, s, y, d) {
  const N = C.N;
  const frost = clamp01(smooth((d - 0.15) / 1.1) * 0.9 + (N.noise(s * 0.9 + 3, y * 0.9) - 0.5) * 0.35);
  const deep = [0.5, 0.7, 0.95];
  const white = [1.12, 1.14, 1.16];
  return deep.map((v, i) => lerp(v, white[i], frost));
}

// ---------------- la franja invisible junto a las paredes ----------------
// Sigue al pie de la roca: el jugador (y los muertos) quedan afuera de la
// piedra, así la cámara no se mete nunca. De a tramos de ~1 m por pared y
// una caja en cada esquina redondeada.
function pads(w, C, footMax) {
  const pts = C.ring.pts;
  const top = C.F + 3.2;
  const add = (b) => w.addBox(b, { kind: 'prop', cave: true });
  let run = null;
  const flush = () => {
    if (!run) return;
    const t = run.t + 0.08;
    const [a0, a1] = [Math.min(run.a0, run.a1), Math.max(run.a0, run.a1)];
    if (run.wall === 'z0') add([a0, C.F, C.Z0, a1, top, C.Z0 + t]);
    else if (run.wall === 'z1') add([a0, C.F, C.Z1 - t, a1, top, C.Z1]);
    else if (run.wall === 'x0') add([C.X0, C.F, a0, C.X0 + t, top, a1]);
    else add([C.X1 - t, C.F, a0, C.X1, top, a1]);
    run = null;
  };
  const inHole = (P) => C.holes.some((h) => P.x > h.x0 - 0.05 && P.x < h.x1 + 0.05 && P.z > h.z0 && P.z < h.z1 && h.y0 < top);
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i];
    const Pn = pts[(i + 1) % pts.length];
    if (!P.wall || inHole(P) || P.wall !== Pn.wall) {
      flush();
      continue;
    }
    const a = P.wall === 'z0' || P.wall === 'z1' ? P.x : P.z;
    const b = P.wall === 'z0' || P.wall === 'z1' ? Pn.x : Pn.z;
    const t = Math.max(footMax[i], footMax[(i + 1) % pts.length]);
    if (!run) run = { wall: P.wall, a0: a, a1: b, t };
    else {
      run.a1 = b;
      run.t = Math.max(run.t, t);
    }
    if (Math.abs(run.a1 - run.a0) >= 1) flush();
  }
  flush();
  // las esquinas: una caja que tapa el redondeo (más lo que sale la roca ahí)
  const { X0, Z0, X1, Z1 } = C;
  const corner = (cx, cz, sx, sz, R) => {
    let t = 0;
    for (let i = 0; i < pts.length; i++) {
      const P = pts[i];
      if (!P.wall && Math.abs(P.x - cx) < R + 0.1 && Math.abs(P.z - cz) < R + 0.1) t = Math.max(t, footMax[i]);
    }
    const e = R * 0.36 + t + 0.08;
    add([Math.min(cx, cx + sx * e), C.F, Math.min(cz, cz + sz * e), Math.max(cx, cx + sx * e), top, Math.max(cz, cz + sz * e)]);
  };
  const [Ra, Rb, Rc, Rd] = C.corners;
  corner(X0, Z0, 1, 1, Ra);
  corner(X1, Z0, -1, 1, Rb);
  corner(X1, Z1, -1, -1, Rc);
  corner(X0, Z1, 1, -1, Rd);
}

// ---------------- el techo ----------------
function ceilDepth(C, x, z) {
  const N = C.N;
  const edge = Math.min(x - C.X0, C.X1 - x, z - C.Z0, C.Z1 - z);
  const taper = smooth((edge - 0.4) / 1.9);
  let dc = C.drop * (0.2 + 0.8 * N.fbm(x * 0.11 + 50, z * 0.11 + 20, 4));
  dc += 0.34 * (N.noise(x * 0.6 + 8, z * 0.6) - 0.5);
  if (C.ice) {
    // bolsones: el techo de la gruta sube en burbujas
    const b = N.fbm(x * 0.28 + 3, z * 0.28 + 71, 3);
    dc -= Math.max(0, b - 0.52) * 2.2;
  } else {
    // costillas de roca que cruzan el techo
    dc += Math.pow(Math.max(0, Math.sin(x * 0.55 + N.fbm(z * 0.08, x * 0.05 + 3, 2) * 5)), 6) * 0.8;
    // alrededor de la chimenea la roca cuelga en un labio (así el tubo se ve
    // hondo) y adentro del agujero no hay techo
    const cd = Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z);
    dc *= smooth((cd - CHIMNEY.r) / 2.2);
    dc += CHIMNEY.lip * smooth(1 - (cd - CHIMNEY.r) / 3.6) * (0.85 + 0.3 * N.noise(x * 0.9, z * 0.9 + 40));
  }
  return Math.max(0, dc * taper);
}

function ceilY(C, x, z) {
  return C.T - 0.1 - ceilDepth(C, x, z);
}

function ceiling(C) {
  const step = 0.45;
  const nx = Math.round((C.X1 - C.X0) / step);
  const nz = Math.round((C.Z1 - C.Z0) / step);
  const n = (nx + 1) * (nz + 1);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = C.X0 + (i / nx) * (C.X1 - C.X0);
      const z = C.Z0 + (j / nz) * (C.Z1 - C.Z0);
      const dc = ceilDepth(C, x, z);
      const k = j * (nx + 1) + i;
      pos.set([x, C.T - 0.1 - dc, z], k * 3);
      uv.set([x / 3, z / 3], k * 2);
      let c;
      if (C.ice) c = iceColor(C, x + z, C.T - dc, 0.2 + dc * 0.7);
      else {
        // lo que cuelga más claro; alrededor de la chimenea, tizne
        const v = 0.66 + 0.5 * smooth(dc / C.drop) + (C.N.noise(x * 0.8, z * 0.8 + 5) - 0.5) * 0.16;
        const cd = Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z);
        const soot = smooth(1 - (cd - CHIMNEY.r) / 5) * 0.8;
        c = [v * (1 - soot), v * 0.97 * (1 - soot), v * 0.93 * (1 - soot)];
      }
      col.set(c, k * 3);
    }
  }
  const idx = [];
  // (el agujero de la chimenea: se saltean los cuadros que caen adentro)
  const hole = (x, z) => !C.ice && Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z) < CHIMNEY.r * 1.04;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      if (hole(pos[a * 3] + step / 2, pos[a * 3 + 2] + step / 2)) continue;
      idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// La chimenea del dragón: un tubo de roca que sube hasta lo negro (por ahí se
// va volando cuando rompe las cadenas).
function chimney(C) {
  const r = CHIMNEY.r;
  // (baja un poco más que el labio del techo: tapa el borde serruchado)
  const yb = C.T - 0.1 - CHIMNEY.lip * 1.25;
  const g = new THREE.CylinderGeometry(r * 0.86, r * 1.2, C.T - yb, 20, 6, true);
  // (por adentro: las caras miran al centro)
  g.scale(-1, 1, 1);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash3(x, y * 0.5, z) - 0.5) * 0.18;
    p.setXYZ(i, x * k + CHIMNEY.x, y + (C.T + yb) / 2, z * k + CHIMNEY.z);
    const dark = smooth((y + (C.T - yb) / 2) / (C.T - yb));
    col.set([0.35 * (1 - dark), 0.33 * (1 - dark), 0.32 * (1 - dark)], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // la tapa de arriba, negra: parece que sigue para siempre
  const cap = new THREE.CircleGeometry(r * 1.1, 20).rotateX(Math.PI / 2).translate(CHIMNEY.x, C.T - 0.03, CHIMNEY.z);
  cap.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(cap.attributes.position.count * 3), 3));
  return mergeGeometries([indexed(g), indexed(cap)], false);
}

// ---------------- columnas ----------------
// Del piso al techo, anchas en las puntas y finas en la cintura.
function column(C, o) {
  const H = C.T - C.F;
  const g = new THREE.CylinderGeometry(1, 1, H + 0.3, 16, 34, true);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const N = C.N;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const v = (y + (H + 0.3) / 2) / (H + 0.3);
    const prof = Math.pow(Math.abs(v * 2 - 1), 1.7);
    let r = o.rMid + (o.rEnd - o.rMid) * prof;
    const n = N.fbm(Math.cos(a) * 1.3 + o.x, Math.sin(a) * 1.3 + v * 6 + o.z, 3);
    r *= 0.8 + n * 0.4;
    if (C.ice) r *= 1 + (N.noise(a * 3 + 7, v * 2) - 0.5) * 0.25;
    // (la base no se sale de su caja de choque)
    if (v * H < FOOT_H) r = Math.min(r, o.rEnd * 0.98);
    p.setXYZ(i, o.x + Math.cos(a) * r, C.F - 0.15 + v * (H + 0.3), o.z + Math.sin(a) * r);
    const c = C.ice ? iceColor(C, a * 3, C.F + v * H, 0.2 + n * 0.9) : [0.8 + n * 0.34, 0.78 + n * 0.3, 0.74 + n * 0.28];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------- lo que cuelga del techo ----------------
function hanging(C) {
  const out = [];
  const r = C.r;
  const N = C.N;
  const want = C.ice ? 70 : 64;
  const clear = (x, z) => {
    if (C.ice) return true;
    // (el dragón sale volando derecho para arriba: nada colgando en su camino)
    return Math.hypot(x - CHIMNEY.x, z - CHIMNEY.z) > 5.5;
  };
  for (let tries = 0; tries < want * 14 && out.length < want; tries++) {
    const x = C.X0 + 1.2 + r() * (C.X1 - C.X0 - 2.4);
    const z = C.Z0 + 1.2 + r() * (C.Z1 - C.Z0 - 2.4);
    if (!clear(x, z)) continue;
    // en racimos
    if (N.fbm(x * 0.3 + 11, z * 0.3 + 3, 2) < 0.46 && r() < 0.85) continue;
    const top = ceilY(C, x, z);
    const maxLen = top - (C.F + (C.ice ? 3.4 : 5));
    if (maxLen < 0.4) continue;
    const L = Math.min(maxLen, C.ice ? 0.35 + r() * r() * 2.3 : 0.8 + r() * r() * 4.6);
    const rad = C.ice ? 0.05 + r() * 0.1 + L * 0.035 : 0.16 + r() * 0.24 + L * 0.06;
    out.push(spike(C, x, top + 0.25, z, L + 0.25, rad, r));
    // alguna chiquita pegada
    if (r() < 0.5) {
      const a = r() * Math.PI * 2;
      const x2 = x + Math.cos(a) * rad * 2.2;
      const z2 = z + Math.sin(a) * rad * 2.2;
      out.push(spike(C, x2, ceilY(C, x2, z2) + 0.2, z2, L * (0.3 + r() * 0.4) + 0.2, rad * 0.55, r));
    }
  }
  return out;
}

// Una estalactita (o carámbano): un cono torcido que baja desde (x, y, z).
function spike(C, x, y, z, L, rad, r) {
  const g = new THREE.CylinderGeometry(rad, 0.012, L, 7, 5, false);
  g.translate(0, -L / 2, 0);
  const p = g.attributes.position;
  const bx = (r() - 0.5) * 0.3;
  const bz = (r() - 0.5) * 0.3;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i);
    const v = -yy / L;
    const j = 1 + (hash3(p.getX(i) + x, yy, p.getZ(i) + z) - 0.5) * 0.3;
    p.setXYZ(i, x + p.getX(i) * j + bx * v * v * L * 0.3, y + yy, z + p.getZ(i) * j + bz * v * v * L * 0.3);
    const c = C.ice ? iceColor(C, x + z, y, 0.4 + v * 1.1) : [0.86 - v * 0.08, 0.84 - v * 0.08, 0.8 - v * 0.06];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------- piedras al pie de las paredes ----------------
// Una piedra facetada (o un bloque de hielo), achatada y hundida en el piso.
function boulder(C, x, z, rad, sy, r) {
  const g = new THREE.IcosahedronGeometry(1, C.ice ? 0 : 1);
  const p = g.attributes.position;
  const rot = r() * Math.PI * 2;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const sx = 0.85 + r() * 0.4;
  const sz = 0.85 + r() * 0.4;
  const col = new Float32Array(p.count * 3);
  const tone = 0.86 + r() * 0.26;
  const seed = r() * 10;
  for (let i = 0; i < p.count; i++) {
    let vx = p.getX(i);
    let vy = p.getY(i);
    let vz = p.getZ(i);
    const k = 1 + (hash3(vx + seed, vy, vz) - 0.5) * (C.ice ? 0.5 : 0.36);
    vx *= k * sx * rad;
    vy *= k * sy * rad;
    vz *= k * sz * rad;
    const wx = vx * cs - vz * sn;
    const wz = vx * sn + vz * cs;
    const y = C.F - rad * sy * 0.3 + vy;
    p.setXYZ(i, x + wx, y, z + wz);
    // lo de abajo más oscuro (la sombra contra el piso)
    const ao = 0.55 + 0.45 * smooth((y - C.F) / (rad * sy + 0.01));
    const c = C.ice ? iceColor(C, x + z * 3, y, 0.25 + ao * 0.8) : [tone * ao, tone * ao * 0.97, tone * ao * 0.93];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function keepAway(C, x, z, rad) {
  for (const [kx, kz, kr] of C.keep) if (Math.hypot(x - kx, z - kz) < kr + rad) return true;
  for (const [x0, z0, x1, z1] of C.lanes) if (x > x0 - rad && x < x1 + rad && z > z0 - rad && z < z1 + rad) return true;
  for (const o of C.columns) if (Math.hypot(x - o.x, z - o.z) < o.rEnd + rad + 0.3) return true;
  return false;
}

function rubble(w, C) {
  const out = [];
  const r = C.r;
  const N = C.N;
  const { pts } = contour(C, 0.8);
  for (const P of pts) {
    // no en todos lados: manchones
    const n = N.fbm(P.s * 0.2 + 30, 1.3, 2);
    if (n < 0.4 || r() < 0.15) continue;
    const rad = (C.ice ? 0.28 : 0.32) + n * (C.ice ? 0.6 : 0.95) * (0.6 + r() * 0.6);
    // (se apoya contra el pie de la roca: lo que sale ahí la pared)
    const wd = wallDepth(C, P.s, P.x, P.z, C.F + 0.4);
    const off = wd + rad * 0.5 + r() * 0.2;
    const x = P.x + P.nx * off + (r() - 0.5) * 0.3;
    const z = P.z + P.nz * off + (r() - 0.5) * 0.3;
    if (keepAway(C, x, z, rad)) continue;
    const sy = C.ice ? 0.9 + r() * 0.7 : 0.55 + r() * 0.35;
    out.push(boulder(C, x, z, rad, sy, r));
    // las grandes se chocan (y los tiros pegan)
    if (rad > 0.38) {
      const e = rad * 0.75;
      w.addBox([x - e, C.F, z - e, x + e, C.F + Math.max(0.45, rad * sy * 0.95), z + e], { kind: 'prop' });
    }
    // alguna chiquita al lado
    if (r() < 0.65) {
      const a = r() * Math.PI * 2;
      const r2 = rad * (0.28 + r() * 0.25);
      const x2 = x + Math.cos(a) * (rad + r2) * 0.9;
      const z2 = z + Math.sin(a) * (rad + r2) * 0.9;
      if (!keepAway(C, x2, z2, r2)) out.push(boulder(C, x2, z2, r2, sy, r));
    }
  }
  // las columnas se chocan
  for (const o of C.columns) {
    const e = o.rEnd * 0.8;
    w.addBox([o.x - e, C.F, o.z - e, o.x + e, C.T, o.z + e], { kind: 'prop' });
  }
  return out;
}

// Pedregullo suelto (sin caja: se pisa).
function pebbles(C) {
  const out = [];
  const r = C.r;
  const want = C.ice ? 80 : 130;
  for (let tries = 0; tries < want * 6 && out.length < want; tries++) {
    const x = C.X0 + 0.5 + r() * (C.X1 - C.X0 - 1);
    const z = C.Z0 + 0.5 + r() * (C.Z1 - C.Z0 - 1);
    const edge = Math.min(x - C.X0, C.X1 - x, z - C.Z0, C.Z1 - z);
    // más cerca de las paredes
    if (edge > 3.5 && r() < 0.8) continue;
    if (keepAway(C, x, z, 0.1)) continue;
    const rad = 0.04 + r() * r() * 0.12;
    out.push(boulder(C, x, z, rad, 0.6 + r() * 0.4, r));
  }
  return out;
}

// ---------------- lo que brilla solo ----------------
// Vetas: grietas quebradas que siguen la cáscara (brasas cerca del dragón,
// luz azul adentro del hielo), con alguna ramita. Van un poquito afuera de la
// roca y se ven de los dos lados.
function veinStrip(C, i0, h0, len, dir, width, color, r, out) {
  const pts = C.ring.pts;
  const P = pts[i0];
  const tmp = new THREE.Vector3();
  const pos = [];
  const col = [];
  const idx = [];
  const steps = 22;
  let di = 0;
  let y = C.F + h0;
  let n = 0;
  for (let k = 0; k <= steps; k++) {
    const Q = pts[(i0 + Math.round(di) + pts.length) % pts.length];
    wallPoint(C, Q, y, tmp);
    const x = tmp.x + Q.nx * 0.035;
    const z = tmp.z + Q.nz * 0.035;
    const tx = -Q.nz;
    const tz = Q.nx;
    const wv = width * (1 - (k / steps) * 0.75);
    pos.push(x - tx * wv, y, z - tz * wv, x + tx * wv, y, z + tz * wv);
    const f = 1 - (k / steps) * 0.55;
    col.push(...color.map((v) => v * f), ...color.map((v) => v * f));
    if (k < steps) idx.push(k * 2, k * 2 + 1, k * 2 + 3, k * 2, k * 2 + 3, k * 2 + 2);
    n++;
    y += (len / steps) * dir * (0.6 + r() * 0.8);
    // se quiebra de costado (medio contorno por paso, a veces más)
    di += (r() - 0.5) * (r() < 0.2 ? 2.2 : 0.9);
    if (y > C.T - 1 || y < C.F + 0.05) break;
  }
  if (n < 3) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const both = [];
  for (let k = 0; k < idx.length; k += 3) if (Math.max(idx[k], idx[k + 1], idx[k + 2]) < n * 2) both.push(idx[k], idx[k + 1], idx[k + 2], idx[k], idx[k + 2], idx[k + 1]);
  if (!both.length) return;
  g.setIndex(both);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, q) => (q % 3 === 1 ? 1 : 0)), 3));
  out.push(g);
}

function veins(C) {
  const out = [];
  const r = C.r;
  const pts = C.ring.pts;
  for (let tries = 0, made = 0; tries < C.veins * 20 && made < C.veins; tries++) {
    const i = Math.floor(r() * pts.length);
    const P = pts[i];
    if (!P.wall) continue;
    const near = Math.hypot(P.x - DRAGON.x, P.z - DRAGON.z);
    // las de brasa, cerca del dragón (y abajo); las del hielo, en cualquier lado
    if (!C.ice && near > 13.5 && r() < 0.85) continue;
    const hot = C.ice ? 0 : smooth(1 - (near - 6) / 9);
    const h0 = C.ice ? 1 + r() * 5 : 0.15 + r() * 1.2;
    const len = C.ice ? 1 + r() * 2.2 : 0.9 + r() * 1.9;
    const width = C.ice ? 0.016 + r() * 0.016 : 0.014 + r() * 0.018;
    const color = C.ice ? [0.45, 1.2, 2.1] : [1.9 * (0.5 + hot * 0.5), 0.46 * (0.5 + hot * 0.5), 0.08];
    const dir = C.ice ? (r() < 0.5 ? 1 : -1) : 1;
    veinStrip(C, i, h0, len, dir, width, color, r, out);
    // una o dos ramitas que salen del medio
    for (let b = 0; b < (r() < 0.6 ? 2 : 1); b++) veinStrip(C, (i + Math.round((r() - 0.5) * 3) + pts.length) % pts.length, h0 + len * (0.25 + r() * 0.4), len * 0.4, dir, width * 0.6, color.map((v) => v * 0.8), r, out);
    made++;
  }
  return out;
}

// Estalagmitas: conos de roca torcidos que suben del piso, en racimos junto a
// las paredes (con su caja: no se atraviesan).
function stalagmites(w, C) {
  const out = [];
  const r = C.r;
  const pts = C.ring.pts;
  for (let made = 0, tries = 0; made < C.mites && tries < C.mites * 30; tries++) {
    const P = pts[Math.floor(r() * pts.length)];
    const wd = wallDepth(C, P.s, P.x, P.z, C.F + 0.4);
    const off = wd + 0.5 + r() * 1.3;
    const x = P.x + P.nx * off;
    const z = P.z + P.nz * off;
    const H = 1.2 + r() * r() * 3.2;
    const rad = 0.22 + H * 0.12 + r() * 0.12;
    if (keepAway(C, x, z, rad + 0.3)) continue;
    // la grande y dos o tres chicas alrededor
    out.push(mite(C, x, z, H, rad, r));
    const e = rad * 0.8;
    w.addBox([x - e, C.F, z - e, x + e, C.F + H * 0.8, z + e], { kind: 'prop' });
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = rad * (1.4 + r() * 0.8);
      const x2 = x + Math.cos(a) * d;
      const z2 = z + Math.sin(a) * d;
      const h2 = H * (0.25 + r() * 0.35);
      if (!keepAway(C, x2, z2, rad * 0.5)) out.push(mite(C, x2, z2, h2, rad * (0.4 + r() * 0.25), r));
    }
    made++;
  }
  return out;
}

function mite(C, x, z, H, rad, r) {
  const g = new THREE.CylinderGeometry(0.02, rad, H, 8, 6, false);
  g.translate(0, H / 2, 0);
  const p = g.attributes.position;
  const bx = (r() - 0.5) * 0.4;
  const bz = (r() - 0.5) * 0.4;
  const col = new Float32Array(p.count * 3);
  const seed = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i);
    const v = yy / H;
    const j = 1 + (hash3(p.getX(i) + seed, yy, p.getZ(i)) - 0.5) * 0.35;
    p.setXYZ(i, x + p.getX(i) * j + bx * v * v * H * 0.25, C.F - 0.1 + yy, z + p.getZ(i) * j + bz * v * v * H * 0.25);
    const ao = 0.6 + 0.4 * smooth(v * 2);
    col.set([0.86 * ao, 0.83 * ao, 0.78 * ao], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Racimos de cristales que brillan, en lo alto de las paredes y en el techo.
function crystals(C) {
  const out = [];
  const r = C.r;
  const pts = C.ring.pts;
  const tmp = new THREE.Vector3();
  const palette = C.ice ? [[0.8, 1.6, 2.4], [1.4, 1.9, 2.4]] : [[0.5, 1.2, 2.2], [1.3, 0.7, 2.2], [0.5, 1.9, 1.4]];
  for (let made = 0, tries = 0; made < C.crystals && tries < C.crystals * 20; tries++) {
    const P = pts[Math.floor(r() * pts.length)];
    const y = C.F + 3.2 + r() * (C.T - C.F - 5);
    wallPoint(C, P, y, tmp);
    const base = tmp.clone();
    const n = new THREE.Vector3(P.nx, 0.25 + r() * 0.5, P.nz).normalize();
    const color = palette[Math.floor(r() * palette.length)];
    const count = 3 + Math.floor(r() * 4);
    for (let k = 0; k < count; k++) {
      const len = 0.25 + r() * 0.55;
      const rad = 0.05 + r() * 0.06;
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(rad, len / 2, rad);
      g.translate(0, len / 2 - 0.05, 0);
      const dirv = n.clone().add(new THREE.Vector3((r() - 0.5) * 0.9, (r() - 0.5) * 0.6, (r() - 0.5) * 0.9)).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv));
      g.translate(base.x + (r() - 0.5) * 0.3, base.y + (r() - 0.5) * 0.3, base.z + (r() - 0.5) * 0.3);
      const pc = g.attributes.position.count;
      const col = new Float32Array(pc * 3);
      for (let q = 0; q < pc; q++) col.set(color.map((v) => v * (0.7 + (q % 3) * 0.15)), q * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.push(g);
    }
    made++;
  }
  return out;
}

// ---------------- la cascada congelada ----------------
// Una cortina de hielo claro que baja por la pared del este y se amontona en
// el piso (con su caja: no se camina por arriba del montón).
function frozenFall(w, C, f) {
  const N = C.N;
  const nz = 48;
  const ny = 44;
  const pos = new Float32Array((nz + 1) * (ny + 1) * 3);
  const uv = new Float32Array((nz + 1) * (ny + 1) * 2);
  const col = new Float32Array((nz + 1) * (ny + 1) * 3);
  const H = C.T - C.F;
  // lo más que sale abajo (la caja de choque llega hasta ahí)
  let foot = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nz; i++) {
      const u = i / nz;
      const z = f.z0 + (f.z1 - f.z0) * u;
      const y = C.F - 0.05 + ((H - 0.15) * j) / ny;
      const h = y - C.F;
      const across = Math.pow(Math.sin(u * Math.PI), 0.7);
      // columnas de hielo que bajan (crestas de dos tamaños, un poco torcidas)
      const wob = N.noise(y * 0.3, z * 0.4 + 4) * 4;
      const r1 = 1 - Math.abs(Math.sin(z * 4.2 + wob));
      const r2 = 1 - Math.abs(Math.sin(z * 9.7 + wob * 1.7 + 2));
      const ridge = (r1 * r1 * r1 * 0.3 + r2 * r2 * r2 * r2 * 0.12) * across;
      // chorreado: bultos que quedaron colgando a distintas alturas
      const drip = Math.max(0, N.fbm(z * 1.3 + 9, y * 0.45, 3) - 0.45) * 0.9 * across;
      const pool = smooth((1.6 - h) / 1.6);
      const top = smooth((h - (H - 1.6)) / 1.6);
      let d = 0.05 + across * (0.35 + 0.3 * N.fbm(z * 0.6, y * 0.25, 3)) + ridge + drip + pool * across;
      // arriba sale del techo como un labio
      d = lerp(d, 0.1 + across * (1 + ridge), top);
      if (h < 1.3) foot = Math.max(foot, d);
      const k = j * (nz + 1) + i;
      pos.set([C.X1 - d, y, z], k * 3);
      uv.set([z / 2, y / 3], k * 2);
      // las crestas blancas, lo hundido azul hondo
      const v = 0.55 + ridge * 1.2 + drip * 0.5;
      col.set([v * 0.8, v * 0.92, Math.min(1.2, v * 1.05 + 0.1)], k * 3);
    }
  }
  const idx = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nz; i++) {
      const a = j * (nz + 1) + i;
      // (la cara mira al oeste, al centro de la gruta)
      idx.push(a, a + 1, a + nz + 1, a + 1, a + nz + 2, a + nz + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  w.addBox([C.X1 - foot - 0.08, C.F, f.z0 + 0.1, C.X1, C.F + 1.25, f.z1 - 0.1], { kind: 'prop' });
  return g;
}

// ---------------- grietas del piso ----------------
function decal(C, x, z, s, a) {
  const g = new THREE.PlaneGeometry(s, s);
  g.rotateX(-Math.PI / 2);
  g.rotateY(a);
  g.translate(x, C.F + 0.025, z);
  return g;
}

// ---------------- el tesoro desparramado y los huesos ----------------
function coins(C) {
  const out = [];
  const r = C.r;
  const spots = [
    [83.2, 26.5, 3.2, 26],
    [97.6, 28.5, 3, 22],
    [DRAGON.x, DRAGON.z, 9, 18],
  ];
  for (const [cx, cz, R, n] of spots) {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = (0.35 + Math.sqrt(r()) * 0.65) * R;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (x < C.X0 + 0.8 || x > C.X1 - 0.8 || z < C.Z0 + 0.8 || z > C.Z1 - 0.8) continue;
      const g = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 9);
      g.rotateX((r() - 0.5) * 0.5);
      g.rotateZ((r() - 0.5) * 0.5);
      g.translate(x, C.F + 0.012, z);
      out.push(g);
    }
  }
  return out;
}

function bones(C) {
  const out = [];
  const r = C.r;
  const spots = [
    [81.9, 24.2],
    [99.1, 25.6],
    [86.2, 16.9],
    [95.4, 39.1],
    [81.8, 35.2],
  ];
  for (const [x, z] of spots) {
    // un cráneo y dos o tres huesos largos
    const sk = new THREE.SphereGeometry(0.12, 10, 8);
    sk.scale(1, 0.9, 1.2);
    sk.rotateY(r() * 6);
    sk.translate(x, C.F + 0.1, z);
    out.push(sk);
    const jaw = new THREE.BoxGeometry(0.14, 0.04, 0.1);
    jaw.translate(x + 0.02, C.F + 0.03, z + 0.1);
    out.push(jaw);
    for (let k = 0; k < 2 + (r() < 0.5 ? 1 : 0); k++) {
      const b = new THREE.CapsuleGeometry(0.025, 0.32 + r() * 0.2, 3, 6);
      b.rotateZ(Math.PI / 2);
      b.rotateY(r() * Math.PI);
      b.translate(x + (r() - 0.5) * 0.7, C.F + 0.03, z + (r() - 0.5) * 0.7);
      out.push(b);
    }
  }
  return out;
}

// (Eclipse Matero, world/eclipse/v5.js: la gruta del glaciar en su sección igual)
export { buildCave };
