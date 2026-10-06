import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flattenProps } from './castleLean';
import { compactGroup } from './props';
import { flattenable } from './perkMachines';
import { MAP_ID, FEATURES } from '../config/map';

// Lo quieto de cada mapa, más barato (2026-10-04, pedido del usuario: juntar lo
// fijo y congelar lo que no se mueve; empezó en el penal como penalLean).
//
// A. La utilería quieta (World.addStatic) ya va junta por material en todo el
//    mapa (World.finalizeStatic), un dibujo por material en cada pasada
//    (principal, G-buffer, espejo del agua, sombras). La de material liso (sin
//    textura) va a pocas mallas con castleLean.flattenProps (lo del castillo:
//    color, rugosidad, metálico, brillo y reflejo de fx/Epic por vértice, el
//    material de perkMachines.flatten). Estaba en todo el mapa (nunca se
//    escondía por cuarto): no cambia qué se recorta. El castillo ya lo hace en
//    su gancho (Castle.js). Penal: 28 mallas → 3.
//    globalThis.__mduNoStaticFlat (todos), __mduNoFlat_<mapa> (uno; el viejo
//    __mduNoPenalFlat sigue andando) o __mduNoMerge, al cargar: como antes.
// B. Lo que core/matrixCache igual recorre en cada cuadro: las mallas de
//    finalizeStatic (a un grupo `statics`), los grupos de GeoBuilder
//    (arquitectura, terreno: mallas sin hijos con la matriz fija), los haces de
//    luz de las ventanas (fx/Shafts: su update solo toca materiales) quedan
//    congelados (mcFrozen: no se recorren mientras la raíz no se mueva); el mate
//    supremo del altar del penal, escondido hasta el final, dormido (mcSleep).
//    Las puertas: world/Interactables (freezeDoors).
//    globalThis.__mduNoFreeze (todos) o __mduNoFreeze_<mapa>, al cargar: como antes.
// C. Grupos de decorado quieto armados pieza por pieza (la red y los horcones
//    del secadero del cráneo en el estero: 18 dibujos), una malla por material
//    (leanGroup = props.compactGroup). Solo lo que no se mueve ni se usa.
//    globalThis.__mduNoGroupMerge (todos) o __mduNoGroupMerge_<mapa>, al cargar:
//    como antes.
// Para la prueba de imagen en la misma página, al cargar: __mduFlatAB = true
// arma también las mallas de antes y deja globalThis.__mduFlatToggle(on);
// __mduFreezeAB = true deja globalThis.__mduFreezeToggle(on); __mduMergeAB =
// true deja la copia suelta de cada grupo de C y globalThis.__mduGroupToggle(on).
export const flatOn = () => !FEATURES.castle && !globalThis.__mduNoMerge && !globalThis.__mduNoStaticFlat && !globalThis[`__mduNoFlat_${MAP_ID}`] && !(MAP_ID === 'penal' && globalThis.__mduNoPenalFlat);
export const freezeOn = () => !globalThis.__mduNoFreeze && !globalThis[`__mduNoFreeze_${MAP_ID}`];
// (no en el castillo: sus puertas son otras —puente, hielo—. El Monumento sí:
// las vallas, los portones de bronce y las rejas solo se mueven al abrir, como
// las de los otros mapas; globalThis.__mduNoMonuFreeze: como antes)
export const freezeDoors = () => freezeOn() && !FEATURES.castle && !(FEATURES.monumento && globalThis.__mduNoMonuFreeze);

// D. El castillo (2026-10-05, Mirador con 28 zombies ~1000 dibujos): la
//    arquitectura sale de varios constructores (Levels, Castle, castleRooms,
//    castleHalls, castleTrim, castleCaves) que repiten los mismos materiales,
//    y la utilería junta también: todo lo quieto colgado de w.root con el mismo
//    material, atributos y sombras va a una malla (mergeStructure, lo de 97 que
//    había quedado guardado). Todo eso ya estaba en todo el mapa (no se
//    escondía por cuarto). Y los marcos de piedra de las puertas (nunca se
//    mueven; las hojas sí) van juntos. globalThis.__mduNoCastleStruct /
//    __mduNoCastleFrames (o __mduNoMerge), al cargar: como antes. Prueba:
//    __mduStructAB → __mduStructToggle(on).
export const structOn = () => FEATURES.castle && !globalThis.__mduNoMerge && !globalThis.__mduNoCastleStruct;
export const framesOn = () => FEATURES.castle && !globalThis.__mduNoMerge && !globalThis.__mduNoCastleFrames;
// las hojas de las puertas del castillo (las de dos hojas), cerradas o abiertas
// del todo, en una copia junta como en los otros mapas (world/Interactables).
// (el rastrillo no: el asedio lo sube y lo baja por su cuenta)
export const castleDoorsOn = () => FEATURES.castle && !globalThis.__mduNoMerge && !globalThis.__mduNoCastleDoors;

export const groupOn = () => !globalThis.__mduNoMerge && !globalThis.__mduNoGroupMerge && !globalThis[`__mduNoGroupMerge_${MAP_ID}`];
export function leanGroup(obj) {
  if (!groupOn() || !obj?.isObject3D) return obj;
  const ab = globalThis.__mduMergeAB === true;
  // (solo la prueba) lo que se va a juntar, copiado adentro del grupo (se mueve
  // con él) y escondido, para alternar
  let before = null;
  if (ab) {
    before = [];
    obj.traverse((o) => {
      if (o !== obj && o.isMesh) before.push(o);
    });
  }
  const pre = ab ? new Map(before.map((o) => [o, o.matrixWorld.clone()])) : null;
  if (ab) obj.updateMatrixWorld(true);
  compactGroup(obj);
  if (ab) {
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const old = new THREE.Group();
    old.name = 'leanOld';
    const gone = before.filter((o) => !o.parent);
    for (const o of gone) {
      const c = new THREE.Mesh(o.geometry, o.material);
      c.castShadow = o.castShadow;
      c.receiveShadow = o.receiveShadow;
      c.renderOrder = o.renderOrder;
      c.frustumCulled = o.frustumCulled;
      c.layers.mask = o.layers.mask;
      new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      old.add(c);
    }
    const merged = obj.children.filter((c) => c.isMesh && !before.includes(c));
    old.visible = false;
    obj.add(old);
    const list = (globalThis.__mduGroupAB ||= []);
    list.push([merged, old]);
    globalThis.__mduGroupToggle = (on) => {
      for (const [a, b] of list) {
        for (const m of a) m.visible = on;
        b.visible = !on;
      }
      return { grupos: list.length, juntas: list.reduce((n, x) => n + x[0].length, 0), sueltas: list.reduce((n, x) => n + x[1].children.length, 0) };
    };
  }
  return obj;
}

export function installStaticLean(w) {
  const flat = flatOn();
  const freeze = freezeOn();
  const struct = structOn();
  const frames = framesOn();
  if (!flat && !freeze && !struct && !frames) return;
  const fin = w.finalizeStatic;
  w.finalizeStatic = function () {
    const ab = flat && globalThis.__mduFlatAB === true ? keepCopies(this) : null;
    const before = new Set(this.root.children);
    let flats = [];
    if (flat) {
      flattenProps(this, { pbr16: true });
      flats = this.root.children.filter((o) => !before.has(o));
    }
    const r = fin.call(this);
    if (ab) abToggle(this, ab, flats);
    const AB = globalThis.__mduStructAB === true ? [] : null;
    if (frames) mergeDoorFrames(this, AB);
    // (prueba) las puertas del castillo juntas: la copia y las hojas sueltas, para alternar
    if (AB && castleDoorsOn()) {
      for (const it of this.g?.interact?.list || []) {
        const d = it.kind === 'door' ? it.door : null;
        if (!d?.closed) continue;
        for (const p of d.pieces) d.group.add(p.obj);
        AB.push([[d.closed], d.pieces.map((p) => p.obj)]);
      }
    }
    if (struct) mergeStructure(this, AB);
    if (AB) {
      globalThis.__mduStructToggle = (on) => {
        for (const [news, olds] of AB) {
          for (const o of news) o.visible = on;
          for (const o of olds) o.visible = !on;
        }
        return { juntas: AB.reduce((n, x) => n + x[0].length, 0), sueltas: AB.reduce((n, x) => n + x[1].length, 0) };
      };
    }
    if (freeze) freezeStatics(this, before);
    return r;
  };
}

function freezeStatics(w, before) {
  // (las puertas cerradas ya están anotadas acá: world/Interactables)
  const reg = (w.frozen ||= []);
  // lo que agregó finalizeStatic (y lo aplanado): mallas quietas en el origen
  const statics = new THREE.Group();
  statics.name = 'statics';
  for (const o of [...w.root.children]) if (!before.has(o) && o.isMesh && !o.matrixAutoUpdate && !o.children.length) statics.add(o);
  statics.matrixAutoUpdate = false;
  w.root.add(statics);
  reg.push(statics);
  // la arquitectura y el terreno: grupos de GeoBuilder (mallas con la matriz fija, sin hijos)
  for (const o of w.root.children) {
    if (o === statics || !o.isGroup || !o.children.length || !o.matrix.equals(IDENT)) continue;
    if (o.children.every((c) => c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !c.matrixAutoUpdate && !c.children.length && c.matrix.equals(IDENT))) reg.push(o);
  }
  const beams = w.g?.ambience?.beams?.root;
  if (beams) reg.push(beams);
  for (const o of reg) o.mcFrozen = true;
  const sup = w.g?.ee?.altarSup;
  if (sup) sup.mcSleep = true;
  if (globalThis.__mduFreezeAB !== true) return;
  globalThis.__mduFreezeToggle = (on) => {
    for (const o of reg) {
      o.mcFrozen = on;
      o.matrixWorldNeedsUpdate = true;
    }
    if (sup) sup.mcSleep = on;
    let n = 0;
    for (const o of reg) o.traverse(() => n++);
    return { roots: reg.length, objetos: n };
  };
}
const IDENT = new THREE.Matrix4();

// (solo la prueba) las listas de lo liso antes de aplanar
function keepCopies(w) {
  const out = new Map();
  for (const [m, list] of w.mergedProps || []) if (flattenable(m) && list.length) out.set(m, list.map((x) => x.clone()));
  return out;
}

// (solo la prueba) las mallas por material como las arma finalizeStatic, y el cambio
function abToggle(w, copies, flats) {
  const old = [];
  for (const [mat, list] of copies) {
    const g = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    if (!g) continue;
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = !mat.userData?.noShadow;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    w.root.add(m);
    old.push(m);
  }
  globalThis.__mduFlatToggle = (on) => {
    for (const o of flats) o.visible = on;
    for (const o of old) o.visible = !on;
    return { flats: flats.length, old: old.length };
  };
}

// D. Lo quieto colgado de w.root (mallas sueltas y grupos de mallas con la
// matriz fija), junto por material, atributos y sombras. (AB: [nuevas, viejas])
const BEFORE_R = THREE.Object3D.prototype.onBeforeRender;
function mergeStructure(w, AB) {
  const root = w.root;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map();
  const take = (o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.matrixAutoUpdate || !o.visible || o.children.length) return;
    if (o.onBeforeRender !== BEFORE_R || o.userData.dynamic || o.userData.noStruct || Object.keys(o.geometry.morphAttributes || {}).length) return;
    const attrs = Object.entries(o.geometry.attributes).map(([n, a]) => `${n}${a.itemSize}${a.normalized ? 'n' : ''}${a.array.constructor.name}`).sort().join(',');
    const key = `${o.material.uuid}|${attrs}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${o.frustumCulled}|${o.layers.mask}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(o);
  };
  for (const c of [...root.children]) {
    if (c.isMesh) take(c);
    else if (c.isGroup && c.matrix.equals(IDENT) && c.children.length && c.children.every((k) => k.isMesh && !k.matrixAutoUpdate)) c.children.forEach(take);
  }
  const emptied = new Set();
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    const a = list[0];
    const m = new THREE.Mesh(geo, a.material);
    m.castShadow = a.castShadow;
    m.receiveShadow = a.receiveShadow;
    m.renderOrder = a.renderOrder;
    m.frustumCulled = a.frustumCulled;
    m.layers.mask = a.layers.mask;
    m.matrixAutoUpdate = false;
    root.add(m);
    if (AB) {
      AB.push([[m], list]);
      continue;
    }
    for (const o of list) {
      if (o.parent !== root) emptied.add(o.parent);
      o.removeFromParent();
      o.geometry.dispose();
    }
  }
  for (const grp of emptied) if (!grp.children.length) grp.removeFromParent();
}

// D. Los marcos de piedra de las puertas del castillo (userData.doorFrame,
// castleDoor en world/Interactables): todos en una malla por material.
function mergeDoorFrames(w, AB) {
  const I = w.g?.interact?.root;
  if (!I) return;
  const frames = [];
  I.traverse((o) => {
    if (o.userData.doorFrame) frames.push(o);
  });
  if (frames.length < 2) return;
  I.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(w.root.matrixWorld).invert();
  const sets = new Map();
  for (const f of frames) {
    f.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const k = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      if (!sets.has(k)) sets.set(k, []);
      sets.get(k).push(o);
    });
  }
  const news = [];
  for (const list of sets.values()) {
    const geos = list.map((o) => {
      let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    const a = list[0];
    const m = new THREE.Mesh(geo, a.material);
    m.castShadow = a.castShadow;
    m.receiveShadow = a.receiveShadow;
    m.matrixAutoUpdate = false;
    // (aparte de la estructura: así la prueba alterna una cosa por vez)
    m.userData.noStruct = true;
    w.root.add(m);
    news.push(m);
  }
  if (AB) {
    AB.push([news, frames]);
    return;
  }
  for (const f of frames) f.removeFromParent();
}
