import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/assets';
import { skinLook, cullList, cullAt } from '../entities/bossSkin';
import { chiquiBlendOn, loadChiquiBlend, chiquiTaps } from './chiquiBlend';

// El Chiquitijuein: un duende como los del norte (no llega al metro), casi
// todo sombrero. Poncho oscuro con guarda y flecos, piernitas flacas, brazos
// largos que le llegan a las rodillas y una bombilla de alpaca más alta que él
// que usa de bastón. La cara queda en la sombra del ala: solo se ven dos
// puntitos colorados... y, si se da vuelta, una sonrisa finita de dientitos.
//
// Lo usan la cinemática del final (ui/TowerCinematic.js) y las apariciones en
// la explanada durante la partida (ChiquiSightings, desde world/Tower.js).
//
// Con el cuerpo de verdad (el modelo de Meshy, más abajo: "el cuerpo de
// verdad") las piezas se esconden y quedan los brillos de los ojos, el humo,
// la sombra y el bastón (que va en la mano). Lo de afuera sigue igual: la
// cabeza (rotation/lookAt) gira la cabeza del modelo, y los clips van solos
// (parado, caminando o corriendo según lo que se mueve la raíz) o los pide el
// que lo usa con act()/mode.

// El poncho: lana negra con la guarda colorada y ocre cerca del borde.
function ponchoTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#17110d';
  x.fillRect(0, 0, 64, 128);
  // la trama de la lana
  for (let i = 0; i < 128; i += 2) {
    x.fillStyle = i % 4 ? 'rgba(0,0,0,0.25)' : 'rgba(60,44,32,0.18)';
    x.fillRect(0, i, 64, 1);
  }
  // la guarda: dos bandas coloradas con una de guardas ocres en el medio
  x.fillStyle = '#4a0c08';
  x.fillRect(0, 98, 64, 5);
  x.fillRect(0, 115, 64, 5);
  x.fillStyle = '#6a4a1c';
  for (let i = 0; i < 64; i += 8) {
    x.beginPath();
    x.moveTo(i, 112);
    x.lineTo(i + 4, 105);
    x.lineTo(i + 8, 112);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

// Arma el bicho mirando a +z. `tex` son las texturas del juego (usa `dot`).
export function buildChiqui(tex) {
  const root = new THREE.Group();
  const M = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 1 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x100c0a, roughness: 0.95, side: THREE.DoubleSide });
  const cloth = new THREE.MeshStandardMaterial({ map: ponchoTexture(), roughness: 1, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.45, metalness: 0.9 });
  // las piernitas y las alpargatas
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.3, 6), M);
    leg.position.set(s * 0.07, 0.15, 0);
    root.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.12), M);
    foot.position.set(s * 0.075, 0.018, 0.03);
    root.add(foot);
  }
  // el cuerpo, flaquito, debajo del poncho
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 8), M);
  body.position.y = 0.5;
  root.add(body);
  // el poncho: hombros anchos y cae derecho hasta las rodillas, con las
  // puntas de los costados más largas (por encima de los brazos) y flecos
  const prof = [[0.03, 0.8], [0.15, 0.78], [0.22, 0.72], [0.25, 0.52], [0.28, 0.27]].map(([r, y]) => new THREE.Vector2(r, y));
  const ponchoGeo = new THREE.LatheGeometry(prof, 16);
  const pos = ponchoGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.5) continue;
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    // los costados (x) caen más que adelante y atrás
    pos.setY(i, y - Math.abs(Math.cos(a)) ** 2 * 0.09 * ((0.5 - y) / 0.23));
  }
  ponchoGeo.computeVertexNormals();
  const poncho = new THREE.Mesh(ponchoGeo, cloth);
  root.add(poncho);
  const fringe = new THREE.BoxGeometry(0.008, 0.05, 0.008);
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const drop = Math.abs(Math.cos(a)) ** 2 * 0.09;
    const f = new THREE.Mesh(fringe, cloth);
    f.position.set(Math.cos(a) * 0.285, 0.245 - drop, Math.sin(a) * 0.285);
    poncho.add(f);
  }
  // la cabeza (con el sombrero, los ojos y la sonrisa) gira aparte del cuerpo
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.01);
  root.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), M));
  // el sombrero aludo: ala enorme que se cae en las puntas y copa baja
  const hat = new THREE.Group();
  hat.position.y = 0.075;
  hat.rotation.x = 0.05;
  head.add(hat);
  const brim = new THREE.LatheGeometry([[0.1, 0.012], [0.2, 0.008], [0.3, -0.008], [0.38, -0.04], [0.42, -0.075]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    const r = Math.hypot(bp.getX(i), bp.getZ(i));
    // el ala ondulada, más caída adelante (tapa los ojos)
    bp.setY(i, bp.getY(i) - Math.max(0, r - 0.2) * (0.12 * Math.sin(a * 3) + 0.1 * Math.max(0, Math.sin(a))));
  }
  brim.computeVertexNormals();
  hat.add(new THREE.Mesh(brim, hatMat));
  const crown = new THREE.LatheGeometry([[0.105, 0.005], [0.12, 0.06], [0.115, 0.13], [0.09, 0.165], [0.03, 0.15], [0, 0.155]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  hat.add(new THREE.Mesh(crown, hatMat));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.117, 0.028, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a0806, roughness: 0.9, side: THREE.DoubleSide }));
  band.position.y = 0.03;
  hat.add(band);
  // los ojos: dos chispas coloradas en la sombra del ala (y su resplandor)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3018, toneMapped: false });
  const eyes = [];
  const glows = [];
  for (const [s, r] of [[-1, 0.014], [1, 0.012]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), eyeMat);
    e.position.set(s * 0.042, -0.005, 0.112);
    head.add(e);
    eyes.push(e);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    gl.scale.setScalar(0.06);
    gl.position.copy(e.position).setZ(0.13);
    head.add(gl);
    glows.push(gl);
  }
  // un resplandor colorado debajo del ala: de lejos es lo único que se ve
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  halo.scale.setScalar(0.9);
  halo.position.set(0, 0.02, 0.12);
  head.add(halo);
  // la sonrisa: una raya finita de dientitos, de oreja a oreja
  const smile = new THREE.Group();
  const toothMat = new THREE.MeshBasicMaterial({ color: 0xbfb4a0, transparent: true, opacity: 0, toneMapped: false });
  const tooth = new THREE.BoxGeometry(0.0075, 0.014, 0.004);
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 2.2;
    const t = new THREE.Mesh(tooth, toothMat);
    t.position.set(Math.sin(a) * 0.07, -0.05 + (1 - Math.cos(a)) * 0.028, 0.098 + Math.cos(a) * 0.01);
    t.rotation.set(0, a * 0.6, a * 0.35);
    smile.add(t);
  }
  head.add(smile);
  // los brazos: flacos y largos, con tres dedos cada uno, saliendo del poncho
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.2, 0.56, 0.05);
    arm.rotation.z = s * 0.1;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 6), M);
    bone.position.y = -0.21;
    arm.add(bone);
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.1, 4), M);
      finger.position.set((f - 1) * 0.011, -0.46, 0.01);
      finger.rotation.set(0.25, 0, (f - 1) * 0.35);
      arm.add(finger);
    }
    root.add(arm);
    arms.push(arm);
  }
  // el bastón: una bombilla vieja, más alta que él
  const staff = new THREE.Group();
  staff.position.set(0.27, 0, 0.1);
  staff.rotation.z = -0.06;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.3, 8), metal);
  pipe.position.y = 0.65;
  staff.add(pipe);
  const filter = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), metal);
  filter.scale.set(1, 0.4, 1.3);
  filter.position.y = 0.03;
  staff.add(filter);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.12, 8), metal);
  mouth.position.set(-0.03, 1.33, 0);
  mouth.rotation.z = 0.7;
  staff.add(mouth);
  root.add(staff);
  // la mano derecha va agarrada al bastón
  arms[1].rotation.set(-0.05, 0, -0.3);
  // una calabacita vacía colgando del cinto
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }));
  gourd.scale.set(1, 1.2, 1);
  gourd.position.set(-0.19, 0.3, 0.14);
  root.add(gourd);
  // las piezas (se esconden cuando llega el cuerpo de verdad)
  const proc = [];
  root.traverse((o) => {
    if (o.isMesh && !staff.getObjectById(o.id)) proc.push(o);
  });
  // la sombra
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.dot, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }));
  shadow.position.y = 0.012;
  root.add(shadow);
  // humo oscuro que se le escapa del poncho
  const wisps = [];
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0x0a0605, transparent: true, opacity: 0, depthWrite: false }));
    w.userData.p = Math.random();
    w.userData.a = Math.random() * Math.PI * 2;
    root.add(w);
    wisps.push(w);
  }
  const R = {
    root,
    head,
    eyes,
    glows,
    smile,
    toothMat,
    halo,
    arms,
    staff,
    wisps,
    eyeK: 1,
    // el cuerpo de verdad (null hasta que llega) y lo que se le pide:
    // idle (el clip de parado), auto (false: no camina ni corre solo), mode
    // (un clip que queda puesto; si no es de los que se repiten, se queda en
    // el último cuadro)
    skin: null,
    idle: 'idle',
    auto: true,
    mode: null,
    M0: M,
    proc,
    // Un clip de una vez (o uno de los que se repiten, por `until` segundos):
    // at = desde dónde, delay = cuánto espera antes, rate, hold = se queda en
    // el último cuadro hasta stop().
    act(name, o = {}) {
      this.one = { name, t: o.at || 0, wait: o.delay || 0, rate: o.rate ?? 1, hold: !!o.hold, until: o.until ?? null };
    },
    stop() {
      this.one = null;
    },
    one: null,
    // Cuando llega el cuerpo de verdad (o ya, si ya está).
    onSkin(cb) {
      if (this.skin) cb(this);
      else (this.skinWait ||= []).push(cb);
    },
    // Cada cuadro: los ojos parpadean, el humo sube y el poncho respira.
    update(dt, t) {
      driveSkin(this, dt);
      // parpadea... salvo cuando te mira fijo
      const blink = this.eyeK < 1.05 && (Math.sin(t * 1.7) > 0.985 || Math.sin(t * 2.9 + 1) > 0.992) ? 0 : 1;
      for (const e of this.eyes) e.visible = !this.skin && blink > 0;
      for (const gl of this.glows) gl.material.opacity = blink * Math.min(1, 0.5 + this.eyeK * 0.35) * (0.85 + Math.sin(t * 9) * 0.1);
      poncho.scale.set(1 + Math.sin(t * 2.1) * 0.012, 1, 1 + Math.sin(t * 2.1) * 0.012);
      for (const w of this.wisps) {
        w.userData.p = (w.userData.p + dt * 0.35) % 1;
        const p = w.userData.p;
        const a = w.userData.a + t * 0.4;
        w.position.set(Math.cos(a) * (0.2 + p * 0.25), 0.05 + p * 0.9, Math.sin(a) * (0.2 + p * 0.25));
        w.scale.setScalar(0.25 + p * 0.5);
        w.material.opacity = Math.sin(p * Math.PI) * 0.3;
      }
    },
  };
  // el cuerpo de verdad: ya, si está bajado; si no, cuando llegue
  if (SK.gltf) attachSkin(R);
  else loadChiquiSkin()?.then((gl) => gl && attachSkin(R));
  return R;
}

// ---------------- el cuerpo de verdad ----------------
// El Chiquitijuein de Meshy: la malla con piel y esqueleto, las texturas PBR
// y los clips de su biblioteca (armado fuera del juego: tools/modelos). Trae
// en userData.chiqui las medidas: los ojos, la mano del bastón, lo que dura y
// lo que avanza cada clip, el momento del golpe de los de una vez y dónde van
// las gemas del coloso. Se baja con el primero que se arma y lo comparten
// todos (cada uno con su copia del esqueleto).
const SKIN_URL = '/assets/sotano/modelos/chiqui/modelo.glb';
const SK = { p: null, gltf: null, meta: null, hat: null };
const FADE = 0.25;
// cuándo camina y cuándo corre (lo que avanza la raíz, en alturas del bicho por segundo)
const WALK_V = 0.08;
const RUN_ON = 0.95;
const RUN_OFF = 0.7;

export function loadChiquiSkin() {
  if (typeof window !== 'undefined' && window.__chiquiSkinOff) return null;
  SK.p ||= new Promise((ok) => {
    new GLTFLoader().load(
      assetUrl(SKIN_URL),
      (gl) => {
        gl.scene.traverse((o) => {
          if (o.userData?.chiqui) SK.meta = o.userData.chiqui;
          if (o.name === 'sombrero') SK.hat = o;
          // (la luz de los personajes: entities/bossSkin.js skinLook)
          else if (o.isSkinnedMesh) skinLook(o.material);
        });
        SK.clips = Object.fromEntries(gl.animations.map((c) => [c.name, c]));
        // (sin el lector: guardaba el archivo entero en memoria entre mapas)
        gl.parser = null;
        // los clips de Blender (world/chiquiBlend.js) en lugar de los de Meshy con el mismo nombre;
        // SK.gltf recién cuando están (el agarre del bastón sale del primer cuadro de 'idle')
        const done = () => {
          SK.gltf = gl;
          ok(gl);
        };
        if (!chiquiBlendOn()) return done();
        loadChiquiBlend(gl).then((B) => {
          if (B && SK.meta) {
            Object.assign(SK.clips, B.clips);
            for (const [k, m] of Object.entries(B.meta)) SK.meta.clips[k] = { ...(SK.meta.clips[k] || {}), ...m };
            SK.blend = B;
          }
          done();
        });
      },
      undefined,
      () => ok(null),
    );
  });
  return SK.p;
}

// Las medidas del modelo (null hasta que llega).
export const chiquiMeta = () => SK.meta;

// El sombrero suelto del modelo (para el final: queda tirado en la plaza), con
// el origen en el medio de la base de la copa. null si el modelo no está.
// (como el de piezas: el ala derecha y las puntas 0,075 abajo del origen)
export function chiquiHat() {
  if (!SK.hat) return null;
  if (!SK.hatT) {
    const m = SK.hat.clone();
    m.visible = true;
    // (de los dos lados: la malla de Meshy tiene caras dadas vuelta en el ala y
    // la copa abierta atrás, y de arriba se veían agujeros. __mduNoHatFix: como antes)
    if (globalThis.__mduNoHatFix !== true) {
      m.material = m.material.clone();
      m.material.side = THREE.DoubleSide;
    }
    m.position.set(0, 0, 0);
    m.scale.setScalar(1);
    // el modelo lo tiene echado para atrás: lo que sube el ala de adelante
    // respecto de la de atrás
    const pos = m.geometry.attributes.position;
    let yf = 0;
    let nf = 0;
    let yb = 0;
    let nb = 0;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (Math.abs(pos.getX(i)) > 0.06) continue;
      if (z > 0.18) {
        yf += pos.getY(i);
        nf++;
      } else if (z < -0.18) {
        yb += pos.getY(i);
        nb++;
      }
    }
    m.rotation.set(nf && nb ? Math.atan2(yf / nf - yb / nb, 0.4) : 0, 0, 0);
    const T = new THREE.Group();
    T.add(m);
    T.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m, true);
    m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y - 0.075, -(box.min.z + box.max.z) / 2);
    SK.hatT = T;
  }
  return SK.hatT.clone();
}

// Le pone el cuerpo de verdad a un Chiquitijuein armado con buildChiqui.
function attachSkin(R) {
  const meta = SK.meta;
  const model = cloneSkinned(SK.gltf.scene);
  model.name = 'chiquiSkin';
  const bones = {};
  let body = null;
  const eyes = [];
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) body = o;
    if (o.name === 'eyeA' || o.name === 'eyeB') eyes.push(o);
  });
  model.getObjectByName('sombrero')?.removeFromParent();
  if (!body || !meta) return;
  body.frustumCulled = false;
  body.castShadow = true;
  body.userData.chiquiSkin = true;
  // (el esqueleto en reposo, con el modelo en el origen: para anclar cosas al cuerpo)
  model.updateMatrixWorld(true);
  const bind = {};
  for (const [n, b] of Object.entries(bones)) bind[n] = b.matrixWorld.clone();
  // las piezas se esconden; si ya les cambiaron el material (la estatua de
  // piedra del desafío), el cuerpo lleva el mismo
  for (const m of R.proc) m.visible = false;
  const pm = R.proc[0]?.material;
  if (pm && pm !== R.M0) body.material = pm;
  R.root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const S = {
    model,
    body,
    bones,
    bind,
    eyes,
    head: bones.Head,
    neck: bones.neck,
    front: bones.headfront,
    hand: bones[meta.hand] || bones.RightHand,
    mixer,
    acts: {},
    layers: [],
    v: 0,
    run: false,
    last: null,
    grip: null,
    // el recorte: una esfera alrededor de la cadera (bossSkin cullList; la
    // pone driveSkin, hasta entonces sin recorte)
    cull: cullList(model),
  };
  R.skin = S;
  // el bastón en la mano: parado al lado del pie en el primer cuadro de estar
  // parado, y de ahí sigue a la mano
  poseSkin(R, 0);
  R.root.updateMatrixWorld(true);
  const inv = tmpM.copy(R.root.matrixWorld).invert();
  const handM = tmpN.multiplyMatrices(inv, S.hand.matrixWorld);
  const hp = tmpV.setFromMatrixPosition(handM);
  const staffM = new THREE.Matrix4().compose(tmpW.set(hp.x, 0, hp.z + 0.02), tmpQ.setFromEuler(tmpE.set(0.04, 0, 0.05)), tmpS.set(1, 1, 1));
  S.grip = handM.invert().multiply(staffM);
  // (a qué alto del caño va la mano: cane)
  S.gripLen = hp.y;
  followStaff(R);
  R.root.updateMatrixWorld(true);
  placeEyes(R);
  for (const cb of R.skinWait || []) cb(R);
  R.skinWait = null;
}

// Un ancla pegada al cuerpo: un Object3D colgado del hueso `bone` en el punto
// `p` (medidas del modelo, en reposo), con la escala y los ejes del bicho.
export function chiquiAnchor(R, bone, p) {
  const S = R.skin;
  const b = S.bones[bone];
  const a = new THREE.Object3D();
  tmpM.copy(S.bind[bone]).invert().multiply(tmpN.makeTranslation(p[0], p[1], p[2]));
  tmpM.decompose(a.position, a.quaternion, a.scale);
  b.add(a);
  return a;
}

// El brasero del coloso: el cuerpo con grietas de fuego (en el espacio del
// modelo, así siguen a la piel) y la guarda del poncho encendida. Devuelve el
// uniforme de cuánto brilla.
export function chiquiEmber(R, color = 0xff4214) {
  const S = R.skin;
  if (!S) return null;
  const U = { uEmber: { value: 1 }, uEmberCol: { value: new THREE.Color(color) }, uGeo: { value: 1 } };
  // (la malla puede venir en otra escala que el modelo: la de su bindMatrix)
  U.uGeo.value = tmpS.setFromMatrixScale(S.body.bindMatrix).x || 1;
  const m = S.body.material.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGeo;\nvarying vec3 vChiq;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvChiq = position * uGeo;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uEmber;\nuniform vec3 uEmberCol;\nvarying vec3 vChiq;\n${CRACK_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // (la cara y el sombrero quedan como son: las grietas, del cuello para abajo)
        float low = 1.0 - smoothstep(0.66, 0.72, vChiq.y);
        float ck = chCrack(vChiq * 24.0) * smoothstep(0.5, 0.72, chNoise(vChiq * 6.0 + 7.3)) * low;
        vec3 dcol = diffuseColor.rgb;
        // (la guarda: solo los colorados bien saturados del poncho; la piel
        // rosada y la cinta del sombrero, del modelo facetado, no)
        float guarda = smoothstep(0.1, 0.22, dcol.r - max(dcol.g, dcol.b)) * smoothstep(0.65, 0.85, 1.0 - max(dcol.g, dcol.b) / max(dcol.r, 0.001)) * low;
        totalEmissiveRadiance += uEmberCol * uEmber * (ck * 1.8 + guarda * 1.1);`,
      );
  };
  m.customProgramCacheKey = () => 'chiquiEmber';
  // (la copia trae la marca del original: la luz de los personajes, de nuevo encima)
  delete m.userData.skinLook;
  skinLook(m);
  S.body.material = m;
  return U.uEmber;
}

const CRACK_GLSL = `
vec3 chH3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// las grietas: el borde entre dos celdas (F2 - F1 chico)
float chCrack(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = g + chH3(i + g) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
  return 1.0 - smoothstep(0.0, 0.045, sqrt(d2) - sqrt(d1));
}
// manchas suaves (dónde hay grietas y dónde no)
float chNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(chH3(i).x, chH3(i + vec3(1, 0, 0)).x, f.x), mix(chH3(i + vec3(0, 1, 0)).x, chH3(i + vec3(1, 1, 0)).x, f.x), f.y);
  float b = mix(mix(chH3(i + vec3(0, 0, 1)).x, chH3(i + vec3(1, 0, 1)).x, f.x), mix(chH3(i + vec3(0, 1, 1)).x, chH3(i + vec3(1, 1, 1)).x, f.x), f.y);
  return mix(a, b, f.z);
}
`;

// Qué clip va (y cómo se funden) y lo de afuera: la cabeza, el bastón y los ojos.
function driveSkin(R, dt) {
  const S = R.skin;
  if (!S || !R.root.visible) return;
  const C = SK.meta.clips;
  // lo que avanza la raíz (de costado, en alturas del bicho); un salto de
  // golpe (se teletransporta) no cuenta
  R.root.updateWorldMatrix(true, false);
  tmpV.setFromMatrixPosition(R.root.matrixWorld);
  const sc = tmpS.setFromMatrixScale(R.root.matrixWorld).x || 1;
  let v = 0;
  if (S.last && dt > 0) {
    const d = Math.hypot(tmpV.x - S.last.x, tmpV.z - S.last.z) / sc;
    v = d > 1.5 ? 0 : d / dt;
  }
  (S.last ||= new THREE.Vector3()).copy(tmpV);
  S.v += (Math.min(10, v) - S.v) * Math.min(1, dt * 5);
  // el de una vez
  const O = R.one;
  if (O) {
    if (O.wait > 0) O.wait -= dt;
    else O.t += dt * O.rate;
    const end = O.until ?? (C[O.name]?.loop ? Infinity : C[O.name]?.dur ?? 0);
    if (!O.hold && O.t >= end - FADE) R.one = null;
    if (!C[O.name]) R.one = null;
  }
  let name;
  let t = null;
  let rate = 1;
  if (R.one && R.one.wait <= 0) {
    name = R.one.name;
    t = R.one.hold ? Math.min(R.one.t, C[name].dur - 1e-3) : R.one.t;
  } else if (R.mode && C[R.mode]) name = R.mode;
  else {
    S.run = R.auto !== false && (S.run ? S.v > RUN_OFF : S.v > RUN_ON);
    if (S.run) {
      name = 'run';
      rate = Math.max(0.7, Math.min(2.2, S.v / (C.run.stride || 2)));
    } else if (R.auto !== false && S.v > WALK_V) {
      name = 'walk';
      rate = Math.max(0.45, Math.min(2.2, S.v / (C.walk.speed || 0.2)));
    } else {
      name = R.idle && C[R.idle] ? R.idle : 'idle';
      if (name === 'taunt' || (name === 'idle' && R.vary)) [name, t] = idleMix(R, dt);
      // (R.still: quieto del todo, en ese cuadro del de parado; el coloso
      // mientras le rompen las gemas: si se hamacaba no se le podía apuntar)
      if (R.still != null && name === 'idle') t = R.still;
    }
  }
  // (el mixer solo escribe un hueso cuando el clip le cambia el valor: con el
  // clip quieto -de rodillas, un cuadro fijo- el giro de la cabeza del cuadro
  // anterior quedaba y se le sumaba otra vez: la cabeza daba vueltas a toda
  // velocidad. Se vuelve a lo del clip antes de mezclar.)
  if (S.turned) {
    S.neck.quaternion.copy(S.neckBase);
    S.head.quaternion.copy(S.headBase);
    S.turned = false;
  }
  // (lo mismo con el brazo que agarra el bastón al caminar: cane)
  if (S.armIK) {
    S.bones.RightArm.quaternion.copy(S.armBase[0]);
    S.bones.RightForeArm.quaternion.copy(S.armBase[1]);
    S.armIK = false;
  }
  poseSkin(R, dt, name, t, rate);
  // la cabeza: el giro que le dieron a la de piezas (rotation, lookAt), un
  // poco en el cuello y el resto en la cabeza
  const hq = R.head.quaternion;
  if (Math.abs(hq.w) < 0.99999) {
    (S.neckBase ||= new THREE.Quaternion()).copy(S.neck.quaternion);
    (S.headBase ||= new THREE.Quaternion()).copy(S.head.quaternion);
    S.turned = true;
    R.root.updateMatrixWorld(true);
    R.root.getWorldQuaternion(tmpQ);
    const hw = S.head.getWorldQuaternion(tmpQ2);
    // (en el mundo: R · giro · R⁻¹)
    tmpQ3.copy(tmpQ).multiply(hq).multiply(tmpQ4.copy(tmpQ).invert());
    tmpQ5.identity().slerp(tmpQ3, 0.3);
    const nw = S.neck.getWorldQuaternion(tmpQ6);
    const np = S.neck.parent.getWorldQuaternion(tmpQ7);
    S.neck.quaternion.copy(np.invert().multiply(tmpQ5.multiply(nw)));
    S.neck.updateMatrixWorld(true);
    const want = tmpQ3.multiply(hw);
    S.head.quaternion.copy(S.neck.getWorldQuaternion(tmpQ7).invert().multiply(want));
  }
  followStaff(R, dt);
  R.root.updateMatrixWorld(true);
  placeEyes(R);
  cullAt(S.cull, (S.bones.Hips || S.head).getWorldPosition(tmpV));
}

// Parado sin hacer nada (idle 'taunt': el trono, el coloso; o vary): no se
// frota las manos todo el tiempo. Respira un rato y hace uno de sus gestos
// (niega con el dedo, se encoge de hombros, la mano en la cintura, un saltito,
// un bailecito, festeja, un pase de magia); frotarse las manos, cada tanto
// nomás. Con 'taunt' arranca frotándoselas (así lo presenta la escena).
const GESTURES = [
  ['wag', 3],
  ['shrug', 3],
  ['hip', 3],
  ['hop', 2],
  ['jig', 2],
  ['victory', 1.5],
  ['genie', 1],
];
const RUB_GAP = 25;
function idleMix(R, dt) {
  const C = SK.meta.clips;
  const M = (R.skin.mix ||= { name: null, t: 0, rest: 0, rub: -RUB_GAP, clock: 0, last: null, prev: [] });
  M.clock += dt;
  if (M.name) {
    M.t += dt;
    // (las manos, dos vueltas del clip)
    if (M.t < C[M.name].dur * (M.name === 'taunt' ? 2 : 1) - FADE) return [M.name, M.t];
    M.last = M.name;
    // (los dos últimos no se repiten)
    M.prev = [M.name, M.prev[0]];
    M.name = null;
    M.rest = 3 + Math.random() * 4;
  }
  M.rest -= dt;
  const first = R.idle === 'taunt' && M.last == null;
  if (M.rest > 0 && !first) return ['idle', null];
  let pick = null;
  if (first || (M.clock - M.rub > RUB_GAP && Math.random() < 0.3)) pick = 'taunt';
  else {
    const list = GESTURES.filter(([n]) => C[n] && !M.prev.includes(n));
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
    for (const [n, w] of list) if ((r -= w) <= 0 && !pick) pick = n;
    pick ||= list[0]?.[0] || 'idle';
  }
  if (pick === 'taunt') M.rub = M.clock;
  M.name = pick;
  M.t = 0;
  return [pick, 0];
}

// Las capas (una por clip; la de arriba entra en FADE s y las otras se van) y
// el cuadro de cada una.
function poseSkin(R, dt, name = R.idle || 'idle', t = null, rate = 1) {
  const S = R.skin;
  const C = SK.meta.clips;
  let top = S.layers[S.layers.length - 1];
  if (!top || top.name !== name || (t != null && Math.abs(t - top.t) > 0.3)) {
    // (el mismo clip más abajo se saca: no puede estar dos veces)
    S.layers = S.layers.filter((L) => L.name !== name);
    top = { name, t: t ?? 0, w: S.layers.length ? 0 : 1, rate };
    S.layers.push(top);
  }
  top.rate = rate;
  for (const L of S.layers) {
    if (L === top && t != null) L.t = t;
    else L.t += dt * L.rate;
  }
  top.w = Math.min(1, top.w + dt / FADE);
  const others = S.layers.reduce((a, L) => a + (L === top ? 0 : L.w), 0);
  for (const L of S.layers) if (L !== top) L.w = others > 0 ? (L.w / others) * (1 - top.w) : 0;
  S.layers = S.layers.filter((L) => L === top || L.w > 1e-3);
  for (const [n, a] of Object.entries(S.acts)) if (!S.layers.some((L) => L.name === n)) a.enabled = false;
  for (const L of S.layers) {
    let a = S.acts[L.name];
    if (!a) {
      a = S.acts[L.name] = S.mixer.clipAction(SK.clips[L.name]);
      a.play();
      a.timeScale = 0;
    }
    const c = C[L.name];
    a.enabled = true;
    a.time = c.loop ? ((L.t % c.dur) + c.dur) % c.dur : Math.max(0, Math.min(c.dur - 1e-3, L.t));
    a.setEffectiveWeight(L.w);
  }
  S.mixer.update(0);
}

// El bastón: sigue a la mano (si todavía es del bicho: el final lo tira al piso).
function followStaff(R, dt = 0) {
  const S = R.skin;
  if (R.staff.parent !== R.root || !S.grip) return;
  R.root.updateMatrixWorld(true);
  tmpM.copy(R.root.matrixWorld).invert().multiply(S.hand.matrixWorld).multiply(S.grip);
  tmpM.decompose(R.staff.position, R.staff.quaternion, tmpS);
  cane(R, dt);
}

// Caminando con la bombilla de bastón (R.cane, lo pide la escena): la punta se
// clava en el piso al lado del pie y queda ahí mientras el cuerpo pasa; se
// levanta, va adelante y se vuelve a clavar, cada dos pasos. R.onTap suena en
// el cuadro en que toca el piso (antes el "tic" sonaba con el bastón en el
// aire, que iba y venía con el brazo del clip). El brazo va hasta el caño
// (hombro, codo, mano: armTo).
const CANE_T = 2 / 1.75;
// la parte del ciclo en el aire; lo alto que se levanta la punta, lo que se
// adelanta y lo que se abre del hombro (en altos del hombro); lo más que se
// inclina el caño (rad)
const CANE_SWING = 0.4;
const CANE_LIFT = 0.12;
const CANE_AHEAD = 0.22;
const CANE_OUT = 0.12;
const CANE_TILT = 0.32;
const caneTip = new THREE.Vector3();
const caneSh = new THREE.Vector3();
const caneFw = new THREE.Vector3();
const caneSide = new THREE.Vector3();
const caneDir = new THREE.Vector3();
const caneG = new THREE.Vector3();
const caneP = new THREE.Vector3();
const caneQ = new THREE.Quaternion();
const caneUp = new THREE.Vector3(0, 1, 0);
function cane(R, dt) {
  const S = R.skin;
  // (con el walk de Blender el bastón se clava solo en el clip: el "tic" sale de sus marcas)
  if (SK.blend?.meta?.walk?.taps) {
    chiquiTaps(R, SK.meta.clips);
    S.caneK = 0;
    S.caneU = null;
    return;
  }
  S.caneK = Math.max(0, Math.min(1, (S.caneK || 0) + (R.cane ? dt : -dt) / 0.3));
  const arm = S.bones.RightArm;
  const fore = S.bones.RightForeArm;
  if (!S.caneK || !arm || !fore) {
    S.caneU = null;
    return;
  }
  const root = R.root;
  arm.getWorldPosition(caneSh);
  root.getWorldPosition(caneP);
  const sc = tmpS.setFromMatrixScale(root.matrixWorld).x || 1;
  const floor = caneP.y;
  caneFw.set(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize();
  // (el lado del bastón: la mano derecha, a -x del bicho)
  caneSide.set(-1, 0, 0).transformDirection(root.matrixWorld).setY(0).normalize();
  const h = Math.max(0.05, caneSh.y - floor);
  // dónde se clava: adelante del hombro y un poco afuera, en el piso
  const ahead = (out) => out.copy(caneSh).addScaledVector(caneFw, h * CANE_AHEAD).addScaledVector(caneSide, h * CANE_OUT).setY(floor);
  if (S.caneU == null) {
    // arranca en el aire, desde donde estaba la punta en la mano
    S.caneU = 1 - CANE_SWING;
    S.caneFrom = R.staff.position.clone().applyMatrix4(root.matrixWorld);
    S.caneTip = S.caneFrom.clone();
  }
  if (R.cane) S.caneU += dt / CANE_T;
  if (S.caneU >= 1) {
    S.caneU -= 1;
    ahead(S.caneTip);
    R.onTap?.();
  }
  if (S.caneU > 1 - CANE_SWING) {
    // en el aire: de la última clavada a la próxima, con un arco
    const s = (S.caneU - (1 - CANE_SWING)) / CANE_SWING;
    const k = s * s * (3 - 2 * s);
    ahead(caneTip);
    caneTip.lerpVectors(S.caneFrom, caneTip, k);
    caneTip.y += Math.sin(Math.PI * s) * h * CANE_LIFT;
  } else {
    caneTip.copy(S.caneTip);
    S.caneFrom.copy(S.caneTip);
  }
  // el caño: de la punta hacia el hombro, no más inclinado que CANE_TILT
  caneDir.copy(caneSh).sub(caneTip);
  const hz = Math.hypot(caneDir.x, caneDir.z);
  const tilt = Math.min(CANE_TILT, Math.atan2(hz, Math.max(1e-3, caneDir.y)));
  if (hz > 1e-4) caneDir.set((caneDir.x / hz) * Math.sin(tilt), Math.cos(tilt), (caneDir.z / hz) * Math.sin(tilt));
  else caneDir.set(0, 1, 0);
  // la mano, agarrada donde estaba en el caño
  caneG.copy(caneTip).addScaledVector(caneDir, (S.gripLen || 0.4) * sc);
  armTo(S, arm, fore, caneG, S.caneK);
  caneQ.setFromUnitVectors(caneUp, caneDir);
  root.getWorldQuaternion(tmpQ).invert();
  caneQ.premultiply(tmpQ);
  caneTip.applyMatrix4(tmpM.copy(root.matrixWorld).invert());
  R.staff.position.lerp(caneTip, S.caneK);
  R.staff.quaternion.slerp(caneQ, S.caneK);
}

// El brazo (hombro y codo) para que la mano llegue a T (en el mundo), en la
// medida k; el codo, del lado donde ya estaba doblado. Se guarda cómo estaba:
// driveSkin lo vuelve a poner antes del clip (el mixer no reescribe un hueso
// que el clip no cambia).
const ikA = new THREE.Vector3();
const ikB = new THREE.Vector3();
const ikC = new THREE.Vector3();
const ikU = new THREE.Vector3();
const ikW = new THREE.Vector3();
const ikE = new THREE.Vector3();
const ikQ = new THREE.Quaternion();
const ikP = new THREE.Quaternion();
function armTo(S, up, lo, T, k) {
  S.armBase ||= [new THREE.Quaternion(), new THREE.Quaternion()];
  S.armBase[0].copy(up.quaternion);
  S.armBase[1].copy(lo.quaternion);
  S.armIK = true;
  up.getWorldPosition(ikA);
  lo.getWorldPosition(ikB);
  S.hand.getWorldPosition(ikC);
  const l1 = ikA.distanceTo(ikB);
  const l2 = ikB.distanceTo(ikC);
  ikU.copy(T).sub(ikA);
  const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, ikU.length()));
  ikU.normalize();
  ikW.copy(ikB).sub(ikA);
  ikW.addScaledVector(ikU, -ikW.dot(ikU));
  if (ikW.lengthSq() < 1e-8) ikW.set(0, -1, 0).addScaledVector(ikU, ikU.y);
  ikW.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  ikE.copy(ikA).addScaledVector(ikU, cosA * l1).addScaledVector(ikW, sinA * l1);
  // el brazo: del codo de antes al de ahora (en el mundo)
  ikQ.setFromUnitVectors(ikW.copy(ikB).sub(ikA).normalize(), ikU.copy(ikE).sub(ikA).normalize());
  rotWorld(up, ikQ, k);
  // el antebrazo: de la mano de antes a T
  lo.getWorldPosition(ikB);
  S.hand.getWorldPosition(ikC);
  ikQ.setFromUnitVectors(ikW.copy(ikC).sub(ikB).normalize(), ikU.copy(T).sub(ikB).normalize());
  rotWorld(lo, ikQ, k);
}
// Gira un hueso en el mundo (q), en la medida k.
const ikR = new THREE.Quaternion();
function rotWorld(b, q, k) {
  if (k < 1) q.slerp(ikP.identity(), 1 - k);
  b.parent.getWorldQuaternion(ikR).invert();
  b.getWorldQuaternion(ikP);
  ikP.premultiply(q);
  b.quaternion.copy(ikR.multiply(ikP));
  b.updateMatrixWorld(true);
}

// Los brillos de los ojos (y el resplandor) van donde están los ojos del modelo.
function placeEyes(R) {
  const S = R.skin;
  S.head.getWorldPosition(tmpV);
  const fw = S.front.getWorldPosition(tmpW).sub(tmpV).normalize();
  const sc = tmpS.setFromMatrixScale(R.root.matrixWorld).x || 1;
  R.head.updateWorldMatrix(true, false);
  const mid = tmpU.set(0, 0, 0);
  S.eyes.forEach((e, i) => {
    e.getWorldPosition(tmpV).addScaledVector(fw, 0.012 * sc);
    mid.add(tmpV);
    if (R.glows[i]) R.head.worldToLocal(R.glows[i].position.copy(tmpV));
  });
  if (S.eyes.length) R.head.worldToLocal(R.halo.position.copy(mid.multiplyScalar(1 / S.eyes.length)).addScaledVector(fw, 0.02 * sc));
}

const tmpM = new THREE.Matrix4();
const tmpN = new THREE.Matrix4();
const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();
const tmpQ4 = new THREE.Quaternion();
const tmpQ5 = new THREE.Quaternion();
const tmpQ6 = new THREE.Quaternion();
const tmpQ7 = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpU = new THREE.Vector3();

// ---------------- la risa ----------------
// Un ruido para cada contexto de audio (la risa es independiente del motor).
const noiseBufs = new WeakMap();
function noiseBuf(c) {
  let b = noiseBufs.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(c, b);
  }
  return b;
}

// Risita de bicho chiquito: "ji-ji-ji-ji" cada vez más rápida, con la voz
// finita (formantes de i) y un chillido al final; el eco la repite de un lado
// y del otro. `pos` la ubica en el mundo; sin pos suena en la cabeza (con
// `pan` para susurrar al oído). `whisper` la hace de aire, sin voz.
export function chiquiGiggle(A, { pos = null, gain = 1, pan = 0, echo = 0.45, whisper = false, pitch = 1, ref = 7 } = {}) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const t0 = A.now + 0.03;
  let out;
  if (pos) out = A.out({ pos, gain, reverb: 0.55, ref });
  else {
    const o = A.out({ gain, reverb: 0.5 });
    out = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (out.pan) out.pan.value = pan;
    out.connect(o);
  }
  const voice = c.createGain();
  voice.connect(out);
  // el eco: dos rebotes, uno de cada lado, cada vez más apagados
  if (echo > 0) {
    let prev = voice;
    for (let k = 0; k < 3; k++) {
      const d = c.createDelay(1);
      d.delayTime.value = 0.23 + k * 0.05;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600 - k * 600;
      const gn = c.createGain();
      gn.gain.value = echo * (0.8 - k * 0.2);
      prev.connect(d).connect(lp).connect(gn);
      if (c.createStereoPanner && !pos) {
        const p = c.createStereoPanner();
        p.pan.value = k % 2 ? 0.7 : -0.7;
        gn.connect(p).connect(out);
      } else gn.connect(out);
      prev = gn;
    }
  }
  const nb = noiseBuf(c);
  // formantes de una "i" de voz chiquita
  const formant = (src, t, f, q, g) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gn = c.createGain();
    gn.gain.value = g;
    src.connect(bp).connect(gn).connect(voice);
    return gn;
  };
  const gaps = [0, 0.15, 0.28, 0.4, 0.51, 0.61, 0.71];
  gaps.forEach((dt, i) => {
    const t = t0 + dt;
    const len = 0.1;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (!whisper) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f = (560 - i * 12) * pitch;
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.03);
      o.frequency.linearRampToValueAtTime(f * 0.88, t + len);
      o.connect(env);
      o.start(t);
      o.stop(t + len + 0.02);
    }
    // la "j": un soplido áspero al empezar cada sílaba (y todo, si susurra)
    const n = c.createBufferSource();
    n.buffer = nb;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(whisper ? 0.9 : 0.5, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (whisper ? len : 0.045));
    n.connect(ng).connect(env);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.02);
    formant(env, t, 380 * pitch, 3, 0.9);
    formant(env, t, 2500 * pitch, 7, 2.2);
    formant(env, t, 3300 * pitch, 9, 1.2);
    const body = c.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 2400;
    const bg = c.createGain();
    bg.gain.value = 0.22;
    env.connect(body).connect(bg).connect(voice);
  });
  // el chillidito del final
  const t = t0 + 0.86;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.8, t + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  const o = c.createOscillator();
  o.type = whisper ? 'sine' : 'triangle';
  o.frequency.setValueAtTime(820 * pitch, t);
  o.frequency.linearRampToValueAtTime(1350 * pitch, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(640 * pitch, t + 0.42);
  const vib = c.createOscillator();
  vib.frequency.value = 17;
  const vg = c.createGain();
  vg.gain.value = 40 * pitch;
  vib.connect(vg).connect(o.frequency);
  o.connect(env);
  formant(env, t, 2500 * pitch, 5, 1.6);
  const bg = c.createGain();
  bg.gain.value = whisper ? 0.15 : 0.35;
  env.connect(bg).connect(voice);
  for (const x of [o, vib]) {
    x.start(t);
    x.stop(t + 0.45);
  }
}

// Estática cortada y un golpe grave: cada vez que salta de lugar.
export function chiquiGlitch(A, gain = 0.6) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const o = A.out({ gain, reverb: 0 });
  const t = A.now;
  const n = c.createBufferSource();
  n.buffer = noiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 6; i++) g.gain.setValueAtTime(i % 2 ? 0.05 : 0.9, t + i * 0.022);
  g.gain.setValueAtTime(0, t + 0.14);
  n.connect(bp).connect(g).connect(o);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.16);
  const s = c.createOscillator();
  s.frequency.setValueAtTime(95, t);
  s.frequency.exponentialRampToValueAtTime(38, t + 0.22);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.9, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  s.connect(sg).connect(o);
  s.start(t);
  s.stop(t + 0.26);
}

// La bombilla-bastón contra el piso: un "tic" de metal.
export function chiquiTap(A, gain = 0.5) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const o = A.out({ gain, reverb: 0.35 });
  const t = A.now;
  const n = c.createBufferSource();
  n.buffer = noiseBuf(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  n.connect(hp).connect(g).connect(o);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.04);
  for (const [f, v] of [[2650, 0.25], [4120, 0.12]]) {
    const s = c.createOscillator();
    s.frequency.value = f;
    const sg = c.createGain();
    sg.gain.setValueAtTime(v, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(sg).connect(o);
    s.start(t);
    s.stop(t + 0.15);
  }
}

// ---------------- apariciones en la explanada ----------------
// De vez en cuando, desde las arcadas, se lo ve abajo en la explanada: quieto,
// mirándote. Si lo mirás de frente, desaparece (y se ríe). Si no, se va solo.
// No pasa por la red: cada uno ve (o no ve) el suyo.
export class ChiquiSightings {
  constructor(game, tower) {
    this.g = game;
    this.tower = tower;
    this.cd = 100 + Math.random() * 80;
    this.count = 0;
    this.max = 4;
    this.c = null;
    this.t = 0;
    this.look = 0;
  }

  update(dt) {
    const g = this.g;
    const C = this.c;
    if (C?.root.visible) {
      this.t += dt;
      C.update(dt, g.time);
      const cam = g.camera;
      // la cabeza lo sigue a uno
      C.head.lookAt(cam.position);
      // ¿lo estás mirando?
      const to = tmpV.copy(C.root.position).setY(C.root.position.y + 0.8).sub(cam.position);
      const d = to.length();
      cam.getWorldDirection(tmpW);
      const ang = Math.acos(Math.min(1, tmpW.dot(to) / d));
      this.look = ang < 0.16 ? this.look + dt : 0;
      if (this.look > 0.3 || g.state !== 'playing' || !g.player.alive || g.player.downed) this.vanish(this.look > 0.3);
      else if (this.t > 10 && ang > 0.6) this.vanish(false);
      return;
    }
    if (g.state !== 'playing' || this.count >= this.max) return;
    this.cd -= dt;
    if (this.cd > 0) return;
    this.cd = 6;
    if (!this.spawn()) return;
    this.count++;
    this.cd = 150 + Math.random() * 120;
  }

  // Busca un lugar de la explanada que se vea de reojo desde donde estás.
  spawn() {
    const g = this.g;
    const T = this.tower;
    const p = g.player;
    const round = g.rounds?.round || 0;
    if (round < 3 || !p.alive || p.downed || p.pos.y < 3.5 || !T.exposed(p.pos) || T.skyState === 'broken' || g.ee?.fight) return false;
    const S = T.T;
    const cam = g.camera;
    cam.getWorldDirection(tmpW);
    tmpW.y = 0;
    tmpW.normalize();
    const pa = Math.atan2(p.pos.z - S.cz, p.pos.x - S.cx);
    const opts = [];
    for (let k = 0; k < 24; k++) {
      const a = pa + ((k / 23) * 2 - 1) * 0.9;
      const r = 19 + Math.random() * 4;
      const x = S.cx + Math.cos(a) * r;
      const z = S.cz + Math.sin(a) * r;
      tmpV.set(x - cam.position.x, 0, z - cam.position.z).normalize();
      const off = Math.acos(Math.max(-1, Math.min(1, tmpV.dot(tmpW))));
      // de reojo: ni de frente ni fuera de la pantalla
      if (off > 0.35 && off < 0.75) opts.push([x, z]);
    }
    if (!opts.length) return false;
    const [x, z] = opts[Math.floor(Math.random() * opts.length)];
    if (!this.c) {
      this.c = buildChiqui(g.textures);
      g.scene.add(this.c.root);
    }
    const C = this.c;
    C.root.visible = true;
    C.root.position.set(x, 0, z);
    C.root.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z);
    C.eyeK = 1.4;
    for (const gl of C.glows) gl.scale.setScalar(0.3);
    C.halo.material.opacity = 0.35;
    this.t = 0;
    this.look = 0;
    return true;
  }

  vanish(seen) {
    const g = this.g;
    const C = this.c;
    C.root.visible = false;
    if (!seen) return;
    const p = C.root.position;
    g.fx?.dust?.(tmpV.set(p.x, 0.3, p.z), { x: 0, y: 1, z: 0 }, [0.06, 0.04, 0.04], 18);
    chiquiGiggle(g.audio, { pos: tmpV.set(p.x, 1, p.z).clone(), gain: 1.1, ref: 14 });
  }

  dispose() {
    this.c?.root.removeFromParent();
    this.c = null;
  }
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
