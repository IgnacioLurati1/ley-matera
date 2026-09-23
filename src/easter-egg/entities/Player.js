import * as THREE from 'three';
import { PLAYER } from '../config/rules';
import { PLAYER_START } from '../config/map';

const specTarget = new THREE.Vector3();
const specFwd = new THREE.Vector3();
const specBack = new THREE.Vector3();

// Jugador: movimiento con colisiones, cámara, vida con regeneración, perks,
// caída con Quick Revive (solo) y muerte.

export default class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.perks = new Set();
    this.reset();
  }

  reset() {
    const s = PLAYER_START;
    this.pos.set(s.x, 0, s.z);
    this.vel.set(0, 0, 0);
    this.yaw = s.yaw;
    this.pitch = 0;
    this.eye = PLAYER.eye;
    this.health = PLAYER.health;
    this.maxHealth = PLAYER.health;
    this.lastHit = -99;
    this.alive = true;
    this.downed = false;
    this.downT = 0;
    this.reviveUses = 0;
    this.perks.clear();
    this.stamina = PLAYER.stamina;
    this.sprinting = false;
    this.crouching = false;
    this.onGround = true;
    this.moving = false;
    this.bobPhase = 0;
    this.stepDist = 0;
    this.recoil = { p: 0, y: 0 };
    this.landKick = 0;
    this.lungeT = 0;
    this.lungeDir = new THREE.Vector3();
    this.hurtT = 0;
    this.shield = null;
  }

  get reloadMult() {
    return this.perks.has('speed') ? 0.5 : 1;
  }

  canBeHit() {
    return this.alive && !this.downed;
  }

  addRecoil(p, y) {
    this.recoil.p += p;
    this.recoil.y += y;
  }

  lunge(target, dist) {
    this.lungeDir.set(target.x - this.pos.x, 0, target.z - this.pos.z).normalize();
    this.lungeT = 0.12;
    this.lungeSpeed = dist / 0.12;
  }

  givePerk(id) {
    this.perks.add(id);
    if (id === 'jugg') {
      this.maxHealth = PLAYER.juggHealth;
      this.health = this.maxHealth;
    }
    this.g.hud.setPerks([...this.perks]);
  }

  loseAllPerks() {
    const hadMule = this.perks.has('mule');
    this.perks.clear();
    this.maxHealth = PLAYER.health;
    this.health = Math.min(this.health, this.maxHealth);
    this.g.hud.setPerks([]);
    if (hadMule) this.g.weapons.trimSlots();
  }

  damage(amount, from, explosion = false) {
    const g = this.g;
    if (!this.canBeHit() || g.godMode) return;
    // el escudo de la espalda frena lo que viene de atrás
    if (this.shield && from && !explosion) {
      const dx = from.x - this.pos.x;
      const dz = from.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / d < -0.2) {
        g.activities?.shieldHit(amount, from);
        return;
      }
    }
    this.health -= amount;
    this.lastHit = g.time;
    this.hurtT = 1;
    g.audio.hurt();
    g.fx.addShake(explosion ? 0.5 : 0.22);
    // de dónde vino el golpe (para el indicador rojo)
    if (from) {
      const a = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
      g.hud.damageFrom(a - this.yaw);
    }
    g.hud.hurt(1 - this.health / this.maxHealth);
    if (this.health <= 0) this.goDown();
  }

  // Te levanta un compañero (o Rosamorte).
  revive() {
    const g = this.g;
    this.downed = false;
    this.alive = true;
    this.health = this.maxHealth;
    this.bleed = 0;
    g.hud.subtitle('¡De vuelta en pie!', 2);
    g.onPlayerRevived();
  }

  // En línea: si caés y no te levantan, quedás mirando hasta la próxima ronda.
  spectate() {
    this.alive = false;
    this.downed = false;
    this.eye = 3.2;
    this.g.hud.hurt(0);
    // el Mate del Chiquitijuein se pierde: se puede volver a armar
    if (this.g.weapons.has('luzmala')) {
      this.g.weapons.drop('luzmala');
      this.g.net?.net.send({ t: 'ev', e: 'sub', x: 'Se perdió el Mate del Chiquitijuein: se puede volver a armar en el altillo.', d: 3.5 });
    }
    this.g.hud.subtitle('Caíste. Volvés en la próxima ronda.', 5);
    this.g.net?.net.send({ t: 'ev', e: 'dead', id: this.g.net.id });
  }

  respawn() {
    const g = this.g;
    g.hud.setSpectate(null);
    this.alive = true;
    this.downed = false;
    this.health = this.maxHealth;
    this.eye = PLAYER.eye;
    this.perks.clear();
    this.maxHealth = PLAYER.health;
    this.health = PLAYER.health;
    g.hud.setPerks([]);
    g.weapons.reset();
    const near = g.net?.nearest(this.pos.x, this.pos.z);
    if (near && near !== this) this.pos.set(near.pos.x + (Math.random() - 0.5), 0, near.pos.z + (Math.random() - 0.5));
    g.hud.subtitle('Volviste a la partida.', 3);
  }

  goDown() {
    const g = this.g;
    this.health = 0;
    // en línea quedás caído esperando que te levanten; si caen todos, el
    // anfitrión da por terminada la partida
    if (g.net?.remote.size && !this.downed) {
      this.downed = true;
      this.downT = 0;
      this.bleed = 30;
      this.loseAllPerks();
      g.hud.subtitle('Caíste. Esperá que te levanten.', 4);
      g.audio.sting();
      g.net.net.send({ t: 'down', id: g.net.id });
      g.net.credit(g.net.id, 'downs');
      g.onPlayerDowned();
      return;
    }
    if (this.perks.has('revive') && this.reviveUses < 3) {
      // en solitario, Quick Revive te levanta solo
      this.reviveUses++;
      this.downed = true;
      this.downT = 0;
      this.loseAllPerks();
      g.hud.subtitle('Caíste... Rosamorte te está levantando.', 3);
      g.audio.sting();
      g.onPlayerDowned();
      return;
    }
    this.alive = false;
    g.gameOver();
  }

  update(dt, input) {
    const g = this.g;
    const cam = g.camera;
    // mirar
    const sens = 0.0022 * input.sensitivity * (g.weapons.ads ? g.weapons.stats?.scope ? 0.35 : 0.65 : 1);
    this.yaw -= input.mouse.dx * sens;
    this.pitch -= input.mouse.dy * sens * (input.invertY ? -1 : 1);
    // retroceso: sube la mira y vuelve sola
    const rp = Math.min(this.recoil.p, 0.2);
    this.pitch += rp * Math.min(1, dt * 20);
    this.yaw += this.recoil.y * Math.min(1, dt * 20);
    this.recoil.p -= rp * Math.min(1, dt * 20);
    this.recoil.y -= this.recoil.y * Math.min(1, dt * 20);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    if (!this.alive) {
      this.spectateCam(dt, cam);
      return;
    }

    if (this.downed && this.bleed > 0) {
      // caído en cooperativo: te desangrás hasta que te levanten
      this.bleed -= dt;
      this.eye += (0.55 - this.eye) * Math.min(1, dt * 5);
      g.hud.setDowned(this.bleed / 30, 'Caíste: que un compañero te levante', true);
      if (this.bleed <= 0) {
        this.downed = false;
        this.spectate();
        g.hud.setDowned(null);
      }
    } else if (this.downed) {
      this.downT += dt;
      this.eye += (0.55 - this.eye) * Math.min(1, dt * 5);
      if (this.downT > 10) {
        this.downed = false;
        this.health = this.maxHealth;
        g.hud.subtitle('¡De vuelta en pie!', 2);
        g.onPlayerRevived();
      }
    }

    // moverse
    const f = (input.key('KeyW') ? 1 : 0) - (input.key('KeyS') ? 1 : 0);
    const s = (input.key('KeyD') ? 1 : 0) - (input.key('KeyA') ? 1 : 0);
    this.crouching = input.key('KeyC') || this.downed;
    const wantSprint = input.key('ShiftLeft') && f > 0 && !this.crouching && !g.weapons.ads && !this.downed;
    if (wantSprint && this.stamina > 0) {
      this.sprinting = true;
      this.stamina -= dt;
    } else {
      this.sprinting = false;
      this.stamina = Math.min(PLAYER.stamina, this.stamina + dt * (wantSprint ? 0.3 : 1.2));
    }
    if (this.stamina <= 0 && !input.key('ShiftLeft')) this.stamina = 0.01;

    const moveMult = g.weapons.stats?.moveMult || 1;
    let speed = this.sprinting ? PLAYER.sprint : PLAYER.walk;
    if (this.crouching) speed = PLAYER.crouch;
    if (g.weapons.ads) speed = Math.min(speed, PLAYER.ads);
    if (this.downed) speed = 0.8;
    speed *= moveMult;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // adelante = -z de la cámara
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);

    // saltar y caer
    if (input.hit('Space') && this.onGround && !this.downed && !this.crouching) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
    }
    this.vel.y -= PLAYER.gravity * dt;
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      this.pos.addScaledVector(this.lungeDir, this.lungeSpeed * dt);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    // el piso de abajo, la escalera o el altillo
    const floor = g.world.floorAt(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt);
    // bajando la escalera se pega al escalón en vez de ir dando saltitos
    if (this.onGround && this.vel.y <= 0 && this.pos.y > floor && this.pos.y - floor < 0.45) this.pos.y = floor;
    if (this.pos.y <= floor) {
      if (!this.onGround && this.vel.y < -3) {
        g.audio.land();
        this.landKick = Math.min(1, -this.vel.y / 8);
      }
      this.pos.y = floor;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > floor + 0.05) this.onGround = false;
    this.landKick = Math.max(0, this.landKick - dt * 4);
    g.world.collide(this.pos, PLAYER.radius, this.pos.y + 0.05, this.pos.y + 1.7);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hs > 0.6;
    if (this.moving && this.onGround) {
      this.bobPhase += hs * dt * 1.9;
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 2.1 : 1.6;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        g.audio.footstep(g.world.surfaceAt(this.pos.x, this.pos.z), this.sprinting ? 1.3 : this.crouching ? 0.4 : 1);
      }
    }

    // vida: se regenera sola si no te pegan un rato
    if (!this.downed && g.time - this.lastHit > PLAYER.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + PLAYER.regenRate * dt);
      g.hud.hurt(1 - this.health / this.maxHealth);
    }
    this.hurtT = Math.max(0, this.hurtT - dt);

    const targetEye = this.downed ? 0.55 : this.crouching ? PLAYER.eyeCrouch : PLAYER.eye;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    this.updateCamera(cam);
  }

  // Muerto en línea: la cámara sigue desde atrás a un compañero (con el mouse
  // se gira alrededor) hasta volver en la próxima ronda.
  spectateCam(dt, cam) {
    const g = this.g;
    const mates = g.net ? [...g.net.remote.values()].filter((r) => !r.dead) : [];
    const r = mates.find((x) => !x.downed) || mates[0];
    g.hud.setSpectate(r ? r.name : null);
    if (!r) return;
    this.pitch = Math.max(-0.9, Math.min(0.6, this.pitch));
    specTarget.set(r.pos.x, (r.pos.y || 0) + (r.downed ? 0.6 : 1.5), r.pos.z);
    specFwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // se acerca si hay una pared, el techo o el piso en el medio
    specBack.copy(specFwd).negate();
    const hit = g.world.raycast(specTarget, specBack, 3.2);
    const dist = Math.max(0.4, Math.min(3.2, hit - 0.3));
    cam.position.copy(specTarget).addScaledVector(specBack, dist);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  updateCamera(cam) {
    const g = this.g;
    const bob = this.moving && this.onGround ? Math.abs(Math.sin(this.bobPhase)) * 0.035 * (this.sprinting ? 1.5 : 1) : 0;
    cam.position.set(this.pos.x, this.pos.y + this.eye - bob - this.landKick * 0.08, this.pos.z);
    const sh = g.fx.shake * g.settings.shake;
    const t = g.time;
    cam.rotation.set(
      this.pitch - (g.weapons?.viewDip || 0) + Math.sin(t * 37) * sh * 0.03,
      this.yaw + Math.sin(t * 29) * sh * 0.03,
      (this.moving ? Math.cos(this.bobPhase) * 0.004 : 0) + Math.sin(t * 23) * sh * 0.02 + (this.downed ? 0.3 : 0),
      'YXZ',
    );
  }
}
