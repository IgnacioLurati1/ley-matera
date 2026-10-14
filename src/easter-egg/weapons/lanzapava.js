import * as THREE from 'three';
import * as Armas from '../core/armas';
import { buildGrenade } from './viewmodels';
import { GRENADE } from '../config/weapons';

// El Lanzapava: el especialista del Mate 47 (el usuario, 2026-10-12). Con una
// tecla (la N; Controles, "Lanzapava") el 47 pasa a lanzagranadas: la pava de
// hierro que cuelga abajo de la bombilla (weapons/accesorios.js lanzapava)
// tira pavitas que revientan. Tiene 2 tiros cargados y 4 de repuesto, que se
// llenan con el Max Ammo (el usuario, 2026-10-13; antes volvía uno cada 8
// bajas: core/armas.js ARMERIA.lanzapava). Al cambiar de modo el mate se da
// vuelta un poco, se abre la tapa de la pava y suena el cerrojo; sin tiros
// vuelve solo al fusil. En línea los compañeros ven la tapa abierta (Session
// 'wpn': lanzapavaAbierta), oyen el cerrojo, y ven la pavita volar y reventar
// ('lpava'; el daño lo hace el que tiró).
// __mduSinLanzapava = true: no hay. __mduSinEspecialistas = true: como el
// 12 de octubre (sin repuesto, vuelve con las bajas, pega como la bomba de yerba).

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = (t) => t * t * (3 - 2 * t);
const LP = () => Armas.ARMERIA.lanzapava;
// (lo del 12 de octubre: __mduSinEspecialistas)
const viejo = () => Armas.sinNuevos();
// lo que tarda en cebar la pava con uno del repuesto (s)
const CEBA = 1.1;

export class Lanzapava {
  constructor(W) {
    this.W = W;
    this.g = W.g;
    this.on = false;
    // 0 = fusil, 1 = lanzapava (la animación del cambio)
    this.k = 0;
    this.tiros = LP().tiros;
    this.reserva = LP().reserva;
    this.prog = 0;
    this.cd = 0;
    this.backT = 0;
    // cebando: lo que falta (s)
    this.cebaT = 0;
    this.slot = null;
    Armas.onBaja((id) => this.baja(id));
  }

  // al empezar una partida (Weapons.reset): con los dos tiros y en fusil
  reset() {
    this.on = false;
    this.k = 0;
    this.tiros = LP().tiros;
    this.reserva = LP().reserva;
    this.prog = 0;
    this.backT = 0;
    this.cebaT = 0;
  }

  // El Max Ammo (Weapons.maxAmmo): los dos cargados y el repuesto lleno.
  lleno() {
    if (viejo()) return;
    this.tiros = LP().tiros;
    this.reserva = LP().reserva;
    this.cebaT = 0;
    if (this.on) this.W.updateHud();
  }

  // Cebar uno del repuesto (sin tiros cargados, o con la R).
  cebar() {
    if (viejo() || this.cebaT > 0 || this.reserva <= 0 || this.tiros >= LP().tiros) return false;
    this.cebaT = CEBA;
    this.backT = 0;
    this.cerrojo(null, false);
    return true;
  }

  // ¿Lo tiene? (el Mate 47 en la mano con el especialista puesto)
  ready() {
    if (globalThis.__mduSinLanzapava === true || globalThis.__mduSinAccesorios === true) return false;
    const s = this.W.slot;
    return !!s && !s.temp && s.id === 'mate47' && !!Armas.especialista('mate47')?.on;
  }

  // La entrada (Weapons.update, antes de la recarga). true: la usó él.
  input(input, st, p, down) {
    if (!this.ready()) {
      if (this.on) this.set(false, true);
      return false;
    }
    if (input.hit('KeyN') && !down && this.W.state === 'idle') {
      this.set(!this.on);
      return true;
    }
    if (!this.on) return false;
    // (en el medio del cambio no tira; en lanzapava la R ceba la pava, no el fusil)
    if (this.k < 0.95 || this.backT > 0 || this.cebaT > 0) return true;
    if (input.hit('KeyR') && this.W.state === 'idle') {
      this.cebar();
      return true;
    }
    if (input.mouse.leftPressed && this.cd <= 0 && this.W.state === 'idle' && !p.sprinting) {
      if (this.tiros > 0) this.fire();
      else if (!this.cebar()) {
        this.g.audio.empty();
        this.set(false);
      }
    }
    return true;
  }

  set(on, instant = false) {
    if (on === this.on) return;
    this.on = on;
    if (instant) this.k = on ? 1 : 0;
    else this.cerrojo(null, on);
    this.W.updateHud();
  }

  // El ruido del cambio: el cerrojo de la pava y la tapa (pos: la de un compañero).
  cerrojo(pos, abre) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    try {
      const o = A.out({ pos, gain: pos ? 0.7 : 0.55, reverb: 0.05 });
      const t = A.now;
      // clac-clac del cerrojo y el tin de la tapa de chapa
      for (const [d, f] of [[0, 2300], [0.09, 3100]]) A.noise(o, { t: t + d, dur: 0.04, type: 'bandpass', freq: f, q: 5, gain: 0.8 });
      A.tone(o, { t: t + (abre ? 0.17 : 0.05), dur: 0.12, type: 'triangle', freq: abre ? 1480 : 1180, gain: 0.07 });
      A.noise(o, { t: t + 0.2, dur: 0.06, type: 'lowpass', freq: 600, q: 1, gain: 0.5 });
    } catch (e) {
      console.error(e);
    }
  }

  // Cada cuadro (Weapons.update): la animación, la tapa, y si cambió de mate.
  update(dt) {
    this.cd -= dt;
    const s = this.W.slot;
    if (s !== this.slot) {
      this.slot = s;
      if (this.on) this.set(false, true);
    }
    if (this.backT > 0 && (this.backT -= dt) <= 0) this.set(false);
    // cebando: al terminar entra el tiro (y si cambió de mate, se corta)
    if (this.cebaT > 0) {
      if (!this.on) this.cebaT = 0;
      else if ((this.cebaT -= dt) <= 0) {
        this.cebaT = 0;
        this.reserva--;
        this.tiros++;
        this.cerrojo(null, true);
        this.W.updateHud();
      }
    }
    const want = this.on ? 1 : 0;
    const step = dt / 0.38;
    this.k += clamp(want - this.k, -step, step);
    // la tapa de la pava se abre (en el modelo de la mano)
    const a = this.W.model?.acc?.lanzapava;
    // (cebando: la tapa se cierra y se vuelve a abrir)
    const ceba = this.cebaT > 0 ? Math.sin(clamp(1 - this.cebaT / CEBA) * Math.PI) : 0;
    if (a?.lid) a.lid.rotation.x = 0.85 * ease(clamp((this.k - 0.2) / 0.8)) * (1 - ceba);
    // lista para tirar, la pava humea por el pico (se ve de lejos: también en
    // la de los compañeros que la tienen abierta)
    this.humoT = (this.humoT || 0) - dt;
    if (this.humoT > 0) return;
    this.humoT = 0.08;
    if (this.on && this.k > 0.9 && a?.tip) this.humo(a.tip, 1, true);
    for (const av of this.g.net?.avatars?.list?.values?.() || []) {
      if (!av.gun || !/lanzapavaAbierta/.test(av.wkey || '') || !av.group?.visible) continue;
      if (av.lzGun !== av.gun) {
        av.lzGun = av.gun;
        av.lzTip = av.gun.getObjectByName('lanzapava-punta');
      }
      if (av.lzTip) this.humo(av.lzTip, 1.6);
    }
  }

  humo(tip, big = 1, mano = false) {
    const fx = this.g.fx?.alpha;
    if (!fx) return;
    const p = tip.getWorldPosition(this.tmp || (this.tmp = new THREE.Vector3()));
    if (mano) this.g.camera.localToWorld(p);
    fx.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.12, 0.25 + Math.random() * 0.15, (Math.random() - 0.5) * 0.12, { color: [0.9, 0.9, 0.88], size: 0.018 * big, size1: 0.11 * big, life: 0.8 + Math.random() * 0.4, alpha: 0.45, drag: 1.2 });
  }

  // La pose de la mano (Weapons.animate, después de armarla): el mate se da
  // vuelta para que la pava quede a la vista, con su pico a la mira, y en el
  // medio del cambio un tironcito.
  pose(holder) {
    if (this.k <= 0) return;
    const e = ease(clamp(this.k));
    const bump = Math.sin(clamp(this.k) * Math.PI);
    // (cebando: lo baja y lo inclina un poco, para meter la pavita)
    const ceba = this.cebaT > 0 ? Math.sin(clamp(1 - this.cebaT / CEBA) * Math.PI) : 0;
    holder.rotation.z -= e * 0.5 + ceba * 0.25;
    holder.rotation.x += e * 0.06 - bump * 0.08 - ceba * 0.22;
    holder.position.y -= ceba * 0.03;
    holder.position.x -= e * 0.012;
    holder.position.y += e * 0.016;
    holder.position.z += bump * 0.014;
  }

  // Lo que dice el HUD en modo lanzapava (Weapons.updateHud).
  hud() {
    return { name: 'Lanzapava', mag: this.tiros, reserve: viejo() ? LP().tiros : this.reserva, upgraded: false, desc: '' };
  }

  P() {
    // fijo: mata de un tiro hasta la ronda 20 (core/armas.js ARMERIA.lanzapava);
    // (antes: como la bomba de yerba, que crece con la ronda)
    const dmg = viejo() ? GRENADE.damage + (this.g.rounds?.round || 1) * 40 : LP().danio;
    return { speed: 30, gravity: 9, radius: 4.2, damage: dmg, splash: dmg, color: 0xffa040, size: 0.08, selfDamage: 40 };
  }

  mesh() {
    this.proto ||= buildGrenade(this.W.T, 'pava');
    const m = this.proto.clone();
    m.scale.setScalar(0.6);
    return m;
  }

  fire() {
    const W = this.W;
    const g = this.g;
    this.tiros--;
    this.cd = 0.5;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const tip = W.model?.acc?.lanzapava?.tip;
    // (la mano va en el espacio de la cámara: pasado al mundo, como Weapons.muzzleWorld)
    const from = tip ? g.camera.localToWorld(tip.getWorldPosition(new THREE.Vector3())) : W.muzzleWorld(new THREE.Vector3());
    // a donde mira la mira, con un poco de parábola
    const target = W.aimPoint(cam.position.clone(), fwd, 70);
    const vel = target.sub(from).normalize().multiplyScalar(30);
    vel.y += 1.6;
    W.spawnProjectile({ kind: 'shot', pos: from, vel, gravity: 9, P: this.P(), st: { id: 'mate47', headMult: 1, upgraded: false }, mesh: this.mesh(), life: 5 });
    g.net?.share('lpava', { x: +from.x.toFixed(2), y: +from.y.toFixed(2), z: +from.z.toFixed(2), vx: +vel.x.toFixed(2), vy: +vel.y.toFixed(2), vz: +vel.z.toFixed(2) });
    // el golpe del tiro: el ruido, el fogonazo, el humo y la patada
    g.audio.shot('launcher', null, false);
    g.fx.flash(from, 0xffb060, 6, 0.06, 6);
    for (let i = 0; i < 10; i++) {
      const v = 1.5 + Math.random() * 2.5;
      g.fx.alpha?.spawn(from.x, from.y, from.z, fwd.x * v + (Math.random() - 0.5) * 0.6, fwd.y * v + Math.random() * 0.5, fwd.z * v + (Math.random() - 0.5) * 0.6, { color: [0.55, 0.55, 0.52], size: 0.05, size1: 0.4, life: 0.5 + Math.random() * 0.4, alpha: 0.35, drag: 2.5 });
    }
    W.recoilKick = Math.min(1.5, (W.recoilKick || 0) + 1);
    g.player?.addRecoil(0.06, 0);
    g.stats && g.stats.shots++;
    W.updateHud();
    // sin tiros: ceba uno del repuesto, y si no hay, vuelve solo al fusil
    if (this.tiros <= 0) {
      if (!viejo() && this.reserva > 0) this.W.g.later(0.35, () => this.on && this.tiros <= 0 && this.cebar());
      else this.backT = 0.55;
    }
  }

  // La pavita de un compañero (Session 'lpava'): vuela y revienta, sin daño.
  ghost(m) {
    const W = this.W;
    W.spawnProjectile({ kind: 'shot', pos: new THREE.Vector3(m.x, m.y, m.z), vel: new THREE.Vector3(m.vx, m.vy, m.vz), gravity: 9, P: this.P(), st: { id: 'mate47', headMult: 1, upgraded: false }, mesh: this.mesh(), life: 5, ghost: true });
  }

  // Una baja con el Mate 47: junta para el próximo tiro (core/armas.js onBaja).
  baja(id) {
    // (ahora se llena con el Max Ammo: lleno())
    if (!viejo() || id !== 'mate47' || !this.ready()) return;
    if (this.tiros >= LP().tiros) {
      this.prog = 0;
      return;
    }
    if (++this.prog < LP().bajas) return;
    this.prog = 0;
    this.tiros++;
    // (se oye que volvió un tiro: un tin de la tapa)
    const A = this.g.audio;
    try {
      if (A?.ctx) A.tone(A.out({ gain: 0.4, reverb: 0.05 }), { t: A.now, dur: 0.18, type: 'triangle', freq: 1760, gain: 0.08 });
    } catch (e) {
      console.error(e);
    }
    this.W.updateHud();
  }
}
