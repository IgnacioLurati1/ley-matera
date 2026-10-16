import * as THREE from 'three';

// Dónde queda la marca de un tiro que frenó la utilería (2026-10-12; el
// usuario: las vallas de Mate no Numa "quedan tiros entre los huecos", y otras
// cosas igual). La caja de choque de la utilería (vallas, marcos, árboles, el
// pajonal, las máquinas) es un ladrillo que la envuelve: medido, entre un 30 y
// un 70 % de los tiros que frenaba caían en un hueco o al lado del tronco. La
// caja sigue frenando el tiro igual (eso no cambia); la marca va donde está lo
// dibujado: el mismo rayo contra las mallas que tocan esa caja (lista armada una
// vez por caja). Si pasa por un hueco, ni marca ni polvo; en lo fino (alambre,
// palitos) el polvo sin la marca.

// lo que es pared de verdad: la marca va en la caja, como siempre
const SOLID = new Set(['wall', 'slab', 'floor', 'ceiling', 'door', 'window', 'ground', 'box']);
// mallas más grandes que esto no se miran (ni las instanciadas de a miles: pasto, maíz, cañas)
const MAX_TRIS = 20000;
const MAX_INST = 2000;
// menos grosor que esto: el polvo sin la marca
const THIN = 0.12;
const PAD = 0.25;

const m4 = new THREE.Matrix4();
const bx = new THREE.Box3();
const size = new THREE.Vector3();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const inv = new THREE.Matrix4();
const lb = new THREE.Box3();
const out = { k: 0, point: new THREE.Vector3(), normal: new THREE.Vector3() };
let all = null;
let perBox = new WeakMap();
let worldOf = null;

const tris = (geo) => (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3;
function skip(o) {
  if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return true;
  // (lo que se mueve no: los muertos van en tandas de malla común)
  if (/zombie/i.test(o.name) || o.userData?.noMarca) return true;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m || m.colorWrite === false || m.visible === false) return true;
  // (recorte, transparencia: el rayo pega en la cara aunque ahí se vea el hueco;
  // se sigue de largo hasta lo macizo)
  if (m.alphaTest > 0 || m.alphaMap || m.transparent) return true;
  if (o.isInstancedMesh && o.count > MAX_INST) return true;
  return tris(o.geometry) > MAX_TRIS;
}

// Todas las mallas quietas del mundo con su caja (una por instancia), una vez
// por mapa (prepare): lo que se agrega después no deja marca (para ese lado se
// equivoca).
function addMesh(o, list) {
  if (skip(o)) return;
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const n = o.isInstancedMesh ? o.count : 1;
  for (let i = 0; i < n; i++) {
    if (o.isInstancedMesh) {
      o.getMatrixAt(i, m4);
      m4.premultiply(o.matrixWorld);
    } else m4.copy(o.matrixWorld);
    const b = o.geometry.boundingBox.clone().applyMatrix4(m4);
    const s = b.getSize(size);
    list.push({ o, i: o.isInstancedMesh ? i : -1, b, thin: Math.min(s.x, s.y, s.z) < THIN, sd: 0 });
  }
}

// Los triángulos (en el mundo) que caen adentro de una caja, una vez por caja:
// cada tiro mira esos pocos y no las mallas enteras (unas fusionadas tienen
// miles; con el Raycaster de three eran ~2 ms por tiro).
function soup(box) {
  let s = perBox.get(box);
  if (s) return s;
  bx.min.set(box.x0 - PAD, box.y0 - PAD, box.z0 - PAD);
  bx.max.set(box.x1 + PAD, box.y1 + PAD, box.z1 + PAD);
  const v = [];
  const ent = [];
  const es = [];
  for (const e of all) {
    if (!e.b.intersectsBox(bx)) continue;
    const k = es.push(e) - 1;
    const geo = e.o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    if (e.i < 0) m4.copy(e.o.matrixWorld);
    else {
      e.o.getMatrixAt(e.i, m4);
      m4.premultiply(e.o.matrixWorld);
    }
    // de qué lado se ve (una cara de un lado, de atrás, no se dibuja: ahí no va
    // marca); un espejado da vuelta el orden de los vértices
    const mat = Array.isArray(e.o.material) ? e.o.material[0] : e.o.material;
    const flip = m4.determinant() < 0;
    e.sd = mat.side === THREE.DoubleSide ? 0 : (mat.side === THREE.BackSide) !== flip ? -1 : 1;
    // (la caja llevada a la malla: se descartan los triángulos sin moverlos al mundo)
    lb.copy(bx).applyMatrix4(inv.copy(m4).invert());
    const n = idx ? idx.count : pos.count;
    for (let j = 0; j + 2 < n; j += 3) {
      const a = idx ? idx.getX(j) : j;
      const b = idx ? idx.getX(j + 1) : j + 1;
      const c = idx ? idx.getX(j + 2) : j + 2;
      const ax = pos.getX(a), bxx = pos.getX(b), cx = pos.getX(c);
      if ((ax < lb.min.x && bxx < lb.min.x && cx < lb.min.x) || (ax > lb.max.x && bxx > lb.max.x && cx > lb.max.x)) continue;
      const ay = pos.getY(a), by = pos.getY(b), cy = pos.getY(c);
      if ((ay < lb.min.y && by < lb.min.y && cy < lb.min.y) || (ay > lb.max.y && by > lb.max.y && cy > lb.max.y)) continue;
      const az = pos.getZ(a), bz = pos.getZ(b), cz = pos.getZ(c);
      if ((az < lb.min.z && bz < lb.min.z && cz < lb.min.z) || (az > lb.max.z && bz > lb.max.z && cz > lb.max.z)) continue;
      va.set(ax, ay, az).applyMatrix4(m4);
      vb.set(bxx, by, bz).applyMatrix4(m4);
      vc.set(cx, cy, cz).applyMatrix4(m4);
      if (Math.max(va.x, vb.x, vc.x) < bx.min.x || Math.min(va.x, vb.x, vc.x) > bx.max.x) continue;
      if (Math.max(va.y, vb.y, vc.y) < bx.min.y || Math.min(va.y, vb.y, vc.y) > bx.max.y) continue;
      if (Math.max(va.z, vb.z, vc.z) < bx.min.z || Math.min(va.z, vb.z, vc.z) > bx.max.z) continue;
      v.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      ent.push(k);
    }
  }
  s = { v: new Float32Array(v), ent: Uint32Array.from(ent), es, vis: new Int8Array(es.length) };
  perBox.set(box, s);
  return s;
}

const shown = (o) => {
  if (!o.parent) return false;
  for (let q = o; q; q = q.parent) if (!q.visible) return false;
  return true;
};

// En los ratos libres, después del primer tiro de la partida: todas las mallas
// y las cajas de la utilería de a poco, así el primer tiro a cada cosa no arma
// nada (armar una caja lleva de 0,1 a ~16 ms).
let prep = null;
let pending = 0;
// (para las pruebas: si ya está todo armado)
export const marcasEstado = () => ({ lista: !!all && worldOf === prep, cajas: pending });
const idle = (f) => (globalThis.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(() => f({ timeRemaining: () => 4 }), 50));
function prepare(g) {
  const W = g.world;
  prep = W;
  const meshes = [];
  g.scene.updateMatrixWorld();
  g.scene.traverse((o) => meshes.push(o));
  const boxes = new Set();
  for (const list of W.cellBoxes || []) for (const b of list || []) if (b.shoot !== false && !SOLID.has(b.kind)) boxes.add(b);
  const queue = [...boxes];
  pending = queue.length;
  let at = 0;
  const fresh = [];
  const step = (dl) => {
    if (prep !== W || worldOf === W) return;
    while (at < meshes.length && dl.timeRemaining() > 2) {
      for (const end = Math.min(meshes.length, at + 200); at < end; at++) addMesh(meshes[at], fresh);
    }
    if (at < meshes.length) return idle(step);
    // (si mientras tanto un tiro armó la lista entera, vale esa)
    if (!all || worldOf !== W) {
      all = fresh;
      worldOf = W;
      perBox = new WeakMap();
    }
    idle(boxStep);
  };
  const boxStep = (dl) => {
    if (worldOf !== W) return;
    while (queue.length && dl.timeRemaining() > 3) soup(queue.pop());
    pending = queue.length;
    if (queue.length) idle(boxStep);
  };
  idle(step);
}

// o, d: el rayo del tiro; t: dónde lo frenó la caja (world.raycast); hit: lo
// que devolvió (box, point, normal). Devuelve null si no queda nada, o
// { k: 1 polvo / 2 polvo y marca, point, normal } (no toca hit: la explosión,
// el rebote y lo demás siguen saliendo de la caja, como antes).
export function marca(g, o, d, t, hit) {
  const box = hit.box;
  if (prep !== g.world && g.world) prepare(g);
  // (de qué era lo que frenó el tiro: el impacto según el material, fx/impactos.js)
  out.box = box;
  out.obj = null;
  if (!box || typeof box !== 'object' || SOLID.has(box.kind)) {
    out.k = 2;
    out.point.copy(hit.point);
    out.normal.copy(hit.normal);
    return out;
  }
  // (hasta que la lista esté armada en los ratos libres, sin marca en la utilería:
  // armarla de una son ~20-50 ms)
  if (!all || worldOf !== g.world) return null;
  const s = soup(box);
  const V = s.v;
  if (!V.length) return null;
  const t0 = Math.max(0, t - 0.3);
  const t1 = t + Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) + 0.1;
  s.vis.fill(0);
  const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
  let best = t1;
  let bi = -1;
  // Möller-Trumbore, de los dos lados
  for (let i = 0, n = V.length / 9; i < n; i++) {
    const j = i * 9;
    const x0 = V[j], y0 = V[j + 1], z0 = V[j + 2];
    const e1x = V[j + 3] - x0, e1y = V[j + 4] - y0, e1z = V[j + 5] - z0;
    const e2x = V[j + 6] - x0, e2y = V[j + 7] - y0, e2z = V[j + 8] - z0;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-9 && det < 1e-9) continue;
    const sd = s.es[s.ent[i]].sd;
    if ((sd > 0 && det < 0) || (sd < 0 && det > 0)) continue;
    const inv = 1 / det;
    const tx = ox - x0, ty = oy - y0, tz = oz - z0;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const w = (dx * qx + dy * qy + dz * qz) * inv;
    if (w < 0 || u + w > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt < t0 || tt >= best) continue;
    const k = s.ent[i];
    if (!s.vis[k]) s.vis[k] = shown(s.es[k].o) ? 1 : -1;
    if (s.vis[k] < 0) continue;
    best = tt;
    bi = i;
  }
  if (bi < 0) return null;
  const j = bi * 9;
  out.k = s.es[s.ent[bi]].thin ? 1 : 2;
  out.obj = s.es[s.ent[bi]].o;
  out.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
  va.set(V[j + 3] - V[j], V[j + 4] - V[j + 1], V[j + 5] - V[j + 2]);
  vb.set(V[j + 6] - V[j], V[j + 7] - V[j + 1], V[j + 8] - V[j + 2]);
  out.normal.crossVectors(va, vb).normalize();
  if (out.normal.dot(d) > 0) out.normal.negate();
  return out;
}
