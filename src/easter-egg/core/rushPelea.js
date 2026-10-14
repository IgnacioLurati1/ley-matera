// La pelea de cada jefe del rush (y del Mayhem), pareja en las seis arenas.
// El usuario, 2026-10-13, jugando el rush: "el criterio no está unificado:
// algunos tiran max ammos cada tanto, otros no", "El Luisón aparece sin
// zombies y con el mapa cerrado [...] y no da max ammos" y "Con mi mate
// inicial Pack-a-Puncheado están un toque duros, deberían endurecerse con el
// pasar de la boss rush".
//
// - La munición la reparte el rush, igual en todas: un max ammo a los
//   MUNICION.primero segundos de pelea y después cada MUNICION.cada, en el
//   piso, a unos metros de uno de los que pelean (al azar). Es el reloj que
//   ya tenían la Salamanca, el Prado y el Cerro (world/Arena.js, "munición del
//   más allá"); lo propio de cada arena no corre en el rush (el reloj de
//   Arena.js, el del Cerro al pasar a la cárcel, los dos de Francisco al caer
//   de cada ritual: world/Infierno.js endRitual). Antes: el coloso y el Luisón,
//   ninguno; Francisco, dos de más; en la Salamanca (fuera de las zonas del
//   mapa) caía a los pies del anfitrión y lo levantaba él solo al aparecer.
// - Los muertos de la pelea, salgan de donde salgan (las oleadas de cada
//   arena, los llamados del jefe, la horda del coloso): la vida por el lugar
//   del jefe en el orden (ZOMBI_VIDA) y la velocidad de la ronda ZOMBI_RONDA
//   (la de las arenas de siempre). Zombies.spawn pregunta acá (zombi).
// - El estero: el Luisón pelea en el mapa, sin arena, y las rondas no le
//   llegaban (la partida recién empieza: salen del lado de la entrada, con las
//   puertas cerradas). En el rush, las rondas ahí no corren y sale una horda
//   como la del coloso alrededor de los que pelean (ESTERO).
import * as THREE from 'three';

// ---- los números (para ajustar) ----
// la munición: el primero a los 25 s de pelea y después cada 40 s
export const MUNICION = { primero: 25, cada: 40 };
// La vida de los muertos de la pelea, por el lugar del jefe en el orden
// (1.º ... 6.º). Antes, 3000 en todas (2600 en el castillo): como de la ronda
// 21, cinco tiros del Porongo Explosivo (650). Ahora arranca como de la 12
// (dos tiros) y sube hasta la 25 (siete); el Mayhem, una vez y media el rush
// en cada lugar (sigue más duro que el rush en todos).
export const ZOMBI_VIDA = {
  rush: [1250, 1700, 2300, 2900, 3600, 4400],
  mayhem: [1900, 2550, 3450, 4350, 5400, 6600],
};
// la velocidad: la de la ronda 15 (8 de cada 10 corren a fondo; rules.rollSpeed)
export const ZOMBI_RONDA = 15;
// la horda del estero: cada cuánto (s), cuántos por tanda y el tope de vivos
// (por cada compañero, la mitad más: como el coloso, GranGuerra.team), a qué
// distancia de uno de los que pelean (m)
export const ESTERO = { primera: 4, cada: 12, tanda: 6, tope: 10, cerca: [10, 16] };
// (world/Infierno.js y los que tiran munición por su cuenta) ¿la reparte el rush?
export const municionDelRush = (g) => !!g.rush?.on;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export default class RushPelea {
  constructor(g, rush) {
    this.g = g;
    this.rush = rush;
    this.reset();
  }

  // (Game.newRun → BossRush.onNewRun) cada jefe, de cero
  reset() {
    this.t = 0;
    this.ammoT = MUNICION.primero;
    this.hordaT = ESTERO.primera;
    this.rondas = false;
    this.drops = 0;
  }

  // (Zombies.spawn, anfitrión) La ronda y la vida de un muerto de la pelea; null: como venía.
  zombi(round, health) {
    const R = this.rush;
    if (!R.on || !R.entered) return null;
    const V = R.mayhem ? ZOMBI_VIDA.mayhem : ZOMBI_VIDA.rush;
    return { round: Math.max(round | 0, ZOMBI_RONDA), health: V[R.i] ?? V[V.length - 1] ?? health };
  }

  // ¿La pelea está andando? (después de que aparece el jefe y hasta que cae)
  fighting() {
    const g = this.g;
    const A = g.arena;
    if (A?.active) {
      if (A.phase === 'won') return false;
      // (el castillo: de las gemas del coloso al duende; world/GranGuerra.js)
      if (this.rush.cur.map === 'castillo') return !!A.stage && A.stage !== 'rise' && A.stage !== 'dead';
      // (el Cerro, mientras se los lleva a la cárcel: 'shift')
      return A.phase === 'fight' && !!A.boss && !A.boss.dead;
    }
    const b = g.zombies?.boss;
    return !!b && !b.dead && b.kind === 'luison';
  }

  // (anfitrión, cada cuadro: BossRush.harden)
  update(dt) {
    const g = this.g;
    if (!this.rush.entered) return;
    const A = g.arena;
    // (el reloj propio de cada arena, quieto: la reparte el rush)
    if (A?.active) A.ammoT = 1e9;
    if (this.rush.cur.map === 'esteros') this.sinRondas();
    if (!this.fighting()) return;
    this.t += dt;
    this.ammoT -= dt;
    if (this.ammoT <= 0) {
      this.ammoT = MUNICION.cada;
      this.dropAmmo();
    }
    if (this.rush.cur.map === 'esteros') {
      this.hordaT -= dt;
      if (this.hordaT <= 0) {
        this.hordaT = ESTERO.cada;
        this.horda();
      }
    }
  }

  // Los que pelean (de pie): el local y, en línea, los demás.
  peleando() {
    const g = this.g;
    const P = g.player;
    const list = P.alive !== false && !P.downed ? [P] : [];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && r.pos) list.push(r);
    return list;
  }

  // Un lugar con piso a la altura de `p`, sin agua honda, entre d0 y d1
  // metros (o null); `sight`: que se vea desde ahí (el max ammo, no detrás
  // de un árbol o una pared).
  spot(p, d0, d1, tries = 24, zone = null, sight = true) {
    const g = this.g;
    const W = g.world;
    const y = p.pos.y || 0;
    // (la Salamanca queda fuera de la grilla del mapa: ahí todo da "tapado";
    // si donde está parado ya lo da, no se mira)
    const nav = g.nav?.blocked && !g.nav.blocked(Math.floor(p.pos.x), Math.floor(p.pos.z), y);
    // (en una arena redonda, adentro del círculo: el que está parado, el de ahora)
    const A = g.arena?.active ? g.arena.A : null;
    const ring = A && A.r && Math.hypot(p.pos.x - A.x, p.pos.z - A.z) <= A.r ? A : null;
    for (let k = 0; k < tries; k++) {
      // (en la arena, más bien hacia el medio: los que pelean suelen estar contra el borde)
      const a = ring ? Math.atan2(ring.z - p.pos.z, ring.x - p.pos.x) + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
      const d = d0 + Math.random() * (d1 - d0);
      const x = p.pos.x + Math.cos(a) * d;
      const z = p.pos.z + Math.sin(a) * d;
      const fy = W.floorAt(x, z, y + 0.5);
      if (!Number.isFinite(fy) || Math.abs(fy - y) > 0.7) continue;
      if ((W.waterDepth?.(x, z, fy + 1) || 0) > 0.4) continue;
      if (nav && g.nav.blocked(Math.floor(x), Math.floor(z), fy)) continue;
      if (ring && Math.hypot(x - ring.x, z - ring.z) > ring.r - 1.5) continue;
      if (zone && W.zoneAt(x, z) !== zone) continue;
      if (sight && !W.clear(tmpA.set(p.pos.x, y + 1.2, p.pos.z), tmpB.set(x, fy + 1.0, z))) continue;
      return new THREE.Vector3(x, fy, z);
    }
    return null;
  }

  // (anfitrión) El max ammo, cerca de uno de los que pelean.
  dropAmmo() {
    const g = this.g;
    const list = this.peleando();
    if (!list.length) {
      this.ammoT = 3;
      return;
    }
    const p = list[Math.floor(Math.random() * list.length)];
    const at = this.spot(p, 2.5, 5) || this.spot(p, 1, 2.5) || new THREE.Vector3(p.pos.x, p.pos.y || 0, p.pos.z);
    this.drops++;
    g.powerups.drop(at, true, 'maxammo', true);
  }

  // (anfitrión, el estero) Las rondas de la partida no corren: los muertos
  // los pone la horda (una vez por jefe: los que ya andaban se van).
  sinRondas() {
    const g = this.g;
    const R = g.rounds;
    if (!R || g.net?.guest) return;
    if (!this.rondas) {
      this.rondas = true;
      for (const z of g.zombies.pool) if (z.active && !z.dead && !z.boss) g.zombies.free(z);
    }
    if (R.state === 'active' || R.state === 'break') R.state = 'arena';
  }

  // (anfitrión, el estero) La horda: salen de la tierra alrededor de uno de
  // los que pelean, en su misma zona (no detrás de una puerta cerrada).
  horda() {
    const g = this.g;
    const list = this.peleando();
    if (!list.length) return;
    const n = g.net ? g.net.net?.count || 1 : 1;
    const k = 1 + (n - 1) * 0.5;
    const alive = g.zombies.pool.filter((z) => z.active && !z.dead && !z.boss).length;
    if (alive >= ESTERO.tope * k) return;
    const want = Math.min(Math.round(ESTERO.tanda * k), Math.ceil(ESTERO.tope * k - alive));
    for (let i = 0; i < want; i++) {
      const p = list[i % list.length];
      const zone = g.world.zoneAt(p.pos.x, p.pos.z);
      const at = this.spot(p, ESTERO.cerca[0], ESTERO.cerca[1], 24, zone, false) || this.spot(p, ESTERO.cerca[0] * 0.5, ESTERO.cerca[0], 24, zone, false);
      if (!at) continue;
      // (vida y velocidad: zombi(), por Zombies.spawn)
      g.later(i * 0.35, () => this.fighting() && g.zombies.spawn(ZOMBI_RONDA, 1000, at));
    }
  }
}
