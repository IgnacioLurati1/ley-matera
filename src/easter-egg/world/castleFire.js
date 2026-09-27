import * as THREE from 'three';

// El fuego del castillo: la llama de planos cruzados (un solo material para
// todas, que baila con el reloj del juego) y las brasas.

// ---------------- fuego ----------------
// Llama de dos planos cruzados con un shader que la hace bailar. Es un solo
// material para todas (se funden con la utilería) y la semilla de cada una
// sale de dónde está.
let FLAME = null;
export function flameMaterial() {
  if (FLAME) return FLAME;
  FLAME = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float seed = dot(floor(vW.xz * 2.0), vec2(1.7, 9.2));
        float t = uTime * 2.2 + seed;
        float x = (vUv.x - 0.5) * 2.0;
        float y = clamp(vUv.y, 0.0, 1.0);
        float turb = vn(vec2(x * 2.5, y * 3.0 - t * 1.6)) * 0.55 + vn(vec2(x * 5.0 + 3.0, y * 6.0 - t * 2.7)) * 0.3;
        float width = (1.0 - y) * 0.9 * (0.75 + 0.25 * sin(t * 3.0 + y * 6.0)) + 0.001;
        float dx = abs(x + (turb - 0.45) * 0.5 * y);
        float body = 1.0 - smoothstep(width * 0.25, width, dx);
        float tip = 1.0 - smoothstep(0.45 + turb * 0.3, 1.0, y);
        float a = clamp(body * smoothstep(0.0, 0.08, y) * tip * 1.25, 0.0, 1.0);
        if (a < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.85, 0.45), clamp(1.0 - (y + (1.0 - body) * 0.3) / 0.55, 0.0, 1.0));
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
  });
  return FLAME;
}

// Una llama de w de ancho y h de alto, parada en (x, y, z).
export function flame(g, x, y, z, w, h) {
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(geo, flameMaterial());
    m.position.set(x, y, z);
    m.rotation.y = ry + 0.4;
    m.renderOrder = 5;
    g.add(m);
  }
}

// Brasas: piedritas coloradas que brillan.
let EMBER = null;
export function emberMat() {
  if (!EMBER) EMBER = new THREE.MeshStandardMaterial({ color: 0x2a0a02, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 0.9 });
  return EMBER;
}
