import * as THREE from 'three';

// Base de las escenas del castillo del Mateendrache (el origen de los mates,
// a mitad del juego, y el final): barras negras, el texto de quien habla,
// carteles grandes, fundidos, un guion de pasos y una cámara por toma.
// Mismo formato que las cinemáticas de la torre (ui/TowerCinematic.js): el
// guion es una lista de [espera, fn]; fn devuelve cuánto dura su paso.
// drive: la escena mueve sola el mundo (la del final pasa con el juego
// terminado); si no, el juego sigue actualizando todo y la escena solo pone
// la cámara (el origen, que va adentro del juego).

const tmpU = new THREE.Vector3();

export default class CastleCine {
  constructor(g, { drive = false, kind = 'castillo' } = {}) {
    this.g = g;
    this.drive = drive;
    this.t = 0;
    this.step = 0;
    this.next = 0;
    this.timers = [];
    this.shake = 0;
    this.cam = null;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.root = new THREE.Group();
    g.scene.add(this.root);
    const el = document.createElement('div');
    el.className = `mdu-fcine mdu-fcine--${kind}`;
    el.innerHTML =
      '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p>' +
      '<h1 class="mdu-fcine__title"></h1><p class="mdu-fcine__card"></p><i class="mdu-fcine__fade"></i><i class="mdu-fcine__white"></i><button class="mdu-cine__skip">Saltar (Esc)</button>';
    g.root.appendChild(el);
    this.el = el;
    this.textEl = el.querySelector('.mdu-fcine__text');
    this.titleEl = el.querySelector('.mdu-fcine__title');
    this.cardEl = el.querySelector('.mdu-fcine__card');
    this.whiteEl = el.querySelector('.mdu-fcine__white');
    // (el cartel grande y el blanco van con estilo propio: no están en la hoja)
    this.cardEl.style.cssText = 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(980px,88vw);margin:0;text-align:center;font:italic 400 clamp(22px,3vw,40px)/1.35 Georgia,serif;color:#f3e6c8;text-shadow:0 0 24px rgba(255,190,110,.55),0 2px 0 #000;opacity:0;transition:opacity 1.6s';
    this.whiteEl.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;transition:opacity 2.5s';
  }

  play(onDone) {
    const g = this.g;
    this.onDone = onDone;
    this.onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') this.skip();
    };
    window.addEventListener('keydown', this.onKey);
    this.el.querySelector('.mdu-cine__skip').addEventListener('click', () => this.skip());
    requestAnimationFrame(() => this.el.classList.add('is-on'));
    g.hud.show(false);
    g.weapons.vmRoot.visible = false;
    g.audio.setCine?.(true);
    this.fov0 = g.camera.fov;
    this.script = this.build();
  }

  // Las subclases arman el guion acá.
  build() {
    return [];
  }

  skip() {
    this.finish();
  }

  later(secs, fn) {
    this.timers.push({ t: this.t + secs, fn });
  }

  // Habla alguien: el texto abajo y la voz. Devuelve cuánto tarda.
  say(who, text) {
    const el = this.textEl;
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro');
    const d = this.g.audio.say(text, who, { cine: true });
    return (d || text.length * 0.065) + 0.5;
  }

  quiet() {
    this.textEl.classList.remove('is-on');
  }

  card(text, secs = 4) {
    const el = this.cardEl;
    el.textContent = text;
    el.style.opacity = '1';
    this.later(secs, () => {
      if (el.textContent === text) el.style.opacity = '0';
    });
  }

  title(text, on = true) {
    if (text) this.titleEl.textContent = text;
    this.el.classList.toggle('is-title', on);
  }

  fade(on) {
    this.el.classList.toggle('is-fade', on);
  }

  white(on) {
    this.whiteEl.style.opacity = on ? '1' : '0';
  }

  // Una toma: fn(u, lt, pos, look) pone la cámara (pos) y adónde mira (look).
  shot(dur, fn) {
    this.cam = { t0: this.t, dur, fn };
  }

  setFov(f) {
    const cam = this.g.camera;
    if (Math.abs(cam.fov - f) < 0.01) return;
    cam.fov = f;
    cam.updateProjectionMatrix();
  }

  update(dt) {
    const g = this.g;
    if (!this.script) return false;
    // el reloj de la escena es el de verdad, no el dt con tope de Game.loop: en
    // línea, la compu que se traba (compila al cambiar de toma) no se atrasa de
    // los demás ni de la música. Solo, un salto de más de 3 s es una pausa; en
    // línea no hay pausa y una trabada de hasta 30 s cuenta. Llamadas seguidas,
    // sin cuadro en el medio: una prueba que la adelanta.
    const now = performance.now();
    const w = (now - (this.wallAt || 0)) / 1000;
    this.wallAt = now;
    this.t += w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    if (this.drive) g.time += dt;
    g.weapons.vmRoot.visible = false;
    const t = this.t;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    while (this.script && this.step < this.script.length && t >= this.next + this.script[this.step][0]) {
      const [wait, fn] = this.script[this.step];
      const start = this.next + wait;
      this.step++;
      const dur = fn() || 0;
      this.next = Math.max(start, t) + dur;
    }
    if (!this.script) return false;
    if (this.step >= this.script.length && t >= this.next) {
      this.finish();
      return false;
    }
    this.tick?.(dt, t);
    const cam = g.camera;
    if (this.cam) {
      const C = this.cam;
      const lt = t - C.t0;
      const u = Math.max(0, Math.min(1, lt / C.dur));
      C.fn(u, lt, this.pos, this.look);
      this.shake = Math.max(0, this.shake - dt * 0.4);
      const s = this.shake * 0.08;
      cam.position.set(this.pos.x + (Math.random() - 0.5) * s, this.pos.y + (Math.random() - 0.5) * s, this.pos.z + (Math.random() - 0.5) * s);
      cam.lookAt(this.look);
      cam.updateMatrixWorld();
    }
    if (this.drive) {
      g.audio.setListener(cam.position, tmpU.set(0, 0, -1).applyQuaternion(cam.quaternion));
      g.fx.update(dt, cam);
      g.world.update(dt, g.time);
      g.weather?.update?.(dt);
    }
    return true;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.script = null;
    const g = this.g;
    window.removeEventListener('keydown', this.onKey);
    g.audio.hush?.();
    g.audio.setCine?.(false);
    this.el.remove();
    if (this.fov0) this.setFov(this.fov0);
    this.cleanup?.();
    this.root.removeFromParent();
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  dispose() {
    this.onDone = null;
    this.finish();
  }
}

export const smooth = (u) => u * u * (3 - 2 * u);
export const lerp = (a, b, k) => a + (b - a) * k;

// El mate en alto, derecho. El mate de los muñecos va pegado al antebrazo:
// con el brazo levantado quedaba boca abajo. Con k (0-1) se endereza, con la
// boca para arriba y de frente como el cuerpo (yaw). Después de people.update,
// que es el que le pone la mano en su lugar.
const upM = new THREE.Matrix4();
const upQ = new THREE.Quaternion();
const upT = new THREE.Quaternion();
const upP = new THREE.Vector3();
const upS = new THREE.Vector3();
const upY = new THREE.Vector3(0, 1, 0);
export function uprightMate(av, k, yaw) {
  const mate = av?.hand?.children[0];
  if (!mate) return;
  if (!(k > 0)) {
    mate.quaternion.identity();
    return;
  }
  upM.multiplyMatrices(av.group.matrixWorld, av.hand.matrix).decompose(upP, upQ, upS);
  upT.setFromAxisAngle(upY, yaw + Math.PI);
  upQ.invert().multiply(upT);
  mate.quaternion.identity().slerp(upQ, Math.min(1, k));
}
