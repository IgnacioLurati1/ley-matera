import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { makePose, solvePose } from '../entities/skeleton';
import { skinLook, cullList, cullAt } from '../entities/bossSkin';

// El gaucho de verdad (low poly facetado, Meshy) en lugar del muñeco de piezas
// de net/Avatars: los compañeros de la red y los gauchos de todas las
// cinemáticas. No tiene animaciones propias: cada hueso sigue a la pieza del
// esqueleto de siempre (entities/skeleton.js solvePose), así que caminar,
// correr, agacharse, caído, nadar, apuntar y cada pose de cinemática (los
// poseFn) salen igual que antes.
//
// Un solo modelo para todos (public/assets/sotano/modelos/gaucho/modelo.glb):
// cada uno con su copia del esqueleto y su material. El poncho viene marcado
// en la malla (atributo poncho) y toma el color del poncho de cada jugador
// (a.M.poncho.color: restyle, los caballeros, el estero...) con su guarda.
//
// Mientras baja el archivo (o si no está) queda el muñeco de piezas.
// window.__gauchoSkinOff = true: el de piezas (para comparar).

const URL = '/assets/sotano/modelos/gaucho/modelo.glb';
// hueso → pieza (y si va entre dos, la otra y cuánto). El lado "L" del
// esqueleto del juego (x < 0) es el Right del modelo.
const MAP = [
  ['Hips', 0], ['Spine02', 0, 1, 0.75], ['Spine01', 0, 1, 0.92], ['Spine', 1], ['LeftShoulder', 1], ['RightShoulder', 1], ['neck', 1, 2, 0.5], ['Head', 2],
  ['RightArm', 3], ['RightForeArm', 5], ['RightHand', 5], ['LeftArm', 4], ['LeftForeArm', 6], ['LeftHand', 6],
  ['RightUpLeg', 7], ['RightLeg', 9], ['RightFoot', 11], ['LeftUpLeg', 8], ['LeftLeg', 10], ['LeftFoot', 12],
];
// la mano de cada pieza de antebrazo (5: Right del modelo, 6: Left)
const HANDS = [[5, 'RightForeArm', 'RightHand'], [6, 'LeftForeArm', 'LeftHand']];
// lo que agarra la mano: de la muñeca hacia los dedos (m)
const GRIP = 0.075;
// el mate y las armas van en (0, -0.19, 0) del antebrazo de piezas
const HAND_AT = new THREE.Vector3(0, -0.19, 0);
// de la cadera de piezas a la articulación de los muslos
const RIG_THIGH = 0.03;
// el color del poncho: los de Avatars vienen ×1,7 (la arpillera oscurecía)
const TINT_K = 1 / 1.7;
// el escudo colgado en la espalda: afuera del poncho
const SHIELD_BACK = new THREE.Matrix4().makeTranslation(0, 0.02, -0.13);

let T = null;
let state = 0;
const waiting = new Set();

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vs = new THREE.Vector3();
const pp = [];
const pq = [];
for (let i = 0; i < 13; i++) {
  pp.push(new THREE.Vector3());
  pq.push(new THREE.Quaternion());
}
const updateMW = THREE.Object3D.prototype.updateMatrixWorld;
const vCull = new THREE.Vector3();

function prep(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  const bones = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  if (!mesh || !bones.Hips) throw new Error('gaucho: sin malla o sin huesos');
  const geo = mesh.geometry;
  // (el nombre con guion bajo es el del GLB; en el shader, sin)
  const pa = geo.getAttribute('_poncho');
  if (pa) geo.setAttribute('poncho', pa);
  const map = mesh.material.map;
  // el gris medio del poncho en la textura (para teñirlo sin perder la guarda)
  let lumRef = 0.12;
  try {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(map.image, 0, 0, S, S);
    const D = cx.getImageData(0, 0, S, S).data;
    const uv = geo.getAttribute('uv');
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    let acc = 0;
    let n = 0;
    for (let i = 0; i < uv.count; i++) {
      if (!pa || pa.getX(i) < 0.5) continue;
      const x = Math.min(S - 1, Math.max(0, Math.floor(uv.getX(i) * S)));
      const y = Math.min(S - 1, Math.max(0, Math.floor(uv.getY(i) * S)));
      const k = (y * S + x) * 4;
      acc += 0.2126 * lin(D[k] / 255) + 0.7152 * lin(D[k + 1] / 255) + 0.0722 * lin(D[k + 2] / 255);
      n++;
    }
    if (n) lumRef = acc / n;
  } catch {
    // (sin leer la imagen: el valor de siempre)
  }
  // el reposo: el giro de cada hueso en el mundo y el de su pieza
  const restMats = Array.from({ length: 18 }, () => new THREE.Matrix4());
  solvePose(restMats, 0, 0, 0, 1, makePose());
  const partRest = restMats.slice(0, 13).map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
  const list = MAP.map(([name, p0, p1, k]) => ({ name, p0, p1, k, rest: bones[name].getWorldQuaternion(new THREE.Quaternion()) }));
  // de padres a hijos (todos los que se mueven cuelgan de otro de la lista, menos la cadera)
  const depth = (b) => (b.parent?.isBone ? 1 + depth(b.parent) : 0);
  list.sort((a, b) => depth(bones[a.name]) - depth(bones[b.name]));
  for (const d of list) d.pi = list.findIndex((o) => o.name === bones[d.name].parent?.name);
  const hipsW = bones.Hips.getWorldPosition(new THREE.Vector3());
  const thighMid = bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()).add(bones.RightUpLeg.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  // (el armazón de los huesos: su giro y su matriz, fijos con el modelo en el origen)
  const arm = bones.Hips.parent;
  T = {
    root,
    mesh,
    map,
    lumRef,
    list,
    partRest,
    mid: thighMid.clone().sub(hipsW),
    // lo que le falta (o le sobra) a la pierna del modelo para la de piezas
    dL: makePose().hipY - RIG_THIGH - thighMid.y,
    armQ: arm.getWorldQuaternion(new THREE.Quaternion()),
    armInv: arm.matrixWorld.clone().invert(),
  };
  (window.__gaucho ||= {}).T = T;
}

// Que baje el modelo (una vez); fn cuando esté.
export function whenGaucho(fn) {
  if (state === 2) {
    fn();
    return;
  }
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

// El material de cada gaucho: la textura compartida, el poncho del color de
// a.M.poncho (lo que la textura tenía de claro y oscuro queda: la guarda) y
// la luz de los personajes (bossSkin skinLook).
function material(a) {
  const m = new THREE.MeshStandardMaterial({ map: T.map, roughness: 0.9, metalness: 0 });
  const tint = { value: a.M.poncho.color };
  const ref = { value: T.lumRef / TINT_K };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPonTint = tint;
    sh.uniforms.uPonRef = ref;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float poncho;\nvarying float vPoncho;\nvoid main() {\n\tvPoncho = poncho;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uPonTint;\nuniform float uPonRef;\nvarying float vPoncho;\nvoid main() {').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
	if (vPoncho > 0.5) {
		float pl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
		diffuseColor.rgb = uPonTint * (pl / uPonRef);
	}`,
    );
  };
  m.customProgramCacheKey = () => 'gaucho';
  skinLook(m);
  return m;
}

// Pone el modelo en un muñeco de Avatars (a: la entrada de Avatars.list;
// blocky: lo que se esconde, las piezas, el sombrero, la cara y el poncho).
// Si el modelo todavía no bajó, cuando baje.
export function gauchoSkin(a, blocky) {
  if (window.__gauchoSkinOff) return;
  whenGaucho(() => {
    // (ya se fue, o alguien le cambió los materiales a las piezas: las ánimas
    // de luz del final del castillo; esas quedan de piezas)
    if (a.gs || !a.group.parent || a.parts[1]?.material !== a.M.poncho) return;
    attach(a, blocky);
  });
}

function attach(a, blocky) {
  const root = cloneSkinned(T.root);
  let mesh = null;
  const bones = {};
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
    if (o.isBone) bones[o.name] = o;
  });
  const mat = material(a);
  mesh.material = mat;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  a.M.gaucho = mat;
  if (a.ghost) {
    mat.transparent = true;
    mat.opacity = 0.42;
    mat.depthWrite = false;
    mat.emissive.set(0x2a70c8);
  }
  // (con el material se va el esqueleto: Avatars.remove tira los materiales)
  mat.addEventListener('dispose', () => mesh.skeleton.dispose());
  const G = {
    a,
    root,
    mesh,
    mat,
    blocky,
    list: T.list.map((d) => ({ ...d, bone: bones[d.name], W: new THREE.Quaternion() })),
    bones,
    // (Float64: con Float32 nunca daba igual y se volvía a poner en cada dibujo)
    snap: new Float64Array(13 * 16),
    off: false,
    pose: (adjust, dt, g) => pose(G, adjust, dt, g),
  };
  // la silueta a través de las paredes (compañeros de la partida)
  if (a.xray) {
    const x = new THREE.SkinnedMesh(mesh.geometry, a.xray);
    x.bind(mesh.skeleton, mesh.bindMatrix);
    x.frustumCulled = false;
    x.renderOrder = 9;
    x.visible = !!a.xOn;
    x.position.copy(mesh.position);
    x.quaternion.copy(mesh.quaternion);
    x.scale.copy(mesh.scale);
    mesh.parent.add(x);
    a.xparts.push(x);
    G.xray = x;
  }
  // el recorte: una esfera alrededor de la cadera (entities/bossSkin
  // cullList, con los huesos en reposo). Antes iba sin recorte y se dibujaba
  // siempre, aunque estuviera atrás o lejos (compañeros, presos, cinemáticas)
  root.updateMatrixWorld(true);
  G.cull = cullList(root);
  // a la hora de dibujar, si alguien puso la pose por su cuenta (las tomas de
  // las cinemáticas que acomodan las piezas a mano), el modelo la sigue
  root.updateMatrixWorld = function (force) {
    if (G.on && visible(a)) {
      if (G.mesh.material !== G.mat) fallback(G);
      else if (changed(G)) pose(G, false);
    }
    updateMW.call(this, force);
    if (G.on) cullAt(G.cull, G.bones.Hips.getWorldPosition(vCull));
  };
  a.group.add(root);
  for (const o of blocky) o.visible = false;
  G.on = true;
  a.gs = G;
  pose(G, false);
}

function visible(a) {
  for (let o = a.group; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Le cambiaron el material al modelo (como a las piezas): vuelve el de piezas.
function fallback(G) {
  G.on = false;
  G.root.visible = false;
  for (const o of G.blocky) o.visible = true;
}

function changed(G) {
  const S = G.snap;
  const M = G.a.mats;
  for (let i = 0; i < 13; i++) {
    const e = M[i].elements;
    for (let k = 0; k < 16; k++) if (S[i * 16 + k] !== e[k]) return true;
  }
  return false;
}

// Los huesos según las piezas (a.mats, ya resueltas). adjust: además, las
// piezas de los antebrazos se corren a la mano del modelo, así el mate, el
// arma y lo que las cinemáticas ponen en la mano quedan en su mano.
function pose(G, adjust, dt = 0, g = null) {
  if (!G.on) return;
  const a = G.a;
  const M = a.mats;
  // (los compañeros en la partida, sin pose de escena: con los clips de Mixamo)
  if (dt > 0 && !window.__gauchoClipsOff && clipsReady()) {
    play(G, dt, g);
    shieldOut(G);
    snapshot(G);
    return;
  }
  G.layers = null;
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
  // la cadera: el medio de los muslos del modelo donde están los de las
  // piezas, bajado lo que el modelo tiene de pierna de menos (a lo largo del
  // cuerpo: parado, caído o nadando)
  M[0].decompose(va, qb, vs);
  vb.set(0, -RIG_THIGH, 0).applyQuaternion(qb).add(va);
  vb.addScaledVector(vc.set(0, 1, 0).applyQuaternion(qb), -T.dL);
  vb.sub(vc.copy(T.mid).applyQuaternion(qb));
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  shieldOut(G);
  if (adjust) {
    updateMW.call(G.root, true);
    for (const [part, fore, hand] of HANDS) {
      G.bones[hand].getWorldPosition(va);
      G.bones[fore].getWorldPosition(vb);
      // (lo que agarra: un poco más allá de la muñeca)
      va.addScaledVector(vb.subVectors(va, vb).normalize(), GRIP);
      M[part].decompose(vc, qa, vs);
      vb.copy(HAND_AT).applyQuaternion(qa);
      M[part].setPosition(va.sub(vb));
    }
  }
  snapshot(G);
}

function snapshot(G) {
  const S = G.snap;
  const M = G.a.mats;
  for (let i = 0; i < 13; i++) S.set(M[i].elements, i * 16);
}

// el escudo en la espalda (Avatars.backShield) quedaba adentro del poncho: más atrás
function shieldOut(G) {
  const a = G.a;
  if (a.shield && a.shieldKey?.[1] === '0') {
    const e = a.extras.find((x) => x.obj === a.shield);
    if (e && !e.gaucho) {
      e.off.premultiply(SHIELD_BACK);
      e.gaucho = true;
    }
  }
}

// ---------------- los clips (los compañeros durante la partida) ----------------
// Con clips.json (Mixamo, pasados al modelo: Desktop\Conceptos low poly\gaucho\
// codigo\mixrung.mjs + gclips.py) el gaucho de un compañero se mueve según lo
// que llega por la red: quieto (con arma larga o con el mate), caminando,
// corriendo y de costado o para atrás (mezclados según hacia dónde va), sprint,
// agachado, saltando, caído (tirado o arrastrándose), nadando, el alma de
// gaucho life flotando, y encima lo que hace (Session 'act': tomar, cuchillazo,
// tirar, recargar, levantar a otro) y hacia dónde mira (arriba o abajo).
// Después las piezas (a.mats) se rearman desde los huesos: el mate, el arma, el
// escudo y la silueta siguen al cuerpo. Sin el archivo, la pose de piezas.
// window.__gauchoClipsOff = true: la pose de piezas (para comparar).
const CLIPS_URL = '/assets/sotano/modelos/gaucho/clips.json';
const FADE_C = 0.2;
// lo más rápido y lo más lento que se pasa un clip (para que los pies no patinen tanto)
// (2.2: con Stamin-Up se camina a 5.4 m/s y se corre a 8)
const RATE_MAX = 2.2;
const RATE_MIN = 0.55;
// La velocidad de cada clip (clips.json, la del Mixamo) contra lo que da el
// paso en las piernas del gaucho: medido con el pie apoyado quieto (1c,
// 2026-10-01; antes el sprint patinaba un 46%, la corrida un 27%).
const STRIDE = { walk: 0.94, run: 0.85, sprint: 0.55 };
// las piezas, desde qué hueso (el lado "L" del juego, x < 0, es el Right del modelo)
const PART_BONE = ['Hips', 'Spine', 'Head', 'RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm', 'RightUpLeg', 'LeftUpLeg', 'RightLeg', 'LeftLeg', 'RightFoot', 'LeftFoot'];
// con los clips el arma va en la mano derecha de verdad (los de Mixamo agarran
// con esa): la pieza 6 (la del mate y el arma) sale del antebrazo derecho
const SWAP = [0, 1, 2, 4, 3, 6, 5, 7, 8, 9, 10, 11, 12];
const HANDS_CLIP = [
  [5, 'LeftForeArm', 'LeftHand'],
  [6, 'RightForeArm', 'RightHand'],
];
// las armas de dos manos (con las de una, el mate o la pistola: quieto sin arma larga)
const TWO_HAND = new Set(['madera', 'plastico', 'vidrio', 'lata', 'algarrobo', 'imperial', 'camionero', 'torpedo', 'asta', 'mate47', 'campanario', 'bombillon', 'tronador', 'diablo', 'liquidificador', 'wunder', 'terere', 'rayo', 'silicona', 'cocido', 'bombillazo', 'dragon', 'supremo']);
// lo que hace (Session.act): clip y cuánto dura en el juego (s; d: lo manda el que lo hace)
const ACTS = { drink: ['drink', 2.3], stab: ['stab', 0.8], throw: ['throw', 1.0], reload: ['reload', 2] };
// la parte de arriba (para lo que hace) y cuánto sigue a la mirada (arriba o abajo)
const UPPER = { Spine02: 0.3, Spine01: 0.65, Spine: 1, neck: 1, Head: 1, LeftShoulder: 1, LeftArm: 1, LeftForeArm: 1, LeftHand: 1, RightShoulder: 1, RightArm: 1, RightForeArm: 1, RightHand: 1 };
const AIM = { Spine02: 0.12, Spine01: 0.25, Spine: 0.4, neck: 0.6, Head: 0.85 };
const ARMS = new Set(['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']);
// los brazos de cada lado, de padre a hijo (holdArms: el de la mano del arma es el Right del modelo)
const ARM_R = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const ARM_L = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];
// con el mate de una mano, cuánto bracea la izquierda (la del sprint) según lo rápido que va
const SWING_MIN = 0.35;
const SWING_FULL = 5;
// nadando: el cuerpo a la altura del agua (desde los pies del jugador)
const SWIM_Y = { tread: 0.05, swim: 0.85, dive: 0.3 };

let CL = null;
let clState = 0;
const UP_C = new THREE.Vector3(0, 1, 0);
const qY = new THREE.Quaternion();
const qR = new THREE.Quaternion();
const vh = new THREE.Vector3();
const vr = new THREE.Vector3();
const tmpH = new THREE.Vector3();
let tmpW = [];
// (las poses de referencia de holdArms: el agarre, el brazo suelto y el braceo)
let refA = [];
let refB = [];
let refC = [];

function clipsReady() {
  if (clState === 2) return true;
  if (!clState && T) {
    clState = 1;
    fetch(assetUrl(CLIPS_URL))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((J) => {
        prepClips(J);
        clState = 2;
      })
      .catch((e) => {
        console.warn('gaucho: sin clips', e);
        clState = 3;
      });
  }
  return false;
}

function prepClips(J) {
  const clips = {};
  for (const [k, c] of Object.entries(J.clips)) clips[k] = { ...c, fps: c.fps || J.fps, q: Float32Array.from(c.q), hips: Float32Array.from(c.hips) };
  for (const [k, f] of Object.entries(STRIDE)) if (clips[k]) clips[k].speed *= f;
  const names = J.bones;
  const tb = {};
  T.root.traverse((o) => {
    if (o.isBone) tb[o.name] = o;
  });
  T.root.updateMatrixWorld(true);
  const hipsRest = tb.Hips.getWorldPosition(new THREE.Vector3());
  const feetMid = new THREE.Vector3();
  for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) feetMid.add(tb[n].getWorldPosition(new THREE.Vector3()));
  feetMid.multiplyScalar(0.25).setY(0);
  // cada pieza respecto de su hueso, en el reposo de las piezas (como las pone pose())
  const restMats = Array.from({ length: 18 }, () => new THREE.Matrix4());
  solvePose(restMats, 0, 0, 0, 1, makePose());
  const shift = new THREE.Vector3(0, makePose().hipY - RIG_THIGH - T.dL, 0).sub(T.mid).sub(hipsRest);
  const S = new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z);
  const OFF = PART_BONE.map((bn, i) => new THREE.Matrix4().multiplyMatrices(S, tb[bn].matrixWorld).invert().multiply(restMats[i]));
  CL = {
    names,
    nb: names.length,
    clips,
    hipsRest,
    feetMid,
    OFF,
    parent: names.map((n) => names.indexOf(tb[n].parent?.name)),
    upper: names.map((n) => UPPER[n] || 0),
    aim: names.map((n) => AIM[n] || 0),
    arm: names.map((n) => ARMS.has(n)),
    armL: names.map((n) => ARM_L.includes(n)),
    iR: ARM_R.map((n) => names.indexOf(n)),
    iL: ARM_L.map((n) => names.indexOf(n)),
  };
  tmpW = names.map(() => new THREE.Quaternion());
  refA = names.map(() => new THREE.Quaternion());
  refB = names.map(() => new THREE.Quaternion());
  refC = names.map(() => new THREE.Quaternion());
  (window.__gaucho ||= {}).CL = CL;
}

// un cuadro de un clip (el giro de cada hueso en el espacio del modelo y la cadera)
function sample(c, t, loop, W, H) {
  const nb = CL.nb;
  let f = t * c.fps;
  if (loop) f = ((f % c.n) + c.n) % c.n;
  else f = Math.max(0, Math.min(c.n - 1, f));
  let f0 = Math.floor(f);
  const al = f - f0;
  let f1 = f0 + 1;
  if (loop) f1 %= c.n;
  else f1 = Math.min(c.n - 1, f1);
  f0 = Math.min(c.n - 1, f0);
  for (let i = 0; i < nb; i++) {
    qa.fromArray(c.q, (f0 * nb + i) * 4);
    qb.fromArray(c.q, (f1 * nb + i) * 4);
    W[i].copy(qa).slerp(qb, al);
  }
  const h = c.hips;
  H.set(h[f0 * 3] + (h[f1 * 3] - h[f0 * 3]) * al, h[f0 * 3 + 1] + (h[f1 * 3 + 1] - h[f0 * 3 + 1]) * al, h[f0 * 3 + 2] + (h[f1 * 3 + 2] - h[f0 * 3 + 2]) * al);
}

// mezcla un clip en la capa (acc: el peso ya puesto)
function mix(L, c, t, loop, w, acc) {
  if (acc <= 0) {
    sample(c, t, loop, L.W, L.h);
    return;
  }
  sample(c, t, loop, tmpW, tmpH);
  const k = w / (acc + w);
  for (let i = 0; i < CL.nb; i++) L.W[i].slerp(tmpW[i], k);
  L.h.lerp(tmpH, k);
}

const clipRate = (s, c) => Math.max(RATE_MIN, Math.min(RATE_MAX, c.speed > 0.05 ? s / c.speed : 1));

// lo que tiene que hacer ahora (la capa de arriba) según lo que llega del compañero
function want(G) {
  const r = G.a.r;
  const s = G.speed;
  if (r.dead || r.corpse) return 'dead';
  if (r.downed) return s > 0.25 ? 'crawl' : 'lay';
  if (r.ghost) return 'float';
  if ((r.swim || 0) >= 2) return r.swim === 3 ? 'dive' : s > 0.5 ? 'swim' : 'tread';
  if (G.air) return 'jump';
  if (G.kneel > 0 && s < 0.5) return 'kneel';
  if (r.crouch) return s > 0.35 ? 'crouchW' : 'crouch';
  if (s > 0.35) {
    // hacia adelante: caminando, corriendo o el sprint; para atrás, rápido: la corrida al revés
    const sprint = (r.net?.sprint || s > 5.6) && s > 4.6;
    G.gaitF = sprint ? 'sprint' : s > (G.gaitF === 'walk' ? 2.1 : 1.8) ? 'run' : 'walk';
    G.gaitB = s > (G.gaitB === 'back' ? 2.4 : 2.1) ? 'runRev' : 'back';
    return `loco:${G.gaitF}:${G.gaitB}`;
  }
  return G.two ? 'idleR' : 'idle';
}

function play(G, dt, g) {
  const a = G.a;
  const r = a.r;
  const C = CL.clips;
  if (!G.layers) {
    G.layers = [];
    G.cb ||= CL.names.map((n) => G.bones[n]);
    G.cW ||= CL.names.map(() => new THREE.Quaternion());
    G.phase ||= 0;
    G.vx = G.vz = 0;
    G.speed = 0;
    G.lastP = null;
    G.pitch = 0;
    G.kneel = 0;
  }
  // lo rápido y hacia dónde va (de lo que se movió de verdad)
  if (G.lastP && dt > 0) {
    const vx = Math.max(-9, Math.min(9, (r.pos.x - G.lastP.x) / dt));
    const vz = Math.max(-9, Math.min(9, (r.pos.z - G.lastP.z) / dt));
    const k = Math.min(1, dt * 8);
    G.vx += (vx - G.vx) * k;
    G.vz += (vz - G.vz) * k;
  }
  (G.lastP ||= new THREE.Vector3()).copy(r.pos);
  G.speed = Math.hypot(G.vx, G.vz);
  const yaw = (r.yaw || 0) + Math.PI;
  // (en el espacio del muñeco: z adelante, x a su izquierda)
  const fz = G.vx * Math.sin(yaw) + G.vz * Math.cos(yaw);
  const fx = G.vx * Math.cos(yaw) - G.vz * Math.sin(yaw);
  // en el aire (saltando o cayendo): más alto que el piso
  const floor = g?.world?.floorAt ? g.world.floorAt(r.pos.x, r.pos.z, r.pos.y + 0.6) : r.pos.y;
  const over = r.pos.y - (Number.isFinite(floor) ? floor : r.pos.y);
  G.air = !r.downed && !r.ghost && !(r.swim >= 1) && (G.air ? over > 0.12 : over > 0.35);
  const wk = (a.wkey || '').split('|')[0];
  G.two = TWO_HAND.has(wk);
  // lo que hace (Session 'act')
  const act = r.act;
  if (act && act.t !== G.actSeen) {
    G.actSeen = act.t;
    if (act.a === 'revive') G.kneel = Math.min(6, act.d || 3.5);
    // con un mate (tiene boca: Avatars.setGun) no se recarga como un arma: se
    // ceba con el termo (pourArm; el termo lo pone Avatars con G.pourK)
    else if (act.a === 'reload' && a.mouth) G.pour = { t: 0, d: Math.max(0.8, act.d || ACTS.reload[1]) };
    else if (ACTS[act.a] && C[ACTS[act.a][0]]) {
      const c = C[ACTS[act.a][0]];
      G.act = { c, t: 0, rate: c.dur / Math.max(0.3, act.d || ACTS[act.a][1]) };
    }
  }
  if (G.kneel > 0) G.kneel = G.speed > 0.6 ? 0 : G.kneel - dt;
  // las capas: la de arriba entra en FADE_C s y las demás se van
  const key = want(G);
  let top = G.layers[G.layers.length - 1];
  if (!top || top.key !== key) {
    top = { key, t: 0, w: G.layers.length ? 0 : 1, W: CL.names.map(() => new THREE.Quaternion()), h: new THREE.Vector3() };
    if (key === 'jump') top.t = Math.max(0, (C.jump.air?.[0] ?? 0.2) - 0.12);
    G.layers.push(top);
  }
  top.w = Math.min(1, top.w + dt / FADE_C);
  const others = G.layers.reduce((acc, L) => acc + (L === top ? 0 : L.w), 0);
  for (const L of G.layers) if (L !== top) L.w = others > 0 ? (L.w / others) * (1 - top.w) : 0;
  G.layers = G.layers.filter((L) => L === top || L.w > 1e-3);
  // el paso: una sola fase para todas las de caminar (los pies, parejos al mezclar)
  const s = G.speed;
  const dirW = dirWeights(Math.atan2(fx, fz));
  const locoClips = (L) => {
    const [, gf, gb] = L.key.split(':');
    return [
      [C[gf], dirW[0], 1],
      [gb === 'runRev' ? C.run : C.back, dirW[1], gb === 'runRev' ? -1 : 1],
      [C.left, dirW[2], 1],
      [C.right, dirW[3], 1],
    ];
  };
  if (top.key.startsWith('loco')) {
    let adv = 0;
    for (const [c, w] of locoClips(top)) if (w > 0) adv += (w * clipRate(s, c)) / c.dur;
    G.phase = (G.phase + dt * adv) % 1;
  }
  for (const L of G.layers) {
    const k = L.key;
    if (k.startsWith('loco')) {
      let acc = 0;
      for (const [c, w, sg] of locoClips(L)) {
        if (w <= 1e-3) continue;
        mix(L, c, ((((sg * G.phase + (c.ph0 || 0)) % 1) + 1) % 1) * c.dur, true, w, acc);
        acc += w;
      }
      continue;
    }
    // (los que andan, al paso de lo que se mueve; agachado o arrastrándose para atrás, al revés)
    const c = C[k === 'dead' ? 'lay' : k === 'dive' ? 'swim' : k];
    if (!c) continue;
    if (k === 'dead') L.t = 0;
    else if (k === 'crouchW' || k === 'crawl' || k === 'swim') L.t += dt * clipRate(s, c) * (fz < -0.2 && k !== 'swim' ? -1 : 1);
    else if (k === 'jump') {
      const [a0, a1] = c.air || [0.2, 1.7];
      // (el despegue y el aire, apurados al salto del juego; en el aire espera el aterrizaje)
      L.t = L.t < a1 ? Math.min(a1, L.t + dt * ((a1 - a0) / 0.6)) : L.t + dt;
    } else if (k === 'kneel') L.t = Math.min(c.dur - 0.02, L.t + dt * 1.4);
    else L.t += dt;
    mix(L, c, L.t, k !== 'jump' && k !== 'kneel', 1, 0);
    // (el salto ya lo sube el juego: sin la subida del clip)
    if (k === 'jump') L.h.y = Math.min(L.h.y, 0);
  }
  // mezcladas
  const W = G.cW;
  const L0 = G.layers[0];
  let acc = L0.w;
  for (let i = 0; i < CL.nb; i++) W[i].copy(L0.W[i]);
  vh.copy(L0.h);
  for (let j = 1; j < G.layers.length; j++) {
    const L = G.layers[j];
    acc += L.w;
    const k = acc > 0 ? L.w / acc : 1;
    for (let i = 0; i < CL.nb; i++) W[i].slerp(L.W[i], k);
    vh.lerp(L.h, k);
  }
  // los brazos según lo que tiene en la mano (los clips de moverse son con arma larga)
  holdArms(G, dt, top.key, W);
  // lo que hace, en la parte de arriba
  if (G.act) {
    const A = G.act;
    A.t += dt * A.rate;
    const u = A.t / A.c.dur;
    if (u >= 1 || r.downed || r.dead || r.ghost || (r.swim || 0) >= 2) G.act = null;
    else {
      const w = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.15);
      sample(A.c, A.t, false, tmpW, tmpH);
      for (let i = 0; i < CL.nb; i++) if (CL.upper[i]) W[i].slerp(tmpW[i], CL.upper[i] * w);
    }
  }
  // de pie: hacia dónde mira, arriba o abajo (el lomo, el cuello y la cabeza; los
  // brazos con el arma, más)
  const upright = !r.downed && !r.dead && !r.corpse && !r.ghost && !((r.swim || 0) >= 2) && top.key !== 'kneel';
  G.pitch += ((upright ? Math.max(-1.1, Math.min(1.1, r.pitch || 0)) : 0) - G.pitch) * Math.min(1, dt * 10);
  qY.setFromAxisAngle(UP_C, yaw);
  vr.set(1, 0, 0).applyQuaternion(qY);
  // (con el mate de una mano la derecha lo apunta igual que un arma larga; la
  // izquierda, suelta, casi no sigue la mirada)
  const one = !!a.gun && !G.two;
  const armK = G.act ? 0.4 : G.two || one || top.key.startsWith('loco') || top.key === 'crouchW' ? 0.85 : 0.4;
  const armKL = one && !G.act ? 0.15 : armK;
  for (let i = 0; i < CL.nb; i++) {
    W[i].premultiply(qY);
    const k = CL.arm[i] ? (CL.armL[i] ? armKL : armK) : CL.aim[i];
    if (k && G.pitch) W[i].premultiply(qR.setFromAxisAngle(vr, -G.pitch * k));
  }
  // la cadera (el medio de los pies del clip, donde está el compañero)
  const swimY = SWIM_Y[top.key];
  vb.copy(CL.hipsRest).sub(CL.feetMid).add(vh).applyQuaternion(qY);
  vb.x += r.pos.x;
  vb.z += r.pos.z;
  vb.y += (r.pos.y || 0) + (swimY ?? 0);
  // los huesos
  const B = G.cb;
  for (let i = 0; i < CL.nb; i++) {
    const pi = CL.parent[i];
    B[i].quaternion.copy(qa.copy(pi >= 0 ? W[pi] : T.armQ).invert()).multiply(W[i]);
  }
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  updateMW.call(G.root, true);
  // cebando: la mano libre sube el termo arriba del mate
  if (G.pour) pourArm(G, dt, r);
  else G.pourK = 0;
  // las piezas, desde los huesos (el arma y el mate, en la mano derecha)
  const M = a.mats;
  for (let i = 0; i < 13; i++) {
    const j = SWAP[i];
    M[i].multiplyMatrices(G.bones[PART_BONE[j]].matrixWorld, CL.OFF[j]);
  }
  for (const [part, fore, hand] of HANDS_CLIP) {
    G.bones[hand].getWorldPosition(va);
    G.bones[fore].getWorldPosition(vc);
    va.addScaledVector(vc.subVectors(va, vc).normalize(), GRIP);
    M[part].decompose(vc, qa, vs);
    vc.copy(HAND_AT).applyQuaternion(qa);
    M[part].setPosition(va.sub(vc));
  }
  G.mode = G.layers.map((L) => `${L.key}:${L.w.toFixed(2)}`).join(' ') + (G.act ? ' +act' : '');
}

// Los brazos según lo que lleva (los clips de caminar, correr y agachado
// caminando son con arma larga; el quieto, el sprint, el salto y agachado
// quieto, sin arma):
// - con el mate de una mano (o la hoz): la derecha lo lleva adelante (el
//   agarre del quieto con arma larga) y la izquierda va suelta, braceando al
//   paso cuando camina (el brazo del sprint, en la misma fase de los pies);
// - con arma larga: en el sprint, el salto y agachado quieto, los dos brazos
//   la agarran como en el quieto con arma.
// Cada brazo se pone respecto del pecho (sigue al lomo del clip) y entra y sale de a poco.
function holdArms(G, dt, key, W) {
  const C = CL.clips;
  const armed = !!G.a.gun;
  const one = armed && !G.two;
  const two = armed && G.two;
  const loco = key.startsWith('loco');
  const upright = loco || key === 'idle' || key === 'idleR' || key === 'crouch' || key === 'crouchW' || key === 'jump';
  const twoHold = two && (key === 'jump' || key === 'crouch' || (loco && G.gaitF === 'sprint'));
  const wantR = upright && (one || twoHold) ? 1 : 0;
  const wantL = !upright ? 0 : one ? (loco || key === 'crouchW' ? 1 : 0) : twoHold ? 1 : 0;
  const fk = Math.min(1, dt * 7);
  G.holdR = (G.holdR || 0) + (wantR - (G.holdR || 0)) * fk;
  G.holdL = (G.holdL || 0) + (wantL - (G.holdL || 0)) * fk;
  // (de qué es la izquierda: se queda con la última mientras se va)
  if (wantL) G.holdLk = one ? (key === 'crouchW' ? 'crouch' : 'swing') : 'two';
  if (G.holdR < 1e-3 && G.holdL < 1e-3) return;
  G.holdT = (G.holdT || 0) + dt;
  sample(C.idleR, G.holdT, true, refA, tmpH);
  if (G.holdR > 1e-3) armTo(W, CL.iR, refA, null, 0, G.holdR, true);
  if (G.holdL <= 1e-3) return;
  if (G.holdLk === 'two') armTo(W, CL.iL, refA, null, 0, G.holdL, true);
  else if (G.holdLk === 'crouch') {
    sample(C.crouch, G.holdT, true, refB, tmpH);
    armTo(W, CL.iL, refB, null, 0, G.holdL);
  } else {
    // suelto (el quieto sin arma) y, cuanto más rápido, más braceo (el sprint, al paso)
    sample(C.idle, G.holdT, true, refB, tmpH);
    const c = C.sprint;
    const u = ((((G.phase || 0) + (c.ph0 || 0)) % 1) + 1) % 1;
    sample(c, u * c.dur, true, refC, tmpH);
    const amp = loco ? Math.max(SWING_MIN, Math.min(1, G.speed / SWING_FULL)) : 0;
    armTo(W, CL.iL, refB, refC, amp, G.holdL);
  }
}

// Cebar (la recarga con un mate): el brazo libre (el Left del modelo) lleva la
// mano arriba y al costado del mate, con dos huesos (hombro y codo, el codo
// para abajo y afuera); entra y sale de a poco. G.pourK: cuánto (Avatars
// inclina el termo con eso y echa el chorro).
const POUR_UP = 0.17;
const POUR_SIDE = 0.1;
const pA = new THREE.Vector3();
const pE = new THREE.Vector3();
const pH = new THREE.Vector3();
const pT = new THREE.Vector3();
const pPole = new THREE.Vector3();
const vF = new THREE.Vector3();
const vL = new THREE.Vector3();
const qW = new THREE.Quaternion();
const qP = new THREE.Quaternion();
const qD = new THREE.Quaternion();
const qL = new THREE.Quaternion();
const sm = (x) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};
function pourArm(G, dt, r) {
  const P = G.pour;
  P.t += dt;
  const u = P.t / P.d;
  if (u >= 1 || r.downed || r.dead || r.ghost || (r.swim || 0) >= 2) {
    G.pour = null;
    G.pourK = 0;
    return;
  }
  const w = sm(u / 0.2) * sm((1 - u) / 0.18);
  // (el termo se inclina un poco después de llegar y se endereza antes de irse)
  G.pourK = sm((u - 0.16) / 0.14) * sm((0.86 - u) / 0.12);
  const B = G.bones;
  const yaw = (r.yaw || 0) + Math.PI;
  vF.set(Math.sin(yaw), 0, Math.cos(yaw));
  vL.set(Math.cos(yaw), 0, -Math.sin(yaw));
  B.RightHand.getWorldPosition(pT);
  pT.y += POUR_UP;
  pT.addScaledVector(vL, POUR_SIDE).addScaledVector(vF, 0.02);
  B.LeftArm.getWorldPosition(pA);
  B.LeftForeArm.getWorldPosition(pE);
  B.LeftHand.getWorldPosition(pH);
  const l1 = pA.distanceTo(pE);
  const l2 = pE.distanceTo(pH);
  const to = vb.subVectors(pT, pA);
  const d = Math.max(0.05, Math.min(l1 + l2 - 1e-3, to.length()));
  to.normalize();
  // el codo: en el plano del brazo, del lado de abajo y afuera
  pPole.set(0, -1, 0).addScaledVector(vL, 0.6).addScaledVector(vF, -0.3);
  pPole.addScaledVector(to, -pPole.dot(to)).normalize();
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbow = vc.copy(pA).addScaledVector(to, l1 * cosA).addScaledVector(pPole, l1 * sinA);
  const hand = va.copy(pA).addScaledVector(to, d);
  // el brazo: del codo de ahora al de la solución
  turn(B.LeftArm, vs.subVectors(pE, pA).normalize(), vb.subVectors(elbow, pA).normalize(), w);
  B.LeftArm.updateMatrixWorld(true);
  B.LeftForeArm.getWorldPosition(pE);
  B.LeftHand.getWorldPosition(pH);
  turn(B.LeftForeArm, vs.subVectors(pH, pE).normalize(), vb.subVectors(hand, pE).normalize(), w);
  B.LeftForeArm.updateMatrixWorld(true);
}

// Gira un hueso (en el mundo) para que la dirección `from` pase a `to`, en k.
function turn(bone, from, to, k) {
  bone.getWorldQuaternion(qW);
  bone.parent.getWorldQuaternion(qP);
  qD.setFromUnitVectors(from, to);
  qL.copy(qP).invert().multiply(qD.multiply(qW));
  bone.quaternion.slerp(qL, k);
}

// Un brazo (idx, de padre a hijo) hacia el de una pose de referencia: el giro
// de cada hueso respecto de su padre en A (mezclado con el de B en kB), puesto
// sobre el padre de ahora; k: cuánto. abs: del hombro para abajo, el giro de
// A tal cual (el arma queda pareja aunque el clip se agache o se doble al saltar).
function armTo(W, idx, A, B, kB, k, abs = false) {
  for (const i of idx) {
    if (abs && i !== idx[0]) {
      W[i].slerp(A[i], k);
      continue;
    }
    const pi = CL.parent[i];
    qa.copy(A[pi]).invert().multiply(A[i]);
    if (B && kB > 0) qa.slerp(qb.copy(B[pi]).invert().multiply(B[i]), kB);
    W[i].slerp(qb.copy(W[pi]).multiply(qa), k);
  }
}

// adelante, atrás, izquierda y derecha según el ángulo (0: adelante, + a su izquierda)
const DW = [0, 0, 0, 0];
function dirWeights(ang) {
  const d = (ang * 2) / Math.PI;
  DW[0] = DW[1] = DW[2] = DW[3] = 0;
  if (d >= 0 && d <= 1) {
    DW[2] = d;
    DW[0] = 1 - d;
  } else if (d > 1) {
    DW[1] = Math.min(1, d - 1);
    DW[2] = 1 - DW[1];
  } else if (d < 0 && d >= -1) {
    DW[3] = -d;
    DW[0] = 1 + d;
  } else {
    DW[1] = Math.min(1, -d - 1);
    DW[3] = 1 - DW[1];
  }
  return DW;
}
