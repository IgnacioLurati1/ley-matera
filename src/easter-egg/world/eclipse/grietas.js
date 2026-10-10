import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import GeoBuilder from '../GeoBuilder';
import { ZONES, EE } from '../../config/map';
import { islandCells, rimWall, bake, rng, hash, riftMats, cluster, rockGeo, softCracks } from './desgarro';
import { PIECES } from './abismoVida';

// Los jirones de las grietas (isla 'grietas', zonas rM, rT, rP y rO; 2026-10-10).
// El usuario, del paso I del Pack-a-Pava: "al abrirlas llevan a una isla flotante
// chiquita de la dimensión oscura con pedazos del mapa original en donde estaba".
// Cuatro islitas de la misma piedra que La Disformidad (el piso lo arma Levels,
// la roca de abajo world/eclipseRock). Acá, en cada una:
//  - el cerco bajo de obsidiana rota, con lajas paradas y cristales;
//  - las grietas de luz del piso;
//  - lo arrancado de su mapa: un jirón del piso de allá (tierra, tablas del
//    muelle, baldosa), un paño de pared roto con su material, y la utilería de
//    verdad (va en PROPS del config, al final: tumbas, el espantajo, la horca...);
//  - dos manojos grandes de cristal donde están las luces violetas (LIGHTS);
//  - alrededor, flotando: lajas negras y dos pedazos de su mapa que giran.
// El aire negro es de world/eclipseAtmos (la caja de la isla) y la lógica, de
// world/papGrietas.js. globalThis.__mduNoGrietasArt: solo los bloques y la roca.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// a qué altura queda el plato de los pilares del Nudo (world/papGrietas.js PIL_TOP)
export const PILAR_TOP = 1.26;
// Qué lleva cada jirón. slab: [x, z, radio] del jirón de piso; wall: el paño roto
// (a lo largo de x o de z, de a tramos: las alturas; bars: los tramos de la reja);
// glow: [x, z, tamaño] de los manojos de cristal; piece: su pedazo de
// world/eclipse/abismoVida PIECES.
export const JIRONES = {
  rM: { floor: 'dirt', slab: [246.5, 11.9, 4.3], wall: { key: 'plasterWhite', axis: 'x', a: 242.7, b: 248.9, c: 7.05, t: 0.34, h: [1.1, 2.3, 2.7, 2.9, 2.5, 2.8, 1.9, 2.4, 1.2, 0.5] }, glow: [[251.3, 9.9, 1.5], [243.4, 18.3, 1.2]], piece: 'molino' },
  rT: { floor: 'dirt', slab: [290.6, 12.6, 4.6], wall: { key: 'barn', axis: 'z', a: 9.1, b: 15.3, c: 283.05, t: 0.3, h: [0.9, 2.2, 3.0, 3.3, 3.1, 2.6, 2.9, 1.7, 2.1, 0.7] }, glow: [[296.4, 9.6, 1.4], [286.4, 18.6, 1.2]], piece: 'tapera' },
  rP: { floor: 'planks', slab: [331.6, 14.6, 4.4], wall: { key: 'stoneWall', axis: 'x', a: 326.1, b: 332.3, c: 10.05, t: 0.42, h: [0.7, 2.7, 2.9, 3.2, 2.8, 3.1, 2.9, 2.6, 1.3, 0.6], bars: [2, 6] }, glow: [[338.6, 13.4, 1.4], [323.4, 16.2, 1.2]], piece: 'penal' },
  rO: { floor: 'calcareo', slab: [316.4, 36.6, 4.5], wall: { key: 'stoneWall', axis: 'x', a: 312.5, b: 318.1, c: 30.05, t: 0.42, h: [1.0, 2.6, 3.4, 3.7, 3.6, 3.2, 2.4, 2.9, 1.4] }, glow: [[322.6, 34.6, 1.5], [311.4, 42.4, 1.2]], piece: 'torre' },
};
let LIVE = null;

// Los cuatro pilares del Nudo, alrededor del portal negro (EE.grietas[].pilar):
// donde se dejan los objetos que sueltan las grietas (world/papGrietas.js, que
// les pone la sombra del objeto, el aro y el cartel). Un fuste de seis caras de
// obsidiana sobre un zócalo de piedra, con el plato arriba y cristales al pie.
// Van aunque el arte esté apagado (tienen choque y se usan).
function buildPilares(w) {
  if (!EE.grietas?.length || globalThis.__mduOldPapGrietas === true) return;
  const M = riftMats(w);
  const rocks = [];
  const caps = [];
  const crystals = [];
  EE.grietas.forEach((G, i) => {
    const [x, z] = G.pilar;
    const y = w.floorAt(x, z);
    const rnd = rng(8800 + i * 13);
    const turn = rnd() * 1.04;
    const base = rockGeo(rnd, 0.62, 0.3);
    base.translate(x, y + 0.05, z);
    const shaft = new THREE.CylinderGeometry(0.29, 0.42, PILAR_TOP - 0.12, 6, 1);
    shaft.rotateY(turn);
    shaft.translate(x, y + (PILAR_TOP - 0.12) / 2, z);
    rocks.push(base, shaft);
    const cap = new THREE.CylinderGeometry(0.46, 0.33, 0.14, 6, 1);
    cap.rotateY(turn);
    cap.translate(x, y + PILAR_TOP - 0.07, z);
    caps.push(cap);
    for (let k = 0; k < 2; k++) {
      const a = turn + 1.2 + k * 2.7;
      cluster(crystals, x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5, rnd, { n: 3, size: 0.42, dir: [Math.cos(a), Math.sin(a)] });
    }
    w.addBox([x - 0.4, y, z - 0.4, x + 0.4, y + PILAR_TOP, z + 0.4], { kind: 'prop' });
  });
  bake(w, new GeoBuilder(), M, [...rocks.map((gg) => [gg, 'obsidian']), ...caps.map((gg) => [gg, 'rimTop']), ...crystals.map((gg) => [gg, 'crystal'])], { noShadow: ['crystal'], isla: 'nudoPilares' });
}

export function build(w, g, isl) {
  try {
    buildPilares(w);
  } catch (e) {
    console.error('Los pilares del Nudo: no se armaron', e);
  }
  if (globalThis.__mduNoGrietasArt === true) return;
  const R = riftMats(w);
  // (los materiales de cada mapa, los de siempre: w.M)
  const M = { ...R };
  for (const J of Object.values(JIRONES)) for (const k of [J.floor, J.wall?.key]) if (k && w.M[k]) M[k] = w.M[k];
  M.iron = w.M.iron || w.M.black;
  const gb = new GeoBuilder();
  const rocks = [];
  const crystals = [];
  const irons = [];
  const strips = [];
  const floats = [];
  const ruins = [];
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const ruinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, emissive: 0x24104a, emissiveIntensity: 0.35 });
  const live = new THREE.Group();
  live.name = 'eclipseGrietasLive';
  isl.zones.forEach((key, zi) => {
    const J = JIRONES[key];
    if (!ZONES[key] || !J) return;
    const cells = islandCells(w, [key]);
    const { isFloor, rim } = cells;
    if (!Number.isFinite(cells.box[0])) return;
    const [bx0, bz0, bx1, bz1] = cells.box;
    const fy = ZONES[key].y;
    const rnd = rng(6100 + zi * 37);
    rimWall(w, gb, cells, {
      key: 'rimStone',
      topKey: 'rimTop',
      under: 1.4,
      top: (cx, cz) => 1.19 + 0.55 * hash(cx, cz, 41 + zi) * hash(cx * 0.3, cz * 0.3, 43 + zi),
    });
    // ---- lajas paradas y cristales sobre el cerco
    for (const c of rim.values()) {
      const cx = c.x + 0.5;
      const cz = c.z + 0.5;
      let ox = 0;
      let oz = 0;
      for (const [dx, dz] of DIRS) if (!isFloor(c.x + dx, c.z + dz) && !cells.isRim(c.x + dx, c.z + dz)) {
        ox += dx;
        oz += dz;
      }
      const L = Math.hypot(ox, oz) || 1;
      ox /= L;
      oz /= L;
      const h = hash(c.x, c.z, 51 + zi);
      if (h > 0.62) {
        const s = 0.35 + hash(c.x, c.z, 52) * 0.4;
        const tall = 1.2 + hash(c.x, c.z, 53) * 2.6;
        const geo = rockGeo(rnd, s, tall / s);
        qq.setFromEuler(new THREE.Euler(oz * 0.4, hash(c.x, c.z, 54) * 6, -ox * 0.4));
        mm.compose(new THREE.Vector3(cx + ox * 0.25, c.fy + 1.1 + tall * 0.35, cz + oz * 0.25), qq, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(mm);
        rocks.push(geo);
      }
      if (h < 0.13) cluster(crystals, cx + ox * 0.3, c.fy + 1.2, cz + oz * 0.3, rnd, { n: 3, size: 0.5, dir: [ox, oz] });
    }
    // ---- los manojos grandes de cristal (ahí van las luces violetas), con su choque
    for (const [x, z, s] of J.glow) {
      cluster(crystals, x, fy - 0.05, z, rnd, { n: 7, size: s, lean: 0.4 });
      // (el pie: una piedra negra de la que nacen)
      const base = rockGeo(rnd, 0.55 * s, 0.5);
      base.applyMatrix4(mm.makeTranslation(x, fy + 0.08, z));
      rocks.push(base);
      w.addBox([x - 0.35 * s, fy, z - 0.35 * s, x + 0.35 * s, fy + 1.5 * s, z + 0.35 * s], { kind: 'prop' });
    }
    // ---- el jirón de piso de su mapa: una mancha de borde roto, 3,5 cm arriba
    const [sx, sz, sr] = J.slab;
    const inSlab = (x, z) => {
      if (!isFloor(x, z)) return false;
      // (a dos celdas del cerco como mínimo: que se vea la piedra negra alrededor)
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!isFloor(x + dx, z + dz)) return false;
      const dx = x + 0.5 - sx;
      const dz = z + 0.5 - sz;
      const a = Math.atan2(dz, dx);
      const rr = sr * (1 + 0.2 * Math.sin(a * 3 + zi * 1.7) + 0.13 * Math.sin(a * 5 + zi * 0.6));
      return dx * dx + dz * dz < rr * rr;
    };
    if (M[J.floor]) {
      const T = fy + 0.035;
      const B = fy + 0.002;
      const uv = (p) => [p[0] / 2, p[2] / 2];
      for (let z = bz0; z <= bz1; z++) {
        for (let x = bx0; x <= bx1; x++) {
          if (!inSlab(x, z)) continue;
          const e = inSlab(x + 1, z);
          const o = inSlab(x - 1, z);
          const s = inSlab(x, z + 1);
          const n = inSlab(x, z - 1);
          // las cuatro esquinas de la celda (en ronda); la que tiene sus dos lados afuera se corta al sesgo
          const P = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
          const cut = [!o && !n, !e && !n, !e && !s, !o && !s];
          const one = cut.filter(Boolean).length === 1;
          const poly = one ? P.filter((_, k) => !cut[k]) : P;
          const v = poly.map(([px, pz]) => [px, T, pz]);
          // (la cara de arriba: la ronda, al revés, mira para arriba)
          if (v.length === 3) gb.quad(J.floor, v[2], v[1], v[0], v[0], [0, 1, 0], uv(v[2]), uv(v[1]), uv(v[0]), uv(v[0]));
          else gb.quad(J.floor, v[3], v[2], v[1], v[0], [0, 1, 0], uv(v[3]), uv(v[2]), uv(v[1]), uv(v[0]));
          // el canto en los lados abiertos y en el sesgo
          const side = (a, b) => {
            const nx = b[1] - a[1];
            const nz = a[0] - b[0];
            const l = Math.hypot(nx, nz) || 1;
            gb.quad(J.floor, [b[0], B, b[1]], [a[0], B, a[1]], [a[0], T, a[1]], [b[0], T, b[1]], [nx / l, 0, nz / l], [0, 0], [0.5, 0], [0.5, 0.02], [0, 0.02]);
          };
          if (one) {
            const k = cut.indexOf(true);
            side(P[(k + 3) % 4], P[(k + 1) % 4]);
          } else {
            if (!n) side(P[0], P[1]);
            if (!e) side(P[1], P[2]);
            if (!s) side(P[2], P[3]);
            if (!o) side(P[3], P[0]);
          }
        }
      }
    }
    // ---- el paño de pared roto, con el material de su mapa (y su choque)
    const W = J.wall;
    if (W && M[W.key]) {
      const n = W.h.length;
      const step = (W.b - W.a) / n;
      for (let k = 0; k < n; k++) {
        const u0 = W.a + k * step;
        const u1 = u0 + step;
        const h = W.h[k];
        // (el tramo de la reja: el antepecho, el dintel y los barrotes en el medio)
        const bar = W.bars && k >= W.bars[0] && k <= W.bars[1];
        const y0 = fy - 0.02;
        const part = (lo, hi) => (W.axis === 'x' ? gb.box(W.key, u0, lo, W.c, u1, hi, W.c + W.t, 2) : gb.box(W.key, W.c, lo, u0, W.c + W.t, hi, u1, 2));
        if (bar) {
          part(y0, fy + 0.85);
          part(fy + 2.25, fy + h);
        } else part(y0, fy + h);
      }
      if (W.bars) {
        const u0 = W.a + W.bars[0] * step;
        const u1 = W.a + (W.bars[1] + 1) * step;
        const nb = Math.round((u1 - u0) / 0.22);
        for (let k = 1; k < nb; k++) {
          const u = u0 + ((u1 - u0) * k) / nb;
          const geo = new THREE.CylinderGeometry(0.022, 0.022, 1.42, 6);
          const c = W.c + W.t / 2;
          geo.applyMatrix4(mm.makeTranslation(W.axis === 'x' ? u : c, fy + 1.55, W.axis === 'x' ? c : u));
          irons.push(geo);
        }
      }
      const top = Math.max(...W.h);
      if (W.axis === 'x') w.addBox([W.a, fy, W.c, W.b, fy + top, W.c + W.t], { kind: 'prop' });
      else w.addBox([W.c, fy, W.a, W.c + W.t, fy + top, W.b], { kind: 'prop' });
    }
    // ---- las grietas de luz del piso (fuera del jirón de piso)
    const near = (x, z, r) => !isFloor(Math.floor(x + r), Math.floor(z)) || !isFloor(Math.floor(x - r), Math.floor(z)) || !isFloor(Math.floor(x), Math.floor(z + r)) || !isFloor(Math.floor(x), Math.floor(z - r));
    const busy = (x, z) => inSlab(Math.floor(x), Math.floor(z)) || inSlab(Math.floor(x + 0.25), Math.floor(z)) || inSlab(Math.floor(x - 0.25), Math.floor(z)) || inSlab(Math.floor(x), Math.floor(z + 0.25)) || inSlab(Math.floor(x), Math.floor(z - 0.25));
    const fyC = fy + 0.018;
    const crack = (x, z, ang, len, wid, depth) => {
      let px = x;
      let pz = z;
      let pw = wid;
      let a = ang;
      let left = len;
      while (left > 0) {
        a += (rnd() - 0.5) * 1.1 + (ang - a) * 0.35;
        const st = 0.14 + rnd() * 0.2;
        const nx = px + Math.cos(a) * st;
        const nz = pz + Math.sin(a) * st;
        if (!isFloor(Math.floor(nx), Math.floor(nz)) || near(nx, nz, 0.3) || busy(nx, nz)) break;
        const nw = Math.max(0.018, pw * (0.9 + rnd() * 0.08));
        strips.push([px, pz, nx, nz, -Math.sin(a), Math.cos(a), pw, nw, fyC]);
        px = nx;
        pz = nz;
        pw = nw;
        left -= st;
        if (depth < 2 && rnd() < 0.18) crack(px, pz, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), left * 0.55, pw * 0.75, depth + 1);
      }
    };
    for (let k = 0; k < 90; k++) {
      const x = bx0 + rnd() * (bx1 - bx0 + 1);
      const z = bz0 + rnd() * (bz1 - bz0 + 1);
      if (!isFloor(Math.floor(x), Math.floor(z)) || near(x, z, 0.6) || busy(x, z)) continue;
      crack(x, z, rnd() * Math.PI * 2, 2 + rnd() * 4, 0.045 + rnd() * 0.04, 0);
    }
    // ---- flotando alrededor: lajas negras y dos pedazos de su mapa
    const cx = (bx0 + bx1 + 1) / 2;
    const cz = (bz0 + bz1 + 1) / 2;
    const rad = Math.max(bx1 - bx0, bz1 - bz0) / 2;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.5;
      const r = rad + 5.5 + rnd() * 9;
      floats.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: fy + (rnd() - 0.4) * 10, s: 1.2 + rnd() * 2.6, a: rnd() * 6.28, sp: (rnd() - 0.5) * 0.25, bob: rnd() * 6.28, tilt: [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9] });
    }
    const fn = PIECES?.[J.piece];
    if (fn) {
      for (let k = 0; k < 2; k++) {
        const geo = mergeGeometries(fn());
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, ruinMat);
        m.name = 'grieta-ruina-' + J.piece;
        const a = zi * 1.3 + k * 2.6 + 0.8;
        // (lejos del borde: de adentro no se encima con el paño de pared)
        const r = rad + 9 + k * 4;
        m.scale.setScalar(1.5 + k * 0.5);
        m.position.set(cx + Math.cos(a) * r, fy + 3 + k * 2.5, cz + Math.sin(a) * r);
        m.rotation.set((rnd() - 0.5) * 0.8, rnd() * 6.28, (rnd() - 0.5) * 0.8);
        m.castShadow = false;
        live.add(m);
        ruins.push({ m, y: m.position.y, rx: m.rotation.x, rz: m.rotation.z, sp: (rnd() - 0.5) * 0.12, bob: rnd() * 6.28, spin: J.piece === 'molino' ? 0.25 : 0 });
      }
    }
  });
  const stat = bake(w, gb, M, [...rocks.map((gg) => [gg, 'obsidian']), ...crystals.map((gg) => [gg, 'crystal']), ...irons.map((gg) => [gg, 'iron'])], { noShadow: ['crystal'], isla: 'grietas' });
  if (strips.length) live.add(softCracks(strips));
  // las lajas que flotan: una malla para las de los cuatro jirones
  const slabGeo = new THREE.BoxGeometry(1, 0.5, 1, 2, 1, 2);
  {
    const p = slabGeo.attributes.position;
    const r2 = rng(733);
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (0.8 + r2() * 0.4));
      p.setZ(i, p.getZ(i) * (0.8 + r2() * 0.4));
      p.setY(i, p.getY(i) + (r2() - 0.5) * 0.25);
    }
    slabGeo.computeVertexNormals();
  }
  const flo = new THREE.InstancedMesh(slabGeo, R.float, Math.max(1, floats.length));
  flo.name = 'grietasLajas';
  flo.frustumCulled = false;
  flo.castShadow = false;
  live.add(flo);
  w.root.add(live);
  (w.warmHidden ||= []).push(live);
  LIVE = { w, stat, live, flo, floats, ruins, box: isl.box, y: isl.y, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() };
  update(0, 0);
}

export function update(dt, t) {
  const L = LIVE;
  if (!L) return;
  const cam = L.w.g?.camera?.position;
  const [x0, z0, x1, z1] = L.box;
  // (solo con la cámara allá: desde las islas no se ve nada de esto)
  const here = !cam || (cam.y > L.y - 30 && cam.x > x0 - 60 && cam.x < x1 + 60 && cam.z > z0 - 60 && cam.z < z1 + 60);
  L.live.visible = here;
  if (L.stat) L.stat.visible = here;
  if (!here && t > 0) return;
  const { flo, floats, m, q, e, v, s } = L;
  for (let k = 0; k < floats.length; k++) {
    const p = floats[k];
    e.set(p.tilt[0] + Math.sin(t * 0.3 + p.bob) * 0.08, p.a + t * p.sp, p.tilt[1]);
    q.setFromEuler(e);
    v.set(p.x, p.y + Math.sin(t * 0.4 + p.bob) * 0.6, p.z);
    m.compose(v, q, s.set(p.s, 1 + p.s * 0.15, p.s * (0.7 + 0.3 * Math.sin(p.bob))));
    flo.setMatrixAt(k, m);
  }
  flo.instanceMatrix.needsUpdate = true;
  for (const R of L.ruins) {
    R.m.position.y = R.y + Math.sin(t * 0.35 + R.bob) * 0.8;
    R.m.rotation.y += R.sp * dt;
    R.m.rotation.x = R.rx + Math.sin(t * 0.21 + R.bob) * 0.08;
    R.m.rotation.z = R.rz + Math.sin(t * 0.17 + R.bob) * 0.06 + R.spin * t;
  }
}
