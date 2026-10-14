import * as THREE from 'three';
import { EE, ZONES } from '../../config/map';

// Porteño encubierto (entities/penal/Porteno.js): las tareas de cada uno. Los
// lugares son cosas que ya están en el penal (la olla del comedor, el fogón,
// el barbacuá, los yerbales, el muelle, el tablero de las duchas...; ver
// config/maps/penal.js porteno() EE.pz.tasks). Cada tarea: pararse ahí y
// mantener F unos segundos, con lo suyo mientras tanto (vapor, chispas,
// salpicones) y un estallido al terminar. Al acercarse (y desde lejos, con
// la marca), se ve dónde es: un aro en el piso y un rombo que flota, que
// entran y salen de a poco. El policía tiene las suyas de mentira: se ven y
// se hacen igual, pero no suman (lo decide el anfitrión).

const NEAR = 1.45;
const SEE = 22;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const UP = { x: 0, y: 1, z: 0 };
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

export default class PzTareas {
  constructor(pz) {
    this.pz = pz;
    const g = (this.g = pz.g);
    const W = g.world;
    this.st = EE.pz.tasks.map((t) => {
      const y = W.floorAt(t.at[0], t.at[1], (ZONES[t.zone]?.y || 0) + 1.5);
      return { ...t, where: ZONES[t.zone]?.name || '', pos: new THREE.Vector3(t.at[0], y, t.at[1]), lookAt: new THREE.Vector3(t.look[0], y + t.look[2], t.look[1]) };
    });
    // las mías: { i, done, prog, k (la marca, 0..1) }
    this.mine = [];
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.marks = new Map();
    this.fxT = 0;
    this.holding = -1;
  }

  // La lista que mandó el anfitrión (los números de las tareas y cuáles ya están).
  setList(list, done = []) {
    const was = new Map(this.mine.map((m) => [m.i, m]));
    this.mine = list.map((i) => was.get(i) || { i, done: false, prog: 0, k: 0 });
    for (const m of this.mine) if (done.includes(m.i)) m.done = true;
    for (const [i, mk] of this.marks) {
      if (this.mine.some((m) => m.i === i)) continue;
      mk.removeFromParent();
      this.marks.delete(i);
    }
  }

  reset() {
    this.setList([]);
    this.holding = -1;
  }

  pending() {
    return this.mine.filter((m) => !m.done).length;
  }

  // La marca de una tarea: un aro dorado en el piso y un rombo que flota arriba de lo que se toca.
  mark(i) {
    let mk = this.marks.get(i);
    if (mk) return mk;
    const g = this.g;
    const S = this.st[i];
    mk = new THREE.Group();
    const dot = g.textures.dot;
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dot, color: 0xffc95a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.copy(S.pos).setY(S.pos.y + 0.05);
    mk.add(ring);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0).scale(1, 1.5, 1), new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0, depthWrite: false }));
    gem.position.copy(S.lookAt).setY(Math.max(S.lookAt.y + 0.55, S.pos.y + 1.2));
    mk.add(gem);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffb440, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(gem.position);
    halo.scale.setScalar(0.7);
    mk.add(halo);
    mk.userData = { ring, gem, halo, y0: gem.position.y };
    mk.visible = false;
    this.root.add(mk);
    this.marks.set(i, mk);
    return mk;
  }

  // Cada cuadro. can: puede hacer tareas (vivo y jugando); input: null sin control.
  update(dt, input, can) {
    const g = this.g;
    const p = g.player.pos;
    const t = g.time;
    let best = null;
    let bestD = Infinity;
    for (const m of this.mine) {
      const S = this.st[m.i];
      const d = Math.hypot(p.x - S.pos.x, p.z - S.pos.z);
      const same = Math.abs(p.y - S.pos.y) < 1.6;
      // la marca: de lejos se ve; hecha, se apaga
      const want = can && !m.done && same && d < SEE ? 1 : 0;
      m.k += (want - m.k) * Math.min(1, dt * (want ? 2.2 : 4));
      if (m.k > 0.003 || this.marks.has(m.i)) {
        const mk = this.mark(m.i);
        mk.visible = m.k > 0.003;
        if (mk.visible) {
          const U = mk.userData;
          const e = smooth(clamp01(m.k));
          // (de cerca, el rombo se achica: no tapa lo que se toca)
          const near = clamp01((d - 1) / 4);
          U.ring.material.opacity = (0.32 + Math.sin(t * 3 + m.i) * 0.1) * e;
          U.ring.scale.setScalar(0.85 + Math.sin(t * 3 + m.i) * 0.08);
          U.gem.material.opacity = 0.9 * e;
          U.gem.position.y = U.y0 + Math.sin(t * 2.2 + m.i) * 0.07 - (1 - e) * 0.4;
          U.gem.rotation.y = t * 1.6;
          U.gem.scale.setScalar(0.55 + 0.45 * near);
          U.halo.position.y = U.gem.position.y;
          U.halo.material.opacity = 0.55 * e * (0.3 + 0.7 * near);
        }
      }
      if (can && !m.done && same && d < NEAR && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    if (!best || !input) {
      if (this.holding >= 0) g.hud.setHold(null);
      if (this.hinted) g.hud.setHint(null);
      this.hinted = false;
      this.holding = -1;
      return;
    }
    const S = this.st[best.i];
    g.hud.setHint(`Mantené [F] · ${S.name}`);
    this.hinted = true;
    if (!input.key('KeyF')) {
      if (this.holding >= 0) g.hud.setHold(null);
      this.holding = -1;
      return;
    }
    if (this.holding !== best.i) {
      this.holding = best.i;
      this.workSnd(S);
    }
    best.prog = Math.min(S.secs, best.prog + dt);
    g.hud.setHold(best.prog / S.secs);
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.16;
      this.workFx(S);
    }
    if (best.prog >= S.secs) {
      best.done = true;
      this.holding = -1;
      g.hud.setHold(null);
      g.hud.setHint(null);
      this.hinted = false;
      this.doneFx(S);
      this.pz.taskDone(best.i);
    }
  }

  // Lo que se ve mientras se hace (cada uno lo suyo).
  workFx(S) {
    const g = this.g;
    const L = S.lookAt;
    const r = () => (Math.random() - 0.5) * 0.4;
    switch (S.fx) {
      case 'steam':
        g.fx.steam?.(tmpV.set(L.x + r(), L.y + 0.15, L.z + r()), 2, 0.2);
        break;
      case 'fire':
        g.fx.fire?.(tmpV.set(L.x + r() * 0.5, L.y, L.z + r() * 0.5), 0.25, 2);
        break;
      case 'sparks':
        g.fx.sparks(tmpV.set(L.x + r() * 0.5, L.y, L.z + r() * 0.5), 3, UP, [1, 0.8, 0.4]);
        break;
      case 'splash':
        g.fx.dust(tmpV.set(L.x + r(), L.y, L.z + r()), UP, [0.55, 0.7, 0.85], 3);
        break;
      case 'leaves':
        g.fx.dust(tmpV.set(L.x + r(), L.y + 0.3, L.z + r()), UP, [0.3, 0.55, 0.22], 3);
        break;
      case 'glint':
        g.fx.sparkle(tmpV.set(L.x + r(), L.y + 0.1, L.z + r()), [1, 0.92, 0.6], 1, 0.3);
        break;
      default:
        g.fx.dust(tmpV.set(L.x + r(), L.y, L.z + r()), UP, [0.45, 0.4, 0.35], 3);
    }
  }

  workSnd(S) {
    const A = this.g.audio;
    if (!A?.out) return;
    const o = A.out({ pos: S.lookAt, reverb: 0.3, gain: 0.7 });
    A.noise(o, { dur: 0.35, freq: S.fx === 'splash' ? 1800 : S.fx === 'sparks' ? 3200 : 900, gain: 0.25, type: 'bandpass' });
  }

  // Terminada: un estallido dorado y la campanita.
  doneFx(S) {
    const g = this.g;
    const L = S.lookAt;
    g.fx.flash(tmpW.copy(L).setY(L.y + 0.4), 0xffc85a, 4, 0.45, 8);
    for (let k = 0; k < 3; k++) g.fx.sparkle(tmpV.copy(L).setY(L.y + 0.3), [1, 0.85, 0.45], 5, 0.6);
    if (S.fx === 'splash' && g.water?.splash) g.water.splash(L.x, L.z, 0.6, { sound: false });
    const A = g.audio;
    if (A?.out) {
      const o = A.out({ pos: L, reverb: 0.35, gain: 0.8 });
      A.bell(o, A.now, 84, { gain: 0.08, dur: 1.4 });
      A.bell(o, A.now + 0.1, 91, { gain: 0.07, dur: 1.4 });
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.g.hud.setHold(null);
  }
}
