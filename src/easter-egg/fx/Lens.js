import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// La lente de cine (el usuario, 2026-10-11): en las cinemáticas, lo que queda
// detrás (y muy delante) de los personajes sale fuera de foco, y al mover la
// cámara eso mismo se barre. Los personajes quedan siempre nítidos.
//
// Qué queda en foco, sin que cada escena tenga que decirlo:
//  - los muñecos que están en cuadro (ui/cineLens.js lensHull: del más cercano
//    al más lejano), y
//  - lo que la cámara mira: la distancia a lo que hay en el centro de la
//    pantalla (todas las cámaras de las escenas apuntan con lookAt, así que su
//    blanco cae en el centro). Se lee de la profundidad en la placa, a una
//    textura de 1x1 que se mueve de a poco: eso es el cambio de foco.
// Una escena puede fijar el foco a mano (setManual: las que vienen de Blender
// traen la distancia de foco de su cámara).
//
// Tres dibujos por cuadro, solo con la lente prendida: el foco (1 píxel), el
// barrido por movimiento de cámara (8 muestras) y el desenfoque (TAPS
// muestras, en espiral). Va después de la luz y antes del mate en la mano.
// (globalThis.__mduNoLente: sin la lente; globalThis.__mduLente = { blur, mb }:
// cuánto desenfoca y cuánto barre, 1 = lo normal)

const TAPS = 30;

const COMMON = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tFocus;
  uniform float uNear;
  uniform float uFar;
  uniform vec4 uHull; // cerca, lejos, hay muñecos (0/1), a mano (0/1)
  uniform float uRamp; // qué tan de golpe se va de foco (1: lo normal; menos, más de golpe)
  float lin(float d) { return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
  // el tramo nítido [x, y] y cuánto afloja el desenfoque con el foco muy lejos
  vec3 zone() {
    // (el foco puesto a mano, el de una cámara de Blender: tal cual)
    if (uHull.w > 0.5) return vec3(uHull.x, uHull.y, 1.0);
    float fz = texture2D(tFocus, vec2(0.5)).r;
    float f0 = fz;
    float f1 = fz;
    if (uHull.z > 0.5) { f0 = min(uHull.x, fz); f1 = max(uHull.y, min(fz, uHull.y + 14.0)); }
    f0 -= 0.7;
    f1 += max(1.0, f1 * 0.2);
    return vec3(f0, f1, 1.0 - smoothstep(60.0, 120.0, f1));
  }
  // 0: en foco; 1: del todo fuera de foco
  float cocOf(float z, vec3 Z) {
    float far = clamp((z - Z.y) / ((Z.y * 0.8 + 4.0) * uRamp), 0.0, 1.0);
    float near = clamp((Z.x - z) / (max(0.6, Z.x * 0.5) * uRamp), 0.0, 1.0) * 0.6;
    return max(far, near) * Z.z;
  }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// el foco: la distancia a lo que hay en el centro, llevada de a poco
const FOCUS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tPrev;
  uniform float uNear;
  uniform float uFar;
  uniform float uK;
  float lin(float d) { return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
  void main() {
    float z = lin(texture2D(tDepth, vec2(0.5)).x);
    // (el centro da al cielo o al fondo: lo más cercano de alrededor)
    if (z > 150.0) {
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        z = min(z, lin(texture2D(tDepth, vec2(0.5) + vec2(cos(a), sin(a)) * vec2(0.03, 0.05)).x));
      }
    }
    z = clamp(z, 0.3, 400.0);
    float prev = texture2D(tPrev, vec2(0.5)).r;
    gl_FragColor = vec4(mix(prev, z, uK));
  }
`;

// el barrido: lo que está fuera de foco se corre con el movimiento de la cámara
const BLUR = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform mat4 uInvVP;
  uniform mat4 uPrevVP;
  uniform float uShutter;
  uniform float uMaxV;
  varying vec2 vUv;
  ${COMMON}
  void main() {
    float d = texture2D(tDepth, vUv).x;
    vec4 w = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    w /= w.w;
    vec4 p = uPrevVP * w;
    vec2 vel = p.w > 0.0 ? vUv - (p.xy / p.w * 0.5 + 0.5) : vec2(0.0);
    vel *= uShutter * smoothstep(0.0, 0.5, cocOf(lin(d), zone()));
    float L = length(vel);
    if (L > uMaxV) vel *= uMaxV / L;
    vec3 c = vec3(0.0);
    for (int i = 0; i < 8; i++) c += min(texture2D(tDiffuse, vUv - vel * (float(i) / 7.0 - 0.5)).rgb, vec3(16.0));
    gl_FragColor = vec4(c / 8.0, 1.0);
  }
`;

// el desenfoque: muestras en espiral; lo de atrás no se derrama sobre lo nítido
const DOF = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uPx;
  uniform float uMax;
  varying vec2 vUv;
  ${COMMON}
  void main() {
    vec3 Z = zone();
    float cz = lin(texture2D(tDepth, vUv).x);
    float cc = cocOf(cz, Z) * uMax;
    vec3 color = min(texture2D(tDiffuse, vUv).rgb, vec3(16.0));
    float tot = 1.0;
    float rs = uMax * uMax / float(${2 * TAPS});
    float radius = max(rs, 0.35);
    for (int i = 0; i < ${TAPS}; i++) {
      float a = float(i) * 2.39996323;
      vec2 tc = vUv + vec2(cos(a), sin(a)) * uPx * radius;
      float sz = lin(texture2D(tDepth, tc).x);
      float sc = cocOf(sz, Z) * uMax;
      if (sz > cz) sc = clamp(sc, 0.0, cc * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, sc);
      color += mix(color / tot, min(texture2D(tDiffuse, tc).rgb, vec3(16.0)), m);
      tot += 1.0;
      radius += rs / radius;
    }
    gl_FragColor = vec4(color / tot, 1.0);
  }
`;

const COPY = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

export default class LensPass extends Pass {
  // depth(): la textura de profundidad del mundo de este cuadro (o null)
  constructor(camera, depth) {
    super();
    this.camera = camera;
    this.depth = depth;
    this.enabled = false;
    this.needsSwap = true;
    this.k = 0;
    this.want = false;
    this.hull = new THREE.Vector4(0, 0, 0, 0);
    this.manual = null;
    this.w = 1;
    this.h = 1;
    this.dt = 1 / 60;
    this.tmp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const one = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.foc = [one(), one()];
    this.fi = 0;
    this.fresh = true;
    this.vp = new THREE.Matrix4();
    this.prevVP = new THREE.Matrix4();
    this.inv = new THREE.Matrix4();
    this.camP = new THREE.Vector3();
    this.camD = new THREE.Vector3();
    this.ramp = { value: 1 };
    const base = () => ({ tDepth: { value: null }, tFocus: { value: null }, uNear: { value: 0.05 }, uFar: { value: 400 }, uHull: { value: this.hull }, uRamp: this.ramp });
    this.mFocus = mk(FOCUS, { tDepth: { value: null }, tPrev: { value: null }, uNear: { value: 0.05 }, uFar: { value: 400 }, uK: { value: 1 } });
    this.mBlur = mk(BLUR, { ...base(), tDiffuse: { value: null }, uInvVP: { value: this.inv }, uPrevVP: { value: this.prevVP }, uShutter: { value: 0 }, uMaxV: { value: 0.012 } });
    this.mDof = mk(DOF, { ...base(), tDiffuse: { value: null }, uPx: { value: new THREE.Vector2() }, uMax: { value: 0 } });
    this.mCopy = mk(COPY, { tDiffuse: { value: null } });
    this.quad = new FullScreenQuad(this.mCopy);
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.tmp.setSize(w, h);
  }

  // Cada cuadro, antes de dibujar. hull: { near, far, n } de los muñecos en
  // cuadro, o null para apagar la lente (se va de a poco).
  update(dt, hull) {
    this.dt = dt;
    this.want = !!hull;
    if (hull) this.hull.set(hull.near, hull.far, hull.n > 0 ? 1 : 0, 0);
    if (hull && this.manual) this.hull.set(this.manual.near, this.manual.far, 1, 1);
    this.ramp.value = hull && this.manual ? this.manual.ramp : 1;
    this.k += ((this.want ? 1 : 0) - this.k) * Math.min(1, dt * 3);
    if (!this.want && this.k < 0.01) this.k = 0;
    const on = this.k > 0;
    if (on && !this.enabled) this.fresh = true;
    this.enabled = on;
  }

  // El foco a mano: todo nítido entre near y far metros de la cámara (null: solo).
  // ramp: qué tan de golpe se desenfoca lo demás (1, como siempre; 0,25, un diafragma muy abierto)
  setManual(m) {
    this.manual = m && Number.isFinite(m.near) ? { near: m.near, far: Math.max(m.near, m.far ?? m.near), ramp: Math.max(0.1, Math.min(1, m.ramp ?? 1)) } : null;
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = this.depth();
    const out = this.renderToScreen ? null : writeBuffer;
    const Q = this.quad;
    if (!depth) {
      this.mCopy.uniforms.tDiffuse.value = readBuffer.texture;
      Q.material = this.mCopy;
      renderer.setRenderTarget(out);
      Q.render(renderer);
      return;
    }
    const cam = this.camera;
    const L = globalThis.__mduLente || null;
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // un corte: la cámara saltó. Sin barrido y con el foco de un saque.
    const e = cam.matrixWorld.elements;
    const jump = this.fresh || Math.hypot(e[12] - this.camP.x, e[13] - this.camP.y, e[14] - this.camP.z) > 1.2 || -e[8] * this.camD.x - e[9] * this.camD.y - e[10] * this.camD.z < 0.94;
    this.camP.set(e[12], e[13], e[14]);
    this.camD.set(-e[8], -e[9], -e[10]);
    // 1) el foco
    const prev = this.foc[this.fi];
    const next = this.foc[1 - this.fi];
    const F = this.mFocus.uniforms;
    F.tDepth.value = depth;
    F.tPrev.value = prev.texture;
    F.uNear.value = cam.near;
    F.uFar.value = cam.far;
    F.uK.value = jump ? 1 : 1 - Math.exp(-this.dt * 3.5);
    Q.material = this.mFocus;
    renderer.setRenderTarget(next);
    Q.render(renderer);
    this.fi = 1 - this.fi;
    // 2) el barrido
    let src = readBuffer.texture;
    const sh = (L?.mb ?? 1) * 0.5 * this.k;
    if (sh > 0 && !jump) {
      const U = this.mBlur.uniforms;
      this.inv.copy(this.vp).invert();
      U.tDiffuse.value = src;
      U.tDepth.value = depth;
      U.tFocus.value = next.texture;
      U.uNear.value = cam.near;
      U.uFar.value = cam.far;
      U.uShutter.value = sh;
      Q.material = this.mBlur;
      renderer.setRenderTarget(this.tmp);
      Q.render(renderer);
      src = this.tmp.texture;
    }
    this.prevVP.copy(this.vp);
    // 3) el desenfoque
    const D = this.mDof.uniforms;
    D.tDiffuse.value = src;
    D.tDepth.value = depth;
    D.tFocus.value = next.texture;
    D.uNear.value = cam.near;
    D.uFar.value = cam.far;
    D.uPx.value.set(1 / this.w, 1 / this.h);
    D.uMax.value = Math.max(0.01, 0.011 * this.h * this.k * (L?.blur ?? 1));
    Q.material = this.mDof;
    renderer.setRenderTarget(out);
    Q.render(renderer);
    this.fresh = false;
  }

  dispose() {
    this.tmp.dispose();
    for (const t of this.foc) t.dispose();
    for (const m of [this.mFocus, this.mBlur, this.mDof, this.mCopy]) m.dispose();
    this.quad.dispose();
  }
}
