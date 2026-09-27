import * as THREE from 'three';
import { PROPS } from '../../config/map';
import { mesh } from '../../world/props';

// La canción escondida del castillo: tres muñecos de nieve gauchos (uno en el
// patio, uno en el torreón del este del adarve y uno en la cumbre). Con F cada
// uno silba su nota y se le prenden los ojos; con los tres, suena "El
// carnavalito del Mateendrache" (erke, quena, charango y bombo legüero) para
// todos. Decide el anfitrión.

const NOTES = [76, 72, 69];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export default class Munecos {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.done = false;
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ad8ff).multiplyScalar(2), toneMapped: false });
    this.list = PROPS.filter((p) => p.type === 'munecoNieve').map((def, i) => {
      const [x, z] = def.pos;
      const y = g.world.floorAt(x, z);
      const rot = def.rot || 0;
      // los ojos que se prenden cuando canta (van sobre los de carbón)
      const eyes = new THREE.Group();
      eyes.position.set(x, y, z);
      eyes.rotation.y = rot;
      for (const s of [-1, 1]) eyes.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), eyeMat, s * 0.1, 1.94, 0.27));
      eyes.visible = false;
      egg.root.add(eyes);
      const m = { i, def, eyes, on: false, pos: new THREE.Vector3(x, y + 1.6, z) };
      g.interact.add({
        kind: 'muneco',
        pos: m.pos,
        radius: 1.7,
        prompt: () => (m.on || this.done ? null : { text: 'saludar al muñeco de nieve', noCost: true }),
        cost: () => 0,
        use: () => {
          if (m.on || this.done) return false;
          this.sing(i);
          g.net?.event('ee', { sn: i });
          return true;
        },
      });
      return m;
    });
  }

  // (en todas las compus) el muñeco silba su nota; con los tres, la canción
  sing(i, quiet = false) {
    const m = this.list[i];
    if (!m || m.on) return;
    m.on = true;
    m.eyes.visible = true;
    const g = this.g;
    if (!quiet) this.whistle(m.pos, NOTES[i % NOTES.length]);
    if (this.list.every((q) => q.on) && !this.done) {
      this.done = true;
      if (!quiet) g.later(1.4, () => this.song());
    }
  }

  apply(m, quiet) {
    if (m.sn != null) this.sing(m.sn | 0, quiet);
    if (m.sns) m.sns.forEach((on, i) => on && this.sing(i, true));
  }

  state() {
    return { sns: this.list.map((m) => (m.on ? 1 : 0)) };
  }

  whistle(pos, n) {
    const a = this.g.audio;
    if (!a?.out) return;
    const o = a.out({ pos, gain: 0.6, reverb: 0.5 });
    const t = a.now;
    a.tone(o, { t, dur: 0.9, type: 'sine', freq: midi(n + 12), gain: 0.14, attack: 0.05 });
    a.tone(o, { t: t + 0.05, dur: 0.8, type: 'sine', freq: midi(n + 12) * 1.005, gain: 0.06, attack: 0.1 });
    a.noise(o, { t, dur: 0.9, type: 'bandpass', freq: midi(n + 24), q: 6, gain: 0.03, attack: 0.1 });
  }

  // "El carnavalito del Mateendrache": 2/4 a 120, en la menor. Erke de
  // entrada, quena con la melodía, charango rasgueado y bombo legüero.
  song() {
    const g = this.g;
    const a = g.audio;
    if (!a?.out) return;
    g.hud.subtitle('Suena "El carnavalito del Mateendrache"', 4);
    const o = a.out({ gain: 0.8, reverb: 0.5, bus: a.music });
    const e = 0.25;
    const bar = 4 * e;
    const t0 = a.now + 0.3;
    const CH = { Am: [45, 57, 60, 64], C: [48, 55, 60, 64], G: [43, 55, 59, 62], F: [41, 57, 60, 65], E: [40, 56, 59, 64] };
    const A = [
      [[76, 1], [76, 1], [74, 1], [72, 1]], [[74, 1], [72, 1], [69, 2]], [[76, 1], [76, 1], [74, 1], [72, 1]], [[74, 2], [76, 2]],
      [[79, 1], [79, 1], [76, 1], [74, 1]], [[76, 1], [74, 1], [72, 2]], [[72, 1], [74, 1], [72, 1], [67, 1]], [[69, 4]],
    ];
    const B = [
      [[81, 1], [81, 1], [79, 1], [76, 1]], [[79, 1], [76, 1], [74, 2]], [[76, 1], [76, 1], [74, 1], [72, 1]], [[74, 2], [69, 2]],
      [[72, 1], [74, 1], [76, 1], [79, 1]], [[81, 2], [79, 1], [76, 1]], [[74, 1], [76, 1], [72, 1], [71, 1]], [[69, 4]],
    ];
    const CA = ['Am', 'Am', 'C', 'G', 'C', 'G', 'E', 'Am'];
    const CB = ['Am', 'G', 'C', 'G', 'F', 'C', 'E', 'Am'];
    const form = [
      ['intro', null, ['Am', 'Am', 'E', 'Am']],
      ['A', A, CA],
      ['B', B, CB],
      ['A', A, CA],
      ['B', B, CB],
      ['end', null, ['Am', 'Am']],
    ];
    // el erke llama al principio
    for (const [dt, f, d] of [[0, 110, 0.5], [0.9, 110, 0.5], [1.8, 146.8, 1.6]]) {
      a.tone(o, { t: t0 + dt, dur: d, type: 'sawtooth', freq: f, gain: 0.1, attack: 0.06, release: 0.3 });
      a.tone(o, { t: t0 + dt, dur: d, type: 'square', freq: f * 2, gain: 0.03, attack: 0.06, release: 0.3 });
    }
    let t = t0;
    for (const [, mel, chords] of form) {
      chords.forEach((ch, i) => {
        const bt = t + i * bar;
        const [root, ...tones] = CH[ch];
        // bombo: bom en el 1, tac en el 2 y en el "y" del 2
        a.tone(o, { t: bt, dur: 0.3, freq: 72, freqEnd: 45, gain: 0.45 });
        a.tone(o, { t: bt + 2 * e, dur: 0.2, freq: 80, freqEnd: 55, gain: 0.25 });
        for (const k of [2, 3]) a.noise(o, { t: bt + k * e, dur: 0.04, type: 'bandpass', freq: 1900, q: 2, gain: 0.22 });
        // el bajo y el charango rasgueado (cuatro rasguidos por compás)
        a.tone(o, { t: bt, dur: bar * 0.9, type: 'triangle', freq: midi(root), gain: 0.22, release: 0.3 });
        for (let k = 0; k < 4; k++) {
          const acc = k % 2 === 0 ? 1 : 0.6;
          tones.forEach((n, s) => a.tone(o, { t: bt + k * e + s * 0.012, dur: 0.22, type: 'triangle', freq: midi(n + 12), gain: 0.035 * acc, attack: 0.002, release: 0.15 }));
        }
        // la quena
        if (mel) {
          let mt = bt;
          for (const [n, d] of mel[i]) {
            a.tone(o, { t: mt, dur: d * e * 0.95, type: 'sine', freq: midi(n), gain: 0.15, attack: 0.02, release: 0.12 });
            a.tone(o, { t: mt, dur: d * e * 0.9, type: 'triangle', freq: midi(n + 12), gain: 0.018, attack: 0.02, release: 0.1 });
            a.noise(o, { t: mt, dur: 0.06, type: 'bandpass', freq: midi(n + 12), q: 3, gain: 0.03 });
            mt += d * e;
          }
        }
      });
      t += chords.length * bar;
    }
    // el final: acorde largo y el erke otra vez, lejos
    for (const n of CH.Am) a.tone(o, { t, dur: 2.2, type: 'triangle', freq: midi(n + 12), gain: 0.05, release: 1.5 });
    a.tone(o, { t, dur: 0.5, freq: 72, freqEnd: 45, gain: 0.5 });
    a.tone(o, { t: t + 0.2, dur: 1.8, type: 'sawtooth', freq: 110, gain: 0.06, attack: 0.1, release: 0.6 });
    g.later(t - a.now + 1, () => g.hud.achievement?.('Carnavalito', 'Hiciste cantar a los tres muñecos de nieve'));
  }
}
