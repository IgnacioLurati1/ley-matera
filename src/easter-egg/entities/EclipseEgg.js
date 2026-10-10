import * as THREE from 'three';
import { EE } from '../config/map';
import { markEgg } from '../core/eggs';
import { setSleeveColor } from '../weapons/viewmodels';
import { gilVincha } from '../net/gilLook';
import EclipsePortals from '../world/eclipsePortals';
import { makeEclipseScenes } from '../ui/eclipseScenes';
import { STEPS } from './eclipse/Ingredientes';
import Guadana from './eclipse/Guadana';
import Temple from './eclipse/Temple';
import Desgarro10 from './eclipse/Desgarro10';
import SanLorenzo from './eclipse/SanLorenzo';
import Trampas from './eclipse/Trampas';
import Mates from './eclipse/Mates';
import Disformidad from './eclipse/Disformidad';
import Rincones from './eclipse/Rincones';
import Sombrero from './eclipse/Sombrero';
import { Marker, HoldZone, myId, isHost, players, dist2 } from './eclipse/common';
import { PrimerMateCine, CruceCine, buildCruceRift, cruceOn } from '../ui/eclipseCruce';
import { eclAmbience } from '../fx/eclipseAmbience';

// El easter egg de Eclipse Matero: "El Primer Mate".
//
// Se juega con el Gauchito Gil y sus compañeros (Anacleto, Cirilo, Benito):
// el anfitrión sortea al Gil (solo: vos), como en Mate no Numa. Tres actos:
//  I.   Juntar el mate: un paso por isla (entities/eclipse/Ingredientes.js):
//       la Brasa (molino), la Yerba (tapera), la Bombilla (penal), el Agua
//       (castillo), la Calabaza (claro), el Sable (monumento); y el cañón de
//       la torre, que trae la totalidad. De paso se arma el Desgarrador
//       (entities/eclipse/Guadana.js).
//  II.  Templar la guadaña: "El Temple de los Cuatro Filos" (entities/eclipse/
//       Temple.js), que da el Desgarrador del Eclipse y la Furia Cósmica.
//  III. Cebar el Primer Mate en el fogón del claro: el vapor abre un desgarro
//       a San Lorenzo (1813) y se cruza (ui/eclipseCruce.js; antes, el mate
//       mostraba dónde cortar y el tajo de la Furia abría la arena).
//       La pelea final y el final van aparte (ui/SanLorenzo, ui/EclipseEnding).
// Guía: la voz de Martín Fierro, en subtítulos cortos (qué + dónde).
// Los portales del desgarro que unen las islas: world/eclipsePortals.js. Sin
// minijefe (tuneRound). En línea lo lleva el anfitrión (fullState /
// applyRemote / onGuest); cada paso viaja por 'pee' con k 'eq' y su id.

export const CAST = {
  gil: { name: 'Antonio Gil', sub: 'el Gauchito', color: 0xb01c14 },
  anacleto: { name: 'Anacleto', sub: 'compañero de Gil', color: 0x3a6a2a },
  cirilo: { name: 'Cirilo', sub: 'compañero de Gil', color: 0x2a3a7a },
  benito: { name: 'Benito', sub: 'compañero de Gil', color: 0x7a5a2a },
  nicasio: { name: 'Nicasio', sub: 'compañero de Gil', color: 0x5a2a6a },
};
const MATES = ['anacleto', 'cirilo', 'benito', 'nicasio'];
// los ingredientes del Primer Mate, en el orden de la lista
export const INGREDIENTES = ['calabaza', 'yerba', 'agua', 'bombilla', 'brasa', 'sable'];
const NAME = { calabaza: 'la Calabaza', yerba: 'la Yerba', agua: 'el Agua', bombilla: 'la Bombilla', brasa: 'la Brasa', sable: 'el Sable', canon: 'el cañón', guadana: 'el Desgarrador', temple: 'el temple' };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CEBAR_HOLD = 3;
// cuánto refuerzo trae un encierro (muertos por jugador) y cada cuánto
const HORDE_EACH = 5;

export default class EclipseEgg {
  constructor(game) {
    this.g = game;
    this.step = 0;
    this.done = false;
    // la escena en curso, si hay (Game la mira para pausar las rondas)
    this.scene = null;
    // las escenas dentro de la partida (ui/eclipseScenes.js): sable(cb), ending()
    this.scenes = makeEclipseScenes(this);
    this.roles = new Map();
    this.gil = null;
    this.painted = 0;
    // lo juntado por el equipo: ingrediente → 1
    this.got_ = {};
    this.totality = false;
    this.cebado = 0;
    this.corte = 0;
    this.hordeT = 0;
    this.portals = new EclipsePortals(game, this);
    this.steps = {};
    for (const [id, C] of Object.entries(STEPS)) this.steps[id] = new C(this);
    this.steps.guadana = new Guadana(this);
    this.steps.temple = new Temple(this);
    // el evento de cada 10 rondas: el Desgarro Cósmico (entities/eclipse/Desgarro10.js);
    // las rondas lo buscan por g.defense
    this.d10 = new Desgarro10(this);
    game.defense = this.d10;
    // la pelea final: San Lorenzo (entities/eclipse/SanLorenzo.js)
    this.arena = new SanLorenzo(this);
    // las trampas del desgarro, una por isla (entities/eclipse/Trampas.js; v5)
    this.trampas = new Trampas(this);
    // los siete mates perdidos, uno por isla (entities/eclipse/Mates.js; v5)
    this.mates = new Mates(this);
    // (mundo, it. 4) la Disformidad aprieta: entrar es hostil (entities/eclipse/Disformidad.js)
    this.disf = new Disformidad(this);
    // (mundo, it. 4) cosas para hacer en las zonas que no tenían nada (entities/eclipse/Rincones.js)
    this.rinc = new Rincones(this);
    // el chambergo del matrero: el sombrero del equipo (entities/eclipse/Sombrero.js; 2026-10-10)
    this.somb = new Sombrero(this);
    // el fogón: la voz de Fierro y donde se ceba
    const f = EE.fogon || [140.5, 158.5];
    const w = game.world;
    this.fogon = V(f[0], w.floorAt(f[0], f[1]), f[1]);
    this.mF = new Marker(game, this.fogon, 0xffb060, 0.9);
    this.mF.set(false);
    // dónde cortar, cuando el mate lo muestra
    const c = EE.corte || [146.5, 180.5];
    this.cutAt = V(c[0], w.floorAt(c[0], c[1]), c[1]);
    this.mC = new Marker(game, this.cutAt, 0xd080ff, 1.2);
    this.mC.set(false);
    this.fogonIt = game.interact.add({
      kind: 'eclipse-fogon',
      pos: this.fogon.clone().add(V(0, 1, 0)),
      radius: 2.4,
      prompt: () => {
        if (this.cebado) return null;
        if (!this.ready()) return null;
        return this.isGil() ? { text: 'cebar el Primer Mate', noCost: true, hold: true } : { text: 'El Gil ceba', noCost: true, info: true };
      },
      cost: () => 0,
      holdTime: CEBAR_HOLD,
      use: () => {
        if (this.cebado || !this.ready() || !this.isGil()) return false;
        this.sendEgg({ a: 'cebar' });
        return true;
      },
    });
    // (qa-flujo) preguntarle a Fierro en el fogón: lo que sigue, qué + dónde.
    // Local (cada uno escucha lo suyo); con todo junto manda el de cebar.
    this.fierroIt = game.interact.add({
      kind: 'eclipse-fierro',
      local: true,
      pos: this.fogon.clone().add(V(0, 1, 0)),
      radius: 2.4,
      prompt: () => (this.done || this.cebado || this.ready() ? null : { text: 'escuchar a Fierro', noCost: true }),
      cost: () => 0,
      use: () => {
        if (this.done || this.cebado || this.ready()) return false;
        this.fierro(true);
        return true;
      },
    });
    // (ITERACION-7 C6) cruzar el desgarro a San Lorenzo: con el aviso
    this.cruceIt = game.interact.add({
      kind: 'eclipse-cruce',
      pos: this.cutAt.clone().add(V(0, 1.2, 0)),
      radius: 3.2,
      prompt: () => (this.canCross() ? { text: 'cruzar a San Lorenzo: la batalla final (no hay vuelta)', noCost: true, hold: true } : null),
      cost: () => 0,
      holdTime: 1.5,
      use: () => {
        if (!this.canCross()) return false;
        this.sendEgg({ a: 'cruzar' });
        return true;
      },
    });
    this.rift = null;
    this.unlisten = null;
    this.fierroT = 0;
    this.fierroI = 0;
  }

  // ---------------- lo que el juego llama ----------------
  // Eclipse Matero no tiene jefe de ronda: sin esto el juego igual manda al
  // Capataz cada cinco (lo llama Rounds.nextRound).
  tuneRound(R) {
    R.bossPending = false;
  }

  announce(text, secs = 3) {
    this.g.hud?.subtitle?.(text, secs);
  }

  onPower() {}

  onZone() {}

  onKill(z, info) {
    for (const s of Object.values(this.steps)) s.onKill?.(z, info);
    // los ojos de la Disformidad (world/papDesgarro.js)
    this.g.papq?.termas?.onKill?.(z, info);
    this.somb?.onKill(z, info);
  }

  // los tiros (Weapons): la arena de San Lorenzo los mira (amarras, El Eclipse)
  onShot(o, d, t) {
    this.arena?.onShot?.(o, d, t);
    this.rinc?.onShot?.(o, d, t);
    this.somb?.onShot?.(o, d, t);
  }

  // Game la llama mientras hay una escena del easter egg (this.scene): la cámara
  sceneCam(dt) {
    return this.scene ? this.scene.update(dt) : false;
  }

  onExplosion() {}

  // Antes del dibujo del mundo (fx/PostFX.render): la vista de la otra isla
  // adentro de los portales.
  prerender(renderer, scene, cam) {
    this.portals.prerender(renderer, scene, cam);
  }

  // Lo que manda un invitado (net/Session.js: 'pee').
  onGuest(m, from) {
    if (m?.k === 'ptl') return;
    if (m?.k === 'eq') return this.steps[m.s]?.onGuest(m, from);
    if (m?.k === 'egg' && isHost(this.g)) this.sendEgg(m);
    if (m?.k === 'd10') this.d10.onGuest?.(m, from);
    if (m?.k === 'sl') this.arena.onGuest?.(m, from);
    if (m?.k === 'trap') this.trampas.onGuest?.(m, from);
    if (m?.k === 'mates') this.mates.onGuest?.(m, from);
    if (m?.k === 'rinc') this.rinc.onGuest?.(m, from);
    if (m?.k === 'somb') this.somb.onGuest?.(m, from);
  }

  // ---------------- los personajes ----------------
  ids() {
    const me = myId(this.g);
    const others = this.g.net ? [...this.g.net.remote.keys()].filter((id) => id !== me) : [];
    return [me, ...others.sort((a, b) => a - b)];
  }

  roleOf(id = myId(this.g)) {
    return this.roles.get(id) || null;
  }

  isGil(id = myId(this.g)) {
    return this.roleOf(id) === 'gil';
  }

  castRoles() {
    const ids = this.ids();
    const gil = this.g.net ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
    const roles = [];
    let k = 0;
    for (const id of ids) roles.push([id, id === gil ? 'gil' : MATES[k++ % MATES.length]]);
    this.setRoles(roles, true);
  }

  keepRoles() {
    const ids = this.ids();
    const now = [...this.roles].filter(([id]) => ids.includes(id));
    let changed = now.length !== this.roles.size;
    if (!now.some(([, r]) => r === 'gil') && now.length) {
      const pick = now[Math.floor(Math.random() * now.length)];
      pick[1] = 'gil';
      changed = true;
      this.announce('El Gil se fue... ahora el desgarro le habla a otro.', 4);
    }
    for (const id of ids) {
      if (now.some(([x]) => x === id)) continue;
      const used = new Set(now.map(([, r]) => r));
      now.push([id, MATES.find((m) => !used.has(m)) || 'nicasio']);
      changed = true;
    }
    if (changed) this.setRoles(now, true);
  }

  setRoles(roles, send = false) {
    const g = this.g;
    const before = this.roleOf();
    this.roles = new Map(roles);
    this.gil = roles.find(([, r]) => r === 'gil')?.[0] ?? null;
    if (send) g.net?.event('ee', { roles });
    this.paintRoles();
    const mine = CAST[this.roleOf()];
    setSleeveColor(mine?.color ?? null);
    if (!mine || before === this.roleOf()) return;
    g.hud.toast(`Sos ${mine.name}, ${mine.sub}`);
    g.hud.subtitle(this.isGil() ? 'Rompiste la ronda. Ahora todo está roto, y el Primer Mate anda suelto.' : 'Seguiste al Gil hasta acá. Lo que queda del mundo flota.', 5);
  }

  // Cada uno con su poncho; el Gil, con la vincha (net/gilLook.js).
  paintRoles() {
    const av = this.g.net?.avatars;
    if (!av) return;
    for (const [id, role] of this.roles) av.restyle(id, CAST[role].color);
    this.painted = av.list.size;
  }

  // ---------------- el mate ----------------
  has(k) {
    return !!this.got_[k];
  }

  ready() {
    return INGREDIENTES.every((k) => this.has(k)) && this.has('temple');
  }

  // (un paso terminó, en todas las compus) anota y guía al siguiente
  got(k, byId) {
    if (this.got_[k]) return;
    this.got_[k] = 1;
    const g = this.g;
    // (el anfitrión manda el estado entero: los atajos de Alt+I marcan pasos sin
    // pasar por la red, y así los invitados igual se enteran)
    if (isHost(g) && g.net) g.net.event('ee', this.fullState());
    if (NAME[k] && INGREDIENTES.includes(k)) g.hud.toast(`${NAME[k]}: ${INGREDIENTES.filter((x) => this.got_[x]).length} de ${INGREDIENTES.length}`);
    if (k === 'guadana') this.steps.temple.start();
    if (this.ready()) {
      this.mF.set(true);
      g.hud.subtitle('Todo junto. El fogón del claro: que el Gil cebe el Primer Mate.', 5);
    } else if (INGREDIENTES.includes(k)) {
      const left = INGREDIENTES.filter((x) => !this.got_[x]);
      // (qa-flujo: con los seis y sin el temple decía "Falta: .")
      if (!left.length) g.hud.subtitle('Los seis, juntos. Falta templar la guadaña.', 4);
      else if (left.length <= 2) g.hud.subtitle(`Falta${left.length > 1 ? 'n' : ''}: ${left.map((x) => NAME[x]).join(' y ')}.`, 4);
    }
  }

  // la totalidad: el cañón de la Torre (y el evento de la ronda 10, si no pasó)
  onTotality() {
    this.totality = true;
    this.g.defense?.forceEarly?.();
    if (isHost(this.g) && this.g.net) this.g.net.event('ee', this.fullState());
  }

  // Un encierro: más muertos por un rato (el anfitrión; las rondas siguen)
  horde(secs) {
    if (!isHost(this.g)) return;
    this.hordeT = Math.max(this.hordeT, secs);
    const R = this.g.rounds;
    if (R?.state === 'active') R.toSpawn = (R.toSpawn || 0) + HORDE_EACH * players(this.g).length;
  }

  sendEgg(m0) {
    const { t: _t, e: _e, ...m } = m0;
    if (!isHost(this.g)) return this.g.net?.net?.send({ t: 'pee', k: 'egg', ...m });
    this.applyEgg(m);
    this.g.net?.event('pee', { k: 'egg', ...m });
  }

  applyEgg(m) {
    const g = this.g;
    if (m.a === 'cebar') {
      if (cruceOn()) {
        if (this.cebado) return;
        this.cebado = 1;
        this.mF.set(false);
        g.world.eclipse?.set?.(1, 2);
        this.step = 3;
        this.playPrimerMate();
        return;
      }
      this.cebado = 1;
      this.mF.set(false);
      this.mC.set(true);
      g.world.eclipse?.set?.(1, 2);
      setTimeout(() => g.world.eclipse?.pulse?.(), 2000);
      g.fx.sparkle(this.fogon.clone().add(V(0, 1.2, 0)), [1, 0.8, 0.4], 30, 1);
      g.hud.toast('El Primer Mate');
      g.hud.subtitle('El mate muestra dónde cortar. Con la Furia Cósmica (H), un tajo ahí.', 6);
      this.step = 3;
    } else if (m.a === 'corte') {
      this.corte = 1;
      this.mC.set(false);
      g.fx.addShake?.(0.6);
      g.world.eclipse?.pulse?.();
      g.fx.sparkle(this.cutAt.clone().add(V(0, 1.5, 0)), [0.8, 0.4, 1], 60, 2);
      g.hud.subtitle('El desgarro se abre al 3 de febrero de 1813. San Lorenzo.', 5);
      this.step = 4;
      this.startArena();
    } else if (m.a === 'cruzar') {
      if (this.corte || !cruceOn()) return;
      this.corte = 1;
      this.step = 4;
      this.playCruce();
    }
  }

  // ---------------- el camino a San Lorenzo (ui/eclipseCruce.js) ----------------
  cruceRift() {
    if (!this.rift) this.rift = buildCruceRift(this);
    return this.rift;
  }

  // el desgarro abierto en el claro (al terminar el Primer Mate, o el que entra tarde)
  showRift() {
    const r = this.cruceRift();
    r.root.visible = true;
    r.U.uOpen.value = 1;
    r.U.uCrack.value = 0;
    r.U.uFlash.value = 0;
  }

  canCross() {
    return cruceOn() && !!this.cebado && !this.corte && !this.scene && !this.arena?.active && !!this.rift?.root.visible;
  }

  // El Primer Mate (en todas las compus): el vapor abre el desgarro.
  playPrimerMate() {
    const g = this.g;
    const rift = this.cruceRift();
    const done = () => {
      this.showRift();
      g.hud.subtitle('El desgarro a San Lorenzo: la batalla final. Crucen cuando estén listos (no hay vuelta).', 7);
    };
    if (this.scene) return done();
    let cine;
    try {
      cine = new PrimerMateCine(this, rift);
    } catch (e) {
      console.error('Primer Mate: no se armó la escena', e);
      return done();
    }
    this.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-mate', cine };
    cine.play(() => {
      if (this.scene?.cine === cine) this.scene = null;
      done();
    });
  }

  // El cruce (en todas las compus): entran, blanco, la arena se arma debajo y el vuelo.
  playCruce() {
    const rift = this.cruceRift();
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      rift.root.visible = false;
      this.startArena({ cine: true });
    };
    // (si todavía corría el Primer Mate en esta compu, se corta)
    if (this.scene?.kind === 'eclipse-mate') this.scene.cine.skip();
    if (this.scene) {
      go();
      this.arena.arrived?.();
      return;
    }
    let cine;
    try {
      cine = new CruceCine(this, rift, go);
    } catch (e) {
      console.error('El cruce: no se armó la escena', e);
      go();
      this.arena.arrived?.();
      return;
    }
    this.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-cruce', cine };
    cine.play(() => {
      if (this.scene?.cine === cine) this.scene = null;
      go();
      this.arena.arrived?.();
    });
  }

  // Se ganó San Lorenzo (entities/eclipse/SanLorenzo.js): el final. La
  // cinemática (ui/EclipseEnding.js, cuando exista) se engancha en
  // this.scenes.ending; mientras no está, el mapa se da por hecho.
  arenaWon() {
    const g = this.g;
    if (this.done) return;
    this.done = true;
    this.step = 5;
    if (this.scenes?.ending) return this.scenes.ending();
    markEgg?.('eclipse');
    g.hud?.achievement?.('El que cebó el Primer Mate', 'Terminaste el easter egg de Eclipse Matero.');
    g.hud.subtitle('(La cinemática final todavía no está armada.)', 4);
  }

  // (mientras no hay arena, el mapa se da por hecho acá, para probar el camino entero)
  startArena(opts = {}) {
    const g = this.g;
    if (this.arena?.start?.(opts) !== false) return;
    this.done = true;
    markEgg?.('eclipse');
    g.hud.subtitle('(La batalla de San Lorenzo todavía no está armada.)', 5);
  }

  // un tajo del Desgarrador (del jugador local)
  onScythe(ev) {
    if (ev.type === 'cut') this.steps.yerba?.onCut(ev);
    this.steps.temple?.onScythe(ev);
    if (!cruceOn() && ev.type === 'cut' && this.cebado && !this.corte && this.g.weapons.cosmic?.furiaOn && dist2(ev.o, this.cutAt) < (ev.range || 3) + 1) this.sendEgg({ a: 'corte' });
  }

  update(dt) {
    const g = this.g;
    const t = g.time || 0;
    // (el ambiente de cada isla: lo pasa Game.loop, ver fx/eclipseAmbience.js)
    eclAmbience(g);
    this.portals.update(dt);
    // la guadaña avisa lo suyo (cuando ya existe)
    if (!this.unlisten && g.weapons?.cosmic?.listen) this.unlisten = g.weapons.cosmic.listen((ev) => this.onScythe(ev));
    for (const s of Object.values(this.steps)) s.update(dt, t);
    this.d10.update(dt);
    this.arena.update(dt);
    this.trampas.update(dt);
    this.mates.update(dt, t);
    this.disf.update(dt);
    this.rinc.update(dt);
    this.somb.update(dt);
    this.mF.update(dt, t);
    this.mC.update(dt, t);
    if (this.rift?.root.visible) this.rift.tick(dt, g.camera);
    if (g.state !== 'playing') return;
    // los papeles (el anfitrión reparte; los demás los reciben)
    if (isHost(g)) {
      if (!this.roles.size) this.castRoles();
      else if (g.net && (this.roles.size !== this.ids().length || !this.roles.has(this.gil))) this.keepRoles();
    }
    const av = g.net?.avatars;
    if (av && av.list.size !== this.painted) this.paintRoles();
    if (av && this.gil != null && this.gil !== myId(g)) gilVincha(av.list.get(this.gil));
    // el refuerzo de los encierros
    if (this.hordeT > 0) {
      this.hordeT -= dt;
      const R = g.rounds;
      if (isHost(g) && R?.state === 'active') {
        R.delay = Math.min(R.delay || 2, 1.1);
        if (Math.floor(t / 8) !== Math.floor((t - dt) / 8)) R.toSpawn = (R.toSpawn || 0) + HORDE_EACH * players(g).length;
      }
    }
    // la voz de Fierro, cada tanto, si no hay nada en curso
    this.fierroT -= dt;
    if (this.fierroT <= 0) {
      this.fierroT = 75;
      this.fierro();
    }
  }

  // Lo que dice Fierro: qué falta y dónde (qué + dónde, corto). Cada vez, lo
  // siguiente de la lista de lo pendiente (qa-flujo: antes, un ingrediente al
  // azar; la guadaña sin decir cómo se llega a la Disformidad; el temple y el
  // cañón recién al final). `ask`: se lo preguntaron en el fogón.
  fierro(ask = false) {
    const g = this.g;
    // (el desgarro abierto, esperando: el recordatorio y el aviso)
    if (cruceOn() && this.cebado && !this.corte && !this.done && !this.scene && !ask) return g.hud.subtitle('El desgarro del claro lleva a San Lorenzo: la batalla final. No hay vuelta.', 5);
    if (this.done || this.cebado) return;
    // (preguntado seguido, las líneas se apilaban en bloque: una cada 3 s como mucho)
    if (ask && g.time - (this.fierroAt || -9) < 3) return;
    if (ask) this.fierroAt = g.time;
    // (no encima de la escena del Sable)
    if (!ask && this.scenes?.debugSable?.()?.on) return;
    const say = [];
    if (!this.has('guadana')) {
      const G = this.steps.guadana.st;
      const T = g.papq?.termas;
      if (!G.hoja && !G.asta) say.push('Primero el filo: la hoja en el Establo Colorado de La Tapera; el asta, una tacuara a orillas de la laguna.');
      else if (!G.hoja) say.push('Falta la hoja: el Establo Colorado de La Tapera.');
      else if (!G.asta) say.push('Falta el asta: una tacuara a orillas de la laguna del claro.');
      else if (!g.world.power) say.push('Para templar el filo, primero la luz: el tablero del galpón del Molino.');
      else if (T && !T.allScars()) say.push(T.hintI?.() || 'Tres cicatrices flotan en el claro: cerralas a tiros. Abren el portal negro del Nudo.');
      else if (!this.steps.guadana.papAwake()) say.push('En la Disformidad: abrí los cuatro ojos con bajas y hacé el ritual del Pack-a-Pava.');
      else say.push('Templá el filo al lado del Pack-a-Pava, en la Disformidad.');
    }
    const T = this.steps.temple;
    if (this.has('guadana') && !this.has('temple')) say.push(`El temple: ${T.hint(T.stage || 1)}`);
    if (!this.has('canon') && !(this.has('guadana') && T.stage === 6)) say.push('El cañón de la cima de la Torre: el eclipse total.');
    const where = { calabaza: 'el Gil cava en la laguna del claro', yerba: 'la Yerba Madre, en el maizal de La Tapera', agua: 'los cuatro altares del patio del Castillo', bombilla: 'la celda de las siete rayas, Pabellón B del Penal', brasa: 'las velas de la capilla del Molino', sable: 'la Llama Votiva del Propileo, en el Monumento' };
    for (const k of INGREDIENTES) if (!this.got_[k]) say.push(`Falta ${NAME[k]}: ${where[k]}.`);
    if (!say.length) return;
    // (lo principal, la guadaña o el temple, primero; cuando cambia, de nuevo desde ahí)
    if (say[0] !== this.fierroKey) {
      this.fierroKey = say[0];
      this.fierroI = 0;
    }
    // (solo, cada tanto: lo principal mientras haya guadaña o temple por hacer;
    // preguntado en el fogón, o sin principal: uno por vez, en orden)
    const main = !this.has('temple');
    const line = ask || !main ? say[this.fierroI++ % say.length] : say[0];
    g.hud.subtitle(line, ask ? 6 : 5);
  }

  // ---------------- la red ----------------
  fullState() {
    const steps = {};
    for (const [id, s] of Object.entries(this.steps)) steps[id] = s.state();
    return { step: this.step, done: this.done, ptl: this.portals.state(), roles: [...this.roles], d10: this.d10.state(), sl: this.arena.state(), ...this.trampas.state(), ...this.mates.state(), ...this.rinc.state(), ...this.somb.state(), got: { ...this.got_ }, tot: this.totality ? 1 : 0, ceb: this.cebado, cor: this.corte, steps };
  }

  applyRemote(m) {
    if (!m) return;
    if (m.k === 'ptl') return this.portals.apply(m);
    if (m.k === 'eq') {
      const s = this.steps[m.s];
      if (!s) return;
      if (s.applyRemoteExtra?.(m)) return;
      return s.apply(m);
    }
    if (m.k === 'egg') return this.applyEgg(m);
    if (m.k === 'd10') return this.d10.apply(m);
    if (m.k === 'sl') return this.arena.apply(m);
    if (m.k === 'trap') return this.trampas.apply(m);
    if (m.k === 'mates') return this.mates.apply(m);
    if (m.k === 'rinc') return this.rinc.apply(m);
    if (m.k === 'somb') return this.somb.apply(m);
    if (m.d10) this.d10.applyFull(m.d10);
    if (m.tr) this.trampas.applyFull(m.tr);
    if (m.mt != null) this.mates.applyFull(m.mt);
    if (m.rc) this.rinc.applyFull(m.rc);
    if (m.sb) this.somb.applyFull(m.sb);
    if (m.sl) this.arena.applyFull(m.sl);
    if (m.roles) this.setRoles(m.roles);
    if (m.ptl) this.portals.applyFull(m.ptl);
    if (m.got) for (const k of Object.keys(m.got)) this.got_[k] = 1;
    if (m.tot && !this.totality) {
      this.totality = true;
      // (el cielo del que entra tarde o recibe el estado: a la totalidad también)
      this.g.world.eclipse?.set?.(1, 3);
    }
    if (m.ceb) this.cebado = m.ceb;
    if (m.cor) this.corte = m.cor;
    if (m.steps) for (const [id, st] of Object.entries(m.steps)) this.steps[id]?.applyFull(st);
    if (m.step != null) this.step = m.step;
    if (m.done != null) this.done = m.done;
    this.mF.set(this.ready() && !this.cebado);
    this.mC.set(!!this.cebado && !this.corte);
    if (cruceOn()) {
      this.mC.set(false);
      if (this.cebado && !this.corte && !this.scene) this.showRift();
    }
  }

  // Alt+K: abre todos los portales, da todo lo juntado y la guadaña templada;
  // queda cebar y cortar (así se prueba el final del camino).
  debugFinal() {
    const g = this.g;
    for (const P of this.portals.list) this.portals.unlock(P.def.id);
    if (!isHost(g)) return;
    for (const k of [...INGREDIENTES, 'canon', 'guadana']) this.got_[k] = 1;
    this.totality = true;
    g.world.eclipse?.set?.(1, 2);
    for (const s of Object.values(this.steps)) {
      s.st.done = 1;
      s.refresh?.();
    }
    if (!g.weapons.cosmic?.held?.()) g.weapons.cosmic?.give(1);
    else g.weapons.cosmic?.upgrade();
    this.got_.temple = 1;
    this.steps.temple.st.stage = 7;
    this.mF.set(true);
    g.hud.subtitle('Todo junto: cebá el Primer Mate en el fogón del claro.', 5);
    if (g.net) g.net.event('ee', this.fullState());
  }

  dispose() {
    this.scene?.cine?.dispose?.();
    this.scene = null;
    this.unlisten?.();
    for (const s of Object.values(this.steps)) s.dispose();
    this.d10.dispose();
    this.arena.dispose();
    this.trampas.dispose();
    this.mates.dispose();
    this.disf.dispose();
    this.rinc.dispose();
    this.somb.dispose();
    if (this.g.defense === this.d10) this.g.defense = null;
    this.mF.dispose();
    this.mC.dispose();
    this.rift?.dispose();
    this.portals.dispose();
    setSleeveColor(null);
  }
}
