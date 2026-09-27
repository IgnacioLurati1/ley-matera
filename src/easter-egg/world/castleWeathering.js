import * as THREE from 'three';
import { MAP_W, MAP_H } from '../config/map';
import { ceilAt } from './Levels';

// La piedra del castillo, gastada por siglos de invierno: el tono cambia de
// sillar en sillar y a lo grande (manchas más cálidas y más frías), bajan
// chorreados oscuros por las paredes, lo que mira para arriba junta nieve y
// las caras que dan al viento del sur se escarchan. Todo en coordenadas del
// mundo, así dos piedras iguales no se ven calcadas. La nieve y la escarcha
// solo afuera: una grilla dice, por celda, hasta dónde llega el techo (abajo
// de eso es adentro).

const U = {
  uIndoor: { value: null },
  uIndoorSize: { value: new THREE.Vector2(1, 1) },
};

// El techo de cada celda (o -1000 si es a cielo abierto). Las puertas y las
// ventanas toman el de la celda techada de al lado (el umbral de adentro no
// junta nieve). Se arma después de la grilla (buildCastle).
export function indoorGrid(w) {
  const W = MAP_W;
  const H = MAP_H;
  const data = new Float32Array(W * H * 4).fill(-1000);
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = w.idx(x, z);
      const t = w.grid[i];
      let c = -1000;
      if (t === 1) {
        const v = ceilAt(w, x, z);
        if (Number.isFinite(v)) c = v;
      } else if (t === 3 || t === 4) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!w.inside(x + dx, z + dz) || w.grid[w.idx(x + dx, z + dz)] !== 1) continue;
          const v = ceilAt(w, x + dx, z + dz);
          if (Number.isFinite(v)) c = Math.max(c, v);
        }
      }
      data[i * 4] = c;
    }
  }
  U.uIndoor.value?.dispose();
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  U.uIndoor.value = tex;
  U.uIndoorSize.value.set(W, H);
}

const NOISE = `
varying vec3 vWeatherW;
uniform sampler2D uIndoor;
uniform vec2 uIndoorSize;
float wHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float wNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(wHash(i), wHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(wHash(i + vec3(0.0, 1.0, 0.0)), wHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(wHash(i + vec3(0.0, 0.0, 1.0)), wHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(wHash(i + vec3(0.0, 1.0, 1.0)), wHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

// o: { tone, grime, snow, frost } (0..1, cuánto de cada cosa)
export function weathering(mat, o = {}) {
  const tone = (o.tone ?? 1).toFixed(3);
  const grime = (o.grime ?? 0.35).toFixed(3);
  const snow = (o.snow ?? 1).toFixed(3);
  const frost = (o.frost ?? 1).toFixed(3);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uIndoor = U.uIndoor;
    sh.uniforms.uIndoorSize = U.uIndoorSize;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWeatherW;').replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        vWeatherW = (modelMatrix * wp).xyz;
      }`,
    );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        vec3 P = vWeatherW;
        vec3 wN = inverseTransformDirection(normal, viewMatrix);
        // ¿adentro? (abajo del techo de la celda). Las paredes caen justo en el
        // borde entre dos celdas: se mira un poco hacia donde da la cara (si no,
        // cada pixel caía de un lado o del otro y quedaban rayas)
        vec3 gN = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
        vec2 cell = floor(P.xz + gN.xz * 0.06);
        float roofY = texture2D(uIndoor, (cell + 0.5) / uIndoorSize).r;
        float inside = (cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uIndoorSize.x && cell.y < uIndoorSize.y && P.y < roofY - 0.02) ? 1.0 : 0.0;
        // el tono: manchas grandes, sillares sueltos y un tinte cálido/frío
        float big = wNoise(P * 0.17);
        float mid = wNoise(P * 0.85 + 7.0);
        vec3 tint = mix(vec3(0.97, 0.985, 1.03), vec3(1.03, 1.0, 0.95), wNoise(P * 0.06 + 3.0));
        diffuseColor.rgb *= mix(vec3(1.0), (0.9 + 0.14 * big + 0.1 * (mid - 0.5)) * tint, ${tone});
        // los chorreados: vetas verticales oscuras en las caras de pared, por tramos
        float vert = 1.0 - smoothstep(0.3, 0.6, abs(wN.y));
        float streak = wNoise(vec3((P.x + P.z) * 5.5, P.y * 0.18, (P.x - P.z) * 5.5));
        float band = 0.35 + 0.65 * smoothstep(0.45, 0.8, wNoise(vec3(P.x * 0.5, P.y * 0.3, P.z * 0.5) + 11.0));
        diffuseColor.rgb *= 1.0 - vert * ${grime} * smoothstep(0.55, 0.9, streak) * band;
        // afuera: nieve en lo que mira para arriba (cornisas, repisas, escalones)
        float up = smoothstep(0.5, 0.85, wN.y);
        float dust = up * smoothstep(0.28, 0.62, wNoise(P * 2.3) * 0.55 + wNoise(P * 0.45 + 5.0) * 0.6) * (1.0 - inside) * ${snow};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 1.0), dust);
        roughnessFactor = mix(roughnessFactor, 0.8, dust);
        // y escarcha azulada en las caras que dan al viento (al sur y al oeste)
        float wind = smoothstep(0.2, 0.9, dot(wN, normalize(vec3(-0.45, 0.0, 1.0)))) * vert;
        float rime = wind * smoothstep(0.4, 0.85, wNoise(P * vec3(2.6, 1.2, 2.6) + 21.0)) * (1.0 - inside) * ${frost};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.86, 0.96), rime * 0.14);
      }`,
    );
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|weather${tone}${grime}${snow}${frost}`;
  mat.needsUpdate = true;
  return mat;
}

// Las lajas de arriba de las murallas (el adarve, la cumbre y los miradores):
// piedra con la nieve pisoteada encima, a manchones (no un manto liso), más
// junta cerca de las juntas y en los huecos. Mismas lajas que los salones.
export function pavedSnow(M, T, std) {
  const m = std(T.flagstone, { c: 0xc4c2c0, r: 0.8, bump: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWeatherW;').replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vWeatherW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}\nfloat vSnowPaveK = 0.0;`).replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      {
        vec3 P = vWeatherW;
        // lo oscuro de la textura (las juntas) junta más nieve
        float joint = 1.0 - smoothstep(0.25, 0.55, dot(diffuseColor.rgb, vec3(0.33)));
        float n = wNoise(P * vec3(0.35, 1.0, 0.35)) * 0.6 + wNoise(P * 1.8 + 9.0) * 0.28 + wNoise(P * 6.0 + 3.0) * 0.12;
        float k = smoothstep(0.47, 0.6, n + joint * 0.1);
        vec3 snowC = vec3(0.86, 0.9, 0.97) * (0.94 + 0.06 * wNoise(P * 11.0));
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.92, 0.95, 1.02), snowC, k);
        roughnessFactor = mix(roughnessFactor, 0.72, k);
        vSnowPaveK = k;
      }`,
    ).replace(
      '#include <normal_fragment_maps>',
      // la nieve tapa las juntas: donde hay nieve el relieve de las lajas se aplana
      `#include <normal_fragment_maps>
      normal = normalize(mix(normal, nonPerturbedNormal, vSnowPaveK * 0.85));`,
    );
  };
  m.customProgramCacheKey = () => 'pavedSnow2';
  M.snowPave = m;
  return m;
}
