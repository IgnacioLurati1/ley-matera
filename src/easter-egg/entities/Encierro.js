import * as THREE from 'three';
import { DOORS, ZONES } from '../config/map';
import { zombieHealth, maxAlive } from '../config/rules';

// Encierros: una habitación se cierra con una cortina de fuego (o de almas)
// en cada puerta y los muertos salen de adentro. Para arrancar uno tienen que
// estar todos los jugadores vivos en esa habitación (regla de todos los mapas);
// mientras dura, nadie sale y nadie entra.

const DOOR_H = 2.7;

// Nombres de los que están vivos y no están en la zona ('vos' si sos vos).
export function missingIn(g, zone) {
  const out = [];
  const w = g.world;
  const p = g.player;
  if (p.alive && w.zoneAt(p.pos.x, p.pos.z, p.pos.y) !== zone) out.push('vos');
  if (g.net) {
    for (const r of g.net.remote.values()) {
      if (r.dead) continue;
      if (w.zoneAt(r.pos.x, r.pos.z, r.pos.y) !== zone) out.push(r.name || g.net.nameOf(r.id));
    }
  }
  return out;
}

// Aviso para el cartel de la F: quién falta para arrancar el encierro.
export function missingText(names, place) {
  const who = names.map((n) => (n === 'vos' ? 'vos' : n));
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} y ${who[who.length - 1]}` : who[0];
  return `Para el encierro tienen que estar todos en ${place}: falta${who.length > 1 ? 'n' : ''} ${list}`;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSeed;
varying vec2 vUv;
void main() {
  float x = vUv.x * 6.0 + uSeed;
  float y = vUv.y;
  float t = uTime;
  float n = sin(x * 3.1 + t * 2.3) * 0.5 + sin(x * 7.7 - t * 3.7) * 0.25 + sin(x * 13.3 + t * 5.1) * 0.12;
  float h = 0.62 + n * 0.22;
  float a = smoothstep(h, h - 0.45, y);
  a *= 0.55 + 0.45 * sin(x * 9.0 + y * 5.0 - t * 6.0);
  a += smoothstep(0.12, 0.0, y) * 0.6;
  a *= smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  gl_FragColor = vec4(uColor * (0.7 + a * 1.6), clamp(a, 0.0, 1.0) * uAlpha);
}`;

export default class Encierro {
  // zone: la habitación; color: de la cortina; place: cómo se la nombra.
  constructor(g, { zone, color = 0xff6a1a, place = 'la habitación' }) {
    this.g = g;
    this.zone = zone;
    this.place = place;
    this.color = new THREE.Color(color);
    this.on = false;
    this.alpha = 0;
    this.root = new THREE.Group();
    this.root.visible = false;
    g.scene.add(this.root);
    this.mats = [];
    this.buildCurtains();
    this.cells = this.zoneCells();
    this.spawnT = 0;
  }

  // Una cortina por cada puerta de la habitación, del lado de adentro.
  buildCurtains() {
    const Z = ZONES[this.zone];
    // (las zonas del penal tienen varios rectángulos: vale el primero)
    const [x0, z0, x1, z1] = Z.rect || Z.rects[0];
    const cx = (x0 + x1 + 1) / 2;
    const cz = (z0 + z1 + 1) / 2;
    this.doors = DOORS.filter((d) => d.zones.includes(this.zone));
    for (const d of this.doors) {
      const xs = d.cells.map((c) => c[0]);
      const zs = d.cells.map((c) => c[1]);
      const alongZ = xs.every((x) => x === xs[0]);
      const w = d.cells.length;
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 }, uColor: { value: this.color }, uAlpha: { value: 0 }, uSeed: { value: Math.random() * 20 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      this.mats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, DOOR_H), mat);
      const y = this.g.world.floorAt(xs[0] + 0.5, zs[0] + 0.5) + DOOR_H / 2;
      if (alongZ) {
        const s = cx > xs[0] + 0.5 ? 1 : -1;
        m.position.set(xs[0] + 0.5 + s * 0.53, y, Math.min(...zs) + w / 2);
        m.rotation.y = Math.PI / 2;
      } else {
        const s = cz > zs[0] + 0.5 ? 1 : -1;
        m.position.set(Math.min(...xs) + w / 2, y, zs[0] + 0.5 + s * 0.53);
      }
      m.renderOrder = 3;
      this.root.add(m);
    }
  }

  // Celdas de piso de la zona (para que los muertos salgan de adentro).
  zoneCells() {
    const w = this.g.world;
    const zi = w.zoneKeys.indexOf(this.zone);
    const list = [];
    for (let i = 0; i < w.zone.length; i++) if (w.zone[i] === zi) list.push(i);
    return list;
  }

  missing() {
    return missingIn(this.g, this.zone);
  }

  missingText() {
    const m = this.missing();
    return m.length ? missingText(m, this.place) : null;
  }

  inside(pos) {
    return this.g.world.zoneAt(pos.x, pos.z, pos.y) === this.zone;
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.root.visible = true;
    this.safe = null;
    this.spawnT = 1.2;
    const g = this.g;
    g.audio.bossArrive();
    for (const m of this.root.children) g.fx.explosion(m.position, 1.2, [this.color.r, this.color.g, this.color.b]);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.safe = null;
    const g = this.g;
    for (const m of this.root.children) g.fx.sparkle(m.position, [this.color.r, this.color.g, this.color.b], 24, 1.2);
  }

  // Un muerto que sale de la tierra adentro de la habitación. spots: lugares
  // preferidos (las tumbas); si no, una celda libre lejos de los jugadores.
  spawn(spots = null) {
    const g = this.g;
    const w = g.world;
    const players = [g.player.alive ? g.player.pos : null, ...(g.net ? [...g.net.remote.values()].filter((r) => !r.dead).map((r) => r.pos) : [])].filter(Boolean);
    const far = (x, z) => players.every((p) => Math.hypot(p.x - x, p.z - z) > 3.2);
    let at = null;
    if (spots?.length) {
      const list = spots.filter(([x, z]) => far(x, z));
      if (list.length) {
        const [x, z] = list[Math.floor(Math.random() * list.length)];
        at = new THREE.Vector3(x, w.floorAt(x, z), z);
      }
    }
    for (let k = 0; !at && k < 14; k++) {
      const i = this.cells[Math.floor(Math.random() * this.cells.length)];
      const x = (i % w.W) + 0.5;
      const z = Math.floor(i / w.W) + 0.5;
      if (w.navBlock[i] || !far(x, z) || !Number.isFinite(g.nav.distAt(x, z))) continue;
      at = new THREE.Vector3(x, w.floorAt(x, z), z);
    }
    if (!at) return null;
    const round = Math.max(3, g.rounds.round);
    return g.zombies.spawn(round, zombieHealth(round), at) ? at : null;
  }

  // Lo lleva el anfitrión: cada tanto sale uno, sin pasarse del máximo.
  spawns(dt, rate = 1.8, spots = null) {
    const g = this.g;
    this.spawnT -= dt;
    if (this.spawnT > 0) return null;
    const n = g.net ? g.net.net.count : 1;
    this.spawnT = rate / Math.sqrt(n);
    if (g.zombies.alive >= maxAlive(n)) return null;
    return this.spawn(spots);
  }

  update(dt) {
    const g = this.g;
    this.alpha += ((this.on ? 1 : 0) - this.alpha) * Math.min(1, dt * 3);
    if (this.alpha < 0.01 && !this.on) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    for (const m of this.mats) {
      m.uniforms.uTime.value = g.time;
      m.uniforms.uAlpha.value = this.alpha * 0.9;
    }
    if (this.on) {
      if (Math.random() < 0.3) {
        const m = this.root.children[Math.floor(Math.random() * this.root.children.length)];
        if (m) g.fx.sparkle(m.position, [this.color.r, this.color.g, this.color.b], 1, 1.2);
      }
      this.lock(dt);
    }
  }

  // Nadie cruza la cortina: el de adentro no sale y el de afuera no entra.
  lock(dt) {
    const g = this.g;
    const p = g.player;
    if (!p.alive) {
      this.safe = null;
      return;
    }
    const inZone = this.inside(p.pos);
    // recién empieza, o apareció en otro lado (revivió): se toma de ahí
    if (!this.safe || this.safe.distanceToSquared(p.pos) > 16) {
      this.side = inZone;
      this.safe = p.pos.clone();
      return;
    }
    if (inZone === this.side) {
      this.safe.copy(p.pos);
      return;
    }
    p.pos.x = this.safe.x;
    p.pos.z = this.safe.z;
    if (p.vel) {
      p.vel.x = 0;
      p.vel.z = 0;
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.root.children) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
