import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { MAP_ID } from '../config/map';
import { skinLook, glowEye } from './bossSkin';

// Los muertos con cuerpo de verdad: modelos low poly (Meshy) con clips de
// Mixamo y de la biblioteca de Meshy, en lugar de las piezas instanciadas de
// entities/Zombies.js. Las piezas siguen calculando todo (la pose para los
// tiros y los golpes, la red); para cada muerto que tiene modelo no se dibujan
// (Zombies.render). Por mapa, unas variantes (dos hombres y una mujer), una al
// azar por muerto.
//
// Cada muerto tiene su andar (rengo, tambaleándose, a los tumbos...), su
// corrida, su golpe y algunos van con los brazos estirados adelante; cada uno
// arranca el paso en otro momento. Las muertes, según de dónde le pegaron; de
// vez en cuando un tiro lo sacude (arriba de la cintura, sin dejar de andar).
// Trepa la ventana, salta del alféizar y vuela con las explosiones con su
// clip (la altura la sigue llevando el juego: P.rootY).
//
// Lo que no tiene clip (derritiéndose, en los botes, nadando) lo siguen
// haciendo las piezas: drive() devuelve false y ese cuadro se ven las piezas.
//
// Archivos (public/assets/sotano/modelos/zombies/): clips.json, uno para todas
// las variantes (sobre el atado de molino-1: bind y leg; cada variante lo pasa
// al suyo al cargar), y <variante>/modelo.glb (como los de los jefes:
// userData.boss con las medidas, marcas de los ojos).

// (el usuario, 2026-10-01: los zombies vuelven a los de bloques por ahora; los
// modelos del molino quedaron en el escritorio, Conceptos low poly\zombie\juego-molino)
const SETS = {
  // molino: ['molino-1', 'molino-2', 'molino-3'],
};
const DIR = '/assets/sotano/modelos/zombies/';
const RIG_LEG = 0.88;
const FADE = 0.22;
const RATE_MIN = 0.75;
const RATE_MAX = 1.55;
// andando (m/s del modelo): pasado RUN_ON corre; pasado SPRINT_ON, la corrida rápida
const RUN_ON = 1.9;
const RUN_OFF = 1.6;
const SPRINT_ON = 3.3;
const SPRINT_OFF = 3.0;
// el golpe del juego pega a los ATTACK_HIT s del manotazo (Zombies.js)
const ATTACK_HIT = 0.42;

// Lo que puede tocarle a cada uno (la mujer, la última variante, con los suyos)
const GAITS = {
  walk: ['anda', 'cojo1', 'cojo2', 'cojo3', 'cojo4', 'inestable', 'anda', 'cojo3'],
  walkW: ['inestable', 'cojo2', 'cojo4', 'anda'],
  run: ['run5', 'corre', 'run7', 'run5'],
  sprint: ['run3', 'sprint', 'run7'],
  sprintW: ['embiste', 'run3', 'sprint'],
  attack: ['ataca', 'golpea', 'dosmanos', 'ganchod', 'ataca'],
};
// los que van con los brazos adelante (los del clip 'momia', sobre su andar)
const ARMS_FWD = 0.3;
// las muertes: cayendo para atrás (le pegaron de frente) o para adelante
const DEATHS = { back: ['atras', 'cae', 'tumbado', 'tumbado2', 'muere'], front: ['muerto', 'ahogado', 'espalda', 'muere'] };
// cuánto tarda en quedar tirado (s): las largas, más rápido
const LIE_T = 2.4;
// el sacudón de un tiro (arriba de la cintura): cuál, de dónde a dónde del clip
const HURT = [
  ['golpe1', 0.15, 1.05],
  ['golpe2', 0.75, 1.6],
  ['cara1', 0.45, 1.35],
  ['cintura', 0.05, 0.95],
  ['reac1', 0.0, 0.85],
];
const HURT_P = 0.14;
const HURT_GAP = 2.5;

const ARMS = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const LEGS = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const hipsW = new THREE.Vector3();
const pickOf = (list) => list[Math.floor(Math.random() * list.length)];

export default class ZombieSkins {
  constructor(zs) {
    this.zs = zs;
    this.g = zs.g;
    this.names = SETS[MAP_ID] || [];
    this.vars = [];
    this.inst = new Map();
    this.frame = 0;
    this.C = null;
    if (!this.names.length || window.__zombieSkinOff) return;
    const clips = fetch(assetUrl(DIR + 'clips.json'))
      .then((r) => r.json())
      .then((C) => this.clips(C));
    for (const name of this.names) this.load(name, clips);
  }

  // Los clips, una vez para todos (los giros, a Float32Array)
  clips(C) {
    for (const cl of Object.values(C.clips)) {
      cl.q = Float32Array.from(cl.q);
      cl.hips = Float32Array.from(cl.hips);
    }
    C.bindQ = C.bind.map((b) => new THREE.Quaternion().fromArray(b));
    C.nb = C.bones.length;
    C.upper = C.bones.map((n) => !LEGS.includes(n));
    C.arms = C.bones.map((n) => ARMS.includes(n));
    this.C = C;
    return C;
  }

  load(name, clips) {
    const base = assetUrl(DIR + name + '/');
    new GLTFLoader().load(base + 'modelo.glb', async (gltf) => {
      try {
        this.ready(gltf.scene, await clips, name);
      } catch {
        /* sin este, quedan las otras variantes (o las piezas) */
      }
    });
  }

  ready(root, C, name) {
    root.updateMatrixWorld(true);
    const bones = {};
    let meta = null;
    let sm = null;
    root.traverse((o) => {
      if (o.userData?.boss) meta = o.userData.boss;
      if (o.isBone || /^(luEye|eye)[AB]$/.test(o.name)) bones[o.name] = o;
      if (o.isSkinnedMesh && !sm) sm = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        skinLook(o.material);
      }
    });
    // los ojos: los de los muertos (el mismo material), en las cuencas
    for (const n of ['luEyeA', 'luEyeB', 'eyeA', 'eyeB']) if (bones[n]) glowEye(bones[n], this.zs.eyeMat, meta.eye || 0.013, this.g.textures?.dot);
    // el atado de esta variante: los clips (del de molino-1) pasan a este
    // (el giro de cada hueso respecto de su atado es el mismo; la cadera, a la
    // escala de las piernas)
    const m = new THREE.Matrix4();
    const bindOf = {};
    sm.skeleton.bones.forEach((b, i) => {
      m.copy(sm.bindMatrix).multiply(new THREE.Matrix4().copy(sm.skeleton.boneInverses[i]).invert());
      const bq = new THREE.Quaternion();
      m.decompose(v, bq, new THREE.Vector3());
      bindOf[b.name] = bq;
    });
    const legLen = meta.thigh + meta.shin + meta.ankle;
    const V = {
      name,
      root,
      meta,
      legLen,
      K: legLen / C.leg,
      fix: C.bones.map((n, i) => C.bindQ[i].clone().invert().multiply(bindOf[n])),
      hipsRest: bones.Hips.getWorldPosition(new THREE.Vector3()),
      feetMid: new THREE.Vector3(),
      woman: name.endsWith('-3'),
    };
    for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) V.feetMid.add(bones[n].getWorldPosition(v));
    V.feetMid.multiplyScalar(0.25).setY(0);
    this.vars.push(V);
  }

  // El cuerpo de un muerto (uno por lugar del grupo; se vuelve a usar). Al
  // estrenarlo, lo suyo: andar, corrida, golpe, los brazos.
  instFor(z) {
    let I = this.inst.get(z.slot);
    if (z.skinV == null || z.skinV >= this.vars.length) z.skinV = Math.floor(Math.random() * this.vars.length);
    const V = this.vars[z.skinV];
    if (I && I.V !== V) {
      I.root.removeFromParent();
      I = null;
    }
    if (!I) {
      const root = cloneSkinned(V.root);
      const bones = {};
      root.traverse((o) => {
        if (o.isBone) bones[o.name] = o;
      });
      const list = this.C.bones.map((name) => ({ bone: bones[name], W: new THREE.Quaternion() }));
      for (const d of list) d.pi = list.findIndex((o) => o.bone === d.bone.parent);
      I = { V, root, bones, list, layers: [], t: 0, v: 0, tmp: list.map(() => new THREE.Quaternion()) };
      root.visible = false;
      // (el de un muerto: escondido no se recorre cada cuadro: core/matrixCache.js mcSleep)
      root.mcSleep = !(globalThis.__mduNoMerge || globalThis.__mduNo1d);
      this.g.scene.add(root);
      this.inst.set(z.slot, I);
    }
    if (!I.walk) {
      I.walk = pickOf(V.woman ? GAITS.walkW : GAITS.walk);
      I.runK = pickOf(GAITS.run);
      I.sprintK = pickOf(V.woman ? GAITS.sprintW : GAITS.sprint);
      I.atk = pickOf(GAITS.attack);
      I.armsFwd = !V.woman && Math.random() < ARMS_FWD;
      I.rate = 0.9 + Math.random() * 0.2;
      I.t = Math.random() * 4;
      I.hurt = null;
      I.hurtT = 0;
      I.hp = null;
      I.death = null;
      I.flung = false;
    }
    return I;
  }

  // Un cuadro de un clip: el giro de cada hueso (del mundo, en el atado de la
  // variante) y la cadera (a su escala).
  sample(V, key, t, loop, out, hp) {
    const C = this.C;
    const cl = C.clips[key];
    const nb = C.nb;
    const f = Math.max(0, t) * C.fps;
    let f0 = Math.floor(f);
    let f1 = f0 + 1;
    const al = f - f0;
    if (loop) {
      f0 %= cl.n;
      f1 %= cl.n;
    } else {
      f0 = Math.min(cl.n - 1, f0);
      f1 = Math.min(cl.n - 1, f1);
    }
    for (let i = 0; i < nb; i++) {
      qa.fromArray(cl.q, (f0 * nb + i) * 4);
      qb.fromArray(cl.q, (f1 * nb + i) * 4);
      out[i].copy(qa).slerp(qb, al).multiply(V.fix[i]);
    }
    const h = cl.hips;
    hp.set(h[f0 * 3] + (h[f1 * 3] - h[f0 * 3]) * al, h[f0 * 3 + 1] + (h[f1 * 3 + 1] - h[f0 * 3 + 1]) * al, h[f0 * 3 + 2] + (h[f1 * 3 + 2] - h[f0 * 3 + 2]) * al).multiplyScalar(V.K);
  }

  // un andar a tiempo con lo que avanza
  step(I, key, vm, dt) {
    const cl = this.C.clips[key];
    const sp = Math.max(0.1, (cl.speed > 0.2 ? cl.speed : cl.slide) * I.V.K);
    I.t += dt * Math.max(RATE_MIN, Math.min(RATE_MAX, (vm / sp) * I.rate));
    return { key, t: I.t % cl.dur, loop: true };
  }

  // Qué clip va (null: ese cuadro, las piezas).
  pick(z, I, dt, s) {
    const C = this.C.clips;
    const st = z.state;
    const T = z.stateT || 0;
    const P = z.P || {};
    if (z.dead || st === 'dead') {
      I.deadT = (I.deadT ?? -dt) + dt;
      // el que se arrastra queda como estaba; el que voló sigue su clip
      if (z.crawler) return { key: 'repta', t: I.lastT || 0, loop: true, sink: true, hold: true };
      if (!I.death) I.death = I.flung ? 'vuela' : pickOf(z.deathBack ? DEATHS.back : DEATHS.front);
      const cl = C[I.death];
      const k = Math.max(1, (cl.lie || cl.dur) / LIE_T);
      return { key: I.death, t: Math.min(cl.dur - 1e-3, (I.flung ? I.flungT || 0 : 0) + I.deadT * k), loop: false, sink: true };
    }
    I.deadT = null;
    switch (st) {
      // saliendo de la tierra: trepa (los pies, a la altura que lleva el juego)
      case 'rise':
        return { key: 'trepa', t: Math.min(C.trepa.up, T * (C.trepa.up / 1.7)), loop: false, feet: true, lift: Math.min(0, P.rootY || 0) };
      case 'attack':
      case 'boatHit': {
        if (z.crawler) break;
        const key = I.atk;
        const cl = C[key];
        return { key, t: Math.max(0, Math.min(cl.dur - 1e-3, cl.fast + (z.attackT || 0) - ATTACK_HIT)), loop: false };
      }
      case 'tear':
        return { key: I.atk === 'ataca' ? 'ataca' : 'golpea', t: T * 0.9 + (I.atk === 'ataca' ? 0.4 : 0), loop: true };
      // la ventana: salta por arriba del alféizar
      case 'climb':
        return { key: 'salta', t: Math.min(1, T / 1.1) * C.salta.dur, loop: false, feet: true, lift: P.rootY || 0 };
      // asomado al borde, salta y cae al piso
      case 'drop':
        if (T < 0.9) return { key: 'baja', t: 0.25, loop: false, feet: true, lift: P.rootY || 0 };
        if (!z.landT && (z.pos.y || 0) > 0) return { key: 'baja', t: Math.min(0.85, 0.45 + (T - 0.9) * 0.8), loop: false, feet: true, lift: P.rootY || 0 };
        return { key: 'baja', t: 0.85 + Math.min(1, (z.landT || 0) / 0.45) * 0.6, loop: false, feet: true, lift: P.rootY || 0 };
      case 'fall':
        return { key: 'baja', t: (P.rootY || 0) > 0.05 ? 0.6 : 0.9, loop: false, feet: true, lift: P.rootY || 0 };
      // volando por una explosión
      case 'flung':
        I.flung = true;
        I.flungT = Math.min(C.vuela.lie, 0.35 + T);
        return { key: 'vuela', t: I.flungT, loop: false, feet: true, lift: P.rootY || 0 };
      case 'shocked':
      case 'stunned':
        return { key: 'golpe1', t: T % C.golpe1.dur, loop: true };
      case 'reel':
      case 'zapped':
        return { key: 'golpe2', t: T % C.golpe2.dur, loop: true };
      case 'frozen':
        return { key: I.lastKey || I.walk, t: I.lastT || 0, loop: true, hold: true };
      case 'chase':
      case 'approach':
      case 'stairs':
      case 'burnrun':
      case undefined:
        break;
      default:
        return null;
    }
    if (z.swimK > 0.3) return null;
    const vm = I.v / Math.max(0.1, s);
    if (z.crawler) return this.step(I, 'repta', vm, dt);
    I.run = I.run ? vm > RUN_OFF : vm > RUN_ON;
    I.sprint = I.run && (I.sprint ? vm > SPRINT_OFF : vm > SPRINT_ON);
    if (I.sprint) return this.step(I, I.sprintK, vm, dt);
    if (I.run) return this.step(I, I.runK, vm, dt);
    // (casi quieto: el paso lento del de Mixamo)
    if (vm < 0.35) return this.step(I, 'caminar', vm, dt);
    return { ...this.step(I, I.walk, vm, dt), arms: I.armsFwd };
  }

  // Cada muerto, cada cuadro (Zombies.render). true: se ve el modelo.
  drive(z, dt) {
    if (!this.vars.length || !this.C || z.dog || z.boss || window.__zombieSkinOff) return false;
    const I = this.instFor(z);
    const C = this.C;
    I.seen = this.frame;
    // lo rápido que va de verdad
    if (I.last && dt > 0) I.v += (Math.min(12, Math.hypot(z.pos.x - I.last.x, z.pos.z - I.last.z) / dt) - I.v) * Math.min(1, dt * 6);
    (I.last ||= new THREE.Vector3()).copy(z.pos);
    const V = I.V;
    const s = (RIG_LEG * (z.scale || 1)) / V.legLen;
    const want = this.pick(z, I, dt, s);
    if (!want) {
      I.root.visible = false;
      I.layers.length = 0;
      return false;
    }
    I.lastKey = want.key;
    I.lastT = want.t;
    let top = I.layers[I.layers.length - 1];
    if (!top || top.key !== want.key) {
      top = { key: want.key, w: I.layers.length ? 0 : 1, W: I.list.map(() => new THREE.Quaternion()), hips: new THREE.Vector3() };
      I.layers.push(top);
    }
    top.t = want.t;
    top.loop = want.loop;
    top.w = Math.min(1, top.w + dt / FADE);
    for (const L of I.layers) if (L !== top) L.w = Math.max(0, L.w - dt / FADE);
    I.layers = I.layers.filter((L) => L === top || L.w > 1e-3);
    qYaw.setFromAxisAngle(UP, z.yaw || 0);
    for (const L of I.layers) {
      this.sample(V, L.key, L.t, L.loop, L.W, v);
      for (const W of L.W) W.premultiply(qYaw);
      L.hips.copy(V.hipsRest).sub(V.feetMid).add(v).multiplyScalar(s).applyQuaternion(qYaw);
    }
    const L0 = I.layers[0];
    for (let i = 0; i < C.nb; i++) I.list[i].W.copy(L0.W[i]);
    hipsW.copy(L0.hips);
    let acc = L0.w;
    for (let j = 1; j < I.layers.length; j++) {
      const L = I.layers[j];
      acc += L.w;
      const k = acc > 0 ? L.w / acc : 1;
      for (let i = 0; i < C.nb; i++) I.list[i].W.slerp(L.W[i], k);
      hipsW.lerp(L.hips, k);
    }
    // los brazos estirados adelante (sobre su andar)
    I.armsK = (I.armsK || 0) + ((want.arms ? 0.85 : 0) - (I.armsK || 0)) * Math.min(1, dt * 4);
    if (I.armsK > 0.01) {
      this.sample(V, 'momia', I.t * 0.8, true, I.tmp, v);
      for (let i = 0; i < C.nb; i++) if (C.arms[i]) I.list[i].W.slerp(I.tmp[i].premultiply(qYaw), I.armsK);
    }
    // un tiro que lo sacude (de vez en cuando; arriba de la cintura)
    this.hurt(z, I, dt, want);
    if (I.hurt) {
      const [key, a, b] = I.hurt;
      const u = I.hurtT / (b - a);
      const k = Math.sin(Math.min(1, u) * Math.PI) ** 0.7 * 0.9;
      this.sample(V, key, a + I.hurtT, false, I.tmp, v);
      for (let i = 0; i < C.nb; i++) if (C.upper[i]) I.list[i].W.slerp(I.tmp[i].premultiply(qYaw), k);
    }
    // el piso (y lo que se hunde: saliendo de la tierra, el cadáver que se va;
    // lo que sube: la ventana, el salto, el que vuela)
    const floor = (z.baseY || 0) + (want.sink ? Math.min(0, z.P?.rootY || 0) : 0) + (want.lift || 0);
    hipsW.x += z.pos.x;
    hipsW.y += floor;
    hipsW.z += z.pos.z;
    const root = I.root;
    root.visible = true;
    root.position.set(z.pos.x, floor, z.pos.z);
    root.quaternion.identity();
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const hb = I.list[0];
    hb.bone.position.copy(hb.bone.parent.worldToLocal(v.copy(hipsW)));
    for (const d of I.list) {
      if (d.pi >= 0) d.bone.quaternion.copy(I.list[d.pi].W).invert().multiply(d.W);
      else d.bone.quaternion.copy(d.bone.parent.getWorldQuaternion(q)).invert().multiply(d.W);
    }
    // trepando, saltando o volando: lo más bajo de los pies a la altura del juego
    // (andando no: el clip ya trae el paso en el piso, y apretarlo a cada
    // cuadro lo hacía saltar)
    if (want.feet) {
      root.updateMatrixWorld(true);
      let low = Infinity;
      for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) low = Math.min(low, I.bones[n].getWorldPosition(v).y);
      if (low < Infinity) {
        hipsW.y += floor - low + (V.meta.ankle || 0) * 0.15 * s;
        hb.bone.position.copy(hb.bone.parent.worldToLocal(v.copy(hipsW)));
      }
    }
    return true;
  }

  // ¿Le pegaron un tiro? (la vida que baja; de vez en cuando lo sacude)
  hurt(z, I, dt, want) {
    if (I.hurt) {
      I.hurtT += dt;
      if (I.hurtT > I.hurt[2] - I.hurt[1]) {
        I.hurt = null;
        I.hurtGap = HURT_GAP;
      }
    }
    I.hurtGap = Math.max(0, (I.hurtGap || 0) - dt);
    const hp = z.hp;
    const hit = I.hp != null && hp < I.hp - 1;
    I.hp = hp;
    if (!hit || I.hurt || I.hurtGap > 0 || want.lift || want.sink || z.crawler || Math.random() > HURT_P) return;
    I.hurt = pickOf(HURT);
    I.hurtT = 0;
  }

  // Después de todos (Zombies.render): los que ya no están, escondidos.
  endFrame() {
    for (const I of this.inst.values()) if (I.seen !== this.frame) I.root.visible = false;
    this.frame++;
  }

  // Se fue (Zombies.free): la próxima vez, otra variante y otro andar.
  free(z) {
    z.skinV = null;
    const I = this.inst.get(z.slot);
    if (I) {
      I.root.visible = false;
      I.layers.length = 0;
      I.deadT = null;
      I.walk = null;
      I.last = null;
      I.v = 0;
    }
  }

  dispose() {
    for (const I of this.inst.values()) I.root.removeFromParent();
    this.inst.clear();
  }
}
