import * as THREE from 'three';
import Avatars from '../net/Avatars';
import { cineClip, poseCineClip, gauchoClip, cineSnap, headProp, FACE_EYES } from '../net/gauchoSkin';
import { crewIds, personaOf, PERSONA_T } from './cineCrew';
import { assetUrl } from '../../lib/assets';

// Los cuatro gauchos de una escena de mitad de partida (la yerba del penal, el
// cañonazo y la caída de la torre, el final del Monumento), animados con los
// clips hechos a mano en Blender (C:/Users/ignac/Tools/mdu-blender
// medias_clips.py → modelos/gaucho/cine-medias.json) y cada uno con su
// carácter (ui/cineCrew PERSONA: Valiente, Miedoso, Canchero, Viejo).
// - act(r, clip, o): pasa a un clip mezclándose desde la pose que tiene
//   (cineSnap: sin saltos). o: loop, rate, t, fade, look, tilt, yaw.
// - walkTo(r, to, dur, then): camina (el clip de caminar de siempre, al paso).
// - turnTo(r, target): se da vuelta a su ritmo (PERSONA_T: el Viejo, despacio).
// - update(dt): después de people.update (la pose de piezas): cuerpo, piezas
//   y el mate (en la palma si r.mate; si no, escondido: nunca flotando).
// globalThis.__mduBlend = false: no carga los clips (la escena queda como antes).

const URL = '/assets/sotano/modelos/gaucho/cine-medias.json';
let CLIPS = null;
let loading = null;
export function loadCineMedias() {
  if (CLIPS) return Promise.resolve(CLIPS);
  if (globalThis.__mduBlend === false) return Promise.resolve(null);
  loading ||= fetch(assetUrl(URL))
    .then((r) => r.json())
    .then((J) => {
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
      return C;
    })
    .catch(() => null);
  return loading;
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpI = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const smooth = (u) => u * u * (3 - 2 * u);
// la boca en la malla del gaucho (net/gauchoSkin FACE.mouthY; adelante, la cara)
// y la punta de la bombilla del mate de piezas respecto de su base
const MOUTH_Y = 160.6;
const MOUTH_Z = 16;
const OWN_TIP = new THREE.Vector3(0.03, 0.22, 0);
const SIP_MAX = 0.6;
const sA = new THREE.Vector3();
const sB = new THREE.Vector3();
const sU = new THREE.Vector3();
const sM = new THREE.Matrix4();
const sQ = new THREE.Quaternion();
function sipTilt(a, base, q) {
  const B = a.gs.bones;
  const sk = a.gs.mesh.skeleton;
  const hi = sk.bones.indexOf(B.Head);
  sM.copy(B.Head.matrixWorld).multiply(sk.boneInverses[hi]).multiply(a.gs.mesh.bindMatrix);
  const mouth = sA.set(FACE_EYES.x, MOUTH_Y, MOUTH_Z).applyMatrix4(sM);
  const w = Math.max(0, Math.min(1, (0.44 - mouth.distanceTo(base)) / 0.1));
  if (w <= 0) return;
  sB.copy(OWN_TIP).applyQuaternion(q).normalize();
  mouth.sub(base).normalize();
  const ang = Math.min(SIP_MAX, sB.angleTo(mouth)) * w;
  sU.crossVectors(sB, mouth);
  if (sU.lengthSq() < 1e-8) return;
  q.premultiply(sQ.setFromAxisAngle(sU.normalize(), ang));
}
const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
// el yaw de r (el muñeco mira a -z de su yaw... como Avatars) para mirar a `to`
export const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// Los anteojos de sol del Canchero (de aviador, grandes: que se lean de lejos),
// en el espacio de la malla de la cabeza (como ui/PenalCinematic).
let SH_MATS = null;
function buildShades() {
  SH_MATS ||= [new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.7, roughness: 0.12 }), new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 1, roughness: 0.3 })];
  const [glass, gold] = SH_MATS;
  const root = new THREE.Group();
  const E = FACE_EYES;
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.1, 0.4, 20).rotateX(Math.PI / 2), glass);
    lens.scale.y = 0.85;
    lens.position.set(E.x + sx * (E.half + 0.4), E.y - 1.3, 17.3);
    root.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 13), gold);
    arm.position.set(E.x + sx * (E.half + 4), E.y - 0.4, 11);
    root.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2 * E.half - 6, 0.5, 0.45), gold);
  bridge.position.set(E.x, E.y + 0.6, 17.4);
  root.add(bridge);
  return root;
}

export default class CineActors {
  // base: id de los muñecos (el resto de la escena usa otros); floor(x, z): el piso.
  // fill: luz de relleno solo para ellos (desde la cámara, gauchoSkin uFill),
  // para las escenas de noche: se leen sin tocar la luz del resto.
  // (globalThis.__mduNoFill: sin el relleno, para comparar)
  // shades: false, el Canchero sin sus anteojos de sol en esta escena.
  // bandanas: false, sin las bandanas de los compañeros del Gil (net/gilLook
  // crewBandana; solo salen en Mate no Numa y Eclipse): los cuatro de siempre
  // del fogón, la gente del santuario.
  constructor(g, { base = 480, floor = null, parent = null, fill = null, shades = true, bandanas = true } = {}) {
    this.g = g;
    this.fill = fill && !globalThis.__mduNoFill ? new THREE.Color(fill).multiplyScalar(globalThis.__mduFillK ?? 1) : null;
    this.people = new Avatars(g, null);
    this.people.bandanas = bandanas;
    if (parent) parent.add(this.people.root);
    this.floor = floor || ((x, z) => g.world.floorAt(x, z));
    this.list = [];
    this.t = 0;
    this.ready = false;
    loadCineMedias().then((C) => (this.ready = !!C));
    const ids = crewIds(g);
    this.list = ids.map((id, i) => {
      const r = { id: base + id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: personaOf(i) };
      this.people.add(r);
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      r.a = a;
      return r;
    });
    this.by = Object.fromEntries(this.list.map((r) => [r.persona, r]));
    // el Canchero, con sus anteojos de sol puestos (nada lo despeina). Solo en
    // el penal y la torre (el usuario, 2026-10-04: abusaba de los anteojos);
    // en el Monumento, sin anteojos. globalThis.__mduShadesAll: en todos.
    this.shadesOf = shades && (g.mapId === 'penal' || g.mapId === 'torre' || globalThis.__mduShadesAll) ? this.by.canchero || null : null;
  }

  // Cada cuadro, después de mover la escena: los tiempos, los caminos, la pose
  // de piezas (Avatars) y encima la de los clips.
  tick(dt) {
    this.update(dt);
    this.people.update(dt);
    this.pose(dt);
    this.posed = true;
  }

  // Los ubica en un arco mirando a `at` (centro c, radio rad, ancho del arco en rad).
  arc(c, at, rad, spread = 1.1, startA = null) {
    const a0 = startA ?? Math.atan2(c.z - at.z, c.x - at.x);
    const n = this.list.length;
    this.list.forEach((r, i) => {
      const a = a0 + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1));
      r.pos.set(at.x + Math.cos(a) * rad, 0, at.z + Math.sin(a) * rad);
      r.pos.y = this.floor(r.pos.x, r.pos.z);
      r.yaw = yawTo(r.pos, at);
    });
  }

  clipOf(name) {
    return CLIPS?.[name] || gauchoClip(name);
  }

  act(r, name, o = {}) {
    if (!r) return;
    // (antes del primer cuadro el muñeco todavía no está en su lugar: los
    // huesos en el origen. El primer clip arranca derecho, sin mezcla; si no,
    // salía de abajo del piso)
    // (2026-10-07: y el que acaban de poner en otro lugar —r.tpAt, un corte u
    // otro decorado— tampoco se mezcla desde donde estaba: llegaba volando)
    const fresh = !this.posed || (r.tpAt === this.t && globalThis.__mduOldCineGlide !== true);
    r.cc = { name, lt: o.t || 0, rate: o.rate ?? 1, loop: !!o.loop, look: o.look || 0, tilt: o.tilt || 0, yaw: o.yaw, fade: o.fade ?? 0.3, at: this.t, snap: fresh ? null : cineSnap(r.a), fresh };
  }

  // Lo mismo, a cada uno a su tiempo: clips { persona: [clip, opciones] }.
  each(clips, base = 0, scale = 1) {
    for (const r of this.list) {
      const c = clips[r.persona];
      if (!c) continue;
      const d = base + (PERSONA_T[r.persona]?.delay || 0) * scale;
      this.later(d, () => this.act(r, c[0], c[1] || {}));
    }
  }

  later(secs, fn) {
    (this.timers ||= []).push({ t: this.t + secs, fn });
  }

  walkTo(r, to, dur, then = null, thenO = {}) {
    r.mv = { from: r.pos.clone(), to: to.clone(), dur, t: 0, then, thenO, path: null };
    this.act(r, 'walk', { loop: true, fade: 0.25, rate: 0 });
  }

  // Por varios puntos (rodeando algo), a velocidad v.
  walkPath(r, pts, v = 1.0, then = null, thenO = {}) {
    const P = [r.pos.clone(), ...pts.map((p) => p.clone())];
    let L = 0;
    const seg = [];
    for (let i = 1; i < P.length; i++) {
      const d = Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      seg.push(d);
      L += d;
    }
    r.mv = { P, seg, L, dur: L / v, t: 0, then, thenO };
    this.act(r, 'walk', { loop: true, fade: 0.25, rate: 0 });
  }

  turnTo(r, target, dur = null) {
    const y0 = r.yaw;
    const y1 = yawTo(r.pos, target);
    r.turn = { y0, y1, t: 0, dur: dur ?? 0.9 / (PERSONA_T[r.persona]?.turn || 2) + 0.15 };
  }

  update(dt) {
    this.t += dt;
    // (los que vencen juntos, en orden de hora: en línea, después de una trabada
    // vencían varios a la vez y corrían al revés: el Valiente volvía a saludar
    // en vez del puño en alto, distinto que en la otra compu)
    const T = this.timers || [];
    if (T.some((x) => x.t <= this.t)) {
      const due = T.filter((x) => x.t <= this.t).sort((a, b) => a.t - b.t);
      this.timers = T.filter((x) => x.t > this.t);
      for (const x of due) x.fn();
    }
    for (const r of this.list) {
      this.move(r, dt);
      if (r.turn) {
        r.turn.t += dt;
        const k = Math.min(1, r.turn.t / r.turn.dur);
        r.yaw = angLerp(r.turn.y0, r.turn.y1, smooth(k));
        if (k >= 1) r.turn = null;
      }
    }
  }

  move(r, dt) {
    const M = r.mv;
    if (!M) return;
    M.t += dt;
    const k = Math.min(1, M.t / M.dur);
    const prev = tmpW.copy(r.pos);
    if (M.P) {
      // a lo largo del camino, con arranque y frenada suaves
      let s = smooth(k) * M.L;
      let i = 0;
      while (i < M.seg.length - 1 && s > M.seg[i]) {
        s -= M.seg[i];
        i++;
      }
      const u = M.seg[i] > 0 ? Math.min(1, s / M.seg[i]) : 1;
      r.pos.lerpVectors(M.P[i], M.P[i + 1], u);
    } else r.pos.lerpVectors(M.from, M.to, smooth(k));
    r.pos.y = this.floor(r.pos.x, r.pos.z);
    const v = dt > 0 ? Math.hypot(r.pos.x - prev.x, r.pos.z - prev.z) / dt : 0;
    const c = r.cc && this.clipOf(r.cc.name);
    if (c?.speed) r.cc.rate = Math.min(2.2, v / c.speed);
    if (v > 0.05) r.yaw = angLerp(r.yaw, Math.atan2(-(r.pos.x - prev.x), -(r.pos.z - prev.z)), Math.min(1, dt * 6));
    if (k >= 1) {
      r.mv = null;
      this.act(r, M.then || 'cool', { loop: true, fade: 0.35, ...M.thenO });
    }
  }

  // Después de people.update: cada uno con su clip.
  pose(dt) {
    for (const r of this.list) {
      const S = r.cc;
      const a = r.a;
      // (sin clip todavía: igual sin mate flotando)
      if (!r.mate && a.hand) a.hand.visible = false;
      if (a.gun) a.gun.visible = false;
      if (r === this.shadesOf && !r.shades && a.gs?.on) r.shades = headProp(a, buildShades());
      if (this.fill && a.gs?.on) a.M.gaucho?.userData.life?.uFill?.value.copy(this.fill);
      if (!S || !a.gs?.on) continue;
      const c = this.clipOf(S.name);
      // (el clip todavía no bajó: queda la pose de piezas, y cuando llega se
      // mezcla desde ella)
      if (!c) {
        S.fresh = false;
        continue;
      }
      if (!S.snap && !S.fresh) {
        S.snap = cineSnap(a);
        S.at = this.t;
        S.fade = Math.max(S.fade, 0.3);
      }
      S.lt += dt * S.rate;
      // (un clip que no es vuelta queda en su último cuadro aunque se pida en
      // vuelta: si no, volvía de golpe al primero)
      const loop = S.loop && c.loop !== false;
      // (para atrás, rate < 0: se para de donde se arrodilló)
      if (!loop) S.lt = Math.max(0, S.lt);
      const o = { loop, look: S.look, tilt: S.tilt };
      // (2026-10-07, el usuario: "cuando el Gil se iba a entregar a la partida
      // no cargaba por medio segundo y luego aparecía": la mezcla arrancaba de
      // la cadera de antes, en el decorado anterior a 785 m, y el muñeco cruzaba
      // el mapa en 0,6 s. De lejos no se mezcla. __mduOldCineGlide: como antes)
      if (S.snap?.h && globalThis.__mduOldCineGlide !== true && Math.hypot(S.snap.h.x - r.pos.x, S.snap.h.z - r.pos.z) > 12) {
        S.snap = null;
        S.fresh = true;
      }
      if (S.snap && this.t - S.at < S.fade) {
        o.snap = S.snap;
        o.sw = smooth(Math.min(1, (this.t - S.at) / S.fade));
      }
      if (!poseCineClip(a, c, loop ? S.lt : Math.min(S.lt, c.dur), r.pos.x, r.pos.y, r.pos.z, S.yaw ?? r.yaw + Math.PI, o)) continue;
      a.hand.matrix.copy(a.mats[6]);
      a.hand.matrixWorldNeedsUpdate = true;
      if (a.gun) a.gun.visible = false;
      // el mate: en la palma (r.mate) o escondido (nunca flotando)
      const mate = a.hand.children[0];
      if (mate) {
        mate.visible = !!r.mate;
        a.hand.visible = !!r.mate;
        if (r.mate) this.holdMate(r);
      }
    }
  }

  // El mate parado en la mano derecha (la palma arriba, el antebrazo casi
  // horizontal en los clips cebar/offer): arriba del puño, derecho.
  holdMate(r) {
    const a = r.a;
    const mate = a.hand.children[0];
    const B = a.gs.bones;
    B.RightHand.getWorldPosition(tmpV);
    B.RightForeArm.getWorldPosition(tmpW);
    tmpW.subVectors(tmpV, tmpW).normalize();
    tmpV.addScaledVector(tmpW, 0.07);
    tmpV.y += 0.04;
    tmpQ.setFromAxisAngle(UP, r.yaw + (r.cc?.name === 'offer' ? Math.PI / 2 : Math.PI * 1.5));
    // en el sorbo (la mano abajo de la boca, clip 'cebar') el mate se inclina
    // hasta que la punta de la bombilla llega a los labios: se toma con la
    // bombilla, no se come el mate (como ui/MolinoCinematic sipTilt)
    if (globalThis.__mduNoSipTilt !== true) sipTilt(a, tmpV, tmpQ);
    tmpM.compose(tmpV, tmpQ, ONE).premultiply(tmpI.copy(a.group.matrixWorld).multiply(a.hand.matrix).invert());
    tmpM.decompose(mate.position, mate.quaternion, mate.scale);
  }

  // Dónde está la cadera de cada uno (para medir saltos en las pruebas).
  hips() {
    return this.list.map((r) => (r.a.gs?.on ? r.a.gs.bones.Hips.getWorldPosition(new THREE.Vector3()) : null));
  }

  show(on) {
    this.people.root.visible = on;
  }

  dispose() {
    this.people.dispose?.();
    this.people.root.removeFromParent();
  }
}
