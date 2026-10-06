import * as THREE from 'three';

// Muchos sprites con el mismo material en un solo dibujo (2026-10-04): una
// InstancedMesh con el mismo shader del SpriteMaterial (de frente a la cámara,
// del tamaño de su escala) y la opacidad de cada uno. El código que los mueve
// no cambia: sigue tocando los Sprite (visible, posición, escala, opacidad de
// su material) y sync() los copia acá y los esconde. Los de mezcla normal
// (sort) van de atrás para adelante, como los ordena three. Los sprites tienen
// que colgar todos del mismo padre (el de la malla).
// globalThis.__mduNoSpriteBatch (al cargar): sprites sueltos, como antes.
// globalThis.__mduSpriteBatchAB: __mduSpriteBatchToggle(on) para comparar.

const QUAD = (() => {
  // (la misma del Sprite de three)
  const g = new THREE.BufferGeometry();
  const ib = new THREE.InterleavedBuffer(new Float32Array([-0.5, -0.5, 0, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 1, 1, -0.5, 0.5, 0, 0, 1]), 5);
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0, false));
  g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 3, false));
  return g;
})();

const ALL = new Set();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _c = new THREE.Vector3();

export const spriteBatchOn = () => globalThis.__mduNoSpriteBatch !== true;

export class SpriteBatch {
  constructor(sprites, { sort = false } = {}) {
    this.sprites = sprites;
    this.sort = sort;
    this.vis = sprites.map(() => false);
    this.order = [];
    this.depth = new Float32Array(sprites.length);
    const n = sprites.length;
    const mat = sprites[0].material.clone();
    mat.opacity = 1;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute float sbOp;\nvarying float vSbOp;\nvoid main() {\n\tvSbOp = sbOp;')
        .replace('vec4 mvPosition = modelViewMatrix[ 3 ];', 'vec4 mvPosition = modelViewMatrix * instanceMatrix[ 3 ];\n\tmat4 sbM = modelMatrix * instanceMatrix;')
        .replace('vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );', 'vec2 scale = vec2( length( sbM[ 0 ].xyz ), length( sbM[ 1 ].xyz ) );');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vSbOp;\nvoid main() {')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vSbOp );');
    };
    mat.customProgramCacheKey = () => 'spriteBatch';
    this.mat = mat;
    this.op = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.op.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setIndex(QUAD.index);
    geo.setAttribute('position', QUAD.attributes.position);
    geo.setAttribute('uv', QUAD.attributes.uv);
    geo.setAttribute('sbOp', this.op);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // (todas en cero hasta el primer sync: la carga lo dibuja escondido para compilarlo)
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, _m);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = sprites[0].renderOrder;
    mesh.visible = false;
    // (three le pasa al shader el centro del objeto si el material es de sprite)
    mesh.center = new THREE.Vector2(0.5, 0.5);
    sprites[0].parent.add(mesh);
    this.mesh = mesh;
    this.on = true;
    ALL.add(this);
  }

  // Después de mover los sprites, antes de dibujar.
  sync(camera) {
    if (!this.on) return;
    const S = this.sprites;
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      this.vis[i] = s.visible;
      if (!s.visible) continue;
      s.visible = false;
      order.push(i);
    }
    const mesh = this.mesh;
    if (this.sort && order.length > 1 && camera) {
      const e = camera.matrixWorld.elements;
      _f.set(-e[8], -e[9], -e[10]);
      const pm = mesh.parent.matrixWorld;
      _c.setFromMatrixPosition(camera.matrixWorld);
      for (const i of order) this.depth[i] = _v.copy(S[i].position).applyMatrix4(pm).sub(_c).dot(_f);
      const d = this.depth;
      // (de atrás para adelante; empate: el que va primero en la lista, como three por id)
      order.sort((a, b) => d[b] - d[a] || a - b);
    }
    const op = this.op.array;
    for (let k = 0; k < order.length; k++) {
      const s = S[order[k]];
      mesh.setMatrixAt(k, _m.compose(s.position, _q, s.scale));
      op[k] = s.material.opacity;
    }
    mesh.count = order.length;
    mesh.visible = order.length > 0;
    if (order.length > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      this.op.needsUpdate = true;
    }
  }

  // (comparar: los sprites sueltos como estaban en el último sync)
  set(on) {
    if (on === this.on) return;
    this.on = on;
    if (!on) {
      for (let i = 0; i < this.sprites.length; i++) this.sprites[i].visible = this.vis[i];
      this.mesh.visible = false;
    } else this.sync(this.camera);
  }
}

if (globalThis.__mduSpriteBatchAB === true) {
  globalThis.__mduSpriteBatchToggle = (on, camera) => {
    let n = 0;
    for (const b of ALL) {
      b.camera = camera;
      b.set(on);
      n++;
    }
    return n;
  };
}
