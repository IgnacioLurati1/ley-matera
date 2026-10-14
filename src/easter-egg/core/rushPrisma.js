// Las dos prismáticas del rush de jefes que se usan con su tecla (el usuario,
// 2026-10-13: "Se me ocurrieron mas prismaticas: Heredero del caos (te da la
// guadaña de eclipse por 30 segundos, cooldown de un jefe en el medio, o sea el
// que estas no cuenta, el siguiente no la tendrias, el siguiente si). Solo
// online, Resurgir del mate (revive a todos los aliados con sus perks, un solo
// uso)"). Las cartas están en core/rushCards.js (RAROS); esto cuelga de
// core/rushBuild.js (g.rush.build.prisma), que lo arma con cada jefe.
//
// - Heredero del caos (tecla 'heredero', el 5): el Desgarrador Cósmico de
//   Eclipse Matero (weapons/Desgarrador.js) en lugar del mate de la mano por
//   RAROS.heredero.secs; después vuelve tu mate (sube, como al cambiar). Usada
//   en el jefe N, en el N+1 descansa y en el N+2 vuelve (el mazo guarda en qué
//   jefe se usó: D.herJefe). La guadaña se arma y se compila al tomar la carta
//   (warm: sus modelos al grupo escondido de los mates, sus efectos y sus
//   sonidos), así la carga del jefe siguiente la deja lista y al usarla no
//   traba. A los compañeros se les avisa ('drafted' her) y arman la de su muñeco.
// - Resurgir del mate (tecla 'resurgir', el 6; solo sale en línea con
//   compañeros): una vez, levanta a todos los caídos y a los que ya se habían
//   ido a mirar, con los perks de sus cartas. Lo decide el anfitrión, como
//   cualquier levantar (el invitado lo pide: 'resPide'); el anfitrión avisa a
//   todos quiénes vuelven ('resurgir') y cada uno se levanta en su compu. Lo
//   ven todos: una columna de luz en cada uno y la onda en el que la usó.
//
// globalThis.__mduRushSinPoderes = true: estas dos no salen ni hacen nada.
import * as THREE from 'three';
import { RAROS } from './rushCards';
import { keyLabel } from './controls';
import { PLAYER } from '../config/rules';
import { RUSH_ICONS } from '../ui/rushIcons';
import { desgarradorModel } from '../weapons/desgarradorModels';

export const poderesOff = () => globalThis.__mduRushSinPoderes === true;

const ID = 'desgarrador';
// la mejorada, con la Furia (el usuario, 2026-10-13 noche: "que de la guadaña
// mejorada"); globalThis.__mduHerComun = true: la común de antes
const herUp = () => (globalThis.__mduHerComun === true ? 0 : 1);
// el último tramo de la guadaña: el medallón titila (s)
const HER_LOW = 5;
// (invitado) cuánto se espera la respuesta del anfitrión antes de dejar pedir otra vez (s)
const RES_WAIT = 2.5;
// la columna de luz de cada uno que vuelve (s)
const COL_T = 1.8;
// los colores: el violeta de la guadaña y el verde con oro del mate
const VIO = [0.62, 0.3, 1];
const VIO2 = [0.25, 0.05, 0.5];
const ORO = [1, 0.84, 0.36];
const VERDE = [0.55, 1, 0.4];
const tmpV = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default class RushPrisma {
  constructor(build) {
    this.b = build;
    this.g = build.g;
    this.fxs = [];
    this.mates = new Set();
    this.warmed = false;
    this.reset();
  }

  // Sin cartas (fuera del rush o al empezar cada jefe; set las vuelve a poner).
  reset() {
    if (this.herOn) this.endHer(true);
    this.D = null;
    this.her = false;
    this.res = false;
    this.herOn = false;
    this.herUntil = 0;
    this.herEntry = null;
    this.herStash = null;
    this.resWait = 0;
    this.hudKey = '';
  }

  // (RushBuild.set, al empezar cada jefe) Lo que hay en el mazo.
  set(D, raros) {
    this.reset();
    if (poderesOff() || !D) return;
    this.D = D;
    this.her = raros.has('heredero');
    this.res = raros.has('resurgir');
    // (por si la carta llegó sin pasar por la pantalla: acá ya es tarde para la
    // carga, pero mejor que al usarla)
    if (this.her) this.warm();
  }

  // ---------------- Heredero del caos ----------------
  // La guadaña lista: sus modelos de la mano al grupo escondido de los mates
  // (la carga del jefe que sigue los compila: ui/Arrival compile), sus
  // efectos (Weapons.warmFx) y sus sonidos (Arrival: fx.bake).
  warm() {
    const C = this.g.weapons?.cosmic;
    if (!C || this.warmed) return;
    this.warmed = true;
    try {
      C.wake();
      C.prepare();
    } catch (err) {
      console.error(err);
    }
  }

  // (otro jugador tiene la carta) La de su muñeco: los mismos materiales del
  // mundo que usa net/Avatars, compilados en la carga y no al verla.
  warmMate(id) {
    const W = this.g.weapons;
    const C = W?.cosmic;
    if (!C || poderesOff() || this.mates.has(id)) return;
    this.mates.add(id);
    try {
      C.wake();
      if (!this.worldWarm && W.warm) {
        this.worldWarm = desgarradorModel(herUp());
        W.warm.add(this.worldWarm);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ¿Cómo está? 'on' (en la mano), 'ready', 'usada' (este jefe ya) o 'descansa'.
  get herState() {
    if (this.herOn) return 'on';
    const j = this.D?.herJefe;
    const i = this.g.rush?.i | 0;
    if (j == null) return 'ready';
    if (j === i) return 'usada';
    if (i === j + 1) return 'descansa';
    return 'ready';
  }

  useHer() {
    const g = this.g;
    const W = g.weapons;
    const C = W?.cosmic;
    if (!C || this.herState !== 'ready' || W.temp || !W.slots?.length || ['knife', 'throw', 'drink'].includes(W.state)) return false;
    this.warm();
    const i = Math.max(0, Math.min(W.cur, W.slots.length - 1));
    const up = herUp();
    const st = W.statsOf(ID, up);
    this.herStash = W.slots[i];
    this.herEntry = { id: ID, up, mag: st.mag, reserve: st.reserve, her: true };
    W.slots[i] = this.herEntry;
    W.cur = i;
    W.startRaise();
    this.D.herJefe = g.rush.i | 0;
    this.herOn = true;
    this.herUntil = g.time + (RAROS.heredero.secs || 30);
    const P = g.player;
    this.fxHer(P.pos.x, P.pos.y, P.pos.z, true, false);
    this.b.flash('is-heredero');
    this.pop('her');
    this.b.share({ k: 'heredero', x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2) });
    return true;
  }

  // Se terminó: vuelve el mate que estaba (sube, como al cambiar), y la
  // guadaña se deshace en polvo violeta. quiet: sin efecto (otro jefe, se salió).
  endHer(quiet = false) {
    const g = this.g;
    const W = g.weapons;
    const e = this.herEntry;
    this.herOn = false;
    this.herEntry = null;
    const back = this.herStash;
    this.herStash = null;
    if (!W || !e) return;
    const i = W.slots.indexOf(e);
    if (i >= 0) {
      if (back) W.slots[i] = back;
      else W.slots.splice(i, 1);
      if (!W.slots.length) W.slots.push(W.startSlot());
      W.cur = Math.min(W.cur, W.slots.length - 1);
      if (!quiet && (i === W.cur || !back)) W.startRaise();
      else W.updateHud?.();
    }
    if (quiet) return;
    const P = g.player;
    let at = null;
    try {
      at = W.cosmic?.handWorld?.(new THREE.Vector3(), 0.1, -0.12, -0.7);
    } catch {
      at = null;
    }
    this.fxHer(P.pos.x, P.pos.y, P.pos.z, true, true, at);
    try {
      W.cosmic?.fx?.play?.('desg-vuelve', { gain: 0.7 });
    } catch {
      /* sin el sonido */
    }
    this.b.share({ k: 'herFin', x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2) });
  }

  // El rasgón violeta al aparecer (o el polvo al irse): en el que la usa,
  // alrededor y sin tapar la cámara; en los demás, sobre su gaucho.
  fxHer(x, y, z, me, end, hand = null) {
    const g = this.g;
    const F = g.fx;
    if (end) {
      const c = hand || tmpV.set(x, y + 1.3, z);
      for (let i = 0; i < (me ? 34 : 44); i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 0.4 + Math.random() * 1.6;
        F.add.spawn(c.x + (Math.random() - 0.5) * 0.3, c.y + (Math.random() - 0.3) * (me ? 0.3 : 1.2), c.z + (Math.random() - 0.5) * 0.3, Math.cos(a) * s, 0.4 + Math.random() * 1.4, Math.sin(a) * s, { color: i % 3 ? VIO : [1.2, 0.8, 1.4], size: me ? 0.035 : 0.07, size1: 0, life: 0.6 + Math.random() * 0.5, drag: 2.2, gravity: -0.4 });
      }
      F.flash(tmpV.set(x, y + 1.2, z), 0x9a4cff, me ? 3 : 6, 0.25, 6);
      if (!me) this.b.sound('heredero', 0.35, 1.35, new THREE.Vector3(x, y + 1, z));
      return;
    }
    // el anillo violeta y negro que se abre desde los pies, y chispas que suben
    const n = 48;
    const r0 = me ? 1.2 : 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const v = 7 + Math.random() * 3;
      F.add.spawn(x + c * r0, y + (me ? 0.15 : 0.4), z + s * r0, c * v, 0.5, s * v, { color: i % 2 ? VIO : [1.1, 0.6, 1.3], size: me ? 0.12 : 0.18, size1: 0.03, life: 0.55, drag: 4 });
      F.alpha.spawn(x + c * 0.7, y + 0.2, z + s * 0.7, c * v * 0.4, 0.8 + Math.random(), s * v * 0.4, { color: VIO2, size: 0.3, size1: 1.4, life: 0.9 + Math.random() * 0.4, alpha: 0.45, drag: 2.5, gravity: -0.3 });
      if (i % 3 === 0) F.add.spawn(x + c * 0.5, y + 0.2 + Math.random() * 1.5, z + s * 0.5, c * 0.5, 2 + Math.random() * 2, s * 0.5, { color: VIO, size: 0.06, size1: 0, life: 0.8, drag: 1 });
    }
    F.flash(tmpV.set(x, y + (me ? 0.4 : 1.2), z), 0x9a4cff, me ? 6 : 10, 0.35, 9);
    this.b.sound('heredero', me ? 1 : 0.75, 1, me ? null : new THREE.Vector3(x, y + 1, z));
    if (me) F.addShake(0.25);
  }

  // ---------------- Resurgir del mate ----------------
  // ¿Hay alguien para levantar? (caído o mirando)
  caidos() {
    const N = this.g.net;
    if (!N) return false;
    for (const r of N.remote.values()) if (r.downed || r.dead) return true;
    return false;
  }

  useRes() {
    const g = this.g;
    const N = g.net;
    if (!this.res || this.D?.resUsed || this.resWait > g.time || !N) return false;
    if (!this.caidos()) {
      // (nadie para levantar: el medallón dice que no, sin gastarla)
      this.nope('res');
      return false;
    }
    if (N.host) return this.hostRes(N.id);
    this.resWait = g.time + RES_WAIT;
    N.share('rush', { a: 'resPide', id: N.id });
    return true;
  }

  // (anfitrión) Quiénes vuelven: los caídos y los que miran, menos el que la usó.
  hostRes(by) {
    const g = this.g;
    const N = g.net;
    if (!N?.host || poderesOff()) return false;
    const ids = [];
    for (const [id, r] of N.remote) if (id !== by && (r.downed || r.dead)) ids.push(id);
    const P = g.player;
    if (by !== N.id && (!P.alive || P.downed)) ids.push(N.id);
    if (!ids.length) return false;
    const m = { a: 'resurgir', by, ids };
    g.rush.send(m);
    this.onRes(m);
    return true;
  }

  // (todos) El anfitrión dice quiénes vuelven: lo ven todos y cada uno se levanta en su compu.
  onRes(m) {
    const g = this.g;
    const N = g.net;
    const me = N ? N.id : 0;
    const ids = Array.isArray(m.ids) ? m.ids.map((x) => x | 0) : [];
    const by = m.by | 0;
    if (by === me && this.D) {
      this.D.resUsed = true;
      this.resWait = 0;
      this.out('res');
    }
    const posOf = (id) => (id === me ? g.player.pos : N?.remote.get(id)?.pos);
    for (const id of ids) {
      const r = N?.remote.get(id);
      if (r) {
        r.downed = false;
        r.dead = false;
      }
      this.fxs.push({ k: 'col', id, me: id === me, t: 0, until: g.time + COL_T });
      const p = posOf(id);
      if (p) {
        this.ring(p.x, p.y, p.z, id === me, 0.6);
        if (id !== me) g.fx.flash(tmpV.set(p.x, p.y + 1.4, p.z), 0xc8ff80, 9, 0.5, 9);
      }
    }
    const p = posOf(by);
    if (p) {
      this.ring(p.x, p.y, p.z, by === me, 1);
      g.fx.flash(tmpV.set(p.x, p.y + (by === me ? 0.4 : 1.2), p.z), 0xc8ff80, by === me ? 7 : 12, 0.4, 12);
    }
    this.b.sound('resurgir', 1, 1, by === me || !p ? null : new THREE.Vector3(p.x, p.y + 1, p.z));
    if (ids.includes(me)) this.levantar(by);
  }

  // A mí: de pie (caído o mirando), con la vida llena y los perks de las cartas
  // (al caer se pierden: Player.goDown). Con la Mula, el tercer mate que se fue.
  levantar(by) {
    const g = this.g;
    const P = g.player;
    const W = g.weapons;
    if (P.downed) P.revive();
    else if (!P.alive) {
      // (se había ido a mirar: se levanta donde cayó, con su columna de luz; al
      // lado del que la usó solo si ese lugar ya no tiene piso. Llevarlo al
      // lado se veía como un salto: el muñeco se deslizaba desde donde cayó)
      g.hud.setSpectate?.(null);
      P.alive = true;
      P.downed = false;
      P.bleed = 0;
      P.eye = PLAYER.eye;
      const fy = g.world.floorAt(P.pos.x, P.pos.z, P.pos.y + 1);
      const r = g.net?.remote.get(by);
      if (!(Number.isFinite(fy) && Math.abs(fy - P.pos.y) < 1.5) && r?.pos) {
        const a = Math.random() * Math.PI * 2;
        const x = r.pos.x + Math.cos(a) * 2.2;
        const z = r.pos.z + Math.sin(a) * 2.2;
        P.pos.set(x, g.world.floorAt(x, z, (r.pos.y || 0) + 1), z);
      }
      g.onPlayerRevived();
    }
    const D = g.rush?.deck;
    for (const id of D?.perks || []) if (!P.perks.has(id)) P.givePerk(id);
    if (W && D) {
      for (const x of D.guns) {
        if (W.slots.length >= W.maxSlots || W.slots.some((s) => s.id === x.id)) continue;
        const st = W.statsOf(x.id, x.up);
        W.slots.push({ id: x.id, up: x.up, mag: st.mag, reserve: st.reserve });
      }
      W.updateHud?.();
    }
    P.health = P.maxHealth;
    this.b.flash('is-resurgir');
  }

  // La onda que se abre a los pies (verde y oro).
  ring(x, y, z, me, k) {
    const F = this.g.fx;
    const n = Math.round(40 * k + 16);
    const r0 = me ? 1.2 : 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const v = (6 + Math.random() * 2) * (0.6 + k * 0.6);
      F.add.spawn(x + c * r0, y + (me ? 0.12 : 0.3), z + s * r0, c * v, 0.3, s * v, { color: i % 2 ? ORO : VERDE, size: me ? 0.12 : 0.2, size1: 0.03, life: 0.6, drag: 3.5 });
    }
  }

  // ---------------- cada cuadro ----------------
  // (RushBuild.update, jugando y con las cartas puestas) Las teclas y el reloj de la guadaña.
  update() {
    const g = this.g;
    if (!this.D) return;
    const P = g.player;
    const I = g.input;
    const can = P.alive && !P.downed && !P.ghost && !g.intro?.active && !g.ee?.scene && !I.key('AltLeft');
    if (this.her && can && I.hit('Digit5')) {
      if (!this.useHer()) this.nope('her');
    }
    if (this.res && can && I.hit('Digit6')) this.useRes();
    if (this.herOn) {
      // (se la sacaron de las manos —otra partida, un arma de la pared en su lugar—: listo)
      if (!g.weapons?.slots?.includes(this.herEntry)) {
        this.herEntry = null;
        this.endHer(true);
      } else if (g.time >= this.herUntil) this.endHer();
    }
  }

  // (siempre) Lo que dura de los efectos: la columna de luz de cada uno que vuelve.
  tick(dt) {
    const g = this.g;
    if (!this.fxs.length) return;
    const N = g.net;
    for (const f of this.fxs) {
      f.t += dt;
      const p = f.me ? g.player.pos : N?.remote.get(f.id)?.pos;
      if (!p) continue;
      const k = clamp01(1 - f.t / COL_T);
      const n = f.me ? 2 : 8;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = (f.me ? 0.8 : 0.35) + Math.random() * 0.3;
        F(g).add.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 0.4, p.z + Math.sin(a) * r, 0, 2.5 + Math.random() * 2.5, 0, { color: Math.random() < 0.5 ? ORO : VERDE, size: (f.me ? 0.05 : 0.13) * (0.6 + k * 0.6), size1: 0, life: 0.7 + Math.random() * 0.4, drag: 0.6 });
      }
      // (las hojas de yerba que suben dando vueltas)
      if (Math.random() < (f.me ? 0.2 : 0.5)) {
        const a = Math.random() * Math.PI * 2;
        F(g).alpha.spawn(p.x + Math.cos(a) * 0.6, p.y + 0.2, p.z + Math.sin(a) * 0.6, -Math.sin(a) * 1.2, 1.4 + Math.random(), Math.cos(a) * 1.2, { color: [0.3, 0.55, 0.18], size: 0.06, size1: 0.04, life: 1.2, alpha: 0.85, drag: 0.8, gravity: 0.3 });
      }
    }
    this.fxs = this.fxs.filter((f) => f.t < COL_T);
  }

  // (RushBuild.onFx) Lo que hizo otro jugador.
  onFx(m) {
    const x = +m.x || 0;
    const y = +m.y || 0;
    const z = +m.z || 0;
    if (m.k === 'heredero') this.fxHer(x, y, z, false, false);
    else if (m.k === 'herFin') this.fxHer(x, y, z, false, true);
  }

  // ---------------- el HUD ----------------
  // Un medallón por carta al lado del de la habilidad (core/rushBuild.js
  // build: .mdu-rbrow), con su tecla: la guadaña con el aro que se vacía
  // mientras la tenés y "descansa" el jefe siguiente; el Resurgir, que se
  // prende cuando hay alguien para levantar y se va al usarlo.
  // Devuelve si hay alguno a la vista.
  hud(el, force = false) {
    const g = this.g;
    const on = !!this.D && this.b.on;
    const hs = this.her ? this.herState : '';
    const hk = hs === 'on' ? clamp01((this.herUntil - g.time) / (RAROS.heredero.secs || 30)) : hs === 'ready' ? 1 : 0;
    const resOn = this.res && (!this.D?.resUsed || this.resOut);
    const call = this.res && !this.D?.resUsed && this.caidos();
    const key = `${on}|${hs}|${Math.round(hk * 60)}|${resOn}|${call}|${this.D?.resUsed ? 1 : 0}`;
    if (force || key !== this.hudKey) {
      this.hudKey = key;
      const row = el.querySelector('.mdu-rbrow') || el;
      const med = (cls, id, action) => {
        let m = row.querySelector(`.${cls}`);
        if (!m) {
          m = document.createElement('div');
          m.className = `mdu-hab mdu-pw ${cls}`;
          m.innerHTML = `<i class="mdu-hab__ring"></i><span class="mdu-hab__art">${RUSH_ICONS[id] || ''}</span><kbd class="mdu-hab__key"></kbd><b class="mdu-pw__tag"></b>`;
          m.title = RAROS[id]?.name || id;
          row.appendChild(m);
        }
        m.querySelector('.mdu-hab__key').textContent = keyLabel(action);
        return m;
      };
      const h = med('mdu-pw--her', 'heredero', 'heredero');
      const showH = on && this.her;
      h.classList.toggle('is-on', showH);
      if (showH) {
        h.style.setProperty('--k', hk.toFixed(3));
        h.classList.toggle('is-ready', hs === 'ready' || hs === 'on');
        h.classList.toggle('is-live', hs === 'on');
        h.classList.toggle('is-low', hs === 'on' && this.herUntil - g.time < HER_LOW);
        h.querySelector('.mdu-pw__tag').textContent = hs === 'descansa' ? 'descansa' : '';
      }
      const r = med('mdu-pw--res', 'resurgir', 'resurgir');
      const showR = on && resOn;
      r.classList.toggle('is-on', showR);
      if (showR) {
        r.style.setProperty('--k', '1');
        r.classList.toggle('is-ready', call);
        r.classList.toggle('is-call', call);
      }
    }
    return on && ((this.her && !!hs) || !!resOn);
  }

  // el medallón salta al usar
  pop(which) {
    const m = this.b.el?.querySelector(`.mdu-pw--${which}`);
    if (!m) return;
    m.classList.remove('is-pop', 'is-no');
    void m.offsetWidth;
    m.classList.add('is-pop');
  }

  // no se puede: el medallón dice que no con la cabeza
  nope(which) {
    const m = this.b.el?.querySelector(`.mdu-pw--${which}`);
    if (!m) return;
    m.classList.remove('is-pop', 'is-no');
    void m.offsetWidth;
    m.classList.add('is-no');
  }

  // usada la de una vez: salta y se va achicando
  out(which) {
    const m = this.b.el?.querySelector(`.mdu-pw--${which}`);
    if (!m) return;
    this.resOut = true;
    m.classList.remove('is-pop', 'is-no');
    void m.offsetWidth;
    m.classList.add('is-out');
    clearTimeout(this.outT);
    this.outT = setTimeout(() => {
      this.resOut = false;
      m.classList.remove('is-out');
      this.hudKey = '';
    }, 900);
  }
}

const F = (g) => g.fx;
