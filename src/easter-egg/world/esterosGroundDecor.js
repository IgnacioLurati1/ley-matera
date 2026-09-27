import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, DOORS, PERK_SPOTS, WALL_BUYS, BOX_SPOTS, POWER, PAP, RISERS } from '../config/map';
import { FIRES } from '../config/maps/esteros';
import { rng } from '../core/noise';
import { coverageMips } from '../core/textures';

// Lo que hay en el piso de cada zona de los esteros (para saber dónde estás
// sin mirar el cartel). Todo instanciado: una malla por forma para todo el
// mapa (unas 14 llamadas de dibujo en total), cada pieza con su color.
//  · A, la isleta del fogón: ceniza y tierra pisada alrededor del fuego;
//  · B, el obraje: aserrín colorado de quebracho, astillas y rollizos apilados;
//  · C, la pesquería: barro mojado que brilla, conchas, piedras de río,
//    redes secándose en palos y canastos de pescado;
//  · D, la laguna: conchas de caracol y piedritas en la orilla, charcos;
//  · E, la reducción: cascotes de piedra roja, verdín y velitas prendidas;
//  · F, el embalsado: raíces que asoman del barro flotante y verdín;
//  · G, el algarrobo: hojarasca, chauchas de algarrobo, huesos y calaveras de vaca;
//  · H, la casona: pedregullo gris y tejas rotas.
// Nada de esto se refleja en el agua ni hace sombra (salvo rollizos y piedras
// grandes): es chico y va pegado al suelo.

const FLOOR = 1;
// cuántas de cada cosa por zona (se reparten al azar por el suelo seco de la zona)
const PLAN = {
  A: { ash: 16, mud: 22, stone: 14 },
  B: { saw: 70, chip: 280, log: 18, stone: 10 },
  C: { puddle: 30, shell: 50, stone: 40, net: 4, basket: 8 },
  D: { shell: 110, stone: 30, puddle: 18 },
  E: { rubble: 170, moss: 50, candle: 14 },
  F: { root: 44, moss: 60 },
  G: { leaf: 100, pod: 230, bone: 26, skull: 4 },
  H: { gravel: 380, tile: 80 },
};

// Lugares donde no va nada (máquinas, puertas, cajas, risers).
function keepOut() {
  const pts = [];
  for (const d of [...PERK_SPOTS, ...WALL_BUYS, ...BOX_SPOTS, POWER, PAP].filter(Boolean)) pts.push([d.cell[0] + 0.5 + d.face[0], d.cell[1] + 0.5 + d.face[1], 1.4]);
  for (const d of DOORS) for (const [x, z] of d.cells) pts.push([x + 0.5, z + 0.5, 1.4]);
  for (const r of RISERS) pts.push([r.pos[0], r.pos[1], 1]);
  return (x, z) => pts.some(([px, pz, rr]) => Math.hypot(x - px, z - pz) < rr);
}

// Un parche chato e irregular (se escala por instancia).
function flatGeo(seed) {
  const r = rng(seed);
  const n = 9;
  const P = [0, 0, 0];
  const U = [0.5, 0.5];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = 0.75 + r() * 0.35;
    P.push(Math.cos(a) * d, 0, Math.sin(a) * d);
    U.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  const idx = [];
  for (let k = 1; k <= n; k++) idx.push(0, k + 1, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Una mancha de borde suave y desparejo (el color lo pone cada pieza): así
// el aserrín, la ceniza o el verdín no se ven como recortes de papel.
function blotchTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const r = rng(91);
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * 34;
    const cx = 64 + Math.cos(a) * d;
    const cy = 64 + Math.sin(a) * d;
    const rad = 14 + r() * 26;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.35 + r() * 0.3})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
  }
  // unas motitas (granos, astillitas)
  for (let k = 0; k < 160; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 52;
    x.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},${200 + r() * 55},${0.3 + r() * 0.5})`;
    x.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// La red de pesca (cuadriculado, recortado con alphaTest).
function netTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(190,180,150,1)';
  x.lineWidth = 2;
  for (let k = 0; k <= 128; k += 12) {
    x.beginPath();
    x.moveTo(k + Math.sin(k) * 2, 0);
    x.lineTo(k - Math.sin(k) * 2, 128);
    x.stroke();
    x.beginPath();
    x.moveTo(0, k);
    x.quadraticCurveTo(64, k + 6, 128, k);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return coverageMips(t, 0.4);
}

// Calavera de vaca: el cráneo largo, las órbitas y los cuernos.
function skullGeo() {
  const parts = [];
  const head = new THREE.SphereGeometry(0.16, 8, 6);
  head.scale(1, 0.75, 1.5);
  parts.push(head);
  const snout = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 6);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, -0.02, 0.28);
  parts.push(snout);
  for (const s of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.035, 0.34, 5);
    horn.rotateZ(s * -1.2);
    horn.translate(s * 0.26, 0.08, -0.06);
    parts.push(horn);
  }
  return mergeGeometries(
    parts.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
      return n;
    }),
  );
}

export function buildGroundDecor(w) {
  const r = rng(7771);
  const out = keepOut();
  const keys = w.zoneKeys || Object.keys(ZONES);
  // las celdas de suelo seco de cada zona de afuera (A..H)
  const cells = {};
  for (let i = 0; i < w.grid.length; i++) {
    if (w.grid[i] !== FLOOR || !w.groundCell?.[i]) continue;
    const key = keys[w.zone[i]];
    if (!key || !ZONES[key]?.ground) continue;
    (cells[key[0]] ||= []).push(i);
  }
  const dry = (x, z) => (w.waterDepth?.(x, z) || 0) < 0.02;
  const spot = (Z, tries = 10) => {
    const L = cells[Z];
    if (!L?.length) return null;
    for (let t = 0; t < tries; t++) {
      const i = L[Math.floor(r() * L.length)];
      const cx = i % w.W;
      const cz = (i - cx) / w.W;
      const x = cx + r();
      const z = cz + r();
      if (out(x, z) || !dry(x, z)) continue;
      return [x, w.floorAt(x, z), z];
    }
    return null;
  };
  // (cerca de un punto: el fuego, las pilas de rollizos)
  const near = (Z, cx, cz, rad, tries = 12) => {
    for (let t = 0; t < tries; t++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const ci = w.idx?.(Math.floor(x), Math.floor(z));
      if (ci == null || w.grid[ci] !== FLOOR || out(x, z) || !dry(x, z)) continue;
      return [x, w.floorAt(x, z), z];
    }
    return null;
  };

  const group = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  // cada forma junta sus piezas y al final se arma una sola malla instanciada
  const kinds = {};
  const put = (kind, x, y, z, sx, sy, sz, rx, ry, rz, hex, jit = 0.12) => {
    const L = (kinds[kind] ||= []);
    // (primero se acuesta y después se gira: YXZ)
    e.set(rx, ry, rz, 'YXZ');
    q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    col.setHex(hex);
    const k = 1 - jit / 2 + r() * jit;
    L.push(m4.clone(), col.clone().multiplyScalar(k));
  };
  const flatK = (kind, p, size, hex, y = 0.012) => put(kind, p[0], p[1] + y, p[2], size * (0.8 + r() * 0.5), 1, size * (0.8 + r() * 0.5), 0, r() * 6.3, 0, hex, 0.2);

  const P = PLAN;
  const fire = FIRES?.[0]?.pos || [38.5, 0, 40.5];
  // A: ceniza alrededor del fuego y tierra pisada
  for (let k = 0; k < P.A.ash; k++) {
    const p = near('A', fire[0], fire[2], 2.6);
    if (p) flatK('flat', p, 0.4 + r() * 0.45, k < 5 ? 0x141312 : 0x2a2724);
  }
  for (let k = 0; k < P.A.mud; k++) {
    const p = spot('A');
    if (p) flatK('flat', p, 0.5 + r() * 0.7, 0x221a10);
  }
  // B: aserrín colorado, astillas y rollizos
  for (let k = 0; k < P.B.saw; k++) {
    const p = spot('B');
    if (p) flatK('flat', p, 0.35 + r() * 0.6, r() < 0.7 ? 0x6a3420 : 0x7a4c32);
  }
  for (let k = 0; k < P.B.chip; k++) {
    const p = spot('B');
    if (p) put('chip', p[0], p[1] + 0.012, p[2], 0.08 + r() * 0.1, 0.018, 0.03 + r() * 0.03, (r() - 0.5) * 0.3, r() * 6.3, (r() - 0.5) * 0.3, r() < 0.6 ? 0x7a3e24 : 0x4a3222);
  }
  // pilas de rollizos de quebracho (tres pilas, cada una de a seis)
  for (let pile = 0; pile < 3; pile++) {
    const c = spot('B', 20);
    if (!c) continue;
    const yaw = r() * Math.PI;
    for (let k = 0; k < P.B.log / 3; k++) {
      const row = k < 3 ? 0 : k < 5 ? 1 : 2;
      const inRow = k < 3 ? k : k < 5 ? k - 3 : 0;
      const off = (inRow - (row === 0 ? 1 : row === 1 ? 0.5 : 0)) * 0.34;
      const x = c[0] + Math.cos(yaw) * off;
      const z = c[2] - Math.sin(yaw) * off;
      put('log', x, c[1] + 0.16 + row * 0.29, z, 0.16, 1.4 + r() * 0.5, 0.16, Math.PI / 2, yaw, 0, 0x6a3a26);
    }
  }
  for (let k = 0; k < P.B.stone; k++) {
    const p = spot('B');
    if (p) put('stone', p[0], p[1] + 0.03, p[2], 0.12, 0.08, 0.1, r(), r() * 6, r(), 0x4a4238);
  }
  // C: barro mojado, conchas, piedras de río, redes y canastos
  for (let k = 0; k < P.C.puddle; k++) {
    const p = spot('C');
    if (p) flatK('puddle', p, 0.5 + r() * 0.8, 0x1a1a12, 0.01);
  }
  const shell = (Z, n) => {
    for (let k = 0; k < n; k++) {
      const p = spot(Z);
      if (p) put('shell', p[0], p[1] + 0.02, p[2], 1, 1, 1, Math.PI / 2 + (r() - 0.5), r() * 6.3, 0, r() < 0.8 ? 0xe8dcc0 : 0x8a6a4a);
    }
  };
  shell('C', P.C.shell);
  for (let k = 0; k < P.C.stone; k++) {
    const p = spot('C');
    if (p) put('stone', p[0], p[1] + 0.03, p[2], 0.1 + r() * 0.1, 0.06, 0.1 + r() * 0.06, r(), r() * 6, r(), 0x5a5e58);
  }
  for (let k = 0; k < P.C.net; k++) {
    const p = spot('C', 20);
    if (!p) continue;
    const yaw = r() * Math.PI;
    const dx = Math.cos(yaw) * 0.9;
    const dz = -Math.sin(yaw) * 0.9;
    for (const sg of [-1, 1]) put('pole', p[0] + dx * sg, p[1] + 0.8, p[2] + dz * sg, 0.035, 1.6, 0.035, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08, 0x3a2a1c, 0.1);
    put('net', p[0], p[1] + 0.95, p[2], 1.8, 1.1, 1, 0, yaw, (r() - 0.5) * 0.06, 0xb8ae90, 0.1);
  }
  for (let k = 0; k < P.C.basket; k++) {
    const p = spot('C');
    if (p) put('basket', p[0], p[1] + 0.12, p[2], 1, 1, 1, (r() - 0.5) * 0.2, r() * 6.3, 0, 0x8a7448);
  }
  // D: conchas y piedritas en la orilla, charcos
  shell('D', P.D.shell);
  for (let k = 0; k < P.D.stone; k++) {
    const p = spot('D');
    if (p) put('stone', p[0], p[1] + 0.02, p[2], 0.06 + r() * 0.06, 0.04, 0.06 + r() * 0.05, r(), r() * 6, r(), 0x6a6a62);
  }
  for (let k = 0; k < P.D.puddle; k++) {
    const p = spot('D');
    if (p) flatK('puddle', p, 0.4 + r() * 0.6, 0x16181a, 0.01);
  }
  // E: cascotes de piedra roja, verdín y velitas
  for (let k = 0; k < P.E.rubble; k++) {
    const p = spot('E');
    if (!p) continue;
    const big = r() < 0.12;
    const sz = big ? 0.16 + r() * 0.14 : 0.05 + r() * 0.08;
    put(big ? 'boulder' : 'stone', p[0], p[1] + sz * 0.35, p[2], sz, sz * (0.6 + r() * 0.4), sz * (0.8 + r() * 0.4), r() * 3, r() * 6, r() * 3, r() < 0.8 ? 0x7a3e2c : 0x5e3a2e);
  }
  const moss = (Z, n) => {
    for (let k = 0; k < n; k++) {
      const p = spot(Z);
      if (p) flatK('flat', p, 0.3 + r() * 0.6, r() < 0.5 ? 0x243a18 : 0x2e421c);
    }
  };
  moss('E', P.E.moss);
  for (let k = 0; k < P.E.candle; k++) {
    const p = spot('E');
    if (!p) continue;
    const h = 0.08 + r() * 0.1;
    put('candle', p[0], p[1] + h / 2, p[2], 0.025, h, 0.025, 0, 0, 0, 0xe8dcc0, 0.05);
    put('flame', p[0], p[1] + h + 0.025, p[2], 1, 1, 1, 0, r() * 6, 0, 0xffa040, 0.2);
  }
  // F: raíces que asoman del embalsado y verdín
  for (let k = 0; k < P.F.root; k++) {
    const p = spot('F');
    if (p) put('root', p[0], p[1] - 0.04, p[2], 0.25 + r() * 0.35, 0.25 + r() * 0.3, 0.3, 0, r() * 6.3, (r() - 0.5) * 0.4, r() < 0.5 ? 0x3a2a1a : 0x2a2a1a);
  }
  moss('F', P.F.moss);
  // G: hojarasca, chauchas, huesos y calaveras de vaca
  for (let k = 0; k < P.G.leaf; k++) {
    const p = spot('G');
    if (p) flatK('flat', p, 0.4 + r() * 0.6, r() < 0.5 ? 0x3a2e1c : 0x4e3e24);
  }
  for (let k = 0; k < P.G.pod; k++) {
    const p = spot('G');
    if (p) put('chip', p[0], p[1] + 0.01, p[2], 0.16 + r() * 0.06, 0.012, 0.022, (r() - 0.5) * 0.2, r() * 6.3, (r() - 0.5) * 0.2, r() < 0.7 ? 0xb89a4a : 0x7a5a2a);
  }
  for (let k = 0; k < P.G.bone; k++) {
    const p = spot('G');
    if (p) put('bone', p[0], p[1] + 0.025, p[2], 1, 0.6 + r() * 0.8, 1, Math.PI / 2, r() * 6.3, 0, 0xd8ccb0);
  }
  for (let k = 0; k < P.G.skull; k++) {
    const p = spot('G', 20);
    if (p) put('skull', p[0], p[1] + 0.08, p[2], 1, 1, 1, -0.2 + r() * 0.3, r() * 6.3, (r() - 0.5) * 0.4, 0xe0d4b8, 0.08);
  }
  // H: pedregullo y tejas rotas
  for (let k = 0; k < P.H.gravel; k++) {
    const p = spot('H');
    if (p) put('stone', p[0], p[1] + 0.012, p[2], 0.035 + r() * 0.03, 0.02, 0.035 + r() * 0.03, r(), r() * 6, r(), r() < 0.5 ? 0x8a8a84 : 0x6a6a66);
  }
  for (let k = 0; k < P.H.tile; k++) {
    const p = spot('H');
    if (p) put('tile', p[0], p[1] + 0.02, p[2], 0.8 + r() * 0.5, 1, 0.6 + r() * 0.5, (r() - 0.5) * 0.4, r() * 6.3, (r() - 0.5) * 0.4, r() < 0.7 ? 0x7e4228 : 0x6a3622);
  }

  // las formas y sus materiales
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const blotch = blotchTex();
  const decal = { map: blotch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const ground = std({ ...decal });
  const wet = std({ ...decal, roughness: 0.12, metalness: 0.1 });
  const solid = std({});
  const tileGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6, 1, true, 0, Math.PI);
  tileGeo.rotateZ(Math.PI / 2);
  const boneGeo = new THREE.CapsuleGeometry(0.018, 0.22, 2, 5);
  const basketGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.24, 9, 1, true);
  const shapes = {
    flat: [flatGeo(3), ground, false],
    puddle: [flatGeo(5), wet, false],
    chip: [new THREE.BoxGeometry(1, 1, 1), solid, false],
    stone: [new THREE.IcosahedronGeometry(1, 0), solid, false],
    boulder: [new THREE.IcosahedronGeometry(1, 0), solid, true],
    log: [new THREE.CylinderGeometry(1, 1, 1, 8), solid, true],
    shell: [new THREE.ConeGeometry(0.028, 0.06, 6), std({ roughness: 0.5 }), false],
    pole: [new THREE.CylinderGeometry(1, 1, 1, 5), solid, true],
    net: [new THREE.PlaneGeometry(1, 1), std({ map: netTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), false],
    basket: [basketGeo, std({ side: THREE.DoubleSide }), true],
    candle: [new THREE.CylinderGeometry(1, 1, 1, 6), std({ roughness: 0.6 }), false],
    flame: [new THREE.ConeGeometry(0.012, 0.045, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.6), toneMapped: false }), false],
    root: [new THREE.TorusGeometry(1, 0.06, 4, 8, Math.PI), solid, false],
    bone: [boneGeo, std({ roughness: 0.7 }), false],
    skull: [skullGeo(), std({ roughness: 0.7 }), true],
    tile: [tileGeo, std({ side: THREE.DoubleSide, roughness: 0.8 }), false],
  };
  for (const [kind, L] of Object.entries(kinds)) {
    const n = L.length / 2;
    if (!n || !shapes[kind]) continue;
    const [geo, mat, shadow] = shapes[kind];
    const im = new THREE.InstancedMesh(geo, mat, n);
    for (let k = 0; k < n; k++) {
      im.setMatrixAt(k, L[k * 2]);
      im.setColorAt(k, L[k * 2 + 1]);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = shadow;
    im.receiveShadow = kind !== 'flame';
    // (pegado al suelo: en el espejo del agua no se vería)
    im.userData.reflect = false;
    im.name = 'groundDecor:' + kind;
    group.add(im);
  }
  group.name = 'groundDecor';
  w.root.add(group);
  w.groundDecor = group;
  return group;
}
