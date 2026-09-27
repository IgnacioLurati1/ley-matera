import * as THREE from 'three';
import { POWERUP, POINTS } from '../config/rules';
import { getMats } from '../weapons/viewmodels';

// Power-ups de BO1: munición máxima (un termo), muerte instantánea (calavera),
// puntos dobles, kaboom, carpintero y liquidación (caja a $10).

const TYPES = ['maxammo', 'insta', 'double', 'nuke', 'carpenter', 'firesale'];
const NAMES = {
  maxammo: '¡Munición máxima!',
  insta: '¡Muerte instantánea!',
  double: '¡Puntos dobles!',
  nuke: '¡Kaboom!',
  carpenter: '¡Carpintero!',
  firesale: '¡Liquidación!',
};

export default class Powerups {
  constructor(game) {
    this.g = game;
    this.items = [];
    this.active = { insta: 0, double: 0, firesale: 0 };
    this.bag = [];
    this.nextScore = POWERUP.firstThreshold;
    this.increment = POWERUP.firstThreshold;
    this.dropsThisRound = 0;
    this.glowTex = game.textures.dot;
  }

  newRound() {
    this.dropsThisRound = 0;
  }

  pick() {
    if (!this.bag.length) {
      this.bag = [...TYPES];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  onKill(pos) {
    const g = this.g;
    if (this.dropsThisRound >= POWERUP.maxPerRound) return;
    if (g.stats.earned >= this.nextScore) {
      this.increment *= POWERUP.growth;
      this.nextScore = g.stats.earned + this.increment;
      this.drop(pos);
    } else if (Math.random() < POWERUP.randomChance) this.drop(pos);
  }

  drop(pos, force = false, forcedType = null) {
    const g = this.g;
    if (!force) this.dropsThisRound++;
    // no dejarlo afuera del mapa (zombies que mueren en la ventana)
    const zone = g.world.zoneAt(pos.x, pos.z);
    const p = pos.clone();
    if (!zone) {
      p.set(g.player.pos.x + (Math.random() - 0.5) * 2, g.player.pos.y, g.player.pos.z + (Math.random() - 0.5) * 2);
    }
    // en el piso donde cayó (abajo o en el altillo)
    p.y = g.world.floorAt(p.x, p.z, p.y || 0);
    const type = forcedType || this.pick();
    const mesh = this.model(type);
    mesh.position.set(p.x, p.y + 1, p.z);
    g.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    glow.scale.setScalar(1.6);
    mesh.add(glow);
    const id = (this.nextId = (this.nextId || 0) + 1);
    const item = { id, type, mesh, t: 0, pos: p };
    this.items.push(item);
    g.audio.powerupSpawn(mesh.position);
    g.net?.event('pup', { id, type, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    // muy de vez en cuando, el Pombero viene a llevárselo
    g.pombero?.onDrop(item);
  }

  // Power-up que aparece o se levanta en otra compu.
  applyRemote(m) {
    if (m.take) {
      const i = this.items.findIndex((x) => x.id === m.id);
      if (i >= 0) this.remove(i);
      this.applyEffect(m.type, false);
      return;
    }
    const g = this.g;
    const mesh = this.model(m.type);
    mesh.position.set(m.x, (m.y || 0) + 1, m.z);
    g.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    glow.scale.setScalar(1.6);
    mesh.add(glow);
    this.items.push({ id: m.id, type: m.type, mesh, t: 0, pos: new THREE.Vector3(m.x, m.y || 0, m.z) });
    g.audio.powerupSpawn(mesh.position);
  }

  model(type) {
    const M = getMats(this.g.textures);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 });
    const g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    switch (type) {
      case 'maxammo':
        add(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16), M.termo);
        add(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 16), M.steel, 0, 0.29);
        add(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 10), M.steel, 0, 0.36, 0.04, 0.4);
        add(new THREE.TorusGeometry(0.12, 0.02, 6, 14, Math.PI), M.dark, -0.12, 0.05, 0, 0, Math.PI / 2, 0);
        break;
      case 'insta': {
        add(new THREE.SphereGeometry(0.2, 16, 12), gold, 0, 0.05);
        add(new THREE.BoxGeometry(0.2, 0.12, 0.16), gold, 0, -0.15, 0.03);
        const eye = new THREE.MeshBasicMaterial({ color: 0x000000 });
        add(new THREE.SphereGeometry(0.055, 8, 6), eye, -0.075, 0.07, 0.16);
        add(new THREE.SphereGeometry(0.055, 8, 6), eye, 0.075, 0.07, 0.16);
        break;
      }
      case 'double': {
        for (const x of [-0.14, 0.14]) add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), gold, x, 0, 0, Math.PI / 2, 0, 0);
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        ctx.font = 'bold 90px Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#5a3a00';
        ctx.fillText('x2', 64, 68);
        const tex = new THREE.CanvasTexture(c);
        const face = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        for (const x of [-0.14, 0.14]) add(new THREE.PlaneGeometry(0.28, 0.28), face, x, 0, 0.03);
        break;
      }
      case 'nuke':
        add(new THREE.SphereGeometry(0.22, 16, 12), M.dark);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), M.steel, 0, 0.23);
        add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), M.teabag, 0.03, 0.32, 0, 0, 0, -0.4);
        break;
      case 'carpenter':
        add(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 8), M.wood, 0, 0, 0, 0, 0, 0.5);
        add(new THREE.BoxGeometry(0.25, 0.08, 0.08), M.steel, -0.11, 0.2, 0, 0, 0, 0.5);
        break;
      case 'firesale': {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 80;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#f2e6c8';
        ctx.fillRect(0, 0, 128, 80);
        ctx.fillStyle = '#b3151d';
        ctx.font = 'bold 50px Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$10', 64, 58);
        const tag = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.8, side: THREE.DoubleSide });
        add(new THREE.BoxGeometry(0.4, 0.25, 0.02), tag);
        add(new THREE.TorusGeometry(0.03, 0.006, 6, 12), M.steel, -0.17, 0.08, 0);
        break;
      }
      default:
        break;
    }
    return g;
  }

  update(dt) {
    const g = this.g;
    for (const k of Object.keys(this.active)) {
      if (this.active[k] > 0) {
        this.active[k] = Math.max(0, this.active[k] - dt);
      }
    }
    g.hud.setPowerups(this.active);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 1.8;
      it.mesh.position.y = it.pos.y + 1 + Math.sin(it.t * 2.5) * 0.08;
      const left = POWERUP.lifetime - it.t;
      it.mesh.visible = left > 6 || Math.floor(it.t * (left < 3 ? 8 : 4)) % 2 === 0;
      if (Math.random() < 0.2) g.fx.sparkle(it.mesh.position, [0.4, 1, 0.5], 1, 0.6);
      const dx = g.player.pos.x - it.mesh.position.x;
      const dz = g.player.pos.z - it.mesh.position.z;
      if (dx * dx + dz * dz < 1.44 && g.player.alive && Math.abs(g.player.pos.y - it.pos.y) < 1.5) {
        if (g.net?.guest) {
          // el anfitrión confirma: el efecto es para todos
          g.net.net.send({ t: 'pupget', id: it.id });
          this.remove(i);
          continue;
        }
        this.apply(it.type, it.id);
        this.remove(i);
        continue;
      }
      if (left <= 0) this.remove(i);
    }
  }

  remove(i) {
    const it = this.items[i];
    it.mesh.removeFromParent();
    this.items.splice(i, 1);
  }

  apply(type, id) {
    this.g.net?.event('pup', { id, type, take: true });
    this.applyEffect(type, true);
  }

  // El efecto en sí (los globales los comparte todo el mundo).
  applyEffect(type, local) {
    const g = this.g;
    g.audio.powerupGrab();
    if (local) g.audio.announce(NAMES[type]);
    g.hud.toast(NAMES[type]);
    switch (type) {
      case 'maxammo':
        g.weapons.maxAmmo();
        break;
      case 'insta':
        this.active.insta = POWERUP.duration;
        break;
      case 'double':
        this.active.double = POWERUP.duration;
        break;
      case 'nuke':
        if (!g.net?.guest) g.zombies.nuke();
        g.post.flash(1);
        g.later(0.3, () => g.addPoints(POINTS.nuke, null, true));
        break;
      case 'carpenter':
        if (!g.net?.guest) g.barriers.repairAll();
        g.later(1.5, () => g.addPoints(POINTS.carpenter, null, true));
        break;
      case 'firesale':
        this.active.firesale = POWERUP.duration;
        break;
      default:
        break;
    }
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this.remove(i);
  }
}
