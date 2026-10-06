import * as THREE from 'three';
import { assetUrl } from '../../lib/assets';

// El Mateendrache con clips hechos en Blender (C:/Users/ignac/Tools/mdu-blender/
// drag_clips.py: el mismo esqueleto plano del modelo, cada hueso con su
// posición y giro en el espacio del bicho, por cuadro, a 30 cuadros/s).
// world/Mateendrache.js sigue calculando su pose de piezas (las cadenas de la
// cueva, el chorro de fuego, la mirada) y escribiendo los huesos como antes;
// después, si hay clip para lo que está haciendo, el clip se mezcla encima con
// su peso (de a poco: nunca salta). Lo que no tiene clip queda como antes.
//   · volando: 'vuelo' (aletea: hombro, codo y mano desfasados, se pliega al
//     subir) y 'planeo' (alas abiertas, ajustes chicos). Con flapK bajo (el
//     paseo con los cuatro arriba) da dos aletazos y planea; con flapK alto
//     aletea siempre y más rápido.
//   · de parado a volando: 'despegue' (se agacha, alas arriba, primer aletazo
//     empujando con las patas) y sigue con el vuelo.
//   · la mirada (look) y la boca (open/roarJaw) van encima del clip: el cuello
//     se curva hacia lo que mira con los mismos topes de siempre (reachable).
// Modelo: el mismo modelo.glb (probé arreglar los pesos de las escamas sueltas,
// drag_reweight*.py, y quedaba peor). Switch:
// globalThis.__mduNoDragonBlend = true (antes de armar el dragón) = como antes.
// Para probar con el switch apagado por defecto: globalThis.__mduDragonBlend = true.

const CLIPS_URL = '/assets/sotano/modelos/mateendrache/clips-blend.json';
// (el mismo modelo: probé arreglar los pesos de las escamas sueltas y quedaba peor)
export const BLEND_GLB = '/assets/sotano/modelos/mateendrache/modelo.glb';
const DEFAULT_ON = true;
export const dragonBlendOn = () => globalThis.__mduNoDragonBlend !== true && globalThis.__mduBlend !== false && (DEFAULT_ON || globalThis.__mduDragonBlend === true);

const C = { p: null, data: null };
export function loadDragonClips() {
  if (!dragonBlendOn()) return null;
  C.p ||= fetch(assetUrl(CLIPS_URL))
    .then((r) => (r.ok ? r.json() : null))
    .then((J) => {
      if (!J) return null;
      const out = { bones: J.bones, clips: {} };
      for (const [k, c] of Object.entries(J.clips)) out.clips[k] = { n: c.n, dur: c.dur, loop: !!c.loop, hold: c.hold, p: Float32Array.from(c.p), q: Float32Array.from(c.q), nb: J.bones.length };
      C.data = out;
      return out;
    })
    .catch(() => null);
  return C.p;
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();

// Muestra el clip c en el tiempo t (s) dentro de out[i] = { p, q } (con mezcla entre cuadros).
function sample(c, t, out) {
  const f = (t * 30) % (c.loop ? c.n : 1e9);
  let f0 = Math.floor(c.loop ? f : Math.min(f, c.n - 1));
  let u = c.loop ? f - f0 : Math.min(1, Math.max(0, f - f0));
  let f1 = c.loop ? (f0 + 1) % c.n : Math.min(f0 + 1, c.n - 1);
  if (!c.loop && f >= c.n - 1) {
    f0 = f1 = c.n - 1;
    u = 0;
  }
  const nb = c.nb;
  for (let i = 0; i < nb; i++) {
    const a = (f0 * nb + i) * 3;
    const b = (f1 * nb + i) * 3;
    out[i].p.set(c.p[a] + (c.p[b] - c.p[a]) * u, c.p[a + 1] + (c.p[b + 1] - c.p[a + 1]) * u, c.p[a + 2] + (c.p[b + 2] - c.p[a + 2]) * u);
    const qa4 = (f0 * nb + i) * 4;
    const qb4 = (f1 * nb + i) * 4;
    qa.set(c.q[qa4], c.q[qa4 + 1], c.q[qa4 + 2], c.q[qa4 + 3]);
    qb.set(c.q[qb4], c.q[qb4 + 1], c.q[qb4 + 2], c.q[qb4 + 3]);
    out[i].q.slerpQuaternions(qa, qb, u);
  }
}

// La altura de un hueso (en el espacio del bicho) en un clip a los t s, sin
// mezclas: para apoyar en el piso las patas del aterrizaje (ui/CastleEnding.js).
// null si los clips no bajaron.
export function clipY(name, bone, t = 0) {
  const c = C.data?.clips?.[name];
  const i = C.data ? C.data.bones.indexOf(bone) : -1;
  if (!c || i < 0) return null;
  const f = Math.max(0, Math.min(c.n - 1, t * 30));
  const f0 = Math.floor(f);
  const f1 = Math.min(c.n - 1, f0 + 1);
  const u = f - f0;
  return c.p[(f0 * c.nb + i) * 3 + 1] * (1 - u) + c.p[(f1 * c.nb + i) * 3 + 1] * u;
}

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
// paseo (flapK bajo): dos aletazos y planea; el ciclo del vuelo dura 3,2 s
const GLIDE = 4.2;
const FADE = 0.55;
// el piso (DragonBlend.floor): cuánto arriba queda lo más bajo, y desde cuánto empieza a frenar
const FL_MARGIN = 0.04;
const FL_SOFT = 0.5;
// lo que tarda en pasar del vuelo al clip del aterrizaje
const LAND_XF = 0.35;

export class DragonBlend {
  constructor(D) {
    this.D = D;
    this.w = 0;
    this.state = null;
    this.t = 0;
    this.A = null;
    this.B = null;
    this.flyT = 0;
    this.glideW = 0;
    this.fadeDur = 0.6;
  }

  ready() {
    return !!C.data && !!this.D.skin;
  }

  bufs() {
    if (this.A) return;
    const n = C.data.bones.length;
    const mk = () => Array.from({ length: n }, () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() }));
    this.A = mk();
    this.B = mk();
    this.T = mk();
    this.list = C.data.bones.map((nm) => this.D.skin.bones[nm]);
    this.idx = Object.fromEntries(C.data.bones.map((nm, i) => [nm, i]));
  }

  // Qué hace (cada cuadro): fija el peso del clip y llena this.T con la pose del clip.
  pose(dt) {
    const D = this.D;
    const clips = C.data.clips;
    const want = D.pose === 'fly' ? 'fly' : D.pose === 'stand' && clips.posado ? 'stand' : null;
    if (want !== this.state) {
      // de parado a volando: despega; de volando a parado: aterriza
      this.takeoff = want === 'fly' && this.state === 'stand' || (want === 'fly' && this.state === null && D.prevPose === 'stand' && D.blendDur > 0.3);
      this.takeoff = !!(this.takeoff && clips.despegue);
      this.landing = !!(want === 'stand' && this.state === 'fly' && clips.aterrizaje && D.blendDur > 0.3);
      // (de lo que estaba volando al aterrizaje, en LAND_XF s: el clip arranca con
      // las alas arriba y el ala saltaba de abajo a arriba en un cuadro.
      // globalThis.__mduNoLandFix = true: como antes)
      if (this.landing && this.T && globalThis.__mduNoLandFix !== true) {
        this.X ||= this.T.map(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() }));
        this.T.forEach((b, i) => (this.X[i].p.copy(b.p), this.X[i].q.copy(b.q)));
        this.xf = 0;
      } else this.xf = null;
      this.state = want;
      this.t = 0;
      if (want === 'fly') this.flyT = 0;
      this.fadeDur = Math.max(0.25, Math.min(3.5, D.blendDur || 0.6));
    }
    const on = want ? 1 : 0;
    const rate = this.takeoff || this.landing ? 4 : 1 / this.fadeDur;
    this.w += Math.sign(on - this.w) * Math.min(Math.abs(on - this.w), dt * rate);
    if (this.w <= 0.001) return 0;
    this.t += dt;
    if (want === 'fly' || (!want && this.state === 'fly')) {
      if (this.takeoff && this.t < clips.despegue.dur) {
        sample(clips.despegue, this.t, this.T);
        // los últimos 0,4 s se funde con el vuelo
        const k = clamp01((this.t - (clips.despegue.dur - 0.4)) / 0.4);
        if (k > 0) {
          this.fly(dt, this.B);
          this.mix(this.T, this.B, smooth(k), this.T);
        }
        return this.w;
      }
      if (this.takeoff) {
        this.takeoff = false;
        this.flyT = 0.4;
      }
      this.fly(dt, this.T);
      return this.w;
    }
    this.stand(dt);
    return this.w;
  }

  // Parado: posado (y las alas abiertas si se las pide), con lo que haga encima
  // (rugir, escupir, saludar a la corona, la reverencia), cada cosa con su peso.
  stand(dt) {
    const D = this.D;
    const clips = C.data.clips;
    const T = this.T;
    if (this.landing && this.t < clips.aterrizaje.dur) {
      sample(clips.aterrizaje, this.t, T);
      if (this.xf != null) {
        this.xf += dt;
        // (out tiene que ser el primero: slerpQuaternions copia el primero encima)
        if (this.xf < LAND_XF) this.mix(T, this.X, 1 - smooth(this.xf / LAND_XF), T);
        else this.xf = null;
      }
      const k = clamp01((this.t - (clips.aterrizaje.dur - 0.4)) / 0.4);
      if (k > 0) {
        this.base(dt, this.B);
        this.mix(T, this.B, smooth(k), T);
      }
      this.standT = 0;
      return;
    }
    this.landing = false;
    this.base(dt, T);
    const L = (this.lay ||= { fuego: 0, jura: 0, rug: 0, rugT: 9, roarN: D.roarN || 0, juraT: 0 });
    // el rugido: cada roarJaw arranca el clip (con el ritmo para que dure lo del sonido)
    if ((D.roarN || 0) !== L.roarN) {
      L.roarN = D.roarN || 0;
      L.rugT = 0;
      L.rugRate = THREE.MathUtils.clamp(clips.rugido.dur / ((D.roarDur || 1.8) + 0.6), 0.8, 1.3);
    }
    // ¿mira muy arriba (la corona de la jura) o se echa atrás (CastleEnding rearK)?
    let high = 0;
    if (D.lookAt && (D.jawWant || 0) > 0.4) {
      const lp = D.root.worldToLocal(va.copy(D.lookAt)).sub(D.P[8]);
      const el = Math.atan2(lp.y, Math.hypot(lp.x, lp.z));
      high = el > 0.8 ? 1 : 0;
    }
    const jw = Math.max(high, D.rearK || 0);
    const fw = (D.jawWant || 0) > 0.4 && !jw ? 1 : 0;
    const ease = (cur, to, secs) => cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), dt / secs);
    L.jura = ease(L.jura, jw, 0.3);
    L.fuego = ease(L.fuego, fw, 0.35);
    L.juraT = L.jura > 0.001 ? L.juraT + dt : 0;
    L.rugT += dt * (L.rugRate || 1);
    const rugOn = L.rugT < clips.rugido.dur;
    L.rug = ease(L.rug, rugOn ? 1 : 0, rugOn ? 0.15 : 0.3);
    if (L.fuego > 0.001 && clips.fuego) this.over(clips.fuego, this.standT, L.fuego);
    // (el rugido abajo de la jura: saludando a la corona ruge con el cuello arriba)
    if (L.rug > 0.001 && clips.rugido) this.over(clips.rugido, Math.min(L.rugT, clips.rugido.dur), smooth(L.rug));
    if (L.jura > 0.001 && clips.jura) {
      const J = clips.jura;
      const h = J.hold || J.dur * 0.6;
      const tt = L.juraT < J.dur ? L.juraT : h + ((L.juraT - h) % Math.max(0.1, J.dur - h));
      this.over(J, tt, smooth(L.jura));
    }
    if ((D.bowK || 0) > 0.001 && clips.reverencia) this.over(clips.reverencia, D.bowK * clips.reverencia.dur, 1, D.bowK);
    // (lo que el clip ya pone en el cuello, la mirada no lo tuerce)
    this.lookW = 1 - Math.max(smooth(L.jura), D.bowK || 0, 0.7 * smooth(L.rug));
  }

  // La base parada: posado; con spreadWings, las alas abiertas.
  base(dt, out) {
    const D = this.D;
    const clips = C.data.clips;
    this.standT = (this.standT || 0) + dt;
    sample(clips.posado, this.standT, out);
    const wk = D.wingK || 0;
    if (wk > 0.001 && clips.alas) {
      sample(clips.alas, this.standT, this.A);
      this.mix(out, this.A, smooth(Math.min(1, wk)), out);
    }
  }

  // Un clip encima de this.T con peso k (sample en el tiempo t).
  over(c, t, k, kk = k) {
    sample(c, t, this.A);
    this.mix(this.T, this.A, Math.min(1, kk), this.T);
  }

  // El vuelo: aletea o planea según flapK (con la cara de la mezcla en el medio del aletazo).
  fly(dt, out) {
    const D = this.D;
    const clips = C.data.clips;
    const k = D.flapK ?? 1;
    const rate = THREE.MathUtils.clamp(0.8 + 0.25 * k, 0.85, 1.25);
    this.flyT += dt * rate;
    let g = 0;
    if (k < 0.8 && clips.planeo) {
      // dos aletazos (3,2 s del clip) y planea GLIDE s
      const cyc = clips.vuelo.dur + GLIDE;
      const u = this.flyT % cyc;
      const vd = clips.vuelo.dur;
      g = u < vd - FADE ? 0 : u < vd ? smooth((u - (vd - FADE)) / FADE) : u < cyc - FADE ? 1 : 1 - smooth((u - (cyc - FADE)) / FADE);
    }
    this.glideW += (g - this.glideW) * Math.min(1, dt * 6);
    // (el tiempo del aleteo: antes flyT % (vuelo + GLIDE) volvía al cuadro 0 desde el
    // 30 a cada vuelta, con el ala a la vista: el ala saltaba cada ~7 s, también
    // aterrizando en el final del castillo. Sin planeo, de corrido; planeando, el
    // salto queda escondido en el medio del planeo y el aleteo vuelve a arrancar
    // justo al terminar. globalThis.__mduNoFlyWrap = true: como antes)
    const vd = clips.vuelo.dur;
    const cyc = vd + GLIDE;
    let ut = this.flyT % cyc;
    if (globalThis.__mduNoFlyWrap !== true) {
      if (!(k < 0.8 && clips.planeo)) ut = this.flyT;
      else if (ut >= vd + GLIDE / 2) ut = (((ut - cyc) % vd) + vd) % vd;
    }
    if (this.glideW < 0.999) sample(clips.vuelo, ut, out);
    if (this.glideW > 0.001) {
      sample(clips.planeo, this.flyT, this.A);
      if (this.glideW >= 0.999) for (let i = 0; i < out.length; i++) (out[i].p.copy(this.A[i].p), out[i].q.copy(this.A[i].q));
      else this.mix(out, this.A, this.glideW, out);
    }
  }

  mix(a, b, k, out) {
    for (let i = 0; i < a.length; i++) {
      out[i].p.lerpVectors(a[i].p, b[i].p, k);
      out[i].q.slerpQuaternions(a[i].q, b[i].q, k);
    }
  }

  // Después de driveSkin (los huesos ya tienen la pose de piezas): el clip encima.
  apply(dt) {
    if (!this.ready()) return false;
    this.bufs();
    const w = this.pose(dt);
    if (w <= 0.001) return false;
    const T = this.T;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (w >= 0.999) {
        b.position.copy(T[i].p);
        b.quaternion.copy(T[i].q);
      } else {
        b.position.lerp(T[i].p, w);
        b.quaternion.slerp(T[i].q, w);
      }
    }
    this.look(dt, w);
    this.jaw();
    if (this.D.floorY != null) this.floor(this.D.floorY);
    return true;
  }

  // El piso (D.floorY, en el mundo; lo pone ui/CastleEnding mientras el dragón está
  // en la isla): los clips de vuelo y de aterrizaje bajan las puntas de las alas
  // hasta 4 m abajo del hombro y la punta de la cola abajo de las patas, pensados
  // en el aire. Cerca del piso, cada ala gira para arriba sobre el hombro y la
  // cola se levanta desde s20 (más cuanto más atrás), lo justo para no
  // atravesarlo, frenando de a poco desde FL_SOFT m antes (no se ve el tope).
  floor(fy) {
    const D = this.D;
    const mesh = D.skin?.mesh;
    if (!mesh) return;
    const F = (this.fl ||= this.floorSetup(mesh));
    if (!F) return;
    D.root.updateMatrixWorld(true);
    const e = D.root.matrixWorld.elements;
    const inv = (F.inv ||= new THREE.Matrix4()).copy(D.root.matrixWorld).invert();
    const wy = (x, y, z) => e[1] * x + e[5] * y + e[9] * z + e[13];
    for (const G of F.groups) {
      // (una copia: el hueso del hombro también gira)
      const piv = (F.piv ||= new THREE.Vector3()).copy(this.list[this.idx[G.pivot]].position);
      // dónde está cada punto ahora (con el esqueleto de verdad), respecto del eje
      let n = 0;
      for (const c of G.pts) {
        mesh.getVertexPosition(c.i, va).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv).sub(piv);
        c.x = va.x;
        c.y = va.y;
        c.z = va.z;
        n += G.tail ? 0 : Math.sign(va.x);
      }
      const side = G.tail ? 1 : n >= 0 ? 1 : -1;
      // lo más bajo girando a (por hueso, a·peso): sobre z (alas) o sobre x (cola)
      const low = (a) => {
        let m = 1e9;
        for (const c of G.pts) {
          const t = a * c.w * side;
          const cs = Math.cos(t);
          const sn = Math.sin(t);
          const x = G.tail ? c.x : c.x * cs - c.y * sn;
          const y = G.tail ? c.y * cs - c.z * sn : c.x * sn + c.y * cs;
          const z = G.tail ? c.y * sn + c.z * cs : c.z;
          m = Math.min(m, wy(piv.x + x, piv.y + y, piv.z + z));
        }
        return m - fy - FL_MARGIN;
      };
      const d0 = low(0);
      if (d0 >= FL_SOFT) continue;
      // (lo que queda arriba del piso: el mismo de antes hasta FL_SOFT; más abajo,
      // se acerca al piso sin llegar, con la misma velocidad en el borde)
      const want = FL_SOFT * Math.exp((d0 - FL_SOFT) / FL_SOFT);
      let a0 = 0;
      let a1 = G.max;
      if (low(a1) < want) a0 = a1;
      else {
        for (let k = 0; k < 14; k++) {
          const m = (a0 + a1) / 2;
          if (low(m) < want) a0 = m;
          else a1 = m;
        }
        a0 = a1;
      }
      // girar los huesos (en el espacio del bicho, como la mirada)
      const ax = G.tail ? va.set(1, 0, 0) : va.set(0, 0, 1);
      for (const [nm, wgt] of G.bones) {
        const b = this.list[this.idx[nm]];
        qb.setFromAxisAngle(ax, a0 * wgt * side);
        b.position.sub(piv).applyQuaternion(qb).add(piv);
        b.quaternion.premultiply(qb);
      }
    }
  }

  // Los puntos de la malla que pueden tocar el piso (las alas y la cola), una vez:
  // de cada ala lo más lejos del hombro, de la cola lo de s21 para atrás.
  floorSetup(mesh) {
    const pos = mesh.geometry.attributes.position;
    const si = mesh.geometry.attributes.skinIndex;
    const sw = mesh.geometry.attributes.skinWeight;
    const bones = mesh.skeleton.bones;
    const bindPos = (bi) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(mesh.skeleton.boneInverses[bi]).invert());
    const v = new THREE.Vector3();
    const tailW = (nm) => {
      const k = +nm.slice(1);
      return nm[0] === 's' && k > 20 ? ((k - 20) / 9) ** 0.8 : null;
    };
    const groups = [
      { pivot: 'wL_arm', match: (nm) => nm.startsWith('wL_'), max: 1.3, pts: [], bones: ['wL_arm', 'wL_fore', 'wL_f1', 'wL_f2', 'wL_f3'].map((n) => [n, 1]) },
      { pivot: 'wR_arm', match: (nm) => nm.startsWith('wR_'), max: 1.3, pts: [], bones: ['wR_arm', 'wR_fore', 'wR_f1', 'wR_f2', 'wR_f3'].map((n) => [n, 1]) },
      { pivot: 's20', tail: true, match: (nm) => tailW(nm) != null, max: 0.9, pts: [], bones: Array.from({ length: 9 }, (_, j) => [`s${21 + j}`, tailW(`s${21 + j}`)]) },
    ];
    if (groups.some((G) => G.bones.some(([n]) => this.idx[n] == null) || this.idx[G.pivot] == null)) return null;
    const bi = Object.fromEntries(bones.map((b, i) => [b.name, i]));
    for (const G of groups) G.p0 = bindPos(bi[G.pivot]);
    const all = groups.map(() => []);
    for (let i = 0; i < pos.count; i++) {
      let b = 0;
      let w = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) (w = sw.getComponent(i, k), b = si.getComponent(i, k));
      const nm = bones[b]?.name || '';
      const gi = groups.findIndex((G) => G.match(nm));
      if (gi < 0) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      all[gi].push({ i, d: v.distanceTo(groups[gi].p0), w: groups[gi].tail ? tailW(nm) : 1 });
    }
    // (lo más lejos del eje primero: de esos, ~180 por grupo)
    groups.forEach((G, gi) => {
      const L = all[gi].sort((a, b) => b.d - a.d);
      const far = L.slice(0, Math.ceil(L.length * 0.35));
      const st = Math.max(1, Math.floor(far.length / 180));
      for (let k = 0; k < far.length; k += st) G.pts.push({ i: far[k].i, w: far[k].w, x: 0, y: 0, z: 0 });
    });
    return { groups };
  }

  // La mirada encima del clip: el cuello se curva hacia el blanco (con los topes
  // de siempre: reachable), más cerca de la cabeza que de la base.
  look(dt, w) {
    const D = this.D;
    const k = (D.lookK || 0) * w * (D.pose === 'stand' ? (this.lookW ?? 1) : 1);
    if (k < 0.01 || !D.lookAt) return;
    const B = this.list[this.idx.s8].position;
    const tgt = D.root.worldToLocal(va.copy(D.lookAt));
    // (reachable usa P[NECK] de las piezas como base: se corre a la del clip)
    tgt.sub(B).add(D.P[8]);
    D.reachable(tgt);
    tgt.sub(D.P[8]).add(B);
    const h = this.list[this.idx.s0].position;
    vb.subVectors(h, B).normalize();
    tgt.sub(B).normalize();
    const q = qa.setFromUnitVectors(vb, tgt);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    const kk = k * 0.75 * (ang > 1.6 ? 1.6 / ang : 1);
    const I = new THREE.Quaternion();
    const rot = (b, wgt) => {
      qb.copy(I).slerp(q, wgt);
      b.position.sub(B).applyQuaternion(qb).add(B);
      b.quaternion.premultiply(qb);
    };
    for (let i = 0; i < 8; i++) rot(this.list[this.idx['s' + i]], kk * ((8 - i) / 8) ** 0.7);
    rot(this.list[this.idx.head], kk);
  }

  // La boca: la mandíbula pegada a la cabeza, abierta lo que diga el dragón.
  jaw() {
    const D = this.D;
    const H = this.list[this.idx.head];
    const J = this.list[this.idx.jaw];
    J.position.fromArray(D.skin.meta.jaw).applyQuaternion(H.quaternion).add(H.position);
    J.quaternion.copy(H.quaternion).multiply(qb.setFromAxisAngle(va.set(1, 0, 0), D.jaw * D.jawOpenK));
  }
}
