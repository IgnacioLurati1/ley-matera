import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_H } from '../config/map';

// Bichos de ambiente: cuervos posados en los techos del patio que salen
// volando cuando hay tiros cerca, y ratas que cruzan el acopio pegadas a la
// pared. Son puro decorado: cada compu los maneja por su cuenta.

// Bandadas: dónde se posan (en el borde de arriba de las paredes, del lado del
// patio, para que se vean desde abajo) y hacia dónde miran (al patio).
const FLOCKS = [
  { perch: [[6.2, 32.1], [7.1, 32.08], [8.4, 32.12], [9.2, 32.1], [15.3, 32.1]], yaw: Math.PI },
  { perch: [[21.5, 17.9], [22.6, 17.92], [24.1, 17.88], [26.8, 17.9], [27.7, 17.9]], yaw: 0 },
  { perch: [[31.1, 19.4], [31.1, 20.3], [31.12, 28.6], [31.08, 29.5], [31.1, 30.4]], yaw: -Math.PI / 2 },
];
// Recorridos de las ratas en el acopio: de una cueva a otra, pegadas a la pared.
const RAT_RUNS = [
  [[4.35, 5.2], [4.35, 15.4]],
  [[6.2, 15.65], [14.8, 15.65]],
  [[29.65, 7.6], [29.65, 15.3]],
  [[23.5, 4.35], [28.3, 4.35]],
];

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);
const CROW_S = new THREE.Vector3(1.3, 1.3, 1.3);
const tmpP = new THREE.Vector3();
const tmpW = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export default class Critters {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.buildCrows();
    this.buildRats();
  }

  // ---------------- cuervos ----------------
  buildCrows() {
    // negro azulado con brillo: contra los árboles oscuros se leen por el reflejo de la luna
    const mat = new THREE.MeshStandardMaterial({ color: 0x30343e, roughness: 0.35, metalness: 0.25 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.5 });
    const body = mergeGeometries([
      new THREE.SphereGeometry(0.075, 8, 6).scale(0.85, 0.8, 1.5),
      new THREE.SphereGeometry(0.048, 8, 6).translate(0, 0.055, 0.1),
      new THREE.BoxGeometry(0.07, 0.012, 0.1).translate(0, 0.01, -0.14).rotateX(-0.15),
    ]);
    const beak = new THREE.ConeGeometry(0.014, 0.05, 5).rotateX(Math.PI / 2).translate(0, 0.05, 0.16);
    // ala: el borde de adentro queda en el origen para que aletee desde el hombro
    const wing = new THREE.BoxGeometry(0.2, 0.008, 0.11).translate(0.1, 0, -0.01);
    this.crows = [];
    FLOCKS.forEach((f, fi) => {
      for (const [x, z] of f.perch) {
        this.crows.push({
          flock: fi,
          home: new THREE.Vector3(x, WALL_H + 0.05, z),
          homeYaw: f.yaw + (Math.random() - 0.5) * 1.4,
          pos: new THREE.Vector3(x, WALL_H + 0.05, z),
          vel: new THREE.Vector3(),
          yaw: 0,
          state: 'perch',
          t: Math.random() * 10,
          delay: 0,
          phase: Math.random() * 6,
        });
      }
    });
    const n = this.crows.length;
    this.crowBody = new THREE.InstancedMesh(body, mat, n);
    this.crowBeak = new THREE.InstancedMesh(beak, beakMat, n);
    this.crowWing = new THREE.InstancedMesh(wing, mat, n * 2);
    for (const im of [this.crowBody, this.crowBeak, this.crowWing]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.root.add(im);
    }
    for (const c of this.crows) c.yaw = c.homeYaw;
    this.flockAway = FLOCKS.map(() => 0);
  }

  // Un ruido fuerte (tiro, explosión): los cuervos cercanos salen volando.
  onNoise(p, radius = 15) {
    const g = this.g;
    const scared = new Set();
    for (const c of this.crows) {
      if (c.state !== 'perch') continue;
      if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > radius) continue;
      scared.add(c.flock);
    }
    for (const fi of scared) {
      const flock = this.crows.filter((c) => c.flock === fi && c.state === 'perch');
      const away = new THREE.Vector3(flock[0].pos.x - p.x, 0, flock[0].pos.z - p.z).normalize();
      for (const c of flock) {
        c.state = 'fly';
        c.t = 0;
        c.delay = Math.random() * 0.35;
        const a = Math.atan2(away.x, away.z) + (Math.random() - 0.5) * 1.2;
        c.vel.set(Math.sin(a) * (3 + Math.random() * 2), 2.5 + Math.random() * 1.5, Math.cos(a) * (3 + Math.random() * 2));
      }
      this.flockAway[fi] = 45 + Math.random() * 25;
      g.audio.caw(flock[0].pos, 3);
    }
  }

  updateCrows(dt, t) {
    const g = this.g;
    const hidden = g.arena?.active;
    let k = 0;
    this.flockAway.forEach((v, fi) => {
      if (v <= 0) return;
      this.flockAway[fi] = v - dt;
      // vuelven a posarse cuando nadie mira (aparecen de nuevo en su lugar)
      if (this.flockAway[fi] <= 0) {
        for (const c of this.crows) {
          if (c.flock !== fi) continue;
          c.state = 'perch';
          c.pos.copy(c.home);
          c.yaw = c.homeYaw;
        }
      }
    });
    for (const c of this.crows) {
      c.t += dt;
      let flap = 0;
      let pitch = 0;
      let bob = 0;
      if (c.state === 'perch') {
        // de vez en cuando picotea o gira la cabeza
        const peck = Math.max(0, Math.sin(c.t * 0.9 + c.phase) - 0.92) * 8;
        pitch = peck * 0.5;
        bob = -peck * 0.01;
        flap = -1.2;
      } else if (c.state === 'fly') {
        if (c.delay > 0) {
          c.delay -= dt;
          flap = -1.2;
        } else {
          c.vel.y += (1.2 - c.vel.y) * Math.min(1, dt * 0.6);
          c.pos.addScaledVector(c.vel, dt);
          c.yaw = Math.atan2(c.vel.x, c.vel.z);
          pitch = -0.25;
          flap = Math.sin(c.t * 24 + c.phase) * 0.9;
          if (c.pos.y > 40) c.state = 'gone';
        }
      }
      const show = c.state !== 'gone' && !hidden;
      if (!show) {
        this.crowBody.setMatrixAt(k, ZERO);
        this.crowBeak.setMatrixAt(k, ZERO);
        this.crowWing.setMatrixAt(k * 2, ZERO);
        this.crowWing.setMatrixAt(k * 2 + 1, ZERO);
        k++;
        continue;
      }
      tmpE.set(pitch, c.yaw, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpP.set(c.pos.x, c.pos.y + 0.06 + bob, c.pos.z);
      tmpM.compose(tmpP, tmpQ, CROW_S);
      this.crowBody.setMatrixAt(k, tmpM);
      this.crowBeak.setMatrixAt(k, tmpM);
      for (const s of [-1, 1]) {
        tmpM2.makeRotationZ(s < 0 ? Math.PI - flap : flap);
        tmpM2.setPosition(s * 0.04, 0.03, 0);
        // el ala izquierda es la derecha girada media vuelta
        tmpW.multiplyMatrices(tmpM, tmpM2);
        this.crowWing.setMatrixAt(k * 2 + (s < 0 ? 0 : 1), tmpW);
      }
      k++;
    }
    this.crowBody.instanceMatrix.needsUpdate = true;
    this.crowBeak.instanceMatrix.needsUpdate = true;
    this.crowWing.instanceMatrix.needsUpdate = true;
    // graznido suelto de vez en cuando
    this.cawT = (this.cawT ?? 8) - dt;
    if (this.cawT <= 0) {
      this.cawT = 12 + Math.random() * 20;
      const perched = this.crows.filter((c) => c.state === 'perch');
      if (perched.length && !hidden) g.audio.caw(perched[Math.floor(Math.random() * perched.length)].pos, 1);
    }
    return t;
  }

  // ---------------- ratas ----------------
  buildRats() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.9 });
    const geo = mergeGeometries([
      new THREE.SphereGeometry(0.05, 8, 6).scale(0.8, 0.7, 1.6).translate(0, 0.035, 0),
      new THREE.ConeGeometry(0.03, 0.07, 6).rotateX(Math.PI / 2).translate(0, 0.035, 0.1),
      new THREE.SphereGeometry(0.012, 5, 4).translate(0.02, 0.06, 0.07),
      new THREE.SphereGeometry(0.012, 5, 4).translate(-0.02, 0.06, 0.07),
      new THREE.CylinderGeometry(0.004, 0.007, 0.16, 5).rotateX(Math.PI / 2 - 0.15).translate(0, 0.025, -0.15),
    ]);
    this.rats = RAT_RUNS.map((run) => ({
      a: new THREE.Vector3(run[0][0], 0, run[0][1]),
      b: new THREE.Vector3(run[1][0], 0, run[1][1]),
      k: 0,
      dir: 1,
      running: false,
      wait: 4 + Math.random() * 14,
    }));
    this.ratMesh = new THREE.InstancedMesh(geo, mat, this.rats.length);
    this.ratMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ratMesh.frustumCulled = false;
    for (let i = 0; i < this.rats.length; i++) this.ratMesh.setMatrixAt(i, ZERO);
    this.root.add(this.ratMesh);
  }

  updateRats(dt) {
    const g = this.g;
    const pp = g.player.pos;
    this.rats.forEach((r, i) => {
      if (!r.running) {
        r.wait -= dt;
        // un jugador cerca las espanta y salen corriendo
        const from = r.dir > 0 ? r.a : r.b;
        const near = Math.hypot(pp.x - from.x, pp.z - from.z) < 3.5;
        if (r.wait <= 0 || (near && Math.random() < dt * 2)) {
          r.running = true;
          r.k = 0;
          r.len = r.a.distanceTo(r.b);
          g.audio.squeak(from);
        }
        this.ratMesh.setMatrixAt(i, ZERO);
        return;
      }
      r.k += (dt * 3.6) / r.len;
      if (r.k >= 1) {
        r.running = false;
        r.dir *= -1;
        r.wait = 10 + Math.random() * 25;
        this.ratMesh.setMatrixAt(i, ZERO);
        return;
      }
      const from = r.dir > 0 ? r.a : r.b;
      const to = r.dir > 0 ? r.b : r.a;
      tmpP.lerpVectors(from, to, r.k);
      // zigzaguea un poco y pega saltitos
      const side = Math.sin(r.k * 40) * 0.05;
      const yaw = Math.atan2(to.x - from.x, to.z - from.z);
      tmpP.x += Math.cos(yaw) * side;
      tmpP.z -= Math.sin(yaw) * side;
      tmpP.y = Math.abs(Math.sin(r.k * 60)) * 0.015;
      tmpE.set(0, yaw + Math.sin(r.k * 40) * 0.2, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.ratMesh.setMatrixAt(i, tmpM);
    });
    this.ratMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.updateCrows(dt, this.g.time);
    this.updateRats(dt);
  }

  dispose() {
    this.root.removeFromParent();
  }
}
