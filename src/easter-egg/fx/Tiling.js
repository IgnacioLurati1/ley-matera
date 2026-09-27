import * as THREE from 'three';
import { rng } from '../core/noise';

// Que no se note la grilla de las texturas del mundo. Las procedurales se
// repiten cada 2 m y de lejos se ven las mismas manchas en fila (la tierra,
// el revoque, el óxido de la chapa). No tiene onBeforeCompile propio: lo llama
// fx/Surfaces.js desde el suyo con patchTiling(shader, q, tilingFor(map, T)).
//
// - Media: un sample de ruido en espacio mundo (una textura de 128² que
//   se repite cada 32 m, girada) mueve el brillo y el tinte del color ±10%.
// - Alta, Ultra y Épica: además, en las texturas que lo aguantan, el mapa se lee dos
//   veces corrido distinto según la zona y se funde (la técnica 3 de Quilez de
//   "texture repetition"). Lo que tiene dibujo se corre de a una pieza entera
//   (de a un ladrillo, de a una baldosa) y las paredes solo a lo largo, para
//   que el zócalo y la mugre de abajo queden en su altura.
//
// Deja en el fragment `#define TILE_ON` y `tileSample(sampler, uv)`, que lee
// cualquier otro mapa con el mismo corrimiento (el normal map ya lo usa).

// qué hace cada calidad: 0 nada, 1 ruido de brillo, 2 además los dos samples
// (Alta también lleva los dos samples: medido a 1440p en Épica no se nota en
// los fps y el ruido de brillo solo casi no rompe la grilla)
const LEVEL = { perf: 0, low: 0, medium: 1, high: 2, ultra: 2, epic: 2 };
// para comparar con y sin (pruebas): con off no se toca nada y cambia la clave
export const TILING = { off: false };

// por textura: amp = [brillo grande, brillo chico, tinte], bomb = [corre en u,
// corre en v, de a cuánto en u, de a cuánto en v] (piezas por vuelta; 0 = libre)
const FLOOR = { amp: [0.14, 0.06, 0.03], bomb: [1, 1, 0, 0] };
const PLASTER = { amp: [0.08, 0.05, 0.012], bomb: [1, 0, 0, 0] };
const TILES = (n) => ({ amp: [0.06, 0.03, 0.015], bomb: [1, 1, n, n] });
const PLAIN = { amp: [0.08, 0.04, 0.02], bomb: null };
const KINDS = {
  dirt: FLOOR,
  dirtDark: FLOOR,
  ground: FLOOR,
  grass: FLOOR,
  rock: FLOOR,
  // las juntas del contrapiso van cada media vuelta
  concrete: { amp: [0.12, 0.05, 0.02], bomb: [1, 1, 2, 2] },
  plasterGreen: PLASTER,
  plasterBlue: PLASTER,
  plasterWhite: PLASTER,
  plasterOffice: PLASTER,
  concreteWall: PLASTER,
  adobe: PLASTER,
  whitewash: PLASTER,
  cellWall: PLASTER,
  // de a un ladrillo (8 por vuelta, trabados: corrido entero las juntas coinciden)
  brick: { amp: [0.08, 0.05, 0.02], bomb: [1, 0, 8, 0] },
  brickSoot: { amp: [0.08, 0.05, 0.02], bomb: [1, 0, 8, 0] },
  // de a una onda de la chapa
  corrugated: { amp: [0.08, 0.04, 0.02], bomb: [1, 0, 16, 0] },
  // de a una tabla (las que no entran justas en la vuelta no se corren)
  planks: { amp: [0.08, 0.04, 0.02], bomb: [1, 0, 8, 0] },
  fence: { amp: [0.08, 0.04, 0.02], bomb: [1, 0, 8, 0] },
  planksDark: PLAIN,
  parquet: PLAIN,
  barn: PLAIN,
  calcareo: TILES(10),
  terracotta: TILES(8),
  // el damero de a dos baldosas, para que no se cambie blanco por negro
  damero: TILES(4),
  azulejo: TILES(16),
  // los bloques son de largo desparejo: correrlos deja juntas fantasma
  stoneWall: PLAIN,
  metal: { amp: [0.06, 0.03, 0.01], bomb: null },
  metalGreen: { amp: [0.06, 0.03, 0.01], bomb: null },
};

// textura → su nombre en T (se rearma si aparecen texturas nuevas: la granja y
// el penal suman las suyas después)
let names = new WeakMap();
let seen = 0;
function nameOf(map, T) {
  let n = names.get(map);
  if (n === undefined && T) {
    const keys = Object.keys(T);
    if (keys.length !== seen) {
      seen = keys.length;
      names = new WeakMap();
      for (const k of keys) if (T[k]?.isTexture) names.set(T[k], k);
    }
    n = names.get(map);
  }
  return n;
}

// Las opciones de una textura del mundo, o null si no se toca (el castillo
// tiene lo suyo en castleWeathering; los carteles y las caras tampoco van).
export function tilingFor(map, T) {
  if (!map) return null;
  const k = nameOf(map, T);
  return (k && KINDS[k]) || null;
}

// ---------------- el ruido ----------------
// Ruido de valor que se repite justo en la vuelta: `cells` celdas por lado.
function valueNoise(S, cells, r) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * cells;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cells) * cells;
    const y1 = ((iy + 1) % cells) * cells;
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cells;
      const ix = Math.floor(fx);
      let tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells;
      const x1 = (ix + 1) % cells;
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx;
      const b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx;
      out[y * S + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function fbm(S, cells, octaves, r) {
  const out = new Float32Array(S * S);
  let amp = 1;
  for (let o = 0; o < octaves; o++, cells *= 2, amp *= 0.5) {
    const n = valueNoise(S, cells, r);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
  }
  return out;
}

// estirado a 0..255 para que las amplitudes digan lo que dicen
function stretch(a, data, ch) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = 255 / (hi - lo || 1);
  for (let i = 0; i < a.length; i++) data[i * 4 + ch] = Math.round((a[i] - lo) * k);
}

let noiseTex = null;
// r: manchas grandes (~8 m), g: tinte, b: qué corrimiento va en cada zona
// (~4 m), a: manchas chicas (~2 m)
function noise() {
  if (noiseTex) return noiseTex;
  const S = 128;
  const r = rng(907);
  const data = new Uint8Array(S * S * 4);
  stretch(fbm(S, 4, 3, r), data, 0);
  stretch(fbm(S, 3, 2, r), data, 1);
  stretch(valueNoise(S, 8, r), data, 2);
  stretch(fbm(S, 16, 2, r), data, 3);
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}

const NOISE_U = { value: null };

// ---------------- el parche ----------------
export function TILING_KEY(q) {
  if (TILING.off) return 'tileoff';
  const lv = LEVEL[q] ?? 0;
  return lv ? `tile${lv}` : '';
}

// o: lo que devuelve tilingFor (null: no se toca).
export function patchTiling(shader, q, o) {
  const lv = LEVEL[q] ?? 0;
  if (!lv || !o || TILING.off) return;
  NOISE_U.value ||= noise();
  const bomb = lv > 1 && o.bomb ? o.bomb : [0, 0, 0, 0];
  shader.uniforms.uTileNoise = NOISE_U;
  shader.uniforms.uTileAmp = { value: new THREE.Vector3(...o.amp) };
  shader.uniforms.uTileBomb = { value: new THREE.Vector4(...bomb) };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTileW;').replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    {
      vec4 tw = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
      tw = batchingMatrix * tw;
      #endif
      #ifdef USE_INSTANCING
      tw = instanceMatrix * tw;
      #endif
      vTileW = (modelMatrix * tw).xyz;
    }`,
  );
  const two = lv > 1;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
#define TILE_ON
${two ? '#define TILE_BOMB' : ''}
uniform sampler2D uTileNoise;
uniform vec3 uTileAmp;
uniform vec4 uTileBomb;
varying vec3 vTileW;
vec4 tileN;
float tileMix;
vec2 tileOa;
vec2 tileOb;
bool tileTwo;
vec4 tileB;
// el corrimiento de la zona i: en los ejes que se corre y de a piezas enteras
vec2 tileOff(float i) {
  vec2 o = sin(vec2(3.0, 7.0) * i) * tileB.xy;
  vec2 s = tileB.zw;
  return mix(o, floor(o * s + 0.5) / max(s, vec2(1.0)), step(vec2(0.5), s));
}
// cualquier mapa con el mismo uv que el color, con el mismo corrimiento
vec4 tileSample(sampler2D s, vec2 uv) {
  vec4 c;
  #ifdef TILE_BOMB
  // (las derivadas afuera del if: tileTwo cambia de un píxel a otro)
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  if (tileTwo) {
    c = mix(textureGrad(s, uv + tileOa, dx, dy), textureGrad(s, uv + tileOb, dx, dy), tileMix);
  } else
  #endif
  c = texture2D(s, uv);
  return c;
}`,
    )
    .replace(
      '#include <map_fragment>',
      `{
        // (una sola proyección sirve para pisos y paredes: en la pared se suma la altura)
        vec2 tq = vTileW.xz + vTileW.y * vec2(0.61, -0.37);
        tq = mat2(0.8776, 0.4794, -0.4794, 0.8776) * tq;
        tileN = texture2D(uTileNoise, tq * (1.0 / 32.0));
        tileTwo = false;
        tileMix = 0.0;
        tileOa = vec2(0.0);
        tileOb = vec2(0.0);
      }
      #ifdef USE_MAP
      {
        vec4 sampledDiffuseColor;
        #ifdef TILE_BOMB
        tileB = uTileBomb;
        vec2 dx = dFdx(vMapUv);
        vec2 dy = dFdy(vMapUv);
        // hay paredes con el uv girado (u para arriba): lo que se corre solo a
        // lo largo pasa al otro eje. Qué eje sube con la altura sale de las
        // derivadas; en pisos y techos (la altura no cambia) queda como está.
        vec3 wx = dFdx(vTileW);
        vec3 wy = dFdy(vTileW);
        vec3 wn = cross(wx, wy);
        if (tileB.x != tileB.y && abs(wn.y) < 0.7 * length(wn)) {
          float hu = abs(wx.y * dy.y - wy.y * dx.y);
          float hv = abs(wy.y * dx.x - wx.y * dy.x);
          // (lo que se corre de a piezas no se sabe de a cuánto va en el otro eje)
          if (hu > hv) tileB = tileB.z + tileB.w > 0.0 ? vec4(0.0) : tileB.yxwz;
        }
        tileTwo = tileB.x + tileB.y > 0.0;
        if (tileTwo) {
          float k = tileN.b * 6.0;
          float ia = floor(k);
          float f = k - ia;
          tileOa = tileOff(ia);
          tileOb = tileOff(ia + 1.0);
          vec4 ca = textureGrad(map, vMapUv + tileOa, dx, dy);
          vec4 cb = textureGrad(map, vMapUv + tileOb, dx, dy);
          // el cambio sigue el dibujo (entra primero por lo oscuro)
          tileMix = smoothstep(0.25, 0.75, f - 0.1 * dot(ca.rgb - cb.rgb, vec3(1.0)));
          sampledDiffuseColor = mix(ca, cb, tileMix);
        } else
        #endif
        sampledDiffuseColor = texture2D(map, vMapUv);
        #ifdef DECODE_VIDEO_TEXTURE
        sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
        #endif
        diffuseColor *= sampledDiffuseColor;
      }
      #endif`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float tb = (tileN.r - 0.5) * 2.0 * uTileAmp.x + (tileN.a - 0.5) * 2.0 * uTileAmp.y;
        vec3 tint = mix(vec3(1.0 + uTileAmp.z, 1.0, 1.0 - uTileAmp.z), vec3(1.0 - uTileAmp.z, 1.0, 1.0 + uTileAmp.z), tileN.g);
        diffuseColor.rgb *= (1.0 + tb) * tint;
      }`,
    );
  // el normal map, la cavidad y la rugosidad con el mismo corrimiento que el
  // color (si nadie armó ya su propia lectura)
  if (two && o.bomb) {
    for (const [chunk, read] of [
      ['normal_fragment_maps', 'normalMap, vNormalMapUv'],
      ['aomap_fragment', 'aoMap, vAoMapUv'],
      ['roughnessmap_fragment', 'roughnessMap, vRoughnessMapUv'],
    ]) {
      const inc = `#include <${chunk}>`;
      if (shader.fragmentShader.includes(inc)) shader.fragmentShader = shader.fragmentShader.replace(inc, THREE.ShaderChunk[chunk].replaceAll(`texture2D( ${read} )`, `tileSample( ${read} )`));
    }
  }
}
