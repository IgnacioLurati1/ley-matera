import * as THREE from 'three';
import Avatars from '../../net/Avatars';
import { cineClip, cineSnap, poseCineClip } from '../../net/gauchoSkin';
import { assetUrl } from '../../../lib/assets';

// Porteño encubierto (entities/penal/Porteno.js): los cuerpos de los gauchos
// que no son los muñecos de la partida. Un juego de muñecos aparte (como el
// cuerpo del final, Game.startEnd), con el número de cada jugador (así lleva
// su poncho):
//  · los muertos: el que mató el facón o el porrazo del Alcaide cae con el
//    clip 'collapse' del final del penal (cine-penal.json, animado en Blender),
//    desde la pose que tenía (sin saltos ni muñeco de trapo), y queda tirado en
//    el último cuadro hasta que termina el próximo encierro;
//  · los presos del encierro: cada vivo parado en su celda (ui: pzEncierro.js),
//    el mismo muñeco en todas las compus (no depende de lo que llega por la red).
// Y el facón del policía en el muñeco que ven los demás: aparece solo durante
// el tajo, con entrada y salida (Porteno: avatarLate).

const FALL = 'collapse';
// el facón en tercera persona: hoja, guarda y cabo (del tamaño del de primera persona)
const FACON_IN = 0.1;
const FACON_OUT = 0.14;

let CLIPS = null;
let loading = null;
export function prefetchClips() {
  loading ||= fetch(assetUrl('/assets/sotano/modelos/gaucho/cine-penal.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const c = J.clips?.[FALL];
      if (c) CLIPS = { [FALL]: cineClip(c) };
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

export default class PzCuerpos {
  constructor(game) {
    this.g = game;
    this.people = new Avatars(game, null);
    // id -> { r, kind: 'dead' | 'cell', t, snap }
    this.list = new Map();
    prefetchClips();
  }

  // Un preso parado en su celda (o donde se lo ponga), mirando a yaw.
  stand(id, name, pos, yaw) {
    this.remove(id);
    const r = { id, name, noTag: false, pos: pos.clone(), yaw, pitch: 0, speed: 0, clips: true };
    this.people.add(r);
    // (10-13: el poncho y el nombre en el color de su jugador, Porteno.paint)
    this.g.pz?.paint(this.people.list.get(id), id, name);
    this.list.set(id, { r, kind: 'cell', t: 0 });
    return r;
  }

  // Un muerto: cae desde `from` (cineSnap de un muñeco que se veía; null: desde parado).
  fall(id, pos, yaw, from = null) {
    const had = this.list.get(id);
    // (el preso de la celda que se cae: desde su propia pose)
    const snap = from || (had ? cineSnap(this.people.list.get(id)) : null);
    if (had) this.remove(id);
    const r = { id, name: '', noTag: true, pos: pos.clone(), yaw, pitch: 0, speed: 0, clips: true };
    this.people.add(r);
    this.g.pz?.paint(this.people.list.get(id), id, '');
    this.list.set(id, { r, kind: 'dead', t: 0, snap });
    return r;
  }

  has(id) {
    return this.list.has(id);
  }

  dead() {
    return [...this.list.entries()].filter(([, b]) => b.kind === 'dead').map(([id, b]) => ({ id, pos: b.r.pos, yaw: b.r.yaw }));
  }

  remove(id) {
    if (!this.list.has(id)) return;
    this.list.delete(id);
    this.people.remove(id);
  }

  clear(kind = null) {
    for (const [id, b] of [...this.list]) if (!kind || b.kind === kind) this.remove(id);
  }

  update(dt) {
    this.people.update(dt);
    for (const [id, b] of this.list) {
      const a = this.people.list.get(id);
      if (!a) continue;
      // sin nada en la mano (el mate de los muñecos de siempre, tampoco)
      a.hand.visible = false;
      if (a.gun) a.gun.visible = false;
      if (b.kind !== 'dead') continue;
      b.t += dt;
      const c = CLIPS?.[FALL];
      if (!c) continue;
      const o = {};
      if (b.snap && b.t < 0.22) {
        o.snap = b.snap;
        o.sw = smooth(clamp01(b.t / 0.22));
      }
      poseCineClip(a, c, Math.min(b.t, c.dur - 0.02), b.r.pos.x, b.r.pos.y, b.r.pos.z, b.r.yaw + Math.PI, o);
    }
  }

  dispose() {
    this.clear();
    this.people.dispose?.();
  }
}

// El facón del muñeco de un policía, en la mano derecha, mientras tajea
// (k: 0 guardado, 1 en la mano). Se arma la primera vez.
export function faconOn(a, k) {
  if (!a.facon) {
    if (k <= 0.001) return;
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.95, roughness: 0.22 });
    const horn = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.7 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 1, roughness: 0.3 });
    const f = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.28, 4), steel);
    blade.scale.set(1, 1, 0.25);
    blade.position.y = 0.17;
    f.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.016), silver);
    guard.position.y = 0.032;
    f.add(guard);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), horn);
    handle.position.y = -0.024;
    f.add(handle);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.add(f);
    a.group.add(holder);
    a.facon = holder;
    a.faconInner = f;
  }
  const on = k > 0.001;
  a.facon.visible = on;
  if (!on) return;
  // en el puño (la mano es la pieza 6, el puño a 0,19 del codo) con la hoja para adelante del puño
  a.facon.matrix.copy(a.mats[6]);
  a.faconInner.position.set(0, -0.2, 0.03);
  a.faconInner.rotation.set(Math.PI / 2, 0, 0);
  a.faconInner.scale.setScalar(Math.max(0.001, k));
  a.facon.matrixWorldNeedsUpdate = true;
}

// Cuánto se ve el facón a los `t` s de un tajo que dura `d` (entra y sale).
export function faconK(t, d) {
  if (t < 0 || t > d) return 0;
  return smooth(clamp01(t / FACON_IN)) * smooth(clamp01((d - t) / FACON_OUT));
}
