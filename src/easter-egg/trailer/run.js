import * as THREE from 'three';
import Crew from './crew';
import { CamRig } from './kit';
import { clearWorld } from './horde';
import { fpInput } from './fp';

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

// El trailer: el juego de verdad, filmado cuadro por cuadro. Lo carga un
// script de grabación (Playwright) después de lanzar el juego: frena el bucle
// propio del juego y lo avanza a mano con un reloj virtual, así cada cuadro
// dura exactamente 1/fps aunque la placa tarde lo que tarde en dibujarlo.
// Nada de esto se usa en una partida normal.

const realNow = performance.now.bind(performance);
const realRandom = Math.random;
let vnow = null;

// Reloj virtual: lo que mide con performance.now (el agua, el rebote de luz)
// ve el tiempo del video, no el de la compu.
performance.now = () => (vnow == null ? realNow() : vnow);

// Azar con semilla: la misma toma sale igual en la prueba y en la final.
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seed(s) {
  Math.random = s == null ? realRandom : mulberry(s * 7919 + 17);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Todo lo que no es el lienzo, escondido (menús, HUD, carteles de clic).
let styleEl = null;
function hideDom(on) {
  if (on && !styleEl) {
    styleEl = document.createElement('style');
    styleEl.textContent = '.mdu-root > *:not(canvas){visibility:hidden !important}';
    document.head.appendChild(styleEl);
  } else if (!on && styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

export default class Runner {
  constructor(g) {
    this.g = g;
    this.fps = 60;
    this.scale = 1;
    this.shot = null;
    this.frameN = 0;
  }

  // Carga el mapa y arranca una partida sin la entrada, con el bucle del juego frenado.
  async load(map, mode = 'story') {
    const g = this.g;
    this.release();
    g.settings.fpsCap = '0';
    g.settings.voiceMode = 'off';
    g.audio.voiceMode = 'off';
    if (g.state !== 'title') {
      g.toTitle?.();
      for (let i = 0; i < 200 && g.state !== 'title'; i++) await sleep(50);
    }
    g.setMap(map, { save: false, mode });
    for (let i = 0; i < 1200 && g.arrival?.switching; i++) await sleep(50);
    g.startGame();
    for (let i = 0; i < 2400 && g.state !== 'playing'; i++) await sleep(50);
    for (let i = 0; i < 200 && !g.intro?.active; i++) await sleep(50);
    if (g.intro?.active) g.intro.end(false);
    for (let i = 0; i < 100 && g.intro?.active; i++) await sleep(50);
    await sleep(400);
    g.godMode = true;
    g.music?.stop?.(0);
    hideDom(true);
    this.freeze();
    // el clima de base del mapa (cada toma arranca de acá)
    const W = g.weather;
    this.wx = W ? { cur: { ...W.cur }, target: W.target, name: W.name, fogColor: W.fogColor?.clone?.(), flash: 0 } : null;
    return { state: g.state, map: g.mapId };
  }

  // El audio del juego no va en el trailer (la pista es aparte): con el reloj
  // virtual algún sonido calcula NaN y tiraba la toma entera. Cada método del
  // audio queda envuelto: si falla, no pasa nada (out devuelve un nodo mudo).
  muteAudio() {
    const a = this.g.audio;
    if (!a || a.__trailerSafe) return;
    a.__trailerSafe = true;
    const mute = () => a.ctx?.createGain?.() || null;
    const names = new Set();
    for (let o = Object.getPrototypeOf(a); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) names.add(k);
    for (const k of Object.keys(a)) names.add(k);
    for (const k of names) {
      if (k === 'constructor') continue;
      let fn;
      try {
        fn = a[k];
      } catch {
        continue;
      }
      if (typeof fn !== 'function') continue;
      a[k] = function safe(...args) {
        try {
          return fn.apply(a, args);
        } catch {
          return k === 'out' ? mute() : undefined;
        }
      };
    }
  }

  // El bucle del juego deja de correr solo: lo avanza step().
  freeze() {
    const g = this.g;
    if (this.frozen) return;
    this.muteAudio();
    this.frozen = true;
    cancelAnimationFrame(g.raf);
    this.loopWas = g.loop;
    g.loop = () => {};
    vnow = realNow();
  }

  release() {
    const g = this.g;
    if (!this.frozen) return;
    this.frozen = false;
    vnow = null;
    seed(null);
    g.loop = this.loopWas;
    g.last = realNow();
    g.raf = requestAnimationFrame(g.loop);
  }

  // Un cuadro: el juego avanza dt·scale (cámara lenta), la toma pone la cámara y se dibuja.
  step() {
    const g = this.g;
    const dt = 1 / this.fps;
    vnow += dt * 1000;
    const gdt = Math.min(0.05, dt * this.scale);
    this.shot?.before?.(dt, gdt);
    if (g.state === 'playing' || g.state === 'over') g.update(gdt);
    this.shot?.frame?.(dt, gdt);
    g.render(gdt);
    g.input.endFrame();
    this.frameN++;
  }

  // ---------------- tomas ----------------
  // Prepara una toma (carga su mapa si hace falta), corre su "antes" sin
  // filmar y deja todo listo para el primer cuadro. Devuelve cuántos cuadros dura.
  async begin(S, id = '') {
    const g = this.g;
    if (g.mapId !== S.map || !this.frozen || g.state !== 'playing') await this.load(S.map);
    this.end();
    clearWorld(g);
    g.rounds.state = 'hold';
    const W = g.weather;
    if (W && this.wx) {
      Object.assign(W.cur, this.wx.cur);
      W.target = this.wx.target;
      W.name = this.wx.name;
      if (this.wx.fogColor) W.fogColor.copy(this.wx.fogColor);
      W.pulses = null;
      W.flash = 0;
      W.timer = 1e9;
      W.nextBolt = 1e9;
    }
    if (g.vida?.active) g.vida.leave?.(true);
    seed(S.seed ?? hash(id));
    // el haz de la caja se ve como una raya en el cielo: solo en la toma de la caja
    if (g.interact?.box?.beam) g.interact.box.beam.visible = !!S.boxBeam;
    // la exposición de la toma (la luna del estero encandila)
    this.expo0 ??= g.renderer.toneMappingExposure;
    g.renderer.toneMappingExposure = this.expo0 * (S.exposure ?? 1);
    // el haz del easter egg (la columna que marca a dónde ir): fuera de cámara
    if (g.ee?.beam) g.ee.beam.layers.set(S.eeBeam ? 0 : 7);
    this.scale = 1;
    const ctx = { g, T: this, t: -(S.pre || 0), fp: !!S.fp, crew: null, rig: null, S, data: {} };
    ctx.newCrew = () => (ctx.crew = new Crew(g));
    ctx.cam = (o) => (ctx.rig = new CamRig(S.dur, o));
    this.ctx = ctx;
    try {
      await S.setup?.(ctx);
    } catch (err) {
      console.error('[T] setup', id, err);
    }
    this.shot = {
      before: (dt, gdt) => {
        try {
          S.before?.(ctx, ctx.t + dt, dt, gdt);
          if (ctx.fp) fpInput(ctx, gdt);
        } catch (err) {
          console.error('[T] before', id, err);
        }
      },
      frame: (dt, gdt) => {
        ctx.t += dt;
        try {
          S.frame?.(ctx, ctx.t, dt, gdt);
          ctx.crew?.update(gdt, dt);
          if (ctx.rig && !ctx.fp) ctx.rig.apply(g.camera, Math.max(0, ctx.t), dt);
        } catch (err) {
          console.error('[T] frame', id, err);
        }
        if (!ctx.fp) g.weapons.vmRoot.visible = false;
        g.baseFov = g.camera.fov;
      },
    };
    const pre = Math.round((S.pre || 0) * this.fps);
    for (let i = 0; i < pre; i++) this.step();
    return Math.round(S.dur * this.fps);
  }

  // Termina la toma en curso (saca sus muñecos y lo que armó).
  end() {
    const c = this.ctx;
    if (!c) return;
    try {
      c.S.stop?.(c);
    } catch (err) {
      console.error('[T] stop', err);
    }
    c.crew?.dispose();
    this.g.input.releaseAll?.();
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'Space']) this.g.input.down.delete(k);
    this.ctx = null;
    this.shot = null;
    this.scale = 1;
  }

  // Cámara a mano (para las pruebas).
  look(pos, at, fov = 55) {
    const cam = this.g.camera;
    cam.position.set(...pos);
    cam.lookAt(new THREE.Vector3(...at));
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

// Toma por id (el registro se carga recién acá).
Runner.prototype.beginId = async function beginId(id) {
  const { SHOTS } = await import('./shots/index.js');
  const { framesOf } = await import('./edl.js');
  const S = SHOTS[id];
  if (!S) throw new Error(`no hay toma ${id}`);
  // la duración sale del montaje (pulsos), si la toma está en él
  const f = framesOf(id);
  if (f) S.dur = f / this.fps;
  return this.begin(S, id);
};
