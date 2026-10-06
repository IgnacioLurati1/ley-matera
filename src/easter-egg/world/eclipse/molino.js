import * as THREE from 'three';
import { ZONES } from '../../config/map';
import { mesh, cylGeo, boxGeo, compactGroup } from '../props';
import { registerMolinoProps } from '../molinoProps';
import GeoBuilder from '../GeoBuilder';
import { rng } from '../../core/noise';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { keepOut, zoneAtCell, onFloor, spot, put, addFixed, inst, crossGeo, tuftMat, CUT_GBUF, zbox, zat, lightTag, grime, orbiters, fragment, wallCrack, curbs, curbMats, cliffRocks, CLIFFS, wallSpots, farolAt, paloFence, crackMat, voidRockMat, FOOT, EDGE_FENCE, portalOrbs, buildArch, mergeGeos, detailCuller } from './centro';

// El Molino Santa Ana, 1911 (isla "molino" de Eclipse Matero, layout v4), lo
// que no sale del armado en bloques:
//  · los techos: el galpón de la molienda a dos aguas de chapa (con chapas
//    arrancadas que flotan sobre una raja de luz), el secadero en media agua
//    contra el galpón (sin chimenea: la arrancó la disformidad, flota suelta en
//    F9), el almacén y la capilla a dos aguas, la capilla con su espadaña;
//  · ventanas en las paredes de afuera (las del galpón y el secadero se prenden
//    con la luz; la capilla, de velas);
//  · el galpón: la muela (dos piedras de canto que ruedan en la pileta) y el eje
//    de transmisión con poleas y correas, que giran con la luz; la zaranda, el
//    motor, las bolsas de yerba, la estantería; una pared rajada;
//  · el secadero con el barbacuá encendido, los catres y la leña;
//  · el almacén de ramos generales: el mostrador con la reja, estantes llenos,
//    barriles, la mesa de los parroquianos;
//  · la capilla con cientos de velas (instanciadas), el altar y los bancos;
//  · el camposanto: tumbas, panteón, cruces de fierro, árboles secos, la fosa
//    (y la tumba que se levantó y flota), el aljibe y los faroles;
//  · el patio del secadero: catres de yerba al sol, la planchada, la carreta
//    con raídos, el cerco de palo que se tuerce y sube;
//  · la chimenea del barbacuá, suelta (F9).
// Todo sale de ZONES/LIGHTS del config (nada fijo). Lo quieto por
// World.addStatic; techos y ventanas en un GeoBuilder.

const SILL = 1.05;
const WIN_H = 1.35;

// Techo a dos aguas sobre el rectángulo de afuera de las paredes [x0, z0, x1, z1]:
// cumbrera a lo largo de x (axis 'x') o de z; base: la altura de las paredes;
// rise: cuánto sube; ov: el alero. Las cabeceras (los triángulos) con `gableMat`.
export function gable(gb, mat, gableMat, [x0, z0, x1, z1], base, rise, axis = 'x', ov = 0.35) {
  const ax = axis === 'x';
  const u0 = (ax ? x0 : z0) - ov;
  const u1 = (ax ? x1 : z1) + ov;
  const v0 = ax ? z0 : x0;
  const v1 = ax ? z1 : x1;
  const vm = (v0 + v1) / 2;
  const half = (v1 - v0) / 2;
  const slope = rise / half;
  const top = base + rise;
  const eave = base - ov * slope;
  const P = (u, y, v) => (ax ? [u, y, v] : [v, y, u]);
  const len = Math.hypot(half + ov, rise + ov * slope);
  for (const s of [-1, 1]) {
    const ve = vm + s * (half + ov);
    const nv = s * rise;
    const ny = half;
    const nl = Math.hypot(nv, ny);
    const n = ax ? [0, ny / nl, nv / nl] : [nv / nl, ny / nl, 0];
    const a = P(s > 0 ? u0 : u1, eave, ve);
    const b = P(s > 0 ? u1 : u0, eave, ve);
    const c = P(s > 0 ? u1 : u0, top, vm);
    const d = P(s > 0 ? u0 : u1, top, vm);
    const flip = !ax;
    const uvs = [[0, 0], [(u1 - u0) / 2, 0], [(u1 - u0) / 2, len / 2], [0, len / 2]];
    if (flip) gb.quad(mat, b, a, d, c, n, uvs[0], uvs[1], uvs[2], uvs[3]);
    else gb.quad(mat, a, b, c, d, n, uvs[0], uvs[1], uvs[2], uvs[3]);
    // (el canto de la chapa o de las tejas: de abajo se veía un papel)
    const t = 0.06;
    const a2 = P(s > 0 ? u0 : u1, eave - t, ve);
    const b2 = P(s > 0 ? u1 : u0, eave - t, ve);
    if (flip) gb.quad(mat, a2, b2, b, a, [n[0] * 0 + (ax ? 0 : s), 0, ax ? s : 0], [0, 0], [1, 0], [1, 0.05], [0, 0.05]);
    else gb.quad(mat, b2, a2, a, b, [ax ? 0 : s, 0, ax ? s : 0], [0, 0], [1, 0], [1, 0.05], [0, 0.05]);
  }
  for (const s of [-1, 1]) {
    const u = s < 0 ? (ax ? x0 : z0) : ax ? x1 : z1;
    const n = ax ? [s, 0, 0] : [0, 0, s];
    const A = P(u, base, s < 0 ? v1 : v0);
    const B = P(u, base, s < 0 ? v0 : v1);
    const C = P(u, top, vm);
    const flip = ax;
    const uv = [[0, base / 3.6], [(v1 - v0) / 2, base / 3.6], [(v1 - v0) / 4, top / 3.6]];
    if (flip) gb.quad(gableMat, B, A, C, C, n, uv[1], uv[0], uv[2], uv[2]);
    else gb.quad(gableMat, A, B, C, C, n, uv[0], uv[1], uv[2], uv[2]);
  }
  const r = 0.12;
  if (ax) gb.box(mat, u0, top - 0.04, vm - r, u1, top + 0.06, vm + r, 1);
  else gb.box(mat, vm - r, top - 0.04, u0, vm + r, top + 0.06, u1, 1);
  return { top, eave, vm, half };
}

// Una ventana en la cara de una pared: el vano con el vidrio (el material que
// se pase: encendido de afuera, la noche de adentro), el marco y el alféizar.
// (x, z): el medio de la cara; n: hacia dónde mira la cara; y: el piso.
export function windowAt(gb, glassKey, frameKey, x, z, n, y, { w = 1.0, h = WIN_H, sill = SILL, out = 0.02 } = {}) {
  const [nx, nz] = n;
  const rx = nz;
  const rz = -nx;
  const cx = x + nx * out;
  const cz = z + nz * out;
  const y0 = y + sill;
  const y1 = y0 + h;
  gb.wall(glassKey, cx - (rx * w) / 2, cz - (rz * w) / 2, cx + (rx * w) / 2, cz + (rz * w) / 2, y0, y1, [nx, 0, nz], 2);
  const t = 0.07;
  const bar = (off, yy0, yy1, along, d = 0.05) => {
    const px = cx + nx * d * 0.5 + rx * off;
    const pz = cz + nz * d * 0.5 + rz * off;
    const hx = (Math.abs(rx) * along + Math.abs(nx) * d) / 2;
    const hz = (Math.abs(rz) * along + Math.abs(nz) * d) / 2;
    gb.box(frameKey, px - hx, yy0, pz - hz, px + hx, yy1, pz + hz, 1);
  };
  for (const k of [-0.5, 0, 0.5]) bar(k * (w - t), y0, y1, k ? t : t * 0.6);
  bar(0, y1 - t / 2, y1 + t / 2, w + t);
  bar(0, y0 + h * 0.55 - 0.025, y0 + h * 0.55 + 0.025, w);
  bar(0, y0 - 0.06, y0 + 0.02, w + 0.2, 0.12);
}

// Materiales de las ventanas: el vidrio encendido de afuera (galpón y secadero:
// se prenden con la luz), el de la capilla (velas, siempre) y la noche de adentro.
let WIN = null;
export function winMats(M) {
  if (WIN) return WIN;
  WIN = {
    winLit: new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffb45a, emissiveIntensity: 0.25, roughness: 0.3 }),
    winChapel: new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffa040, emissiveIntensity: 0.9, roughness: 0.3 }),
    winNight: new THREE.MeshStandardMaterial({ color: 0x0c1424, emissive: 0x0a1630, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.1 }),
    whiteTrim: new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.8 }),
  };
  void M;
  return WIN;
}

// Las ventanas de una zona techada en los lados que se pidan.
function zoneWindows(w, gb, k, sides, glass, frame, o = {}, step = 3.4) {
  const y = ZONES[k].y;
  for (const side of sides) {
    for (const [x, z, n] of wallSpots(w, k, side, step, o.off ?? 1.6)) {
      windowAt(gb, glass, frame, x, z, n, y, o);
      // del lado de adentro (la pared es de una celda): la noche
      windowAt(gb, 'winNight', frame, x - n[0], z - n[1], [-n[0], -n[1]], y, o);
    }
  }
}

let live = null;

export function build(w, g, isl) {
  // (globalThis.__mduNoArteA: las islas de arte-A en bloques, para comparar)
  if (globalThis.__mduNoArteA === true) return;
  registerMolinoProps();
  const M = w.M;
  const r = rng(5203);
  // (las siete velas de la Brasa: sus marcas en el piso de la capilla quedan libres)
  const velas = (ANCHORS?.velas || []).map(([x, z]) => [x, z, 0.75]);
  const out = keepOut(velas);
  const gb = new GeoBuilder();
  const root = new THREE.Group();
  root.name = 'eclipse:molino';
  const mats = winMats(M);
  const orbs = [];
  live = { w, rot: null, chapas: [] };
  CLIFFS.length = 0;
  buildRoofs(w, gb, root, r, orbs);
  zoneWindows(w, gb, 'C', ['n', 's', 'o'], 'winLit', 'woodDark');
  zoneWindows(w, gb, 'D', ['n', 'e'], 'winLit', 'woodDark');
  zoneWindows(w, gb, 'C2', ['s', 'o'], 'winLit', 'woodDark');
  zoneWindows(w, gb, 'E', ['s', 'e'], 'winChapel', 'trim', { w: 0.8, h: 1.9, sill: 1.2 }, 2.8);
  buildGalpon(w, root, r, out);
  buildSecadero(w, root, r, out);
  buildAlmacen(w, gb, root, r, out);
  buildCapilla(w, root, r, out);
  buildCamposanto(w, root, r, out, orbs);
  buildPatio(w, gb, root, r, out, orbs);
  buildChimenea(w, r, orbs);
  // los cordones y la base de las barandas del camposanto, de piedra
  const fenceSkip = (i) => w.edge[i] === EDGE_FENCE;
  curbs(w, 'molino', gb, fenceSkip);
  cliffRocks(w, root, out, r, 'molino');
  portalOrbs('molino', orbs);
  live.orb = orbiters(w, orbs, { seed: 88 });
  const arch = buildArch(gb, { ...M, ...mats, ...curbMats(w) }, 'eclipse:molino:techos', w);
  w.root.add(arch, root);
  // la suciedad: oclusión, humedad de los muros de ladrillo, hollín del barbacuá, charcos en el camposanto
  const L = lightTag('barbacua');
  const D = zbox('D', true);
  const soot = L ? [[L.pos[0], ZONES.D.y + 2.6, D[1] + 0.02, 0, 1, 3.4, ZONES.D.roof - ZONES.D.y - 2.6]] : [];
  const gr = grime(w, 'molino', { seed: 5301, damp: 0.22, moss: 0.2, rust: 0.08, mud: 0.06, puddles: 8, soot, out });
  live.cull = detailCuller(w, 'molino', [...root.children.filter((o) => o.userData.detail), ...gr.children]);
}

// ---------------- techos ----------------
function buildRoofs(w, gb, root, r, orbs) {
  const C = ZONES.C;
  const D = ZONES.D;
  const E = ZONES.E;
  const C2 = ZONES.C2;
  const [cx0, cz0, cx1, cz1] = zbox('C', true);
  // el galpón: chapa a dos aguas, cumbrera a lo largo (las cabeceras de ladrillo)
  // (el rectángulo de afuera de las paredes: una celda más por lado)
  const G = gable(gb, 'roofTin', 'brick', [cx0 - 1, cz0 - 1, cx1 + 1, cz1 + 1], C.roof, 2.6, 'x', 0.4);
  // lo retorcido: un pedazo de chapas arrancado del faldón norte, flotando sobre la raja
  {
    const hx = cx0 + (cx1 - cx0) * 0.62;
    const zz = (cz0 - 1 + G.vm) / 2;
    const yy = C.roof + 1.3;
    const c = mesh(new THREE.PlaneGeometry(4.2, 1.1), crackMat(), hx, yy + 0.05, zz, -Math.PI / 2 + Math.atan(2.6 / G.half), 0, 0);
    c.renderOrder = 2;
    root.add(c);
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const gg = boxGeo(1.1 + r() * 0.8, 0.03, 1.8 + r() * 0.6).clone();
      gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(hx + (r() - 0.5) * 4, 1.4 + k * 0.55 + r() * 0.4, zz - 0.6 + (r() - 0.5) * 2), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9)), new THREE.Vector3(1, 1, 1)));
      parts.push(gg);
    }
    const ch = new THREE.Mesh(mergeGeos(parts), w.M.roofTin);
    ch.position.y = yy;
    ch.castShadow = true;
    root.add(ch);
    live.chapas.push({ m: ch, y: yy, p: r() * 6, s: 0.4 });
    orbs.push({ c: [hx, yy + 2.2, zz], r: [1.4, 3], h: 2, n: 8, s: [0.05, 0.16], sp: 0.3 });
  }
  // el secadero: media agua de chapa apoyada contra el galpón (sin chimenea: flota suelta)
  {
    const [dx0, dz0, dx1, dz1] = zbox('D', true);
    const x0 = cx1 + 1;
    const x1 = dx1 + 1;
    const z0 = dz0 - 1 - 0.4;
    const z1 = dz1 + 1 + 0.4;
    const hi = C.roof;
    const lo = D.roof;
    const ov = 0.4;
    const s = (hi - lo) / (x1 - x0);
    const yE = lo - ov * s;
    const len = Math.hypot(x1 + ov - x0, hi - yE);
    gb.quad('roofTin', [x1 + ov, yE, z1], [x1 + ov, yE, z0], [x0, hi, z0], [x0, hi, z1], [s / Math.hypot(s, 1), 1 / Math.hypot(s, 1), 0], [0, 0], [(z1 - z0) / 2, 0], [(z1 - z0) / 2, len / 2], [0, len / 2]);
    gb.quad('roofTin', [x1 + ov, yE - 0.05, z0], [x1 + ov, yE - 0.05, z1], [x0, hi - 0.05, z1], [x0, hi - 0.05, z0], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
    for (const [z, nz] of [[dz0 - 1, -1], [dz1 + 1, 1]]) {
      const a = [x0, lo, z];
      const b = [x1, lo, z];
      const c = [x0, hi, z];
      if (nz > 0) gb.quad('brickSoot', a, b, c, c, [0, 0, 1], [0, lo / 3.6], [4, lo / 3.6], [0, hi / 3.6], [0, hi / 3.6]);
      else gb.quad('brickSoot', b, a, c, c, [0, 0, -1], [4, lo / 3.6], [0, lo / 3.6], [0, hi / 3.6], [0, hi / 3.6]);
    }
    // el muñón de la chimenea, roto, y el agujero en la chapa con la luz violeta
    const L = lightTag('barbacua');
    if (L) {
      const chx = L.pos[0] + 2.0;
      const chz = dz0 + 0.6;
      const yR = hi - s * (chx - x0);
      gb.box('brickSoot', chx - 0.35, yR - 0.4, chz - 0.35, chx + 0.35, yR + 0.5, chz + 0.35, 1);
      for (let k = 0; k < 4; k++) gb.box('brickSoot', chx - 0.35 + r() * 0.4, yR + 0.5, chz - 0.35 + r() * 0.4, chx - 0.1 + r() * 0.4, yR + 0.6 + r() * 0.4, chz - 0.1 + r() * 0.4, 1);
      const c = mesh(new THREE.CircleGeometry(0.75, 9), crackMat(), chx, yR + 0.52, chz, -Math.PI / 2, 0, 0);
      c.renderOrder = 2;
      root.add(c);
    }
  }
  // el almacén: chapa a dos aguas, bajita (las cabeceras de revoque)
  const [ax0, az0, ax1, az1] = zbox('C2', true);
  gable(gb, 'roofTin', 'plasterWhite', [ax0 - 1, az0 - 1, ax1 + 1, az1 + 1], C2.roof, 1.9, 'x', 0.35);
  // la capilla: tejas a dos aguas, más empinada, blanca en las cabeceras, con la espadaña al este
  const [ex0, ez0, ex1, ez1] = zbox('E', true);
  const EG = gable(gb, 'tejas', 'whitewash', [ex0 - 1, ez0 - 1, ex1 + 1, ez1 + 1], E.roof, 2.6, 'x', 0.35);
  {
    const x = ex1 + 1;
    const top = EG.top;
    const zc = EG.vm;
    const z0 = zc - 1.1;
    const z1 = zc + 1.1;
    const y0 = top - 0.6;
    const y1 = top + 1.9;
    const t0 = x - 0.32;
    const t1 = x + 0.04;
    gb.box('whitewash', t0, y0, z0, t1, y1, z0 + 0.4, 1);
    gb.box('whitewash', t0, y0, z1 - 0.4, t1, y1, z1, 1);
    gb.box('whitewash', t0, y1 - 0.45, z0, t1, y1, z1, 1);
    gb.box('whitewash', t0, y0, z0, t1, y0 + 0.5, z1, 1);
    gb.box('tejas', t0 - 0.06, y1, z0 - 0.08, t1 + 0.06, y1 + 0.1, z1 + 0.08, 1);
    gb.box('iron', x - 0.17, y1 + 0.1, zc - 0.03, x - 0.11, y1 + 0.85, zc + 0.03, 1);
    gb.box('iron', x - 0.17, y1 + 0.52, zc - 0.22, x - 0.11, y1 + 0.58, zc + 0.22, 1);
    const bell = [x - 0.14, y1 - 0.5, zc];
    const bg = new THREE.Group();
    bg.add(mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.36, 14, 1, true), w.M.brass, bell[0], bell[1] - 0.2, bell[2]));
    bg.add(mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), w.M.brass, bell[0], bell[1] - 0.02, bell[2]));
    bg.add(mesh(boxGeo(0.04, 0.1, 0.5), w.M.iron, bell[0], bell[1] + 0.05, bell[2]));
    addFixed(w, bg);
  }
  void cz1;
}

// ---------------- el galpón de la molienda ----------------
function buildGalpon(w, root, r, out) {
  const M = w.M;
  const K = ['C'];
  const C = ZONES.C;
  const y = C.y;
  const roof = C.roof;
  const shaftY = roof - 1.15;
  const [x0, z0, x1, z1] = zbox('C', true);
  // ---- la muela, en el medio del galpón (el temple clava ahí la guadaña) ----
  const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const fixed = new THREE.Group();
  fixed.add(mesh(cylGeo(1.95, 2.05, 0.55, 28, true), M.stone, mx, y + 0.275, mz));
  fixed.add(mesh(cylGeo(1.75, 1.75, 0.55, 28, true), M.stoneDark, mx, y + 0.275, mz));
  fixed.add(mesh(new THREE.RingGeometry(1.75, 1.95, 28), M.stone, mx, y + 0.552, mz, -Math.PI / 2));
  fixed.add(mesh(new THREE.CircleGeometry(1.76, 28), M.yerbaBranch, mx, y + 0.3, mz, -Math.PI / 2));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + r() * 0.3;
    const m = mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.yerbaBranch, mx + Math.cos(a) * 1.45, y + 0.29, mz + Math.sin(a) * 1.45);
    m.scale.set(1.2, 0.5, 0.8);
    m.rotation.y = -a;
    fixed.add(m);
  }
  const rot = new THREE.Group();
  rot.position.set(mx, y, mz);
  rot.add(mesh(cylGeo(0.14, 0.16, shaftY - 0.2 - y, 10), M.woodDark, 0, (shaftY - 0.2 - y) / 2, 0));
  rot.add(mesh(cylGeo(0.07, 0.07, 2.9, 8), M.iron, 0, 0.95, 0, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    rot.add(mesh(cylGeo(0.85, 0.85, 0.36, 20), M.stone, s * 0.95, 0.95, 0, 0, 0, Math.PI / 2));
    rot.add(mesh(new THREE.TorusGeometry(0.85, 0.03, 4, 20), M.stoneDark, s * (0.95 + 0.18), 0.95, 0, 0, Math.PI / 2, 0));
  }
  rot.add(mesh(cylGeo(0.55, 0.55, 0.12, 16), M.iron, 0, shaftY - y - 0.36, 0));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    rot.add(mesh(boxGeo(0.12, 0.1, 0.08), M.iron, Math.cos(a) * 0.6, shaftY - y - 0.27, Math.sin(a) * 0.6, 0, -a, 0));
  }
  rot.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  compactGroup(rot);
  root.add(rot);
  live.rot = rot;
  w.addBox([mx - 2.05, y, mz - 2.05, mx + 2.05, y + 0.6, mz + 2.05], { kind: 'prop' });
  FOOT.push([mx, y, mz, 2.3, 2.3]);
  // ---- el eje de transmisión: de punta a punta, colgado de las cerchas ----
  const L = x1 - x0 - 0.6;
  fixed.add(mesh(cylGeo(0.07, 0.07, L, 8), M.iron, (x0 + x1) / 2, shaftY, mz, 0, 0, Math.PI / 2));
  for (let k = 0; k < 5; k++) {
    const x = x0 + 1.4 + ((x1 - x0 - 2.8) * k) / 4;
    fixed.add(mesh(boxGeo(0.06, roof - shaftY, 0.06), M.iron, x, (roof + shaftY) / 2, mz));
    fixed.add(mesh(boxGeo(0.22, 0.22, 0.2), M.metal, x, shaftY, mz));
  }
  const pulley = (x, rad, wd) => {
    const p = new THREE.Group();
    p.name = 'flywheel';
    p.userData.dynamic = true;
    p.position.set(x, shaftY, mz);
    p.add(mesh(cylGeo(rad, rad, wd, 18), M.woodDark, 0, 0, 0, 0, 0, Math.PI / 2));
    for (let k = 0; k < 4; k++) p.add(mesh(boxGeo(0.04, rad * 1.9, 0.04), M.iron, wd / 2 + 0.01, 0, 0, (k * Math.PI) / 4, 0, 0));
    p.traverse((o) => (o.castShadow = false));
    compactGroup(p);
    fixed.add(p);
  };
  // ---- el motor y su correa (al este), la zaranda (al oeste) ----
  const motorX = x1 - 3.4;
  const zarX = x0 + 4.4;
  pulley(motorX, 0.5, 0.22);
  pulley(zarX, 0.42, 0.2);
  pulley(mx + 0.62, 0.22, 0.12);
  if (!out(motorX, mz, 1.4)) {
    put(w, { type: 'generator', pos: [motorX, mz], rot: Math.PI });
    const botY = y + 0.95;
    for (const s of [-1, 1]) fixed.add(mesh(boxGeo(0.16, shaftY - botY, 0.02), M.leather, motorX, (shaftY + botY) / 2, mz + s * 0.52));
  }
  if (!out(zarX, mz, 1.3)) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) fixed.add(mesh(boxGeo(0.1, 1.2, 0.1), M.woodDark, zarX + sx * 1.1, y + 0.6, mz + sz * 0.5));
    fixed.add(mesh(boxGeo(2.4, 0.5, 1.15), M.wood, zarX, y + 1.35, mz, 0, 0, 0.08));
    fixed.add(mesh(boxGeo(2.2, 0.06, 1.0), M.yerbaBranch, zarX, y + 1.58, mz, 0, 0, 0.08));
    fixed.add(mesh(boxGeo(0.6, 0.06, 0.45), M.metal, zarX + 1.4, y + 1.0, mz, 0, 0, -0.5));
    const len = shaftY - (y + 1.6);
    for (const s of [-1, 1]) fixed.add(mesh(boxGeo(0.13, len, 0.02), M.leather, zarX, y + 1.6 + len / 2, mz + s * 0.42));
    w.addBox([zarX - 1.25, y, mz - 0.6, zarX + 1.25, y + 1.6, mz + 0.6], { kind: 'prop' });
    FOOT.push([zarX, y, mz, 1.4, 0.8]);
    const p = spot(w, out, K, zarX + 2.0, mz, 0.5, 1);
    if (p) put(w, { type: 'sacks', pos: p, rot: Math.PI / 2 });
  }
  addFixed(w, fixed);
  // ---- bolsas, tarimas, cajones, barriles, estantería, contra las paredes ----
  const along = [
    [0.08, 0.15, { type: 'bigsacks', rot: 0.1 }, 1.1],
    [0.92, 0.85, { type: 'bigsacks', rot: -0.08 }, 1.1],
    [0.06, 0.85, { type: 'sacks', rot: 0 }, 1],
    [0.3, 0.9, { type: 'pallets', rot: 0.2 }, 0.7],
    [0.45, 0.9, { type: 'sacks', rot: 0.05 }, 1],
    [0.62, 0.12, { type: 'crates', rot: -0.3 }, 0.8],
    [0.5, 0.1, { type: 'barrel' }, 0.4],
    [0.53, 0.12, { type: 'barrel' }, 0.4],
    [0.78, 0.9, { type: 'pallets', rot: -0.1 }, 0.7],
    [0.2, 0.12, { type: 'yerbahang', rot: 0 }, 0.5],
  ];
  for (const [u, v, def, rad] of along) {
    const [x, z] = zat('C', u, v, true);
    const p = spot(w, out, K, x, z, rad, 2);
    if (p) put(w, { ...def, pos: p }, { boxes: def.type !== 'yerbahang' });
  }
  // la estantería contra la pared del este (la que da al secadero), lejos de la puerta
  {
    const p = spot(w, out, K, x1 - 0.42, z0 + 2.4, 0.5, 2);
    if (p) put(w, { type: 'shelfWall', pos: [x1 - 0.42, p[1]], rot: -Math.PI / 2, len: 3.2 });
  }
  // lo retorcido: la pared del norte rajada con la luz adentro
  wallCrack(root, x0 + (x1 - x0) * 0.78, z0, [0, 1], y + 0.4, roof - 0.6, 0.6);
}

// ---------------- el secadero: el barbacuá ----------------
function buildSecadero(w, root, r, out) {
  const K = ['D'];
  const L = lightTag('barbacua');
  const [x0, z0, x1, z1] = zbox('D', true);
  if (L) put(w, { type: 'kiln', pos: [L.pos[0], L.pos[2] - 2.0], rot: 0 });
  // los catres de yerba al fondo, la leña y las bolsas
  for (const [u, v, rad, def] of [[0.5, 0.82, 0.9, { type: 'rack', rot: 0 }], [0.12, 0.45, 0.7, { type: 'firewood', rot: Math.PI / 2 }], [0.85, 0.5, 1.1, { type: 'bigsacks', rot: 0.2 }], [0.15, 0.62, 0.7, { type: 'firewood', rot: 1.4 }]]) {
    const [x, z] = zat('D', u, v, true);
    const p = spot(w, out, K, x, z, rad, 1.5);
    if (p) put(w, { ...def, pos: p });
  }
  void x0;
  void z0;
  void x1;
  void z1;
  void root;
  void r;
}

// ---------------- el almacén de ramos generales ----------------
// El mostrador con la reja del despacho (de la tabla al techo), los estantes
// llenos detrás, barriles y bolsas, y la mesa de los parroquianos.
function buildAlmacen(w, gb, root, r, out) {
  const M = w.M;
  const K = ['C2'];
  const Z = ZONES.C2;
  const y = Z.y;
  const [x0, z0, x1, z1] = zbox('C2', true);
  const L = lightTag('almacen');
  const cx = x0 + (x1 - x0) * 0.66;
  const cz = (z0 + z1) / 2;
  // el mostrador a lo largo de z y la reja arriba (deja pasar la luz, no al que pasa)
  // (el mostrador es angosto: se mira a lo largo, no un círculo)
  if (![-1.4, 0, 1.4].some((dz) => out(cx, cz + dz, 0.45))) {
    put(w, { type: 'counter', pos: [cx, cz], rot: Math.PI / 2 });
    const g = new THREE.Group();
    for (let z = cz - 1.55; z <= cz + 1.56; z += 0.16) g.add(mesh(boxGeo(0.025, Z.roof - y - 1.1, 0.025), M.iron, cx - 0.32, y + 1.1 + (Z.roof - y - 1.1) / 2, z));
    for (const hy of [1.12, Z.roof - y - 0.25]) g.add(mesh(boxGeo(0.05, 0.05, 3.2), M.iron, cx - 0.32, y + hy, cz));
    // la ventanita del despacho (sin barrotes) y la balanza y las botellas en la tabla
    g.add(mesh(boxGeo(0.4, 0.28, 0.45), M.iron, cx, y + 1.25, cz - 0.9));
    g.add(mesh(cylGeo(0.18, 0.18, 0.02, 14), M.brass, cx, y + 1.42, cz - 0.9));
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.15, metalness: 0.1 });
    for (let k = 0; k < 6; k++) g.add(mesh(cylGeo(0.035, 0.04, 0.28, 8), glass, cx + (r() - 0.5) * 0.3, y + 1.24, cz + 0.2 + k * 0.18));
    addFixed(w, g);
    w.addBox([cx - 0.36, y, cz - 1.6, cx - 0.28, Z.roof, cz + 1.6], { kind: 'prop' });
  }
  // los estantes de atrás, contra la pared del este, y bolsas y barriles
  {
    const sx = x1 - 0.42;
    for (const dz of [-1.7, 1.7]) {
      const p = spot(w, out, K, sx, cz + dz, 0.5, 1);
      if (p) put(w, { type: 'shelfWall', pos: [sx, p[1]], rot: -Math.PI / 2, len: 3 });
    }
  }
  for (const [u, v, def, rad] of [[0.94, 0.1, { type: 'barrel' }, 0.4], [0.88, 0.1, { type: 'barrel' }, 0.4], [0.9, 0.9, { type: 'sacks', rot: 1.57 }, 0.9], [0.06, 0.12, { type: 'crates', rot: 0.2 }, 0.8], [0.45, 0.9, { type: 'sacks', rot: 0.1 }, 0.9]]) {
    const [x, z] = zat('C2', u, v, true);
    const p = spot(w, out, K, x, z, rad, 1.5);
    if (p) put(w, { ...def, pos: p });
  }
  // la mesa de los parroquianos, con sus sillas y la ginebra
  {
    const [x, z] = zat('C2', 0.32, 0.5, true);
    const p = spot(w, out, K, x, z, 1.1, 2);
    if (p) {
      put(w, { type: 'table', pos: p, rot: 0.1 });
      for (const [dx, dz, rr] of [[0, -0.75, 0], [0, 0.75, Math.PI], [-1.15, 0, Math.PI / 2]]) if (!out(p[0] + dx, p[1] + dz, 0.3)) put(w, { type: 'chair', pos: [p[0] + dx, p[1] + dz], rot: rr + (r() - 0.5) * 0.4 });
      const g = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.1 });
      g.add(mesh(cylGeo(0.04, 0.045, 0.3, 8), glass, p[0] + 0.2, y + 1.0, p[1]));
      g.add(mesh(cylGeo(0.03, 0.025, 0.08, 8), glass, p[0] - 0.15, y + 0.89, p[1] + 0.1));
      addFixed(w, g);
    }
  }
  void L;
  void gb;
  void root;
}

// ---------------- la capilla de las velas ----------------
function buildCapilla(w, root, r, out) {
  const M = w.M;
  const K = ['E'];
  const y = ZONES.E.y;
  const [x0, z0, x1, z1] = zbox('E', true);
  const zc = (z0 + z1) / 2;
  // el altar contra la pared del este, mirando a la nave
  const ax = x1 - 0.45;
  put(w, { type: 'altar', pos: [ax, zc], rot: -Math.PI / 2 });
  // la cruz grande arriba del altar (de madera, pegada a la pared)
  {
    const g = new THREE.Group();
    g.add(mesh(boxGeo(0.08, 2.1, 0.16), M.woodDark, x1 - 0.06, y + 3.05, zc));
    g.add(mesh(boxGeo(0.08, 0.16, 1.2), M.woodDark, x1 - 0.06, y + 3.5, zc));
    addFixed(w, g);
  }
  // los bancos: dos columnas a cada lado del pasillo, mirando al altar
  const benches = [];
  for (const u of [0.36, 0.72]) {
    for (const dz of [-2.1, 2.1]) {
      const x = x0 + (x1 - x0) * u;
      const p = spot(w, out, K, x, zc + dz, 1.35, 0.8);
      if (p && onFloor(w, p[0], p[1], 0.3, K)) {
        put(w, { type: 'pew', pos: p, rot: Math.PI / 2 });
        benches.push(p);
      }
    }
  }
  // ---- cientos de velas: al pie de las paredes, en el altar, en los candeleros ----
  const cand = [];
  const add = (x, yy, z, h) => {
    if (yy <= y + 0.01 && (out(x, z, 0.08) || zoneAtCell(w, x, z) !== 'E')) return;
    cand.push([x, yy, z, h]);
  };
  for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.17) {
    for (const [z, d] of [[z0 + 0.12, 1], [z1 - 0.12, -1]]) {
      if (r() < 0.25) continue;
      add(x + (r() - 0.5) * 0.08, y, z + d * r() * 0.18, 0.08 + r() * 0.28);
    }
  }
  for (let z = z0 + 0.2; z < z1 - 0.1; z += 0.17) {
    if (r() < 0.25) continue;
    if (Math.abs(z - zc) > 1.2) add(x1 - 0.12 - r() * 0.18, y, z, 0.1 + r() * 0.3);
    add(x0 + 0.12 + r() * 0.18, y, z, 0.08 + r() * 0.25);
  }
  // en el escalón del altar y arriba del altar
  for (let k = 0; k < 40; k++) add(ax - 0.7 - r() * 0.35, y, zc - 1.1 + r() * 2.2, 0.06 + r() * 0.2);
  for (let k = 0; k < 30; k++) {
    const z = zc - 0.9 + r() * 1.8;
    if (Math.abs(z - zc) < 0.35) continue;
    cand.push([ax + 0.05 + r() * 0.16, y + 1.03, z, 0.08 + r() * 0.16]);
  }
  // candeleros de pie en las esquinas (cajas de velas escalonadas)
  const fixed = new THREE.Group();
  for (const [u, v] of [[0.16, 0.14], [0.16, 0.86], [0.62, 0.14], [0.62, 0.86]]) {
    const [sx0, sz0] = zat('E', u, v, true);
    const p = spot(w, out, K, sx0, sz0, 0.55, 1.2);
    if (!p) continue;
    const [sx, sz] = p;
    for (let k = 0; k < 3; k++) {
      const hh = 0.35 + k * 0.3;
      const wd = 0.9 - k * 0.22;
      fixed.add(mesh(boxGeo(wd, 0.05, 0.5 - k * 0.1), M.woodDark, sx, y + hh, sz));
      for (let j = 0; j < 6 - k; j++) cand.push([sx + (j / (5 - k) - 0.5) * (wd - 0.12), y + hh + 0.025, sz + (r() - 0.5) * 0.25, 0.08 + r() * 0.14]);
    }
    for (const dx of [-0.42, 0.42]) fixed.add(mesh(boxGeo(0.05, 1.0, 0.05), M.woodDark, sx + dx, y + 0.5, sz));
    w.addBox([sx - 0.47, y, sz - 0.27, sx + 0.47, y + 1.05, sz + 0.27], { kind: 'prop' });
  }
  addFixed(w, fixed);
  const wax = new THREE.MeshStandardMaterial({ color: 0xeee2c4, roughness: 0.55, emissive: 0x2a1a08, emissiveIntensity: 0.4 });
  root.add(
    inst(cylGeo(0.025, 0.03, 1, 7), wax, cand, ([x, yy, z, h], m4) => m4.makeScale(1, h, 1).setPosition(x, yy + h / 2, z), { detail: true }),
    inst(new THREE.ConeGeometry(0.022, 0.075, 5), w.M.flame, cand, ([x, yy, z, h], m4) => m4.makeTranslation(x, yy + h + 0.037, z), { detail: true }),
  );
  // (la cera derretida en el piso: unas manchas)
  const drip = [];
  for (const c of cand) if (c[1] === y && r() < 0.3) drip.push([c[0], c[2], 0.05 + r() * 0.08]);
  root.add(inst(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), wax, drip, ([x, z, s], m4) => m4.makeScale(s, 1, s).setPosition(x, y + 0.004, z), { detail: true }));
}

// ---------------- el camposanto ----------------
function buildCamposanto(w, root, r, out, orbs) {
  const M = w.M;
  const K = ['F'];
  const y = ZONES.F.y;
  // los faroles (sus luces: tags farolF y farolF2)
  farolAt(w, lightTag('farolF'), K, out);
  farolAt(w, lightTag('farolF2'), K, out);
  // tumbas en hileras en el patio grande, el panteón, árboles secos, la fosa, el aljibe
  const placed = [];
  const P = [];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 8; k++) {
      const u = 0.18 + k * 0.085 + (r() - 0.5) * 0.02;
      const v = 0.38 + row * 0.2;
      P.push([u, v, { type: 'tumba', rot: (r() - 0.5) * 0.12, kind: ['stone', undefined, 'fence'][Math.floor(r() * 3)] }, 1.3]);
    }
  }
  P.push([0.12, 0.42, { type: 'panteon', rot: Math.PI / 2 }, 1.6]);
  P.push([0.9, 0.48, { type: 'panteon', rot: -Math.PI / 2 }, 1.6]);
  for (const [u, v] of [[0.05, 0.2], [0.55, 0.15], [0.96, 0.8], [0.35, 0.95]]) P.push([u, v, { type: 'arbolSeco' }, 0.5]);
  P.push([0.76, 0.75, { type: 'fosa', rot: 0.1 }, 1.3]);
  P.push([0.7, 0.2, { type: 'well' }, 1.1]);
  P.push([0.03, 0.62, { type: 'cart', rot: 0.15 }, 1.4]);
  P.push([0.98, 0.3, { type: 'barrel' }, 0.4]);
  P.push([0.4, 0.15, { type: 'cruces', rot: 0 }, 0.8]);
  for (const [u, v, def, rad] of P) {
    const [x, z] = zat('F', u, v, true);
    const p = spot(w, out, K, x, z, rad, 1.2);
    if (!p || placed.some(([x2, z2, r2]) => Math.hypot(x2 - p[0], z2 - p[1]) < r2 + rad * 0.8)) continue;
    put(w, { ...def, pos: p });
    placed.push([p[0], p[1], rad]);
  }
  // la tumba que se levantó: arriba de la fosa, girando despacio (la disformidad)
  {
    const [x, z] = zat('F', 0.76, 0.75, true);
    const g = new THREE.Group();
    g.position.set(x, y + 2.4, z);
    g.rotation.set(0.35, 0.6, -0.25);
    g.add(new THREE.Mesh(mergeGeos([boxGeo(0.9, 0.35, 2.0).clone(), boxGeo(0.7, 1.0, 0.14).clone().translate(0, 0.65, -0.85)]), M.stone));
    const c = mesh(new THREE.PlaneGeometry(0.3, 1.6), crackMat(), 0, -0.2, 0, -Math.PI / 2, 0, 0.4);
    g.add(c);
    root.add(g);
    live.tomb = { g, y: g.position.y };
    orbs.push({ c: [x, y + 2.2, z], r: [1.2, 2.2], h: 1.4, n: 8, s: [0.06, 0.18], sp: 0.3 });
  }
  // las cruces de fierro forjado clavadas en la tierra colorada (instanciadas), algunas torcidas
  const crosses = [];
  const [bx0, bz0, bx1, bz1] = zbox('F');
  for (let t = 0; t < 900 && crosses.length < 52; t++) {
    const x = bx0 + r() * (bx1 - bx0);
    const z = bz0 + r() * (bz1 - bz0);
    if (zoneAtCell(w, x, z) !== 'F' || out(x, z, 0.5) || !onFloor(w, x, z, 0.15, K)) continue;
    if (placed.some(([x2, z2, r2]) => Math.hypot(x2 - x, z2 - z) < r2 + 0.2)) continue;
    if (crosses.some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 0.9)) continue;
    const bent = r() < 0.15;
    crosses.push([x, z, 0.8 + r() * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * (bent ? 0.7 : 0.18)]);
  }
  const cg = ironCrossGeo();
  root.add(
    inst(cg, M.iron, crosses, ([x, z, h, a, lean], m4) => {
      m4.makeRotationFromEuler(new THREE.Euler(lean, a, lean * 0.6)).scale(new THREE.Vector3(h, h, h)).setPosition(x, y - 0.06, z);
    }, { detail: true }),
  );
  for (const [x, z] of crosses) w.addBox([x - 0.12, y, z - 0.12, x + 0.12, y + 0.9, z + 0.12], { kind: 'prop' });
  // pasto seco entre las tumbas
  const tufts = [];
  for (let t = 0; t < 900 && tufts.length < 260; t++) {
    const x = bx0 + r() * (bx1 - bx0);
    const z = bz0 + r() * (bz1 - bz0);
    if (zoneAtCell(w, x, z) !== 'F' || out(x, z, 0.3)) continue;
    tufts.push([x, z, 0.25 + r() * 0.35, r() * 3]);
  }
  const dry = tuftMat().clone();
  dry.color.set(0xf0d8a0);
  dry.userData = { gbuf: CUT_GBUF };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(
    inst(crossGeo(0.6), dry, tufts, ([x, z, h, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.03, z), q, s.set(0.5 + h, h, 0.5 + h));
    }, { detail: true }),
  );
}

// La cruz de fierro forjado: el palo, el travesaño, un círculo en el cruce y las puntas.
function ironCrossGeo() {
  const parts = [];
  const box = (w, h, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  box(0.045, 1.15, 0.045, 0, 0.575, 0);
  box(0.5, 0.045, 0.045, 0, 0.82, 0);
  parts.push(new THREE.TorusGeometry(0.11, 0.012, 4, 14).translate(0, 0.82, 0));
  for (const [x, y] of [[0, 1.17], [0.27, 0.82], [-0.27, 0.82]]) parts.push(new THREE.OctahedronGeometry(0.035, 0).translate(x, y, 0));
  const pos = [];
  const nor = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

// ---------------- el patio del secadero ----------------
// Catres de yerba al sol, la planchada (la yerba tendida en el piso), la
// carreta con raídos, leña, y el cerco de palo que en la punta del vacío se
// levanta y se enrosca.
function buildPatio(w, gb, root, r, out, orbs) {
  const M = w.M;
  const K = ['G2'];
  const y = ZONES.G2.y;
  const [x0, z0, x1, z1] = zbox('G2');
  const [, , mx1, mz1] = zbox('G2', true);
  const lift = (x, z) => {
    // (la esquina del sudeste: el cerco sube y se tuerce)
    const d = Math.hypot(x - x1, z - z1);
    const t = Math.max(0, 1 - d / 7);
    return [t * t * 2.6, t * 0.9];
  };
  paloFence(w, gb, r, K, { ground: 'dirt', twist: lift });
  farolAt(w, lightTag('farolG2'), K, out);
  // la planchada: la yerba tendida en el piso, sobre una lona
  {
    const [x, z] = zat('G2', 0.55, 0.3, true);
    const p = spot(w, out, K, x, z, 1.8, 3);
    if (p) {
      gb.box('sackYerba', p[0] - 1.8, y + 0.002, p[1] - 1.3, p[0] + 1.8, y + 0.02, p[1] + 1.3, 2);
      const heap = [];
      for (let k = 0; k < 14; k++) heap.push([p[0] + (r() - 0.5) * 3, p[1] + (r() - 0.5) * 2]);
      root.add(inst(new THREE.SphereGeometry(0.4, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.yerbaBranch, heap, ([x, z], m4) => m4.makeScale(1, 0.25, 0.8).setPosition(x, y + 0.01, z), { detail: true }));
      put(w, { type: 'barrow', pos: [p[0] + 2.4, p[1] - 0.4], rot: 0.7 });
    }
  }
  for (const [u, v, rad, def] of [[0.25, 0.25, 0.9, { type: 'rack', rot: Math.PI / 2 }], [0.25, 0.7, 0.9, { type: 'rack', rot: Math.PI / 2 }], [0.75, 0.75, 1.4, { type: 'cart', rot: 0.4 }], [0.9, 0.2, 0.8, { type: 'sacks', rot: 0.3 }], [0.55, 0.88, 0.7, { type: 'firewood', rot: 0.2 }], [0.85, 0.45, 0.7, { type: 'bigsacks', rot: 0.4 }]]) {
    const [x, z] = zat('G2', u, v, true);
    const p = spot(w, out, K, x, z, rad, 2.5);
    if (p) put(w, { ...def, pos: p });
  }
  // matas secas contra el cerco
  const tufts = [];
  for (let t = 0; t < 500 && tufts.length < 70; t++) {
    const x = x0 + r() * (x1 - x0);
    const z = z0 + r() * (z1 - z0);
    if (zoneAtCell(w, x, z) !== 'G2' || out(x, z, 0.3)) continue;
    let edge = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (zoneAtCell(w, x + dx * 0.8, z + dz * 0.8) !== 'G2') edge = true;
    if (!edge && r() < 0.7) continue;
    tufts.push([x, z, 0.3 + r() * 0.4, r() * 3]);
  }
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(inst(crossGeo(0.7), tuftMat(), tufts, ([x, z, h, a], m4) => {
    q.setFromAxisAngle(up, a);
    m4.compose(v.set(x, y - 0.03, z), q, s.set(0.6 + h, h, 0.6 + h));
  }, { detail: true }));
  orbs.push({ c: [x1 - 2, y + 2.4, z1 - 2], r: [1, 2.6], h: 2, n: 7, s: [0.05, 0.14], sp: 0.35 });
  void mx1;
  void mz1;
}

// ---------------- la chimenea del barbacuá, suelta (F9) ----------------
function buildChimenea(w, r, orbs) {
  if (!ZONES.F9) return;
  const M = w.M;
  const F = fragment(w, 'F9', { tilt: [0.13, 0.05, 0.1], top: 'brickSoot', seed: 19 });
  const g = F.g;
  // la chimenea de ladrillo (rota abajo, inclinada), con un pedazo de la chapa del secadero
  const ch = new THREE.Group();
  ch.rotation.set(0.1, 0.4, -0.16);
  ch.add(mesh(boxGeo(0.95, 5.2, 0.95), M.brickSoot, 0, 2.4, 0));
  ch.add(mesh(boxGeo(1.15, 0.18, 1.15), M.stone, 0, 5.05, 0));
  ch.add(mesh(boxGeo(1.05, 0.5, 1.05), M.brickSoot, 0, 4.8, 0));
  // (la boca, negra con brasas)
  ch.add(mesh(boxGeo(0.6, 0.05, 0.6), M.black, 0, 5.15, 0));
  ch.add(mesh(boxGeo(2.8, 0.03, 2.0), M.roofTin, 0.9, 1.9, 0.6, 0.25, 0.3, -0.35));
  for (let k = 0; k < 6; k++) ch.add(mesh(boxGeo(0.3, 0.12, 0.2), M.brickSoot, (r() - 0.5) * 2, 0.06, (r() - 0.5) * 2, 0, r() * 3, 0));
  g.add(ch);
  // hierros doblados que asoman del canto
  for (let k = 0; k < 4; k++) g.add(mesh(cylGeo(0.02, 0.02, 1.4 + r(), 5), M.rust, (r() - 0.5) * F.hx * 1.6, -0.3, F.hz + 0.3, 0.6 + r() * 0.5, 0, (r() - 0.5) * 0.6));
  F.finish();
  orbs.push({ c: [g.position.x, g.position.y + 2, g.position.z], r: [2.5, 4.5], h: 3.5, n: 10, s: [0.08, 0.3], sp: 0.18 });
}

// La muela gira con la luz (las poleas las mueve World: son 'flywheel'); las
// ventanas del galpón y del secadero se encienden; las chapas y la tumba flotan.
export function update(dt, t) {
  const S = live;
  if (!S) return;
  const on = !!S.w.power;
  if (on && S.rot) S.rot.rotation.y += dt * 0.9;
  const k = on ? 1.1 : 0.25;
  const m = WIN?.winLit;
  if (m && Math.abs(m.emissiveIntensity - k) > 0.005) m.emissiveIntensity += (k - m.emissiveIntensity) * Math.min(1, dt * 2);
  for (const c of S.chapas) c.m.position.y = c.y + Math.sin(t * c.s + c.p) * 0.18;
  if (S.tomb) {
    S.tomb.g.position.y = S.tomb.y + Math.sin(t * 0.6) * 0.15;
    S.tomb.g.rotation.y += dt * 0.08;
  }
  S.orb?.update(t);
  S.cull?.();
}
