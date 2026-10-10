import * as THREE from 'three';
import GeoBuilder from '../GeoBuilder';
import { ZONES, RAMPS, WALL_H, WINDOWS, WALL_BUYS, PROPS, zoneRects, MAPS } from '../../config/map';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISLANDS } from '../../config/maps/eclipse';
import { wallSpans, library, busyWalls, booksMat, facades, windowMats } from '../castleRooms';
import { buildHalls } from '../castleHalls';
import { buildCave } from '../castleCaves';
import { flameMaterial } from '../castleFire';
import { weathering } from '../castleWeathering';
import { tpShift, wallCrack, orbiters, voidRockMat, keepOut, floorCrackMat, detailCuller } from './centro';
import { bake, rng, mergedMesh, placeProp } from './desgarro';
import { buildTorre } from '../monumentoTorre';
import { buildDecor } from '../monumentoDecor';
import { buildPasaje, buildParque, buildExplanada, buildExplanadaBordes, buildCriptaBordes } from '../Monumento';
import Decor from '../Decor';
import { buildAtlas, ATLAS } from '../decorAtlas';
import { buildRoofs as buildMolinoRoofs } from '../Roofs';
import { mesh, boxGeo, cylGeo, rotateBox } from '../props';
import { flattenable, flatMaterial, reflBucket } from '../perkMachines';
import { buildBovedas, buildPajar } from '../Farm';
import { FLOOR_TINTS } from '../towerDecor';
import { roomOpen } from '../../core/sizeCull';

// Las secciones nuevas del layout v5 (2026-10-07, agente arte-v5). Cada isla
// sumó secciones IGUALES de su mapa de origen (zonas con `tp: { src, key }`):
// traen del origen los rects, materiales, puertas, la utilería y las luces,
// pero no lo que el mapa de origen arma POR CÓDIGO (las columnas y el
// artesonado de la sala del trono, la biblioteca de dos pisos, la gruta de
// hielo, ...). Acá va eso, en lo posible con los mismos constructores del
// origen:
//  · los que leen la zona por su letra y la grilla (castleRooms.library,
//    facades): se llaman con la letra del origen apuntando un rato a la zona
//    de acá (`aliased`), así arman lo mismo sobre la grilla de Eclipse;
//  · los que tienen las coordenadas escritas (castleHalls.buildHalls): se
//    arman en un mundo prestado y se corren al lugar de acá (`shifted`);
//  · lo que no se deja llamar (vigas y pilastras de castleTrim, que recorre
//    el mapa entero): copiado, para las zonas de acá.
// Y después, poco y con gusto, lo retorcido de Eclipse: grietas violetas en
// las paredes, pedazos que flotan.
// Cada sección va con su try/catch (una que falla no tira el mapa).
// globalThis.__mduNoEclV5: nada de esto.

const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const WINDOW = 4;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ceilOf = (k) => ZONES[k].roof ?? (ZONES[k].y || 0) + WALL_H;

let LIVE = null;
const OBJS = {};
// (para las pruebas: lo que armó cada isla)
export const v5Objs = () => OBJS;
// (para las pruebas: cuánto tardó cada isla en armarse, en ms)
const MS = {};
export const v5Ms = () => MS;

// Las letras del origen apuntando un rato a las zonas de acá (o a ninguna, con
// null): ZONES[letra] es la zona de acá con los rects en el orden del origen
// (muchos constructores toman el primero) y la grilla dice la letra del origen
// donde está la de acá (w.zoneKeys), así los que comparan la zona de la celda
// con su letra también andan. Todo vuelve como estaba al terminar.
function aliased(w, map, fn) {
  const old = {};
  const keys = [];
  for (const [a, b] of Object.entries(map)) {
    old[a] = Object.prototype.hasOwnProperty.call(ZONES, a) ? ZONES[a] : undefined;
    if (!b) {
      delete ZONES[a];
      continue;
    }
    const S = tpShift(b);
    const R = S ? (S.S.rects || [S.S.rect]).map((r) => r.map((v, i) => (i === 0 || i === 2 ? v + S.dx : i === 1 || i === 3 ? v + S.dz : i === 4 ? v + S.dy : v))) : ZONES[b].rects;
    ZONES[a] = { ...ZONES[b], rects: R };
    const i = w.zoneKeys.indexOf(b);
    if (i >= 0) {
      keys.push([i, b]);
      w.zoneKeys[i] = a;
    }
  }
  try {
    return fn();
  } finally {
    for (const [i, b] of keys) w.zoneKeys[i] = b;
    for (const a of Object.keys(old)) {
      if (old[a] === undefined) delete ZONES[a];
      else ZONES[a] = old[a];
    }
  }
}

// Un constructor con las coordenadas del origen escritas: arma en un mundo
// prestado (su raíz aparte, las cajas corridas) y lo corre al lugar de acá.
function shifted(w, S, fn, { M = null } = {}) {
  const tmp = new THREE.Group();
  const pw = Object.create(w);
  pw.root = tmp;
  if (M) pw.M = M;
  pw.addBox = (b, o) => w.addBox([b[0] + S.dx, b[1] + S.dy, b[2] + S.dz, b[3] + S.dx, b[4] + S.dy, b[5] + S.dz], o);
  fn(pw);
  for (const o of [...tmp.children]) {
    o.position.x += S.dx;
    o.position.y += S.dy;
    o.position.z += S.dz;
    o.updateMatrix();
    w.root.add(o);
  }
}

// Un constructor del origen entero (coordenadas del origen, lee lo que quiera
// del config: los arreglos que se le pasan en `swap` se cambian un rato por los
// del origen) armado en un mundo prestado; de lo que arma queda solo lo que cae
// adentro de keep(x, y, z) (coordenadas del origen) y se corre al lugar de acá.
// Las piezas chicas (radio < 2,5 m) van o no enteras, por su centro; las mallas
// fusionadas grandes se recortan triángulo por triángulo. Las cajas de choque,
// por su centro. Devuelve el mundo prestado (pw.mon, pw.extraUpdate...).
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
function clipMesh(m, keep, straddle = false) {
  const geo = m.geometry;
  if (!geo?.attributes?.position) return true;
  m.updateWorldMatrix(true, false);
  const mw = m.matrixWorld;
  if (m.isInstancedMesh) {
    const M4 = new THREE.Matrix4();
    const kept = [];
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, M4);
      _v.setFromMatrixPosition(M4).applyMatrix4(mw);
      if (keep(_v.x, _v.y, _v.z)) kept.push(M4.clone());
    }
    kept.forEach((k, i) => m.setMatrixAt(i, k));
    m.count = kept.length;
    m.instanceMatrix.needsUpdate = true;
    return kept.length > 0;
  }
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const r = geo.boundingSphere.radius * m.matrixWorld.getMaxScaleOnAxis();
  if (r < 2.5) {
    _v.copy(geo.boundingSphere.center).applyMatrix4(mw);
    return keep(_v.x, _v.y, _v.z);
  }
  const src = geo.index ? geo.toNonIndexed() : geo;
  const P = src.attributes.position;
  const n = P.count / 3;
  const ok = new Uint8Array(n);
  const boxOf = new Array(n);
  let cnt = 0;
  for (let t = 0; t < n; t++) {
    _a.fromBufferAttribute(P, t * 3).applyMatrix4(mw);
    _b.fromBufferAttribute(P, t * 3 + 1).applyMatrix4(mw);
    _c.fromBufferAttribute(P, t * 3 + 2).applyMatrix4(mw);
    _v.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    // (por el centro; con straddle, también por cualquiera de sus puntas: lo que
    // cruza el borde entra y se recorta contra la caja que devuelve keep)
    const k = keep(_v.x, _v.y, _v.z) || (straddle && (keep(_a.x, _a.y, _a.z) || keep(_b.x, _b.y, _b.z) || keep(_c.x, _c.y, _c.z)));
    if (k) {
      ok[t] = 1;
      boxOf[t] = Array.isArray(k) ? k : null;
      cnt++;
    }
  }
  if (!cnt) return false;
  const anyBox = boxOf.some((q) => q);
  if (cnt === n && !anyBox) return true;
  // (lo que se pasa del rect de la sección se recorta: cada vértice afuera se
  // trae al borde, con sus atributos interpolados en el triángulo)
  const out = new THREE.BufferGeometry();
  const names = Object.keys(src.attributes);
  const arrs = names.map((nm) => new src.attributes[nm].array.constructor(cnt * 3 * src.attributes[nm].itemSize));
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const bc = new THREE.Vector3();
  const tq = new THREE.Triangle();
  const q = new THREE.Vector3();
  let o = 0;
  for (let t = 0; t < n; t++) {
    if (!ok[t]) continue;
    for (let v = 0; v < 3; v++) tri[v].fromBufferAttribute(P, t * 3 + v).applyMatrix4(mw);
    tq.set(tri[0], tri[1], tri[2]);
    const B = boxOf[t];
    for (let v = 0; v < 3; v++) {
      const p = tri[v];
      let wts = null;
      const y0 = B?.[4] ?? -Infinity;
      const y1 = B?.[5] ?? Infinity;
      if (B && (p.x < B[0] || p.x > B[2] || p.z < B[1] || p.z > B[3] || p.y < y0 || p.y > y1)) {
        q.set(Math.min(B[2], Math.max(B[0], p.x)), Math.min(y1, Math.max(y0, p.y)), Math.min(B[3], Math.max(B[1], p.z)));
        tq.getBarycoord(q, bc);
        if (Number.isFinite(bc.x)) wts = [bc.x, bc.y, bc.z];
      }
      names.forEach((nm, ai) => {
        const A = src.attributes[nm];
        const isz = A.itemSize;
        for (let c = 0; c < isz; c++) {
          let val;
          if (wts) val = wts[0] * A.getComponent(t * 3, c) + wts[1] * A.getComponent(t * 3 + 1, c) + wts[2] * A.getComponent(t * 3 + 2, c);
          else val = A.getComponent(t * 3 + v, c);
          arrs[ai][(o + v) * isz + c] = val;
        }
      });
    }
    o += 3;
  }
  names.forEach((nm, ai) => out.setAttribute(nm, new THREE.BufferAttribute(arrs[ai], src.attributes[nm].itemSize, src.attributes[nm].normalized)));
  out.computeBoundingSphere();
  m.geometry = out;
  return true;
}
function swapArrays(swap) {
  const saved = [];
  for (const [arr, tmp] of swap) {
    saved.push([arr, arr.slice()]);
    arr.length = 0;
    arr.push(...tmp);
  }
  return () => {
    for (const [arr, old] of saved) {
      arr.length = 0;
      arr.push(...old);
    }
  };
}
// (con `outs`, se arma una sola vez y de lo armado salen varios pedazos, cada
// uno con su keep: copias del árbol, con la geometría compartida hasta que se
// recorta; los choques van al primer pedazo que los quiere)
function transplant(w, S, fn, { keep, M = null, swap = [], zones = {}, hide = [], mon = null, name = 'v5', straddle = false, outs = null } = {}) {
  const parts = outs || [{ keep, straddle, name }];
  const tmp = new THREE.Group();
  const pw = Object.create(w);
  pw.root = tmp;
  // (para los constructores prestados que tienen que saber que no están en su mapa)
  pw.transplanted = name;
  if (M) pw.M = M;
  pw.boxes = [];
  pw.extraUpdate = null;
  // (lo que el constructor junta con la utilería quieta va a la raíz prestada: se recorta y se corre)
  pw.addStatic = (obj) => tmp.add(obj);
  // (las zonas de acá con la letra de una del origen: la grilla no las nombra un rato)
  if (hide.length) pw.zoneKeys = w.zoneKeys.map((k) => (hide.includes(k) ? `_${k}` : k));
  pw.mon = mon || { lamps: [], flags: [], anim: [], extra: [] };
  pw.addBox = (b, o) => {
    const c = [(b[0] + b[3]) / 2, b[1] + 0.05, (b[2] + b[5]) / 2];
    if (!parts.some((q) => !q.noBoxes && q.keep(...c))) return;
    w.addBox([b[0] + S.dx, b[1] + S.dy, b[2] + S.dz, b[3] + S.dx, b[4] + S.dy, b[5] + S.dz], o);
  };
  const t0 = performance.now();
  const back = swapArrays(swap);
  try {
    // (las letras del origen que el constructor busca: fuera un rato)
    const old = {};
    for (const [a, b] of Object.entries(zones)) {
      old[a] = Object.prototype.hasOwnProperty.call(ZONES, a) ? ZONES[a] : undefined;
      if (b) ZONES[a] = b;
      else delete ZONES[a];
    }
    try {
      fn(pw);
    } finally {
      for (const a of Object.keys(old)) {
        if (old[a] === undefined) delete ZONES[a];
        else ZONES[a] = old[a];
      }
    }
  } finally {
    back();
  }
  const t1 = performance.now();
  // (lo que el constructor deja para el primer cuadro —visible o no— ya, antes de copiar)
  pw.extraUpdate?.(0, 0);
  tmp.updateMatrixWorld(true);
  pw.groups = parts.map((q, i) => {
    const src = i === parts.length - 1 ? tmp : tmp.clone(true);
    src.updateMatrixWorld(true);
    const drop = [];
    src.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && !clipMesh(o, q.keep, q.straddle)) drop.push(o);
    });
    for (const o of drop) o.removeFromParent();
    const grp = new THREE.Group();
    grp.name = `eclipse:${q.name || name}`;
    grp.position.set(S.dx, S.dy, S.dz);
    for (const o of [...src.children]) grp.add(o);
    grp.updateMatrixWorld(true);
    w.root.add(grp);
    return grp;
  });
  pw.group = pw.groups[0];
  MS[`${name}:arma`] = Math.round(t1 - t0);
  MS[`${name}:recorta`] = Math.round(performance.now() - t1);
  return pw;
}

// Lo quieto de una isla, junto: todas las mallas sueltas que armaron los
// constructores (cada uno hace las suyas) se juntan por material en una malla
// por material (y por sombra), así cada isla suma pocos dibujos. No se tocan
// las instanciadas, las de color por vértice (la roca de la gruta), las de
// varios materiales ni lo marcado `userData.keep` (lo que se mueve o se prende).
function consolidate(w, objs, name, { shadow = null, filter = null } = {}) {
  const by = new Map();
  const kept = (o) => {
    for (let p = o; p; p = p.parent) if (p.userData?.keep) return true;
    return false;
  };
  for (const root of objs) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || Array.isArray(o.material) || kept(o)) return;
      if (filter && !filter(o)) return;
      const m = o.material;
      // (las piezas con el color en los vértices: solo si su material sin eso se puede aplanar)
      const vc = !!m.vertexColors;
      if (vc && !(m.userData.vcOf && o.geometry.attributes.color)) return;
      const cs = shadow === false ? false : o.castShadow;
      // (los de color liso —sin textura— van todos a una malla con el color, la
      // rugosidad y lo metálico en los vértices: el material de perkMachines.flatten)
      const flat = vc ? flattenable(m.userData.vcOf) : flattenable(m);
      if (vc && !flat) {
        // (no se aplana: junto con las de su mismo material de color por vértice)
        const key = `${m.uuid}|${cs ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
        if (!by.has(key)) by.set(key, { flat: false, vc: true, list: [] });
        by.get(key).list.push(o);
        return;
      }
      const key = flat ? `flat|${m.side}|${m.flatShading ? 1 : 0}|${m.envMapIntensity}|${cs ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}` : `${m.uuid}|${cs ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      if (!by.has(key)) by.set(key, { flat, list: [] });
      by.get(key).list.push(o);
    });
  }
  const grp = new THREE.Group();
  grp.name = `eclipse:v5:${name}:junto`;
  for (const { flat, vc: vcl, list } of by.values()) {
    if (list.length < 2 && !flat && !vcl) continue;
    const geos = [];
    for (const o of list) {
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const nm of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(nm)) g.deleteAttribute(nm);
      if (!vcl && !flat) g.deleteAttribute('color');
      if (!g.attributes.normal) g.computeVertexNormals();
      g.morphAttributes = {};
      const n = g.attributes.position.count;
      if (flat) {
        g.deleteAttribute('uv');
        const m = o.material.userData.vcOf || o.material;
        const vcol = o.material.vertexColors ? g.attributes.color : null;
        const e = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
        const col = new Float32Array(n * 3);
        const pbr = new Float32Array(n * 2);
        const emi = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          if (vcol) col.set([m.color.r * vcol.getX(i), m.color.g * vcol.getY(i), m.color.b * vcol.getZ(i)], i * 3);
          else col.set([m.color.r, m.color.g, m.color.b], i * 3);
          pbr.set([m.roughness, m.metalness], i * 2);
          emi.set([e.r, e.g, e.b], i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 2));
        g.setAttribute('emi', new THREE.BufferAttribute(emi, 3));
        g.setAttribute('refl', new THREE.BufferAttribute(new Float32Array(n).fill(reflBucket(m) / 15), 1));
      } else if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    const m0 = list[0].material.userData.vcOf || list[0].material;
    const m = new THREE.Mesh(geo, flat ? flatMaterial(m0.side, !!m0.flatShading, m0.envMapIntensity) : list[0].material);
    m.castShadow = shadow === false ? false : list[0].castShadow;
    m.receiveShadow = list[0].receiveShadow;
    m.renderOrder = list[0].renderOrder;
    m.matrixAutoUpdate = false;
    grp.add(m);
    for (const o of list) o.removeFromParent();
  }
  if (!grp.children.length) return null;
  w.root.add(grp);
  return grp;
}

// Lo de adentro de una sala: se ve solo con la cámara en la sala o cerca (las
// salas tienen paredes y techo: desde afuera no se ve). La caja de la zona más
// `pad` metros (por las puertas abiertas se ve un poco más allá).
function zoneCuller(w, k, objs, pad = 12) {
  const R = zoneRects(k);
  const Z = ZONES[k];
  const b = [Math.min(...R.map((r) => r[0])) - pad, Math.min(...R.map((r) => r[1])) - pad, Math.max(...R.map((r) => r[2])) + 1 + pad, Math.max(...R.map((r) => r[3])) + 1 + pad];
  const y0 = (Z.y || 0) - pad;
  const y1 = (Z.roof ?? (Z.y || 0) + WALL_H) + pad;
  (w.warmHidden ||= []).push(...objs);
  let shown = true;
  const cam = new THREE.Vector3();
  // (agente rend, 2026-10-06: "estás viendo el interior de un lugar y hasta
  // que no te acercás bastante no cargan los props de adentro". Afuera de la
  // caja, también se ve si la consulta de oclusión de core/sizeCull dice que
  // algo de la sala se ve —por una puerta, una ventana, un techo abierto— y
  // está a menos de SEE_FAR m. Tapada, como antes. globalThis.__mduNoEclZoneSee: como antes)
  const xa = b[0] + pad;
  const xb = b[2] - pad;
  const za = b[1] + pad;
  const zb = b[3] - pad;
  return () => {
    const c = w.g?.camera;
    if (!c) return;
    c.getWorldPosition(cam);
    let want = cam.x > b[0] && cam.x < b[2] && cam.z > b[1] && cam.z < b[3] && cam.y > y0 && cam.y < y1;
    if (!want && globalThis.__mduNoEclZoneSee !== true) {
      const dx = Math.max(xa - cam.x, 0, cam.x - xb);
      const dz = Math.max(za - cam.z, 0, cam.z - zb);
      want = dx * dx + dz * dz < SEE_FAR * SEE_FAR && roomOpen(k) === true;
    }
    if (want === shown) return;
    shown = want;
    for (const o of objs) o.visible = want;
  };
}
const SEE_FAR = 60;
// Lo que arma fn (lo que cuelga nuevo de w.root) va al grupo de la sala k.
function intoZone(w, ctx, k, fn) {
  const before = new Set(w.root.children);
  fn();
  const g = ctx.zone(k);
  for (const o of w.root.children.filter((c) => !before.has(c) && c !== g)) g.add(o);
  return g;
}

// Las caras de pared de adentro de una zona: [x, z, dx, dz, fy] (la celda de
// piso y hacia dónde está la pared), sin puertas ni rampas.
function faces(w, k) {
  const out = [];
  for (const [x0, z0, x1, z1] of zoneRects(k)) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || w.zone[i] < 0 || w.zoneKeys[w.zone[i]] !== k) continue;
        for (const [dx, dz] of DIRS) {
          if (!w.inside(x + dx, z + dz)) continue;
          const j = w.idx(x + dx, z + dz);
          if (w.grid[j] !== WALL || w.edge[j] !== 0) continue;
          out.push([x, z, dx, dz, w.fy[i]]);
        }
      }
    }
  }
  return out;
}

// Lo retorcido de una sala: `n` grietas violetas en paredes libres (no donde
// cuelga algo ni donde hay una compra o una máquina) y pedazos que flotan.
function twist(w, ctx, k, { cracks = 2, y0 = 1.15, top = null, seed = 1 } = {}) {
  const r = rng(seed * 97 + 13);
  const spans = wallSpans();
  const busy = busyWalls(w);
  const list = faces(w, k).filter(([x, z, dx, dz]) => {
    const axis = dx ? 'z' : 'x';
    const at = dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z;
    const a = dx ? z + 0.5 : x + 0.5;
    if (busy.wall.has(w.idx(x + dx, z + dz)) || busy.front.has(w.idx(x, z))) return false;
    return !spans.some((s) => s.axis === axis && Math.abs(s.at - at) < 0.4 && s.a0 < a + 0.9 && s.a1 > a - 0.9);
  });
  const used = [];
  for (let n = 0; n < cracks && list.length; ) {
    const f = list[Math.floor(r() * list.length)];
    const [x, z, dx, dz, fy] = f;
    if (used.some(([ux, uz]) => Math.hypot(ux - x, uz - z) < 4)) {
      if (used.length + 1 > list.length) break;
      n += 0.25;
      continue;
    }
    used.push([x, z]);
    const c = top ?? ceilOf(k);
    wallCrack(ctx.root, x + 0.5 + dx * 0.5, z + 0.5 + dz * 0.5, [-dx, -dz], fy + y0 + r() * 0.4, Math.min(c - 0.5, fy + y0 + 1.6 + r() * 1.2), 0.4 + r() * 0.25);
    n++;
  }
}

// El centro de la zona (del rect más grande) y su piso.
function center(k) {
  const R = zoneRects(k);
  const big = R.reduce((a, q) => ((q[2] - q[0] + 1) * (q[3] - q[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? q : a), R[0]);
  return [(big[0] + big[2] + 1) / 2, ZONES[k].y || 0, (big[1] + big[3] + 1) / 2];
}

// =================== El Castillo ===================

// La piedra de los escalones y las columnas del castillo (en Eclipse
// M.stoneStep es el travertino del Monumento: monumentoMaterials la pisa).
let STEP = null;
function castleStep(M) {
  if (!STEP) {
    STEP = M.castleStone.clone();
    STEP.color.set(0xb4b0aa);
    weathering(STEP, { grime: 0.2, snow: 0.85 });
  }
  return STEP;
}

// Las vigas de lado a lado con ménsulas y, en los salones altos, pilastras de
// piedra contra la pared lisa (COPIADO de castleTrim.buildTrim, que recorre el
// mapa entero: acá solo para las zonas que se le pasan).
function castleBeams(w, gb, k, hall, boxes) {
  const spans = wallSpans();
  const covers = (axis, at, a0, a1) => spans.some((s) => s.axis === axis && Math.abs(s.at - at) < 0.4 && s.a0 < a1 && s.a1 > a0);
  const propAt = (x, z) => w.inside(x, z) && w.cellBoxes[w.idx(x, z)].some((b) => b.kind === 'prop' && b.active);
  const [x0, z0, x1, z1] = zoneRects(k).reduce((a, q) => ((q[2] - q[0] + 1) * (q[3] - q[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? q : a));
  const c = ceilOf(k);
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
  const step = hall ? 3 : 2.4;
  const n = Math.max(1, Math.floor(len / step));
  const off = (len - (n - 1) * step) / 2;
  const tall = (a) => {
    for (const e of [alongX ? z0 - 1 : x0 - 1, alongX ? z1 + 1 : x1 + 1]) {
      for (const q of [Math.floor(a - 0.25), Math.floor(a + 0.25)]) {
        const [cx, cz] = alongX ? [q, e] : [e, q];
        if (!w.inside(cx, cz)) continue;
        const d = w.idx(cx, cz);
        if (w.grid[d] === DOOR && w.fy[d] + 2.7 > c - 0.95) return true;
      }
    }
    return false;
  };
  for (let s = 0; s < n; s++) {
    const p = (alongX ? x0 : z0) + off + s * step;
    if (tall(p)) continue;
    if (alongX) gb.box('beam', p - 0.16, c - 0.5, z0, p + 0.16, c - 0.01, z1 + 1, 1);
    else gb.box('beam', x0, c - 0.5, p - 0.16, x1 + 1, c - 0.01, p + 0.16, 1);
    for (const side of [0, 1]) {
      if (alongX) {
        const zz = side ? z1 + 1 - 0.38 : z0;
        gb.box('castleStone', p - 0.22, c - 0.95, zz, p + 0.22, c - 0.5, zz + 0.38, 1);
      } else {
        const xx = side ? x1 + 1 - 0.38 : x0;
        gb.box('castleStone', xx, c - 0.95, p - 0.22, xx + 0.38, c - 0.5, p + 0.22, 1);
      }
    }
    if (!hall) continue;
    for (const side of [0, 1]) {
      const cx = alongX ? Math.floor(p) : side ? x1 : x0;
      const cz = alongX ? (side ? z1 : z0) : Math.floor(p);
      const wx = alongX ? cx : side ? x1 + 1 : x0 - 1;
      const wz = alongX ? (side ? z1 + 1 : z0 - 1) : cz;
      if (!w.inside(wx, wz) || w.grid[w.idx(wx, wz)] !== WALL) continue;
      const fi = w.idx(cx, cz);
      if (w.grid[fi] !== FLOOR || w.rampAt[fi] >= 0 || propAt(cx, cz)) continue;
      let clear = true;
      for (const d of [-1, 1]) {
        const ax = alongX ? wx + d : wx;
        const az = alongX ? wz : wz + d;
        if (w.inside(ax, az) && [DOOR, WINDOW].includes(w.grid[w.idx(ax, az)])) clear = false;
      }
      if (!clear) continue;
      if (covers(alongX ? 'x' : 'z', alongX ? (side ? z1 + 1 : z0) : side ? x1 + 1 : x0, p - 0.4, p + 0.4)) continue;
      const fy = w.fy[fi];
      const dep = 0.3;
      let bx0, bz0, bx1, bz1;
      if (alongX) {
        bx0 = p - 0.3;
        bx1 = p + 0.3;
        bz0 = side ? z1 + 1 - dep : z0;
        bz1 = side ? z1 + 1 : z0 + dep;
      } else {
        bz0 = p - 0.3;
        bz1 = p + 0.3;
        bx0 = side ? x1 + 1 - dep : x0;
        bx1 = side ? x1 + 1 : x0 + dep;
      }
      gb.box('castleStone', bx0, fy, bz0, bx1, c - 0.95, bz1, 1);
      const grow = (a0, a1, g) => [a0 - g, a1 + g];
      const [gx0, gx1] = alongX ? grow(bx0, bx1, 0.08) : [bx0, bx1];
      const [gz0, gz1] = alongX ? [bz0, bz1] : grow(bz0, bz1, 0.08);
      const out = 0.08;
      const ex0 = alongX ? gx0 : side ? gx0 - out : gx0;
      const ex1 = alongX ? gx1 : side ? gx1 : gx1 + out;
      const ez0 = alongX ? (side ? gz0 - out : gz0) : gz0;
      const ez1 = alongX ? (side ? gz1 : gz1 + out) : gz1;
      gb.box('castleStoneDark', ex0, fy, ez0, ex1, fy + 0.4, ez1, 1);
      gb.box('castleStoneDark', ex0, c - 1.15, ez0, ex1, c - 0.95, ez1, 1);
      boxes.push([Math.min(ex0, bx0), fy, Math.min(ez0, bz0), Math.max(ex1, bx1), c - 0.95, Math.max(ez1, bz1)]);
    }
  }
}

// Los contrafuertes contra las paredes altas de un patio (COPIADO de
// castleTrim.buildTrim, YARDS), con su nieve.
function castleButtresses(w, gb, k, boxes) {
  const spans = wallSpans();
  const covers = (axis, at, a0, a1) => spans.some((s) => s.axis === axis && Math.abs(s.at - at) < 0.4 && s.a0 < a1 && s.a1 > a0);
  const propAt = (x, z) => w.inside(x, z) && w.cellBoxes[w.idx(x, z)].some((b) => b.kind === 'prop' && b.active);
  for (const [x0, z0, x1, z1] of zoneRects(k)) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] !== FLOOR || w.rampAt[i] >= 0 || propAt(x, z) || w.zoneKeys[w.zone[i]] !== k) continue;
        // (no al lado de una baranda: el contrafuerte se le metía adentro)
        let rail = false;
        for (let qz = -1; qz <= 1; qz++) for (let qx = -1; qx <= 1; qx++) {
          const j = w.idx(x + qx, z + qz);
          if (w.grid[j] === 0 || (w.grid[j] !== FLOOR && w.edge[j] !== 0)) rail = true;
        }
        if (rail) continue;
        DIRS.forEach(([dx, dz]) => {
          const along = dx ? z : x;
          if ((along + (dx ? 1 : 3)) % 5 !== 0) return;
          const nx = x + dx;
          const nz = z + dz;
          if (!w.inside(nx, nz)) return;
          const j = w.idx(nx, nz);
          if (w.grid[j] !== WALL || w.edge[j] !== 0) return;
          const fy = w.fy[i];
          const top = w.top[j];
          if (top - fy < 4) return;
          for (const d of [-1, 1]) {
            const ax = dx ? nx : nx + d;
            const az = dx ? nz + d : nz;
            if (w.inside(ax, az) && [DOOR, WINDOW].includes(w.grid[w.idx(ax, az)])) return;
          }
          const c0 = along + 0.5;
          if (covers(dx ? 'z' : 'x', dx ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z, c0 - 0.45, c0 + 0.45)) return;
          const h1 = fy + (top - fy) * 0.55;
          const h2 = top - 0.35;
          const seg = (dep, y0, y1, half) => {
            if (dx === 1) return [x + 1 - dep, y0, z + 0.5 - half, x + 1, y1, z + 0.5 + half];
            if (dx === -1) return [x, y0, z + 0.5 - half, x + dep, y1, z + 0.5 + half];
            if (dz === 1) return [x + 0.5 - half, y0, z + 1 - dep, x + 0.5 + half, y1, z + 1];
            return [x + 0.5 - half, y0, z, x + 0.5 + half, y1, z + dep];
          };
          const low = seg(0.95, fy, h1, 0.42);
          const high = seg(0.55, h1, h2, 0.36);
          gb.box('castleStone', ...low, 1);
          gb.box('castleStone', ...high, 1);
          const cap = (b) => gb.box('snowCap', b[0] - 0.02, b[4], b[2] - 0.02, b[3] + 0.02, b[4] + 0.07, b[5] + 0.02, 1);
          cap(low);
          cap(high);
          boxes.push(low);
        });
      }
    }
  }
}

// La gruta del glaciar (castleCaves): la misma definición que la del castillo
// (castleCaves.caveDefs, I), corrida al lugar de acá. Los agujeros de la
// cáscara son las puertas de acá: la de las mazmorras (la escalera) queda; la
// de la cueva del dragón no existe en Eclipse (pared lisa: sin agujero).
function iceCave(w, k, S) {
  const sh = (x, z) => [x + S.dx, z + S.dz];
  const X = (x) => x + S.dx;
  const Zs = (z) => z + S.dz;
  const Y = (y) => y + S.dy;
  // (los puntos donde no van piedras: lo del easter egg del castillo, que
  // acá queda como utilería transplantada, y la escalera)
  const keep = [
    [93.5, 50.5, 2.3],
    [91.5, 51.8, 1.9],
    ...[[92.9, 47], [95.6, 47.6], [97, 49.9], [96.4, 52.6], [94.1, 54]].map(([x, z]) => [x, z, 1.4]),
    [86, 49.8, 2.2],
    [85.6, 43.6, 1.7],
    [98.4, 42.6, 1.1],
    [84.6, 54.4, 1.1],
  ].map(([x, z, r]) => [...sh(x, z), r]);
  const C = {
    zone: k,
    ice: true,
    seed: 41,
    corners: [1.9, 1.7, 1.2, 1.9],
    low: 0.3,
    foot: 0.65,
    big: 1.2,
    vault: 1.7,
    vaultFrac: 0.42,
    drop: 1.5,
    holes: [{ x0: X(87.55), x1: X(90.45), z0: Zs(55.2), z1: Zs(56.8), y0: Y(18.6), y1: Y(23.2) }],
    safe: [{ x0: X(87.2), z0: Zs(49.2), x1: X(90.8), z1: Zs(56.5), y1: Y(23.4) }],
    free: [],
    keep,
    lanes: [
      [X(87.2), Zs(48.6), X(90.8), Zs(56.5)],
      [X(87.6), Zs(41.5), X(92.6), Zs(50.5)],
    ],
    columns: [
      { x: X(86.1), z: Zs(47.4), rEnd: 0.85, rMid: 0.38 },
      { x: X(95.3), z: Zs(44.05), rEnd: 0.85, rMid: 0.38 },
    ],
    falls: [{ z0: Zs(47.3), z1: Zs(51.5) }],
    cracks: [
      [97.9, 43.9, 3.2, 0.4],
      [85.8, 53.1, 2.8, 1.9],
      [92.6, 55.1, 2.4, 0.9],
      [99, 52.6, 2.3, 2.6],
      [85.2, 45.2, 2.3, 1.2],
    ].map(([x, z, s, a]) => [X(x), Zs(z), s, a]),
    veins: 16,
    crystals: 10,
  };
  const group = new THREE.Group();
  group.name = 'eclipse:v5:gruta';
  buildCave(w, C, group);
  w.root.add(group);
}

function castillo(w, ctx) {
  const K = {};
  for (const k of ISLANDS.castillo.zones) if (ZONES[k]?.tp?.src === 'castillo') K[ZONES[k].tp.key] = k;
  const S = tpShift(K.K || K.O);
  const { gb, boxes } = ctx;
  const sec = ctx.sec;
  // ---- la sala del trono: columnas, artesonado, dosel y escudos (castleHalls, corrido)
  sec('castillo:kK trono', () => {
    if (!K.K || !S) return;
    intoZone(w, ctx, K.K, () => shifted(w, tpShift(K.K), (pw) => buildHalls(pw, { hall: false }), { M: { ...w.M, stoneStep: castleStep(w.M) } }));
    twist(w, ctx, K.K, { cracks: 2, seed: 11 });
    const [cx, cy, cz] = center(K.K);
    ctx.orbs.push({ c: [cx, cy + 4.2, cz + 2], r: [1.2, 3.4], h: 1.2, n: 7, s: [0.08, 0.2], sp: 0.18 });
  });
  // ---- la biblioteca de dos pisos: estanterías hasta el techo, la galería
  // con baranda colgada de ménsulas (castleRooms.library, con O → la de acá)
  sec('castillo:kO biblioteca', () => {
    if (!K.O) return;
    const lb = new GeoBuilder();
    const bx = [];
    aliased(w, { O: K.O }, () => library(w, lb, busyWalls(w), bx));
    for (const b of bx) w.addBox(b, { kind: 'prop' });
    ctx.zone(K.O).add(lb.build({ ...w.M, books: booksMat() }));
    castleBeams(w, gb, K.O, true, boxes);
    twist(w, ctx, K.O, { cracks: 1, seed: 12, y0: 4.9 });
    ctx.books = K.O;
  });
  // ---- la capilla de los caballeros: vigas y pilastras del salón alto
  sec('castillo:kF capilla', () => {
    if (!K.F) return;
    castleBeams(w, gb, K.F, true, boxes);
    twist(w, ctx, K.F, { cracks: 2, seed: 13 });
    const [cx, cy, cz] = center(K.F);
    ctx.orbs.push({ c: [cx, cy + 5.5, cz], r: [0.8, 2.6], h: 1.4, n: 6, s: [0.07, 0.16], sp: 0.15 });
  });
  // ---- la herrería: las vigas del techo de madera
  sec('castillo:kC herreria', () => {
    if (!K.C) return;
    castleBeams(w, gb, K.C, false, boxes);
    twist(w, ctx, K.C, { cracks: 1, seed: 14 });
  });
  // ---- el palenque: contrafuertes y las ventanas de la fachada (facades, con S → la de acá)
  sec('castillo:kS palenque', () => {
    if (!K.S) return;
    castleButtresses(w, ctx.gbExt, K.S, boxes);
    const fb = new GeoBuilder();
    // (facades recorre A y S: la A de Eclipse es el claro, afuera un rato)
    aliased(w, { A: null, S: K.S }, () => facades(w, fb));
    const win = windowMats();
    ctx.extraBuilds.push([fb, { ...w.M, winLit: win.lit, winDark: win.dark }, true]);
  });
  // ---- la gruta del glaciar: roca de hielo, estalactitas, columnas, la cascada congelada
  sec('castillo:kI gruta', () => {
    if (!K.I) return;
    intoZone(w, ctx, K.I, () => iceCave(w, K.I, tpShift(K.I)));
    const [cx, cy, cz] = center(K.I);
    ctx.orbs.push({ c: [cx + 1, cy + 3.2, cz], r: [1.5, 4], h: 1.6, n: 6, s: [0.08, 0.18], sp: 0.12 });
  });
  // ---- las mazmorras y la bodega: grietas nomás (lo demás vino transplantado)
  sec('castillo:kP kR', () => {
    if (K.P) twist(w, ctx, K.P, { cracks: 1, seed: 15 });
    if (K.R) twist(w, ctx, K.R, { cracks: 1, seed: 16 });
  });
}

// =================== El Monumento ===================
// En el Monumento todo se arma por código (world/Monumento.js y compañía, con
// las coordenadas del mapa escritas): se llaman los mismos constructores en un
// mundo prestado (transplant) y queda lo que cae en las secciones de acá: la
// explanada con la avenida, el mástil mayor, los bolardos y las columnas de
// alumbrado (mC); el basamento con la Proa, la Patria Abanderada, los colosos
// del agua y la Cripta de Belgrano por dentro (mC, mD); el Pasaje con sus dos
// espejos, la reja y las estatuas de Lola Mora (mE); las banderas de América en
// sus vitrinas de la Sala (mF); el Parque con las tipas, los bancos y la
// Batería Libertad (mG). Lo de arriba del fuste no va: la Torre está partida a
// la altura de CUT y el pedazo de arriba (con el Mirador) flota torcido encima.
const TORRE_CUT = 22;
const inBox = (x, z, a) => x >= a[0] && x <= a[2] && z >= a[1] && z <= a[3];
const MON = {
  C: [72.7, 10, 97, 51],
  T: [65.9, 19.4, 90.2, 41.6],
  E: [-0.3, 13.8, 21.2, 41.0],
  F: [4.9, 14.9, 31.0, 22.1],
  G: [96.9, 6, 104.8, 55],
};
function monKeep(x, y, z) {
  if (inBox(x, z, MON.T)) return y < TORRE_CUT ? [...MON.T, -20, TORRE_CUT] : false;
  if (inBox(x, z, MON.F) && y < 3.05) return true;
  for (const B of [MON.C, MON.E, MON.G]) if (inBox(x, z, B)) return B;
  return false;
}
function monumento(w, ctx) {
  const K = {};
  for (const k of ISLANDS.monumento.zones) if (ZONES[k]?.tp?.src === 'monumento') K[ZONES[k].tp.key] = k;
  const S = tpShift(K.C || K.D);
  if (!S) return;
  const O = MAPS.monumento;
  const swap = [[RAMPS, O.RAMPS], [WINDOWS, []], [WALL_BUYS, []]];
  // (tres pasadas: lo de afuera, siempre; la Sala y la Cripta, cada una con su sala)
  const inSala = (x, y, z) => inBox(x, z, MON.F) && y < 3.05;
  const inCripta = (x, y, z) => inBox(x, z, [66.9, 20.9, 80.1, 40.1]) && y < 1.0;
  const inner = (x, y, z) => inSala(x, y, z) || inCripta(x, y, z);
  // (cada pasada arma solo lo que le hace falta: la Sala, las banderas de buildDecor;
  // la Cripta, buildTorre —que la arma— y buildDecor —sus banderas—)
  const fill = (pw, part) => {
    const gb = new GeoBuilder();
    const extra = [];
    if (part === 'sala') {
      buildDecor(pw);
      return;
    }
    if (part === 'cripta') {
      buildTorre(pw, gb, extra);
      pw.root.add(gb.build(pw.M));
      for (const m of extra) pw.root.add(m);
      buildDecor(pw);
      return;
    }
    buildExplanada(pw, gb);
    // (la avenida: en el Monumento el asfalto va 2 cm abajo de la vereda y
    // el piso lo pone Monumento.js; acá Levels pone el piso de la zona entero
    // y lo tapaba: el asfalto y la pintura 1 cm arriba)
    const yA = -2.6;
    gb.quad('asfalto', [91, yA + 0.01, 51], [96, yA + 0.01, 51], [96, yA + 0.01, 10], [91, yA + 0.01, 10], [0, 1, 0], [91 / 4, 51 / 4], [24, 51 / 4], [24, 2.5], [91 / 4, 2.5]);
    for (let z = 10.5; z < 50; z += 3) gb.quad('pintura', [93.9, yA + 0.012, z + 1.5], [94.1, yA + 0.012, z + 1.5], [94.1, yA + 0.012, z], [93.9, yA + 0.012, z], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
    buildExplanadaBordes(pw, gb);
    buildCriptaBordes(pw, gb);
    buildPasaje(pw, gb, extra);
    buildParque(pw, gb);
    buildTorre(pw, gb, extra);
    pw.root.add(gb.build(pw.M));
    // (las piezas sueltas, sueltas: consolidate las junta y separa lo chico)
    for (const m of extra) pw.root.add(m);
    buildDecor(pw);
    // (los globos sueltos los prende y apaga buildDecor: no se juntan; antes de copiar el árbol)
    for (const l of pw.mon.lamps || []) l.userData.keep = true;
  };
  // (todo se arma UNA vez y salen cuatro pedazos: lo de afuera, la Sala, la
  // Cripta y la punta de la Torre)
  const topKeep = (x, y, z) => (inBox(x, z, MON.T) && y >= TORRE_CUT ? [...MON.T, TORRE_CUT, 200] : false);
  const outs = [
    { name: 'v5-monumento-afuera', keep: (x, y, z) => (!inner(x, y, z) ? monKeep(x, y, z) : false), straddle: true },
    { name: 'v5-monumento-sala', keep: (x, y, z) => (inSala(x, y, z) ? monKeep(x, y, z) : false), straddle: true },
    { name: 'v5-monumento-cripta', keep: (x, y, z) => (inCripta(x, y, z) ? monKeep(x, y, z) : false), straddle: true },
    // (la punta no choca: se ve, no se pisa)
    { name: 'v5-torre-arriba', keep: topKeep, straddle: true, noBoxes: true },
  ];
  let parts = null;
  ctx.sec('monumento:secciones', () => {
    const pw = transplant(w, S, (pw) => fill(pw, 'todo'), { outs, swap, hide: ['D', 'F'], name: 'v5-monumento' });
    parts = pw.groups;
    ctx.ext(parts[0]);
    if (K.F) ctx.zone(K.F).add(parts[1]);
    if (K.D) ctx.zone(K.D).add(parts[2]);
    // (las banderas flamean: el reloj de buildDecor en pw.extraUpdate)
    if (pw.extraUpdate) ctx.live.push((dt, t) => pw.extraUpdate(dt, t));
  });
  // los colosos del agua (en el Monumento los choca addSolids)
  for (const z of [24.2, 36.8]) w.addBox([84.6 + S.dx, -2.6 + S.dy, z - 0.9 + S.dz, 86.4 + S.dx, 1.6 + S.dy, z + 0.9 + S.dz], { kind: 'prop' });
  // ---- la Torre partida: el pedazo de arriba flota torcido sobre el corte
  ctx.sec('monumento:torre partida', () => {
    if (!parts) return;
    const top = { group: parts[3] };
    // (sin choques: se ve, no se pisa)
    const grp = top.group;
    const pv = new THREE.Vector3(77 + S.dx, TORRE_CUT + S.dy, 31 + S.dz);
    const outer = new THREE.Group();
    outer.position.copy(pv).add(new THREE.Vector3(2.4, 10.5, -1.6));
    outer.rotation.set(0.2, 0.4, -0.24);
    grp.position.sub(pv);
    outer.userData.keep = true;
    ctx.ext(outer);
    w.root.add(outer);
    outer.add(grp);
    outer.updateMatrixWorld(true);
    const base = outer.position.clone();
    const rot = outer.rotation.clone();
    ctx.live.push((dt, t) => {
      outer.position.y = base.y + Math.sin(t * 0.31) * 0.35;
      outer.rotation.y = rot.y + Math.sin(t * 0.11) * 0.04;
      outer.rotation.z = rot.z + Math.sin(t * 0.17) * 0.015;
    });
    // las dos caras del corte: losas de piedra negra con vetas, dentadas
    const cut = (y, flip) => {
      const r = rng(flip ? 77 : 78);
      const list = [];
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      for (let k = 0; k < 9; k++) {
        q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
        m4.compose(new THREE.Vector3(74.6 + r() * 4.8, y + (r() - 0.5) * 0.9, 26.6 + r() * 8.8), q, new THREE.Vector3(1.3 + r() * 0.8, 0.5 + r() * 0.6, 1.6 + r() * 1.2));
        list.push(new THREE.DodecahedronGeometry(1, 0).applyMatrix4(m4));
      }
      const g = new THREE.Group();
      g.add(mergedMesh(list, voidRockMat(w), { castShadow: false }));
      return g;
    };
    const low = cut(TORRE_CUT - 0.2, false);
    low.position.set(S.dx, S.dy, S.dz);
    ctx.ext(low);
    w.root.add(low);
    const hi = cut(TORRE_CUT + 0.2, true);
    hi.position.sub(pv).add(new THREE.Vector3(S.dx, S.dy, S.dz));
    outer.add(hi);
    const [cx, cy, cz] = [77 + S.dx, TORRE_CUT + S.dy + 3.5, 31 + S.dz];
    ctx.orbs.push({ c: [cx, cy, cz], r: [4.5, 8.5], h: 3.5, n: 12, s: [0.2, 0.55], sp: 0.12 });
  });
}

// =================== La Torre ===================
// Los pisos 14, 13 y 8 arrancados de la torre (tP14, tP13, tP8): en la torre
// los arma world/Tower.js (con su objeto de capas, no se deja llamar) y
// world/towerDecor.js; acá, COPIADO, en coordenadas de la torre (TW) y corrido
// a cada piso de acá (con el piso en y 0 y el grupo a la altura de la zona):
//  · el techo: viguetas cada 2 m, las dos vigas maestras con sus ménsulas y
//    los cuatro faroles colgando (Tower.buildDetail);
//  · el zócalo y la moldura de piedra en las caras de los pilares;
//  · las arcadas: en la torre son abiertas (antepecho con balaustres, el arco
//    y el dintel); acá el piso tiene paredes, así que van contra la cara de
//    adentro, y lo que en la torre era el cielo de la tormenta acá es el vacío
//    de la disformidad (un paño oscuro con su brillo violeta);
//  · el borde del agujero del medio (la guarda de piedra): el agujero quedó
//    tapado por el piso y lo cruza una grieta violeta;
//  · el claustro de columnas con sus vigas (13 y 8: layoutPieces 'cloister');
//    el piso 14 ('halves') no lleva las paredes que lo parten (cambiarían el
//    paso de los muertos y del easter egg de acá);
//  · lo propio de cada piso: el santo sin cara (13), el maíz que cuelga del
//    techo (8), los estantes y apliques con velas de las esquinas y lo tirado
//    en el piso (towerDecor: CLUTTER / SHELF de cada piso).
const TW = { x0: 18, z0: 18, x1: 41, z1: 41, hole: [26, 26, 33, 33], piers: [[18, 20], [25, 27], [32, 34], [39, 41]], arch: 2.95 };
const TOWER_FLOORS = {
  P14: { lv: 13, clutter: [['candle', 28], ['bone', 4], ['ash', 3]], shelf: 'candle', cloister: false },
  P13: { lv: 12, clutter: [['candle', 22], ['paper', 4], ['leaf', 6]], shelf: 'candle', cloister: true, saint: true },
  P8: { lv: 7, clutter: [['cob', 16], ['leaf', 22], ['straw', 4]], shelf: 'box', cloister: true, corn: true },
};
let TM = null;
function towerMats(w) {
  if (TM) return TM;
  const T = w.T || w.g?.textures || {};
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  // (la tormenta de afuera de la torre, acá el vacío: un paño oscuro con el
  // brillo de la disformidad abajo y algunas estrellas)
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const x = cv.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#05030b');
  gr.addColorStop(0.55, '#120826');
  gr.addColorStop(1, '#4a1c7a');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 128);
  const r = rng(91);
  for (let k = 0; k < 18; k++) {
    x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    x.fillRect(r() * 64, r() * 70, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  TM = {
    towerStone: std({ map: T.stoneWall || T.concrete || null, color: 0xb8ae9e, roughness: 0.95, bumpMap: T.stoneWall || null, bumpScale: 1.2 }),
    keyStone: std({ map: T.stoneWall || T.concrete || null, color: 0xe0d8c8 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb050, emissiveIntensity: 2.2 }),
    vacio: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }),
  };
  return TM;
}
// La cara de adentro del perímetro (lado 0 norte, 1 este, 2 sur, 3 oeste), en
// coordenadas de la torre: el punto a lo largo `a`, alto `y`, `d` hacia adentro.
function sideP(side, a, y, d) {
  if (side === 0) return [a, y, TW.z0 + d];
  if (side === 2) return [a, y, TW.z1 + 1 - d];
  if (side === 3) return [TW.x0 + d, y, a];
  return [TW.x1 + 1 - d, y, a];
}
function sideBox(gb, key, side, a0, a1, y0, y1, d0, d1) {
  const P = sideP(side, a0, y0, d0);
  const Q = sideP(side, a1, y1, d1);
  gb.box(key, Math.min(P[0], Q[0]), Math.min(P[1], Q[1]), Math.min(P[2], Q[2]), Math.max(P[0], Q[0]), Math.max(P[1], Q[1]), Math.max(P[2], Q[2]), 1);
}
function towerFloor(w, ctx, k, key) {
  const D = TOWER_FLOORS[key];
  const S = tpShift(k);
  if (!S || !D) return;
  const M = { ...w.M, ...towerMats(w) };
  const Z = ZONES[k];
  const yc = (Z.roof ?? Z.y + 3.9) - Z.y;
  const r = rng(6061 + D.lv * 31);
  // lo ocupado (máquinas, compras, puertas, portales, aparecidos y la utilería
  // del piso), en coordenadas de la torre
  const busy = keepOut();
  const props = PROPS.filter((p) => p.pos && w.zoneAt(p.pos[0], p.pos[1], Z.y + 0.5) === k).map((p) => [p.pos[0] - S.dx, p.pos[1] - S.dz]);
  const free = (x, z, rad = 0.6) => !busy(x + S.dx, z + S.dz, rad) && !props.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.25 + rad);
  const cell = (x, z) => w.grid[w.idx(Math.floor(x) + S.dx, Math.floor(z) + S.dz)];
  const gb = new GeoBuilder();
  const boxes = [];
  // ---- el techo: viguetas, vigas maestras, ménsulas y faroles
  for (let x = TW.x0; x <= TW.x1; x += 2) gb.box('beam', x + 0.5 - 0.08, yc - 0.2, TW.z0, x + 0.5 + 0.08, yc + 0.01, TW.z1 + 1, 1);
  const hangers = [];
  for (const z of [22, 37]) {
    gb.box('beam', TW.x0, yc - 0.48, z + 0.36, TW.x1 + 1, yc - 0.2, z + 0.64, 1);
    gb.box('towerStone', TW.x0, yc - 0.7, z + 0.3, TW.x0 + 0.3, yc - 0.48, z + 0.7, 1);
    gb.box('towerStone', TW.x1 + 1 - 0.3, yc - 0.7, z + 0.3, TW.x1 + 1, yc - 0.48, z + 0.7, 1);
    for (const x of [22, 37]) hangers.push([x + 0.5, yc - 0.48, z + 0.5]);
  }
  // ---- las caras: pilares con zócalo y moldura; los tramos de arco contra la pared
  const spans = [[21, 24], [28, 31], [35, 38]];
  const balus = [];
  for (const side of [0, 1, 2, 3]) {
    // la celda de pared detrás de la cara (en la torre, el perímetro)
    const wallAt = (a) => {
      const [px, , pz] = sideP(side, a + 0.5, 0, -0.5);
      return cell(px, pz);
    };
    const solid = (a0, a1) => {
      for (let a = a0; a <= a1; a++) if (wallAt(a) !== WALL) return false;
      return true;
    };
    for (const [p0, p1] of TW.piers) {
      for (const [h0, h1, d] of [[0, 0.28, 0.07], [2.02, 2.14, 0.1]]) {
        for (let a = p0; a <= p1; a++) if (wallAt(a) === WALL) sideBox(gb, 'towerStone', side, a, a + 1, h0, h1, 0, d);
      }
    }
    for (const [a0, a1] of spans) {
      if (!solid(a0, a1)) continue;
      const A0 = a0;
      const A1 = a1 + 1;
      // el paño del vacío (lo que se ve por el arco), 1 cm adelante de la pared
      const q = (a, yy) => sideP(side, a, yy, 0.012);
      const n = side === 0 ? [0, 0, 1] : side === 2 ? [0, 0, -1] : side === 3 ? [1, 0, 0] : [-1, 0, 0];
      const ccw = side === 0 || side === 3;
      const c4 = ccw ? [q(A0, 1.04), q(A1, 1.04), q(A1, TW.arch), q(A0, TW.arch)] : [q(A1, 1.04), q(A0, 1.04), q(A0, TW.arch), q(A1, TW.arch)];
      gb.quad('vacio', c4[0], c4[1], c4[2], c4[3], n, [0, 0], [1, 0], [1, 1], [0, 1]);
      // el antepecho, la baranda de piedra y los balaustres
      sideBox(gb, 'towerStone', side, A0, A1, 0, 0.16, 0, 0.26);
      sideBox(gb, 'trim', side, A0, A1, 0.94, 1.04, 0, 0.26);
      for (let a = A0 + 0.17; a < A1; a += 0.33) balus.push(sideP(side, a, 0.16, 0.13));
      // el dintel y la enjuta del arco (la media elipse de towerDecor.buildArches), en tiras
      sideBox(gb, 'towerStone', side, A0, A1, TW.arch, yc, 0, 0.06);
      const wdt = A1 - A0;
      const R = wdt / 2;
      const spring = TW.arch - 0.9;
      const rise = 0.885;
      const N = 16;
      const cy = (u) => spring + rise * Math.sqrt(Math.max(0, 1 - ((u - R) / R) ** 2));
      for (let i = 0; i < N; i++) {
        const u0 = (i / N) * wdt;
        const u1 = ((i + 1) / N) * wdt;
        sideBox(gb, 'towerStone', side, A0 + u0, A0 + u1, Math.min(cy(u0), cy(u1)), TW.arch, 0, 0.06);
      }
      // la clave y las impostas
      const c = A0 + wdt / 2;
      sideBox(gb, 'keyStone', side, c - 0.17, c + 0.17, TW.arch - 0.3, TW.arch + 0.1, 0, 0.1);
      for (const u of [A0, A1]) sideBox(gb, 'keyStone', side, u - 0.14, u + 0.14, spring - 0.1, spring, 0, 0.09);
    }
  }
  // ---- el agujero del medio: la guarda de piedra (la grieta que lo tapa va aparte)
  const [h0, h1, h2, h3] = TW.hole;
  gb.box('trim', h0 - 0.06, 0, h1 - 0.06, h2 + 1 + 0.06, 0.08, h1 + 0.06, 1);
  gb.box('trim', h0 - 0.06, 0, h3 + 1 - 0.06, h2 + 1 + 0.06, 0.08, h3 + 1 + 0.06, 1);
  gb.box('trim', h0 - 0.06, 0, h1 + 0.06, h0 + 0.06, 0.08, h3 + 1 - 0.06, 1);
  gb.box('trim', h2 + 1 - 0.06, 0, h1 + 0.06, h2 + 1 + 0.06, 0.08, h3 + 1 - 0.06, 1);
  // ---- el claustro: columnas con basa y capitel, y las vigas que las unen
  if (D.cloister) {
    const lo = h0 - 2.5;
    const hi = h2 + 1 + 2.5;
    const steps = [lo, lo + 4, hi - 4, hi];
    const pts = [];
    for (const a of steps) pts.push([a, lo, a !== lo && a !== hi ? 'x' : null], [a, hi, a !== lo && a !== hi ? 'x' : null]);
    for (const a of steps.slice(1, -1)) pts.push([lo, a, 'z'], [hi, a, 'z']);
    const cols = [];
    for (const [px, pz, axis] of pts) {
      const at = [0, -1, 1].map((d) => (axis === 'x' ? [px + d, pz] : axis === 'z' ? [px, pz + d] : [px, pz])).find(([x, z]) => free(x, z, 1.2));
      if (at) cols.push(at);
    }
    const top = yc;
    for (const [x, z] of cols) {
      gb.box('keyStone', x - 0.3, 0, z - 0.3, x + 0.3, 0.18, z + 0.3, 1);
      gb.box('towerStone', x - 0.22, 0.18, z - 0.22, x + 0.22, top - 0.35, z + 0.22, 1);
      gb.box('keyStone', x - 0.3, top - 0.35, z - 0.3, x + 0.3, top - 0.2, z + 0.3, 1);
      boxes.push([x - 0.22, 0, z - 0.22, x + 0.22, top, z + 0.22]);
    }
    for (const kk of [lo, hi]) {
      for (const axis of ['x', 'z']) {
        const ps = cols.filter(([x, z]) => Math.abs((axis === 'x' ? z : x) - kk) < 0.01).map(([x, z]) => (axis === 'x' ? x : z)).sort((a, b) => a - b);
        for (let i = 0; i + 1 < ps.length; i++) {
          if (axis === 'x') gb.box('beam', ps[i], top - 0.2, kk - 0.14, ps[i + 1], top, kk + 0.14, 1);
          else gb.box('beam', kk - 0.14, top - 0.2, ps[i], kk + 0.14, top, ps[i + 1], 1);
        }
      }
    }
  }
  // ---- las piezas sueltas (instanciadas): balaustres, faroles, lo tirado
  const lists = {};
  const put = (kind, x, yy, z, ry = 0, sc = [1, 1, 1], c = null, rx = 0, rz = 0) => (lists[kind] ||= []).push([x, yy, z, rx, ry, rz, sc[0], sc[1], sc[2], c]);
  const candle = (x, yy, z, h) => {
    put('candle', x, yy, z, 0, [1, h, 1], 0xe8dcc0 - Math.floor(r() * 3) * 0x080808);
    put('flame', x, yy + h, z, 0, [1, 1 + r() * 0.5, 1]);
  };
  for (const [x, yy, z] of balus) put('balus', x, yy, z);
  // las luces de los faroles (en la torre, el pozo de luces que va a los faroles
  // más cercanos: acá, luces adoptadas del mundo —World.adoptLight—, desde la
  // carga; el pozo de luces del mapa prende las que más se notan)
  for (const [x, yy, z] of hangers) {
    const L = new THREE.PointLight(FLOOR_TINTS[D.lv] ?? 0xffb070, 26, 16, 1.7);
    L.position.set(x + S.dx, Z.y + yy - 0.75, z + S.dz);
    w.root.add(w.adoptLight ? w.adoptLight(L) : L);
  }
  for (const [x, yy, z] of hangers) {
    const ly = yy - 0.75;
    put('chain', x, (yy + ly + 0.2) / 2, z, 0, [1, yy - ly - 0.2, 1]);
    put('glass', x, ly, z);
    put('cage', x, ly, z);
    put('cap', x, ly + 0.2, z);
  }
  const LEAF = [0x6a5030, 0x7a6038, 0x5a4828, 0x806a40];
  const piece = (kind, x, z) => {
    const a = r() * Math.PI * 2;
    if (kind === 'paper') put(kind, x, 0.004 + r() * 0.004, z, a, [1, 1, 1], 0xd8d0bc - Math.floor(r() * 4) * 0x0a0a08, (r() - 0.5) * 0.08);
    else if (kind === 'leaf') put(kind, x, 0.005, z, a, [1, 1, 1], LEAF[Math.floor(r() * LEAF.length)], (r() - 0.5) * 0.3);
    else if (kind === 'candle') {
      const nn = 1 + Math.floor(r() * 3);
      for (let i = 0; i < nn; i++) candle(x + (r() - 0.5) * 0.3, 0, z + (r() - 0.5) * 0.3, 0.08 + r() * 0.22);
    } else if (kind === 'straw') put(kind, x, 0, z, a, [0.7 + r() * 0.8, 0.6 + r() * 0.8, 0.7 + r() * 0.8]);
    else if (kind === 'cob' || kind === 'bone') put(kind, x, 0, z, a);
    else if (kind === 'ash') put(kind, x, 0.006, z, a, [0.7 + r() * 0.6, 1, 0.7 + r() * 0.6]);
  };
  for (const [kind, nn] of D.clutter) {
    let placed = 0;
    for (let tries = 0; placed < nn && tries < nn * 30; tries++) {
      const x = TW.x0 + 0.4 + r() * (TW.x1 - TW.x0 + 0.2);
      const z = TW.z0 + 0.4 + r() * (TW.z1 - TW.z0 + 0.2);
      if (x > h0 - 0.3 && x < h2 + 1.3 && z > h1 - 0.3 && z < h3 + 1.3) continue;
      if (!free(x, z, kind === 'leaf' || kind === 'paper' ? -0.6 : 0)) continue;
      piece(kind, x, z);
      if (kind === 'leaf') for (let i = 0; i < 3; i++) piece(kind, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6);
      placed++;
    }
  }
  // las esquinas: un estante contra la cara de un pilar y un aplique contra la otra
  const corners = [
    [[19.6, TW.z0, 'x', [0, 1]], [TW.x0, 19.6, 'z', [1, 0]]],
    [[40.4, TW.z0, 'x', [0, 1]], [TW.x1 + 1, 19.6, 'z', [-1, 0]]],
    [[19.6, TW.z1 + 1, 'x', [0, -1]], [TW.x0, 40.4, 'z', [1, 0]]],
    [[40.4, TW.z1 + 1, 'x', [0, -1]], [TW.x1 + 1, 40.4, 'z', [-1, 0]]],
  ];
  corners.forEach((pair, ci) => {
    const flip = (ci + D.lv) % 2;
    const [shelf, sconce] = flip ? [pair[1], pair[0]] : pair;
    const clear = ([x, z, , [nx, nz]]) => free(x + nx * 0.4, z + nz * 0.4, 0.2);
    if (clear(shelf)) towerShelf(gb, shelf, D.shelf, put, candle, r);
    if (clear(sconce)) towerSconce(gb, sconce, candle);
  });
  // el maíz que crece para abajo (piso 8): plantas dadas vuelta desde el techo
  if (D.corn) {
    for (let x = TW.x0 + 0.5; x <= TW.x1; x += 1.1) {
      for (let z = TW.z0 + 0.5; z <= TW.z1; z += 1.1) {
        if (r() < 0.3) continue;
        const s = 0.75 + r() * 0.4;
        put('corn', x + (r() - 0.5) * 0.5, yc - 0.2, z + (r() - 0.5) * 0.5, r() * 3, [s, s, s]);
      }
    }
  }
  // ---- armado: un grupo a la altura del piso de acá, corrido
  const grp = new THREE.Group();
  grp.name = `eclipse:v5:${k}`;
  grp.position.set(S.dx, Z.y, S.dz);
  grp.add(gb.build(M));
  const K = towerPieces(w, M);
  const m4 = new THREE.Matrix4();
  const qt = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const vA = new THREE.Vector3();
  const vS = new THREE.Vector3();
  const col = new THREE.Color();
  // (cada clase de pieza: sus copias horneadas en una malla con el color de
  // cada una en los vértices; consolidate las junta con lo demás de la isla)
  for (const [kind, list] of Object.entries(lists)) {
    const [geo, mat, shadow] = K[kind];
    const geos = [];
    for (const [x, yy, z, rx, ry, rz, sx, sy, sz, c] of list) {
      m4.compose(vA.set(x, yy, z), qt.setFromEuler(eu.set(rx, ry, rz, 'YXZ')), vS.set(sx, sy, sz));
      let gg = geo.clone().applyMatrix4(m4);
      if (gg.index) gg = gg.toNonIndexed();
      for (const nm of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) gg.deleteAttribute(nm);
      if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      col.set(c ?? 0xffffff);
      const n = gg.attributes.position.count;
      const ca = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) ca.set([col.r, col.g, col.b], i * 3);
      gg.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      geos.push(gg);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((gg) => gg.dispose());
    const m = new THREE.Mesh(merged, vcMat(mat));
    m.castShadow = !!shadow;
    m.receiveShadow = kind !== 'flame';
    grp.add(m);
  }
  // el santo sin cara (piso 13): torcido, mira para abajo, contra la pared del sur
  // (en la torre el altar de la capilla está delante del santo: acá también; solo lo de keepOut lo saca)
  if (D.saint && !busy(30 + S.dx, 40.6 + S.dz, 0.6)) grp.add(towerSaint(M, 30, 40.9, boxes));
  // la grieta violeta que tapa el agujero
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(h2 + 1 - h0 - 0.4, h3 + 1 - h1 - 0.4).rotateX(-Math.PI / 2), floorCrackMat());
  crack.position.set((h0 + h2 + 1) / 2, 0.012, (h1 + h3 + 1) / 2);
  crack.rotation.y = r() * 3;
  crack.renderOrder = 2;
  grp.add(crack);
  grp.updateMatrixWorld(true);
  w.root.add(grp);
  for (const b of boxes) w.addBox([b[0] + S.dx, b[1] + Z.y, b[2] + S.dz, b[3] + S.dx, b[4] + Z.y, b[5] + S.dz], { kind: 'prop' });
  // lo que flota sobre el agujero tapado
  ctx.orbs.push({ c: [(h0 + h2 + 1) / 2 + S.dx, Z.y + 1.6, (h1 + h3 + 1) / 2 + S.dz], r: [1.2, 3.4], h: 1.4, n: 7, s: [0.07, 0.18], sp: 0.2 });
}
// El material de una pieza con el color de cada copia en los vértices.
const VC = new Map();
function vcMat(m) {
  if (VC.has(m)) return VC.get(m);
  const c = m.clone();
  c.vertexColors = true;
  c.userData.vcOf = m;
  VC.set(m, c);
  return c;
}
let TPIECES = null;
function towerPieces(w, M) {
  if (TPIECES) return TPIECES;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const prof = [[0.05, 0], [0.03, 0.14], [0.06, 0.38], [0.032, 0.64], [0.055, 0.78]];
  const flame = w.M.flame || new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
  TPIECES = {
    balus: [new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 6), M.towerStone, true],
    chain: [new THREE.CylinderGeometry(0.012, 0.012, 1, 4), M.iron, false],
    glass: [new THREE.SphereGeometry(0.1, 8, 6), M.lantern, false],
    cage: [new THREE.CylinderGeometry(0.12, 0.16, 0.3, 6, 1, true), M.iron, true],
    cap: [new THREE.ConeGeometry(0.17, 0.12, 6), M.iron, true],
    paper: [new THREE.PlaneGeometry(0.21, 0.3).rotateX(-Math.PI / 2), std(0xd8d0bc, { side: THREE.DoubleSide, roughness: 1 }), false],
    leaf: [new THREE.CircleGeometry(0.07, 5).scale(1, 0.5, 1).rotateX(-Math.PI / 2), std(0xffffff, { side: THREE.DoubleSide, roughness: 1 }), false],
    candle: [new THREE.CylinderGeometry(0.028, 0.03, 1, 7).translate(0, 0.5, 0), std(0xe8dcc0), true],
    flame: [new THREE.ConeGeometry(0.018, 0.06, 5).translate(0, 0.03, 0), flame, false],
    straw: [new THREE.ConeGeometry(0.3, 0.1, 6).scale(1, 1, 0.7).translate(0, 0.05, 0), std(0xc8a860, { roughness: 1 }), true],
    cob: [new THREE.CapsuleGeometry(0.035, 0.12, 2, 6).rotateZ(Math.PI / 2).translate(0, 0.035, 0), std(0xd8b040), true],
    bone: [mergeGeometries([new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5).rotateZ(Math.PI / 2), new THREE.SphereGeometry(0.035, 5, 4).translate(0.16, 0, 0), new THREE.SphereGeometry(0.035, 5, 4).translate(-0.16, 0, 0)]).translate(0, 0.03, 0), std(0xd8ccb0), true],
    ash: [new THREE.CircleGeometry(0.42, 9).rotateX(-Math.PI / 2), std(0x16110d, { roughness: 1, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), false],
    jar: [new THREE.CylinderGeometry(0.06, 0.055, 0.16, 8).translate(0, 0.08, 0), std(0xffffff, { roughness: 0.3 }), true],
    bottle: [new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.047, 0.16], [0.02, 0.21], [0.015, 0.27], [0, 0.27]].map(([a, b]) => new THREE.Vector2(a, b)), 7), std(0xffffff, { roughness: 0.2, metalness: 0.1 }), true],
    box: [new THREE.BoxGeometry(0.2, 0.14, 0.16).translate(0, 0.07, 0), std(0xffffff), true],
    corn: [mergeGeometries([0, 1].map((kk) => new THREE.PlaneGeometry(0.9, 1.3).rotateZ(Math.PI).translate(0, -0.65, 0).rotateY((kk * Math.PI) / 2))), M.corn || std(0x8a9a40, { side: THREE.DoubleSide }), true],
  };
  return TPIECES;
}
// Estante de dos tablas contra la cara de un pilar (towerDecor.buildShelf, con el piso en 0).
function towerShelf(W, [x, z, along, [nx, nz]], item, put, candle, r) {
  const len = 2.2;
  const d = 0.26;
  const box = (a0, a1, y0, y1, n0, n1, key = 'woodDark') => {
    const s = nx || nz;
    const lo = Math.min(n0 * s, n1 * s);
    const hi = Math.max(n0 * s, n1 * s);
    if (along === 'x') W.box(key, x + a0, y0, z + lo, x + a1, y1, z + hi, 1);
    else W.box(key, x + lo, y0, z + a0, x + hi, y1, z + a1, 1);
  };
  for (const h of [1.2, 1.68]) {
    box(-len / 2, len / 2, h - 0.035, h, 0.01, d);
    for (const a of [-len / 2 + 0.2, len / 2 - 0.2]) box(a - 0.02, a + 0.02, h - 0.2, h - 0.035, 0.01, d * 0.8, 'iron');
    for (let a = -len / 2 + 0.18; a < len / 2 - 0.1; a += 0.2 + r() * 0.18) {
      if (r() < 0.2) continue;
      const off = 0.06 + r() * (d - 0.14);
      const px = along === 'x' ? x + a : x + nx * off;
      const pz = along === 'x' ? z + nz * off : z + a;
      if (item === 'candle') candle(px, h, pz, 0.08 + r() * 0.16);
      else if (item === 'bottle') put('bottle', px, h, pz, r() * 6, [1, 0.8 + r() * 0.4, 1], [0x2a4a2a, 0x4a2e18, 0x20382e][Math.floor(r() * 3)]);
      else if (item === 'jar') put('jar', px, h, pz, r() * 6, [1, 0.8 + r() * 0.6, 1], [0xb8c8c0, 0x8a6a40, 0xc8b890, 0x6a7a8a][Math.floor(r() * 4)]);
      else put('box', px, h, pz, r() * 0.4 - 0.2, [0.8 + r() * 0.5, 0.7 + r() * 0.8, 0.8 + r() * 0.4], [0x8a6a48, 0x6a4a38, 0xa08868, 0x4a5a6a][Math.floor(r() * 4)]);
    }
  }
}
// Aplique de hierro con dos velas (towerDecor.buildSconce, con el piso en 0).
function towerSconce(W, [x, z, along, [nx, nz]], candle) {
  const h = 1.9;
  const b = (a0, a1, y0, y1, n0, n1) => {
    const lo = Math.min(n0 * (nx || nz), n1 * (nx || nz));
    const hi = Math.max(n0 * (nx || nz), n1 * (nx || nz));
    if (along === 'x') W.box('iron', x + a0, y0, z + lo, x + a1, y1, z + hi, 1);
    else W.box('iron', x + lo, y0, z + a0, x + hi, y1, z + a1, 1);
  };
  b(-0.09, 0.09, h - 0.25, h + 0.15, 0.005, 0.03);
  b(-0.02, 0.02, h - 0.05, h - 0.02, 0.03, 0.2);
  b(-0.2, 0.2, h - 0.05, h - 0.02, 0.17, 0.21);
  for (const a of [-0.18, 0.18]) {
    b(a - 0.045, a + 0.045, h - 0.02, h, 0.145, 0.235);
    const px = along === 'x' ? x + a : x + nx * 0.19;
    const pz = along === 'x' ? z + nz * 0.19 : z + a;
    candle(px, h, pz, 0.14 + Math.abs(a) * 0.3);
  }
}
// El santo de yeso sin cara (Tower.buildSaint), en coordenadas del piso.
function towerSaint(M, x, z, boxes) {
  const stone = M.marble || M.stone;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.set(0, Math.PI, 0.13);
  const add = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  add(new THREE.BoxGeometry(0.9, 0.9, 0.7), stone, 0, 0.45, 0);
  add(new THREE.BoxGeometry(1, 0.1, 0.8), stone, 0, 0.95, 0);
  add(new THREE.CylinderGeometry(0.2, 0.36, 1.3, 12), stone, 0, 1.65, 0);
  add(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 2.28, 0);
  add(new THREE.SphereGeometry(0.13, 12, 10), stone, 0, 2.5, 0.08, 0.5);
  add(new THREE.TorusGeometry(0.2, 0.012, 4, 20), M.brass || M.metal || M.iron, 0, 2.62, -0.02, 0.9, 0.3);
  add(new THREE.BoxGeometry(0.1, 0.16, 0.1), stone, 0, 2.02, 0.22, -0.4);
  boxes.push([x - 0.5, 0, z - 0.4, x + 0.5, 2.7, z + 0.4]);
  return g;
}

function torre(w, ctx) {
  // la escalera rota (P2): escalones sueltos que flotan al costado, afuera
  if (ZONES.P2) {
    const R = zoneRects('P2')[0];
    ctx.orbs.push({ c: [(R[0] + R[2] + 1) / 2 + 3.2, ZONES.P2.y - 2.5, (R[1] + R[3] + 1) / 2], r: [0.8, 2.4], h: 2.6, n: 7, s: [0.12, 0.32], sp: 0.16 });
  }
  // (sesión 1f, el usuario: "en la escalera rota se ve el techo a través": los
  // pisos de la torre tienen cielorraso por adentro y las vigas, pero arriba
  // nada; desde la Escalera Rota y la Escalera de Oro se veía todo el piso de
  // adentro. Una azotea encima de cada piso techado. __mduNoTorreAzotea: sin)
  if (globalThis.__mduNoTorreAzotea !== true) {
    for (const k of ISLANDS.torre.zones) {
      const Z = ZONES[k];
      if (!Z || Z.outdoor || !(Z.roof > Z.y)) continue;
      for (const [x0, z0, x1, z1] of zoneRects(k)) ctx.gbExt.box(w.M.travPave ? 'travPave' : 'azotea', x0 - 0.02, Z.roof + 0.12, z0 - 0.02, x1 + 1.02, Z.roof + 0.34, z1 + 1.02, 2);
    }
  }
  for (const k of ISLANDS.torre.zones) {
    const tp = ZONES[k]?.tp;
    if (tp?.src !== 'torre' || !TOWER_FLOORS[tp.key]) continue;
    ctx.sec(`torre:${k}`, () => intoZone(w, ctx, k, () => towerFloor(w, ctx, k, tp.key)));
  }
}

// =================== El Molino ===================
// El acopio (nG), la sala de máquinas (nF), la oficina del patrón (nH) y el
// cementerio de los peones (nI): la utilería del config vino transplantada;
// lo que en el molino arma el código:
//  · los techos a dos aguas de chapa y de tejas (world/Roofs.js, la lista del
//    molino: se llama entera en un mundo prestado y queda el techo de cada
//    sección, a la altura de las paredes de acá);
//  · la ambientación de world/Decor.js (carteles, tableros, herramientas,
//    sogas, faroles, cruces y manchas en las paredes, las cañerías de las
//    naves, los muebles agregados, lo tirado en el piso, telarañas y cadenas
//    colgando): la clase de Decor sin su constructor (recorre las zonas del
//    molino por letra), con sus mismos métodos para cada pieza y el reparto
//    (WALL_POOLS, FURNITURE) copiado.
const MOL_POOLS = {
  G: [['poster', 2], ['tools', 2], ['rope', 2], ['conduit', 1], ['blood', 1]],
  F: [['panel', 3], ['warning', 2], ['conduit', 2], ['tools', 1], ['blood', 0.5]],
  H: [['frame', 3], ['clock', 1], ['calendar', 1], ['shelf', 2], ['blood', 0.5]],
  I: [['cross', 3], ['blood', 1]],
};
const MOL_FURNITURE = [
  ['workbench', 41, 15.45, Math.PI],
  ['cylinders', 54.2, 12, 0],
  ['spool', 47.2, 5.3, 0],
  ['bascula', 20, 6.6, 0],
  ['handtruck', 27.6, 12.3, 0.5],
  ['rug', 48.5, 37.2, 0],
  ['coatrack', 54.3, 33.7, 0],
  ['safe', 43.2, 44.9, Math.PI],
  ['liquor', 45.8, 33.55, 0],
  ['globe', 45.4, 37.6, 0],
  ['grandclock', 52.6, 33.45, 0],
];
// los techos de Roofs.js de cada sección (rect de afuera en el molino)
// (la oficina: solo lo de arriba de 6,2 m, que la cabecera de la capilla, de
// 3,6 a 7,4 m, cae en la misma caja; el acopio y la sala de máquinas van juntos,
// con la medianera del medio, a la altura de la más alta)
const MOL_ROOFS = { G: [2.4, 2.4, 31.5, 18.6], F: [31.55, 2.4, 57.6, 18.1], H: [40.6, 31.4, 57.6, 47.6, 6.2, 99] };
function molDecor(w) {
  const D = Object.create(Decor.prototype);
  D.g = w.g;
  D.world = w;
  D.M = w.M;
  D.r = rng(9173);
  D.atlas = buildAtlas();
  D.posterMat = new THREE.MeshStandardMaterial({ map: D.atlas, roughness: 0.95 });
  D.overlayMat = new THREE.MeshStandardMaterial({ map: D.atlas, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  D.extra = D.makeMaterials();
  D.blocked = [];
  return D;
}
function molino(w, ctx) {
  const K = {};
  for (const k of ISLANDS.molino.zones) if (ZONES[k]?.tp?.src === 'molino') K[ZONES[k].tp.key] = k;
  // ---- los techos
  for (const [key, R] of Object.entries(MOL_ROOFS)) {
    const k = K[key];
    if (!k) continue;
    ctx.sec(`molino:${k} techo`, () => {
      const S = tpShift(k);
      // (las paredes de acá son más altas que las del molino: el techo arranca arriba de las de esta sección)
      const base = key === 'H' ? 6.4 : 3.6;
      const top = (kk) => (K[kk] ? ZONES[K[kk]].roof ?? ZONES[K[kk]].y + 3.6 : -1e9);
      const roof = key === 'H' ? top('H') : Math.max(top('G'), top('F'));
      const y0 = R[4] ?? -99;
      ctx.ext(transplant(w, { ...S, dy: roof - base }, (pw) => buildMolinoRoofs(pw, 'molino'), { keep: (x, y, z) => (inBox(x, z, R) && y >= y0 ? R : false), name: `v5-techo-${k}` }).group);
    });
  }
  // ---- la ambientación (Decor)
  ctx.sec('molino:decor', () => {
    const D = molDecor(w);
    // (la ambientación queda en la isla, junta por material y escondida de lejos: no con la utilería de todo el mapa)
    D.add = (obj) => {
      // (a la sala donde cae: se junta y se esconde con la sala)
      const ry = obj.rotation.y;
      const k = w.zoneAt(obj.position.x + Math.sin(ry) * 0.5, obj.position.z + Math.cos(ry) * 0.5, obj.position.y + 0.5);
      (k && ISLANDS.molino.zones.includes(k) ? ctx.zone(k) : ctx.root).add(obj);
    };
    const r = D.r;
    const busy = keepOut();
    const M = w.M;
    const props = PROPS.filter((p) => p.pos).map((p) => p.pos);
    const nearProp = (x, z, rad) => props.some(([px, pz]) => Math.hypot(px - x, pz - z) < rad);
    const place = (g, x, y, z, rot) => {
      g.position.set(x, y, z);
      g.rotation.y = rot;
      D.add(g);
    };
    for (const [key, pool] of Object.entries(MOL_POOLS)) {
      const k = K[key];
      if (!k) continue;
      const Z = ZONES[k];
      const zid = w.zoneKeys.indexOf(k);
      const total = pool.reduce((s, [, wt]) => s + wt, 0);
      const roof = Z.roof ?? Z.y + 3.6;
      const seen = new Set();
      for (const [x0, z0, x1, z1] of zoneRects(k)) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const i = w.idx(x, z);
            if (w.grid[i] !== FLOOR || w.zone[i] !== zid) continue;
            const fy = w.fy[i];
            for (const [dx, dz] of DIRS) {
              const wx = x + dx;
              const wz = z + dz;
              if (!w.inside(wx, wz) || w.grid[w.idx(wx, wz)] !== WALL) continue;
              // ---- la pared: un cartel, un tablero, herramientas... (Decor.wallDecor)
              const id = `${wx},${wz},${dx},${dz}`;
              if (seen.has(id)) continue;
              seen.add(id);
              if (r() > 0.78) continue;
              const a = w.wallAnchor([wx, wz], [-dx, -dz], 0.005);
              if (busy(a.x, a.z, 0.5) || nearProp(a.x, a.z, 1.1)) continue;
              if (w.cellBoxes[i].some((b) => b.active && b.y1 > fy + 1.3 && (b.kind === 'prop' || b.kind === 'machine'))) continue;
              let rr = r() * total;
              let kind = pool[0][0];
              for (const [kk, wt] of pool) {
                rr -= wt;
                if (rr <= 0) {
                  kind = kk;
                  break;
                }
              }
              const g = new THREE.Group();
              D.wallItem(kind, g, key);
              // (los caños llegan al techo del molino, 3,6 m: acá siguen hasta el de cada sección)
              const ext = roof - fy - WALL_H;
              if (ext > 0.02 && kind === 'conduit') g.add(mesh(cylGeo(0.022, 0.022, ext, 6), M.metal, 0.1, WALL_H + ext / 2, 0.03));
              if (ext > 0.02 && kind === 'panel') g.add(mesh(cylGeo(0.03, 0.03, ext, 6), M.black, 0.3, WALL_H + ext / 2, 0.1));
              place(g, a.x, fy, a.z, a.rot);
            }
          }
        }
      }
      // ---- las cañerías corridas de las naves (Decor.pipes)
      if (key === 'F' || key === 'G') {
        const runs = [
          { y: 3.15, off: 0.1, r: 0.06, mat: M.metal },
          { y: 2.95, off: 0.19, r: 0.04, mat: key === 'F' ? M.copper : M.metal },
        ];
        for (const [x0, z0, x1, z1] of zoneRects(k)) {
          for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
              const i = w.idx(x, z);
              if (w.grid[i] !== FLOOR || w.zone[i] !== zid) continue;
              for (const [dx, dz] of DIRS) {
                const t = w.inside(x + dx, z + dz) ? w.grid[w.idx(x + dx, z + dz)] : 0;
                if (t !== WALL && t !== DOOR && t !== WINDOW) continue;
                const a = w.wallAnchor([x + dx, z + dz], [-dx, -dz], 0);
                const g = new THREE.Group();
                const lift = roof - w.fy[i] - WALL_H;
                for (const run of runs) g.add(mesh(cylGeo(run.r, run.r, 1.0, 8), run.mat, 0, run.y + lift, run.off, 0, 0, Math.PI / 2));
                if ((x + z) % 3 === 0) g.add(mesh(boxGeo(0.05, 0.4, 0.05), M.iron, 0, 3.05 + lift, 0.1));
                place(g, a.x, w.fy[i], a.z, a.rot);
              }
            }
          }
        }
      }
      // ---- el techo: telarañas en las esquinas y cadenas con gancho en las naves (Decor.ceiling)
      if (!Z.outdoor) {
        const [x0, z0, x1, z1] = zoneRects(k)[0];
        const fy = Z.y;
        const H = roof - fy;
        for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1 + 1, z0, -1, 1], [x0, z1 + 1, 1, -1], [x1 + 1, z1 + 1, -1, -1]]) {
          if (r() < 0.2) continue;
          const s = 0.9 + r() * 0.6;
          const web = D.atlasPlane(ATLAS.telarana, s, s);
          web.material = D.overlayMat;
          web.position.set(cx + sx * s * 0.36, fy + H - s * 0.5, cz + sz * s * 0.36);
          web.rotation.y = Math.atan2(sx, sz) + Math.PI;
          const g = new THREE.Group();
          g.add(web);
          D.add(g);
        }
        if (key === 'F' || key === 'G') {
          const n = Math.floor(((x1 - x0) * (z1 - z0)) / 30);
          for (let i = 0; i < n; i++) {
            const x = x0 + 1 + r() * (x1 - x0 - 1);
            const z = z0 + 1 + r() * (z1 - z0 - 1);
            if (busy(x, z, 0.5)) continue;
            const g = new THREE.Group();
            const len = 0.8 + r() * 0.9;
            for (let kk = 0; kk < len / 0.09; kk++) g.add(mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 8), M.iron, 0, H - 0.05 - kk * 0.09, 0, 0, kk % 2 ? Math.PI / 2 : 0, 0));
            g.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10, Math.PI * 1.3), M.iron, 0, H - len - 0.12, 0, 0, 0, Math.PI));
            place(g, x, fy, z, 0);
          }
        }
      }
      // ---- lo tirado en el piso, contra las paredes (Decor.clutter)
      const [x0, z0, x1, z1] = zoneRects(k)[0];
      const n = Math.floor(((x1 - x0 + 1) * (z1 - z0 + 1)) / 9);
      const X = D.extra;
      for (let i = 0; i < n; i++) {
        let x = x0 + r() * (x1 - x0 + 1);
        let z = z0 + r() * (z1 - z0 + 1);
        if (r() < 0.7) {
          if (r() < 0.5) x = r() < 0.5 ? x0 + r() * 1.3 : x1 + 1 - r() * 1.3;
          else z = r() < 0.5 ? z0 + r() * 1.3 : z1 + 1 - r() * 1.3;
        }
        const ci = w.idx(Math.floor(x), Math.floor(z));
        if (w.grid[ci] !== FLOOR || w.zone[ci] !== zid || w.rampAt[ci] >= 0 || busy(x, z, 0.4) || nearProp(x, z, 0.9)) continue;
        if (w.cellBoxes[ci].some((b) => b.active && b.solid && b.y1 > w.fy[ci] + 0.3)) continue;
        const g = new THREE.Group();
        const t = r();
        if (t < 0.22 && !Z.outdoor) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), M.paper);
          p.rotation.x = -Math.PI / 2;
          p.position.y = 0.006;
          g.add(p);
        } else if (t < 0.38) g.add(mesh(boxGeo(0.9 + r() * 0.5, 0.03, 0.12), M.wood, 0, 0.018, 0, 0, 0, (r() - 0.5) * 0.1));
        else if (t < 0.5) g.add(mesh(cylGeo(0.035, 0.035, 0.24, 8), r() < 0.5 ? X.bottleGreen : X.bottleBrown, 0, 0.035, 0, 0, 0, Math.PI / 2));
        else if (t < 0.6) g.add(mesh(cylGeo(0.045, 0.045, 0.12, 10), r() < 0.5 ? X.tin : X.tinRed, 0, 0.06, 0));
        else if (t < 0.72) {
          const rag = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), r() < 0.5 ? X.cloth : M.sack);
          rag.scale.set(1.2, 0.18, 0.9);
          rag.position.y = 0.03;
          g.add(rag);
        } else if (t < 0.86) g.add(mesh(new THREE.ConeGeometry(0.3 + r() * 0.2, 0.14, 10), X.yerbaPile, 0, 0.07, 0));
        else if (t < 0.95) for (let kk = 0; kk < 4; kk++) g.add(mesh(boxGeo(0.21, 0.07, 0.1), M.redPaint, (r() - 0.5) * 0.5, 0.035 + (kk > 2 ? 0.07 : 0), (r() - 0.5) * 0.5, 0, r() * 3, 0));
        else {
          g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), X.bone, 0, 0.09, 0));
          g.add(mesh(boxGeo(0.12, 0.06, 0.1), X.bone, 0, 0.03, 0.06));
          for (let kk = 0; kk < 3; kk++) g.add(mesh(cylGeo(0.02, 0.025, 0.35, 6), X.bone, (r() - 0.5) * 0.5, 0.025, (r() - 0.5) * 0.5, 0, r() * 3, Math.PI / 2));
        }
        place(g, x, w.fy[ci], z, r() * Math.PI * 2);
      }
    }
    // ---- los muebles agregados (Decor.furniture), corridos a cada sección
    for (const [type, ox, oz, rot] of MOL_FURNITURE) {
      const key = Object.keys(MOL_ROOFS).find((kk) => inBox(ox, oz, MOL_ROOFS[kk]));
      const k = K[key];
      const make = D[`f_${type}`];
      if (!k || !make) continue;
      const S = tpShift(k);
      const x = ox + S.dx;
      const z = oz + S.dz;
      if (busy(x, z, 0.6) || nearProp(x, z, 1.2)) continue;
      const g = new THREE.Group();
      const boxes = make.call(D, g) || [];
      const fy = w.floorAt(x, z, ZONES[k].y + 1);
      place(g, x, fy, z, rot);
      for (const b of boxes) {
        const rb = rotateBox(b, x, z, rot);
        w.addBox([rb[0], rb[1] + fy, rb[2], rb[3], rb[4] + fy, rb[5]], { kind: 'prop' });
      }
    }
    // ---- lo retorcido: grietas en las paredes de las naves y de la oficina
    for (const [key, n] of [['G', 2], ['F', 2], ['H', 1]]) if (K[key]) twist(w, ctx, K[key], { cracks: n, seed: 40 + n + key.charCodeAt(0) });
  });
  ctx.sec('molino:callejon', () => molinoCallejon(w, ctx, K));
}

// El callejón (N5, la zanja de vacío que main tapó entre la sala de máquinas y
// la oficina): en el molino la oficina tiene su pared del norte, acá quedó
// abierta al callejón (la baranda nomás). La pared, del lado de la oficina:
// revoque adentro, ladrillo afuera, de piso a techo, con su choque. Y lo que
// se junta en un callejón contra la pared de la sala: tachos, cajones, cubiertas.
function molinoCallejon(w, ctx, K) {
  const H = K.H;
  if (!H || !ZONES.N5) return;
  const Z = ZONES[H];
  const roof = Z.roof ?? Z.y + WALL_H;
  const zid = w.zoneKeys.indexOf(H);
  const nid = w.zoneKeys.indexOf('N5');
  const gb = new GeoBuilder();
  const [x0, z0, x1] = zoneRects(H)[0];
  for (let x = x0; x <= x1; x++) {
    const i = w.idx(x, z0);
    const j = w.idx(x, z0 - 1);
    if (w.zone[i] !== zid || w.zone[j] !== nid || w.grid[j] !== FLOOR) continue;
    const zi = z0 + 0.18;
    gb.wall(Z.wall || 'plasterOffice', x, zi, x + 1, zi, Z.y, roof, [0, 0, 1], WALL_H, x);
    gb.wall(Z.ext || 'brick', x + 1, z0, x, z0, Z.y, roof, [0, 0, -1], WALL_H, -(x + 1));
    gb.box('wallTop', x, roof - 0.02, z0, x + 1, roof + 0.06, zi, 1);
    w.addBox([x, Z.y, z0, x + 1, roof, zi], { kind: 'wall' });
  }
  ctx.ext(bake(w, gb, w.M, [], { isla: 'v5-callejon' }));
  // lo de contra la pared de la sala de máquinas (la fila del norte: quedan dos celdas de paso)
  const busy = keepOut();
  const y = ZONES.N5.y;
  for (const [type, x, z, rot] of [['firewood', 64.7, 87.5, 0], ['barrel', 68.4, 87.45, 0], ['barrel', 69.25, 87.5, 0.6], ['crates', 71.3, 87.55, 0.1], ['tires', 75.2, 87.6, 0]]) {
    if (busy(x, z, 0.5)) continue;
    placeProp(w, { type, pos: [x, z], rot, y }, 4100 + Math.round(x * 7));
  }
}

// =================== La Tapera ===================
// El patio, el establo con el pajar, los silos y los tablones de la granja
// (gA, gD, gH, gF, gT): la utilería vino transplantada, pero en la granja la
// bóveda del establo (el techo curvo de chapa con las cabeceras de tablas, las
// paredes de afuera que suben hasta la bóveda, el ojo de buey y el alero del
// anexo) y el pajar (los boxes con puertas partidas, las cabriadas, la boca
// con la roldana) los arma world/Farm.js leyendo sus PROPS 'boveda' y 'pajar'
// (solo con FEATURES.farm). Acá se llaman los mismos, con los PROPS de la
// granja (coordenadas de la granja: el alero del anexo no viene corrido en el
// config) en un mundo prestado, corridos a la sección.
function tapera(w, ctx) {
  const K = {};
  for (const k of ISLANDS.tapera.zones) if (ZONES[k]?.tp?.src === 'granja') K[ZONES[k].tp.key] = k;
  if (!K.D) return;
  ctx.sec('tapera:establo', () => {
    const S = tpShift(K.D);
    const G = MAPS.granja;
    const mine = (G.PROPS || []).filter((p) => p.type === 'boveda' || p.type === 'pajar');
    // (la bóveda y el pajar del establo: lo de la granja que cae en la sección)
    const R = [49.5, 21.5, 78.5, 40.5];
    ctx.ext(transplant(w, S, (pw) => {
      buildBovedas(pw);
      buildPajar(pw);
    }, { keep: (x, y, z) => (inBox(x, z, R) ? true : false), swap: [[PROPS, mine]], name: 'v5-establo' }).group);
    // lo retorcido: grietas en las cabeceras de tablas del establo, por dentro
    if (K.D) twist(w, ctx, K.D, { cracks: 2, seed: 61 });
  });
  // la tranquera (G5, el camino entre el corral y el patio): fardos y la carretilla
  // contra los alambrados, el paso del medio libre
  ctx.sec('tapera:tranquera', () => {
    if (!ZONES.G5) return;
    const busy = keepOut();
    const y = ZONES.G5.y;
    for (const [type, x, z, rot] of [['hay', 56.1, 230.7, 0.2], ['hay', 62.2, 235.4, 1.3], ['barrow', 57.3, 235.4, 2.2]]) {
      if (busy(x, z, 0.5)) continue;
      placeProp(w, { type, pos: [x, z], rot, y }, 5200 + Math.round(z * 3));
    }
  });
}

// =================== El Penal ===================
// Las secciones nuevas del penal vienen enteras del config (la utilería de
// penalProps, las luces, los materiales: los calabozos con la piedra gris
// piden su LOOK en layout/islas/v5_penal.py). Acá, lo retorcido: grietas en
// las paredes de las salas nuevas.
function penal(w, ctx) {
  const K = {};
  for (const k of ISLANDS.penal.zones) if (ZONES[k]?.tp?.src === 'penal') K[ZONES[k].tp.key] = k;
  ctx.sec('penal:grietas', () => {
    for (const [key, n] of [['D', 1], ['E', 1], ['F', 2], ['G', 1], ['K', 2], ['S', 1]]) if (K[key]) twist(w, ctx, K[key], { cracks: n, seed: 70 + key.charCodeAt(0) });
  });
}

// =================== armado ===================
const ISLAS = { castillo, monumento, torre, molino, tapera, penal };

export function build(w, g) {
  if (globalThis.__mduNoEclV5 === true || globalThis.__mduEclipse !== true) return;
  const orbsAll = [];
  const errs = [];
  const live = [];
  const fm = flameMaterial();
  for (const [isla, fn] of Object.entries(ISLAS)) {
    if (!ISLANDS[isla]) continue;
    const t0 = performance.now();
    const before = new Set(w.root.children);
    // (lo de adentro de la isla —las grietas, la ambientación— cuelga de acá)
    const root = new THREE.Group();
    root.name = `eclipse:v5:${isla}`;
    w.root.add(root);
    const ctx = { root, gb: new GeoBuilder(), gbExt: new GeoBuilder(), boxes: [], orbs: [], extraBuilds: [], isla, live };
    // lo que se ve desde afuera de la isla (techos, la Torre, la Proa...): siempre
    ctx.ext = (o) => {
      if (o) o.userData.ext = true;
      return o;
    };
    // (los grupos de lo de adentro de cada sala: se juntan y se esconden aparte)
    const zoneGroups = new Map();
    ctx.zone = (k) => {
      if (!zoneGroups.has(k)) {
        const g = new THREE.Group();
        g.name = `eclipse:v5:sala:${k}`;
        g.userData.zone = k;
        w.root.add(g);
        zoneGroups.set(k, g);
      }
      return zoneGroups.get(k);
    };
    ctx.sec = (name, f) => {
      try {
        f();
      } catch (e) {
        errs.push(name);
        console.error(`Eclipse v5: la sección ${name} no se armó`, e);
      }
    };
    try {
      fn(w, ctx);
    } catch (e) {
      console.error(`Eclipse v5: la isla ${isla} no se armó`, e);
    }
    try {
      if (ctx.gb.buckets.size) bake(w, ctx.gb, w.M, [], { isla: `v5-${isla}` });
      if (ctx.gbExt.buckets.size) ctx.ext(bake(w, ctx.gbExt, w.M, [], { isla: `v5-${isla}-afuera` }));
      for (const [b, mats, ext] of ctx.extraBuilds) {
        if (!b.buckets.size) continue;
        const m = b.build(mats);
        if (ext) ctx.ext(m);
        w.root.add(m);
      }
      for (const b of ctx.boxes) w.addBox(b, { kind: 'prop' });
    } catch (e) {
      console.error(`Eclipse v5: ${isla}: el horneado falló`, e);
    }
    orbsAll.push(...ctx.orbs);
    // todo junto por material: lo de afuera por un lado (siempre) y lo de
    // adentro por otro, sin sombra del sol (está bajo techo) y escondido con
    // la cámara lejos de la isla (centro.detailCuller)
    try {
      // lo de cada sala, junto y escondido con la cámara afuera de la sala
      for (const [k, zg] of zoneGroups) {
        const zj = consolidate(w, [zg], `${isla}:sala:${k}`, { shadow: false });
        const objs = [zg, zj].filter(Boolean);
        for (const o of objs) o.traverse((m) => m.isMesh && (m.castShadow = false));
        if (zj) zj.userData.zone = k;
        const cull = zoneCuller(w, k, objs);
        live.push(() => cull());
      }
      const mine = w.root.children.filter((c) => !before.has(c) && !c.userData.zone);
      const ext = mine.filter((o) => o.userData.ext);
      const int = mine.filter((o) => !o.userData.ext);
      // (lo chico de afuera —estatuas, faroles, rejas, árboles— también se
      // esconde de lejos, más lejos que lo de adentro; lo grande queda siempre)
      const small = (o) => {
        const gg = o.geometry;
        if (!gg.boundingSphere) gg.computeBoundingSphere();
        return gg.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < 3;
      };
      const sg = consolidate(w, ext, `${isla}:afuera-chico`, { filter: small });
      consolidate(w, ext, `${isla}:afuera`);
      if (sg) {
        const far = detailCuller(w, isla, [sg], 45);
        live.push(() => far());
      }
      const ig = consolidate(w, int, `${isla}:adentro`, { shadow: false });
      const hide = [ig, ...int.filter((o) => o.parent === w.root)].filter((o) => o && o.parent);
      for (const o of hide) o.traverse((m) => m.isMesh && (m.castShadow = false));
      const cull = detailCuller(w, isla, hide, 14);
      live.push(() => cull());
    } catch (e) {
      console.error(`Eclipse v5: ${isla}: no se juntó`, e);
    }
    // (lo de cada isla, para contar dibujos en las pruebas: v5Objs())
    OBJS[isla] = w.root.children.filter((c) => !before.has(c));
    MS[isla] = Math.round(performance.now() - t0);
  }
  const orb = orbsAll.length ? orbiters(w, orbsAll, { seed: 505 }) : null;
  LIVE = { orb, fm, errs, live };
  if (errs.length) globalThis.__eclV5Errs = errs;
}

export function update(dt, t) {
  if (!LIVE) return;
  LIVE.orb?.update(t);
  for (const f of LIVE.live) f(dt, t);
}

// (para la vuelta B, world/eclipse/v5b.js)
export { consolidate, zoneCuller, towerMats };
