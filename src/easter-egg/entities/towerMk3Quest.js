import * as THREE from 'three';
import { EE, TOWER } from '../config/map';
import { zombieHealth } from '../config/rules';
import { buildMate } from '../weapons/viewmodels';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { fireflies } from '../fx/Fireflies';
import { sides, SPIN, archSpans, depthIn, alongOf, sidePoint, inTower, sndArc, sndWindLoop } from './towerKit';

// Los Gemelos del Remolino: cómo se arma el Rayo Matero Mark III en la torre
// (modo historia; en el Challenge se compra en la pared). La pared de la cima
// no está más: en su lugar hay un pararrayos con dos cunas vacías.
//  · El mate de calabaza (el del rayo) está en la mesa de operaciones de la
//    enfermería (piso 12). Puesto en el pararrayos, la tormenta le pega tres
//    rayos seguidos (cada uno fulmina a los muertos de alrededor y lo carga
//    de verde). Mientras tanto, la Voz manda muertos volando a la cima.
//  · El porongo (el del remolino) está en el Galpón del Viento (piso 6). Se
//    tira al remolino desde cualquier arco: da cinco vueltas a la torre como
//    un cometa de oro (subiendo hasta arriba de la cima y bajando) y vuelve,
//    cargado, al mismo arco.
//  · Los dos en el pararrayos: se juntan, giran uno alrededor del otro, les
//    caen tres rayos más y se funden en el Mark III, que queda flotando en una
//    columna de luz. Cada uno agarra el suyo (el que no lo tiene).
// En línea: el anfitrión decide los pasos ('pee' mk3 con el estado; los rayos
// y la fusión, con su hora) y cada uno ve todo con su reloj.

// los rayos de la carga (s desde que se pone el mate)
const STRIKES = [3, 10.5, 18];
const CHARGED = 19.5;
// el vuelo del porongo: salir, cinco vueltas y volver
const OUT = 1.2;
const LAPS = 5;
const OMEGA = 0.75;
const LOOP = (LAPS * Math.PI * 2) / OMEGA;
const BACK = 1.5;
const RADIUS = 21;
const TOP_Y = 68;
// la fusión
const FUSE = 8;
const FUSE_BOLTS = [2.5, 3.6, 4.6];
const FUSE_BOOM = 6;
const GREEN = 0x9affb0;
const AMBER = 0xffb040;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const rnd = () => Math.random() - 0.5;
const bez = (a, c, b, k, out) => out.set((1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k * k * b.y, (1 - k) ** 2 * a.z + 2 * (1 - k) * k * c.z + k * k * b.z);

export default class TowerMk3Quest {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    // cal: 'shelf' | 'held' | 'rod' | 'charged'; por: 'shelf' | 'held' | 'orbit' | 'back' | 'held2' | 'rod'
    this.cal = 'shelf';
    this.por = 'shelf';
    // fuse: 0 todavía, 1 fundiéndose, 2 listo
    this.fuse = 0;
    this.chargeT = -1;
    this.fuseT = -1;
    this.orbit = null;
    this.flyT = 2;
    this.buildRod();
    this.buildMates();
    this.register();
  }

  // ---------------- lo que se ve ----------------
  mate(hand) {
    const m = buildMate('mk3', 0, this.g.textures, hand);
    m.mate.rotation.set(0, 0, 0);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(4.4);
    m.root.traverse((o) => {
      o.castShadow = false;
      o.frustumCulled = false;
      // (sin la mano del que lo sostiene: acá flota solo)
      if (o.userData?.hand) o.visible = false;
    });
    const info = m.mate.userData.mk3;
    const core = info?.coreMat;
    const base = core?.userData.base?.clone() || new THREE.Color(hand === 'L' ? 0x18ff48 : 0xff7a00);
    // (vacío: la cápsula apagada)
    core?.color.setHex(0x0c120c);
    const grp = new THREE.Group();
    grp.add(m.root);
    return { grp, core, base, k: 0 };
  }

  setCharge(M, k) {
    M.k = k;
    if (M.core) M.core.color.setHex(0x0c120c).lerp(M.base, Math.min(1, k)).multiplyScalar(1 + Math.max(0, k - 0.6) * 1.6);
  }

  // El pararrayos de la cima: una base de piedra, el palo de hierro con sus
  // aisladores, la corona de puntas, el cable de cobre que baja en espiral y
  // las dos cunas.
  buildRod() {
    const g = this.g;
    const M = g.world.M;
    const P = EE.pararrayos;
    const y = P.y;
    const a = g.world.wallAnchor(P.cell, P.face, 0);
    const nx = P.face[0];
    const nz = P.face[1];
    const bx = a.x + nx * 0.5;
    const bz = a.z + nz * 0.5;
    this.base = new THREE.Vector3(bx, y, bz);
    this.inward = new THREE.Vector3(nx, 0, nz);
    const grp = new THREE.Group();
    const stone = M.towerStone || M.stone;
    grp.add(mesh(boxGeo(0.95, 0.9, 1.3), stone, bx, y + 0.45, bz, 0, a.rot, 0));
    grp.add(mesh(boxGeo(1.05, 0.1, 1.4), stone, bx, y + 0.93, bz, 0, a.rot, 0));
    const px = bx - nx * 0.22;
    const pz = bz - nz * 0.22;
    grp.add(mesh(cylGeo(0.06, 0.08, 6.7, 10), M.iron, px, y + 0.98 + 3.35, pz));
    for (const h of [2.2, 4.1, 5.9]) grp.add(mesh(cylGeo(0.13, 0.13, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x5a8a70, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8 }), px, y + h, pz));
    // la corona
    const top = y + 7.7;
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.035, 0.7, 6), M.copper, px + Math.cos(ang) * 0.12, top + 0.1, pz + Math.sin(ang) * 0.12, Math.cos(ang) * 0.35, 0, -Math.sin(ang) * 0.35);
      grp.add(spike);
    }
    grp.add(mesh(new THREE.ConeGeometry(0.05, 1, 8), M.copper, px, top + 0.45, pz));
    this.tip = new THREE.Vector3(px, top + 0.9, pz);
    // las cunas: dos canastas de cobre, una a cada lado
    const lat = new THREE.Vector3(-nz, 0, nx);
    this.cradles = [-1, 1].map((s) => {
      const c = new THREE.Vector3(bx + nx * 0.18 + lat.x * s * 0.36, y + 1.02, bz + nz * 0.18 + lat.z * s * 0.36);
      grp.add(mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 18), M.copper, c.x, c.y + 0.06, c.z, Math.PI / 2, 0, 0));
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2;
        grp.add(mesh(cylGeo(0.012, 0.012, 0.16, 4), M.copper, c.x + Math.cos(ang) * 0.13, c.y + 0.0, c.z + Math.sin(ang) * 0.13, Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5));
      }
      return c;
    });
    // el cable: baja en espiral por el palo y se abre a las cunas
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const yy = top - 0.2 - (i / 30) * (top - y - 1.6);
      const ang = i * 0.95;
      pts.push(new THREE.Vector3(px + Math.cos(ang) * 0.1, yy, pz + Math.sin(ang) * 0.1));
    }
    this.cable = pts;
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.018, 5), M.copper));
    for (const c of this.cradles) {
      const end = pts[pts.length - 1];
      const mid = end.clone().lerp(c, 0.5).setY(end.y - 0.15);
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([end, mid, c.clone().setY(c.y + 0.02)]), 12, 0.016, 5), M.copper));
    }
    this.root.add(grp);
    g.world.addBox([bx - 0.5, y, bz - 0.7, bx + 0.5, y + 1, bz + 0.7], { kind: 'prop' });
    // el centro de la fusión (arriba y adelante de la base) y la columna de luz
    this.fusePos = new THREE.Vector3(bx + nx * 0.9, y + 2.2, bz + nz * 0.9);
    // (se apaga hacia arriba: no es un caño de luz hasta el cielo)
    const gc = document.createElement('canvas');
    gc.width = 4;
    gc.height = 128;
    const gx = gc.getContext('2d');
    const grd = gx.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#000');
    grd.addColorStop(0.75, '#555');
    grd.addColorStop(1, '#fff');
    gx.fillStyle = grd;
    gx.fillRect(0, 0, 4, 128);
    const colMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), color: 0xd8ffb0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 40, 18, 1, true), colMat);
    this.column.position.set(this.fusePos.x, y + 20, this.fusePos.z);
    this.column.visible = false;
    this.root.add(this.column);
    // la onda del rayo en el piso
    const wm = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), wm);
    this.wave.position.set(bx + nx * 0.8, y + 0.06, bz + nz * 0.8);
    this.wave.visible = false;
    this.root.add(this.wave);
    this.waveT = -1;
    // un brillo tenue en las cunas: ahí va algo
    this.cradleGlow = this.cradles.map((c, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: i ? AMBER : GREEN, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }));
      s.scale.setScalar(0.7);
      s.position.copy(c).setY(c.y + 0.15);
      this.root.add(s);
      return s;
    });
  }

  buildMates() {
    const g = this.g;
    // el del rayo, en la mesa de operaciones
    this.calM = this.mate('L');
    const C = EE.calabaza;
    this.calHome = new THREE.Vector3(C.pos[0], C.y, C.pos[1]);
    this.calM.grp.position.copy(this.calHome);
    this.calM.grp.rotation.set(0, 0, Math.PI / 2 - 0.2);
    this.root.add(this.calM.grp);
    this.calGlow = fireflies(g, GREEN, 1.2);
    this.calGlow.position.copy(this.calHome).setY(C.y + 0.3);
    this.root.add(this.calGlow);
    // el del remolino, en un cajón del galpón
    this.porM = this.mate('R');
    const P = EE.porongo;
    this.porHome = new THREE.Vector3(P.pos[0], P.y + 0.62, P.pos[1]);
    const crate = mesh(boxGeo(0.6, 0.6, 0.6), g.world.M.crate || g.world.M.wood, P.pos[0], P.y + 0.3, P.pos[1], 0, 0.3, 0);
    this.root.add(crate);
    g.world.addBox([P.pos[0] - 0.35, P.y, P.pos[1] - 0.35, P.pos[0] + 0.35, P.y + 0.6, P.pos[1] + 0.35], { kind: 'prop' });
    this.porM.grp.position.copy(this.porHome);
    this.root.add(this.porM.grp);
    this.porGlow = fireflies(g, AMBER, 1.2);
    this.porGlow.position.copy(this.porHome).setY(this.porHome.y + 0.2);
    this.root.add(this.porGlow);
    this.trailPrev = new THREE.Vector3();
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    I.add({
      kind: 'ee',
      pos: this.calHome.clone().setY(this.calHome.y + 0.2),
      radius: 2,
      prompt: () => (this.cal === 'shelf' ? { text: 'agarrar el mate de calabaza', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.cal !== 'shelf') return false;
        this.cal = 'held';
        this.tell('Mate de calabaza');
        this.sync();
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.porHome.clone(),
      radius: 2,
      prompt: () => (this.por === 'shelf' ? { text: 'agarrar el porongo', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.por !== 'shelf') return false;
        this.por = 'held';
        this.tell('Porongo del remolino');
        this.sync();
        return true;
      },
    });
    // tirarlo al remolino: sigue al arco más cercano del jugador
    this.throwIt = I.add({
      kind: 'ee',
      pos: new THREE.Vector3(0, -99, 0),
      radius: 1.9,
      prompt: () => (this.por === 'held' && this.archNear(g.player.pos) ? { text: 'tirar el porongo al remolino', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.por !== 'held') return false;
        const from = g.net?.useFrom;
        const pos = from != null && from !== g.net?.id ? g.net.remote.get(from)?.pos : g.player.pos;
        const A = pos && this.archNear(pos);
        if (!A) return false;
        this.startOrbit(A, 0);
        return true;
      },
    });
    // agarrarlo de vuelta
    this.backIt = I.add({
      kind: 'ee',
      pos: new THREE.Vector3(0, -99, 0),
      radius: 2.2,
      prompt: () => (this.por === 'back' ? { text: 'agarrar el Mate del Remolino', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.por !== 'back') return false;
        this.por = 'held2';
        this.orbit = null;
        this.tell('Mate del Remolino');
        this.sync();
        return true;
      },
    });
    // el pararrayos
    I.add({
      kind: 'ee',
      pos: this.base.clone().addScaledVector(this.inward, 0.7).setY(this.base.y + 1.2),
      radius: 2.3,
      prompt: () => {
        if (this.fuse) return null;
        if (this.cal === 'held') return { text: 'poner el mate de calabaza en el pararrayos', noCost: true };
        if (this.por === 'held2' && this.cal === 'charged') return { text: 'poner el Mate del Remolino', noCost: true };
        if (this.cal === 'rod') return null;
        if (this.por === 'held') return { text: 'Primero, al remolino', noCost: true, info: true };
        if (this.cal === 'charged' && this.por !== 'held2') return { text: 'Falta el otro mate', noCost: true, info: true };
        if (this.por === 'held2') return { text: 'Falta el mate de calabaza', noCost: true, info: true };
        return { text: 'Un pararrayos con dos cunas vacías', noCost: true, info: true };
      },
      cost: () => 0,
      use: () => {
        if (this.fuse) return false;
        if (this.cal === 'held') {
          this.cal = 'rod';
          this.startCharge(0);
          return true;
        }
        if (this.por === 'held2' && this.cal === 'charged') {
          this.por = 'rod';
          this.startFuse(0);
          return true;
        }
        return false;
      },
    });
    // el Mark III: cada uno el suyo
    I.add({
      kind: 'ee',
      local: true,
      pos: this.fusePos.clone(),
      radius: 2.6,
      prompt: () => (this.fuse === 2 && !g.weapons.has('mk3') ? { text: 'agarrar el Rayo Matero Mark III', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.fuse !== 2 || g.weapons.has('mk3')) return false;
        g.weapons.give('mk3');
        g.audio.powerupGrab();
        g.fx.sparkle(this.fusePos, [0.8, 1, 0.6], 40, 1.2);
        g.hud.toast('Rayo Matero Mark III');
        return true;
      },
    });
  }

  // Un aviso corto: qué es (adónde va lo dice la guía; el usuario,
  // 2026-10-08, sacó esos avisos).
  tell(name) {
    const g = this.g;
    g.hud.toast(name);
    g.audio.sting();
    g.net?.event('toast', { x: name });
  }

  // El arco donde está parado (x, z en su piso), o null.
  archNear(p) {
    if (!inTower(p.x, p.z)) return null;
    const fy = this.T.yOf(this.T.levelOf(p.y));
    for (let s = 0; s < 4; s++) {
      if (depthIn(s, p.x, p.z) > 1.6) continue;
      const a = alongOf(s, p.x, p.z);
      const sp = archSpans().find(([a0, a1]) => a > a0 + 0.25 && a < a1 - 0.25);
      if (sp) return { s, a: Math.max(sp[0] + 0.8, Math.min(sp[1] - 0.8, a)), fy };
    }
    return null;
  }

  // ---------------- el rayo ----------------
  // (todas las compus) Arranca la carga del mate de calabaza. `ago`: hace cuánto.
  startCharge(ago) {
    const g = this.g;
    this.chargeT = ago;
    this.strikesDone = STRIKES.filter((t) => t < ago).length;
    this.calM.grp.position.copy(this.cradles[0]).setY(this.cradles[0].y + 0.05);
    this.calM.grp.rotation.set(0, 0, 0);
    this.hum?.stop(0.2);
    this.hum = sndWindLoop(g, this.tip, 0.35, { whistle: 2600 });
    if (!g.net?.guest) {
      this.ee.say('entidad', '¿Jugando con mi tormenta?', 1);
      g.net?.event('pee', { mk3: this.state(), mk3c: 0 });
    }
  }

  // Un rayo al pararrayos (todas las compus): `small` en la fusión.
  strike(small = false) {
    const g = this.g;
    const tip = this.tip;
    const sky = tip.clone().add(tmpV.set(rnd() * 14, 55, rnd() * 14));
    for (let k = 0; k < (small ? 1 : 2); k++) g.fx.lightning(sky, tip, 0xd8ffe0, small ? 0.3 : 0.55);
    // ramas
    for (let k = 0; k < (small ? 1 : 3); k++) {
      const from = sky.clone().lerp(tip, 0.2 + Math.random() * 0.5);
      g.fx.lightning(from, from.clone().add(tmpV.set(rnd() * 12, -6 - Math.random() * 8, rnd() * 12)), 0xb8ffc8, 0.35);
    }
    if (g.weather) g.weather.flash = small ? 0.8 : 1.3;
    g.post?.flash(small ? 0.3 : 0.65);
    g.fx.flash(tip, 0xc8ffd0, small ? 40 : 70, 0.45, 30);
    g.audio.thunder?.(tip, !small);
    const d = g.player.pos.distanceTo(tip);
    g.fx.addShake(Math.max(0, 0.9 - d / 40));
    // baja por el cable hasta la cuna
    const C = this.cable;
    for (let k = 0; k < 6; k++) {
      g.later(0.04 + k * 0.05, () => g.fx.lightning(C[k * 5], C[Math.min(C.length - 1, k * 5 + 5)], GREEN, 0.2));
    }
    g.later(0.36, () => {
      for (const c of this.cradles) g.fx.electric(c.clone().setY(c.y + 0.2), small ? 12 : 26);
      g.fx.flash(this.cradles[0], 0x80ff90, 30, 0.35, 10);
      sndArc(g, this.cradles[0], 0.8);
      if (!small) this.shock(7.5);
    });
  }

  // La onda del rayo por el piso de la cima (el anfitrión fulmina a los de alrededor).
  shock(r) {
    const g = this.g;
    this.waveT = 0;
    this.waveR = r;
    this.wave.visible = true;
    if (g.net?.guest) return;
    const c = this.wave.position;
    for (const { z } of g.zombies.inRadius(c, r)) {
      if (z.boss || z.dead || Math.abs((z.baseY || 0) - this.base.y) > 1.5) continue;
      g.zombies.damage(z, 1e9, { type: 'chain', point: new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.1, z.pos.z) });
    }
  }

  // ---------------- el remolino ----------------
  // (todas las compus) El porongo sale por el arco A. `ago`: hace cuánto.
  startOrbit(A, ago) {
    const g = this.g;
    this.por = 'orbit';
    const exit = sidePoint(A.s, A.a, -1.2, A.fy + 1.4);
    const inner = sidePoint(A.s, A.a, 0.9, A.fy + 1.3);
    const th0 = Math.atan2(exit.z - TOWER.cz, exit.x - TOWER.cx);
    const start = new THREE.Vector3(TOWER.cx + Math.cos(th0) * RADIUS, A.fy + 2, TOWER.cz + Math.sin(th0) * RADIUS);
    const S = sides()[A.s];
    const ctrl = exit.clone().add(tmpV.set(-S.n[0] * 3, 1.2, -S.n[1] * 3));
    this.orbit = { A, t: ago, th0, inner, ctrl, start, fy: A.fy };
    this.porM.grp.position.copy(inner);
    this.trailPrev.copy(inner);
    this.backIt.pos.copy(inner);
    g.audio.whoosh(inner);
    if (!g.net?.guest) {
      g.net?.event('pee', { mk3: this.state(), mk3o: [A.s, +A.a.toFixed(2), A.fy, 0] });
      this.ee.say('fierro', 'Eso... que el viento lo cargue.', 1.2);
    }
  }

  // Dónde está el porongo a los t segundos de tirado.
  orbitAt(t, out) {
    const O = this.orbit;
    if (t < OUT) return bez(O.inner, O.ctrl, O.start, t / OUT, out);
    if (t < OUT + LOOP) {
      const u = (t - OUT) / LOOP;
      const ang = O.th0 + SPIN * OMEGA * (t - OUT);
      return out.set(TOWER.cx + Math.cos(ang) * RADIUS, O.fy + 2 + (TOP_Y - O.fy - 2) * Math.sin(Math.PI * u), TOWER.cz + Math.sin(ang) * RADIUS);
    }
    const k = Math.min(1, (t - OUT - LOOP) / BACK);
    return bez(O.start, O.ctrl, O.inner, k, out);
  }

  // ---------------- la fusión ----------------
  startFuse(ago) {
    const g = this.g;
    this.fuse = 1;
    this.fuseT = ago;
    this.porM.grp.position.copy(this.cradles[1]).setY(this.cradles[1].y + 0.05);
    this.fusePhi = 0;
    this.hum?.stop(0.2);
    this.hum = sndWindLoop(g, this.fusePos, 0.6, { whistle: 900 });
    if (!g.net?.guest) g.net?.event('pee', { mk3: this.state(), mk3f: 0 });
  }

  // ---------------- red ----------------
  state() {
    return { c: this.cal, p: this.por, f: this.fuse };
  }

  sync() {
    this.g.net?.event('pee', { mk3: this.state() });
  }

  fullState() {
    return { ...this.state(), ct: this.chargeT, ft: this.fuseT, o: this.orbit ? [this.orbit.A.s, this.orbit.A.a, this.orbit.A.fy, +this.orbit.t.toFixed(2)] : null };
  }

  applyRemote(m) {
    const S = m.mk3;
    if (m.mk3c != null && this.cal !== 'rod') this.startCharge(m.mk3c);
    if (m.mk3o) this.startOrbit({ s: m.mk3o[0], a: m.mk3o[1], fy: m.mk3o[2] }, m.mk3o[3] || 0);
    if (m.mk3f != null && !this.fuse) this.startFuse(m.mk3f);
    if (S) {
      // (la carga terminó en el anfitrión)
      if (S.c === 'charged' && this.cal === 'rod') {
        this.chargeT = -1;
        this.hum?.stop(1.5);
        this.hum = null;
      }
      this.cal = S.c;
      if (S.p !== 'orbit' || this.orbit) this.por = S.p;
      if (S.f === 2 && this.fuse !== 2) this.finishFuse(true);
      this.fuse = S.f;
    }
  }

  // (el que entra tarde)
  applyState(s) {
    if (!s) return;
    if (s.c === 'rod' && s.ct >= 0) this.startCharge(s.ct);
    if (s.o) this.startOrbit({ s: s.o[0], a: s.o[1], fy: s.o[2] }, s.o[3]);
    if (s.f === 1 && s.ft >= 0) this.startFuse(s.ft);
    this.applyRemote({ mk3: s });
  }

  inv() {
    return { calabaza: this.cal === 'held', porongo: this.por === 'held' || this.por === 'held2' };
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    const host = !g.net?.guest;
    // en su lugar
    const calHome = this.cal === 'shelf';
    this.calGlow.visible = calHome;
    this.calM.grp.visible = calHome || this.cal === 'rod' || this.cal === 'charged';
    if (calHome) this.calM.grp.rotation.y = Math.sin(t * 0.5) * 0.1;
    const porHome = this.por === 'shelf';
    this.porGlow.visible = porHome || this.por === 'back';
    this.porM.grp.visible = porHome || this.por === 'orbit' || this.por === 'back' || this.por === 'rod';
    if (porHome) this.porM.grp.rotation.y = t * 0.4;
    // las cunas brillan mientras están vacías
    this.cradleGlow[0].material.opacity = this.cal === 'rod' || this.cal === 'charged' ? 0 : 0.2 + Math.sin(t * 2.5) * 0.12;
    this.cradleGlow[1].material.opacity = this.por === 'rod' ? 0 : 0.2 + Math.sin(t * 2.5 + 1) * 0.12;
    // el arco más cercano, para tirar el porongo
    if (this.por === 'held') {
      const A = this.archNear(g.player.pos);
      if (A) sidePoint(A.s, A.a, 0.6, A.fy + 1.2, this.throwIt.pos);
      else this.throwIt.pos.set(0, -99, 0);
    } else this.throwIt.pos.set(0, -99, 0);
    // chispitas en la corona del pararrayos
    if (Math.random() < dt * (this.cal === 'rod' ? 6 : 0.6)) {
      g.fx.lightning(this.tip, this.tip.clone().add(tmpV.set(rnd() * 0.8, -0.3 - Math.random() * 0.8, rnd() * 0.8)), GREEN, 0.1);
    }
    this.updateCharge(dt, host);
    this.updateOrbit(dt, host);
    this.updateFuse(dt, host);
    // la onda en el piso
    if (this.waveT >= 0) {
      this.waveT += dt;
      const k = this.waveT / 0.55;
      this.wave.scale.setScalar(0.3 + k * this.waveR);
      this.wave.material.opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) {
        this.waveT = -1;
        this.wave.visible = false;
      }
    }
    if (this.fuse === 2) this.updateMk3(dt, t);
  }

  updateCharge(dt, host) {
    const g = this.g;
    if (this.cal !== 'rod' || this.chargeT < 0) return;
    this.chargeT += dt;
    const T0 = this.chargeT;
    while (this.strikesDone < STRIKES.length && T0 >= STRIKES[this.strikesDone]) {
      this.strikesDone++;
      this.strike();
    }
    this.setCharge(this.calM, this.strikesDone / STRIKES.length);
    // el mate tiembla y chisporrotea
    const c = this.cradles[0];
    this.calM.grp.position.set(c.x + rnd() * 0.01 * this.strikesDone, c.y + 0.05 + (this.strikesDone ? 0.04 + Math.sin(g.time * 6) * 0.02 : 0), c.z + rnd() * 0.01 * this.strikesDone);
    if (Math.random() < 0.15 * this.strikesDone) g.fx.electric(c.clone().setY(c.y + 0.3), 2);
    // la Voz manda muertos volando a la cima
    if (host) {
      this.flyT -= dt;
      if (this.flyT <= 0) {
        this.flyT = 2.6 / Math.sqrt(this.ee.players());
        const round = Math.max(6, g.rounds.round);
        this.ee.flyers.bring(this.base.y, this.base, round, zombieHealth(round));
      }
      if (T0 >= CHARGED) {
        this.cal = 'charged';
        this.chargeT = -1;
        this.hum?.stop(1.5);
        this.hum = null;
        this.ee.toastAll('El Mate del Rayo está cargado');
        this.sync();
      }
    }
  }

  updateOrbit(dt, host) {
    const g = this.g;
    if (!this.orbit) return;
    const O = this.orbit;
    if (this.por === 'back') {
      // de vuelta en el arco: flota, gira y brilla
      const p = O.inner;
      this.porM.grp.position.set(p.x, p.y + Math.sin(g.time * 2) * 0.06, p.z);
      this.porM.grp.rotation.y += dt * 1.5;
      this.porGlow.position.copy(this.porM.grp.position);
      this.setCharge(this.porM, 1);
      return;
    }
    if (this.por !== 'orbit') return;
    O.t += dt;
    const pos = this.orbitAt(O.t, tmpW);
    this.porM.grp.position.copy(pos);
    this.porM.grp.rotation.y += dt * 14;
    this.porM.grp.rotation.z = Math.sin(O.t * 3) * 0.5;
    const u = Math.min(1, Math.max(0, (O.t - OUT) / LOOP));
    this.setCharge(this.porM, u);
    // la estela de oro: un trazo que se apaga y chispas
    g.fx.beam(this.trailPrev, pos, { color: AMBER, width: 0.1, life: 0.45 });
    for (let k = 0; k < 2; k++) g.fx.add.spawn(pos.x + rnd() * 0.3, pos.y + rnd() * 0.3, pos.z + rnd() * 0.3, rnd(), rnd(), rnd(), { color: [1, 0.72, 0.25], size: 0.28, size1: 0, life: 0.9 });
    this.trailPrev.copy(pos);
    // pasa zumbando cerca de alguno
    const d = g.player.pos.distanceTo(pos);
    if (d < 9 && g.time > (this.whooshT || 0)) {
      this.whooshT = g.time + 2;
      g.audio.whoosh(pos.clone());
    }
    if (O.t >= OUT + LOOP + BACK) {
      this.porM.grp.position.copy(O.inner);
      if (host) {
        this.por = 'back';
        this.ee.toastAll('Volvió el porongo del remolino');
        this.sync();
      } else this.por = 'back';
      g.fx.sparkle(O.inner, [1, 0.8, 0.35], 40, 1);
      g.audio.powerupGrab();
    }
  }

  updateFuse(dt, host) {
    const g = this.g;
    if (this.fuse !== 1 || this.fuseT < 0) return;
    const prev = this.fuseT;
    this.fuseT += dt;
    const T0 = this.fuseT;
    const C = this.fusePos;
    const k = Math.min(1, T0 / FUSE_BOOM);
    // suben y giran uno alrededor del otro, cada vez más rápido
    this.fusePhi += dt * (2 + k * k * 22);
    const up = Math.min(1, T0 / 1.5);
    const r = 0.55 * (1 - k * 0.6);
    const mates = [this.calM, this.porM];
    mates.forEach((M, i) => {
      const home = this.cradles[i];
      const ang = this.fusePhi + i * Math.PI;
      tmpV.set(C.x + Math.cos(ang) * r, C.y + Math.sin(T0 * 3 + i) * 0.1, C.z + Math.sin(ang) * r);
      M.grp.position.lerpVectors(home, tmpV, up * up * (3 - 2 * up));
      M.grp.rotation.y += dt * (4 + k * 20);
      this.setCharge(M, 1 + k * 0.6);
    });
    // el embudo: viento de oro que se cierra sobre ellos y arcos verdes entre los dos
    for (let n = 0; n < 5; n++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 0.6 + (1 - k) * 3.2 + Math.random() * 0.8;
      const y = C.y - 1.6 + Math.random() * 3.4;
      g.fx.add.spawn(C.x + Math.cos(a) * rr, y, C.z + Math.sin(a) * rr, -Math.sin(a) * rr * 2.2 * SPIN - Math.cos(a) * 1.5, (C.y - y) * 0.8, Math.cos(a) * rr * 2.2 * SPIN - Math.sin(a) * 1.5, { color: n % 2 ? [1, 0.75, 0.3] : [0.6, 1, 0.65], size: 0.12, size1: 0, life: 0.7, attract: C });
    }
    if (Math.random() < dt * (5 + k * 20)) g.fx.lightning(this.calM.grp.position, this.porM.grp.position, GREEN, 0.12);
    for (const bt of FUSE_BOLTS) if (prev < bt && T0 >= bt) this.strike(true);
    if (prev < FUSE_BOOM && T0 >= FUSE_BOOM) {
      // se funden
      g.post?.flash(1);
      g.fx.flash(C, 0xffffff, 90, 0.8, 30);
      g.fx.explosion(C, 3, [0.8, 1, 0.6]);
      g.fx.sparkle(C, [1, 0.9, 0.5], 90, 2.5);
      g.audio.thunder?.(C, true);
      g.fx.addShake(0.8);
      this.shock(12);
      this.hum?.stop(0.6);
      this.hum = null;
    }
    if (T0 >= FUSE && host) {
      this.finishFuse(false);
      this.sync();
    }
  }

  // Queda el Mark III flotando (todas las compus).
  finishFuse(quiet) {
    const g = this.g;
    this.fuse = 2;
    this.fuseT = -1;
    this.cal = 'charged';
    this.por = 'rod';
    this.column.visible = true;
    this.setCharge(this.calM, 1.3);
    this.setCharge(this.porM, 1.3);
    if (!quiet || g.net?.guest) {
      g.hud.achievement('Rayo Matero Mark III', 'Los gemelos del remolino');
      g.audio.fanfare?.();
    }
    if (!g.net?.guest) this.ee.say('fierro', 'El Rayo Matero... úsenlo bien, paisanos.', 1.5);
  }

  updateMk3(dt, t) {
    const C = this.fusePos;
    // los dos mates, uno al lado del otro, girando despacio
    const yaw = t * 0.6;
    [this.calM, this.porM].forEach((M, i) => {
      const s = i ? 1 : -1;
      M.grp.position.set(C.x + Math.cos(yaw) * 0.32 * s, C.y + Math.sin(t * 1.5 + i) * 0.05, C.z + Math.sin(yaw) * 0.32 * s);
      M.grp.rotation.set(0, -yaw + (i ? 0.3 : -0.3), 0);
    });
    this.column.material.opacity = 0.1 + Math.sin(t * 2) * 0.03;
    if (Math.random() < dt * 3) this.g.fx.lightning(this.calM.grp.position, this.porM.grp.position, GREEN, 0.1);
    if (Math.random() < 0.3) this.g.fx.add.spawn(C.x + rnd() * 0.8, C.y - 1 + Math.random() * 0.5, C.z + rnd() * 0.8, 0, 1 + Math.random(), 0, { color: [0.85, 1, 0.6], size: 0.08, size1: 0, life: 1.4 });
  }

  // (Alt+K) Todo listo.
  debug() {
    this.cal = 'charged';
    this.por = 'rod';
    this.finishFuse(true);
  }

  dispose() {
    this.hum?.stop(0.2);
    this.root.removeFromParent();
  }
}
