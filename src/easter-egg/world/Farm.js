import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { mesh, boxGeo, cylGeo } from './props';
import { rng } from '../core/noise';
import { MAP_W, MAP_H, WALL_H, ZONES, PROPS } from '../config/map';

// La granja: alambrados, el maíz de los bordes y todo lo de afuera (el
// maizal que la rodea, el camino de entrada con su cartel, postes de luz y el
// monte al fondo). La grilla y las colisiones las arma World; acá va lo que se ve.

const CELL_OUT = 0;
const CELL_FLOOR = 1;
const CELL_DOOR = 3;
const CELL_WINDOW = 4;
const EDGE_FENCE = 1;
const EDGE_CORN = 2;

// Camino de entrada (entre los tablones y los silos, hacia el norte).
const ROAD = { x0: 37.2, x1: 40.8, z1: 21 };

// Alambrado: postes de madera, dos travesaños y dos hilos de alambre.
export function buildFences(world) {
  const M = world.M;
  const gb = new GeoBuilder();
  const at = (x, z) => (world.inside(x, z) ? world.idx(x, z) : -1);
  const kind = (x, z) => {
    const i = at(x, z);
    if (i < 0) return null;
    const t = world.grid[i];
    if (t === CELL_OUT || t === CELL_FLOOR || world.edge[i] !== EDGE_FENCE) return null;
    return t === CELL_WINDOW || t === CELL_DOOR ? 'gap' : 'fence';
  };
  const rail = (ax, az, bx, bz, y, h, t, key) => {
    const x0 = Math.min(ax, bx) - (ax === bx ? t / 2 : 0);
    const x1 = Math.max(ax, bx) + (ax === bx ? t / 2 : 0);
    const z0 = Math.min(az, bz) - (az === bz ? t / 2 : 0);
    const z1 = Math.max(az, bz) + (az === bz ? t / 2 : 0);
    gb.box(key, x0, y - h / 2, z0, x1, y + h / 2, z1, 1);
  };
  // con alturas, el alambrado del barbacuá está arriba de la base de ladrillo
  const fyAt = (x, z) => (world.levels ? world.fy[world.idx(x, z)] : 0);
  const r = rng(91);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (kind(x, z) !== 'fence') continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const fy = fyAt(x, z);
      const lean = (r() - 0.5) * 0.04;
      gb.box('fenceDark', cx - 0.07 + lean, fy, cz - 0.07, cx + 0.07 + lean, fy + 1.34 + r() * 0.08, cz + 0.07, 1);
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const k = kind(x + dx, z + dz);
        if (!k) continue;
        // hasta el poste de al lado (una sola vez) o hasta el borde de la tranquera;
        // si el de al lado está a otra altura, cada uno pone su mitad
        const same = k === 'fence' && Math.abs(fyAt(x + dx, z + dz) - fy) < 0.05;
        if (same && (dx < 0 || dz < 0)) continue;
        const len = same ? 1 : 0.5;
        const bx = cx + dx * len;
        const bz = cz + dz * len;
        rail(cx, cz, bx, bz, fy + 0.58, 0.11, 0.05, 'fence');
        rail(cx, cz, bx, bz, fy + 1.12, 0.11, 0.05, 'fence');
        rail(cx, cz, bx, bz, fy + 0.32, 0.012, 0.012, 'iron');
        rail(cx, cz, bx, bz, fy + 0.86, 0.012, 0.012, 'iron');
      }
    }
  }
  world.root.add(gb.build(M));
  // el maíz de los bordes (el que rodea el prado) es una pared tupida
  const pts = [];
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = world.idx(x, z);
      if (world.grid[i] === CELL_OUT || world.grid[i] === CELL_FLOOR || world.grid[i] === CELL_DOOR || world.edge[i] !== EDGE_CORN) continue;
      for (let k = 0; k < 6; k++) pts.push([x + 0.1 + r() * 0.8, z + 0.1 + r() * 0.8, 0.95 + r() * 0.2]);
    }
  }
  world.root.add(cornMesh(world, pts));
}

// Maíz: tarjetas cruzadas instanciadas que se mecen con el viento.
export function cornMesh(world, pts, shadows = false) {
  const M = world.M;
  if (!world.cornU) {
    world.cornU = { value: 0 };
    M.corn.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = world.cornU;
      sh.vertexShader = `uniform float uWind;\n${sh.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sway = sin(uWind * 1.4 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.22) * 0.09 + sin(uWind * 3.1 + instanceMatrix[3].x) * 0.02;
        transformed.x += sway * uv.y * uv.y;
        transformed.z += sway * 0.6 * uv.y * uv.y;`,
      );
    };
  }
  const a = new THREE.PlaneGeometry(1.05, 2.7).translate(0, 1.35, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const geo = mergeTwo(a, b);
  const im = new THREE.InstancedMesh(geo, M.corn, pts.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const r = rng(pts.length + 7);
  pts.forEach(([x, z, h], i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI);
    s.set(0.9 + r() * 0.25, h, 1);
    p.set(x, 0, z);
    m4.compose(p, q, s);
    im.setMatrixAt(i, m4);
  });
  im.castShadow = shadows;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.attributes[name];
    const B = b.attributes[name];
    const arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array);
    arr.set(B.array, A.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const ia = a.index.array;
  const ib = b.index.array;
  const idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + a.attributes.position.count;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Afuera de la chacra: pasto, maizal, camino, cartel, postes y el monte.
export function buildFarmOutside(world) {
  const M = world.M;
  const T = world.T;
  T.grass.repeat.set(1, 1);
  const size = 260;
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / 3, (uv.getY(i) * size) / 3);
  const ground = new THREE.Mesh(g, M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, -0.01, MAP_H / 2);
  ground.receiveShadow = true;
  world.root.add(ground);

  // dónde no crece el maíz: la chacra y dos metros alrededor del alambrado
  const W = MAP_W;
  const H = MAP_H;
  const busy = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, z);
      const t = world.grid[i];
      if (t === CELL_OUT) continue;
      // el maíz del prado llega hasta su borde (ahí no hace falta dejar lugar)
      if (t !== CELL_FLOOR && world.edge[i] === EDGE_CORN) continue;
      if (t === CELL_FLOOR && ZONES[world.zoneKeys[world.zone[i]]].edge === 'corn') continue;
      busy[i] = 1;
    }
  }
  const clear = (x, z) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < W && nz < H && busy[nz * W + nx]) return false;
    }
    return true;
  };
  // (Personalizada: Game.tier('grass'), al armar el mapa)
  const low = (world.g.tier?.('grass') ?? world.g.settings?.quality) === 'perf';
  const r = rng(1234);
  const pts = [];
  const M0 = 24;
  const rowGap = low ? 1.5 : 1.05;
  const step = low ? 1.2 : 0.85;
  for (let z = -M0; z < H + M0; z += rowGap) {
    for (let x = -M0; x < W + M0; x += step) {
      const px = x + (r() - 0.5) * 0.35;
      const pz = z + (r() - 0.5) * 0.25;
      // el camino de entrada
      if (px > ROAD.x0 - 0.8 && px < ROAD.x1 + 0.8 && pz < ROAD.z1) continue;
      // la chacra y su borde
      const inGrid = px >= 0 && pz >= 0 && px < W && pz < H;
      if (inGrid && world.grid[world.idx(Math.floor(px), Math.floor(pz))] !== CELL_OUT) continue;
      if (!clear(px, pz)) continue;
      // de a ratos falta una planta (se ven los surcos)
      if (r() < 0.06) continue;
      pts.push([px, pz, 0.85 + r() * 0.3]);
    }
  }
  world.root.add(cornMesh(world, pts));

  // el camino de tierra hasta el horizonte
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD.x1 - ROAD.x0, ROAD.z1 + 80), M.dirt);
  road.rotation.x = -Math.PI / 2;
  road.position.set((ROAD.x0 + ROAD.x1) / 2, 0.004, (ROAD.z1 - 80) / 2);
  road.receiveShadow = true;
  world.root.add(road);
  // huellas de las ruedas
  for (const x of [ROAD.x0 + 1.1, ROAD.x1 - 1.1]) {
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(0.45, ROAD.z1 + 80), M.dirtDark);
    rut.rotation.x = -Math.PI / 2;
    rut.position.set(x, 0.008, (ROAD.z1 - 80) / 2);
    world.root.add(rut);
  }
  // portón con el cartel de la chacra
  const sign = new THREE.Group();
  sign.position.set((ROAD.x0 + ROAD.x1) / 2, 0, -3);
  for (const x of [-2.7, 2.7]) sign.add(mesh(cylGeo(0.14, 0.18, 4.2, 8), M.log, x, 2.1, 0));
  sign.add(mesh(boxGeo(6.2, 0.22, 0.22), M.log, 0, 4.0, 0));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 1, side: THREE.DoubleSide }));
  board.position.set(0, 3.45, 0);
  sign.add(board);
  for (const x of [-1.4, 1.4]) sign.add(mesh(cylGeo(0.008, 0.008, 0.4, 4), M.iron, x, 3.75, 0));
  // una tranquera vieja abierta, tirada al costado
  sign.add(mesh(boxGeo(2.4, 0.1, 0.06), M.woodDark, -3.9, 0.9, 0.7, 0, 0.8, 0.1));
  sign.add(mesh(boxGeo(2.4, 0.1, 0.06), M.woodDark, -3.9, 0.4, 0.7, 0, 0.8, 0.05));
  world.root.add(sign);
  // postes de luz a lo largo del camino (se recortan contra el atardecer)
  for (let i = 0; i < 6; i++) {
    const z = -8 - i * 14;
    const pole = new THREE.Group();
    pole.position.set(ROAD.x1 + 1.6, 0, z);
    pole.add(mesh(cylGeo(0.1, 0.14, 7.5, 7), M.log, 0, 3.75, 0, 0.03, 0, 0));
    pole.add(mesh(boxGeo(1.6, 0.1, 0.1), M.log, 0, 7.1, 0));
    world.root.add(pole);
    // cables hasta el siguiente
    for (const x of [-0.7, 0.7]) {
      const wire = mesh(cylGeo(0.012, 0.012, 14, 3), M.black, x, 6.7, -7, Math.PI / 2 + 0.03, 0, 0);
      pole.add(wire);
    }
  }
  // el monte al fondo, pasando el maizal
  const count = low ? 60 : 110;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.3, 1, 6), M.bark, count);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.leaf, count * 3);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  let k = 0;
  while (n < count) {
    const a = r() * Math.PI * 2;
    const d = 62 + r() * 40;
    const x = W / 2 + Math.cos(a) * d;
    const z = H / 2 + Math.sin(a) * d;
    if (Math.abs(x - (ROAD.x0 + ROAD.x1) / 2) < 6 && z < 0) continue;
    const h = 6 + r() * 8;
    p.set(x, h / 2, z);
    s.set(1 + r(), h, 1 + r());
    m4.compose(p, q, s);
    trunk.setMatrixAt(n, m4);
    for (let j = 0; j < 3; j++) {
      const cs = 2 + r() * 3;
      p.set(x + (r() - 0.5) * 3, h + (r() - 0.2) * 2, z + (r() - 0.5) * 3);
      s.set(cs, cs * 0.75, cs);
      m4.compose(p, q, s);
      crown.setMatrixAt(k++, m4);
    }
    n++;
  }
  world.root.add(trunk, crown);
  buildPens(world);
  buildBovedas(world);
  buildPajar(world);
  buildBarbacua(world);
}

// Techos de bóveda (PROPS 'boveda'): medio caño apoyado en las paredes, con
// el eje a lo largo del lado largo, las cabeceras, el alero con su tabla y
// (si tiene) la chimenea. El rancho lleva tejas y cabeceras de adobe; el
// granero (el establo) lleva chapa, sube las paredes de afuera hasta `base`
// (`band`: desde dónde), molduras blancas, un ojo de buey en cada cabecera
// y un alero de chapa sobre el anexo (`lean`). Es solo lo que se ve de
// afuera: adentro siguen los cielorrasos de siempre.
function buildBovedas(world) {
  const M = world.M;
  let tejas = null;
  const heads = {};
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.8 });
  for (const d of PROPS) {
    if (d.type !== 'boveda') continue;
    if (!tejas) {
      tejas = new THREE.MeshStandardMaterial({ map: tejasTexture(), roughness: 0.82, side: THREE.DoubleSide });
      tejas.bumpMap = tejas.map;
      tejas.bumpScale = 1.5;
    }
    const hk = d.head || 'adobe';
    if (!heads[hk]) {
      heads[hk] = M[hk].clone();
      heads[hk].side = THREE.DoubleSide;
    }
    const head = heads[hk];
    const roofMat = d.mat === 'tin' ? M.roofTin : tejas;
    const trim = d.trim === 'white' ? white : M.trim;
    const base = d.base ?? WALL_H;
    const [x0, z0, x1, z1] = d.rect;
    const alongX = d.axis ? d.axis === 'x' : x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const wide = alongX ? z1 - z0 : x1 - x0;
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const a0 = alongX ? x0 : z0;
    const ov = 0.35;
    const end = 0.25;
    const s = d.rise || 2;
    const span = wide + ov * 2;
    // el arco: un pedazo de círculo que pasa por los dos aleros y sube `rise`
    const R = (span * span) / 4 / (2 * s) + s / 2;
    const cy = base - 0.18 + s - R;
    const half = Math.asin(span / 2 / R);
    const segs = 20;
    const hAt = (v) => cy + Math.sqrt(Math.max(0, R * R - v * v));
    // a mundo: u a lo largo del eje, v de un alero al otro
    const P = (u, v, y) => (alongX ? [a0 + u, y, mid + v] : [mid + v, y, a0 + u]);
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = -half + (2 * half * i) / segs;
      const v = R * Math.sin(a);
      const y = cy + R * Math.cos(a);
      for (const u of [-end, len + end]) {
        pos.push(...P(u, v, y));
        uv.push(u / 1.5, (R * a) / 1.6);
      }
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // que la normal mire para arriba (la cara de las tejas)
    const n = geo.attributes.normal;
    if (n.getY(segs) < 0) {
      idx.reverse();
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    const roof = new THREE.Mesh(geo, roofMat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    world.root.add(roof);
    const g = new THREE.Group();
    // las cabeceras: el segmento de círculo entre la pared y el arco
    const sh = new THREE.Shape();
    const w2 = wide / 2;
    sh.moveTo(-w2, 0);
    for (let i = 0; i <= 16; i++) {
      const v = -w2 + (wide * i) / 16;
      sh.lineTo(v, hAt(v) - base + 0.02);
    }
    sh.lineTo(w2, 0);
    const shGeo = new THREE.ShapeGeometry(sh);
    for (const u of [0, len]) {
      const m = new THREE.Mesh(shGeo, head);
      const [px, , pz] = P(u, 0, 0);
      m.position.set(px, base, pz);
      m.rotation.y = alongX ? Math.PI / 2 : 0;
      g.add(m);
      // moldura siguiendo el arco
      for (let i = 0; i < 12; i++) {
        const va = -w2 + (wide * i) / 12;
        const vb = va + wide / 12;
        const ya = hAt(va);
        const yb = hAt(vb);
        const L = Math.hypot(vb - va, yb - ya);
        const [mx, , mz] = P(u + (u ? 0.04 : -0.04), (va + vb) / 2, 0);
        const bar = mesh(boxGeo(0.1, 0.1, L + 0.02), trim, mx, (ya + yb) / 2 + 0.03, mz, 0, 0, 0);
        const tilt = Math.atan2(yb - ya, vb - va);
        if (alongX) bar.rotation.set(-tilt, 0, 0);
        else {
          bar.rotation.set(0, Math.PI / 2, 0);
          bar.rotateX(-tilt);
        }
        g.add(bar);
      }
    }
    // el granero: las paredes de afuera suben hasta la bóveda, con molduras
    // blancas arriba y en las esquinas
    if (d.band != null) {
      const gb = new GeoBuilder();
      const off = 0.015;
      const xm = (x0 + x1) / 2;
      const zm = (z0 + z1) / 2;
      const sides = [
        [xm, z0 - off, x1 - x0, [0, -1]],
        [xm, z1 + off, x1 - x0, [0, 1]],
        [x1 + off, zm, z1 - z0, [1, 0]],
        [x0 - off, zm, z1 - z0, [-1, 0]],
      ];
      for (const [cx, cz, L, n] of sides) {
        // de izquierda a derecha mirando la cara desde afuera
        const rx = n[1];
        const rz = -n[0];
        gb.wall(hk, cx - (rx * L) / 2, cz - (rz * L) / 2, cx + (rx * L) / 2, cz + (rz * L) / 2, d.band, base, [n[0], 0, n[1]], WALL_H);
        g.add(mesh(n[0] ? boxGeo(0.06, 0.18, L + 0.1) : boxGeo(L + 0.1, 0.18, 0.06), white, cx + n[0] * 0.04, base - 0.12, cz + n[1] * 0.04));
      }
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) g.add(mesh(boxGeo(0.22, base, 0.22), white, cx, base / 2, cz));
      world.root.add(gb.build(M));
    }
    // ojo de buey en cada cabecera
    if (d.oculus) {
      const hole = new THREE.MeshBasicMaterial({ color: 0x07080c, side: THREE.DoubleSide });
      for (const u of [0, len]) {
        const [px, , pz] = P(u + (u ? 0.03 : -0.03), 0, 0);
        const ry = alongX ? Math.PI / 2 : 0;
        const oy = base + s * 0.42;
        g.add(mesh(new THREE.CircleGeometry(0.75, 20), hole, px, oy, pz, 0, ry, 0));
        g.add(mesh(new THREE.TorusGeometry(0.8, 0.07, 6, 24), white, px, oy, pz, 0, ry, 0));
        g.add(mesh(boxGeo(alongX ? 0.05 : 1.5, 0.07, alongX ? 1.5 : 0.05), white, px, oy, pz));
        g.add(mesh(boxGeo(alongX ? 0.05 : 0.07, 1.5, alongX ? 0.07 : 0.05), white, px, oy, pz));
      }
    }
    // alero de chapa sobre el anexo: de la pared alta hacia afuera
    if (d.lean) {
      const [lx0, lz0, lx1, lz1, yHi, yLo] = d.lean;
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute([lx0, yHi, lz0 - 0.3, lx0, yHi, lz1 + 0.3, lx1 + 0.4, yLo, lz1 + 0.3, lx1 + 0.4, yLo, lz0 - 0.3], 3));
      q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (lz1 - lz0) / 1.5, 0, (lz1 - lz0) / 1.5, (lx1 - lx0) / 1.6, 0, (lx1 - lx0) / 1.6], 2));
      q.setIndex([0, 1, 2, 0, 2, 3]);
      q.computeVertexNormals();
      const lean = new THREE.Mesh(q, M.roofTin);
      lean.castShadow = true;
      lean.receiveShadow = true;
      world.root.add(lean);
      g.add(mesh(boxGeo(0.05, 0.16, lz1 - lz0 + 0.6), M.woodDark, lx1 + 0.4, yLo - 0.08, (lz0 + lz1) / 2));
    }
    // la tabla del alero a los dos lados
    for (const v of [-span / 2, span / 2]) {
      const yv = cy + Math.sqrt(R * R - v * v);
      const [px, , pz] = P(len / 2, v * 0.995, 0);
      g.add(mesh(alongX ? boxGeo(len + end * 2, 0.16, 0.05) : boxGeo(0.05, 0.16, len + end * 2), M.woodDark, px, yv - 0.08, pz));
    }
    // chimenea de ladrillo con su sombrerete
    if (d.chimney) {
      const [hx, hz] = d.chimney;
      const v = alongX ? hz - mid : hx - mid;
      const top = hAt(v) + 1.1;
      g.add(mesh(boxGeo(0.62, top - base + 0.2, 0.62), M.brick, hx, (top + base - 0.2) / 2, hz));
      g.add(mesh(boxGeo(0.78, 0.07, 0.78), M.stoneDark, hx, top + 0.3, hz));
      for (const [sx, sz] of [[-0.27, -0.27], [0.27, -0.27], [-0.27, 0.27], [0.27, 0.27]]) g.add(mesh(boxGeo(0.07, 0.3, 0.07), M.brick, hx + sx, top + 0.13, hz + sz));
      g.add(mesh(boxGeo(0.4, 0.02, 0.4), M.black, hx, top - 0.01, hz));
      world.chimney = new THREE.Vector3(hx, top + 0.15, hz);
    }
    world.addStatic(g);
  }
}

// Tejas coloniales: canales de barro cocido que bajan por la bóveda, de a
// hileras encimadas, con alguna teja más oscura y verdín.
export function tejasTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const r = rng(77);
  ctx.fillStyle = '#4a2416';
  ctx.fillRect(0, 0, 256, 256);
  const cols = 6;
  const rows = 8;
  const cw = 256 / cols;
  const rh = 256 / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw;
      const y = j * rh;
      const tone = 0.75 + r() * 0.35;
      const base = [168 * tone, 82 * tone, 48 * tone];
      if (r() < 0.12) base[1] += 18;
      const gr = ctx.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, `rgb(${base[0] * 0.45},${base[1] * 0.45},${base[2] * 0.45})`);
      gr.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
      gr.addColorStop(0.6, `rgb(${base[0] * 1.08},${base[1] * 1.05},${base[2]})`);
      gr.addColorStop(1, `rgb(${base[0] * 0.4},${base[1] * 0.4},${base[2] * 0.4})`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 2);
      ctx.lineTo(x + cw - 2, y - 2);
      ctx.lineTo(x + cw - 2, y + rh - 6);
      ctx.quadraticCurveTo(x + cw / 2, y + rh + 4, x + 2, y + rh - 6);
      ctx.closePath();
      ctx.fill();
      // sombra de la hilera de abajo
      ctx.fillStyle = 'rgba(20,8,4,0.45)';
      ctx.fillRect(x + 4, y + rh - 4, cw - 8, 3);
      // verdín y manchas
      if (r() < 0.25) {
        ctx.fillStyle = `rgba(70,80,40,${0.15 + r() * 0.2})`;
        ctx.beginPath();
        ctx.arc(x + cw * r(), y + rh * r(), 4 + r() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// El pajar (PROPS 'pajar'), un ático arriba de los boxes: el piso y las
// paredes los arma Levels; acá, abajo, los boxes contra la cara del bloque
// (puertas partidas y parantes); arriba, las cabriadas a dos aguas, la boca
// del pajar vista de adentro (con luz entre las tablas) y telarañas; afuera,
// la boca en la pared del corral con la roldana para subir los fardos.
function buildPajar(world) {
  const M = world.M;
  for (const d of PROPS) {
    if (d.type !== 'pajar') continue;
    const [x0, z0, x1, z1] = d.rect;
    const y = d.y;
    const g = new THREE.Group();
    const r = rng(515);
    // la cara norte (mira a -z) y la oeste (mira a -x, debajo de la llegada de la escalera no)
    const faces = [
      { a: x0, b: x1, at: z0, n: [0, -1] },
      { a: z0 + 3, b: z1, at: x0, n: [-1, 0] },
    ];
    for (const f of faces) {
      const alongX = f.n[1] !== 0;
      const P = (s, h, off = 0) => (alongX ? [s, h, f.at + f.n[1] * (0.03 + off)] : [f.at + f.n[0] * (0.03 + off), h, s]);
      const box = (w, h, dep, key, s, hy, off = 0) => {
        const [px, py, pz] = P(s, hy, off);
        g.add(mesh(alongX ? boxGeo(w, h, dep) : boxGeo(dep, h, w), M[key] || M.woodDark, px, py, pz));
      };
      const post = (s) => {
        box(0.22, y, 0.22, 'log', s, y / 2, 0.1);
        const [px, , pz] = P(s, 0, 0.1);
        world.addBox([px - 0.11, 0, pz - 0.11, px + 0.11, y, pz + 0.11], { kind: 'prop' });
      };
      const n = Math.max(1, Math.round((f.b - f.a) / 3));
      const w = (f.b - f.a) / n;
      for (let i = 0; i < n; i++) {
        const s = f.a + w * (i + 0.5);
        // puerta partida: la de abajo cerrada con una cruz, la de arriba entreabierta
        box(w - 0.5, 1.25, 0.06, 'barn', s, 0.68);
        box(0.08, 1.5, 0.08, 'woodDark', s - (w - 0.6) / 2 + 0.1, 0.72, 0.03);
        const dl = Math.hypot(w - 0.7, 1.1);
        const [px, , pz] = P(s, 0, 0.05);
        for (const sg of [-1, 1]) {
          const brace = mesh(boxGeo(dl, 0.1, 0.04), M.woodDark, px, 0.68, pz);
          if (alongX) brace.rotation.set(0, 0, sg * Math.atan2(1.1, w - 0.7));
          else brace.rotation.set(sg * Math.atan2(1.1, w - 0.7), Math.PI / 2, 0);
          g.add(brace);
        }
        box(w - 0.5, 0.08, 0.1, 'woodDark', s, 1.33, 0.02);
        box(w - 0.6, 1.1, 0.04, 'black', s, 1.95, -0.01);
        // parante que sostiene el entrepiso
        post(f.a + w * i + (i ? 0 : 0.15));
      }
      post(f.b - 0.15);
      // viga del borde, contra el cielorraso del establo
      box(f.b - f.a, 0.26, 0.2, 'beam', (f.a + f.b) / 2, y - 0.14, 0.08);
    }
    // arriba: cabriadas a dos aguas bajo el techo, con la cumbrera a lo largo
    const top = d.roof || y + 2.6;
    const mz = (z0 + z1) / 2;
    const foot = y + 1.95;
    const half = (z1 - z0) / 2;
    const rl = Math.hypot(half, top - 0.12 - foot);
    const tilt = Math.atan2(top - 0.12 - foot, half);
    g.add(mesh(boxGeo(x1 - x0, 0.18, 0.16), M.beam, (x0 + x1) / 2, top - 0.1, mz));
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.4) {
      for (const sg of [-1, 1]) g.add(mesh(boxGeo(0.12, 0.14, rl), M.woodDark, x, (foot + top - 0.12) / 2, mz + (sg * half) / 2, sg * tilt, 0, 0));
    }
    for (const zz of [z0 + 0.08, z1 - 0.08]) g.add(mesh(boxGeo(x1 - x0, 0.14, 0.12), M.beam, (x0 + x1) / 2, foot - 0.05, zz));
    // la boca del pajar vista de adentro: dos hojas cerradas y luz entre las tablas
    const bx = d.door;
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.88, 1.95, 0.05), M.barn, bx + sx * 0.46, y + 1.0, z1 - 0.03));
    g.add(mesh(boxGeo(0.12, 0.12, 0.08), M.iron, bx, y + 1.0, z1 - 0.07));
    const crack = new THREE.MeshBasicMaterial({ color: 0xffc890, toneMapped: false });
    for (const [cx, cy, cw, ch] of [[0, 1.0, 0.015, 1.9], [-0.46, 1.98, 0.9, 0.012], [0.46, 1.98, 0.9, 0.012], [-0.3, 0.6, 0.012, 0.5], [0.52, 1.3, 0.012, 0.6]]) {
      g.add(mesh(new THREE.PlaneGeometry(cw, ch), crack, bx + cx, y + cy, z1 - 0.058, 0, Math.PI, 0));
    }
    // telarañas en los rincones de las cabriadas
    const web = new THREE.MeshBasicMaterial({ color: 0xd8d4cc, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    for (const [wx, wz, ry] of [[x0 + 0.05, z0 + 0.05, Math.PI / 4], [x1 - 0.05, z0 + 0.05, -Math.PI / 4], [x0 + 0.05, z1 - 0.05, (Math.PI * 3) / 4], [x1 - 0.05, z1 - 0.05, (-Math.PI * 3) / 4]]) {
      const t = new THREE.Mesh(new THREE.CircleGeometry(0.7, 3), web);
      t.position.set(wx, foot + 0.1, wz);
      t.rotation.set(0, ry, Math.PI / 2);
      world.root.add(t);
    }
    // la boca del pajar en la pared sur (la del corral), con la roldana
    // (un poco afuera: la pared del granero sube por delante de la de adentro)
    const oz = z1 + 1.04;
    g.add(mesh(boxGeo(1.9, 2.1, 0.04), M.black, bx, y + 1.25, oz + 0.005));
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.14, 2.3, 0.1), M.trim, bx + sx * 1.0, y + 1.25, oz + 0.05));
    g.add(mesh(boxGeo(2.2, 0.14, 0.12), M.trim, bx, y + 2.35, oz + 0.05));
    g.add(mesh(boxGeo(2.2, 0.12, 0.14), M.trim, bx, y + 0.18, oz + 0.07));
    // una hoja abierta contra la pared
    g.add(mesh(boxGeo(0.95, 2.05, 0.06), M.barn, bx - 1.55, y + 1.22, oz + 0.12, 0, 0.15, 0));
    // la viga de la roldana, la soga y el gancho
    g.add(mesh(boxGeo(0.16, 0.16, 1.5), M.log, bx, y + 2.42, oz + 0.7));
    g.add(mesh(cylGeo(0.12, 0.12, 0.05, 12), M.iron, bx, y + 2.27, oz + 1.35, 0, 0, Math.PI / 2));
    g.add(mesh(cylGeo(0.012, 0.012, 1.45, 4), M.rope, bx, y + 1.52, oz + 1.42));
    g.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10, Math.PI * 1.3), M.iron, bx, y + 0.78, oz + 1.42, 0, Math.PI / 2, 0));
    // paja colgando de la boca
    for (let k = 0; k < 14; k++) g.add(mesh(boxGeo(0.02, 0.4 + r() * 0.3, 0.02), M.hay, bx - 0.8 + r() * 1.6, y + 0.1, oz + 0.12, 0.3 + r() * 0.3, 0, (r() - 0.5) * 0.6));
    world.addStatic(g);
  }
}

// El barbacuá (PROPS 'barbacuaChacra': 'barbacua' es un prop del penal): la
// base de ladrillo y la baranda las arma Levels (es un desnivel); acá va el
// catre de palos donde se tiende la yerba,
// la boca del fuego abajo (las brasas las prende el easter egg), los postes,
// el techo de paja a dos aguas y el farol colgado de la cumbrera.
function buildBarbacua(world) {
  const M = world.M;
  for (const d of PROPS) {
    if (d.type !== 'barbacuaChacra') continue;
    const [x0, z0, x1, z1] = d.rect;
    const y = d.y;
    const g = new THREE.Group();
    const r = rng(333);
    // el catre: tacuaras a lo largo, sobre dos vigas
    for (let z = z0 + 0.12; z < z1; z += 0.2) g.add(mesh(cylGeo(0.035, 0.035, x1 - x0 - 0.1, 6), r() < 0.3 ? M.woodDark : M.log, (x0 + x1) / 2, y + 0.04, z, 0, 0, Math.PI / 2));
    // la boca del fuego, en la cara que mira a los tablones
    const mx = d.mouth;
    const mz = z1;
    g.add(mesh(boxGeo(1.2, 0.95, 0.05), M.black, mx, 0.48, mz + 0.01));
    g.add(mesh(boxGeo(1.6, 0.18, 0.18), M.stoneDark, mx, 1.02, mz + 0.06));
    for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.2, 1.0, 0.16), M.stoneDark, mx + sx * 0.7, 0.5, mz + 0.05));
    // hollín arriba de la boca
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    soot.position.set(mx, 1.9, mz + 0.012);
    world.root.add(soot);
    // leña apilada al costado
    for (let k = 0; k < 7; k++) g.add(mesh(cylGeo(0.07, 0.08, 0.9, 6), M.log, mx + 1.3 + (k % 3) * 0.17, 0.1 + Math.floor(k / 3) * 0.15, mz + 0.45, Math.PI / 2, 0.1 * r(), 0));
    world.addBox([mx + 1.05, 0, mz + 0.05, mx + 1.85, 0.4, mz + 0.9], { kind: 'prop' });
    // postes: los del fondo arriba de la base, los del frente clavados en el suelo
    const eave = y + 2.45;
    const ridge = y + 3.7;
    const nz = z0 - 0.3;
    const sz = z1 + 0.25;
    const xs = [x0 - 0.2, (x0 + x1) / 2, x1 + 0.2];
    for (const x of xs) {
      g.add(mesh(cylGeo(0.1, 0.12, eave - y, 7), M.log, x, (eave + y) / 2, nz));
      g.add(mesh(cylGeo(0.11, 0.13, eave, 7), M.log, x, eave / 2, sz));
      world.addBox([x - 0.13, 0, sz - 0.13, x + 0.13, eave, sz + 0.13], { kind: 'prop' });
      // tirante de lado a lado
      g.add(mesh(boxGeo(0.12, 0.14, sz - nz + 0.2), M.woodDark, x, eave - 0.05, (nz + sz) / 2));
    }
    const midZ = (nz + sz) / 2;
    g.add(mesh(boxGeo(x1 - x0 + 1.2, 0.16, 0.16), M.log, (x0 + x1) / 2, ridge - 0.25, midZ));
    for (const x of xs) g.add(mesh(cylGeo(0.06, 0.07, ridge - eave - 0.2, 6), M.log, x, (ridge + eave) / 2 - 0.15, midZ));
    // el techo de paja: dos faldones gruesos y la cumbrera
    const run = midZ - nz + 0.6;
    const rise = ridge - eave;
    const L = Math.hypot(run, rise);
    const tilt = Math.atan2(rise, run);
    for (const sg of [-1, 1]) {
      const cz = midZ + sg * (run / 2 - 0.05);
      const slab = mesh(boxGeo(x1 - x0 + 1.4, 0.28, L), M.straw, (x0 + x1) / 2, eave + rise / 2 - 0.05, cz, sg * tilt, 0, 0);
      g.add(slab);
      // el borde desflecado del alero
      for (let k = 0; k < 40; k++) {
        const x = x0 - 0.6 + r() * (x1 - x0 + 1.2);
        g.add(mesh(boxGeo(0.03, 0.22 + r() * 0.15, 0.03), M.hay, x, eave - 0.3 + r() * 0.05, midZ + sg * (run - 0.1), sg * 0.4, 0, (r() - 0.5) * 0.5));
      }
    }
    g.add(mesh(boxGeo(x1 - x0 + 1.5, 0.3, 0.5), M.hay, (x0 + x1) / 2, ridge + 0.02, midZ));
    // el farol colgado (la luz la pone LIGHTS)
    const fx = 33.8;
    const fz = 5.4;
    g.add(mesh(cylGeo(0.008, 0.008, ridge - 0.33 - (y + 2.42), 4), M.black, fx, (ridge - 0.33 + y + 2.42) / 2, fz));
    g.add(mesh(boxGeo(0.2, 0.03, 0.2), M.iron, fx, y + 2.4, fz));
    g.add(mesh(boxGeo(0.2, 0.03, 0.2), M.iron, fx, y + 2.1, fz));
    g.add(mesh(boxGeo(0.16, 0.28, 0.16), M.glassLamp, fx, y + 2.25, fz));
    world.addStatic(g);
    // las brasas de la boca: el easter egg las prende
    const embers = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    embers.position.set(mx, 0.3, mz + 0.03);
    world.root.add(embers);
    world.barbacua = { embers, mouth: new THREE.Vector3(mx, 0.4, mz + 0.3), deck: { x0, z0, x1, z1, y } };
  }
}

// El redondel de domar (PROPS con type 'redondel'): postes de palo a pique en
// ronda con tres travesaños, y en cada entrada dos postes altos con un travesaño
// arriba. Chocan cajitas chicas a lo largo del círculo; como la ronda no sigue
// la grilla, cada celda que tocan queda entera bloqueada para los zombies
// (navCell), así el campo de flujo no ve pasos por entre los palos.
function buildPens(world) {
  const M = world.M;
  const TAU = Math.PI * 2;
  for (const d of PROPS) {
    if (d.type !== 'redondel') continue;
    const [cx, cz] = d.pos;
    const R = d.r || 4;
    // 3.6 m de arco: deja tres celdas libres para pasar
    const half = (d.gate || 3.6) / 2 / R;
    const gates = (d.gates || []).map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
    const at = (a, r = R) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    // tramos de palo a pique: de una entrada a la siguiente
    const arcs = gates.length ? gates.map((a, i) => [a + half, (i + 1 < gates.length ? gates[i + 1] : gates[0] + TAU) - half]) : [[0, TAU]];
    const g = new THREE.Group();
    const r = rng(4242);
    const postGeo = cylGeo(0.085, 0.11, 1.6, 7);
    for (const [a0, a1] of arcs) {
      const n = Math.max(1, Math.ceil(((a1 - a0) * R) / 1.1));
      const posts = [];
      for (let i = 0; i <= n; i++) posts.push(a0 + ((a1 - a0) * i) / n);
      posts.forEach((a, i) => {
        const [x, z] = at(a);
        const edge = gates.length && (i === 0 || i === n);
        if (!edge) g.add(mesh(postGeo, M.log, x, 0.8, z, (r() - 0.5) * 0.05, r() * 3, (r() - 0.5) * 0.05));
        if (i === n) return;
        // travesaños entre este poste y el siguiente (cuerdas del círculo)
        const [x2, z2] = at(posts[i + 1]);
        const len = Math.hypot(x2 - x, z2 - z);
        const yaw = Math.atan2(-(z2 - z), x2 - x);
        for (const y of [0.45, 0.88, 1.3]) {
          const rail = mesh(cylGeo(0.045, 0.05, len + 0.12, 6), M.woodDark, (x + x2) / 2, y + (r() - 0.5) * 0.03, (z + z2) / 2, 0, yaw, Math.PI / 2);
          g.add(rail);
        }
      });
      // colisión: cajitas cada 28 cm a lo largo del tramo
      const steps = Math.ceil(((a1 - a0) * R) / 0.28);
      for (let i = 0; i <= steps; i++) {
        const [x, z] = at(a0 + ((a1 - a0) * i) / steps);
        world.addBox([x - 0.15, 0, z - 0.15, x + 0.15, 1.45, z + 0.15], { kind: 'fence', shoot: false, navCell: true });
      }
    }
    // las entradas: postes altos y el travesaño de arriba
    for (const a of gates) {
      const [xa, za] = at(a - half);
      const [xb, zb] = at(a + half);
      for (const [x, z] of [[xa, za], [xb, zb]]) g.add(mesh(cylGeo(0.12, 0.15, 2.5, 8), M.log, x, 1.25, z));
      const len = Math.hypot(xb - xa, zb - za);
      const yaw = Math.atan2(-(zb - za), xb - xa);
      g.add(mesh(cylGeo(0.1, 0.1, len + 0.5, 7), M.log, (xa + xb) / 2, 2.38, (za + zb) / 2, 0, yaw, Math.PI / 2));
    }
    world.addStatic(g);
    // la huella de los cascos, pegada al palo a pique
    const floor = new THREE.Mesh(new THREE.RingGeometry(R - 1.5, R - 0.15, 40), M.dirtDark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.006, cz);
    floor.receiveShadow = true;
    world.root.add(floor);
  }
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 104;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6a4a30';
  ctx.fillRect(0, 0, 512, 104);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(30,18,10,${0.15 + i * 0.03})`;
    ctx.fillRect(0, i * 21, 512, 2);
  }
  ctx.font = 'bold 58px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8d8b0';
  ctx.fillText('LA TAPERA', 256, 46);
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('chacra de los cuervos', 256, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
