import * as THREE from 'three';
import { MAP_W, MAP_H } from '../config/map';

// El cielo del castillo: noche despejada de alta montaña, con muchísimas
// estrellas, la Vía Láctea cruzada por sus nubes oscuras y la luna llena que
// hace brillar la nieve. Usa los mismos uniforms que el cielo de siempre
// (World.buildSky), así el clima (world/Weather.js) lo maneja igual: nubes,
// relámpagos, la luna roja y la niebla del horizonte.

export function buildCastleSky(w) {
  const geo = new THREE.SphereGeometry(300, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uCloud: { value: 0.15 },
      uFlash: { value: 0 },
      uBlood: { value: 0 },
      uFogAmt: { value: 0 },
      uFogColor: { value: new THREE.Color(0x141b27) },
      uDay: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.86, 0.1, -0.5).normalize() },
      // el eje de la Vía Láctea (normal del gran círculo que dibuja)
      uGal: { value: new THREE.Vector3(0.55, 0.35, -0.76).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime, uCloud, uFlash, uBlood, uFogAmt;
      uniform vec3 uFogColor, uGal;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // del horizonte (un azul frío, con el resplandor de la nieve) al cenit casi negro
        vec3 horizon = vec3(0.07, 0.09, 0.14);
        vec3 zenith = vec3(0.006, 0.01, 0.026);
        vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.6, h));
        col += vec3(0.05, 0.07, 0.11) * exp(-max(h, 0.0) * 9.0) * 0.6;
        // la Vía Láctea: una franja con polvo oscuro en el medio
        float g = dot(d, uGal);
        float band = exp(-g * g * 26.0);
        vec3 t1 = normalize(cross(uGal, vec3(0.0, 1.0, 0.0)));
        vec3 t2 = cross(uGal, t1);
        vec2 gp = vec2(atan(dot(d, t2), dot(d, t1) + 1e-5) * 2.2, g * 9.0);
        float cloud = fbm(gp * 1.6 + 3.0);
        float dust = smoothstep(0.45, 0.75, fbm(gp * 2.6 + 11.0)) * exp(-g * g * 70.0);
        float mw = band * (0.35 + cloud * 0.9) * (1.0 - dust * 0.85);
        vec3 mwCol = mix(vec3(0.55, 0.62, 0.85), vec3(0.95, 0.85, 0.7), smoothstep(0.55, 0.9, cloud));
        float above = smoothstep(-0.02, 0.18, h);
        col += mwCol * mw * 0.16 * above;
        // estrellas: muchas, de colores apenas distintos; más juntas en la Vía Láctea
        vec3 cell = floor(d * 240.0);
        float r = hash(cell);
        float thr = 0.9968 - band * 0.0035;
        float star = step(thr, r) * above;
        float tw = 0.65 + 0.35 * sin(uTime * (1.5 + hash(cell + 7.0) * 3.0) + r * 60.0);
        vec3 starCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash(cell + 3.0));
        // algunas grandes y brillantes
        float big = step(0.99975, r) * above;
        // nubes finitas que tapan las estrellas y se prenden con los relámpagos
        // (bajo el horizonte no hay nubes: el tope evita dividir por cero)
        vec2 cp = d.xz / max(h + 0.25, 0.05) * 1.4 + vec2(uTime * 0.01, uTime * 0.004);
        float cl = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.2, fbm(cp)) * smoothstep(-0.02, 0.15, h);
        col += starCol * (star * tw * 0.9 + big * 1.6) * (1.0 - cl);
        col *= 1.0 - cl * 0.25;
        vec3 cloudCol = mix(vec3(0.05, 0.06, 0.08), vec3(0.09, 0.02, 0.02), uBlood);
        col = mix(col, cloudCol, cl * 0.9);
        col += uFlash * (vec3(0.35, 0.4, 0.55) * (0.4 + cl * 1.2)) * smoothstep(-0.1, 0.3, h);
        // la luna roja tiñe todo
        col = mix(col, col * vec3(1.6, 0.5, 0.45) + vec3(0.06, 0.0, 0.0) * above, uBlood * 0.8);
        col = mix(col, uFogColor, uFogAmt * (1.0 - smoothstep(0.0, 0.7, h) * 0.5));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.position.set(MAP_W / 2, 0, MAP_H / 2);
  sky.renderOrder = -1;
  w.sky = sky;
  w.root.add(sky);
  // la luna llena, alta sobre la cordillera
  const moonDir = new THREE.Vector3(-0.42, 0.66, -0.62).normalize();
  const moonMat = new THREE.SpriteMaterial({ map: moonTexture(), color: 0xf2f6ff, fog: false, depthWrite: false, transparent: true });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.set(16, 16, 1);
  moon.position.copy(moonDir).multiplyScalar(260).add(new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2));
  w.root.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.dot, color: 0x5a6a90, fog: false, depthWrite: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
  halo.scale.set(90, 90, 1);
  halo.position.copy(moon.position);
  w.root.add(halo);
  w.moonDir = moonDir;
  w.moonSprite = moon;
  w.moonHalo = halo;
}

// La luna con sus mares (manchas grises) pintada en un canvas.
function moonTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.92, 'rgba(236,240,248,1)');
  g.addColorStop(1, 'rgba(236,240,248,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(S / 2, S / 2, S * 0.5, 0, Math.PI * 2);
  x.fill();
  // los mares
  x.fillStyle = 'rgba(150,158,176,0.45)';
  for (const [mx, my, r] of [[0.38, 0.36, 0.13], [0.58, 0.42, 0.11], [0.45, 0.58, 0.09], [0.66, 0.62, 0.07], [0.33, 0.52, 0.06]]) {
    x.beginPath();
    x.arc(mx * S, my * S, r * S, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
