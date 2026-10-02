import * as THREE from 'three';
import { flameMaterial } from '../world/castleFire';
import { WEAPONS } from '../config/weapons';
import './elementalModels';
import ElemVm from './elementalFx';
import ElemSounds from './elementalSounds';
import ElemHud from './elementalHud';

// Los cuatro mates de la luz del castillo del Mateendrache, en uso: cómo
// tiran, el tiro cargado de los templados, lo que dejan en el mundo, cómo se
// mueven en la mano (la recarga y la inspección de cada uno) y sus sonidos.
//  · Pillán (fuego): bolas de fuego que revientan y prenden. Cargado: la
//    erupción, un volcán de fuego que dura unos segundos donde pega.
//  · Zonda (viento): un soplido en cono que manda a volar. Cargado: un
//    remolino que avanza y se traga a los muertos.
//  · Illapa (rayo): un rayo que salta de muerto en muerto. Cargado: el ojo de
//    la tormenta, una bola de rayos que fríe todo alrededor y revienta.
//  · Penitente (hielo): agujas de hielo que atraviesan y congelan. Cargado:
//    una ventisca que deja congelado todo lo que agarra.
// Weapons (weapons/Weapons.js) le pasa el gatillo (input), el disparo (fire),
// cada cuadro (update) y las poses de la mano (reloadPose, inspectPose,
// chargePose, animateModel). El daño va por zombies.damage, que en línea ya
// le avisa al anfitrión; los demás ven el tiro de cada uno como un "fantasma"
// (ghost): los mismos efectos y sonidos, sin daño ni easter egg.
// La recarga y la inspección de cada uno (la mano izquierda, las chispas, los
// rayitos) y lo que se junta en el mate mientras carga están en
// weapons/elementalFx.js; el aro de carga alrededor de la mira, en
// weapons/elementalHud.js; los sonidos, en weapons/elementalSounds.js.

const HEX = { fuego: 0xff6a1a, viento: 0x9affc8, rayo: 0xffe45a, hielo: 0x9adcff };
const RGB = { fuego: [1, 0.5, 0.15], viento: [0.7, 1, 0.82], rayo: [1, 0.92, 0.5], hielo: [0.66, 0.88, 1] };
// cuánto hay que mantener el clic para que empiece a cargar (antes es un tiro común)
const ARM = 0.22;
// las brasas del Pillán al rojo blanco (cuando se las sopla)
const COAL_HOT = new THREE.Color(2.2, 1.1, 0.3);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const hitTmp = {};

const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const bump = (k, c, w) => Math.max(0, 1 - Math.abs(k - c) / w);

export default class Elementales {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.shots = [];
    this.zones = [];
    this.charge = 0;
    this.charging = false;
    this.armT = 0;
    this.held = false;
    this.charged = false;
    // full: la carga ya se llenó (fullAt: cuándo); low: mantenido sin cargas suficientes
    this.full = false;
    this.fullAt = -9;
    this.low = false;
    this.lastT = 0;
    this.buildFx();
    this.hud = new ElemHud(this.g);
    this.snd = new ElemSounds(this.g);
    this.vm = new ElemVm(this);
  }

  // ---------------- lo compartido ----------------
  buildFx() {
    const add = (c, k = 2.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mats = {
      fire: add(0xff7a2a, 2.4),
      fireCore: add(0xffe0a0, 2.6),
      wind: add(0xd8ffe8, 0.28),
      bolt: add(0xfff4b0, 2.8),
      ice: new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.05, emissive: 0x5ab8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }),
      frost: add(0x9adcff, 1.1),
    };
    this.geo = {
      ball: new THREE.SphereGeometry(1, 14, 10),
      shard: new THREE.OctahedronGeometry(1, 0),
      ring: new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      cone: new THREE.ConeGeometry(1, 1, 12, 1, true),
      spike: new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0),
    };
  }

  // Daño de un mate de la luz: una parte de la vida del muerto (así siguen
  // matando en rondas altas); a los jefes, un golpe fijo.
  hurt(z, frac, type, point, dir, extra = {}) {
    const g = this.g;
    const amount = z.boss ? 2600 * frac : Math.max(1200 * frac, (z.maxHp || 0) * frac + 1);
    g.zombies.damage(z, amount, { type, zone: 'torso', point, dir, ...extra });
  }

  // El muerto está a la vista desde ese punto.
  sees(from, z) {
    return this.g.world.clear(from, tmpV2.set(z.pos.x, (z.pos.y || 0) + 1.1 * (z.scale || 1), z.pos.z));
  }

  // ---------------- el gatillo ----------------
  // Sin templar: un tiro por clic. Templado: un toque tira común; mantenido,
  // carga (el aro alrededor de la mira) y al soltar sale el tiro cargado.
  input(input, st, p) {
    const w = this.w;
    const g = this.g;
    const s = w.slot;
    const now = g.time;
    const dt = Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    // (si un cuadro no llega acá con el clic mantenido, tick corta la carga)
    this.inputT = now;
    if (w.state !== 'idle' || p.sprinting) {
      this.cancelCharge();
      return;
    }
    if (st.charge) {
      if (input.mouse.left) {
        if (!this.held) {
          if (w.fireCd > 0) return;
          if (s.mag <= 0) {
            if (input.mouse.leftPressed) {
              g.audio.empty();
              if (s.reserve > 0) w.startReload(st);
            }
            return;
          }
          this.held = true;
          this.armT = 0;
          this.charge = 0;
        }
        this.armT += dt;
        if (this.armT >= ARM) {
          if (s.mag >= st.charge.cost) {
            if (!this.charging) {
              this.charging = true;
              this.chargeSnd = this.snd.charge(st.element, true, st.charge.time);
              this.hud.start(st.element);
            }
            this.charge = Math.min(1, this.charge + dt / st.charge.time);
            if (this.charge >= 1 && !this.full) {
              // lista: el aviso, el aro que se clava y el golpe en el mate
              this.full = true;
              this.fullAt = now;
              this.chargeSnd?.full();
              this.hud.full();
              this.vm.chargeBurst(st.element, 'full');
            }
          } else if (!this.low) {
            this.low = true;
            this.hud.start(st.element, true);
          }
        }
        return;
      }
      if (!this.held) return;
      const full = this.charging && this.charge >= 1;
      if (this.charging || this.low) this.hud.release(full);
      this.cancelCharge();
      this.charged = full;
      w.fire(st);
      this.charged = false;
      if (full) this.vm.chargeBurst(st.element, 'release');
      return;
    }
    const trigger = input.mouse.leftPressed || (w.buffered && input.mouse.left);
    if (input.mouse.leftPressed && w.fireCd > 0) w.buffered = true;
    if (!trigger || w.fireCd > 0) return;
    w.buffered = false;
    if (s.mag <= 0) {
      g.audio.empty();
      if (s.reserve > 0) w.startReload(st);
      return;
    }
    w.fire(st);
  }

  cancelCharge() {
    this.held = false;
    this.charging = false;
    this.charge = 0;
    this.armT = 0;
    this.full = false;
    this.low = false;
    this.hud.cancel();
    if (this.chargeSnd) {
      this.chargeSnd.stop();
      this.chargeSnd = null;
    }
  }

  // ---------------- el disparo ----------------
  // Lo llama Weapons.fire (que ya gastó una carga, puso el enfriamiento y el retroceso).
  fire(st, origin, fwd, muzzle) {
    const w = this.w;
    const charged = this.charged && !!st.charge;
    if (charged) {
      const s = w.slot;
      s.mag = Math.max(0, s.mag - (st.charge.cost - 1));
      w.updateHud();
      w.fireCd = Math.max(w.fireCd, 0.55);
      this.g.fx.addShake(0.25);
      this.g.player.addRecoil(0.05, 0);
    }
    this.kick = 1;
    const aim = w.aimPoint(origin, fwd, st.range || 80);
    if (st.element === 'fuego') this.fireFuego(st, muzzle, aim, charged);
    else if (st.element === 'viento') this.fireViento(st, origin, fwd, muzzle, charged);
    else if (st.element === 'rayo') this.fireRayo(st, origin, fwd, muzzle, aim, charged);
    else this.fireHielo(st, muzzle, aim, charged);
    // que lo vean los demás
    const r = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    this.g.net?.share('elem', { el: st.element, c: charged ? 1 : 0, u: st.charge ? 1 : 0, o: r(origin), f: r(fwd), m: r(muzzle), a: r(aim) });
  }

  // El tiro de otro jugador (llega por la red): lo mismo que se ve acá, sin
  // daño ni easter egg (eso ya lo manda el que tiró).
  ghost(m) {
    const base = WEAPONS[{ fuego: 'pillan', viento: 'zonda', rayo: 'illapa', hielo: 'penitente' }[m.el]];
    if (!base || !m.o || !m.f || !m.m || !m.a) return;
    const st = m.u ? { ...base, ...base.pap } : base;
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const origin = V(m.o);
    const fwd = V(m.f).normalize();
    const muzzle = V(m.m);
    const aim = V(m.a);
    const charged = !!m.c && !!st.charge;
    if (m.el === 'fuego') this.fireFuego(st, muzzle, aim, charged, true);
    else if (m.el === 'viento') this.fireViento(st, origin, fwd, muzzle, charged, true);
    else if (m.el === 'rayo') this.fireRayo(st, origin, fwd, muzzle, aim, charged, true);
    else this.fireHielo(st, muzzle, aim, charged, true);
  }

  // ---------------- Pillán ----------------
  fireFuego(st, muzzle, aim, charged, ghost = false) {
    const g = this.g;
    const F = st.fireball;
    const speed = charged ? F.speed * 0.7 : F.speed;
    const vel = tmpV.subVectors(aim, muzzle).normalize().multiplyScalar(speed);
    // un poco para arriba: el tiro cargado va en arco, como una bomba de lava
    if (charged) vel.y += 4;
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(this.geo.ball, this.mats.fireCore);
    core.scale.setScalar(charged ? 0.32 : 0.16);
    const halo = new THREE.Mesh(this.geo.ball, this.mats.fire);
    halo.scale.setScalar(charged ? 0.6 : 0.3);
    mesh.add(core, halo);
    this.spawn({ kind: 'fuego', st, charged, pos: muzzle.clone(), vel: vel.clone(), gravity: charged ? 9 : F.gravity, mesh, life: 5, hits: null, ghost });
    this.shotSound('fuego', st, muzzle, charged, ghost);
    g.fx.fire(muzzle, 0.05, 4);
  }

  // La bola de fuego pegó: revienta y prende. Cargada: la erupción.
  boomFuego(p, point, zhit) {
    const g = this.g;
    const st = p.st;
    const F = st.fireball;
    const R = p.charged ? F.radius * 1.25 : F.radius;
    if (!p.ghost) {
      if (zhit) this.hurt(zhit.z, F.frac, 'burn', point, tmpV.copy(p.vel).normalize(), { burn: true });
      const from = tmpV2.copy(point).add(tmpV.set(0, 0.4, 0));
      for (const { z, d } of g.zombies.inRadius(point, R)) {
        if (zhit && z === zhit.z) continue;
        if (!this.sees(from, z)) continue;
        const dir = new THREE.Vector3(z.pos.x - point.x, 0.3, z.pos.z - point.z).normalize();
        this.hurt(z, F.splash * (1 - (d / R) * 0.4), 'burn', new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), dir, { burn: true });
      }
    }
    g.fx.explosion(point, R * 0.8, RGB.fuego);
    g.fx.fire(point, R * 0.25, 18);
    if (!p.ghost) g.fx.addShake(p.charged ? 0.5 : 0.12);
    this.snd.boom(point, p.charged ? 1.4 : 0.8);
    if (!p.ghost) {
      g.ee?.onExplosion?.(point, R);
      g.ee?.onElemental?.('fuego', point, p.charged);
    }
    if (p.charged) this.zones.push({ kind: 'erupcion', pos: point.clone().setY(g.world.floorAt(point.x, point.z, point.y + 0.5)), r: 4.5, t: 0, life: 4.2, tick: 0, st, mesh: this.eruptionMesh(point), ghost: p.ghost });
  }

  // El volcán de la erupción: tres llamas grandes cruzadas.
  eruptionMesh(point) {
    const g = this.g;
    const grp = new THREE.Group();
    const y = g.world.floorAt(point.x, point.z, point.y + 0.5);
    grp.position.set(point.x, y, point.z);
    const geo = new THREE.PlaneGeometry(3.2, 6).translate(0, 3, 0);
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(geo, flameMaterial());
      m.rotation.y = (k / 3) * Math.PI;
      grp.add(m);
    }
    const ring = new THREE.Mesh(this.geo.ring, this.mats.fire);
    ring.scale.setScalar(4.5);
    ring.position.y = 0.05;
    grp.add(ring);
    grp.scale.set(0.2, 0.2, 0.2);
    g.scene.add(grp);
    return grp;
  }

  // ---------------- Zonda ----------------
  fireViento(st, origin, fwd, muzzle, charged, ghost = false) {
    const g = this.g;
    const G = st.gust;
    if (charged) {
      // el remolino: sale por el piso para adelante (de los pies del que tiró)
      const dir = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      const feet = ghost ? new THREE.Vector3(origin.x, origin.y - 1.6, origin.z) : g.player.pos;
      const start = feet.clone().addScaledVector(dir, 2.5);
      start.y = g.world.floorAt(start.x, start.z, feet.y + 0.5);
      this.zones.push({ kind: 'remolino', pos: start, dir, r: 3.3, t: 0, life: 5.5, tick: 0, st, mesh: this.tornadoMesh(start), hits: new Set(), ghost, snd: this.snd.zoneLoop('viento', start.clone().setY(start.y + 1)) });
      this.shotSound('viento', st, muzzle, true, ghost);
      g.fx.blastCone(muzzle, fwd, 6);
      return;
    }
    const cos = Math.cos(G.angle);
    g.fx.blastCone(muzzle, fwd, G.range);
    if (!ghost) g.fx.addShake(0.3);
    const list = [];
    if (!ghost) {
      for (const { z, d } of g.zombies.inRadius(origin, G.range)) {
        tmpV.set(z.pos.x - origin.x, (z.pos.y || 0) + 1 - origin.y, z.pos.z - origin.z);
        const len = tmpV.length() || 1;
        if (tmpV.dot(fwd) / len < cos && d > 1.6) continue;
        if (!this.sees(origin, z)) continue;
        list.push({ z, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    for (const { z, d } of list.slice(0, G.targets)) {
      const dir = new THREE.Vector3(z.pos.x - origin.x, 0, z.pos.z - origin.z).normalize();
      const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.2, z.pos.z);
      if (d <= G.kill) this.hurt(z, G.frac, 'blast', point, dir);
      else this.hurt(z, G.frac * 0.45, 'bullet', point, dir, { elem: 'ice' });
    }
    // la nieve que levanta el soplido
    for (let i = 0; i < 16; i++) {
      const k = 2 + Math.random() * G.range * 0.8;
      const px = origin.x + fwd.x * k + (Math.random() - 0.5) * k * 0.5;
      const pz = origin.z + fwd.z * k + (Math.random() - 0.5) * k * 0.5;
      const py = g.world.floorAt(px, pz, origin.y) + 0.2 + Math.random() * 1.2;
      g.fx.alpha.spawn(px, py, pz, fwd.x * 9, 0.6 + Math.random(), fwd.z * 9, { color: [0.86, 0.94, 0.9], size: 0.35, size1: 1.4, life: 0.8 + Math.random() * 0.5, alpha: 0.22, drag: 1.2 });
    }
    if (!ghost) g.ee?.onBlast?.(origin, fwd, G.range, G.angle);
    this.shotSound('viento', st, muzzle, false, ghost);
  }

  // El remolino: conos abiertos que giran, más anchos arriba, con vetas de
  // viento que suben (una textura de rayas en diagonal).
  tornadoMesh(at) {
    const grp = new THREE.Group();
    grp.position.copy(at);
    if (!this.windMat) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 128;
      const x = c.getContext('2d');
      for (let i = 0; i < 18; i++) {
        x.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        x.lineWidth = 1 + Math.random() * 3;
        x.beginPath();
        const y0 = Math.random() * 128;
        x.moveTo(0, y0);
        x.lineTo(64, y0 - 30 - Math.random() * 30);
        x.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      this.windMat = new THREE.MeshBasicMaterial({ color: 0xcfeede, map: t, alphaMap: t, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    }
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(this.geo.cone, this.windMat);
      const s = 0.8 + k * 0.55;
      c.scale.set(s, 1.6, s);
      c.rotation.x = Math.PI;
      c.position.y = 0.8 + k * 1.3;
      c.userData.k = k;
      grp.add(c);
    }
    this.g.scene.add(grp);
    return grp;
  }

  // ---------------- Illapa ----------------
  fireRayo(st, origin, fwd, muzzle, aim, charged, ghost = false) {
    const g = this.g;
    const S = st.spark;
    if (charged) {
      const vel = tmpV.subVectors(aim, muzzle).normalize().multiplyScalar(6.5);
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(this.geo.ball, this.mats.bolt);
      core.scale.setScalar(0.35);
      const halo = new THREE.Mesh(this.geo.ball, this.mats.frost);
      halo.scale.setScalar(0.7);
      mesh.add(core, halo);
      this.spawn({ kind: 'tormenta', st, charged: true, pos: muzzle.clone(), vel: vel.clone(), gravity: 0, mesh, life: 5, zapT: 0, ghost, snd: this.snd.zoneLoop('rayo', muzzle) });
      this.shotSound('rayo', st, muzzle, true, ghost);
      // (el asedio: apuntando a una catapulta, el cielo le contesta)
      if (!ghost) g.ee?.onCharged?.('rayo', origin, fwd);
      return;
    }
    // el primero: el que está en la mira (o el más derecho adelante)
    const wallT = g.world.raycast(origin, fwd, st.range, hitTmp);
    const maxT = Math.min(wallT, st.range);
    let first = g.zombies.raycast(origin, fwd, maxT)[0]?.z || null;
    if (!first) {
      let best = Infinity;
      for (const { z, d } of g.zombies.inRadius(origin, st.range)) {
        tmpV.set(z.pos.x - origin.x, (z.pos.y || 0) + 1.1 - origin.y, z.pos.z - origin.z);
        const dot = tmpV.dot(fwd) / (tmpV.length() || 1);
        if (dot < 0.985) continue;
        const score = d * (1.5 - dot);
        if (score < best && this.sees(origin, z)) {
          best = score;
          first = z;
        }
      }
    }
    g.fx.flash(muzzle, HEX.rayo, 22, 0.12, 9);
    this.shotSound('rayo', st, muzzle, false, ghost);
    if (!first) {
      const end = aim.clone();
      g.fx.lightning(muzzle, end, HEX.rayo, 0.12);
      if (Number.isFinite(wallT)) g.fx.sparks(hitTmp.point, 1, hitTmp.normal, RGB.rayo);
      if (!ghost) {
        g.ee?.onShot?.(origin, fwd, maxT);
        // (donde pega el rayo: la gema del Chiquitijuein en la Gran Guerra)
        if (Number.isFinite(wallT)) g.ee?.onElemental?.('rayo', end, false);
      }
      return;
    }
    const seen = new Set([first]);
    let from = muzzle.clone();
    let cur = first;
    for (let i = 0; i <= S.chain && cur; i++) {
      const target = cur;
      const at = new THREE.Vector3(target.pos.x, (target.pos.y || 0) + 1.1 * (target.scale || 1), target.pos.z);
      const a = from.clone();
      g.later(i * 0.05, () => {
        g.fx.lightning(a, at, HEX.rayo, 0.14);
        g.fx.electric(at, 10);
        if (i > 0) this.snd.zapAt(at);
        if (!ghost) this.hurt(target, S.frac, 'chain', at, null);
      });
      from = at;
      let next = null;
      let nd = S.hop;
      for (const { z } of g.zombies.inRadius(at, S.hop)) {
        if (seen.has(z)) continue;
        const d = z.pos.distanceTo(target.pos);
        if (d < nd && this.sees(at, z)) {
          nd = d;
          next = z;
        }
      }
      if (next) seen.add(next);
      cur = next;
    }
    if (!ghost) g.hud.hitmarker(false);
  }

  // ---------------- Penitente ----------------
  fireHielo(st, muzzle, aim, charged, ghost = false) {
    const g = this.g;
    const S = st.shard;
    const vel = tmpV.subVectors(aim, muzzle).normalize().multiplyScalar(charged ? S.speed * 0.6 : S.speed);
    const mesh = new THREE.Mesh(this.geo.shard, this.mats.ice);
    mesh.scale.set(charged ? 0.14 : 0.07, charged ? 0.14 : 0.07, charged ? 0.6 : 0.34);
    this.spawn({ kind: 'hielo', st, charged, pos: muzzle.clone(), vel: vel.clone(), gravity: 0, mesh, life: 3, hits: new Set(), left: charged ? 1 : S.pierce, ghost });
    this.shotSound('hielo', st, muzzle, charged, ghost);
  }

  // La ventisca: nieve que gira, un anillo de escarcha y agujas de hielo que salen del piso.
  blizzard(point, st, ghost = false) {
    const g = this.g;
    const y = g.world.floorAt(point.x, point.z, point.y + 0.5);
    const grp = new THREE.Group();
    grp.position.set(point.x, y, point.z);
    const ring = new THREE.Mesh(this.geo.ring, this.mats.frost);
    ring.scale.setScalar(5);
    ring.position.y = 0.05;
    grp.add(ring);
    const spikes = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3;
      const d = 1.2 + Math.random() * 3.3;
      const s = new THREE.Mesh(this.geo.spike, this.mats.ice);
      s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      s.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.4);
      s.userData.h = 1 + Math.random() * 1.6;
      s.scale.set(1, 0.01, 1);
      grp.add(s);
      spikes.push(s);
    }
    g.scene.add(grp);
    if (!ghost) g.ee?.onElemental?.('hielo', point, true);
    // (la ventisca grabada se repite mientras dura: snd.blizzard la devuelve)
    const snd = this.snd.blizzard(point);
    this.zones.push({ kind: 'ventisca', pos: new THREE.Vector3(point.x, y, point.z), r: 5, t: 0, life: 4.5, tick: 0, st, mesh: grp, spikes, ghost, snd });
    g.fx.frost(new THREE.Vector3(point.x, y, point.z), 30);
  }

  // ---------------- proyectiles y zonas ----------------
  spawn(p) {
    p.t = 0;
    p.prev = p.pos.clone();
    this.g.scene.add(p.mesh);
    p.mesh.position.copy(p.pos);
    this.shots.push(p);
  }

  remove(p) {
    p.mesh?.removeFromParent();
    p.snd?.stop(0.3);
  }

  update(dt) {
    const g = this.g;
    this.tick();
    this.hud.update(dt, this.charging ? this.charge : 0);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const p = this.shots[i];
      p.t += dt;
      if (p.t > p.life) {
        if (p.kind === 'tormenta') this.stormBoom(p, p.pos);
        this.remove(p);
        this.shots.splice(i, 1);
        continue;
      }
      p.prev.copy(p.pos);
      p.vel.y -= (p.gravity || 0) * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (this.stepShot(p, dt)) {
        this.remove(p);
        this.shots.splice(i, 1);
        continue;
      }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'hielo') p.mesh.lookAt(tmpV.copy(p.pos).add(p.vel));
      else p.mesh.rotation.y += dt * 6;
      // estelas
      if (p.kind === 'fuego') {
        g.fx.fire(p.pos, p.charged ? 0.12 : 0.05, p.charged ? 3 : 1);
        if (Math.random() < 0.5) g.fx.sparkle(p.pos, RGB.fuego, 1, 0.1);
      } else if (p.kind === 'hielo') {
        if (Math.random() < 0.7) g.fx.sparkle(p.pos, RGB.hielo, 1, 0.05);
      } else if (p.kind === 'tormenta') {
        this.stormTick(p, dt);
        p.snd?.move(p.pos);
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      if (z.kind === 'erupcion') this.tickEruption(z, dt);
      else if (z.kind === 'remolino') this.tickTornado(z, dt);
      else this.tickBlizzard(z, dt);
      // su sonido se apaga con ella (un poco antes: que termine junto)
      if (z.snd) {
        if (z.kind === 'remolino') z.snd.move(tmpV.copy(z.pos).setY(z.pos.y + 1));
        if (z.t > z.life - 0.7) {
          z.snd.stop(0.7);
          z.snd = null;
        }
      }
      if (z.t >= z.life) {
        z.mesh?.removeFromParent();
        this.zones.splice(i, 1);
      }
    }
  }

  // Avanza un tiro contra paredes y muertos. Devuelve true si terminó.
  stepShot(p, dt) {
    const g = this.g;
    const seg = tmpV.subVectors(p.pos, p.prev);
    const len = seg.length();
    if (len < 1e-5) return false;
    const dir = seg.clone().divideScalar(len);
    const wallT = g.world.raycast(p.prev, dir, len, hitTmp);
    const hits = g.zombies.raycast(p.prev, dir, Math.min(wallT, len));
    if (p.kind === 'hielo') {
      // la aguja atraviesa (hasta `left`) y congela a cada uno
      for (const h of hits) {
        if (p.hits.has(h.z)) continue;
        p.hits.add(h.z);
        const point = p.prev.clone().addScaledVector(dir, h.t);
        if (p.charged) {
          this.blizzard(point, p.st, p.ghost);
          return true;
        }
        if (!p.ghost) {
          this.hurt(h.z, p.st.shard.frac, 'freeze', point, dir.clone(), { elem: 'ice' });
          g.hud.hitmarker(false);
        }
        g.fx.frost(point, 6);
        if (--p.left <= 0) return true;
      }
      if (Number.isFinite(wallT)) {
        const point = hitTmp.point.clone();
        if (p.charged) this.blizzard(point, p.st, p.ghost);
        else {
          g.fx.sparks(point, 0.6, hitTmp.normal, RGB.hielo);
          g.fx.frost(point, 8);
          this.snd.iceHit(point);
          if (!p.ghost) g.ee?.onElemental?.('hielo', point, false);
        }
        return true;
      }
      return false;
    }
    if (p.kind === 'tormenta') {
      // la bola de rayos se frena contra las paredes (y ahí revienta)
      if (Number.isFinite(wallT)) {
        this.stormBoom(p, hitTmp.point.clone());
        return true;
      }
      return false;
    }
    if (hits.length) {
      const h = hits[0];
      this.boomFuego(p, p.prev.clone().addScaledVector(dir, h.t), h);
      if (!p.ghost) g.hud.hitmarker(false);
      return true;
    }
    if (Number.isFinite(wallT)) {
      this.boomFuego(p, hitTmp.point.clone(), null);
      return true;
    }
    return false;
  }

  // El ojo de la tormenta: cada tanto le pega un rayo a los de alrededor.
  stormTick(p, dt) {
    const g = this.g;
    p.zapT -= dt;
    if (Math.random() < 0.5) g.fx.electric(p.pos, 2);
    if (p.zapT > 0) return;
    p.zapT = 0.25;
    const near = g.zombies.inRadius(p.pos, 6.5, []).sort((a, b) => a.d - b.d).slice(0, 4);
    for (const { z } of near) {
      const at = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.1, z.pos.z);
      if (!g.world.clear(p.pos, at)) continue;
      g.fx.lightning(p.pos.clone(), at, HEX.rayo, 0.12);
      if (!p.ghost) this.hurt(z, p.st.spark.frac * 0.55, 'chain', at, null);
    }
    if (near.length) this.snd.zapAt(p.pos);
  }

  stormBoom(p, at) {
    const g = this.g;
    const R = 6.5;
    for (const { z, d } of p.ghost ? [] : g.zombies.inRadius(at, R)) {
      if (!this.sees(at, z)) continue;
      this.hurt(z, 2 * (1 - (d / R) * 0.3), 'chain', new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), null);
    }
    g.fx.explosion(at, R * 0.7, RGB.rayo);
    g.fx.electric(at, 40);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.fx.lightning(at.clone(), at.clone().add(new THREE.Vector3(Math.cos(a) * R, 3 + Math.random() * 4, Math.sin(a) * R)), HEX.rayo, 0.2);
    }
    if (g.weather) g.weather.flash = Math.max(g.weather.flash, 0.7);
    this.snd.thunder(at);
    if (p.ghost) return;
    g.fx.addShake(0.6);
    g.ee?.onExplosion?.(at, R);
    g.ee?.onElemental?.('rayo', at, true);
  }

  tickEruption(z, dt) {
    const g = this.g;
    const k = Math.min(1, z.t / 0.35) * (1 - smooth((z.t - z.life + 0.6) / 0.6));
    z.mesh.scale.set(0.3 + k * 0.7, 0.2 + k * 0.8 + Math.sin(z.t * 17) * 0.05, 0.3 + k * 0.7);
    if (Math.random() < 0.9) g.fx.fire(tmpV.set(z.pos.x + (Math.random() - 0.5) * z.r, z.pos.y + 0.2, z.pos.z + (Math.random() - 0.5) * z.r), 0.4, 3);
    // piedras de lava que saltan
    if (Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 3, 7 + Math.random() * 4, Math.sin(a) * 3);
      const mesh = new THREE.Mesh(this.geo.ball, this.mats.fire);
      mesh.scale.setScalar(0.12);
      this.spawn({ kind: 'fuego', st: z.st, charged: false, pos: z.pos.clone().setY(z.pos.y + 1), vel, gravity: 12, mesh, life: 2.5, ghost: z.ghost });
    }
    if (z.ghost) return;
    z.tick -= dt;
    if (z.tick > 0) return;
    z.tick = 0.2;
    for (const { z: zz } of g.zombies.inRadius(z.pos, z.r)) this.hurt(zz, 0.6, 'burn', new THREE.Vector3(zz.pos.x, (zz.pos.y || 0) + 1, zz.pos.z), null, { burn: true });
  }

  tickTornado(z, dt) {
    const g = this.g;
    // avanza por el piso; contra una pared se queda girando ahí
    const next = tmpV.copy(z.pos).addScaledVector(z.dir, 5 * dt);
    const fy = g.world.floorAt(next.x, next.z, z.pos.y + 0.6);
    const blocked = Math.abs(fy - z.pos.y) > 0.8 || Number.isFinite(g.world.raycast(tmpV2.copy(z.pos).setY(z.pos.y + 1), z.dir, 5 * dt + 0.6, hitTmp));
    if (!blocked) z.pos.set(next.x, fy, next.z);
    z.mesh.position.copy(z.pos);
    const grow = Math.min(1, z.t / 0.4) * (1 - smooth((z.t - z.life + 0.5) / 0.5));
    if (this.windMat) this.windMat.map.offset.y -= dt * 1.8;
    for (const c of z.mesh.children) {
      c.rotation.y += dt * (9 + c.userData.k * 2);
      c.position.x = Math.sin(z.t * 3 + c.userData.k) * 0.25 * c.userData.k;
    }
    z.mesh.scale.setScalar(0.2 + grow * 0.8);
    if (Math.random() < 0.8) g.fx.alpha.spawn(z.pos.x + (Math.random() - 0.5) * 3, z.pos.y + Math.random() * 5, z.pos.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, { color: [0.86, 0.94, 0.9], size: 0.4, size1: 1.2, life: 0.8, alpha: 0.25, drag: 0.5 });
    // se los traga: los de cerca vuelan para arriba; los de más lejos se arriman
    const host = !g.net?.guest;
    for (const { z: zz, d } of g.zombies.inRadius(z.pos, 8)) {
      if (d < z.r) {
        if (z.ghost || z.hits.has(zz)) continue;
        z.hits.add(zz);
        const dir = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4).normalize();
        this.hurt(zz, 1.6, 'blast', new THREE.Vector3(zz.pos.x, (zz.pos.y || 0) + 1.2, zz.pos.z), dir);
      } else if (host && !zz.boss && !zz.dead) {
        const k = (2.4 * dt) / (d || 1);
        zz.pos.x += (z.pos.x - zz.pos.x) * k;
        zz.pos.z += (z.pos.z - zz.pos.z) * k;
      }
    }
    if (Math.random() < dt * 2) this.snd.gust(z.pos, 0.5);
    // (el easter egg: lo que el remolino levanta o empuja)
    z.eeT = (z.eeT || 0) - dt;
    if (z.eeT <= 0 && !z.ghost) {
      z.eeT = 0.25;
      g.ee?.onElemental?.('viento', z.pos, true);
    }
  }

  tickBlizzard(z, dt) {
    const g = this.g;
    const grow = Math.min(1, z.t / 0.5);
    const melt = 1 - smooth((z.t - z.life + 0.8) / 0.8);
    for (const s of z.spikes) s.scale.set(1, Math.max(0.01, s.userData.h * grow * melt), 1);
    z.mesh.children[0].rotation.y += dt * 0.6;
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * z.r;
      g.fx.alpha.spawn(z.pos.x + Math.cos(a) * d, z.pos.y + 0.3 + Math.random() * 3, z.pos.z + Math.sin(a) * d, -Math.sin(a) * 5, -0.5, Math.cos(a) * 5, { color: [0.9, 0.95, 1], size: 0.2, size1: 0.6, life: 0.9, alpha: 0.4, drag: 0.4 });
    }
    if (z.ghost) return;
    z.tick -= dt;
    if (z.tick > 0) return;
    z.tick = 0.3;
    for (const { z: zz } of g.zombies.inRadius(z.pos, z.r)) this.hurt(zz, 0.42, 'freeze', new THREE.Vector3(zz.pos.x, (zz.pos.y || 0) + 1, zz.pos.z), null, { elem: 'ice' });
  }

  clear() {
    for (const p of this.shots) this.remove(p);
    for (const z of this.zones) {
      z.mesh?.removeFromParent();
      z.snd?.stop(0.2);
    }
    this.shots = [];
    this.zones = [];
    this.cancelCharge();
    this.hud.hide();
    this.vm?.clear();
  }

  // ---------------- la mano ----------------
  // Cada pose devuelve [x, y, z, rx, ry, rz, bajar] para sumar a la de Weapons.
  // La recarga y la inspección son coreografías (weapons/elementalFx.js).

  // La recarga de cada mate (k: 0 a 1).
  reloadPose(st, k, t) {
    return this.vm.reloadPose(st, k, t);
  }

  // La inspección (ik: cuánto está en pose). Dura lo que dura la de cada mate
  // y después vuelve sola a la mano (ver tick).
  inspectPose(st, ik) {
    return this.vm.inspectPose(st, ik);
  }

  // Cargando: la trae al medio, la levanta y la acerca, cada mate a su manera
  // (el Pillán late como un corazón, el Zonda se mece en círculos, el Illapa
  // zumba a los saltos, el Penitente se pone duro y tirita). Al llenarse, un
  // golpe seco de "lista" y queda vibrando hasta que se suelta.
  chargePose(t) {
    const o = [0, 0, 0, 0, 0, 0, 0];
    const k = this.charging ? this.charge : 0;
    this.chargeK = (this.chargeK || 0) + (k - (this.chargeK || 0)) * 0.25;
    const c = this.chargeK;
    const since = this.g.time - this.fullAt;
    if (c < 0.001 && since > 0.6) return o;
    const c2 = c * c;
    const el = this.w.stats?.element;
    o[0] -= c * 0.012;
    o[1] += c * 0.026;
    o[2] += c * 0.03;
    o[3] += c * 0.1;
    if (el === 'fuego') {
      const beat = Math.pow(Math.max(0, Math.sin(t * (5 + c * 5))), 12) * c;
      o[1] += beat * 0.004;
      o[2] += beat * 0.009;
      o[3] += beat * 0.035;
    } else if (el === 'viento') {
      const a = t * (4 + c * 8);
      o[0] += Math.cos(a) * 0.006 * c;
      o[1] += Math.sin(a) * 0.004 * c;
      o[5] += Math.sin(a) * 0.06 * c;
    } else if (el === 'rayo') {
      const j = 0.006 * c2;
      o[0] += (Math.random() - 0.5) * j;
      o[1] += (Math.random() - 0.5) * j;
      o[5] += (Math.random() - 0.5) * j * 8;
    } else {
      o[0] += Math.sin(t * 83) * 0.0014 * c2;
      o[1] += Math.cos(t * 71) * 0.0012 * c2;
      o[3] += c * 0.05;
    }
    // el golpe de "lista": un resorte que se apaga solo
    if (since >= 0 && since < 0.6) {
      const s = Math.exp(-since * 9) * Math.sin(since * 38);
      o[2] -= s * 0.012;
      o[3] -= s * 0.06;
    }
    if (this.full && this.charging) {
      o[0] += Math.sin(t * 61) * 0.0016;
      o[1] += Math.cos(t * 53) * 0.0014;
    }
    return o;
  }

  // Cada cuadro, lo de la mano que no es pose: el ruido al sacarlo, el fin
  // de la inspección y la carga que quedó colgada (cambió de arma, se cayó,
  // abrió un menú: el gatillo no pasó por input este cuadro).
  tick() {
    const w = this.w;
    const st = w.stats;
    const elem = st?.kind === 'elemental';
    if (this.held && this.inputT !== this.g.time) this.cancelCharge();
    if (elem && w.state === 'raise' && (this.lastState !== 'raise' || this.lastModel !== w.model)) this.snd.equip(st.element, !!st.charge);
    if (elem && w.state === 'inspect' && w.stateT > this.vm.inspectLen(st)) w.state = 'idle';
    this.lastState = w.state;
    this.lastModel = w.model;
  }

  // Lo que se mueve solo en el modelo de la mano (y lo que le pide la coreografía).
  animateModel(dt, st, model, state, stateT) {
    const E = model?.elem;
    if (!E) return;
    this.vm.update(dt, st, model, state, stateT);
    const F = this.vm.fx;
    const t = this.g.time;
    const c = this.chargeK || 0;
    this.kick = Math.max(0, (this.kick || 0) - dt * 4);
    const hot = 1 + c * 1.6 + this.kick * 1.5;
    if (E.kind === 'fuego') {
      E.lava.emissiveIntensity = (model.upgraded ? 2.2 : 1.4) * (0.8 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.3) * 0.06) * hot * (1 + Math.min(1.2, F.lava) * (model.upgraded ? 0.6 : 1));
      // las brasas: soplidas se ponen más amarillas
      // (el material es uno solo para todos los Pillán: el color de base queda en él)
      E.coal.userData.base ||= E.coal.color.clone();
      E.coal.color.copy(E.coal.userData.base).lerp(COAL_HOT, Math.min(1, F.flare * 0.45)).multiplyScalar(1 + F.flare * 0.5);
      const fast = hot * (1 + F.flare * 1.5);
      E.embers.forEach((e, k) => {
        const s = e.userData.s * fast;
        const a = e.userData.a + t * s * 1.3;
        const rise = (t * 0.35 * s + k * 0.37) % 1;
        const r = 0.03 + rise * 0.02 + F.flare * 0.012;
        e.position.set(Math.cos(a) * r, E.topY + rise * (0.07 + F.flare * 0.05), Math.sin(a) * r);
        e.scale.setScalar((1 - rise * 0.7) * (1 + F.flare * 0.6));
      });
      // (la llama del templado ya es grande: la soplada la agranda menos)
      const flare = Math.min(2.4, 0.8 + c * 1.5 + this.kick * 1.2 + F.flare * (model.upgraded ? 0.9 : 1.4));
      for (const f of E.flames) f.scale.setScalar(flare + Math.sin(t * 13) * 0.08);
    } else if (E.kind === 'viento') {
      E.turbine.rotation.y += dt * (4 + c * 22 + this.kick * 30 + F.turb);
      E.feathers.forEach((f, k) => {
        const lift = F.feather;
        f.rotation.z = 0.2 + k * 0.15 + lift * 0.9 + Math.sin(t * (3 + c * 8 + lift * 14) + k) * (0.12 + c * 0.3 + lift * 0.25);
        f.rotation.x = Math.sin(t * 2.3 + k * 2) * (0.1 + lift * 0.2);
      });
      if (E.tornado) {
        E.tornado.rotation.y += dt * (10 + c * 20 + F.twister * 25);
        E.tornado.scale.set(1 + c * 0.6 + F.twister * 0.4 + Math.sin(t * 9) * 0.05, 1 + c * 0.4 + F.twister * 0.7, 1 + c * 0.6 + F.twister * 0.4);
      }
    } else if (E.kind === 'rayo') {
      E.orb.scale.setScalar(1 + Math.sin(t * 11) * 0.12 + c * 0.6 + this.kick * 0.5 + F.orb * 0.8);
      if (E.cloud) E.cloud.position.set(Math.sin(t * 2) * 0.004, 0.003 + Math.cos(t * 3) * 0.002, 0.004);
      E.arcT = (E.arcT || 0) - dt;
      if (E.arcT <= 0) {
        E.arcT = 0.05 + Math.random() * 0.05;
        const chance = 0.25 + c * 0.7 + this.kick + F.arcs + F.orb * 0.3;
        for (const seg of E.arcs) {
          seg.visible = Math.random() < chance;
          if (!seg.visible) continue;
          const a = Math.random() * Math.PI * 2;
          const to = new THREE.Vector3(Math.cos(a) * E.topR, E.topY + 0.004, Math.sin(a) * E.topR);
          const from = E.arcFrom;
          const d = tmpV.subVectors(to, from);
          const len = d.length();
          seg.position.copy(from).add(to).multiplyScalar(0.5);
          seg.quaternion.setFromUnitVectors(UP, d.normalize());
          seg.scale.set(0.0012, len, 0.0012);
        }
      }
    } else {
      E.core.scale.set(E.core.scale.x, 0.035 * (1 + Math.sin(t * 2.2) * 0.1 + c * 0.5 + F.core * 0.3), E.core.scale.z);
      E.coreMat.color.setRGB(0.2 + c * 0.6 + F.core * 0.5, 0.6 + c * 0.3 + F.core * 0.4, 1.2 + c * 0.8 + F.core * 0.6);
      // la escarcha: rota desde el cachetazo, vuelve a crecer aguja por aguja
      const grow = this.vm.spikeGrow;
      E.spikes.forEach((s, i) => s.scale.setScalar(Math.max(0.02, grow ? grow(i) : F.grow) * (1 + F.crown * 0.25)));
      E.flakes.forEach((f, k) => {
        const a = f.userData.a + t * (1.2 + c * 3 + F.core * 2);
        f.position.set(Math.cos(a) * 0.075, 0.05 + Math.sin(t * 2 + k) * 0.02, Math.sin(a) * 0.075);
        f.lookAt(0, 0.05, 0);
      });
    }
  }

  // ---------------- sonidos ----------------
  // El tiro de cada mate (el propio suena sin posición; el de otro, donde está).
  shotSound(el, st, muzzle, charged, ghost) {
    const pos = ghost ? muzzle : null;
    if (charged) this.snd.release(el, pos, !!st.charge);
    else this.snd.shot(el, pos, !!st.charge);
  }

  // La recarga: los sonidos van saliendo con la coreografía (weapons/elementalFx.js);
  // esto devuelve con qué callarlos si se corta.
  reloadSound(st) {
    this.vm.startOut(st, 0.6, 'reload');
    return { stop: () => this.vm.stopOut() };
  }
}
