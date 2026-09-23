import * as THREE from 'three';
import Avatars from './Avatars';
import { GRENADE, maxTier } from '../config/weapons';
import { POMBERO_ID } from '../entities/Pombero';
import { levelOf } from '../world/Attic';

// Sincronización de la partida. El anfitrión simula todo (zombies, rondas,
// puertas, caja, clima) y manda 15 fotos por segundo con las posiciones; los
// invitados mueven su propio jugador, disparan y le avisan al anfitrión.
// Cada uno maneja su plata, sus mates y sus perks; lo que es del mapa lo
// decide el anfitrión.

const SNAP_HZ = 20;
const MOVE_HZ = 20;
const PLAYER_BYTES = 12;
const ZOMBIE_BYTES = 10;

const tmpV = new THREE.Vector3();

export default class Session {
  constructor(game, net) {
    this.g = game;
    this.net = net;
    this.guest = net.guest;
    this.host = net.host;
    this.id = net.id;
    this.remote = new Map(); // id -> { id, name, pos, yaw, pitch, flags, health, weapon, downed }
    this.zombieById = new Map();
    this.snapT = 0;
    this.moveT = 0;
    this.pts = new Map();
    this.ptsT = 0;
    this.buf = new ArrayBuffer(4096);
    this.view = new DataView(this.buf);
    this.avatars = new Avatars(game, this);
    // bajas, caídas y levantadas de cada uno (las lleva el anfitrión)
    this.tally = new Map();
    this.outT = 0;
    this.hookHandlers();
    if (this.guest) net.send({ t: 'name', name: net.name });
  }

  credit(id, key, n = 1) {
    if (!this.host) return;
    let t = this.tally.get(id);
    if (!t) {
      t = { kills: 0, heads: 0, knife: 0, downs: 0, revives: 0 };
      this.tally.set(id, t);
    }
    t[key] += n;
  }

  // Un invitado liquidó un zombie (el anfitrión lo anota a su nombre).
  creditKill(id, type, zone) {
    this.credit(id, 'kills');
    if (zone === 'head' && (type === 'bullet' || type === 'knife')) this.credit(id, 'heads');
    if (type === 'knife') this.credit(id, 'knife');
  }

  // Tabla del equipo para el final.
  board() {
    const g = this.g;
    const mine = this.tally.get(this.id) || {};
    const list = [{ id: this.id, name: this.nameOf(this.id), kills: g.stats.kills, heads: g.stats.headshots, knife: g.stats.knifeKills, downs: mine.downs || 0, revives: mine.revives || 0 }];
    for (const id of this.net.players.keys()) {
      if (id === this.id) continue;
      const t = this.tally.get(id) || {};
      list.push({ id, name: this.nameOf(id), kills: t.kills || 0, heads: t.heads || 0, knife: t.knife || 0, downs: t.downs || 0, revives: t.revives || 0 });
    }
    return list.sort((a, b) => b.kills - a.kills);
  }

  // Partida nueva armada por el anfitrión: cada invitado recibe el mundo de nuevo.
  restartAll() {
    this.tally.clear();
    this.outT = 0;
    for (const id of this.net.peers.keys()) this.sendState(id, true);
  }

  get players() {
    return [...this.net.players.values()];
  }

  // Jugador más cercano a un punto (para que los zombies repartan atención).
  nearest(x, z, y = 0) {
    const g = this.g;
    const lv = levelOf(y);
    const far = (p) => (levelOf(p.pos.y) === lv ? 0 : 900);
    let best = g.player.alive && !g.player.downed ? g.player : null;
    let bd = best ? (best.pos.x - x) ** 2 + (best.pos.z - z) ** 2 + far(best) : Infinity;
    for (const r of this.remote.values()) {
      if (r.dead || r.downed) continue;
      const d = (r.pos.x - x) ** 2 + (r.pos.z - z) ** 2 + far(r);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  // ---------------- envío ----------------
  update(dt) {
    const g = this.g;
    this.interpolate();
    this.avatars.update(dt);
    // en línea, si todos quedaron tirados, se terminó (lo decide el anfitrión).
    // También si el anfitrión quedó tirado y se fueron todos: nadie lo levanta.
    // (Tirado con Quick Revive en solitario no cuenta: se levanta solo.)
    if (this.host && g.state === 'playing') {
      const p = g.player;
      const me = !p.alive || (p.downed && p.bleed > 0);
      const out = me && [...this.remote.values()].every((r) => r.dead || r.downed);
      this.outT = out ? this.outT + dt : 0;
      if (this.outT > 0.8) g.gameOver(true);
    }
    if (this.host) {
      this.snapT -= dt;
      if (this.snapT <= 0) {
        this.snapT = 1 / SNAP_HZ;
        this.sendSnapshot();
      }
      this.ptsT -= dt;
      if (this.ptsT <= 0) {
        this.ptsT = 0.25;
        for (const [id, v] of this.pts) if (v) this.net.to(id, { t: 'pts', v });
        this.pts.clear();
      }
    } else {
      this.moveT -= dt;
      if (this.moveT <= 0) {
        this.moveT = 1 / MOVE_HZ;
        this.sendMove();
      }
    }
    // los muertos de otros jugadores también cuentan para la ronda del anfitrión
    if (this.host && g.rounds) g.rounds.players = this.net.count;
    // panel de compañeros
    this.teamT = (this.teamT || 0) - dt;
    if (this.teamT <= 0) {
      this.teamT = 0.3;
      g.hud.setTeam([...this.remote.values()].map((r) => ({ name: r.name, health: r.health ?? 100, downed: r.downed, dead: r.dead })));
    }
  }

  playerFlags(p) {
    const luz = p === this.g.player && this.g.weapons?.hasLuz?.();
    return (p.crouching ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.downed ? 4 : 0) | (!p.alive ? 8 : 0) | (p.moving ? 16 : 0) | (luz ? 32 : 0);
  }

  writePlayer(v, o, id, p) {
    v.setUint8(o, id);
    v.setInt16(o + 1, Math.round(p.pos.x * 50), true);
    v.setInt16(o + 3, Math.round(p.pos.z * 50), true);
    v.setUint8(o + 5, Math.max(0, Math.min(255, Math.round((p.pos.y + 1) * 30))));
    v.setInt16(o + 6, Math.round((p.yaw % (Math.PI * 2)) * 5000), true);
    v.setInt8(o + 8, Math.max(-127, Math.min(127, Math.round(p.pitch * 80))));
    v.setUint8(o + 9, this.playerFlags(p));
    v.setUint8(o + 10, p.weaponIdx ?? 0);
    v.setUint8(o + 11, Math.max(0, Math.min(100, Math.round((p.health / (p.maxHealth || 100)) * 100))));
    return o + PLAYER_BYTES;
  }

  readPlayer(v, o) {
    const id = v.getUint8(o);
    const flags = v.getUint8(o + 9);
    return {
      id,
      x: v.getInt16(o + 1, true) / 50,
      z: v.getInt16(o + 3, true) / 50,
      y: v.getUint8(o + 5) / 30 - 1,
      yaw: v.getInt16(o + 6, true) / 5000,
      pitch: v.getInt8(o + 8) / 80,
      crouch: !!(flags & 1),
      sprint: !!(flags & 2),
      downed: !!(flags & 4),
      dead: !!(flags & 8),
      moving: !!(flags & 16),
      hasLuz: !!(flags & 32),
      weapon: v.getUint8(o + 10),
      health: v.getUint8(o + 11),
      size: PLAYER_BYTES,
    };
  }

  sendSnapshot() {
    const g = this.g;
    const v = this.view;
    const list = g.zombies.pool.filter((z) => z.active);
    const boss = g.zombies.boss;
    const pomb = g.pombero?.snapshot();
    let o = 0;
    v.setUint8(o++, 1);
    v.setUint8(o++, 1 + this.remote.size);
    v.setUint16(o, list.length, true);
    o += 2;
    v.setUint8(o++, boss ? 1 : 0);
    v.setUint8(o++, pomb ? 1 : 0);
    // jugadores (el anfitrión y lo último que recibió de cada invitado)
    o = this.writePlayer(v, o, this.id, g.player);
    for (const r of this.remote.values()) {
      // lo último que mandó cada invitado (no la posición suavizada, que va atrasada)
      const n = r.net;
      v.setUint8(o, r.id);
      v.setInt16(o + 1, Math.round(n.x * 50), true);
      v.setInt16(o + 3, Math.round(n.z * 50), true);
      v.setUint8(o + 5, Math.max(0, Math.min(255, Math.round((n.y + 1) * 30))));
      v.setInt16(o + 6, Math.round(n.yaw * 5000), true);
      v.setInt8(o + 8, Math.max(-127, Math.min(127, Math.round(n.pitch * 80))));
      v.setUint8(o + 9, r.flags || 0);
      v.setUint8(o + 10, r.weapon || 0);
      v.setUint8(o + 11, r.health ?? 100);
      o += PLAYER_BYTES;
    }
    for (const z of list) {
      v.setUint16(o, z.id & 0xffff, true);
      v.setInt16(o + 2, Math.round(z.pos.x * 50), true);
      v.setInt16(o + 4, Math.round(z.pos.z * 50), true);
      v.setInt16(o + 6, Math.round(z.yaw * 5000), true);
      v.setUint8(o + 8, STATES.indexOf(z.state) + 1);
      v.setUint8(o + 9, (z.crawler ? 1 : 0) | (z.dead ? 2 : 0) | (SPEEDS.indexOf(z.speedType) << 2) | (z.hidden & (1 << 2) ? 16 : 0) | (z.dog ? 32 : 0) | (z.level ? 64 : 0));
      o += ZOMBIE_BYTES;
    }
    if (boss) {
      v.setInt16(o, Math.round(boss.pos.x * 50), true);
      v.setInt16(o + 2, Math.round(boss.pos.z * 50), true);
      v.setInt16(o + 4, Math.round(boss.yaw * 5000), true);
      v.setUint8(o + 6, STATES.indexOf(boss.state) + 1);
      v.setUint8(o + 7, Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)));
      v.setUint8(o + 8, boss.mandinga ? 1 : 0);
      v.setUint8(o + 9, boss.dead ? 1 : 0);
      o += ZOMBIE_BYTES;
    }
    if (pomb) {
      v.setInt16(o, Math.round(pomb.x * 50), true);
      v.setInt16(o + 2, Math.round(pomb.z * 50), true);
      v.setInt16(o + 4, Math.round(pomb.yaw * 5000), true);
      v.setUint8(o + 6, pomb.st);
      o += 8;
    }
    this.net.sendFast(this.buf.slice(0, o));
  }

  sendMove() {
    const g = this.g;
    const v = this.view;
    v.setUint8(0, 2);
    this.writePlayer(v, 1, this.id, g.player);
    this.net.sendFast(this.buf.slice(0, 1 + PLAYER_BYTES));
  }

  // ---------------- recepción ----------------
  onSnapshot(data, from) {
    const v = new DataView(data instanceof ArrayBuffer ? data : data.buffer);
    const kind = v.getUint8(0);
    if (kind === 2 && this.host) {
      // un invitado mandó su posición
      const p = this.readPlayer(v, 1);
      this.applyRemote(from, p);
      return;
    }
    if (kind !== 1 || this.host) return;
    const players = v.getUint8(1);
    const zcount = v.getUint16(2, true);
    const hasBoss = v.getUint8(4);
    const hasPomb = v.getUint8(5);
    let o = 6;
    for (let i = 0; i < players; i++) {
      const p = this.readPlayer(v, o);
      o += PLAYER_BYTES;
      if (p.id !== this.id) this.applyRemote(p.id, p);
    }
    const seen = new Set();
    for (let i = 0; i < zcount; i++) {
      const id = v.getUint16(o, true);
      const x = v.getInt16(o + 2, true) / 50;
      const z = v.getInt16(o + 4, true) / 50;
      const yaw = v.getInt16(o + 6, true) / 5000;
      const st = STATES[v.getUint8(o + 8) - 1] || 'chase';
      const f = v.getUint8(o + 9);
      o += ZOMBIE_BYTES;
      seen.add(id);
      this.g.zombies.applyRemote(id, x, z, yaw, st, { crawler: !!(f & 1), dead: !!(f & 2), speedType: SPEEDS[(f >> 2) & 3] || 'walk', noHead: !!(f & 16), dog: !!(f & 32), level: !!(f & 64) });
    }
    this.g.zombies.pruneRemote(seen);
    if (hasBoss) {
      const b = {
        x: v.getInt16(o, true) / 50,
        z: v.getInt16(o + 2, true) / 50,
        yaw: v.getInt16(o + 4, true) / 5000,
        state: STATES[v.getUint8(o + 6) - 1] || 'chase',
        hp: v.getUint8(o + 7) / 100,
        mandinga: !!v.getUint8(o + 8),
        dead: !!v.getUint8(o + 9),
      };
      this.g.zombies.applyRemoteBoss(b);
      o += ZOMBIE_BYTES;
    } else this.g.zombies.applyRemoteBoss(null);
    this.g.pombero?.applyRemote(
      hasPomb ? { x: v.getInt16(o, true) / 50, z: v.getInt16(o + 2, true) / 50, yaw: v.getInt16(o + 4, true) / 5000, st: v.getUint8(o + 6) } : null,
    );
  }

  applyRemote(id, p) {
    const now = performance.now();
    let r = this.remote.get(id);
    if (!r) {
      r = { id, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, pitch: p.pitch, speed: 0, buf: [], gap: 1000 / SNAP_HZ, last: now };
      r.name = this.nameOf(id);
      this.remote.set(id, r);
      this.avatars.add(r);
    }
    // cada cuánto llegan las fotos: define cuánto atrás se dibuja
    const gap = now - r.last;
    r.last = now;
    if (gap > 1 && gap < 400) r.gap += (gap - r.gap) * 0.1;
    r.buf.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
    if (r.buf.length > 16) r.buf.shift();
    r.net = p;
    r.flags = (p.crouch ? 1 : 0) | (p.sprint ? 2 : 0) | (p.downed ? 4 : 0) | (p.dead ? 8 : 0) | (p.moving ? 16 : 0) | (p.hasLuz ? 32 : 0);
    r.hasLuz = p.hasLuz;
    r.downed = p.downed;
    r.dead = p.dead;
    r.moving = p.moving;
    r.crouch = p.crouch;
    r.health = p.health;
    r.weapon = p.weapon;
    r.name = this.nameOf(id);
  }

  // Los compañeros se dibujan un poquito en el pasado (un par de fotos atrás)
  // y se va de una foto a la otra: así se mueven parejo aunque lleguen a saltos.
  interpolate() {
    const now = performance.now();
    for (const r of this.remote.values()) {
      const b = r.buf;
      if (!b?.length) continue;
      const rt = now - Math.min(230, Math.max(60, r.gap * 1.8 + 12));
      let k = -1;
      for (let j = b.length - 2; j >= 0; j--) {
        if (b[j].t <= rt) {
          k = j;
          break;
        }
      }
      let a;
      let c;
      let f;
      if (k < 0) {
        a = b[0];
        c = b[0];
        f = 0;
      } else {
        a = b[k];
        c = b[k + 1];
        // si se atrasan las fotos, sigue un poquito en la misma dirección
        f = Math.min(1.2, (rt - a.t) / Math.max(1, c.t - a.t));
        if (k > 1) b.splice(0, k - 1);
      }
      const px = r.pos.x;
      const pz = r.pos.z;
      r.pos.set(a.x + (c.x - a.x) * f, a.y + (c.y - a.y) * Math.min(1, f), a.z + (c.z - a.z) * f);
      let dy = c.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      r.yaw = a.yaw + dy * Math.min(1, f);
      r.pitch = a.pitch + (c.pitch - a.pitch) * Math.min(1, f);
      // velocidad para el paso (m/s), suavizada
      const dt = (now - (r.lastI || now)) / 1000;
      r.lastI = now;
      if (dt > 0 && dt < 0.2) {
        const v = Math.hypot(r.pos.x - px, r.pos.z - pz) / dt;
        r.speed += (Math.min(9, v) - r.speed) * Math.min(1, dt * 8);
      }
    }
  }

  // ---------------- eventos ----------------
  hookHandlers() {
    const g = this.g;
    const net = this.net;
    net.on('snapshot', (data, from) => this.onSnapshot(data, from));
    net.on('join', ({ id }) => this.onJoin(id));
    net.on('leave', ({ id }) => {
      this.remote.delete(id);
      this.avatars.remove(id);
      g.hud.subtitle('Un jugador se fue de la partida.', 3);
    });
    net.on('hostgone', () => {
      if (net.closed || this.lost) return;
      this.lost = true;
      g.onHostGone();
    });
    net.on('pts', (m) => g.addPoints(m.v, null, true));
    // plata que te convida un compañero (el anfitrión la pasa si no es para él)
    // un invitado agarró su Mate de Oro
    net.on('oro', (m, from) => {
      if (this.host) g.ee.gotOro(from);
    });
    net.on('gift', (m, from) => {
      const n = Math.max(0, Math.min(5000, m.n | 0));
      if (!n) return;
      if (this.host && m.to !== this.id) {
        this.net.to(m.to, { t: 'gift', to: m.to, n, from });
        return;
      }
      const src = this.host ? from : m.from;
      g.receivePoints(n);
      g.hud.subtitle(`${this.nameOf(src)} te convidó ${n}.`, 3);
    });
    // un invitado le pegó a un osito
    net.on('secret', (m) => {
      if (!this.host || m.k !== 'bear') return;
      const b = g.secrets.bears[m.i];
      if (b?.alive) g.secrets.hitBear(b);
    });
    // un invitado le pegó a la calabaza del Abuelo
    net.on('eeshot', (m) => {
      if (this.host) g.ee.dropCalabaza(new THREE.Vector3(m.x, 0, m.z));
    });
    net.on('hurt', (m) => g.player.damage(m.a, tmpV.set(m.x, 1, m.z)));
    net.on('shot', (m) => this.remoteShot(m));
    net.on('hit', (m, from) => this.applyRemoteHit(m, from));
    net.on('use', (m, from) => this.applyRemoteUse(m, from));
    net.on('ok', (m) => this.applyUseResult(m));
    net.on('ev', (m) => this.applyEvent(m));
    net.on('state', (m) => this.applyFullState(m));
    net.on('down', (m) => {
      const r = this.remote.get(m.id);
      if (r) r.downed = true;
      this.credit(m.id, 'downs');
      if (this.host) net.broadcast(m, m.id);
      g.hud.subtitle(`${this.nameOf(m.id)} cayó. ¡Levantalo!`, 4);
    });
    net.on('up', (m) => {
      const r = this.remote.get(m.id);
      if (r) r.downed = false;
      if (this.host) net.broadcast(m, m.id);
      if (m.id === this.id) g.player.revive();
    });
    net.on('pupget', (m, from) => {
      const i = g.powerups.items.findIndex((x) => x.id === m.id);
      if (i < 0) return;
      const type = g.powerups.items[i].type;
      g.powerups.remove(i);
      g.powerups.apply(type, m.id);
      this.pts.set(from, (this.pts.get(from) || 0) + 0);
    });
    net.on('revive', (m, from) => {
      this.credit(from, 'revives');
      // alguien te está levantando
      if (m.id === this.id) g.player.revive();
      else if (this.host) net.to(m.id, { t: 'up', id: m.id, by: from });
      if (this.host) net.broadcast({ t: 'up', id: m.id }, m.id);
      const r = this.remote.get(m.id);
      if (r) r.downed = false;
    });
  }

  // Puntos que se ganó un invitado con algo que simula el anfitrión.
  givePts(id, v) {
    this.pts.set(id, (this.pts.get(id) || 0) + v);
  }

  giftPoints(to, n) {
    if (this.host) this.net.to(to, { t: 'gift', to, n, from: this.id });
    else this.net.send({ t: 'gift', to, n });
  }

  nameOf(id) {
    return this.net.players.get(id)?.name || `Jugador ${id + 1}`;
  }

  onJoin(id) {
    this.g.hud.subtitle(`${this.nameOf(id)} se unió a la partida.`, 4);
    this.sendState(id, false);
  }

  // Estado completo del mundo para el que entra (o para todos, si se arrancó otra).
  sendState(id, restart) {
    const g = this.g;
    this.net.to(id, {
      t: 'state',
      id,
      restart,
      playing: g.state === 'playing' || g.state === 'paused',
      paused: g.state === 'paused',
      round: g.rounds.round,
      phase: g.rounds.state,
      power: g.world.power,
      doors: [...g.world.doorOpen],
      zones: [...g.activeZones],
      box: { spot: g.interact.box.spot, state: g.interact.box.state },
      weather: g.weather.name,
      arena: g.arena.active,
      ee: g.ee.fullState(),
      shield: g.activities.shieldBuilt,
      parts: Object.values(g.activities.parts || {}).filter((p) => p.taken).map((p) => p.def.id),
      lmparts: Object.values(g.curandero?.parts || {}).filter((p) => p.taken).map((p) => p.def.id),
      start: [g.player.pos.x, g.player.pos.z],
    });
  }

  applyFullState(m) {
    const g = this.g;
    this.id = m.id;
    this.net.id = m.id;
    // primero se arma la partida (si hace falta) y después se le aplica el mundo
    if (m.restart || (m.playing && g.state !== 'playing' && g.state !== 'paused')) {
      g.menus.show(null);
      g.startAsGuest();
    }
    if (m.power && !g.world.power) g.turnOnPower();
    m.doors.forEach((open, i) => {
      if (open && !g.world.doorOpen[i]) g.interact.openDoor(g.interact.list.find((it) => it.kind === 'door' && it.door.index === i).door);
    });
    for (const z of m.zones) g.activeZones.add(z);
    g.interact.placeBox(m.box.spot);
    g.weather.set(m.weather, false);
    g.rounds.round = m.round;
    g.hud.setRound(m.round);
    if (m.shield) g.activities.shieldBuilt = true;
    for (const id of m.parts || []) g.activities.takePart(id, true);
    for (const id of m.lmparts || []) g.curandero?.takePart(id, true);
    if (m.ee) g.ee.applyRemote(m.ee);
    // aparecer cerca del anfitrión (en una partida nueva, cada uno en su lugar)
    if (!m.restart) g.player.pos.set(m.start[0], 0, m.start[1]);
    if (m.paused) g.hostPause(true);
  }

  // ---------------- disparos y daño ----------------
  sendShot(muzzle, end, kind, upgraded) {
    const m = { t: 'shot', pid: this.id, x: +muzzle.x.toFixed(2), y: +muzzle.y.toFixed(2), z: +muzzle.z.toFixed(2), ex: +end.x.toFixed(2), ey: +end.y.toFixed(2), ez: +end.z.toFixed(2), k: kind, u: upgraded ? 1 : 0 };
    if (this.host) this.net.broadcast(m);
    else this.net.send(m);
  }

  remoteShot(m) {
    const g = this.g;
    if (this.host) this.net.broadcast(m, m.pid);
    const from = tmpV.set(m.x, m.y, m.z).clone();
    const to = new THREE.Vector3(m.ex, m.ey, m.ez);
    if (m.k === 'stream') g.fx.waterJet(from, to, !!m.u);
    else g.fx.tracer(from, to, m.u ? 0xffa0ff : 0xfff0c8);
    g.critters?.onNoise(from);
    g.fx.flash(from, 0xffb060, 6, 0.05, 6);
    g.audio.shot(m.k, from, !!m.u);
  }

  // Un invitado le pegó a un zombie: el anfitrión aplica el daño.
  reportHit(z, dmg, info) {
    this.net.send({
      t: 'hit',
      z: z.id & 0xffff,
      d: Math.round(dmg),
      zone: info.zone || 'torso',
      k: info.type || 'bullet',
      x: info.point ? +info.point.x.toFixed(2) : 0,
      y: info.point ? +info.point.y.toFixed(2) : 0,
      w: info.point ? +info.point.z.toFixed(2) : 0,
      dx: info.dir ? +info.dir.x.toFixed(2) : 0,
      dz: info.dir ? +info.dir.z.toFixed(2) : 0,
      arm: info.arm,
      burn: info.burn ? 1 : 0,
      el: info.elem || undefined,
      dc: info.decap ? 1 : 0,
    });
  }

  applyRemoteHit(m, from) {
    const g = this.g;
    const z = m.z === 0xffff && g.zombies.boss ? g.zombies.boss : this.findZombie(m.z);
    if (!z || !z.active || z.dead) return;
    const before = z.hp;
    g.zombies.damage(z, m.d, {
      type: m.k,
      zone: m.zone,
      arm: m.arm,
      burn: !!m.burn,
      elem: m.el,
      decap: !!m.dc,
      point: new THREE.Vector3(m.x, m.y, m.w),
      dir: new THREE.Vector3(m.dx, 0, m.dz),
      noPoints: true,
      by: from,
    });
    // puntos para el que disparó
    const P = g.zombies.lastPoints || 0;
    if (P) this.pts.set(from, (this.pts.get(from) || 0) + P);
    else if (before > z.hp) this.pts.set(from, (this.pts.get(from) || 0) + 10);
  }

  findZombie(id) {
    const pb = this.g.pombero?.z;
    if (id === POMBERO_ID) return pb?.active ? pb : null;
    for (const z of this.g.zombies.pool) if (z.active && (z.id & 0xffff) === id) return z;
    if (this.g.zombies.boss && (this.g.zombies.boss.id & 0xffff) === id) return this.g.zombies.boss;
    return null;
  }

  // ---------------- cosas del mapa ----------------
  // El invitado pide usar algo; el anfitrión lo resuelve y contesta.
  requestUse(index, extra = {}) {
    this.pendingUse = index;
    this.net.send({ t: 'use', i: index, ...extra });
  }

  applyRemoteUse(m, from) {
    const g = this.g;
    const it = g.interact.list[m.i];
    if (!it) return;
    const reply = (ok, payload = {}) => this.net.to(from, { t: 'ok', i: m.i, ok, ...payload });
    const kind = it.kind;
    if (kind === 'pap') {
      // el mate del invitado entra a la máquina
      const pap = g.interact.pap;
      const tier = (m.up | 0) + 1;
      if (!m.w || pap.state !== 'idle' || tier > maxTier(m.w)) return reply(false);
      g.interact.startPapFor(m.w, from, tier);
      return reply(true, { w: m.w, up: tier });
    }
    if (kind === 'box') {
      const box = g.interact.box;
      if (box.state === 'closed') {
        g.interact.openBox();
        box.taker = from;
        return reply(true, { open: true });
      }
      if (box.state === 'offer') {
        const w = box.offer;
        g.interact.takeBoxWeapon();
        return reply(true, { w });
      }
      return reply(false);
    }
    if (kind === 'wallbuy') {
      // el mate es del invitado: acá solo queda colgado el dibujo (el anfitrión no recibe nada)
      it.show?.();
      return reply(true, { w: it.weapon, nade: it.isNade ? 1 : 0, bowie: it.bowie ? 1 : 0 });
    }
    if (kind === 'perk') {
      // si el invitado ya lo tiene lo frena su propia compu; acá solo importa la máquina
      const mach = it.machine;
      if (mach.gone || (!g.world.power && mach.perk !== 'revive')) return reply(false);
      g.audio.perkJingle(mach.perk, it.pos);
      return reply(true, { perk: mach.perk });
    }
    if (kind === 'jar') {
      const jar = g.activities.jars.find((j) => j.def === it.jarDef) || g.activities.jars[it.jarIndex ?? 0];
      if (!jar || jar.state !== 'gift') return reply(false);
      const gift = g.activities.giftFor(jar);
      return reply(true, { gift });
    }
    if (kind === 'lmbench') {
      // el Mate del Chiquitijuein: uno solo a la vez (lo decide el anfitrión)
      const ok = g.curandero.claimFor(from);
      return reply(ok, ok ? { w: 'luzmala' } : {});
    }
    if (kind === 'luzmala') {
      // cavó un invitado: el anfitrión decide qué sale y se lo manda
      const res = g.luz.dig();
      return reply(!!res, { luz: res });
    }
    if (kind === 'repair') {
      // la tabla la pone el anfitrión, pero los puntos son del que la clavó
      const w = it.window;
      if (g.barriers.count(w.i) >= 6) return reply(false);
      return reply(true, { board: g.barriers.repair(w.i) ? 1 : 0 });
    }
    if (kind === 'bench') {
      const res = g.activities.benchUse(true);
      return reply(!!res, { shield: true, built: res });
    }
    // el resto (puertas, luz, trampas, radios, barreras, easter egg) es del mapa
    const ok = it.use();
    return reply(ok !== false);
  }

  applyUseResult(m) {
    const g = this.g;
    if (!m.ok) {
      g.audio.deny();
      return;
    }
    const it = g.interact.list[m.i];
    const cost = it ? it.cost() : 0;
    if (m.board != null) {
      if (m.board) g.addPoints(10, null, false, 'board');
      return;
    }
    if (cost > 0) g.spend(cost);
    else g.audio.purchase();
    if (m.w) g.weapons.give(m.w, m.up || 0);
    if (m.nade) {
      g.weapons.grenades = GRENADE.max;
      g.weapons.updateHud();
    }
    if (m.bowie) g.weapons.giveBowie();
    if (m.perk) {
      g.weapons.drink(g.perkColor(m.perk), () => g.player.givePerk(m.perk));
    }
    if (m.gift) g.activities.applyGift(m.gift);
    if (m.shield) g.activities.equipShield();
    if (m.luz) g.luz.applyReward(m.luz);
  }

  // El anfitrión avisa un cambio del mundo.
  event(name, data = {}) {
    if (!this.host) return;
    this.net.broadcast({ t: 'ev', e: name, ...data });
  }

  applyEvent(m) {
    const g = this.g;
    switch (m.e) {
      case 'door': {
        const it = g.interact.list.find((x) => x.kind === 'door' && x.door.index === m.i);
        if (it && !it.door.open) g.interact.openDoor(it.door);
        break;
      }
      case 'power':
        if (!g.world.power) g.turnOnPower();
        break;
      case 'round':
        g.rounds.applyRemote(m);
        break;
      case 'box':
        g.interact.applyRemoteBox(m);
        break;
      case 'pap':
        g.interact.applyRemotePap(m);
        break;
      case 'boards':
        g.barriers.applyRemote(m.w, m.n);
        break;
      case 'pup':
        g.powerups.applyRemote(m);
        break;
      case 'weather':
        g.weather.set(m.n, false);
        break;
      case 'trap':
        g.activities.applyRemoteTrap(m.i);
        break;
      case 'jar':
        g.activities.applyRemoteJar(m.i, m.c, m.s);
        break;
      case 'radio':
        g.activities.playRadio(g.activities.radios[m.i]);
        break;
      case 'radio4':
        g.secrets.playRadio();
        break;
      case 'bear':
        g.secrets.popBear(m.i);
        break;
      case 'song':
        g.secrets.playSong();
        break;
      case 'shield':
        g.activities.shieldBuilt = true;
        break;
      case 'part':
        g.activities.takePart(m.id, true);
        break;
      case 'lmpart':
        g.curandero?.takePart(m.id, true);
        break;
      case 'lmcraft':
        if (g.curandero) g.curandero.claim = { id: m.id, until: g.time + 4 };
        break;
      case 'ee':
        g.ee.applyRemote(m);
        break;
      case 'pomb':
        g.pombero?.applyEvent(m);
        break;
      case 'luz':
        g.luz?.applyEvent(m);
        break;
      case 'arena':
        g.arena.start();
        break;
      case 'frain':
        g.arena.spawnRain(m.p);
        break;
      case 'ward':
        g.arena.setWard(!!m.on);
        break;
      case 'fireball':
        g.arena.spawnFireball(new THREE.Vector3(m.x, m.y, m.z), new THREE.Vector3(m.vx, m.vy, m.vz));
        break;
      case 'win':
        g.win(m);
        break;
      case 'pause':
        g.hostPause(!!m.on);
        break;
      case 'zone':
        g.activateZone(m.z);
        break;
      case 'start':
        if (g.state !== 'playing') g.startAsGuest();
        break;
      case 'over':
        g.gameOver(true, m);
        break;
      case 'dead': {
        const r = this.remote.get(m.id);
        if (r) {
          r.dead = true;
          r.downed = false;
        }
        if (this.host) this.net.broadcast(m, m.id);
        break;
      }
      case 'say':
        g.say(m.s, m.x, m.k);
        break;
      case 'sub':
        g.hud.subtitle(m.x, m.d || 3, m.k || '');
        if (m.s) g.audio.sting();
        break;
      case 'toast':
        g.hud.toast(m.x);
        g.audio.sting();
        break;
      default:
        break;
    }
  }

  dispose() {
    this.avatars.dispose();
    this.net.close();
  }
}

export const STATES = ['approach', 'tear', 'climb', 'chase', 'attack', 'rise', 'dead', 'frozen', 'shocked', 'flung', 'intro', 'slam', 'toLock', 'locking', 'burnrun', 'drop', 'dogspawn', 'whipWind', 'whip', 'chargeWind', 'charge', 'stunned', 'enrage', 'summon', 'stairs', 'fall'];
export const SPEEDS = ['walk', 'run', 'sprint'];
