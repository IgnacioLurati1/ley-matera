import * as THREE from 'three';
import { EE, ZONES } from '../../config/map';
import { WEAPONS, weaponStats } from '../../config/weapons';
import { buildMate } from '../../weapons/viewmodels';
import '../../weapons/elementalModels';
import { altarGlyph } from '../../world/castleDecor';
import { flameMaterial } from '../../world/castleFire';
import { sleepHidden } from '../../world/castleLean';
import Encierro from '../Encierro';
import { ELEMENTS, MATE_OF, ELEM_NAME, ELEM_COLOR, ELEM_RGB, glow, ring, myId, isHost, announce, toastAll, players } from './common';

// Los cuatro altares de los mates de la luz (uno por elemento: la herrería,
// el mirador del viento, el campanario y la gruta del glaciar). La piedra, el
// erke y lo de las esquinas son utilería del mapa (world/castleDecor.js);
// acá va lo que se mueve: el mate que flota, las llamas, las cintas, los
// rayitos, el brillo y la columna de luz del temple.
//  · Cerrado mientras no se gana el mate; después el mate flota arriba.
//  · Cualquiera lo agarra, pero uno solo por vez: el que ya tiene otro mate
//    de la luz tiene que dejarlo antes en su altar. La munición queda anotada.
//  · Si el que lo tiene se muere, se va o lo cambia en la caja, vuelve solo.
//  · El temple: con el mate en su altar, soplando el erke (mantener F) arranca
//    un encierro en ese lugar donde solo el que sopló no puede salir (los
//    demás entran y salen). Si aguanta, el mate sale templado y a su mano.
// Lo decide el anfitrión: los invitados avisan con 'pee' y reciben el estado
// con el del easter egg (CastleEgg.netSync).

const TEMPER_SECS = 75;
const MATE_Y = 2.3;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

// El encierro del temple: encierra solo al que sopló el erke.
class Temple extends Encierro {
  lock(dt) {
    if (this.owner === myId(this.g)) super.lock(dt);
  }
}

export default class Altares {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.list = ELEMENTS.map((el) => this.build(el));
    this.temper = null;
    // los mates que esta compu se dio (para darse cuenta si se pierden)
    this.given = new Set();
    this.register();
  }

  // ---------------- lo que se ve ----------------
  build(el) {
    const g = this.g;
    const T = g.textures;
    const [x, z] = EE.altars[el];
    const y = g.world.floorAt(x, z);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    const col = ELEM_COLOR[el];
    // el mate que flota (las dos versiones, armadas desde ya y escondidas)
    const models = [0, 1].map((up) => {
      const m = buildMate(MATE_OF[el], up, T);
      if (m.elem?.hand) m.elem.hand.visible = false;
      m.mate.rotation.set(0, 0, 0);
      m.root.rotation.set(0, 0, 0);
      m.root.scale.setScalar(4.4);
      m.root.position.set(0, MATE_Y, 0);
      m.root.visible = false;
      m.root.traverse((o) => {
        o.castShadow = false;
        o.frustumCulled = false;
      });
      grp.add(m.root);
      // (escondido hasta que se gana: no se recorre)
      sleepHidden(m.root);
      return m;
    });
    const halo = glow(T, col, 2.4, 0);
    halo.position.set(0, MATE_Y + 0.15, 0);
    grp.add(halo);
    const floor = ring(1.75, col, 0.12);
    floor.position.y = 0.3;
    floor.material.opacity = 0;
    grp.add(floor);
    // la columna de luz del temple (solo mientras dura)
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 3.2, 8, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: col, map: streakTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    pillar.position.y = 4;
    pillar.visible = false;
    grp.add(pillar);
    sleepHidden(pillar);
    // lo de las esquinas (mismas posiciones que la utilería del altar)
    const corners = [0, 1, 2, 3].map((k) => {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      return new THREE.Vector3(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3);
    });
    const deco = [];
    if (el === 'fuego') {
      for (const c of corners) {
        const f = new THREE.Group();
        for (const ry of [0, Math.PI / 2]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.62).translate(0, 0.3, 0), flameMaterial());
          p.rotation.y = ry;
          f.add(p);
        }
        f.position.set(c.x, 1.2, c.z);
        grp.add(f);
        sleepHidden(f);
        deco.push(f);
      }
    } else if (el === 'viento') {
      // dos cintas por vara, de los colores del caballero
      for (const c of corners) {
        for (const [dy, cc] of [[1.62, 0x8affb8], [1.5, 0x1d5a34]]) {
          const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.07, 8, 1).translate(0.35, 0, 0), new THREE.MeshStandardMaterial({ color: cc, roughness: 0.8, side: THREE.DoubleSide }));
          rib.position.set(c.x, dy, c.z);
          rib.userData.base = rib.geometry.attributes.position.array.slice();
          rib.userData.ph = Math.random() * 6;
          grp.add(rib);
          deco.push(rib);
        }
      }
    } else if (el === 'rayo') {
      for (const c of corners) deco.push(new THREE.Vector3(x + c.x, y + 2.24, z + c.z));
    }
    deco.corners = corners;
    this.root.add(grp);
    // el erke del temple: la boquilla (ahí se para el que sopla) y el pabellón
    const [ex, ez] = EE.erkes[el];
    const rot = Math.atan2(ex - x, ez - z);
    const ey = g.world.floorAt(ex, ez);
    const mouth = new THREE.Vector3(ex + Math.sin(rot) * 0.34, ey + 1.2, ez + Math.cos(rot) * 0.34);
    const bell = new THREE.Vector3(ex - Math.sin(rot) * 0.95, ey + 3.1, ez - Math.cos(rot) * 0.95);
    const zone = g.world.zoneAt(x, z, y + 0.5);
    return { el, grp, pos: new THREE.Vector3(x, y, z), zone, models, halo, floor, pillar, deco, mouth, bell, glyph: altarGlyph(el), state: 'locked', holder: -1, up: 0, ammo: null, lit: 0 };
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    for (const A of this.list) {
      const name = ELEM_NAME[A.el];
      // agarrar o dejar el mate
      A.it = g.interact.add({
        kind: 'ee',
        local: true,
        pos: A.pos.clone().setY(A.pos.y + 1.3),
        radius: 2.3,
        prompt: () => {
          const me = myId(g);
          if (this.temper?.el === A.el) return { text: `Templando el ${name}: faltan ${Math.max(0, Math.ceil(TEMPER_SECS - this.temper.t))} s`, noCost: true, info: true };
          // (mientras no hay mate, el altar es parte de la vuelta de su elemento)
          if (A.state === 'locked') return this.egg.quests?.[A.el]?.altarPrompt?.() || { text: `El altar del ${name}: su mate todavía no apareció`, noCost: true, info: true };
          if (A.state === 'taken') {
            if (A.holder === me) return { text: `dejar el ${name} en su altar`, noCost: true };
            return { text: `El ${name} lo tiene ${this.nameOf(A.holder)}`, noCost: true, info: true };
          }
          const mine = this.heldBy(me);
          if (mine) return { text: `Uno solo a la vez: primero dejá el ${ELEM_NAME[mine.el]} en su altar`, noCost: true, info: true };
          const what = `el ${this.mateName(A)}`;
          if (g.weapons.full) return { text: `cambiar tu ${g.weapons.currentName} por ${what}`, noCost: true };
          return { text: `agarrar ${what}`, noCost: true };
        },
        cost: () => 0,
        use: () => (A.state === 'locked' ? !!this.egg.quests?.[A.el]?.altarUse?.() : this.useAltar(A)),
      });
      // el erke del temple (mantener F)
      g.interact.add({
        kind: 'ee',
        local: true,
        holdTime: 1.6,
        pos: A.mouth.clone(),
        radius: 1.7,
        prompt: () => {
          if (A.state === 'locked' || A.erkeOff) return null;
          // (el asedio que viene o está en marcha: el temple espera)
          if (!A.up && !this.temper && this.egg.asedio?.templeLock?.()) return { text: 'Primero, el asedio', noCost: true, info: true };
          if (this.temper) {
            if (this.temper.el === A.el) return { text: `Templando el ${name}: faltan ${Math.max(0, Math.ceil(TEMPER_SECS - this.temper.t))} s`, noCost: true, info: true };
            return { text: 'El erke calla: hay otro temple en marcha', noCost: true, info: true };
          }
          if (A.up) return { text: `El ${name} ya está templado`, noCost: true, info: true };
          if (A.state === 'taken') return { text: `Para templar el ${name}, dejalo primero en su altar`, noCost: true, info: true };
          return { text: `soplar el erke y templar el ${name} (encierro: el que sopla no puede salir)`, noCost: true, hold: true };
        },
        cost: () => 0,
        use: () => {
          if (!isHost(g)) return false;
          return this.startTemper(A, g.net?.useFrom ?? myId(g));
        },
      });
    }
  }

  nameOf(id) {
    if (id === myId(this.g)) return 'vos';
    return this.g.net?.nameOf(id) || 'otro';
  }

  mateName(A) {
    const id = MATE_OF[A.el];
    return A.up ? weaponStats(id, 1).name : WEAPONS[id].name;
  }

  heldBy(id) {
    return this.list.find((A) => A.state === 'taken' && A.holder === id) || null;
  }

  // Cuántos altares ya tienen su mate (o cuántos están templados).
  count(up = false) {
    return this.list.filter((A) => A.state !== 'locked' && (!up || A.up)).length;
  }

  // F en el altar: agarrar o dejar. El invitado le avisa al anfitrión.
  useAltar(A) {
    const g = this.g;
    const me = myId(g);
    if (this.temper?.el === A.el) return false;
    if (A.state === 'taken' && A.holder === me) {
      const id = MATE_OF[A.el];
      const s = g.weapons.slots.find((x) => x.id === id);
      const ammo = s ? [s.mag, s.reserve] : null;
      this.given.delete(A.el);
      g.weapons.drop(id);
      if (isHost(g)) this.leave(A, me, ammo);
      else g.net.net.send({ t: 'pee', a: 'alt', op: 'leave', el: A.el, ammo });
      this.shine(A);
      return true;
    }
    if (A.state !== 'ready' || this.heldBy(me)) return false;
    if (isHost(g)) return this.take(A, me);
    g.net.net.send({ t: 'pee', a: 'alt', op: 'take', el: A.el });
    return true;
  }

  // (anfitrión) alguien agarra el mate
  take(A, id) {
    if (A.state !== 'ready' || this.heldBy(id) || this.temper?.el === A.el) return false;
    A.state = 'taken';
    A.holder = id;
    this.egg.netSync();
    this.reconcile();
    return true;
  }

  // (anfitrión) alguien lo deja en su altar
  leave(A, id, ammo) {
    if (A.state !== 'taken' || A.holder !== id) return false;
    A.state = 'ready';
    A.holder = -1;
    A.ammo = Array.isArray(ammo) ? [ammo[0] | 0, ammo[1] | 0] : null;
    this.egg.netSync();
    return true;
  }

  // (anfitrión) terminó la vuelta de un mate: aparece en su altar
  unlock(el) {
    const A = this.list.find((x) => x.el === el);
    if (!A || A.state !== 'locked') return;
    A.state = 'ready';
    A.holder = -1;
    this.egg.netSync();
    this.appear(A);
  }

  // El mate llega a su altar (en todas las compus).
  appear(A) {
    const g = this.g;
    const p = tmpV.copy(A.pos).setY(A.pos.y + MATE_Y);
    g.fx.explosion(p.clone(), 2.6, ELEM_RGB[A.el]);
    g.fx.sparkle(p.clone(), ELEM_RGB[A.el], 50, 1.4);
    g.fx.flash(p.clone(), ELEM_COLOR[A.el], 6, 0.8, 16);
    g.audio.sting();
    A.lit = 1;
  }

  shine(A) {
    this.g.fx.sparkle(tmpV.copy(A.pos).setY(A.pos.y + MATE_Y), ELEM_RGB[A.el], 18, 0.8);
  }

  // Cada compu se da (o se saca) los mates según quién los tiene.
  reconcile() {
    const g = this.g;
    const me = myId(g);
    const w = g.weapons;
    for (const A of this.list) {
      const id = MATE_OF[A.el];
      const has = w.slots.find((s) => s.id === id);
      if (A.state === 'taken' && A.holder === me) {
        if (!has) {
          if (!g.player.alive) continue;
          w.give(id, A.up);
          const s = w.slots.find((x) => x.id === id);
          if (s && A.ammo) {
            s.mag = Math.min(A.ammo[0], weaponStats(id, A.up).mag);
            s.reserve = Math.min(A.ammo[1], weaponStats(id, A.up).reserve);
            w.updateHud();
          }
          this.given.add(A.el);
        } else if ((has.up | 0) < A.up) w.give(id, A.up);
        else this.given.add(A.el);
      } else if (has) {
        this.given.delete(A.el);
        w.drop(id);
      }
    }
  }

  // ---------------- el temple ----------------
  startTemper(A, owner) {
    const g = this.g;
    if (A.state !== 'ready' || A.up || this.temper || this.egg.asedio?.templeLock?.()) return false;
    const pos = owner === myId(g) ? g.player.pos : g.net?.remote.get(owner)?.pos;
    if (!pos || g.world.zoneAt(pos.x, pos.z, pos.y) !== A.zone) return false;
    this.temper = this.makeTemper(A.el, owner, 0);
    const who = owner === myId(g) ? 'Vos' : g.net?.nameOf(owner) || 'Alguien';
    announce(g, '', 5, true);
    this.egg.say('fierro', TEMPER_LINES[A.el]);
    this.egg.netSync();
    return true;
  }

  makeTemper(el, owner, t) {
    const g = this.g;
    const A = this.list.find((x) => x.el === el);
    const enc = new Temple(g, { zone: A.zone, color: ELEM_COLOR[el], place: ZONES[A.zone]?.name || 'el altar' });
    enc.owner = owner;
    enc.start();
    this.horn(A);
    return { el, owner, t, enc, syncT: 2 };
  }

  // El erke: un bramido largo y grave que sube al final (en todas las compus).
  horn(A) {
    const a = this.g.audio;
    if (!a.ctx) return;
    const t = a.now;
    const o = a.out({ pos: A.bell, reverb: 0.7, gain: 1.1 });
    for (const [f, g0] of [[98, 0.5], [196, 0.3], [294, 0.16], [392, 0.08]]) a.tone(o, { t, dur: 2.6, freq: f, freqEnd: f * 1.06, type: 'sawtooth', gain: g0, attack: 0.25 });
    a.noise(o, { t, dur: 2.4, type: 'bandpass', freq: 380, q: 2, gain: 0.25 });
  }

  // (anfitrión) terminó bien o mal
  endTemper(ok) {
    const g = this.g;
    const T = this.temper;
    if (!T) return;
    const A = this.list.find((x) => x.el === T.el);
    T.enc.stop();
    this.fade(T.enc);
    this.temper = null;
    if (ok) {
      A.up = 1;
      A.ammo = null;
      // vuelve a la mano del que sopló (si sigue en pie y no tiene otro)
      if (players(g).some((p) => p.id === T.owner) && !this.heldBy(T.owner)) {
        A.state = 'taken';
        A.holder = T.owner;
      }
      this.tempered(A);
      toastAll(g, `${weaponStats(MATE_OF[A.el], 1).name}: ¡el mate quedó templado!`);
      this.egg.onTempered?.(A.el);
    } else announce(g, `El temple del ${ELEM_NAME[A.el]} se cortó.`, 3);
    this.egg.netSync();
    this.reconcile();
  }

  // La cortina que se apaga sola (y después se tira).
  fade(enc) {
    if (this.fading && this.fading !== enc) this.fading.dispose();
    this.fading = enc;
  }

  tempered(A) {
    const g = this.g;
    const p = tmpV.copy(A.pos).setY(A.pos.y + MATE_Y);
    g.fx.explosion(p.clone(), 4.5, ELEM_RGB[A.el]);
    g.fx.sparkle(p.clone(), ELEM_RGB[A.el], 70, 2.2);
    g.fx.flash(p.clone(), ELEM_COLOR[A.el], 9, 1.2, 22);
    if (g.world.zoneAt(g.player.pos.x, g.player.pos.z, g.player.pos.y) === A.zone) g.post?.flash(0.45);
    A.lit = 1.6;
  }

  // ---------------- red ----------------
  state() {
    return {
      a: this.list.map((A) => [A.state === 'locked' ? 0 : A.state === 'ready' ? 1 : 2, A.holder, A.up]),
      t: this.temper ? [ELEMENTS.indexOf(this.temper.el), this.temper.owner, +this.temper.t.toFixed(1)] : null,
    };
  }

  apply(s) {
    if (!s) return;
    s.a?.forEach(([st, holder, up], i) => {
      const A = this.list[i];
      const was = A.state;
      const wasUp = A.up;
      A.state = st === 0 ? 'locked' : st === 1 ? 'ready' : 'taken';
      A.holder = holder;
      A.up = up;
      if (was === 'locked' && A.state !== 'locked') this.appear(A);
      if (!wasUp && up) this.tempered(A);
    });
    if (s.t) {
      const el = ELEMENTS[s.t[0]];
      if (!this.temper || this.temper.el !== el) {
        if (this.temper) {
          this.temper.enc.stop();
          this.fade(this.temper.enc);
        }
        this.temper = this.makeTemper(el, s.t[1], s.t[2]);
      } else this.temper.t = s.t[2];
    } else if (this.temper) {
      this.temper.enc.stop();
      this.fade(this.temper.enc);
      this.temper = null;
    }
    this.reconcile();
  }

  onGuest(m, from) {
    const A = this.list.find((x) => x.el === m.el);
    if (!A) return;
    if (m.op === 'take') this.take(A, from);
    else if (m.op === 'leave') this.leave(A, from, m.ammo);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    for (const A of this.list) this.animate(A, dt, t);
    // el mate que me di y ya no tengo (lo cambié en la caja, me morí): vuelve
    const me = myId(g);
    for (const A of this.list) {
      if (!this.given.has(A.el) || A.state !== 'taken' || A.holder !== me) continue;
      if (g.weapons.has(MATE_OF[A.el])) continue;
      this.given.delete(A.el);
      if (isHost(g)) this.leave(A, me, null);
      else g.net.net.send({ t: 'pee', a: 'alt', op: 'leave', el: A.el, ammo: null });
    }
    if (this.fading) {
      this.fading.update(dt);
      if (this.fading.alpha < 0.01) {
        this.fading.dispose();
        this.fading = null;
      }
    }
    const T = this.temper;
    if (!T) return;
    T.enc.update(dt);
    T.t += dt;
    if (!isHost(g)) return;
    // el que sopló se cayó, se murió o se fue: se corta
    const owner = players(g).find((p) => p.id === T.owner);
    const down = !owner || (owner.me ? g.player.downed : owner.downed);
    if (down) {
      this.endTemper(false);
      return;
    }
    // más muertos a medida que pasa el tiempo
    T.enc.spawns(dt, Math.max(0.9, 2.2 - T.t / 40));
    if (T.t >= TEMPER_SECS) {
      this.endTemper(true);
      return;
    }
    T.syncT -= dt;
    if (T.syncT <= 0) {
      T.syncT = 2;
      this.egg.netSync();
    }
  }

  animate(A, dt, t) {
    const g = this.g;
    const on = A.state === 'ready' || this.temper?.el === A.el;
    const T = this.temper?.el === A.el ? this.temper : null;
    A.lit = Math.max(0, A.lit - dt * 0.8);
    A.models.forEach((m, up) => {
      m.root.visible = on && up === (A.up ? 1 : 0);
      if (!m.root.visible) return;
      m.root.rotation.y = t * (T ? 2.4 : 0.7);
      m.root.position.y = MATE_Y + Math.sin(t * 1.6) * 0.08 + (T ? 0.35 * Math.min(1, T.t / 3) : 0);
      animateMate(m, dt, t, T ? 1 : 0.3);
    });
    const k = A.state === 'locked' ? 0 : on ? 1 : 0.35;
    const want = k * (0.34 + Math.sin(t * 2.2) * 0.05) + A.lit * 0.5 + (T ? 0.3 : 0);
    A.halo.material.opacity += (want - A.halo.material.opacity) * Math.min(1, dt * 3);
    A.halo.scale.setScalar(2.4 + A.lit * 2 + (T ? Math.sin(t * 6) * 0.3 : 0));
    A.floor.material.opacity += (k * 0.5 + (T ? 0.4 : 0) - A.floor.material.opacity) * Math.min(1, dt * 3);
    A.floor.rotation.y += dt * 0.3;
    A.glyph.color.setScalar(0.12 + k * 0.6 + A.lit * 0.6 + (T ? 0.4 + Math.sin(t * 5) * 0.2 : 0));
    // las esquinas: fuego prendido, cintas al viento, rayitos entre los pararrayos, escarcha
    if (A.el === 'fuego') {
      for (const f of A.deco) {
        f.visible = A.state !== 'locked';
        f.scale.setScalar(T ? 1.5 + Math.sin(t * 9 + f.position.x) * 0.15 : 1);
      }
    } else if (A.el === 'viento') {
      const wind = A.state === 'locked' ? 0.15 : T ? 1.6 : 0.7;
      for (const r of A.deco) {
        const pos = r.geometry.attributes.position;
        const base = r.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.array[i * 3 + 2] = Math.sin(t * 5 * wind + x * 7 + r.userData.ph) * x * 0.25 * wind;
          pos.array[i * 3 + 1] = base[i * 3 + 1] - x * x * (0.5 - wind * 0.25);
        }
        pos.needsUpdate = true;
        r.rotation.y = Math.sin(t * 0.7 + r.userData.ph) * 0.6 + t * 0.1;
      }
    } else if (A.el === 'rayo') {
      if (A.state !== 'locked' && Math.random() < dt * (T ? 9 : on ? 2.5 : 0.5)) {
        const a = A.deco[Math.floor(Math.random() * 4)];
        const b = Math.random() < 0.5 && on ? tmpW.copy(A.pos).setY(A.pos.y + MATE_Y) : A.deco[Math.floor(Math.random() * 4)];
        if (a !== b) g.fx.lightning(a.clone(), b.clone(), ELEM_COLOR.rayo, 0.12);
      }
    } else if (A.state !== 'locked' && Math.random() < dt * (T ? 6 : 1.2)) {
      const a = Math.random() * Math.PI * 2;
      g.fx.sparkle(tmpW.set(A.pos.x + Math.cos(a) * 1.2, A.pos.y + 0.4 + Math.random() * 1.6, A.pos.z + Math.sin(a) * 1.2), ELEM_RGB.hielo, 1, 0.3);
    }
    // la columna del temple
    const po = A.pillar.material;
    po.opacity += ((T ? 0.14 + Math.sin(t * 4) * 0.04 : 0) - po.opacity) * Math.min(1, dt * 2);
    A.pillar.visible = po.opacity > 0.005;
    A.pillar.rotation.y += dt * 0.5;
    A.pillar.material.map.offset.y -= dt * 0.35;
    if (T && Math.random() < dt * 8) g.fx.sparkle(tmpW.copy(A.pos).setY(A.pos.y + MATE_Y + 0.3), ELEM_RGB[A.el], 2, 0.9);
  }

  // La Gran Guerra: los altares se mudan a la isla del Éter (con sus mates).
  relocate(spots, y) {
    for (const A of this.list) {
      const s = spots[A.el];
      if (!s) continue;
      A.pos.set(s[0], y, s[1]);
      A.grp.position.copy(A.pos);
      A.it?.pos.copy(A.pos).setY(y + 1.3);
      A.erkeOff = true;
      A.zone = null;
      if (A.el === 'rayo') A.deco.corners.forEach((c, i) => A.deco[i].set(A.pos.x + c.x, y + 2.24, A.pos.z + c.z));
    }
  }

  // Los mates de los que se fueron (o se murieron) vuelven a su altar.
  checkHolders() {
    const g = this.g;
    if (!isHost(g)) return;
    const ids = new Set(players(g).map((p) => p.id));
    let changed = false;
    for (const A of this.list) {
      if (A.state === 'taken' && !ids.has(A.holder)) {
        A.state = 'ready';
        A.holder = -1;
        A.ammo = null;
        changed = true;
      }
    }
    if (changed) this.egg.netSync();
  }

  dispose() {
    for (const e of [this.temper?.enc, this.fading]) {
      if (!e) continue;
      e.stop();
      e.dispose();
    }
    this.root.removeFromParent();
  }
}

// Las vetas de luz de la columna del temple: suben y se apagan arriba.
let STREAK = null;
function streakTex() {
  if (STREAK) return STREAK;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * 128;
    const w = 1 + Math.random() * 4;
    const g2 = x.createLinearGradient(0, 0, 0, 128);
    g2.addColorStop(0, 'rgba(255,255,255,0)');
    g2.addColorStop(0.5 + Math.random() * 0.4, `rgba(255,255,255,${0.2 + Math.random() * 0.4})`);
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g2;
    x.fillRect(px, 0, w, 128);
  }
  STREAK = new THREE.CanvasTexture(c);
  STREAK.wrapS = THREE.RepeatWrapping;
  STREAK.wrapT = THREE.RepeatWrapping;
  return STREAK;
}

// Lo que se mueve solo en el mate del altar (lo mismo que en la mano, más tranquilo).
function animateMate(m, dt, t, k) {
  const E = m.elem;
  if (!E) return;
  if (E.kind === 'fuego') {
    for (const f of E.flames) f.scale.setScalar(0.8 + k * 0.6 + Math.sin(t * 13) * 0.08);
  } else if (E.kind === 'viento') {
    E.turbine.rotation.y += dt * (4 + k * 14);
    if (E.tornado) E.tornado.rotation.y += dt * (10 + k * 10);
  } else if (E.kind === 'rayo') {
    E.orb.scale.setScalar(1 + Math.sin(t * 11) * 0.12 + k * 0.3);
  }
}

// Lo que dice Fierro cuando arranca cada temple.
const TEMPER_LINES = {
  fuego: 'El fuego se templa a fuego, paisano. Aguantá adentro de la fragua, que el Pillán te está mirando.',
  viento: 'Arriba del mirador, con el Zonda en la cara. Que no te voltee, que el mate tiene que sentir que no aflojás.',
  rayo: 'La tormenta va a venir a buscarte. Quedate al lado de las campanas hasta que Illapa te reconozca.',
  hielo: 'El frío de la gruta te va a querer dormir. No te duermas, que el Penitente no perdona.',
};
