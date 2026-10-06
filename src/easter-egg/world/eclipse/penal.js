import * as THREE from 'three';
import { ZONES, MAPS } from '../../config/map';
import { ISLANDS } from '../../config/maps/eclipse';
import { mesh, cylGeo, boxGeo, buildProp } from '../props';
import GeoBuilder from '../GeoBuilder';
import { rng } from '../../core/noise';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { winMats } from './molino';
import { keepOut, addFixed, zbox, tpShift, grime, orbiters, fragment, wallCrack, curbs, curbMats, cliffRocks, CLIFFS, crackMat, portalOrbs, FLOOR, OUT, WALL, WIN, buildArch, OWN_MATS, detailCuller } from './centro';

// El Penal de la Isla del Ceibo (isla "penal" de Eclipse Matero, layout v4): el
// Pabellón B, el comedor, la cocina y el patio de recreo TRANSPLANTADOS iguales
// a Mate of the Dead (la utilería, las luces y la chapa del techo vienen del
// transplante y de penal.py). Lo que falta para que se vea igual y lo retorcido:
//  · las paredes de afuera con la piedra del penal (en Eclipse 'stoneWall' es
//    el travertino del Monumento) y la tapa de los muros;
//  · las ventanas del penal donde estaban (allá eran las de los muertos: acá
//    van cerradas, con su marco y las tablas clavadas);
//  · la escalera del patio que bajaba al yerbal: ahora sigue en el aire, en
//    pedazos, hacia el vacío;
//  · paredes rajadas con la luz violeta, papeles que flotan en el comedor;
//  · la torre de guardia suelta (J9), inclinada, con su reflector;
//  · humedad: el penal chorrea (paredes, charcos en el patio y en el pabellón).

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let live = null;

export function build(w, g, isl) {
  // (globalThis.__mduNoArteA: las islas de arte-A en bloques, para comparar)
  if (globalThis.__mduNoArteA === true) return;
  const M = w.M;
  const r = rng(7411);
  const celda = ANCHORS?.celda ? [[ANCHORS.celda.x, ANCHORS.celda.z, 1.2]] : [];
  const out = keepOut(celda);
  const gb = new GeoBuilder();
  const root = new THREE.Group();
  root.name = 'eclipse:penal';
  const orbs = [];
  live = { w, papers: [] };
  CLIFFS.length = 0;
  const own = ISLANDS.penal.zones.filter((k) => !ZONES[k].frag);
  buildOutside(w, gb, own);
  buildWindows(w, gb, r);
  buildTwist(w, root, r, orbs);
  buildEscalera(w, root, r, orbs);
  buildTorreSuelta(w, r, orbs);
  curbs(w, 'penal', gb);
  cliffRocks(w, root, out, r, 'penal');
  portalOrbs('penal', orbs);
  live.orb = orbiters(w, orbs, { seed: 74 });
  const arch = buildArch(gb, { ...M, ...winMats(M), ...curbMats(w), ...penalMats(w) }, 'eclipse:penal:afuera', w);
  w.root.add(arch, root);
  // el penal chorrea: humedad en las paredes, óxido, charcos en el patio y en el pabellón
  const gr = grime(w, 'penal', { seed: 7501, damp: 0.3, moss: 0.25, rust: 0.12, drip: 0.35, mud: 0.06, puddles: 12, wet: ['pA', 'pB', 'pC'], out });
  live.cull = detailCuller(w, 'penal', [...gr.children, live.paperIm]);
}

// La piedra del penal (la de su mapa) y la tapa de los muros.
let PM = null;
function penalMats(w) {
  if (PM) return PM;
  const T = w.T;
  PM = {
    penalStone: new THREE.MeshStandardMaterial({ map: T.stoneWall, roughness: 0.92 }),
    penalTop: new THREE.MeshStandardMaterial({ map: T.stoneWall, color: 0x7a766e, roughness: 0.95 }),
    penalBoard: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }),
  };
  for (const m of Object.values(PM)) OWN_MATS.add(m);
  return PM;
}

// ---------------- las caras de afuera ----------------
// Cada celda de pared del penal que da al vacío o al patio: su cara de afuera
// con la piedra del penal, un pelo afuera de la de Levels, y la tapa del muro.
function buildOutside(w, gb, own) {
  const ids = new Set(own.map((k) => w.zoneKeys.indexOf(k)));
  const roofed = (i) => w.grid[i] === FLOOR && ids.has(w.zone[i]) && !ZONES[w.zoneKeys[w.zone[i]]].outdoor;
  const [x0, z0, x1, z1] = ISLANDS.penal.box;
  const E = 0.012;
  for (let z = z0 - 2; z <= z1 + 2; z++) {
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if ((w.grid[i] !== WALL && w.grid[i] !== WIN) || w.edge[i] !== 0) continue;
      // (una pared de lo techado del penal)
      if (!D4.some(([dx, dz]) => roofed(w.idx(x + dx, z + dz)))) continue;
      const top = w.top[i];
      for (const [dx, dz] of D4) {
        const j = w.idx(x + dx, z + dz);
        const t = w.grid[j];
        let lo = null;
        if (t === OUT) lo = w.fy[i] - 2.2;
        else if (t === FLOOR && ZONES[w.zoneKeys[w.zone[j]]]?.outdoor) lo = w.fy[j];
        else if (t !== FLOOR && t !== OUT && w.edge[j] !== 0) lo = w.fy[j] - 0.1;
        if (lo == null) continue;
        const mx = x + 0.5 + dx * (0.5 + E);
        const mz = z + 0.5 + dz * (0.5 + E);
        gb.wall('penalStone', mx - dz * 0.5, mz + dx * 0.5, mx + dz * 0.5, mz - dx * 0.5, lo, top + 0.004, [dx, 0, dz], 3.6);
      }
    }
  }
}

// ---------------- las ventanas del penal ----------------
// Las del mapa de origen (eran las de los muertos): el vano oscuro, el marco de
// Levels (dintel y alféizar) y tres tablas clavadas, de los dos lados.
function buildWindows(w, gb, r) {
  const sh = tpShift('pA');
  const src = MAPS.penal?.WINDOWS || [];
  if (!sh) return;
  const keys = new Set(['A', 'B', 'C', 'H']);
  const SILL = 1.05;
  const HEAD = 2.25;
  for (const d of src) {
    if (!keys.has(d.zone)) continue;
    const x = d.cell[0] + sh.dx;
    const z = d.cell[1] + sh.dz;
    if (!w.inside(x, z)) continue;
    const i = w.idx(x, z);
    if (w.grid[i] !== WALL) continue;
    const [ox, oz] = d.out;
    // el piso de adentro (la celda del lado contrario a `out`)
    const j = w.idx(x - ox, z - oz);
    const fy = w.grid[j] === FLOOR ? w.fy[j] : w.fy[i];
    for (const s of [1, -1]) {
      const nx = ox * s;
      const nz = oz * s;
      // la cara (afuera s = 1, adentro s = -1)
      const cx = x + 0.5 + nx * 0.515;
      const cz = z + 0.5 + nz * 0.515;
      const rx = nz;
      const rz = -nx;
      const hw = 0.5;
      gb.wall('winNight', cx - rx * hw, cz - rz * hw, cx + rx * hw, cz + rz * hw, fy + SILL, fy + HEAD, [nx, 0, nz], 2);
      const box = (off, y0, y1, along, dep) => {
        const px = cx + nx * dep * 0.5 + rx * off;
        const pz = cz + nz * dep * 0.5 + rz * off;
        const hx = (Math.abs(rx) * along + Math.abs(nx) * dep) / 2;
        const hz = (Math.abs(rz) * along + Math.abs(nz) * dep) / 2;
        gb.box(along > 0.3 ? 'trim' : 'trim', px - hx, y0, pz - hz, px + hx, y1, pz + hz, 1);
      };
      box(0, fy + SILL - 0.06, fy + SILL + 0.02, 1.0, 0.1);
      box(0, fy + HEAD - 0.02, fy + HEAD + 0.06, 1.0, 0.1);
      for (const k of [-0.5, 0.5]) box(k * 0.96, fy + SILL, fy + HEAD, 0.05, 0.06);
      // las tablas clavadas, desparejas
      if (s > 0) {
        for (let k = 0; k < 3; k++) {
          const yy = fy + SILL + 0.25 + k * 0.38 + (r() - 0.5) * 0.06;
          const px = cx + nx * 0.04;
          const pz = cz + nz * 0.04;
          const len = 1.15;
          const t = 0.03;
          const hx = (Math.abs(rx) * len + Math.abs(nx) * t) / 2;
          const hz = (Math.abs(rz) * len + Math.abs(nz) * t) / 2;
          gb.box('penalBoard', px - hx, yy - 0.09, pz - hz, px + hx, yy + 0.09, pz + hz, 1);
        }
      }
    }
  }
}

// ---------------- lo retorcido ----------------
// Paredes rajadas con la luz adentro (el pabellón y el comedor) y papeles que
// se despegaron del piso y flotan en el comedor.
function buildTwist(w, root, r, orbs) {
  if (ZONES.pA) {
    const [x0, z0, x1] = zbox('pA', true);
    // (la pared del fondo del piso de abajo, entre las celdas)
    wallCrack(root, x0 + (x1 - x0) * 0.62, z0, [0, 1], ZONES.pA.y + 0.3, ZONES.pA.y + 3.9, 0.55);
  }
  if (ZONES.pB) {
    const [x0, z0, x1, z1] = zbox('pB', true);
    wallCrack(root, x0, z0 + (z1 - z0) * 0.7, [1, 0], ZONES.pB.y + 0.2, ZONES.pB.roof - 0.4, 0.5);
    // papeles y una bandeja que flotan, despacio
    const paper = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.9, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.3), paper, 9);
    im.frustumCulled = false;
    for (let k = 0; k < 9; k++) {
      const x = x0 + 2 + r() * (x1 - x0 - 4);
      const z = z0 + 2 + r() * (z1 - z0 - 4);
      live.papers.push({ x, z, y: ZONES.pB.y + 1.6 + r() * 1.4, p: r() * 6, s: 0.3 + r() * 0.5, a: r() * 3, b: r() * 3 });
    }
    root.add(im);
    live.paperIm = im;
    orbs.push({ c: [(x0 + x1) / 2, ZONES.pB.y + 2.2, (z0 + z1) / 2], r: [1.2, 3.5], h: 1.2, n: 6, s: [0.04, 0.1], sp: 0.2 });
  }
}

// ---------------- la escalera que bajaba al yerbal ----------------
// La cola angosta del patio terminaba en la escalera de la leva: ahora sigue
// en el aire, escalones sueltos que bajan hacia el vacío y se separan.
function buildEscalera(w, root, r, orbs) {
  if (!ZONES.pH) return;
  // la cola: el rect más angosto del patio
  const R = ZONES.pH.rects.reduce((a, b) => (b[2] - b[0] < a[2] - a[0] ? b : a));
  const x0 = R[0];
  const x1 = R[2] + 1;
  const zEnd = R[3] + 1;
  const y = ZONES.pH.y;
  const M = w.M;
  const g = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const z = zEnd + 1.6 + k * 0.62 + k * k * 0.04;
    const yy = y - 0.3 - k * 0.42 - k * k * 0.03;
    const dx = (r() - 0.5) * k * 0.12;
    const s = mesh(boxGeo(x1 - x0 - 0.1, 0.22, 0.6), M.stoneDark, (x0 + x1) / 2 + dx, yy, z, (r() - 0.5) * k * 0.05, (r() - 0.5) * k * 0.06, (r() - 0.5) * k * 0.08);
    s.castShadow = true;
    g.add(s);
  }
  // la baranda de hierro que se fue con ellos, torcida
  for (const sx of [x0 + 0.05, x1 - 0.05]) {
    for (let k = 0; k < 4; k++) g.add(mesh(cylGeo(0.02, 0.02, 1.1, 5), M.iron, sx, y - 0.2 - k * 1.1, zEnd + 2 + k * 1.4, 0.3 + k * 0.1, 0, (r() - 0.5) * 0.4));
  }
  addFixed(w, g);
  const c = mesh(new THREE.PlaneGeometry(x1 - x0 + 1.5, 6), crackMat(), (x0 + x1) / 2, y - 2.5, zEnd + 3.6, -0.6, 0, 0);
  c.renderOrder = 2;
  root.add(c);
  orbs.push({ c: [(x0 + x1) / 2, y - 1.5, zEnd + 4], r: [1, 3.2], h: 3, n: 10, s: [0.06, 0.2], sp: 0.25 });
}

// ---------------- la torre de guardia, suelta (J9) ----------------
function buildTorreSuelta(w, r, orbs) {
  if (!ZONES.J9) return;
  const M = w.M;
  const F = fragment(w, 'J9', { tilt: [0.12, -0.02, -0.1], top: 'concrete', seed: 39 });
  const g = F.g;
  const res = buildProp({ type: 'torre', pos: [0, 0], y: 0, rot: 0.6 }, M, 3939);
  if (res) {
    res.obj.position.set(-0.3, 0, 0.2);
    res.obj.rotation.y = 0.6;
    g.add(res.obj);
  }
  // un pedazo del muro con el alambre de púas, colgando del canto
  g.add(mesh(boxGeo(3.2, 1.6, 0.5), M.stoneDark, F.hx * 0.2, -0.6, F.hz + 0.6, 0.5, 0.1, 0.15));
  const ring = new THREE.TorusGeometry(0.3, 0.009, 3, 14);
  for (let k = 0; k < 8; k++) g.add(mesh(ring, M.iron, F.hx * 0.2 - 1.4 + k * 0.4, -0.05, F.hz + 0.95, Math.PI / 2 + 0.5, 0, 0));
  F.finish();
  orbs.push({ c: [g.position.x, g.position.y + 2.5, g.position.z], r: [2.5, 4.5], h: 3.5, n: 10, s: [0.08, 0.3], sp: 0.17 });
}

export function update(dt, t) {
  const S = live;
  if (!S) return;
  const im = S.paperIm;
  if (im) {
    const m4 = (S.m4 ||= new THREE.Matrix4());
    const q = (S.q ||= new THREE.Quaternion());
    const e = (S.e ||= new THREE.Euler());
    const v = (S.v ||= new THREE.Vector3());
    const one = (S.one ||= new THREE.Vector3(1, 1, 1));
    S.papers.forEach((p, k) => {
      m4.compose(v.set(p.x, p.y + Math.sin(t * p.s + p.p) * 0.25, p.z), q.setFromEuler(e.set(p.a + t * p.s * 0.2, p.b + t * p.s * 0.4, 0.3)), one);
      im.setMatrixAt(k, m4);
    });
    im.instanceMatrix.needsUpdate = true;
  }
  S.orb?.update(t);
  S.cull?.();
}

