import * as THREE from 'three';
import './potenciadorModels';
import { WEAPONS } from '../config/weapons';

// Los potenciadores de mano de la torre y del penal, en uso:
//  · Admin Mate (la torre): cada tiro de los Mate Eagle deja una estela de
//    oro, un fogonazo dorado y sacude la pantalla. El daño es el de un tiro
//    común (Weapons.hitscan): atraviesa a todos los de la línea.
//  · Farol de las Ánimas (el penal): mantené el clic y a los muertos que
//    tenés adelante se les sale el alma, en espiral, hasta el farol. Cuando
//    se vacían caen y su ánima entra al farol; a los jefes les va sacando de a
//    poco. Al apagarse, el farol revienta y suelta todas las almas juntas.
// Weapons (weapons/Weapons.js) le pasa el gatillo (input) y cada cuadro
// (update). El daño va por zombies.damage (el invitado se lo pasa al
// anfitrión); los demás ven las almas y los tiros de oro por la red ('pot'),
// sin daño.

// las almas: celeste que tira a verde (el corazón del farol es verde)
const SOUL = [0.58, 1, 0.82];
const GOLD = [1, 0.82, 0.35];
const MAX_MOTES = 360;
const MAX_GHOSTS = 28;
// el grabado del alma que sale ('alma', core/weaponSfx.js): a los cuántos
// segundos suena más fuerte (ahí entra al farol)
const ALMA_PEAK = 1.1;
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const hitTmp = {};

const ease = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
// el pecho de un muerto (los perros, más abajo)
const chestOf = (z, out) => out.set(z.pos.x, (z.pos.y || 0) + (z.dog ? 0.55 : 1.2) * (z.scale || 1), z.pos.z);
// los que no se vacían de golpe: se les va sacando vida de a poco
const bossLike = (z) => z.boss || z.crow || z.pombero || z.mandinga;

// El ánima: una silueta de fantasma con los brazos en alto, pintada a mano.
function ghostTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const x = c.getContext('2d');
  x.shadowColor = 'rgba(120,220,255,1)';
  x.shadowBlur = 18;
  const gr = x.createLinearGradient(0, 20, 0, 250);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(170,235,255,0.85)');
  gr.addColorStop(1, 'rgba(90,200,255,0)');
  x.fillStyle = gr;
  x.beginPath();
  x.arc(64, 52, 22, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(40, 82);
  // brazos para arriba, desesperados
  x.quadraticCurveTo(18, 60, 14, 26);
  x.quadraticCurveTo(26, 50, 46, 70);
  x.lineTo(82, 70);
  x.quadraticCurveTo(102, 50, 114, 26);
  x.quadraticCurveTo(110, 60, 88, 82);
  // el cuerpo que se afina en una cola ondulada
  x.quadraticCurveTo(96, 150, 80, 200);
  x.quadraticCurveTo(70, 228, 76, 250);
  x.quadraticCurveTo(58, 226, 56, 200);
  x.quadraticCurveTo(34, 150, 40, 82);
  x.fill();
  // ojos y boca: agujeros
  x.globalCompositeOperation = 'destination-out';
  x.shadowBlur = 4;
  x.shadowColor = 'rgba(0,0,0,1)';
  for (const ex of [55, 73]) {
    x.beginPath();
    x.ellipse(ex, 50, 4.5, 6.5, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.ellipse(64, 66, 4, 6, 0, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class Potenciadores {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    // los muertos que se están vaciando: z -> { k, acc, moteT, seen }
    this.drain = new Map();
    // lo que dibuja un farol de otro jugador: { z, to, until }
    this.links = [];
    this.lamp = new THREE.Vector3();
    this.holding = false;
    this.inputT = -1;
    this.scanT = 0;
    this.shareT = 0;
    this.humT = 0;
    this.lightT = 0;
    this.tickT = 0;
    this.flare = 0;
    this.souls = 0;
    this.had = null;
    this.lastShot = 0;
    this.buildMotes();
    this.buildGhosts();
    // la luz verde del corazón del farol, en la escena de la mano: siempre está
    // (apagada), así agarrar el farol no recompila los materiales de la mano
    this.farolLight = new THREE.PointLight(0x4aff78, 0, 0.5, 2);
    weapons.vmScene.add(this.farolLight);
    // cómo se hamaca el farol colgado de la cadena (ángulos y velocidades)
    this.pend = { x: 0, z: 0, vx: 0, vz: 0, vel: new THREE.Vector3(), ready: false };
  }

  // ---------------- lo compartido ----------------
  // Las lucecitas de las almas: un solo Points con todas.
  buildMotes() {
    const geo = new THREE.BufferGeometry();
    this.motePos = new Float32Array(MAX_MOTES * 3);
    this.moteCol = new Float32Array(MAX_MOTES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.moteCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({ size: 0.08, map: this.g.textures.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.pts = new THREE.Points(geo, mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 3;
    this.motes = [];
    this.moteFree = [];
    for (let i = 0; i < MAX_MOTES; i++) this.moteFree.push({ a: new THREE.Vector3(), c: new THREE.Vector3(), to: null, t: 0, dur: 1, r: 0, ph: 0, spin: 0, col: SOUL, out: false });
  }

  buildGhosts() {
    const tex = ghostTexture();
    this.ghosts = [];
    this.ghostFree = [];
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xc8f6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false;
      s.renderOrder = 3;
      this.ghostFree.push({ s, from: new THREE.Vector3(), c: new THREE.Vector3(), to: null, t: 0, free: false });
    }
  }

  attach() {
    const g = this.g;
    if (this.pts.parent !== g.scene) {
      g.scene.add(this.pts);
      for (const x of [...this.ghostFree, ...this.ghosts]) g.scene.add(x.s);
    }
  }

  // Una lucecita que va de `from` a `to` (un Vector3 que se puede mover) en
  // espiral, por arriba. out: sale del centro para afuera (la explosión).
  mote(from, to, { dur = 0.32 + Math.random() * 0.22, r = 0.3 + Math.random() * 0.35, col = SOUL, arc = 0.5 + Math.random() * 0.7, out = false } = {}) {
    const m = this.moteFree.pop();
    if (!m) return;
    m.a.copy(from);
    m.to = to;
    m.t = 0;
    m.dur = dur;
    m.r = r;
    m.ph = Math.random() * Math.PI * 2;
    m.spin = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 1.5);
    m.col = col;
    m.out = out;
    m.c.copy(from).lerp(to, 0.45);
    m.c.y += arc;
    this.motes.push(m);
  }

  // Un ánima que sale del cuerpo. to: el farol (entra) o null (se libera y sube).
  ghost(from, to) {
    const x = this.ghostFree.pop();
    if (!x) return;
    x.from.copy(from);
    x.to = to;
    x.t = 0;
    x.free = !to;
    x.s.visible = true;
    x.s.material.opacity = 0;
    this.ghosts.push(x);
  }

  updateMotes(dt) {
    const g = this.g;
    let n = 0;
    const P = this.motePos;
    const C = this.moteCol;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      // bezier cuadrática y una espiral que se cierra en las puntas
      const u = 1 - k;
      const b = m.to;
      tmpV.set(u * u * m.a.x + 2 * u * k * m.c.x + k * k * b.x, u * u * m.a.y + 2 * u * k * m.c.y + k * k * b.y, u * u * m.a.z + 2 * u * k * m.c.z + k * k * b.z);
      tmpV2.subVectors(b, m.a);
      tmpU.crossVectors(tmpV2, UP);
      if (tmpU.lengthSq() < 1e-6) tmpU.set(1, 0, 0);
      tmpU.normalize();
      tmpW.crossVectors(tmpU, tmpV2).normalize();
      const a = m.ph + m.spin * k * Math.PI * 2;
      const rr = m.r * Math.sin(k * Math.PI);
      tmpV.addScaledVector(tmpU, Math.cos(a) * rr).addScaledVector(tmpW, Math.sin(a) * rr);
      if (k >= 1) {
        this.motes.splice(i, 1);
        this.moteFree.push(m);
        continue;
      }
      if (n >= MAX_MOTES) continue;
      P[n * 3] = tmpV.x;
      P[n * 3 + 1] = tmpV.y;
      P[n * 3 + 2] = tmpV.z;
      // entra de a poco y llega blanca
      // (y cerca de la cámara se apaga: el farol propio está en la cara)
      const fade = Math.min(1, k * 6) * (m.out ? 1 - k * 0.8 : 0.55 + k * 0.6) * this.nearFade(tmpV);
      const w = m.out ? 0 : k * k * 0.5;
      C[n * 3] = (m.col[0] + w) * fade;
      C[n * 3 + 1] = (m.col[1] + w) * fade;
      C[n * 3 + 2] = (m.col[2] + w) * fade;
      n++;
      // la estela
      if (Math.random() < 0.12) g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, 0, 0, 0, { color: m.col, size: 0.07, size1: 0, life: 0.3 });
    }
    const geo = this.pts.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  // Lo que pasa pegado a la cámara se desvanece (si no, tapa todo).
  nearFade(p) {
    const d = p.distanceTo(this.g.camera.position);
    return Math.max(0, Math.min(1, (d - 1.2) / 2.5));
  }

  updateGhosts(dt) {
    const g = this.g;
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const x = this.ghosts[i];
      x.t += dt;
      const s = x.s;
      let done = false;
      if (x.free) {
        // liberada: sube ondulando y se apaga
        const k = x.t / 1.4;
        s.position.set(x.from.x + Math.sin(x.t * 5) * 0.25, x.from.y + 0.3 + ease(k) * 3.2, x.from.z);
        const sc = 1 + k * 0.5;
        s.scale.set(0.8 * sc, 1.6 * sc, 1);
        s.material.opacity = Math.min(1, x.t * 5) * (1 - k) * 0.8 * this.nearFade(s.position);
        done = k >= 1;
      } else if (x.t < 0.35) {
        // sale del cuerpo
        const e = ease(x.t / 0.35);
        s.position.set(x.from.x, x.from.y + e * 1.1, x.from.z);
        s.scale.set(0.45 + 0.4 * e, 0.9 + 0.8 * e, 1);
        s.material.opacity = e * 0.8 * this.nearFade(s.position);
        if (x.t < 0.2 && Math.random() < 0.5) g.fx.sparkle(tmpV.set(x.from.x, x.from.y + e, x.from.z), SOUL, 2, 0.5);
        if (x.t + dt >= 0.35) x.c.set(x.from.x, x.from.y + 1.1, x.from.z);
      } else {
        // y entra al farol en espiral, achicándose
        const k = Math.min(1, (x.t - 0.35) / 0.5);
        const e = k * k;
        const b = x.to;
        tmpV2.set(x.c.x, x.c.y + 1.4, x.c.z).lerp(b, 0.3);
        const u = 1 - e;
        s.position.set(u * u * x.c.x + 2 * u * e * tmpV2.x + e * e * b.x, u * u * x.c.y + 2 * u * e * tmpV2.y + e * e * b.y, u * u * x.c.z + 2 * u * e * tmpV2.z + e * e * b.z);
        const a = x.t * 14;
        s.position.x += Math.cos(a) * 0.35 * (1 - k);
        s.position.z += Math.sin(a) * 0.35 * (1 - k);
        const sc = 1 - 0.85 * k;
        s.scale.set(0.85 * sc, 1.7 * sc, 1);
        s.material.opacity = 0.8 * (1 - k * 0.6) * this.nearFade(s.position);
        if (Math.random() < 0.6) g.fx.add.spawn(s.position.x, s.position.y, s.position.z, 0, 0, 0, { color: SOUL, size: 0.12, size1: 0, life: 0.35 });
        if (k >= 1) {
          done = true;
          this.flare = 1;
          g.fx.sparkle(b, SOUL, 6, 0.25);
        }
      }
      if (done) {
        s.visible = false;
        this.ghosts.splice(i, 1);
        this.ghostFree.push(x);
      }
    }
  }

  // ---------------- el gatillo ----------------
  // true si el arma temporal en la mano es de estas y ya se ocupó del clic.
  input(input, st, p) {
    if (st.kind !== 'farol') return false;
    this.holding = !!input.mouse.left && p.alive && !p.downed;
    this.inputT = this.g.time;
    return true;
  }

  update(dt) {
    const g = this.g;
    const w = this.w;
    this.attach();
    const id = w.temp?.id || null;
    // se apagó el farol en la mano: revienta
    if (this.had === 'farol' && id !== 'farol') this.burst();
    this.had = id;
    if (g.time - this.inputT > 0.1) this.holding = false;
    if (id === 'farol') this.updateFarol(dt, w.stats);
    else if (this.drain.size) this.drain.clear();
    if (id === 'adminmate') this.updateAdmin();
    this.updateLinks(dt);
    this.updateMotes(dt);
    this.updateGhosts(dt);
    this.flare = Math.max(0, this.flare - dt * 2.2);
    this.animateFarol(dt);
  }

  // ---------------- Farol de las Ánimas ----------------
  updateFarol(dt, st) {
    const g = this.g;
    const D = st.drain;
    this.w.muzzleWorld(this.lamp);
    if (!this.holding) {
      this.drain.clear();
      this.almaCut();
      return;
    }
    const eye = g.camera.position;
    const fwd = tmpV2.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.1;
      this.scan(eye, fwd.clone(), st.range, D);
    }
    this.tickT -= dt;
    const tick = this.tickT <= 0;
    if (tick) this.tickT = 0.25;
    const host = !g.net?.guest;
    for (const [z, e] of this.drain) {
      if (!z.active || z.dead) {
        this.drain.delete(z);
        continue;
      }
      // el alma sale en lucecitas hacia el farol
      e.moteT -= dt;
      while (e.moteT <= 0) {
        e.moteT += 0.03;
        chestOf(z, tmpV);
        tmpV.x += (Math.random() - 0.5) * 0.5 * (z.scale || 1);
        tmpV.y += (Math.random() - 0.6) * 0.7 * (z.scale || 1);
        tmpV.z += (Math.random() - 0.5) * 0.5 * (z.scale || 1);
        this.mote(tmpV, this.lamp);
      }
      if (Math.random() < dt * 8) g.fx.sparkle(chestOf(z, tmpV), SOUL, 2, 0.6 * (z.scale || 1));
      // (el farol tiembla mientras tira de las almas)
      this.pend.vx += (Math.random() - 0.5) * dt * 4;
      this.pend.vz += (Math.random() - 0.5) * dt * 4;
      // lo frena mientras se vacía (en línea lo hace el anfitrión)
      if (host) z.slowT = Math.max(z.slowT || 0, 0.3);
      if (bossLike(z)) {
        e.acc += D.boss * dt;
        if (tick) {
          this.hurtBoss(z, e.acc);
          e.acc = 0;
        }
        // (al jefe no se le termina de salir: el alma suena una y otra vez)
        e.sndT -= dt;
        if (e.sndT <= 0) {
          e.sndT = 1.8;
          this.almaStart(0.9);
        }
      } else {
        const T = D.time * (z.dog || z.crawler ? 0.6 : 1);
        if (!e.snd) {
          e.snd = true;
          this.almaStart(T * (1 - e.k));
        }
        e.k += dt / T;
        if (e.k >= 1) this.reap(z);
      }
    }
    // que lo vean los demás
    this.shareT -= dt;
    if (g.net && this.shareT <= 0) {
      this.shareT = 0.12;
      const ids = [...this.drain.keys()].map((z) => (z === g.zombies.boss ? 0xffff : z.id & 0xffff));
      // (ojo: `t` y `e` son del mensaje de red, no se pueden usar de campo)
      if (ids.length) g.net.share('pot', { f: 1, o: this.r(this.lamp), zs: ids });
    }
    // el zumbido de las almas y la luz verde del farol
    this.humT -= dt;
    if (this.humT <= 0) {
      this.humT = 0.42;
      this.hum(this.lamp, this.drain.size);
    }
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.12;
      g.fx.flash(this.lamp, 0x5aff82, this.drain.size ? 5 : 2.5, 0.16, 9);
    }
  }

  // Los que tiene adelante (en el cono y a la vista), del más cercano al más lejos.
  scan(eye, fwd, range, D) {
    const g = this.g;
    const cands = [];
    for (const { z } of g.zombies.inRadius(eye, range + 1)) {
      if (z.dead || !z.active || z.state === 'rise') continue;
      chestOf(z, tmpV);
      tmpU.subVectors(tmpV, eye);
      const d = tmpU.length();
      if (d < 0.01 || d > range) continue;
      tmpU.divideScalar(d);
      if (tmpU.dot(fwd) < D.cos && d > 2.2) continue;
      if (g.world.raycast(eye, tmpU, d, hitTmp) < d - 0.6) continue;
      cands.push({ z, d });
    }
    cands.sort((a, b) => a.d - b.d);
    const keep = new Set(cands.slice(0, D.targets).map((c) => c.z));
    for (const z of [...this.drain.keys()]) if (!keep.has(z)) this.drain.delete(z);
    for (const z of keep) if (!this.drain.has(z)) this.drain.set(z, { k: 0, acc: 0, moteT: Math.random() * 0.03, snd: false, sndT: 0 });
  }

  // Vaciado: cae y su ánima entra al farol.
  reap(z) {
    const g = this.g;
    this.drain.delete(z);
    chestOf(z, tmpV);
    const at = tmpV.clone();
    const dir = new THREE.Vector3().subVectors(at, this.lamp).setY(0).normalize();
    g.zombies.damage(z, 1e9, { type: 'souls', zone: 'torso', point: at.clone(), dir });
    // el cuerpo queda gris ceniza (lo pinta el que manda a los muertos)
    if (!g.net?.guest && z.dead) g.zombies.paint(z, 0x5c6266);
    this.ghost(at.clone().setY(at.y - 0.4), this.lamp);
    this.souls++;
    this.flare = Math.max(this.flare, 0.6);
    this.pend.vx += (Math.random() - 0.5) * 0.9;
    // (con el grabado, el alma ya viene sonando desde que empezó a salir)
    if (!this.g.audio?.guns?.has('alma')) this.wail(at);
    g.hud.hitmarker(false);
    if (g.net) g.net.share('pot', { k: this.r(at), o: this.r(this.lamp) });
  }

  // A un jefe le saca una parte de la vida (de invitado: el anfitrión sabe cuánta tiene).
  hurtBoss(z, frac) {
    const g = this.g;
    if (g.net?.guest) {
      if (z === g.zombies.boss) g.net.share('pot', { b: +frac.toFixed(4) });
      return;
    }
    g.zombies.damage(z, (z.maxHp || 0) * frac, { type: 'souls', zone: 'torso', point: chestOf(z, new THREE.Vector3()), noPoints: false, pup: WEAPONS.farol.bossMult });
  }

  // Se apagó: revienta y suelta todas las almas, que voltean a los de alrededor.
  burst(pos = null, ghost = false) {
    const g = this.g;
    const at = pos ? pos.clone() : g.player.pos.clone().setY((g.player.pos.y || 0) + 1.1);
    const R = 9;
    // (a la altura de los pies y para afuera: si no, tapa la pantalla del que lo tiene)
    const feet = tmpV2.copy(at).setY(at.y - 0.9);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      const v = 11 + Math.random() * 3;
      g.fx.add.spawn(feet.x, feet.y + Math.random() * 0.3, feet.z, Math.cos(a) * v, 0.4, Math.sin(a) * v, { color: SOUL, size: 0.16, size1: 0.02, life: 0.55, drag: 2 });
    }
    g.fx.flash(at, 0x5aff82, 18, 0.5, 22);
    g.audio.explosion?.(at, 1);
    this.chord(at);
    // el anillo de almas que sale para afuera
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const to = new THREE.Vector3(at.x + Math.cos(a) * R, at.y + (Math.random() - 0.3) * 1.5, at.z + Math.sin(a) * R);
      this.mote(at, to, { dur: 0.45 + Math.random() * 0.25, r: 0.4, arc: 0.3 + Math.random(), out: true });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      this.ghost(tmpV.set(at.x + Math.cos(a) * 3, at.y - 0.6, at.z + Math.sin(a) * 3), null);
    }
    if (ghost) return;
    g.fx.addShake(0.6);
    this.pend.vx += 3;
    this.pend.vz -= 1.5;
    this.drain.clear();
    this.souls = 0;
    const host = !g.net?.guest;
    for (const { z } of g.zombies.inRadius(at, R)) {
      if (z.dead || !z.active) continue;
      const p = chestOf(z, new THREE.Vector3());
      const dir = new THREE.Vector3().subVectors(p, at).setY(0.3).normalize();
      if (bossLike(z)) this.hurtBoss(z, 0.04);
      else {
        g.zombies.damage(z, 1e9, { type: 'souls', zone: 'torso', point: p, dir });
        if (host && z.dead) g.zombies.paint(z, 0x5c6266);
        this.ghost(p, null);
      }
    }
    if (g.net) g.net.share('pot', { u: 1, o: this.r(at) });
  }

  // El farol en la mano: se hamaca colgado de la cadena (la inercia del que
  // camina, gira y mira), el corazón verde late y se prende con cada alma que
  // entra, las ánimas giran adentro del vidrio y su luz alumbra la mano.
  animateFarol(dt) {
    const g = this.g;
    const m = this.w.model?.pot;
    const Lt = this.farolLight;
    if (!m?.aura || !m.swing || !this.w.holder.visible) {
      Lt.intensity = 0;
      this.pend.ready = false;
      return;
    }
    const t = g.time;
    const on = this.holding ? 1 : 0;
    // el péndulo: lo que acelera el jugador (en lo que ve la cámara) lo deja atrás
    const P = this.pend;
    const cam = g.camera;
    const right = tmpU.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const fwd = tmpW.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const v = g.player.vel;
    const vx = v.x * right.x + v.z * right.z;
    const vz = v.x * fwd.x + v.z * fwd.z;
    if (!P.ready) {
      P.ready = true;
      P.vel.set(vx, v.y, vz);
    }
    const idt = 1 / Math.max(0.005, dt);
    const ax = Math.max(-40, Math.min(40, (vx - P.vel.x) * idt));
    const az = Math.max(-40, Math.min(40, (vz - P.vel.z) * idt));
    P.vel.set(vx, v.y, vz);
    const mi = g.input.mouse;
    // girar la vista lo deja atrás; caminar, lo empuja al revés de hacia dónde acelera
    P.vx += (-ax * 0.012 - (mi.dx || 0) * 0.0009) * (1 + on * 0.3);
    P.vz += (-az * 0.012 - (mi.dy || 0) * 0.0006) * (1 + on * 0.3);
    // el paso: un vaivén chiquito
    const bob = g.player.moving && g.player.onGround ? Math.sin(g.player.bobPhase || 0) : 0;
    P.vx += bob * dt * 0.8;
    P.vx += (-38 * P.x - 3.2 * P.vx) * dt;
    P.vz += (-38 * P.z - 3.2 * P.vz) * dt;
    P.x = Math.max(-0.7, Math.min(0.7, P.x + P.vx * dt));
    P.z = Math.max(-0.6, Math.min(0.6, P.z + P.vz * dt));
    m.swing.rotation.set(P.z + Math.sin(t * 1.3) * 0.015, Math.sin(t * 0.7) * 0.08, P.x + Math.sin(t * 1.1) * 0.02);
    // el corazón y lo que gira adentro
    const pulse = 1 + Math.sin(t * 6.5) * 0.08 + this.flare * 0.55 + on * 0.18;
    m.core.scale.setScalar(pulse);
    const s = 1 + this.flare * 0.9 + on * 0.3 + Math.min(0.5, this.souls * 0.02) + Math.sin(t * 7) * 0.06;
    m.aura.scale.setScalar(s);
    m.aura.material.opacity = 0.35 + on * 0.22 + this.flare * 0.4;
    (m.wisps || []).forEach((w, k) => {
      w.rotation.z += dt * (2.2 + on * 7 + this.flare * 6) * (k % 2 ? -1 : 1);
      w.rotation.y += dt * (0.6 + on * 1.5);
    });
    // la luz verde del corazón (alumbra la mano, la cadena y la jaula)
    m.core.getWorldPosition(Lt.position);
    Lt.intensity = (0.3 + on * 0.3 + this.flare * 0.8 + Math.min(0.25, this.souls * 0.015)) * (0.9 + Math.sin(t * 13) * 0.05 + Math.random() * 0.05);
  }

  // ---------------- Admin Mate ----------------
  // Cada tiro nuevo (Weapons.fire lleva la cuenta): oro por todos lados.
  updateAdmin() {
    const g = this.g;
    const w = this.w;
    if (w.shotN === this.lastShot) return;
    this.lastShot = w.shotN;
    const muzzle = w.muzzleWorld(new THREE.Vector3());
    const eye = g.camera.position;
    const fwd = tmpV2.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const t = Math.min(120, g.world.raycast(eye, fwd, 120, hitTmp));
    const end = new THREE.Vector3().copy(eye).addScaledVector(fwd, Number.isFinite(t) ? t : 120);
    this.goldShot(muzzle, end);
    // (a 900 tiros por minuto el sacudón es chiquito: si no, se suma y marea)
    g.fx.addShake(0.03);
    if (Number.isFinite(t) && t < 120) g.fx.sparks(end, 1.2, hitTmp.normal || UP, GOLD);
    // a los demás les llega uno cada 0,1 s como mucho (no se inunda la red)
    if (g.net && g.time - (this.adminShareT ?? -9) >= 0.1) {
      this.adminShareT = g.time;
      g.net.share('pot', { a: 1, src: this.r(muzzle), dst: this.r(end) });
    }
  }

  goldShot(muzzle, end) {
    const g = this.g;
    g.fx.beam(muzzle, end, { color: 0xffc848, width: 0.06, life: 0.14 });
    g.fx.beam(muzzle, end, { color: 0xfff4c0, width: 0.02, life: 0.08 });
    g.fx.flash(muzzle, 0xffc040, 12, 0.08, 9);
    g.fx.sparkle(muzzle, GOLD, 4, 0.12);
    this.thump(muzzle);
  }

  // ---------------- lo de los demás ----------------
  // Un farol o un Admin Mate de otro jugador (llega por la red): solo se ve.
  // Al anfitrión además le llega el daño a los jefes que hace un invitado.
  ghostMsg(m) {
    const g = this.g;
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    if (m.b && !g.net?.guest) {
      const z = g.zombies.boss;
      if (z && !z.dead) g.zombies.damage(z, (z.maxHp || 0) * Math.min(0.05, m.b), { type: 'souls', zone: 'torso', noPoints: true, pup: WEAPONS.farol.bossMult });
      return;
    }
    if (m.a && m.src && m.dst) {
      this.goldShot(V(m.src), V(m.dst));
      return;
    }
    if (!m.o) return;
    const o = V(m.o);
    if (m.u) {
      this.burst(o, true);
      return;
    }
    if (m.k) {
      const at = V(m.k);
      this.ghost(at.clone().setY(at.y - 0.4), o);
      // (el de otro: llega cuando ya salió, suena desde casi lo más fuerte)
      if (!this.almaStart(0.25, at)) this.wail(at);
      return;
    }
    if (m.zs) {
      const until = g.time + 0.25;
      for (const id of m.zs) {
        const z = id === 0xffff ? g.zombies.boss : g.net?.findZombie?.(id);
        if (!z || z.dead) continue;
        const L = this.links.find((x) => x.z === z);
        if (L) {
          L.to.copy(o);
          L.until = until;
        } else this.links.push({ z, to: o.clone(), until, moteT: 0 });
        // el anfitrión lo frena como si fuera suyo
        if (!g.net?.guest) z.slowT = Math.max(z.slowT || 0, 0.35);
      }
      this.humT -= 0.12;
      if (this.humT <= 0) {
        this.humT = 0.42;
        this.hum(o, m.zs.length);
      }
    }
  }

  updateLinks(dt) {
    const g = this.g;
    for (let i = this.links.length - 1; i >= 0; i--) {
      const L = this.links[i];
      if (g.time > L.until || !L.z.active || L.z.dead) {
        this.links.splice(i, 1);
        continue;
      }
      L.moteT -= dt;
      while (L.moteT <= 0) {
        L.moteT += 0.04;
        chestOf(L.z, tmpV);
        tmpV.y += (Math.random() - 0.6) * 0.7;
        this.mote(tmpV, L.to);
      }
    }
  }

  // ---------------- sonidos ----------------
  // (sin audio todavía, o apagado: nada)
  hum(pos, n) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: pos.clone(), gain: 0.5 + Math.min(0.5, n * 0.06), reverb: 0.5 });
    a.noise(o, { dur: 0.5, type: 'bandpass', freq: 520, freqEnd: 900, q: 3, gain: 0.22, attack: 0.15 });
    a.tone(o, { dur: 0.5, freq: 196, freqEnd: 207, gain: 0.05, attack: 0.15 });
    a.tone(o, { dur: 0.5, freq: 294, gain: 0.03, attack: 0.2, detune: 8 });
  }

  // El alma que le arranca a un muerto: el grabado 'alma' (core/weaponSfx.js),
  // arrancado de modo que lo más fuerte caiga cuando entra al farol, en `left`
  // s. Varias que salen juntas suenan como una. pos: el de otro jugador (el
  // propio suena sin lugar, como los tiros). false si el grabado no bajó.
  almaStart(left, pos = null) {
    const a = this.g.audio;
    const G = a?.guns;
    if (!G?.has('alma')) return false;
    if (a.now - (this.almaT ?? -9) < 0.3) return true;
    this.almaT = a.now;
    const offset = Math.max(0, ALMA_PEAK - left);
    const src = G.play('alma', { pos: pos && pos.clone(), offset, rate: 0.96 + Math.random() * 0.08 });
    if (!src) return false;
    const L = (this.almas ||= []);
    const it = { src, peak: a.now + ALMA_PEAK - offset, mine: !pos };
    L.push(it);
    src.onended = () => {
      const i = L.indexOf(it);
      if (i >= 0) L.splice(i, 1);
    };
    return true;
  }

  // Soltó el clic antes de que el alma saliera: se apaga de a poco.
  almaCut() {
    const L = this.almas;
    if (!L?.length) return;
    const a = this.g.audio;
    for (let i = L.length - 1; i >= 0; i--) {
      if (!L[i].mine || a.now >= L[i].peak - 0.05) continue;
      a.guns.fadeOut(L[i].src, 0.25);
      L.splice(i, 1);
    }
  }

  // El lamento del alma que se va.
  wail(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: pos.clone(), gain: 0.8, reverb: 0.6 });
    const f = 780 + Math.random() * 260;
    a.tone(o, { dur: 0.6, freq: f, freqEnd: f * 0.42, gain: 0.08, attack: 0.04 });
    a.tone(o, { dur: 0.6, freq: f * 1.5, freqEnd: f * 0.6, gain: 0.035, attack: 0.06, detune: 12 });
    a.noise(o, { dur: 0.5, type: 'highpass', freq: 1800, freqEnd: 600, gain: 0.12, attack: 0.05 });
  }

  chord(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: pos.clone(), gain: 1, reverb: 0.8 });
    a.choir?.(o, a.now, [57, 64, 69, 72], { dur: 1.2, gain: 0.05, attack: 0.03, release: 1.1 });
    a.noise(o, { dur: 1.4, type: 'bandpass', freq: 400, freqEnd: 3200, q: 1, gain: 0.5, attack: 0.02 });
  }

  // El golpe grave del Mate Eagle (además del tiro de siempre).
  thump(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: pos.clone(), gain: 0.9, reverb: 0.3 });
    a.tone(o, { dur: 0.22, freq: 110, freqEnd: 38, gain: 0.35, attack: 0.003 });
    a.tone(o, { dur: 0.12, freq: 2400, freqEnd: 1600, type: 'triangle', gain: 0.04, attack: 0.002 });
  }

  r(v) {
    return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  }

  clear() {
    this.drain.clear();
    this.links.length = 0;
    for (const m of this.motes) this.moteFree.push(m);
    this.motes.length = 0;
    for (const x of this.ghosts) {
      x.s.visible = false;
      this.ghostFree.push(x);
    }
    this.ghosts.length = 0;
    this.pts.geometry.setDrawRange(0, 0);
    this.had = null;
    this.holding = false;
    this.souls = 0;
  }
}
