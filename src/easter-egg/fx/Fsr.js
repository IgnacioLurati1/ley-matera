import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// AMD FidelityFX Super Resolution 1 (FSR 1, MIT): el juego se dibuja a menos
// resolución y al final se agranda a la pantalla entera en dos pasadas:
//  · EASU: agranda mirando hacia dónde van los bordes (12 muestras, un
//    Lanczos que se estira a lo largo del borde), así no queda borroso;
//  · RCAS: afila lo agrandado sin inventar halos (con menos afilado donde hay
//    ruido, como el grano de película).
// Va último en el composer (todo lo anterior corre a la resolución chica) y
// dibuja directo en la pantalla. Portado de ffx_fsr1.h (sin gather ni
// medio-float). Las divisiones tienen su piso: una división por cero da NaN y
// en las AMD con ANGLE no se puede preguntar isnan().

// Escalas por modo (lo que mide de lado lo que se dibuja, respecto de la pantalla).
// (custom: la resolución base la elige el jugador, de 50 a 100%)
export const FSR_SCALE = { off: 1, ultra: 1 / 1.3, quality: 1 / 1.5, balanced: 1 / 1.7, perf: 1 / 2 };

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const EASU = `
uniform sampler2D tDiffuse;
uniform vec4 con0, con1, con2, con3;
vec3 tap(vec2 p) { return texture2D(tDiffuse, p).rgb; }
void easuSet(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float lenX = max(max(abs(lD - lC), abs(lC - lB)), 1e-5);
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) / lenX, 0.0, 1.0);
  len += lenX * lenX * w;
  float lenY = max(max(abs(lE - lC), abs(lC - lA)), 1e-5);
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) / lenY, 0.0, 1.0);
  len += lenY * lenY * w;
}
void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x))) * len;
  float d2 = min(dot(v, v), clp);
  float wB = 0.4 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  aC += c * w;
  aW += w;
}
float luma(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
void main() {
  // el píxel de salida, en píxeles de la imagen chica (el centro del texel = entero)
  vec2 pp = (gl_FragCoord.xy - 0.5) * con0.xy + con0.zw;
  vec2 fp = floor(pp);
  pp -= fp;
  vec2 p0 = fp * con1.xy + con1.zw;
  vec2 p1 = p0 + con2.xy;
  vec2 p2 = p0 + con2.zw;
  vec2 p3 = p0 + con3.xy;
  vec4 off = vec4(-0.5, 0.5, -0.5, 0.5) * con1.xxyy;
  //    b c
  //  e f g h
  //  i j k l
  //    n o
  vec3 bC = tap(p0 + off.xw), cC = tap(p0 + off.yw);
  vec3 iC = tap(p1 + off.xw), jC = tap(p1 + off.yw), fC = tap(p1 + off.yz), eC = tap(p1 + off.xz);
  vec3 kC = tap(p2 + off.xw), lC = tap(p2 + off.yw), hC = tap(p2 + off.yz), gC = tap(p2 + off.xz);
  vec3 oC = tap(p3 + off.yz), nC = tap(p3 + off.xz);
  float bL = luma(bC), cL = luma(cC), iL = luma(iC), jL = luma(jC), fL = luma(fC), eL = luma(eC);
  float kL = luma(kC), lL = luma(lC), hL = luma(hC), gL = luma(gC), oL = luma(oC), nL = luma(nC);
  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  easuSet(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  easuSet(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  easuSet(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = zro ? 1.0 : inversesqrt(dirR);
  dir.x = zro ? 1.0 : dir.x;
  dir *= dirR;
  len = len * 0.5;
  len *= len;
  float stretch = dot(dir, dir) / max(max(abs(dir.x), abs(dir.y)), 1e-5);
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 - 0.29 * len;
  float clp = 1.0 / lob;
  vec3 mn4 = min(min(fC, gC), min(jC, kC));
  vec3 mx4 = max(max(fC, gC), max(jC, kC));
  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, bC);
  easuTap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, cC);
  easuTap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, iC);
  easuTap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, jC);
  easuTap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, fC);
  easuTap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, eC);
  easuTap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, kC);
  easuTap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, lC);
  easuTap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, hC);
  easuTap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, gC);
  easuTap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, oC);
  easuTap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, nC);
  // (sin peso que valga, el píxel más cercano)
  vec3 c = abs(aW) > 1e-5 ? aC / aW : fC;
  gl_FragColor = vec4(min(mx4, max(mn4, c)), 1.0);
}`;

const RCAS = `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uSharp;
vec3 at(vec2 o) { return texture2D(tDiffuse, (gl_FragCoord.xy + o) * uTexel).rgb; }
float luma(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
void main() {
  //    b
  //  d e f
  //    h
  vec3 b = at(vec2(0.0, -1.0)), d = at(vec2(-1.0, 0.0)), e = at(vec2(0.0)), f = at(vec2(1.0, 0.0)), h = at(vec2(0.0, 1.0));
  float bL = luma(b), dL = luma(d), eL = luma(e), fL = luma(f), hL = luma(h);
  // el ruido (el grano) se afila menos
  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float rng = max(max(max(bL, dL), max(eL, fL)), hL) - min(min(min(bL, dL), min(eL, fL)), hL);
  nz = clamp(abs(nz) / max(rng, 1e-5), 0.0, 1.0);
  nz = 1.0 - 0.5 * nz;
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(max(lobeRGB.r, lobeRGB.g), lobeRGB.b), 0.0)) * uSharp * nz;
  vec3 c = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export default class FsrPass extends Pass {
  // realSize(v): el tamaño de verdad de la pantalla (PostFX le hace creer al
  // resto que la pantalla es la chica)
  constructor(realSize = null) {
    super();
    this.realSize = realSize;
    this.needsSwap = false;
    this.renderToScreen = true;
    this.easu = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, con0: { value: new THREE.Vector4() }, con1: { value: new THREE.Vector4() }, con2: { value: new THREE.Vector4() }, con3: { value: new THREE.Vector4() } },
        vertexShader: VERT,
        fragmentShader: EASU,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.rcas = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uSharp: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: RCAS,
        depthTest: false,
        depthWrite: false,
      }),
    );
    // lo agrandado, a la resolución de la pantalla (lo afila RCAS)
    this.big = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.outSize = new THREE.Vector2();
    this.inSize = new THREE.Vector2(1, 1);
    this.setSharpness(0.8);
  }

  // 0 (nada) a 1 (lo más afilado que da RCAS).
  setSharpness(v) {
    // RCAS: 0 = lo máximo; cada punto más, la mitad de afilado
    const stops = (1 - Math.max(0, Math.min(1, v))) * 2;
    this.rcas.material.uniforms.uSharp.value = v <= 0 ? 0 : Math.pow(2, -stops);
  }

  setSize(w, h) {
    this.inSize.set(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const out = this.realSize ? this.realSize(this.outSize) : renderer.getDrawingBufferSize(this.outSize);
    const W = out.x;
    const H = out.y;
    if (this.big.width !== W || this.big.height !== H) this.big.setSize(W, H);
    const iw = readBuffer.width;
    const ih = readBuffer.height;
    const u = this.easu.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    // (las constantes de FsrEasuCon, con la imagen chica entera como vista)
    u.con0.value.set(iw / W, ih / H, (0.5 * iw) / W - 0.5, (0.5 * ih) / H - 0.5);
    u.con1.value.set(1 / iw, 1 / ih, 1 / iw, -1 / ih);
    u.con2.value.set(-1 / iw, 2 / ih, 1 / iw, 2 / ih);
    u.con3.value.set(0, 4 / ih, 0, 0);
    renderer.setRenderTarget(this.big);
    this.easu.render(renderer);
    const r = this.rcas.material.uniforms;
    r.tDiffuse.value = this.big.texture;
    r.uTexel.value.set(1 / W, 1 / H);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.rcas.render(renderer);
  }

  dispose() {
    this.big.dispose();
    this.easu.dispose();
    this.easu.material.dispose();
    this.rcas.dispose();
    this.rcas.material.dispose();
  }
}
