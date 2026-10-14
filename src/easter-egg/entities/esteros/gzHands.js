import * as THREE from 'three';
import { VM } from '../../weapons/viewmodels';

// Las manos del zombi en primera persona (Zombies gauchescos,
// entities/esteros/Gauchescos.js): dos antebrazos podridos con la manga
// hecha jirones y los dedos en garra, colgados en la escena de las manos de
// los mates (weapons.vmRoot). Suben y bajan (nunca aparecen de golpe), se
// mecen al andar, bombean al correr y el zarpazo va con una y con la otra.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// dónde va el codo de cada una (la derecha; la izquierda, espejada)
const BASE = V(0.25, -0.31, -0.1);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

function arm(M) {
  const g = new THREE.Group();
  // la manga rota, del codo para atrás (sale de cuadro)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.3, 9, 1, true), M.cloth);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.07;
  g.add(sleeve);
  // los jirones que cuelgan de la boca de la manga
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.05 + (i % 3) * 0.02), M.cloth);
    s.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.1 - (i % 3) * 0.01);
    s.rotation.set(Math.sin(a) * 0.5, 0, a);
    g.add(s);
  }
  // el antebrazo flaco, con la muñeca marcada
  g.add(VM.limb(V(0, 0, -0.06), V(0, 0.004, -0.29), 0.031, M.skin));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), M.skin);
  knob.position.set(0.012, 0.012, -0.29);
  g.add(knob);
  // manchas de sangre seca y una herida
  for (const [x, y, z, s] of [[0.02, 0.02, -0.16, 0.022], [-0.018, 0.022, -0.22, 0.016], [0.0, 0.028, -0.11, 0.014]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), M.blood);
    b.scale.set(1, 0.35, 1.4);
    b.position.set(x, y, z);
    g.add(b);
  }
  // las llagas (manchones más oscuros)
  for (const [x, y, z, s] of [[-0.024, 0.012, -0.14, 0.011], [0.027, -0.004, -0.21, 0.009], [-0.012, 0.027, -0.26, 0.007]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), M.sore);
    b.scale.set(1, 0.3, 1.6);
    b.position.set(x, y, z);
    g.add(b);
  }
  // la palma
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), M.skin);
  palm.scale.set(0.042, 0.018, 0.048);
  palm.position.set(0, 0.0, -0.335);
  g.add(palm);
  // los nudillos huesudos y los tendones del dorso
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 7, 5), M.skin);
    k.position.set((i - 1.5) * 0.019, 0.011, -0.368);
    g.add(k);
    g.add(VM.limb(V((i - 1.5) * 0.008, 0.016, -0.31), V((i - 1.5) * 0.017, 0.014, -0.362), 0.0035, M.sore));
  }
  // los cuatro dedos, largos y doblados como garra, con uñas negras
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.019;
    const a = V(x, 0.004, -0.37);
    const b = V(x * 1.15, -0.006, -0.405 - (i === 1 || i === 2 ? 0.006 : 0));
    const c = V(x * 1.2, -0.04, -0.42 - (i === 1 || i === 2 ? 0.006 : 0));
    g.add(VM.limb(a, b, 0.0085, M.skin));
    g.add(VM.limb(b, c, 0.0075, M.skin));
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.034, 6), M.claw);
    claw.position.copy(c).add(V(0, -0.012, -0.004));
    claw.rotation.x = Math.PI + 0.35;
    g.add(claw);
  }
  // el pulgar
  const t0 = V(-0.035, -0.004, -0.325);
  const t1 = V(-0.052, -0.012, -0.36);
  const t2 = V(-0.05, -0.03, -0.385);
  g.add(VM.limb(t0, t1, 0.009, M.skin));
  g.add(VM.limb(t1, t2, 0.008, M.skin));
  const tc = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 6), M.claw);
  tc.position.copy(t2).add(V(0, -0.01, -0.003));
  tc.rotation.x = Math.PI + 0.3;
  g.add(tc);
  return g;
}

export default class ZombieHands {
  constructor(game) {
    this.g = game;
    const M = {
      skin: new THREE.MeshStandardMaterial({ color: 0x56603f, roughness: 0.9, flatShading: true }),
      sore: new THREE.MeshStandardMaterial({ color: 0x3a3a22, roughness: 1 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 1, side: THREE.DoubleSide }),
      claw: new THREE.MeshStandardMaterial({ color: 0x241d14, roughness: 0.45 }),
      blood: new THREE.MeshStandardMaterial({ color: 0x4a0c08, roughness: 0.5 }),
    };
    this.M = M;
    this.root = new THREE.Group();
    this.R = arm(M);
    this.L = arm(M);
    // (la izquierda, espejada)
    this.L.scale.x = -1;
    this.root.add(this.R, this.L);
    this.root.visible = false;
    game.weapons?.vmRoot.add(this.root);
    // 0 abajo (fuera de cuadro), 1 arriba
    this.k = 0;
    this.want = false;
    this.side = 1;
    this.swingSide = 1;
    this.bloodT = 0;
  }

  show(on) {
    this.want = !!on;
  }

  swing() {
    this.swingSide = -this.swingSide;
  }

  // El zarpazo pegó: las garras se manchan un momento.
  blood() {
    this.bloodT = 1;
    const p = this.g.player.pos;
    this.g.fx.blood(new THREE.Vector3(p.x - Math.sin(this.g.player.yaw) * 1.1, p.y + 1.3, p.z - Math.cos(this.g.player.yaw) * 1.1), { x: 0, y: 0.3, z: 0 }, 10);
  }

  // Cada cuadro (swingT: dónde va el zarpazo, -1 sin zarpazo).
  update(dt, swingT = -1) {
    const g = this.g;
    const p = g.player;
    this.k = clamp01(this.k + (this.want ? dt / 0.35 : -dt / 0.25));
    this.root.visible = this.k > 0.001;
    if (!this.root.visible) return;
    const e = smooth(this.k);
    const t = g.time;
    const moving = p.moving && p.onGround ? 1 : 0;
    const sprint = p.sprinting ? 1 : 0;
    this.sprintK = (this.sprintK || 0) + (sprint * moving - (this.sprintK || 0)) * Math.min(1, dt * 8);
    const sk = this.sprintK;
    const bp = p.bobPhase || 0;
    const dur = 0.55;
    for (const [A, s] of [[this.R, 1], [this.L, -1]]) {
      // de reposo: un poco adelante y hacia el medio, las garras abiertas
      let x = BASE.x * s;
      let y = BASE.y + (1 - e) * -0.45;
      let z = BASE.z;
      let rx = 0.62;
      let ry = 0.18 * s;
      let rz = -0.12 * s;
      // respiración y un temblor de muerto
      y += Math.sin(t * 1.7 + s) * 0.006;
      rz += Math.sin(t * 7.3 + s * 2) * 0.006;
      // al andar se mecen; al correr bombean, una adelante y otra atrás
      y += -Math.abs(Math.sin(bp)) * 0.012 * moving;
      x += Math.cos(bp) * 0.01 * moving;
      const pump = Math.sin(bp) * s * sk;
      z += pump * 0.06 - sk * 0.03;
      y += -sk * 0.04 + pump * 0.02;
      rx += pump * 0.3 + sk * 0.2;
      // el zarpazo (una mano y después la otra): atrás y arriba, cruza la pantalla y vuelve
      if (swingT >= 0 && s === this.swingSide) {
        const u = clamp01(swingT / dur);
        let wx;
        let wy;
        let wz;
        let wr;
        if (u < 0.28) {
          const a = smooth(u / 0.28);
          wx = 0.06 * a;
          wy = 0.1 * a;
          wz = 0.05 * a;
          wr = 0.7 * a;
        } else if (u < 0.55) {
          const a = smooth((u - 0.28) / 0.27);
          wx = 0.06 - 0.36 * a;
          wy = 0.1 - 0.16 * a;
          wz = 0.05 - 0.17 * a;
          wr = 0.7 - 1.7 * a;
        } else {
          const a = smooth((u - 0.55) / 0.45);
          wx = -0.3 * (1 - a);
          wy = -0.06 * (1 - a);
          wz = -0.12 * (1 - a);
          wr = -1 * (1 - a);
        }
        x += wx * s;
        y += wy;
        z += wz;
        ry += wr * 0.55 * s;
        rz += wr * 0.6 * s;
        rx += -wr * 0.15;
      }
      A.position.set(x, y, z);
      A.rotation.set(rx, ry, rz);
    }
    this.bloodT = Math.max(0, this.bloodT - dt * 0.6);
    this.M.claw.color.setRGB(0.14 + this.bloodT * 0.25, 0.11, 0.08);
  }

  dispose() {
    this.root.removeFromParent();
  }
}
