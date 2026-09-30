import * as THREE from 'three';
import { buildProp, mesh, boxGeo, cylGeo, rotateBox } from './props';
import { rng } from '../core/noise';

// Los campamentos abandonados del matorral de La Tapera (EE.matorral.camps,
// entities/Matorral.js): troperos con sus carpas, un toldo, una carreta
// criolla, una enramada, los hacheros, una tapera caída y el de la Yerba
// Madre (el primero: ronda de piedras, velas y la animita; la planta la pone
// FarmEgg en el centro). Cada uno tiene su fogón (el fuego y el humo los pone
// Matorral; la luz, LIGHTS). Todo va a la utilería estática del mundo
// (world.addStatic: se junta por material, casi sin llamadas de dibujo) con
// sus cajas de colisión, antes de que se calcule por dónde caminan los muertos.
//
// Devuelve las cajas (el maíz no crece adentro), dónde está cada fuego y los
// lugares del borde de cada claro donde se esconde el Yasy dorado.

// Las piezas se arman en el origen del campamento mirando a +z y se giran con él.
const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 8) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
// Un palo de a hasta b.
const UPV = new THREE.Vector3(0, 1, 0);
function pole(g, mat, a, b, r = 0.04, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(cylGeo(r, r, 1, seg), mat);
  m.scale.y = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UPV, d.normalize());
  g.add(m);
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

let triGeo = null;
function tri() {
  if (!triGeo) {
    const s = new THREE.Shape();
    s.moveTo(-1, 0);
    s.lineTo(1, 0);
    s.lineTo(0, 1);
    s.closePath();
    triGeo = new THREE.ShapeGeometry(s);
  }
  return triGeo;
}

// La lona de las carpas y el toldo (arpillera clara, gastada).
function lona(M) {
  if (!M.lona) M.lona = new THREE.MeshStandardMaterial({ map: M.sack.map, color: 0xd2bf94, roughness: 0.97, side: THREE.DoubleSide });
  return M.lona;
}

// ---------------- las piezas ----------------
// Carpa de lona a dos aguas, abierta adelante (+z), con el cumbrero, los
// parantes, los vientos y un poncho tirado adentro.
function carpa(g, M, r) {
  const L = 2.5;
  const W = 2.3;
  const H = 1.6;
  const sl = Math.hypot(W / 2, H);
  const a = Math.atan2(H, W / 2);
  const cloth = lona(M);
  B(g, sl, 0.03, L, cloth, -W / 4, H / 2, 0, 0, 0, a);
  B(g, sl, 0.03, L, cloth, W / 4, H / 2, 0, 0, 0, -a);
  const back = mesh(tri(), cloth, 0, 0, -L / 2);
  back.scale.set(W / 2, H, 1);
  g.add(back);
  // la mitad de la puerta, cerrada; la otra, recogida
  const flap = mesh(tri(), cloth, -W / 4, 0, L / 2);
  flap.scale.set(W / 4, H / 2, 1);
  g.add(flap);
  C(g, 0.1, 0.1, 0.5, cloth, W / 4 + 0.05, H * 0.45, L / 2 + 0.02, 0, 0, -a, 7);
  pole(g, M.log, V(0, H + 0.02, -L / 2 - 0.12), V(0, H + 0.02, L / 2 + 0.12), 0.035);
  for (const z of [-L / 2 - 0.08, L / 2 + 0.08]) {
    pole(g, M.log, V(0, 0, z), V(0, H + 0.1, z), 0.035);
    const s = Math.sign(z);
    pole(g, M.rope, V(0, H + 0.05, z), V(0, 0.05, z + s * 1.1), 0.008, 4);
    B(g, 0.05, 0.25, 0.05, M.woodDark, 0, 0.08, z + s * 1.12, s * 0.4);
  }
  for (const s of [-1, 1]) for (const z of [-L / 2 + 0.2, L / 2 - 0.2]) B(g, 0.04, 0.2, 0.04, M.woodDark, s * (W / 2 + 0.05), 0.06, z);
  B(g, 0.8, 0.05, 1.7, M.redCloth, (r() - 0.5) * 0.3, 0.03, -0.1, 0, (r() - 0.5) * 0.3, 0);
  return [[-W / 2 - 0.05, 0, -L / 2 - 0.1, W / 2 + 0.05, H, L / 2 + 0.1]];
}

// Toldo: cuatro palos y una lona tensada, con el faldón de adelante.
function toldo(g, M) {
  const cloth = lona(M);
  const posts = [[-1.7, 1.35, 2.2], [1.7, 1.35, 2.2], [-1.7, -1.35, 1.8], [1.7, -1.35, 1.8]];
  const boxes = [];
  for (const [x, z, h] of posts) {
    pole(g, M.log, V(x, 0, z), V(x, h, z), 0.05);
    boxes.push([x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1]);
  }
  B(g, 3.7, 0.03, 3.0, cloth, 0, 2.02, 0, -Math.atan2(0.4, 2.7), 0, 0);
  B(g, 3.7, 0.4, 0.03, cloth, 0, 2.0, 1.5);
  for (const s of [-1, 1]) pole(g, M.rope, V(s * 1.7, 2.2, 1.35), V(s * 2.5, 0.05, 2.4), 0.008, 4);
  return boxes;
}

// Enramada: horcones, vigas y un techo de ramas y paja.
function ramada(g, M, r) {
  const boxes = [];
  for (const x of [-2.1, 0, 2.1]) {
    for (const z of [-1.5, 1.5]) {
      pole(g, M.bark, V(x, 0, z), V(x + (r() - 0.5) * 0.1, 2.45, z), 0.08, 7);
      boxes.push([x - 0.12, 0, z - 0.12, x + 0.12, 2.4, z + 0.12]);
    }
  }
  for (const z of [-1.5, 1.5]) pole(g, M.bark, V(-2.4, 2.45, z), V(2.4, 2.45, z), 0.07, 7);
  for (let x = -2.2; x <= 2.2; x += 0.55) pole(g, M.log, V(x, 2.52, -1.8), V(x + (r() - 0.5) * 0.2, 2.52, 1.8), 0.035, 5);
  for (let i = 0; i < 9; i++) B(g, 5.2, 0.14, 0.5, i % 3 ? M.yerbaBranch : M.straw, (r() - 0.5) * 0.3, 2.62 + r() * 0.08, -1.9 + i * 0.47, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12, 0);
  return boxes;
}

// Carreta criolla: dos ruedas enormes, la caja con techo de cuero y el pértigo en el suelo.
function carreta(g, M) {
  for (const x of [-1.2, 1.2]) {
    const w = mesh(new THREE.TorusGeometry(1.05, 0.07, 6, 22), M.woodDark, x, 1.08, 0.2, 0, Math.PI / 2, 0);
    g.add(w);
    for (let s = 0; s < 6; s++) B(g, 0.06, 2.05, 0.06, M.woodDark, x, 1.08, 0.2, s * (Math.PI / 6), 0, 0);
    C(g, 0.16, 0.16, 0.3, M.woodDark, x, 1.08, 0.2, 0, 0, Math.PI / 2, 10);
  }
  C(g, 0.06, 0.06, 2.7, M.log, 0, 1.08, 0.2, 0, 0, Math.PI / 2, 6);
  B(g, 2.0, 0.1, 3.4, M.wood, 0, 1.25, 0.2);
  for (const x of [-1.0, 1.0]) B(g, 0.06, 0.55, 3.4, M.wood, x, 1.55, 0.2);
  B(g, 2.0, 0.55, 0.06, M.wood, 0, 1.55, -1.5);
  g.add(mesh(new THREE.CylinderGeometry(1.02, 1.02, 3.0, 12, 1, true, Math.PI / 2, Math.PI), M.leather, 0, 1.8, 0.1, Math.PI / 2, 0, 0));
  for (const z of [-1.3, 0.1, 1.5]) g.add(mesh(new THREE.TorusGeometry(1.03, 0.025, 4, 12, Math.PI), M.log, 0, 1.8, z));
  pole(g, M.log, V(0, 1.2, 1.9), V(0, 0.08, 5.2), 0.07);
  B(g, 1.9, 0.12, 0.14, M.log, 0, 0.1, 5.1, 0, 0.1, 0);
  for (let i = 0; i < 3; i++) B(g, 0.55, 0.35, 0.4, M.sackYerba, -0.5 + i * 0.5, 1.48, 1.2 - i * 0.3, 0, i * 0.4, 0);
  return [[-1.35, 0, -1.6, 1.35, 2.9, 2.0], [-0.2, 0, 2.0, 0.2, 0.8, 5.2]];
}

// Tapera: lo que queda de un rancho de adobe (dos paredes rotas y una viga caída).
function tapera(g, M, r) {
  const boxes = [];
  const wall = (x0, z0, x1, z1, hs) => {
    const n = hs.length;
    for (let i = 0; i < n; i++) {
      if (!hs[i]) continue;
      const a = i / n;
      const b = (i + 1) / n;
      const x = x0 + (x1 - x0) * (a + b) / 2;
      const z = z0 + (z1 - z0) * (a + b) / 2;
      const along = Math.hypot(x1 - x0, z1 - z0) / n;
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const w = alongX ? along + 0.02 : 0.36;
      const d = alongX ? 0.36 : along + 0.02;
      B(g, w, hs[i], d, M.adobe, x, hs[i] / 2, z, 0, 0, (r() - 0.5) * 0.03);
      boxes.push([x - w / 2, 0, z - d / 2, x + w / 2, hs[i], z + d / 2]);
    }
  };
  wall(-2.4, -2.6, 2.6, -2.6, [2.3, 2.5, 2.1, 0, 0, 1.4, 1.9, 1.1]);
  wall(-2.6, -2.6, -2.6, 1.2, [2.4, 1.8, 1.2, 0.7, 0.4]);
  // la viga del techo, caída
  pole(g, M.beam || M.log, V(-2.4, 2.3, -2.3), V(-1.0, 0.1, -0.2), 0.09);
  pole(g, M.beam || M.log, V(1.9, 1.8, -2.4), V(2.8, 0.1, -0.9), 0.07);
  // cascotes
  for (let i = 0; i < 8; i++) B(g, 0.3 + r() * 0.3, 0.12 + r() * 0.12, 0.25 + r() * 0.3, M.adobe, -1.8 + r() * 4, 0.08, -2.2 + r() * 0.8, r(), r() * 3, r() * 0.3);
  return boxes;
}

// Tocón con el hacha clavada.
function tocon(g, M) {
  C(g, 0.34, 0.4, 0.5, M.bark, 0, 0.25, 0, 0, 0, 0, 10);
  C(g, 0.33, 0.33, 0.02, M.log, 0, 0.51, 0, 0, 0, 0, 10);
  pole(g, M.log, V(0.05, 0.5, 0), V(0.6, 1.05, 0.1), 0.025);
  B(g, 0.2, 0.14, 0.03, M.iron, 0.02, 0.56, 0, 0, 0, -0.8);
  return [[-0.4, 0, -0.4, 0.4, 0.55, 0.4]];
}

// Tronco caído.
function tronco(g, M, r) {
  C(g, 0.3, 0.36, 3.2, M.bark, 0, 0.32, 0, 0, 0, Math.PI / 2, 9);
  for (let i = 0; i < 2; i++) C(g, 0.06, 0.09, 0.8, M.bark, -0.6 + i * 1.3, 0.62, 0.15, 0.6 + r() * 0.4, 0, 0.3, 6);
  return [[-1.6, 0, -0.36, 1.6, 0.66, 0.36]];
}

// El trípode con la olla, arriba del fuego.
function olla(g, M) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    pole(g, M.log, V(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95), V(0, 1.45, 0), 0.03);
  }
  pole(g, M.iron, V(0, 1.45, 0), V(0, 0.82, 0), 0.008, 4);
  C(g, 0.22, 0.18, 0.28, M.iron, 0, 0.66, 0, 0, 0, 0, 12);
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 12, Math.PI), M.iron, 0, 0.82, 0));
  return [];
}

// Pava y mate al lado del fuego.
function pava(g, M) {
  C(g, 0.1, 0.12, 0.16, M.metal, 0, 0.08, 0, 0, 0, 0, 10);
  C(g, 0.02, 0.02, 0.16, M.metal, 0.12, 0.13, 0, 0, 0, -0.9, 5);
  g.add(mesh(new THREE.TorusGeometry(0.07, 0.01, 4, 10, Math.PI), M.iron, 0, 0.18, 0));
  C(g, 0.045, 0.035, 0.09, M.gourd || M.leather, 0.3, 0.045, 0.1, 0, 0, 0, 10);
  return [];
}

// Poncho o recado tirado en el suelo.
function poncho(g, M, r) {
  B(g, 0.9, 0.04, 1.7, M.redCloth, 0, 0.02, 0, 0, (r() - 0.5) * 0.4, 0);
  C(g, 0.12, 0.12, 0.8, M.sack, 0, 0.12, -0.9, 0, 0, Math.PI / 2, 8);
  return [];
}

// Ronda de piedras.
function piedras(g, M, r, R = 1.5, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const s = mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 0), M.stone, Math.cos(a) * R, 0.1, Math.sin(a) * R, r(), r(), r());
    s.scale.set(1.2, 0.7, 1);
    g.add(s);
  }
  return [];
}

// Velas en el suelo (prendidas: la llama es un cono que brilla).
function velas(g, M, r, R = 2.3, n = 7) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const h = 0.14 + r() * 0.16;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    C(g, 0.03, 0.035, h, M.candle, x, h / 2, z, 0, 0, 0, 8);
    g.add(mesh(new THREE.ConeGeometry(0.022, 0.07, 6), M.flame, x, h + 0.04, z));
  }
  return [];
}

// La animita: un poste con la casita, la cruz, velas y flores de plástico.
function animita(g, M) {
  pole(g, M.log, V(0, 0, 0), V(0, 1.0, 0), 0.05);
  B(g, 0.6, 0.5, 0.45, M.adobe || M.stone, 0, 1.25, 0);
  B(g, 0.44, 0.34, 0.02, M.black, 0, 1.22, 0.23);
  for (const s of [-1, 1]) B(g, 0.4, 0.03, 0.55, M.redPaint, s * 0.17, 1.62, 0, 0, 0, s * -0.6);
  B(g, 0.03, 0.26, 0.03, M.woodDark, 0, 1.86, 0);
  B(g, 0.16, 0.03, 0.03, M.woodDark, 0, 1.9, 0);
  for (const [x, h] of [[-0.14, 0.12], [0.02, 0.09], [0.15, 0.14]]) {
    C(g, 0.02, 0.02, h, M.candle, x, 1.0 + h / 2, 0.14, 0, 0, 0, 6);
    g.add(mesh(new THREE.ConeGeometry(0.016, 0.05, 6), M.flame, x, 1.0 + h + 0.03, 0.14));
  }
  for (let i = 0; i < 6; i++) B(g, 0.06, 0.06, 0.06, i % 2 ? M.packRed : M.packYellow, -0.2 + i * 0.08, 0.03, 0.4 + (i % 3) * 0.05);
  return [[-0.32, 0, -0.26, 0.32, 1.9, 0.26]];
}

const PIECES = { carpa, toldo, ramada, carreta, tapera, tocon, tronco, olla, pava, poncho, piedras, velas, animita };

// Qué hay en cada campamento: [pieza, x, z, giro] (del centro, mirando a +z).
// Las de props.js (fogon, logseat, barrel...) van con buildProp.
const LAYOUT = {
  madre: [['piedras', 0, 0, 0, 1.9], ['velas', 0, 0, 0, 2.7], ['animita', 0, -3.6, 0], ['carpa', -3.9, 1.6, 2.2], ['poncho', 3.4, 2.8, 0.8], ['logseat', 2.6, -3.2, 0.5], ['sacks', -3.6, -2.8, 0.7]],
  fogon: [['olla', 0, 0], ['pava', 0.9, 0.6], ['logseat', 0, 1.7, 0], ['logseat', -1.6, -0.6, 1.3], ['logseat', 1.3, -1.3, -0.9], ['firewood', 2.6, 1.0, 0.4], ['chest', -2.4, 1.7, -0.5], ['saddle', -2.2, -2.3, 0.6]],
  carpas: [['olla', 0, 0], ['carpa', -3.1, -2.2, 0.55], ['carpa', 3.0, -2.6, -0.5], ['logseat', 0, 1.9, 0], ['logseat', -1.9, 0.9, 1.1], ['poncho', 2.2, 2.3, 0.5], ['pava', -0.9, 0.7], ['sacks', 4.0, 1.2, 1.3], ['barrel', -4.2, 1.4], ['saddle', 1.6, 3.4, 2.4]],
  toldo: [['toldo', -2.4, -1.2, 0], ['table', -2.4, -1.2, 0.1], ['crates', -3.9, 2.2, 0.4], ['barrel', 1.2, -3.2], ['barrel', 1.9, -3.4], ['logseat', 2.2, 1.8, 0.5], ['pava', 1.2, 0.9], ['milkcans', -4.6, 1.2, 0.3]],
  carreta: [['carreta', -1.8, -1.8, -1.1], ['hay', 2.6, -2.6, 0.9], ['logseat', 1.8, 1.6, -0.6], ['logseat', -0.6, 2.1, 0.2], ['barrel', 3.4, 0.8], ['olla', 0, 0], ['poncho', 3.0, 2.8, 1.9]],
  ramada: [['ramada', 0, -2.4, 0], ['washtub', -1.4, -2.2], ['saddle', 1.3, -2.6, 0.2], ['sacks', 0, -3.4, 0], ['logseat', -1.8, 1.5, 0.9], ['logseat', 1.8, 1.5, -0.9], ['pava', 0.8, 0.7], ['barrow', 3.6, 1.8, 2.1]],
  hacheros: [['firewood', -2.9, -1.4, 0.4], ['firewood', -3.0, 0.9, -0.3], ['tocon', 2.2, -1.9], ['tocon', 2.6, 1.6], ['tronco', 0.4, -3.4, 0.2], ['carpa', -0.6, 3.0, Math.PI], ['logseat', -1.8, 0.2, 1.4], ['olla', 0, 0]],
  tapera: [['tapera', 0, 0, 0], ['logseat', 1.4, 1.2, -0.4], ['chair', -1.5, 0.4, 2.4], ['cross', -2.35, -2.2, Math.PI / 2], ['pava', 0.7, -0.4], ['crates', 3.4, 2.6, 0.8]],
};

export function buildCamps(world, camps) {
  const M = world.M;
  const out = { boxes: [], fires: [], hides: [] };
  camps.forEach((c, ci) => {
    const [cx, cz] = c.at;
    const rot = c.rot || 0;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const r = rng(9100 + ci * 31);
    const at = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
    const fire = c.fire || c.at;
    const boxes = [];
    // el fogón (en su lugar: en el de la Yerba Madre, a un costado)
    const fo = buildProp({ type: 'fogon', pos: fire, rot }, M, 9200 + ci);
    world.addStatic(fo.obj);
    boxes.push(...fo.boxes);
    out.fires.push(new THREE.Vector3(fire[0], 0.3, fire[1]));
    for (const [kind, lx, lz, lrot = 0, arg] of LAYOUT[c.kind] || []) {
      // (lo que va "arriba del fuego" en el de la Madre: al lado de su fogón)
      let [x, z] = at(lx, lz);
      if (c.fire && (kind === 'olla' || kind === 'pava')) [x, z] = [fire[0] + lx, fire[1] + lz];
      const ry = rot + lrot;
      const make = PIECES[kind];
      if (make) {
        const g = new THREE.Group();
        const bx = (arg != null ? make(g, M, r, arg) : make(g, M, r)) || [];
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        world.addStatic(g);
        for (const b of bx) boxes.push(rotateBox(b, x, z, ry));
      } else {
        const res = buildProp({ type: kind, pos: [x, z], rot: ry }, M, 9300 + ci * 13 + boxes.length);
        if (!res) continue;
        world.addStatic(res.obj);
        boxes.push(...res.boxes);
      }
    }
    for (const b of boxes) world.addBox(b, { kind: 'prop' });
    out.boxes.push(...boxes);
    // donde se esconde el dorado: el borde del claro, lejos de las cosas
    const hides = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r() * 0.3;
      const x = cx + Math.cos(a) * (c.r - 0.9);
      const z = cz + Math.sin(a) * (c.r - 0.9);
      if (boxes.some((b) => x > b[0] - 0.6 && x < b[3] + 0.6 && z > b[2] - 0.6 && z < b[5] + 0.6)) continue;
      hides.push([x, z]);
    }
    out.hides.push(hides.length ? hides : [[cx + c.r - 1, cz]]);
  });
  return out;
}
