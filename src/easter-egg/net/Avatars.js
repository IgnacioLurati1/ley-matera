import * as THREE from 'three';
import { makePose, solvePose, PART_COUNT } from '../entities/skeleton';
import { swimPose } from '../entities/zombieGaits';
import { walkLegs, stepPerson } from '../entities/personWalk';
import { shieldModel } from '../world/shieldModels';
import { CAMO_BY_ID, camoable } from '../weapons/camos';
import { VM } from '../weapons/viewmodels';
import { gauchoSkin, whenGaucho, TWO_HAND } from './gauchoSkin';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Los otros jugadores: un gaucho con sombrero, cara con bigote, poncho de
// color que se bambolea al moverse y su mate en la mano, animado con el mismo
// esqueleto que los zombies. Arriba lleva el nombre.

const PONCHOS = [0xa8231c, 0x1e5aa8, 0x1f7a3a, 0xc9a02a, 0x6a2a8a];
// la silueta de cada compañero a través de las paredes (el color de su poncho, más vivo)
const XRAY = [0xff5a48, 0x5aa8ff, 0x5ae07a, 0xffd24a, 0xc070ff];
// lo que tarda en desangrarse un caído (Player: bleed)
const BLEED = 30;
const tmpRot = new THREE.Matrix4();
const tmpEul = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const SHIELD_TILT = new THREE.Matrix4().makeRotationX(0.12).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
// adelante (Z: weapons/shieldHand): delante del pecho, del lado izquierdo, con la cara para afuera
const SHIELD_FRONT = new THREE.Matrix4().makeRotationX(-0.1).multiply(new THREE.Matrix4().makeRotationY(-0.15));
// El mate de verdad de cada compañero (el que tiene en la mano, mejorado o el
// potenciador): en la mano derecha, apuntando adonde mira. GUN_OFF: de la
// mano al origen del modelo (en el marco de la mirada: +x derecha, -z adelante).
const GUN_OFF = new THREE.Vector3(0, 0.02, -0.02);
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tmpM = new THREE.Matrix4();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
// (los muñecos de los easter eggs fuera de cuadro: offCull)
const cullFr = new THREE.Frustum();
const cullM = new THREE.Matrix4();
const cullS = new THREE.Sphere(new THREE.Vector3(), 1.8);
// el cuerpo del termo de los compañeros: rojo, el de siempre (el de primera
// persona se tiñe según el mate que se ceba)
const TERMO_BODY = new THREE.MeshStandardMaterial({ color: 0xa81c1c, roughness: 0.3, metalness: 0.3 });
const ONE = new THREE.Vector3(1, 1, 1);
// los mates (los que tienen boca) en la mano de un compañero: la copia del de
// primera persona viene inclinada para la cámara y chica para la mano del
// gaucho. Derecho, más grande y con la panza en la palma (MATE_AT: desde lo
// que agarra la mano, girado con el cuerpo)
const MATE_K = 1.5;
const MATE_AT = new THREE.Vector3(0, -0.02, 0.01);
// (la bombilla del de primera persona sale para adelante, como un caño:
// echado para atrás, la bombilla sube y la boca mira al que lo tiene)
const MATE_BACK = 0.75;
// el termo al cebar (gauchoSkin pourArm): en la mano libre, agarrado del medio
const TERMO_K = 1.3;
const TERMO_GRIP = 0.12;
const TERMO_TILT = 1.9;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
// (anim-online: el porongo del Liquidificador para cebarlo, agarrado de la cintura)
const PORONGO_K = 1.75;
const PORONGO_GRIP = 0.07;
const UP_Y = new THREE.Vector3(0, 1, 0);

// La copia del mate de primera persona para la mano de un compañero, una vez
// por modelo (TPL): sin la mano ni el fogonazo de primera persona (el muñeco
// tiene los suyos); un mate (con boca), derecho y del tamaño de la mano del
// gaucho; y las piezas juntas por material: la del de primera persona son
// sueltas, 8-18 dibujos por compañero (lo que se mueve en primera persona acá
// no se anima). iMuzzle / iMouth: la punta y la boca en el orden de la copia.
// palm: el mate de una mano, parado en la palma (net/gauchoSkin palmMate):
// la calabaza derecha y la bombilla apenas inclinada hacia el que lo tiene
// (la de primera persona sale casi acostada, como un caño).
const TPL = new WeakMap();
const TPL_PALM = new WeakMap();
const STRAW_LEAN = 0.38;
function gunTemplate(src, W, palm = false) {
  const tpl = palm ? TPL_PALM : TPL;
  let T = tpl.get(src);
  if (T) return T;
  const gun = src.root.clone();
  // la punta y la boca en la copia (las mismas piezas en el mismo orden)
  const idx = new Map();
  let n = 0;
  src.root.traverse((o) => idx.set(o, n++));
  const pick = (want) => {
    let k = 0;
    let out = null;
    gun.traverse((o) => {
      if (k++ === want) out = o;
    });
    return out;
  };
  const muzzle = src.muzzle ? pick(idx.get(src.muzzle)) : null;
  const mouth = src.mouth && src.mate ? pick(idx.get(src.mouth)) : null;
  const mate = mouth ? pick(idx.get(src.mate)) : null;
  const bomb = mate && src.bombGroup ? pick(idx.get(src.bombGroup)) : null;
  // (las manos van marcadas en weapons/viewmodels.js; las hechas aparte, por el material)
  const M = W.T ? VM.mats(W.T) : null;
  const handMats = M ? new Set([M.skin, M.nail, M.sleeve, M.cuff]) : new Set();
  const drop = [];
  gun.traverse((o) => {
    if (W.flash && o.material === W.flash.material) drop.push(o);
    else if (o.userData.hand || (o.isMesh && handMats.has(o.material))) drop.push(o);
    o.castShadow = false;
  });
  for (const o of drop) o.removeFromParent();
  gun.visible = true;
  let base = null;
  if (mate) {
    gun.rotation.set(0, 0, 0);
    gun.scale.multiplyScalar(MATE_K);
    if (palm) {
      mate.rotation.set(0, 0, 0);
      for (const b of bomb?.children || []) b.rotation.x = STRAW_LEAN;
      // lo de abajo de la calabaza (sin la bombilla): lo que se apoya en la palma
      gun.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const b2 = new THREE.Box3();
      gun.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        // (anim-online: sin lo escondido, el porongo del Liquidificador o los
        // efectos de los elementales: si no, el mate quedaba flotando lejos de la palma)
        for (let q = o; q; q = q.parent) if (q === bomb || (!q.visible && globalThis.__mduNoAvatarBlend !== true)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(b2.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      });
      if (!box.isEmpty()) base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    } else mate.rotation.set(MATE_BACK, 0, 0);
  }
  mergeParts(gun);
  T = { gun, iMuzzle: -1, iMouth: -1, base };
  n = 0;
  gun.traverse((o) => {
    if (o === muzzle) T.iMuzzle = n;
    if (o === mouth) T.iMouth = n;
    n++;
  });
  tpl.set(src, T);
  return T;
}

// Las mallas sueltas de un grupo, juntas por material (las que se ven, sin
// hijos ni huesos). Lo que no se puede juntar queda como estaba.
function mergeParts(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.children.length || Array.isArray(o.material) || o.morphTargetInfluences) return;
    for (let x = o; x && x !== root; x = x.parent) if (!x.visible) return;
    const geo = o.geometry;
    if (!geo?.attributes?.position) return;
    const k = `${o.material.uuid}|${Object.keys(geo.attributes).sort().join(',')}|${geo.index ? 1 : 0}`;
    let L = sets.get(k);
    if (!L) sets.set(k, (L = []));
    L.push(o);
  });
  for (const L of sets.values()) {
    if (L.length < 2) continue;
    // (las caras de una caja o un cilindro vienen en grupos: con un material, sobran)
    const geos = L.map((o) => {
      const g = o.geometry.clone().applyMatrix4(tmpM.multiplyMatrices(inv, o.matrixWorld));
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, L[0].material);
    m.castShadow = false;
    m.renderOrder = L[0].renderOrder;
    root.add(m);
    for (const o of L) o.removeFromParent();
  }
}

export default class Avatars {
  constructor(game, session) {
    this.g = game;
    this.s = session;
    this.list = new Map();
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // (las pruebas de cinemáticas, Tools/mdu-blender/t_cineqa.mjs, revisan a todos los muñecos)
    if (globalThis.__mduCineQA) (globalThis.__mduAvatarSets ||= new Set()).add(this);
  }

  materials(id) {
    const T = this.g.textures;
    const c = PONCHOS[id % PONCHOS.length];
    const std = (color, map) => new THREE.MeshStandardMaterial({ color, map: map || null, roughness: 0.85 });
    return {
      // piel sana: la textura de los zombies (manchada) no va en los vivos
      skin: std(0xd29a74),
      // la textura de arpillera oscurece: el color base va más vivo
      poncho: std(new THREE.Color(c).multiplyScalar(1.7), T.burlap),
      pants: std(0x3a3a34, T.zpants),
      boots: std(0x241a12),
      hat: std(0x2a2620),
      band: std(0x8a1a14),
      hair: std(0x1e1712),
      eye: new THREE.MeshBasicMaterial({ color: 0x120c08 }),
      mate: std(0x8a6038, T.gourd),
      metal: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }),
    };
  }

  add(r) {
    if (this.list.has(r.id)) return;
    const G = this.g.zombies.geo;
    const M = this.materials(r.id);
    const group = new THREE.Group();
    const parts = [];
    const put = (geo, mat, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      m.part = i;
      parts.push(m);
      group.add(m);
    };
    put(G.pelvis, M.pants, 0);
    put(G.torso, M.poncho, 1);
    put(G.head, M.skin, 2);
    put(G.uarm, M.poncho, 3);
    put(G.uarm, M.poncho, 4);
    put(G.farm, M.skin, 5);
    put(G.farm, M.skin, 6);
    put(G.thigh, M.pants, 7);
    put(G.thigh, M.pants, 8);
    put(G.shin, M.pants, 9);
    put(G.shin, M.pants, 10);
    put(G.foot, M.boots, 11);
    put(G.foot, M.boots, 12);
    // cosas pegadas a un hueso con un desplazamiento propio (sombrero, cara, poncho)
    const extras = [];
    const attach = (obj, part, x, y, z) => {
      obj.matrixAutoUpdate = false;
      group.add(obj);
      extras.push({ obj, part, off: new THREE.Matrix4().makeTranslation(x, y, z) });
      return obj;
    };
    // sombrero de ala ancha con cinta colorada
    const hat = new THREE.Group();
    hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 20), M.hat));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.11, 16), M.hat);
    crown.position.y = 0.06;
    hat.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.024, 16), M.band);
    band.position.y = 0.02;
    hat.add(band);
    attach(hat, 2, 0, 0.125, -0.005);
    // cara: ojos, nariz, bigote y pelo en la nuca
    const face = new THREE.Group();
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), M.eye);
      eye.position.set(s * 0.045, 0.025, 0.12);
      face.add(eye);
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.02), M.hair);
      mus.position.set(s * 0.028, -0.03, 0.125);
      mus.rotation.z = s * -0.25;
      face.add(mus);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.035), M.skin);
    nose.position.set(0, 0, 0.13);
    face.add(nose);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), M.hair);
    hair.position.set(0, 0.07, -0.115);
    face.add(hair);
    attach(face, 2, 0, 0, 0);
    // poncho: cuelga de los hombros y se bambolea (el pivote queda en el cuello)
    const poncho = new THREE.Group();
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.36, 0.5, 14, 1, true), M.poncho);
    cape.material.side = THREE.DoubleSide;
    cape.position.y = -0.25;
    cape.scale.set(1, 1, 0.72);
    poncho.add(cape);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 14), M.poncho);
    collar.rotation.x = Math.PI / 2;
    poncho.add(collar);
    const ponchoAt = attach(poncho, 1, 0, 0.27, 0);
    // el mate en la mano derecha
    const mate = new THREE.Group();
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.mate);
    gourd.scale.set(1, 1.15, 1);
    mate.add(gourd);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 6), M.metal);
    straw.position.set(0.02, 0.08, 0);
    straw.rotation.z = -0.25;
    mate.add(straw);
    const hand = new THREE.Object3D();
    hand.add(mate);
    mate.position.set(0, -0.2, 0.06);
    // (net/gauchoSkin lo para en la palma del gaucho de verdad)
    mate.userData.handMate = true;
    hand.matrixAutoUpdate = false;
    group.add(hand);
    // cartelito con el nombre
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(r.name || 'Jugador'), transparent: true, depthTest: false, sizeAttenuation: true }));
    tag.scale.set(1.2, 0.3, 1);
    tag.renderOrder = 10;
    tag.visible = !r.noTag;
    group.add(tag);
    // compañeros de partida: la misma malla de un solo color, dibujada solo
    // donde algo la tapa (así se los ve a través de las paredes, como en el original)
    let xray = null;
    const xparts = [];
    if (this.team) {
      xray = new THREE.MeshBasicMaterial({ color: XRAY[r.id % XRAY.length], transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
      for (const m of [...parts, hat.children[0], crown, cape]) {
        const x = new THREE.Mesh(m.geometry, xray);
        x.matrixAutoUpdate = false;
        x.renderOrder = 9;
        x.visible = false;
        m.add(x);
        xparts.push(x);
      }
    }
    this.root.add(group);
    const fake = {
      P: makePose(),
      phase: Math.random() * 6,
      speedType: 'walk',
      limp: 0,
      headTilt: 0,
      armOff: 0,
      slot: r.id,
      scale: 1,
    };
    // (people y g: ui/cineLife, la vida de los muñecos de escena)
    this.list.set(r.id, { r, group, parts, hand, tag, fake, M, extras, poncho: ponchoAt, sway: new THREE.Vector2(), lastYaw: r.yaw, mats: Array.from({ length: PART_COUNT }, () => new THREE.Matrix4()), name: r.name, xray, xparts, xk: 0, people: this, g: this.g });
    // el gaucho de verdad (net/gauchoSkin.js): cuando baja, las piezas se esconden
    gauchoSkin(this.list.get(r.id), [...parts, hat, face, ponchoAt]);
  }

  // El escudo armado colgado en la espalda (del torso, mirando para atrás,
  // con la parte de abajo un poco separada por el poncho). Se arma la primera
  // vez que hace falta; si se rompe, se esconde.
  // up: el mejorado (world/ShieldUpgrade); front: puesto adelante. Se rearma
  // cuando cambia alguna de las dos.
  backShield(a, on, up = false, front = false) {
    a.shieldOn = on;
    const key = on ? `${up ? 1 : 0}${front ? 1 : 0}` : '';
    if (key !== (a.shieldKey || '') && a.shield) {
      a.shield.removeFromParent();
      a.extras = a.extras.filter((e) => e.obj !== a.shield);
      a.shield = null;
    }
    a.shieldKey = key;
    if (on && !a.shield) {
      const s = shieldModel(this.g.world.M, this.g.mapId, up);
      s.traverse((o) => {
        o.castShadow = false;
      });
      s.matrixAutoUpdate = false;
      a.group.add(s);
      const off = front
        ? new THREE.Matrix4().makeTranslation(0.08, 0.02, 0.36 + s.userData.back * 0.5).multiply(SHIELD_FRONT).multiply(new THREE.Matrix4().makeScale(0.9, 0.9, 0.9))
        : new THREE.Matrix4().makeTranslation(0, -0.02, -0.2 - s.userData.back * 0.9).multiply(SHIELD_TILT).multiply(new THREE.Matrix4().makeScale(0.9, 0.9, 0.9));
      a.extras.push({ obj: s, part: 1, off });
      s.matrix.multiplyMatrices(a.mats[1], off);
      a.shield = s;
    }
    if (a.shield) a.shield.visible = on;
  }

  // El mate que tiene en la mano un compañero (lo avisa él: Session 'wpn').
  // Es una copia del que ya está armado en weapons.models (mismas mallas y
  // materiales, ya compilados en la carga: no traba). Sin eso, el gauchito
  // lleva el mate de siempre.
  // c: el camuflaje de la armería que lleva (weapons/camos.js; solo sin
  // mejorar). Ese sí se arma acá si todavía no estaba.
  setGun(a, w, u, c) {
    a.gun?.removeFromParent();
    a.gun = null;
    const W = this.g.weapons;
    // (la hoz de oro: 'oro', mejorada o no; weapons/Weapons.js equipModel)
    const gold = w === 'hoz' && c === 'oro';
    const camo = gold || (!u && c && CAMO_BY_ID[c] && camoable(w)) ? c : null;
    const src = w && ((camo && W?.modelOf?.(w, gold ? u : 0, camo)) || W?.models?.get(`${w}|${u}`) || W?.models?.get(`${w}|0`));
    if (!src?.root) return;
    // (la copia de primera persona ya preparada para la mano del muñeco, una
    // por modelo: gunTemplate; cada compañero la suya, con las mismas mallas)
    // (los de una mano, parados en la palma: net/gauchoSkin)
    // (anim-online: los mates de dos manos también, parados en la palma; __mduNoAvatarBlend: como fusil)
    const T = gunTemplate(src, W, !TWO_HAND.has(w) || (globalThis.__mduNoAvatarBlend !== true && !!src.mouth && !!src.mate));
    const gun = T.gun.clone();
    let n = 0;
    a.muzzle = null;
    a.mouth = null;
    gun.traverse((o) => {
      if (n === T.iMuzzle) a.muzzle = o;
      if (n === T.iMouth) a.mouth = o;
      n++;
    });
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.add(gun);
    a.group.add(holder);
    a.gun = holder;
    a.gunBase = T.base || null;
  }

  // El termo de cebar de un compañero (una copia del de primera persona, sin
  // la mano) y su chorro. Se arma la primera vez que ceba.
  termo(a) {
    if (a.termo) return a.termo;
    const W = this.g.weapons;
    const src = W?.termo;
    if (!src?.root) return null;
    const M = W.T ? VM.mats(W.T) : null;
    const handMats = M ? new Set([M.skin, M.nail, M.sleeve, M.cuff]) : new Set();
    const t = src.root.clone();
    const drop = [];
    t.traverse((o) => {
      if (o.userData.hand || (o.isMesh && handMats.has(o.material))) drop.push(o);
      else if (o.isMesh && o.material === src.body?.material) o.material = TERMO_BODY;
      o.castShadow = false;
    });
    for (const o of drop) o.removeFromParent();
    // (el pico mira a +x: para el lado del mate, la mano derecha; el de
    // primera persona puede estar a medio cebar: sin su giro)
    t.rotation.set(0, 0, 0);
    t.position.set(0, -TERMO_GRIP, 0);
    t.visible = true;
    const pivot = new THREE.Group();
    pivot.matrixAutoUpdate = false;
    pivot.add(t);
    pivot.scale.setScalar(TERMO_K);
    a.group.add(pivot);
    // la punta del pico en la copia (girada con el termo)
    const tip = new THREE.Object3D();
    tip.position.set(0.032, 0.262 - TERMO_GRIP, 0);
    pivot.add(tip);
    const stream = new THREE.Mesh(src.stream.geometry, src.stream.material);
    stream.matrixAutoUpdate = true;
    stream.visible = false;
    stream.frustumCulled = false;
    this.root.add(stream);
    a.termo = { pivot, tip, stream };
    return a.termo;
  }

  // El porongo del Liquidificador (la copia del de primera persona, sin la mano),
  // con el que el compañero lo carga (net/gauchoSkin termoAt, prop 'porongo').
  porongo(a) {
    if (a.porongoP !== undefined) return a.porongoP;
    a.porongoP = null;
    const W = this.g.weapons;
    const src = W?.models?.get('liquidificador|0')?.pava?.porongo;
    const s0 = W?.termo?.stream;
    if (!src || !s0) return null;
    const M = W.T ? VM.mats(W.T) : null;
    const handMats = M ? new Set([M.skin, M.nail, M.sleeve, M.cuff]) : new Set();
    const t = src.clone();
    const drop = [];
    t.traverse((o) => {
      if (o.userData.hand || (o.isMesh && handMats.has(o.material))) drop.push(o);
      o.castShadow = false;
    });
    for (const o of drop) o.removeFromParent();
    t.visible = true;
    t.rotation.set(0, 0, 0);
    t.scale.setScalar(PORONGO_K);
    t.position.set(0, -PORONGO_GRIP * PORONGO_K, 0);
    const pivot = new THREE.Group();
    pivot.matrixAutoUpdate = false;
    pivot.add(t);
    a.group.add(pivot);
    const tip = new THREE.Object3D();
    tip.position.set(0.03 * PORONGO_K, (0.14 - PORONGO_GRIP) * PORONGO_K, 0);
    pivot.add(tip);
    const stream = new THREE.Mesh(s0.geometry, s0.material);
    stream.matrixAutoUpdate = true;
    stream.visible = false;
    stream.frustumCulled = false;
    this.root.add(stream);
    a.porongoP = { pivot, tip, stream };
    return a.porongoP;
  }

  // De dónde sale, en esta pantalla, un tiro de un compañero (Session.remoteShot):
  // la boca del mate que se le ve en la mano o, sin el mate a la vista, la
  // mano. Solo lo que se ve: el tiro de verdad sale de su cámara. null: sin
  // muñeco a la vista (queda el punto que mandó).
  muzzleOf(id, out) {
    const a = this.list.get(id);
    const r = a?.r;
    if (!a || !a.group.visible || r.downed || r.dead || r.corpse || r.ghost) return null;
    if (a.gun?.visible && a.muzzle) {
      a.gun.updateMatrixWorld(true);
      return a.muzzle.getWorldPosition(out);
    }
    return out.set(0, -0.19, 0).applyMatrix4(a.mats[6]);
  }

  // El color del poncho de un compañero (el estero: cada jugador es un
  // personaje; Gil va de colorado).
  restyle(id, hex) {
    const a = this.list.get(id);
    if (a) a.M.poncho.color.set(hex).multiplyScalar(1.7);
  }

  // Los muñecos de los compañeros de la partida (no los de las cinemáticas,
  // los gauchos del mapa ni el cuerpo del final, que usan esta misma clase).
  get team() {
    return !!this.s && this.s.avatars === this;
  }

  // La silueta aparece de a poco cuando algo tapa al compañero (se mira
  // unas veces por segundo si hay pared entre la cámara y su pecho).
  updateXray(a, dt) {
    const g = this.g;
    const r = a.r;
    a.losT = (a.losT || 0) - dt;
    if (a.losT <= 0) {
      a.losT = 0.12;
      const cam = g.camera.position;
      tmpP.set(r.pos.x, (r.pos.y || 0) + (r.downed ? 0.35 : 1.1), r.pos.z);
      tmpD.subVectors(tmpP, cam);
      const len = tmpD.length();
      a.hidden = len > 0.5 && g.world.raycast(cam, tmpD.divideScalar(len), len - 0.3) !== Infinity;
    }
    a.xk += ((a.hidden ? 1 : 0) - a.xk) * Math.min(1, dt * 8);
    const on = a.xk > 0.02;
    if (on !== !!a.xOn) {
      a.xOn = on;
      for (const x of a.xparts) x.visible = on;
    }
    a.xray.opacity = 0.55 * a.xk;
  }

  // Los compañeros caídos: dónde va el ícono de reanimar en la pantalla
  // (arriba del cuerpo; si queda fuera de vista, en el borde, apuntando).
  revives() {
    const g = this.g;
    const cam = g.camera;
    const W = innerWidth;
    const H = innerHeight;
    // margen: que entren el ícono, el nombre y los metros
    const M = 60;
    const out = [];
    cam.updateMatrixWorld();
    for (const a of this.list.values()) {
      const r = a.r;
      if (!r.downed || r.dead) {
        a.downAt = null;
        a.revAt = null;
        a.near = false;
        continue;
      }
      a.downAt ??= g.time;
      // (mientras alguien lo levanta no se desangra: el anillo no avanza; Session 'rev')
      if (r.revUntil > g.time && a.revAt != null) a.downAt += Math.max(0, g.time - a.revAt);
      a.revAt = g.time;
      // de cerca no hace falta (ya lo dice el cartel de "Mantené [F]") y lo tapaba;
      // (un poco de margen para que no parpadee justo en el borde)
      const dist = g.player.pos.distanceTo(r.pos);
      a.near = dist < (a.near ? 3.4 : 3);
      if (a.near) continue;
      tmpP.set(r.pos.x, (r.pos.y || 0) + 1.3, r.pos.z);
      tmpD.copy(tmpP).applyMatrix4(cam.matrixWorldInverse);
      const front = tmpD.z < -0.05;
      let x = 0;
      let y = 0;
      let edge = !front;
      if (front) {
        tmpP.project(cam);
        x = (tmpP.x * 0.5 + 0.5) * W;
        y = (-tmpP.y * 0.5 + 0.5) * H;
        edge = x < M || x > W - M || y < M || y > H - M;
      }
      let ang = 0;
      if (edge) {
        // hacia dónde está, desde el centro de la pantalla (si está atrás, abajo)
        let dx = front ? x - W / 2 : tmpD.x;
        let dy = front ? y - H / 2 : 0;
        if (Math.abs(dx) + Math.abs(dy) < 1e-4) dy = 1;
        const s = Math.min((W / 2 - M) / Math.max(1e-6, Math.abs(dx)), (H / 2 - M) / Math.max(1e-6, Math.abs(dy)));
        x = W / 2 + dx * s;
        // (sin bajar a las esquinas de abajo: ahí están los puntos y las perks)
        y = Math.min(H / 2 + dy * s, H * 0.58);
        ang = Math.atan2(dy, dx);
      }
      out.push({ id: r.id, name: r.name || '', x, y, edge, ang, dist, k: Math.min(1, (g.time - a.downAt) / BLEED) });
    }
    return out;
  }

  remove(id) {
    const a = this.list.get(id);
    if (!a) return;
    a.group.removeFromParent();
    a.termo?.stream.removeFromParent();
    a.tag.material.map.dispose();
    a.tag.material.dispose();
    for (const m of Object.values(a.M)) m.dispose();
    a.xray?.dispose();
    this.list.delete(id);
  }

  // En gaucho life el compañero se ve como un alma azul (transparente).
  ghostLook(a, on) {
    a.ghost = on;
    for (const m of Object.values(a.M)) {
      m.transparent = on;
      m.opacity = on ? 0.42 : 1;
      m.depthWrite = !on;
      if (m.emissive) m.emissive.set(on ? 0x2a70c8 : 0x000000);
      m.needsUpdate = true;
    }
  }

  // Para la carga (ui/Arrival.load, antes de compilar): compañeros de muestra
  // con el gaucho de verdad, su silueta y el termo de cebar, a la vista, así
  // sus programas se compilan con el mapa y no al aparecer el primero (un
  // cuadro de 170-300 ms en línea); con gaucho life (el penal), también uno
  // como alma (transparente: otro programa). Espera el modelo del gaucho.
  // Devuelve con qué sacarlos (después de warmWorld).
  async warm() {
    if (!this.team) return () => {};
    await new Promise((res) => {
      whenGaucho(res);
      setTimeout(res, 4000);
    });
    const p = this.g.player?.pos;
    const made = [];
    const mk = (id, ghost) => {
      if (this.list.has(id)) this.remove(id);
      this.add({ id, name: '', noTag: true, ghost, pos: new THREE.Vector3((p?.x || 0) + made.length, (p?.y || 0) - 30, p?.z || 0), yaw: 0, pitch: 0, speed: 0, moving: false, crouch: false, net: {} });
      const a = this.list.get(id);
      if (!a) return null;
      a.tag.visible = false;
      if (ghost) this.ghostLook(a, true);
      solvePose(a.mats, a.r.pos.x, a.r.pos.z, 0, 1, a.fake.P);
      a.gs?.pose(true, 0, this.g);
      if (a.gs?.xray) a.gs.xray.visible = true;
      else for (const x of a.xparts) x.visible = true;
      made.push(a);
      return a;
    };
    const a = mk(9999, false);
    if (this.g.vida) mk(9998, true);
    const T = a && this.termo(a);
    if (T) {
      T.pivot.visible = true;
      T.pivot.matrix.makeTranslation(a.r.pos.x, a.r.pos.y + 1, a.r.pos.z);
      T.pivot.matrixWorldNeedsUpdate = true;
      T.stream.visible = true;
      T.stream.position.set(a.r.pos.x, a.r.pos.y + 1, a.r.pos.z);
    }
    for (const m of made) m.group.updateMatrixWorld(true);
    // (al sacarlos, sin tirar sus materiales: si no, three soltaba los
    // programas y el primer compañero de verdad los volvía a compilar)
    return () => {
      for (const m of made) {
        m.group.removeFromParent();
        m.termo?.stream.removeFromParent();
        this.list.delete(m.r.id);
        (this.warmed ||= []).push(m);
      }
    };
  }

  // El mundo se rearmó (partida nueva): los muñecos pasan a la escena nueva,
  // con las mallas de los zombies nuevos.
  rebuild() {
    const rs = [...this.list.values()].map((a) => a.r);
    for (const id of [...this.list.keys()]) this.remove(id);
    this.root.removeFromParent();
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    for (const r of rs) this.add(r);
  }

  update(dt) {
    const g = this.g;
    // los muñecos de los easter eggs (presos, Fierro: offCull = true) fuera de
    // cuadro no se animan ni se recorren: quedan en su última pose hasta volver
    // a verse (0,14 ms por cuadro los presos del penal). No en las cinemáticas.
    // (globalThis.__mduNoNpcCull: como antes)
    const cull = this.offCull === true && globalThis.__mduNoNpcCull !== true && !g.cine && !g.intro?.active && !g.ee?.scene?.cine && g.state === 'playing';
    if (cull) cullFr.setFromProjectionMatrix(cullM.multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse));
    for (const a of this.list.values()) {
      const r = a.r;
      const P = a.fake.P;
      if (a.name !== r.name && r.name) {
        a.name = r.name;
        a.tag.material.map.dispose();
        a.tag.material.map = nameTexture(r.name);
      }
      // los que esperan la próxima ronda no se ven (como en el original)
      a.group.visible = !r.dead || !!r.corpse;
      if (!a.group.visible) continue;
      if (cull) {
        cullS.center.set(r.pos.x, (r.pos.y || 0) + 1, r.pos.z);
        const off = !cullFr.intersectsSphere(cullS);
        if (a.group.mcFrozen !== off) {
          a.group.mcFrozen = off;
          a.group.matrixWorldNeedsUpdate = true;
        }
        if (off) continue;
      } else if (a.group.mcFrozen) a.group.mcFrozen = false;
      // un compañero pegado a la cámara (la bajada de una entrada a tus ojos,
      // dos parados en el mismo lugar) no se ve desde adentro: se esconde
      // mientras la cámara esté dentro de su cuerpo (caído, solo si está a su
      // altura: al levantarlo se ve). (globalThis.__mduNoNearHide: como antes)
      if (this.team && globalThis.__mduNoNearHide !== true) {
        const c = g.camera.position;
        const dx = c.x - r.pos.x;
        const dz = c.z - r.pos.z;
        const h = c.y - (r.pos.y || 0);
        const lim = a.inCam ? 0.72 : 0.6;
        a.inCam = dx * dx + dz * dz < lim * lim && h > -0.3 && h < (r.downed || r.corpse ? 0.7 : 2.1);
        if (a.inCam) {
          a.group.visible = false;
          a.tag.visible = false;
          continue;
        }
      }
      // el mate que tiene en la mano (Session 'wpn')
      const wp = this.team ? this.s.wpn?.get(r.id) : null;
      const wkey = wp?.w ? `${wp.w}|${wp.u | 0}|${wp.c || ''}` : '';
      if (wkey !== (a.wkey || '')) {
        a.wkey = wkey;
        this.setGun(a, wp?.w, wp?.u | 0, wp?.c);
      }
      // pose: caminando, quieto o caído
      if (r.downed || r.dead || r.corpse) {
        g.zombies.poseCrawl(a.fake, dt * (r.corpse || r.dead ? 0 : 0.6));
        P.rootPitch = 1.3;
        P.rootY = (g.world.levels ? r.pos.y || 0 : 0) + 0.02;
        P.rootFwd = 0;
      } else if (r.swim >= 2) {
        // nadando (entities/swim.js): en la superficie pataleando con el mate
        // en alto para que no se moje; buceando, acostado dando brazadas
        const F = a.fake;
        F.baseY = 0;
        F.scale = 1;
        F.wetY = r.pos.y + (r.swim === 3 ? 1.2 : 1.32);
        swimPose(F, P, g.time, r.swim);
        if (r.swim === 2) {
          P.shRp = -1.9;
          P.shRr = 0.2;
          P.elR = -1.2;
        }
      } else {
        P.rootFwd = 0;
        P.rootPitch = 0;
        // (el Monumento tiene pisos bajo cero: el Parque, la Cripta y la Costanera)
        P.rootY = g.world.mon ? r.pos.y || 0 : Math.max(0, r.pos.y);
        a.fake.speedType = r.speed > 5 ? 'run' : 'walk';
        // (los de escena, caminando: el paso de gente por lo que avanzan hacia
        // donde miran, para atrás al revés (entities/personWalk); con el de los
        // muertos los pies patinaban la mitad de lo que caminaban)
        const fwd = a.walkAt ? (r.pos.x - a.walkAt.x) * -Math.sin(r.yaw) + (r.pos.z - a.walkAt.z) * -Math.cos(r.yaw) : 0;
        (a.walkAt ||= new THREE.Vector3()).copy(r.pos);
        if (!this.team && (r.moving || r.speed > 0.4)) {
          const went = Math.abs(fwd) < 2 ? Math.abs(fwd) : 0;
          const s = stepPerson(a, P, went, dt, 0.85, (ph, k) => {
            walkLegs(P, ph, k);
            solvePose(a.mats, 0, 0, 0, 1, P);
          });
          a.fake.phase = (a.fake.phase || 0) + Math.sign(fwd) * s.dph;
          walkLegs(P, a.fake.phase, s.k);
        } else if (r.moving || r.speed > 0.4) g.zombies.poseGait(a.fake, dt, Math.max(1, r.speed), g.time);
        else g.zombies.poseIdle(a.fake, g.time);
        // parado como gaucho: brazos abajo y el mate adelante
        P.torsoP = r.crouch ? 0.55 : 0.05;
        P.hipY = r.crouch ? 0.62 : 0.93;
        P.headP = -r.pitch * 0.5;
        P.shRp = -0.55;
        P.elR = -1.25;
        P.shLp = -0.25 + (r.moving ? Math.sin(a.fake.phase) * 0.35 : 0);
        P.elL = -0.35;
        if (r.shieldFront && r.shield && !r.ghost) {
          // con el escudo adelante: el brazo izquierdo lo sostiene contra el pecho
          P.shLp = -1.15;
          P.shLr = 0.25;
          P.elL = -1.45;
          P.shRp = -0.9;
          P.shRr = -0.2;
          P.elR = -1.1;
        } else if (a.gun) {
          // con su mate de verdad: los dos brazos adelante, apuntando adonde mira
          const up = Math.max(-1, Math.min(1, r.pitch || 0));
          P.shRp = -1.35 - up;
          P.shRr = -0.05;
          P.elR = -0.35;
          P.shLp = -1.2 - up * 0.9;
          P.shLr = 0.45;
          P.elL = -0.75;
        } else {
          P.shRr = -0.1;
          P.shLr = 0.1;
        }
      }
      // (las cinemáticas pueden poner su pose: levantar el mate, arrodillarse)
      r.poseFn?.(P);
      const fw = P.rootFwd || 0;
      solvePose(a.mats, r.pos.x + Math.sin(r.yaw + Math.PI) * fw, r.pos.z + Math.cos(r.yaw + Math.PI) * fw, r.yaw + Math.PI, 1, P);
      // (r.clips: un muñeco de escena que se mueve con los clips, el nado del final del penal)
      a.gs?.pose(true, (this.team || r.clips) && !r.poseFn ? dt : 0, g);
      for (const m of a.parts) {
        m.matrix.copy(a.mats[m.part]);
        m.matrixWorldNeedsUpdate = true;
      }
      a.hand.matrix.copy(a.mats[6]);
      a.hand.matrixWorldNeedsUpdate = true;
      // el poncho se queda atrás al correr y se abre al girar
      let dy = r.yaw - a.lastYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      a.lastYaw = r.yaw;
      const turn = dt > 0 ? dy / dt : 0;
      const tx = -Math.min(0.5, (r.speed || 0) * 0.08) + Math.sin(g.time * 3 + r.id) * 0.03;
      const tz = Math.max(-0.35, Math.min(0.35, -turn * 0.08));
      a.sway.x += (tx - a.sway.x) * Math.min(1, dt * 6);
      a.sway.y += (tz - a.sway.y) * Math.min(1, dt * 6);
      for (const e of a.extras) {
        e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
        if (e.obj === a.poncho) e.obj.matrix.multiply(tmpRot.makeRotationFromEuler(tmpEul.set(a.sway.x, 0, a.sway.y)));
        e.obj.matrixWorldNeedsUpdate = true;
      }
      // el escudazo de un compañero (world/ShieldUpgrade 'bash'): el escudo sale para adelante
      const bk = a.bashT ? Math.max(0, 1 - (g.time - a.bashT) / 0.4) : 0;
      if (bk > 0 && a.shield && a.shieldKey?.[1] === '1') a.shield.matrix.multiply(tmpRot.makeTranslation(0, 0, Math.sin(bk * Math.PI) * 0.3));
      const armed = !r.downed && !r.dead && !r.corpse && !r.ghost;
      // (con el escudo adelante, el mate no está en la mano)
      const front = !!r.shieldFront && !!r.shield && armed;
      a.hand.visible = armed && !a.gun && !front;
      if (a.gun) {
        // en la mano derecha (el brazo va adelante), girado con la mirada
        // (yaw y pitch, como la cámara)
        // (anim-online: con el brazo ocupado en el facón, la granada o tomando, el mate escondido)
        a.gun.visible = armed && (r.swim || 0) < 2 && !front && !(a.gs?.actW > 0.05 && globalThis.__mduNoAvatarBlend !== true);
        if (a.gun.visible) {
          // (un mate: derecho, girado con el cuerpo y apenas con la mirada)
          const mate = !!a.mouth;
          tmpE.set(mate ? Math.max(-0.3, Math.min(0.3, (r.pitch || 0) * 0.3)) : Math.max(-1.2, Math.min(1.2, r.pitch || 0)), r.yaw, 0, 'YXZ');
          const palm = mate && a.gunBase && a.gs?.palm?.k > 0.01 ? a.gs.palm : null;
          if (palm) {
            // parado en la palma del gaucho (net/gauchoSkin palmMate), derecho
            tmpE.x = 0;
            tmpQ.setFromEuler(tmpE);
            // (los Gemelos volcando: el mate sigue a la palma; anim-online)
            if (a.gs.mateRoll) tmpQ.premultiply(tmpQ2.setFromUnitVectors(UP_Y, palm.up));
            tmpP.copy(a.gunBase).applyQuaternion(tmpQ);
            tmpD.copy(palm.at).applyMatrix4(tmpM.copy(a.group.matrixWorld).invert()).sub(tmpP);
            tmpP.set(0, -0.19, 0).applyMatrix4(a.mats[6]).add(tmpA.copy(MATE_AT).applyQuaternion(tmpQ));
            tmpP.lerp(tmpD, Math.min(1, palm.k));
          } else {
            tmpQ.setFromEuler(tmpE);
            // el Sable Corvo en un tajo o en el saludo: gira con el brazo
            // (net/gauchoSkin sableArm; los ejes del arma, girados media vuelta)
            const sq = a.gs?.sabQ;
            if (sq && !mate) tmpQ.multiply(tmpQ2.set(-sq.x, sq.y, -sq.z, sq.w));
            tmpP.copy(mate ? MATE_AT : GUN_OFF).applyQuaternion(tmpQ);
            tmpD.set(0, -0.19, 0).applyMatrix4(a.mats[6]);
            tmpP.add(tmpD);
          }
          a.gun.matrix.compose(tmpP, tmpQ, ONE);
          a.gun.matrixWorldNeedsUpdate = true;
        }
      }
      // cebando (gauchoSkin pourArm): el termo en la mano libre, inclinado
      // hacia el mate, y el chorro del pico a la boca
      const pk = a.gs?.pourK || 0;
      // (anim-online: el cebado de Blender; el termo rígido en la mano izquierda, net/gauchoSkin termoAt)
      const tm = globalThis.__mduNoAvatarBlend !== true ? a.gs?.tm : null;
      const pp = tm?.on && tm.prop === 'porongo' ? this.porongo(a) : null;
      for (const X of [a.porongoP, a.termo]) {
        if (X && X !== (pp || (tm?.on ? a.termo : null))) {
          X.pivot.visible = false;
          X.stream.visible = false;
        }
      }
      if (tm?.on && armed && a.gun?.visible && a.mouth) {
        const T = pp || this.termo(a);
        if (T) {
          T.pivot.visible = true;
          T.pivot.matrix.compose(tm.pos, tm.q, tmpB.setScalar(tm.k)).premultiply(tmpM.copy(a.group.matrixWorld).invert());
          T.pivot.matrixWorldNeedsUpdate = true;
          T.stream.visible = tm.pour;
          if (tm.pour) {
            const mo = a.mouth;
            T.pivot.updateMatrixWorld(true);
            a.gun.updateMatrixWorld(true);
            const s0 = T.tip.getWorldPosition(tmpA);
            const s1 = mo.getWorldPosition(tmpB);
            const len = s0.distanceTo(s1);
            T.stream.position.copy(s0);
            T.stream.quaternion.setFromUnitVectors(DOWN, tmpB.sub(s0).normalize());
            T.stream.scale.set(1.3, len, 1.3);
          }
        }
      } else if (a.gs?.pour && armed && a.gun?.visible && a.mouth) {
        const T = this.termo(a);
        if (T) {
          T.pivot.visible = true;
          tmpQ.setFromEuler(tmpE.set(0, r.yaw, 0, 'YXZ'));
          tmpQ.multiply(tmpQ2.setFromAxisAngle(AXIS_Z, -TERMO_TILT * pk));
          tmpD.set(0, -0.19, 0).applyMatrix4(a.mats[5]);
          T.pivot.matrix.compose(tmpD, tmpQ, tmpB.setScalar(TERMO_K));
          T.pivot.matrixWorldNeedsUpdate = true;
          T.stream.visible = pk > 0.9;
          if (T.stream.visible) {
            T.pivot.updateMatrixWorld(true);
            a.gun.updateMatrixWorld(true);
            const s0 = T.tip.getWorldPosition(tmpA);
            const s1 = a.mouth.getWorldPosition(tmpB);
            const len = s0.distanceTo(s1);
            T.stream.position.copy(s0);
            T.stream.quaternion.setFromUnitVectors(DOWN, tmpB.sub(s0).normalize());
            T.stream.scale.set(1.3, len, 1.3);
          }
        }
      } else if (a.termo) {
        a.termo.pivot.visible = false;
        a.termo.stream.visible = false;
      }
      // (el alma de gaucho life no lo lleva)
      const shield = !!r.shield && !r.ghost;
      const skey = shield ? `${r.shieldUp ? 1 : 0}${front ? 1 : 0}` : '';
      if (shield !== !!a.shieldOn || skey !== (a.shieldKey || '')) this.backShield(a, shield, !!r.shieldUp, front);
      // en gaucho life el compañero se ve como un alma azul (y los muertos que
      // hablan, r.anima: los presos del penal, Fierro en la torre; esos con su
      // pose de siempre, sentados o parados)
      const ghost = !!(r.ghost || r.anima);
      if (ghost !== !!a.ghost) this.ghostLook(a, ghost);
      a.tag.position.set(r.pos.x, r.pos.y + (r.downed ? 0.9 : 2.05), r.pos.z);
      const d = a.tag.position.distanceTo(g.camera.position);
      a.tag.material.opacity = d > 34 ? 0 : 0.95;
      // de cerca se achica (a 2 m tapaba media pantalla); de 8 m para allá, el de siempre
      const k = Math.min(1, Math.max(0.3, d / 8));
      a.tag.scale.set(1.2 * k, 0.3 * k, 1);
      a.tag.material.color.setRGB(1, r.downed ? 0.4 : 1, r.downed ? 0.4 : 1);
      if (a.xray) this.updateXray(a, dt);
      // caído: el nombre ya va con el ícono de reanimar
      if (this.team) a.tag.visible = !r.downed;
    }
    if (this.team) g.hud.setRevives(this.revives());
  }

  dispose() {
    if (this.team) this.g.hud.setRevives([]);
    for (const id of [...this.list.keys()]) this.remove(id);
    this.root.removeFromParent();
    globalThis.__mduAvatarSets?.delete(this);
  }
}

function nameTexture(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 34px "Special Elite", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = '#f0e6cc';
  ctx.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
