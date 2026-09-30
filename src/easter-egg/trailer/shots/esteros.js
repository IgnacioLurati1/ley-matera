import * as THREE from 'three';
import { lerp, span } from '../kit';
import { zombieAt, ring, bait, weather, dogAt } from '../horde';
import { fp, track, ads } from '../fp';
import { cues, ramp, nearestAim } from './molino';

// Mate no Numa (los Esteros del Iberá, 1877, luna llena): la luna baja al
// sureste (x+, z+) sobre la laguna grande; el agua refleja su camino de luz.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();

// La luna de verdad (el disco está a 260 m del centro del mapa).
const moonPos = (g) => g.world.moonSprite?.position || tv.set(200, 90, 230);

// ---- 1 · el estero: la cámara roza el agua hacia la luna, uno sale del agua ----
export const e_reveal = {
  map: 'esteros',
  pre: 0.5,
  exposure: 0.72,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.02, mist: 0.5 });
    bait(g, 42, 44);
    c.data.q = cues([
      [-0.5, () => zombieAt(g, 53.0, 68.6, { state: 'rise' })],
      [0.1, () => zombieAt(g, 55.4, 70.8, { state: 'rise' })],
    ]);
    c.cam({
      pos: [[48.4, 0.5, 62.6], [50.6, 0.75, 65.2]],
      look: [[64.5, 3.2, 82.5], [66.5, 4.2, 84.5]],
      fov: [44, 40],
      hand: { amp: 0.006, freq: 0.4 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- los muertos vienen por el agua, contra la luna ----
export const e_wade = {
  map: 'esteros',
  pre: 1.2,
  exposure: 0.72,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.02, mist: 0.6 });
    bait(g, 50.2, 64.6);
    for (const [x, z] of [[53.2, 68.2], [55.0, 67.4], [54.4, 70.6], [56.8, 69.6], [52.2, 70.2], [57.2, 72.4], [58.6, 70.9]]) zombieAt(g, x, z, { speed: 'walk', hp: 900 });
    c.T.scale = 0.7;
    c.cam({
      pos: [[50.6, 0.32, 65.0], [51.0, 0.3, 65.5]],
      look: [[57.5, 1.25, 72.5], [57.2, 1.2, 72.4]],
      fov: [46, 42],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
};

// ---- el facón relámpago: el rayo salta de muerto en muerto y un tajo largo ----
export const e_facon = {
  map: 'esteros',
  pre: 1.1,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.022, mist: 0.5 });
    fp(c, { weapon: 'porongo', x: 34.4, z: 71.5, yaw: -Math.PI / 2 - 0.3, pitch: -0.02 });
    g.weapons.giveTemp?.('facon', 60);
    c.data.zs = [[40.6, 73.6], [42.2, 72.0], [43.8, 74.8], [41.8, 76.0], [45.2, 72.6], [43.4, 70.6], [46.6, 75.4]].map(([x, z]) => zombieAt(g, x, z, { speed: 'walk', hp: 5000 }));
  },
  before(c, t, dt) {
    // la mira: al grupo del agua (y ahí se queda; no se va al pajonal)
    track(c, c.data.aimAt || (c.data.aimAt = new THREE.Vector3(43, 1.1, 73.6)), dt, { freq: 3, damp: 0.9 });
    const m = c.g.input.mouse;
    m.rightPressed = t >= -0.12 && t < -0.1;
    m.left = t >= 0.62 && t < 0.72;
  },
};

// ---- el Luisón en la laguna, contra la luna, aullando ----
const LU = new THREE.Vector3(56.2, 0, 71.8);
export const e_luison = {
  map: 'esteros',
  pre: 0.4,
  exposure: 0.78,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.018, mist: 0.7 });
    // (el cebo en tierra firme: en el agua se hundía y la imagen salía teñida de agua)
    bait(g, 42.5, 44.5);
    const b = g.zombies.spawnBoss(10, { kind: 'luison', at: LU.clone(), quiet: true });
    c.data.b = b;
    c.data.y = b ? b.pos.y : 0;
    // mirando a la cámara (de espaldas a la luna)
    if (b) b.yaw = Math.atan2(49.6 - LU.x, 64.2 - LU.z) + Math.PI;
    c.cam({
      pos: [[50.2, 0.42, 64.8], [50.9, 0.5, 65.6]],
      look: [[56.2, 2.6, 71.8], [56.2, 3.1, 71.8]],
      fov: [38, 33],
      hand: { amp: 0.008, freq: 0.4 },
    });
  },
  frame(c, t) {
    const b = c.data.b;
    if (!b) return;
    b.pos.x = LU.x;
    b.pos.z = LU.z;
    if (b.state !== 'howl') {
      c.g.zombies.setState(b, 'howl');
      b.stateT = 0.2;
    }
    if (b.stateT > 2.6) b.stateT = 0.4;
  },
};

// ---- la orilla de la laguna: los cuatro contra los que salen del agua, contra la luna; el rayo del facón ----
export const e_lightning = {
  map: 'esteros',
  pre: 1.4,
  exposure: 0.8,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.018, mist: 0.7 });
    bait(g, 42.5, 44.5);
    const crew = c.newCrew();
    const yaw = 0.68;
    const set = [[0, 'algarrobo', 1, 42.2, 63.4], [1, 'imperial', 0, 43.0, 62.0], [2, null, 0, 43.9, 60.9], [3, 'camionero', 1, 44.8, 59.6]];
    c.data.gs = set.map(([id, w, up, x, z], i) => {
      const G = crew.add(id, { gun: w, up });
      G.at(x, z, yaw);
      if (w) G.set(i === 3 ? 'kneel' : 'aim').auto(0.24, { range: 18, cone: 0.35 });
      return G;
    });
    const F = c.data.gs[2];
    F.set('ready');
    F.aim(new THREE.Vector3(51, 1.2, 69));
    c.data.F = F;
    c.data.zs = [];
    c.data.q = cues([
      ...[[48.6, 65.8], [49.6, 64.2], [47.8, 67.4], [50.2, 67.2], [48.9, 62.8], [46.9, 65.4], [49.1, 68.6], [47.2, 63.6]].map(([x, z], i) => [-1.3 + i * 0.12, () => {
        const z0 = zombieAt(g, x, z, { speed: 'walk', hp: 900 });
        if (z0) c.data.zs.push(z0);
      }]),
    ]);
    // desde el agua, a la altura de los muertos: los cuatro de frente en la orilla
    c.cam({
      pos: [[53.4, 0.75, 66.4], [52.2, 0.95, 65.6]],
      look: [[43.8, 1.5, 61.6], [43.6, 1.7, 61.4]],
      fov: [48, 42],
      hand: { amp: 0.012, freq: 0.7 },
    });
  },
  frame(c, t) {
    const D = c.data;
    const g = c.g;
    D.q(c, t);
    if (t >= 0.35 && !D.cast) {
      D.cast = true;
      D.F.aim(null).do('raise');
    }
    // el rayo: del cielo al facón y de ahí salta de muerto en muerto
    if (t >= 0.95 && !D.bolt) {
      D.bolt = true;
      const hand = tv.set(0, -0.19, 0).applyMatrix4(D.F.a.mats[6]).clone();
      g.fx.lightning(tw.set(hand.x, hand.y + 30, hand.z), hand, 0xcfe8ff, 0.4);
      g.fx.flash(hand, 0x9ad0ff, 20, 0.4, 20);
      let prev = hand;
      const list = D.zs.filter((z) => z.active && !z.dead).sort((a, b) => a.pos.distanceTo(hand) - b.pos.distanceTo(hand)).slice(0, 7);
      list.forEach((z, i) => {
        const at = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.2, z.pos.z);
        const from = prev.clone();
        g.later(i * 0.06, () => {
          g.fx.lightning(from, at, 0x9ac8ff, 0.3);
          g.fx.electric(at, 14);
          g.water?.splash?.(at.x, at.z, 0.6, { sound: false });
          g.zombies.damage(z, 1e9, { type: 'chain', point: at });
        });
        prev = at;
      });
      c.rig.kick(0.7);
    }
  },
};

// ---- el Luisón carga por la laguna hacia la cámara (cámara lenta, salpicando) ----
export const e_charge = {
  map: 'esteros',
  pre: 0.5,
  exposure: 0.78,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.018, mist: 0.7 });
    // el cebo en la orilla, atrás de la cámara: corre derecho hacia ella
    bait(g, 44.2, 62.2);
    const at = new THREE.Vector3(56.0, 0, 71.0);
    const b = g.zombies.spawnBoss(10, { kind: 'luison', at, quiet: true });
    if (b) {
      b.pos.x = at.x;
      b.pos.z = at.z;
      b.yaw = Math.atan2(44.2 - at.x, 62.2 - at.z) + Math.PI;
      b.holdT = 0;
      g.zombies.setState(b, 'chase');
    }
    c.data.b = b;
    c.data.speed = ramp([[-9, 1.3], [1.2, 1.3], [1.7, 0.6]]);
    c.cam({
      pos: [[51.2, 0.42, 65.4], [50.8, 0.5, 65.0]],
      look: (u, out) => (b ? out.set(b.pos.x, (b.pos.y || 0) + 1.9, b.pos.z) : out.set(56, 1.6, 71)),
      lag: 0.15,
      fov: [40, 48],
      hand: { amp: 0.014, freq: 0.8 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    const b = c.data.b;
    if (!b) return;
    // salpica al correr por el agua
    if (Math.random() < 0.6) c.g.water?.splash?.(b.pos.x + (Math.random() - 0.5), b.pos.z + (Math.random() - 0.5), 0.5, { sound: false });
    if (t > 1.6) c.rig.kick(0.3);
  },
};

// ---- la Pesquería: los cuatro en la orilla del rancho sobre pilotes, los muertos salen del riacho ----
export const e_pesca = {
  map: 'esteros',
  pre: 1.2,
  exposure: 0.9,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.02, mist: 0.6 });
    bait(g, 66.4, 34.2);
    const crew = c.newCrew();
    const set = [[0, 'algarrobo', 1, 65.2, 32.8], [1, 'imperial', 0, 65.6, 34.4], [2, 'camionero', 1, 66.2, 36.0], [3, 'lata', 1, 66.8, 31.4]];
    c.data.gs = set.map(([id, w, up, x, z], i) => {
      const G = crew.add(id, { gun: w, up });
      G.at(x, z, -Math.PI / 2);
      G.set(i === 1 ? 'kneel' : 'aim').auto(0.18, { range: 14, cone: 0.35 });
      return G;
    });
    for (const [x, z] of [[58.2, 31.2], [57.4, 33.6], [59.0, 35.4], [56.6, 29.4], [58.6, 37.4], [57.0, 36.2], [59.6, 30.2]]) zombieAt(g, x, z, { speed: 'walk', hp: 900 });
    c.cam({
      pos: [[73.8, 1.25, 38.6], [72.6, 1.35, 38.0]],
      look: [[64.2, 1.3, 33.0], [63.2, 1.3, 32.8]],
      fov: [46, 42],
      hand: { amp: 0.012, freq: 0.7 },
    });
  },
};

// ---- los yacarés: salen del agua de la laguna y se tiran a la cámara ----
export const e_yacare = {
  map: 'esteros',
  pre: 1.0,
  exposure: 0.78,
  setup(c) {
    const g = c.g;
    weather(g, 'clear', { fog: 0.018, mist: 0.7 });
    bait(g, 44.2, 62.2);
    c.data.q = cues([
      [-0.9, () => dogAt(g, 55.2, 70.6, { kind: 'yacare' })],
      [-0.6, () => dogAt(g, 53.6, 71.8, { kind: 'yacare' })],
      [-0.3, () => dogAt(g, 56.6, 68.2, { kind: 'yacare' })],
    ]);
    c.data.speed = ramp([[-9, 1], [0.3, 1], [0.6, 0.55]]);
    c.cam({
      pos: [[50.4, 0.32, 64.8], [50.7, 0.3, 65.1]],
      look: [[55.2, 0.6, 70.2], [54.4, 0.55, 69.2]],
      fov: [46, 52],
      hand: { amp: 0.014, freq: 0.9 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};
