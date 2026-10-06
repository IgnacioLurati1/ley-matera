import * as THREE from 'three';
import { MAP_W, ZONES } from '../../config/map';
import { DOORS, PORTALS } from '../../config/maps/eclipse';
import { mesh, cylGeo, boxGeo, buildProp } from '../props';
import GeoBuilder from '../GeoBuilder';
import { rng } from '../../core/noise';
import { addGrassPush, makeGrassPush } from '../../fx/grassPush';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { keepOut, zoneAtCell, onFloor, spot, put, addFixed, inst, crossGeo, tuftMat, cutToGbuf, zbox, zat, lightTag, grime, orbiters, fragment, wallCrack, curbs, curbMats, cliffRocks, CLIFFS, wallSpots, farolAt, paloFence, crackMat, portalOrbs, FOOT, FLOOR, OUT, DOOR, EDGE_FENCE, EDGE_CORN, buildArch, mergeGeos, detailCuller } from './centro';
import { winMats, windowAt, gable } from './molino';

// La Tapera, al atardecer (isla "tapera" de Eclipse Matero, layout v4), lo que
// no sale del armado en bloques:
//  · el establo colorado con su techo curvo de chapa (la bóveda de la granja),
//    las cabeceras de tablas con molduras blancas, la puerta del pajar con su
//    viga, el ojo de buey; ventanas encendidas; adentro boxes, fardos, la
//    carreta, monturas, herramientas;
//  · la casa de la tapera: adobe, techo de chapa a dos aguas (un pedazo
//    levantado), la cocina con su fogón, la mesa, las camas, el ropero;
//  · el corral: el cerco de palo en todo el borde (que en la punta del vacío se
//    levanta y se enrosca), el corral chico, la torre del molino de viento
//    quebrada (la cabeza flota suelta: I9), el tanque australiano, el tractor,
//    el gallinero, el tendedero, el arado, el silo reventado, rollos y fardos;
//  · el maizal: maíz alto (más que uno) que se abre al pasar (fx/grassPush),
//    sendas a las puertas y al portal, el espantapájaros quieto; sin luces ni
//    brillos adentro (nada que guíe);
//  · el yerbal: hileras de plantas de yerba, la ramada con raídos y el farol.
// Todo sale de ZONES/LIGHTS del config (nada fijo).

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let live = null;

export function build(w, g, isl) {
  // (globalThis.__mduNoArteA: las islas de arte-A en bloques, para comparar)
  if (globalThis.__mduNoArteA === true) return;
  const M = w.M;
  const r = rng(6301);
  // (los anclajes del easter egg: la hoja en el medio del establo, la Yerba Madre en el maizal)
  const hoja = zat('H', 0.5, 0.5, true);
  const yerba = ANCHORS?.yerba ? [ANCHORS.yerba.x, ANCHORS.yerba.z] : zat('I', 0.5, 0.5, true);
  const out = keepOut([[hoja[0], hoja[1], 1.4], [yerba[0], yerba[1], 2.2]]);
  const gb = new GeoBuilder();
  const root = new THREE.Group();
  root.name = 'eclipse:tapera';
  const mats = { ...winMats(M), ...cornMats(w) };
  const orbs = [];
  live = { w, push: null, lifted: [] };
  CLIFFS.length = 0;
  buildBarn(w, gb, root, r, out);
  buildCasa(w, gb, root, r, out, orbs);
  buildCorral(w, gb, root, r, out, orbs);
  buildMaizal(w, root, r, out, yerba);
  buildYerbal(w, gb, root, r, out);
  buildMolinoSuelto(w, r, orbs);
  // los cordones de las barandas (piedra) salvo los del cerco y del maíz, que tapan los suyos
  curbs(w, 'tapera', gb, (i) => w.edge[i] === EDGE_FENCE || w.edge[i] === EDGE_CORN);
  cliffRocks(w, root, out, r, 'tapera');
  // (lo que flota: no en el maizal, ni cerca)
  portalOrbs('tapera', orbs);
  live.orb = orbiters(w, orbs.filter((o) => zoneAtCell(w, o.c[0], o.c[2]) !== 'I'), { seed: 63 });
  const arch = buildArch(gb, { ...M, ...mats, ...curbMats(w) }, 'eclipse:tapera:establo', w);
  w.root.add(arch, root);
  const gr = grime(w, 'tapera', { seed: 6401, damp: 0.14, moss: 0.22, rust: 0.06, mud: 0.07, puddles: 9, out, keys: ['G', 'H', 'H2', 'G3'] });
  live.cull = detailCuller(w, 'tapera', [...root.children.filter((o) => o.userData.detail), ...gr.children]);
}

// El maíz de la granja (en Eclipse M.corn es el junco del estero: este es el
// de la granja, con su textura), con viento y que se aparta al pasar.
let CORN = null;
function cornMats(w) {
  const m = new THREE.MeshStandardMaterial({ map: w.T.corn, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xd8c890 });
  addGrassPush(m);
  cutToGbuf(m);
  CORN = { taperaCorn: m };
  return CORN;
}

// Las celdas de borde con ese tipo que tocan esa zona: [x, z, índice].
function edgeCells(w, kind, key) {
  const kid = w.zoneKeys.indexOf(key);
  const out = [];
  const [x0, z0, x1, z1] = zbox(key);
  for (let z = z0 - 2; z <= z1 + 1; z++) {
    for (let x = x0 - 2; x <= x1 + 1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] === OUT || w.grid[i] === FLOOR || w.grid[i] === DOOR || w.edge[i] !== kind) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.grid[i + dx + dz * MAP_W] === FLOOR && w.zone[i + dx + dz * MAP_W] === kid) near = true;
      if (near) out.push([x, z, i]);
    }
  }
  return out;
}

// Un farol de pared (la luz `L` de las .py): la ménsula de hierro desde la
// pared (hacia n) y el farolito colgado.
function wallLamp(w, g, L, n) {
  if (!L) return;
  const M = w.M;
  const [lx, ly, lz] = L.pos;
  const [nx, nz] = n;
  const d = 0.4;
  g.add(mesh(boxGeo(nx ? d : 0.05, 0.05, nz ? d : 0.05), M.iron, lx - nx * d * 0.5, ly + 0.2, lz - nz * d * 0.5));
  g.add(mesh(boxGeo(0.16, 0.22, 0.16), M.glassLamp, lx, ly, lz));
  g.add(mesh(new THREE.ConeGeometry(0.14, 0.1, 4), M.iron, lx, ly + 0.16, lz, 0, Math.PI / 4, 0));
}

// ---------------- el establo colorado ----------------
function buildBarn(w, gb, root, r, out) {
  const M = w.M;
  const H = ZONES.H;
  const K = ['H'];
  const base = H.roof;
  const [hx0, hz0, hx1, hz1] = zbox('H', true);
  // (el rectángulo de afuera de las paredes)
  const x0 = hx0 - 1;
  const z0 = hz0 - 1;
  const x1 = hx1 + 1;
  const z1 = hz1 + 1;
  const rise = 4.2;
  const g = new THREE.Group();
  const white = winMats(M).whiteTrim;
  // la bóveda: un pedazo de círculo de alero a alero, cumbrera a lo largo de z
  const ov = 0.4;
  const end = 0.3;
  const span = x1 - x0 + ov * 2;
  const R = (span * span) / 4 / (2 * rise) + rise / 2;
  const mid = (x0 + x1) / 2;
  const cy = base - 0.2 + rise - R;
  const half = Math.asin(span / 2 / R);
  const segs = 24;
  const hAt = (v) => cy + Math.sqrt(Math.max(0, R * R - v * v));
  for (let i = 0; i < segs; i++) {
    const a0 = -half + (2 * half * i) / segs;
    const a1 = -half + (2 * half * (i + 1)) / segs;
    const xa = mid + R * Math.sin(a0);
    const ya = cy + R * Math.cos(a0);
    const xb = mid + R * Math.sin(a1);
    const yb = cy + R * Math.cos(a1);
    const am = (a0 + a1) / 2;
    const n = [Math.sin(am), Math.cos(am), 0];
    gb.quad('roofTin', [xa, ya, z1 + end], [xb, yb, z1 + end], [xb, yb, z0 - end], [xa, ya, z0 - end], n, [0, (R * a0) / 1.6], [0, (R * a1) / 1.6], [(z1 - z0 + 2 * end) / 1.5, (R * a1) / 1.6], [(z1 - z0 + 2 * end) / 1.5, (R * a0) / 1.6]);
    // (de abajo, la cara de adentro de la chapa: del alero se veía el cielo)
    gb.quad('roofTin', [xa, ya - 0.04, z0 - end], [xb, yb - 0.04, z0 - end], [xb, yb - 0.04, z1 + end], [xa, ya - 0.04, z1 + end], [-n[0], -n[1], 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  }
  // las cabeceras: el segmento entre la pared y el arco, de tablas coloradas
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    const n = [0, 0, s];
    const k = 16;
    for (let i = 0; i < k; i++) {
      const va = -(x1 - x0) / 2 + ((x1 - x0) * i) / k;
      const vb = va + (x1 - x0) / k;
      const A = [mid + va, base, z];
      const B = [mid + vb, base, z];
      const C = [mid + vb, hAt(vb) + 0.02, z];
      const D = [mid + va, hAt(va) + 0.02, z];
      const uv = (p) => [p[0] / 2, p[1] / 3.6];
      if (s > 0) gb.quad('barn', A, B, C, D, n, uv(A), uv(B), uv(C), uv(D));
      else gb.quad('barn', B, A, D, C, n, uv(B), uv(A), uv(D), uv(C));
      const L = Math.hypot(vb - va, hAt(vb) - hAt(va));
      g.add(mesh(boxGeo(L + 0.03, 0.12, 0.08), white, mid + (va + vb) / 2, (hAt(va) + hAt(vb)) / 2 + 0.02, z + s * 0.045, 0, 0, Math.atan2(hAt(vb) - hAt(va), vb - va)));
    }
    g.add(mesh(boxGeo(x1 - x0 + 0.1, 0.16, 0.07), white, mid, base + 0.02, z + s * 0.04));
  }
  // las esquinas blancas del establo, de la roca al alero
  for (const [cx, cz] of [[x0, z0], [x1, z0]]) g.add(mesh(boxGeo(0.24, base - H.y + 0.3, 0.24), white, cx, (base + H.y - 0.3) / 2, cz));
  for (const v of [-span / 2, span / 2]) g.add(mesh(boxGeo(0.06, 0.18, z1 - z0 + end * 2), M.woodDark, mid + v * 0.995, hAt(v * 0.995) - 0.06, (z0 + z1) / 2));
  // la puerta del pajar en la cabecera del corral (norte): tablas, la cruz blanca y la viga del aparejo
  {
    const z = z0 - 0.04;
    const py = base + 1.35;
    gb.box('barn', mid - 1.1, py - 1.0, z - 0.06, mid + 1.1, py + 1.0, z, 1);
    for (const [ax, ay, bx2, by] of [[-1.1, -1, 1.1, 1], [-1.1, 1, 1.1, -1]]) {
      const L = Math.hypot(bx2 - ax, by - ay);
      g.add(mesh(boxGeo(L, 0.1, 0.05), white, mid, py, z - 0.09, 0, 0, Math.atan2(by - ay, bx2 - ax)));
    }
    for (const [dx, dy, wd, ht] of [[0, 1.0, 2.3, 0.12], [0, -1.0, 2.3, 0.12], [-1.1, 0, 0.12, 2.1], [1.1, 0, 0.12, 2.1]]) g.add(mesh(boxGeo(wd, ht, 0.06), white, mid + dx, py + dy, z - 0.09));
    g.add(mesh(boxGeo(0.18, 0.18, 1.4), M.woodDark, mid, py + 1.55, z - 0.6));
    g.add(mesh(cylGeo(0.12, 0.12, 0.06, 10), M.iron, mid, py + 1.38, z - 1.15, 0, 0, Math.PI / 2));
    g.add(mesh(cylGeo(0.012, 0.012, 2.6, 4), M.rope, mid, py + 0.1, z - 1.15));
  }
  // el ojo de buey en la cabecera del sur (arriba del techo de la casa)
  {
    const z = z1 + 0.035;
    const oy = base + rise * 0.48;
    const hole = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    g.add(mesh(new THREE.CircleGeometry(0.7, 20), hole, mid, oy, z));
    g.add(mesh(new THREE.TorusGeometry(0.76, 0.07, 6, 24), white, mid, oy, z + 0.01));
    g.add(mesh(boxGeo(1.4, 0.07, 0.05), white, mid, oy, z + 0.02));
    g.add(mesh(boxGeo(0.07, 1.4, 0.05), white, mid, oy, z + 0.02));
  }
  // los faroles de las puertas (sus luces: tapera.py) en la pared
  wallLamp(w, g, lightTag('farolEstablo'), [0, -1]);
  wallLamp(w, g, lightTag('farolMaizal'), [1, 0]);
  addFixed(w, g);
  // ventanas: encendidas de afuera, la noche de adentro
  const o = { w: 0.9, h: 1.0, sill: 1.45 };
  for (const side of ['n', 'o', 'e']) {
    for (const [x, z, n] of wallSpots(w, 'H', side, 4, 2)) {
      windowAt(gb, 'winLit', 'whiteTrim', x, z, n, H.y, o);
      windowAt(gb, 'winNight', 'woodDark', x - n[0], z - n[1], [-n[0], -n[1]], H.y, o);
    }
  }
  // ---- adentro ----
  const P = [
    // los boxes contra la pared del este (la del maizal), la carreta en el medio del fondo
    [0.68, 0.1, { type: 'stall', rot: 0 }, 1.2],
    [0.8, 0.1, { type: 'stall', rot: 0 }, 1.2],
    [0.92, 0.1, { type: 'stall', rot: 0 }, 1.2],
    [0.06, 0.12, { type: 'hay', rot: Math.PI / 2 }, 0.8],
    [0.06, 0.88, { type: 'hay', rot: Math.PI / 2 }, 0.8],
    [0.2, 0.92, { type: 'hay', rot: 0 }, 0.8],
    [0.62, 0.92, { type: 'hay', rot: 0.05 }, 0.8],
    [0.76, 0.92, { type: 'hay', rot: -0.05 }, 0.8],
    [0.18, 0.5, { type: 'cart', rot: Math.PI / 2 }, 1.4],
    [0.16, 0.1, { type: 'saddle', rot: 0.2 }, 0.5],
    [0.26, 0.1, { type: 'saddle', rot: -0.1 }, 0.5],
    [0.9, 0.42, { type: 'milkcans', rot: 0.3 }, 0.6],
    [0.7, 0.66, { type: 'barrow', rot: 0.6 }, 0.9],
    [0.92, 0.7, { type: 'rollo', rot: 0.2 }, 0.8],
  ];
  for (const [u, v, def, rad] of P) {
    const [x, z] = zat('H', u, v, true);
    const p = spot(w, out, K, x, z, rad, 1.6);
    if (p) put(w, { ...def, pos: p });
  }
  // las herramientas colgadas en la pared del oeste
  {
    const p = spot(w, out, K, hx0 + 0.1, hz0 + (hz1 - hz0) * 0.75, 0.3, 2);
    if (p) put(w, { type: 'toolrack', pos: [hx0 + 0.03, p[1]], rot: Math.PI / 2 }, { boxes: false });
  }
  // fardos de más arriba (una segunda pila, apoyada en la de abajo)
  for (const [u, v] of [[0.06, 0.12], [0.06, 0.88]]) {
    const [x, z] = zat('H', u, v, true);
    if (!out(x, z, 0.8) && onFloor(w, x, z, 0.7, K)) put(w, { type: 'hay', pos: [x, z], rot: Math.PI / 2, y: H.y + 1.0 }, { boxes: false, foot: false });
  }
  void root;
  void r;
}

// ---------------- la casa de la tapera ----------------
function buildCasa(w, gb, root, r, out, orbs) {
  const M = w.M;
  const Z = ZONES.H2;
  const K = ['H2'];
  const y = Z.y;
  const [x0, z0, x1, z1] = zbox('H2', true);
  // el techo: chapa oxidada a dos aguas, cumbrera a lo largo de x; un pedazo del
  // faldón sur levantado y torcido, con la raja de luz abajo (la disformidad)
  const G = gable(gb, 'rust', 'adobe', [x0 - 1, z0 - 1, x1 + 1, z1 + 1], Z.roof, 2.2, 'x', 0.4);
  {
    const lx = x0 + (x1 - x0) * 0.72;
    const lz = (G.vm + z1 + 1) / 2;
    const slope = Math.atan(2.2 / G.half);
    const c = mesh(new THREE.PlaneGeometry(3.4, 1.6), crackMat(), lx, Z.roof + 1.15, lz, -Math.PI / 2 - slope, 0, 0);
    c.renderOrder = 2;
    root.add(c);
    const sheet = mesh(boxGeo(3.6, 0.04, 2.0), M.rust, lx + 0.3, Z.roof + 3.1, lz + 0.4, -0.5, 0.25, 0.3);
    sheet.castShadow = true;
    root.add(sheet);
    live.lifted.push({ m: sheet, y: sheet.position.y, p: 1.3 });
    orbs.push({ c: [lx, Z.roof + 2.6, lz], r: [1.2, 2.4], h: 1.6, n: 6, s: [0.05, 0.14], sp: 0.32 });
  }
  // ventanas al vacío y al yerbal
  const o = { w: 0.8, h: 1.0, sill: 1.1 };
  for (const side of ['o', 's', 'e']) {
    for (const [x, z, n] of wallSpots(w, 'H2', side, 4, 2)) {
      windowAt(gb, 'winLit', 'woodDark', x, z, n, y, o);
      windowAt(gb, 'winNight', 'woodDark', x - n[0], z - n[1], [-n[0], -n[1]], y, o);
    }
  }
  // la cocina (al oeste): el fogón de barro con la olla, el estante de ollas; la mesa
  // con sus sillas en el medio; las camas, el ropero y el baúl (al este)
  const P = [
    [0.08, 0.14, { type: 'stove', rot: 0 }, 0.8],
    [0.06, 0.5, { type: 'cabinet', rot: Math.PI / 2 }, 0.5],
    [0.36, 0.48, { type: 'table', rot: Math.PI / 2 }, 1.1],
    [0.84, 0.14, { type: 'bed', rot: Math.PI / 2 }, 1.1],
    [0.84, 0.48, { type: 'bed', rot: Math.PI / 2 }, 1.1],
    [0.96, 0.82, { type: 'wardrobe', rot: -Math.PI / 2 }, 0.8],
    [0.62, 0.86, { type: 'chest', rot: Math.PI }, 0.6],
    [0.52, 0.2, { type: 'rocker', rot: 0.6 }, 0.5],
    [0.2, 0.86, { type: 'washtub' }, 0.6],
    [0.6, 0.5, { type: 'rug', rot: 0 }, 0.3],
  ];
  for (const [u, v, def, rad] of P) {
    const [x, z] = zat('H2', u, v, true);
    const p = spot(w, out, K, x, z, rad, 1.6);
    if (!p) continue;
    put(w, { ...def, pos: p }, { boxes: def.type !== 'rug' });
    if (def.type === 'table') for (const [dx, dz, a] of [[-0.75, 0, Math.PI / 2], [0.75, 0, -Math.PI / 2], [0, 1.1, Math.PI]]) if (!out(p[0] + dx, p[1] + dz, 0.3)) put(w, { type: 'chair', pos: [p[0] + dx, p[1] + dz], rot: a + (r() - 0.5) * 0.4 });
  }
  // las ollas colgadas y los cuadros, en las paredes de adentro
  {
    const p = spot(w, out, K, x0 + 2.2, z0 + 0.1, 0.4, 1.5);
    if (p) put(w, { type: 'potrack', pos: [p[0], z0 + 0.03], rot: 0 }, { boxes: false });
    const q = spot(w, out, K, x0 + (x1 - x0) * 0.6, z0 + 0.1, 0.4, 2);
    if (q) put(w, { type: 'picture', pos: [q[0], z0 + 0.02], rot: 0 }, { boxes: false });
  }
  // lo retorcido: la pared del norte rajada (la que da al establo)
  wallCrack(root, x0 + (x1 - x0) * 0.18, z1, [0, -1], y + 0.3, Z.roof - 0.4, 0.5);
  void orbs;
}

// ---------------- el corral ----------------
function buildCorral(w, gb, root, r, out, orbs) {
  const M = w.M;
  const K = ['G'];
  const y = ZONES.G.y;
  const [bx0, bz0, bx1, bz1] = zbox('G');
  // el cerco de palo, que en la punta del sudeste (el lado del molino suelto) se levanta
  const tw = (x, z) => {
    const d = Math.hypot(x - bx1, z - bz1);
    const t = Math.max(0, 1 - d / 8);
    return [t * t * 3.0, t * 1.0];
  };
  paloFence(w, gb, r, K, { ground: 'dirt', twist: tw });
  // la torre del molino de viento, quebrada arriba (la cabeza flota suelta en I9), su farol
  const L = lightTag('farolMolino');
  if (L) {
    const p = spot(w, out, K, L.pos[0] + 1.2, L.pos[2] + 1.2, 1, 2);
    if (p) {
      const g = new THREE.Group();
      g.position.set(p[0], y, p[1]);
      const Hh = 5.2;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const len = Hh + (a > 0 && b > 0 ? 0.9 : a < 0 && b > 0 ? -0.7 : 0);
        g.add(mesh(cylGeo(0.05, 0.06, len, 5), M.iron, a * 0.6, len / 2, b * 0.6, b * 0.12, 0, -a * 0.12));
      }
      for (let yy = 1.5; yy < Hh; yy += 1.6) {
        const wd = 1.2 * (1 - yy / 8) + 0.3;
        for (const [x, z, ry] of [[0, -wd / 2, 0], [0, wd / 2, 0], [-wd / 2, 0, Math.PI / 2], [wd / 2, 0, Math.PI / 2]]) g.add(mesh(boxGeo(wd, 0.04, 0.04), M.iron, x, yy, z, 0, ry, 0));
      }
      // los fierros torcidos de arriba, donde se partió
      for (let k = 0; k < 3; k++) g.add(mesh(cylGeo(0.03, 0.03, 1.2, 5), M.rust, (r() - 0.5) * 0.8, Hh + 0.3, (r() - 0.5) * 0.8, (r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4));
      addFixed(w, g);
      w.addBox([p[0] - 0.75, y, p[1] - 0.75, p[0] + 0.75, y + 2.5, p[1] + 0.75], { kind: 'prop' });
      orbs.push({ c: [p[0], y + Hh + 1.2, p[1]], r: [0.8, 1.8], h: 1.4, n: 6, s: [0.05, 0.12], sp: 0.4 });
    }
    farolAt(w, L, K, out);
  }
  const P = [
    [0.66, 0.5, { type: 'tank' }, 1.9],
    [0.7, 0.75, { type: 'trough', rot: Math.PI / 2 }, 1.2],
    [0.3, 0.55, { type: 'tractor', rot: 0.15 }, 1.9],
    [0.44, 0.88, { type: 'coop', rot: Math.PI }, 1.3],
    [0.12, 0.2, { type: 'washline', rot: 0 }, 2.1],
    [0.42, 0.4, { type: 'plow', rot: 0.5 }, 1.2],
    [0.24, 0.3, { type: 'rollo', rot: 0.3 }, 0.8],
    [0.27, 0.36, { type: 'rollo', rot: -0.2 }, 0.8],
    [0.52, 0.3, { type: 'hay', rot: 0.4 }, 0.8],
    [0.2, 0.86, { type: 'milkcans', rot: 0 }, 0.6],
    [0.9, 0.25, { type: 'siloRoto', rot: 0.8 }, 3.2],
    [0.58, 0.12, { type: 'huerta', rot: 0 }, 1.6],
    [0.82, 0.86, { type: 'cart', rot: -0.4 }, 1.4],
    [0.52, 0.66, { type: 'barrow', rot: 1.1 }, 0.9],
  ];
  for (const [u, v, def, rad] of P) {
    const [x, z] = zat('G', u, v, true);
    const p = spot(w, out, K, x, z, rad, 3);
    if (p) put(w, { ...def, pos: p });
  }
  // el corral chico contra el cerco del oeste: palos y tres tablas, con la tranquera abierta
  {
    const [mx0, mz0] = [bx0 + 1.6, bz0 + 3];
    const c0 = spot(w, out, K, mx0 + 2.5, mz0 + 2.5, 2.6, 4);
    if (c0) {
      const [cx, cz] = c0;
      const g = new THREE.Group();
      const A = [cx - 2.4, cz - 2.2];
      const B = [cx + 2.4, cz + 2.2];
      const posts = [];
      for (let x = A[0]; x <= B[0] + 0.01; x += 1.2) posts.push([x, A[1]], [x, B[1]]);
      for (let z = A[1] + 1.1; z < B[1] - 0.2; z += 1.1) posts.push([B[0], z]);
      for (const [px, pz] of posts) {
        g.add(mesh(boxGeo(0.15, 1.45, 0.15), M.fenceDark, px, y + 0.68, pz, 0, 0, (r() - 0.5) * 0.06));
        w.addBox([px - 0.1, y, pz - 0.1, px + 0.1, y + 1.3, pz + 0.1], { kind: 'prop' });
      }
      const seg = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az);
        for (const hy of [0.35, 0.72, 1.1]) g.add(mesh(boxGeo(len, 0.12, 0.05), M.fence, (ax + bx) / 2, y + hy, (az + bz) / 2, 0, -Math.atan2(bz - az, bx - ax), 0));
        w.addBox([Math.min(ax, bx) - 0.05, y, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, y + 1.2, Math.max(az, bz) + 0.05], { kind: 'prop' });
      };
      seg(A[0], A[1], B[0], A[1]);
      seg(A[0], B[1], cx - 0.3, B[1]);
      seg(B[0], A[1], B[0], B[1]);
      // (la tranquera abierta, girada hacia afuera)
      const gate = new THREE.Group();
      gate.position.set(cx + 1.8, y, B[1]);
      gate.rotation.y = -1.1;
      for (const hy of [0.35, 0.72, 1.1]) gate.add(mesh(boxGeo(2.1, 0.1, 0.05), M.fence, -1.05, hy, 0));
      gate.add(mesh(boxGeo(2.3, 0.08, 0.05), M.fence, -1.05, 0.72, 0, 0, 0, 0.42));
      g.add(gate);
      addFixed(w, g);
      const q = spot(w, out, K, cx - 0.8, cz - 0.6, 0.8, 1.2);
      if (q) put(w, { type: 'rollo', pos: q, rot: 1.2 });
      const t = spot(w, out, K, cx + 0.9, cz + 0.6, 1.2, 1.2);
      if (t) put(w, { type: 'trough', pos: t, rot: 0 });
    }
  }
  // fardos que se soltaron y flotan sobre el corral (la disformidad)
  {
    const [x, z] = zat('G', 0.78, 0.4, true);
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const gg = boxGeo(1.1, 0.5, 0.6).clone();
      gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x + (r() - 0.5) * 3, 2.6 + k * 0.9, z + (r() - 0.5) * 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.8, r() * 3, r() * 0.8)), new THREE.Vector3(1, 1, 1)));
      parts.push(gg);
    }
    const h = new THREE.Mesh(mergeGeos(parts), M.hay);
    h.position.y = y;
    h.castShadow = true;
    root.add(h);
    live.lifted.push({ m: h, y, p: 2.1 });
    orbs.push({ c: [x, y + 3.2, z], r: [1.6, 3], h: 2, n: 6, s: [0.05, 0.12], sp: 0.3 });
  }
  // matas de pasto en el corral (ralas: es tierra pisada), más contra el cerco
  const tufts = [];
  for (let t = 0; t < 900 && tufts.length < 180; t++) {
    const x = bx0 + r() * (bx1 - bx0);
    const z = bz0 + r() * (bz1 - bz0);
    if (zoneAtCell(w, x, z) !== 'G' || out(x, z, 0.4)) continue;
    const i = w.idx(Math.floor(x), Math.floor(z));
    let edge = false;
    for (const [dx, dz] of D4) if (w.edge[i + dx + dz * MAP_W] === EDGE_FENCE && w.grid[i + dx + dz * MAP_W] !== FLOOR) edge = true;
    if (!edge && r() < 0.6) continue;
    tufts.push([x, z, 0.3 + r() * 0.45, r() * 3]);
  }
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(
    inst(crossGeo(0.7), tuftMat(), tufts, ([x, z, h, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.03, z), q, s.set(0.6 + h, h, 0.6 + h));
    }, { detail: true }),
  );
}

// ---------------- el maizal ----------------
function buildMaizal(w, root, r, out, yerba) {
  const y = ZONES.I.y;
  const I = w.zoneKeys.indexOf('I');
  const [x0, z0, x1, z1] = zbox('I');
  // las sendas: de cada puerta y tranquera del maizal al portal, pasando cerca de la Yerba Madre
  const ends = [];
  for (const d of DOORS_OF('I')) ends.push(d);
  const P = PORTAL_OF('I');
  const paths = [];
  const hub = [yerba[0], yerba[1] + 3.2];
  for (const e of ends) paths.push([e, hub]);
  if (P) paths.push([hub, P]);
  const nearPath = (x, z, rad) => {
    for (const [a, b] of paths) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      // (la senda serpentea un poco)
      const wob = Math.sin(t * 7 + a[0]) * 0.5;
      if (Math.hypot(x - a[0] - dx * t + wob * 0.3, z - a[1] - dz * t) < rad) return true;
    }
    return false;
  };
  // el espantapájaros: en el maizal, lejos de la Yerba Madre, de las sendas y de lo reservado
  SCARE.x = SCARE.z = 0;
  for (const [u, v] of [[0.28, 0.72], [0.7, 0.3], [0.25, 0.3], [0.75, 0.75]]) {
    const [x, z] = zat('I', u, v, true);
    if (out(x, z, 1.6) || nearPath(x, z, 1.6) || Math.hypot(x - yerba[0], z - yerba[1]) < 5 || !onFloor(w, x, z, 0.5, ['I'])) continue;
    SCARE.x = x;
    SCARE.z = z;
    break;
  }
  const pts = [];
  // la pared del borde: seis plantas por celda de maíz
  for (const [x, z, i] of edgeCells(w, EDGE_CORN, 'I')) for (let k = 0; k < 6; k++) pts.push([x + 0.1 + r() * 0.8, w.fy[i], z + 0.1 + r() * 0.8, 0.95 + r() * 0.2]);
  // (la tierra del maizal arriba del cordón de Levels)
  // adentro: surcos de norte a sur cada 0,72 m, ralos donde se pelea
  for (let x = x0 + 0.3; x < x1; x += 0.72) {
    for (let z = z0 + 0.2; z < z1; z += 0.5) {
      const px = x + (r() - 0.5) * 0.2;
      const pz = z + (r() - 0.5) * 0.3;
      const ci = w.idx(Math.floor(px), Math.floor(pz));
      if (w.grid[ci] !== FLOOR || w.zone[ci] !== I) continue;
      if (out(px, pz, 0.6) || nearPath(px, pz, 0.85)) continue;
      if (SCARE.x && Math.hypot(px - SCARE.x, pz - SCARE.z) < 2.0) continue;
      if (r() < 0.12) continue;
      pts.push([px, y, pz, 0.78 + r() * 0.16]);
    }
  }
  const geo = cornGeo();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(
    inst(geo, CORN.taperaCorn, pts, ([x, yy, z, h], m4) => {
      q.setFromAxisAngle(up, r() * Math.PI);
      m4.compose(v.set(x, yy - 0.02, z), q, s.set(0.9 + r() * 0.25, h, 1));
    }, { shadow: true }),
  );
  // (la tierra del maizal arriba de los cordones del borde)
  const gb2 = new GeoBuilder();
  for (const [x, z, i] of edgeCells(w, EDGE_CORN, 'I')) gb2.flat('dirtDark', x, z, x + 1, z + 1, w.fy[i] + 0.012, true);
  const tierra = gb2.build(w.M);
  tierra.name = 'eclipse:tapera:maizal';
  w.root.add(tierra);
  // el maíz se aparta al pasar (fx/grassPush: el jugador, los otros y los muertos)
  const isCorn = (x, z) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return false;
    const i = w.idx(cx, cz);
    return (w.grid[i] === FLOOR && w.zone[i] === I) || (w.grid[i] !== OUT && w.grid[i] !== FLOOR && w.edge[i] === EDGE_CORN);
  };
  live.push = makeGrassPush(w.g, isCorn);
  // el espantapájaros (quieto: la huerta de la granja, más grande): la cabeza y los brazos asoman sobre el maíz
  if (SCARE.x) put(w, { type: 'espantajo', pos: [SCARE.x, SCARE.z], rot: -0.5 }, { boxes: true, scale: 1.45 });
}
// el espantapájaros: en el maizal, lejos de la Yerba Madre y de las sendas
const SCARE = { x: 0, z: 0 };
function DOORS_OF(k) {
  const out = [];
  for (const d of DOORS) {
    if (!d.zones.includes(k)) continue;
    const xs = d.cells.map((c) => c[0]);
    const zs = d.cells.map((c) => c[1]);
    out.push([(Math.min(...xs) + Math.max(...xs) + 1) / 2, (Math.min(...zs) + Math.max(...zs) + 1) / 2]);
  }
  return out;
}
function PORTAL_OF(k) {
  for (const p of PORTALS) for (const e of [p.a, p.b]) if (e.zone === k) return e.pos;
  return null;
}

// La planta de maíz: dos tarjetas cruzadas de 2,7 m (la del maíz de la granja).
function cornGeo() {
  const a = new THREE.PlaneGeometry(1.05, 2.7).translate(0, 1.35, 0);
  const b = a.clone().rotateY(Math.PI / 2);
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

// ---------------- el yerbal ----------------
// Hileras de plantas de yerba (las del Prado), la ramada con los raídos y el farol.
function buildYerbal(w, gb, root, r, out) {
  const K = ['G3'];
  const y = ZONES.G3.y;
  paloFence(w, gb, r, K, { ground: 'dirt' });
  farolAt(w, lightTag('farolYerbal'), K, out);
  const [x0, z0, x1, z1] = zbox('G3', true);
  // la ramada (al oeste): techo de paja sobre postes, con raídos y la balanza
  let ramada = null;
  {
    const [x, z] = zat('G3', 0.14, 0.62, true);
    const p = spot(w, out, K, x, z, 1.9, 2.5);
    if (p) {
      ramada = p;
      put(w, { type: 'enramada', pos: p, rot: 0, w: 3.4, d: 2.6 });
      for (const [dx, dz, def] of [[-0.7, 0.3, { type: 'bigsacks', rot: 0.2 }], [0.8, -0.2, { type: 'sacks', rot: 1.2 }]]) if (!out(p[0] + dx, p[1] + dz, 0.6)) put(w, { ...def, pos: [p[0] + dx, p[1] + dz] });
    }
  }
  // las hileras (este-oeste), dejando la calle del medio y la puerta
  for (let z = z0 + 1.4; z < z1 - 0.8; z += 1.7) {
    for (let x = x0 + 1.2; x < x1 - 2; x += 5.6) {
      const cx = x + 2.6;
      if (ramada && Math.hypot(cx - ramada[0], z - ramada[1]) < 4.6) continue;
      if (out(cx, z, 0.5) || out(cx - 2.2, z, 0.4) || out(cx + 2.2, z, 0.4)) continue;
      if (!onFloor(w, cx - 2.4, z, 0.4, K) || !onFloor(w, cx + 2.4, z, 0.4, K)) continue;
      put(w, { type: 'yerbal', pos: [cx, z], rot: 0, len: 5 });
    }
  }
  void root;
  void y;
}

// ---------------- la cabeza del molino de viento, suelta (I9) ----------------
function buildMolinoSuelto(w, r, orbs) {
  if (!ZONES.I9) return;
  const M = w.M;
  const F = fragment(w, 'I9', { tilt: [-0.1, 0.02, 0.14], top: 'dirt', seed: 29 });
  const g = F.g;
  // la mitad de arriba del molino (la torre partida, la cabeza con la rueda y la cola)
  const res = buildProp({ type: 'windmill', pos: [0, 0], y: 0 }, M, 4242);
  if (res) {
    const piv = new THREE.Group();
    piv.position.set(0, -3.6, 0);
    piv.rotation.set(0.2, 0.7, -0.25);
    piv.add(res.obj);
    g.add(piv);
  }
  // el tanque volcado y fierros
  g.add(mesh(cylGeo(1.2, 1.2, 0.8, 18, true), M.rust, F.hx * 0.5, 0.2, F.hz * 0.4, 1.2, 0, 0.3));
  for (let k = 0; k < 3; k++) g.add(mesh(cylGeo(0.02, 0.02, 1.6, 5), M.rust, (r() - 0.5) * F.hx, -0.2, -F.hz - 0.4, -0.7, 0, (r() - 0.5) * 0.6));
  F.finish();
  orbs.push({ c: [g.position.x, g.position.y + 3, g.position.z], r: [3, 5], h: 4, n: 10, s: [0.08, 0.3], sp: 0.16 });
}

export function update(dt, t) {
  const S = live;
  if (!S) return;
  S.push?.(dt);
  for (const l of S.lifted) l.m.position.y = l.y + Math.sin(t * 0.5 + l.p) * 0.2;
  S.orb?.update(t);
  S.cull?.();
}
