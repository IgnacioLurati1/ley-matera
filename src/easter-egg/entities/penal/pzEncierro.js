import * as THREE from 'three';
import PenalMotin from '../penalMotin';
import { PONCHOS } from '../../net/Avatars';
import { ponchoCss } from '../../config/porteno';

// (10-13) El punto y el nombre de la votación, en el color del poncho de cada uno.
const voteCss = (pz, id) => {
  const hex = pz.ponchoOf?.(id) ?? PONCHOS[id % PONCHOS.length];
  return `--c:${ponchoCss(hex)};--cn:${ponchoCss(hex, 0.3)}`;
};

// Porteño encubierto (entities/penal/Porteno.js): el encierro. Lo decide el
// anfitrión (Porteno.startMeet, los pasos y sus tiempos); acá, lo que se ve en
// cada compu, igual en todas:
//  · 'gather': fundido a negro y cada vivo parado en una celda del pabellón
//    (las siete de verdad; si son más, de a dos), las rejas abiertas que se
//    cierran de a una. Los presos son muñecos propios (pzCuerpos), no los de
//    la red: no saltan ni se atrasan.
//  · 'vote': la cámara recorre la fila de celdas despacio y el cartel de la
//    votación (los vivos, Saltear, el reloj y quién ya votó, no a quién).
//  · 'result': cuántos votos tuvo cada uno y quién va.
//  · 'visit': el Alcaide (el jefe de siempre, entities/skins/alcaide.js: sus
//    clips 'caminar' y 'golpe') camina por el pabellón hasta la celda del
//    votado, abre la reja y le da un porrazo que lo mata de una. Lo mueve el
//    anfitrión (lugar del pool de jefes: los invitados lo ven por la foto de
//    siempre); la cámara y la reja, cada compu con el mismo reloj.
//  · 'back': fundido, se limpian los cuerpos y todos vuelven al pabellón.
// Las rejas son las del motín (entities/penalMotin.js buildCellDoors y
// poseDoors, usadas tal cual con un objeto propio: sin el motín entero).

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
// la reja abierta (rad) y cómo se cierran al entrar
const OPEN = 1.7;
// (la del votado se abre casi entera, contra los barrotes de al lado: si no,
// el cachiporrazo del Alcaide la atravesaba)
const VICTIM_OPEN = Math.PI - 0.12;
// la visita (s desde que arranca): fundido, la caminata (walk), la reja, el
// porrazo (el clip 'golpe' pega a los 0,75 s del estado 'slam') y la salida
export const VISIT = { in: 0.5, turn: 0.45, door: 0.9, pre: 0.75, hit: 0.75, hold: 1.6, leave: 1.9, fade: 0.6 };
export const WALK_V = 1.75;
// (2026-10-13, el usuario: "agrega los dos y revisa que quedan bien, si no saca
// el opening") La visita nueva: el Alcaide llega por un camino curvo (dobla
// caminando, no gira parado), con el paso al ritmo de lo que avanza; la reja se
// abre sola cuando llega y le da el porrazo de arriba para abajo ('porrazo':
// Standing Melee Attack Downward de Mixamo) desde el pasillo. Con la cachiporra
// de 1,1 m pega a 2,4 m: si entrara a la celda, la cachiporra atravesaba al
// preso y el techo de la celda. 'Opening' (abrir la reja con la mano) se probó
// en el juego y se sacó: es para una puerta chica (la mano gira a 0,4 m de la
// bisagra y la reja tiene 0,78), la mano se metía entre los barrotes, la
// cachiporra cruzaba la reja y la hoja le entraba en la panza.
// globalThis.__mduAlcaideViejo = true: la visita de antes (camina derecho, gira
// parado y da el cachiporrazo de costado). Lo decide el anfitrión (vis.av).
const viejo = () => !!globalThis.__mduAlcaideViejo;
// at: dónde pega (local de la celda: x a lo largo, z hacia afuera; mira para
// adentro): la punta baja por el ala del sombrero del votado y la cachiporra
// cruza la reja abierta 20 cm abajo del techo de la celda y a 10 cm de los
// postes de la puerta (más cerca, tocaba el techo; más lejos, no llegaba al
// sombrero; 6 cm a la izquierda, rozaba el poste de la bisagra); hit: cuándo la punta llega al
// sombrero (s del clip). Los pies, al pasar de caminar a la guardia del
// porrazo y de vuelta (la guardia es más abierta que el paso): step, el momento
// de 'caminar' en que llega y en que arranca (el izquierdo apoyado adelante y la
// punta del derecho ya en el aire); foot y guard, dónde está el pie izquierdo
// (m, a su derecha y adelante) en ese momento del paso y en la guardia. Mientras
// se mezclan, el cuerpo se corre para que el izquierdo quede quieto en el piso
// y el derecho se acomoda en el aire (el paso que se va queda quieto mientras
// se mezclan: want.hold, entities/bossSkin.js). (Medido en los clips, con el
// Alcaide del juego: x1,54.)
export const PORRAZO = { at: [0.24, 2.41], hit: 0.825, dur: 2.26, fade: 0.3, step: 57 / 30, foot: [-0.184, 0.332], guard: [-0.244, 0.604], open: 0.25, start: 0.05 };
// el andar: arranca en el 12 % del tramo y frena en el último 30 % (hasta 0,2)
const wv = (k) => Math.min(1, k / 0.12) * (k > 0.7 ? 0.2 + (0.8 * (1 - k)) / 0.3 : 1);
const PROF = (() => {
  const n = 64;
  const D = [0];
  for (let i = 1; i <= n; i++) D.push(D[i - 1] + wv((i - 0.5) / n) / n);
  return { n, D, mean: D[n] };
})();
const profD = (k) => {
  const f = clamp01(k) * PROF.n;
  const i = Math.min(PROF.n - 1, Math.floor(f));
  return (PROF.D[i] + (PROF.D[i + 1] - PROF.D[i]) * (f - i)) / PROF.mean;
};
// Un camino curvo (Bézier cúbica, en el piso) medido a lo largo, con el rumbo en cada punto.
function curve(p0, p1, p2, p3, n = 40) {
  const pts = [];
  const yaw = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) ** 3;
    const b = 3 * u * (1 - u) ** 2;
    const c = 3 * u * u * (1 - u);
    const d = u ** 3;
    pts.push(new THREE.Vector3(a * p0.x + b * p1.x + c * p2.x + d * p3.x, 0, a * p0.z + b * p1.z + c * p2.z + d * p3.z));
    const da = 3 * (1 - u) ** 2;
    const db = 6 * (1 - u) * u;
    const dc = 3 * u * u;
    yaw.push(Math.atan2(da * (p1.x - p0.x) + db * (p2.x - p1.x) + dc * (p3.x - p2.x), da * (p1.z - p0.z) + db * (p2.z - p1.z) + dc * (p3.z - p2.z)));
  }
  const acc = [0];
  for (let i = 1; i <= n; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, yaw, acc, len: acc[n] };
}
// El punto a d m del principio del camino (en out) y su rumbo.
function along(cv, d, out) {
  const { pts, acc, yaw } = cv;
  const n = pts.length - 1;
  d = Math.max(0, Math.min(cv.len, d));
  let i = 1;
  while (i < n && acc[i] < d) i++;
  const k = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
  out.lerpVectors(pts[i - 1], pts[i], k);
  let dy = yaw[i] - yaw[i - 1];
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  return yaw[i - 1] + dy * k;
}
// Los dos caminos de la visita nueva: de S al lugar del porrazo K (llega
// mirando a la celda) y de K de vuelta a S (sale para adelante y dobla).
// sd: para qué lado del pasillo se va (+1: C.side; -1: el otro).
function visitPaths(C, S, sd = 1) {
  const K = C.at(PORRAZO.at[0], PORRAZO.at[1], new THREE.Vector3());
  // (mirando a la celda: su derecha es C.side y adelante, -C.out)
  const off = ([r, f]) => K.clone().addScaledVector(C.side, r).addScaledVector(C.out, -f);
  const P = PORRAZO;
  const Kin = off([P.guard[0] - P.foot[0], P.guard[1] - P.foot[1]]);
  const Kout = Kin.clone();
  const back = Kin.clone().addScaledVector(C.out, 1.1);
  const inn = curve(S, S.clone().lerp(back, 0.45), back, Kin);
  // (se va: un paso para adelante y dobla, caminando, por el pasillo; volver a
  // donde arrancó hacía media vuelta en el lugar cuando venía de atrás)
  const front = Kout.clone().addScaledVector(C.out, -1.2);
  const out = curve(Kout, Kout.clone().addScaledVector(C.out, -0.85), front.clone().addScaledVector(C.side, sd * 1.0), front.clone().addScaledVector(C.side, sd * 5));
  return { K, Kin, Kout, inn, out };
}
// (lo que eligió el último pickStart del anfitrión: la visita de antes, por el
// interruptor o porque la celda no tiene lugar. Porteno pide visitTimes(walk)
// justo después, para saber cuánto dura)
let pickedOld = false;
export function visitTimes(walk, old = pickedOld) {
  const V = VISIT;
  if (!old) {
    const P = PORRAZO;
    const T0 = P.start;
    const TA = T0 + walk;
    const TS = TA;
    const TH = TS + P.hit;
    const TL = TS + P.dur;
    const TF = TL + V.leave;
    return { T0, TA, TO: TA - P.open, TS, TH, TL, TF, END: TF + V.fade };
  }
  const T0 = V.in;
  const TA = T0 + walk;
  const TO = TA + V.turn;
  const TS = TO + V.pre;
  const TH = TS + V.hit;
  const TL = TH + V.hold;
  const TF = TL + V.leave;
  return { T0, TA, TO, TS, TH, TL, TF, END: TF + V.fade };
}
// el Alcaide camina hasta acá (m, del lado del pasillo) y desde dónde (candidatos, en la celda: x a lo largo, z hacia afuera)
const STAND = [0.6, 1.0];
const STARTS = [
  [6.4, 1.0],
  [-5.6, 1.0],
  [5, 3.6],
  [-4.4, 3.6],
  [0.6, 5.6],
];

export default class PzEncierro {
  constructor(pz) {
    this.pz = pz;
    const g = (this.g = pz.g);
    // las rejas: un objeto con lo del motín (sin correr su constructor)
    const D = Object.create(PenalMotin.prototype);
    D.g = g;
    D.M = g.world.M;
    D.root = new THREE.Group();
    D.cells = [];
    g.scene.add(D.root);
    D.buildCellDoors();
    this.doors = D;
    this.cells = D.cells.map((c, i) => {
      const at = (lx, lz, out = new THREE.Vector3()) => out.set(lx, 0, lz).applyQuaternion(c.q).add(c.pos);
      const outDir = new THREE.Vector3(0, 0, 1).applyQuaternion(c.q).setY(0).normalize();
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(c.q).setY(0).normalize();
      return { i, c, at, out: outDir, side, y: c.pos.y };
    });
    // la fila (para la cámara de la votación)
    const xs = this.cells.map((C) => C.at(0.4, 0));
    this.row = {
      min: xs.reduce((m, v) => (m.x < v.x ? m : v), xs[0] || new THREE.Vector3()),
      max: xs.reduce((m, v) => (m.x > v.x ? m : v), xs[0] || new THREE.Vector3()),
    };
    this.st = null;
    this.t = 0;
    this.panel = null;
    this.shut = new Set();
  }

  get count() {
    return this.cells.length;
  }

  // Dónde se para cada uno en su celda (n: cuántos comparten; k: cuál).
  cellSpot(ci, k, n, out) {
    const C = this.cells[ci];
    // (de a dos: a 1,2 m, que los ponchos no se toquen)
    const lx = 0.4 + (n > 1 ? (k - (n - 1) / 2) * 1.2 : 0);
    C.at(lx, -1.05, out);
    out.y = C.y;
    return out;
  }

  // El yaw de un muñeco que mira para afuera de la celda (Avatars: adelante = -sin, -cos).
  yawOut(ci) {
    const o = this.cells[ci].out;
    return Math.atan2(-o.x, -o.z);
  }

  // ---------------- los pasos ----------------
  // Entra a un paso (en todas las compus; m: lo que manda el anfitrión).
  enter(st, m) {
    const g = this.g;
    const was = this.st;
    this.st = st;
    this.t = 0;
    this.m = m;
    if (st === 'gather') {
      this.setup = false;
      this.shut.clear();
      this.pz.setVeil('#000', 1, 0.45);
      g.audio?.hitThump?.(0.8);
    } else if (st === 'vote') {
      if (!this.setup) this.place(m);
      this.buildPanel(m);
    } else if (st === 'result') {
      if (!this.setup) this.place(m);
      if (!this.panel) this.buildPanel(m);
      this.showResult(m);
    } else if (st === 'visit') {
      if (!this.setup) this.place(m);
      this.visitIn(m);
    } else if (st === 'back') {
      this.closePanel();
      this.pz.setVeil('#000', 1, 0.45);
      this.backDone = false;
    }
    return was;
  }

  // Bajo el negro: los presos en sus celdas, las rejas abiertas (se cierran a la vista).
  place(m) {
    const pz = this.pz;
    this.setup = true;
    pz.cuerpos.clear('cell');
    const per = new Map();
    for (const [, ci] of m.cells) per.set(ci, (per.get(ci) || 0) + 1);
    const seen = new Map();
    for (const [id, ci] of m.cells) {
      const k = seen.get(ci) || 0;
      seen.set(ci, k + 1);
      if (!this.cells[ci]) continue;
      pz.cuerpos.stand(id, pz.nameOf(id), this.cellSpot(ci, k, per.get(ci), tmpV), this.yawOut(ci));
    }
    for (const C of this.cells) {
      C.c.a = OPEN;
      C.c.v = 0;
    }
    this.doors.poseDoors(true);
  }

  // Cada cuadro, mientras dura el encierro.
  update(dt) {
    const g = this.g;
    this.t += dt;
    const t = this.t;
    if (this.st === 'gather') {
      if (!this.setup && t >= 0.5) {
        this.place(this.m);
        this.pz.setVeil(null, 0, 0.6);
      }
      // las rejas se cierran de a una (con su golpe)
      if (this.setup) this.closeDoors(t - 1.05);
    } else if (this.st === 'visit') this.visitTick(dt);
    else if (this.st === 'back') {
      if (!this.backDone && t >= 0.5) {
        this.backDone = true;
        this.pz.cuerpos.clear();
        for (const C of this.cells) C.c.a = 0;
        this.doors.poseDoors(true);
        this.removeAlcaide();
      }
    }
    if (this.panel) this.updatePanel();
  }

  closeDoors(t) {
    const D = this.doors;
    let moved = false;
    this.cells.forEach((C, i) => {
      const k = clamp01((t - i * 0.12) / 0.45);
      const a = OPEN * (1 - k * k);
      if (Math.abs(C.c.a - a) > 1e-4) {
        C.c.a = a;
        moved = true;
      }
      if (k >= 1 && !this.shut.has(i)) {
        this.shut.add(i);
        D.sfx('shut', C.c.lock);
      }
    });
    if (moved) D.poseDoors();
  }

  // ---------------- la cámara ----------------
  sceneCam(dt) {
    const g = this.g;
    const cam = g.camera;
    if (this.st === 'gather' && !this.setup) return;
    if (this.st === 'visit' && this.vis) {
      this.visitCam(dt);
      return;
    }
    if (this.st === 'back' && this.backDone) {
      // (ya en el pabellón: la vista del jugador, que vuelve)
      return;
    }
    // la fila de celdas, de punta a punta, despacio
    const R = this.row;
    const C0 = this.cells[0];
    if (!C0) return;
    const out = C0.out;
    const mid = (R.min.x + R.max.x) / 2;
    const amp = Math.max(0, (R.max.x - R.min.x) / 2 - 3.2);
    const T = this.pz.meetT || 0;
    const x = mid + amp * Math.sin(T * ((Math.PI * 2) / 30) - Math.PI / 2);
    const z0 = (R.min.z + R.max.z) / 2;
    cam.position.set(x, C0.y + 2.45, z0).addScaledVector(out, 5.6);
    tmpV.set(x + Math.cos(T * 0.21) * 0.8, C0.y + 1.0, z0).addScaledVector(out, -0.8);
    cam.lookAt(tmpV);
  }

  // ---------------- la votación ----------------
  buildPanel(m) {
    const g = this.g;
    const pz = this.pz;
    this.closePanel(true);
    const el = document.createElement('div');
    el.className = 'mdu-pzvote';
    const why = m.kind === 'btn' ? `Botón · ${esc(pz.nameOf(m.by))}` : `Cuerpo de ${esc(pz.nameOf(m.body))} · ${esc(pz.nameOf(m.by))}`;
    const ids = [...pz.P.keys()].filter((id) => pz.P.get(id).inGame);
    el.innerHTML = `<div class="mdu-pzvote__card"><div class="mdu-pzvote__top"><p class="mdu-pzvote__k">Encierro</p><b class="mdu-pzvote__clock"></b></div><p class="mdu-pzvote__why">${why}</p><ul>${ids
      .map((id) => `<li data-v="${id}" style="${voteCss(pz, id)}"><i></i><span>${esc(pz.nameOf(id))}</span><em>Votó</em><s></s></li>`)
      .join('')}</ul><div class="mdu-pzvote__foot"><button class="mdu-pzvote__skip" data-v="-1">Saltear<s></s></button><button class="mdu-pzvote__go" data-go disabled>Votar</button></div><p class="mdu-pzvote__res"></p></div>`;
    g.hud.root.appendChild(el);
    this.panel = el;
    this.pick = null;
    el.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) {
        if (this.pick != null) pz.vote(this.pick);
        return;
      }
      const b = e.target.closest('[data-v]');
      if (!b || !pz.canVote()) return;
      const v = Number(b.dataset.v);
      if (v >= 0 && !pz.P.get(v)?.alive) return;
      this.pick = v;
      // (ya: el botón de votar se habilita en este clic, no en el cuadro que viene)
      this.pkey = '';
      this.updatePanel();
      g.audio?.click?.();
    });
    // el mouse suelto para votar (Esc no pausa: la escena tiene su "saltar" que no hace nada)
    g.input.unlock();
    g.menus.showClick?.(false);
  }

  updatePanel() {
    const pz = this.pz;
    const el = this.panel;
    const m = pz.meet;
    if (!m) return;
    const me = pz.myId();
    const left = Math.max(0, Math.ceil(pz.meetLeft));
    const key = `${this.st}|${left}|${m.voted.join(',')}|${this.pick}|${pz.myVote}|${pz.P.size}`;
    if (key === this.pkey) return;
    this.pkey = key;
    el.querySelector('.mdu-pzvote__clock').textContent = this.st === 'vote' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
    const can = pz.canVote();
    el.classList.toggle('is-ro', !can);
    for (const li of el.querySelectorAll('li[data-v]')) {
      const id = Number(li.dataset.v);
      const s = pz.P.get(id);
      li.classList.toggle('is-dead', !s?.alive);
      li.classList.toggle('is-me', id === me);
      li.classList.toggle('is-voted', m.voted.includes(id));
      li.classList.toggle('is-pick', this.pick === id && pz.myVote == null);
      li.classList.toggle('is-mine', pz.myVote === id);
      li.classList.toggle('is-cop', pz.isMate(id));
    }
    const skip = el.querySelector('.mdu-pzvote__skip');
    skip.classList.toggle('is-pick', this.pick === -1 && pz.myVote == null);
    skip.classList.toggle('is-mine', pz.myVote === -1);
    const go = el.querySelector('[data-go]');
    go.disabled = !can || this.pick == null || pz.myVote != null;
    go.textContent = pz.myVote != null ? 'Votaste' : this.pick === -1 ? 'Saltear' : this.pick != null ? `Votar a ${pz.nameOf(this.pick)}` : 'Votar';
  }

  showResult(m) {
    const el = this.panel;
    if (!el) return;
    el.classList.add('is-result');
    const counts = new Map(m.counts || []);
    for (const li of el.querySelectorAll('li[data-v]')) {
      const id = Number(li.dataset.v);
      const n = counts.get(id) || 0;
      li.querySelector('s').innerHTML = '<u></u>'.repeat(n);
      li.classList.toggle('is-out', m.out === id);
    }
    el.querySelector('.mdu-pzvote__skip s').innerHTML = '<u></u>'.repeat(m.skip || 0);
    el.querySelector('.mdu-pzvote__res').textContent = m.out >= 0 ? `Va ${this.pz.nameOf(m.out)}` : 'No va nadie';
    this.g.audio?.sting?.();
  }

  closePanel(now = false) {
    const el = this.panel;
    if (!el) return;
    this.panel = null;
    if (now) {
      el.remove();
      return;
    }
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 500);
  }

  // ---------------- la visita del Alcaide ----------------
  // (anfitrión) Desde dónde viene: el primero de los candidatos con el paso libre.
  pickStart(ci) {
    const g = this.g;
    const W = g.world;
    const C = this.cells[ci];
    if (!viejo()) {
      // (la visita nueva: los dos caminos curvos, libres a tres alturas, y piso donde arranca)
      const free = (cv) => {
        for (let i = 4; i < cv.pts.length; i += 4) {
          const a = cv.pts[i - 4];
          const d = tmpW.subVectors(cv.pts[i], a);
          const len = d.length();
          d.divideScalar(len || 1);
          for (const h of [0.35, 1.1, 1.9]) if (W.raycast(tmpV.set(a.x, C.y + h, a.z), d, len) < len - 0.05) return false;
        }
        return true;
      };
      // (y lugar para la guardia y el porrazo: nada bajo a medio metro de donde pega)
      const K = C.at(PORRAZO.at[0], PORRAZO.at[1], new THREE.Vector3());
      const room = [C.out, C.side, tmpU.copy(C.side).negate()].every((d) => W.raycast(tmpV.set(K.x, C.y + 0.35, K.z), d, 0.75) >= 0.7);
      for (const [lx, lz] of [...STARTS, [0.6, 4]]) {
        if (!room) break;
        const s = C.at(lx, lz, new THREE.Vector3());
        if (Math.abs(W.floorAt(s.x, s.z, C.y + 1) - C.y) >= 0.3) continue;
        const pref = Math.sign(tmpV.subVectors(s, K).dot(C.side)) || 1;
        for (const sd of [pref, -pref]) {
          const P = visitPaths(C, s, sd);
          if (free(P.inn) && free(P.out)) {
            pickedOld = false;
            return { sx: +s.x.toFixed(2), sz: +s.z.toFixed(2), walk: +(P.inn.len / (WALK_V * PROF.mean)).toFixed(2), sd };
          }
        }
      }
      // (si en esta celda no hay lugar ni camino libre, la visita de antes)
    }
    pickedOld = true;
    const stand = C.at(STAND[0], STAND[1], new THREE.Vector3());
    for (const [lx, lz] of STARTS) {
      const s = C.at(lx, lz, new THREE.Vector3());
      let clear = true;
      for (const h of [0.35, 1.1, 1.9]) {
        const o = tmpV.set(s.x, C.y + h, s.z);
        const d = tmpW.set(stand.x - s.x, 0, stand.z - s.z);
        const len = d.length();
        if (W.raycast(o, d.divideScalar(len), len) < len - 0.1) clear = false;
      }
      // (y que donde arranca haya piso del pabellón)
      if (clear && Math.abs(W.floorAt(s.x, s.z, C.y + 1) - C.y) < 0.3) return { sx: +s.x.toFixed(2), sz: +s.z.toFixed(2), walk: +(Math.hypot(stand.x - s.x, stand.z - s.z) / WALK_V).toFixed(2), av: 1 };
    }
    const s = C.at(0.6, 4, new THREE.Vector3());
    return { sx: +s.x.toFixed(2), sz: +s.z.toFixed(2), walk: +(Math.hypot(stand.x - s.x, stand.z - s.z) / WALK_V).toFixed(2), av: 1 };
  }

  visitIn(m) {
    const pz = this.pz;
    this.closePanel();
    const V = m.vis;
    if (!V) return;
    const C = this.cells[V.ci];
    // (la visita nueva, salvo que el anfitrión haya mandado la de antes: vis.av)
    const nv = !V.av;
    const start = new THREE.Vector3(V.sx, C.y, V.sz);
    const paths = nv ? visitPaths(C, start.clone().setY(0), V.sd || 1) : null;
    this.vis = {
      ...V,
      C,
      nv,
      paths,
      T: visitTimes(V.walk, !nv),
      start,
      stand: nv ? paths.K.clone().setY(C.y) : C.at(STAND[0], STAND[1], new THREE.Vector3()).setY(C.y),
      hitDone: false,
      revealDone: false,
      opened: false,
    };
    // el votado, adelante, contra la reja; el que comparte la celda, al costado
    const mates = m.cells.filter(([id, ci]) => ci === V.ci && id !== V.v).map(([id]) => id);
    const vb = pz.cuerpos.list.get(V.v);
    if (vb) {
      C.at(0.4, -0.3, vb.r.pos).setY(C.y);
      vb.r.yaw = this.yawOut(V.ci);
    }
    mates.forEach((id) => {
      const b = pz.cuerpos.list.get(id);
      if (b) C.at(1.25, -1.35, b.r.pos).setY(C.y);
    });
    // el fundido: del negro del resultado a la escena
    pz.setVeil('#000', 1, 0.05);
    setTimeout(() => pz.setVeil(null, 0, VISIT.in), 60);
  }

  // Dónde está el Alcaide a los vt s (lo mismo en todas las compus: la cámara lo sigue).
  alcaideAt(vt, out) {
    const S = this.vis;
    const T = S.T;
    if (S.nv) return out.copy(this.pathAt(vt).p).setY(S.C.y);
    if (vt < T.T0) return out.copy(S.start);
    if (vt < T.TA) return out.lerpVectors(S.start, S.stand, smooth(clamp01((vt - T.T0) / (T.TA - T.T0))) * 0.15 + clamp01((vt - T.T0) / (T.TA - T.T0)) * 0.85);
    const back = vt - (T.TL + 0.45);
    if (back <= 0) return out.copy(S.stand);
    const len = S.start.distanceTo(S.stand) || 1;
    return out.lerpVectors(S.stand, S.start, clamp01((back * WALK_V) / len));
  }

  // (la visita nueva) Dónde va el Alcaide a los vt s, para dónde mira y cuánto
  // anduvo en el tramo (d): llegando (in), pegando (hit) o yéndose (out).
  pathAt(vt) {
    const S = this.vis;
    const T = S.T;
    const R = (this._pa ||= { p: new THREE.Vector3(), yaw: 0, d: 0, leg: 'in', v: 0 });
    const P = S.paths;
    if (vt < T.TA) {
      const k = (vt - T.T0) / Math.max(0.01, T.TA - T.T0);
      R.leg = 'in';
      R.d = P.inn.len * profD(k);
      R.v = k > 0 && k < 1 ? (WALK_V * wv(k)) : 0;
      R.yaw = along(P.inn, R.d, R.p);
    } else if (vt < T.TL) {
      // (se planta: de donde terminó el paso a la guardia, con el pie izquierdo quieto)
      R.leg = 'hit';
      R.d = 0;
      R.v = 0;
      R.yaw = along(P.out, 0, R.p);
      R.p.lerpVectors(P.Kin, P.K, clamp01((vt - T.TA) / PORRAZO.fade));
    } else if (vt < T.TL + PORRAZO.fade) {
      // (de la guardia al paso, quieto: el cuerpo va sobre el pie izquierdo)
      R.leg = 'go';
      R.d = 0;
      R.v = 0;
      R.yaw = along(P.out, 0, R.p);
      R.p.lerpVectors(P.K, P.Kout, clamp01((vt - T.TL) / PORRAZO.fade));
    } else {
      // (arranca, en 0,4 s)
      const tt = vt - T.TL - PORRAZO.fade;
      const ramp = 0.4;
      R.leg = 'out';
      R.d = Math.min(P.out.len, WALK_V * (tt < ramp ? (tt * tt) / (2 * ramp) : tt - ramp / 2));
      R.v = R.d < P.out.len ? WALK_V * Math.min(1, tt / ramp) : 0;
      R.yaw = along(P.out, R.d, R.p);
    }
    R.y = this.g.world.floorAt(R.p.x, R.p.z, S.C.y + 1);
    return R;
  }

  // (todas las compus, la visita nueva) La pose del Alcaide: la pide su
  // archivo (entities/skins/alcaide.js, z.script) cada cuadro. Sale del reloj de
  // la visita, igual en todas las compus: también dónde está y para dónde mira
  // (en los invitados, en vez de la foto del anfitrión, que llega atrasada).
  alcaideScript(z, S, ctx) {
    const V = this.vis;
    if (!V || !V.nv || this.st !== 'visit') return null;
    const vt = this.t;
    const T = V.T;
    const st = this.pathAt(vt);
    z.pos.set(st.p.x, st.y, st.p.z);
    z.baseY = st.y;
    z.yaw = st.yaw;
    S.chain.want = 0;
    // (la piel mezcla con su propio dt, que en las escenas del anfitrión es 1/60
    // por cuadro aunque el juego ande a 30 o a 144 (Game: zombies.render()): la
    // mezcla se pide en tiempo de verdad, para que dure PORRAZO.fade y el cuerpo
    // se corra a la par)
    const rdt = vt - (this._svt ?? vt);
    this._svt = vt;
    if (rdt > 0 && ctx.dt > 0) this._fk = ctx.dt / rdt;
    const fade = PORRAZO.fade * (this._fk || 1);
    if (st.leg === 'hit') return { key: 'porrazo', t: Math.max(0, Math.min(S.clips.porrazo.dur - 1e-3, vt - T.TS)), fade, hold: true };
    // caminando: el paso al ritmo de lo que avanza; llega con el izquierdo adelante
    const W = S.clips.caminar;
    const mps = W.speed * ctx.s;
    const ph = PORRAZO.step + (st.leg === 'in' ? st.d - V.paths.inn.len : st.d) / mps;
    if (st.leg === 'in' && vt < T.T0) return { key: 'quieto', t: vt };
    return { key: 'caminar', t: ((ph % W.dur) + W.dur) % W.dur, fade: st.leg === 'in' ? undefined : fade, hold: st.leg === 'go' };
  }

  visitTick(dt) {
    const g = this.g;
    const S = this.vis;
    if (!S) return;
    const vt = this.t;
    const T = S.T;
    const C = S.C;
    // (la visita nueva: el Alcaide de cada compu sigue el guion)
    const bz = g.zombies.boss;
    this.scriptFn ||= (z, sk, ctx) => this.alcaideScript(z, sk, ctx);
    if (S.nv && bz && bz.kind === 'alcaide') bz.script = this.scriptFn;
    // la reja del votado: se abre para afuera (con su golpe)
    if (vt >= T.TO) {
      const k = clamp01((vt - T.TO) / VISIT.door);
      C.c.a = VICTIM_OPEN * (1 - (1 - k) ** 3);
      this.doors.poseDoors();
      if (!S.opened) {
        S.opened = true;
        this.doors.sfx('clang', C.c.lock);
      }
    }
    // el porrazo: lo decide el anfitrión (Porteno.hostVisit); acá, si no llegó, a su hora
    if (this.pz.isHost()) this.hostAlcaide(dt, vt);
    if (vt >= T.TH + 1.4 && !S.revealDone) {
      S.revealDone = true;
      this.pz.reveal();
    }
    if (vt >= T.TF && !S.fading) {
      S.fading = true;
      this.pz.setVeil('#000', 1, VISIT.fade);
    }
  }

  // (anfitrión) El Alcaide: el jefe del pool, quieto de pensamiento (en la
  // escena Zombies no piensa en el anfitrión), lo mueve el guion.
  hostAlcaide(dt, vt) {
    const g = this.g;
    const zs = g.zombies;
    const S = this.vis;
    const T = S.T;
    let b = zs.boss;
    if (!b && vt >= 0.02 && vt < T.TF) {
      b = zs.spawnBoss(1, { kind: 'alcaide', at: S.start.clone(), quiet: true });
      b.state = 'chase';
      b.stateT = 0;
      b.speed = WALK_V;
      b.lockT = Infinity;
      S.boss = b;
      S.prev = S.start.clone();
    }
    if (!b || b !== S.boss) return;
    if (S.nv) {
      // (la visita nueva: lo mismo que ve cada compu, alcaideScript; la pose la pone su archivo)
      const st = this.pathAt(vt);
      b.pos.set(st.p.x, st.y, st.p.z);
      b.baseY = st.y;
      b.yaw = st.yaw;
      b.stateT += dt;
      if (st.v > 0.2) zs.poseGait(b, dt, st.v, g.time);
      else zs.poseIdle(b, g.time);
      if (vt >= T.TH && !S.hitDone) {
        S.hitDone = true;
        this.pz.hostHit(S.v);
      }
      if (vt >= T.TF + VISIT.fade - 0.05) this.removeAlcaide();
      return;
    }
    const p = this.alcaideAt(vt, tmpV);
    const moved = tmpW.subVectors(p, S.prev);
    const sp = dt > 0 ? Math.hypot(moved.x, moved.z) / dt : 0;
    S.prev.copy(p);
    b.pos.set(p.x, g.world.floorAt(p.x, p.z, S.C.y + 1), p.z);
    b.baseY = b.pos.y;
    // para dónde mira: adonde camina; en la reja, a la celda
    let want = b.yaw;
    if (sp > 0.2) want = Math.atan2(moved.x, moved.z);
    else if (vt >= T.TA && vt < T.TL + 0.45) want = Math.atan2(-S.C.out.x, -S.C.out.z);
    else if (vt >= T.TL) want = Math.atan2(S.start.x - S.stand.x, S.start.z - S.stand.z);
    let d = want - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * 7);
    // el porrazo
    const slam = vt >= T.TS && vt < T.TS + 1.5;
    if (slam && b.state !== 'slam') {
      b.state = 'slam';
      b.stateT = 0;
    } else if (!slam && b.state === 'slam') {
      b.state = 'chase';
      b.stateT = 0;
    }
    b.stateT += dt;
    if (sp > 0.2) zs.poseGait(b, dt, sp, g.time);
    else zs.poseIdle(b, g.time);
    if (vt >= T.TH && !S.hitDone) {
      S.hitDone = true;
      this.pz.hostHit(S.v);
    }
    if (vt >= T.TF + VISIT.fade - 0.05) this.removeAlcaide();
  }

  // El golpe llegó (en todas las compus): el votado cae.
  hit(v) {
    const g = this.g;
    const S = this.vis;
    if (S) S.hitDone = true;
    const b = this.pz.cuerpos.list.get(v);
    const at = b ? b.r.pos : S?.stand;
    if (!at) return;
    this.pz.cuerpos.fall(v, at, b ? b.r.yaw : 0);
    g.fx.blood(tmpV.set(at.x, at.y + 1.55, at.z), { x: 0, y: 0.6, z: 0 }, 14);
    g.fx.addShake?.(0.35);
    g.audio?.hitThump?.(1.6);
    g.audio?.squish?.(tmpV.clone());
  }

  removeAlcaide() {
    const zs = this.g.zombies;
    // (el guion de la visita no le queda pegado al jefe, en ninguna compu)
    if (zs.boss?.script) zs.boss.script = null;
    if (this.pz.isHost() && zs.boss && zs.boss.kind === 'alcaide') zs.removeBoss();
  }

  visitCam(dt) {
    const g = this.g;
    const cam = g.camera;
    const S = this.vis;
    const T = S.T;
    const vt = this.t;
    const C = S.C;
    // de qué lado viene (a lo largo de la fila)
    const sgn = Math.sign(tmpV.subVectors(S.start, S.stand).dot(C.side)) || 1;
    const ap = this.alcaideAt(vt, tmpW);
    if (vt < T.TO - 0.15) {
      // A: desde el pasillo, del otro lado de la reja, mirándolo venir
      C.at(0.4 - 2.5 * sgn, 1.7, cam.position).setY(C.y + 1.75);
      tmpV.set(ap.x, C.y + 1.85, ap.z).lerp(C.at(0.4, 0, tmpU).setY(C.y + 1.4), 0.25);
      this.safeCam(cam.position, C);
      cam.lookAt(tmpV);
    } else if (S.nv) {
      // B de la visita nueva, hasta el final: desde el pasillo, atrás y a la
      // izquierda del Alcaide. Al pegar se da vuelta para ese lado: se le ve la
      // cara, la cachiporra que baja al sombrero por la reja abierta y el votado
      // que cae; después, la revelación y él que se va. (Del otro lado tapaba el
      // golpe con la espalda; desde adentro de la celda, la cabeza del votado
      // tapaba la cachiporra.)
      C.at(-2.6, 4.0, cam.position).setY(C.y + 2.3);
      C.at(0.25, 0.9, tmpV).setY(C.y + 1.6);
      this.safeCam(cam.position, C);
      cam.lookAt(tmpV);
    } else if (!S.nv && vt < T.TH - 0.15) {
      // B: por arriba del hombro del Alcaide (es alto), la reja que se abre y el votado adentro
      C.at(1.5, 2.6, cam.position).setY(C.y + 2.9);
      C.at(0.4, -0.3, tmpV).setY(C.y + 1.1);
      this.safeCam(cam.position, C);
      cam.lookAt(tmpV);
    } else {
      // C (corte en el golpe): desde el pasillo, del lado contrario a donde se va
      // (cae el votado, la revelación y el Alcaide que se aleja)
      // (de lejos y de costado: se ve por la reja abierta, no a través de la de al lado)
      C.at(0.4 - 2.6 * sgn, 3.2, cam.position).setY(C.y + 2.1);
      C.at(0.35, 0, tmpV).setY(C.y + 0.9);
      this.safeCam(cam.position, C);
      cam.lookAt(tmpV);
    }
  }

  // La cámara no queda adentro de una pared: si hay algo entre el pasillo y
  // ella, se acerca (en la celda de la punta, el lado de afuera es el paredón).
  // (se mide desde el pasillo, frente a la reja: la celda es un bloque sólido)
  safeCam(pos, C) {
    const o = C.at(0.4, 1.1, tmpU).setY(pos.y);
    const d = tmpD.subVectors(pos, o);
    const len = d.length();
    if (len < 0.3) return;
    d.divideScalar(len);
    const hit = this.g.world.raycast(o, d, len);
    if (hit < len) pos.copy(o).addScaledVector(d, Math.max(0.3, hit - 0.35));
  }

  // Se terminó el encierro (o la partida): todo a cero.
  end() {
    this.closePanel(true);
    this.st = null;
    this.vis = null;
    this.removeAlcaide();
    for (const C of this.cells) C.c.a = 0;
    this.doors.poseDoors(true);
  }

  dispose() {
    this.end();
    this.doors.root.removeFromParent();
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
