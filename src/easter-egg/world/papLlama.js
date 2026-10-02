import * as THREE from 'three';
import { EE } from '../config/map';
import { flameMaterial, emberMat } from './castleFire';
import { lathe } from './monumentoKit';
import Carry, { itemModel } from './monumentoCarry';
import { players, playerById, myId, isHost, isDown, announce } from '../entities/castle/common';

// El Pack-a-Pava del Monumento es la Llama Votiva del Propileo (la llama
// eterna al Soldado Desconocido, un granadero de San Lorenzo). Está apagada:
// la niebla del río la ahogó. Para prenderla y poner la pava:
//  1. El fuego del cañón: en la Batería Libertad (el Parque, sobre la
//     barranca) se dispara el cañón (mantener F); la mecha prende la antorcha
//     del soporte.
//  2. El relevo de la antorcha: hay que llevarla hasta el Propileo. Con la
//     antorcha no se dispara (el clic quema de un golpe), cada golpe que te dan
//     achica la llama y el agua la apaga; G la deja en el piso (y otro la
//     levanta). Los cuatro pebeteros de la escalinata y las gradas se prenden
//     al pasar y quedan de punto de partida si se apaga.
//  3. La Llama ruge. Arriba no hay pava: está en el fondo del río. En la punta
//     del muelle hay una caña: mantener F para tirar, el clic recoge (si el
//     hilo se pone rojo, soltar, o se corta). Lo que muerde es el Surubí: hay
//     que bajarle media vida, escupe la pava y se vuelve al agua.
//  4. La pava, pesada (se camina despacio, sin armas), a la Llama: silba y
//     queda el Pack-a-Pava.
// Lo arma world/PapQuest.js (kind 'llama'): prompt, use, update, state/apply,
// onGuest y complete. Lo decide el anfitrión; los invitados avisan con 'papq'.

const STAGES = ['apagada', 'antorcha', 'pesca', 'surubi', 'pava', 'lista'];
const LLAMA_Y = 4.2;
const BOWL_Y = 1.32;
const TORCH_BURN = 1 / 150;
const TORCH_HIT = 0.22;
const DROP_LIFE = 25;
const PEB_R = 1.7;
const CANA_HOLD = 1.0;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class PapLlama {
  constructor(q) {
    this.q = q;
    this.g = q.g;
    const g = this.g;
    const M = g.world.M;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.st = 0;
    // la antorcha: 'none', 'stand' (en el soporte), 'floor', 'held'
    this.torch = { at: 'none', pos: new THREE.Vector3(), carrier: -1, fuel: 1, life: 0, from: -1 };
    this.peb = [false, false, false, false];
    // la pava: 'river', 'floor', 'held', 'set'
    this.pava = { at: 'river', pos: new THREE.Vector3(), carrier: -1 };
    this.fish = { by: -1, k: 0, tension: 0, t: 0 };
    this.carry = new Carry(g);
    this.carry.onSwing = (kind) => this.swing(kind);
    this.carry.onDrop = (kind) => this.askDrop(kind);
    this.buildLlama(M);
    this.buildBateria(M);
    this.buildPebeteros(M);
    this.buildCana(M);
    this.buildItems(M);
    this.lit = 0;
    this.fireOn = false;
  }

  // ---------------- la Llama (y la máquina, que se muda al medio de la nave) ----------------
  buildLlama(M) {
    const g = this.g;
    const pap = this.q.pap;
    const [lx, lz] = EE.llama;
    // la máquina común se esconde: queda la pava (que va arriba de la llama)
    for (const c of pap.group.children) if (c !== pap.kettle) c.visible = false;
    pap.group.position.set(lx, LLAMA_Y, lz);
    pap.group.rotation.y = 0;
    pap.kettle.scale.setScalar(0.62);
    pap.kettle.position.set(0, BOWL_Y + 0.62, 0);
    pap.kettle.visible = false;
    // la máquina tenía su caja contra el pilono: se apaga y va una a la llama
    for (const b of g.world.boxes) if (b.kind === 'machine' && Math.abs((b.x0 + b.x1) / 2 - 27.5) < 2 && b.z1 < 22.5) b.active = false;
    g.world.addBox([lx - 0.95, LLAMA_Y, lz - 0.95, lx + 0.95, LLAMA_Y + 2.2, lz + 0.95], { kind: 'machine' });
    // el pedestal de bronce, la urna del Soldado Desconocido y el cuenco
    const L = new THREE.Group();
    const plinth = new THREE.Mesh(lathe([[0, 0], [1.0, 0], [1.0, 0.12], [0.92, 0.18], [0.92, 0.26], [0, 0.26]], 8), M.travertino);
    L.add(plinth);
    const ped = new THREE.Mesh(lathe([[0, 0.26], [0.62, 0.26], [0.66, 0.32], [0.55, 0.42], [0.5, 0.9], [0.58, 0.98], [0.62, 1.08], [0.4, 1.14], [0.36, 1.2], [0, 1.2]], 28), M.bronze);
    L.add(ped);
    const bowl = new THREE.Mesh(lathe([[0.3, 1.18], [0.5, 1.2], [0.86, 1.3], [0.98, 1.4], [0.96, 1.46], [0.8, 1.42], [0.5, 1.36], [0.0, 1.34]], 32), M.bronze);
    L.add(bowl);
    // la inscripción del frente del pedestal: una plaquita
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.04), M.bronzeDark);
    plaque.position.set(0, 0.68, 0.51);
    L.add(plaque);
    // el trébede de hierro donde se apoya la pava (aparece con ella)
    const trivet = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), M.iron);
      leg.position.set(Math.cos(a) * 0.42, BOWL_Y + 0.3, Math.sin(a) * 0.42);
      leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      trivet.add(leg);
    }
    const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 20), M.iron);
    ringT.rotation.x = Math.PI / 2;
    ringT.position.y = BOWL_Y + 0.6;
    trivet.add(ringT);
    trivet.visible = false;
    L.add(trivet);
    // las brasas y la llama (planos cruzados)
    const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 18), emberMat());
    embers.position.y = BOWL_Y + 0.04;
    L.add(embers);
    const flames = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8).translate(0, 0.9, 0), flameMaterial());
      f.rotation.y = (k / 4) * Math.PI;
      f.renderOrder = 5;
      flames.add(f);
    }
    flames.position.y = BOWL_Y + 0.02;
    L.add(flames);
    L.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.material.isShaderMaterial;
        o.receiveShadow = true;
      }
    });
    pap.group.add(L);
    this.llama = { L, flames, embers, trivet };
    // la luz de la llama del config: apagada hasta que se prenda
    this.light = g.world.lights.find((e) => e.def.kind === 'fire' && Math.abs(e.def.pos[0] - lx) < 0.5 && Math.abs(e.def.pos[2] - lz) < 0.5);
    if (this.light) this.lightBase = this.light.base;
    // dónde aparece el mate cuando se mejora: arriba, delante de la pava
    pap.slotPos = new THREE.Vector3(lx, LLAMA_Y + 2.4, lz + 0.9);
    pap.face = new THREE.Vector3(0, 0, 1);
    for (const it of [this.q.papIt, ...g.interact.list.filter((x) => x.kind === 'papq')]) {
      it.pos.set(lx, LLAMA_Y + 1.2, lz);
      it.front?.set(lx, LLAMA_Y, lz + 1.6);
      it.floorY = LLAMA_Y;
      it.radius = 2.6;
    }
    // los quemadores de la Llamarada Votiva (la trampa): un anillo en el piso
    const noz = new THREE.CylinderGeometry(0.11, 0.13, 0.04, 10);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const n = new THREE.Mesh(noz, M.bronzeDark);
      n.position.set(lx + Math.cos(a) * 2.4, LLAMA_Y + 0.02, lz + Math.sin(a) * 2.4);
      this.root.add(n);
    }
  }

  // ---------------- la Batería Libertad: el cañón y el soporte de la antorcha ----------------
  buildBateria(M) {
    const g = this.g;
    const [bx, bz] = EE.bateria;
    const y = g.world.floorAt(bx, bz);
    // el soporte de hierro de la antorcha, al lado del cañón
    const st = new THREE.Group();
    st.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.1, 6), M.iron).translateY(0.55));
    st.add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), M.iron).translateY(1.05).rotateX(Math.PI / 2));
    st.position.set(bx - 0.8, y, bz + 0.9);
    this.root.add(st);
    this.standPos = new THREE.Vector3(bx - 0.8, y + 0.95, bz + 0.9);
    this.cannon = g.world.mon?.bateria?.[1] || null;
    this.cannonIt = g.interact.add({
      kind: 'canon',
      pos: new THREE.Vector3(bx, y + 1.0, bz + 1.2),
      floorY: y,
      radius: 2.0,
      holdTime: CANA_HOLD,
      prompt: () => {
        if (this.st === 0) return { text: 'disparar el cañón de la Batería Libertad', noCost: true, hold: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.st !== 0) return false;
        if (!isHost(this.g)) return true;
        this.fireCannon();
        return true;
      },
    });
  }

  fireCannon(remote = false) {
    const g = this.g;
    const c = this.cannon;
    const muzzle = c ? c.localToWorld(tmpV.set(0, 0.7, -2.1)) : tmpV.copy(this.cannonIt.pos);
    g.audio.explosion(muzzle.clone());
    g.fx.explosion(muzzle.clone(), 1.2, [1, 0.6, 0.25]);
    g.fx.flash(muzzle.clone(), 0xffb060, 30, 0.25, 30);
    g.fx.addShake?.(0.35);
    // la bala cae en el río, lejos (un chapuzón)
    g.water?.splash?.(150, EE.bateria[1] + 4, 3);
    if (c) c.userData.kick = 1;
    if (remote) return;
    // la mecha prendió la antorcha del soporte
    this.st = 1;
    this.torch.at = 'stand';
    this.torch.pos.copy(this.standPos);
    this.torch.fuel = 1;
    announce(g, 'La mecha prendió la antorcha. Llevala a la Llama Votiva, en el Propileo.', 4.5, true);
    this.sync({ cn: 1 });
  }

  // ---------------- los pebeteros ----------------
  buildPebeteros(M) {
    this.pebs = EE.pebeteros.map(([x, z]) => {
      const y = this.g.world.floorAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.add(new THREE.Mesh(lathe([[0, 0], [0.24, 0], [0.24, 0.06], [0.1, 0.12], [0.07, 0.9], [0.12, 0.96], [0.36, 1.08], [0.4, 1.16], [0, 1.12]], 14), M.bronze));
      const fl = new THREE.Group();
      for (const ry of [0, Math.PI / 2]) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9).translate(0, 0.45, 0), flameMaterial());
        f.rotation.y = ry;
        f.renderOrder = 5;
        fl.add(f);
      }
      fl.position.y = 1.12;
      fl.visible = false;
      grp.add(fl);
      const light = new THREE.PointLight(0xff8a3a, 0, 8, 1.8);
      light.position.y = 1.6;
      grp.add(light);
      this.root.add(grp);
      this.g.world.addBox([x - 0.25, y, z - 0.25, x + 0.25, y + 1.2, z + 0.25], { kind: 'prop', solid: false });
      return { grp, fl, light, pos: new THREE.Vector3(x, y + 1.2, z) };
    });
  }

  // ---------------- la caña de pescar del muelle ----------------
  buildCana(M) {
    const g = this.g;
    const [cx, cz] = EE.cana;
    const y = g.world.floorAt(cx, cz);
    const rod = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.6, 6), M.woodDark);
    pole.position.set(0, 1.3, 0);
    pole.rotation.x = -0.9;
    rod.add(pole);
    rod.position.set(cx, y + 0.3, cz);
    rod.rotation.y = Math.PI / 2;
    this.root.add(rod);
    this.rod = rod;
    this.canaIt = g.interact.add({
      kind: 'cana',
      pos: new THREE.Vector3(cx, y + 1.0, cz),
      floorY: y,
      radius: 1.8,
      holdTime: 0.6,
      prompt: () => {
        if (this.st !== 2) return null;
        if (this.fish.by >= 0) return null;
        return { text: 'tirar la caña al río', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        if (this.st !== 2 || this.fish.by >= 0) return false;
        const who = g.net?.useFrom ?? myId(g);
        if (!isHost(g)) return true;
        this.startFishing(who);
        return true;
      },
    });
    // la barra del hilo (en pantalla, mientras pesca uno mismo)
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:22%;width:260px;height:14px;margin-left:-130px;border:2px solid rgba(255,255,255,0.7);border-radius:8px;background:rgba(0,0,0,0.45);display:none;z-index:30;overflow:hidden';
    el.innerHTML = '<div style="position:absolute;inset:0;background:linear-gradient(90deg,#3a8a4a 0%,#3a8a4a 62%,#c8a020 62%,#c8a020 82%,#c82020 82%)"></div><div class="mon-t" style="position:absolute;top:-3px;bottom:-3px;width:4px;background:#fff;left:0"></div><div class="mon-k" style="position:absolute;left:0;bottom:0;height:3px;background:#9ad0ff;width:0"></div>';
    document.body.appendChild(el);
    this.bar = el;
  }

  // ---------------- lo que se agarra del piso (la antorcha, la pava) ----------------
  buildItems(M) {
    const g = this.g;
    this.torchM = itemModel('antorcha', M);
    this.torchM.visible = false;
    this.root.add(this.torchM);
    this.pavaM = itemModel('pava', M);
    this.pavaM.visible = false;
    this.root.add(this.pavaM);
    this.torchIt = g.interact.add({
      kind: 'antorcha',
      pos: new THREE.Vector3(),
      radius: 1.6,
      prompt: () => ((this.torch.at === 'stand' || this.torch.at === 'floor') && !this.carry.kind ? { text: 'agarrar la antorcha', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.torch.at !== 'stand' && this.torch.at !== 'floor') return false;
        const who = g.net?.useFrom ?? myId(g);
        if (!isHost(g)) return true;
        this.takeTorch(who);
        return true;
      },
    });
    this.pavaIt = g.interact.add({
      kind: 'pavaRio',
      pos: new THREE.Vector3(),
      radius: 1.8,
      prompt: () => (this.pava.at === 'floor' && !this.carry.kind ? { text: 'levantar la pava (pesa)', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.pava.at !== 'floor') return false;
        const who = g.net?.useFrom ?? myId(g);
        if (!isHost(g)) return true;
        this.takePava(who);
        return true;
      },
    });
  }

  takeTorch(id) {
    this.torch.at = 'held';
    this.torch.carrier = id;
    this.sync();
  }

  takePava(id) {
    this.pava.at = 'held';
    this.pava.carrier = id;
    this.sync();
  }

  // G: dejar lo que se lleva (el invitado se lo pide al anfitrión)
  askDrop(kind) {
    const g = this.g;
    if (!isHost(g)) {
      g.net.net.send({ t: 'papq', a: 'drop', k: kind });
      return;
    }
    this.dropFrom(myId(g));
  }

  dropFrom(id) {
    const g = this.g;
    const p = playerById(g, id);
    const at = p ? tmpV.copy(p.pos) : tmpV.copy(this.torch.pos);
    const y = g.world.floorAt(at.x, at.z, at.y + 0.5);
    if (this.torch.at === 'held' && this.torch.carrier === id) {
      this.torch.at = 'floor';
      this.torch.carrier = -1;
      this.torch.pos.set(at.x, y + 0.15, at.z);
      this.torch.life = DROP_LIFE;
      this.sync();
    } else if (this.pava.at === 'held' && this.pava.carrier === id) {
      this.pava.at = 'floor';
      this.pava.carrier = -1;
      this.pava.pos.set(at.x, y, at.z);
      this.sync();
    }
  }

  // El clic con la antorcha: un golpe de fuego adelante (quema)
  swing(kind) {
    const g = this.g;
    if (kind !== 'antorcha') return;
    g.audio.whoosh?.(g.player.pos.clone());
    const fwd = tmpW.set(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      const dx = z.pos.x - g.player.pos.x;
      const dz = z.pos.z - g.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.0 || (dx * fwd.x + dz * fwd.z) / (d || 1) < 0.4 || Math.abs(z.pos.y - g.player.pos.y) > 1.5) continue;
      const point = z.pos.clone().setY(z.pos.y + 1.2);
      g.zombies.damage(z, z.boss ? 120 : 260 + g.rounds.round * 35, { type: 'fire', point, dir: fwd.clone(), by: myId(g) });
      if (!g.net?.guest) z.burnT = Math.max(z.burnT || 0, 3);
      g.fx.fire(point, 0.4, 4);
    }
  }

  // ---------------- la pesca ----------------
  startFishing(id) {
    this.fish = { by: id, k: 0, tension: 0, t: 0 };
    this.sync();
  }

  // (el que pesca, cada cuadro: el clic recoge y tensa; soltar afloja)
  fishTick(dt) {
    const g = this.g;
    const F = this.fish;
    const reel = g.input?.mouse?.left && g.state === 'playing';
    // el pez tira a ratos (más fuerte cuanto más cerca)
    const pull = 0.35 + Math.max(0, Math.sin(g.time * 2.3) * Math.sin(g.time * 0.7)) * (0.9 + F.k);
    F.tension = Math.max(0, Math.min(1.2, F.tension + (reel ? 0.75 : -0.9) * dt + pull * dt * (reel ? 0.6 : 0.2)));
    if (reel && F.tension < 0.82) F.k += dt * 0.12;
    if (F.tension >= 1) {
      g.audio.deny();
      g.hud.subtitle('¡Se cortó el hilo! Volvé a tirar.', 2.5);
      F.k = 0;
      F.tension = 0;
      this.reportFish('cut');
      return;
    }
    if (F.k >= 1) this.reportFish('hooked');
    const t = this.bar.querySelector('.mon-t');
    const k = this.bar.querySelector('.mon-k');
    t.style.left = `${Math.min(100, (F.tension / 1) * 100)}%`;
    k.style.width = `${Math.min(100, F.k * 100)}%`;
  }

  reportFish(what) {
    const g = this.g;
    if (!isHost(g)) {
      g.net.net.send({ t: 'papq', a: 'fish', w: what });
      if (what === 'hooked' || what === 'cut') this.fish.by = -1;
      return;
    }
    this.onFish(what);
  }

  onFish(what) {
    const g = this.g;
    if (what === 'cut') {
      this.fish.by = -1;
      this.sync();
      return;
    }
    if (what !== 'hooked' || this.st !== 2) return;
    this.fish.by = -1;
    // muerde algo enorme: el Surubí (si está), si no, la pava sale sola
    if (g.surubi?.emergeWithPava) {
      this.st = 3;
      announce(g, '¡Algo enorme muerde! ¡El Surubí del Paraná!', 4, true);
      g.surubi.emergeWithPava(() => this.pavaOut());
    } else this.pavaOut();
    this.sync();
  }

  // El Surubí escupió la pava (o salió sola): queda en el muelle
  pavaOut() {
    const g = this.g;
    const [cx, cz] = EE.cana;
    this.st = 4;
    this.pava.at = 'floor';
    this.pava.pos.set(cx - 1.4, g.world.floorAt(cx - 1.4, cz), cz + 0.6);
    g.water?.splash?.(cx + 2, cz, 2);
    announce(g, 'La pava de la Llama. Llevala al Propileo (pesa).', 4, true);
    this.sync();
  }

  // ---------------- la máquina ----------------
  prompt() {
    const info = (text) => ({ text, noCost: true, info: true });
    if (this.st === 0) return info('La Llama Votiva está apagada. El fuego sale de la Batería Libertad');
    if (this.st === 1) {
      if (this.carry.mine && this.carry.kind === 'antorcha') return { text: 'prender la Llama Votiva', noCost: true, hold: true };
      return info('Hay que traer la antorcha prendida');
    }
    if (this.st === 2 || this.st === 3) return info('La Llama arde, pero no tiene pava. Está en el fondo del río');
    if (this.st === 4) {
      if (this.carry.mine && this.carry.kind === 'pava') return { text: 'poner la pava en la Llama', noCost: true, hold: true };
      return info('Falta la pava. Está en el muelle');
    }
    return null;
  }

  use() {
    const g = this.g;
    const who = g.net?.useFrom ?? myId(g);
    if (this.st === 1 && this.torch.at === 'held' && this.torch.carrier === who) {
      if (!isHost(g)) return true;
      this.lightLlama();
      return true;
    }
    if (this.st === 4 && this.pava.at === 'held' && this.pava.carrier === who) {
      if (!isHost(g)) return true;
      this.q.finish();
      return true;
    }
    return false;
  }

  lightLlama(remote = false) {
    const g = this.g;
    if (!remote) {
      this.st = 2;
      this.torch.at = 'none';
      this.torch.carrier = -1;
      announce(g, '¡La Llama Votiva arde! Arriba no hay pava: se la llevó el río.', 4.5, true);
      this.sync();
    }
    g.fx.flash(this.q.pap.group.position.clone().setY(LLAMA_Y + 2), 0xffa040, 40, 0.5, 20);
  }

  complete(quiet = false) {
    this.st = 5;
    this.pava.at = 'set';
    this.pava.carrier = -1;
    this.llama.trivet.visible = true;
    this.q.pap.kettle.visible = true;
    if (!quiet) this.g.fx.steam(this.q.pap.kettle.getWorldPosition(tmpV).clone(), 20, 0.4);
  }

  // ---------------- la red ----------------
  state() {
    const T = this.torch;
    const P = this.pava;
    const r2 = (v) => +v.toFixed(2);
    return {
      st: this.st,
      tc: [T.at, r2(T.pos.x), r2(T.pos.y), r2(T.pos.z), T.carrier, r2(T.fuel)],
      p: [P.at, r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), P.carrier],
      pb: this.peb.map((v) => (v ? 1 : 0)),
      f: this.fish.by,
    };
  }

  sync(extra = {}) {
    this.g.net?.event('papq', { kd: 'llama', ...this.state(), ...extra });
  }

  apply(m, quiet = false) {
    if (m.cn && !quiet) this.fireCannon(true);
    const was = this.st;
    if (m.st != null) this.st = m.st;
    // (la antorcha va en 'tc': 't' es el tipo del mensaje de red y lo pisaba)
    if (m.tc) {
      const T = this.torch;
      [T.at] = m.tc;
      T.pos.set(m.tc[1], m.tc[2], m.tc[3]);
      T.carrier = m.tc[4];
      T.fuel = m.tc[5];
    }
    if (m.p) {
      const P = this.pava;
      [P.at] = m.p;
      P.pos.set(m.p[1], m.p[2], m.p[3]);
      P.carrier = m.p[4];
    }
    if (m.pb) this.peb = m.pb.map((v) => !!v);
    if (m.f != null) {
      if (m.f !== this.fish.by) this.fish = { by: m.f, k: 0, tension: 0, t: 0 };
    }
    if (was < 2 && this.st >= 2 && !quiet) this.lightLlama(true);
  }

  // (PapQuest le pasa los tiros y las explosiones: acá no se rompe nada a tiros)
  onShot() {}

  onExplosion() {}

  onGuest(m, from) {
    if (m.a === 'drop') this.dropFrom(from);
    else if (m.a === 'fish' && this.fish.by === from) this.onFish(m.w);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time || 0;
    const host = isHost(g);
    const me = myId(g);
    const T = this.torch;
    // quién lleva qué (lo dibuja Carry)
    const kind = T.at === 'held' ? 'antorcha' : this.pava.at === 'held' ? 'pava' : this.fish.by >= 0 ? 'cana' : null;
    const who = T.at === 'held' ? T.carrier : this.pava.at === 'held' ? this.pava.carrier : -1;
    this.carry.set(kind, kind === 'cana' ? this.fish.by : who);
    this.carry.update(dt, t);
    // el cañón retrocede
    const c = this.cannon;
    if (c?.userData.kick) {
      c.userData.kick = Math.max(0, c.userData.kick - dt * 2.5);
      const tubo = c.getObjectByName('tubo');
      if (tubo) tubo.position.z = -0.5 + c.userData.kick * 0.35;
    }
    // la antorcha: en el soporte, en el piso o en una mano
    const showT = T.at === 'stand' || T.at === 'floor';
    this.torchM.visible = showT;
    if (showT) {
      this.torchM.position.copy(T.pos);
      this.torchM.rotation.set(T.at === 'floor' ? Math.PI / 2 - 0.2 : 0, 0, 0);
      this.torchIt.pos.copy(T.pos);
    } else this.torchIt.pos.set(0, -100, 0);
    // la llama de la antorcha achicada según el combustible
    for (const m of [this.torchM, this.carry.vm, this.carry.wm]) {
      const fl = m?.getObjectByName('llama');
      if (fl) fl.scale.setScalar(0.4 + T.fuel * 0.6);
    }
    if (T.at === 'held' || T.at === 'floor' || T.at === 'stand') {
      const at = T.at === 'held' ? playerById(g, T.carrier)?.pos : T.pos;
      if (at && Math.random() < dt * 6) g.fx.fire(tmpV.copy(at).setY(at.y + (T.at === 'held' ? 1.9 : 0.6)), 0.15, 1);
    }
    // el anfitrión: se gasta, se apaga con golpes y con agua, prende pebeteros
    if (host && this.st === 1) this.tickTorch(dt);
    // la pava: en el piso (en el muelle) o en una mano
    this.pavaM.visible = this.pava.at === 'floor';
    if (this.pava.at === 'floor') {
      this.pavaM.position.copy(this.pava.pos);
      this.pavaIt.pos.copy(this.pava.pos).setY(this.pava.pos.y + 0.5);
    } else this.pavaIt.pos.set(0, -100, 0);
    if (host && this.pava.at === 'held' && isDown(g, this.pava.carrier)) this.dropFrom(this.pava.carrier);
    // la pesca: el que pesca ve la barra
    const fishing = this.fish.by === me && this.st === 2;
    this.bar.style.display = fishing ? 'block' : 'none';
    if (fishing) {
      // si se aleja del muelle, larga la caña
      const [cx, cz] = EE.cana;
      if (Math.hypot(g.player.pos.x - cx, g.player.pos.z - cz) > 3.5 || g.player.downed) this.reportFish('cut');
      else this.fishTick(dt);
    }
    // la Llama: apagada (brasas apenas), ardiendo (st >= 2)
    const on = this.st >= 2;
    this.lit += ((on ? 1 : 0) - this.lit) * Math.min(1, dt * 1.2);
    this.llama.flames.visible = this.lit > 0.03;
    this.llama.flames.scale.set(0.5 + this.lit * 0.5, 0.2 + this.lit * 0.8 + Math.sin(t * 7) * 0.04 * this.lit, 0.5 + this.lit * 0.5);
    if (this.light) {
      this.light.base = this.lightBase * Math.max(0.04, this.lit);
      this.light.target = this.light.base;
    }
    if (on && !this.fireOn) {
      this.fireOn = true;
      g.audio.startFire(this.q.pap.group.position.clone().setY(LLAMA_Y + 1.6));
    }
    // los pebeteros prendidos
    this.pebs.forEach((p, i) => {
      p.fl.visible = this.peb[i];
      p.light.intensity = this.peb[i] ? 6 + Math.sin(t * 11 + i) * 1.2 : 0;
    });
    flameMaterial().uniforms.uTime.value = t;
  }

  tickTorch(dt) {
    const g = this.g;
    const T = this.torch;
    let changed = false;
    if (T.at === 'held') {
      const p = playerById(g, T.carrier);
      if (!p || isDown(g, T.carrier)) {
        this.dropFrom(T.carrier);
        return;
      }
      T.pos.copy(p.pos).setY(p.pos.y + 1.6);
      T.fuel -= TORCH_BURN * dt;
      // los golpes: el que la lleva se cuenta en hurtFrom (Player.damage)
      const hurt = this.hurtOf(T.carrier);
      if (hurt > 0) {
        T.fuel -= hurt * TORCH_HIT;
        changed = true;
      }
      // el agua la apaga (el espejo del Pasaje, el río)
      if (g.world.waterDepth?.(p.pos.x, p.pos.z) > 0.1 || this.inMirror(p.pos)) T.fuel = 0;
      // los pebeteros que tiene cerca se prenden
      this.pebs.forEach((pb, i) => {
        if (this.peb[i]) return;
        if (Math.hypot(pb.pos.x - p.pos.x, pb.pos.z - p.pos.z) < PEB_R && Math.abs(pb.pos.y - p.pos.y) < 2.5) {
          this.peb[i] = true;
          g.audio.sting();
          T.from = i;
          T.fuel = Math.min(1, T.fuel + 0.35);
          changed = true;
        }
      });
    } else if (T.at === 'floor') {
      T.life -= dt;
      if (T.life <= 0 || this.inMirror(T.pos)) T.fuel = 0;
    }
    if (T.fuel <= 0) {
      // se apagó: vuelve al último pebetero prendido o al soporte de la Batería
      const last = this.pebs[T.from];
      T.carrier = -1;
      T.fuel = 1;
      if (last) {
        T.at = 'floor';
        T.pos.copy(last.pos).setY(last.pos.y - 1.05);
        T.life = 1e9;
      } else {
        T.at = 'stand';
        T.pos.copy(this.standPos);
      }
      announce(g, last ? 'Se apagó la antorcha. Volvé a prenderla en el último pebetero.' : 'Se apagó la antorcha. Hay otra en la Batería.', 3.5);
      changed = true;
    }
    this.syncT = (this.syncT || 0) - dt;
    if (changed || this.syncT <= 0) {
      this.syncT = 1.0;
      this.sync();
    }
  }

  // Los golpes que recibió un jugador desde la última vez (el local lo cuenta
  // envolviendo Player.damage; los invitados lo reportan con su vida)
  hurtOf(id) {
    const g = this.g;
    if (!this.hurtHook) {
      this.hurtHook = true;
      this.hurts = new Map();
      const p = g.player;
      const orig = p.damage.bind(p);
      p.damage = (amount, from, explosion, src) => {
        const before = p.hp;
        orig(amount, from, explosion, src);
        if (p.hp < before) this.hurts.set(myId(g), (this.hurts.get(myId(g)) || 0) + 1);
      };
    }
    if (id !== myId(g)) {
      // del invitado: la vida que manda en su paquete
      const r = g.net?.remote.get(id);
      const hp = r?.hp ?? r?.health;
      if (hp == null) return 0;
      const last = this.hurts.get(`hp${id}`);
      this.hurts.set(`hp${id}`, hp);
      return last != null && hp < last - 5 ? 1 : 0;
    }
    const n = this.hurts.get(id) || 0;
    this.hurts.set(id, 0);
    return n;
  }

  inMirror(p) {
    return p.x > 5 && p.x < 20.5 && p.z > 33 && p.z < 40 && p.y < 3.7;
  }

  dispose() {
    this.carry.dispose();
    this.bar.remove();
    this.root.removeFromParent();
  }
}
