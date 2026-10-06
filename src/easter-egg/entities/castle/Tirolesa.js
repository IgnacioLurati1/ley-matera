import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from '../../world/props';
import { leanGroup } from '../../world/staticLean';

// La tirolesa: del torreón del adarve (arriba de la muralla del sur) a las
// termas del Inca, por encima del barranco. Un atajo de ida al Pack-a-Pava:
// se engancha con F y baja colgado del cable, cada vez más rápido. Cada uno
// viaja por su cuenta (el movimiento es del jugador: player.ride).
// Recién anda con el Pack-a-Pava abierto (PapQuest.done): antes era un atajo
// que se salteaba el puente levadizo (2026-09-27, pedido del usuario).

const FROM = [37.2, 68.2];
const TO = [41.8, 84.2];
const POST_A = 4; // alto del poste de arriba (sobre el piso del adarve)
const POST_B = 2.4; // y del de abajo
const HANG = 1.9; // de la roldana a los pies
const DUR = 2.4;

const UP = new THREE.Vector3(0, 1, 0);
function pole(g, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = mesh(cylGeo(r, r, d.length(), seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  g.add(m);
  return m;
}

export default class Tirolesa {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    const M = g.world.M;
    const wood = M.woodDark || M.wood;
    const ya = g.world.floorAt(FROM[0], FROM[1]);
    const yb = g.world.floorAt(TO[0], TO[1]);
    this.A = new THREE.Vector3(FROM[0], ya + POST_A, FROM[1]);
    this.B = new THREE.Vector3(TO[0], yb + POST_B, TO[1]);
    const root = new THREE.Group();
    // el poste de arriba: un mástil con un brazo que sale para el barranco y riendas
    const dir = new THREE.Vector3().subVectors(this.B, this.A).setY(0).normalize();
    const baseA = new THREE.Vector3(FROM[0] - dir.x * 0.5, ya, FROM[1] - dir.z * 0.5);
    pole(root, baseA, baseA.clone().setY(ya + POST_A + 0.4), 0.12, wood, 8);
    pole(root, baseA.clone().setY(ya + POST_A), this.A, 0.07, wood);
    for (const s of [-1, 1]) pole(root, baseA.clone().setY(ya + POST_A + 0.3), new THREE.Vector3(baseA.x - dir.x * 1.6 + dir.z * s * 1.2, ya, baseA.z - dir.z * 1.6 - dir.x * s * 1.2), 0.012, M.rope || wood, 4);
    root.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), M.snowCap || wood, baseA.x, ya + POST_A + 0.45, baseA.z));
    // el de abajo: un caballete en A, con un farol colgado
    const baseB = new THREE.Vector3(TO[0] + dir.x * 0.4, yb, TO[1] + dir.z * 0.4);
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    for (const s of [-1, 1]) pole(root, baseB.clone().addScaledVector(side, s * 0.6), this.B.clone().addScaledVector(dir, 0.4).setY(yb + POST_B + 0.2), 0.08, wood);
    root.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffb050, emissiveIntensity: 1.8 }), baseB.x, yb + POST_B - 0.35, baseB.z));
    // el cable (con la comba del medio) y la roldana esperando arriba
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      pts.push(new THREE.Vector3().lerpVectors(this.A, this.B, u).addScaledVector(UP, -Math.sin(u * Math.PI) * 0.6));
    }
    for (let k = 0; k < 10; k++) pole(root, pts[k], pts[k + 1], 0.02, M.iron, 5);
    this.pulley = new THREE.Group();
    this.pulley.add(mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 14), M.iron, 0, 0, 0));
    this.pulley.add(mesh(cylGeo(0.015, 0.015, 0.9, 5), M.iron, 0, -0.45, 0));
    this.pulley.add(mesh(boxGeo(0.5, 0.05, 0.05), wood, 0, -0.9, 0));
    this.pulley.position.copy(this.A).addScaledVector(dir, 0.3);
    this.pulley.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    root.add(this.pulley);
    this.home = this.pulley.position.clone();
    // (los postes, las riendas y el cable no se mueven: una malla por material;
    // la roldana aparte, que baja con el que se tira. world/staticLean.leanGroup)
    const fixed = new THREE.Group();
    root.add(fixed);
    for (const o of [...root.children]) if (o.isMesh) fixed.add(o);
    leanGroup(fixed);
    egg.root.add(root);
    this.riding = null;
    g.interact.add({
      kind: 'tirolesa',
      local: true,
      pos: new THREE.Vector3(FROM[0], ya + 1.2, FROM[1]),
      radius: 1.8,
      prompt: () => (this.riding ? null : this.open() ? { text: 'tirarse por la tirolesa a las termas', noCost: true } : { text: 'la tirolesa está trabada: abrí el Pack-a-Pava primero', noCost: true, info: true }),
      cost: () => 0,
      use: () => this.start(),
    });
  }

  start() {
    const g = this.g;
    const p = g.player;
    if (this.riding || !this.open() || !p.alive || p.downed || p.ride) return false;
    const r = (this.riding = { t: 0 });
    const tmp = new THREE.Vector3();
    this.zip(0);
    p.ride = (dt) => {
      r.t = Math.min(1, r.t + dt / DUR);
      // arranca despacio y se va soltando (como si cayera)
      const u = r.t * r.t * 0.55 + r.t * 0.45;
      tmp.lerpVectors(this.A, this.B, u).addScaledVector(UP, -Math.sin(u * Math.PI) * 0.6);
      this.pulley.position.copy(tmp);
      p.pos.set(tmp.x, tmp.y - HANG, tmp.z);
      p.vel.set(0, 0, 0);
      p.onGround = false;
      p.airTop = p.pos.y;
      if (r.t >= 1) this.end();
    };
    return true;
  }

  open() {
    return !this.g.papq || this.g.papq.done;
  }

  end() {
    const g = this.g;
    const p = g.player;
    p.ride = null;
    // (que no cuente como caída: el piso está ahí nomás)
    p.airTop = p.pos.y;
    this.riding = null;
    g.later(1.5, () => this.pulley.position.copy(this.home));
    g.fx.dirt?.(p.pos, 6);
  }

  // el zumbido de la roldana por el cable
  zip(at) {
    const a = this.g.audio;
    if (!a?.out) return;
    const o = a.out({ gain: 0.5, reverb: 0.2 });
    const t = a.now + at;
    a.noise(o, { t, dur: DUR, type: 'bandpass', freq: 600, freqEnd: 2400, q: 2, gain: 0.25, attack: 0.3 });
    a.tone(o, { t, dur: DUR, type: 'sawtooth', freq: 90, freqEnd: 260, gain: 0.04, attack: 0.3 });
  }

  // si se muere o lo tiran en el medio, se suelta
  update() {
    const p = this.g.player;
    if (this.riding && (!p.alive || p.downed)) this.end();
  }
}
