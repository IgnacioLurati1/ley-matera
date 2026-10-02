import { FEATURES } from '../config/map';
import Surubi from './monumento/Surubi';
import SableQuest from './monumento/SableQuest';
import Ascensor from './monumento/Ascensor';
import Tirolesa from './monumento/Tirolesa';

// Easter egg del Monumento al Mate: "La Primera Bandera" (corto). Los pasos:
//  0. La corriente y la Llama Votiva (el Pack-a-Pava, world/papLlama.js).
//  1. El Sable Corvo armado.
//  2. Las telas: la celeste del Mirador y la blanca de la niebla del muelle,
//     a la costurera (María Catalina Echevarría), que cose mientras se aguanta.
//  3. Las baterías: la Armada Realista y la Batería Independencia.
//  4. Izar la bandera en el mástil de la barranca: Belgrano a orillas del
//     Paraná (la cinemática no termina el mapa).
// En línea lo lleva el anfitrión (fullState / applyRemote).
// (Por ahora el esqueleto: el mapa se arma y se juega por rondas.)

export default class MonumentoEgg {
  constructor(game) {
    this.g = game;
    this.step = 0;
    this.done = false;
    // el minijefe: el Surubí del Paraná (entities/monumento/Surubi.js)
    if (FEATURES.boss === 'surubi') game.surubi = new Surubi(game);
    // la maravilla: el Sable Corvo, que se arma (entities/monumento/SableQuest.js)
    this.sable = new SableQuest(this);
    // el ascensor de la Torre, de la Cripta al Mirador (entities/monumento/Ascensor.js)
    this.asc = new Ascensor(this);
    // y la tirolesa, del Mirador al Parque (entities/monumento/Tirolesa.js)
    this.tiro = new Tirolesa(this);
  }

  // De dónde sale el jefe de la ronda (Zombies.spawnBoss): el Surubí, del agua.
  bossAt(p, opts = {}) {
    if (opts.kind && opts.kind !== 'surubi') return null;
    return this.g.surubi?.spotNear(p)?.at || null;
  }

  announce(text, secs = 3) {
    this.g.hud?.subtitle?.(text, secs);
  }

  onKill() {}

  // Los tiros y las explosiones (Weapons): el granadero fantasma del Parque.
  onShot(origin, dir, maxT) {
    this.sable?.onShot(origin, dir, maxT);
  }

  onExplosion() {}

  // (el sombrero que deja el jefe: acá no hay)
  dropHat() {}

  // Lo que manda un invitado (net/Session.js: 'pee').
  onGuest(m, from) {
    if (m?.k === 'sbl') this.sable?.onGuest(m, from);
  }

  onPower() {}

  onZone() {}

  update(dt) {
    this.g.surubi?.update(dt);
    this.sable?.update(dt);
    this.asc?.update(dt);
    this.tiro?.update(dt);
  }

  fullState() {
    return { step: this.step, done: this.done, sbl: this.sable?.state(), asc: this.asc?.state() };
  }

  applyRemote(m) {
    if (!m) return;
    if (m.k === 'sbl') return this.sable?.apply(m);
    if (m.k === 'asc') return this.asc?.apply(m);
    if (m.sbl) this.sable?.applyFull(m.sbl);
    if (m.asc) this.asc?.applyFull(m.asc);
    if (m.step != null) this.step = m.step;
    if (m.done != null) this.done = m.done;
  }

  debugFinal() {}

  dispose() {
    // (la Llama del Pack-a-Pava tiene su barra de pesca y la mano: world/papLlama.js)
    this.g.papq?.termas?.dispose?.();
    this.g.surubi?.dispose();
    this.g.surubi = null;
    this.sable?.dispose();
    this.asc?.dispose();
    this.tiro?.dispose();
  }
}
