import * as THREE from 'three';

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
// En el G-buffer de Épica (fx/Epic.js, la oclusión y los reflejos) el umbral es
// más alto: en una pieza de menos de GB_PX de radio la sombra de contacto y el
// reflejo no se ven, y cada una era una llamada más de dibujo
// (globalThis.__mduNoGbCull para comparar).

const MIN_PX = 3.5; // radio en px de pantalla (≈ 7 px de ancho)
const GB_PX = 8; // en el G-buffer (≈ 16 px de ancho)
// y si el G-buffer es solo para la oclusión (Alta y Media: sin reflejos ni haces
// que lean su profundidad), más alto: a media resolución y difuminada, la de una
// pieza chica no se ve; en una compu lenta el G-buffer era ~15% del cuadro
// (globalThis.__mduGbAo8: el de siempre)
const GB_PX_AO = 16;
const MAX_R = 2; // las chicas: hasta 2 m de radio
const ROOM_MAX_R = 8; // lo de adentro de un cuarto (si entra entero; ver roomOf)
const ROOM_NEAR = 8;
const ROOM_HIDE = 3;
const ROOM_STALE = 150; // ms sin dibujar la caja (fuera de cámara): cuenta como vista

let MAIN = null; // el frustum de las cámaras del renderer (el de las sombras es otro)
let cam = null;
let k = 0;
let probe = false;
let on = null;
let mainCam = null;
let gl = null;
let rooms = [];
let now = 0;
let px = MIN_PX; // el umbral de la pasada que se está dibujando
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
// cuántas se dejaron de dibujar (para las pruebas)
export const sizeCullStats = { culled: 0, rooms: 0 };

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

function test(frustum) {
  if (frustum === MAIN && cam !== null) {
    const R = this.__scRoom;
    const room = R !== undefined && R.off && globalThis.__mduNoRooms !== true;
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
        if (r * r < px * px * (dx * dx + dy * dy + dz * dz)) {
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
  for (const R of rooms) {
    if (R.q !== null && !R.open && gl.getQueryParameter(R.q, gl.QUERY_RESULT_AVAILABLE)) {
      if (gl.getQueryParameter(R.q, gl.QUERY_RESULT)) {
        R.occ = 0;
        R.hidden = false;
      } else if (++R.occ >= ROOM_HIDE) R.hidden = true;
      R.q = null;
    }
    const b = R.box;
    const dx = Math.max(b.min.x - x, 0, x - b.max.x);
    const dy = Math.max(b.min.y - y, 0, y - b.max.y);
    const dz = Math.max(b.min.z - z, 0, z - b.max.z);
    if (now - R.seen > ROOM_STALE || dx * dx + dy * dy + dz * dz < ROOM_NEAR * ROOM_NEAR) {
      R.hidden = false;
      R.occ = 0;
    }
    R.off = R.hidden;
  }
}

function install(renderer) {
  if (renderer.__sizeCull) return;
  renderer.__sizeCull = true;
  gl = renderer.getContext();
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const c0 = cam;
    const k0 = k;
    if (camera.isPerspectiveCamera && on !== null && on()) {
      cam = camera;
      const h = renderer.domElement.clientHeight || gl.drawingBufferHeight;
      k = (h * 0.5) / Math.tan((camera.getEffectiveFOV() * Math.PI) / 360);
      if (MAIN === null && !probe) {
        probe = true;
        FP.setFromProjectionMatrix = spot;
      }
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
  const r = geo.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
  if (!(r > 0) || r > ROOM_MAX_R) return 0;
  o.__scSmall = plain && r <= MAX_R;
  return r;
}

// El cuarto (si hay) que tiene la pieza adentro: el centro en el cuarto y la
// esfera sin salir más de WALL_IN por los costados (las paredes son la fila de
// casilleros de afuera de los rects: lo que se mete ahí queda tapado), ni por
// debajo del piso ni por arriba del techo.
const WALL_IN = 0.9;
function roomOf(o, r) {
  _v.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
  for (const R of rooms) {
    for (const b of R.parts) {
      if (_v.x < b[0] || _v.x > b[3] || _v.z < b[2] || _v.z > b[5] || _v.y < b[1] || _v.y > b[4]) continue;
      if (_v.x - r >= b[0] - WALL_IN && _v.x + r <= b[3] + WALL_IN && _v.z - r >= b[2] - WALL_IN && _v.z + r <= b[5] + WALL_IN && _v.y - r >= b[1] - 0.5 && _v.y + r <= b[4] + 0.2) return R;
    }
  }
  return undefined;
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
    const R = { key: def.key, parts, box: geo.boundingBox.clone(), mesh, q: null, open: false, occ: 0, hidden: false, off: false, seen: 0 };
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
  install(renderer);
  mainCam = opts.camera || null;
  buildRooms(scene, mainCam ? opts.rooms : null);
  scene.updateMatrixWorld(true);
  let n = 0;
  let inRooms = 0;
  const walk = (o) => {
    if (!o.visible) return;
    const r = fits(o);
    if (r > 0) {
      o.__scR = r;
      o.__scRoom = roomOf(o, r);
      if (o.__scRoom !== undefined) inRooms++;
      if (o.__scSmall || o.__scRoom !== undefined) {
        o.intersectsFrustum = test;
        n++;
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(scene);
  return { pieces: n, inRooms, rooms: rooms.length };
}

// fx/Epic.js: lo que dibuja el G-buffer, con su umbral (true) o el de siempre.
export function gbufferPass(onGb, aoOnly = false) {
  px = onGb && globalThis.__mduNoGbCull !== true ? (aoOnly && globalThis.__mduGbAo8 !== true ? GB_PX_AO : GB_PX) : MIN_PX;
}

// Para las pruebas: cómo está cada cuarto.
export function roomsState() {
  return rooms.map((R) => ({ key: R.key, off: R.off, occ: R.occ, age: Math.round(now - R.seen), pending: R.q !== null }));
}
