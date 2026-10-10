import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, DOORS, RISERS, PLAYER_START } from '../../config/map';
import { ISLANDS, PORTALS, EE, LIGHTS } from '../../config/maps/eclipse';
import { buildProp } from '../props';
import { ANCHORS } from '../../entities/eclipse/Ingredientes';
import { crackMat, floorCrackMat, voidRockMat, canvasTex, detailCuller } from './centro';
import { rng } from './desgarro';
import { consolidate, zoneCuller } from './v5';

// Eclipse Matero, vuelta B del arte de las secciones (agente arte-v5,
// 2026-10-07). El usuario: "Acuérdense de decorar las zonas para que no
// parezcan habitaciones vacías gigantes y defórmenlas un poco por la
// disformidad del mapa."
//  1. LLENAR: cada zona (de todas las islas) que tiene menos de una cosa cada
//     12 m² (techada) o cada 25 m² (abierta) recibe utilería de su mapa de
//     origen y de su uso (THEMES), de los constructores que ya existen
//     (world/props.js y los registrados: penal, castillo, molino, esteros).
//     Contra las paredes (lo que cuelga, con la pared detrás) o suelto, nunca
//     en el paso entre las entradas de la zona (camino más corto entre cada
//     par de puertas/portales/escaleras, más una celda a cada lado), ni cerca
//     de lo que se usa (todo lo de g.interact: compras, máquinas, puertas,
//     mates, trampas, ingredientes), de los portales, de los aparecidos, de
//     los anclajes del easter egg ni de los lugares de las cinemáticas; cada
//     pieza se prueba: si deja una entrada o algo usable sin camino, no va.
//  2. DEFORMAR: 1 a 3 piezas por zona, al azar fijo por zona: losa levantada,
//     muebles que flotan, rincón arrancado (el vacío por la pared), techo
//     abierto (el cielo del eclipse por el cielorraso), pared vencida, viga
//     partida. Solo se ven: no chocan ni cambian el paso.
// Se arma en el primer cuadro (en el título, antes de jugar): necesita lo de
// g.interact (que se arma después del mundo); después rehace el campo de los
// muertos (computeNavBlock). Lo de adentro de cada sala, junto y escondido
// con la cámara afuera (v5.zoneCuller); lo de afuera, junto por isla y
// escondido de lejos. Lo que flota: unas pocas mallas instanciadas de todo el
// mapa, que se mueven solo cerca de la cámara.
// globalThis.__mduNoEclV5B: nada de esto (o __mduNoEclV5B = 'deforme' /
// 'llenar' para apagar solo una de las dos).

const FLOOR = 1;
const WALL = 2;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// lo que cuelga de una pared (va con la pared detrás, mirando a la sala)
const WALLY = new Set(['cartel', 'lockers', 'lavatorios', 'retrato', 'pizarra', 'cruzPared', 'vitrina', 'bookshelf', 'shelfWall', 'picture', 'toolrack', 'alacena', 'repisa', 'ristras', 'arreos', 'herramientas', 'tapiz', 'estandarte', 'armero', 'potrack', 'wardrobe', 'cabinet', 'botellero', 'perchero', 'yerbahang', 'ganchos', 'candil']);
// [tipo, peso]: lo de cada zona (su mapa de origen y su uso)
const THEMES = {
  // el castillo
  kA: [['lena', 3], ['barrel', 2], ['crates', 2], ['trineo', 1], ['tonel', 1], ['balas', 1], ['armero', 1]],
  kB: [['hay', 3], ['arreos', 2], ['saddle', 2], ['trough', 2], ['barrow', 1], ['herramientas', 1], ['balde', 1]],
  kD: [['mesaBanquete', 2], ['candelabro', 2], ['armadura', 2], ['tapiz', 1], ['estandarte', 1], ['barrica', 1], ['lena', 1]],
  kE: [['hornoBarro', 1], ['alacena', 2], ['repisa', 2], ['ristras', 2], ['barrica', 2], ['botellero', 1], ['lena', 1]],
  kL: [['armero', 2], ['balas', 2], ['barrel', 2], ['crates', 2], ['lena', 1]],
  kC: [['yunque', 1], ['fuelle', 1], ['herramientas', 2], ['lena', 2], ['barrel', 1], ['armero', 1]],
  kS: [['hay', 2], ['trough', 2], ['saddle', 1], ['lena', 2], ['barrel', 1], ['tonel', 1]],
  kO: [['escritorio', 1], ['globo', 1], ['candelabro', 2], ['atril', 1], ['chest', 2]],
  kF: [['candelabro', 3], ['banco', 2], ['atril', 1], ['estandarte', 1]],
  kK: [['armadura', 3], ['candelabro', 2], ['estandarte', 2], ['chest', 1]],
  kR: [['barrica', 3], ['tonel', 2], ['botellero', 2], ['barrel', 2], ['crates', 1]],
  kP: [['esqueleto', 2], ['grilletes', 2], ['balde', 2], ['colchon', 2], ['tachos', 1]],
  kI: [['rocaCueva', 3], ['cristales', 2]],
  kM: [['banco', 2], ['balde', 2], ['lena', 2], ['rocaCueva', 1]],
  // el penal
  pA: [['colchon', 3], ['balde', 2], ['mesaGuardia', 1], ['cartel', 2], ['lockers', 1], ['papeles', 2], ['perchero', 1], ['tachos', 1], ['bancoMadera', 2]],
  pB: [['bancoMadera', 2], ['bandejas', 2], ['tachos', 1], ['olla', 1], ['papeles', 1], ['cartel', 1]],
  pC: [['olla', 2], ['mesaCocina', 1], ['caldero', 1], ['tachos', 2], ['cajones', 2]],
  pH: [['pesas', 1], ['barras', 1], ['bancoPiedra', 2], ['tachos', 2], ['cajones', 2], ['escombros', 2]],
  pD: [['balde', 3], ['bancoMadera', 2], ['charco', 2], ['perchero', 1], ['tachos', 1]],
  pE: [['desk', 1], ['cabinet', 2], ['bookshelf', 1], ['chair', 2], ['retrato', 1], ['papeles', 2], ['pizarra', 1]],
  pF: [['camaEnf', 3], ['biombo', 2], ['vitrina', 1], ['balde', 1], ['perchero', 1], ['papeles', 1]],
  pG: [['bancoMadera', 3], ['santuario', 2], ['ofrendas', 2], ['candles', 2], ['cruzPared', 1]],
  pI: [['cajones', 2], ['bigsacks', 2], ['sacks', 2], ['barrow', 1], ['tachos', 1]],
  pS: [['yerbahang', 2], ['sacks', 2], ['bigsacks', 2], ['firewood', 2]],
  pJ: [['bitas', 2], ['sogas', 2], ['redes', 2], ['cajones', 2], ['barrel', 1]],
  pK: [['grilletes', 2], ['balde', 2], ['colchon', 2], ['cadenas', 1], ['esqueleto', 1], ['tachos', 1]],
  pT: [['cajones', 2], ['barrel', 2], ['sogas', 2], ['tachos', 1], ['crates', 1]],
  // el molino
  C: [['sacks', 3], ['bigsacks', 2], ['pallets', 2], ['crates', 2], ['barrel', 1], ['tires', 1], ['rack', 1]],
  D: [['yerbahang', 2], ['sacks', 2], ['firewood', 2], ['bigsacks', 1]],
  E: [['pew', 2], ['candles', 3], ['cross', 1]],
  F: [['crates', 2], ['barrel', 2], ['sacks', 2], ['pallets', 1]],
  G2: [['crates', 2], ['barrel', 2], ['tires', 1], ['firewood', 1]],
  nG: [['sacks', 3], ['bigsacks', 2], ['pallets', 2], ['crates', 2], ['barrel', 1], ['rack', 1]],
  nF: [['generator', 1], ['crates', 2], ['barrel', 2], ['tires', 2], ['toolrack', 2], ['rack', 1]],
  nH: [['desk', 1], ['cabinet', 2], ['armchair', 1], ['bookshelf', 1], ['chair', 2], ['picture', 2], ['wardrobe', 1]],
  nI: [['tumba', 2], ['cruces', 3], ['arbolSeco', 1], ['fosa', 1]],
  // La Tapera
  G: [['hay', 2], ['trough', 2], ['rollo', 2], ['barrow', 1], ['milkcans', 1], ['tires', 1], ['plow', 1]],
  H: [['stall', 1], ['hay', 3], ['saddle', 2], ['trough', 1], ['barrow', 1], ['milkcans', 1]],
  H2: [['table', 1], ['chair', 2], ['bed', 1], ['wardrobe', 1], ['stove', 1], ['rocker', 1], ['chest', 1], ['potrack', 1]],
  G3: [['sacks', 2], ['barrow', 1], ['yerbahang', 1], ['bigsacks', 1]],
  gA: [['firewood', 2], ['barrel', 2], ['washtub', 1], ['logseat', 2], ['tires', 1], ['milkcans', 1]],
  gD: [['hay', 3], ['saddle', 2], ['trough', 2], ['milkcans', 1], ['barrow', 1], ['stall', 1]],
  gH: [['hay', 3], ['sacks', 2]],
  gF: [['gastank', 1], ['barrel', 3], ['tires', 2], ['pallets', 2], ['sacks', 2], ['bigsacks', 1]],
  gT: [['sacks', 2], ['barrow', 2], ['bigsacks', 2], ['rollo', 1], ['cart', 1]],
  G5: [['hay', 2], ['barrow', 1]],
  // la torre
  O: [['candles', 2], ['escombros', 2], ['barrel', 1], ['crates', 1]],
  tP15: [['balas', 2], ['barrel', 2], ['crates', 2], ['escombros', 2]],
  tP14: [['santuario', 2], ['ofrendas', 3], ['candles', 3], ['cross', 1], ['pew', 2], ['retrato', 1]],
  tP13: [['pew', 3], ['candles', 3], ['ofrendas', 2], ['santuario', 1], ['cross', 1]],
  tP8: [['huerta', 2], ['zapallos', 2], ['hay', 2], ['barrow', 1], ['sacks', 2], ['yerbahang', 1]],
  // el Monumento
  mA: [['bancoPiedra', 3], ['escombros', 2], ['tachos', 1]],
  mC: [['bancoPiedra', 2], ['escombros', 2]],
  mD: [['ofrendas', 3], ['candles', 2]],
  mE: [['bancoPiedra', 2], ['escombros', 1]],
  mF: [['vitrina', 2], ['bancoMadera', 2], ['retrato', 1]],
  mG: [['bancoPiedra', 2], ['escombros', 1]],
  // el claro, la loma, la barraca, la reducción
  A: [['troncos', 3], ['logseat', 2], ['cruzCinta', 2], ['escombroRojo', 2], ['recados', 1]],
  A2: [['troncos', 2], ['cruzCinta', 2], ['escombroRojo', 2], ['logseat', 1]],
  B: [['redesPalo', 2], ['troncos', 2], ['sogas', 1], ['bitas', 1]],
  cB2: [['bigsacks', 2], ['sacks', 2], ['pallets', 1], ['crates', 2], ['barrel', 1]],
  cB3: [['sacks', 2], ['crates', 2]],
  cE2: [['pew', 2], ['candles', 3], ['cruzMision', 1]],
  cE4: [['candles', 3], ['cruzMision', 1], ['esqueleto', 1]],
  // la Disformidad
  // (mundo, it. 4: el Nudo grande; sin los cristales de hielo celestes ni troncos: piedra negra)
  U: [['escombros', 3], ['rocaCueva', 4]],
};
// las que no se llenan: el maizal (el maíz es lo suyo; nada que guíe), las escaleras y descansos
const NO_FILL = new Set(['I', 'P', 'P2', 'pP', 'I9']);
// las que no se deforman: el maizal (nada que brille ni guíe), el agua de la laguna, el pajar (techo a dos aguas), la
// casa de la tapera (su techo levantado es del arte de la isla)
const NO_DEFORM = new Set(['B', 'gH', 'H2', 'P', 'P2', 'pP', 'I', 'I9', 'U']);  // (mundo, it. 4: el Nudo, la zona central: nada flotando, todo apoyado)
// lo que no tiene que quedar cerca (además de g.interact): los mates perdidos y las trampas (entities/eclipse)
const MATES = [[126.5, 177.5], [40.3, 111.2], [105.5, 237.5], [120.5, 336.5], [307.5, 247.5], [238.5, 113.5], [186.3, 49.3]];
// (arte6: las nuevas, corridas a lo llano; entities/eclipse/Trampas.js SPOTS)
const TRAMPAS = globalThis.__mduOldTrampas === true ? [[135.5, 167], [40.5, 94.5], [43.5, 241], [142.5, 305], [299.5, 241], [284, 94.5], [152.5, 33]] : [[143.5, 166.5], [35.5, 94.5], [46, 231.5], [143, 300.5], [299.5, 241], [281.5, 94.5], [152.5, 33]];

let W = null;
let LIVE = null;
const OFF = () => globalThis.__mduNoEclV5B;

export function build(w) {
  if (OFF() === true || globalThis.__mduEclipse !== true) return;
  W = w;
  LIVE = { built: false, culls: [], floats: null };
}

export function update(dt, t) {
  if (!LIVE) return;
  if (!LIVE.built) {
    const g = W.g;
    // (cuando ya está lo usable: g.interact y el easter egg)
    if (!g?.interact?.list?.length || !g.ee || !W.navBlock) return;
    LIVE.built = true;
    try {
      armar(W, g);
    } catch (e) {
      console.error('Eclipse v5b: no se armó', e);
    }
    // (las mallas con sus triángulos de ceilY: no hacen falta más)
    CEIL_C = null;
  }
  for (const c of LIVE.culls) c();
  LIVE.floats?.update(t);
  LIVE.props?.update(t);
}

// ---------------- lo que no se tapa ----------------
function keepPoints(w, g) {
  const K = [];
  const add = (x, z, r) => Number.isFinite(x) && Number.isFinite(z) && K.push([x, z, r]);
  for (const it of g.interact.list) if (it.pos) add(it.pos.x, it.pos.z, /perk|box|power|pap|machine|wall|buy/i.test(it.kind || '') ? 2.2 : 1.8);
  for (const d of DOORS) for (const [x, z] of d.cells) add(x + 0.5, z + 0.5, 1.2);
  for (const p of PORTALS) for (const e of [p.a, p.b]) add(e.pos[0], e.pos[1], 3.2);
  for (const r of RISERS) add(r.pos[0], r.pos[1], 1.3);
  for (const L of LIGHTS) if (L.tag) add(L.pos[0], L.pos[2], 2.0);
  // los lugares de las cinemáticas: 4,5 m
  for (const k of ['algarrobo', 'fogon', 'llama', 'corte']) if (EE?.[k]) add(EE[k][0], EE[k][1], 4.5);
  for (const L of LIGHTS) if (L.tag === 'nudo') add(L.pos[0], L.pos[2], 4.5);
  add(PLAYER_START.x, PLAYER_START.z, 2);
  const pt = (v) => (Array.isArray(v) ? add(v[0], v[1], 1.6) : v && Number.isFinite(v.x) && add(v.x, v.z, 1.6));
  for (const [k, v] of Object.entries(ANCHORS || {})) {
    if (k === 'islands') continue;
    if (Array.isArray(v) && (Array.isArray(v[0]) || v[0]?.isVector3 || v[0]?.pos)) for (const q of v) pt(q.pos || q);
    else pt(v?.pos || v);
  }
  for (const [x, z] of MATES) add(x, z, 1.6);
  // (arte6: la trampa nueva marca 3,6 m y su ancla va afuera del círculo)
  for (const [x, z] of TRAMPAS) add(x, z, globalThis.__mduOldTrampas === true ? 2.2 : 4.6);
  return (x, z, rad = 0) => K.some(([px, pz, r]) => (x - px) ** 2 + (z - pz) ** 2 < (r + rad) ** 2);
}

// ---------------- armado ----------------
function armar(w, g) {
  const off = OFF();
  const busy = keepPoints(w, g);
  // las cajas de utilería que ya hay, por zona (la misma cuenta de t_dens)
  const have = {};
  for (const b of w.boxes) {
    if (!b.active || b.kind !== 'prop') continue;
    const x = Math.floor((b.x0 + b.x1) / 2);
    const z = Math.floor((b.z0 + b.z1) / 2);
    if (!w.inside(x, z)) continue;
    const i = w.idx(x, z);
    if (w.zone[i] < 0 || Math.abs(b.y0 - w.fy[i]) > 1.2) continue;
    const k = w.zoneKeys[w.zone[i]];
    have[k] = (have[k] || 0) + 1;
  }
  const floats = [];
  const added = {};
  const infos = new Map();
  LAST.props = [];
  for (const [isla, I] of Object.entries(ISLANDS)) {
    // (mundo, it. 4: La Disformidad, la dimensión de afuera, ni se llena ni se deforma: tiene lo suyo)
    if (isla === 'abismo' || isla === 'grietas') continue;
    const out = new THREE.Group();
    out.name = `eclipse:v5b:${isla}:afuera`;
    w.root.add(out);
    const zones = I.zones.filter((k) => ZONES[k] && !ZONES[k].frag);
    for (const k of zones) {
      const Z = ZONES[k];
      // (cada zona, su grupo: adentro se ve con la cámara en la sala; afuera, a 20 m)
      const zg = zoneGroup(w, k);
      const info = zoneInfo(w, k, busy);
      if (!info) continue;
      // (primero la deformación: aparta su lugar —info.reserved— y el relleno no lo toca)
      try {
        if (off !== 'deforme' && !NO_DEFORM.has(k)) deform(w, k, info, busy, zg, floats);
      } catch (e) {
        console.error(`Eclipse v5b: ${k}: no se deformó`, e);
      }
      infos.set(k, [info, zg]);
    }
    // por isla: al menos 2 rincones arrancados en las paredes de afuera (vistas
    // desde los patios) y un techo abierto en una techada
    if (off !== 'deforme') {
      const have2 = (kind, outd) => (w.v5bDeform || []).filter((d) => d[1] === kind && ZONES[d[0]]?.isla === isla && !!ZONES[d[0]].outdoor === outd).length;
      const order = [...infos.keys()].filter((k) => !NO_DEFORM.has(k)).sort((a, b) => infos.get(b)[0].cells.size - infos.get(a)[0].cells.size);
      for (const k of order.filter((k) => ZONES[k].outdoor)) {
        if (have2('rincon', true) >= 2) break;
        try {
          deform(w, k, infos.get(k)[0], busy, infos.get(k)[1], floats, 'rincon');
        } catch (e) {
          console.error(`Eclipse v5b: ${k}: rincón`, e);
        }
      }
      for (const k of order.filter((k) => !ZONES[k].outdoor)) {
        if (have2('techo', false) >= 1) break;
        try {
          deform(w, k, infos.get(k)[0], busy, infos.get(k)[1], floats, 'techo');
        } catch (e) {
          console.error(`Eclipse v5b: ${k}: techo`, e);
        }
      }
    }
    for (const [k, [info, zg]] of infos) {
      try {
        if (off !== 'llenar' && !NO_FILL.has(k)) added[k] = fill(w, k, info, busy, have[k] || 0, zg);
      } catch (e) {
        console.error(`Eclipse v5b: ${k}: no se llenó`, e);
      }
    }
    infos.clear();
    // lo de afuera, junto por isla y escondido de lejos
    const og = consolidate(w, [out], `v5b:${isla}:afuera`);
    const objs = [out, og].filter(Boolean);
    LIVE.culls.push(detailCuller(w, isla, objs, 50));
  }
  // lo de adentro de cada sala, junto y escondido con la cámara afuera
  for (const [k, zg] of ZG) {
    const zj = consolidate(w, [zg], `v5b:sala:${k}`, ZONES[k].outdoor ? {} : { shadow: false });
    const objs = [zg, zj].filter(Boolean);
    const outdoor = !!ZONES[k].outdoor;
    if (!outdoor) for (const o of objs) o.traverse((m) => m.isMesh && (m.castShadow = false));
    // (adentro, 4 m de margen: desde la puerta se ve adentro; más lejos, las paredes lo tapan)
    LIVE.culls.push(zoneCuller(w, k, objs, outdoor ? 20 : 4));
  }
  ZG.clear();
  if (floats.length) LIVE.floats = floaters(w, floats);
  if (LAST.props.length) LIVE.props = propFloaters(w, LAST.props);
  LIVE.culls.push(...(LIVE.props?.culls || []));
  w.v5bAdded = added;
  // los muertos ven lo nuevo
  w.computeNavBlock();
}
const ZG = new Map();
function zoneGroup(w, k) {
  if (!ZG.has(k)) {
    const g = new THREE.Group();
    g.name = `eclipse:v5b:sala:${k}`;
    w.root.add(g);
    ZG.set(k, g);
  }
  return ZG.get(k);
}

// Las celdas de la zona, sus entradas, el paso entre ellas y lo que queda libre.
function zoneInfo(w, k, busy) {
  const Z = ZONES[k];
  const zid = w.zoneKeys.indexOf(k);
  if (zid < 0) return null;
  const cells = new Set();
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [rx0, rz0, rx1, rz1] of Z.rects) {
    for (let z = rz0; z <= rz1; z++) for (let x = rx0; x <= rx1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR || w.zone[i] !== zid) continue;
      cells.add(i);
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
  }
  if (!cells.size) return null;
  // las entradas: celdas de la zona pegadas a una puerta, a una rampa, a otra zona
  // o a un portal (por ahí se entra y se sale)
  const ent = new Set();
  for (const i of cells) {
    const x = i % w.W;
    const z = (i - x) / w.W;
    if (w.rampAt[i] >= 0) ent.add(i);
    for (const [dx, dz] of D4) {
      if (!w.inside(x + dx, z + dz)) continue;
      const j = w.idx(x + dx, z + dz);
      const t = w.grid[j];
      if (t === 3 || (t === FLOOR && w.zone[j] !== zid) || (t === FLOOR && w.rampAt[j] >= 0)) ent.add(i);
    }
  }
  for (const p of PORTALS) for (const e of [p.a, p.b]) if (e.zone === k) ent.add(w.idx(Math.floor(e.pos[0]), Math.floor(e.pos[1])));
  const walk = (i, blocked) => cells.has(i) && !w.navBlock[i] && !blocked.has(i);
  // de cada tramo de entrada (celdas seguidas), una sola: la del medio
  const reps = [];
  const seen = new Set();
  for (const i0 of ent) {
    if (seen.has(i0)) continue;
    const comp = [i0];
    seen.add(i0);
    for (let h = 0; h < comp.length; h++) {
      for (const [dx, dz] of [...D4, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const j = comp[h] + dx + dz * w.W;
        if (ent.has(j) && !seen.has(j)) {
          seen.add(j);
          comp.push(j);
        }
      }
    }
    const fr = comp.filter((i) => !w.navBlock[i]);
    if (fr.length) reps.push(fr[Math.floor(fr.length / 2)]);
  }
  // y lo que se usa adentro de la zona (máquinas, compras, mates...): la celda libre de al lado
  for (const it of w.g?.interact?.list || []) {
    if (!it.pos) continue;
    const cx = Math.floor(it.pos.x);
    const cz = Math.floor(it.pos.z);
    if (!w.inside(cx, cz)) continue;
    let best = -1;
    for (const [dx, dz] of [[0, 0], ...D4]) {
      if (!w.inside(cx + dx, cz + dz)) continue;
      const j = w.idx(cx + dx, cz + dz);
      if (cells.has(j) && !w.navBlock[j]) {
        best = j;
        break;
      }
    }
    if (best >= 0 && Math.abs(w.fy[best] - it.pos.y) < 2.5) reps.push(best);
  }
  const E = [...new Set(reps)];
  const bfs = (from, blocked) => {
    const prev = new Map([[from, -1]]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const [dx, dz] of D4) {
        const j = i + dx + dz * w.W;
        if (prev.has(j) || !walk(j, blocked)) continue;
        prev.set(j, i);
        q.push(j);
      }
    }
    return prev;
  };
  // el paso: el camino más corto entre cada par (más una celda a cada lado)
  const path = new Set();
  for (const a of E) {
    const prev = bfs(a, new Set());
    for (const b of E) {
      if (b === a || !prev.has(b)) continue;
      for (let i = b; i !== -1; i = prev.get(i)) path.add(i);
    }
  }
  // (adentro, el camino mismo: lo que se pone va contra las paredes; afuera,
  // el camino y una celda a cada lado)
  const forbid = new Set();
  for (const i of path) {
    forbid.add(i);
    if (Z.outdoor) for (const [dx, dz] of D4) forbid.add(i + dx + dz * w.W);
  }
  return { Z, zid, cells, ent: E, forbid, reserved: new Set(), box: [x0, z0, x1, z1], bfs, walk };
}

// ---------------- 1. llenar ----------------
function fill(w, k, info, busy, have, zg) {
  const { Z, cells, forbid } = info;
  const per = Z.outdoor ? 25 : 12;
  const need = Math.ceil((cells.size / per) * 1.15) - have;
  if (need <= 0) return 0;
  const theme = THEMES[k] || THEMES[Z.isla === 'castillo' ? 'kA' : Z.isla === 'penal' ? 'pA' : Z.isla === 'molino' ? 'C' : Z.isla === 'tapera' ? 'G' : Z.isla === 'torre' ? 'O' : Z.isla === 'monumento' ? 'mA' : 'A'];
  const total = theme.reduce((s, [, p]) => s + p, 0);
  const r = rng(9001 + [...k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const pick = (wally) => {
    for (let n = 0; n < 12; n++) {
      let q = r() * total;
      for (const [t, p] of theme) {
        q -= p;
        if (q <= 0) {
          if (!wally && WALLY.has(t)) break;
          return t;
        }
      }
    }
    return theme.find(([t]) => !WALLY.has(t))?.[0] || null;
  };
  // las celdas que sirven: de la zona, libres, lejos del paso y de lo que se usa;
  // abiertas: a una celda de las barandas (las barandas no se tocan)
  const nearRail = (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!w.inside(x + dx, z + dz)) return true;
      const j = w.idx(x + dx, z + dz);
      if (w.grid[j] !== FLOOR && w.grid[j] !== WALL) return true;
      if (w.grid[j] !== FLOOR && w.edge[j] !== 0) return true;
    }
    return false;
  };
  const wallDir = (x, z) => {
    for (const [dx, dz] of D4) {
      if (!w.inside(x + dx, z + dz)) continue;
      const j = w.idx(x + dx, z + dz);
      if (w.grid[j] === WALL && w.edge[j] === 0 && w.top[j] - w.fy[w.idx(x, z)] > 1.9) return [dx, dz];
    }
    return null;
  };
  const mine = new Set();
  const ok = (i) => cells.has(i) && !forbid.has(i) && !info.reserved.has(i) && !w.navBlock[i] && !mine.has(i) && w.rampAt[i] < 0 && !rampNear(i);
  // (ni al pie ni en la boca de una escalera)
  function rampNear(i) {
    for (const [dx, dz] of D4) if (w.rampAt[i + dx + dz * w.W] >= 0) return true;
    return false;
  }
  const nearPath = (i, d) => {
    for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (forbid.has(i + dx + dz * w.W)) return true;
    return false;
  };
  const cand = [];
  for (const i of cells) {
    if (!ok(i)) continue;
    const x = i % w.W;
    const z = (i - x) / w.W;
    if (busy(x + 0.5, z + 0.5, 0.5)) continue;
    if (Z.outdoor && nearRail(x, z)) continue;
    const wd = wallDir(x, z);
    // (adentro, lo suelto también contra las paredes: el medio de la sala queda para caminar;
    // en las salas grandes, algo en el medio lejos del paso)
    if (!Z.outdoor && !wd && nearPath(i, cells.size < 150 ? 1 : 2)) continue;
    cand.push([i, x, z, wd]);
  }
  for (let n = cand.length - 1; n > 0; n--) {
    const j = Math.floor(r() * (n + 1));
    [cand[n], cand[j]] = [cand[j], cand[n]];
  }
  // (primero las de pared; en las salas grandes, una de cada tres en el medio:
  // que no quede un salón vacío con todo contra las paredes)
  const wallC = cand.filter((c) => c[3]);
  const midC = cand.filter((c) => !c[3]);
  cand.length = 0;
  const big = !Z.outdoor && cells.size >= 120;
  while (wallC.length || midC.length) {
    if (wallC.length) cand.push(wallC.shift());
    if (wallC.length && !big) cand.push(wallC.shift());
    if (midC.length && (big || !wallC.length)) cand.push(midC.shift());
  }
  let placed = 0;
  const why = { cand: cand.length, need, tipo: 0, prop: 0, celdas: 0, paso: 0 };
  (w.v5bWhy ||= {})[k] = why;
  for (const [i, x, z, wd] of cand) {
    if (placed >= need) break;
    if (!ok(i)) continue;
    const type = pick(!!wd);
    const wally = WALLY.has(type);
    if (!type || (wally && !wd)) {
      why.tipo++;
      continue;
    }
    let px = x + 0.5;
    let pz = z + 0.5;
    let rot;
    if (wd) {
      // de espaldas a la pared, arrimado
      rot = Math.atan2(-wd[0], -wd[1]);
      px += wd[0] * (wally ? 0.42 : 0.15);
      pz += wd[1] * (wally ? 0.42 : 0.15);
    } else rot = Math.floor(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.5;
    const res = buildProp({ type, pos: [px, pz], rot, y: w.fy[i] }, w.M, 7000 + i);
    if (!res) {
      why.prop++;
      (why.faltan ||= new Set()).add(type);
      continue;
    }
    // las celdas que tapa: todas tienen que servir
    const cov = new Set();
    let bad = false;
    for (const b of res.boxes) {
      for (let cz = Math.floor(b[2] + 0.05); cz <= Math.floor(b[5] - 0.05) && !bad; cz++) {
        for (let cx = Math.floor(b[0] + 0.05); cx <= Math.floor(b[3] - 0.05); cx++) {
          if (!w.inside(cx, cz)) { bad = true; break; }
          const j = w.idx(cx, cz);
          if (w.grid[j] === WALL) continue;
          if (!ok(j) || busy(cx + 0.5, cz + 0.5, 0.2)) { bad = true; break; }
          if (Z.outdoor && nearRail(cx, cz)) { bad = true; break; }
          cov.add(j);
        }
      }
      if (b[4] > (Z.roof ?? Z.y + 3.6) - 0.05 && !Z.outdoor) bad = true;
    }
    if (bad) {
      why.celdas++;
      continue;
    }
    // que todas las entradas sigan unidas
    if (cov.size && !connected(w, info, new Set([...mine, ...cov]))) {
      why.paso++;
      continue;
    }
    for (const j of cov) mine.add(j);
    for (const b of res.boxes) w.addBox(b, { kind: 'prop', firm: !!res.firm });
    // (lo que no choca —velas, ofrendas, papeles— también cuenta como cosa: t_dens)
    if (!res.boxes.length) (w.v5bCount ||= {})[k] = (w.v5bCount[k] || 0) + 1;
    zg.add(res.obj);
    (w.v5bPlaced ||= []).push([k, type, +px.toFixed(2), +pz.toFixed(2)]);
    placed++;
  }
  return placed;
}
function connected(w, info, blocked) {
  const E = info.ent.filter((i) => !blocked.has(i));
  if (E.length < info.ent.length) return false;
  if (E.length < 2) return true;
  const prev = info.bfs(E[0], blocked);
  return E.every((i) => prev.has(i));
}

// ---------------- 2. deformar ----------------
let MATS = null;
function mats(w) {
  if (MATS) return MATS;
  // el vacío por un agujero: violeta oscuro con estrellas, borde dentado que brilla
  const hole = (sky) => canvasTex(256, 256, (x, W2, H2) => {
    const r = rng(sky ? 515 : 414);
    x.clearRect(0, 0, W2, H2);
    const pts = [];
    const n = 22;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = 0.36 + r() * 0.12 + (k % 3 === 0 ? 0.04 : 0);
      pts.push([W2 / 2 + Math.cos(a) * rr * W2, H2 / 2 + Math.sin(a) * rr * H2]);
    }
    x.save();
    x.beginPath();
    pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    x.clip();
    const gr = x.createRadialGradient(W2 / 2, H2 / 2, 4, W2 / 2, H2 / 2, W2 * 0.5);
    gr.addColorStop(0, sky ? '#2a0e4a' : '#140826');
    gr.addColorStop(0.7, sky ? '#110520' : '#06020e');
    gr.addColorStop(1, '#7a3ad0');
    x.fillStyle = gr;
    x.fillRect(0, 0, W2, H2);
    for (let k = 0; k < 40; k++) {
      x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      x.fillRect(r() * W2, r() * H2, 1.5, 1.5);
    }
    if (sky) {
      // el eclipse asomando: el anillo de oro
      x.strokeStyle = 'rgba(255,190,90,0.85)';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(W2 * 0.58, H2 * 0.45, W2 * 0.08, 0, Math.PI * 2);
      x.stroke();
    }
    x.restore();
    // el borde quebrado que brilla
    for (const [lw, a] of [[10, 0.25], [4, 0.6], [1.5, 1]]) {
      x.strokeStyle = `rgba(200,150,255,${a})`;
      x.lineWidth = lw;
      x.beginPath();
      pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
      x.stroke();
    }
  });
  const basic = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  MATS = { hole: basic(hole(false)), sky: basic(hole(true)) };
  return MATS;
}
// El material de una pieza con un poco de luz violeta propia (que se lea de lejos).
const VIO = new Map();
function vio(m, k = 0.55) {
  const key = `${m.uuid}|${k}`;
  if (!VIO.has(key)) {
    const c = m.clone();
    c.emissive = new THREE.Color(0x5a1aa8);
    c.emissiveIntensity = k;
    VIO.set(key, c);
  }
  return VIO.get(key);
}
// las piezas, al azar fijo por zona
const LAST = { at: null };
const PIECES_IN = ['losa', 'flotan', 'rincon', 'techo', 'vencida', 'viga'];
const PIECES_OUT = ['losa', 'flotan', 'rincon', 'losa', 'flotan'];
function deform(w, k, info, busy, zg, floats, force = null) {
  const { Z, cells } = info;
  const r = rng(4243 + [...k].reduce((a, c) => a * 37 + c.charCodeAt(0), 3));
  const n = force ? 1 : cells.size < 40 ? 1 : cells.size < 250 ? 2 : 3;
  const pool = force ? [force] : [...(Z.outdoor ? PIECES_OUT : PIECES_IN)];
  const gone = new Set();
  const free = (i, rad = 0.6) => {
    if (!cells.has(i) || w.rampAt[i] >= 0 || Math.abs(w.fy[i] - Z.y) > 0.3) return false;
    const x = i % w.W;
    const z = (i - x) / w.W;
    return !busy(x + 0.5, z + 0.5, rad);
  };
  const list = [...cells];
  const any = (test) => {
    for (let t = 0; t < 60; t++) {
      const i = list[Math.floor(r() * list.length)];
      if (test(i)) return i;
    }
    return -1;
  };
  let done = 0;
  for (let tries = 0; tries < (force ? 3 : 10) && done < n; tries++) {
    const kind = pool[Math.floor(r() * pool.length)];
    if (!force && gone.has(kind) && tries < 8) continue;
    let okp = false;
    LAST.floats = floats;
    LAST.zg = zg;
    // (las piezas sueltas de la losa, con nombre: ui/eclipseSableTrip las
    // esconde del otro lado del desgarro, el Monumento sin eclipse)
    const kids0 = zg.children.length;
    if (kind === 'losa') {
      okp = losa(w, info, zg, r, any, free);
      for (let c = kids0; c < zg.children.length; c++) zg.children[c].name ||= 'eclipse:v5b:flotan:losa';
    } else if (kind === 'flotan') okp = flotan(w, info, r, any, free, floats);
    else if (kind === 'rincon') okp = rincon(w, info, zg, r, any, free, floats);
    else if (kind === 'techo') okp = techo(w, info, zg, r, any, free, floats);
    else if (kind === 'vencida') okp = vencida(w, info, zg, r, any, free);
    else if (kind === 'viga') okp = viga(w, info, zg, r, any, free);
    if (okp) {
      gone.add(kind);
      done++;
      (w.v5bDeform ||= []).push([k, kind, ...(LAST.at || [])]);
    }
  }
}
// (lo de las paredes, solo donde la sala tiene fondo: 4 celdas de la zona hacia
// adentro; en los pasillos angostos —los calabozos— tapaba el paso a la vista)
function deep(w, i, Z, info) {
  const d = wallOf(w, i, Z);
  if (!d) return false;
  // (y a lo largo de la pared, 2 celdas a cada lado: el ancho de la pieza)
  const al = d[1] + d[0] * w.W;
  for (const q of [-2, -1, 0, 1, 2]) if (railNear(w, i + al * q) || railNear(w, i + al * q + d[0] + d[1] * w.W)) return false;
  for (let k = 1; k <= 4; k++) if (!info.cells.has(i - (d[0] + d[1] * w.W) * k)) return false;
  return true;
}
// ¿la celda (o una vecina) da a una baranda o al vacío? (ahí no va nada: las barandas no se tocan)
function railNear(w, i) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const j = i + dx + dz * w.W;
    if (w.grid[j] === 0 || (w.grid[j] !== FLOOR && w.edge[j] !== 0)) return true;
  }
  return false;
}
const cellXZ = (w, i) => {
  const x = i % w.W;
  return [x, (i - x) / w.W];
};
// la cara de pared de una celda (la primera pared alta a su lado)
function wallOf(w, i, Z) {
  const [x, z] = cellXZ(w, i);
  for (const [dx, dz] of D4) {
    if (!w.inside(x + dx, z + dz)) continue;
    const j = w.idx(x + dx, z + dz);
    if (w.grid[j] === WALL && w.edge[j] === 0 && w.top[j] - w.fy[i] > 2.6) return [dx, dz];
  }
  void Z;
  return null;
}
// Losa levantada: un pedazo del piso partido, levantado de un lado, con la
// grieta violeta abajo (sin choque; fuera del paso).
function losa(w, info, zg, r, any, free) {
  const { Z, forbid } = info;
  const sx = 2 + Math.floor(r() * 2);
  const sz = 2 + Math.floor(r() * 2);
  const i0 = any((i) => {
    const [x, z] = cellXZ(w, i);
    for (let dz = 0; dz < sz; dz++) for (let dx = 0; dx < sx; dx++) {
      if (!w.inside(x + dx, z + dz)) return false;
      const j = w.idx(x + dx, z + dz);
      if (!free(j, 0.8) || forbid.has(j) || w.navBlock[j] || railNear(w, j)) return false;
    }
    return true;
  });
  if (i0 < 0) return false;
  const [x, z] = cellXZ(w, i0);
  LAST.at = [x + 0.5, z + 0.5];
  for (let dz = 0; dz < sz; dz++) for (let dx = 0; dx < sx; dx++) info.reserved.add(w.idx(x + dx, z + dz));
  const fy = w.fy[i0];
  const mat = w.M[Z.floor] || w.M.concrete;
  const geo = new THREE.BoxGeometry(sx - 0.15, 0.18, sz - 0.15);
  // (las uv como el piso: 2 m)
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (sx / 2), uv.getY(k) * (sz / 2));
  const m = new THREE.Mesh(geo, mat);
  const alongX = r() < 0.5;
  const tilt = (0.16 + r() * 0.1) * (r() < 0.5 ? 1 : -1);
  m.position.set(x + sx / 2, fy + 0.02 + (alongX ? Math.abs(Math.sin(tilt)) * sz : Math.abs(Math.sin(tilt)) * sx) * 0.5 * 0.6, z + sz / 2);
  if (alongX) m.rotation.x = tilt;
  else m.rotation.z = tilt;
  m.castShadow = true;
  m.receiveShadow = true;
  zg.add(m);
  // la grieta abajo, que brilla por la junta
  const c = new THREE.Mesh(new THREE.PlaneGeometry(sx + 0.4, sz + 0.4).rotateX(-Math.PI / 2), floorCrackMat());
  c.position.set(x + sx / 2, fy + 0.012, z + sz / 2);
  c.rotation.y = r() * 3;
  c.renderOrder = 2;
  zg.add(c);
  // cascotes que se despegan de la losa
  for (let k2 = 0; k2 < 4; k2++) LAST.floats?.push({ kind: 'roca', c: [x + sx / 2 + (r() - 0.5) * sx, fy + 0.6 + r() * 1.2, z + sz / 2 + (r() - 0.5) * sz], ph: r() * 6.3, sp: 0.12 + r() * 0.2, s: 0.4 + r() * 0.4, up: 1 });
  return true;
}
// Muebles que flotan: 2-3 cosas reconocibles de la zona (una silla, un balde,
// un cajón, un fardo, una cruz, un banco, un barril) a 1,5-2,5 m, inclinadas,
// girando despacio, con un halo violeta tenue en el piso.
const FLOAT_KINDS = {
  castillo: ['chair', 'balde', 'barrel', 'cross', 'crates'],
  penal: ['bancoMadera', 'balde', 'chair', 'crates'],
  molino: ['crates', 'barrel', 'chair', 'balde'],
  tapera: ['hay', 'balde', 'crates'],
  torre: ['cross', 'chair', 'bancoMadera', 'balde'],
  monumento: ['chair', 'bancoMadera', 'crates'],
  centro: ['crates', 'barrel', 'cross', 'balde'],
  desgarro: ['crates', 'barrel', 'chair'],
};
function flotan(w, info, r, any, free, floats) {
  // (lejos del paso: dos celdas a cada lado; lo que flota no se cruza con nadie)
  const away = (i) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (info.forbid.has(i + dx + dz * w.W)) return false;
    return true;
  };
  const i0 = any((i) => free(i, 1.0) && away(i) && !railNear(w, i));
  if (i0 < 0) return false;
  const [x, z] = cellXZ(w, i0);
  LAST.at = [x + 0.5, z + 0.5];
  const fy = w.fy[i0];
  const Z = info.Z;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) info.reserved.add(i0 + dx + dz * w.W);
  const kinds = FLOAT_KINDS[Z.isla] || FLOAT_KINDS.centro;
  const ceil = Z.outdoor ? fy + 6 : ceilY(w, x + 0.5, z + 0.5, fy, Z.roof ?? fy + 3.6);
  const top = Math.min(2.5, ceil - fy - 1.1);
  if (top < 1.4) return false;
  const m = 2 + Math.floor(r() * 2);
  const used = new Set();
  for (let k = 0; k < m; k++) {
    let type = kinds[Math.floor(r() * kinds.length)];
    if (used.has(type)) type = kinds[(kinds.indexOf(type) + 1) % kinds.length];
    used.add(type);
    const a = (k / m) * Math.PI * 2 + r();
    (LAST.props ||= []).push({ isla: Z.isla, type, c: [x + 0.5 + Math.cos(a) * 0.9, fy + 1.5 + r() * Math.max(0.1, top - 1.5), z + 0.5 + Math.sin(a) * 0.9], fy, ph: r() * 6.3, sp: 0.12 + r() * 0.15, tx: (r() - 0.5) * 0.9, tz: (r() - 0.5) * 0.9 });
  }
  return true;
}
// Rincón arrancado: un tramo de pared con el vacío por el agujero y piedras
// que se salen girando (la pared de Levels queda: no se pasa).
function rincon(w, info, zg, r, any, free, floats) {
  const { Z } = info;
  const i0 = any((i) => free(i, 1.2) && deep(w, i, Z, info) && wallRun(w, info, i, wallOf(w, i, Z), 2, { clearFront: 'soft' }));
  if (i0 < 0) return false;
  const [x, z] = cellXZ(w, i0);
  LAST.at = [x + 0.5, z + 0.5];
  const [dx, dz] = wallOf(w, i0, Z);
  LAST.at = [x + 0.5, z + 0.5, dx, dz];
  reserveRun(w, info, i0, [dx, dz], 2, Z.outdoor ? 3 : 2);
  const fy = w.fy[i0];
  const h = Z.outdoor ? Math.min(3.4, w.top[i0 + dx + dz * w.W] - fy - 0.3) : Math.min(3.0, (Z.roof ?? fy + 3.6) - fy - 0.3);
  const wd = 2.5 + r() * 1.0;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(wd, h), mats(w).hole);
  p.position.set(x + 0.5 + dx * 0.49, fy + 0.2 + h / 2, z + 0.5 + dz * 0.49);
  p.rotation.y = Math.atan2(-dx, -dz);
  p.renderOrder = 3;
  zg.add(p);
  // las piedras que se salen del agujero
  for (let k = 0; k < (Z.outdoor ? 13 : 9); k++) {
    // (adentro, pegados a la pared: a menos de 0,35 m no llega nadie)
    const d = Z.outdoor ? 0.15 + r() * 1.6 : 0.05 + r() * 0.25;
    // (lo que se aleja de la pared, arriba de las cabezas)
    const yy = d > 0.3 ? fy + 2.3 + r() * Math.max(0.4, h - 1.6) : fy + 0.5 + r() * h * 0.9;
    floats.push({ kind: k % 3 ? 'roca' : 'ladrillo', c: [x + 0.5 + dx * (0.45 - d) + (dz ? (r() - 0.5) * wd * 0.8 : 0), yy, z + 0.5 + dz * (0.45 - d) + (dx ? (r() - 0.5) * wd * 0.8 : 0)], ph: r() * 6.3, sp: 0.2 + r() * 0.3, s: 0.7 + r() * 0.6, up: 0 });
  }
  return true;
}
// Techo abierto: el cielo del eclipse por un agujero del cielorraso y los
// cascotes que suben.
function techo(w, info, zg, r, any, free, floats) {
  const { Z } = info;
  if (Z.outdoor) return false;
  const i0 = any((i) => free(i, 1.0) && !wallOf(w, i, Z));
  if (i0 < 0) return false;
  const [x, z] = cellXZ(w, i0);
  LAST.at = [x + 0.5, z + 0.5];
  const fy = w.fy[i0];
  const roof = ceilY(w, x + 0.5, z + 0.5, fy, w.roofC?.[i0] > 0 ? w.roofC[i0] : Z.roof ?? fy + 3.6);
  const s = 2.4 + r() * 1.4;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(Math.PI / 2), mats(w).sky);
  p.position.set(x + 0.5, roof - 0.015, z + 0.5);
  p.rotation.y = r() * 3;
  p.renderOrder = 3;
  zg.add(p);
  for (let k = 0; k < 6; k++) floats.push({ kind: 'roca', c: [x + 0.5 + (r() - 0.5) * s * 0.7, fy + 1.9 + r() * Math.max(0.3, roof - fy - 2.4), z + 0.5 + (r() - 0.5) * s * 0.7], ph: r() * 6.3, sp: 0.1 + r() * 0.2, s: 0.35 + r() * 0.35, up: 1 });
  return true;
}
// (un tramo de pared seguido: `half` celdas a cada lado de i, todas de la zona,
// con pared alta detrás —ni puertas ni ventanas—, sin nada en la celda de
// adelante y fuera del paso)
const DBG = { res: 0, forbid: 0, nav: 0, cell: 0, wall: 0 };
function reserveRun(w, info, i, d, half, depth = 2) {
  const al = d[1] + d[0] * w.W;
  const st = -(d[0] + d[1] * w.W);
  for (let q = -half; q <= half; q++) for (let k = 0; k < depth; k++) info.reserved.add(i + al * q + st * k);
}
function wallRun(w, info, i, d, half, { clearFront = true } = {}) {
  const al = d[1] + d[0] * w.W;
  const back = d[0] + d[1] * w.W;
  const fy = w.fy[i];
  for (let q = -half; q <= half; q++) {
    const c = i + al * q;
    if (!info.cells.has(c) || Math.abs(w.fy[c] - fy) > 0.05 || w.rampAt[c] >= 0) return (DBG.cell++, false);
    const j = c + back;
    if (w.grid[j] !== WALL || w.edge[j] !== 0 || w.top[j] - fy < 2.6) return (DBG.wall++, false);
    if (info.reserved.has(c)) return (DBG.res++, false);
    // (soft: el paso sí —lo que se pone queda a menos de 0,35 m de la pared, donde nadie llega—)
    if (clearFront === true && info.forbid.has(c)) return (DBG.forbid++, false);
    if (clearFront && w.navBlock[c]) return (DBG.nav++, false);
  }
  return true;
}
// Pared vencida: una copia de la cara de la pared (3-4 m de tramo, de piso a
// techo, el mismo material) que se vino 6-9° hacia la sala desde la base, con
// la franja de ladrillos/revoque roto abajo, la raja violeta en la junta de
// arriba (y el vacío que se ve por el hueco de costado) y cascotes al pie.
function vencida(w, info, zg, r, any, free) {
  const { Z } = info;
  const wd = 3 + r();
  const half = 2;
  const D = ((w.v5bDbg ||= {}).vencida ||= { free: 0, wall: 0, deep: 0, run: 0 });
  w.v5bDbg.run = DBG;
  const i0 = any((i) => {
    if (!free(i, 1.0)) return false;
    D.free++;
    if (!wallOf(w, i, Z)) return false;
    D.wall++;
    if (!deep(w, i, Z, info)) return false;
    D.deep++;
    if (!wallRun(w, info, i, wallOf(w, i, Z), half, { clearFront: 'soft' })) return false;
    D.run++;
    return true;
  });
  if (i0 < 0) return false;
  const [x, z] = cellXZ(w, i0);
  const [dx, dz] = wallOf(w, i0, Z);
  LAST.at = [x + 0.5, z + 0.5, dx, dz];
  reserveRun(w, info, i0, [dx, dz], half, 2);
  const fy = w.fy[i0];
  const top = ceilY(w, x + 0.5, z + 0.5, fy, Z.roof ?? fy + 3.6);
  const h = Math.max(2.4, top - fy - 0.12);
  const wall = w.M[Z.wall] || w.M.plasterWhite || w.M.concrete;
  const g = new THREE.Group();
  // (la base contra la cara de la pared, mirando a la sala: +z del grupo)
  g.position.set(x + 0.5 + dx * 0.47, fy, z + 0.5 + dz * 0.47);
  g.rotation.y = Math.atan2(-dx, -dz);
  const geo = new THREE.BoxGeometry(wd, h, 0.16).translate(0, h / 2, 0.08);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (wd / 2), uv.getY(k) * (h / 3.6));
  const tilt = (7.5 + r() * 1.5) * (Math.PI / 180);
  const panel = new THREE.Group();
  panel.rotation.x = tilt;
  const m = new THREE.Mesh(geo, wall);
  m.castShadow = true;
  m.receiveShadow = true;
  panel.add(m);
  // la franja rota de la base: ladrillos sueltos asomando (del lado de la sala)
  const brick = w.M.brick || w.M.stoneDark || wall;
  for (let k = 0; k < Math.round(wd * 5); k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.24 + r() * 0.06, 0.08, 0.12), brick);
    b.position.set(-wd / 2 + 0.12 + r() * (wd - 0.24), 0.04 + Math.floor(r() * 4) * 0.085, 0.17 + r() * 0.05);
    b.rotation.set((r() - 0.5) * 0.3, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3);
    b.castShadow = true;
    panel.add(b);
  }
  // el borde que brilla: arriba y a los costados del tramo que se despegó
  const edge = vio(w.M.stoneDark || wall, 1.4);
  const eb = (bw, bh, ex, ey) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), edge);
    b.position.set(ex, ey, 0.175);
    panel.add(b);
  };
  eb(wd, 0.05, 0, h - 0.025);
  eb(0.05, h * 0.9, -wd / 2 + 0.025, h * 0.5);
  eb(0.05, h * 0.9, wd / 2 - 0.025, h * 0.5);
  // la grieta que corre por la pared vencida
  const cr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, h * 0.85), crackMat());
  cr.position.set((r() - 0.5) * wd * 0.5, h * 0.5, 0.17);
  cr.renderOrder = 2;
  panel.add(cr);
  g.add(panel);
  // la junta de arriba: el vacío que se ve detrás (por la cuña) y la raja que brilla
  const gapW = Math.sin(tilt) * h;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(wd, h * 0.9), mats(w).hole);
  back.position.set(0, h * 0.55, 0.012);
  back.renderOrder = 3;
  g.add(back);
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(wd + 0.2, gapW + 0.25).rotateX(-Math.PI / 2), crackMat());
  seam.position.set(0, h - 0.05, gapW / 2);
  seam.renderOrder = 2;
  g.add(seam);
  for (const s2 of [-1, 1]) {
    // los costados de la cuña (triángulos que brillan)
    const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0), new THREE.Vector3(0, h * Math.cos(tilt), gapW)]);
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0.5, 1, 1, 1], 2));
    tri.computeVertexNormals();
    const t = new THREE.Mesh(tri, crackMat());
    t.position.x = s2 * (wd / 2 + 0.01);
    t.renderOrder = 2;
    g.add(t);
  }
  // la grieta del piso y los cascotes al pie
  const c = new THREE.Mesh(new THREE.PlaneGeometry(wd + 0.4, 0.9).rotateX(-Math.PI / 2), floorCrackMat());
  c.position.set(0, 0.012, 0.35);
  c.renderOrder = 2;
  g.add(c);
  for (let k = 0; k < 10; k++) {
    const s = 0.08 + r() * 0.14;
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), k % 2 ? brick : wall);
    b.position.set(-wd / 2 + r() * wd, s * 0.6, 0.3 + r() * 0.7);
    b.rotation.set(r() * 3, r() * 3, r() * 3);
    b.castShadow = true;
    g.add(b);
  }
  zg.add(g);
  return true;
}
// Viga partida: la viga de lado a lado de la sala, partida al medio. La mitad
// de la pared A queda arriba (apenas caída); la de la pared B se vino abajo
// colgando de su apoyo, 25-35° de la vertical, con la punta a ~1 m del piso;
// astillas y la luz violeta en la quebradura.
function viga(w, info, zg, r, any, free) {
  const { Z, cells, forbid } = info;
  if (Z.outdoor) return false;
  const pick = any((i) => {
    if (!free(i, 1.0)) return false;
    const d = wallOf(w, i, Z);
    if (!d || railNear(w, i)) return false;
    // la luz de la sala a lo largo de -d, hasta la pared de enfrente
    const st = -(d[0] + d[1] * w.W);
    let n = 0;
    let c = i;
    while (cells.has(c) && n < 16) {
      if (Math.abs(w.fy[c] - w.fy[i]) > 0.05) return false;
      n++;
      c += st;
    }
    if (n < 5 || n > 14 || w.grid[c] !== WALL) return false;
    // la punta cae cerca del medio: ni en el paso ni encima de algo
    const tip = i + st * Math.round(n / 2);
    for (const q of [tip, tip + st, tip - st]) if (info.reserved.has(q) || forbid.has(q) || w.navBlock[q] || w.cellBoxes[q].some((b) => b.active && b.kind === 'prop')) return false;
    VIGA.n = n;
    VIGA.tip = tip;
    VIGA.st = st;
    return true;
  });
  if (pick < 0) return false;
  const n = VIGA.n;
  for (const q of [VIGA.tip, VIGA.tip + VIGA.st, VIGA.tip - VIGA.st]) info.reserved.add(q);
  const [x, z] = cellXZ(w, pick);
  const [dx, dz] = wallOf(w, pick, Z);
  LAST.at = [x + 0.5, z + 0.5, dx, dz, n];
  const fy = w.fy[pick];
  const roof = ceilY(w, x + 0.5 - dx * 0.4, z + 0.5 - dz * 0.4, fy, Z.roof ?? fy + 3.6);
  if (roof - fy < 3.0) return false;
  LAST.at.push(+roof.toFixed(2));
  const bm = w.M.beam || w.M.woodDark;
  const hot = vio(bm, 1.1);
  const g = new THREE.Group();
  // (el grupo en la pared A, +z hacia la pared B)
  g.position.set(x + 0.5 + dx * 0.5, roof - 0.2, z + 0.5 + dz * 0.5);
  g.rotation.y = Math.atan2(-dx, -dz);
  const span = n;
  const mid = span * (0.42 + r() * 0.16);
  const T = 0.3;
  const H = 0.36;
  // la mitad de A: casi horizontal, la punta apenas caída
  const a = new THREE.Mesh(new THREE.BoxGeometry(T, H, mid).translate(0, 0, mid / 2), bm);
  a.rotation.x = 0.06;
  g.add(a);
  // la de B: cuelga de su apoyo en la pared B
  const len = span - mid;
  const drop = roof - fy - 1.15;
  // (25-35° de la vertical; si la sala es baja, más tendida)
  let ang = Math.acos(Math.min(0.999, drop / len));
  ang = Math.max(25 * (Math.PI / 180), Math.min(55 * (Math.PI / 180), ang));
  // (que la punta no se meta en el piso: la mitad caída se partió más corta)
  const len2 = Math.min(len, (roof - fy - 0.95) / Math.cos(ang));
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, span);
  // del apoyo hacia A y para abajo: -z del pivote, rotado
  pivot.rotation.x = -(Math.PI / 2 - ang);
  const bgeo = new THREE.BoxGeometry(T * 0.95, H * 0.95, len2).translate(0, 0, -len2 / 2);
  const b = new THREE.Mesh(bgeo, bm);
  pivot.add(b);
  // las astillas de las dos puntas de la quebradura, con la luz violeta
  const splinters = (parent, z0, dir) => {
    for (let k = 0; k < 7; k++) {
      const L = 0.25 + r() * 0.45;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05 + r() * 0.05, 0.05 + r() * 0.05, L).translate(0, 0, (dir * L) / 2), k < 3 ? hot : bm);
      s.position.set((r() - 0.5) * T * 0.8, (r() - 0.5) * H * 0.8, z0);
      s.rotation.set((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0);
      parent.add(s);
    }
    const glow = new THREE.Mesh(new THREE.BoxGeometry(T * 1.02, H * 1.02, 0.08), hot);
    glow.position.set(0, 0, z0 - dir * 0.04);
    parent.add(glow);
    for (const ry of [0, Math.PI / 2]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), crackMat());
      c.position.set(0, 0, z0 + dir * 0.05);
      c.rotation.set(0, ry, Math.PI / 4);
      c.renderOrder = 2;
      parent.add(c);
    }
  };
  splinters(a, mid, 1);
  splinters(pivot, -len2, -1);
  g.add(pivot);
  // los apoyos: una ménsula de piedra en cada pared
  const st = w.M.stoneDark || w.M.stoneWall || bm;
  for (const zz of [0.15, span - 0.15]) {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), st);
    mm.position.set(0, -0.32, zz);
    g.add(mm);
  }
  g.traverse((o) => {
    if (o.isMesh && o.material !== hot && !o.material.transparent) o.castShadow = o.receiveShadow = true;
  });
  // astillas que flotan debajo de la quebradura
  const wp = new THREE.Vector3(0, -1.0, mid).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
  for (let k2 = 0; k2 < 4; k2++) LAST.floats?.push({ kind: 'tabla', c: [wp.x + (r() - 0.5) * 1.0, wp.y - r() * 0.6, wp.z + (r() - 0.5) * 1.0], ph: r() * 6.3, sp: 0.12 + r() * 0.2, s: 0.35 + r() * 0.25, up: 0 });
  zg.add(g);
  return true;
}
const VIGA = { n: 0, tip: -1, st: 0 };

// El techo de verdad arriba de (x, z): el arte de algunas islas pone un
// cielorraso más bajo que el techo de la zona (el molino: chapa a 3,6 m). Un
// rayo para arriba contra lo que hay (solo al armar, pocas veces).
const _rc = new THREE.Raycaster();
// (agente rend, 2026-10-06) el rayo contra todo w.root probaba triángulo por
// triángulo las mallas grandes fundidas (la roca de abajo, 341 mil): 4,5-6,2 s
// en UN cuadro, al elegir el mapa y al salir al menú. El rayo va derecho para
// arriba: cada malla guarda sus triángulos (en el mundo) por casillas de 2 m y
// se prueban solo los de la casilla de (x, z), con el mismo criterio de lado
// que el Raycaster (FrontSide: solo los que miran para abajo). Las instanciadas,
// con el Raycaster de siempre si su caja cruza el tramo. Se arma una vez por
// mundo y se suelta al terminar armar(). globalThis.__mduNoV5bCeilBox: como antes
let CEIL_C = null;
const _cb = new THREE.Box3();
const CC = 2;
function ceilCands(w) {
  if (CEIL_C?.w === w) return CEIL_C.list;
  const list = [];
  w.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  w.root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) {
      if (o.isInstancedMesh) {
        if (!o.boundingBox) o.computeBoundingBox();
        _cb.copy(o.boundingBox).applyMatrix4(o.matrixWorld);
      } else {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _cb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      }
      list.push({ o, ray: true, x0: _cb.min.x, x1: _cb.max.x, y0: _cb.min.y, y1: _cb.max.y, z0: _cb.min.z, z1: _cb.max.z });
      return;
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _cb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    list.push({ o, ray: false, grid: null, x0: _cb.min.x, x1: _cb.max.x, y0: _cb.min.y, y1: _cb.max.y, z0: _cb.min.z, z1: _cb.max.z, v });
  });
  CEIL_C = { w, list };
  return list;
}
// los triángulos de una malla, en el mundo, por casilla (se arma al primer uso)
function ceilGrid(c) {
  const o = c.o;
  const G = o.geometry;
  const P = G.attributes.position;
  const ix = G.index;
  const m = o.matrixWorld.elements;
  const nV = P.count;
  const W3 = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    W3[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    W3[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    W3[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  // los tramos que se dibujan (grupos con su material, drawRange), como el Raycaster
  const mats = Array.isArray(o.material) ? o.material : null;
  const dr = G.drawRange;
  const nIdx = ix ? ix.count : nV;
  const ranges = [];
  if (mats && G.groups.length) for (const gr of G.groups) { const mt = mats[gr.materialIndex]; if (mt) ranges.push([Math.max(gr.start, dr.start), Math.min(nIdx, gr.start + gr.count, dr.start + dr.count), mt.side]); }
  else if (!mats) ranges.push([Math.max(0, dr.start), Math.min(nIdx, dr.start + dr.count), o.material.side]);
  const cells = new Map();
  const tris = [];
  for (const [a0, a1, side] of ranges) {
    for (let k = a0; k + 2 < a1 + 0; k += 3) {
      const ia = ix ? ix.getX(k) : k, ib = ix ? ix.getX(k + 1) : k + 1, ic = ix ? ix.getX(k + 2) : k + 2;
      const t = tris.length;
      tris.push([ia, ib, ic, side]);
      const xs = [W3[ia * 3], W3[ib * 3], W3[ic * 3]];
      const zs = [W3[ia * 3 + 2], W3[ib * 3 + 2], W3[ic * 3 + 2]];
      const cx0 = Math.floor(Math.min(...xs) / CC), cx1 = Math.floor(Math.max(...xs) / CC);
      const cz0 = Math.floor(Math.min(...zs) / CC), cz1 = Math.floor(Math.max(...zs) / CC);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const key = cx * 100000 + cz;
        let L = cells.get(key);
        if (!L) cells.set(key, (L = []));
        L.push(t);
      }
    }
  }
  c.grid = { W3, tris, cells };
  return c.grid;
}
// el rayo vertical desde (x, ya, z) contra la malla: la altura del primer
// triángulo que corta entre ya y yb (o Infinity)
function ceilHit(c, x, z, ya, yb) {
  const { W3, tris, cells } = c.grid || ceilGrid(c);
  const L = cells.get(Math.floor(x / CC) * 100000 + Math.floor(z / CC));
  if (!L) return Infinity;
  let best = Infinity;
  for (const t of L) {
    const [ia, ib, ic, side] = tris[t];
    const ax = W3[ia * 3], ay = W3[ia * 3 + 1], az = W3[ia * 3 + 2];
    const bx = W3[ib * 3], by = W3[ib * 3 + 1], bz = W3[ib * 3 + 2];
    const cx = W3[ic * 3], cy = W3[ic * 3 + 1], cz = W3[ic * 3 + 2];
    // la normal (sin normalizar): su y dice para dónde mira el triángulo
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny === 0) continue;
    // FrontSide: el rayo (para arriba) pega solo de frente: normal para abajo
    if (side === THREE.FrontSide && ny > 0) continue;
    if (side === THREE.BackSide && ny < 0) continue;
    // ¿(x, z) adentro del triángulo en planta? (baricéntricas)
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (d === 0) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const y = l1 * ay + l2 * by + l3 * cy;
    if (y >= ya && y <= yb && y < best) best = y;
  }
  return best;
}
function ceilY(w, x, z, fy, fallback) {
  _rc.set(new THREE.Vector3(x, fy + 2.0, z), new THREE.Vector3(0, 1, 0));
  _rc.far = Math.max(1, fallback - fy);
  _rc.camera = w.g.camera;
  const skip = (o) => /v5b/.test(o.parent?.name || '') || o.visible === false || !o.layers.test(_rc.layers);
  if (globalThis.__mduNoV5bCeilBox !== true) {
    const ya = fy + 2.0;
    const yb = ya + _rc.far;
    let best = Infinity;
    const objs = [];
    for (const c of ceilCands(w)) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1 || c.y1 < ya || c.y0 > yb || skip(c.o)) continue;
      if (c.ray) objs.push(c.o);
      else best = Math.min(best, ceilHit(c, x, z, ya, yb));
    }
    if (objs.length) {
      const h = _rc.intersectObjects(objs, false)[0];
      if (h) best = Math.min(best, h.point.y);
    }
    return best < Infinity ? best : fallback;
  }
  const hit = _rc.intersectObjects(w.root.children, true).find((h) => h.object.isMesh && !/v5b/.test(h.object.parent?.name || '') && h.object.visible !== false);
  return hit ? hit.point.y : fallback;
}

// Las cosas que flotan (muebles reconocibles): cada clase armada una vez con su
// constructor (world/props.js y los registrados), junta por material, centrada;
// por isla, una malla instanciada por clase y material, y una de halos violetas.
function propFloaters(w, list) {
  const CAT = new Map();
  const cat = (type) => {
    if (CAT.has(type)) return CAT.get(type);
    const res = buildProp({ type, pos: [0, 0], rot: 0, y: 0 }, w.M, 77);
    const parts = [];
    if (res) {
      res.obj.updateMatrixWorld(true);
      const by = new Map();
      res.obj.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return;
        let gg = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (gg.index) gg = gg.toNonIndexed();
        for (const nm of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) gg.deleteAttribute(nm);
        if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
        if (!by.has(o.material)) by.set(o.material, []);
        by.get(o.material).push(gg);
      });
      const box = new THREE.Box3();
      const merged = [...by].map(([m, L]) => [m, mergeGeometries(L, false)]).filter(([, gg]) => gg);
      for (const [, gg] of merged) {
        gg.computeBoundingBox();
        box.union(gg.boundingBox);
      }
      const c = box.getCenter(new THREE.Vector3());
      for (const [m, gg] of merged) parts.push([m, gg.translate(-c.x, -c.y, -c.z)]);
    }
    CAT.set(type, parts);
    return parts;
  };
  // el halo: un disco con el violeta que se apaga hacia el borde
  const haloTex = canvasTex(64, 64, (x, W2, H2) => {
    const gr = x.createRadialGradient(W2 / 2, H2 / 2, 2, W2 / 2, H2 / 2, W2 / 2);
    gr.addColorStop(0, 'rgba(170,90,255,0.55)');
    gr.addColorStop(0.5, 'rgba(120,50,220,0.22)');
    gr.addColorStop(1, 'rgba(60,20,120,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, W2, H2);
  });
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const haloGeo = new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const place = (f, t) => {
    v.set(f.c[0], f.c[1] + Math.sin(t * f.sp * 2.2 + f.ph) * 0.12, f.c[2]);
    q.setFromEuler(e.set(f.tx + Math.sin(t * f.sp + f.ph) * 0.15, f.ph + t * f.sp, f.tz + Math.cos(t * f.sp * 0.8 + f.ph) * 0.15));
    m4.compose(v, q, one);
  };
  const sets = [];
  const culls = [];
  const byIsla = {};
  for (const f of list) (byIsla[f.isla] ||= []).push(f);
  for (const [isla, L] of Object.entries(byIsla)) {
    const grp = new THREE.Group();
    grp.name = `eclipse:v5b:${isla}:flotan`;
    w.root.add(grp);
    const byType = {};
    for (const f of L) (byType[f.type] ||= []).push(f);
    for (const [type, F] of Object.entries(byType)) {
      for (const [mat, geo] of cat(type)) {
        const im = new THREE.InstancedMesh(geo, mat, F.length);
        F.forEach((f, i) => {
          place(f, 0);
          im.setMatrixAt(i, m4);
        });
        im.castShadow = false;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        grp.add(im);
        sets.push([im, F]);
      }
    }
    const halo = new THREE.InstancedMesh(haloGeo, haloMat, L.length);
    L.forEach((f, i) => halo.setMatrixAt(i, m4.makeTranslation(f.c[0], f.fy + 0.02, f.c[2])));
    halo.renderOrder = 2;
    halo.computeBoundingSphere();
    grp.add(halo);
    culls.push(detailCuller(w, isla, [grp], 45));
  }
  const cam = new THREE.Vector3();
  return {
    culls,
    update(t) {
      const c = w.g?.camera;
      if (!c) return;
      c.getWorldPosition(cam);
      for (const [im, F] of sets) {
        if (!im.parent?.visible) continue;
        let dirty = false;
        for (let i = 0; i < F.length; i++) {
          const f = F[i];
          if ((f.c[0] - cam.x) ** 2 + (f.c[2] - cam.z) ** 2 > 2500) continue;
          place(f, t);
          im.setMatrixAt(i, m4);
          dirty = true;
        }
        if (dirty) {
          im.instanceMatrix.needsUpdate = true;
        }
      }
    },
  };
}

// Lo que flota (todas las islas): una malla instanciada por clase; se mueve
// solo lo que está cerca de la cámara.
function floaters(w, list) {
  const M = w.M;
  const chair = mergeGeometries([
    new THREE.BoxGeometry(0.42, 0.05, 0.42).translate(0, 0.45, 0),
    ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([a, b]) => new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(a, 0.225, b)),
    new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(0, 0.68, -0.19),
  ]).translate(0, -0.4, 0);
  const KINDS = {
    silla: [chair, M.wood || M.woodDark],
    balde: [new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10, 1, true), M.metal || M.iron],
    cajon: [new THREE.BoxGeometry(0.5, 0.35, 0.4), M.wood || M.woodDark],
    tabla: [new THREE.BoxGeometry(1.2, 0.04, 0.18), M.woodDark || M.wood],
    roca: [new THREE.DodecahedronGeometry(0.22, 0), voidRockMat(w)],
    ladrillo: [new THREE.BoxGeometry(0.26, 0.09, 0.13), M.brick || M.stoneDark || voidRockMat(w)],
  };
  const by = {};
  for (const f of list) (by[f.kind] ||= []).push(f);
  const ims = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (f, t) => {
    const yy = f.up ? ((t * f.sp * 0.5 + f.ph) % 1.6) - 0.8 : Math.sin(t * f.sp * 2 + f.ph) * 0.15;
    v.set(f.c[0] + Math.sin(t * f.sp + f.ph) * 0.12, f.c[1] + yy, f.c[2] + Math.cos(t * f.sp * 0.8 + f.ph) * 0.12);
    q.setFromEuler(e.set(f.ph + t * f.sp * 0.7, f.ph * 2 + t * f.sp, f.ph * 0.5));
    m4.compose(v, q, s.set(f.s, f.s, f.s));
  };
  for (const [k, L] of Object.entries(by)) {
    const [geo, mat] = KINDS[k];
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach((f, i) => {
      place(f, 0);
      im.setMatrixAt(i, m4);
    });
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = true;
    im.name = `eclipse:v5b:flotan:${k}`;
    w.root.add(im);
    ims.push([im, L]);
  }
  const cam = new THREE.Vector3();
  return {
    update(t) {
      const c = w.g?.camera;
      if (!c) return;
      c.getWorldPosition(cam);
      for (const [im, L] of ims) {
        let dirty = false;
        for (let i = 0; i < L.length; i++) {
          const f = L[i];
          if ((f.c[0] - cam.x) ** 2 + (f.c[2] - cam.z) ** 2 > 3600) continue;
          place(f, t);
          im.setMatrixAt(i, m4);
          dirty = true;
        }
        if (dirty) im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
