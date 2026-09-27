import * as THREE from 'three';

// Los golpes de luz de la Supernova Matera (weapons/Supernova.js), armados de
// entrada y reciclados: una estrella de cuatro puntas que se abre, un halo, un
// anillo de choque que mira a la cámara y, en la mejorada (Big Bang Matero),
// una galaxia en espiral que gira. También las usa la Lluvia de Estrellas del
// Challenge (entities/challengeEvents.js). Van en el grupo escondido de los
// mates (weapons.warm): la carga compila sus shaders y el primer tiro no traba.

const POOL = 12;
const PAL = [
  { star: 0xfff1c8, halo: 0x8a6aff, ring: 0x33e8ff, gal: 0x9a7aff },
  { star: 0xffffff, halo: 0xff4a9a, ring: 0xffc84a, gal: 0xff6ab0 },
];

let galaxyTex = null;
// Una galaxia de dos brazos: puntitos por espirales logarítmicas, el centro blanco.
export function galaxyTexture() {
  if (galaxyTex) return galaxyTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const core = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.4, 'rgba(255,240,220,0.5)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = core;
  x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 520; i++) {
      const k = i / 520;
      const a = arm * Math.PI + k * Math.PI * 3.2 + (Math.random() - 0.5) * 0.5;
      const r = S * 0.04 + k * S * 0.44 + (Math.random() - 0.5) * S * 0.035;
      const px = S / 2 + Math.cos(a) * r;
      const py = S / 2 + Math.sin(a) * r;
      const s = (1 - k) * 2.6 + Math.random() * 1.4;
      const al = (1 - k) * 0.5 + 0.08;
      x.fillStyle = `rgba(255,255,255,${al.toFixed(3)})`;
      x.beginPath();
      x.arc(px, py, s, 0, Math.PI * 2);
      x.fill();
    }
  }
  galaxyTex = new THREE.CanvasTexture(c);
  galaxyTex.colorSpace = THREE.SRGBColorSpace;
  return galaxyTex;
}

let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.86, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

const sprite = (map, hex, k) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));

export default class NovaFx {
  // group: donde viven escondidas (weapons.warm); flare: la estrella de cuatro puntas; dot: el punto suave
  constructor(group, flare, dot, scene) {
    this.home = group;
    this.scene = scene;
    this.items = [];
    for (const up of [0, 1]) {
      const C = PAL[up];
      for (let i = 0; i < POOL; i++) {
        const root = new THREE.Group();
        const star = sprite(flare, C.star, 2.2);
        const halo = sprite(dot, C.halo, 1.6);
        const ring = sprite(ringTexture(), C.ring, 2);
        const gal = up ? sprite(galaxyTexture(), C.gal, 2.4) : null;
        for (const s of [star, halo, ring, gal]) {
          if (!s) continue;
          s.renderOrder = 8;
          s.frustumCulled = false;
          root.add(s);
        }
        group.add(root);
        this.items.push({ up, root, star, halo, ring, gal, t: 0, life: 0.4, s: 1, busy: false, spin: 0 });
      }
    }
  }

  // Un golpe en `at` (s: el tamaño; mini: solo la estrellita, para los arcos).
  burst(at, up, s = 1, mini = false) {
    const list = this.items.filter((x) => x.up === up);
    const it = list.find((x) => !x.busy) || list.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    it.busy = true;
    it.t = 0;
    it.s = s;
    it.mini = mini;
    it.life = mini ? 0.26 : up ? 0.62 : 0.42;
    it.spin = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
    it.star.material.rotation = Math.random() * Math.PI;
    it.root.position.copy(at);
    it.halo.visible = !mini;
    it.ring.visible = !mini;
    if (it.gal) it.gal.visible = !mini;
    this.scene.add(it.root);
    this.apply(it, 0);
  }

  apply(it, k) {
    const s = it.s;
    const out = 1 - (1 - k) * (1 - k);
    const fade = 1 - k;
    it.star.scale.setScalar(s * (0.6 + out * (it.mini ? 1.6 : 4.2)));
    it.star.material.opacity = fade;
    it.halo.scale.setScalar(s * (1 + out * 5.5));
    it.halo.material.opacity = fade * 0.8;
    it.ring.scale.setScalar(s * (0.3 + out * 7));
    it.ring.material.opacity = fade * fade;
    if (it.gal) {
      it.gal.scale.setScalar(s * (1.2 + out * 5.2));
      it.gal.material.opacity = Math.min(1, fade * 1.4);
    }
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.busy) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      if (it.gal) it.gal.material.rotation += dt * it.spin;
      it.star.material.rotation += dt * it.spin * 0.25;
      this.apply(it, k);
      if (k >= 1) {
        it.busy = false;
        this.home.add(it.root);
      }
    }
  }

  clear() {
    for (const it of this.items) {
      if (!it.busy) continue;
      it.busy = false;
      this.home.add(it.root);
    }
  }
}
