import * as THREE from 'three';
import { EE } from '../../config/map';
import { flameMaterial } from '../../world/castleFire';
import { ELEM_RGB, glow, ring, isHost, announce, placeOf, deP } from './common';
import { fireflies } from '../../fx/Fireflies';
import { compactGroup } from '../../world/props';
import { lean, sleepHidden } from '../../world/castleLean';

// La vuelta del fuego: "La Salamandra del Pillán".
//  1. La yesca: tres atados de yesca de cardón escondidos por el castillo (el
//     patio, la caballeriza y el palenque). Se juntan entre todos.
//  2. La fragua: se tira la yesca al fuego de la herrería y se le da al
//     fuelle (mantener F). De las llamas sale la Salamandra del Pillán.
//  3. Las almas: la salamandra salta a un brasero y se queda hasta que le den
//     almas (muertos liquidados cerca del brasero). Son tres braseros, cada
//     uno más lejos.
//  4. El yunque: la salamandra se mete en un mate crudo que queda al rojo en
//     el yunque. Se forja con el cuchillo, pegándole justo cuando brilla
//     blanco (cinco golpes buenos; a destiempo no sirve).
// Al terminar, el Pillán vuela a su altar.
// Lo lleva el anfitrión (el cuchillo del invitado llega como aviso).

const SOULS = 6;
const HITS = 5;
const PULSE = 1.5;
const tmpV = new THREE.Vector3();

export default class QuestFuego {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    const C = EE.fuego;
    // 0 yesca, 1 fuelle, 2 almas, 3 yunque, 4 listo
    this.ph = 0;
    this.yesca = [0, 0, 0];
    this.placed = 0;
    this.b = 0;
    this.souls = 0;
    this.hits = 0;
    const w = this.g.world;
    this.forge = new THREE.Vector3(C.fragua[0], w.floorAt(C.fragua[0], C.fragua[1] + 1) + 0.55, C.fragua[1] + 0.9);
    this.braseros = C.braseros.map(([x, z]) => new THREE.Vector3(x, w.floorAt(x, z) + 1.12, z));
    this.anvil = new THREE.Vector3(C.yunque[0], w.floorAt(C.yunque[0], C.yunque[1]) + 0.86, C.yunque[1]);
    this.buildYesca();
    this.buildForge();
    this.buildSalamandra();
    this.buildAnvil();
    this.register();
    this.hitCd = 0;
  }

  get done() {
    return this.ph >= 4;
  }

  need() {
    const n = this.g.net ? this.g.net.net.count : 1;
    return SOULS + (n - 1) * 2;
  }

  // ---------------- lo que se ve ----------------
  buildYesca() {
    const g = this.g;
    const straw = new THREE.MeshStandardMaterial({ color: 0xb8904a, roughness: 1 });
    const tie = new THREE.MeshStandardMaterial({ color: 0x8a1d16, roughness: 0.9 });
    this.yescaObjs = EE.fuego.yesca.map(([x, z], i) => {
      const grp = new THREE.Group();
      grp.position.set(x, g.world.floorAt(x, z), z);
      grp.rotation.y = i * 1.7;
      // un atado de pasto seco y fibra de cardón, con un tiento colorado
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.55, 4), straw);
        m.position.set(Math.cos(a) * 0.05, 0.1, Math.sin(a) * 0.05);
        m.rotation.set(Math.PI / 2 + Math.sin(a) * 0.15, 0, Math.cos(a) * 0.2);
        grp.add(m);
      }
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 12), tie);
      t.rotation.y = Math.PI / 2;
      t.position.y = 0.1;
      grp.add(t);
      // (las nueve pajas, una malla: se agarra el atado entero)
      if (lean()) compactGroup(grp);
      const s = fireflies(g, 0xff8a3a, 0.9, 0.6);
      s.position.y = 0.25;
      grp.add(s);
      grp.userData.glow = s;
      this.root.add(grp);
      return grp;
    });
  }

  // El fuego grande de la fragua (cuando entra la yesca) y el anillo del fuelle.
  buildForge() {
    const grp = new THREE.Group();
    grp.position.copy(this.forge);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2).translate(0, 1.0, 0), flameMaterial());
      p.rotation.y = (k / 3) * Math.PI;
      grp.add(p);
    }
    grp.visible = false;
    grp.scale.setScalar(0.01);
    this.root.add(grp);
    sleepHidden(grp);
    this.flare = grp;
    this.flareK = 0;
    this.forgeGlow = glow(this.g.textures, 0xff6a1a, 3.5, 0);
    this.forgeGlow.position.copy(this.forge).add(tmpV.set(0, 0.6, 0));
    this.root.add(this.forgeGlow);
  }

  // La Salamandra del Pillán: una lagartija de lava con llamitas en el lomo.
  buildSalamandra() {
    const g = this.g;
    const root = new THREE.Group();
    const lava = new THREE.MeshStandardMaterial({ color: 0x2a0a04, roughness: 0.5, emissive: 0xff5a14, emissiveIntensity: 1.8 });
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.4).multiplyScalar(2.2), toneMapped: false });
    const segs = [];
    const R = [0.1, 0.12, 0.13, 0.12, 0.1, 0.08, 0.065, 0.05, 0.038, 0.028];
    R.forEach((r, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), lava);
      s.scale.set(1, 0.7, 1.3);
      s.position.z = -i * 0.13;
      root.add(s);
      segs.push(s);
    });
    // la cabeza chata con los ojos al blanco
    const head = segs[0];
    head.scale.set(1.15, 0.6, 1.5);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), hot);
      e.position.set(sx * 0.06, 0.035, 0.07);
      head.add(e);
    }
    // las patas (cuatro, de a dos)
    const legs = [];
    for (const [i, sx] of [[1, -1], [1, 1], [4, -1], [4, 1]]) {
      const leg = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.16, 5).translate(0, -0.08, 0), lava);
      leg.add(m);
      leg.position.set(sx * 0.1, 0, 0);
      leg.rotation.z = sx * 0.9;
      segs[i].add(leg);
      legs.push(leg);
    }
    // llamitas a lo largo del lomo
    const flames = [];
    for (let i = 1; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.34).translate(0, 0.14, 0), flameMaterial());
      f.position.y = 0.05;
      segs[i].add(f);
      flames.push(f);
    }
    const halo = glow(g.textures, 0xff7a2a, 2.2, 0.55);
    halo.position.y = 0.2;
    root.add(halo);
    root.visible = false;
    sleepHidden(root);
    root.scale.setScalar(1.5);
    root.traverse((o) => {
      o.castShadow = false;
    });
    this.root.add(root);
    this.sal = { root, segs, legs, flames, halo, from: new THREE.Vector3(), to: new THREE.Vector3(), leapT: 1, leapDur: 1.8, spin: 0 };
  }

  // El mate crudo al rojo sobre el yunque, con el anillo que avisa el golpe.
  buildAnvil() {
    const grp = new THREE.Group();
    grp.position.copy(this.anvil);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a1206, roughness: 0.6, emissive: 0xff3a0a, emissiveIntensity: 0.5 });
    const gourd = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0.01], [0.1, 0.05], [0.1, 0.1], [0.08, 0.15], [0.055, 0.19], [0.06, 0.21]].map(([r, y]) => new THREE.Vector2(r, y)), 16), mat);
    gourd.rotation.z = Math.PI / 2;
    gourd.scale.setScalar(1.5);
    gourd.position.set(-0.14, 0.15, 0);
    grp.add(gourd);
    const r = ring(0.5, 0xffe0a0, 0.06);
    r.position.y = 0.02;
    grp.add(r);
    const s = glow(this.g.textures, 0xffb060, 1.4, 0);
    s.position.y = 0.12;
    grp.add(s);
    grp.visible = false;
    this.root.add(grp);
    sleepHidden(grp);
    this.anvilObj = { grp, mat, ring: r, glow: s, flash: 0 };
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    this.yescaObjs.forEach((o, i) => {
      I.add({
        kind: 'ee',
        pos: o.position.clone().setY(o.position.y + 0.6),
        radius: 1.8,
        prompt: () => (this.yesca[i] || this.ph > 0 ? null : { text: 'agarrar la yesca de cardón', noCost: true }),
        cost: () => 0,
        use: () => this.pickYesca(i),
      });
    });
    // la fragua: se tira la yesca
    I.add({
      kind: 'ee',
      pos: this.forge.clone().setY(this.forge.y + 0.6),
      radius: 2.6,
      wide: true,
      prompt: () => {
        if (this.ph !== 0) return null;
        const n = this.yesca.filter(Boolean).length;
        if (!n) return null;
        if (n < 3) return { text: `La fragua quiere más yesca: ${n} de 3`, noCost: true, info: true };
        return { text: 'tirar la yesca a la fragua', noCost: true };
      },
      cost: () => 0,
      use: () => this.placeYesca(),
    });
    // el fuelle
    const [fx, fz] = EE.fuego.fuelle;
    I.add({
      kind: 'ee',
      holdTime: 2.4,
      pos: new THREE.Vector3(fx, g.world.floorAt(fx, fz) + 1, fz),
      radius: 1.8,
      prompt: () => (this.ph === 1 ? { text: 'darle al fuelle', noCost: true, hold: true } : null),
      cost: () => 0,
      use: () => this.blow(),
    });
  }

  // (anfitrión)
  pickYesca(i) {
    if (!isHost(this.g) || this.yesca[i] || this.ph > 0) return false;
    this.yesca[i] = 1;
    const n = this.yesca.filter(Boolean).length;
    this.g.fx.sparkle(this.yescaObjs[i].position, ELEM_RGB.fuego, 14, 0.5);
    announce(this.g, `Yesca de cardón: ${n} de 3.`, 3);
    if (n === 1) this.egg.say('fierro', LINES.yesca);
    this.egg.netSync();
    return true;
  }

  placeYesca() {
    if (!isHost(this.g) || this.ph !== 0 || this.yesca.some((v) => !v)) return false;
    this.ph = 1;
    this.placed = 1;
    this.g.fx.fire(this.forge, 0.5, 20);
    this.egg.netSync();
    return true;
  }

  blow() {
    if (!isHost(this.g) || this.ph !== 1) return false;
    this.ph = 2;
    this.b = 0;
    this.souls = 0;
    this.egg.say('fierro', LINES.salamandra);
    announce(this.g, '', 4, true);
    this.egg.netSync();
    this.startLeap(this.forge, this.braseros[0]);
    return true;
  }

  // ---------------- ganchos ----------------
  // (anfitrión) un muerto cerca del brasero de la salamandra le da el alma
  onKill(z) {
    if (this.ph !== 2 || this.sal.leapT < 1) return;
    const B = this.braseros[this.b];
    const p = z.pos;
    if (Math.abs(p.y + 1 - B.y) > 2.5 || Math.hypot(p.x - B.x, p.z - B.z) > 7) return;
    this.soulFx(p);
    this.g.net?.event('ee', { q: 'fuego', soul: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] });
    this.souls++;
    if (this.souls < this.need()) {
      if (this.souls % 2 === 0) this.egg.netSync();
      return;
    }
    // al siguiente brasero (o de vuelta al yunque)
    const from = B.clone();
    this.souls = 0;
    if (this.b < this.braseros.length - 1) {
      this.b++;
      announce(this.g, `La salamandra saltó a otro brasero (${this.b + 1} de ${this.braseros.length}).`, 3);
      this.startLeap(from, this.braseros[this.b]);
    } else {
      this.ph = 3;
      this.hits = 0;
      announce(this.g, '', 5, true);
      this.egg.say('fierro', LINES.yunque);
      this.startLeap(from, this.anvil);
    }
    this.egg.netSync();
  }

  soulFx(p) {
    const B = this.braseros[this.b];
    this.g.fx.soul(tmpV.set(p.x, p.y, p.z), B.clone().setY(B.y + 0.2));
  }

  // El cuchillo contra el mate del yunque: bueno si está al blanco.
  onKnife(fwd) {
    const g = this.g;
    if (this.ph !== 3 || this.sal.leapT < 1 || this.hitCd > 0) return false;
    const cam = g.camera.position;
    const d = tmpV.subVectors(this.anvil, cam);
    const dist = d.length();
    if (dist > 2.6 || d.normalize().dot(fwd) < 0.55) return false;
    this.hitCd = 0.35;
    const ok = this.pulse() > 0.8;
    this.strikeFx(ok);
    if (isHost(g)) this.hit(ok);
    else g.net.net.send({ t: 'pee', a: 'q', q: 'fuego', op: 'hit', ok: ok ? 1 : 0 });
    return true;
  }

  // El brillo del mate (0 a 1): sube de a poco y pega un fogonazo blanco.
  pulse() {
    const k = (this.g.time % PULSE) / PULSE;
    return Math.pow(Math.max(0, Math.sin(k * Math.PI)), 6);
  }

  strikeFx(ok) {
    const g = this.g;
    const a = this.anvilObj;
    const p = this.anvil.clone().setY(this.anvil.y + 0.12);
    const au = g.audio;
    if (au.ctx) {
      const o = au.out({ pos: p, reverb: 0.4, gain: 1 });
      if (ok) {
        au.tone(o, { dur: 0.9, freq: 1320, type: 'triangle', gain: 0.35 });
        au.tone(o, { dur: 0.7, freq: 2210, type: 'sine', gain: 0.15 });
        au.noise(o, { dur: 0.08, type: 'highpass', freq: 3000, gain: 0.6 });
      } else {
        au.tone(o, { dur: 0.2, freq: 180, type: 'square', gain: 0.25 });
        au.noise(o, { dur: 0.12, type: 'lowpass', freq: 800, gain: 0.4 });
      }
    }
    g.fx.sparks(p, ok ? 1.4 : 0.4, tmpV.set(0, 1, 0), ok ? [1, 0.85, 0.5] : [0.7, 0.3, 0.1]);
    if (ok) {
      a.flash = 1;
      g.fx.addShake(0.12);
    }
  }

  // (anfitrión)
  hit(ok) {
    if (this.ph !== 3) return;
    if (!ok) {
      announce(this.g, 'A destiempo. El mate tiene que estar al blanco.', 2);
      return;
    }
    this.hits++;
    if (this.hits < HITS) {
      announce(this.g, `Golpe bueno: ${this.hits} de ${HITS}.`, 1.6);
      this.egg.netSync();
      return;
    }
    this.ph = 4;
    this.egg.netSync();
    this.finish();
  }

  // El Pillán terminado vuela del yunque a su altar.
  finish() {
    const g = this.g;
    const [ax, az] = EE.altars.fuego;
    const to = new THREE.Vector3(ax, g.world.floorAt(ax, az) + 2.2, az);
    this.flyer = { from: this.anvil.clone(), to, t: 0 };
    this.egg.say('fierro', LINES.listo);
  }

  onGuest(m, from) {
    if (m.op === 'hit') this.hit(!!m.ok);
    void from;
  }

  // ---------------- red ----------------
  state() {
    return { ph: this.ph, y: this.yesca, b: this.b, s: this.souls, h: this.hits };
  }

  apply(s) {
    if (s.soul) {
      this.soulFx({ x: s.soul[0], y: s.soul[1], z: s.soul[2] });
      return;
    }
    const was = this.ph;
    const wasB = this.b;
    this.yesca = s.y || this.yesca;
    this.b = s.b | 0;
    this.souls = s.s | 0;
    this.hits = s.h | 0;
    this.ph = s.ph | 0;
    if (was !== this.ph || wasB !== this.b) {
      if (this.ph === 2 && was <= 1) this.startLeap(this.forge, this.braseros[this.b]);
      else if (this.ph === 2 && wasB !== this.b) this.startLeap(this.braseros[wasB], this.braseros[this.b]);
      else if (this.ph === 3 && was === 2) this.startLeap(this.braseros[this.braseros.length - 1], this.anvil);
      else if (this.ph === 4 && was === 3) this.finish();
      else if (this.ph >= 2) this.placeSal();
    }
  }

  // ---------------- la salamandra ----------------
  startLeap(from, to) {
    const S = this.sal;
    S.from.copy(from);
    S.to.copy(to);
    S.leapT = 0;
    S.leapDur = 0.8 + Math.min(2.4, from.distanceTo(to) / 18);
    S.root.visible = true;
    this.g.fx.fire(from, 0.4, 14);
    this.flareK = Math.max(this.flareK, from.distanceTo(this.forge) < 1 ? 1 : 0);
  }

  // Donde tiene que estar según el paso (el que entra tarde).
  placeSal() {
    const S = this.sal;
    S.leapT = 1;
    S.root.visible = this.ph === 2 || this.ph === 3;
    S.to.copy(this.ph === 3 ? this.anvil : this.braseros[this.b]);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.hitCd = Math.max(0, this.hitCd - dt);
    // la yesca que falta
    this.yescaObjs.forEach((o, i) => {
      o.visible = !this.yesca[i] && this.ph === 0;
      if (o.visible) o.userData.glow.material.opacity = 0.25 + Math.sin(t * 3 + i) * 0.12;
    });
    // la fragua: brilla con la yesca y revienta con el fuelle
    this.flareK = Math.max(0, this.flareK - dt * 0.35);
    const fk = this.flareK;
    this.flare.visible = fk > 0.01;
    this.flare.scale.setScalar(0.3 + fk * 1.1);
    const want = this.ph === 1 ? 0.35 + Math.sin(t * 4) * 0.1 : fk * 0.8;
    this.forgeGlow.material.opacity += (want - this.forgeGlow.material.opacity) * Math.min(1, dt * 4);
    if (this.ph === 1 && Math.random() < dt * 6) g.fx.fire(this.forge, 0.3, 2);
    this.updateSal(dt, t);
    // el mate del yunque
    const A = this.anvilObj;
    A.grp.visible = this.ph === 3 && this.sal.leapT >= 1;
    if (A.grp.visible) {
      const p = this.pulse();
      A.flash = Math.max(0, A.flash - dt * 3);
      A.mat.emissiveIntensity = 0.6 + p * 4 + A.flash * 3;
      A.mat.emissive.setRGB(1, 0.25 + p * 0.7, 0.05 + p * 0.6);
      A.glow.material.opacity = 0.2 + p * 0.8;
      A.ring.material.opacity = p * 0.9;
      A.ring.scale.setScalar(1 + (1 - p) * 0.6);
    }
    // el Pillán volando a su altar
    const F = this.flyer;
    if (F) {
      F.t += dt / 1.8;
      const k = Math.min(1, F.t);
      const p = tmpV.lerpVectors(F.from, F.to, k);
      p.y += Math.sin(k * Math.PI) * 5;
      g.fx.fire(p, 0.2, 3);
      g.fx.sparkle(p, ELEM_RGB.fuego, 2, 0.2);
      if (k >= 1) {
        this.flyer = null;
        if (isHost(g)) this.egg.altares.unlock('fuego');
        this.egg.onMate?.('fuego');
      }
    }
  }

  updateSal(dt, t) {
    const S = this.sal;
    if (!S.root.visible) return;
    const g = this.g;
    let pos;
    let moving = false;
    if (S.leapT < 1) {
      S.leapT = Math.min(1, S.leapT + dt / S.leapDur);
      const k = S.leapT;
      pos = tmpV.lerpVectors(S.from, S.to, k);
      pos.y += Math.sin(k * Math.PI) * (2 + S.from.distanceTo(S.to) * 0.18);
      moving = true;
      // la estela de fuego
      g.fx.fire(pos, 0.12, 3);
      const dx = S.to.x - S.from.x;
      const dz = S.to.z - S.from.z;
      S.root.rotation.y = Math.atan2(dx, dz);
      S.root.rotation.x = -Math.cos(k * Math.PI) * 0.6;
      if (S.leapT >= 1) {
        g.fx.explosion(S.to.clone(), 1.2, ELEM_RGB.fuego);
        g.fx.fire(S.to, 0.3, 16);
        S.root.visible = this.ph === 2 || this.ph === 3;
      }
    } else {
      // sentada en el fuego: da vueltitas arriba de las brasas
      S.spin += dt * 1.4;
      const r = this.ph === 3 ? 0 : 0.12;
      pos = tmpV.copy(S.to).add(new THREE.Vector3(Math.cos(S.spin) * r, 0.02, Math.sin(S.spin) * r));
      S.root.rotation.y = this.ph === 3 ? t * 0.5 : -S.spin;
      S.root.rotation.x = 0;
      if (this.ph === 3) S.root.visible = false;
      if (Math.random() < dt * 4) g.fx.fire(pos, 0.15, 1);
    }
    S.root.position.copy(pos);
    // el cuerpo ondula y las patas reman
    const w = moving ? 16 : 6;
    S.segs.forEach((s, i) => {
      if (i === 0) return;
      s.position.x = Math.sin(t * w - i * 0.7) * 0.03 * i * (moving ? 0.5 : 1);
    });
    S.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(t * w * 1.3 + i * Math.PI * 0.5) * 0.6;
    });
    S.halo.material.opacity = 0.45 + Math.sin(t * 9) * 0.1;
  }

  // Lo que dice el objetivo.
  // (cada paso dice qué hacer, dónde y, si hace falta, por dónde)
  line() {
    const n = this.yesca.filter(Boolean).length;
    if (this.ph === 0) return [n < 3 ? 'Juntá la yesca de cardón (el patio, la caballeriza y el palenque)' : 'Tirá la yesca a la fragua de la herrería', `${n}/3`];
    if (this.ph === 1) return ['Dale al fuelle de la fragua, en la herrería (mantené F)', ''];
    if (this.ph === 2) return [`Matá muertos al lado del brasero de la salamandra, en ${this.brasero()}`, `${this.souls}/${this.need()}`];
    if (this.ph === 3) return ['Forjá el mate en el yunque de la herrería: cuchillazo cuando brille blanco', `${this.hits}/${HITS}`];
    return ['El Pillán', ''];
  }

  brasero() {
    const B = this.braseros[Math.min(this.b, this.braseros.length - 1)];
    return (B && placeOf(this.g, B)) || 'un brasero';
  }

  // Lo que dice Fierro si le preguntan (null: la pista de arranque, en CastleEgg)
  hint() {
    if (this.ph === 0) return this.yesca.every(Boolean) ? 'Ya tienen los tres atados de yesca. A la fragua de la herrería con ellos, y después al fuelle.' : null;
    if (this.ph === 1) return 'La yesca prendió en la fragua. Ahora el fuelle, ahí en la herrería: denle sin soltar hasta que salga la salamandra.';
    if (this.ph === 2) return `La salamandra está en el brasero ${deP(this.brasero())}. Come almas: liquiden muertos bien al lado del brasero.`;
    if (this.ph === 3) return 'El mate crudo está al rojo en el yunque de la herrería. Péguenle con el cuchillo justo cuando brille blanco, ni antes ni después.';
    return null;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const LINES = {
  yesca: 'Yesca de cardón. La Salamandra del Pillán no come cualquier cosa. Junten las tres y tírenlas a la fragua.',
  salamandra: '¡Ahí está! La Salamandra del Pillán. Síganla, paisanos, que donde se sienta hay que darle de comer almas.',
  yunque: 'Se metió en el mate crudo. Ahora a forjarlo, con el cuchillo, cuando brille blanco. Ni antes ni después.',
  listo: 'El Pillán, el mate del fuego. Lo dejé en su altar de la herrería. El que lo agarre, que lo cuide.',
};
