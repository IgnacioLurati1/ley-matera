import * as THREE from 'three';
import { assetUrl } from '../../lib/assets';

// El yacaré del Pack-a-Pava con clips hechos en Blender (C:/Users/ignac/Tools/
// mdu-blender/yac_clips.py, con el cuerpo, los recorridos y la máquina sacados
// del juego): por cuadro, la posición y el giro de los 26 huesos (en el marco
// de la máquina, como el modelo), la cabeza (lift, turn), la boca y las cuatro
// patas. 'enroscado' (duerme, da vuelta), 'comer' (2,3 s: levanta la cabeza,
// abre antes de que llegue el pescado, cierra de golpe, dos tragos, la cola) e
// 'irse' (bosteza, se desenrosca por afuera de la máquina, camina con las patas
// de a pares cruzados, entra al agua, nada con la cola y se hunde). Los tiempos
// de todo (el pescado, el chapuzón, cuándo libera la máquina) siguen siendo los
// de world/papYacare.js; esto pone solo la pose. Switch:
// globalThis.__mduNoYacareBlend = true = como antes; para probar con el switch
// apagado por defecto: globalThis.__mduYacareBlend = true.

const URL = '/assets/sotano/modelos/yacare/pap-clips.json';
const DEFAULT_ON = true;
export const yacareBlendOn = () => globalThis.__mduNoYacareBlend !== true && globalThis.__mduBlend !== false && (DEFAULT_ON || globalThis.__mduYacareBlend === true);

const C = { p: null, data: null };
export function loadYacareClips() {
  if (!yacareBlendOn()) return null;
  C.p ||= fetch(assetUrl(URL))
    .then((r) => (r.ok ? r.json() : null))
    .then((J) => {
      if (!J) return null;
      const out = {};
      for (const [k, c] of Object.entries(J.clips)) out[k] = { n: c.n, dur: c.dur, loop: !!c.loop, p: Float32Array.from(c.p), q: Float32Array.from(c.q), h: Float32Array.from(c.h), L: J.L };
      C.data = out;
      return out;
    })
    .catch(() => null);
  return C.p;
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const HN = 15;

export class YacareBlend {
  constructor(Y) {
    this.Y = Y;
    this.H = new Float32Array(HN);
    this.H2 = new Float32Array(HN);
    this.prev = null;
    this.fade = 1;
  }

  ready() {
    // (los recorridos del juego tienen que ser los mismos con que se hicieron los clips)
    return !!C.data && Math.abs((C.data.enroscado?.L ?? 0) - this.Y.L) < 0.05;
  }

  // Muestra el clip en t (s) en los huesos (con mezcla k sobre lo que ya tienen) y en H.
  put(c, t, k, H) {
    const B = this.Y.model.userData.bones;
    const n = B.length;
    const f = t * 30;
    let f0 = c.loop ? Math.floor(f) % c.n : Math.min(c.n - 1, Math.floor(f));
    const u = c.loop ? f - Math.floor(f) : Math.min(1, Math.max(0, f - f0));
    const f1 = c.loop ? (f0 + 1) % c.n : Math.min(c.n - 1, f0 + 1);
    if (f0 < 0) f0 = 0;
    for (let i = 0; i < n; i++) {
      const a = (f0 * n + i) * 3;
      const b = (f1 * n + i) * 3;
      const x = c.p[a] + (c.p[b] - c.p[a]) * u;
      const y = c.p[a + 1] + (c.p[b + 1] - c.p[a + 1]) * u;
      const z = c.p[a + 2] + (c.p[b + 2] - c.p[a + 2]) * u;
      const qa4 = (f0 * n + i) * 4;
      const qb4 = (f1 * n + i) * 4;
      qa.set(c.q[qa4], c.q[qa4 + 1], c.q[qa4 + 2], c.q[qa4 + 3]);
      qb.set(c.q[qb4], c.q[qb4 + 1], c.q[qb4 + 2], c.q[qb4 + 3]);
      qa.slerp(qb, u);
      if (k >= 1) {
        B[i].position.set(x, y, z);
        B[i].quaternion.copy(qa);
      } else {
        B[i].position.lerp(new THREE.Vector3(x, y, z), k);
        B[i].quaternion.slerp(qa, k);
      }
    }
    for (let j = 0; j < HN; j++) {
      const a = c.h[f0 * HN + j];
      const b = c.h[f1 * HN + j];
      H[j] = a + (b - a) * u;
    }
  }

  // Cada cuadro, en vez de pose() + cabeza/boca/patas. state: 'sleep' | 'eat' | 'leave'; t: el tiempo de eso.
  // turnK: cuánto girar la cabeza hacia el que tiró (del juego). Devuelve false si no hay clips.
  apply(state, t, dt, turnK = 0) {
    if (!this.ready()) return false;
    const D = C.data;
    const U = this.Y.model.userData;
    const name = state === 'eat' ? 'comer' : state === 'leave' ? 'irse' : 'enroscado';
    if (name !== this.prev) {
      this.from = this.prev;
      this.fromT = this.lastT ?? 0;
      this.fade = this.prev ? 0 : 1;
      this.prev = name;
    }
    this.fade = Math.min(1, this.fade + dt / 0.25);
    this.sleepT = (this.sleepT || 0) + dt;
    const tt = name === 'enroscado' ? this.sleepT : t;
    this.lastT = tt;
    if (this.fade < 1 && this.from && D[this.from]) {
      this.fromT += dt;
      this.put(D[this.from], this.from === 'enroscado' ? this.sleepT : this.fromT, 1, this.H2);
      this.put(D[name], tt, this.fade, this.H);
      for (let j = 0; j < HN; j++) this.H[j] = this.H2[j] + (this.H[j] - this.H2[j]) * this.fade;
    } else this.put(D[name], tt, 1, this.H);
    const H = this.H;
    U.head.rotation.set(H[0], H[1] * turnK, 0);
    U.jaw.rotation.x = -H[2];
    U.legs.forEach((l, i) => l.hip.rotation.set(H[3 + i * 3], H[4 + i * 3], H[5 + i * 3]));
    return true;
  }
}
