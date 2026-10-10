import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../../lib/assets';
import { makePose, solvePose } from '../skeleton';
import { skinLook } from '../bossSkin';
import { sableModel } from '../../weapons/sableModels';
import { warmObject } from '../../fx/ghostMat';
import { clipPose } from './personClip';

// Los cuerpos de San Lorenzo (Eclipse Matero): lo que comparten San Martín,
// los granaderos (y Cabral) y los caballos, y el montar. Los modelos son de
// Meshy, facetados (public/assets/sotano/modelos/<nombre>/modelo.glb); se
// bajan recién cuando alguien los pide (whenModel), así que en los otros
// mapas no se carga nada de esto.
//
// Las personas van como el Belgrano del Monumento (entities/monumento/
// belgranoSkin): un muñeco de Avatars (net/Avatars) con el modelo encima;
// cada hueso sigue a la pieza del esqueleto de siempre, así que todas las
// poses de piezas (r.poseFn) y el caminar de Avatars sirven tal cual.
//   const a = addPerson(people, r, (a) => sanMartinSkin(a));   (skins/sanmartin.js)
// El sable va en la mano derecha (la del modelo; en las piezas es la "L",
// x<0: shLp/shLr/elL).
//
// Montar (Montura): el jinete sigue el asiento de un caballo de
// skins/caballo.js. Orden por cuadro: caballos.update(dt) → montura.update(dt)
// → people.update(dt).
//
// En la carga del mapa (para que nada compile en plena pelea): prepararPersonas(g)
// baja San Martín, el granadero y la textura de Cabral y compila sus programas
// (y los de los sables); new Caballos(g) hace lo mismo con el caballo.

const DIR = '/assets/sotano/modelos/';
export const MODEL = {
  sanMartin: DIR + 'san-martin/modelo.glb',
  granadero: DIR + 'granadero/modelo.glb',
  // (Cabral: la textura con la piel morena, misma malla que el granadero)
  cabral: DIR + 'granadero/cabral.jpg',
  // (el caballo del infierno ya ocupa modelos/caballo: el zaino de San Lorenzo va aparte)
  caballo: DIR + 'zaino/modelo.glb',
  jinete: DIR + 'jinete/modelo.glb',
};

// Un GLB, una vez: fn(gltf) cuando esté (en el acto si ya bajó). Si falla, no
// llama nunca (queda lo de reemplazo de quien lo pidió).
const CACHE = new Map();
export function whenModel(url, fn) {
  let c = CACHE.get(url);
  if (!c) {
    c = { state: 1, gltf: null, wait: [] };
    CACHE.set(url, c);
    new GLTFLoader().load(
      assetUrl(url),
      (gltf) => {
        c.state = 2;
        c.gltf = gltf;
        const fns = c.wait;
        c.wait = [];
        for (const f of fns) f(gltf);
      },
      undefined,
      (e) => {
        console.warn('modelo sin bajar', url, e?.message || e);
        c.state = 3;
        c.wait = [];
      },
    );
  }
  if (c.state === 2) fn(c.gltf);
  else if (c.state === 1) c.wait.push(fn);
}

// Una textura suelta (la de Cabral), una vez.
const TEX = new Map();
function whenTex(url, fn) {
  let c = TEX.get(url);
  if (!c) {
    c = { tex: null, wait: [] };
    TEX.set(url, c);
    new THREE.TextureLoader().load(
      assetUrl(url),
      (t) => {
        t.flipY = false;
        t.colorSpace = THREE.SRGBColorSpace;
        c.tex = t;
        for (const f of c.wait) f(t);
        c.wait = [];
      },
      undefined,
      () => (c.wait = []),
    );
  }
  if (c.tex) fn(c.tex);
  else c.wait.push(fn);
}

// ---------------- las personas ----------------
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
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vs = new THREE.Vector3();
const pp = Array.from({ length: 13 }, () => new THREE.Vector3());
const pq = Array.from({ length: 13 }, () => new THREE.Quaternion());
const updateMW = THREE.Object3D.prototype.updateMatrixWorld;
const TPL = new Map();

// Las astillas de Meshy (triángulos larguísimos de la cara al hombro: al mover
// la cabeza quedaban como una línea, lo que tuvo el Belgrano): se achatan, y los
// vértices de la cabeza con peso del hombro van todos a la cabeza.
function dropSlivers(mesh, neckY) {
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
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let dropped = 0;
  for (let t = 0; t < pos.count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const area = 0.5 * vb.subVectors(b, a).cross(vc.subVectors(c, a)).length();
    if (L < 0.09 || area > L * 0.012) continue;
    const v = [t * 3, t * 3 + 1, t * 3 + 2];
    if (Math.max(...v.map((i) => wOf(i, HEAD))) < 0.6 || Math.max(...v.map((i) => wOf(i, SHOULDER))) < 0.6) continue;
    pos.setXYZ(t * 3 + 1, a.x, a.y, a.z);
    pos.setXYZ(t * 3 + 2, a.x, a.y, a.z);
    dropped++;
  }
  const head = names.indexOf('Head');
  let moved = 0;
  for (let i = 0; i < pos.count && head >= 0; i++) {
    if (pos.getY(i) < neckY || wOf(i, HEAD) < 0.5) continue;
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
  if (dropped) pos.needsUpdate = true;
  if (moved) sw.needsUpdate = true;
  return { dropped, moved };
}

function prep(url, gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  const bones = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  if (!mesh || !bones.Hips) throw new Error('persona sin malla o sin huesos: ' + url);
  const sl = globalThis.__mduNoSlAstilla === true ? null : dropSlivers(mesh, bones.neck.getWorldPosition(va).y);
  const restMats = Array.from({ length: 18 }, () => new THREE.Matrix4());
  solvePose(restMats, 0, 0, 0, 1, makePose());
  const partRest = restMats.slice(0, 13).map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
  const list = MAP.map(([name, p0, p1, k]) => ({ name, p0, p1, k, rest: bones[name].getWorldQuaternion(new THREE.Quaternion()) }));
  const depth = (b) => (b.parent?.isBone ? 1 + depth(b.parent) : 0);
  list.sort((x, y) => depth(bones[x.name]) - depth(bones[y.name]));
  for (const d of list) d.pi = list.findIndex((o) => o.name === bones[d.name].parent?.name);
  const hipsW = bones.Hips.getWorldPosition(new THREE.Vector3());
  const thighMid = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()).add(bones.RightUpLeg.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const arm = bones.Hips.parent;
  return {
    root,
    map: mesh.material.map,
    list,
    partRest,
    slivers: sl,
    mid: thighMid.clone().sub(hipsW),
    dL: makePose().hipY - RIG_THIGH - thighMid.y,
    armQ: arm.getWorldQuaternion(new THREE.Quaternion()),
    armInv: arm.matrixWorld.clone().invert(),
  };
}

// Un muñeco de Avatars para una persona de Meshy (sin el gaucho encima: las
// piezas quedan hasta que baja el modelo). skin(a) le pone el modelo.
export function addPerson(people, r, skin) {
  const off = window.__gauchoSkinOff;
  window.__gauchoSkinOff = true;
  people.add(r);
  window.__gauchoSkinOff = off;
  const a = people.list.get(r.id);
  skin?.(a);
  return a;
}

// El sable de los granaderos: liviano (una malla, un material, colores por
// vértice): hoja, cruz, puño y pomo. Como el de sableModels: la cruz en el
// origen, la hoja hacia +y, el filo hacia +x.
let SIMPLE = null;
function simpleSable() {
  if (!SIMPLE) {
    const col = (geo, hex) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const c = new THREE.Color(hex);
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      g.deleteAttribute('uv');
      return g;
    };
    // (la hoja un poco curva hacia el lomo y afinándose a la punta: una caja
    // con tramos que se doblan)
    const H = 0.8;
    const b = new THREE.BoxGeometry(0.03, H, 0.005, 1, 8, 1).translate(0, H / 2 + 0.01, 0);
    const bp = b.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const u = bp.getY(i) / H;
      bp.setX(i, bp.getX(i) * (1 - 0.55 * u * u) - 0.05 * u * u);
    }
    const blade = [col(b, 0xc9ced6)];
    const geo = mergeGeometries([
      ...blade,
      col(new THREE.BoxGeometry(0.1, 0.016, 0.022), 0xd4a446),
      col(new THREE.CylinderGeometry(0.015, 0.013, 0.12, 6).translate(0, -0.07, 0), 0x1c1612),
      col(new THREE.SphereGeometry(0.02, 6, 4).translate(0, -0.135, 0), 0xd4a446),
    ]);
    geo.computeVertexNormals();
    SIMPLE = { geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 }) };
  }
  const m = new THREE.Mesh(SIMPLE.geo, SIMPLE.mat);
  m.name = 'sableGranadero';
  return m;
}

// Le pone el modelo a un muñeco de Avatars (si ya bajó, ya; si no, cuando baje).
// def: { url, tex (otra textura: la de Cabral), sable: 'corvo' | 'simple' | null,
//        mate (deja el mate de la mano; si no, se esconde), shared (un material
//        para todos los de ese modelo: los granaderos) }
// Deja en a.gs el cuerpo (G.mat el material, G.sable el sable, G.sableK cuánto
// se inclina la hoja hacia adelante desde el antebrazo).
const SHARED = new Map();
export function personSkin(a, def) {
  whenModel(def.url, (gltf) => {
    let T = TPL.get(def.url);
    if (!T) {
      try {
        T = prep(def.url, gltf);
      } catch (e) {
        console.warn(e);
        return;
      }
      TPL.set(def.url, T);
    }
    const go = (map) => attachPerson(a, T, def, map);
    if (def.tex) whenTex(def.tex, go);
    else go(T.map);
  });
}

function attachPerson(a, T, def, map) {
  if (a.gs || !a.group.parent) return;
  const root = cloneSkinned(T.root);
  let mesh = null;
  const bones = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  const key = def.url + '|' + (def.tex || '');
  let mat = def.shared ? SHARED.get(key) : null;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
    skinLook(mat);
    if (def.shared) SHARED.set(key, mat);
  }
  mesh.material = mat;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  if (!def.shared) mat.addEventListener('dispose', () => mesh.skeleton.dispose());
  a.M.cuerpo = mat;
  const G = { a, root, mesh, mat, bones, on: true, sable: null, sableK: 0.9, slivers: T.slivers, list: T.list.map((d) => ({ ...d, bone: bones[d.name], W: new THREE.Quaternion() })) };
  G.pose = (adjust) => pose(G, T, adjust);
  // las piezas, el sombrero, la cara y el poncho del muñeco se esconden
  G.blocky = [...a.parts, ...(a.extras || []).map((e) => e.obj)];
  a.group.traverse((o) => {
    if (o.isMesh && o.material === a.M.poncho && !G.blocky.includes(o)) G.blocky.push(o);
  });
  for (const o of G.blocky) o.visible = false;
  // (el mate: San Martín y los granaderos tienen las manos ocupadas; Avatars
  // prende y apaga a.hand cada cuadro, así que se esconde lo de adentro)
  if (!def.mate) for (const c of a.hand.children) c.visible = false;
  if (def.sable) {
    const s = def.sable === 'corvo' ? sableModel(0) : simpleSable();
    s.matrixAutoUpdate = false;
    s.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    a.group.add(s);
    G.sable = s;
    // (2026-10-07, el usuario: "San Martín agarra mal el sable": el modelo no
    // tiene dedos y la mano abierta quedaba al lado del puño del sable. Con el
    // sable en la mano, la mano se achica y un puño de guante lo cierra.
    // globalThis.__mduOldSableGrip: como antes)
    if (globalThis.__mduOldSableGrip !== true) {
      const f = FIST9 ? new THREE.Mesh(FIST9_GEO, fistMat(mesh, map)) : new THREE.Mesh(FIST_GEO, FIST_MAT);
      f.matrixAutoUpdate = false;
      f.castShadow = false;
      a.group.add(f);
      G.fist = f;
    }
  }
  a.group.add(root);
  a.gs = G;
  pose(G, T, true);
}

// Los huesos según las piezas (a.mats); adjust: además las piezas de los
// antebrazos se corren a la mano del modelo y el sable va a la mano derecha.
const sX = new THREE.Vector3();
const sY = new THREE.Vector3();
const sZ = new THREE.Vector3();
const sF = new THREE.Vector3();
const sM = new THREE.Matrix4();
const sInv = new THREE.Matrix4();
const fM = new THREE.Matrix4();
const fS = new THREE.Matrix4();
// el puño cerrado (guante de gamuza clara)
const FIST_GEO = new THREE.IcosahedronGeometry(1, 1);
const FIST_MAT = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.82, metalness: 0, flatShading: true });
// (2026-10-09, el usuario: "el coronel agarra mal el sable": la bola del guante
// no se leía como una mano. Un puño: los cuatro dedos cerrados sobre la
// empuñadura, el dorso hacia la muñeca y el pulgar arriba, del color de la
// otra mano. En metros, con los ejes del sable: x el filo, y la hoja, z hacia
// adentro del cuerpo. globalThis.__mduOldFist9: la bola)
const FIST9 = globalThis.__mduOldFist9 !== true;
function fistGeo() {
  const parts = [];
  const box = (sx, sy, sz, x, y, z) => parts.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
  // los dedos, uno al lado del otro a lo largo de la empuñadura, cerrados del lado del filo
  for (let i = 0; i < 4; i++) box(0.06 - Math.abs(i - 1.5) * 0.004, 0.019, 0.05, 0.012, 0.03 - i * 0.021, 0);
  // el dorso, hacia afuera y hacia la muñeca
  box(0.056, 0.06, 0.034, 0, -0.035, -0.012);
  // el pulgar, arriba y del lado de adentro, hacia la cruz
  box(0.022, 0.05, 0.022, -0.028, 0.012, 0.016);
  return mergeGeometries(parts);
}
const FIST9_GEO = FIST9 ? fistGeo() : null;
// (el color del puño: el de la mano de cada modelo —San Martín más moreno que
// los granaderos—, la mediana de lo que pinta la textura en los puntos de la
// mano derecha que son piel; un material por textura)
const FIST9_MAT = new WeakMap();
function fistMat(mesh, map) {
  let m = map && FIST9_MAT.get(map);
  if (m) return m;
  const col = new THREE.Color(0xc89a78);
  try {
    const img = map?.image;
    const geo = mesh.geometry;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const uv = geo.attributes.uv;
    const hb = mesh.skeleton.bones.findIndex((b) => b.name === 'RightHand');
    if (img?.width && uv && hb >= 0) {
      const W = 256;
      const cv = document.createElement('canvas');
      cv.width = cv.height = W;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, W, W);
      const px = cx.getImageData(0, 0, W, W).data;
      const ch = [[], [], []];
      for (let i = 0; i < uv.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hb) w += sw.getComponent(i, k);
        if (w < 0.9) continue;
        const x = Math.min(W - 1, Math.max(0, Math.floor(uv.getX(i) * W)));
        const y = Math.min(W - 1, Math.max(0, Math.floor((map.flipY ? 1 - uv.getY(i) : uv.getY(i)) * W)));
        const o = (y * W + x) * 4;
        // (piel: rojiza, ni la manga azul ni el puño colorado ni el guante blanco)
        if (px[o] < 70 || px[o] < px[o + 2] + 25 || px[o + 1] > px[o] || px[o + 1] < px[o] * 0.45) continue;
        for (let c = 0; c < 3; c++) ch[c].push(px[o + c]);
      }
      if (ch[0].length >= 8) {
        const med = (a) => a.sort((p, q) => p - q)[a.length >> 1] / 255;
        col.setRGB(med(ch[0]), med(ch[1]), med(ch[2]), THREE.SRGBColorSpace);
      }
    }
  } catch (e) {
    console.warn(e);
  }
  m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, metalness: 0, flatShading: true });
  if (map) FIST9_MAT.set(map, m);
  return m;
}
function pose(G, T, adjust) {
  const a = G.a;
  const M = a.mats;
  // (con un clip puesto —personClip actPerson—, los huesos son los del clip)
  if (G.cc && clipPose(G, T)) {
    if (adjust) {
      updateMW.call(G.root, true);
      if (G.sable) placeSable(G, M);
    }
    return;
  }
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
    a.group.worldToLocal(va);
    M[part].decompose(vc, qa, vs);
    vb.copy(HAND_AT).applyQuaternion(qa);
    M[part].setPosition(va.sub(vb));
  }
  if (G.sable) placeSable(G, M);
}

// El sable en el puño derecho: la hoja sigue al antebrazo, inclinada hacia
// adelante (G.sableK: el brazo colgando la deja apuntando abajo y adelante; el
// brazo estirado, derecho al frente) y el filo hacia abajo.
function placeSable(G, M) {
  const B = G.bones;
  const grip = !!G.fist && G.sable.visible;
  // (la mano abierta, chica adentro del puño; sin el sable, como es)
  if (G.fist) {
    B.RightHand.scale.setScalar(grip ? (FIST9 ? 0.25 : 0.5) : 1);
    G.fist.visible = grip;
  }
  B.RightHand.getWorldPosition(va);
  B.RightForeArm.getWorldPosition(vb);
  sY.subVectors(va, vb).normalize();
  // (adelante y la derecha del cuerpo: de la pieza del pecho)
  M[1].decompose(vc, qa, vs);
  sF.set(0, 0, 1).applyQuaternion(qa);
  sX.set(-1, 0, 0).applyQuaternion(qa);
  // (con el brazo abajo, la hoja también hacia afuera: si no cruzaba por
  // delante de las piernas, de una mano a la otra)
  const down = G.fist ? Math.max(0, -sY.y) : 0;
  sY.addScaledVector(sF, G.sableK).normalize();
  if (down > 0) sY.addScaledVector(sX, 0.5 * down).normalize();
  // el filo: hoja × derecha (con la hoja al frente, para abajo)
  sZ.crossVectors(sY, sX);
  if (sZ.lengthSq() < 1e-6) sZ.set(0, -1, 0);
  sZ.normalize();
  sX.crossVectors(sY, sZ).normalize();
  // (la cruz delante del puño: el puño en la palma)
  va.addScaledVector(sY, GRIP + 0.07);
  sM.makeBasis(sZ, sY, sX).setPosition(va);
  sInv.copy(G.a.group.matrixWorld).invert();
  G.sable.matrix.multiplyMatrices(sInv, sM);
  G.sable.matrixWorldNeedsUpdate = true;
  if (grip) {
    // el puño alrededor de la empuñadura, justo atrás de la cruz
    fM.copy(sM).setPosition(va.addScaledVector(sY, -0.06));
    if (FIST9) fS.identity();
    else fS.makeScale(0.05, 0.06, 0.047);
    G.fist.matrix.multiplyMatrices(sInv, fM).multiply(fS);
    G.fist.matrixWorldNeedsUpdate = true;
  }
}

// Baja las personas y compila sus programas (piel con huesos + skinLook, los
// dos sables) contra la escena, sin dejar nada a la vista. fn() al terminar.
export function prepararPersonas(g, fn) {
  let n = 0;
  const urls = [MODEL.sanMartin, MODEL.granadero];
  const done = () => {
    if (++n < urls.length) return;
    // (las texturas, subidas ya a la placa: la de Cabral también)
    const up = (t) => t && g.renderer?.initTexture?.(t);
    whenTex(MODEL.cabral, up);
    const grp = new THREE.Group();
    for (const url of urls) {
      const T = TPL.get(url);
      if (!T) continue;
      up(T.map);
      const root = cloneSkinned(T.root);
      root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const m = new THREE.MeshStandardMaterial({ map: T.map, roughness: 0.85, metalness: 0 });
        skinLook(m);
        o.material = m;
      });
      grp.add(root);
    }
    grp.add(simpleSable(), sableModel(0));
    warmObject(g, grp);
    fn?.();
  };
  for (const url of urls) {
    whenModel(url, (gltf) => {
      if (!TPL.has(url)) {
        try {
          TPL.set(url, prep(url, gltf));
        } catch (e) {
          console.warn(e);
        }
      }
      done();
    });
  }
}

// ---------------- las poses (de piezas) ----------------
// Todas escriben en P (makePose) lo suyo; t: el reloj de la escena.
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// (todas ponen valores absolutos: Avatars no vuelve a cero cada cuadro las
// claves que no usa, torsoY o headY, y sumar ahí las hacía girar sin parar)
const NEUTRAL = { torsoP: 0, torsoY: 0, torsoR: 0, headP: 0, headY: 0, headR: 0, shLp: 0, shLr: 0.1, shRp: 0, shRr: -0.1, elL: 0, elR: 0 };
const LEGS0 = { hipLp: 0, hipLr: 0, hipRp: 0, hipRr: 0, knL: 0, knR: 0 };
// lleva P hacia T (k: 0..1)
const toward = (P, T, k) => {
  for (const key in T) P[key] = (P[key] ?? 0) + (T[key] - (P[key] ?? 0)) * k;
};
export const POSE = {
  // firme, respirando (los codos apenas doblados: no de maniquí); legs false:
  // las piernas quedan como las puso Avatars (caminando)
  firme(P, t = 0, legs = true) {
    Object.assign(P, NEUTRAL);
    if (legs) Object.assign(P, LEGS0);
    P.torsoP = 0.02 + 0.015 * Math.sin(t * 1.6);
    P.torsoR = 0.02 * Math.sin(t * 0.5);
    P.headP = -0.02;
    P.headY = 0.05 * Math.sin(t * 0.33);
    P.shLp = -0.05;
    P.shLr = 0.08;
    P.elL = -0.22 + 0.03 * Math.sin(t * 0.8);
    P.shRp = -0.04;
    P.shRr = -0.08;
    P.elR = -0.2 + 0.03 * Math.sin(t * 0.7 + 1);
  },
  // el brazo del sable al frente, el sable abajo y adelante (en guardia, a pie)
  guardia(P, t = 0) {
    P.shLp = -0.45;
    P.shLr = 0.05;
    P.elL = -0.75 + 0.04 * Math.sin(t * 1.3);
  },
  // señala con el sable: el brazo derecho estirado al frente y arriba
  senala(P, t = 0, k = 1) {
    toward(P, { shLp: -1.95, shLr: -0.08, elL: -0.08, torsoY: 0.12, headP: -0.12, headY: -0.08, torsoP: 0.02 * Math.sin(t * 2) }, k);
  },
  // sentado a caballo: los muslos adelante y abiertos sobre la panza, las
  // rodillas dobladas, las manos con las riendas sobre la cruz
  montado(P, t = 0, bob = 0) {
    Object.assign(P, NEUTRAL);
    P.hipLp = -1.28;
    P.hipRp = -1.28;
    P.hipLr = -0.36;
    P.hipRr = 0.36;
    P.knL = 1.42;
    P.knR = 1.42;
    P.torsoP = 0.06 + bob * 0.04;
    P.headP = -0.06 - bob * 0.04;
    P.headY = 0.06 * Math.sin(t * 0.4);
    P.shLp = -0.62;
    P.shLr = 0.22;
    P.elL = -0.95;
    P.shRp = -0.62;
    P.shRr = -0.22;
    P.elR = -0.95;
  },
  // a la carga: el sable bien alto al frente, el cuerpo echado adelante
  carga(P, t = 0, k = 1) {
    toward(P, { shLp: -2.55, shLr: -0.12, elL: -0.35 + 0.08 * Math.sin(t * 9), torsoP: 0.55, headP: -0.42 }, k);
  },
  // tirado en el piso boca arriba (la raíz la pone quien llama: rootPitch -1.5)
  tendido(P, t = 0, o = {}) {
    Object.assign(P, NEUTRAL);
    P.hipY = 0.93;
    P.torsoR = 0.06;
    P.headP = -0.15 + 0.03 * Math.sin(t * 1.1);
    P.headY = 0.35;
    P.shLp = -0.35;
    P.shLr = -0.9;
    P.elL = -0.3;
    P.shRp = 0.1;
    P.shRr = 0.7;
    P.elR = -0.6;
    P.hipLp = o.atrapado ? -0.15 : -0.5;
    P.hipLr = -0.1;
    P.knL = o.atrapado ? 0.15 : 1.1;
    P.hipRp = -0.05;
    P.hipRr = 0.12;
    P.knR = 0.2;
  },
};

// ---------------- montar ----------------
// El jinete (un muñeco de Avatars ya vestido) sobre un caballo de skins/caballo.js.
//   const m = new Montura(a, caballo);  m.brazos = 'riendas' | 'sable' | 'carga' | 'senala'
//   m.update(dt)            (después del caballo, antes de people.update)
//   m.caer({ lado, atrapado })  se cae: con el caballo (lo pide el caballo al
//                           caer: atrapado = la pierna queda abajo) o solo
//                           (lo bajan de un tiro y el caballo sigue).
// LIFT: lo que queda la cadera arriba del asiento.
const LIFT = 0.1;
const mq = new THREE.Quaternion();
const me = new THREE.Euler();
const mv = new THREE.Vector3();
const mw = new THREE.Vector3();
export class Montura {
  // life: parado, mira alrededor (o a lookAt) y se acomoda; gestos: además
  // señala y alza el sable cada tanto (San Martín esperando)
  constructor(a, h, { brazos = 'riendas', life = false, gestos = false } = {}) {
    this.a = a;
    this.r = a.r;
    this.h = h;
    this.brazos = brazos;
    this.life = life;
    this.gestos = gestos;
    this.seed = Math.random() * 60;
    this.lookAt = null;
    this.lookRel = null;
    this.gest = null;
    this.k = { sable: 0, carga: 0, senala: 0, alza: 0 };
    this.t = 0;
    this.fall = null;
    this.root = { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0 };
    this.r.moving = false;
    this.r.speed = 0;
    this.r.poseFn = (P) => this.pose(P);
  }

  // dónde va la raíz del muñeco para que la cadera quede en el asiento
  seat(out) {
    const h = this.h;
    h.seatAt(mv);
    me.set(h.pitch, h.yaw, h.roll, 'YXZ');
    mq.setFromEuler(me);
    // raíz = asiento + R·(0, LIFT - hipY, 0)
    mw.set(0, LIFT - 0.93, 0).applyQuaternion(mq).add(mv);
    out.x = mw.x;
    out.y = mw.y;
    out.z = mw.z;
    out.pitch = h.pitch;
    out.roll = h.roll;
    out.yaw = h.yaw;
    return out;
  }

  caer({ lado = 1, atrapado = false, delay = 0 } = {}) {
    if (this.fall) return;
    this.fall = { t: -delay, lado, atrapado, from: null, to: null, D: atrapado ? 1.1 : 0.95 };
  }

  update(dt) {
    this.t += dt;
    const R = this.root;
    const F = this.fall;
    for (const k of Object.keys(this.k)) {
      const want = this.brazos === k ? 1 : 0;
      this.k[k] += (want - this.k[k]) * Math.min(1, dt * 5);
    }
    if (!F || F.t < 0) {
      if (F) F.t += dt;
      this.seat(R);
    } else {
      if (!F.from) {
        // de dónde sale (el asiento) y adónde cae: al costado del caballo, del
        // lado `lado` (+1: su derecha), boca arriba con los pies hacia el caballo
        F.from = { ...this.seat({}) };
        const h = this.h;
        const yaw = h.yaw;
        const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(F.lado);
        const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const s = new THREE.Vector3();
        h.seatAt(s);
        // (atrapado: las piernas quedan debajo de la panza del caballo caído;
        // si no, cae más lejos y atrás, porque el caballo sigue)
        const at = s.clone().addScaledVector(right, F.atrapado ? 0.62 : 1.4).addScaledVector(fwd, F.atrapado ? 0.15 : -1.6);
        F.to = { x: at.x, z: at.z, y: h.groundY ?? h.pos.y, yaw: Math.atan2(-right.x, -right.z) };
      }
      F.t += dt;
      const u = clamp01(F.t / F.D);
      const e = ease(u);
      const A = F.from;
      const B = F.to;
      R.x = A.x + (B.x - A.x) * e;
      R.z = A.z + (B.z - A.z) * e;
      // (la cadera va del asiento al piso con un arco; la raíz, de la cadera para abajo)
      const hipA = A.y + 0.93;
      const hipB = B.y + 0.14;
      // (atrapado se va abajo con el caballo; si no, sale despedido y cae)
      const hip = hipA + (hipB - hipA) * (F.atrapado ? e : u * u) + Math.sin(Math.PI * u) * (F.atrapado ? 0.06 : 0.35);
      let dy = R.yaw - B.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      R.yaw = u === 0 ? A.yaw : R.yaw - dy * Math.min(1, dt * 7);
      R.pitch = A.pitch + (-1.5 - A.pitch) * e;
      R.roll = A.roll * (1 - e) + 0.1 * F.lado * Math.sin(Math.PI * u);
      // (acostado, la cadera queda a hipY de la raíz por el cuerpo: la raíz va a
      // la altura de la cadera menos lo que da el seno del giro)
      R.y = hip - 0.93 * Math.cos(R.pitch);
      R.hipY = hip;
    }
    const r = this.r;
    r.pos.set(R.x, R.y, R.z);
    r.yaw = R.yaw - Math.PI;
    // (adónde mira: el cuerpo del jinete va para donde va el caballo)
    const T = this.life && this.lookAt ? (typeof this.lookAt === 'function' ? this.lookAt() : this.lookAt) : null;
    if (T) {
      let rel = Math.atan2(T.x - R.x, T.z - R.z) - this.h.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      this.lookRel = this.lookRel == null ? rel : this.lookRel + (rel - this.lookRel) * Math.min(1, dt * 2);
    } else this.lookRel = null;
  }

  // (sesión 1f, el usuario: "San Martín y Belgrano, animaciones viejas y
  // rígidas", "los granaderos congelados en la cinemática": parado, cada uno
  // mira a su alrededor —o adonde le digan— y se acomoda en la montura; con
  // gestos, señala y alza el sable. __mduOldMontLife: como antes)
  lifePose(P, t) {
    const s = this.seed;
    const still = 1 - clamp01(((this.h.speed || 0) - 0.5) / 3);
    const w = still * (1 - Math.max(this.k.carga, this.k.senala, this.k.alza));
    if (w < 0.01) return;
    const own = 0.16 * Math.sin((t + s) * 0.37);
    const look = this.lookRel != null ? Math.max(-1.2, Math.min(1.2, this.lookRel)) + own : 0.45 * Math.sin((t + s) * 0.21) + 0.22 * Math.sin((t + s) * 0.57 + 1.3);
    P.headY += Math.max(-0.8, Math.min(0.8, look * 0.65)) * w;
    P.torsoY = (P.torsoY || 0) + Math.max(-0.32, Math.min(0.32, look * 0.28)) * w;
    P.headP += (0.05 * Math.sin((t + s) * 0.33) - 0.03) * w;
    P.torsoR += 0.035 * Math.sin((t + s) * 0.29) * w;
    P.torsoP += 0.03 * Math.sin((t + s) * 0.47 + 2) * w;
    // la mano de las riendas se acomoda cada tanto
    P.elR += 0.16 * Math.max(0, Math.sin((t + s) * 0.4)) ** 4 * w;
    P.shRp -= 0.08 * Math.max(0, Math.sin((t + s) * 0.4)) ** 4 * w;
    const G = this.gest;
    if (G) {
      const u = (t - G.t0) / G.dur;
      if (u >= 1) this.gest = null;
      else {
        const k = ease(clamp01(u / 0.2)) * (1 - ease(clamp01((u - 0.75) / 0.25))) * w;
        if (G.kind === 'senala') POSE.senala(P, t, k);
        else toward(P, { shLp: -2.7 + 0.1 * Math.sin(t * 7), shLr: -0.15, elL: -0.2, torsoP: -0.04, headP: -0.25 }, k);
      }
    } else if (this.gestos && still > 0.9 && this.brazos === 'sable') {
      this.nextG ??= t + 3 + (s % 4);
      if (t >= this.nextG) {
        const kind = Math.random() < 0.55 ? 'senala' : 'alza';
        this.gest = { kind, t0: t, dur: kind === 'alza' ? 2.6 : 2.2 };
        this.nextG = t + this.gest.dur + 5 + Math.random() * 6;
      }
    }
  }

  pose(P) {
    const R = this.root;
    const F = this.fall;
    const t = this.t;
    P.rootY = R.y;
    P.rootPitch = R.pitch;
    P.rootRoll = R.roll;
    P.rootFwd = 0;
    P.hipY = 0.93;
    if (!F || F.t <= 0) {
      POSE.montado(P, t, this.h.bob || 0);
      // (el cuerpo compensa un poco el cabeceo del caballo)
      P.torsoP -= this.h.pitch * 0.5;
      // (2026-10-09, el usuario: "el coronel agarra mal el sable": a caballo,
      // con el sable en la mano, el brazo iba al frente casi derecho y la hoja,
      // al frente y abajo, se metía en el cuello del caballo. Ahora el codo
      // doblado, el puño delante del pecho y la hoja en alto, apenas hacia
      // adelante. __mduOldMontSable: como antes)
      const S9 = globalThis.__mduOldMontSable !== true;
      if (this.k.sable > 0.01) {
        P.shLp += ((S9 ? -0.5 : -0.95) - P.shLp) * this.k.sable;
        P.elL += ((S9 ? -1.7 : -0.55) - P.elL) * this.k.sable;
      }
      const G = this.a.gs;
      if (S9 && G?.sable) {
        // (la hoja derecha para arriba mientras lo lleva; al señalar o alzarlo, como siempre)
        const k = this.k.sable > 0.01 && !this.gest ? this.k.sable : 0;
        if (k > 0) {
          G.sableK = 0.9 - 1.4 * k;
          this.sk9 = true;
        } else if (this.sk9) {
          G.sableK = 0.9;
          this.sk9 = false;
        }
      }
      if (this.life && globalThis.__mduOldMontLife !== true) this.lifePose(P, t);
      if (this.k.senala > 0.01) POSE.senala(P, t, this.k.senala);
      // (brazos 'alza', 2026-10-09: el sable en alto hacia afuera, al costado
      // de la cabeza —señalando al frente, de frente, el brazo le tapaba la
      // cara: "Serás lo que debas ser", ui/EclipseEnding paso 5)
      if (this.k.alza > 0.01) toward(P, { shLp: -2.35, shLr: -0.62, elL: -0.18, headP: -0.08, torsoY: 0.06 }, this.k.alza);
      if (this.k.carga > 0.01) POSE.carga(P, t, this.k.carga);
      return;
    }
    const u = clamp01(F.t / F.D);
    // cayendo: suelta las riendas, los brazos se abren, las piernas se estiran
    POSE.montado(P, t, 0);
    const T = {};
    POSE.tendido(T, t, { atrapado: F.atrapado });
    const k = ease(clamp01((u - 0.15) / 0.85));
    for (const key of Object.keys(T)) P[key] = (P[key] ?? 0) + (T[key] - (P[key] ?? 0)) * k;
    if (u < 1) {
      // (los brazos se abren para atajarse, no para arriba)
      toward(P, { shLp: -0.25, shRp: -0.15, shLr: -1.15, shRr: 1.05, elL: -0.25, elR: -0.3 }, Math.sin(Math.PI * u));
    }
  }
}
