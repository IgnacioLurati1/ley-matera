import * as THREE from 'three';

// La nieve del castillo, de cerca:
//  · destellos: en la nieve (el piso, los techos, los bordes) brillan puntitos
//    que cambian con la mirada, como la nieve de verdad bajo la luna;
//  · huellas: senderos de pisadas en el patio y el palenque (del portón a
//    las puertas, alrededor de la fuente), marcadas en la nieve.

// Destellos para un material de nieve (se agrega al sombreado de siempre).
export function sparkle(mat, strength = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;').replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec3 cell = floor(vSnowW * 26.0);
        vec3 vd = normalize(cameraPosition - vSnowW);
        vec3 vq = floor(vd * 5.0);
        float h = fract(sin(dot(cell + vq * 17.0, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        // un punto redondo (no la celda entera) en un lugar al azar de su celda,
        // con el borde suavizado según lo que mide un pixel
        vec3 o = fract(vec3(h * 7.13, h * 3.71, h * 5.29)) - 0.5;
        float d = length(fract(vSnowW * 26.0) - 0.5 - o * 0.4);
        float aa = max(fwidth(d), 0.03);
        float dot1 = 1.0 - smoothstep(0.16 - aa, 0.16 + aa, d);
        // de cerca nomás: de lejos titilaban como cuadraditos
        float s = smoothstep(0.9965, 1.0, h) * dot1 * (1.0 - smoothstep(3.0, 12.0, length(cameraPosition - vSnowW)));
        totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * s * ${(3.2 * strength).toFixed(2)};
      }`,
    );
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|snowSparkle2`;
  mat.needsUpdate = true;
  return mat;
}

// Una pisada de bota (óvalo y taco) para la textura de las huellas.
let PRINT = null;
function printTex() {
  if (PRINT) return PRINT;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 128);
  const grad = x.createRadialGradient(32, 40, 4, 32, 40, 28);
  grad.addColorStop(0, 'rgba(60,72,96,0.55)');
  grad.addColorStop(1, 'rgba(60,72,96,0)');
  x.fillStyle = grad;
  x.beginPath();
  x.ellipse(32, 40, 20, 30, 0, 0, Math.PI * 2);
  x.fill();
  const g2 = x.createRadialGradient(32, 100, 2, 32, 100, 18);
  g2.addColorStop(0, 'rgba(60,72,96,0.5)');
  g2.addColorStop(1, 'rgba(60,72,96,0)');
  x.fillStyle = g2;
  x.beginPath();
  x.ellipse(32, 100, 15, 18, 0, 0, Math.PI * 2);
  x.fill();
  PRINT = new THREE.CanvasTexture(c);
  return PRINT;
}

// Senderos de pisadas: cada uno es una curva por el piso (x, z); floorAt da la altura.
export function buildTracks(w, paths) {
  const pos = [];
  const uv = [];
  const idx = [];
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (const pts of paths) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength();
    const n = Math.floor(len / 0.36);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      curve.getPointAt(u, tmp);
      curve.getTangentAt(u, tan);
      const side = k % 2 ? 1 : -1;
      // un poco de desorden, como camina la gente
      const jit = Math.sin(k * 12.9898) * 0.03;
      const px = tmp.x + -tan.z * side * 0.13 + jit;
      const pz = tmp.z + tan.x * side * 0.13 - jit;
      const y = w.floorAt(px, pz) + 0.008;
      const a = Math.atan2(tan.x, tan.z) + Math.sin(k * 7.1) * 0.12;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const hw = 0.075;
      const hl = 0.16;
      const b = pos.length / 3;
      for (const [lx, lz, uu, vv] of [[-hw, -hl, 0, 0], [hw, -hl, 1, 0], [hw, hl, 1, 1], [-hw, hl, 0, 1]]) {
        pos.push(px + lx * c + lz * s, y, pz - lx * s + lz * c);
        uv.push(uu, vv);
      }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map: printTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  m.matrixAutoUpdate = false;
  w.root.add(m);
  return m;
}
