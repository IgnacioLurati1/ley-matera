import * as THREE from 'three';
import { EE } from '../config/map';
import { urutauCall } from '../entities/esteros/Saber';

// Los ruidos de la noche del estero (sin archivos: todo sintetizado con
// core/audio.js). Cada cosa sale de un lugar alrededor del jugador:
//  · ranas en la orilla (en el agua baja): el coro que crece y se calma, con
//    tres voces (el croar grave, el "cric-cric" agudo de la ranita y el trino
//    largo del sapo);
//  · grillos en la tierra seca, cada uno con su ritmo;
//  · el urutaú, lejos y muy de vez en cuando (el mismo canto que los del easter
//    egg, que se buscan de oído: los de acá nunca cantan cerca de esos palos);
//  · el agua que golpea en la orilla y algún pez que salta en lo hondo;
//  · el pajonal que se mece con el viento.
// Todo son golpes sueltos (nada queda sonando): si el juego no corre, se calla.
// Lo arma fx/Night.js cuando SKY.night.sounds; update(dt) desde Game.update.

const tmpV = new THREE.Vector3();

export default class NightSounds {
  constructor(g, world, cfg = {}) {
    this.g = g;
    this.w = world;
    this.cfg = cfg;
    this.frogT = 0;
    this.toadT = 4;
    this.treeT = 2;
    this.urutauT = 25 + Math.random() * 30;
    this.lapT = 0;
    this.fishT = 8;
    this.reedT = 1;
    this.chorus = Math.random() * 10;
    // los grillos: cada uno en su lugar, con su tono y su ritmo
    this.crickets = [0, 1, 2, 3].map(() => ({ pos: null, t: Math.random(), f: 4300 + Math.random() * 700, every: 0.55 + Math.random() * 0.5, pulses: 3 + Math.floor(Math.random() * 2), life: 0 }));
  }

  get water() {
    return this.w.water || this.g.water;
  }

  // Un lugar al azar alrededor del jugador, entre r0 y r1 metros, que cumpla `ok`.
  spot(r0, r1, ok, tries = 8) {
    const P = this.g.player.pos;
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r0 + Math.random() * (r1 - r0);
      const x = P.x + Math.cos(a) * d;
      const z = P.z + Math.sin(a) * d;
      if (this.w.inside && !this.w.inside(x, z)) continue;
      const y = ok(x, z);
      if (y !== null) return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  // orilla: agua baja (ahí están las ranas y ahí golpea el agua)
  shore(r0, r1) {
    const W = this.water;
    if (!W) return null;
    return this.spot(r0, r1, (x, z) => {
      const d = W.depthAt(x, z);
      return d > 0.03 && d < 0.7 ? W.level + 0.05 : null;
    });
  }

  land(r0, r1) {
    const W = this.water;
    return this.spot(r0, r1, (x, z) => (W && W.depthAt(x, z) > 0.02 ? null : this.w.floorAt(x, z, 50) + 0.1));
  }

  deep(r0, r1) {
    const W = this.water;
    if (!W) return null;
    return this.spot(r0, r1, (x, z) => (W.depthAt(x, z) > 1.2 ? W.level : null));
  }

  update(dt) {
    const g = this.g;
    const A = g.audio;
    const P = g.player;
    if (!A?.ctx || !P?.pos || g.state !== 'playing') return;
    // buceando no se oye nada de afuera
    if (P.underwater) return;
    const C = this.cfg;
    const wind = g.weather?.cur?.wind ?? 0.15;
    // el coro de ranas sube y baja despacio (y con viento fuerte se calla un poco)
    this.chorus += dt;
    const wave = 0.55 + 0.45 * Math.sin(this.chorus * 0.11) * Math.sin(this.chorus * 0.043 + 1);
    const frogs = (C.frogs ?? 1) * wave * (1 - wind * 0.4);
    this.frogT -= dt;
    if (frogs > 0.05 && this.frogT <= 0) {
      this.frogT = (0.1 + Math.random() * 0.35) / Math.max(0.2, frogs);
      const p = this.shore(6, 30);
      if (p) this.croak(p, 0.5 + Math.random() * 0.5);
    }
    this.treeT -= dt;
    if (frogs > 0.2 && this.treeT <= 0) {
      this.treeT = (0.8 + Math.random() * 2.5) / frogs;
      const p = this.shore(5, 22) || this.land(5, 15);
      if (p) this.treeFrog(p);
    }
    this.toadT -= dt;
    if (this.toadT <= 0) {
      this.toadT = 5 + Math.random() * 9;
      const p = this.shore(12, 35);
      if (p) this.toad(p, frogs);
    }
    // grillos: cada uno cambia de lugar cada tanto
    if ((C.crickets ?? 1) > 0) {
      for (const c of this.crickets) {
        c.life -= dt;
        if (!c.pos || c.life <= 0 || c.pos.distanceToSquared(P.pos) > 30 * 30) {
          c.pos = this.land(5, 20);
          c.life = 8 + Math.random() * 14;
          c.t = 0.5 + Math.random();
        }
        c.t -= dt;
        if (c.pos && c.t <= 0) {
          c.t = c.every * (0.9 + Math.random() * 0.2);
          this.chirp(c);
        }
      }
    }
    // el urutaú: lejos y de vez en cuando (nunca cerca de los del easter egg)
    this.urutauT -= dt;
    if (C.urutau !== false && this.urutauT <= 0) {
      this.urutauT = 40 + Math.random() * 30;
      const quest = EE?.urutau || [];
      const p = this.spot(35, 60, (x, z) => (quest.some((u) => Math.hypot(u[0] - x, u[1] - z) < 25) ? null : this.w.floorAt(x, z, 50) + 4), 12);
      if (p) urutauCall(g, p, 0.5);
    }
    // el agua en la orilla: golpecitos, más con viento
    const W = this.water;
    this.lapT -= dt;
    if (W && (C.lap ?? 1) > 0 && this.lapT <= 0) {
      this.lapT = (0.35 + Math.random() * 0.9) / (0.6 + wind);
      const p = this.shore(1.5, 9);
      if (p) this.lap(p, 0.4 + wind * 0.8);
    }
    // un pez que salta en lo hondo (se ve la onda)
    this.fishT -= dt;
    if (W && this.fishT <= 0) {
      this.fishT = 7 + Math.random() * 14;
      const p = this.deep(8, 26);
      if (p) {
        W.splash(p.x, p.z, 0.3, { sound: false });
        this.plop(p);
      }
    }
    // el pajonal con el viento
    this.reedT -= dt;
    if ((C.reeds ?? 1) > 0 && this.reedT <= 0) {
      this.reedT = (0.6 + Math.random() * 1.4) / (0.3 + wind * 1.5);
      const p = this.land(3, 12);
      if (p) this.rustle(p, 0.25 + wind);
    }
  }

  // ---------------- las voces ----------------
  // La rana criolla: un croar grave y áspero (un zumbido cortado muy rápido).
  croak(p, gain) {
    const A = this.g.audio;
    const c = A.ctx;
    const t = A.now + Math.random() * 0.05;
    const o = A.out({ pos: p, gain: 0.55 * gain, reverb: 0.35, ref: 3 });
    const n = 1 + Math.floor(Math.random() * 3);
    const f = 95 + Math.random() * 60;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 + Math.random() * 400;
    bp.Q.value = 2.5;
    // el traqueteo: la amplitud se abre y se cierra 20-30 veces por segundo
    const am = c.createGain();
    am.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 20 + Math.random() * 10;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    const off = c.createConstantSource();
    off.offset.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    off.connect(am.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.12 + Math.random() * 0.18;
      env.gain.setValueAtTime(0.0001, tt);
      env.gain.exponentialRampToValueAtTime(0.9, tt + 0.02);
      env.gain.setValueAtTime(0.9, tt + d - 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      tt += d + 0.08 + Math.random() * 0.12;
    }
    osc.connect(bp).connect(am).connect(env).connect(o);
    for (const s of [osc, lfo, off]) {
      s.start(t);
      s.stop(tt + 0.05);
    }
  }

  // La ranita trepadora: "cric-cric" agudo y seco.
  treeFrog(p) {
    const A = this.g.audio;
    const o = A.out({ pos: p, gain: 0.3, reverb: 0.3, ref: 2.5 });
    const f = 2200 + Math.random() * 700;
    let t = A.now;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      A.tone(o, { t, dur: 0.05, freq: f, freqEnd: f * 0.9, gain: 0.3, attack: 0.004 });
      A.tone(o, { t: t + 0.025, dur: 0.04, freq: f * 1.02, gain: 0.2, attack: 0.004 });
      t += 0.14 + Math.random() * 0.05;
    }
  }

  // El sapo: un trino grave y largo, lejos.
  toad(p, k) {
    const A = this.g.audio;
    const c = A.ctx;
    const t = A.now;
    const dur = 1 + Math.random() * 1.5;
    const o = A.out({ pos: p, gain: 0.35 * Math.max(0.3, k), reverb: 0.5, ref: 4 });
    const osc = c.createOscillator();
    osc.frequency.value = 230 + Math.random() * 60;
    const am = c.createGain();
    am.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 26 + Math.random() * 8;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    const off = c.createConstantSource();
    off.offset.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    off.connect(am.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.6, t + 0.15);
    env.gain.setValueAtTime(0.6, t + dur - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(am).connect(env).connect(o);
    for (const s of [osc, lfo, off]) {
      s.start(t);
      s.stop(t + dur + 0.05);
    }
  }

  // Un grillo: tres o cuatro pulsos agudos seguidos.
  chirp(cr) {
    const A = this.g.audio;
    const c = A.ctx;
    const t = A.now;
    const o = A.out({ pos: cr.pos, gain: 0.16, reverb: 0.15, ref: 2 });
    const osc = c.createOscillator();
    osc.frequency.value = cr.f;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    for (let i = 0; i < cr.pulses; i++) {
      const a = t + i * 0.03;
      env.gain.setValueAtTime(0, a);
      env.gain.linearRampToValueAtTime(0.5, a + 0.004);
      env.gain.linearRampToValueAtTime(0, a + 0.018);
    }
    osc.connect(env).connect(o);
    osc.start(t);
    osc.stop(t + cr.pulses * 0.03 + 0.05);
  }

  // El agua que golpea la orilla.
  lap(p, gain) {
    const A = this.g.audio;
    const o = A.out({ pos: p, gain: 0.3 * gain, reverb: 0.15, ref: 1.5 });
    A.noise(o, { dur: 0.12 + Math.random() * 0.15, type: 'bandpass', freq: 500 + Math.random() * 500, freqEnd: 250, q: 1.2, gain: 0.8, attack: 0.02 });
    if (Math.random() < 0.4) A.noise(o, { t: A.now + 0.1, dur: 0.08, type: 'bandpass', freq: 1400, freqEnd: 700, q: 2, gain: 0.4, attack: 0.005 });
  }

  // Un pez que salta.
  plop(p) {
    const A = this.g.audio;
    const o = A.out({ pos: tmpV.copy(p), gain: 0.4, reverb: 0.4, ref: 3 });
    A.tone(o, { dur: 0.08, freq: 900, freqEnd: 300, gain: 0.3, attack: 0.003 });
    A.noise(o, { dur: 0.25, type: 'bandpass', freq: 700, freqEnd: 300, q: 1.5, gain: 0.5, attack: 0.005 });
  }

  // El pajonal que se mece.
  rustle(p, gain) {
    const A = this.g.audio;
    const dur = 0.6 + Math.random() * 0.9;
    const o = A.out({ pos: p, gain: 0.22 * gain, reverb: 0.2, ref: 2.5 });
    A.noise(o, { dur, type: 'bandpass', freq: 2600 + Math.random() * 1200, freqEnd: 1800, q: 0.8, gain: 0.7, attack: dur * 0.4 });
  }
}
