import * as THREE from 'three';
import { heightAt } from '../world/Levels';
import { ZONES } from '../config/map';

// La niebla baja del Monumento: capas horizontales de niebla que siguen al
// piso (no una sola altura como la del estero: el Patio baja en gradas, la
// explanada y el parque están 2,6 m abajo, la costanera más, y el río).
// Cada capa está a una altura fija y solo se arma sobre las celdas cuyo piso
// le queda entre 5 cm y 1,1 m abajo; en el shader, un mapa de alturas del
// piso le dice a cada punto cuánto tiene debajo, y la niebla es espesa al
// ras y se pierde hacia el metro. Se mueve con el viento (dos ruidos), no se
// arma bajo techo (la Cripta, la Sala, el Mirador) y se abre alrededor de la
// cámara. Sobre el río va un manto aparte, más alto y más denso a lo lejos.

const VS = `
  varying vec3 vW;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FS = `
  uniform sampler2D tNoise;
  uniform sampler2D tFloor;
  uniform vec4 uFB;
  uniform float uT;
  uniform vec3 uCol;
  uniform vec3 uCam;
  uniform float uA;
  uniform float uTop;
  varying vec3 vW;
  void main(){
    float fl = texture2D(tFloor, (vW.xz - uFB.xy) * uFB.zw).r;
    float d = vW.y - fl;
    float prof = smoothstep(0.0, 0.18, d) * (1.0 - smoothstep(uTop * 0.25, uTop, d));
    float n = texture2D(tNoise, vW.xz * 0.04 + uT * vec2(0.013, 0.005)).r * 0.62 + texture2D(tNoise, vW.xz * 0.115 - uT * vec2(0.006, 0.012)).r * 0.38;
    n = smoothstep(0.34, 0.9, n);
    float dist = length(vW.xz - uCam.xz);
    float near = smoothstep(0.8, 4.0, dist) * (1.0 - smoothstep(70.0, 130.0, dist) * 0.5);
    float a = prof * n * near * uA;
    gl_FragColor = vec4(uCol * a, a);
  }`;

function noiseTex(size = 128) {
  const data = new Uint8Array(size * size);
  let s = 4242;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grids = [6, 12, 24].map((n) => ({ n, v: Float32Array.from({ length: n * n }, rnd) }));
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      let amp = 0.55;
      let tot = 0;
      for (const { n, v } of grids) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const at = (i, j) => v[((j + n) % n) * n + ((i + n) % n)];
        const u = sm(fx - ix);
        const ww = sm(fy - iy);
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
        const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
        acc += (a + (b - a) * ww) * amp;
        tot += amp;
        amp *= 0.5;
      }
      data[y * size + x] = Math.round((acc / tot) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const DY = 0.3;
const TIER = { perf: 0, low: 0.5, medium: 0.8, high: 1, ultra: 1, epic: 1 };

export default class MonumentoFog {
  constructor(g, w, { color = 0x8f9fb6, amount = 1, river = -5.2 } = {}) {
    this.g = g;
    this.w = w;
    this.root = new THREE.Group();
    w.root.add(this.root);
    // el mapa de alturas del piso (cada 0,5 m, con 20 m de más alrededor)
    const PAD = 20;
    const res = 0.5;
    const x0 = -PAD;
    const z0 = -PAD;
    const nx = Math.ceil((w.W + PAD * 2) / res);
    const nz = Math.ceil((w.H + PAD * 2) / res);
    const half = new Uint16Array(nx * nz);
    const hAt = (x, z) => {
      if (x >= 113) return river;
      if (x >= 0 && z >= 0 && x < w.W && z < w.H) return heightAt(w, x, z);
      return 3;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) half[j * nx + i] = THREE.DataUtils.toHalfFloat(hAt(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res));
    const floor = new THREE.DataTexture(half, nx, nz, THREE.RedFormat, THREE.HalfFloatType);
    floor.magFilter = floor.minFilter = THREE.LinearFilter;
    floor.needsUpdate = true;
    this.u = {
      tNoise: { value: noiseTex() },
      tFloor: { value: floor },
      uFB: { value: new THREE.Vector4(x0, z0, 1 / (nx * res), 1 / (nz * res)) },
      uT: { value: 0 },
      uCol: { value: new THREE.Color(color) },
      uCam: { value: new THREE.Vector3() },
      uA: { value: 0.12 * amount },
      uTop: { value: 1.1 },
    };
    this.base = 0.12 * amount;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      fog: false,
    });
    // las celdas que llevan niebla: todo lo de afuera (y el Propileo, abierto)
    const indoor = new Set(Object.keys(ZONES).filter((k) => !ZONES[k].outdoor));
    indoor.add('I');
    const skip = (x, z) => {
      const k = w.zoneAt(x + 0.5, z + 0.5);
      return k && indoor.has(k);
    };
    const floorY = new Float32Array(w.W * w.H);
    for (let z = 0; z < w.H; z++) for (let x = 0; x < w.W; x++) floorY[z * w.W + x] = skip(x, z) ? NaN : hAt(x + 0.5, z + 0.5);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of floorY) if (!Number.isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    this.layers = [];
    for (let y = Math.floor(lo / DY) * DY + DY; y <= hi + 1.1; y += DY) {
      const pos = [];
      for (let z = 0; z < w.H; z++) {
        for (let x = 0; x < w.W; x++) {
          const f = floorY[z * w.W + x];
          if (Number.isNaN(f)) continue;
          // (con la rampa, se mira la esquina más baja y la más alta de la celda)
          const fa = Math.min(f, hAt(x, z), hAt(x + 1, z + 1));
          const fb = Math.max(f, hAt(x, z), hAt(x + 1, z + 1));
          if (y < fa + 0.04 || y > fb + 1.15) continue;
          pos.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x, y, z + 1);
        }
      }
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.mat);
      m.renderOrder = 4;
      m.frustumCulled = true;
      m.userData.reflect = false;
      this.root.add(m);
      this.layers.push(m);
    }
    // el manto del río: tres capas grandes sobre el agua, hacia el horizonte
    const rm = this.mat.clone();
    rm.uniforms = { ...this.u, uA: { value: 0.14 * amount }, uTop: { value: 2.4 } };
    this.riverMat = rm;
    for (const h of [0.25, 0.9, 1.6]) {
      const geo = new THREE.PlaneGeometry(420, 520).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, rm);
      m.position.set(113 + 210, river + h, 30);
      m.renderOrder = 4;
      m.userData.reflect = false;
      this.root.add(m);
    }
    this.q = null;
  }

  update(dt, t) {
    const g = this.g;
    const q = g.tier?.('night') || g.settings?.quality || 'medium';
    if (q !== this.q) {
      this.q = q;
      const k = TIER[q] ?? 1;
      this.root.visible = k > 0;
      // en Baja una capa sí y otra no (más gruesas)
      this.layers.forEach((m, i) => (m.visible = k >= 0.8 || i % 2 === 0));
      this.u.uA.value = this.base * (k >= 0.8 ? 1 : 1.7);
    }
    this.u.uT.value = t;
    this.u.uCam.value.copy(g.camera.position);
    // la luz de la luna y la neblina del clima la espesan
    const moon = this.w.moon?.intensity ?? 1;
    this.u.uCol.value.setRGB(0.26 + moon * 0.1, 0.3 + moon * 0.11, 0.36 + moon * 0.13);
    const mist = 1 + (g.weather?.cur?.mist ?? 0) * 0.7;
    this.riverMat.uniforms.uA.value = 0.14 * mist;
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.root.children) m.geometry.dispose();
    this.mat.dispose();
    this.riverMat.dispose();
  }
}
