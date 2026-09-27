import * as THREE from 'three';
import { PROPS } from '../config/map';
import { mesh, boxGeo, mergeByMaterial } from './props';
import { fireflies } from '../fx/Fireflies';

// El paso previo del Pack-a-Pava en Mate no Numa: un yacaré viejo y enorme
// duerme enroscado en la máquina y no deja usarla. Tiene hambre: hay que
// buscarle tres pescados en las redes de la Pesquería (los pescados son del
// equipo) y tirárselos de a uno (mantener F). Con el tercero bosteza, se
// desenrosca y se va al agua.
//
// Lo arma world/PapQuest.js (kind 'yacare') en el lugar de las termas del
// castillo: prompt, use, update, state/apply, onGuest y complete.

const FISH = 3;
const tmpV = new THREE.Vector3();

// El yacaré: cuerpo de placas sobre una curva (enroscado alrededor de la
// máquina), cabeza chata de hocico ancho, patas cortas y la cola que se afina.
function caimanModel(M, path) {
  const g = new THREE.Group();
  const skin = keepMat('yacSkin', () => new THREE.MeshStandardMaterial({ color: 0x3a3a26, roughness: 0.75, flatShading: true }));
  const belly = keepMat('yacBelly', () => new THREE.MeshStandardMaterial({ color: 0xb8a878, roughness: 0.8 }));
  const eye = keepMat('yacEye', () => new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.6 }));
  const n = 22;
  // (el cuerpo, las patas y la cabeza van unidos por material: pocas llamadas
  // de dibujo; solo la mandíbula queda suelta, para comer)
  const hull = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const p = path.getPointAt(t);
    const tan = path.getTangentAt(t);
    // ancho: la cabeza angosta, el lomo gordo y la cola que se afina
    const w = t < 0.12 ? 0.25 + t * 2.6 : t < 0.5 ? 0.56 : 0.56 * (1 - (t - 0.5) / 0.55);
    const seg = new THREE.Group();
    seg.position.copy(p);
    seg.rotation.y = Math.atan2(tan.x, tan.z);
    const body = mesh(boxGeo(Math.max(0.08, w), Math.max(0.06, w * 0.55), 0.34), skin, 0, w * 0.28, 0);
    seg.add(body);
    seg.add(mesh(boxGeo(Math.max(0.06, w * 0.8), 0.04, 0.3), belly, 0, 0.02, 0));
    // las placas del lomo (dos filas de crestas)
    if (t > 0.12) for (const sx of [-1, 1]) seg.add(mesh(boxGeo(0.06, 0.08 + w * 0.12, 0.12), skin, sx * w * 0.2, w * 0.58, 0, 0, 0, sx * 0.3));
    seg.updateMatrix();
    for (const c of [...seg.children]) {
      c.updateMatrix();
      c.matrix.premultiply(seg.matrix);
      c.matrix.decompose(c.position, c.quaternion, c.scale);
      hull.add(c);
    }
  }
  // la cabeza: hocico ancho y chato, los ojos arriba
  const p0 = path.getPointAt(0);
  const t0 = path.getTangentAt(0);
  const head = new THREE.Group();
  head.position.copy(p0);
  head.rotation.y = Math.atan2(-t0.x, -t0.z);
  head.add(mesh(boxGeo(0.4, 0.16, 0.7), skin, 0, 0.1, 0.35));
  const jaw = mesh(boxGeo(0.38, 0.08, 0.66), belly, 0, 0.02, 0.33);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    head.add(mesh(boxGeo(0.1, 0.1, 0.1), skin, sx * 0.14, 0.22, 0.05));
    head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), eye, sx * 0.14, 0.27, 0.08));
    // dientes
    for (let k = 0; k < 5; k++) head.add(mesh(boxGeo(0.015, 0.04, 0.015), belly, sx * 0.17, 0.04, 0.2 + k * 0.1));
  }
  g.add(head);
  // patas: dos adelante y dos atrás
  for (const t of [0.2, 0.42]) {
    const p = path.getPointAt(t);
    const tan = path.getTangentAt(t);
    const side = new THREE.Vector3(tan.z, 0, -tan.x);
    for (const sx of [-1, 1]) {
      const leg = mesh(boxGeo(0.12, 0.12, 0.3), skin, p.x + side.x * sx * 0.38, 0.08, p.z + side.z * sx * 0.38);
      leg.rotation.y = Math.atan2(side.x * sx, side.z * sx);
      hull.add(leg);
    }
  }
  g.add(mergeByMaterial(hull));
  mergeByMaterial(head, [jaw]);
  g.userData = { hull, head, jaw };
  return g;
}

const mats = new Map();
function keepMat(k, make) {
  if (!mats.has(k)) mats.set(k, make());
  return mats.get(k);
}

export default class PapYacare {
  constructor(q) {
    this.q = q;
    const g = (this.g = q.g);
    this.fed = 0;
    // pescados en manos del equipo (y cuáles se sacaron de las redes)
    this.stock = 0;
    this.taken = [false, false, false];
    this.leaveT = -1;
    this.eatT = -1;
    this.hintT = -99;
    const it = q.papIt;
    const c = it.pos.clone();
    c.y = it.floorY;
    this.center = c;
    // enroscado alrededor de la máquina: una espiral abierta, la cabeza
    // adelante (mirando al que se acerca) y la cola que se pierde atrás
    const front = it.front.clone().sub(c).setY(0).normalize();
    const side = new THREE.Vector3(front.z, 0, -front.x);
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 1.7;
      const r = 1.25 + k * 0.05;
      const dir = front.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      pts.push(new THREE.Vector3(dir.x * r, 0.02, dir.z * r));
    }
    this.path = new THREE.CatmullRomCurve3(pts);
    this.model = caimanModel(g.world.M, this.path);
    this.model.position.copy(c);
    q.root.add(this.model);
    // los pescados: colgados de las redes de la Pesquería
    const nets = PROPS.filter((p) => p.type === 'redesPalo');
    const spots = [];
    nets.forEach((p) => {
      const r = p.rot || 0;
      for (const s of [-0.5, 0.5]) spots.push([p.pos[0] + Math.cos(r) * s, p.pos[1] - Math.sin(r) * s, r]);
    });
    this.fish = spots.slice(0, FISH).map(([x, z, r], i) => {
      const y = g.world.floorAt(x, z);
      const obj = new THREE.Group();
      obj.position.set(x, y + 1.25, z);
      obj.rotation.y = r;
      const scales = keepMat('fishMat', () => new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.5, roughness: 0.35 }));
      const body = mesh(new THREE.SphereGeometry(0.1, 10, 8), scales, 0, 0, 0.08);
      body.scale.set(0.55, 1.8, 0.35);
      obj.add(body);
      obj.add(mesh(boxGeo(0.02, 0.12, 0.12), scales, 0, -0.22, 0.08, 0.6, 0, 0));
      obj.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), g.world.M.rope, 0, 0.3, 0.06));
      const glow = fireflies(g, 0xffd070, 0.6, 0.7);
      glow.position.set(0, 0, 0.1);
      obj.add(glow);
      q.root.add(obj);
      const itm = g.interact.add({
        kind: 'papq',
        pos: new THREE.Vector3(x, y + 1.1, z),
        radius: 1.7,
        prompt: () => (this.taken[i] || this.fed >= FISH ? null : { text: 'agarrar un pescado de la red', noCost: true }),
        cost: () => 0,
        use: () => this.takeFish(i),
      });
      return { obj, it: itm };
    });
  }

  hint(text) {
    if (this.g.time - this.hintT < 4) return;
    this.hintT = this.g.time;
    this.g.hud.subtitle(text, 3.5);
  }

  prompt() {
    if (this.leaveT >= 0) return null;
    if (this.stock > 0) return { text: `tirarle un pescado al yacaré (${this.fed}/${FISH})`, hold: true, noCost: true };
    return { text: `Un yacaré viejo duerme enroscado en el Pack-a-Pava y no se mueve. Tiene hambre: hay pescados en las redes de la Pesquería (${this.fed}/${FISH})`, noCost: true, info: true };
  }

  use() {
    if (this.stock <= 0 || this.leaveT >= 0 || this.g.net?.guest) return false;
    this.feed();
    return true;
  }

  takeFish(i, quiet = false) {
    if (this.taken[i]) return false;
    const g = this.g;
    if (!quiet && g.net?.guest) return false;
    this.taken[i] = true;
    this.stock++;
    this.fish[i].obj.visible = false;
    if (quiet) return true;
    g.net?.event('papq', { kd: 'yacare', fi: i });
    g.audio.pickup?.();
    const left = FISH - this.fed - this.stock;
    g.hud.subtitle(left > 0 ? `Un pescado para el yacaré. Faltan ${left}.` : 'Ya están los pescados: al yacaré del Pack-a-Pava, en el Embalsado.', 3);
    return true;
  }

  feed(quiet = false) {
    const g = this.g;
    this.stock = Math.max(0, this.stock - 1);
    this.fed++;
    this.eatT = 0;
    g.audio.chomp?.(this.center) ?? g.audio.door?.(this.center, true);
    if (!quiet) g.net?.event('papq', { kd: 'yacare', fd: this.fed });
    if (this.fed >= FISH) {
      this.leaveT = 0;
      if (!g.net?.guest) g.later(3.2, () => this.q.finish());
    } else if (!quiet) g.hud.subtitle(`Se lo tragó entero. Quiere más (${this.fed}/${FISH}).`, 3);
  }

  update(dt) {
    const m = this.model;
    if (!m.visible) return;
    const t = this.g.time;
    const { hull, head, jaw } = m.userData;
    // respira (y abre la boca para comer)
    hull.scale.y = 1 + Math.sin(t * 1.3) * 0.035;
    if (this.eatT >= 0) {
      this.eatT += dt;
      const k = Math.min(1, this.eatT / 1.2);
      jaw.rotation.x = Math.sin(k * Math.PI) * 0.6;
      head.rotation.x = -Math.sin(k * Math.PI) * 0.25;
      if (k >= 1) this.eatT = -1;
    }
    // se va: se hunde despacito hacia el agua de atrás
    if (this.leaveT >= 0) {
      this.leaveT += dt;
      const k = Math.min(1, this.leaveT / 5);
      const back = tmpV.copy(this.q.papIt.front).sub(this.center).setY(0).normalize().multiplyScalar(-k * 6);
      m.position.set(this.center.x + back.x, this.center.y - k * k * 1.8, this.center.z + back.z);
      if (k >= 1) m.visible = false;
    }
  }

  complete() {
    this.leaveT = Math.max(this.leaveT, 4.9);
    for (const f of this.fish) f.obj.visible = false;
  }

  state() {
    return { yf: this.fed, ys: this.stock, yt: this.taken.map((v) => (v ? 1 : 0)) };
  }

  apply(m, quiet = false) {
    if (m.yt) m.yt.forEach((v, i) => v && !this.taken[i] && this.takeFish(i, true));
    if (m.ys != null) this.stock = m.ys;
    if (m.yf != null) while (this.fed < m.yf) this.feed(true);
    if (m.fi != null && !this.taken[m.fi]) {
      this.takeFish(m.fi, true);
      if (!quiet) this.g.hud.subtitle('Alguien sacó un pescado de la red.', 2.5);
    }
    if (m.fd != null) while (this.fed < m.fd) this.feed(true);
  }

  onGuest() {}

  onShot() {}

  onExplosion() {}
}
