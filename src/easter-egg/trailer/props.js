import * as THREE from 'three';

// Utilería del trailer: la linterna, la luz prestada y el hombre de la linterna.

// Una de las luces de destello de fx (hay 3 fijas: no se agregan luces, que
// recompila todo). La toma la maneja cuadro a cuadro después de fx.update.
export function borrowLight(g, i = 2) {
  const f = g.fx.flashes[i];
  return {
    set(p, color, intensity, dist = 8) {
      f.life = 0;
      f.light.position.copy(p);
      f.light.color.set(color);
      f.light.distance = dist;
      f.light.intensity = intensity;
    },
    off() {
      f.light.intensity = 0;
    },
  };
}

// La linterna: fierro, vidrio que brilla, la llama y el halo.
export function lantern(g) {
  const T = g.textures;
  const root = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb050).multiplyScalar(2.2), transparent: true, opacity: 0.85 });
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.17, 10, 1, true), glass);
  box.position.y = -0.14;
  root.add(box);
  for (const y of [-0.05, -0.23]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(y > -0.1 ? 0.05 : 0.09, 0.09, 0.03, 10), iron);
    cap.position.y = y;
    root.add(cap);
  }
  for (let k = 0; k < 4; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.18, 0.008), iron);
    const a = (k / 4) * Math.PI * 2 + 0.4;
    bar.position.set(Math.cos(a) * 0.078, -0.14, Math.sin(a) * 0.078);
    root.add(bar);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 12), iron);
  ring.position.y = 0.01;
  root.add(ring);
  const sprite = (color, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
    s.scale.setScalar(scale);
    s.position.y = -0.14;
    root.add(s);
    return s;
  };
  const flame = sprite(0xffc070, 0.2, 1);
  const halo = sprite(0xff9a40, 1.1, 0.22);
  g.scene.add(root);
  const L = { root, flame, halo, glass, on: 1 };
  L.set = (k, t) => {
    // parpadeo de llama (nunca parejo)
    const fl = 0.88 + Math.sin(t * 13.1) * 0.05 + Math.sin(t * 7.3 + 1) * 0.05 + Math.sin(t * 23.7) * 0.03;
    L.on = k;
    flame.material.opacity = k * fl;
    flame.scale.setScalar(0.2 * (0.7 + 0.3 * k) * fl);
    halo.material.opacity = 0.22 * k * fl;
    glass.opacity = 0.25 + 0.6 * k;
    glass.color.setRGB(1, 0.69, 0.31).multiplyScalar(0.25 + 0.95 * k * fl);
    return fl;
  };
  L.dispose = () => root.removeFromParent();
  return L;
}

// El hombre de la linterna (el de la entrada del molino): poncho claro, faja
// de oro, sombrero de paja vieja. Los ojos se prenden de oro con eye(k).
export function stranger(crew) {
  const G = crew.add(0, { gun: null });
  const M = G.a.M;
  M.poncho.color.set(0x9a8a6a);
  M.band.color.set(0xd8a830);
  M.hat.color.set(0x8a7448);
  M.skin.color.set(0x9a7a60);
  const base = new THREE.Color(0x120c08);
  const gold = new THREE.Color(0xffa818).multiplyScalar(2.6);
  G.eye = (k) => M.eye.color.copy(base).lerp(gold, k);
  G.set('calm');
  return G;
}
