import * as THREE from 'three';
import { ISLANDS } from '../config/maps/eclipse';
import { flatMaterial, reflBucket } from './perkMachines';
import { setFarHook, camFrustumIs, pxScale, markUp, upHidden } from '../core/sizeCull';
import { surfaceOnly } from '../fx/Surfaces';

// Las islas de lejos de Eclipse Matero (2026-10-09, el usuario: "posta es
// demasiado exigente"). Las islas no tienen puentes: se pasa de una a otra por
// los desgarros, con el túnel tapando la pantalla, y de cualquier isla las
// otras quedan a más de 100 m. Pero cada una se dibujaba entera, pieza por
// pieza: 40-100 dibujos por isla lejana, ~40-60% de los de cada cuadro.
//
// Al cargar, lo quieto y opaco de cada isla se junta en una o dos mallas con el
// material aplanado de perkMachines (color, rugosidad, metálico, brillo y
// reflejo por vértice; el color de una textura es su promedio). Con la cámara
// en una isla, las otras se dibujan con su malla junta y sus piezas no; la de
// la cámara, entera. Las mallas juntas de todo el mapa (World.finalizeStatic,
// la arquitectura) se parten por isla: la parte de la isla de la cámara se
// dibuja con su material de siempre, las otras van en las juntas.
//
// Solo cambia qué se dibuja, con la cámara en los ojos del jugador
// (core/sizeCull: jugando; en las cinemáticas todo como antes). No se toca
// .visible ni las sombras (las piezas siguen tirando las suyas; las juntas no
// tiran). Cada cámara decide por la isla donde está (el espejo del agua, la
// vista de los portales de la otra punta).
//
// Si algo de una isla cambia después (se mueve, aparece, se esconde, cambia de
// color o de material) esa isla queda entera, como antes, hasta el final.
// Quedan afuera: lo que se mueve, lo transparente o recortado, lo que brilla
// (faroles, brasas: cambian), lo instanciado, lo que apagan por distancia
// v5.zoneCuller y centro.detailCuller (w.warmHidden), la roca de las islas y
// lo aplanado con onBeforeRender (castleLean).
// Además, de las islas de lejos: lo instanciado que en pantalla mide menos de
// FAR_PX de radio (escombros que flotan, flores; la misma vara que
// core/sizeCull usa para las piezas sueltas de lejos) y la suciedad
// (los calcos de ':grime') no se dibujan.
// globalThis.__mduNoEclLejos: como antes (al cargar no se arma; en vivo se
// dibuja todo entero).
//
// Las islas dormidas (2026-10-10, el usuario: "eso se soluciona no renderizando
// todo el mapa"; la isla de La Tapera sola anda a 230 cuadros y adentro de
// Eclipse a 138: el resto del mapa "prendido" costaba ~3 ms por cuadro, casi
// todo en recorrer ~2.800 objetos y dibujar lo suelto de las otras islas). Con
// el jugador en una isla, lo CHICO de las otras se duerme: no se recorre ni se
// dibuja. Quedan despiertos: la malla junta (la silueta), las luces, los
// portales, lo que brilla (aditivo o emisivo) y todo lo de SLEEP_R m de radio o
// más (la torre del Monumento, los techos). Lo eligió el usuario con fotos
// (perf10/shots/dormir): +18 a +24% de cuadros; se pierde lo menudo de lejos
// (el remate roto del edificio del Claro visto desde La Tapera, pedacitos que
// flotan). Se arma al cargar: cada grupo o pieza que está entero en una isla y
// no tiene nada que quede despierto recibe una propiedad `visible` superpuesta
// (dormida → false; despierta → lo que le puso el juego: nadie pisa a nadie).
// Solo jugando con la cámara en los ojos; en las cinemáticas, todo despierto.
// La vista de un portal despierta la isla de la otra punta mientras se dibuja.
// globalThis.__mduNoEclDormir: como antes (en vivo; al cargar no se arma).

// cuánto se agranda la caja de cada isla para decidir dónde está la cámara (m)
const PAD = 12;
// de este radio para arriba una malla es "de todo el mapa" y se parte
const MAP_R = 60;
// piezas que revisa el vigía por cuadro
const SLICE = 200;
// las islas dormidas: de este radio (m) para arriba, queda despierto
const SLEEP_R = 3;
// lo instanciado de lejos: radio en px de pantalla de una copia
const FAR_PX = 10;
// las juntas con textura (2026-10-15): el lado de cada capa del arreglo, cuántas capas a lo sumo y la de "sin textura"
const LJ_TEX = 256;
// los efectos (transparentes o que brillan) de las islas de lejos: de este radio en px de pantalla para abajo no se dibujan
const FX_PX = 8;
const LJ_MAX = 250;
const NO_TEX = 255;
// lo que se mueve aunque no lo parezca (World.dynamic y los nombres de lo que gira o se anima)
const MOVES = /spin|fan|flywheel|wellRig|candle|kilnGlow|orbit|live|bandera|flag|asador|rope|bucket|pulley|aspas|rueda|helice/i;

const ISL = Object.entries(ISLANDS).map(([k, I]) => ({ k, b: I.box }));

// La isla de un punto: la de la caja más cercana, hasta `pad` metros afuera. (Antes ganaba la
// primera de la lista que lo tuviera adentro de su caja agrandada. Con La Tapera más grande —llega
// a x 116— y el margen de 40 m con que se parten las paredes, medio penal quedaba "de La Tapera":
// con el jugador en el penal, sus paredes, mesas y pisos con textura no se dibujaban —se veía la
// base lisa— y al pausar volvían. El usuario, 2026-10-12: "no cargan muchas texturas y al pausar sí
// cargan")
function islandOf(x, z, pad = PAD) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < ISL.length; i++) {
    const [x0, z0, x1, z1] = ISL[i].b;
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    if (dx > pad || dz > pad) continue;
    const d = Math.max(dx, dz);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

const PROTO = (o, f) => Object.getPrototypeOf(o).intersectsFrustum.call(o, f);
const noRay = () => {};

// (three la llama sobre el atributo recién subido a la placa)
function dropArray() {
  this.array = null;
}

// Las texturas de las juntas en un arreglo (DataArrayTexture) de LJ_TEX px, una capa por textura, con mipmaps. Las
// imágenes con flipY se dan vuelta (la fila 0 es v = 0); las que no son sRGB se codifican, así el arreglo (sRGB) da
// el mismo valor que la textura sola. La que no se puede leer queda de su color promedio (avg, en lineal).
function texArray(list, avg) {
  const S = LJ_TEX;
  const N = list.length;
  const data = new Uint8Array(S * S * 4 * N);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const enc = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  const encT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) encT[i] = Math.round(255 * enc(i / 255));
  list.forEach((t, k) => {
    const base = k * S * S * 4;
    let ok = false;
    try {
      const im = t.image;
      cx.clearRect(0, 0, S, S);
      if (im?.data && im.width && im.height && (im.data instanceof Uint8Array || im.data instanceof Uint8ClampedArray) && im.data.length >= im.width * im.height * 4) {
        const tc = document.createElement('canvas');
        tc.width = im.width;
        tc.height = im.height;
        tc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data.buffer, im.data.byteOffset, im.width * im.height * 4), im.width, im.height), 0, 0);
        cx.drawImage(tc, 0, 0, S, S);
        ok = true;
      } else if (im && (im.width || im.videoWidth) && !im.data) {
        cx.drawImage(im, 0, 0, S, S);
        ok = true;
      }
      if (ok) {
        const px = cx.getImageData(0, 0, S, S).data;
        const flip = t.flipY === true;
        for (let y = 0; y < S; y++) {
          const sy = flip ? S - 1 - y : y;
          data.set(px.subarray(sy * S * 4, (sy + 1) * S * 4), base + y * S * 4);
        }
        if (t.colorSpace !== THREE.SRGBColorSpace) {
          for (let i = base; i < base + S * S * 4; i += 4) {
            data[i] = encT[data[i]];
            data[i + 1] = encT[data[i + 1]];
            data[i + 2] = encT[data[i + 2]];
          }
        }
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const a = avg(t) || [1, 1, 1];
      const c = a.map((x) => Math.round(255 * enc(Math.min(1, x))));
      for (let i = base; i < base + S * S * 4; i += 4) {
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
    }
  });
  const tex = new THREE.DataArrayTexture(data, S, S, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function eclipseLejos(g) {
  if (globalThis.__mduNoEclLejos === true) return null;
  const w = g.world;
  const root = w.root;
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  const n = ISL.length;
  const L = {
    dirty: new Uint8Array(n),
    why: [],
    cam: null,
    x: NaN,
    z: NaN,
    me: -1,
    origs: [],
    mats: [],
    k: 0,
    group: null,
    stats: null,
  };
  // la isla de la cámara que dibuja (guardada mientras no se mueva)
  const near = (c) => {
    const e = c.matrixWorld.elements;
    if (c !== L.cam || e[12] !== L.x || e[14] !== L.z) {
      L.cam = c;
      L.x = e[12];
      L.z = e[14];
      L.me = islandOf(L.x, L.z);
    }
    return L.me;
  };
  const live = () => globalThis.__mduNoEclLejos !== true;
  // (2026-10-15, rendimiento: el espejo del agua dibujaba la isla donde está entera, pieza por pieza —en el Claro, de
  // sus 247 dibujos por cuadro, ~70 eran de ahí—. En el agua movida no se distingue: el espejo ve también esa isla
  // con su malla junta, que ahora lleva las texturas. globalThis.__mduEspejoIslaEntera: como antes)
  const flatMirror = (c) => globalThis.__mduEspejoIslaEntera !== true && c === g.water?.mirror;
  // ¿la isla i va con su malla junta para esta cámara?
  const farFor = (i, c) => i >= 0 && L.dirty[i] === 0 && (i !== near(c) || flatMirror(c)) && live();

  // ---------------- qué entra ----------------
  const hidden = new Set(w.warmHidden || []);
  const managed = (o) => {
    for (let q = o; q && q !== root; q = q.parent) if (hidden.has(q)) return true;
    return false;
  };
  // (solo lo marcado como quieto: congelado o con la matriz fija hasta el mundo.
  // Tomar por quieto lo demás que no gira sumaba ~40 piezas y dejaba enteras
  // tres islas por cosas que sí se mueven)
  const dyn = new Set();
  const D = w.dynamic || {};
  for (const v of Object.values(D)) for (const o of Array.isArray(v) ? v : [v]) if (o?.isObject3D) dyn.add(o);
  const dynUp = (o) => {
    for (let q = o; q && q !== root; q = q.parent) if (dyn.has(q) || q.userData?.dynamic) return true;
    return false;
  };
  // (2026-10-15, el usuario: "no me importa que se pierdan detallitos, mientras la imagen grosa se vea y las texturas
  // de sus paredes". Medido: con la cámara en una isla, lo de las otras eran 550-780 dibujos por cuadro —la mitad— y
  // escondiéndolo el juego iba 38-61 % más rápido. Mucho era arquitectura quieta que no entraba en la junta por tener
  // la matriz automática —el Monumento de afuera, la torre de arriba, los faroles— y lo que brilla parejo —techos,
  // establo, rocas—. Ahora entran: si algo de eso se mueve o cambia de verdad, el vigía deja esa isla entera (y lo
  // anota en L.why). globalThis.__mduLejosEstricto: como antes)
  const STRICT = globalThis.__mduLejosEstricto === true;
  const staticUp = (o) => {
    for (let q = o; q && q !== root; q = q.parent) {
      if (dyn.has(q) || q.userData?.dynamic || MOVES.test(q.name || '')) return false;
      if (q.mcFrozen || q.name === 'statics') return true;
      if (q.matrixAutoUpdate && STRICT) return false;
    }
    return true;
  };
  const visUp = (o) => {
    for (let q = o; q; q = q.parent) if (!q.visible) return false;
    return true;
  };
  const glows = (m) => !!m.emissiveMap || (!!m.emissive && (m.emissiveIntensity ?? 1) > 0 && m.emissive.r + m.emissive.g + m.emissive.b > 0.003);
  const okMat = (m) =>
    !!m &&
    (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) &&
    !m.transparent && m.depthWrite && m.colorWrite !== false && m.visible && m.opacity >= 1 && !(m.alphaTest > 0) && !m.alphaMap &&
    m.blending === THREE.NormalBlending && !m.userData?.foliage && !m.userData?.vRefl && !(STRICT ? glows(m) : !!m.emissiveMap) && !m.wireframe;
  const own = (o, p) => Object.prototype.hasOwnProperty.call(o, p);
  const fits = (o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || Array.isArray(o.material)) return false;
    if (!okMat(o.material) || !o.frustumCulled || o.layers.mask !== 1) return false;
    if (own(o, 'onBeforeRender') || own(o, 'onAfterRender')) return false;
    // (las que ya llevan el recorte de core/sizeCull —por chicas, por su cuarto o
    // por planas— siguen por ese: setFarHook)
    if (own(o, 'intersectsFrustum') && !o.__scR && o.__scUp === undefined) return false;
    const geo = o.geometry;
    if (!geo?.attributes?.position || geo.attributes.position.isInterleavedBufferAttribute || geo.groups?.length > 1 || geo.morphAttributes?.position) return false;
    if (o.name === 'eclipseRock') return false;
    return visUp(o) && staticUp(o) && !managed(o);
  };

  // las piezas por isla y las mallas de todo el mapa
  const per = ISL.map(() => []);
  const maps = [];
  const sph = new THREE.Sphere();
  const tiny = [];
  const grime = [];
  const grimeUp = (o) => {
    for (let q = o; q && q !== root; q = q.parent) if (/:grime$/.test(q.name || '')) return true;
    return false;
  };
  root.traverse((o) => {
    // lo instanciado quieto y la suciedad: solo se recortan de lejos
    // (lo instanciado no necesita estar quieto: solo se mira cuánto mide en pantalla)
    if ((o.isInstancedMesh || (o.isMesh && grimeUp(o))) && !o.isSkinnedMesh && o.frustumCulled && o.layers.mask === 1 && !own(o, 'onBeforeRender') && (!own(o, 'intersectsFrustum') || (!o.isInstancedMesh && o.__scUp !== undefined)) && visUp(o) && (o.isInstancedMesh ? !dynUp(o) : staticUp(o)) && !managed(o)) {
      if (o.isInstancedMesh) {
        if (!o.boundingSphere) o.computeBoundingSphere();
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
        const i = islandOf(sph.center.x, sph.center.z);
        if (i < 0 || sph.radius > MAP_R) return;
        // el radio de la copia más grande
        const e = o.instanceMatrix.array;
        let s2 = 0;
        for (let j = 0; j < o.count; j++) {
          const b = j * 16;
          s2 = Math.max(s2, e[b] * e[b] + e[b + 1] * e[b + 1] + e[b + 2] * e[b + 2], e[b + 4] * e[b + 4] + e[b + 5] * e[b + 5] + e[b + 6] * e[b + 6], e[b + 8] * e[b + 8] + e[b + 9] * e[b + 9] + e[b + 10] * e[b + 10]);
        }
        o.__ljR = o.geometry.boundingSphere.radius * Math.sqrt(s2) * o.matrixWorld.getMaxScaleOnAxis();
        o.__ljI = i;
        o.__ljV = o.instanceMatrix.version;
        o.__ljN = 0;
        tiny.push(o);
      } else if (o.material?.transparent) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        const i = islandOf(sph.center.x, sph.center.z);
        if (i < 0 || sph.radius > MAP_R) return;
        o.__ljI = i;
        grime.push(o);
      }
      return;
    }
    if (!fits(o)) return;
    const geo = o.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    sph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld);
    if (sph.radius > MAP_R) maps.push(o);
    else {
      const i = islandOf(sph.center.x, sph.center.z);
      if (i >= 0) per[i].push(o);
    }
  });

  // ---------------- las juntas ----------------
  // el color promedio (lineal) de una textura
  const avgs = new Map();
  let cv = null;
  let cx = null;
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const texAvg = (t) => {
    if (!t) return null;
    let a = avgs.get(t);
    if (a) return a;
    a = [1, 1, 1];
    try {
      const im = t.image;
      let data = null;
      if (im?.data && im.width) data = im.data;
      else if (im && (im.width || im.videoWidth)) {
        if (!cv) {
          cv = document.createElement('canvas');
          cv.width = cv.height = 16;
          cx = cv.getContext('2d', { willReadFrequently: true });
        }
        cx.clearRect(0, 0, 16, 16);
        cx.drawImage(im, 0, 0, 16, 16);
        data = cx.getImageData(0, 0, 16, 16).data;
      }
      if (data) {
        const srgb = t.colorSpace === THREE.SRGBColorSpace;
        const sc = data instanceof Uint8Array || data instanceof Uint8ClampedArray ? 1 / 255 : 1;
        const step = Math.max(4, Math.floor(data.length / 4 / 1024) * 4);
        let r = 0;
        let gg = 0;
        let b = 0;
        let k = 0;
        for (let i = 0; i + 2 < data.length; i += step) {
          const R = data[i] * sc;
          const G = data[i + 1] * sc;
          const B = data[i + 2] * sc;
          r += srgb ? toLin(R) : R;
          gg += srgb ? toLin(G) : G;
          b += srgb ? toLin(B) : B;
          k++;
        }
        if (k) a = [r / k, gg / k, b / k];
      }
    } catch {
      a = [1, 1, 1];
    }
    avgs.set(t, a);
    return a;
  };

  // por isla, por cara/plano/reflejo: lo que va a cada malla junta
  const parts = ISL.map(() => new Map());
  const addPart = (i, o, tris) => {
    const m = o.material;
    const key = `${m.side}|${m.flatShading ? 1 : 0}|${m.envMapIntensity ?? 1}`;
    let P = parts[i].get(key);
    if (!P) parts[i].set(key, (P = { m, list: [] }));
    P.list.push({ o, tris });
  };
  for (let i = 0; i < n; i++) for (const o of per[i]) addPart(i, o, null);

  // las de todo el mapa, partidas por isla (por el centro de cada triángulo)
  const chunks = [];
  const tv = new THREE.Vector3();
  for (const o of maps) {
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index ? geo.index.array : null;
    const st = geo.drawRange.start;
    const en = Math.min(idx ? idx.length : pos.count, st + geo.drawRange.count);
    const me = o.matrixWorld.elements;
    const wx = (j) => me[0] * pos.getX(j) + me[4] * pos.getY(j) + me[8] * pos.getZ(j) + me[12];
    const wz = (j) => me[2] * pos.getX(j) + me[6] * pos.getY(j) + me[10] * pos.getZ(j) + me[14];
    const lists = new Map();
    for (let t = st; t + 2 < en; t += 3) {
      const a = idx ? idx[t] : t;
      const b = idx ? idx[t + 1] : t + 1;
      const c = idx ? idx[t + 2] : t + 2;
      const k = islandOf((wx(a) + wx(b) + wx(c)) / 3, (wz(a) + wz(b) + wz(c)) / 3, 40);
      let l = lists.get(k);
      if (!l) lists.set(k, (l = []));
      l.push(a, b, c);
    }
    const mine = [];
    for (const [k, l] of lists) {
      // la parte de la isla k con su material de siempre (comparte los atributos)
      const cg = new THREE.BufferGeometry();
      for (const [nm, at] of Object.entries(geo.attributes)) cg.setAttribute(nm, at);
      cg.setIndex(l);
      cg.boundingSphere = boundsOf(pos, l);
      const cm = new THREE.Mesh(cg, o.material);
      cm.name = (o.name || 'junta') + '@' + (k >= 0 ? ISL[k].k : 'nada');
      cm.matrixAutoUpdate = false;
      cm.matrix.copy(o.matrixWorld);
      cm.matrixWorld.copy(o.matrixWorld);
      cm.castShadow = false;
      cm.receiveShadow = o.receiveShadow;
      cm.renderOrder = o.renderOrder;
      cm.raycast = noRay;
      cm.userData.lejos = true;
      cm.__ljI = k;
      // (se dibuja con la cámara en su isla o si su isla quedó entera)
      // (y si es un piso —plano, mirando para arriba— con la cámara más abajo, tampoco: core/sizeCull 4)
      markUp(cm);
      cm.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (c === null || !live()) return false;
        if (this.__ljI >= 0 && (this.__ljI !== near(c) || flatMirror(c)) && L.dirty[this.__ljI] === 0) return false;
        if (this.__scUp !== undefined && upHidden(this, c)) return false;
        return PROTO(this, f);
      };
      chunks.push(cm);
      mine.push(cm);
      if (k >= 0) addPart(k, o, l);
    }
    // la entera: con las partes (jugando) no se dibuja; en las sombras y las cinemáticas, sí
    const prev = own(o, 'intersectsFrustum') ? o.intersectsFrustum : null;
    o.intersectsFrustum = function (f) {
      if (camFrustumIs(f) !== null && live()) return false;
      return prev ? prev.call(this, f) : PROTO(this, f);
    };
    o.__ljChunks = mine;
  }

  // (2026-10-15, el usuario: "el arreglo de no cargar las texturas de paredes de otros lugares lejanos le quitó
  // bastante detalle". Las juntas llevan la textura: todas las de las islas en un arreglo de LJ_TEX px, una capa por
  // textura, y cada vértice su coordenada y su capa; el color, el del material —sin el promedio—. Sin coordenadas o
  // sin lugar en el arreglo, el color promedio de siempre. Sigue siendo un dibujo por junta.
  // globalThis.__mduLejosPlano: el color promedio, como antes)
  const TEXD = globalThis.__mduLejosPlano !== true;
  const layers = new Map();
  const layerOf = (t) => {
    if (!TEXD || !t?.image) return NO_TEX;
    let k = layers.get(t);
    if (k === undefined) {
      if (layers.size >= LJ_MAX) return NO_TEX;
      k = layers.size;
      layers.set(t, k);
    }
    return k;
  };
  const arrU = { value: null };
  // dónde quedó cada pieza suelta en su junta (para sacarla después: vigía)
  const place = new Map();

  // armar las juntas
  const group = new THREE.Group();
  group.name = 'eclipseLejos';
  group.matrixAutoUpdate = false;
  group.mcFrozen = true;
  const nm3 = new THREE.Matrix3();
  const tn = new THREE.Vector3();
  const half = (x) => THREE.DataUtils.toHalfFloat(Math.min(60000, Math.max(0, x)));
  let verts = 0;
  for (let i = 0; i < n; i++) {
    for (const P of parts[i].values()) {
      // los vértices que usa cada parte, renumerados
      let nv = 0;
      let ni = 0;
      const maps2 = [];
      for (const it of P.list) {
        const geo = it.o.geometry;
        const pos = geo.attributes.position;
        const src = it.tris || null;
        const remap = new Int32Array(pos.count).fill(-1);
        let used = 0;
        const idx = geo.index ? geo.index.array : null;
        const st = geo.drawRange.start;
        const en = Math.min(idx ? idx.length : pos.count, st + geo.drawRange.count);
        const list = src || null;
        const cnt = list ? list.length : en - st;
        for (let j = 0; j < cnt; j++) {
          const v = list ? list[j] : idx ? idx[st + j] : st + j;
          if (remap[v] < 0) remap[v] = used++;
        }
        maps2.push({ it, remap, used, cnt, idx, st, list });
        nv += used;
        ni += cnt;
      }
      if (!ni) continue;
      const Pp = new Float32Array(nv * 3);
      const N = new Int8Array(nv * 3);
      const C = new Uint16Array(nv * 3);
      const PB = new Uint8Array(nv * 2);
      const EM = new Uint16Array(nv * 3);
      const RF = new Uint8Array(nv);
      const TU = TEXD ? new Float32Array(nv * 2) : null;
      const TL = TEXD ? new Uint8Array(nv).fill(NO_TEX) : null;
      const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v0 = 0;
      let i0 = 0;
      const recs = [];
      for (const { it, remap, used, cnt, idx, st, list } of maps2) {
        if (!list) recs.push([it.o, v0, used]);
        const o = it.o;
        const m = o.material;
        const geo = o.geometry;
        const pos = geo.attributes.position;
        if (!geo.attributes.normal) geo.computeVertexNormals();
        const nor = geo.attributes.normal;
        const vc = m.vertexColors && geo.attributes.color ? geo.attributes.color : null;
        nm3.getNormalMatrix(o.matrixWorld);
        const tm = m.map;
        const uvA = TEXD && tm ? geo.attributes[tm.channel ? 'uv' + tm.channel : 'uv'] : null;
        const lay = uvA ? layerOf(tm) : NO_TEX;
        const useTex = lay !== NO_TEX;
        let e3 = null;
        if (useTex) {
          if (tm.matrixAutoUpdate) tm.updateMatrix();
          e3 = tm.matrix.elements;
        }
        const ta = useTex ? [1, 1, 1] : texAvg(m.map) || [1, 1, 1];
        const col = m.color;
        const rough = m.isMeshStandardMaterial ? m.roughness : m.isMeshPhongMaterial ? Math.max(0.2, 1 - (m.shininess ?? 30) / 100) : 1;
        const metal = m.isMeshStandardMaterial ? m.metalness : 0;
        const rb = m.isMeshStandardMaterial ? reflBucket(m) : 0;
        const ek = !STRICT && m.emissive ? (m.emissiveIntensity ?? 1) : 0;
        const eR = half(ek * (m.emissive?.r ?? 0));
        const eG = half(ek * (m.emissive?.g ?? 0));
        const eB = half(ek * (m.emissive?.b ?? 0));
        const r0 = col.r * ta[0];
        const g0 = col.g * ta[1];
        const b0 = col.b * ta[2];
        for (let v = 0; v < remap.length; v++) {
          const j = remap[v];
          if (j < 0) continue;
          const q = v0 + j;
          tv.fromBufferAttribute(pos, v).applyMatrix4(o.matrixWorld);
          Pp[q * 3] = tv.x;
          Pp[q * 3 + 1] = tv.y;
          Pp[q * 3 + 2] = tv.z;
          tn.fromBufferAttribute(nor, v).applyMatrix3(nm3).normalize();
          N[q * 3] = Math.round(tn.x * 127);
          N[q * 3 + 1] = Math.round(tn.y * 127);
          N[q * 3 + 2] = Math.round(tn.z * 127);
          let r = r0;
          let gg = g0;
          let b = b0;
          if (vc) {
            r *= vc.getX(v);
            gg *= vc.getY(v);
            b *= vc.getZ(v);
          }
          C[q * 3] = Math.min(65535, Math.round(r * 65535));
          C[q * 3 + 1] = Math.min(65535, Math.round(gg * 65535));
          C[q * 3 + 2] = Math.min(65535, Math.round(b * 65535));
          PB[q * 2] = Math.round(rough * 255);
          PB[q * 2 + 1] = Math.round(metal * 255);
          EM[q * 3] = eR;
          EM[q * 3 + 1] = eG;
          EM[q * 3 + 2] = eB;
          RF[q] = Math.round((rb / 15) * 255);
          if (useTex) {
            const u = uvA.getX(v);
            const w2 = uvA.getY(v);
            TU[q * 2] = e3[0] * u + e3[3] * w2 + e3[6];
            TU[q * 2 + 1] = e3[1] * u + e3[4] * w2 + e3[7];
            TL[q] = lay;
          }
        }
        for (let j = 0; j < cnt; j++) {
          const v = list ? list[j] : idx ? idx[st + j] : st + j;
          I[i0++] = remap[v] + v0;
        }
        v0 += used;
      }
      // (en media precisión, desde el medio de la malla: ~3 cm a 50 m, de lejos no se ve; la mitad de memoria)
      let x0 = Infinity;
      let y0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = -Infinity;
      for (let q = 0; q < nv; q++) {
        const x = Pp[q * 3];
        const y = Pp[q * 3 + 1];
        const z = Pp[q * 3 + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      const mid = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const PH = new Uint16Array(nv * 3);
      for (let q = 0; q < nv; q++) {
        PH[q * 3] = THREE.DataUtils.toHalfFloat(Pp[q * 3] - mid.x);
        PH[q * 3 + 1] = THREE.DataUtils.toHalfFloat(Pp[q * 3 + 1] - mid.y);
        PH[q * 3 + 2] = THREE.DataUtils.toHalfFloat(Pp[q * 3 + 2] - mid.z);
      }
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', new THREE.Float16BufferAttribute(PH, 3));
      ng.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
      ng.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
      ng.setAttribute('pbr', new THREE.BufferAttribute(PB, 2, true));
      ng.setAttribute('emi', new THREE.Float16BufferAttribute(EM, 3));
      ng.setAttribute('refl', new THREE.BufferAttribute(RF, 1, true));
      if (TEXD) {
        ng.setAttribute('tuv', new THREE.BufferAttribute(TU, 2));
        ng.setAttribute('tlay', new THREE.BufferAttribute(TL, 1));
      }
      ng.setIndex(new THREE.BufferAttribute(I, 1));
      ng.computeBoundingSphere();
      // (apagado, 2026-10-10) soltar de la memoria de JS los datos de estas
      // copias una vez subidos a la placa: 52 MB entre todas las islas. No va
      // por defecto: al armar la partida siguiente, los techos de
      // world/eclipse/v5b.js (ceilCands) recorren todas las mallas del mapa y
      // leen sus vértices, también los de estas copias, y fallan. Antes de
      // prenderlo hay que revisar todo lo que recorre el mapa entero leyendo
      // vértices. globalThis.__mduLejosSuelta: los suelta (para probar)
      if (globalThis.__mduLejosSuelta === true) {
        ng.computeBoundingBox();
        for (const k in ng.attributes) ng.attributes[k].onUpload(dropArray);
        ng.index.onUpload(dropArray);
      }
      const m0 = P.m;
      const mesh = new THREE.Mesh(ng, flatMaterial(m0.side, !!m0.flatShading, m0.envMapIntensity ?? 1, TEXD ? arrU : null));
      mesh.name = 'lejos:' + ISL[i].k;
      mesh.position.copy(mid);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.raycast = noRay;
      mesh.userData.lejos = true;
      // (core/sizeCull gbDrop: al G-buffer no va)
      mesh.userData.ljFar = true;
      for (const [o, start, count] of recs) {
        if (!place.has(o)) place.set(o, []);
        place.get(o).push({ mesh, start, count });
      }
      mesh.__ljI = i;
      mesh.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (c === null || !farFor(this.__ljI, c)) return false;
        return PROTO(this, f);
      };
      group.add(mesh);
      verts += nv;
    }
  }
  for (const c of chunks) group.add(c);
  root.add(group);
  group.updateMatrixWorld(true);
  L.group = group;
  if (TEXD && layers.size) arrU.value = texArray([...layers.keys()], texAvg);

  // las piezas sueltas de cada isla: no se dibujan con la cámara en otra
  const isl = new Map();
  for (let i = 0; i < n; i++) for (const o of per[i]) isl.set(o, i);
  setFarHook((o, c) => {
    const i = o.__ljI;
    return i !== undefined && isl.get(o) === i && farFor(i, c);
  });
  for (const [o, i] of isl) {
    o.__ljI = i;
    // (las que ya recorta core/sizeCull pasan por su test; las otras, por este)
    if (!own(o, 'intersectsFrustum')) {
      o.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (c !== null && farFor(this.__ljI, c)) return false;
        return PROTO(this, f);
      };
    }
  }

  // lo instanciado chiquito y la suciedad de las islas de lejos
  const cp = new THREE.Vector3();
  for (const o of tiny) {
    o.intersectsFrustum = function (f) {
      const c = camFrustumIs(f);
      if (c !== null && farFor(this.__ljI, c)) {
        const k = pxScale(c);
        // (las piedras que orbitan se mueven con la cámara cerca: su esfera, de
        // nuevo; lo que cambia seguido —lo que se anima siempre— se dibuja como antes)
        if (this.instanceMatrix.version !== this.__ljV) {
          this.__ljV = this.instanceMatrix.version;
          if (++this.__ljN > 3) return PROTO(this, f);
          this.computeBoundingSphere();
        }
        sph.copy(this.boundingSphere).applyMatrix4(this.matrixWorld);
        const d = Math.max(1, cp.setFromMatrixPosition(c.matrixWorld).distanceTo(sph.center) - sph.radius);
        if (k > 0 && (this.__ljR * k) / d < FAR_PX) return false;
      }
      return PROTO(this, f);
    };
  }
  for (const o of grime) {
    const prev = own(o, 'intersectsFrustum') ? o.intersectsFrustum : null;
    o.intersectsFrustum = function (f) {
      const c = camFrustumIs(f);
      if (c !== null && farFor(this.__ljI, c)) return false;
      return prev ? prev.call(this, f) : PROTO(this, f);
    };
  }

  // (2026-10-15) Los efectos de las islas de lejos —transparentes o que brillan: marcas, la disformidad, grietas,
  // motas— que en pantalla miden menos de FX_PX de radio no se dibujan (de lejos son un punto); los portales y lo grande
  // quedan. Y lo instanciado: lo del mapa que no se recortaba por la vista (piedras que orbitan, ladrillos y tablas
  // que flotan), de lejos por su esfera de todas las copias (con margen: se mueven poco); lo que cuelga de la escena
  // (lo del easter egg), por su esfera mientras no se mueva (si cambia más de 3 veces, como antes). De cerca y en las
  // sombras, como antes. Se mira toda la escena al armar y otra vez cada 4 s (lo que aparece después). Afuera: los
  // jugadores, los muertos, las partículas, lo que se mueve. Medido (A/B por cargas): -3 % de cuadros, +0,1-0,4 ms de
  // CPU (un gancho más por pieza en cada pasada) y ningún ahorro en la placa: apagado. globalThis.__mduLejosFxTodo = true: prendido
  const FXON = !STRICT && globalThis.__mduLejosFxTodo === true;
  const fxSph = new THREE.Sphere();
  const fxP = new THREE.Vector3();
  L.fx = { efectos: 0, libres: 0, sueltos: 0 };
  const scanFx = () => {
    if (!FXON) return;
    const skip = new Set([g.net?.avatars?.root, g.zombies?.root, g.zombies?.batch?.mesh, g.fx?.root, g.powerups?.root, g.weapons?.vmScene].filter(Boolean));
    const walk = (o, inMap) => {
      if (skip.has(o) || o.isCamera || o.isLight) return;
      if (o.name === 'eclipsePortals' || o.userData?.dynamic || MOVES.test(o.name || '')) return;
      if (o === root) inMap = true;
      if ((o.isMesh || o.isPoints) && !o.__ljFx) {
        o.__ljFx = true;
        add(o, inMap);
      }
      for (const c of o.children) walk(c, inMap);
    };
    walk(g.scene, false);
  };
  const add = (o, inMap) => {
    if (o.isSkinnedMesh || o.layers.mask !== 1 || own(o, 'onBeforeRender') || own(o, 'intersectsFrustum') || managed(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const inst = o.isInstancedMesh && o.count > 0 && (!inMap || o.frustumCulled === false);
    const fx = !o.isInstancedMesh && !!m && (m.transparent || m.blending === THREE.AdditiveBlending) && o.frustumCulled;
    if (!inst && !fx) return;
    if (inst) {
      o.computeBoundingSphere();
      if (!o.boundingSphere) return;
      fxSph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld);
    } else {
      const geo = o.geometry;
      if (!geo?.attributes?.position) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      fxSph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld);
    }
    const i = islandOf(fxSph.center.x, fxSph.center.z);
    if (i < 0 || fxSph.radius > MAP_R) return;
    o.__ljI = i;
    if (inst) {
      const fc0 = o.frustumCulled;
      // (lo del mapa: con margen para lo que se mueve poco; lo de la escena: su esfera, mientras no se mueva)
      const pad = inMap && !fc0;
      o.__ljFxS = new THREE.Sphere(fxSph.center.clone(), pad ? fxSph.radius * 1.25 + 4 : fxSph.radius);
      o.__ljV = o.instanceMatrix.version;
      o.__ljN = 0;
      o.frustumCulled = true;
      if (inMap) L.fx.libres++;
      else L.fx.sueltos++;
      o.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (!pad && this.instanceMatrix.version !== this.__ljV) {
          this.__ljV = this.instanceMatrix.version;
          // (se mueve: como antes, para siempre)
          if (++this.__ljN > 3) {
            delete this.intersectsFrustum;
            this.frustumCulled = fc0;
            return fc0 ? PROTO(this, f) : true;
          }
          this.computeBoundingSphere();
          fxSph.copy(this.boundingSphere).applyMatrix4(this.matrixWorld);
          this.__ljFxS.copy(fxSph);
        }
        if (c === null || !farFor(this.__ljI, c)) return fc0 ? PROTO(this, f) : true;
        const S2 = this.__ljFxS;
        const k = pxScale(c);
        const d = Math.max(1, fxP.setFromMatrixPosition(c.matrixWorld).distanceTo(S2.center) - S2.radius);
        if (k > 0 && (S2.radius * k) / d < FX_PX) return false;
        return f.intersectsSphere(S2);
      };
    } else {
      L.fx.efectos++;
      o.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (c !== null && farFor(this.__ljI, c)) {
          const geo = this.geometry;
          if (geo.boundingSphere) {
            fxSph.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
            const k = pxScale(c);
            const d = Math.max(1, fxP.setFromMatrixPosition(c.matrixWorld).distanceTo(fxSph.center) - fxSph.radius);
            if (k > 0 && (fxSph.radius * k) / d < FX_PX) return false;
          }
        }
        return PROTO(this, f);
      };
    }
  };
  // (2026-10-15) Las cajas de consulta de los cuartos (core/sizeCull: '¿se ve este cuarto?') de las otras islas: lo de
  // adentro ya va en su junta o dormido, y cada consulta era un dibujo más y media docena de llamadas a la placa cada
  // pocos cuadros —~40 cuartos—. Con su isla de lejos no se piden. globalThis.__mduLejosCuartos: como antes
  if (!STRICT && globalThis.__mduLejosCuartos !== true) {
    const bx = new THREE.Box3();
    for (const o of g.scene.children) {
      if (!/^room:/.test(o.name || '') || !o.isMesh || own(o, 'intersectsFrustum')) continue;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bx.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      const ri = islandOf((bx.min.x + bx.max.x) / 2, (bx.min.z + bx.max.z) / 2);
      if (ri < 0) continue;
      o.__ljRoom = ri;
      L.fx.cuartos = (L.fx.cuartos || 0) + 1;
      o.intersectsFrustum = function (f) {
        const c = camFrustumIs(f);
        if (c !== null && farFor(this.__ljRoom, c)) return false;
        return PROTO(this, f);
      };
    }
  }
  scanFx();
  let fxT = 0;
  L.scanFx = scanFx;

  // ---------------- el vigía ----------------
  // lo que cambia después de armar deja su isla entera
  const mats = new Map();
  const snap = (m) => [m.color?.getHex() ?? -1, m.emissive?.getHex() ?? -1, m.emissiveIntensity ?? 0, m.map?.uuid ?? '', m.opacity, m.transparent, m.visible];
  const watch = [];
  const touch = (o, i) => {
    watch.push({ o, i, m: o.matrixWorld.elements.slice(), mat: o.material });
    let M = mats.get(o.material);
    if (!M) mats.set(o.material, (M = { s: snap(o.material), isl: new Set() }));
    M.isl.add(i);
  };
  for (const [o, i] of isl) touch(o, i);
  for (const o of maps) for (const c of o.__ljChunks) if (c.__ljI >= 0) touch(o, c.__ljI);
  const matList = [...mats.entries()];
  // (de quién es: los nombres de los padres; muchas piezas no tienen nombre)
  const whoOf = (o) => {
    const n = [];
    for (let q = o; q && n.length < 4; q = q.parent) if (q.name) n.push(q.name);
    return (n.join(" < ") || o.type) + (o.matrixAutoUpdate ? " (matriz automática)" : "");
  };
  L.dirtyIsl = (i, why) => {
    // (pruebas: globalThis.__mduLejosLog anota todas, no solo la primera de cada isla)
    if (globalThis.__mduLejosLog === true && i >= 0 && (L.log ||= []).length < 400) L.log.push(ISL[i].k + ": " + why);
    if (i < 0 || L.dirty[i]) return;
    L.dirty[i] = 1;
    L.why.push(ISL[i].k + ': ' + why);
  };
  // (2026-10-15) Lo que cambia después de armar: si es una pieza suelta de una junta, sale de la junta —sus vértices
  // quedan todos en un punto— y se dibuja como antes, sola; la isla sigue junta. Lo de las mallas de todo el mapa (o
  // con la junta ya soltada de la memoria) deja la isla entera, como antes. globalThis.__mduLejosEstricto: como antes
  const evict = (o, i, why) => {
    L.unbatch?.(o);
    const P2 = place.get(o);
    if (STRICT || !P2 || P2.some((r) => !r.mesh.geometry.attributes.position.array?.length)) return L.dirtyIsl(i, why);
    for (const r of P2) {
      const pos = r.mesh.geometry.attributes.position;
      pos.array.fill(0, r.start * 3, (r.start + r.count) * 3);
      pos.addUpdateRange(r.start * 3, r.count * 3);
      pos.needsUpdate = true;
    }
    place.delete(o);
    isl.delete(o);
    o.__ljI = undefined;
    if (globalThis.__mduLejosLog === true && (L.log ||= []).length < 400) L.log.push(ISL[i].k + ': sacada, ' + why);
    L.sacadas = (L.sacadas || 0) + 1;
  };
  // (la visibilidad que le puso el juego, sin el sueño de las islas)
  const rawUp = (o) => {
    for (let q = o; q; q = q.parent) if (!(q.__ljRaw ? q.__ljRaw() : q.visible)) return false;
    return true;
  };

  // ---------------- la isla de la cámara: un dibujo por material ----------------
  // (2026-10-15, el usuario: "hacé el multi-draw para lo quieto que comparte material". Con la cámara en una isla, lo
  // de esa isla se dibujaba pieza por pieza: ~6-10 llamadas a la placa cada una, y el proceso de la placa de Chrome
  // era el cuello. Las piezas quietas de cada isla que comparten material —y los mismos atributos— van en un dibujo
  // múltiple (BatchedMesh) con su material de siempre: mismas texturas y luz. Qué pieza entra en cada cuadro lo
  // decide cada pieza, como antes (visible, su recorte de core/sizeCull —chicas, cuartos, planas—, la vista). Solo con
  // la cámara en los ojos y en su isla; en las sombras (las piezas tiran las suyas), el espejo del agua, las
  // cinemáticas y con la isla entera (L.dirty), como antes. Lo que cambia sale del lote (vigía: evict). Afuera: los
  // materiales con onBeforeCompile propio (salvo el de fx/Surfaces), lo espejado. Medido: junta 45 piezas en 18 lotes
  // en todo el mapa (2-4 dibujos de lote por cuadro): lo de la isla de la cámara que se dibuja pieza por pieza es poco
  // —lo grueso es lo instanciado y lo transparente—. Misma imagen, sin ganancia que se mida: apagado.
  // globalThis.__mduIslaLote = true: prendido)
  const LOTE = !STRICT && globalThis.__mduIslaLote === true;
  L.lotes = { lotes: 0, piezas: 0, sacadas: 0 };
  if (LOTE) {
    const baseObc = (m) => {
      let p = Object.getPrototypeOf(m);
      while (p && !own(p, 'onBeforeCompile')) p = Object.getPrototypeOf(p);
      return p ? p.onBeforeCompile : null;
    };
    const sigOf = (geo) => {
      let k = geo.index ? 'I' : '';
      for (const nm of Object.keys(geo.attributes).sort()) {
        const a = geo.attributes[nm];
        if (a.isInterleavedBufferAttribute || !(a.array?.length >= a.count * a.itemSize)) return null;
        k += '|' + nm + a.itemSize + (a.normalized ? 'n' : '');
      }
      if (geo.index && !(geo.index.array?.length >= geo.index.count)) return null;
      return geo.drawRange.start === 0 && geo.drawRange.count === Infinity ? k : null;
    };
    const det = new THREE.Matrix4();
    // (visible hasta la escena: lo que sacaron de la escena —la copia de una puerta cerrada al abrirla— no)
    const inScene = (o) => {
      for (let q = o; q; q = q.parent) {
        if (!q.visible) return false;
        if (q === g.scene) return true;
      }
      return false;
    };
    for (let i = 0; i < n; i++) {
      const groups = new Map();
      for (const o of per[i]) {
        const m = o.material;
        if ((m.onBeforeCompile !== baseObc(m) && !surfaceOnly(m)) || det.copy(o.matrixWorld).determinant() <= 0) continue;
        const sg = sigOf(o.geometry);
        if (sg === null) continue;
        const key = m.id + '#' + sg + '#' + o.receiveShadow + '#' + o.renderOrder;
        let l = groups.get(key);
        if (!l) groups.set(key, (l = []));
        l.push(o);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        const uniq = new Map();
        let nv = 0;
        let ni = 0;
        for (const o of list) {
          if (uniq.has(o.geometry)) continue;
          uniq.set(o.geometry, -1);
          nv += o.geometry.attributes.position.count;
          ni += o.geometry.index ? o.geometry.index.count : 0;
        }
        const o0 = list[0];
        const B = new THREE.BatchedMesh(list.length, nv, Math.max(ni, 3), o0.material);
        for (const geo of uniq.keys()) uniq.set(geo, B.addGeometry(geo));
        const ids = new Int32Array(list.length);
        for (let j = 0; j < list.length; j++) {
          ids[j] = B.addInstance(uniq.get(list[j].geometry));
          B.setMatrixAt(ids[j], list[j].matrixWorld);
        }
        B.name = 'lote:' + ISL[i].k;
        B.matrixAutoUpdate = false;
        B.perObjectFrustumCulled = false;
        B.sortObjects = globalThis.__mduLoteOrden === true;
        B.castShadow = false;
        B.receiveShadow = o0.receiveShadow;
        B.renderOrder = o0.renderOrder;
        B.raycast = noRay;
        B.userData.lote = true;
        B.computeBoundingSphere();
        // (para las islas dormidas: dónde está, en el mundo)
        B.geometry.boundingSphere = B.boundingSphere.clone();
        const vis = new Uint8Array(list.length).fill(1);
        const rec = { B, list, ids, vis, i };
        // ¿esta cámara dibuja la isla con el lote?
        const on = (f) => {
          const c = camFrustumIs(f);
          return c !== null && live() && L.dirty[i] === 0 && !farFor(i, c);
        };
        rec.on = on;
        B.intersectsFrustum = function (f) {
          if (!on(f)) return false;
          let any = false;
          for (let j = 0; j < list.length; j++) {
            const o = list[j];
            // (lo mismo que hacía el renderer con la pieza: visible hasta arriba y su recorte)
            const v = o.__ljB === rec && inScene(o) && (o.__ljPrev ? o.__ljPrev.call(o, f) : PROTO(o, f)) ? 1 : 0;
            if (v !== vis[j]) {
              vis[j] = v;
              this.setVisibleAt(ids[j], v === 1);
            }
            if (v) any = true;
          }
          return any;
        };
        for (const o of list) {
          o.__ljPrev = own(o, 'intersectsFrustum') ? o.intersectsFrustum : null;
          o.__ljB = rec;
          o.intersectsFrustum = function (f) {
            const R2 = this.__ljB;
            if (R2 !== undefined && R2.on(f)) return false;
            return this.__ljPrev ? this.__ljPrev.call(this, f) : PROTO(this, f);
          };
        }
        group.add(B);
        L.lotes.lotes++;
        L.lotes.piezas += list.length;
      }
    }
    group.updateMatrixWorld(true);
    L.unbatch = (o) => {
      const R2 = o.__ljB;
      if (R2 === undefined) return;
      o.__ljB = undefined;
      const j = R2.list.indexOf(o);
      if (j >= 0 && R2.vis[j]) {
        R2.vis[j] = 0;
        R2.B.setVisibleAt(R2.ids[j], false);
      }
      L.lotes.sacadas++;
    };
  }

  // ---------------- las islas dormidas ----------------
  // on: se duerme (jugando, con la cámara en los ojos); me: la isla del jugador;
  // wake: la isla que muestra un portal mientras se dibuja su vista
  // inR: adentro de un dibujo (renderer.render) o de las matrices de la escena:
  // solo ahí lo dormido no se ve. Afuera (la lógica del juego, en línea, las
  // misiones) cada cosa dice su `visible` de siempre.
  const Z = (L.sleep = { on: 0, me: -1, wake: -1, n: 0, por: null, inR: 0, list: [], woke: 0 });
  let arm = null;
  let armIn = 20;
  if (globalThis.__mduNoEclDormir !== true) {
    const UNK = 1 << 20;
    const ALL = 1 << 21;
    const KEEP = 1 << 22;
    const memo = new Map();
    const tv2 = new THREE.Vector3();
    // (2026-10-10, el usuario: "los zombies se volvieron invisibles, al menos en
    // la primera carga"; y en línea el cuerpo de un compañero sin dibujar. Se
    // dormía lo que NO es quieto: las mallas instanciadas de los zombies, sus
    // sombras, los jinetes, los cuerpos con huesos. Dos causas: 1. lo que el
    // juego guarda en el origen (0, 0, 0) caía en la caja de El Nudo con su
    // margen de 12 m y quedaba "de El Nudo": dormido en todas las demás islas;
    // 2. se armaba a los 20 cuadros de cargar, en plena llegada o en la intro,
    // con los actores de la cinemática puestos y las copias de los zombies
    // prendidas por el precalentado. Ahora: la isla de un punto es por su caja
    // con 4 m y por su altura; nada con huesos, ni instanciado que se mueve, ni
    // de otra capa, ni con dibujo propio se duerme; se arma jugando de verdad; y
    // lo instanciado que cambia de copias se despierta.)
    const yOf = ISL.map(({ k }) => [(ISLANDS[k].y ?? 0) - 45, (ISLANDS[k].top ?? ISLANDS[k].y ?? 0) + 60]);
    const bitAt = (x, z, y) => {
      const i = islandOf(x, z, 4);
      return i < 0 || y < yOf[i][0] || y > yOf[i][1] ? UNK : 1 << i;
    };
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    // ¿algo que se mueve o que el juego dibuja a su manera? (nunca se duerme)
    const moves = (o) =>
      o.isSkinnedMesh ||
      o.isBone ||
      o.layers.mask !== 1 ||
      own(o, 'onBeforeRender') ||
      !!o.userData?.dynamic ||
      !!o.userData?.shadowDyn ||
      MOVES.test(o.name || '') ||
      (o.isInstancedMesh && (o.frustumCulled === false || o.instanceMatrix?.usage === THREE.DynamicDrawUsage));
    const inPortal = (o) => {
      for (let q = o; q; q = q.parent) if (q.name === 'eclipsePortals') return !/Shards/.test(o.name || '');
      return false;
    };
    // el radio de una pieza (de lo instanciado, el de su copia más grande)
    const radOf = (o) => {
      const geo = o.geometry;
      if (!geo?.attributes?.position) return 0;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      let r = geo.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (o.isInstancedMesh) {
        const e = o.instanceMatrix.array;
        let s2 = 0;
        for (let j = 0; j < o.count; j++) {
          const b = j * 16;
          s2 = Math.max(s2, e[b] * e[b] + e[b + 1] * e[b + 1] + e[b + 2] * e[b + 2], e[b + 4] * e[b + 4] + e[b + 5] * e[b + 5] + e[b + 6] * e[b + 6], e[b + 8] * e[b + 8] + e[b + 9] * e[b + 9] + e[b + 10] * e[b + 10]);
        }
        r *= Math.sqrt(s2);
      }
      return r;
    };
    // de qué islas es un subárbol (un bit por isla; UNK: fuera de todas; ALL:
    // de todo el mapa o una luz) y si tiene algo que queda despierto (KEEP)
    const mask = (o) => {
      let m = memo.get(o);
      if (m !== undefined) return m;
      m = 0;
      if (o.isLight || moves(o)) m = ALL;
      else if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
        const geo = o.geometry;
        if (o.isInstancedMesh) {
          if (!o.boundingSphere) o.computeBoundingSphere();
          tv2.copy(o.boundingSphere.center).applyMatrix4(o.matrixWorld);
          m = o.boundingSphere.radius > MAP_R || !o.count ? ALL : bitAt(tv2.x, tv2.z, tv2.y);
        } else if (geo?.attributes?.position) {
          if (!geo.boundingSphere) geo.computeBoundingSphere();
          tv2.copy(geo.boundingSphere.center).applyMatrix4(o.matrixWorld);
          m = geo.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > MAP_R ? ALL : bitAt(tv2.x, tv2.z, tv2.y);
        } else m = UNK;
        const mt = Array.isArray(o.material) ? o.material[0] : o.material;
        if ((mt && (mt.blending === THREE.AdditiveBlending || glows(mt))) || inPortal(o) || radOf(o) >= SLEEP_R) m |= KEEP;
      }
      for (const c of o.children) m |= mask(c);
      memo.set(o, m);
      return m;
    };
    // (lo que prenden y apagan por distancia v5.zoneCuller y centro.detailCuller,
    // y Arrival.warmWorld guardando y reponiendo su `visible`: esos no llevan la
    // propiedad superpuesta —un "guardar false, reponer false" los dejaría
    // apagados—; sí lo de adentro)
    const cullers = new Set(w.warmHidden || []);
    const por = new Array(n).fill(0);
    const over = (o, i) => {
      let v = o.visible;
      Object.defineProperty(o, 'visible', {
        configurable: true,
        enumerable: true,
        get() {
          return v && !(Z.inR > 0 && Z.on === 1 && i !== Z.me && i !== Z.wake);
        },
        set(x) {
          v = x;
        },
      });
      o.__ljRaw = () => v;
      Z.n++;
      por[i]++;
      const ims = [];
      o.traverse((c) => c.isInstancedMesh && ims.push([c, c.instanceMatrix.version, c.count]));
      Z.list.push({ o, i, m: o.matrixWorld.elements.slice(), ims });
    };
    const walk = (node, depth) => {
      for (const c of node.children) {
        if (c === group || !c.visible) continue;
        if (c.name === 'zombieBatch') continue;
        const m = mask(c);
        const isl1 = m & ~(UNK | ALL | KEEP);
        if (!isl1) continue;
        // entero en una sola isla y sin nada que quede despierto: se duerme
        const one = !(m & (UNK | ALL | KEEP)) && (isl1 & (isl1 - 1)) === 0;
        if (one && !cullers.has(c)) over(c, Math.log2(isl1) | 0);
        else if (c.children.length && depth < 8) walk(c, depth + 1);
      }
    };
    // (se arma unos cuadros después de cargar: hay cosas que el mapa arma en su
    // primer cuadro —los pedazos flotantes del penal—; cae en la entrada)
    arm = () => {
      const ta = performance.now();
      walk(g.scene, 0);
      Z.por = por;
      if (L.stats) L.stats.dormirMs = Math.round((performance.now() - ta) * 10) / 10;
      // adentro de cada dibujo y de las matrices de la escena (fx/PostFX)
      const R = g.renderer;
      const rr = R.render;
      R.render = function (...a) {
        Z.inR++;
        try {
          return rr.apply(this, a);
        } finally {
          Z.inR--;
        }
      };
      const sc = g.scene;
      const um = sc.updateMatrixWorld;
      sc.updateMatrixWorld = function (...a) {
        Z.inR++;
        try {
          return um.apply(this, a);
        } finally {
          Z.inR--;
        }
      };
      L.unhook = () => {
        R.render = rr;
        sc.updateMatrixWorld = um;
      };
    };
  }
  // lo que se mueve (un compañero en línea, un jefe, algo que cambia de isla)
  // se despierta para siempre: vuelve a su `visible` de siempre
  const wake = (W) => {
    const o = W.o;
    const v = o.__ljRaw();
    delete o.visible;
    o.visible = v;
    delete o.__ljRaw;
    W.dead = true;
    Z.woke++;
  };
  // la vista de un portal: la isla de la otra punta, despierta mientras se dibuja
  // (world/eclipsePortals capture: ahí no se rehacen sombras ni matrices)
  const hookPortals = () => {
    const PT = g.ee?.portals;
    if (!PT || PT.__ljCap || typeof PT.capture !== 'function') return !!PT?.__ljCap;
    const cap = PT.capture;
    PT.capture = function (renderer, scene, e) {
      const was = Z.wake;
      Z.wake = e?.other ? islandOf(e.other.pos.x, e.other.pos.z) : -1;
      try {
        return cap.call(this, renderer, scene, e);
      } finally {
        Z.wake = was;
      }
    };
    PT.__ljCap = true;
    return true;
  };
  let hooked = false;

  let k = 0;
  let km = 0;
  L.tick = () => {
    // (lo que aparece después: cada 4 s)
    if (FXON && performance.now() - fxT > 4000) {
      fxT = performance.now();
      scanFx();
    }
    // qué isla está despierta: la del jugador, jugando con la cámara en sus ojos
    const P = g.player;
    const cp = g.camera?.position;
    const play = live() && g.state === 'playing' && !g.cine && !g.intro?.active && !g.ee?.scene;
    const eyes = play && !!P && !!cp && Math.abs(cp.x - P.pos.x) < 0.5 && Math.abs(cp.z - P.pos.z) < 0.5 && Math.abs(cp.y - P.pos.y - P.eye) < 1.5;
    Z.on = eyes && Z.n > 0 && globalThis.__mduNoEclDormir !== true ? 1 : 0;
    Z.me = Z.on ? islandOf(P.pos.x, P.pos.z) : -1;
    if (!hooked) hooked = hookPortals();
    // (se arma jugando de verdad, con la cámara en los ojos: en la llegada el
    // precalentado prende de todo y en la intro están los actores puestos)
    if (arm !== null && eyes && --armIn <= 0) {
      arm();
      arm = null;
    }
    const ZL = Z.list;
    for (let s2 = 0; s2 < 60 && ZL.length; s2++) {
      const W = ZL[Z.k = ((Z.k || 0) + 1) % ZL.length];
      if (W.dead) continue;
      const e = W.o.matrixWorld.elements;
      if (Math.abs(e[12] - W.m[12]) > 0.05 || Math.abs(e[13] - W.m[13]) > 0.05 || Math.abs(e[14] - W.m[14]) > 0.05) wake(W);
      // (lo instanciado que cambió de copias: no era quieto)
      else for (const [im, ver, cnt] of W.ims) {
        if (im.instanceMatrix.version !== ver || im.count !== cnt) {
          wake(W);
          break;
        }
      }
    }
    // (en las cinemáticas se esconde y se vuelve a mostrar de todo: solo jugando)
    if (!play) return;
    for (let s = 0; s < SLICE && watch.length; s++) {
      const W = watch[k];
      k = (k + 1) % watch.length;
      if (L.dirty[W.i] || W.gone) continue;
      const o = W.o;
      if (o.material !== W.mat) {
        W.gone = true;
        evict(o, W.i, 'material ' + whoOf(o));
        continue;
      }
      if (!rawUp(o)) {
        W.gone = true;
        evict(o, W.i, 'se escondió ' + whoOf(o));
        continue;
      }
      const e = o.matrixWorld.elements;
      for (let j = 0; j < 16; j++) {
        if (Math.abs(e[j] - W.m[j]) > 1e-4) {
          W.gone = true;
          evict(o, W.i, 'se movió ' + whoOf(o));
          break;
        }
      }
    }
    for (let s = 0; s < 8 && matList.length; s++) {
      const [m, M] = matList[km];
      km = (km + 1) % matList.length;
      const now = snap(m);
      for (let j = 0; j < now.length; j++) {
        if (now[j] !== M.s[j]) {
          // (las piezas con ese material salen de su junta; si no se puede, la isla queda entera)
          if (STRICT) for (const i of M.isl) L.dirtyIsl(i, 'cambió un material');
          else {
            for (const W of watch) {
              if (W.gone || W.mat !== m) continue;
              W.gone = true;
              evict(W.o, W.i, 'cambió su material ' + whoOf(W.o));
            }
            M.s = now;
          }
          break;
        }
      }
    }
  };
  // (cada cuadro, con el mundo: World.update → extraUpdate)
  const prevUp = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prevUp?.(dt, t);
    L.tick();
  };
  L.stats = { ms: Math.round(performance.now() - t0), piezas: isl.size, chiquitos: tiny.length, suciedad: grime.length, deTodo: maps.length, partes: chunks.length, juntas: group.children.length - chunks.length, vertices: verts };
  return L;
}

// La esfera de los vértices que usa una lista de índices.
function boundsOf(pos, list) {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let j = 0; j < list.length; j++) b.expandByPoint(v.fromBufferAttribute(pos, list[j]));
  const s = new THREE.Sphere();
  b.getCenter(s.center);
  let r2 = 0;
  for (let j = 0; j < list.length; j++) r2 = Math.max(r2, s.center.distanceToSquared(v.fromBufferAttribute(pos, list[j])));
  s.radius = Math.sqrt(r2);
  return s;
}
