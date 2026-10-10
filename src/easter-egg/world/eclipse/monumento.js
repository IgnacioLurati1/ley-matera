import * as THREE from 'three';
import GeoBuilder from '../GeoBuilder';
import { quad, bbox, lathe, sweep, PROFILE, place, mergeMeshes } from '../monumentoKit';
import { banderaTexture, carvedText, escudoMedallon } from '../monumentoTextures';
import { toTexture } from '../../core/textures';
import { flameMaterial, emberMat } from '../castleFire';
import { ZONES } from '../../config/map';
import { LIGHTS, PORTALS } from '../../config/maps/eclipse';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { islandCells, rimWall, bake, mergedMesh } from './desgarro';
import { fragment, orbiters, grime, portalOrbs, keepOut, tpShift } from './centro';
import { statue } from '../monumentoStatues';

// El Monumento de Eclipse Matero (layout v4). El Patio Cívico con las gradas
// (mA) y el Propileo (mB) vienen TRANSPLANTADOS iguales del Monumento (zonas,
// utilería y luces del config). Lo que allá arma world/monumentoPropileo.js a
// mano va acá COPIADO, corrido como el transplante (tpShift): el basamento,
// los dos pilonos con el medallón del escudo, las cuatro filas de columnas
// planas, el entablamento con las frases del Himno, la cornisa y la terraza,
// el cielorraso de casetones, las farolas de bronce y las urnas de la nave. Las
// piezas que caían encima de un portal de Eclipse no van (ver PROGRESO).
// Y además: la Llama Votiva en su pebetero (EE: ANCHORS.llama), el parapeto
// de travertino del patio (tapa la baranda de Levels), los mástiles-farola de
// bronce con su cruz de cuatro globos sobre el parapeto (donde están las luces
// del patio) y los cuatro pebeteros de la escalinata y las gradas. La proa
// suelta (N9), con el mástil y la bandera que flamea. Manchas de humedad y
// charcos (centro.grime). __mduNoEclipseMonuArt: solo los bloques y lo transplantado.

let LIVE = null;

// lo que no puede quedar encima de un portal (su tajo y su marca): ~2,6 m alrededor
const nearPortal = (x, z, r = 0) => PORTALS.some((p) => [p.a, p.b].some((e) => Math.hypot(e.pos[0] - x, e.pos[1] - z) < 2.6 + r));

export function build(w, g, isl) {
  if (globalThis.__mduNoEclipseMonuArt === true) return;
  const M = w.M;
  const mine = isl.zones.filter((k) => !ZONES[k].frag);
  const cells = islandCells(w, mine.filter((k) => ZONES[k].outdoor));
  const gb = new GeoBuilder();
  const extra = [];
  const mats = {
    ...M,
    globe: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe2b0, emissiveIntensity: 2.0, roughness: 0.3 }),
    ember: emberMat(),
    flame: flameMaterial(),
  };
  // (los bordes que tapa el Propileo con sus pilonos y su basamento no llevan parapeto)
  const kB = mine.find((k) => ZONES[k].tp?.src === 'monumento' && ZONES[k].tp.key === 'B');
  const S = kB ? tpShift(kB) : null;
  const P = S ? { x0: 20.5 + S.dx, x1: 34 + S.dx, z0: 16.5 + S.dz, z1: 43.5 + S.dz, y: 4.2 + S.dy, top: 14.6 + S.dy, pyN: 21 + S.dz, pyS: 40 + S.dz } : null;
  const underProp = (c) => P && c.x + 1 > P.x0 && c.x < P.x1 && c.z + 1 > P.z0 && c.z < P.z1;
  // ---- el parapeto de travertino (con su coronamiento claro)
  rimWall(w, gb, cells, { key: 'travertino', topKey: 'travStep', under: 1.4, top: () => 1.2, skip: underProp });

  // ---- el Propileo (monumentoPropileo.buildPropileo, copiado y corrido)
  const own = [];
  if (P) propileo(w, gb, extra, P, S, own);
  // ---- la Madre Patria (world/monumentoTorre.js la tiene en su nicho; acá
  // el nicho queda tapado por la pared del borde del Patio y la estatua quedaba
  // adentro, con las manos asomando: 2026-10-09, el usuario, "la estatua del
  // frente del Monumento está bugueada"): delante de la pared, bajo el arco,
  // en su pedestal. globalThis.__mduOldEclMadre: en el nicho, como antes
  if (S && globalThis.__mduOldEclMadre !== true) {
    const mx = 66 + S.dx - 0.5;
    const my = 0.8 + S.dy;
    const mz = 30.5 + S.dz;
    bbox(gb, 'travertino', mx - 0.4, my, mz - 1.3, mx + 0.4, my + 0.6, mz + 1.3, { b: 0.03, top: 'travStep' });
    own.push(...statue('madre', M.bronze, mx, my + 0.6, mz, -Math.PI / 2, 1.3));
    w.addBox([mx - 0.45, my, mz - 1.3, mx + 0.45, my + 3.2, mz + 1.3], { kind: 'prop' });
  }

  // ---- los mástiles-farola del patio, sobre el parapeto: los de las luces del
  // config (allá, los del Patio cada 3,5 m) con la cruz de cuatro globos
  const lampHead = lathe([[0, 0], [0.12, 0], [0.16, 0.04], [0.16, 0.08], [0.06, 0.12], [0, 0.12]], 10);
  const lpole = lathe([[0, 0], [0.13, 0], [0.13, 0.14], [0.09, 0.2], [0.07, 0.6], [0.05, 0.66], [0.045, 4.4], [0.06, 4.44], [0.06, 4.5], [0, 4.5]], 10);
  const masts = [];
  for (const L of LIGHTS.filter((l) => mine.includes(l.zone) && l.kind === 'lamp' && Math.abs(l.pos[0] - (P ? (P.x0 + P.x1) / 2 : 0)) > 8)) {
    const c = cells.rim.get(w.idx(Math.floor(L.pos[0]), Math.floor(L.pos[2])));
    const y0 = c ? c.hi + 1.2 : L.pos[1] - 4.5;
    masts.push([L.pos[0], y0, L.pos[2]]);
  }
  // (y los de en medio, sin luz: cada 3,5 m en las dos filas de mástiles)
  const rows = [...new Set(masts.map((m) => m[2]))];
  for (const z of rows) {
    const xs = masts.filter((m) => m[2] === z).map((m) => m[0]);
    if (!xs.length) continue;
    for (let x = Math.min(...xs) - 3.5; x <= Math.max(...xs) + 3.6; x += 3.5) {
      if (xs.some((q) => Math.abs(q - x) < 1)) continue;
      const c = cells.rim.get(w.idx(Math.floor(x), Math.floor(z)));
      if (c) masts.push([x, c.hi + 1.2, z]);
    }
  }
  for (const [x, y0, z] of masts) {
    extra.push([lpole.clone().translate(x, y0, z), 'bronze']);
    for (const [dx, dz] of [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) {
      const arm = new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5);
      if (dx) arm.rotateZ(Math.PI / 2);
      else arm.rotateX(Math.PI / 2);
      extra.push([arm.translate(x + dx / 2, y0 + 4.3, z + dz / 2), 'bronze']);
      extra.push([lampHead.clone().translate(x + dx, y0 + 4.26, z + dz), 'bronze']);
      extra.push([new THREE.SphereGeometry(0.17, 14, 10).translate(x + dx, y0 + 4.5, z + dz), 'globe']);
    }
  }

  // ---- los pebeteros de la escalinata y las gradas (los del original, corridos):
  // en el descanso, en el piso; en las gradas, arriba del parapeto
  const kA = mine.find((k) => ZONES[k].tp?.src === 'monumento' && ZONES[k].tp.key === 'A');
  const SA = kA ? tpShift(kA) : null;
  const peb = lathe([[0, 0], [0.24, 0], [0.24, 0.06], [0.1, 0.12], [0.07, 0.9], [0.12, 0.96], [0.36, 1.08], [0.4, 1.16], [0, 1.12]], 14);
  if (SA) {
    for (const [ox, oz] of [[38.6, 19.6], [38.6, 41.4], [58.75, 17.6], [58.75, 43.4]]) {
      let x = ox + SA.dx;
      let z = oz + SA.dz;
      // (si cae en una grada, sube al parapeto de al lado)
      const i = w.idx(Math.floor(x), Math.floor(z));
      let y0;
      if (w.grid[i] === 1 && w.rampAt[i] < 0) {
        y0 = w.fy[i];
        w.addBox([x - 0.26, y0, z - 0.26, x + 0.26, y0 + 1.2, z + 0.26], { kind: 'prop' });
      } else {
        const zr = z < (isl.box[1] + isl.box[3]) / 2 ? isl.box[1] - 1 : isl.box[3] + 1;
        const c = cells.rim.get(w.idx(Math.floor(x), zr));
        if (!c) continue;
        z = zr + 0.5;
        x = Math.floor(x) + 0.5;
        y0 = c.hi + 1.2;
      }
      extra.push([peb.clone().translate(x, y0, z), 'bronze']);
      extra.push([new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12).translate(x, y0 + 1.13, z), 'ember']);
      for (let k = 0; k < 2; k++) extra.push([new THREE.PlaneGeometry(0.55, 0.85).translate(0, 0.42, 0).rotateY(0.4 + (k * Math.PI) / 2).translate(x, y0 + 1.12, z), 'flame']);
    }
  }

  // ---- la Llama Votiva (el pebetero de papLlama del Monumento)
  const lla = ANCHORS?.llama;
  let fire = null;
  if (lla) {
    const yN = w.floorAt(lla.x, lla.z);
    extra.push([lathe([[0, 0], [1.0, 0], [1.0, 0.12], [0.92, 0.18], [0.92, 0.26], [0, 0.26]], 8).translate(lla.x, yN, lla.z), 'travertino']);
    extra.push([lathe([[0, 0.26], [0.62, 0.26], [0.66, 0.32], [0.55, 0.42], [0.5, 0.9], [0.58, 0.98], [0.62, 1.08], [0.4, 1.14], [0.36, 1.2], [0, 1.2]], 28).translate(lla.x, yN, lla.z), 'bronze']);
    extra.push([lathe([[0.3, 1.18], [0.5, 1.2], [0.86, 1.3], [0.98, 1.4], [0.96, 1.46], [0.8, 1.42], [0.5, 1.36], [0.0, 1.34]], 32).translate(lla.x, yN, lla.z), 'bronze']);
    extra.push([new THREE.BoxGeometry(0.04, 0.22, 0.42).translate(lla.x - 0.53, yN + 0.68, lla.z), 'bronzeDark']);
    w.addBox([lla.x - 0.95, yN, lla.z - 0.95, lla.x + 0.95, yN + 1.5, lla.z + 0.95], { kind: 'prop' });
    fire = new THREE.Group();
    const emb = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18), emberMat());
    emb.position.y = 1.36;
    fire.add(emb);
    const fl = mergedMesh([0, 1, 2, 3].map((k) => new THREE.PlaneGeometry(1.2, 1.8).translate(0, 0.9, 0).rotateY((k / 4) * Math.PI).translate(0, 1.34, 0)), flameMaterial(), { castShadow: false });
    fl.renderOrder = 5;
    fire.add(fl);
    fire.position.set(lla.x, yN, lla.z);
  }

  bake(w, gb, mats, extra, { noShadow: ['globe', 'ember', 'flame'], isla: 'monumento' });
  // (los frisos y los medallones: con su textura propia)
  if (own.length) {
    const og = mergeMeshes(own);
    og.name = 'eclipseIsla-monumento-frisos';
    w.root.add(og);
  }

  // ---- la proa suelta (N9) con el mástil y la bandera
  const live = new THREE.Group();
  live.name = 'eclipseMonumentoLive';
  if (fire) live.add(fire);
  const flagT = { value: 0 };
  const orbs = [];
  if (ZONES.N9) proaSuelta(w, mats, live, flagT, orbs);
  portalOrbs('monumento', orbs);
  const orb = orbiters(w, orbs, { seed: 67 });
  w.root.add(live);
  w.eclipseArt ||= {};
  if (fire) w.eclipseArt.llamaFire = fire;
  // ---- humedad: manchas en el travertino, musgo en las juntas y charcos en el patio
  grime(w, 'monumento', { seed: 6701, damp: 0.2, moss: 0.14, rust: 0.02, drip: 0.2, mud: 0.03, mossFloor: 0.03, puddles: 9, out: keepOut([[lla?.x ?? 0, lla?.z ?? 0, 1.6]]) });
  LIVE = { w, flagT, orb };
}

export function update(dt, t) {
  const L = LIVE;
  if (!L) return;
  L.flagT.value = t;
  flameMaterial().uniforms.uTime.value = t;
  L.orb?.update(t);
}

// ================= el Propileo (monumentoPropileo.js, copiado) =================
const COL_W = 0.42;
const COL_D = 0.76;
function propileo(w, gb, extra, P, S, own) {
  const M = w.M;
  const y = P.y;
  const SHAFT_TOP = 12.9 + S.dy;
  const rowsX = [21.55, 24.4, 30.6, 33.45].map((v) => v + S.dx);
  const cols = Array.from({ length: 12 }, (_, i) => 30.5 + S.dz + (i - 5.5) * 1.59);
  // el basamento (acá abajo está el vacío: baja hasta meterse en la roca)
  const foot = y - 6;
  bbox(gb, 'travertinoBig', P.x0, foot, P.z0, P.x1, y, P.pyN, { b: 0.03, skip: ['top', 'bottom'] });
  bbox(gb, 'travertinoBig', P.x0, foot, P.pyS, P.x1, y, P.z1, { b: 0.03, skip: ['top', 'bottom'] });
  // (el pie de los pilonos: una punta de piedra que entra en la roca)
  for (const [a, b] of [[P.z0, P.pyN], [P.pyS, P.z1]]) {
    const cx = (P.x0 + P.x1) / 2;
    const cz = (a + b) / 2;
    const Q = [[P.x0, foot, a], [P.x1, foot, a], [P.x1, foot, b], [P.x0, foot, b]];
    const tip = [cx, foot - 5, cz];
    for (let k = 0; k < 4; k++) quad(gb, 'travertinoDark', [Q[k], Q[(k + 1) % 4], tip, tip], [Q[k][0] + Q[(k + 1) % 4][0] - 2 * cx, -1, Q[k][2] + Q[(k + 1) % 4][2] - 2 * cz]);
  }
  // los pilonos (macizos; el del norte tenía la puerta de la Sala: acá va cerrada, de bronce)
  const yT = SHAFT_TOP;
  bbox(gb, 'travertinoBig', P.x0, y, P.z0, P.x1, yT, P.pyN, { b: 0.04, skip: ['top', 'bottom'] });
  bbox(gb, 'travertinoBig', P.x0, y, P.pyS, P.x1, yT, P.z1, { b: 0.04, skip: ['top', 'bottom'] });
  const dx0 = 31 + S.dx;
  const dx1 = 33 + S.dx;
  bbox(gb, 'bronzeDark', dx0 + 0.08, y, P.pyN, dx1 - 0.08, y + 2.6, P.pyN + 0.05, { b: 0.01 });
  bbox(gb, 'travertinoDark', dx0 - 0.12, y, P.pyN, dx0 + 0.08, y + 2.8, P.pyN + 0.1, { b: 0.01 });
  bbox(gb, 'travertinoDark', dx1 - 0.08, y, P.pyN, dx1 + 0.12, y + 2.8, P.pyN + 0.1, { b: 0.01 });
  bbox(gb, 'travertinoDark', dx0 - 0.12, y + 2.6, P.pyN, dx1 + 0.12, y + 2.85, P.pyN + 0.12, { b: 0.01 });
  // los zócalos y una faja a media altura, por afuera
  const Z = PROFILE.zocalo(1.4);
  const L = PROFILE.listel(1.2);
  for (const [a, b, out] of [
    [[P.x0, P.z0], [P.x0, P.pyN], [-1, 0]],
    [[P.x1, P.pyN], [P.x1, P.z0], [1, 0]],
    [[P.x0, P.z0], [P.x1, P.z0], [0, -1]],
    [[P.x0, P.pyS], [P.x0, P.z1], [-1, 0]],
    [[P.x1, P.z1], [P.x1, P.pyS], [1, 0]],
    [[P.x1, P.z1], [P.x0, P.z1], [0, 1]],
  ]) {
    sweep(gb, 'travertinoDark', a, b, out, Z, { y, caps: true });
    sweep(gb, 'travertino', a, b, out, L, { y: y + 4.0, caps: true });
  }
  sweep(gb, 'travertinoDark', [P.x1, P.pyS], [P.x0, P.pyS], [0, -1], Z, { y });
  sweep(gb, 'travertinoDark', [P.x0, P.pyN], [dx0, P.pyN], [0, 1], Z, { y });
  sweep(gb, 'travertinoDark', [dx1, P.pyN], [P.x1, P.pyN], [0, 1], Z, { y });
  // el entablamento y el techo
  const yE = SHAFT_TOP;
  bbox(gb, 'travertinoBig', P.x0 - 0.05, yE, P.z0 - 0.05, P.x1 + 0.05, P.top - 0.32, P.z1 + 0.05, { b: 0.04, skip: ['top', 'bottom'] });
  for (const [a, b, c, d] of [[P.x0 - 0.05, P.z0 - 0.05, P.x1 + 0.05, P.z0], [P.x0 - 0.05, P.z1, P.x1 + 0.05, P.z1 + 0.05], [P.x0 - 0.05, P.z0, P.x0, P.z1], [P.x1, P.z0, P.x1 + 0.05, P.z1]]) quad(gb, 'travertinoBig', [[a, yE, b], [c, yE, b], [c, yE, d], [a, yE, d]], [0, -1, 0]);
  quad(gb, 'travertino', [[P.x0, yE, P.pyN], [P.x1, yE, P.pyN], [P.x1, yE + 0.6, P.pyN], [P.x0, yE + 0.6, P.pyN]], [0, 0, 1]);
  quad(gb, 'travertino', [[P.x0, yE, P.pyS], [P.x1, yE, P.pyS], [P.x1, yE + 0.6, P.pyS], [P.x0, yE + 0.6, P.pyS]], [0, 0, -1]);
  const c4 = [[P.x0 - 0.05, P.z0 - 0.05], [P.x0 - 0.05, P.z1 + 0.05], [P.x1 + 0.05, P.z1 + 0.05], [P.x1 + 0.05, P.z0 - 0.05]];
  const outs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (let i = 0; i < 4; i++) sweep(gb, 'travertino', c4[i], c4[(i + 1) % 4], outs[i], PROFILE.cornisa(1), { y: P.top - 0.32, caps: false });
  bbox(gb, 'travertinoDark', P.x0 + 0.2, P.top - 0.32, P.z0 + 0.2, P.x1 - 0.2, P.top - 0.18, P.z1 - 0.2, { b: 0.02 });
  // el cielorraso de la nave: casetones entre vigas
  const yC = yE;
  quad(gb, 'travertino', [[P.x0, yC + 0.6, P.pyN], [P.x1, yC + 0.6, P.pyN], [P.x1, yC + 0.6, P.pyS], [P.x0, yC + 0.6, P.pyS]], [0, -1, 0]);
  for (const x of rowsX) bbox(gb, 'travertino', x - 0.4, yC, P.pyN, x + 0.4, yC + 0.62, P.pyS, { b: 0.02, skip: ['top'] });
  for (const z of cols) bbox(gb, 'travertino', P.x0, yC + 0.25, z - 0.22, P.x1, yC + 0.62, z + 0.22, { b: 0.02, skip: ['top'] });
  // las columnas (las que caían encima de un portal, no)
  for (const x of rowsX) {
    for (const z of cols) {
      if (nearPortal(x, z, 0.4)) continue;
      bbox(gb, 'travertinoDark', x - COL_D / 2 - 0.04, y, z - COL_W / 2 - 0.04, x + COL_D / 2 + 0.04, y + 0.22, z + COL_W / 2 + 0.04, { b: 0.02 });
      bbox(gb, 'travertino', x - COL_D / 2, y + 0.22, z - COL_W / 2, x + COL_D / 2, SHAFT_TOP, z + COL_W / 2, { b: 0.025, corners: true, skip: ['top', 'bottom'] });
      w.addBox([x - COL_D / 2, y + 1.02, z - COL_W / 2, x + COL_D / 2, SHAFT_TOP, z + COL_W / 2], { kind: 'prop' });
      w.addBox([x - COL_D / 2, y - 0.1, z - COL_W / 2, x + COL_D / 2, y + 1.02, z + COL_W / 2], { kind: 'prop' });
    }
  }
  // los frisos con las frases (al Patio y al Pasaje)
  frieze(own, 'Y LOS LIBRES DEL MUNDO RESPONDEN · AL GRAN PUEBLO ARGENTINO ¡SALUD!', P.x1 + 0.066, Math.PI / 2, P, SHAFT_TOP);
  frieze(own, 'OÍD MORTALES EL GRITO SAGRADO · ¡LIBERTAD! ¡LIBERTAD! ¡LIBERTAD!', P.x0 - 0.066, -Math.PI / 2, P, SHAFT_TOP);
  // los medallones del escudo en los pilonos (de los dos lados)
  const medMat = new THREE.MeshStandardMaterial({ map: toTexture(escudoMedallon(512)), roughness: 0.85 });
  const med = new THREE.CircleGeometry(1.15, 40);
  for (const z of [(P.z0 + P.pyN) / 2, (P.pyS + P.z1) / 2]) {
    for (const [x, ry] of [[P.x1 + 0.012, Math.PI / 2], [P.x0 - 0.012, -Math.PI / 2]]) own.push(place(med, medMat, x, 11.0 + S.dy, z, ry));
  }
  // las farolas de bronce delante de cada columna de los frentes
  const lampGeo = lampColumn();
  const bowl = new THREE.CylinderGeometry(0.29, 0.16, 0.05, 12);
  for (const [x, dx] of [[rowsX[0], 0.78], [rowsX[3], -0.78]]) {
    for (const z of cols) {
      if (nearPortal(x + dx, z, 0.3)) continue;
      extra.push([lampGeo.clone().translate(x + dx, y, z), 'bronze']);
      extra.push([bowl.clone().translate(x + dx, y + 2.18, z), 'lampGlass']);
      w.addBox([x + dx - 0.16, y, z - 0.16, x + dx + 0.16, y + 2.25, z + 0.16], { kind: 'prop' });
    }
  }
  // las ocho urnas de bronce de la nave (en su dado de travertino)
  const urn = urnGeo();
  for (const ox of [26.0, 29.0]) {
    for (const oz of [23.6, 26.4, 34.6, 37.4]) {
      const x = ox + S.dx;
      const z = oz + S.dz;
      if (nearPortal(x, z, 0.5)) continue;
      bbox(gb, 'travertino', x - 0.42, y, z - 0.42, x + 0.42, y + 0.85, z + 0.42, { b: 0.04, top: 'travStep' });
      extra.push([urn.clone().translate(x, y + 0.85, z), 'bronze']);
      w.addBox([x - 0.42, y, z - 0.42, x + 0.42, y + 1.9, z + 0.42], { kind: 'prop' });
    }
  }
  void M;
}
// El friso: una tira de texto tallado arriba de las columnas (el texto del original).
function frieze(own, text, x, ry, P, shaftTop) {
  const tex = toTexture(carvedText(text, { w: 4096, h: 160, size: 92, spacing: 0.28 }));
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const L = P.z1 - P.z0 - 2.2;
  const geo = new THREE.PlaneGeometry(L, (L * 160) / 4096);
  own.push(place(geo, mat, x, shaftTop + 0.75, (P.z0 + P.z1) / 2, ry));
}
function lampColumn() {
  return lathe([[0, 0], [0.2, 0], [0.2, 0.08], [0.16, 0.12], [0.13, 0.2], [0.075, 0.26], [0.06, 0.34], [0.075, 0.38], [0.06, 0.42], [0.05, 1.7], [0.068, 1.74], [0.068, 1.82], [0.055, 1.86], [0.06, 1.95], [0.12, 2.02], [0.24, 2.1], [0.31, 2.17], [0.3, 2.2], [0.0, 2.2]], 8);
}
function urnGeo() {
  return lathe([[0, 0], [0.24, 0], [0.24, 0.05], [0.15, 0.1], [0.11, 0.18], [0.16, 0.24], [0.3, 0.38], [0.37, 0.55], [0.36, 0.7], [0.28, 0.84], [0.2, 0.9], [0.19, 0.96], [0.26, 1.0], [0.27, 1.04], [0.2, 1.04], [0.18, 0.98], [0, 0.98]], 24);
}

// ================= la proa suelta (N9) =================
// La proa del Monumento (el espolón de travertino que mira al río), arrancada y
// flotando inclinada, con el mástil de bronce y la bandera que flamea.
function proaSuelta(w, mats, live, flagT, orbs) {
  const F = fragment(w, 'N9', { tilt: [0.06, -0.5, 0.12], top: 'travPave', thick: 3.4, seed: 31 });
  const gb = new GeoBuilder();
  const HL = F.hx + 0.6;
  const HW = F.hz;
  // la cubierta en punta (sube hacia la punta) y los costados hasta la quilla
  const A = [-HL * 0.4, 0.05, -HW];
  const B = [-HL * 0.4, 0.05, HW];
  const Tp = [HL + 2.2, 1.1, 0];
  const K0 = [-HL * 0.4, -4.5, 0];
  const KT = [HL + 1.6, -0.6, 0];
  quad(gb, 'travPave', [A, Tp, Tp, B], [0, 1, 0]);
  quad(gb, 'travertinoBig', [A, Tp, KT, K0], [0.3, 0, -1]);
  quad(gb, 'travertinoBig', [B, K0, KT, Tp], [0.3, 0, 1]);
  quad(gb, 'travertinoBig', [A, B, K0, K0], [-1, 0, 0]);
  // el cordón claro de los dos filos
  for (const [P0, s] of [[A, -1], [B, 1]]) {
    const dx = Tp[0] - P0[0];
    const dz = Tp[2] - P0[2];
    const L = Math.hypot(dx, dz);
    const nx = (dz / L) * s;
    const nz = (-dx / L) * s;
    const o = (p, e, u) => [p[0] + nx * e, p[1] + u, p[2] + nz * e];
    quad(gb, 'travStep', [o(P0, 0, 0.03), o(Tp, 0, 0.03), o(Tp, 0.14, 0.03), o(P0, 0.14, 0.03)], [0, 1, 0]);
  }
  F.g.add(gb.build(mats));
  // el mástil y su base, cerca de la punta
  const mx = HL * 0.75;
  const my = 0.05 + (1.1 - 0.05) * ((mx + HL * 0.4) / (HL + 2.2 + HL * 0.4));
  const ex = [];
  ex.push(lathe([[0, 0], [0.42, 0], [0.42, 0.12], [0.34, 0.18], [0.3, 0.5], [0.36, 0.56], [0.36, 0.62], [0, 0.62]], 12).translate(mx, my - 0.05, 0));
  const pole = lathe([[0, 0], [0.11, 0], [0.09, 0.4], [0.075, 8], [0.055, 12.5], [0, 12.5]], 10).translate(mx, my + 0.55, 0);
  F.g.add(mergedMesh([ex[0]], mats.travertinoBig), mergedMesh([pole, new THREE.SphereGeometry(0.14, 12, 8).translate(mx, my + 13.15, 0)], mats.bronze));
  F.g.updateMatrixWorld(true);
  F.finish();
  // la bandera (se mueve: va aparte, colgada del mismo lugar que el mástil)
  const flag = flagMesh(flagT, 3.6, 2.25);
  const top = new THREE.Vector3(mx, my + 0.55 + 12.35, 0.05).applyMatrix4(F.g.matrixWorld);
  flag.position.copy(top);
  flag.rotation.y = F.g.rotation.y + Math.PI / 2;
  live.add(flag);
  const Z = ZONES.N9;
  orbs.push({ c: [F.g.position.x, Z.y + 1.5, F.g.position.z], r: [3.4, 5.6], h: 3, n: 8, s: [0.12, 0.3], sp: 0.28 });
}

// La bandera que flamea (la del Monumento: world/monumentoDecor.js).
function flagMesh(uT, wid, hgt, amp = 0.28) {
  const geo = new THREE.PlaneGeometry(wid, hgt, 16, 6).translate(wid / 2, -hgt / 2, 0);
  const u = { uT, uAmp: { value: amp } };
  const mat = new THREE.MeshStandardMaterial({ map: banderaTexture(), side: THREE.DoubleSide, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = u.uT;
    s.uniforms.uAmp = u.uAmp;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT;\nuniform float uAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { float u = uv.x; float wv = sin(u * 9.0 - uT * 4.2 + position.y * 1.3) * 0.5 + sin(u * 4.3 - uT * 2.7) * 0.5;
          transformed.z += wv * uAmp * u; transformed.y -= u * u * uAmp * 0.25; }`,
      );
  };
  mat.customProgramCacheKey = () => 'monFlag';
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
