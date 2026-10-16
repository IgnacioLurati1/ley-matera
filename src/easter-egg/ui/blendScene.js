import * as THREE from 'three';
import { assetUrl } from '../../lib/assets';
import { cineClip, poseCineClip } from '../net/gauchoSkin';
import { talkAs } from './cineLife';

// El reproductor de las escenas armadas en Blender (el usuario, 2026-10-11:
// "un nuevo sistema de cinemáticas hechas en un motor"). La escena entera se
// arma en Blender sobre el decorado de verdad (C:/Users/ignac/Tools/mdu-blender
// escena.py): los cuerpos, las cámaras con sus cortes, el lente, el foco y los
// eventos en la línea de tiempo. Acá se reproduce tal cual, en el mapa y con
// los gauchos de la partida (cada uno con su poncho).
//
// El archivo (public/assets/sotano/cine/<id>.json), cuadro a cuadro:
//   cam: p (lugar), q (giro), fov (vertical, grados), focus (m; 0: foco solo),
//        fstop, cuts (los cuadros donde cambia de cámara: ahí no se mezcla)
//   actors: { nombre: { persona, q, hips (como los clips de net/gauchoSkin,
//        pero en el mundo), vis y mate ([[desde, hasta], ...] en cuadros) } }
//   events: [{ t, k: 'di' | 'negro' | 'cartel' | 'ev' | 'paso' | 'roce', ... }]
//        ('di' con `actor`: a ese se le mueve la boca; 'paso' y 'roce' salen
//        solos de la animación al exportar y suenan en su lugar)
//   luz: [{ t, key: [r, g, b, x, y, z], rim: [...], fill: [r, g, b] }]: la luz de
//        los personajes por toma (direcciones vistas desde la cámara)
//   tomas: [{ t, nombre }]
//
// Uso, desde una escena (ui/castleCine):
//   const D = await loadBlendScene('demo-monumento');
//   this.blend = new BlendScene(g, D, { actors: this.actors, on: { di: (e) => this.say(e.who, e.text) } });
//   tick(dt, t) { this.actors.tick(dt); this.blend.update(t - this.t0); this.wantFov = this.blend.fov; }

const cache = new Map();
export function loadBlendScene(id) {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(assetUrl(`/assets/sotano/cine/${id}.json`))
        .then((r) => r.json())
        .then((D) => {
          for (const A of Object.values(D.actors)) A.clip = cineClip({ q: A.q, hips: A.hips, n: D.n, fps: D.fps, loop: false });
          D.cam.q = Float32Array.from(D.cam.q);
          D.cam.p = Float32Array.from(D.cam.p);
          D.dur = (D.n - 1) / D.fps;
          return D;
        }),
    );
  }
  return cache.get(id);
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const inRanges = (R, f) => {
  for (const r of R) if (f >= r[0] && f <= r[1]) return true;
  return false;
};

export default class BlendScene {
  // actors: los cuatro de la cuadrilla (ui/cineActors: se atan por `persona`);
  // bind: { nombre del actor en Blender: su ficha (con .a, .pos, .yaw) } para los demás;
  // on: { di(e), negro(e), cartel(e), ev(e) }: los eventos de la línea de tiempo
  constructor(g, D, { actors = null, bind = {}, on = {} } = {}) {
    this.g = g;
    this.D = D;
    this.on = on;
    this.actors = actors;
    this.cuts = new Set(D.cam.cuts);
    this.cast = [];
    this.missing = [];
    for (const [name, A] of Object.entries(D.actors)) {
      const r = bind[name] || actors?.by?.[A.persona] || null;
      if (r) this.cast.push({ name, A, r });
      else this.missing.push(name);
    }
    this.ev = 0;
    this.last = -1;
    this.byName = Object.fromEntries(this.cast.map((c) => [c.name, c.r]));
    this.cutT = (D.tomas || []).map((x) => x.t);
    this.pasos = 0;
    this.fov = D.cam.fov[0];
    this.focus = 0;
  }

  get dur() {
    return this.D.dur;
  }

  // La cámara del segundo t, puesta en la del juego.
  camera(t) {
    const D = this.D;
    const C = D.cam;
    const f = Math.max(0, Math.min(D.n - 1, t * D.fps));
    const f0 = Math.floor(f);
    const f1 = Math.min(D.n - 1, f0 + 1);
    // (a través de un corte no se mezcla)
    const al = this.cuts.has(f1) ? 0 : f - f0;
    const cam = this.g.camera;
    const p = C.p;
    cam.position.set(p[f0 * 3] + (p[f1 * 3] - p[f0 * 3]) * al, p[f0 * 3 + 1] + (p[f1 * 3 + 1] - p[f0 * 3 + 1]) * al, p[f0 * 3 + 2] + (p[f1 * 3 + 2] - p[f0 * 3 + 2]) * al);
    cam.quaternion.copy(qa.fromArray(C.q, f0 * 4)).slerp(qb.fromArray(C.q, f1 * 4), al);
    this.fov = C.fov[f0] + (C.fov[f1] - C.fov[f0]) * al;
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    // el foco: el de la cámara de Blender
    const fo = C.focus[f0] > 0 && C.focus[f1] > 0 ? C.focus[f0] + (C.focus[f1] - C.focus[f0]) * al : 0;
    this.focus = fo;
  }

  // Cada cuadro, después de actors.tick(dt): los cuerpos, la cámara y los eventos.
  update(t) {
    const D = this.D;
    t = Math.max(0, Math.min(D.dur, t));
    const f = t * D.fps;
    for (const { A, r } of this.cast) {
      const a = r.a;
      if (!a) continue;
      a.group.visible = !A.vis.length || inRanges(A.vis, f);
      r.mate = inRanges(A.mate, f);
      // (lo maneja la escena de Blender: sin los clips ni los caminos de ui/cineActors)
      r.cc = null;
      r.mv = null;
      if (!a.gs?.on || !poseCineClip(a, A.clip, t, 0, 0, 0, 0)) continue;
      // dónde quedó parado y para dónde mira (las etiquetas, el mate, la lente)
      const B = a.gs.bones;
      B.Hips.getWorldPosition(va);
      r.pos.set(va.x, this.actors ? this.actors.floor(va.x, va.z) : va.y - 0.95, va.z);
      B.LeftArm.getWorldPosition(va);
      B.RightArm.getWorldPosition(vb);
      va.sub(vb).cross(UP);
      if (va.lengthSq() > 1e-6) r.yaw = Math.atan2(va.x, va.z) - Math.PI;
      if (a.hand) {
        a.hand.matrix.copy(a.mats[6]);
        a.hand.matrixWorldNeedsUpdate = true;
        if (a.gun) a.gun.visible = false;
        const mate = a.hand.children[0];
        if (mate) {
          mate.visible = !!r.mate;
          a.hand.visible = !!r.mate;
          if (r.mate && this.actors) this.actors.holdMate(r);
        }
      }
    }
    this.camera(t);
    this.light(t);
    const E = D.events;
    // (para atrás, una prueba: los eventos vuelven a contar)
    if (t < this.last) this.ev = 0;
    while (this.ev < E.length && E[this.ev].t <= t) {
      const e = E[this.ev++];
      // (los que quedaron muy atrás, al saltar adelante, no se disparan)
      if (t - e.t < 1 || e.k === 'negro') {
        if (e.k === 'paso' || e.k === 'roce') this.foley(e);
        else {
          // (el que habla mueve la boca: ui/cineLife)
          if (e.k === 'di' && e.actor && this.byName[e.actor]?.a) talkAs(this.byName[e.actor].a, e.who);
          this.on[e.k]?.(e);
        }
      }
    }
    this.last = t;
  }

  // La luz de los personajes en el segundo t: la llave anterior, mezclada con
  // la que sigue si no hay un corte en el medio.
  light(t) {
    const L = this.D.luz;
    if (!L?.length) return;
    let i = -1;
    for (let k = 0; k < L.length && L[k].t <= t; k++) i = k;
    const a = i >= 0 ? L[i] : null;
    let b = a && L[i + 1] ? L[i + 1] : null;
    if (b && this.cutT.some((c) => c > a.t + 1e-3 && c <= b.t + 1e-3)) b = null;
    const u = b ? Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-3, b.t - a.t))) : 0;
    const mix = (k, j) => {
      const x = a?.[k]?.[j] ?? 0;
      return b ? x + ((b[k]?.[j] ?? 0) - x) * u : x;
    };
    for (const { r } of this.cast) {
      const U = r.a?.M?.gaucho?.userData.life;
      if (!U?.uCineKey) continue;
      U.uCineKey.value.setRGB(mix('key', 0), mix('key', 1), mix('key', 2));
      U.uCineRim.value.setRGB(mix('rim', 0), mix('rim', 1), mix('rim', 2));
      U.uFill.value.setRGB(mix('fill', 0), mix('fill', 1), mix('fill', 2));
      if (a?.key) U.uCineKeyDir.value.set(mix('key', 3), mix('key', 4), mix('key', 5)).normalize();
      if (a?.rim) U.uCineRimDir.value.set(mix('rim', 3), mix('rim', 4), mix('rim', 5)).normalize();
    }
  }

  // Un paso o un roce de ropa, donde pasó (la animación de Blender dice
  // cuándo apoya cada pie y cuándo una mano arranca rápido).
  foley(e) {
    const g = this.g;
    const A = g.audio;
    if (!A?.out) return;
    const r = this.byName[e.actor];
    if (r?.a && !r.a.group.visible) return;
    const pos = va.set(e.p[0], e.p[1], e.p[2]);
    this.pasos++;
    // (foleyBus: otro camino para los pasos, si la escena lo pone —ui/finEclipseBlend, el mundo blanco, con los
    // efectos del juego apagados—; sin él, como siempre)
    const bus = this.foleyBus || null;
    if (e.k === 'roce') {
      const o = A.out({ pos, gain: 0.1, reverb: 0.05, ref: 2.5, bus });
      A.noise(o, { dur: 0.16, type: 'bandpass', freq: 2600, freqEnd: 1500, q: 0.6, gain: 0.5, attack: 0.03 });
      return;
    }
    const surf = g.world.surfaceAt?.(e.p[0], e.p[2]);
    const o = A.out({ pos, gain: 0.45, reverb: 0.08, ref: 3, bus });
    const f = { dirt: 500, wood: 700, tile: 1600, concrete: 1300 }[surf] || 900;
    A.noise(o, { dur: 0.09, freq: f * (0.8 + Math.random() * 0.4), q: 1, gain: 0.8 });
    if (surf === 'wood') A.tone(o, { dur: 0.08, freq: 120, freqEnd: 70, gain: 0.3 });
  }

  dispose() {
    for (const { r } of this.cast) {
      const U = r.a?.M?.gaucho?.userData.life;
      if (!U?.uCineKey) continue;
      U.uCineKey.value.setRGB(0, 0, 0);
      U.uCineRim.value.setRGB(0, 0, 0);
      U.uFill.value.setRGB(0, 0, 0);
      talkAs(r.a, null);
    }
  }
}
