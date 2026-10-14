// La terminación del campo de San Lorenzo (sesión 1f, 2026-10-07). El usuario:
// "la calidad del piso es nefasta y la del convento también, texturas planas y
// feas". Todo el campo es un color por vértice con caras planas. Sin texturas
// nuevas (nada que bajar ni que compilar aparte), el detalle sale en el
// sombreador, en espacio del mundo, según el color de cada pieza:
//  · el suelo: caras suaves (no facetas), el pasto de la granja leído a dos
//    escalas y mezclado con ruido (sin la grilla que se repite), manchones de
//    tierra pisada y de pasto más verde;
//  · el revoque blanco (cal): grano del revoque, manchas de humedad que suben
//    del piso, chorreado bajo la cornisa y algún ladrillo que asoma;
//  · las tejas: hileras de tejas musleras en la pendiente, con su sombra;
//  · el zócalo y la piedra: sillares con sus juntas;
//  · la madera: la veta.
// globalThis.__mduOldSlLook: como antes.

const NOISE = /* glsl */ `
float slH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float slH2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float slN(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(slH2(i), slH2(i + vec2(1.0, 0.0)), f.x), mix(slH2(i + vec2(0.0, 1.0)), slH2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float slF(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * slN(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return s;
}
`;

const on = () => globalThis.__mduOldSlLook !== true;

// (2026-10-13, el usuario: "el piso [de la pelea final de eclipse y del lugar
// de sus cinemáticas] es bastante básico, plano y sin ningún detalle, contrasta
// mucho con el resto del juego"). El piso 2, todo en el sombreador (ni mallas
// ni texturas nuevas: nada que atraviese a nadie, ni un dibujo más): relieve
// (la normal, como el bump de los pisos de los otros mapas), rugosidad (el
// barro brilla, el pasto no), matas y huecos en el pasto, paja seca peinada,
// florcitas al ras, manchones de tierra pisada con granza, piedritas y grietas
// de tierra seca, ceniza en lo quemado y vetas en la barranca. Lo usan el campo
// de San Lorenzo y los pisos del estero y del santuario del final
// (ui/eclipseCineSets). globalThis.__mduEclPisoViejo = true: como antes.
const piso2On = () => globalThis.__mduEclPisoViejo !== true;
const PISO2_FN = /* glsl */ `
float slHi(vec2 c) {
  uvec2 q = uvec2(ivec2(c) + ivec2(65536));
  uint h = (q.x * 1664525u + 1013904223u) ^ (q.y * 22695477u + 1u);
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return float(h) * (1.0 / 4294967296.0);
}
float slNi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(slHi(i), slHi(i + vec2(1.0, 0.0)), f.x), mix(slHi(i + vec2(0.0, 1.0)), slHi(i + vec2(1.0, 1.0)), f.x), f.y);
}
// las grietas: el borde entre celdas (F2 - F1)
float slVor(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 b = vec2(float(x), float(y));
      vec2 o = vec2(slHi(i + b), slHi(i + b + vec2(19.0, 7.0)));
      float d = length(b + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
// piedritas: en celdas de sz metros, una con probabilidad pr (alto 1 en el
// medio, negativo alrededor: la sombrita del borde; y su tono)
vec2 slPeb(vec2 p, float sz, float pr) {
  vec2 q = p / sz;
  vec2 i = floor(q);
  float best = -2.0;
  float tone = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cc = i + vec2(float(x), float(y));
      float h = slHi(cc);
      if (h > pr) continue;
      vec2 o = vec2(slHi(cc + vec2(17.0, 3.0)), slHi(cc + vec2(41.0, 9.0)));
      float r = 0.2 + 0.2 * slHi(cc + vec2(7.0, 1.0));
      float a = slHi(cc + vec2(2.0, 29.0)) * 6.2832;
      vec2 d = q - cc - o;
      d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
      d.y *= 1.5;
      float k = 1.0 - dot(d, d) / (r * r);
      if (k > best) { best = k; tone = slHi(cc + vec2(3.0, 13.0)); }
    }
  }
  return vec2(best, tone);
}
`;
// después de los colores por vértice: el color, el relieve (slHt, en metros) y la rugosidad (slRg)
const PISO2_COLOR = /* glsl */ `
float slHt = 0.0;
float slRg = 0.0;
{
  vec2 p = vSlW.xz;
  float dist = length(vViewPosition);
  // (lo chico solo de cerca: de lejos titila)
  float near = 1.0 - smoothstep(14.0, 38.0, dist);
  float close = 1.0 - smoothstep(5.0, 14.0, dist);
  vec3 c = diffuseColor.rgb;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    vec3 vc = vColor.rgb;
  #else
    vec3 vc = c;
  #endif
  #ifdef USE_MAP
    float tl = dot(tx.rgb, vec3(0.3, 0.59, 0.11));
  #else
    float tl = 0.4;
  #endif
  vec3 nW = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
  float slope = 1.0 - nW.y;
  float vl = dot(vc, vec3(0.3, 0.59, 0.11));
  // pasto (1) o tierra (0), por el color de cada lugar
  float grass = smoothstep(0.72, 1.15, vc.g / max(vc.r, 1e-3));
  // la tierra pisada: manchones pelados en el pasto
  // (sin mirar si es pasto: el color por vértice va por triángulo y el borde se veía en dientes)
  float bare = smoothstep(0.66, 0.74, slF(p * 0.05 + 9.7));
  c = mix(c, vec3(0.085, 0.052, 0.03) * (0.75 + 0.6 * tl), bare * 0.7);
  float dirt = max(1.0 - grass, bare);
  float lawn = grass * (1.0 - bare);
  // el pasto: matas y huecos (los huecos, más oscuros)
  float tuft = slNi(p * 4.3) * 0.65 + slNi(p * 11.0 + 3.0) * 0.35;
  float hg = (tuft - 0.5) * 0.035 + tl * 0.015;
  c *= mix(1.0, 0.68 + 0.64 * tuft, lawn * near);
  // manchas de pasto más seco, de un metro
  c *= mix(vec3(1.0), vec3(1.3, 1.18, 0.78), smoothstep(0.55, 0.85, slNi(p * 0.9 + 4.0)) * 0.6 * lawn);
  // la paja seca, acostada (peinada para un lado)
  vec2 pr = mat2(0.94, -0.34, 0.34, 0.94) * p;
  float straw = smoothstep(0.7, 0.9, slNi(vec2(pr.x * 3.0, pr.y * 13.0))) * smoothstep(0.45, 0.7, slF(p * 0.11 + 1.3));
  c = mix(c, vec3(0.3, 0.24, 0.1) * (0.8 + 0.4 * tl), straw * lawn * 0.2 * close);
  hg += straw * 0.006;
  // florcitas sueltas, al ras
  if (close > 0.0 && lawn > 0.5) {
    vec2 q = p / 0.38;
    vec2 ci = floor(q);
    float hh = slHi(ci + vec2(5.0, 11.0));
    if (hh < 0.1) {
      vec2 o = vec2(slHi(ci + vec2(1.0, 23.0)), slHi(ci + vec2(9.0, 4.0))) * 0.7 + 0.15;
      float d = length(q - ci - o) * 0.38;
      float fl = 1.0 - smoothstep(0.014 + 0.012 * hh * 10.0, 0.024 + 0.012 * hh * 10.0, d);
      // (apagadas: las blancas brillaban como puntitos sueltos)
      vec3 fc = hh < 0.05 ? vec3(0.55, 0.44, 0.07) : hh < 0.075 ? vec3(0.42, 0.42, 0.37) : vec3(0.3, 0.1, 0.42);
      c = mix(c, fc * (0.65 + 0.5 * slHi(ci)), fl * close);
      hg += fl * 0.006;
    }
  }
  // la tierra: terrones, granza, piedritas y grietas donde está seca
  float hd = (slNi(p * 3.0 + 7.0) - 0.5) * 0.025;
  if (dirt > 0.02 && near > 0.0) {
    vec2 pw = p + 0.35 * vec2(slNi(p * 2.2), slNi(p * 2.2 + 7.0));
    float cr = slVor(pw * 2.4);
    // (grietas solo en la tierra de por sí —caminos, barranca—, no en lo pisado del pasto)
    float dry = smoothstep(0.5, 0.68, slF(p * 0.21 + 4.4)) * (1.0 - grass) * (1.0 - smoothstep(0.55, 0.8, slope));
    float crack = (1.0 - smoothstep(0.006, 0.028, cr)) * dry;
    // (la granza, en manchas; piedras sueltas, pocas)
    float gm = smoothstep(0.42, 0.7, slNi(p * 0.55 + 3.0));
    vec2 pb = slPeb(p, 0.075, 0.3 * gm);
    vec2 pc = slPeb(p + 31.0, 0.24, 0.1);
    float k = max(pb.x, pc.x);
    float big = step(pb.x, pc.x);
    float tone = mix(pb.y, pc.y, big);
    float pm = smoothstep(0.0, 0.2, k) * near;
    // (del tono del piso de al lado, apenas más clara y gris: nada de puntos blancos)
    float cl = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 stone = mix(vec3(cl), c, 0.45) * (1.25 + 1.1 * tone) * (0.85 + 0.3 * sqrt(max(k, 0.0)));
    // la sombrita al pie de cada piedra
    float rim = smoothstep(-0.7, 0.0, k) * (1.0 - step(0.0, k));
    vec3 cd = c * (1.0 - 0.3 * rim * near);
    cd *= 1.0 - 0.45 * crack * near;
    cd = mix(cd, stone, pm);
    c = mix(c, cd, dirt);
    hd += sqrt(max(k, 0.0)) * mix(0.01, 0.028, big) - crack * 0.018;
    slRg -= pm * dirt * 0.3;
  }
  // charcos de barro en lo pelado y en la tierra (oscuros y con brillo)
  float wet = smoothstep(0.72, 0.77, slF(p * 0.07 - 2.2)) * bare * (1.0 - smoothstep(0.3, 0.5, slope));
  c *= 1.0 - 0.28 * wet;
  hd *= 1.0 - 0.8 * wet;
  slRg -= wet * 0.5;
  // lo quemado: ceniza clara en manchas
  float burnt = (1.0 - smoothstep(0.02, 0.04, vl)) * (1.0 - grass * 0.5);
  float ash = smoothstep(0.45, 0.8, slNi(p * 5.0 + 2.0)) * burnt;
  c = mix(c, vec3(0.07, 0.066, 0.06), ash * 0.6);
  // la barranca: vetas por capas
  float cliff = smoothstep(0.25, 0.5, slope) * (1.0 - grass);
  float strata = 0.8 + 0.32 * slNi(vec2(vSlW.y * 3.4 + slNi(p * 0.3) * 2.5, (p.x + p.y) * 0.12));
  c *= mix(1.0, strata, cliff);
  hd += cliff * (strata - 0.9) * 0.05;
  slHt = mix(hg, hd, dirt) * near;
  diffuseColor.rgb = c;
}
`;
// el relieve: la normal torcida por las diferencias de slHt (en metros, de verdad: sin normalizar)
const PISO2_NORMAL = /* glsl */ `
{
  vec3 sp = -vViewPosition;
  vec3 sx = dFdx(sp);
  vec3 sy = dFdy(sp);
  vec2 dH = vec2(dFdx(slHt), dFdy(slHt));
  vec3 R1 = cross(sy, normal);
  vec3 R2 = cross(normal, sx);
  float det = dot(sx, R1);
  vec3 grd = sign(det) * (dH.x * R1 + dH.y * R2);
  normal = normalize(abs(det) * normal - grd);
}
`;

// El suelo (con la textura de pasto ya puesta en map).
export function slGroundLook(mat) {
  if (!on() || mat.userData.slLook) return mat;
  mat.userData.slLook = true;
  mat.flatShading = false;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSlW;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec2 wq = vSlW.xz;
          // dos lecturas del pasto, giradas y a otra escala, mezcladas con ruido
          float mz = slF(wq * 0.045);
          vec4 t1 = texture2D(map, wq * 0.34);
          vec4 t2 = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * wq * 0.21 + 0.37);
          vec4 tx = mix(t1, t2, smoothstep(0.35, 0.65, mz));
          // y a lo lejos, el tono grande
          float big = slF(wq * 0.012);
          tx.rgb *= 0.86 + 0.28 * big;
          diffuseColor *= tx;
        #endif
        // tierra pisada y pasto más verde, en manchones
        float dirt = smoothstep(0.62, 0.78, slF(vSlW.xz * 0.09 + 3.1));
        float lush = smoothstep(0.58, 0.75, slF(vSlW.xz * 0.06 - 7.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.12, 0.7), dirt * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 1.08, 0.8), lush * 0.5);
        // el grano fino (de cerca no queda liso)
        diffuseColor.rgb *= 0.93 + 0.14 * slN(vSlW.xz * 3.1);`,
      );
    if (piso2) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${PISO2_FN}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${PISO2_COLOR}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + slRg, 0.3, 1.0);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${PISO2_NORMAL}`);
    }
  };
  // (el piso 2, ver arriba: __mduEclPisoViejo)
  const piso2 = piso2On();
  mat.customProgramCacheKey = () => (piso2 ? 'slGround2' : 'slGround1');
  mat.needsUpdate = true;
  return mat;
}

// Lo construido (el convento, los muros, las carretas...): por el color de
// cada pieza (colores de sanlorenzoCampo COL, en lineal).
export function slStaticLook(mat, y0) {
  if (!on() || mat.userData.slLook) return mat;
  mat.userData.slLook = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSlY0 = { value: y0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlW;\nvarying vec3 vSlN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSlN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSlW;\nvarying vec3 vSlN;\nuniform float uSlY0;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          vec3 W = vSlW;
          vec3 N = normalize(vSlN);
          float hy = W.y - uSlY0;
          // las coordenadas de la cara: a lo largo (s) y para arriba (t)
          vec2 st = abs(N.x) > abs(N.z) ? vec2(W.z, W.y) : vec2(W.x, W.y);
          if (abs(N.y) > 0.7) st = W.xz;
          float lum = dot(c, vec3(0.3, 0.55, 0.15));
          float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
          // revoque blanco (cal): claro y poco saturado
          if (lum > 0.3 && sat < 0.25 && abs(N.y) < 0.7) {
            float g = slF(st * 1.7);
            float fine = slN(st * 9.0);
            c *= 0.84 + 0.22 * g + 0.06 * fine;
            // la humedad que sube del piso (borde ondulado)
            float wet = 1.0 - smoothstep(0.3, 1.5 + 0.9 * slF(st * 0.8), hy);
            c *= mix(vec3(1.0), vec3(0.62, 0.6, 0.52), wet);
            // el chorreado de arriba
            float drip = smoothstep(0.55, 0.85, slN(vec2(st.x * 3.0, 1.0))) * smoothstep(5.5, 8.2, hy) * (0.5 + 0.5 * slN(st * vec2(3.0, 0.6)));
            c *= 1.0 - 0.3 * drip;
            // algún ladrillo donde se cayó el revoque
            float hole = smoothstep(0.68, 0.72, slF(st * 0.55 + 11.0));
            if (hole > 0.0) {
              vec2 b = st * vec2(1.0 / 0.26, 1.0 / 0.075);
              b.x += floor(b.y) * 0.5;
              float joint = step(0.86, fract(b.x)) + step(0.8, fract(b.y));
              vec3 brick = vec3(0.42, 0.16, 0.08) * (0.8 + 0.4 * slH(vec3(floor(b), 1.0)));
              brick = mix(brick, vec3(0.45, 0.42, 0.36), clamp(joint, 0.0, 1.0));
              c = mix(c, brick, hole);
            }
          }
          // tejas (rojo): hileras en la pendiente
          else if (c.r > 0.2 && c.r > c.g * 2.2 && c.r > c.b * 2.6 && N.y > 0.2) {
            vec2 rt = W.xz;
            // (a lo largo de la cumbrera y hacia abajo: la cara mira para el costado)
            vec2 dn = normalize(N.xz + 1e-4);
            float down = dot(rt, dn);
            float along = dot(rt, vec2(-dn.y, dn.x));
            float row = fract(down / 0.32);
            float col = fract(along / 0.24 + floor(down / 0.32) * 0.5);
            float bump = 0.75 + 0.25 * sin(col * 6.2832);
            float lip = smoothstep(0.82, 1.0, row);
            c *= bump * (1.0 - 0.35 * lip) * (0.85 + 0.3 * slH(vec3(floor(along / 0.24), floor(down / 0.32), 2.0)));
            c *= 0.85 + 0.3 * slF(rt * 0.4);
          }
          // zócalo y piedra (ocre, oscuro y poco saturado): sillares
          else if (lum > 0.12 && sat > 0.22 && c.r > c.b * 2.0 && c.g > c.b * 1.5 && abs(N.y) < 0.7) {
            vec2 b = st * vec2(1.0 / 0.6, 1.0 / 0.3);
            b.x += floor(b.y) * 0.5;
            float jt = max(smoothstep(0.93, 0.98, fract(b.x)), smoothstep(0.88, 0.96, fract(b.y)));
            c *= (0.82 + 0.3 * slH(vec3(floor(b), 3.0))) * (1.0 - 0.45 * jt) * (0.9 + 0.2 * slF(st * 2.0));
          }
          // madera (marrón oscuro): la veta
          else if (lum < 0.18 && c.r > c.b * 1.4) {
            float vv = abs(N.y) > 0.7 ? W.x : W.y;
            float grain = slN(vec2(vv * 14.0, (st.x + st.y) * 1.2));
            c *= 0.82 + 0.3 * grain;
          }
          // lo demás: un grano suave
          else c *= 0.94 + 0.12 * slF(st * 2.3);
          diffuseColor.rgb = c;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'slStatic1';
  mat.needsUpdate = true;
  return mat;
}
