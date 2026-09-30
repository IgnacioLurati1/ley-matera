import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { makePose, solvePose } from '../entities/skeleton';
import { weaponStats } from '../config/weapons';
import { spring, angDiff, clamp01, lerp, fbm, curve } from './kit';

// Los cuatro gauchos del trailer: el mismo muñeco que los compañeros de la red
// (net/Avatars), animado acá con capas:
//  · una pose objetivo por modo (parado, apuntando, rodilla en tierra, deslizándose,
//    recargando, tajo, tiro de pava, sorbo de mate...);
//  · la marcha sale de la distancia recorrida (los pies no patinan);
//  · cada articulación va hacia su objetivo con un resorte (con su propia
//    rapidez), así los cambios de pose tienen peso y un poco de arrastre;
//  · encima: respiración, balanceo, retroceso de cada tiro y la cabeza que mira;
//  · la cadera se acomoda sola para que el pie de apoyo toque el piso.
// El mate-arma es el modelo de verdad (weapons.models) y los tiros usan las
// funciones del juego (hitscan, cadena, cono...): sangre, rayos y muertes reales.

const JOINTS = ['torsoP', 'torsoY', 'torsoR', 'headP', 'headY', 'headR', 'shLp', 'shLr', 'shRp', 'shRr', 'elL', 'elR', 'hipLp', 'hipLr', 'hipRp', 'hipRr', 'knL', 'knR', 'rootPitch', 'rootRoll', 'lift'];
// rapidez de cada resorte (Hz): los brazos rápidos, el torso con más peso
const FREQ = { torsoP: 3.2, torsoY: 3.4, torsoR: 3, headP: 4.2, headY: 4.5, headR: 3.5, shLp: 5, shLr: 5, shRp: 5.5, shRr: 5, elL: 6, elR: 6.5, hipLp: 5, hipLr: 4, hipRp: 5, hipRr: 4, knL: 6, knR: 6, rootPitch: 2.6, rootRoll: 2.6, lift: 4 };

const THIGH = 0.43;
const SHIN = 0.45;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpM = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);
const Q_HAND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ'));

// ---------------- las poses ----------------
// Cada modo escribe su objetivo en o (t: segundos en el modo, a: el gaucho).
// Brazos: pitch negativo = hacia adelante; codo negativo = doblado.
// El brazo R (x+ del muñeco) es el del mate-arma; el L sostiene por abajo.
// Rotación (r): en el R, negativa = hacia adentro (cruza el pecho) y positiva
// = hacia afuera; en el L al revés. torsoY positivo lleva el hombro R atrás.
const POSES = {
  // parado con el mate bajo, cruzado adelante (listo)
  ready(o, t, a) {
    Object.assign(o, { torsoP: 0.07, torsoY: 0.12, headY: -0.1, shRp: -0.62, shRr: -0.1, elR: -1.05, shLp: -0.95, shLr: 0.42, elL: -1.15, hipLp: -0.08, hipRp: 0.06, knL: 0.12, knR: 0.08, hipLr: 0.05, hipRr: -0.05 });
  },
  // tranquilo, brazos al costado (el de la linterna, el del mate)
  calm(o) {
    Object.assign(o, { torsoP: 0.03, shRp: -0.1, shRr: -0.1, elR: -0.25, shLp: -0.06, shLr: 0.1, elL: -0.2, knL: 0.05, knR: 0.05 });
  },
  // apuntando parado: perfilado, el mate a la altura del ojo
  aim(o, t, a) {
    const up = a.aimPitch;
    Object.assign(o, { torsoP: 0.1 - up * 0.25, torsoY: 0.32, headY: -0.28, headP: -up * 0.55 + 0.06, headR: 0.08, shRp: -1.38 - up, shRr: 0.02, elR: -0.3, shLp: -1.25 - up * 0.9, shLr: 0.52, elL: -0.7, hipLp: -0.3, hipRp: 0.22, knL: 0.26, knR: 0.12, hipLr: 0.06, hipRr: -0.08 });
  },
  // desde la cadera (corriendo o de apuro)
  hip(o, t, a) {
    const up = a.aimPitch;
    Object.assign(o, { torsoP: 0.14, torsoY: 0.2, headY: -0.18, headP: -up * 0.5, shRp: -0.95 - up * 0.8, shRr: -0.12, elR: -0.75, shLp: -0.9 - up * 0.7, shLr: 0.5, elL: -1.05, knL: 0.18, knR: 0.18 });
  },
  // rodilla en tierra, apuntando
  kneel(o, t, a) {
    const up = a.aimPitch;
    Object.assign(o, { torsoP: 0.08 - up * 0.2, torsoY: 0.3, headY: -0.26, headP: -up * 0.5, shRp: -1.4 - up, shRr: 0.02, elR: -0.28, shLp: -1.28 - up * 0.9, shLr: 0.5, elL: -0.7, hipLp: -1.38, knL: 1.5, hipRp: 0.3, knR: 1.3, hipLr: 0.12, hipRr: -0.1, ground: 0.52 });
  },
  // deslizándose de rodillas, echado para atrás, tirando
  slide(o, t, a) {
    const up = a.aimPitch;
    Object.assign(o, { rootPitch: -0.42, torsoP: 0.36 - up * 0.2, torsoY: 0.18, headP: -0.25 - up * 0.4, shRp: -1.5 - up, elR: -0.3, shLp: -1.35 - up * 0.9, shLr: 0.5, elL: -0.72, hipLp: -1.25, knL: 0.35, hipRp: -0.35, knR: 1.9, hipRr: -0.2, ground: 0.34 });
  },
  // recargando: la mano del mate baja, la otra busca la yerba en la faja y vuelve
  reload(o, t, a) {
    const k = Math.min(1, t / (a.reloadDur || 1.3));
    const dip = Math.sin(Math.PI * Math.min(1, k * 1.25));
    Object.assign(o, { torsoP: 0.16 + dip * 0.08, torsoY: 0.05, headP: 0.42 + dip * 0.1, headY: 0.08, shRp: -0.85, shRr: -0.18, elR: -1.35, knL: 0.2, knR: 0.16 });
    // la izquierda: a la faja (0-40%), vuelve al mate y empuja la carga (40-80%)
    if (k < 0.4) Object.assign(o, { shLp: lerp(-0.9, 0.15, k / 0.4), shLr: lerp(0.45, 0.2, k / 0.4), elL: lerp(-1.1, -0.35, k / 0.4) });
    else if (k < 0.8) {
      const u = (k - 0.4) / 0.4;
      Object.assign(o, { shLp: lerp(0.15, -1.05, u), shLr: lerp(0.2, 0.62, u), elL: lerp(-0.35, -1.7, u) });
    } else Object.assign(o, { shLp: -1.05, shLr: 0.55, elL: -1.4 });
    o.gunTilt = 0.9 * Math.sin(Math.PI * clamp01(k * 1.1));
  },
  // corriendo con el mate cruzado adelante
  run(o, t, a) {
    Object.assign(o, { torsoP: 0.3, torsoY: 0, headP: -0.25, shRp: -0.95, shRr: -0.15, elR: -1.35, shLp: -1.1, shLr: 0.5, elL: -1.3 });
  },
  // a los gritos, los brazos abiertos (el grito de guerra)
  yell(o) {
    Object.assign(o, { torsoP: -0.22, headP: -0.55, shRp: -0.9, shRr: 1.05, elR: -0.7, shLp: -0.9, shLr: -1.05, elL: -0.7, hipLp: -0.25, hipRp: 0.2, knL: 0.3, knR: 0.15 });
  },
  // tomando mate: lo sube a la boca y echa la cabeza un poquito atrás
  sip(o, t) {
    const k = clamp01(t / 0.9);
    Object.assign(o, { torsoP: 0.02, headP: lerp(0.12, -0.16, clamp01((t - 0.7) / 1.2)), shRp: lerp(-0.3, -1.1, k), shRr: lerp(-0.1, -0.38, k), elR: lerp(-0.4, -2.2, k), shLp: -0.1, shLr: 0.12, elL: -0.3, knL: 0.06, knR: 0.06 });
  },
  // señalando con el brazo libre (el mate abajo, en la otra)
  point(o) {
    Object.assign(o, { torsoP: 0.02, torsoY: -0.35, headY: 0.3, shLp: -1.55, shLr: -0.12, elL: -0.05, shRp: -0.5, shRr: -0.1, elR: -0.9, hipLp: -0.2, knL: 0.15, knR: 0.08 });
  },
  // atrás, mirando para arriba (algo enorme)
  awe(o) {
    Object.assign(o, { torsoP: -0.18, headP: -0.62, shRp: -0.55, shRr: -0.1, elR: -1.0, shLp: -0.4, shLr: -0.35, elL: -0.5, hipLp: 0.25, hipRp: -0.15, knL: 0.2, knR: 0.35 });
  },
  // de pie mirando (brazos flojos, el mate en la mano de abajo)
  look(o) {
    Object.assign(o, { torsoP: 0.04, shRp: -0.3, shRr: -0.12, elR: -0.7, shLp: -0.2, shLr: 0.12, elL: -0.35, knL: 0.06, knR: 0.08 });
  },
};

// Movimientos con tiempo (un golpe): devuelven true cuando terminan.
const MOVES = {
  // tajo de facón: se carga atrás y corta de arriba hacia el costado
  slash(o, t, a) {
    const wind = 0.22;
    const hit = 0.34;
    if (t < wind) {
      const u = t / wind;
      Object.assign(o, { torsoY: lerp(0.1, 0.8, u), torsoP: 0.05, shRp: lerp(-0.9, -2.45, u), shRr: lerp(-0.1, 0.55, u), elR: lerp(-1, -1.45, u), shLp: -0.9, shLr: -0.3, elL: -0.9, hipLp: -0.35, knL: 0.35, knR: 0.15 });
    } else {
      const u = clamp01((t - wind) / (hit - wind));
      Object.assign(o, { torsoY: lerp(0.8, -0.85, u), torsoP: lerp(0.05, 0.32, u), shRp: lerp(-2.45, -0.6, u), shRr: lerp(0.55, -0.5, u), elR: lerp(-1.45, -0.15, u), shLp: -0.4, shLr: -0.7, elL: -0.6, hipLp: -0.55, knL: 0.5, knR: 0.25 });
    }
    return t > 0.75;
  },
  // tirar una pava: carga el brazo por arriba y la larga hacia adelante
  toss(o, t, a) {
    const wind = 0.38;
    if (t < wind) {
      const u = t / wind;
      Object.assign(o, { torsoY: lerp(0.1, 0.7, u), torsoP: lerp(0.05, -0.18, u), shRp: lerp(-0.6, -2.7, u), shRr: lerp(-0.1, 0.35, u), elR: lerp(-0.8, -1.7, u), shLp: lerp(-0.6, -1.5, u), shLr: -0.15, elL: -0.2, hipLp: -0.4, knL: 0.3 });
    } else {
      const u = clamp01((t - wind) / 0.2);
      Object.assign(o, { torsoY: lerp(0.7, -0.6, u), torsoP: lerp(-0.18, 0.4, u), shRp: lerp(-2.7, -1.1, u), shRr: lerp(0.35, -0.3, u), elR: lerp(-1.7, -0.1, u), shLp: lerp(-1.5, -0.3, u), shLr: -0.5, elL: -0.8, hipLp: -0.6, knL: 0.55, hipRp: 0.35 });
    }
    return t > 0.95;
  },
  // levantar el mate al cielo (festejo, grito)
  raise(o, t) {
    Object.assign(o, { torsoP: -0.15, headP: -0.45, shRp: -2.85, shRr: 0.15, elR: -0.2, shLp: -0.5, shLr: -0.4, elL: -0.9, knL: 0.12, knR: 0.12 });
    return t > 1.4;
  },
};

// Dónde queda la punta del antebrazo (la mano).
const handAt = (a, part, out) => out.set(0, -0.19, 0).applyMatrix4(a.mats[part]);

export default class Crew {
  constructor(g) {
    this.g = g;
    this.people = new Avatars(g, null);
    this.list = [];
    this.t = 0;
  }

  // Un gaucho. id: el color del poncho (0 rojo, 1 azul, 2 verde, 3 dorado, 4 violeta).
  add(id, opts = {}) {
    const G = new Gaucho(this, id, opts);
    this.list.push(G);
    return G;
  }

  // dt: el tiempo del juego (cámara lenta incluida); rdt: el real (para el
  // que se mueve normal en medio de la cámara lenta)
  update(dt, rdt = dt) {
    this.t += dt;
    for (const G of this.list) G.update(G.realtime ? rdt : dt, this.t);
  }

  dispose() {
    this.people.dispose();
    this.list = [];
  }
}

export class Gaucho {
  constructor(crew, id, { gun = 'algarrobo', up = 0, x = 0, z = 0, yaw = 0, poncho = null } = {}) {
    this.crew = crew;
    this.g = crew.g;
    const people = crew.people;
    this.key = 9000 + crew.list.length * 7 + id;
    people.add({ id: this.key, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false });
    const a = people.list.get(this.key);
    // el color del poncho sale de id % 5 en Avatars.materials: se pisa con el de este gaucho
    const own = people.materials(id);
    a.M.poncho.color.copy(poncho != null ? new THREE.Color(poncho).multiplyScalar(1.7) : own.poncho.color);
    for (const m of Object.values(own)) m.dispose();
    this.a = a;
    this.P = makePose();
    this.pos = new THREE.Vector3(x, 0, z);
    this.y = 0;
    this.yaw = yaw;
    this.yawS = { x: yaw, v: 0 };
    this.mode = 'ready';
    this.modeT = 0;
    this.move = null;
    this.moveT = 0;
    this.S = {};
    for (const j of JOINTS) this.S[j] = { x: 0, v: 0 };
    this.target = {};
    this.phase = Math.random() * 6;
    this.speed = 0;
    this.aimAt = null;
    this.aimPitch = 0;
    this.aimK = { x: 0, v: 0 };
    this.lookAt = null;
    this.recoil = { x: 0, v: 0 };
    this.recoilY = { x: 0, v: 0 };
    this.seed = Math.random() * 50;
    this.path = null;
    this.hunt = null;
    this.fireT = 0;
    this.visible = true;
    this.lift = 0;
    this.extraY = 0;
    this.poseFn = null;
    this.setGun(gun, up);
    this.first = true;
  }

  // El mate-arma en la mano (null: el matecito de siempre).
  setGun(id, up = 0) {
    const a = this.a;
    const W = this.g.weapons;
    this.gunId = id;
    this.up = up;
    this.st = id ? weaponStats(id, up) : null;
    this.crew.people.setGun(a, id, up);
    this.muzzleL = new THREE.Vector3(0, 0.1, -0.2);
    const src = id && (W.models.get(`${id}|${up}`) || W.models.get(`${id}|0`));
    if (src?.muzzle) {
      // la punta de la bombilla en el espacio del modelo (sube por los padres hasta la raíz)
      const m = new THREE.Matrix4();
      let o = src.muzzle;
      const chain = [];
      while (o && o !== src.root) {
        chain.push(o);
        o = o.parent;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        chain[i].updateMatrix();
        m.multiply(chain[i].matrix);
      }
      this.muzzleL.setFromMatrixPosition(m);
      src.root.updateMatrix();
      this.muzzleL.applyMatrix4(src.root.matrix);
      // (setGun clona root: la copia trae su propia transformación, que queda debajo del holder)
    }
    return this;
  }

  // ---------------- órdenes ----------------
  at(x, z, yaw = this.yaw, y = null) {
    this.pos.set(x, 0, z);
    this.y = this.g.world.levels ? this.g.world.floorAt(x, z, y ?? undefined) : 0;
    this.yaw = yaw;
    this.yawS.x = yaw;
    this.yawS.v = 0;
    return this;
  }

  set(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.modeT = 0;
    }
    return this;
  }

  // Un movimiento de una vez (slash, toss, raise); al terminar vuelve al modo.
  do(move, onHit) {
    this.move = move;
    this.moveT = 0;
    this.onMoveHit = onHit || null;
    this.moveHit = false;
    return this;
  }

  // Mirar/apuntar a un punto (Vector3, un zombie, o una función que lo da).
  aim(target) {
    this.aimAt = target;
    return this;
  }

  // Caminar/correr por un recorrido (puntos en el piso) a una velocidad (m/s).
  go(pts, speed = 5.5, { run = true } = {}) {
    const c = curve(pts.map((p) => [p[0], 0, p[1]]));
    const len = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    this.path = { c, len, d: 0, speed, run };
    return this;
  }

  // Tirar solo: busca al muerto más cerca de su frente y le tira cada `every` segundos.
  auto(every = 0.18, { range = 22, cone = 0.55, head = true } = {}) {
    this.hunt = every ? { every, range, cone, head } : null;
    return this;
  }

  // ---------------- tiros ----------------
  aimPoint(out) {
    const t = typeof this.aimAt === 'function' ? this.aimAt() : this.aimAt;
    if (!t) return null;
    if (t.isVector3) return out.copy(t);
    // un zombie: a la cabeza (o al pecho)
    if (t.pos) {
      if (t.mats?.[2]) return out.setFromMatrixPosition(t.mats[this.aimHead === false ? 1 : 2]);
      return out.set(t.pos.x, (t.pos.y || 0) + 1.5 * (t.scale || 1), t.pos.z);
    }
    return null;
  }

  muzzle(out) {
    const gun = this.a.gun;
    if (!gun) return handAt(this.a, 6, out);
    // (muzzleL ya incluye la transformación propia del modelo, hijo del holder)
    gun.updateMatrixWorld(true);
    return out.copy(this.muzzleL).applyMatrix4(gun.matrixWorld);
  }

  // Un tiro hacia donde apunta (con el arma que tenga: usa las funciones del juego).
  fire({ spread = 0.012, kick = 1 } = {}) {
    const g = this.g;
    const W = g.weapons;
    const st = this.st;
    if (!st) return;
    const muz = this.muzzle(new THREE.Vector3());
    const at = this.aimPoint(new THREE.Vector3());
    const fwd = new THREE.Vector3();
    if (at) fwd.subVectors(at, muz).normalize();
    else fwd.set(Math.sin(this.yawS.x), 0, Math.cos(this.yawS.x));
    // el origen, un poco atrás de la punta (así no nace adentro de un muerto pegado)
    const origin = muz.clone().addScaledVector(fwd, -0.35);
    const flashCol = st.kind === 'chain' ? 0x9ac8ff : st.kind === 'mk3' ? 0x8aff9a : 0xffb060;
    if (!st.special || st.kind === 'projectile') g.fx.flash(muz, flashCol, 8, 0.06, 7);
    // (sin sonido: el trailer lleva su propia pista)
    try {
      switch (st.kind) {
        case 'hitscan':
          for (let i = 0; i < (st.pellets || 1); i++) W.hitscan(st, origin, fwd, muz, st.pellets > 1 ? Math.max(spread, st.spread || 0.05) : spread, i);
          break;
        case 'projectile':
          W.fireProjectile(st, origin, fwd, muz, spread);
          break;
        case 'bolt':
          W.fireBolt(st, origin, fwd, muz);
          break;
        case 'chain':
          W.fireChain(st, origin, fwd, muz);
          break;
        case 'freeze':
          W.fireCone(st, origin, fwd, muz, 'freeze');
          break;
        case 'blast':
          W.fireCone(st, origin, fwd, muz, 'blast');
          break;
        case 'stream':
          W.fireStream(st, origin, fwd, muz);
          break;
        case 'mk3':
          W.fireBeam(st, origin, fwd, muz, spread);
          break;
        case 'elemental':
          W.elem?.fire(st, origin, fwd, muz);
          break;
        default:
          W.hitscan(st, origin, fwd, muz, spread, 0);
      }
    } catch (err) {
      console.error('[T] fire', err);
    }
    // el retroceso: el torso se va atrás y los brazos suben, y vuelven con resorte
    this.recoil.v += (st.recoil || 0.04) * 60 * kick;
    this.recoilY.v += (Math.random() - 0.5) * 3 * kick;
    // humito de la bombilla
    g.fx.alpha?.spawn?.(muz.x, muz.y, muz.z, fwd.x * 0.6, 0.3 + fwd.y * 0.6, fwd.z * 0.6, { color: [0.6, 0.58, 0.55], size: 0.05, size1: 0.35, life: 0.7, alpha: 0.18, drag: 2 });
  }

  // ---------------- cuadro a cuadro ----------------
  update(dt, t) {
    const g = this.g;
    const a = this.a;
    this.modeT += dt;
    // recorrido: avanza y mira hacia donde va (si no apunta a nada)
    let moved = 0;
    if (this.path) {
      const p = this.path;
      const before = tmpV.copy(this.pos);
      p.d = Math.min(p.len, p.d + p.speed * dt);
      p.c(p.len ? p.d / p.len : 1, tmpW);
      this.pos.set(tmpW.x, 0, tmpW.z);
      moved = this.pos.distanceTo(before);
      if (moved > 1e-4) {
        const my = Math.atan2(this.pos.x - before.x, this.pos.z - before.z);
        if (!this.aimAt) this.yaw = my;
        // ¿va para atrás? (retrocede apuntando): las piernas pasan al revés
        this.back = Math.cos(angDiff(this.yawS.x, my)) < -0.2;
      }
      if (p.d >= p.len) this.path = null;
    }
    if (this.lockY != null) this.y = this.lockY;
    else if (g.world.levels) this.y += ((g.world.floorAt(this.pos.x, this.pos.z, this.y + 1) || 0) - this.y) * Math.min(1, dt * 12);
    const sp = dt > 0 ? moved / dt : 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    // a dónde apunta: gira el cuerpo (con resorte) y el resto lo hace el torso
    const aimP = this.aimPoint(tmpV);
    let aimYaw = this.yaw;
    if (aimP) {
      const hx = this.pos.x;
      const hz = this.pos.z;
      aimYaw = Math.atan2(aimP.x - hx, aimP.z - hz);
      const d = Math.hypot(aimP.x - hx, aimP.z - hz);
      const want = Math.atan2(aimP.y - (this.y + 1.45), Math.max(0.5, d));
      this.aimPitch += (want - this.aimPitch) * Math.min(1, dt * 10);
      // perfilado: el cuerpo gira menos que el torso (la pose pone el resto)
      if (!this.path || this.mode !== 'run') this.yaw = aimYaw - (this.mode === 'aim' || this.mode === 'kneel' ? 0.32 : this.mode === 'hip' || this.mode === 'slide' ? 0.2 : 0);
    } else this.aimPitch += (0 - this.aimPitch) * Math.min(1, dt * 4);
    // (el giro del cuerpo, con resorte y por el camino corto)
    this.yawS.x = this.yawS.x + angDiff(this.yawS.x, this.yaw);
    const yw = this.yawS.x + angDiff(this.yawS.x, this.yaw);
    spring(this.yawS, yw, this.first ? 50 : 2.4, dt, 0.95);
    // el objetivo de la pose
    const o = this.target;
    for (const j of JOINTS) o[j] = 0;
    o.gunTilt = 0;
    o.ground = null;
    o.headP = 0;
    (POSES[this.mode] || POSES.ready)(o, this.modeT, this);
    if (this.move) {
      this.moveT += dt;
      const done = MOVES[this.move](o, this.moveT, this);
      if (!this.moveHit && this.moveT > (this.move === 'slash' ? 0.3 : this.move === 'toss' ? 0.48 : 0.5)) {
        this.moveHit = true;
        this.onMoveHit?.(this);
      }
      if (done) this.move = null;
    }
    this.poseFn?.(o, this.modeT, this);
    // la marcha: piernas por la distancia recorrida (zancada según la velocidad)
    const run = this.speed > 3.2;
    const gaitK = clamp01(this.speed / 1.2);
    if (gaitK > 0.01 && o.ground == null) {
      const stride = run ? 1.9 : 1.25;
      this.phase += (moved / stride) * Math.PI * 2 * (this.back ? -1 : 1);
      const s = Math.sin(this.phase);
      const amp = run ? 0.75 : 0.42;
      const k = gaitK;
      o.hipLp = lerp(o.hipLp, s * amp - (run ? 0.12 : 0), k);
      o.hipRp = lerp(o.hipRp, -s * amp - (run ? 0.12 : 0), k);
      o.knL = lerp(o.knL, 0.12 + Math.max(0, Math.sin(this.phase + 1.35)) * (run ? 1.35 : 0.7), k);
      o.knR = lerp(o.knR, 0.12 + Math.max(0, Math.sin(this.phase + 1.35 + Math.PI)) * (run ? 1.35 : 0.7), k);
      o.torsoR += Math.sin(this.phase) * 0.05 * k;
      o.torsoY += Math.sin(this.phase) * (this.aimAt ? 0.04 : 0.12) * k;
      o.lift = Math.abs(Math.cos(this.phase)) * (run ? 0.07 : 0.025) * k;
      // (sin mate apuntando: el brazo libre acompaña)
      if (!this.aimAt && this.mode !== 'run') {
        o.shLp += -s * 0.3 * k;
      }
    }
    // respiración y balanceo (nunca quieto del todo)
    const br = Math.sin(t * 1.7 + this.seed) * 0.018;
    o.torsoP += br;
    o.headP -= br * 0.6;
    o.shRp += br * 0.4;
    o.shLp += br * 0.4;
    o.torsoR += fbm(t * 0.35, this.seed) * 0.03;
    o.headY += fbm(t * 0.5, this.seed + 2) * 0.1;
    o.headP += fbm(t * 0.45, this.seed + 4) * 0.05;
    // la cabeza mira algo (si no apunta)
    if (this.lookAt && !aimP) {
      const L = this.lookAt.isVector3 ? this.lookAt : this.lookAt();
      const rel = angDiff(this.yawS.x, Math.atan2(L.x - this.pos.x, L.z - this.pos.z));
      o.headY += Math.max(-1.1, Math.min(1.1, rel - o.torsoY));
      o.headP += -Math.atan2(L.y - (this.y + 1.6), Math.max(0.3, Math.hypot(L.x - this.pos.x, L.z - this.pos.z)));
    }
    // apuntando: el torso termina de girar hacia el blanco
    if (aimP && this.mode !== 'run') {
      const rel = angDiff(this.yawS.x, aimYaw);
      o.torsoY = Math.max(-1.2, Math.min(1.2, rel));
      o.headY = Math.max(-0.5, Math.min(0.5, o.headY * 0.3));
    }
    // resortes hacia el objetivo
    const S = this.S;
    const P = this.P;
    for (const j of JOINTS) {
      const f = FREQ[j] * (this.move ? 2.4 : 1) * (this.first ? 30 : 1);
      spring(S[j], o[j], f, dt, 0.92);
    }
    spring(this.recoil, 0, 7, dt, 0.55);
    spring(this.recoilY, 0, 6, dt, 0.6);
    this.aimK.x += ((aimP && this.mode !== 'run' && this.mode !== 'reload' ? 1 : 0) - this.aimK.x) * Math.min(1, dt * 8);
    for (const j of JOINTS) if (j !== 'lift') P[j] = S[j].x;
    // el retroceso encima
    const rc = this.recoil.x;
    P.torsoP -= rc * 0.06;
    P.shRp -= rc * 0.22;
    P.shLp -= rc * 0.18;
    P.elR -= rc * 0.1;
    P.headP -= rc * 0.05;
    P.torsoY += this.recoilY.x * 0.02;
    // la cadera: el pie más bajo apoya en el piso
    const reach = (hp, kn) => THIGH * Math.cos(hp) + SHIN * Math.cos(hp + kn) + 0.045;
    const hipY = o.ground ?? Math.max(reach(P.hipLp, P.knL), reach(P.hipRp, P.knR));
    P.hipY = hipY + S.lift.x;
    P.rootY = this.y + this.extraY;
    this.place(dt);
    this.first = false;
    // tirar solo
    if (this.hunt) this.huntStep(dt);
  }

  huntStep(dt) {
    const h = this.hunt;
    this.fireT -= dt;
    // el blanco: el muerto vivo más cerca de su frente
    const cur = this.aimAt && this.aimAt.pos ? this.aimAt : null;
    if (!cur || !cur.active || cur.dead) {
      const Z = this.g.zombies;
      let best = null;
      let bs = Infinity;
      const fx = Math.sin(this.yawS.x + 0.3);
      const fz = Math.cos(this.yawS.x + 0.3);
      for (const z of Z.pool) {
        if (!z.active || z.dead || z.state === 'rise') continue;
        const dx = z.pos.x - this.pos.x;
        const dz = z.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > h.range || d < 0.6) continue;
        const dot = (dx * fx + dz * fz) / d;
        if (dot < h.cone) continue;
        const s = d * (1.6 - dot);
        if (s < bs) {
          bs = s;
          best = z;
        }
      }
      if (best) {
        this.aimAt = best;
        this.fireT = Math.max(this.fireT, 0.12);
      }
    }
    if (this.aimAt?.pos && this.fireT <= 0 && this.mode !== 'reload' && this.mode !== 'run') {
      // (apuntó ya: el torso llegó cerca del blanco)
      this.fire();
      this.fireT = h.every * (0.85 + Math.random() * 0.3);
    }
  }

  // La pose puesta en el mundo: partes, poncho, sombrero, cara y el mate.
  place(dt) {
    const a = this.a;
    const P = this.P;
    a.group.visible = this.visible;
    solvePose(a.mats, this.pos.x, this.pos.z, this.yawS.x, 1, P);
    for (const m of a.parts) {
      m.matrix.copy(a.mats[m.part]);
      m.matrixWorldNeedsUpdate = true;
    }
    a.hand.matrix.copy(a.mats[6]);
    a.hand.matrixWorldNeedsUpdate = true;
    // el poncho se queda atrás al correr y flamea un poco
    const sw = a.sway;
    const t = this.crew.t;
    const tx = -Math.min(0.55, this.speed * 0.085) + Math.sin(t * 3.1 + this.seed) * 0.03 + fbm(t * 1.3, this.seed + 7) * 0.05 * (0.4 + this.speed * 0.15);
    const tz = Math.max(-0.35, Math.min(0.35, -this.yawS.v * 0.08)) + fbm(t * 1.1, this.seed + 9) * 0.04;
    sw.x += (tx - sw.x) * Math.min(1, dt * 6);
    sw.y += (tz - sw.y) * Math.min(1, dt * 6);
    for (const e of a.extras) {
      e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
      if (e.obj === a.poncho) e.obj.matrix.multiply(tmpM.makeRotationFromEuler(tmpE.set(sw.x, 0, sw.y)));
      e.obj.matrixWorldNeedsUpdate = true;
    }
    a.hand.visible = !a.gun && this.visible;
    if (a.gun) {
      // el mate: apuntando, hacia el blanco; si no, sigue a la mano
      const hand = handAt(a, 6, tmpV);
      const k = this.aimK.x;
      // de la mano (el antebrazo manda)
      a.mats[6].decompose(tmpW, tmpQ, new THREE.Vector3());
      tmpQ.multiply(Q_HAND);
      // de la mira
      const yawC = this.yawS.x + P.torsoY + Math.PI;
      tmpQ2.setFromEuler(tmpE.set(this.aimPitch - this.recoil.x * 0.08, yawC, 0, 'YXZ'));
      tmpQ.slerp(tmpQ2, k);
      if (this.target.gunTilt) tmpQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 * this.target.gunTilt, 0, 1.1 * this.target.gunTilt)));
      tmpW.set(0, 0.02, -0.02).applyQuaternion(tmpQ).add(hand);
      a.gun.matrix.compose(tmpW, tmpQ, ONE);
      a.gun.matrixWorldNeedsUpdate = true;
      a.gun.visible = this.visible;
    }
  }

  // Dónde tiene la cabeza (para la cámara).
  head(out) {
    return out.setFromMatrixPosition(this.a.mats[2]);
  }

  chest(out) {
    return out.setFromMatrixPosition(this.a.mats[1]);
  }
}
