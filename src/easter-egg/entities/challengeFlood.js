import Water from '../fx/Water';

// La Inundación: un evento malo del Challenge de la torre (lo maneja
// entities/challengeEvents.js). El remolino se trae el agua del Iberá: la misma
// de Mate no Numa (fx/Water.js, el nado de entities/swim.js y los yacarés de
// entities/Yacares.js). Sube hasta que en el piso de los jugadores (el de la
// mayoría; si empatan, el más bajo) hay que nadar, y todo lo de abajo queda
// bajo el agua: los muertos que había ahí se ahogan y nadie más sale abajo del
// agua; los de la ronda salen nadando y vienen yacarés. Los pisos de arriba
// quedan secos (subir es escaparse). Al terminar la ronda, baja.
// Afuera de la torre el agua también sube: la torre queda hundida en un mar
// color té hasta ese piso.
// En línea: el anfitrión elige el piso (va con el evento, 'pee' rt.fl) y ahoga
// a los muertos; el agua sube y baja igual en cada compu.

// cuánto sube arriba del piso (lo mismo que la creciente del estero: se nada)
const RISE = 2.6;
// lo que tarda en subir y en bajar
const UP = 6;
const DOWN = 6;
// de dónde arranca (y adónde vuelve): apenas abajo de la losa
const UNDER = 0.9;
// cuánto pasa de la torre el mapa de profundidad (afuera, el mar)
const PAD = 16;
// nadie sale con más agua que esto encima de los pies
const SPAWN_DEEP = 3;
// un muerto de un piso de abajo con tanta agua arriba de los pies se ahoga
const DROWN = 3.2;

export default class ChallengeFlood {
  constructor(ev) {
    this.ev = ev;
    this.g = ev.g;
    this.T = ev.T;
    this.water = null;
    // hay agua (subiendo, arriba o bajando) y el piso inundado
    this.on = false;
    this.fy = 0;
    this.draining = false;
    this.drownT = 0;
    // el agua del mundo es esta (el nado, los muertos y los yacarés la leen)
    this.g.world.waterDepth = (x, z, y) => this.depth(x, z, y);
    // se arma ya (escondida): así el shader se compila en la carga
    this.ensure();
  }

  inside(x, z, m = 0) {
    const T = this.T.T;
    return x >= T.x0 + m && x < T.x1 + 1 - m && z >= T.z0 + m && z < T.z1 + 1 - m;
  }

  // (world.waterDepth) Cuánta agua hay en (x, z) para algo a la altura y. Lo
  // que está bien arriba del agua (los pisos secos, o cayendo por el agujero
  // desde lo alto) está seco hasta que llega.
  depth(x, z, y) {
    if (!this.on) return 0;
    const lvl = this.water.level;
    const ry = y ?? this.g.world.hintY();
    if (ry > lvl + 1.2 || !this.inside(x, z)) return 0;
    return Math.max(0, lvl - this.T.floorAt(x, z, ry));
  }

  // El fondo que ve el agua (su mapa de profundidad): el piso inundado; afuera, hondo.
  ground(x, z) {
    if (!this.inside(x, z)) return this.fy - 30;
    return this.T.floorAt(x, z, this.fy + 0.5);
  }

  // ¿Hay techo arriba del agua? (la losa del piso de arriba: ahí el agua no
  // refleja el cielo; en el agujero y afuera, sí)
  roof(x, z) {
    return this.inside(x, z) && this.T.ceilAt(x, z, this.fy + 0.5) < Infinity;
  }

  ensure() {
    if (this.water) return this.water;
    const T = this.T.T;
    // (los números del estero de 1b: agua color té del Iberá; menos oleaje, que
    // adentro de la torre golpearía los techos)
    const W = new Water(this.g, {
      level: 0,
      groundAt: (x, z) => this.ground(x, z),
      roofAt: (x, z) => this.roof(x, z),
      bounds: [T.x0 - PAD, T.z0 - PAD, T.x1 + 1 + PAD, T.z1 + 1 + PAD],
      res: 0.5,
      body: 0x1a1608,
      clear: 0.9,
      flow: [0.035, 0.035],
      wind: 0.8,
      swell: 0.3,
    });
    W.mesh.visible = false;
    this.g.world.root.add(W.mesh);
    this.water = W;
    return W;
  }

  // (anfitrión) El piso que se inunda: donde están los más; si empatan, el más bajo.
  pickFloor() {
    const g = this.g;
    const T = this.T;
    const ps = [g.player.alive ? g.player.pos : null];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) ps.push(r.pos);
    const count = new Map();
    for (const p of ps) {
      if (!p || !this.inside(p.x, p.z)) continue;
      const l = T.levelOf(p.y);
      count.set(l, (count.get(l) || 0) + 1);
    }
    let best = 0;
    let n = 0;
    for (const [l, c] of count) {
      if (c > n || (c === n && l < best)) {
        best = l;
        n = c;
      }
    }
    return T.yOf(best);
  }

  // Sube (en todas las compus): hasta que en el piso fy se nada.
  start(fy) {
    const g = this.g;
    const W = this.ensure();
    const prev = this.on ? W.level : fy - UNDER;
    this.fy = fy;
    this.draining = false;
    W.rebase(fy + RISE, Math.min(prev, fy + RISE));
    W.setLevel(fy + RISE, UP);
    W.mesh.visible = true;
    g.water = W;
    g.world.water = W;
    this.on = true;
    this.drownT = 0.5;
    g.audio.bossSfx('creciente');
    this.sndRush();
    // después se oyen los yacarés que se acercan (y recién ahí salen: tuneRound)
    g.later(UP * 0.55, () => {
      if (!this.on || this.draining) return;
      const P = g.player.pos;
      if (!g.audio.pack?.intro('yacare')) g.zombies.yacRig?.voice?.({ pos: P, baseY: P.y + 1 }, 'growl');
    });
  }

  // Baja (al terminar la ronda del evento).
  stop() {
    if (!this.on || this.draining) return;
    this.draining = true;
    this.water.setLevel(this.fy - UNDER, DOWN);
    this.sndDrain();
  }

  hide() {
    const g = this.g;
    const W = this.water;
    this.on = false;
    this.draining = false;
    W.mesh.visible = false;
    if (g.water === W) g.water = null;
    if (g.world.water === W) g.world.water = null;
  }

  // (anfitrión, Rounds) ¿De qué son los especiales? Con el agua arriba, yacarés.
  specialKind() {
    return this.on && !this.draining ? 'yacare' : null;
  }

  // (Zombies.pickSpawner) Lo más bajo desde donde puede salir un muerto.
  spawnFloor() {
    return this.on ? this.water.level - SPAWN_DEEP : -Infinity;
  }

  // (Zombies.spawnDog, el yacaré) En el agua del piso inundado, a 6-15 m de
  // alguien que esté en ese piso y con camino hasta él (lejos del agujero).
  spot() {
    const g = this.g;
    const T = this.T;
    const fy = this.fy;
    if (!this.on || this.draining || this.water.level < fy + 1.4) return null;
    const ps = [g.player, ...(g.net ? [...g.net.remote.values()] : [])].filter((p) => p?.pos && !p.dead && p.alive !== false && Math.abs((p.pos.y || 0) - fy) < 2.6);
    if (!ps.length) return null;
    for (let i = 0; i < 40; i++) {
      const tp = ps[i % ps.length];
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 9;
      const x = tp.pos.x + Math.cos(a) * d;
      const z = tp.pos.z + Math.sin(a) * d;
      if (!this.inside(x, z, 1) || Math.abs(T.floorAt(x, z, fy + 0.5) - fy) > 0.05) continue;
      if (g.nav.blocked?.(Math.floor(x), Math.floor(z), fy)) continue;
      const nav = g.navFor ? g.navFor(tp) : g.nav;
      if (!Number.isFinite(nav.distAt(x, z, fy))) continue;
      return { x, z, y: fy };
    }
    return null;
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    const W = this.water;
    if (this.draining && !W.rise) {
      this.hide();
      return;
    }
    if (g.net?.guest) return;
    this.drownT -= dt;
    if (this.drownT > 0) return;
    this.drownT = 0.35;
    // los de los pisos de abajo, ya tapados: se ahogan (sin puntos; en la
    // torre la ronda no los espera)
    const lvl = W.level;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.yac) continue;
      const by = z.baseY || 0;
      if (by > this.fy - 1 || lvl < by + DROWN) continue;
      this.bubbles(z.pos.x, z.pos.z);
      g.zombies.free(z);
    }
  }

  // Unas burbujas que suben a la superficie donde se ahogó uno (si se ve).
  bubbles(x, z) {
    const g = this.g;
    const W = this.water;
    const y = W.level;
    if (Math.abs(g.camera.position.y - y) > 8) return;
    for (let i = 0; i < 8; i++) g.fx.alpha.spawn(x + (Math.random() - 0.5) * 0.6, y + 0.02, z + (Math.random() - 0.5) * 0.6, 0, 0.4 + Math.random() * 0.5, 0, { color: W.lit, size: 0.05, size1: 0.12, life: 0.5 + Math.random() * 0.4, alpha: 0.5 });
    W.ripple(x, z, 0.6, 0.6);
  }

  // ---------------- lo que se oye ----------------
  // El agua que entra por las arcadas: un rugido que crece mientras sube.
  sndRush() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 0.9, reverb: 0.5 });
    A.noise(o, { t, dur: UP, type: 'lowpass', freq: 380, freqEnd: 900, gain: 0.8, brown: true, attack: 1.2 });
    A.noise(o, { t: t + 0.4, dur: UP - 0.6, type: 'bandpass', freq: 1400, freqEnd: 700, q: 0.8, gain: 0.3, attack: 1.5 });
    for (let i = 0; i < 10; i++) A.noise(o, { t: t + 0.5 + Math.random() * (UP - 1), dur: 0.25, type: 'bandpass', freq: 600 + Math.random() * 900, q: 2, gain: 0.25 });
  }

  // El agua que se va por el agujero, chupada por el remolino.
  sndDrain() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 0.7, reverb: 0.6 });
    A.noise(o, { t, dur: DOWN, type: 'bandpass', freq: 900, freqEnd: 250, q: 1.2, gain: 0.6, brown: true, attack: 0.6 });
    A.tone(o, { t: t + 0.5, dur: DOWN - 1, freq: 90, freqEnd: 40, gain: 0.12, attack: 0.8 });
  }

  dispose() {
    const g = this.g;
    if (this.on) this.hide();
    delete g.world.waterDepth;
    this.water?.dispose();
    this.water = null;
  }
}
