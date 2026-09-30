import * as THREE from 'three';
import { shieldModel } from '../world/shieldModels';
import { setHeat } from '../world/ShieldUpgrade';
import { sfxRaise, sfxBash } from '../world/shieldSfx';

// El escudo adelante (Z, se cambia en Opciones): sale de la espalda y ocupa
// la mano en lugar del mate. Así cubre solo lo de adelante (entities/Player:
// damage mira player.shieldFront) y el clic (o V) da un escudazo: empuja y
// pega poco. 1/2/3/Q (o la rueda) lo guardan y vuelve el mate; la bomba y la
// pava lo guardan para tirar. Los compañeros lo ven adelante (net/Avatars).

const BASH = { damage: 170, range: 2.2, cone: 0.45, time: 0.5, hit: 0.13, max: 3 };
const INSPECT = 3.2;
// dónde va en la vista: abajo a la izquierda, con la cara para afuera
// (Weapons.tuning.shield, para ajustarlo)
export const SHIELD_VM = { pos: new THREE.Vector3(-0.26, -0.18, -0.5), rx: 0.04, ry: 0.6, rz: 0.15, scale: 0.5 };
const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();

// Una copia del escudo con materiales comunes (los del mundo llevan los
// parches de sombreado del mapa, que en la escena de la mano no van).
function vmify(obj) {
  const seen = new Map();
  const hot = [];
  const warm = [];
  const glow = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    let m = seen.get(o.material);
    if (!m) {
      const src = o.material;
      if (src.isMeshBasicMaterial) m = src.clone();
      else {
        // (los metales oscuros, de cerca y sin el reflejo del mapa, se veían
        // negros: menos metal y un poco más claros)
        const metal = src.metalness ?? 0;
        const color = src.color?.clone() || new THREE.Color(1, 1, 1);
        if (metal >= 0.5 && color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.2) color.offsetHSL(0, 0, 0.12);
        m = new THREE.MeshStandardMaterial({
          color,
          map: src.map || null,
          roughness: Math.max(0.35, src.roughness ?? 0.8),
          metalness: Math.min(0.55, metal),
          emissive: src.emissive?.clone() || new THREE.Color(0, 0, 0),
          emissiveIntensity: src.emissiveIntensity ?? 1,
          transparent: !!src.transparent,
          opacity: src.opacity ?? 1,
          side: src.side,
        });
        // (lo que se pone al rojo: todo lo de metal, también la chapa oxidada;
        // lo demás, apenas)
        if (metal >= 0.25) hot.push(m);
        else warm.push(m);
      }
      seen.set(src, m);
    }
    o.material = m;
  });
  obj.traverse((o) => {
    if (!obj.userData.glow?.includes(o) || glow.includes(o.material)) return;
    o.material.userData.base = o.material.color.clone();
    glow.push(o.material);
  });
  return { hot, warm, glow };
}

export default class ShieldHand {
  constructor(W) {
    this.W = W;
    this.g = W.g;
    this.root = new THREE.Group();
    this.root.visible = false;
    W.vmRoot.add(this.root);
    this.models = new Map();
    this.reset();
  }

  reset() {
    this.active = false;
    this.k = 0;
    this.bashT = -1;
    this.inspT = -1;
    this.hit = false;
    this.key = '';
    this.root.clear();
    this.cur = null;
    if (this.g.player) this.g.player.shieldFront = false;
  }

  // cuánto baja el mate (del todo a mitad de camino: después sube el escudo)
  get lowerK() {
    return Math.min(1, this.k * 2);
  }

  model(up) {
    const g = this.g;
    const key = `${g.mapId}|${up ? 1 : 0}`;
    if (this.key === key) return this.cur;
    this.key = key;
    let m = this.models.get(key);
    if (!m) {
      const obj = shieldModel(g.world.M, g.mapId, up);
      const mats = vmify(obj);
      // la cara para afuera: se ve de atrás, con las correas
      obj.rotation.y = Math.PI;
      const holder = new THREE.Group();
      holder.add(obj);
      holder.scale.setScalar(SHIELD_VM.scale);
      m = { holder, obj, ...mats };
      this.models.set(key, m);
    }
    this.root.clear();
    this.root.add(m.holder);
    this.cur = m;
    return m;
  }

  canRaise() {
    const W = this.W;
    const p = this.g.player;
    return !!p.shield && !W.temp && !p.downed && p.alive && !p.underwater && !['drink', 'throw', 'knife'].includes(W.state);
  }

  toggle(on) {
    if (on === this.active) return;
    this.active = on;
    this.bashT = -1;
    this.inspT = -1;
    sfxRaise(this.g.audio, on);
  }

  // La entrada con el escudo (Weapons.handleInput la consulta primero):
  // true si ya la usó.
  input(input) {
    const W = this.W;
    if (input.hit('KeyZ')) {
      if (this.active) this.toggle(false);
      else if (this.canRaise()) {
        // (corta lo que estaba haciendo el mate: la recarga, inspeccionar)
        W.pourSnd?.stop();
        W.pourSnd = null;
        W.state = 'idle';
        this.toggle(true);
      }
      return true;
    }
    if (!this.active) return false;
    // tirar algo o cambiar de mate lo guarda (y sigue con eso)
    if (input.hit('KeyG') || input.hit('KeyT') || input.hit('Digit4')) {
      this.toggle(false);
      return false;
    }
    if (input.hit('Digit1') || input.hit('Digit2') || input.hit('Digit3') || input.hit('KeyQ') || input.mouse.wheel) {
      this.toggle(false);
      if (!W.busy) W.startRaise();
      return false;
    }
    // E: lo da vuelta para mirarle el frente (se corta con E o con un escudazo)
    if (input.hit('KeyE')) {
      this.inspT = this.inspT >= 0 ? -1 : 0;
      return true;
    }
    const want = input.mouse.leftPressed || input.hit('KeyV') || (input.mouse.left && this.buffer);
    if (want && this.bashT < 0 && this.k > 0.85) {
      this.inspT = -1;
      this.buffer = false;
      this.bashT = 0;
      this.hit = false;
    } else if (input.mouse.leftPressed && this.bashT > 0.3) this.buffer = true;
    return true;
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    const W = this.W;
    if (this.active && (!p.shield || W.temp || p.downed || !p.alive || p.underwater || W.state === 'drink')) this.toggle(false);
    const target = this.active ? 1 : 0;
    this.k += Math.sign(target - this.k) * Math.min(Math.abs(target - this.k), dt * 5);
    p.shieldFront = this.active && this.k > 0.5;
    if (this.bashT >= 0) {
      this.bashT += dt;
      if (this.bashT > BASH.hit && !this.hit) this.strike();
      if (this.bashT > BASH.time) this.bashT = -1;
    }
    if (this.inspT >= 0) {
      this.inspT += dt;
      if (this.inspT > INSPECT) this.inspT = -1;
    }
  }

  // El escudazo: hasta tres zombies adelante, a menos de dos metros.
  strike() {
    const g = this.g;
    const p = g.player;
    this.hit = true;
    const fwd = tmpF.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const upg = g.activities?.upg;
    const list = [];
    for (const { z, d } of g.zombies.inRadius(p.pos, BASH.range)) {
      if (z.dead || Math.abs((z.pos.y || 0) - p.pos.y) > 1.6) continue;
      const dx = z.pos.x - p.pos.x;
      const dz = z.pos.z - p.pos.z;
      if ((dx * fwd.x + dz * fwd.z) / (d || 1) < BASH.cone) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    const dmg = BASH.damage * (upg?.bashMult() ?? 1) * (g.emp?.knifeMult?.() ?? 1);
    for (const { z } of list.slice(0, BASH.max)) {
      const point = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.25 * (z.scale || 1), z.pos.z);
      g.zombies.damage(z, dmg, { type: 'bash', zone: 'torso', point, dir: fwd.clone() });
      upg?.onBashHit(z, fwd);
    }
    const anvil = upg?.onBash(p.pos, fwd);
    upg?.bashFlame(p.pos, fwd);
    const any = list.length > 0 || anvil;
    sfxBash(g.audio, any);
    // (los compañeros lo ven: net/Avatars)
    if (g.net) g.net.share('sup', { k: 'bash', id: g.net.id });
    if (list.length) {
      g.hud.hitmarker(false);
      g.fx.addShake(0.1);
      p.addRecoil?.(0.01, 0);
    }
  }

  // La pose en la vista (Weapons.animate, después de mover el mate).
  animate(dt) {
    const g = this.g;
    const W = this.W;
    const p = g.player;
    const vis = this.k > 0.5;
    this.root.visible = vis;
    if (!vis) return;
    const s = p.shield;
    const m = this.model(!!s?.up);
    const e = Math.max(0, (this.k - 0.5) * 2);
    const up = 1 - (1 - e) * (1 - e);
    const V = SHIELD_VM;
    m.holder.scale.setScalar(V.scale);
    const pos = tmpV.copy(V.pos);
    pos.y -= (1 - up) * 0.45;
    let rx = -(1 - up) * 0.9 + V.rx;
    let ry = V.ry;
    let rz = V.rz;
    // caminando se bambolea, y sigue un poco al mouse
    const bob = p.moving && p.onGround ? 1 : 0;
    pos.x += Math.cos(p.bobPhase) * 0.012 * bob + W.sway.x * 0.8;
    pos.y += -Math.abs(Math.sin(p.bobPhase)) * 0.014 * bob + W.sway.y * 0.8;
    rz += Math.cos(p.bobPhase) * 0.02 * bob;
    // el escudazo: para adelante de golpe y vuelve
    if (this.bashT >= 0) {
      const t = this.bashT;
      const k = t < BASH.hit ? t / BASH.hit : Math.max(0, 1 - (t - BASH.hit) / (BASH.time - BASH.hit));
      const kk = k * k * (3 - 2 * k);
      pos.z -= kk * 0.2;
      pos.x += kk * 0.07;
      rx -= kk * 0.12;
      ry -= kk * 0.3;
    }
    // inspeccionar: al medio y dado vuelta, con la cara (y lo de la mejora) a la vista
    if (this.inspT >= 0) {
      const t = this.inspT;
      const k = Math.min(1, t / 0.45) * Math.min(1, Math.max(0, (INSPECT - t) / 0.45));
      const kk = k * k * (3 - 2 * k);
      pos.x += (0.02 - pos.x) * kk;
      pos.y += (-0.12 - pos.y) * kk;
      pos.z += (-0.52 - pos.z) * kk;
      ry += (Math.PI - ry + Math.sin(t * 1.1) * 0.35) * kk;
      rx += (0.12 - rx) * kk;
      rz += (Math.sin(t * 0.8) * 0.12 - rz) * kk;
    }
    m.holder.position.copy(pos);
    m.holder.rotation.set(rx, ry, rz);
    // al rojo (el penal, el castillo), la llamarada cargada, las chispas
    // (de cerca, en la luz de la mano, con menos brillo: si no, se ve blanco)
    setHeat(m.hot, s?.heat || 0, g.time, 0.45);
    setHeat(m.warm, s?.heat || 0, g.time, 0.12);
    const ch = s?.charge || 0;
    const blazon = g.activities?.upg?.U?.prop === 'blazon';
    const f = blazon ? (ch >= 5 ? 1.6 + Math.sin(g.time * 10) * 0.7 : 0.5 + ch * 0.2) : 0.7 + Math.random() * 0.7;
    for (const mt of m.glow) mt.color.copy(mt.userData.base).multiplyScalar(f);
    if (blazon && ch > 0) setHeat(m.hot, ch >= 5 ? 0.6 + Math.sin(g.time * 6) * 0.25 : ch * 0.08, g.time, 0.6);
  }
}
