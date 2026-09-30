import * as THREE from 'three';
import '../ui/dyingWish.css';

// Dying Wish (el perk de Black Ops 4; acá la yerba Extremaunión, en el
// Challenge de la torre). El golpe que te iba a tirar no te tira: quedás con
// un hilo de vida y por WISH_TIME segundos no te toca nada (los muertos te
// siguen pegando, pero no hace nada), con la adrenalina a mil: la pantalla
// roja con las venas que laten, el mundo se oye tapado, el corazón golpea y
// uno corre un poco más. En esos segundos la vida vuelve de a poco. Después
// el perk se enfría WISH_CD segundos (el medallón gris) antes de volver a salvarte.
// Lo llama Player: goDown (tryWish), damage (wishActive) y update (la velocidad).
// El jugador guarda wishT (cuándo termina), wishReady (cuándo vuelve a servir),
// wishFx y wishBeat (lo que lee fx/PostFX para el color y el latido).

export const WISH_TIME = 5;
export const WISH_CD = 180;
// cuánto más rápido se anda con la adrenalina
export const WISH_SPEED = 1.2;
// la vida con la que termina (fracción del máximo), subiendo desde 1
const HEAL_TO = 0.6;
// el corazón: pulsaciones por minuto al principio y al final de los 5 s
const BPM0 = 168;
const BPM1 = 132;
// lo que tarda en irse el rojo al terminar
const FADE = 0.9;

const tmpV = new THREE.Vector3();

export const wishActive = (p) => (p.wishT || 0) > p.g.time;

// (Player.goDown) ¿Lo salva? Adentro de los 5 s, siempre (sigue con un hilo);
// si no, con el perk y ya frío, arranca la adrenalina.
export function tryWish(p) {
  const g = p.g;
  if (wishActive(p)) {
    p.health = Math.max(1, p.health);
    return true;
  }
  if (!p.perks.has('wish') || g.time < (p.wishReady ?? 0) || !p.alive || p.downed) return false;
  p.health = 1;
  p.wishT = g.time + WISH_TIME;
  p.wishReady = p.wishT + WISH_CD;
  p.wishFrom = g.time;
  fxOf(g).start(p);
  return true;
}

// (Player.damage) Un golpe mientras dura: no lastima, el corazón se acelera.
export function wishBlocked(p) {
  fxOf(p.g).kick();
}

function fxOf(g) {
  if (!g.wishFx || g.wishFx.g !== g) g.wishFx = new WishFx(g);
  return g.wishFx;
}

// ---------------- lo que se ve y se oye ----------------
class WishFx {
  constructor(g) {
    this.g = g;
    this.p = null;
    this.raf = 0;
    this.el = null;
    this.nextBeat = 0;
    this.kickT = 0;
  }

  build() {
    const g = this.g;
    const el = document.createElement('div');
    el.className = 'mdu-wish';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="mdu-wish-rim"></div><svg class="mdu-wish-veins" viewBox="0 0 1600 900" preserveAspectRatio="none">${veins()}</svg><div class="mdu-wish-flash"></div><svg class="mdu-wish-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="is-left" cx="50" cy="50" r="44" pathLength="100"/></svg><svg class="mdu-wish-ecg" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="${ecgPath()}"/></svg>`;
    (g.root || document.body).appendChild(el);
    this.el = el;
  }

  // Arranca: el golpe, el destello rojo, la onda en el piso y el corazón.
  start(p) {
    const g = this.g;
    this.p = p;
    if (!this.el) this.build();
    const el = this.el;
    el.classList.remove('is-on', 'is-out');
    void el.offsetWidth;
    el.classList.add('is-on');
    // (opción "menos destellos": sin el golpe blanco y rojo de entrada)
    el.classList.toggle('is-calm', !!g.settings?.calmFx);
    el.style.setProperty('--wtime', `${WISH_TIME}s`);
    // (el medallón late rojo mientras dura; gris recién con el enfriamiento)
    g.hud.perkCool?.('wish', false);
    this.medal(true);
    g.fx.addShake(0.9);
    if (!g.settings?.calmFx) g.post?.flash(0.25);
    this.burst(p.pos);
    this.sndStart();
    this.muffle(true);
    this.nextBeat = g.time + 0.35;
    this.kickT = 0;
    this.ended = false;
    // cuando vuelve a servir: el medallón se prende y un tum-tum suave
    const ready = p.wishReady;
    g.later(WISH_TIME + WISH_CD, () => {
      if (Math.abs((p.wishReady ?? 0) - ready) > 0.01) return;
      g.hud.perkCool?.('wish', false);
      if (p.perks.has('wish')) this.sndReady();
    });
    if (!this.raf) this.loop();
  }

  kick() {
    this.kickT = 1;
    this.g.fx.addShake(0.12);
  }

  // El medallón del HUD late en rojo mientras dura.
  medal(on) {
    const m = this.g.hud.perks?.querySelector?.('[data-perk="wish"]');
    m?.classList.toggle('is-wishing', on);
  }

  loop() {
    const tick = () => {
      this.raf = 0;
      if (this.update()) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // Cada cuadro de la pantalla (con el tiempo del juego: en pausa se queda quieto).
  // Devuelve si sigue.
  update() {
    const g = this.g;
    const p = this.p;
    if (!p || !this.el || g.wishFx !== this) return this.stop();
    const t = g.time;
    const t0 = p.wishFrom ?? t;
    const t1 = p.wishT || 0;
    const on = t < t1 && p.alive && !p.downed;
    // la fuerza del efecto: entra de golpe y se va en FADE segundos
    const k = on ? Math.min(1, (t - t0) / 0.18) : Math.max(0, 1 - (t - t1) / FADE);
    // el corazón: cada vez más lento hacia el final (y al terminar, dos más)
    const u = Math.min(1, Math.max(0, (t - t0) / WISH_TIME));
    const period = 60 / (on ? BPM0 + (BPM1 - BPM0) * u : 96);
    if (t >= this.nextBeat && k > 0.05) {
      this.nextBeat = t + period * (this.kickT > 0.5 ? 0.7 : 1);
      this.lastBeat = t;
      this.sndBeat(k);
    }
    const ph = t - (this.lastBeat ?? -9);
    const beat = Math.exp(-((ph / 0.07) ** 2)) + 0.65 * Math.exp(-(((ph - 0.17) / 0.07) ** 2));
    this.kickT = Math.max(0, this.kickT - 1 / 30);
    p.wishFx = k;
    p.wishBeat = Math.min(1, beat + this.kickT * 0.6);
    // la vida vuelve de a poco mientras dura
    if (on && !this.ended) {
      p.health = Math.max(p.health, 1 + (p.maxHealth * HEAL_TO - 1) * u);
      g.hud.hurt(1 - p.health / p.maxHealth);
    }
    const el = this.el;
    el.style.setProperty('--wk', k.toFixed(3));
    el.style.setProperty('--wbeat', p.wishBeat.toFixed(3));
    if (!on && !this.ended) {
      this.ended = true;
      el.classList.add('is-out');
      this.medal(false);
      g.hud.perkCool?.('wish', true);
      this.muffle(false);
      this.sndEnd();
      g.hud.hurt(1 - p.health / p.maxHealth);
    }
    if (!on && k <= 0) return this.stop();
    return true;
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const p = this.p;
    if (p) {
      p.wishFx = 0;
      p.wishBeat = 0;
    }
    this.el?.classList.remove('is-on', 'is-out');
    this.medal(false);
    if (!this.ended) this.muffle(false);
    this.ended = true;
    return false;
  }

  // La onda roja en el piso y las chispas que suben alrededor del cuerpo.
  burst(at) {
    const g = this.g;
    const x = at.x;
    const y = at.y;
    const z = at.z;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + Math.random() * 0.05;
      const v = 7 + Math.random() * 3;
      g.fx.add.spawn(x + Math.cos(a) * 0.6, y + 0.12, z + Math.sin(a) * 0.6, Math.cos(a) * v, 0.2 + Math.random() * 0.4, Math.sin(a) * v, { color: [1, 0.08 + Math.random() * 0.12, 0.14], size: 0.28, size1: 0.05, life: 0.45 + Math.random() * 0.2, drag: 3 });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.5;
      g.fx.add.spawn(x + Math.cos(a) * r, y + Math.random() * 1.6, z + Math.sin(a) * r, -Math.sin(a) * 1.5, 1.5 + Math.random() * 3, Math.cos(a) * 1.5, { color: [1, 0.2 + Math.random() * 0.3, 0.25], size: 0.07, size1: 0, life: 0.8 + Math.random() * 0.6, drag: 1 });
    }
    g.fx.flash(tmpV.set(x, y + 1, z), 0xff1a3a, 40, 0.5, 9);
  }

  // ---------------- el sonido ----------------
  // El mundo se oye tapado (el mismo pasabajos de abajo del agua, más suave),
  // salvo que esté apagado en las opciones o ya esté abajo del agua.
  muffle(on) {
    const A = this.g.audio;
    const f = A?.under?.frequency;
    if (!f || A.underOn || A.noUnder) return;
    const t = A.now;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(on ? 820 : 20000, t + (on ? 0.12 : 0.8));
  }

  sndStart() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 1, reverb: 0.6 });
    // el golpe grave, el soplido que se da vuelta y la bocanada
    A.tone(o, { t, dur: 1.4, freq: 70, freqEnd: 28, gain: 0.9, attack: 0.004 });
    A.noise(o, { t, dur: 0.5, type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.8, brown: true, attack: 0.004 });
    A.noise(o, { t: t + 0.05, dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 3200, q: 1.4, gain: 0.35, attack: 0.5 });
    A.tone(o, { t: t + 0.1, dur: 3.2, freq: 3400, gain: 0.018, attack: 0.3 });
    A.noise(o, { t: t + 0.55, dur: 0.4, type: 'bandpass', freq: 800, freqEnd: 2200, q: 1.1, gain: 0.35, attack: 0.1 });
  }

  // tum-tum (k: la fuerza del efecto en ese momento)
  sndBeat(k) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 0.9 * k, reverb: 0.15 });
    A.tone(o, { t, dur: 0.13, freq: 72, freqEnd: 42, gain: 0.95, attack: 0.004 });
    A.noise(o, { t, dur: 0.06, type: 'lowpass', freq: 180, gain: 0.5, brown: true });
    A.tone(o, { t: t + 0.17, dur: 0.11, freq: 60, freqEnd: 38, gain: 0.7, attack: 0.004 });
  }

  sndEnd() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 0.7, reverb: 0.4 });
    A.noise(o, { t, dur: 0.9, type: 'bandpass', freq: 2600, freqEnd: 400, q: 0.9, gain: 0.4, attack: 0.05 });
    A.tone(o, { t, dur: 0.8, freq: 220, freqEnd: 110, gain: 0.08 });
  }

  sndReady() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ gain: 0.5, reverb: 0.5 });
    for (const d of [0, 0.2]) A.tone(o, { t: t + d, dur: 0.12, freq: 66, freqEnd: 42, gain: 0.8, attack: 0.004 });
    [70, 74, 77].forEach((n, i) => A.tone(o, { t: t + 0.45 + i * 0.06, dur: 0.9, type: 'triangle', freq: 440 * 2 ** ((n - 69) / 12), gain: 0.05, attack: 0.01 }));
  }
}

// Las venas: ramas que entran desde los bordes de la pantalla (siempre las mismas).
function veins() {
  let s = 91;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const paths = [];
  const branch = (x, y, a, len, w, depth) => {
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    let px = x;
    let py = y;
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      a += (r() - 0.5) * 0.7;
      const l = len / n;
      const nx = px + Math.cos(a) * l;
      const ny = py + Math.sin(a) * l;
      d += ` Q${(px + Math.cos(a + (r() - 0.5)) * l * 0.6).toFixed(0)} ${(py + Math.sin(a + (r() - 0.5)) * l * 0.6).toFixed(0)} ${nx.toFixed(0)} ${ny.toFixed(0)}`;
      if (depth > 0 && r() < 0.35) branch(nx, ny, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.55, w * 0.6, depth - 1);
      px = nx;
      py = ny;
    }
    paths.push(`<path d="${d}" stroke-width="${w.toFixed(1)}"/>`);
  };
  // desde cada borde, hacia el medio
  for (let i = 0; i < 7; i++) branch(r() * 1600, -10, Math.PI / 2 + (r() - 0.5) * 0.8, 180 + r() * 160, 7, 2);
  for (let i = 0; i < 7; i++) branch(r() * 1600, 910, -Math.PI / 2 + (r() - 0.5) * 0.8, 180 + r() * 160, 7, 2);
  for (let i = 0; i < 5; i++) branch(-10, r() * 900, (r() - 0.5) * 0.8, 220 + r() * 160, 8, 2);
  for (let i = 0; i < 5; i++) branch(1610, r() * 900, Math.PI + (r() - 0.5) * 0.8, 220 + r() * 160, 8, 2);
  return paths.join('');
}

// El trazo del monitor: dos latidos por vuelta (se repite corriendo de costado).
function ecgPath() {
  const beat = (x0) => `L${x0} 34 L${x0 + 12} 30 L${x0 + 20} 34 L${x0 + 30} 34 L${x0 + 36} 6 L${x0 + 44} 56 L${x0 + 50} 34 L${x0 + 66} 34 L${x0 + 76} 26 L${x0 + 90} 34`;
  return `M0 34 ${beat(40)} L200 34 ${beat(240)} L400 34`;
}
