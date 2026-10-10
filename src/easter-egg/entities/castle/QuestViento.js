import * as THREE from 'three';
import { EE, ZONES } from '../../config/map';
import { roofRidge } from '../../world/Castle';
import { ELEM_RGB, ELEM_COLOR, glow, isHost, announce, players, rayHit, freeCells, myId, firstHit } from './common';
import { compactGroup } from '../../world/props';
import { lean, sleepHidden } from '../../world/castleLean';

// La vuelta del viento: "Las Veletas del Zonda".
//  1. Las veletas: cuatro veletas con cóndor en las cumbreras de los techos
//     (la biblioteca, la capilla, la caballeriza y la cocina) miran para
//     cualquier lado. Cada tiro las gira un cuarto de vuelta. Hay que ponerlas
//     todas mirando al oeste, a la cordillera, de donde baja el Zonda.
//  2. Las plumas: con las cuatro al oeste sopla el Zonda, y tres plumas de
//     cóndor andan sueltas en el viento (el adarve, la cumbre y el palenque).
//     Se agarran pasándoles por al lado.
//  3. La ofrenda: las plumas se dejan en el altar del mirador del viento.
// Lo lleva el anfitrión: los tiros del invitado a las veletas llegan como aviso.

// para dónde apunta la flecha: 0 norte, 1 este, 2 sur, 3 oeste (el bueno)
const WEST = 3;
const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const tmpV = new THREE.Vector3();

export default class QuestViento {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    // 0 veletas, 1 plumas, 2 ofrenda, 3 listo
    this.ph = 0;
    this.dirs = EE.viento.veletas.map(() => Math.floor(Math.random() * 3));
    this.caught = [0, 0, 0];
    this.vanes = EE.viento.veletas.map((k, i) => this.buildVane(k, i));
    // (lo quieto de las veletas, junto: el palo, la cruz y las letras; gira solo la flecha)
    if (lean()) {
      const fixed = new THREE.Group();
      this.root.add(fixed);
      for (const v of this.vanes) {
        v.grp.updateMatrixWorld(true);
        for (const o of [...v.grp.children]) if (o !== v.vane) fixed.attach(o);
      }
      compactGroup(fixed);
    }
    this.feathers = EE.viento.plumas.map((k) => this.buildFeather(k));
    this.sendT = 0;
  }

  get done() {
    return this.ph >= 3;
  }

  // ---------------- lo que se ve ----------------
  buildVane(k, i) {
    const g = this.g;
    const M = g.world.M;
    const R = roofRidge(k);
    const grp = new THREE.Group();
    grp.position.set(R.x, R.y, R.z);
    const iron = M.iron;
    const brass = M.brass;
    grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.2, 6).translate(0, 1.1, 0), iron));
    // la cruz con las letras de los cuatro vientos
    const letters = ['N', 'E', 'S', 'O'];
    for (let d = 0; d < 4; d++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.8).translate(0, 0, 0.4), iron);
      arm.position.y = 1.5;
      arm.rotation.y = YAW[d];
      grp.add(arm);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), letterMat(letters[d], d === WEST));
      const a = YAW[d];
      plate.position.set(Math.sin(a) * 0.86, 1.5, Math.cos(a) * 0.86);
      plate.rotation.y = a;
      grp.add(plate);
    }
    // lo que gira: la flecha y el cóndor de chapa
    const vane = new THREE.Group();
    vane.position.y = 2.25;
    vane.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.9), iron));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 4).rotateX(Math.PI / 2), brass);
    tip.position.z = 1.1;
    vane.add(tip);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-0.75, 0.12);
    shape.lineTo(-0.55, 0.22);
    shape.lineTo(-0.16, 0.15);
    shape.lineTo(0, 0.32);
    shape.lineTo(0.16, 0.15);
    shape.lineTo(0.55, 0.22);
    shape.lineTo(0.75, 0.12);
    shape.closePath();
    const condor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }));
    condor.rotation.y = Math.PI / 2;
    condor.position.set(0, 0.05, -0.62);
    vane.add(condor);
    const spark = glow(g.textures, ELEM_COLOR.viento, 1.2, 0);
    spark.position.z = 1.1;
    vane.add(spark);
    grp.add(vane);
    this.root.add(grp);
    grp.scale.setScalar(1.45);
    const center = new THREE.Vector3(R.x, R.y + 2.25 * 1.45, R.z);
    return { k, grp, vane, spark, center, yaw: YAW[this.dirs[i]], shake: 0 };
  }

  // Una pluma de cóndor (negra con la base blanca) con un brillo verde.
  buildFeather(zone) {
    const g = this.g;
    const grp = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.09, 0.25, 0.04, 0.62);
    shape.lineTo(0, 0.68);
    shape.quadraticCurveTo(-0.07, 0.3, 0, 0);
    const vane = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x0a2a14, emissiveIntensity: 0.6 }));
    vane.position.y = 0.08;
    grp.add(vane);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.8, side: THREE.DoubleSide }));
    base.position.y = 0.07;
    grp.add(base);
    const s = glow(g.textures, ELEM_COLOR.viento, 1.3, 0.5);
    s.position.y = 0.3;
    grp.add(s);
    grp.visible = false;
    grp.scale.setScalar(1.5);
    this.root.add(grp);
    sleepHidden(grp);
    return { zone, grp, glow: s, pos: new THREE.Vector3(), target: null, net: null, speed: 1.8 };
  }

  // ---------------- los tiros ----------------
  onShot(o, d, maxT) {
    if (this.ph !== 0) return;
    let best = -1;
    let bestT = Infinity;
    this.vanes.forEach((v, i) => {
      const t = rayHit(o, d, maxT, v.center, 1.3);
      if (t >= 0 && t < bestT) {
        best = i;
        bestT = t;
      }
    });
    const g = this.g;
    if (best < 0 || !firstHit(g, (this.shotT ??= []), best)) return;
    if (isHost(g)) this.turn(best);
    else g.net.net.send({ t: 'pee', a: 'q', q: 'viento', op: 'vane', i: best });
  }

  // (anfitrión) la veleta gira un cuarto de vuelta
  turn(i) {
    if (this.ph !== 0) return;
    this.dirs[i] = (this.dirs[i] + 1) % 4;
    this.creak(i);
    const ok = this.dirs.filter((d) => d === WEST).length;
    if (this.dirs[i] === WEST) announce(this.g, `Una veleta mira a la cordillera (${ok} de 4).`, 2);
    if (ok === 4) this.blow();
    this.egg.netSync();
  }

  creak(i) {
    const g = this.g;
    const v = this.vanes[i];
    v.shake = 1;
    g.fx.sparks(v.center, 0.6, tmpV.set(0, 1, 0), [0.9, 0.8, 0.6]);
    const a = g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: v.center, reverb: 0.5, gain: 0.9, ref: 6 });
    a.tone(o, { dur: 0.45, freq: 520, freqEnd: 380, type: 'sawtooth', gain: 0.12 });
    a.noise(o, { dur: 0.3, type: 'bandpass', freq: 1600, freqEnd: 900, q: 6, gain: 0.3 });
  }

  // (anfitrión) las cuatro al oeste: ¡sopla el Zonda!
  blow() {
    this.ph = 1;
    this.caught = [0, 0, 0];
    this.placeFeathers();
    announce(this.g, '', 5, true);
    this.egg.say('fierro', LINES.zonda);
    this.gust();
  }

  // El ventarrón del Zonda (en todas las compus).
  gust() {
    const g = this.g;
    g.fx.addShake(0.4);
    this.gustT = 5;
    const a = g.audio;
    if (!a.ctx) return;
    const o = a.out({ reverb: 0.3, gain: 1 });
    a.noise(o, { dur: 4.5, type: 'bandpass', freq: 300, freqEnd: 1400, q: 0.6, gain: 0.7, attack: 0.8 });
    a.noise(o, { t: a.now + 1, dur: 3, type: 'bandpass', freq: 900, freqEnd: 400, q: 1.2, gain: 0.4, attack: 0.4 });
  }

  placeFeathers() {
    const w = this.g.world;
    for (const F of this.feathers) {
      const cells = freeCells(w, F.zone);
      F.cells = cells;
      const i = cells[Math.floor(Math.random() * cells.length)];
      F.pos.set((i % w.W) + 0.5, 0, Math.floor(i / w.W) + 0.5);
      F.pos.y = w.floorAt(F.pos.x, F.pos.z) + 1.3;
      F.target = null;
    }
  }

  // ---------------- la ofrenda (el altar del mirador) ----------------
  altarPrompt() {
    if (this.ph === 1) return { text: `El altar del Zonda espera las plumas: ${this.caught.filter(Boolean).length} de 3`, noCost: true, info: true };
    if (this.ph === 2) return { text: 'ofrendarle las plumas de cóndor al Zonda', noCost: true };
    return null;
  }

  altarUse() {
    if (this.ph !== 2) return false;
    const g = this.g;
    if (isHost(g)) return this.offer();
    g.net.net.send({ t: 'pee', a: 'q', q: 'viento', op: 'offer' });
    return true;
  }

  // (anfitrión)
  offer() {
    if (this.ph !== 2) return false;
    this.ph = 3;
    this.egg.netSync();
    this.finish();
    return true;
  }

  // El remolino que arma el Zonda arriba del altar.
  finish() {
    const [x, z] = EE.altars.viento;
    const y = this.g.world.floorAt(x, z);
    this.whirl = { t: 0, pos: new THREE.Vector3(x, y, z) };
    this.egg.say('fierro', LINES.listo);
  }

  onGuest(m) {
    if (m.op === 'vane' && m.i >= 0 && m.i < this.vanes.length) this.turn(m.i);
    else if (m.op === 'offer') this.offer();
  }

  // ---------------- red ----------------
  state() {
    return { ph: this.ph, d: this.dirs, c: this.caught };
  }

  apply(s) {
    if (s.f) {
      // dónde andan las plumas (lo manda el anfitrión cada tanto)
      s.f.forEach((p, i) => {
        const F = this.feathers[i];
        if (F && p) F.net = new THREE.Vector3(p[0], p[1], p[2]);
      });
      return;
    }
    const was = this.ph;
    const d = s.d || this.dirs;
    d.forEach((v, i) => {
      if (v !== this.dirs[i] && was === 0) this.creak(i);
    });
    this.dirs = [...d];
    this.caught = s.c || this.caught;
    this.ph = s.ph | 0;
    if (was === 0 && this.ph >= 1) this.gust();
    if (was < 3 && this.ph === 3) this.finish();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // las veletas giran hasta donde apuntan (con un temblor al recibir el tiro)
    this.vanes.forEach((v, i) => {
      const want = YAW[this.dirs[i]];
      let d = want - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * Math.min(1, dt * 5);
      v.shake = Math.max(0, v.shake - dt * 2);
      v.vane.rotation.y = v.yaw + Math.sin(t * 30) * v.shake * 0.08 + (this.ph >= 1 ? Math.sin(t * 7 + i) * 0.04 : Math.sin(t * 0.8 + i) * 0.02);
      const ok = this.dirs[i] === WEST;
      v.spark.material.opacity += ((ok ? 0.55 + Math.sin(t * 4 + i) * 0.15 : 0) - v.spark.material.opacity) * Math.min(1, dt * 4);
    });
    // el ventarrón
    if (this.gustT > 0) {
      this.gustT -= dt;
      const p = g.player.pos;
      for (let k = 0; k < 4; k++) {
        g.fx.alpha.spawn(p.x - 12 + Math.random() * 4, p.y + Math.random() * 4, p.z + (Math.random() - 0.5) * 16, 14 + Math.random() * 6, (Math.random() - 0.5), (Math.random() - 0.5) * 2, { color: [0.85, 0.95, 0.9], size: 0.3, size1: 1.2, life: 1.4, alpha: 0.2, drag: 0.2 });
      }
    }
    this.updateFeathers(dt, t);
    // el remolino del Zonda sobre el altar
    const W = this.whirl;
    if (W) {
      W.t += dt;
      const k = Math.min(1, W.t / 2.4);
      for (let n = 0; n < 5; n++) {
        const a = W.t * 9 + n * 1.3;
        const r = 2.6 * (1 - k) + 0.3;
        g.fx.alpha.spawn(W.pos.x + Math.cos(a) * r, W.pos.y + 0.3 + Math.random() * 3.5 * (1 - k * 0.5), W.pos.z + Math.sin(a) * r, -Math.sin(a) * 6, 1.5, Math.cos(a) * 6, { color: [0.7, 1, 0.8], size: 0.3, size1: 0.9, life: 0.7, alpha: 0.3, drag: 0.5 });
      }
      if (Math.random() < 0.5) g.fx.sparkle(W.pos.clone().setY(W.pos.y + 2.1), ELEM_RGB.viento, 2, 0.6);
      if (k >= 1) {
        this.whirl = null;
        if (isHost(g)) this.egg.altares.unlock('viento');
        this.egg.onMate?.('viento');
      }
    }
  }

  updateFeathers(dt, t) {
    const g = this.g;
    const w = g.world;
    const host = isHost(g);
    let send = false;
    this.feathers.forEach((F, i) => {
      const on = this.ph === 1 && !this.caught[i];
      F.grp.visible = on;
      if (!on) return;
      if (host) {
        // anda con el viento de celda en celda (a la altura del pecho)
        if (!F.cells) F.cells = freeCells(w, F.zone);
        if (!F.target || F.pos.distanceTo(F.target) < 0.4) {
          const c = F.cells[Math.floor(Math.random() * F.cells.length)];
          const x = (c % w.W) + 0.5;
          const z = Math.floor(c / w.W) + 0.5;
          F.target = new THREE.Vector3(x, w.floorAt(x, z) + 1.3, z);
        }
        const d = tmpV.subVectors(F.target, F.pos);
        const len = d.length();
        F.pos.addScaledVector(d, Math.min(1, (F.speed * dt) / (len || 1)));
        // ¿alguien la agarró?
        for (const p of players(g)) {
          if (p.downed) continue;
          const dy = F.pos.y - (p.pos.y + 1.2);
          if (Math.hypot(p.pos.x - F.pos.x, p.pos.z - F.pos.z) < 1.3 && Math.abs(dy) < 1.4) {
            this.catch(i, p.id);
            return;
          }
        }
        send = true;
      } else if (F.net) F.pos.lerp(F.net, Math.min(1, dt * 6));
      F.grp.position.set(F.pos.x, F.pos.y + Math.sin(t * 2.3 + i) * 0.15, F.pos.z);
      F.grp.rotation.set(Math.sin(t * 1.7 + i) * 0.5, t * 1.2 + i, Math.cos(t * 1.3 + i) * 0.4);
      if (Math.random() < dt * 5) g.fx.sparkle(F.grp.position, ELEM_RGB.viento, 1, 0.15);
    });
    if (host && send && g.net) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 0.25;
        g.net.event('ee', { q: 'viento', f: this.feathers.map((F) => [+F.pos.x.toFixed(2), +F.pos.y.toFixed(2), +F.pos.z.toFixed(2)]) });
      }
    }
  }

  // (anfitrión) alguien pasó por la pluma
  catch(i, id) {
    this.caught[i] = 1;
    const F = this.feathers[i];
    this.g.fx.sparkle(F.pos, ELEM_RGB.viento, 30, 0.6);
    const n = this.caught.filter(Boolean).length;
    const who = id === myId(this.g) ? 'Agarraste' : `${this.g.net?.nameOf(id) || 'Alguien'} agarró`;
    announce(this.g, `${who} una pluma de cóndor (${n} de 3).`, 3);
    if (n === 3) this.ph = 2;
    this.egg.netSync();
  }

  // (cada paso dice qué hacer, dónde y, si hace falta, por dónde)
  line() {
    if (this.ph === 0) return ['Girá a tiros las veletas de los techos hasta que miren al oeste', `${this.dirs.filter((d) => d === WEST).length}/4`];
    if (this.ph === 1) return ['Agarrá las plumas de cóndor que vuelan por el adarve, la cumbre y el palenque', `${this.caught.filter(Boolean).length}/3`];
    if (this.ph === 2) return ['Llevá las plumas al altar del mirador del viento (por la escalera de la biblioteca)', ''];
    return ['El Zonda', ''];
  }

  // Lo que dice Fierro si le preguntan (null: la pista de arranque, en CastleEgg)
  hint() {
    if (this.ph === 1) return 'Sopla el Zonda. Las plumas de cóndor andan sueltas por el adarve, la cumbre y el palenque: pásenles por al lado y se les quedan.';
    if (this.ph === 2) return 'Las tres plumas: al altar del mirador del viento, subiendo por la escalera de la biblioteca.';
    return null;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// Las letras de la rosa de los vientos (la O, del oeste, en verde).
const LETTERS = new Map();
function letterMat(ch, good) {
  const key = ch + good;
  if (!LETTERS.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = good ? '#8affb8' : '#d8c8a0';
    x.font = 'bold 50px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 32, 36);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    LETTERS.set(key, new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  }
  return LETTERS.get(key);
}

const LINES = {
  zonda: '¡El Zonda, paisanos! Baja caliente de la cordillera y trae plumas de cóndor. Agárrenlas antes de que se las lleve.',
  listo: 'El Zonda, el mate del viento. Quedó en el mirador. Cuidado con él, que el que lo sopla mal sale volando.',
};
