import * as THREE from 'three';
import { rng } from '../core/noise';

// Detalle de cerca. Las texturas del mundo tienen 512 px cada 2 a 3,6 m y de
// cerca se ven borrosas. Encima del color se lee una textura chica de grano
// (256², armada acá) repetida 3 a 6 veces más fino, distinta según el
// material: el grano del revoque, los poros del ladrillo, la fibra de la
// madera, los cristales de la piedra, la gravilla de la tierra, las hojitas
// del pasto, los rayones del metal y la piel de naranja del esmalte. Mueve el
// color unos puntos, inclina la normal y, en lo que brilla, la rugosidad. Se
// apaga de a poco entre 2 y 5 m: de lejos no suma nada (ni parpadea).
//
// No tiene onBeforeCompile propio: lo llama fx/Surfaces desde el suyo, después
// del parallax (así usa el uv corrido) y antes de fx/Tiling, con
// patchDetail(shader, detailFor(map, T), q). Desde Media; en Baja y
// Rendimiento no se toca nada.

// qué calidades lo llevan
const LEVEL = { perf: 0, low: 0, medium: 1, high: 1, ultra: 1, epic: 1 };
// de dónde a dónde se apaga (metros)
const NEAR = 2;
const FAR = 5;
// para comparar con y sin (pruebas): con off no se toca nada y cambia la clave;
// gain multiplica color, normal y rugosidad en vivo (sin recompilar)
export const DETAIL = { off: false, gain: new THREE.Vector3(1, 1, 1) };
const GAIN = { value: DETAIL.gain };

// ---------------- las texturas de grano ----------------
// Cada una: rojo y verde, la pendiente (la normal ya inclinada); azul, el
// color; alfa, la rugosidad. 0,5 es "nada": el promedio de cada canal da justo
// eso, así los mipmaps (de lejos) no cambian nada.
const S = 256;

// ruido de valor que se repite justo en la vuelta (cx por cy celdas)
function vnoise(cx, cy, r) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * cy;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cy) * cx;
    const y1 = ((iy + 1) % cy) * cx;
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cx;
      const ix = Math.floor(fx);
      let tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cx;
      const x1 = (ix + 1) % cx;
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx;
      const b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx;
      out[y * S + x] = a + (b - a) * ty - 0.5;
    }
  }
  return out;
}

function fbm(cx, cy, oct, r, gain = 0.5) {
  const out = new Float32Array(S * S);
  let amp = 1;
  for (let o = 0; o < oct && cx <= S && cy <= S; o++, cx *= 2, cy *= 2, amp *= gain) {
    const n = vnoise(cx, cy, r);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
  }
  return out;
}

// una gota redonda en (px, py), dando la vuelta en los bordes. sharp: 0,5 es
// una cúpula (piedrita), 2 una campana (grano)
function dab(a, px, py, rad, v, sharp = 2) {
  const R = Math.ceil(rad);
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  for (let y = cy - R; y <= cy + R + 1; y++) {
    for (let x = cx - R; x <= cx + R + 1; x++) {
      const d = ((x - px) * (x - px) + (y - py) * (y - py)) / (rad * rad);
      if (d >= 1) continue;
      a[(((y % S) + S) % S) * S + (((x % S) + S) % S)] += v * Math.pow(1 - d, sharp);
    }
  }
}

// un trazo recto de ancho w: se queda con lo más hondo (los rayones que se
// cruzan no se suman)
function stroke(a, px, py, ang, len, w, v) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const R = Math.ceil(w + 1);
  for (let t = 0; t <= len; t += 0.5) {
    const qx = px + dx * t;
    const qy = py + dy * t;
    // las puntas se afinan
    const k = Math.min(1, t / 3, (len - t) / 3);
    for (let y = Math.floor(qy) - R; y <= Math.floor(qy) + R + 1; y++) {
      for (let x = Math.floor(qx) - R; x <= Math.floor(qx) + R + 1; x++) {
        const d = Math.hypot(x - qx, y - qy) / w;
        if (d >= 1) continue;
        const i = (((y % S) + S) % S) * S + (((x % S) + S) % S);
        const u = v * (1 - d * d) * k;
        if (Math.abs(u) > Math.abs(a[i])) a[i] = u;
      }
    }
  }
}

const add = (a, b, k) => {
  for (let i = 0; i < a.length; i++) a[i] += b[i] * k;
};

// Los granos. Cada uno devuelve la altura (h), el color (c) y la rugosidad (g)
// sin escala: después se normalizan.
const GRAINS = {
  // revoque: arena fina de la llana, algunos granitos sueltos
  grain(r) {
    const h = fbm(32, 32, 4, r, 0.55);
    const c = new Float32Array(S * S);
    for (let i = 0; i < 3200; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 0.7 + r() * 1.2;
      dab(h, x, y, rad, r() < 0.7 ? 0.35 : -0.3);
      dab(c, x, y, rad, (r() - 0.45) * 0.8);
    }
    add(c, h, 0.6);
    return { h, c, g: h };
  },
  // ladrillo, contrapiso y terracota: poros y alguna burbuja más grande
  pores(r) {
    const h = fbm(16, 16, 4, r, 0.5);
    const c = fbm(8, 8, 3, r, 0.5);
    add(c, h, 0.4);
    add(h, vnoise(128, 128, r), 0.12);
    const g = new Float32Array(S * S);
    for (let i = 0; i < 1500; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = i < 50 ? 2.5 + r() * 1.8 : 0.6 + r() * 1.6;
      dab(h, x, y, rad, -0.9, 1);
      dab(c, x, y, rad * 1.2, -0.7, 1);
      dab(g, x, y, rad, 0.8, 1);
    }
    return { h, c, g };
  },
  // madera: la fibra a lo largo (la veta de las tablas va en v) y los poros,
  // rayitas cortas en el mismo sentido
  wood(r) {
    const h = fbm(40, 3, 3, r, 0.6);
    add(h, vnoise(160, 10, r), 0.35);
    const c = new Float32Array(h);
    const g = new Float32Array(S * S);
    for (let i = 0; i < 520; i++) {
      const x = r() * S;
      const y = r() * S;
      const len = 4 + r() * 12;
      stroke(g, x, y, Math.PI / 2 + (r() - 0.5) * 0.06, len, 0.6 + r() * 0.5, 1);
    }
    add(h, g, -0.5);
    add(c, g, -0.8);
    return { h, c, g };
  },
  // piedra: bultos del cincel, aristas y los cristales (mica que brilla,
  // hornblenda oscura, feldespato claro)
  stone(r) {
    const h = fbm(8, 8, 5, r, 0.55);
    const ridge = vnoise(24, 24, r);
    for (let i = 0; i < ridge.length; i++) h[i] += (0.5 - Math.abs(ridge[i]) * 2) * 0.25;
    const c = new Float32Array(S * S);
    const g = new Float32Array(S * S);
    for (let i = 0; i < 2600; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 0.6 + r() * 1.3;
      const k = r();
      const tone = k < 0.25 ? 0.9 : k < 0.65 ? -0.9 : 0.35;
      dab(c, x, y, rad, tone, 1);
      dab(h, x, y, rad, 0.08, 1);
      if (k < 0.25) dab(g, x, y, rad, -1, 1);
    }
    add(c, h, 0.3);
    return { h, c, g };
  },
  // tierra: gravilla (piedritas redondas, cada una de su tono) y arenilla
  soil(r) {
    const h = fbm(64, 64, 2, r, 0.5);
    for (let i = 0; i < h.length; i++) h[i] *= 0.3;
    const c = fbm(16, 16, 3, r, 0.5);
    for (let i = 0; i < c.length; i++) c[i] *= 0.4;
    const n = 14;
    const cell = S / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (r() > 0.72) continue;
        const x = (i + 0.2 + r() * 0.6) * cell;
        const y = (j + 0.2 + r() * 0.6) * cell;
        const rad = 2.5 + r() * 4.5;
        dab(h, x, y, rad, 0.6 + r() * 0.6, 0.5);
        dab(c, x, y, rad * 0.9, (r() - 0.5) * 1.3, 0.3);
      }
    }
    for (let i = 0; i < 2600; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 0.6 + r() * 0.8;
      dab(h, x, y, rad, 0.25);
      dab(c, x, y, rad, (r() - 0.5) * 0.8);
    }
    return { h, c, g: h };
  },
  // pasto: hojitas cortas, más para arriba que de costado (como el dibujo)
  blades(r) {
    const h = fbm(32, 32, 2, r, 0.5);
    for (let i = 0; i < h.length; i++) h[i] *= 0.3;
    const c = new Float32Array(S * S);
    const b = new Float32Array(S * S);
    for (let i = 0; i < 1900; i++) {
      const x = r() * S;
      const y = r() * S;
      const ang = -Math.PI / 2 + (r() - 0.5) * 1.3;
      const len = 3 + r() * 8;
      stroke(b, x, y, ang, len, 0.6 + r() * 0.4, 0.6 + r() * 0.4);
      stroke(c, x, y, ang, len, 0.7, (r() - 0.4) * 1.2);
    }
    add(h, b, 1);
    return { h, c, g: h };
  },
  // metal: picado fino, puntitos de óxido y rayones (casi todos para el
  // mismo lado, como los deja el uso); lo rayado brilla más
  scratch(r) {
    const h = fbm(32, 32, 3, r, 0.5);
    for (let i = 0; i < h.length; i++) h[i] *= 0.15;
    const c = new Float32Array(S * S);
    const g = new Float32Array(S * S);
    for (let i = 0; i < 320; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 0.6 + r() * 1.1;
      dab(h, x, y, rad, -0.4, 1);
      dab(c, x, y, rad * 1.3, -0.6, 1);
      dab(g, x, y, rad * 1.3, 0.5, 1);
    }
    const s = new Float32Array(S * S);
    const a0 = r() * Math.PI;
    for (let i = 0; i < 230; i++) {
      const ang = r() < 0.7 ? a0 + (r() - 0.5) * 0.3 : r() * Math.PI;
      stroke(s, r() * S, r() * S, ang, 10 + r() * 80, 0.5 + r() * 0.4, 0.3 + r() * 0.7);
    }
    add(h, s, -1);
    add(c, s, 0.6);
    add(g, s, -1);
    return { h, c, g };
  },
  // esmalte y hielo: la piel de naranja apenas ondulada y algún poro
  glaze(r) {
    const h = fbm(6, 6, 3, r, 0.5);
    const c = new Float32Array(S * S);
    for (let i = 0; i < 160; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 0.5 + r() * 0.8;
      dab(h, x, y, rad, -0.6, 1);
      dab(c, x, y, rad, -0.5, 1);
    }
    return { h, c, g: c };
  },
};

// a 0..255 alrededor de 0,5: el promedio va a 0,5 y ±2,5 desvíos llenan el rango
function norm(a) {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let q = 0;
  for (const v of a) q += (v - m) * (v - m);
  const k = 1 / (Math.sqrt(q / a.length) * 2.5 || 1);
  return (i) => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * (a[i] - m) * k)));
}

const textures = {};
function grainTex(name) {
  if (textures[name]) return textures[name];
  const r = rng(1201 + Object.keys(GRAINS).indexOf(name) * 31);
  const { h, c, g } = GRAINS[name](r);
  // la pendiente (con la vuelta): la normal se inclina para el lado que baja
  const sx = new Float32Array(S * S);
  const sy = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      sx[i] = h[y * S + ((x + S - 1) % S)] - h[y * S + ((x + 1) % S)];
      sy[i] = h[((y + S - 1) % S) * S + x] - h[((y + 1) % S) * S + x];
    }
  }
  // las dos pendientes con la misma escala (si no, la veta se inclina de más)
  const both = new Float32Array(S * S * 2);
  both.set(sx);
  both.set(sy, S * S);
  const ns = norm(both);
  const nc = norm(c);
  const ng = norm(g);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = ns(i);
    data[i * 4 + 1] = ns(i + S * S);
    data[i * 4 + 2] = nc(i);
    data[i * 4 + 3] = ng(i);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  textures[name] = t;
  return t;
}

// ---------------- qué lleva cada textura ----------------
// grano, cuánto color, cuánta normal, cuánta rugosidad, veces más fino que el color
const P = (grain, col, nrm, rough, freq) => ({ grain, col, nrm, rough, freq });
const PLASTER = P('grain', 0.12, 0.9, 0.08, 5);
const BRICK = P('pores', 0.14, 1.0, 0.1, 5);
const WOOD = P('wood', 0.12, 0.7, 0.1, 4);
const STONE = P('stone', 0.14, 0.9, 0.1, 4);
const SOIL = P('soil', 0.16, 1.1, 0.06, 4);
const METAL = P('scratch', 0.1, 0.7, 0.35, 5);
const GLAZE = P('glaze', 0.02, 0.15, 0.06, 3);
const KINDS = {
  plasterGreen: PLASTER,
  plasterBlue: PLASTER,
  plasterWhite: PLASTER,
  plasterOffice: PLASTER,
  concreteWall: PLASTER,
  adobe: PLASTER,
  whitewash: PLASTER,
  cellWall: PLASTER,
  castlePlaster: PLASTER,
  brick: BRICK,
  brickSoot: BRICK,
  concrete: P('pores', 0.11, 0.8, 0.06, 5),
  terracotta: P('pores', 0.1, 0.8, 0.08, 5),
  calcareo: P('grain', 0.06, 0.4, 0.06, 6),
  planks: WOOD,
  planksDark: WOOD,
  parquet: WOOD,
  barn: WOOD,
  fence: WOOD,
  stoneWall: STONE,
  rock: STONE,
  castleStone: STONE,
  castleStoneFrost: STONE,
  caveRock: STONE,
  flagstone: STONE,
  slate: P('stone', 0.1, 0.7, 0.08, 6),
  dirt: SOIL,
  dirtDark: SOIL,
  ground: SOIL,
  grass: P('blades', 0.14, 1.0, 0.05, 4),
  snow: P('grain', 0.05, 0.6, 0.08, 4),
  corrugated: METAL,
  metal: METAL,
  metalGreen: METAL,
  damero: GLAZE,
  azulejo: GLAZE,
  ice: GLAZE,
};

// imagen → su nombre en T (por la imagen: los clones de una textura con otro
// repeat también cuentan). Se rearma si aparecen texturas nuevas.
let names = new WeakMap();
let seen = 0;
function nameOf(map, T) {
  const img = map.image;
  if (!img || typeof img !== 'object') return undefined;
  let n = names.get(img);
  if (n === undefined && T) {
    const keys = Object.keys(T);
    if (keys.length !== seen) {
      seen = keys.length;
      names = new WeakMap();
      for (const k of keys) if (T[k]?.isTexture && T[k].image && typeof T[k].image === 'object') names.set(T[k].image, k);
    }
    n = names.get(img);
  }
  return n;
}

// Lo que lleva una textura del mundo, o null si nada (carteles, caras, ropa).
export function detailFor(map, T) {
  if (!map) return null;
  const k = nameOf(map, T);
  return (k && KINDS[k]) || null;
}

// ---------------- el parche ----------------
// El código es el mismo para todos los granos (cambian los uniforms): los
// materiales comparten programa.
export function DETAIL_KEY(kind, q) {
  if (!kind) return '';
  if (DETAIL.off) return 'detoff';
  return LEVEL[q] ? 'det1' : '';
}

export function patchDetail(sh, kind, q) {
  if (!kind || DETAIL.off || !LEVEL[q]) return;
  sh.uniforms.uDetTex = { value: grainTex(kind.grain) };
  sh.uniforms.uDet = { value: new THREE.Vector4(kind.col, kind.nrm, kind.rough, kind.freq) };
  sh.uniforms.uDetGain = GAIN;
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
#define DET_ON
uniform sampler2D uDetTex;
uniform vec4 uDet;
uniform vec3 uDetGain;
vec4 detS = vec4(0.5);
float detK = 0.0;
vec2 detD0 = vec2(0.0);
vec2 detD1 = vec2(0.0);`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      #ifdef USE_MAP
      {
        // las derivadas, del uv sin el corrimiento del parallax (que salta de
        // paso en paso); el sample, en el uv corrido
        #ifdef vMapUv
        #undef vMapUv
        detD0 = dFdx(vMapUv) * uDet.w;
        detD1 = dFdy(vMapUv) * uDet.w;
        #define vMapUv pomUv
        #else
        detD0 = dFdx(vMapUv) * uDet.w;
        detD1 = dFdy(vMapUv) * uDet.w;
        #endif
        detK = 1.0 - smoothstep(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, length(vViewPosition));
        if (detK > 0.0) detS = textureGrad(uDetTex, vMapUv * uDet.w, detD0, detD1);
        diffuseColor.rgb *= 1.0 + (detS.b - 0.5) * 2.0 * uDet.x * uDetGain.x * detK;
      }
      #endif`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor * (1.0 + (detS.a - 0.5) * 2.0 * uDet.z * uDetGain.z * detK), 0.03, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // el marco tangente sale de las derivadas (como el normal map de three)
        vec3 q0 = dFdx(-vViewPosition);
        vec3 q1 = dFdy(-vViewPosition);
        vec3 q1p = cross(q1, nonPerturbedNormal);
        vec3 q0p = cross(nonPerturbedNormal, q0);
        vec3 dT = q1p * detD0.x + q0p * detD1.x;
        vec3 dB = q1p * detD0.y + q0p * detD1.y;
        float dd = max(dot(dT, dT), dot(dB, dB));
        vec2 s = (detS.rg - 0.5) * 2.0 * uDet.y * uDetGain.y * detK;
        if (dd > 0.0) normal = normalize(normal + (dT * s.x + dB * s.y) * inversesqrt(dd));
      }`,
    );
}
