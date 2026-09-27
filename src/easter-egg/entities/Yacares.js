import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { soak } from './swim';

// Yacarés del Iberá: el bicho especial de Mate no Numa (el lugar de los
// carpinchos del molino y los pumas del castillo). Por dentro son "perros"
// (Zombies los trata igual: rondas, armas, puntos y online); acá se dibujan y
// se mueven: largos y bajos, el lomo con escudos, la trompa ancha con los
// dientes afuera y los ojos que brillan en el agua oscura (el reflejo naranja
// de las linternas en el estero). En el agua nadan rápido con la cola (las
// patas pegadas al cuerpo, apenas los ojos y el lomo afuera); en tierra van
// despacio, a los costados, meneando el cuerpo. Muerden tirándose adelante o
// dan un coletazo; al morir quedan panza arriba y se hunden.

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpA = new THREE.Matrix4();
const tmpB = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
// la cabeza, más grande que el cuello (la trompa ancha del yacaré overo)
const HEAD_S = new THREE.Matrix4().makeScale(1.35, 1.25, 1.02);

// las patas: (x, z) del hombro/cadera, y si es de adelante
const LEGS = [
  [0.17, 0.34, 1],
  [-0.17, 0.34, 1],
  [0.19, -0.3, 0],
  [-0.19, -0.3, 0],
];
// en tierra el cuerpo va a esta altura (la panza apenas arriba del barro)
const LAND_Y = 0.2;
// nadando, el lomo queda a ras del agua
const SWIM_Y = -0.1;
const TAIL = [0.42, 0.36, 0.3];
// ancho y alto de la cola (relativos al radio) en cada unión: ancha y chata al
// salir del cuerpo, alta y angosta hacia la punta
const TAIL_W = [1.5, 0.95, 0.8, 0.7];
const TAIL_H = [0.85, 1, 1, 1];
// hasta dónde se hunde (desde la superficie) y cuánto tarda en irse el cadáver
const SINK = 3.2;
export const YACARE_DEEP = 0.45;

export default class YacareRig {
  constructor(game, max) {
    this.g = game;
    this.max = max;
    this.sinks = true;
    const hide = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.05, vertexColors: true, map: scaleTex(), bumpMap: scaleTex(), bumpScale: 2.2 });
    const teeth = new THREE.MeshStandardMaterial({ color: 0xe9e2c8, roughness: 0.5 });
    const mouth = new THREE.MeshStandardMaterial({ color: 0xc98b7a, roughness: 0.8 });
    // el brillo de los ojos: sin tono ni luz (el bloom lo abre), naranja rojizo
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.42, 0.08).multiplyScalar(4.5), toneMapped: false });

    // el cuerpo: un huso ancho y aplastado (la panza clara, el lomo oscuro con
    // manchas) y las filas de escudos del lomo
    const prof = [[0, -0.62], [0.13, -0.58], [0.19, -0.44], [0.23, -0.22], [0.245, 0.02], [0.23, 0.26], [0.19, 0.44], [0.13, 0.56], [0, 0.62]];
    const rAt = (zz) => {
      for (let i = 1; i < prof.length; i++) if (zz <= prof[i][1]) return prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * (zz - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]);
      return 0;
    };
    const scutes = [];
    for (let i = 0; i < 9; i++) {
      const zz = -0.5 + i * 0.12;
      const r = rAt(zz);
      for (const sx of [-1, -0.33, 0.33, 1]) {
        const x = sx * r * 0.4;
        scutes.push(new THREE.BoxGeometry(0.03, 0.022, 0.065).rotateX(0.15).translate(x, 0.52 * r * Math.sqrt(1 - (x / r) ** 2) + 0.002, zz));
      }
    }
    const body = mergeGeometries([
      paint(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16).rotateX(Math.PI / 2).scale(1, 0.52, 1), hideFn),
      ...scutes.map((g) => paint(g, (p, n, c) => c.copy(DARK))),
    ]);
    // la cabeza (el pivote es la nuca): el cráneo con las órbitas en alto, la
    // trompa ancha y chata, la nariz en la punta y los dientes de arriba
    const upperTeeth = [];
    for (let i = 0; i < 9; i++) {
      for (const sx of [-1, 1]) upperTeeth.push(new THREE.ConeGeometry(0.009, 0.034, 4).rotateX(Math.PI).translate(sx * (0.078 - i * 0.004), -0.03, 0.1 + i * 0.036));
    }
    const head = mergeGeometries([
      paint(new THREE.BoxGeometry(0.22, 0.09, 0.2).translate(0, 0.02, 0.04), hideFn),
      paint(new THREE.CylinderGeometry(0.07, 0.1, 0.34, 10).rotateX(Math.PI / 2).scale(1.15, 0.45, 1).translate(0, 0.0, 0.3), hideFn),
      ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.042, 9, 7).scale(1, 0.8, 1.1).translate(s * 0.07, 0.075, 0.07), hideFn)),
      paint(new THREE.SphereGeometry(0.03, 8, 6).scale(1.4, 0.7, 1).translate(0, 0.03, 0.46), (p, n, c) => c.copy(DARK)),
    ]);
    const headTeeth = mergeGeometries(upperTeeth.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    }));
    // la mandíbula: gira en la nuca; por dentro rosada, con los dientes de abajo
    const lowerTeeth = [];
    for (let i = 0; i < 8; i++) {
      for (const sx of [-1, 1]) lowerTeeth.push(new THREE.ConeGeometry(0.008, 0.03, 4).translate(sx * (0.07 - i * 0.004), 0.02, 0.12 + i * 0.036));
    }
    // (medio cilindro: la mitad de abajo, la punta angosta adelante)
    const jaw = paint(new THREE.CylinderGeometry(0.06, 0.09, 0.44, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1.15, 0.4, 1).translate(0, 0, 0.25), (p, n, c) => {
      hideFn(p, n, c);
      if (n.y > 0.3) c.copy(PINK);
    });
    const jawTeeth = mergeGeometries(lowerTeeth);
    const inside = new THREE.PlaneGeometry(0.13, 0.36).rotateX(-Math.PI / 2).translate(0, 0.005, 0.26);
    // la cola: tres tramos que se afinan, altos y angostos, con la doble cresta
    const tails = TAIL.map((len, i) => {
      const r0 = [0.095, 0.072, 0.048][i];
      const r1 = [0.072, 0.048, 0.012][i];
      const crest = [];
      const n = Math.round(len / 0.07);
      for (let k = 0; k < n; k++) {
        const zz = -k * 0.07 - 0.035;
        const kk = (k + 0.5) / n;
        const r = r0 + (r1 - r0) * kk;
        const h = 0.012 + r * 0.22;
        const wk = TAIL_W[i] + (TAIL_W[i + 1] - TAIL_W[i]) * kk;
        const hk = TAIL_H[i] + (TAIL_H[i + 1] - TAIL_H[i]) * kk;
        // escamas en punta (un prisma de tres caras, inclinado hacia atrás)
        for (const sx of i < 2 ? [-1, 1] : [0]) crest.push(new THREE.ConeGeometry(0.014, h, 3).scale(0.7, 1, 1.8).rotateX(-0.35).translate(sx * r * 0.32 * wk, r * hk * 0.92 + h * 0.35, zz));
      }
      return mergeGeometries([
        paint(taper(new THREE.CylinderGeometry(r1, r0, len, 10).rotateX(Math.PI / 2).translate(0, 0, -len / 2), len, TAIL_W[i], TAIL_W[i + 1], TAIL_H[i], TAIL_H[i + 1]), hideFn),
        ...crest.map((g) => paint(g, (p, nn, c) => c.copy(DARK))),
        // la junta con el tramo de adelante (tapa el escalón cuando la cola ondula)
        ...(i ? [paint(new THREE.SphereGeometry(r0 * 1.04, 10, 6).scale(TAIL_W[i], TAIL_H[i], 0.9), hideFn)] : []),
      ]);
    });
    // las patas: el brazo corto que sale al costado, la pierna y la mano con los dedos abiertos
    const upper = paint(new THREE.CapsuleGeometry(0.045, 0.12, 3, 8).translate(0, -0.085, 0), hideFn);
    const lower = paint(new THREE.CapsuleGeometry(0.036, 0.1, 3, 8).translate(0, -0.07, 0), hideFn);
    const foot = mergeGeometries([
      paint(new THREE.SphereGeometry(0.045, 8, 6).scale(1.2, 0.45, 1.2).translate(0, -0.15, 0.02), hideFn),
      ...[-0.6, -0.2, 0.2, 0.6].map((a) => paint(new THREE.CapsuleGeometry(0.011, 0.06, 2, 5).rotateX(Math.PI / 2).rotateY(a).translate(Math.sin(a) * 0.045, -0.158, 0.04 + Math.cos(a) * 0.04), (p, n, c) => c.copy(DARK))),
    ]);
    const eye = new THREE.SphereGeometry(0.028, 8, 6);

    const mk = (geo, mat, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      game.scene.add(im);
      return im;
    };
    this.body = mk(body, hide, max);
    this.head = mk(head, hide, max);
    this.headTeeth = mk(headTeeth, teeth, max);
    this.jaw = mk(jaw, hide, max);
    this.jawTeeth = mk(jawTeeth, teeth, max);
    this.inside = mk(inside, mouth, max);
    this.tails = tails.map((g) => mk(g, hide, max));
    this.upper = mk(upper, hide, max * 4);
    this.lower = mk(lower, hide, max * 4);
    this.foot = mk(foot, hide, max * 4);
    this.eyes = mk(eye, this.eyeMat, max * 2);
    // cada uno con su tono: oliva, más negro (el yacaré negro) y más amarillento (el overo)
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      c.setHex([0xffffff, 0xb8bcae, 0xfff0c8, 0xd8dcc8][i % 4]);
      for (const im of [this.body, this.head, this.jaw, ...this.tails]) im.setColorAt(i, c);
      for (let k = 0; k < 4; k++) for (const im of [this.upper, this.lower, this.foot]) im.setColorAt(i * 4 + k, c);
    }
    this.all = [this.body, this.head, this.headTeeth, this.jaw, this.jawTeeth, this.inside, ...this.tails, this.upper, this.lower, this.foot, this.eyes];
    this.last = game.time;
  }

  hide(slot) {
    for (const im of [this.body, this.head, this.headTeeth, this.jaw, this.jawTeeth, this.inside, ...this.tails]) im.setMatrixAt(slot, ZERO);
    for (let k = 0; k < 4; k++) for (const im of [this.upper, this.lower, this.foot]) im.setMatrixAt(slot * 4 + k, ZERO);
    this.eyes.setMatrixAt(slot * 2, ZERO);
    this.eyes.setMatrixAt(slot * 2 + 1, ZERO);
  }

  // El tamaño y la velocidad de cada uno (la base: en el agua va a esto; en tierra, menos).
  onSpawn(z) {
    const r = Math.random;
    z.scale = 0.85 + r() * 0.35;
    z.speed = 5.2 + r() * 0.8;
    z.yph = r() * 10;
    z.swimK = 1;
  }

  // Dónde sale: del agua (más de medio metro), a 8-18 m de algún jugador y con camino hasta él.
  spot() {
    const g = this.g;
    const w = g.world;
    const targets = [g.player, ...(g.net ? [...g.net.remote.values()].filter((p) => !p.dead) : [])].filter((p) => p.alive !== false);
    if (!targets.length) targets.push(g.player);
    for (let i = 0; i < 60; i++) {
      const tp = targets[Math.floor(Math.random() * targets.length)];
      const a = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * 10;
      const x = tp.pos.x + Math.cos(a) * d;
      const z = tp.pos.z + Math.sin(a) * d;
      if (!w.inside(Math.floor(x), Math.floor(z)) || g.nav.blocked(Math.floor(x), Math.floor(z))) continue;
      if ((w.waterDepth(x, z) || 0) < 0.6) continue;
      if (!Number.isFinite(g.nav.distAt(x, z))) continue;
      return { x, z, y: w.floorAt(x, z) };
    }
    return null;
  }

  // Aparece: sale del agua (un chapoteo y el bufido).
  spawnFx(z) {
    const g = this.g;
    g.water?.splash?.(z.pos.x, z.pos.z, 0.7);
    this.voice(z, 'hiss');
  }

  // Qué tan rápido va según el agua que tiene: nadando, todo; vadeando, menos; en tierra, poco.
  waterSpeed(z) {
    const k = z.swimK || 0;
    const land = (z.wetD || 0) > 0.2 ? 0.7 : 0.45;
    return land + (0.95 - land) * k;
  }

  update(pool) {
    const g = this.g;
    const dt = Math.min(0.1, Math.max(0, g.time - this.last));
    this.last = g.time;
    const any = pool.some((z) => z.dog && z.active);
    if (!any && !this.on) return;
    this.on = any;
    for (const im of this.all) im.visible = any;
    for (const z of pool) {
      if (!z.dog || !z.active) {
        if (z.dogShown) {
          this.hide(z.slot);
          z.dogShown = false;
        }
        continue;
      }
      z.dogShown = true;
      this.pose(z, dt);
    }
    for (const im of this.all) im.instanceMatrix.needsUpdate = true;
  }

  pose(z, dt) {
    const g = this.g;
    // el agua que tiene debajo (swimK: 0 en tierra, 1 nadando)
    if (!z.dead) soak(g, z, g.time, YACARE_DEEP);
    const vx = z.pos.x - (z.lastX ?? z.pos.x);
    const vz = z.pos.z - (z.lastZ ?? z.pos.z);
    z.lastX = z.pos.x;
    z.lastZ = z.pos.z;
    const sp = dt > 0 ? Math.min(12, Math.hypot(vx, vz) / dt) : 0;
    z.dogSpeed = (z.dogSpeed || 0) + (sp - (z.dogSpeed || 0)) * Math.min(1, dt * 8);
    const sw = z.swimK || 0;
    const move = Math.min(1, z.dogSpeed / 3);
    z.yph = (z.yph || 0) + dt * (2 + z.dogSpeed * (sw > 0.5 ? 1.3 : 2.6));
    const ph = z.yph;
    const s = (z.scale || 1) * 1.05;
    // la altura: en tierra, sobre el barro; nadando, el lomo a ras del agua
    const surf = z.wetY ?? -Infinity;
    const landY = (z.baseY || 0) + LAND_Y * s;
    let y = sw > 0.01 && Number.isFinite(surf) ? landY + (Math.max(landY, surf + SWIM_Y * s) - landY) * sw : landY;
    let pitch = 0;
    let roll = 0;
    let yawB = 0;
    let fwd = 0;
    let headY = 0;
    let headP = 0;
    let jawA = 0.04 + Math.max(0, Math.sin(g.time * 0.7 + z.slot)) * 0.05;
    // el cuerpo ondula: en el agua la ola corre por la cola (nada con ella); en tierra menea al caminar
    const wave = sw * (0.12 + move * 0.3) + (1 - sw) * move * 0.16;
    const tailYaw = [0, 0, 0];
    for (let i = 0; i < 3; i++) tailYaw[i] = Math.sin(ph - 1 - i * 0.9) * wave * (1.2 + i * 0.6);
    yawB = Math.sin(ph) * wave * 0.35;
    headY = -yawB * 0.8;
    // las patas: en el agua pegadas atrás; en tierra, a los costados, en diagonal
    const legs = [];
    for (let k = 0; k < 4; k++) {
      const front = LEGS[k][2];
      const diag = k === 0 || k === 3 ? 0 : Math.PI;
      const f = ph + diag;
      const swing = Math.sin(f) * 0.55 * move;
      const lift = Math.max(0, Math.cos(f)) * 0.35 * move;
      legs.push({
        swing: swing * (1 - sw) + (front ? -1.25 : -1.45) * sw,
        splay: (1.3 - lift) * (1 - sw) + 0.35 * sw,
        // (la pierna: cuánto se abre del vertical, abajo del codo)
        knee: (front ? 0.22 : 0.3) * (1 - sw) + 0.4 * sw,
      });
    }
    if (z.state === 'dogspawn') {
      // saliendo del agua: sube desde abajo con la trompa arriba y la boca abierta
      const k = Math.min(1, z.stateT / 0.6);
      y -= (1 - k) * 0.8 * s;
      pitch = -0.35 * (1 - k);
      jawA = 0.6 * (1 - k) + 0.1;
    } else if (z.dead) {
      // panza arriba (rodando) y después se hunde
      const k = Math.min(1, z.stateT / 0.6);
      roll = k * Math.PI * (z.slot % 2 ? 1 : -1);
      jawA = 0.5;
      for (const l of legs) {
        l.swing = Math.sin(g.time * 9 + l.splay) * 0.3 * (1 - Math.min(1, z.stateT / 1.2));
        l.splay = 0.6;
      }
      for (let i = 0; i < 3; i++) tailYaw[i] = Math.sin(z.stateT * 6 - i) * 0.3 * Math.max(0, 1 - z.stateT);
      const sink = Math.max(0, z.stateT - 1.1);
      y -= sink * (Number.isFinite(surf) && surf > (z.baseY || 0) ? 0.45 : 0.08);
      y = Math.max((z.baseY || 0) - 0.4, y);
    } else if (z.state === 'attack') {
      const k = Math.min(1, (z.attackT || 0) / 0.95);
      if (z.id % 3 === 0) {
        // el coletazo: se tuerce para un lado y barre con la cola por delante
        const a = k < 0.35 ? k / 0.35 : k < 0.5 ? 1 - (k - 0.35) / 0.15 * 2 : -1 + (k - 0.5) / 0.5;
        yawB = a * 0.9;
        for (let i = 0; i < 3; i++) tailYaw[i] = -a * (0.5 + i * 0.25);
        headY = a * 0.4;
        jawA = 0.25;
      } else {
        // el tarascón: levanta la trompa abriendo grande, se tira adelante y cierra de golpe
        const up = k < 0.3 ? k / 0.3 : k < 0.44 ? 1 : Math.max(0, 1 - (k - 0.44) / 0.4);
        const lunge = k < 0.3 ? 0 : k < 0.44 ? (k - 0.3) / 0.14 : Math.max(0, 1 - (k - 0.44) / 0.5);
        headP = -0.45 * up + 0.2 * lunge;
        jawA = k < 0.41 ? 0.95 * up : 0.02;
        fwd = lunge * 0.5 * s;
        pitch = -0.15 * up;
        y += lunge * 0.08 * s * (1 - sw);
      }
    }
    // los ojos y el hocico quedan afuera aunque nade: la cabeza un poco arriba
    headP -= sw * 0.08;
    z.yacY = y;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    tmpE.set(pitch, z.yaw + yawB, roll, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpV.set(z.pos.x + fx * fwd, y, z.pos.z + fz * fwd);
    tmpM.compose(tmpV, tmpQ, tmpS.set(s, s, s));
    this.body.setMatrixAt(z.slot, tmpM);
    // la cabeza, en la nuca
    const H = local(tmpA, tmpM, 0, 0.02, 0.6, headP, headY, 0).multiply(HEAD_S);
    this.head.setMatrixAt(z.slot, H);
    this.headTeeth.setMatrixAt(z.slot, H);
    for (const sx of [-1, 1]) this.eyes.setMatrixAt(z.slot * 2 + (sx < 0 ? 0 : 1), local(tmpB, H, sx * 0.07, 0.1, 0.085, 0, 0, 0));
    const Jm = local(tmpB, H, 0, -0.025, 0, jawA, 0, 0);
    this.jaw.setMatrixAt(z.slot, Jm);
    this.jawTeeth.setMatrixAt(z.slot, Jm);
    this.inside.setMatrixAt(z.slot, Jm);
    // la cola, tramo por tramo
    let T = local(tmpA, tmpM, 0, -0.01, -0.52, 0, tailYaw[0], 0);
    for (let i = 0; i < 3; i++) {
      this.tails[i].setMatrixAt(z.slot, T);
      if (i < 2) T = local(tmpA, tmpB.copy(tmpA), 0, 0, -TAIL[i] + 0.02, 0, tailYaw[i + 1] - tailYaw[i] * 0.3, 0);
    }
    // las patas
    for (let k = 0; k < 4; k++) {
      const [lx, lz] = LEGS[k];
      const side = lx > 0 ? 1 : -1;
      const L = legs[k];
      const U = local(tmpA, tmpM, lx, -0.02, lz, 0, L.swing, side * L.splay);
      this.upper.setMatrixAt(z.slot * 4 + k, U);
      const Lw = local(tmpB, U, 0, -0.17, 0, 0, 0, side * (L.knee - L.splay));
      this.lower.setMatrixAt(z.slot * 4 + k, Lw);
      this.foot.setMatrixAt(z.slot * 4 + k, Lw);
    }
  }

  // La voz: 'hiss' (el bufido largo al salir), 'growl' (el bramido grave que
  // hace vibrar el agua), 'attack' (el golpe seco de la mandíbula), 'die' (gorgoteo).
  voice(z, kind) {
    const a = this.g.audio;
    if (!a?.out) return true;
    const pos = new THREE.Vector3(z.pos.x, (z.yacY ?? z.baseY ?? 0) + 0.2, z.pos.z);
    // el tarascón, grabado (core/sfxPack.js); si no bajó, el sintetizado
    if (kind === 'attack' && a.pack?.animal('yacare', 'attack', pos)) return true;
    const t = a.now;
    if (kind === 'hiss' || kind === 'cry') {
      const o = a.out({ pos, reverb: 0.35, gain: 0.5 });
      a.noise(o, { t, dur: 1.1, type: 'bandpass', freq: 3600, freqEnd: 2400, q: 0.9, gain: 0.55, attack: 0.08 });
      a.noise(o, { t: t + 0.05, dur: 0.9, type: 'highpass', freq: 5000, q: 0.7, gain: 0.2, attack: 0.1 });
    } else if (kind === 'growl') {
      // el bramido: muy grave, con un temblor (y un soplido encima)
      const o = a.out({ pos, reverb: 0.5, gain: 0.6 });
      const d = 0.9 + Math.random() * 0.5;
      for (let i = 0; i < 10; i++) a.tone(o, { t: t + (i * d) / 10, dur: d / 10 + 0.02, type: 'sawtooth', freq: 48 + Math.random() * 10, gain: 0.16 * Math.sin(((i + 0.5) / 10) * Math.PI), attack: 0.01 });
      a.noise(o, { t, dur: d, type: 'lowpass', freq: 260, q: 1.4, gain: 0.35, attack: 0.1, brown: true });
      a.noise(o, { t: t + d * 0.6, dur: 0.4, type: 'bandpass', freq: 3000, q: 1, gain: 0.12, attack: 0.05 });
    } else if (kind === 'attack') {
      // el golpe de la mandíbula: un clac seco y un golpe grave
      const o = a.out({ pos, reverb: 0.2, gain: 0.7 });
      a.noise(o, { t: t + 0.36, dur: 0.05, type: 'highpass', freq: 1800, q: 0.8, gain: 1 });
      a.tone(o, { t: t + 0.36, dur: 0.12, type: 'triangle', freq: 140, freqEnd: 60, gain: 0.35 });
      a.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 2800, q: 1.2, gain: 0.25, attack: 0.03 });
    } else {
      // al morir: un gorgoteo (burbujas) que se apaga
      const o = a.out({ pos, reverb: 0.4, gain: 0.5 });
      for (let i = 0; i < 7; i++) a.tone(o, { t: t + i * 0.09 + Math.random() * 0.04, dur: 0.07, type: 'sine', freq: 180 + Math.random() * 260, freqEnd: 420 + Math.random() * 300, gain: 0.12 });
      a.noise(o, { t, dur: 0.6, type: 'lowpass', freq: 400, q: 1, gain: 0.3, brown: true });
    }
    return true;
  }

  // Rayo contra el yacaré: la cabeza (con la trompa), el cuerpo y el arranque de la cola.
  static raycast(z, o, d, maxT) {
    if (z.state === 'dogspawn' && z.stateT < 0.3) return null;
    const s = (z.scale || 1) * 1.05;
    const fx = Math.sin(z.yaw);
    const fz = Math.cos(z.yaw);
    const y = z.yacY ?? (z.baseY || 0) + LAND_Y * s;
    const head = { x: z.pos.x + fx * 0.82 * s, y: y + 0.03 * s, z: z.pos.z + fz * 0.82 * s, r: 0.16 * s };
    const th = sphereHit(o, d, head, maxT);
    let best = th === null ? null : { t: th, zone: 'head' };
    for (const [k, r] of [[0.32, 0.22], [0, 0.25], [-0.34, 0.22], [-0.8, 0.14]]) {
      const c = { x: z.pos.x + fx * k * s, y, z: z.pos.z + fz * k * s, r: r * s };
      const t = sphereHit(o, d, c, maxT);
      if (t !== null && (!best || t < best.t)) best = { t, zone: 'torso' };
    }
    return best;
  }
}

// El cuero: oliva oscuro con manchas en el lomo, amarillento en los flancos y crema en la panza.
const OLIVE = new THREE.Color(0x4a4c33);
const BACK = new THREE.Color(0x2c2e1f);
const FLANK = new THREE.Color(0x8a8150);
const BELLY = new THREE.Color(0xd8cc9c);
const DARK = new THREE.Color(0x1d1f15);
const PINK = new THREE.Color(0xd79a86);
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function hideFn(p, n, c) {
  c.copy(OLIVE).lerp(BACK, sstep(0.3, 0.9, n.y) * 0.8).lerp(FLANK, sstep(0.2, -0.3, n.y) * 0.7).lerp(BELLY, sstep(-0.35, -0.8, n.y));
  // manchas oscuras en el lomo (un patrón fijo según la posición)
  if (n.y > 0.2 && Math.sin(p.z * 23 + Math.sin(p.x * 31) * 2) > 0.55) c.lerp(DARK, 0.5);
}

function taper(geo, len, w0, w1, h0, h1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, -pos.getZ(i) / len));
    pos.setX(i, pos.getX(i) * (w0 + (w1 - w0) * k));
    pos.setY(i, pos.getY(i) * (h0 + (h1 - h0) * k));
  }
  geo.computeVertexNormals();
  return geo;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, tmpC);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

// Las escamas: una grilla de placas redondeadas (sirve de color y de relieve).
let scaleCache = null;
function scaleTex() {
  if (scaleCache) return scaleCache;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#9a9a9a';
  x.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const ox = i * 16 + (j % 2) * 8;
      const oy = j * 16;
      const v = 200 + Math.floor(Math.random() * 45);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.beginPath();
      x.ellipse(ox + 8, oy + 8, 7, 6.5, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  scaleCache = t;
  return t;
}

const _loc = new THREE.Matrix4();
function local(out, base, x, y, z, rx, ry, rz) {
  tmpE.set(rx, ry, rz, 'YXZ');
  _loc.makeRotationFromEuler(tmpE).setPosition(x, y, z);
  return out.multiplyMatrices(base, _loc);
}

function sphereHit(o, d, c, maxT) {
  const ox = c.x - o.x;
  const oy = c.y - o.y;
  const oz = c.z - o.z;
  const t = ox * d.x + oy * d.y + oz * d.z;
  if (t < 0 || t > maxT) return null;
  const px = ox - d.x * t;
  const py = oy - d.y * t;
  const pz = oz - d.z * t;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > c.r * c.r) return null;
  return t - Math.sqrt(c.r * c.r - d2);
}
