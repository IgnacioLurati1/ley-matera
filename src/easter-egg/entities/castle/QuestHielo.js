import * as THREE from 'three';
import { EE, ZONES, PROPS, FIRES } from '../../config/map';
import { ELEM_RGB, ELEM_COLOR, glow, ring, myId, isHost, announce, rayHit, players, playerById, isDown, firstHit } from './common';
import { fireflies } from '../../fx/Fireflies';
import { compactGroup } from '../../world/props';
import { lean } from '../../world/castleLean';

// La vuelta del hielo: "El Corazón del Glaciar".
//  1. El bloque: en la cumbre, delante de la tumba del Caballero del Hielo,
//     hay un bloque de hielo de mil inviernos con un corazón azul adentro. Se
//     rompe a cuchillazos (o con explosiones, o con el fuego del Pillán).
//  2. El corazón: se lleva bajando por el castillo hasta la gruta del
//     glaciar. Se derrite: más rápido cerca del fuego (braseros, antorchas,
//     fogones) y nada en la gruta; afuera, en la nieve, se vuelve a congelar.
//     Si se derrite entero, vuelve a armarse en la cumbre.
//  3. Los penitentes: con el corazón en el altar de la gruta, cinco agujas de
//     hielo se prenden en un orden y hay que tirarles en ese mismo orden (tres
//     vueltas: de 3, de 4 y de 5). Errar suelta una helada.
// Lo lleva el anfitrión; los golpes y tiros del invitado llegan como aviso.

const BLOCK_HITS = 10;
const MELT = 1 / 70;
const REFREEZE = 1 / 40;
const FIRE_R = 4.5;
const ROUNDS = [3, 4, 5];
const STEP = 0.75;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class QuestHielo {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    const w = this.g.world;
    // 0 bloque, 1 corazón suelto, 2 llevándolo, 3 penitentes, 4 listo
    this.ph = 0;
    this.chips = 0;
    this.carrier = -1;
    this.melt = 1;
    this.round = 0;
    this.seq = [];
    this.inp = 0;
    const [bx, bz] = EE.hielo.bloque;
    this.blockPos = new THREE.Vector3(bx, w.floorAt(bx, bz), bz);
    this.heartPos = this.blockPos.clone().setY(this.blockPos.y + 0.9);
    const [ax, az] = EE.altars.hielo;
    this.altarPos = new THREE.Vector3(ax, w.floorAt(ax, az), az);
    this.fires = fireSpots(w);
    this.buildBlock();
    this.buildHeart();
    this.buildSpikes();
    this.register();
    this.hitCd = 0;
    this.lit = -1;
  }

  get done() {
    return this.ph >= 4;
  }

  // ---------------- lo que se ve ----------------
  buildBlock() {
    const g = this.g;
    const grp = new THREE.Group();
    grp.position.copy(this.blockPos);
    const ice = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.06, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.5, transparent: true, opacity: 0.62, depthWrite: false });
    const cube = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), ice);
    cube.scale.set(1, 1.15, 0.9);
    cube.position.y = 0.95;
    grp.add(cube);
    // trozos alrededor (hielo más viejo, más blanco)
    const old = new THREE.MeshStandardMaterial({ color: 0xe0f2ff, roughness: 0.3, emissive: 0x16405a, emissiveIntensity: 0.3 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16 + (k % 3) * 0.06, 0.6 + (k % 2) * 0.5, 5), old);
      c.position.set(Math.cos(a) * 0.95, 0.3, Math.sin(a) * 0.8);
      c.rotation.set(Math.sin(a) * 0.4, a, Math.cos(a) * 0.4);
      grp.add(c);
    }
    // (los siete trozos: una malla)
    if (lean()) compactGroup(grp);
    this.root.add(grp);
    this.block = { grp, cube, ice };
    this.blockBox = g.world.addBox([this.blockPos.x - 0.9, this.blockPos.y, this.blockPos.z - 0.8, this.blockPos.x + 0.9, this.blockPos.y + 2, this.blockPos.z + 0.8], { kind: 'prop' });
  }

  // El corazón del glaciar: un cristal azul que late.
  buildHeart() {
    const g = this.g;
    const grp = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.6), toneMapped: false }));
    core.scale.set(1, 1.5, 1);
    grp.add(core);
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false, emissive: 0x2a6aa0, emissiveIntensity: 0.6 }));
    shell.scale.set(1, 1.4, 1);
    grp.add(shell);
    const s = fireflies(g, ELEM_COLOR.hielo, 1.8, 0.6);
    grp.add(s);
    this.root.add(grp);
    this.heart = { grp, core, shell, glow: s };
  }

  // Las cinco agujas de los penitentes alrededor del altar de la gruta.
  buildSpikes() {
    const g = this.g;
    const w = g.world;
    this.spikes = EE.hielo.penitentes.map(([x, z], i) => {
      const y = w.floorAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      const h = 2.3 + (i % 2) * 0.4;
      const mat = new THREE.MeshStandardMaterial({ color: 0xa8dcf4, roughness: 0.08, metalness: 0.15, emissive: 0x1a4a70, emissiveIntensity: 0.4 });
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.34, h, 6), mat);
      c.position.y = h / 2;
      c.rotation.y = i;
      grp.add(c);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, h * 0.55, 5), mat);
      c2.position.set(0.25, h * 0.27, 0.1);
      c2.rotation.set(0.2, 0, -0.25);
      grp.add(c2);
      const s = glow(g.textures, ELEM_COLOR.hielo, 2.2, 0);
      s.position.y = h * 0.6;
      grp.add(s);
      const r = ring(0.8, ELEM_COLOR.hielo, 0.1);
      r.position.y = 0.05;
      r.material.opacity = 0;
      grp.add(r);
      // (las dos agujas, una malla: comparten el material que brilla)
      if (lean()) compactGroup(grp);
      this.root.add(grp);
      w.addBox([x - 0.35, y, z - 0.35, x + 0.35, y + h, z + 0.35], { kind: 'prop' });
      return { grp, mat, glow: s, ring: r, center: new THREE.Vector3(x, y + h * 0.45, z), top: new THREE.Vector3(x, y + h, z), flash: 0, note: [392, 440, 523, 587, 659][i] };
    });
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    this.heartIt = g.interact.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 1.9,
      prompt: () => {
        if (this.ph === 0 && this.egg.step >= 1) return { text: `Un bloque de hielo de mil inviernos: algo late adentro (${this.chips}/${BLOCK_HITS})`, noCost: true, info: true };
        if (this.ph === 1) return { text: 'agarrar el corazón del glaciar', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => this.pickHeart(g.net?.useFrom ?? myId(g)),
    });
  }

  // (anfitrión)
  pickHeart(id) {
    const g = this.g;
    if (!isHost(g) || this.ph !== 1) return false;
    this.ph = 2;
    this.carrier = id;
    const who = id === myId(g) ? 'Llevás' : `${g.net?.nameOf(id) || 'Alguien'} lleva`;
    // (decía que se derretía pero no adónde llevarlo: ahora el destino y el camino)
    announce(g, `${who} el corazón del glaciar: al altar de la gruta del glaciar, abajo de todo (cocina, bodega, mazmorras). Se derrite cerca del fuego; en la nieve se vuelve a congelar.`, 7);
    if (!this.toldCarry) {
      this.toldCarry = true;
      this.egg.say('fierro', LINES.llevar);
    }
    this.egg.netSync();
    return true;
  }

  // ---------------- el bloque ----------------
  onKnife(fwd) {
    const g = this.g;
    if (this.ph !== 0 || this.hitCd > 0) return false;
    const d = tmpV.subVectors(tmpW.copy(this.blockPos).setY(this.blockPos.y + 0.9), g.camera.position);
    if (d.length() > 2.6 || d.normalize().dot(fwd) < 0.5) return false;
    this.hitCd = 0.3;
    this.chipFx();
    if (isHost(g)) this.chip(1);
    else g.net.net.send({ t: 'pee', a: 'q', q: 'hielo', op: 'chip', n: 1 });
    return true;
  }

  onExplosion(pos, r) {
    if (this.ph !== 0 || pos.distanceTo(this.blockPos) > r + 1.2) return;
    this.chipFx();
    if (isHost(this.g)) this.chip(3);
  }

  onElemental(el, pos, charged) {
    if (el !== 'fuego' || this.ph !== 0 || pos.distanceTo(this.blockPos) > (charged ? 5 : 2.5)) return;
    this.chipFx();
    const n = charged ? 6 : 3;
    if (isHost(this.g)) this.chip(n);
    else this.g.net.net.send({ t: 'pee', a: 'q', q: 'hielo', op: 'chip', n });
  }

  chipFx() {
    const g = this.g;
    const p = tmpV.copy(this.blockPos).setY(this.blockPos.y + 0.9);
    g.fx.frost(p, 10);
    g.fx.sparks(p, 0.5, tmpW.set(0, 1, 0), ELEM_RGB.hielo);
    g.audio.shatter?.(p);
    this.block.shake = 1;
  }

  // (anfitrión)
  chip(n) {
    if (this.ph !== 0) return;
    this.chips = Math.min(BLOCK_HITS, this.chips + Math.max(1, Math.min(6, n | 0)));
    if (this.chips < BLOCK_HITS) {
      if (this.chips === 1 || this.chips % 3 === 0) this.egg.netSync();
      return;
    }
    this.ph = 1;
    this.melt = 1;
    this.heartPos.copy(this.blockPos).setY(this.blockPos.y + 0.9);
    announce(this.g, 'Se rompió el bloque. El corazón del glaciar quedó suelto.', 4, true);
    this.egg.say('fierro', LINES.bloque);
    this.egg.netSync();
  }

  // ---------------- los penitentes ----------------
  altarPrompt() {
    const me = myId(this.g);
    if (this.ph === 2 && this.carrier === me) return { text: 'poner el corazón del glaciar en el altar', noCost: true };
    if (this.ph === 2) return { text: 'El altar espera el corazón del glaciar', noCost: true, info: true };
    if (this.ph === 3) return { text: 'Los penitentes: tiren a las agujas en el orden en que se prenden', noCost: true, info: true };
    return null;
  }

  altarUse() {
    const g = this.g;
    if (this.ph !== 2 || this.carrier !== myId(g)) return false;
    if (isHost(g)) return this.place(myId(g));
    g.net.net.send({ t: 'pee', a: 'q', q: 'hielo', op: 'place' });
    return true;
  }

  // (anfitrión)
  place(id) {
    if (this.ph !== 2 || this.carrier !== id) return false;
    this.ph = 3;
    this.carrier = -1;
    this.round = 0;
    this.newRound();
    announce(this.g, 'El corazón despertó a los penitentes. Tírenles en el orden en que se prenden.', 5, true);
    this.egg.say('fierro', LINES.penitentes);
    this.egg.netSync();
    return true;
  }

  newRound() {
    this.seq = [];
    while (this.seq.length < ROUNDS[this.round]) {
      const i = Math.floor(Math.random() * this.spikes.length);
      if (this.seq.length && this.seq[this.seq.length - 1] === i) continue;
      this.seq.push(i);
    }
    this.inp = 0;
    this.startShow();
  }

  startShow() {
    this.show = { t: -1.2, i: -1 };
    this.gap = false;
    if (isHost(this.g)) this.g.net?.event('ee', { q: 'hielo', show: 1, sq: this.seq });
  }

  onShot(o, d, maxT) {
    if (this.ph !== 3 || this.show) return;
    let best = -1;
    let bestT = Infinity;
    this.spikes.forEach((s, i) => {
      for (const c of [s.center, tmpW.copy(s.center).setY(s.center.y - 0.7)]) {
        const t = rayHit(o, d, maxT, c, 0.55);
        if (t >= 0 && t < bestT) {
          best = i;
          bestT = t;
        }
      }
    });
    const g = this.g;
    if (best < 0 || !firstHit(g, (this.shotT ??= []), best)) return;
    this.ping(best);
    if (isHost(g)) this.spike(best, myId(g));
    else g.net.net.send({ t: 'pee', a: 'q', q: 'hielo', op: 'spike', i: best });
  }

  // (anfitrión)
  spike(i, who) {
    const g = this.g;
    // (entre una vuelta y la otra, o después de errar, los tiros de más no
    // cuentan: si no, la ráfaga que sigue al último acierto los enoja)
    if (this.ph !== 3 || this.show || this.gap) return;
    if (who !== myId(g)) this.ping(i);
    g.net?.event('ee', { q: 'hielo', ping: i, by: who });
    if (this.seq[this.inp] === i) {
      this.inp++;
      if (this.inp < this.seq.length) return;
      this.round++;
      if (this.round >= ROUNDS.length) {
        this.ph = 4;
        this.egg.netSync();
        this.finish();
        return;
      }
      announce(g, `Los penitentes aceptaron (${this.round} de ${ROUNDS.length}). Otra vuelta, más larga.`, 3);
      this.gap = true;
      g.later(1.4, () => {
        if (this.ph !== 3) return;
        this.newRound();
        this.egg.netSync();
      });
      this.egg.netSync();
      return;
    }
    // errado: helada y se repite la misma vuelta
    this.inp = 0;
    this.gap = true;
    this.frostBurst();
    g.net?.event('ee', { q: 'hielo', burst: 1 });
    announce(g, 'Los penitentes se enojaron. Miren el orden de nuevo.', 3);
    g.later(1.6, () => {
      if (this.ph === 3) this.startShow();
    });
    this.egg.netSync();
  }

  // La helada: escarcha alrededor del altar (a los de cerca les pega).
  frostBurst() {
    const g = this.g;
    const p = this.altarPos.clone().setY(this.altarPos.y + 1);
    g.fx.frost(p, 60);
    g.fx.explosion(p, 5, ELEM_RGB.hielo);
    g.audio.shatter?.(p);
    if (!isHost(g)) return;
    for (const pl of players(g)) {
      if (pl.pos.distanceTo(p) > 7) continue;
      g.damagePlayer(pl.me ? g.player : g.net?.remote.get(pl.id), 25, p);
    }
  }

  ping(i) {
    const g = this.g;
    const s = this.spikes[i];
    s.flash = 1;
    g.fx.frost(s.top, 8);
    const a = g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: s.center, reverb: 0.9, gain: 0.8 });
    a.tone(o, { dur: 1.6, freq: s.note, type: 'sine', gain: 0.22 });
    a.tone(o, { dur: 1.1, freq: s.note * 2.4, type: 'sine', gain: 0.06 });
    a.noise(o, { dur: 0.06, type: 'highpass', freq: 5000, gain: 0.25 });
  }

  finish() {
    this.ending = { t: 0 };
    this.egg.say('fierro', LINES.listo);
  }

  onGuest(m, from) {
    if (m.op === 'chip') this.chip(m.n | 0);
    else if (m.op === 'place') this.place(from);
    else if (m.op === 'spike' && m.i >= 0 && m.i < this.spikes.length) this.spike(m.i, from);
  }

  // ---------------- red ----------------
  state() {
    return { ph: this.ph, k: this.chips, c: this.carrier, m: +this.melt.toFixed(3), r: this.round, sq: this.seq, i: this.inp, hp: [+this.heartPos.x.toFixed(2), +this.heartPos.y.toFixed(2), +this.heartPos.z.toFixed(2)] };
  }

  apply(s) {
    if (s.show) {
      if (s.sq) this.seq = s.sq;
      this.show = { t: -1.2, i: -1 };
      return;
    }
    if (s.ping !== undefined) {
      if (s.by !== myId(this.g)) this.ping(s.ping);
      return;
    }
    if (s.burst) {
      this.frostBurst();
      return;
    }
    if (s.mt !== undefined) {
      this.melt = s.mt;
      if (s.hp) this.heartPos.set(s.hp[0], s.hp[1], s.hp[2]);
      return;
    }
    const was = this.ph;
    this.ph = s.ph | 0;
    this.chips = s.k | 0;
    this.carrier = s.c ?? -1;
    this.melt = s.m ?? this.melt;
    this.round = s.r | 0;
    this.seq = s.sq || this.seq;
    this.inp = s.i | 0;
    if (s.hp) this.heartPos.set(s.hp[0], s.hp[1], s.hp[2]);
    if (was < 4 && this.ph === 4) this.finish();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.hitCd = Math.max(0, this.hitCd - dt);
    // el bloque (se va achicando con los golpes; roto, desaparece)
    const B = this.block;
    B.grp.visible = this.ph === 0;
    if (this.blockBox.active !== (this.ph === 0)) {
      this.blockBox.active = this.ph === 0;
      g.world.computeNavBlock();
    }
    if (B.grp.visible) {
      B.shake = Math.max(0, (B.shake || 0) - dt * 4);
      const k = 1 - (this.chips / BLOCK_HITS) * 0.35;
      B.cube.scale.set(k, 1.15 * k, 0.9 * k);
      B.grp.position.x = this.blockPos.x + Math.sin(t * 60) * B.shake * 0.03;
      B.ice.opacity = 0.62 - (this.chips / BLOCK_HITS) * 0.2;
    }
    // el corazón: en el bloque, suelto, en la mano de alguien o en el altar
    const H = this.heart;
    let hp = null;
    if (this.ph <= 1) hp = this.heartPos;
    else if (this.ph === 2) {
      const p = playerById(g, this.carrier);
      if (p && !p.me) hp = tmpV.copy(p.pos).setY(p.pos.y + 2.3);
    } else if (this.ph === 3 || this.ending) hp = tmpV.copy(this.altarPos).setY(this.altarPos.y + 2.1);
    H.grp.visible = !!hp;
    if (hp) {
      H.grp.position.copy(hp);
      H.grp.position.y += Math.sin(t * 2) * 0.06;
      H.grp.rotation.y = t * 0.9;
      const beat = Math.pow(Math.max(0, Math.sin(t * 5)), 8);
      H.core.scale.set(1 + beat * 0.3, 1.5 + beat * 0.4, 1 + beat * 0.3);
      H.grp.scale.setScalar(0.5 + this.melt * 0.5);
      H.glow.material.opacity = 0.35 + beat * 0.4;
    }
    this.heartIt.pos.copy(this.heartPos).setY(this.heartPos.y + 0.3);
    // al que lo lleva le sale escarcha de las manos
    if (this.ph === 2 && this.carrier === myId(g) && Math.random() < dt * 4) g.fx.frost(tmpW.copy(g.player.pos).setY(g.player.pos.y + 1.1), 1);
    this.updateSpikes(dt, t);
    // el final: el hielo de la gruta se junta en el altar
    const E = this.ending;
    if (E) {
      E.t += dt;
      for (const s of this.spikes) if (Math.random() < dt * 6) g.fx.frost(s.top, 2);
      if (Math.random() < dt * 20) {
        const a = Math.random() * Math.PI * 2;
        g.fx.alpha.spawn(this.altarPos.x + Math.cos(a) * 3, this.altarPos.y + 0.5 + Math.random() * 2, this.altarPos.z + Math.sin(a) * 3, -Math.cos(a) * 2.5, 0.6, -Math.sin(a) * 2.5, { color: [0.8, 0.92, 1], size: 0.15, size1: 0.05, life: 1.1, alpha: 0.6, drag: 0.2 });
      }
      if (E.t >= 2.4) {
        this.ending = null;
        g.fx.frost(this.altarPos.clone().setY(this.altarPos.y + 2), 50);
        if (isHost(g)) this.egg.altares.unlock('hielo');
        this.egg.onMate?.('hielo');
      }
    }
    if (!isHost(g)) return;
    // el derretido (lo cuenta el anfitrión)
    if (this.ph === 1 || this.ph === 2) this.tickMelt(dt);
  }

  // (anfitrión)
  tickMelt(dt) {
    const g = this.g;
    if (this.ph === 2 && isDown(g, this.carrier)) {
      // el que lo llevaba se cayó: queda en el piso
      const p = playerById(g, this.carrier);
      if (p) this.heartPos.copy(p.pos).setY(g.world.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5) + 0.5);
      this.carrier = -1;
      this.ph = 1;
      announce(g, 'Se cayó el corazón del glaciar. ¡Levántenlo antes de que se derrita!', 3);
      this.egg.netSync();
    }
    let at = this.heartPos;
    if (this.ph === 2) {
      const p = playerById(g, this.carrier);
      if (p) at = p.pos;
    }
    // (en la cumbre, sin tocar, no se derrite)
    if (this.ph === 1 && at.distanceTo(this.blockPos) < 2) return;
    const rate = this.meltRate(at);
    this.melt = Math.min(1, this.melt - rate * dt);
    if (this.melt <= 0) {
      this.melt = 1;
      this.ph = 1;
      this.carrier = -1;
      this.heartPos.copy(this.blockPos).setY(this.blockPos.y + 0.9);
      announce(g, 'El corazón del glaciar se derritió... y volvió a armarse en la cumbre.', 4, true);
      this.egg.say('fierro', LINES.derretido);
      this.egg.netSync();
      return;
    }
    this.meltSend = (this.meltSend || 0) - dt;
    if (this.meltSend <= 0) {
      this.meltSend = 0.5;
      g.net?.event('ee', { q: 'hielo', mt: +this.melt.toFixed(3), hp: [+this.heartPos.x.toFixed(2), +this.heartPos.y.toFixed(2), +this.heartPos.z.toFixed(2)] });
    }
  }

  // Cuánto se derrite por segundo donde está (negativo: se congela).
  meltRate(p) {
    const w = this.g.world;
    const zone = w.zoneAt(p.x, p.z, p.y);
    if (zone === 'I' || zone === 'Q') return 0;
    const fire = this.fires.some((f) => Math.abs(f.y - p.y) < 3 && Math.hypot(f.x - p.x, f.z - p.z) < FIRE_R);
    if (fire) return MELT * 4;
    if (ZONES[zone]?.outdoor) return -REFREEZE;
    return MELT;
  }

  nearFire() {
    const p = this.ph === 2 ? playerById(this.g, this.carrier)?.pos : this.heartPos;
    return !!p && this.meltRate(p) > MELT;
  }

  updateSpikes(dt, t) {
    const S = this.show;
    let lit = -1;
    if (S) {
      S.t += dt;
      const k = Math.floor(S.t / STEP);
      if (k >= this.seq.length) this.show = null;
      else if (k >= 0 && S.t - k * STEP < STEP * 0.7) {
        lit = this.seq[k];
        if (k !== S.i) {
          S.i = k;
          this.ping(lit);
        }
      }
    }
    const on = this.ph === 3;
    this.spikes.forEach((s, i) => {
      s.flash = Math.max(0, s.flash - dt * 2.5);
      const k = lit === i ? 1 : s.flash;
      s.mat.emissiveIntensity = 0.4 + k * 3 + (on ? Math.sin(t * 2 + i) * 0.1 : 0);
      s.glow.material.opacity = k * 0.8 + (on ? 0.08 : 0);
      s.ring.material.opacity = on ? 0.15 + k * 0.7 : 0;
    });
  }

  line() {
    if (this.ph === 0) return ['Rompé el bloque de hielo de la cumbre (cuchillo, fuego o explosiones)', `${this.chips}/${BLOCK_HITS}`];
    if (this.ph === 1) return ['Agarrá el corazón del glaciar (en la cumbre)', `${Math.round(this.melt * 100)}%`];
    if (this.ph === 2) return [`Llevá el corazón al altar de la gruta del glaciar (cocina → bodega → mazmorras)${this.nearFire() ? ' · ¡se derrite, alejate del fuego!' : ''}`, `${Math.round(this.melt * 100)}%`];
    if (this.ph === 3) return [`Tirales a los penitentes de la gruta en el orden en que se prenden (vuelta ${Math.min(this.round + 1, ROUNDS.length)} de ${ROUNDS.length})`, `${this.inp}/${this.seq.length}`];
    return ['El Penitente', ''];
  }

  // Lo que dice Fierro si le preguntan (null: la pista de arranque, en CastleEgg)
  hint() {
    if (this.ph === 1) return 'El corazón del glaciar quedó suelto en la cumbre. Agárrenlo antes de que se les derrita.';
    if (this.ph === 2) return 'El corazón va al altar de la gruta del glaciar, abajo de todo: por la cocina, la bodega y las mazmorras. Lejos del fuego, que se derrite; en la nieve se vuelve a congelar.';
    if (this.ph === 3) return 'En la gruta, los penitentes: tírenles en el mismo orden en que se prenden. Son tres vueltas, cada una más larga.';
    return null;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// Todo lo que quema en el castillo (braseros, antorchas, fogones, el asador y
// las termas): el corazón se derrite más rápido cerca.
function fireSpots(w) {
  const list = [];
  for (const p of PROPS) {
    if (!['brasero', 'antorcha', 'chimenea', 'asador', 'terma'].includes(p.type)) continue;
    const [x, z] = p.pos;
    list.push({ x, y: w.floorAt(x, z), z });
  }
  for (const f of FIRES) list.push({ x: f.pos[0], y: f.pos[1] - 0.7, z: f.pos[2] });
  return list;
}

const LINES = {
  bloque: 'El corazón del glaciar. A la gruta, abajo de todo... y lejos del fuego.',
  llevar: 'Si se les calienta, salgan a la nieve un rato. Afuera se vuelve a congelar.',
  derretido: 'Se derritió. No importa, el glaciar no se olvida. Vuelvan a la cumbre, que ahí está otra vez.',
  penitentes: 'Los penitentes cantan. Escuchen el orden y tírenles igual. Si se equivocan, se enojan... abríguense.',
  listo: 'El Penitente, el mate del hielo. Quedó en la gruta. Tómenlo con guantes... bueno, no tenemos guantes.',
};
