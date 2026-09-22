import { zombieCount, zombieHealth, spawnDelay, bossRound, maxAlive, ROUND_BREAK } from '../config/rules';
import { GRENADE } from '../config/weapons';

// Sistema de rondas de BO1: cuántos zombies, con cuánta vida, cada cuánto
// aparecen, pausa entre rondas y el Capataz cada 5 rondas.

export default class Rounds {
  constructor(game) {
    this.g = game;
    this.round = 0;
    this.state = 'idle';
  }

  start() {
    this.round = 0;
    this.state = 'break';
    this.breakT = 3;
    this.players = 1;
  }

  // Ronda que llega del anfitrión (modo invitado).
  applyRemote(m) {
    const g = this.g;
    this.round = m.n;
    this.state = 'remote';
    g.stats.round = m.n;
    if (m.phase === 'active') {
      g.hud.setRound(m.n, true);
      g.audio.roundStart();
      if (!g.player.alive) g.player.respawn();
    } else {
      g.audio.roundEnd();
      g.hud.roundEnd(m.n);
    }
  }

  nextRound() {
    const g = this.g;
    this.round++;
    const players = this.players || 1;
    this.total = zombieCount(this.round, players);
    this.toSpawn = this.total;
    this.health = zombieHealth(this.round);
    this.delay = spawnDelay(this.round);
    this.spawnT = this.round === 1 ? 1 : 2.5;
    this.bossPending = bossRound(this.round);
    this.state = 'active';
    g.hud.setRound(this.round, true);
    g.audio.roundStart();
    if (this.round > 1) {
      g.weapons.grenades = Math.min(GRENADE.max, g.weapons.grenades + GRENADE.perRound);
      g.weapons.updateHud();
    }
    g.powerups.newRound();
    g.weather?.onRound(this.round);
    g.stats.round = this.round;
    g.net?.event('round', { n: this.round, phase: 'active' });
    // los que cayeron vuelven al empezar la ronda
    if (g.net && !g.player.alive) g.player.respawn();
  }

  remainingTotal() {
    return (this.toSpawn || 0) + this.g.zombies.alive;
  }

  // Hoy la ronda termina cuando no quedan zombies; se deja el gancho por si hace falta.
  onKill() {}

  // Un zombie trabado o perdido vuelve a la cola.
  requeue(n) {
    this.toSpawn += n;
  }

  update(dt) {
    const g = this.g;
    if (this.state === 'remote') return;
    if (this.state === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) this.nextRound();
      return;
    }
    if (this.state !== 'active') return;
    this.spawnT -= dt;
    if (this.toSpawn > 0 && this.spawnT <= 0 && g.zombies.alive < maxAlive(this.players || 1)) {
      if (g.zombies.spawn(this.round, this.health)) {
        this.toSpawn--;
        this.spawnT = this.delay;
      } else this.spawnT = 0.5;
    }
    if (this.bossPending && this.total - this.toSpawn >= this.total * 0.4) {
      this.bossPending = false;
      g.zombies.spawnBoss(this.round);
    }
    if (this.toSpawn <= 0 && g.zombies.alive === 0) this.endRound();
  }

  endRound() {
    const g = this.g;
    this.state = 'break';
    this.breakT = ROUND_BREAK;
    g.audio.roundEnd();
    g.hud.roundEnd(this.round);
    g.net?.event('round', { n: this.round, phase: 'break' });
  }
}
