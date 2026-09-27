import * as THREE from 'three';
import { DOORS, EE } from '../../config/map';
import { flameMaterial } from '../../world/castleFire';
import { ELEMENTS, ELEM_NAME, ELEM_COLOR, ELEM_RGB, glow, isHost, announce } from './common';

// La cueva del Mateendrache (los pasos del medio del easter egg):
//  · La pared de hielo de la gruta: se derrite con un tiro cargado del Pillán.
//  · El mate del dragón: una pava gigante sobre un fogón de piedra y un mate
//    gigante con su bombilla. Se prende el fogón con fuego, el agua tiene que
//    quedarse entre 78 y 82 grados un rato (el fogón calienta solo; el hielo
//    la baja), el Zonda cargado levanta la pava y ceba el mate, y el Illapa
//    cargado despierta al dragón, que se toma el mate.
//  · Las cadenas: cuatro, cada una sellada con un elemento. Se rompen con
//    tiros cargados (el del mismo elemento de una; los otros, de a tres).
// Después el dragón se va volando por la chimenea de la cueva y se posa en el
// techo del gran salón (lo sigue CastleEgg: la vanguardia).

const OK_SECS = 10;
const HEAT = 1.9;
const BURNT = 92;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class Cueva {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    const g = this.g;
    const w = g.world;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    const C = EE.cueva;
    // 0 dormido, 1 fogón prendido, 2 agua a punto, 3 mate cebado, 4 despierto, 5 libre
    this.ph = 0;
    this.temp = 20;
    this.okT = 0;
    this.chains = [0, 0, 0, 0];
    this.hearth = new THREE.Vector3(C.fogon[0], w.floorAt(C.fogon[0], C.fogon[1]), C.fogon[1]);
    this.mate = new THREE.Vector3(C.mate[0], w.floorAt(C.mate[0], C.mate[1]), C.mate[1]);
    this.buildHearth();
    this.buildMate();
    // el dragón (lo arma CastleEgg: después sale de la cueva)
    this.dragon = egg.dragon.D;
    this.buildChains();
    this.buildDial();
    this.door = DOORS.findIndex((d) => d.kind === 'hielo');
  }

  // ---------------- lo que se ve ----------------
  // El fogón de piedra con la pava gigante arriba (en un trípode de hierro).
  buildHearth() {
    const g = this.g;
    const M = g.world.M;
    const grp = new THREE.Group();
    grp.position.copy(this.hearth);
    const st = M.castleStoneDark || M.stone;
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), st);
      r.position.set(Math.cos(a) * 1.25, 0.22, Math.sin(a) * 1.25);
      r.rotation.set(k, k * 2, 0);
      grp.add(r);
    }
    for (let k = 0; k < 5; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 7), M.log || M.wood);
      log.position.set(0, 0.2, 0);
      log.rotation.set(Math.PI / 2 - 0.25, (k / 5) * Math.PI, 0);
      grp.add(log);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), M.iron);
      leg.position.set(Math.cos(a) * 1.05, 1.5, Math.sin(a) * 1.05);
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      grp.add(leg);
    }
    // las llamas (se prenden con el Pillán)
    const fire = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9).translate(0, 0.9, 0), flameMaterial());
      p.rotation.y = (k / 3) * Math.PI;
      fire.add(p);
    }
    fire.position.y = 0.2;
    fire.visible = false;
    grp.add(fire);
    const fglow = glow(g.textures, 0xff6a1a, 4, 0);
    fglow.position.y = 1;
    grp.add(fglow);
    this.root.add(grp);
    // la pava: panza de lata ennegrecida, el pico y la manija
    const pava = new THREE.Group();
    const tin = new THREE.MeshStandardMaterial({ color: 0x6a6a66, roughness: 0.45, metalness: 0.8 });
    const soot = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.8, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.9, 0.02], [1.15, 0.25], [1.2, 0.6], [1.05, 1.0], [0.6, 1.25], [0.35, 1.32], [0.35, 1.4], [0, 1.42]].map(([r, y]) => new THREE.Vector2(r, y)), 28), tin);
    pava.add(body);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.9, 0.08, 28), soot);
    bottom.position.y = 0.03;
    pava.add(bottom);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, 1.3, 10), tin);
    spout.position.set(1.4, 0.95, 0);
    spout.rotation.z = -0.85;
    pava.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 20, Math.PI), tin);
    handle.position.y = 1.35;
    pava.add(handle);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M.woodDark || M.wood);
    knob.position.y = 1.5;
    pava.add(knob);
    pava.position.set(0, 2.1, 0);
    grp.add(pava);
    this.hearthObj = { grp, fire, glow: fglow, pava, spoutTip: new THREE.Vector3(2.0, 1.45, 0) };
  }

  // El mate gigante: calabaza curada con virola de plata y la bombilla
  // inclinada hacia donde duerme la cabeza del dragón.
  buildMate() {
    const g = this.g;
    const grp = new THREE.Group();
    grp.position.copy(this.mate);
    const gourd = new THREE.MeshStandardMaterial({ map: g.textures.gourd || null, color: 0x9a6a3a, roughness: 0.6 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.25, metalness: 1 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.7, 0.05], [1.05, 0.35], [1.15, 0.8], [1.02, 1.3], [0.8, 1.62], [0.72, 1.75]].map(([r, y]) => new THREE.Vector2(r, y)), 28), gourd);
    grp.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.07, 8, 28), silver);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.76;
    grp.add(rim);
    // la yerba (verde) y el agua (cuando lo ceban)
    const yerba = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshStandardMaterial({ color: 0x6a7a2a, roughness: 1 }));
    yerba.rotation.x = -Math.PI / 2;
    yerba.position.y = 1.62;
    grp.add(yerba);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.68, 24), new THREE.MeshStandardMaterial({ color: 0x4a5a1a, roughness: 0.15, emissive: 0x1a2a08, emissiveIntensity: 0.5 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.64;
    water.visible = false;
    grp.add(water);
    // la bombilla: un caño de plata con el filtro adentro y la boquilla afuera
    const tip = new THREE.Vector3(-2.2, 5.8, -1);
    const base = new THREE.Vector3(0.1, 1.2, 0);
    const d = tmpV.subVectors(tip, base);
    const len = d.length();
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 10), silver);
    straw.position.copy(base).addScaledVector(d, 0.5);
    straw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    grp.add(straw);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.4), silver);
    mouth.position.copy(tip);
    mouth.quaternion.copy(straw.quaternion);
    grp.add(mouth);
    const s = glow(g.textures, 0x9adc6a, 3, 0);
    s.position.y = 2.2;
    grp.add(s);
    this.root.add(grp);
    this.mateObj = { grp, water, glow: s, tip: tip.clone().add(this.mate) };
    this.g.world.addBox([this.mate.x - 1.2, this.mate.y, this.mate.z - 1.2, this.mate.x + 1.2, this.mate.y + 1.8, this.mate.z + 1.2], { kind: 'prop' });
    this.g.world.addBox([this.hearth.x - 1.4, this.hearth.y, this.hearth.z - 1.4, this.hearth.x + 1.4, this.hearth.y + 3.5, this.hearth.z + 1.4], { kind: 'prop' });
  }

  // El termómetro: un cuadrante de bronce al lado del fogón (78 a 82, en verde).
  buildDial() {
    const g = this.g;
    const M = g.world.M;
    const [dx, dz] = EE.cueva.dial;
    const y = g.world.floorAt(dx, dz);
    const grp = new THREE.Group();
    grp.position.set(dx, y, dz);
    grp.rotation.y = Math.atan2(EE.cueva.dragon[0] - dx, EE.cueva.dragon[1] + 8 - dz);
    grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8).translate(0, 0.95, 0), M.iron));
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#e8dcc0';
    x.beginPath();
    x.arc(128, 128, 124, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 22;
    const arc = (t0, t1, col) => {
      x.strokeStyle = col;
      x.beginPath();
      x.arc(128, 128, 96, dialA(t0), dialA(t1));
      x.stroke();
    };
    arc(20, 78, '#3a5a8a');
    arc(78, 82, '#3aa04a');
    arc(82, 100, '#b02a1a');
    x.fillStyle = '#1a1410';
    x.font = 'bold 30px Georgia, serif';
    x.textAlign = 'center';
    x.fillText('°C', 128, 190);
    x.font = 'bold 22px Georgia, serif';
    for (const v of [20, 40, 60, 80, 100]) {
      const a = dialA(v);
      x.fillText(String(v), 128 + Math.cos(a) * 64, 136 + Math.sin(a) * 64);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0x2a2010, emissiveIntensity: 0.4 }));
    face.position.set(0, 2.2, 0.06);
    grp.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 6, 32), M.brass);
    rim.position.set(0, 2.2, 0.06);
    grp.add(rim);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.02).translate(0, 0.2, 0), new THREE.MeshBasicMaterial({ color: 0x100806 }));
    needle.position.set(0, 2.2, 0.1);
    grp.add(needle);
    this.root.add(grp);
    this.dial = { grp, needle, face };
  }

  // Las cuatro cadenas: de un grillete en la pared (con el sello de su
  // elemento) a una parte del dragón.
  buildChains() {
    const g = this.g;
    const M = g.world.M;
    const link = new THREE.TorusGeometry(0.16, 0.045, 5, 10);
    this.chainObjs = EE.cueva.cadenas.map(([x, z, part], i) => {
      const el = ELEMENTS[i];
      const y = g.world.floorAt(x, z) + 2.2;
      const anchor = new THREE.Vector3(x, y, z);
      const inst = new THREE.InstancedMesh(link, M.iron, 40);
      inst.frustumCulled = false;
      this.root.add(inst);
      // el grillete de la pared con el sello
      const seal = new THREE.Group();
      seal.position.copy(anchor);
      seal.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 6, 16), M.iron));
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(ELEM_COLOR[el]).multiplyScalar(1.6), toneMapped: false }));
      seal.add(gem);
      const s = glow(g.textures, ELEM_COLOR[el], 1.6, 0.5);
      seal.add(s);
      this.root.add(seal);
      return { el, anchor, part, inst, seal, gem, glow: s, hits: 0, shake: 0 };
    });
  }

  // ---------------- los pasos ----------------
  // (lo llaman todas las compus; el anfitrión decide)
  onElemental(el, pos, charged) {
    const step = this.egg.step;
    // la pared de hielo
    if (step === 4 && el === 'fuego' && charged && this.door >= 0) {
      const d = DOORS[this.door];
      const cx = (d.cells[0][0] + d.cells[1][0] + 1) / 2;
      const cz = d.cells[0][1] + 0.5;
      if (Math.hypot(pos.x - cx, pos.z - cz) < 4.5) this.send({ op: 'melt' });
      return;
    }
    if (step !== 5 && step !== 6) return;
    const hDist = Math.hypot(pos.x - this.hearth.x, pos.z - this.hearth.z);
    if (this.ph === 0 && el === 'fuego' && hDist < 3.5) this.send({ op: 'light' });
    else if (this.ph === 1 && hDist < 4) {
      if (el === 'hielo') this.send({ op: 'temp', d: charged ? -16 : -4 });
      else if (el === 'fuego') this.send({ op: 'temp', d: charged ? 14 : 5 });
    } else if (this.ph === 2 && el === 'viento' && charged && hDist < 4.5) this.send({ op: 'pour' });
    else if (this.ph === 3 && el === 'rayo' && charged && this.dragon.chestPos(tmpV).distanceTo(pos) < 7) this.send({ op: 'wake' });
    else if (this.ph === 4 && charged) {
      this.chainObjs.forEach((C, i) => {
        if (this.chains[i] >= 3 || C.anchor.distanceTo(pos) > 3) return;
        this.send({ op: 'chain', i, n: el === C.el ? 3 : 1 });
      });
    }
  }

  // Al anfitrión (o directo, si ya es el anfitrión).
  send(m) {
    const g = this.g;
    if (isHost(g)) this.onGuest(m);
    else g.net.net.send({ t: 'pee', a: 'cueva', ...m });
  }

  // (anfitrión)
  onGuest(m) {
    const g = this.g;
    const E = this.egg;
    if (m.op === 'melt' && E.step === 4) {
      const it = g.interact.list.find((x) => x.kind === 'door' && x.door?.index === this.door);
      if (it && !it.door.open) g.interact.openDoor(it.door);
      E.step = 5;
      announce(g, 'La pared de hielo se derritió. Abajo duerme el Mateendrache.', 5, true);
      E.say('fierro', LINES.cueva, 2);
      E.netSync();
    } else if (m.op === 'light' && this.ph === 0) {
      this.ph = 1;
      this.temp = 20;
      announce(g, 'Se prendió el fogón. Ojo con el agua, entre 78 y 82 grados. El hielo la baja.', 5);
      E.say('fierro', LINES.fogon);
      E.netSync();
    } else if (m.op === 'temp' && this.ph === 1) {
      this.temp = Math.max(15, Math.min(100, this.temp + Math.max(-20, Math.min(20, +m.d || 0))));
      this.puff();
      g.net?.event('ee', { cv: 'puff' });
    } else if (m.op === 'pour' && this.ph === 2) {
      this.ph = 3;
      this.startPour();
      g.net?.event('ee', { cv: 'pour' });
      E.netSync();
    } else if (m.op === 'wake' && this.ph === 3 && !this.pouring) {
      this.ph = 4;
      this.startWake();
      g.net?.event('ee', { cv: 'wake' });
      E.say('fierro', LINES.despierto, 6);
      E.netSync();
    } else if (m.op === 'chain' && this.ph === 4 && m.i >= 0 && m.i < 4) {
      const was = this.chains[m.i];
      this.chains[m.i] = Math.min(3, was + Math.max(1, Math.min(3, m.n | 0)));
      this.hitChain(m.i, this.chains[m.i] >= 3);
      g.net?.event('ee', { cv: 'chain', i: m.i, b: this.chains[m.i] >= 3 ? 1 : 0 });
      if (this.chains[m.i] >= 3 && was < 3) {
        const left = this.chains.filter((c) => c < 3).length;
        announce(g, left ? `Se rompió la cadena del ${ELEM_NAME[ELEMENTS[m.i]]}. Faltan ${left}.` : '¡Se rompieron las cuatro cadenas!', 3, !left);
        if (!left) {
          this.ph = 5;
          this.egg.onFreed?.();
        }
      }
      E.netSync();
    }
  }

  // ---------------- lo que se anima (en todas las compus) ----------------
  puff() {
    const g = this.g;
    const p = this.hearthObj.pava.getWorldPosition(tmpV).add(tmpW.set(0, 1.5, 0));
    g.fx.frost(p, 8);
    for (let k = 0; k < 10; k++) g.fx.alpha.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2, { color: [0.9, 0.92, 0.95], size: 0.4, size1: 1.4, life: 1.6, alpha: 0.3, drag: 0.4 });
  }

  // El Zonda levanta la pava, la lleva por el aire y ceba el mate.
  startPour() {
    this.pouring = { t: 0 };
    this.egg.say('fierro', LINES.cebar);
  }

  // Illapa lo despierta: abre los ojos, silba como pava y se toma el mate.
  startWake() {
    const g = this.g;
    const D = this.dragon;
    D.eyes = 1;
    D.setPose('stand', 3.2);
    this.waking = { t: 0 };
    g.fx.addShake(0.6);
    this.whistle();
  }

  // El silbido del Mateendrache: una pava gigante hirviendo (en todas las compus).
  whistle(gain = 1) {
    const g = this.g;
    const a = g.audio;
    if (!a.ctx) return;
    const p = this.dragon.mouthPos(tmpV);
    const o = a.out({ pos: p, reverb: 0.8, gain: 1.3 * gain, ref: 14 });
    const t = a.now;
    a.noise(o, { t, dur: 3.2, type: 'bandpass', freq: 1400, freqEnd: 2600, q: 18, gain: 0.8, attack: 0.5 });
    a.tone(o, { t: t + 0.3, dur: 2.8, freq: 1850, freqEnd: 2350, type: 'sine', gain: 0.25, attack: 0.6 });
    a.tone(o, { t: t + 0.3, dur: 2.8, freq: 1870, freqEnd: 2380, type: 'sine', gain: 0.18, attack: 0.6 });
    a.noise(o, { t, dur: 2.5, type: 'lowpass', freq: 200, gain: 0.8, brown: true });
  }

  hitChain(i, broken) {
    const g = this.g;
    const C = this.chainObjs[i];
    C.shake = 1;
    g.fx.sparks(C.anchor, 1.2, tmpV.set(0, 1, 0), ELEM_RGB[C.el]);
    g.fx.explosion(C.anchor.clone(), broken ? 2.5 : 1, ELEM_RGB[C.el]);
    g.audio.shatter?.(C.anchor);
    if (broken) {
      C.broken = true;
      C.fall = 0;
    }
  }

  // ---------------- red ----------------
  state() {
    return { ph: this.ph, tp: Math.round(this.temp * 10) / 10, ok: Math.round(this.okT * 10) / 10, ch: this.chains };
  }

  apply(s) {
    if (s.cv) {
      if (s.cv === 'puff') this.puff();
      else if (s.cv === 'pour' && !this.pouring) this.startPour();
      else if (s.cv === 'wake' && !this.waking) this.startWake();
      else if (s.cv === 'chain') this.hitChain(s.i, !!s.b);
      return;
    }
    const was = this.ph;
    this.ph = s.ph | 0;
    this.temp = s.tp ?? this.temp;
    this.okT = s.ok ?? this.okT;
    if (s.ch) s.ch.forEach((c, i) => {
      if (c >= 3 && this.chains[i] < 3 && !this.chainObjs[i].broken) this.hitChain(i, true);
      this.chains[i] = c;
    });
    // el que entra tarde: el dragón ya despierto
    if (was < 4 && this.ph >= 4 && !this.waking) {
      this.dragon.eyes = 1;
      this.dragon.setPose('stand', 0.5);
      this.mateObj.water.visible = true;
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    const near = this.near();
    // el fogón
    const H = this.hearthObj;
    const lit = this.ph >= 1;
    H.fire.visible = lit;
    H.glow.material.opacity += ((lit ? 0.4 + Math.sin(t * 7) * 0.08 : 0) - H.glow.material.opacity) * Math.min(1, dt * 3);
    if (lit && near && Math.random() < dt * 6) g.fx.fire(tmpV.copy(this.hearth).setY(this.hearth.y + 0.4), 0.5, 2);
    // el vapor de la pava según la temperatura
    if (this.ph >= 1 && this.ph < 3 && near) {
      const p = H.pava.getWorldPosition(tmpV);
      const k = clamp01((this.temp - 50) / 40);
      if (Math.random() < dt * (2 + k * 14)) g.fx.alpha.spawn(p.x + 1.9, p.y + 1.5, p.z, 0.8 + Math.random(), 1.2 + k * 2, (Math.random() - 0.5), { color: [0.92, 0.94, 0.96], size: 0.25, size1: 1 + k, life: 1.4, alpha: 0.2 + k * 0.2, drag: 0.5 });
      H.pava.position.x = Math.sin(t * 40) * 0.01 * k;
    }
    // la aguja del termómetro
    this.dial.needle.rotation.z = -(dialA(this.temp) + Math.PI / 2);
    // (anfitrión) el agua se calienta sola y se cuenta el tiempo a punto
    if (isHost(g) && this.ph === 1) {
      this.temp = Math.min(100, this.temp + HEAT * dt);
      if (this.temp >= 78 && this.temp <= 82) this.okT += dt;
      if (this.temp > BURNT) {
        this.temp = 55;
        this.okT = Math.max(0, this.okT - 4);
        announce(g, '¡Hirvió! El agua hervida quema la yerba. Vuelta a empezar (un poco).', 4);
        this.egg.say('fierro', LINES.hirvio);
      }
      if (this.okT >= OK_SECS) {
        this.ph = 2;
        announce(g, 'El agua está a punto. Ahora, el Zonda... que la pava vuele hasta el mate.', 5, true);
        this.egg.say('fierro', LINES.punto);
        this.egg.netSync();
      }
      this.syncT = (this.syncT || 0) - dt;
      if (this.syncT <= 0) {
        this.syncT = 0.5;
        this.egg.netSync();
      }
    }
    this.updatePour(dt, t);
    this.updateWake(dt);
    this.updateChains(dt, t);
    // el mate gigante brilla cuando está cebado
    this.mateObj.glow.material.opacity = this.ph >= 3 ? 0.25 + Math.sin(t * 2) * 0.08 : 0;
  }

  near() {
    const p = this.g.player.pos;
    return p.y < 26 && p.x > 70 && p.z < 60;
  }

  updatePour(dt) {
    const P = this.pouring;
    if (!P) return;
    const g = this.g;
    P.t += dt;
    const H = this.hearthObj;
    // sube en un remolino, cruza la cueva y se inclina sobre el mate
    const from = tmpV.set(0, 2.1, 0);
    const over = tmpW.copy(this.mate).sub(this.hearth).add(tmpV2.set(-2.1, 3.1, 0));
    const k = clamp01(P.t / 2.4);
    const e = k * k * (3 - 2 * k);
    H.pava.position.lerpVectors(from, over, e);
    H.pava.position.y += Math.sin(k * Math.PI) * 3;
    H.pava.rotation.y = e * Math.PI * 4;
    const tilt = clamp01((P.t - 2.4) / 0.8);
    H.pava.rotation.z = -tilt * 0.95;
    if (P.t > 2.4 && P.t < 6) {
      // el chorro de agua caliente de la pava al mate
      H.pava.rotation.y = 0;
      const tip = H.spoutTip.clone().applyMatrix4(H.pava.matrixWorld);
      const to = this.mate.clone().setY(this.mate.y + 1.7);
      g.fx.waterJet(tip, to, true);
      if (Math.random() < 0.5) g.fx.alpha.spawn(to.x, to.y, to.z, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), { color: [0.9, 0.93, 0.95], size: 0.3, size1: 1.3, life: 1.2, alpha: 0.3, drag: 0.4 });
      this.mateObj.water.visible = P.t > 3.2;
    }
    if (P.t >= 7) {
      // la pava vuelve al fogón
      H.pava.position.set(0, 2.1, 0);
      H.pava.rotation.set(0, 0, 0);
      this.pouring = null;
      this.mateObj.water.visible = true;
      if (isHost(g)) announce(g, 'El mate está cebado. Falta el que se lo toma... despiértenlo con Illapa.', 5, true);
    }
  }

  updateWake(dt) {
    const W = this.waking;
    if (!W) return;
    const g = this.g;
    const D = this.dragon;
    W.t += dt;
    // primero mira alrededor; después va hasta la bombilla y chupa
    if (W.t < 3.5) {
      D.look(g.player.pos.clone().setY(g.player.pos.y + 1.5));
      D.open(W.t < 2.8 ? 0.8 : 0);
    } else if (W.t < 9) {
      D.look(this.mateObj.tip);
      D.open(0.15);
      if (W.t > 5 && Math.random() < dt * 3) this.slurp();
    } else {
      D.look(null);
      D.open(0);
      if (!W.said) {
        W.said = true;
        this.mateObj.water.visible = false;
        if (isHost(g)) announce(g, 'El Mateendrache se tomó el mate... pero sigue encadenado. Rompan las cuatro cadenas con tiros cargados.', 6, true);
      }
      if (W.t > 10) this.waking = null;
    }
  }

  // El ruidito del final del mate (en todas las compus).
  slurp() {
    const a = this.g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: this.mateObj.tip, reverb: 0.6, gain: 1.2, ref: 10 });
    a.noise(o, { dur: 0.35 + Math.random() * 0.3, type: 'bandpass', freq: 600 + Math.random() * 500, q: 3, gain: 0.8 });
    a.noise(o, { t: a.now + 0.1, dur: 0.2, type: 'highpass', freq: 2500, gain: 0.25 });
  }

  updateChains(dt, t) {
    const D = this.dragon;
    const tmpM = this._m || (this._m = new THREE.Matrix4());
    this.chainObjs.forEach((C, i) => {
      C.shake = Math.max(0, C.shake - dt * 3);
      const seg = D.segs[C.part] || D.segs[8];
      const end = seg.o.getWorldPosition(tmpV);
      if (!D.root.visible) end.copy(C.anchor);
      const a = C.anchor;
      const n = 40;
      const len = a.distanceTo(end);
      const sag = C.broken ? 0 : Math.max(0.4, 3.2 - len * 0.12);
      C.fall = C.broken ? (C.fall || 0) + dt : 0;
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const p = tmpW.lerpVectors(a, end, C.broken ? u * 0.25 : u);
        if (C.broken) p.y = Math.max(a.y - 2.2 - u * 1.5, p.y - C.fall * 6);
        else p.y -= Math.sin(u * Math.PI) * sag;
        p.x += Math.sin(t * 40 + k) * C.shake * 0.04;
        tmpM.makeRotationFromEuler(tmpE.set(0, Math.atan2(end.x - a.x, end.z - a.z), k % 2 ? Math.PI / 2 : 0));
        tmpM.setPosition(p);
        C.inst.setMatrixAt(k, tmpM);
      }
      C.inst.instanceMatrix.needsUpdate = true;
      const on = !C.broken;
      C.glow.material.opacity = on ? 0.45 + Math.sin(t * 3 + i) * 0.12 + (this.ph === 4 ? 0.2 : 0) : 0;
      C.gem.visible = on;
      C.seal.rotation.z = Math.sin(t * 40) * C.shake * 0.1;
    });
  }

  line() {
    const step = this.egg.step;
    if (step === 4) return { main: 'La pared de hielo de la gruta', sub: 'Se derrite con el fuego del Pillán cargado' };
    if (this.ph === 0) return { main: 'El mate del dragón', sub: 'Prendan el fogón de la pava con fuego' };
    if (this.ph === 1) return { main: 'El agua a punto: entre 78 y 82 grados', sub: `El fogón calienta solo; el hielo la baja · ${Math.round(this.temp)} °C`, count: `${Math.min(OK_SECS, Math.floor(this.okT))}/${OK_SECS} s` };
    if (this.ph === 2) return { main: 'Cebar el mate gigante', sub: 'Un Zonda cargado al lado de la pava' };
    if (this.ph === 3) return { main: 'Despertar al Mateendrache', sub: 'Un Illapa cargado, cerca de su pecho' };
    if (this.ph === 4) return { main: 'Las cadenas del dragón', sub: 'Tiros cargados a los grilletes (el del mismo color, de una)', count: `${this.chains.filter((c) => c >= 3).length}/4`, list: this.chainObjs.map((C, i) => [`La cadena del ${ELEM_NAME[C.el]}`, '', this.chains[i] >= 3]) };
    return null;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const tmpV2 = new THREE.Vector3();
const tmpE = new THREE.Euler();
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// El ángulo de la aguja para una temperatura (de 20 a 100, abajo a la izquierda a abajo a la derecha).
function dialA(v) {
  const k = clamp01((v - 20) / 80);
  return Math.PI * 0.75 + k * Math.PI * 1.5;
}

const LINES = {
  cueva: 'Ahí está. El Mateendrache. Hace siglos que duerme y hace siglos que no toma un mate. Por eso está tan de mal humor.',
  fogon: 'Ahora el agua. Ni hervida ni tibia, entre setenta y ocho y ochenta y dos. Si se pasa, un poco de hielo.',
  hirvio: '¡Se les hirvió! Con agua hervida no se ceba ni a un dragón. Otra vez, con paciencia.',
  punto: 'A punto. Ahora que el Zonda levante la pava y la lleve hasta el mate. Sin volcar, ¿eh?',
  cebar: 'Despacito, por el costado de la yerba... así se ceba.',
  despierto: 'Le gustó. Ahora las cadenas. Cada una la selló un elemento... y cada elemento la rompe.',
};
