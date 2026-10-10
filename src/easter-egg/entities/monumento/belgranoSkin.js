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
// el cuello (del modelo, en metros): el eje, el radio adentro del cuello del
// uniforme y hasta qué altura queda tapado
const NECK_Z = -0.012;
const NECK_R = 0.052;
const NECK_Y = 1.47;
// puntos de adentro de un triángulo (para mirar de qué color lo pinta la textura)
const BARY = [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.45, 0.1, 0.45], [0.1, 0.45, 0.45]];
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
  // (los vértices de los triángulos achatados o pasados al cuello: el paso de abajo no los toca)
  const dead = new Set();
  const neckB = names.indexOf('neck');
  // (los triángulos puente que quedan: skinNeck los pinta de piel)
  const neckTris = (mesh.userData.neckTris = []);
  for (let t = 0; t < n; t++) {
    const v = [vi(t, 0), vi(t, 1), vi(t, 2)];
    a.fromBufferAttribute(pos, v[0]);
    b.fromBufferAttribute(pos, v[1]);
    c.fromBufferAttribute(pos, v[2]);
    const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const area = 0.5 * e1.subVectors(b, a).cross(e2.subVectors(c, a)).length();
    // un triángulo largo que va derecho de un vértice de la cabeza a uno del
    // hombro (la patilla izquierda al hombro, ~16 cm: la "línea")
    const bridge = Math.max(...v.map((i) => wOf(i, HEAD))) >= 0.6 && Math.max(...v.map((i) => wOf(i, SHOULDER))) >= 0.6;
    // (2026-10-08, el usuario: "Belgrano tiene una deformidad en su mejilla":
    // del cuello del uniforme (hombro) salían triángulos derecho a la cara
    // (cabeza), no solo los largos y finitos: al girar la cabeza tiraban picos
    // blancos y colorados hasta la mejilla. Los finitos se achatan, como
    // siempre; los demás puentes del cuello para arriba no se pueden sacar
    // —quedaba el agujero al lado de la oreja—: su punta del hombro pasa al
    // hueso del cuello (va a medias con la cabeza) y skinNeck los pinta de piel.
    // globalThis.__mduOldBelCara: solo los finitos)
    const CARA = globalThis.__mduOldBelCara !== true;
    if (!bridge) continue;
    // (los finitos, antes achatados —dejaban una raja delante de la oreja al
    // girar la cabeza—, van por el mismo camino, salvo sin índice o con el
    // switch viejo)
    const thin = !(L < 0.09 || area > L * 0.012) && !(CARA && !idx && neckB >= 0 && Math.max(a.y, b.y, c.y) >= 1.3);
    if (!thin) {
      if (CARA && !idx && neckB >= 0 && Math.max(a.y, b.y, c.y) >= 1.3) {
        for (const i of v) {
          if (wOf(i, SHOULDER) < 0.6) continue;
          for (let q = 0; q < 4; q++) {
            si.setComponent(i, q, q ? 0 : neckB);
            sw.setComponent(i, q, q ? 0 : 1);
          }
          // (y la punta, del hombro al cuello —adentro del cuello del uniforme—:
          // afuera quedaba como un pico de piel bajando de la oreja)
          const px = pos.getX(i);
          const pz = pos.getZ(i) - NECK_Z;
          const pr = Math.hypot(px, pz);
          if (pr > NECK_R) pos.setXYZ(i, (px / pr) * NECK_R, Math.min(pos.getY(i), NECK_Y), NECK_Z + (pz / pr) * NECK_R);
        }
        neckTris.push(t);
        dropped++;
      }
      continue;
    }
    if (idx) {
      idx.setX(t * 3 + 1, v[0]);
      idx.setX(t * 3 + 2, v[0]);
    } else {
      for (const k of [1, 2]) {
        pos.setXYZ(v[k], a.x, a.y, a.z);
        // (sin índice cada triángulo tiene sus vértices: con otros pesos, al
        // posar se volvían a separar y el triángulo volvía, estirado)
        if (CARA) {
          for (let q = 0; q < 4; q++) {
            si.setComponent(v[k], q, si.getComponent(v[0], q));
            sw.setComponent(v[k], q, sw.getComponent(v[0], q));
          }
        }
      }
      if (CARA) dead.add(v[0]).add(v[1]).add(v[2]);
    }
    dropped++;
  }
  if (dropped) {
    if (idx) idx.needsUpdate = true;
    else {
      pos.needsUpdate = true;
      si.needsUpdate = true;
      sw.needsUpdate = true;
    }
  }
  // y la patilla: los vértices de la cabeza (arriba del cuello) con algo de peso
  // al hombro se estiraban hacia abajo al mover el hombro: todo a la cabeza
  const head = names.indexOf('Head');
  let moved = 0;
  if (head >= 0) {
    for (let i = 0; i < pos.count; i++) {
      // (la mejilla: desde el cuello, no desde 1,48)
      if (dead.has(i) || pos.getY(i) < (globalThis.__mduOldBelCara !== true ? 1.3 : 1.48) || wOf(i, HEAD) < 0.5) continue;
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

// (2026-10-08, el usuario: "Belgrano tiene una deformidad en su mejilla". La
// textura de Meshy pinta el cuello colorado de la casaca y la camisa blanca
// sobre triángulos de la mandíbula que van con la cabeza: quieto queda tapado
// por el cuello del uniforme, pero al girar la cabeza esa pintura sale pegada
// a la mejilla. Esos triángulos toman el color de la piel del cuello.
// globalThis.__mduOldBelCara: como antes)
function skinNeck(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const map = mesh.material?.map;
  const img = map?.image;
  if (!uv || !img?.width || geo.index) return 0;
  const head = mesh.skeleton.bones.findIndex((b) => b.name === 'Head');
  if (head < 0) return 0;
  // (la textura chica alcanza para saber de qué color es cada triángulo)
  const W = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, W);
  const px = cx.getImageData(0, 0, W, W).data;
  const at = (u, v) => {
    const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
    const y = Math.min(W - 1, Math.max(0, Math.floor((map.flipY ? 1 - v : v) * W)));
    const o = (y * W + x) * 4;
    return [px[o], px[o + 1], px[o + 2]];
  };
  const hw = (i) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === head) w += sw.getComponent(i, k);
    return w;
  };
  const skin = ([r, g, b]) => r > 200 && g > 160 && g < 220 && b > 130 && b < 200 && r > b + 40;
  // colorado (el cuello de la casaca), blanco o celeste pálido (la camisa) y
  // azul oscuro (el paño)
  const wrong = ([r, g, b]) => (r > 130 && g < 90 && b < 90) || (Math.min(r, g, b) > 110 && b >= r - 12) || (b > r + 8 && Math.max(r, g, b) < 120);
  const n = pos.count / 3;
  const tri = (t) => [t * 3, t * 3 + 1, t * 3 + 2];
  const cen = (v, f) => (f(v[0]) + f(v[1]) + f(v[2])) / 3;
  // el color de la piel del cuello: el primer triángulo de piel de la cabeza bajo la mandíbula
  let su = -1;
  let sv = -1;
  for (let t = 0; t < n && su < 0; t++) {
    const v = tri(t);
    if (Math.min(...v.map(hw)) < 0.8 || cen(v, (i) => pos.getY(i)) > 1.56) continue;
    const u = cen(v, (i) => uv.getX(i));
    const w = cen(v, (i) => uv.getY(i));
    if (skin(at(u, w))) {
      su = u;
      sv = w;
    }
  }
  if (su < 0) return 0;
  let fixed = 0;
  const bridges = new Set(mesh.userData.neckTris || []);
  const painted = [];
  for (let t = 0; t < n; t++) {
    const v = tri(t);
    if (bridges.has(t)) {
      for (const i of v) uv.setXY(i, su, sv);
      fixed++;
      continue;
    }
    if (Math.min(...v.map(hw)) < 0.45) continue;
    const y = cen(v, (i) => pos.getY(i));
    const z = cen(v, (i) => pos.getZ(i));
    // por el costado sube hasta la sien (la tira delante de la oreja); de la
    // cara para adelante, de la boca para arriba, no se toca (los ojos)
    if (y > 1.7 || (y > 1.56 && z > 0.085)) continue;
    // (el centro del triángulo, dos de sus puntas o dos de seis puntos de
    // adentro: los que pisan a medias una mancha celeste de la textura eran la
    // raya clara delante de la oreja)
    let bad = (wrong(at(cen(v, (i) => uv.getX(i)), cen(v, (i) => uv.getY(i)))) ? 2 : 0) + v.filter((i) => wrong(at(uv.getX(i), uv.getY(i)))).length;
    if (bad < 2) {
      let inside = 0;
      for (const [wa, wb, wc] of BARY) {
        if (wrong(at(uv.getX(v[0]) * wa + uv.getX(v[1]) * wb + uv.getX(v[2]) * wc, uv.getY(v[0]) * wa + uv.getY(v[1]) * wb + uv.getY(v[2]) * wc))) inside++;
      }
      if (inside >= 2) bad = 2;
    }
    if (bad < 2) continue;
    for (const i of v) uv.setXY(i, su, sv);
    painted.push(t);
    fixed++;
  }
  if (fixed) uv.needsUpdate = true;
  flattenTips(geo, painted, hw);
  return fixed;
}

// La punta del cuello alto del uniforme, ya pintada de piel, seguía parada
// afuera de la mejilla (un pico que bajaba de la oreja). Las puntas que solo
// tocan triángulos repintados se llevan al medio de sus vecinas —las que
// comparten con la cara quedan donde están—: el pico se acuesta sobre la cara.
function flattenTips(geo, painted, hw) {
  if (!painted.length) return;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const key = (i) => `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
  const isP = new Set(painted);
  // cada punto (soldado por posición): sus copias y si lo usa algún triángulo de los otros
  const pts = new Map();
  const byId = new Array(pos.count);
  const n = pos.count / 3;
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      const kk = key(i);
      let P = pts.get(kk);
      if (!P) pts.set(kk, (P = { ids: [], fixed: false, nb: new Set(), p: new THREE.Vector3().fromBufferAttribute(pos, i) }));
      P.ids.push(i);
      byId[i] = P;
      if (!isP.has(t)) P.fixed = true;
    }
  }
  const free = [];
  for (const t of painted) {
    const K = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (const a of K) {
      const P = pts.get(a);
      for (const b of K) if (b !== a) P.nb.add(pts.get(b));
      if (!P.fixed && !free.includes(P)) free.push(P);
    }
  }
  if (!free.length) return;
  const acc = new THREE.Vector3();
  for (let it = 0; it < 14; it++) {
    for (const P of free) {
      acc.set(0, 0, 0);
      for (const Q of P.nb) acc.add(Q.p);
      P.p.lerp(acc.multiplyScalar(1 / P.nb.size), 0.7);
    }
  }
  for (const P of free) for (const i of P.ids) pos.setXYZ(i, P.p.x, P.p.y, P.p.z);
  // y lo que todavía sale de costado más que la mandíbula a esa altura (la
  // punta que comparte con el cuello del uniforme): adentro, las copias que van
  // con la cabeza
  const jaw = (y) => Math.min(0.1, Math.max(0.058, 0.063 + ((y - 1.5) / 0.12) * 0.035));
  const seen = new Set();
  for (const t of painted) {
    for (let k = 0; k < 3; k++) {
      const P = byId[t * 3 + k];
      if (!P || seen.has(P)) continue;
      seen.add(P);
      if (P.p.y > 1.63 || P.p.z < -0.03) continue;
      const lim = jaw(P.p.y);
      if (Math.abs(P.p.x) <= lim) continue;
      P.p.x = Math.sign(P.p.x) * lim;
      for (const i of P.ids) if (hw(i) >= 0.45) pos.setXYZ(i, P.p.x, P.p.y, P.p.z);
    }
  }
  pos.needsUpdate = true;
  // las normales de los repintados, de su cara
  if (nor) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const t of painted) {
      a.fromBufferAttribute(pos, t * 3);
      b.fromBufferAttribute(pos, t * 3 + 1);
      c.fromBufferAttribute(pos, t * 3 + 2);
      b.sub(a);
      c.sub(a);
      b.cross(c);
      if (b.lengthSq() < 1e-14) continue;
      b.normalize();
      for (let k = 0; k < 3; k++) nor.setXYZ(t * 3 + k, b.x, b.y, b.z);
    }
    nor.needsUpdate = true;
  }
  globalThis.__belTips = free.length;
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
  if (globalThis.__mduOldBelCara !== true) {
    try {
      globalThis.__belNeck = skinNeck(mesh);
    } catch {
      /* sin la textura a mano: como antes */
    }
  }
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
