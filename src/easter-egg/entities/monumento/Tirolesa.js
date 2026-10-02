import * as THREE from 'three';
import { EE } from '../../config/map';

// La tirolesa del Mirador: un cable de acero que sale por la ventana del este
// de la Torre (a 46 m) y baja por encima de la Proa hasta un poste del Parque.
// Es la bajada rápida: se agarra la roldana, se salta el antepecho y se baja
// colgado (se puede mirar y tirar), frena al final y se cae parado en el
// pasto. Cada uno se lleva a su jugador (lo demás lo ven por la posición de
// siempre); no cuesta nada.

const HANG = 1.85; // de la roldana a los pies
const HOP_T = 0.45; // del piso del Mirador al cable
const VMAX = 24;
const ACC = 16;
const BRAKE = 7; // los últimos metros, frenando
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();

export default class Tirolesa {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    const M = g.world.M;
    this.root = new THREE.Group();
    this.root.name = 'tirolesa';
    g.scene.add(this.root);
    const [fx, fz] = EE.tirolesa.desde;
    const [tx, tz] = EE.tirolesa.hasta;
    // las dos puntas del cable: el soporte de la ventana (afuera) y el poste del Parque
    this.A = new THREE.Vector3(80.45, 46.65, fz);
    this.B = new THREE.Vector3(tx, -2.6 + 3.1, tz);
    this.start = new THREE.Vector3(fx, 44, fz);
    this.dir = new THREE.Vector3().subVectors(this.B, this.A);
    this.len = this.dir.length();
    this.dir.normalize();
    // el cable (con una comba apenas) y su sombra no hace falta
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      pts.push(new THREE.Vector3().lerpVectors(this.A, this.B, k).setY(this.A.y + (this.B.y - this.A.y) * k - Math.sin(k * Math.PI) * 0.9));
    }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.03, 6), M.iron);
    this.root.add(cable);
    this.sag = (k) => Math.sin(k * Math.PI) * 0.9;
    // el soporte de la ventana: dos ménsulas de hierro y la placa
    const iron = M.ironBar || M.iron;
    const brk = new THREE.Group();
    brk.position.set(79.6, 45.05, fz);
    brk.add(this.box(1.0, 0.08, 0.5, iron, 0.4, 0.04, 0));
    brk.add(this.box(0.08, 1.7, 0.08, iron, 0.85, 0.85, -0.18));
    brk.add(this.box(0.08, 1.7, 0.08, iron, 0.85, 0.85, 0.18));
    brk.add(this.box(0.08, 0.08, 0.5, iron, 0.85, 1.66, 0));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 16), M.bronze);
    wheel.position.set(0.85, 1.55, 0);
    brk.add(wheel);
    this.root.add(brk);
    // el poste del Parque: palo de quebracho con el freno de cubiertas y el cartel
    const post = new THREE.Group();
    post.position.set(this.B.x + this.dir.x * 0.6, -2.6, this.B.z + this.dir.z * 0.6);
    post.add(this.box(0.28, 3.6, 0.28, M.woodDark || M.wood, 0, 1.8, 0));
    post.add(this.box(0.9, 0.12, 0.12, M.woodDark || M.wood, 0, 3.4, 0));
    const tire = new THREE.TorusGeometry(0.32, 0.12, 8, 16);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(tire, rubber);
      t.position.set(0, 0.25 + i * 0.22, 0);
      t.rotation.x = Math.PI / 2;
      post.add(t);
    }
    this.root.add(post);
    g.world.addBox([post.position.x - 0.35, -2.6, post.position.z - 0.35, post.position.x + 0.35, 1.1, post.position.z + 0.35], { kind: 'prop' });
    this.root.traverse((o) => o.isMesh && (o.castShadow = true));
    cable.castShadow = false;
    // la roldana que baja con uno (se ve en la mano)
    const trolley = new THREE.Group();
    trolley.add(this.box(0.08, 0.2, 0.22, M.bronze, 0, 0, 0));
    const tw = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), iron);
    tw.position.y = 0.12;
    trolley.add(tw);
    trolley.visible = false;
    this.root.add(trolley);
    this.trolley = trolley;
    this.ride = null;
    // se agarra adentro del Mirador, frente a la ventana del este
    g.interact.add({
      kind: 'tirolesa',
      local: true,
      pos: new THREE.Vector3(fx, 44 + 1.3, fz),
      radius: 1.6,
      prompt: () => (this.ride ? null : { text: 'bajar por la tirolesa', noCost: true }),
      cost: () => 0,
      use: () => this.go(),
    });
  }

  box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  // el punto del cable a la distancia s de la ventana
  at(s, out) {
    const k = Math.max(0, Math.min(1, s / this.len));
    return out.copy(this.A).addScaledVector(this.dir, s).setY(this.A.y + (this.B.y - this.A.y) * k - this.sag(k));
  }

  go() {
    const g = this.g;
    const P = g.player;
    if (this.ride || !P.alive || P.downed || P.ride) return false;
    this.ride = { t: 0, s: 0, v: 0, from: P.pos.clone() };
    this.trolley.visible = true;
    P.ride = (dt) => this.step(dt);
    this.sfxStart();
    return true;
  }

  step(dt) {
    const g = this.g;
    const P = g.player;
    const R = this.ride;
    if (!R) return;
    R.t += dt;
    P.vel.set(0, 0, 0);
    if (R.t < HOP_T) {
      // salta el antepecho y se cuelga
      const k = R.t / HOP_T;
      this.at(0, tmpA);
      P.pos.lerpVectors(R.from, tmpV.copy(tmpA).setY(tmpA.y - HANG), k);
      P.pos.y += Math.sin(k * Math.PI) * 0.5;
    } else {
      const left = this.len - R.s;
      if (left > BRAKE) R.v = Math.min(VMAX, R.v + ACC * dt);
      else R.v = Math.max(2.5, R.v - (R.v * R.v) / (2 * Math.max(0.5, left)) * dt);
      R.s = Math.min(this.len, R.s + R.v * dt);
      this.at(R.s, tmpA);
      P.pos.copy(tmpA).setY(tmpA.y - HANG);
      // un vaivén colgado y el temblor del cable a toda velocidad
      P.pos.x += Math.sin(R.t * 2.3) * 0.08;
      g.fx?.addShake?.(dt * 0.25 * (R.v / VMAX));
      this.sfxWind(R.v, dt);
      if (R.s >= this.len - 0.05) this.land();
    }
    if (this.ride) {
      this.trolley.position.copy(P.pos).setY(P.pos.y + HANG + 0.05);
      this.trolley.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    }
    P.onGround = false;
    P.airTop = P.pos.y;
  }

  // abajo: se suelta al lado del poste, parado en el pasto
  land() {
    const g = this.g;
    const P = g.player;
    const x = this.B.x - this.dir.x * 1.2;
    const z = this.B.z - this.dir.z * 1.2;
    const y = g.world.floorAt(x, z, -2.0);
    P.pos.set(x, y, z);
    P.vel.set(this.dir.x * 3, 0, this.dir.z * 3);
    P.airTop = y;
    P.onGround = true;
    P.ride = null;
    this.ride = null;
    this.trolley.visible = false;
    g.audio?.land?.();
    this.sfxStop();
  }

  update() {
    // (si lo voltean o se muere colgado, se suelta)
    const P = this.g.player;
    if (this.ride && (!P.alive || P.downed)) this.land();
  }

  // ---------------- los ruidos ----------------
  sfxStart() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.7, reverb: 0.1 });
    A.noise(o, { t: A.now, dur: 0.18, type: 'bandpass', freq: 2400, q: 3, gain: 0.3 });
    A.tone(o, { t: A.now + 0.05, dur: 0.25, type: 'triangle', freq: 330, freqEnd: 220, gain: 0.12 });
    this.windT = 0;
  }

  // el viento y el chillido de la roldana en el cable (cortitos, seguidos)
  sfxWind(v, dt) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    this.windT = (this.windT || 0) - dt;
    if (this.windT > 0) return;
    this.windT = 0.18;
    const k = v / VMAX;
    const o = A.out({ gain: 0.25 + k * 0.5, reverb: 0 });
    A.noise(o, { t: A.now, dur: 0.24, type: 'bandpass', freq: 500 + k * 1400, q: 0.8, gain: 0.35, attack: 0.05 });
    A.tone(o, { t: A.now, dur: 0.22, type: 'sawtooth', freq: 900 + k * 1600, gain: 0.012 + k * 0.02 });
  }

  sfxStop() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.8, reverb: 0.2 });
    A.noise(o, { t: A.now, dur: 0.35, type: 'lowpass', freq: 400, gain: 0.5 });
  }

  dispose() {
    if (this.ride) this.g.player.ride = null;
    this.root.removeFromParent();
  }
}
