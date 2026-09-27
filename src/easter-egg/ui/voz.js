import * as THREE from 'three';

// La Voz de Arriba del penal (la misma de la granja): un ojo de luz
// blanco-violeta con anillos que giran, un halo y, si se pide, una columna de
// luz hacia abajo (`beam`: el largo). La usan la escena de la yerba y el final.

const tmpC = new THREE.Color();
const tmpD = new THREE.Vector3();
const RED = new THREE.Color(0xff2a1a).multiplyScalar(1.4);

export function buildVoz(textures, { beam = 0 } = {}) {
  const root = new THREE.Group();
  const glow = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rings = [0x9a6aff, 0xffb84a, 0x9a6aff].map((c, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 1.3, 0.05 + i * 0.015, 8, 64), glow(c, 1.1));
    m.rotation.set(i * 1.1 + 0.4, i * 2.1, 0);
    m.userData.base = m.material.color.clone();
    root.add(m);
    return m;
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), glow(0xf0e0ff, 1.6));
  core.userData.base = core.material.color.clone();
  root.add(core);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0x1a0a2a }));
  root.add(iris);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.dot, color: 0xb88aff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
  halo.scale.setScalar(16);
  root.add(halo);
  let col = null;
  if (beam) {
    col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 1.2, beam, 20, 1, true).translate(0, -beam / 2, 0), glow(0xffd070, 0.6));
    col.material.opacity = 0;
    root.add(col);
  }
  return { root, rings, core, iris, halo, beam: col, evil: 0 };
}

// Cada cuadro: los anillos giran, el ojo mira a `cam` (una posición) y con
// `V.evil` (de 0 a 1) todo pasa a colorado y la pupila se afina como de gato.
export function updateVoz(V, dt, t, cam) {
  V.rings.forEach((r, i) => {
    r.rotation.x += dt * (0.3 + i * 0.2) * (1 + V.evil);
    r.rotation.y += dt * (0.2 - i * 0.1);
    r.material.color.copy(tmpC.copy(r.userData.base).lerp(RED, V.evil));
  });
  V.halo.material.opacity = 0.55 + Math.sin(t * 2) * 0.12;
  V.halo.material.color.setHex(0xb88aff).lerp(tmpC.setHex(0xff4a3a), V.evil);
  V.core.material.color.copy(V.core.userData.base).lerp(tmpC.setRGB(1.7, 1.2, 1.0), V.evil);
  // el iris asoma del lado de la cámara y la mira
  const p = V.root.position;
  const d = tmpD.subVectors(cam, p);
  if (d.lengthSq() > 1e-6) {
    d.normalize();
    V.iris.position.copy(d).multiplyScalar(0.72);
    V.iris.lookAt(cam);
  }
  V.iris.scale.set(1 - V.evil * 0.72, 1 + V.evil * 0.15, 1);
  V.iris.material.color.setHex(0x1a0a2a).lerp(tmpC.setHex(0x4a0000), V.evil);
}
