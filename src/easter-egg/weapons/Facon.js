import * as THREE from 'three';
import { WEAPONS } from '../config/weapons';
import { VM, registerMate } from './viewmodels';

// Facón Relámpago (el potenciador de Mate no Numa): un facón criollo de hoja
// larga, guarda en S y cabo de plata con virolas. La hoja está al rojo y el
// filo blanco, como recién sacado de la fragua, bajo la luna del estero.
//  · Izquierdo (mantenido sigue): un tajo largo en arco (~5 m) que corta a
//    todos los que agarra. Usa los golpes de la hoz de Weapons (poses, estela,
//    derecho / revés / de arriba); el corte lo hace slash() y se ve en el
//    mundo como una medialuna roja y blanca.
//  · Derecho: le cae un rayo del cielo al facón y de la punta sale al muerto
//    que apuntás; de ahí salta a los de al lado (cadena), con fogonazo y trueno.
// Weapons le pasa el gatillo con el arma temporal en la mano (input), el golpe
// de la hoz (strike), cada cuadro (update) y el final (clear). El daño va por
// zombies.damage (el invitado se lo pasa al anfitrión); los demás ven el arco
// y los rayos por 'facon' (ghost).

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const near = [];
const near2 = [];
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
// a qué altura se le pega a cada uno (los yacarés van al ras)
const aimY = (z) => (z.dog ? (z.yacY ?? z.pos.y) + 0.25 : z.pos.y + 1.1 * (z.scale || 1));

// ---------------- el facón ----------------
// largo y espesor de la hoja; el lomo recto y la punta con contrafilo
const L = 0.34;
const TH = 0.005;
const SPINE = -0.011;
const CLIP = L * 0.8;
const edgeX = (y) => {
  const k = Math.max(0, (y - L * 0.66) / (L * 0.34));
  return 0.0125 - 0.0075 * k * k;
};
const spineX = (y) => (y < CLIP ? SPINE : SPINE + (0.005 - SPINE) * ((y - CLIP) / (L - CLIP)) ** 1.6);

let MATS = null;
function faconMats() {
  if (MATS) return MATS;
  MATS = {
    // la hoja de acero (antes al rojo: parecía un cuchillo de plástico); el
    // rayo vive en el filo y la canaleta, azul eléctrico, y la hoja apenas se
    // enciende cuando chisporrotea o pega (update)
    blade: new THREE.MeshStandardMaterial({ color: 0xc4c8d0, metalness: 1, roughness: 0.22, emissive: 0x4aa8ff, emissiveIntensity: 0.04 }),
    edge: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.92, 1).multiplyScalar(1.6), toneMapped: false }),
    vein: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.7, 1).multiplyScalar(1.8), toneMapped: false }),
    silver: new THREE.MeshStandardMaterial({ color: 0xe9e9ee, metalness: 1, roughness: 0.14 }),
    horn: new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.45, metalness: 0.1 }),
  };
  return MATS;
}

// El facón sin la mano (en la mano y tirado en el piso). La guarda está en
// y = 0, la hoja sube (+y) y el mango baja; el filo mira a +x del holder.
function faconMesh(F) {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  // la hoja: el filo sube derecho y se curva a la punta; el lomo baja por el contrafilo
  const s = new THREE.Shape();
  s.moveTo(SPINE, 0);
  s.lineTo(edgeX(0), 0);
  for (let i = 1; i <= 16; i++) s.lineTo(edgeX((i / 16) * L), (i / 16) * L);
  for (let i = 15; i >= 0; i--) {
    const y = CLIP + (L - CLIP) * (i / 15);
    s.lineTo(spineX(y), y);
  }
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: TH, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -TH / 2), F.blade);
  holder.add(blade);
  // el filo: una franja blanca que asoma del borde (se ve de los dos lados)
  const e = new THREE.Shape();
  const N = 20;
  const y0 = 0.012;
  const at = (i) => y0 + (L - 0.003 - y0) * (i / N);
  e.moveTo(edgeX(y0) + 0.0007, y0);
  for (let i = 1; i <= N; i++) e.lineTo(edgeX(at(i)) + 0.0007 * (1 - i / N) + 0.0002, at(i));
  e.lineTo(0.005, L);
  for (let i = N; i >= 0; i--) e.lineTo(edgeX(at(i)) - 0.0016 * (1 - 0.6 * (i / N)), at(i));
  holder.add(new THREE.Mesh(new THREE.ExtrudeGeometry(e, { depth: TH + 0.0008, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -(TH + 0.0008) / 2), F.edge));
  // la canaleta del lomo, roja viva
  const vein = new THREE.Mesh(new THREE.BoxGeometry(0.0022, L * 0.55, TH + 0.0008), F.vein);
  vein.position.set(-0.0055, 0.03 + L * 0.275, 0);
  holder.add(vein);
  g.add(holder);
  // la guarda en S de plata (cruza a lo ancho de la hoja) con sus dos rulos
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.007, 0.011), F.silver);
  guard.position.y = -0.004;
  holder.add(guard);
  for (const sx of [-1, 1]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0024, 6, 12, Math.PI * 1.25), F.silver);
    curl.position.set(sx * 0.036, -0.004 + sx * 0.0055, 0);
    curl.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    holder.add(curl);
  }
  // el cabo: virola arriba, guampa negra con anillos de alambre de plata, el pomo de plata
  const add = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.0135, 0.0145, 0.02, 12), F.silver, -0.017);
  add(new THREE.CylinderGeometry(0.0128, 0.0136, 0.074, 12), F.horn, -0.063);
  for (const y of [-0.04, -0.063, -0.086]) add(new THREE.TorusGeometry(0.0134, 0.0017, 5, 16), F.silver, y).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.0118, 0.0145, 0.024, 12), F.silver, -0.111);
  add(new THREE.SphereGeometry(0.0112, 10, 8), F.silver, -0.125).scale.set(1, 0.8, 1);
  // la punta y la mitad del filo (la estela del tajo va de una a la otra)
  const tip = new THREE.Object3D();
  tip.position.set(0.005, L, 0);
  const mid = new THREE.Object3D();
  mid.position.set(edgeX(L * 0.5), L * 0.5, 0);
  holder.add(tip, mid);
  return { group: g, holder, tip, mid };
}

// En la mano: agarrado como la hoz (el mango casi derecho, la hoja arriba).
registerMate('facon', (up, T) => {
  const M = VM.mats(T);
  const F = faconMats();
  const g = new THREE.Group();
  const k = faconMesh(F);
  // de filo hacia adelante (como la hoja de la hoz)
  k.holder.rotation.y = Math.PI / 2;
  g.add(k.group);
  g.add(VM.wrapHand(M, { radius: 0.0135, y0: -0.1, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 }));
  const tilt = new THREE.Group();
  g.rotation.set(-0.2, 0.9, -0.45);
  g.position.set(-0.01, 0.03, 0);
  tilt.add(g);
  tilt.scale.setScalar(0.82);
  tilt.position.y = -0.012;
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  k.tip.getWorldPosition(tip);
  const edgeAt = (e, out) => out.set(edgeX(e * L), e * L, 0);
  return {
    root: tilt,
    muzzle: k.tip,
    anim: { spin: [], glow: [], wobble: null },
    upgraded: false,
    tip,
    mouth: null,
    mate: g,
    bombGroup: null,
    yerba: null,
    hoz: { wrist: g, baseRot: g.rotation.clone(), blade: k.holder, mid: k.mid, edgeAt, glow: F.edge },
    facon: k,
  };
});

// El modelo del potenciador tirado en el piso (entities/Powerups.js).
export function faconPickup() {
  const k = faconMesh(faconMats());
  k.group.scale.setScalar(2.3);
  k.group.position.y = -0.25;
  k.group.rotation.z = 0.3;
  return k.group;
}

// ---------------- el tajo en el mundo ----------------
// medialuna aditiva: por dentro negra (no se ve), al medio roja, afuera blanca
const ARC_HALF = 1.45;
const ARC_SEG = 28;
const ARC_SWEEP = 0.07;
const ARC_FADE = 0.24;
// inclinación de cada golpe de la hoz y de qué lado arranca (flip: espejado)
const MOVES = { fore: { roll: 0.4, flip: 1 }, back: { roll: -0.3, flip: -1 }, over: { roll: Math.PI / 2 - 0.15, flip: 1 }, toss: { roll: 0, flip: 1 } };
const MOVE_IDS = ['fore', 'back', 'over'];
let ARC_ATTR = null;
function arcAttrs(R) {
  if (ARC_ATTR) return ARC_ATTR;
  // de adentro para afuera: nada, azul eléctrico y blanco; en las puntas se afina a cero
  const depth = [R * 0.45, R * 0.1, 0];
  const cols = [[0, 0, 0], [0.12, 0.42, 1], [0.85, 0.95, 1]];
  const pos = [];
  const col = [];
  for (let i = 0; i <= ARC_SEG; i++) {
    // de la derecha (+x) a la izquierda: así barre el derecho
    const u = i / ARC_SEG;
    const a = ARC_HALF - u * ARC_HALF * 2;
    const taper = Math.sin(Math.PI * u) ** 0.7;
    for (let j = 0; j < 3; j++) {
      const r = R - depth[j] * taper;
      pos.push(Math.sin(a) * r, 0, -Math.cos(a) * r);
      col.push(...cols[j]);
    }
  }
  const idx = [];
  for (let i = 0; i < ARC_SEG; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  ARC_ATTR = { pos: new THREE.Float32BufferAttribute(pos, 3), col: new THREE.Float32BufferAttribute(col, 3), idx: new THREE.Uint16BufferAttribute(idx, 1) };
  return ARC_ATTR;
}

// ---------------- en uso ----------------
export default class Facon {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.cd = 0;
    this.heat = 0;
    this.arcs = [];
    this.tempRef = null;
  }

  // Lo llama Weapons.handleInput con un arma temporal en la mano; true si era el facón.
  input(input, st, p) {
    if (st.id !== 'facon') return false;
    const w = this.w;
    if (w.state === 'reload') w.state = 'idle';
    if (w.state !== 'idle' || p.sprinting) return true;
    // el rayo: lo levanta y lo tira para adelante (el golpe 'toss' de la hoz)
    if (input.mouse.rightPressed && this.cd <= 0) {
      this.cd = st.bolt.cd;
      w.startToss();
      return true;
    }
    if (input.mouse.left && w.fireCd <= 0) w.startSwing(st);
    return true;
  }

  // El golpe de la hoz llegó al punto de cortar: true si era el facón.
  strike(st, move) {
    if (st?.id !== 'facon') return false;
    if (move === 'toss') this.cast(st);
    else this.slash(st, move);
    return true;
  }

  // El tajo: corta a todos los que están adelante en un arco largo.
  slash(st, move) {
    const g = this.g;
    const S = st.slash;
    const P = g.player.pos;
    const cam = g.camera;
    const fwd = tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
    fwd.normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const center = new THREE.Vector3(P.x, cam.position.y - 0.45, P.z);
    this.addArc(center, yaw, move, S.range);
    g.net?.share('facon', { k: 's', p: r2(center), y: +yaw.toFixed(2), m: Math.max(0, MOVE_IDS.indexOf(move)) });
    this.heat = Math.max(this.heat, 0.6);
    const eye = cam.position;
    const list = [];
    for (const { z, d } of g.zombies.inRadius(P, S.range + 0.6, near)) {
      const dx = z.pos.x - P.x;
      const dz = z.pos.z - P.z;
      const len = Math.hypot(dx, dz) || 1;
      if (len > 0.9 && (dx / len) * fwd.x + (dz / len) * fwd.z < S.cos) continue;
      if (Math.abs(z.pos.y - P.y) > 2.5 && !z.crow) continue;
      // no corta a través de las paredes
      if (len > 1.2 && !g.world.clear(eye, tmpV2.set(z.pos.x, aimY(z), z.pos.z))) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    let hit = 0;
    for (const { z } of list.slice(0, S.targets)) {
      const big = z.boss || z.pombero || z.crow;
      const point = new THREE.Vector3(z.pos.x, aimY(z), z.pos.z);
      g.zombies.damage(z, big ? S.boss : 1e9, { type: 'scythe', zone: 'torso', point, dir: fwd.clone(), decap: Math.random() < 0.7, pup: st.bossMult });
      g.fx.sparks(point, 0.5, tmpV2.set(fwd.x, 0.4, fwd.z), [0.6, 0.85, 1]);
      hit++;
    }
    this.sndCrackle(null, 0.45);
    if (hit) {
      g.hud.hitmarker(false);
      g.audio.knife(true);
      g.fx.addShake(0.1 + Math.min(0.2, hit * 0.03));
    }
    g.stats.shots++;
  }

  // El rayo: del cielo al facón, de la punta al que apuntás y de ahí a los de al lado.
  cast(st) {
    const g = this.g;
    const B = st.bolt;
    const cam = g.camera;
    const origin = cam.position;
    const fwd = tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const tip = this.w.muzzleWorld(new THREE.Vector3());
    let first = null;
    let best = Infinity;
    for (const { z, d } of g.zombies.inRadius(origin, B.range, near)) {
      tmpV.set(z.pos.x - origin.x, aimY(z) - origin.y, z.pos.z - origin.z);
      const dot = tmpV.dot(fwd) / (tmpV.length() || 1);
      if (dot < B.cos) continue;
      const score = d * (1.6 - dot);
      if (score < best && g.world.clear(origin, tmpV2.set(z.pos.x, aimY(z), z.pos.z))) {
        best = score;
        first = z;
      }
    }
    const hits = [];
    const seen = new Set();
    let cur = first;
    while (cur && hits.length < B.targets) {
      seen.add(cur);
      const at = new THREE.Vector3(cur.pos.x, aimY(cur), cur.pos.z);
      hits.push({ z: cur, at });
      let next = null;
      let nd = B.hop;
      for (const { z } of g.zombies.inRadius(at, B.hop, near2)) {
        if (seen.has(z)) continue;
        const d = Math.hypot(z.pos.x - cur.pos.x, z.pos.z - cur.pos.z);
        if (d < nd && g.world.clear(tmpV2.set(at.x, at.y + 0.9, at.z), tmpV.set(z.pos.x, aimY(z) + 0.9, z.pos.z))) {
          nd = d;
          next = z;
        }
      }
      cur = next;
    }
    const path = [tip, ...(hits.length ? hits.map((h) => h.at) : [this.w.aimPoint(origin, fwd, B.range)])];
    const sky = new THREE.Vector3(tip.x + (Math.random() - 0.5) * 4, tip.y + 26, tip.z + (Math.random() - 0.5) * 4);
    this.strikeFx(sky, path, false);
    hits.forEach((h, i) => {
      g.later(0.05 + i * 0.06, () => {
        const big = h.z.boss || h.z.pombero || h.z.crow;
        g.zombies.damage(h.z, big ? B.boss : 1e9, { type: 'chain', point: h.at, pup: st.bossMult });
      });
    });
    if (hits.length) g.hud.hitmarker(false);
    this.lastHits = hits.length;
    g.net?.share('facon', { k: 'b', s: r2(sky), p: path.map(r2) });
    this.heat = 1.4;
    g.stats.shots++;
  }

  // Lo que se ve y se escucha del rayo (el propio y el de los demás).
  strikeFx(sky, path, ghost) {
    const g = this.g;
    // del cielo: dos rayos encimados (más gordo) y el fogonazo
    g.fx.lightning(sky, path[0], 0x6aa8ff, 0.34);
    g.fx.lightning(sky, path[0], 0xe6f2ff, 0.22);
    g.fx.flash(path[0], 0xb4d4ff, ghost ? 40 : 22, 0.35, ghost ? 24 : 14);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      g.later(0.05 + (i - 1) * 0.06, () => {
        g.fx.lightning(a, b, 0x5aa4ff, 0.3);
        g.fx.electric(b, 16);
        g.fx.sparks(b, 0.8, { x: 0, y: 1, z: 0 }, [0.6, 0.85, 1]);
        if (i === 1 || i === path.length - 1) g.fx.flash(b, 0x8ac4ff, 45, 0.3, 14);
        g.audio.zap(b);
      });
    }
    g.audio.thunder(ghost ? path[0] : null);
    if (!ghost) {
      g.post.flash(0.2);
      g.fx.addShake(0.3);
    } else {
      const d = g.camera.position.distanceTo(path[0]);
      if (d < 20) g.fx.addShake(0.15 * (1 - d / 20));
    }
  }

  addArc(center, yaw, move, R) {
    let a = this.arcs.find((x) => !x.m.visible);
    if (!a) {
      if (this.arcs.length >= 4) a = this.arcs.reduce((p, q) => (p.t > q.t ? p : q));
      else {
        const A = arcAttrs(R);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', A.pos);
        geo.setAttribute('color', A.col);
        geo.setIndex(A.idx);
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.renderOrder = 5;
        this.g.scene.add(m);
        a = { m, t: 0 };
        this.arcs.push(a);
      }
    }
    const mv = MOVES[move] || MOVES.fore;
    a.t = 0;
    a.m.visible = true;
    a.m.position.copy(center);
    a.m.rotation.set(0, yaw, mv.roll, 'YXZ');
    a.m.scale.set(mv.flip, 1, 1);
    a.m.material.opacity = 1;
    a.m.geometry.setDrawRange(0, 0);
  }

  stepArc(a, dt) {
    a.t += dt;
    const k = Math.min(1, a.t / ARC_SWEEP);
    a.m.geometry.setDrawRange(0, Math.ceil(k * ARC_SEG) * 12);
    const f = a.t < ARC_SWEEP ? 1 : Math.max(0, 1 - (a.t - ARC_SWEEP) / ARC_FADE);
    a.m.material.opacity = f * f;
    const s = 1 + a.t * 0.35;
    a.m.scale.set(Math.sign(a.m.scale.x) * s, s, s);
    if (f <= 0) a.m.visible = false;
  }

  update(dt) {
    const g = this.g;
    const w = this.w;
    this.cd -= dt;
    // recién agarrado: lo desenvaina (y retumba lejos)
    if (w.temp !== this.tempRef) {
      this.tempRef = w.temp;
      if (w.temp?.id === 'facon') this.sndDraw();
    }
    for (const a of this.arcs) if (a.m.visible) this.stepArc(a, dt);
    // la hoja chisporrotea de a ratos y se enciende con cada golpe
    if (w.model?.facon) {
      const t = g.time;
      this.heat = Math.max(0, this.heat - dt * 2.2);
      faconMats().blade.emissiveIntensity = 0.04 + Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.3)) * 0.12 + this.heat * 0.6;
    }
  }

  // ---------------- en línea ----------------
  // El tajo o el rayo de otro jugador: lo mismo que se ve acá, sin daño.
  ghost(m) {
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    if (m.k === 's' && m.p) {
      const at = V(m.p);
      this.addArc(at, m.y || 0, MOVE_IDS[m.m] || 'fore', WEAPONS.facon.slash.range);
      this.sndCrackle(at, 0.6);
    } else if (m.k === 'b' && m.s && m.p?.length) this.strikeFx(V(m.s), m.p.map(V), true);
  }

  clear() {
    for (const a of this.arcs) a.m.visible = false;
    this.heat = 0;
    this.cd = 0;
  }

  // ---------------- lo que se escucha ----------------
  // El chisporroteo del filo en cada tajo.
  sndCrackle(pos, gain) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, gain, reverb: 0.15 });
    for (let i = 0; i < 5; i++) a.noise(o, { t: t + i * 0.025 + Math.random() * 0.02, dur: 0.03, type: 'highpass', freq: 3500 + Math.random() * 3000, gain: 0.35 });
    a.tone(o, { t, dur: 0.18, type: 'sawtooth', freq: 140, freqEnd: 70, gain: 0.08 });
  }

  // Desenvainar: el "shiing" del acero y un trueno lejos.
  sndDraw() {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ gain: 0.7, reverb: 0.3 });
    a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 2500, freqEnd: 6000, q: 3, gain: 0.35, attack: 0.05 });
    a.tone(o, { t: t + 0.1, dur: 0.9, type: 'sine', freq: 2800, freqEnd: 2700, gain: 0.05 });
    a.tone(o, { t: t + 0.1, dur: 0.9, type: 'sine', freq: 4200, gain: 0.03 });
    this.g.later(0.3, () => a.thunder(null));
  }
}
