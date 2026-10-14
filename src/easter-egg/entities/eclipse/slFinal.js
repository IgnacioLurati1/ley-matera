import * as THREE from 'three';
import { toWorld, hLoc, YAW } from '../../world/eclipse/sanlorenzoCampo';
import { zombieHealth } from '../../config/rules';
import { buildFacon } from '../../ui/eclipseCineSets';
import { eclSfx } from '../../fx/eclipseSfx';
import FinEclipseBlend, { finBlendOn, preloadFinEclipse } from '../../ui/finEclipseBlend';

// El final nuevo de San Lorenzo (el usuario, 2026-10-12; plan aprobado esa
// noche): rota la corona, todos van a Belgrano; un encierro de 30 s; una onda
// los mata a todos; las guadañas vuelan y se funden en el súper facón (el
// Facón Relámpago de Mate no Numa, más grande) mientras los cuatro caballeros
// le tiran sus mates; el Gil lo toma, la luz lo sube al pie de una rampa de
// piso arrancado que se arma delante de él mientras corre, y los demás lo
// cuidan desde abajo. Después sigue la cinemática (Blender: fin-eclipse; en
// gris, esperando el sí). La canción nueva (final-eclipse) arranca con la
// corona rota y su final abrupto (69,4 s) cae en el salto.
// A MEDIAS (2026-10-13): apagado; globalThis.__mduSlFinal = true lo prende.
// Falta: los caballeros de verdad (cupula.js; acá, rayos de color), los
// jinetes delante del Gil, la cinemática nueva (acá sigue el blanco de hoy) y
// probarlo en línea.
export const finOn = () => globalThis.__mduSlFinal === true;

// la hora de cada cosa, desde la corona rota (= el segundo de la canción)
const T_RING = 16.75;
const T_ONDA = 46.75;
const T_FORJA = 47.5;
const T_KNIGHT0 = 49;
const T_KNIGHT1 = 59;
const T_FACON = 60.5;
const T_RUN = 62.6;
const T_CINE = 67.4;
const T_END = 69.4;
// Belgrano y su encierro; la rampa (u del campo) y la carrera
const BEL = [8.5, 3.5];
const RING_R = 11;
const RUN_V = 6.4;
const U_CINE = 20.5;
const U0 = U_CINE - RUN_V * (T_CINE - T_RUN);
const U_FLAT = 27.5;
const U1 = 30;
const Y0 = 16;
const Y1 = 25;
const rampY = (u) => (u >= U_FLAT ? Y1 : Y0 + (Y1 - Y0) * Math.max(0, u - U0) / (U_FLAT - U0));
const KCOL = [0xff6a20, 0x8affd8, 0xfff27a, 0x8cc8ff];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default class SlFinal {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    this.root = new THREE.Group();
    this.root.name = 'slFinal';
    this.g.scene.add(this.root);
    this.t0 = 0;
    this.on = false;
    this.done = {};
    this.noSpawn = false;
    // (fase 3: la cinemática de Blender aprobada en gris, ui/finEclipseBlend; se baja desde ya)
    if (finBlendOn()) preloadFinEclipse().then((D) => (this.blendD = D));
  }

  bel(y = 0) {
    return toWorld(BEL[0], BEL[1], hLoc(BEL[0], BEL[1]) + y, new THREE.Vector3());
  }

  // (todas) Arranca con la corona rota; late: segundos que ya pasaron (el que entra tarde).
  start(late = 0) {
    this.on = true;
    this.t0 = performance.now() / 1000 - late;
    const g = this.g;
    g.music?.play('final-eclipse', { at: Math.max(0, late), fadeIn: 0.2 });
    g.hud?.subtitle?.('¡A Belgrano!', 4);
    this.buildRing();
    this.buildRamp();
  }

  isGil() {
    const ee = this.sl.ee;
    return !this.g.net || !ee?.isGil || ee.isGil() || !ee.roles?.size;
  }

  once(k, t, fn) {
    if (this.done[k] || this.t < t) return;
    this.done[k] = true;
    fn();
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    this.t = performance.now() / 1000 - this.t0;
    const t = this.t;
    // la marca de Belgrano (late) y el anillo que se cierra
    if (this.beacon) this.beacon.material.opacity = t < T_RING ? 0.35 + 0.15 * Math.sin(t * 4) : Math.max(0, this.beacon.material.opacity - dt * 0.5);
    this.once('ring', T_RING, () => this.closeRing());
    if (this.ring) {
      const k = THREE.MathUtils.clamp((t - T_RING) / 0.8, 0, 1) * (t < T_ONDA ? 1 : Math.max(0, 1 - (t - T_ONDA) / 0.6));
      this.ring.scale.set(1, Math.max(0.001, k), 1);
      this.ring.material.opacity = 0.22 * k;
      this.ring.rotation.y += dt * 0.4;
      if (t >= T_RING && t < T_ONDA) this.keepInside();
    }
    // los muertos: encierro, nada después de la onda, vuelven con la carrera
    if (this.sl.host && !this.noSpawn && t >= T_RING && t < T_ONDA) this.horde(dt, 1);
    if (this.sl.host && t >= T_RUN + 1.4 && t < T_END) this.horde(dt, 0.8);
    this.once('onda', T_ONDA, () => this.onda());
    this.forge(t, dt);
    this.once('facon', T_FACON, () => this.faconReady());
    this.carry(t);
    this.ramp(t, dt);
    // (fase 3) la cinemática arranca cuando el Gil llega a u 20,5 de la rampa (el primer cuadro de la de
    // Blender); el final de hoy sigue cuando ella termina
    if (finBlendOn()) this.once('blend', T_CINE, () => this.startBlend());
    this.once('cine', T_END, () => this.end());
  }

  // ---------------- Belgrano y el encierro ----------------
  buildRing() {
    const c = this.bel();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(c).add(new THREE.Vector3(0, 30, 0));
    this.root.add(m);
    this.beacon = m;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, 4, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x9a50ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    r.geometry.translate(0, 2, 0);
    r.position.copy(c);
    r.scale.set(1, 0.001, 1);
    this.root.add(r);
    this.ring = r;
  }

  // (todas) Se cierra: al que quedó afuera lo trae la luz.
  closeRing() {
    const g = this.g;
    g.post?.flash?.(0.25);
    const P = g.player;
    const c = this.bel();
    if (P.alive && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > RING_R - 1) {
      const a = Math.random() * Math.PI * 2;
      P.pos.set(c.x + Math.cos(a) * 6, c.y, c.z + Math.sin(a) * 6);
      P.vel?.set?.(0, 0, 0);
    }
  }

  // (cada uno el suyo) Nadie sale del anillo.
  keepInside() {
    const P = this.g.player;
    const c = this.bel();
    const dx = P.pos.x - c.x;
    const dz = P.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const R = RING_R - 0.6;
    if (d > R) {
      P.pos.x = c.x + (dx / d) * R;
      P.pos.z = c.z + (dz / d) * R;
    }
  }

  // (anfitrión) Los muertos salen del pasto alrededor del anillo.
  horde(dt, k) {
    const g = this.g;
    this.spawnT = (this.spawnT || 0) - dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.35 / k;
    const n = g.net ? 1 + g.net.remote.size : 1;
    if (g.zombies.alive >= Math.round((30 + 6 * (n - 1)) * k)) return;
    const round = Math.max(8, g.rounds?.round || 12);
    const a = Math.random() * Math.PI * 2;
    const r = RING_R + 2 + Math.random() * 9;
    const at = toWorld(BEL[0] + Math.cos(a) * r, BEL[1] + Math.sin(a) * r, null, new THREE.Vector3());
    g.zombies.spawn(round, zombieHealth(round), at);
  }

  // ---------------- la onda ----------------
  onda() {
    const g = this.g;
    const c = this.bel(1);
    g.post?.flash?.(0.7);
    g.shake?.(0.6);
    if (this.sl.host) {
      for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
    }
    const P = g.player;
    if (P.downed || !P.alive) P.revive?.();
    // el anillo de la onda, que se va abriendo
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    w.rotation.x = Math.PI / 2;
    w.position.copy(c);
    this.root.add(w);
    this.wave = { m: w, t: 0 };
    eclSfx(g).play('furia-fin', { gain: 1 });
  }

  // ---------------- la forja ----------------
  buildForge() {
    const F = new THREE.Group();
    this.root.add(F);
    this.forjaG = F;
    const blade = new THREE.MeshStandardMaterial({ color: 0x2a1840, emissive: 0x9a50ff, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide });
    const pole = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.8 });
    this.scythes = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Group();
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 4, 20, Math.PI * 0.85), blade);
      b.scale.set(1, 1, 0.3);
      b.position.set(0, 1.0, 0);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), pole);
      s.add(b, h);
      F.add(s);
      this.scythes.push(s);
    }
    this.beams = KCOL.map((col) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.root.add(m);
      return m;
    });
    this.pillars = KCOL.map((col) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.root.add(m);
      return m;
    });
  }

  forge(t, dt) {
    if (t < T_FORJA || t > T_RUN + 1) {
      if (this.forjaG && t > T_RUN + 1) this.forjaG.visible = false;
      return;
    }
    if (!this.forjaG) this.buildForge();
    const C = this.bel(9);
    const k = THREE.MathUtils.clamp((t - T_FORJA) / (T_FACON - T_FORJA), 0, 1);
    // las cuatro guadañas: salen del medio del anillo y dan vueltas en espiral, cada vez más juntas y rápido
    this.scythes.forEach((s, i) => {
      const rise = THREE.MathUtils.clamp((t - T_FORJA) / 2.2, 0, 1);
      const r = 6.5 * (1 - k * k) * rise + 0.05;
      const a = i * (Math.PI / 2) + k * k * 14 + t * 0.6;
      s.position.set(C.x + Math.cos(a) * r, C.y - (1 - rise) * 8, C.z + Math.sin(a) * r);
      s.rotation.set(0.4, a * 2.2, t * (3 + k * 12));
      s.visible = t < T_FACON;
    });
    // los cuatro caballeros (por ahora: sus columnas de luz y los rayos de sus mates al nudo)
    const on = t >= T_KNIGHT0 && t < T_KNIGHT1 + 1.2;
    const kk = on ? Math.min(1, (t - T_KNIGHT0) / 1.2) * Math.min(1, (T_KNIGHT1 + 1.2 - t) / 1.2) : 0;
    this.pillars.forEach((p, i) => {
      const a = i * (Math.PI / 2) + 0.4;
      const at = toWorld(BEL[0] + Math.cos(a) * 14, BEL[1] + Math.sin(a) * 14, null, new THREE.Vector3());
      p.position.copy(at).add(new THREE.Vector3(0, 20, 0));
      p.material.opacity = 0.35 * kk;
      const b = this.beams[i];
      const from = at.clone().add(new THREE.Vector3(0, 1.6, 0));
      const d = C.clone().sub(from);
      b.position.copy(from).addScaledVector(d, 0.5);
      b.scale.set(1 + 0.3 * Math.sin(t * 20 + i), d.length(), 1 + 0.3 * Math.sin(t * 17 + i));
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      b.material.opacity = (t >= T_KNIGHT0 + 1.2 ? 0.75 : 0) * kk;
    });
    // la onda que se abre
    if (this.wave) {
      this.wave.t += dt;
      const s = 1 + this.wave.t * 45;
      this.wave.m.scale.set(s, s, 1 + this.wave.t * 4);
      this.wave.m.material.opacity = Math.max(0, 0.9 - this.wave.t * 0.6);
      if (this.wave.t > 1.6) {
        this.root.remove(this.wave.m);
        this.wave = null;
      }
    }
  }

  // ---------------- el súper facón ----------------
  faconReady() {
    const g = this.g;
    g.post?.flash?.(0.9);
    eclSfx(g).play('portal-cose', { gain: 1 });
    const f = buildFacon();
    f.scale.setScalar(7);
    const glow = new THREE.PointLight(0xffd890, 6, 18, 2);
    f.add(glow);
    f.position.copy(this.bel(9));
    this.root.add(f);
    this.facon = f;
    if (this.isGil()) {
      const P = g.player;
      this.lift = { from: P.pos.clone(), to: toWorld(U0, 0, rampY(U0), new THREE.Vector3()) };
    }
  }

  // (el Gil) La luz lo lleva al pie de la rampa; el facón va con él.
  carry(t) {
    const g = this.g;
    if (this.facon && t < T_RUN + 0.5) {
      const k = THREE.MathUtils.clamp((t - T_FACON) / (T_RUN - T_FACON), 0, 1);
      const to = toWorld(U0, 0, rampY(U0) + 1.2, new THREE.Vector3());
      this.facon.position.lerpVectors(this.bel(9), to, k * k * (3 - 2 * k));
      this.facon.scale.setScalar(7 - 5.2 * k);
      this.facon.rotation.y = t * 3;
    } else if (this.facon && t >= T_RUN + 0.5) this.facon.visible = false;
    if (!this.lift || t >= T_RUN) return;
    const P = g.player;
    const k = THREE.MathUtils.clamp((t - T_FACON) / (T_RUN - T_FACON), 0, 1);
    const e = k * k * (3 - 2 * k);
    P.pos.lerpVectors(this.lift.from, this.lift.to, e);
    P.pos.y += Math.sin(Math.PI * e) * 4;
    P.vel?.set?.(0, 0, 0);
    this.camFix();
  }

  camFix() {
    const P = this.g.player;
    this.g.camera.position.set(P.pos.x, P.pos.y + (P.eye || 1.6), P.pos.z);
  }

  // ---------------- la rampa y la carrera ----------------
  buildRamp() {
    const R = rng(1813);
    const top = new THREE.MeshStandardMaterial({ color: 0x3e5a26, roughness: 1 });
    const side = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 1 });
    const bot = new THREE.MeshStandardMaterial({ color: 0x3a3438, roughness: 1 });
    this.slabs = [];
    let u = U0 - 1.2;
    while (u < U1) {
      const len = 2.2 + R() * 0.9;
      const um = Math.min(U1 - 0.6, u + len / 2);
      const wid = 2.8 + R() * 1.6;
      const geo = new THREE.BoxGeometry(len + 0.25, 1.3, wid);
      const m = new THREE.Mesh(geo, [side, side, top, bot, side, side]);
      m.castShadow = true;
      m.receiveShadow = true;
      const y = rampY(um);
      const at = toWorld(um, (R() - 0.5) * 0.9, y - 0.65, new THREE.Vector3());
      const slope = um < U_FLAT ? Math.atan((Y1 - Y0) / (U_FLAT - U0)) : 0;
      m.rotation.set((R() - 0.5) * 0.09, YAW + (R() - 0.5) * 0.14, slope + (R() - 0.5) * 0.06, 'YXZ');
      m.position.copy(at);
      m.visible = false;
      this.root.add(m);
      // sube cuando el Gil está a ~10 m (el último escalón, antes)
      const tRise = T_RUN + (um - U0 - 10) / RUN_V;
      this.slabs.push({ m, at, tRise, up: false });
      u += len + 0.12;
    }
  }

  ramp(t, dt) {
    const g = this.g;
    for (const S of this.slabs || []) {
      if (t < S.tRise) continue;
      const k = Math.min(1, (t - S.tRise) / 0.9);
      if (!S.up) {
        S.up = true;
        S.m.visible = true;
        g.fx?.alpha?.spawn?.(S.at.x, S.at.y - 7, S.at.z, 0, 1.5, 0, { color: [0.45, 0.4, 0.34], size: 2, size1: 5, life: 2, alpha: 0.3, drag: 0.8, gravity: -0.2 });
        if (S === this.slabs[0] || Math.random() < 0.35) eclSfx(g).play('piedras-suben', { pos: S.at.clone(), gain: 0.7 });
      }
      const e = 1 - (1 - k) ** 3 * (1 + 1.6 * k);
      S.m.position.set(S.at.x, S.at.y - 9 * (1 - e), S.at.z);
    }
    // la carrera del Gil: adelante siempre, a la misma velocidad; no se cae ni frena ni vuelve
    // (fase 3: con la cinemática de Blender andando, la cámara es de ella: camFix la ponía en los ojos del Gil
    // de la carrera y la primera toma salía pegada a la nuca del Gil de la escena)
    if (!this.isGil() || t < T_RUN || this.done.cine || this.blending) return;
    const P = g.player;
    // (al arrancar: de cara a El Eclipse, mirando la rampa)
    if (!this.faced) {
      this.faced = true;
      const a = toWorld(U0, 0, 0, new THREE.Vector3());
      const b = toWorld(U1, 0, 0, new THREE.Vector3());
      P.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      P.pitch = -0.12;
    }
    const u = Math.min(U1 - 0.3, U0 + RUN_V * (t - T_RUN));
    // (de costado puede correrse un poco)
    const cur = this.vOff ?? 0;
    const want = THREE.MathUtils.clamp(cur + ((g.input?.key?.('KeyD') ? 1 : 0) - (g.input?.key?.('KeyA') ? 1 : 0)) * dt * 2.5, -1.1, 1.1);
    this.vOff = want;
    const at = toWorld(u, want, rampY(u), new THREE.Vector3());
    P.pos.copy(at);
    P.vel?.set?.(0, 0, 0);
    P.stamina = 99;
    P.sprinting = true;
    if (P.health < 20) P.health = 20;
    this.camFix();
  }

  // (todas) La cinemática nueva (ui/finEclipseBlend): el salto, el mundo blanco y Fierro. Si el archivo no
  // llegó o ya hay otra escena, sigue como antes.
  startBlend() {
    const ee = this.sl.ee;
    if (!this.blendD || !ee || ee.scene) return;
    this.blending = true;
    const cine = new FinEclipseBlend(ee, this.blendD, () => {
      this.blending = false;
      this.end();
    });
    ee.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-salto', cine };
  }

  // (todas) Llegó arriba: el blanco y el final de hoy (con la cinemática nueva, cuando ella termina).
  end() {
    if (this.blending || this.ended) return;
    this.ended = true;
    this.sl.finish();
  }

  dispose() {
    this.on = false;
    this.root.parent?.remove(this.root);
  }
}
