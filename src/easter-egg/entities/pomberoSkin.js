import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../lib/assets';
import { skinLook, glowEye, cullList, cullAt } from './bossSkin';

// El Pombero con cuerpo de verdad: el modelo low poly (Meshy, con el esqueleto
// de siempre) en lugar de las piezas de entities/Pombero.js, que siguen
// haciendo todo lo demás (el golpe, la red, el botín que lleva). Mientras baja
// el modelo se ven las piezas. window.__pomberoSkinOff = true deja ver las piezas.
//
// Los clips (clips.json, como los de entities/bossSkin.js): aparece (sale del
// pozo haciendo jazz con las manos), corre (a los saltitos, a buscar el
// potenciador), huye (se va saludando), quieto (encorvado; también agazapado
// en el pajonal, mirando) y muere.

const DIR = '/assets/sotano/modelos/pombero/';
// lo alto que queda el modelo (con el sombrero) a escala 1 del de piezas
// (el usuario, 2026-10-01: un toque más chico, y las manos más chicas)
const SIZE = 1.15;
const HAND = 0.72;
const FADE = 0.22;
// el paso: el clip a tiempo con lo que avanza, hasta RATE_MAX
const RATE_MAX = 2.1;
// agazapado en el pajonal: cuánto se hunde (m) y en qué cuadro del quieto se queda
const SINK = 0.52;
const CROUCH_T = 2.9;
// los ojos: la bolita encendida y, agazapado, el brillo que se ve de lejos
const EYE_R = 0.013;
const EYE_GLOW = 0.26;

const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const hips = new THREE.Vector3();

export default class PomberoSkin {
  constructor(pomb) {
    this.p = pomb;
    this.state = 1;
    this.layers = [];
    const base = assetUrl(DIR);
    const clips = fetch(base + 'clips.json').then((r) => r.json());
    new GLTFLoader().load(
      base + 'modelo.glb',
      async (gltf) => {
        try {
          this.ready(gltf.scene, await clips);
        } catch {
          this.state = 3;
        }
      },
      undefined,
      () => {
        this.state = 3;
      },
    );
  }

  ready(root, C) {
    const P = this.p;
    root.updateMatrixWorld(true);
    const bones = {};
    let meta = null;
    root.traverse((o) => {
      if (o.userData?.boss) meta = o.userData.boss;
      if (o.isBone || /^(luEye|eye)[AB]$/.test(o.name)) bones[o.name] = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        // (el ala del sombrero, finita, agarraba mucho borde de luz)
        skinLook(o.material, { rim: 0.35 });
      }
    });
    this.bones = bones;
    // (el recorte: una esfera alrededor de la cadera, bossSkin cullList)
    this.cull = cullList(root);
    // las manos más chicas (desde la muñeca; los clips solo giran los huesos)
    for (const n of ['LeftHand', 'RightHand']) bones[n]?.scale.multiplyScalar(HAND);
    this.hipsRest = bones.Hips.getWorldPosition(new THREE.Vector3());
    this.feetMid = new THREE.Vector3();
    for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) this.feetMid.add(bones[n].getWorldPosition(v));
    this.feetMid.multiplyScalar(0.25).setY(0);
    // lo alto del modelo en reposo (para la escala)
    this.height = new THREE.Box3().setFromObject(root).getSize(v).y || 1;
    this.list = C.bones.map((name) => ({ name, bone: bones[name], W: new THREE.Quaternion() }));
    for (const d of this.list) d.pi = this.list.findIndex((o) => o.bone === d.bone.parent);
    this.by = Object.fromEntries(this.list.map((d) => [d.name, d]));
    this.nb = C.bones.length;
    this.fps = C.fps;
    this.clips = {};
    for (const [k, cl] of Object.entries(C.clips)) this.clips[k] = { ...cl, q: Float32Array.from(cl.q), hips: Float32Array.from(cl.hips) };
    // los ojos: amarillos, encendidos (sin la luz del mapa)
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(2.2), toneMapped: false });
    const glowMat = new THREE.SpriteMaterial({ map: P.g.textures?.dot || null, color: 0xffb030, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.glowMat = glowMat;
    for (const n of ['luEyeA', 'luEyeB', 'eyeA', 'eyeB']) {
      const o = bones[n];
      if (!o) continue;
      // (encendidos y en las cuencas, como los de los muertos)
      glowEye(o, eyeMat, EYE_R, P.g.textures?.dot);
      // agazapado en el pajonal: un brillo más grande, que se vea de lejos
      const ws = 1 / o.getWorldScale(v).x;
      const sp = new THREE.Sprite(glowMat);
      sp.scale.setScalar(EYE_GLOW * ws);
      o.add(sp);
    }
    root.visible = false;
    // (escondido no se recorre cada cuadro: core/matrixCache.js mcSleep)
    root.mcSleep = !(globalThis.__mduNoMerge || globalThis.__mduNo1d);
    P.g.scene.add(root);
    this.root = root;
    // el botín: ya no arriba de la cabeza de las piezas, entre las manos del modelo
    this.holdHome = { parent: P.hold.parent, pos: P.hold.position.clone() };
    this.state = 2;
  }

  // Un cuadro de un clip (giros en el espacio del modelo y la cadera).
  sample(key, t, loop, out, hp) {
    const cl = this.clips[key];
    const f = Math.max(0, t) * this.fps;
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
    for (let i = 0; i < this.nb; i++) {
      qa.fromArray(cl.q, (f0 * this.nb + i) * 4);
      qb.fromArray(cl.q, (f1 * this.nb + i) * 4);
      out[i].copy(qa).slerp(qb, al);
    }
    const h = cl.hips;
    hp.set(h[f0 * 3] + (h[f1 * 3] - h[f0 * 3]) * al, h[f0 * 3 + 1] + (h[f1 * 3 + 1] - h[f0 * 3 + 1]) * al, h[f0 * 3 + 2] + (h[f1 * 3 + 2] - h[f0 * 3 + 2]) * al);
  }

  // Qué hace, según el estado del de piezas.
  pick(dt) {
    const P = this.p;
    const C = this.clips;
    const st = P.state;
    if (st === 'dead') return { key: 'muere', t: Math.min(C.muere.dur - 1e-3, P.t * 1.3), loop: false };
    if (st === 'appear') return { key: 'aparece', t: 0.4 + P.t * 1.4, loop: false };
    if (st === 'watch') return { key: 'quieto', t: CROUCH_T, loop: false, watch: true };
    if (st === 'toItem' || st === 'flee') {
      const key = st === 'flee' ? 'huye' : 'corre';
      const vm = (P.speed || 3.5) / Math.max(0.1, this.s || 1);
      this.runT = (this.runT || 0) + dt * Math.max(0.6, Math.min(RATE_MAX, vm / Math.max(0.2, C[key].speed)));
      return { key, t: this.runT % C[key].dur, loop: true };
    }
    this.idleT = (this.idleT || 0) + dt;
    return { key: 'quieto', t: this.idleT % C.quieto.dur, loop: true };
  }

  // Cada cuadro (después de Pombero.animate). true: se ve el modelo (las piezas no).
  update(dt) {
    const P = this.p;
    const z = P.z;
    if (this.state !== 2 || window.__pomberoSkinOff) {
      if (this.root) this.root.visible = false;
      this.restoreHold();
      return false;
    }
    const root = this.root;
    root.visible = z.active;
    if (!z.active) {
      this.layers.length = 0;
      this.restoreHold();
      return true;
    }
    // la escala: la del de piezas (crece al salir del pozo) por lo alto que tiene que quedar
    const s = (SIZE / this.height) * P.rig.scale.x;
    this.s = s;
    const want = this.pick(dt);
    let top = this.layers[this.layers.length - 1];
    if (!top || top.key !== want.key) {
      top = { key: want.key, w: this.layers.length ? 0 : 1, W: this.list.map(() => new THREE.Quaternion()), hips: new THREE.Vector3() };
      this.layers.push(top);
    }
    top.t = want.t;
    top.loop = want.loop;
    top.w = Math.min(1, top.w + dt / FADE);
    for (const L of this.layers) if (L !== top) L.w = Math.max(0, L.w - dt / FADE);
    this.layers = this.layers.filter((L) => L === top || L.w > 1e-3);
    qYaw.setFromAxisAngle(UP, z.yaw || 0);
    for (const L of this.layers) {
      this.sample(L.key, L.t, L.loop, L.W, v);
      for (const W of L.W) W.premultiply(qYaw);
      L.hips.copy(this.hipsRest).sub(this.feetMid).add(v).multiplyScalar(s).applyQuaternion(qYaw);
    }
    // mezcladas (la de arriba sobre las que se van)
    const L0 = this.layers[0];
    for (let i = 0; i < this.nb; i++) this.list[i].W.copy(L0.W[i]);
    hips.copy(L0.hips);
    let acc = L0.w;
    for (let j = 1; j < this.layers.length; j++) {
      const L = this.layers[j];
      acc += L.w;
      const k = acc > 0 ? L.w / acc : 1;
      for (let i = 0; i < this.nb; i++) this.list[i].W.slerp(L.W[i], k);
      hips.lerp(L.hips, k);
    }
    // agazapado en el pajonal: más abajo, que asome la cabeza entre las cañas
    const floor = z.pos.y - (want.watch ? SINK * P.rig.scale.x : 0);
    hips.x += z.pos.x;
    hips.y += floor;
    hips.z += z.pos.z;
    root.position.set(z.pos.x, floor, z.pos.z);
    root.quaternion.identity();
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    const hb = this.list[0];
    hb.bone.position.copy(hb.bone.parent.worldToLocal(v.copy(hips)));
    for (const d of this.list) {
      if (d.pi >= 0) d.bone.quaternion.copy(this.list[d.pi].W).invert().multiply(d.W);
      else d.bone.quaternion.copy(d.bone.parent.getWorldQuaternion(q)).invert().multiply(d.W);
    }
    root.updateMatrixWorld(true);
    cullAt(this.cull, hb.bone.getWorldPosition(a));
    // con el botín: los brazos arriba, sosteniéndolo sobre la cabeza
    if (P.carry) this.armsUp(z);
    this.placeHold();
    // los ojos se ven de lejos solo agazapado
    this.glowMat.opacity += ((want.watch ? 1 : 0) - this.glowMat.opacity) * Math.min(1, dt * 6);
    return true;
  }

  // Los dos brazos para arriba (el hueso del brazo y el del antebrazo, en el mundo).
  armsUp(z) {
    const fw = v.set(Math.sin(z.yaw), 0, Math.cos(z.yaw));
    for (const s of ['Left', 'Right']) {
      const side = s === 'Left' ? 1 : -1;
      const want = a.set(0, 1, 0).addScaledVector(fw, 0.2).add(b.set(Math.cos(z.yaw) * side * 0.25, 0, -Math.sin(z.yaw) * side * 0.25)).normalize();
      for (const [n, c] of [[s + 'Arm', s + 'ForeArm'], [s + 'ForeArm', s + 'Hand']]) {
        const bn = this.bones[n];
        const cb = this.bones[c];
        const from = cb.getWorldPosition(b).sub(bn.getWorldPosition(v)).normalize();
        q.setFromUnitVectors(from, want);
        const wq = bn.getWorldQuaternion(qa).premultiply(q);
        bn.quaternion.copy(bn.parent.getWorldQuaternion(qb).invert().multiply(wq));
        bn.updateMatrixWorld(true);
      }
    }
  }

  // El botín entre las manos del modelo (en el espacio del de piezas).
  placeHold() {
    const P = this.p;
    if (!P.carry) return;
    if (P.hold.parent !== P.rig) P.rig.add(P.hold);
    this.bones.LeftHand.getWorldPosition(a);
    this.bones.RightHand.getWorldPosition(b);
    a.add(b).multiplyScalar(0.5);
    a.y += 0.12;
    P.rig.updateMatrixWorld(true);
    P.hold.position.copy(P.rig.worldToLocal(a));
  }

  restoreHold() {
    const P = this.p;
    const H = this.holdHome;
    if (H && P.hold.parent !== H.parent) {
      H.parent.add(P.hold);
      P.hold.position.copy(H.pos);
    }
  }

  dispose() {
    this.root?.removeFromParent();
  }
}
