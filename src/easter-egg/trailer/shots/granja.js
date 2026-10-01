import * as THREE from 'three';
import { lerp, span, orbitAt, E } from '../kit';
import { zombieAt, ring, bait, weather, dogAt } from '../horde';
import { cues, ramp } from './molino';
import { fp, track } from '../fp';

// La Tapera (Misiones, 1987, al atardecer): el sol bajo hacia el oeste
// (x-, z-), la chacra roja, el molino de viento, el maizal y el Cuervo.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();

// El Cuervo manejado a mano: se lo saca del cerebro del juego (solo anima) y
// la toma lo lleva. state: 'circle' (vuela/planea), 'aim' (se para en el aire
// y aletea fuerte), 'dive' (toma aire y se tira).
function crowPuppet(g) {
  const C = g.crow;
  if (!C) return null;
  C.spawn(10);
  const upd = C.update;
  C.update = (dt) => {
    C.updateFeathers(dt);
    if (!C.z.active) return;
    C.t += dt;
    C.animate(dt);
  };
  return {
    C,
    z: C.z,
    state(s) {
      if (C.state !== s) C.setState(s);
    },
    restore() {
      C.update = upd;
      C.remove();
    },
  };
}

// El cuerpo de verdad del Cuervo (entities/crowSkin.js) baja cuando llega: se
// espera (el que corre las tomas espera el setup), si no salen sus piezas.
async function crowSkinReady(g) {
  for (let i = 0; i < 200 && g.crow?.skin && g.crow.skin.state < 2; i++) await new Promise((r) => setTimeout(r, 50));
}

// ---- 1 · La Tapera: el molino de viento contra el sol, el Cuervo cruza ----
export const g_reveal = {
  map: 'granja',
  pre: 0.6,
  async setup(c) {
    const g = c.g;
    bait(g, 40, 30);
    const K = crowPuppet(g);
    await crowSkinReady(g);
    c.data.K = K;
    // el vuelo: de la derecha a la izquierda, planeando delante del sol
    c.data.path = [new THREE.Vector3(74, 10.5, 66), new THREE.Vector3(70.5, 9.2, 56.5), new THREE.Vector3(64.5, 8.4, 47.5)];
    K?.state('circle');
    c.cam({
      pos: [[78.0, 1.9, 60.4], [77.6, 2.3, 59.8]],
      look: [[69.4, 6.2, 50.4], [69.6, 6.9, 50.8]],
      fov: [44, 40],
      hand: { amp: 0.006, freq: 0.4 },
    });
  },
  frame(c, t) {
    const K = c.data.K;
    if (!K) return;
    const P = c.data.path;
    const u = Math.max(0, Math.min(1, (t + 0.6) / (c.S.dur + 0.6)));
    const a = u < 0.5 ? tv.lerpVectors(P[0], P[1], u * 2) : tv.lerpVectors(P[1], P[2], (u - 0.5) * 2);
    const z = K.z;
    tw.subVectors(a, z.pos);
    if (tw.lengthSq() > 1e-6) z.yaw = Math.atan2(tw.x, tw.z);
    z.pos.copy(a);
    // planea (alas abiertas quietas): el glide del cuervo sale de su t
    K.C.t = 1.2;
  },
  stop(c) {
    c.data.K?.restore();
  },
};

// ---- los cuatro: espalda con espalda, la horda en cámara lenta, levantan los mates en el golpe ----
const H = new THREE.Vector3(36.5, 0, 37.2);
export const g_hero = {
  map: 'granja',
  pre: 1.6,
  setup(c) {
    const g = c.g;
    bait(g, H.x, H.z);
    const crew = c.newCrew();
    const guns = [['algarrobo', 1], ['lata', 1], ['imperial', 1], ['camionero', 1]];
    const modes = ['aim', 'aim', 'aim', 'kneel'];
    c.data.gs = guns.map(([w, up], i) => {
      const a = (i / 4) * Math.PI * 2 + 0.55;
      const G = crew.add(i, { gun: w, up });
      G.at(H.x + Math.sin(a) * 0.8, H.z + Math.cos(a) * 0.8, a).set('ready');
      G.faceA = a;
      G.aimMode = modes[i];
      return G;
    });
    c.data.zs = ring(g, H.x, H.z, 26, { r0: 4.6, r1: 11, speed: 'run' });
    c.T.scale = 0.32;
    // la cámara: da la vuelta (pasando a contraluz) y se cierra sobre el colorado
    const red = c.data.gs[0];
    c.cam({
      pos: (u, out, t) => {
        const k = E.io2(u);
        orbitAt(H, lerp(0.15, 2.05, k), lerp(5.2, 2.3, k), lerp(0.55, 1.45, k), out);
        // el final: se arrima a la cara del colorado
        const f = span(t, c.S.dur - 0.6, c.S.dur, 'in2');
        if (f > 0) {
          red.head(tw);
          out.lerp(tv.set(tw.x + Math.sin(red.faceA + 0.9) * 0.9, tw.y + 0.02, tw.z + Math.cos(red.faceA + 0.9) * 0.9), f * 0.75);
        }
        return out;
      },
      look: (u, out, t) => {
        const f = span(t, c.S.dur - 0.9, c.S.dur, 'io2');
        red.head(tw);
        return out.set(lerp(H.x, tw.x, f), lerp(1.15, tw.y, f), lerp(H.z, tw.z, f));
      },
      fov: (u, t) => lerp(50, 38, span(t, c.S.dur - 0.9, c.S.dur, 'io2')),
      hand: { amp: 0.01, freq: 0.5 },
    });
  },
  frame(c, t) {
    const D = c.data;
    // antes del golpe: mates bajos, miran a los que vienen
    if (t < 0.28) {
      for (const G of D.gs) {
        G.lookAt = () => tv.set(H.x + Math.sin(G.faceA) * 8, 1.2, H.z + Math.cos(G.faceA) * 8);
      }
    } else if (!D.up) {
      // el golpe (pulso 32): los cuatro levantan los mates a la vez
      D.up = true;
      for (const G of D.gs) {
        const a = G.faceA;
        G.set(G.aimMode).aim(new THREE.Vector3(H.x + Math.sin(a) * 9, 1.3, H.z + Math.cos(a) * 9));
      }
      c.rig.kick(0.5);
    }
  },
};

// ---- el Porongo Explosivo en los tablones del yerbal: un tiro a la tanda y vuelan ----
export const g_tp_blast = {
  map: 'granja',
  pre: 1.4,
  setup(c) {
    const g = c.g;
    bait(g, 11.6, 14.6);
    const crew = c.newCrew();
    const G = crew.add(1, { gun: 'porongo', up: 1 });
    G.at(11.6, 14.6, Math.PI / 2).set('aim');
    c.data.G = G;
    c.data.zs = [[19.6, 14.4], [20.4, 15.8], [20.8, 13.2], [21.8, 14.8], [21.2, 16.8]].map(([x, z]) => zombieAt(g, x, z, { speed: 'run', hp: 600 }));
    G.aim(() => tv.set(19.4, 1.0, 14.6));
    c.data.speed = ramp([[-9, 1], [0.3, 1], [0.34, 0.3], [0.9, 0.3], [1.12, 0.8]]);
    // bajita, de costado entre las filas de yerba, contra el sol
    c.cam({
      pos: [[9.0, 0.95, 17.4], [9.8, 1.05, 17.2]],
      look: [[16.0, 1.2, 14.6], [18.6, 1.3, 14.6]],
      fov: [48, 44],
      hand: { amp: 0.012, freq: 0.9 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    const D = c.data;
    if (t >= 0 && !D.shot) {
      D.shot = true;
      D.G.fire({ kick: 1.8 });
    }
    // (la bala llega a los 0,19 s: un fogonazo más grande encima del del juego)
    if (t >= 0.19 && !D.boom) {
      D.boom = true;
      const p = tv.set(19.6, 0.9, 14.6);
      c.g.fx.explosion(p, 4.2, [1, 0.5, 0.18]);
      c.g.fx.flash(p, 0xff8a40, 18, 0.5, 14);
      c.rig.kick(0.9);
    }
  },
};

// ---- los caballos: la tropilla muerta a todo galope por el corral, el molino de viento atrás ----
export const g_horses = {
  map: 'granja',
  pre: 2.4,
  setup(c) {
    const g = c.g;
    bait(g, 58.6, 50.4);
    c.data.q = cues([
      [-2.3, () => dogAt(g, 71.6, 48.4, { kind: 'horse' })],
      [-2.2, () => dogAt(g, 72.8, 51.6, { kind: 'horse' })],
      [-2.0, () => dogAt(g, 70.4, 53.6, { kind: 'horse' })],
      [-1.9, () => dogAt(g, 73.6, 50.2, { kind: 'horse' })],
    ]);
    c.data.speed = ramp([[-9, 1], [-0.1, 1], [0.1, 0.62]]);
    c.cam({
      pos: [[59.4, 0.28, 50.6], [59.8, 0.24, 50.7]],
      look: [[69, 1.6, 51.2], [67.5, 1.8, 51.2]],
      fov: [46, 52],
      hand: { amp: 0.016, freq: 1.1 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    c.data.q(c, t);
    if (t > 0.6) c.rig.kick(0.25);
  },
};

// ---- el Cuervo: se para en el aire contra el sol, grazna y se tira encima ----
export const g_crow = {
  map: 'granja',
  pre: 0.4,
  async setup(c) {
    const g = c.g;
    bait(g, 20.4, 31.4);
    const K = crowPuppet(g);
    await crowSkinReady(g);
    c.data.K = K;
    c.data.home = new THREE.Vector3(11.2, 6.4, 26.4);
    c.data.cam = new THREE.Vector3(19.8, 0.55, 31.2);
    if (K) {
      K.z.pos.copy(c.data.home);
      K.z.yaw = Math.atan2(c.data.cam.x - K.z.pos.x, c.data.cam.z - K.z.pos.z);
      K.state('aim');
    }
    c.cam({
      pos: [[19.8, 0.55, 31.2], [19.4, 0.5, 31.0]],
      look: (u, out, t) => {
        const z = K?.z.pos || c.data.home;
        return out.set(lerp(12.0, z.x, 0.6), lerp(5.2, z.y, 0.6), lerp(26.8, z.z, 0.6));
      },
      lag: 0.12,
      fov: [42, 50],
      hand: { amp: 0.012, freq: 0.7 },
    });
  },
  frame(c, t) {
    const D = c.data;
    const K = D.K;
    if (!K) return;
    const z = K.z;
    if (t < 1.05) {
      // quieto en el aire, subiendo y bajando con cada aletazo
      z.pos.set(D.home.x, D.home.y + Math.sin(t * 7.5) * 0.18, D.home.z);
      if (t > 0.3 && !D.caw) {
        D.caw = true;
        K.C.caw(3);
      }
    } else {
      K.state('dive');
      // toma aire 0,6 s y después se tira a la cámara
      const k = span(t, 1.65, c.S.dur + 0.08, 'in2');
      if (t < 1.65) z.pos.y += 0.02;
      else z.pos.lerpVectors(D.home, tv.set(D.cam.x - 0.3, 1.1, D.cam.z - 0.3), k);
      z.yaw = Math.atan2(D.cam.x - z.pos.x, D.cam.z - z.pos.z);
      if (k > 0.85) c.rig.kick(0.8);
    }
  },
  stop(c) {
    c.data.K?.restore();
  },
};

// ---- el Espantapájaros: el rayo en el Prado, se levanta y ruge (de contraluz) ----
export const g_scarecrow = {
  map: 'granja',
  pre: 0.3,
  async setup(c) {
    const g = c.g;
    const A = g.arena;
    A.start();
    // (arena.start empieza a bajar el cuerpo de verdad: se espera, si no sale
    // el de piezas los primeros cuadros; entities/bossSkin.js)
    for (let i = 0; i < 200 && window.__bossSkins?.scarecrow?.state !== 2; i++) await new Promise((r) => setTimeout(r, 50));
    g.music?.stop?.(0);
    g.post.flashV = 0;
    c.data.A = A;
    weather(g, 'fog', { fog: 0.026, mist: 0.9 });
    c.data.q = cues([
      [0.12, () => {
        A.spawnBoss();
        const b = g.zombies.boss;
        if (b) g.zombies.setState(b, 'intro');
        c.rig.kick(0.7);
      }],
    ]);
    const X = A.A.x;
    const Z = A.A.z;
    c.cam({
      pos: [[X - 2.2, 0.95, Z + 5.4], [X - 1.7, 1.05, Z + 4.1]],
      look: [[X, 3.4, Z - 3], [X, 4.3, Z - 3]],
      fov: [44, 40],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
  stop(c) {
    const g = c.g;
    const A = c.data.A;
    if (A) {
      A.active = false;
      A.phase = 'off';
      A.root && (A.root.visible = false);
    }
    g.zombies.reset();
  },
};

// ---- la Hoz de la Muerte en el yerbal: la medialuna corta la fila y un tajo al que llega ----
export const g_hoz = {
  map: 'granja',
  pre: 1.1,
  setup(c) {
    const g = c.g;
    fp(c, { weapon: 'hoz', up: 1, x: 10.2, z: 12.4, yaw: -Math.PI / 2, pitch: -0.04 });
    c.data.zs = [[15.6, 12.2], [17.4, 13.6], [18.8, 11.4], [20.4, 12.8], [16.8, 10.6], [22.2, 12.2], [13.8, 13.2]].map(([x, z], i) => zombieAt(g, x, z, { speed: i === 6 ? 'run' : 'walk', hp: 2000 }));
  },
  before(c, t, dt) {
    track(c, [-Math.PI / 2 + Math.sin(t * 2) * 0.05, -0.04], dt, { freq: 3, damp: 0.9 });
    const m = c.g.input.mouse;
    m.rightPressed = (t >= -0.25 && t < -0.233) || (t >= 0.45 && t < 0.467);
    m.left = t >= 0.8 && t < 0.95;
  },
};
