import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { makePose, solvePose } from './skeleton';
import { skinLook, glowEye } from './bossSkin';

// Un jefe con cuerpo de verdad (los modelos de entities/bossSkin.js) puesto en
// un muñeco de piezas de net/Avatars: cada hueso sigue a su pieza (a.mats, ya
// resueltas), como los gauchos de net/gauchoSkin.js, así las poses que arma la
// cinemática a mano salen igual. Para las escenas que hacen su personaje con
// Avatars (Francisco en la intro del molino). Mientras baja el archivo (o si
// no está) queda el de piezas.

const DIR = '/assets/sotano/modelos/';
// de la cadera de piezas a la articulación de los muslos
const RIG_THIGH = 0.03;
// la mano de cada pieza de antebrazo (5: Right del modelo, 6: Left)
const HANDS = { 5: ['RightForeArm', 'RightHand'], 6: ['LeftForeArm', 'LeftHand'] };
// lo que agarra la mano: de la muñeca hacia los dedos (m)
const GRIP = 0.075;

const LOADED = {};
const qa = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vs = new THREE.Vector3();
const pq = Array.from({ length: 13 }, () => new THREE.Quaternion());
const updateMW = THREE.Object3D.prototype.updateMatrixWorld;

function load(dir) {
  LOADED[dir] ||= new Promise((ok) => {
    new GLTFLoader().load(
      assetUrl(DIR + dir + '/modelo.glb'),
      (gltf) => ok(gltf),
      undefined,
      () => ok(null),
    );
  });
  return LOADED[dir];
}

// a: la entrada de Avatars.list; dir: la carpeta del jefe (francisco...).
// eyeMat: el material de los ojos del muñeco (la escena le cambia el color).
// Devuelve el títere (a.sk): sk.hand(part, out) da la mano del modelo.
export function skinPuppet(a, dir, { eyeMat = null, dot = null } = {}) {
  const sk = { on: false, a, hand: () => null };
  a.sk = sk;
  // el gaucho de net/gauchoSkin no: si ya está, se apaga; si no, ya no se pone
  if (a.gs) {
    a.gs.on = false;
    a.gs.root.visible = false;
  } else a.gs = { on: false, pose() {} };
  load(dir).then((gltf) => {
    if (!gltf || !a.group.parent || a.sk !== sk) return;
    // (cada muñeco con su copia: el original queda para el siguiente)
    const root = cloneSkinned(gltf.scene);
    root.updateMatrixWorld(true);
    let meta = null;
    let mesh = null;
    const bones = {};
    root.traverse((o) => {
      if (o.userData?.boss) meta = o.userData.boss;
      if (o.isBone || /^eye[AB]$/.test(o.name)) bones[o.name] = o;
      if (o.isSkinnedMesh) mesh = o;
    });
    if (!meta || !mesh || !bones.Hips) return;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    for (const m of [].concat(mesh.material)) skinLook(m);
    // el reposo: el giro de cada hueso en el mundo y el de su pieza
    const restMats = Array.from({ length: 18 }, () => new THREE.Matrix4());
    solvePose(restMats, 0, 0, 0, 1, makePose());
    const partRest = restMats.slice(0, 13).map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
    const list = meta.map.filter(([n]) => bones[n]).map(([name, p0, p1, k]) => ({ name, p0, p1, k, bone: bones[name], rest: bones[name].getWorldQuaternion(new THREE.Quaternion()), W: new THREE.Quaternion() }));
    const depth = (b) => (b.parent?.isBone ? 1 + depth(b.parent) : 0);
    list.sort((x, y) => depth(x.bone) - depth(y.bone));
    for (const d of list) d.pi = list.findIndex((o) => o.bone === d.bone.parent);
    const hipsW = bones.Hips.getWorldPosition(new THREE.Vector3());
    const thighMid = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()).add(bones.RightUpLeg.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const arm = bones.Hips.parent;
    const T = {
      list,
      partRest,
      mid: thighMid.clone().sub(hipsW),
      // lo que le falta (o le sobra) a la pierna del modelo para la de piezas
      dL: makePose().hipY - RIG_THIGH - thighMid.y,
      armQ: arm.getWorldQuaternion(new THREE.Quaternion()),
      armInv: arm.matrixWorld.clone().invert(),
    };
    // los ojos encendidos (del color que les dé la escena)
    if (eyeMat && meta.eye) for (const n of ['eyeA', 'eyeB']) if (bones[n]) glowEye(bones[n], eyeMat, meta.eye, dot);
    const snap = new Float64Array(13 * 16);
    const changed = () => {
      for (let i = 0; i < 13; i++) {
        const e = a.mats[i].elements;
        for (let k = 0; k < 16; k++) if (snap[i * 16 + k] !== e[k]) return true;
      }
      return false;
    };
    // los huesos según las piezas
    const pose = () => {
      const M = a.mats;
      for (let i = 0; i < 13; i++) {
        M[i].decompose(va, pq[i], vs);
        pq[i].multiply(T.partRest[i]);
      }
      for (const d of T.list) {
        if (d.p1 == null) d.W.copy(pq[d.p0]);
        else d.W.copy(pq[d.p0]).slerp(pq[d.p1], d.k);
        d.W.multiply(d.rest);
        const pw = d.pi >= 0 ? T.list[d.pi].W : T.armQ;
        d.bone.quaternion.copy(qa.copy(pw).invert()).multiply(d.W);
      }
      // la cadera: el medio de los muslos del modelo donde están los de las piezas
      M[0].decompose(va, qa, vs);
      vb.set(0, -RIG_THIGH, 0).applyQuaternion(qa).add(va);
      vb.addScaledVector(vc.set(0, 1, 0).applyQuaternion(qa), -T.dL);
      vb.sub(vc.copy(T.mid).applyQuaternion(qa));
      bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
      for (let i = 0; i < 13; i++) snap.set(M[i].elements, i * 16);
      updateMW.call(root, true);
    };
    // a la hora de dibujar, el modelo sigue a la pose que tenga el muñeco
    root.updateMatrixWorld = function (force) {
      if (sk.on && changed()) pose();
      updateMW.call(this, force);
    };
    // la mano del modelo (lo que agarra, un poco más allá de la muñeca)
    sk.hand = (part, out) => {
      const H = HANDS[part];
      if (!sk.on || !H) return null;
      if (changed()) pose();
      bones[H[1]].getWorldPosition(out);
      bones[H[0]].getWorldPosition(vb);
      return out.addScaledVector(vb.subVectors(out, vb).normalize(), GRIP);
    };
    // las piezas (y el sombrero, la cara...) se esconden: queda el modelo
    for (const c of a.group.children) c.visible = false;
    a.group.add(root);
    sk.root = root;
    sk.on = true;
    pose();
  });
  return sk;
}
