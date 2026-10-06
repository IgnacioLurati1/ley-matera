import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../lib/assets';
import { HITBOX } from './skeleton';

// Los jefes con cuerpo de verdad: un modelo con piel y huesos (Meshy: malla,
// textura y esqueleto; armado para el juego con las herramientas de
// tools/modelos) en lugar del cuerpo de piezas (entities/bossRig.js). El de
// piezas sigue haciendo todo lo de siempre (las poses, los impactos, la red,
// las escenas) pero no se dibuja: queda en la capa HIDE.
//
// Cada jefe que tiene modelo trae su archivo en entities/skins/<kind>.js (qué
// clip va en cada estado de la pelea y de sus escenas, y a qué tiempo) y sus
// cosas en public/assets/sotano/modelos/<dir>/: modelo.glb (en la pose de
// reposo del cuerpo de piezas: parado derecho, los brazos colgando; trae en
// userData.boss sus medidas y qué pieza mueve cada hueso) y clips.json (por
// cuadro, el giro de cada hueso en el espacio del modelo y lo que se mueve la
// cadera). Se bajan recién cuando ese jefe aparece.
//
// El modelo se mueve con capas que se funden (FADE s): los clips, puestos a
// tiempo por el archivo del jefe, o el cuerpo de piezas (el giro de cada hueso
// en el mundo es el de su pieza por el que tenía en reposo; los brazos del
// modelo suelen ser más largos, así que cuando la mano quedaría bajo el piso
// se dobla el codo). window.__bossSkinOff = true deja ver el de piezas.

const SKINS = {};
for (const mod of Object.values(import.meta.glob('./skins/*.js', { eager: true }))) {
  const sk = mod.default;
  if (sk?.kind) SKINS[sk.kind] = sk;
}
const DIR = '/assets/sotano/modelos/';
// de la cadera a la planta, en el cuerpo de piezas (skeleton.js: 0,43 + 0,45)
const RIG_LEG = 0.88;
const HIDE = 31;
const FADE = 0.3;

const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const tip = new THREE.Vector3();
const T = new THREE.Vector3();
const u = new THREE.Vector3();
const w = new THREE.Vector3();
const e = new THREE.Euler();
const pq = [];
const pp = [];
const ps = new THREE.Vector3();
for (let i = 0; i < 13; i++) {
  pq.push(new THREE.Quaternion());
  pp.push(new THREE.Vector3());
}
const T2 = new THREE.Vector3();
const FEET = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const cullM = new THREE.Matrix4();

// El recorte de un cuerpo con huesos (los jefes, el Cuervo, el Pombero, el
// Espantapájaros, el Chiqui): una esfera alrededor de un hueso del medio (la
// cadera), del tamaño del modelo quieto con margen (k). Sin recorte se dibujaba
// en todas las pasadas (el reflejo, la luna y las seis caras de cada farol)
// aunque estuviera atrás o lejos. cullList(root) al cargar; cada cuadro,
// después de mover los huesos, cullAt(list, el centro en el mundo); on false:
// sin recorte (calentándose abajo del piso tiene que entrar a las sombras).
// (la del modelo quieto es la de three con los huesos, en lo local de la
// malla: la de la geometría sola no sirve, los de Meshy traen otra escala en
// el nodo. Con los huesos en reposo y al día: root.updateMatrixWorld antes)
export function cullList(root, k = 1.5) {
  const out = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.boundingSphere = null;
    o.computeBoundingSphere();
    o.frustumCulled = false;
    out.push({ o, c: o.boundingSphere.center.clone(), r: o.boundingSphere.radius * k });
  });
  return out;
}
export function cullAt(list, at, on = true) {
  for (const C of list) {
    const o = C.o;
    o.frustumCulled = on;
    if (!on) continue;
    // (la esfera va en lo local de la malla: el centro, del mundo a lo local)
    o.boundingSphere.center.copy(at).applyMatrix4(cullM.copy(o.matrixWorld).invert());
    o.boundingSphere.radius = C.r;
  }
}

// Lo de cada jefe ya cargado (por kind).
const LOADED = {};

// La luz de los personajes. Con la luz pareja de los mapas de noche (mucho
// cielo y ambiente, poca luna) se veían "de plastilina": sin un lado
// iluminado ni uno a la sombra. A cada material con piel: menos luz pareja,
// una luz de la luna que marca el volumen (la dirección y el color, los de la
// luna del mapa; sin sombra) y un borde de luz. Uniforms compartidos: se
// ponen una vez por cuadro (updateSkinLight).
const AMB_K = 0.55;
const KEY_K = 1.3;
const RIM_K = 0.2;
const LOOK = {
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uKeyCol: { value: new THREE.Color(0) },
  uRimCol: { value: new THREE.Color(0) },
  uAmbK: { value: 1 },
};
// (opts: cuánto de cada cosa en este material, de 0 a 1: amb, key, rim; el ala
// del dragón, por ejemplo, con menos borde)
export function skinLook(m, { amb = 1, key = 1, rim = 1 } = {}) {
  if (!m || m.userData.skinLook) return;
  m.userData.skinLook = true;
  const mul = { value: new THREE.Vector3(amb, key, rim) };
  // (sobre lo que ya le haya puesto el archivo del jefe)
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, LOOK);
    sh.uniforms.uLookMul = mul;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uKeyDir;\nuniform vec3 uKeyCol;\nuniform vec3 uRimCol;\nuniform float uAmbK;\nuniform vec3 uLookMul;\nvoid main() {').replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
	reflectedLight.indirectDiffuse *= mix(1.0, uAmbK, uLookMul.x);
	float sKey = max(0.0, (dot(normal, uKeyDir) + 0.3) / 1.3);
	reflectedLight.directDiffuse += diffuseColor.rgb * uKeyCol * sKey * sKey * uLookMul.y;
	float sRim = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
	// (el borde, en los costados: lo que mira para arriba o para abajo, visto de
	// canto, no; si no, el ala del sombrero o el poncho quedaban con un brillo gris)
	totalEmissiveRadiance += uRimCol * sRim * sRim * sRim * uLookMul.z * (1.0 - 0.85 * abs(normal.y));`,
    );
  };
  m.customProgramCacheKey = () => prevKey() + '|skinLook';
  m.needsUpdate = true;
}
const kd = new THREE.Vector3();
export function updateSkinLight(g) {
  const moon = g?.world?.moon;
  const cam = g?.camera;
  if (!moon || !cam) return;
  // (window.__skinLookOff: la luz de antes, para comparar)
  const off = window.__skinLookOff;
  kd.copy(moon.position).sub(moon.target.position).normalize().transformDirection(cam.matrixWorldInverse);
  LOOK.uKeyDir.value.copy(kd);
  LOOK.uKeyCol.value.copy(moon.color).multiplyScalar(off ? 0 : moon.intensity * KEY_K);
  LOOK.uRimCol.value.copy(moon.color).multiplyScalar(off ? 0 : RIM_K);
  LOOK.uAmbK.value = off ? 1 : AMB_K;
}

// Un ojo encendido, como los de los muertos: la bolita del color del material
// (sin la luz del mapa; con el resplandor de la calidad alta brilla) metida en
// la cuenca (hacia el medio de la cabeza: si no, parecían lentes pegadas) y un
// halo que se ve en todas las calidades. o: la marca del ojo (cuelga de la
// cabeza), r: el radio en metros del modelo. (Para los cuerpos que se arman
// en otro lado: el Pombero, el Chiquitijuein, el dragón...)
const eyeGeo = new THREE.SphereGeometry(1, 12, 9);
export function glowEye(o, mat, r, dot) {
  const ws = 1 / o.getWorldScale(new THREE.Vector3()).x;
  const m = new THREE.Mesh(eyeGeo, mat);
  m.scale.set(1.25 * r * ws, 0.75 * r * ws, 0.75 * r * ws);
  // (para adentro, hacia el centro de la cabeza: asoma la mitad)
  m.position.copy(o.position).normalize().multiplyScalar(-0.55 * r * ws);
  m.frustumCulled = false;
  o.add(m);
  if (dot) {
    // (el mismo color que el ojo, que se prende y se apaga con él)
    const sm = new THREE.SpriteMaterial({ map: dot, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.32, toneMapped: false });
    sm.color = mat.color;
    const sp = new THREE.Sprite(sm);
    sp.scale.setScalar(6 * r * ws);
    sp.frustumCulled = false;
    o.add(sp);
  }
  return m;
}

// El Fast restart (Game.restart: buildScene) arma otra escena y otro jefe de
// piezas: lo cargado antes quedaba colgado de la escena vieja y el jefe no se
// veía (ni el modelo ni las piezas). Lo de otra escena se tira y se vuelve a
// cargar (el archivo ya está bajado).
function fresh(zs, k) {
  const S = LOADED[k];
  if (S && (S.scene !== zs.g.scene || S.zs !== zs)) {
    S.root?.removeFromParent();
    if (shown === S) shown = null;
    delete LOADED[k];
    if (window.__bossSkins?.[k] === S) delete window.__bossSkins[k];
  }
  return LOADED[k];
}

// Al tirar una escena (Game.disposeScene): lo cargado para ella se suelta. Si
// no, LOADED y window.__bossSkins dejaban vivo el mapa viejo entero (la escena,
// los zombies, el mundo) hasta que volvía a aparecer ese mismo jefe.
export function forgetBossSkins(scene) {
  for (const [k, S] of Object.entries(LOADED)) {
    if (S.scene !== scene) continue;
    // (su geometría y sus huesos: el modelo es de esta escena, sacado de ella
    // ya no lo suelta Game.disposeScene. globalThis.__mduNoBossFree: como antes)
    if (globalThis.__mduNoBossFree !== true)
      S.root?.traverse((o) => {
        o.geometry?.dispose();
        if (o.isSkinnedMesh) o.skeleton?.dispose();
      });
    S.root?.removeFromParent();
    if (shown === S) shown = null;
    WARM.delete(S);
    delete LOADED[k];
    if (window.__bossSkins?.[k] === S) delete window.__bossSkins[k];
  }
}

function load(zs, skin) {
  const S = {
    skin,
    state: 1,
    layers: [],
    v: 0,
    scene: zs.g.scene,
    zs,
    // las capas de ahora, para mirar (se arma cuando se pide, no cada cuadro)
    get mode() {
      return this.layers.map((L) => `${L.key}:${L.w.toFixed(2)}`).join(' ');
    },
  };
  LOADED[skin.kind] = S;
  const base = assetUrl(DIR + (skin.dir || skin.kind) + '/');
  // (el archivo del jefe puede pedir otro modelo y otros clips: skin.files() →
  // { glb, clips }; el Luisón de Blender, skins/luisonBlend.js)
  const F = skin.files?.() || {};
  const clips = fetch(base + (F.clips || 'clips.json')).then((r) => r.json());
  new GLTFLoader().load(
    base + (F.glb || 'modelo.glb'),
    async (gltf) => {
      const C = await clips;
      // (llegó tarde: ya hubo un Fast restart)
      if (LOADED[skin.kind] !== S) return;
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const bones = {};
      let meta = null;
      root.traverse((o) => {
        if (o.userData?.boss) meta = o.userData.boss;
        else if (o.userData?.luison) meta = o.userData.luison;
        if (o.isBone || o.name.startsWith('luEye') || o.name.startsWith('eye')) bones[o.name] = o;
        // (el material, como viene del GLB: el armado ya le deja rugosidad y metal)
        if (o.isMesh) {
          o.frustumCulled = false;
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      S.meta = meta;
      S.bones = bones;
      S.legLen = meta.thigh + meta.shin + meta.ankle;
      S.mid = new THREE.Vector3().fromArray(meta.legsMid);
      S.hipsRest = bones.Hips.getWorldPosition(new THREE.Vector3());
      // dónde pisa en reposo (el medio de los pies): con los clips, ese punto va
      // donde está el jefe (el origen del modelo suele quedar en otro lado)
      S.feetMid = new THREE.Vector3();
      const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].filter((n) => bones[n]);
      for (const n of feet) S.feetMid.add(bones[n].getWorldPosition(v));
      if (feet.length) S.feetMid.multiplyScalar(1 / feet.length);
      S.feetMid.y = 0;
      // los huesos que se mueven: los de los clips; de cada uno, su padre en la
      // lista, su pieza (si la tiene) y su giro de reposo (en el mundo y local)
      const rig = Object.fromEntries(meta.map.map(([n, p0, p1, k]) => [n, { p0, p1, k }]));
      S.list = C.bones.map((name) => {
        const bone = bones[name];
        return { name, bone, rig: rig[name] || null, rest: bone.getWorldQuaternion(new THREE.Quaternion()), restLocal: bone.quaternion.clone(), W: new THREE.Quaternion() };
      });
      for (const d of S.list) d.pi = S.list.findIndex((o) => o.bone === d.bone.parent);
      S.byName = Object.fromEntries(S.list.map((d) => [d.name, d]));
      S.arms = (meta.arms || []).map((names) => names.map((n) => S.byName[n]));
      S.nb = C.bones.length;
      S.fps = C.fps;
      S.clips = {};
      for (const [k, cl] of Object.entries(C.clips)) S.clips[k] = { ...cl, q: Float32Array.from(cl.q), hips: Float32Array.from(cl.hips) };
      // la cola (si tiene): cuelga y se menea
      S.tail = [];
      for (let i = 0; bones['luTail' + i] || bones['tail' + i]; i++) {
        const tb = bones['luTail' + i] || bones['tail' + i];
        S.tail.push({ bone: tb, rest: tb.quaternion.clone() });
      }
      S.tailPh = 0;
      // los ojos: los del cuerpo de piezas (el mismo material: se prenden igual)
      if (meta.eye) for (const [n, o] of Object.entries(bones)) if (/^(luEye|eye)[AB]$/.test(n)) glowEye(o, zs.bossRig.eyeMat, meta.eye, zs.g.textures?.dot);
      root.visible = false;
      // (escondido no se recorre cada cuadro: core/matrixCache.js mcSleep)
      root.mcSleep = !(globalThis.__mduNoMerge || globalThis.__mduNo1d);
      S.scene.add(root);
      S.root = root;
      S.cull = cullList(root);
      S.state = 2;
      skin.ready?.(S);
      // (la luz de los personajes, sobre lo que haya puesto el archivo del jefe;
      // skin.look: { amb, key, rim } de 0 a 1, para el que lo necesite)
      root.traverse((o) => {
        if (o.isSkinnedMesh) for (const m of [].concat(o.material)) skinLook(m, skin.look);
      });
      (window.__bossSkins ||= {})[skin.kind] = S;
      // que no trabe al aparecer (~100 ms el primer cuadro: subir la textura y
      // compilar sus programas): se compila ya y se dibuja un par de cuadros
      // escondido abajo del piso (las sombras y el G-buffer, en el cuadro de verdad)
      const Rr = zs.g.renderer;
      if (Rr) {
        root.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of [].concat(o.material)) for (const k in m) if (m[k]?.isTexture) Rr.initTexture(m[k]);
        });
        Rr.compileAsync?.(root, zs.g.camera, S.scene).catch(() => {});
      }
      S.warm = 6;
      WARM.add(S);
    },
    undefined,
    () => {
      // (sin el modelo, queda el de piezas)
      S.state = 3;
    },
  );
  return S;
}

// Los recién cargados que todavía no se dibujaron (ver load).
const WARM = new Set();
function warmUp(zs) {
  // (no durante la intro: con la luz de la escena la cuenta de luces es otra y
  // los programas que se compilan no sirven para el juego)
  if (zs.g.intro?.active) return;
  for (const S of WARM) {
    if (S.scene !== zs.g.scene || LOADED[S.skin.kind] !== S) {
      WARM.delete(S);
      continue;
    }
    // (el del jefe del mapa cuenta como a la vista aunque el jefe no esté:
    // solo se deja de calentar cuando aparece de verdad)
    if (S === shown && zs.bossRig?.rig.visible) {
      WARM.delete(S);
      continue;
    }
    if (S.warm-- > 0) {
      S.root.visible = true;
      cullAt(S.cull, null, false);
      // (abajo del piso: el del jugador y el de una lámpara, warmSpot)
      S.root.position.copy(warmSpot(zs.g, S.warm));
      S.root.updateMatrixWorld(true);
    } else {
      S.root.visible = false;
      WARM.delete(S);
    }
  }
}

// Dónde calentar un cuerpo con huesos (los jefes y el Cuervo, crowSkin.js)
// sin que se vea: muy abajo de la cámara (en la torre, unos metros abajo ya
// es el piso de abajo). Las sombras van guardadas (fx/Epic.js) y se rehacen
// solo cuando se pide: se pide en estos cuadros y, con k impar, también la de
// las lámparas prendidas. Estos cuerpos no se recortan por vista, así que
// entran igual a la sombra de la luna y a las de lámpara, y sus programas se
// compilan acá. Sin esto trababa la primera vez que aparecía o pasaba cerca de un fuego.
const warmAt = new THREE.Vector3();
export function warmSpot(g, k) {
  if (g.renderer?.shadowMap) g.renderer.shadowMap.needsUpdate = true;
  if (k % 2) for (const l of g.post?.epic?.pool || []) if (l.intensity > 0 && l.castShadow && l.shadow?.map) l.shadow.needsUpdate = true;
  const c = g.camera.position;
  return warmAt.set(c.x, c.y - 300, c.z);
}

// Las herramientas que usan los archivos de cada jefe.
export const clampT = (S, k, t) => Math.max(0, Math.min(S.clips[k].dur - 1e-3, t));
export function upFor(p, until) {
  const k = (x) => Math.max(0, Math.min(1, x));
  return k(p / 0.35) * k((until - p) / 0.4);
}

// Un cuadro de un clip: el giro de cada hueso (espacio del modelo) y la cadera.
function sample(S, key, t, out, hips) {
  const cl = S.clips[key];
  const loop = S.skin.loops?.includes(key);
  const f = Math.max(0, t) * S.fps;
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
  const nb = S.nb;
  for (let i = 0; i < nb; i++) {
    qa.fromArray(cl.q, (f0 * nb + i) * 4);
    qb.fromArray(cl.q, (f1 * nb + i) * 4);
    out[i].copy(qa).slerp(qb, al);
  }
  const h = cl.hips;
  hips.set(h[f0 * 3] + (h[f1 * 3] - h[f0 * 3]) * al, h[f0 * 3 + 1] + (h[f1 * 3 + 1] - h[f0 * 3 + 1]) * al, h[f0 * 3 + 2] + (h[f1 * 3 + 2] - h[f0 * 3 + 2]) * al);
}

// Dos huesos (hombro-codo-mano) para que la punta llegue al piso: gira el de
// arriba y el de abajo en el mundo (la mano va pegada al antebrazo).
function reach(S, up, lo, hand, handLen) {
  up.bone.getWorldPosition(a);
  lo.bone.getWorldPosition(b);
  hand.bone.getWorldPosition(c);
  tip.copy(c).sub(b).normalize().multiplyScalar(handLen).add(c);
  if (tip.y >= S.floor + 0.05) return;
  T.copy(tip);
  T.y = S.floor + 0.05;
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(tip);
  u.copy(T).sub(a);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, u.length()));
  u.normalize();
  // el codo, del lado donde ya estaba (lo que sobresale de la línea hombro-punta)
  w.copy(b).sub(a);
  w.addScaledVector(u, -w.dot(u));
  if (w.lengthSq() < 1e-6) w.set(0, 0, -1).addScaledVector(u, u.z);
  w.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  v.copy(u).multiplyScalar(cosA * l1).addScaledVector(w, sinA * l1).add(a);
  q.setFromUnitVectors(w.copy(b).sub(a).normalize(), u.copy(v).sub(a).normalize());
  // el antebrazo, después de girar el brazo: de donde apuntaba a donde tiene que apuntar
  w.copy(tip).sub(b).normalize().applyQuaternion(q);
  u.copy(a).addScaledVector(T2.copy(T).sub(a).normalize(), d).sub(v).normalize();
  q2.setFromUnitVectors(w, u).multiply(q);
  up.W.premultiply(q);
  lo.W.premultiply(q2);
  hand.W.premultiply(q2);
  for (const dd of [up, lo, hand]) dd.bone.quaternion.copy(S.list[dd.pi].W).invert().multiply(dd.W);
}

// las capas (una por fuente; la de arriba entra en FADE s y las demás se van)
function layer(S, key, t, dt) {
  let top = S.layers[S.layers.length - 1];
  // (el mismo clip que vuelve a empezar, un golpe atrás de otro: también se funde)
  const jump = top && top.key === key && t != null && !S.skin.loops?.includes(key) && Math.abs(t - (top.t + dt)) > 0.25;
  if (!top || top.key !== key || jump) {
    top = { key, t: 0, w: S.layers.length ? 0 : 1, W: S.list.map(() => new THREE.Quaternion()), hips: new THREE.Vector3() };
    S.layers.push(top);
  }
  return top;
}

let shown = null;

// Dónde está un hueso del modelo (en el mundo) si el jefe de ahora se ve con su
// cuerpo de verdad; si no, null (el que pregunta usa las piezas). Para lo que
// sale de la mano (la cadena de Gil) y cosas así.
// name puede ser un apodo del archivo del jefe (skin.alias: { whip: 'RightHand' }).
export function skinBoneAt(zs, name, out) {
  const S = shown;
  if (!S || S.state !== 2 || !S.root.visible || zs.bossRig?.kind !== S.skin.kind) return null;
  const b = S.bones[S.skin.alias?.[name] || name];
  return b ? b.getWorldPosition(out) : null;
}

// El golpe de los jefes con cuerpo de verdad que lo piden (skin.hitSkin): las
// cajas de golpe de las piezas (skeleton.js HITBOX, las mismas medidas y las
// mismas zonas: la cabeza sigue siendo cabeza) puestas sobre el modelo que se
// ve, cada una a lo largo de su hueso (del hueso al de abajo) y girada como
// él. Francisco volando (la cadera arriba, echado adelante, los brazos
// abiertos) se veía en un lado y los tiros le pegaban a las piezas, que
// seguían caminando en el piso (el usuario, 2026-10-05).
// globalThis.__mduNoSkinHit: como antes (las piezas).
// [pieza, hueso, hueso de abajo, hasta la punta de la mano]
const HIT_SEG = [
  [0, 'Hips', 'Spine01'],
  [1, 'Spine02', 'neck'],
  [2, 'Head', 'head_end'],
  [3, 'RightArm', 'RightForeArm'],
  [4, 'LeftArm', 'LeftForeArm'],
  [5, 'RightForeArm', 'RightHand', 1],
  [6, 'LeftForeArm', 'LeftHand', 1],
  [7, 'RightUpLeg', 'RightLeg'],
  [8, 'LeftUpLeg', 'LeftLeg'],
  [9, 'RightLeg', 'RightFoot'],
  [10, 'LeftLeg', 'LeftFoot'],
];
const HB = {};
for (const hb of HITBOX) HB[hb.part] = hb;
const hitBoxes = [];
const ho = new THREE.Vector3();
const hd = new THREE.Vector3();
const hq = new THREE.Quaternion();
// Las cajas de ahora (en el mundo): { part, c, q, h } (h: las medias medidas, en m).
// null si no corre (otro jefe, sin modelo, apagado).
export function skinHitBoxes(zs, z) {
  const S = shown;
  if (globalThis.__mduNoSkinHit || !S || !S.skin.hitSkin || S.state !== 2 || !S.root.visible) return null;
  if (!z || zs.boss !== z || zs.bossRig?.kind !== S.skin.kind) return null;
  // (los huesos de la punta no siempre son huesos: head_end se busca por nombre)
  if (!S.hitSeg) {
    S.hitSeg = [];
    for (const [part, A, B, tip] of HIT_SEG) {
      const d = S.byName[A];
      const b = S.bones[B] || S.root.getObjectByName(B);
      if (d && b && HB[part]) S.hitSeg.push({ part, d, b, tip: !!tip, hb: HB[part], box: { part, c: new THREE.Vector3(), q: new THREE.Quaternion(), h: [0, 0, 0] } });
    }
  }
  const ps = z.scale || 1;
  const s = S.root.scale.x;
  hitBoxes.length = 0;
  for (const H of S.hitSeg) {
    const box = H.box;
    // (las del mundo ya están: updateBossSkin las pone al día al final del cuadro)
    a.setFromMatrixPosition(H.d.bone.matrixWorld);
    b.setFromMatrixPosition(H.b.matrixWorld);
    const len = a.distanceTo(b);
    // (el antebrazo llega hasta la punta de la mano, como la pieza)
    if (H.tip && len > 1e-4) b.addScaledVector(c.copy(b).sub(a).normalize(), (S.meta.hand || 0.2) * s);
    box.c.copy(a).add(b).multiplyScalar(0.5);
    // girada como la pieza que la mueve: el giro del hueso por el que tenía en reposo
    H.d.bone.matrixWorld.decompose(T2, hq, w);
    box.q.copy(hq).multiply(q.copy(H.d.rest).invert());
    box.h[0] = H.hb.h[0] * ps;
    box.h[1] = Math.max(H.hb.h[1] * ps, a.distanceTo(b) * 0.5);
    box.h[2] = H.hb.h[2] * ps;
    hitBoxes.push(box);
  }
  return hitBoxes;
}

// El tiro (o, d, maxT) contra esas cajas: { t, part, zone, arm, leg } o null;
// undefined si no corre (el que pregunta usa las piezas).
export function skinHit(zs, z, o, d, maxT) {
  const list = skinHitBoxes(zs, z);
  if (!list) return undefined;
  let best = null;
  for (const box of list) {
    if (z.hidden & (1 << box.part)) continue;
    q.copy(box.q).invert();
    ho.copy(o).sub(box.c).applyQuaternion(q);
    hd.copy(d).applyQuaternion(q);
    const t = slabT(ho, hd, box.h);
    if (t === null || t > maxT || (best && t >= best.t)) continue;
    const hb = HB[box.part];
    let zone = hb.zone;
    // (lo de arriba del pecho es el cuello, como en las piezas: 0,08 de la caja)
    if (zone === 'torso' && ho.y + hd.y * t > box.h[1] - 0.08 * (z.scale || 1)) zone = 'neck';
    best = { t, part: box.part, zone, arm: hb.arm, leg: hb.leg };
  }
  return best;
}
function slabT(o, d, h) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const k of ['x', 'y', 'z']) {
    const i = k === 'x' ? 0 : k === 'y' ? 1 : 2;
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < -h[i] || o[k] > h[i]) return null;
      continue;
    }
    let t1 = (-h[i] - o[k]) / d[k];
    let t2 = (h[i] - o[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return Math.max(0, tmin);
}

// Baja de antes el modelo de un jefe (al empezar su pelea o su escena), así
// no se ve el de piezas mientras carga.
// (kind: uno o una lista; los que no tienen modelo se ignoran)
export function preloadBossSkin(zs, kind) {
  for (const k of Array.isArray(kind) ? kind : [kind]) {
    // (el Cuervo tiene lo suyo: entities/crowSkin.js; se vuelve a calentar
    // con las luces de ahora, la de su ronda)
    if (k === 'crow') {
      const C = zs?.g?.crow;
      if (C?.skin?.state === 2 && !C.rig.visible) C.skin.warm();
      continue;
    }
    const skin = SKINS[k];
    if (!skin || !zs?.g?.scene || !zs.bossRig) continue;
    const S = fresh(zs, k);
    if (!S) load(zs, skin);
    else if (S.state === 2 && (S !== shown || !zs.bossRig.rig.visible) && !WARM.has(S)) {
      // ya estaba: se vuelve a calentar con las luces de ahora (la ronda del jefe)
      S.warm = 6;
      WARM.add(S);
    }
  }
}

// En la carga (ui/Arrival.load): el modelo del jefe de ronda bajado y, mientras
// se compila el mapa, a la vista abajo del piso (sombras y G-buffer incluidos).
// Antes bajaba recién con Rounds.start, al arrancar: compilaba en el primer
// segundo de la partida. show(true/false) lo pone y lo saca.
export async function readyBossSkins(zs, kinds, ms = 5000) {
  const list = [];
  for (const k of [].concat(kinds || [])) {
    if (!SKINS[k] || !zs?.g?.scene || !zs.bossRig) continue;
    preloadBossSkin(zs, k);
    const S = fresh(zs, k);
    if (S) list.push(S);
  }
  const t0 = performance.now();
  while (list.some((S) => S.state === 1) && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
  const ok = list.filter((S) => S.state === 2 && S.root);
  return {
    list: ok,
    show(on) {
      for (const S of ok) {
        if (S === shown && zs.bossRig?.rig.visible) continue;
        S.root.visible = on;
        if (!on) continue;
        cullAt(S.cull, null, false);
        S.root.position.copy(warmSpot(zs.g, 1));
        S.root.updateMatrixWorld(true);
      }
    },
  };
}

// Cada cuadro, después de que Zombies.render acomodó las piezas del jefe.
export function updateBossSkin(zs, dt) {
  updateSkinLight(zs.g);
  if (WARM.size) warmUp(zs);
  const R = zs.bossRig;
  if (!R) return;
  const skin = SKINS[R.kind];
  const off = window.__bossSkinOff;
  // (el de piezas vuelve a verse si no hay modelo para este jefe)
  let S = skin && !off ? fresh(zs, skin.kind) : null;
  if (skin && !off && !S && R.rig.visible) S = load(zs, skin);
  const on = !!S && S.state === 2;
  if (shown && shown !== S) {
    shown.root.visible = false;
    shown.layers.length = 0;
  }
  // el de piezas, escondido solo mientras se ve un modelo (si el jefe nuevo no
  // tiene, o se apaga con __bossSkinOff, vuelve a verse)
  if (on !== !!R.skinHidden || (on && shown !== S)) {
    R.rig.traverse((o) => o.layers.set(on ? HIDE : 0));
    R.skinHidden = on;
    if (S) S.handPart = null;
  }
  shown = on ? S : null;
  if (!on) return;
  const root = S.root;
  if (!R.rig.visible) {
    S.layers.length = 0;
    // (calentándose abajo del piso sigue a la vista: warmUp)
    if (!WARM.has(S)) root.visible = false;
    return;
  }
  root.visible = true;
  const parts = R.parts;
  for (let i = 0; i < 13; i++) parts[i].matrix.decompose(pp[i], pq[i], i === 0 ? ps : v);
  const s = (RIG_LEG * ps.y) / S.legLen;
  // quién: el jefe de la pelea o el títere de una escena (lo dice el archivo del jefe)
  const zb = zs.boss;
  const boss = zb && zb.kind === skin.kind ? zb : null;
  const cine = boss ? null : skin.puppet?.(zs.g) || null;
  const z = boss || cine?.who || null;
  // lo rápido que va de verdad
  if (z?.pos) {
    if (S.last && dt > 0) {
      const sp = Math.hypot(z.pos.x - S.last.x, z.pos.z - S.last.z) / dt;
      S.v += (Math.min(30, sp) - S.v) * Math.min(1, dt * 6);
    }
    (S.last ||= new THREE.Vector3()).copy(z.pos);
  } else S.last = null;

  // qué quiere hacer y las capas
  const ctx = { S, dt, s, g: zs.g, zs };
  let want = { key: 'rig' };
  if (boss) want = skin.pick(boss, ctx) || want;
  else if (cine) want = skin.cine(cine, ctx) || want;
  if (want.key !== 'rig' && !S.clips[want.key]) want = { key: 'rig' };
  // (escondido: ni el modelo ni las piezas; el que lo pide sabe por qué, la escena)
  if (want.hidden) {
    root.visible = false;
    S.layers.length = 0;
    S.last = null;
    return;
  }
  S.up = (S.up || 0) + ((want.up || 0) - (S.up || 0)) * Math.min(1, dt * 10);
  const top = layer(S, want.key, want.t, dt);
  // (sin subir: el salto de una escena que ya lleva el arco; queda en la capa aunque se vaya)
  if (want.flat) top.flat = true;
  // (want.fade: cuánto tarda en entrar esta capa; si no, FADE)
  if (want.fade && top.w < 1) top.fade = want.fade;
  for (const L of S.layers) {
    if (L !== top) L.t += dt;
    else if (want.t == null) L.t += dt;
    else L.t = want.t;
  }
  top.w = Math.min(1, top.w + dt / (top.fade || FADE));
  const others = S.layers.reduce((acc, L) => acc + (L === top ? 0 : L.w), 0);
  for (const L of S.layers) if (L !== top) L.w = others > 0 ? (L.w / others) * (1 - top.w) : 0;
  S.layers = S.layers.filter((L) => L === top || L.w > 1e-3);

  // cada capa: los giros en el mundo y dónde va la cadera
  const floorY = z ? z.baseY || 0 : 0;
  qYaw.setFromAxisAngle(UP, z ? z.yaw || 0 : 0);
  let rigW = 0;
  for (const L of S.layers) {
    if (L.key === 'rig') {
      rigW += L.w;
      for (let i = 0; i < S.list.length; i++) {
        const d = S.list[i];
        const W = L.W[i];
        if (d.rig) {
          if (d.rig.p1 == null) W.copy(pq[d.rig.p0]);
          else W.copy(pq[d.rig.p0]).slerp(pq[d.rig.p1], d.rig.k);
          W.multiply(d.rest);
        } else if (d.pi >= 0) W.copy(L.W[d.pi]).multiply(d.restLocal);
        else W.copy(d.rest);
      }
      // (la cadera: que el medio de los dos muslos caiga en las caderas de las piezas)
      v.set(0, -0.03 * ps.y, 0).applyQuaternion(pq[0]).add(pp[0]);
      L.hips.copy(S.mid).applyQuaternion(pq[0]).multiplyScalar(-s).add(v);
    } else {
      sample(S, L.key, L.t, L.W, v);
      if (L.flat) v.y = Math.min(v.y, 0);
      for (const W of L.W) W.premultiply(qYaw);
      L.hips.copy(S.hipsRest).sub(S.feetMid).add(v).multiplyScalar(s).applyQuaternion(qYaw);
      L.hips.x += z ? z.pos.x : 0;
      L.hips.y += floorY;
      L.hips.z += z ? z.pos.z : 0;
    }
  }
  // mezcladas
  const L0 = S.layers[0];
  let acc = L0.w;
  for (let i = 0; i < S.list.length; i++) S.list[i].W.copy(L0.W[i]);
  const hipsW = T.copy(L0.hips);
  for (let j = 1; j < S.layers.length; j++) {
    const L = S.layers[j];
    acc += L.w;
    const k = acc > 0 ? L.w / acc : 1;
    for (let i = 0; i < S.list.length; i++) S.list[i].W.slerp(L.W[i], k);
    hipsW.lerp(L.hips, k);
  }
  // la cabeza para arriba (el aullido a la luna, un grito al cielo): cuello y
  // cabeza, alrededor del eje de los hombros
  if (S.up > 0.01 && skin.upAngle) {
    const ax = v.set(1, 0, 0).applyQuaternion(qYaw);
    qa.setFromAxisAngle(ax, -skin.upAngle * S.up * (skin.upNeck ?? 0.4));
    qb.setFromAxisAngle(ax, -skin.upAngle * S.up);
    if (S.byName.neck) S.byName.neck.W.premultiply(qa);
    if (S.byName.Head) S.byName.Head.W.premultiply(qb);
  }
  // lo propio de cada jefe sobre la mezcla (piernas colgando, la mirada...):
  // los giros en el mundo (S.list[i].W) y la cadera (hipsW), antes de escribirlos
  skin.adjust?.(S, ctx, z, qYaw, hipsW);
  root.position.set(hipsW.x, floorY, hipsW.z);
  root.quaternion.identity();
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const hips = S.list[0];
  hips.bone.position.copy(hips.bone.parent.worldToLocal(v.copy(hipsW)));
  for (const d of S.list) {
    if (d.pi >= 0) d.bone.quaternion.copy(S.list[d.pi].W).invert().multiply(d.W);
    else d.bone.quaternion.copy(d.bone.parent.getWorldQuaternion(q)).invert().multiply(d.W);
  }
  // con los pies en su altura: lo más bajo de los pies justo en floorY (el arco
  // de un salto que lleva la escena, o para que no quede flotando)
  if (want.feet) {
    let low = Infinity;
    for (const nm of FEET) if (S.bones[nm]) low = Math.min(low, S.bones[nm].getWorldPosition(a).y);
    if (low < Infinity) {
      hipsW.y += floorY - low + (S.meta.sole || 0) * s;
      hips.bone.position.copy(hips.bone.parent.worldToLocal(v.copy(hipsW)));
    }
  }
  // clavado: el medio de los pies justo donde está (arriba de una piedra chica)
  if (want.pin && z?.pos) {
    let n = 0;
    c.set(0, 0, 0);
    for (const nm of FEET) if (S.bones[nm]) { c.add(S.bones[nm].getWorldPosition(a)); n++; }
    if (n) {
      c.multiplyScalar(1 / n);
      hipsW.x += z.pos.x - c.x;
      hipsW.z += z.pos.z - c.z;
      hips.bone.position.copy(hips.bone.parent.worldToLocal(v.copy(hipsW)));
    }
  }
  // la cola: cuelga y se menea (más cuando corre). La fase se va sumando (con
  // la frecuencia cambiando, sin(t·f) salta)
  if (S.tail.length) {
    const fast = Math.min(1, S.v / 5);
    S.fast = (S.fast || 0) + (fast - (S.fast || 0)) * Math.min(1, dt * 3);
    S.tailPh += dt * (2.2 + S.fast * 2.6);
    const ph = S.tailPh;
    for (let i = 0; i < S.tail.length; i++) {
      const k = i / Math.max(1, S.tail.length - 1);
      e.set(Math.sin(ph * 0.8 - i * 0.5) * 0.05 * (0.4 + k) + (i ? 0.08 : 0) - (i === 0 ? S.fast * 0.25 : 0), 0, Math.sin(ph - i * 0.6) * (0.1 + S.fast * 0.04) * (0.3 + k));
      S.tail[i].bone.quaternion.copy(S.tail[i].rest).multiply(q.setFromEuler(e));
    }
  }
  // con el cuerpo de piezas: las manos no se meten en el piso
  if (rigW > 0.3 && S.arms.length) {
    S.floor = Math.min(z ? floorY : Infinity, pp[11].y, pp[12].y);
    const hand = (S.meta.hand || 0.2) * s;
    for (const [up, lo, hd] of S.arms) reach(S, up, lo, hd, hand);
  }
  // lo que lleva en la mano (el tridente del Mandinga, la pala del Capataz...):
  // la pieza de las piezas que lo tiene sigue a la mano del modelo y se ve.
  // Como una lanza: las puntas (el -y de la pieza) hacia donde apunta el
  // antebrazo; con el brazo colgando, parada con las puntas arriba. grip: por
  // dónde lo agarra (desde el medio de la pieza, en su largo).
  if (skin.hand && R.parts[skin.hand.part]) {
    const H = skin.hand;
    const part = R.parts[H.part];
    const fore = S.bones[H.fore];
    const hb = S.bones[H.bone];
    if (fore && hb) {
      hb.getWorldPosition(a);
      fore.getWorldPosition(b);
      u.copy(a).sub(b).normalize();
      // (colgando: parado, un poco para adelante)
      // (upright: false para un sable, que cuelga con la hoja para abajo)
      // (want.staff: parado como un bastón aunque bracee: el tridente andando)
      const hang = want.staff ? 1 : H.upright === false ? 0 : Math.min(1, Math.max(0, (-u.y - 0.3) / 0.4));
      w.set(0, 1, 0).addScaledVector(v.set(0, 0, 1).applyQuaternion(qYaw), 0.25).normalize();
      u.lerp(w, hang).normalize();
      // el puño, un poco más allá de la muñeca
      a.addScaledVector(v.copy(a).sub(b).normalize(), (H.fist ?? 0.08) * s);
      qa.setFromUnitVectors(v.set(0, -1, 0), u);
      a.addScaledVector(u, (H.grip ?? 0.3) * ps.y);
      part.matrix.compose(a, qa, w.set(ps.y, ps.y, ps.y));
      part.matrixWorldNeedsUpdate = true;
      if (S.handPart !== part) {
        part.traverse((o) => o.layers.set(0));
        S.handPart = part;
      }
    }
  }
  // (todo junto, una vez: lo de arriba lee los huesos con getWorldPosition, que
  // pone al día solo su cadena)
  root.updateMatrixWorld(true);
  cullAt(S.cull, hips.bone.getWorldPosition(c));
  // y al final (lo que cuelga del modelo ya puesto: aureolas, brillos...)
  skin.after?.(S, ctx, z);
}
