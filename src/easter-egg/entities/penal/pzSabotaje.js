import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, DOORS } from '../../config/map';
import { PZS } from '../../config/porteno';
import PenalLift from '../PenalLift';
import PzBotes from './pzBotes';
import PzFuego, { FLAMES } from './pzFuego';

// Porteño encubierto: los sabotajes del policía (el usuario, 2026-10-13:
// "Vamos a mejorar al impostor también. Con considerable cooldown va a poder:
// trabar el telesilla [...] Cerrar 3 zonas [...] y provocar un incendio en la isla").
//  · Con la Q el policía vivo abre el mapa del penal con los tres. Cada uno
//    tiene su espera; la espera es de todos los policías juntos y hay uno
//    activo a la vez (como en Among Us). Números en config/porteno.js PZS.
//  · El incendio: suena el aviso del encierro, sale el cartel y una cuenta
//    para todos. Arde el islote cerca del muellecito (entities/penal/pzFuego.js)
//    y llegan dos botes al muelle (pzBotes.js). En el islote hay extintores:
//    F para agarrar uno y clic sostenido para tirarle espuma a las llamas.
//    Apagadas todas, se vuelve en los botes. Si la cuenta llega a cero la
//    isla se quema entera y gana la policía. Mientras arde no anda el botón
//    rojo; un cuerpo reportado sí arma el encierro y el encierro lo apaga.
//  · Cerrar zonas: hasta tres zonas del mapa; en sus puertas bajan rejas que
//    no se abren y a los PZS.doorsT s se levantan solas.
//  · Trabar la telesilla: solo viajando; frena PZS.liftStop s entre chispas y
//    chirridos y sigue. La telesilla (entities/PenalLift.js) en este modo es
//    gratis y anda sin la luz del gaucho life.
// Lo decide el anfitrión y lo manda a todos ('pee' {pzs}); la espera, solo a
// los policías (Porteno.sendPriv). Nadie sabe quién saboteó.

const ISLE = new Set(['L', 'M']);
const SHORT = { A: 'Pabellón', B: 'Comedor', C: 'Cocina', H: 'Patio', I: 'Yerbales', S: 'Secadero', J: 'Muelle', K: 'Calabozos', D: 'Duchas', E: 'Oficina', F: 'Enfermería', G: 'Capilla', T: 'Estación', P: 'Cerro', L: 'Islote', M: 'Ermita' };
const KINDS = ['fire', 'lift', 'doors'];
const NAMES = { fire: 'Incendio en el islote', lift: 'Trabar la telesilla', doors: 'Cerrar zonas' };
const DOOR_H = 2.7;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const mmss = (s) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const HITS = [];
// las chispas que caen de la cabina trabada
const P_SPARK = { color: [1, 0.7, 0.3], size: 0.1, size1: 0.03, life: 1, gravity: 7 };

// Las puertas de una zona que se pueden cerrar (las con llave del cerro, no).
const doorsOf = (k) => DOORS.map((d, i) => [d, i]).filter(([d]) => d.zones.includes(k) && !d.locked);
// Las zonas que se pueden cerrar: las del penal con alguna puerta (no la isla ni el cerro).
const PICKABLE = () => Object.keys(ZONES).filter((k) => !ISLE.has(k) && k !== 'P' && doorsOf(k).length);

export default class PzSabotaje {
  constructor(pz) {
    this.pz = pz;
    const g = (this.g = pz.g);
    // lo del anfitrión (y lo que se manda a todos)
    this.act = null;
    this.cdw = { ...PZS.first };
    this.fire = null;
    this.doorsOn = null;
    this.ext = new Map();
    this.spr = new Set();
    this.sendT = 0;
    this.dirty = false;
    this.wasMeet = false;
    // lo de esta compu: la espera que ve el policía, lo que se eligió en el mapa
    this.myCd = { ...PZS.first };
    this.pick = new Set();
    this.menuOn = false;
    this.seen = { st: null, h: [], doors: '', stall: false };
    this.spraying = false;
    this.foamAcc = new Map();
    this.foamT = 0;
    this.hissT = 0;
    // la telesilla: gratis y con corriente (sin el gaucho life)
    this.lift = new PenalLift(g, { announce() {} });
    this.lift.powered = true;
    // la luz de las chispas de la telesilla trabada (de evento: World.adoptLight)
    this.sparkLight = new THREE.PointLight(0xffa040, 0, 14, 1.6);
    this.sparkLight.userData.noShadow = true;
    g.scene.add(this.sparkLight);
    g.world.adoptLight?.(this.sparkLight, 1.2);
    this.botes = new PzBotes(this);
    this.fuego = new PzFuego(this);
    this.gates = new Map();
    this.buildHud();
  }

  // ---------------- para los demás ----------------
  fireOn() {
    return this.fire?.st === 'on';
  }
  burning() {
    return this.fire?.st === 'burn' || this.fire?.st === 'burnt';
  }
  holding(id = this.pz.myId()) {
    return this.fireOn() && this.ext.has(id);
  }
  inIsle(p) {
    if (!p) return false;
    const z = this.g.world.zoneAt(p.x, p.z, p.y);
    return ISLE.has(z);
  }

  // Lo que el anfitrión le manda a cada policía: la espera de cada sabotaje.
  privCd() {
    return { f: +this.cdw.fire.toFixed(1), l: +this.cdw.lift.toFixed(1), d: +this.cdw.doors.toFixed(1) };
  }
  setCd(c) {
    if (!c) return;
    this.myCd = { fire: c.f, lift: c.l, doors: c.d };
  }

  // ---------------- el anfitrión ----------------
  reset() {
    this.act = null;
    this.cdw = { ...PZS.first };
    this.myCd = { ...PZS.first };
    this.fire = null;
    this.doorsOn = null;
    this.ext.clear();
    this.spr.clear();
    this.pick.clear();
    this.lift.stallT = 0;
    this.botes.reset();
    this.fuego.reset();
    this.seen = { st: null, h: [], doors: '', stall: false };
    this.closeMenu();
    this.dirty = true;
  }

  // (anfitrión) Un policía saboteó.
  hostStart(id, w, zones) {
    const pz = this.pz;
    if (pz.phase !== 'play' || pz.H.roles.get(id) !== 'cop' || !pz.alive(id) || this.act || !KINDS.includes(w) || this.cdw[w] > 0.05) return;
    if (w === 'fire') {
      this.fire = { st: 'on', left: PZS.fireT, t: 0, h: FLAMES.map(() => 0), bt: 0 };
      this.botes.hostIn();
    } else if (w === 'lift') {
      const L = this.lift;
      if (L.st !== 'move' || L.stallT > 0 || L.t > 19) return;
      L.stallT = PZS.liftStop;
      L.sync();
    } else {
      const ok = PICKABLE();
      const z = [...new Set((zones || []).filter((k) => ok.includes(k)))].slice(0, PZS.doorsMax);
      if (!z.length) return;
      this.doorsOn = { z, t: 0 };
    }
    this.act = w;
    this.dirty = true;
    this.cops();
  }

  // (anfitrión) Se terminó el sabotaje `w`: empieza su espera.
  hostEnd(w) {
    if (this.act === w) this.act = null;
    this.cdw[w] = PZS.cd[w];
    this.dirty = true;
    this.cops();
  }

  cops() {
    const pz = this.pz;
    for (const [id, r] of pz.H.roles) if (r === 'cop') pz.sendPriv(id);
  }

  // (anfitrión) Un encierro apaga todo (como un reporte en Among Us).
  hostCancel() {
    if (this.fire && this.fire.st === 'on') {
      this.fire = null;
      this.hostEnd('fire');
    }
    if (this.doorsOn) {
      this.doorsOn = null;
      this.hostEnd('doors');
    }
    if (this.lift.stallT > 0) {
      this.lift.stallT = 0;
      this.lift.sync();
      this.hostEnd('lift');
    }
    this.ext.clear();
    this.spr.clear();
    this.botes.hostClear();
    this.dirty = true;
  }

  hostTick(dt) {
    const pz = this.pz;
    const meet = pz.phase === 'meet';
    if (meet && !this.wasMeet) this.hostCancel();
    // (después de cada encierro, como al arrancar: al menos la primera espera)
    if (!meet && this.wasMeet && pz.phase === 'play') {
      for (const w of KINDS) this.cdw[w] = Math.max(this.cdw[w], PZS.first[w]);
      this.cops();
      this.dirty = true;
    }
    this.wasMeet = meet;
    if (pz.phase !== 'play') {
      // (lo que cambió al empezar el encierro: el fuego apagado, los botes que se van)
      if (this.botes.hostTick(dt, false)) this.dirty = true;
      this.sendT -= dt;
      if ((this.dirty && this.sendT <= 0) || this.sendT < -1.5) this.send();
      return;
    }
    for (const w of KINDS) if (this.act !== w && this.cdw[w] > 0) this.cdw[w] = Math.max(0, this.cdw[w] - dt);
    const F = this.fire;
    if (F?.st === 'on') {
      F.t += dt;
      F.left = Math.max(0, F.left - dt);
      // cada llama se prende a su turno y crece de a poco (también la que se achicó)
      F.h.forEach((h, i) => {
        if (h < 0) return;
        if (h === 0 && F.t >= i * 1.1) F.h[i] = 0.05;
        else if (h > 0) F.h[i] = Math.min(1, h + PZS.grow * dt);
      });
      if (F.h.every((h) => h < 0)) {
        F.st = 'out';
        this.ext.clear();
        this.spr.clear();
        // (los botes del lado del muelle van a buscar a la gente: pzBotes.hostOut)
        this.botes.hostOut();
        this.hostEnd('fire');
      } else if (F.left <= 0) {
        F.st = 'burn';
        F.bt = 0;
        this.ext.clear();
        this.spr.clear();
        this.botes.hostClear();
        this.dirty = true;
      }
    } else if (F?.st === 'burn') {
      F.bt += dt;
      if (F.bt >= PZS.burnT) {
        F.st = 'burnt';
        this.dirty = true;
        this.send(true);
        pz.finish('p', 'isla');
        return;
      }
    }
    if (this.botes.hostTick(dt, this.fireOn())) this.dirty = true;
    if (this.doorsOn) {
      this.doorsOn.t += dt;
      if (this.doorsOn.t >= PZS.doorsT) {
        this.doorsOn = null;
        this.hostEnd('doors');
      }
    }
    if (this.act === 'lift' && !(this.lift.stallT > 0)) this.hostEnd('lift');
    // los que ya no tienen extintor (se fueron o murieron)
    for (const id of [...this.ext.keys()]) {
      if (!pz.alive(id)) {
        this.ext.delete(id);
        this.spr.delete(id);
        this.dirty = true;
      }
    }
    this.sendT -= dt;
    // (con el incendio, seguido: las llamas se achican)
    const every = this.fireOn() ? 0.2 : 1.5;
    if ((this.dirty && this.sendT <= 0.0) || this.sendT < -every) this.send();
  }

  send(now = false) {
    this.sendT = now ? 0.12 : 0.12;
    this.dirty = false;
    this.g.net?.event('pee', { pzs: this.pack() });
  }

  pack() {
    const F = this.fire;
    return {
      a: this.act,
      f: F ? [F.st, +F.left.toFixed(1), +F.t.toFixed(2), F.h.map((v) => +v.toFixed(3)), +F.bt.toFixed(2)] : null,
      d: this.doorsOn ? [this.doorsOn.z, +this.doorsOn.t.toFixed(2)] : null,
      b: this.botes.pack(),
      x: [...this.ext],
      s: [...this.spr],
      l: this.lift.netState(),
    };
  }

  // Lo que un jugador le pide al anfitrión. Devuelve true si era de acá.
  onGuest(m, from) {
    const pz = this.pz;
    const a = m.a;
    // (con la isla quemándose no se arma nada más)
    if (this.burning() && (a === 'rep' || a === 'btn' || a === 'kill')) return true;
    if (a === 'sab') this.hostStart(from, m.w, m.z);
    else if (a === 'sbd') {
      if (this.botes.hostBoard(from, m.b | 0, this.fireOn())) this.dirty = true;
    } else if (a === 'sub') {
      if (this.botes.hostUnboard(from)) this.dirty = true;
    } else if (a === 'sgx') this.hostGrab(from);
    else if (a === 'ssp') {
      if (m.on && this.holding(from)) this.spr.add(from);
      else this.spr.delete(from);
      this.dirty = true;
    } else if (a === 'sfo') this.hostFoam(from, m.h);
    else if (a === 'slv' || a === 'slp') {
      const L = this.lift;
      if (pz.phase === 'play' && pz.alive(from) && L.ready() && (a === 'slv' || L.at !== m.k)) L.go();
    } else return false;
    return true;
  }

  hostGrab(id) {
    const pz = this.pz;
    const p = pz.posOf(id);
    if (!this.fireOn() || !pz.alive(id) || this.ext.has(id) || !p) return;
    const R = this.fuego.nearRack(tmpV.copy(p));
    if (!R) return;
    const used = new Set(this.ext.values());
    const base = R === this.fuego.slots[0].rack ? 0 : 5;
    let slot = -1;
    for (let i = 0; i < 5; i++) if (!used.has(base + i)) slot = base + i;
    if (slot < 0) for (let i = 0; i < 10; i++) if (!used.has(i)) slot = i;
    if (slot < 0) return;
    this.ext.set(id, slot);
    this.dirty = true;
  }

  // (anfitrión) La espuma que tiró `id` (llama, segundos).
  hostFoam(id, list) {
    const F = this.fire;
    if (!this.holding(id) || !Array.isArray(list)) return;
    for (const [i, s] of list) {
      if (!(F.h[i] > 0)) continue;
      F.h[i] -= PZS.foam * Math.min(0.5, Math.max(0, +s || 0));
      if (F.h[i] <= 0.02) F.h[i] = -1;
      this.dirty = true;
    }
  }

  // ---------------- todos ----------------
  applyRemote(m) {
    if (m.lift) this.lift.applyState(m.lift);
    if (m.lz) this.lift.applyRiders(m.lz);
    if (m.pzs) this.apply(m.pzs);
  }

  apply(s) {
    if (this.pz.isHost() || !s) return;
    this.act = s.a;
    if (s.f) {
      const [st, left, t, h, bt] = s.f;
      const F = (this.fire ||= { st, left, t, h, bt });
      F.left = Math.abs(left - F.left) > 1 || F.st !== st ? left : F.left + (left - F.left) * 0.3;
      F.bt = Math.abs(bt - F.bt) > 0.5 || F.st !== st ? bt : F.bt;
      F.st = st;
      F.t = t;
      F.h = h;
    } else this.fire = null;
    if (s.d) {
      const [z, t] = s.d;
      if (!this.doorsOn || this.doorsOn.z.join() !== z.join()) this.doorsOn = { z, t };
      else this.doorsOn.t = Math.abs(t - this.doorsOn.t) > 0.5 ? t : this.doorsOn.t;
    } else this.doorsOn = null;
    this.botes.apply(s.b);
    this.ext = new Map(s.x || []);
    this.spr = new Set(s.s || []);
    // (la telesilla, para el que entra tarde: lo demás llega con sus avisos)
    if (s.l && !this.liftSeen) {
      this.liftSeen = true;
      this.lift.applyState(s.l);
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt, wdt, input) {
    const g = this.g;
    const pz = this.pz;
    const host = pz.isHost();
    const playing = g.state === 'playing';
    // (en un encierro o al aparecer: fuera de la cabina de la telesilla)
    if ((pz.frozen || pz.scene) && this.lift.me) {
      this.lift.me = null;
      if (g.player.ride === this.lift.rideFn) g.player.ride = null;
      pz.hookRide();
    }
    this.lift.update(dt);
    // la telesilla del muelle es otra vez la del modo (Porteno.ride)
    if (!this.lift.me && g.player.ride !== pz.rideFn && pz.rideFn) pz.hookRide();
    if (host && playing && pz.phase !== 'wait' && pz.phase !== 'end') this.hostTick(wdt);
    else if (!host) {
      if (this.fire?.st === 'on') this.fire.left = Math.max(0, this.fire.left - wdt);
      if (this.fire?.st === 'burn') this.fire.bt += wdt;
      if (this.doorsOn) this.doorsOn.t += wdt;
    }
    this.botes.update(dt, host);
    this.fuego.update(dt, this.fire);
    this.fuego.rackTick(dt, new Set(this.ext.values()));
    this.gateTick(dt);
    this.stallFx(dt);
    this.view();
    this.sprayTick(dt, input);
    this.burnScene();
    this.hudTick();
    this.tickCd(wdt);
    // el menú del policía (Q): con el menú abierto el juego no le pasa las
    // teclas (g.menuOpen), así que acá se miran directo
    const can = this.canSab();
    if (this.menuOn && (!can || (this.wasLocked && !g.input.locked))) {
      // (Esc suelta el mouse: el invitado no tiene pausa con el menú abierto, que vuelva con un clic)
      const lost = this.wasLocked && !g.input.locked;
      this.closeMenu();
      if (lost && g.state === 'playing') g.menus.showClick?.(true);
    }
    else if (this.menuOn) {
      if (g.input.hit('KeyQ')) this.closeMenu();
      else this.menuInput(g.input);
    } else if (can && input && input.hit('KeyQ')) this.openMenu();
  }

  canSab() {
    const pz = this.pz;
    const g = this.g;
    return pz.role === 'cop' && !pz.deadMe && pz.phase === 'play' && !pz.scene && g.state === 'playing' && !this.botes.seatOf(pz.myId());
  }

  // Lo que cambió desde el cuadro anterior: los avisos (en todas las compus).
  view() {
    const pz = this.pz;
    const g = this.g;
    const F = this.fire;
    const st = F?.st || null;
    const S = this.seen;
    if (st !== S.st) {
      if (st === 'on' && !S.st) {
        // el aviso: el sonido del encierro (Porteno.applyFx 'meet') y el cartel
        g.audio?.sting?.();
        g.fx.addShake?.(0.2);
        pz.bigLine('¡Incendio en el islote!', 'is-cop');
      } else if (st === 'out' && S.st === 'on') {
        pz.bigLine('Fuego apagado');
        g.audio?.powerupGrab?.();
      } else if (st === 'burn') this.burnStart();
      S.st = st;
    }
    // las llamas que se apagaron
    if (F?.h) {
      F.h.forEach((h, i) => {
        if (S.h[i] > 0 && h < 0) this.fuego.out(i);
        S.h[i] = h;
      });
    } else S.h.length = 0;
    // la telesilla trabada
    const stall = this.lift.stallT > 0;
    if (stall && !S.stall) this.screech(true);
    if (!stall && S.stall) this.screech(false);
    S.stall = stall;
  }

  // ---------------- la telesilla ----------------
  // Trabada: chispas en el carro, la cabina que tiembla y el chirrido.
  stallFx(dt) {
    const L = this.lift;
    const g = this.g;
    // (la cabina se hamaca del golpe y se va calmando; también un rato después de soltarse)
    this.swing = Math.max(0, (this.swing || 0) - dt * 0.02);
    const sw = this.swing;
    if (sw > 0.001 && L.st === 'move') {
      const t = g.time;
      L.cabin.rotation.z += Math.sin(t * 2.6) * sw;
      L.cabin.rotation.x += Math.cos(t * 2.1) * sw * 0.6;
      L.cabin.mcDirty = true;
    }
    const on = L.stallT > 0 && L.st === 'move';
    this.sparkLight.intensity = on ? 5 + Math.random() * 7 : 0;
    if (!on) return;
    const top = tmpV.set(L.pos.x, L.pos.y + 3.6, L.pos.z);
    this.sparkLight.position.set(L.pos.x, L.pos.y + 3.2, L.pos.z);
    // chispas del carro y las que caen por los costados de la cabina (se ven desde adentro)
    if (Math.random() < dt * 26) g.fx.sparks(top, 1, tmpW.set((Math.random() - 0.5) * 0.6, -0.3, (Math.random() - 0.5) * 0.6));
    const n = Math.floor(dt * 40 + Math.random());
    for (let i = 0; i < n; i++) {
      const sx = Math.random() < 0.5 ? -1 : 1;
      const side = Math.random() < 0.5;
      const x = L.pos.x + (side ? sx * 1.62 : (Math.random() - 0.5) * 3);
      const z = L.pos.z + (side ? (Math.random() - 0.5) * 3 : sx * 1.62);
      g.fx.add.spawn(x, L.pos.y + 2.75, z, (side ? sx : 0) * 0.6 + (Math.random() - 0.5) * 0.5, -0.5 - Math.random(), (side ? 0 : sx) * 0.6 + (Math.random() - 0.5) * 0.5, P_SPARK);
    }
    const t = g.time;
    L.cabin.rotation.z += Math.sin(t * 31) * 0.008;
    L.cabin.rotation.x += Math.sin(t * 23) * 0.006;
    L.cabin.mcDirty = true;
    this.grindT = (this.grindT || 0) - dt;
    if (this.grindT <= 0) {
      this.grindT = 0.45 + Math.random() * 0.4;
      const a = g.audio;
      if (a?.ctx) {
        const o = a.out({ pos: top, gain: 0.7, reverb: 0.3, ref: 6 });
        a.noise(o, { dur: 0.4, type: 'bandpass', freq: 2600 + Math.random() * 900, freqEnd: 1800, q: 8, gain: 0.3 });
      }
      g.fx.flash?.(tmpW.set(L.pos.x, L.pos.y + 2.6, L.pos.z), 0xffa040, 18, 0.14, 8);
    }
    if (L.me) g.fx.addShake?.(dt * 0.8);
  }

  screech(on) {
    const g = this.g;
    const a = g.audio;
    const L = this.lift;
    const top = tmpV.set(L.pos.x, L.pos.y + 3.6, L.pos.z);
    if (on) {
      // el golpe: se hamaca, chispazo y fogonazo en el carro
      this.swing = 0.06;
      g.fx.sparks(top, 4, tmpW.set(0, -0.2, 0));
      g.fx.flash?.(top, 0xffa040, 14, 0.3, 12);
      if (L.me) g.fx.addShake?.(0.5);
    }
    if (!a?.ctx) return;
    const o = a.out({ pos: top, gain: 1, reverb: 0.4, ref: 7 });
    if (on) {
      a.noise(o, { dur: 1.3, type: 'bandpass', freq: 3600, freqEnd: 1400, q: 10, gain: 0.55 });
      a.tone(o, { dur: 1.2, type: 'sawtooth', freq: 820, freqEnd: 380, gain: 0.07 });
      a.noise(o, { dur: 0.35, freq: 420, freqEnd: 120, gain: 0.8, brown: true });
    } else {
      a.noise(o, { dur: 0.5, freq: 380, freqEnd: 160, gain: 0.5 });
      a.tone(o, { dur: 0.4, type: 'square', freq: 110, freqEnd: 160, gain: 0.06 });
    }
  }

  // ---------------- las rejas de las zonas cerradas ----------------
  gateTick(dt) {
    const want = new Set();
    const D = this.doorsOn;
    if (D && D.t < PZS.doorsT) for (const k of D.z) for (const [, i] of doorsOf(k)) want.add(i);
    for (const i of want) if (!this.gates.has(i)) this.gates.set(i, this.makeGate(i));
    for (const [i, G] of this.gates) {
      const on = want.has(i);
      G.k += on ? dt / 0.7 : -dt / 0.9;
      G.k = clamp01(G.k);
      const k = on ? G.k * G.k : smooth(G.k);
      G.bars.scale.y = Math.max(0.001, k);
      G.root.visible = G.k > 0.001;
      G.box.active = on && G.k > 0.55;
      if (on && G.k >= 1 && !G.shut) {
        G.shut = true;
        this.pz.enc?.doors?.sfx?.('shut', G.mid);
        this.g.fx.dust?.(tmpV.set(G.mid.x, G.mid.y - 1.2, G.mid.z), tmpW.set(0, 1, 0), [0.5, 0.45, 0.4], 6);
      }
      if (!on && G.shut) {
        G.shut = false;
        this.liftSnd(G.mid);
      }
    }
  }

  liftSnd(p) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: p, gain: 0.8, reverb: 0.4, ref: 5 });
    a.noise(o, { dur: 0.8, type: 'bandpass', freq: 500, freqEnd: 900, q: 5, gain: 0.4 });
    a.tone(o, { dur: 0.7, type: 'sawtooth', freq: 70, freqEnd: 120, gain: 0.05 });
  }

  // Una reja para la puerta i: barrotes de hierro que bajan del dintel.
  makeGate(i) {
    const g = this.g;
    const W = g.world;
    const d = DOORS[i];
    const xs = d.cells.map((c) => c[0]);
    const zs = d.cells.map((c) => c[1]);
    const alongX = new Set(zs).size === 1;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + 1;
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs) + 1;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = W.fy?.[W.idx(d.cells[0][0], d.cells[0][1])] ?? W.floorAt(cx, cz);
    const width = alongX ? x1 - x0 : z1 - z0;
    // los barrotes (arriba en 0, para abajo), dos planchuelas y las puntas
    const geos = [];
    const n = Math.max(4, Math.round(width / 0.17));
    for (let k = 0; k <= n; k++) {
      const u = -width / 2 + (k / n) * width;
      const bar = new THREE.CylinderGeometry(0.024, 0.024, DOOR_H, 6).translate(u, -DOOR_H / 2, 0);
      geos.push(bar);
      const tip = new THREE.ConeGeometry(0.04, 0.14, 6).rotateX(Math.PI).translate(u, -DOOR_H - 0.05, 0);
      geos.push(tip);
    }
    for (const h of [0.35, 1.4, 2.45]) geos.push(new THREE.BoxGeometry(width, 0.06, 0.035).translate(0, -h, 0));
    for (const gg of geos) {
      gg.clearGroups?.();
      for (const n2 of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n2)) gg.deleteAttribute(n2);
    }
    const merged = mergeGeometries(geos.map((gg) => (gg.index ? gg.toNonIndexed() : gg)));
    const mat = W.M.iron || new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.7, roughness: 0.5 });
    const bars = new THREE.Mesh(merged, mat);
    bars.castShadow = true;
    const root = new THREE.Group();
    root.position.set(cx, y + DOOR_H, cz);
    if (!alongX) root.rotation.y = Math.PI / 2;
    root.add(bars);
    g.scene.add(root);
    const t = 0.1;
    const box = W.addBox(alongX ? [x0, y, cz - t, x1, y + DOOR_H, cz + t] : [cx - t, y, z0, cx + t, y + DOOR_H, z1], { kind: 'prop' });
    box.active = false;
    return { root, bars, box, k: 0, shut: false, mid: new THREE.Vector3(cx, y + 1.3, cz) };
  }

  // ---------------- el extintor y el chorro ----------------
  sprayTick(dt, input) {
    const g = this.g;
    const pz = this.pz;
    const me = pz.myId();
    const hold = this.holding(me) && !pz.deadMe;
    const can = hold && !!input && !pz.scene && pz.phase === 'play' && !this.menuOn;
    const on = can && !!input.mouse.left;
    this.fuego.vmTick(dt, hold && !pz.scene, on);
    if (on !== this.spraying) {
      this.spraying = on;
      pz.send('ssp', { on: on ? 1 : 0 });
    }
    const F = this.fire;
    if (on && F) {
      const o = this.fuego.nozzleWorld(tmpV);
      g.camera.getWorldDirection(tmpD);
      this.fuego.foam(o, tmpD, dt, true);
      for (const i of this.fuego.hits(o, tmpD, F.h, HITS)) {
        this.foamAcc.set(i, (this.foamAcc.get(i) || 0) + dt);
        this.fuego.steam(i);
      }
      this.hissT -= dt;
      if (this.hissT <= 0) {
        this.hissT = 0.22;
        this.fuego.hiss(o, true);
      }
    }
    this.foamT -= dt;
    if (this.foamT <= 0 && this.foamAcc.size) {
      this.foamT = 0.12;
      pz.send('sfo', { h: [...this.foamAcc].map(([i, s]) => [i, +s.toFixed(3)]) });
      this.foamAcc.clear();
    }
    // el de los demás: la espuma desde su mano, hacia donde mira
    for (const id of this.spr) {
      if (id === me) continue;
      const r = g.net?.remote.get(id);
      if (!r) continue;
      const yaw = r.yaw || 0;
      const pitch = r.pitch || 0;
      tmpD.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      // (desde la boquilla del extintor de su muñeco; si no se ve, más o menos de la mano)
      const a = g.net?.avatars?.list.get(id);
      if (!this.fuego.avatarNozzle(a, tmpW)) tmpW.set(r.pos.x - Math.sin(yaw) * 0.5 + Math.cos(yaw) * 0.22, r.pos.y + 1.0, r.pos.z - Math.cos(yaw) * 0.5 - Math.sin(yaw) * 0.22);
      this.fuego.foam(tmpW, tmpD, dt, false);
      if (F) for (const i of this.fuego.hits(tmpW, tmpD, F.h, HITS)) this.fuego.steam(i);
      if (Math.random() < dt * 4) this.fuego.hiss(tmpW, false);
    }
  }

  // (Porteno.avatarLate) El extintor en la mano del muñeco de otro.
  avatarLate(a, r) {
    const want = this.holding(r.id) ? 1 : 0;
    a.pzExtK = (a.pzExtK || 0) + Math.max(-0.08, Math.min(0.08, want - (a.pzExtK || 0)));
    this.fuego.avatarExt(a, smooth(clamp01(a.pzExtK)));
  }

  // (Porteno.ride) Sentado en un bote.
  ride() {
    return this.botes.ride();
  }

  // ---------------- los avisos de F ----------------
  // (Porteno.prompts) Devuelve { text, act } o null.
  prompt(p) {
    const pz = this.pz;
    const B = this.botes;
    const seat = B.seatOf(pz.myId());
    if (seat) {
      if (seat.b.st !== 'dock') return null;
      const w = B.riderText();
      return { text: w ? `${w} · [F] Bajar` : '[F] Bajar', act: () => pz.send('sub') };
    }
    // (en el tablado del islote los estantes quedan cerca de los botes: con el
    // incendio y sin extintor, primero el extintor)
    const rack = this.fireOn() && !this.ext.has(pz.myId()) && this.fuego.nearRack(p);
    const b = !rack && B.nearBoard(p, this.fireOn());
    if (b) return { text: '[F] Subir al bote', act: () => pz.send('sbd', { b: b.k }) };
    if (rack) {
      return {
        text: '[F] Agarrar extintor',
        act: () => {
          pz.send('sgx');
          this.g.audio?.click?.();
        },
      };
    }
    // la telesilla: la palanca de adentro y los postes de cada punta
    const L = this.lift;
    if (L.st === 'dock' && p.distanceTo(L.leverPos) < 1.7) {
      if (L.cd > 0) return { text: `Telesilla en ${Math.ceil(L.cd)} s`, act: null };
      return { text: `[F] Viajar ${L.at === 'low' ? 'al cerro' : 'al muelle'}`, act: () => pz.send('slv') };
    }
    for (const k of ['low', 'high']) {
      const P = L.postPos?.[k];
      if (!P || p.distanceTo(P) > 1.9) continue;
      if (L.at === k && L.st === 'dock') return null;
      if (L.st !== 'dock') return { text: 'La telesilla está viajando', act: null };
      if (L.cd > 0) return { text: `Telesilla en ${Math.ceil(L.cd)} s`, act: null };
      return { text: '[F] Llamar la telesilla', act: () => pz.send('slp', { k }) };
    }
    return null;
  }

  // ---------------- la isla quemada (todas las compus) ----------------
  burnStart() {
    const g = this.g;
    const a = g.audio;
    // un rugido, el fogonazo y todos mirando el islote
    if (a?.ctx) {
      const o = a.out({ gain: 1, reverb: 0.6 });
      a.noise(o, { dur: 3.2, freq: 900, freqEnd: 120, gain: 0.9, attack: 0.15, brown: true });
      a.tone(o, { dur: 2.6, type: 'sawtooth', freq: 55, freqEnd: 30, gain: 0.18, attack: 0.1 });
    }
    g.audio?.sting?.();
    g.fx.flash?.(tmpV.set(12, 3, 123), 0xff6a20, 40, 1.2, 40);
    g.fx.addShake?.(0.35);
    this.closeMenu();
  }

  // La toma de la isla que arde: desde el río, de lejos y después de cerca.
  burnScene() {
    const pz = this.pz;
    const F = this.fire;
    const on = (F?.st === 'burn' || F?.st === 'burnt') && pz.phase === 'play';
    if (on && !pz.scene?.sab) {
      pz.scene = { pz: true, sab: 'burn', cine: { wantFov: 56, skip: () => {} } };
      this.g.hud.setHint(null);
      this.g.hud.setHold?.(null);
    } else if (!on && pz.scene?.sab === 'burn' && pz.phase !== 'end') pz.scene = null;
  }

  cam() {
    const pz = this.pz;
    if (!pz.scene?.sab) return false;
    const cam = this.g.camera;
    const bt = this.fire?.bt || 0;
    let from;
    let to;
    if (bt < 3.6) {
      const k = smooth(clamp01(bt / 3.6));
      from = tmpV.set(33 - k * 4, 8.5 - k * 1.5, 100 + k * 3);
      to = tmpW.set(12, 1.8, 123);
    } else {
      const k = smooth(clamp01((bt - 3.6) / 3.4));
      from = tmpV.set(22 - k * 3, 4.2 - k * 0.6, 110.5 + k * 1.5);
      to = tmpW.set(12, 0.6, 124.5);
    }
    cam.position.copy(from);
    cam.lookAt(to);
    return true;
  }

  // ---------------- el panel ----------------
  buildHud() {
    const g = this.g;
    const el = document.createElement('div');
    el.className = 'mdu-pzsab-hud';
    el.innerHTML = `<div class="mdu-pzfire" hidden><b>Incendio en el islote</b><span class="mdu-pzfire__t"></span><i class="mdu-pzfire__k"><u></u></i><p class="mdu-pzfire__f"></p></div>
      <div class="mdu-pzsabchip" hidden><kbd>Q</kbd><span>Sabotaje</span><b></b></div>`;
    g.hud.root.appendChild(el);
    this.hudEl = el;
    this.fireEl = el.querySelector('.mdu-pzfire');
    this.chipEl = el.querySelector('.mdu-pzsabchip');
    this.hudKey = '';
  }

  hudTick() {
    const pz = this.pz;
    const F = this.fire;
    // el cartel del incendio: para todos, con la cuenta y las llamas que quedan
    // (después del cartel grande del aviso, que va en el mismo lugar)
    const showF = F?.st === 'on' && F.t > 2.6 && pz.phase === 'play' && !pz.scene;
    const left = F ? Math.ceil(F.left) : 0;
    const flames = F?.h ? F.h.map((h) => (h < 0 ? 0 : 1)).join('') : '';
    const cop = this.canSab();
    const cds = KINDS.map((w) => Math.ceil(this.myCd[w] || 0));
    const ready = cop && !this.act && KINDS.some((w, i) => cds[i] <= 0 && (w !== 'lift' || this.liftMoving()));
    const minCd = Math.min(...cds);
    const key = `${showF}|${left}|${flames}|${cop}|${ready}|${minCd}|${this.act}|${pz.scene ? 1 : 0}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    if (showF) {
      this.fireEl.hidden = false;
      this.fireEl.querySelector('.mdu-pzfire__t').textContent = mmss(left);
      this.fireEl.querySelector('.mdu-pzfire__k u').style.width = `${((F.left / PZS.fireT) * 100).toFixed(1)}%`;
      this.fireEl.querySelector('.mdu-pzfire__f').innerHTML = F.h.map((h) => `<s class="${h < 0 ? 'is-out' : ''}"></s>`).join('');
      this.fireEl.classList.toggle('is-low', left <= 20);
    } else this.fireEl.hidden = true;
    this.chipEl.hidden = !cop;
    if (cop) {
      this.chipEl.classList.toggle('is-ready', ready);
      this.chipEl.querySelector('b').textContent = this.act ? 'En curso' : ready ? 'Listo' : mmss(minCd);
    }
  }

  liftMoving() {
    const L = this.lift;
    return L.st === 'move' && !(L.stallT > 0) && L.t < 19;
  }

  // El mapa del policía: las zonas (clic para elegir las que se cierran) y los tres sabotajes.
  buildMenu() {
    const g = this.g;
    const el = document.createElement('div');
    el.className = 'mdu-pzsab';
    el.hidden = true;
    const pickable = PICKABLE();
    let svg = '<rect class="mdu-pzsab__rio" x="0" y="83" width="98" height="56" rx="2"/>';
    for (const [k, Z] of Object.entries(ZONES)) {
      const cls = pickable.includes(k) ? 'is-pick' : ISLE.has(k) ? 'is-isle' : 'is-off';
      let big = null;
      let shapes = '';
      for (const r of Z.rects || []) {
        const [x0, z0, x1, z1] = r;
        const w = x1 - x0 + 1;
        const h = z1 - z0 + 1;
        shapes += `<rect x="${x0}" y="${z0}" width="${w}" height="${h}"/>`;
        if (!big || w * h > big[2] * big[3]) big = [x0, z0, w, h];
      }
      if (Z.circle) {
        shapes += `<circle cx="${Z.circle.x}" cy="${Z.circle.z}" r="${Z.circle.r}"/>`;
        big = [Z.circle.x - 3, Z.circle.z - 3, 6, 6];
      }
      const lab = big ? `<text x="${big[0] + big[2] / 2}" y="${big[1] + big[3] / 2 + 1}">${SHORT[k] || k}</text>` : '';
      svg += `<g class="mdu-pzsab__z ${cls}" data-z="${k}">${shapes}${lab}</g>`;
    }
    svg += '<g class="mdu-pzsab__fire"><circle cx="12" cy="123" r="5.5"/></g>';
    el.innerHTML = `<div class="mdu-pzsab__card">
      <header><b>Sabotaje</b><span><kbd>Q</kbd> Cerrar</span></header>
      <svg viewBox="0 8 98 130" class="mdu-pzsab__map">${svg}</svg>
      <div class="mdu-pzsab__btns">${KINDS.map((w) => `<button type="button" data-w="${w}"><b>${NAMES[w]}</b><span></span></button>`).join('')}</div>
    </div><i class="mdu-pzsab__cur"></i>`;
    g.hud.root.appendChild(el);
    this.menuEl = el;
    this.curEl = el.querySelector('.mdu-pzsab__cur');
  }

  // Un clic (del cursor del mapa o de una prueba) sobre una zona o un botón.
  clickAt(node) {
    const z = node?.closest?.('.mdu-pzsab__z.is-pick');
    if (z) {
      const k = z.dataset.z;
      if (this.pick.has(k)) this.pick.delete(k);
      else if (this.pick.size < PZS.doorsMax) this.pick.add(k);
      this.g.audio?.click?.();
      this.menuKey = '';
      this.menuTick();
      return;
    }
    const b = node?.closest?.('button[data-w]');
    if (b) this.use(b.dataset.w);
  }

  // El cursor del mapa: el mouse sigue tomado por el juego (si se suelta, el
  // juego se pausa), así que el cursor es nuestro y se mueve con lo que se movió.
  menuInput(input) {
    const card = this.menuEl.querySelector('.mdu-pzsab__card').getBoundingClientRect();
    const c = this.cur;
    c.x = Math.max(card.left + 4, Math.min(card.right - 4, c.x + (input.mouse.dx || 0)));
    c.y = Math.max(card.top + 4, Math.min(card.bottom - 4, c.y + (input.mouse.dy || 0)));
    this.curEl.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
    const node = document.elementFromPoint(c.x, c.y);
    const hov = node?.closest?.('.mdu-pzsab__z.is-pick, button[data-w]') || null;
    if (hov !== this.hov) {
      this.hov?.classList.remove('is-hov');
      hov?.classList.add('is-hov');
      this.hov = hov;
    }
    if (input.mouse.leftPressed) this.clickAt(node);
    this.menuTick();
  }

  openMenu() {
    if (this.menuOn) return;
    if (!this.menuEl) this.buildMenu();
    const g = this.g;
    this.menuOn = true;
    this.menuEl.hidden = false;
    this.menuEl.classList.remove('is-out');
    // (quieto mientras elige: Game no lo mueve con el menú abierto)
    g.menuOpen = true;
    this.wasLocked = !!g.input.locked;
    const card = this.menuEl.querySelector('.mdu-pzsab__card').getBoundingClientRect();
    this.cur = { x: card.left + card.width / 2, y: card.top + card.height * 0.42 };
    this.menuKey = '';
    this.menuTick();
    g.audio?.click?.();
  }

  closeMenu() {
    if (!this.menuOn) return;
    const g = this.g;
    this.menuOn = false;
    this.menuEl.classList.add('is-out');
    setTimeout(() => {
      if (!this.menuOn && this.menuEl) this.menuEl.hidden = true;
    }, 220);
    if (g.menuOpen) g.menuOpen = false;
    this.hov?.classList.remove('is-hov');
    this.hov = null;
  }

  // Lo que dice cada botón y qué zonas están elegidas.
  menuTick() {
    const el = this.menuEl;
    if (!el) return;
    const st = KINDS.map((w) => this.state(w));
    const key = `${st.map((s) => s.text + s.ok).join('|')}|${[...this.pick].join('')}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    KINDS.forEach((w, i) => {
      const b = el.querySelector(`button[data-w="${w}"]`);
      b.querySelector('span').textContent = st[i].text;
      b.disabled = !st[i].ok;
      b.classList.toggle('is-on', this.act === w);
    });
    el.querySelectorAll('.mdu-pzsab__z').forEach((n) => n.classList.toggle('is-sel', this.pick.has(n.dataset.z)));
    el.classList.toggle('is-fire', this.act === 'fire');
  }

  // Cómo está un sabotaje para el policía: { text, ok }.
  state(w) {
    if (this.act === w) return { text: 'En curso', ok: false };
    if (this.act) return { text: 'Hay otro en curso', ok: false };
    const cd = this.myCd[w] || 0;
    if (cd > 0) return { text: mmss(cd), ok: false };
    if (w === 'lift' && !this.liftMoving()) return { text: 'Está parada', ok: false };
    if (w === 'doors') return this.pick.size ? { text: `Cerrar ${this.pick.size}`, ok: true } : { text: 'Elegí en el mapa', ok: false };
    return { text: 'Listo', ok: true };
  }

  use(w) {
    if (!this.state(w).ok) return;
    this.pz.send('sab', { w, z: w === 'doors' ? [...this.pick] : undefined });
    if (w === 'doors') this.pick.clear();
    this.g.audio?.click?.();
    this.closeMenu();
  }

  // (cada compu) La espera del policía corre sola entre lo que manda el anfitrión.
  tickCd(dt) {
    for (const w of KINDS) if (this.act !== w && this.myCd[w] > 0) this.myCd[w] = Math.max(0, this.myCd[w] - dt);
  }

  dispose() {
    this.closeMenu();
    this.menuEl?.remove();
    this.hudEl?.remove();
    for (const G of this.gates.values()) {
      G.root.removeFromParent();
      G.box.active = false;
    }
    this.botes.dispose();
    this.fuego.dispose();
    this.lift.dispose();
    this.sparkLight.removeFromParent();
    const v = this.g.world.virt;
    const i = v ? v.indexOf(this.sparkLight) : -1;
    if (i >= 0) v.splice(i, 1);
  }
}
