import * as THREE from 'three';
import Avatars from './Avatars';
import { GRENADE, maxTier, tierOf } from '../config/weapons';
import { POMBERO_ID } from '../entities/Pombero';
import { CROW_ID } from '../entities/Crow';
import { STAKE_ID } from '../entities/bossMoves';
import { levelOf } from '../world/Attic';
import { submerged } from '../entities/swim';
import { dragonBreath } from '../weapons/dragonBreath';
import { cherryShock } from '../weapons/electricCherry';

// Sincronización de la partida. El anfitrión simula todo (zombies, rondas,
// puertas, caja, clima) y manda 15 fotos por segundo con las posiciones; los
// invitados mueven su propio jugador, disparan y le avisan al anfitrión.
// Cada uno maneja su plata, sus mates y sus perks; lo que es del mapa lo
// decide el anfitrión.

const SNAP_HZ = 20;
// (los nuevos, siempre al final: el índice viaja en la foto)
const BOSS_KINDS = ['capataz', 'mandinga', 'scarecrow', 'alcaide', 'gil', 'francisco', 'caballero', 'sargento', 'luison'];
// los jefes del final (los que no son un jefe de ronda)
const FINAL_KINDS = [1, 2, 4, 5];
const MOVE_HZ = 20;
// la altura va en 2 bytes (centímetros): la torre tiene más de 60 m
const PLAYER_BYTES = 13;
const ZOMBIE_BYTES = 12;

const tmpV = new THREE.Vector3();
// Altura en centímetros para 2 bytes (hasta ±327 m).
const packY = (y) => Math.max(-32000, Math.min(32000, Math.round((y || 0) * 100)));

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
    // la plata de cada invitado (cada uno maneja la suya y la avisa) y la
    // tabla de puntos que reparte el anfitrión (para el Tab)
    this.score = new Map();
    this.table = null;
    this.scoreT = 0;
    // lo que ganó cada invitado en toda la partida (para la tabla del final)
    this.earned = new Map();
    // cuánto tarda cada invitado en contestar (ms, lo mide el anfitrión)
    this.pings = new Map();
    this.pingT = 0;
    this.outT = 0;
    // el mate que tiene en la mano cada compañero (id -> { w, u }): lo dibuja Avatars
    this.wpn = new Map();
    this.wpnKey = null;
    this.wpnT = 0;
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
    const list = [{ id: this.id, name: this.nameOf(this.id), points: g.points, earned: g.stats.earned, ping: 0, kills: g.stats.kills, heads: g.stats.headshots, knife: g.stats.knifeKills, downs: mine.downs || 0, revives: mine.revives || 0 }];
    for (const id of this.net.players.keys()) {
      if (id === this.id) continue;
      const t = this.tally.get(id) || {};
      list.push({ id, name: this.nameOf(id), points: this.score.get(id) || 0, earned: this.earned.get(id) || 0, ping: Math.round(this.pings.get(id) || 0), kills: t.kills || 0, heads: t.heads || 0, knife: t.knife || 0, downs: t.downs || 0, revives: t.revives || 0 });
    }
    return list.sort((a, b) => b.kills - a.kills);
  }

  // Filas de la tabla de puntos (Tab). El anfitrión usa sus números; el
  // invitado, la última tabla que le mandó el anfitrión (y sus puntos al día).
  scoreRows() {
    const g = this.g;
    const p = g.player;
    const table = new Map((this.host ? this.board() : this.table || []).map((b) => [b.id, b]));
    return [...this.net.players.keys()]
      .map((id) => {
        const b = table.get(id) || {};
        const r = this.remote.get(id);
        const me = id === this.id;
        return {
          id,
          me,
          name: this.nameOf(id),
          points: me ? g.points : b.points | 0,
          kills: b.kills | 0,
          heads: b.heads | 0,
          knife: b.knife | 0,
          downs: b.downs | 0,
          revives: b.revives | 0,
          // el anfitrión no tiene ping (los demás se miden contra él)
          ping: id === 0 ? null : b.ping | 0,
          down: me ? p.downed : !!r?.downed,
          dead: me ? !p.alive : !!r?.dead,
        };
      })
      .sort((a, b) => b.points - a.points || b.kills - a.kills);
  }

  // Partida nueva armada por el anfitrión: cada invitado recibe el mundo de nuevo.
  restartAll() {
    this.tally.clear();
    this.score.clear();
    this.earned.clear();
    this.outT = 0;
    for (const id of this.net.peers.keys()) this.sendState(id, true);
  }

  get players() {
    return [...this.net.players.values()];
  }

  // Jugador más cercano a un punto (para que los zombies repartan atención).
  // (al sumergido no lo buscan, salvo wet: los yacarés)
  nearest(x, z, y = 0, wet = false) {
    const g = this.g;
    const lv = levelOf(y);
    // en la torre pesa la diferencia de altura (el de otro piso queda lejos)
    const tower = !!g.world?.tower;
    const far = (p) => (levelOf(p.pos.y) === lv ? 0 : 900) + (tower ? ((p.pos.y || 0) - y) ** 2 * 6 : 0);
    let best = g.player.canBeHit() && (wet || !submerged(g.player)) ? g.player : null;
    let bd = best ? (best.pos.x - x) ** 2 + (best.pos.z - z) ** 2 + far(best) : Infinity;
    for (const r of this.remote.values()) {
      if (r.dead || r.downed || r.ghost || (!wet && submerged(r))) continue;
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
    // el mate de la mano, para que los demás lo vean (al cambiar, y cada tanto
    // por si alguien entró después)
    if (g.state === 'playing' && g.weapons) {
      const s = g.weapons.slot;
      const key = s ? `${s.id}|${tierOf(s.up)}` : '';
      this.wpnT -= dt;
      if (key !== this.wpnKey || this.wpnT <= 0) {
        this.wpnKey = key;
        this.wpnT = 4;
        this.share('wpn', { id: this.id, w: s?.id || '', u: s ? tierOf(s.up) : 0 });
      }
    }
    // panel de compañeros
    this.teamT = (this.teamT || 0) - dt;
    if (this.teamT <= 0) {
      this.teamT = 0.3;
      g.hud.setTeam([...this.remote.values()].map((r) => ({ name: r.name, health: r.health ?? 100, downed: r.downed, dead: r.dead })));
    }
    // tabla de puntos (Tab): el invitado avisa su plata y el anfitrión reparte
    // la tabla cuando cambia algo
    this.scoreT -= dt;
    if (this.scoreT <= 0) {
      this.scoreT = 0.5;
      if (this.guest) {
        const key = `${g.points}|${g.stats.earned}`;
        if (key !== this.sentPts) {
          this.sentPts = key;
          this.net.send({ t: 'score', p: g.points, e: g.stats.earned });
        }
        this.netWarn();
      } else if (this.net.peers.size) {
        const l = this.board();
        const key = JSON.stringify(l);
        if (key !== this.boardKey) {
          this.boardKey = key;
          this.net.broadcast({ t: 'board', l });
        }
      }
    }
    // ping: cada 2 s el anfitrión le pregunta a cada invitado (contesta 'pong')
    if (this.host && this.net.peers.size) {
      this.pingT -= dt;
      if (this.pingT <= 0) {
        this.pingT = 2;
        this.net.broadcast({ t: 'ping', s: performance.now() });
      }
    }
  }

  // Invitado: aviso en pantalla si la conexión con el anfitrión anda mal
  // (se dejaron de recibir fotos del mundo, o el ping es alto).
  netWarn() {
    const g = this.g;
    let text = null;
    if (g.state === 'playing' && !g.hostPaused) {
      const gap = performance.now() - (this.snapAt || performance.now());
      const ping = this.table?.find((b) => b.id === this.id)?.ping | 0;
      if (gap > 1200) text = 'Se traba la conexión con el anfitrión…';
      else if (ping > 250) text = `Conexión lenta · ${ping} ms`;
    }
    g.hud.setNet(text);
  }

  playerFlags(p) {
    const luz = p === this.g.player && this.g.weapons?.hasLuz?.();
    return (p.crouching ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.downed ? 4 : 0) | (!p.alive ? 8 : 0) | (p.moving ? 16 : 0) | (luz ? 32 : 0) | (p.ghost ? 64 : 0) | (p.shield ? 128 : 0);
  }

  writePlayer(v, o, id, p) {
    v.setUint8(o, id);
    v.setInt16(o + 1, Math.round(p.pos.x * 50), true);
    v.setInt16(o + 3, Math.round(p.pos.z * 50), true);
    v.setInt16(o + 5, packY(p.pos.y), true);
    v.setInt16(o + 7, Math.round((p.yaw % (Math.PI * 2)) * 5000), true);
    v.setInt8(o + 9, Math.max(-127, Math.min(127, Math.round(p.pitch * 80))));
    v.setUint8(o + 10, this.playerFlags(p));
    // (arriba, el agua: 0 seco, 1 vadea, 2 nada, 3 bucea; entities/swim.js)
    v.setUint8(o + 11, ((p.weaponIdx ?? 0) & 15) | ((p.swim || 0) << 4));
    v.setUint8(o + 12, Math.max(0, Math.min(100, Math.round((p.health / (p.maxHealth || 100)) * 100))));
    return o + PLAYER_BYTES;
  }

  readPlayer(v, o) {
    const id = v.getUint8(o);
    const flags = v.getUint8(o + 10);
    return {
      id,
      x: v.getInt16(o + 1, true) / 50,
      z: v.getInt16(o + 3, true) / 50,
      y: v.getInt16(o + 5, true) / 100,
      yaw: v.getInt16(o + 7, true) / 5000,
      pitch: v.getInt8(o + 9) / 80,
      crouch: !!(flags & 1),
      sprint: !!(flags & 2),
      downed: !!(flags & 4),
      dead: !!(flags & 8),
      moving: !!(flags & 16),
      hasLuz: !!(flags & 32),
      ghost: !!(flags & 64),
      shield: !!(flags & 128),
      weapon: v.getUint8(o + 11) & 15,
      swim: (v.getUint8(o + 11) >> 4) & 3,
      health: v.getUint8(o + 12),
      size: PLAYER_BYTES,
    };
  }

  sendSnapshot() {
    const g = this.g;
    const v = this.view;
    const list = g.zombies.pool.filter((z) => z.active);
    const boss = g.zombies.boss;
    const pomb = g.pombero?.snapshot();
    const crow = g.crow?.snapshot();
    let o = 0;
    v.setUint8(o++, 1);
    v.setUint8(o++, 1 + this.remote.size);
    v.setUint16(o, list.length, true);
    o += 2;
    v.setUint8(o++, boss ? 1 : 0);
    v.setUint8(o++, pomb ? 1 : 0);
    v.setUint8(o++, crow ? 1 : 0);
    // jugadores (el anfitrión y lo último que recibió de cada invitado)
    o = this.writePlayer(v, o, this.id, g.player);
    for (const r of this.remote.values()) {
      // lo último que mandó cada invitado (no la posición suavizada, que va atrasada)
      const n = r.net;
      v.setUint8(o, r.id);
      v.setInt16(o + 1, Math.round(n.x * 50), true);
      v.setInt16(o + 3, Math.round(n.z * 50), true);
      v.setInt16(o + 5, packY(n.y), true);
      v.setInt16(o + 7, Math.round(n.yaw * 5000), true);
      v.setInt8(o + 9, Math.max(-127, Math.min(127, Math.round(n.pitch * 80))));
      v.setUint8(o + 10, r.flags || 0);
      v.setUint8(o + 11, ((r.weapon || 0) & 15) | ((r.swim || 0) << 4));
      v.setUint8(o + 12, r.health ?? 100);
      o += PLAYER_BYTES;
    }
    for (const z of list) {
      v.setUint16(o, z.id & 0xffff, true);
      v.setInt16(o + 2, Math.round(z.pos.x * 50), true);
      v.setInt16(o + 4, Math.round(z.pos.z * 50), true);
      v.setInt16(o + 6, Math.round(z.yaw * 5000), true);
      v.setUint8(o + 8, STATES.indexOf(z.state) + 1);
      v.setUint8(o + 9, (z.crawler ? 1 : 0) | (z.dead ? 2 : 0) | (SPEEDS.indexOf(z.speedType) << 2) | (z.hidden & (1 << 2) ? 16 : 0) | (z.dog ? 32 : 0) | (z.level ? 64 : 0) | (z.horse ? 128 : 0));
      v.setInt16(o + 10, packY(z.pos.y), true);
      o += ZOMBIE_BYTES;
    }
    if (boss) {
      v.setInt16(o, Math.round(boss.pos.x * 50), true);
      v.setInt16(o + 2, Math.round(boss.pos.z * 50), true);
      v.setInt16(o + 4, Math.round(boss.yaw * 5000), true);
      v.setUint8(o + 6, STATES.indexOf(boss.state) + 1);
      v.setUint8(o + 7, Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)));
      // 0 Capataz, 1 Mandinga, 2 Espantapájaros, 3 Alcaide, 4 Gauchito Gil, 5 Francisco
      v.setUint8(o + 8, Math.max(0, BOSS_KINDS.indexOf(boss.kind || (boss.mandinga ? 'mandinga' : 'capataz'))));
      v.setUint8(o + 9, boss.dead ? 1 : 0);
      v.setInt16(o + 10, packY(boss.pos.y), true);
      o += ZOMBIE_BYTES;
    }
    if (pomb) {
      v.setInt16(o, Math.round(pomb.x * 50), true);
      v.setInt16(o + 2, Math.round(pomb.z * 50), true);
      v.setInt16(o + 4, Math.round(pomb.yaw * 5000), true);
      v.setUint8(o + 6, pomb.st);
      o += 8;
    }
    if (crow) {
      v.setInt16(o, Math.round(crow.x * 50), true);
      v.setInt16(o + 2, Math.round(crow.z * 50), true);
      v.setInt16(o + 4, Math.round(crow.y * 50), true);
      v.setInt16(o + 6, Math.round((crow.yaw % (Math.PI * 2)) * 5000), true);
      v.setUint8(o + 8, crow.st);
      v.setUint8(o + 9, Math.round(crow.hp * 200));
      o += 10;
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
    // (para avisar si se traba la conexión)
    this.snapAt = performance.now();
    const players = v.getUint8(1);
    const zcount = v.getUint16(2, true);
    const hasBoss = v.getUint8(4);
    const hasPomb = v.getUint8(5);
    const hasCrow = v.getUint8(6);
    let o = 7;
    for (let i = 0; i < players; i++) {
      const p = this.readPlayer(v, o);
      o += PLAYER_BYTES;
      // (una foto atrasada no revive al que ya se fue: los números no se reusan)
      if (p.id !== this.id && !this.gone?.has(p.id)) this.applyRemote(p.id, p);
    }
    const seen = new Set();
    for (let i = 0; i < zcount; i++) {
      const id = v.getUint16(o, true);
      const x = v.getInt16(o + 2, true) / 50;
      const z = v.getInt16(o + 4, true) / 50;
      const yaw = v.getInt16(o + 6, true) / 5000;
      const st = STATES[v.getUint8(o + 8) - 1] || 'chase';
      const f = v.getUint8(o + 9);
      const y = v.getInt16(o + 10, true) / 100;
      o += ZOMBIE_BYTES;
      seen.add(id);
      this.g.zombies.applyRemote(id, x, z, yaw, st, { crawler: !!(f & 1), dead: !!(f & 2), speedType: SPEEDS[(f >> 2) & 3] || 'walk', noHead: !!(f & 16), dog: !!(f & 32), level: !!(f & 64), horse: !!(f & 128), y });
    }
    this.g.zombies.pruneRemote(seen);
    if (hasBoss) {
      const b = {
        x: v.getInt16(o, true) / 50,
        z: v.getInt16(o + 2, true) / 50,
        yaw: v.getInt16(o + 4, true) / 5000,
        state: STATES[v.getUint8(o + 6) - 1] || 'chase',
        hp: v.getUint8(o + 7) / 100,
        mandinga: FINAL_KINDS.includes(v.getUint8(o + 8)),
        kind: BOSS_KINDS[v.getUint8(o + 8)] || 'capataz',
        dead: !!v.getUint8(o + 9),
        y: v.getInt16(o + 10, true) / 100,
      };
      this.g.zombies.applyRemoteBoss(b);
      o += ZOMBIE_BYTES;
    } else this.g.zombies.applyRemoteBoss(null);
    this.g.pombero?.applyRemote(
      hasPomb ? { x: v.getInt16(o, true) / 50, z: v.getInt16(o + 2, true) / 50, yaw: v.getInt16(o + 4, true) / 5000, st: v.getUint8(o + 6) } : null,
    );
    if (hasPomb) o += 8;
    this.g.crow?.applyRemote(
      hasCrow ? { x: v.getInt16(o, true) / 50, z: v.getInt16(o + 2, true) / 50, y: v.getInt16(o + 4, true) / 50, yaw: v.getInt16(o + 6, true) / 5000, st: v.getUint8(o + 8), hp: v.getUint8(o + 9) / 200 } : null,
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
    r.flags = (p.crouch ? 1 : 0) | (p.sprint ? 2 : 0) | (p.downed ? 4 : 0) | (p.dead ? 8 : 0) | (p.moving ? 16 : 0) | (p.hasLuz ? 32 : 0) | (p.ghost ? 64 : 0) | (p.shield ? 128 : 0);
    r.ghost = p.ghost;
    r.shield = p.shield;
    r.hasLuz = p.hasLuz;
    r.downed = p.downed;
    r.dead = p.dead;
    r.moving = p.moving;
    r.crouch = p.crouch;
    r.health = p.health;
    r.weapon = p.weapon;
    r.swim = p.swim || 0;
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
      const r = this.remote.get(id);
      this.remote.delete(id);
      this.avatars.remove(id);
      g.hud.subtitle(`${r?.name || 'Un jugador'} se fue de la partida.`, 3);
      // cargando: si faltaba ese, se arranca sin él
      g.arrival?.renderPlayers();
      g.arrival?.checkAll();
    });
    // a los invitados el 'leave' no les llega (lo dispara la conexión, que es
    // del anfitrión): el que ya no está en la lista de jugadores se fue
    net.on('players', (list) => {
      if (this.host) return;
      const ids = new Set(list.map((p) => p.id));
      for (const [id, r] of [...this.remote]) {
        if (ids.has(id)) continue;
        this.gone ||= new Set();
        this.gone.add(id);
        this.remote.delete(id);
        this.avatars.remove(id);
        g.hud.subtitle(`${r.name || 'Un jugador'} se fue de la partida.`, 3);
      }
    });
    net.on('hostgone', () => {
      if (net.closed || this.lost) return;
      this.lost = true;
      g.onHostGone();
    });
    net.on('pts', (m) => g.addPoints(m.v, null, true));
    // la tabla de puntos: la plata de un invitado, y la tabla que reparte el anfitrión
    net.on('score', (m, from) => {
      if (!this.host) return;
      this.score.set(from, Math.max(0, m.p | 0));
      if (m.e != null) this.earned.set(from, Math.max(0, m.e | 0));
    });
    net.on('board', (m) => {
      if (!this.host && Array.isArray(m.l)) this.table = m.l.slice(0, 8);
    });
    // ping: el invitado contesta enseguida y el anfitrión mide la vuelta
    net.on('ping', (m) => {
      if (!this.host) net.send({ t: 'pong', s: m.s });
    });
    net.on('pong', (m, from) => {
      if (!this.host) return;
      const rtt = performance.now() - m.s;
      if (!(rtt >= 0 && rtt < 10000)) return;
      const prev = this.pings.get(from);
      this.pings.set(from, prev == null ? rtt : prev * 0.6 + rtt * 0.4);
    });
    // los últimos zombies de la ronda (los marca el anfitrión: entities/LastZombies)
    net.on('lastz', (m) => {
      if (!this.host) g.lastZ?.setRemote(m.ids);
    });
    // un invitado terminó de cargar el mapa (pantalla de carga)
    net.on('loaded', (m, from) => {
      if (this.host) g.arrival?.onLoaded(from);
    });
    // plata que te convida un compañero (el anfitrión la pasa si no es para él)
    // un invitado agarró su Mate de Oro
    net.on('oro', (m, from) => {
      if (this.host) g.ee.gotOro?.(from);
    });
    // la granja: un invitado cortó una planta de yerba con la hoz
    net.on('harvest', (m, from) => {
      if (this.host) g.ee.harvest?.(m.i, from);
    });
    // el ritual del Pack-a-Pava terminó: tu hoz sale convertida
    net.on('hozup', () => {
      g.ee.receiveHoz?.();
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
    // un invitado hizo algo del paso previo del Pack-a-Pava (bajó una pavita)
    net.on('papq', (m, from) => {
      if (this.host) g.papq?.onGuest(m, from);
    });
    net.on('hurt', (m) => g.player.damage(m.a, tmpV.set(m.x, 1, m.z)));
    // el penal: un invitado dejó (o se llevó) su bombilla en el encierro o en la silla
    net.on('pee', (m, from) => {
      if (this.host) g.ee.onGuest?.(m, from);
    });
    // gaucho life: un invitado le pegó con el rayo a algo del mapa
    net.on('vidahit', (m) => {
      if (this.host) g.vida?.remoteHit(m.i);
    });
    // lo que manda un invitado para que lo vean todos (el anfitrión lo reparte)
    net.on('share', (m, from) => {
      if (!this.host) return;
      this.applyEvent(m);
      net.broadcast({ ...m, t: 'ev' }, from);
    });
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
      g.powerups.apply(type, m.id, from);
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
    // el que llega recibe la tabla de puntos aunque no haya cambiado nada
    this.boardKey = null;
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
      locks: g.interact.list.filter((it) => it.locked).map((it) => it.index),
      weather: g.weather.name,
      arena: g.arena.active,
      ee: g.ee.fullState(),
      papq: g.papq?.fullState(),
      shield: g.activities.shieldBuilt,
      parts: Object.values(g.activities.parts || {}).filter((p) => p.taken).map((p) => p.def.id),
      lmparts: Object.values(g.curandero?.parts || {}).filter((p) => p.taken).map((p) => p.def.id),
      // (con la altura: en los mapas con pisos, la torre, se aparece en el mismo piso)
      start: [g.player.pos.x, g.player.pos.z, g.player.pos.y],
      // los potenciadores que ya están tirados
      pups: g.powerups.items.map((it) => ({ id: it.id, type: it.type, x: +it.pos.x.toFixed(2), y: +it.pos.y.toFixed(2), z: +it.pos.z.toFixed(2) })),
      map: g.mapId,
      mode: g.mode,
      // las tablas que le quedan a cada ventana
      boards: (g.barriers.windows || []).map((_, i) => g.barriers.count(i)),
      // el penal: qué máquinas ya tienen la corriente del gaucho life
      shock: g.vida ? [...g.interact.perkMachines.filter((m) => m.powered).map((m) => m.perk), ...(g.interact.pap?.powered ? ['pap'] : [])] : [],
    });
  }

  applyFullState(m) {
    const g = this.g;
    this.id = m.id;
    this.net.id = m.id;
    // primero se arma la partida (si hace falta) y después se le aplica el mundo
    if (m.restart || (m.playing && g.state !== 'playing' && g.state !== 'paused')) {
      g.menus.show(null);
      g.startAsGuest(m.map, m.mode);
    } else if (m.map && (m.map !== g.mapId || (m.mode && m.mode !== g.mode)) && g.state === 'title') {
      // todavía en la sala: se arma el mapa del anfitrión para que esté listo
      g.setMap(m.map, { save: false, mode: m.mode });
    }
    if (m.power && !g.world.power) g.turnOnPower();
    m.doors.forEach((open, i) => {
      if (open && !g.world.doorOpen[i]) g.interact.openDoor(g.interact.list.find((it) => it.kind === 'door' && it.door.index === i).door);
    });
    for (const z of m.zones) g.activeZones.add(z);
    g.interact.placeBox(m.box.spot);
    for (const i of m.locks || []) if (g.interact.list[i]) g.interact.lock(g.interact.list[i], true);
    g.weather.set(m.weather, false);
    g.rounds.round = m.round;
    g.hud.setRound(m.round);
    if (m.shield) g.activities.shieldBuilt = true;
    for (const id of m.parts || []) g.activities.takePart(id, true);
    for (const id of m.lmparts || []) g.curandero?.takePart(id, true);
    if (m.boards) g.barriers.applyAll(m.boards);
    if (m.ee) g.ee.applyRemote(m.ee);
    if (m.papq) g.papq?.applyRemote(m.papq, true);
    for (const id of m.shock || []) {
      const mch = id === 'pap' ? g.interact.pap : g.interact.perkMachines.find((x) => x.perk === id);
      if (mch) g.interact.powerMachine(mch, true);
    }
    // aparecer cerca del anfitrión (en una partida nueva, cada uno en su lugar)
    if (!m.restart) g.player.pos.set(m.start[0], g.world.floorAt(m.start[0], m.start[1], (m.start[2] ?? 0) + 0.5), m.start[1]);
    for (const pu of m.pups || []) if (!g.powerups.items.some((x) => x.id === pu.id)) g.powerups.applyRemote(pu);
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
      zp: info.zap ? 1 : undefined,
      dc: info.decap ? 1 : 0,
      // (un potenciador especial: el anfitrión le baja el daño a los jefes)
      pu: info.pup || undefined,
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
      zap: !!m.zp,
      decap: !!m.dc,
      pup: m.pu,
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
    if (id === CROW_ID) return this.g.crow?.z.active ? this.g.crow.z : null;
    if (id === STAKE_ID) return this.g.zombies.moves?.bound ? this.g.zombies.moves.stakeZ : null;
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
    // (con el candado del minijefe no anda para nadie)
    if (it.locked) return reply(false);
    const kind = it.kind;
    if (kind === 'pap') {
      // el mate del invitado entra a la máquina
      const pap = g.interact.pap;
      // su mate ya mejorado: lo saca de la máquina (free: ya pagó al meterlo)
      if (pap.state === 'ready' && pap.entry?.remote === from && !pap.entry.auto) {
        const w = pap.entry.id;
        const up = pap.tier;
        g.interact.clearPap();
        this.event('pap', { s: 'idle' });
        return reply(true, { w, up, free: 1 });
      }
      const tier = (m.up | 0) + 1;
      if (!m.w || pap.state !== 'idle' || tier > maxTier(m.w)) return reply(false);
      const res = g.interact.startPapFor(m.w, from, tier);
      if (!res) return reply(false);
      // la hoz entra al ritual: vuelve cuando termina (llega con 'hozup')
      if (res === 'ritual') return reply(true, { ritual: 1 });
      // el mate entra a la máquina: sale mejorado cuando termina y lo saca él
      // (antes le llegaba al toque, sin esperar)
      return reply(true, { pin: m.w });
    }
    // la caja, o una de las de la liquidación (cada una anda por su cuenta)
    if (kind === 'box' || kind === 'salebox') {
      const sale = kind === 'salebox';
      const box = sale ? g.interact.saleBoxes[it.saleIndex] : g.interact.box;
      if (!box || (sale && !box.group.visible)) return reply(false);
      if (box.state === 'closed') {
        g.interact.openBox(box);
        box.taker = from;
        return reply(true, { open: true });
      }
      if (box.state === 'offer') {
        const w = box.offer;
        g.interact.takeBoxWeapon(box);
        // (free: el aviso de que se cierra llega antes y le cobraba la caja de nuevo)
        return reply(true, { w, free: 1 });
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
      const on = g.interact.shockPower ? mach.powered : g.world.power || mach.perk === 'revive';
      if (mach.gone || !on) return reply(false);
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
      // el Mate de la Luz Mala: uno solo a la vez (lo decide el anfitrión)
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
    // (useFrom: quién lo pidió, para lo del easter egg que es de cada uno)
    this.useFrom = from;
    const ok = it.use();
    this.useFrom = null;
    return reply(ok !== false);
  }

  applyUseResult(m) {
    const g = this.g;
    if (!m.ok) {
      g.audio.deny();
      return;
    }
    const it = g.interact.list[m.i];
    const cost = it && !m.free ? it.cost() : 0;
    if (m.board != null) {
      if (m.board) g.addPoints(10, null, false, 'board');
      return;
    }
    if (cost > 0) g.spend(cost);
    else g.audio.purchase();
    if (m.ritual) g.ee.papGiven?.();
    // su mate quedó en el Pack-a-Pava (y el regalo de las ánimas, si lo tenía, se gastó)
    if (m.pin) {
      // (el que metió, aunque justo haya cambiado de mate)
      const W = g.weapons;
      const k = W.slots.findIndex((s) => s.id === m.pin);
      if (k >= 0) W.cur = k;
      W.take();
      if (g.activities) g.activities.freePap = false;
    }
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

  // Algo de un jugador que tienen que ver todos (el invitado se lo pasa al anfitrión).
  share(name, data = {}) {
    if (this.host) this.event(name, data);
    else this.net.send({ t: 'share', e: name, ...data });
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
      case 'vida':
        g.vida?.applyRemote(m);
        break;
      case 'pee':
        g.ee.applyRemote?.(m);
        break;
      // el Farol de las Ánimas o el Admin Mate de otro jugador (se ve; los jefes, al anfitrión)
      case 'pot':
        g.weapons?.pot?.ghostMsg(m);
        break;
      // el tiro de un mate de la luz de otro jugador (solo se ve)
      case 'elem':
        g.weapons?.elem?.ghost(m);
        break;
      // la Piedra de Molino o el Mate Dragón de otro jugador (solo se ve)
      case 'esp':
        g.weapons?.esp?.ghost(m);
        break;
      // la Liquidificador: la bola de otro jugador (solo se ve), el agua que
      // hace hervir y los muertos que se cocinan en el agua del anfitrión
      case 'liq':
        g.weapons?.liq?.ghost(m);
        break;
      // la Supernova de otro jugador (el Challenge de la torre): el rayo o el Big Bang (solo se ve)
      case 'nova':
        g.weapons?.nova?.ghost(m);
        break;
      // el Aliento Dragónico de otro jugador (solo se ve: el daño lo reporta él)
      case 'drag':
        if (m.id !== this.id && m.p) dragonBreath(g, new THREE.Vector3().fromArray(m.p), false);
        break;
      // la descarga de Electric Cherry de otro jugador (solo se ve: el daño lo reporta él)
      case 'cherry':
        if (m.id !== this.id && m.p) cherryShock(g, new THREE.Vector3().fromArray(m.p), Math.max(0, Math.min(1, +m.k || 0)), false);
        break;
      // el tajo o el rayo del Facón Relámpago de otro jugador (solo se ve)
      case 'facon':
        g.weapons?.facon?.ghost(m);
        break;
      case 'bolt':
        g.vida?.bolt(tmpV.fromArray(m.a).clone(), new THREE.Vector3().fromArray(m.b));
        break;
      case 'shockm': {
        const I = g.interact;
        const mch = m.p === 'pap' ? I.pap : I.perkMachines.find((x) => x.perk === m.p);
        if (mch) I.powerMachine(mch, true);
        break;
      }
      case 'round':
        g.rounds.applyRemote(m);
        break;
      case 'box':
        g.interact.applyRemoteBox(m);
        break;
      // el mate que tiene en la mano un compañero (net/Avatars lo dibuja)
      case 'wpn':
        if (m.id !== this.id) this.wpn.set(m.id, { w: m.w || '', u: m.u | 0 });
        break;
      // los candados de los minijefes (los pone el anfitrión, los saca cualquiera)
      case 'lock': {
        const it = g.interact.list[m.i];
        if (it && this.guest) g.interact.lock(it);
        break;
      }
      case 'unlock': {
        const it = g.interact.list[m.i];
        if (it) g.interact.unlock(it);
        break;
      }
      case 'pap':
        g.interact.applyRemotePap(m);
        break;
      case 'papq':
        g.papq?.applyRemote(m);
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
        // pantalla de carga: se arma el mapa y se espera a los demás
        if (g.state !== 'playing' && g.state !== 'arriving') g.arriveAsGuest(m.map, m.mode);
        break;
      case 'arrive':
        g.arrival?.setReady(m.ids);
        break;
      case 'go':
        g.arrival?.remoteGo();
        break;
      // la cinemática de entrada: un voto para saltearla o el fin (ui/Intro)
      case 'intro':
        g.intro?.applyRemote(m);
        break;
      case 'map':
        if (g.state === 'title') g.setMap(m.id, { save: false, mode: m.mode });
        break;
      case 'feather':
        g.crow?.spawnFeathers(new THREE.Vector3(m.x, m.y, m.z), m.v);
        break;
      // lo nuevo de los jefes (entities/bossMoves.js)
      case 'bfx':
        g.zombies.moves?.onNet(m);
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
    this.g.hud.setNet(null);
    this.net.close();
  }
}

export const STATES = ['approach', 'tear', 'climb', 'chase', 'attack', 'rise', 'dead', 'frozen', 'shocked', 'flung', 'intro', 'slam', 'toLock', 'locking', 'burnrun', 'drop', 'dogspawn', 'whipWind', 'whip', 'chargeWind', 'charge', 'stunned', 'enrage', 'summon', 'stairs', 'fall', 'boat', 'boatHit', 'howl', 'melting', 'aim', 'shoot', 'burrow', 'emerge'];
export const SPEEDS = ['walk', 'run', 'sprint'];
