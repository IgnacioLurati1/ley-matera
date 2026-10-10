import { ZONES } from '../../config/map';
import { SPEEDS } from '../../config/rules';
import { isHost } from './common';
import { hasCatal } from './catalizador';

// La Disformidad aprieta (iteración 4; el usuario: "quiero que esté en esa
// dimensión que sea hostil entrar"). El Pack-a-Pava vive allá adentro y cada
// visita cuesta, pero es justa:
//  - Cada jugador, en su compu: adentro la vida no se regenera; después de
//    unos segundos la dimensión te chupa la vida de a poco hasta un piso (nunca
//    te tira: eso lo hacen los muertos). Cada muerto que cae cerca tuyo te
//    devuelve un poco. Un velo violeta se cierra desde los bordes con lo que te
//    falta y late el corazón.
//  - El anfitrión: los deformes (Zombies.deformIf) aguantan más y no caminan:
//    corren; mientras haya alguien adentro, la ronda aprieta (salen más seguido).
// Nada se arma en plena partida: el velo es un div armado al cargar.
// globalThis.__mduNoDisfHostil === true: la Disformidad como antes.

const GRACE = 6;          // segundos antes de que empiece a chupar
const DRAIN = 3.2;        // vida por segundo
const FLOOR = 0.35;       // hasta qué parte de la vida máxima
const REFUND = 7;         // vida por muerto que cae cerca
const REFUND_R = 11;
const HP_K = 1.5;         // los deformes aguantan más
const RUN_FROM = 3;       // desde la ronda 3 los deformes corren

export default class Disformidad {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.inside = false;
    this.inT = 0;
    this.k = 0;
    this.beatT = 0;
    this.checkT = 0;
    this.told = false;
    this.dead = new Set();
    this.anyIn = false;
    // el velo: un div fijo, solo opacidad (lo compone la placa, sin rasterizar)
    const d = document.createElement('div');
    d.className = 'mdu-ecl-disf';
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0;will-change:opacity;background:radial-gradient(ellipse at 50% 50%, rgba(20,0,40,0) 38%, rgba(40,6,80,0.55) 72%, rgba(8,0,18,0.92) 100%);';
    (this.g.hud?.root || document.body).prepend(d);
    this.veil = d;
  }

  off() {
    return globalThis.__mduNoDisfHostil === true;
  }

  isDim(p) {
    const k = this.g.world.zoneAt?.(p.x, p.z, p.y);
    // (2026-10-10: los jirones de las grietas, `grieta` en el config, no castigan)
    return !!(k && ZONES[k]?.dim && !ZONES[k].grieta);
  }

  // ¿un jirón de las grietas? (los deformes de ahí no aguantan más ni corren de más)
  isRift(p, y) {
    const k = this.g.world.zoneAt?.(p.x, p.z, y ?? p.y);
    return !!(k && ZONES[k]?.grieta);
  }

  update(dt) {
    const g = this.g;
    const P = g.player;
    const playing = g.state === 'playing' && !g.ee?.scene && !g.intro?.active;
    if (this.off() || !playing || !P) {
      this.setVeil(0);
      return;
    }
    // ¿adentro? (cada 0,25 s alcanza)
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      this.inside = !P.downed && this.isDim(P.pos);
      let any = this.inside;
      if (!any && g.net?.remote) for (const o of g.net.remote.values()) if (o.pos && !o.downed && this.isDim(o.pos)) any = true;
      this.anyIn = any;
    }
    // (el Catalizador Caótico, entities/eclipse/catalizador.js: adentro no te
    // hace nada; lo del anfitrión, abajo, sigue igual)
    const immune = this.inside && hasCatal(g);
    if (immune) {
      this.inT = 0;
      this.k += (0 - this.k) * Math.min(1, dt * 1.5);
      this.dead.clear();
      if (!this.toldCat) {
        this.toldCat = true;
        g.hud?.subtitle?.('El Catalizador te cubre de la Disformidad.', 3);
      }
    } else if (this.inside) {
      // (al entrar: los que ya estaban tirados no cuentan)
      if (!this.inT) this.seed();
      this.inT += dt;
      if (!this.told && this.inT > 1.5) {
        this.told = true;
        g.hud?.subtitle?.('La Disformidad te chupa la vida. Matá para recuperarla.', 4);
      }
      // sin regenerar mientras estés adentro
      P.lastHit = g.time;
      const floor = P.maxHealth * FLOOR;
      if (this.inT > GRACE && P.health > floor && !g.godMode) P.health = Math.max(floor, P.health - DRAIN * dt);
      this.refund(P);
      // el velo: lo que te falta de vida, más un poco por estar adentro
      const miss = 1 - P.health / P.maxHealth;
      const target = Math.min(1, 0.25 + miss * 1.1) * Math.min(1, this.inT / 2);
      this.k += (target - this.k) * Math.min(1, dt * 2);
      // el corazón, cuando aprieta
      if (miss > 0.4) {
        this.beatT -= dt;
        if (this.beatT <= 0) {
          this.beatT = 1.1 - miss * 0.4;
          g.audio?.heartbeat?.();
        }
      }
    } else {
      this.inT = 0;
      this.k += (0 - this.k) * Math.min(1, dt * 1.5);
      this.dead.clear();
    }
    this.setVeil(this.k);
    if (isHost(g)) this.hostile();
  }

  // los muertos que caen cerca tuyo te devuelven vida (todas las compus ven caer
  // a los mismos: cada una mira su pool)
  refund(P) {
    const Z = this.g.zombies;
    if (!Z?.pool) return;
    for (const z of Z.pool) {
      if (!z.active) continue;
      if (!z.dead) {
        this.dead.delete(z);
        continue;
      }
      if (this.dead.has(z)) continue;
      this.dead.add(z);
      if (Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z) < REFUND_R && !P.downed) P.health = Math.min(P.maxHealth, P.health + REFUND);
    }
  }

  seed() {
    this.dead.clear();
    for (const z of this.g.zombies?.pool || []) if (z.active && z.dead) this.dead.add(z);
  }

  // (anfitrión) los deformes, más duros; la ronda aprieta con alguien adentro
  hostile() {
    const g = this.g;
    const Z = g.zombies;
    if (!Z?.pool) return;
    const round = g.rounds?.round || 1;
    for (const z of Z.pool) {
      if (!z.active || z.dead) {
        z.disfH = 0;
        continue;
      }
      if (!z.disforme || z.boss || z.disfH) continue;
      z.disfH = 1;
      if (this.isRift(z.pos, z.baseY)) continue;
      z.hp *= HP_K;
      if (z.maxHp) z.maxHp *= HP_K;
      if (round >= RUN_FROM && z.speed < SPEEDS.run) z.speed = SPEEDS.run * (0.9 + Math.random() * 0.15);
    }
    if (this.anyIn && g.rounds?.state === 'active') g.rounds.delay = Math.min(g.rounds.delay || 2, 1.0);
  }

  setVeil(k) {
    const v = k < 0.01 ? 0 : +k.toFixed(2);
    if (v === this.veilK) return;
    this.veilK = v;
    this.veil.style.opacity = String(v);
  }

  dispose() {
    this.veil.remove();
  }
}
