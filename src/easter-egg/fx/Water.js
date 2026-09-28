import * as THREE from 'three';
import { ZONES } from '../config/map';

// El agua de los mapas que la tienen (el río del penal, los esteros): una sola
// superficie a la altura `level` que sigue a la cámara. Lo que tiene:
//  - oleaje: unas pocas ondas largas que crecen con el viento y la tormenta
//    (la misma cuenta en la placa y acá: heightAt sirve para flotar y nadar);
//  - rizos finos que corren con la corriente (dos capas de una textura de
//    normales que se arma una sola vez en la placa);
//  - ondas de verdad: una simulación de la ecuación de onda en una grilla que
//    sigue a la cámara. Las hacen los que caminan o nadan en el agua, las
//    balas, las explosiones, el bote y el agua que hierve, y rebotan en la orilla;
//  - reflejo: de Alta para arriba un espejo (la escena vista desde abajo del
//    agua); en las demás, el cielo (un cubo chiquito que se rehace cada tanto);
//  - profundidad: el fondo se ve donde hay poca agua y se pierde en lo hondo
//    (un mapa de profundidad que se arma al cargar el mapa);
//  - el camino de luz de la luna y el brillo de cada lámpara: es la luz de
//    three sobre un material muy liso con esas normales. La espuma, aparte.
// Desde abajo (buceando) se ve la ventana de Snell: el cielo chiquito y, afuera,
// el agua oscura que hace de espejo.
// g.water: update(dt), ripple, splash, wake, shot/hitRay, blast, under,
// boil/heatAt, heightAt, depthAt y level.

// Lo que cambia con la calidad: la grilla de las ondas (texeles y metros que
// cubre alrededor de la cámara) y el espejo (fracción de la pantalla; 0 = sin
// espejo, refleja el cielo).
const TIER = {
  perf: { sim: 128, span: 36, refl: 0 },
  low: { sim: 192, span: 44, refl: 0 },
  medium: { sim: 256, span: 52, refl: 0 },
  high: { sim: 320, span: 60, refl: 0.35 },
  ultra: { sim: 448, span: 64, refl: 0.5 },
  epic: { sim: 512, span: 64, refl: 0.5 },
};
// la simulación avanza a paso fijo (a cualquier cantidad de cuadros)
const STEP = 1 / 60;
// ondas nuevas por paso (las más cercanas a la cámara)
const IMP = 48;
const BOILS = 6;
// la estela en V y las salpicaduras de las piernas: sólo los primeros WAKE_N que
// andan a menos de WAKE_R metros de la cámara (el jugador va primero); el agua
// que salta, a menos de SPRAY_R
const WAKE_N = 6;
const WAKE_R = 16;
const SPRAY_R = 14;
// m/s: qué tan rápido se abre un anillo
const WAVE_C = 1.3;
// m: lo más hondo que guarda el mapa de profundidad
const DMAX = 6;
// m: cuánto más arriba del nivel de siempre guarda el terreno (la creciente)
const HUP = 2.5;
// la capa del cielo (lo único que ve el cubo del reflejo barato)
const SKY_LAYER = 7;
// Oleaje: largo de onda (m), ángulo respecto del viento y parte de la altura.
const SWELL = [
  [13, -0.1, 0.42],
  [9.5, 0.35, 0.28],
  [6.2, -0.5, 0.18],
  [4.1, 0.95, 0.12],
];
// Rizos: largo de cada capa (m), así no se nota que se repite.
const DET_A = 7.3;
const DET_B = 2.3;

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpP = new THREE.Plane();
const tmpQ = new THREE.Vector4();
const tmpS = new THREE.Vector2();
const tmpCol = new THREE.Color();
const tmpSph = new THREE.Sphere();

// Un disco de anillos cada vez más separados: denso al lado de la cámara (el
// oleaje se ve bien de cerca) y grueso a lo lejos.
function radialGrid(segs = 128, rMax = 420) {
  const radii = [];
  for (let r = 0.3; r < rMax; r += Math.max(0.12, r * 0.07)) radii.push(r);
  radii.push(rMax);
  const pos = [0, 0, 0];
  for (const R of radii) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * R, 0, Math.sin(a) * R);
    }
  }
  const idx = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 0; i < radii.length - 1; i++) {
    const a0 = 1 + i * segs;
    const b0 = a0 + segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// Un generador de números fijo (la textura de rizos sale igual siempre).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// La textura de rizos: suma de ondas con números enteros de vueltas por lado
// (así empalma sin costura). Guarda la pendiente (x, z) y la altura, las dos
// con desvío 1: la fuerza se pone en el material.
const DET_FS = `
  precision highp float;
  varying vec2 vUv;
  uniform vec4 uW[64];
  uniform vec2 uNorm;
  void main() {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 64; i++) {
      vec4 w = uW[i];
      float a = 6.2831853 * dot(w.xy, vUv) + w.w;
      acc.z += w.z * sin(a);
      acc.xy += w.z * 6.2831853 * w.xy * cos(a);
    }
    gl_FragColor = vec4(acc.xy * uNorm.x, acc.z * uNorm.y, 1.0);
  }`;

// Un paso de la ecuación de onda. R: altura, G: la altura del paso anterior,
// B: espuma. La grilla sigue a la cámara (uShift corre lo guardado) y donde no
// hay agua la onda rebota.
const SIM_FS = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tPrev, tDepth;
  uniform vec2 uShift, uOrigin, uDN;
  uniform vec4 uDB;
  uniform float uTexel, uK, uDamp, uSpan, uFoamK, uLift;
  uniform vec4 uImp[${IMP}];
  uniform int uImpN;
  vec4 prev(vec2 uv) {
    vec2 q = uv + uShift;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0.0);
    return texture2D(tPrev, q);
  }
  void main() {
    vec4 s = prev(vUv);
    float l = prev(vUv - vec2(uTexel, 0.0)).r + prev(vUv + vec2(uTexel, 0.0)).r + prev(vUv - vec2(0.0, uTexel)).r + prev(vUv + vec2(0.0, uTexel)).r;
    float h = (2.0 * s.r - s.g + uK * (l - 4.0 * s.r)) * uDamp;
    float foam = s.b * uFoamK;
    vec2 wp = uOrigin + vUv * uSpan;
    for (int i = 0; i < ${IMP}; i++) {
      if (i >= uImpN) break;
      vec4 m = uImp[i];
      vec2 d = wp - m.xy;
      float w = exp(-dot(d, d) / (m.z * m.z));
      h += m.w * w;
      foam += abs(m.w) * w * 9.0;
    }
    // los bordes se tragan la onda (no rebota en el borde de la grilla)
    vec2 e = min(vUv, 1.0 - vUv);
    h *= mix(0.92, 1.0, smoothstep(0.0, 0.06, min(e.x, e.y)));
    // en la orilla rebota
    float dep = texture2D(tDepth, ((wp - uDB.xy) / uDB.z + 0.5) / uDN).r * ${(DMAX + HUP).toFixed(1)} - ${HUP.toFixed(1)} + uLift;
    if (dep < 0.02) { h = 0.0; foam *= 0.9; }
    h = clamp(h, -0.5, 0.5);
    gl_FragColor = vec4(h, s.r, min(foam, 3.0), 1.0);
  }`;

// Lo que se le agrega al material estándar (vértice y fragmento).
const VS_HEAD = `
  uniform float uT;
  uniform vec4 uSw[4];
  uniform vec4 uSwA;
  varying vec3 vWp;
  float wSwell(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 w = uSw[i];
      h += uSwA[i] * sin(w.z * dot(w.xy, p) - w.w * uT + float(i) * 1.7);
    }
    return h;
  }`;
const VS_BEGIN = `
  vec3 transformed = vec3( position );
  vec4 wq = modelMatrix * vec4( transformed, 1.0 );
  float wsh = wSwell( wq.xz );
  transformed.y += wsh;
  vWp = vec3( wq.x, wq.y + wsh, wq.z );`;

const FS_HEAD = `
  uniform float uT, uSimS, uSimTex, uSimOn, uSimK, uClear, uPlanar, uRain, uStorm, uLevel, uLift, uDistort;
  uniform vec4 uSw[4];
  uniform vec4 uSwA, uDet, uDB;
  uniform vec2 uFlowA, uFlowB, uSimO, uDN;
  uniform sampler2D tDet, tSim, tDepth, tRefl;
  uniform samplerCube tSky;
  uniform mat4 uReflMat;
  uniform vec4 uBoil[${BOILS}];
  uniform int uBoilN;
  uniform vec3 uFoamCol, uDeepCol, uHeatCol, uMoonDir, uMoonCol;
  varying vec3 vWp;
  float wHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // pendiente del oleaje (y su altura en h)
  vec2 wSwellG(vec2 p, out float h) {
    h = 0.0;
    vec2 g = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      vec4 w = uSw[i];
      float ph = w.z * dot(w.xy, p) - w.w * uT + float(i) * 1.7;
      h += uSwA[i] * sin(ph);
      g += uSwA[i] * w.z * cos(ph) * w.xy;
    }
    return g;
  }
  // gotas de lluvia: anillos que se abren (dos capas de celdas)
  vec2 wRain(vec2 p, float t) {
    vec2 g = vec2(0.0);
    for (int L = 0; L < 2; L++) {
      float sc = L == 0 ? 3.1 : 4.3;
      vec2 q = p * sc + float(L) * 13.7;
      vec2 c = floor(q);
      vec2 f = fract(q) - 0.5;
      float h = wHash(c + float(L) * 5.3);
      vec2 o = (vec2(wHash(c + 1.7), wHash(c + 9.2)) - 0.5) * 0.5;
      float life = fract(t * (1.1 + h * 0.6) + h * 9.1);
      vec2 d = f - o;
      float r = length(d);
      float x = r - life * 0.42;
      float ring = sin(x * 60.0) * exp(-x * x * 900.0) * (1.0 - life) * (1.0 - life);
      g += d / max(r, 1e-3) * ring;
    }
    return g;
  }`;

// después de las normales del material: la del agua (en vista)
const FS_NORMAL = `
  vec3 wV = normalize(cameraPosition - vWp);
  float wDist = length(cameraPosition - vWp);
  float wFar = smoothstep(15.0, 90.0, wDist);
  vec2 wP = vWp.xz;
  float wSh;
  vec2 wG = wSwellG(wP, wSh);
  vec3 wd1 = texture2D(tDet, (wP - uFlowA) / ${DET_A.toFixed(2)}).rgb;
  vec3 wd2 = texture2D(tDet, (mat2(0.8, -0.6, 0.6, 0.8) * wP - uFlowB) / ${DET_B.toFixed(2)}).rgb;
  wG += (wd1.xy * uDet.x + wd2.xy * uDet.y * (1.0 - wFar * 0.8)) * (1.0 - wFar * 0.5);
  float wFoam = 0.0;
  vec2 wSu = (wP - uSimO) / uSimS;
  if (uSimOn > 0.5 && wSu.x > 0.0 && wSu.y > 0.0 && wSu.x < 1.0 && wSu.y < 1.0) {
    vec2 e = min(wSu, 1.0 - wSu);
    float fade = smoothstep(0.0, 0.1, min(e.x, e.y));
    float hl = texture2D(tSim, wSu - vec2(uSimTex, 0.0)).r;
    float hr = texture2D(tSim, wSu + vec2(uSimTex, 0.0)).r;
    float hd = texture2D(tSim, wSu - vec2(0.0, uSimTex)).r;
    float hu = texture2D(tSim, wSu + vec2(0.0, uSimTex)).r;
    wG += vec2(hr - hl, hu - hd) / (2.0 * uSimTex * uSimS) * uSimK * fade;
    wFoam += min(texture2D(tSim, wSu).b, 1.0) * fade * 0.6;
  }
  if (uRain > 0.01) wG += wRain(wP, uT) * uRain * 0.22 * (1.0 - wFar);
  // el agua que hierve: burbujas que se inflan y revientan
  float wHeat = 0.0;
  for (int i = 0; i < ${BOILS}; i++) {
    if (i >= uBoilN) break;
    vec4 b = uBoil[i];
    wHeat = max(wHeat, b.w * (1.0 - smoothstep(b.z * 0.7, b.z, length(wP - b.xy))));
  }
  if (wHeat > 0.001) {
    for (int L = 0; L < 2; L++) {
      vec2 q = wP * (L == 0 ? 5.0 : 8.0) + float(L) * 3.3;
      vec2 c = floor(q);
      vec2 f = fract(q) - 0.5;
      float h = wHash(c);
      float life = fract(uT * (0.8 + h * 1.4) + h * 7.3);
      vec2 o = (vec2(wHash(c + 7.7), wHash(c + 3.1)) - 0.5) * 0.4;
      vec2 d = f - o;
      float r = length(d);
      float R = 0.1 + 0.28 * life;
      float dome = step(h, wHeat) * (1.0 - smoothstep(R * 0.4, R, r)) * (1.0 - life);
      wG += d / max(r, 1e-3) * dome * 1.4 * wHeat;
      wFoam += dome * 0.6;
    }
    wFoam += wHeat * 0.2;
  }
  // cuánta agua hay abajo (el fondo se ve en lo playo) y espuma en la orilla
  vec2 wDt = texture2D(tDepth, ((wP - uDB.xy) / uDB.z + 0.5) / uDN).rg;
  float wDep = max(0.0, wDt.r * ${(DMAX + HUP).toFixed(1)} - ${HUP.toFixed(1)} + uLift);
  wFoam += (1.0 - smoothstep(0.0, 0.09, wDep)) * smoothstep(-0.6, 1.2, wd1.z + wd2.z) * 0.3;
  // con tormenta, las crestas se rompen
  float wAmp = max(uSwA.x + uSwA.y + uSwA.z + uSwA.w, 1e-3);
  wFoam += uStorm * smoothstep(0.45, 1.0, wSh / wAmp) * smoothstep(0.0, 1.5, wd2.z + 0.8) * 0.5;
  wFoam = clamp(wFoam, 0.0, 1.0);
  wG = clamp(wG, vec2(-3.0), vec2(3.0));
  vec3 wN = normalize(vec3(-wG.x, 1.0, -wG.y));
  if (!gl_FrontFacing) wN = -wN;
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`;

// el agua refleja poco de frente (2%) y es lisa; lejos, un poco menos
const FS_PHYS = `
  material.specularColor = vec3(0.02);
  material.specularColorBlended = vec3(0.02);
  material.roughness = clamp(mix(0.055, 0.14, wFar) + wFoam * 0.5 + uRain * 0.03, 0.0525, 1.0);`;

// lo que refleja: el espejo o el cielo
const FS_REFL = `
  {
    vec3 wR = reflect(-wV, wN);
    vec3 wRefl;
    if (uPlanar > 0.5) {
      vec4 rp = uReflMat * vec4(wP.x, uLevel, wP.y, 1.0);
      vec2 ruv = rp.xy / max(rp.w, 1e-4) + wG * uDistort / (1.0 + wDist * 0.05);
      wRefl = texture2D(tRefl, clamp(ruv, vec2(0.002), vec2(0.998))).rgb;
    } else wRefl = textureCube(tSky, vec3(wR.x, max(wR.y, 0.02), wR.z)).rgb * (1.0 - wDt.g * 0.9);
    radiance = wRefl;
  }`;

// La salida con el alfa ya multiplicado: el cuerpo del agua tapa el fondo según
// la profundidad y el reflejo se suma siempre (en lo playo también brilla).
const FS_OUT = `
  float wNv = clamp(dot(wN, wV), 0.0, 1.0);
  float wFr = 0.02 + 0.98 * pow(1.0 - wNv, 5.0);
  float wA = 1.0 - exp(-wDep * (1.0 + 1.0 / max(wNv, 0.2)) * 0.5 * uClear);
  wA = max(wA, wFr);
  vec3 wCol = totalDiffuse * wA + totalSpecular + totalEmissiveRadiance;
  wCol = mix(wCol, uFoamCol * (0.55 + 0.45 * wNv), wFoam * 0.85);
  wA = mix(wA, 1.0, wFoam * 0.85);
  wCol += uHeatCol * wHeat;
  // el camino de la luna titila: puntitos de las olitas que en ese instante
  // miran justo a la luna (más grandes a lo lejos, para que no sean ruido)
  if (gl_FrontFacing) {
    float lobe = smoothstep(0.955, 0.998, dot(reflect(-wV, wN), uMoonDir));
    if (lobe > 0.0) {
      float cs = 0.12 * max(1.0, wDist / 6.0);
      vec2 q = wP / cs;
      vec2 c = floor(q);
      float h0 = wHash(c);
      float h = wHash(c + floor(uT * (4.0 + h0 * 4.0) + h0 * 9.0) * 1.37);
      // un puntito redondo y chico en su celda (no el cuadrado entero)
      vec2 f = fract(q) - 0.5 - (vec2(wHash(c + 3.3), wHash(c + 7.1)) - 0.5) * 0.5;
      float dot0 = exp(-dot(f, f) * 90.0);
      wCol += uMoonCol * step(0.975, h) * dot0 * lobe * (1.0 - wFoam) * 2.0;
    }
  }
  if (!gl_FrontFacing) {
    // desde abajo: por la ventana de Snell se ve el cielo; afuera, espejo oscuro
    vec3 wT = refract(-wV, wN, 1.33);
    float win = smoothstep(0.0, 0.25, dot(wT, wT));
    vec3 sky = textureCube(tSky, normalize(wT + vec3(0.0, 1e-3, 0.0))).rgb;
    // (el cielo de la ventana llega teñido del color del agua)
    wCol = mix(uDeepCol, mix(sky * 0.8, uDeepCol * 5.0, 0.3) + uDeepCol, win) + uFoamCol * wFoam * 0.3;
    wA = 1.0;
  }
  gl_FragColor = vec4(wCol, wA);`;

// la niebla, con el alfa ya multiplicado
const FS_FOG = `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor );
  #endif`;

export default class Water {
  // level: altura del agua. groundAt(x, z): altura del fondo o del piso más
  // bajo (sirve para la creciente); si no, depthAt(x, z): cuánta agua hay (0 = tierra).
  // roofAt(x, z): si hay techo arriba (ahí no se refleja el cielo).
  // bounds: [x0, z0, x1, z1] donde se mide la profundidad (afuera sigue la del borde).
  // body: color del agua; clear: cuánto se la traga lo hondo (por metro);
  // flow: la corriente (m/s); wind: de dónde viene el viento (radianes);
  // swell: cuánto oleaje (1 = el del río); under: color de abajo del agua.
  constructor(g, { level, groundAt, depthAt, roofAt, bounds, res = 0.5, body = 0x0e1c22, clear = 1.4, flow = [0.06, 0.025], wind = 0.6, swell = 1, under, heat = 0x7affb4 }) {
    this.g = g;
    this.isWater = true;
    // el nivel de siempre y el de ahora (la creciente lo sube y lo baja: setLevel)
    this.base = level;
    this.level = level;
    this.rise = null;
    this.groundFn = groundAt;
    this.depthFn = depthAt;
    this.roofFn = roofAt;
    this.t = 0;
    this.acc = 0;
    this.lastNow = 0;
    this.swellK = swell;
    this.amp = 0.012 * swell;
    this.flow = new THREE.Vector2(...flow);
    this.windA = wind;
    this.fA = new THREE.Vector2();
    this.fB = new THREE.Vector2();
    // ondas de un solo golpe [x, z, radio, altura] y las que se repiten cada paso
    this.imp = [];
    this.movers = [];
    this.wakes = [];
    this.boils = [];
    this.track = new WeakMap();
    this.waves = SWELL.map(([len, a, part], i) => {
      const k = (Math.PI * 2) / len;
      return { k, w: Math.sqrt(9.8 * k), dx: Math.cos(wind + a), dz: Math.sin(wind + a), part, ph: i * 1.7 };
    });
    this.bakeDepth(bounds, res);
    this.tierKey = null;
    this.tier = TIER.medium;
    this.texO = new THREE.Vector2(1e9, 1e9);
    this.lit = [0.5, 0.55, 0.6];
    this.skyT = 0;
    const u = (this.u = {
      uT: { value: 0 },
      uSw: { value: this.waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.w)) },
      uSwA: { value: new THREE.Vector4() },
      uDet: { value: new THREE.Vector4(0.05, 0.035, 0, 0) },
      uFlowA: { value: this.fA },
      uFlowB: { value: this.fB },
      tDet: { value: null },
      tSim: { value: null },
      uSimO: { value: new THREE.Vector2() },
      uSimS: { value: 1 },
      uSimTex: { value: 1 / 256 },
      uSimOn: { value: 0 },
      uSimK: { value: 1 },
      tDepth: { value: this.depthTex },
      uDB: { value: new THREE.Vector4(this.D.x0, this.D.z0, this.D.res, 0) },
      uDN: { value: new THREE.Vector2(this.D.nx, this.D.nz) },
      uClear: { value: clear },
      tRefl: { value: null },
      uReflMat: { value: new THREE.Matrix4() },
      uPlanar: { value: 0 },
      uDistort: { value: 0.06 },
      tSky: { value: null },
      uRain: { value: 0 },
      uStorm: { value: 0 },
      uLevel: { value: level },
      uLift: { value: 0 },
      uBoil: { value: Array.from({ length: BOILS }, () => new THREE.Vector4()) },
      uBoilN: { value: 0 },
      uFoamCol: { value: new THREE.Color(0.2, 0.22, 0.25) },
      uDeepCol: { value: under != null ? new THREE.Color(under) : new THREE.Color(body).multiplyScalar(1.5) },
      uHeatCol: { value: new THREE.Color(heat).multiplyScalar(0.05) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonCol: { value: new THREE.Color() },
    });
    this.underCol = u.uDeepCol.value.clone();
    // la niebla de abajo del agua: el color del agua, más claro (se tiene que ver algo)
    this.fogUnder = new THREE.Color(body).multiplyScalar(6);

    const m = new THREE.MeshStandardMaterial({ color: body, roughness: 0.06, metalness: 0, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    // (el reflejo es el nuestro: ni el del estudio ni el de la escena)
    m.envMapIntensity = 0;
    m.forceSinglePass = true;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    // fx/Surfaces no lo toca; fx/Epic no le suma sus reflejos en pantalla
    m.userData.noRelief = true;
    m.userData.water = true;
    m.customProgramCacheKey = () => 'water1';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VS_HEAD}`).replace('#include <begin_vertex>', VS_BEGIN);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FS_HEAD}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FS_NORMAL}`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FS_PHYS}`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${FS_REFL}`)
        .replace('#include <opaque_fragment>', FS_OUT)
        .replace('#include <fog_fragment>', FS_FOG);
    };
    this.mat = m;
    const mesh = new THREE.Mesh(radialGrid(), m);
    mesh.position.set((bounds[0] + bounds[2]) / 2, level, (bounds[1] + bounds[3]) / 2);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    // primero entre los transparentes: si no, según dónde estés tapa los haces del faro y titilan
    mesh.renderOrder = -1;
    mesh.onBeforeRender = (renderer, scene, camera, geo, material) => {
      // (fx/Epic la dibuja con otro material para el G-buffer; el espejo, sin ella)
      if (material !== m || camera === this.mirror || this.busy) return;
      // (ya pasó antes del mundo, prerender: acá queda el cielo del reflejo barato)
      if (this.pre === camera) this.skyNested(renderer, scene, camera);
      else this.frame(renderer, scene, camera);
    };
    this.mesh = mesh;
  }

  // ---------------- profundidad ----------------
  // Guarda base - fondo (negativo en tierra, hasta HUP arriba: la creciente la
  // tapa) y si hay techo. R: la profundidad, G: el techo.
  bakeDepth([x0, z0, x1, z1], res) {
    const nx = Math.ceil((x1 - x0) / res) + 1;
    const nz = Math.ceil((z1 - z0) / res) + 1;
    const dep = new Float32Array(nx * nz);
    const tex = new Uint8Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * res;
        const z = z0 + j * res;
        let d;
        if (this.groundFn) {
          const gy = this.groundFn(x, z);
          d = Number.isFinite(gy) ? this.base - gy : -HUP;
        } else d = this.depthFn ? this.depthFn(x, z) || 0 : 0;
        d = Math.max(-HUP, Math.min(DMAX, d));
        const k = j * nx + i;
        dep[k] = d;
        tex[k * 2] = Math.round(((d + HUP) / (DMAX + HUP)) * 255);
        tex[k * 2 + 1] = this.roofFn?.(x, z) ? 255 : 0;
      }
    }
    this.D = { x0, z0, res, nx, nz, dep };
    const t = new THREE.DataTexture(tex, nx, nz, THREE.RGFormat, THREE.UnsignedByteType);
    t.unpackAlignment = 1;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this.depthTex = t;
  }

  // Cuánta agua hay en (x, z) ahora (0 = tierra).
  depthAt(x, z) {
    const D = this.D;
    const fx = Math.max(0, Math.min(D.nx - 1.001, (x - D.x0) / D.res));
    const fz = Math.max(0, Math.min(D.nz - 1.001, (z - D.z0) / D.res));
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const k = j * D.nx + i;
    const a = D.dep[k];
    const b = D.dep[k + 1];
    const c = D.dep[k + D.nx];
    const d = D.dep[k + D.nx + 1];
    return Math.max(0, (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v + this.level - this.base);
  }

  // La creciente: el agua sube (o baja) hasta y en secs segundos. Llamarla
  // de nuevo con el mismo destino no hace nada (la manda el anfitrión).
  setLevel(y, secs = 4) {
    if (this.rise ? this.rise.to === y : this.level === y) return;
    const now = this.g.time || 0;
    this.rise = { from: this.level, to: y, t0: now, dur: Math.max(0.01, secs) };
  }

  // La superficie en (x, z), con el oleaje (lo mismo que dibuja la placa).
  heightAt(x, z) {
    let h = this.level;
    const A = this.u.uSwA.value;
    const amps = [A.x, A.y, A.z, A.w];
    for (let i = 0; i < 4; i++) {
      const w = this.waves[i];
      h += amps[i] * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * this.t + w.ph);
    }
    return h;
  }

  // ¿El punto está abajo del agua?
  under(p) {
    return p.y < this.level - 0.01 && this.depthAt(p.x, p.z) > 0.03;
  }

  // Dónde un rayo toca el agua (t) o null. Sirve de arriba y de abajo.
  hitRay(o, d, maxT = Infinity) {
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (this.level - o.y) / d.y;
    if (t < 0 || t > maxT) return null;
    if (this.depthAt(o.x + d.x * t, o.z + d.z * t) < 0.03) return null;
    return t;
  }

  // ---------------- lo que mueve el agua ----------------
  // Una onda: strength 0..1 (1 = alguien que se tira), radius en metros.
  ripple(x, z, strength = 0.5, radius = 0.4) {
    this.imp.push(x, z, radius, -0.025 * strength);
  }

  // Una bala que pega en el agua: un chorrito y una onda.
  shot(o, d, maxT) {
    const t = this.hitRay(o, d, maxT);
    if (t === null) return false;
    this.splash(o.x + d.x * t, o.z + d.z * t, 0.22);
    return true;
  }

  // Una explosión: si es en el agua (o apenas arriba), la levanta. Devuelve si
  // fue adentro del agua (no deja quemadura en el fondo).
  blast(p, radius = 3) {
    if (this.depthAt(p.x, p.z) < 0.05 || p.y > this.level + radius * 0.5) return false;
    this.splash(p.x, p.z, Math.max(0.8, Math.min(3, radius / 2)));
    return p.y < this.level + 0.3;
  }

  // Salpicón: power 0.2 (una bala) .. 1 (alguien que cae) .. 3 (una granada).
  // sound: false para los que se repiten mucho (las brazadas de los muertos).
  splash(x, z, power = 1, { sound = true } = {}) {
    if (this.depthAt(x, z) < 0.03) return;
    const y = this.heightAt(x, z);
    const P = Math.min(power, 3);
    this.imp.push(x, z, 0.18 + 0.3 * P, -0.05 * P);
    const fx = this.g.fx;
    if (fx) {
      const c = this.lit;
      const sq = Math.sqrt(P);
      const n = Math.round(6 + 20 * P);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.5 + Math.random() * 1.4) * sq;
        const up = (2 + Math.random() * 3) * sq;
        fx.alpha.spawn(x + Math.cos(a) * 0.08 * sq, y + 0.02, z + Math.sin(a) * 0.08 * sq, Math.cos(a) * s, up, Math.sin(a) * s, {
          color: c,
          size: 0.03 + Math.random() * 0.04 * sq,
          size1: 0.015,
          life: 0.45 + Math.random() * 0.45 * sq,
          alpha: 0.8,
          gravity: 9.8,
        });
      }
      // lo grande: una columna de agua que sube y cae
      if (P > 1) {
        for (let i = 0; i < 24 * (P - 0.6); i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.4 * P;
          fx.alpha.spawn(x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, Math.cos(a) * 0.8, 4 + Math.random() * 4 * sq, Math.sin(a) * 0.8, {
            color: c,
            size: 0.12 + Math.random() * 0.12,
            size1: 0.05,
            life: 0.8 + Math.random() * 0.6,
            alpha: 0.55,
            gravity: 9.8,
            drag: 0.3,
          });
        }
      }
      // la nube de gotitas que queda flotando
      for (let i = 0; i < 2 + P * 4; i++) {
        const a = Math.random() * Math.PI * 2;
        fx.alpha.spawn(x, y + 0.15 * P, z, Math.cos(a) * 0.9 * sq, 0.5 + Math.random() * sq, Math.sin(a) * 0.9 * sq, {
          color: [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9],
          size: 0.15 * sq,
          size1: 0.8 * P,
          life: 0.9 + Math.random() * 0.6,
          alpha: 0.1,
          drag: 1.6,
          gravity: -0.2,
        });
      }
    }
    const A = this.g.audio;
    if (sound && A?.ctx) {
      const o = A.out({ pos: tmpV.set(x, y, z), gain: Math.min(1, 0.18 + P * 0.3), reverb: 0.25 });
      A.noise(o, { dur: 0.18 + P * 0.18, freq: 1600, freqEnd: 350, gain: 0.7, attack: 0.004 });
      if (P > 0.8) A.noise(o, { t: A.now + 0.06, dur: 0.5 + P * 0.35, freq: 800, freqEnd: 160, gain: 0.55, brown: true });
    }
  }

  // Un bote en marcha (cada cuadro): empuja agua con la proa y deja la estela.
  wake(x, z, dx, dz, speed, len = 2.6) {
    const s = Math.min(Math.abs(speed), 8);
    if (s < 0.3) return;
    const f = Math.sign(speed) || 1;
    this.wakes.push(x + dx * len * f, z + dz * len * f, 0.55, 0.0016 * s);
    this.wakes.push(x - dx * len * f, z - dz * len * f, 0.8, -0.0026 * s);
    this.wakes.push(x - dz * 0.9, z + dx * 0.9, 0.5, -0.0008 * s);
    this.wakes.push(x + dz * 0.9, z - dx * 0.9, 0.5, -0.0008 * s);
  }

  // El agua hierve en un círculo durante unos segundos (la pava del mapa).
  boil(x, z, r = 3, secs = 6) {
    const now = this.g.time || 0;
    const old = this.boils.find((b) => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 0.5);
    if (old) {
      old.x = (old.x + x) / 2;
      old.z = (old.z + z) / 2;
      old.r = Math.max(old.r, r);
      old.t1 = Math.max(old.t1, now + secs);
      return;
    }
    if (this.boils.length >= BOILS) this.boils.shift();
    this.boils.push({ x, z, r, t0: now, t1: now + secs, sndT: 0 });
  }

  boilK(b) {
    const now = this.g.time || 0;
    const up = Math.min(1, (now - b.t0) / 0.6);
    const down = now > b.t1 ? 1 - (now - b.t1) / 2 : 1;
    return Math.max(0, Math.min(up, down));
  }

  // Qué tan caliente está el agua en (x, z): 0..1 (lo usa el arma para quemar).
  heatAt(x, z) {
    let h = 0;
    for (const b of this.boils) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d >= b.r) continue;
      const e = Math.min(1, Math.max(0, (b.r - d) / (b.r * 0.3)));
      h = Math.max(h, this.boilK(b) * e * e * (3 - 2 * e));
    }
    return h;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    if (this.rise) {
      const R = this.rise;
      const k = Math.min(1, ((g.time || 0) - R.t0) / R.dur);
      this.level = R.from + (R.to - R.from) * k * k * (3 - 2 * k);
      if (k >= 1) this.rise = null;
      this.u.uLevel.value = this.level;
      this.u.uLift.value = this.level - this.base;
      if (this.simMat) this.simMat.uniforms.uLift.value = this.level - this.base;
    }
    const W = g.weather?.cur;
    const storm = W?.storm || 0;
    const wind = W?.wind || 0;
    // el oleaje sube de a poco con el viento y la tormenta
    const target = (0.012 + wind * 0.04 + storm * 0.24) * this.swellK;
    this.amp += (target - this.amp) * Math.min(1, dt * 0.4);
    const A = this.u.uSwA.value;
    A.set(this.amp * this.waves[0].part, this.amp * this.waves[1].part, this.amp * this.waves[2].part, this.amp * this.waves[3].part);
    const det = this.u.uDet.value;
    det.x = 0.05 + wind * 0.03 + storm * 0.09;
    det.y = 0.035 + wind * 0.03 + storm * 0.06;
    this.gust = 1 + wind * 1.5 + storm * 2.5;
    this.u.uRain.value = W?.rain || 0;
    this.u.uStorm.value = storm;

    // los que andan por el agua
    const M = this.movers;
    M.length = 0;
    this.nearN = 0;
    const P = g.player;
    if (P?.pos && P.alive !== false) this.mover(P, P.pos, dt, 0.32);
    if (g.net?.remote) for (const r of g.net.remote.values()) if (r.pos && !r.dead) this.mover(r, r.pos, dt, 0.32);
    const pool = g.zombies?.pool;
    if (pool) for (const z of pool) if (z.active && !z.dead) this.mover(z, z.pos, dt, 0.3);
    // el jefe (no está en el pool): más grande, más ola
    const B = g.zombies?.boss;
    if (B?.active && !B.dead) {
      const s = (B.scale || 1.4) * (B.kind === 'luison' ? 1.3 : 1);
      this.mover(B, B.pos, dt, 0.24 * s, s);
    }
    // los botes (llaman a wake cada cuadro)
    for (let i = 0; i < this.wakes.length; i++) M.push(this.wakes[i]);
    this.wakes.length = 0;

    // el agua que hierve: vapor, burbujas y su ruido
    const boils = this.u.uBoil.value;
    let nb = 0;
    for (let i = this.boils.length - 1; i >= 0; i--) {
      const b = this.boils[i];
      const k = this.boilK(b);
      if (k <= 0 && (g.time || 0) > b.t1) {
        this.boils.splice(i, 1);
        continue;
      }
      boils[nb++].set(b.x, b.z, b.r, k);
      this.boilFx(b, k, dt);
    }
    this.u.uBoilN.value = nb;

    // abajo del agua: todo verdoso y a pocos metros
    if (P?.underwater) {
      const f = g.scene.fog;
      const k = Math.min(1, (P.swimDepth || 0) / 4);
      if (f) {
        const moon = g.world?.moon;
        f.color.copy(this.fogUnder).multiplyScalar(1 - k * 0.5);
        if (moon) f.color.add(tmpCol.copy(moon.color).multiplyScalar(moon.intensity * 0.016));
        f.density = 0.13 + k * 0.08;
      }
    }
  }

  // Alguien en el agua: cuanto más rápido va, más onda hace (y espuma).
  // k: el tamaño (1 una persona; el jefe más). Cerca de la cámara, además, la
  // estela en V (la ola que empuja adelante y los dos brazos que abre atrás) y,
  // vadeando, el agua que salta de las piernas.
  mover(key, p, dt, r, k = 1) {
    const lv = this.level;
    const dep = this.depthAt(p.x, p.z);
    if (p.y > lv + 0.3 || p.y + 1.9 * k < lv - 0.3 || dep < 0.04) {
      this.track.delete(key);
      return;
    }
    let last = this.track.get(key);
    if (!last) {
      last = { x: p.x, z: p.z, sprayT: 0 };
      this.track.set(key, last);
      return;
    }
    const mx = p.x - last.x;
    const mz = p.z - last.z;
    const sp = Math.min(8, Math.hypot(mx, mz) / Math.max(dt, 1e-3));
    last.x = p.x;
    last.z = p.z;
    if (sp < 0.2) return;
    this.movers.push(p.x, p.z, r, -(0.0012 + 0.0014 * sp) * k);
    const cam = this.g.camera?.position;
    if (!cam || sp < 0.8 || this.nearN >= WAKE_N) return;
    const cd = Math.hypot(cam.x - p.x, cam.z - p.z);
    if (cd > WAKE_R * k) return;
    this.nearN++;
    const l = Math.hypot(mx, mz);
    const dx = mx / l;
    const dz = mz / l;
    // la ola de adelante y los dos hombros de atrás (de ahí sale la V)
    this.movers.push(p.x + dx * r * 1.6, p.z + dz * r * 1.6, r * 1.1, 0.0009 * sp * k);
    const bx = p.x - dx * r * 1.2;
    const bz = p.z - dz * r * 1.2;
    this.movers.push(bx - dz * r * 1.4, bz + dx * r * 1.4, r * 0.9, -0.0006 * sp * k);
    this.movers.push(bx + dz * r * 1.4, bz - dx * r * 1.4, r * 0.9, -0.0006 * sp * k);
    // vadeando (no nadando): el agua que salta de las piernas, cada tanto
    const fx = this.g.fx;
    const tier = this.tierKey;
    if (!fx || tier === 'perf' || sp < 1.2 || dep > 1.1 * k || cd > SPRAY_R) return;
    last.sprayT -= dt;
    if (last.sprayT > 0) return;
    last.sprayT = (0.08 + Math.random() * 0.06) * (tier === 'low' ? 2 : 1);
    const c = this.lit;
    const y = this.heightAt(p.x, p.z) + 0.02;
    const hx = p.x + dx * r;
    const hz = p.z + dz * r;
    const n = Math.min(8, 3 + sp * 0.8) * k;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const s = 0.3 + Math.random() * 0.8;
      fx.alpha.spawn(hx + (Math.random() - 0.5) * r, y, hz + (Math.random() - 0.5) * r, dx * sp * 0.35 - dz * side * s, 1.2 + Math.random() * 1.4 * Math.sqrt(k), dz * sp * 0.35 + dx * side * s, {
        color: c,
        size: 0.035 + Math.random() * 0.04,
        size1: 0.015,
        life: 0.4 + Math.random() * 0.35,
        alpha: 0.75,
        gravity: 9.8,
      });
    }
    // la espuma que se abre a los costados, chata sobre el agua
    fx.alpha.spawn(hx, y + 0.03, hz, dx * sp * 0.2, 0.15, dz * sp * 0.2, {
      color: [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9],
      size: 0.12 * k,
      size1: 0.5 * k,
      life: 0.7,
      alpha: 0.17,
      drag: 2,
      gravity: 0.2,
    });
  }

  boilFx(b, k, dt) {
    const fx = this.g.fx;
    const n = k * b.r * b.r * dt * 6;
    // el vapor toma la luz de la luna (si no, de noche brilla solo)
    const L = this.lit;
    const col = [L[0] * 0.8 + 0.02, L[1] * 0.8 + 0.035, L[2] * 0.8 + 0.03];
    for (let i = 0; i < n || (i === 0 && Math.random() < n); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * b.r * 0.85;
      fx?.alpha.spawn(b.x + Math.cos(a) * r, this.level + 0.05, b.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3, {
        color: col,
        size: 0.25,
        size1: 1.5,
        life: 1.6 + Math.random(),
        alpha: 0.13,
        drag: 0.7,
        gravity: -0.25,
      });
    }
    // gorgoteo: golpecitos graves a cada rato
    b.sndT -= dt;
    const A = this.g.audio;
    if (b.sndT <= 0 && A?.ctx && k > 0.2) {
      b.sndT = 0.08 + Math.random() * 0.12;
      const o = A.out({ pos: tmpV.set(b.x + (Math.random() - 0.5) * b.r, this.level, b.z + (Math.random() - 0.5) * b.r), gain: 0.35 * k, reverb: 0.2 });
      A.noise(o, { dur: 0.06 + Math.random() * 0.08, type: 'bandpass', freq: 300 + Math.random() * 500, freqEnd: 900, q: 4, gain: 0.8 });
    }
  }

  // ---------------- en la placa ----------------
  // Justo antes de dibujarse (una vez por cuadro): avanza el agua, la grilla
  // de ondas, el cielo del reflejo barato y el espejo.
  frame(renderer, scene, camera) {
    const now = performance.now();
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    this.busy = true;
    const cur = renderer.getRenderTarget();
    if (!this.detRT) this.makeDetail(renderer);
    this.setTier(renderer);
    this.t += dt;
    const u = this.u;
    u.uT.value = this.t;
    // la corriente arrastra los rizos grandes; el viento, los chicos
    this.fA.addScaledVector(this.flow, dt);
    const gust = this.gust || 1;
    this.fB.x += Math.cos(this.windA) * 0.12 * gust * dt;
    this.fB.y += Math.sin(this.windA) * 0.12 * gust * dt;
    // la espuma y las gotas toman la luz de la luna
    const moon = this.g.world?.moon;
    if (moon) {
      u.uMoonDir.value.copy(moon.position).sub(moon.target.position).normalize();
      u.uMoonCol.value.copy(moon.color).multiplyScalar(moon.intensity);
      tmpCol.copy(moon.color).multiplyScalar(moon.intensity * 0.22);
      u.uFoamCol.value.setRGB(tmpCol.r + 0.03, tmpCol.g + 0.035, tmpCol.b + 0.04);
      const L = u.uFoamCol.value;
      const s = 2.2;
      this.lit[0] = Math.min(1, L.r * s);
      this.lit[1] = Math.min(1, L.g * s);
      this.lit[2] = Math.min(1, L.b * s);
    }
    // el disco sigue a la cámara (de a metro: el oleaje no tiembla)
    tmpC.setFromMatrixPosition(camera.matrixWorld);
    this.mesh.position.set(Math.round(tmpC.x), this.level, Math.round(tmpC.z));
    this.u.uLevel.value = this.level;
    this.mesh.updateMatrixWorld();
    this.simulate(renderer, dt, tmpC);
    this.skyT -= dt;
    if (this.skyT <= 0 && this.pre !== camera) {
      this.skyT = 0.25;
      this.skyCube(renderer, scene, tmpC);
    }
    // el espejo solo si se ve agua: bajo techo (la creciente adentro de las
    // casas) o mirando al cielo va el reflejo barato
    const zn = this.g.world?.zoneAt(tmpC.x, tmpC.z, tmpC.y);
    const indoor = !!zn && !!ZONES[zn] && !ZONES[zn].outdoor;
    if (this.tier.refl > 0 && tmpC.y > this.level + 0.05 && !indoor && this.seesWater(camera, tmpC)) {
      this.cullT = (this.cullT || 0) - dt;
      if (this.cullT <= 0) {
        this.cullT = 1;
        this.cullList(scene, tmpC);
      }
      this.reflect(renderer, scene, camera);
      u.uPlanar.value = 1;
    } else u.uPlanar.value = 0;
    renderer.setRenderTarget(cur);
    this.busy = false;
  }

  // Lo de frame() antes del mundo (PostFX.render, con las matrices del cuadro
  // ya puestas). Anidado adentro del dibujo del mundo, three arma otras luces
  // para el espejo y cada material del mapa volvía a buscar su programa en el
  // mundo y en el espejo: ~1 ms por cuadro en el estero. El cielo del reflejo
  // barato sigue anidado (skyNested): ve solo la capa del cielo, sin luces, y
  // afuera le cambiaría las luces al mundo.
  prerender(renderer, scene, camera) {
    let o = this.mesh;
    while (o.parent) {
      if (!o.visible) return;
      o = o.parent;
    }
    if (o !== scene || !this.mesh.layers.test(camera.layers)) return;
    this.pre = camera;
    this.frame(renderer, scene, camera);
  }

  skyNested(renderer, scene, camera) {
    if (this.skyT > 0) return;
    this.skyT = 0.25;
    this.busy = true;
    this.skyCube(renderer, scene, tmpC.setFromMatrixPosition(camera.matrixWorld));
    this.busy = false;
  }

  // ¿Algún rayo de abajo de la pantalla llega al agua antes del fondo de la vista?
  seesWater(camera, cp) {
    const h = cp.y - this.level;
    for (let i = -1; i <= 1; i++) {
      tmpV.set(i, -1, 0.5).unproject(camera).sub(cp).normalize();
      if (tmpV.y < -1e-3 && h / -tmpV.y < camera.far) return true;
    }
    return false;
  }

  // La textura de rizos (una vez).
  makeDetail(renderer) {
    const r = rng(9173);
    const W = [];
    let gs = 0;
    let hs = 0;
    for (let i = 0; i < 64; i++) {
      const ang = r() * Math.PI * 2;
      const mag = 1 + Math.floor(Math.pow(r(), 1.5) * 22);
      let kx = Math.round(Math.cos(ang) * mag);
      let ky = Math.round(Math.sin(ang) * mag);
      if (!kx && !ky) kx = 1;
      const km = Math.hypot(kx, ky);
      const amp = Math.pow(km, -1.8) * (0.6 + r() * 0.8);
      W.push(new THREE.Vector4(kx, ky, amp, r() * Math.PI * 2));
      gs += (amp * Math.PI * 2 * km) ** 2 / 2;
      hs += amp * amp / 2;
    }
    this.detRT = new THREE.WebGLRenderTarget(256, 256, {
      type: THREE.HalfFloatType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    this.detRT.texture.anisotropy = 8;
    const mat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: DET_FS, uniforms: { uW: { value: W }, uNorm: { value: new THREE.Vector2(1 / Math.sqrt(gs), 1 / Math.sqrt(hs)) } }, depthTest: false, depthWrite: false });
    this.quad(renderer, mat, this.detRT);
    mat.dispose();
    this.u.tDet.value = this.detRT.texture;
  }

  quad(renderer, mat, target) {
    if (!this.qScene) {
      this.qScene = new THREE.Scene();
      this.qMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      this.qMesh.frustumCulled = false;
      this.qScene.add(this.qMesh);
      this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    this.qMesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(this.qScene, this.qCam);
  }

  // Lo que depende de la calidad: la grilla de ondas y el espejo.
  setTier(renderer) {
    // (Personalizada: Game.tier('water'))
    const key = this.g.tier?.('water') || this.g.settings?.quality || 'medium';
    if (key === this.tierKey) return;
    this.tierKey = key;
    const T = (this.tier = TIER[key] || TIER.medium);
    for (const rt of this.simRT || []) rt.dispose();
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.simRT = [new THREE.WebGLRenderTarget(T.sim, T.sim, opt), new THREE.WebGLRenderTarget(T.sim, T.sim, opt)];
    const cc = renderer.getClearColor(tmpCol);
    const ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const rt of this.simRT) {
      renderer.setRenderTarget(rt);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(cc, ca);
    this.texO.set(1e9, 1e9);
    if (!this.simMat) {
      this.simMat = new THREE.ShaderMaterial({
        vertexShader: QUAD_VS,
        fragmentShader: SIM_FS,
        uniforms: {
          tPrev: { value: null },
          tDepth: { value: this.depthTex },
          uShift: { value: new THREE.Vector2() },
          uOrigin: { value: new THREE.Vector2() },
          uDB: this.u.uDB,
          uDN: this.u.uDN,
          uTexel: { value: 0 },
          uK: { value: 0 },
          uDamp: { value: 0.994 },
          uSpan: { value: 1 },
          uFoamK: { value: 0.985 },
          uLift: { value: this.level - this.base },
          uImp: { value: Array.from({ length: IMP }, () => new THREE.Vector4()) },
          uImpN: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
      });
    }
    const su = this.simMat.uniforms;
    su.uTexel.value = 1 / T.sim;
    su.uSpan.value = T.span;
    const c = (WAVE_C * STEP) / (T.span / T.sim);
    su.uK.value = c * c;
    this.u.uSimS.value = T.span;
    this.u.uSimTex.value = 1 / T.sim;
    this.u.uSimOn.value = 1;
    // el espejo
    if (!T.refl) {
      this.reflRT?.dispose();
      this.reflRT = null;
    }
  }

  // La grilla de ondas: sigue a la cámara (de a un texel) y avanza a paso fijo.
  simulate(renderer, dt, cp) {
    const T = this.tier;
    const dx = T.span / T.sim;
    const ox = Math.floor((cp.x - T.span / 2) / dx) * dx;
    const oz = Math.floor((cp.z - T.span / 2) / dx) * dx;
    this.acc = Math.min(this.acc + dt, STEP * 3);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(renderer, ox, oz);
    }
    this.u.tSim.value = this.simRT[0].texture;
    this.u.uSimO.value.copy(this.texO);
  }

  step(renderer, ox, oz) {
    const su = this.simMat.uniforms;
    const T = this.tier;
    su.uShift.value.set((ox - this.texO.x) / T.span, (oz - this.texO.y) / T.span);
    su.uOrigin.value.set(ox, oz);
    this.texO.set(ox, oz);
    // las ondas de este paso: primero las de un golpe, después las más cercanas
    const out = su.uImp.value;
    let n = 0;
    const x0 = ox - 1;
    const z0 = oz - 1;
    const x1 = ox + T.span + 1;
    const z1 = oz + T.span + 1;
    const take = (L) => {
      for (let i = 0; i < L.length && n < IMP; i += 4) {
        const x = L[i];
        const z = L[i + 1];
        if (x < x0 || z < z0 || x > x1 || z > z1) continue;
        out[n++].set(x, z, L[i + 2], L[i + 3]);
      }
    };
    take(this.imp);
    this.imp.length = 0;
    // las burbujas del agua que hierve
    for (const b of this.boils) {
      const k = this.boilK(b);
      for (let j = 0; j < 3 && n < IMP && k > 0.05; j++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * b.r * 0.8;
        out[n++].set(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, 0.15 + Math.random() * 0.15, (Math.random() < 0.5 ? -1 : 1) * 0.012 * k);
      }
    }
    // los que caminan (si son muchos, los más cercanos a la grilla del medio)
    const M = this.movers;
    if (n + M.length / 4 > IMP) {
      const cx = ox + T.span / 2;
      const cz = oz + T.span / 2;
      const idx = [];
      for (let i = 0; i < M.length; i += 4) idx.push(i);
      idx.sort((a, b) => (M[a] - cx) ** 2 + (M[a + 1] - cz) ** 2 - ((M[b] - cx) ** 2 + (M[b + 1] - cz) ** 2));
      for (const i of idx) {
        if (n >= IMP) break;
        const x = M[i];
        const z = M[i + 1];
        if (x < x0 || z < z0 || x > x1 || z > z1) continue;
        out[n++].set(x, z, M[i + 2], M[i + 3]);
      }
    } else take(M);
    su.uImpN.value = n;
    su.tPrev.value = this.simRT[0].texture;
    this.quad(renderer, this.simMat, this.simRT[1]);
    this.simRT.reverse();
  }

  // El cielo para el reflejo barato (solo el cielo, la luna y el halo: la capa SKY_LAYER).
  skyCube(renderer, scene, cp) {
    if (!this.cube) {
      this.cube = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      this.cubeCam = new THREE.CubeCamera(1, 1200, this.cube);
      for (const c of this.cubeCam.children) c.layers.set(SKY_LAYER);
      this.u.tSky.value = this.cube.texture;
    }
    const w = this.g.world;
    for (const o of [w?.sky, w?.moonSprite, w?.moonHalo, w?.sunSprite]) o?.layers.enable(SKY_LAYER);
    this.cubeCam.position.set(cp.x, this.level + 1, cp.z);
    this.cubeCam.updateMatrixWorld();
    this.cubeCam.update(renderer, scene);
  }

  // Lo que el espejo no dibuja (se revisa cada tanto: aparecen cosas nuevas):
  // lo de adentro de los edificios (se vería apenas por una puerta), lo que
  // quedó abajo del agua y lo chiquito que está lejos. Los instanciados
  // (muertos, juncos, piedras) sí. userData.reflect true/false lo fuerza.
  cullList(scene, cp) {
    const L = (this.hide ||= []);
    L.length = 0;
    const w = this.g.world;
    const lv = this.level;
    scene.traverse((o) => {
      if (!o.isMesh || o === this.mesh || o.userData.reflect === true) return;
      if (o.userData.reflect === false) {
        L.push(o);
        return;
      }
      if (o.isInstancedMesh) return;
      const geo = o.geometry;
      if (!geo?.attributes?.position) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const s = tmpSph.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld);
      if (s.radius > 6) return;
      const c = s.center;
      if (c.y + s.radius < lv) {
        L.push(o);
        return;
      }
      const zn = w?.zoneAt(c.x, c.z, c.y);
      // (lo chico solo de cerca: cada pieza suelta es una llamada más de
      // dibujo y en el reflejo movido no se distingue)
      const d2 = c.distanceToSquared(cp);
      if ((zn && ZONES[zn] && !ZONES[zn].outdoor) || (s.radius < 0.35 && d2 > 100) || (s.radius < 1 && d2 > 144)) L.push(o);
      // lo bajo y lejos de la orilla queda tapado por la barranca en el reflejo
      else if (c.y + s.radius < lv + 5 && !this.nearWater(c.x, c.z, 7 + s.radius)) L.push(o);
    });
  }

  nearWater(x, z, r) {
    if (this.depthAt(x, z) > 0.02) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.depthAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.02) return true;
    }
    return false;
  }

  // El espejo: la escena desde la cámara reflejada en el agua, cortada en el
  // nivel del agua (como el Reflector de three).
  reflect(renderer, scene, camera) {
    const size = renderer.getDrawingBufferSize(tmpS);
    const w = Math.max(16, Math.floor(size.x * this.tier.refl));
    const h = Math.max(16, Math.floor(size.y * this.tier.refl));
    if (!this.reflRT) {
      this.reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.u.tRefl.value = this.reflRT.texture;
    } else if (this.reflRT.width !== w || this.reflRT.height !== h) this.reflRT.setSize(w, h);
    const mc = (this.mirror ||= new THREE.PerspectiveCamera());
    const lv = this.level;
    tmpC.setFromMatrixPosition(camera.matrixWorld);
    // hacia dónde mira, reflejado
    tmpL.set(0, 0, -1).transformDirection(camera.matrixWorld).add(tmpC);
    tmpU.set(0, 1, 0).transformDirection(camera.matrixWorld);
    mc.position.set(tmpC.x, 2 * lv - tmpC.y, tmpC.z);
    mc.up.set(tmpU.x, -tmpU.y, tmpU.z);
    mc.lookAt(tmpL.x, 2 * lv - tmpL.y, tmpL.z);
    mc.near = camera.near;
    mc.far = camera.far;
    mc.layers.mask = camera.layers.mask;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);
    this.u.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    // plano de corte oblicuo: nada de lo que está abajo del agua entra al espejo
    tmpP.set(tmpV.set(0, 1, 0), -lv).applyMatrix4(mc.matrixWorldInverse);
    const cp = tmpQ.set(tmpP.normal.x, tmpP.normal.y, tmpP.normal.z, tmpP.constant);
    const e = mc.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x;
    e[6] = cp.y;
    e[10] = cp.z + 1 - 0.003;
    e[14] = cp.w;
    mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert();
    this.mesh.visible = false;
    const off = (this.off ||= []);
    off.length = 0;
    for (const o of this.hide || []) {
      if (!o.visible) continue;
      o.visible = false;
      off.push(o);
    }
    // (las sombras las hace el mundo: antes de él, un needsUpdate pendiente
    // se gastaba acá)
    const auto = renderer.shadowMap.autoUpdate;
    const need = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    // (las matrices ya se pusieron al día en este cuadro)
    const mwa = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    renderer.setRenderTarget(this.reflRT);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mc);
    scene.matrixWorldAutoUpdate = mwa;
    renderer.shadowMap.autoUpdate = auto;
    renderer.shadowMap.needsUpdate = need;
    for (const o of off) o.visible = true;
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.depthTex.dispose();
    this.detRT?.dispose();
    for (const rt of this.simRT || []) rt.dispose();
    this.simMat?.dispose();
    this.reflRT?.dispose();
    this.cube?.dispose();
    this.qMesh?.geometry.dispose();
  }
}
