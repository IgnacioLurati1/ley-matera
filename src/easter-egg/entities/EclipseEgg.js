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
import { Marker, HoldZone, myId, isHost, players, dist2 } from './eclipse/common';

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
//  III. Cebar el Primer Mate en el fogón del claro: el mate muestra dónde
//       cortar; con la Furia, el tajo abre el desgarro a San Lorenzo (1813).
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
    this.unlisten = null;
    this.fierroT = 0;
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
  }

  // los tiros (Weapons): la arena de San Lorenzo los mira (amarras, El Eclipse)
  onShot(o, d, t) {
    this.arena?.onShot?.(o, d, t);
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
    if (NAME[k] && INGREDIENTES.includes(k)) g.hud.toast(`${NAME[k]}: ${INGREDIENTES.filter((x) => this.got_[x]).length} de ${INGREDIENTES.length}`);
    if (k === 'guadana') this.steps.temple.start();
    if (this.ready()) {
      this.mF.set(true);
      g.hud.subtitle('Todo junto. El fogón del claro: que el Gil cebe el Primer Mate.', 5);
    } else if (INGREDIENTES.includes(k)) {
      const left = INGREDIENTES.filter((x) => !this.got_[x]);
      if (left.length <= 2) g.hud.subtitle(`Falta${left.length > 1 ? 'n' : ''}: ${left.map((x) => NAME[x]).join(' y ')}.`, 4);
    }
  }

  // la totalidad: el cañón de la Torre (y el evento de la ronda 10, si no pasó)
  onTotality() {
    this.totality = true;
    this.g.defense?.forceEarly?.();
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
    }
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
  startArena() {
    const g = this.g;
    if (this.arena?.start?.() !== false) return;
    this.done = true;
    markEgg?.('eclipse');
    g.hud.subtitle('(La batalla de San Lorenzo todavía no está armada.)', 5);
  }

  // un tajo del Desgarrador (del jugador local)
  onScythe(ev) {
    if (ev.type === 'cut') this.steps.yerba?.onCut(ev);
    this.steps.temple?.onScythe(ev);
    if (ev.type === 'cut' && this.cebado && !this.corte && this.g.weapons.cosmic?.furiaOn && dist2(ev.o, this.cutAt) < (ev.range || 3) + 1) this.sendEgg({ a: 'corte' });
  }

  update(dt) {
    const g = this.g;
    const t = g.time || 0;
    this.portals.update(dt);
    // la guadaña avisa lo suyo (cuando ya existe)
    if (!this.unlisten && g.weapons?.cosmic?.listen) this.unlisten = g.weapons.cosmic.listen((ev) => this.onScythe(ev));
    for (const s of Object.values(this.steps)) s.update(dt, t);
    this.d10.update(dt);
    this.arena.update(dt);
    this.mF.update(dt, t);
    this.mC.update(dt, t);
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

  // Lo que dice Fierro: qué falta y dónde (qué + dónde, corto).
  fierro() {
    const g = this.g;
    if (this.done || this.cebado) return;
    if (!this.has('guadana')) return g.hud.subtitle(this.steps.guadana.st.hoja || this.steps.guadana.st.asta ? 'Las dos piezas, y templarlas en un desgarro abierto.' : 'Primero el filo: la hoja en el Establo de La Tapera, el asta en la laguna.', 5);
    const left = INGREDIENTES.filter((x) => !this.got_[x]);
    if (left.length) {
      const where = { calabaza: 'la laguna del claro', yerba: 'el maizal de La Tapera', agua: 'el patio del Castillo', bombilla: 'el pabellón del Penal', brasa: 'la capilla del Molino', sable: 'la Llama del Monumento' };
      const k = left[Math.floor(Math.random() * left.length)];
      return g.hud.subtitle(`Falta ${NAME[k]}: ${where[k]}.`, 5);
    }
    if (!this.has('temple')) return g.hud.subtitle(`El temple: ${this.steps.temple.hint(this.steps.temple.stage || 1)}`, 5);
  }

  // ---------------- la red ----------------
  fullState() {
    const steps = {};
    for (const [id, s] of Object.entries(this.steps)) steps[id] = s.state();
    return { step: this.step, done: this.done, ptl: this.portals.state(), roles: [...this.roles], d10: this.d10.state(), sl: this.arena.state(), got: { ...this.got_ }, tot: this.totality ? 1 : 0, ceb: this.cebado, cor: this.corte, steps };
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
    if (m.d10) this.d10.applyFull(m.d10);
    if (m.sl) this.arena.applyFull(m.sl);
    if (m.roles) this.setRoles(m.roles);
    if (m.ptl) this.portals.applyFull(m.ptl);
    if (m.got) for (const k of Object.keys(m.got)) this.got_[k] = 1;
    if (m.tot) this.totality = true;
    if (m.ceb) this.cebado = m.ceb;
    if (m.cor) this.corte = m.cor;
    if (m.steps) for (const [id, st] of Object.entries(m.steps)) this.steps[id]?.applyFull(st);
    if (m.step != null) this.step = m.step;
    if (m.done != null) this.done = m.done;
    this.mF.set(this.ready() && !this.cebado);
    this.mC.set(!!this.cebado && !this.corte);
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
  }

  dispose() {
    this.scene?.cine?.dispose?.();
    this.scene = null;
    this.unlisten?.();
    for (const s of Object.values(this.steps)) s.dispose();
    this.d10.dispose();
    this.arena.dispose();
    if (this.g.defense === this.d10) this.g.defense = null;
    this.mF.dispose();
    this.mC.dispose();
    this.portals.dispose();
    setSleeveColor(null);
  }
}
