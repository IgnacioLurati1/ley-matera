import * as THREE from 'three';
import { lerp, span, orbitAt, E } from '../kit';
import { zombieAt, ring, bait } from '../horde';
import { fp, track, ads, trigger } from '../fp';
import { borrowLight } from '../props';
import { cues, ramp, nearestAim } from './molino';
import { weaponStats } from '../../config/weapons';

// Revelaciones Materas: la torre de quince pisos (4 m cada uno, 24 x 24, el
// hueco de 8 x 8 en el medio salvo en los pisos 1, 5, 10 y 15) adentro del
// remolino. Centro (30, 30); el piso n está a y = (n - 1) · 4.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const C = new THREE.Vector3(30, 0, 30);
const Y = (n) => (n - 1) * 4;

// Un remolino del Mark III tirado desde donde sea (el agujero negro que traga muertos).
function vortex(g, from, dir, up = 1) {
  const W = g.weapons;
  const S = weaponStats('mk3', up);
  const V = S.vortex;
  const mesh = W.vortexMesh(!!up);
  W.vortexN = ((W.vortexN || 0) % 9999) + 1;
  W.spawnProjectile({ kind: 'vortex', pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(V.speed), gravity: 0, V, st: S, mesh, life: V.fly + V.life, open: false, tickT: 0, vid: W.vortexN });
}

// ---- 1 · la torre en el remolino: la grúa sube por afuera dando la vuelta ----
export const t_reveal = {
  map: 'torre',
  pre: 0.3,
  setup(c) {
    const g = c.g;
    bait(g, 30, 37, 0);
    c.cam({
      pos: (u, out) => orbitAt(C, lerp(0.35, 1.05, u), lerp(52, 46, u), lerp(6, 40, u), out),
      look: (u, out) => out.set(C.x, lerp(26, 52, u), C.z),
      u: 'io2',
      fov: [52, 58],
      hand: { amp: 0.008, freq: 0.5 },
    });
  },
};

// ---- el Mark III: el rayo atraviesa la fila y el remolino se los traga ----
export const t_mk3 = {
  map: 'torre',
  pre: 1.1,
  setup(c) {
    const g = c.g;
    fp(c, { weapon: 'mk3', up: 1, x: 21.5, z: 30, y: Y(5), yaw: -Math.PI / 2, pitch: -0.02 });
    for (const [x, z] of [[27, 29.2], [28.6, 30.8], [30.2, 29.6], [31.6, 31.4], [33.2, 29.8], [34.6, 30.6], [29.4, 27.8], [32.2, 32.8], [35.6, 28.6]]) zombieAt(g, x, z, { speed: 'walk', hp: 20000, y: Y(5) });
  },
  before(c, t, dt) {
    track(c, [-Math.PI / 2 + Math.sin(t * 1.3) * 0.04, -0.03], dt, { freq: 3, damp: 0.9 });
    const m = c.g.input.mouse;
    // el remolino primero (tarda en abrirse) y el rayo encima
    m.rightPressed = t >= -0.6 && t < -0.583;
    m.right = m.rightPressed;
    const beam = (t >= 0 && t < 0.017) || (t >= 0.36 && t < 0.377) || (t >= 0.72 && t < 0.737);
    m.left = beam;
    m.leftPressed = beam;
  },
};

// ---- la caída: un paso al hueco y los pisos pasan de largo (con el PhD cae como una bomba) ----
export const t_fall = {
  map: 'torre',
  pre: 0.2,
  setup(c) {
    const g = c.g;
    const p = fp(c, { weapon: 'gemelos', up: 1, x: 25.0, z: 29.6, y: Y(9), yaw: -Math.PI / 2, pitch: -0.35 });
    p.givePerk?.('phd');
    // los de los pisos de abajo, asomados al hueco
    for (let n = 6; n <= 8; n++) for (const [x, z] of [[25.2, 27.4], [34.6, 31.8], [29.4, 34.6], [31.2, 25.4]]) zombieAt(g, x + (n % 2) * 0.6, z, { speed: 'walk', y: Y(n) });
    for (const [x, z] of [[27.6, 28.4], [31.8, 30.2], [29.2, 32.4], [32.6, 27.2], [28.2, 31.6]]) zombieAt(g, x, z, { speed: 'run', y: Y(5) });
    c.data.walk = true;
  },
  before(c, t, dt) {
    const g = c.g;
    const p = g.player;
    // un paso adelante (al hueco) y la mirada se va para abajo
    // mira el hueco, duda, y da el paso (cae con el último tercio de la toma)
    if (t > 0.5 && t < 1.1) g.input.down.add('KeyW');
    else g.input.down.delete('KeyW');
    track(c, [-Math.PI / 2 + Math.max(0, t - 0.6) * 0.3, lerp(-0.35, -1.3, span(t, 0.2, 1.4, 'io2'))], dt, { freq: 2.2, damp: 0.95 });
  },
};

// ---- la terraza del piso 15: los cuatro tirando, el ojo del remolino arriba ----
export const t_vortex = {
  map: 'torre',
  pre: 1.4,
  exposure: 0.8,
  setup(c) {
    const g = c.g;
    const y = Y(15);
    bait(g, 30, 30, y);
    const crew = c.newCrew();
    const set = [[0, 'mk3', 1], [1, 'gemelos', 1], [2, 'mate47', 0], [3, 'camionero', 1]];
    c.data.gs = set.map(([id, w, up], i) => {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const G = crew.add(id, { gun: w, up });
      G.at(30 + Math.sin(a) * 1.1, 30 + Math.cos(a) * 1.1, a, y);
      G.set(i === 2 ? 'kneel' : 'aim').auto(i === 0 ? 0.35 : 0.2, { range: 14, cone: 0.45 });
      return G;
    });
    c.data.zs = ring(g, 30, 30, 24, { r0: 5, r1: 10.5, speed: 'run', hp: 1500, y });
    c.T.scale = 0.6;
    // desde abajo, casi en el piso, dando la vuelta: ellos recortados contra el ojo del remolino
    c.cam({
      pos: (u, out) => orbitAt(C, lerp(0.2, 1.3, u), lerp(4.6, 3.9, u), y + lerp(0.55, 0.75, u), out),
      look: (u, out) => out.set(30, y + lerp(1.9, 3.0, u), 30),
      fov: [56, 60],
      hand: { amp: 0.012, freq: 0.6 },
    });
  },
};

// ---- el Pack-a-Pava (piso 10): la pava hierve, el mate sale mejorado y brillando ----
export const t_pap = {
  map: 'torre',
  pre: 2.6,
  setup(c) {
    const g = c.g;
    const y = Y(10);
    bait(g, 24, 30, y);
    const I = g.interact;
    I.clearPap?.();
    I.startPapFor('imperial', 0, 1);
    c.data.light = borrowLight(g, 2);
    // a la altura de los ojos, arrimándose a la máquina
    c.cam({
      pos: [[21.4, y + 1.6, 27.3], [20.5, y + 1.5, 27.0]],
      look: [[18.3, y + 1.25, 26.9], [18.3, y + 1.2, 26.9]],
      u: 'io2',
      fov: [48, 42],
      hand: { amp: 0.008, freq: 0.6 },
    });
  },
  frame(c, t) {
    // la pava tira un resplandor violeta mientras trabaja
    const k = 0.8 + Math.sin(t * 19) * 0.12;
    c.data.light.set(tv.set(18.8, Y(10) + 1.4, 26.9), 0xb070ff, 3.5 * k, 6);
  },
  stop(c) {
    c.data.light?.off();
    c.g.interact.clearPap?.();
  },
};

// ---- el mate mejorado (con su camuflaje) a toda máquina en la plaza del piso 10 ----
export const t_fp_papfire = {
  map: 'torre',
  pre: 1.2,
  setup(c) {
    const g = c.g;
    const y = Y(10);
    fp(c, { weapon: 'imperial', up: 1, x: 21.6, z: 30, y, yaw: -Math.PI / 2, pitch: -0.02 });
    for (const [x, z] of [[27.2, 29.2], [28.4, 31.2], [29.8, 28.4], [31.2, 30.6], [32.6, 29.0], [33.8, 31.8], [30.4, 32.8], [34.8, 27.6], [28.8, 26.6]]) zombieAt(g, x, z, { speed: 'run', hp: 1200, y });
  },
  before(c, t, dt) {
    const tgt = nearestAim(c.g);
    track(c, tgt || [-Math.PI / 2, 0], dt, { freq: 5, damp: 0.75 });
    trigger(c, t > -0.05, {});
  },
};
