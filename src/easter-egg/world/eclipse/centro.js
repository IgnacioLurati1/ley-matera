import * as THREE from 'three';
import { MAP_W, MAP_H, ZONES, PERK_SPOTS, WALL_BUYS, BOX_SPOTS, POWER, PAP, RISERS, DOORS, RAMPS, PLAYER_START, EE, ACT, WATER_Y, MAPS } from '../../config/map';
import { PORTALS, LIGHTS, ISLANDS } from '../../config/maps/eclipse';
import { buildProp, mesh, cylGeo, boxGeo, compactGroup } from '../props';
import GeoBuilder from '../GeoBuilder';
import Water from '../../fx/Water';
import { rng } from '../../core/noise';
import { coverageMips } from '../../core/textures';
import { leafCrownGeometry, evenFoliage } from '../esterosGrass';
import { windy } from '../../fx/grassPush';
import { jitterGrass } from '../../fx/TAA';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';

// El Claro del Algarrobo (isla "centro" de Eclipse Matero, layout v4), lo que
// no sale del armado en bloques:
//  · la loma (A2) con el algarrobo de los colgados partido por la grieta
//    violeta, el santuario del Gauchito, el cráter del portal sellado y el
//    alambrado que se tuerce y sube al aire;
//  · el claro (A): el fogón de Fierro, la grieta que lo cruza con piedras que
//    flotan arriba, sendas de tierra pisada, la enramada, la carreta, los
//    rollizos, cruces con cintas, palmeras, monte, piedras grandes, el pajonal;
//  · la laguna (B) con agua de verdad (fx/Water, solo adentro), el bordo de
//    pajonal, los irupés, el muelle viejo y el bote;
//  · la Iglesia de la Reducción y su cripta, y la Barraca del obraje, IGUALES
//    a Mate no Numa (la utilería y las luces vienen del transplante; acá los
//    muros en ruinas, el piso de calcáreo y el techo de paja, como allá);
//  · los pedazos que flotan: el del muelle (A8) y el del pajonal (A9).
// Todo lo que se ubica sale de ZONES/ISLANDS/LIGHTS del config (nada fijo).
//
// También están acá los ayudantes de las islas de arte-A (molino, tapera,
// penal): keepOut, put, inst, grime (oclusión, humedad, musgo, charcos),
// orbiters (piedras que giran), fragment (pedazos sueltos inclinados)...
// Optimizado: utilería por World.addStatic (junta por material), repetido
// instanciado, las capas de suciedad en pocas mallas por isla.

export const FLOOR = 1;
export const OUT = 0;
export const WALL = 2;
export const DOOR = 3;
export const WIN = 4;
export const EDGE_FENCE = 1;
export const EDGE_CORN = 2;
export const EDGE_RAIL = 3;

// ---------------- ayudantes (también para molino, tapera y penal) ----------------

// La caja de una zona en metros: [x0, z0, x1, z1] (x1/z1: el borde de afuera de
// la última celda), de todos sus rects o del más grande (main).
export function zbox(k, main = false) {
  const R = ZONES[k]?.rects || [];
  if (main) {
    const r = R.reduce((a, b) => ((b[2] - b[0] + 1) * (b[3] - b[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? b : a), R[0]);
    return [r[0], r[1], r[2] + 1, r[3] + 1];
  }
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const r of R) {
    x0 = Math.min(x0, r[0]);
    z0 = Math.min(z0, r[1]);
    x1 = Math.max(x1, r[2] + 1);
    z1 = Math.max(z1, r[3] + 1);
  }
  return [x0, z0, x1, z1];
}
// Un punto de la caja de una zona (fracciones de 0 a 1).
export const zat = (k, fx, fz, main = false) => {
  const [x0, z0, x1, z1] = zbox(k, main);
  return [x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz];
};
// La luz del config con ese `tag` (las .py de arte-A eligen dónde; acá se arma alrededor).
export const lightTag = (tag) => LIGHTS.find((l) => l.tag === tag) || null;
// El corrimiento de una zona transplantada respecto de su mapa de origen.
export function tpShift(k) {
  const Z = ZONES[k];
  const S = Z?.tp && MAPS[Z.tp.src]?.ZONES?.[Z.tp.key];
  if (!S) return null;
  const a = zbox(k);
  const R = S.rects || [S.rect];
  const bx = Math.min(...R.map((r) => r[0]));
  const bz = Math.min(...R.map((r) => r[1]));
  return { dx: a[0] - bx, dz: a[1] - bz, dy: (Z.y || 0) - (S.y || 0), src: Z.tp.src, key: Z.tp.key, S };
}

// Lo que no se tapa: máquinas, cajas, tizas, la luz, el Pack-a-Pava, los
// portales (2 m alrededor y su marca), aparecidos, puertas, el inicio, el banco
// y los anclajes del easter egg que se le pasen.
export function keepOut(extra = []) {
  const pts = [];
  for (const d of [...PERK_SPOTS, ...WALL_BUYS, ...BOX_SPOTS, POWER, PAP].filter(Boolean)) pts.push([d.cell[0] + 0.5 + d.face[0] * 0.9, d.cell[1] + 0.5 + d.face[1] * 0.9, 1.7]);
  // (mundo, it. 4: 1,6 m + el radio que pasa cada uno dejaba utilería grande pegada a las
  // puertas -los radios son menores que la pieza-; con 2,3 m quedan 1,2 m libres delante)
  const DR = globalThis.__mduNoDoorClear === true ? 1.6 : 2.3;
  for (const d of DOORS) for (const [x, z] of d.cells) pts.push([x + 0.5, z + 0.5, DR]);
  for (const r of RISERS) pts.push([r.pos[0], r.pos[1], 1.2]);
  for (const p of PORTALS) for (const e of [p.a, p.b]) pts.push([e.pos[0], e.pos[1], 3]);
  pts.push([PLAYER_START.x, PLAYER_START.z, 1.6]);
  if (ACT?.bench) pts.push([ACT.bench.pos[0], ACT.bench.pos[1], 1.7]);
  pts.push(...extra);
  return (x, z, rad = 0) => pts.some(([px, pz, rr]) => Math.hypot(x - px, z - pz) < rr + rad);
}

// La zona del piso en (x, z) (o null).
export function zoneAtCell(w, x, z) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (!w.inside(cx, cz)) return null;
  const i = w.idx(cx, cz);
  if (w.grid[i] !== FLOOR) return null;
  return w.zoneKeys[w.zone[i]] || null;
}

// ¿Todo el círculo (x, z, rad) es piso de alguna de estas zonas, plano y sin rampas?
export function onFloor(w, x, z, rad, keys) {
  const y0 = w.floorAt(x, z);
  for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad * 0.7, rad * 0.7], [-rad * 0.7, rad * 0.7], [rad * 0.7, -rad * 0.7], [-rad * 0.7, -rad * 0.7]]) {
    const k = zoneAtCell(w, x + ox, z + oz);
    if (!k || !keys.includes(k)) return false;
    if (w.rampAt?.[w.idx(Math.floor(x + ox), Math.floor(z + oz))] >= 0) return false;
    if (Math.abs(w.floorAt(x + ox, z + oz) - y0) > 0.02) return false;
  }
  return true;
}

// Un lugar libre cerca de (x, z): el mismo si entra, si no en espiral hasta
// `reach` metros (con radio `rad`, en las zonas `keys`, fuera de lo reservado).
export function spot(w, out, keys, x, z, rad, reach = 2.5) {
  if (onFloor(w, x, z, rad, keys) && !out(x, z, rad)) return [x, z];
  for (let d = 0.35; d <= reach; d += 0.35) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + d;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (onFloor(w, px, pz, rad, keys) && !out(px, pz, rad)) return [px, pz];
    }
  }
  return null;
}

// Un constructor de utilería (world/props.js y los que se registran) apoyado
// en su piso: sus cajas al mundo y lo quieto a World.addStatic (junto por
// material en todo el mapa). Lo dinámico (llamas, volantes, aspas) va suelto
// a w.root y, si World lo sabe mover, a su lista. Devuelve el objeto armado.
// (Cada utilería deja su huella para la sombra de contacto de grime.)
let SEED = 7000;
export const FOOT = [];
export function put(w, def, { boxes = true, seed, scale = 1, foot = true } = {}) {
  const d = def.y == null ? { ...def, y: w.floorAt(def.pos[0], def.pos[1]) } : def;
  const sd = seed ?? (SEED += 17);
  const res = buildProp(d, w.M, sd);
  // (el fogón del claro: con qué suerte se armó, para rehacerlo igual —el
  // final de Eclipse lo deja solo en el blanco, ui/EclipseEnding voidStart—)
  if (def.type === 'fogonCampo') w.fogonSeed = sd;
  if (!res) {
    console.warn('[eclipse arte] sin constructor:', def.type);
    return null;
  }
  // (más grande o más chico, desde su pie)
  if (scale !== 1) {
    res.obj.scale.setScalar(scale);
    const [px, pz] = d.pos;
    const py = d.y;
    for (const bx of res.boxes) {
      for (const [k, o] of [[0, px], [1, py], [2, pz], [3, px], [4, py], [5, pz]]) bx[k] = o + (bx[k] - o) * scale;
    }
  }
  if (def.type === 'well') res.obj.traverse((o) => { if (o.name === 'wellRig') o.userData.dynamic = false; });
  if (boxes) for (const b of res.boxes) w.addBox(b, { kind: 'prop', firm: !!res.firm });
  if (foot) for (const b of res.boxes) if (b[1] < d.y + 0.3 && b[3] - b[0] < 6 && b[5] - b[2] < 6) FOOT.push([(b[0] + b[3]) / 2, d.y, (b[2] + b[5]) / 2, (b[3] - b[0]) / 2 + 0.25, (b[5] - b[2]) / 2 + 0.25]);
  addFixed(w, res.obj);
  return res;
}

// El GeoBuilder de una isla a mallas: sin sombra en lo que se apoya sobre lo de
// Levels (que ya la echa: cordones, caras de afuera, pisos) y en lo chico
// (ventanas, marcos): cada malla con sombra se vuelve a dibujar en cada pasada
// de sombra (la luna y las luces que la tienen).
const NO_SHADOW = new Set(['winLit', 'winNight', 'winChapel', 'trim', 'whiteTrim', 'woodDark', 'iron', 'eclCurbTop', 'eclCurbSide', 'caveRock', 'calcareoEst', 'penalStone', 'penalTop', 'penalBoard', 'dirt', 'dirtDark', 'grass', 'sackYerba']);
// Con `w`: lo que no cambia va a World.addStatic (junto por material con la
// utilería de todo el mapa: un dibujo por material, no uno por isla); en la
// escena quedan solo los vidrios (el de afuera se prende con la luz).
const KEEP = new Set(['winLit', 'winNight', 'winChapel']);
// (los materiales de arte-A: a esos sí se les puede decir que no tiren sombra)
export const OWN_MATS = new Set();
export function buildArch(gb, mats, name, w = null) {
  const keys = [...gb.buckets.keys()];
  const arch = gb.build(mats);
  arch.children.forEach((m, i) => {
    if (NO_SHADOW.has(keys[i])) m.castShadow = false;
  });
  arch.name = name;
  if (w && globalThis.__mduNoArteStatic !== true) {
    for (const [i, m] of [...arch.children].entries()) {
      if (KEEP.has(keys[i])) continue;
      // (lo que no tira sombra, tampoco junto: los materiales propios lo dicen)
      if (NO_SHADOW.has(keys[i]) && OWN_MATS.has(m.material)) m.material.userData.noShadow = true;
      w.addStatic(m);
      arch.remove(m);
    }
  }
  return arch;
}

// Lo quieto de un grupo a World.addStatic y lo que se mueve suelto (como World.buildProps).
export function addFixed(w, obj) {
  obj.updateMatrixWorld(true);
  const dyn = [];
  obj.traverse((o) => {
    if (o.userData.dynamic) dyn.push(o);
  });
  w.addStatic(obj);
  for (const d of dyn) {
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    d.getWorldPosition(wp);
    d.getWorldQuaternion(wq);
    d.removeFromParent();
    d.position.copy(wp);
    d.quaternion.copy(wq);
    if (d.name !== 'wellRig') compactGroup(d);
    w.root.add(d);
    if (d.name === 'flywheel') w.dynamic.flywheels.push(d);
    else if (d.name === 'fan') w.dynamic.fans.push(d);
    else if (d.name === 'spin') (w.dynamic.spins ||= []).push(d);
    else if (d.name === 'kilnGlow' && !w.dynamic.kilnGlow) w.dynamic.kilnGlow = d;
  }
}

// Un InstancedMesh quieto con una matriz por item (fn(item, m4) la llena).
const _m = new THREE.Matrix4();
export function inst(geo, mat, list, fn, { shadow = false, detail = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((it, k) => {
    fn(it, _m);
    im.setMatrixAt(k, _m);
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.matrixAutoUpdate = false;
  im.updateMatrix();
  im.userData.detail = detail;
  return im;
}

// Una mata: planos cruzados (n) de ancho wd y alto 1 (se estira en y), con
// la normal para arriba (se ilumina pareja de los dos lados).
export function crossGeo(wd, n = 2) {
  const geo = new THREE.BufferGeometry();
  const P = [];
  const U = [];
  const I = [];
  for (let k = 0; k < n; k++) {
    const a = (k * Math.PI) / n;
    const cx = (Math.cos(a) * wd) / 2;
    const cz = (Math.sin(a) * wd) / 2;
    const b = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const nn = geo.attributes.normal;
  for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0);
  return geo;
}

export function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Matas de pasto: tallitos finos, verdes y pajizos (la del estero).
let tuftMatC = null;
export function tuftMat() {
  if (tuftMatC) return tuftMatC;
  const tex = canvasTex(128, 128, (x) => {
    const r = rng(31);
    x.lineCap = 'round';
    for (let k = 0; k < 70; k++) {
      const bx = 10 + r() * 108;
      const top = 10 + r() * 70;
      const lean = (r() - 0.5) * 40;
      const d = r();
      x.strokeStyle = `rgb(${50 + d * 60},${66 + d * 50},${26 + d * 18})`;
      x.lineWidth = 1 + r() * 1.5;
      x.beginPath();
      x.moveTo(bx, 128);
      x.quadraticCurveTo(bx + lean * 0.3, 70, bx + lean, top);
      x.stroke();
    }
  });
  tuftMatC = windy(evenFoliage(new THREE.MeshStandardMaterial({ map: coverageMips(tex, 0.45), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 })));
  cutToGbuf(tuftMatC);
  return tuftMatC;
}

// Los recortes (paja, juncos, maíz, matas) también van al G-buffer de fx/Epic
// (como el maizal del Prado): si no, en Alta y más la oclusión y la niebla con
// luz de lo de atrás se dibujaban encima y la paja se veía transparente.
export const CUT_GBUF = { key: 'eclCut', patch() {} };
export function cutToGbuf(...mats) {
  for (const m of mats) {
    if (m && !m.userData.gbuf) m.userData.gbuf = CUT_GBUF;
    // (sesión 1f, el usuario: "el pasto sigue titilando en los bordes, efecto
    // sierra": en Épica el suavizado temporal promedia el pasto marcado, pero
    // sin correrlo una fracción de píxel por cuadro (fx/TAA jitterGrass) el
    // promedio era siempre la misma escalera. Solo el de las matas tenía.
    // __mduNoEclGrassJit: como antes)
    if (m && globalThis.__mduNoEclGrassJit !== true) jitterGrass(m);
  }
}

// Una grieta de luz violeta (la del desgarro): alfa con un rayo quebrado.
let crackMatC = null;
export function crackMat() {
  if (crackMatC) return crackMatC;
  const tex = canvasTex(64, 256, (x, w, h) => {
    const r = rng(77);
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    const path = [];
    let px = w / 2;
    for (let y = 0; y <= h; y += 8) {
      px = Math.max(14, Math.min(w - 14, px + (r() - 0.5) * 14));
      path.push([px, y]);
    }
    for (const [lw, a] of [[22, 0.18], [12, 0.4], [5, 1]]) {
      x.strokeStyle = `rgba(255,255,255,${a})`;
      x.lineWidth = lw;
      x.lineJoin = 'round';
      x.beginPath();
      path.forEach(([px2, py], k) => (k ? x.lineTo(px2, py) : x.moveTo(px2, py)));
      x.stroke();
    }
  });
  crackMatC = new THREE.MeshBasicMaterial({ map: tex, color: 0xc690ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return crackMatC;
}

// La misma grieta en el piso: más violeta y menos blanca (de cerca encandilaba).
let floorCrackC = null;
export function floorCrackMat() {
  if (!floorCrackC) {
    floorCrackC = crackMat().clone();
    floorCrackC.color.set(0x8a38e0);
  }
  return floorCrackC;
}

// Piedra negra con vetas violetas (lo que arrancó la disformidad: las piedras que
// flotan y los cantos de los pedazos sueltos).
let voidRockC = null;
export function voidRockMat(w) {
  if (voidRockC) return voidRockC;
  const em = canvasTex(256, 256, (x, W, H) => {
    const r = rng(303);
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) {
      x.strokeStyle = `rgba(${170 + r() * 60},${90 + r() * 40},255,${0.5 + r() * 0.5})`;
      x.lineWidth = 1 + r() * 2.5;
      x.beginPath();
      let px = r() * W;
      let py = r() * H;
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        px += (r() - 0.5) * 70;
        py += (r() - 0.5) * 70;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  }, { repeat: true });
  voidRockC = new THREE.MeshStandardMaterial({ map: w.T.rock, color: 0x5a5260, emissiveMap: em, emissive: 0xb070ff, emissiveIntensity: 1.1, roughness: 0.9, flatShading: true });
  return voidRockC;
}

// La caja de una isla con un margen (para recorrer sus celdas).
function islCells(w, isl, fn, pad = 3) {
  const [x0, z0, x1, z1] = ISLANDS[isl].box;
  for (let z = Math.max(1, z0 - pad); z <= Math.min(MAP_H - 2, z1 + pad); z++) {
    for (let x = Math.max(1, x0 - pad); x <= Math.min(MAP_W - 2, x1 + pad); x++) fn(x, z, w.idx(x, z));
  }
}

// ---------------- la suciedad: oclusión horneada, humedad, musgo, hollín, charcos ----------------
// Por isla, en pocas mallas:
//  · la oclusión (negro con alfa por vértice): al pie de cada pared (en el piso
//    y subiendo por la pared), contra el cielorraso de lo techado y abajo del
//    alero en las caras de afuera; las esquinas quedan más oscuras solas;
//  · las manchas de pared (un atlas: humedad que sube, hollín, musgo, chorreado
//    de óxido) y las de piso (humedad, sombra de contacto abajo de la utilería,
//    barro, musgo);
//  · los charcos: espejitos oscuros y lisos (toman el brillo de las luces).
// opts: { keys, damp, moss, rust, mud, puddles, soot: [[x, y, z, nx, nz, w, h]], wet: zonas mojadas }
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const r = rng(812);
  const blob = (x, cx, cy, R, n, rgb, a0) => {
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * R;
      const px = cx + Math.cos(ang) * d;
      const py = cy + Math.sin(ang) * d;
      const rad = R * (0.18 + r() * 0.4) * (1 - (d / R) * 0.6);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${rgb},${a0})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, rad, 0, Math.PI * 2);
      x.fill();
    }
  };
  // paredes: [humedad que sube | hollín | musgo | chorreado]
  const wall = canvasTex(1024, 256, (x) => {
    // humedad: de abajo para arriba, borde ondulado con la línea de sal.
    // (sesión 1f, el usuario: "sombras fantasmas en Mate of the Dead": la
    // humedad eran 40 barras de alto distinto y el chorreado, hilos duros: de
    // lejos se leían como la sombra de unas rejas. Ahora una mancha continua
    // de borde blando y pocos hilos borrosos. globalThis.__mduOldGrime: como antes)
    const SOFT = globalThis.__mduOldGrime !== true;
    if (SOFT) {
      x.save();
      x.filter = 'blur(7px)';
      const top = (u) => 256 * (0.42 + 0.16 * Math.sin(u * 0.031 + 1.3) + 0.08 * Math.sin(u * 0.083 + 0.4));
      for (const [k, col] of [[1, 'rgba(28,30,24,0.55)'], [0.82, 'rgba(70,64,48,0.22)']]) {
        x.beginPath();
        x.moveTo(-10, 266);
        for (let u = -10; u <= 266; u += 6) x.lineTo(u, 256 - top(u) * k);
        x.lineTo(266, 266);
        x.closePath();
        const g = x.createLinearGradient(0, 256, 0, 256 - 256 * 0.66);
        g.addColorStop(0, col);
        g.addColorStop(0.75, col.replace(/[\d.]+\)$/, '0.3)'));
        g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
        x.fillStyle = g;
        x.fill();
      }
      x.restore();
      // y que no corte en los costados de la celda
      x.save();
      x.globalCompositeOperation = 'destination-out';
      for (const [x0, dir] of [[0, 1], [256, -1]]) {
        const g = x.createLinearGradient(x0, 0, x0 + dir * 40, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(Math.min(x0, x0 + dir * 40), 0, 40, 256);
      }
      x.restore();
    } else for (let i = 0; i < 40; i++) {
      const h = 256 * (0.45 + 0.3 * Math.sin(i * 0.5 + r()) * 0.5 + r() * 0.2);
      const g = x.createLinearGradient(0, 256, 0, 256 - h);
      g.addColorStop(0, 'rgba(28,30,24,0.62)');
      g.addColorStop(0.7, 'rgba(40,40,30,0.36)');
      g.addColorStop(0.9, 'rgba(70,64,48,0.34)');
      g.addColorStop(1, 'rgba(60,56,40,0)');
      x.fillStyle = g;
      x.fillRect(4 + (i / 40) * 248 - 2, 256 - h, 248 / 40 + 4, h);
    }
    // hollín: una pluma que sube y se abre
    for (let i = 0; i < 60; i++) {
      const t = r();
      const cy = 256 - t * 230;
      const cx = 384 + (r() - 0.5) * (20 + t * 160);
      const rad = 14 + t * 46;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(12,10,8,${0.2 * (1 - t * 0.6)})`);
      g.addColorStop(1, 'rgba(12,10,8,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, rad, 0, Math.PI * 2);
      x.fill();
    }
    // musgo: verde oscuro, de abajo, en manchones
    for (let i = 0; i < 70; i++) {
      const cx = 518 + r() * 244;
      const cy = 256 - Math.pow(r(), 1.8) * 200;
      const rad = 6 + r() * 26;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const gg = 44 + r() * 28;
      g.addColorStop(0, `rgba(${26 + r() * 14},${gg},${16 + r() * 10},0.5)`);
      g.addColorStop(1, `rgba(30,${gg},20,0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, rad, 0, Math.PI * 2);
      x.fill();
    }
    // chorreado: hilos oscuros (óxido y agua) que bajan desde arriba
    if (SOFT) x.save();
    if (SOFT) x.filter = 'blur(4px)';
    for (let i = 0; i < (SOFT ? 9 : 26); i++) {
      const cx = 790 + r() * 212;
      const len = 60 + r() * 190;
      const g = x.createLinearGradient(0, 0, 0, len);
      const rust = r() < 0.5;
      g.addColorStop(0, rust ? 'rgba(90,44,18,0.6)' : 'rgba(26,26,22,0.55)');
      g.addColorStop(1, 'rgba(40,30,20,0)');
      x.fillStyle = g;
      if (SOFT) {
        // un hilo que se angosta y se va
        const w0 = 6 + r() * 12;
        x.beginPath();
        x.moveTo(cx - w0 / 2, 0);
        x.lineTo(cx + w0 / 2, 0);
        x.quadraticCurveTo(cx + w0 * 0.3, len * 0.6, cx + (r() - 0.5) * 4, len);
        x.quadraticCurveTo(cx - w0 * 0.3, len * 0.6, cx - w0 / 2, 0);
        x.fill();
      } else x.fillRect(cx, 0, 2 + r() * 7, len);
    }
    if (SOFT) x.restore();
  });
  // pisos: [humedad | sombra de contacto | barro | musgo]
  const floor = canvasTex(1024, 256, (x) => {
    blob(x, 128, 128, 100, 60, '24,24,20', 0.2);
    {
      const g = x.createRadialGradient(384, 128, 10, 384, 128, 124);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.38)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(256, 0, 256, 256);
    }
    blob(x, 640, 128, 100, 70, '70,50,30', 0.28);
    blob(x, 896, 128, 100, 90, '34,52,22', 0.22);
  });
  // el charco: un borde blando irregular (alfa)
  const pud = canvasTex(256, 256, (x) => {
    blob(x, 128, 128, 90, 50, '255,255,255', 0.55);
  }, { srgb: false });
  ATLAS = { wall, floor, pud };
  return ATLAS;
}

let MATS = null;
function grimeMats() {
  if (MATS) return MATS;
  const A = atlas();
  const deco = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
  MATS = {
    ao: new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, side: THREE.DoubleSide, ...deco }),
    wall: new THREE.MeshStandardMaterial({ map: A.wall, roughness: 0.8, ...deco }),
    floor: new THREE.MeshStandardMaterial({ map: A.floor, roughness: 0.85, ...deco }),
    pud: new THREE.MeshStandardMaterial({ color: 0x1c232a, alphaMap: A.pud, opacity: 0.75, roughness: 0.1, metalness: 0.15, envMapIntensity: 1.2, ...deco }),
  };
  return MATS;
}

// Una tira de oclusión: cuatro puntas y el alfa de cada una.
function aoQuad(P, C, a, b, c, d, aa, ab, ac, ad) {
  const base = P.length / 3;
  for (const p of [a, b, c, d]) P.push(p[0], p[1], p[2]);
  C.push(0, 0, 0, aa, 0, 0, 0, ab, 0, 0, 0, ac, 0, 0, 0, ad);
  return base;
}

export function grime(w, isl, opts = {}) {
  const r = rng(opts.seed || 991);
  const keys = opts.keys || ISLANDS[isl].zones.filter((k) => !ZONES[k].frag);
  const kid = new Set(keys.map((k) => w.zoneKeys.indexOf(k)));
  const zk = (i) => w.zoneKeys[w.zone[i]];
  const M = grimeMats();
  const P = [];
  const C = [];
  const I = [];
  const quad = (a, b, c, d, aa, ab, ac, ad) => {
    const k = aoQuad(P, C, a, b, c, d, aa, ab, ac, ad);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  // las caras de pared al lado de piso: [x, z, dx, dz, y0, y1, techado, afuera]
  const faces = [];
  const eaves = [];
  islCells(w, isl, (x, z, i) => {
    if (w.grid[i] !== FLOOR || !kid.has(w.zone[i]) || w.rampAt?.[i] >= 0) return;
    const Z = ZONES[zk(i)];
    const fy = w.fy[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = w.idx(x + dx, z + dz);
      const t = w.grid[j];
      if ((t !== WALL && t !== WIN) || w.edge[j] !== 0) continue;
      const top = w.top[j];
      if (!(top > fy + 0.5)) continue;
      faces.push([x, z, dx, dz, fy, Math.min(top, Z.outdoor ? top : Z.roof ?? top), !Z.outdoor, !!Z.outdoor]);
    }
  });
  // las caras de afuera de lo techado (el alero): pared con piso techado de un lado y aire del otro
  islCells(w, isl, (x, z, j) => {
    if ((w.grid[j] !== WALL && w.grid[j] !== WIN) || w.edge[j] !== 0) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = w.idx(x - dx, z - dz);
      const o = w.idx(x + dx, z + dz);
      if (w.grid[i] !== FLOOR || !kid.has(w.zone[i]) || ZONES[zk(i)].outdoor) continue;
      const out = w.grid[o] === OUT || (w.grid[o] === FLOOR && ZONES[zk(o)]?.outdoor);
      if (out) eaves.push([x, z, dx, dz, w.top[j]]);
    }
  });
  const E = 0.012;
  for (const [x, z, dx, dz, fy, top, roofed] of faces) {
    // el borde compartido, de punta a punta mirando a la celda del piso
    const mx = x + 0.5 + dx * 0.5;
    const mz = z + 0.5 + dz * 0.5;
    const ax = mx - dz * 0.5;
    const az = mz + dx * 0.5;
    const bx = mx + dz * 0.5;
    const bz = mz - dx * 0.5;
    const wd = 0.62;
    const k0 = 0.5 * (opts.ao ?? 1);
    // en el piso: del pie de la pared hacia adentro
    quad([ax, fy + 0.006, az], [bx, fy + 0.006, bz], [bx - dx * wd, fy + 0.006, bz - dz * wd], [ax - dx * wd, fy + 0.006, az - dz * wd], k0, k0, 0, 0);
    // en la pared: del piso para arriba
    const hh = 0.85;
    quad([ax - dx * E, fy, az - dz * E], [ax - dx * E, fy + hh, az - dz * E], [bx - dx * E, fy + hh, bz - dz * E], [bx - dx * E, fy, bz - dz * E], k0 * 0.9, 0, 0, k0 * 0.9);
    // contra el cielorraso
    if (roofed && top - fy > 2) {
      const ch = 0.6;
      quad([ax - dx * E, top - ch, az - dz * E], [ax - dx * E, top, az - dz * E], [bx - dx * E, top, bz - dz * E], [bx - dx * E, top - ch, bz - dz * E], 0, 0.38, 0.38, 0);
      quad([ax, top - 0.01, az], [ax - dx * 0.5, top - 0.01, az - dz * 0.5], [bx - dx * 0.5, top - 0.01, bz - dz * 0.5], [bx, top - 0.01, bz], 0.34, 0, 0, 0.34);
    }
  }
  for (const [x, z, dx, dz, top] of eaves) {
    // la cara de afuera (la del lado dx, dz), abajo del alero
    const mx = x + 0.5 + dx * 0.5;
    const mz = z + 0.5 + dz * 0.5;
    const ax = mx - dz * 0.5;
    const az = mz + dx * 0.5;
    const bx = mx + dz * 0.5;
    const bz = mz - dx * 0.5;
    const eh = 0.9;
    quad([ax + dx * E, top - eh, az + dz * E], [bx + dx * E, top - eh, bz + dz * E], [bx + dx * E, top, bz + dz * E], [ax + dx * E, top, az + dz * E], 0, 0, 0.42, 0.42);
  }
  // la sombra de contacto de cosas sueltas que se le pasen (troncos, piedras grandes): [x, y, z, rx, rz]
  const root = new THREE.Group();
  root.name = `eclipse:${isl}:grime`;
  if (P.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    g.setIndex(I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, M.ao);
    m.renderOrder = 1;
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  // ---- manchas de pared (atlas): [x, y, z, nx, nz, ancho, alto, celda del atlas] ----
  const WD = [];
  const outsideOf = (x, z, dx, dz) => {
    const j = w.idx(x + dx, z + dz);
    const o = w.idx(x + dx * 2, z + dz * 2);
    return w.grid[o] === OUT || (w.grid[o] === FLOOR && ZONES[zk(o)]?.outdoor);
  };
  void outsideOf;
  for (const [x, z, dx, dz, fy, top, roofed, outdoor] of faces) {
    const u = r();
    const wall = (cell, hgt, wid, y0) => WD.push([x + 0.5 + dx * (0.5 - E * 1.5), y0, z + 0.5 + dz * (0.5 - E * 1.5), -dx, -dz, wid, hgt, cell]);
    if (u < (opts.damp ?? 0.16)) wall(0, 0.8 + r() * 1.1, 1.4 + r() * 1.6, fy);
    else if (outdoor && u < (opts.damp ?? 0.16) + (opts.moss ?? 0.12)) wall(2, 0.5 + r() * 0.8, 1.2 + r() * 1.4, fy);
    else if (!outdoor && u < (opts.damp ?? 0.16) + (opts.rust ?? 0.05)) wall(3, Math.min(top - fy, 1.4 + r()), 0.8 + r() * 1.2, top - Math.min(top - fy, 1.4 + r()));
    void roofed;
  }
  for (const [x, z, dx, dz, top] of eaves) {
    const u = r();
    // de afuera: chorreado del alero y musgo al pie (si hay piso afuera)
    const fx = x + 0.5 + dx * (0.5 + E * 1.5);
    const fz = z + 0.5 + dz * (0.5 + E * 1.5);
    if (u < (opts.drip ?? 0.22)) {
      const h = 1.2 + r() * 1.6;
      WD.push([fx, top - h - 0.05, fz, dx, dz, 0.8 + r() * 1.3, h, 3]);
    }
    const o = w.idx(x + dx, z + dz);
    if (w.grid[o] === FLOOR && r() < (opts.moss ?? 0.12) * 1.6) WD.push([fx, w.fy[o], fz, dx, dz, 1.2 + r() * 1.5, 0.5 + r() * 0.9, 2]);
  }
  for (const s of opts.soot || []) WD.push([s[0], s[1], s[2], s[3], s[4], s[5] || 1.2, s[6] || 2, 1]);
  if (WD.length) root.add(decalMesh(WD, M.wall, true));
  // ---- manchas de piso: [x, y, z, ancho, largo, giro, celda] ----
  const FD = [];
  const fit = (x, z, s, k) => onFloor(w, x, z, s * 0.45, [k]);
  islCells(w, isl, (x, z, i) => {
    if (w.grid[i] !== FLOOR || !kid.has(w.zone[i]) || w.rampAt?.[i] >= 0) return;
    const k = zk(i);
    const Z = ZONES[k];
    const u = r();
    const px = x + r();
    const pz = z + r();
    const s = 1 + r() * 1.8;
    const wet = (opts.wet || []).includes(k);
    if (u < (Z.outdoor ? opts.mud ?? 0.05 : wet ? 0.08 : 0.035) && fit(px, pz, s, k)) FD.push([px, w.fy[i], pz, s, s * (0.7 + r() * 0.5), r() * 6.3, Z.outdoor ? 2 : 0]);
    else if (Z.outdoor && u < (opts.mud ?? 0.05) + (opts.mossFloor ?? 0.02) && fit(px, pz, s, k)) FD.push([px, w.fy[i], pz, s, s, r() * 6.3, 3]);
  });
  for (const [x, y, z, rx, rz] of FOOT) {
    if (!inIsl(isl, x, z)) continue;
    FD.push([x, y, z, rx * 2.1, rz * 2.1, 0, 1]);
  }
  for (const b of opts.blobs || []) FD.push([b[0], b[1], b[2], b[3] * 2, b[4] * 2, b[5] || 0, 1]);
  if (FD.length) root.add(decalMesh(FD, M.floor, false));
  // ---- charcos ----
  const PD = [];
  const want = opts.puddles ?? 10;
  for (let t = 0; t < want * 40 && PD.length < want; t++) {
    const k = keys[Math.floor(r() * keys.length)];
    const Z = ZONES[k];
    if (!Z.outdoor && !(opts.wet || []).includes(k)) continue;
    const [x0, z0, x1, z1] = zbox(k);
    const px = x0 + r() * (x1 - x0);
    const pz = z0 + r() * (z1 - z0);
    const s = 0.7 + r() * 1.6;
    if (!onFloor(w, px, pz, s * 0.5, [k]) || (opts.out && opts.out(px, pz, 0.2))) continue;
    if (PD.some((q) => Math.hypot(q[0] - px, q[2] - pz) < 3)) continue;
    PD.push([px, w.floorAt(px, pz) + 0.004, pz, s, s * (0.6 + r() * 0.4), r() * 6.3, 0]);
  }
  if (PD.length) root.add(decalMesh(PD, M.pud, false, 1));
  w.root.add(root);
  return root;
}

const inIsl = (isl, x, z) => {
  const [x0, z0, x1, z1] = ISLANDS[isl].box;
  return x >= x0 - 3 && x <= x1 + 4 && z >= z0 - 3 && z <= z1 + 4;
};

// Calcomanías de un atlas de 4 celdas en una sola malla.
// pared: [x, y0, z, nx, nz, ancho, alto, celda]; piso: [x, y, z, ancho, largo, giro, celda]
function decalMesh(list, mat, wall, cells = 4) {
  const P = [];
  const U = [];
  const N = [];
  const I = [];
  for (const d of list) {
    const b = P.length / 3;
    const c = d[7 ?? 6];
    if (wall) {
      const [x, y0, z, nx, nz, wd, h, cell] = d;
      // (de izquierda a derecha mirando la cara de frente: así mira para n)
      const rx = nz;
      const rz = -nx;
      const hw = wd / 2;
      P.push(x - rx * hw, y0, z - rz * hw, x + rx * hw, y0, z + rz * hw, x + rx * hw, y0 + h, z + rz * hw, x - rx * hw, y0 + h, z - rz * hw);
      const u0 = cell / cells;
      const u1 = (cell + 1) / cells;
      U.push(u0, 0, u1, 0, u1, 1, u0, 1);
      for (let k = 0; k < 4; k++) N.push(nx, 0, nz);
    } else {
      const [x, y, z, sx, sz, a, cell] = d;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pt = (u, v) => [x + (u * ca - v * sa), y + 0.007, z + (u * sa + v * ca)];
      for (const p of [pt(-sx / 2, sz / 2), pt(sx / 2, sz / 2), pt(sx / 2, -sz / 2), pt(-sx / 2, -sz / 2)]) P.push(...p);
      const u0 = cell / cells;
      const u1 = (cell + 1) / cells;
      U.push(u0, 0, u1, 0, u1, 1, u0, 1);
      for (let k = 0; k < 4; k++) N.push(0, 1, 0);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    void c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

// ---------------- los cordones y las barandas (en Eclipse el 'stoneStep' y el
// 'stoneWall' de Levels son el travertino blanco del Monumento) ----------------
// En las islas de arte-A, por encima del cordón de cada borde abierto (la tapa
// y los costados) y de la base de piedra de las barandas: la piedra del penal
// (la que tenían en su mapa); donde el costado baja más de 1,2 m (la barranca
// de la loma), roca. skip(i): celdas que tapa otro (el bordo de la laguna,
// el cerco del corral, los pedazos sueltos).
let CURB = null;
export function curbMats(w) {
  if (CURB) return CURB;
  const T = w.T;
  CURB = {
    eclCurbTop: new THREE.MeshStandardMaterial({ map: T.stoneWall, color: 0x8e8a80, roughness: 0.9 }),
    eclCurbSide: new THREE.MeshStandardMaterial({ map: T.stoneWall, color: 0x9a968c, roughness: 0.92 }),
  };
  // (2026-10-08, el usuario: "los bordes que tienen barandas siguen titilando
  // cuando se ven de lejos". El cordón va 1,2 cm afuera del borde de piedra de
  // Levels, que va 1,2 cm afuera de la cara: de lejos la profundidad no separa
  // 1 cm y se pisaban. El cordón gana siempre: polygonOffset.
  // globalThis.__mduOldEclCurbOff: como antes)
  if (globalThis.__mduOldEclCurbOff !== true) {
    for (const m of Object.values(CURB)) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  }
  for (const m of Object.values(CURB)) OWN_MATS.add(m);
  return CURB;
}
export const CLIFFS = [];
export function curbs(w, isl, gb, skip = () => false) {
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const E = 0.012;
  const ids = new Set(ISLANDS[isl].zones.map((k) => w.zoneKeys.indexOf(k)));
  const mine = (i) => {
    for (const [dx, dz] of [...D4, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const j = i + dx + dz * MAP_W;
      if (w.grid[j] === FLOOR && ids.has(w.zone[j])) return true;
    }
    return false;
  };
  const kindOf = (x, z) => {
    if (!w.inside(x, z)) return null;
    const i = w.idx(x, z);
    const t = w.grid[i];
    if (t === OUT || t === FLOOR || (w.edge[i] !== EDGE_RAIL && w.edge[i] !== 4)) return null;
    return t === WIN || t === DOOR ? 'gap' : 'post';
  };
  islCells(w, isl, (x, z, i) => {
    const t = w.grid[i];
    if (t === OUT || t === FLOOR || w.edge[i] === 0 || !mine(i) || skip(i)) return;
    const fy = w.fy[i];
    if (t !== DOOR) gb.flat('eclCurbTop', x, z, x + 1, z + 1, fy + 0.004, true);
    // los costados (como Levels.buildCurbSides, un pelo afuera)
    D4.forEach(([dx, dz]) => {
      const j = w.idx(x + dx, z + dz);
      const nt = w.grid[j];
      let lo = null;
      if (nt === OUT) lo = fy - 2.2;
      else if (nt === FLOOR) {
        const ny = w.fy[j];
        if (ny < fy - 0.01) lo = ny;
      } else if (w.edge[j] !== 0 && w.fy[j] < fy - 0.01) lo = w.fy[j];
      if (lo == null) return;
      const mx = x + 0.5 + dx * (0.5 + E);
      const mz = z + 0.5 + dz * (0.5 + E);
      const ax = mx - dz * 0.5;
      const az = mz + dx * 0.5;
      const bx = mx + dz * 0.5;
      const bz = mz - dx * 0.5;
      gb.wall(fy - lo > 1.2 && nt === FLOOR ? 'caveRock' : 'eclCurbSide', ax, az, bx, bz, lo - 0.02, fy + 0.004, [dx, 0, dz], 2);
    });
    // (las barrancas altas: piedras al pie, del lado de abajo)
    D4.forEach(([dx, dz]) => {
      const j = w.idx(x + dx, z + dz);
      if (w.grid[j] === FLOOR && fy - w.fy[j] > 1.2 && w.rampAt?.[j] < 0) CLIFFS.push([x + 0.5 + dx * 0.9, w.fy[j], z + 0.5 + dz * 0.9, dx, dz, fy - w.fy[j]]);
    });
    // la base de piedra de la baranda (Levels: 0,28 m de ancho, de fy - 3 a fy + 0,2)
    if (kindOf(x, z) === 'post') {
      const bars = w.edge[i] === 4;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const top = fy + (bars ? 0.36 : 0.21);
      gb.box('eclCurbSide', cx - 0.152, fy - 3.01, cz - 0.152, cx + 0.152, top, cz + 0.152, 1);
      for (const [dx, dz] of D4) {
        const k = kindOf(x + dx, z + dz);
        if (!k || (k === 'post' && (dx < 0 || dz < 0))) continue;
        const len = k === 'post' ? 1 : 0.5;
        const bx = cx + dx * len;
        const bz = cz + dz * len;
        // (sesión 1f: la punta del tramo, 1,2 cm más allá que la de Levels; si no,
        // en las escaleras —tramos a distinta altura— las dos caras de la punta
        // quedaban en el mismo plano y titilaban: "los bordes de las escaleras
        // cambian según el ángulo". __mduOldCurbEnds: como antes)
        const ee = globalThis.__mduOldCurbEnds === true ? 0 : 0.012;
        gb.box('eclCurbSide', Math.min(cx - 0.132, Math.min(cx, bx) - ee), fy - 3.01, Math.min(cz - 0.132, Math.min(cz, bz) - ee), Math.max(cx + 0.132, Math.max(cx, bx) + ee), fy + (bars ? 0.31 : 0.16), Math.max(cz + 0.132, Math.max(cz, bz) + ee), 1);
      }
    }
  });
  // los escalones de las escaleras de la isla (Levels: 'stoneStep', el travertino):
  // la misma escalera, un centímetro más grande, de piedra
  const own = new Set(ISLANDS[isl].zones);
  for (const R of RAMPS) {
    if (!R.steps || R.mat) continue;
    const [x0, z0, x1, z1] = R.rect;
    const k = zoneAtCell(w, x0 + 0.5, z0 + 0.5);
    if (!own.has(k)) continue;
    const alongX = R.dir === '+x' || R.dir === '-x';
    const len = alongX ? x1 + 1 - x0 : z1 + 1 - z0;
    const rise = R.y1 - R.y0;
    const count = Math.max(2, Math.round(Math.abs(rise) / 0.22));
    const run = len / count;
    const lowY = Math.min(R.y0, R.y1) - 0.05;
    const e = 0.008;
    for (let s = 0; s < count; s++) {
      const hTop = Math.min(R.y0, R.y1) + (Math.abs(rise) * (s + 1)) / count;
      const up = rise >= 0 ? R.dir[0] === '+' : R.dir[0] === '-';
      const s0 = up ? s * run : len - (s + 1) * run;
      const s1 = s0 + run;
      if (alongX) gb.box('eclCurbTop', x0 + s0 - e, lowY, z0 - e, x0 + s1 + e, hTop + e, z1 + 1 + e);
      else gb.box('eclCurbTop', x0 - e, lowY, z0 + s0 - e, x1 + 1 + e, hTop + e, z0 + s1 + e);
    }
  }
}

// Las barrancas altas que dejó curbs(): piedras al pie (no en lo reservado).
export function cliffRocks(w, root, out, r, isl) {
  const list = [];
  for (const [x, y, z, dx, dz, h] of CLIFFS) {
    if (!inIsl(isl, x, z) || r() < 0.45) continue;
    const px = x + dz * (r() - 0.5) * 0.6;
    const pz = z + dx * (r() - 0.5) * 0.6;
    if (out(px, pz, 0.6) || Math.abs(w.floorAt(px, pz) - y) > 0.02) continue;
    list.push([px, pz, 0.3 + r() * 0.35 + Math.min(0.3, h * 0.05)]);
  }
  if (list.length) root.add(boulders(w, list, w.M.rock, r));
}

// ---------------- ventanas, faroles y cercos (para las islas de arte-A) ----------------

// Las celdas de pared de un lado de una zona techada que dan afuera (al vacío
// o a un patio), cada `step` metros y lejos de puertas, máquinas, cajas y
// tizas: [x, z de la cara de afuera, normal]. side: 'n' | 's' | 'e' | 'o'.
export function wallSpots(w, k, side, step = 3, off = 1.5) {
  const [x0, z0, x1, z1] = zbox(k, true);
  const busy = keepOut();
  const out = [];
  const n = { n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] }[side];
  const along = side === 'n' || side === 's';
  const a0 = along ? x0 : z0;
  const a1 = along ? x1 : z1;
  for (let a = a0 + off; a < a1 - 0.6; a += step) {
    const cx = along ? Math.floor(a) : side === 'e' ? x1 : x0 - 1;
    const cz = along ? (side === 's' ? z1 : z0 - 1) : Math.floor(a);
    if (!w.inside(cx, cz)) continue;
    const i = w.idx(cx, cz);
    if (w.grid[i] !== WALL || w.edge[i] !== 0) continue;
    const o = w.idx(cx + n[0], cz + n[1]);
    const free = w.grid[o] === OUT || (w.grid[o] === FLOOR && ZONES[w.zoneKeys[w.zone[o]]]?.outdoor) || (w.grid[o] !== FLOOR && w.edge[o] !== 0);
    if (!free) continue;
    const mx = cx + 0.5;
    const mz = cz + 0.5;
    if (busy(mx - n[0], mz - n[1], 0.6) || busy(mx, mz, 0.3)) continue;
    out.push([mx + n[0] * 0.5, mz + n[1] * 0.5, n]);
  }
  return out;
}

// Un farol de palo (el del estero) con el vidrio justo donde está la luz `L`
// (de las .py); busca un giro en que el palo caiga en piso libre.
export function farolAt(w, L, keys, out = keepOut(), h = 2.6) {
  if (!L) return null;
  const [lx, ly, lz] = L.pos;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const px = lx - 0.5 * Math.cos(a);
    const pz = lz + 0.5 * Math.sin(a);
    if (!onFloor(w, px, pz, 0.15, keys) || out(px, pz, 0.15)) continue;
    const y = w.floorAt(px, pz);
    const hh = ly - y + 0.47;
    return put(w, { type: 'farolPoste', pos: [px, pz], rot: a, h: hh, y }, { foot: false });
  }
  return null;
}

// El cerco de palo a pique en las celdas de borde 'fence' que tocan estas
// zonas: palos torcidos y tres tablas; la tierra tapa el cordón de Levels.
// twist(x, z) → [subida, giro]: lo que la disformidad le hace a ese palo.
export function paloFence(w, gb, r, keys, { ground = 'dirt', twist = null, skip = null } = {}) {
  const ids = new Set(keys.map((k) => w.zoneKeys.indexOf(k)));
  const cells = new Set();
  for (const isl of new Set(keys.map((k) => ZONES[k]?.isla))) {
    islCells(w, isl, (x, z, i) => {
      if (w.grid[i] === OUT || w.grid[i] === FLOOR || w.edge[i] !== EDGE_FENCE || skip?.has(i)) return;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.grid[i + dx + dz * MAP_W] === FLOOR && ids.has(w.zone[i + dx + dz * MAP_W])) near = true;
      if (near) cells.add(i);
    });
  }
  // (sesión 1f: donde el borde baja en diagonal escalonada el cerco hacía
  // dientes de sierra —parecían dos cercos paralelos—: las esquinas de la
  // escalera se sacan y el cerco va derecho en diagonal. __mduNoFenceDiag)
  const drop = new Set();
  if (globalThis.__mduNoFenceDiag !== true) {
    const isF = (j) => cells.has(j) && w.grid[j] !== DOOR;
    for (const i of cells) {
      if (!isF(i)) continue;
      const n = [1, -1, MAP_W, -MAP_W].filter((d) => isF(i + d));
      if (n.length !== 2 || Math.abs(n[0]) === Math.abs(n[1])) continue;
      if (cells.has(i + n[0] + n[1])) continue;
      if (drop.has(i + n[0]) || drop.has(i + n[1])) continue;
      drop.add(i);
    }
  }
  const kind = (x, z) => {
    if (!w.inside(x, z)) return null;
    const i = w.idx(x, z);
    if (!cells.has(i) || drop.has(i)) return null;
    return w.grid[i] === DOOR ? 'gap' : 'fence';
  };
  const diag = [];
  const g = new THREE.Group();
  for (const i of cells) {
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    const fy = w.fy[i];
    // (la tierra de la zona, arriba del cordón: 1,2 cm más arriba)
    if (w.grid[i] !== DOOR) gb.flat(ground, x, z, x + 1, z + 1, fy + 0.012, true);
    if (kind(x, z) !== 'fence') continue;
    const cx = x + 0.5;
    const cz = z + 0.5;
    const [lift, tw] = twist ? twist(cx, cz) : [0, 0];
    // (los tramos en diagonal, sobre las esquinas sacadas)
    for (const [dx, dz] of [[1, 1], [1, -1]]) {
      if (kind(x + dx, z + dz) !== 'fence') continue;
      if (!drop.has(w.idx(x + dx, z)) && !drop.has(w.idx(x, z + dz))) continue;
      const fy2 = w.fy[w.idx(x + dx, z + dz)];
      const [l2] = twist ? twist(cx + dx, cz + dz) : [0];
      for (const y of [0.35, 0.72, 1.1]) {
        const A = new THREE.Vector3(cx, fy + lift + y, cz);
        const B = new THREE.Vector3(cx + dx, fy2 + l2 + y, cz + dz);
        const geo = boxGeo(0.05, A.distanceTo(B), 0.12).clone();
        const m4 = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1));
        diag.push(geo.applyMatrix4(m4));
      }
    }
    const lean = (r() - 0.5) * 0.05;
    if (!lift && !tw) gb.box('fenceDark', cx - 0.08 + lean, fy - 0.05, cz - 0.08, cx + 0.08 + lean, fy + 1.32 + r() * 0.14, cz + 0.08, 1);
    else g.add(mesh(boxGeo(0.16, 1.4, 0.16), w.M.fenceDark, cx, fy + lift + 0.65, cz, tw * 0.5, tw, tw * 0.3));
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const k = kind(x + dx, z + dz);
      if (!k) continue;
      if (k === 'fence' && (dx < 0 || dz < 0)) continue;
      const len = k === 'fence' ? 1 : 0.5;
      const [l2] = twist && k === 'fence' ? twist(cx + dx, cz + dz) : [lift];
      for (const y of [0.35, 0.72, 1.1]) {
        const A = new THREE.Vector3(cx, fy + lift + y, cz);
        const B = new THREE.Vector3(cx + dx * len, fy + (k === 'fence' ? l2 : lift) + y + (r() - 0.5) * 0.03, cz + dz * len);
        if (!lift && !l2) {
          const t = 0.05;
          gb.box('fence', Math.min(A.x, B.x) - (dx ? 0 : t / 2), A.y - 0.06, Math.min(A.z, B.z) - (dz ? 0 : t / 2), Math.max(A.x, B.x) + (dx ? 0 : t / 2), A.y + 0.06, Math.max(A.z, B.z) + (dz ? 0 : t / 2), 1);
        } else {
          const m = new THREE.Mesh(boxGeo(0.05, A.distanceTo(B), 0.12), w.M.fence);
          m.position.copy(A).add(B).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
          g.add(m);
        }
      }
    }
  }
  if (diag.length) {
    const dm = new THREE.Mesh(mergeGeos(diag), w.M.fence);
    dm.castShadow = true;
    dm.receiveShadow = true;
    g.add(dm);
  }
  if (g.children.length) addFixed(w, g);
  return cells;
}

// ---------------- lo chico, solo de cerca ----------------
// Matas, flores, piedritas, velas, cruces finitas, manchas: desde otra isla no
// se ven y cada una es un dibujo. Se esconden con la cámara a más de `far`
// metros de la isla (con margen para que no titilen) y van a w.warmHidden, así
// sus programas se compilan en la carga (ui/Arrival).
export function detailCuller(w, isl, list, far = 85) {
  const I = ISLANDS[isl];
  const [x0, z0, x1, z1] = I.box;
  const at = new THREE.Vector3((x0 + x1) / 2, I.y, (z0 + z1) / 2);
  const half = Math.hypot(x1 - x0, z1 - z0) / 2;
  const objs = list.filter(Boolean);
  (w.warmHidden ||= []).push(...objs);
  let shown = true;
  const cam = new THREE.Vector3();
  return () => {
    const c = w.g?.camera;
    if (!c || !objs.length) return;
    c.getWorldPosition(cam);
    const d = cam.distanceTo(at) - half;
    const want = shown ? d < far + 8 : d < far;
    if (want === shown) return;
    shown = want;
    for (const o of objs) o.visible = want;
  };
}

// ---------------- lo que flota: piedras que giran alrededor de un punto ----------------
// groups: [{ c: [x, y, z], r: [r0, r1], h: alto, n, s: [s0, s1], sp: velocidad }]
// Una malla instanciada por isla; se mueve solo con la cámara cerca.
export function orbiters(w, groups, { seed = 55, mat } = {}) {
  const r = rng(seed);
  const items = [];
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const G of groups) {
    for (let k = 0; k < G.n; k++) {
      const rad = G.r[0] + r() * (G.r[1] - G.r[0]);
      items.push({
        c: G.c,
        rad,
        a: r() * Math.PI * 2,
        sp: (G.sp ?? 0.25) * (0.6 + r() * 0.8) * (r() < 0.5 ? -1 : 1) / Math.max(0.6, rad * 0.4),
        y: (r() - 0.3) * (G.h ?? 1.5),
        yA: 0.08 + r() * 0.25,
        yP: r() * 6.3,
        s: G.s[0] + r() * (G.s[1] - G.s[0]),
        rx: r() * 6.3,
        ry: r() * 6.3,
        rs: (r() - 0.5) * 1.6,
      });
    }
    cx += G.c[0];
    cy += G.c[1];
    cz += G.c[2];
    n++;
  }
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat || voidRockMat(w), items.length);
  // (con nombre: ui/eclipseSableTrip las esconde del otro lado del desgarro)
  im.name = 'eclipse:orbiters';
  im.castShadow = false;
  im.receiveShadow = true;
  im.frustumCulled = false;
  const at = new THREE.Vector3(cx / n, cy / n, cz / n);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const place = (t) => {
    items.forEach((it, k) => {
      const a = it.a + t * it.sp;
      v.set(it.c[0] + Math.cos(a) * it.rad, it.c[1] + it.y + Math.sin(t * 0.8 + it.yP) * it.yA, it.c[2] + Math.sin(a) * it.rad);
      q.setFromEuler(e.set(it.rx + t * it.rs, it.ry + t * it.rs * 0.7, 0));
      m4.compose(v, q, s.set(it.s, it.s * 0.8, it.s * 1.1));
      im.setMatrixAt(k, m4);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  w.root.add(im);
  const cam = new THREE.Vector3();
  return {
    im,
    update(t) {
      const c = w.g?.camera;
      if (!c) return;
      c.getWorldPosition(cam);
      if (cam.distanceTo(at) > 140) return;
      place(t);
    },
  };
}

// Lo que flota cerca de los portales de una isla (la disformidad).
export function portalOrbs(isl, orbs) {
  for (const p of PORTALS) for (const e of [p.a, p.b]) if (ZONES[e.zone]?.isla === isl) orbs.push({ c: [e.pos[0] - e.face[0] * 0.6, ZONES[e.zone].y + 1.6, e.pos[1] - e.face[1] * 0.6], r: [1.6, 2.6], h: 2.2, n: 5, s: [0.06, 0.16], sp: 0.35 });
}

// ---------------- los pedazos sueltos (zonas frag) ----------------
// Una losa gruesa de borde dentado, inclinada, apoyada arriba del piso de la
// zona (lo tapa entero), con la cara de arriba del material del pedazo y los
// cantos de piedra con vetas violetas. Devuelve el grupo inclinado: lo que se
// agregue va en sus coordenadas (el piso en y = 0, el centro en 0, 0).
export function fragment(w, key, { tilt = [0.08, 0.03, -0.06], top = 'grass', pad = 1.7, thick = 4.1, seed = 1 } = {}) {
  const r = rng(seed * 131 + 7);
  const Z = ZONES[key];
  const [x0, z0, x1, z1] = zbox(key);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const hx = (x1 - x0) / 2 + pad;
  const hz = (z1 - z0) / 2 + pad;
  // (lo que más baja una esquina con la inclinación: así la losa tapa entero el piso y el cordón de Levels)
  const lift = hz * Math.abs(Math.sin(tilt[0])) + hx * Math.abs(Math.sin(tilt[2])) + 0.25;
  const g = new THREE.Group();
  g.position.set(cx, Z.y + lift, cz);
  g.rotation.set(tilt[0], tilt[1], tilt[2]);
  // el borde: puntos alrededor del rectángulo, con mordiscos (en estrella desde
  // el medio: con los mordiscos en las esquinas el borde se cruzaba y la cara
  // de arriba salía a medias)
  const pts = [];
  const n = Math.max(20, Math.round((2 * (2 * hx + 2 * hz)) / 0.8));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rr = Math.min(hx / Math.max(1e-6, Math.abs(c)), hz / Math.max(1e-6, Math.abs(sn)));
    const bite = 0.05 + r() * 0.3;
    pts.push([c * (rr - bite), sn * (rr - bite)]);
  }
  const shape = new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, -pz)));
  const topG = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  // (uv cada 2 m, como los pisos de Levels)
  const tu = topG.attributes.uv;
  const tp = topG.attributes.position;
  for (let k = 0; k < tu.count; k++) tu.setXY(k, tp.getX(k) / 2, tp.getZ(k) / 2);
  // (que la cara mire para arriba: según el sentido del borde, ShapeGeometry la daba vuelta)
  {
    const ix = topG.index.array;
    const A = new THREE.Vector3().fromBufferAttribute(tp, ix[0]);
    const B = new THREE.Vector3().fromBufferAttribute(tp, ix[1]);
    const Cc = new THREE.Vector3().fromBufferAttribute(tp, ix[2]);
    if (B.sub(A).cross(Cc.sub(A)).y < 0) for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
    const nn = topG.attributes.normal;
    for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0);
  }
  const M = w.M;
  const top_ = new THREE.Mesh(topG, M[top] || M.grass);
  top_.receiveShadow = top_.castShadow = true;
  g.add(top_);
  // los cantos: casi derechos hasta abajo del piso de la zona (tapan el cordón
  // de Levels, que baja 2,6 m) y después una punta que se mete en la roca
  // (los cantos se afinan hacia abajo, desparejos: un terrón arrancado, no un cajón)
  const mid = pts.map(([px, pz]) => {
    const f = 0.84 + r() * 0.2;
    return [px * f, -thick * (0.8 + r() * 0.35), pz * f];
  });
  const low = pts.map(([px, pz]) => [px * (0.32 + r() * 0.2), -thick - 1.2 - r() * 1.8, pz * (0.32 + r() * 0.2)]);
  const tip = [0, -thick - 4.5, 0];
  const P = [];
  const U = [];
  let u = 0;
  const ring = (A, B, a, b, v0, v1, du) => {
    P.push(a[0], a[1], a[2], A[0], A[1], A[2], B[0], B[1], B[2], a[0], a[1], a[2], B[0], B[1], B[2], b[0], b[1], b[2]);
    U.push(u, v0, u, v1, u + du, v1, u, v0, u + du, v1, u + du, v0);
  };
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const a = [pts[k][0], 0, pts[k][1]];
    const b = [pts[k2][0], 0, pts[k2][1]];
    const du = Math.hypot(b[0] - a[0], b[2] - a[2]) / 2;
    ring(mid[k], mid[k2], a, b, 0, thick / 2, du);
    ring(low[k], low[k2], mid[k], mid[k2], thick / 2, thick / 2 + 1.2, du);
    P.push(low[k][0], low[k][1], low[k][2], tip[0], tip[1], tip[2], low[k2][0], low[k2][1], low[k2][2]);
    U.push(u, 0, u + du / 2, 1.5, u + du, 0);
    u += du;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  sg.computeVertexNormals();
  // (la orden de los triángulos puede salir al revés según el lado: de las dos caras)
  const side = new THREE.Mesh(sg, sideMat(w));
  side.castShadow = side.receiveShadow = true;
  g.add(side);
  // grietas de luz en los cantos (las cinco en una malla)
  {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const i = Math.floor(r() * n);
      const a = pts[i];
      parts.push(new THREE.PlaneGeometry(0.4, thick * 0.8).rotateY(Math.atan2(a[0], a[1])).translate(a[0] * 1.03, -thick * 0.42, a[1] * 1.03));
    }
    const c = new THREE.Mesh(mergeGeos(parts), crackMat());
    c.userData.dynamic = true;
    c.castShadow = false;
    g.add(c);
  }
  // el costado del cordón que Levels baja hasta el terreno de afuera (en
  // Eclipse, el blanco del Monumento, y a veces de muchos metros: el terreno de
  // afuera toma el piso más cercano, que puede ser el de la isla de abajo):
  // tapado con la misma roca, un pelo afuera, de arriba a abajo
  const base = new THREE.Group();
  const P2 = [];
  const U2 = [];
  const tyB = buildTy(w);
  const kid = w.zoneKeys.indexOf(key);
  const E = 0.025;
  for (let z = Math.floor(z0) - 1; z <= Math.ceil(z1); z++) {
    for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1); x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      const t = w.grid[i];
      if (t === OUT || t === FLOOR || w.edge[i] === 0) continue;
      let near = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.grid[i + dx + dz * MAP_W] === FLOOR && w.zone[i + dx + dz * MAP_W] === kid) near = true;
      if (!near) continue;
      const top = w.fy[i] + 0.01;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = w.idx(x + dx, z + dz);
        if (w.grid[j] !== OUT) continue;
        const lo = tyB[j] - 1.5 - 0.65;
        if (!(lo < top)) continue;
        const mx = x + 0.5 + dx * (0.5 + E);
        const mz = z + 0.5 + dz * (0.5 + E);
        const ax = mx - dz * 0.52;
        const az = mz + dx * 0.52;
        const bx = mx + dz * 0.52;
        const bz = mz - dx * 0.52;
        P2.push(ax, lo, az, bx, lo, bz, bx, top, bz, ax, lo, az, bx, top, bz, ax, top, az);
        U2.push(0, lo / 2, 0.5, lo / 2, 0.5, top / 2, 0, lo / 2, 0.5, top / 2, 0, top / 2);
      }
    }
  }
  if (P2.length) {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2));
    bg.computeVertexNormals();
    base.add(new THREE.Mesh(bg, sideMat(w)));
  }
  // (no va a la escena: finish() lo junta con lo quieto de World.addStatic)
  g.updateMatrixWorld(true);
  return { g, hx: hx - pad, hz: hz - pad, pts, r, finish: () => { addFixed(w, g); if (base.children.length) addFixed(w, base); } };
}

// El terreno de afuera como lo armó Levels (antes de que Eclipse lo mande al
// fondo del vacío): la altura del piso más cercano (BFS desde lo caminable, en
// el mismo orden), para saber hasta dónde bajó cada cara.
function buildTy(w) {
  if (w.__eclTy) return w.__eclTy;
  const n = MAP_W * MAP_H;
  const ty = new Float32Array(n);
  const dist = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const t = w.grid[i];
    if (t === FLOOR || t === DOOR || t === WIN) {
      dist[i] = 0;
      ty[i] = w.fy[i];
      q[tail++] = i;
    }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
      const j = nz * MAP_W + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      ty[j] = ty[i];
      q[tail++] = j;
    }
  }
  w.__eclTy = ty;
  return ty;
}
let sideMatC = null;
function sideMat(w) {
  if (!sideMatC) {
    sideMatC = voidRockMat(w).clone();
    sideMatC.side = THREE.DoubleSide;
    sideMatC.emissiveIntensity = 0.8;
  }
  return sideMatC;
}

// Junta geometrías (posición, normal y uv) en una sola.
export function mergeGeos(list) {
  const P = [];
  const N = [];
  const U = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    P.push(...g.attributes.position.array);
    N.push(...(g.attributes.normal?.array || new Float32Array(g.attributes.position.count * 3)));
    U.push(...(g.attributes.uv?.array || new Float32Array(g.attributes.position.count * 2)));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.computeBoundingSphere();
  return out;
}

// Una grieta de luz violeta en la cara de una pared: la raja oscura y la luz
// adentro. (x, z): un punto de la cara; n: hacia dónde mira; y0..y1: alto.
export function wallCrack(root, x, z, n, y0, y1, w0 = 0.5) {
  const g = new THREE.Group();
  const h = y1 - y0;
  const c = new THREE.Mesh(new THREE.PlaneGeometry(w0, h), crackMat());
  c.position.set(x + n[0] * 0.02, y0 + h / 2, z + n[1] * 0.02);
  c.rotation.y = Math.atan2(n[0], n[1]);
  c.renderOrder = 2;
  c.matrixAutoUpdate = false;
  c.updateMatrix();
  g.add(c);
  root.add(g);
  return g;
}

// Árbol del monte (timbó, lapacho: el de esterosProps, con la copa aparte).
export function monte(w, list, x, z, h, mat, r) {
  const M = w.M;
  const y = w.floorAt(x, z);
  const g = new THREE.Group();
  const tx = (r() - 0.5) * 0.4;
  const tz = (r() - 0.5) * 0.4;
  const len = Math.hypot(tx, h, tz);
  const m = mesh(cylGeo(0.22, 0.35, len, 8), M.bark, x + tx / 2, y + h / 2, z + tz / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx, h, tz).normalize());
  g.add(m);
  addFixed(w, g);
  w.addBox([x - 0.35, y, z - 0.35, x + 0.35, y + h * 0.6, z + 0.35], { kind: 'prop' });
  FOOT.push([x, y, z, 1.3, 1.3]);
  for (let k = 0; k < 6; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * 1.8;
    list.push([x + tx + Math.cos(a) * d, y + h + (r() - 0.3) * 1.2, z + tz + Math.sin(a) * d, 1.6 + r(), 0.9 + r() * 0.4, 1.6 + r(), r() * 3, mat]);
  }
}

// Las copas de hojitas (esterosGrass.leafCrownGeometry, con su luz y sombra
// por vértice): una malla instanciada por material.
// [x, y, z, sx, sy, sz, giro, material]
export function crownMeshes(list) {
  const out = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const mat of new Set(list.map((c) => c[7]))) {
    const mine = list.filter((c) => c[7] === mat);
    out.push(inst(leafCrownGeometry(), mat, mine, ([x, y, z, sx, sy, sz, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    }, { shadow: true }));
  }
  return out;
}

// Piedras grandes del suelo (afloramientos): dodecaedros aplastados juntos en
// una malla por material; frenan. [x, z, tamaño]
export function boulders(w, list, mat, r) {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const items = [];
  for (const [x, z, sz] of list) {
    const y = w.floorAt(x, z);
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * 6.3;
      const d = k ? sz * (0.5 + r() * 0.5) : 0;
      const ss = sz * (k ? 0.45 + r() * 0.3 : 1);
      items.push([x + Math.cos(a) * d, y, z + Math.sin(a) * d, ss, r() * 6, r() * 0.4]);
    }
    w.addBox([x - sz * 0.8, y, z - sz * 0.8, x + sz * 0.8, y + sz * 0.9, z + sz * 0.8], { kind: 'prop' });
    FOOT.push([x, y, z, sz * 1.1, sz * 1.1]);
  }
  return inst(geo, mat, items, ([x, y, z, ss, a, t], m4) => {
    q.setFromEuler(e.set(t, a, t * 0.6));
    m4.compose(v.set(x, y + ss * 0.22, z), q, s.set(ss * 1.25, ss * 0.75, ss));
  }, { shadow: true });
}

// ---------------- la isla ----------------

let crowns = [];
let reeds = [];
let ceiboFl = [];
let orb = null;
let pulse = [];

export function build(w, g, isl) {
  // (globalThis.__mduNoArteA: las islas de arte-A en bloques, para comparar)
  if (globalThis.__mduNoArteA === true) return;
  const M = w.M;
  const r = rng(4101);
  FOOT.length = 0;
  const out = keepOut();
  const root = new THREE.Group();
  root.name = 'eclipse:centro';
  cutToGbuf(M.reed, M.thatchFringe);
  const gb = new GeoBuilder();
  crowns = [];
  reeds = [];
  ceiboFl = [];
  pulse = [];
  const orbs = [];
  buildLagoon(w, isl, gb, root, r, out);
  buildMuelle(w, root, r);
  buildAlgarrobo(w, root, r);
  buildLoma(w, root, r, out, orbs);
  buildCamp(w, root, r, out);
  buildPaths(w, root, r, out);
  buildGrieta(w, root, r, out, orbs);
  buildGrass(w, root, r, out);
  buildIglesia(w, gb, root, r);
  buildBarraca(w, root, r);
  buildFrags(w, root, r, orbs);
  portalOrbs('centro', orbs);
  orb = orbiters(w, orbs, { seed: 77 });
  root.add(...crownMeshes(crowns));
  if (ceiboFl.length) {
    const red = new THREE.MeshStandardMaterial({ color: 0xd01818, emissive: 0x3a0000, emissiveIntensity: 0.6, roughness: 0.6 });
    const e = new THREE.Euler();
    const qq = new THREE.Quaternion();
    const vv = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    root.add(inst(new THREE.ConeGeometry(0.1, 0.22, 5), red, ceiboFl, ([x, y, z, a], m4) => m4.compose(vv.set(x, y, z), qq.setFromEuler(e.set(a, a * 2, 0)), one), { shadow: false }));
  }
  // el pajonal (el del bordo de la laguna y las matas altas): un dibujo
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(
    inst(crossGeo(1.2, 3), M.reed, reeds, ([x, y, z, h, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y, z), q, s.set(0.9 + (h - 2) * 0.2, h, 0.9 + (h - 2) * 0.2));
    }, { shadow: false }),
  );
  // los cordones y las bases de las barandas, con piedra de verdad (no el travertino)
  const frag = new Set(ISLANDS.centro.zones.filter((k) => ZONES[k].frag).map((k) => w.zoneKeys.indexOf(k)));
  const nearFrag = (i) => [1, -1, MAP_W, -MAP_W, 1 + MAP_W, 1 - MAP_W, -1 + MAP_W, -1 - MAP_W].some((d) => w.grid[i + d] === FLOOR && frag.has(w.zone[i + d]));
  CLIFFS.length = 0;
  curbs(w, 'centro', gb, (i) => w.edge[i] === EDGE_CORN || nearFrag(i));
  cliffRocks(w, root, out, r, 'centro');
  const arch = buildArch(gb, { ...M, ...extraMats(w), ...curbMats(w) }, 'eclipse:centro:bordo', w);
  w.root.add(arch, root);
  // la suciedad: oclusión al pie de los muros, humedad, musgo, charcos en el claro
  const gr = grime(w, 'centro', { seed: 4201, damp: 0.2, moss: 0.25, mud: 0.04, puddles: 9, out, wet: ['cE4'] });
  cullC = detailCuller(w, 'centro', [...root.children.filter((o) => o.userData.detail), ...gr.children]);
}
let cullC = null;

// Materiales propios de la isla para el GeoBuilder.
let EXM = null;
function extraMats(w) {
  if (EXM) return EXM;
  const T = w.T;
  EXM = {
    // el calcáreo del estero (en Eclipse 'calcareo' es el de la cripta del Monumento)
    calcareoEst: new THREE.MeshStandardMaterial({ map: T.calcareo, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  };
  OWN_MATS.add(EXM.calcareoEst);
  return EXM;
}

// ---------------- la laguna ----------------

// Las celdas de la laguna (B y la playa) y las de su borde de pajonal.
function lagoonCells(w) {
  const lag = w.zoneKeys.indexOf('B');
  const wet = new Uint8Array(MAP_W * MAP_H);
  const bank = [];
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] === FLOOR && w.zone[i] === lag) wet[i] = 1;
  });
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] === FLOOR || w.grid[i] === OUT || w.edge[i] !== EDGE_CORN) return;
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (wet[w.idx(x + dx, z + dz)]) near = true;
    if (near) bank.push([x, z]);
  });
  return { wet, bank, lag };
}

// el talud del bordo hacia el vacío: cuánto sale y cuánto baja (hasta meterse en la roca)
const SLOPE_D = 1.2;
const SLOPE_H = 3.2;

let lagoon = null;
function buildLagoon(w, isl, gb, root, r, out) {
  const M = w.M;
  const { wet, bank } = lagoonCells(w);
  const bankSet = new Set(bank.map(([x, z]) => w.idx(x, z)));
  const lvl = WATER_Y ?? ZONES.B.water ?? ZONES.B.y + 1.55;
  const BED = ZONES.B.y;
  const TOP = ZONES.A.y + 0.08;
  // la caja de la laguna (con un margen de una celda: ahí ya hay tierra)
  let x0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let z1 = -1e9;
  for (let i = 0; i < wet.length; i++) {
    if (!wet[i]) continue;
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x + 1);
    z1 = Math.max(z1, z + 1);
  }
  // la playa (la rampa que baja a la laguna) también es agua donde la tapa
  const beach = (x, z) => {
    const k = zoneAtCell(w, x, z);
    return k === 'A' && w.floorAt(x, z) < lvl;
  };
  x0 -= 4;
  z0 -= 2;
  x1 += 2;
  z1 += 2;
  // ---- el bordo de tierra (las celdas de pajonal): tapa el cordón de Levels y ataja el agua
  for (const [x, z] of bank) {
    gb.flat('grass', x, z, x + 1, z + 1, TOP, true);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const j = w.idx(nx, nz);
      if (bankSet.has(j)) continue;
      // el borde de la celda del lado (dx, dz), de izquierda a derecha mirándolo
      // desde afuera (como Levels.face: así la cara mira hacia (dx, dz))
      const mx = x + 0.5 + dx * 0.5;
      const mz = z + 0.5 + dz * 0.5;
      const ax = mx - dz * 0.5;
      const az = mz + dx * 0.5;
      const bx = mx + dz * 0.5;
      const bz = mz - dx * 0.5;
      const n = [dx, 0, dz];
      if (wet[j]) {
        // hacia el agua: la orilla en barranca hasta el lecho (22 cm adentro)
        const s = 0.22;
        const ua = (ax * -dz + az * dx) / 2;
        const ub = (bx * -dz + bz * dx) / 2;
        const len = Math.hypot(TOP - BED, s);
        gb.quad('dirtDark', [ax + dx * s, BED - 0.05, az + dz * s], [bx + dx * s, BED - 0.05, bz + dz * s], [bx, TOP, bz], [ax, TOP, az], [dx * 0.8, 0.6, dz * 0.8], [ua, 0], [ub, 0], [ub, len / 2], [ua, len / 2]);
      } else if (w.grid[j] === FLOOR) {
        // contra el claro: el escaloncito de pasto
        const y0 = w.floorAt(nx + 0.5, nz + 0.5) - 0.02;
        if (y0 < TOP) gb.wall('dirtDark', ax + dx * 0.004, az + dz * 0.004, bx + dx * 0.004, bz + dz * 0.004, y0, TOP, n, 2);
      } else if (w.grid[j] === OUT) {
        // hacia el vacío: el talud de tierra que baja hasta meterse en la roca de la isla
        const len = Math.hypot(SLOPE_D, SLOPE_H);
        const nl = Math.hypot(SLOPE_H, SLOPE_D);
        const ua = (ax * -dz + az * dx) / 2;
        const ub = (bx * -dz + bz * dx) / 2;
        gb.quad('grass', [ax + dx * SLOPE_D, TOP - SLOPE_H, az + dz * SLOPE_D], [bx + dx * SLOPE_D, TOP - SLOPE_H, bz + dz * SLOPE_D], [bx, TOP, bz], [ax, TOP, az], [(dx * SLOPE_H) / nl, SLOPE_D / nl, (dz * SLOPE_H) / nl], [ua, 0], [ub, 0], [ub, len / 2], [ua, len / 2]);
      } else {
        // contra la baranda del claro: la cara de tierra derecha hasta la roca (3 cm
        // afuera del cordón y 4 cm más larga en cada punta: sin rendijas en las esquinas)
        const o = 0.03;
        const e = 0.04;
        gb.wall('dirtDark', ax + dx * o - dz * e, az + dz * o + dx * e, bx + dx * o + dz * e, bz + dz * o - dx * e, BED - 2.2, TOP, n, 2);
      }
    }
    // las esquinas de afuera entre dos taludes: un triángulo que las cierra
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (w.grid[w.idx(x + dx, z)] !== OUT || w.grid[w.idx(x, z + dz)] !== OUT) continue;
      const px = x + (dx > 0 ? 1 : 0);
      const pz = z + (dz > 0 ? 1 : 0);
      const P = [px, TOP, pz];
      const Q = [px + dx * SLOPE_D, TOP - SLOPE_H, pz];
      const R = [px, TOP - SLOPE_H, pz + dz * SLOPE_D];
      const n = [dx * 0.6, 0.53, dz * 0.6];
      if (dx * dz > 0) gb.quad('grass', R, Q, P, P, n, [0, 0], [1, 0], [0.5, 1], [0.5, 1]);
      else gb.quad('grass', Q, R, P, P, n, [0, 0], [1, 0], [0.5, 1], [0.5, 1]);
    }
  }
  // ---- el agua de verdad (fx/Water), recortada a la laguna ----
  // El agua de fx/Water es un plano que sigue a la cámara: acá se descarta
  // todo lo que no es laguna (una máscara por celda) en el color y en el
  // G-buffer de fx/Epic; si no, se veía un espejo de punta a punta del vacío
  // (y, desde las islas de abajo, un techo).
  const mw = x1 - x0;
  const mh = z1 - z0;
  const mask = new Uint8Array(mw * mh);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      let on = 0;
      for (let dz = -1; dz <= 1 && !on; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!w.inside(x + dx, z + dz)) continue;
          if (wet[w.idx(x + dx, z + dz)] || beach(x + dx + 0.5, z + dz + 0.5)) on = 255;
        }
      }
      mask[(z - z0) * mw + (x - x0)] = on;
    }
  }
  const mtex = new THREE.DataTexture(mask, mw, mh, THREE.RedFormat, THREE.UnsignedByteType);
  mtex.magFilter = mtex.minFilter = THREE.NearestFilter;
  mtex.needsUpdate = true;
  const MB = new THREE.Vector4(x0, z0, 1 / mw, 1 / mh);
  const groundAt = (x, z) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return NaN;
    const i = w.idx(cx, cz);
    if (wet[i] || beach(x, z)) return w.floorAt(x, z);
    if (bankSet.has(i)) return TOP;
    if (w.grid[i] === FLOOR) return w.floorAt(x, z);
    return NaN;
  };
  const water = new Water(w.g, {
    level: lvl,
    groundAt,
    bounds: [x0, z0, x1, z1],
    // (color té del Iberá, como el estero; laguna quieta)
    body: 0x161408,
    clear: 1.0,
    flow: [0.01, 0.006],
    wind: 0.8,
    swell: 0.25,
  });
  // (mundo, it. 4) fuera de la caja de la máscara también se descarta: la textura
  // repetía su borde y el agua de la laguna salía en franjas por el claro a 29,85;
  // en la cripta del estero se veía como una losa a la altura de los ojos
  const clip = globalThis.__mduNoLagoonClip === true ? '' : 'if (any(lessThan(eclUv, vec2(0.0))) || any(greaterThan(eclUv, vec2(1.0)))) discard;\n\t';
  const wm = water.mat;
  const prev = wm.onBeforeCompile;
  wm.onBeforeCompile = (sh, rr) => {
    prev(sh, rr);
    sh.uniforms.eclMask = { value: mtex };
    sh.uniforms.eclMB = { value: MB };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D eclMask;\nuniform vec4 eclMB;\nvoid main() {\n\tvec2 eclUv = (vWp.xz - eclMB.xy) * eclMB.zw;\n\t' + clip + 'if (texture2D(eclMask, eclUv).r < 0.5) discard;');
  };
  wm.customProgramCacheKey = () => 'water1ecl';
  // (y en el G-buffer de fx/Epic, que lo dibuja con su propio material)
  wm.userData.gbuf = {
    key: 'eclLagoon',
    solid: true,
    patch: (s) => {
      s.uniforms.eclMask = { value: mtex };
      s.uniforms.eclMB = { value: MB };
      s.vertexShader = s.vertexShader.replace('void main() {', 'varying vec2 vEclXZ;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEclXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader.replace('void main() {', 'uniform sampler2D eclMask;\nuniform vec4 eclMB;\nvarying vec2 vEclXZ;\nvoid main() {\n\tvec2 eclUv = (vEclXZ - eclMB.xy) * eclMB.zw;\n\t' + clip + 'if (texture2D(eclMask, eclUv).r < 0.5) discard;');
    },
  };
  w.water = water;
  w.root.add(water.mesh);
  // cuánta agua hay (nadar, vadear, el campo de flujo de los muertos): solo en la laguna
  w.waterDepth = (x, z) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return 0;
    const i = w.idx(cx, cz);
    if (!wet[i] && !beach(x, z)) return 0;
    return Math.max(0, water.level - w.floorAt(x, z));
  };
  // de lejos (desde otra isla) el agua de verdad no se dibuja: un espejo
  // oscuro quieto en su lugar (las ondas, el reflejo y su simulación solo cerca)
  const farGeo = new GeoBuilder();
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (mask[(z - z0) * mw + (x - x0)]) farGeo.flat('far', x, z, x + 1, z + 1, lvl, true);
  const far = farGeo.build({ far: new THREE.MeshStandardMaterial({ color: 0x15231d, roughness: 0.1, metalness: 0.2 }) }, { castShadow: false });
  far.visible = false;
  (w.warmHidden ||= []).push(far);
  w.root.add(far);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  lagoon = { water, far, cx, cz, lvl };

  // ---- los irupés: hojas redondas de borde levantado, y alguna flor ----
  const MU = muelleDims();
  // (las cavas del Gil, en el fondo: ni hojas ni juncos encima)
  const cavas = (ANCHORS?.cavas || []).map((c) => [c.x, c.z]);
  const pads = [];
  for (let t = 0; t < 900 && pads.length < 34; t++) {
    const px = x0 + r() * (x1 - x0);
    const pz = z0 + r() * (z1 - z0);
    const size = 0.5 + r() * 0.85;
    // en lo hondo, lejos del bordo y del muelle
    if (!wet[w.idx(Math.floor(px), Math.floor(pz))]) continue;
    if (!onFloor(w, px, pz, size + 0.35, ['B'])) continue;
    if (MU && Math.abs(px - MU.x) < 1.6 + size && pz < MU.z1 + 0.8 + size) continue;
    if (MU && Math.hypot(px - MU.bote[0], pz - MU.bote[1]) < 3 + size) continue;
    if (cavas.some((c) => Math.hypot(px - c[0], pz - c[1]) < 1.4 + size)) continue;
    if (pads.some(([x2, z2, s2]) => Math.hypot(px - x2, pz - z2) < (size + s2) * 1.02)) continue;
    pads.push([px, pz, size, r() * Math.PI * 2]);
  }
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const padMat = new THREE.MeshStandardMaterial({ map: irupeTex(), color: 0x9aa890, roughness: 0.82, side: THREE.DoubleSide });
  root.add(
    inst(irupeGeo(), padMat, pads, ([x, z, sz, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, lvl + 0.012, z), q, s.set(sz, 1, sz));
    }, { shadow: false }),
  );
  const flowers = pads.filter(() => r() < 0.3);
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, emissive: 0x3a2a30, emissiveIntensity: 0.5, roughness: 0.6, side: THREE.DoubleSide });
  root.add(
    inst(flowerGeo(), petalMat, flowers, ([x, z, sz, a], m4) => {
      q.setFromAxisAngle(up, a + 1);
      m4.compose(v.set(x + Math.cos(a) * sz * 0.9, lvl + 0.035, z + Math.sin(a) * sz * 0.9), q, s.set(1, 1, 1));
    }, { detail: true }),
  );

  // ---- el pajonal del bordo y los juncos de la orilla ----
  for (const [x, z] of bank) {
    for (let k = 0; k < 3; k++) {
      const px = x + 0.15 + r() * 0.7;
      const pz = z + 0.15 + r() * 0.7;
      if (out(px, pz, 0.4)) continue;
      reeds.push([px, TOP - 0.05, pz, 2.0 + r() * 0.8, r() * Math.PI]);
    }
  }
  const rush = [];
  for (let t = 0; t < 1400; t++) {
    const px = x0 + r() * (x1 - x0);
    const pz = z0 + r() * (z1 - z0);
    const i = w.idx(Math.floor(px), Math.floor(pz));
    if (!wet[i]) continue;
    // pegado al bordo o a la barranca del claro (a menos de 0,9 m de una celda que no es laguna)
    let near = false;
    for (const [ox, oz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
      const j = w.idx(Math.floor(px + ox), Math.floor(pz + oz));
      if (bankSet.has(j) || (w.grid[j] === FLOOR && !wet[j] && !beach(px + ox, pz + oz))) near = true;
    }
    if (!near || r() < 0.45) continue;
    if (MU && Math.abs(px - MU.x) < 1.4 && pz < MU.z1 + 0.6) continue;
    if (cavas.some((c) => Math.hypot(px - c[0], pz - c[1]) < 1.6)) continue;
    rush.push([px, BED, pz, lvl - BED + 0.5 + r() * 0.7, r() * Math.PI]);
  }
  const rushMat = windy(evenFoliage(new THREE.MeshStandardMaterial({ map: M.reed.map, color: 0x9aa070, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 })));
  cutToGbuf(rushMat);
  root.add(
    inst(crossGeo(0.5), rushMat, rush, ([x, y, z, h, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.05, z), q, s.set(0.8, h, 0.8));
    }, { detail: true }),
  );
}

// El muelle viejo: sale de la orilla norte de la laguna hacia el medio, con el
// farol (su luz: la de tag 'muelle' de centro.py) colgado del segundo pilote.
function muelleDims() {
  const L = lightTag('muelle');
  if (!L) return null;
  const B = zbox('B', true);
  const wd = 1.5;
  const x = L.pos[0] - wd / 2;
  const z0 = B[1] - 1.4;
  const z1 = B[1] + 6.2;
  return { x, z0, z1, w: wd, deck: ZONES.A.y + 0.52, L, shore: B[1], bote: [L.pos[0] + 1.7, B[1] + 4.4] };
}
function buildMuelle(w, root, r) {
  const MU = muelleDims();
  if (!MU) return;
  const M = w.M;
  const g = new THREE.Group();
  const { x, z0, z1, w: wd, deck } = MU;
  for (let z = z0 + 0.2, k = 0; z <= z1; z += 1.45, k++) {
    for (const sx of [-1, 1]) {
      const px = x + (sx * wd) / 2;
      const base = w.floorAt(px, z) - (zoneAtCell(w, px, z) === 'B' ? 0.1 : 0.25);
      // (alguno quebrado más arriba o más abajo; el segundo de la derecha es el del farol)
      const top = deck + (k === 4 && sx > 0 ? -0.5 : k === 1 && sx > 0 ? 1.3 : 0.18 + r() * 0.25);
      g.add(mesh(cylGeo(0.085, 0.1, top - base, 7), M.woodDark, px, (top + base) / 2, z, (r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04));
      w.addBox([px - 0.12, base, z - 0.12, px + 0.12, top, z + 0.12], { kind: 'prop' });
    }
    // el travesaño de cada par
    if (k !== 4) g.add(mesh(boxGeo(wd + 0.3, 0.12, 0.14), M.woodDark, x, deck - 0.1, z));
  }
  // las vigas de los costados y las tablas (faltan las de la punta)
  const len = z1 - z0;
  for (const sx of [-1, 1]) g.add(mesh(boxGeo(0.12, 0.14, len * 0.72), M.woodDark, x + (sx * (wd - 0.1)) / 2, deck - 0.02, z0 + len * 0.36));
  for (let z = z0 + 0.05; z < z0 + len * 0.7; z += 0.24) {
    if (r() < 0.12) continue;
    g.add(mesh(boxGeo(wd + 0.2, 0.05, 0.21), M.wood, x + (r() - 0.5) * 0.06, deck + 0.075, z, 0, (r() - 0.5) * 0.04, (r() - 0.5) * 0.03));
  }
  // una tabla suelta colgando de la punta, hasta el agua
  g.add(mesh(boxGeo(0.21, 0.05, 1.5), M.wood, x + 0.45, deck - 0.45, z0 + len * 0.76, -0.7, 0.2, 0));
  // el farol, colgado de un brazo del pilote alto, donde está su luz
  const [lx, ly, lz] = MU.L.pos;
  const px = x + wd / 2;
  const pz = z0 + 0.2 + 1.45;
  g.add(mesh(boxGeo(0.05, 0.05, Math.abs(lz - pz) + 0.1), M.iron, px, ly + 0.21, (lz + pz) / 2));
  g.add(mesh(cylGeo(0.006, 0.006, 0.08, 4), M.iron, lx, ly + 0.15, lz));
  g.add(mesh(boxGeo(0.16, 0.22, 0.16), M.glassLamp, lx, ly, lz));
  g.add(mesh(new THREE.ConeGeometry(0.14, 0.1, 4), M.iron, lx, ly + 0.14, lz, 0, Math.PI / 4, 0));
  addFixed(w, g);
  // (el tablero sobre el claro y la punta sobre la barranca: no se sube; los que
  // nadan pasan por abajo entre los pilotes)
  w.addBox([x - wd / 2 - 0.15, ZONES.A.y - 2, z0 - 0.1, x + wd / 2 + 0.15, deck + 0.12, MU.shore], { kind: 'prop' });
  // un bote amarrado al costado del muelle, flotando (frena al que nada)
  const [bx, bz] = MU.bote;
  const lvl = lagoon?.lvl ?? WATER_Y;
  put(w, { type: 'bote', pos: [bx, bz], rot: 0.08, y: lvl - 0.32 }, { boxes: false, foot: false });
  w.addBox([bx - 0.95, ZONES.B.y, bz - 2.2, bx + 0.95, lvl + 0.35, bz + 2.6], { kind: 'prop' });
  void root;
}

// ---------------- el algarrobo de los colgados, partido ----------------

// Las dos mitades del tronco, abiertas en V; entre las dos, la grieta violeta
// (una luz aditiva con un rayo quebrado y la madera de adentro con vetas que
// brillan); de cada mitad salen dos ramas grandes; sogas con lazo colgando de
// la rama más larga; velas coloradas y cintas al pie. Mira al inicio: desde
// ahí se ve la grieta de frente. (En la loma: más grande que en el v3.)
function buildAlgarrobo(w, root, r) {
  const M = w.M;
  const [ax, az] = EE.algarrobo;
  const y = w.floorAt(ax, az);
  const S = 1.7;
  const g = new THREE.Group();
  g.position.set(ax, y, az);
  // el plano de la grieta apunta al inicio
  g.rotation.y = Math.atan2(PLAYER_START.x - ax, PLAYER_START.z - az);
  const rb = 0.75 * S;
  const rt = 0.55 * S;
  const H = 2.3 * S;
  const lean = 0.085;
  const gap0 = 0.05;
  const heart = heartMat();
  // (la corteza del algarrobo: la de los rollizos, más clara que la del monte)
  const BARK = M.log;
  const tips = [];
  const roots = [];
  const stickTo = (grp, mat, a, b, r0, r1 = r0, seg = 7) => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const m = new THREE.Mesh(cylGeo(r1, r0, A.distanceTo(B), seg), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    return m;
  };
  const branch = (grp, from, dir, len, rad, depth) => {
    const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
    stickTo(grp, BARK, from, to, rad, rad * 0.65, 6);
    if (depth <= 0) {
      tips.push({ grp, to, from });
      return;
    }
    for (let k = 0; k < 2; k++) {
      const d = [dir[0] + (r() - 0.5) * 0.9, dir[1] * 0.6 + (r() - 0.2) * 0.4, dir[2] + (r() - 0.5) * 0.9];
      const l = Math.hypot(...d);
      branch(grp, to, d.map((u) => u / l), len * 0.72, rad * 0.62, depth - 1);
    }
  };
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.position.x = (side * gap0) / 2;
    half.rotation.z = -side * lean;
    // media corteza (θ de 0 a π es x ≥ 0) y la cara del corte
    const geo = new THREE.CylinderGeometry(rt, rb, H, 10, 3, true, side > 0 ? 0 : Math.PI, Math.PI);
    const bark = new THREE.Mesh(geo, BARK);
    bark.position.y = H / 2;
    bark.castShadow = bark.receiveShadow = true;
    half.add(bark);
    const cut = new THREE.BufferGeometry();
    cut.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -rb, 0, 0, rb, 0, H, rt, 0, H, -rt], 3));
    cut.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    // (la cara mira hacia la grieta: -x en la mitad de la derecha)
    cut.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    cut.computeVertexNormals();
    const face = new THREE.Mesh(cut, heart);
    face.castShadow = face.receiveShadow = true;
    half.add(face);
    // la tapa de arriba de la media corteza (un semicírculo)
    const cap = new THREE.Mesh(new THREE.CircleGeometry(rt, 10, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), BARK);
    cap.position.y = H;
    half.add(cap);
    // raíces de esta mitad (del lado de su corteza)
    for (let k = 0; k < 3; k++) {
      const a = (side > 0 ? Math.PI / 2 : -Math.PI / 2) + ((k - 1) / 3) * Math.PI * 0.9 + (r() - 0.5) * 0.3;
      const a0 = [Math.sin(a) * 0.4 * S, 0.4 * S, Math.cos(a) * 0.4 * S];
      const a1 = [Math.sin(a) * 1.55 * S, -0.12, Math.cos(a) * 1.55 * S];
      stickTo(half, BARK, a0, a1, 0.28 * S, 0.08 * S, 6);
      roots.push([a0, a1, half]);
    }
    // dos ramas grandes, hacia afuera de su lado
    const top = [side * rt * 0.45, H - 0.1, 0];
    for (let k = 0; k < 2; k++) {
      const az2 = (k ? 0.75 : -0.75) + (r() - 0.5) * 0.3;
      const up = 0.55 + r() * 0.25;
      const d = [side * Math.cos(az2) * 0.85, up, Math.sin(az2) * 0.85];
      const l = Math.hypot(...d);
      branch(half, top, d.map((u) => u / l), (k === 0 && side > 0 ? 4.0 : 3.0) * S, 0.34 * S, 2);
    }
    g.add(half);
  }
  // la grieta: la luz en el medio, del piso a la horqueta y un poco más arriba
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.75, H * 1.25), crackMat());
  crack.rotation.y = Math.PI / 2;
  crack.position.set(0, (H * 1.25) / 2 - 0.05, 0);
  crack.renderOrder = 2;
  // (suelta, sin sombra: no va a lo fundido)
  crack.userData.dynamic = true;
  crack.castShadow = false;
  g.add(crack);
  // las copas, ralas (instanciadas aparte: World.addStatic les saca el color
  // por vértice de la luz y la sombra, y salían negras)
  g.updateMatrixWorld(true);
  for (const t of tips) {
    if (r() < 0.45) continue;
    const p = new THREE.Vector3(t.to[0], t.to[1] + 0.2, t.to[2]).applyMatrix4(t.grp.matrixWorld);
    crowns.push([p.x, p.y, p.z, 1.3 * S, 0.45 * S, 1.1 * S, r() * 3, M.leafDark]);
  }
  // las sogas: de las ramas más largas (atadas a su último tramo), con lazo
  tips.slice(0, 8).forEach((t, k) => {
    if (k % 3) return;
    const len = 1.6 + r() * 0.8;
    const f = t.from;
    const p = [f[0] + (t.to[0] - f[0]) * 0.55, f[1] + (t.to[1] - f[1]) * 0.55, f[2] + (t.to[2] - f[2]) * 0.55];
    // (la soga cuelga a plomo en el mundo: la mitad está inclinada, se corrige con su giro)
    const pw = new THREE.Vector3(...p);
    t.grp.updateMatrix();
    pw.applyMatrix4(t.grp.matrix);
    const rope = new THREE.Group();
    rope.position.copy(pw);
    rope.add(mesh(cylGeo(0.02, 0.02, len, 5), M.rope, 0, -len / 2, 0));
    rope.add(mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 10), M.rope, 0, -len - 0.12, 0, 0, r() * 3, Math.PI / 2));
    g.add(rope);
  });
  // cintas coloradas atadas al tronco: pegadas a la corteza de cada mitad
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.3) continue;
    const side = Math.sign(Math.sin(a));
    const yy = 0.7 + r() * 1.3;
    const len = 0.3 + r() * 0.4;
    const ym = yy - len / 2;
    const rr = rb - (rb - rt) * (ym / H) + 0.015;
    const axis = side * (gap0 / 2 + ym * Math.sin(lean));
    g.add(mesh(boxGeo(0.05, len, 0.006), M.redCloth, axis + Math.sin(a) * rr, ym, Math.cos(a) * rr, 0, a, side * lean));
  }
  g.updateMatrixWorld(true);
  // las raíces en el piso (en el mundo, para que las velas no caigan encima)
  const rootSeg = roots.map(([a0, a1, half]) => {
    half.updateMatrixWorld(true);
    const p0 = new THREE.Vector3(...a0).applyMatrix4(half.matrixWorld);
    const p1 = new THREE.Vector3(...a1).applyMatrix4(half.matrixWorld);
    return [p0.x, p0.z, p1.x, p1.z];
  });
  const segD = (px, pz, [x0, z0, x1, z1]) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - x0 - dx * t, pz - z0 - dz * t);
  };
  // velas coloradas al pie, entre las raíces
  const candles = [];
  for (let k = 0; k < 90 && candles.length < 18; k++) {
    const a = r() * Math.PI * 2;
    const d = rb + 0.4 + r() * 1.1;
    const px = ax + Math.cos(a) * d;
    const pz = az + Math.sin(a) * d;
    if (rootSeg.some((sg) => segD(px, pz, sg) < 0.42)) continue;
    if (candles.some(([x2, , z2]) => Math.hypot(px - x2, pz - z2) < 0.12)) continue;
    candles.push([px, w.floorAt(px, pz), pz, 0.1 + r() * 0.16]);
  }
  const wax = new THREE.MeshStandardMaterial({ color: 0xa8141a, roughness: 0.6 });
  root.add(
    inst(cylGeo(0.035, 0.04, 1, 8), wax, candles, ([x, yy, z, h], m4) => m4.makeScale(1, h, 1).setPosition(x, yy + h / 2, z), { detail: true }),
    inst(new THREE.ConeGeometry(0.022, 0.07, 6), M.flame, candles, ([x, yy, z, h], m4) => m4.makeTranslation(x, yy + h + 0.035, z), { detail: true }),
  );
  // las grietas del piso, que salen del pie del árbol
  root.add(floorCracks(w, [[ax, az]], rb + 0.1, 7, 0.16, r, ['A2']));
  // el tronco frena (las ramas quedan arriba)
  w.addBox([ax - rb - 0.2, y, az - rb - 0.2, ax + rb + 0.2, y + 3.2 * S, az + rb + 0.2], { kind: 'prop', firm: true });
  FOOT.push([ax, y, az, rb + 1.4, rb + 1.4]);
  addFixed(w, g);
}

// Grietas de luz en el piso que salen de unos puntos (decal aditivo, 1,5 cm arriba).
function floorCracks(w, from, r0, n, wd0, r, keys) {
  const out = keepOut();
  const P = [];
  const U = [];
  for (const [ax, az] of from) {
    const y = w.floorAt(ax, az);
    for (let k = 0; k < n; k++) {
      let a = (k / n) * Math.PI * 2 + r() * 0.5;
      let px = ax + Math.cos(a) * r0;
      let pz = az + Math.sin(a) * r0;
      const m = 6 + Math.floor(r() * 7);
      let wd = wd0;
      for (let s = 0; s < m; s++) {
        a += (r() - 0.5) * 0.9;
        const nx = px + Math.cos(a) * 0.55;
        const nz = pz + Math.sin(a) * 0.55;
        if (!keys.includes(zoneAtCell(w, nx, nz)) || Math.abs(w.floorAt(nx, nz) - y) > 0.02 || out(nx, nz, 0.2)) break;
        const ex = -Math.sin(a) * wd;
        const ez = Math.cos(a) * wd;
        const w2 = wd * 0.82;
        const fx = -Math.sin(a) * w2;
        const fz = Math.cos(a) * w2;
        const yy = y + 0.015;
        P.push(px - ex, yy, pz - ez, px + ex, yy, pz + ez, nx + fx, yy, nz + fz, px - ex, yy, pz - ez, nx + fx, yy, nz + fz, nx - fx, yy, nz - fz);
        const v0 = (s / m) * 4;
        const v1 = ((s + 1) / m) * 4;
        U.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
        px = nx;
        pz = nz;
        wd = w2;
      }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  cg.computeBoundingSphere();
  const m = new THREE.Mesh(cg, floorCrackMat());
  m.renderOrder = 2;
  m.matrixAutoUpdate = false;
  return m;
}

// La madera de adentro del algarrobo: oscura, con vetas violetas que brillan.
let heartMatC = null;
export function heartMat() {
  if (heartMatC) return heartMatC;
  const r = rng(91);
  const veins = [];
  for (let k = 0; k < 7; k++) {
    const pts = [];
    let px = 20 + r() * 88;
    for (let y = 256; y >= 0; y -= 12) {
      px = Math.max(4, Math.min(124, px + (r() - 0.5) * 16));
      pts.push([px, y]);
    }
    veins.push([pts, 1 + r() * 3]);
  }
  const draw = (glow) => (x, wd, ht) => {
    x.fillStyle = glow ? '#000' : '#2a1c16';
    x.fillRect(0, 0, wd, ht);
    if (!glow) {
      for (let k = 0; k < 40; k++) {
        x.strokeStyle = `rgba(${70 + r() * 30},${46 + r() * 20},${30 + r() * 14},0.5)`;
        x.lineWidth = 1 + r() * 2;
        x.beginPath();
        const px = r() * wd;
        x.moveTo(px, 0);
        x.lineTo(px + (r() - 0.5) * 20, ht);
        x.stroke();
      }
    }
    for (const [pts, lw] of veins) {
      x.strokeStyle = glow ? '#d6a0ff' : '#5a2c7a';
      x.lineWidth = lw;
      x.beginPath();
      pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.stroke();
    }
  };
  const map = canvasTex(128, 256, draw(false));
  const em = canvasTex(128, 256, draw(true));
  heartMatC = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.9, side: THREE.DoubleSide });
  return heartMatC;
}

// ---------------- la loma: el santuario, el cráter del portal sellado, el alambrado ----------------
function buildLoma(w, root, r, out, orbs) {
  const M = w.M;
  const K = ['A2'];
  const y = ZONES.A2.y;
  const [ax, az] = EE.algarrobo;
  const free = keepOut([[ax, az, 3.2]]);
  // el santuario del Gauchito y sus banderas, en la punta oeste (su luz: tag 'santuario')
  const S = lightTag('santuario');
  if (S) {
    const p = spot(w, free, K, S.pos[0], S.pos[2] - 0.3, 0.7, 2);
    if (p) {
      put(w, { type: 'santuario', pos: p, rot: 0 });
      for (const [dx, rot] of [[-1.9, 0.1], [1.9, -0.2]]) {
        const q = spot(w, free, K, p[0] + dx, p[1] - 0.1, 0.4, 1.2);
        if (q) put(w, { type: 'banderas', pos: q, rot });
      }
      // cruces y velas alrededor del santuario
      for (let k = 0; k < 3; k++) {
        const q = spot(w, free, K, p[0] + (r() - 0.5) * 4, p[1] + 1.6 + r() * 1.5, 0.3, 1.5);
        if (q) put(w, { type: 'cruzCinta', pos: q, rot: (r() - 0.5) * 0.8, h: 1.0 + r() * 0.4, vela: true });
      }
    }
  }
  // cruces con cintas alrededor del algarrobo
  for (const [dx, dz, rot] of [[-3.4, 2.4, 0.3], [3.6, 2.0, -0.4], [-4.0, -1.6, 0.9], [1.8, 3.9, 0.1], [4.6, -1.8, -0.6]]) {
    const q = spot(w, out, K, ax + dx, az + dz, 0.3, 1.2);
    if (q) put(w, { type: 'cruzCinta', pos: q, rot, h: 1.1 + r() * 0.35, vela: r() < 0.6 });
  }
  // el cráter del portal sellado (al Desgarro): el pasto quemado, piedras
  // levantadas en anillo, grietas que salen y piedras negras que giran
  const P = PORTALS.find((p) => p.locked);
  const e = P && [P.a, P.b].find((x) => ZONES[x.zone]?.isla === 'centro');
  if (e) {
    const [px, pz] = e.pos;
    root.add(floorCracks(w, [[px, pz]], 2.6, 9, 0.12, r, K));
    // el anillo de piedras levantadas (inclinadas hacia afuera), fuera de los 2 m del portal
    const ring = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + r() * 0.2;
      const d = 3.3 + r() * 0.8;
      const x = px + Math.cos(a) * d;
      const z = pz + Math.sin(a) * d;
      if (!onFloor(w, x, z, 0.4, K) || keepOut()(x, z, 0.2) && Math.hypot(x - px, z - pz) < 3.1) continue;
      if (Math.hypot(x - ax, z - az) < 3) continue;
      ring.push([x, z, 0.25 + r() * 0.35, a]);
    }
    const q = new THREE.Quaternion();
    const ee = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    root.add(inst(new THREE.DodecahedronGeometry(1, 0), voidRockMat(w), ring, ([x, z, sz, a], m4) => {
      q.setFromEuler(ee.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5));
      m4.compose(v.set(x, y + sz * 0.3, z), q, s.set(sz * 0.8, sz * 1.5, sz * 0.7));
    }));
    for (const [x, z, sz] of ring) w.addBox([x - sz * 0.6, y, z - sz * 0.6, x + sz * 0.6, y + sz * 1.4, z + sz * 0.6], { kind: 'prop' });
    orbs.push({ c: [px, y + 2.6, pz], r: [2.4, 4.2], h: 2.6, n: 14, s: [0.08, 0.3], sp: 0.22 });
  }
  // el alambrado del borde norte de la loma (contra el vacío), que en la punta
  // oeste se levanta, se tuerce y se va al aire (la disformidad)
  const [x0, z0, x1, z1] = zbox('A2');
  const fence = new THREE.Group();
  let last = null;
  for (let x = x0 + 0.6; x < x1 - 0.5; x += 1.6) {
    // el piso más al norte de esa columna
    let zn = null;
    for (let z = Math.floor(z0); z < z1; z++) if (zoneAtCell(w, x, z + 0.5) === 'A2') {
      zn = z;
      break;
    }
    const nI = zn == null ? -1 : w.idx(Math.floor(x), zn - 1);
    // (contra una pared maciza, la barraca, no va)
    if (zn == null || w.grid[nI] === FLOOR || (w.grid[nI] !== OUT && w.edge[nI] === 0) || w.grid[nI] === DOOR) {
      last = null;
      continue;
    }
    const z = zn + 0.4;
    if (out(x, z, 0.3) || !onFloor(w, x, z, 0.15, K)) {
      last = null;
      continue;
    }
    const t = Math.max(0, (x0 + 9 - x) / 9);
    const lift = t * t * 3.4;
    const tw = t * 1.1;
    const p = [x, y + lift, z - Math.sin(t * 2.4) * t * 1.2];
    fence.add(mesh(cylGeo(0.05, 0.06, 1.3, 6), M.fenceDark, p[0], p[1] + 0.6, p[2], tw * 0.4, 0, -tw));
    if (lift < 0.05) w.addBox([x - 0.08, y, z - 0.08, x + 0.08, y + 1.2, z + 0.08], { kind: 'prop' });
    if (last && Math.abs(last[0] - p[0]) < 2) {
      for (const hy of [0.45, 0.8, 1.1]) {
        const A = new THREE.Vector3(last[0], last[1] + hy, last[2]);
        const B = new THREE.Vector3(p[0], p[1] + hy, p[2]);
        const wire = new THREE.Mesh(cylGeo(0.008, 0.008, A.distanceTo(B), 3), M.iron);
        wire.position.copy(A).add(B).multiplyScalar(0.5);
        wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
        fence.add(wire);
      }
    }
    last = p;
    if (t > 0.3) orbs.push({ c: [p[0], p[1] + 0.6, p[2]], r: [0.4, 1.1], h: 0.8, n: 2, s: [0.04, 0.1], sp: 0.5 });
  }
  addFixed(w, fence);
  void z1;
  // el obraje: la locomóvil vieja y los rollizos, al lado de la barraca
  for (const [u, v, rad, def] of [[0.8, 0.72, 1.8, { type: 'locomovil', rot: -0.3 }], [0.66, 0.85, 1.5, { type: 'troncos', rot: 0.1, len: 3, rows: 3, hacha: true }]]) {
    const [x, z] = zat('A2', u, v, true);
    const q = spot(w, keepOut([[ax, az, 3.5]]), K, x, z, rad, 3);
    if (q) put(w, { ...def, pos: q });
  }
  // piedras grandes contra el borde de la loma
  const rocks = [];
  for (let k = 0; k < 40 && rocks.length < 7; k++) {
    const [x, z] = zat('A2', r(), r(), true);
    if (!onFloor(w, x, z, 1.2, K) || out(x, z, 1) || Math.hypot(x - ax, z - az) < 4.5) continue;
    if (e && Math.hypot(x - e.pos[0], z - e.pos[1]) < 5) continue;
    if (rocks.some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 4)) continue;
    rocks.push([x, z, 0.5 + r() * 0.5]);
  }
  root.add(boulders(w, rocks, M.rock, r));
}

// ---------------- el claro: fogón, enramada, carreta, cruces, monte ----------------
function buildCamp(w, root, r, out) {
  const M = w.M;
  const K = ['A'];
  const [fx, fz] = EE.fogon;
  // el fogón de Fierro: piedras, leña, brasas, el trípode y la pava
  put(w, { type: 'fogonCampo', pos: [fx, fz] });
  // troncos para sentarse alrededor (no del lado del inicio)
  const toStart = Math.atan2(PLAYER_START.z - fz, PLAYER_START.x - fx);
  for (const da of [1.25, 2.6, -1.35]) {
    const a = toStart + Math.PI + da;
    const px = fx + Math.cos(a) * 1.75;
    const pz = fz + Math.sin(a) * 1.75;
    if (out(px, pz, 0.5) || !onFloor(w, px, pz, 0.5, K)) continue;
    put(w, { type: 'logseat', pos: [px, pz], rot: -a + Math.PI / 2 });
  }
  for (const [d, a0, def] of [[2.8, 0.6, { type: 'recados', rot: 0.5, n: 2 }], [3.1, -0.15, { type: 'firewood', rot: 1.2 }]]) {
    const q = spot(w, out, K, fx + Math.cos(toStart + Math.PI + a0) * d, fz + Math.sin(toStart + Math.PI + a0) * d, 0.5, 1.5);
    if (q) put(w, { ...def, pos: q }, { boxes: def.type !== 'recados' });
  }
  // el asador criollo: la estaca clavada al costado, inclinada sobre las brasas, con el costillar
  {
    const y = w.floorAt(fx, fz);
    const a = toStart + Math.PI * 0.5;
    const bx = fx + Math.cos(a) * 1.75;
    const bz = fz + Math.sin(a) * 1.75;
    if (!out(bx, bz, 0.2) && onFloor(w, bx, bz, 0.2, K)) {
      const g = new THREE.Group();
      g.position.set(bx, y, bz);
      g.rotation.y = -a + Math.PI;
      const rod = new THREE.Group();
      rod.rotation.z = -0.6;
      rod.add(mesh(cylGeo(0.018, 0.022, 1.9, 6), M.iron, 0, 0.85, 0));
      rod.add(mesh(boxGeo(0.025, 0.025, 0.62), M.iron, 0.03, 1.25, 0));
      const meat = new THREE.MeshStandardMaterial({ color: 0x5a2414, roughness: 0.45 });
      rod.add(mesh(boxGeo(0.07, 0.8, 0.58), meat, 0.07, 1.12, 0));
      const bone = new THREE.MeshStandardMaterial({ color: 0xcdb898, roughness: 0.7 });
      for (let k = 0; k < 6; k++) rod.add(mesh(boxGeo(0.02, 0.74, 0.035), bone, 0.115, 1.12, -0.24 + k * 0.096));
      g.add(rod);
      // (sesión 1f: suelto y con nombre, para que el final —ui/EclipseEnding,
      // el fogón de noche— lo pueda sacar: con su fuego fuerte el costillar era
      // un panel blanco que brillaba. __mduOldAsador: junto con lo quieto, como antes)
      if (globalThis.__mduOldAsador !== true) {
        g.name = 'asador';
        g.userData.dynamic = true;
      }
      addFixed(w, g);
      w.addBox([bx - 0.2, y, bz - 0.2, bx + 0.2, y + 1.1, bz + 0.2], { kind: 'prop' });
    }
  }
  // las cosas grandes del claro, en lugares relativos a su caja (se corren solas si caen en algo reservado)
  const big = [
    [0.12, 0.2, 1.8, (p) => {
      put(w, { type: 'enramada', pos: p, rot: Math.PI / 2, w: 3.6, d: 2.8 });
      put(w, { type: 'mesaTosca', pos: p, rot: Math.PI / 2, len: 1.6 });
    }],
    [0.16, 0.86, 1.6, (p) => put(w, { type: 'carreta', pos: p, rot: 1.15 })],
    [0.42, 0.9, 1.4, (p) => put(w, { type: 'troncos', pos: p, rot: 0.08, len: 2.6, rows: 3, hacha: true })],
    [0.86, 0.12, 1.2, (p) => put(w, { type: 'troncos', pos: p, rot: 1.5, len: 2.2, rows: 2 })],
    [0.08, 0.55, 1.3, (p) => put(w, { type: 'cart', pos: p, rot: -0.4 })],
  ];
  for (const [u, v, rad, fn] of big) {
    const [x, z] = zat('A', u, v);
    const p = spot(w, out, K, x, z, rad, 4);
    if (p) fn(p);
  }
  // el campo del sur: un ombú viejo en la punta, el aljibe y la cruz de la misión
  for (const [u, v, rad, def] of [[0.06, 0.92, 2.6, { type: 'ombu', rot: 0.6 }], [0.12, 0.62, 1.0, { type: 'well', rot: 0.3 }], [0.48, 0.76, 0.6, { type: 'cruzMision', rot: 0.2 }]]) {
    const [x, z] = zat('A', u, v);
    const p = spot(w, out, K, x, z, rad, 4);
    if (p) put(w, { ...def, pos: p });
  }
  // cruces con cintas por el claro
  for (let k = 0; k < 9; k++) {
    const [x, z] = zat('A', 0.1 + r() * 0.8, 0.1 + r() * 0.8);
    const p = spot(w, out, K, x, z, 0.3, 1.5);
    if (p) put(w, { type: 'cruzCinta', pos: p, rot: (r() - 0.5) * 1.6, h: 1.1 + r() * 0.35, vela: r() < 0.5 });
  }
  // el monte: palmeras yatay, un lapacho florido, un timbó y el ceibo
  for (const [u, v, h] of [[0.04, 0.08, 7.5], [0.95, 0.35, 8.5], [0.97, 0.62, 6.5], [0.06, 0.95, 6], [0.3, 0.98, 7.8], [0.55, 0.06, 7]]) {
    const [x, z] = zat('A', u, v);
    const p = spot(w, out, K, x, z, 0.6, 3);
    if (p) put(w, { type: 'palmera', pos: p, h });
  }
  for (const [u, v, h, mat] of [[0.25, 0.05, 5, M.lapacho], [0.9, 0.9, 4.6, M.leafDark], [0.03, 0.4, 4.4, M.ceiboLeaf], [0.72, 0.05, 5.2, M.leafDark]]) {
    const [x, z] = zat('A', u, v);
    const p = spot(w, out, K, x, z, 0.8, 3);
    if (!p) continue;
    const n0 = crowns.length;
    monte(w, crowns, p[0], p[1], h, mat, r);
    if (mat === M.ceiboLeaf) for (const c of crowns.slice(n0)) for (let k = 0; k < 7; k++) ceiboFl.push([c[0] + (r() - 0.5) * c[3] * 1.4, c[1] + (r() - 0.3) * c[4], c[2] + (r() - 0.5) * c[5] * 1.4, r() * 3]);
  }
  // un tronco caído (un algarrobo viejo, partido) y piedras grandes en los bordes
  {
    const [x, z] = zat('A', 0.7, 0.88);
    const p = spot(w, out, K, x, z, 2.2, 4);
    if (p) {
      const yy = w.floorAt(p[0], p[1]);
      const g = new THREE.Group();
      const a = 0.5;
      g.add(mesh(cylGeo(0.32, 0.4, 4.2, 9), M.log, p[0], yy + 0.34, p[1], 0, a, Math.PI / 2));
      g.add(mesh(cylGeo(0.12, 0.2, 1.4, 6), M.log, p[0] + Math.cos(a) * 1.2, yy + 0.7, p[1] - Math.sin(a) * 1.2 + 0.3, 0.6, 0.2, 0.3));
      g.add(mesh(new THREE.CircleGeometry(0.33, 9), heartMat(), p[0] + Math.cos(a) * 2.1, yy + 0.34, p[1] - Math.sin(a) * 2.1, 0, a + Math.PI / 2, 0));
      addFixed(w, g);
      w.addBox([p[0] - 1.6, yy, p[1] - 1.6, p[0] + 1.6, yy + 0.7, p[1] + 1.6], { kind: 'prop' });
      FOOT.push([p[0], yy, p[1], 2.1, 0.6]);
    }
  }
  const rocks = [];
  for (let k = 0; k < 80 && rocks.length < 9; k++) {
    const [x, z] = zat('A', r(), r());
    if (!onFloor(w, x, z, 1.3, K) || out(x, z, 1.2)) continue;
    // (cerca del borde: lejos del medio del claro)
    const [cx, cz] = zat('A', 0.5, 0.5);
    if (Math.hypot(x - cx, z - cz) < 9) continue;
    if (rocks.some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 5)) continue;
    if (Math.hypot(x - fx, z - fz) < 4) continue;
    rocks.push([x, z, 0.45 + r() * 0.55]);
  }
  root.add(boulders(w, rocks, M.rock, r));
}

// ---------------- las sendas de tierra pisada ----------------
// De la puerta de la iglesia, los portales, el fogón y la escalera de la loma
// al inicio: tiras de tierra con el borde blando (una malla).
let pathTexC = null;
function pathMat() {
  if (pathTexC) return pathTexC;
  const tex = canvasTex(128, 256, (x, W, H) => {
    const r = rng(17);
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      const px = W / 2 + (r() + r() + r() - 1.5) * W * 0.36;
      const py = r() * H;
      const rad = 3 + r() * 9;
      const d = Math.abs(px - W / 2) / (W / 2);
      const a = (1 - d * d) * (0.12 + r() * 0.2);
      const c = 70 + r() * 40;
      x.fillStyle = `rgba(${c + 26},${c},${c * 0.62},${a})`;
      x.beginPath();
      x.arc(px, py, rad, 0, Math.PI * 2);
      x.fill();
    }
  }, { repeat: true });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  pathTexC = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  return pathTexC;
}
function strip(w, pts, wd, keys, P, U) {
  // los puntos se siguen de a 0,5 m; donde se sale del piso de esas zonas, se corta
  const dense = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let s = 0; s < n; s++) dense.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  dense.push(pts[pts.length - 1]);
  let v = 0;
  for (let k = 0; k < dense.length - 1; k++) {
    const [ax, az] = dense[k];
    const [bx, bz] = dense[k + 1];
    if (!onFloor(w, ax, az, wd * 0.5, keys) || !onFloor(w, bx, bz, wd * 0.5, keys)) continue;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * wd * 0.5;
    const nz = ((bx - ax) / len) * wd * 0.5;
    const ya = w.floorAt(ax, az) + 0.008;
    const yb = w.floorAt(bx, bz) + 0.008;
    const v1 = v + len / 2.4;
    P.push(ax - nx, ya, az - nz, bx - nx, yb, bz - nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, ax + nx, ya, az + nz);
    U.push(0, v, 0, v1, 1, v1, 0, v, 1, v1, 1, v);
    v = v1;
  }
}
function buildPaths(w, root, r) {
  const P = [];
  const U = [];
  const st = [PLAYER_START.x, PLAYER_START.z];
  const wob = (a, b) => {
    // una senda que serpentea un poco entre dos puntos
    const out = [a];
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const nx = -(b[1] - a[1]);
      const nz = b[0] - a[0];
      const l = Math.hypot(nx, nz) || 1;
      const off = Math.sin(t * Math.PI) * (r() - 0.5) * 2.2;
      out.push([a[0] + (b[0] - a[0]) * t + (nx / l) * off, a[1] + (b[1] - a[1]) * t + (nz / l) * off]);
    }
    out.push(b);
    return out;
  };
  const targets = [];
  for (const p of PORTALS) for (const e of [p.a, p.b]) if (e.zone === 'A') targets.push([e.pos[0] + e.face[0] * 1.4, e.pos[1] + e.face[1] * 1.4]);
  for (const d of DOORS) if (d.zones.includes('A')) {
    const [x, z] = d.cells[0];
    const [x2, z2] = d.cells[d.cells.length - 1];
    targets.push([(x + x2) / 2 + 0.5 + (x === x2 ? 1.3 : 0), (z + z2) / 2 + 0.5 + (z === z2 ? 1.3 : 0)]);
  }
  targets.push(EE.fogon);
  // la escalera de la loma (el pie)
  const lr = RAMPS_OWN('loma');
  if (lr) targets.push([(lr[0] + lr[2] + 1) / 2, lr[3] + 1.6]);
  for (const t of targets) strip(w, wob(st, t), 1.5, ['A'], P, U);
  // en la loma: de la escalera al algarrobo y a la puerta de la barraca
  if (lr) {
    const top = [(lr[0] + lr[2] + 1) / 2, lr[1] - 1.2];
    strip(w, wob(top, [EE.algarrobo[0], EE.algarrobo[1] + 2.4]), 1.3, ['A2'], P, U);
    for (const d of DOORS) if (d.zones.includes('A2')) {
      const [x, z] = d.cells[0];
      strip(w, wob(top, [x + 1, z + 1.6]), 1.2, ['A2'], P, U);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, pathMat());
  m.receiveShadow = true;
  m.renderOrder = 1;
  m.matrixAutoUpdate = false;
  root.add(m);
}
function RAMPS_OWN(own) {
  const R = RAMPS.find((x) => x.own === own);
  return R ? R.rect : null;
}

// ---------------- la grieta del claro ----------------
// La tierra rajada de punta a punta (pasa abajo de la luz de tag 'grieta'): el
// borde oscuro, la luz violeta adentro, terrones levantados a los costados y
// piedras que flotan arriba. No frena: se camina por encima.
let grietaMat = null;
function buildGrieta(w, root, r, out, orbs) {
  const L = lightTag('grieta');
  if (!L) return;
  const K = ['A'];
  const [lx, , lz] = L.pos;
  // la dirección: del pie de la loma hacia la laguna (de noreste a sudoeste)
  const B = zbox('B', true);
  const dir = [B[0] - lx, (B[1] + B[3]) / 2 - lz];
  const dl = Math.hypot(...dir);
  const ux = dir[0] / dl;
  const uz = dir[1] / dl;
  const pts = [];
  let px = lx - ux * 12;
  let pz = lz - uz * 12;
  for (let k = 0; k < 48; k++) {
    pts.push([px, pz]);
    const a = Math.atan2(uz, ux) + (r() - 0.5) * 0.9;
    px += Math.cos(a) * 0.55;
    pz += Math.sin(a) * 0.55;
  }
  const ok = pts.filter(([x, z]) => onFloor(w, x, z, 0.4, K) && !keepOut()(x, z, 0.1));
  if (ok.length < 6) return;
  const P = [];
  const U = [];
  // el borde oscuro (ancho) y la luz (angosta): dos tiras
  const dark = [];
  const DU = [];
  const run = (list, wd, Pp, Uu) => {
    let v = 0;
    for (let k = 0; k < list.length - 1; k++) {
      const [ax, az] = list[k];
      const [bx, bz] = list[k + 1];
      if (Math.hypot(bx - ax, bz - az) > 0.9) continue;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const t0 = k / (list.length - 1);
      const t1 = (k + 1) / (list.length - 1);
      // (se afina en las puntas)
      const wa = wd * Math.sin(Math.PI * Math.max(0.08, t0));
      const wb = wd * Math.sin(Math.PI * Math.max(0.08, Math.min(0.999, t1)));
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const ya = w.floorAt(ax, az) + 0.012;
      const yb = w.floorAt(bx, bz) + 0.012;
      const v1 = v + len / 1.6;
      Pp.push(ax - nx * wa, ya, az - nz * wa, bx - nx * wb, yb, bz - nz * wb, bx + nx * wb, yb, bz + nz * wb, ax - nx * wa, ya, az - nz * wa, bx + nx * wb, yb, bz + nz * wb, ax + nx * wa, ya, az + nz * wa);
      Uu.push(0, v, 0, v1, 1, v1, 0, v, 1, v1, 1, v);
      v = v1;
    }
  };
  const HP = [];
  const HU = [];
  run(ok, 0.8, dark, DU);
  run(ok, 0.36, P, U);
  run(ok, 1.9, HP, HU);
  if (!grietaMat) {
    const tex = canvasTex(64, 256, (x, W, H) => {
      const rr = rng(5);
      for (let y = 0; y < H; y += 2) {
        const d = 0.5 + (rr() - 0.5) * 0.2;
        const g = x.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(Math.max(0.05, d - 0.35), 'rgba(0,0,0,0.85)');
        g.addColorStop(d, 'rgba(0,0,0,0.95)');
        g.addColorStop(Math.min(0.95, d + 0.35), 'rgba(0,0,0,0.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(0, y, W, 2);
      }
    }, { repeat: true });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    // la luz de adentro: un rayo quebrado que se repite a lo largo (las puntas
    // del dibujo calzan) y, aparte, el resplandor ancho y blando
    const core = canvasTex(64, 256, (x, W, H) => {
      const rr = rng(23);
      x.fillStyle = '#000';
      x.fillRect(0, 0, W, H);
      const ph = [rr() * 6, rr() * 6, rr() * 6];
      const at = (y) => W / 2 + Math.sin((y / H) * Math.PI * 2 + ph[0]) * 7 + Math.sin((y / H) * Math.PI * 6 + ph[1]) * 4 + Math.sin((y / H) * Math.PI * 14 + ph[2]) * 2;
      for (const [lw, a] of [[26, 0.16], [14, 0.38], [6, 0.8], [2.5, 1]]) {
        x.strokeStyle = `rgba(255,255,255,${a})`;
        x.lineWidth = lw;
        x.lineJoin = 'round';
        x.beginPath();
        for (let y = 0; y <= H; y += 4) (y ? x.lineTo(at(y), y) : x.moveTo(at(y), y));
        x.stroke();
      }
    }, { repeat: true });
    core.wrapS = THREE.ClampToEdgeWrapping;
    const halo = canvasTex(64, 8, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    });
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 };
    grietaMat = {
      dark: new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      glow: new THREE.MeshBasicMaterial({ map: core, color: 0xb468ff, ...add }),
      halo: new THREE.MeshBasicMaterial({ map: halo, color: 0x6a28c0, opacity: 0.55, ...add }),
    };
  }
  for (const [list, uv, mat] of [[dark, DU, grietaMat.dark], [HP, HU, grietaMat.halo], [P, U, grietaMat.glow]]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    // (con nombre: el final —ui/EclipseEnding FIN3— la esconde en el claro cosido)
    m.name = 'eclipse:grieta';
    m.renderOrder = 2;
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  pulse.push(grietaMat.glow, grietaMat.halo);
  // terrones levantados a los costados (pasto arriba, tierra abajo), inclinados hacia afuera
  const clods = [];
  for (let k = 2; k < ok.length - 2; k += 2) {
    if (r() < 0.35) continue;
    const [ax, az] = ok[k];
    const [bx, bz] = ok[k + 1] || ok[k - 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const sd = r() < 0.5 ? -1 : 1;
    const x = ax + nx * sd * (0.45 + r() * 0.2);
    const z = az + nz * sd * (0.45 + r() * 0.2);
    if (!onFloor(w, x, z, 0.3, K)) continue;
    clods.push([x, w.floorAt(x, z), z, 0.3 + r() * 0.35, Math.atan2(nx * sd, nz * sd), 0.25 + r() * 0.3]);
  }
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const clodGeo = new THREE.BoxGeometry(1, 0.35, 0.8);
  root.add(inst(clodGeo, w.M.dirtDark, clods, ([x, y, z, sz, a, t], m4) => {
    q.setFromEuler(e.set(t, a, 0, 'YXZ'));
    m4.compose(v.set(x, y + 0.05, z), q, s.set(sz, sz, sz));
  }));
  const tops = new THREE.BoxGeometry(1, 0.06, 0.8).translate(0, 0.18, 0);
  root.add(inst(tops, w.M.grass, clods, ([x, y, z, sz, a, t], m4) => {
    q.setFromEuler(e.set(t, a, 0, 'YXZ'));
    m4.compose(v.set(x, y + 0.05, z), q, s.set(sz, sz, sz));
  }));
  // piedras que flotan arriba de la grieta, lentas
  for (let k = 3; k < ok.length - 3; k += 7) orbs.push({ c: [ok[k][0], w.floorAt(ok[k][0], ok[k][1]) + 1.4, ok[k][1]], r: [0.3, 1.2], h: 1.6, n: 4, s: [0.05, 0.18], sp: 0.18 });
  void out;
}

// ---------------- el pasto ----------------
// Matas de pasto contra las barandas (más tupidas) y sueltas por el claro y la
// loma, manchones de paja alta, flores del bañado y piedras chicas. Instanciado.
function buildGrass(w, root, r, out) {
  const tufts = [];
  const stones = [];
  const ids = new Set(['A', 'A2'].map((k) => w.zoneKeys.indexOf(k)));
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] !== FLOOR || !ids.has(w.zone[i]) || w.rampAt?.[i] >= 0) return;
    let rail = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = w.idx(x + dx, z + dz);
      if (w.grid[j] !== FLOOR && (w.edge[j] === EDGE_RAIL || w.edge[j] === 0)) rail = true;
    }
    const n = rail ? 2 : r() < 0.26 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const px = x + 0.1 + r() * 0.8;
      const pz = z + 0.1 + r() * 0.8;
      if (out(px, pz, 0.3) || Math.abs(w.floorAt(px, pz) - w.fy[i]) > 0.01) continue;
      const h = rail ? 0.55 + r() * 0.55 : 0.3 + r() * 0.35;
      tufts.push([px, w.floorAt(px, pz), pz, h, r() * Math.PI]);
    }
    if (r() < 0.05 && !out(x + 0.5, z + 0.5, 0.3)) stones.push([x + r(), z + r(), 0.06 + r() * 0.12]);
  });
  // manchones de paja alta contra el borde (el pajonal que se mete en el claro y la loma)
  for (const k of ['A', 'A2']) {
    for (let t = 0; t < 60; t++) {
      const [cx, cz] = zat(k, r(), r());
      const n = 5 + Math.floor(r() * 6);
      // (solo cerca del borde de la zona)
      let edge = false;
      for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (zoneAtCell(w, cx + ox, cz + oz) !== k) edge = true;
      if (!edge || !onFloor(w, cx, cz, 0.6, [k]) || out(cx, cz, 1)) continue;
      for (let j = 0; j < n; j++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 1.6;
        const px = cx + Math.cos(a) * d;
        const pz = cz + Math.sin(a) * d;
        if (zoneAtCell(w, px, pz) !== k || out(px, pz, 0.5) || Math.abs(w.floorAt(px, pz) - ZONES[k].y) > 0.01) continue;
        reeds.push([px, w.floorAt(px, pz) - 0.05, pz, 1.2 + r() * 0.7, r() * Math.PI]);
      }
      if (t > 14) break;
    }
  }
  // flores del bañado entre el pasto (amarillas y blancas)
  const flowers = [];
  for (let k = 0; k < 200; k++) {
    const t = tufts[Math.floor(r() * tufts.length)];
    if (!t) break;
    flowers.push([t[0] + (r() - 0.5) * 0.25, t[1], t[2] + (r() - 0.5) * 0.25, t[3] * (0.35 + r() * 0.3), r() < 0.6]);
  }
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const yellow of [true, false]) {
    const mat = new THREE.MeshStandardMaterial({ color: yellow ? 0xe8c030 : 0xf0ece0, emissive: yellow ? 0x3a2a00 : 0x2a2a2a, roughness: 0.7 });
    root.add(inst(new THREE.IcosahedronGeometry(0.035, 0), mat, flowers.filter((f) => f[4] === yellow), ([x, y, z, h], m4) => m4.makeScale(1, 0.6, 1).setPosition(x, y + h, z), { detail: true }));
  }
  root.add(
    inst(crossGeo(0.7), tuftMat(), tufts, ([x, y, z, h, a], m4) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.03, z), q, s.set(0.6 + h, h, 0.6 + h));
    }, { detail: true }),
  );
  const e = new THREE.Euler();
  root.add(
    inst(new THREE.DodecahedronGeometry(1, 0), w.M.stone, stones, ([x, z, sz], m4) => {
      q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
      m4.compose(v.set(x, w.floorAt(x, z) + sz * 0.15, z), q, s.set(sz * 1.3, sz * 0.6, sz));
    }, { detail: true }),
  );
}

// ---------------- la iglesia de la reducción (igual a Mate no Numa) ----------------
// Como world/Esteros.buildRuins: arriba de los muros (que Levels corta a la
// altura de la zona) bloques de arenisca de alturas desparejas, con la misma
// onda a lo largo del muro (en coordenadas del mapa de origen). El piso de
// calcáreo del estero (en Eclipse 'calcareo' es otro) y el pasto entre las
// baldosas. Lo retorcido: un muro rajado con la luz violeta adentro y tres
// bloques del muro caído que flotan arriba.
function buildIglesia(w, gb, root, r) {
  const sh = tpShift('cE2');
  if (!sh) return;
  const ids = new Set(['cE2'].map((k) => w.zoneKeys.indexOf(k)));
  const pos = [];
  const floating = [];
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] !== WALL) return;
    let near = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (ids.has(w.zone[w.idx(x + dx, z + dz)]) && w.grid[w.idx(x + dx, z + dz)] === FLOOR) near = true;
    if (!near) return;
    const ox = x - sh.dx;
    const oz = z - sh.dz;
    const top = w.top[i];
    const h = Math.max(0, Math.sin(ox * 0.7 + oz * 0.9) * 1.4 + Math.sin(ox * 0.23 - oz * 0.31) * 1.1 + (r() - 0.3) * 0.8);
    if (h < 0.15) return;
    const steps = Math.ceil(h / 0.45);
    for (let k = 0; k < steps; k++) {
      const s = Math.min(0.45, h - k * 0.45);
      const inset = k * 0.04 + r() * 0.05;
      pos.push([x + inset, top + k * 0.45, z + inset, x + 1 - inset, top + k * 0.45 + s, z + 1 - inset]);
    }
    if (h > 1.6 && floating.length < 4 && r() < 0.5) floating.push([x + 0.5, top + h + 1.3 + r() * 1.2, z + 0.5]);
  });
  const M = w.M;
  const m4 = new THREE.Matrix4();
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.piedraRoja, pos.length + floating.length);
  pos.forEach(([x0, y0, z0, x1, y1, z1], k) => {
    m4.makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    im.setMatrixAt(k, m4);
  });
  // (los que se soltaron y flotan, girados)
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  floating.forEach(([x, y, z], k) => {
    q.setFromEuler(e.set(r() * 0.8, r() * 3, r() * 0.8));
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.9, 0.45, 0.9));
    im.setMatrixAt(pos.length + k, m4);
  });
  im.castShadow = im.receiveShadow = true;
  im.computeBoundingSphere();
  im.matrixAutoUpdate = false;
  root.add(im);
  // el piso de calcáreo del estero, un pelo arriba del de Levels
  const cid = w.zoneKeys.indexOf('cE2');
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] !== FLOOR || w.zone[i] !== cid || w.rampAt?.[i] >= 0) return;
    gb.flat('calcareoEst', x, z, x + 1, z + 1, w.fy[i] + 0.003, true);
  });
  // la cripta: el piso y el techo de piedra del estero (en Eclipse 'stoneStep' es el travertino)
  const kid = w.zoneKeys.indexOf('cE4');
  const KR = ZONES.cE4?.roof;
  islCells(w, 'centro', (x, z, i) => {
    if (w.grid[i] !== FLOOR || w.zone[i] !== kid || w.rampAt?.[i] >= 0) return;
    gb.flat('eclCurbTop', x, z, x + 1, z + 1, w.fy[i] + 0.004, true);
    if (KR) gb.flat('eclCurbTop', x, z, x + 1, z + 1, KR - 0.004, false);
  });
  // el pasto entre las baldosas (las de la iglesia: matas bajas, ralas)
  const tufts = [];
  const out = keepOut();
  const [x0, z0, x1, z1] = zbox('cE2');
  for (let t = 0; t < 300 && tufts.length < 60; t++) {
    const px = x0 + r() * (x1 - x0);
    const pz = z0 + r() * (z1 - z0);
    if (zoneAtCell(w, px, pz) !== 'cE2' || out(px, pz, 0.2)) continue;
    tufts.push([px, w.floorAt(px, pz), pz, 0.25 + r() * 0.4, r() * 3]);
  }
  const qq = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.add(inst(crossGeo(0.7), tuftMat(), tufts, ([x, y, z, h, a], mm) => {
    qq.setFromAxisAngle(up, a);
    mm.compose(v.set(x, y - 0.03, z), qq, s.set(0.6 + h, h, 0.6 + h));
  }, { detail: true }));
  // un muro rajado: la luz violeta en la pared del fondo (la de adentro, la más larga)
  const Z = ZONES.cE2;
  const cz = z0 - 0.02;
  wallCrack(root, x0 + (x1 - x0) * 0.35, z0, [0, 1], Z.y + 0.2, Z.y + 3.6, 0.55);
  void cz;
}

// ---------------- la barraca del obraje (igual a Mate no Numa) ----------------
// El techo de paja de dos aguas con su fleco (como world/Esteros.buildRoofs,
// con el ROOF del estero corrido con el transplante). Lo retorcido: una punta
// del faldón levantada, despegada, flotando sobre la grieta de luz.
function buildBarraca(w, root, r) {
  const sh = tpShift('cB2');
  if (!sh) return;
  const ROOFS = MAPS.esteros?.ROOFS || [];
  const S = sh.S;
  const sr = S.rects[0];
  const d = ROOFS.find((R) => R.rect[0] <= sr[0] && R.rect[1] <= sr[1] && R.rect[2] >= sr[2] && R.rect[3] >= sr[3]);
  if (!d) return;
  const M = w.M;
  const g = new THREE.Group();
  const [x0, z0, x1, z1] = [d.rect[0] + sh.dx, d.rect[1] + sh.dz, d.rect[2] + sh.dx, d.rect[3] + sh.dz];
  const base = d.base + sh.dy;
  const alongX = d.axis === 'x';
  const len = alongX ? x1 - x0 : z1 - z0;
  const half = (alongX ? z1 - z0 : x1 - x0) / 2;
  const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const a0 = alongX ? x0 : z0;
  const over = 0.7;
  const end = 0.5;
  const thick = 0.35;
  const rise = d.rise || 2.4;
  const k = rise / half;
  const eave = base - over * k;
  const top = base + rise;
  const P = (u, v, y) => (alongX ? [a0 + u, y, mid + v] : [mid + v, y, a0 + u]);
  const mat = dbl(M.thatch);
  // (el faldón de cada lado en dos tramos: el último del lado sur se levanta)
  const cut = len * 0.72;
  for (const sg of [-1, 1]) {
    for (const [u0, u1, lifted] of [[-end, cut, false], [cut, len + end, sg > 0]]) {
      const A = P(u0, sg * (half + over), eave);
      const B = P(u1, sg * (half + over), eave);
      const Cc = P(u1, 0, top);
      const Dd = P(u0, 0, top);
      const pos = [];
      const add = (p, o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
      const up = [0, thick, 0];
      const quad = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
      quad(add(A, up), add(B, up), add(Cc, up), add(Dd, up));
      quad(A, Dd, Cc, B);
      quad(A, B, add(B, up), add(A, up));
      quad(A, add(A, up), add(Dd, up), Dd);
      quad(B, Cc, add(Cc, up), add(B, up));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv = [];
      for (let i = 0; i < pos.length; i += 3) {
        const u = alongX ? pos[i] : pos[i + 2];
        const v = Math.hypot(alongX ? pos[i + 2] - mid : pos[i] - mid, pos[i + 1] - top);
        uv.push(u / 1.5, v / 1.5);
      }
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, 0.5), M.thatchFringe);
      const [fx, , fz] = P((u0 + u1) / 2, sg * (half + over + 0.02), 0);
      fr.position.set(fx, eave - 0.18, fz);
      fr.rotation.y = alongX ? 0 : Math.PI / 2;
      if (lifted) {
        // (el pedazo despegado: sube y se tuerce desde la cumbrera; flota)
        const piv = new THREE.Group();
        const [px, , pz] = P(u0, 0, 0);
        piv.position.set(px, top + 1.2, pz);
        piv.rotation.set(alongX ? -0.25 : 0.1, 0.12, alongX ? 0.18 : -0.25);
        m.position.set(-px, -top, -pz);
        fr.position.x -= px;
        fr.position.y -= top;
        fr.position.z -= pz;
        piv.add(m, fr);
        g.add(piv);
        // la grieta de luz que queda en el hueco
        const [hx, , hz] = P((u0 + u1) / 2, sg * half * 0.5, 0);
        const c = mesh(new THREE.PlaneGeometry(u1 - u0, half), crackMat(), hx, top - rise * 0.25 + 0.2, hz, alongX ? -Math.PI / 2 + 0.4 * sg : 0, alongX ? 0 : Math.PI / 2, 0);
        c.userData.dynamic = true;
        g.add(c);
      } else g.add(m, fr);
    }
  }
  // la cumbrera (un rollo de paja) y las cabeceras de tablas
  const [rx, , rz] = P(len * 0.36, 0, 0);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len * 0.72 + end, 8), mat);
  ridge.position.set(rx, top + thick * 0.6, rz);
  ridge.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
  g.add(ridge);
  const shp = new THREE.Shape();
  shp.moveTo(-half, 0);
  shp.lineTo(half, 0);
  shp.lineTo(0, rise);
  shp.closePath();
  const shGeo = new THREE.ShapeGeometry(shp);
  const head = dbl(d.head ? M[d.head] : M.woodDark);
  for (const u of [0, len]) {
    const [px, , pz] = P(u, 0, 0);
    const t = new THREE.Mesh(shGeo, head);
    t.position.set(px, base, pz);
    t.rotation.y = alongX ? Math.PI / 2 : 0;
    g.add(t);
  }
  g.traverse((o) => {
    if (o.isMesh && o.material !== crackMat()) o.castShadow = o.receiveShadow = true;
  });
  addFixed(w, g);
  void root;
  void r;
}
const doubles = new WeakMap();
function dbl(m) {
  if (!doubles.has(m)) {
    const d = m.clone();
    d.side = THREE.DoubleSide;
    doubles.set(m, d);
  }
  return doubles.get(m);
}

// ---------------- los pedazos sueltos: el muelle (A8) y el pajonal (A9) ----------------
function buildFrags(w, root, r, orbs) {
  const M = w.M;
  if (ZONES.A8) {
    // un pedazo de la orilla con el muelle arrancado: pilotes, tablas, el farol apagado
    const F = fragment(w, 'A8', { tilt: [0.1, 0.04, -0.12], top: 'grass', seed: 8 });
    const g = F.g;
    const hx = F.hx;
    for (let k = 0; k < 3; k++) {
      for (const sx of [-0.7, 0.7]) {
        const h = 1.4 + r() * 0.8;
        g.add(mesh(cylGeo(0.085, 0.1, h + 2.4, 7), M.woodDark, -hx * 0.3 + k * 1.35, h / 2 - 1.2, sx, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1));
      }
      if (k < 2) for (let j = 0; j < 5; j++) if (r() < 0.8) g.add(mesh(boxGeo(0.21, 0.05, 1.6), M.wood, -hx * 0.3 + k * 1.35 + j * 0.25, 1.1 + (r() - 0.5) * 0.05, 0, 0, 0, (r() - 0.5) * 0.06));
    }
    // tablas que cuelgan del borde, sobre el vacío
    for (let j = 0; j < 4; j++) g.add(mesh(boxGeo(0.21, 0.05, 1.4), M.wood, hx * 0.6 + j * 0.22, 0.4 - j * 0.15, 0.2, 1.1 + r() * 0.3, 0, 0.2));
    // juncos y matas en la tierra del pedazo
    for (let j = 0; j < 14; j++) {
      const p = new THREE.Vector3((r() - 0.5) * hx * 1.6, 0, (r() - 0.5) * F.hz * 1.6).applyMatrix4(g.matrixWorld);
      reeds.push([p.x, p.y - 0.05, p.z, 1.2 + r() * 0.8, r() * 3]);
    }
    F.finish();
    orbs.push({ c: [g.position.x, g.position.y + 0.5, g.position.z], r: [3.5, 5.5], h: 3, n: 9, s: [0.08, 0.35], sp: 0.15 });
  }
  if (ZONES.A9) {
    // un pedazo del bañado: pajonal alto, una cruz con cinta torcida y raíces colgando
    const F = fragment(w, 'A9', { tilt: [-0.12, -0.03, 0.09], top: 'grass', seed: 9 });
    const g = F.g;
    g.updateMatrixWorld(true);
    for (let j = 0; j < 40; j++) {
      const p = new THREE.Vector3((r() - 0.5) * F.hx * 1.8, 0, (r() - 0.5) * F.hz * 1.8).applyMatrix4(g.matrixWorld);
      reeds.push([p.x, p.y - 0.1, p.z, 1.6 + r() * 1, r() * 3]);
    }
    const cross = new THREE.Group();
    cross.add(mesh(boxGeo(0.08, 1.4, 0.08), M.woodDark, 0, 0.7, 0));
    cross.add(mesh(boxGeo(0.7, 0.08, 0.08), M.woodDark, 0, 1.05, 0));
    cross.add(mesh(boxGeo(0.05, 0.4, 0.006), M.redCloth, 0.1, 0.85, 0.05));
    cross.position.set(F.hx * 0.3, 0, -F.hz * 0.2);
    cross.rotation.set(0.15, 0.4, -0.2);
    g.add(cross);
    // raíces que cuelgan abajo
    for (let j = 0; j < 8; j++) {
      const len = 1 + r() * 2;
      g.add(mesh(cylGeo(0.02, 0.05, len, 5), M.bark, (r() - 0.5) * F.hx * 1.4, -1.2 - len / 2, (r() - 0.5) * F.hz * 1.4, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
    }
    F.finish();
    orbs.push({ c: [g.position.x, g.position.y, g.position.z], r: [3.5, 5], h: 3, n: 8, s: [0.08, 0.3], sp: 0.15 });
  }
  void root;
}

// ---------------- lo que se mueve ----------------

const camV = new THREE.Vector3();
export function update(dt, t) {
  orb?.update(t);
  cullC?.();
  for (const m of pulse) m.opacity = (m === grietaMat?.halo ? 0.45 : 0.8) + Math.sin(t * 1.7) * 0.15 + Math.sin(t * 5.3) * 0.05;
  const L = lagoon;
  if (!L) return;
  const cam = L.water.g?.camera;
  if (!cam) return;
  cam.getWorldPosition(camV);
  // (de lejos, el espejo quieto; de cerca, el agua de verdad)
  const near = Math.hypot(camV.x - L.cx, camV.z - L.cz) < 75 && Math.abs(camV.y - L.lvl) < 40;
  if (L.water.mesh.visible !== near) {
    L.water.mesh.visible = near;
    L.far.visible = !near;
  }
}

// La hoja del irupé vista de arriba: verde con nervaduras que salen del centro.
function irupeTex() {
  return canvasTex(256, 256, (x, wd) => {
    const r = rng(41);
    const c = wd / 2;
    const gr = x.createRadialGradient(c, c, 4, c, c, c);
    gr.addColorStop(0, '#3e5a22');
    gr.addColorStop(0.85, '#4e6a2a');
    gr.addColorStop(1, '#6a3a24');
    x.fillStyle = gr;
    x.fillRect(0, 0, wd, wd);
    x.strokeStyle = 'rgba(160,190,110,0.35)';
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(c, c);
      x.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      x.stroke();
    }
    x.strokeStyle = 'rgba(40,60,20,0.35)';
    x.lineWidth = 1;
    for (let rr = 20; rr < c; rr += 14 + r() * 6) {
      x.beginPath();
      x.arc(c, c, rr, 0, Math.PI * 2);
      x.stroke();
    }
  });
}

// La hoja: un disco de radio 1 con el borde levantado 12 cm.
function irupeGeo() {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.01), new THREE.Vector2(0.97, 0.04), new THREE.Vector2(1, 0.12), new THREE.Vector2(1.01, 0.14)];
  const geo = new THREE.LatheGeometry(pts, 28);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, 0.5 + p.getX(k) * 0.5, 0.5 + p.getZ(k) * 0.5);
  return geo;
}

// La flor del irupé: dos coronas de pétalos abiertas.
function flowerGeo() {
  const parts = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 10 : 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.3;
      const pet = new THREE.SphereGeometry(0.09, 6, 4).scale(0.5, 0.25, 1.4);
      pet.rotateX(-0.5 - ring * 0.5);
      pet.translate(0, 0.05 + ring * 0.04, 0.12 - ring * 0.04);
      pet.rotateY(a);
      parts.push(pet.toNonIndexed());
    }
  }
  const n = parts.reduce((a, gg) => a + gg.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const gg of parts) {
    pos.set(gg.attributes.position.array, o * 3);
    nor.set(gg.attributes.normal.array, o * 3);
    o += gg.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}
