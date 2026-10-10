import * as THREE from 'three';
import { MAP_W, MAP_H, PLAYER_START, ZONES, RAMPS } from '../config/map';
import { VOID_Y } from '../config/maps/eclipse';
import { buildEclipseRock } from './eclipseRock';
import { buildEclipseIslands } from './eclipseIslands';
import { buildEclipseGfx } from './eclipseGfx';
import { moodPrep } from './eclipseMood';
import { dedupeEclipse } from './eclipseDedupe';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// "Eclipse Matero": islas que flotan sobre el vacío. Las alturas, los choques
// y por dónde se pasa los pone world/Levels.js; acá van los ganchos que le
// dicen que afuera de las islas no hay suelo, y lo que cuida que nada se
// quede cayendo para siempre.
//
// (Por ahora la arquitectura es la de bloques de Levels: pisos, paredes,
// barandas y escaleras. Lo propio de cada isla se arma después, encima.)

const OUT = 0;
const FLOOR = 1;
const WALL = 2;
// Los huecos cerrados adentro de una isla (celdas que no son piso rodeadas de
// piso: el medio de la cripta de Belgrano, la zanja entre dos zonas pegadas) no
// son vacío: en los mapas de origen todo lo que no es piso es sólido, y acá el
// vacío se colaba por ahí y se veía "a través del mapa" (el usuario, 2026-10-06).
// Hasta este tamaño se rellenan con un bloque sólido (más grandes: el ojo de la
// galería de la torre, la zanja de la loma, quedan como pozos a propósito).
// globalThis.__mduNoEclHoles: como antes (vacío).
const HOLE_MAX = 40;
// cuánto baja el terreno pegado a las islas mientras Levels arma las caras de
// las paredes y los cordones (las dibuja hasta el terreno de al lado: con el
// vacío de verdad salían faldones de sesenta metros). Después del armado, lo
// de afuera pasa al fondo del vacío (buildEclipseOutside).
const SKIRT = 1.5;
// abajo de esto (o afuera de la grilla) el jugador vuelve al claro
const FALL_Y = -10;

export function installEclipseHooks(w) {
  // (sin rejas de cárcel en las ventanas)
  w.noBars = true;

  // afuera de la grilla: el vacío
  w.outY = () => VOID_Y;
  // Las celdas de afuera: un escalón abajo del piso más cercano (el que ya
  // les dejó Levels en w.ty). Las paredes quedan a la altura de su piso.
  w.terrain = () => {
    // (acá World ya marcó como pared toda celda de afuera pegada a un piso: lo
    // que queda OUT adentro de una isla es un pozo de verdad)
    if (globalThis.__mduNoEclHoles !== true) fillHoles(w);
    for (let i = 0; i < MAP_W * MAP_H; i++) if (w.grid[i] === OUT) w.ty[i] -= SKIRT;
  };
  // la barranca de la laguna no lleva baranda: uno se tira al agua (ni la caja
  // ni el dibujo de la de hierro; tampoco al costado de la playa, que baja al
  // agua). globalThis.__mduNoLagoonRail: la baranda dibujada, como antes
  const lagoon = w.zoneKeys.indexOf('B');
  const wet = (k) => w.zone[k] === lagoon || (w.rampAt[k] >= 0 && RAMPS[w.rampAt[k]]?.own === 'playa');
  w.dropOk = (i, j) => wet(i) || wet(j);
  // (celdas donde la piedra del Monumento (world/eclipse/v5.js: el pedestal del
  // coloso de la Proa, el borde del espejo del Pasaje) ocupa el borde: ahí la
  // baranda de Levels sobraba y la atravesaba; arte-v5, 2026-10-07)
  const NO_RAIL = new Set([324 + 234 * MAP_W, 254 + 238 * MAP_W]);
  w.dropEdge = (w2, gb, i, ax, az, ya, bx, bz, yb, dx, dz) => (globalThis.__mduNoLagoonRail !== true && wet(i + dx + dz * MAP_W)) || NO_RAIL.has(i);
}

// Marca como bloque (WALL) las regiones de celdas OUT que no llegan al borde de
// la grilla y son chicas; deja la lista para taparlas con geometría después.
function fillHoles(w) {
  const n = MAP_W * MAP_H;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  // 1) lo que toca el borde de la grilla es el vacío de verdad
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (seen[i] || w.grid[i] !== OUT) return;
    seen[i] = 1;
    q[tail++] = i;
  };
  for (let x = 0; x < MAP_W; x++) {
    push(x);
    push((MAP_H - 1) * MAP_W + x);
  }
  for (let z = 0; z < MAP_H; z++) {
    push(z * MAP_W);
    push(z * MAP_W + MAP_W - 1);
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % MAP_W;
    if (x > 0) push(i - 1);
    if (x < MAP_W - 1) push(i + 1);
    if (i >= MAP_W) push(i - MAP_W);
    if (i < n - MAP_W) push(i + MAP_W);
  }
  // 2) cada región OUT que quedó sin ver es un hueco cerrado
  const holes = (w.eclipseHoles = []);
  for (let s = 0; s < n; s++) {
    if (seen[s] || w.grid[s] !== OUT) continue;
    const cells = [];
    head = 0;
    tail = 0;
    seen[s] = 1;
    q[tail++] = s;
    while (head < tail) {
      const i = q[head++];
      cells.push(i);
      const x = i % MAP_W;
      for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i >= MAP_W ? i - MAP_W : -1, i < n - MAP_W ? i + MAP_W : -1]) {
        if (j < 0 || seen[j] || w.grid[j] !== OUT) continue;
        seen[j] = 1;
        q[tail++] = j;
      }
    }
    if (cells.length > HOLE_MAX) continue;
    // la zona de al lado: el piso más cercano, a través del anillo de pared
    // que World ya marcó (hasta tres celdas)
    let zk = -1;
    // (sesión 1f: y todas las zonas que lo rodean: un hueco entre el claro y la
    // loma, 3 m más alta, quedaba tapado hasta el piso del claro y entre el
    // bloque y el pie del muro de la loma se veía el vacío —"el borde que se
    // ve a través del mapa en el comienzo"—. El bloque sube hasta la más alta.)
    const around = new Set();
    let ring = cells.slice();
    const vis = new Set(cells);
    for (let step = 0; step < 3; step++) {
      const next = [];
      for (const i of ring) {
        const x = i % MAP_W;
        for (const j of [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i >= MAP_W ? i - MAP_W : -1, i < n - MAP_W ? i + MAP_W : -1]) {
          if (j < 0 || vis.has(j)) continue;
          vis.add(j);
          if (w.grid[j] === FLOOR) {
            if (zk < 0) zk = w.zone[j];
            around.add(w.zone[j]);
            continue;
          }
          next.push(j);
        }
      }
      ring = next;
      if (zk >= 0 && globalThis.__mduOldHoles === true) break;
    }
    for (const i of cells) w.grid[i] = WALL;
    holes.push({ cells, zone: zk, around: [...around] });
  }
}

// Los bloques que tapan los huecos cerrados: una caja por celda, del piso de la
// zona de al lado (menos un metro) hasta su techo (o el piso, si es abierta),
// con el material de afuera de esa zona.
function buildHoleBlocks(w) {
  const holes = w.eclipseHoles || [];
  if (!holes.length) return;
  const byMat = new Map();
  for (const h of holes) {
    const k = w.zoneKeys[h.zone];
    const Z = ZONES[k];
    if (!Z) continue;
    const mat = w.M[Z.ext] || w.M[Z.cliff] || w.M[Z.wall] || w.M.rock || w.M.ground;
    let y0 = Z.y - 1.2;
    let y1 = Z.roof ?? Z.y;
    if (globalThis.__mduOldHoles !== true) {
      for (const zi of h.around || []) {
        const Z2 = ZONES[w.zoneKeys[zi]];
        if (!Z2) continue;
        y0 = Math.min(y0, Z2.y - 1.2);
        // (hasta el pie del muro de la otra, que baja 0,9 m: el muro se sigue viendo)
        y1 = Math.max(y1, Z2.roof ?? Z2.y - 0.8);
      }
    }
    if (!(y1 > y0)) continue;
    let list = byMat.get(mat);
    if (!list) byMat.set(mat, (list = []));
    for (const i of h.cells) {
      const x = i % MAP_W;
      const z = (i - x) / MAP_W;
      const g = new THREE.BoxGeometry(1, y1 - y0, 1);
      g.translate(x + 0.5, (y0 + y1) / 2, z + 0.5);
      list.push(g);
      w.ty[i] = y1;
    }
  }
  for (const [mat, geos] of byMat) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, mat);
    m.name = 'eclipse:huecos';
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    w.root.add(m);
  }
}

export function buildEclipseOutside(w) {
  // el vacío de verdad: lo que no es isla ni borde no tiene suelo
  for (let i = 0; i < MAP_W * MAP_H; i++) if (w.grid[i] === OUT) w.ty[i] = VOID_Y;
  // los huecos cerrados, tapados con bloque
  if (globalThis.__mduNoEclHoles !== true) buildHoleBlocks(w);
  // la roca de cada isla: la repisa irregular de alrededor y la masa que
  // cuelga abajo (world/eclipseRock.js; globalThis.__mduNoEclipseRock: sin roca)
  if (globalThis.__mduNoEclipseRock !== true) buildEclipseRock(w);
  // (lo que quemaba en blanco, antes de fundir el arte: world/eclipseMood.js)
  if (globalThis.__mduNoEclMood !== true) moodPrep(w);
  // el arte de cada isla (world/eclipseIslands.js, un modulo por isla)
  const live = buildEclipseIslands(w);
  // la pasada gráfica: luz, faroles, roca (world/eclipseGfx.js; __mduNoEclGfx: sin ella)
  if (globalThis.__mduNoEclGfx !== true) live.push(buildEclipseGfx(w));
  // las caras repetidas en el mismo plano (titilaban): world/eclipseDedupe.js
  try {
    dedupeEclipse(w);
  } catch (e) {
    console.error('dedupe', e);
  }
  const prev = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    for (const m of live) m.update(dt, t);
    // el cielo sigue a la cámara: el domo mide 300 m y la cámara ve hasta 400;
    // mirando al vacío desde arriba, la parte de abajo quedaba más lejos que
    // eso y se veía un disco negro debajo de las islas
    const cam = w.g.camera;
    if (w.sky && cam) w.sky.position.copy(cam.position);
    rescue(w);
    sweep(w);
  };
}

// La red de seguridad: el que se cae al desgarro vuelve al claro.
function rescue(w) {
  const g = w.g;
  const P = g.player;
  if (!P || g.state !== 'playing' || P.ride) return;
  const outside = P.pos.x < -3 || P.pos.x > MAP_W + 3 || P.pos.z < -3 || P.pos.z > MAP_H + 3;
  if (P.pos.y > FALL_Y && !outside) return;
  const x = PLAYER_START.x;
  const z = PLAYER_START.z;
  P.pos.set(x, ZONES.A.y, z);
  P.vel?.set(0, 0, 0);
  g.post?.flash?.(0.3);
  g.hud?.subtitle?.('El desgarro te devolvió al claro.', 2.5);
}

// Los muertos van pegados al piso de su celda: uno que quedó sobre una celda
// de vacío (un empujón, una explosión) aparece de golpe en el fondo. Ese
// vuelve a la cola de la ronda, sin puntos (lo decide el anfitrión).
function sweep(w) {
  const g = w.g;
  if (g.state !== 'playing' || (g.net && !g.net.host) || !g.zombies?.pool) return;
  let n = 0;
  for (const z of g.zombies.pool) {
    if (!z.active || z.dead || z.boss || z.pos.y > FALL_Y) continue;
    g.zombies.free(z);
    n++;
  }
  if (n) g.rounds?.requeue?.(n);
}
