import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { MAP_W, MAP_H, ZONES, RAMPS, DOORS, WALL_BUYS } from '../config/map';
import { rampY } from './Levels';
import { bbox, quad, sweep, stairs, PROFILE, mergeMeshes, roomShell } from './monumentoKit';
import { buildPropileo } from './monumentoPropileo';
import { buildTorre } from './monumentoTorre';
import { buildCiudad, buildRio } from './monumentoCity';
import { buildDecor } from './monumentoDecor';
import { buildLuces } from './monumentoLuces';
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
  buildPizarrones(w, gb);
  w.root.add(gb.build(w.M));
  if (extra.length) w.root.add(mergeMeshes(extra));
  addSolids(w);
}

// Lo de afuera de la grilla jugable (World lo llama en vez del terreno de Levels).
export function buildMonumentoOutside(w) {
  buildCiudad(w);
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
    w.mon.luces?.update(dt);
    w.mon.fog?.update(dt, t);
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
  parapet(gb, xs, 17, 1, { base });
  parapet(gb, xs, 44, -1, { base });
  // entre la escalera del costado y el atrio: un murete que sigue la escalera
  for (const [zi, s] of [[20, -1], [41, 1]]) {
    // (de la escalera del costado mira hacia ella; del lado del atrio, la pared lisa)
    const zo = zi + (s < 0 ? 1 : -1);
    bbox(gb, 'travertino', 62, -3.2, Math.min(zi, zo), 66, 1.85, Math.max(zi, zo), { b: 0.04, top: 'travStep' });
  }
  // los cheek de la escalinata: bloques en pendiente con la urna arriba (los arma Propileo)
  for (const [z0, z1] of [[17.2, 19], [41, 42.8]]) {
    const top = (x) => 5.2 - ((x - 33.6) / 4.4) * 2.0;
    // la cara de arriba en pendiente y los costados
    quad(gb, 'travStep', [[33.6, top(33.6), z1], [38, top(38), z1], [38, top(38), z0], [33.6, top(33.6), z0]], [0, 1, 0]);
    quad(gb, 'travertino', [[33.6, 1.0, z1], [38, 1.0, z1], [38, top(38), z1], [33.6, top(33.6), z1]], [0, 0, 1]);
    quad(gb, 'travertino', [[38, 1.0, z0], [33.6, 1.0, z0], [33.6, top(33.6), z0], [38, top(38), z0]], [0, 0, -1]);
    quad(gb, 'travertino', [[38, 1.0, z1], [38, 1.0, z0], [38, top(38), z0], [38, top(38), z1]], [1, 0, 0]);
    // entre el cheek y la baranda del Patio (que arranca en x 37,6) quedaba un
    // hueco sin piso: un macizo de piedra a la altura de la baranda lo cierra
    const zp = z0 < 30 ? [16.38, z0] : [z1, 43.62];
    bbox(gb, 'travertino', 33.95, streetY(36) - 0.6, zp[0], 38, 3.2, zp[1], { b: 0.04, top: 'travStep' });
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
  w.mon.pools = [{ x0: 5, z0: 15, x1: 20.5, z1: 26.55, y: yW }, { x0: 5, z0: 33, x1: 20.5, z1: 40, y: 3.55 }];
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
  // el cordón entre la vereda y el espejo del sur (apenas un canto que se pisa)
  // (el perfil de abajo hacia arriba: si no, las caras miran para adentro y no
  // se ven; arriba sigue 4 cm por debajo de la vereda, que no quede ranura)
  sweep(gb, 'travStep', [5, 33.0], [20.5, 33.0], [0, 1], [[0.06, 0], [0.06, 0.2], [0.04, 0.24], [0, 0.25], [-0.04, 0.25]], { y: 3.35, caps: false });
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
}

// Los pizarrones: un tablero oscuro con marco detrás de cada tiza de arma.
function buildPizarrones(w, gb) {
  for (const wb of WALL_BUYS) {
    const a = w.wallAnchor(wb.cell, wb.face, 0.004);
    const fy = w.floorAt(wb.cell[0] + 0.5 + wb.face[0] * 1.2, wb.cell[1] + 0.5 + wb.face[1] * 1.2);
    const [fx, fz] = wb.face;
    const along = [Math.abs(fz), Math.abs(fx)];
    const P = (u, v, d) => [a.x + along[0] * u + fx * d, fy + v, a.z + along[1] * u + fz * d];
    const hw = 0.9;
    // el tablero y el marco de madera (cuatro listones)
    quad(gb, 'pizarron', [P(-hw, 1.08, 0.006), P(hw, 1.08, 0.006), P(hw, 2.02, 0.006), P(-hw, 2.02, 0.006)], [fx, 0, fz]);
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
    bbox(gb, 'granito', x - 0.15, yA - 0.5, 4, x + 0.15, yA + 0.12, 57, { b: 0.03 });
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
  for (const [z0, z1] of [[9.35, 16.4], [43.6, 51.65]]) bbox(gb, 'granito', 72.7, y - 0.3, z0, 73.0, streetY(73) + 0.14, z1, { b: 0.03, top: 'travStep' });
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

// ---------------- el Parque Nacional a la Bandera ----------------
function buildParque(w, gb) {
  const y = -2.6;
  // pasto, con los senderos de baldosa (uno a lo largo y los que van a las escaleras)
  floor(gb, 'grass', 98, 6, 103, 54, y);
  for (const [x0, z0, x1, z1] of [[100, 6, 101, 54], [98, 18, 103, 20], [98, 40, 103, 42], [98, 13, 99, 15], [98, 45, 99, 47]]) {
    floor(gb, 'baldosa', x0, z0, x1, z1, y + 0.012);
  }
  // el cordón del pasto contra la avenida y la baranda de la barranca: un murito de piedra
  bbox(gb, 'travertino', 97.0, y - 0.6, 5.0, 98.0, y + 0.35, 56.0, { b: 0.04, top: 'travStep' });
  bbox(gb, 'travertino', 104.0, y - 2.4, 5.0, 104.65, y + 0.45, 56.0, { b: 0.04, top: 'travStep' });
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
    for (const z of [z0 - 0.3, z1 + 1]) bbox(gb, 'travertino', 104.65, -4.8, z, 108, -2.0, z + 0.3, { b: 0.04, top: 'travStep' });
  }
}

// ---------------- la Costanera y el muelle ----------------
function buildCostanera(w, gb) {
  const y = -4.4;
  // el muro de contención de la barranca (de piedra, alto) del lado del parque
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 4, 108.0, y + 0.7, 18, { b: 0.03 });
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 21, 108.0, y + 0.7, 40, { b: 0.03 });
  bbox(gb, 'travertinoBig', 107.6, y - 0.4, 43, 108.0, y + 0.7, 57, { b: 0.03 });
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
  B(73.8, 47.4, 25.8, 80.2, 50.2, 36.2);
  // los cuatro pilares de las esquinas del Mirador
  for (const [x, z] of [[74, 26], [79, 26], [74, 35], [79, 35]]) B(x, 45.0, z, x + 1, 47.4, z + 1);
  // la Proa: una cuña de piedra (por fajas de 1 m, siguiendo la grilla)
  const prow = [[82, 23, 38], [83, 23, 38], [84, 23, 38], [85, 24, 37], [86, 24, 37], [87, 26, 35], [88, 26, 35], [89, 28, 33], [90, 28, 33]];
  for (const [x, z0, z1] of prow) B(x, -2.6, z0, x + 1, x < 87 ? 6.0 : 3.6, z1);
}
