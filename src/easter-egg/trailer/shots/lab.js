import * as THREE from 'three';
import { lerp } from '../kit';
import { bait } from '../horde';

// Pruebas de poses (no van en el trailer): cinco gauchos en fila en el patio
// de La Tapera, cada uno en un modo, y la cámara pasando cerca.
const C = new THREE.Vector3(36, 0, 36);

function row(modes, extra) {
  return {
    map: 'granja',
    dur: 4,
    pre: 1.2,
    setup(c) {
      const crew = c.newCrew();
      c.data.gs = modes.map((m, i) => {
        const x = C.x - 6 + i * 3;
        const G = crew.add(i % 4, { gun: m === 'sip' || m === 'look' ? null : i % 2 ? 'algarrobo' : 'lata', up: i === 1 ? 1 : 0 });
        G.at(x, C.z, 0).set(m === 'slash' || m === 'toss' ? 'ready' : m);
        if (['aim', 'kneel', 'hip', 'slide'].includes(m)) G.aim(new THREE.Vector3(x + 2, 1.3, C.z + 9));
        if (m === 'run') G.go([[x, C.z - 5], [x, C.z + 6]], 4.8);
        return G;
      });
      bait(c.g, C.x, C.z - 30);
      c.cam({
        // de uno en uno: la cámara se para 0,8 s frente a cada gaucho, de 3/4
        pos: (u, out, t) => {
          const i = Math.min(4, Math.floor(Math.max(0, t) / 0.8));
          return out.set(C.x - 6 + i * 3 + 1.6, 1.25, C.z + 3.2);
        },
        look: (u, out, t) => {
          const i = Math.min(4, Math.floor(Math.max(0, t) / 0.8));
          return out.set(C.x - 6 + i * 3, 0.95, C.z);
        },
        fov: 50,
      });
    },
    frame(c, t) {
      extra?.(c, t);
    },
  };
}

export const labA = row(['ready', 'aim', 'kneel', 'hip', 'reload']);
export const labB = row(['slide', 'yell', 'sip', 'run', 'slash'], (c, t) => {
  const G = c.data.gs[4];
  if (t > 0 && Math.floor(t / 1.1) !== c.data.k) {
    c.data.k = Math.floor(t / 1.1);
    G.do(c.data.k % 2 ? 'slash' : 'toss');
  }
});

// Una articulación por gaucho (para ver hacia dónde gira cada cosa).
const JT = [
  { shRp: -1.57 },
  { shRr: -1.2 },
  { shLr: 1.2 },
  { elR: -1.57 },
  { torsoY: 0.8 },
  { headP: 0.5, hipLp: -1.2 },
];
function joints(side) {
  return {
    map: 'granja',
    dur: 3.6,
    pre: 1.5,
    setup(c) {
      const crew = c.newCrew();
      c.data.gs = JT.map((j, i) => {
        const G = crew.add(i % 4, { gun: null });
        if (side) G.at(C.x, C.z - 6 + i * 2.4, 0);
        else G.at(C.x - 6 + i * 2.4, C.z, 0);
        G.set('calm');
        G.poseFn = (o) => Object.assign(o, j);
        return G;
      });
      bait(c.g, C.x, C.z - 30);
      // de a uno, 0,6 s cada uno, de cerca
      const at = (t) => c.data.gs[Math.min(5, Math.floor(Math.max(0, t) / 0.6))].pos;
      c.cam(side ? { pos: (u, o, t) => o.set(at(t).x - 3, 1.2, at(t).z), look: (u, o, t) => o.set(at(t).x, 1.0, at(t).z), fov: 55 } : { pos: (u, o, t) => o.set(at(t).x, 1.2, at(t).z + 3), look: (u, o, t) => o.set(at(t).x, 1.0, at(t).z), fov: 55 });
    },
  };
}
export const labJs = joints(true);
export const labJf = joints(false);

// Pelea de prueba: espalda con espalda, la horda de todos lados.
import { ring } from '../horde';
import { orbitAt as orb } from '../kit';
export const labF = {
  map: 'granja',
  dur: 6,
  pre: 2.5,
  setup(c) {
    const g = c.g;
    const crew = c.newCrew();
    const guns = [['algarrobo', 1], ['lata', 0], ['wunder', 0], ['camionero', 1]];
    c.data.gs = [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const G = crew.add(i, { gun: guns[i][0], up: guns[i][1] });
      G.at(C.x + Math.sin(a) * 0.95, C.z + Math.cos(a) * 0.95, a).set(i === 3 ? 'kneel' : 'aim').auto(i === 2 ? 1.1 : 0.2);
      return G;
    });
    bait(g, C.x, C.z);
    ring(g, C.x, C.z, 18, { r0: 9, r1: 17, speed: 'run' });
    c.cam({
      pos: (u, out) => orb(C, lerp(0.2, 2.2, u), 5.2, 1.75, out),
      look: (u, out) => out.set(C.x, 1.05, C.z),
      fov: 55,
      hand: 0.012,
    });
  },
  frame(c, t) {
    const G = c.data.gs;
    if (t > 2 && !c.data.r) {
      c.data.r = 1;
      G[0].auto(0).aim(null).set('reload');
    }
    if (t > 3.4 && c.data.r === 1) {
      c.data.r = 2;
      G[0].set('aim').auto(0.2);
    }
  },
};
