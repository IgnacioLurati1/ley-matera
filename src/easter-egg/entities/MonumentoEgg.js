import { FEATURES, PERK_SPOTS } from '../config/map';
import { PERKS } from '../config/perks';
import MonumentoEnding from '../ui/MonumentoEnding';
import Surubi from './monumento/Surubi';
import SableQuest from './monumento/SableQuest';
import Ascensor from './monumento/Ascensor';
import Tirolesa from './monumento/Tirolesa';
import Bandera from './monumento/Bandera';
import Patio2043 from './monumento/Patio2043';

// Easter egg del Monumento al Mate: "La Primera Bandera". Los pasos:
//  0. La corriente y la Llama Votiva (el Pack-a-Pava, world/papLlama.js).
//  1. El Sable Corvo armado (entities/monumento/SableQuest.js).
//  2. Las telas: la celeste del Mirador y la blanca de la niebla del muelle,
//     a la costurera (María Catalina Echevarría), que cose mientras se aguanta.
//  3. La Bandera al mástil de la barranca: se iza aguantando alrededor
//     (entities/monumento/Bandera.js).
//  4. Belgrano a orillas del Paraná (la cinemática no termina el mapa).
// En línea lo lleva el anfitrión (fullState / applyRemote; los pedidos de
// los invitados llegan por onGuest).

export default class MonumentoEgg {
  constructor(game) {
    this.g = game;
    this.step = 0;
    this.done = false;
    // la escena en curso (la cinemática de Belgrano): Game la mira para pausar
    this.scene = null;
    // el minijefe: el Surubí del Paraná (entities/monumento/Surubi.js)
    if (FEATURES.boss === 'surubi') game.surubi = new Surubi(game);
    // la maravilla: el Sable Corvo, que se arma (entities/monumento/SableQuest.js)
    this.sable = new SableQuest(this);
    // el ascensor de la Torre, de la Cripta al Mirador (entities/monumento/Ascensor.js)
    this.asc = new Ascensor(this);
    // y la tirolesa, del Mirador al Parque (entities/monumento/Tirolesa.js)
    this.tiro = new Tirolesa(this);
    // la costurera, las telas y el mástil (entities/monumento/Bandera.js)
    this.bnd = new Bandera(this);
    // el secundario: los cuadernos y el patio de la 2043 (entities/monumento/Patio2043.js)
    this.pat = new Patio2043(this);
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
    this.pat?.onShot(origin, dir, maxT);
  }

  onExplosion() {}

  // El Sable Corvo (weapons/Sable.js): los tajos y el sable tirado cortan las telas.
  onSableCut(eye, fwd, range) {
    this.bnd?.onSableCut(eye, fwd, range);
  }

  onSableFly(a, b, r) {
    this.bnd?.onSableFly(a, b, r);
  }

  // (el sombrero que deja el jefe: acá no hay)
  dropHat() {}

  // Lo que manda un invitado (net/Session.js: 'pee').
  onGuest(m, from) {
    if (m?.k === 'sbl') this.sable?.onGuest(m, from);
    else if (m?.k === 'bnd') this.bnd?.onGuest(m, from);
    else if (m?.k === 'pat') this.pat?.onGuest(m, from);
  }

  onPower() {}

  onZone() {}

  // La Bandera llegó arriba del mástil (Bandera.apply 'up', en todas las
  // compus): la cinemática de Belgrano y, al final, la escarapela.
  onBanderaIzada() {
    const g = this.g;
    this.step = 4;
    this.done = true;
    // (los muertos de la ronda vuelven a la cola: no entran en la escena)
    if (!g.net || g.net.host) {
      let n = 0;
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead) continue;
        g.zombies.free(z);
        n++;
      }
      if (n) g.rounds.requeue?.(n);
    }
    this.playEnding();
  }

  playEnding() {
    if (this.scene) return;
    const cine = new MonumentoEnding(this.g);
    this.scene = { update: (dt) => cine.update(dt), kind: 'bandera', cine };
    cine.play(() => {
      this.scene = null;
      this.reward();
    });
  }

  // La cámara de la escena en curso (Game, mientras this.scene).
  sceneCam(dt) {
    return this.scene ? this.scene.update(dt) : false;
  }

  // La escarapela (cada uno la suya): un perk de regalo y, la próxima vez que
  // cae, no pierde los perks.
  reward() {
    const g = this.g;
    const P = g.player;
    if (this.rewarded || !P.alive) return;
    this.rewarded = true;
    const pool = PERK_SPOTS.map((s) => s.perk).filter((id) => PERKS[id] && !P.perks.has(id));
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (id) {
      g.audio.perkJingle?.(id, P.pos);
      g.weapons.drink(g.perkColor(id), () => P.givePerk(id), id);
    }
    this.escarapela = 1;
    const lose = P.loseAllPerks.bind(P);
    P.loseAllPerks = () => {
      if (this.escarapela > 0) {
        this.escarapela--;
        g.hud.toast?.('La escarapela te guardó los perks');
        return;
      }
      lose();
    };
    g.hud.achievement?.('La escarapela', 'Un perk de regalo, y la próxima caída no te los saca');
  }

  update(dt) {
    const g = this.g;
    g.surubi?.update(dt);
    this.sable?.update(dt);
    this.asc?.update(dt);
    this.tiro?.update(dt);
    this.bnd?.update(dt);
    this.pat?.update(dt);
    // el paso de las telas se abre con la Llama prendida y el Sable forjado
    if ((!g.net || g.net.host) && this.bnd && !this.bnd.st.on && this.sable?.st.forge === 2 && (g.papq?.termas?.st || 0) >= 2) {
      this.step = Math.max(this.step, 2);
      this.bnd.send({ a: 'on' });
    }
  }

  fullState() {
    return { step: this.step, done: this.done, sbl: this.sable?.state(), asc: this.asc?.state(), bnd: this.bnd?.state(), pat: this.pat?.state() };
  }

  applyRemote(m) {
    if (!m) return;
    if (m.k === 'sbl') return this.sable?.apply(m);
    if (m.k === 'asc') return this.asc?.apply(m);
    if (m.k === 'bnd') return this.bnd?.apply(m);
    if (m.k === 'pat') return this.pat?.apply(m);
    if (m.sbl) this.sable?.applyFull(m.sbl);
    if (m.asc) this.asc?.applyFull(m.asc);
    if (m.bnd) this.bnd?.applyFull(m.bnd);
    if (m.pat) this.pat?.applyFull(m.pat);
    if (m.step != null) this.step = m.step;
    if (m.done != null) this.done = m.done;
  }

  // (Alt+K: directo al final)
  debugFinal() {
    const B = this.bnd;
    if (!B || (this.g.net && !this.g.net.host)) return;
    if (!B.st.on) B.send({ a: 'on' });
    B.send({ a: 'tie' });
    B.send({ a: 'up' });
  }

  dispose() {
    this.scene?.cine?.dispose();
    this.scene = null;
    // (la Llama del Pack-a-Pava tiene su barra de pesca y la mano: world/papLlama.js)
    this.g.papq?.termas?.dispose?.();
    this.g.surubi?.dispose();
    this.g.surubi = null;
    this.sable?.dispose();
    this.asc?.dispose();
    this.tiro?.dispose();
    this.bnd?.dispose();
    this.pat?.dispose();
  }
}
