import * as THREE from 'three';
import './intro.css';
import { MAP_ID, MODE, ZONES, START_ZONE } from '../config/map';
import { SCRIPTS } from './introShots';

// Cinemática de entrada de cada mapa: antes de la primera ronda, unos paneos
// del lugar con carteles que cuentan qué hay que hacer ahí, y al final la
// cámara baja hasta los ojos del jugador y arranca la partida. Las tomas, los
// carteles, la música y los muñecos de cada mapa están en ui/introShots.js.
//
// Para que no se trabe:
//  · los muñecos se arman con el mapa (escondidos), así la compilación de la
//    carga (ui/Arrival) ya los incluye;
//  · durante la carga se dibuja un cuadro desde cada toma (`warm`): las
//    texturas y las sombras de todo lo que se va a ver suben a la placa ahí;
//  · no se agregan ni se sacan luces (cambiar la cantidad recompila todo).
//
// Mientras dura, la partida está quieta (Game la trata como una escena: no
// corren las rondas ni los zombies) y se callan las voces. Esc (o Espacio, o
// Enter) la saltea: con el mouse capturado, Esc lo suelta y Game.onLockChange
// avisa acá en vez de pausar. En línea hace falta que la salteen todos, y cuando termina la del
// anfitrión termina la de todos.

const tmpP = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const EASE = {
  lin: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inout: (u) => u * u * (3 - 2 * u),
  // arranca y frena más suave (cúbica)
  soft: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
};

// Un recorrido por puntos: recta si son dos, curva suave si son más.
export function path(pts) {
  const v = pts.map((p) => new THREE.Vector3(...p));
  if (v.length === 1) return (u, out) => out.copy(v[0]);
  if (v.length === 2) return (u, out) => out.lerpVectors(v[0], v[1], u);
  const c = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  return (u, out) => c.getPoint(u, out);
}

// Orientación de una cámara que mira de `eye` a `at`.
function lookQuat(eye, at, out) {
  tmpM.lookAt(eye, at, UP);
  return out.setFromRotationMatrix(tmpM);
}

export default class Intro {
  constructor(g) {
    this.g = g;
    this.map = MAP_ID;
    this.active = false;
    this.fov = 55;
    this.el = null;
    // (el Challenge de la torre tiene la suya: sin personajes ni historia)
    const make = (MODE === 'challenge' && SCRIPTS[`${MAP_ID}Reto`]) || SCRIPTS[MAP_ID];
    // el guion del mapa (arma sus muñecos ya, escondidos)
    const before = new Set(g.scene.children);
    this.S = make ? make(g, this) : null;
    // lo que el guion colgó de la escena: al terminar, lo que quedó sin nada a
    // la vista sale de la escena (three lo recorría igual en cada cuadro de la
    // partida) y play() lo vuelve a poner
    this.own = g.scene.children.filter((o) => !before.has(o));
    this.parked = [];
    if (!this.S) return;
    let t = 0;
    for (const s of this.S.shots) {
      s.t0 = t;
      t += s.d;
      if (s.cam) s.camAt = path(s.cam);
      if (s.look) s.lookAt = path(s.look);
    }
    this.total = t;
    this.cues = (this.S.cues || []).slice().sort((a, b) => a[0] - b[0]);
    this.onKey = (e) => {
      if (e.code !== 'Escape' && e.code !== 'Space' && e.code !== 'Enter') return;
      if (!this.active || this.g.state !== 'playing' || this.g.menuOpen) return;
      e.preventDefault();
      this.skip();
    };
  }

  // Lo que el guion necesita antes de arrancar (clips, cuerpos de verdad):
  // ui/Arrival lo espera en la carga. Sin nada que esperar, ya.
  ready() {
    return this.S?.ready ? this.S.ready() : Promise.resolve();
  }

  // ---------------- arranque ----------------
  // Lo llama Arrival cuando arranca la partida. Devuelve si hay cinemática.
  // at: en línea, cuándo arrancó para todos (performance.now() de esta compu:
  // la orden del anfitrión más el sorbo, Arrival.go).
  play({ at = null } = {}) {
    const g = this.g;
    if (!this.S || this.active) return false;
    this.active = true;
    this.t = 0;
    // en línea el reloj cuenta desde la orden de arranque (la regla de las
    // escenas, ui/FarmCinematic): la compu que tarda en armar la partida, o que
    // terminó de cargar tarde, arranca adelantada lo que se atrasó (pasado el
    // final, entra directo). Antes contaba desde el primer cuadro y ese primer
    // cuadro sumaba la edad de la página: con 2 jugadores, 10-22 s de desfase.
    // Solo, como antes. (globalThis.__mduNoIntroSync: como antes también en línea)
    this.wallAt = 0;
    if (g.net && globalThis.__mduNoIntroSync !== true) {
      const now = performance.now();
      this.wallAt = now;
      if (at != null) this.t = Math.max(0, (now - at) / 1000);
    }
    this.shotI = -1;
    this.cueI = 0;
    this.out = null;
    this.votes = new Set();
    this.shakeK = 0;
    this.lidK = 0;
    this.blackTw = null;
    this.blackV = -1;
    this.cardsOn = [];
    this.fog0 = g.weather?.cur.fog ?? null;
    this.fogK = 1;
    for (const o of this.parked) g.scene.add(o);
    this.parked.length = 0;
    this.buildDom();
    g.hud.show(false);
    g.weapons.vmRoot.visible = false;
    if (this.S.hideTeam && g.net?.avatars) g.net.avatars.root.visible = false;
    // la música de la cinemática va por su propio canal (se apaga si se saltea)
    const a = g.audio;
    this.bus = a.out({ gain: 1, reverb: 0.5, bus: a.music });
    // la canción de la entrada del mapa (core/music.js); la música de los
    // guiones queda de fondo, bajita (no en el final del castillo, que usa
    // la entrada del molino adentro de su cinemática)
    // (en línea, si arrancó atrasada, la canción también va por donde va la entrada)
    if (!g.cine && g.music?.play(`intro-${this.map}`, { at: this.t > 0.5 ? this.t : 0, while: (G) => G.state === 'playing' || G.state === 'paused' })) this.bus.gain.value = 0.4;
    this.S.start?.(this);
    window.addEventListener('keydown', this.onKey);
    return true;
  }

  buildDom() {
    const el = document.createElement('div');
    el.className = `mdu-intro mdu-intro--${this.map}`;
    el.innerHTML =
      '<i class="mdu-intro__black"></i><i class="mdu-intro__lid"></i><i class="mdu-intro__lid mdu-intro__lid--b"></i>' +
      '<i class="mdu-intro__bar"></i><i class="mdu-intro__bar mdu-intro__bar--b"></i>' +
      `<h1 class="mdu-intro__title"></h1><p class="mdu-intro__place"></p>` +
      '<p class="mdu-intro__card"></p><p class="mdu-intro__card mdu-intro__card--low"></p>' +
      '<p class="mdu-intro__where"></p><p class="mdu-intro__skip"></p>';
    el.querySelector('.mdu-intro__title').textContent = this.S.title;
    el.querySelector('.mdu-intro__place').textContent = this.S.place || '';
    this.g.root.appendChild(el);
    this.el = el;
    this.blackEl = el.querySelector('.mdu-intro__black');
    this.lids = el.querySelectorAll('.mdu-intro__lid');
    const [mid, low] = el.querySelectorAll('.mdu-intro__card');
    this.cardEl = { mid, low };
    this.whereEl = el.querySelector('.mdu-intro__where');
    this.skipEl = el.querySelector('.mdu-intro__skip');
    this.showSkip();
  }

  // ---------------- lo que usan los guiones ----------------
  // Un cartel que se va escribiendo letra por letra. `low`: abajo, sobre la toma.
  card(text, { low = false, d = 3.5, speed = 24 } = {}) {
    const el = this.cardEl?.[low ? 'low' : 'mid'];
    if (!el) return;
    // cada letra ya está puesta (invisible): así el renglón no salta al escribirse
    el.innerHTML = '';
    const spans = [];
    for (const ch of text) {
      const s = document.createElement('i');
      s.textContent = ch;
      el.appendChild(s);
      spans.push(s);
    }
    el.classList.add('is-on');
    const c = { el, spans, t0: this.t, speed, until: this.t + d, k: 0 };
    this.cardsOn = this.cardsOn.filter((x) => x.el !== el);
    this.cardsOn.push(c);
  }

  // El nombre del mapa, grande.
  title(on = true) {
    this.el?.classList.toggle('is-title', on);
  }

  // El sello de abajo a la izquierda (dónde es la toma).
  where(text) {
    if (!this.whereEl) return;
    this.whereEl.textContent = text || '';
    this.whereEl.classList.toggle('is-on', !!text);
  }

  // Fundido a negro (v de 0 a 1) en `secs`.
  dark(v, secs = 0.5) {
    this.blackTw = { from: this.blackCur ?? 0, to: v, t0: this.t, d: Math.max(0.01, secs) };
  }

  shake(k) {
    this.shakeK = Math.max(this.shakeK, k);
  }

  // Los párpados (0 abiertos, 1 cerrados).
  lid(k) {
    this.lidK = k;
  }

  // ---------------- cuadro a cuadro ----------------
  update(dt) {
    if (!this.active) return;
    const g = this.g;
    const S = this.S;
    // el reloj de la intro es el de verdad, no el dt con tope de Game.loop: en
    // una compu que se traba (al arrancar se compila todo) no se atrasa de la
    // música ni de los otros jugadores. Solo, un salto de más de 3 s es una
    // pausa; en línea no hay pausa y una trabada de hasta 30 s cuenta. Llamadas
    // seguidas, sin cuadro en el medio: una prueba que la adelanta.
    const now = performance.now();
    // (sin wallAt, el primer cuadro va con el dt: si no, sumaba la edad de la página)
    const w = this.wallAt ? (now - this.wallAt) / 1000 : 0;
    this.wallAt = now;
    this.t += w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    const t = Math.min(this.t, this.total);
    // lo que pasa a una hora fija (carteles, sonidos)
    while (this.cueI < this.cues.length && this.cues[this.cueI][0] <= t) this.cues[this.cueI++][1](this);
    // la toma que toca
    let i = this.shotI < 0 ? 0 : this.shotI;
    while (i < S.shots.length - 1 && t >= S.shots[i].t0 + S.shots[i].d) i++;
    if (i !== this.shotI) {
      this.shotI = i;
      const s = S.shots[i];
      this.where(s.where || '');
      this.atI = 0;
      s.enter?.(this);
    }
    const s = S.shots[i];
    const lt = t - s.t0;
    const u = clamp01(lt / s.d);
    // lo que pasa a tal segundo de la toma (`at`, en orden)
    while (s.at && this.atI < s.at.length && lt >= s.at[this.atI][0]) s.at[this.atI++][1](this);
    if (!s.black) this.camera(s, lt, u, dt);
    s.tick?.(this, lt, u, dt);
    S.tick?.(this, dt, t);
    // niebla más liviana en las tomas abiertas (el clima la pisa cada cuadro: se le cambia el valor de base)
    const W = g.weather;
    if (W && this.fog0 != null) {
      this.fogK += ((s.fog ?? 1) - this.fogK) * Math.min(1, dt * 3);
      W.cur.fog = this.fog0 * this.fogK;
    }
    // el alma del penal no gasta energía mirando la película
    if (g.vida?.active) g.vida.energy = 1;
    // Fierro espera a que termine para que la Voz salude (TowerEgg.startT)
    if (g.ee?.startT > 0) g.ee.startT += dt;
    this.updateDom(s, lt);
    if (this.t >= this.total && !this.out) this.end(true);
  }

  // Cámara de la toma: recorrido, a dónde mira, lente, temblor y la bajada a los ojos.
  camera(s, lt, u, dt = 0) {
    const g = this.g;
    const cam = g.camera;
    const e = (EASE[s.ease] || EASE.inout)(u);
    if (s.fn) s.fn(this, lt, u, cam);
    else {
      s.camAt(e, tmpP);
      s.lookAt(e, tmpL);
      cam.position.copy(tmpP);
      lookQuat(tmpP, tmpL, cam.quaternion);
    }
    if (s.roll) cam.quaternion.multiply(tmpQ.setFromAxisAngle(tmpL.set(0, 0, 1), typeof s.roll === 'number' ? s.roll : s.roll[0] + (s.roll[1] - s.roll[0]) * e));
    // la última: de donde esté la cámara a los ojos del jugador
    let fov = Array.isArray(s.fov) ? s.fov[0] + (s.fov[1] - s.fov[0]) * e : s.fov || this.S.fov || 55;
    if (s.wake) {
      const k = (EASE[s.wakeEase] || EASE.soft)(clamp01((lt - (s.wakeAt || 0)) / (s.d - (s.wakeAt || 0))));
      const p = g.player;
      tmpP.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
      tmpQ2.setFromEuler(tmpE.set(p.pitch, p.yaw, 0, 'YXZ'));
      cam.position.lerp(tmpP, k);
      cam.quaternion.slerp(tmpQ2, k);
      fov += (g.baseFov - fov) * k;
    }
    if (this.shakeK > 0.001) {
      const k = this.shakeK;
      cam.quaternion.multiply(tmpQ.setFromEuler(tmpE.set((Math.random() - 0.5) * k * 0.05, (Math.random() - 0.5) * k * 0.05, (Math.random() - 0.5) * k * 0.03, 'YXZ')));
      this.shakeK *= Math.exp(-dt * 5);
    }
    this.fov = fov;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  updateDom(s, lt) {
    // negro: la toma negra, los fundidos de entrada y salida de cada toma, y el que pida el guion
    let b = s.black ? 1 : 0;
    if (s.fadeIn) b = Math.max(b, 1 - clamp01(lt / s.fadeIn));
    if (s.fadeOut) b = Math.max(b, clamp01((lt - (s.d - s.fadeOut)) / s.fadeOut));
    const tw = this.blackTw;
    if (tw) {
      const k = clamp01((this.t - tw.t0) / tw.d);
      this.blackCur = tw.from + (tw.to - tw.from) * k;
      b = Math.max(b, this.blackCur);
    }
    if (Math.abs(b - this.blackV) > 0.004) {
      this.blackV = b;
      this.blackEl.style.opacity = b.toFixed(3);
    }
    const lid = `${(this.lidK * 50).toFixed(2)}vh`;
    if (lid !== this.lidV) {
      this.lidV = lid;
      for (const l of this.lids) l.style.height = lid;
    }
    // los carteles: letra por letra y, cuando se cumple su tiempo, se van
    for (let i = this.cardsOn.length - 1; i >= 0; i--) {
      const c = this.cardsOn[i];
      const k = Math.min(c.spans.length, Math.floor((this.t - c.t0) * c.speed));
      while (c.k < k) c.spans[c.k++].style.opacity = '1';
      if (this.t >= c.until) {
        c.el.classList.remove('is-on');
        this.cardsOn.splice(i, 1);
      }
    }
  }

  // ---------------- saltear ----------------
  skip() {
    const g = this.g;
    if (!this.active || this.out) return;
    if (!g.net) {
      this.end(false);
      return;
    }
    const me = g.net.id;
    if (this.votes.has(me)) return;
    this.votes.add(me);
    if (g.net.host) {
      g.net.event('intro', { v: me });
      this.checkVotes();
    } else g.net.share('intro', { v: me });
    this.showSkip();
  }

  // Anfitrión: si ya la salteó todo el mundo, termina para todos.
  checkVotes() {
    const g = this.g;
    if (!g.net?.host || this.out) return;
    const ids = g.net.players.map((p) => p.id);
    if (ids.every((id) => this.votes.has(id))) this.end(false);
  }

  showSkip() {
    if (!this.skipEl) return;
    const g = this.g;
    const n = g.net ? g.net.players.length : 1;
    this.skipEl.textContent = n > 1 ? `Saltar (Esc o Espacio) · ${this.votes.size}/${n}` : 'Saltar (Esc o Espacio)';
  }

  // Lo que llega por la red: un voto para saltearla o el fin (lo manda el anfitrión).
  applyRemote(m) {
    if (!this.active) return;
    if (m.end) {
      // el fin natural del anfitrión (n): acá va por el mismo segundo y termina
      // sola, con la bajada a los ojos (antes se cortaba por negro y el
      // atrasado se perdía las últimas tomas); muy atrasada, se corta
      const left = this.total - this.t;
      if (m.n && left < 3 && globalThis.__mduNoIntroSync !== true) {
        clearTimeout(this.endBy);
        this.endBy = setTimeout(() => this.end(false), (left + 1.5) * 1000);
        return;
      }
      this.end(false);
      return;
    }
    if (m.v != null) {
      this.votes.add(m.v);
      this.showSkip();
      this.checkVotes();
    }
  }

  // ---------------- final ----------------
  // natural: la cámara ya llegó a los ojos del jugador. Si no, se sale por negro.
  end(natural) {
    const g = this.g;
    if (!this.active || this.out) return;
    this.out = true;
    clearTimeout(this.endBy);
    if (g.net?.host) g.net.event('intro', natural ? { end: 1, n: 1 } : { end: 1 });
    // la música se apaga (lo que ya estaba programado sigue, en silencio)
    try {
      this.bus.gain.setTargetAtTime(0, g.audio.now, natural ? 0.8 : 0.25);
    } catch {
      /* sin audio */
    }
    // la canción sigue un poco en la partida y se va
    if (g.music?.is(`intro-${this.map}`)) g.music.stop(natural ? 6 : 2);
    if (natural) this.finish();
    else {
      this.dark(1, 0.3);
      this.updateDom(this.S.shots[this.shotI] || this.S.shots[0], 0);
      setTimeout(() => this.finish(), 320);
    }
  }

  finish() {
    const g = this.g;
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    this.S.stop?.(this);
    this.park();
    if (g.weather && this.fog0 != null) g.weather.cur.fog = this.fog0;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    const el = this.el;
    this.el = null;
    if (el) {
      // de negro (o de la última toma) a la partida
      el.querySelector('.mdu-intro__card--low')?.classList.remove('is-on');
      el.classList.add('is-gone');
      setTimeout(() => el.remove(), 900);
    }
    if (g.state !== 'playing' && g.state !== 'paused') return;
    g.player.updateCamera(g.camera);
    g.hud.show(true);
    // la partida arranca ahora: el tiempo jugado y los carteles de siempre
    if (g.stats) g.stats.time = 0;
    const Z = ZONES[START_ZONE];
    g.hud.location(Z.name, Z.sub || '');
    // (el mismo de GauchoLife.startRun: las teclas ya están en su cartel)
    if (g.vida?.active) g.hud.subtitle('Gaucho life: tu rayo prende las máquinas.', 4);
    else g.hud.subtitle('Aguantá lo que puedas.', 4);
    if (!g.input.locked) g.menus.showClick(true);
  }

  // ---------------- carga ----------------
  // Un cuadro desde cada toma, con los muñecos a la vista: sube a la placa las
  // texturas y las sombras de todo lo que va a aparecer (lo llama Arrival).
  warm() {
    const g = this.g;
    if (!this.S) return;
    const cam = g.camera;
    const pos = cam.position.clone();
    const quat = cam.quaternion.clone();
    const fov = cam.fov;
    this.S.warm?.(this, true);
    const saveT = this.t;
    this.t = 0;
    for (const s of this.S.shots) {
      if (s.black || s.warm === false) continue;
      for (const u of s.warmAt || [0, 1]) {
        try {
          this.camera(s, u * s.d, u);
          g.render(0.016);
        } catch (err) {
          console.error(err);
        }
      }
    }
    this.t = saveT;
    this.S.warm?.(this, false);
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    // (ya subido a la placa: hasta que play() lo pida, fuera de la escena; el
    // reinicio rápido no pasa por play)
    this.park();
  }

  // Saca de la escena lo del guion que no tiene nada a la vista.
  park() {
    const g = this.g;
    if (globalThis.__mduNoMerge) return;
    for (const o of this.own) {
      if (o.parent !== g.scene) continue;
      let seen = false;
      o.traverseVisible((x) => {
        if (x.isMesh || x.isLight || x.isSprite || x.isPoints || x.isLine) seen = true;
      });
      if (seen) continue;
      o.removeFromParent();
      this.parked.push(o);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.el?.remove();
    this.el = null;
    this.active = false;
    this.S?.dispose?.(this);
  }
}
