import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../../lib/assets';
import { makePose, solvePose } from '../skeleton';
import { skinLook } from '../bossSkin';

// Manuel Belgrano de verdad (low poly facetado, Meshy) para el final del
// Monumento (ui/MonumentoEnding): como el gaucho de net/gauchoSkin, cada hueso
// sigue a la pieza del esqueleto de siempre, así las poses de la escena
// (levanta la mano, recibe el mate, toma) salen igual. Va en a.gs del muñeco
// de Avatars (Avatars llama a pose después de resolver las piezas) y su
// material queda en a.M.belgrano (la escena lo hace ánima o sólido).
// Mientras baja el archivo (o si no está) queda el muñeco de piezas.

const URL = '/assets/sotano/modelos/belgrano/modelo.glb';
// hueso → pieza (y si va entre dos, la otra y cuánto); el "L" de las piezas es el Right del modelo
const MAP = [
  ['Hips', 0], ['Spine02', 0, 1, 0.75], ['Spine01', 0, 1, 0.92], ['Spine', 1], ['LeftShoulder', 1], ['RightShoulder', 1], ['neck', 1, 2, 0.5], ['Head', 2],
  ['RightArm', 3], ['RightForeArm', 5], ['RightHand', 5], ['LeftArm', 4], ['LeftForeArm', 6], ['LeftHand', 6],
  ['RightUpLeg', 7], ['RightLeg', 9], ['RightFoot', 11], ['LeftUpLeg', 8], ['LeftLeg', 10], ['LeftFoot', 12],
];
const HANDS = [[5, 'RightForeArm', 'RightHand'], [6, 'LeftForeArm', 'LeftHand']];
const GRIP = 0.075;
const HAND_AT = new THREE.Vector3(0, -0.19, 0);
const RIG_THIGH = 0.03;

let T = null;
let state = 0;
const waiting = new Set();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vs = new THREE.Vector3();
const pp = Array.from({ length: 13 }, () => new THREE.Vector3());
const pq = Array.from({ length: 13 }, () => new THREE.Quaternion());
const updateMW = THREE.Object3D.prototype.updateMatrixWorld;

// Las astillas del modelo de Meshy: triángulos larguísimos y finitos que van de
// la cara (pesados a la cabeza) al hombro (pesados al hombro); al mover la
// cabeza quedaban como una línea de la cara al hombro (el usuario, 2026-10-05).
// Se achatan a un punto (globalThis.__mduNoBelAstilla: como antes).
function dropSlivers(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const wOf = (i, re) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (re.test(names[si.getComponent(i, k)])) w += sw.getComponent(i, k);
    return w;
  };
  const HEAD = /^(Head|headfront|head_end)$/;
  const SHOULDER = /Shoulder|Arm/;
  const idx = geo.index;
  const n = idx ? idx.count / 3 : pos.count / 3;
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let dropped = 0;
  for (let t = 0; t < n; t++) {
    const v = [vi(t, 0), vi(t, 1), vi(t, 2)];
    a.fromBufferAttribute(pos, v[0]);
    b.fromBufferAttribute(pos, v[1]);
    c.fromBufferAttribute(pos, v[2]);
    const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const area = 0.5 * e1.subVectors(b, a).cross(e2.subVectors(c, a)).length();
    // un triángulo largo que va derecho de un vértice de la cabeza a uno del
    // hombro (la patilla izquierda al hombro, ~16 cm: la "línea")
    if (L < 0.09 || area > L * 0.012) continue;
    if (Math.max(...v.map((i) => wOf(i, HEAD))) < 0.6 || Math.max(...v.map((i) => wOf(i, SHOULDER))) < 0.6) continue;
    if (idx) {
      idx.setX(t * 3 + 1, v[0]);
      idx.setX(t * 3 + 2, v[0]);
    } else {
      for (const k of [1, 2]) pos.setXYZ(v[k], a.x, a.y, a.z);
    }
    dropped++;
  }
  if (dropped) {
    if (idx) idx.needsUpdate = true;
    else pos.needsUpdate = true;
  }
  // y la patilla: los vértices de la cabeza (arriba del cuello) con algo de peso
  // al hombro se estiraban hacia abajo al mover el hombro: todo a la cabeza
  const head = names.indexOf('Head');
  let moved = 0;
  if (head >= 0) {
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 1.48 || wOf(i, HEAD) < 0.5) continue;
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (!SHOULDER.test(names[si.getComponent(i, k)])) continue;
        w += sw.getComponent(i, k);
        sw.setComponent(i, k, 0);
      }
      if (w <= 0) continue;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === head) sw.setComponent(i, k, sw.getComponent(i, k) + w);
      moved++;
    }
    if (moved) sw.needsUpdate = true;
  }
  globalThis.__belHeadW = moved;
  globalThis.__belSlivers = dropped;
}

function prep(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  const bones = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  if (!mesh || !bones.Hips) throw new Error('belgrano: sin malla o sin huesos');
  if (globalThis.__mduNoBelAstilla !== true) dropSlivers(mesh);
  const restMats = Array.from({ length: 18 }, () => new THREE.Matrix4());
  solvePose(restMats, 0, 0, 0, 1, makePose());
  const partRest = restMats.slice(0, 13).map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
  const list = MAP.map(([name, p0, p1, k]) => ({ name, p0, p1, k, rest: bones[name].getWorldQuaternion(new THREE.Quaternion()) }));
  const depth = (b) => (b.parent?.isBone ? 1 + depth(b.parent) : 0);
  list.sort((a, b) => depth(bones[a.name]) - depth(bones[b.name]));
  for (const d of list) d.pi = list.findIndex((o) => o.name === bones[d.name].parent?.name);
  const hipsW = bones.Hips.getWorldPosition(new THREE.Vector3());
  const thighMid = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()).add(bones.RightUpLeg.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const arm = bones.Hips.parent;
  T = {
    root,
    map: mesh.material.map,
    list,
    partRest,
    mid: thighMid.clone().sub(hipsW),
    dL: makePose().hipY - RIG_THIGH - thighMid.y,
    armQ: arm.getWorldQuaternion(new THREE.Quaternion()),
    armInv: arm.matrixWorld.clone().invert(),
  };
}

// Que baje el modelo (una vez); fn cuando esté.
export function whenBelgrano(fn) {
  if (state === 2) return fn();
  if (state === 3) return;
  waiting.add(fn);
  if (state) return;
  state = 1;
  new GLTFLoader().load(
    assetUrl(URL),
    (gltf) => {
      try {
        prep(gltf);
        state = 2;
      } catch (e) {
        console.warn(e);
        state = 3;
      }
      const fns = [...waiting];
      waiting.clear();
      if (state === 2) for (const f of fns) f();
    },
    undefined,
    () => {
      state = 3;
      waiting.clear();
    },
  );
}

// Le pone el modelo a un muñeco de Avatars (si ya bajó, ya; si no, cuando baje).
export function belgranoSkin(a) {
  whenBelgrano(() => {
    if (a.gs || !a.group.parent) return;
    const root = cloneSkinned(T.root);
    let mesh = null;
    const bones = {};
    root.traverse((o) => {
      if (o.isSkinnedMesh) mesh = o;
      if (o.isBone) bones[o.name] = o;
    });
    const mat = new THREE.MeshStandardMaterial({ map: T.map, roughness: 0.85, metalness: 0, transparent: true, opacity: 0 });
    skinLook(mat);
    mesh.material = mat;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    a.M.belgrano = mat;
    mat.addEventListener('dispose', () => mesh.skeleton.dispose());
    const G = { a, root, mesh, mat, bones, on: true, list: T.list.map((d) => ({ ...d, bone: bones[d.name], W: new THREE.Quaternion() })) };
    G.pose = (adjust) => pose(G, adjust);
    // las piezas, el sombrero, la cara y el poncho del muñeco se esconden (la mano con el mate queda)
    G.blocky = [...a.parts, ...(a.extras || []).map((e) => e.obj)];
    // (y el poncho del muñeco, que no está en las piezas: estirado por la pose
    // quedaba como una línea de la cara al hombro; __mduNoBelPoncho: como antes)
    if (globalThis.__mduNoBelPoncho !== true) {
      a.group.traverse((o) => {
        if (o.isMesh && (o.material === a.M.poncho || (a.M.coat && o.material === a.M.coat)) && !G.blocky.includes(o)) G.blocky.push(o);
      });
    }
    for (const o of G.blocky) o.visible = false;
    a.group.add(root);
    a.gs = G;
    pose(G, true);
  });
}

// Los huesos según las piezas (a.mats); adjust: además las piezas de los
// antebrazos se corren a la mano del modelo (el mate que le convidan, en su mano).
function pose(G, adjust) {
  const a = G.a;
  const M = a.mats;
  for (let i = 0; i < 13; i++) {
    M[i].decompose(pp[i], pq[i], vs);
    pq[i].multiply(T.partRest[i]);
  }
  const L = G.list;
  for (const d of L) {
    if (d.p1 == null) d.W.copy(pq[d.p0]);
    else d.W.copy(pq[d.p0]).slerp(pq[d.p1], d.k);
    d.W.multiply(d.rest);
    const pw = d.pi >= 0 ? L[d.pi].W : T.armQ;
    d.bone.quaternion.copy(qa.copy(pw).invert()).multiply(d.W);
  }
  M[0].decompose(va, qb, vs);
  vb.set(0, -RIG_THIGH, 0).applyQuaternion(qb).add(va);
  vb.addScaledVector(vc.set(0, 1, 0).applyQuaternion(qb), -T.dL);
  vb.sub(vc.copy(T.mid).applyQuaternion(qb));
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  if (!adjust) return;
  updateMW.call(G.root, true);
  for (const [part, fore, hand] of HANDS) {
    G.bones[hand].getWorldPosition(va);
    G.bones[fore].getWorldPosition(vb);
    va.addScaledVector(vb.subVectors(va, vb).normalize(), GRIP);
    // (a lo del grupo del muñeco: las piezas viven en su espacio)
    a.group.worldToLocal(va);
    M[part].decompose(vc, qa, vs);
    vb.copy(HAND_AT).applyQuaternion(qa);
    M[part].setPosition(va.sub(vb));
  }
}
