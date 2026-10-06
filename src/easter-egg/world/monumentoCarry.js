import * as THREE from 'three';
import { flameMaterial } from './castleFire';

// Llevar algo en la mano en el Monumento (la antorcha, la pava grande, las
// telas y la bandera del easter egg): el mate se baja, la cosa ocupa las dos
// manos (no se dispara), el clic hace lo que la cosa sepa hacer (la antorcha
// quema de un golpe) y G la deja en el piso. Los compañeros la ven en la mano
// de su gaucho. Quién la lleva lo decide el que arma la vuelta (papLlama,
// MonumentoEgg): acá solo se dibuja y se toman las teclas.
//  carry.set(kind, id): la lleva el jugador id (null: nadie).
//  carry.onSwing / onDrop: lo que pasa con el clic y con la G (solo el que la lleva).

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

// Los modelos: en la mano (vm) y en el mundo (lo ven los demás).
export function itemModel(kind, M, vm = false) {
  const g = new THREE.Group();
  if (kind === 'antorcha') {
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.62, 8), M.woodDark);
    wood.position.y = 0.31;
    g.add(wood);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1, emissive: 0x401000, emissiveIntensity: 0.6 }));
    head.position.y = 0.66;
    g.add(head);
    const fl = new THREE.Group();
    for (const ry of [0, Math.PI / 2]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.5).translate(0, 0.25, 0), flameMaterial());
      f.rotation.y = ry;
      f.renderOrder = 6;
      fl.add(f);
    }
    fl.position.y = 0.7;
    fl.name = 'llama';
    g.add(fl);
  } else if (kind === 'pava') {
    const al = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.85 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.7, 0.15], [0.68, 0.55], [0.45, 0.85], [0.18, 0.95], [0.2, 1.02]].map(([r, y]) => new THREE.Vector2(r * 0.42, y * 0.42)), 20), al);
    g.add(body);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.07, 0.34, 10), al);
    sp.position.set(0, 0.24, 0.27);
    sp.rotation.x = 1.0;
    g.add(sp);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 6, 16, Math.PI), M.iron);
    h.position.y = 0.42;
    h.rotation.y = Math.PI / 2;
    g.add(h);
    // el barro del río que todavía chorrea
    const mud = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), new THREE.MeshStandardMaterial({ color: 0x3a2e1e, roughness: 1 }));
    mud.position.y = 0.16;
    g.add(mud);
  } else if (kind === 'cana') {
    // la caña de pescar con su reel, inclinada hacia adelante (al río), y el
    // hilo que cuelga de la punta derecho al agua. (Antes iba de punta hacia
    // atrás: en la mano quedaba detrás de la cámara y no se veía.)
    const tilt = globalThis.__mduNoCanaVm ? 0 : -0.9;
    const arm = new THREE.Group();
    arm.rotation.x = tilt;
    g.add(arm);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.018, 1.6, 6), M.woodDark);
    rod.position.y = 0.8;
    arm.add(rod);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), M.iron);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.04, 0.22, 0);
    arm.add(reel);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 3, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    line.position.set(0, 1.6 * Math.cos(tilt) - 1.5, 1.6 * Math.sin(tilt));
    line.name = 'hilo';
    g.add(line);
  } else if (kind === 'celeste' || kind === 'blanca' || kind === 'bandera') {
    // un rollo de tela (o la bandera doblada)
    const col = kind === 'celeste' ? 0x74acdf : kind === 'blanca' ? 0xf2f0ea : 0x9ec8ee;
    const cloth = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide });
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 14), cloth);
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.4, 4, 3), cloth);
    flap.position.set(0, -0.2, 0.08);
    g.add(flap);
    if (kind === 'bandera') {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.13), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, side: THREE.DoubleSide }));
      w.position.set(0, -0.2, 0.081);
      g.add(w);
    }
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !vm;
      o.frustumCulled = !vm;
    }
  });
  return g;
}

// Dónde va cada cosa en la vista (cámara de la mano: x a la derecha, -z adelante).
const VM = {
  antorcha: { pos: [0.27, -0.62, -0.62], rot: [-0.35, 0.2, -0.32], s: 0.85 },
  pava: { pos: [0.0, -0.46, -0.62], rot: [0.1, 0.4, 0], s: 0.9 },
  cana: globalThis.__mduNoCanaVm ? { pos: [0.18, -0.34, -0.42], rot: [0.9, 0, -0.1], s: 1 } : { pos: [0.2, -0.42, -0.4], rot: [0, -0.12, -0.08], s: 1 },
  celeste: { pos: [0.12, -0.3, -0.5], rot: [0.2, 0.3, 0.1], s: 0.9 },
  blanca: { pos: [0.12, -0.3, -0.5], rot: [0.2, 0.3, 0.1], s: 0.9 },
  bandera: { pos: [0.12, -0.3, -0.5], rot: [0.2, 0.3, 0.1], s: 0.9 },
};

export default class Carry {
  constructor(g) {
    this.g = g;
    this.kind = null;
    this.id = null;
    this.vm = null;
    this.wm = null;
    this.swingT = 0;
    this.onSwing = null;
    this.onDrop = null;
    // las teclas: mientras se lleva algo, el escudo y el mate no se usan
    const sh = g.weapons.shieldHand;
    const orig = sh.input.bind(sh);
    sh.input = (input) => (this.mine ? this.input(input) : orig(input));
    this.unhook = () => (sh.input = orig);
  }

  get mine() {
    return !!this.kind && this.id === (this.g.net?.id ?? 0);
  }

  set(kind, id) {
    const g = this.g;
    if (this.kind === kind && this.id === id) return;
    this.clearModels();
    this.kind = kind;
    this.id = kind ? id : null;
    if (!kind) return;
    const M = g.world.M;
    if (this.mine) {
      const v = VM[kind] || VM.celeste;
      this.vm = itemModel(kind, M, true);
      this.vm.position.set(...v.pos);
      this.vm.rotation.set(...v.rot);
      this.vm.scale.setScalar(v.s);
      g.weapons.vmRoot.add(this.vm);
    } else {
      this.wm = itemModel(kind, M);
      g.scene.add(this.wm);
    }
  }

  clearModels() {
    this.vm?.removeFromParent();
    this.wm?.removeFromParent();
    this.vm = null;
    this.wm = null;
  }

  // (devuelve true: se comió la tecla)
  input(input) {
    if (input.mouse.leftPressed && this.swingT <= 0) {
      // (el golpe se ve solo con la antorcha: con la caña el clic recoge)
      if (this.kind === 'antorcha' || globalThis.__mduNoCanaVm) this.swingT = 0.45;
      this.onSwing?.(this.kind);
    }
    if (input.hit('KeyG')) this.onDrop?.(this.kind);
    return true;
  }

  // Cada cuadro, después de la mano: la del mate escondida, la cosa en su lugar.
  update(dt, t) {
    const g = this.g;
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.mine) {
      g.weapons.holder.visible = false;
      if (g.weapons.holder2) g.weapons.holder2.visible = false;
      const v = VM[this.kind] || VM.celeste;
      if (this.vm) {
        // el vaivén al caminar y el golpe de la antorcha
        const k = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.45) * Math.PI) : 0;
        this.vm.position.set(v.pos[0] - k * 0.3, v.pos[1] + Math.sin(t * 7) * 0.008 + k * 0.1, v.pos[2] - k * 0.2);
        this.vm.rotation.set(v.rot[0] - k * 1.2, v.rot[1] + k * 0.8, v.rot[2]);
      }
      // la pava: sin armas, pero se puede correr (el usuario, 2026-10-05; antes
      // pesaba y se caminaba despacio: __mduNoPavaRun)
      if (this.kind === 'pava' && globalThis.__mduNoPavaRun) g.player.slowT = Math.max(g.player.slowT, 0.1);
    } else if (this.wm) {
      // en la mano del compañero (o a la altura del pecho, adelante)
      const p = g.net?.remote.get(this.id);
      const pos = p?.pos;
      if (pos) {
        const yaw = p.yaw ?? 0;
        tmpV.set(Math.sin(yaw) * -0.35 + Math.cos(yaw) * 0.25, 0, Math.cos(yaw) * -0.35 - Math.sin(yaw) * 0.25);
        this.wm.position.set(pos.x + tmpV.x, (pos.y || 0) + (this.kind === 'pava' ? 0.7 : 1.05), pos.z + tmpV.z);
        this.wm.quaternion.copy(tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
      }
    }
  }

  dispose() {
    this.clearModels();
    this.unhook?.();
  }
}
