import * as THREE from 'three';

// Acumula quads por material y los junta en una sola malla por material
// (pocas llamadas de dibujo para toda la arquitectura).
export default class GeoBuilder {
  constructor() {
    this.buckets = new Map();
  }

  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { pos: [], nor: [], uv: [], idx: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  // Quad con vértices a, b, c, d (antihorario visto desde el frente) y UVs.
  quad(key, a, b, c, d, n, uva, uvb, uvc, uvd) {
    const B = this.bucket(key);
    const base = B.pos.length / 3;
    for (const p of [a, b, c, d]) B.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) B.nor.push(n[0], n[1], n[2]);
    for (const u of [uva, uvb, uvc, uvd]) B.uv.push(u[0], u[1]);
    B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Cara vertical de pared entre (x0,z0) y (x1,z1), de y0 a y1, mirando a n.
  // u sigue el largo de la pared (textura cada 2 m) y v la altura total.
  wall(key, x0, z0, x1, z1, y0, y1, n, H, uOffset = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const u0 = uOffset / 2;
    const u1 = (uOffset + len) / 2;
    this.quad(
      key,
      [x0, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z0],
      n,
      [u0, y0 / H],
      [u1, y0 / H],
      [u1, y1 / H],
      [u0, y1 / H],
    );
  }

  // Rectángulo horizontal a altura y (piso si up, techo si no).
  flat(key, x0, z0, x1, z1, y, up, scale = 2) {
    const n = up ? [0, 1, 0] : [0, -1, 0];
    const uv = (x, z) => [x / scale, z / scale];
    if (up) this.quad(key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], n, uv(x0, z1), uv(x1, z1), uv(x1, z0), uv(x0, z0));
    else this.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], n, uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1));
  }

  // Caja completa (para marcos, zócalos, etc.).
  box(key, x0, y0, z0, x1, y1, z1, s = 1) {
    const u = (a) => a / s;
    this.quad(key, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [u(x0), u(y0)], [u(x1), u(y0)], [u(x1), u(y1)], [u(x0), u(y1)]);
    this.quad(key, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [u(x1), u(y0)], [u(x0), u(y0)], [u(x0), u(y1)], [u(x1), u(y1)]);
    this.quad(key, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [u(z1), u(y0)], [u(z0), u(y0)], [u(z0), u(y1)], [u(z1), u(y1)]);
    this.quad(key, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [u(z0), u(y0)], [u(z1), u(y0)], [u(z1), u(y1)], [u(z0), u(y1)]);
    this.quad(key, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [u(x0), u(z1)], [u(x1), u(z1)], [u(x1), u(z0)], [u(x0), u(z0)]);
    this.quad(key, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [u(x0), u(z0)], [u(x1), u(z0)], [u(x1), u(z1)], [u(x0), u(z1)]);
  }

  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, B] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setIndex(B.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, materials[key]);
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }
    return group;
  }
}
