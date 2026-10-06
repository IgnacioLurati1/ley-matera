import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import GeoBuilder from '../GeoBuilder';
import { quad, bbox, lathe } from '../monumentoKit';
import { flameMaterial } from '../castleFire';
import { toTexture } from '../../core/textures';
import { ZONES, RAMPS } from '../../config/map';
import { LIGHTS } from '../../config/maps/eclipse';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { islandCells, rimWall, bake, mergedMesh, placeProp, rng, hash, cladWalls } from './desgarro';
import { fragment, orbiters, grime, wallCrack, portalOrbs, keepOut } from './centro';

// La Torre de Eclipse Matero (layout v4):
//  · La Cima del Remolino (tP15): el piso 15 TRANSPLANTADO igual (la utilería
//    viene del config); acá su piso de mosaico calcáreo con la rosa de los
//    vientos en el medio (como la plaza de los pisos de world/Tower.js, con su
//    misma textura copiada), las paredes de piedra de la torre con su arcada
//    ciega y la guarda, el cañón de Obligado apuntando al eclipse (EE,
//    ANCHORS.canon) con su pila de balas y un brasero, y el pedestal de la llama
//    del desgarro (la luz 'llamaTemple') con la llama verde.
//  · La Galería de los Arcos (O): piso de terracota, el parapeto de ladrillo con
//    tejas (tapa la baranda de Levels), pilastras afuera, un claustro de arcos
//    alrededor del agujero y abajo el ojo del remolino (luz dorada y verde que
//    gira, con cintas que suben).
//  · La Escalera de Oro (P): pasamanos y pilares de bronce.
//  · Arcos rotos, sueltos (O9): un pedazo de la galería arrancado, inclinado.
//  · Alrededor, lo que levanta el remolino (tablas y tejas) dando vueltas; piedras
//    en los portales; grietas de luz; humedad y musgo en el ladrillo (centro.grime).
// Todo sale del config (ZONES, LIGHTS con tag de torre.py). __mduNoEclipseTowerArt: solo los bloques.

let LIVE = null;

// El agujero del medio de una zona-anillo: las celdas que no son piso adentro de su caja.
function holeOf(w, k) {
  const R = ZONES[k].rects;
  const x0 = Math.min(...R.map((r) => r[0]));
  const z0 = Math.min(...R.map((r) => r[1]));
  const x1 = Math.max(...R.map((r) => r[2]));
  const z1 = Math.max(...R.map((r) => r[3]));
  const id = w.zoneKeys.indexOf(k);
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = w.idx(x, z);
      if (w.grid[i] === 1 && w.zone[i] === id) continue;
      a = Math.min(a, x);
      b = Math.min(b, z);
      c = Math.max(c, x);
      d = Math.max(d, z);
    }
  }
  return Number.isFinite(a) ? [a, b, c, d] : null;
}
const tagged = (t) => LIGHTS.filter((l) => l.tag === t);
const zoneOfCell = (w, x, z) => {
  const i = w.idx(x, z);
  return w.zone[i] >= 0 ? w.zoneKeys[w.zone[i]] : null;
};

export function build(w, g, isl) {
  if (globalThis.__mduNoEclipseTowerArt === true) return;
  const M = w.M;
  const y = isl.y;
  const open = isl.zones.filter((k) => !ZONES[k].frag && ZONES[k].outdoor);
  const cells = islandCells(w, open);
  const { rim } = cells;
  const rnd = rng(4417);
  const mats = {
    ...M,
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.28, metalness: 0.95, emissive: 0x2a1a00, emissiveIntensity: 1 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0x402a10, emissive: 0xffc060, emissiveIntensity: 2.2, roughness: 0.4 }),
    // la piedra de la torre (la del penal, teñida: Tower.makeMaterials)
    towerStone: new THREE.MeshStandardMaterial({ map: w.T.stoneWall || w.T.concrete, color: 0xb8ae9e, roughness: 0.95, bumpMap: w.T.stoneWall || null, bumpScale: 1.2 }),
    keyStone: new THREE.MeshStandardMaterial({ map: w.T.stoneWall || w.T.concrete, color: 0xe0d8c8, roughness: 0.85 }),
    // el piso de mosaico calcáreo y la rosa (encima del piso de Levels, con desplazamiento de profundidad)
    marble: new THREE.MeshStandardMaterial({ map: w.T.calcareo, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    rosa: new THREE.MeshStandardMaterial({ map: rosaTexture(), roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  };
  const gb = new GeoBuilder();
  const extra = [];
  const kO = isl.zones.find((k) => ZONES[k].outdoor && !ZONES[k].frag && holeOf(w, k));
  const HOLE = kO ? holeOf(w, kO) : null;
  const HC = HOLE ? [(HOLE[0] + HOLE[2] + 1) / 2, (HOLE[1] + HOLE[3] + 1) / 2] : null;
  const yO = kO ? ZONES[kO].y : y;
  const inHole = (c) => HOLE && c.x >= HOLE[0] && c.x <= HOLE[2] && c.z >= HOLE[1] && c.z <= HOLE[3];
  // la escalera de oro: los bordes al costado de las rampas de la isla
  const stairs = RAMPS.filter((R) => isl.zones.includes(zoneOfCell(w, R.rect[0], R.rect[1])));
  const stairRim = (c) => stairs.some((R) => c.z >= R.rect[1] && c.z <= R.rect[3] && (c.x === R.rect[0] - 1 || c.x === R.rect[2] + 1));

  // ---- el borde: parapeto de ladrillo con tejas (en la escalera, la baranda de bronce arriba)
  rimWall(w, gb, cells, { key: 'brick', topKey: 'terracotta', under: 1.4, top: () => 1.2 });
  for (const R of stairs) {
    for (const xr of [R.rect[0] - 1, R.rect[2] + 1]) {
      const pts = [];
      for (let z = R.rect[1]; z <= R.rect[3]; z++) {
        const c = rim.get(w.idx(xr, z));
        if (c) pts.push([z, c.hi + 1.2]);
      }
      for (let k = 0; k < pts.length - 1; k++) {
        const [z0, y0] = pts[k];
        const [z1, y1] = pts[k + 1];
        const cx = xr + 0.5;
        quad(gb, 'gold', [[cx - 0.07, y0 + 0.32, z0 + 0.5], [cx + 0.07, y0 + 0.32, z0 + 0.5], [cx + 0.07, y1 + 0.32, z1 + 0.5], [cx - 0.07, y1 + 0.32, z1 + 0.5]], [0, 1, 0]);
        for (const sd of [-1, 1]) quad(gb, 'gold', [[cx + sd * 0.07, y0 + 0.24, z0 + 0.5], [cx + sd * 0.07, y1 + 0.24, z1 + 0.5], [cx + sd * 0.07, y1 + 0.32, z1 + 0.5], [cx + sd * 0.07, y0 + 0.32, z0 + 0.5]], [sd, 0, 0]);
        for (const t of [0.25, 0.75]) {
          const zz = z0 + 0.5 + t;
          const yy = y0 + (y1 - y0) * t;
          bbox(gb, 'gold', cx - 0.035, yy - 0.01, zz - 0.035, cx + 0.035, yy + 0.26, zz + 0.035, { b: 0.01 });
        }
      }
      for (const k of pts.length ? [0, pts.length - 1] : []) {
        const [zz, yy] = pts[k];
        bbox(gb, 'gold', xr + 0.38, yy - 0.01, zz + 0.38, xr + 0.62, yy + 0.45, zz + 0.62, { b: 0.02 });
        extra.push([new THREE.SphereGeometry(0.15, 10, 8).translate(xr + 0.5, yy + 0.58, zz + 0.5), 'gold']);
      }
    }
  }
  // pilastras en la cara de afuera del borde, cada cuatro celdas
  for (const c of rim.values()) {
    if (inHole(c) || stairRim(c) || (c.x + c.z) % 4) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const nz = c.z + dz;
      if (!w.inside(nx, nz) || w.grid[w.idx(nx, nz)] !== 0) continue;
      const fx = dx > 0 ? c.x + 1 : dx < 0 ? c.x : c.x + 0.5;
      const fz = dz > 0 ? c.z + 1 : dz < 0 ? c.z : c.z + 0.5;
      const ox = dx * 0.16;
      const oz = dz * 0.16;
      const ax = dx ? Math.min(fx, fx + ox) + dx * 0.04 : fx - 0.28;
      const bx = dx ? Math.max(fx, fx + ox) + dx * 0.04 : fx + 0.28;
      const az = dz ? Math.min(fz, fz + oz) + dz * 0.04 : fz - 0.28;
      const bz = dz ? Math.max(fz, fz + oz) + dz * 0.04 : fz + 0.28;
      bbox(gb, 'brick', ax, c.fy - 1.6, az, bx, c.hi + 1.36, bz, { b: 0.03, top: 'terracotta', skip: ['bottom'] });
    }
  }

  // ---- el claustro alrededor del agujero de la galería
  if (HOLE) {
    const fy = yO;
    const PW = 0.8;
    const SPR = fy + 2.55;
    const TOP = fy + 4.5;
    const mx = Math.round((HOLE[0] + HOLE[2]) / 2);
    const mz = Math.round((HOLE[1] + HOLE[3]) / 2);
    const pil = [];
    for (const x of [HOLE[0], mx, HOLE[2]]) for (const z of [HOLE[1], mz, HOLE[3]]) if (x !== mx || z !== mz) pil.push([x + 0.5, z + 0.5]);
    for (const [px, pz] of pil) {
      bbox(gb, 'brick', px - PW / 2, fy + 1.0, pz - PW / 2, px + PW / 2, SPR, pz + PW / 2, { b: 0.03, skip: ['top', 'bottom'] });
      bbox(gb, 'terracotta', px - PW / 2 - 0.08, fy + 1.0, pz - PW / 2 - 0.08, px + PW / 2 + 0.08, fy + 1.32, pz + PW / 2 + 0.08, { b: 0.03, skip: ['bottom'] });
      bbox(gb, 'terracotta', px - PW / 2 - 0.07, SPR - 0.04, pz - PW / 2 - 0.07, px + PW / 2 + 0.07, SPR + 0.16, pz + PW / 2 + 0.07, { b: 0.03 });
      bbox(gb, 'brick', px - PW / 2, SPR + 0.16, pz - PW / 2, px + PW / 2, TOP, pz + PW / 2, { b: 0.02, skip: ['top', 'bottom'] });
    }
    const T = 0.62;
    const sides = [['z', HOLE[1] + 0.5, HOLE[0], HOLE[2], mx], ['z', HOLE[3] + 0.5, HOLE[0], HOLE[2], mx], ['x', HOLE[0] + 0.5, HOLE[1], HOLE[3], mz], ['x', HOLE[2] + 0.5, HOLE[1], HOLE[3], mz]];
    for (const [ax, v, a0, a1, m] of sides) {
      for (const [a, b] of [[a0 + 0.5, m + 0.5], [m + 0.5, a1 + 0.5]]) archSpan(gb, 'brick', 'terracotta', ax, v, a + PW / 2, b - PW / 2, SPR + 0.16, TOP, T);
    }
    const CO = T / 2 + 0.12;
    for (const [ax, v] of sides) {
      if (ax === 'z') bbox(gb, 'terracotta', HOLE[0] + 0.5 - PW / 2 - 0.15, TOP, v - CO, HOLE[2] + 0.5 + PW / 2 + 0.15, TOP + 0.28, v + CO, { b: 0.04 });
      else bbox(gb, 'terracotta', v - CO, TOP, HOLE[1] + 0.5 + CO, v + CO, TOP + 0.28, HOLE[3] + 0.5 - CO, { b: 0.04, skip: ['+z', '-z'] });
    }
    // los faroles colgados de los arcos (las luces 'farol' de torre.py)
    for (const L of tagged('farol')) lantern(gb, extra, L.pos[0], L.pos[1] - 0.15, L.pos[2], TOP - 0.05);
  }

  // ---- la cima transplantada: el mosaico con la rosa, las paredes de la torre,
  // el cañón, el brasero y la llama
  const kT = isl.zones.find((k) => ZONES[k].tp?.src === 'torre');
  if (kT) {
    cima(w, gb, kT);
    // (las paredes de la cima por afuera: la piedra de la torre, no el travertino)
    cladWalls(w, gb, [kT], 'towerStone', 'keyStone');
  }
  const cn = ANCHORS?.canon || null;
  if (cn) {
    canon(extra, mats, cn.x, cn.y, cn.z);
    w.addBox([cn.x - 0.75, cn.y, cn.z - 1.5, cn.x + 0.75, cn.y + 1.4, cn.z + 1.25], { kind: 'prop' });
    balls(extra, cn.x + 1.6, cn.y, cn.z + 0.8);
    w.addBox([cn.x + 1.25, cn.y, cn.z + 0.45, cn.x + 1.95, cn.y + 0.5, cn.z + 1.15], { kind: 'prop' });
  }
  let seed = 9100;
  const P = (def) => placeProp(w, def, (seed += 11));
  for (const L of tagged('braseroCanon')) P({ type: 'brasero', pos: [L.pos[0], L.pos[2]] });
  let flameG = null;
  for (const L of tagged('llamaTemple')) {
    const lx = L.pos[0];
    const lz = L.pos[2];
    const ly = w.floorAt(lx, lz);
    bbox(gb, 'castleStone', lx - 0.28, ly, lz - 0.28, lx + 0.28, ly + 0.95, lz + 0.28, { b: 0.04 });
    bbox(gb, 'castleStoneDark', lx - 0.34, ly, lz - 0.34, lx + 0.34, ly + 0.18, lz + 0.34, { b: 0.03 });
    extra.push([lathe([[0.05, 0], [0.22, 0.02], [0.32, 0.12], [0.34, 0.18], [0.3, 0.16], [0.0, 0.1]], 16).translate(lx, ly + 0.95, lz), 'gold']);
    w.addBox([lx - 0.34, ly, lz - 0.34, lx + 0.34, ly + 1.15, lz + 0.34], { kind: 'prop' });
    flameG = mergedMesh([0, 1, 2].map((k) => new THREE.PlaneGeometry(0.5, 0.95).translate(0, 0.47, 0).rotateY((k / 3) * Math.PI).translate(lx, ly + 1.04, lz)), greenFlame(), { castShadow: false });
    flameG.renderOrder = 5;
  }

  bake(w, gb, mats, extra, { noShadow: ['lantern', 'marble', 'rosa'], isla: 'torre' });

  // ---- los arcos sueltos (O9)
  const orbs = [];
  if (ZONES.O9) arcosSueltos(w, mats, orbs);
  portalOrbs('torre', orbs);
  const orb = orbiters(w, orbs, { seed: 47 });
  // ---- grietas de luz en el parapeto y la humedad del ladrillo
  const root = new THREE.Group();
  root.name = 'eclipse:torre:disformidad';
  let nc = 0;
  for (const c of rim.values()) {
    if (nc >= 10 || inHole(c) || stairRim(c) || hash(c.x, c.z, 77) > 0.06) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.grid[w.idx(c.x + dx, c.z + dz)] !== 0) continue;
      wallCrack(root, c.x + 0.5 + dx * 0.55, c.z + 0.5 + dz * 0.55, [dx, dz], c.fy - 1.2, c.hi + 1.0, 0.4);
      nc++;
      break;
    }
  }
  w.root.add(root);
  grime(w, 'torre', { seed: 4701, damp: 0.2, moss: 0.22, rust: 0.05, drip: 0.25, mud: 0.04, puddles: 9, wet: [], out: keepOut() });

  // ---- lo que se mueve: el ojo del remolino en el agujero y lo que vuela alrededor
  const live = new THREE.Group();
  live.name = 'eclipseTorreLive';
  if (flameG) live.add(flameG);
  let eye = null;
  let eyeMat = null;
  let ribbons = null;
  if (HOLE) {
    let pit = yO - 1.5;
    const rock = w.root.getObjectByName('eclipseRock');
    if (rock) {
      const ray = new THREE.Raycaster(new THREE.Vector3(HC[0], yO + 5, HC[1]), new THREE.Vector3(0, -1, 0), 0, 30);
      const hit = ray.intersectObject(rock, false)[0];
      if (hit) pit = hit.point.y;
    }
    const rad = Math.max(1.5, (Math.min(HOLE[2] - HOLE[0], HOLE[3] - HOLE[1]) - 1) / 2);
    eyeMat = swirlMaterial();
    eye = new THREE.Mesh(new THREE.CircleGeometry(rad, 40).rotateX(-Math.PI / 2), eyeMat);
    eye.position.set(HC[0], pit + 0.06, HC[1]);
    eye.renderOrder = 4;
    live.add(eye);
    const ribbonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.72, 0.18), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    ribbons = new THREE.Mesh(mergeGeometries([0, 1, 2].map((k) => helix(rad * 0.8 - k * 0.5, pit + 0.1, yO + 2.6 + k * 0.6, 1.6 + k * 0.3, (k / 3) * Math.PI * 2, 0.16)), false), ribbonMat);
    ribbons.renderOrder = 4;
    ribbons.position.set(HC[0], 0, HC[1]);
    live.add(ribbons);
  }
  // lo que vuela: tablas y tejas (un dibujo por material, instanciados)
  const [bx0, bz0, bx1, bz1] = isl.box;
  const cx = (bx0 + bx1 + 1) / 2;
  const cz = (bz0 + bz1 + 1) / 2;
  const R0 = Math.hypot(bx1 - bx0, bz1 - bz0) / 2;
  const N = 30;
  const bits = [
    { geo: new THREE.BoxGeometry(1.6, 0.06, 0.24), mat: new THREE.MeshStandardMaterial({ map: w.T.planks, color: 0xb89a74, roughness: 0.9 }) },
    { geo: new THREE.BoxGeometry(0.42, 0.05, 0.3), mat: new THREE.MeshStandardMaterial({ map: w.T.terracotta, color: 0xd07850, roughness: 0.8 }) },
  ];
  const flyers = [];
  for (const b of bits) {
    const im = new THREE.InstancedMesh(b.geo, b.mat, N);
    im.frustumCulled = false;
    im.castShadow = false;
    live.add(im);
    const orb2 = [];
    for (let k = 0; k < N; k++) {
      const high = rnd() < 0.3;
      // (lejos de la isla y de su roca, o bien arriba de lo más alto)
      const r = high ? R0 * 0.4 + rnd() * R0 * 0.6 : R0 + 10 + rnd() * 12;
      orb2.push({ r, a: rnd() * Math.PI * 2, w: (0.05 + rnd() * 0.07) * (high ? 1.4 : 1), h: high ? isl.top + 8 + rnd() * 10 : y - 14 + rnd() * 30, bob: rnd() * 6, ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), sp: 0.6 + rnd() * 1.6, s: 0.8 + rnd() * 0.8 });
    }
    flyers.push({ im, orb: orb2 });
  }
  w.root.add(live);
  LIVE = { w, eye, eyeMat, ribbons, flyers, orb, cx, cz, m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3() };
  update(0, 0);
}

// La cima: el piso de mosaico calcáreo (el material de los pisos de la torre,
// encima del de Levels: en Eclipse 'calcareo' es el mármol de la cripta del
// Monumento), la rosa de los vientos en el medio, y las paredes vestidas como
// las de los pisos de la torre: piedra de la torre por dentro (4 cm adelante),
// una arcada ciega con antepecho y la guarda de piedra clara arriba.
function cima(w, gb, k) {
  const Z = ZONES[k];
  const [x0, z0, x1, z1] = Z.rects[0];
  const fy = Z.y;
  const yf = fy + 0.012;
  gb.flat('marble', x0, z0, x1 + 1, z1 + 1, yf, true, 2);
  const cx = (x0 + x1 + 1) / 2;
  const cz = (z0 + z1 + 1) / 2;
  const h = Math.min(x1 - x0, z1 - z0) * 0.19;
  quad(gb, 'rosa', [[cx - h, yf + 0.006, cz + h], [cx + h, yf + 0.006, cz + h], [cx + h, yf + 0.006, cz - h], [cx - h, yf + 0.006, cz - h]], [0, 1, 0]);
  // (las UV de la rosa: el quad de monumentoKit las pone en metros; acá van de 0 a 1)
  const B = gb.bucket('rosa');
  const n = B.uv.length;
  B.uv.splice(n - 8, 8, 0, 0, 1, 0, 1, 1, 0, 1);
  // las caras de adentro de las paredes (si la cima quedó cerrada, como hoy)
  const O = 0.04;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= x0 && nx <= x1 && nz >= z0 && nz <= z1) continue;
        const j = w.idx(nx, nz);
        if (w.grid[j] !== 2 || w.edge[j] !== 0) continue;
        const top = w.top[j];
        const mx = x + 0.5 + dx * (0.5 - O);
        const mz = z + 0.5 + dz * (0.5 - O);
        const ax = mx - dz * 0.5;
        const az = mz + dx * 0.5;
        const bx = mx + dz * 0.5;
        const bz = mz - dx * 0.5;
        gb.wall('towerStone', ax, az, bx, bz, fy, top, [-dx, 0, -dz], 3.6, ax * dz - az * dx);
        // la guarda de arriba y el zócalo
        const nn = [-dx, -dz];
        const strip = (y0, y1, d, key) => {
          const p0 = [ax + nn[0] * 0.0, az + nn[1] * 0.0];
          const p1 = [bx, bz];
          bbox(gb, key, Math.min(p0[0], p1[0], p0[0] + nn[0] * d), y0, Math.min(p0[1], p1[1], p0[1] + nn[1] * d), Math.max(p0[0], p1[0], p0[0] + nn[0] * d), y1, Math.max(p0[1], p1[1], p0[1] + nn[1] * d), { b: 0.01, skip: ['bottom'] });
        };
        strip(top - 0.28, top - 0.02, 0.14, 'keyStone');
        strip(fy, fy + 0.3, 0.07, 'towerStone');
      }
    }
  }
  // la arcada ciega: un arco cada tres celdas en cada pared (lejos de puertas)
  const run = (axis, at, a0, a1, n) => {
    for (let a = a0 + 1; a + 2.4 <= a1; a += 3) {
      // (¿hay una puerta en la pared detrás?)
      let door = false;
      for (let t = a; t < a + 2.4; t++) {
        const cx2 = axis === 'x' ? Math.floor(t) : at;
        const cz2 = axis === 'x' ? at : Math.floor(t);
        if (w.inside(cx2, cz2) && w.grid[w.idx(cx2, cz2)] === 3) door = true;
      }
      if (door) continue;
      blindArchT(gb, axis, axis === 'x' ? (n > 0 ? at + 1 : at) : n > 0 ? at + 1 : at, n, a + 0.1, a + 2.3, fy + 0.95, fy + 3.1);
    }
  };
  run('x', z0 - 1, x0, x1 + 1, 1);
  run('x', z1 + 1, x0, x1 + 1, -1);
  run('z', x0 - 1, z0, z1 + 1, 1);
  run('z', x1 + 1, z0, z1 + 1, -1);
}

// Un arco ciego en la cara de adentro de la pared de la cima (como los vanos de
// los pisos de la torre): el fondo oscuro, el anillo de piedra clara, el antepecho.
// axis 'x': la cara corre a lo largo de x en z = f, mirando a n (±1 en z).
function blindArchT(gb, axis, f, n, a0, a1, yb, yt) {
  const r = (a1 - a0) / 2;
  const c = (a0 + a1) / 2;
  const ys = yt - r;
  const P = (a, yy, d) => (axis === 'x' ? [a, yy, f + n * d] : [f + n * d, yy, a]);
  const N = axis === 'x' ? [0, 0, n] : [n, 0, 0];
  const d0 = 0.05;
  quad(gb, 'black', [P(a0, yb, d0), P(a1, yb, d0), P(a1, ys, d0), P(a0, ys, d0)], N);
  const seg = 10;
  for (let k = 0; k < seg; k++) {
    const t0 = (k / seg) * Math.PI;
    const t1 = ((k + 1) / seg) * Math.PI;
    quad(gb, 'black', [P(c, ys, d0), P(c + Math.cos(t0) * r, ys + Math.sin(t0) * r, d0), P(c + Math.cos(t1) * r, ys + Math.sin(t1) * r, d0), P(c, ys, d0)], N);
    const R = r + 0.16;
    quad(gb, 'keyStone', [P(c + Math.cos(t0) * r, ys + Math.sin(t0) * r, 0.09), P(c + Math.cos(t0) * R, ys + Math.sin(t0) * R, 0.09), P(c + Math.cos(t1) * R, ys + Math.sin(t1) * R, 0.09), P(c + Math.cos(t1) * r, ys + Math.sin(t1) * r, 0.09)], N);
  }
  for (const a of [a0 - 0.16, a1]) {
    const [px0, , pz0] = P(a, 0, 0.05);
    const [px1, , pz1] = P(a + 0.16, 0, 0.2);
    bbox(gb, 'keyStone', Math.min(px0, px1), yb - 0.1, Math.min(pz0, pz1), Math.max(px0, px1), ys, Math.max(pz0, pz1), { b: 0.01 });
  }
  const [qx0, , qz0] = P(a0 - 0.2, 0, 0.05);
  const [qx1, , qz1] = P(a1 + 0.2, 0, 0.24);
  bbox(gb, 'keyStone', Math.min(qx0, qx1), yb - 0.12, Math.min(qz0, qz1), Math.max(qx0, qx1), yb, Math.max(qz0, qz1), { b: 0.02 });
}

// Los arcos sueltos (O9): un pedazo de la galería arrancado, inclinado, con dos
// arcos de ladrillo partidos, un pilar caído y piedras alrededor.
function arcosSueltos(w, mats, orbs) {
  const F = fragment(w, 'O9', { tilt: [-0.12, 0.6, 0.1], top: 'terracotta', thick: 3.6, seed: 23 });
  const gb = new GeoBuilder();
  const PW = 0.8;
  const SPR = 2.55;
  const TOP = 4.5;
  const L = Math.max(2.6, F.hz * 2 - 1.2);
  const z0 = -L / 2;
  const z1 = L / 2;
  for (const z of [z0, 0, z1]) {
    const tall = z === z1 ? SPR * 0.6 : TOP;
    bbox(gb, 'brick', -PW / 2, -0.4, z - PW / 2, PW / 2, tall, z + PW / 2, { b: 0.03, skip: ['bottom'] });
  }
  archSpan(gb, 'brick', 'terracotta', 'x', 0, z0 + PW / 2, -PW / 2, SPR, TOP, 0.62);
  // el segundo arco, partido: medio arco que se cortó
  const half = new GeoBuilder();
  archSpan(half, 'brick', 'terracotta', 'x', 0, PW / 2, z1 - PW / 2, SPR, TOP, 0.62);
  const hm = half.build(mats);
  hm.position.set(0.15, 0.9, 0.2);
  hm.rotation.set(0.25, 0, -0.18);
  F.g.add(hm);
  bbox(gb, 'terracotta', -0.45, TOP, z0 - 0.5, 0.45, TOP + 0.28, 0.5, { b: 0.04 });
  // un pilar caído, acostado en el pedazo
  bbox(gb, 'brick', 0.9, 0.0, -1.0, 1.7, 0.8, 1.6, { b: 0.03 });
  F.g.add(gb.build(mats));
  F.g.updateMatrixWorld(true);
  F.finish();
  const Z = ZONES.O9;
  orbs.push({ c: [F.g.position.x, Z.y + 2.5, F.g.position.z], r: [3.2, 5.4], h: 3.5, n: 8, s: [0.12, 0.3], sp: 0.3 });
}

// Rosa de los vientos en mosaico calcáreo (la de world/Tower.js, copiada).
function rosaTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#d8cdb8';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#6a2a1e';
  x.lineWidth = 18;
  x.strokeRect(14, 14, 484, 484);
  x.strokeStyle = '#2a3a4a';
  x.lineWidth = 6;
  x.strokeRect(34, 34, 444, 444);
  x.translate(256, 256);
  for (const [r, col] of [[210, '#e8dfcc'], [196, '#2a3a4a'], [188, '#e8dfcc']]) {
    x.fillStyle = col;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
  }
  const star = (n, R, r0, a0, c1, c2) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      for (const [s, col] of [[1, c1], [-1, c2]]) {
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        x.lineTo(Math.cos(a + (s * Math.PI) / n) * r0, Math.sin(a + (s * Math.PI) / n) * r0);
        x.closePath();
        x.fill();
      }
    }
  };
  star(8, 150, 38, Math.PI / 8, '#7a6a4a', '#a8946a');
  star(4, 184, 44, -Math.PI / 2, '#6a2a1e', '#8a3a28');
  x.fillStyle = '#c8a040';
  x.beginPath();
  x.arc(0, 0, 22, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#2a1a0e';
  x.font = 'bold 34px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('N', 0, -208 + 12);
  x.fillText('S', 0, 208 - 12);
  x.fillText('E', 208 - 12, 0);
  x.fillText('O', -208 + 12, 0);
  return toTexture(c, { repeat: false });
}

export function update(dt, t) {
  const L = LIVE;
  if (!L) return;
  const cam = L.w.g?.camera;
  if (cam && t > 0) {
    const dx = cam.position.x - L.cx;
    const dz = cam.position.z - L.cz;
    if (dx * dx + dz * dz > 150 * 150) return;
  }
  if (L.eyeMat) L.eyeMat.uniforms.uTime.value = t;
  if (GREEN) GREEN.uniforms.uTime.value = t;
  if (L.ribbons) L.ribbons.rotation.y = -t * 0.55;
  L.orb?.update(t);
  const { m, q, v, s } = L;
  for (const { im, orb } of L.flyers) {
    for (let k = 0; k < orb.length; k++) {
      const o = orb[k];
      const a = o.a + t * o.w;
      v.set(L.cx + Math.cos(a) * o.r, o.h + Math.sin(t * 0.7 + o.bob) * 0.8, L.cz + Math.sin(a) * o.r);
      q.setFromAxisAngle(o.ax, t * o.sp + o.bob);
      m.compose(v, q, s.setScalar(o.s));
      im.setMatrixAt(k, m);
    }
    im.instanceMatrix.needsUpdate = true;
  }
}

// Un vano de arco de medio punto en un muro de grosor T, sobre el eje `ax`
// ('z': el muro corre a lo largo de x en z = v; 'x': a lo largo de z en x = v),
// de s0 a s1, arrancando en ys y hasta yt arriba (enjutas, intradós y tapa).
function archSpan(gb, key, capKey, ax, v, s0, s1, ys, yt, T) {
  const r = (s1 - s0) / 2;
  const c = (s0 + s1) / 2;
  const seg = 12;
  const P = (s, yy, side) => (ax === 'z' ? [s, yy, v + side * T / 2] : [v + side * T / 2, yy, s]);
  const N = (side) => (ax === 'z' ? [0, 0, side] : [side, 0, 0]);
  for (let k = 0; k < seg; k++) {
    const a0 = Math.PI - (k / seg) * Math.PI;
    const a1 = Math.PI - ((k + 1) / seg) * Math.PI;
    const p0 = [c + Math.cos(a0) * r, ys + Math.sin(a0) * r];
    const p1 = [c + Math.cos(a1) * r, ys + Math.sin(a1) * r];
    for (const side of [-1, 1]) {
      // la enjuta: de la curva hasta arriba
      quad(gb, key, [P(p0[0], p0[1], side), P(p1[0], p1[1], side), P(p1[0], yt, side), P(p0[0], yt, side)], N(side));
    }
    // el intradós (la cara de abajo del arco)
    const mid = (k + 0.5) / seg;
    const am = Math.PI - mid * Math.PI;
    const n = ax === 'z' ? [-Math.cos(am), -Math.sin(am), 0] : [0, -Math.sin(am), -Math.cos(am)];
    quad(gb, capKey, [P(p0[0], p0[1], -1), P(p1[0], p1[1], -1), P(p1[0], p1[1], 1), P(p0[0], p0[1], 1)], n);
  }
  // la clave (una dovela de terracota arriba del arco, que sale 3 cm)
  const kt = 0.24;
  const ky = ys + r;
  if (ax === 'z') bbox(gb, capKey, c - kt / 2, ky - 0.05, v - T / 2 - 0.03, c + kt / 2, ky + 0.4, v + T / 2 + 0.03, { b: 0.02 });
  else bbox(gb, capKey, v - T / 2 - 0.03, ky - 0.05, c - kt / 2, v + T / 2 + 0.03, ky + 0.4, c + kt / 2, { b: 0.02 });
}

// Arco ciego sobre la pared del norte de la galería (plano z, mirando a +z):
// el fondo hundido (más oscuro) y el anillo de terracota.
function blindArch(gb, x0, x1, z, yb, yt) {
  const r = (x1 - x0) / 2;
  const c = (x0 + x1) / 2;
  const ys = yt - r;
  const seg = 10;
  const f = 0.16;
  // el fondo (brickSoot: el ladrillo tiznado de la torre)
  quad(gb, 'brickSoot', [[x0, yb, z], [x1, yb, z], [x1, ys, z], [x0, ys, z]], [0, 0, 1]);
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI;
    const a1 = ((k + 1) / seg) * Math.PI;
    quad(gb, 'brickSoot', [[c, ys, z], [c + Math.cos(a0) * r, ys + Math.sin(a0) * r, z], [c + Math.cos(a1) * r, ys + Math.sin(a1) * r, z], [c, ys, z]], [0, 0, 1]);
    quad(gb, 'terracotta', [[c + Math.cos(a0) * r, ys + Math.sin(a0) * r, z + 0.06], [c + Math.cos(a0) * (r + f), ys + Math.sin(a0) * (r + f), z + 0.06], [c + Math.cos(a1) * (r + f), ys + Math.sin(a1) * (r + f), z + 0.06], [c + Math.cos(a1) * r, ys + Math.sin(a1) * r, z + 0.06]], [0, 0, 1]);
  }
  // el antepecho del arco
  bbox(gb, 'terracotta', x0 - 0.05, yb - 0.12, z - 0.02, x1 + 0.05, yb + 0.02, z + 0.16, { b: 0.02, skip: ['-z'] });
}

// Un farol de hierro colgado de la cornisa, con su vidrio que brilla.
function lantern(gb, extra, x, y, z, top) {
  bbox(gb, 'iron', x - 0.012, y + 0.36, z - 0.012, x + 0.012, top, z + 0.012, { b: 0.004 });
  bbox(gb, 'iron', x - 0.16, y + 0.32, z - 0.16, x + 0.16, y + 0.38, z + 0.16, { b: 0.01 });
  bbox(gb, 'lantern', x - 0.12, y - 0.02, z - 0.12, x + 0.12, y + 0.32, z + 0.12, { b: 0.01 });
  bbox(gb, 'iron', x - 0.15, y - 0.06, z - 0.15, x + 0.15, y - 0.01, z + 0.15, { b: 0.01 });
  const cap = new THREE.ConeGeometry(0.2, 0.2, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(x, y + 0.48, z);
  extra.push([cap, 'iron']);
}

// El cañón de Obligado: tubo de bronce largo sobre una cureña de fortaleza,
// levantado y apuntando al eclipse (al norte, hacia arriba).
function canon(extra, mats, x, y, z) {
  const add = (geo, key) => extra.push([geo, key]);
  const box = (w, h, d, px, py, pz, key) => add(new THREE.BoxGeometry(w, h, d).translate(px, py, pz), key);
  // la cureña: dos gualderas, el travesaño, las ruedas de hierro
  for (const s of [-1, 1]) {
    const gual = new THREE.BoxGeometry(0.14, 0.62, 2.2);
    gual.translate(x + s * 0.42, y + 0.55, z + 0.15);
    add(gual, 'woodDark');
    for (const wz of [-0.6, 0.85]) {
      const wh = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18);
      wh.rotateZ(Math.PI / 2);
      wh.translate(x + s * 0.6, y + 0.32, z + wz);
      add(wh, 'iron');
    }
  }
  box(0.84, 0.16, 0.5, x, y + 0.32, z + 0.9, 'woodDark');
  box(0.84, 0.16, 0.4, x, y + 0.42, z - 0.6, 'woodDark');
  const axle = new THREE.CylinderGeometry(0.05, 0.05, 1.34, 8);
  axle.rotateZ(Math.PI / 2);
  for (const az of [-0.6, 0.85]) add(axle.clone().translate(x, y + 0.32, z + az), 'iron');
  // el tubo (perfil del cañón del castillo, más grande), levantado 34°
  const tube = lathe(
    [
      [0, -0.3], [0.06, -0.3], [0.08, -0.24], [0.05, -0.18], [0.05, -0.1], [0.22, -0.07], [0.28, 0], [0.28, 0.13], [0.255, 0.16],
      [0.25, 0.98], [0.276, 1.01], [0.276, 1.12], [0.235, 1.15], [0.22, 2.12], [0.24, 2.15], [0.24, 2.24], [0.205, 2.27],
      [0.19, 2.54], [0.235, 2.62], [0.235, 2.8], [0.125, 2.8], [0.125, 2.5],
    ],
    20,
  );
  const el = 0.6;
  tube.rotateX(-(Math.PI / 2 - el));
  tube.translate(x, y + 0.95, z + 0.55);
  add(tube, 'bronzeDark');
  const tr = new THREE.CylinderGeometry(0.07, 0.07, 0.96, 10);
  tr.rotateZ(Math.PI / 2);
  tr.translate(x, y + 0.95, z + 0.2);
  add(tr, 'bronzeDark');
}

// La pila de balas de hierro (tres pisos).
function balls(extra, x, y, z) {
  const geo = new THREE.SphereGeometry(0.11, 10, 8);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) extra.push([geo.clone().translate(x + (i - 1) * 0.22, y + 0.11, z + (j - 1) * 0.22), 'iron']);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) extra.push([geo.clone().translate(x + (i - 0.5) * 0.22, y + 0.265, z + (j - 0.5) * 0.22), 'iron']);
  extra.push([geo.clone().translate(x, y + 0.42, z), 'iron']);
}

// Una cinta en hélice (de radio r, de y0 a y1, `turns` vueltas), plana y angosta.
function helix(r, y0, y1, turns, a0, wd) {
  const n = Math.max(24, Math.round(turns * 40));
  const pos = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const P = (t, s) => {
      const a = a0 + t * turns * Math.PI * 2;
      const rr = r * (0.55 + 0.45 * t);
      return [Math.cos(a) * rr, y0 + (y1 - y0) * t + s * wd, Math.sin(a) * rr];
    };
    const A = P(t0, -1);
    const B = P(t1, -1);
    const C = P(t1, 1);
    const D = P(t0, 1);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

// El ojo del remolino: un remolino de luz dorada y verde (sin texturas;
// atan con el x corrido para que en el medio no dé NaN).
function swirlMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = clamp(length(p), 0.0, 1.0);
        float a = atan(p.y, p.x + 1e-4);
        float arms = 0.5 + 0.5 * sin(a * 3.0 + r * 10.0 - uTime * 2.4);
        float fine = 0.5 + 0.5 * sin(a * 7.0 - r * 16.0 + uTime * 3.1);
        float fall = 1.0 - r;
        float k = clamp(arms * fall * 1.1 + fine * fall * fall * 0.4 + fall * fall * fall * 0.9, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.82, 0.28), vec3(0.35, 1.0, 0.55), r);
        gl_FragColor = vec4(col * k * 1.5, 1.0);
      }`,
  });
}

// La llama del desgarro: la misma llama de planos del castillo, en verde agua.
let GREEN = null;
function greenFlame() {
  if (GREEN) return GREEN;
  const base = flameMaterial();
  GREEN = base.clone();
  GREEN.uniforms = { uTime: { value: 0 } };
  GREEN.fragmentShader = base.fragmentShader.replace('vec3 col = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.85, 0.45),', 'vec3 col = mix(vec3(0.2, 0.9, 0.6), vec3(0.75, 1.0, 0.9),');
  return GREEN;
}
