import * as THREE from 'three';
import { EE } from '../config/map';
import { animateSupremoDisplay } from '../weapons/Supremo';
import SupremoPower from '../ui/supremoPower';
import { warmScene } from '../ui/cineWarm';
import { glowFront } from '../ui/cineCrew';

// La escena del espinillo (penal): con la tercera pieza en la piedra, el mate
// dorado y la bombilla suprema se levantan, la yerba dorada les echa su oro y
// se funden en el Mate Supremo, que muestra lo que es (ui/supremoPower.js: las
// seis reliquias, el sello y la ola del Juicio, que deshace a los muertos de
// todo el mapa). Vuelve a la piedra, suenan las cadenas... y viene el Gil.
// La ven todos (cada uno en su compu), con la partida quieta y sin HUD, como
// la de la yerba (PenalEgg.scene: Game la maneja con sceneCam). Espacio o Esc
// la saltean; en línea, cuando termina la del anfitrión termina la de todos.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const rnd = () => Math.random() - 0.5;
const GOLD_RGB = [[1, 0.85, 0.45], [1, 0.95, 0.75], [1, 0.72, 0.25]];

export default class PenalForge {
  constructor(ee, onEnd) {
    const g = ee.g;
    this.ee = ee;
    this.g = g;
    this.onEnd = onEnd;
    this.forge = true;
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
    this.shake = 0;
    this.supK = 0;
    this.el = document.createElement('div');
    this.el.className = 'mdu-fcine is-on mdu-fcine--mid';
    this.el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><i class="mdu-fcine__sup"></i><span class="mdu-cine__skip">Saltar (Espacio)</span><i class="mdu-fcine__black"></i>';
    g.root.appendChild(this.el);
    this.blackEl = this.el.querySelector('.mdu-fcine__black');
    this.supEl = this.el.querySelector('.mdu-fcine__sup');
    this.supEl.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle at 50% 50%, rgba(255,252,240,0.97), rgba(255,196,90,0.75) 42%, rgba(90,40,0,0) 82%)';
    // Esc (Game) y Espacio la saltean
    this.cine = { skip: () => this.out() };
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') this.out();
    };
    window.addEventListener('keydown', this.onKey);
    // la piedra y lo que tiene arriba
    const [x, z] = EE.altar;
    const fy = g.world.floorAt(x, z);
    this.A = new THREE.Vector3(x, Number.isFinite(fy) ? fy : ee.altarPos.y - 1, z);
    const A = this.A;
    this.C = new THREE.Vector3(x, A.y + 2.1, z);
    this.M = ee.altarMate;
    this.B = ee.altarBomb;
    this.Y = ee.altarYerba;
    this.S = ee.altarSup;
    this.home = { M: this.M.position.clone(), B: this.B.position.clone(), Mr: this.M.rotation.clone(), Br: this.B.rotation.clone(), S: this.S.position.clone() };
    this.M.visible = true;
    this.B.visible = true;
    this.Y.visible = true;
    this.S.visible = false;
    // el brillo del Supremo (hijo suyo, como en el final)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xffc84a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.glow.scale.setScalar(1.4);
    this.S.add(this.glow);
    // la luz: una de las del cerro (ya existen: sumar luces recompila todo)
    const L = g.arena?.lights?.[1] || null;
    this.light = L;
    if (L) {
      this.lightWas = { pos: L.position.clone(), color: L.color.clone(), intensity: L.intensity, distance: L.distance };
      L.distance = 14;
      L.color.set(0xffc050);
      L.intensity = 0;
    }
    this.power = new SupremoPower(g, {
      A,
      mate: this.S,
      sup: this.S,
      glow: this.glow,
      base: this.home.S,
      root: ee.root,
      light: L,
      now: () => this.t,
      later: (s, fn) => this.later(s, fn),
      shake: (k) => {
        this.shake = Math.max(this.shake, k);
      },
      onBoom: () => {
        this.supK = 0.7;
      },
      kill: true,
    });
    // ni el haz de la caja (desde arriba del penal queda como una barra)
    this.boxBeams = [g.interact?.box, ...(g.interact?.saleBoxes || [])].map((b) => b?.beam).filter((b) => b?.visible);
    for (const b of this.boxBeams) b.visible = false;
    g.hud.show(false);
    this.black(1, 0);
    this.script = this.buildScript();
    // todo lo que va a aparecer se compila ya, en segundo plano
    warmScene(g);
  }

  buildScript() {
    const P = this.power;
    return [
      // se abre sobre la piedra: el mate y la bombilla se levantan
      [0, () => {
        this.black(0, 0.6);
        this.gather();
        this.shotGather();
        return 2.8;
      }],
      // se funden: aparece el Mate Supremo
      [0, () => {
        this.fuse();
        return 1.3;
      }],
      [0, () => {
        // (de acá en adelante el mate lo mueve el despertar)
        this.stage = 'power';
        P.awaken();
        this.shot('rise', 3);
        return 2.9;
      }],
      [0, () => {
        P.relicsOut();
        this.shot('six', 2.8);
        return 2.7;
      }],
      [0, () => {
        P.sigilOn();
        this.shot('sigil', 2.7);
        return 2.6;
      }],
      [0, () => {
        P.judgment();
        this.shot('wave', 4.8);
        return 4.6;
      }],
      [0, () => {
        P.dawn();
        this.shot('dawn', 4.2);
        return 1.6;
      }],
      // vuelve a la piedra
      [0, () => {
        P.settle(2.2);
        return 2.4;
      }],
      // ... y algo se mueve entre las banderas
      [0, () => {
        this.omen();
        this.shot('omen', 2);
        return 1.8;
      }],
      [0, () => {
        this.out();
        return 99;
      }],
    ];
  }

  later(secs, fn) {
    this.timers.push({ t: this.t + secs, fn });
  }

  black(v, fade = 0) {
    this.blackEl.style.transition = fade ? `opacity ${fade}s` : 'none';
    this.blackEl.style.opacity = String(v);
  }

  // ---------------- lo que pasa ----------------
  // El mate y la bombilla se levantan de la piedra y giran; la yerba les echa
  // su oro; un zumbido y un coro que sube.
  gather() {
    const g = this.g;
    this.gT = this.t;
    this.stage = 'gather';
    g.audio.thunderCrack?.(this.C.clone(), { dur: 1, gain: 0.45, big: true });
    const A = g.audio;
    try {
      const o = A.out({ gain: 0.8, reverb: 0.8 });
      const t = A.now;
      A.tone(o, { t, dur: 4, freq: 49, freqEnd: 98, gain: 0.25, attack: 1.2 });
      A.noise(o, { t, dur: 4, type: 'bandpass', freq: 250, freqEnd: 2600, q: 1.1, gain: 0.2, attack: 3 });
      A.choir(o, t + 0.4, [45, 52, 57, 61, 64], { dur: 3.4, gain: 0.03, attack: 2.4, release: 0.8 });
    } catch {
      /* sin sonido */
    }
  }

  // Chocan en el medio: un fogonazo y queda el Mate Supremo.
  fuse() {
    const g = this.g;
    const C = this.C;
    this.stage = 'fuse';
    this.fT = this.t;
    this.M.visible = false;
    this.B.visible = false;
    const S = this.S;
    S.position.copy(C);
    S.scale.setScalar(1);
    S.visible = true;
    this.power.SF?.sun(C, 0, 0.8, false, 0.7);
    g.fx.flash(C, 0xffd070, 90, 0.8, 18);
    g.fx.sparkle(C, [1, 0.9, 0.55], 80, 1.2);
    for (let i = 0; i < 90; i++) {
      tmpV.set(rnd(), rnd(), rnd()).normalize().multiplyScalar(4 + Math.random() * 6);
      g.fx.add.spawn(C.x, C.y, C.z, tmpV.x, tmpV.y, tmpV.z, { color: GOLD_RGB[i % 3], size: 0.14, size1: 0, life: 0.7 + Math.random() * 0.4, drag: 1.8 });
    }
    g.post.flash(0.4);
    this.supK = 0.3;
    this.shake = Math.max(this.shake, 0.6);
    g.audio.thunderCrack?.(C.clone(), { dur: 1.1, gain: 0.6, big: true });
    g.audio.powerupGrab?.();
  }

  // Suenan las cadenas, un trueno colorado y la piedra se prende roja: el Gil.
  omen() {
    const g = this.g;
    const A = this.A;
    this.omenOn = true;
    g.audio.chain?.(tmpV.set(A.x, A.y + 1, A.z));
    this.later(0.35, () => g.audio.chain?.(tmpV.set(A.x + 3, A.y + 1, A.z - 2)));
    g.audio.thunder?.(null, true);
    g.fx.lightning(tmpV.set(A.x - 2, A.y + 26, A.z - 3), tmpW.set(A.x - 2.3, A.y + 0.2, A.z + 0.4), 0xff3a2a, 0.8);
    g.fx.flash(tmpV.set(A.x, A.y + 1.5, A.z), 0xff3a2a, 60, 0.9, 16);
    if (g.weather) g.weather.flash = 1;
    this.shake = Math.max(this.shake, 0.8);
  }

  // ---------------- tomas ----------------
  shot(name, dur) {
    this.cam = { name, t0: this.t, dur };
  }

  shotGather() {
    this.shot('gather', 4.2);
  }

  // Dónde va la cámara (las del despertar están en ui/supremoPower.js).
  camAt(name, u, lt, pos, look) {
    const A = this.A;
    const e = smooth(u);
    if (name === 'gather') {
      // bajito, girando despacio alrededor de la piedra
      const a = 0.25 + e * 0.5;
      pos.set(A.x + Math.sin(a) * 3.2, A.y + 1.1 + e * 0.5, A.z + Math.cos(a) * 3.2);
      look.set(A.x, A.y + 1.5 + e * 0.5, A.z);
    } else if (name === 'dawn') {
      // de costado, a la altura del mate, y baja con él a la piedra
      const m = this.S.position;
      pos.set(A.x + 2.6 - e * 0.6, A.y + 2.6 - e * 1, A.z + 3.4 - e * 0.6);
      look.set(m.x, m.y + 0.1, m.z);
    } else if (name === 'omen') {
      // la piedra y el espinillo, desde abajo: el trueno colorado
      pos.set(A.x + 1.5 + e * 0.3, A.y + 1, A.z + 4.5 + e * 0.6);
      look.set(A.x - 0.5, A.y + 1.8 + e * 0.6, A.z - 0.5);
    } else this.power.cam(name, u, lt, pos, look);
  }

  // ---------------- cuadro a cuadro (PenalEgg.sceneCam) ----------------
  update(dt) {
    const g = this.g;
    if (this.done) return true;
    this.t += dt;
    const t = this.t;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    while (!this.done && this.step < this.script.length && t >= this.next + this.script[this.step][0]) {
      const [wait, fn] = this.script[this.step];
      const start = this.next + wait;
      this.step++;
      const dur = fn() || 0;
      this.next = Math.max(start, t) + dur;
    }
    if (this.done) return true;
    if (g.vida?.hand) g.vida.hand.root.visible = false;
    this.updatePieces(dt);
    this.power.update(dt);
    // los efectos del Mate Supremo (Weapons no anda en las escenas)
    this.power.SF?.update(dt, g.time);
    if (this.supK > 0) {
      this.supK = Math.max(0, this.supK - dt * 1.6);
      this.supEl.style.opacity = String(Math.min(1, this.supK));
    }
    // la cámara
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      this.camAt(C.name, clamp01(lt / C.dur), lt, tmpV, tmpW);
      const fy = g.world.floorAt(tmpV.x, tmpV.z);
      if (Number.isFinite(fy)) tmpV.y = Math.max(tmpV.y, fy + 0.4);
      this.shake = Math.max(0, this.shake - dt * 0.8);
      const s = this.shake * 0.08;
      cam.position.set(tmpV.x + rnd() * s, tmpV.y + rnd() * s, tmpV.z + rnd() * s);
      cam.lookAt(tmpW);
    }
    // el brillo del Supremo, del lado de la cámara: centrado en el mate, en la
    // piedra le cortaba la mitad de abajo en línea recta (ui/cineCrew.js). Su
    // tamaño es el que le puso supremoPower (o fuse) este cuadro, si le puso;
    // si no, el de antes.
    if (this.S.visible && this.glow.parent) {
      if (this.glowSet == null || Math.abs(this.glow.scale.x - this.glowSet) > 1e-6) this.glowSize = this.glow.scale.x * this.S.scale.x;
      glowFront(this.glow, this.S, cam.position, this.glowSize);
      this.glowSet = this.glow.scale.x;
    }
    return true;
  }

  // El mate y la bombilla antes de fundirse (después, el Supremo antes de despertar).
  updatePieces(dt) {
    const g = this.g;
    const t = this.t;
    const C = this.C;
    if (this.stage === 'gather') {
      const lt = t - this.gT;
      const up = smooth(clamp01(lt / 1.2));
      const r = 0.75 - clamp01(lt / 2.8) * 0.4;
      const a = lt * (2 + lt * 1.2);
      const bob = Math.sin(t * 2.4) * 0.06;
      this.M.position.lerpVectors(this.home.M, tmpV.set(C.x + Math.cos(a) * r, C.y + bob, C.z + Math.sin(a) * r), up);
      this.B.position.lerpVectors(this.home.B, tmpV.set(C.x - Math.cos(a) * r, C.y + 0.2 - bob, C.z - Math.sin(a) * r), up);
      this.M.rotation.y += dt * (1 + lt * 2);
      this.B.rotation.y -= dt * (1.5 + lt * 2);
      this.B.rotation.z = -0.25 + Math.sin(t * 3) * 0.2;
      // al final se juntan de golpe
      if (lt > 2.5) {
        const k = smooth(clamp01((lt - 2.5) / 0.3));
        this.M.position.lerp(C, k);
        this.B.position.lerp(tmpV.copy(C).setY(C.y + 0.15), k);
      }
      // la yerba les echa su oro: un chorro que sube de la piedra al mate
      const Yp = this.Y.getWorldPosition(tmpW);
      for (let i = 0; i < 4; i++) {
        tmpV.subVectors(this.M.position, Yp);
        g.fx.add.spawn(Yp.x + rnd() * 0.15, Yp.y + 0.1, Yp.z + rnd() * 0.15, tmpV.x * 1.6 + rnd() * 0.3, tmpV.y * 1.6 + rnd() * 0.3, tmpV.z * 1.6 + rnd() * 0.3, { color: GOLD_RGB[i % 3], size: 0.07, size1: 0.02, life: 0.62 });
      }
      g.fx.beam(this.M.position, this.B.position, { color: 0xffd98a, width: 0.03, life: 0.05 });
      if (Math.random() < 0.7) g.fx.sparkle(this.M.position, [1, 0.85, 0.4], 2, 0.3);
      this.glowPiece(lt);
    } else if (this.stage === 'fuse') {
      // el Supremo recién hecho, girando en el aire antes de despertar
      this.S.rotation.y += dt * 1.2;
      this.S.position.y = C.y + Math.sin(t * 2) * 0.05;
      animateSupremoDisplay(this.S, dt, g.time, { speed: 2, open: 0.3, lift: 0.3 });
      this.glow.scale.setScalar(1.6);
      if (Math.random() < 0.6) g.fx.sparkle(this.S.position, [1, 0.85, 0.4], 2, 0.4);
    }
  }

  // La luz del cerro sigue al oro que se levanta.
  glowPiece(lt) {
    const L = this.light;
    if (!L) return;
    L.position.copy(this.C).setY(this.C.y + 0.4);
    L.intensity = Math.min(12, lt * 5);
  }

  // ---------------- el final ----------------
  // A negro y, del otro lado, de vuelta a la partida.
  out() {
    if (this.leaving || this.done) return;
    this.leaving = true;
    this.black(1, 0.35);
    setTimeout(() => this.end(), 380);
  }

  end() {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
    this.power.clear();
    // el Supremo queda en la piedra, como siempre (y el mate y la bombilla, adentro)
    const S = this.S;
    S.position.copy(this.home.S);
    S.scale.setScalar(1);
    this.glow.removeFromParent();
    this.glow.material.dispose();
    this.M.position.copy(this.home.M);
    this.M.rotation.copy(this.home.Mr);
    this.B.position.copy(this.home.B);
    this.B.rotation.copy(this.home.Br);
    const L = this.light;
    if (L && this.lightWas) {
      L.position.copy(this.lightWas.pos);
      L.color.copy(this.lightWas.color);
      L.intensity = this.lightWas.intensity;
      L.distance = this.lightWas.distance;
    }
    for (const b of this.boxBeams) b.visible = true;
    if (g.state === 'playing' || g.state === 'paused') g.hud.show(true);
    g.player.guardT = g.time + 2;
    // se vuelve a la partida desde negro
    const black = document.createElement('i');
    black.className = 'mdu-fcine__black';
    black.style.cssText = 'opacity:1;z-index:50;transition:none';
    g.root.appendChild(black);
    void black.offsetWidth;
    black.style.transition = 'opacity 0.5s';
    black.style.opacity = '0';
    setTimeout(() => black.remove(), 700);
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }

  dispose() {
    this.onEnd = null;
    this.end();
  }
}
