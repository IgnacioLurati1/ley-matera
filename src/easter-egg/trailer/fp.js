import * as THREE from 'three';
import { spring, angDiff } from './kit';

// Primera persona: el jugador de verdad, con el mate de verdad. La toma mueve
// la mira (con resortes, como una mano: se pasa un poquito y vuelve), aprieta
// el gatillo y camina con las teclas. El retroceso, el fogonazo, la sangre y
// las muertes son los del juego.

const tv = new THREE.Vector3();

export function fp(c, { weapon = 'porongo', up = 0, x, z, y = null, yaw = 0, pitch = 0 } = {}) {
  const g = c.g;
  c.fp = true;
  c.S.fp = true;
  const W = g.weapons;
  W.reset();
  if (weapon !== 'porongo' || up) W.give(weapon, up);
  const p = g.player;
  p.pos.set(x, y ?? (g.world.levels ? g.world.floorAt(x, z) : 0), z);
  p.vel?.set(0, 0, 0);
  p.yaw = yaw;
  p.pitch = pitch;
  c.aim = { yaw: { x: yaw, v: 0 }, pitch: { x: pitch, v: 0 } };
  c.trig = { on: false, semi: false, every: 0.2, t: 0 };
  return p;
}

// La mira hacia un punto (Vector3), un muerto (a la cabeza) o [yaw, pitch].
// freq: rapidez de la mano (Hz); damp < 1 se pasa un poco del blanco.
export function track(c, target, dt, { freq = 4, damp = 0.78, head = true } = {}) {
  const g = c.g;
  const p = g.player;
  let yaw;
  let pitch;
  if (Array.isArray(target)) [yaw, pitch] = target;
  else {
    let at = target;
    if (target?.pos) {
      if (target.dead || !target.active) return 0;
      at = target.mats?.[2] ? tv.setFromMatrixPosition(target.mats[head ? 2 : 1]) : tv.set(target.pos.x, (target.pos.y || 0) + 1.5, target.pos.z);
    }
    const ex = p.pos.x;
    const ey = p.pos.y + p.eye;
    const ez = p.pos.z;
    const dx = at.x - ex;
    const dy = at.y - ey;
    const dz = at.z - ez;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  const A = c.aim;
  // (el giro por el camino corto)
  A.yaw.x = p.yaw;
  A.pitch.x = p.pitch;
  const yw = p.yaw + angDiff(p.yaw, yaw);
  spring(A.yaw, yw, freq, dt, damp);
  spring(A.pitch, pitch, freq, dt, damp);
  p.yaw = A.yaw.x;
  p.pitch = A.pitch.x;
  return Math.abs(angDiff(p.yaw, yaw)) + Math.abs(pitch - p.pitch);
}

// Gatillo: on (mantenido) o semi (un toque cada `every` segundos).
export function trigger(c, on, { semi = false, every = 0.22 } = {}) {
  const T = c.trig;
  if (on && !T.on) T.t = 0;
  T.on = on;
  T.semi = semi;
  T.every = every;
}

// Cada cuadro, antes de g.update (lo llama la toma en pre()).
export function fpInput(c, dt) {
  const g = c.g;
  const m = g.input.mouse;
  const T = c.trig;
  if (!T) return;
  if (!T.on) {
    // (suelta solo el clic que apretó él: las tomas que manejan el mouse a mano lo dejan)
    if (T.was) m.left = false;
    T.was = false;
    return;
  }
  T.was = true;
  if (T.semi) {
    T.t -= dt;
    if (T.t <= 0) {
      T.t = T.every;
      m.left = true;
      m.leftPressed = true;
    } else m.left = false;
  } else {
    m.left = true;
    if (T.t === 0) m.leftPressed = true;
    T.t += dt;
  }
}

export function keys(c, list) {
  const I = c.g.input;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'Space']) {
    if (list.includes(k)) I.down.add(k);
    else I.down.delete(k);
  }
}

// Clic derecho (apuntar / el segundo disparo de los mates que lo tienen).
export function ads(c, on, pressed = false) {
  const m = c.g.input.mouse;
  m.right = on;
  if (pressed) m.rightPressed = true;
}
