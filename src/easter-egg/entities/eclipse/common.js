import * as THREE from 'three';
import { ZONES } from '../../config/map';

// Lo que comparten los pasos del easter egg de Eclipse Matero ("El Primer
// Mate", entities/EclipseEgg.js): quién es quién en la red, marcas en el
// mundo, los objetos que se juntan y la base de cada paso (QStep).

export const myId = (g) => (g.net ? g.net.id : 0);
export const isHost = (g) => !g.net || g.net.host;
// dónde está el jugador `id` (el local o uno de la red), o null
export const playerAt = (g, id) => ((g.net?.id ?? 0) === id ? g.player.pos : g.net?.remote.get(id)?.pos || null);
// todos los jugadores vivos: [{ id, pos, downed }]
export function players(g) {
  const out = [{ id: myId(g), pos: g.player.pos, downed: !!g.player.downed }];
  if (g.net?.remote) for (const [id, r] of g.net.remote) if (r.pos) out.push({ id, pos: r.pos, downed: !!r.downed });
  return out;
}
export const islaAt = (g, p) => {
  const k = g.world.zoneAt(p.x, p.z, p.y);
  return k ? ZONES[k].isla : null;
};
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const tmpC = new THREE.Color();

// Una marca en el mundo: una columna de luz tenue y un anillo en el piso.
// (col: color; r: radio del anillo). `set(on)` la prende, `pulse()` la sacude.
export class Marker {
  constructor(g, pos, col = 0xa070ff, r = 0.7) {
    this.g = g;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.col = col;
    this.k = 0;
    this.want = 0;
    this.beat = 0;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.position.y = 0.03;
    // (la columna: baja y fina, que no atraviese los techos ni tape lo de atrás)
    const col3 = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.5, 3.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    col3.position.y = 1.6;
    this.ring = ring;
    this.pillar = col3;
    this.root.add(ring, col3);
    this.root.visible = false;
    g.scene.add(this.root);
  }

  set(on) {
    this.want = on ? 1 : 0;
  }

  pulse() {
    this.beat = 1;
  }

  update(dt, t) {
    if (this.k === this.want && this.k === 0) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.k += (this.want - this.k) * Math.min(1, dt * 3);
    if (this.beat > 0) this.beat = Math.max(0, this.beat - dt * 1.6);
    const b = 0.75 + 0.25 * Math.sin(t * 2.4) + this.beat * 1.2;
    this.ring.material.opacity = this.k * 0.55 * b;
    this.pillar.material.opacity = this.k * 0.085 * b;
    this.ring.rotation.y = t * 0.3;
    this.root.scale.setScalar(1 + this.beat * 0.25);
    if (this.k < 0.01 && this.want === 0) this.root.visible = false;
  }

  dispose() {
    this.root.removeFromParent();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.pillar.geometry.dispose();
    this.pillar.material.dispose();
  }
}

// Un objeto que se junta (un ingrediente, una pieza): flota girando sobre su
// lugar hasta que alguien lo agarra con F. `obj` es la malla (ya armada).
export class Pickup {
  constructor(g, obj, pos, { radius = 1.6, text = 'agarrar', col = 0xffd080 } = {}) {
    this.g = g;
    this.obj = obj;
    this.base = pos.clone();
    obj.position.copy(pos);
    obj.visible = false;
    g.scene.add(obj);
    // (la luz queda siempre en la escena con intensidad 0: prenderla de golpe
    // compilaba ~50 programas en plena partida; cine/PROGRESO.md)
    this.light = new THREE.PointLight(col, 0, 5, 2);
    this.light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    g.scene.add(this.light);
    this.on = false;
    this.taken = false;
    this.onTake = null;
    this.it = g.interact.add({
      kind: 'eclipse-pickup',
      pos: pos.clone(),
      radius,
      prompt: () => (this.on && !this.taken ? { text, noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.on || this.taken) return false;
        this.onTake?.();
        return true;
      },
    });
  }

  show(on) {
    this.on = on;
    this.obj.visible = on;
    this.light.intensity = on ? 1.2 : 0;
  }

  take() {
    this.taken = true;
    this.show(false);
  }

  update(dt, t) {
    if (!this.on) return;
    this.obj.position.y = this.base.y + 0.9 + Math.sin(t * 1.7) * 0.12;
    this.obj.rotation.y = t * 0.9;
  }

  dispose() {
    this.obj.removeFromParent();
    this.light.removeFromParent();
  }
}

// Un mate chico que brilla: el ingrediente que se ve antes de agarrarlo.
export function glowMate(col = 0xffb060) {
  const grp = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7, metalness: 0, emissive: new THREE.Color(col), emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), m);
  body.scale.set(1, 1.25, 1);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8c070, metalness: 0.8, roughness: 0.3 }));
  rim.position.y = 0.2;
  const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.9, roughness: 0.3 }));
  bomb.position.set(0.05, 0.3, 0);
  bomb.rotation.z = -0.35;
  grp.add(body, rim, bomb);
  return grp;
}

// Una esfera de luz (un ánima, una brasa, una llama) para los objetos que no
// son mates.
export function glowOrb(col = 0xa070ff, r = 0.2) {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  grp.add(core, halo);
  return grp;
}

// La base de cada paso: estado chico `st` que viaja entero por la red (el
// anfitrión manda; `send` aplica acá y avisa), marcas y objetos a actualizar.
export class QStep {
  constructor(ee, id) {
    this.ee = ee;
    this.g = ee.g;
    this.id = id;
    this.st = { on: 0, done: 0 };
    this.live = [];
    this.marks = [];
  }

  get host() {
    return isHost(this.g);
  }

  // Lo que pueden pedir el anfitrión (y aplica en todos) o un invitado (le
  // llega al anfitrión por onGuest).
  send(m0) {
    // (lo que llega de un invitado trae t: 'pee'; en un evento, t y e son del sobre)
    const { t: _t, e: _e, ...m } = m0;
    if (this.host) {
      this.apply(m);
      this.g.net?.event('pee', { k: 'eq', s: this.id, ...m });
    } else this.g.net?.net?.send({ t: 'pee', k: 'eq', s: this.id, ...m });
  }

  // (lo pisa cada paso; m.a: la acción)
  apply(m) {}

  // (un invitado pidió algo: el anfitrión decide y avisa a todos)
  onGuest(m) {
    if (this.host) this.send(m);
  }

  state() {
    return { ...this.st };
  }

  applyFull(s) {
    if (s) Object.assign(this.st, s);
    this.refresh?.();
  }

  done() {
    return this.st.done === 1;
  }

  // (el anfitrión) el paso terminó: el easter egg anota el ingrediente
  finish(extra = {}) {
    if (this.st.done) return;
    this.send({ a: 'done', ...extra });
  }

  update(dt, t) {
    for (const m of this.marks) m.update(dt, t);
    for (const o of this.live) o.update(dt, t);
  }

  dispose() {
    for (const m of this.marks) m.dispose();
    for (const o of this.live) o.dispose?.();
  }
}

// Aguantar en un lugar: cuánto (0-1) lleva el equipo adentro del radio.
// Avanza solo mientras hay alguien vivo adentro; si nadie, retrocede despacio.
export class HoldZone {
  constructor(g, pos, radius, secs) {
    this.g = g;
    this.pos = pos;
    this.r = radius;
    this.secs = secs;
    this.k = 0;
  }

  // true cuando llegó a 1 (una vez)
  update(dt) {
    const inside = players(this.g).some((p) => !p.downed && dist2(p.pos, this.pos) < this.r && Math.abs(p.pos.y - this.pos.y) < 3);
    const before = this.k;
    this.k = Math.max(0, Math.min(1, this.k + (inside ? dt : -dt * 0.35) / this.secs));
    this.inside = inside;
    return before < 1 && this.k >= 1;
  }
}

export const colorOf = (hex) => tmpC.set(hex).clone();
