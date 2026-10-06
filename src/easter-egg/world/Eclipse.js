import { MAP_W, MAP_H, PLAYER_START, ZONES, RAMPS } from '../config/map';
import { VOID_Y } from '../config/maps/eclipse';
import { buildEclipseRock } from './eclipseRock';
import { buildEclipseIslands } from './eclipseIslands';

// "Eclipse Matero": islas que flotan sobre el vacío. Las alturas, los choques
// y por dónde se pasa los pone world/Levels.js; acá van los ganchos que le
// dicen que afuera de las islas no hay suelo, y lo que cuida que nada se
// quede cayendo para siempre.
//
// (Por ahora la arquitectura es la de bloques de Levels: pisos, paredes,
// barandas y escaleras. Lo propio de cada isla se arma después, encima.)

const OUT = 0;
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
    for (let i = 0; i < MAP_W * MAP_H; i++) if (w.grid[i] === OUT) w.ty[i] -= SKIRT;
  };
  // la barranca de la laguna no lleva baranda: uno se tira al agua (ni la caja
  // ni el dibujo de la de hierro; tampoco al costado de la playa, que baja al
  // agua). globalThis.__mduNoLagoonRail: la baranda dibujada, como antes
  const lagoon = w.zoneKeys.indexOf('B');
  const wet = (k) => w.zone[k] === lagoon || (w.rampAt[k] >= 0 && RAMPS[w.rampAt[k]]?.own === 'playa');
  w.dropOk = (i, j) => wet(i) || wet(j);
  w.dropEdge = (w2, gb, i, ax, az, ya, bx, bz, yb, dx, dz) => globalThis.__mduNoLagoonRail !== true && wet(i + dx + dz * MAP_W);
}

export function buildEclipseOutside(w) {
  // el vacío de verdad: lo que no es isla ni borde no tiene suelo
  for (let i = 0; i < MAP_W * MAP_H; i++) if (w.grid[i] === OUT) w.ty[i] = VOID_Y;
  // la roca de cada isla: la repisa irregular de alrededor y la masa que
  // cuelga abajo (world/eclipseRock.js; globalThis.__mduNoEclipseRock: sin roca)
  if (globalThis.__mduNoEclipseRock !== true) buildEclipseRock(w);
  // el arte de cada isla (world/eclipseIslands.js, un modulo por isla)
  const live = buildEclipseIslands(w);
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
