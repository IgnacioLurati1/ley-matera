import * as THREE from 'three';
import GeoBuilder from '../GeoBuilder';
import { quad } from '../monumentoKit';
import { PAP as PAPDEF } from '../../config/map';
import { PORTALS, ISLANDS, RISERS } from '../../config/maps/eclipse';
import { keepOut } from './centro';
import { islandCells, rimWall, bake, rng, hash, riftMats, cluster, rockGeo, monoliths, softCracks } from './desgarro';
import { buildAbismoVida } from './abismoVida';

// La Disformidad (isla 'abismo', zona V; iteración 4, agente mundo). El usuario:
// "una dimensión violeta y negra, con cielo violeta y todo muy oscuro, donde se
// escuchan susurros por todos lados y tenés que caminar un camino hasta el pack
// a pava". Lo que se ve (el aire negro, el cielo y los susurros son de
// world/eclipseAtmos.js y world/papDesgarro.js):
//  - el camino: lajas de piedra negra arrancadas, unidas por cuellos y escalones
//    (el piso lo arma Levels; la roca de abajo, eclipseRock); el borde es un
//    cerco bajo de obsidiana rota, con lajas paradas y algún cristal;
//  - en el piso, grietas de luz violeta que corren a lo largo;
//  - a los costados, en la oscuridad: pedazos de piso que flotan y giran, más
//    arriba y más abajo, y lejos, monolitos con un ojo que mira el camino;
//  - al final, el altar: atrás del Pack-a-Pava un telón de cristales altos y dos
//    colmillos de obsidiana que se cierran arriba como un arco.
// globalThis.__mduNoAbismoArt: solo los bloques y la roca.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let LIVE = null;

export function build(w, g, isl) {
  if (globalThis.__mduNoAbismoArt === true) return;
  // (el Nudo, la zona central: lo que le da forma; va acá, una vez)
  try {
    if (ISLANDS.desgarro && globalThis.__mduNoNudoArt !== true) buildNudo(w, ISLANDS.desgarro);
  } catch (e) {
    console.error('El Nudo: no se armó', e);
  }
  const M = riftMats(w);
  const cells = islandCells(w, isl.zones);
  const { isFloor, rim } = cells;
  const rnd = rng(9137);
  const gb = new GeoBuilder();
  const [pcx, pcz] = PAPDEF.cell;
  const [pfx, pfz] = PAPDEF.face;
  const papY = PAPDEF.y ?? isl.y;
  const papC = [pcx + 0.5 + pfx * 1.2, pcz + 0.5 + pfz * 1.2];
  // las puntas de portal de esta isla (la marca del piso: nada encima)
  const ends = PORTALS.flatMap((p) => [p.a, p.b]).filter((e) => isFloor(Math.floor(e.pos[0]), Math.floor(e.pos[1])));
  const papBack = (cx, cz) => (pfz ? Math.abs(cz - (pcz + 0.5)) < 0.7 && cx > pcx - 2.5 && cx < pcx + 4.5 : Math.abs(cx - (pcx + 0.5)) < 0.7 && cz > pcz - 2.5 && cz < pcz + 4.5);

  // ---- el cerco: obsidiana rota, bajo y desparejo (atrás del Pack-a-Pava, al ras)
  rimWall(w, gb, cells, {
    key: 'rimStone',
    topKey: 'rimTop',
    under: 1.4,
    top: (cx, cz) => (papBack(cx, cz) ? 1.19 : 1.19 + 0.55 * hash(cx, cz, 41) * hash(cx * 0.3, cz * 0.3, 43)),
  });
  // lajas paradas y cristales sobre el cerco (pocos: que la oscuridad mande)
  const rocks = [];
  const crystals = [];
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  for (const c of rim.values()) {
    const cx = c.x + 0.5;
    const cz = c.z + 0.5;
    if (papBack(cx, cz)) continue;
    let ox = 0;
    let oz = 0;
    for (const [dx, dz] of DIRS) if (!isFloor(c.x + dx, c.z + dz) && !cells.isRim(c.x + dx, c.z + dz)) {
      ox += dx;
      oz += dz;
    }
    const L = Math.hypot(ox, oz) || 1;
    ox /= L;
    oz /= L;
    const h = hash(c.x, c.z, 51);
    if (h > 0.7) {
      const s = 0.35 + hash(c.x, c.z, 52) * 0.4;
      const tall = 1.2 + hash(c.x, c.z, 53) * 2.6;
      const geo = rockGeo(rnd, s, tall / s);
      qq.setFromEuler(new THREE.Euler(oz * 0.4, hash(c.x, c.z, 54) * 6, -ox * 0.4));
      mm.compose(new THREE.Vector3(cx + ox * 0.25, c.fy + 1.1 + tall * 0.35, cz + oz * 0.25), qq, new THREE.Vector3(1, 1, 1));
      geo.applyMatrix4(mm);
      rocks.push(geo);
    }
    if (h < 0.07) cluster(crystals, cx + ox * 0.3, c.fy + 1.2, cz + oz * 0.3, rnd, { n: 3, size: 0.45, dir: [ox, oz] });
  }

  // ---- el altar: el telón de cristales atrás de la máquina y el arco de colmillos
  for (const [t, s, n] of [[-2.4, 1.6, 5], [-0.8, 2.4, 7], [1.0, 2.8, 7], [2.8, 2.2, 6], [4.4, 1.5, 5]]) {
    const bx = pfz ? pcx + t : pcx + 0.5 - pfx * 0.3;
    const bz = pfz ? pcz + 0.5 - pfz * 0.3 : pcz + t;
    cluster(crystals, bx, papY + 1.1, bz, rnd, { n, size: s, dir: [-pfx, -pfz], lean: 0.3 });
  }
  for (const side of [-1, 1]) {
    // dos colmillos negros a los lados, que se inclinan hacia la máquina
    const geo = rockGeo(rnd, 0.9, 9);
    const bx = papC[0] + (pfz ? side * 4.6 : -pfx * 1.6);
    const bz = papC[1] + (pfx ? side * 4.6 : -pfz * 1.6);
    qq.setFromEuler(new THREE.Euler(pfx ? side * 0.32 : 0.12 * -pfz, 0.4 * side, pfz ? -side * 0.32 : 0.12 * pfx));
    mm.compose(new THREE.Vector3(bx, papY + 3.6, bz), qq, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mm);
    rocks.push(geo);
  }

  // ---- las grietas del piso: a lo largo del camino, de laja en laja
  const strips = [];
  const near = (x, z, r) => !isFloor(Math.floor(x + r), Math.floor(z)) || !isFloor(Math.floor(x - r), Math.floor(z)) || !isFloor(Math.floor(x), Math.floor(z + r)) || !isFloor(Math.floor(x), Math.floor(z - r));
  const busy = (x, z) => ends.some((e) => Math.hypot(x - e.pos[0] - e.face[0] * 0.9, z - e.pos[1] - e.face[1] * 0.9) < 2.6) || Math.hypot(x - papC[0], z - papC[1] - 3) < 10;
  const fyAt = (x, z) => w.floorAt(x, z) + 0.018;
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
      if (!isFloor(Math.floor(nx), Math.floor(nz)) || near(nx, nz, 0.3) || busy(nx, nz) || Math.abs(fyAt(nx, nz) - fyAt(px, pz)) > 0.05) break;
      const nw = Math.max(0.018, pw * (0.9 + rnd() * 0.08));
      strips.push([px, pz, nx, nz, -Math.sin(a), Math.cos(a), pw, nw, fyAt(px, pz)]);
      px = nx;
      pz = nz;
      pw = nw;
      left -= st;
      if (depth < 2 && rnd() < 0.18) crack(px, pz, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), left * 0.55, pw * 0.75, depth + 1);
    }
  };
  const [bx0, bz0, bx1, bz1] = cells.box;
  for (let k = 0; k < 220 && strips.length < 2600; k++) {
    const x = bx0 + rnd() * (bx1 - bx0 + 1);
    const z = bz0 + rnd() * (bz1 - bz0 + 1);
    if (!isFloor(Math.floor(x), Math.floor(z)) || near(x, z, 0.8) || busy(x, z)) continue;
    crack(x, z, rnd() * Math.PI * 2, 2 + rnd() * 5, 0.04 + rnd() * 0.04, 0);
  }
  let softG = null;
  if (globalThis.__mduOldCracks !== true) softG = softCracks(strips);
  else for (const [px, pz, nx, nz, ux, uz, pw, nw, fy] of strips) {
    const S = (k, yy) => [[px - ux * pw * k, yy, pz - uz * pw * k], [px + ux * pw * k, yy, pz + uz * pw * k], [nx + ux * nw * k, yy, nz + uz * nw * k], [nx - ux * nw * k, yy, nz - uz * nw * k]];
    quad(gb, 'crackLip', S(2.4, fy - 0.006), [0, 1, 0]);
    quad(gb, 'crack', S(1, fy), [0, 1, 0]);
  }
  const stat = bake(w, gb, M, [...rocks.map((gg) => [gg, 'obsidian']), ...crystals.map((gg) => [gg, 'crystal'])], { noShadow: ['crystal', 'crack', 'crackLip'], isla: 'abismo' });

  // ---- lejos, en la oscuridad: monolitos con un ojo que mira el camino
  const eyes = monoliths(w, isl, rnd);
  // (el grupo que arma monoliths es el último de w.root: se esconde de lejos con lo demás)
  const mono = w.root.children[w.root.children.length - 1];

  // ---- a los costados: pedazos de piso arrancados que flotan y giran
  const slabGeo = new THREE.BoxGeometry(1, 0.5, 1, 2, 1, 2);
  {
    // (los bordes rotos: los vértices de arriba y de abajo corridos al azar)
    const p = slabGeo.attributes.position;
    const r2 = rng(331);
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (0.8 + r2() * 0.4));
      p.setZ(i, p.getZ(i) * (0.8 + r2() * 0.4));
      p.setY(i, p.getY(i) + (r2() - 0.5) * 0.25);
    }
    slabGeo.computeVertexNormals();
  }
  const pts = [];
  const tries = rng(4242);
  for (let k = 0; k < 600 && pts.length < 46; k++) {
    const x = bx0 - 18 + tries() * (bx1 - bx0 + 36);
    const z = bz0 - 18 + tries() * (bz1 - bz0 + 36);
    // (ni encima del camino ni pegados: de 4 a 22 m del piso más cercano)
    let d = Infinity;
    for (let s = 0; s < 40; s++) {
      const a = (s / 40) * Math.PI * 2;
      for (const r of [2, 4, 7, 11, 16, 22]) {
        if (isFloor(Math.floor(x + Math.cos(a) * r), Math.floor(z + Math.sin(a) * r))) {
          d = Math.min(d, r);
          break;
        }
      }
    }
    if (d < 4 || d > 22) continue;
    if (isFloor(Math.floor(x), Math.floor(z))) continue;
    pts.push({ x, z, y: isl.y + (tries() - 0.45) * 16, s: 1.4 + tries() * 3.4, a: tries() * 6.28, sp: (tries() - 0.5) * 0.25, bob: tries() * 6.28, tilt: [(tries() - 0.5) * 0.9, (tries() - 0.5) * 0.9] });
  }
  const flo = new THREE.InstancedMesh(slabGeo, M.float, Math.max(1, pts.length));
  flo.name = 'abismoLajas';
  flo.frustumCulled = false;
  flo.castShadow = false;

  const root = new THREE.Group();
  root.name = 'eclipseAbismoLive';
  root.add(flo);
  // (las grietas suaves: se esconden con lo demás de la dimensión)
  if (softG) root.add(softG);
  w.root.add(root);
  // (sesión 1f: los pedazos de los mapas y los que esperan; world/eclipse/abismoVida.js)
  let vida = null;
  try {
    vida = buildAbismoVida(w, isl, cells, rng(7717));
  } catch (e) {
    console.error('La Disformidad: sin los pedazos', e);
  }
  LIVE = { w, root, stat, mono, flo, pts, eyes, vida, box: cells.box, y: isl.y, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() };
  update(0, 0);
}

export function update(dt, t) {
  const L = LIVE;
  if (!L) return;
  const cam = L.w.g?.camera?.position;
  const [x0, z0, x1, z1] = L.box;
  // (solo con la cámara allá: desde las islas no se ve nada de esto)
  const here = !cam || (cam.y > L.y - 30 && cam.x > x0 - 60 && cam.x < x1 + 60 && cam.z > z0 - 60 && cam.z < z1 + 60);
  L.root.visible = here;
  if (L.stat) L.stat.visible = here;
  if (L.mono) L.mono.visible = here;
  L.vida?.update(dt, t, here);
  if (!here && t > 0) return;
  if (L.eyes?.uniforms) L.eyes.uniforms.uTime.value = t;
  const { flo, pts, m, q, e, v, s } = L;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    e.set(p.tilt[0] + Math.sin(t * 0.3 + p.bob) * 0.08, p.a + t * p.sp, p.tilt[1]);
    q.setFromEuler(e);
    v.set(p.x, p.y + Math.sin(t * 0.4 + p.bob) * 0.6, p.z);
    m.compose(v, q, s.set(p.s, 1 + p.s * 0.15, p.s * (0.7 + 0.3 * Math.sin(p.bob))));
    flo.setMatrixAt(k, m);
  }
  flo.instanceMatrix.needsUpdate = true;
}

// El Nudo (la zona central, isla 'desgarro'; mundo, it. 4): la explanada grande
// tenía forma de potrero. Lo que le da forma:
//  - alrededor del portal negro, un anillo de colmillos de obsidiana que se abren
//    hacia afuera (cuatro entradas libres), con cristales al pie;
//  - peñascos negros grandes por la explanada, con su choque (arman pasillos) y
//    manojos de cristales violetas que les crecen;
//  - a cada portal de las islas, dos pilares de piedra que lo enmarcan.
// globalThis.__mduNoNudoArt: sin esto.
function buildNudo(w, isl) {
  const M = riftMats(w);
  const cells = islandCells(w, isl.zones);
  const { isFloor } = cells;
  const rnd = rng(5521);
  const rocks = [];
  const crystals = [];
  const mm = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const ee = new THREE.Euler();
  const ends = PORTALS.flatMap((p) => [p.a, p.b].map((e) => ({ ...e, def: p }))).filter((e) => isFloor(Math.floor(e.pos[0]), Math.floor(e.pos[1])));
  const dark = ends.find((e) => e.def.dark && !e.def.atajo);
  const out = keepOut();
  const box = (x0, y0, z0, x1, y1, z1) => w.addBox([x0, y0, z0, x1, y1, z1], { kind: 'prop' });
  const rock = (x, z, s, tall, tilt = 0.2, solid = true) => {
    const y = w.floorAt(x, z);
    const geo = rockGeo(rnd, s, tall / s);
    ee.set((rnd() - 0.5) * tilt, rnd() * 6.28, (rnd() - 0.5) * tilt);
    qq.setFromEuler(ee);
    mm.compose(new THREE.Vector3(x, y + tall * 0.42, z), qq, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mm);
    rocks.push(geo);
    // (el choque: la caja de adentro de la piedra, que no se vea aire entre la piedra y el que choca)
    if (solid) box(x - s * 0.62, y, z - s * 0.62, x + s * 0.62, y + tall * 0.8, z + s * 0.62);
    return y;
  };
  // ---- el anillo del portal negro: 10 colmillos a 6,5 m, con cuatro huecos
  if (dark) {
    const [cx, cz] = dark.pos;
    for (let k = 0; k < 12; k++) {
      // (los huecos: hacia los cuatro lados, donde se camina)
      if (k % 3 === 0) continue;
      const a = (k / 12) * Math.PI * 2 + 0.26;
      const r = 6.4 + rnd() * 0.8;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!isFloor(Math.floor(x), Math.floor(z)) || out(x, z, 0.6)) continue;
      const tall = 3.2 + rnd() * 3.4;
      const y = w.floorAt(x, z);
      const geo = rockGeo(rnd, 0.55 + rnd() * 0.3, tall / 0.6);
      // (se abren hacia afuera, como un cerco que reventó)
      ee.set(Math.sin(a) * 0.32, rnd() * 6.28, -Math.cos(a) * 0.32);
      qq.setFromEuler(ee);
      mm.compose(new THREE.Vector3(x, y + tall * 0.4, z), qq, new THREE.Vector3(1, 1, 1));
      geo.applyMatrix4(mm);
      rocks.push(geo);
      box(x - 0.4, y, z - 0.4, x + 0.4, y + tall * 0.7, z + 0.4);
      cluster(crystals, x - Math.cos(a) * 0.6, y, z - Math.sin(a) * 0.6, rnd, { n: 3, size: 0.7, dir: [-Math.cos(a), -Math.sin(a)] });
    }
  }
  // ---- peñascos por la explanada (lejos de portales, del anillo, de lo reservado y de los aparecidos)
  const [bx0, bz0, bx1, bz1] = cells.box;
  const placed = [];
  for (let t = 0; t < 900 && placed.length < 16; t++) {
    const x = bx0 + 3 + rnd() * (bx1 - bx0 - 6);
    const z = bz0 + 3 + rnd() * (bz1 - bz0 - 6);
    const s = 1.3 + rnd() * 1.6;
    const R = s + 1;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (!isFloor(Math.floor(x + Math.cos(a) * R), Math.floor(z + Math.sin(a) * R))) ok = false;
    }
    if (!ok || out(x, z, R)) continue;
    if (ends.some((e) => Math.hypot(x - e.pos[0], z - e.pos[1]) < (e.def.dark || e.def.big ? 11 : 6) + s)) continue;
    if ((RISERS || []).some((r) => Math.hypot(x - r.pos[0], z - r.pos[1]) < 2.5 + s)) continue;
    if (placed.some(([px, pz, ps]) => Math.hypot(x - px, z - pz) < ps + s + 5)) continue;
    // (no arriba de un desnivel: el piso parejo alrededor)
    const y0 = w.floorAt(x, z);
    if ([0, 1, 2, 3].some((k) => Math.abs(w.floorAt(x + Math.cos(k * 1.57) * s, z + Math.sin(k * 1.57) * s) - y0) > 0.05)) continue;
    placed.push([x, z, s]);
    const tall = s * (1.2 + rnd() * 1.6);
    rock(x, z, s, tall, 0.35);
    // un peñasco chico al lado y cristales al pie
    const a = rnd() * 6.28;
    rock(x + Math.cos(a) * (s + 0.6), z + Math.sin(a) * (s + 0.6), s * 0.45, s * 0.8, 0.5);
    cluster(crystals, x + Math.cos(a + 2) * (s * 0.9), y0, z + Math.sin(a + 2) * (s * 0.9), rnd, { n: 4 + Math.floor(rnd() * 4), size: 1 + rnd() * 1.2, dir: [Math.cos(a + 2), Math.sin(a + 2)] });
  }
  // ---- los portales de las islas: dos pilares que los enmarcan
  for (const e of ends) {
    if (e.def.dark) continue;
    const [px, pz] = e.pos;
    const sx = -e.face[1];
    const sz = e.face[0];
    const wide = e.def.big ? 6.8 : 3.4;
    for (const sg of [-1, 1]) {
      const x = px + sx * wide * sg - e.face[0] * 0.3;
      const z = pz + sz * wide * sg - e.face[1] * 0.3;
      if (!isFloor(Math.floor(x), Math.floor(z))) continue;
      const tall = (e.def.big ? 8 : 4.6) + rnd() * 1.2;
      const y = w.floorAt(x, z);
      const geo = rockGeo(rnd, 0.6, tall / 0.6);
      ee.set(sz * sg * 0.12, rnd() * 6.28, -sx * sg * 0.12);
      qq.setFromEuler(ee);
      mm.compose(new THREE.Vector3(x, y + tall * 0.4, z), qq, new THREE.Vector3(1, 1, 1));
      geo.applyMatrix4(mm);
      rocks.push(geo);
      box(x - 0.45, y, z - 0.45, x + 0.45, y + tall * 0.7, z + 0.45);
      cluster(crystals, x, y + tall * 0.15, z, rnd, { n: 3, size: 0.6 });
    }
  }
  if (rocks.length || crystals.length) bake(w, new GeoBuilder(), M, [...rocks.map((gg) => [gg, 'obsidian']), ...crystals.map((gg) => [gg, 'crystal'])], { noShadow: ['crystal'], isla: 'nudo' });
}
