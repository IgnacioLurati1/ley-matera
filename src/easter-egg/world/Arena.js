import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';

// La Salamanca: la arena del final, lejos del molino. El Abuelo te manda acá
// cuando le llevás el sombrero del Capataz; adentro espera el Mandinga.
// Tiene su propio ritmo: bolas de fuego, lluvia de fuego marcada en el piso,
// oleadas de peones (mientras quedan peones, el diablo está protegido por el
// fuego) y munición que cae cada tanto. Si lo vencés, termina la partida.

export const ARENA = { x: 115, z: 25, r: 15 };
const BOSS_HP = 180000;
const WARDS = [0.75, 0.5, 0.25]; // se protege y llama peones
const WARD_MAX = 30; // si no terminan con los peones, igual se le cae el fuego
const RAIN_R = 1.8;
const RAIN_DELAY = 1.4;
const RAIN_DMG = 60;
const FIRE_SPEED = 19;

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
    this.rain = [];
    this.ward = false;
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
    // el escudo de fuego del Mandinga y los círculos de la lluvia de fuego
    this.wardMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.wardMesh.visible = false;
    this.g.scene.add(this.wardMesh);
    this.rainGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this.rainFill = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
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
    // cada uno en su lugar (en línea no aparecen todos encimados)
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    const slot = ids.indexOf(g.net ? g.net.id : 0);
    g.player.pos.set(ARENA.x + (slot - (ids.length - 1) / 2) * 1.6, 0, ARENA.z + ARENA.r - 3);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = 0;
    g.player.pitch = 0;
    // al final van todos: el que estaba caído o mirando vuelve a pelear
    if (!g.player.alive || g.player.downed) {
      g.player.revive();
      g.player.eye = 1.62;
      g.hud.setSpectate(null);
      g.hud.setDowned(null);
    }
    g.player.health = g.player.maxHealth;
    g.weapons.maxAmmo();
    g.hud.location(this.name, 'Donde el diablo enseña a payar');
    this.summoned = [];
    this.ammoT = 25;
    this.fireT = 5;
    this.rainT = 8;
    this.setWard(false);
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
    this.setWard(false);
    for (const c of this.rain) c.group.removeFromParent();
    this.rain = [];
    g.hud.setBossBar(null);
    for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    for (const f of this.fireballs) f.mesh.removeFromParent();
    this.fireballs = [];
    g.post.flash(1.2);
    g.later(4, () => g.win());
  }

  // El anfitrión elige a quién (a cualquiera de los que están en pie) y avisa:
  // todos la ven volar y cada uno se fija si le pega a él.
  // Posiciones de los que están en pie (el local y los de la red).
  standing() {
    const g = this.g;
    const list = [];
    if (g.player.canBeHit()) list.push(g.player.pos);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r.pos);
    return list;
  }

  // spread: cuántas en abanico (1 = una sola, derecho al jugador).
  fireball(from, spread = 1) {
    const g = this.g;
    const targets = this.standing();
    if (!targets.length) return;
    const tp = targets[Math.floor(Math.random() * targets.length)];
    const aim = new THREE.Vector3(tp.x, tp.y + 1.5, tp.z).sub(from).normalize();
    for (let i = 0; i < spread; i++) {
      const vel = aim.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (i - (spread - 1) / 2) * 0.22).multiplyScalar(FIRE_SPEED);
      this.spawnFireball(from, vel);
      g.net?.event('fireball', { x: +from.x.toFixed(2), y: +from.y.toFixed(2), z: +from.z.toFixed(2), vx: +vel.x.toFixed(2), vy: +vel.y.toFixed(2), vz: +vel.z.toFixed(2) });
    }
  }

  // ---------------- lluvia de fuego ----------------
  // Un círculo debajo de cada uno y algunos sueltos; explotan al rato.
  fireRain() {
    const g = this.g;
    const pts = [];
    for (const p of this.standing()) pts.push([p.x + (Math.random() - 0.5) * 1.2, p.z + (Math.random() - 0.5) * 1.2]);
    const extra = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * (ARENA.r - 2);
      pts.push([ARENA.x + Math.cos(a) * d, ARENA.z + Math.sin(a) * d]);
    }
    const flat = pts.flatMap(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
    this.spawnRain(flat);
    g.net?.event('frain', { p: flat });
  }

  spawnRain(flat) {
    const g = this.g;
    for (let i = 0; i < flat.length; i += 2) {
      const group = new THREE.Group();
      group.position.set(flat[i], 0.05, flat[i + 1]);
      group.scale.setScalar(RAIN_R);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff3a0a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const ring = new THREE.Mesh(this.rainGeo, mat);
      const fill = new THREE.Mesh(this.rainFill, mat.clone());
      fill.scale.setScalar(0.01);
      group.add(ring, fill);
      g.scene.add(group);
      this.rain.push({ group, ring, fill, t: 0 });
    }
    if (!this.rainSaid) g.hud.subtitle('¡Llueve fuego! Salí de los círculos.', 2.5, 'boss');
    this.rainSaid = true;
    g.audio.growl(tmpV.set(ARENA.x, 3, ARENA.z), 'boss');
  }

  updateRain(dt) {
    const g = this.g;
    const pulse = 0.7 + Math.sin(g.time * 20) * 0.3;
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const c = this.rain[i];
      c.t += dt;
      const k = Math.min(1, c.t / RAIN_DELAY);
      c.ring.material.opacity = (0.35 + k * 0.5) * pulse;
      c.fill.material.opacity = 0.25 * k;
      c.fill.scale.setScalar(Math.max(0.01, k));
      if (c.t < RAIN_DELAY) continue;
      // estalla: cada uno se fija si lo agarró a él
      const p = c.group.position;
      g.fx.explosion(tmpV.set(p.x, 0.4, p.z), RAIN_R, [1, 0.4, 0.1]);
      g.fx.fire(tmpV.set(p.x, 0.3, p.z), RAIN_R * 0.6, 8);
      g.audio.explosion(p, 0.35);
      const pp = g.player.pos;
      if (g.player.canBeHit() && Math.hypot(pp.x - p.x, pp.z - p.z) < RAIN_R) g.player.damage(RAIN_DMG, p);
      c.group.removeFromParent();
      c.ring.material.dispose();
      c.fill.material.dispose();
      this.rain.splice(i, 1);
    }
  }

  // ---------------- el escudo de fuego ----------------
  setWard(on) {
    const g = this.g;
    if (this.ward === on) return;
    this.ward = on;
    this.wardT = 0;
    if (!g.net?.guest) g.net?.event('ward', { on: on ? 1 : 0 });
    if (on) g.hud.subtitle('El Mandinga se cubre de fuego: ¡liquidá a los peones para bajarle el escudo!', 4, 'boss');
    else if (this.phase === 'fight') {
      g.hud.subtitle('¡Se le cayó el fuego! Ahora, dale.', 2.5, 'boss');
      g.audio.chain(tmpV.set(ARENA.x, 2, ARENA.z));
    }
  }

  // El escudo y la lluvia se ven igual en todas las compus.
  updateShared(dt) {
    const g = this.g;
    const b = g.zombies.boss;
    const show = this.ward && b && !b.dead;
    this.wardMesh.visible = !!show;
    if (show) {
      const s = b.scale || 2;
      this.wardMesh.position.set(b.pos.x, 0.95 * s, b.pos.z);
      this.wardMesh.scale.set(0.8 * s, 1.05 * s, 0.8 * s);
      this.wardMesh.material.opacity = 0.14 + Math.sin(g.time * 9) * 0.05;
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2;
        g.fx.fire(tmpV.set(b.pos.x + Math.cos(a) * 1.2, 0.3 + Math.random() * 3, b.pos.z + Math.sin(a) * 1.2), 0.3, 1);
      }
    }
    this.updateRain(dt);
    this.updateFireballs(dt);
  }

  spawnFireball(from, vel) {
    const g = this.g;
    this.fireMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(3), toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), this.fireMat);
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.fireballs.push({ mesh, vel: vel.clone(), t: 0, from: from.clone() });
    g.audio.launcher(from);
  }

  // Las bolas de fuego vuelan igual en todas las compus; cada uno se cuida la suya.
  updateFireballs(dt) {
    const g = this.g;
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t += dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      if (Math.random() < 0.8) g.fx.fire(f.mesh.position, 0.2, 1);
      const hit = g.player.canBeHit() && f.mesh.position.distanceTo(g.camera.position) < 0.9;
      if (hit || f.t > 4 || f.mesh.position.y < 0.1) {
        if (hit) g.player.damage(45, f.from);
        g.fx.explosion(f.mesh.position, 1.2, [1, 0.45, 0.15]);
        g.audio.explosion(f.mesh.position, 0.5);
        f.mesh.removeFromParent();
        this.fireballs.splice(i, 1);
      }
    }
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
      this.updateShared(dt);
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
      g.hud.setBossBar(this.ward ? 'El Mandinga (protegido)' : 'El Mandinga', k);
      // al 75, 50 y 25%: se cubre de fuego y llama peones; el fuego se cae
      // cuando no queda ningún peón (o al rato, para que no se trabe)
      WARDS.forEach((th, i) => {
        if (k < th && !this.summoned.includes(th)) {
          this.summoned.push(th);
          const n = 6 + i * 2 + Math.min(4, (g.rounds?.players || 1) - 1) * 2;
          this.wave(n);
          this.waveUntil = this.t + n * 0.4 + 1;
          this.setWard(true);
        }
      });
      if (this.ward) {
        this.wardT += dt;
        const left = g.zombies.pool.some((z) => z.active && !z.dead);
        if ((!left && this.t > this.waveUntil) || this.wardT > WARD_MAX) this.setWard(false);
      }
      // cada vez más rápido
      b.speed = k < 0.25 ? 4.9 : k < 0.5 ? 4.3 : 3.4;
      // bolas de fuego a distancia: de a dos en la segunda mitad, en abanico al final
      this.fireT -= dt;
      if (this.fireT <= 0 && !b.dead && b.state === 'chase') {
        this.fireT = k < 0.25 ? 1.9 : k < 0.5 ? 2.4 : 3.6;
        const n = k < 0.25 ? 3 : 1;
        const hand = tmpV.set(b.pos.x + Math.sin(b.yaw) * 0.8, 2.6, b.pos.z + Math.cos(b.yaw) * 0.8).clone();
        this.fireball(hand, n);
        if (k < 0.5) g.later(0.35, () => !b.dead && this.fireball(hand, n));
      }
      // lluvia de fuego cuando le quedan dos tercios
      if (k < 0.66) {
        this.rainT -= dt;
        if (this.rainT <= 0 && !b.dead) {
          this.rainT = k < 0.33 ? 6 : 9;
          this.fireRain();
        }
      }
      // munición del más allá
      this.ammoT -= dt;
      if (this.ammoT <= 0) {
        this.ammoT = 40;
        g.powerups.bag.push('maxammo');
        g.powerups.drop(new THREE.Vector3(ARENA.x + (Math.random() - 0.5) * 12, 0, ARENA.z + (Math.random() - 0.5) * 12), true);
      }
    }
    this.updateShared(dt);
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
    for (const c of this.rain) c.group.removeFromParent();
    this.wardMesh.removeFromParent();
  }
}
