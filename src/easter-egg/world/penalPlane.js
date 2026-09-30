import * as THREE from 'three';

// El avión de lejos (lo pidió el usuario, por el avión de Mob of the Dead):
// cada tanto cruza el cielo un biplano viejo, lejos de la isla y sin hacer
// ruido. De noche y con la niebla casi no se le ve el cuerpo: se lo reconoce
// por las luces (colorada a la izquierda, verde a la derecha, blanca en la cola
// y la baliza de arriba que titila). Es solo de adorno: cada compu tiene el
// suyo, no se sincroniza. Lo arma y lo mueve entities/PenalEgg.js.

// el centro de la isla, de dónde queda lejos
const CENTER = { x: 49, z: 55 };
const SPEED = 32;
const LEN = 560;
// cada cuánto pasa (s) y cuándo pasa el primero
const EVERY = [150, 260];
const FIRST = [55, 90];

export default class PenalPlane {
  constructor(game, parent) {
    this.g = game;
    this.root = this.build();
    this.root.visible = false;
    parent.add(this.root);
    this.wait = FIRST[0] + Math.random() * (FIRST[1] - FIRST[0]);
    this.fly = null;
  }

  build() {
    const g = this.g;
    const root = new THREE.Group();
    // (sin niebla: si no, a esta distancia no queda nada)
    const body = new THREE.MeshLambertMaterial({ color: 0x3a3f4a, fog: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0x23262d, fog: false });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      root.add(m);
      return m;
    };
    // el fuselaje (mira hacia +z) y el motor redondo de adelante
    add(new THREE.CylinderGeometry(0.62, 0.22, 7.2, 10).rotateX(Math.PI / 2), body, 0, 0, -0.6);
    add(new THREE.CylinderGeometry(0.78, 0.7, 0.9, 12).rotateX(Math.PI / 2), dark, 0, 0, 3.2);
    // las dos alas (es un biplano) con sus parantes
    add(new THREE.BoxGeometry(10.4, 0.1, 1.5), body, 0, 0.95, 1.2);
    add(new THREE.BoxGeometry(9.6, 0.1, 1.4), body, 0, -0.55, 1.1);
    for (const s of [-1, 1]) for (const x of [2.2, 4.2]) add(new THREE.BoxGeometry(0.06, 1.5, 0.06), dark, s * x, 0.2, 1.2);
    // la cola
    add(new THREE.BoxGeometry(3.4, 0.08, 0.9), body, 0, 0.1, -3.9);
    add(new THREE.BoxGeometry(0.08, 1.3, 1.0), body, 0, 0.7, -3.95);
    // la hélice (gira) y su borrón
    this.prop = add(new THREE.BoxGeometry(0.14, 2.3, 0.05), dark, 0, 0, 3.7);
    const blur = add(new THREE.CircleGeometry(1.15, 20), new THREE.MeshBasicMaterial({ color: 0x9aa3b0, transparent: true, opacity: 0.08, depthWrite: false, fog: false }), 0, 0, 3.72);
    blur.renderOrder = 2;
    // las luces de navegación
    const dot = g.textures.dot;
    const light = (color, x, y, z, size) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
      s.position.set(x, y, z);
      s.scale.setScalar(size);
      root.add(s);
      return s;
    };
    light(0xff2a1a, -5.2, 0.95, 1.2, 2.4);
    light(0x2aff5a, 5.2, 0.95, 1.2, 2.4);
    this.tail = light(0xfff4e0, 0, 1.35, -4.4, 2);
    this.beacon = light(0xff3a2a, 0, 0.75, 0.2, 3.2);
    root.traverse((o) => {
      o.frustumCulled = false;
    });
    return root;
  }

  // Arranca una pasada: una recta que pasa a 160-240 m del centro de la isla
  // (así no pasa de los 400 m de la cámara),
  // alta, en cualquier dirección.
  launch() {
    const a = Math.random() * Math.PI * 2;
    const d = 160 + Math.random() * 80;
    const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const mid = new THREE.Vector3(CENTER.x + Math.cos(a) * d, 75 + Math.random() * 35, CENTER.z + Math.sin(a) * d);
    if (Math.random() < 0.5) dir.negate();
    this.fly = { from: mid.clone().addScaledVector(dir, -LEN / 2), dir, t: 0, climb: (Math.random() - 0.5) * 0.04 };
    this.root.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    this.root.visible = true;
  }

  update(dt) {
    const g = this.g;
    if (!this.fly) {
      this.wait -= dt;
      if (this.wait <= 0) this.launch();
      return;
    }
    const F = this.fly;
    F.t += dt;
    const s = F.t * SPEED;
    if (s > LEN) {
      this.fly = null;
      this.root.visible = false;
      this.wait = EVERY[0] + Math.random() * (EVERY[1] - EVERY[0]);
      return;
    }
    this.root.position.copy(F.from).addScaledVector(F.dir, s);
    this.root.position.y += s * F.climb + Math.sin(F.t * 0.6) * 0.8;
    // se mece un poco (el viento)
    this.root.rotation.z = Math.sin(F.t * 0.45) * 0.06;
    this.prop.rotation.z += dt * 60;
    const t = g.time;
    // la baliza titila y la blanca de la cola parpadea
    this.beacon.material.opacity = (t * 1.1) % 1 < 0.12 ? 1 : 0.08;
    this.tail.material.opacity = (t * 0.8 + 0.5) % 1 < 0.08 ? 1 : 0.35;
  }
}
