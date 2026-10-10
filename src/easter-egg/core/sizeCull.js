import * as THREE from 'three';
import { FEATURES } from '../config/map';

// Lo que no hace falta dibujar, decidido solo para las cámaras (main, reflejo):
// las sombras usan su propio frustum y no se tocan, y tampoco se toca .visible
// (la caché de sombras de fx/Epic.js y el juego lo leen). Cada compu decide con
// su cámara: no cambia nada de la partida ni de lo que se manda en línea.
// 1. Piezas chicas que de lejos miden menos de unos px en pantalla. Desde el
//    muelle del penal eran ~800 (cajones, frascos, adornos) de menos de 6 px,
//    un dibujo cada una (dos en Alta, por la pasada previa de la luz).
// 2. Lo de adentro de los cuartos con techo (y de las zonas abiertas, como el
//    patio del penal, hasta 4 m de alto), cuando la placa dice que no se ve
//    nada del cuarto: una caja un poco más chica que el cuarto se dibuja al
//    final, sin color ni profundidad, con una consulta de oclusión. Conservador:
//    más cerca de ROOM_NEAR m siempre se dibuja; para esconder hacen falta
//    ROOM_HIDE consultas seguidas tapado, y una sola que lo vea lo vuelve a
//    mostrar; si la caja sale de cámara, vuelve a contar como visto.
// Qué entra: para las chicas, mallas comunes opacas sin shader propio; para
// los cuartos, cualquier malla, sprite, punto o línea entera adentro (no
// instanced ni skinned). Nunca lo que tiene onBeforeRender/onAfterRender
// propios (lo que hace algo al dibujarse se dibuja siempre), y solo lo que
// está a la vista al armar el mapa (lo escondido —jefes, mates por comprar,
// pools— queda afuera). Lo que se movió fuera de su cuarto se dibuja.
// Solo mientras on() (Game: jugando con la cámara en los ojos del jugador);
// en las cinemáticas, que panean el mapa de lejos, se dibuja todo.
// Para comparar, en vivo: globalThis.__mduNoSizeCull (las chicas) y
// globalThis.__mduNoRooms (los cuartos).
// 3. Un cuarto con techo que queda tan lejos que la niebla lo tapa del todo
//    (FOG_HIDE: 99%) se esconde aunque la consulta lo vea: desde el islote del
//    penal se veían 15-60 px de la caja del pabellón, del comedor y de las
//    duchas, a 70-90 m, y se dibujaba todo lo de adentro. Solo lo que la niebla
//    tapa de verdad (__scFog: material con niebla, sin brillo propio fuerte);
//    los cuartos sin techo no (sus cosas se recortan contra el cielo).
//    globalThis.__mduNoFogRooms para comparar.
// Para ver si una pieza está adentro de un cuarto se usa su caja en el mundo
// (no la esfera: una pileta de luz en el piso o un grupo largo contra la pared
// tienen la esfera mucho más grande que lo que ocupan).
// En el G-buffer de Épica (fx/Epic.js, la oclusión y los reflejos) el umbral es
// más alto: en una pieza de menos de GB_PX de radio la sombra de contacto y el
// reflejo no se ven, y cada una era una llamada más de dibujo
// (globalThis.__mduNoGbCull para comparar).

// 4. Lo plano de una sola cara que mira para arriba (pisos sueltos, tarimas,
//    calcos, marcas del piso), con la cámara más abajo que la malla: se ve de
//    atrás, three no pinta nada y el dibujo se mandaba igual. En Eclipse, desde
//    una isla baja, eran los pisos y las marcas de todas las de arriba (20-30
//    por cuadro); el espejo del agua (su cámara va por debajo) los ve siempre
//    así. Se mira la geometría de verdad (todos los triángulos horizontales y
//    con la cara para arriba, no las normales), en cada dibujo la matriz (si la
//    giran o la espejan, se dibuja) y con margen. Mismo resultado, sin cambio de
//    imagen. globalThis.__mduNoUpCull: como antes.

const MIN_PX = 3.5; // radio en px de pantalla (≈ 7 px de ancho)
const GB_PX = 8; // en el G-buffer (≈ 16 px de ancho)
// y si el G-buffer es solo para la oclusión (Alta y Media: sin reflejos ni haces
// que lean su profundidad), más alto: a media resolución y difuminada, la de una
// pieza chica no se ve; en una compu lenta el G-buffer era ~15% del cuadro
// (globalThis.__mduGbAo8: el de siempre)
const GB_PX_AO = 16;
const MAX_R = 2; // las chicas: hasta 2 m de radio
const ROOM_MAX_R = 16; // lo de adentro de un cuarto (si entra entero; ver roomOf)
const ROOM_NEAR = 8;
const ROOM_HIDE = 3;
const ROOM_STALE = 150; // ms sin dibujar la caja (fuera de cámara): cuenta como vista
// ...salvo que la cámara siga donde la consulta lo vio tapado: lo que tapa una
// pared depende de dónde está la cámara, no de para dónde mira. Girando rápido
// (el mirador del castillo) cada cuarto que volvía a entrar en cámara se
// dibujaba entero 3-4 cuadros hasta la consulta nueva: 200 → 1000 dibujos.
// Hasta ROOM_KEEP_D m de ahí y ROOM_KEEP_MS ms (una puerta que se abrió).
// (globalThis.__mduNoRoomKeep: como antes)
const ROOM_KEEP_D = 1;
const ROOM_KEEP_MS = 8000;
const FOG_HIDE = 2.2; // densidad × distancia: 1 - e^(-2,2²) ≈ 99% de niebla

let MAIN = null; // el frustum de las cámaras del renderer (el de las sombras es otro)
let cam = null;
let k = 0;
let probe = false;
let on = null;
let mainCam = null;
let gl = null;
let rooms = [];
let fogScene = null;
let fogFar = Infinity; // hasta dónde se ve algo (99% de niebla), del último render con niebla
let now = 0;
let px = MIN_PX; // el umbral de la pasada que se está dibujando
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
// cuántas se dejaron de dibujar (para las pruebas)
export const sizeCullStats = { culled: 0, rooms: 0, fog: 0, up: 0 };

// (en una sola pasada: transparente y de doble cara, three la dibujaba en dos
// —atrás y adelante— y en cada una volvía a buscar el programa: 32 búsquedas
// por cuadro con los cuartos del penal)
const PROXY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, forceSinglePass: true });

// El frustum de las cámaras es el que el renderer arma con proyección × vista
// de la cámara que dibuja: se reconoce la primera vez y se deja de mirar.
const FP = THREE.Frustum.prototype;
const setFrom = FP.setFromProjectionMatrix;
function spot(m, ...rest) {
  if (probe && cam !== null) {
    const a = _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const b = m.elements;
    let same = true;
    for (let i = 0; i < 16 && same; i++) same = Math.abs(a[i] - b[i]) < 1e-6;
    if (same) {
      MAIN = this;
      probe = false;
      FP.setFromProjectionMatrix = setFrom;
    }
  }
  return setFrom.call(this, m, ...rest);
}

// Eclipse Matero (grafica-v3): mirando de una isla baja a las altas entran en
// cámara las piezas chicas de todas las islas (la niebla es finita a
// propósito). De más de ECL_FAR m, las de menos de ECL_FAR_PX de radio no se
// dibujan. globalThis.__mduNoEclGbFar: como antes (también lo del G-buffer).
const ECL_FAR2 = 55 * 55;
const ECL_FAR_PX = 10;
let ECL_ON = false;
// Eclipse: lo de las islas de lejos (world/eclipseLejos.js). Si devuelve true,
// la pieza no se dibuja con esta cámara (la reemplaza la malla junta de su isla).
let farHook = null;
export function setFarHook(fn) {
  farHook = fn;
}
// La cámara que está dibujando si `frustum` es el de las cámaras y se recorta
// (jugando, con la cámara en los ojos); si no (sombras, cinemáticas), null.
export function camFrustumIs(frustum) {
  return frustum === MAIN && cam !== null ? cam : null;
}
// px de pantalla por radián de esa cámara (0 si todavía no dibujó)
export function pxScale(camera) {
  return kOf.get(camera) || 0;
}
// ---- lo plano que mira para arriba (4) ----
const UP_COS = 1 - 1e-8;
const UP_MAX = 600000; // índices: más grande que esto no se mira
// ¿Todos los triángulos de la malla son paralelos entre sí y con la cara del
// mismo lado? Devuelve la normal, el punto más bajo a lo largo de ella y lo más
// lejos que llega un vértice; null si no.
function scanUp(o) {
  const geo = o.geometry;
  const p = geo?.attributes?.position;
  if (!p || p.isInterleavedBufferAttribute || p.count < 3 || geo.morphAttributes?.position) return null;
  const idx = geo.index;
  const n = idx ? idx.count : p.count;
  if (n < 3 || n > UP_MAX) return null;
  const a = p.array;
  const st = p.itemSize;
  const ia = idx ? idx.array : null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let has = false;
  let min = Infinity;
  let far2 = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = (ia ? ia[t] : t) * st;
    const i1 = (ia ? ia[t + 1] : t + 1) * st;
    const i2 = (ia ? ia[t + 2] : t + 2) * st;
    const ax = a[i0];
    const ay = a[i0 + 1];
    const az = a[i0 + 2];
    const ux = a[i1] - ax;
    const uy = a[i1 + 1] - ay;
    const uz = a[i1 + 2] - az;
    const vx = a[i2] - ax;
    const vy = a[i2 + 1] - ay;
    const vz = a[i2 + 2] - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz);
    // (un triángulo sin área no pinta nada: no cuenta)
    if (!(l > 1e-12)) continue;
    if (!has) {
      nx = cx / l;
      ny = cy / l;
      nz = cz / l;
      has = true;
    } else if (!((cx * nx + cy * ny + cz * nz) / l > UP_COS)) return null;
    for (let q = 0; q < 3; q++) {
      const i = q === 0 ? i0 : q === 1 ? i1 : i2;
      const d = a[i] * nx + a[i + 1] * ny + a[i + 2] * nz;
      if (d < min) min = d;
      const r2 = a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2];
      if (r2 > far2) far2 = r2;
    }
  }
  if (!has) return null;
  return { x: nx, y: ny, z: nz, min, far: Math.sqrt(far2), g: geo, pv: p.version, iv: idx ? idx.version : -1, k: 0 };
}
// (para fx/Water.js: lo mismo por geometría, guardado; y si una matriz deja esa
// normal mirando para arriba sin espejar)
const flatMemo = new WeakMap();
export function flatOf(o) {
  const geo = o.geometry;
  const p = geo?.attributes?.position;
  if (!p) return null;
  const M = flatMemo.get(geo);
  if (M !== undefined && M.pv === p.version && M.iv === (geo.index ? geo.index.version : -1)) return M.U;
  const U = scanUp(o);
  flatMemo.set(geo, { U, pv: p.version, iv: geo.index ? geo.index.version : -1 });
  return U;
}
export function upRow(e, U) {
  const s = Math.hypot(e[1], e[5], e[9]);
  if (!(e[1] * U.x + e[5] * U.y + e[9] * U.z > UP_COS * s)) return false;
  return e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]) > 0;
}
// ¿Puede entrar? (malla común, de una cara, sin shader propio ni nada que corra al dibujarse)
function upFits(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || !o.frustumCulled) return false;
  const own = (k) => Object.prototype.hasOwnProperty.call(o, k);
  if (own('onBeforeRender') || own('onAfterRender')) return false;
  if (own('intersectsFrustum') && o.intersectsFrustum !== test) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || m.side !== THREE.FrontSide || m.isShaderMaterial || m.isRawShaderMaterial || m.displacementMap) return false;
  return m.onBeforeRender === THREE.Material.prototype.onBeforeRender;
}
// Anota la malla si es plana y mira para un solo lado (world/eclipseLejos.js la
// usa para las partes que arma después). Devuelve si quedó anotada.
export function markUp(o) {
  o.__scUp = undefined;
  if (!upFits(o)) return false;
  const U = scanUp(o);
  if (U === null) return false;
  o.__scUp = U;
  return true;
}
// ¿Esta cámara la ve de atrás (está más abajo que toda la malla, que mira para arriba)?
export function upHidden(o, c) {
  let U = o.__scUp;
  if (U === undefined || globalThis.__mduNoUpCull === true) return false;
  const m = o.material;
  if (m.side !== THREE.FrontSide) return false;
  const geo = o.geometry;
  const p = geo.attributes.position;
  if (geo !== U.g || p === undefined || p.version !== U.pv || (geo.index ? geo.index.version : -1) !== U.iv) {
    // (le cambiaron la geometría: se mira de nuevo; si cambia seguido, se deja)
    const k = U.k + 1;
    U = k > 3 ? null : scanUp(o);
    if (U === null) {
      o.__scUp = undefined;
      return false;
    }
    U.k = k;
    o.__scUp = U;
  }
  const e = o.matrixWorld.elements;
  // la fila de la altura tiene que ser la normal de la malla (queda mirando
  // para arriba), sin espejar
  const s = Math.hypot(e[1], e[5], e[9]);
  if (!(e[1] * U.x + e[5] * U.y + e[9] * U.z > UP_COS * s)) return false;
  if (!(e[0] * (e[5] * e[10] - e[9] * e[6]) - e[4] * (e[1] * e[10] - e[9] * e[2]) + e[8] * (e[1] * e[6] - e[5] * e[2]) > 0)) return false;
  const ce = c.matrixWorld.elements;
  // (margen: 5 cm, el error de la cuenta y 2 mm por metro de distancia)
  const dx = ce[12] - e[12];
  const dz = ce[14] - e[14];
  return ce[13] < s * U.min + e[13] - 0.05 - 2e-4 * s * U.far - 0.002 * (Math.abs(dx) + Math.abs(dz) + s * U.far);
}

function test(frustum) {
  if (frustum === MAIN && cam !== null) {
    if (farHook !== null && farHook(this, cam)) return false;
    if (this.__scUp !== undefined && upHidden(this, cam)) {
      sizeCullStats.up++;
      return false;
    }
    const R = this.__scRoom;
    const room = R !== undefined && (R.off || (R.fog && (globalThis.__mduNoFogFar === true ? this.__scFog : this.__scFogW) === true && globalThis.__mduNoFogRooms !== true)) && globalThis.__mduNoRooms !== true;
    const small = this.__scSmall === true && globalThis.__mduNoSizeCull !== true;
    if (room || small) {
      _v.copy(this.geometry.boundingSphere.center).applyMatrix4(this.matrixWorld);
      // (si se la llevaron fuera de su cuarto —una pieza del escudo a la mesa—, se dibuja)
      if (room && inRoom(R, _v)) {
        sizeCullStats.rooms++;
        return false;
      }
      if (small) {
        const c = cam.matrixWorld.elements;
        const dx = _v.x - c[12];
        const dy = _v.y - c[13];
        const dz = _v.z - c[14];
        const r = this.__scR * k;
        const d2 = dx * dx + dy * dy + dz * dz;
        // (Eclipse: las piezas chicas de las otras islas, de lejos, con un umbral más alto)
        const pp = ECL_ON && d2 > ECL_FAR2 && px < ECL_FAR_PX && globalThis.__mduNoEclGbFar !== true ? ECL_FAR_PX : px;
        if (r * r < pp * pp * d2) {
          sizeCullStats.culled++;
          return false;
        }
      }
    }
  }
  return Object.getPrototypeOf(this).intersectsFrustum.call(this, frustum);
}

function inRoom(R, v) {
  for (const b of R.parts) if (v.x >= b[0] && v.x <= b[3] && v.z >= b[2] && v.z <= b[5] && v.y >= b[1] - 0.5 && v.y <= b[4]) return true;
  return false;
}

// Resultados de las consultas y qué cuartos quedan escondidos (con la cámara
// de los ojos, antes de cada render).
function roomTick() {
  const c = mainCam.matrixWorld.elements;
  const x = c[12];
  const y = c[13];
  const z = c[14];
  // (hasta dónde se ve algo a través de la niebla)
  const f = fogScene?.fog;
  const far = f?.isFogExp2 ? (f.density > 1e-4 ? FOG_HIDE / f.density : Infinity) : f?.isFog ? f.far : Infinity;
  for (const R of rooms) {
    if (R.q !== null && !R.open && gl.getQueryParameter(R.q, gl.QUERY_RESULT_AVAILABLE)) {
      if (gl.getQueryParameter(R.q, gl.QUERY_RESULT)) {
        R.occ = 0;
        R.hidden = false;
      } else if (++R.occ >= ROOM_HIDE) {
        R.hidden = true;
        // (dónde estaba la cámara cuando la consulta lo vio tapado)
        R.hx = x;
        R.hy = y;
        R.hz = z;
        R.hideAt = now;
      }
      R.q = null;
    }
    const b = R.box;
    const dx = Math.max(b.min.x - x, 0, x - b.max.x);
    const dy = Math.max(b.min.y - y, 0, y - b.max.y);
    const dz = Math.max(b.min.z - z, 0, z - b.max.z);
    const kx = x - (R.hx ?? 1e9);
    const ky = y - (R.hy ?? 1e9);
    const kz = z - (R.hz ?? 1e9);
    const keep = R.hidden && kx * kx + ky * ky + kz * kz < ROOM_KEEP_D * ROOM_KEEP_D && now - R.hideAt < ROOM_KEEP_MS && globalThis.__mduNoRoomKeep !== true;
    if ((now - R.seen > ROOM_STALE && !keep) || dx * dx + dy * dy + dz * dz < ROOM_NEAR * ROOM_NEAR) {
      R.hidden = false;
      R.occ = 0;
    }
    R.off = R.hidden;
    R.fog = R.indoor && dx * dx + dy * dy + dz * dz > far * far;
  }
}

function install(renderer) {
  if (renderer.__sizeCull) return;
  renderer.__sizeCull = true;
  gl = renderer.getContext();
  // el alto del lienzo en px de CSS: leer clientHeight en cada render (4 por
  // cuadro) obligaba al navegador a rehacer el layout si el HUD había cambiado;
  // se guarda y se actualiza cuando cambia de tamaño (mismo valor).
  // globalThis.__mduNoCanvasH: leerlo cada vez, como antes.
  const el = renderer.domElement;
  let ch = el.clientHeight;
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => (ch = el.clientHeight)).observe(el);
  else ch = 0;
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const c0 = cam;
    const k0 = k;
    if (camera.isPerspectiveCamera && on !== null && on()) {
      cam = camera;
      const h = (ch > 0 && globalThis.__mduNoCanvasH !== true ? ch : el.clientHeight) || gl.drawingBufferHeight;
      k = (h * 0.5) / Math.tan((camera.getEffectiveFOV() * Math.PI) / 360);
      kOf.set(camera, k);
      if (MAIN === null && !probe) {
        probe = true;
        FP.setFromProjectionMatrix = spot;
      }
      // (el G-buffer de fx/Epic.js dibuja con scene.fog = null: queda la de antes)
      const f = camera === mainCam ? fogScene?.fog : null;
      if (f) fogFar = f.isFogExp2 ? (f.density > 1e-4 ? FOG_HIDE / f.density : Infinity) : f.isFog ? f.far : Infinity;
      if (camera === mainCam && rooms.length) {
        now = performance.now();
        roomTick();
      }
    } else cam = null;
    try {
      return render(scene, camera);
    } finally {
      cam = c0;
      k = k0;
    }
  };
}

// Qué puede entrar: el radio (0 = nada). Las chicas, además, solo mallas
// opacas sin shader propio (__scSmall); en un cuarto tapado entra cualquier
// malla, sprite, punto o línea que esté entera adentro.
function fits(o) {
  if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine) || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || !o.frustumCulled) return 0;
  const own = (p) => Object.prototype.hasOwnProperty.call(o, p);
  if (own('intersectsFrustum') && o.intersectsFrustum !== test) return 0;
  if (own('onBeforeRender') || own('onAfterRender')) return 0;
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  let plain = o.isMesh;
  for (const m of ms) {
    if (!m || m.onBeforeRender !== THREE.Material.prototype.onBeforeRender) return 0;
    if (m.transparent || m.isShaderMaterial || m.isRawShaderMaterial) plain = false;
  }
  const geo = o.geometry;
  if (!geo?.attributes?.position) return 0;
  if (geo.boundingSphere === null) geo.computeBoundingSphere();
  // (userData.scR: un grupo fundido que de lejos se recorta como una pieza
  // suya, p. ej. los cuatro globos de una farola del Monumento)
  const r = (o.userData.scR ?? geo.boundingSphere.radius) * o.matrixWorld.getMaxScaleOnAxis();
  if (!(r > 0) || r > ROOM_MAX_R) return 0;
  o.__scSmall = plain && r <= MAX_R;
  return r;
}

// El cuarto (si hay) que tiene la pieza adentro: el centro en el cuarto y su
// caja en el mundo sin salir más de WALL_IN por los costados (las paredes son
// la fila de casilleros de afuera de los rects: lo que se mete ahí queda
// tapado), ni por debajo del piso ni por arriba del techo.
const WALL_IN = 0.9;
function roomOf(o) {
  _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
  if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
  _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
  for (const R of rooms) {
    for (const b of R.parts) {
      if (_v.x < b[0] || _v.x > b[3] || _v.z < b[2] || _v.z > b[5] || _v.y < b[1] - 0.5 || _v.y > b[4]) continue;
      if (_box.min.x >= b[0] - WALL_IN && _box.max.x <= b[3] + WALL_IN && _box.min.z >= b[2] - WALL_IN && _box.max.z <= b[5] + WALL_IN && _box.min.y >= b[1] - 0.5 && _box.max.y <= b[4] + 0.2) return R;
    }
  }
  return undefined;
}

// ¿La niebla la tapa del todo? Materiales con niebla, sin brillo propio fuerte
// (una lámpara se ve a través de la niebla) ni mezcla aditiva.
function fogged(o, weakMap = false) {
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (!m || m.fog !== true || m.toneMapped === false || m.blending === THREE.AdditiveBlending || (m.emissiveMap && !weakMap)) return false;
    if (m.emissive && Math.max(m.emissive.r, m.emissive.g, m.emissive.b) * (m.emissiveIntensity ?? 1) > 0.5) return false;
  }
  return true;
}

function buildRooms(scene, list) {
  for (const R of rooms) {
    R.mesh.removeFromParent();
    R.mesh.geometry.dispose();
    if (R.q !== null && !R.open) gl.deleteQuery(R.q);
  }
  rooms = [];
  for (const def of list || []) {
    // la caja de cada parte, 0,3 m más adentro de las paredes y del piso y el techo
    const parts = def.boxes.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5]]);
    const geos = parts.map((b) => {
      const g = new THREE.BoxGeometry(b[3] - b[0] - 0.6, b[4] - b[1] - 0.2, b[5] - b[2] - 0.6);
      g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      return g;
    });
    const geo = mergeBoxes(geos);
    const mesh = new THREE.Mesh(geo, PROXY);
    mesh.name = `room:${def.key}`;
    mesh.renderOrder = 1e9;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {};
    geo.computeBoundingBox();
    const R = { key: def.key, parts, box: geo.boundingBox.clone(), mesh, q: null, open: false, occ: 0, hidden: false, off: false, seen: 0, indoor: !!def.indoor, fog: false };
    mesh.onBeforeRender = (renderer, sc, camera, g, material) => {
      const go = cam !== null && camera === mainCam && material === PROXY;
      if (go) R.seen = now;
      const ask = go && R.q === null;
      g.setDrawRange(0, ask ? Infinity : 0);
      if (ask) {
        R.q = gl.createQuery();
        gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, R.q);
        R.open = true;
      }
    };
    mesh.onAfterRender = () => {
      if (R.open) {
        gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
        R.open = false;
      }
    };
    scene.add(mesh);
    rooms.push(R);
  }
}

function mergeBoxes(geos) {
  if (geos.length === 1) return geos[0];
  const pos = [];
  const idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += p.length / 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// Al terminar de armar el mapa: marca las piezas que entran.
// rooms: [{ key, boxes: [[x0, y0, z0, x1, y1, z1], ...] }] (los cuartos con techo)
export function sizeCull(renderer, scene, when, opts = {}) {
  on = when;
  ECL_ON = !!FEATURES?.eclipse;
  install(renderer);
  mainCam = opts.camera || null;
  fogScene = scene;
  fogFar = Infinity;
  buildRooms(scene, mainCam ? opts.rooms : null);
  scene.updateMatrixWorld(true);
  let n = 0;
  let inRooms = 0;
  const walk = (o) => {
    if (!o.visible) return;
    const r = fits(o);
    if (r > 0) {
      o.__scR = r;
      o.__scRoom = roomOf(o);
      if (o.__scRoom !== undefined) {
        inRooms++;
        o.__scFog = fogged(o);
      }
      // (un emisivo con mapa pero flojo —las paredes del penal, ×0,05— la
      // niebla también lo tapa; globalThis.__mduNoFogFar: como antes)
      o.__scFogW = fogged(o, true);
      o.__scFR = r;
      if (o.__scSmall || o.__scRoom !== undefined) {
        o.intersectsFrustum = test;
        n++;
      }
    } else if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry?.attributes?.position) {
      // (las grandes: solo para el G-buffer, gbDrop)
      if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
      o.__scFR = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
      o.__scFogW = fogged(o, true);
    }
    // (lo plano que mira para arriba: de cualquier tamaño)
    if (o.isMesh && markUp(o) && o.intersectsFrustum !== test) o.intersectsFrustum = test;
    for (const c of o.children) walk(c);
  };
  walk(scene);
  return { pieces: n, inRooms, rooms: rooms.length };
}

// fx/Epic.js: lo que dibuja el G-buffer, con su umbral (true) o el de siempre.
export function gbufferPass(onGb, aoOnly = false) {
  px = onGb && globalThis.__mduNoGbCull !== true ? (aoOnly && globalThis.__mduGbAo8 !== true ? GB_PX_AO : GB_PX) : MIN_PX;
}

// fx/Epic.js, G-buffer armado con la lista del pase principal (fromMain): de
// lo que el principal dibujó, lo que el umbral más alto del G-buffer saca (lo
// mismo que test() con ese umbral; lo demás ya pasó por los cuartos y el
// frustum en el principal). gbBegin(cámara, aoOnly): ¿hay algo que mirar?
const kOf = new WeakMap();
let gbCam = null;
let gbK = 0;
let gbPx = 0;
export function gbBegin(camera, aoOnly) {
  gbCam = null;
  if (MAIN === null || !camera.isPerspectiveCamera || on === null || !on() || globalThis.__mduNoSizeCull === true) return false;
  const p = globalThis.__mduNoGbCull !== true ? (aoOnly && globalThis.__mduGbAo8 !== true ? GB_PX_AO : GB_PX) : MIN_PX;
  const kk = kOf.get(camera);
  if (p <= MIN_PX || kk === undefined) return false;
  gbCam = camera;
  gbK = kk;
  gbPx = p;
  return true;
}
// Eclipse Matero (grafica-v3): desde las islas bajas, mirando a las altas, en
// cámara entran todas las islas (la niebla es finita a propósito: se tienen
// que ver de lejos) y el G-buffer las dibujaba enteras otra vez. Más allá de
// esto la oclusión y los reflejos no se ven. globalThis.__mduNoEclGbFar: como antes.
const ECL_GB_FAR = 70;
export function gbDrop(o) {
  if (FEATURES.eclipse && o.__scFR !== undefined && globalThis.__mduNoEclGbFar !== true) {
    _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const c = gbCam.matrixWorld.elements;
    const dx = _v.x - c[12];
    const dy = _v.y - c[13];
    const dz = _v.z - c[14];
    const d = ECL_GB_FAR + o.__scFR;
    if (dx * dx + dy * dy + dz * dz > d * d) {
      sizeCullStats.fog++;
      return true;
    }
  }
  // 4. lo que la niebla tapa del todo (más de FOG_HIDE) tampoco: en el color ya
  // es niebla pareja, y en el G-buffer solo sumaba dibujos (la oclusión de
  // lejos no se ve, la bruma de la luna corta a 45 m y los reflejos de lejos
  // dan niebla). Desde el islote del penal, mirando al penal, con lo de los
  // cuartos (__scFogW): 880 → 692 dibujos por cuadro a 1440p Épica.
  // La pasada principal no se toca (la silueta contra el cielo queda igual).
  // globalThis.__mduNoFogFar: como antes.
  if (o.__scFogW === true && fogFar < Infinity && globalThis.__mduNoFogFar !== true) {
    _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const c = gbCam.matrixWorld.elements;
    const dx = _v.x - c[12];
    const dy = _v.y - c[13];
    const dz = _v.z - c[14];
    const d = fogFar + o.__scFR;
    if (dx * dx + dy * dy + dz * dz > d * d) {
      sizeCullStats.fog++;
      return true;
    }
  }
  if (o.__scSmall !== true || o.frustumCulled !== true || o.intersectsFrustum !== test) return false;
  _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
  const c = gbCam.matrixWorld.elements;
  const dx = _v.x - c[12];
  const dy = _v.y - c[13];
  const dz = _v.z - c[14];
  const r = o.__scR * gbK;
  return r * r < gbPx * gbPx * (dx * dx + dy * dy + dz * dz);
}

// Para las pruebas: cómo está cada cuarto.
export function roomsState() {
  return rooms.map((R) => ({ key: R.key, off: R.off, occ: R.occ, age: Math.round(now - R.seen), pending: R.q !== null }));
}

// ¿Se ve algo del cuarto `key` desde la cámara de los ojos? (la consulta de
// oclusión no lo dio tapado y la niebla no lo tapa). null: no hay ese cuarto o
// están apagados. Lo usa world/eclipse/v5.js zoneCuller: lo de adentro de una
// sala se dibuja también mirándola por una puerta desde lejos (agente rend).
export function roomOpen(key) {
  if (globalThis.__mduNoRooms === true) return null;
  for (const R of rooms) if (R.key === key) return !R.hidden && !R.fog;
  return null;
}
