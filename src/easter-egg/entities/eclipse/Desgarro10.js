import * as THREE from 'three';
import { ISLANDS } from '../../config/maps/eclipse';
import { zombieHealth } from '../../config/rules';
import { prefetchTrack } from '../../core/music';
import { islaAt, players, myId, isHost } from './common';
import Jinetes, { S } from './jinetes';
import Cupula from './cupula';

// El evento de cada 10 rondas de Eclipse Matero: el "Desgarro Cósmico"
// (entities/EclipseEgg.js lo registra en g.defense). No hay minijefe en este
// mapa: en la ronda 10, 20, 30... (o antes, si el cañón de la Torre lo fuerza:
// forceEarly, lo llama el easter egg) la pelea de Francisco y el Chiquitijuein
// en el cielo llega a su ronda clave y el cielo se raja.
//  · Nuestros cuatro gauchos, en su forma de caballeros de la luz, bajan en
//    columnas de luz en la isla donde están los jugadores y levantan una
//    cúpula de cuatro colores (entities/eclipse/cupula.js).
//  · Los jinetes del apocalipsis, ánimas encapuchadas sobre caballos de
//    hueso, salen de grietas del cielo, dan vueltas alto y se tiran en picada
//    a embestir (entities/eclipse/jinetes.js). Adentro de la cúpula no pegan:
//    le pegan a ella, que se gasta con cada golpe; cada jinete bajado la
//    repone. Si cae, embisten libres hasta que los caballeros la levantan de
//    nuevo (20 s).
//  · Termina a los ~90 s o al caer el último jinete: puntos para todos, un max
//    ammo (lo tira el anfitrión) y los caballeros se hunden en luz. El cielo
//    late al empezar y al terminar. Con música (el coro, core/music.js
//    'desgarro-eclipse'). Mientras dura, la ronda no se termina (holding).
// En línea lo lleva el anfitrión ('pee' k 'd10'): arranca, dónde están los
// jinetes (10 por segundo), los golpes a la cúpula, las bajas, el final; el
// que entra tarde lo recibe en state/applyFull. Cada compu se cuida su jugador.
// Contrato que miran Rounds y Zombies (guias/03 §8.1): onRound, holding,
// onRoundEnd, shielded, root (ui/Arrival calienta lo escondido), active (false:
// los muertos siguen como siempre).

export const EVERY = 10;
const ISLE_KEYS = Object.keys(ISLANDS);
const TRACK = 'desgarro-eclipse';
// el reloj del evento (s): levantan los mates, sale la cúpula, salen los jinetes, se termina
const T_RAISE = 2.6;
const T_DOME = 3.3;
const T_JIN = 5.6;
const DUR = 95;
// la cúpula: cuánto le saca cada embestida, cuánto le devuelve cada jinete bajado, cuánto tarda en volver
const DOME_HIT = 0.1;
const DOME_KILL = 0.1;
const DOWN_T = 20;
// cada cuánto sale un jinete, y cada cuánto se manda dónde están
const SPAWN_EVERY = 1.1;
const SNAP = 0.1;
const KILL_PTS = 150;
const REWARD = 1500;
const REWARD_LOW = 500;
// los jugadores que los jinetes persiguen: a esta distancia (en planta) del medio de la cúpula
const HUNT_R = 95;
// la cúpula se gasta sola (por segundo) y se achica: sin bajar jinetes se cae
const DOME_DRAIN = 0.011;
// las cargas sincronizadas (s desde el arranque) y cuánto duran; los caballeros pegan cada tanto
const CHARGES = [30, 58, 80];
const CHARGE_T = 4;
const KNIGHT_EVERY = 9;
const KNIGHT_R = 7;
// la oscuridad que invade la isla (el cielo de la Disformidad que se mete): hasta cuánto
const DIM_MAX = 0.6;
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpCol = new THREE.Color();

export default class Desgarro10 {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'desgarro10';
    g.scene.add(this.root);
    // on: 0 nada, 1 en curso; t: segundos desde que arrancó (todas las compus);
    // i: la isla (índice de ISLANDS); n: jinetes en total; h: la vida de cada uno;
    // sp: cuántos salieron; kd: cuántos cayeron; hp: la cúpula (0-1); br: rota;
    // dn: cuánto falta para que la levanten; done: ya pasó una vez; w: se ganó
    this.st = { on: 0, t: 0, i: 0, n: 0, h: 0, sp: 0, kd: 0, hp: 1, br: 0, dn: 0, done: 0, w: 0 };
    this.forced = false;
    this.early = false;
    this.skipRound = 0;
    // (anfitrión) cuánto falta para arrancar (después de la canción de la ronda)
    this.pendT = -1;
    this.snapT = 0;
    this.spawnT = 0;
    this.ended = false;
    this.raised = false;
    this.clock = 0;
    this.cupula = new Cupula(this);
    this.jin = new Jinetes(this);
    this.charge = 0;
    this.chargeN = 0;
    this.knightT = 0;
    this.hpT = 0;
    this.nextBig = false;
    this.alertEl = null;
    this.alertT = 0;
    this.bakeAlarm();
    this.killPts = KILL_PTS;
    // (en Eclipse no hay Yasy: los jinetes van en ese lugar para las armas)
    this.prevYasy = null;
    this.adapter = this.makeAdapter();
    prefetchTrack(TRACK);
  }

  get host() {
    return isHost(this.g);
  }

  // (ojo: Zombies lee `active` como el de la defensa del yerbal; acá los muertos siguen como siempre)
  get active() {
    return false;
  }

  // la ronda no termina mientras dura el evento
  get holding() {
    return this.st.on === 1;
  }

  // La cúpula levantada tapa al que está adentro (solo de los jinetes: a los
  // muertos de a pie ya los tienen adentro).
  shielded(z, p) {
    return !!z?.jinete && !!p && this.solid() && this.cupula.f(p) < 1;
  }

  // ¿La cúpula está entera y arriba?
  solid() {
    return this.st.on === 1 && !this.st.br && this.cupula.k > 0.85;
  }

  nPlayers() {
    return 1 + (this.g.net ? this.g.net.remote.size : 0);
  }

  // ---------------- las armas: los jinetes en g.yasy ----------------
  makeAdapter() {
    const J = this.jin;
    const prev = () => this.prevYasy;
    return {
      d10: this,
      hitTest: (o, d, maxT, hits) => {
        prev()?.hitTest?.(o, d, maxT, hits);
        J.hitTest(o, d, maxT, hits);
      },
      inRadius: (check) => {
        prev()?.inRadius?.(check);
        J.inRadius(check);
      },
      damage: (z, amount, info) => (z?.jinete ? J.damage(z, amount, info) : prev()?.damage?.(z, amount, info) ?? false),
      byId: (id) => J.byId(id) || prev()?.byId?.(id) || null,
      onMelee: () => prev()?.onMelee?.() || false,
      onEvent: (m) => prev()?.onEvent?.(m),
      pushers: (add) => prev()?.pushers?.(add),
      update: (dt) => prev()?.update?.(dt),
    };
  }

  install() {
    const g = this.g;
    if (g.yasy === this.adapter) return;
    this.prevYasy = g.yasy || null;
    g.yasy = this.adapter;
  }

  uninstall() {
    const g = this.g;
    if (g.yasy === this.adapter) g.yasy = this.prevYasy || null;
    this.prevYasy = null;
  }

  // ---------------- la red ----------------
  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'd10', ...m });
  }

  apply(m) {
    const st = this.st;
    switch (m?.a) {
      case 'start':
        this.start(m, false);
        break;
      case 'l':
        if (!this.host) this.jin.applySnap(m.l);
        break;
      case 'die':
        if (Number.isFinite(m.kd)) st.kd = m.kd;
        if (Number.isFinite(m.hp)) st.hp = m.hp;
        this.jin.die(this.jin.list[m.i], Array.isArray(m.p) ? m.p : null);
        break;
      case 'dh':
        if (Number.isFinite(m.hp)) st.hp = m.hp;
        if (Array.isArray(m.p)) this.cupula.hit(tmpV.set(m.p[0], m.p[1], m.p[2]));
        if (this.jin.list[m.i]) this.jin.list[m.i].flash = 1;
        break;
      case 'hp':
        if (Number.isFinite(m.hp)) st.hp = m.hp;
        break;
      case 'ch':
        this.charge = CHARGE_T;
        this.g.hud?.subtitle?.('¡La carga!', 2);
        this.g.fx?.addShake?.(0.45);
        if (this.g.world.eclipse) {
          this.g.world.eclipse.fightT = 0;
          this.g.world.eclipse.clashBig = true;
        }
        break;
      case 'kb':
        this.knightBurst(m.i, m.z || []);
        break;
      case 'dn':
        st.br = 1;
        st.hp = 0;
        st.dn = DOWN_T;
        this.cupula.want = 0;
        this.cupula.shatter();
        this.g.hud?.subtitle?.('¡Se rompió la cúpula!', 2.5);
        break;
      case 'up':
        st.br = 0;
        st.hp = 1;
        st.dn = 0;
        this.cupula.raise();
        break;
      case 'end':
        this.finish(m);
        break;
      default:
    }
  }

  // (lo que manda un invitado: nada por ahora; los golpes van por Session 'hit')
  onGuest() {}

  state() {
    const s = this.st;
    return { on: s.on, t: +s.t.toFixed(2), i: s.i, n: s.n, h: s.h, sp: s.sp, kd: s.kd, hp: +s.hp.toFixed(3), br: s.br, dn: +s.dn.toFixed(2), done: s.done, w: s.w };
  }

  applyFull(s) {
    if (!s) return;
    this.st.done = s.done || 0;
    if (s.on && !this.st.on) this.start(s, true);
  }

  // ---------------- cuándo ----------------
  // el cañón de la Torre: el evento, ya (si no pasó ni está pasando)
  forceEarly() {
    const R = this.g.rounds;
    if (!this.host || this.forced || this.st.on || this.st.done || !R || R.round >= EVERY) return;
    this.forced = true;
    this.skipRound = EVERY;
    if (R.state === 'active' && !this.ee.scene) this.begin();
    else this.early = true;
  }

  // (anfitrión, Rounds.nextRound) cada 10 rondas, después de la canción de la ronda
  onRound(R) {
    if (!this.host || this.st.on || this.pendT >= 0) return;
    const due = R.round >= EVERY && R.round % EVERY === 0 && R.round !== this.skipRound;
    if ((due || this.early) && !this.ee.scene) {
      this.early = false;
      this.pendT = R.introAt?.() ?? 1.5;
    }
  }

  onRoundEnd() {}

  // (anfitrión) Arranca: la isla con más jugadores (empate: la del anfitrión),
  // cuántos jinetes y cuánta vida (sube con la ronda y los jugadores).
  begin(round = null) {
    const g = this.g;
    if (!this.host || this.st.on) return;
    const np = this.nPlayers();
    const r = round ?? g.rounds?.round ?? EVERY;
    const cnt = {};
    for (const p of players(g)) {
      if (p.downed) continue;
      const k = islaAt(g, p.pos);
      if (k && ISLANDS[k]) cnt[k] = (cnt[k] || 0) + 1 + (p.id === myId(g) ? 0.5 : 0);
    }
    let isla = 'centro';
    let best = 0;
    for (const [k, n] of Object.entries(cnt)) {
      if (n > best) {
        best = n;
        isla = k;
      }
    }
    const n = Math.min(30, 18 + 4 * (np - 1));
    const h = Math.round(zombieHealth(Math.max(r, EVERY)) * 1.15 * (1 + 0.2 * (np - 1)));
    this.send({ a: 'start', i: Math.max(0, ISLE_KEYS.indexOf(isla)), n, h });
  }

  // (en todas) quiet: el que entra tarde, sin carteles ni música desde el principio.
  start(m, quiet) {
    const g = this.g;
    const st = this.st;
    st.on = 1;
    st.t = quiet ? +m.t || 0 : 0;
    st.i = m.i | 0;
    st.n = m.n | 0;
    st.h = m.h | 0;
    st.sp = m.sp | 0;
    st.kd = m.kd | 0;
    st.hp = Number.isFinite(m.hp) ? m.hp : 1;
    st.br = m.br | 0;
    st.dn = +m.dn || 0;
    st.w = 0;
    this.ended = false;
    this.raised = false;
    this.spawnT = 0;
    this.isla = ISLE_KEYS[st.i] || 'centro';
    this.jin.reset();
    this.jin.bake();
    this.cupula.bake();
    this.cupula.place(this.isla);
    this.cupula.arrive(st.t);
    this.cupula.want = 0;
    if (st.t >= T_RAISE) {
      this.raised = true;
      if (!st.br) this.cupula.raise();
    }
    if (st.t >= T_DOME && !st.br) this.cupula.k = 1;
    this.install();
    this.music();
    if (quiet) return;
    g.world.eclipse?.pulse?.(1.2);
    g.fx.addShake?.(0.3);
    g.hud?.location?.('Desgarro Cósmico', '');
    this.alert(true);
  }

  music() {
    const g = this.g;
    g.music?.play(TRACK, { fadeIn: 1.5, while: (G) => G.ee?.d10 === this && this.st.on === 1 && (G.state === 'playing' || G.state === 'paused') });
  }

  // (en todas) Se terminó: los jinetes que quedan se van, los caballeros se hunden en luz.
  finish(m) {
    const g = this.g;
    const st = this.st;
    if (!st.on) return;
    st.on = 0;
    st.done = 1;
    st.w = m.w ? 1 : 0;
    if (Number.isFinite(m.kd)) st.kd = m.kd;
    this.cupula.want = 0;
    this.cupula.leave();
    this.jin.flee();
    g.world.eclipse?.pulse?.(1);
    g.addPoints?.(st.w ? REWARD : REWARD_LOW, null, true);
    // el max ammo, en el medio de la isla (o donde haya piso libre: Cupula.dropSpot)
    if (this.host) g.powerups?.drop(this.cupula.dropSpot(new THREE.Vector3()), true, 'maxammo');
  }

  // Ya (las escenas del easter egg): nada a la vista, sin premio.
  vanish() {
    this.st.on = 0;
    this.pendT = -1;
    this.jin.reset();
    this.cupula.hide();
    this.uninstall();
  }

  // ---------------- lo que pasa ----------------
  // (anfitrión) A quién se le tira el próximo: alguien vivo, de pie y cerca de la
  // cúpula; mejor uno al que no le está yendo ya otro.
  pickTarget(list) {
    const g = this.g;
    const C = this.cupula.c;
    const out = [];
    const near = (p) => Math.hypot(p.x - C.x, p.z - C.z) < HUNT_R && p.y > C.y - 12;
    if (g.player.alive && !g.player.downed && near(g.player.pos)) out.push({ id: myId(g), pos: g.player.pos });
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && !r.ghost && r.pos && near(r.pos)) out.push({ id: r.id, pos: r.pos });
    if (!out.length) return null;
    const busy = new Set(list.filter((J) => J.st === S.wind || J.st === S.dive).map((J) => J.tgt));
    const free = out.filter((p) => !busy.has(p.id));
    let pool = free.length ? free : out;
    // (los que están afuera de la cúpula, primero: adentro solo le pegan a ella)
    const open = pool.filter((p) => !this.shielded({ jinete: true }, p.pos));
    if (open.length && Math.random() < 0.8) pool = open;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Dónde está ese jugador (si sigue de pie), o null.
  playerPos(id) {
    const g = this.g;
    if (id === myId(g)) return g.player.alive && !g.player.downed ? g.player.pos : null;
    const r = g.net?.remote.get(id);
    return r && !r.dead && !r.downed ? r.pos : null;
  }

  // (anfitrión) Un jinete le pegó a la cúpula: se gasta (y, si cae, se rompe).
  domeHit(J) {
    const st = this.st;
    const n = this.cupula.normal(J.pos, tmpN);
    this.jin.bounce(J, n);
    const hp = Math.max(0, +(st.hp - DOME_HIT).toFixed(3));
    this.send({ a: 'dh', i: J.i, p: [+J.pos.x.toFixed(2), +J.pos.y.toFixed(2), +J.pos.z.toFixed(2)], hp });
    if (hp <= 0) this.send({ a: 'dn' });
  }

  // (anfitrión) Un jinete bajado (Jinetes.damage): la cúpula se repone un poco.
  onKill(J) {
    const st = this.st;
    const kd = st.kd + 1;
    const hp = st.br ? 0 : Math.min(1, +(st.hp + DOME_KILL).toFixed(3));
    const c = J.hs[1];
    this.send({ a: 'die', i: J.i, p: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], kd, hp });
  }

  update(dt) {
    const g = this.g;
    const st = this.st;
    this.clock += dt;
    const playing = g.state === 'playing';
    if (playing && this.host && this.pendT >= 0) {
      this.pendT -= dt;
      if (this.pendT <= 0) {
        this.pendT = -1;
        this.begin();
      }
    }
    if (st.on && playing) {
      st.t += dt;
      if (!this.raised && st.t >= T_RAISE) {
        this.raised = true;
        if (!st.br) this.cupula.raise();
      }
      this.cupula.want = st.t >= T_DOME && !st.br ? 1 : 0;
      if (st.br) st.dn = Math.max(0, st.dn - dt);
      if (this.charge > 0) this.charge -= dt;
      // la cúpula se achica con lo gastada que está
      const D = this.cupula;
      if (D.R0) {
        const R = D.R0 * (st.br ? 0.3 : 0.5 + 0.5 * st.hp);
        if (Math.abs(R - D.R) > 0.05) {
          D.R = R;
          D.dome.scale.set(D.R, D.Ry, D.R);
          D.dome.updateMatrixWorld(true);
          D.mat.uniforms.uScale.value = D.Ry / D.R;
          D.mat.uniforms.uS.value.set(D.R, D.Ry, D.R);
        }
      }
      // la oscuridad que invade la isla: sube con el evento y se va al final
      const A = g.weather?.atmos;
      if (A) A.dimForce = Math.min(DIM_MAX, Math.max(0, (st.t - T_JIN) / 25) * DIM_MAX);
      if (this.host) this.hostTick(dt);
    }
    if (!st.on && g.weather?.atmos?.dimForce > 0) g.weather.atmos.dimForce = Math.max(0, g.weather.atmos.dimForce - dt * 0.3);
    this.alertTick(dt);
    this.jin.update(dt, playing);
    this.cupula.update(dt, this.clock);
    // (los jinetes salen del lugar de los Yasy cuando no queda ninguno)
    if (!st.on && this.jin.idle()) this.uninstall();
  }

  // (anfitrión) Los que salen, la cúpula que vuelve, dónde están y el final.
  hostTick(dt) {
    const st = this.st;
    const g = this.g;
    if (st.br && st.dn <= 0) this.send({ a: 'up' });
    // la cúpula se gasta sola: sin bajar jinetes, se cae (y se avisa cada segundo)
    if (!st.br && st.t >= T_JIN) {
      st.hp = Math.max(0, st.hp - DOME_DRAIN * dt);
      this.hpT -= dt;
      if (st.hp <= 0) this.send({ a: 'dn' });
      else if (this.hpT <= 0) {
        this.hpT = 1;
        this.send({ a: 'hp', hp: +st.hp.toFixed(3) });
      }
    }
    // las cargas sincronizadas: todos los jinetes a la vez, con el choque grande del cielo
    if (this.chargeN < CHARGES.length && st.t >= CHARGES[this.chargeN]) {
      this.chargeN++;
      this.send({ a: 'ch' });
    }
    // los caballeros pelean: cada tanto uno larga su elemento y barre lo que tiene cerca
    this.knightT -= dt;
    if (st.t >= T_JIN && this.knightT <= 0) {
      this.knightT = KNIGHT_EVERY;
      const K = this.cupula.knights || [];
      if (K.length) {
        const i = Math.floor(Math.random() * K.length);
        const c = K[i].r?.pos;
        const ids = [];
        if (c) for (const z of g.zombies.pool) if (z.active && !z.dead && !z.boss && !z.jinete && Math.hypot(z.pos.x - c.x, z.pos.z - c.z) < KNIGHT_R && Math.abs(z.pos.y - c.y) < 4) ids.push(z.id);
        this.send({ a: 'kb', i, z: ids });
      }
    }
    // la ronda aprieta mientras dura (más muertos, más seguido)
    if (g.rounds?.state === 'active') g.rounds.delay = Math.min(g.rounds.delay || 2, 0.7);
    this.spawnT -= dt;
    const cap = Math.min(10, 6 + Math.round(1.35 * (this.nPlayers() - 1)));
    if (st.t >= T_JIN && st.sp < st.n && this.spawnT <= 0 && this.jin.alive() < cap) {
      // (el último es la Muerte: más grande, el triple de vida)
      this.nextBig = st.sp === st.n - 1;
      if (this.jin.spawn(st.h)) {
        st.sp++;
        this.spawnT = SPAWN_EVERY;
      }
    }
    this.snapT -= dt;
    if (g.net && this.snapT <= 0) {
      this.snapT = SNAP;
      g.net.event('pee', { k: 'd10', a: 'l', l: this.jin.snap() });
    }
    if (!this.ended && (st.kd >= st.n || st.t >= DUR)) {
      this.ended = true;
      this.send({ a: 'end', w: st.kd >= st.n ? 1 : 0, kd: st.kd });
    }
  }

  // (en todas) Un caballero larga su elemento: lo que tenía cerca cae (el
  // anfitrión manda la lista), los jinetes de alrededor se queman, y se ve.
  knightBurst(i, ids) {
    const g = this.g;
    const K = this.cupula.knights?.[i];
    if (!K) return;
    const c = K.r?.pos;
    if (!c) return;
    K.beamK = Math.max(K.beamK || 0, 2.2);
    tmpCol.set(K.c ?? 0xd0a0ff);
    const col = [tmpCol.r, tmpCol.g, tmpCol.b];
    g.fx.flash?.(tmpV.set(c.x, c.y + 1.6, c.z), 0xffffff, 8, 0.35, 14);
    g.fx.sparkle?.(tmpV.set(c.x, c.y + 1.4, c.z), col, 24, 2.2);
    g.fx.addShake?.(0.12);
    if (this.host) {
      const set = new Set(ids);
      for (const z of g.zombies.pool) if (z.active && !z.dead && set.has(z.id)) g.zombies.kill?.(z, { type: 'blast', point: z.pos.clone() });
      for (const J of this.jin.list) if (J.z?.active && !J.z.dead && Math.hypot(J.pos.x - c.x, J.pos.z - c.z) < KNIGHT_R + 3 && J.pos.y < c.y + 9) this.jin.damage(J.z, J.z.maxHp * 0.25, { type: 'blast' });
    }
  }

  // ---------------- la alerta (el usuario: como la del encierro) ----------------
  // Un cartel que late arriba de todo y una alarma del desgarro (tres lamentos
  // que bajan, con un pulso grave), al arrancar.
  bakeAlarm() {
    const a = this.g.audio;
    if (!a?.ctx || !a.bakeSound) return;
    a.bakeSound('d10-alarma', 4.5, function (o, t) {
      for (let i = 0; i < 3; i++) {
        const t0 = t + i * 1.4;
        this.tone(o, { t: t0, dur: 1.1, type: 'sawtooth', freq: 920, freqEnd: 310, gain: 0.07, attack: 0.05 });
        this.tone(o, { t: t0, dur: 1.1, type: 'square', freq: 460, freqEnd: 155, gain: 0.03, attack: 0.05 });
        this.noise(o, { t: t0, dur: 0.9, type: 'bandpass', freq: 1800, freqEnd: 500, q: 4, gain: 0.3, attack: 0.03 });
        this.tone(o, { t: t0 + 0.1, dur: 0.6, type: 'sine', freq: 48, freqEnd: 36, gain: 0.45, attack: 0.01 });
      }
    });
  }

  alert(on) {
    const g = this.g;
    if (!on) {
      this.alertT = 0;
      return;
    }
    if (!this.alertEl) {
      const el = document.createElement('div');
      el.className = 'mdu-ecl-alert';
      el.style.cssText = 'position:fixed;left:0;right:0;top:14%;z-index:30;text-align:center;pointer-events:none;font-family:Cinzel,Georgia,serif;letter-spacing:0.18em;color:#f4e6ff;text-shadow:0 0 18px #a040ff,0 0 40px #5a10c0;opacity:0;transition:opacity .25s;';
      el.innerHTML = '<div style="font-size:42px;font-weight:700">DESGARRO C\u00d3SMICO</div><div style="font-size:16px;opacity:.85;letter-spacing:.3em;margin-top:6px">EL DESGARRO INVADE LA ISLA</div>';
      (g.hud?.root || document.body).appendChild(el);
      this.alertEl = el;
    }
    this.alertT = 5.5;
    const a = g.audio;
    const buf = a?.ctx && a.bakedBuf?.('d10-alarma');
    if (buf) a.playBuffer(buf, { gain: 1.1, reverb: 0.45 });
    g.post?.flash?.(0.3);
  }

  alertTick(dt) {
    const el = this.alertEl;
    if (!el) return;
    if (this.alertT > 0) {
      this.alertT -= dt;
      const k = Math.min(1, this.alertT / 0.6);
      el.style.opacity = String(k * (0.7 + 0.3 * Math.sin(this.clock * 9)));
    } else if (el.style.opacity !== '0') el.style.opacity = '0';
  }

  // Alt+I (core/music.js): ya, en la isla donde estás.
  debugStart() {
    if (!this.host || this.st.on) return;
    this.pendT = -1;
    this.begin(Math.max(EVERY, this.g.rounds?.round || 0));
  }

  dispose() {
    this.alertEl?.remove();
    this.alertEl = null;
    if (this.g.weather?.atmos) this.g.weather.atmos.dimForce = 0;
    this.uninstall();
    if (this.g.music?.is?.(TRACK)) this.g.music.stop(0.5);
    this.jin.dispose();
    this.cupula.dispose();
    this.root.removeFromParent();
  }
}
