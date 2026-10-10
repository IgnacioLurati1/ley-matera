import * as THREE from 'three';
import { slGroundLook } from '../../world/eclipse/sanlorenzoLook';
import { buildCampo, toWorld, toLocal, hLoc, clampLocal, rayCampo, SL0, F, edgeU } from '../../world/eclipse/sanlorenzoCampo';
import CampoVivo from '../../world/eclipse/sanlorenzoVivo';
import { ISLE_IDS, ECLIPSE_DIR } from '../../world/eclipseSky';
import { warmObject } from '../../fx/ghostMat';
import { WEAPONS } from '../../config/weapons';
import { zombieHealth, bossHealth } from '../../config/rules';
import { markEgg } from '../../core/eggs';
import { unlock } from '../../core/logros';
import { myId, isHost, players } from './common';
import Aliados from './slAliados';
import EclipseBoss, { SLAMS } from './slEclipse';
import CabralScene, { loadCabralClips } from './slCabral';
import CineActors from '../../ui/cineActors';
import Caballeria from './slCaballeria';
import SlJinetes from './slJinetes';
import { eclSfx } from '../../fx/eclipseSfx';

// La pelea final de Eclipse Matero: el Combate de San Lorenzo (3 de febrero de
// 1813). El corte con la Furia (entities/EclipseEgg.js) abre el desgarro y se
// entra a la arena: un mundo aparte, con las islas sacadas de la escena: el
// campo de San Lorenzo arrancado del mundo, una isla de roca sobre el vacío
// (world/eclipse/sanlorenzoCampo.js y sanlorenzoVivo.js). Diseño: scratchpad
// eclipse/SANLORENZO.md; la vuelta "de cero" (sanlorenzo2, 2026-10-06):
// eclipse/sanlorenzo2/PROGRESO.md.
//  0. Llegada: detrás del muro del convento; el Gil le entrega el sable a San
//     Martín (mantener F) y San Martín monta. El Eclipse ya mira, enorme, desde
//     el fondo del Paraná, detrás de la escuadra.
//  1. El desembarco: los botes van de los barcos a la playa y suben los
//     realistas por las dos bajadas; los barcos cañonean el campo; El Eclipse
//     larga más botes. Aguantar la línea. Belgrano planta la bandera.
//  2. El Eclipse (entities/eclipse/slEclipse.js): cruza el río hasta la
//     barranca ('sube'); le salen tres cadenas de la coraza al campo: hay que
//     cortarlas a tajos ('amarras'; cada una revienta una placa) mientras tira
//     astillas, rayos y botes; sin la coraza ('cuerpo') se le pega: manotazos,
//     barridas que hay que saltar, rayos; se tambalea y cae de rodillas.
//  3. Cabral (escena dentro del juego, entities/eclipse/slCabral.js): en una
//     carga que encabeza San Martín, El Eclipse le voltea el caballo.
//  4. Febo asoma: la Marcha, el sol sale de atrás del disco y la caballería
//     entera (entities/eclipse/slCaballeria.js) cruza el campo y lo voltea de
//     rodillas contra la barranca ('carga'); la corona se rompe solo con el
//     rayo de la Furia, que se llena sola ('corona').
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
// (sesión 1f: "salen muy pocos para un terreno enorme": muchos más y más rápido;
// __mduNoSlHorde: los de antes)
const MORE = globalThis.__mduNoSlHorde !== true;
// (2026-10-08, el usuario: "la batalla final tarda nada en hacerse y es una
// pelotudez". Medido en el código: el cuerpo de El Eclipse (del 100 al 55%) se
// iba en ~25 tajos de guadaña a la mano (1,8% cada uno) o ~50 s de tiros; las
// cadenas, 6 tajos; la corona, 2,4 s de rayo por pedazo. Ahora: 100 muertos en
// el desembarco, 9 tajos por cadena, el cuerpo aguanta 2,5 veces más, la
// corona 4 s de rayo por pedazo y El Eclipse ataca un 20% más seguido.
// globalThis.__mduOldSlHard: como antes)
const HARD = globalThis.__mduOldSlHard !== true;
const KILLS_P1 = MORE ? (HARD ? 100 : 70) : 30;
// (lo que entra al cuerpo, por esto)
// (2026-10-08, ITERACION-8, el usuario: "bajarle un poco de vida en la 2da fase
// al Eclipse": el cuerpo aguantaba 2,5 veces lo de antes; ahora 2 veces.
// globalThis.__mduOldSlBody8: 0,4, como antes)
const BODY_K = HARD ? (globalThis.__mduOldSlBody8 === true ? 0.4 : 0.5) : 1;
// (y en la corona ataca: ver hostTick. globalThis.__mduOldCrownAtk: como antes)
const CROWN_ATK = globalThis.__mduOldCrownAtk !== true;
// los muertos a la vez en cada fase (por jugador de más, la mitad)
const CAP = MORE ? { 1: 34, 2: 40, 4: 46 } : { 1: 10, 2: 12, 4: 16 };
// los tajos para cortar una amarra (solo; +50% por jugador de más)
const AM_CUTS = HARD ? 9 : 6;
// a qué vida se termina la fase 2 (la carga de San Martín y Cabral)
const HP_CABRAL = 0.55;
// a qué vida cae de rodillas (aturdido: le duele más)
const KNEELS = [0.84, 0.69];
// (2026-10-08, el usuario: "al Eclipse cuando lo stuneás se stunea dos veces".
// Las dos marcas están cerca y de rodillas le duele 1,6 veces más: con el
// daño de la primera ya pasaba la segunda, se paraba y volvía a caer —o caía
// dos veces en el mismo cuadro—. Ahora una por vez, de rodillas no baja de la
// marca que sigue y entre una y otra pasa KNEEL_GAP s de pie; la carga de
// San Martín (Cabral) espera a que se pare.
// globalThis.__mduOldSlKneel: como antes)
const KNEEL_FIX = globalThis.__mduOldSlKneel !== true;
const KNEEL_GAP = 10;
// la corona: segundos de rayo por pedazo (solo)
const CROWN_SECS = HARD ? 4 : 2.4;
// el respiro de la bandera: cada cuánto, a cuánto, cuánta vida
const FLAG_EVERY = 20;
const FLAG_R = 6.2;
const FLAG_HP = 35;
// la carga de la fase 4: cuándo lo voltea y cuándo empieza la corona (s)
const CAV_HIT = 8.6;
const CAV_END = 13.5;
const SAY = { sanmartin: 'San Martín', cabral: 'Sargento Cabral', belgrano: 'Manuel Belgrano' };

export default class SanLorenzo {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.st = { on: 0, phase: 0, sub: '', done: 0, sable: 0, kills: 0, need: 0, hp: 1, am: [1, 1, 1], unv: 0, cr: [1, 1, 1, 1], lit: -1, bel: 0, kn: 0 };
    this.built = false;
    this.top = null;
    this.t = 0;
    this.phT = 0;
    this.subT = 0;
    this.leadT = -1;
    this.chargeT = 0;
    this.spawnT = 0;
    this.atkT = 0;
    this.shouted = new Set();
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
    const q = g.settings?.quality;
    this.campo = buildCampo({ grass: q === 'perf' || q === 'low' ? 4500 : q === 'medium' ? 6500 : 9000 });
    // la textura de pasto de la granja sobre el suelo (antes de calentar: compila acá)
    const T = g.world?.T;
    if (T?.grass && this.campo.ground) {
      const m = this.campo.ground.material;
      m.map = T.grass;
      m.needsUpdate = true;
      // (el pasto a dos escalas, sin facetas ni grilla: world/eclipse/sanlorenzoLook)
      slGroundLook(m);
    }
    this.top.add(this.campo.root);
    // lo que se mueve del campo: fuegos, humo, banderas, cascadas, el río, los botes
    this.vivo = new CampoVivo(g, this.campo);
    // lo que va en coordenadas del mundo (personas, caballos, El Eclipse)
    this.actors = new THREE.Group();
    this.actors.name = 'sanLorenzoActores';
    this.top.add(this.actors);
    // San Martín, Belgrano y los granaderos; El Eclipse; la caballería entera
    this.al = new Aliados(this);
    this.boss = new EclipseBoss(this);
    this.cav = new Caballeria(this);
    // los jinetes del caos, en tandas (entities/eclipse/slJinetes)
    this.jinetes = globalThis.__mduNoSlJinetes === true ? null : new SlJinetes(this);
    this.top.updateMatrixWorld(true);
    warmObject(g, this.top);
    // (la escena de Cabral arma a los cuatro con sus materiales: se compilaban
    // en plena pelea —4 programas, un tirón—. Unos iguales, escondidos, se
    // compilan antes en segundo plano. __mduNoSlCabralWarm: como antes)
    if (globalThis.__mduNoSlCabralWarm !== true) {
      try {
        const W = new CineActors(g, { base: 690, parent: this.top });
        this.cabralWarm = W;
        // (las variantes del G-buffer de la Épica solo se compilan dibujando:
        // con lo escondido que la carga muestra dos cuadros, ui/Arrival warmWorld)
        (g.world.warmHidden ||= []).push(W.people.root);
        let n = 0;
        const tryWarm = () => {
          if (this.disposed || !this.cabralWarm) return;
          if (W.list.every((r) => r.a?.gs?.on) || ++n > 40) warmObject(g, W.people.root);
          else setTimeout(tryWarm, 500);
        };
        tryWarm();
      } catch {
        /* sin los de prueba: se compilan al llegar la escena */
      }
    }
    // en la escena desde ya, escondido y dormido (core/matrixCache mcSleep: no
    // se recorre); la carga (ui/Arrival warmWorld) lo muestra dos cuadros con lo
    // escondido de adentro: así cada variante (G-buffer, sombras) se compila ahí
    // y no al entrar. (__mduNoSlWarm: como antes, afuera hasta entrar)
    if (globalThis.__mduNoSlWarm !== true) {
      this.top.visible = false;
      this.top.mcSleep = true;
      g.scene.add(this.top);
      const B = this.boss;
      (g.world.warmHidden ||= []).push(this.top, B.R.root, B.gnome.R.root, ...B.amarras.flatMap((A) => [A.g, A.chain]), this.al.bel.cloth, ...this.cav.warmList());
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

  // Un grito corto la primera vez que pasa algo (cada compu el suyo).
  shout(key, who, text, delay = 0) {
    if (this.shouted.has(key)) return;
    this.shouted.add(key);
    if (delay > 0) this.g.later(delay, () => this.active && !this.ee.scene && this.say(who, text));
    else if (!this.ee.scene) this.say(who, text);
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
        this.shout('astillas', 'belgrano', '¡Cuidado, arriba!', 0.4);
        break;
      case 'sl':
        B.slam(m.x, m.z);
        break;
      case 'sw':
        B.sweep(m.s || 1);
        this.shout('barrida', 'sanmartin', '¡Salten!', 0.6);
        break;
      case 'bm':
        B.eyeBeam(m.p[0], m.p[1], m.p[2], m.p[3]);
        this.shout('rayo', 'sanmartin', '¡Fuera de la línea!', 0.3);
        break;
      case 'su':
        B.summon();
        this.vivo?.rush();
        this.shout('botes', 'sanmartin', '¡Más botes! ¡A la barranca!', 0.8);
        break;
      case 'cn':
        this.cannon(m.i, m.x, m.z);
        break;
      case 'am':
        this.st.am[m.i] = m.hp;
        B.setAmarra(m.i, m.hp);
        if (m.hp <= 0) {
          const left = this.st.am.filter((x) => x > 0).length;
          if (left === 2) this.shout('amarra1', 'belgrano', '¡Así! ¡Las otras dos!');
          else if (left === 1) this.shout('amarra2', 'sanmartin', '¡Una más!');
        }
        break;
      case 'un':
        this.st.unv = 1;
        B.unveil();
        this.st.sub = 'cuerpo';
        this.g.hud?.subtitle?.('¡Sin la coraza! Tiros al cuerpo; la guadaña, a la mano apoyada.', 4.5);
        this.shout('coraza', 'sanmartin', '¡Está desnudo! ¡Ahora!', 1.2);
        break;
      case 'hp':
        this.st.hp = m.f;
        break;
      case 'kc':
        this.st.kills = m.n;
        this.st.need = m.need;
        break;
      case 'jn':
        this.jinetes?.apply(m);
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
      case 'sub':
        this.setSub(m.s);
        break;
      case 'stg':
        B.stagger(m.d, m.kd);
        if (m.kd === 'kneel') {
          this.st.kn = (this.st.kn || 0) + 1;
          // (sesión 1f, el usuario: "el diálogo 'está de rodillas, duro con él' se
          // repite": una vez cada uno y después nada)
          if (this.st.kn === 1) this.shout('rodillas1', 'belgrano', '¡Está de rodillas! ¡Duro con él!', 0.5);
          else if (this.st.kn === 2) this.shout('rodillas2', 'sanmartin', '¡Otra vez abajo! ¡No le den respiro!', 0.5);
        }
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
    return { on: s.on, ph: s.phase, sub: s.sub, done: s.done, sab: s.sable, kills: s.kills, need: s.need, hp: +s.hp.toFixed(3), am: s.am.map((x) => +x.toFixed(2)), unv: s.unv, cr: s.cr.map((x) => +x.toFixed(2)), lit: s.lit, bel: s.bel, kn: s.kn };
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
    S.kn = s.kn || 0;
    if (s.ph != null && s.ph !== S.phase) this.setPhase(s.ph, { late: 1 });
    if (s.sub) this.setSub(s.sub, true);
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
      for (const A of B.armor) A.on = false;
    }
    S.cr.forEach((hp, i) => B.setCrown(i, hp));
    if (S.lit >= 0) B.light(S.lit);
  }

  // ---------------- la entrada ----------------
  // El tajo de la Furia abrió el desgarro: se entra a la arena (en todas las compus).
  // cine: viene del cruce (ui/eclipseCruce): sin el destello ni los carteles,
  // que van al terminar el vuelo (arrived).
  start(opts = {}) {
    const g = this.g;
    if (!this.built || globalThis.__mduNoSanLorenzo === true) return false;
    if (this.active) return true;
    this.st.on = 1;
    this.t = 0;
    // (los clips de Cabral, desde ya: 314 KB; la escena llega minutos después)
    loadCabralClips();
    this.swap();
    this.al.reset();
    this.boss.reset();
    this.cav.reset();
    this.jinetes?.reset();
    this.placePlayers();
    this.hook();
    this.setPhase(0, opts.cine ? { late: true } : {});
    if (!opts.cine) {
      g.post?.flash?.(1.4);
      g.hud?.location?.('San Lorenzo', '3 de febrero de 1813');
    }
    // (afuera de la grilla no hay zona: el cartel del lugar quedaba con la isla de antes)
    g.hud?.setRoom?.('San Lorenzo');
    return true;
  }

  // (ui/eclipseCruce) Terminó el vuelo: lo que hay que hacer.
  arrived() {
    const g = this.g;
    if (!this.active || this.st.phase !== 0) return;
    g.hud?.location?.('San Lorenzo', '3 de febrero de 1813');
    g.later(0.6, () => this.active && this.st.phase === 0 && g.hud?.subtitle?.(this.ee.isGil() ? 'San Martín espera su sable. Dáselo (F).' : 'San Martín espera su sable: el Gil se lo da.', 6));
    g.later(3, () => this.active && this.st.phase === 0 && g.weather?.thunder?.(0.15, true));
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
    // la luz y la niebla de la arena: las pone ella, antes de cada dibujo (el
    // clima y el ánimo de las islas las vuelven a poner en su update; la niebla
    // de las islas, ×2,4, no dejaba ver a 60 m). __mduNoSlLook: como antes
    if (globalThis.__mduNoSlLook !== true && !this.lookWrap) {
      const sc = g.scene;
      const prev = sc.onBeforeRender;
      this.lookWrap = { prev };
      sc.onBeforeRender = (...a) => {
        prev?.apply(sc, a);
        if (this.active && !this.st.done) this.look();
      };
    }
    // el cielo: un solo cielo alrededor (el del alba del Monumento, con la
    // noche del eclipse encima), sin las cuñas de las islas, que en la arena
    // cortaban el horizonte en colores (__mduNoSlSky: como antes)
    const SU = w.sky?.material?.uniforms;
    if (SU?.uWid && globalThis.__mduNoSlSky !== true && !this.widSaved) {
      this.widSaved = SU.uWid.value.slice();
      SU.uWid.value = SU.uWid.value.map(() => Math.max(0, ISLE_IDS.indexOf('monumento')));
    }
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
        U.uNight.value = this.night0 * (1 - 0.35 * (this.dawn || 0));
      }
      this.campo?.update?.(dt, t);
      this.vivo?.update(dt, this.t);
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
    // (EclipseEgg.onShot ya llama a this.onShot: sin envoltorio, si no el tiro cuenta dos veces)
    const cos = g.weapons?.cosmic;
    if (cos?.listen && !this.unlisten) this.unlisten = cos.listen((ev) => this.onScythe(ev));
  }

  // La luz del eclipse (y su sombra) sobre el campo.
  aimLight(center = null) {
    const m = this.g.world.moon;
    if (!m) return;
    const C = center || toWorld(-4, 0, SL0.y + 2);
    this.lightAt = C.clone();
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
  // dawn: 0 tapado, 1 el sol afuera (la fase 4). (La luz de verdad la pone look.)
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

  // La luz de la arena (cada dibujo): de noche de eclipse, la corona de oro del
  // este como luz principal y un relleno violeta; al amanecer (fase 4), el sol.
  // darkK: la oscuridad de la totalidad (la escena de Cabral).
  look() {
    const g = this.g;
    const w = g.world;
    const k = this.dawn || 0;
    const E = w.eclipse;
    const pulse = Math.min(1, E?.pulseK || 0);
    const dark = this.darkK || 0;
    const lift = this.liftK || 0;
    const Lr = (a, b) => a + (b - a) * k;
    const fog = g.scene.fog;
    if (fog) {
      fog.color.setRGB(Lr(0.05, 0.3), Lr(0.042, 0.22), Lr(0.085, 0.16)).multiplyScalar(1 - 0.5 * dark);
      if (fog.isFogExp2) fog.density = Lr(0.0042, 0.0034) * (1 + 0.6 * dark);
      const U = w.sky?.material?.uniforms;
      U?.uFogColor?.value.copy(fog.color);
    }
    if (w.hemi) {
      w.hemi.color.setRGB(Lr(0.55, 1.0), Lr(0.5, 0.86), Lr(0.85, 0.7));
      w.hemi.groundColor.setRGB(Lr(0.24, 0.42) + 0.12 * lift, Lr(0.17, 0.3) + 0.1 * lift, Lr(0.22, 0.2) + 0.12 * lift);
      w.hemi.intensity = (Lr(1.05, 1.5) + pulse * 0.6) * (1 - 0.55 * dark) * (1 + 0.9 * lift);
    }
    if (w.ambient) {
      w.ambient.color.setRGB(Lr(0.5, 0.95), Lr(0.46, 0.8), Lr(0.66, 0.62));
      w.ambient.intensity = Lr(0.42, 0.55) * (1 - 0.5 * dark) * (1 + 1.0 * lift);
    }
    if (w.moon) {
      w.moon.color.setRGB(1.0, Lr(0.72, 0.84), Lr(0.55, 0.6));
      w.moon.intensity = (Lr(1.7, 3.0) + 1.4 * pulse) * (1 - 0.7 * dark) * (1 + 0.45 * lift);
    }
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
    this.st.sub = '';
    this.phT = 0;
    this.subT = 0;
    const music = g.music;
    const keep = (ph) => (G) => this.active && ph.includes(this.st.phase) && (G.state === 'playing' || G.state === 'paused');
    const B = this.boss;
    if (n === 0) {
      g.hud?.setBossBar?.(null);
      if (!late) {
        g.later(1.4, () => this.active && this.st.phase === 0 && g.hud?.subtitle?.(this.ee.isGil() ? 'San Martín espera su sable. Dáselo (F).' : 'San Martín espera su sable: el Gil se lo da.', 6));
        // (El Eclipse ya mira desde el río: un trueno lejano)
        g.later(4, () => this.active && this.st.phase === 0 && g.weather?.thunder?.(0.15, true));
      }
    } else if (n === 1) {
      if (!music?.is('jefe-eclipse')) music?.play('jefe-eclipse', { loop: true, fadeIn: 1.5, while: keep([1, 2]) });
      if (!late) {
        g.hud?.subtitle?.('¡Desembarcan los realistas! Aguantá la línea.', 4.5);
        g.later(1.2, () => this.active && this.say('sanmartin', '¡Desembarcan! ¡Firmes en el muro!'));
      }
      this.al.smToWait(late);
      this.vivo?.setBoats(true, (u, v) => this.onBoat(u, v));
      if (this.host) {
        this.st.kills = 0;
        this.st.need = Math.round(KILLS_P1 * this.team(0.6));
        this.kcDirty = true;
        this.counted = new Set();
        this.chargeT = 9;
        this.spawnT = 1.5;
        this.cannonT = 6;
        this.atkT = 14;
        this.flagSent = false;
      }
    } else if (n === 2) {
      if (!music?.is('jefe-eclipse')) music?.play('jefe-eclipse', { loop: true, fadeIn: 1.5, while: keep([1, 2]) });
      g.world.eclipse?.set?.(0.9, late ? 0 : 6);
      B.rise(late);
      this.st.sub = late ? 'amarras' : 'sube';
      if (!late) {
        g.weather?.thunder?.(0.3, true);
        g.world.eclipse?.pulse?.(1.0);
        g.later(1.0, () => this.active && this.say('sanmartin', '¡Viene por el río!'));
        g.later(12.5, () => this.active && this.st.phase === 2 && this.say('belgrano', '¡Las cadenas! ¡Córtenle las cadenas!'));
        g.later(13.5, () => this.active && this.st.phase === 2 && !this.st.unv && g.hud?.subtitle?.('Cortá las tres cadenas con la guadaña.', 5));
      }
      if (this.host) {
        this.atkT = 15;
        this.chargeT = 16;
        this.leadT = -1;
        this.send({ a: 'bel', i: 2 });
      }
    } else if (n === 3) {
      g.hud?.setBossBar?.(null);
      this.bossUp();
      B.clearAttacks();
      g.world.eclipse?.set?.(1, late ? 0 : 1.6);
      // (la totalidad: el campo a oscuras, la música se calla)
      this.darkTo = 1;
      music?.stop?.(1.2);
      if (!late) this.playCabral(m);
    } else if (n === 4) {
      this.scene?.skip?.();
      this.darkTo = 0;
      // (si ya suena —entró con el grito de San Martín, slCabral marcha—, sigue)
      if (!music?.is('marcha-san-lorenzo')) {
        music?.stop(0.4);
        music?.play('marcha-san-lorenzo', { loop: true, while: keep([4, 5]) });
      }
      // Febo asoma: el sol sale de atrás del disco (el anillo de diamante)
      g.world.eclipse?.set?.(0.14, late ? 0 : 9);
      g.world.eclipse?.pulse?.(1.4);
      this.dawnT = late ? 9 : 0;
      this.bossUp();
      B.clearAttacks();
      this.st.sub = late ? 'corona' : 'carga';
      if (late) B.kneel(true);
      else {
        g.post?.flash?.(0.6);
        this.al.clarin();
        // la caballería entera sale de atrás del convento
        this.cav.start();
        g.later(1.6, () => this.active && this.say('sanmartin', '¡Por Cabral! ¡A la carga, granaderos!'));
        g.later(5.5, () => this.active && this.say('belgrano', '¡Febo asoma!'));
        g.later(CAV_HIT, () => this.active && this.st.phase === 4 && this.cavHit());
      }
      if (this.host) {
        this.chargeT = 2;
        this.atkT = CAV_END + 8;
        this.send({ a: 'bel', i: 3 });
        if (late) this.send({ a: 'lit', i: this.st.cr.findIndex((x) => x > 0) });
      }
    } else if (n === 5) {
      g.hud?.setBossBar?.(null);
      B.fall();
      g.world.eclipse?.set?.(0, 4);
      this.endT = 0;
      this.vivo?.setBoats(false);
      if (this.host) for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
    }
  }

  // Las partes de una fase: 'sube', 'amarras', 'cuerpo' (2); 'carga', 'corona' (4).
  setSub(s, late = false) {
    if (this.st.sub === s) return;
    const g = this.g;
    this.st.sub = s;
    this.subT = 0;
    if (s === 'amarras' && late) this.boss.rise(true);
    if (s === 'corona') {
      if (late || this.boss.kneelT !== Infinity) this.boss.kneel(late);
      if (!late) g.later(0.6, () => this.active && g.hud?.subtitle?.('¡La corona! Furia (H) y mantené el clic derecho.', 6));
    }
  }

  // (si se llegó salteando la fase 2: El Eclipse ya afuera del agua, sin coraza ni amarras)
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
    for (const A of B.armor) A.on = false;
    this.st.unv = 1;
  }

  // El Gil le dio el sable: San Martín lo alza, dice su línea y monta; después, el desembarco.
  giveSable(id) {
    const g = this.g;
    if (this.st.sable) return;
    this.st.sable = 1;
    const who = id === myId(g) ? g.player.pos : g.net?.remote?.get(id)?.pos || g.player.pos;
    const d = this.al.smTakeSable(who);
    // (ITERACION-8: el sable que sale de la vaina, la grabación del usuario,
    // cuando lo alza —slAliados smPose 'recibe', a los 1,3 s—.
    // globalThis.__mduOldSableSfx: sin)
    if (globalThis.__mduOldSableSfx !== true) {
      eclSfx(g).load(['sable-desenvaina']);
      g.later(1.25, () => this.active && eclSfx(g).play('sable-desenvaina', { pos: this.al.sm.r.pos.clone(), gain: 0.9, reverb: 0.3 }));
    }
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

  // La carga llega a la barranca (todas las compus): el sol estalla y El Eclipse cae de rodillas.
  cavHit() {
    const g = this.g;
    g.world.eclipse?.pulse?.(1.5);
    g.post?.flash?.(0.7);
    g.fx.addShake(1.1);
    g.weather?.thunder?.(0.4, true);
    this.boss.charged();
    this.cav.strike?.();
    // los realistas que quedaban se queman con el sol
    if (this.host) {
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead) continue;
        g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
      }
    }
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
      this.send({ a: 'hp', f: HP_CABRAL });
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
    d *= BODY_K;
    // (aturdido le duele más)
    if (this.boss.staggered) d *= 1.6;
    // (de rodillas no pasa la marca de la rodilla que sigue: ver KNEEL_FIX)
    const kn = S.kn || 0;
    const floor = KNEEL_FIX && this.boss.staggered && kn < KNEELS.length ? KNEELS[kn] + 0.004 : HP_CABRAL - 0.001;
    S.hp = Math.max(Math.min(floor, S.hp), S.hp - d / this.team(0.75));
    this.hpDirty = true;
    if (guest) this.boss.hurtFx(d > 0.01);
  }

  hitCrown(i, d) {
    const S = this.st;
    const any = globalThis.__mduOldCrownLit !== true;
    if (this.st.phase !== 4 || this.st.sub !== 'corona' || !(i >= 0) || (!any && i !== S.lit) || !(S.cr[i] > 0)) return;
    if (!this.host) {
      // (de cada pedazo por separado: el invitado puede estar pegándole a otro)
      (this.pendCrown ||= {})[i] = (this.pendCrown[i] || 0) + d;
      return;
    }
    const hp = Math.max(0, S.cr[i] - d / (CROWN_SECS * this.team(0.6)));
    if (hp <= 0 || Math.abs(hp - (this.crSent ?? 9)) > 0.08) {
      this.crSent = hp;
      this.send({ a: 'cr', i, hp: +hp.toFixed(3) });
    } else S.cr[i] = hp;
  }

  // Un tiro (Weapons → EclipseEgg.onShot): al cuerpo, a la cabeza o a la mano.
  onShot(o, d, maxT) {
    if (!this.active) return;
    const g = this.g;
    // (sesión 1f, el usuario: "la corona está bugueada y no se puede romper; el
    // Chiquitijuein se queda quieto para siempre": sin la Furia —o fuera del
    // alcance del rayo— no había forma. Ahora los tiros también la rompen,
    // más despacio que el rayo. __mduNoCrownShots: solo el rayo)
    if (this.st.phase === 4 && this.st.sub === 'corona' && globalThis.__mduNoCrownShots !== true) {
      if (g.weapons?.cosmic?.beam?.on) return;
      const b = tmpV.copy(o).addScaledVector(d, Math.min(maxT ?? 90, 90));
      let i = this.st.lit;
      let P = this.boss.crown?.[i];
      if (!P || P.broken || !(this.boss.crownDist?.(P, o, b) < 3.2)) {
        i = this.boss.crownHit?.(o, b, 3.2) ?? -1;
        P = this.boss.crown?.[i];
      }
      if (P && !P.broken) {
        const st = g.weapons?.stats;
        // (un balazo: ~1/40 de pedazo; un escopetazo o una guadaña tirada, más)
        this.hitCrown(i, CROWN_SECS * Math.min(0.12, 0.025 * Math.max(1, (st?.damage || 100) / 150)));
        g.fx.sparks(tmpV.copy(P.at), 0.6, { x: -d.x, y: 0.4, z: -d.z }, [1, 0.8, 0.3]);
        g.hud?.hitmarker?.(false);
      }
      return;
    }
    if (this.st.phase !== 2) return;
    // (el rayo de la Furia también llama acá: va por su cuenta en beam())
    if (g.weapons?.cosmic?.beam?.on) return;
    const h = this.boss.shotHit(o, d, maxT);
    if (!h) return;
    const p = tmpV.copy(o).addScaledVector(d, h.t);
    if (!this.st.unv) {
      // la coraza se lo come
      g.fx.sparks(p, 0.4, { x: -d.x, y: 0.3, z: -d.z }, [0.4, 0.2, 0.7]);
      if (!this.mantoTold) {
        this.mantoTold = true;
        g.hud?.subtitle?.('La coraza lo cubre: primero, las cadenas.', 3.5);
      }
      return;
    }
    const st = g.weapons?.stats;
    const dmg = st?.damage || 100;
    let frac = Math.min(0.0035, dmg / (bossHealth(g.rounds?.round || 15) * 6));
    if (h.part === 'head') frac *= 1.5;
    g.fx.sparks(p, 0.6, { x: -d.x, y: 0.4, z: -d.z }, [0.8, 0.5, 1]);
    g.hud?.hitmarker?.(h.part === 'head');
    this.boss.hurtFx(false);
    this.hitBoss(frac);
  }

  // La guadaña (Desgarrador.listen): tajos, guadañas tiradas y embestidas.
  onScythe(ev) {
    if (!this.active) return;
    const B = this.boss;
    const ph = this.st.phase;
    // (la corona, 2026-10-07: la guadaña tirada también le pega; un tajo no
    // llega, está a 25 m de alto. Más despacio que el rayo, que es la forma)
    if (ph === 4 && this.st.sub === 'corona' && ev.type === 'throw' && ev.o && ev.f && globalThis.__mduOldCrownLit !== true) {
      const i = B.crownHit(ev.o, tmpW.copy(ev.o).addScaledVector(ev.f, 70), 3.4);
      if (i >= 0) {
        this.hitCrown(i, CROWN_SECS * 0.08);
        this.g.fx.sparks(tmpV.copy(B.crown[i].at), 0.8, { x: -ev.f.x, y: 0.4, z: -ev.f.z }, [1, 0.8, 0.3]);
        this.g.hud?.hitmarker?.(false);
      }
      return;
    }
    if (ph !== 2) return;
    let hits = [];
    if (ev.type === 'cut') hits = B.cutHit(ev.o, ev.fwd, ev.range || 4);
    else if (ev.type === 'throw' && ev.f) {
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
      else if (h.part === 'hand') {
        B.hurtFx(true);
        this.hitBoss(ev.type === 'cut' ? 0.018 : 0.025);
      }
    }
  }

  // El rayo de la Furia, cada cuadro (el de esta compu): la corona, la mano o el cuerpo.
  beam(dt) {
    const g = this.g;
    const B = g.weapons?.cosmic?.beam;
    if (!B?.on || B.k < 0.4) return;
    const a = g.camera.position;
    // (la corona está alta y lejos —a 36 m del borde, el alcance del rayo
    // común—: para ella, el rayo llega a 70 m. __mduNoCrownReach: como antes)
    const far = this.st.sub === 'corona' && globalThis.__mduNoCrownReach !== true;
    const b = far ? tmpW.copy(B.to).sub(a).normalize().multiplyScalar(70).add(a) : B.to;
    const h = this.boss.beamHit(a, b);
    if (!h) return;
    if (h.part === 'crown') this.hitCrown(h.i, dt);
    else if (this.st.phase === 2 && this.st.unv) {
      this.boss.hurtFx(false);
      this.hitBoss(0.03 * dt);
    }
  }

  // (anfitrión) un muerto que barrió una carga
  onAllyKill() {
    this.allyKills = (this.allyKills || 0) + 1;
  }

  // Una astilla que cae (todas las compus): cada uno se cuida a sí mismo; los muertos, el anfitrión.
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

  // Un cañonazo de un barco (todas las compus): el fogonazo, el humo, el
  // estruendo y, al rato, la bala en el campo (marcada antes).
  cannon(i, x, z) {
    const g = this.g;
    const S = F.ships[i % F.ships.length];
    const from = toWorld(S[0] + (Math.random() - 0.5) * 8, S[1] + (Math.random() - 0.5) * 6, -3.5);
    g.fx.flash(from, 0xffa040, 24, 0.35, 40);
    for (let k = 0; k < 14; k++) g.fx.alpha.spawn(from.x, from.y, from.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, { color: [0.5, 0.48, 0.46], size: 1.5, size1: 6, life: 3 + Math.random() * 2, alpha: 0.45, drag: 0.8, gravity: -0.3 });
    g.audio?.explosion?.(from, 0.7);
    toLocal(x, z, L);
    const at = new THREE.Vector3(x, hLoc(L.u, L.v), z);
    const M = this.boss.mark(at, 3.4, 1.7, 'cn');
    M.onEnd = () => {
      g.fx.explosion(tmpV.copy(at).setY(at.y + 0.5), 3.4, [1, 0.6, 0.25]);
      g.fx.dirt(at, 30);
      g.fx.addShake(0.25);
      g.audio?.explosion?.(at, 0.8);
      const p = g.player.pos;
      if (!this.ee.scene && g.player.canBeHit?.() && Math.hypot(p.x - at.x, p.z - at.z) < 3.4 && Math.abs(p.y - at.y) < 3) g.player.damage(35, at);
    };
    this.shout('canon', 'belgrano', '¡Los cañones de los barcos!', 0.8);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.active) return;
    const g = this.g;
    this.t += dt;
    this.phT += dt;
    this.subT += dt;
    // la oscuridad de la totalidad (Cabral) va y viene despacio
    this.darkK = (this.darkK || 0) + ((this.darkTo || 0) * 0.6 - (this.darkK || 0)) * Math.min(1, dt * 0.8);
    // (la luz de escena de Cabral: ver slCabral, __mduOldCabralDark)
    const lw = this.scene && globalThis.__mduOldCabralDark !== true ? 1 : 0;
    this.liftK = (this.liftK || 0) + (lw - (this.liftK || 0)) * Math.min(1, dt * 1.5);
    // (sesión 1f, el usuario: "la corona tiene un bug de iluminación en el
    // piso": la sombra del sol cubría 144 m alrededor del medio del campo y el
    // jefe en la barranca quedaba en el borde: un corte recto de sombra en el
    // pasto. La sombra sigue al jugador. __mduNoSlLightFollow: como antes)
    if (globalThis.__mduNoSlLightFollow !== true && this.lightAt) {
      const P = g.player.pos;
      if (Math.hypot(P.x - this.lightAt.x, P.z - this.lightAt.z) > 18) this.aimLight(tmpW.set(P.x, SL0.y + 2, P.z).clone());
    }
    this.al.update(dt);
    this.boss.update(dt);
    this.cav.update(dt);
    this.jinetes?.update(dt);
    if (g.state !== 'playing') return;
    if (this.host) this.hostTick(dt);
    else this.guestTick(dt);
    this.beam(dt);
    this.flag(dt);
    this.hud();
    // fase 4: amanece de a poco y la Furia se llena sola (en la corona, más rápido)
    if (this.st.phase === 4) {
      if (this.dawnT < 9) {
        this.dawnT += dt;
        this.atmos(true, Math.min(1, this.dawnT / 9));
        this.crackK = 0.55 - 0.35 * Math.min(1, this.dawnT / 9);
        if (this.vivo?.k) this.vivo.k.value = 1 - 0.45 * Math.min(1, this.dawnT / 9);
      }
      this.furiaT = (this.furiaT || 0) - dt;
      const cos = g.weapons?.cosmic;
      if (this.furiaT <= 0 && cos?.addKill && !cos.furiaOn) {
        this.furiaT = this.st.sub === 'corona' ? 0.18 : 0.3;
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
    if (this.pendCrown) {
      for (const [i, d] of Object.entries(this.pendCrown)) if (d > 0) this.ask({ h: 'cr', i: +i, d: +d.toFixed(3) });
      this.pendCrown = null;
    }
  }

  hostTick(dt) {
    const g = this.g;
    const S = this.st;
    const ph = S.phase;
    if (ph === 1 || ph === 2 || ph === 4) this.horde(dt);
    // las cargas de los dos escuadrones (las de siempre)
    this.chargeT -= dt;
    if ((ph === 1 || ph === 2) && this.chargeT <= 0 && this.leadT < 0) {
      const side = (this.nextSide = -(this.nextSide || -1));
      if (!this.al.busy(side)) {
        this.send({ a: 'ch', s: side, l: this.laneFor(side) });
        this.chargeT = ph === 1 ? 15 : 19;
      } else this.chargeT = 2;
    }
    if (ph === 4 && this.chargeT <= 0) {
      this.chargeT = 1.5;
      if (!this.al.busy(1) && !this.al.busy(-1)) {
        const c = this.laneFor(0);
        this.send({ a: 'ch', s: 1, l: Math.min(30, c + 5.5), ld: S.sub === 'corona' ? 1 : 0 });
        this.send({ a: 'ch', s: -1, l: Math.max(-30, c - 5.5) });
      }
    }
    if (ph === 1) {
      for (const z of g.zombies.pool) {
        if (!z.active || !z.dead || this.counted.has(z.id)) continue;
        this.counted.add(z.id);
        S.kills++;
        this.kcDirty = true;
      }
      if (!this.flagSent && this.phT > 2) {
        this.flagSent = true;
        this.send({ a: 'bel', i: 1 });
      }
      // los barcos cañonean (cerca de alguien) y El Eclipse larga botes
      this.cannonT -= dt;
      if (this.cannonT <= 0) {
        this.cannonT = 7 + Math.random() * 4;
        const p = this.near(10);
        this.send({ a: 'cn', i: Math.floor(Math.random() * 4), x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
      }
      this.atkT -= dt;
      if (this.atkT <= 0) {
        this.atkT = 22 + Math.random() * 6;
        this.send({ a: 'su' });
      }
      if (S.kills >= S.need) this.send({ ph: 2 });
    }
    if (ph === 2) this.bossTick(dt);
    if (ph === 4) {
      if (S.sub === 'carga' && this.phT > CAV_END) {
        this.send({ a: 'sub', s: 'corona' });
        this.send({ a: 'lit', i: S.cr.findIndex((x) => x > 0) });
        // (el primero, enseguida: venía con lo que quedaba de antes, ~20 s)
        if (CROWN_ATK) this.atkT = 3.5;
      }
      if (S.sub === 'corona') {
        // de rodillas todavía tira astillas y larga botes, de a ratos
        this.atkT -= dt;
        if (this.atkT <= 0 && CROWN_ATK) this.crownAttack();
        else if (this.atkT <= 0) {
          this.atkT = 10 + Math.random() * 4;
          if (Math.random() < 0.6) this.shadowAttack(1);
          else this.send({ a: 'su' });
        }
        // (cualquier pedazo se rompe: cuando no queda ninguno, el final; si
        // el prendido se rompió, se prende el que sigue)
        if (S.cr.every((x) => x <= 0)) {
          if (S.lit !== -1) this.send({ a: 'lit', i: -1 });
          this.send({ ph: 5 });
        } else if (S.lit < 0 || S.cr[S.lit] <= 0) this.send({ a: 'lit', i: S.cr.findIndex((x) => x > 0) });
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
        this.send({ a: 'hp', f: +S.hp.toFixed(3) });
      }
    }
  }

  // (anfitrión) La fase 2: sube, las amarras y el cuerpo; los golpes; la carga de San Martín.
  bossTick(dt) {
    const S = this.st;
    const B = this.boss;
    if (S.sub === 'sube') {
      if (B.C.rise >= 1 && !B.C.wade) this.send({ a: 'sub', s: 'amarras' });
      return;
    }
    if (!S.unv && S.am.every((x) => x <= 0)) this.send({ a: 'un' });
    // aturdido de rodillas a ciertas vidas
    // (de pie desde la última rodilla; el tambaleo de las cadenas no cuenta)
    const kneeling = B.kneelT != null && B.kneelT !== Infinity;
    this.upT = kneeling ? 0 : (this.upT ?? KNEEL_GAP) + dt;
    for (let i = 0; i < KNEELS.length; i++) {
      if ((S.kn || 0) <= i && S.unv && S.hp <= KNEELS[i] && !B.slamJob && this.leadT < 0) {
        if (KNEEL_FIX && (B.staggered || this.upT < KNEEL_GAP)) break;
        this.send({ a: 'stg', d: 5.5, kd: 'kneel' });
        this.atkT = Math.max(this.atkT, 6.5);
        if (KNEEL_FIX) {
          this.upT = 0;
          break;
        }
      }
    }
    // los golpes (no aturdido, no mientras carga San Martín)
    this.atkT -= dt;
    if (this.atkT <= 0 && !B.staggered && !B.slamJob && this.leadT < 0) this.attack();
    // a la vida de Cabral: la carga que encabeza San Martín
    if (S.unv && S.hp <= HP_CABRAL && this.leadT < 0 && !B.slamJob && !(KNEEL_FIX && B.staggered)) {
      if (!this.al.busy(1) && this.al.sm.mode === 'montado') {
        this.leadT = 0;
        this.send({ a: 'ch', s: 1, l: 4, ld: 1 });
      }
    }
    if (this.leadT >= 0) {
      this.leadT += dt;
      const h = this.al.sm.mh || this.al.sm.h;
      toLocal(h.pos.x, h.pos.z, L);
      if ((L.u > 27 && this.al.sm.lead) || this.leadT > 40) {
        this.leadT = -2;
        this.send({ ph: 3, u: +L.u.toFixed(2), v: +L.v.toFixed(2) });
      }
    }
  }

  // (anfitrión) El que sigue: con la coraza, astillas / rayo / botes; sin ella,
  // además el manotazo y la barrida (sin repetir el último).
  attack() {
    const S = this.st;
    const list = S.unv
      ? [
          ['sl', 3],
          ['sw', 2.2],
          ['bm', 2],
          ['sh', 1.6],
          ['su', 0.8],
        ]
      : [
          ['sh', 2],
          ['bm', 2],
          ['su', 1.2],
        ];
    const opts = list.filter(([k]) => k !== this.lastAtk);
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    let pick = opts[0][0];
    for (const [k, w] of opts) {
      if ((r -= w) <= 0) {
        pick = k;
        break;
      }
    }
    this.lastAtk = pick;
    if (pick === 'sl') {
      const s = this.slamSpot();
      this.send({ a: 'sl', x: +s.x.toFixed(2), z: +s.z.toFixed(2) });
      this.atkT = 7.5;
    } else if (pick === 'sw') {
      this.send({ a: 'sw', s: Math.random() < 0.5 ? 1 : -1 });
      this.atkT = 7;
    } else if (pick === 'bm') {
      this.eyeBeamNear();
      this.atkT = 6.5;
    } else if (pick === 'sh') {
      this.shadowAttack(S.unv ? 1 : 2);
      this.atkT = 6;
    } else {
      this.send({ a: 'su' });
      this.atkT = 5.5;
    }
    this.atkT *= (0.9 + Math.random() * 0.3) * (HARD ? 0.8 : 1);
  }

  // (anfitrión) El rayo de los ojos: una línea de costado (a lo ancho del
  // campo) que pasa cerca de alguien.
  eyeBeamNear() {
    const p = this.near(4);
    toLocal(p.x, p.z, L);
    const len = 46;
    const ang = (Math.random() - 0.5) * 0.8;
    const du = Math.sin(ang) * len * 0.5;
    const dv = Math.cos(ang) * len * 0.5 * (Math.random() < 0.5 ? 1 : -1);
    const clampU = (u) => Math.max(-40, Math.min(edgeU(L.v) - 2, u));
    const a = toWorld(clampU(L.u - du), Math.max(-42, Math.min(42, L.v - dv)), null, new THREE.Vector3());
    const b = toWorld(clampU(L.u + du), Math.max(-42, Math.min(42, L.v + dv)), null, new THREE.Vector3());
    this.send({ a: 'bm', p: [+a.x.toFixed(1), +a.z.toFixed(1), +b.x.toFixed(1), +b.z.toFixed(1)] });
  }

  // (anfitrión) La corona (2026-10-08, ITERACION-8, el usuario: "hacé que
  // ataque o haga algo durante la fase de la corona, realmente no ataca y es
  // bastante anticlimático"). Antes, de rodillas, cada 10-14 s unas astillas
  // o botes. Ahora, sin pararse (la animación de rodillas sigue): el rayo de
  // los ojos barre el campo, las astillas caen debajo de cada uno y larga
  // botes; sin repetir el último, cada 5,5-8 s, y más seguido a medida que
  // se le rompe la corona (con un pedazo, un 30% más rápido).
  crownAttack() {
    const S = this.st;
    const left = S.cr.filter((x) => x > 0).length;
    const list = [
      ['bm', 2.4],
      ['sh', 1.8],
      ['su', 0.8],
    ];
    const opts = list.filter(([k]) => k !== this.lastAtk);
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    let pick = opts[0][0];
    for (const [k, w] of opts) {
      if ((r -= w) <= 0) {
        pick = k;
        break;
      }
    }
    this.lastAtk = pick;
    if (pick === 'bm') this.eyeBeamNear();
    else if (pick === 'sh') this.shadowAttack(2);
    else this.send({ a: 'su' });
    this.atkT = (5.5 + Math.random() * 2.5) * (0.7 + 0.1 * Math.max(0, left - 1)) * (HARD ? 0.95 : 1.1);
  }

  // Un punto del campo cerca de alguien (al azar, a hasta r m).
  near(r) {
    const list = this.standing();
    const p = list.length ? list[Math.floor(Math.random() * list.length)] : toWorld(0, 0);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    toLocal(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, L);
    const o = { u: L.u, v: L.v };
    clampLocal(o, 1);
    return toWorld(o.u, o.v, null, new THREE.Vector3());
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

  // Astillas: una debajo de cada uno y `extra` sueltas cerca.
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
    if (pts.length) this.send({ a: 'sh', p: pts.map((x) => +x.toFixed(1)) });
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
    // (los botes traen la mayoría: lo de acá es el goteo)
    this.spawnT = MORE ? (ph === 4 ? 0.3 : 0.4) : ph === 4 ? 0.7 : 1.1;
    if (ph === 4 && this.st.sub === 'carga') return;
    const cap = Math.round(CAP[ph] * this.team(0.5));
    if (g.zombies.alive >= cap) return;
    const round = Math.max(8, g.rounds?.round || 12);
    let at;
    if (Math.random() < 0.8) {
      const b = F.bajadas[Math.floor(Math.random() * F.bajadas.length)];
      const v = b + (Math.random() - 0.5) * 2.4;
      at = toWorld(edgeU(v) + 9.5 + Math.random() * 1.2, v, null, new THREE.Vector3());
    } else {
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

  // (anfitrión) Un bote tocó la playa: bajan los realistas que trae.
  onBoat(u, v) {
    const g = this.g;
    const ph = this.st.phase;
    if (!this.active || !this.host || !(ph === 1 || ph === 2 || ph === 4)) return;
    if (ph === 4 && this.st.sub === 'carga') return;
    const cap = Math.round(CAP[ph] * this.team(0.5)) + 4;
    const round = Math.max(8, g.rounds?.round || 12);
    // (bajan del bote y van al pie de la bajada más cerca: afuera de las
    // zanjas, el choque de la barranca los subía de golpe al borde)
    const b = F.bajadas.reduce((a, x) => (Math.abs(x - v) < Math.abs(a - v) ? x : a), F.bajadas[0]);
    const bv = b + Math.max(-2.2, Math.min(2.2, v - b));
    for (let i = 0; i < 4 && g.zombies.alive < cap; i++) {
      const vv = bv + (Math.random() - 0.5) * 1.6;
      const at = toWorld(edgeU(vv) + 9 + Math.random() * 2.5, Math.max(b - 2.6, Math.min(b + 2.6, vv)), null, new THREE.Vector3());
      g.zombies.spawn(round, zombieHealth(round), at);
    }
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
    } else if (ph === 2 && S.sub !== 'sube') {
      const left = S.am.filter((x) => x > 0).length;
      name = S.unv ? 'El Eclipse' : `El Eclipse (${left} cadena${left === 1 ? '' : 's'})`;
      k = S.unv ? S.hp : 1;
    } else if (ph === 4 && S.sub === 'corona') {
      const left = S.cr.filter((x) => x > 0).length;
      name = `La corona del Eclipse (${left} de 4)`;
      k = S.cr.reduce((a, x) => a + Math.max(0, x), 0) / 4;
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
    // (qa-flujo) la Furia que rompió la corona termina acá, debajo del blanco:
    // en la cinemática el arma no se actualiza y su tinte (eclK, las grietas de
    // oro de fx/PostFX) quedaba encima de toda la escena
    const cos = g.weapons?.cosmic;
    if (cos) {
      cos.endFuria?.();
      cos.eclK = 0;
    }
    this.vivo?.lightsOff();
    // (el cielo de las islas vuelve: la cinemática final cose el universo)
    const SU = g.world.sky?.material?.uniforms;
    if (SU?.uWid && this.widSaved) {
      SU.uWid.value = this.widSaved;
      this.widSaved = null;
    }
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
      // el blanco se va: sin cinemática, despacio; con la cinemática final
      // (ui/EclipseEnding.js), apenas arranca (qa-flujo: antes se quedaba
      // en 1 encima del lienzo y la cinemática entera se veía blanca)
      g.later(1.5, () => {
        el.style.transition = this.ee.scene ? 'opacity 1.2s' : 'opacity 2.2s';
        el.style.opacity = '0';
        g.later(2.5, () => el.remove());
      });
    });
  }

  dispose() {
    const g = this.g;
    const w = g.world;
    this.disposed = true;
    this.cabralWarm?.dispose?.();
    this.cabralWarm = null;
    if (this.base) {
      w.outY = this.base.outY;
      w.raycast = this.base.raycast;
      w.collide = this.base.collide;
      w.extraUpdate = this.base.extraUpdate;
    }
    const U = w.sky?.material?.uniforms;
    if (U?.uNight && this.night0 != null) U.uNight.value = this.night0;
    if (U?.uWid && this.widSaved) U.uWid.value = this.widSaved;
    if (this.lookWrap) {
      g.scene.onBeforeRender = this.lookWrap.prev;
      this.lookWrap = null;
    }
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
    this.vivo?.dispose();
    this.cav?.dispose();
    this.jinetes?.dispose();
    this.al?.dispose();
    this.boss?.dispose();
    this.campo?.dispose();
  }
}
