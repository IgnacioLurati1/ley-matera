import * as THREE from 'three';
import { buildCampo, toWorld, toLocal, hLoc, clampLocal, rayCampo, SL0, F, edgeU } from '../../world/eclipse/sanlorenzoCampo';
import { ISLE_IDS, ECLIPSE_DIR } from '../../world/eclipseSky';
import { warmObject } from '../../fx/ghostMat';
import { WEAPONS } from '../../config/weapons';
import { zombieHealth, bossHealth } from '../../config/rules';
import { markEgg } from '../../core/eggs';
import { unlock } from '../../core/logros';
import { myId, isHost, players } from './common';
import Aliados from './slAliados';
import EclipseBoss, { SLAMS } from './slEclipse';
import CabralScene from './slCabral';

// La pelea final de Eclipse Matero: el Combate de San Lorenzo (3 de febrero de
// 1813). El corte con la Furia (entities/EclipseEgg.js) abre el desgarro y se
// entra a la arena: un mundo aparte, con las islas sacadas de la escena
// (world/eclipse/sanlorenzoCampo.js: el convento, el campo, la barranca y el
// Paraná). Diseño: scratchpad eclipse/SANLORENZO.md.
//  0. Llegada: detrás del muro del convento; el Gil le entrega el sable a San
//     Martín (mantener F) y San Martín monta.
//  1. El desembarco: suben los realistas por las dos bajadas; aguantar la
//     línea. Belgrano planta la bandera (un respiro); pasan las primeras cargas.
//  2. El Eclipse (entities/eclipse/slEclipse.js): sale del río; sombras que
//     caen; el manto lo protege hasta que se cortan sus tres amarras a tajos;
//     después se le pega (tiros al cuerpo, la guadaña a la mano apoyada).
//  3. Cabral (escena dentro del juego, entities/eclipse/slCabral.js): en una
//     carga que encabeza San Martín, El Eclipse le voltea el caballo.
//  4. Febo asoma: la Marcha, el sol sale de atrás del disco, cargas en pinza;
//     la corona se rompe solo con el rayo de la Furia (que se llena sola).
//  5. El final: El Eclipse se raja y queda el duende, que se ríe y se va;
//     blanco y EclipseEgg.arenaWon (la cinemática final se engancha ahí).
// Los aliados: entities/eclipse/slAliados.js. Lo lleva el anfitrión: todo
// viaja por 'pee' con k 'sl' (send / apply); los invitados mandan sus golpes
// (ask → onGuest); el que entra tarde recibe state() (applyFull).
// Contrato con EclipseEgg: start, update, apply, state, applyFull, onGuest,
// debugPhase, dispose, active.
// globalThis.__mduNoSanLorenzo === true: sin arena (el mapa se da por hecho al cortar).

const L = {};
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
// lo que hay que aguantar en el desembarco (muertos, solo; más con más jugadores)
const KILLS_P1 = 30;
// los muertos a la vez en cada fase (por jugador de más, la mitad)
const CAP = { 1: 10, 2: 12, 4: 16 };
// los tajos para cortar una amarra (solo; +50% por jugador de más)
const AM_CUTS = 6;
// a qué vida se termina la fase 2 (la carga de San Martín y Cabral)
const HP_CABRAL = 0.55;
// la corona: segundos de rayo por pedazo (solo)
const CROWN_SECS = 2.4;
// el respiro de la bandera: cada cuánto, a cuánto, cuánta vida
const FLAG_EVERY = 20;
const FLAG_R = 6.2;
const FLAG_HP = 35;
const SAY = { sanmartin: 'San Martín', cabral: 'Sargento Cabral', belgrano: 'Manuel Belgrano' };

export default class SanLorenzo {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.st = { on: 0, phase: 0, done: 0, sable: 0, kills: 0, need: 0, hp: 1, am: [1, 1, 1], unv: 0, cr: [1, 1, 1, 1], lit: -1, bel: 0 };
    this.built = false;
    this.top = null;
    this.t = 0;
    this.phT = 0;
    this.leadT = -1;
    this.chargeT = 0;
    this.spawnT = 0;
    this.shadowT = 0;
    this.slamT = 0;
    // (EclipseEgg no tiene sceneCam: Game la llama mientras hay una escena del
    // easter egg; la de Cabral la usa. Si main la agrega, queda la suya.)
    if (typeof ee.sceneCam !== 'function') ee.sceneCam = (dt) => (ee.scene ? ee.scene.update(dt) : false);
    if (globalThis.__mduNoSanLorenzo === true) return;
    // (todo se arma con el mapa, fuera de la escena, y se compila ya: al
    // entrar no se arma ni se compila nada)
    try {
      this.build();
    } catch (e) {
      console.error('San Lorenzo: no se pudo armar', e);
      this.built = false;
    }
  }

  get host() {
    return !this.g.net || this.g.net.host;
  }

  get active() {
    return this.st.on === 1;
  }

  // cuántos más fuertes con más jugadores (f: lo que suma cada uno de más)
  team(f) {
    return 1 + (players(this.g).length - 1) * f;
  }

  // ---------------- el armado (con el mapa) ----------------
  build() {
    const g = this.g;
    this.top = new THREE.Group();
    this.top.name = 'sanLorenzoTop';
    this.campo = buildCampo();
    // la textura de pasto de la granja sobre el suelo (antes de calentar: compila acá)
    const T = g.world?.T;
    if (T?.grass && this.campo.ground) {
      const m = this.campo.ground.material;
      m.map = T.grass;
      m.needsUpdate = true;
    }
    this.top.add(this.campo.root);
    // lo que va en coordenadas del mundo (personas, caballos, El Eclipse)
    this.actors = new THREE.Group();
    this.actors.name = 'sanLorenzoActores';
    this.top.add(this.actors);
    // San Martín, Belgrano y los granaderos; El Eclipse
    this.al = new Aliados(this);
    this.boss = new EclipseBoss(this);
    this.top.updateMatrixWorld(true);
    warmObject(g, this.top);
    // en la escena desde ya, escondido y dormido (core/matrixCache mcSleep: no
    // se recorre); la carga (ui/Arrival warmWorld) lo muestra dos cuadros con lo
    // escondido de adentro: así cada variante (G-buffer, sombras) se compila ahí
    // y no al entrar. (__mduNoSlWarm: como antes, afuera hasta entrar)
    if (globalThis.__mduNoSlWarm !== true) {
      this.top.visible = false;
      this.top.mcSleep = true;
      g.scene.add(this.top);
      const B = this.boss;
      (g.world.warmHidden ||= []).push(this.top, B.R.root, B.gnome.R.root, B.manto.m, ...B.amarras.flatMap((A) => [A.g, A.chain]), this.al.bel.cloth);
    }
    // entregarle el sable a San Martín (la F se arma con el mapa: el mismo número en todas las compus)
    this.sableIt = g.interact?.add({
      kind: 'ee',
      local: true,
      pos: toWorld(-47.0, 6.6, SL0.y + 1.1),
      radius: 2.7,
      holdTime: 1.4,
      prompt: () => {
        if (!this.active || this.st.phase !== 0 || this.st.sable) return null;
        return this.ee.isGil() ? { text: 'darle el sable a San Martín', noCost: true, hold: true } : { text: 'El Gil le da el sable', noCost: true, info: true };
      },
      cost: () => 0,
      use: () => {
        const who = g.net?.useFrom ?? myId(g);
        if (!this.active || this.st.phase !== 0 || this.st.sable || !this.ee.isGil(who)) return false;
        this.send({ a: 'sable', id: who });
        return true;
      },
    });
    this.built = true;
  }

  // Lo que dice alguien de la escena (en cada compu: lo manda la fase).
  say(who, text) {
    const g = this.g;
    const dur = g.audio?.say?.(text, who) || text.length * 0.065;
    g.hud?.speak?.(SAY[who] || who, text, dur + 1.4, who);
    return dur;
  }

  // ---------------- la red ----------------
  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'sl', ...m });
  }

  // (lo que un invitado le pide al anfitrión; el anfitrión lo hace ya)
  ask(m) {
    if (this.host) return this.onGuest(m, myId(this.g));
    this.g.net?.net?.send({ t: 'pee', k: 'sl', ...m });
  }

  apply(m) {
    if (!m) return;
    const B = this.boss;
    if (m.ph != null && m.ph !== this.st.phase) this.setPhase(m.ph, m);
    switch (m.a) {
      case 'sable':
        this.giveSable(m.id);
        break;
      case 'ch':
        this.al.charge(m.s, m.l, !!m.ld);
        if (m.s > 0 || m.ld) this.al.smPoint(2.4);
        break;
      case 'sh':
        B.shadows(m.p);
        break;
      case 'sl':
        B.slam(m.x, m.z);
        break;
      case 'am':
        this.st.am[m.i] = m.hp;
        B.setAmarra(m.i, m.hp);
        break;
      case 'un':
        this.st.unv = 1;
        B.unveil();
        this.g.hud?.subtitle?.('¡Sin el manto! Tiros al cuerpo, la guadaña a la mano.', 4);
        break;
      case 'hp':
        this.st.hp = m.k;
        break;
      case 'kc':
        this.st.kills = m.n;
        this.st.need = m.need;
        break;
      case 'lit':
        this.st.lit = m.i;
        B.light(m.i);
        break;
      case 'cr':
        this.st.cr[m.i] = m.hp;
        B.setCrown(m.i, m.hp);
        break;
      case 'bel':
        this.st.bel = m.i;
        this.al.belTo(m.i);
        break;
    }
  }

  // Lo que manda un invitado (solo el anfitrión).
  onGuest(m) {
    if (!this.active || !this.host || !m) return;
    if (m.h === 'am') this.hitAmarra(m.i, m.n || 1);
    else if (m.h === 'bd') this.hitBoss(m.d, true);
    else if (m.h === 'cr') this.hitCrown(m.i, m.d, true);
  }

  state() {
    const s = this.st;
    return { on: s.on, ph: s.phase, done: s.done, sab: s.sable, kills: s.kills, need: s.need, hp: +s.hp.toFixed(3), am: s.am.map((x) => +x.toFixed(2)), unv: s.unv, cr: s.cr.map((x) => +x.toFixed(2)), lit: s.lit, bel: s.bel };
  }

  applyFull(s) {
    if (!s?.on) return;
    if (!this.active) this.start();
    const S = this.st;
    S.sable = s.sab || 0;
    S.kills = s.kills || 0;
    S.need = s.need || 0;
    S.hp = s.hp ?? 1;
    if (s.am) S.am = s.am.slice();
    S.unv = s.unv || 0;
    if (s.cr) S.cr = s.cr.slice();
    S.lit = s.lit ?? -1;
    S.bel = s.bel || 0;
    if (s.ph != null && s.ph !== S.phase) this.setPhase(s.ph, { late: 1 });
    // lo que ya pasó, de una
    if (S.sable && this.al.sm.mode === 'pie') {
      this.al.sm.sable = true;
      this.al.smMount();
      this.al.sm.t = 0.95;
    }
    this.al.belTo(S.bel, true);
    const B = this.boss;
    S.am.forEach((hp, i) => B.setAmarra(i, hp));
    if (S.unv) {
      B.manto.want = B.manto.k = 0;
      B.C.uTo = B.C.u = 70;
    }
    S.cr.forEach((hp, i) => B.setCrown(i, hp));
    if (S.lit >= 0) B.light(S.lit);
  }

  // ---------------- la entrada ----------------
  // El tajo de la Furia abrió el desgarro: se entra a la arena (en todas las compus).
  start() {
    const g = this.g;
    if (!this.built || globalThis.__mduNoSanLorenzo === true) return false;
    if (this.active) return true;
    this.st.on = 1;
    this.t = 0;
    this.swap();
    this.al.reset();
    this.boss.reset();
    this.placePlayers();
    this.hook();
    this.setPhase(0, {});
    g.post?.flash?.(1.4);
    g.hud?.location?.('San Lorenzo', '3 de febrero de 1813');
    // (afuera de la grilla no hay zona: el cartel del lugar quedaba con la isla de antes)
    g.hud?.setRoom?.('San Lorenzo');
    return true;
  }

  // El cambio de mundo: las islas fuera de la escena (quedan guardadas en
  // this.islands: la cinemática final las puede volver a poner con
  // g.scene.add(this.islands)), la arena adentro, el piso, los choques y los
  // tiros del campo, la luz del eclipse apuntando al campo y el aire del alba.
  swap() {
    const g = this.g;
    const w = g.world;
    const E = this.ee;
    // (el cielo se queda: sale de las islas antes)
    if (w.sky && w.sky.parent === w.root) g.scene.add(w.sky);
    this.islands = w.root;
    this.hidden = [];
    const off = (o) => {
      if (o?.parent) {
        this.hidden.push([o, o.parent]);
        o.removeFromParent();
      }
    };
    off(w.root);
    for (const o of [g.interact?.root, g.barriers?.root, g.critters?.root, g.activities?.root, g.papq?.root, g.luz?.root, g.decor?.root, E.portals?.root, E.mF?.root, E.mC?.root]) off(o);
    for (const s of Object.values(E.steps || {})) off(s.root);
    // los muertos que quedaban, afuera
    if (isHost(g)) {
      for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
      if (g.zombies.boss) g.zombies.removeBoss();
    }
    // los muertos de la arena: todos realistas (el de 1812 de los seis mundos de
    // entities/zombieLooks eclipse; el primer número de su suerte elige el
    // mundo). Igual en todas las compus (sale del id). __mduNoSlRealistas: los seis
    const Z = g.zombies;
    if (Z?.look?.dress && !this.lookBase && globalThis.__mduNoSlRealistas !== true) {
      const L0 = Z.look;
      this.lookBase = L0;
      Z.look = Object.assign(Object.create(L0), {
        dress: (r) => {
          let first = true;
          return L0.dress(() => {
            if (first) {
              first = false;
              r();
              return 5.5 / 6;
            }
            return r();
          });
        },
      });
    }
    // las rondas se paran: la arena manda sus muertos
    if (isHost(g) && g.rounds) g.rounds.state = 'arena';
    if (g.lures) g.lures.length = 0;
    g.scene.add(this.top);
    this.top.visible = true;
    this.installWorld();
    this.aimLight();
    this.atmos(true);
    w.eclipse?.set?.(0.62, 0);
    g.renderer.shadowMap.needsUpdate = true;
  }

  installWorld() {
    const g = this.g;
    const w = g.world;
    const base = { outY: w.outY, raycast: w.raycast, collide: w.collide, extraUpdate: w.extraUpdate };
    this.base = base;
    const near = (x, z) => {
      toLocal(x, z, L);
      return L.u > -330 && L.u < 420 && Math.abs(L.v) < 420;
    };
    w.outY = (x, z) => (near(x, z) ? hLoc(L.u, L.v) : base.outY ? base.outY(x, z) : -60);
    w.raycast = (o, d, maxT, hit = {}) => (near(o.x, o.z) ? rayCampo(o, d, maxT, hit) : base.raycast.call(w, o, d, maxT, hit));
    w.collide = (pos, radius, y0, y1, opts = {}) => {
      if (!near(pos.x, pos.z)) return base.collide.call(w, pos, radius, y0, y1, opts);
      clampLocal(L, radius);
      const W = toWorld(L.u, L.v, pos.y, tmpV);
      pos.x = W.x;
      pos.z = W.z;
      return pos;
    };
    // (sin el rescate de las islas ni el barrido de los caídos: acá todo es
    // campo; sigue el eclipse del cielo)
    w.extraUpdate = (dt, t) => {
      w.eclipse?.update?.(dt, t);
      // (es 1813, la Tierra: las grietas del cielo, más apagadas que en las islas)
      const U = w.sky?.material?.uniforms;
      if (U?.uCrack) U.uCrack.value *= this.crackK ?? 0.55;
      // (al amanecer de la fase 4 se levanta el velo de noche de los cielos)
      if (U?.uNight) {
        this.night0 ??= U.uNight.value;
        U.uNight.value = this.night0 * (1 - 0.12 * (this.dawn || 0));
      }
      this.campo?.update?.(dt, t);
    };
    // los premios que tiran los muertos: sin zona (afuera de la grilla) caían a
    // los pies del jugador; en el campo, donde cayó el muerto
    const P = g.powerups;
    if (P && !this.dropBase) {
      this.dropBase = P.drop;
      P.drop = (pos, force, type) => {
        if (!this.active || !pos) return this.dropBase.call(P, pos, force, type);
        const zoneAt = w.zoneAt;
        w.zoneAt = () => 'A';
        try {
          return this.dropBase.call(P, pos, force, type);
        } finally {
          w.zoneAt = zoneAt;
        }
      };
    }
  }

  // Lo que escucha de las armas: los tiros (EclipseEgg.onShot) y la guadaña (listen).
  hook() {
    const g = this.g;
    const E = this.ee;
    // (EclipseEgg.onShot ya llama a this.onShot: sin envoltorio, si no el tiro cuenta dos veces)
    const cos = g.weapons?.cosmic;
    if (cos?.listen && !this.unlisten) this.unlisten = cos.listen((ev) => this.onScythe(ev));
  }

  // La luz del eclipse (y su sombra) sobre el campo.
  aimLight() {
    const m = this.g.world.moon;
    if (!m) return;
    const C = toWorld(-4, 0, SL0.y + 2);
    m.target.position.copy(C);
    m.position.copy(C).addScaledVector(ECLIPSE_DIR, 150);
    m.target.updateMatrixWorld();
    const sc = m.shadow.camera;
    sc.left = -72;
    sc.right = 72;
    sc.top = 72;
    sc.bottom = -72;
    sc.near = 1;
    sc.far = 320;
    sc.updateProjectionMatrix();
    m.shadow.needsUpdate = true;
  }

  // El aire del alba sobre el río (world/eclipseAtmos: el de esta isla, fijo).
  // dawn: 0 tapado, 1 el sol afuera (la fase 4).
  atmos(on, dawn = 0) {
    const A = this.g.weather?.atmos;
    if (!A) return;
    const i = Math.max(0, ISLE_IDS.indexOf('monumento'));
    if (on && !this.atmosSaved) {
      this.atmosSaved = { target: A.target, P: A.P[i] };
      A.target = () => {
        A.to.fill(0);
        A.to[i] = 1;
      };
    }
    if (!this.atmosSaved) return;
    const c = (r, g2, b) => new THREE.Color().setRGB(r, g2, b);
    const k = dawn;
    A.P[i] = {
      // niebla de la mañana y humo de la pelea, gris violácea; con el sol, dorada
      fog: c(0.055 + 0.2 * k, 0.045 + 0.13 * k, 0.075 + 0.05 * k),
      dens: 0.0068 - 0.0018 * k,
      hemi: c(0.62 + 0.3 * k, 0.6 + 0.24 * k, 0.78 - 0.1 * k),
      ground: c(0.28, 0.2 + 0.06 * k, 0.24),
      hemiI: 1.45 + 0.2 * k,
      amb: c(0.46 + 0.1 * k, 0.44 + 0.06 * k, 0.56 - 0.08 * k),
      ambI: 0.5 + 0.12 * k,
      moon: c(1.0, 0.8 + 0.1 * k, 0.66 + 0.08 * k),
      moonI: 1.55 + 0.35 * k,
    };
    this.dawn = k;
  }

  // Cada uno en su lugar, en la huerta detrás del muro, mirando a San Martín.
  placePlayers() {
    const g = this.g;
    const P = g.player;
    const ids = g.net ? [g.net.id, ...g.net.remote.keys()].sort((a, b) => a - b) : [0];
    const slot = ids.indexOf(myId(g));
    const v = -3.5 + (slot - (ids.length - 1) / 2) * 1.7;
    toWorld(-48.6, v, null, tmpV);
    P.pos.copy(tmpV);
    P.vel?.set(0, 0, 0);
    // (mira para el lado del muro y de San Martín)
    const sm = toWorld(-47.0, 6.6, null, tmpW);
    P.yaw = Math.atan2(-(sm.x - tmpV.x), -(sm.z - tmpV.z));
    P.pitch = 0;
    if (!P.alive || P.downed) {
      P.revive?.();
      P.eye = 1.62;
      g.hud?.setSpectate?.(null);
      g.hud?.setDowned?.(null);
    }
    P.health = P.maxHealth;
    g.weapons?.maxAmmo?.();
  }

  // ---------------- las fases ----------------
  setPhase(n, m = {}) {
    const g = this.g;
    const late = !!m.late;
    this.st.phase = n;
    this.phT = 0;
    const music = g.music;
    const keep = (ph) => (G) => this.active && ph.includes(this.st.phase) && (G.state === 'playing' || G.state === 'paused');
    if (n === 0) {
      g.hud?.setBossBar?.(null);
      if (!late) g.later(1.4, () => this.active && this.st.phase === 0 && g.hud?.subtitle?.(this.ee.isGil() ? 'San Martín espera su sable. Dáselo (F).' : 'San Martín espera su sable: el Gil se lo da.', 6));
    } else if (n === 1) {
      if (!music?.is('jefe-eclipse')) music?.play('jefe-eclipse', { loop: true, fadeIn: 1.5, while: keep([1, 2]) });
      if (!late) g.hud?.subtitle?.('¡Desembarcan los realistas! Aguantá la línea.', 4.5);
      this.al.smToWait(late);
      if (this.host) {
        this.st.kills = 0;
        this.st.need = Math.round(KILLS_P1 * this.team(0.6));
        // (a los invitados, ya: si no, veían "0 de 0" hasta la primera baja)
        this.kcDirty = true;
        this.counted = new Set();
        this.chargeT = 9;
        this.spawnT = 1.5;
        this.flagSent = false;
      }
    } else if (n === 2) {
      if (!music?.is('jefe-eclipse')) music?.play('jefe-eclipse', { loop: true, fadeIn: 1.5, while: keep([1, 2]) });
      g.world.eclipse?.set?.(0.9, late ? 0 : 6);
      this.boss.rise(late);
      if (!late) {
        g.later(3.5, () => this.active && g.hud?.subtitle?.('El Eclipse. Lo atan tres amarras: cortalas con la guadaña.', 5.5));
        g.weather?.thunder?.(0.2, true);
      }
      if (this.host) {
        this.shadowT = 10;
        this.slamT = 6;
        this.chargeT = 14;
        this.leadT = -1;
        this.send({ a: 'bel', i: 2 });
      }
    } else if (n === 3) {
      g.hud?.setBossBar?.(null);
      this.bossUp();
      g.world.eclipse?.set?.(1, late ? 0 : 1.6);
      if (!late) this.playCabral(m);
    } else if (n === 4) {
      this.scene?.skip?.();
      music?.stop(1);
      music?.play('marcha-san-lorenzo', { loop: true, while: keep([4, 5]) });
      // Febo asoma: el sol sale de atrás del disco (el anillo de diamante)
      g.world.eclipse?.set?.(0.14, late ? 0 : 9);
      g.world.eclipse?.pulse?.(1.4);
      this.dawnT = late ? 9 : 0;
      this.bossUp();
      this.boss.kneel();
      if (!late) {
        g.post?.flash?.(0.6);
        this.al.clarin();
        g.later(1.2, () => this.active && g.hud?.subtitle?.('Febo asoma. Rompé la corona con el rayo de la Furia.', 6));
      }
      if (this.host) {
        this.chargeT = 2;
        this.shadowT = 12;
        this.send({ a: 'bel', i: 3 });
        this.send({ a: 'lit', i: this.st.cr.findIndex((x) => x > 0) });
      }
    } else if (n === 5) {
      g.hud?.setBossBar?.(null);
      this.boss.fall();
      g.world.eclipse?.set?.(0, 4);
      this.endT = 0;
      if (this.host) for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
    }
  }

  // (si se llegó salteando la fase 2: El Eclipse ya afuera del agua, sin manto ni amarras)
  bossUp() {
    const B = this.boss;
    if (!B.up) B.rise(true);
    for (let i = 0; i < 3; i++) {
      if (B.amarras[i].cut) continue;
      this.st.am[i] = 0;
      B.amarras[i].cut = true;
      B.amarras[i].snap = 0;
    }
    B.manto.want = B.manto.k = 0;
    this.st.unv = 1;
  }

  // El Gil le dio el sable: San Martín lo alza, dice su línea y monta; después, el desembarco.
  giveSable(id) {
    const g = this.g;
    if (this.st.sable) return;
    this.st.sable = 1;
    const who = id === myId(g) ? g.player.pos : g.net?.remote?.get(id)?.pos || g.player.pos;
    const d = this.al.smTakeSable(who);
    g.later(2.5, () => this.active && this.say('sanmartin', 'Seamos libres, que lo demás no importa nada.'));
    if (this.host) g.later(d + 1.8, () => this.active && this.st.phase === 0 && this.send({ ph: 1 }));
  }

  // La escena de Cabral (todas las compus): el caballo de San Martín cae donde dijo el anfitrión.
  playCabral(m) {
    const g = this.g;
    const at = m.u != null ? { u: m.u, v: m.v } : null;
    let cine;
    try {
      cine = new CabralScene(this, at);
    } catch (e) {
      console.error('Cabral: no se armó la escena', e);
      if (this.host) g.later(0.5, () => this.send({ ph: 4 }));
      return;
    }
    this.scene = cine;
    this.ee.scene = { update: (dt) => cine.update(dt), kind: 'cabral', cine };
    cine.play(() => {
      if (this.ee.scene?.cine === cine) this.ee.scene = null;
      this.scene = null;
      if (!g.cheated) unlock('cabral');
      if (this.host && this.st.phase === 3) this.send({ ph: 4 });
    });
  }

  debugPhase(n) {
    const g = this.g;
    if (!this.active) this.start();
    if (!this.host) return;
    const S = this.st;
    if (n >= 1 && !S.sable) {
      S.sable = 1;
      this.al.sm.sable = true;
      this.al.smMount();
    }
    if (n >= 2) this.send({ a: 'bel', i: 2 });
    if (n >= 3) {
      for (let i = 0; i < 3; i++) this.send({ a: 'am', i, hp: 0 });
      if (!S.unv) this.send({ a: 'un' });
      this.send({ a: 'hp', k: HP_CABRAL });
    }
    if (n >= 4) g.later(0.1, () => this.send({ ph: n }));
    else if (n === 3) {
      const sm = this.al.sm;
      if (sm.mode !== 'montado') this.al.smMount();
      g.later(1.2, () => this.send({ ph: 3, u: 30, v: 4 }));
    } else this.send({ ph: n });
  }

  // ---------------- los golpes ----------------
  // (anfitrión) Un tajo a una amarra: n tajos.
  hitAmarra(i, n = 1) {
    const S = this.st;
    if (this.st.phase !== 2 || S.am[i] <= 0) return;
    const hp = Math.max(0, S.am[i] - n / (AM_CUTS * this.team(0.5)));
    this.send({ a: 'am', i, hp: +hp.toFixed(3) });
  }

  // Daño al cuerpo (fracción de la vida). guest: ya viene de un invitado.
  hitBoss(d, guest = false) {
    const S = this.st;
    if (this.st.phase !== 2 || !S.unv || d <= 0) return;
    if (!this.host) {
      this.pendBoss = (this.pendBoss || 0) + d;
      return;
    }
    S.hp = Math.max(HP_CABRAL - 0.001, S.hp - d / this.team(0.75));
    this.hpDirty = true;
    if (guest) this.boss.R.act?.('hit');
  }

  hitCrown(i, d) {
    const S = this.st;
    if (this.st.phase !== 4 || i !== S.lit || S.cr[i] <= 0) return;
    if (!this.host) {
      this.pendCrown = (this.pendCrown || 0) + d;
      return;
    }
    const hp = Math.max(0, S.cr[i] - d / (CROWN_SECS * this.team(0.6)));
    if (hp <= 0 || Math.abs(hp - (this.crSent ?? 9)) > 0.08) {
      this.crSent = hp;
      this.send({ a: 'cr', i, hp: +hp.toFixed(3) });
    } else S.cr[i] = hp;
  }

  // Un tiro (Weapons → EclipseEgg.onShot): al cuerpo o a la mano.
  onShot(o, d, maxT) {
    if (!this.active || this.st.phase !== 2) return;
    const g = this.g;
    // (el rayo de la Furia también llama acá: va por su cuenta en beam())
    if (g.weapons?.cosmic?.beam?.on) return;
    const h = this.boss.shotHit(o, d, maxT);
    if (!h) return;
    const p = tmpV.copy(o).addScaledVector(d, h.t);
    if (!this.st.unv) {
      // el manto se lo come
      g.fx.sparks(p, 0.4, { x: -d.x, y: 0.3, z: -d.z }, [0.4, 0.2, 0.7]);
      if (!this.mantoTold) {
        this.mantoTold = true;
        g.hud?.subtitle?.('El manto lo cubre: primero, las amarras.', 3.5);
      }
      return;
    }
    const st = g.weapons?.stats;
    const dmg = st?.damage || 100;
    const frac = Math.min(0.0035, dmg / (bossHealth(g.rounds?.round || 15) * 6));
    g.fx.sparks(p, 0.6, { x: -d.x, y: 0.4, z: -d.z }, [0.8, 0.5, 1]);
    g.hud?.hitmarker?.(false);
    this.hitBoss(frac);
  }

  // La guadaña (Desgarrador.listen): tajos, guadañas tiradas y embestidas.
  onScythe(ev) {
    if (!this.active) return;
    const B = this.boss;
    const ph = this.st.phase;
    if (ph !== 2) return;
    let hits = [];
    if (ev.type === 'cut') hits = B.cutHit(ev.o, ev.fwd, ev.range || 4);
    else if (ev.type === 'throw' && ev.f) {
      // (a lo largo del tiro, hasta ~16 m)
      for (let s = 2; s <= 16; s += 2.5) {
        const o = tmpV.copy(ev.o).addScaledVector(ev.f, s);
        for (const h of B.cutHit(o, ev.f, 2.2)) if (!hits.some((x) => x.part === h.part && x.i === h.i)) hits.push(h);
      }
    } else if (ev.type === 'dash' && ev.from && ev.to) {
      const n = Math.max(1, Math.ceil(ev.from.distanceTo(ev.to) / 1.5));
      const f = tmpW.subVectors(ev.to, ev.from).normalize();
      for (let k = 0; k <= n; k++) {
        const o = tmpV.copy(ev.from).lerp(ev.to, k / n);
        for (const h of B.cutHit(o, f, 1.6)) if (!hits.some((x) => x.part === h.part && x.i === h.i)) hits.push(h);
      }
    }
    for (const h of hits) {
      if (h.part === 'amarra') this.ask({ h: 'am', i: h.i, n: 1 });
      else if (h.part === 'hand') this.hitBoss(ev.type === 'cut' ? 0.018 : 0.025);
    }
  }

  // El rayo de la Furia, cada cuadro (el de esta compu): la corona, la mano o el cuerpo.
  beam(dt) {
    const g = this.g;
    const B = g.weapons?.cosmic?.beam;
    if (!B?.on || B.k < 0.4) return;
    const a = g.camera.position;
    const b = B.to;
    const h = this.boss.beamHit(a, b);
    if (!h) return;
    if (h.part === 'crown') this.hitCrown(h.i, dt);
    else if (this.st.phase === 2 && this.st.unv) this.hitBoss(0.03 * dt);
  }

  // (anfitrión) un muerto que barrió una carga
  onAllyKill() {
    this.allyKills = (this.allyKills || 0) + 1;
  }

  // La columna de sombra (todas las compus): cada uno se cuida a sí mismo; los muertos, el anfitrión.
  onShadowHit(at, r) {
    const g = this.g;
    const p = g.player.pos;
    if (!this.ee.scene && g.player.canBeHit?.() && Math.hypot(p.x - at.x, p.z - at.z) < r && Math.abs(p.y - at.y) < 3) g.player.damage(40, at);
    if (this.host) for (const { z } of g.zombies.inRadius(at, r)) g.zombies.damage(z, (z.maxHp || 1000) + 1, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
  }

  onSlamHit(at, r) {
    const g = this.g;
    const p = g.player.pos;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (!this.ee.scene && g.player.canBeHit?.() && d < r && Math.abs(p.y - at.y) < 3) g.player.damage(d < r * 0.5 ? 55 : 30, at);
    if (this.host) for (const { z } of g.zombies.inRadius(at, r)) g.zombies.damage(z, (z.maxHp || 1000) + 1, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    this.phT += dt;
    this.al.update(dt);
    this.boss.update(dt);
    if (g.state !== 'playing') return;
    if (this.host) this.hostTick(dt);
    else this.guestTick(dt);
    this.beam(dt);
    this.flag(dt);
    this.hud();
    // fase 4: amanece de a poco y la Furia se llena sola
    if (this.st.phase === 4) {
      if (this.dawnT < 9) {
        this.dawnT += dt;
        this.atmos(true, Math.min(1, this.dawnT / 9));
        this.crackK = 0.55 - 0.35 * Math.min(1, this.dawnT / 9);
      }
      this.furiaT = (this.furiaT || 0) - dt;
      const cos = g.weapons?.cosmic;
      if (this.furiaT <= 0 && cos?.addKill && !cos.furiaOn) {
        this.furiaT = 0.22;
        cos.addKill(WEAPONS.desgarrador?.pap?.furia || { kills: 30 }, 1);
      }
    }
    // fase 5: el blanco y el final
    if (this.st.phase === 5) {
      this.endT += dt;
      if (this.endT > 6.5 && !this.st.done) this.finish();
    }
  }

  // El invitado: manda lo que juntó de golpes de a ratos.
  guestTick(dt) {
    this.sendT = (this.sendT || 0) - dt;
    if (this.sendT > 0) return;
    this.sendT = 0.2;
    if (this.pendBoss > 0) {
      this.ask({ h: 'bd', d: +this.pendBoss.toFixed(4) });
      this.pendBoss = 0;
    }
    if (this.pendCrown > 0) {
      this.ask({ h: 'cr', i: this.st.lit, d: +this.pendCrown.toFixed(3) });
      this.pendCrown = 0;
    }
  }

  hostTick(dt) {
    const g = this.g;
    const S = this.st;
    const ph = S.phase;
    if (ph === 1 || ph === 2 || ph === 4) this.horde(dt);
    // las cargas
    this.chargeT -= dt;
    if ((ph === 1 || ph === 2) && this.chargeT <= 0 && this.leadT < 0) {
      const side = this.nextSide = -(this.nextSide || -1);
      if (!this.al.busy(side)) {
        this.send({ a: 'ch', s: side, l: this.laneFor(side) });
        this.chargeT = ph === 1 ? 15 : 19;
      } else this.chargeT = 2;
    }
    if (ph === 4 && this.chargeT <= 0) {
      // la pinza: los dos escuadrones a la vez, a los dos lados de lo más espeso
      this.chargeT = 1.5;
      if (!this.al.busy(1) && !this.al.busy(-1)) {
        const c = this.laneFor(0);
        this.send({ a: 'ch', s: 1, l: Math.min(30, c + 5.5), ld: 1 });
        this.send({ a: 'ch', s: -1, l: Math.max(-30, c - 5.5) });
      }
    }
    if (ph === 1) {
      // los muertos que caen (de la arena: todos)
      for (const z of g.zombies.pool) {
        if (!z.active || !z.dead || this.counted.has(z.id)) continue;
        this.counted.add(z.id);
        S.kills++;
        this.kcDirty = true;
      }
      // Belgrano planta la bandera apenas empieza
      if (!this.flagSent && this.phT > 2) {
        this.flagSent = true;
        this.send({ a: 'bel', i: 1 });
      }
      if (S.kills >= S.need) this.send({ ph: 2 });
    }
    if (ph === 2) this.bossTick(dt);
    if (ph === 4) {
      this.shadowT -= dt;
      if (this.shadowT <= 0) {
        this.shadowT = 10;
        this.shadowAttack(1);
      }
      // la corona: el prendido se rompió → el que sigue; ninguno → el final
      if (S.lit >= 0 && S.cr[S.lit] <= 0) {
        const next = S.cr.findIndex((x) => x > 0);
        if (next >= 0) this.send({ a: 'lit', i: next });
        else {
          this.send({ a: 'lit', i: -1 });
          this.send({ ph: 5 });
        }
      }
    }
    // lo que cambió, a los demás (de a ratos)
    this.netT = (this.netT || 0) - dt;
    if (this.netT <= 0) {
      this.netT = 0.25;
      if (this.kcDirty) {
        this.kcDirty = false;
        this.send({ a: 'kc', n: S.kills, need: S.need });
      }
      if (this.hpDirty) {
        this.hpDirty = false;
        this.send({ a: 'hp', k: +S.hp.toFixed(3) });
      }
    }
  }

  // (anfitrión) La fase 2: sombras, manotazos, amarras y la carga de San Martín.
  bossTick(dt) {
    const S = this.st;
    const B = this.boss;
    if (B.C.rise < 1) return;
    this.shadowT -= dt;
    if (this.shadowT <= 0) {
      this.shadowT = S.unv ? 9 : 7;
      this.shadowAttack(S.unv ? 1 : 2);
    }
    if (!S.unv && S.am.every((x) => x <= 0)) this.send({ a: 'un' });
    if (S.unv && this.leadT < 0) {
      this.slamT -= dt;
      if (this.slamT <= 0 && !B.slamJob) {
        this.slamT = 9;
        const s = this.slamSpot();
        this.send({ a: 'sl', x: +s.x.toFixed(2), z: +s.z.toFixed(2) });
      }
    }
    // a la vida de Cabral: la carga que encabeza San Martín
    if (S.unv && S.hp <= HP_CABRAL && this.leadT < 0 && !B.slamJob) {
      if (!this.al.busy(1) && this.al.sm.mode === 'montado') {
        this.leadT = 0;
        this.send({ a: 'ch', s: 1, l: 4, ld: 1 });
      }
    }
    if (this.leadT >= 0) {
      this.leadT += dt;
      // (cuando San Martín llega a la mitad del campo, El Eclipse le voltea el caballo)
      const h = this.al.sm.mh || this.al.sm.h;
      toLocal(h.pos.x, h.pos.z, L);
      if ((L.u > 27 && this.al.sm.lead) || this.leadT > 40) {
        this.leadT = -2;
        this.send({ ph: 3, u: +L.u.toFixed(2), v: +L.v.toFixed(2) });
      }
    }
  }

  // Dónde pega el manotazo: el de las tres marcas más cerca de alguien.
  slamSpot() {
    const list = this.standing();
    let best = SLAMS[Math.floor(Math.random() * SLAMS.length)];
    let bd = Infinity;
    for (const s of SLAMS) {
      const w = toWorld(s[0], s[1], null, tmpW);
      for (const p of list) {
        const d = Math.hypot(p.x - w.x, p.z - w.z) + Math.random() * 6;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
    return toWorld(best[0] + (Math.random() - 0.5) * 3, best[1] + (Math.random() - 0.5) * 4, null, new THREE.Vector3());
  }

  standing() {
    const g = this.g;
    const list = [];
    if (g.player.canBeHit?.()) list.push(g.player.pos);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r.pos);
    return list;
  }

  // Sombras: una debajo de cada uno y `extra` sueltas cerca.
  shadowAttack(extra = 1) {
    const pts = [];
    for (const p of this.standing()) {
      pts.push(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2);
      for (let i = 0; i < extra; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 5 + Math.random() * 7;
        toLocal(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, L);
        const o = { u: L.u, v: L.v };
        clampLocal(o, 1);
        const w = toWorld(o.u, o.v, null, tmpW);
        pts.push(w.x, w.z);
      }
    }
    this.send({ a: 'sh', p: pts.map((x) => +x.toFixed(1)) });
  }

  // El carril de una carga: por donde haya más muertos (del lado de ese escuadrón).
  laneFor(side) {
    const g = this.g;
    const bins = new Array(13).fill(0);
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      toLocal(z.pos.x, z.pos.z, L);
      if (L.u < -28 || L.u > 40) continue;
      const b = Math.round((L.v + 30) / 5);
      if (b >= 0 && b < bins.length) bins[b]++;
    }
    let best = side > 0 ? 8 : side < 0 ? 4 : 6;
    let bn = -1;
    for (let b = 0; b < bins.length; b++) {
      const v = b * 5 - 30;
      // (cada escuadrón prefiere su mitad)
      const w = bins[b] + (bins[b - 1] || 0) * 0.5 + (bins[b + 1] || 0) * 0.5 + (side * v > 0 ? 0.4 : 0);
      if (w > bn) {
        bn = w;
        best = b;
      }
    }
    return Math.max(-30, Math.min(30, best * 5 - 30 + (Math.random() - 0.5) * 3));
  }

  // (anfitrión) Los realistas: suben por las dos bajadas (y alguno sale del campo).
  horde(dt) {
    const g = this.g;
    const ph = this.st.phase;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = ph === 4 ? 0.45 : 0.6;
    const cap = Math.round(CAP[ph] * this.team(0.5));
    if (g.zombies.alive >= cap) return;
    const round = Math.max(8, g.rounds?.round || 12);
    let at;
    if (Math.random() < 0.8) {
      const b = F.bajadas[Math.floor(Math.random() * F.bajadas.length)];
      const v = b + (Math.random() - 0.5) * 2.4;
      at = toWorld(edgeU(v) + 9.5 + Math.random() * 1.2, v, null, new THREE.Vector3());
    } else {
      // (de las grietas del campo, lejos de los jugadores)
      const list = this.standing();
      for (let i = 0; i < 8 && !at; i++) {
        const u = -10 + Math.random() * 40;
        const v = (Math.random() - 0.5) * 70;
        const w = toWorld(u, v, null, new THREE.Vector3());
        if (list.every((p) => Math.hypot(p.x - w.x, p.z - w.z) > 12)) at = w;
      }
      if (!at) return;
    }
    g.zombies.spawn(round, zombieHealth(round), at);
  }

  // El respiro de la bandera de Belgrano (cada uno el suyo).
  flag(dt) {
    const g = this.g;
    const at = this.al.flagAt();
    if (!at) return;
    this.flagT = (this.flagT ?? 6) - dt;
    if (this.flagT > 0) return;
    this.flagT = FLAG_EVERY;
    this.al.bel.pulse = 1;
    g.fx.sparkle(tmpV.copy(at).setY(at.y + 3.2), [0.6, 0.85, 1], 18, 1.2);
    const P = g.player;
    if (!P.alive || P.downed || Math.hypot(P.pos.x - at.x, P.pos.z - at.z) > FLAG_R) return;
    P.health = Math.min(P.maxHealth, P.health + FLAG_HP);
    const id = g.weapons?.slot?.id;
    if (id) g.weapons.refillAmmo?.(id);
    g.audio?.purchase?.();
    if (!this.flagTold) {
      this.flagTold = true;
      g.hud?.subtitle?.('La bandera de Belgrano: munición y un respiro.', 3.5);
    }
  }

  // La barra de arriba: lo que hay que hacer en cada fase.
  hud() {
    const g = this.g;
    const S = this.st;
    const ph = S.phase;
    let name = null;
    let k = 1;
    if (ph === 1) {
      name = `El desembarco (${Math.min(S.kills, S.need)} de ${S.need})`;
      k = 1 - Math.min(1, S.kills / Math.max(1, S.need));
    } else if (ph === 2 && this.boss.C.rise >= 1) {
      const left = S.am.filter((x) => x > 0).length;
      name = S.unv ? 'El Eclipse' : `El Eclipse (${left} amarra${left === 1 ? '' : 's'})`;
      k = S.unv ? S.hp : 1;
    } else if (ph === 4) {
      const left = S.cr.filter((x) => x > 0).length;
      name = `La corona del Eclipse (${left} de 4)`;
      k = (left - 1 + (S.cr[S.lit] ?? 0)) / 4;
    }
    const key = name ? `${name}|${k.toFixed(3)}` : '';
    if (key === this.hudKey) return;
    this.hudKey = key;
    g.hud?.setBossBar?.(name, Math.max(0, k));
  }

  // Rota la corona: el blanco y el final (EclipseEgg.arenaWon; la cinemática se engancha ahí).
  finish() {
    const g = this.g;
    this.st.done = 1;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;transition:opacity 2.2s;pointer-events:none;z-index:40';
    (g.root || document.body).appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    this.white = el;
    g.later(2.4, () => {
      if (this.ee.arenaWon) this.ee.arenaWon();
      else {
        this.ee.done = true;
        markEgg('eclipse');
      }
      // (si no hay cinemática que siga, el blanco se va)
      g.later(1.5, () => {
        if (this.ee.scene) return;
        el.style.opacity = '0';
        g.later(2.5, () => el.remove());
      });
    });
  }

  dispose() {
    const g = this.g;
    const w = g.world;
    if (this.base) {
      w.outY = this.base.outY;
      w.raycast = this.base.raycast;
      w.collide = this.base.collide;
      w.extraUpdate = this.base.extraUpdate;
    }
    const U = w.sky?.material?.uniforms;
    if (U?.uNight && this.night0 != null) U.uNight.value = this.night0;
    if (this.dropBase && g.powerups) g.powerups.drop = this.dropBase;
    if (this.lookBase && g.zombies) g.zombies.look = this.lookBase;
    this.unlisten?.();
    const A = g.weather?.atmos;
    if (A && this.atmosSaved) {
      A.target = this.atmosSaved.target;
      A.P[Math.max(0, ISLE_IDS.indexOf('monumento'))] = this.atmosSaved.P;
    }
    this.scene?.dispose?.();
    this.white?.remove();
    this.top?.removeFromParent();
    this.al?.dispose();
    this.boss?.dispose();
    this.campo?.dispose();
  }
}

