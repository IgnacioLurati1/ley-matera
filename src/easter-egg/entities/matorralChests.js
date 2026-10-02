import * as THREE from 'three';
import { WEAPONS, BOX_POOL, GRENADE, tierOf, maxTier, boxWeight } from '../config/weapons';
import { PERKS } from '../config/perks';
import { PERK_SPOTS } from '../config/map';
import { mesh, boxGeo } from '../world/props';

// Los cofres del matorral de La Tapera (entities/Matorral.js). Cuando entra el
// primero al maizal crecido aparecen al azar en algunos campamentos (no en el
// de la Yerba Madre). Nada los marca: el matorral es un laberinto y hay que
// encontrarlos (el usuario, 2026-10-01: nada de columnas de luz ni guías).
// Cada uno se abre una vez (mantener F) y le da algo al que lo abrió: plata,
// munición, bombas de yerba, un mate de la caja, un perk o el mate de la mano
// mejorado, gratis. Con el fuego, los que quedaron cerrados se queman.
// En línea: el anfitrión los pone y decide quién abre cada uno ('mato' {k:
// 'chest'}, {k:'open'} del invitado, {k:'opened'}); lo que sale lo tira el
// que lo abre, en su compu.

const COUNT = 3;
const HOLD = 0.9;
// lo que puede salir, con su peso: de plata a un Pack-a-Pava gratis
const LOOT = [
  ['puntos', 30],
  ['municion', 20],
  ['bombas', 12],
  ['arma', 16],
  ['perk', 13],
  ['pap', 9],
];
const POINTS = 1500;
const GOLD = [1, 0.82, 0.38];
const tmpV = new THREE.Vector3();

export default class MatorralChests {
  constructor(m) {
    this.m = m;
    this.g = m.g;
    // (anfitrión) el primero que entra los hace aparecer (una vez por cada vez que crece)
    this.armed = true;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.slots = [];
    for (let i = 0; i < COUNT; i++) this.slots.push(this.build(i));
  }

  // ---------------- el cofre ----------------
  // Un baúl criollo de madera oscura con flejes de hierro y cerradura de
  // bronce; la tapa gira desde atrás.
  build(i) {
    const g = this.g;
    const M = g.world.M;
    const S = this.shared();
    const grp = new THREE.Group();
    grp.visible = false;
    grp.add(mesh(S.body, M.woodDark, 0, 0.24, 0));
    for (const x of [-0.3, 0.3]) grp.add(mesh(S.band, M.iron, x, 0.24, 0));
    grp.add(mesh(S.foot, M.iron, 0, 0.02, 0));
    const lid = new THREE.Group();
    lid.position.set(0, 0.48, -0.28);
    lid.add(mesh(S.lid, M.woodDark, 0, 0.07, 0.28));
    lid.add(mesh(S.lidTop, M.woodDark, 0, 0.16, 0.28));
    for (const x of [-0.3, 0.3]) lid.add(mesh(S.lidBand, M.iron, x, 0.1, 0.28));
    lid.add(mesh(S.lock, M.brass, 0, 0.02, 0.575));
    grp.add(lid);
    // adentro, el brillo que sale al abrir
    const inner = new THREE.Mesh(S.inner, S.innerMat);
    inner.position.y = 0.47;
    inner.visible = false;
    grp.add(inner);
    inner.castShadow = false;
    inner.userData.reflect = false;
    this.root.add(grp);
    const at = new THREE.Vector3();
    const slot = { i, grp, lid, inner, at, on: false, state: 0, pending: false, pendT: 0, t: 0 };
    // mantener F para abrirlo (en cada compu; de invitado se le pide al anfitrión)
    g.interact.add({
      kind: 'ee',
      hold: true,
      holdTime: HOLD,
      local: true,
      pos: at,
      radius: 1.9,
      prompt: () => (slot.on && !slot.state && !slot.pending ? { text: 'abrir el cofre', hold: true, noCost: true } : null),
      cost: () => 0,
      use: () => this.tryOpen(i),
    });
    return slot;
  }

  shared() {
    if (this.S) return this.S;
    this.S = {
      body: boxGeo(0.9, 0.44, 0.55),
      band: boxGeo(0.05, 0.46, 0.57),
      foot: boxGeo(0.94, 0.04, 0.59),
      lid: boxGeo(0.92, 0.14, 0.57),
      lidTop: boxGeo(0.86, 0.06, 0.45),
      lidBand: boxGeo(0.05, 0.2, 0.59),
      lock: boxGeo(0.1, 0.12, 0.03),
      inner: new THREE.PlaneGeometry(0.82, 0.48),
      innerMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.2), toneMapped: false, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.S.inner.rotateX(-Math.PI / 2);
    return this.S;
  }

  // ---------------- dónde (anfitrión) ----------------
  // Cada vez que crece el maizal, el primero que entra los hace aparecer.
  hostTick() {
    const M = this.m;
    if (M.state !== 'grown') return;
    if (!this.armed || !M.anyoneInside()) return;
    this.armed = false;
    const camps = M.camps.hides.map((_, ci) => ci).filter((ci) => ci > 0);
    for (let k = camps.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [camps[k], camps[j]] = [camps[j], camps[k]];
    }
    const list = camps.slice(0, COUNT).map((ci) => {
      const [x, z] = this.spot(ci);
      // de frente al fogón del campamento
      const f = M.camps.fires[ci];
      return [+x.toFixed(2), +z.toFixed(2), +Math.atan2(f.x - x, f.z - z).toFixed(2), 0];
    });
    this.apply(list, true);
    this.g.net?.event('mato', { k: 'chest', ch: list });
  }

  // Adentro del claro (el borde lo tapa el maíz), lejos del fogón y de las cosas.
  spot(ci) {
    const M = this.m;
    const c = M.C.camps[ci];
    const f = M.camps.fires[ci];
    const [cx, cz] = c.at;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = c.r * (0.4 + Math.random() * 0.25);
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (Math.hypot(x - f.x, z - f.z) < 2) continue;
      if (M.camps.boxes.some((b) => x > b[0] - 0.9 && x < b[3] + 0.9 && z > b[2] - 0.9 && z < b[5] + 0.9)) continue;
      return [x, z];
    }
    const h = M.camps.hides[ci];
    return h[Math.floor(Math.random() * h.length)];
  }

  // Lo que va en el estado del matorral (para los que entran después).
  net() {
    return this.slots.filter((s) => s.on).map((s) => [+s.at.x.toFixed(2), +s.at.z.toFixed(2), +s.grp.rotation.y.toFixed(2), s.state]);
  }

  // Pone los cofres de la lista ([x, z, giro, estado]); los demás se apagan.
  apply(list, fresh = false) {
    const w = this.g.world;
    this.slots.forEach((s, i) => {
      const c = list?.[i];
      if (!c) {
        s.on = false;
        s.grp.visible = false;
        return;
      }
      const moved = !s.on || Math.abs(s.at.x - c[0]) > 0.05 || Math.abs(s.at.z - c[1]) > 0.05;
      if (moved || fresh) {
        const y = w.floorAt(c[0], c[1]);
        s.grp.position.set(c[0], y, c[1]);
        s.grp.rotation.y = c[2];
        s.at.set(c[0], y + 0.5, c[1]);
        s.on = true;
        s.state = 0;
        s.pending = false;
        s.t = 0;
        s.lid.rotation.x = 0;
        s.grp.visible = true;
        this.paint(s);
      }
      if (c[3] && c[3] !== s.state) this.setState(s, c[3], null);
    });
  }

  // Al quemarse el matorral, los cerrados se queman; quemado o crecido de
  // nuevo, no queda ninguno (y el próximo que entre los vuelve a poner).
  onState(state) {
    if (state === 'fire') {
      for (const s of this.slots) if (s.on && !s.state) this.setState(s, 2, null);
    } else {
      for (const s of this.slots) {
        s.on = false;
        s.grp.visible = false;
      }
      if (state === 'grown') this.armed = true;
    }
  }

  // ---------------- abrirlo ----------------
  tryOpen(i) {
    const g = this.g;
    const s = this.slots[i];
    if (!s.on || s.state || s.pending) return false;
    if (g.net?.guest) {
      s.pending = true;
      s.pendT = 3;
      g.net.share('mato', { k: 'open', i, by: g.net.id });
      return true;
    }
    this.open(i, g.net?.id ?? 0);
    return true;
  }

  // (anfitrión) el primero que lo pide se lo lleva
  open(i, by) {
    const s = this.slots[i];
    if (!s?.on || s.state) return;
    this.setState(s, 1, by);
    this.g.net?.event('mato', { k: 'opened', i, by });
  }

  setState(s, st, by) {
    const g = this.g;
    s.state = st;
    s.t = 0;
    s.pending = false;
    if (st === 1) {
      g.audio.boxOpen?.(s.at);
      g.fx.sparkle(tmpV.copy(s.at).setY(s.at.y + 0.2), GOLD, 26, 0.7);
      s.inner.visible = true;
      if (by != null && by === (g.net?.id ?? 0)) this.loot(s);
    } else if (st === 2) {
      // quemado: humea y se pone negro
      g.fx.fire(tmpV.copy(s.at), 0.6, 6);
      this.paint(s, true);
    }
  }

  // Quemado: todo en negro (el material quemado es uno solo, compartido).
  paint(s, burnt = false) {
    this.burntMat ||= new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 });
    s.grp.traverse((o) => {
      if (!o.isMesh || o === s.inner) return;
      o.userData.mat0 ||= o.material;
      o.material = burnt ? this.burntMat : o.userData.mat0;
    });
    s.inner.visible = false;
  }

  // ---------------- lo que sale (en la compu del que lo abrió) ----------------
  loot(s) {
    const g = this.g;
    const W = g.weapons;
    const sl = W.slot;
    const canPap = !!sl && sl.id !== 'hoz' && !WEAPONS[sl.id]?.wonder && tierOf(sl.up) < maxTier(sl.id);
    const missing = this.missingPerks();
    const ok = { pap: canPap, perk: missing.length > 0, bombas: W.grenades < GRENADE.max || W.tactical?.id === 'pava' };
    const pool = LOOT.filter(([k]) => ok[k] !== false);
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    let kind = pool[0][0];
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    g.audio.powerupGrab();
    if (kind === 'pap') {
      const up = tierOf(sl.up) + 1;
      W.give(sl.id, up);
      g.hud.toast('¡Pack-a-Pava gratis!');
      g.fx.sparkle(tmpV.copy(s.at).setY(s.at.y + 0.6), [0.6, 0.4, 1], 30, 0.8);
      return 'pap';
    }
    if (kind === 'perk') {
      const id = missing[0];
      W.drink(PERKS[id].color, () => g.player.givePerk(id));
      g.audio.perkJingle(id, g.player.pos);
      g.hud.toast(`${PERKS[id].name} gratis`);
      return 'perk';
    }
    if (kind === 'arma') {
      const id = this.pickWeapon();
      if (id) {
        W.give(id);
        g.hud.toast(WEAPONS[id].name);
        return 'arma';
      }
    }
    if (kind === 'municion') {
      W.maxAmmo();
      W.updateHud();
      g.hud.toast('Munición');
      return 'municion';
    }
    if (kind === 'bombas') {
      W.grenades = GRENADE.max;
      if (W.tactical?.id === 'pava') W.tactical.count = WEAPONS.pava.count;
      W.updateHud();
      g.hud.toast('Bombas de yerba');
      return 'bombas';
    }
    g.addPoints(POINTS, null, true);
    g.hud.toast(`+${POINTS}`);
    return 'puntos';
  }

  missingPerks() {
    const p = this.g.player;
    const ids = [...new Set(PERK_SPOTS.map((x) => x.perk))].filter((id) => PERKS[id] && !p.perks.has(id));
    return ids.sort(() => Math.random() - 0.5);
  }

  // Un mate de la caja de este mapa que no tengas (los especiales, poco).
  pickWeapon() {
    const g = this.g;
    const map = g.mapId;
    const have = new Set(g.weapons.slots.map((s) => s.id));
    const list = BOX_POOL.filter((w) => (!w.only || w.only.includes(map)) && !have.has(w.id) && WEAPONS[w.id].kind !== 'tactical');
    let r = Math.random() * list.reduce((a, w) => a + boxWeight(w, map), 0);
    for (const w of list) {
      r -= boxWeight(w, map);
      if (r <= 0) return w.id;
    }
    return list[0]?.id || null;
  }

  // ---------------- red ----------------
  onEvent(m) {
    const g = this.g;
    if (m.k === 'open') {
      if (!g.net?.guest) this.open(m.i | 0, m.by);
    } else if (m.k === 'opened') {
      const s = this.slots[m.i | 0];
      if (s?.on && s.state !== 1) this.setState(s, 1, m.by);
    } else if (m.k === 'chest') {
      if (g.net?.guest) this.apply(m.ch, true);
    }
  }

  // ---------------- cada cuadro (todas las compus) ----------------
  update(dt) {
    const g = this.g;
    for (const s of this.slots) {
      if (!s.on) continue;
      s.t += dt;
      if (s.pending && (s.pendT -= dt) <= 0) s.pending = false;
      if (s.state === 1) {
        // la tapa se abre (adentro brilla un momento)
        const k = Math.min(1, s.t / 0.5);
        s.lid.rotation.x = -1.9 * (1 - (1 - k) * (1 - k));
        s.inner.visible = s.t < 3;
        continue;
      }
      if (s.state === 2 && s.t < 4 && Math.random() < dt * 6) g.fx.fire(tmpV.copy(s.at), 0.4, 1);
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
