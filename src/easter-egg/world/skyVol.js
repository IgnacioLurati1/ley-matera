import * as THREE from 'three';

// Cielo con volumen (2026-10-12, el usuario, mejoras gráficas de Ultra y
// Épica #14: "nubes que tapan la luna, rayos de luna"). Sobre el cielo de
// siempre (World.buildSky) y el del castillo (castleSky.js), sin cambiar sus
// colores ni su clima:
//  - las nubes con luz: el borde que da a la luna se aclara (el "borde de
//    plata"), lo grueso se oscurece y lo fino se prende cerca de la luna;
//  - una segunda capa, alta y fina, más lenta: con la de abajo da el fondo;
//  - rayos de luna: cerca de la luna, lo que queda entre nube y nube brilla
//    según cuánto cielo libre hay hasta la luna (los haces salen de ella);
//  - las nubes tapan la luna: la luna y su halo son sprites delante del domo
//    (las nubes del domo quedaban atrás). Un velo, un cuadrado delante de la
//    luna, dibuja las mismas nubes del domo (cada píxel busca dónde su rayo
//    toca el domo) y el domo no las pinta ahí.
// Todo con uVol (0 a 1): sin recompilar nada al prender o apagar.
// globalThis.__mduSinCieloVol: como antes (uVol queda en 0).

export function skyVolUniforms(moonDir) {
  return {
    uVol: { value: 0 },
    uMoonDir: { value: moonDir ? moonDir.clone() : new THREE.Vector3(0, 1, 0) },
    uMoonPos: { value: new THREE.Vector3() },
    uMoonTint: { value: new THREE.Vector3(0.5, 0.56, 0.72) },
  };
}

// Lo que va en el fragment del domo (antes de main): las cuentas de las nubes
// con luz, los rayos y la máscara de la luna. S: la escala de la proyección de
// las nubes del cielo; DR: lo que corren por segundo (vec2). Necesita del
// shader de afuera vnoise() y fbm() y los uniforms uTime y uCloud.
export function skyVolGlsl(S, DR) {
  return /* glsl */ `
  uniform float uVol;
  uniform vec3 uMoonDir, uMoonPos, uMoonTint;
  varying vec3 vW;
  float svFbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s * 1.11; }
  vec2 svCp(vec3 d) { return d.xz / max(d.y + 0.25, 0.05) * ${S.toFixed(2)} + vec2(${DR}) * uTime; }
  // cuánto de este píxel cae sobre la luna y su halo (lo dibuja el velo)
  float svMoonMask() {
    vec3 rd = normalize(vW - cameraPosition);
    vec3 md = normalize(uMoonPos - cameraPosition);
    return smoothstep(0.9775, 0.9895, dot(rd, md));
  }
  // la nube con la luz de la luna: base es su color de siempre
  // (k: cuánto; de día, en el atardecer de La Tapera, la luz de las nubes es la del sol: nada)
  vec3 svCloudLit(vec3 base, vec3 d, vec2 cp, float fb, float cl, float k) {
    vec2 tm = svCp(uMoonDir) - cp;
    tm /= max(length(tm), 1e-3);
    float fl = fbm(cp + tm * 0.09);
    // el borde que da a la luna, más claro; adentro de lo grueso, más oscuro
    float edge = clamp((fb - fl) * 7.0 + 0.5, 0.0, 1.0);
    float c = max(dot(d, uMoonDir), 0.0);
    float wide = c * c * c;
    float near = pow(c, 22.0);
    vec3 lit = base * (0.62 + 0.6 * edge) * (1.0 - 0.4 * cl * cl);
    lit += uMoonTint * (edge * 0.14 * wide + near * (1.0 - cl * 0.75) * 0.4);
    return mix(base, lit, k);
  }
  // la capa alta: fina, lenta y más grande (atrás de la de abajo)
  float svHigh(vec3 d, float hm) {
    vec2 cp2 = d.xz / max(d.y + 0.55, 0.1) * ${(S * 0.55).toFixed(2)} + vec2(${DR}) * uTime * 0.45 + 7.0;
    return smoothstep(0.5 - uCloud * 0.3, 0.92, svFbm3(cp2)) * hm * 0.5;
  }
  // los rayos: lo libre en el camino hasta la luna (cerca de ella)
  float svRays(vec3 d) {
    float c = dot(d, uMoonDir);
    if (c < 0.82) return 0.0;
    float lo = 0.62 - uCloud * 0.45, hi = 0.95 - uCloud * 0.2;
    float occ = 0.0;
    for (int i = 0; i < 7; i++) {
      vec3 dd = normalize(mix(d, uMoonDir, (float(i) + 0.5) / 7.0));
      occ += smoothstep(lo, hi, svFbm3(svCp(dd))) * smoothstep(-0.02, 0.15, dd.y);
    }
    float k = (c - 0.82) / 0.18;
    return (1.0 - occ / 7.0) * k * k * k;
  }`;
}

// Lo que va en el vertex del domo: la posición en el mundo (para la máscara).
export const SKYVOL_VERT = 'varying vec3 vW;';
export const SKYVOL_VERT_MAIN = 'vW = (modelMatrix * vec4(position, 1.0)).xyz;';

// El velo: un cuadrado delante de la luna que dibuja las nubes del domo encima
// de la luna y de su halo. colGlsl: el cuerpo de una función
// vec3 svBase(vec3 d, float h) con el color de siempre de las nubes de ese
// cielo; flashGlsl: lo que el relámpago les suma (usa cl y h).
export function buildVeil(w, sky, moonPos, opts) {
  const U = sky.material.uniforms;
  const S = opts.S;
  const R = sky.geometry.parameters?.radius || 300;
  const uniforms = {
    uTime: U.uTime,
    uCloud: U.uCloud,
    uFlash: U.uFlash,
    uBlood: U.uBlood,
    uFogAmt: U.uFogAmt,
    uFogColor: U.uFogColor,
    uDay: U.uDay || { value: 0 },
    uSun: U.uSun || { value: new THREE.Vector3(0, 1, 0) },
    uVol: U.uVol,
    uMoonDir: U.uMoonDir,
    uMoonPos: U.uMoonPos,
    uMoonTint: U.uMoonTint,
    uCenter: { value: sky.position.clone() },
    uR: { value: R * (sky.scale?.x || 1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uCloud, uFlash, uBlood, uFogAmt, uDay, uR;
      uniform vec3 uFogColor, uSun, uCenter;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
      ${skyVolGlsl(S, opts.DR)}
      vec3 svBase(vec3 d, float h) { ${opts.colGlsl} }
      void main() {
        float m = svMoonMask() * uVol * (1.0 - uDay);
        if (m < 0.002) discard;
        // dónde toca el domo el rayo de este píxel: la misma nube que pinta el domo
        vec3 rd = normalize(vW - cameraPosition);
        vec3 ro = cameraPosition - uCenter;
        float b = dot(ro, rd);
        float c = dot(ro, ro) - uR * uR;
        float t = -b + sqrt(max(b * b - c, 0.0));
        vec3 d = normalize(ro + rd * t);
        float h = d.y;
        vec2 cp = svCp(d);
        float fb = fbm(cp);
        float cl = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.2, fb) * smoothstep(-0.02, 0.15, h);
        vec3 col = svCloudLit(svBase(d, h), d, cp, fb, cl, uVol * (1.0 - uDay));
        ${opts.flashGlsl || ''}
        col = mix(col, uFogColor, uFogAmt * (1.0 - smoothstep(0.0, 0.7, h) * 0.5));
        gl_FragColor = vec4(max(col, vec3(0.0)), cl * 0.9 * m);
      }`,
  });
  // de frente al medio del mapa, un poco más cerca que la luna (se dibuja después)
  const dir = moonPos.clone().sub(sky.position).normalize();
  const size = opts.size || 130;
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  veil.position.copy(sky.position).addScaledVector(dir, moonPos.distanceTo(sky.position) - 12);
  veil.lookAt(sky.position);
  veil.renderOrder = 0;
  // (no va en el espejo del agua ni en el G-buffer: es parte del cielo)
  veil.userData.reflect = false;
  veil.visible = false;
  // (escondido se compila igual en la llegada: ui/Arrival.js warmWorld)
  (w.warmHidden ||= []).push(veil);
  U.uMoonPos.value.copy(moonPos);
  w.root.add(veil);
  return veil;
}

// Cada cuadro (World.setMoon): prendido o no (de a poco), el color de la luz
// de la luna para las nubes y el velo.
export function updateSkyVol(w, want) {
  const U = w.sky?.material?.uniforms;
  if (!U?.uVol) return;
  const now = w.g?.time || 0;
  const dt = Math.max(0, Math.min(0.1, now - (w.svT ?? now)));
  w.svT = now;
  // (la primera vez, ya en su lugar: al cargar el mapa no se ve el fundido)
  if (w.svFirst === undefined) {
    w.svFirst = false;
    U.uVol.value = want ? 1 : 0;
  }
  const v = Math.max(0, Math.min(1, U.uVol.value + (want ? dt : -dt) * 1.2));
  U.uVol.value = v;
  if (w.skyVeil) w.skyVeil.visible = v > 0.002;
  const mc = w.moonSprite?.material?.color;
  if (mc) U.uMoonTint.value.set(mc.r, mc.g, mc.b).multiplyScalar(0.62);
}
