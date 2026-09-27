import * as THREE from 'three';
import { EE } from '../../config/map';
import { ELEM_RGB, ELEM_COLOR, ring, myId, isHost, announce, rayHit, playerById, isDown, firstHit, placeOf } from './common';
import { fireflies } from '../../fx/Fireflies';

// La vuelta del rayo: "Las Campanas de Illapa".
//  1. El rezo: en el altar de la capilla se le reza a Illapa y tres campanas
//     de luz sobre el altar muestran un orden (cuatro toques: la chica, la grande y
//     la mediana de la espadaña del campanario).
//  2. Las campanas: arriba, en el campanario, se tocan a tiros en ese orden.
//     Si se erra, Illapa le tira un rayo al que tiró y hay que empezar de nuevo.
//  3. La calabaza: la campana grande suelta la calabaza vacía de Illapa. Se
//     lleva a las marcas de la tormenta (una por vez, afuera): el que la lleva
//     se para adentro de la marca hasta que cae el rayo. Son tres rayos.
//  4. En el altar del campanario se deja la calabaza llena de tormenta.
// Lo lleva el anfitrión; los tiros del invitado a las campanas llegan como aviso.

const SEQ = 4;
const STEP = 0.9;
const CATCH = 3;
const CHARGE = 2.6;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class QuestRayo {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    const w = this.g.world;
    // 0 rezo, 1 campanas, 2 calabaza en el piso, 3 llevando la calabaza, 4 al altar, 5 listo
    this.ph = 0;
    this.seq = [];
    this.prog = 0;
    this.carrier = -1;
    this.charges = 0;
    this.mark = -1;
    this.markT = 0;
    this.used = [];
    const [px, pz] = EE.rayo.rezo;
    this.prayPos = new THREE.Vector3(px, w.floorAt(px, pz) + 1.1, pz);
    const [gx, gz] = EE.rayo.calabaza;
    this.gourdHome = new THREE.Vector3(gx, w.floorAt(gx, gz) + 0.15, gz);
    this.gourdPos = this.gourdHome.clone();
    this.marks = EE.rayo.marcas.map(([x, z]) => new THREE.Vector3(x, w.floorAt(x, z), z));
    this.buildIcons();
    this.buildGourd();
    this.buildMark();
    this.register();
    this.bells = null;
    this.swing = [0, 0, 0];
  }

  get done() {
    return this.ph >= 5;
  }

  // Las campanas de la espadaña (las arma el mapa: world/castleNature.js).
  bellList() {
    if (!this.bells) {
      this.bells = (this.g.world.castleBells || []).map((b, i) => {
        const s = [0.75, 1, 0.85][i] || 1;
        const c = new THREE.Vector3();
        b.getWorldPosition(c);
        c.y -= 0.4 * s;
        return { obj: b, s, center: c, r: 0.46 * s, base: b.rotation.z };
      });
    }
    return this.bells;
  }

  // ---------------- lo que se ve ----------------
  // Tres campanas de luz sobre el altar de la capilla (las de la espadaña, en
  // chiquito y en el mismo orden: la chica, la grande y la mediana).
  buildIcons() {
    const [px, pz] = EE.rayo.rezo;
    const y = this.g.world.floorAt(px, pz) + 2.1;
    this.icons = [-0.62, 0, 0.62].map((dx, i) => {
      const s = [0.75, 1, 0.85][i] * 0.42;
      const mat = new THREE.MeshBasicMaterial({ color: ELEM_COLOR.rayo, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const bell = new THREE.Mesh(new THREE.LatheGeometry([[0.02, 0], [0.18, -0.02], [0.28, -0.3], [0.36, -0.62], [0.45, -0.72], [0.44, -0.76], [0.02, -0.7]].map(([r, yy]) => new THREE.Vector2(r * s * 2.2, yy * s * 2.2)), 18), mat);
      bell.position.set(px + dx, y, pz - 0.9);
      this.root.add(bell);
      return bell;
    });
  }

  // La calabaza vacía de Illapa (gris de tormenta, con el rayo de oro).
  buildGourd() {
    const g = this.g;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.08, 0.01], [0.13, 0.06], [0.14, 0.13], [0.11, 0.2], [0.07, 0.25], [0.075, 0.28]].map(([r, y]) => new THREE.Vector2(r, y)), 18), new THREE.MeshStandardMaterial({ color: 0x4a4e58, roughness: 0.5, metalness: 0.2, emissive: 0x2a2a10, emissiveIntensity: 0.4 }));
    grp.add(body);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.012), g.world.M.brass);
    bolt.position.set(0, 0.13, 0.135);
    bolt.rotation.z = 0.4;
    grp.add(bolt);
    const s = fireflies(g, ELEM_COLOR.rayo, 1.2, 0.6);
    s.position.y = 0.15;
    grp.add(s);
    grp.visible = false;
    this.root.add(grp);
    this.gourd = { grp, glow: s, body };
  }

  // La marca de la tormenta: un anillo en el piso y una columna que se llena.
  buildMark() {
    const grp = new THREE.Group();
    const r = ring(1.7, ELEM_COLOR.rayo, 0.16);
    r.position.y = 0.06;
    grp.add(r);
    const fill = ring(1.5, 0xffffff, 1.5);
    fill.position.y = 0.05;
    fill.material.opacity = 0;
    grp.add(fill);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 24, 1, true).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color: ELEM_COLOR.rayo, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    grp.add(col);
    grp.visible = false;
    this.root.add(grp);
    this.markObj = { grp, ring: r, fill, col, k: 0 };
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    I.add({
      kind: 'ee',
      pos: this.prayPos.clone(),
      radius: 2.2,
      wide: true,
      prompt: () => {
        if (this.ph > 1 || this.show) return null;
        return { text: this.ph === 0 ? 'rezarle a Illapa' : 'volver a rezarle a Illapa (el orden de las campanas)', noCost: true };
      },
      cost: () => 0,
      use: () => this.pray(),
    });
    // al pie de la espadaña: cómo se tocan
    const [ex, ez] = EE.rayo.calabaza;
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(ex, this.g.world.floorAt(ex, ez) + 1.2, ez),
      radius: 2.6,
      prompt: () => {
        if (this.ph === 0) return { text: 'Las campanas de Illapa se tocan a tiros... pero primero hay que rezarle en la capilla', noCost: true, info: true };
        if (this.ph === 1) return { text: `Tocá las campanas a tiros en el orden del altar de la capilla (${this.prog} de ${this.seq.length})`, noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      use: () => false,
    });
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 1.8,
      prompt: () => (this.ph === 2 ? { text: 'agarrar la calabaza de Illapa', noCost: true } : null),
      cost: () => 0,
      use: () => this.pickGourd(g.net?.useFrom ?? myId(g)),
    });
    this.gourdIt = I.list[I.list.length - 1];
  }

  // (anfitrión) el rezo: un orden nuevo (o el mismo, si ya había uno)
  pray() {
    const g = this.g;
    if (!isHost(g) || this.ph > 1 || this.show) return false;
    if (this.ph === 0 || !this.seq.length) {
      this.seq = [];
      while (this.seq.length < SEQ) {
        const b = Math.floor(Math.random() * 3);
        if (this.seq.length && b === this.seq[this.seq.length - 1]) continue;
        this.seq.push(b);
      }
      if (this.ph === 0) this.egg.say('fierro', LINES.rezo);
    }
    this.ph = 1;
    this.prog = 0;
    this.egg.netSync();
    this.startShow();
    g.net?.event('ee', { q: 'rayo', show: 1 });
    return true;
  }

  startShow() {
    this.show = { t: -0.6, i: -1 };
  }

  // ---------------- los tiros a las campanas ----------------
  // Suenan siempre; solo cuentan después del rezo.
  onShot(o, d, maxT) {
    const bells = this.bellList();
    let best = -1;
    let bestT = Infinity;
    bells.forEach((b, i) => {
      const t = rayHit(o, d, maxT, b.center, b.r);
      if (t >= 0 && t < bestT) {
        best = i;
        bestT = t;
      }
    });
    const g = this.g;
    if (best < 0 || !firstHit(g, (this.shotT ??= []), best)) return;
    this.ring(best);
    if (isHost(g)) this.bell(best, myId(g));
    else g.net.net.send({ t: 'pee', a: 'q', q: 'rayo', op: 'bell', i: best });
  }

  // (anfitrión)
  bell(i, who) {
    const g = this.g;
    if (who !== myId(g)) this.ring(i);
    g.net?.event('ee', { q: 'rayo', ring: i, by: who });
    if (this.ph !== 1) {
      // sin el rezo, Illapa no escucha: la pista (cada tanto)
      if (this.ph === 0 && g.time - (this.hintT ?? -99) > 25) {
        this.hintT = g.time;
        announce(g, 'Las campanas suenan, pero Illapa no escucha. Primero hay que rezarle en el altar de la capilla.', 5);
      }
      return;
    }
    if (this.seq[this.prog] === i) {
      this.prog++;
      if (this.prog < this.seq.length) announce(g, `Illapa escucha: ${this.prog} de ${this.seq.length}`, 2);
      if (this.prog >= this.seq.length) {
        this.ph = 2;
        this.gourdPos.copy(this.gourdHome);
        announce(g, 'Illapa escuchó. La campana grande soltó algo.', 4, true);
        this.egg.say('fierro', LINES.calabaza);
        this.dropFx();
        g.net?.event('ee', { q: 'rayo', drop: 1 });
      }
      this.egg.netSync();
      return;
    }
    // a destiempo: el rayo de Illapa para el que tiró
    this.prog = 0;
    announce(g, 'Illapa no perdona el desorden. Hay que empezar de nuevo (el altar de la capilla muestra el orden).', 4);
    this.smite(who);
    this.egg.netSync();
  }

  // Un rayo del cielo al que se equivocó (lo ven todos).
  smite(id) {
    const g = this.g;
    const p = playerById(g, id);
    if (!p) return;
    const at = p.pos.clone();
    this.boltFx(at);
    g.net?.event('ee', { q: 'rayo', bolt: [+at.x.toFixed(1), +at.y.toFixed(1), +at.z.toFixed(1)] });
    const target = p.me ? g.player : g.net?.remote.get(id);
    g.damagePlayer(target, 35, at.clone().add(tmpV.set(0.5, 0, 0.5)));
  }

  boltFx(at) {
    const g = this.g;
    const top = at.clone().add(tmpV.set((Math.random() - 0.5) * 6, 28, (Math.random() - 0.5) * 6));
    g.fx.lightning(top, at.clone().setY(at.y + 0.2), ELEM_COLOR.rayo, 0.35);
    g.fx.lightning(top.clone().add(tmpV.set(1, 0, -1)), at.clone().setY(at.y + 0.2), 0xffffff, 0.2);
    g.fx.electric(at.clone().setY(at.y + 0.5), 24);
    g.fx.flash(at, ELEM_COLOR.rayo, 20, 0.4, 20);
    if (g.weather) g.weather.flash = Math.max(g.weather.flash || 0, 0.8);
    // el trueno del castillo (el intenso)
    if (g.audio.ctx) g.audio.thunder(at);
  }

  // La campana se hamaca y suena (en todas las compus).
  ring(i) {
    const g = this.g;
    const b = this.bellList()[i];
    if (!b) return;
    this.swing[i] = 1;
    g.fx.sparks(b.center, 0.5, tmpV.set(0, -1, 0), [1, 0.85, 0.5]);
    const a = g.audio;
    if (!a.ctx) return;
    const f = [523, 294, 392][i] || 330;
    const o = a.out({ pos: b.center, reverb: 0.9, gain: 1.1, ref: 10 });
    const t = a.now;
    for (const [m, gain, dur] of [[0.5, 0.25, 4], [1, 0.3, 3.2], [1.19, 0.14, 2.4], [1.5, 0.1, 2], [2, 0.12, 1.6], [2.76, 0.05, 1]]) a.tone(o, { t, dur, freq: f * m, type: 'sine', gain, attack: 0.004 });
    a.noise(o, { t, dur: 0.05, type: 'highpass', freq: 3000, gain: 0.3 });
  }

  dropFx() {
    const g = this.g;
    const b = this.bellList()[1];
    if (b) this.gourdFall = { t: 0, from: b.center.clone() };
    g.fx.sparkle(this.gourdHome, ELEM_RGB.rayo, 20, 0.5);
  }

  // ---------------- la calabaza y las marcas ----------------
  // (anfitrión)
  pickGourd(id) {
    const g = this.g;
    if (!isHost(g) || this.ph !== 2) return false;
    this.ph = 3;
    this.carrier = id;
    if (this.mark < 0) this.nextMark();
    const who = id === myId(g) ? 'Llevás' : `${g.net?.nameOf(id) || 'Alguien'} lleva`;
    announce(g, `${who} la calabaza de Illapa. Parate en la marca de la tormenta hasta que caiga el rayo (${this.charges} de ${CATCH}).`, 5);
    this.egg.netSync();
    return true;
  }

  nextMark() {
    const free = this.marks.map((_, i) => i).filter((i) => !this.used.includes(i) && i !== this.mark);
    const pool = free.length ? free : this.marks.map((_, i) => i).filter((i) => i !== this.mark);
    this.mark = pool[Math.floor(Math.random() * pool.length)];
    this.markT = 0;
    this.markK = 0;
  }

  // (anfitrión) cayó el rayo en la marca con la calabaza adentro
  caught() {
    const g = this.g;
    const at = this.marks[this.mark];
    this.boltFx(at);
    g.net?.event('ee', { q: 'rayo', bolt: [+at.x.toFixed(1), +at.y.toFixed(1), +at.z.toFixed(1)] });
    this.charges++;
    this.used.push(this.mark);
    if (this.charges >= CATCH) {
      this.ph = 4;
      this.mark = -1;
      announce(g, 'La calabaza está llena de tormenta. Al altar del campanario.', 4, true);
      this.egg.say('fierro', LINES.llena);
    } else {
      this.nextMark();
      announce(g, `¡Rayo adentro! (${this.charges} de ${CATCH}). La tormenta marca otro lugar.`, 3);
    }
    this.egg.netSync();
  }

  // El que la lleva se cayó: la calabaza queda en el piso.
  dropGourd() {
    const g = this.g;
    const p = playerById(g, this.carrier);
    if (p) this.gourdPos.copy(p.pos).setY(g.world.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5) + 0.15);
    this.carrier = -1;
    this.ph = this.ph === 3 ? 2 : this.ph;
    announce(g, 'Se cayó la calabaza de Illapa. Alguien que la levante.', 3);
    this.egg.netSync();
  }

  // ---------------- el altar del campanario ----------------
  altarPrompt() {
    const me = myId(this.g);
    if (this.ph === 4 && this.carrier === me) return { text: 'dejar la calabaza llena de tormenta en el altar', noCost: true };
    if (this.ph === 4) return { text: 'El altar espera la calabaza llena de tormenta', noCost: true, info: true };
    if (this.ph === 3) return { text: `La calabaza todavía no está llena (${this.charges} de ${CATCH})`, noCost: true, info: true };
    return null;
  }

  altarUse() {
    const g = this.g;
    if (this.ph !== 4 || this.carrier !== myId(g)) return false;
    if (isHost(g)) return this.offer(myId(g));
    g.net.net.send({ t: 'pee', a: 'q', q: 'rayo', op: 'offer' });
    return true;
  }

  // (anfitrión)
  offer(id) {
    if (this.ph !== 4 || this.carrier !== id) return false;
    this.ph = 5;
    this.carrier = -1;
    this.egg.netSync();
    this.finish();
    return true;
  }

  finish() {
    const [x, z] = EE.altars.rayo;
    const at = new THREE.Vector3(x, this.g.world.floorAt(x, z), z);
    this.ending = { t: 0, at };
    this.egg.say('fierro', LINES.listo);
  }

  onGuest(m, from) {
    if (m.op === 'bell' && m.i >= 0 && m.i < 3) this.bell(m.i, from);
    else if (m.op === 'offer') this.offer(from);
  }

  // ---------------- red ----------------
  state() {
    return { ph: this.ph, sq: this.seq, p: this.prog, c: this.carrier, n: this.charges, m: this.mark, u: this.used, gp: [+this.gourdPos.x.toFixed(2), +this.gourdPos.y.toFixed(2), +this.gourdPos.z.toFixed(2)] };
  }

  apply(s) {
    if (s.show) {
      this.startShow();
      return;
    }
    if (s.ring !== undefined) {
      if (s.by !== myId(this.g)) this.ring(s.ring);
      return;
    }
    if (s.bolt) {
      this.boltFx(new THREE.Vector3(...s.bolt));
      return;
    }
    if (s.drop) {
      this.dropFx();
      return;
    }
    if (s.mk !== undefined) {
      this.markK = s.mk;
      return;
    }
    const was = this.ph;
    this.ph = s.ph | 0;
    this.seq = s.sq || this.seq;
    this.prog = s.p | 0;
    this.carrier = s.c ?? -1;
    this.charges = s.n | 0;
    if (s.m !== this.mark) {
      this.mark = s.m ?? -1;
      this.markK = 0;
    }
    this.used = s.u || this.used;
    if (s.gp) this.gourdPos.set(s.gp[0], s.gp[1], s.gp[2]);
    if (was < 5 && this.ph === 5) this.finish();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // las campanas de luz del altar muestran el orden
    const S = this.show;
    let lit = -1;
    if (S) {
      S.t += dt;
      const k = Math.floor(S.t / STEP);
      if (k >= this.seq.length) this.show = null;
      else if (k >= 0) {
        lit = this.seq[k];
        if (k !== S.i) {
          S.i = k;
          this.chime(lit);
        }
      }
    }
    // (sin rezo laten despacito, para que se vea que ahí hay algo)
    this.icons.forEach((s, i) => {
      const want = lit === i ? 1 : this.ph === 1 ? 0.2 : this.ph === 0 ? 0.16 + Math.sin(t * 1.6 + i * 1.2) * 0.07 : 0;
      s.material.opacity += (want - s.material.opacity) * Math.min(1, dt * 12);
      s.rotation.z = lit === i ? Math.sin(t * 9) * 0.35 : s.rotation.z * 0.9;
    });
    // las campanas se hamacan
    const bells = this.bellList();
    bells.forEach((b, i) => {
      this.swing[i] = Math.max(0, this.swing[i] - dt * 0.35);
      b.obj.rotation.z = b.base + Math.sin(t * 5.5) * this.swing[i] * 0.45;
    });
    // la primera vez que uno llega al campanario sin el rezo: la pista (solo para él)
    if (!this.toldTower && this.ph === 0 && bells[1] && g.player.alive && g.player.pos.distanceTo(bells[1].center) < 7) {
      this.toldTower = true;
      g.hud.subtitle('Tres campanas para Illapa. Dicen que solo escucha a los que le rezan en el altar de la capilla.', 5);
    }
    // la calabaza cayendo de la campana grande
    const GF = this.gourdFall;
    if (GF) {
      GF.t = Math.min(1, GF.t + dt * 1.4);
      this.gourd.grp.position.lerpVectors(GF.from, this.gourdHome, GF.t * GF.t);
      this.gourd.grp.visible = true;
      if (GF.t >= 1) this.gourdFall = null;
    }
    // dónde está la calabaza: en el piso o en la mano de alguien
    const G = this.gourd;
    this.gourdIt.pos.copy(this.gourdPos).setY(this.gourdPos.y + 0.9);
    if (!GF) {
      if (this.ph === 2) {
        G.grp.visible = true;
        G.grp.position.copy(this.gourdPos);
        G.grp.rotation.y = t * 0.6;
      } else if (this.ph === 3 || this.ph === 4) {
        const p = playerById(g, this.carrier);
        G.grp.visible = !!p && !p.me;
        if (p && !p.me) G.grp.position.copy(p.pos).setY(p.pos.y + 2.3);
      } else G.grp.visible = false;
    }
    G.glow.material.opacity = 0.25 + this.charges * 0.2 + Math.sin(t * 8) * 0.08;
    if ((this.ph === 3 || this.ph === 4) && this.charges && Math.random() < dt * 3 * this.charges) {
      const p = playerById(g, this.carrier);
      if (p) g.fx.electric(tmpW.copy(p.pos).setY(p.pos.y + 1.2), 1);
    }
    this.updateMark(dt, t);
    // el final: los rayos juntan al Illapa en su altar
    const E = this.ending;
    if (E) {
      E.t += dt;
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        g.fx.lightning(E.at.clone().add(tmpV.set(Math.cos(a) * 4, 6 + Math.random() * 4, Math.sin(a) * 4)), E.at.clone().setY(E.at.y + 2.2), ELEM_COLOR.rayo, 0.12);
      }
      if (E.t >= 2.2) {
        this.ending = null;
        this.boltFx(E.at.clone().setY(E.at.y + 1.2));
        if (isHost(g)) this.egg.altares.unlock('rayo');
        this.egg.onMate?.('rayo');
      }
    }
    if (!isHost(g)) return;
    // el que lleva la calabaza se cayó (o se fue)
    if ((this.ph === 3 || this.ph === 4) && isDown(g, this.carrier)) this.dropGourd();
    // la carga del rayo: el que la lleva, adentro de la marca
    if (this.ph === 3 && this.mark >= 0) {
      const p = playerById(g, this.carrier);
      const m = this.marks[this.mark];
      const inside = p && Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < 1.7 && Math.abs(p.pos.y - m.y) < 1.5;
      this.markK = inside ? (this.markK || 0) + dt / CHARGE : 0;
      this.markT += dt;
      if (this.markK >= 1) this.caught();
      else if (this.markT > 70 && !inside) {
        // la tormenta se cansa de esperar: marca otro lugar
        this.nextMark();
        announce(g, 'La tormenta se movió. Otra marca.', 3);
        this.egg.netSync();
      }
      this.markSend = (this.markSend || 0) - dt;
      if (this.markSend <= 0 && g.net) {
        this.markSend = 0.3;
        g.net.event('ee', { q: 'rayo', mk: +this.markK.toFixed(2) });
      }
    }
  }

  // El tintineo de las campanas de luz (cada una con la nota de la suya).
  chime(i) {
    const g = this.g;
    const a = g.audio;
    if (!this.icons[i]) return;
    g.fx.sparkle(this.icons[i].position, ELEM_RGB.rayo, 6, 0.2);
    if (!a.ctx) return;
    const f = ([523, 294, 392][i] || 330) * 2;
    const o = a.out({ pos: this.icons[i].position, reverb: 0.8, gain: 0.6 });
    a.tone(o, { dur: 1.4, freq: f, type: 'sine', gain: 0.25 });
    a.tone(o, { dur: 0.9, freq: f * 2.76, type: 'sine', gain: 0.05 });
    if (g.weather) g.weather.flash = Math.max(g.weather.flash || 0, 0.35);
  }

  updateMark(dt, t) {
    const M = this.markObj;
    const on = this.ph === 3 && this.mark >= 0;
    M.grp.visible = on;
    if (!on) return;
    const m = this.marks[this.mark];
    M.grp.position.copy(m);
    M.ring.rotation.y = t * 0.8;
    M.ring.material.opacity = 0.6 + Math.sin(t * 6) * 0.25;
    const k = Math.min(1, this.markK || 0);
    M.fill.material.opacity = k * 0.5;
    M.fill.scale.setScalar(0.2 + k * 0.8);
    M.col.material.opacity = 0.05 + k * 0.2 + Math.sin(t * 3) * 0.02;
    if (k > 0.2 && Math.random() < dt * 10 * k) this.g.fx.electric(tmpW.copy(m).setY(m.y + 0.4 + Math.random() * 2), 1);
  }

  // (cada paso dice qué hacer, dónde y, si hace falta, por dónde)
  line() {
    if (this.ph === 0) return ['Rezale a Illapa en el altar de la capilla', ''];
    if (this.ph === 1) return ['Tocá a tiros las campanas del campanario, en el orden del altar de la capilla', `${this.prog}/${this.seq.length || SEQ}`];
    if (this.ph === 2) return ['Agarrá la calabaza que soltó la campana grande, en el campanario', ''];
    if (this.ph === 3) return [`Parate con la calabaza en la marca de la tormenta${this.markPlace()} hasta que caiga el rayo`, `${this.charges}/${CATCH}`];
    if (this.ph === 4) return ['Llevá la calabaza llena al altar del campanario', ''];
    return ['El Illapa', ''];
  }

  markPlace() {
    const at = this.mark >= 0 ? this.marks[this.mark] : null;
    const p = at ? placeOf(this.g, at) : '';
    return p ? ` (en ${p})` : '';
  }

  // Lo que dice Fierro si le preguntan (null: la pista de arranque, en CastleEgg)
  hint() {
    if (this.ph === 1) return 'Illapa ya los escuchó. Suban al campanario por la escalera de la capilla y toquen las campanas a tiros, en el orden que mostraron las luces del altar.';
    if (this.ph === 2) return 'La campana grande soltó la calabaza de Illapa, allá en el campanario. Agárrenla.';
    if (this.ph === 3) return `Con la calabaza, a la marca de la tormenta${this.markPlace()}: el que la lleva se queda adentro hasta que cae el rayo. Son tres.`;
    if (this.ph === 4) return 'La calabaza está llena de tormenta. Al altar del campanario con ella.';
    return null;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const LINES = {
  rezo: 'Illapa habla con campanas. Primero se le reza en el altar de la capilla; después, a tiros en el campanario, en el orden de la luz. Tiene mal genio.',
  calabaza: 'La calabaza de Illapa está vacía. Llénenla de tormenta... donde marque el cielo, ahí tiene que estar el que la lleva.',
  llena: 'Llena de tormenta. Llévenla al altar del campanario, que se me eriza el bigote de tenerla tan cerca.',
  listo: 'El Illapa, el mate del rayo. Está en el campanario. Si ven que chisporrotea, no se asusten, está contento.',
};
