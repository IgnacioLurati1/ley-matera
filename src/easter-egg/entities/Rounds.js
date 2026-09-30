import { zombieCount, zombieHealth, spawnDelay, bossRound, maxAlive, dogRound, dogCount, ROUND_BREAK } from '../config/rules';
import { GRENADE } from '../config/weapons';
import { FEATURES, WATER_Y } from '../config/map';

// La creciente del estero (Mate no Numa): cada 10 rondas el agua sube tanto
// que hay que nadar en casi todos lados; la horda sale del agua y con ella
// los yacarés. Al terminar la ronda, baja.
const FLOOD_EVERY = 10;
// cuánto sube el agua con la creciente: con 1.6 casi todo quedaba a la
// cintura (se vadeaba, no se nadaba); con 2.6 se nada y se bucea en todo el
// estero bajo y quedan secos solo los altos (casas, mangrullo, tapera)
const FLOOD_RISE = 2.6;

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
    this.lastBoss = 0;
    this.flood = false;
    this.state = 'break';
    this.breakT = 3;
    this.players = 1;
    // los grabados del mapa (sus bichos y su especial de fondo)
    this.g.audio.pack?.sync();
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
      if (m.flood && !this.flood) {
        this.flood = true;
        this.floodStart();
      }
      g.hud.setRound(m.n, true);
      g.audio.roundStart(m.n);
      if (m.amb) this.ambient(m.amb, m.ambT);
      if (!g.player.alive) g.player.respawn();
    } else {
      g.audio.roundEnd(m.n);
      g.hud.roundEnd(m.n);
      g.levels?.round(m.n);
      if (this.flood) {
        this.flood = false;
        this.floodEnd();
      }
    }
  }

  // Sube el agua (lo mismo en el anfitrión y en los invitados: fx/Water.js la anima).
  floodStart() {
    const g = this.g;
    g.water?.setLevel((WATER_Y ?? 0) + FLOOD_RISE, 6);
    // la alarma grabada de la creciente (sin bajar, el golpe de siempre)
    g.audio.bossSfx('creciente');
    // después de la canción de la ronda se oyen los yacarés que se acercan (y
    // recién ahí salen: specialT)
    g.later(this.introAt(), () => {
      if (!g.audio.pack?.intro('yacare')) g.zombies.dogRig.voice?.({ pos: g.player.pos, baseY: g.player.pos.y + 4 }, 'growl');
    });
    g.ee?.onFlood?.(true);
  }

  floodEnd() {
    const g = this.g;
    g.water?.setLevel(WATER_Y ?? 0, 8);
    g.hud.subtitle('Baja el agua... por ahora.', 3);
    g.ee?.onFlood?.(false);
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
    this.bossPending = FEATURES.boss === 'alcaide' ? this.alcaideRound() : bossRound(this.round, FEATURES.bossFrom);
    // el penal no tiene ronda especial (como Mob of the Dead); la torre los mezcla en cada ronda
    // (el estero no tiene ronda de manada: los yacarés vienen con la creciente)
    const yac = FEATURES.special === 'yacare';
    this.dogs = FEATURES.special && FEATURES.special !== 'mixed' && !yac ? dogRound(this.round) : false;
    // la torre: desde la ronda 5, bichos especiales de todos los mapas entre los muertos
    // (cada 5 rondas, más), y en las múltiplos de 5 uno o dos jefes de otros mapas
    this.specials = FEATURES.special === 'mixed' && this.round >= 5 ? Math.floor(Math.floor(this.round / 5) * (1 + (players - 1) * 0.5) * 1.5) : 0;
    // el estero: en la creciente, yacarés entre los muertos (más con más jugadores);
    // desde la ronda 12, alguno suelto en la laguna
    // (y el easter egg puede pedir una: la voz hace subir el agua la noche siguiente)
    // (en la pelea final del easter egg, holding, no crece: EsterosEgg.calmFlood)
    this.flood = yac && !g.ee?.holding && (this.round % FLOOD_EVERY === 0 || !!g.ee?.takeFlood?.());
    if (yac) this.specials = this.flood ? 4 + (players - 1) * 2 + Math.floor(this.round / FLOOD_EVERY) * 2 : this.round >= 12 ? Math.min(4, 1 + Math.floor((this.round - 12) / 5)) : 0;
    // (en la creciente los yacarés salen después de que se los oye llegar)
    this.specialT = this.flood ? this.introAt() + (g.audio.pack?.introSpawn('yacare') ?? 3) : 0;
    // (la creciente ya es la ronda especial: ese día el jefe no viene)
    if (this.flood) this.bossPending = false;
    // el Challenge de la torre: más, más seguido, especiales y jefes (entities/TowerChallenge.js)
    this.capBonus = 0;
    this.bothFrom = 15;
    g.ee?.tuneRound?.(this);
    this.specFail = 0;
    if (this.dogs) {
      // ronda de carpinchos: menos bichos, más rápidos, con niebla y relámpagos
      this.total = dogCount(this.round, players);
      this.toSpawn = this.total;
      this.health = Math.max(150, Math.floor(zombieHealth(this.round) * 0.45));
      this.delay = Math.max(0.9, spawnDelay(this.round) * 1.5 + 0.7);
      // salen después de la canción de la ronda y de su llegada (dogIntro)
      this.spawnT = this.introAt() + (g.audio.pack?.introSpawn(FEATURES.special) ?? 1.5);
      this.bossPending = false;
    }
    // la granja: rebrotan las parcelas y, cada 10 rondas, la defensa del yerbal
    g.defense?.onRound(this);
    this.state = 'active';
    g.hud.setRound(this.round, true);
    g.audio.roundStart(this.round);
    if (this.round > 1) {
      g.weapons.grenades = Math.min(GRENADE.max, g.weapons.grenades + GRENADE.perRound);
      g.weapons.updateHud();
    }
    g.powerups.newRound();
    g.vida?.onRound(this.round);
    g.luz?.onRound(this.round);
    g.weather?.onRound(this.round);
    g.weather?.setRoundSky(this.round);
    if (this.dogs) {
      g.weather?.set('dogs', false);
      this.dogIntro();
    }
    if (this.flood) this.floodStart();
    // cada tanto, el especial del mapa de fondo (no en las rondas especiales)
    const amb = this.dogs || this.flood ? 0 : g.audio.pack?.rollSpecial(this.round) || 0;
    const ambT = this.introAt() + Math.random() * 2.5;
    if (amb) this.ambient(amb, ambT);
    g.stats.round = this.round;
    g.net?.event('round', { n: this.round, phase: 'active', dogs: this.dogs ? 1 : 0, flood: this.flood ? 1 : 0, amb, ambT: +ambT.toFixed(2) });
    // los que cayeron vuelven al empezar la ronda
    if (g.net && !g.player.alive) g.player.respawn();
  }

  // La torre: el Capataz, el Alcaide o el Cuervo; desde la ronda 15, un jefe
  // de a pie y el Cuervo juntos.
  mixedBoss() {
    const g = this.g;
    const both = this.round >= (this.bothFrom || 15);
    const ground = Math.random() < 0.5 ? 'capataz' : 'alcaide';
    const crow = both || Math.random() < 0.34;
    if (!crow || both) {
      if (!g.zombies.boss) g.zombies.spawnBoss(this.round, { kind: ground });
    }
    if (crow) g.crow?.spawn(this.round);
  }

  // El alcaide del penal: desde la ronda 4, cada 3 a 5 rondas (no es fijo).
  alcaideRound() {
    const r = this.round;
    if (r < 4) return false;
    const since = r - (this.lastBoss || 0);
    const go = since >= 5 || (since >= 3 && Math.random() < 0.55);
    if (go) this.lastBoss = r;
    return go;
  }

  remainingTotal() {
    return (this.toSpawn || 0) + this.g.zombies.alive;
  }

  // Cuándo suena la llegada de la ronda especial: unos segundos después de la
  // canción de la ronda (core/sfxPack.js sabe cuánto dura la de cada mapa).
  introAt() {
    return this.g.audio.pack?.introAt(this.round) ?? 1.5;
  }

  // La llegada de la ronda especial (en el anfitrión y en los invitados): el
  // aviso y el sonido de los bichos que vienen, después de la canción; ahí
  // empiezan a salir (nextRound: spawnT).
  dogIntro() {
    const g = this.g;
    const sp = FEATURES.special;
    g.later(this.introAt(), () => {
      if (g.state !== 'playing') return;
      if (g.audio.pack?.intro(sp === 'puma' || sp === 'horse' ? sp : 'capybara', g.player.pos)) return;
      // (sin los grabados: los de siempre, sintetizados)
      if (sp === 'puma') {
        for (const k of [0, 1.3, 2.5]) g.later(k, () => g.zombies.dogRig.voice?.({ pos: g.player.pos, baseY: g.player.pos.y + 6 }, 'cry'));
      } else if (sp === 'horse') {
        g.audio.neigh(null, 1.2);
        g.later(1.2, () => g.audio.gallop?.());
      } else {
        g.audio.howl(null);
        g.later(1.1, () => g.audio.howl(null));
      }
    });
  }

  // El especial de fondo del mapa (k: cuál, de sfxPack.rollSpecial), a los `at` segundos.
  ambient(k, at) {
    this.g.audio.pack?.special(k, at || 0);
  }

  // Dónde cayó el último perro: ahí queda la munición de premio.
  onKill(z) {
    if (z?.dog) this.lastDogPos = z.pos.clone();
  }

  // El Kaboom: por `secs` segundos no sale nadie de la ronda (entities/Zombies.js nuke).
  holdSpawns(secs) {
    this.spawnT = Math.max(this.spawnT || 0, secs);
  }

  // Un zombie trabado o perdido vuelve a la cola.
  requeue(n) {
    this.toSpawn += n;
  }

  update(dt) {
    const g = this.g;
    // terminada la partida no aparecen más ni arranca otra ronda
    if (this.state === 'remote' || g.state !== 'playing') return;
    // la pelea final del estero (el Luisón): los muertos no se acaban (con
    // tope, que el estero ya es enredado) y la ronda no pasa hasta que cae
    const hold = !!g.ee?.holding;
    if (this.state === 'break') {
      // (si la pelea empieza en el descanso, sigue la misma ronda)
      if (hold && this.health) {
        this.state = 'active';
        this.spawnT = 2;
        return;
      }
      this.breakT -= dt;
      if (this.breakT <= 0) this.nextRound();
      return;
    }
    if (this.state !== 'active') return;
    this.spawnT -= dt;
    if (this.specialT > 0) this.specialT -= dt;
    if (hold) {
      this.toSpawn = Math.max(this.toSpawn, 1);
      this.bossPending = false;
    }
    const players = this.players || 1;
    const cap = this.dogs ? 3 + players * 2 : hold ? Math.min(maxAlive(players), 16 + (players - 1) * 4) : maxAlive(players) + (this.capBonus || 0);
    if (this.toSpawn > 0 && this.spawnT <= 0 && g.zombies.alive < cap) {
      // en la torre, cada tanto sale un especial en vez de un muerto
      const special = this.specials > 0 && !(this.specialT > 0) && Math.random() < Math.min(0.5, (this.specials * 1.4) / this.toSpawn);
      if (special) {
        // (la torre mezcla caballos y carpinchos; el estero, yacarés; el
        // Challenge inundado, yacarés: g.ee.specialKind)
        const kind = FEATURES.special === 'mixed' ? g.ee?.specialKind?.() || (Math.random() < 0.5 ? 'horse' : 'dog') : null;
        if (g.zombies.spawnDog(Math.max(150, Math.floor(this.health * (kind && kind !== 'yacare' ? 0.45 : 0.6))), kind)) {
          this.specials--;
          this.toSpawn--;
          this.spawnT = this.delay;
        } else {
          this.spawnT = 0.5;
          // sin lugar para el especial (el yacaré necesita agua cerca): sale un muerto
          if (++this.specFail > 8) {
            this.specials--;
            this.specFail = 0;
          }
        }
      } else if (this.dogs ? g.zombies.spawnDog(this.health) : g.zombies.spawn(this.round, this.health)) {
        this.toSpawn--;
        this.spawnT = this.delay;
      } else this.spawnT = 0.5;
    }
    if (this.bossPending && this.total - this.toSpawn >= this.total * 0.4) {
      this.bossPending = false;
      // el jefe de cada mapa: el Capataz o el Cuervo (la torre elige de todos)
      // (el minijefe queda anotado: la ronda no pasa mientras siga vivo)
      if (FEATURES.boss === 'mixed') this.mixedBoss();
      else if (g.crow) {
        if (g.crow.spawn(this.round)) this.mini = 'crow';
      } else {
        const before = g.zombies.boss;
        const b = g.zombies.spawnBoss(this.round);
        if (b && b !== before) this.mini = b;
      }
    }
    // la torre (normal y Challenge): la ronda sigue apenas salieron todos (los
    // que quedan vivos siguen jodiendo, jefes incluidos); en los demás mapas
    // espera a que caigan todos y el minijefe de la ronda
    // (la defensa del yerbal espera también al Cuervo)
    if (this.toSpawn <= 0 && (FEATURES.tower || (g.zombies.alive === 0 && !this.miniAlive())) && !g.defense?.holding && !hold) this.endRound();
  }

  // ¿Sigue vivo el minijefe de la ronda (el Capataz, el Cuervo, el Alcaide...)?
  miniAlive() {
    const m = this.mini;
    if (!m) return false;
    const g = this.g;
    const alive = m === 'crow' ? !!g.crow?.z.active && !g.crow.z.dead : g.zombies.boss === m && !m.dead;
    if (!alive) this.mini = null;
    return alive;
  }

  endRound() {
    const g = this.g;
    if (this.flood) {
      this.flood = false;
      this.floodEnd();
    }
    if (this.dogs) {
      // como en el original: el último carpincho deja munición completa
      this.dogs = false;
      g.powerups.drop(this.lastDogPos || g.player.pos.clone(), true, 'maxammo');
      g.weather?.set('clear', false);
      const bye = { horse: 'La tropilla se perdió en el maizal... por ahora.', puma: 'Los pumas se volvieron a la montaña... por ahora.' };
      g.hud.subtitle(bye[FEATURES.special] || 'La manada se volvió al estero... por ahora.', 3);
    }
    this.state = 'break';
    g.defense?.onRoundEnd();
    // en la torre casi no hay respiro: los que quedaron siguen ahí
    this.breakT = FEATURES.tower ? 4 : ROUND_BREAK;
    g.audio.roundEnd(this.round);
    g.hud.roundEnd(this.round);
    g.levels?.round(this.round);
    g.net?.event('round', { n: this.round, phase: 'break' });
  }
}
