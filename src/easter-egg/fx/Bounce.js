import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Luz rebotada en pantalla (Épica): lo que está iluminado le tira un poco de su
// color a lo que tiene cerca y lo mira de frente (la pared roja tiñe el piso al
// lado, el piso que pega la lámpara aclara la pared en sombra). Sale del color
// ya iluminado y del G-buffer de fx/Epic (profundidad + normales en vista).
// Epic lo carga solo si el archivo está y lo prende en Épica (LEVELS.bounce);
// va después de la oclusión y los haces, antes de los reflejos.
// Tres pasos:
//  1. juntar (a un cuarto de resolución): unas muestras en un disco alrededor de cada
//     píxel; cada una aporta su color por el factor de forma entre las dos
//     superficies (las dos tienen que mirarse) y la distancia.
//  2. suavizar (separable, a la misma resolución): respeta los bordes de
//     profundidad y de normal, así no se pasa de una pared a la de atrás ni
//     de la pared al piso.
//  3. sumar al color: lo que llega por el albedo de cada píxel. No hay albedo en
//     el G-buffer: se saca del mismo color dividido por la luz que recibe (la
//     ambiente, la luna y los fuegos cercanos: el color es albedo × luz / π).
//     Antes era el tono con un piso de brillo: la madera oscura rebotaba como
//     si fuera gris claro y las paredes en sombra quedaban con una niebla gris
//     manchada.
// NaN: se limpia con los bits (isnan no anda en la AMD del usuario).

const COMMON = `
  uniform sampler2D tDepth, tNormal;
  uniform mat4 uProj, uProjInv;
  vec3 viewPos(vec2 uv, float d) {
    vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  vec3 normalAt(vec2 uv) {
    return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
  }
  vec3 finite(vec3 c) {
    c = mix(c, vec3(0.0), greaterThan(floatBitsToUint(c) & 0x7fffffffu, uvec3(0x7f800000u)));
    return clamp(c, 0.0, 16384.0);
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  // lo que deja pasar la niebla de la escena hasta esa distancia (x: 0 sin
  // niebla, 1 lineal con y-z de cerca a lejos, 2 exponencial con y de densidad)
  uniform vec4 uFog;
  float fogT(float z) {
    if (uFog.x > 1.5) return exp(-uFog.y * uFog.y * z * z);
    if (uFog.x > 0.5) return 1.0 - smoothstep(uFog.y, uFog.z, z);
    return 1.0;
  }
`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const GatherShader = {
  defines: { SAMPLES: 12 },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uRadius: { value: 3.5 },
    uStrength: { value: 1 },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uFog: { value: new THREE.Vector4() },
  },
  vertexShader: VERT,
  fragmentShader: `
    ${COMMON}
    uniform sampler2D tDiffuse;
    uniform float uRadius, uStrength;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float d = texture2D(tDepth, vUv).r;
      if (d >= 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1e4); return; }
      vec3 P = viewPos(vUv, d);
      vec3 N = normalAt(vUv);
      // el radio en metros pasado a pantalla (acotado: de muy cerca no se abre de más)
      float ry = clamp(uRadius * uProj[1][1] * 0.5 / max(-P.z, 0.05), uTexel.y * 3.0, 0.22);
      vec2 r = vec2(ry * uProj[0][0] / uProj[1][1], ry);
      float rot = ign(gl_FragCoord.xy) * 6.2831853;
      // (la distancia al centro también cambia de píxel a píxel: con los mismos
      // anillos en todos quedaban aros marcados)
      float jr = ign(gl_FragCoord.yx + 5.3);
      float R2 = uRadius * uRadius;
      vec3 acc = vec3(0.0);
      vec3 top = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float a = fi * 2.3999632 + rot;
        vec2 uv = vUv + sqrt((fi + jr) / float(SAMPLES)) * vec2(cos(a), sin(a)) * r;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
        float ds = texture2D(tDepth, uv).r;
        if (ds >= 1.0) continue;
        vec3 Ps = viewPos(uv, ds);
        vec3 v = Ps - P;
        float l2 = dot(v, v);
        if (l2 > R2 * 4.0 || l2 < 1e-6) continue;
        vec3 dir = v * inversesqrt(l2);
        float cr = dot(N, dir);
        float cs = -dot(normalAt(uv), dir);
        if (cr <= 0.0 || cs <= 0.0) continue;
        // (tope al brillo: una lámpara en pantalla no salpica puntos; lo lejano
        // trae el color de la niebla, que no es luz que rebote)
        vec3 L = min(texture2D(tDiffuse, uv).rgb, vec3(4.0)) * fogT(-Ps.z);
        // factor de forma: cada muestra es un pedazo de π R² / N del disco (lo
        // pegado se acota: cerca del contacto unas pocas muestras lo llenaban)
        acc += L * (cr * cs * R2 / max(l2, R2 * 0.0625));
        top = max(top, L);
      }
      // lo que sale rebotado (sin el albedo): E / π, con E = acc / (N π), por
      // la compensación del disco. Nunca más que la más brillante de las que le
      // llegan (el tope va después de la compensación: antes se multiplicaba
      // por 12 después y una esquina podía salir más clara que el piso que la
      // iluminaba)
      acc = min(acc * uStrength / (float(SAMPLES) * 9.8696), top);
      // (en el alfa la distancia: con eso se suaviza sin volver a leer la profundidad)
      gl_FragColor = vec4(min(finite(acc), vec3(64.0)), -P.z);
    }`,
};

// (más ancho que antes, de a texel y medio: con 7 texels quedaban manchones
// del tamaño de una mano que caminaban al moverse)
const BlurShader = {
  uniforms: {
    tBounce: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uDir: { value: new THREE.Vector2(1, 0) },
  },
  vertexShader: VERT,
  fragmentShader: `
    ${COMMON}
    uniform sampler2D tBounce;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tBounce, vUv);
      float z = c.a;
      vec3 n0 = normalAt(vUv);
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int i = -4; i <= 4; i++) {
        vec2 uv = vUv + uDir * (float(i) * 1.5);
        vec4 s = texture2D(tBounce, uv);
        // (la normal: la pared no se lleva lo del piso en la esquina)
        float wn = max(dot(n0, normalAt(uv)), 0.0);
        wn *= wn;
        float w = exp(-float(i * i) * 0.1) * exp(-abs(s.a - z) / max(z * 0.04, 1e-3)) * wn * wn;
        acc += s.rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(wsum > 1e-4 ? acc / wsum : c.rgb, z);
    }`,
};

// los fuegos que entran en la cuenta del albedo (los más cerca de la cámara)
const MAX_LIGHTS = 16;

const MixShader = {
  defines: { MAX_LIGHTS },
  uniforms: {
    tDiffuse: { value: null },
    tBounce: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tShadow: { value: null },
    uHasShadow: { value: 0 },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uAmb: { value: new THREE.Vector3() },
    uSky: { value: new THREE.Vector3() },
    uGround: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonCol: { value: new THREE.Vector3() },
    uLPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
    uLCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
    uLPar: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector2()) },
    uNL: { value: 0 },
    uFog: { value: new THREE.Vector4() },
  },
  vertexShader: VERT,
  fragmentShader: `
    ${COMMON}
    uniform sampler2D tDiffuse, tBounce;
    uniform highp sampler2DShadow tShadow;
    uniform float uHasShadow;
    uniform mat4 uCamWorld, uShadowMatrix;
    uniform vec3 uAmb, uSky, uGround, uMoonDir, uMoonCol;
    uniform vec3 uLPos[MAX_LIGHTS];
    uniform vec3 uLCol[MAX_LIGHTS];
    uniform vec2 uLPar[MAX_LIGHTS];
    uniform int uNL;
    varying vec2 vUv;
    float moonLit(vec3 wp) {
      vec4 s = uShadowMatrix * vec4(wp, 1.0);
      s.xyz /= s.w;
      if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
      return texture(tShadow, vec3(s.xy, s.z - 0.0015));
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = texture2D(tDepth, vUv).r;
      if (d >= 1.0) { gl_FragColor = c; return; }
      // lo juntado a un cuarto de resolución, agrandado con los 4 texels de al
      // lado pesados por la distancia y la normal: en un borde se usan los del
      // mismo lado y de la misma cara (la tapa de una pileta no se lleva lo de
      // la pared de atrás). Antes se tiraba el que no coincidía en distancia y
      // los bordes quedaban escalonados de a 4 píxeles.
      vec3 Pv = viewPos(vUv, d);
      float z = -Pv.z;
      vec3 N0 = normalAt(vUv);
      vec2 bs = vec2(textureSize(tBounce, 0));
      vec2 st = vUv * bs - 0.5;
      vec2 i0 = floor(st);
      vec2 fr = st - i0;
      vec3 bacc = vec3(0.0);
      float bw = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k & 1), float(k >> 1));
        vec2 ik = clamp(i0 + o, vec2(0.0), bs - 1.0);
        vec4 s = texelFetch(tBounce, ivec2(ik), 0);
        vec2 wl = mix(1.0 - fr, fr, o);
        float wn = max(dot(N0, normalAt((ik + 0.5) / bs)), 0.0);
        wn *= wn;
        wn *= wn;
        float w = (wl.x * wl.y + 1e-3) * exp(-abs(s.a - z) / max(z * 0.05, 1e-3)) * wn * wn;
        bacc += s.rgb * w;
        bw += w;
      }
      // (si ninguno es de esa distancia, algo más fino que 4 píxeles: nada)
      vec3 E = bacc / max(bw, 1e-4) * smoothstep(0.0, 0.02, bw);
      // el albedo que no hay: el color dividido por la luz que le llega (three
      // la multiplica por albedo / π). La ambiental, la del cielo y el suelo
      // según hacia dónde mira, la luna con su sombra y los fuegos cercanos (sin
      // sombra: donde un fuego no llega el albedo sale de menos y rebota menos,
      // nunca de más). Así sale con su tono y ya oscurecido por la oclusión: la
      // madera oscura rebota poco y marrón, esté en sombra o al lado del farol.
      vec3 Nw = normalize((uCamWorld * vec4(normalAt(vUv), 0.0)).xyz);
      vec3 wp = (uCamWorld * vec4(Pv, 1.0)).xyz;
      vec3 irr = uAmb + mix(uGround, uSky, 0.5 + 0.5 * Nw.y);
      float ml = dot(Nw, uMoonDir);
      if (ml > 0.0) irr += uMoonCol * ml * (uHasShadow > 0.5 ? moonLit(wp + Nw * 0.05) : 1.0);
      for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uNL) break;
        vec3 l = uLPos[i] - wp;
        float dl = length(l);
        float nl = dot(Nw, l) / max(dl, 1e-4);
        if (nl <= 0.0) continue;
        // (la caída de three: distancia a la decay y el corte suave en distance)
        float at = 1.0 / max(pow(dl, uLPar[i].y), 0.01);
        if (uLPar[i].x > 0.0) {
          float q = clamp(1.0 - pow(dl / uLPar[i].x, 4.0), 0.0, 1.0);
          at *= q * q;
        }
        irr += uLCol[i] * (at * nl);
      }
      vec3 a = c.rgb * 3.14159265 / max(irr, vec3(1e-3));
      // (lo que brilla solo, los reflejos y las luces que no se cuentan pasan
      // de 1: se acota sin cambiarle el tono)
      float over = max(max(a.r, a.g), a.b);
      vec3 albedo = a / max(over / 0.9, 1.0);
      // (y lo lejos queda tapado por la niebla, como el resto de la luz)
      gl_FragColor = vec4(finite(c.rgb + albedo * E * fogT(z)), c.a);
    }`,
};

function material(S) {
  return new THREE.ShaderMaterial({
    defines: { ...(S.defines || {}) },
    uniforms: THREE.UniformsUtils.clone(S.uniforms),
    vertexShader: S.vertexShader,
    fragmentShader: S.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

export default class Bounce extends Pass {
  // shared: los uniforms vivos de la pasada de luz de Epic (tDepth, tNormal,
  // uProj, uProjInv...): se comparten, Epic los pone al día cada cuadro
  constructor(shared) {
    super();
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opt);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opt);
    this.gather = material(GatherShader);
    this.blur = material(BlurShader);
    this.mix = material(MixShader);
    for (const m of [this.gather, this.blur, this.mix]) for (const k of ['tDepth', 'tNormal', 'uProj', 'uProjInv']) m.uniforms[k] = shared[k];
    this.mix.uniforms.uCamWorld = shared.uCamWorld;
    this.gather.uniforms.uFog = this.mix.uniforms.uFog;
    this.quad = new FullScreenQuad(this.gather);
    // (la cuenta es física, pero el disco en pantalla junta solo una parte de lo
    // que ve la superficie: se compensa acá)
    this.strength = 12;
    this.game = null;
    // los fuegos de la escena (se vuelven a buscar cada segundo) y los lugares
    // para ordenarlos por distancia sin armar basura en cada cuadro
    this.points = [];
    this.scanT = 0;
    this.near = [];
    this.slots = [];
  }

  // (Epic lo llama al cambiar de calidad; lo que se ajusta va en tune)
  configure(c, game) {
    this.game = game || null;
    this.scanT = 0;
  }

  // o: { samples, radius (m), strength }
  tune(o = {}) {
    if (o.samples && o.samples !== this.gather.defines.SAMPLES) {
      this.gather.defines.SAMPLES = o.samples;
      this.gather.needsUpdate = true;
    }
    if (o.radius) this.gather.uniforms.uRadius.value = o.radius;
    if (o.strength != null) this.strength = o.strength;
  }

  // (a un cuarto de resolución: la luz rebotada es suave y así cuesta poco)
  setSize(w, h) {
    const hw = Math.max(1, Math.ceil(w / 4));
    const hh = Math.max(1, Math.ceil(h / 4));
    this.rtA.setSize(hw, hh);
    this.rtB.setSize(hw, hh);
    this.gather.uniforms.uTexel.value.set(1 / hw, 1 / hh);
  }

  // la luz de la escena, de donde sale el albedo: la ambiental y la del cielo
  // (World: cambian con los relámpagos y el día), la luna con la sombra que
  // usa la pasada de luz de Epic, los fuegos más cerca de la cámara y la niebla
  lights() {
    const u = this.mix.uniforms;
    const game = this.game;
    const w = game?.world;
    const A = w?.ambient;
    const H = w?.hemi;
    u.uAmb.value.set(0, 0, 0);
    u.uSky.value.set(0, 0, 0);
    u.uGround.value.set(0, 0, 0);
    if (A?.visible) u.uAmb.value.set(A.color.r, A.color.g, A.color.b).multiplyScalar(A.intensity);
    if (H?.visible) {
      u.uSky.value.set(H.color.r, H.color.g, H.color.b).multiplyScalar(H.intensity);
      u.uGround.value.set(H.groundColor.r, H.groundColor.g, H.groundColor.b).multiplyScalar(H.intensity);
    }
    const M = w?.moon;
    u.uMoonCol.value.set(0, 0, 0);
    if (M?.visible && M.intensity > 0) {
      const e = M.matrixWorld.elements;
      const t = M.target.matrixWorld.elements;
      u.uMoonDir.value.set(e[12] - t[12], e[13] - t[13], e[14] - t[14]).normalize();
      u.uMoonCol.value.set(M.color.r, M.color.g, M.color.b).multiplyScalar(M.intensity);
    }
    const L = game?.post?.epic?.light?.material?.uniforms;
    if (L) {
      u.tShadow.value = L.tShadow.value;
      u.uHasShadow.value = L.uHasShadow.value;
      u.uShadowMatrix.value.copy(L.uShadowMatrix.value);
    }
    const scene = game?.scene;
    const now = performance.now();
    if (scene && now >= this.scanT) {
      this.scanT = now + 1000;
      this.points.length = 0;
      scene.traverse((o) => {
        if (o.isPointLight) this.points.push(o);
      });
    }
    // (los que se ven: prendidos y con todos los de arriba visibles, en la escena)
    const near = this.near;
    near.length = 0;
    const cam = game?.camera;
    if (cam && scene) {
      const ce = cam.matrixWorld.elements;
      for (const l of this.points) {
        // (las adoptadas de World.adoptLight no: ya están en las del pool)
        if (!(l.intensity > 0) || !l.layers.isEnabled(0)) continue;
        let o = l;
        while (o.visible && o.parent) o = o.parent;
        if (!o.visible || o !== scene) continue;
        const e = l.matrixWorld.elements;
        const s = this.slots[near.length] || (this.slots[near.length] = { l: null, d: 0 });
        s.l = l;
        s.d = (e[12] - ce[12]) ** 2 + (e[13] - ce[13]) ** 2 + (e[14] - ce[14]) ** 2;
        near.push(s);
      }
      near.sort((a, b) => a.d - b.d);
    }
    const n = Math.min(near.length, MAX_LIGHTS);
    for (let i = 0; i < n; i++) {
      const l = near[i].l;
      const e = l.matrixWorld.elements;
      u.uLPos.value[i].set(e[12], e[13], e[14]);
      u.uLCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity);
      u.uLPar.value[i].set(l.distance, l.decay);
    }
    u.uNL.value = n;
    const F = scene?.fog;
    if (F?.isFogExp2) u.uFog.value.set(2, F.density, 0, 0);
    else if (F?.isFog) u.uFog.value.set(1, F.near, F.far, 0);
    else u.uFog.value.set(0, 0, 0, 0);
  }

  render(renderer, writeBuffer, readBuffer) {
    const { rtA, rtB, quad } = this;
    const tx = 1 / rtA.width;
    const ty = 1 / rtA.height;
    this.lights();
    this.gather.uniforms.tDiffuse.value = readBuffer.texture;
    this.gather.uniforms.uStrength.value = this.strength;
    quad.material = this.gather;
    renderer.setRenderTarget(rtA);
    quad.render(renderer);
    const b = this.blur.uniforms;
    quad.material = this.blur;
    b.tBounce.value = rtA.texture;
    b.uDir.value.set(tx, 0);
    renderer.setRenderTarget(rtB);
    quad.render(renderer);
    b.tBounce.value = rtB.texture;
    b.uDir.value.set(0, ty);
    renderer.setRenderTarget(rtA);
    quad.render(renderer);
    const u = this.mix.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tBounce.value = rtA.texture;
    quad.material = this.mix;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    quad.render(renderer);
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.gather.dispose();
    this.blur.dispose();
    this.mix.dispose();
    this.quad.dispose();
  }
}
