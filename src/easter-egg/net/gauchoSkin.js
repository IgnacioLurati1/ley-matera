import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { makePose, solvePose } from '../entities/skeleton';
import { skinLook, cullList, cullAt } from '../entities/bossSkin';
import { liveOn, liveBegin, liveBone, liveAfter, liveRest } from '../ui/cineLife';

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
// La cara y el poncho del modelo, en sus unidades (cm, en reposo) para la vida
// de las escenas (ui/cineLife): la mandíbula (de dónde a dónde, el ancho y el
// eje de la bisagra), los ojos pintados (centro, radios, de dónde para
// adelante) y de dónde a dónde se hamaca el poncho.
// (medido en el juego con marcas en la cabeza: e4/manos-cine/face.mjs; los
// ojos del modelo no están centrados: el derecho, x 4,25; el izquierdo, -5,72)
const FACE = {
  jawTop: 161.2,
  jawBot: 153,
  jawBack: 8,
  jawW: 5.5,
  jawSoft: 1.4,
  pivY: 163,
  pivZ: 2,
  mouthY: 160.6,
  mouthW: 2.2,
  eyeXR: 4.25,
  eyeXL: -5.72,
  eyeY: 172.4,
  eyeRX: 1.35,
  eyeRY: 2.45,
  eyeZ: 13,
  lidX: 3,
  lidY0: 176,
  lidY1: 179,
  swayTop: 140,
  swayBot: 100,
};
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
  const lidCol = new THREE.Color(0.42, 0.26, 0.18);
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
    // el color de los párpados: la piel de la frente, arriba de los ojos (ui/cineLife)
    const pos = geo.getAttribute('position');
    const c = [0, 0, 0];
    let m = 0;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      if (Math.abs(px) > FACE.lidX || py < FACE.lidY0 || py > FACE.lidY1 || pos.getZ(i) < FACE.eyeZ) continue;
      const x = Math.min(S - 1, Math.max(0, Math.floor(uv.getX(i) * S)));
      const y = Math.min(S - 1, Math.max(0, Math.floor(uv.getY(i) * S)));
      const k = (y * S + x) * 4;
      for (let j = 0; j < 3; j++) c[j] += lin(D[k + j] / 255);
      m++;
    }
    if (m) lidCol.setRGB(c[0] / m, c[1] / m, c[2] / m);
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
    lidCol,
    face: FACE,
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
  // la vida de las escenas (ui/cineLife): la mandíbula, los párpados y el
  // poncho que se hamaca; jugando quedan en 0
  // (uFill: luz de relleno solo para este gaucho, desde la cámara: las escenas
  // de noche, ui/cineActors fill; jugando, 0)
  const life = { uJaw: { value: 0 }, uLid: { value: 0 }, uSway: { value: new THREE.Vector3() }, uLidCol: { value: T.lidCol }, uEyeGlow: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) } };
  m.userData.life = life;
  const F = T.face;
  const f = (x) => x.toFixed(2);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPonTint = tint;
    sh.uniforms.uPonRef = ref;
    Object.assign(sh.uniforms, life);
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute float poncho;\nvarying float vPoncho;\nvarying vec3 vBind;\nuniform float uJaw;\nuniform vec3 uSway;\nvoid main() {\n\tvPoncho = poncho;\n\tvBind = position;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	if (uJaw > 0.0) {
		float jw = uJaw * smoothstep(${f(F.jawTop)}, ${f(F.jawTop - F.jawSoft)}, position.y) * smoothstep(${f(F.jawBot)}, ${f(F.jawBot + F.jawSoft)}, position.y) * smoothstep(${f(F.jawBack)}, ${f(F.jawBack + F.jawSoft)}, position.z) * (1.0 - smoothstep(${f(F.jawW)}, ${f(F.jawW + F.jawSoft)}, abs(position.x)));
		vec2 jp = transformed.yz - vec2(${f(F.pivY)}, ${f(F.pivZ)});
		float jc = cos(jw);
		float js = sin(jw);
		transformed.yz = vec2(${f(F.pivY)}, ${f(F.pivZ)}) + vec2(jp.x * jc - jp.y * js, jp.x * js + jp.y * jc);
	}`,
      )
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n\ttransformed += uSway * (poncho * smoothstep(${f(F.swayTop)}, ${f(F.swayBot)}, position.y));`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uPonTint;\nuniform float uPonRef;\nuniform float uLid;\nuniform float uJaw;\nuniform vec3 uLidCol;\nuniform vec3 uEyeGlow;\nuniform vec3 uFill;\nvarying float vPoncho;\nvarying vec3 vBind;\nvoid main() {').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uEyeGlow * eyeGlow;\n\ttotalEmissiveRadiance += diffuseColor.rgb * uFill * (0.3 + 0.7 * max(dot(normal, normalize(vViewPosition)), 0.0));').replace(
      '#include <map_fragment>',
      `#include <map_fragment>
	if (vPoncho > 0.5) {
		float pl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
		diffuseColor.rgb = uPonTint * (pl / uPonRef);
	}
	// los ojos pintados del modelo (cada uno en su lugar): el párpado baja
	// desde arriba y, con uEyeGlow, lo oscuro del ojo brilla (los ojos de oro)
	vec2 ed = vec2(vBind.x - (vBind.x > ${f((F.eyeXR + F.eyeXL) / 2)} ? ${f(F.eyeXR)} : ${f(F.eyeXL)}), vBind.y - ${f(F.eyeY)}) / vec2(${f(F.eyeRX)}, ${f(F.eyeRY)});
	float eyeIn = vBind.z > ${f(F.eyeZ)} && dot(ed, ed) < 1.0 ? 1.0 : 0.0;
	float eyeGlow = eyeIn * (1.0 - smoothstep(0.03, 0.08, dot(diffuseColor.rgb, vec3(0.3333))));
	if (uLid > 0.001 && eyeIn > 0.5) {
		float edge = 1.0 - 2.0 * uLid;
		if (ed.y > edge) {
			diffuseColor.rgb = uLidCol * (ed.y < edge + 0.3 ? 0.55 : 1.0);
			eyeGlow = 0.0;
		}
	}
	// la boca, abajo del bigote: oscura lo que se abre la mandíbula
	if (uJaw > 0.0 && vBind.z > ${f(F.eyeZ)}) {
		float mo = 1.0 - smoothstep(0.65, 1.0, length(vec2((vBind.x - ${f((F.eyeXR + F.eyeXL) / 2)}) / ${f(F.mouthW)}, (vBind.y - ${f(F.mouthY + 0.5)}) / 1.15)));
		diffuseColor.rgb *= 1.0 - 0.85 * mo * clamp(uJaw * ${f(1 / 0.09)}, 0.0, 1.0);
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
    // la vida de las escenas (ui/cineLife): los uniforms del material
    jawU: mat.userData.life.uJaw,
    lidU: mat.userData.life.uLid,
    swayU: mat.userData.life.uSway,
    meshScale: mesh.getWorldScale(new THREE.Vector3()).x,
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
      // (con vida de escena, un cuadro nuevo aunque la pose sea la misma)
      else if (changed(G) || (liveOn(G) && G.frame !== a.g?.raf)) pose(G, false);
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
  // la vida de las escenas (ui/cineLife): respira, parpadea, mira, habla
  G.frame = a.g?.raf;
  const life = liveOn(G) ? liveBegin(G, qa.copy(pq[2]).multiply(L[G.iHead ??= L.findIndex((d) => d.name === 'Head')].rest)) : null;
  if (!life && G.life) {
    liveRest(G);
    G.life = null;
  }
  for (const d of L) {
    if (d.p1 == null) d.W.copy(pq[d.p0]);
    else d.W.copy(pq[d.p0]).slerp(pq[d.p1], d.k);
    d.W.multiply(d.rest);
    if (life) liveBone(life, d);
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
  // con un mate en la mano (el de piezas o uno de verdad): la palma arriba (palmMate)
  const mate = handMate(a);
  if (mate || gunMate(a)) {
    updateMW.call(G.root, true);
    vF.set(0, 0, 1).transformDirection(M[1]).setY(0);
    if (vF.lengthSq() < 1e-6) vF.set(0, 0, 1);
    palmMate(G, 'LeftForeArm', 'LeftHand', 1, vF.normalize());
  } else if (G.palm) G.palm.k = 0;
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
  if (mate) seatMate(G, mate, M[6]);
  else unseatMate(a.hand?.children[0]);
  if (life) liveAfter(G, life);
  snapshot(G);
}

// (el usuario, 2026-10-03; window.__mduNoPalm = true: como antes, para comparar)
const palmOn = () => globalThis.__mduNoPalm !== true;
// el mate de piezas de la mano, si se ve (Avatars lo marca: handMate)
function handMate(a) {
  if (!palmOn()) return null;
  const m = a.hand?.children[0];
  return m?.userData.handMate && a.hand.visible && m.visible && !a.gun ? m : null;
}
// un mate de verdad (Avatars.setGun, con boca) en la mano
const gunMate = (a) => palmOn() && !!a.gun && !!a.mouth && a.gun.visible !== false;

// Los ojos pintados del modelo, para lo que brilla en ellos (los ojos de oro
// del gaucho dorado del molino): dos puntos colgados de la cabeza justo delante
// de cada ojo, y la textura del ojo que se prende con color (null: se apaga).
// Los huesos eyeA/eyeB del archivo no están donde están los ojos pintados.
export function eyeSpots(G, color = null) {
  if (G.mat.userData.life) G.mat.userData.life.uEyeGlow.value = color || new THREE.Color(0, 0, 0);
  if (G.eyeSpots) return G.eyeSpots;
  const sk = G.mesh.skeleton;
  const hi = sk.bones.findIndex((b) => b.name === 'Head');
  const head = sk.bones[hi];
  G.eyeSpots = [FACE.eyeXR, FACE.eyeXL].map((x) => {
    const o = new THREE.Object3D();
    o.position.set(x, FACE.eyeY, 16.2).applyMatrix4(G.mesh.bindMatrix).applyMatrix4(sk.boneInverses[hi]);
    head.add(o);
    return o;
  });
  return G.eyeSpots;
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
export const TWO_HAND = new Set(['madera', 'plastico', 'vidrio', 'lata', 'algarrobo', 'imperial', 'camionero', 'torpedo', 'asta', 'mate47', 'campanario', 'bombillon', 'tronador', 'diablo', 'liquidificador', 'wunder', 'terere', 'rayo', 'silicona', 'cocido', 'bombillazo', 'dragon', 'supremo']);
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

// (para esperarlos antes de una escena: ui/introShots ready; también arranca a bajarlos)
export const gauchoClipsReady = () => clipsReady() || clState === 3;
function clipsReady() {
  if (clState === 2) return true;
  if (!clState && T) {
    clState = 1;
    fetch(assetUrl(CLIPS_URL))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((J) => {
        prepClips(J);
        clState = 2;
        loadBlend();
      })
      .catch((e) => {
        console.warn('gaucho: sin clips', e);
        clState = 3;
      });
  }
  return false;
}

// anim-online (2026-10-04): los clips de los compañeros hechos en Blender
// (clips-online.json: cebar, afilar y los de siempre revisados), encima de los
// de clips.json; solo los compañeros (no los muñecos de escena con r.clips).
// globalThis.__mduNoAvatarBlend = true: los de antes (y el cebado de antes).
const BLEND_URL = '/assets/sotano/modelos/gaucho/clips-online.json';
function loadBlend() {
  fetch(assetUrl(BLEND_URL))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const add = {};
      for (const [k, c] of Object.entries(J.clips)) add[k] = { ...c, fps: c.fps || J.fps, q: Float32Array.from(c.q), hips: Float32Array.from(c.hips) };
      CL.blend = { ...CL.clips, ...add };
    })
    .catch((e) => console.warn('gaucho: sin clips-online', e));
}
const blendOn = (a) => !!CL?.blend && globalThis.__mduNoAvatarBlend !== true && !a.r?.clips;
const BLADES = new Set(['hoz', 'facon', 'sable']);
// (las que tienen su recarga en primera persona, la misma en tercera: la Lata de
// a un cartucho, los Gemelos cambian la yerba, cada elemental su gesto; el
// Liquidificador se ceba con el porongo en vez del termo)
const OWN = { lata: 'cartucho', gemelos: 'yerba', pillan: 'conjFuego', zonda: 'conjViento', illapa: 'conjRayo', penitente: 'conjHielo' };
const reloadClip = (C, a, wk) => (OWN[wk] && C[OWN[wk]]) || (a.mouth ? C.cebar : BLADES.has(wk) ? C.afilar : C.quebrar);

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
    // (anim-online: el termo de cebar va en la mano izquierda, desde su reposo)
    iLook: ['neck', 'Head'].map((n) => names.indexOf(n)),
    handRest: tb.LeftHand.getWorldQuaternion(new THREE.Quaternion()),
  };
  tmpW = names.map(() => new THREE.Quaternion());
  refA = names.map(() => new THREE.Quaternion());
  refB = names.map(() => new THREE.Quaternion());
  refC = names.map(() => new THREE.Quaternion());
  (window.__gaucho ||= {}).CL = CL;
  window.__gaucho.SAB = SAB;
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
  const C = (G.C = blendOn(a) ? CL.blend : CL.clips);
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
  // (anim-online: todo mate, también los de dos manos, va parado en la palma: Avatars.setGun)
  G.two = TWO_HAND.has(wk) && !(globalThis.__mduNoAvatarBlend !== true && a.mouth);
  // lo que hace (Session 'act')
  const act = r.act;
  if (act && act.t !== G.actSeen) {
    G.actSeen = act.t;
    if (act.a === 'revive') G.kneel = Math.min(6, act.d || 3.5);
    // (anim-online: cebar de verdad, el clip de Blender, o afilar la hoz;
    // estirado a lo que dura la recarga: cebArms, termoAt)
    // (las de filo se afilan; las que no son mate, la Gut y compañía, se quiebran y se cargan)
    else if (act.a === 'reload' && C !== CL.clips && C.cebar && C.afilar && C.quebrar) {
      G.ceb = { c: reloadClip(C, a, wk), t: 0, ct: 0, d: Math.max(0.8, act.d || ACTS.reload[1]), prop: wk === 'liquidificador' ? 'porongo' : 'termo' };
      G.pour = null;
    }
    // con un mate (tiene boca: Avatars.setGun) no se recarga como un arma: se
    // ceba con el termo (pourArm; el termo lo pone Avatars con G.pourK)
    else if (act.a === 'reload' && a.mouth) G.pour ={ t: 0, d: Math.max(0.8, act.d || ACTS.reload[1]) };
    // el Sable Corvo: el tajo que sigue del combo, o el saludo (sableArm)
    else if (wk === 'sable' && (act.a === 'stab' || act.a === 'salute') && globalThis.__mduNoSableAvatar !== true) {
      const chain = (G.sab && G.sab.kind === 'slash') || performance.now() - (G.sabEnd || -1e9) < 450;
      // (cuál del combo: el que manda el que tajea; si no viene, el que sigue)
      G.sabI = act.k != null ? act.k % 3 : chain ? ((G.sabI ?? -1) + 1) % 3 : 0;
      G.sab = act.a === 'salute' ? { kind: 'salute', t: 0, d: Math.max(0.8, act.d || 3.4) } : { kind: 'slash', move: ['izq', 'der', 'arriba'][G.sabI], t: 0, d: Math.max(0.2, act.d || 0.45) };
      G.act = null;
    } else if (ACTS[act.a] && C[ACTS[act.a][0]]) {
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
  // (G.actW: cuánto; anim-online: con el brazo del mate ocupado, el mate se esconde: Avatars)
  G.actW = 0;
  if (G.act) {
    const A = G.act;
    A.t += dt * A.rate;
    const u = A.t / A.c.dur;
    if (u >= 1 || r.downed || r.dead || r.ghost || (r.swim || 0) >= 2) G.act = null;
    else {
      const w = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.15);
      G.actW = C !== CL.clips ? w : 0;
      sample(A.c, A.t, false, tmpW, tmpH);
      for (let i = 0; i < CL.nb; i++) if (CL.upper[i]) W[i].slerp(tmpW[i], CL.upper[i] * w);
    }
  }
  // el Sable Corvo: el tajo o el saludo, con el sable en la mano
  if (G.sab) sableArm(G, dt, W, r);
  // cebando (o afilando la hoz): los brazos del clip de Blender, respecto del pecho
  if (G.ceb) cebArms(G, dt, W, r);
  else G.cebK = G.mateRoll = 0;
  // de pie: hacia dónde mira, arriba o abajo (el lomo, el cuello y la cabeza; los
  // brazos con el arma, más)
  const upright = !r.downed && !r.dead && !r.corpse && !r.ghost && !((r.swim || 0) >= 2) && top.key !== 'kneel';
  G.pitch += ((upright ? Math.max(-1.1, Math.min(1.1, r.pitch || 0)) : 0) - G.pitch) * Math.min(1, dt * 10);
  qY.setFromAxisAngle(UP_C, yaw);
  vr.set(1, 0, 0).applyQuaternion(qY);
  // (con el mate de una mano la derecha lo apunta igual que un arma larga; la
  // izquierda, suelta, casi no sigue la mirada)
  const one = !!a.gun && !G.two;
  const armK0 = G.act ? 0.4 : G.two || one || top.key.startsWith('loco') || top.key === 'crouchW' ? 0.85 : 0.4;
  // (cebando mira el mate: los brazos casi no siguen la mirada)
  const armK = G.cebK ? armK0 + (0.2 - armK0) * G.cebK : armK0;
  const armKL = one && !G.act && !G.cebK ? 0.15 : armK;
  for (let i = 0; i < CL.nb; i++) {
    W[i].premultiply(qY);
    const k = CL.arm[i] ? (CL.armL[i] ? armKL : armK) : CL.aim[i];
    if (k && G.pitch) W[i].premultiply(qR.setFromAxisAngle(vr, -G.pitch * k));
  }
  // la cadera (el medio de los pies del clip, donde está el compañero)
  // (de a poco: al pasar de flotar a nadar, o al salir del agua, el cuerpo
  // saltaba 0,8 m de golpe)
  const swimY = SWIM_Y[top.key] ?? 0;
  G.swimY = G.swimY == null ? swimY : G.swimY + (swimY - G.swimY) * Math.min(1, dt * 4);
  vb.copy(CL.hipsRest).sub(CL.feetMid).add(vh).applyQuaternion(qY);
  vb.x += r.pos.x;
  vb.z += r.pos.z;
  vb.y += (r.pos.y || 0) + G.swimY;
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
  // (el termo del cebado nuevo: rígido en la mano izquierda; Avatars lo pone)
  if (G.ceb?.c.termo) termoAt(G);
  else if (G.tm) G.tm.on = false;
  // el mate de una mano, parado en la palma (palmMate; Avatars lo apoya en G.palm)
  // (cebando, también el de dos manos: Avatars lo cambia por el de la palma)
  const holdP = (G.ceb?.c.termo ? Math.max(G.two ? 0 : G.holdR || 0, G.cebK) : G.two ? 0 : G.holdR || 0) * (1 - G.actW);
  if (gunMate(a) && holdP > 1e-3) {
    palmMate(G, 'RightForeArm', 'RightHand', holdP, vF.set(Math.sin(yaw), 0, Math.cos(yaw)));
    updateMW.call(G.root, true);
  } else if (G.palm) G.palm.k = 0;
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

// El Sable Corvo de un compañero (el Monumento): los tajos del combo (a la
// izquierda, a la derecha y de arriba) y el saludo militar (E), con el sable
// en la mano. Antes el tajo era la puñalada del facón con el sable escondido
// y el saludo no se veía (el usuario, 2026-10-05). Todo el brazo derecho gira
// alrededor del hombro (G.sabQ, en el espacio del muñeco: x a su izquierda, y
// arriba, z adelante) y Avatars gira el sable igual (sabGun).
// globalThis.__mduNoSableAvatar: como antes. (window.__gaucho.SAB: para probar)
const SAB = {
  // cada tajo: [eje, ángulo armado, ángulo al terminar]. Medidos para que el
  // antebrazo, la mano y la hoja no atraviesen la cabeza, el ala del sombrero
  // ni el poncho en ningún momento (S/monu-pasada/surubi/t_sabPen.mjs); el de
  // arriba sube el brazo abierto, por arriba y al costado de la cabeza.
  izq: [[-0.5, 1, 0.4], -0.8, 0.8],
  der: [[-0.5, 1, 0.4], 0.8, -0.8],
  arriba: [[1, 0, -0.9], -1.5, 0.6],
  // cuánto del tajo es armarlo y cuánto el golpe (el resto, volver)
  wind: 0.28,
  swing: 0.3,
  // el saludo: [eje, ángulo] (el brazo arriba, la hoja parada delante de la cara)
  salute: [[1, 0.55, 0], -1.15],
};
const qSab = new THREE.Quaternion();
const vSab = new THREE.Vector3();
function sableArm(G, dt, W, r) {
  const S = G.sab;
  S.t += dt;
  const u = S.t / S.d;
  if (u >= 1 || r.downed || r.dead || r.ghost || (r.swim || 0) >= 2) {
    G.sab = null;
    G.sabQ = null;
    G.sabEnd = performance.now();
    return;
  }
  let ang;
  let ax;
  if (S.kind === 'salute') {
    ax = SAB.salute[0];
    // arriba enseguida, quieto, y baja al final
    ang = SAB.salute[1] * sm(u / 0.12) * sm((1 - u) / 0.15);
  } else {
    const [a, a0, a1] = SAB[S.move] || SAB.izq;
    ax = a;
    const wn = SAB.wind;
    const sw = SAB.swing;
    ang = u < wn ? a0 * sm(u / wn) : u < wn + sw ? a0 + (a1 - a0) * sm((u - wn) / sw) : a1 * (1 - sm((u - wn - sw) / (1 - wn - sw)));
  }
  qSab.setFromAxisAngle(vSab.set(ax[0], ax[1], ax[2]).normalize(), ang);
  // (el brazo, el antebrazo y la mano: el hombro queda)
  for (let k = 1; k < CL.iR.length; k++) W[CL.iR[k]].premultiply(qSab);
  (G.sabQ ||= new THREE.Quaternion()).copy(qSab);
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
  const C = G.C || CL.clips;
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
  // (arriba del mate: parado en la palma, la boca queda más adelante y más alta que la muñeca)
  if (G.palm?.k > 0.5) pT.copy(G.palm.at).setY(G.palm.at.y + 0.1);
  else B.RightHand.getWorldPosition(pT);
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

// anim-online (2026-10-04): cebar con el clip de Blender (clips-online.json
// 'cebar'): el mate en la palma derecha; la izquierda saca el termo de atrás
// de la cadera, lo sube al lado del mate, lo inclina, vierte y lo guarda.
// Dura lo que la recarga: si es más larga que el clip se estira lo de verter
// (c.termo.phases), si es más corta se apura todo parejo. Los brazos van
// respecto del pecho (armTo) sobre lo que haga el resto del cuerpo; el cuello
// y la cabeza miran un poco el mate. 'afilar' (la hoz) igual, sin termo.
function cebArms(G, dt, W, r) {
  const E = G.ceb;
  E.t += dt;
  if (E.t >= E.d || r.downed || r.dead || r.ghost || (r.swim || 0) >= 2) {
    G.ceb = null;
    G.cebK = 0;
    return;
  }
  const c = E.c;
  const ph = c.termo?.phases;
  // (la Lata: un cartucho cada c.dur, los que hagan falta)
  if (c.cycle) E.ct = E.t % c.dur;
  else if (E.d <= c.dur || !ph) E.ct = (E.t / E.d) * c.dur;
  else {
    const x = E.d - c.dur;
    E.ct = E.t < ph[0] ? E.t : E.t < ph[1] + x ? ph[0] + ((E.t - ph[0]) * (ph[1] - ph[0])) / (ph[1] - ph[0] + x) : E.t - x;
  }
  const w = sm(E.t / 0.2) * sm((E.d - E.t) / 0.2);
  G.cebK = w;
  // (los Gemelos: la palma se da vuelta para volcar la yerba; palmMate y Avatars giran el mate igual)
  if (c.roll) {
    const x = Math.min(c.roll.length - 1.001, E.ct * 15);
    const i = Math.floor(x);
    G.mateRoll = ((c.roll[i] + (c.roll[i + 1] - c.roll[i]) * (x - i)) * Math.PI * w) / 180;
  } else G.mateRoll = 0;
  sample(c, E.ct, false, tmpW, tmpH);
  armTo(W, CL.iR, tmpW, null, 0, w);
  armTo(W, CL.iL, tmpW, null, 0, w);
  for (const i of CL.iLook) W[i].slerp(tmpW[i], 0.6 * w);
}

// El termo en la mano izquierda (G.tm, en el mundo; Avatars lo dibuja): sus
// ejes en el reposo de la mano (c.termo up0/sp0, del clip) y el agarre (grip,
// en los ejes del termo); se ve entre show[0] y show[1] y echa agua en pour.
function termoAt(G) {
  const E = G.ceb;
  const c = E.c;
  const T = c.termo;
  if (!c.tK) {
    const up = new THREE.Vector3().fromArray(T.up0);
    const sp = new THREE.Vector3().fromArray(T.sp0);
    const z = new THREE.Vector3().crossVectors(sp, up);
    c.tK = CL.handRest.clone().invert().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sp, up, z)));
    c.tG = new THREE.Vector3().fromArray(T.grip);
  }
  const tm = (G.tm ||= { pos: new THREE.Vector3(), q: new THREE.Quaternion(), on: false, pour: false, k: 1 });
  G.bones.LeftHand.matrixWorld.decompose(tm.pos, tm.q, vs);
  tm.q.multiply(c.tK);
  tm.pos.add(va.copy(c.tG).applyQuaternion(tm.q));
  tm.on = E.ct >= T.show[0] && E.ct <= T.show[1];
  tm.pour = E.ct >= T.pour[0] && E.ct <= T.pour[1];
  tm.k = T.k;
  tm.prop = E.prop;
}

// ---------------- el mate en la palma ----------------
// El mate va arriba de la mano: la mano horizontal, la palma para arriba y el
// mate parado encima (el usuario, 2026-10-03: la mano quedaba vertical, como
// la del arma, y el mate al lado de los dedos, atravesándolos). El antebrazo
// gira sobre su eje lo que haga falta para que la palma mire arriba y la
// muñeca deja los dedos casi horizontales; G.palm: dónde se apoya el mate.
// Los ejes de la mano del modelo (en reposo, con los brazos abajo): +Y va a
// los dedos y la palma mira al cuerpo (-X la derecha, +X la izquierda).
const PALM = { RightHand: new THREE.Vector3(-1, 0, 0), LeftHand: new THREE.Vector3(1, 0, 0) };
// de la muñeca al medio de la palma (a lo largo de los dedos) y de los huesos
// a la piel de la palma
const PALM_AT = 0.095;
const PALM_SKIN = 0.03;
// lo más que se dobla la muñeca hacia atrás para dejar los dedos horizontales (rad)
const WRIST_MAX = 1.1;
const UP_P = new THREE.Vector3(0, 1, 0);
const mP = new THREE.Matrix4();
const mX = new THREE.Vector3();
const mY = new THREE.Vector3();
const mZ = new THREE.Vector3();
const pF = new THREE.Vector3();
const pN = new THREE.Vector3();
const qH = new THREE.Quaternion();
function palmMate(G, fore, hand, k, fwd) {
  const B = G.bones;
  const F = B[fore];
  const Hd = B[hand];
  F.getWorldPosition(pE);
  Hd.getWorldPosition(pH);
  const d = pT.subVectors(pH, pE).normalize();
  // el antebrazo, sobre su eje: la palma hacia arriba (lo que se pueda: con el
  // brazo colgando, nada)
  Hd.getWorldQuaternion(qW);
  const n0 = pN.copy(PALM[hand]).applyQuaternion(qW);
  n0.addScaledVector(d, -n0.dot(d));
  const n1 = pF.copy(UP_P).addScaledVector(d, -d.y);
  if (n0.lengthSq() > 1e-6 && n1.lengthSq() > 0.04) {
    n0.normalize();
    n1.normalize();
    const c = n0.dot(n1);
    if (c < -0.9999) qD.setFromAxisAngle(d, Math.PI);
    else qD.setFromUnitVectors(n0, n1);
    F.getWorldQuaternion(qW);
    F.parent.getWorldQuaternion(qP);
    qL.copy(qP).invert().multiply(qD.multiply(qW));
    F.quaternion.slerp(qL, k);
    F.updateMatrixWorld(true);
  }
  // la mano: los dedos para adelante, casi horizontales (la muñeca se dobla
  // hasta WRIST_MAX), y la palma arriba
  const f = pF.set(d.x, 0, d.z);
  const hl = f.length();
  if (hl < 0.3) f.lerp(vh.copy(fwd).multiplyScalar(0.3), 1 - hl / 0.3);
  f.normalize();
  const bend = Math.acos(Math.max(-1, Math.min(1, f.dot(d))));
  if (bend > WRIST_MAX) f.lerp(d, 1 - WRIST_MAX / bend).normalize();
  const n = pN.copy(UP_P).addScaledVector(f, -f.y).normalize();
  // (anim-online: los Gemelos vuelcan: la palma girada sobre los dedos)
  if (G.mateRoll) n.applyAxisAngle(f, -G.mateRoll);
  const s = hand === 'LeftHand' ? 1 : -1;
  mX.copy(n).multiplyScalar(s);
  mY.copy(f);
  mZ.crossVectors(mX, mY);
  qH.setFromRotationMatrix(mP.makeBasis(mX, mY, mZ));
  Hd.getWorldQuaternion(qW);
  qW.slerp(qH, k);
  Hd.parent.getWorldQuaternion(qP);
  Hd.quaternion.copy(qP.invert().multiply(qW));
  Hd.updateMatrixWorld(true);
  // la palma (donde se apoya el mate): sobre los huesos, a lo largo de los dedos
  Hd.getWorldPosition(pH);
  vb.set(0, 1, 0).applyQuaternion(qW);
  const P = (G.palm ||= { at: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), k: 0 });
  P.at.copy(pH).addScaledVector(vb, PALM_AT).addScaledVector(vc.copy(PALM[hand]).applyQuaternion(qW), PALM_SKIN);
  P.up.copy(UP_P);
  if (G.mateRoll) P.up.copy(PALM[hand]).applyQuaternion(qW);
  P.fwd.copy(fwd);
  P.k = k;
}

// El mate de piezas de la mano (Avatars: a.hand.children[0]) parado en la
// palma del modelo (G.palm), girado con el cuerpo (la bombilla para el que lo
// tiene). La mano de las piezas sigue siendo la del brazo: el mate se acomoda
// respecto de ella.
const MATE_HALF = 0.063;
const mW = new THREE.Matrix4();
const mL = new THREE.Matrix4();
const vS = new THREE.Vector3();
function seatMate(G, mate, M6) {
  const P = G.palm;
  const a = G.a;
  // (lo de antes, para devolverlo: unseatMate)
  const U = mate.userData;
  if (!U.palm) U.palm = { p: mate.position.clone(), q: mate.quaternion.clone() };
  mW.multiplyMatrices(a.group.matrixWorld, M6);
  mW.decompose(va, qa, vS);
  // (la bombilla, que se inclina hacia +x del mate, para el lado del cuerpo)
  qb.setFromAxisAngle(UP_P, Math.atan2(P.fwd.z, -P.fwd.x));
  vc.copy(P.at).addScaledVector(P.up, MATE_HALF * vS.x * mate.scale.y);
  mL.compose(vc, qb, va.copy(vS).multiply(mate.scale));
  // (en posición y giro, no en la matriz: las escenas lo clonan para soltarlo)
  mL.premultiply(mW.invert()).decompose(mate.position, mate.quaternion, vS);
  mate.updateMatrixWorld(true);
}

function unseatMate(mate) {
  const U = mate?.userData;
  if (!U?.palm) return;
  mate.position.copy(U.palm.p);
  mate.quaternion.copy(U.palm.q);
  U.palm = null;
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

// ---------------- clips de cinemática (hechos en Blender) ----------------
// Las tomas con el movimiento hecho en Blender (IK, física; mismo formato que
// clips.json: por cuadro, el giro de cada hueso en el espacio del modelo y la
// cadera) ponen el cuerpo directo, sin la pose de piezas: el gaucho queda con
// el origen del clip en (x, y, z), mirando hacia `yaw`, en el segundo `t`.
// Las piezas se rearman desde los huesos (la mano de la linterna, el mate y lo
// que cuelga de ellas siguen al cuerpo; la 6 es la mano derecha del modelo).
// false: el gaucho o sus clips todavía no están (queda la pose de piezas).
export const cineClip = (c) => ({ ...c, q: Float32Array.from(c.q), hips: Float32Array.from(c.hips) });

// Un clip de los de siempre (clips.json: 'tread', 'crawl', 'idle'...) para las
// cinemáticas; null si todavía no bajaron.
export const gauchoClip = (name) => (clipsReady() ? CL.clips[name] || null : null);

const qT = new THREE.Quaternion();
const qLk = new THREE.Quaternion();
const AX_X = new THREE.Vector3(1, 0, 0);
// La pose que tiene ahora un gaucho (giro de cada hueso y la cadera, en el
// mundo), para pasar de ahí a un clip sin salto (poseCineClip o.snap).
export function cineSnap(a) {
  const G = a?.gs;
  if (!G?.on || !clipsReady()) return null;
  return { W: CL.names.map((n) => G.bones[n].getWorldQuaternion(new THREE.Quaternion())), h: G.bones.Hips.getWorldPosition(new THREE.Vector3()) };
}

// o (opcional): loop; snap (cineSnap) y sw (0..1: cuánto del clip nuevo): se
// mezcla desde esa pose, cadera incluida; from { c, t, loop } y w (0..1: cuánto del clip nuevo,
// para pasar de uno a otro sin salto); look (rad, + mira para arriba: cuello y
// cabeza); tilt (rad, el cuerpo entero inclinado hacia adelante desde los pies:
// una pendiente).
export function poseCineClip(a, c, t, x, y, z, yaw, o = null) {
  const G = a.gs;
  if (!G?.on || !clipsReady()) return false;
  G.cb ||= CL.names.map((n) => G.bones[n]);
  G.cW ||= CL.names.map(() => new THREE.Quaternion());
  const W = G.cW;
  sample(c, t, !!o?.loop, W, vh);
  if (o?.from && o.w < 1) {
    sample(o.from.c, o.from.t, !!o.from.loop, tmpW, tmpH);
    const w = Math.max(0, o.w);
    for (let i = 0; i < CL.nb; i++) W[i].copy(tmpW[i].slerp(W[i], w));
    vh.copy(tmpH.lerp(vh, w));
  }
  if (o?.look) {
    const iN = CL.names.indexOf('neck');
    const iH = CL.names.indexOf('Head');
    W[iN].premultiply(qLk.setFromAxisAngle(AX_X, -o.look * 0.4));
    W[iH].premultiply(qLk.setFromAxisAngle(AX_X, -o.look));
  }
  // (turn: rad, la cabeza y el cuello giran para su izquierda (+) o derecha
  // sobre el clip, como headY de las piezas: ui/LuisonArrival)
  if (o?.turn) {
    const iN = CL.names.indexOf('neck');
    const iH = CL.names.indexOf('Head');
    W[iN].premultiply(qLk.setFromAxisAngle(UP_C, o.turn * 0.45));
    W[iH].premultiply(qLk.setFromAxisAngle(UP_C, o.turn));
  }
  qY.setFromAxisAngle(UP_C, yaw);
  vb.copy(CL.hipsRest).sub(CL.feetMid).add(vh);
  if (o?.tilt) {
    qT.setFromAxisAngle(AX_X, o.tilt);
    for (let i = 0; i < CL.nb; i++) W[i].premultiply(qT);
    vb.applyQuaternion(qT);
  }
  for (let i = 0; i < CL.nb; i++) W[i].premultiply(qY);
  vb.applyQuaternion(qY);
  if (o?.snap && o.sw < 1) {
    const k = Math.max(0, o.sw);
    vb.x += x;
    vb.y += y;
    vb.z += z;
    vb.lerpVectors(o.snap.h, vb, k);
    vb.x -= x;
    vb.y -= y;
    vb.z -= z;
    for (let i = 0; i < CL.nb; i++) W[i].copy(qa.copy(o.snap.W[i]).slerp(W[i], k));
  }
  vb.x += x;
  vb.y += y;
  vb.z += z;
  for (let i = 0; i < CL.nb; i++) {
    const pi = CL.parent[i];
    G.cb[i].quaternion.copy(qa.copy(pi >= 0 ? W[pi] : T.armQ).invert()).multiply(W[i]);
  }
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  updateMW.call(G.root, true);
  const M = a.mats;
  for (let i = 0; i < 13; i++) M[i].multiplyMatrices(G.bones[PART_BONE[SWAP[i]]].matrixWorld, CL.OFF[SWAP[i]]);
  for (const [part, fore, hand] of HANDS_CLIP) {
    G.bones[hand].getWorldPosition(va);
    G.bones[fore].getWorldPosition(vc);
    va.addScaledVector(vc.subVectors(va, vc).normalize(), GRIP);
    M[part].decompose(vc, qa, vs);
    vc.copy(HAND_AT).applyQuaternion(qa);
    M[part].setPosition(va.sub(vc));
  }
  shieldOut(G);
  snapshot(G);
  return true;
}

// Algo puesto en la cabeza del gaucho (los anteojos del Canchero): obj se arma
// en el espacio de la malla (centímetros, +z adelante, +y arriba: como FACE) y
// queda colgado del hueso de la cabeza.
export function headProp(a, obj) {
  const G = a?.gs;
  if (!G?.on) return null;
  const sk = G.mesh.skeleton;
  const hi = sk.bones.findIndex((b) => b.name === 'Head');
  const wrap = new THREE.Group();
  wrap.matrixAutoUpdate = false;
  wrap.matrix.copy(sk.boneInverses[hi]).multiply(G.mesh.bindMatrix);
  wrap.add(obj);
  sk.bones[hi].add(wrap);
  return wrap;
}
export const FACE_EYES = { x: (FACE.eyeXR + FACE.eyeXL) / 2, y: FACE.eyeY, half: (FACE.eyeXR - FACE.eyeXL) / 2 };

// Al revés que poseCineClip con snap: el gaucho ya tomó su pose de siempre
// (piezas o los clips de los compañeros, net/Avatars) y se la mezcla desde
// `snap` (la pose del clip de escena que dejó), para que no salte al volver a
// caminar (ui/TowerCinematic). w: 0 = todo snap, 1 = la pose de ahora.
export function cineBlendFrom(a, snap, w) {
  const G = a?.gs;
  if (!G?.on || !snap || w >= 1 || !clipsReady()) return false;
  G.cb ||= CL.names.map((n) => G.bones[n]);
  G.cW ||= CL.names.map(() => new THREE.Quaternion());
  const W = G.cW;
  const k = Math.max(0, w);
  updateMW.call(G.root, true);
  for (let i = 0; i < CL.nb; i++) {
    G.cb[i].getWorldQuaternion(W[i]);
    W[i].copy(qa.copy(snap.W[i]).slerp(W[i], k));
  }
  G.bones.Hips.getWorldPosition(vb);
  vb.lerpVectors(snap.h, vb, k);
  for (let i = 0; i < CL.nb; i++) {
    const pi = CL.parent[i];
    G.cb[i].quaternion.copy(qa.copy(pi >= 0 ? W[pi] : T.armQ).invert()).multiply(W[i]);
  }
  G.bones.Hips.position.copy(vb).applyMatrix4(T.armInv);
  updateMW.call(G.root, true);
  const M = a.mats;
  for (let i = 0; i < 13; i++) M[i].multiplyMatrices(G.bones[PART_BONE[SWAP[i]]].matrixWorld, CL.OFF[SWAP[i]]);
  for (const [part, fore, hand] of HANDS_CLIP) {
    G.bones[hand].getWorldPosition(va);
    G.bones[fore].getWorldPosition(vc);
    va.addScaledVector(vc.subVectors(va, vc).normalize(), GRIP);
    M[part].decompose(vc, qa, vs);
    vc.copy(HAND_AT).applyQuaternion(qa);
    M[part].setPosition(va.sub(vc));
  }
  snapshot(G);
  return true;
}
