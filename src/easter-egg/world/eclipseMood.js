import * as THREE from 'three';
import { ISLE_IDS } from './eclipseSky';
import { EclipseAtmos } from './eclipseAtmos';
import { LIGHTS, ZONES } from '../config/map';

// El aire de cada isla de Eclipse Matero (sesión 1f, 2026-10-06). El usuario:
// "la iluminación deja muchísimo que desear, miles de zonas paupérrimamente
// iluminadas y no siguen ningún tinte del mapa", "se siente todo muy seco y
// gráficamente pobre". Lo que faltaba:
//  1. el tinte de cada mapa: la niebla de la noche del eclipse (SKY_NIGHT) los
//     llevaba a todos al mismo negro violeta y adentro la ambiente era gris;
//     acá cada isla vuelve a tener su niebla (oscura pero con su color) y su
//     ambiente de adentro (el sótano frío del castillo, la sepia del molino, el
//     oro de la torre...), encima de world/eclipseAtmos;
//  2. el color de la imagen de cada mapa (fx/PostFX MAP_GRADE), mezclado según
//     la isla en la que está la cámara: g.eclMood.grade lo lee PostFX;
//  3. aire con cosas: una nube de partículas alrededor de la cámara, distinta
//     por isla (luciérnagas en el estero, polvo y chispas de fragua en el
//     molino, paja dorada en La Tapera, ceniza en el penal, polvo celeste en el
//     Monumento, oro que sube en la torre, nieve en el castillo, chispas
//     violetas en la Disformidad) y, adentro, el polvo que flota en la luz.
//     Un solo THREE.Points y todo en el sombreador: una llamada, nada por
//     partícula en la CPU, sin luces nuevas.
//  4. charcos de luz: bajo cada farol, vela, fuego y bombita, un charco de su
//     color en el piso (una malla instanciada, aditiva). Las luces de verdad
//     son pocas a la vez (World.cullLights, tope 10): de lejos los cuartos
//     quedaban negros aunque tuvieran sus faroles; el charco está siempre y se
//     baja cuando la luz de verdad está prendida al lado.
// globalThis.__mduNoEclMood: nada de esto. __mduNoEclMoodFx: sin partículas.
// __mduNoEclPools: sin charcos.

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// por isla: fog (la niebla, color de pantalla), amb/ambI (la ambiente de
// adentro), grade (la clave de MAP_GRADE), y las partículas: c1/c2 colores,
// n (cuántas de 1), size (m), rise (m/s), drift (m), blink (0-1), a (alfa)
export const MOOD = {
  centro: { fog: 0x0d2a2c, amb: 0x5d8f8a, ambI: 0.5, grade: 'esteros', c1: 0xc8ff6a, c2: 0x7affc8, n: 0.55, size: 0.07, rise: 0.05, drift: 0.9, blink: 1, a: 1.0 },
  molino: { fog: 0x2e1d0f, amb: 0x9a7a52, ambI: 0.5, grade: 'molino', c1: 0xffb060, c2: 0xd8b088, n: 0.6, size: 0.05, rise: 0.12, drift: 0.5, blink: 0.4, a: 0.8 },
  tapera: { fog: 0x3a1a12, amb: 0xa8705a, ambI: 0.5, grade: 'granja', c1: 0xffd070, c2: 0xe0a050, n: 0.6, size: 0.06, rise: -0.05, drift: 1.2, blink: 0.2, a: 0.75 },
  penal: { fog: 0x0f1a16, amb: 0x5f7a70, ambI: 0.55, grade: 'penal', c1: 0x9aa8a0, c2: 0x6a7a74, n: 0.7, size: 0.045, rise: -0.25, drift: 0.6, blink: 0, a: 0.55 },
  monumento: { fog: 0x2a3644, amb: 0x8aa2c0, ambI: 0.55, grade: 'monumento', c1: 0xcfe6ff, c2: 0xffffff, n: 0.5, size: 0.045, rise: 0.03, drift: 0.7, blink: 0.3, a: 0.6 },
  torre: { fog: 0x2a2408, amb: 0xb09a52, ambI: 0.5, grade: 'torre', c1: 0xffd24a, c2: 0xffa830, n: 0.6, size: 0.055, rise: 0.35, drift: 0.4, blink: 0.6, a: 0.9 },
  castillo: { fog: 0x0c1626, amb: 0x6a86b8, ambI: 0.55, grade: 'castillo', c1: 0xffffff, c2: 0xcfe2ff, n: 0.85, size: 0.06, rise: -0.6, drift: 0.8, blink: 0, a: 0.8 },
  desgarro: { fog: 0x1c0630, amb: 0x8a52c0, ambI: 0.5, grade: null, c1: 0xc070ff, c2: 0xff60d8, n: 0.75, size: 0.06, rise: 0.4, drift: 0.9, blink: 0.7, a: 1.0 },
};
// adentro (zonas techadas): polvo que flota, tibio, casi quieto
const ABYSS = { C1: lin(0xa84aff), C2: lin(0xff5a20), n: 0.95, size: 0.055, rise: 0.3, drift: 0.7, blink: 0.8, a: 1.0 };
const DUST = { c1: 0xffe2b0, c2: 0xd0c0a0, n: 0.45, size: 0.035, rise: 0.015, drift: 0.25, blink: 0.15, a: 0.55 };
// la Disformidad tiene su propio grado (no hay mapa de origen): violeta hondo
export const GRADE_DESGARRO = { sat: 1.05, con: 1.14, sh: [0.01, -0.02, 0.05], hi: [0.04, 0.0, 0.03], gain: [1.02, 0.96, 1.05], lift: [0.004, 0, 0.008] };
// cuánto de la niebla y la ambiente de la isla pisa a lo de world/eclipseAtmos
const FOG_K = 0.75;
const FOG_DENS_K = 2.4;

// La niebla y la ambiente van justo después de world/eclipseAtmos (que las
// vuelve a poner en cada cuadro), una sola vez por página: la del mapa de ahora.
let hook = null;
let hooked = false;
function hookAtmos() {
  if (hooked) return;
  hooked = true;
  const apply = EclipseAtmos.prototype.apply;
  EclipseAtmos.prototype.apply = function (dt) {
    apply.call(this, dt);
    if (hook && globalThis.__mduNoEclMood !== true) hook(this);
  };
}

const COUNT = 1400;
const MIST = 90;
const R = 16;

const VERT = /* glsl */ `
attribute vec4 seed;
uniform vec3 uCam;
uniform float uTime;
uniform float uDens;
uniform float uSize;
uniform float uRise;
uniform float uDrift;
uniform float uBlink;
uniform float uPx;
uniform vec3 uBox;
uniform float uYOff;
varying float vA;
varying float vC;
void main() {
  vec3 box = uBox;
  float ph = seed.w * 6.2831;
  vec3 drift = vec3(sin(uTime * (0.21 + seed.x * 0.3) + ph) * uDrift, uTime * uRise * (0.7 + seed.y * 0.6), cos(uTime * (0.17 + seed.z * 0.3) + ph * 1.3) * uDrift);
  vec3 base = seed.xyz * 2.0 * box + drift;
  vec3 p = mod(base - uCam + box, 2.0 * box) - box;
  vec3 wp = uCam + p + vec3(0.0, uYOff, 0.0);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(p / box);
  float keep = step(seed.w, uDens);
  float edge = 1.0 - smoothstep(0.6, 1.0, d);
  float near = smoothstep(0.4, 1.4, -mv.z);
  float bl = mix(1.0, 0.25 + 0.75 * max(0.0, sin(uTime * (1.3 + seed.x * 2.0) + ph * 7.0)), uBlink);
  vA = keep * edge * near * bl;
  vC = fract(seed.w * 13.7);
  gl_PointSize = keep > 0.5 ? uSize * uPx / max(0.3, -mv.z) : 0.0;
}`;
const FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uA;
uniform float uSoft;
varying float vA;
varying float vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float s = exp(-r * uSoft) * (1.0 - r);
  gl_FragColor = vec4(mix(uC1, uC2, vC) * s * vA * uA, 1.0);
}`;

// el radio (m) y la fuerza del charco según qué es
const POOL = { candle: [1.7, 0.5], fire: [4.2, 0.9], lamp: [3.6, 0.7], torch: [3.0, 0.8], def: [3.4, 0.6] };
const POOL_VERT = /* glsl */ `
attribute vec3 pCol;
attribute float pK;
varying vec2 vUv;
varying vec3 vCol;
varying float vK;
uniform vec3 uCam;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float d = length(wp.xyz - uCam);
  vK = pK * (1.0 - smoothstep(45.0, 70.0, d));
  vCol = pCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const POOL_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vK;
uniform float uK;
void main() {
  float r = dot(vUv, vUv);
  if (r > 1.0 || vK <= 0.001) discard;
  float f = exp(-r * 3.5) - 0.03;
  gl_FragColor = vec4(vCol * max(f, 0.0) * vK * uK, 1.0);
}`;

function buildPools(w, g) {
  const list = [];
  // (se arma antes que World.buildLights: los faroles de eclipseGfx ya están en
  // w.lights; las del config se enlazan con su luz cuando existe)
  const defs = new Set([...(w.lights || []).map((e) => e.def), ...LIGHTS]);
  for (const L of defs) {
    if (!L?.pos) continue;
    const e = { def: L, light: null, base: L.intensity || 1 };
    const [x, y, z] = L.pos;
    const fy = w.floorAt(x, z, y + 0.2);
    // (lejos del piso -un farol en lo alto, una luz sobre el vacío-: sin charco)
    if (!Number.isFinite(fy) || y - fy > 6 || y < fy) continue;
    const [r, k] = POOL[L.kind] || POOL.def;
    // (más alto, más ancho y más tenue)
    const h = Math.max(0.3, y - fy);
    list.push({ e, x, z, y: fy + 0.035, r: r * (0.75 + 0.12 * h), k: k / (0.8 + 0.15 * h), col: new THREE.Color(L.color).convertSRGBToLinear() });
  }
  if (!list.length) return null;
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const col = new Float32Array(list.length * 3);
  const kk = new Float32Array(list.length);
  list.forEach((p, i) => p.col.toArray(col, i * 3));
  geo.setAttribute('pCol', new THREE.InstancedBufferAttribute(col, 3));
  const kAttr = new THREE.InstancedBufferAttribute(kk, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('pK', kAttr);
  const U = { uCam: { value: new THREE.Vector3() }, uK: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  list.forEach((p, i) => im.setMatrixAt(i, m4.makeScale(p.r, 1, p.r).setPosition(p.x, p.y, p.z)));
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false;
  im.renderOrder = 2;
  im.name = 'eclPools';
  g.scene.add(im);
  let linked = -1;
  return {
    im,
    update(t) {
      if (linked !== w.lights.length) {
        linked = w.lights.length;
        const by = new Map(w.lights.map((e) => [e.def, e]));
        for (const p of list) {
          const E = by.get(p.e.def);
          if (E) p.e = E;
        }
      }
      U.uCam.value.copy(g.camera.position);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const L = p.e.light;
        const on = Math.max(0, Math.min(1.5, (L?.intensity ?? 0) / (p.e.base || 1)));
        // (si la luz de verdad está prendida al lado, ya alumbra: menos charco)
        const real = L?.visible ? 0.55 : 1;
        const fl = p.e.def.kind === 'fire' || p.e.def.kind === 'candle' ? 0.9 + 0.1 * Math.sin(t * 9 + i * 1.7) : 1;
        kk[i] = p.k * on * real * fl;
      }
      kAttr.needsUpdate = true;
    },
  };
}

export function moodPrep(w) {
  // 5. lo que quemaba en blanco: las velas fuertes de los cuartos chicos (la
  // cripta de Belgrano, de 34) pegadas a paredes claras, y el mármol de las
  // estatuas del Monumento (casi blanco: al lado de un farol, una mancha sin
  // forma). Antes de que v5 funda lo quieto (el color va a los
  // vértices) y de World.buildLights: world/Eclipse.js lo llama primero.
  // (__mduNoEclBurn: como antes)
  if (globalThis.__mduNoEclBurn !== true) {
    for (const L of LIGHTS) {
      if (L.burnFix || !(L.intensity >= 30) || ZONES[L.zone]?.outdoor) continue;
      L.burnFix = true;
      L.intensity *= 0.6;
    }
    if (w.M?.marble && !w.M.marble.userData.burnFix) {
      w.M.marble.userData.burnFix = true;
      w.M.marble.color.multiplyScalar(0.55);
    }
    // (las estatuas que bañan los reflectores: el emisivo que les pone
    // world/monumentoLuces las dejaba blancas, sin forma, de noche)
    const ML = w.M?.marbleLit;
    if (ML && !ML.userData.burnFix) {
      ML.userData.burnFix = true;
      ML.color.multiplyScalar(0.55);
      ML.emissive.multiplyScalar(0.25);
    }
  }
}

export function buildMood(w) {
  const g = w.g;
  const P = ISLE_IDS.map((id) => {
    const M = MOOD[id] || MOOD.centro;
    return { ...M, fogC: lin(M.fog), ambC: lin(M.amb), C1: lin(M.c1), C2: lin(M.c2) };
  });
  const D = { ...DUST, C1: lin(DUST.c1), C2: lin(DUST.c2) };
  const fogT = new THREE.Color();
  const ambT = new THREE.Color();
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  // el grado mezclado (lo lee fx/PostFX)
  const grade = { sat: 1, con: 1, sh: [0, 0, 0], hi: [0, 0, 0], gain: [1, 1, 1], lift: [0, 0, 0] };
  let GRADES = null;
  import('../fx/PostFX').then((m) => {
    GRADES = ISLE_IDS.map((id) => (MOOD[id]?.grade ? m.MAP_GRADE[MOOD[id].grade] : GRADE_DESGARRO) || m.MAP_GRADE.eclipse);
  });
  const mood = { grade: null };
  g.eclMood = mood;

  // las partículas
  let pts = null;
  let U = null;
  let mist = null;
  let MU = null;
  if (globalThis.__mduNoEclMoodFx !== true) {
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT * 4; i++) seed[i] = Math.random();
    // (la posición no se usa: todo sale de seed; three la pide para contar)
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    U = {
      uBox: { value: new THREE.Vector3(R, R * 0.45, R) },
      uYOff: { value: 0 },
      uSoft: { value: 3.2 },
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uDens: { value: 0 },
      uSize: { value: 0.05 },
      uRise: { value: 0 },
      uDrift: { value: 0.5 },
      uBlink: { value: 0 },
      uPx: { value: 500 },
      uC1: { value: new THREE.Color() },
      uC2: { value: new THREE.Color() },
      uA: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    pts.name = 'eclMood';
    g.scene.add(pts);
    // la neblina baja de afuera: pocas manchas grandes y tenues a la altura de
    // los pies, del color de la niebla de la isla (__mduNoEclMist)
    if (globalThis.__mduNoEclMist !== true) {
      const mg = new THREE.BufferGeometry();
      const ms = new Float32Array(MIST * 4);
      for (let i = 0; i < MIST * 4; i++) ms[i] = Math.random();
      mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIST * 3), 3));
      mg.setAttribute('seed', new THREE.BufferAttribute(ms, 4));
      MU = THREE.UniformsUtils.clone(U);
      MU.uBox.value.set(26, 0.5, 26);
      MU.uYOff.value = -1.25;
      MU.uSoft.value = 1.6;
      MU.uSize.value = 6;
      MU.uRise.value = 0;
      MU.uDrift.value = 2.5;
      MU.uBlink.value = 0;
      const mm = new THREE.ShaderMaterial({ uniforms: MU, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
      mist = new THREE.Points(mg, mm);
      mist.frustumCulled = false;
      mist.renderOrder = 3;
      mist.name = 'eclMist';
      g.scene.add(mist);
    }
  }
  const sz = new THREE.Vector2();
  const pools = globalThis.__mduNoEclPools !== true ? buildPools(w, g) : null;
  hookAtmos();
  hook = (A) => {
    if (A.g !== g) return;
    let sum = 0;
    for (let i = 0; i < A.w.length; i++) sum += A.w[i];
    sum ||= 1;
    // 1. la niebla y la ambiente de adentro de la isla
    fogT.setRGB(0, 0, 0);
    ambT.setRGB(0, 0, 0);
    let ambI = 0;
    for (let i = 0; i < P.length; i++) {
      const q = A.w[i] / sum;
      if (q <= 0) continue;
      fogT.r += P[i].fogC.r * q;
      fogT.g += P[i].fogC.g * q;
      fogT.b += P[i].fogC.b * q;
      ambT.r += P[i].ambC.r * q;
      ambT.g += P[i].ambC.g * q;
      ambT.b += P[i].ambC.b * q;
      ambI += P[i].ambI * q;
    }
    const fog = g.scene.fog;
    if (fog) {
      // (la dimensión nueva —abismo, world/eclipseAtmos A.abyss— tiene su niebla: no se pisa)
      fog.color.lerp(fogT, FOG_K * (1 - Math.min(1, A.abyss || 0)));
      // (la niebla de Eclipse era diez veces más fina que la del estero o el
      // penal —0,003 contra 0,026—, para ver las otras islas: sin aire entre
      // las cosas todo se veía plano y simplón. Más espesa, con la luna
      // pegándole; las otras islas siguen asomando. __mduNoEclFogK)
      if (globalThis.__mduNoEclFogK !== true && fog.isFogExp2 && !((A.dim || 0) > 0.5) && !((A.abyss || 0) > 0.3)) fog.density *= FOG_DENS_K;
      const SU = w.sky?.material?.uniforms;
      SU?.uFogColor?.value.copy(fog.color);
    }
    const ind = A.indoor || 0;
    if (w.ambient && ind > 0.01) {
      w.ambient.color.lerp(ambT, ind);
      w.ambient.intensity += (ambI - w.ambient.intensity) * ind * 0.5;
    }
  };

  return {
    update(dt, t) {
      if (globalThis.__mduNoEclMood === true) {
        mood.grade = null;
        if (pts) pts.visible = false;
        if (mist) mist.visible = false;
        if (pools) pools.im.visible = false;
        return;
      }
      const A = g.weather?.atmos;
      if (!A) return;
      let sum = 0;
      for (let i = 0; i < A.w.length; i++) sum += A.w[i];
      sum ||= 1;
      // 2. el color de la imagen
      if (GRADES) {
        grade.sat = grade.con = 0;
        for (const k of ['sh', 'hi', 'gain', 'lift']) grade[k].fill(0);
        for (let i = 0; i < P.length; i++) {
          const q = A.w[i] / sum;
          if (q <= 0) continue;
          const G = GRADES[i];
          grade.sat += G.sat * q;
          grade.con += G.con * q;
          for (const k of ['sh', 'hi', 'gain', 'lift']) for (let j = 0; j < 3; j++) grade[k][j] += G[k][j] * q;
        }
        // (el mapa final es más colorido que los de origen: un poco más de saturación)
        grade.sat = Math.min(1.08, grade.sat * 1.12);
        mood.grade = grade;
      }
      if (pools && g.camera) {
        pools.im.visible = true;
        pools.update(t);
      }
      // 3. el aire
      const ind = A.indoor || 0;
      if (!pts) return;
      const cam = g.camera;
      if (!cam) return;
      pts.visible = g.state !== 'title' || !!g.intro?.active;
      let n = 0, size = 0, rise = 0, drift = 0, blink = 0, a = 0;
      c1.setRGB(0, 0, 0);
      c2.setRGB(0, 0, 0);
      const add = (S, q) => {
        n += S.n * q;
        size += S.size * q;
        rise += S.rise * q;
        drift += S.drift * q;
        blink += S.blink * q;
        a += S.a * q;
        c1.r += S.C1.r * q; c1.g += S.C1.g * q; c1.b += S.C1.b * q;
        c2.r += S.C2.r * q; c2.g += S.C2.g * q; c2.b += S.C2.b * q;
      };
      for (let i = 0; i < P.length; i++) {
        const q = (A.w[i] / sum) * (1 - ind);
        if (q > 0) add(P[i], q);
      }
      if (ind > 0) add(D, ind);
      // (la dimensión oscura —A.abyss—: ceniza violeta que sube, no la de la isla de al lado)
      const ab = Math.min(1, A.abyss || 0);
      if (ab > 0) {
        const L = (a0, b0) => a0 + (b0 - a0) * ab;
        n = L(n, ABYSS.n);
        size = L(size, ABYSS.size);
        rise = L(rise, ABYSS.rise);
        drift = L(drift, ABYSS.drift);
        blink = L(blink, ABYSS.blink);
        a = L(a, ABYSS.a);
        c1.lerp(ABYSS.C1, ab);
        c2.lerp(ABYSS.C2, ab);
      }
      U.uCam.value.copy(cam.position);
      U.uTime.value = t;
      // (Baja: la mitad)
      const tier = g.settings?.quality;
      U.uDens.value = n * (tier === 'perf' || tier === 'low' ? 0.5 : 1);
      U.uSize.value = size;
      U.uRise.value = rise;
      U.uDrift.value = drift;
      U.uBlink.value = blink;
      U.uA.value = a;
      U.uC1.value.copy(c1);
      U.uC2.value.copy(c2);
      g.renderer?.getDrawingBufferSize?.(sz);
      U.uPx.value = (sz.y || 720) / (2 * Math.tan(((cam.fov || 60) * Math.PI) / 360));
      if (mist) {
        mist.visible = pts.visible;
        MU.uCam.value.copy(cam.position);
        MU.uTime.value = t;
        MU.uPx.value = U.uPx.value;
        // (afuera y no en la Disformidad, que ya tiene su niebla cerrada)
        const fogC = g.scene.fog?.color;
        if (fogC) MU.uC1.value.copy(fogC).multiplyScalar(2.2), MU.uC2.value.copy(fogC).multiplyScalar(1.6);
        MU.uDens.value = (1 - ind) * (1 - (A.dim || 0)) * (tier === 'perf' || tier === 'low' ? 0.5 : 1);
        MU.uA.value = 0.09;
      }
    },
  };
}
