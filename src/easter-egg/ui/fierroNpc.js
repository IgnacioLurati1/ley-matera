import * as THREE from 'three';
import { cineClip, poseCineClip, gauchoClip, cineSnap, cineBlendFrom } from '../net/gauchoSkin';
import { placeAvatar } from './castleClips';
import { assetUrl } from '../../lib/assets';

// Martín Fierro actuando con los clips hechos a mano en Blender
// (C:/Users/ignac/Tools/mdu-blender torre2_clips.py → modelos/gaucho/cine-torre2.json):
// el ánima del fogón de la torre y del castillo (entities/TowerEgg.js,
// CastleEgg.js: FierroNpc) y el del final de la torre (ui/TowerCinematic.js:
// ClipBody). En cuclillas junto al fuego o parado; cuando habla, la izquierda
// acompaña lo que cuenta y el mate queda en la palma derecha.
// - ClipBody(r, a): act(nombre, o) pasa a un clip mezclando desde la pose que
//   tiene (cineSnap: sin saltos); walk(v) camina (el clip de siempre, al paso);
//   release() vuelve a la pose de piezas, también mezclando. pose(dt) va
//   después de people.update (que pone la de piezas).
// - FierroNpc(g, npc, r): el del fogón. update(dt) en lugar de npc.update(dt).
// globalThis.__mduBlend = false: no carga los clips (queda la pose de piezas de antes).

const URL = '/assets/sotano/modelos/gaucho/cine-torre2.json';
let CLIPS = null;
let LOAD = null;
export function loadFierroClips() {
  if (globalThis.__mduBlend === false) return Promise.resolve(null);
  LOAD ||= fetch(assetUrl(URL))
    .then((r) => (r.ok ? r.json() : null))
    .then((J) => {
      if (!J) return null;
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
      return C;
    })
    .catch(() => null);
  return LOAD;
}
export const fierroClipsReady = () => !!CLIPS && globalThis.__mduBlend !== false;

const smooth = (u) => u * u * (3 - 2 * u);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpI = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
// el mate parado en la palma: de la muñeca, a lo largo de los dedos (el +y del
// hueso de la mano, como net/gauchoSkin palmMate: PALM_AT) y arriba (la piel de
// la palma y medio mate: mide 12,6 cm de alto)
const PALM_AT = 0.095;
const PALM_UP = 0.017 + 0.063;
const tmpH = new THREE.Quaternion();

export class ClipBody {
  constructor(r, a) {
    this.r = r;
    this.a = a;
    this.t = 0;
    this.S = null;
    this.rel = null;
    // el mate: 'palm' (parado en la palma derecha) o 'hide'
    this.mate = 'palm';
    // (opcional) hacia dónde mira el cuerpo (si no, r.yaw) y la cabeza girada sobre el clip
    this.yaw = null;
    this.turn = 0;
    loadFierroClips();
  }

  clip(name) {
    return CLIPS?.[name] || gauchoClip(name);
  }

  get name() {
    return this.S?.name || null;
  }

  // Pasa a un clip desde la pose que tiene ahora (llamar ANTES de people.update:
  // después ya está la de piezas). o: loop, rate, t, fade, restart.
  act(name, o = {}) {
    if (this.S?.name === name && !o.restart) return true;
    const c = this.clip(name);
    if (!c || !this.a?.gs?.on) return false;
    // (el primero arranca derecho: antes de la primera pose los huesos están en
    // el origen del mundo y la mezcla traía la cadera desde 30 m bajo el piso)
    this.S = { name, c, lt: o.t || 0, rate: o.rate ?? 1, loop: o.loop ?? c.loop !== false, fade: o.fade ?? 0.45, at: this.t, snap: o.fade === 0 || !this.posed ? null : cineSnap(this.a) };
    this.rel = null;
    return true;
  }

  // Camina con el clip de siempre (clips.json 'walk'), al paso de lo que avanza.
  walk(v) {
    if (this.S?.name !== 'walk') this.act('walk', { loop: true, fade: 0.3, rate: 0 });
    const c = this.S?.name === 'walk' ? this.S.c : null;
    if (c?.speed) this.S.rate = Math.min(2.2, Math.max(0, v / c.speed));
  }

  // Vuelve a la pose de piezas, mezclando desde la del clip.
  release(fade = 0.45) {
    if (!this.S) return;
    this.S = null;
    this.rel = { snap: cineSnap(this.a), at: this.t, fade };
  }

  // Después de people.update. yaw: el del muñeco (Avatars: r.yaw).
  pose(dt) {
    this.t += dt;
    const a = this.a;
    const r = this.r;
    const S = this.S;
    if (!a?.gs?.on) return false;
    if (S) {
      S.lt += dt * S.rate;
      const o = { loop: S.loop, turn: this.turn };
      if (S.snap && this.t - S.at < S.fade) {
        o.snap = S.snap;
        o.sw = smooth(Math.min(1, (this.t - S.at) / S.fade));
      }
      const lt = S.loop ? S.lt : Math.min(S.lt, S.c.dur);
      const yaw = this.yaw ?? (r.yaw || 0);
      if (!poseCineClip(a, S.c, lt, r.pos.x, r.pos.y, r.pos.z, yaw + Math.PI, o)) return false;
      this.posed = true;
      placeAvatar(a, yaw);
      this.seat();
      return true;
    }
    if (this.rel) {
      const k = (this.t - this.rel.at) / this.rel.fade;
      if (k >= 1) this.rel = null;
      else if (cineBlendFrom(a, this.rel.snap, smooth(Math.max(0, k)))) placeAvatar(a, r.yaw || 0);
    }
    return false;
  }

  // El mate de la mano (Avatars: a.hand.children[0]): parado en la palma
  // derecha (los clips la tienen arriba, la mano horizontal) o escondido.
  seat() {
    const a = this.a;
    const mate = a.hand?.children[0];
    if (!mate) return;
    if (this.mate !== 'palm') {
      a.hand.visible = false;
      return;
    }
    const B = a.gs.bones;
    B.RightHand.getWorldPosition(tmpV);
    B.RightHand.getWorldQuaternion(tmpH);
    tmpV.addScaledVector(tmpW.set(0, 1, 0).applyQuaternion(tmpH), PALM_AT);
    tmpV.y += PALM_UP;
    // (la bombilla para el lado del cuerpo, como gauchoSkin seatMate)
    tmpQ.setFromAxisAngle(UP, (this.yaw ?? (this.r.yaw || 0)) + Math.PI * 1.5);
    tmpM.compose(tmpV, tmpQ, ONE).premultiply(tmpI.multiplyMatrices(a.group.matrixWorld, a.hand.matrix).invert());
    tmpM.decompose(mate.position, mate.quaternion, tmpW);
    mate.scale.set(1, 1, 1);
    // (en las escenas gauchoSkin lo vuelve a apoyar con su palmMate: que no lo
    // tome por "de antes")
    if (mate.userData.palm) mate.userData.palm = null;
    a.hand.visible = true;
  }
}

// Habla ahora. Game.say (y ui/castleCine say) anotan en g.talkT[quién] cada
// frase como [desde, hasta] en el reloj del juego (g.time); las que esperan su
// turno quedan después de la que está diciendo.
export function talkingNow(g, who, pad = 0.25) {
  for (const T of g.talkT?.[who] || []) if (g.time >= T[0] - 0.1 && g.time <= T[1] + pad) return true;
  return false;
}

// El ánima del fogón (TowerEgg, CastleEgg): en cuclillas junto al fuego (r.crouch)
// o parado; cuando habla, cuenta con la izquierda. Al que se acerca lo mira
// con la cabeza; el cuerpo recién gira (despacio) si queda muy de costado: en
// cuclillas, girar entero lo hacía patinar sobre los pies.
const HEAD_MAX = 0.8;
const wrap = (d) => d - Math.round(d / (Math.PI * 2)) * Math.PI * 2;
export class FierroNpc {
  // anima (opcional): { color, intensity } el cuerpo de verdad como alma,
  // transparente y con el tinte (la opacidad la late cada mapa sobre a.M)
  constructor(g, npc, r, anima = null) {
    this.anima = anima;
    this.g = g;
    this.npc = npc;
    this.r = r;
    this.body = new ClipBody(r, npc.list.get(r.id));
    this.by = r.yaw || 0;
    this.at = r.pos.clone();
  }

  // El giro del cuerpo y el de la cabeza (r.yaw es adonde quiere mirar).
  look(dt) {
    const r = this.r;
    // (se mudó de lugar: el cuerpo ya mirando como corresponde)
    if (r.pos.distanceToSquared(this.at) > 0.01) this.by = r.yaw || 0;
    this.at.copy(r.pos);
    const d = wrap((r.yaw || 0) - this.by);
    const over = Math.abs(d) - HEAD_MAX * 0.85;
    if (over > 0) this.by += Math.sign(d) * Math.min(over, dt * 0.9);
    this.body.yaw = this.by;
    this.body.turn = Math.max(-HEAD_MAX, Math.min(HEAD_MAX, wrap((r.yaw || 0) - this.by)));
  }

  update(dt) {
    const B = this.body;
    // (el ánima: el modelo nuevo salía opaco; las piezas de antes eran transparentes)
    const M = this.anima && B.a?.gs?.on ? B.a.M.gaucho : null;
    if (M && !this.animaOn) {
      this.animaOn = true;
      M.transparent = true;
      // (escribe profundidad: sin eso las capas de adentro, brazos y poncho, se
      // sumaban y quedaba un fantasma naranja parejo, sin el poncho colorado)
      M.depthWrite = this.anima.depthWrite ?? true;
      if (M.emissive) {
        M.emissive.set(this.anima.color);
        M.emissiveIntensity = this.anima.intensity;
      }
      M.needsUpdate = true;
    }
    if (!fierroClipsReady()) {
      this.npc.update(dt);
      return;
    }
    const talk = talkingNow(this.g, 'fierro');
    const want = this.r.crouch ? (talk ? 'fSitTalk' : 'fSit') : talk ? 'fTalk' : 'fStand';
    // (de cuclillas a parado, más despacio: si no, se paraba de un salto)
    const crouchChange = !!B.name && B.name.startsWith('fSit') !== want.startsWith('fSit');
    // (se mudó de lugar, del fogón a la cima: aparece ya en su pose, sin mezclar
    // desde la de allá abajo; si no, la cadera pasaba por debajo del piso)
    const moved = this.r.pos.distanceToSquared(this.at) > 0.01;
    B.act(want, { loop: true, fade: moved ? 0 : crouchChange ? 0.9 : 0.55, t: want === 'fSit' ? 0.4 : 0, restart: moved });
    this.npc.update(dt);
    this.look(dt);
    B.pose(dt);
  }
}
