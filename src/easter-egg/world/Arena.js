import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';

// La Salamanca: la arena del final, lejos del molino. El Abuelo te manda acá
// cuando le llevás el sombrero del Capataz; adentro espera el Mandinga.
// Tiene su propio ritmo: bolas de fuego, oleadas de peones muertos y
// munición que cae cada tanto. Si lo vencés, termina la partida.

export const ARENA = { x: 115, z: 25, r: 15 };
const BOSS_HP = 120000;

const tmpV = new THREE.Vector3();

export default class Arena {
  constructor(game) {
    this.g = game;
    this.name = 'La Salamanca';
    this.active = false;
    this.phase = 'off';
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.fireballs = [];
    this.build();
  }

  build() {
    const M = this.g.world.M;
    const { x, z, r } = ARENA;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r + 1, 48), M.dirtDark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.01, z);
    floor.receiveShadow = true;
    this.root.add(floor);
    // paredes de piedra de la cueva
    const wallGeo = new THREE.CylinderGeometry(r + 1.2, r + 2.5, 9, 40, 3, true);
    const pos = wallGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + Math.sin(a * 7 + pos.getY(i)) * 0.05 + Math.sin(a * 17) * 0.03;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    wallGeo.computeVertexNormals();
    const rock = new THREE.MeshStandardMaterial({ map: this.g.textures.concrete, bumpMap: this.g.textures.concrete, bumpScale: 3, color: 0x6a5048, roughness: 0.95, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(wallGeo, rock);
    wall.position.set(x, 4.5, z);
    this.root.add(wall);
    // braseros en círculo
    this.braziers = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = x + Math.cos(a) * (r - 2.5);
      const bz = z + Math.sin(a) * (r - 2.5);
      this.root.add(mesh(cylGeo(0.3, 0.4, 1.0, 10), M.stone, bx, 0.5, bz));
      this.root.add(mesh(cylGeo(0.5, 0.3, 0.3, 12), M.iron, bx, 1.15, bz));
      this.root.add(mesh(cylGeo(0.42, 0.42, 0.05, 12), M.fireGlow, bx, 1.29, bz));
      this.braziers.push(new THREE.Vector3(bx, 1.3, bz));
    }
    // cruces de gauchos y huesos
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.4;
      const d = r - 1.2 - (i % 2) * 0.6;
      const cx = x + Math.cos(a) * d;
      const cz = z + Math.sin(a) * d;
      this.root.add(mesh(boxGeo(0.08, 1.2, 0.08), M.woodDark, cx, 0.6, cz, 0, a, (i % 3 - 1) * 0.12));
      this.root.add(mesh(boxGeo(0.5, 0.08, 0.08), M.woodDark, cx, 0.9, cz, 0, a + Math.PI / 2, 0));
    }
    // luces del fuego (siempre existen; se encienden al entrar)
    this.lights = [0, 1].map((k) => {
      const l = new THREE.PointLight(0xff5a1a, 0, 30, 1.6);
      l.position.set(x + (k ? 5 : -5), 4, z);
      this.g.scene.add(l);
      return l;
    });
    this.root.updateMatrixWorld(true);
  }

  // Llegada: se limpia el molino y te trae acá.
  start() {
    const g = this.g;
    const guest = !!g.net?.guest;
    if (!this.active && !guest) g.net?.event('arena');
    this.active = true;
    this.phase = guest ? 'guest' : 'intro';
    this.t = 0;
    this.root.visible = true;
    for (const l of this.lights) l.intensity = 40;
    if (!guest) {
      g.rounds.state = 'arena';
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      if (g.zombies.boss) g.zombies.removeBoss();
    }
    g.lures.length = 0;
    g.post.flash(1.6);
    g.audio.bossArrive();
    g.weather.set('blood', false);
    g.player.pos.set(ARENA.x, 0, ARENA.z + ARENA.r - 3);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = 0;
    g.player.pitch = 0;
    if (g.player.downed) g.player.downed = false;
    g.player.health = g.player.maxHealth;
    g.weapons.maxAmmo();
    g.hud.location(this.name, 'Donde el diablo enseña a payar');
    this.summoned = [];
    this.ammoT = 20;
    this.fireT = 5;
    if (!guest) g.later(3.2, () => this.spawnBoss());
  }

  spawnBoss() {
    const g = this.g;
    const boss = g.zombies.spawnBoss(99, { at: new THREE.Vector3(ARENA.x, 0, ARENA.z - 3), mandinga: true, hp: BOSS_HP });
    this.boss = boss;
    this.phase = 'fight';
    g.fx.lightning(new THREE.Vector3(ARENA.x, 20, ARENA.z - 3), new THREE.Vector3(ARENA.x, 0.2, ARENA.z - 3), 0xff8a5a, 0.6);
    g.later(1.2, () => g.say('anunciador', '¿Así que el viejo te mandó a vos? Vení nomás, que en la Salamanca se paga con el alma.', 'boss'));
  }

  // El jefe cayó: se termina todo.
  onBossDead() {
    const g = this.g;
    this.phase = 'won';
    g.hud.setBossBar(null);
    for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    for (const f of this.fireballs) f.mesh.removeFromParent();
    this.fireballs = [];
    g.post.flash(1.2);
    g.later(4, () => g.win());
  }

  fireball(from) {
    const g = this.g;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(3), toneMapped: false }));
    mesh.position.copy(from);
    g.scene.add(mesh);
    const target = g.camera.position.clone();
    const vel = target.sub(from).normalize().multiplyScalar(15);
    this.fireballs.push({ mesh, vel, t: 0, from: from.clone() });
    g.audio.launcher(from);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    if (g.net?.guest) {
      // el invitado solo se queda adentro del círculo y ve el fuego
      const dx = g.player.pos.x - ARENA.x;
      const dz = g.player.pos.z - ARENA.z;
      const d = Math.hypot(dx, dz);
      if (d > ARENA.r - 0.5) {
        g.player.pos.x = ARENA.x + (dx / d) * (ARENA.r - 0.5);
        g.player.pos.z = ARENA.z + (dz / d) * (ARENA.r - 0.5);
      }
      for (const b of this.braziers) if (Math.random() < 0.5) g.fx.fire(b, 0.5, 1);
      for (const l of this.lights) l.intensity = 34 + Math.sin(this.t * 11 + l.position.x) * 6;
      return;
    }
    // nadie sale del círculo
    const clamp = (p, rad) => {
      const dx = p.x - ARENA.x;
      const dz = p.z - ARENA.z;
      const d = Math.hypot(dx, dz);
      const max = ARENA.r - rad;
      if (d > max) {
        p.x = ARENA.x + (dx / d) * max;
        p.z = ARENA.z + (dz / d) * max;
      }
    };
    clamp(g.player.pos, 0.5);
    for (const z of g.zombies.pool) if (z.active) clamp(z.pos, 0.4);
    if (g.zombies.boss) clamp(g.zombies.boss.pos, 1);
    for (const b of this.braziers) if (Math.random() < 0.5) g.fx.fire(b, 0.5, 1);
    for (const l of this.lights) l.intensity = 34 + Math.sin(this.t * 11 + l.position.x) * 6 + Math.random() * 4;

    if (this.phase === 'fight' && this.boss) {
      const b = this.boss;
      const k = b.hp / b.maxHp;
      g.hud.setBossBar('El Mandinga', k);
      // oleadas de peones al 70% y al 35%
      for (const th of [0.7, 0.35]) {
        if (k < th && !this.summoned.includes(th)) {
          this.summoned.push(th);
          this.wave(th < 0.5 ? 8 : 6);
        }
      }
      // en la segunda mitad se enoja
      b.speed = k < 0.5 ? 4.3 : 3.2;
      // bolas de fuego a distancia
      this.fireT -= dt;
      const d = Math.hypot(g.player.pos.x - b.pos.x, g.player.pos.z - b.pos.z);
      if (this.fireT <= 0 && d > 4 && !b.dead && b.state === 'chase') {
        this.fireT = k < 0.5 ? 2.6 : 4.2;
        const hand = tmpV.set(b.pos.x + Math.sin(b.yaw) * 0.8, 2.6, b.pos.z + Math.cos(b.yaw) * 0.8).clone();
        this.fireball(hand);
        if (k < 0.5) g.later(0.35, () => !b.dead && this.fireball(hand));
      }
      // munición del más allá
      this.ammoT -= dt;
      if (this.ammoT <= 0) {
        this.ammoT = 28;
        g.powerups.bag.push('maxammo');
        g.powerups.drop(new THREE.Vector3(ARENA.x + (Math.random() - 0.5) * 12, 0, ARENA.z + (Math.random() - 0.5) * 12), true);
      }
    }
    // bolas de fuego en vuelo
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      if (Math.random() < 0.8) g.fx.fire(f.mesh.position, 0.2, 1);
      const hit = f.mesh.position.distanceTo(g.camera.position) < 0.9;
      if (hit || f.t > 4 || f.mesh.position.y < 0.1) {
        if (hit) g.player.damage(45, f.from);
        g.fx.explosion(f.mesh.position, 1.2, [1, 0.45, 0.15]);
        g.audio.explosion(f.mesh.position, 0.5);
        f.mesh.removeFromParent();
        this.fireballs.splice(i, 1);
      }
    }
  }

  wave(n) {
    const g = this.g;
    g.hud.subtitle('El Mandinga llama a sus peones...', 3, 'boss');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const p = new THREE.Vector3(ARENA.x + Math.cos(a) * (ARENA.r - 4), 0, ARENA.z + Math.sin(a) * (ARENA.r - 4));
      g.later(i * 0.4, () => g.zombies.spawn(15, 3000, p));
    }
  }

  dispose() {
    for (const l of this.lights) l.removeFromParent();
    for (const f of this.fireballs) f.mesh.removeFromParent();
  }
}
