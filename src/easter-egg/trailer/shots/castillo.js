import * as THREE from 'three';
import { lerp, span, orbitAt, E } from '../kit';
import { zombieAt, ring, bait, weather } from '../horde';
import { fp, track } from '../fp';
import { cues, ramp, nearestAim } from './molino';

// Der Mateendrache (el castillo en la cordillera, de noche y nevando): el
// Patio de Armas (y = 24, x 42-61, z 46-61), el Gran Salón al norte (y = 28)
// con el dragón posado en el techo (52, 42.7, 40.5), la cumbre arriba.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const PY = 24;

// El dragón en el techo del Gran Salón, mirando al patio.
function dragonOnRoof(g) {
  const Dr = g.ee?.dragon;
  if (!Dr) return null;
  Dr.mode = 'roof';
  Dr.flight = null;
  Dr.place('roof');
  Dr.D.root.visible = true;
  Dr.D.setPose('stand', 0.01);
  Dr.D.eyes = 1;
  Dr.spitT = 1e9;
  return Dr;
}

// ---- 1 · el castillo en la tormenta de nieve, desde el aire ----
export const c_reveal = {
  map: 'castillo',
  pre: 0.3,
  setup(c) {
    const g = c.g;
    bait(g, 52, 60.3, PY);
    c.cam({
      pos: [[24, 88, 142], [34, 76, 118]],
      look: [[52, 34, 36], [52, 32, 38]],
      u: 'out2',
      fov: [44, 40],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
};

// ---- el Pillán en la Gruta del Glaciar: la erupción cargada entre el hielo ----
export const c_fire = {
  map: 'castillo',
  pre: 2.4,
  setup(c) {
    const g = c.g;
    fp(c, { weapon: 'pillan', up: 1, x: 93.6, z: 52.4, y: 16, yaw: 0.2, pitch: -0.04 });
    for (const [x, z] of [[91.4, 45.6], [93.2, 44.8], [94.6, 46.2], [90.2, 44.0], [92.4, 43.2], [95.8, 44.4], [89.4, 46.4]]) zombieAt(g, x, z, { speed: 'walk', hp: 2500 });
  },
  before(c, t, dt) {
    const tgt = nearestAim(c.g);
    track(c, tgt ? tgt : [0, -0.04], dt, { freq: 3, damp: 0.9, head: false });
    const m = c.g.input.mouse;
    // carga (mantener) y larga en el golpe; después dos bolas sueltas
    // (el mate tarda en levantarse: la carga arranca con él ya arriba)
    const hold = t > -1.7 && t < 0;
    m.left = hold || (t >= 0.5 && t < 0.52) || (t >= 0.85 && t < 0.87);
    m.leftPressed = (t > -1.7 && t < -1.683) || (t >= 0.5 && t < 0.517) || (t >= 0.85 && t < 0.867);
  },
};

// ---- el Penitente en las Termas del Inca: la ventisca cargada congela a los que salen del vapor ----
export const c_ice = {
  map: 'castillo',
  pre: 1.2,
  setup(c) {
    const g = c.g;
    bait(g, 44.2, 86.2, 20);
    const crew = c.newCrew();
    const G = crew.add(2, { gun: 'penitente', up: 1 });
    G.at(44.2, 86.2, Math.PI / 2, 20).set('aim');
    G.aim(new THREE.Vector3(50.5, 21.2, 86.8));
    c.data.G = G;
    for (const [x, z] of [[49.4, 86.2], [50.6, 84.8], [51.4, 87.4], [52.8, 86.0], [53.6, 84.4], [50.2, 88.6]]) zombieAt(g, x, z, { speed: 'walk', hp: 3000 });
    c.data.speed = ramp([[-9, 1], [0.3, 1], [0.4, 0.45]]);
    // de atrás del gaucho, bajito, con las piletas humeando
    c.cam({
      pos: [[41.4, 20.6, 89.4], [42.2, 20.8, 89.8]],
      look: [[46.2, 21.3, 86.6], [49.8, 21.3, 86.4]],
      fov: [48, 44],
      hand: { amp: 0.012, freq: 0.7 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    const D = c.data;
    const E = c.g.weapons.elem;
    if (t >= 0.02 && !D.a) {
      D.a = true;
      if (E) E.charged = true;
      D.G.fire({ kick: 1.6 });
      if (E) E.charged = false;
      c.rig.kick(0.5);
    }
  },
};

// ---- el Caballero Negro: carga con la lanza por la liza del Palenque ----
export const c_caballero = {
  map: 'castillo',
  pre: 0.3,
  setup(c) {
    const g = c.g;
    bait(g, 23.5, 68.4, 24);
    const b = g.zombies.spawnBoss(12, { kind: 'caballero', at: new THREE.Vector3(23.5, 24, 59.6) });
    if (b) {
      b.pos.x = 23.5;
      b.pos.z = 59.6;
      b.yaw = Math.PI;
      g.zombies.setState(b, 'intro');
    }
    c.data.b = b;
    for (const [x, z] of [[20.8, 59.2], [26.2, 59.4], [19.4, 60.8], [27.6, 60.6]]) zombieAt(g, x, z, { speed: 'walk' });
    // en la punta de la liza, bajito: viene derecho
    c.cam({
      pos: [[23.9, 24.4, 67.2], [23.8, 24.45, 66.6]],
      look: (u, out) => (b ? out.set(b.pos.x, (b.pos.y || 24) + 2.1, b.pos.z) : out.set(23.5, 26, 60)),
      lag: 0.2,
      fov: [42, 38],
      hand: { amp: 0.012, freq: 0.7 },
    });
  },
};

// ---- el Mateendrache en el techo del Gran Salón: ruge y escupe fuego al patio ----
export const c_dragon = {
  map: 'castillo',
  pre: 0.8,
  setup(c) {
    const g = c.g;
    bait(g, 44, 58, PY);
    const Dr = dragonOnRoof(g);
    c.data.Dr = Dr;
    c.data.zs = ring(g, 50.5, 50.5, 12, { r0: 0.5, r1: 3, speed: 'walk', hp: 4000 });
    c.data.q = cues([
      [0.2, () => {
        if (!Dr) return;
        Dr.D.open(1);
        Dr.fire?.roar?.(Dr.D.root.position);
        c.rig.kick(0.6);
      }],
      [0.8, () => {
        if (!Dr) return;
        const z = c.data.zs.find((q) => q.active && !q.dead) || { pos: tv.set(50.5, PY, 50.5) };
        Dr.spitAt(z);
      }],
    ]);
    // desde el adarve, con lente larga: el dragón de frente arriba del Gran Salón
    c.cam({
      pos: [[49.6, 33.9, 63.4], [50.2, 34.2, 62.4]],
      look: [[52, 48.4, 41.2], [52, 46.2, 42.4]],
      u: 'io2',
      fov: [34, 38],
      hand: { amp: 0.012, freq: 0.6 },
    });
  },
  frame(c, t) {
    const Dr = c.data.Dr;
    if (!Dr) return;
    c.data.q(c, t);
    if (t < 0.8) Dr.D.look(tv.set(47, PY + 1, 50));
  },
  stop(c) {
    const Dr = c.data.Dr;
    if (Dr) {
      Dr.jet = null;
      Dr.D.open(0);
      Dr.D.look(null);
    }
  },
};

// ---- los cuatro por el pasillo de la capilla, en cámara lenta, entre la luz de los vitrales ----
export const c_herowalk = {
  map: 'castillo',
  pre: 1.2,
  setup(c) {
    const g = c.g;
    bait(g, 68.5, 46, 28);
    const crew = c.newCrew();
    const set = [[0, 'pillan', 1, 68.0, 35.4], [1, 'zonda', 1, 69.0, 35.4], [2, 'illapa', 1, 67.7, 34.0], [3, 'penitente', 1, 69.3, 34.0]];
    c.data.gs = set.map(([id, w, up, x, z]) => {
      const G = crew.add(id, { gun: w, up });
      G.at(x, z, 0, 28).set('ready');
      G.go([[x, z], [x, z + 7]], 2.3, { run: false });
      return G;
    });
    c.T.scale = 0.5;
    // polvo en la luz: brillitos que flotan en los haces
    c.data.dust = 0;
    c.cam({
      pos: [[68.5, 28.6, 43.6], [68.5, 28.65, 43.0]],
      look: [[68.5, 30.0, 35.0], [68.5, 29.9, 36.4]],
      fov: [46, 42],
      hand: { amp: 0.008, freq: 0.5 },
    });
  },
  frame(c, t) {
    const g = c.g;
    if (Math.random() < 0.5) g.fx.sparkle?.(tv.set(66 + Math.random() * 5, 29 + Math.random() * 3, 34 + Math.random() * 7), [1, 0.92, 0.7], 1, 0.4);
  },
};

// ---- el vuelo: los cuatro en el lomo del Mateendrache, rodeando el castillo en la tormenta ----
const RIDE = [[-0.55, 2.9], [0.55, 2.9], [-0.5, 1.3], [0.5, 1.3]];
export const c_flight = {
  map: 'castillo',
  pre: 5.2,
  setup(c) {
    const g = c.g;
    const E = g.ee;
    E.debugFinal?.();
    E.startWar?.();
    c.data.A = g.arena;
    const crew = c.newCrew();
    const guns = [['pillan', 1], ['illapa', 1], ['zonda', 1], ['penitente', 1]];
    c.data.gs = guns.map(([w, up], i) => {
      const G = crew.add(i, { gun: w, up });
      G.set(i % 2 ? 'aim' : 'ready');
      G.off = RIDE[i];
      // a caballo del dragón: piernas abiertas y dobladas, el cuerpo adelante
      G.poseFn = (o) => {
        Object.assign(o, { hipLp: -1.35, hipRp: -1.35, hipLr: -0.42, hipRr: 0.42, knL: 1.25, knR: 1.25, ground: 0.02 });
        o.torsoP += 0.18;
      };
      return G;
    });
    c.data.seat = new THREE.Vector3();
    c.cam({
      // al costado del dragón (en su propio marco), un poco atrás: el castillo abajo
      pos: (u, out) => {
        const D = c.data.A?.D;
        if (!D) return out.set(60, 70, 60);
        return out.set(lerp(15, 11, u), lerp(2, 4.5, u), lerp(-4, 1, u)).applyMatrix4(D.root.matrixWorld);
      },
      look: (u, out) => {
        const D = c.data.A?.D;
        if (!D) return out.set(52, 40, 40);
        return out.set(0, 2.2, 2.2).applyMatrix4(D.root.matrixWorld);
      },
      lag: 0.08,
      fov: [48, 44],
      hand: { amp: 0.012, freq: 0.6 },
    });
  },
  frame(c, t) {
    const D = c.data.A?.D;
    if (!D) return;
    const yaw = c.data.A.rideYaw ?? D.root.rotation.y;
    for (const G of c.data.gs) {
      const s = c.data.seat.set(G.off[0], 3.25, G.off[1]).applyMatrix4(D.root.matrixWorld);
      G.lockY = s.y;
      G.pos.set(s.x, 0, s.z);
      G.yaw = yaw;
      if (G.mode === 'aim') G.aim(tv.set(s.x + Math.cos(yaw) * (G.off[0] > 0 ? -12 : 12), s.y - 8, s.z - Math.sin(yaw) * (G.off[0] > 0 ? -12 : 12)).clone());
    }
  },
};
