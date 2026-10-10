import * as THREE from 'three';
import { animateSupremoDisplay } from '../weapons/Supremo';
import { SIX, flareTexture } from '../weapons/supremoFx';

// El despertar del mate supremo del penal: lo que muestra el poder que tiene.
// Lo usan la escena del espinillo cuando se arma (entities/penalForge.js) y el
// final, cuando la Voz lo toca con su luz (ui/PenalCinematic.js).
//  · awaken: tiembla, se levanta de la piedra, se agranda y lo de alrededor se
//    le viene encima.
//  · relicsOut: las seis reliquias (una por easter egg) salen a las puntas de
//    un hexágono y en cada una cae una columna del Juicio.
//  · sigilOn: el sello de los seis soles en el piso y un hexagrama de oro.
//  · judgment: las reliquias vuelven, revienta el sol y una ola de luz barre
//    el penal entero (rayos de los seis colores donde va llegando).
//  · dawn: pasó la ola, llueve oro. settle: vuelve a la piedra.
// Los efectos son los del Mate Supremo (weapons/supremoFx.js: ya compilados);
// en las escenas Weapons no anda: su reloj (SF.update) lo corre cada escena.

const SIX_RGB = SIX.map((c) => {
  const x = new THREE.Color(c);
  return [x.r, x.g, x.b];
});
const GOLD_RGB = [[1, 0.85, 0.45], [1, 0.95, 0.75], [1, 0.72, 0.25]];
const WHITE = new THREE.Color(1, 1, 1);
// cuánto sube sobre la piedra y cuánto se agranda (en la piedra mide 30 cm)
export const HOVER = 3.2;
const BIG = 2.4;
// el hexágono de las reliquias y la ola (hasta la otra punta del penal)
const HEX_R = 5.2;
const HEX_Y = 2.8;
const WAVE_R = 118;
export const WAVE_DUR = 4;
// desde dónde se ve llegar la ola: alto, del otro lado del penal, mirando al cerro
const FAR = [28, 84, 28];
const TAU = Math.PI * 2;

const tmpV = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const ease = (u) => 1 - (1 - u) ** 3;
const rnd = () => Math.random() - 0.5;

export default class SupremoPower {
  // o: { A: el piso del altar, mate: el grupo que se mueve (con `sup`, el de
  // buildSupremoDisplay, adentro), glow: su brillo (hijo del mate), base:
  // dónde está en la piedra, root: donde van las reliquias sueltas, light: una
  // luz ya creada (o nada), now(): el reloj de la escena, later(s, fn),
  // shake(k), onBoom(): lo de cada escena en el estallido, kill: la ola deshace
  // a los muertos del mapa (los mata el anfitrión), bright: cuánto de los
  // fogonazos y de la luz (1: todo; el armado del penal lo baja) }
  constructor(g, o) {
    this.g = g;
    this.o = o;
    this.bright = o.bright ?? 1;
    if (this.SF) this.SF.dim = this.bright;
    this.A = o.A;
    this.mate = o.mate;
    this.sup = o.sup;
    this.glow = o.glow;
    this.base = o.base;
    this.light = o.light || null;
    this.helds = [];
    this.stage = null;
    this.mateK = 0;
    // el que maneja el mate es otro (la Voz se lo lleva)
    this.hold = false;
    this.quiet = false;
    const spr = (map, c, k, white) =>
      new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(c).lerp(WHITE, white).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    // las seis reliquias sueltas: un sol chiquito de cada color (se arman ya,
    // escondidas, para que se compilen con el resto)
    this.orbs = SIX.map((c) => {
      const ob = new THREE.Group();
      const glow = spr(g.textures.dot, c, 2.2 * this.bright, 0);
      glow.scale.setScalar(1.5);
      const star = spr(flareTexture(), c, 2.6 * this.bright, 0.5);
      star.scale.setScalar(2.4);
      ob.add(glow, star);
      ob.visible = false;
      o.root.add(ob);
      return { o: ob, star, from: new THREE.Vector3(), to: new THREE.Vector3(), land: false };
    });
    const gy = g.world.floorAt(45, 50);
    this.groundY = Number.isFinite(gy) ? gy : 0;
  }

  get SF() {
    return this.g.weapons?.supremo?.fx || null;
  }

  get t() {
    return this.o.now();
  }

  shake(k) {
    this.o.shake?.(k);
  }

  // ---------------- los pasos ----------------
  awaken() {
    const g = this.g;
    this.stage = 'rise';
    this.t0 = this.t;
    this.y0 = this.mate.position.y;
    this.sunT = 0;
    // un zumbido hondo que sube, viento y un coro que se abre
    const A = g.audio;
    try {
      const o = A.out({ gain: 0.85, reverb: 0.7 });
      const t = A.now;
      A.tone(o, { t, dur: 3, type: 'sawtooth', freq: 41, freqEnd: 82, gain: 0.05, attack: 1.4 });
      A.tone(o, { t, dur: 3, freq: 55, freqEnd: 110, gain: 0.28, attack: 1.1 });
      A.noise(o, { t, dur: 3, type: 'bandpass', freq: 300, freqEnd: 3200, q: 1.2, gain: 0.25, attack: 2.4 });
      A.choir(o, t + 0.3, [50, 57, 62, 66, 69], { dur: 2.6, gain: 0.03, attack: 2, release: 0.6 });
    } catch {
      /* sin sonido */
    }
  }

  // Las reliquias se sueltan del mate y salen volando a las puntas del cerro
  // (cuando llega cada una, cae su columna: update).
  relicsOut() {
    this.stage = 'six';
    this.t1 = this.t;
    const A = this.A;
    const rel = this.sup.sup?.relics || [];
    this.mate.updateMatrixWorld(true);
    this.orbs.forEach((O, i) => {
      if (rel[i]) {
        rel[i].getWorldPosition(O.from);
        rel[i].visible = false;
      } else O.from.copy(this.mate.position);
      const a = (i / 6) * TAU + 0.26;
      O.to.set(A.x + Math.cos(a) * HEX_R, A.y + HEX_Y, A.z + Math.sin(a) * HEX_R);
      O.o.position.copy(O.from);
      O.o.visible = true;
      O.land = false;
    });
    this.g.audio.whoosh?.(this.mate.position);
  }

  // Cae una reliquia en su punta: la columna del Juicio, su nota y su haz al cielo.
  landOrb(O, i) {
    const g = this.g;
    O.land = true;
    const fy = g.world.floorAt(O.to.x, O.to.z);
    const base = new THREE.Vector3(O.to.x, Number.isFinite(fy) ? fy : this.A.y, O.to.z);
    this.SF?.pillar(base, SIX[i], 0, 0.95);
    // su columna al cielo queda prendida hasta el Juicio
    const top = O.to.clone().setY(O.to.y + 60);
    this.held(O.o.position, top, SIX[i], 0.5);
    this.held(O.o.position, top, 0xffffff, 0.13);
    if (i % 2 === 0) g.fx.flash(tmpV.copy(base).setY(base.y + 1.5), SIX[i], 22 * this.bright, 0.5, 12);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU;
      g.fx.add.spawn(base.x, base.y + 0.1, base.z, Math.cos(a) * (3 + Math.random() * 2), 0.5 + Math.random(), Math.sin(a) * (3 + Math.random() * 2), { color: SIX_RGB[i], size: 0.12, size1: 0, life: 0.6, drag: 2.5 });
    }
    g.weapons?.supremo?.sndPillar?.(base, 0, i);
    this.shake(0.25);
  }

  // El sello de los seis soles se dibuja en el cerro, y un hexagrama de oro
  // une las reliquias; de cada una sale un hilo de su color al mate.
  sigilOn() {
    const g = this.g;
    this.stage = 'sigil';
    this.t2 = this.t;
    const A = this.A;
    this.sig = this.SF?.sigil(tmpV.set(A.x, A.y + 0.06, A.z), 0.5) || null;
    for (let i = 0; i < 6; i++) {
      this.held(this.orbs[i].o.position, this.orbs[(i + 2) % 6].o.position, 0xffd98a, 0.16);
      this.held(this.orbs[i].o.position, this.mate.position, SIX[i], 0.09);
    }
    g.weapons?.supremo?.sndCharge?.(2.7);
    try {
      const Au = g.audio;
      const o = Au.out({ gain: 0.7, reverb: 1 });
      [74, 78, 81, 86].forEach((n, i) => Au.bell(o, Au.now + i * 0.45, n, { gain: 0.06, dur: 3 }));
    } catch {
      /* sin sonido */
    }
  }

  // Un haz que maneja la escena (fx.beam con el brillo puesto a mano cada
  // cuadro y las puntas pegadas a `a` y `b`, que se mueven).
  held(a, b, color, width) {
    const F = this.g.fx;
    F.beam(a, b, { color, width: width * (0.4 + 0.6 * this.bright), life: 1 });
    this.helds.push({ B: F.beams[F.beams.length - 1], a, b, k: 1 });
  }

  // El Juicio del mate: las reliquias vuelven de golpe y, cuando entran, revienta.
  judgment() {
    this.stage = 'boom';
    this.t3 = this.t;
    this.hit = false;
    for (const O of this.orbs) O.from.copy(O.o.position);
    this.g.audio.whoosh?.(this.mate.position);
  }

  // El estallido: el sol del mate, uno en el cielo, la ola de luz que barre el
  // penal entero (con rayos de los seis colores donde va llegando) y la
  // tormenta que se abre.
  detonate() {
    const g = this.g;
    const SF = this.SF;
    const A = this.A;
    const M = this.mate.position;
    const W = g.world;
    this.hit = true;
    this.tb = this.t;
    for (const O of this.orbs) O.o.visible = false;
    for (const H of this.helds) H.k = 0;
    SF?.sun(M, 0, 2.4, false, 1.6);
    SF?.sun(M, 1, 1.5, false, 1.1);
    SF?.sun(tmpV.set(A.x, A.y + 36, A.z), 0, 8, false, 3.4);
    SF?.wave(tmpV.set(A.x, this.groundY, A.z), WAVE_R, WAVE_DUR, 18);
    SF?.wave(tmpV.set(A.x, A.y + 0.05, A.z), 14, 0.5, 5);
    // (cuándo pasa el frente por d: r = R · (1 - (1 - k)³))
    const reach = (d) => (1 - Math.cbrt(Math.max(0, 1 - Math.min(0.99, d / WAVE_R)))) * WAVE_DUR;
    // rayos por todo el penal, cuando les llega la ola
    for (let i = 0; i < 18; i++) {
      let x = 8 + Math.random() * 70;
      let z = 8 + Math.random() * 84;
      // (no pegado a la cámara de lejos: de cerca un rayo es una barra)
      if (Math.hypot(x - FAR[0], z - FAR[1]) < 24) {
        x += 30;
        z -= 30;
      }
      const fy = W.floorAt(x, z);
      const to = new THREE.Vector3(x, Number.isFinite(fy) ? fy : this.groundY, z);
      const top = new THREE.Vector3(x + rnd() * 8, to.y + 28 + Math.random() * 10, z + rnd() * 8);
      const col = SIX[i % 6];
      this.o.later(reach(Math.hypot(x - A.x, z - A.z)) + Math.random() * 0.15, () => {
        g.fx.lightning(top, to, col, 0.45);
        for (let j = 0; j < 14; j++) {
          tmpV.set(rnd(), Math.random() * 0.8 + 0.2, rnd()).normalize().multiplyScalar(3 + Math.random() * 5);
          g.fx.add.spawn(to.x, to.y + 0.3, to.z, tmpV.x, tmpV.y, tmpV.z, { color: j % 3 ? GOLD_RGB[j % 3] : SIX_RGB[i % 6], size: 0.2, size1: 0, life: 0.9, drag: 1.5 });
        }
        if (i % 5 === 0) g.fx.flash(to, col, 40 * this.bright, 0.45, 26);
      });
    }
    // los muertos del mapa se deshacen en luz cuando les llega (el anfitrión los mata)
    if (this.o.kill) {
      const S = g.weapons?.supremo;
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss) continue;
        this.o.later(reach(Math.hypot(z.pos.x - A.x, z.pos.z - A.z)), () => {
          if (!z.active || z.dead) return;
          S?.dissolveFx?.(z, 0, 3);
          if (!g.net?.guest) g.zombies.kill(z, { type: 'luz', noPoints: true });
        });
      }
    }
    // el sol del mate larga chispas para todos lados
    for (let i = 0; i < 220; i++) {
      const flat = i < 120;
      tmpV.set(rnd(), flat ? rnd() * 0.25 : rnd() * 2, rnd()).normalize().multiplyScalar((flat ? 14 : 6) + Math.random() * 10);
      g.fx.add.spawn(M.x, M.y, M.z, tmpV.x, tmpV.y, tmpV.z, { color: i % 3 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.2, size1: 0.01, life: 0.8 + Math.random() * 0.6, drag: 1.4 });
    }
    const K = this.bright;
    g.fx.flash(M, 0xffc860, 140 * K, 1.2, 40);
    if (this.light) {
      this.light.color.set(0xffd070);
      this.light.intensity = 60 * K;
    }
    g.post.flash(0.7 * K);
    if (g.weather) {
      g.weather.flash = K;
      g.weather.set?.('clear', false);
    }
    this.shake(1.6);
    // lo que se escucha: el Juicio, el trueno y otro cuando la ola llega a la otra punta
    g.weapons?.supremo?.sndJuicio?.(null, 0);
    g.audio.thunder?.(null, true);
    this.o.later(WAVE_DUR * 0.8, () => {
      g.audio.thunder?.(null, true);
      this.shake(0.4);
    });
    this.o.onBoom?.();
  }

  // Pasó la ola: vuelven las reliquias a su órbita y llueve oro despacio.
  dawn() {
    this.stage = 'calm';
    this.t4 = this.t;
    for (const h of this.sup.sup?.relics || []) h.visible = true;
  }

  // Vuelve a la piedra, del tamaño de siempre.
  settle(dur = 2) {
    this.stage = 'settle';
    this.t5 = this.t;
    this.settleDur = dur;
    this.from = this.mate.position.clone();
    this.k0 = this.mateK;
    for (const h of this.sup.sup?.relics || []) h.visible = true;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    if (!this.stage) return;
    const g = this.g;
    const t = this.t;
    const A = this.A;
    const M = this.mate.position;
    const W = g.world;
    // los haces que maneja la escena
    for (let i = this.helds.length - 1; i >= 0; i--) {
      const H = this.helds[i];
      if (H.k <= 0) {
        H.B.life = 0;
        this.helds.splice(i, 1);
        continue;
      }
      H.B.a.copy(H.a);
      H.B.b.copy(H.b);
      H.B.life = H.k * (0.85 + Math.random() * 0.15) + dt;
    }
    // el sello: crece, gira y, con el estallido, se abre y se apaga
    const S = this.sig;
    if (S) {
      const U = S.mesh.material.uniforms;
      if (this.stage === 'sigil') {
        const u = clamp01((t - this.t2) / 1.4);
        S.mesh.scale.setScalar(2 * (0.5 + ease(u) * 6.4));
        U.uSpin.value += dt * (0.6 + u * 3);
        U.uK.value = 0.6 * (1 - u);
      } else if (this.hit) {
        const u = clamp01((t - this.tb) / 1.2);
        S.mesh.scale.setScalar(2 * 6.9 * (1 + ease(u) * 0.4));
        U.uSpin.value += dt * Math.max(0.3, 4 - u * 4);
        U.uK.value = u;
        if (u >= 1) {
          this.SF?.release(S);
          this.sig = null;
        }
      } else U.uSpin.value += dt * 5;
    }
    // las reliquias sueltas
    for (const [i, O] of this.orbs.entries()) {
      if (!O.o.visible) continue;
      const p = O.o.position;
      if (this.stage === 'boom') {
        // vuelven de golpe al mate
        const u = clamp01((t - this.t3) / 0.35);
        p.lerpVectors(O.from, M, u * u);
      } else if (!O.land) {
        const u = clamp01((t - this.t1 - i * 0.14) / 0.75);
        p.lerpVectors(O.from, O.to, smooth(u));
        p.y += Math.sin(u * Math.PI) * 1.6;
        if (u > 0) g.fx.add.spawn(p.x, p.y, p.z, rnd() * 0.3, rnd() * 0.3, rnd() * 0.3, { color: SIX_RGB[i], size: 0.22, size1: 0, life: 0.5 });
        if (u >= 1) this.landOrb(O, i);
      } else p.set(O.to.x, O.to.y + Math.sin(t * 2.2 + i) * 0.1, O.to.z);
      O.star.material.rotation = t * (i % 2 ? 1.2 : -1.2);
      O.star.scale.setScalar(2.4 * (1 + Math.sin(t * 7 + i) * 0.12));
    }
    if (this.stage === 'boom' && !this.hit && t - this.t3 >= 0.35) this.detonate();
    // el frente de la ola: chispas que suben del piso por donde va pasando
    if (this.hit) {
      const k = clamp01((t - this.tb) / WAVE_DUR);
      if (k < 1) {
        // (el penal se ve a la luz de la ola, como con un relámpago largo)
        if (g.weather) g.weather.flash = Math.max(g.weather.flash, 0.75 * (1 - k));
        const r = WAVE_R * ease(k);
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * TAU;
          const x = A.x + Math.cos(a) * r;
          const z = A.z + Math.sin(a) * r;
          if (x < 2 || x > 96 || z < 2 || z > 138) continue;
          const fy = W.floorAt(x, z);
          if (!Number.isFinite(fy)) continue;
          g.fx.add.spawn(x, fy + 0.3, z, rnd() * 0.5, 2 + Math.random() * 3, rnd() * 0.5, { color: i % 3 ? GOLD_RGB[i % 3] : SIX_RGB[i % 6], size: 0.3, size1: 0, life: 1.3, gravity: -1.5 });
        }
      }
    }
    // después: llueve oro despacio sobre el cerro
    if (this.stage === 'calm' && !this.quiet) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * TAU;
        const r = Math.random() * 11;
        g.fx.add.spawn(A.x + Math.cos(a) * r, A.y + 8 + Math.random() * 5, A.z + Math.sin(a) * r, rnd() * 0.3, -1 - Math.random(), rnd() * 0.3, { color: GOLD_RGB[i % 3], size: 0.1, size1: 0.03, life: 5 });
      }
    }
    // el mate (hasta que otro se lo lleva)
    if (this.hold || !this.mate.visible || this.stage === 'done') return;
    let y = A.y + HOVER;
    let spin = 5;
    let o = { speed: 6, open: 1.4, lift: 1, kick: 0.3 };
    let jit = 0;
    let glow = 3.4;
    if (this.stage === 'rise') {
      const u = clamp01((t - this.t0) / 2.6);
      y = this.y0 + smooth(u) * (A.y + HOVER - this.y0);
      spin = 0.6 + u * 4.4;
      o = { speed: 1 + u * 5, open: u * 1.4, lift: u, kick: u * 0.4 * (0.5 + 0.5 * Math.sin(t * 23)) };
      jit = 0.03 * (1 - u * 0.6);
      glow = 1.4 + u * 2;
      this.mateK = smooth(clamp01((u - 0.2) / 0.8));
      // lo de alrededor se chupa hacia el mate
      for (let i = 0; i < 5; i++) {
        tmpV.set(rnd(), rnd() * 0.7, rnd()).normalize().multiplyScalar(2 + Math.random() * 2.2);
        g.fx.add.spawn(M.x + tmpV.x, M.y + tmpV.y, M.z + tmpV.z, -tmpV.x * 2.2, -tmpV.y * 2.2, -tmpV.z * 2.2, { color: i % 2 ? SIX_RGB[(i + Math.floor(t * 20)) % 6] : GOLD_RGB[i % 3], size: 0.09, size1: 0.01, life: 0.42 });
      }
      if (Math.random() < dt * 8) g.fx.dust(tmpV.set(A.x + rnd() * 3, A.y + 0.1, A.z + rnd() * 3), { x: 0, y: 1, z: 0 }, [0.5, 0.45, 0.35], 3);
    } else if (this.stage === 'sigil') {
      const u = clamp01((t - this.t2) / 2.6);
      y += u * 0.8;
      spin = 5 + u * 7;
      o = { speed: 6 + u * 6, open: 1.4, lift: 1, kick: 0.3 + u * 0.9 };
      jit = u * 0.04;
      glow = 3.4 + u * 2.4;
      // el sol de la boca late cada vez más seguido
      if (t >= this.sunT) {
        this.sunT = t + 0.45 - u * 0.3;
        this.SF?.sun(M, 0, 0.7 + u * 0.9, true);
      }
    } else if (this.stage === 'boom') {
      const u = this.hit ? clamp01((t - this.tb) / 2) : 0;
      y += 0.8 - u * 0.5;
      spin = this.hit ? 12 - u * 9 : 14;
      o = { speed: this.hit ? 10 - u * 7 : 14, open: 1.4, lift: 1, kick: this.hit ? 1.5 * (1 - u) : 1.2 };
      jit = this.hit ? 0 : 0.07;
      glow = this.hit ? 7 - u * 3 : 6;
    } else if (this.stage === 'calm') {
      const u = clamp01((t - this.t4) / 2);
      y += 0.3 + Math.sin(t * 1.4) * 0.08;
      spin = 3 - u * 2;
      o = { speed: 3 - u * 1.8, open: 1.4 * (1 - smooth(u)), lift: 1 - u * 0.5, kick: 0 };
      glow = 4 - u * 1.8;
    } else if (this.stage === 'settle') {
      const u = clamp01((t - this.t5) / this.settleDur);
      const e = smooth(u);
      y = this.from.y + (this.base.y - this.from.y) * e;
      spin = 2 - e * 1.4;
      o = { speed: 2 - e, open: 0, lift: 1 - e, kick: 0 };
      glow = 2.6 - e * 1.2;
      this.mateK = this.k0 * (1 - e);
      if (u >= 1) {
        // (y la luz vuelve a donde estaba)
        this.stage = 'done';
        if (this.light) this.light.intensity = 0;
      }
    }
    M.set(this.base.x + rnd() * jit * 2, y + rnd() * jit, this.base.z + rnd() * jit * 2);
    const sc = 1 + (BIG - 1) * this.mateK;
    this.mate.scale.setScalar(sc);
    this.mate.rotation.y += dt * spin;
    animateSupremoDisplay(this.sup, dt, g.time, o);
    // (el brillo es hijo del mate: su tamaño en el mundo no crece con él)
    if (this.glow) {
      this.glow.scale.setScalar(glow / sc);
      this.glow.material.opacity = Math.min(1, 0.6 + glow * 0.08) * (0.4 + 0.6 * this.bright);
    }
    if (Math.random() < 0.8) g.fx.sparkle(M, [1, 0.85, 0.4], 2, 0.4 + glow * 0.05);
    // la luz del mate
    const L = this.light;
    if (L && this.stage !== 'done') {
      L.color.set(0xffc050);
      L.position.copy(M).setY(M.y + 0.3);
      L.intensity += (Math.min(18, 4 + glow * 2.5) * this.bright - L.intensity) * Math.min(1, dt * 3);
    }
  }

  // ---------------- tomas ----------------
  // Dónde va la cámara en cada parte (u: de 0 a 1 en la toma, lt: segundos):
  // escribe la posición en `pos` y adónde mira en `look`.
  cam(name, u, lt, pos, look) {
    const A = this.A;
    const e = smooth(u);
    const m = this.mate.position;
    if (name === 'rise') {
      // de abajo, girando alrededor del mate que se levanta (del lado de los
      // gauchos: del otro está el espinillo)
      const a = 0.05 + e * 0.6;
      const R = 2.9 - e * 0.7;
      pos.set(A.x + Math.sin(a) * R, A.y + 0.6 + e * 0.6, A.z + Math.cos(a) * R);
      look.set(m.x, m.y + 0.15, m.z);
    } else if (name === 'six') {
      // de arriba y de lejos: se ve el hexágono entero
      pos.set(A.x + 2.5 - e * 1.5, A.y + 8.5 - e * 1.2, A.z + 12 - e * 2);
      look.set(A.x, A.y + 2.2, A.z);
    } else if (name === 'sigil') {
      // más arriba, girando despacio (del lado de los gauchos: del otro, las capillitas tapan)
      const a = -0.9 + e * 0.8;
      pos.set(A.x + Math.sin(a) * 9.5, A.y + 7.5 - e * 1.2, A.z + Math.cos(a) * 9.5);
      look.set(A.x, A.y + 1.6, A.z);
    } else if (name === 'wave') {
      // el estallido de cerca (a los 0,35 s) y enseguida, de lejos y de arriba,
      // del otro lado del penal: la ola viene barriendo todo y pasa por abajo
      if (lt < 1.1) {
        pos.set(m.x + 3, m.y - 1.4, m.z + 6);
        look.copy(m);
        return;
      }
      const f = smooth(clamp01((lt - 1.1) / 3.7));
      pos.set(FAR[0] + f * 8, FAR[2] - f * 3, FAR[1] - f * 8);
      look.set(A.x - 8, A.y - 2 + f * 5, A.z + 8);
    }
  }

  // Lo que quedaba prendido (si se saltea a la mitad).
  clear() {
    for (const H of this.helds) H.B.life = 0;
    this.helds = [];
    this.SF?.clear();
    if (this.SF) this.SF.dim = 1;
    this.sig = null;
    for (const O of this.orbs) {
      O.o.visible = false;
      O.o.removeFromParent();
    }
    for (const h of this.sup.sup?.relics || []) h.visible = true;
    this.stage = null;
  }
}
