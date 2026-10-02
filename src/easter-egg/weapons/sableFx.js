import * as THREE from 'three';
import { sableModel, BLADE_L } from './sableModels';

// Lo que se ve y se oye en el mundo del Sable Corvo (weapons/Sable.js): el
// arco de cada tajo, la medialuna celeste del de San Lorenzo, el sable que
// vuela girando y vuelve, y los sonidos. Lo propio y lo de los compañeros
// (sin daño: lo decide el que tira) pasan por acá. Todo vive en `root`, que
// se muda a la escena nueva cuando el mapa se rearma.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const hitTmp = {};
const smooth01 = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

// ---------------- el arco del tajo ----------------
// medialuna aditiva (adentro negra = no se ve; al medio el color; afuera
// blanca), de radio 1: se escala al alcance. Barre de +x a -x.
const ARC_HALF = 1.35;
const ARC_SEG = 30;
const ARC_SWEEP = 0.07;
const ARC_FADE = 0.22;
// inclinación de cada golpe y de qué lado arranca (flip: espejado)
export const ARC_MOVES = { izq: { roll: 0.32, flip: 1 }, der: { roll: -0.3, flip: -1 }, arriba: { roll: Math.PI / 2 - 0.42, flip: 1 } };
const ARC_COLS = [
  [[0, 0, 0], [0.24, 0.3, 0.42], [0.75, 0.8, 0.9]],
  [[0, 0, 0], [0.1, 0.48, 1.05], [0.95, 1, 1.1]],
];
function arcGeo(up) {
  const depth = [0.42, 0.1, 0];
  const cols = ARC_COLS[up ? 1 : 0];
  const pos = [];
  const col = [];
  for (let i = 0; i <= ARC_SEG; i++) {
    const u = i / ARC_SEG;
    const a = ARC_HALF - u * ARC_HALF * 2;
    const taper = Math.sin(Math.PI * u) ** 0.7;
    for (let j = 0; j < 3; j++) {
      const r = 1 - depth[j] * taper;
      pos.push(Math.sin(a) * r, 0, -Math.cos(a) * r);
      col.push(...cols[j]);
    }
  }
  const idx = [];
  for (let i = 0; i < ARC_SEG; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------------- la medialuna de San Lorenzo ----------------
// Chata, con la panza para adelante (-z), el origen en la punta de adelante.
// half: medio ancho de costado a costado (se escala).
const WAVE_A = 1.05;
const WAVE_SEG = 36;
function waveGeo() {
  // una sonrisa de luz parada de frente al que la tira ("◡"): las puntas
  // suben y se quedan atrás; el borde de adelante (abajo) es el filo blanco
  // y por dentro se va apagando en celeste y azul. Con la inclinación del
  // tajo queda acostada, en diagonal o parada.
  const R = 1 / Math.sin(WAVE_A);
  const depth = [0, 0.05, 0.14, 0.32];
  const cols = [[1.5, 1.6, 1.7], [0.45, 0.85, 1.4], [0.1, 0.38, 1.0], [0, 0, 0]];
  const pos = [];
  const col = [];
  for (let i = 0; i <= WAVE_SEG; i++) {
    const u = i / WAVE_SEG;
    const a = WAVE_A - u * WAVE_A * 2;
    const taper = Math.sin(Math.PI * u) ** 0.6;
    const cx = Math.sin(a) * R;
    const cy = (1 - Math.cos(a)) * R * 0.55;
    const cz = (1 - Math.cos(a)) * R * 0.45;
    // hacia adentro de la curva (para arriba, en el plano de la sonrisa)
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    for (let j = 0; j < depth.length; j++) {
      const d = depth[j] * taper;
      pos.push(cx + nx * d, cy + ny * d, cz);
      const k = j === depth.length - 1 ? 0 : 0.3 + 0.7 * taper;
      col.push(cols[j][0] * k, cols[j][1] * k, cols[j][2] * k);
    }
  }
  const J = depth.length;
  const idx = [];
  for (let i = 0; i < WAVE_SEG; i++) {
    for (let j = 0; j < J - 1; j++) {
      const a = i * J + j;
      const b = a + J;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// el resplandor del giro (un disco borroso) y las chispas
let RING_TEX = null;
function ringTex() {
  if (RING_TEX) return RING_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  gr.addColorStop(0.82, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.92, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  RING_TEX = new THREE.CanvasTexture(c);
  return RING_TEX;
}

const TRAIL_N = 34;
const TRAIL_LIFE = 0.3;

export default class SableFx {
  constructor(sable) {
    this.s = sable;
    this.g = sable.g;
    this.root = new THREE.Group();
    this.root.name = 'sableFx';
    this.sceneRef = null;
    this.arcs = [];
    this.waves = [];
    this.flyers = [];
    this.arcGeos = [arcGeo(0), arcGeo(1)];
    this.waveGeo = waveGeo();
    this.arcMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.waveMat = this.arcMat;
    this.discMats = [0, 1].map((up) => new THREE.MeshBasicMaterial({ map: ringTex(), color: up ? new THREE.Color(0x7fd0ff).multiplyScalar(1.3) : new THREE.Color(0xc8d4e6).multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    this.discGeo = new THREE.PlaneGeometry(1.5, 1.5);
  }

  // (el mapa se rearmó: lo nuestro pasa a la escena nueva)
  attach() {
    const sc = this.g.scene;
    if (sc && this.sceneRef !== sc) {
      this.sceneRef = sc;
      sc.add(this.root);
    }
  }

  // ---------------- el arco ----------------
  slashArc(center, yaw, move, range, up) {
    this.attach();
    let a = this.arcs.find((x) => !x.m.visible && x.up === !!up);
    if (!a) {
      if (this.arcs.length >= 8) {
        a = this.arcs.reduce((p, q) => (p.t > q.t ? p : q));
        a.m.geometry = this.arcGeos[up ? 1 : 0];
        a.up = !!up;
      } else {
        const m = new THREE.Mesh(this.arcGeos[up ? 1 : 0], this.arcMat.clone());
        m.frustumCulled = false;
        m.renderOrder = 5;
        this.root.add(m);
        a = { m, t: 0, up: !!up };
        this.arcs.push(a);
      }
    }
    const mv = ARC_MOVES[move] || ARC_MOVES.izq;
    a.t = 0;
    a.r = range;
    a.m.visible = true;
    a.m.position.copy(center);
    a.m.rotation.set(0, yaw, mv.roll, 'YXZ');
    a.m.scale.set(mv.flip * range, range, range);
    a.m.material.opacity = 1;
    a.m.geometry.setDrawRange(0, 0);
  }

  stepArc(a, dt) {
    a.t += dt;
    const k = Math.min(1, a.t / ARC_SWEEP);
    a.m.geometry.setDrawRange(0, Math.ceil(k * ARC_SEG) * 12);
    const f = a.t < ARC_SWEEP ? 1 : Math.max(0, 1 - (a.t - ARC_SWEEP) / ARC_FADE);
    a.m.material.opacity = f * f * (a.up ? 1 : 0.7);
    const s = a.r * (1 + a.t * 0.4);
    a.m.scale.set(Math.sign(a.m.scale.x) * s, s, s);
    if (f <= 0) a.m.visible = false;
  }

  // ---------------- la medialuna ----------------
  // o: de dónde sale (a la altura del pecho); dir: hacia dónde (normalizada);
  // roll: la inclinación del golpe; W: { range, speed, half }; own: el del que
  // tira (con daño: Sable.waveHits)
  wave(o, dir, roll, W, own) {
    this.attach();
    const g = this.g;
    let w = this.waves.find((x) => !x.on);
    if (!w) {
      if (this.waves.length >= 6) w = this.waves[0];
      else {
        const m = new THREE.Mesh(this.waveGeo, this.waveMat.clone());
        m.frustumCulled = false;
        m.renderOrder = 6;
        this.root.add(m);
        w = { m, on: false, o: new THREE.Vector3(), dir: new THREE.Vector3(), hits: new Set() };
        this.waves.push(w);
      }
    }
    w.on = true;
    w.own = !!own;
    w.o.copy(o);
    w.dir.copy(dir).normalize();
    w.d = 0;
    w.prev = 0;
    w.W = W;
    w.hits.clear();
    // hasta la primera pared (a la altura del pecho)
    const wall = g.world.raycast(w.o, w.dir, W.range, hitTmp);
    w.max = Math.max(1.5, Math.min(W.range, wall));
    w.wall = wall < W.range;
    w.m.visible = true;
    w.m.position.copy(o);
    // de frente a donde va, acostada y con la inclinación del tajo
    const yaw = Math.atan2(-w.dir.x, -w.dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, w.dir.y)));
    w.m.rotation.set(pitch, yaw, roll, 'YXZ');
    w.m.material.opacity = 1;
    w.k = 0.55;
    w.m.scale.setScalar(W.half * w.k);
    this.sndWave(own ? null : o);
  }

  stepWave(w, dt) {
    const g = this.g;
    w.prev = w.d;
    w.d = Math.min(w.max, w.d + w.W.speed * dt);
    w.k = Math.min(1.15, w.k + dt * 3.2);
    w.m.position.copy(w.o).addScaledVector(w.dir, w.d);
    w.m.scale.setScalar(w.W.half * w.k);
    const life = w.d / w.max;
    // (aparece en un instante y se apaga al final del recorrido)
    w.m.material.opacity = Math.min(1, w.d / 1.2) * (life > 0.75 ? Math.max(0, 1 - (life - 0.75) / 0.25) : 1);
    // las chispitas que se sueltan del filo
    const n = 3;
    const R = (w.W.half * w.k) / Math.sin(WAVE_A);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() * 2 - 1) * WAVE_A;
      tmpV.set(Math.sin(a) * R, (1 - Math.cos(a)) * R * 0.55, (1 - Math.cos(a)) * R * 0.45).applyEuler(w.m.rotation).add(w.m.position);
      const white = Math.random() < 0.4;
      g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, -w.dir.x * 2 + (Math.random() - 0.5), (Math.random() - 0.3) * 1.2, -w.dir.z * 2 + (Math.random() - 0.5), {
        color: white ? [1, 1, 1] : [0.35, 0.75, 1],
        size: 0.06,
        size1: 0,
        life: 0.35 + Math.random() * 0.25,
        drag: 2,
      });
    }
    if (w.own) this.s.waveHits(w);
    if (w.d >= w.max) {
      w.on = false;
      w.m.visible = false;
      // contra la pared: revienta en chispas celestes
      if (w.wall) {
        const at = tmpV.copy(w.o).addScaledVector(w.dir, w.max - 0.2);
        g.fx.sparks(at, 1.2, { x: -w.dir.x, y: 0.3, z: -w.dir.z }, [0.6, 0.85, 1]);
        g.fx.flash(at, 0x7fc8ff, 7, 0.15, 6);
      }
    }
  }

  // ---------------- el sable que vuela ----------------
  // F: { id, own, up, o (de dónde sale), f (hacia adelante), r (a la derecha),
  // R (lejos), A (de costado), T (segundos), radius }. Vuelve a la mano del
  // que lo tiró (home(): dónde está ahora la mano).
  throwStart(F) {
    this.attach();
    const fl = this.flyers.find((x) => !x.on && x.up === !!F.up) || this.newFlyer(!!F.up);
    Object.assign(fl, F);
    fl.on = true;
    fl.t = 0;
    fl.mode = 'arc';
    fl.ang = Math.random() * 6;
    fl.pos.copy(F.o);
    fl.prev.copy(F.o);
    fl.hits = new Set();
    fl.whoop = 0;
    fl.trail.length = 0;
    fl.group.visible = true;
    fl.group.position.copy(F.o);
    // el disco del giro: casi acostado, inclinado hacia el lado de la vuelta
    tmpV.copy(UP).addScaledVector(F.r, -0.42).normalize();
    fl.group.quaternion.setFromUnitVectors(Z, tmpV);
    return fl;
  }

  newFlyer(up) {
    const group = new THREE.Group();
    const spin = new THREE.Group();
    group.add(spin);
    const sab = sableModel(up ? 1 : 0);
    sab.scale.setScalar(1.15);
    // el centro del giro: un poco arriba de la cruz (donde se equilibra)
    sab.position.y = -0.24 * 1.15;
    spin.add(sab);
    const disc = new THREE.Mesh(this.discGeo, this.discMats[up ? 1 : 0]);
    disc.renderOrder = 6;
    group.add(disc);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    tg.setDrawRange(0, 0);
    const trail = new THREE.Mesh(tg, this.arcMat);
    trail.frustumCulled = false;
    trail.renderOrder = 6;
    this.root.add(group, trail);
    const tipL = new THREE.Vector3(0, (BLADE_L - 0.24) * 1.15, 0);
    const midL = new THREE.Vector3(0, (BLADE_L * 0.45 - 0.24) * 1.15, 0);
    const fl = { group, spinG: spin, disc, sab, trailMesh: trail, tipL, midL, on: false, up, pos: new THREE.Vector3(), prev: new THREE.Vector3(), trail: [], free: [] };
    this.flyers.push(fl);
    return fl;
  }

  // la vuelta de boomerang: sale hacia adelante abriéndose a un costado, se
  // frena lejos y vuelve por el otro lado a la mano (donde esté ahora)
  stepFlyer(fl, dt) {
    const g = this.g;
    fl.t += dt;
    fl.prev.copy(fl.pos);
    const home = fl.home(tmpV3);
    if (fl.mode === 'arc') {
      const u = Math.min(1, fl.t / fl.T);
      const fw = fl.R * Math.sin(Math.PI * u);
      // (sale derecho a la mira; a lo lejos se abre a la derecha y vuelve por ese lado)
      const side = fl.A * (u < 0.25 ? 0 : smooth01((u - 0.25) / 0.35)) * Math.sin(Math.PI * u) ** 0.7;
      const lift = 0.35 * Math.sin(Math.PI * u);
      // el ancla pasa de donde salió a la mano en la vuelta
      const back = u < 0.5 ? 0 : (u - 0.5) / 0.5;
      const b = back * back * (3 - 2 * back);
      tmpV.copy(fl.o).lerp(home, b);
      fl.pos.copy(tmpV).addScaledVector(fl.f, fw * (1 - b * 0.15)).addScaledVector(fl.r, side).addScaledVector(UP, lift);
      // de ida, contra la pared rebota y vuelve derecho
      if (fl.own && u < 0.5) {
        tmpV2.subVectors(fl.pos, fl.prev);
        const len = tmpV2.length();
        if (len > 1e-4) {
          tmpV2.divideScalar(len);
          const t = g.world.raycast(fl.prev, tmpV2, len + 0.25, hitTmp);
          if (t < len + 0.25) {
            fl.pos.copy(fl.prev).addScaledVector(tmpV2, Math.max(0, t - 0.3));
            this.bounce(fl, hitTmp.normal);
            this.s.onBounce?.(fl);
          }
        }
      }
      if (u >= 1) fl.done = true;
    } else {
      // vuelve derecho a la mano, cada vez más rápido
      fl.backV = Math.min(34, (fl.backV || 14) + dt * 40);
      tmpV.subVectors(home, fl.pos);
      const d = tmpV.length();
      if (d < fl.backV * dt + 0.05) {
        fl.pos.copy(home);
        fl.done = true;
      } else fl.pos.addScaledVector(tmpV.divideScalar(d), fl.backV * dt);
    }
    // a la mano: se agarra
    if (fl.t > 0.35 && fl.pos.distanceTo(home) < 0.9) fl.done = true;
    fl.group.position.copy(fl.pos);
    fl.ang += dt * (fl.up ? 27 : 24);
    fl.spinG.rotation.z = fl.ang;
    // (sale chico de la mano y crece: pegado a la cámara tapaba la pantalla)
    const grow = Math.min(1, 0.4 + fl.t * 5);
    fl.spinG.scale.setScalar(grow);
    fl.disc.scale.setScalar(grow);
    // la estela: la punta y la mitad de la hoja, cada cuadro
    fl.group.updateMatrixWorld(true);
    const s = fl.free.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
    s.a.copy(fl.tipL).applyMatrix4(fl.spinG.matrixWorld);
    s.b.copy(fl.midL).applyMatrix4(fl.spinG.matrixWorld);
    s.age = 0;
    fl.trail.unshift(s);
    if (fl.trail.length > TRAIL_N) fl.free.push(fl.trail.pop());
    // el zumbido de cada vuelta
    fl.whoop -= dt;
    if (fl.whoop <= 0) {
      fl.whoop = 0.115;
      this.sndWhoop(fl.pos, fl.up);
    }
    // chispitas celestes del mejorado
    if (fl.up && Math.random() < 0.8) {
      const a = fl.trail[0].a;
      g.fx.add.spawn(a.x, a.y, a.z, (Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6, { color: Math.random() < 0.5 ? [0.45, 0.8, 1] : [1, 1, 1], size: 0.05, size1: 0, life: 0.45, drag: 1 });
    }
    if (fl.own) this.s.flyHits(fl);
  }

  bounce(fl, n) {
    const g = this.g;
    fl.mode = 'back';
    fl.backV = 12;
    g.fx.sparks(fl.pos, 1.2, n || { x: 0, y: 1, z: 0 }, [1, 0.85, 0.55]);
    g.fx.flash(fl.pos, 0xfff0d0, 4, 0.08, 4);
    this.sndClang(fl.pos);
  }

  drawTrail(fl, dt) {
    const pts = fl.trail;
    for (const s of pts) s.age += dt;
    while (pts.length && pts[pts.length - 1].age > TRAIL_LIFE) fl.free.push(pts.pop());
    const tg = fl.trailMesh.geometry;
    if (pts.length < 2) {
      tg.setDrawRange(0, 0);
      return;
    }
    const P = tg.attributes.position.array;
    const C = tg.attributes.color.array;
    const col = fl.up ? [0.35, 0.75, 1.3] : [0.7, 0.75, 0.86];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = Math.max(0, 1 - p.age / TRAIL_LIFE) ** 1.4;
      P.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      C.set([col[0] * f, col[1] * f, col[2] * f, col[0] * f * 0.1, col[1] * f * 0.1, col[2] * f * 0.1], i * 6);
    }
    tg.setDrawRange(0, (pts.length - 1) * 6);
    tg.attributes.position.needsUpdate = true;
    tg.attributes.color.needsUpdate = true;
  }

  endFlyer(fl) {
    fl.on = false;
    fl.done = false;
    fl.group.visible = false;
    fl.trail.length = 0;
    fl.trailMesh.geometry.setDrawRange(0, 0);
  }

  update(dt) {
    if (!this.arcs.length && !this.waves.length && !this.flyers.length) return;
    this.attach();
    for (const a of this.arcs) if (a.m.visible) this.stepArc(a, dt);
    for (const w of this.waves) if (w.on) this.stepWave(w, dt);
    for (const fl of this.flyers) {
      if (fl.on) {
        this.stepFlyer(fl, dt);
        if (fl.done) {
          const own = fl.own;
          this.endFlyer(fl);
          if (own) this.s.onCatch(fl);
          else fl.onEnd?.(fl);
        }
      }
      this.drawTrail(fl, dt);
    }
  }

  clear() {
    for (const a of this.arcs) a.m.visible = false;
    for (const w of this.waves) {
      w.on = false;
      w.m.visible = false;
    }
    for (const fl of this.flyers) this.endFlyer(fl);
  }

  // ---------------- lo que se escucha ----------------
  get A() {
    return this.g.audio;
  }

  // Desenvainar: el acero raspando la boca de la vaina y el "shiiing".
  sndDraw(pos = null) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.75, reverb: 0.25 });
    a.noise(o, { t, dur: 0.32, type: 'bandpass', freq: 1800, freqEnd: 6500, q: 2.5, gain: 0.45, attack: 0.04 });
    a.noise(o, { t: t + 0.04, dur: 0.22, type: 'highpass', freq: 5000, gain: 0.12, attack: 0.03 });
    a.tone(o, { t: t + 0.24, dur: 1.1, type: 'sine', freq: 3150, freqEnd: 3080, gain: 0.05 });
    a.tone(o, { t: t + 0.24, dur: 0.9, type: 'sine', freq: 4710, gain: 0.028 });
    a.tone(o, { t: t + 0.24, dur: 0.6, type: 'triangle', freq: 1240, gain: 0.02 });
  }

  // El tajo cortando el aire (k: más fuerte el de arriba; up: con su silbido celeste).
  sndSwish(pos, k = 1, up = false) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.6 * k, reverb: 0.1 });
    a.noise(o, { t, dur: 0.2, type: 'bandpass', freq: 600, freqEnd: 3000, q: 1.2, gain: 0.75, attack: 0.03 });
    a.noise(o, { t: t + 0.02, dur: 0.14, type: 'highpass', freq: 4200, gain: 0.2, attack: 0.02 });
    if (up) {
      a.tone(o, { t, dur: 0.35, type: 'sine', freq: 1700, freqEnd: 2900, gain: 0.06, attack: 0.03 });
      a.tone(o, { t: t + 0.03, dur: 0.3, type: 'triangle', freq: 880, freqEnd: 1320, gain: 0.03, attack: 0.03 });
    }
  }

  // El sable entrando en carne: golpe sordo y el filo que sigue.
  sndHit(pos, k = 1) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.7 * k, reverb: 0.08 });
    a.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 900, freqEnd: 180, gain: 0.9, attack: 0.003 });
    a.tone(o, { t, dur: 0.1, type: 'sine', freq: 110, freqEnd: 55, gain: 0.35 });
    a.noise(o, { t: t + 0.02, dur: 0.1, type: 'bandpass', freq: 2600, q: 1.5, gain: 0.25 });
  }

  // Contra la pared (o la piedra): el chirrido del acero y su campanazo.
  sndClang(pos) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.8, reverb: 0.35 });
    a.noise(o, { t, dur: 0.08, type: 'highpass', freq: 2500, gain: 0.7 });
    for (const [f, gn] of [[1180, 0.09], [2470, 0.06], [3890, 0.04]]) a.tone(o, { t, dur: 0.7, type: 'sine', freq: f, freqEnd: f * 0.99, gain: gn });
  }

  // Cada vuelta del sable en el aire: "fuup".
  sndWhoop(pos, up) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.42, reverb: 0.15 });
    a.noise(o, { t, dur: 0.1, type: 'bandpass', freq: up ? 1100 : 800, freqEnd: up ? 2000 : 1500, q: 2.2, gain: 0.8, attack: 0.035 });
  }

  // Sale el tiro: el envión.
  sndThrow(pos = null, up = false) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.75, reverb: 0.2 });
    a.noise(o, { t, dur: 0.3, type: 'bandpass', freq: 400, freqEnd: 2600, q: 1, gain: 0.8, attack: 0.05 });
    if (up) a.tone(o, { t, dur: 0.5, type: 'sine', freq: 1300, freqEnd: 2600, gain: 0.05, attack: 0.05 });
  }

  // Lo agarra: el puño en la palma y el acero que vibra.
  sndCatch() {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ gain: 0.7, reverb: 0.12 });
    a.noise(o, { t, dur: 0.05, type: 'lowpass', freq: 1400, gain: 0.9 });
    a.tone(o, { t, dur: 0.06, type: 'square', freq: 180, freqEnd: 120, gain: 0.08 });
    a.tone(o, { t: t + 0.01, dur: 0.55, type: 'sine', freq: 2960, freqEnd: 2900, gain: 0.035 });
  }

  // La medialuna celeste que sale del filo.
  sndWave(pos = null) {
    const a = this.A;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.5, reverb: 0.3 });
    a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 1200, freqEnd: 300, q: 1.4, gain: 0.5, attack: 0.02 });
    a.tone(o, { t, dur: 0.4, type: 'sine', freq: 1568, freqEnd: 1046, gain: 0.04 });
    a.tone(o, { t, dur: 0.4, type: 'sine', freq: 2093, freqEnd: 1396, gain: 0.025 });
  }
}
