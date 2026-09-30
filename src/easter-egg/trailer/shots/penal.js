import * as THREE from 'three';
import { lerp, span, E, orbitAt } from '../kit';
import { zombieAt, ring, bait, weather, bolt } from '../horde';
import { fp, track, trigger } from '../fp';
import { cues, ramp, nearestAim } from './molino';

// Mate of the Dead (el penal de la Isla del Ceibo, Corrientes, 1878): de
// noche, con tormenta. El Pabellón B (piso a y=4), el muelle y la telesilla.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();

// Un rayo que cae de verdad (la línea del cielo al piso) con su destello.
function strike(g, x, z, y0 = 0, color = 0xcfe0ff, k = 0.5) {
  g.fx.lightning(tv.set(x, y0 + 40, z), tw.set(x, y0 + 0.2, z), color, 0.35);
  g.fx.flash(tw.set(x, y0 + 3, z), color, 14 * k, 0.3, 30);
  bolt(g, k);
}

// ---- 1 · el penal en la tormenta: un rayo lo muestra ----
export const p_reveal = {
  map: 'penal',
  pre: 0.4,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.03, rain: 1 });
    bait(g, 44, 35);
    c.data.q = cues([
      [0.18, () => strike(g, 37, 20, 8)],
      [0.72, () => strike(g, 62, 14, 8)],
    ]);
    c.cam({
      pos: [[45.5, 7.2, 93.5], [44.8, 9.4, 90.2]],
      look: [[45, 7.5, 40], [45, 9.2, 40]],
      fov: [46, 42],
      hand: { amp: 0.008, freq: 0.5 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- gaucho life: el alma tira electricidad en la capilla de las velas coloradas ----
export const p_ghost = {
  map: 'penal',
  pre: 1.0,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.02, rain: 0.6 });
    fp(c, { weapon: 'porongo', x: 62.5, z: 22.6, y: 8, yaw: 0, pitch: 0 });
    g.vida?.enter({ free: true });
    c.data.zs = [[61.6, 16.8], [63.4, 15.6], [62.2, 14.2], [64.2, 17.4], [60.8, 13.4]].map(([x, z]) => zombieAt(g, x, z, { speed: 'walk', hp: 3000 }));
  },
  before(c, t, dt) {
    const tgt = nearestAim(c.g) || c.data.zs[0];
    track(c, tgt, dt, { freq: 4.5, damp: 0.8, head: false });
    const m = c.g.input.mouse;
    // tres descargas, con el golpe
    m.leftPressed = (t >= 0 && t < 0.017) || (t >= 0.42 && t < 0.437) || (t >= 0.84 && t < 0.857);
  },
  stop(c) {
    c.g.vida?.leave?.(true);
  },
};

// ---- la Bombilla Gut en los yerbales, bajo la lluvia ----
export const p_fp_gut = {
  map: 'penal',
  pre: 1.1,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.025, rain: 1 });
    fp(c, { weapon: 'gut', up: 1, x: 54.2, z: 67.2, yaw: -Math.PI / 2, pitch: -0.02 });
    c.data.zs = [[58.4, 66.8], [59.6, 68.4], [60.8, 66.2], [62.2, 67.8], [60.2, 64.8], [63.4, 66.4], [57.8, 68.9]].map(([x, z]) => zombieAt(g, x, z, { speed: 'walk', hp: 700 }));
    c.data.q = cues([[0.5, () => bolt(g, 0.6)]]);
  },
  before(c, t, dt) {
    const tgt = nearestAim(c.g) || c.data.zs[0];
    track(c, tgt, dt, { freq: 5, damp: 0.75 });
    trigger(c, (t >= 0 && t < 0.02) || (t >= 0.5 && t < 0.52), { semi: true, every: 9 });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- el Alcaide: viene por los yerbales, bajo la tormenta, con los reflectores de la torre ----
export const p_alcaide = {
  map: 'penal',
  pre: 0.5,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.022, rain: 1 });
    bait(g, 56.4, 67.4);
    const b = g.zombies.spawnBoss(8, { kind: 'alcaide', at: new THREE.Vector3(65.5, 0, 67.2) });
    if (b) {
      b.pos.set(65.5, b.pos.y, 67.2);
      b.yaw = Math.PI / 2;
      g.zombies.setState(b, 'intro');
    }
    c.data.b = b;
    for (const [x, z] of [[68.5, 65.6], [69.4, 68.8], [71.2, 66.8], [72.4, 64.2]]) zombieAt(g, x, z, { speed: 'walk' });
    c.data.q = cues([
      [0.05, () => strike(g, 72, 60, 0)],
      [1.35, () => bolt(g, 0.6)],
    ]);
    c.cam({
      pos: [[57.8, 0.45, 68.0], [59.0, 0.5, 67.8]],
      look: [[65.5, 2.0, 67.2], [65.4, 2.2, 67.2]],
      u: 'io2',
      fov: [42, 36],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- los cuatro retroceden por el muelle tirando; la horda sale del río y los sigue ----
export const p_pier = {
  map: 'penal',
  pre: 1.4,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.024, rain: 1 });
    bait(g, 44, 78);
    const crew = c.newCrew();
    const set = [[0, 'mate47', 0, 76.9], [1, 'camionero', 1, 78.9], [2, 'gut', 0, 77.9], [3, 'imperial', 0, 79.9]];
    c.data.gs = set.map(([id, w, up, z], i) => {
      const G = crew.add(id, { gun: w, up });
      const x = 48.5 - (i % 2) * 1.2;
      G.at(x, z, Math.PI / 2);
      G.set(i === 2 ? 'hip' : 'aim').auto(i === 2 ? 0.55 : 0.16, { range: 16, cone: 0.4 });
      G.go([[x, z], [x - 6.5, z]], 1.9, { run: false });
      return G;
    });
    ring(g, 59, 78, 16, { r0: 1, r1: 5, a0: -Math.PI / 2 - 1, a1: -Math.PI / 2 + 1, speed: 'run', hp: 700 });
    c.data.q = cues([[0.6, () => strike(g, 64, 90, 0)]]);
    // desde la punta de tierra del muelle, bajito, contra el río
    c.cam({
      pos: [[39.4, 0.9, 77.4], [37.8, 1.1, 77.6]],
      look: [[47, 1.6, 78.2], [45, 1.8, 78.1]],
      fov: [50, 46],
      hand: { amp: 0.014, freq: 0.9 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- el Cerro del Espinillo: los cuatro en la punta de la isla, el rayo parte el cielo ----
export const p_cerro = {
  map: 'penal',
  pre: 1.4,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.02, rain: 1 });
    const X = 82.5;
    const Z = 18.5;
    bait(g, X, Z);
    const crew = c.newCrew();
    const guns = [['gut', 1], ['mate47', 1], ['camionero', 1], ['imperial', 1]];
    c.data.gs = guns.map(([w, up], i) => {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const G = crew.add(i, { gun: w, up });
      G.at(X + Math.sin(a) * 1.1, Z + Math.cos(a) * 1.1, a);
      G.set(i === 3 ? 'kneel' : 'aim').auto(0.2, { range: 12, cone: 0.45 });
      return G;
    });
    ring(g, X, Z, 18, { r0: 4.5, r1: 7.5, speed: 'run', hp: 900 });
    c.data.q = cues([
      [0.3, () => strike(g, X - 2, Z - 12, 12, 0xd8e8ff, 0.8)],
      [1.4, () => strike(g, X + 9, Z + 4, 12, 0xd8e8ff, 0.6)],
    ]);
    c.T.scale = 0.6;
    c.cam({
      pos: (u, out) => orbitAt(tw.set(X, 0, Z), lerp(3.6, 3.05, u), lerp(6.5, 5.4, u), 12 + lerp(0.6, 1.6, u), out),
      look: (u, out) => out.set(X, 13.3, Z),
      fov: [50, 46],
      hand: { amp: 0.012, freq: 0.6 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- la telesilla: la cabina cruza el río en la tormenta, los cuatro adentro ----
export const p_storm = {
  map: 'penal',
  pre: 0.4,
  setup(c) {
    const g = c.g;
    weather(g, 'storm', { fog: 0.024, rain: 1 });
    bait(g, 44, 35);
    const L = g.ee?.lift;
    c.data.L = L;
    if (L) {
      L.at = 'low';
      L.st = 'move';
      L.t = 6.2;
      L.powered = true;
    }
    const crew = c.newCrew();
    const offs = [[-0.7, -0.6], [0.7, -0.5], [-0.6, 0.7], [0.65, 0.6]];
    c.data.gs = offs.map(([ox, oz], i) => {
      const G = crew.add(i, { gun: ['mate47', 'camionero', 'gut', 'imperial'][i] });
      G.off = [ox, oz];
      G.set(i % 2 ? 'aim' : 'ready');
      return G;
    });
    c.data.q = cues([
      [0.25, () => strike(g, 66, 70, 0)],
      [1.4, () => strike(g, 84, 60, 0)],
    ]);
    c.cam({
      pos: [[73.2, 14.6, 57.8], [72.6, 15.2, 55.6]],
      look: (u, out) => (L ? out.set(L.pos.x, L.pos.y + 1.4, L.pos.z) : out.set(66, 8, 66)),
      lag: 0.25,
      fov: [42, 36],
      hand: { amp: 0.012, freq: 0.5 },
    });
  },
  before(c, t, dt) {
    const L = c.data.L;
    // la cabina va por su recorrido (el tiempo del viaje lo pone la toma)
    if (L) L.t = 6.2 + (t + 0.4) * 1.1;
  },
  frame(c, t) {
    const D = c.data;
    D.q(c, t);
    const L = D.L;
    if (!L) return;
    for (const G of D.gs) {
      G.lockY = L.pos.y;
      G.pos.set(L.pos.x + G.off[0], 0, L.pos.z + G.off[1]);
      if (G.mode === 'aim') G.aim(tv.set(G.pos.x + G.off[0] * 10, L.pos.y - 3, G.pos.z + G.off[1] * 10).clone());
    }
  },
  stop(c) {
    const L = c.data.L;
    if (L) {
      L.st = 'dock';
      L.t = 0;
      L.at = 'low';
    }
  },
};
