import * as THREE from 'three';
import { lerp, span, E, fbm } from '../kit';
import { zombieAt, bait, weather, dogAt } from '../horde';
import { fp, track, trigger } from '../fp';
import { lantern, stranger, borrowLight } from '../props';

// El Molino (Misiones, 1911, de noche): las tumbas del cementerio de los
// peones, el hombre de la linterna y el molino entero.

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const HAND_L = new THREE.Vector3(0, -0.19, 0);

// Una cola de cosas a hacer a tal segundo de la toma (vale en el "antes", con t negativo).
export function cues(list) {
  const q = list.slice().sort((a, b) => a[0] - b[0]);
  let i = 0;
  return (c, t) => {
    while (i < q.length && q[i][0] <= t) q[i++][1](c);
  };
}

// ---- 1 · el patio del secadero: salen de la tierra (el primer golpe de la canción) ----
export const m_graves = {
  map: 'molino',
  pre: 0.4,
  setup(c) {
    const g = c.g;
    bait(g, 12, 41);
    weather(g, 'fog', { fog: 0.045, mist: 0.8 });
    c.T.scale = 0.42;
    c.data.q = cues([
      [-0.3, () => zombieAt(g, 25.4, 24.6, { state: 'rise' })],
      [0.35, () => zombieAt(g, 27.6, 22.2, { state: 'rise' })],
      [0.9, () => zombieAt(g, 23.2, 26.8, { state: 'rise' })],
      [0.6, () => zombieAt(g, 26.4, 20.2, { state: 'rise' })],
      [1.5, () => zombieAt(g, 28.4, 26.2, { state: 'rise' })],
    ]);
    // bajita, entre la tierra del patio, con los secaderos atrás
    c.cam({
      pos: [[28.3, 0.36, 29.9], [27.9, 0.42, 29.6], [27.3, 0.52, 29.2]],
      look: [[24.2, 0.9, 22.8], [24.8, 1.1, 22.6], [25.2, 1.25, 22.8]],
      u: 'lin',
      fov: [40, 36],
      hand: { amp: 0.008, freq: 0.4 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- 2 · el hombre de la linterna: la llama, sube a la cara, los ojos de oro ----
const F0 = new THREE.Vector3(18.6, 0, 29.4);
export const m_lantern = {
  map: 'molino',
  pre: 1.2,
  setup(c) {
    const g = c.g;
    bait(g, 40, 40);
    const crew = c.newCrew();
    const F = stranger(crew);
    // (mira a la cámara, de espaldas al patio)
    F.at(F0.x, F0.z, -Math.PI / 2);
    F.poseFn = (o, mt) => {
      Object.assign(o, { shLp: -0.62, shLr: -0.05, elL: -0.72, headP: c.data.head ?? 0.16, torsoP: 0.05 });
    };
    c.data.F = F;
    c.data.L = lantern(g);
    c.data.light = borrowLight(g, 2);
    // los ojos: dos brillos chiquitos pegados a la cabeza
    const mk = () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffb030, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.scale.setScalar(0.07);
      g.scene.add(s);
      return s;
    };
    c.data.eyes = [mk(), mk()];
    c.data.q = cues([
      [-1.0, () => zombieAt(g, 23.6, 27.4, { state: 'rise' })],
      [0.4, () => zombieAt(g, 24.8, 30.0, { state: 'rise' })],
    ]);
    c.T.scale = 0.7;
    // la cámara: de la llama a la cara (sube despacio y se arrima)
    weather(g, 'fog', { fog: 0.06, mist: 0.6 });
    const lam = () => c.data.L.root.position;
    const head = () => F.head(tw);
    c.cam({
      pos: (u, out, t) => {
        const k = span(t, 1.0, 2.35, 'io3');
        const L = lam();
        const H = head();
        const a = tv.set(L.x - 1.05, L.y + 0.12, L.z + 0.28);
        const b = out.set(H.x - 1.55 + span(t, 2.2, 3.4, 'out2') * 0.3, H.y - 0.12, H.z + 0.12);
        return out.lerpVectors(a, b, k);
      },
      look: (u, out, t) => {
        const k = span(t, 0.95, 2.3, 'io3');
        const L = lam();
        const H = head();
        return out.set(lerp(L.x, H.x, k), lerp(L.y - 0.02, H.y - 0.06, k), lerp(L.z, H.z, k));
      },
      fov: (u, t) => lerp(34, 30, span(t, 1.8, 3.4, 'io2')),
      hand: { amp: 0.006, freq: 0.5 },
    });
  },
  frame(c, t, dt) {
    const g = c.g;
    const D = c.data;
    D.q(c, t);
    const F = D.F;
    // la linterna en la mano izquierda (se hamaca un poquito)
    tv.copy(HAND_L).applyMatrix4(F.a.mats[5]);
    D.L.root.position.set(tv.x, tv.y - 0.02, tv.z);
    D.L.root.rotation.z = Math.sin(c.T.frameN * 0.035) * 0.08;
    // los ojos se prenden en el pulso 14 (2,25 s) y la linterna se apaga en el 15,5 (3,09 s)
    const eye = span(t, 2.2, 2.5, 'out2');
    F.eye(eye);
    D.head = lerp(0.16, 0.02, span(t, 2.1, 2.8, 'io2'));
    const off = span(t, 3.06, 3.14, 'lin');
    const fl = D.L.set(1 - off, t);
    D.L.root.updateMatrixWorld();
    D.light.set(tv.set(D.L.root.position.x, D.L.root.position.y - 0.1, D.L.root.position.z), 0xff9a40, 1.7 * fl * (1 - off), 6);
    if (off > 0 && !D.smoke) {
      D.smoke = true;
      const p = D.L.root.position;
      for (let i = 0; i < 6; i++) g.fx.alpha?.spawn?.(p.x, p.y, p.z, (Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2, { color: [0.5, 0.48, 0.45], size: 0.03, size1: 0.2, life: 1.2, alpha: 0.25, drag: 1 });
    }
    const H = F.a.mats[2];
    D.eyes.forEach((s, i) => {
      s.position.set(i ? 0.045 : -0.045, 0.028, 0.125).applyMatrix4(H);
      s.material.opacity = eye * (0.85 + fbm(t * 3, i) * 0.15);
    });
  },
  stop(c) {
    c.data.L?.dispose();
    c.data.light?.off();
    for (const s of c.data.eyes || []) s.removeFromParent();
  },
};

// ---- 3 · el molino: la grúa sube sobre el patio, los muertos cruzan ----
export const m_reveal = {
  map: 'molino',
  pre: 3,
  setup(c) {
    const g = c.g;
    bait(g, 12, 41);
    for (const [x, z] of [[24, 21], [27, 24], [22, 26], [26, 28.5], [29, 20.5], [20.5, 22], [25, 19], [28, 27]]) zombieAt(g, x, z, { speed: 'walk' });
    c.cam({
      pos: [[15.4, 1.1, 30.0], [13.4, 4.6, 27.2], [10.2, 11.5, 22.2]],
      look: [[23, 1.5, 24.5], [28, 2.6, 24.2], [42, 3.6, 24]],
      u: 'out3',
      fov: [48, 52],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
};

// ================= A: la partida (primera persona) =================

// Rampa de velocidad: [t, escala] por tramos (lineal entre llaves).
export function ramp(list) {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) if (t <= list[i][0]) return lerp(list[i - 1][1], list[i][1], (t - list[i - 1][0]) / (list[i][0] - list[i - 1][0]));
    return list[list.length - 1][1];
  };
}

// El muerto vivo más cerca del centro de la mira (para la puntería de la toma).
export function nearestAim(g, maxD = 30) {
  const p = g.player;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  let best = null;
  let bs = Infinity;
  for (const z of g.zombies.pool) {
    if (!z.active || z.dead || z.state === 'rise' || z.state === 'dogspawn') continue;
    const dx = z.pos.x - p.pos.x;
    const dz = z.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxD || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < 0.2) continue;
    const s = d * (2.2 - dot * 2);
    if (s < bs) {
      bs = s;
      best = z;
    }
  }
  return best;
}

// ---- la primera: un muerto se tira encima y un tiro en la cara (el golpe de la sección) ----
export const m_fp_head = {
  map: 'molino',
  pre: 1.25,
  setup(c) {
    const g = c.g;
    fp(c, { weapon: 'plastico', up: 1, x: 27.2, z: 30.2, yaw: 0.08, pitch: -0.02 });
    c.data.z1 = zombieAt(g, 26.4, 23.4, { speed: 5.4, hp: 900 });
    c.data.z2 = zombieAt(g, 22.4, 21.5, { speed: 4.6, hp: 900 });
    c.data.z3 = zombieAt(g, 29.0, 20.5, { speed: 3.8, hp: 900 });
    c.data.speed = ramp([[-9, 1], [0, 1], [0.02, 0.2], [0.34, 0.2], [0.56, 1]]);
  },
  before(c, t, dt) {
    const D = c.data;
    c.T.scale = D.speed(t);
    const tgt = t < 0.5 ? D.z1 : D.z2?.dead ? D.z3 : D.z2;
    track(c, tgt, dt, { freq: t < 0 ? 3 : 6, damp: 0.72 });
    trigger(c, (t >= 0 && t < 0.03) || (t >= 0.66 && t < 0.69), { semi: true, every: 9 });
  },
};

// ---- la caja: gira, gira... y sale el Wunder-Mate ----
export const m_fp_box = {
  map: 'molino',
  pre: 3.3,
  setup(c) {
    const g = c.g;
    const I = g.interact;
    I.placeBox(0);
    const box = I.box;
    const C = box.center;
    const F = box.face;
    fp(c, { weapon: 'lata', up: 0, x: C.x + F.x * 1.75, z: C.z + F.z * 1.75, yaw: Math.atan2(F.x, F.z), pitch: -0.42 });
    I.showBox?.();
    box.state = 'idle';
    I.openBox(box);
    box.offer = 'wunder';
    c.data.box = box;
    c.data.light = borrowLight(g, 2);
  },
  frame(c, t) {
    // un resplandor adentro de la caja (dorado, con parpadeo)
    const box = c.data.box;
    const k = 0.8 + Math.sin(t * 17) * 0.1 + Math.sin(t * 29) * 0.08;
    c.data.light.set(tv.set(box.center.x, box.center.y + 0.9, box.center.z), 0xffd08a, 3.2 * k, 5);
  },
  stop(c) {
    c.data.light?.off();
  },
  before(c, t, dt) {
    const box = c.data.box;
    const p = c.g.player;
    // se arrima un pasito mientras gira (la mira baja a la caja)
    track(c, [p.yaw, lerp(-0.42, -0.3, span(t, -1, 1.1, 'io2'))], dt, { freq: 2.5, damp: 1 });
  },
};

// ---- el Wunder-Mate: el rayo salta de muerto en muerto ----
export const m_fp_wunder = {
  map: 'molino',
  pre: 1.1,
  setup(c) {
    const g = c.g;
    weather(g, 'fog', { fog: 0.035, mist: 0.5 });
    // desde el camino de la capilla, mirando al fondo del cementerio
    fp(c, { weapon: 'wunder', up: 0, x: 60.6, z: 25.3, yaw: -Math.PI / 2 + 0.06, pitch: 0.02 });
    const pts = [[65.2, 25.6], [67.2, 27.6], [66.4, 23.6], [68.8, 25.4], [64.6, 28.4], [68.2, 21.8], [69.4, 28.6], [66.8, 19.8], [63.9, 22.4]];
    c.data.zs = pts.map(([x, z], i) => zombieAt(g, x, z, { speed: i % 3 ? 'run' : 'walk', hp: 2000 }));
  },
  before(c, t, dt) {
    const D = c.data;
    const tgt = nearestAim(c.g) || D.zs[0];
    track(c, tgt, dt, { freq: 5, damp: 0.8 });
    trigger(c, (t >= 0 && t < 0.02) || (t >= 0.62 && t < 0.64), { semi: true, every: 9 });
  },
};

// ---- el Tronador en el barbacuá: el viento los levanta por el aire delante del horno ----
export const m_tronador = {
  map: 'molino',
  pre: 1.2,
  setup(c) {
    const g = c.g;
    bait(g, 34.2, 27.4);
    const crew = c.newCrew();
    const G = crew.add(1, { gun: 'tronador' });
    G.at(34.2, 27.4, 0.9).set('aim');
    const pts = [[38.6, 26.2], [39.4, 27.8], [39.8, 25.0], [40.8, 26.6], [41.6, 28.2], [41.2, 24.2], [42.6, 25.8]];
    c.data.zs = pts.map(([x, z]) => zombieAt(g, x, z, { speed: 'run', hp: 3000 }));
    G.aim(() => tv.set(39.2, 1.35, 26.4));
    c.data.G = G;
    c.data.speed = ramp([[-9, 1], [0.1, 1], [0.16, 0.28], [0.8, 0.28], [1.1, 0.7]]);
    // de costado y bajito, con la brasa del horno atrás
    c.cam({
      pos: [[35.6, 0.5, 30.6], [36.8, 0.7, 30.4]],
      look: [[36.6, 1.1, 27.0], [39.4, 1.5, 26.2]],
      fov: [48, 52],
      hand: { amp: 0.012, freq: 0.8 },
    });
  },
  before(c, t) {
    c.T.scale = c.data.speed(t);
  },
  frame(c, t) {
    const D = c.data;
    if (t >= 0.1 && !D.shot) {
      D.shot = true;
      D.G.fire({ kick: 2.2 });
      c.rig.kick(0.8);
    }
  },
};

// ---- los carpinchos endemoniados: caen con el rayo entre las tumbas y se largan ----
export const m_capys = {
  map: 'molino',
  pre: 0.55,
  setup(c) {
    const g = c.g;
    weather(g, 'dogs', { fog: 0.05 });
    bait(g, 57.2, 27.2);
    c.data.q = cues([
      [-0.62, () => dogAt(g, 63.2, 26.9)],
      [-0.45, () => dogAt(g, 64.6, 24.4)],
      [-0.2, () => dogAt(g, 62.4, 28.8)],
      [0.02, () => dogAt(g, 65.4, 26.6)],
      [0.3, () => dogAt(g, 63.8, 22.9)],
    ]);
    c.cam({
      pos: [[58.3, 0.3, 27.3], [59.0, 0.26, 27.1]],
      look: [[63.5, 0.55, 26.3], [62.5, 0.45, 26.6]],
      fov: [50, 44],
      hand: { amp: 0.014, freq: 0.9 },
    });
  },
  frame(c, t) {
    c.data.q(c, t);
  },
};

// ---- el Capataz: entra a la capilla entre las velas, ruge y viene por el pasillo ----
export const m_capataz = {
  map: 'molino',
  pre: 0.3,
  setup(c) {
    const g = c.g;
    bait(g, 51, 29.6);
    const b = g.zombies.spawnBoss(8, { kind: 'capataz', at: new THREE.Vector3(51, 0, 22.2) });
    if (b) {
      b.pos.set(51, 0, 22.2);
      // (el cuerpo de los jefes mira al revés que los muñecos)
      b.yaw = Math.PI;
      g.zombies.setState(b, 'intro');
    }
    c.data.b = b;
    // (la luz tibia de las velas del altar, que lo recorta)
    c.data.light = borrowLight(g, 2);
    // en el pasillo, entre los bancos, empujando hacia él mientras ruge
    c.cam({
      pos: [[51.3, 1.05, 29.4], [51.2, 1.0, 28.4]],
      look: [[51, 2.1, 22.2], [51, 2.3, 22.4]],
      u: 'io2',
      fov: [44, 40],
      hand: { amp: 0.01, freq: 0.6 },
    });
  },
  frame(c, t) {
    if (t > 0.9 && !c.data.k) {
      c.data.k = 1;
      c.rig.kick(0.6);
    }
    const k = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.05;
    c.data.light.set(tv.set(51, 2.6, 20.4), 0xffa050, 5 * k, 12);
  },
  stop(c) {
    c.data.light?.off();
  },
};
