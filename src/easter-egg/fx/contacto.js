import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { AVATAR_SETS } from '../net/Avatars';
// (FOLIAGE_B de fx/Epic: el pasto alto marcado en el G-buffer; acá a mano,
// Epic importa este archivo)
const FOLIAGE_B = -7;

// Sombras de contacto (2026-10-12, de la lista "Mejoras gráficas para Ultra y
// Épica" que aprobó el usuario: "muertos, gauchos y pasto pegados al piso").
//
// Las sombras de la luna (un mapa de todo el mapa) y las de los fuegos (cubos
// de 512 y difusas) no llegan al detalle de un pie contra el piso: el muerto
// parece flotar y el pasto, pegado encima. Acá, por cada píxel cercano, se
// camina unos centímetros hacia la luna y hacia el fuego que más lo alumbra
// mirando la profundidad del G-buffer de Épica (la misma de la oclusión y los
// reflejos): si algo lo tapa, se le saca la parte de la luz que pone esa luz.
// La parte se calcula como en fx/Bounce (ambiente, cielo, luna con su sombra,
// los fuegos cercanos): sin el albedo, que no hay, el color se escala por
// (luz que queda) / (luz que llega), así que una pared al lado del farol no se
// oscurece por la luna ni al revés. Lo lejano (FAR) y la niebla no se tocan.
//
// Los muertos y los gauchos, además, llevan su oclusión al pie: cada uno es una
// cápsula (de los tobillos al pecho) que tapa la luz que le llega al piso y a
// la pared de al lado (como la oclusión de cápsulas de los juegos grandes): no
// depende de lo que se ve en pantalla ni de dónde está la luz, y entra y sale
// de a poco (CAP_IN) al salir de la tierra, al caer muerto o al quedar tirado.
// El pasto alto del estero (marcado en el G-buffer, FOLIAGE_B) se tapa a la
// mitad entre sí: entero, todo el pajonal quedaba más oscuro.
//
// Va con el G-buffer (Ultra y Épica, o la Personalizada con oclusión o
// reflejos), en los mapas y calidades de config/quality.js GFX_PLUS.contact.
// globalThis.__mduSinContacto = true: sin ellas (como antes).

// fuegos que entran en la cuenta (los que más alumbran cerca de la cámara)
const MAX_L = 4;
// pasos de cada caminata (más juntos al principio: el contacto es lo de al lado)
const STEPS = 8;
// cuánto camina (m) hacia la luna y hacia el fuego, y desde qué distancia de
// la cámara deja de hacerlo (de a poco)
const LEN_MOON = 0.5;
const LEN_LAMP = 0.45;
const FAR = 14;
// lo que tapa: hasta este grosor detrás de lo que se ve (una pierna, una mata)
const THICK = 0.35;
// cuánto de la luz tapada se saca: la luna entera; del fuego un poco menos (su
// cubo de sombra puede ya haberla sacado y quedaría más oscuro de la cuenta)
const K_MOON = 0.9;
const K_LAMP = 0.7;
// cápsulas: cuántas (las más cerca de la cámara), cuánto oscurecen al pie y en
// cuánto entran o salen (s)
const MAX_C = 16;
const K_CAP = 0.85;
const CAP_IN = 0.4;
const CAP_FAR = 30;
// lo que el pasto alto se tapa entre sí (el piso de al lado, entero)
const K_FOL = 0.5;

const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

// (sin sombra de la luna el sampler igual necesita una textura de profundidad:
// si no, WebGL descarta el cuadro; como fx/Epic)
const noShadow = new THREE.DepthTexture(1, 1);
noShadow.compareFunction = THREE.LessEqualCompare;
noShadow.needsUpdate = true;

const ContactShader = {
  defines: { MAX_L, MAX_C, STEPS, THICK: THICK.toFixed(3), FAR: FAR.toFixed(1), FOL: (FOLIAGE_B / 15).toFixed(4), K_FOL: K_FOL.toFixed(2), K_CAP: K_CAP.toFixed(2) },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    tShadow: { value: noShadow },
    uHasShadow: { value: 0 },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uUpView: { value: new THREE.Vector3(0, 1, 0) },
    uMoonV: { value: new THREE.Vector3(0, 1, 0) },
    uMoonE: { value: 0 },
    // ambiente, cielo y suelo (luminancia)
    uAmb: { value: new THREE.Vector3() },
    uLPos: { value: Array.from({ length: MAX_L }, () => new THREE.Vector4()) },
    uLPar: { value: Array.from({ length: MAX_L }, () => new THREE.Vector2()) },
    uNL: { value: 0 },
    // cápsulas en la vista: abajo (xyz, w el radio) y arriba (xyz, w cuánto está)
    uCapA: { value: Array.from({ length: MAX_C }, () => new THREE.Vector4()) },
    uCapB: { value: Array.from({ length: MAX_C }, () => new THREE.Vector4()) },
    // (el centro y el radio al cuadrado de lo que alcanza: casi todos los
    // píxeles quedan afuera con una sola cuenta)
    uCapC: { value: Array.from({ length: MAX_C }, () => new THREE.Vector4()) },
    uNC: { value: 0 },
    uFog: { value: new THREE.Vector4() },
    uFogColor: { value: new THREE.Color() },
    uK: { value: new THREE.Vector4(K_MOON, K_LAMP, LEN_MOON, LEN_LAMP) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tNormal;
    uniform highp sampler2DShadow tShadow;
    uniform float uHasShadow, uMoonE;
    uniform mat4 uShadowMatrix, uProj, uProjInv, uCamWorld;
    uniform vec3 uUpView, uMoonV, uAmb, uFogColor;
    uniform vec4 uLPos[MAX_L];
    uniform vec2 uLPar[MAX_L];
    uniform int uNL, uNC;
    uniform vec4 uCapA[MAX_C];
    uniform vec4 uCapB[MAX_C];
    uniform vec4 uCapC[MAX_C];
    uniform vec4 uFog, uK;
    varying vec2 vUv;

    float viewZ(float d) { return -uProj[3][2] / (d * 2.0 - 1.0 + uProj[2][2]); }
    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    float moonLit(vec3 wp) {
      vec4 c = uShadowMatrix * vec4(wp, 1.0);
      c.xyz /= c.w;
      if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
      return texture(tShadow, vec3(c.xy, c.z - 0.0015));
    }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

    // camina desde P hacia dir: 1 si algo lo tapa al lado, menos si lo tapa
    // más lejos (el contacto queda duro al pie y se abre)
    float march(vec3 P, vec3 dir, float len, float jit) {
      // (el segmento en el espacio de recorte es lineal: cada paso es una
      // mezcla y una división, sin multiplicar matrices)
      vec3 E = P + dir * len;
      if (E.z > -0.06) E = P + dir * (0.95 * (-0.06 - P.z) / max(dir.z, 1e-4));
      vec4 c0 = uProj * vec4(P, 1.0);
      vec4 c1 = uProj * vec4(E, 1.0);
      for (int i = 0; i < STEPS; i++) {
        float f = (float(i) + 0.35 + jit) / float(STEPS);
        f *= f;
        vec4 c = mix(c0, c1, f);
        vec2 uv = c.xy / c.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
        float dz = viewZ(textureLod(tDepth, uv, 0.0).x) + c.w;
        float t = len * f;
        if (dz > 0.01 + t * 0.04 && dz < THICK) {
          vec2 e = min(uv, 1.0 - uv);
          return (1.0 - f * 0.65) * smoothstep(0.0, 0.03, min(e.x, e.y));
        }
      }
      return 0.0;
    }

    // (a media resolución: lo que se saca, la luz que puede explicar el color
    // y la distancia, para que ContactApply lo agrande sin pasarse de borde)
    void main() {
      float d = texture2D(tDepth, vUv).x;
      float z = d >= 0.999999 ? 1e4 : -viewZ(d);
      if (z > FAR || z < 0.2) { gl_FragColor = vec4(0.0, 0.0, z, 1.0); return; }
      vec3 P = viewPos(vUv, d);
      vec4 nr = texture2D(tNormal, vUv);
      vec3 N = nr.xyz * 2.0 - 1.0;
      N *= inversesqrt(max(dot(N, N), 1e-8));
      // las cápsulas de los muertos y los gauchos: el punto más cerca del eje,
      // una esfera ahí (coseno por el ángulo que ocupa); el que está adentro es
      // el mismo muñeco y no cuenta
      float vis = 1.0;
      for (int i = 0; i < MAX_C; i++) {
        if (i >= uNC) break;
        vec3 cc = uCapC[i].xyz - P;
        if (dot(cc, cc) > uCapC[i].w) continue;
        vec3 a = uCapA[i].xyz;
        vec3 ab = uCapB[i].xyz - a;
        float r = uCapA[i].w;
        vec3 v = a + ab * clamp(dot(P - a, ab) / dot(ab, ab), 0.0, 1.0) - P;
        float d2 = dot(v, v);
        if (d2 > 16.0 * r * r || d2 < 0.64 * r * r) continue;
        float dd = sqrt(d2);
        float o = clamp(dot(N, v) / dd, 0.0, 1.0) * r * r / d2;
        vis *= 1.0 - min(o, 1.0) * uCapB[i].w;
      }
      // la luz que llega (luminancia): ambiente + cielo y suelo + luna + fuegos
      float irr = uAmb.x + mix(uAmb.z, uAmb.y, 0.5 + 0.5 * dot(N, uUpView));
      float em = 0.0;
      float ml = dot(N, uMoonV);
      if (ml > 0.0 && uMoonE > 0.0) {
        vec3 wp = (uCamWorld * vec4(P, 1.0)).xyz;
        vec3 nw = (uCamWorld * vec4(N, 0.0)).xyz;
        em = uMoonE * ml * (uHasShadow > 0.5 ? moonLit(wp + nw * 0.05) : 1.0);
      }
      irr += em;
      float eb = 0.0;
      int b = -1;
      for (int i = 0; i < MAX_L; i++) {
        if (i >= uNL) break;
        vec3 l = uLPos[i].xyz - P;
        float dl = length(l);
        float nl = dot(N, l) / max(dl, 1e-4);
        if (nl <= 0.0) continue;
        float at = 1.0 / max(pow(dl, uLPar[i].y), 0.01);
        if (uLPos[i].w > 0.0) {
          float q = clamp(1.0 - pow(dl / uLPos[i].w, 4.0), 0.0, 1.0);
          at *= q * q;
        }
        float e = uLPar[i].x * at * nl;
        irr += e;
        if (e > eb) { eb = e; b = i; }
      }
      float jit = ign(gl_FragCoord.xy) * 0.5;
      vec3 S = P + N * 0.03;
      float cut = 0.0;
      // (con la luz casi rasante la caminata va pegada a la superficie y se
      // choca con sus propios bordes: una pared con el farol justo arriba se
      // apagaba entera; ahí no hay contacto)
      if (em > 0.08 * irr) cut += uK.x * em * march(S, uMoonV, uK.z, jit) * smoothstep(0.15, 0.4, ml);
      // (hacia el fuego, sin llegar a medio metro de él: lo que lo envuelve
      // —el farol, los leños, la llama— no tapa su propia luz)
      if (uK.y > 0.0 && b >= 0 && eb > 0.12 * irr) {
        vec3 l = uLPos[b].xyz - S;
        float dl = length(l);
        float len = min(uK.w, dl - 0.5);
        if (len > 0.05) cut += uK.y * eb * march(S, l / dl, len, jit) * smoothstep(0.15, 0.4, dot(N, l / dl));
      }
      float frac = clamp(cut / max(irr, 1e-4), 0.0, 0.95) * (abs(nr.a - FOL) < 0.02 ? K_FOL : 1.0);
      frac = 1.0 - (1.0 - frac) * (1.0 - K_CAP * (1.0 - vis));
      frac *= 1.0 - smoothstep(FAR * 0.65, FAR, z);
      gl_FragColor = vec4(frac, irr * 0.3183, z, 1.0);
    }`,
};

// A resolución entera: lo de media resolución agrandado con los 4 de al lado
// pesados por la distancia (un borde no se lleva lo de atrás) y aplicado al color.
const ApplyShader = {
  defines: { FAR: FAR.toFixed(1) },
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tC;
    uniform mat4 uProj;
    uniform vec4 uFog;
    uniform vec3 uFogColor;
    varying vec2 vUv;
    float viewZ(float d) { return -uProj[3][2] / (d * 2.0 - 1.0 + uProj[2][2]); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.999999) { gl_FragColor = c; return; }
      float z = -viewZ(d);
      if (z > FAR) { gl_FragColor = c; return; }
      vec2 bs = vec2(textureSize(tC, 0));
      vec2 st = vUv * bs - 0.5;
      vec2 i0 = floor(st);
      vec2 fr = st - i0;
      float fa = 0.0, la = 0.0, ws = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k & 1), float(k >> 1));
        vec4 s = texelFetch(tC, ivec2(clamp(i0 + o, vec2(0.0), bs - 1.0)), 0);
        vec2 wl = mix(1.0 - fr, fr, o);
        float w = (wl.x * wl.y + 1e-3) * exp(-abs(s.b - z) / max(z * 0.04, 0.03));
        fa += s.r * w;
        la += s.g * w;
        ws += w;
      }
      float frac = fa / max(ws, 1e-4) * smoothstep(0.0, 0.05, ws);
      if (frac <= 0.002) { gl_FragColor = c; return; }
      // lo que puso la niebla queda (exp2 o lineal, como three)
      float fogT = uFog.x > 1.5 ? exp(-uFog.y * uFog.y * z * z) : uFog.x > 0.5 ? 1.0 - smoothstep(uFog.y, uFog.z, z) : 1.0;
      vec3 lit = max(c.rgb - uFogColor * (1.0 - fogT), vec3(0.0));
      // lo que brilla solo (llamas, halos, ojos, chispas encima) no se tapa:
      // solo la parte del color que esa luz puede explicar (albedo 1 como mucho)
      float ll = dot(lit, vec3(0.2126, 0.7152, 0.0722));
      // (x2,5: la luz que no se cuenta —el cielo de La Tapera, las ventanas del
      // Monumento— no tiene que apagar el contacto; una llama igual pasa de eso)
      frac *= clamp(2.5 * la / max(ws, 1e-4) * fogT / max(ll, 1e-5), 0.0, 1.0);
      gl_FragColor = vec4(max(c.rgb - frac * lit, vec3(0.0)), c.a);
    }`,
};

export default class Contacto extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      defines: { ...ContactShader.defines },
      uniforms: THREE.UniformsUtils.clone(ContactShader.uniforms),
      vertexShader: ContactShader.vertexShader,
      fragmentShader: ContactShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    const u = this.material.uniforms;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.apply = new THREE.ShaderMaterial({
      defines: { ...ApplyShader.defines },
      uniforms: { tDiffuse: { value: null }, tDepth: u.tDepth, tC: { value: this.rt.texture }, uProj: u.uProj, uFog: u.uFog, uFogColor: u.uFogColor },
      vertexShader: ContactShader.vertexShader,
      fragmentShader: ApplyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.applyQuad = new FullScreenQuad(this.apply);
    this.enabled = false;
    this.points = [];
    this.scanT = 0;
    this.near = [];
    this.slots = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    // cuánto está cada cápsula (entra y sale de a poco): muerto o muñeco → 0..1
    this.capW = new Map();
    this.caps = [];
    this.lastT = performance.now();
    this.mInv = new THREE.Matrix4();
  }

  // Cada cuadro, antes de dibujar (Epic.before): la cámara, la luz de la
  // escena y la sombra de la luna. gb: las texturas del G-buffer (Epic.gbBound).
  prep(game, camera, scene, gb) {
    const u = this.material.uniforms;
    u.tDepth.value = gb.depth;
    u.tNormal.value = gb.normal;
    camera.updateMatrixWorld();
    u.uProj.value.copy(camera.projectionMatrix);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    const V = camera.matrixWorldInverse;
    u.uUpView.value.set(0, 1, 0).transformDirection(V);
    const w = game?.world;
    const A = w?.ambient;
    const H = w?.hemi;
    const amb = u.uAmb.value.set(0, 0, 0);
    if (A?.visible) amb.x = lum(A.color) * A.intensity;
    if (H?.visible) {
      amb.y = lum(H.color) * H.intensity;
      amb.z = lum(H.groundColor) * H.intensity;
    }
    const M = w?.moon;
    u.uMoonE.value = 0;
    u.uHasShadow.value = 0;
    if (M?.visible && M.intensity > 0) {
      const e = M.matrixWorld.elements;
      const t = M.target.matrixWorld.elements;
      u.uMoonV.value.set(e[12] - t[12], e[13] - t[13], e[14] - t[14]).normalize().transformDirection(V);
      u.uMoonE.value = lum(M.color) * M.intensity;
      const st = M.castShadow && M.shadow.map?.depthTexture;
      if (st) {
        u.tShadow.value = st;
        u.uHasShadow.value = 1;
        u.uShadowMatrix.value.copy(M.shadow.matrix);
      }
    }
    if (!u.uHasShadow.value) u.tShadow.value = noShadow;
    const F = scene?.fog;
    if (F?.isFogExp2) u.uFog.value.set(2, F.density, 0, 0);
    else if (F?.isFog) u.uFog.value.set(1, F.near, F.far, 0);
    else u.uFog.value.set(0, 0, 0, 0);
    if (F) u.uFogColor.value.copy(F.color);
    // los fuegos: la lista de la escena cada segundo; cada cuadro, los que más
    // alumbran cerca de la cámara (sin las luces con sombra de Epic, que llevan
    // la luz de un fuego que ya está en la lista: Epic.after se la devuelve)
    const now = performance.now();
    if (scene && now >= this.scanT) {
      this.scanT = now + 1000;
      this.points.length = 0;
      scene.traverse((o) => {
        if (o.isPointLight && o.name !== 'epicShadowLight') this.points.push(o);
      });
    }
    const near = this.near;
    near.length = 0;
    const ce = camera.matrixWorld.elements;
    for (const l of this.points) {
      if (!(l.intensity > 0) || !l.layers.isEnabled(0)) continue;
      let o = l;
      while (o.visible && o.parent) o = o.parent;
      if (!o.visible || o !== scene) continue;
      const e = l.matrixWorld.elements;
      const d2 = (e[12] - ce[12]) ** 2 + (e[13] - ce[13]) ** 2 + (e[14] - ce[14]) ** 2;
      if (l.distance > 0 && d2 > (l.distance + FAR) ** 2) continue;
      const s = this.slots[near.length] || (this.slots[near.length] = { l: null, s: 0 });
      s.l = l;
      s.s = (lum(l.color) * l.intensity) / (1 + d2 / 49);
      near.push(s);
    }
    near.sort((a, b) => b.s - a.s);
    const n = Math.min(near.length, MAX_L);
    for (let i = 0; i < n; i++) {
      const l = near[i].l;
      const e = l.matrixWorld.elements;
      this.tmp.set(e[12], e[13], e[14]).applyMatrix4(V);
      u.uLPos.value[i].set(this.tmp.x, this.tmp.y, this.tmp.z, l.distance);
      u.uLPar.value[i].set(lum(l.color) * l.intensity, l.decay);
    }
    u.uNL.value = n;
    // (la caminata hacia el fuego queda apagada: en las fotos patrón del penal
    // —zona D, una pared con el farol justo arriba— se comía la franja que el
    // farol alumbra, un tercio de la imagen. globalThis.__mduContactoFuegos =
    // true la prende para probarla; queda para revisar)
    u.uK.value.y = globalThis.__mduContactoFuegos === true ? K_LAMP : 0;
    this.capsules(game, camera, V, now);
  }

  // Las cápsulas: los muertos parados (no los que salen de la tierra, ni los
  // muertos, ni los que esperan atrás de una ventana) y los gauchos (los de los
  // otros jugadores y los de las escenas), con su escala.
  capsules(game, camera, V, now) {
    const u = this.material.uniforms;
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const W = this.capW;
    const caps = this.caps;
    caps.length = 0;
    const cp = camera.position;
    const add = (key, x, y, z, s, on, dog) => {
      let w = W.get(key);
      if (w === undefined) w = { k: 0, seen: 0 };
      w.k = Math.max(0, Math.min(1, w.k + (on ? dt : -dt) / CAP_IN));
      w.seen = now;
      W.set(key, w);
      if (w.k <= 0) return;
      const d2 = (x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2;
      if (d2 > CAP_FAR * CAP_FAR) return;
      caps.push({ x, y, z, s, k: w.k, d2, dog });
    };
    for (const zb of game?.zombies?.pool || []) {
      if (!zb.active) {
        W.delete(zb);
        continue;
      }
      const st = zb.state;
      const on = !zb.dead && !zb.hidden && st !== 'rise' && st !== 'approach' && st !== 'cellOut' && st !== 'drop' && st !== 'fall' && st !== 'dogspawn';
      add(zb, zb.pos.x, zb.pos.y, zb.pos.z, zb.scale || 1, on, !!zb.dog);
    }
    for (const A of AVATAR_SETS) {
      if (!A.root?.parent) continue;
      for (const a of A.list.values()) {
        const grp = a.group;
        if (!grp) continue;
        let o = grp;
        while (o.visible && o.parent) o = o.parent;
        const shown = o.visible && !!o.isScene;
        const on = shown && !a.ghost && !a.r?.downed;
        const e = grp.matrixWorld.elements;
        const hips = a.gs?.on ? a.gs.bones?.Hips : null;
        const hx = hips ? hips.matrixWorld.elements[12] : e[12];
        const hz = hips ? hips.matrixWorld.elements[14] : e[14];
        add(a, hx, e[13], hz, 1, on, false);
      }
    }
    // (lo que ya no está: afuera)
    for (const [k, w] of W) if (now - w.seen > 2000) W.delete(k);
    caps.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(caps.length, MAX_C);
    for (let i = 0; i < n; i++) {
      const c = caps[i];
      const s = c.s;
      // (un perro o un puma: bajo y ancho; una persona: de los tobillos al pecho)
      const r = (c.dog ? 0.26 : 0.22) * s;
      this.tmp.set(c.x, c.y + r * 0.9, c.z).applyMatrix4(V);
      this.tmp2.set(c.x, c.y + (c.dog ? 0.55 : 1.25) * s, c.z).applyMatrix4(V);
      u.uCapA.value[i].set(this.tmp.x, this.tmp.y, this.tmp.z, r);
      u.uCapB.value[i].set(this.tmp2.x, this.tmp2.y, this.tmp2.z, c.k);
      const half = this.tmp.distanceTo(this.tmp2) * 0.5 + 4 * r;
      u.uCapC.value[i].set((this.tmp.x + this.tmp2.x) * 0.5, (this.tmp.y + this.tmp2.y) * 0.5, (this.tmp.z + this.tmp2.z) * 0.5, half * half);
    }
    u.uNC.value = n;
  }

  // (la cuenta, a media resolución)
  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    this.apply.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.applyQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
    this.apply.dispose();
    this.applyQuad.dispose();
    this.rt.dispose();
  }
}
