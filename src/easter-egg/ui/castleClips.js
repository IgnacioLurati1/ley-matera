import * as THREE from 'three';
import { cineClip, poseCineClip, cineSnap, gauchoClip } from '../net/gauchoSkin';
import { personaOf } from './cineCrew';
import { assetUrl } from '../../lib/assets';

// Los cuerpos de las cinemáticas del castillo animados a mano en Blender
// (C:/Users/ignac/Tools/mdu-blender/castillo_clips.py → cine-castillo.json),
// cada uno con su carácter (ui/cineCrew PERSONA): los gauchos del final, los
// caballeros del origen, los de la jura y los del negro. Va encima de la pose
// de piezas: act(r, avs, nombre) pasa a un clip mezclando desde la pose que
// tiene (el clip de antes o la de piezas); release(r) vuelve a la de piezas,
// también mezclando.
// Después de poner los huesos se rearman las piezas, la mano y el mate de la
// luz (parado, como en la mano). Sin los clips (o con globalThis.__mduBlend =
// false) no hace nada: queda la pose de piezas de siempre.

const URL = '/assets/sotano/modelos/gaucho/cine-castillo.json';
// (y los de la Gran Guerra: el tirón de la cadena de luz, torre2_clips.py)
const URL2 = '/assets/sotano/modelos/gaucho/cine-castillo2.json';
let LOAD = null;
export function loadCastleClips() {
  const get = (u) =>
    fetch(assetUrl(u))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  LOAD ||= Promise.all([get(URL), get(URL2)])
    .then(([J, J2]) => {
      if (!J) return null;
      const C = {};
      for (const [k, c] of Object.entries({ ...J.clips, ...(J2?.clips || {}) })) C[k] = cineClip(c);
      return C;
    })
    .catch(() => null);
  return LOAD;
}

// la letra de cada carácter en los nombres de los clips (pantV, raiseM...)
const LETTER = { valiente: 'V', miedoso: 'M', canchero: 'C', viejo: 'O' };
export const personaLetter = (i) => LETTER[personaOf(i)] || 'V';

const ONE = new THREE.Vector3(1, 1, 1);
const MATE_AT = new THREE.Vector3(0, -0.02, 0.01);
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

// Las piezas, la mano y el mate donde dicen los huesos (a.mats, recién puestas).
export function placeAvatar(a, yaw) {
  for (const m of a.parts) {
    m.matrix.copy(a.mats[m.part]);
    m.matrixWorldNeedsUpdate = true;
  }
  a.hand.matrix.copy(a.mats[6]);
  a.hand.matrixWorldNeedsUpdate = true;
  for (const e of a.extras) {
    e.obj.matrix.multiplyMatrices(a.mats[e.part], e.off);
    e.obj.matrixWorldNeedsUpdate = true;
  }
  placeMate(a, yaw);
}

// El mate de la luz parado en la mano (girado con el cuerpo). También con la
// pose de piezas: ahí net/Avatars lo apoya en la palma por lo de abajo del
// modelo, y el Illapa (los pararrayos, el resorte) quedaba 80 cm arriba de la mano.
export function placeMate(a, yaw) {
  if (!a.gun) return;
  tmpQ.setFromEuler(tmpE.set(0, yaw, 0, 'YXZ'));
  tmpP.copy(MATE_AT).applyQuaternion(tmpQ);
  tmpD.set(0, -0.19, 0).applyMatrix4(a.mats[6]);
  a.gun.matrix.compose(tmpP.add(tmpD), tmpQ, ONE);
  a.gun.matrixWorldNeedsUpdate = true;
}

export default class CastleClips {
  constructor() {
    this.C = null;
    this.now = 0;
    this.recs = new Set();
    if (globalThis.__mduBlend !== false) loadCastleClips().then((C) => (this.C = C));
  }

  has(name) {
    return !!this.C?.[name];
  }

  // r: el registro (pos, yaw); avs: los cuerpos que lo siguen (el cuerpo y su
  // borde de luz). o: t (por dónde arranca), rate, fade, loop.
  // De un clip a otro se mezclan los dos (el de antes sigue andando); desde
  // la pose de piezas, desde la que tiene en ese cuadro (people.update ya la
  // puso cuando corre update).
  act(r, avs, name, o = {}) {
    // (también los de siempre, clips.json: 'walk' para caminar al paso)
    const c = this.C?.[name] || (this.C ? gauchoClip(name) : null);
    if (!c || !avs[0]) {
      // (todavía bajando los clips: con la pose de piezas, el mate en la mano)
      if (!this.C && avs[0]) this.seat(r, avs);
      return false;
    }
    if (r.cc?.name === name && !o.restart) return true;
    const P = r.cc || r.ccOut;
    const from = P ? { c: P.c, lt: P.lt, rate: P.rate, loop: P.loop } : null;
    r.cc = { name, c, lt: o.t || 0, rate: o.rate ?? 1, loop: o.loop ?? !!c.loop, fade: o.fade ?? 0.45, at: this.now, avs, from };
    r.ccOut = null;
    this.recs.add(r);
    return true;
  }

  // Vuelve a la pose de piezas mezclando desde el clip (que sigue andando).
  // avs: los cuerpos, para tenerles el mate en la mano aunque nunca hayan
  // tenido clip.
  release(r, fade = 0.6, avs = null) {
    const S = r.cc;
    if (!S) {
      if (avs && !r.ccSeat) this.seat(r, avs);
      return;
    }
    r.cc = null;
    r.ccOut = { at: this.now, fade, avs: S.avs, c: S.c, lt: S.lt, rate: S.rate, loop: S.loop };
    r.ccSeat = S.avs;
  }

  // Sin clip (pose de piezas): el mate en la mano en cada update. (Con
  // __mduBlend = false, nada: como antes.)
  seat(r, avs) {
    if (globalThis.__mduBlend === false) return;
    r.ccSeat = avs;
    this.recs.add(r);
  }

  // (el tiempo de cada clip se va sumando con su ritmo: caminando, el ritmo
  // cambia con lo que avanza y no salta)
  clipT(S) {
    return S.loop ? S.lt : Math.min(S.lt, S.c.dur);
  }

  // El ritmo del clip que tiene (caminando: lo que avanza / lo que avanza el clip).
  rate(r, v) {
    if (r.cc) r.cc.rate = v;
  }

  // Cada cuadro, después de people.update (que pone la pose de piezas).
  update(dt) {
    this.now += dt;
    for (const r of this.recs) {
      for (const X of [r.cc, r.cc?.from, r.ccOut]) if (X) X.lt += dt * X.rate;
      const S = r.cc;
      const yaw = (r.yaw || 0) + Math.PI;
      if (S) {
        const tt = this.clipT(S);
        const w = S.fade > 0 ? Math.min(1, (this.now - S.at) / S.fade) : 1;
        const k = w * w * (3 - 2 * w);
        S.avs.forEach((a) => {
          // (el que está fuera de cuadro y congelado —net/Avatars offCull— no se posa: nadie lo ve)
          if (a.group?.mcFrozen === true) return;
          const o = { loop: S.loop };
          if (k < 1 && S.from) {
            o.from = { c: S.from.c, t: this.clipT(S.from), loop: S.from.loop };
            o.w = k;
          } else if (k < 1) {
            // (la pose de piezas de este cuadro)
            o.snap = cineSnap(a);
            o.sw = k;
          }
          if (poseCineClip(a, S.c, tt, r.pos.x, r.pos.y, r.pos.z, yaw, o)) placeAvatar(a, r.yaw || 0);
        });
        if (k >= 1) S.from = null;
        continue;
      }
      const O = r.ccOut;
      if (O) {
        const w = Math.min(1, (this.now - O.at) / O.fade);
        const k = w * w * (3 - 2 * w);
        if (k < 1) {
          const tt = this.clipT(O);
          O.avs.forEach((a) => {
            const snap = cineSnap(a);
            if (poseCineClip(a, O.c, tt, r.pos.x, r.pos.y, r.pos.z, yaw, { loop: O.loop, snap, sw: 1 - k })) placeAvatar(a, r.yaw || 0);
          });
          continue;
        }
        r.ccOut = null;
      }
      if (r.ccSeat) for (const a of r.ccSeat) placeMate(a, r.yaw || 0);
      else this.recs.delete(r);
    }
  }
}
