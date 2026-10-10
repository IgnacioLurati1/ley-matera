import * as THREE from 'three';
import { SPEEDS } from '../config/rules';
import { sndWindLoop, sndBell } from './towerKit';

// La Noche del Remolino: la ronda especial de la torre (modo historia), cada
// EVERY rondas. El remolino arrastra a los muertos: en vez de salir de los
// pozos, llegan volando desde afuera, entran por los arcos y caen al piso
// (entities/towerKit.js flyIn; se les puede tirar en el aire). Son menos y
// más flojos, pero corren. Las luces de la torre bajan, relampaguea y el
// viento no para. A mitad de la ronda llega el Cuervo (el de La Tapera), y
// cuando cae el último arrastrado deja munición completa.
// En línea: el anfitrión arma la ronda (Rounds → TowerEgg.tuneRound) y
// convierte a los muertos; a los invitados les llega 'pee' noche para el
// cartel, la luz y el viento (los muertos los ven volar por su estado).

const EVERY = 7;
// cuándo empiezan a llegar (después del cartel)
const INTRO = 4.5;
const DIM = 0.55;

const tmpV = new THREE.Vector3();

export default class TowerNoche {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.on = false;
    this.n = 0;
    this.dimK = 1;
    this.boltT = 3;
    this.snd = null;
  }

  // (anfitrión) Rounds.nextRound: ¿esta ronda es la Noche?
  tuneRound(R) {
    const g = this.g;
    const n = R.round;
    if (n < EVERY || n % EVERY || this.ee.fight || this.ee.step >= 8) return;
    R.total = Math.max(8, Math.round(R.total * 0.85));
    R.toSpawn = R.total;
    R.health = Math.max(150, Math.floor(R.health * 0.7));
    R.delay = Math.max(0.55, R.delay * 0.8);
    R.specials = 0;
    R.bossPending = false;
    R.spawnT = Math.max(R.spawnT || 0, INTRO);
    this.total = R.total;
    this.start(n);
    g.net?.event('pee', { noche: n });
  }

  start(n) {
    const g = this.g;
    this.on = true;
    this.n = n;
    this.crow = false;
    this.lastPos = null;
    this.left = 0;
    this.spawnedAll = false;
    g.hud.location('La Noche del Remolino', 'Los trae el viento');
    g.audio.sting();
    g.audio.thunder?.(g.player.pos.clone().setY(g.player.pos.y + 20), true);
    if (g.weather) g.weather.flash = 1;
    g.fx.addShake(0.5);
    // tres campanadas lejanas
    for (let k = 0; k < 3; k++) g.later(1.2 + k * 1.6, () => sndBell(g, null, 38, 0.45, 5));
    this.snd?.stop(0.3);
    this.snd = sndWindLoop(g, null, 0.32, { whistle: 1200 });
  }

  end(reward) {
    const g = this.g;
    if (!this.on) return;
    this.on = false;
    this.snd?.stop(3);
    this.snd = null;
    if (reward && !g.net?.guest) {
      g.powerups.drop(this.lastPos || g.player.pos.clone(), true, 'maxammo');
      g.net?.event('pee', { noche: -1 });
    }
  }

  applyRemote(m) {
    if (m.noche > 0) this.start(m.noche);
    else this.end(false);
  }

  onKill(z) {
    if (this.on && z.nocheId === z.id) this.lastPos = z.pos.clone().setY(z.baseY || 0);
  }

  update(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    // la luz de la torre: baja en la Noche (y vuelve)
    const want = this.on ? DIM : 1;
    if (this.on || this.dimK < 1) {
      this.dimK += (want - this.dimK) * Math.min(1, dt * 0.8);
      if (!this.on && this.dimK > 0.995) this.dimK = 1;
      this.T.dim = this.dimK;
      if (this.dimK === 1) this.T.dim = undefined;
    }
    if (!this.on) return;
    // relámpagos
    this.boltT -= dt;
    if (this.boltT <= 0) {
      this.boltT = 4 + Math.random() * 6;
      if (g.weather) g.weather.flash = 0.8 + Math.random() * 0.2;
      g.audio.thunder?.(g.player.pos.clone().setY(g.player.pos.y + 25), Math.random() < 0.3);
    }
    if (!host) return;
    const R = g.rounds;
    // los que salen de los pozos llegan volando
    let alive = 0;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      if (z.nocheId === z.id) {
        alive++;
        continue;
      }
      if (R.round !== this.n || z.state !== 'rise' || z.stateT > 0.4 || z.boss || z.dog) continue;
      z.nocheId = z.id;
      alive++;
      const land = tmpV.set(z.pos.x, z.baseY || 0, z.pos.z).clone();
      if (!this.ee.flyers.flyIn(z, land)) continue;
      z.speedType = Math.random() < 0.55 ? 'sprint' : 'run';
      z.speed = SPEEDS[z.speedType] * (0.95 + Math.random() * 0.1);
      z.runU = null;
    }
    // el Cuervo, a mitad de la Noche
    if (!this.crow && R.round === this.n && this.total && this.total - R.toSpawn >= this.total * 0.4) {
      this.crow = true;
      g.crow?.spawn(R.round);
    }
    if (R.round !== this.n || R.toSpawn <= 0) this.spawnedAll = true;
    // se termina cuando ya salieron todos y no queda ninguno de los arrastrados
    if (this.spawnedAll && alive === 0) this.end(true);
  }

  fullState() {
    return this.on ? this.n : 0;
  }

  dispose() {
    this.snd?.stop(0.2);
  }
}
