import * as THREE from 'three';
import Navigation from '../world/Navigation';
import { RISERS } from '../config/map';
import { POINTS, zombieHealth } from '../config/rules';

// El Pombero: duende del monte, petiso y peludo, con un sombrero de paja
// enorme y un silbido que se oye antes de verlo. Muy de vez en cuando, cuando
// cae un potenciador, aparece, lo agarra y sale corriendo a esconderse con él
// en algún pozo. Si lo liquidás antes de que se escape, el potenciador es tuyo.
//
// Para las armas es un "zombie" más (lo devuelven raycast e inRadius del grupo
// y el daño pasa por acá), pero no cuenta para la ronda. En línea lo simula el
// anfitrión y los invitados lo ven por la foto de cada cuadro.

export const POMBERO_ID = 0xfffe;
const CHANCE = 0.25; // por cada potenciador que cae
const COOLDOWN = 150; // segundos de juego entre una aparición y la otra
const RUN = 3.9;
const CARRY = 3.3;
const STATES = ['appear', 'toItem', 'flee', 'dead'];
const NAMES = {
  maxammo: 'la munición máxima',
  insta: 'la muerte instantánea',
  double: 'los puntos dobles',
  nuke: 'el Kaboom',
  carpenter: 'el carpintero',
  firesale: 'la liquidación',
};

const tmpV = new THREE.Vector3();
const dirOut = { x: 0, z: 0 };

export default class Pombero {
  constructor(game) {
    this.g = game;
    this.nav = new Navigation(game.world);
    // lo que ven las armas
    this.z = { pombero: true, active: false, dead: false, boss: false, dog: false, id: POMBERO_ID, pos: new THREE.Vector3(), yaw: 0, scale: 1, hp: 1, maxHp: 1, hidden: 0 };
    this.state = 'off';
    this.t = 0;
    this.phase = 0;
    this.next = 60; // la primera vez, no antes del minuto
    this.item = null; // el potenciador que va a buscar
    this.carry = null; // { id, type, mesh } el que lleva
    this.escape = null;
    this.rig = this.build();
    this.rig.visible = false;
    game.scene.add(this.rig);
  }

  // ---------------- modelo ----------------
  build() {
    const T = this.g.textures;
    const fur = new THREE.MeshStandardMaterial({ color: 0x4e3521, map: T.burlap || null, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x6e4a30, map: T.skin || null, roughness: 0.9 });
    const beard = new THREE.MeshStandardMaterial({ color: 0x2a1c12, map: T.burlap || null, roughness: 1 });
    const straw = new THREE.MeshStandardMaterial({ color: 0xd9b56a, map: T.burlap || null, roughness: 0.95, side: THREE.DoubleSide });
    const band = new THREE.MeshStandardMaterial({ color: 0x7a2418, roughness: 0.8 });
    const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(2.2), toneMapped: false });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // piernas cortas y chuecas (cuelgan de la cadera)
    const leg = (x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.4, 0);
      add(hip, new THREE.CapsuleGeometry(0.07, 0.24, 3, 8), fur, 0, -0.2, 0);
      add(hip, new THREE.SphereGeometry(0.08, 8, 6).scale(1, 0.6, 1.5), skin, 0, -0.39, 0.05);
      body.add(hip);
      return hip;
    };
    this.legL = leg(0.1);
    this.legR = leg(-0.1);
    // panza peluda
    add(body, new THREE.SphereGeometry(0.25, 14, 10).scale(1, 1.15, 0.9), fur, 0, 0.64, 0);
    // cabezota con narigón, barba y ojos que brillan
    const head = new THREE.Group();
    head.position.set(0, 0.98, 0.02);
    body.add(head);
    add(head, new THREE.SphereGeometry(0.17, 14, 10), skin, 0, 0, 0);
    add(head, new THREE.SphereGeometry(0.055, 8, 6).scale(1, 1, 1.4), skin, 0, -0.01, 0.17);
    add(head, new THREE.ConeGeometry(0.16, 0.34, 10).rotateX(Math.PI), beard, 0, -0.2, 0.06);
    add(head, new THREE.SphereGeometry(0.036, 6, 5), eyes, 0.065, 0.04, 0.145);
    add(head, new THREE.SphereGeometry(0.036, 6, 5), eyes, -0.065, 0.04, 0.145);
    // el sombrero de paja, grandote
    add(head, new THREE.CylinderGeometry(0.46, 0.5, 0.025, 22), straw, 0, 0.12, 0);
    add(head, new THREE.CylinderGeometry(0.15, 0.19, 0.2, 16), straw, 0, 0.23, 0);
    add(head, new THREE.CylinderGeometry(0.192, 0.192, 0.04, 16), band, 0, 0.16, 0);
    this.head = head;
    // brazos largos que llegan casi al piso (cuelgan del hombro)
    const arm = (x) => {
      const sh = new THREE.Group();
      sh.position.set(x, 0.8, 0);
      add(sh, new THREE.CapsuleGeometry(0.05, 0.42, 3, 8), fur, 0, -0.25, 0);
      add(sh, new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.52, 0);
      body.add(sh);
      return sh;
    };
    this.armL = arm(0.27);
    this.armR = arm(-0.27);
    // donde va el potenciador robado: arriba de la cabeza, entre las manos
    this.hold = new THREE.Group();
    this.hold.position.set(0, 1.55, 0.05);
    body.add(this.hold);
    this.body = body;
    return root;
  }

  // ---------------- aparición ----------------
  // Cae un potenciador (lo llama quien simula: en solitario o el anfitrión).
  onDrop(item) {
    const g = this.g;
    // arriba en el altillo no lo va a buscar
    if (g.net?.guest || this.z.active || g.time < this.next || (g.rounds?.round || 0) < 2 || item.pos.y > 1) return;
    if (Math.random() > CHANCE) return;
    this.next = g.time + COOLDOWN;
    g.later(1.5 + Math.random() * 2, () => this.spawn(item));
  }

  spawn(item) {
    const g = this.g;
    if (this.z.active || g.state !== 'playing' || !g.powerups.items.includes(item)) return false;
    // sale de un pozo que no esté ni muy cerca ni muy lejos del potenciador
    this.nav.update(item.pos.x, item.pos.z, true);
    const players = this.players();
    const spots = RISERS.filter((r) => g.activeZones.has(r.zone))
      .map((r) => ({ x: r.pos[0], z: r.pos[1], d: this.nav.distAt(r.pos[0], r.pos[1]) }))
      .filter((s) => s.d >= 9 && s.d <= 34 && players.every((p) => Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > 6));
    if (!spots.length) return false;
    const s = spots[Math.floor(Math.random() * spots.length)];
    const z = this.z;
    const n = g.rounds?.players || 1;
    z.pos.set(s.x, 0, s.z);
    z.yaw = Math.atan2(item.pos.x - s.x, item.pos.z - s.z);
    z.hp = z.maxHp = Math.max(300, zombieHealth(g.rounds.round) * 1.2) * (1 + (n - 1) * 0.5);
    z.active = true;
    z.dead = false;
    this.item = item;
    this.setState('appear');
    this.appearFx();
    g.hud.subtitle('Se oye un silbido... ¡el Pombero viene por el potenciador!', 3.5);
    g.net?.event('sub', { x: 'Se oye un silbido... ¡el Pombero viene por el potenciador!', d: 3.5 });
    return true;
  }

  appearFx() {
    const g = this.g;
    g.fx.dirt(this.z.pos, 10);
    g.fx.yerbaPuff?.(this.z.pos);
    g.audio.pombero?.(tmpV.set(this.z.pos.x, 1.2, this.z.pos.z));
  }

  players() {
    const g = this.g;
    const list = g.player.alive ? [g.player] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) list.push(r);
    return list;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // El pozo para escaparse: el más lejos de todos los jugadores.
  pickEscape() {
    const g = this.g;
    const players = this.players();
    let best = null;
    let bestD = -Infinity;
    for (const r of RISERS) {
      if (!g.activeZones.has(r.zone)) continue;
      const near = players.reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - r.pos[0], p.pos.z - r.pos[1])), Infinity);
      const here = Math.hypot(this.z.pos.x - r.pos[0], this.z.pos.z - r.pos[1]);
      if (here < 5) continue;
      const score = Math.min(near, 40) - here * 0.2;
      if (score > bestD) {
        bestD = score;
        best = { x: r.pos[0], z: r.pos[1] };
      }
    }
    return best || { x: this.z.pos.x, z: this.z.pos.z };
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const z = this.z;
    if (!z.active) return;
    this.t += dt;
    if (g.net?.guest) {
      this.follow(dt);
      this.animate(dt);
      return;
    }
    if (this.state === 'appear') {
      if (this.t > 0.8) this.setState('toItem');
    } else if (this.state === 'toItem') {
      const it = this.item;
      if (!it || !g.powerups.items.includes(it)) {
        // se lo ganaron de mano: se vuelve con las manos vacías
        this.item = null;
        this.flee();
      } else {
        this.move(dt, it.pos.x, it.pos.z, RUN);
        if (Math.hypot(it.pos.x - z.pos.x, it.pos.z - z.pos.z) < 0.9) this.grab(it);
      }
    } else if (this.state === 'flee') {
      this.move(dt, this.escape.x, this.escape.z, this.carry ? CARRY : RUN * 1.1);
      if (Math.hypot(this.escape.x - z.pos.x, this.escape.z - z.pos.z) < 0.9 || this.t > 45) this.vanish();
    } else if (this.state === 'dead') {
      if (this.t > 3) this.hide();
    }
    this.animate(dt);
  }

  move(dt, tx, tz, speed) {
    const g = this.g;
    const z = this.z;
    const dx = tx - z.pos.x;
    const dz = tz - z.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = dx / dist;
    let mz = dz / dist;
    const clear = dist < 2 || g.world.clear(tmpV.set(z.pos.x, 0.8, z.pos.z), new THREE.Vector3(tx, 0.8, tz));
    if (!clear && this.nav.direction(z.pos.x, z.pos.z, dirOut)) {
      mx = dirOut.x;
      mz = dirOut.z;
    }
    let d = Math.atan2(mx, mz) - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += Math.max(-10 * dt, Math.min(10 * dt, d));
    z.pos.x += mx * speed * dt;
    z.pos.z += mz * speed * dt;
    g.world.collide(z.pos, 0.28, 0.1, 1.2);
    this.speed = speed;
  }

  grab(it) {
    const g = this.g;
    const i = g.powerups.items.indexOf(it);
    if (i < 0) return;
    g.powerups.items.splice(i, 1);
    this.hold.add(it.mesh);
    it.mesh.position.set(0, 0, 0);
    it.mesh.visible = true;
    this.carry = { id: it.id, type: it.type, mesh: it.mesh };
    this.item = null;
    g.audio.laugh?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    const text = `¡El Pombero se lleva ${NAMES[it.type] || 'el potenciador'}! Liquidalo antes de que se escape.`;
    g.hud.subtitle(text, 3.5);
    g.net?.event('pomb', { a: 'grab', id: it.id, type: it.type });
    g.net?.event('sub', { x: text, d: 3.5 });
    this.flee();
  }

  flee() {
    this.escape = this.pickEscape();
    this.nav.update(this.escape.x, this.escape.z, true);
    this.setState('flee');
  }

  // Llegó al pozo: se mete y se lleva lo que tenga.
  vanish() {
    const g = this.g;
    this.appearFx();
    if (this.carry) {
      const text = `El Pombero se escapó con ${NAMES[this.carry.type] || 'el potenciador'}.`;
      g.hud.subtitle(text, 3);
      g.net?.event('sub', { x: text, d: 3 });
    }
    g.net?.event('pomb', { a: 'gone' });
    this.hide();
  }

  hide() {
    this.dropCarry();
    this.z.active = false;
    this.z.dead = false;
    this.state = 'off';
    this.rig.visible = false;
  }

  dropCarry() {
    if (!this.carry) return;
    this.carry.mesh.removeFromParent();
    this.carry = null;
  }

  // ---------------- daño ----------------
  hitTest(o, d, maxT) {
    const z = this.z;
    if (!z.active || z.dead || this.state === 'appear') return null;
    const s = this.rig.scale.x;
    const head = sphereHit(o, d, z.pos.x, 1.02 * s, z.pos.z, 0.24 * s, maxT);
    const body = sphereHit(o, d, z.pos.x, 0.58 * s, z.pos.z, 0.32 * s, maxT);
    if (head === null && body === null) return null;
    if (body === null || (head !== null && head < body)) return { z, t: head, zone: 'head' };
    return { z, t: body, zone: 'torso' };
  }

  damage(amount, info = {}) {
    const g = this.g;
    const z = this.z;
    if (!z.active || z.dead || this.state === 'appear') return false;
    const type = info.type || 'bullet';
    // el Kaboom no lo alcanza: es un duende, no un muerto
    if (type === 'nuke') return false;
    let dmg = amount;
    if (g.powerups.active.insta && type !== 'burn') dmg = z.hp + 1;
    if (['freeze', 'chain', 'blast'].includes(type)) dmg = Math.max(dmg, z.maxHp * 0.6);
    z.hp -= dmg;
    if (info.point && type !== 'freeze' && type !== 'chain') g.fx.blood(info.point, info.dir || { x: 0, y: 0.5, z: 0 }, 10);
    if (z.hp > 0) {
      g.zombies.lastPoints = POINTS.hit;
      if (!info.noPoints) g.addPoints(POINTS.hit, info.point);
      if (Math.random() < 0.3) g.audio.yelp?.(tmpV.set(z.pos.x, 1, z.pos.z));
      return true;
    }
    this.kill(info);
    return true;
  }

  kill(info = {}) {
    const g = this.g;
    const z = this.z;
    const type = info.type || 'bullet';
    z.dead = true;
    this.setState('dead');
    const pts = POINTS.kill + POINTS.head * 2;
    g.zombies.lastPoints = pts;
    if (!info.noPoints) g.addPoints(pts, info.point);
    if (info.by != null && g.net?.host && info.by !== g.net.id) g.net.creditKill(info.by, type, info.zone);
    else {
      g.stats.kills++;
      if (info.zone === 'head' && ['bullet', 'knife'].includes(type)) g.stats.headshots++;
      if (type === 'knife') g.stats.knifeKills++;
    }
    g.audio.yelp?.(tmpV.set(z.pos.x, 1, z.pos.z));
    g.net?.event('pomb', { a: 'drop' });
    if (this.carry) {
      // te lo da: el efecto sale para todos, como si lo hubieras agarrado
      const { id, type: pup } = this.carry;
      this.dropCarry();
      g.powerups.apply(pup, id);
      const text = `¡Le sacaste ${NAMES[pup] || 'el potenciador'} al Pombero!`;
      g.hud.subtitle(text, 3);
      g.net?.event('sub', { x: text, d: 3 });
    } else {
      g.hud.subtitle('¡Liquidaste al Pombero!', 2.5);
      g.net?.event('sub', { x: '¡Liquidaste al Pombero!', d: 2.5 });
    }
  }

  // ---------------- animación ----------------
  animate(dt) {
    const z = this.z;
    const r = this.rig;
    r.visible = z.active;
    if (!z.active) return;
    r.position.set(z.pos.x, 0, z.pos.z);
    r.rotation.y = z.yaw;
    const st = this.state;
    // saliendo del pozo: crece desde abajo
    const grow = st === 'appear' ? Math.min(1, this.t / 0.7) : 1;
    r.scale.setScalar(Math.max(0.05, grow));
    if (st === 'dead') {
      // se cae de espaldas y queda tieso
      const k = Math.min(1, this.t / 0.45);
      this.body.rotation.x = -1.45 * k;
      this.body.position.y = 0.12 * k;
      this.armL.rotation.x = this.armR.rotation.x = -2.4 * k;
      this.legL.rotation.x = this.legR.rotation.x = 0.4 * k;
      return;
    }
    this.body.rotation.x = 0;
    const moving = st === 'toItem' || st === 'flee';
    this.phase += dt * (moving ? 13 : 3);
    const sw = moving ? Math.sin(this.phase) : 0;
    this.legL.rotation.x = sw * 0.8;
    this.legR.rotation.x = -sw * 0.8;
    this.body.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.06 : 0;
    this.body.rotation.z = sw * 0.08;
    if (this.carry) {
      // brazos arriba sosteniendo el botín
      this.armL.rotation.x = this.armR.rotation.x = -2.9;
      this.armL.rotation.z = -0.35;
      this.armR.rotation.z = 0.35;
      this.carry.mesh.rotation.y += dt * 3;
    } else {
      this.armL.rotation.x = -sw * 0.9 - (moving ? 0.3 : 0);
      this.armR.rotation.x = sw * 0.9 - (moving ? 0.3 : 0);
      this.armL.rotation.z = this.armR.rotation.z = 0;
    }
    this.head.rotation.y = Math.sin(this.phase * 0.5) * 0.3;
  }

  // ---------------- en línea ----------------
  // Lo que manda el anfitrión en cada foto (null = no hay Pombero).
  snapshot() {
    const z = this.z;
    if (!z.active) return null;
    return { x: z.pos.x, z: z.pos.z, yaw: z.yaw, st: STATES.indexOf(this.state) + 1 };
  }

  applyRemote(s) {
    const z = this.z;
    if (!s) {
      if (z.active) this.hide();
      return;
    }
    const st = STATES[s.st - 1] || 'toItem';
    if (!z.active) {
      z.active = true;
      z.pos.set(s.x, 0, s.z);
      z.yaw = s.yaw;
      this.setState(st);
      if (st === 'appear') this.appearFx();
    } else if (st !== this.state) this.setState(st);
    z.dead = st === 'dead';
    this.remote = s;
  }

  // El invitado lo acerca a la última posición que llegó.
  follow(dt) {
    const s = this.remote;
    if (!s) return;
    const z = this.z;
    const k = Math.min(1, dt * 12);
    z.pos.x += (s.x - z.pos.x) * k;
    z.pos.z += (s.z - z.pos.z) * k;
    let d = s.yaw - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    z.yaw += d * k;
  }

  // Eventos del anfitrión: agarró un potenciador, lo soltó o se fue.
  applyEvent(m) {
    const g = this.g;
    if (m.a === 'grab') {
      const i = g.powerups.items.findIndex((x) => x.id === m.id);
      let mesh;
      if (i >= 0) {
        mesh = g.powerups.items[i].mesh;
        g.powerups.items.splice(i, 1);
      } else mesh = g.powerups.model(m.type);
      this.hold.add(mesh);
      mesh.position.set(0, 0, 0);
      this.carry = { id: m.id, type: m.type, mesh };
      g.audio.laugh?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    } else if (m.a === 'drop') {
      this.dropCarry();
      g.audio.yelp?.(tmpV.set(this.z.pos.x, 1, this.z.pos.z));
    } else if (m.a === 'gone') {
      this.appearFx();
      this.hide();
    }
  }

  dispose() {
    this.dropCarry();
    this.rig.removeFromParent();
  }
}

function sphereHit(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  if (t < 0 || t > maxT) return null;
  return t;
}
