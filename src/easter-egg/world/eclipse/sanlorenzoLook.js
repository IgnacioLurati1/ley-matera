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
  };
  mat.customProgramCacheKey = () => 'slGround1';
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
