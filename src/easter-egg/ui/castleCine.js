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
    // (en línea el reloj cuenta desde acá, como ui/FarmCinematic: la compu que
    // se traba armando la escena no arranca atrasada)
    this.wallAt = g.net ? performance.now() : 0;
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
    // (el cuerpo del que habla gesticula: ui/fierroNpc talkingNow, como Game.say)
    const g = this.g;
    const w = g.audio.sayWait || 0;
    const T = (g.talkT ||= {});
    T[who] = [...(T[who] || []).filter((x) => x[1] > g.time), [g.time + w, g.time + w + (d || text.length * 0.065)]];
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
    // (el primer cuadro, con el dt: antes contaba la edad de la página, y en
    // línea una página de menos de 30 s arrancaba la escena adelantada)
    const w = this.wallAt ? (now - this.wallAt) / 1000 : 0;
    this.wallAt = now;
    const step = w >= 0.002 && w < (g.net ? 30 : 3) ? w : dt;
    this.t += step;
    // (en línea lo que se mueve también va con el reloj de verdad, hasta 1 s por
    // cuadro, como ui/MolinoCinematic: con el dt con tope, en la compu que se
    // traba los muñecos quedaban atrás de las tomas y de la otra compu)
    if (g.net && globalThis.__mduNoCineSync !== true) dt = Math.min(step, 1);
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
      // (la hora programada del paso: en línea lo que arma el paso se cuenta
      // desde acá, no desde cuando lo corre una compu trabada; ui/MonumentoEnding each)
      this.stepAt = start;
      const dur = fn() || 0;
      // (en línea, una trabada no corre el resto del guion: se pone al día)
      this.next = (g.net ? start : Math.max(start, t)) + dur;
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
// El mate de la luz de su elemento (id: weapons, templado) en la mano de un
// caballero de humo (los del origen y los de la cumbre). Antes llevaban el
// mate de siempre. Una copia con materiales propios, que se desvanece con el
// muñeco: quedan en av.M, que es lo que recorre el que le cambia la opacidad.
export function knightMate(people, av, id) {
  people.setGun(av, id, 1);
  let n = 0;
  av.gun?.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m = o.material.clone();
    m.transparent = true;
    m.opacity = 0;
    m.depthWrite = false;
    o.material = m;
    av.M[`gun${n++}`] = m;
  });
}

// La boca de un caballero de humo que habla. El gaucho de net/gauchoSkin no
// tiene y, con la luz de ánima, la cara quedaba lisa (el usuario, 2026-10-03:
// "los caballeros no tienen boca"). Una boca oscura debajo de los ojos, pegada
// a la cabeza, que se abre y se cierra mientras dice algo (talk(secs)).
// Con el cuerpo de verdad todavía sin bajar, null (probar de nuevo después).
// parent: algo de la escena (la raíz de la cinemática). La boca no cuelga del
// hueso de la cabeza: el gaucho pone sus huesos a mano y lo que cuelga de
// ellos no se actualiza (quedaba dibujada en el cero del mundo); se copia
// la cabeza en cada update.
const mA = new THREE.Vector3();
const mB = new THREE.Vector3();
const mH = new THREE.Vector3();
const mF = new THREE.Vector3();
const mQ = new THREE.Quaternion();
const mZ = new THREE.Vector3(0, 0, 1);
const mM = new THREE.Matrix4();
export function knightMouth(av, parent, opt = {}) {
  const G = av?.gs;
  if (!G?.on || !G.root) return null;
  const A = G.root.getObjectByName('eyeA');
  const B = G.root.getObjectByName('eyeB');
  const head = G.bones?.Head;
  if (!A || !B || !head) return null;
  G.root.updateMatrixWorld(true);
  A.getWorldPosition(mA);
  B.getWorldPosition(mB);
  head.getWorldPosition(mH);
  const e = mA.distanceTo(mB);
  // (los ojos, con opt.eyes: en el vacío la luz de ánima también los borraba)
  const eyeW = opt.eyes && !globalThis.__mduNoKnightEyes ? [mA.clone(), mB.clone()] : null;
  const mid = mA.add(mB).multiplyScalar(0.5);
  // adelante: de la cabeza a los ojos (sin lo vertical)
  mF.subVectors(mid, mH).setY(0).normalize();
  const at = mid.clone().addScaledVector(mF, e * (opt.out ?? 0.3));
  at.y -= e * (opt.down ?? 1.05);
  // (sin prueba de profundidad: el borde de luz del cuerpo la tapaba; se ve
  // de frente, como en el vacío de los caballeros)
  const mat = new THREE.MeshBasicMaterial({ color: opt.color ?? 0x1c0806, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8), mat);
  const W = e * (opt.w ?? 0.85);
  const Hh = e * (opt.h ?? 0.42);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  head.updateWorldMatrix(true, false);
  // (en el marco de la cabeza: dónde va y para dónde mira)
  const local = new THREE.Matrix4();
  const hInv = head.matrixWorld.clone().invert();
  const lp = at.clone().applyMatrix4(hInv);
  head.getWorldQuaternion(mQ).invert();
  const lq = mQ.clone().multiply(new THREE.Quaternion().setFromUnitVectors(mZ, mF));
  const ls = new THREE.Vector3(1, 1, 1).divide(head.getWorldScale(new THREE.Vector3()));
  const base = new THREE.Vector3();
  // los ojos: dos manchas oscuras en los marcadores, un pelito afuera, que
  // parpadean de vez en cuando (mismo marco de la cabeza que la boca)
  const eyes = (eyeW || []).map((p) => {
    const m = new THREE.Mesh(mesh.geometry, mat);
    m.renderOrder = 4;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    parent.add(m);
    return { m, lp: p.addScaledVector(mF, e * 0.12).applyMatrix4(hInv), L: new THREE.Matrix4() };
  });
  const M = {
    mesh,
    t: 0,
    dur: 0,
    open: 0,
    talk(secs) {
      M.t = 0;
      M.dur = secs;
    },
    update(dt, opacity) {
      M.t += dt;
      // sílabas: abre y cierra, más o menos rápido (no es el audio: parecido)
      const on = M.t < M.dur ? 1 : 0;
      const s = Math.max(0, Math.sin(M.t * 12.5)) ** 0.7 * (0.55 + 0.45 * Math.sin(M.t * 3.7 + 1.3) ** 2);
      M.open += (on * (0.2 + 0.8 * s) - M.open) * Math.min(1, dt * 22);
      mat.opacity = opacity;
      mesh.visible = opacity > 0.01;
      for (const E of eyes) E.m.visible = mesh.visible;
      if (!mesh.visible) return;
      base.set(W, Hh * (0.22 + 0.78 * M.open), e * 0.2).multiply(ls);
      local.compose(lp, lq, base);
      head.updateWorldMatrix(true, false);
      parent.updateWorldMatrix(true, false);
      mM.copy(parent.matrixWorld).invert().multiply(head.matrixWorld);
      mesh.matrix.multiplyMatrices(mM, local);
      mesh.matrixWorldNeedsUpdate = true;
      if (eyes.length) {
        const blink = (M.t + e * 40) % 4.3 < 0.13 ? 0.15 : 1;
        base.set(e * 0.26, e * 0.2 * blink, e * 0.1).multiply(ls);
        for (const E of eyes) {
          E.L.compose(E.lp, lq, base);
          E.m.matrix.multiplyMatrices(mM, E.L);
          E.m.matrixWorldNeedsUpdate = true;
        }
      }
    },
    dispose() {
      for (const E of eyes) E.m.removeFromParent();
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
  return M;
}

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
