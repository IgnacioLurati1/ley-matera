import * as THREE from 'three';

// Los efectos del Rayo Matero Mark III (weapons/Weapons.js): el remolino del
// clic derecho y el agujero negro en que se convierte si se le tira el rayo.
//
// El remolino: una bolita de oro con dos anillos que vuela y, al abrirse, un
// tornado verde (el embudo de viento con sus vetas, el remolino en el piso
// que marca hasta dónde chupa y hojitas que suben girando).
// El agujero negro: la esfera negra, el anillo de fotones, el disco que gira
// (caliente adentro, con un lado más brillante: el que viene hacia uno), los
// arcos del disco de atrás que la gravedad dobla por arriba y por abajo, un
// halo oscuro que se traga la luz, chispas que caen en espiral y la onda al
// transformarse.
//
// Brilla sin encandilar: lo fuerte es finito (el anillo, el centro), lo
// grande es tenue y el agujero oscurece. Cerca de la cámara todo se desvanece.
// Nada de luces nuevas (cambiaría la cantidad de luces y se recompilaría todo
// el mapa). Cada efecto se arma una vez y se reusa; Weapons.prebuild deja uno
// de cada uno en el grupo escondido para que se compilen al cargar.

const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true, depthWrite: false, toneMapped: false, fog: false };

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec2 rot(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
  // se desvanece cuando la cámara está encima
  float nearFade(float d) { return smoothstep(0.35, 1.9, d); }
  // una campana: 1 en x = 0
  float bell(float x) { return exp(-x * x); }
`;

// Un plano que mira siempre a la cámara (PlaneGeometry(2, 2): vUv de -1 a 1).
const BILLBOARD_VS = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

// Un plano acostado (el remolino del piso, el disco): vP de -1 a 1.
const FLAT_VS = /* glsl */ `
  varying vec2 vP;
  varying vec3 vW;
  varying float vDepth;
  void main() {
    vP = position.xy;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

// El remolino del piso: brazos en espiral que giran, más tenues hacia afuera.
const SWIRL_FS = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform float uAlpha;
  uniform float uArms;
  uniform vec3 uOut;
  uniform vec3 uIn;
  varying vec2 vP;
  varying float vDepth;
  ${NOISE}
  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    float ph = uArms * a + 6.5 * log(r + 0.04) + uTime * 5.0;
    float arms = smoothstep(0.25, 1.0, sin(ph) * 0.5 + 0.5);
    float n = noise(rot(vP, uTime * 1.3 + 2.5 / (r + 0.25)) * 7.0);
    float env = (1.0 - smoothstep(0.45, 1.0, r)) * smoothstep(0.02, 0.16, r);
    // el borde: un anillo finito que marca hasta dónde chupa
    float edge = bell((r - 0.93) / 0.025) * (0.5 + 0.5 * sin(a * 24.0 - uTime * 6.0));
    float I = (arms * (0.45 + 0.8 * n) * env + edge * 0.35) * uAlpha * uK * nearFade(vDepth);
    gl_FragColor = vec4(mix(uIn, uOut, smoothstep(0.05, 0.75, r)) * I, 0.0);
  }
`;

// El embudo del tornado (un cono abierto): vetas en espiral que suben girando
// y el borde más marcado (se lee como volumen).
const FUNNEL_VS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FUNNEL_FS = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform vec3 uOut;
  uniform vec3 uIn;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vDepth;
  void main() {
    float u = vUv.x * 6.2831853;
    float v = vUv.y;
    // vetas de viento en espiral (finitas) y unas ráfagas más anchas y tenues
    float s1 = smoothstep(0.86, 1.0, sin(u * 4.0 + v * 11.0 - uTime * 9.0) * 0.5 + 0.5);
    float s2 = smoothstep(0.9, 1.0, sin(u * 7.0 + v * 17.0 - uTime * 13.0 + 1.7) * 0.5 + 0.5);
    float gust = smoothstep(0.3, 1.0, sin(u * 2.0 + v * 5.0 - uTime * 5.0 + sin(v * 9.0 + uTime) * 0.8) * 0.5 + 0.5);
    float fres = pow(1.0 - abs(dot(vN, vV)), 1.8);
    float env = smoothstep(0.0, 0.14, v) * (1.0 - smoothstep(0.6, 1.0, v));
    float rim = exp(-((v - 0.9) / 0.05) * ((v - 0.9) / 0.05)) * 0.25;
    float I = ((s1 * 1.1 + s2 * 0.6) * (0.35 + fres) + gust * 0.1 * (0.3 + fres) + rim * fres) * env * uK * smoothstep(0.35, 1.9, vDepth);
    gl_FragColor = vec4(mix(uOut, uIn, s1 * 0.4 + (1.0 - v) * 0.5) * I, 0.0);
  }
`;

// El resplandor de la bolita del remolino (con unos rayos que giran al abrirse).
const GLOW_FS = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform vec3 uOut;
  uniform vec3 uIn;
  varying vec2 vUv;
  varying float vDepth;
  ${NOISE}
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x);
    float core = 1.0 - smoothstep(0.0, 0.2, r);
    float halo = exp(-r * r * 7.0);
    float rays = pow(max(0.0, sin(a * 5.0 + uTime * 3.0)), 10.0) * (1.0 - smoothstep(0.15, 0.95, r)) * uK;
    vec3 col = uIn * core * 0.9 + mix(uOut, uIn, 0.35) * halo * 0.45 + mix(uOut, uIn, 0.6) * rays * 0.3;
    gl_FragColor = vec4(col * nearFade(vDepth), 0.0);
  }
`;

// El agujero negro visto de frente: el halo oscuro, el horizonte, el anillo
// de fotones, los arcos del disco de atrás y la onda al nacer.
const HOLE_FS = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform float uRh;
  uniform float uAuraR;
  uniform float uShock;
  uniform vec3 uRing;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec2 vUv;
  varying float vDepth;
  ${NOISE}
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x);
    float near = nearFade(vDepth);
    float aura = (1.0 - smoothstep(uRh * 1.15, uAuraR, r)) * 0.6;
    float hor = 1.0 - smoothstep(uRh * 0.96, uRh * 1.02, r);
    float ring = bell((r - uRh * 1.1) / (uRh * 0.045)) * (0.8 + 0.2 * sin(a * 3.0 + uTime * 9.0));
    float band = bell((r - uRh * 1.42) / (uRh * 0.17));
    float sw = noise(rot(vUv, uTime * 2.2 + 1.5 / (r + 0.1)) * 9.0);
    float arcs = band * (0.25 + 0.75 * pow(abs(sin(a)), 1.5)) * (0.35 + sw);
    float glow = bell((r - uRh * 1.1) / (uRh * 0.5)) * 0.18;
    float sr = mix(uRh, 1.0, uShock);
    float shock = bell((r - sr) / 0.035) * (1.0 - uShock) * step(0.001, uShock);
    vec3 col = uRing * ring * 1.5 + mix(uHot, uCool, 0.45) * arcs * 0.85 + uCool * glow + mix(uRing, uCool, 0.5) * shock * 1.1;
    float A = max(hor, aura);
    gl_FragColor = vec4(col * uK * near, clamp(A, 0.0, 1.0) * uK * near);
  }
`;

// El disco de acreción: anillos que giran más rápido adentro, caliente al
// centro, con el lado que viene hacia uno más brillante.
const DISK_FS = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform float uIn;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  uniform vec3 uCenter;
  uniform vec3 uNormal;
  varying vec2 vP;
  varying vec3 vW;
  varying float vDepth;
  ${NOISE}
  void main() {
    float r = length(vP);
    if (r > 1.0 || r < uIn) discard;
    float t = (r - uIn) / (1.0 - uIn);
    vec2 q = rot(vP, uTime * (0.5 + 1.6 / (r * 3.0 + 0.25)));
    float bands = sin(r * 70.0 + noise(q * 4.0) * 7.0) * 0.5 + 0.5;
    float clumps = noise(q * 11.0) * 0.7 + noise(q * 23.0) * 0.3;
    float dens = (0.35 + 0.65 * bands) * (0.3 + 0.9 * clumps);
    vec3 radial = normalize(vW - uCenter);
    vec3 tang = normalize(cross(uNormal, radial));
    float dop = 1.0 + 0.75 * dot(tang, normalize(cameraPosition - vW));
    float env = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.35, 1.0, t));
    vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.35, t));
    col = mix(col, uCool, smoothstep(0.35, 0.9, t));
    float I = dens * env * dop * uK * nearFade(vDepth);
    gl_FragColor = vec4(col * I, clamp(I * 0.35, 0.0, 0.5));
  }
`;

// Chispas que caen en espiral hacia el centro (y en el remolino, además, suben).
const SPARK_VS = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uR;
  uniform float uR0;
  uniform float uRise;
  uniform float uThick;
  uniform float uSpin;
  uniform float uSize;
  uniform float uVH;
  varying float vT;
  varying float vS;
  varying float vDepth;
  void main() {
    float t = fract(uTime * aSeed.z + aSeed.w);
    vS = aSeed.x;
    float r = mix(uR * (0.45 + 0.55 * aSeed.y), uR0, pow(t, 0.75));
    float ang = aSeed.x + uSpin * (t * 7.0 + uTime * 0.6);
    float y = (aSeed.y - 0.5) * uThick * (1.0 - t) + uRise * pow(t, 1.3);
    vec4 mv = modelViewMatrix * vec4(cos(ang) * r, y, sin(ang) * r, 1.0);
    vT = t;
    vDepth = -mv.z;
    gl_PointSize = clamp(uSize * (0.55 + 0.9 * t) * projectionMatrix[1][1] * uVH * 0.5 / max(0.2, -mv.z), 1.0, 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FS = /* glsl */ `
  uniform float uK;
  uniform float uLeaf;
  uniform vec3 uOut;
  uniform vec3 uIn;
  varying float vT;
  varying float vS;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float live = smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.88, 1.0, vT)) * uK * smoothstep(0.35, 1.9, vDepth);
    if (uLeaf > 0.5) {
      // una hojita de yerba que da vueltas (sólida, con su nervadura)
      float a = vS * 3.0 + vT * 18.0;
      c = vec2(cos(a) * c.x - sin(a) * c.y, sin(a) * c.x + cos(a) * c.y);
      float e = c.x * c.x * 5.0 + c.y * c.y * 1.1;
      if (e > 1.0) discard;
      float edge = 1.0 - smoothstep(0.6, 1.0, e);
      float vein = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.07, abs(c.x)));
      vec3 leaf = mix(uOut, uIn, 0.5 + 0.5 * c.y) * vein;
      float A = edge * live;
      gl_FragColor = vec4(leaf * A, A * 0.9);
      return;
    }
    float d = dot(c, c);
    if (d > 1.0) discard;
    gl_FragColor = vec4(mix(uOut, uIn, vT) * (1.0 - d) * 0.9 * live, 0.0);
  }
`;

const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
// los colores: el remolino verde con oro (el mejorado, más oro); el agujero violeta
const PAL = {
  vortex: [{ out: col(0x5cff6a), in: col(0xffd76a, 1.1) }, { out: col(0xb8ff5a), in: col(0xffcf4a, 1.2) }],
  hole: [
    { ring: col(0xf2dcff, 1.2), hot: col(0xffd6f4), mid: col(0xa35cff), cool: col(0x3a1790) },
    { ring: col(0xfff0d0, 1.2), hot: col(0xfff0e0), mid: col(0xc070ff), cool: col(0x4a1aa0) },
  ],
};

let flatGeo;
let funnelGeo;
let sparkGeos;
let sphereGeo;
let ringGeos;
const planeGeo = () => (flatGeo ||= new THREE.PlaneGeometry(2, 2));

// Las semillas de las chispas: ángulo, radio, velocidad y fase.
function sparks(n) {
  sparkGeos ||= new Map();
  if (sparkGeos.has(n)) return sparkGeos.get(n);
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(n * 4);
  let s = 7 + n * 131;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    seed[i * 4] = r() * Math.PI * 2;
    seed[i * 4 + 1] = r();
    seed[i * 4 + 2] = 0.35 + r() * 0.45;
    seed[i * 4 + 3] = r();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  sparkGeos.set(n, geo);
  return geo;
}

const shader = (vs, fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...BLEND, ...extra });

// Un remolino: la bolita que vuela y el tornado que se abre.
function buildVortex() {
  const root = new THREE.Group();
  const U = { uTime: { value: 0 }, uK: { value: 0 }, uOut: { value: new THREE.Color() }, uIn: { value: new THREE.Color() } };
  sphereGeo ||= new THREE.SphereGeometry(1, 16, 12);
  ringGeos ||= [new THREE.TorusGeometry(0.2, 0.012, 6, 40), new THREE.TorusGeometry(0.3, 0.009, 6, 48)];
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false, fog: false });
  const core = new THREE.Mesh(sphereGeo, coreMat);
  core.scale.setScalar(0.11);
  const glow = new THREE.Mesh(planeGeo(), shader(BILLBOARD_VS, GLOW_FS, { ...U, uSize: { value: 0.75 } }));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const rings = ringGeos.map((g) => new THREE.Mesh(g, ringMat));
  rings[1].rotation.x = 1.2;
  const orb = new THREE.Group();
  orb.add(core, glow, ...rings);
  const swirl = new THREE.Mesh(planeGeo(), shader(FLAT_VS, SWIRL_FS, { ...U, uAlpha: { value: 0.55 }, uArms: { value: 3 } }, { side: THREE.DoubleSide }));
  swirl.rotation.x = -Math.PI / 2;
  funnelGeo ||= new THREE.CylinderGeometry(1, 0.22, 1, 48, 10, true).translate(0, 0.5, 0);
  const funnel = new THREE.Mesh(funnelGeo, shader(FUNNEL_VS, FUNNEL_FS, U, { side: THREE.DoubleSide }));
  const vhU = { value: 1000 };
  const sp = new THREE.Points(sparks(200), shader(SPARK_VS, SPARK_FS, { ...U, uR: { value: 4 }, uR0: { value: 0.25 }, uRise: { value: 2.6 }, uThick: { value: 0.3 }, uSpin: { value: 1 }, uSize: { value: 0.07 }, uVH: vhU, uLeaf: { value: 0 } }));
  // hojas de yerba que suben girando con el viento
  const leaves = new THREE.Points(sparks(70), shader(SPARK_VS, SPARK_FS, { ...U, uR: sp.material.uniforms.uR, uR0: { value: 0.5 }, uRise: { value: 3.1 }, uThick: { value: 0.6 }, uSpin: { value: 0.8 }, uSize: { value: 0.16 }, uVH: vhU, uLeaf: { value: 1 }, uOut: { value: new THREE.Color(0x3f7a24) }, uIn: { value: new THREE.Color(0x9ccf4a) } }));
  for (const o of [glow, swirl, funnel, sp, leaves]) o.frustumCulled = false;
  swirl.renderOrder = 1;
  funnel.renderOrder = 2;
  leaves.renderOrder = 3;
  sp.renderOrder = 4;
  glow.renderOrder = 5;
  root.add(orb, swirl, funnel, sp, leaves);
  let t = 0;
  const fx = {
    kind: 'vortex',
    set(up) {
      const P = PAL.vortex[up ? 1 : 0];
      U.uOut.value.copy(P.out);
      U.uIn.value.copy(P.in);
      ringMat.color.copy(P.out).lerp(P.in, 0.4).multiplyScalar(0.9);
      t = Math.random() * 10;
    },
    // k: cuánto está abierto (0 volando), R: hasta dónde chupa, floor: la
    // altura del piso debajo (el tornado arranca ahí), vh: alto de la imagen
    update(dt, k, R, floor, vh) {
      t += dt;
      U.uTime.value = t;
      U.uK.value = k;
      vhU.value = vh;
      rings[0].rotation.x += dt * 5;
      rings[0].rotation.y += dt * 3;
      rings[1].rotation.y += dt * 6;
      rings[1].rotation.z += dt * 2;
      // al abrirse, los anillos se agrandan y se apagan: queda el tornado
      const ringK = 1 + k * 3;
      rings.forEach((r) => r.scale.setScalar(ringK));
      ringMat.opacity = 0.6 * (1 - k);
      const open = k > 0.001;
      swirl.visible = open;
      funnel.visible = open;
      sp.visible = open;
      leaves.visible = open;
      if (!open) return;
      const dy = Math.min(0, floor - root.position.y) + 0.04;
      swirl.position.y = dy;
      swirl.scale.setScalar(R * 0.95);
      funnel.position.y = dy;
      funnel.scale.set(R * 0.34 * (0.6 + 0.4 * k), 3.3, R * 0.34 * (0.6 + 0.4 * k));
      sp.position.y = dy + 0.1;
      leaves.position.y = dy + 0.1;
      sp.material.uniforms.uR.value = R * 0.9;
    },
  };
  root.userData.fx = fx;
  return root;
}

// Un agujero negro.
function buildHole() {
  const root = new THREE.Group();
  const U = { uTime: { value: 0 }, uK: { value: 0 } };
  sphereGeo ||= new THREE.SphereGeometry(1, 16, 12);
  // el horizonte: negro y opaco (tapa la mitad de atrás del disco)
  const ball = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const face = new THREE.Mesh(
    planeGeo(),
    shader(BILLBOARD_VS, HOLE_FS, { ...U, uSize: { value: 3 }, uRh: { value: 0.25 }, uAuraR: { value: 1 }, uShock: { value: 0 }, uRing: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uCool: { value: new THREE.Color() } }),
  );
  const tilt = new THREE.Group();
  tilt.rotation.set(0.32, 0, 0.12);
  const disk = new THREE.Mesh(
    planeGeo(),
    shader(FLAT_VS, DISK_FS, { ...U, uIn: { value: 0.3 }, uHot: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uCool: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector3() }, uNormal: { value: new THREE.Vector3() } }, { side: THREE.DoubleSide }),
  );
  disk.rotation.x = -Math.PI / 2;
  const sp = new THREE.Points(sparks(260), shader(SPARK_VS, SPARK_FS, { ...U, uR: { value: 6 }, uR0: { value: 0.6 }, uRise: { value: 0 }, uThick: { value: 1.6 }, uSpin: { value: -1 }, uSize: { value: 0.06 }, uOut: { value: new THREE.Color() }, uIn: { value: new THREE.Color() }, uVH: { value: 1000 }, uLeaf: { value: 0 } }));
  tilt.add(disk, sp);
  // en el piso, el remolino violeta que marca hasta dónde chupa
  const swirl = new THREE.Mesh(planeGeo(), shader(FLAT_VS, SWIRL_FS, { ...U, uAlpha: { value: 0.3 }, uArms: { value: 4 }, uOut: { value: new THREE.Color() }, uIn: { value: new THREE.Color() } }, { side: THREE.DoubleSide }));
  swirl.rotation.x = -Math.PI / 2;
  for (const o of [face, disk, sp, swirl]) o.frustumCulled = false;
  swirl.renderOrder = 1;
  face.renderOrder = 2;
  disk.renderOrder = 3;
  sp.renderOrder = 4;
  root.add(ball, face, tilt, swirl);
  let t = 0;
  const n = new THREE.Vector3();
  const tq = new THREE.Quaternion();
  const fx = {
    kind: 'hole',
    set(up) {
      const P = PAL.hole[up ? 1 : 0];
      const f = face.material.uniforms;
      f.uRing.value.copy(P.ring);
      f.uHot.value.copy(P.hot);
      f.uCool.value.copy(P.cool);
      const d = disk.material.uniforms;
      d.uHot.value.copy(P.hot);
      d.uMid.value.copy(P.mid);
      d.uCool.value.copy(P.cool);
      sp.material.uniforms.uOut.value.copy(P.cool).multiplyScalar(1.6);
      sp.material.uniforms.uIn.value.copy(P.hot);
      swirl.material.uniforms.uOut.value.copy(P.cool).multiplyScalar(1.4);
      swirl.material.uniforms.uIn.value.copy(P.mid);
      t = Math.random() * 10;
    },
    // k: cuánto está abierto, R: hasta dónde chupa, floor: el piso de abajo,
    // age: segundos desde que se transformó (la onda), vh: alto de la imagen
    update(dt, k, R, floor, vh, age = 9) {
      t += dt;
      U.uTime.value = t;
      U.uK.value = k;
      const rh = 0.28 + 0.42 * k;
      ball.scale.setScalar(Math.max(0.001, rh));
      const size = rh * 4.2;
      const f = face.material.uniforms;
      // (la onda llega lejos: el plano se agranda mientras dura)
      f.uSize.value = age < 0.8 ? Math.max(size, R * 0.9) : size;
      f.uRh.value = rh / f.uSize.value;
      f.uAuraR.value = size / f.uSize.value;
      f.uShock.value = age < 0.8 ? Math.max(0.001, age / 0.8) : 0;
      const Rd = rh * 5.2;
      disk.scale.setScalar(Rd);
      disk.material.uniforms.uIn.value = (rh * 1.25) / Rd;
      tilt.rotation.y += dt * 0.15;
      root.updateMatrixWorld();
      disk.getWorldPosition(disk.material.uniforms.uCenter.value);
      n.set(0, 1, 0).applyQuaternion(tilt.getWorldQuaternion(tq));
      disk.material.uniforms.uNormal.value.copy(n);
      const s = sp.material.uniforms;
      s.uR.value = R * 0.85;
      s.uR0.value = rh * 1.1;
      s.uVH.value = vh;
      swirl.position.y = Math.min(0, floor - root.position.y) + 0.05;
      swirl.scale.setScalar(R);
    },
  };
  root.userData.fx = fx;
  return root;
}

export default class Mk3Fx {
  constructor(park) {
    // donde esperan los que no se usan (el grupo escondido de Weapons)
    this.park = park;
    this.all = { vortex: [], hole: [] };
  }

  // Uno de cada uno de entrada, para que la carga compile sus shaders.
  warm() {
    this.release(this.make('vortex'));
    this.release(this.make('hole'));
  }

  make(kind) {
    const root = kind === 'hole' ? buildHole() : buildVortex();
    this.all[kind].push(root);
    return root;
  }

  // Uno libre (en el grupo escondido o suelto) o uno nuevo.
  get(kind, upgraded) {
    const root = this.all[kind].find((r) => !r.parent || r.parent === this.park) || this.make(kind);
    root.removeFromParent();
    root.position.set(0, 0, 0);
    root.userData.fx.set(upgraded);
    return root;
  }

  release(root) {
    if (root) this.park.add(root);
  }
}
