import * as THREE from 'three';
import { TOWER, SKY } from '../config/map';
import { PLAYER, SPEEDS, rollSpeedClassic } from '../config/rules';
import { weaponStats } from '../config/weapons';

// Los eventos del remolino del Challenge de la torre (los maneja
// entities/TowerChallenge.js). Desde la ronda 3 casi siempre hay uno; de la 10
// en adelante, a veces dos malos juntos. La mayoría son malos y bien locos
// (ninguno te liquida de una por sí solo; lo que mata es caerse por el agujero,
// y eso es parte del Challenge); de vez en cuando sale uno bueno.
// En línea: el anfitrión elige y lo manda ('pee' rt); cada uno sufre el suyo
// (el viento, los sacudones, el mareo, la gravedad y los revolcones mueven a
// su propio jugador) y el anfitrión decide lo de los muertos (velocidad,
// minijefes, estrellas que caen, globos que revientan).

export const CHALLENGE_EVENTS = {
  rafaga: { kind: 'mal', name: 'Ráfaga del Remolino', sub: 'El viento te chupa para el agujero: agachate para aguantar', tint: 'rgba(140, 200, 255, 0.4)' },
  apagon: { kind: 'mal', name: 'Apagón', sub: 'Se apaga toda la torre: quedan los relámpagos y los ojos de los muertos', tint: 'rgba(0, 0, 0, 0.75)' },
  estampida: { kind: 'mal', name: 'Estampida', sub: 'Todos corren, y salen de a montones', tint: 'rgba(255, 90, 40, 0.35)' },
  jefes: { kind: 'mal', name: 'Noche de Minijefes', sub: 'Uno atrás del otro hasta que termine la ronda', tint: 'rgba(255, 30, 40, 0.35)' },
  terremoto: { kind: 'mal', name: 'Terremoto', sub: 'La torre se sacude y cada tanto te revolea', tint: 'rgba(210, 150, 80, 0.35)' },
  animas: { kind: 'mal', name: 'Ánimas en Pena', sub: 'Los muertos se hacen invisibles: solo se ven de cerca (y los ojos)', tint: 'rgba(110, 200, 255, 0.35)' },
  globos: { kind: 'mal', name: 'Muertos Globo', sub: 'Vienen inflados y revientan al morir: la explosión te revolea', tint: 'rgba(170, 230, 60, 0.35)' },
  mareo: { kind: 'mal', name: 'Borrachera de Caña', sub: 'La torre da vueltas, se camina torcido y hay hipo', tint: 'rgba(255, 160, 50, 0.35)' },
  luna: { kind: 'raro', name: 'Luna de Mate', sub: 'Gravedad baja: se salta altísimo y se cae despacio', tint: 'rgba(170, 190, 255, 0.3)' },
  estrellas: { kind: 'bien', name: 'Lluvia de Estrellas', sub: 'Caen estrellas del cielo encima de los muertos', tint: 'rgba(255, 215, 110, 0.35)' },
  siesta: { kind: 'bien', name: 'Hora de la Siesta', sub: 'Los muertos caminan dormidos toda la ronda', tint: 'rgba(120, 255, 190, 0.3)' },
  cebada: { kind: 'bien', name: 'Ronda Cebada', sub: 'El remolino te convida: potenciadores para todos', tint: 'rgba(120, 255, 120, 0.3)' },
  // (w: cuánto sale comparado con los otros de su clase; este, rarísimo)
  caballeros: { kind: 'bien', w: 0.3, name: 'Caballeros Reencarnados', sub: 'Cada uno recibe un mate de la luz mejorado hasta que termine la ronda', tint: 'rgba(255, 230, 150, 0.35)' },
};
// los mates de la luz de los cuatro caballeros (Der Mateendrache)
const KNIGHTS = ['pillan', 'zonda', 'illapa', 'penitente'];
const IDS = Object.keys(CHALLENGE_EVENTS);
const TAG = { mal: 'Evento', raro: 'Evento raro', bien: '¡Suerte!' };

// la ráfaga: el aviso, lo que empuja y cada cuánto
const GUST_WARN = 1.2;
const GUST_DUR = 1.4;
const GUST_SPEED = 3.8;
// los globos: hasta dónde revolea el reventón y cuánto lastima (con tope por segundo)
const POP_R = 3.4;
const POP_HURT = 8;
const POP_CAP = 30;
// las ánimas: a qué distancia se ven
const GHOST_R = 6.5;
// el más rápido de los muertos, contra el jugador caminando (PLAYER.walk):
// sin aire igual se escapa, apenas (pedido del usuario 2026-09-27)
const SPEED_CAP = 0.96;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpV = new THREE.Vector3();
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const rnd = () => Math.random() - 0.5;

export default class ChallengeEvents {
  constructor(ch) {
    this.ch = ch;
    this.g = ch.g;
    this.T = ch.T;
    this.list = [];
    this.round = 0;
    this.last = [];
    this.gust = null;
    this.gustT = 6;
    this.bossLeft = 0;
    this.bossT = 0;
    this.dim = 1;
    this.dimKick = 0;
    this.boltT = 2;
    this.quakeT = 3;
    this.hicT = 3;
    this.flickT = 1;
    this.revealT = 0;
    this.wispT = 0;
    this.metT = 1.5;
    this.pops = [];
    this.popT = 0;
    this.popHurt = 0;
    this.shove = new THREE.Vector3();
    this.saved = null;
    this.buildDom();
  }

  has(id) {
    return this.list.includes(id);
  }

  name(id) {
    return CHALLENGE_EVENTS[id]?.name || id;
  }

  sub(id) {
    return CHALLENGE_EVENTS[id]?.sub || '';
  }

  kind(id) {
    return CHALLENGE_EVENTS[id]?.kind || 'mal';
  }

  // ---------------- la pantalla ----------------
  buildDom() {
    const g = this.g;
    const tint = document.createElement('div');
    tint.className = 'mdu-reto-tint';
    tint.setAttribute('aria-hidden', 'true');
    g.root.appendChild(tint);
    this.tintEl = tint;
    const b = document.createElement('div');
    b.className = 'mdu-reto-banner';
    b.setAttribute('aria-hidden', 'true');
    g.hud.root.appendChild(b);
    this.bannerEl = b;
  }

  // El cartelón que entra de golpe con cada evento nuevo.
  banner(ids) {
    const el = this.bannerEl;
    const E = CHALLENGE_EVENTS[ids[0]];
    const kind = E.kind;
    el.className = `mdu-reto-banner is-${kind}`;
    el.innerHTML = `<em>${ids.length > 1 ? '¡Doble evento!' : TAG[kind]}</em>${ids.map((id) => `<b>${CHALLENGE_EVENTS[id].name}</b>`).join('<i>+</i>')}<small>${ids.map((id) => CHALLENGE_EVENTS[id].sub).join(' · ')}</small>`;
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  syncTint() {
    const E = this.list.length ? CHALLENGE_EVENTS[this.list[0]] : null;
    this.tintEl.style.setProperty('--tint', E ? E.tint : 'transparent');
    this.tintEl.classList.toggle('is-on', !!E);
    this.tintEl.classList.toggle('is-dark', this.has('apagon'));
  }

  // ---------------- elegir ----------------
  // (anfitrión) Los eventos de la ronda n.
  pick(n) {
    if (n < 3 || Math.random() > 0.85) return [];
    const r = Math.random();
    const kind = r < 0.18 ? 'bien' : r < 0.28 ? 'raro' : 'mal';
    // (la noche de minijefes, recién desde la 5: antes no hay minijefes)
    const from = (k, not = []) => IDS.filter((id) => CHALLENGE_EVENTS[id].kind === k && !this.last.includes(id) && !not.includes(id) && (id !== 'jefes' || n >= 5));
    const pool = from(kind);
    if (!pool.length) return [];
    const wt = (id) => CHALLENGE_EVENTS[id].w ?? 1;
    let r2 = Math.random() * pool.reduce((sum, id) => sum + wt(id), 0);
    const out = [pool.find((id) => (r2 -= wt(id)) <= 0) || pool[pool.length - 1]];
    // de la 10 en adelante, a veces dos malos juntos
    if (n >= 10 && kind === 'mal' && Math.random() < 0.4) {
      const more = from('mal', out);
      if (more.length) out.push(more[Math.floor(Math.random() * more.length)]);
    }
    return out;
  }

  // (anfitrión, Rounds.nextRound por TowerChallenge.tuneRound)
  tuneRound(R) {
    const n = R.round;
    const list = this.pick(n);
    if (list.includes('estampida')) {
      R.delay *= 0.4;
      R.total = Math.round(R.total * 1.5);
      R.toSpawn = R.total;
      // (los especiales, recién desde la 5)
      if (n >= 5) R.specials += 4;
    }
    this.bossLeft = list.includes('jefes') ? 3 + Math.floor(n / 8) : 0;
    this.bossT = 7;
    this.set(list, n);
    this.g.net?.event('pee', { rt: { ev: list, n } });
  }

  // (anfitrión, Zombies.spawn) Cada muerto nuevo según los eventos.
  tuneZombie(z, round) {
    // (acá no se largan a correr a medida que caen los números: eso es del juego normal)
    z.runU = null;
    if (this.has('siesta')) {
      z.speedType = 'walk';
      z.speed = SPEEDS.walk * (0.78 + Math.random() * 0.12);
      z.fury = 0.6;
      return;
    }
    const stamp = this.has('estampida');
    z.fury = 1.35;
    // las primeras 5 rondas corren como corría el juego normal antes del
    // 2026-09-27 (rollSpeedClassic); después, rápidos (un poco menos desde ese día)
    if (round > 5) {
      z.speedType = stamp ? 'sprint' : rollSpeedClassic(round + 3);
      z.speed = SPEEDS[z.speedType] * (0.95 + Math.random() * 0.1);
    } else {
      z.speedType = rollSpeedClassic(round);
      z.speed = SPEEDS[z.speedType] * (0.92 + Math.random() * 0.16);
    }
    // nunca más rápidos que el jugador caminando: el que se queda sin aire
    // todavía se les escapa (comiéndose algún zarpazo si lo alcanzan)
    z.speed = Math.min(z.speed, PLAYER.walk * SPEED_CAP);
  }

  set(list, n) {
    const ids = (Array.isArray(list) ? list : list ? [list] : []).filter((id) => CHALLENGE_EVENTS[id]);
    const was = this.list;
    for (const id of was) if (!ids.includes(id)) this.stop(id);
    this.list = ids;
    this.round = n;
    if (ids.length) this.last = ids.slice();
    const fresh = ids.filter((id) => !was.includes(id));
    for (const id of fresh) this.start(id);
    this.gust = null;
    this.gustT = 3 + Math.random() * 2;
    if (fresh.length) this.announce(ids);
    this.syncTint();
  }

  announce(ids) {
    const g = this.g;
    this.banner(ids);
    const good = CHALLENGE_EVENTS[ids[0]].kind === 'bien';
    if (good) this.sndLuck();
    else {
      g.audio.sting();
      g.audio.thunder?.(g.player.pos.clone().setY(g.player.pos.y + 20), ids.length > 1);
      g.fx.addShake(0.45);
    }
  }

  // ---------------- lo que cambia al empezar y al terminar ----------------
  start(id) {
    const g = this.g;
    const host = !g.net?.guest;
    if (id === 'apagon') this.lightsOut(true);
    else if (id === 'animas') {
      this.revealT = 1.2;
      this.flickT = 2;
    } else if (id === 'terremoto') this.quakeT = 1.6;
    else if (id === 'mareo') this.hicT = 2.5;
    else if (id === 'estrellas') this.metT = 1.4;
    else if (id === 'siesta' && host) {
      // los que ya andaban también se duermen
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || z.dog) continue;
        z.speedType = 'walk';
        z.speed = SPEEDS.walk * 0.85;
        z.fury = 0.6;
      }
      this.sndSnore();
    } else if (id === 'cebada' && host) this.convida();
    else if (id === 'caballeros') this.knight();
  }

  stop(id) {
    if (id === 'caballeros' && this.g.weapons.temp?.knight) this.g.weapons.clearTemp();
    if (id === 'apagon') this.lightsOut(false);
    else if (id === 'globos') this.deflate();
  }

  // El apagón: la torre (world/Tower.js updateLights con T.dim), el cielo y la
  // luna bajan; los ojos de los muertos brillan el doble.
  lightsOut(on) {
    const w = this.g.world;
    const Z = this.g.zombies;
    if (on) {
      if (this.saved) return;
      this.saved = { hemi: w.hemiBase, amb: w.ambient?.intensity, moon: SKY.moon, eye: Z.eyeMat?.color.clone() };
      w.hemiBase = (this.saved.hemi ?? 0.9) * 0.22;
      if (w.ambient) w.ambient.intensity = (this.saved.amb ?? 0.5) * 0.25;
      SKY.moon = { ...(SKY.moon || {}), light: (SKY.moon?.light ?? 1) * 0.2 };
      Z.eyeMat?.color.multiplyScalar(2.2);
      this.boltT = 2;
      return;
    }
    const S = this.saved;
    if (!S) return;
    this.saved = null;
    w.hemiBase = S.hemi;
    if (w.ambient && S.amb !== undefined) w.ambient.intensity = S.amb;
    if (S.moon) SKY.moon = S.moon;
    else delete SKY.moon;
    if (S.eye) Z.eyeMat?.color.copy(S.eye);
  }

  // Los globos se desinflan (el tamaño de cada uno vuelve al suyo).
  deflate() {
    for (const z of this.g.zombies.pool) {
      if (z.globoId !== undefined && z.globoId === z.id) z.scale = z.globo;
      z.globoId = undefined;
    }
  }

  // Caballeros reencarnados: a cada uno, un mate de la luz del castillo ya
  // templado (su mejora es el temple del altar, no el Pack-a-Pava), hasta que
  // termine la ronda (cada jugador uno distinto).
  knight() {
    const g = this.g;
    const p = g.player;
    const W = g.weapons;
    if (!p.alive || p.downed) return;
    const id = KNIGHTS[((g.net?.id ?? 0) + this.round) % KNIGHTS.length];
    const st = weaponStats(id, 1);
    W.giveTemp(id, 3600);
    W.temp.up = 1;
    W.temp.mag = st.mag;
    W.temp.reserve = st.reserve;
    W.temp.knight = true;
    // (giveTemp ya armó el modelo sin templar: se vuelve a sacar con el templado)
    W.startRaise();
    g.hud.subtitle(`¡Un caballero te prestó su mate templado! ${st.name}, hasta que termine la ronda.`, 5, 'boss');
    g.post?.flash(0.5);
  }

  // Ronda cebada: un potenciador al lado de cada uno (lo reparte el anfitrión).
  convida() {
    const g = this.g;
    const spots = [g.player.alive ? g.player.pos : null];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) spots.push(r.pos);
    const types = ['maxammo', 'double', 'insta', 'firesale'].sort(() => Math.random() - 0.5);
    spots.filter(Boolean).forEach((p, i) => {
      const a = Math.random() * Math.PI * 2;
      g.powerups.drop(new THREE.Vector3(p.x + Math.cos(a) * 1.6, p.y, p.z + Math.sin(a) * 1.6), true, types[i % types.length]);
    });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const p = g.player;
    const t = g.time;
    const live = g.state === 'playing' && !this.ch.scene;
    const me = live && p.alive && !p.downed && !p.ride;
    const host = !g.net?.guest;
    const active = live && g.rounds.state === 'active';
    // el apagón (y sus relámpagos)
    let want = 1;
    if (this.has('apagon')) {
      want = 0.06;
      this.boltT -= dt;
      if (this.boltT <= 0 && live) {
        this.boltT = 2.2 + Math.random() * 3.4;
        this.bolt();
      }
    }
    this.dimKick = Math.max(0, this.dimKick - dt * 5);
    this.dim += (want - this.dim) * Math.min(1, dt * (want < this.dim ? 3 : 1.5));
    this.T.dim = Math.min(1.3, this.dim + this.dimKick);
    // la luna: se cae más despacio
    if (this.has('luna') && me && !p.onGround) {
      p.vel.y += PLAYER.gravity * 0.65 * dt;
      if (Math.random() < 0.3) g.fx.add.spawn(p.pos.x + rnd() * 6, p.pos.y + Math.random() * 2, p.pos.z + rnd() * 6, 0, 0.4, 0, { color: [0.75, 0.82, 1], size: 0.05, size1: 0, life: 1.4 });
    }
    // las ráfagas: el anfitrión las larga
    if (this.has('rafaga') && host && active) {
      this.gustT -= dt;
      if (this.gustT <= 0 && !this.gust) {
        this.gustT = 6 + Math.random() * 3.5;
        this.startGust();
        g.net?.event('pee', { gust: 1 });
      }
    }
    if (this.gust) {
      this.gust.t += dt;
      const gt = this.gust.t - GUST_WARN;
      if (gt > 0) this.pushGust(dt, Math.sin(Math.min(1, gt / GUST_DUR) * Math.PI));
      if (gt > GUST_DUR) this.gust = null;
    }
    // el terremoto
    if (this.has('terremoto') && live) {
      g.fx.addShake(dt * 0.3);
      this.quakeT -= dt;
      if (this.quakeT <= 0) {
        this.quakeT = 3.2 + Math.random() * 2.6;
        this.quake(me);
      }
    }
    // la borrachera
    if (this.has('mareo') && live && p.alive) {
      g.camera.rotateZ(Math.sin(t * 0.8) * 0.09 + Math.sin(t * 2.1) * 0.035);
      if (me && p.onGround) {
        const k = Math.sin(t * 0.6) * 1.1;
        this.tangent(p.pos, tmpV);
        p.pos.x += tmpV.x * k * dt;
        p.pos.z += tmpV.z * k * dt;
        g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
      }
      this.hicT -= dt;
      if (this.hicT <= 0) {
        this.hicT = 2.8 + Math.random() * 3;
        if (me && p.onGround) p.vel.y = Math.max(p.vel.y, 3.4);
        g.fx.addShake(0.15);
        this.sndHic();
      }
    }
    // los globos: más grandes (en todas las compus, cada uno los suyos)
    if (this.has('globos')) {
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || z.dog || z.globoId === z.id) continue;
        z.globoId = z.id;
        z.globo = z.scale || 1;
        z.scale = z.globo * 1.3;
      }
    }
    if (this.pops.length && (this.popT -= dt) <= 0) this.flushPops();
    this.popHurt = Math.max(0, this.popHurt - dt * 15);
    // las estrellas (anfitrión)
    if (this.has('estrellas') && host && active) {
      this.metT -= dt;
      if (this.metT <= 0) {
        this.metT = 0.65 + Math.random() * 0.55;
        this.meteor();
      }
    }
    // la noche de minijefes: otro apenas cae el anterior (anfitrión)
    if (this.bossLeft > 0 && host && active) {
      const b = g.zombies.boss;
      if (!b || b.dead) {
        this.bossT -= dt;
        // (el cuerpo del anterior ocupa el lugar del jefe hasta que se hunde:
        // se saca, que si no spawnBoss devuelve el muerto y no sale ninguno)
        if (this.bossT <= 0 && (!b || (b.corpseT || 0) > 6)) {
          this.bossT = 6;
          this.bossLeft--;
          if (b) g.zombies.removeBoss();
          g.zombies.spawnBoss(g.rounds.round, { kind: Math.random() < 0.5 ? 'capataz' : 'alcaide' });
        }
      }
    }
    // los revolcones (reventones, sacudones)
    if (this.shove.lengthSq() > 0.01) {
      if (me) {
        p.pos.x += this.shove.x * dt;
        p.pos.z += this.shove.z * dt;
        g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
      }
      this.shove.multiplyScalar(Math.exp(-dt * 5));
    }
    // las ánimas: al final (después de que Zombies dibujó a todos)
    if (this.has('animas')) this.ghosts(dt);
  }

  // La dirección que da la vuelta alrededor del agujero (no lo empuja adentro).
  tangent(pos, out) {
    const dx = pos.x - TOWER.cx;
    const dz = pos.z - TOWER.cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return out.set(1, 0, 0);
    return out.set(-dz / d, 0, dx / d);
  }

  // ---------------- la ráfaga ----------------
  startGust() {
    const g = this.g;
    this.gust = { t: 0 };
    g.hud.subtitle('¡Viene una ráfaga! Agachate o agarrate de algo.', GUST_WARN + GUST_DUR, 'boss');
    const A = g.audio;
    if (A?.ctx) {
      const o = A.out({ gain: 1, reverb: 0.3 });
      A.noise(o, { dur: GUST_WARN + GUST_DUR, type: 'bandpass', freq: 220, freqEnd: 1000, q: 0.8, gain: 0.6, attack: GUST_WARN });
      A.noise(o, { t: A.now + GUST_WARN, dur: GUST_DUR, freq: 1500, freqEnd: 400, gain: 0.45, brown: true, attack: 0.1 });
    }
  }

  // El empujón hacia el agujero: al jugador (menos agachado) y, en el
  // anfitrión, a los muertos del borde.
  pushGust(dt, k) {
    const g = this.g;
    const p = g.player;
    const T = this.T;
    const cx = TOWER.cx;
    const cz = TOWER.cz;
    if (p.alive && !p.ride && T.inFoot(p.pos.x, p.pos.z) && p.pos.y > 1) {
      const dx = cx - p.pos.x;
      const dz = cz - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const s = GUST_SPEED * k * (p.crouching ? 0.15 : p.onGround ? 1 : 1.4) * dt;
      p.pos.x += (dx / d) * s;
      p.pos.z += (dz / d) * s;
      g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
      g.fx.addShake(dt * 0.5 * k);
      // polvo, yerba y papeles que pasan volando para el agujero
      const a = Math.atan2(dz, dx);
      for (let i = 0; i < 3; i++) {
        if (Math.random() > 0.8 * k) continue;
        g.fx.alpha.spawn(p.pos.x - Math.cos(a) * 3 + rnd() * 5, p.pos.y + 0.2 + Math.random() * 2, p.pos.z - Math.sin(a) * 3 + rnd() * 5, Math.cos(a) * 11, 0.4, Math.sin(a) * 11, { color: i ? [0.5, 0.46, 0.36] : [0.35, 0.5, 0.2], size: 0.06, size1: 0.22, life: 0.6, alpha: 0.3 });
      }
    }
    if (g.net?.guest) return;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.dog || !['chase', 'attack'].includes(z.state) || (z.baseY || 0) < 2) continue;
      const dx = cx - z.pos.x;
      const dz = cz - z.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 8.5 || d < 0.5) continue;
      const s = GUST_SPEED * 0.9 * k * dt;
      z.pos.x += (dx / d) * s;
      z.pos.z += (dz / d) * s;
    }
  }

  // ---------------- el apagón ----------------
  // Un relámpago: se ve todo un instante (y truena).
  bolt() {
    const g = this.g;
    if (g.weather) g.weather.flash = 1;
    this.dimKick = 1.1;
    g.audio.thunder?.(g.player.pos.clone().setY(g.player.pos.y + 25), Math.random() < 0.4);
  }

  // ---------------- el terremoto ----------------
  quake(me) {
    const g = this.g;
    const p = g.player;
    g.fx.addShake(0.9);
    this.sndRumble();
    if (!me) return;
    // el sacudón te revolea de costado (alrededor del agujero, no para adentro)
    this.tangent(p.pos, tmpV);
    const s = (Math.random() < 0.5 ? -1 : 1) * (p.crouching ? 2 : 5);
    this.shove.addScaledVector(tmpV, s);
    if (p.onGround) p.vel.y = Math.max(p.vel.y, 3);
    // cae polvo y cascotes del techo
    for (let i = 0; i < 36; i++) {
      g.fx.alpha.spawn(p.pos.x + rnd() * 9, p.pos.y + 3.4, p.pos.z + rnd() * 9, rnd() * 0.5, -1 - Math.random(), rnd() * 0.5, { color: [0.45, 0.4, 0.34], size: 0.05 + Math.random() * 0.06, size1: 0.02, life: 1.1, alpha: 0.8, gravity: 9, bounce: 0.2 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.fx.alpha.spawn(p.pos.x, p.pos.y + 0.1, p.pos.z, Math.cos(a) * 2.5, 0.3, Math.sin(a) * 2.5, { color: [0.55, 0.5, 0.42], size: 0.2, size1: 0.9, life: 0.9, alpha: 0.35, drag: 2 });
    }
  }

  // ---------------- las ánimas ----------------
  // Los de lejos no se dibujan (quedan los ojos y un vahito); cada tanto un
  // parpadeo los muestra a todos.
  ghosts(dt) {
    const g = this.g;
    this.flickT -= dt;
    this.revealT -= dt;
    if (this.flickT <= 0) {
      this.flickT = 1.6 + Math.random() * 1.4;
      this.revealT = 0.22;
    }
    if (this.revealT > 0) return;
    const Z = g.zombies;
    const cam = g.camera.position;
    this.wispT -= dt;
    const wisp = this.wispT <= 0;
    if (wisp) this.wispT = 0.3;
    let touched = false;
    for (const z of Z.pool) {
      if (!z.active || z.dead || z.boss || z.dog) continue;
      const y = (z.baseY || 0) + 1;
      const d = Math.hypot(z.pos.x - cam.x, y - cam.y, z.pos.z - cam.z);
      if (d < GHOST_R) continue;
      for (const M of Z.meshes) {
        if (M.key === 'eye') continue;
        for (let k = 0; k < M.parts.length; k++) M.im.setMatrixAt(z.slot * M.parts.length + k, ZERO);
      }
      Z.blobs?.setMatrixAt(z.slot, ZERO);
      touched = true;
      if (wisp && d < 40) g.fx.add.spawn(z.pos.x + rnd() * 0.4, y + Math.random() * 0.8, z.pos.z + rnd() * 0.4, 0, 0.5, 0, { color: [0.45, 0.75, 1], size: 0.22, size1: 0.05, life: 0.7 });
    }
    if (!touched) return;
    for (const M of Z.meshes) M.im.instanceMatrix.needsUpdate = true;
    if (Z.blobs) Z.blobs.instanceMatrix.needsUpdate = true;
  }

  // ---------------- los globos ----------------
  // (anfitrión, Zombies.kill) Un globo reventó: se junta y sale de a varios.
  onKill(z) {
    if (!this.has('globos') || z.boss || z.dog || this.g.net?.guest) return;
    this.pops.push([+z.pos.x.toFixed(2), +((z.baseY || 0) + 1).toFixed(2), +z.pos.z.toFixed(2)]);
    if (this.pops.length === 1) this.popT = 0.1;
  }

  flushPops() {
    const list = this.pops.splice(0, 12);
    this.pops.length = 0;
    this.g.net?.event('pee', { pops: list });
    for (const q of list) this.pop(q);
  }

  // El reventón: una nube verde, el estampido y, si estás cerca, un revolcón.
  pop(q) {
    const g = this.g;
    const at = tmpV.set(q[0], q[1], q[2]);
    for (let i = 0; i < 22; i++) {
      g.fx.alpha.spawn(at.x + rnd() * 0.6, at.y + rnd() * 0.6, at.z + rnd() * 0.6, rnd() * 5, Math.random() * 3, rnd() * 5, { color: [0.45 + Math.random() * 0.2, 0.7, 0.18], size: 0.25, size1: 0.9, life: 0.9, alpha: 0.45, drag: 2.5 });
    }
    for (let i = 0; i < 10; i++) g.fx.add.spawn(at.x, at.y, at.z, rnd() * 8, Math.random() * 5, rnd() * 8, { color: [0.85, 1, 0.3], size: 0.08, size1: 0, life: 0.4, drag: 2 });
    g.fx.flash(at, 0xb0ff40, 8, 0.15, 7);
    this.sndPop(at.clone());
    const p = g.player;
    if (!p.alive || p.downed || p.ride) return;
    const dx = p.pos.x - at.x;
    const dz = p.pos.z - at.z;
    const d = Math.hypot(dx, dz, (p.pos.y + 1 - at.y) * 1.5);
    if (d > POP_R) return;
    const k = 1 - d / POP_R;
    const h = Math.hypot(dx, dz) || 1;
    this.shove.x += (dx / h) * 8 * k;
    this.shove.z += (dz / h) * 8 * k;
    if (this.shove.length() > 10) this.shove.setLength(10);
    p.vel.y = Math.max(p.vel.y, 2.5 + 3 * k);
    p.onGround = false;
    g.fx.addShake(0.35 * k + 0.1);
    if (this.popHurt < POP_CAP) {
      this.popHurt += POP_HURT;
      p.damage(POP_HURT, at.clone(), true);
    }
  }

  // ---------------- las estrellas ----------------
  // (anfitrión) Una estrella que cae sobre algún muerto cerca de los jugadores.
  meteor() {
    const g = this.g;
    const ps = [g.player.alive ? g.player.pos : null];
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) ps.push(r.pos);
    const near = [];
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.boss || z.dog || ['rise', 'approach', 'drop'].includes(z.state)) continue;
      const zy = z.baseY || 0;
      if (ps.some((p) => p && Math.abs(p.y - zy) < 6 && Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < 24)) near.push(z);
    }
    if (!near.length) return;
    const z = near[Math.floor(Math.random() * near.length)];
    const at = new THREE.Vector3(z.pos.x, z.baseY || 0, z.pos.z);
    this.meteorFx(at);
    g.net?.event('pee', { met: r2(at) });
    g.later(0.3, () => {
      for (const { z: o } of g.zombies.inRadius(at, 2.8)) {
        if (o.dead || o.boss || Math.abs((o.baseY || 0) - at.y) > 2) continue;
        g.zombies.damage(o, 1e9, { type: 'explosive', noPoints: true, point: new THREE.Vector3(o.pos.x, (o.baseY || 0) + 1, o.pos.z), dir: new THREE.Vector3(o.pos.x - at.x, 0.6, o.pos.z - at.z).normalize() });
      }
    });
  }

  // Lo que se ve: una estela de oro que baja del cielo y la nova donde pega.
  meteorFx(at) {
    const g = this.g;
    const top = new THREE.Vector3(at.x + rnd() * 10, at.y + 26, at.z + rnd() * 10);
    const hit = at.clone().setY(at.y + 0.4);
    g.fx.beam(top, hit, { color: 0xffd060, width: 0.7, life: 0.34 });
    g.fx.beam(top, hit, { color: 0xffffff, width: 0.22, life: 0.3 });
    for (let i = 0; i < 16; i++) {
      const k = i / 16;
      g.fx.add.spawn(top.x + (hit.x - top.x) * k, top.y + (hit.y - top.y) * k, top.z + (hit.z - top.z) * k, rnd(), rnd(), rnd(), { color: [1, 0.85 - k * 0.3, 0.4], size: 0.16, size1: 0, life: 0.5 });
    }
    g.later(0.28, () => {
      g.weapons?.nova?.fx?.burst(hit, 0, 1.5);
      g.fx.flash(hit, 0xffd070, 22, 0.25, 12);
      for (let i = 0; i < 30; i++) {
        tmpV.set(rnd(), Math.random() * 0.8 + 0.1, rnd()).normalize().multiplyScalar(4 + Math.random() * 6);
        g.fx.add.spawn(hit.x, hit.y, hit.z, tmpV.x, tmpV.y, tmpV.z, { color: [1, 0.8 + Math.random() * 0.2, 0.4], size: 0.12, size1: 0, life: 0.6, drag: 2, gravity: 4 });
      }
      g.audio.thunderCrack?.(hit.clone(), { dur: 0.7, gain: 0.5 });
      const d = g.player.pos.distanceTo(hit);
      if (d < 14) g.fx.addShake(0.3 * (1 - d / 14));
    });
  }

  // ---------------- en línea ----------------
  // Lo que manda el anfitrión (devuelve true si era de los eventos).
  applyRemote(m) {
    if (m.rt) {
      const ev = Array.isArray(m.rt.ev) ? m.rt.ev : m.rt.ev ? [m.rt.ev] : [];
      if (ev.join() !== this.list.join() || m.rt.n !== this.round) this.set(ev, m.rt.n | 0);
      return true;
    }
    if (m.gust) {
      this.startGust();
      return true;
    }
    if (Array.isArray(m.pops)) {
      for (const q of m.pops.slice(0, 12)) if (Array.isArray(q) && q.length === 3) this.pop(q);
      return true;
    }
    if (Array.isArray(m.met) && m.met.length === 3) {
      this.meteorFx(new THREE.Vector3(m.met[0], m.met[1], m.met[2]));
      return true;
    }
    return false;
  }

  state() {
    return { ev: this.list.slice(), n: this.round };
  }

  // ---------------- lo que se escucha ----------------
  sndLuck() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.6, reverb: 0.7, bus: A.music });
    [72, 76, 79, 84, 88].forEach((n, i) => A.tone(o, { t: A.now + i * 0.08, dur: 1.2, type: 'triangle', freq: 440 * 2 ** ((n - 69) / 12), gain: 0.09, attack: 0.004 }));
  }

  sndRumble() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 1.1, reverb: 0.4 });
    A.noise(o, { dur: 1.6, freq: 180, freqEnd: 60, gain: 0.9, brown: true, attack: 0.05 });
    A.tone(o, { dur: 1.4, freq: 48, freqEnd: 30, gain: 0.5 });
    for (let i = 0; i < 5; i++) A.noise(o, { t: A.now + 0.2 + Math.random() * 1, dur: 0.06, type: 'bandpass', freq: 900 + Math.random() * 1200, q: 3, gain: 0.2 });
  }

  sndHic() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.7, reverb: 0.1 });
    A.tone(o, { dur: 0.12, type: 'triangle', freq: 320, freqEnd: 720, gain: 0.3, attack: 0.004 });
    A.noise(o, { dur: 0.05, type: 'bandpass', freq: 1500, q: 3, gain: 0.25 });
  }

  sndPop(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, gain: 0.9, reverb: 0.3, ref: 4 });
    A.noise(o, { dur: 0.35, freq: 1200, freqEnd: 150, gain: 0.8, attack: 0.002 });
    A.tone(o, { dur: 0.25, freq: 160, freqEnd: 60, gain: 0.4 });
    A.noise(o, { t: A.now + 0.05, dur: 0.6, type: 'bandpass', freq: 400, freqEnd: 200, q: 2, gain: 0.2 });
  }

  sndSnore() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.6, reverb: 0.4 });
    for (let i = 0; i < 2; i++) {
      A.noise(o, { t: A.now + i * 1.3, dur: 0.8, type: 'bandpass', freq: 180, freqEnd: 120, q: 4, gain: 0.5, attack: 0.2 });
      A.tone(o, { t: A.now + i * 1.3 + 0.85, dur: 0.3, freq: 900, freqEnd: 1400, gain: 0.04 });
    }
  }

  dispose() {
    for (const id of this.list) this.stop(id);
    this.lightsOut(false);
    this.list = [];
    if (this.T) this.T.dim = 1;
    this.tintEl?.remove();
    this.bannerEl?.remove();
  }
}
