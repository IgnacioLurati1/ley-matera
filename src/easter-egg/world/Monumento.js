import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { MAP_W, MAP_H, ZONES, RAMPS, DOORS, WALL_BUYS, WINDOWS } from '../config/map';
import { rampY } from './Levels';
import { bbox, quad, sweep, stairs, PROFILE, mergeMeshes, roomShell } from './monumentoKit';
import { buildPropileo } from './monumentoPropileo';
import { buildTorre } from './monumentoTorre';
import { buildCiudad, buildRio } from './monumentoCity';
import { buildDecor } from './monumentoDecor';
import { buildLuces } from './monumentoLuces';
import { buildCalles } from './monumentoCalles';
import MonumentoFog from '../fx/monumentoFog';

// "Monumento al Mate": la arquitectura del Monumento a la Bandera. Levels.js
// pone las alturas, los choques y los pasos (la grilla del config); acá va
// todo lo que se ve, armado a mano y no celda por celda: los pisos de losa,
// la escalinata del Propileo y las 24 gradas del Patio Cívico con sus
// narices, las barandas con los faroles, el Pasaje con el espejo de agua, la
// explanada de la Proa, la avenida, el Parque, la barranca y la Costanera.
// El Propileo (monumentoPropileo.js), la Torre con la Proa, la Cripta y el
// Mirador (monumentoTorre.js), la ciudad y el río (monumentoCity.js) y la
// utilería (monumentoDecor.js) van aparte.
//
// Ganchos de Levels: w.terrain (las calles que bajan al río, la barranca y el
// fondo del río) y w.noBars. Además, cajas sólidas para lo macizo (el
// basamento, la Torre, los pilonos y la Proa): la grilla solo pone paredes
// hasta el techo de la zona de al lado.

const OUT = 0;
const FLOOR = 1;

// La calle (Córdoba al norte, Santa Fe al sur) baja hacia el río.
export const streetY = (x) => Math.max(-2.6, Math.min(3.35, 3.35 - (x - 12) * 0.088));
// El fondo del río: 0,6 m de agua contra la costanera y después se hunde.
export const riverBed = (x) => (x < 116 ? -5.85 : Math.max(-11, -5.85 - (x - 116) * 0.55));
// la barranca: de la baranda del Parque al pie de la Costanera
const barrancaY = (x) => -2.6 - Math.max(0, Math.min(1, (x - 104) / 4)) * 1.8;

export function installMonumentoHooks(w) {
  w.noBars = true;
  // (las barandas que Levels pone donde el piso de al lado está más abajo acá
  // no se dibujan: al costado de las escaleras de la Cripta y del Pasaje uno se
  // tira para abajo; en el Mirador, setenta metros arriba, la baranda queda)
  w.dropOk = (i) => w.fy[i] < 40;
  // Nadando en el río: del borde de la costanera para afuera el piso es el
  // lecho (salvo el muelle). Las celdas del patio de la 2043, que flota a 150 m
  // sobre el agua, y sus paredes no son piso para el que nada abajo (lo subían
  // de golpe arriba). Solo cuando el que pregunta dice a qué altura está
  // (y, abajo de 100 m); sin y, como siempre.
  const riverCell = (x, z, y) => {
    if (x < 113 || y == null || y >= 100) return false;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return true;
    const i = w.idx(cx, cz);
    // (el muelle es piso para el que está arriba; para el que está abajo, en el agua, no)
    return !(w.grid[i] === FLOOR && (w.fy?.[i] ?? 0) < 100 && y > w.fy[i] - 0.9);
  };
  // salir nadando: solo por la escalerilla de la punta del muelle (por el
  // costado se pasaba por arriba de la baranda); en la costanera se vadea.
  // La escalerilla se sube de a poco (no de un salto de dos metros).
  w.swimClimb = (x, z, p) => {
    if (x < 113) return true;
    if (p.pos.x > 124.6 && Math.abs(p.pos.z - 30.5) < 0.6 && !p.ride) climbLadder(p);
    return false;
  };
  const baseZone = w.zoneAt.bind(w);
  w.zoneAt = (x, z, y) => {
    const py = y ?? (w.g.state === 'playing' ? w.g.player?.pos.y : null);
    return riverCell(x, z, py) ? null : baseZone(x, z, y);
  };
  const baseFloor = w.floorAt.bind(w);
  w.floorAt = (x, z, y) => (riverCell(x, z, y) ? riverBed(x) : baseFloor(x, z, y));
  // afuera de la grilla: la plaza 25 de Mayo al oeste, las calles al norte y al sur, el río al este
  w.outY = (x, z) => (x >= 113 ? riverBed(x) : x < 0 ? 3.4 : x >= 97 ? -2.6 : z < 0 || z >= MAP_H ? streetY(x) : 3.4);
  w.terrain = () => {
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      if (w.grid[i] !== OUT) continue;
      const x = i % MAP_W;
      const z = (i - x) / MAP_W;
      if (x >= 113) w.ty[i] = riverBed(x + 0.5);
      else if (x >= 104) w.ty[i] = barrancaY(x + 0.5);
      else if (x >= 34 && x <= 97 && (z <= 15 || z >= 45) && !(x >= 73 && z >= 10 && z <= 50)) w.ty[i] = streetY(x + 0.5);
      else if (x >= 98 && (z <= 5 || z >= 55)) w.ty[i] = -2.6;
    }
  };
}

// ---------------- lo que arma el mapa ----------------
export function buildMonumento(w) {
  const gb = new GeoBuilder();
  const extra = [];
  w.mon = { lamps: [], flags: [], anim: [], extra };
  buildFloors(w, gb);
  buildPatio(w, gb, extra);
  buildPasaje(w, gb, extra);
  buildExplanada(w, gb);
  buildParque(w, gb);
  buildCostanera(w, gb);
  buildPropileo(w, gb, extra);
  buildTorre(w, gb, extra);
  // la Sala de las Banderas y su escalera (paredes de mármol, techo de casetones)
  roomShell(w, gb, ['F'], { wall: 'salaMarble', ceil: 'salaCeil', base: 'travertinoDark' });
  buildExplanadaBordes(w, gb);
  buildCriptaBordes(w, gb);
  buildPizarrones(w, gb);
  w.root.add(gb.build(w.M));
  if (extra.length) w.root.add(mergeMeshes(extra));
  addSolids(w);
  // la punta del muelle no lleva baranda (ni invisible): ahí está la escalerilla
  for (const b of w.boxes) if (b.kind === 'fence' && b.x0 >= 125 && b.x1 <= 126 && b.z0 >= 28 && b.z1 <= 33) b.active = false;
}

// Lo de afuera de la grilla jugable (World lo llama en vez del terreno de Levels).
export function buildMonumentoOutside(w) {
  buildCiudad(w);
  buildCalles(w);
  buildRio(w);
  buildDecor(w);
  buildLuces(w);
  w.mon.fog = new MonumentoFog(w.g, w);
  // los reflectores se prenden con la corriente (World.setPower)
  const setPower = w.setPower.bind(w);
  w.setPower = (on) => {
    setPower(on);
    w.mon.luces?.set(on);
  };
  const prev = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    // (detrás del menú de título los reflectores van prendidos: si no, la
    // Torre era una sombra contra el cielo. __mduNoTituloLuz: apagados)
    const L = w.mon.luces;
    if (L && w.g.state === 'title' && globalThis.__mduNoTituloLuz !== true) {
      if (!L.titleLit) L.now(true);
      L.titleLit = true;
    } else if (L?.titleLit) {
      // (al dejar el título, en el acto: con un fundido la intro arrancaba con
      // la Torre apagándose)
      L.titleLit = false;
      L.now(!!w.power);
    }
    w.mon.luces?.update(dt);
    w.mon.fog?.update(dt, t);
    rescue(w, dt);
  };
}

// La red de seguridad: si alguien igual se va al Paraná (o se cae afuera de lo
// que se juega), el río lo devuelve a la costanera, empapado, en vez de caer
// para siempre.
function rescue(w, dt = 1 / 60) {
  const g = w.g;
  const P = g.player;
  if (!P || g.state !== 'playing' || P.ride) return;
  // nadando en el río: se nada (entities/swim.js); lejos, la correntada lo
  // trae de vuelta hacia el muelle (sin teletransportarlo)
  if ((P.swim || 0) >= 1 && P.pos.x > 112) {
    // (cuanto más se pasa, más fuerte: antes empujaba 0,08 por cuadro y
    // nadando igual se seguía alejando, hasta afuera del agua dibujada)
    const over = Math.max(0, P.pos.x - 140) + Math.max(0, -6 - P.pos.z, P.pos.z - (MAP_H + 6));
    if (over > 0 && globalThis.__mduNoCorrentada !== true) {
      const dx = 124 - P.pos.x;
      const dz = 30.5 - P.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const v = Math.min(over, (2.5 + over * 10) * Math.min(dt, 0.1));
      P.pos.x += (dx / d) * v;
      P.pos.z += (dz / d) * v;
      if (!w.mon.farSaid || g.time - w.mon.farSaid > 6) {
        w.mon.farSaid = g.time;
        g.hud?.subtitle?.('La correntada no te deja ir más lejos.', 2.5);
      }
    }
    return;
  }
  const lowest = P.pos.x > 104 ? -6.2 : -4.0;
  const outside = P.pos.x < -3 || P.pos.x > 126.5 || P.pos.z < -3 || P.pos.z > MAP_H + 3;
  if (P.pos.y > lowest && !outside) return;
  if (P.pos.y > 100) return;
  const z = Math.max(5, Math.min(55, P.pos.z));
  P.pos.set(110.5, -4.4, z);
  P.vel?.set(0, 0, 0);
  P.yaw = Math.PI / 2;
  g.water?.splash?.(113.6, z, 1.2);
  g.post?.flash?.(0.25);
  g.hud?.subtitle?.('El Paraná te devolvió a la costanera.', 2.5);
}

// La escalerilla del muelle (x 125, z 30-31): pegado a los peldaños sube en
// poco más de un segundo y al final pasa arriba de las tablas.
const LADDER_T = 1.2;
function climbLadder(p) {
  const y0 = p.pos.y;
  const z0 = p.pos.z;
  const top = -4.4;
  let t = 0;
  p.ride = (dt) => {
    t += dt;
    const k = Math.min(1, t / LADDER_T);
    const u = Math.min(1, k / 0.8);
    const s = u * u * (3 - 2 * u);
    const over = Math.max(0, (k - 0.8) / 0.2);
    p.pos.set(125.35 - over * 0.75, y0 + (top + 0.05 - y0) * s, 30.5 + (z0 - 30.5) * (1 - u));
    p.vel.set(0, 0, 0);
    if (k >= 1) {
      p.pos.y = top;
      p.onGround = true;
      p.ride = null;
    }
  };
}

// ---------------- pisos ----------------
// Losas de piso de un rectángulo de celdas (x1, z1 incluidos) a la altura y.
function floor(gb, key, x0, z0, x1, z1, y) {
  quad(gb, key, [[x0, y, z1 + 1], [x1 + 1, y, z1 + 1], [x1 + 1, y, z0], [x0, y, z0]], [0, 1, 0]);
}

function buildFloors(w, gb) {
  const own = new Set();
  RAMPS.forEach((R) => {
    const [x0, z0, x1, z1] = R.rect;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) own.add(w.idx(x, z));
  });
  // cada zona con su piso (las rampas, aparte: escalones)
  const mat = { A: 'travPave', B: 'travPave', C: 'explanada', D: 'cryptFloor', E: 'pasaje', F: 'salaFloor', G: 'grass', H: 'baldosa', I: 'travPave' };
  for (const k of Object.keys(ZONES)) {
    const Z = ZONES[k];
    for (const r of Z.rects || []) {
      const [x0, z0, x1, z1] = r;
      const y = r[4] ?? Z.y ?? 0;
      // los rectángulos que son enteros rampa no llevan piso plano
      let all = true;
      for (let z = z0; z <= z1 && all; z++) for (let x = x0; x <= x1; x++) if (!own.has(w.idx(x, z))) all = false;
      if (all) continue;
      if (k === 'E' && r[4] != null) continue; // el espejo del sur lo arma buildPasaje
      if (k === 'H' && x0 >= 113) continue; // el muelle es de tablas (buildCostanera)
      if (k === 'G') continue; // el pasto del parque lo arma buildParque
      if (k === 'P') continue; // el patio de la 2043 lo arma world/monumentoPatio.js
      // (la vereda del Pasaje: sin los escalones del final)
      // (la explanada: sin la avenida, que es de asfalto)
      if (k === 'C' && x0 >= 91) continue;
      const xe = k === 'E' ? Math.min(x1, 17) : k === 'C' ? Math.min(x1, 90) : x1;
      floor(gb, mat[k], x0, z0, xe, z1, y + 0.002);
    }
  }
  // las puertas: el piso de la celda a su altura
  DOORS.forEach((d) => {
    for (const [x, z] of d.cells) {
      // (las vallas de la avenida al Parque pisan la vereda de baldosa, que ya está)
      if (x === 97 && globalThis.__mduNoHuecos !== true) continue;
      const y = w.fy[w.idx(x, z)];
      const k = d.zones[0];
      floor(gb, mat[k] || 'travPave', x, z, x, z, y + 0.002);
    }
  });
}

// ---------------- el Patio Cívico ----------------
// La altura del piso del patio a lo largo de x (por el borde de las barandas):
// el descanso, las 24 gradas, el fondo y la escalera del costado a la Proa.
function patioEdgeY(x) {
  if (x <= 40) return 2.2;
  if (x <= 60) return 2.2 - (2.2 * (x - 40)) / 20;
  if (x <= 63) return 0;
  if (x <= 73) return -(2.6 * (x - 63)) / 10;
  return -2.6;
}

// Baranda maciza de piedra a lo largo de x: la cara de adentro en z = zi
// (mirando hacia `inSign`), 0,62 m de ancho, el remate 1,0 m sobre el piso de
// adentro y la cara de afuera que baja hasta la calle. Tramos rectos entre
// los quiebres de la pendiente.
function parapet(gb, xs, zi, inSign, { thick = 0.62, h = 1.0, top = patioEdgeY, base = (x) => streetY(x) - 0.4 } = {}) {
  const zo = zi - inSign * thick;
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    const ta = top(a) + h;
    const tb = top(b) + h;
    // cara de adentro: del piso al remate (baja un poco más, que tape la junta)
    quad(gb, 'travertino', [[a, top(a) - 0.3, zi], [b, top(b) - 0.3, zi], [b, tb - 0.08, zi], [a, ta - 0.08, zi]], [0, 0, inSign]);
    // cara de afuera: de la calle al remate
    quad(gb, 'travertinoBig', [[a, base(a), zo], [b, base(b), zo], [b, tb - 0.08, zo], [a, ta - 0.08, zo]], [0, 0, -inSign]);
    // el remate: una losa 4 cm más ancha de cada lado, con su canto
    const zi2 = zi + inSign * 0.04;
    const zo2 = zo - inSign * 0.04;
    quad(gb, 'travStep', [[a, ta, zi2], [b, tb, zi2], [b, tb, zo2], [a, ta, zo2]], [0, 1, 0]);
    quad(gb, 'travStep', [[a, ta - 0.08, zi2], [b, tb - 0.08, zi2], [b, tb, zi2], [a, ta, zi2]], [0, 0, inSign]);
    quad(gb, 'travStep', [[a, ta - 0.08, zo2], [b, tb - 0.08, zo2], [b, tb, zo2], [a, ta, zo2]], [0, 0, -inSign]);
    // la parte de abajo del vuelo del remate
    quad(gb, 'travertino', [[a, ta - 0.08, zi], [b, tb - 0.08, zi], [b, tb - 0.08, zi2], [a, ta - 0.08, zi2]], [0, -1, 0]);
    quad(gb, 'travertino', [[a, ta - 0.08, zo2], [b, tb - 0.08, zo2], [b, tb - 0.08, zo], [a, ta - 0.08, zo]], [0, -1, 0]);
  }
  // las puntas
  for (const [x, s] of [[xs[0], -1], [xs[xs.length - 1], 1]]) {
    const t = top(x) + h;
    quad(gb, 'travertino', [[x, base(x), zi], [x, base(x), zo], [x, t, zo], [x, t, zi]], [s, 0, 0]);
    // la punta del remate, que vuela 4 cm de cada lado
    const zi2 = zi + inSign * 0.04;
    const zo2 = zo - inSign * 0.04;
    quad(gb, 'travStep', [[x, t - 0.08, zi2], [x, t - 0.08, zo2], [x, t, zo2], [x, t, zi2]], [s, 0, 0]);
  }
}

// Los tramos de una baranda (los quiebres xs) sin los huecos [a, b]: cada
// tramo con sus quiebres, más los bordes de los huecos.
function cutRuns(xs, holes) {
  const pts = [...new Set([...xs, ...holes.flat()])].filter((x) => x >= xs[0] && x <= xs[xs.length - 1]).sort((a, b) => a - b);
  const runs = [];
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (holes.some(([a, b]) => pts[i - 1] >= a - 1e-6 && pts[i] <= b + 1e-6)) {
      if (run.length > 1) runs.push(run);
      run = [pts[i]];
    } else run.push(pts[i]);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function buildPatio(w, gb, extra) {
  const R = Object.fromEntries(RAMPS.filter((r) => r.own).map((r) => [r.own + r.rect[1], r]));
  // la escalinata del Propileo: 12 escalones altos de travertino
  stairs(gb, R.escalinata19, { count: 12, base: 1.6 });
  // las 24 gradas largas del Patio Cívico
  stairs(gb, R.gradas17, { count: 24, base: -0.6 });
  // los cinco escalones del atrio de la Torre
  stairs(gb, R.atrio21, { count: 5, base: -0.4 });
  // las escaleras de costado que bajan a la Proa (15 escalones)
  stairs(gb, R.costado17, { count: 15, base: -3.2 });
  stairs(gb, R.costado41, { count: 15, base: -3.2 });
  // las barandas del Patio (norte y sur), del descanso hasta la Proa
  const xs = [37.6, 40, 60, 63, 73];
  // (la cara de afuera baja hasta la calle y, en la punta de la Proa, hasta la explanada)
  const base = (x) => streetY(x) - 0.4 - Math.max(0, x - 63) * 0.06;
  // Donde trepan los muertos (las ventanas de config WINDOWS) la baranda está
  // rota: un hueco con el antepecho bajo, donde van las tablas de Barriers
  // (antes la baranda seguía entera y las tablas quedaban metidas en la piedra,
  // asomando arriba como tablones tirados). globalThis.__mduNoHuecos: entera.
  for (const [zi, s, zw] of [[17, 1, 16], [44, -1, 44]]) {
    const holes = globalThis.__mduNoHuecos === true ? [] : WINDOWS.filter((wi) => wi.zone === 'A' && wi.cell[1] === zw).map((wi) => [wi.cell[0] + 0.05, wi.cell[0] + 0.95]);
    for (const run of cutRuns(xs, holes)) parapet(gb, run, zi, s, { base });
    const zo = zi - s * 0.62;
    const sill = (x) => patioEdgeY(x) + 0.2;
    for (const [a, b] of holes) {
      quad(gb, 'travStep', [[a, sill(a), zi], [b, sill(b), zi], [b, sill(b), zo], [a, sill(a), zo]], [0, 1, 0]);
      quad(gb, 'travertino', [[a, patioEdgeY(a) - 0.3, zi], [b, patioEdgeY(b) - 0.3, zi], [b, sill(b), zi], [a, sill(a), zi]], [0, 0, s]);
      quad(gb, 'travertinoBig', [[a, base(a), zo], [b, base(b), zo], [b, sill(b), zo], [a, sill(a), zo]], [0, 0, -s]);
    }
  }
  // entre la escalera del costado y el atrio: un murete que sigue la escalera
  for (const [zi, s] of [[20, -1], [41, 1]]) {
    // (de la escalera del costado mira hacia ella; del lado del atrio, la pared lisa)
    const zo = zi + (s < 0 ? 1 : -1);
    bbox(gb, 'travertino', 62, -3.2, Math.min(zi, zo), 66, 1.85, Math.max(zi, zo), { b: 0.04, top: 'travStep' });
  }
  // los cheek de la escalinata: bloques en pendiente con la urna arriba (los arma Propileo)
  // (la escalinata va de z 19 a 42: el del sur, de 42 a 43,8, espejo del del
  // norte; antes estaba 1 m corrido adentro de la escalinata y los escalones
  // lo atravesaban, con el pebetero metido adentro de la piedra)
  for (const [z0, z1] of [[17.2, 19], [42, 43.8]]) {
    const top = (x) => 5.2 - ((x - 33.6) / 4.4) * 2.0;
    // la cara de arriba en pendiente y los costados
    quad(gb, 'travStep', [[33.6, top(33.6), z1], [38, top(38), z1], [38, top(38), z0], [33.6, top(33.6), z0]], [0, 1, 0]);
    quad(gb, 'travertino', [[33.6, 1.0, z1], [38, 1.0, z1], [38, top(38), z1], [33.6, top(33.6), z1]], [0, 0, 1]);
    quad(gb, 'travertino', [[38, 1.0, z0], [33.6, 1.0, z0], [33.6, top(33.6), z0], [38, top(38), z0]], [0, 0, -1]);
    quad(gb, 'travertino', [[38, 1.0, z1], [38, 1.0, z0], [38, top(38), z0], [38, top(38), z1]], [1, 0, 0]);
    // entre el cheek y la baranda del Patio (que arranca en x 37,6) quedaba un
    // hueco sin piso: un macizo de piedra a la altura de la baranda lo cierra
    // (1 cm adentro de la cara de afuera de la baranda y 1 cm abajo de su
    // remate: donde se cruzan, las caras en el mismo plano titilaban)
    const zf = globalThis.__mduNoZfix === true ? 0 : 0.01;
    const zp = z0 < 30 ? [16.38 + zf, z0] : [z1, 44.62 - zf];
    bbox(gb, 'travertino', 33.95, streetY(36) - 0.6, zp[0], 38, 3.2 - zf, zp[1], { b: 0.04, top: 'travStep' });
    // el dado de la urna, arriba del cheek
    bbox(gb, 'travertino', 33.4, top(33.6) - 0.6, z0 - 0.1, 35.2, top(33.6) + 0.9, z1 + 0.1, { b: 0.05, top: 'travStep' });
    w.mon.urnas = w.mon.urnas || [];
    w.mon.urnas.push([34.3, top(33.6) + 0.9, (z0 + z1) / 2]);
  }
}

// ---------------- el Pasaje Juramento ----------------
function buildPasaje(w, gb, extra) {
  const R = RAMPS.find((r) => r.own === 'pasaje');
  // los tres escalones al Propileo
  stairs(gb, R, { count: 3, base: 3.0 });
  // el espejo del norte: un estanque de 35 cm sobre la losa de la Sala
  const yW = 3.45;
  // (el fondo llega hasta la cara del Propileo, x 20,5: si no, por la franja se ve el vacío)
  quad(gb, 'poolBed', [[5, 3.1, 27], [20.5, 3.1, 27], [20.5, 3.1, 15], [5, 3.1, 15]], [0, 1, 0]);
  // donde la escalera de la Sala pasa por debajo del borde del estanque (x 20
  // a 20,5) el techo de la escalera queda arriba del fondo: la viga del borde,
  // con su cara de abajo y la que mira a la escalera
  quad(gb, 'salaCeil', [[20, 3.1, 17], [20.5, 3.1, 17], [20.5, 3.1, 20], [20, 3.1, 20]], [0, -1, 0]);
  quad(gb, 'salaMarble', [[20.5, 3.1, 17], [20.5, 3.1, 20], [20.5, 3.42, 20], [20.5, 3.42, 17]], [1, 0, 0]);
  // (el agua del espejo del sur 3 cm abajo de 3,55: ahí está la tapa del zócalo
  // de la estatua de Gorriti, world/shieldGorriti.js, y titilaban)
  w.mon.pools = [{ x0: 5, z0: 15, x1: 20.5, z1: 26.55, y: yW }, { x0: 5, z0: 33, x1: 20.5, z1: 40, y: globalThis.__mduNoZfix === true ? 3.55 : 3.52 }];
  // el borde del estanque del norte (al lado de la vereda): un banco de piedra
  bbox(gb, 'travertino', 1, 3.0, 26.5, 20.5, 4.05, 27.0, { b: 0.04, top: 'travStep' });
  // y los otros tres lados
  bbox(gb, 'travertino', 4.4, 3.0, 14.4, 20.5, 3.8, 15.0, { b: 0.04, top: 'travStep' });
  bbox(gb, 'travertino', 4.4, 3.0, 15.0, 5.0, 3.8, 26.5, { b: 0.04, top: 'travStep' });
  // (el del este, entre la esquina y el pilono del Propileo: baja hasta la vereda de Córdoba)
  bbox(gb, 'travertino', 20.5, 2.6, 13.9, 21.1, 3.8, 16.5, { b: 0.04, top: 'travStep' });
  // el espejo del sur (se camina): el fondo de piedra oscura y el borde de afuera
  quad(gb, 'poolBed', [[5, 3.352, 40], [20.5, 3.352, 40], [20.5, 3.352, 33], [5, 3.352, 33]], [0, 1, 0]);
  // la franja de piso del Propileo entre su frente (x 20,5) y la primera celda (21), a los lados de la valla
  for (const [z0, z1] of [[21, 27], [33, 40]]) quad(gb, 'travPave', [[20.5, 4.202, z1], [21, 4.202, z1], [21, 4.202, z0], [20.5, 4.202, z0]], [0, 1, 0]);
  // y ahí, sobre el borde de los estanques, una baranda de hierro: la grilla
  // corta el paso en x 21 (era una pared invisible, con el piso que seguía)
  if (globalThis.__mduNoHuecos !== true) for (const [z0, z1] of [[21.05, 26.95], [33.05, 39.95]]) railing(gb, 20.97, z0, 20.97, z1, 4.2, 5.1);
  // el canto del piso de la valla (x 20 a 20,5) sobre los dos estanques
  quad(gb, 'travertino', [[20, 3.3, 33], [20.5, 3.3, 33], [20.5, 4.204, 33], [20, 4.204, 33]], [0, 0, 1]);
  quad(gb, 'travertino', [[20, 3.9, 27], [20.5, 3.9, 27], [20.5, 4.204, 27], [20, 4.204, 27]], [0, 0, -1]);
  // la vereda de la plaza alrededor de los estanques (entre el Palacio, la
  // Catedral y la plaza 25 de Mayo): sin esto, por los costados se ve el vacío
  for (const [x0, z0, x1, z1] of [[-6, 13.9, 0, 20], [0, 13.9, 4.4, 26.5], [4.4, 13.9, 20.5, 14.4], [0, 33.0, 4.4, 40.6], [-6, 40, 0, 40.6]]) {
    quad(gb, 'baldosa', [[x0, 3.38, z1], [x1, 3.38, z1], [x1, 3.38, z0], [x0, 3.38, z0]], [0, 1, 0]);
  }
  bbox(gb, 'travertino', 4.4, 3.0, 33.0, 5.0, 3.75, 40.0, { b: 0.03, top: 'travStep' });
  bbox(gb, 'travertino', 4.4, 3.0, 40.0, 20.5, 3.75, 40.6, { b: 0.03, top: 'travStep' });
  // las barandas de hierro donde se corta el paso (antes había una pared
  // invisible arriba de los bancos y de los bordes bajos): el banco del
  // estanque del norte, los bordes del espejo del sur y el cordón de la vereda
  railing(gb, 1.15, 26.62, 20.35, 26.62, 4.05, 4.68);
  railing(gb, 4.7, 33.15, 4.7, 40.3, 3.75, 4.68);
  // (la del borde del espejo se abre frente a la puerta de la Catedral, la
  // ventana de los muertos [12, 40]: si no, al trepar la atravesaban)
  if (globalThis.__mduNoHuecos === true) railing(gb, 4.85, 40.3, 20.35, 40.3, 3.75, 4.68);
  else for (const [a, b] of [[4.85, 11.35], [13.65, 20.35]]) railing(gb, a, 40.3, b, 40.3, 3.75, 4.68);
  railing(gb, 0.7, 32.85, 4.4, 32.85, 3.62, 4.68);
  // el cordón entre la vereda y el espejo del sur (apenas un canto que se pisa)
  // (el perfil de abajo hacia arriba: si no, las caras miran para adentro y no
  // se ven; arriba sigue 4 cm por debajo de la vereda, que no quede ranura)
  // (lo que queda abajo de la vereda baja un cm: a 2 mm de ella titilaba)
  sweep(gb, 'travStep', [5, 33.0], [20.5, 33.0], [0, 1], [[0.06, 0], [0.06, 0.2], [0.04, 0.24], [0, 0.25], [-0.04, globalThis.__mduNoZfix === true ? 0.25 : 0.24]], { y: 3.35, caps: false });
  // la vereda hasta la plaza: el cordón de granito de los costados
  bbox(gb, 'granito', 0, 3.0, 32.7, 5.0, 3.62, 33.0, { b: 0.02 });
  // donde termina el Pasaje (la plaza): el umbral y la reja de hierro con
  // sus pilares de granito (los muertos trepan por los dos huecos)
  bbox(gb, 'granito', -0.2, 3.0, 26.5, 1.0, 3.6, 33.2, { b: 0.02 });
  for (const [z0, z1] of [[26.5, 28], [29, 31], [32, 33.2]]) {
    bbox(gb, 'granito', 0.05, 3.6, z0, 0.6, 4.1, z1, { b: 0.03, top: 'travStep' });
    for (let z = z0 + 0.12; z < z1; z += 0.16) bbox(gb, 'ironBar', 0.3, 4.1, z - 0.012, 0.35, 5.6, z + 0.012, { b: 0.002 });
    bbox(gb, 'ironBar', 0.28, 5.52, z0, 0.37, 5.58, z1, { b: 0.004 });
  }
  for (const z of [26.5, 28, 29, 31, 32, 33.2]) bbox(gb, 'granito', 0.02, 3.6, z - 0.22, 0.62, 5.9, z + 0.22, { b: 0.04, corners: true, top: 'travStep' });
  // el tablero de la trampa del espejo: Activities lo cuelga de una pared que
  // acá no hay (quedaba volando sobre la vereda): su pie de granito, el caño y
  // la chapa de atrás
  bbox(gb, 'granito', 4.58, 3.58, 32.16, 5.04, 3.74, 32.84, { b: 0.02, top: 'travStep' });
  bbox(gb, 'ironBar', 4.86, 3.74, 32.43, 5.0, 5.62, 32.57, { b: 0.01 });
  bbox(gb, 'ironBar', 4.97, 4.5, 32.18, 5.012, 5.5, 32.82, { b: 0.004 });
  w.addBox([4.58, 3.58, 32.16, 5.04, 5.62, 32.84], { kind: 'prop' });
}

// Una baranda baja de hierro de a hasta b (en planta) entre y0 y y1: parantes
// cada ~1,3 m con su pomo, el pasamanos y una barra al medio.
function railing(gb, ax, az, bx, bz, y0, y1) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(L / 1.3));
  const along = Math.abs(bx - ax) > Math.abs(bz - az);
  const bar = (x0, z0, x1, z1, ya, yb, t) => bbox(gb, 'ironBar', Math.min(x0, x1) - (along ? 0 : t), ya, Math.min(z0, z1) - (along ? t : 0), Math.max(x0, x1) + (along ? 0 : t), yb, Math.max(z0, z1) + (along ? t : 0), { b: 0.004 });
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n;
    const z = az + ((bz - az) * k) / n;
    bbox(gb, 'ironBar', x - 0.022, y0, z - 0.022, x + 0.022, y1, z + 0.022, { b: 0.004 });
    bbox(gb, 'ironBar', x - 0.035, y1, z - 0.035, x + 0.035, y1 + 0.05, z + 0.035, { b: 0.01 });
  }
  bar(ax, az, bx, bz, y1 - 0.04, y1, 0.025);
  bar(ax, az, bx, bz, (y0 + y1) / 2 - 0.015, (y0 + y1) / 2 + 0.015, 0.015);
}

// Los pizarrones: un tablero oscuro con marco detrás de cada tiza de arma.
function buildPizarrones(w, gb) {
  for (const wb of WALL_BUYS) {
    const a = w.wallAnchor(wb.cell, wb.face, 0.004);
    // (corrido a lo largo de la pared como la tiza: Interactables, wb.slide)
    if (wb.slide) {
      if (wb.face[0]) a.z += wb.slide;
      else a.x += wb.slide;
    }
    const fy = w.floorAt(wb.cell[0] + 0.5 + wb.face[0] * 1.2, wb.cell[1] + 0.5 + wb.face[1] * 1.2);
    const [fx, fz] = wb.face;
    const along = [Math.abs(fz), Math.abs(fx)];
    const P = (u, v, d) => [a.x + along[0] * u + fx * d, fy + v, a.z + along[1] * u + fz * d];
    const hw = 0.9;
    // el tablero y el marco de madera (cuatro listones)
    // (el tablero 4 mm detrás de la tiza, que va a 1 cm: a la misma distancia
    // titilaban y los números se veían punteados)
    quad(gb, 'pizarron', [P(-hw, 1.08, 0.002), P(hw, 1.08, 0.002), P(hw, 2.02, 0.002), P(-hw, 2.02, 0.002)], [fx, 0, fz]);
    const lo = [Math.min(P(-hw - 0.06, 0, 0)[0], P(hw + 0.06, 0, 0.05)[0]), Math.min(P(-hw - 0.06, 0, 0)[2], P(hw + 0.06, 0, 0.05)[2])];
    const hi = [Math.max(P(-hw - 0.06, 0, 0)[0], P(hw + 0.06, 0, 0.05)[0]), Math.max(P(-hw - 0.06, 0, 0)[2], P(hw + 0.06, 0, 0.05)[2])];
    bbox(gb, 'pizarronMarco', lo[0], fy + 1.02, lo[1], hi[0], fy + 1.08, hi[1], { b: 0.01 });
    bbox(gb, 'pizarronMarco', lo[0], fy + 2.02, lo[1], hi[0], fy + 2.08, hi[1], { b: 0.01 });
    // (la repisa de las tizas abajo)
    bbox(gb, 'pizarronMarco', lo[0], fy + 0.98, lo[1], hi[0], fy + 1.02, hi[1] + (fz > 0 ? 0.05 : 0), { b: 0.005 });
  }
}

// ---------------- la explanada de la Proa y la avenida ----------------
function buildExplanada(w, gb) {
  // la avenida Belgrano: el asfalto un poco más abajo que la vereda, con su cordón
  const yA = -2.6;
  floor(gb, 'asfalto', 91, 4, 96, 56, yA - 0.02);
  for (const x of [90.85, 96.15]) {
    // (5 mm arriba de la vereda de la calle, que llega hasta el cordón)
    // (el del lado del monumento se corta donde la terraza de la Proa llega a la
    // avenida, z 28-33: su cara quedaba en el mismo plano que la de la terraza
    // y titilaba al pie, abajo de la hoja del sable)
    const cut = x < 93 && globalThis.__mduNoZfix !== true;
    for (const [z0, z1] of cut ? [[4, 28], [33, 57]] : [[4, 57]]) bbox(gb, 'granito', x - 0.15, yA - 0.5, z0, x + 0.15, yA + (globalThis.__mduNoZfix === true ? 0.12 : 0.125), z1, { b: 0.03 });
  }
  // la vereda del lado del río (ya del parque)
  floor(gb, 'baldosa', 96, 4, 97, 56, yA);
  // las líneas de la avenida (pintura gastada)
  for (let z = 4.5; z < 56; z += 3) quad(gb, 'pintura', [[93.9, yA - 0.015, z + 1.5], [94.1, yA - 0.015, z + 1.5], [94.1, yA - 0.015, z], [93.9, yA - 0.015, z]], [0, 1, 0]);
  // la calle Córdoba y la calle Santa Fe bajan hasta la avenida: el asfalto de las bajadas
  // (lo arma monumentoCity con el terreno de afuera)
}

// Los bordes de la explanada con las bajadas de Córdoba y Santa Fe: un
// murete de granito con su reja (por los huecos se trepan los muertos).
function buildExplanadaBordes(w, gb) {
  const y = -2.6;
  // donde terminan la vereda y la calzada del lado del monumento (x 73), la
  // explanada queda más abajo: un murete de granito que las contiene
  // (1 cm atrás de la punta de la baranda del Patio, que baja hasta acá)
  for (const [z0, z1] of [[9.35, 16.4], [43.6, 51.65]]) bbox(gb, 'granito', 72.7, y - 0.3, z0, globalThis.__mduNoZfix === true ? 73.0 : 72.99, streetY(73) + 0.14, z1, { b: 0.03, top: 'travStep' });
  for (const z of [9, 51]) {
    const z0 = z === 9 ? 9.35 : 51.0;
    const z1 = z0 + 0.65;
    // en los huecos de las ventanas (78 y 88), un umbral de granito entre la
    // calzada (que todavía baja) y la explanada: si no, queda una ranura al pie
    for (const [x0, x1] of [[78, 79], [88, 89]]) bbox(gb, 'granito', x0 - 0.02, y - 0.3, z0, x1 + 0.02, streetY(x0) + 0.02, z1, { b: 0.02, top: 'travStep' });
    // los tramos entre los huecos de las ventanas (78 y 88)
    for (const [x0, x1] of [[72, 78], [79, 88], [89, 97]]) {
      bbox(gb, 'granito', x0, y - 0.3, z0, x1, y + 0.55, z1, { b: 0.04, top: 'travStep' });
      for (let x = x0 + 0.25; x < x1; x += 0.22) bbox(gb, 'ironBar', x - 0.012, y + 0.55, (z0 + z1) / 2 - 0.012, x + 0.012, y + 1.5, (z0 + z1) / 2 + 0.012, { b: 0.002 });
      bbox(gb, 'ironBar', x0, y + 1.46, (z0 + z1) / 2 - 0.025, x1, y + 1.52, (z0 + z1) / 2 + 0.025, { b: 0.005 });
      // los pilares de las puntas
      for (const x of [x0, x1 - 0.4]) bbox(gb, 'granito', x, y - 0.3, z0 - 0.08, x + 0.4, y + 1.75, z1 + 0.08, { b: 0.04, top: 'travStep' });
    }
  }
}

// Las escaleras de la Cripta pasan por un hueco del techo de las alas: en la
// mitad de arriba el canto de la losa queda a la altura de la cabeza (ahí no se
// puede tirar uno de costado; más abajo sí). Mármol negro sobre negro no se
// veía: una moldura de travertino marca el canto de la losa a los dos lados.
function buildCriptaBordes(w, gb) {
  const y = 1.05;
  for (const [z0, z1] of [[23.94, 24.03], [36.97, 37.06]]) bbox(gb, 'travStep', 67, y - 0.02, z0, 72, y + 0.16, z1, { b: 0.01 });
}

// ---------------- el Parque Nacional a la Bandera ----------------
function buildParque(w, gb) {
  const y = -2.6;
  // pasto, con los senderos de baldosa (uno a lo largo y los que van a las escaleras)
  floor(gb, 'grass', 98, 6, 103, 54, y);
  for (const [x0, z0, x1, z1] of [[100, 6, 101, 54], [98, 18, 103, 20], [98, 40, 103, 42], [98, 13, 99, 15], [98, 45, 99, 47]]) {
    floor(gb, 'baldosa', x0, z0, x1, z1, y + 0.012);
  }
  // el cordón del pasto contra la avenida y la baranda de la barranca: un murito de piedra
  // (cortado donde están las vallas y las escaleras de la barranca: antes era
  // entero, las vallas quedaban paradas arriba y abiertas se pasaba por
  // adentro de la piedra. globalThis.__mduNoHuecos: entero)
  const whole = globalThis.__mduNoHuecos === true;
  for (const [a, b] of whole ? [[5, 56]] : [[5, 13], [16, 45], [48, 56]]) bbox(gb, 'travertino', 97.0, y - 0.6, a, 98.0, y + 0.35, b, { b: 0.04, top: 'travStep' });
  for (const [a, b] of whole ? [[5, 56]] : [[5, 18], [21, 40], [43, 56]]) bbox(gb, 'travertino', 104.0, y - 2.4, a, 104.65, y + 0.45, b, { b: 0.04, top: 'travStep' });
  // los extremos (norte y sur)
  bbox(gb, 'travertino', 97.0, y - 0.6, 5.0, 104.65, y + 0.35, 6.0, { b: 0.04, top: 'travStep' });
  bbox(gb, 'travertino', 97.0, y - 0.6, 55.0, 104.65, y + 0.35, 56.0, { b: 0.04, top: 'travStep' });
  // la barranca: pasto en pendiente entre el parque y la costanera
  const sl = (x) => barrancaY(x);
  for (const [z0, z1] of [[4, 18], [21, 40], [43, 57]]) {
    quad(gb, 'grass', [[104.65, sl(104.65), z1], [108, sl(108), z1], [108, sl(108), z0], [104.65, sl(104.65), z0]], [0.4, 1, 0]);
  }
  // las escaleras de la barranca y sus costados de piedra
  for (const R of RAMPS.filter((r) => r.own === 'barranca')) {
    stairs(gb, R, { count: 10, base: -4.8 });
    const [, z0, , z1] = R.rect;
    // (1 cm antes de la cara del muro de la costanera, que sigue de largo: en el mismo plano titilaban)
    for (const z of [z0 - 0.3, z1 + 1]) bbox(gb, 'travertino', 104.65, -4.8, z, globalThis.__mduNoZfix === true ? 108 : 107.99, -2.0, z + 0.3, { b: 0.04, top: 'travStep' });
  }
}

// ---------------- la Costanera y el muelle ----------------
function buildCostanera(w, gb) {
  const y = -4.4;
  // el muro de contención de la barranca (de piedra, alto) del lado del parque
  // (las puntas 1 cm adentro de las piedras de los costados de las escaleras de la barranca)
  const zc = globalThis.__mduNoZfix === true ? 0 : 0.01;
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 4, 108.0, y + 0.7, 18 - zc, { b: 0.03 });
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 21 + zc, 108.0, y + 0.7, 40 - zc, { b: 0.03 });
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 43 + zc, 108.0, y + 0.7, 57, { b: 0.03 });
  // el borde contra el río: el cordón de piedra (la baranda de hierro la pone Decor)
  // y el muro que baja hasta el agua
  for (const [z0, z1] of [[4, 28], [33, 57]]) {
    bbox(gb, 'travertino', 113.0, -7, z0, 113.5, y + 0.3, z1, { b: 0.03, top: 'travStep' });
  }
  // y debajo del muelle, el muro sigue hasta el agua (si no, bajo las tablas se ve el vacío)
  bbox(gb, 'travertino', 112.9, -7, 28, 113.0, y - 0.07, 33, { b: 0.01, skip: ['top'] });
  // los extremos de la costanera
  bbox(gb, 'travertino', 108.0, y - 0.4, 3.4, 113.5, y + 0.3, 4.0, { b: 0.03, top: 'travStep' });
  bbox(gb, 'travertino', 108.0, y - 0.4, 57.0, 113.5, y + 0.3, 57.6, { b: 0.03, top: 'travStep' });
  // y en las puntas una reja alta de hierro con pilares: la costanera sigue
  // afuera de lo que se juega, pero por ahí no se pasa
  for (const zc of [3.7, 57.3]) {
    for (const x of [108.2, 110.75, 113.25]) bbox(gb, 'travertino', x - 0.2, y + 0.28, zc - 0.2, x + 0.2, y + 1.9, zc + 0.2, { b: 0.03, top: 'travStep' });
    for (const [a, b] of [[108.4, 110.55], [110.95, 113.05]]) {
      for (const yy of [y + 0.42, y + 1.62]) bbox(gb, 'ironBar', a, yy, zc - 0.022, b, yy + 0.045, zc + 0.022, { b: 0.004 });
      for (let x = a + 0.1; x < b - 0.04; x += 0.13) {
        bbox(gb, 'ironBar', x - 0.012, y + 0.3, zc - 0.012, x + 0.012, y + 1.78, zc + 0.012, { b: 0.002 });
        bbox(gb, 'ironBar', x - 0.02, y + 1.78, zc - 0.02, x + 0.02, y + 1.86, zc + 0.02, { b: 0.004 });
      }
    }
  }
  // el muelle: tablones sobre pilotes, del borde hasta bien adentro del río
  const yD = y + 0.02;
  const z0 = 28;
  const z1 = 33;
  for (let x = 113; x < 125; x += 0.25) {
    const k = Math.floor(x * 4);
    // cada tablón con su tono y apenas desparejo
    bbox(gb, k % 3 ? 'muelle' : 'muelleDark', x + 0.01, yD - 0.06, z0, x + 0.24, yD + ((k * 37) % 5) * 0.002, z1, { b: 0.008, skip: ['bottom'] });
  }
  // las vigas y los pilotes
  for (const z of [z0 + 0.15, (z0 + z1) / 2, z1 - 0.15]) bbox(gb, 'muelleDark', 113, yD - 0.3, z - 0.1, 125, yD - 0.06, z + 0.1, { b: 0.01 });
  for (let x = 114; x <= 124; x += 2.5) {
    for (const z of [z0 + 0.15, z1 - 0.15]) bbox(gb, 'muelleDark', x - 0.14, -9, z - 0.14, x + 0.14, yD - 0.06, z + 0.14, { b: 0.02, corners: true });
  }
  // el faldón de tablas de los costados y de la punta, del tablero al fondo:
  // abajo del muelle no se mete nadie (cerca de la costanera no hay alto para
  // pararse y el juego lo subía de golpe arriba de las tablas)
  const skirt = [
    [113, 124.94, 27.94, 28.0],
    [113, 124.94, 33.0, 33.06],
    [124.94, 125.0, 27.94, 33.06],
  ];
  for (const [xa, xb, za, zb] of skirt) {
    const alongX = xb - xa > zb - za;
    const [a0, a1] = alongX ? [xa, xb] : [za, zb];
    for (let a = a0; a < a1 - 0.01; a += 0.3) {
      const e = Math.min(a1, a + 0.28);
      if (alongX) bbox(gb, 'muelleDark', a, -8.5, za, e, yD - 0.07, zb, { b: 0.006, skip: ['top', 'bottom'] });
      else bbox(gb, 'muelleDark', xa, -8.5, a, xb, yD - 0.07, e, { b: 0.006, skip: ['top', 'bottom'] });
    }
    w.addBox([xa, -12, za, xb, yD - 0.07, zb], { kind: 'wall' });
  }
  // (y abajo, contra la costanera, el muro: por si alguien igual queda abajo)
  w.addBox([112.9, -12, z0, 113.0, yD - 0.07, z1], { kind: 'wall' });
  // la escalerilla de hierro de la punta del muelle (para tirarse al río y volver a subir)
  for (const z of [30.05, 30.95]) bbox(gb, 'ironBar', 125.0, -6.4, z - 0.025, 125.05, yD + 1.0, z + 0.025, { b: 0.004 });
  for (let yy = -6.2; yy < yD; yy += 0.3) bbox(gb, 'ironBar', 125.0, yy, 30.05, 125.05, yy + 0.035, 30.95, { b: 0.004 });
  // las barandas del muelle (de palo)
  for (const z of [z0 + 0.05, z1 - 0.05]) {
    for (let x = 113.5; x <= 124.5; x += 1.5) bbox(gb, 'muelleDark', x - 0.05, yD, z - 0.05, x + 0.05, yD + 1.0, z + 0.05, { b: 0.01 });
    bbox(gb, 'muelle', 113.4, yD + 0.94, z - 0.06, 124.6, yD + 1.04, z + 0.06, { b: 0.015 });
    bbox(gb, 'muelle', 113.4, yD + 0.5, z - 0.04, 124.6, yD + 0.56, z + 0.04, { b: 0.01 });
  }
}

// ---------------- choques de lo macizo ----------------
// La grilla pone paredes hasta el techo de la zona de al lado: lo macizo que
// sube más (el basamento, la Torre, los pilonos del Propileo, la Proa) lleva
// sus cajas acá, así las balas y la vista no lo atraviesan.
function addSolids(w) {
  const B = (x0, y0, z0, x1, y1, z1) => w.addBox([x0, y0, z0, x1, y1, z1], { kind: 'wall' });
  // el Propileo: los dos pilonos (el del norte, arriba de la escalera de la Sala) y la losa del techo
  B(20.5, 8.0, 16.4, 34.0, 14.4, 21.0);
  B(20.5, 4.2, 40.0, 34.0, 14.4, 43.6);
  B(20.5, 13.0, 16.4, 34.0, 14.6, 43.6);
  // el basamento de la Torre (lo que queda arriba de la Cripta y de sus escaleras)
  B(66, 4.0, 20, 82, 6.2, 41);
  B(66, 1.05, 24, 82, 4.0, 37);
  B(72, 1.05, 20, 82, 4.0, 24);
  B(72, 1.05, 37, 82, 4.0, 41);
  // el cuerpo alto del basamento y la Torre hasta el piso del Mirador
  B(69.5, 6.2, 22.5, 82, 11.4, 38.5);
  B(74, 11.4, 26, 80, 43.95, 36);
  // el remate de la Torre, arriba del Mirador
  // (el remate nuevo, liso, termina en la losa: monumentoTorre buildMirador)
  B(73.8, 47.4, 25.8, 80.2, globalThis.__mduNoRemate === true ? 50.2 : 49.45, 36.2);
  // los cuatro pilares de las esquinas del Mirador
  for (const [x, z] of [[74, 26], [79, 26], [74, 35], [79, 35]]) B(x, 45.0, z, x + 1, 47.4, z + 1);
  // la Proa: las terrazas del pie (de la grilla, 0,6 m) y la cuña de piedra
  // por fajas de 25 cm que siguen su contorno de verdad (antes eran fajas de
  // 1 m de la grilla, más anchas que la cuña: paredes invisibles al costado,
  // que frenaban los tiros)
  const prow = [[82, 23, 38], [83, 23, 38], [84, 23, 38], [85, 24, 37], [86, 24, 37], [87, 26, 35], [88, 26, 35], [89, 28, 33], [90, 28, 33]];
  for (const [x, z0, z1] of prow) B(x, -2.6, z0, x + 1, -2.0, z1);
  const half = (x) => (x <= 88.4 ? 30.5 - 23.6 + ((x - 82) / 6.4) * (23.6 - 28.1) : (30.5 - 28.1) * (1 - (x - 88.4) / 1.2));
  const topY = (x) => (x >= 88.4 ? 4.3 : 6.0 + ((x - 82) / 6.4) * (4.3 - 6.0));
  for (let x = 82; x < 89.6; x += 0.25) {
    const h = Math.max(half(x), half(x + 0.25));
    if (h > 0.02) B(x, -2.0, 30.5 - h, x + 0.25, Math.max(topY(x), topY(x + 0.25)) + 0.35, 30.5 + h);
  }
  // el pedestal de la Patria Abanderada y los dos colosos del agua
  B(85.75, -2.0, 29.05, 88.65, 9.6, 31.95);
  for (const z of [24.2, 36.8]) w.addBox([84.6, -2.6, z - 0.9, 86.4, 1.6, z + 0.9], { kind: 'prop' });
}
