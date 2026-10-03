import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Suavizado temporal del pasto (Épica). El pasto del estero (hojas y cañas
// más finas que un píxel) titilaba al moverse aunque hubiera MSAA: cada cuadro
// la placa "elige" otros píxeles de cada hoja. Acá, solo donde hay pasto (la
// marca del G-buffer de fx/Epic), la imagen se promedia con la de los cuadros
// anteriores, llevada a donde está ahora (con la profundidad y la cámara de
// antes) y recortada a los colores de alrededor. Lo demás (muertos, chispas,
// paredes) queda como está: con todo el cuadro, un muerto que cruzaba corriendo
// quedaba medio transparente. Sin correr la cámara (con eso, lo que no es pasto
// temblaba). Va antes del mate en la mano y del bloom.

// corrimientos (en píxeles) de cada cuadro: Halton 2,3
const JIT = [];
for (let i = 1; i <= 8; i++) {
  const h = (b) => {
    let f = 1;
    let r = 0;
    let n = i;
    while (n > 0) {
      f /= b;
      r += f * (n % b);
      n = Math.floor(n / b);
    }
    return r;
  };
  JIT.push([h(2) - 0.5, h(3) - 0.5]);
}
// cuánto queda de lo de antes (más, más suave y más estela)
const KEEP = 0.9;

// El pasto corrido una fracción de píxel por cuadro (solo en el dibujo del
// mundo, fx/PostFX WorldPass): sin correr nada, parado, el promedio era siempre
// la misma imagen y los bordes del pajonal quedaban en escalera (con SMAA solo;
// el MSAA lo tapaba pero costaba ~17% en el estero). Corrido, el promedio de
// los cuadros cubre cada hoja como con varias muestras. Lo demás no se corre.
// (globalThis.__mduNoGrassJit: quieto, como antes)
export const GRASS_JIT = { value: new THREE.Vector2() };
const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
export function jitterGrass(mat) {
  if (!mat || mat.userData.grassJit) return mat;
  mat.userData.grassJit = true;
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey;
  const base = key === PROTO_KEY ? () => prev.toString() : () => key.call(mat);
  mat.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    sh.uniforms.uGrassJit = GRASS_JIT;
    sh.vertexShader = `uniform vec2 uGrassJit;\n${sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tgl_Position.xy += uGrassJit * gl_Position.w;')}`;
  };
  mat.customProgramCacheKey = () => `${base()}|gjit`;
  return mat;
}

const TAAShader = {
  uniforms: {
    tCur: { value: null },
    tHist: { value: null },
    tDepth: { value: null },
    tMask: { value: null },
    uFol: { value: 0 },
    uInvVP: { value: new THREE.Matrix4() },
    uPrevVP: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2() },
    uKeep: { value: KEEP },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tCur, tHist, tDepth, tMask;
    uniform float uFol;
    uniform mat4 uInvVP, uPrevVP;
    uniform vec2 uTexel;
    uniform float uKeep;
    varying vec2 vUv;
    vec3 toY(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
    vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
    // (un NaN o un Inf acá quedaría para siempre en la historia)
    vec3 finite(vec3 c) {
      c = mix(c, vec3(0.0), greaterThan(floatBitsToUint(c) & 0x7fffffffu, uvec3(0x7f800000u)));
      return clamp(c, 0.0, 16384.0);
    }
    // ¿hay pasto en este píxel o al lado? (la marca va a media resolución)
    float grass(vec2 uv) { return abs(texture2D(tMask, uv).a - uFol) < 0.02 ? 1.0 : 0.0; }
    void main() {
      vec3 cur = finite(texture2D(tCur, vUv).rgb);
      float g = grass(vUv);
      g = max(g, 0.5 * max(max(grass(vUv + vec2(uTexel.x * 2.0, 0.0)), grass(vUv - vec2(uTexel.x * 2.0, 0.0))), max(grass(vUv + vec2(0.0, uTexel.y * 2.0)), grass(vUv - vec2(0.0, uTexel.y * 2.0)))));
      if (g <= 0.0) {
        gl_FragColor = vec4(cur, 1.0);
        return;
      }
      // los colores de alrededor: la historia se recorta a esa caja
      vec3 mn = toY(cur), mx = mn, m1 = mn, m2 = mn * mn;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        vec3 s = toY(finite(texture2D(tCur, vUv + vec2(float(i), float(j)) * uTexel).rgb));
        mn = min(mn, s);
        mx = max(mx, s);
        m1 += s;
        m2 += s * s;
      }
      // (la caja por varianza, más ajustada que el mínimo y el máximo)
      m1 /= 9.0;
      vec3 sd = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
      mn = max(mn, m1 - sd * 1.25);
      mx = min(mx, m1 + sd * 1.25);
      // dónde estaba este punto en el cuadro anterior
      float d = texture2D(tDepth, vUv).x;
      vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      wp /= wp.w;
      vec4 pc = uPrevVP * wp;
      vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
      float keep = uKeep * g;
      if (pc.w <= 0.0 || puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) keep = 0.0;
      // lo que se mueve rápido en pantalla guarda menos (menos estela)
      keep *= 1.0 - clamp(length((puv - vUv) / uTexel) / 60.0, 0.0, 0.35);
      vec3 hist = toY(finite(texture2D(tHist, puv).rgb));
      hist = fromY(clamp(hist, mn, mx));
      // (con peso por brillo: un destello no queda marcado varios cuadros)
      float wc = (1.0 - keep) / (1.0 + dot(cur, vec3(0.299, 0.587, 0.114)));
      float wh = keep / (1.0 + dot(hist, vec3(0.299, 0.587, 0.114)));
      gl_FragColor = vec4((cur * wc + hist * wh) / max(wc + wh, 1e-5), 1.0);
    }`,
};

export default class TAAPass extends Pass {
  constructor(camera, depth, mask, fol) {
    super();
    this.camera = camera;
    // (la profundidad de este cuadro: la del mundo con MSAA o la del G-buffer;
    // la marca del pasto: el alfa del G-buffer de Épica, que vale fol)
    this.depth = depth;
    this.mask = mask;
    this.fol = fol;
    this.needsSwap = true;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.hist = [rt(), rt()];
    this.cur = 0;
    this.valid = false;
    this.w = 1;
    this.h = 1;
    this.n = 0;
    this.vp = new THREE.Matrix4();
    this.prevVP = new THREE.Matrix4();
    this.prevPos = new THREE.Vector3();
    this.jittered = false;
    this.shake = false;
    // el corrimiento del pasto de este cuadro, en píxeles (GRASS_JIT)
    this.gj = new THREE.Vector2();
    this.gn = 0;
    this.mat = new THREE.ShaderMaterial({ ...TAAShader, uniforms: THREE.UniformsUtils.clone(TAAShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null } },
      vertexShader: TAAShader.vertexShader,
      fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }',
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new FullScreenQuad(this.copyMat);
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    for (const t of this.hist) t.setSize(w, h);
    this.valid = false;
  }

  // Antes de dibujar el cuadro: la cámara corrida una fracción de píxel.
  jitter() {
    const c = this.camera;
    if (!this.enabled || !c) return;
    c.clearViewOffset();
    c.updateMatrixWorld();
    this.vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    // un salto de cámara (cinemáticas, reaparecer): se empieza de cero
    if (c.position.distanceToSquared(this.prevPos) > 4) this.valid = false;
    this.prevPos.copy(c.position);
    if (globalThis.__mduNoGrassJit === true) this.gj.set(0, 0);
    else this.gj.fromArray(JIT[this.gn++ % JIT.length]);
    // (correr la cámara ayuda al pasto, pero lo que no es pasto temblaba)
    if (this.shake) {
      const [jx, jy] = JIT[this.n++ % JIT.length];
      c.setViewOffset(this.w, this.h, jx, jy, this.w, this.h);
      this.jittered = true;
    }
  }

  // Después: la cámara vuelve a su lugar (lo demás del juego la usa derecha).
  unjitter() {
    if (!this.jittered) return;
    this.camera.clearViewOffset();
    this.jittered = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const next = this.hist[1 - this.cur];
    const u = this.mat.uniforms;
    u.tCur.value = readBuffer.texture;
    u.tHist.value = this.hist[this.cur].texture;
    u.tDepth.value = this.depth();
    u.tMask.value = this.mask();
    u.uFol.value = this.fol;
    // (la inversa de la cámara corrida, con la que se dibujó este cuadro)
    const c = this.camera;
    u.uInvVP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).invert();
    u.uPrevVP.value.copy(this.valid ? this.prevVP : this.vp);
    u.uTexel.value.set(1 / this.w, 1 / this.h);
    u.uKeep.value = this.valid && u.tDepth.value ? KEEP : 0;
    renderer.setRenderTarget(next);
    this.quad.render(renderer);
    this.copyMat.uniforms.tSrc.value = next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
    this.cur = 1 - this.cur;
    this.prevVP.copy(this.vp);
    this.valid = true;
  }

  dispose() {
    for (const t of this.hist) t.dispose();
    this.mat.dispose();
    this.copyMat.dispose();
    this.quad.dispose();
    this.copy.dispose();
  }
}
