import { zombieCount, zombieHealth, spawnDelay, bossRound, maxAlive, dogRound, dogCount, ROUND_BREAK } from '../config/rules';
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
      g.weather?.setRoundSky(m.n);
      if (m.dogs) this.dogIntro();
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
    this.dogs = dogRound(this.round);
    if (this.dogs) {
      // ronda de carpinchos: menos bichos, más rápidos, con niebla y relámpagos
      this.total = dogCount(this.round, players);
      this.toSpawn = this.total;
      this.health = Math.max(150, Math.floor(zombieHealth(this.round) * 0.45));
      this.delay = Math.max(0.9, spawnDelay(this.round) * 1.5 + 0.7);
      this.spawnT = 4;
      this.bossPending = false;
    }
    this.state = 'active';
    g.hud.setRound(this.round, true);
    g.audio.roundStart();
    if (this.round > 1) {
      g.weapons.grenades = Math.min(GRENADE.max, g.weapons.grenades + GRENADE.perRound);
      g.weapons.updateHud();
    }
    g.powerups.newRound();
    g.weather?.onRound(this.round);
    g.weather?.setRoundSky(this.round);
    if (this.dogs) {
      g.weather?.set('dogs', false);
      this.dogIntro();
    }
    g.stats.round = this.round;
    g.net?.event('round', { n: this.round, phase: 'active', dogs: this.dogs ? 1 : 0 });
    // los que cayeron vuelven al empezar la ronda
    if (g.net && !g.player.alive) g.player.respawn();
  }

  remainingTotal() {
    return (this.toSpawn || 0) + this.g.zombies.alive;
  }

  dogIntro() {
    const g = this.g;
    g.hud.subtitle('¡Se viene la manada de carpinchos endemoniados!', 4, 'boss');
    g.later(1.5, () => g.audio.howl(null));
    g.later(2.6, () => g.audio.howl(null));
  }

  // Dónde cayó el último perro: ahí queda la munición de premio.
  onKill(z) {
    if (z?.dog) this.lastDogPos = z.pos.clone();
  }

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
    const cap = this.dogs ? 3 + (this.players || 1) * 2 : maxAlive(this.players || 1);
    if (this.toSpawn > 0 && this.spawnT <= 0 && g.zombies.alive < cap) {
      if (this.dogs ? g.zombies.spawnDog(this.health) : g.zombies.spawn(this.round, this.health)) {
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
    if (this.dogs) {
      // como en el original: el último carpincho deja munición completa
      this.dogs = false;
      g.powerups.drop(this.lastDogPos || g.player.pos.clone(), true, 'maxammo');
      g.weather?.set('clear', false);
      g.hud.subtitle('La manada se volvió al estero... por ahora.', 3);
    }
    this.state = 'break';
    this.breakT = ROUND_BREAK;
    g.audio.roundEnd();
    g.hud.roundEnd(this.round);
    g.net?.event('round', { n: this.round, phase: 'break' });
  }
}
