import * as THREE from 'three';
import { PROPS } from '../config/map';
import { mesh, boxGeo, mergeByMaterial } from './props';
import { fireflies } from '../fx/Fireflies';
import { YacareBlend, yacareBlendOn, loadYacareClips } from './papYacBlend';

// El paso previo del Pack-a-Pava en Mate no Numa: un yacaré viejo y enorme
// duerme enroscado en la máquina y no deja usarla. Tiene hambre: hay que
// buscarle tres pescados en las redes de la Pesquería (uno en cada red; los
// pescados son del equipo) y tirárselos de a uno (mantener F). Cada uno lo
// atrapa en el aire, lo traga y mueve la cola; con el tercero bosteza, se
// desenrosca de la máquina y se va al agua.
//
// Lo arma world/PapQuest.js (kind 'yacare') en el lugar de las termas del
// castillo: prompt, use, update, state/apply, onGuest y complete.
//
// El cuerpo es una malla con huesos a lo largo del lomo (de la cabeza a la
// cola): cada cuadro cada hueso se pone sobre el recorrido. Enroscado, el
// recorrido es la espiral alrededor de la máquina; al irse, la cabeza sale
// por un camino que da la vuelta por afuera y el resto la sigue por donde
// pasó (como un tren): así se desenrosca sin atravesar la máquina.

const FISH = 3;
// huesos del lomo y anillos de la malla
const BONES = 26;
const RINGS = 64;
// tiempos (s): el pescado en el aire, comer entero, el bostezo antes de irse
const FLY = 0.5;
const EAT = 2.3;
const YAWN = 1.5;
// al irse: velocidad (m/s) y el camino de salida (en metros desde el centro
// de la máquina: [hacia adelante, hacia el costado]; sale por afuera de la
// punta de la cola, cruza por delante y se mete en el agua del costado del
// Embalsado, a la vista; los tres últimos puntos, hundiéndose)
const SPEED = 2.1;
const EXIT = [[1.25, 0], [1.95, -0.9], [2.15, -1.9], [1.6, -2.9], [0.7, -3.6], [-0.3, -3.9], [-1.3, -3.6], [-2.0, -3.1], [-2.4, -2.4]];
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

const mats = new Map();
function keepMat(k, make) {
  if (!mats.has(k)) mats.set(k, make());
  return mats.get(k);
}

// ancho del lomo a lo largo del cuerpo (t: 0 la nuca, 1 la punta de la cola)
function widthAt(t) {
  if (t < 0.12) return 0.3 + (t / 0.12) * 0.26;
  if (t < 0.5) return 0.56;
  return Math.max(0.04, 0.56 * (1 - (t - 0.5) / 0.53));
}

// La malla del cuerpo, derecha a lo largo de +z (de 0, la nuca, a L, la cola):
// anillos aplastados (panza chata y lomo redondo), dos filas de placas en el
// lomo, con color por vértice (panza clara) y pesos a los dos huesos vecinos.
function bodyGeometry(L) {
  const P = [];
  const C = [];
  const SI = [];
  const SW = [];
  const I = [];
  // (un poco más claro que el de antes: de noche, enroscado entre el pasto, no se leía la forma)
  const back = new THREE.Color(0x4a4832);
  const side = new THREE.Color(0x5c5638);
  const bellyC = new THREE.Color(0xc4b486);
  const plate = new THREE.Color(0x302e20);
  const skin = (z) => {
    const f = Math.min(BONES - 1.0001, Math.max(0, (z / L) * (BONES - 1)));
    const i0 = Math.floor(f);
    return [i0, i0 + 1, 1 - (f - i0), f - i0];
  };
  const vert = (x, y, z, c) => {
    P.push(x, y, z);
    C.push(c.r, c.g, c.b);
    const [a, b, wa, wb] = skin(z);
    SI.push(a, b, 0, 0);
    SW.push(wa, wb, 0, 0);
    return P.length / 3 - 1;
  };
  // el corte: 10 puntos, la panza chata abajo
  const SEC = [
    [0, 0, 'b'], [0.42, 0.02, 'b'], [0.5, 0.25, 's'], [0.46, 0.62, 's'], [0.26, 0.92, 'k'],
    [0, 1, 'k'], [-0.26, 0.92, 'k'], [-0.46, 0.62, 's'], [-0.5, 0.25, 's'], [-0.42, 0.02, 'b'],
  ];
  const n = SEC.length;
  for (let k = 0; k <= RINGS; k++) {
    const t = Math.pow(k / RINGS, 1.15);
    const z = t * L;
    const w = widthAt(t);
    const h = w * 0.58;
    for (const [sx, sy, kind] of SEC) vert(sx * w, sy * h, z, kind === 'b' ? bellyC : kind === 's' ? side : back);
    if (k) {
      const a = (k - 1) * n;
      const b = k * n;
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        I.push(a + j, b + j1, b + j, a + j, a + j1, b + j1);
      }
    }
  }
  // la punta de la cola cerrada
  const tip = vert(0, 0.02, L + 0.05, back);
  const last = RINGS * n;
  for (let j = 0; j < n; j++) I.push(last + j, last + ((j + 1) % n), tip);
  // las placas del lomo: dos filas de crestas (pirámides chatas)
  for (let k = 0; k < 30; k++) {
    const t = 0.13 + (k / 29) * 0.8;
    const z = t * L;
    const w = widthAt(t);
    const h = w * 0.58;
    const tall = 0.05 + w * 0.12;
    for (const sx of [-1, 1]) {
      const cx = sx * w * 0.2;
      const b0 = vert(cx - 0.035, h * 0.93, z - 0.07, plate);
      const b1 = vert(cx + 0.035, h * 0.93, z - 0.07, plate);
      const b2 = vert(cx + 0.035, h * 0.93, z + 0.07, plate);
      const b3 = vert(cx - 0.035, h * 0.93, z + 0.07, plate);
      const top = vert(cx + sx * 0.02, h * 0.93 + tall, z + 0.02, plate);
      I.push(b0, top, b1, b1, top, b2, b2, top, b3, b3, top, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(I);
  geo.computeVertexNormals();
  return geo;
}

// El yacaré: el cuerpo con huesos, la cabeza (hocico ancho y chato, la
// mandíbula con bisagra atrás, los ojos arriba) y cuatro patas cortas.
function caimanModel(L) {
  const g = new THREE.Group();
  const skinMat = keepMat('yacSkin', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true }));
  const skin = keepMat('yacHead', () => new THREE.MeshStandardMaterial({ color: 0x4a4832, roughness: 0.75, flatShading: true }));
  const belly = keepMat('yacBelly', () => new THREE.MeshStandardMaterial({ color: 0xc4b486, roughness: 0.8 }));
  const mouth = keepMat('yacMouth', () => new THREE.MeshStandardMaterial({ color: 0x7a3a34, roughness: 0.6 }));
  const eyeMat = keepMat('yacEye', () => new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.6 }));
  const bones = [];
  for (let i = 0; i < BONES; i++) {
    const b = new THREE.Bone();
    b.position.set(0, 0, (i / (BONES - 1)) * L);
    g.add(b);
    bones.push(b);
  }
  const body = new THREE.SkinnedMesh(bodyGeometry(L), skinMat);
  // (se mueve entero por el mapa: la esfera de recorte de la pose de reposo no sirve)
  body.frustumCulled = false;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // la cabeza cuelga del primer hueso y mira hacia -z (la cola va a +z)
  const head = new THREE.Group();
  // (primero gira hacia el costado y después levanta el hocico)
  head.rotation.order = 'YXZ';
  bones[0].add(head);
  const skull = new THREE.Group();
  skull.add(mesh(boxGeo(0.42, 0.17, 0.42), skin, 0, 0.14, -0.12));
  skull.add(mesh(boxGeo(0.34, 0.12, 0.5), skin, 0, 0.12, -0.55));
  skull.add(mesh(boxGeo(0.3, 0.05, 0.46), mouth, 0, 0.055, -0.5));
  for (const sx of [-1, 1]) {
    skull.add(mesh(boxGeo(0.1, 0.1, 0.12), skin, sx * 0.14, 0.25, -0.12));
    // dientes de arriba
    for (let k = 0; k < 5; k++) skull.add(mesh(boxGeo(0.018, 0.05, 0.018), belly, sx * 0.155, 0.04, -0.3 - k * 0.1));
  }
  head.add(mergeByMaterial(skull));
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.036, 6, 5), eyeMat, sx * 0.14, 0.3, -0.14);
    head.add(e);
    eyes.push(e);
  }
  // la mandíbula: bisagra atrás, abajo de la nuca
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.07, 0.02);
  const jawParts = new THREE.Group();
  jawParts.add(mesh(boxGeo(0.38, 0.07, 0.72), belly, 0, -0.03, -0.38));
  jawParts.add(mesh(boxGeo(0.28, 0.03, 0.6), mouth, 0, 0.01, -0.38));
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) jawParts.add(mesh(boxGeo(0.018, 0.045, 0.018), belly, sx * 0.15, 0.03, -0.3 - k * 0.1));
  jaw.add(mergeByMaterial(jawParts));
  head.add(jaw);
  // las patas: dos adelante y dos atrás, colgadas de su hueso (cadera abajo del costado)
  const legs = [];
  for (const t of [0.2, 0.42]) {
    const b = bones[Math.round(t * (BONES - 1))];
    const w = widthAt(t);
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * w * 0.42, w * 0.2, 0);
      const leg = new THREE.Group();
      leg.add(mesh(boxGeo(0.13, 0.12, 0.13), skin, sx * 0.1, -0.06, 0));
      leg.add(mesh(boxGeo(0.16, 0.05, 0.2), skin, sx * 0.2, -0.13, -0.05));
      hip.add(mergeByMaterial(leg));
      b.add(hip);
      legs.push({ hip, sx, front: t < 0.3 });
    }
  }
  for (const o of [head, jaw, ...legs.map((l) => l.hip)]) o.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  g.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  g.userData = { body, bones, head, jaw, eyes, legs };
  return g;
}

export default class PapYacare {
  constructor(q) {
    this.q = q;
    const g = (this.g = q.g);
    this.fed = 0;
    // pescados en manos del equipo (y cuáles se sacaron de las redes)
    this.stock = 0;
    this.taken = [false, false, false];
    // comiendo (s desde que se le tiró el último) y yéndose (s desde que empezó)
    this.eatT = -1;
    this.leaveT = -1;
    this.gone = false;
    this.finished = false;
    this.hintT = -99;
    this.blinkT = 3;
    const it = q.papIt;
    const c = it.pos.clone();
    c.y = it.floorY;
    this.center = c;
    // enroscado alrededor de la máquina: una espiral abierta, la cabeza
    // adelante (mirando al que se acerca) y la cola que se pierde atrás
    const front = (this.front = it.front.clone().sub(c).setY(0).normalize());
    const side = (this.side = new THREE.Vector3(front.z, 0, -front.x));
    // (apoyado en el suelo; donde hay agua, flotando en la superficie)
    const W = g.water?.level ?? 0;
    const ground = (x, z) => Math.max(g.world.floorAt(c.x + x, c.z + z, c.y + 1), W - 0.12) - c.y + 0.02;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 1.7;
      const r = 1.25 + k * 0.05;
      const dir = front.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      pts.push(new THREE.Vector3(dir.x * r, ground(dir.x * r, dir.z * r), dir.z * r));
    }
    this.coil = new THREE.CatmullRomCurve3(pts);
    this.L = this.coil.getLength();
    // la salida: la altura la da el suelo; en el agua nada en la superficie y
    // después se hunde
    const ex = EXIT.map(([f, s], k) => {
      const x = c.x + front.x * f + side.x * s;
      const z = c.z + front.z * f + side.z * s;
      const floor = g.world.floorAt(x, z, c.y + 1);
      const deep = k >= EXIT.length - 3 ? (k - (EXIT.length - 4)) * 0.45 : 0;
      const y = Math.max(floor, W - 0.12 - deep) - c.y;
      return new THREE.Vector3(x - c.x, Math.max(y, floor - c.y - 0.6) + 0.02, z - c.z);
    });
    this.exit = new THREE.CatmullRomCurve3(ex);
    this.E = this.exit.getLength();
    this.model = caimanModel(this.L);
    // los clips de Blender (world/papYacBlend.js; __mduNoYacareBlend: como antes)
    this.bl = yacareBlendOn() ? new YacareBlend(this) : null;
    if (this.bl) loadYacareClips();
    this.model.position.copy(c);
    q.root.add(this.model);
    this.pose(0, 0);
    // el pescado que vuela (uno a la vez)
    this.flying = null;
    // los pescados: uno colgado en cada red de la Pesquería
    const nets = PROPS.filter((p) => p.type === 'redesPalo');
    this.fish = nets.slice(0, FISH).map((p, i) => {
      const r = p.rot || 0;
      const x = p.pos[0];
      const z = p.pos[1];
      const y = g.world.floorAt(x, z);
      const obj = this.fishModel();
      obj.position.set(x, y + 1.25, z);
      obj.rotation.y = r;
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

  fishModel() {
    const obj = new THREE.Group();
    const scales = keepMat('fishMat', () => new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.5, roughness: 0.35 }));
    const body = mesh(new THREE.SphereGeometry(0.1, 10, 8), scales, 0, 0, 0.08);
    body.scale.set(0.55, 1.8, 0.35);
    obj.add(body);
    obj.add(mesh(boxGeo(0.02, 0.12, 0.12), scales, 0, -0.22, 0.08, 0.6, 0, 0));
    obj.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), this.g.world.M.rope, 0, 0.3, 0.06));
    return obj;
  }

  hint(text) {
    if (this.g.time - this.hintT < 4) return;
    this.hintT = this.g.time;
    this.g.hud.subtitle(text, 3.5);
  }

  prompt() {
    if (this.leaveT >= 0 || this.fed >= FISH) return null;
    if (this.stock > 0) return { text: `tirarle un pescado al yacaré (${this.fed}/${FISH})`, hold: true, noCost: true };
    return { text: `Un yacaré viejo duerme enroscado en el Pack-a-Pava y no se mueve. Tiene hambre: hay pescados en las redes de la Pesquería (${this.fed}/${FISH})`, noCost: true, info: true };
  }

  use() {
    // (si todavía está tragando el anterior, atrapa este igual: rechazarlo
    // dejaba la barra de mantener F llena sin que pasara nada)
    if (this.stock <= 0 || this.fed >= FISH || this.g.net?.guest) return false;
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
    g.hud.subtitle(`Pescado ${FISH - left}/${FISH}`, 2.5);
    return true;
  }

  // Un pescado al yacaré: sale volando de la mano del que lo tira (o, del
  // otro lado de la sala, de adelante de la máquina) y lo atrapa en el aire.
  feed(quiet = false) {
    const g = this.g;
    this.stock = Math.max(0, this.stock - 1);
    this.fed++;
    this.eatT = 0;
    this.gulped = false;
    const from = new THREE.Vector3();
    if (!quiet && g.camera) {
      g.camera.getWorldPosition(from);
      g.camera.getWorldDirection(tmpV);
      from.addScaledVector(tmpV, 0.5);
      from.y -= 0.25;
    } else from.copy(this.q.papIt.front).setY(this.center.y + 1.3);
    if (!this.flying) {
      const obj = this.fishModel();
      this.q.root.add(obj);
      this.flying = { obj, from: new THREE.Vector3(), t: 0 };
    }
    this.flying.from.copy(from);
    this.flying.t = 0;
    // (la cabeza se da vuelta hacia el que se lo tira)
    this.lookAt = from.clone();
    this.flying.obj.visible = true;
    g.audio.whoosh?.(from);
    if (!quiet) g.net?.event('papq', { kd: 'yacare', fd: this.fed });
    if (this.fed < FISH && !quiet) g.later(EAT, () => this.fed < FISH && g.hud.subtitle(`Se lo tragó entero. Quiere más (${this.fed}/${FISH}).`, 3));
  }

  // Dónde está la boca ahora (para que el pescado llegue justo).
  mouth(out) {
    const { head } = this.model.userData;
    this.model.updateMatrixWorld(true);
    return head.localToWorld(out.set(0, 0.14, -0.55));
  }

  sound(kind, pos) {
    const A = this.g.audio;
    if (!A?.out) return;
    if (kind === 'snap') {
      const o = A.out({ pos, gain: 0.7, reverb: 0.1 });
      A.noise(o, { dur: 0.07, type: 'bandpass', freq: 1100, q: 1.4, gain: 0.9 });
      A.tone(o, { dur: 0.14, type: 'sine', freq: 150, freqEnd: 60, gain: 0.5 });
    } else if (kind === 'gulp') {
      const o = A.out({ pos, gain: 0.5, reverb: 0.1 });
      A.tone(o, { dur: 0.28, type: 'sine', freq: 210, freqEnd: 80, gain: 0.35, attack: 0.03 });
    } else if (kind === 'yawn') {
      const o = A.out({ pos, gain: 0.55, reverb: 0.2 });
      A.noise(o, { dur: 1.3, type: 'bandpass', freq: 520, freqEnd: 260, q: 0.8, gain: 0.5, attack: 0.35 });
      A.tone(o, { dur: 1.2, type: 'sawtooth', freq: 62, freqEnd: 48, gain: 0.08, attack: 0.3 });
    } else if (kind === 'splash') {
      const o = A.out({ pos, gain: 0.8, reverb: 0.15 });
      A.noise(o, { dur: 0.7, type: 'lowpass', freq: 1400, freqEnd: 220, gain: 0.8 });
    }
  }

  update(dt) {
    const m = this.model;
    if (this.gone) return;
    const t = this.g.time;
    const U = m.userData;
    let lift = 0;
    let open = 0;
    let turn = 0;
    let wag = 0;
    // el pescado en el aire: de la mano a la boca, en arco
    const F = this.flying;
    if (F?.obj.visible) {
      F.t += dt;
      const k = Math.min(1, F.t / FLY);
      const to = this.mouth(tmpW);
      F.obj.position.lerpVectors(F.from, to, k);
      F.obj.position.y += Math.sin(k * Math.PI) * 0.9;
      F.obj.rotation.set(k * 9, k * 4, 0);
      if (k >= 1) {
        F.obj.visible = false;
        this.sound('snap', to);
      }
    }
    // comer: levanta la cabeza hacia el pescado, abre grande, cierra de golpe,
    // traga dos veces y mueve la cola
    if (this.eatT >= 0) {
      this.eatT += dt;
      const e = this.eatT;
      if (e < FLY) {
        const k = e / FLY;
        lift = 0.4 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
        open = 0.8 * Math.min(1, k * 2);
        turn = 0.25 * k;
      } else if (e < EAT) {
        const k = (e - FLY) / (EAT - FLY);
        // cierra en 0,08 s y después dos tragos (la cabeza da dos cabezazos para arriba)
        const snap = Math.max(0, 1 - (e - FLY) / 0.08);
        const gulp = Math.max(0, Math.sin(k * Math.PI * 4)) * (1 - k);
        lift = 0.4 * (1 - k) + gulp * 0.22;
        open = 0.8 * snap + gulp * 0.12;
        turn = 0.25 * (1 - k);
        wag = Math.sin(k * Math.PI * 3) * (1 - k);
        if (!this.gulped && e > FLY + 0.35) {
          this.gulped = true;
          this.sound('gulp', this.center);
        }
      } else {
        this.eatT = -1;
        this.gulped = false;
        // con el tercero se va (el anfitrión libera la máquina cuando ya salió)
        if (this.fed >= FISH && this.leaveT < 0) this.startLeave();
      }
    }
    // irse: bosteza, se desenrosca y se va por la salida al agua
    let d = 0;
    let walking = 0;
    if (this.leaveT >= 0) {
      this.leaveT += dt;
      const l = this.leaveT;
      if (l < YAWN) {
        const k = l / YAWN;
        open = Math.max(open, 1.05 * Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * (k > 0.8 ? (1 - k) / 0.2 : 1));
        lift = Math.max(lift, 0.5 * Math.sin(k * Math.PI));
      } else {
        // arranca despacio y llega a SPEED
        const s = l - YAWN;
        d = s < 1 ? (SPEED * s * s) / 2 : SPEED * (s - 0.5);
        walking = Math.min(1, s * 2);
        if (!this.splashed && d > this.E - 3.2) {
          this.splashed = true;
          this.sound('splash', tmpV.copy(this.exit.getPointAt(Math.min(1, (this.E - 3) / this.E))).add(this.center));
        }
        // ya pasó la cola por la máquina: el anfitrión la da por lista
        if (!this.finished && d > this.L * 0.55) {
          this.finished = true;
          if (!this.g.net?.guest) this.q.finish();
        }
        if (d > this.E + this.L) {
          this.gone = true;
          m.visible = false;
          return;
        }
      }
    }
    // con los clips de Blender: la pose sale del clip (comer / irse / enroscado), la cabeza mira al que tiró
    if (this.bl) {
      let tk = 0;
      if (this.eatT >= 0 && this.lookAt) {
        const B0 = U.bones[0];
        B0.updateWorldMatrix(true, false);
        const v = B0.worldToLocal(tmpV.copy(this.lookAt));
        tk = Math.max(-0.9, Math.min(0.9, Math.atan2(-v.x, -v.z))) / 0.25;
      }
      const st = this.leaveT >= 0 ? 'leave' : this.eatT >= 0 ? 'eat' : 'sleep';
      if (this.bl.apply(st, st === 'leave' ? this.leaveT : this.eatT, dt, tk)) {
        const br = 1 + (this.leaveT < 0 ? Math.sin(t * 1.3) * 0.04 : 0);
        for (let i = 3; i < BONES - 6; i++) U.bones[i].scale.set(1, br, 1);
        this.blinkT -= dt;
        const closed = this.blinkT < 0.12 && this.blinkT > 0;
        if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 4;
        for (const e of U.eyes) e.scale.y = closed ? 0.15 : 1;
        return;
      }
    }
    this.pose(d, t, walking, wag);
    // la cabeza (hacia el pescado, de costado hasta ~50°) y la mandíbula
    if (turn > 0 && this.lookAt) {
      const B0 = U.bones[0];
      B0.updateWorldMatrix(true, false);
      const v = B0.worldToLocal(tmpV.copy(this.lookAt));
      turn *= Math.max(-0.9, Math.min(0.9, Math.atan2(-v.x, -v.z))) / 0.25;
    } else turn = 0;
    U.head.rotation.set(lift, turn, 0);
    U.jaw.rotation.x = -open;
    // respira (dormido: el lomo sube y baja; la escala de la malla no sirve,
    // la anula el bind) y parpadea
    const br = 1 + (this.leaveT < 0 ? Math.sin(t * 1.3) * 0.04 : 0);
    for (let i = 3; i < BONES - 6; i++) U.bones[i].scale.set(1, br, 1);
    this.blinkT -= dt;
    const closed = this.blinkT < 0.12 && this.blinkT > 0;
    if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 4;
    for (const e of U.eyes) e.scale.y = closed ? 0.15 : 1;
  }

  startLeave() {
    if (this.leaveT >= 0) return;
    this.leaveT = 0;
    this.sound('yawn', this.center);
  }

  // Los huesos sobre el recorrido: el hueso de la nuca, d metros adelantado
  // por la salida; los demás, detrás de él por donde pasó (la salida y la
  // espiral). wag: la cola que se sacude; walking: las patas que reman.
  pose(d, t, walking = 0, wag = 0) {
    const U = this.model.userData;
    const B = U.bones;
    const L = this.L;
    const at = (q, out) => {
      // q < 0: adelante de la nuca, en la salida (|q| metros); si no, la espiral
      if (q < 0) {
        const u = -q / this.E;
        if (u <= 1) return this.exit.getPointAt(u, out);
        // más allá del final, derecho hacia abajo
        this.exit.getPointAt(1, out);
        return out.addScaledVector(this.exit.getTangentAt(1, tmpV), (u - 1) * this.E);
      }
      return this.coil.getPointAt(Math.min(1, q / L), out);
    };
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < BONES; i++) {
      const s = (i / (BONES - 1)) * L;
      const q = s - d;
      at(q, p);
      at(q + 0.12, n);
      // la dirección hacia la cola
      n.sub(p);
      if (n.lengthSq() < 1e-8) n.copy(Z_AXIS);
      n.normalize();
      // la cola sacudida de costado (lo último del cuerpo, más)
      const tail = Math.max(0, (s / L - 0.55) / 0.45);
      if (tail > 0) {
        const sideV = tmpW.set(n.z, 0, -n.x);
        const sway = (wag * 0.35 + (this.leaveT < 0 ? Math.sin(t * 0.8 + s) * 0.04 : Math.sin(t * 6 - s * 2) * 0.12 * walking)) * tail * tail;
        p.addScaledVector(sideV, sway);
      }
      // el cuerpo que nada culebrea un poco
      if (walking > 0 && q < 0) p.addScaledVector(tmpW.set(n.z, 0, -n.x), Math.sin(t * 5 - s * 1.6) * 0.05 * walking);
      B[i].position.copy(p);
      // +z del hueso hacia la cola, +y para arriba
      tmpM.lookAt(tmpV.set(0, 0, 0), n.clone().negate(), UP);
      B[i].quaternion.setFromRotationMatrix(tmpM);
    }
    // las patas: quietas abajo del cuerpo o remando al caminar
    for (const [k, l] of U.legs.entries()) {
      const ph = t * 7 + (k % 2 ? Math.PI : 0) + (l.front ? 0 : Math.PI / 2);
      l.hip.rotation.set(0, Math.sin(ph) * 0.55 * walking * l.sx, (Math.max(0, Math.cos(ph)) * 0.35 * walking - 0.15) * l.sx);
    }
  }

  complete(quiet = false) {
    for (const f of this.fish) f.obj.visible = false;
    if (this.flying) this.flying.obj.visible = false;
    // (al que entra a la sala ya hecha, o el atajo de prueba con el yacaré quieto)
    if (quiet) {
      this.gone = true;
      this.model.visible = false;
      return;
    }
    this.finished = true;
    if (this.leaveT < 0) {
      this.eatT = -1;
      this.startLeave();
    }
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
    }
    if (m.fd != null) while (this.fed < m.fd) this.feed(true);
  }

  onGuest() {}

  onShot() {}

  onExplosion() {}
}
