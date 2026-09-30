import * as THREE from 'three';

// Cuando el Gauchito Gil cae en la Cárcel de las Almas (world/Cerro.js; lo pidió
// el usuario el 2026-09-29): las almas de las celdas se sueltan, se le tiran
// encima y lo agarran. Lo levantan, le abren los brazos y lo atan con hilos de
// luz a las manos, los pies y el pecho mientras le dan vueltas. Él se resiste,
// junta lo colorado que le queda y se prende blanco. Con el pantallazo blanco
// se lleva a todos de vuelta al cerro, donde queda de rodillas al lado del
// altar hasta el final (ui/PenalCinematic.js arma su Gil igual, en el mismo
// lugar, y saca a este).
// Corre en todos (anfitrión e invitados), cada uno con su reloj desde que cae.
// La pose va encima de la de siempre (Zombies.bossPose, en render).

// lo alcanzan las primeras y lo levantan; junta lo colorado; se prende blanco;
// la pantalla en blanco; (bajo el blanco) todos al cerro
const T_GRAB = 1.05;
const T_GATHER = 4.1;
const T_FLASH = 5.2;
const T_WHITE = 5.4;
export const HELD_HOME = 5.8;
// cuánto tarda en irse el blanco, ya en el cerro
const WHITE_OUT = 1.4;
// cuánto lo levantan (m)
const LIFT = 1.05;

// los hilos de luz: alma (cada cuánto en la lista) y adónde del cuerpo
// (skeleton.js: 5 y 6 los antebrazos, 11 y 12 los pies, 1 el pecho, 2 la cabeza)
const TETHERS = [
  [0, 5],
  [3, 6],
  [6, 11],
  [9, 12],
  [12, 1],
  [15, 5],
  [18, 6],
  [21, 1],
  [24, 11],
  [27, 12],
  [30, 2],
];

// las que lo agarran de las manos y de los pies (tiran para afuera): alma y parte
const PINS = [
  [1, 5],
  [4, 6],
  [7, 11],
  [10, 12],
];

const KEYS = ['rootY', 'rootPitch', 'rootRoll', 'hipY', 'torsoP', 'torsoY', 'torsoR', 'headP', 'headY', 'headR', 'shLp', 'shRp', 'shLr', 'shRr', 'elL', 'elR', 'hipLp', 'hipRp', 'hipLr', 'hipRr', 'knL', 'knR'];
const BASE = { rootY: 0, rootPitch: 0, rootRoll: 0, hipY: 0.93, torsoP: 0, torsoY: 0, torsoR: 0, headP: 0, headY: 0, headR: 0, shLp: 0, shRp: 0, shLr: 0, shRr: 0, elL: 0, elR: 0, hipLp: 0, hipRp: 0, hipLr: 0, hipRr: 0, knL: 0, knR: 0 };
const pose = (o) => ({ ...BASE, ...o });
const POSE = {
  // tambalea, herido, y ve venir a las almas
  stagger: pose({ hipY: 0.86, torsoP: 0.45, headP: 0.25, shLp: -0.45, shRp: -0.25, shLr: 0.3, shRr: -0.3, elL: -0.7, elR: -0.9, hipLp: -0.25, hipRp: 0.15, knL: 0.45, knR: 0.3 }),
  // agarrado: los brazos abiertos, tirado para atrás, las piernas colgando
  held: pose({ torsoP: -0.3, headP: -0.45, shLp: -0.3, shRp: -0.3, shLr: -1.35, shRr: 1.35, elL: -0.12, elR: -0.12, hipLp: 0.15, hipRp: -0.1, hipLr: -0.14, hipRr: 0.14, knL: 0.3, knR: 0.2 }),
  // junta lo colorado: se encoge y tira de los hilos hacia el pecho
  gather: pose({ hipY: 0.9, torsoP: 0.5, headP: 0.5, shLp: -0.95, shRp: -0.95, shLr: -0.45, shRr: 0.45, elL: -1.5, elR: -1.5, hipLp: -0.6, hipRp: -0.5, knL: 1.1, knR: 1 }),
  // revienta: los brazos arriba y afuera, el grito
  burst: pose({ torsoP: -0.5, headP: -0.75, shLp: -2.3, shRp: -2.3, shLr: -0.9, shRr: 0.9, elL: -0.1, elR: -0.1, hipLr: -0.2, hipRr: 0.2, knL: 0.15, knR: 0.15 }),
  // de rodillas en el cerro: el del final (ui/PenalCinematic.js GIL_POSE.down)
  kneel: pose({ hipY: 0.52, torsoP: 0.6, torsoR: 0.08, headP: 0.5, shLp: -0.1, shRp: -0.55, shLr: 0.25, shRr: -0.3, elL: -0.2, elR: -1, hipLp: 0.05, hipRp: -0.05, knL: 1.55, knR: 1.6 }),
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const RED = new THREE.Color(0xff1a0a);
const BLUE = new THREE.Color(0x66b4ff);
const WHITE = new THREE.Color(0xffffff);

export default class GilHeld {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.z = null;
    this.K = { ...BASE };
    this.col = new THREE.Color();
  }

  // (todos) Cae en la cárcel: las almas se le tiran encima.
  start(carcel, A) {
    const g = this.g;
    const z = g.zombies.boss;
    if (this.active || !z) return;
    this.active = true;
    this.z = z;
    this.carcel = carcel;
    this.t = 0;
    this.home = null;
    this.at = new THREE.Vector3(z.pos.x, A.y, z.pos.z);
    this.yaw = z.yaw;
    this.from = {};
    for (const k of KEYS) this.from[k] = Number.isFinite(z.P[k]) ? z.P[k] : BASE[k];
    this.from.rootY = 0;
    this.done = {};
    this.growlT = T_GRAB + 0.9;
    this.boltT = 0;
    carcel.grab(this.at);
    g.zombies.bossPose = (b, P, dt) => this.pose(b, P, dt);
    // la luz del pecho que se prende blanca al final
    if (!this.core) {
      this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      this.core.renderOrder = 20;
    }
    this.core.visible = false;
    g.scene.add(this.core);
    const a = g.audio;
    // el vuelo de las almas (el grabado del Farol de las Ánimas) y el coro
    const pos = tmpA.set(this.at.x, this.at.y + 2, this.at.z);
    for (const [when, gain, rate] of [[0, 2, 1], [0.35, 1.6, 0.9], [0.8, 1.8, 1.08]]) g.later(when, () => this.active && a?.guns?.play('alma', { pos: pos.clone(), gain, rate, offset: 0.35 }));
    if (a?.ctx) {
      const o = a.out({ pos: pos.clone(), gain: 1.2, reverb: 0.9, ref: 12 });
      a.choir?.(o, a.now + 0.2, [57, 64, 69, 72, 76], { dur: 5, gain: 0.06, attack: 1.2, release: 1.5 });
      a.chain?.(pos.clone());
    }
  }

  // (todos) Ya en el cerro, bajo el blanco: queda de rodillas al lado del altar.
  // G: dónde (los pies) y para dónde mira.
  goHome(G, yaw) {
    if (!this.active) return;
    this.home = { G: G.clone(), yaw };
    this.homeT = this.t;
    this.core.visible = false;
  }

  stop() {
    const g = this.g;
    if (g.zombies.bossPose && this.active) g.zombies.bossPose = null;
    this.active = false;
    this.z = null;
    this.core?.removeFromParent();
    this.whiteEl?.remove();
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    // (el final saca a este y arma el suyo)
    if (g.zombies.boss !== this.z) return this.stop();
    this.t += dt;
    const t = this.t;
    const z = this.z;
    const a = g.audio;
    const once = (k, when) => !this.done[k] && t >= when && (this.done[k] = true);
    if (this.home) {
      // (todavía colorado de la segunda fase, como lo arranca el final)
      this.glow(RED, 0.5 + Math.sin(g.time * 5) * 0.06);
      return;
    }
    const chest = tmpA.setFromMatrixPosition(z.mats[1]);
    // lo alcanzan: ruge y pide que lo suelten
    if (once('grab', T_GRAB)) {
      a?.growl(chest.clone(), 'boss');
      if (!g.net?.guest) g.say('gil', '¡Suéltenme!', 'boss');
      g.fx.addShake(0.35);
    }
    if (t > T_GRAB && t < T_GATHER) {
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = 0.9 + Math.random() * 0.5;
        a?.growl(chest.clone(), Math.random() < 0.5 ? 'attack' : 'boss');
      }
    }
    // junta lo colorado: rayos del cielo a él y el trueno
    if (once('gather', T_GATHER)) {
      a?.thunder?.(null, true);
      g.fx.addShake(0.5);
    }
    if (t > T_GATHER && t < T_FLASH) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 0.18 + Math.random() * 0.15;
        const x = this.at.x + (Math.random() - 0.5) * 2;
        const zz = this.at.z + (Math.random() - 0.5) * 2;
        g.fx.lightning(tmpB.set(x, this.at.y + 26, zz), chest, 0xff2a1a, 0.25);
        g.fx.flash(chest, 0xff3a2a, 5, 0.2, 12);
      }
      if (Math.random() < dt * 30) g.fx.fire(tmpB.set(chest.x + (Math.random() - 0.5) * 1.2, chest.y + (Math.random() - 0.7) * 2, chest.z + (Math.random() - 0.5) * 1.2), 0.3, 1);
    }
    // se prende blanco: la luz del pecho crece y la pantalla queda en blanco
    if (once('flash', T_FLASH)) {
      a?.thunderCrack?.(null, { dur: 1.6, gain: 1, big: true });
      if (a?.ctx) {
        const o = a.out({ gain: 0.9, reverb: 0.7 });
        a.tone(o, { dur: 0.9, type: 'sawtooth', freq: 180, freqEnd: 2600, gain: 0.12, attack: 0.25 });
        a.noise(o, { dur: 1.1, type: 'bandpass', freq: 600, freqEnd: 7000, q: 0.8, gain: 0.45, attack: 0.3 });
      }
    }
    if (t >= T_FLASH) {
      const k = smooth((t - T_FLASH) / (T_WHITE - T_FLASH + 0.15));
      this.core.visible = true;
      this.core.position.copy(chest);
      this.core.scale.setScalar(0.5 + k * 16);
      this.core.material.opacity = 0.4 + k * 0.6;
      g.zombies.bossRig.eyeMat?.color.setRGB(4, 4, 4);
    }
    if (once('white', T_WHITE)) {
      this.white(1, HELD_HOME - T_WHITE - 0.05);
      g.post?.flash(1.5);
      g.fx.addShake(0.8);
      g.later(HELD_HOME - T_WHITE + 0.25, () => this.white(0, WHITE_OUT));
    }
    // los hilos de luz, de cada alma que ya llegó a su parte del cuerpo
    if (t < T_WHITE && this.carcel) {
      const C = this.carcel;
      // las que lo agarran: de afuera de la mano o del pie, con sus manos en él
      for (const [si, part] of PINS) {
        const i = si % C.souls;
        tmpC.setFromMatrixPosition(z.mats[part]);
        tmpD.set(tmpC.x - chest.x, 0, tmpC.z - chest.z);
        if (tmpD.lengthSq() < 1e-4) tmpD.set(Math.sin(this.yaw + (part % 2 ? 1.57 : -1.57)), 0, Math.cos(this.yaw + (part % 2 ? 1.57 : -1.57)));
        tmpD.normalize();
        const hand = part === 5 || part === 6;
        C.pin(i, tmpC.x + tmpD.x * (hand ? 0.72 : 0.6), tmpC.y - (hand ? 1.5 : 1.4), tmpC.z + tmpD.z * (hand ? 0.72 : 0.6));
      }
      TETHERS.forEach(([si, part], n) => {
        const i = si % C.souls;
        if (C.soulK(i) < 0.98) return;
        C.soulAt(i, tmpB);
        tmpC.setFromMatrixPosition(z.mats[part]);
        // (ondulado: dos tramos con el medio corrido)
        const w = Math.sin(g.time * 9 + n * 1.7) * 0.22;
        tmpD.lerpVectors(tmpB, tmpC, 0.5);
        tmpD.y += w;
        tmpD.x += Math.cos(g.time * 7 + n) * 0.12;
        const tense = t > T_GATHER ? 1.6 : 1;
        // (duran un poco más que un cuadro a 30: si no, se apagan sin dibujarse)
        g.fx.beam(tmpB, tmpD, { color: 0x6fc8ff, width: 0.08 * tense, life: 0.07 });
        g.fx.beam(tmpD, tmpC, { color: 0x6fc8ff, width: 0.08 * tense, life: 0.07 });
        g.fx.beam(tmpB, tmpC, { color: 0xe8f6ff, width: 0.015, life: 0.07 });
        if (Math.random() < dt * 2.5) g.fx.sparkle(tmpC, [0.55, 0.85, 1], 1, 0.2);
      });
      // la luz azul que le dan las almas (poca: que se lo vea a él)
      if (t > T_GRAB && Math.random() < dt * 2) g.fx.flash(chest, 0x6ab8ff, 2.5, 0.3, 9);
    }
    // lo que brilla: azul de las almas que lo agarran, peleando con su colorado;
    // al juntar, colorado fuerte; al final, blanco
    const struggle = 0.5 + 0.5 * Math.sin(g.time * 6.3) * Math.sin(g.time * 2.1);
    // (suave: con mucho brillo se pierde la forma y queda una mancha)
    if (t < T_GRAB) this.glow(RED, 0.9 - t * 0.5);
    else if (t < T_GATHER) this.glow(this.col.copy(RED).lerp(BLUE, 0.3 + struggle * 0.55), 0.22 + struggle * 0.3);
    else if (t < T_FLASH) this.glow(RED, 0.5 + ((t - T_GATHER) / (T_FLASH - T_GATHER)) * 1.8 + Math.random() * 0.3);
    else this.glow(WHITE, 2.5 + Math.random());
  }

  glow(color, k) {
    const BM = this.g.zombies.bossMats;
    if (!BM) return;
    for (const m of [BM.skin, BM.cloth, BM.poncho]) {
      if (!m?.emissive) continue;
      m.emissive.copy(color);
      m.emissiveIntensity = k;
    }
  }

  // La pose, encima de la de siempre (Zombies.render). Cada cuadro, desde cero.
  pose(b, P, dt) {
    // (otro jefe: el Gil del final. En el invitado update no corre durante el
    // final, así que se apaga acá)
    if (b !== this.z) return this.stop();
    const g = this.g;
    const t = this.t;
    const K = this.K;
    // (anfitrión) muerto, no lo saca de la escena hasta el final
    b.corpseT = 0;
    if (this.home) {
      const H = this.home;
      b.pos.set(H.G.x, H.G.y, H.G.z);
      b.baseY = H.G.y;
      b.yaw = H.yaw;
      Object.assign(K, POSE.kneel);
      // respira vencido
      K.torsoP += Math.sin(g.time * 2.2) * 0.03;
      Object.assign(P, K);
      return;
    }
    b.pos.set(this.at.x, this.at.y, this.at.z);
    b.baseY = this.at.y;
    b.yaw = this.yaw;
    // de dónde a dónde, y cuánto
    let A = POSE.stagger;
    let B = POSE.stagger;
    let k = 1;
    if (t < T_GRAB) {
      A = this.from;
      k = smooth(t / 0.35);
    } else if (t < T_GATHER) {
      A = POSE.stagger;
      B = POSE.held;
      k = smooth((t - T_GRAB) / 0.3);
    } else if (t < T_FLASH - 0.15) {
      A = POSE.held;
      B = POSE.gather;
      k = smooth((t - T_GATHER) / 0.6);
    } else {
      A = POSE.gather;
      B = POSE.burst;
      k = smooth((t - T_FLASH + 0.15) / 0.2);
    }
    for (const key of KEYS) K[key] = A[key] + (B[key] - A[key]) * k;
    // mira para todos lados mientras vienen
    if (t < T_GRAB) K.headY = Math.sin(t * 5) * 0.5;
    // lo levantan y se sacude
    const lift = LIFT * smooth((t - T_GRAB + 0.1) / 1.2);
    const s = t > T_GRAB ? (t < T_GATHER ? 1 : t < T_FLASH ? 1.6 : 0.4) : 0;
    const T = g.time;
    K.rootY = lift + Math.sin(T * 1.7) * 0.08 * (lift / LIFT);
    K.rootRoll = Math.sin(T * 2.3) * 0.06 * s;
    K.shLr += Math.sin(T * 9.1) * 0.14 * s;
    K.shRr += Math.sin(T * 8.3 + 1) * 0.14 * s;
    K.shLp += Math.sin(T * 6.7) * 0.18 * s;
    K.shRp += Math.sin(T * 7.4 + 2) * 0.18 * s;
    K.torsoR += Math.sin(T * 5.3) * 0.16 * s;
    K.torsoP += Math.sin(T * 3.1) * 0.1 * s;
    K.headY += Math.sin(T * 4.1) * 0.45 * s;
    K.headP += Math.sin(T * 6.1) * 0.12 * s;
    K.knL += Math.max(0, Math.sin(T * 6)) * 0.5 * s;
    K.knR += Math.max(0, Math.sin(T * 6 + 2.5)) * 0.5 * s;
    // al juntar, tiembla entero
    if (t > T_GATHER && t < T_FLASH) for (const key of ['torsoP', 'shLp', 'shRp', 'headP']) K[key] += (Math.random() - 0.5) * 0.12;
    Object.assign(P, K);
  }

  // Blanco de pantalla completa (encima del HUD y del negro de Cerro).
  white(on, secs) {
    const g = this.g;
    if (!this.whiteEl) {
      const el = document.createElement('i');
      el.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:61;transition:none';
      this.whiteEl = el;
    }
    const el = this.whiteEl;
    if (!el.isConnected) g.root.appendChild(el);
    void el.offsetWidth;
    el.style.transition = `opacity ${Math.max(0.01, secs)}s`;
    el.style.opacity = on ? '1' : '0';
  }
}
