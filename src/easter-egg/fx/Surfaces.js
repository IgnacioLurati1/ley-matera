import * as THREE from 'three';
import { patchTiling, tilingFor, TILING_KEY } from './Tiling';
import { patchDetail, detailFor, DETAIL_KEY } from './Detail';

// Relieve de paredes y pisos: normal maps de verdad desde Media (en Baja y
// Rendimiento no se calcula nada y queda el bump sacado del color, como siempre).
//
// Cada textura procedural puede traer en su canvas
//   relief = { h(x, y) | H, scale, detail, blur }
// - h: la altura en ese pixel (0 = junta hundida, 1 = lo que sobresale) con el
//   mismo trazado que usó para pintarse. Así la junta y el bisel salen exactos
//   y no de lo oscuro del color (el mortero claro no se levanta). Tiene que
//   ser barata (sin ruido: el grano ya lo da `detail`); si la altura sale de un
//   ruido que el paint ya calcula, mejor guardarla ahí en `H` (Float32Array w*h).
// - detail: cuánto grano fino suma el high-pass del brillo del color (radio blur).
// - scale: fuerza del relieve.
// - rough: rugosidad de 0 a 1 en cada pixel (función o arreglo), para lo que
//   brilla distinto en la junta y en la pieza (azulejo, damero, hielo).
// - depth: metros de lo más alto a lo más hondo. Solo las que lo tienen llevan
//   parallax (Ultra y Épica, de cerca): ladrillo, piedra, tablas, baldosa.
// El normal map se arma una sola vez por imagen y se le pone a todo material
// que use esa textura, compartiendo su repeat/offset. Estos materiales llevan
// también lo de fx/Tiling (que no se note la grilla), metido en su onBeforeCompile.

// qué hace cada calidad: 0 nada, 1 normal maps, 2 además parallax de cerca
const LEVEL = { perf: 0, low: 0, medium: 1, high: 1, ultra: 2, epic: 2 };
// hasta dónde llega el parallax (metros; se apaga de a poco desde el 60%)
const POM_FAR = 7;
const KINDS = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshPhongMaterial', 'MeshLambertMaterial']);
// pendiente por pixel → inclinación de la normal (el resto lo da `scale`)
const K = 6;

// cuánto tardó armar los normal maps (para medir)
export const stats = { baked: 0, ms: 0, read: 0, h: 0, blur: 0, sobel: 0 };
// para comparar en las pruebas (después de cambiarlo: materiales con dispose())
export const debug = { noPom: false };

const baked = new WeakMap(); // canvas → { n, orm, mean } (false si no hay relieve)
const normals = new WeakMap(); // textura de color → su normal map

// Promedio de caja separable, dando la vuelta en los bordes (la textura se
// repite). Las dos pasadas recorren fila por fila (la vertical acumula todas
// las columnas juntas): es la parte más cara al cargar.
function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + ((i + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * k;
      const a = x + r + 1;
      const b = x - r;
      s += src[o + (a < w ? a : a - w)] - src[o + (b >= 0 ? b : b + w)];
    }
  }
  const acc = new Float32Array(w);
  for (let i = -r; i <= r; i++) {
    const o = ((i + h) % h) * w;
    for (let x = 0; x < w; x++) acc[x] += tmp[o + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const a = y + r + 1;
    const b = y - r;
    const oa = (a < h ? a : a - h) * w;
    const ob = (b >= 0 ? b : b + h) * w;
    for (let x = 0; x < w; x++) {
      out[o + x] = acc[x] * k;
      acc[x] += tmp[oa + x] - tmp[ob + x];
    }
  }
  return out;
}

function bake(img) {
  const R = img.relief;
  const w = img.width;
  const h = img.height;
  const n = w * h;
  // `H` ya calculado (Float32Array w*h, lo llena el mismo paint) o `h(x, y)`
  const pre = R.H;
  const H = pre || new Float32Array(n);
  R.H = null; // se arma una sola vez: no hace falta guardarla
  let t = performance.now();
  if (R.h && !pre) for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) H[i] = R.h(x, y);
  const det = R.detail ?? 0.3;
  stats.h += performance.now() - t;
  if (det > 0) {
    t = performance.now();
    const d = img.getContext('2d').getImageData(0, 0, w, h).data;
    stats.read += performance.now() - t;
    t = performance.now();
    const L = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = (d[j] * 0.2126 + d[j + 1] * 0.7152 + d[j + 2] * 0.0722) / 255;
    const B = blur(L, w, h, R.blur ?? 3);
    for (let i = 0; i < n; i++) H[i] += (L[i] - B[i]) * det * 4;
    stats.blur += performance.now() - t;
  }
  t = performance.now();
  // Sobel con vuelta. El canvas va de arriba hacia abajo y la textura sube en v:
  // la fila y del canvas es la fila h-1-y de los datos (DataTexture sin flipY).
  const data = new Uint8Array(n * 4);
  // la altura va en el alfa (la lee el parallax), estirada a 0..1
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (H[i] < lo) lo = H[i];
    if (H[i] > hi) hi = H[i];
  }
  const ka = 255 / (hi - lo || 1);
  const k = (K * (R.scale ?? 1)) / 8;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w;
    const y0 = y * w;
    const yp = ((y + 1) % h) * w;
    let j = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, j += 4) {
      const xm = x > 0 ? x - 1 : w - 1;
      const xp = x < w - 1 ? x + 1 : 0;
      const dx = H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp] - (H[ym + xm] + 2 * H[y0 + xm] + H[yp + xm]);
      const dy = H[yp + xm] + 2 * H[yp + x] + H[yp + xp] - (H[ym + xm] + 2 * H[ym + x] + H[ym + xp]);
      const nx = -dx * k;
      const ny = dy * k;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      data[j] = (nx * l + 1) * 127.5 + 0.5;
      data[j + 1] = (ny * l + 1) * 127.5 + 0.5;
      data[j + 2] = (l + 1) * 127.5 + 0.5;
      data[j + 3] = (H[y0 + x] - lo) * ka + 0.5;
    }
  }
  // Cavidad (rojo, la lee el aoMap): lo que queda más hondo que lo de alrededor
  // (juntas, rendijas, grietas) recibe menos luz ambiente. Es lo que se nota con
  // la luz tenue del juego; el normal map solo cambia con luz directa.
  // Rugosidad (verde, relief.rough): el esmalte brilla y la junta no.
  const Bc = blur(H, w, h, R.aoBlur ?? 4);
  const kao = (R.ao ?? 1.2) / (hi - lo || 1);
  const rough = R.rough;
  const rfn = typeof rough === 'function';
  const orm = new Uint8Array(n * 2);
  let sum = 0;
  for (let y = 0, i = 0; y < h; y++) {
    let j = (h - 1 - y) * w * 2;
    for (let x = 0; x < w; x++, i++, j += 2) {
      orm[j] = (1 - Math.min(0.6, Math.max(0, Bc[i] - H[i]) * kao)) * 255 + 0.5;
      let v = 1;
      if (rough) v = Math.min(1, Math.max(0, rfn ? rough(x, y) : rough[i]));
      sum += v;
      orm[j + 1] = v * 255 + 0.5;
    }
  }
  stats.sobel += performance.now() - t;
  return {
    n: new THREE.DataTexture(data, w, h, THREE.RGBAFormat).source,
    orm: new THREE.DataTexture(orm, w, h, THREE.RGFormat).source,
    mean: rough ? sum / n : null,
  };
}

// Textura derivada con el mismo repeat/offset que el color (los mismos objetos:
// si el color se corre o se estira, lo derivado lo sigue).
function linked(map, src, format = THREE.RGBAFormat) {
  const t = new THREE.DataTexture(null, 1, 1, format);
  t.source = src;
  t.wrapS = map.wrapS;
  t.wrapT = map.wrapT;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = map.anisotropy;
  t.channel = map.channel;
  t.repeat = map.repeat;
  t.offset = map.offset;
  t.center = map.center;
  t.rotation = map.rotation;
  t.matrixAutoUpdate = map.matrixAutoUpdate;
  if (!map.matrixAutoUpdate) t.matrix = map.matrix;
  t.needsUpdate = true;
  return t;
}

function bakedOf(img) {
  let b = baked.get(img);
  if (b === undefined) {
    const t0 = performance.now();
    b = img?.relief && img.getContext ? bake(img) : false;
    if (b) {
      stats.baked++;
      stats.ms += performance.now() - t0;
    }
    baked.set(img, b);
  }
  return b;
}

function normalFor(map) {
  let t = normals.get(map);
  if (t !== undefined) return t;
  const b = bakedOf(map.image);
  t = b ? linked(map, b.n) : null;
  normals.set(map, t);
  return t;
}

// Cavidad y rugosidad (rojo y verde, así las leen aoMap y roughnessMap).
const orms = new WeakMap(); // textura de color → su textura de cavidad/rugosidad

function ormFor(map) {
  let t = orms.get(map);
  if (t !== undefined) return t;
  const b = bakedOf(map.image);
  t = b ? linked(map, b.orm, THREE.RGFormat) : null;
  if (t) t.userData.mean = b.mean;
  orms.set(map, t);
  return t;
}

// Parallax (Ultra y Épica): antes de leer el color se corre el uv siguiendo
// el rayo de la vista hasta chocar con la altura (alfa del normal map). El
// tangente sale de las derivadas (no hay atributo de tangentes) y la escala en
// metros de las del uv. Después de esto, todo lo que lee vMapUv/vNormalMapUv
// (el color, el normal map y lo de fx/Tiling) usa el uv corrido.
function patchPom(sh, depth) {
  sh.uniforms.uPomDepth = { value: depth };
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPomDepth;').replace(
    '#include <map_fragment>',
    `#if defined( USE_MAP ) && defined( USE_NORMALMAP ) && !defined( FLAT_SHADED )
  vec2 pomUv = vMapUv;
  vec2 pomUvN = vNormalMapUv;
  {
    float pk = 1.0 - smoothstep(${(POM_FAR * 0.6).toFixed(2)}, ${POM_FAR.toFixed(2)}, length(vViewPosition));
    vec3 q0 = dFdx(-vViewPosition);
    vec3 q1 = dFdy(-vViewPosition);
    vec2 s0 = dFdx(vNormalMapUv);
    vec2 s1 = dFdy(vNormalMapUv);
    vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 q1p = cross(q1, N);
    vec3 q0p = cross(N, q0);
    float D = dot(q0, q1p);
    vec3 V = normalize(vViewPosition);
    float vn = dot(V, N);
    if (pk > 0.0 && abs(D) > 1e-14 && vn > 0.05) {
      // gradientes del uv (uv por metro) y el corrimiento a la profundidad máxima
      vec3 gu = (q1p * s0.x + q0p * s1.x) / D;
      vec3 gv = (q1p * s0.y + q0p * s1.y) / D;
      vec3 lat = V - N * vn;
      vec2 duv = -vec2(dot(gu, lat), dot(gv, lat)) / max(vn, 0.2) * uPomDepth * pk;
      // más pasos de costado, menos de frente
      int steps = int(mix(16.0, 6.0, vn));
      float st = 1.0 / float(steps);
      float t = 0.0;
      float prev = 1.0 - textureGrad(normalMap, vNormalMapUv, s0, s1).a;
      for (int i = 0; i < 16; i++) {
        if (i >= steps || prev <= t) break;
        float nt = t + st;
        float d = 1.0 - textureGrad(normalMap, vNormalMapUv + duv * nt, s0, s1).a - nt;
        if (d <= 0.0) {
          // entre el paso anterior (arriba) y este (abajo)
          float a = prev - t;
          t += st * a / max(a - d, 1e-5);
          break;
        }
        prev = d + nt;
        t = nt;
      }
      // (ningún NaN llega al color: todo lo de arriba está acotado)
      vec2 off = duv * clamp(t, 0.0, 1.0);
      pomUv += off;
      pomUvN += off;
    }
  }
  #define vMapUv pomUv
  #define vNormalMapUv pomUvN
  #define vAoMapUv pomUvN
  #define vRoughnessMapUv pomUvN
#endif
#include <map_fragment>`,
  );
}

// Lo que se le cambió a cada material, para devolverlo en Baja. No va en
// userData: Material.copy lo pasa por JSON (con las texturas adentro).
const saved = new WeakMap();
const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
// calidad y texturas del mapa actual (las usan los onBeforeCompile)
let Q = 'perf';
let T = null;

// Recompila de verdad. Con needsUpdate three reusa el programa que ese material
// ya tenía para esa clave SIN pasar por onBeforeCompile, y se queda con los
// uniforms del último compilado (sin uPomDepth ni los de Tiling: toman los del
// último material dibujado con ese programa). dispose le suelta sus programas;
// si otro material usa el mismo, se reusa sin compilar.
function refresh(m) {
  m.dispose();
  m.needsUpdate = true;
}

function enhance(m) {
  if (!m?.isMaterial || saved.has(m) || m.flatShading || m.userData.noRelief || !KINDS.has(m.type)) return;
  const map = m.map;
  if (!map) return;
  const nt = !m.normalMap && map.image?.relief ? normalFor(map) : null;
  const tile = tilingFor(map, T);
  const depth = nt ? map.image.relief.depth || 0 : 0;
  const orm = nt && !m.aoMap ? ormFor(map) : null;
  const rt = orm && orm.userData.mean != null && m.isMeshStandardMaterial && !m.roughnessMap;
  // grano fino de cerca (fx/Detail, de 4d)
  const det = detailFor(map, T);
  if (!nt && !tile && !det) return;
  const s = { q: Q, nt: !!nt, ao: !!orm, rt, roughness: m.roughness, bumpMap: m.bumpMap, bumpScale: m.bumpScale, obc: m.onBeforeCompile, key: m.customProgramCacheKey };
  saved.set(m, s);
  if (orm) {
    m.aoMap = orm;
    m.aoMapIntensity = 1;
  }
  if (rt) {
    // la textura trae la rugosidad entera (three la multiplica por esto)
    m.roughnessMap = orm;
    m.roughness = 1;
    m.userData.reflRough = orm.userData.mean;
  }
  if (nt) {
    m.normalMap = nt;
    m.normalScale.set(1, 1);
    // el bump sacado del color ya no hace falta
    m.bumpMap = null;
  }
  if (tile || depth || det) {
    // el parallax, fx/Detail y fx/Tiling van dentro de este onBeforeCompile,
    // después del que ya tuviera (el parallax primero: corre el uv que usan los otros)
    const prev = s.obc;
    const base = s.key === PROTO_KEY ? () => prev.toString() : () => s.key.call(m);
    const bk = tile?.bomb ? 'b' : '';
    const pom = () => depth > 0 && (LEVEL[Q] ?? 0) >= 2 && !debug.noPom;
    m.onBeforeCompile = function (sh, r) {
      prev.call(this, sh, r);
      if (pom()) patchPom(sh, depth);
      if (det) patchDetail(sh, det, Q);
      if (tile) patchTiling(sh, Q, tile);
    };
    m.customProgramCacheKey = () => base() + (tile ? TILING_KEY(Q) + bk : '') + DETAIL_KEY(det, Q) + (pom() ? 'pom' : '');
  }
  refresh(m);
}

function restore(m) {
  const s = m?.isMaterial && saved.get(m);
  if (!s) return;
  if (s.nt) {
    m.normalMap = null;
    m.bumpMap = s.bumpMap;
    m.bumpScale = s.bumpScale;
  }
  if (s.ao) m.aoMap = null;
  if (s.rt) {
    m.roughnessMap = null;
    m.roughness = s.roughness;
    delete m.userData.reflRough;
  }
  m.onBeforeCompile = s.obc;
  m.customProgramCacheKey = s.key;
  saved.delete(m);
  refresh(m);
}

// Deja el material como pide la calidad actual.
function sync(m, on) {
  if (!on) return restore(m);
  const s = m?.isMaterial && saved.get(m);
  if (!s) return enhance(m);
  if (s.q !== Q) {
    s.q = Q;
    refresh(m);
  }
}

export default class Surfaces {
  constructor() {
    this.level = 0;
    this.scene = null;
    this.visit = (o) => {
      const mat = o.material;
      if (!mat || !(o.isMesh || o.isInstancedMesh)) return;
      if (Array.isArray(mat)) for (const m of mat) enhance(m);
      else enhance(mat);
    };
  }

  get on() {
    return this.level > 0;
  }

  // cada mapa tiene su escena: al volver a uno se lo pone al día
  setScene(scene, textures) {
    this.scene = scene;
    if (textures) T = textures;
    this.sync();
  }

  setQuality(q) {
    const lv = LEVEL[q] ?? 0;
    if (q === Q && lv === this.level) return;
    Q = q;
    this.level = lv;
    this.sync();
  }

  sync() {
    const on = this.on;
    this.scene?.traverse((o) => {
      const mat = o.material;
      if (!mat || !(o.isMesh || o.isInstancedMesh)) return;
      if (Array.isArray(mat)) for (const m of mat) sync(m, on);
      else sync(mat, on);
    });
  }
}
