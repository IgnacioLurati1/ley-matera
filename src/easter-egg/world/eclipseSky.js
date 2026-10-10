import * as THREE from 'three';
import { SKY, ZONES } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';
import { buildSkyFight } from './eclipseGfxFight';
import { eclSfx } from '../fx/eclipseSfx';

// (2026-10-08, el usuario: "cosmical shockwave, es para cuando el Chiquitijuein
// y Francisco en el cielo chocan y generan la onda de choque; ojo con la
// frecuencia del evento y con el sonido para que no aturda". Suena solo en el
// choque grande —el de la onda en las grietas, uno de cada cuatro, cada
// ~1,5 min— y en lugar del trueno fuerte (no encima); entre uno y otro, al
// menos SHOCK_GAP s (si no, el trueno de siempre). El archivo, más bajo y
// con menos sub que el original: sfx/eclipse/onda-choque.mp3, -18 LUFS.
// globalThis.__mduOldShockSfx: el trueno, como antes)
const SHOCK_GAP = 75;

// El cielo de Eclipse Matero: el cielo roto.
//
// Un solo domo (un dibujo) que pinta todo lo que hay más allá de las islas:
// - Los sectores: cada isla trae el cielo de su mapa y su hora, y ese cielo
//   está en la dirección de la isla vista desde el medio del mapa (mirando del
//   claro al castillo, atrás del castillo está su noche con la aurora). Son
//   cuñas que salen del eclipse, como un vidrio roto con el golpe en el
//   eclipse; las separan las grietas (la ruptura del espacio-tiempo): líneas
//   quebradas de luz violeta y blanca, con un brillo que tiembla y, de vez en
//   cuando, un pulso que corre a lo largo de la grieta.
// - Arriba de la cabeza (el casquete del cenit) va el cielo de la isla donde
//   está la cámara; al cambiar de isla se funde al nuevo (world/eclipseAtmos.js
//   le dice cuál, en cada compu por su cuenta: nunca por weather.set).
// - Alrededor del eclipse, la herida violeta: el cielo de El Desgarro.
// - El eclipse: el sol de oro con su corona y su aureola rota (Francisco) que
//   un disco negro con dos puntitos rojos (el Chiquitijuein) va tapando. Es la
//   luz del mapa (la "luna" del contrato del cielo). w.eclipse.set(k): 0 apenas
//   se tocan, 1 totalidad (el cielo se oscurece, la corona se enciende, las
//   grietas brillan más); lo maneja el easter egg. w.eclipse.pulse(): un
//   estallido.
// - Abajo, el vacío: un mar de nubes violetas muy abajo de las islas, con
//   jirones más arriba y, en el fondo, grietas de luz que se ven por los
//   huecos. No es geometría: cada píxel corta su rayo con tres planos
//   (paralaje de verdad, sin bordes y sin pasarse del far de la cámara) y lo
//   lejano se funde con el horizonte de su sector.
//
// El domo sigue a la cámara que lo dibuja (onBeforeRender: la del juego, la del
// espejo del agua y la del cubo del cielo), nunca gira: las estrellas no nadan.
// Usa los mismos uniforms que el cielo de siempre (World.buildSky): el clima
// (world/Weather.js) le pone nubes, relámpagos, la luna roja y la niebla.
// Todo lo que cambia en partida es un uniform: ni el eclipse ni el cambio de
// isla compilan nada.

// las islas en el orden del shader
export const ISLE_IDS = ['centro', 'molino', 'tapera', 'penal', 'monumento', 'torre', 'castillo', 'desgarro'];
// las que tienen su cuña en el horizonte (el centro está en el medio y El
// Desgarro es la herida alrededor del eclipse)
const RING = ['molino', 'tapera', 'penal', 'monumento', 'torre', 'castillo'];

// El eclipse: al nornoreste (30° al este del norte) y a 36° de altura: desde
// el claro queda a la derecha de El Desgarro y arriba del castillo (sin que
// lo tapen), entra en la cámara del título y su luz entra a los patios.
// (SKY.moon.dir del config generado no se usa: ver el reporte para main.)
export const ECLIPSE_DIR = new THREE.Vector3(0.405, 0.588, -0.7).normalize();
// radios en el cielo (tangente del ángulo): el sol y el disco negro, un poco más grande
const RS = 0.07;
const RM = 0.0735;
// hacia dónde está corrido el disco negro (x: hacia el cenit, y: de costado)
const MOON_U = new THREE.Vector2(-0.5, 0.866);
// las grietas: cuánto se tuercen al alejarse del eclipse (en espiral, no como una torta)
const CURL = 0.16;
// cuánto tarda w.eclipse.set por defecto
const SET_SECS = 3;

// Los colores de cada cielo (lineales): horizonte, medio, cenit y el acento propio.
// (pisan a los colores de ISLANDS del config, que eran de prueba)
export const SKY_PAL = {
  // el estero de noche: luna llena detrás de un velo, azul verdoso
  centro: [[0.07, 0.19, 0.2], [0.025, 0.085, 0.1], [0.006, 0.026, 0.05], [0.35, 0.62, 0.62]],
  // el atardecer sepia de 1911
  molino: [[0.42, 0.2, 0.06], [0.16, 0.075, 0.03], [0.06, 0.035, 0.02], [1.0, 0.62, 0.25]],
  // La Tapera: el sol que se hunde, naranja abajo, rosa y lila arriba
  tapera: [[0.85, 0.26, 0.05], [0.42, 0.08, 0.17], [0.1, 0.03, 0.16], [1.0, 0.3, 0.55]],
  // el penal: tormenta verde gris con rayos
  penal: [[0.14, 0.2, 0.16], [0.05, 0.075, 0.065], [0.02, 0.03, 0.03], [0.5, 0.66, 0.56]],
  // el Monumento: amanecer celeste y blanco con niebla baja
  monumento: [[0.4, 0.45, 0.48], [0.15, 0.32, 0.62], [0.04, 0.12, 0.38], [1.0, 0.82, 0.55]],
  // la torre: el remolino de oro y verde
  torre: [[0.3, 0.24, 0.04], [0.06, 0.1, 0.025], [0.015, 0.035, 0.015], [1.0, 0.7, 0.15]],
  // el castillo: noche estrellada con aurora de hielo
  castillo: [[0.06, 0.1, 0.17], [0.02, 0.035, 0.07], [0.004, 0.008, 0.024], [0.25, 0.95, 0.75]],
  // El Desgarro: la herida violeta
  desgarro: [[0.3, 0.07, 0.42], [0.16, 0.03, 0.3], [0.05, 0.01, 0.12], [0.85, 0.2, 0.75]],
};
// Cuánta noche le cae encima a todos los cielos (0: los cielos a pleno de la
// primera versión, con globalThis.__mduSkyBright). La usan también la niebla
// y las luces de world/eclipseAtmos.
export const SKY_NIGHT = () => (globalThis.__mduSkyBright === true ? 0 : 1);
// cuántas estrellas deja ver cada cielo
const STARS = { centro: 0.8, molino: 0.12, tapera: 0.3, penal: 0.25, monumento: 0.04, torre: 0.35, castillo: 1.2, desgarro: 0.7 };
// a qué altura (seno) está el centro de lo propio de cada cuña: el sol de La
// Tapera medio hundido, el resplandor del alba, el ojo del remolino...
const FEAT_H = { centro: 0.6, molino: 0.05, tapera: 0.025, penal: 0.25, monumento: 0.03, torre: 0.32, castillo: 0.2, desgarro: 0.5 };

const GLSL_COMMON = /* glsl */ `
  #define PI 3.14159265
  #define TAU 6.28318531
  float h1(float n) { return fract(sin(n * 127.1 + 0.37) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // ruido fractal; fw = cuánto mide un píxel en las unidades de p: las octavas
  // más finas que un píxel se apagan al promedio (lo lejano no titila)
  float fbm(vec2 p, float fw, int oct) {
    float s = 0.0, a = 0.5, n = 0.0, f = 1.0;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      float lod = 1.0 - smoothstep(0.25, 0.7, fw * f);
      s += a * mix(0.5, vn(p * f + float(i) * 17.3), lod);
      n += a;
      f *= 2.03;
      a *= 0.5;
    }
    return s / n;
  }
  // una línea quebrada: tramos rectos entre nudos al azar (el borde de un vidrio roto)
  float zig(float x, float seed) {
    float i = floor(x);
    return mix(h1(i + seed), h1(i + 1.0 + seed), fract(x)) * 2.0 - 1.0;
  }
  // lo mismo dando la vuelta (n nudos por vuelta): sin corte donde el ángulo salta
  float zigP(float x, float n, float seed) {
    float i = floor(x);
    return mix(h1(mod(i, n) + seed), h1(mod(i + 1.0, n) + seed), fract(x)) * 2.0 - 1.0;
  }
  float wrapA(float a) { return a - TAU * floor((a + PI) / TAU); }
  // una línea fina sin serrucho: nunca más angosta que un píxel (y más tenue si se ensancha)
  float line(float dist, float w, float px) {
    float we = max(w, px * 0.85);
    return (w / we) * exp(-dist * dist / (we * we));
  }
  // un ángulo sin el caso 0/0
  float ang(vec2 p) { return dot(p, p) < 1e-14 ? 0.0 : atan(p.y, p.x); }
  // ejes alrededor de una dirección (sin cruzar con ella misma)
  void frame(vec3 c, out vec3 t1, out vec3 t2) {
    vec3 ax = abs(c.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    t1 = normalize(cross(ax, c));
    t2 = cross(c, t1);
  }
`;

// Para otras grietas del desgarro (los portales de world/eclipsePortals.js, lo
// que venga): las mismas cuentas y colores que las del cielo. Pegar CRACK_GLSL
// en el fragment shader y llamar desgarroCrack(dist, w, along, t, px, k):
// dist = distancia al eje de la grieta, w = ancho del núcleo, px = lo que mide
// un píxel (las tres en la misma unidad: fwidth sirve), along = posición a lo
// largo (el temblor corre por ahí), k = cuánto brilla (1 = como en el cielo).
// Para el borde quebrado: zig(x, semilla) da tramos rectos con quiebres.
export const CRACK_GLSL = GLSL_COMMON + /* glsl */ `
  vec3 desgarroCrack(float dist, float w, float along, float t, float px, float k) {
    float core = line(dist, w, px) * (0.72 + 0.28 * sin(t * 2.1 + along * 31.0));
    float glow = exp(-dist / (w * 7.0)) * 0.24 + exp(-dist / (w * 30.0)) * 0.05;
    return (vec3(1.3, 1.05, 1.9) * core * 1.25 + vec3(0.42, 0.13, 0.8) * glow) * k;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vPos;
  uniform float uTime, uCloud, uFlash, uBlood, uFogAmt, uDay;
  uniform vec3 uFogColor, uSun, uHorizon, uZenith, uGlow;
  uniform vec3 uE, uEU, uEV;
  uniform float uK, uPulse, uCrack, uQ, uDark, uNight, uDim, uSunSoft;
  // la pelea: cuánto dura el choque (1 → 0), hacia dónde se lanza la sombra y el ángulo del rayo
  uniform float uClash, uClashA;
  uniform vec2 uClashD;
  uniform vec2 uMoonOff, uMoonU;
  uniform vec3 uPal[32];
  uniform vec3 uFc[8];
  uniform float uStar[8];
  uniform float uWb[6];
  uniform float uWid[6];
  uniform float uCapA, uCapB, uCapMix;
  ${CRACK_GLSL}

  // ---------------- las estrellas (en una grilla por cara de un cubo: no se cortan) ----------------
  vec3 starLayer(vec3 d, float px) {
    vec3 a = abs(d);
    vec2 uv;
    float face;
    if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
    else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
    float N = 150.0;
    vec2 g = (uv * 0.5 + 0.5) * N;
    vec2 c = floor(g);
    float r = h2(c + face * 37.1);
    if (r < 0.93) return vec3(0.0);
    vec2 j = vec2(h2(c + face * 17.0 + 3.1), h2(c + face * 29.0 + 7.7)) * 0.6 + 0.2;
    float cellA = 2.0 / N / (1.0 + dot(uv, uv));
    float dA = length(g - c - j) * cellA;
    float mag = (r - 0.93) / 0.07;
    float rad = 0.0005 + mag * mag * 0.0011;
    float re = max(rad, px * 0.75);
    float b = (rad * rad) / (re * re) * exp(-dA * dA / (re * re)) * (0.35 + 1.8 * mag * mag);
    b *= 0.7 + 0.3 * sin(uTime * (1.0 + 3.0 * h2(c + 9.0)) + r * 60.0);
    return mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), h2(c + 5.0)) * b;
  }

  // La noche del eclipse: cada cielo pierde casi todo su color y su luz, y
  // queda como un rescoldo sobre un negro violeta común (uNight 0: los
  // cielos a pleno, como eran).
  vec3 nightSky(vec3 c, float h) {
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    // el color propio, apagado: un rescoldo, más prendido contra el horizonte
    vec3 n = mix(vec3(l), c, 0.65) * (0.032 + 0.05 * exp(-max(h, 0.0) * 5.0));
    // (lo muy prendido, el sol de La Tapera o un rayo, se sigue leyendo)
    n += c * 0.1 * smoothstep(0.9, 2.2, l);
    // la base: negro violeta, apenas más claro abajo
    n += mix(vec3(0.02, 0.009, 0.04), vec3(0.004, 0.002, 0.01), smoothstep(0.0, 0.55, h));
    return mix(c, n, uNight);
  }

  // La Disformidad (la isla del Pack-a-Pava es otra dimensión): un cielo de
  // nebulosa oscura y violeta que se revuelve, con ojos que se abren y cierran;
  // sin grietas ni eclipse. uDim: cuánto de ella (la atmósfera lo pone por isla).
  vec3 dimSky(vec3 d, float px, int oct) {
    float t = uTime;
    vec2 p = d.xz / (abs(d.y) + 0.35) * 1.6;
    float fw = px * 3.0;
    float n = fbm(p * 0.9 + vec2(t * 0.02, -t * 0.013), fw, oct);
    float n2 = fbm(p * 2.3 - vec2(t * 0.03, 0.0) + n, fw * 2.5, oct);
    vec3 c = mix(vec3(0.008, 0.0, 0.018), vec3(0.14, 0.025, 0.28), smoothstep(0.35, 0.8, n));
    c += vec3(0.45, 0.1, 0.85) * pow(smoothstep(0.55, 0.95, n2), 3.0) * 0.6;
    vec2 g = p * 3.0;
    float e = h2(floor(g));
    float blink = smoothstep(0.6, 0.9, sin(t * (0.4 + e) + e * 30.0));
    float ed = length(fract(g) - 0.5);
    c += vec3(1.0, 0.2, 0.9) * exp(-ed * 30.0) * blink * step(0.93, e) * 1.4;
    // abajo, el pozo
    c *= 0.4 + 0.6 * smoothstep(-0.6, 0.1, d.y);
    return c;
  }

  vec3 grad(int id, float h) {
    vec3 c = mix(uPal[id * 4], uPal[id * 4 + 1], smoothstep(0.0, 0.22, h));
    return mix(c, uPal[id * 4 + 2], smoothstep(0.18, 0.85, h));
  }

  // ---------------- el cielo de cada isla ----------------
  // d: dirección; fc: el centro de lo suyo (en su cuña o el cenit); oct: octavas.
  // Devuelve el color y cuántas estrellas deja ver.
  vec4 secSky(int id, vec3 d, vec3 fc, float px, int oct) {
    float h = max(d.y, 0.0);
    float t = uTime;
    vec3 acc = uPal[id * 4 + 3];
    vec3 c = grad(id, h);
    float st = 1.0;
    // (las nubes en un plano arriba: más chicas y lejanas hacia el horizonte)
    vec2 cp = d.xz / (h + 0.22) * 3.2;
    float cfw = px / max(h + 0.22, 0.05) * 4.8;
    if (id == 0) {
      // el estero: la luna llena detrás de un velo, y velos de nube
      vec3 md = normalize(vec3(0.32, 0.86, 0.4));
      float m = max(dot(d, md), 0.0);
      float v = fbm(cp * 1.2 + vec2(t * 0.006, 0.0), cfw * 1.2, oct);
      float veil = smoothstep(0.48, 0.85, v);
      c += acc * (pow(m, 60.0) * 0.55 + pow(m, 7.0) * 0.16) * (0.6 + 0.4 * veil);
      c += vec3(0.85, 0.95, 0.92) * smoothstep(0.99935, 0.99955, m) * (0.5 - 0.3 * veil);
      c = mix(c, c + acc * 0.12, veil * 0.6);
      st = 1.0 - veil * 0.7;
    } else if (id == 1) {
      // el molino: la tarde de 1911 en sepia, nubes largas y rayas de película vieja
      float s = max(dot(d, fc), 0.0);
      float v = fbm(cp * vec2(0.6, 2.4) + vec2(t * 0.004, 0.0), cfw * 2.4, oct);
      c += acc * (pow(s, 6.0) * 0.4 + pow(s, 60.0) * 0.5);
      c = mix(c, mix(vec3(0.3, 0.17, 0.08), acc * 0.75, pow(s, 2.0)), smoothstep(0.52, 0.8, v) * 0.6 * smoothstep(0.01, 0.1, h));
      float l = dot(c, vec3(0.3, 0.59, 0.11));
      c = mix(c, l * vec3(1.35, 0.95, 0.55), 0.35);
      vec2 dz = d.xz / max(length(d.xz), 1e-4);
      float x = (ang(dz) + PI) * 420.0;
      float k = h1(floor(x) * 0.13 + floor(t * 9.0) * 1.7);
      c += vec3(0.5, 0.4, 0.25) * step(0.993, k) * line(fract(x) - 0.5, 0.18, 0.0) * 0.12 * smoothstep(0.0, 0.05, h);
      st = smoothstep(0.4, 0.9, h);
    } else if (id == 2) {
      // La Tapera: bandas del atardecer y el sol que se hunde
      float s = max(dot(d, fc), 0.0);
      float b = (h - 0.08) / 0.07;
      c = mix(c, acc * 0.75, exp(-b * b) * 0.55);
      // (sesión 1f, el usuario: "el glow de ver el sol te deja ciego": el disco
      // pasaba de 1 —el brillo lo agrandaba— y el resplandor era ancho)
      c += vec3(1.0, 0.5, 0.16) * (pow(s, 5.0) * 0.32 + pow(s, 40.0) * 0.35) * uSunSoft;
      c = mix(c, vec3(2.0, 0.9, 0.25) * mix(1.0, 0.5, step(0.5, 1.0 - uSunSoft)), smoothstep(0.9988, 0.9991, s));
      float v = fbm(cp * vec2(0.5, 3.2) + vec2(t * 0.004, 0.0), cfw * 3.2, oct);
      vec3 cir = mix(acc * 0.8, vec3(1.0, 0.7, 0.35), pow(s, 3.0));
      c = mix(c, cir * (1.0 - 0.5 * smoothstep(0.3, 0.9, h)), smoothstep(0.55, 0.85, v) * 0.55 * smoothstep(0.03, 0.14, h) * (1.0 - 0.5 * smoothstep(0.35, 0.9, h)));
      st = smoothstep(0.35, 0.8, h);
    } else if (id == 3) {
      // el penal: nubarrones verde gris, relámpagos adentro y algún rayo lejos
      vec2 p = cp * 0.9 + vec2(t * 0.012, t * 0.006);
      float v = fbm(p, cfw * 0.9, oct);
      float cov = smoothstep(0.36, 0.7, v);
      vec2 cell = floor(p * 0.5);
      float ph = fract(t * 0.11 + h2(cell) * 7.0);
      float fl = smoothstep(0.0, 0.008, ph) * smoothstep(0.07, 0.01, ph) * step(0.55, h2(cell + 3.1)) * (0.6 + 0.4 * sin(ph * 300.0));
      // (el relámpago prende las nubes de adentro, no el cielo vacío)
      float gl = exp(-length(fract(p * 0.5) - 0.5) * 3.0) * fl * smoothstep(0.45, 0.85, v);
      c = mix(c, uPal[id * 4 + 1] * 0.8, cov * 0.85);
      c += acc * gl * 2.2 * smoothstep(0.0, 0.06, h);
      // el rayo: cada tanto, del techo de nubes al horizonte
      float slot = floor(t / 3.7);
      float bt = fract(t / 3.7);
      float on = step(0.5, h1(slot)) * smoothstep(0.0, 0.01, bt) * smoothstep(0.1, 0.03, bt) * (0.6 + 0.4 * sin(bt * 220.0));
      vec2 dz = d.xz / max(length(d.xz), 1e-4);
      vec2 fz = fc.xz / max(length(fc.xz), 1e-4);
      float ab = ang(fz) + (h1(slot + 1.0) - 0.5) * 0.6;
      float bx = wrapA(ang(dz) - ab - zig(h * 40.0 + slot * 3.0, slot) * 0.025 - zig(h * 130.0, slot + 5.0) * 0.006);
      float bolt = line(abs(bx) * sqrt(max(1.0 - h * h, 0.0)), 0.0012, px) * (1.0 - smoothstep(0.2, 0.26, h));
      c += vec3(0.85, 1.0, 0.92) * bolt * on * 3.0 + acc * on * 0.35 * cov * exp(-abs(bx) * 6.0) * (1.0 - smoothstep(0.1, 0.4, h));
      st = 1.0 - cov;
    } else if (id == 4) {
      // el Monumento: el alba celeste y blanca, niebla baja y nubes rosadas
      float s = max(dot(d, fc), 0.0);
      c += acc * (pow(s, 10.0) * 0.16 + pow(s, 90.0) * 0.35);
      c = mix(c, vec3(0.5, 0.55, 0.58), exp(-h * 16.0) * 0.35);
      float v = fbm(cp * 0.8 + vec2(t * 0.003, 0.0), cfw * 0.8, oct);
      c = mix(c, mix(vec3(0.5, 0.42, 0.55), vec3(0.85, 0.72, 0.55), pow(s, 2.0)) * (1.0 - 0.35 * h), smoothstep(0.48, 0.82, v) * 0.55 * smoothstep(0.03, 0.2, h));
      st = smoothstep(0.7, 1.0, h) * 0.5;
    } else if (id == 5) {
      // la torre: el remolino lento de oro y verde
      vec3 t1, t2;
      frame(fc, t1, t2);
      float z = max(dot(d, fc), 0.08);
      vec2 p = vec2(dot(d, t1), dot(d, t2)) / z;
      float r = length(p) + 1e-4;
      float a = ang(p);
      // (r en el plano tangente: el remolino ocupa unos 40° alrededor de su ojo)
      p *= 2.0;
      r *= 2.0;
      float sw = a * 4.0 - log(r) * 6.0 + t * 0.3;
      float n = fbm(p * 2.0 + vec2(t * 0.02, 0.0), px * 3.2 / z, oct);
      float sa = sin(sw + n * 1.3);
      float reach = smoothstep(1.6, 0.25, r);
      float arm = smoothstep(0.35, 0.92, sa) * reach;
      float rim = exp(-abs(sa - 0.35) * 10.0) * reach;
      c = mix(c, vec3(0.012, 0.09, 0.035) * (0.6 + 0.8 * n), smoothstep(1.7, 0.2, r) * (1.0 - arm) * 0.75);
      c = mix(c, acc * vec3(0.62, 0.55, 0.45) * (0.25 + 0.6 * n * n) * (0.6 + 0.6 * smoothstep(1.2, 0.3, r)), arm * 0.8);
      c += vec3(0.35, 0.62, 0.2) * rim * 0.1 + acc * rim * 0.06;
      // el ojo, oscuro, con un borde de oro
      c *= 1.0 - smoothstep(0.32, 0.08, r) * 0.85;
      c += acc * exp(-abs(r - 0.3) * 30.0) * 0.25;
      st = 1.0 - arm * 0.8;
    } else if (id == 6) {
      // el castillo: la Vía Láctea y la aurora de hielo
      vec3 gal = normalize(vec3(0.55, 0.35, -0.76));
      float g = dot(d, gal);
      float band = exp(-g * g * 26.0);
      float mw = band * (0.35 + 0.9 * fbm(vec2(g * 9.0, 0.0) + d.xz * 3.0, cfw * 3.0, oct));
      c += vec3(0.55, 0.62, 0.85) * mw * 0.12 * smoothstep(-0.02, 0.18, h);
      vec2 dz = d.xz / max(length(d.xz), 1e-4);
      float hb = 0.07 + 0.045 * sin(dot(dz, vec2(3.0, 1.0)) * 2.0 + t * 0.05) + 0.025 * sin(dot(dz, vec2(-1.0, 4.0)) * 3.0 - t * 0.08);
      float y = h - hb;
      float cur = smoothstep(0.0, 0.02, y) * exp(-max(y, 0.0) / 0.16);
      float ray = 0.35 + 0.65 * vn(dz * 70.0 + vec2(0.0, t * 0.25));
      float fold = 0.45 + 0.55 * sin(dot(dz, vec2(11.0, 5.0)) + t * 0.2 + vn(dz * 6.0 + t * 0.03) * 4.0);
      vec3 ac = mix(acc, vec3(0.45, 0.7, 1.0), smoothstep(0.0, 0.14, y));
      ac = mix(ac, vec3(0.55, 0.3, 0.95), smoothstep(0.12, 0.3, y));
      c += ac * cur * ray * fold * 0.75;
      st = 1.0 - cur * 0.6;
    } else {
      // El Desgarro: nebulosa violeta que gira alrededor de su centro
      vec3 t1, t2;
      frame(fc, t1, t2);
      float z = max(dot(d, fc), 0.08);
      vec2 p = vec2(dot(d, t1), dot(d, t2)) / z;
      float r = length(p);
      float a = ang(p) + 1.4 / (r + 0.25) + t * 0.04;
      vec2 q = vec2(cos(a), sin(a)) * r * 3.0;
      float n = fbm(q + vec2(t * 0.01, 0.0), px * 3.0 / z, oct);
      c = mix(vec3(0.04, 0.01, 0.14), uPal[id * 4], smoothstep(0.3, 0.7, n));
      c += acc * smoothstep(0.62, 0.9, n) * 0.5;
      c += vec3(0.3, 0.1, 0.5) * exp(-r * 3.0) * 0.4;
      st = 1.0 - smoothstep(0.5, 0.8, n) * 0.6;
    }
    return vec4(c, st * uStar[id]);
  }

  // ---------------- el eclipse (q: el plano tangente alrededor de él) ----------------
  vec3 eclipse(vec3 base, vec2 q, float px) {
    float t = uTime;
    float r = length(q);
    vec2 mq = q - uMoonOff;
    float rm = length(mq);
    float a = ang(q);
    vec2 ca = vec2(cos(a), sin(a));
    vec3 col = base;
    // el resplandor grande (oro hacia afuera, violeta donde manda la sombra)
    col += vec3(1.0, 0.55, 0.18) * exp(-r / 0.2) * (0.05 + 0.1 * uK + 0.3 * uPulse);
    // la corona: rayos de oro que se mueven despacio; más fuerte cuanto más tapado
    float stv = 0.4 * vn(ca * 3.0 + vec2(t * 0.02, 0.0)) + 0.6 * vn(ca * 11.0 - vec2(0.0, t * 0.035));
    float fall = ${RS.toFixed(4)} / max(r, ${RS.toFixed(4)});
    float cor = fall * fall * fall * (0.2 + 1.1 * stv * stv) * (0.45 + 1.6 * uK + 1.6 * uPulse);
    col += vec3(1.0, 0.58, 0.16) * cor * 0.6;
    // lenguas de fuego del borde
    float fl = vn(ca * 6.0 + vec2(t * 0.11, -t * 0.07));
    float tongue = 0.003 + 0.024 * fl * fl * fl + 0.02 * uPulse;
    col += vec3(1.1, 0.48, 0.09) * exp(-max(r - ${RS.toFixed(4)}, 0.0) / tongue) * step(${RS.toFixed(4)}, r);
    // una llamarada lenta y violenta cada tanto
    float slot = floor(t / 9.0);
    float ft = fract(t / 9.0);
    float fa = h1(slot + 2.0) * TAU;
    vec2 fd = vec2(cos(fa), sin(fa));
    float along = dot(q, fd) - ${RS.toFixed(4)};
    float across = abs(dot(q, vec2(-fd.y, fd.x)));
    float len = (0.04 + 0.12 * ft) * smoothstep(0.0, 0.25, ft) * smoothstep(1.0, 0.55, ft) + 1e-3;
    col += vec3(2.2, 1.2, 0.4) * step(0.0, along) * exp(-across / (0.004 + max(along, 0.0) * 0.18)) * exp(-max(along, 0.0) / len) * (0.7 + 0.9 * uK + uPulse);
    // chispas que giran alrededor
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float sa = h1(fi + 11.0) * TAU + t * (0.05 + 0.12 * h1(fi + 5.0)) * (h1(fi + 3.0) > 0.5 ? 1.0 : -1.0);
      float sr = ${RS.toFixed(4)} * (1.12 + 0.9 * fract(t * (0.04 + 0.05 * h1(fi + 9.0)) + h1(fi)));
      vec2 sp = vec2(cos(sa), sin(sa)) * sr;
      float sd = length(q - sp);
      float sz = max(0.0016, px * 0.8);
      col += vec3(2.2, 1.4, 0.5) * exp(-sd * sd / (sz * sz)) * (1.2 - fract(t * 0.3 + fi * 0.37));
    }
    // EL CHOQUE (la pelea de Francisco y el Chiquitijuein, cada tanto): un
    // estallido de oro en abanico del lado del golpe, un rayo blanco violáceo
    // entre los dos, pedazos de aureola que salen despedidos y la sombra que
    // tira zarcillos más largos
    if (uClash > 0.002) {
      float cA = uClashA;
      vec2 cd = vec2(cos(cA), sin(cA));
      float dA = abs(wrapA(a - cA));
      float fan = exp(-dA * dA / 0.45) * fall * (0.3 + 0.7 * fall) * (0.5 + 0.5 * vn(ca * 9.0 + vec2(t * 0.3, 0.0)));
      col += vec3(2.4, 1.3, 0.35) * fan * uClash * 2.2;
      // el rayo: del centro del sol, por la sombra, hacia afuera, quebrado
      float along = dot(q, cd);
      float acr = dot(q, vec2(-cd.y, cd.x));
      float zz = (zig(along * 60.0, floor(t * 6.0)) * 0.012 + zig(along * 190.0, floor(t * 9.0) + 3.0) * 0.004) * smoothstep(0.0, 0.08, along);
      float bolt = line(abs(acr - zz), 0.0026, px) * step(0.0, along) * smoothstep(0.7, 0.5, along);
      col += vec3(1.6, 1.3, 2.4) * bolt * uClash * (0.6 + 0.4 * sin(t * 40.0));
      // pedazos de aureola despedidos (salen en abanico y se apagan)
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float pa = cA + (h1(fi + 41.0) - 0.5) * 1.4;
        float pr = ${RS.toFixed(4)} + (1.0 - uClash) * (0.2 + 0.45 * h1(fi + 17.0));
        vec2 pp = vec2(cos(pa), sin(pa)) * pr;
        float pd = length(q - pp);
        float psz = max(0.0025, px * 1.2);
        col += vec3(2.2, 1.5, 0.6) * exp(-pd * pd / (psz * psz)) * uClash * uClash * 2.0;
      }
    }
    // la sombra tira zarcillos violetas hacia afuera y apaga el oro que toca
    float am = ang(mq);
    vec2 cm = vec2(cos(am), sin(am));
    float ten = vn(cm * 7.0 + vec2(t * 0.06, 0.0));
    float dark = exp(-max(rm - ${RM.toFixed(4)}, 0.0) / (0.006 + 0.04 * ten * ten * ten + 0.02 * uK + 0.05 * uClash * ten)) * step(${RM.toFixed(4)}, rm);
    col = mix(col, col * 0.3 + vec3(0.12, 0.02, 0.22), dark * 0.75);
    // el sol (Francisco), con el borde más oscuro
    float sun = smoothstep(${RS.toFixed(4)} + px, ${RS.toFixed(4)} - px, r);
    vec3 sc = mix(vec3(0.85, 0.36, 0.06), vec3(1.35, 0.8, 0.22), smoothstep(${RS.toFixed(4)}, ${(RS * 0.2).toFixed(4)}, r));
    sc *= 0.85 + 0.15 * vn(q * 260.0 + vec2(t * 0.5, 0.0));
    col = mix(col, sc, sun);
    // la aureola rota
    float aa = (a + PI) / TAU * 9.0;
    float seg = floor(aa);
    float sf = fract(aa);
    float keep = step(0.12, sf) * step(sf, 0.88) * step(0.2, h1(seg + 3.0));
    float ro = ${(RS * 1.75).toFixed(4)} + (h1(seg) - 0.5) * 0.01 + (h1(seg + 1.0) - 0.5) * 0.003 * sin(t * 0.7 + seg);
    col += vec3(1.7, 1.05, 0.3) * line(r - ro, 0.0022, px) * keep * (1.0 + uPulse * 1.5);
    // el disco negro (el Chiquitijuein) y sus dos puntitos rojos
    float moon = smoothstep(${RM.toFixed(4)} + px, ${RM.toFixed(4)} - px, rm);
    vec3 mc = vec3(0.003, 0.0, 0.008) + vec3(0.2, 0.04, 0.35) * smoothstep(${(RM * 0.55).toFixed(4)}, ${RM.toFixed(4)}, rm) * 0.12;
    float blink = step(0.035, fract(t * 0.13 + 0.4));
    float es = max(0.0028, px * 0.8);
    vec2 e1 = uMoonOff + vec2(${(RM * 0.16).toFixed(4)}, ${(RM * 0.3).toFixed(4)});
    vec2 e2 = uMoonOff + vec2(${(RM * 0.16).toFixed(4)}, ${(-RM * 0.3).toFixed(4)});
    float eye = exp(-dot(q - e1, q - e1) / (es * es)) + exp(-dot(q - e2, q - e2) / (es * es));
    // (en la totalidad, el Chiquitijuein ganando: los ojos más prendidos)
    mc += vec3(3.2, 0.12, 0.04) * eye * blink * (0.8 + 0.2 * sin(t * 3.0)) * (0.85 + 0.9 * uK * uK);
    col = mix(col, mc, moon);
    // el diamante: el último pedazo de oro que asoma (más fuerte cerca de la totalidad)
    vec2 gq = q + uMoonU * ${(RS * 0.97).toFixed(4)};
    float gr = length(gq);
    float gs = max(0.0035, px);
    float glint = exp(-gr * gr / (gs * gs)) * 2.5 + exp(-abs(gq.x) / 0.0025 - abs(gq.y) / 0.05) + exp(-abs(gq.y) / 0.0025 - abs(gq.x) / 0.05);
    col += vec3(3.0, 2.4, 1.5) * glint * (0.2 + 1.3 * smoothstep(0.55, 0.97, uK) + uPulse);
    return col;
  }

  // ---------------- el vacío ----------------
  vec3 voidSky(vec3 d, vec3 haze, vec2 pA, vec2 pB, vec2 pC, float tB, vec3 fw, int oct) {
    float t = uTime;
    // el fondo: grietas de luz (los bordes de una red de celdas torcida, cada
    // tramo con su brillo: que no se lea como un panal)
    vec2 g = pC / 46.0 + vec2(t * 0.004, 0.0);
    g += (vec2(vn(g * 0.35 + 3.0), vn(g * 0.35 + 9.0)) - 0.5) * 1.6;
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    float f1 = 8.0, f2 = 8.0;
    vec2 c1 = gi, c2 = gi;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 pt = o + vec2(h2(gi + o), h2(gi + o + 7.3)) - gf;
        float dd = dot(pt, pt);
        if (dd < f1) { f2 = f1; c2 = c1; f1 = dd; c1 = gi + o; } else if (dd < f2) { f2 = dd; c2 = gi + o; }
      }
    }
    float edge = sqrt(f2) - sqrt(f1);
    float lw = max(0.03, fw.z / 46.0 * 1.6);
    // (el brillo de cada tramo: el de las dos celdas que separa)
    float eb = h2(c1 + c2 * 1.37);
    float web = (0.03 / lw) * exp(-edge / lw) * (eb > 0.35 ? 0.25 + eb : 0.06);
    float shim = 0.7 + 0.3 * sin(t * 1.7 + eb * 40.0);
    vec3 col = vec3(0.025, 0.004, 0.05) + vec3(1.1, 0.55, 1.9) * web * shim * uCrack * 0.5;
    col += vec3(0.25, 0.08, 0.45) * exp(-edge / 0.25) * 0.12 * uCrack;
    // el mar de nubes, con huecos por donde se ve el fondo
    vec2 drift = vec2(t * 0.003, t * 0.0015);
    float nb = fbm(pB * 0.011 + drift, fw.y * 0.011, oct);
    float hole = smoothstep(0.4, 0.29, nb);
    // el lado de cada nube que mira al eclipse, más claro (desde Media: una
    // lectura más corrida hacia la luz)
    vec2 ld = normalize(uE.xz + vec2(1e-4, 0.0)) * 0.55;
    float nl = oct >= 4 ? fbm(pB * 0.011 + drift + ld, fw.y * 0.011, oct - 1) : nb;
    float lit = clamp((nb - nl) * 5.0 + 0.5, 0.0, 1.0);
    // (lo alto de las nubes, más claro; el borde de los huecos, prendido desde abajo)
    vec3 sea = mix(vec3(0.028, 0.008, 0.065), vec3(0.27, 0.11, 0.42), smoothstep(0.36, 0.78, nb));
    sea = mix(sea * 0.55, sea * 1.3 + vec3(0.14, 0.07, 0.1) * smoothstep(0.5, 0.8, nb), lit);
    sea *= 0.8 + 0.4 * vn(pB * 0.05 + vec2(t * 0.01, 0.0));
    sea += vec3(0.5, 0.22, 0.85) * exp(-abs(nb - 0.35) * 22.0) * 0.22 * uCrack;
    sea *= 1.0 - 0.72 * uNight;
    col = mix(sea, col, hole);
    // jirones más arriba (se mueven distinto: la profundidad)
    float na = fbm(pA * vec2(0.02, 0.007) + vec2(-t * 0.006, 0.0), fw.x * 0.02, oct);
    float aa = smoothstep(0.52, 0.8, na) * 0.6;
    col = mix(col, vec3(0.4, 0.22, 0.52) * (0.8 + 0.4 * na) * (1.0 - 0.78 * uNight), aa);
    // lejos, la bruma violeta del vacío; pegado al horizonte, el horizonte de
    // cada cielo (los cielos se reflejan en el mar de nubes)
    vec3 vh = mix(vec3(0.07, 0.02, 0.13) * (1.0 - 0.7 * uNight), haze, smoothstep(-0.2, -0.005, d.y));
    float hz = 1.0 - exp(-tB / 900.0);
    return mix(col, vh, hz);
  }

  void main() {
    vec3 d = normalize(vPos);
    // (lo que usa derivadas, afuera de los if: el tamaño de un píxel en el cielo
    // y en cada plano del vacío)
    float px = max(length(fwidth(d)), 1e-5);
    float dn = max(-d.y, 2e-3);
    vec3 cam = cameraPosition;
    float tA = min(max(cam.y + 34.0, 1.0) / dn, 9000.0);
    float tB = min(max(cam.y + 62.0, 1.0) / dn, 9000.0);
    float tC = min(max(cam.y + 96.0, 1.0) / dn, 9000.0);
    vec2 pA = cam.xz + d.xz * tA;
    vec2 pB = cam.xz + d.xz * tB;
    vec2 pC = cam.xz + d.xz * tC;
    vec3 fw = vec3(length(fwidth(pA)), length(fwidth(pB)), length(fwidth(pC)));
    int oct = int(uQ);

    // dónde está respecto del eclipse
    float x0 = dot(d, uE);
    vec2 xe = vec2(dot(d, uEU), dot(d, uEV));
    float th = atan(length(xe), x0);
    float psi = ang(xe);
    float sth = max(sin(th), 0.08);

    // las grietas grandes y en qué cuña cae
    float best = 99.0;
    int wedge = 0;
    float crack = 0.0;
    float dMain = 9.0;
    float below = smoothstep(-0.12, 0.0, d.y);
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float jt = th * 6.0;
      float jag = (zig(jt + fk * 7.3, fk * 13.1) * 0.85 + zig(jt * 2.3 + fk * 3.1, fk * 5.7) * 0.15) * 0.04 * smoothstep(0.05, 0.5, th);
      float b = uWb[k] + CURL_K * th + jag / sth;
      float dp = wrapA(psi - b);
      if (dp >= 0.0 && dp < best) { best = dp; wedge = k; }
      float dist = abs(dp) * sth;
      dMain = min(dMain, dist);
      // un pulso de luz que corre por la grieta, cada tanto
      float pp = fract(uTime * 0.06 + h1(fk + 1.0)) * 2.8;
      float on = step(fract(uTime * 0.021 + h1(fk + 9.0)), 0.3);
      float pul = exp(-(th - pp) * (th - pp) / 0.01) * on * 2.5;
      float shim = 0.72 + 0.28 * sin(uTime * 2.1 + th * 31.0 + fk * 2.0);
      crack += line(dist, 0.0016, px) * (shim + pul) * smoothstep(0.075, 0.11, th);
    }
    int wid = int(uWid[wedge] + 0.5);

    // el casquete del cenit (la isla de la cámara) y la herida del eclipse (El Desgarro)
    vec2 dz = d.xz;
    float zc = atan(length(dz), d.y);
    float az = ang(dz);
    float capR = 0.56 + zigP((az + PI) / TAU * 17.0, 17.0, 4.0) * 0.026 + zigP((az + PI) / TAU * 41.0, 41.0, 9.0) * 0.005;
    float dCap = zc - capR;
    float woundR = 0.27 + zigP((psi + PI) / TAU * 13.0, 13.0, 2.0) * 0.03 + zigP((psi + PI) / TAU * 37.0, 37.0, 6.0) * 0.005;
    float dW = th - woundR;
    crack += line(abs(dCap), 0.0015, px) * (0.8 + 0.2 * sin(uTime * 1.6 + az * 17.0));
    crack += line(abs(dW), 0.0016, px) * 1.2 * (0.8 + 0.2 * sin(uTime * 2.4 + psi * 13.0));
    // grietas de telaraña: dos anillos alrededor del eclipse, a pedazos (no
    // adentro del cenit ni de la herida)
    float outside = smoothstep(0.0, 0.01, dCap) * smoothstep(0.0, 0.01, dW);
    for (int j = 0; j < 2; j++) {
      float fj = float(j);
      float rr = 0.62 + fj * 0.46 + zigP((psi + PI) / TAU * 26.0, 26.0, 20.0 + fj * 3.0) * 0.022;
      float keep = step(0.42, h1(float(wedge) * 3.7 + fj * 11.0));
      crack += line(abs(th - rr), 0.0011, px) * keep * 0.5 * outside;
    }
    // y alguna rama suelta adentro de cada cuña
    {
      float b0 = uWb[wedge];
      float b1 = uWb[wedge < 5 ? wedge + 1 : 0];
      float wd = wrapA(b1 - b0);
      wd = wd <= 0.0 ? wd + TAU : wd;
      float bm = b0 + wd * (0.35 + 0.3 * h1(float(wedge) + 21.0)) + CURL_K * th + zig(th * 7.0, float(wedge) * 5.0) * 0.03 / sth;
      float lo = 0.5 + 0.4 * h1(float(wedge) + 31.0);
      float span = smoothstep(lo, lo + 0.05, th) * smoothstep(lo + 0.75, lo + 0.45, th);
      crack += line(abs(wrapA(psi - bm)) * sth, 0.0011, px) * span * 0.45 * outside;
    }
    // el estallido (w.eclipse.pulse): un anillo de luz que sale del eclipse
    float pr = 0.1 + (1.0 - uPulse) * 1.7;
    crack += line(abs(th - pr), 0.004 + (1.0 - uPulse) * 0.01, px) * uPulse * uPulse * 1.6;
    crack *= below * (1.0 - uDim);
    // el brillo ancho alrededor de las grietas
    float glow = exp(-dMain / 0.011) * 0.24 + exp(-dMain / 0.05) * 0.05 + exp(-abs(dCap) / 0.012) * 0.16 + exp(-abs(dW) / 0.02) * 0.26;
    glow += exp(-abs(th - pr) / 0.06) * uPulse * 0.5 + uPulse * uPulse * 0.08;
    glow *= below;

    // el cielo de este píxel
    vec3 col;
    float stars = 0.0;
    vec3 zen = vec3(0.0, 1.0, 0.0);
    if (d.y >= 0.0) {
      vec4 s;
      if (dW < 0.0) s = secSky(7, d, uE, px, oct);
      else if (dCap < 0.0) {
        // (el remolino de la torre y la nebulosa del Desgarro, arriba de la
        // cabeza; el sol de La Tapera, el alba y la tarde quedan en su horizonte)
        int ca = int(uCapA + 0.5);
        int cb = int(uCapB + 0.5);
        s = secSky(ca, d, ca == 5 || ca == 7 ? zen : uFc[ca], px, oct);
        if (uCapMix > 0.002) s = mix(s, secSky(cb, d, cb == 5 || cb == 7 ? zen : uFc[cb], px, oct), uCapMix);
      } else s = secSky(wid, d, uFc[wid], px, oct);
      col = nightSky(s.rgb, d.y) * uDark;
      stars = s.a * smoothstep(0.0, 0.12, d.y) * (1.0 + 0.6 * uK) * (1.0 + 0.5 * uNight);
    } else {
      vec3 dh = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 1e-3, 0.0));
      vec3 haze = nightSky(secSky(wid, dh, uFc[wid], px, 2).rgb, 0.0) * uDark;
      col = voidSky(d, haze, pA, pB, pC, tB, fw, oct);
    }
    if (stars > 0.002) col += starLayer(d, px) * stars;
    // las grietas: núcleo blanco violáceo (con brillo) y el resplandor violeta
    col += vec3(1.3, 1.05, 1.9) * crack * uCrack * 1.25 + vec3(0.42, 0.13, 0.8) * glow * uCrack;
    // el eclipse
    if (th < 0.75 && uDim < 0.999) col = eclipse(col, xe / max(x0, 0.2), px);
    if (uDim > 0.002) col = mix(col, dimSky(d, px, oct), uDim);
    // relámpagos del clima, la luna roja (poco: los cielos son de cada isla) y la niebla
    col += uFlash * vec3(0.35, 0.4, 0.55) * 0.6 * smoothstep(-0.1, 0.3, d.y);
    col = mix(col, col * vec3(1.35, 0.7, 0.65), uBlood * 0.45);
    col = mix(col, uFogColor, uFogAmt * (1.0 - smoothstep(0.0, 0.7, d.y) * 0.5));
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`.replace(/CURL_K/g, CURL.toFixed(4));

// El área del sol que tapa el disco negro (círculos de radio r1 y r2 a distancia c).
function overlap(c, r1, r2) {
  if (c >= r1 + r2) return 0;
  if (c <= Math.abs(r2 - r1)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((c * c + r1 * r1 - r2 * r2) / (2 * c * r1));
  const b = r2 * r2 * Math.acos((c * c + r2 * r2 - r1 * r1) / (2 * c * r2));
  const s = 0.5 * Math.sqrt(Math.max(0, (-c + r1 + r2) * (c + r1 - r2) * (c - r1 + r2) * (c + r1 + r2)));
  return a + b - s;
}
// qué tan corrido está el disco negro para un k (0 apenas toca, 1 tapa todo)
const moonOff = (k) => (RS + RM) * (1 - k) * 0.93;
// cuánto sol se ve
const sunSeen = (k) => 1 - overlap(moonOff(k), RS, RM) / (Math.PI * RS * RS);
// la luz que llega: lo que asoma del sol y algo de la corona (determinista para cada k)
export const eclipseLight = (k) => 0.22 + 0.78 * sunSeen(k) + 0.18 * k;
const LIGHT_REF = eclipseLight(0.45);

export function buildEclipseSky(w) {
  const E = ECLIPSE_DIR.clone();
  // el marco del eclipse: U hacia el cenit, V de costado
  const up = new THREE.Vector3(0, 1, 0);
  const EU = up.clone().sub(E.clone().multiplyScalar(up.dot(E))).normalize();
  const EV = new THREE.Vector3().crossVectors(E, EU).normalize();
  const cx = SKY.center?.[0] ?? 75;
  const cz = SKY.center?.[1] ?? 75;
  // la dirección de cada isla desde el medio del mapa
  const dirOf = (id, y = 0) => {
    const I = ISLANDS[id];
    const v = new THREE.Vector3(I.center[0] - cx, 0, I.center[1] - cz);
    if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
    v.normalize();
    return v.multiplyScalar(Math.sqrt(1 - y * y)).setY(y);
  };
  const psiOf = (v) => Math.atan2(v.dot(EV), v.dot(EU));
  const thOf = (v) => Math.atan2(Math.hypot(v.dot(EU), v.dot(EV)), v.dot(E));
  // las cuñas, en orden alrededor del eclipse; cada grieta cae en el horizonte a
  // mitad de camino entre dos islas vecinas (corregida por la espiral)
  const ring = RING.filter((id) => ISLANDS[id]).map((id) => ({ id, psi: psiOf(dirOf(id)), az: Math.atan2(dirOf(id).z, dirOf(id).x) }));
  ring.sort((a, b) => a.psi - b.psi);
  const wb = [];
  const wid = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    let da = b.az - a.az;
    // (el lado corto alrededor del horizonte, en el sentido de las cuñas)
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const m = a.az + da / 2;
    const H = new THREE.Vector3(Math.cos(m), 0, Math.sin(m));
    // la grieta que empieza la cuña de b
    wb[(i + 1) % ring.length] = psiOf(H) - CURL * thOf(H);
  }
  for (let i = 0; i < ring.length; i++) wid[i] = ISLE_IDS.indexOf(ring[i].id);
  // (rotadas para que vayan en orden creciente: la cuña k va de wb[k] a wb[k+1])
  const order = wb.map((b, i) => ({ b: Math.atan2(Math.sin(b), Math.cos(b)), id: wid[i] })).sort((a, b) => a.b - b.b);
  const pal = [];
  const fc = [];
  const star = [];
  for (const id of ISLE_IDS) {
    for (const c of SKY_PAL[id]) pal.push(new THREE.Vector3(...c));
    fc.push(id === 'centro' ? new THREE.Vector3(0, 1, 0) : id === 'desgarro' ? E.clone() : dirOf(id, FEAT_H[id]));
    star.push(STARS[id] + (Math.max(STARS[id], 0.75) - STARS[id]) * SKY_NIGHT());
  }
  const uniforms = {
    // los del contrato (los escribe el clima en cada cuadro)
    uTime: { value: 0 },
    uCloud: { value: 0.15 },
    uFlash: { value: 0 },
    uBlood: { value: 0 },
    uFogAmt: { value: 0 },
    uFogColor: { value: new THREE.Color(0x1a1030) },
    uDay: { value: 0 },
    uSun: { value: new THREE.Vector3(-0.86, 0.1, -0.5).normalize() },
    uHorizon: { value: new THREE.Vector3(...SKY_PAL.desgarro[0]) },
    uZenith: { value: new THREE.Vector3(...SKY_PAL.desgarro[2]) },
    uGlow: { value: new THREE.Vector3(...SKY_PAL.desgarro[3]) },
    // los propios
    uE: { value: E },
    uEU: { value: EU },
    uEV: { value: EV },
    uK: { value: 0.45 },
    uPulse: { value: 0 },
    uCrack: { value: 1 },
    uDark: { value: 1 },
    uNight: { value: SKY_NIGHT() },
    uDim: { value: 0 },
    // el sol de La Tapera, más suave (globalThis.__mduOldTaperaSun: como antes)
    uSunSoft: { value: globalThis.__mduOldTaperaSun === true ? 1 : 0.45 },
    uClash: { value: 0 },
    uClashA: { value: 0 },
    uClashD: { value: new THREE.Vector2() },
    uQ: { value: 4 },
    uMoonOff: { value: new THREE.Vector2() },
    uMoonU: { value: MOON_U.clone().normalize() },
    uPal: { value: pal },
    uFc: { value: fc },
    uStar: { value: star },
    uWb: { value: order.map((o) => o.b) },
    uWid: { value: order.map((o) => o.id) },
    uCapA: { value: 0 },
    uCapB: { value: 0 },
    uCapMix: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    // (la dirección se normaliza en cada píxel: sin las aristas de la esfera)
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: FRAG,
  });
  // (radio 300: entero adentro del far de 400 de la cámara, mire para donde mire)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.matrixAutoUpdate = false;
  sky.name = 'eclipseSky';
  // centrado en la cámara que lo dibuja, sin girar
  sky.onBeforeRender = (_r, _s, cam) => {
    const e = cam.matrixWorld.elements;
    sky.position.set(e[12], e[13], e[14]);
    sky.matrixWorld.makeTranslation(e[12], e[13], e[14]);
  };
  w.sky = sky;
  w.root.add(sky);
  // la "luna" del contrato: el eclipse. Se dibuja en el domo; los sprites quedan
  // (escondidos) para lo que mira su posición o los apaga y prende
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.dot, color: 0xffd890, fog: false, depthWrite: false, transparent: true }));
  moon.scale.set(16, 16, 1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.dot, color: 0x8a5ab0, fog: false, depthWrite: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
  halo.scale.set(90, 90, 1);
  moon.visible = halo.visible = false;
  w.root.add(moon, halo);
  w.moonDir = E;
  w.moonSprite = moon;
  w.moonHalo = halo;

  // ---------------- w.eclipse: lo que maneja el easter egg ----------------
  const ecl = {
    k: 0.45,
    target: 0.45,
    speed: 0,
    pulseK: 0,
    // la pelea: el próximo choque (s), cuánto queda del actual (1 → 0), hacia
    // dónde se lanzó la sombra, y si el próximo es grande
    fightT: 12,
    clashK: 0,
    clashA: 0,
    clashBig: false,
    lunge: 0,
    // quién va ganando (-1 Francisco … 1 el Chiquitijuein; lo lleva world/eclipseGfxFight)
    lead: 0,
    // (globalThis.__mduNoSkyFight: la pelea quieta, como antes)
    // k de 0 (apenas se tocan) a 1 (totalidad), en secs segundos (0 = ya)
    set(k, secs = SET_SECS) {
      const v = Math.max(0, Math.min(1, +k || 0));
      this.target = v;
      if (!(secs > 0)) {
        this.k = v;
        this.speed = 0;
      } else this.speed = Math.abs(v - this.k) / secs;
    },
    // un estallido de una vez (la corona se enciende, las grietas brillan)
    pulse(amount = 1) {
      this.pulseK = Math.max(this.pulseK, Math.min(1.5, amount));
    },
    // la luz que da el eclipse ahora, relativa a la de siempre (k = 0.45)
    light() {
      return eclipseLight(this.k) / LIGHT_REF;
    },
    update(dt, t) {
      if (this.k !== this.target) {
        const step = (this.speed || 1) * dt;
        this.k = Math.abs(this.target - this.k) <= step ? this.target : this.k + Math.sign(this.target - this.k) * step;
      }
      this.pulseK = Math.max(0, this.pulseK - dt * 0.7);
      // la pelea: cada 14-30 s la sombra se lanza sobre el sol (un choque de
      // 2,5 s: estallido de oro, rayo, pedazos de aureola, sacudida y trueno
      // lejos); uno de cada cuatro es grande (la onda en las grietas también)
      const g = w.g;
      // (2026-10-10, el usuario: en la cinemática final "se oyó un cosmical
      // shockwave... el eclipse murió, ¿sigue habiendo choques en el cielo?". Sí:
      // con El Eclipse caído (k a 0: el disco se corrió del sol, San Lorenzo fase
      // 5 y el final) la pelea seguía, con su sacudida y su onda. Sin sombra sobre
      // el sol no hay choque. globalThis.__mduOldSkyFightEnd: como antes)
      const over = this.target <= 0.1 && globalThis.__mduOldSkyFightEnd !== true;
      if (globalThis.__mduNoSkyFight !== true && g?.state !== 'title' && this.k < 0.98 && !over) {
        this.fightT -= dt;
        if (this.fightT <= 0) {
          this.fightT = 14 + Math.random() * 16;
          this.clashK = 1;
          this.clashA = Math.random() * Math.PI * 2;
          // (si lo pidió alguien de afuera —la carga del Desgarro Cósmico—, grande)
          this.clashBig = this.bigNext === true || this.clashBig === true || Math.random() < 0.25;
          this.bigNext = false;
          this.lunge = 1;
          if (this.clashBig) this.pulse(0.7);
          g?.fx?.addShake?.(this.clashBig ? 0.35 : 0.15);
          if (g?.audio?.thunder && g.camera) {
            const far = E.clone().multiplyScalar(220).add(g.camera.position);
            const S = globalThis.__mduOldShockSfx !== true && g.audio.ctx ? eclSfx(g) : null;
            S?.load(['onda-choque']);
            const now = g.time || 0;
            // (en la entrada no: tiene la suya, en el primer choque)
            if (this.clashBig && !g.intro?.active && S?.has('onda-choque') && now - (this.shockAt ?? -1e9) >= SHOCK_GAP) {
              this.shockAt = now;
              S.play('onda-choque', { gain: 0.9, reverb: 0.45 });
              // (mientras la onda todavía suena —10 s—, ningún trueno encima)
            } else if (now - (this.shockAt ?? -1e9) > 10) g.audio.thunder(far, this.clashBig);
          }
        }
      }
      if (this.clashK > 0) {
        this.clashK = Math.max(0, this.clashK - dt / 2.5);
        if (this.clashK === 0) this.clashBig = false;
      }
      if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt / 1.2);
      const k = this.k;
      const p = Math.min(1, this.pulseK);
      uniforms.uK.value = k;
      uniforms.uPulse.value = p;
      uniforms.uClash.value = this.clashK * this.clashK;
      uniforms.uClashA.value = this.clashA;
      // la tironeada: el disco negro se sacude apenas (menos en la totalidad) y
      // en el choque se lanza hacia adelante y retrocede
      const lg = Math.sin(this.lunge * Math.PI) * 0.035 * (1 - k * 0.6);
      // quién va ganando la pelea (world/eclipseGfxFight: lead > 0, el
      // Chiquitijuein): el disco muerde más o retrocede (menos cerca de la totalidad)
      const ld = globalThis.__mduNoSkyFight === true ? 0 : this.lead || 0;
      const off = moonOff(k) * (1 - 0.3 * ld * (1 - k)) + Math.sin(t * 0.31) * 0.0018 * (1 - k) + Math.sin(t * 1.7) * 0.0006 * (1 - k) - lg;
      uniforms.uMoonOff.value.copy(uniforms.uMoonU.value).multiplyScalar(off);
      uniforms.uClashD.value.set(Math.cos(this.clashA) * lg, Math.sin(this.clashA) * lg);
      // (sesión 1f: las grietas en reposo pintaban de violeta todas las islas y
      // tapaban el tinte de cada una; los pulsos y el choque siguen enteros.
      // __mduNoEclMood: como antes)
      const ck = globalThis.__mduNoEclMood === true ? [0.85, 1.4] : [0.42, 1.0];
      uniforms.uCrack.value = ck[0] + ck[1] * k * k + 1.4 * p + 0.5 * this.clashK;
      // (la luz parpadea en el choque)
      uniforms.uDark.value = (1 - 0.42 * smoothstep(0.45, 1, k)) * (1 - 0.2 * this.clashK * (0.5 + 0.5 * Math.sin(t * 23)));
    },
  };
  w.eclipse = ecl;
  // las figuras y los tiros de la pelea (world/eclipseGfxFight.js, grafica-v3)
  // (el usuario, 2026-10-06: "la pelea con Francisco en el cielo sacala, dejá
  // el solcito y la luna, se ven horribles": sin figuras ni tiros; el sol y la
  // luna siguen con sus choques. globalThis.__mduSkyFightOn = true: la pelea)
  const fight = globalThis.__mduSkyFightOn === true ? buildSkyFight(w, ecl, { E, EU, EV, uniforms }) : { update() {}, dispose() {} };
  w.eclipseFight = fight;
  const prev = w.extraUpdate;
  const tmp = new THREE.Vector3();
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    ecl.update(dt, t);
    fight.update(dt, t);
    // los sprites del contrato, en la dirección del eclipse desde la cámara
    const cam = w.g.camera;
    if (cam) {
      tmp.copy(E).multiplyScalar(260).add(cam.position);
      moon.position.copy(tmp);
      halo.position.copy(tmp);
    }
  };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// La luz del eclipse y su sombra (World.buildLights): apunta a la altura media
// de las islas y el cuadro de la sombra tapa la huella entera, de la isla más
// baja al techo más alto (las alturas salen del config, no van escritas acá).
export function eclipseShadow(moon) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  // (mundo, it. 4: La Disformidad, la dimensión de afuera, no entra: está 60 m más arriba y lejos)
  for (const [id, I] of Object.entries(ISLANDS)) {
    if (id === 'abismo' || id === 'grietas') continue;
    const [a, b, c, d] = I.box;
    x0 = Math.min(x0, a);
    z0 = Math.min(z0, b);
    x1 = Math.max(x1, c + 1);
    z1 = Math.max(z1, d + 1);
  }
  for (const Z of Object.values(ZONES)) {
    if (!Z.isla || Z.isla === 'abismo' || Z.isla === 'grietas') continue;
    const ys = [Z.y || 0, ...(Z.rects || []).map((r) => r[4] ?? Z.y ?? 0)];
    y0 = Math.min(y0, ...ys);
    // (lo techado hasta su techo; lo abierto, paredes y barandas de unos 4 m)
    y1 = Math.max(y1, Z.roof ?? Math.max(...ys) + 4);
  }
  if (!Number.isFinite(y0)) {
    y0 = 0;
    y1 = 20;
  }
  // (abajo de cada isla cuelga su roca: unos metros más)
  y0 -= 3;
  const C = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  // (la dirección que ya trae la luz: la del eclipse, o la del cielo de siempre con __mduNoEclipseSky)
  const L = moon.position.clone().sub(moon.target.position).normalize();
  // el cuadro de la sombra mirado desde la luz: las 8 esquinas de la huella
  const fwd = L.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const upv = new THREE.Vector3().crossVectors(right, fwd).normalize();
  let hx = 0, hy = 0, dMin = Infinity, dMax = -Infinity;
  const p = new THREE.Vector3();
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    p.set(x, y, z).sub(C);
    hx = Math.max(hx, Math.abs(p.dot(right)));
    hy = Math.max(hy, Math.abs(p.dot(upv)));
    const dd = p.dot(fwd);
    dMin = Math.min(dMin, dd);
    dMax = Math.max(dMax, dd);
  }
  const back = -dMin + 12;
  moon.target.position.copy(C);
  moon.position.copy(C).addScaledVector(L, back);
  const sc = moon.shadow.camera;
  const half = Math.ceil(Math.max(hx, hy) + 2);
  sc.left = -half;
  sc.right = half;
  sc.top = half;
  sc.bottom = -half;
  sc.near = 1;
  sc.far = Math.ceil(back + dMax + 8);
  sc.updateProjectionMatrix();
  return { center: C, half, far: sc.far, box: [x0, y0, z0, x1, y1, z1] };
}
