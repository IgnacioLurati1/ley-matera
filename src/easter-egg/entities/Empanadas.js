import * as THREE from 'three';
import * as P from '../core/progress';
import { EMPANADA, defaultCanasta, HORNO_COST } from '../config/empanadas';
import { HORNO_SPOTS, PERK_SPOTS, PLAYER_START, MAP_W, MAP_H } from '../config/map';
import { PERKS } from '../config/perks';
import { WEAPONS, maxTier, tierOf, weaponStats } from '../config/weapons';
import { keyLabel } from '../core/controls';
import { buildHorno, drawBoard, HORNO } from '../world/hornoBarro';
import { buildEmpanada, buildEatHand, empanadaIcon } from '../weapons/empanadaModels';
import { VM } from '../weapons/viewmodels';
import { dragonBreath } from '../weapons/dragonBreath';
import { cherryShock } from '../weapons/electricCherry';
import '../ui/empanadas.css';

// Las empanadas en la partida (los GobbleGum de Black Ops 3): los hornos de
// barro del mapa, la canasta de cada uno, comerla (la mano que la muerde) y
// lo que hace cada una. El catálogo está en config/empanadas.js; lo que se
// tiene (las especiales, la canasta) en core/progress.js.
//
// El horno es de cada jugador (local): cada uno paga lo suyo y le sale de su
// canasta. Lo que toca el mundo lo decide el anfitrión: potenciadores, la
// ronda robada y los efectos para todos (los muertos quietos, ciegos o
// caminando, los potenciadores al doble), que van y vienen por 'emp'.

const READY_T = 9; // segundos que la empanada espera en la pala
const COOK_T = 1.5; // lo que tarda en salir
const EAT_T = 2.3;
const BITES = [0.75, 1.15];
// cada uso de las que se activan con la tecla: otro mordisco (sin esto el
// segundo uso salía al toque y eran demasiado fuertes)
const USE_T = 1.25;
const USE_BITE = [0.52];
// el antebrazo: de la muñeca para abajo (un poco a la derecha y hacia la
// cámara), así sale por el borde de abajo de la pantalla (marco de la vista).
// (atado a un hombro fijo cruzaba la pantalla desde la muñeca, que en estas
// poses queda atrás a la izquierda de la mano)
const FOREARM = new THREE.Vector3(0.08, -0.5, 0.22);
// La mano que come: poses [x, y, z, rx, ry, rz] en el marco de la vista
// (la punta mordible de la empanada es +x: ry -pi/2 la da vuelta hacia la boca).
const OFF = [0.16, -0.4, -0.3, 0.3, -Math.PI / 2 + 0.5, 0.3];
const SHOW = [0.05, -0.15, -0.3, 0.95, -Math.PI / 2 + 0.55, 0.08];
const MOUTH = [0.0, -0.085, -0.12, 0.35, -Math.PI / 2 + 0.12, -0.05];
// subir y mostrarla, morder, mostrar el mordisco, morder de nuevo, masticar y bajar
const EAT_KEYS = [
  [0, OFF],
  [0.35, SHOW],
  [0.55, SHOW],
  [BITES[0], MOUTH],
  [0.95, SHOW, 0.55],
  [BITES[1], MOUTH],
  [1.4, SHOW],
  [1.8, SHOW],
  [EAT_T, OFF],
];
// un mordisco solo: subir, morder, mostrarla y bajar
const USE_KEYS = [
  [0, OFF],
  [0.3, SHOW],
  [USE_BITE[0], MOUTH],
  [0.75, SHOW],
  [USE_T, OFF],
];
const TYPES = ['maxammo', 'insta', 'double', 'nuke', 'carpenter', 'firesale'];
// lo que se paga que el "Fiado" (la de llama) regala
const FREE_KINDS = new Set(['door', 'perk', 'wallbuy', 'box', 'salebox', 'pap']);
const PUP_OF = { cordero: 'maxammo', cordobesa: 'insta', matambre: 'double', osobuco: 'nuke', calabaza: 'carpenter', atun: 'firesale', batata: 'muerte' };
// los que dejan algo esperando (el HUD muestra cuántos quedan)
const ARM = { roquefort: 'after', fugazzeta: 'burn', espinaca: 'crate', riojana: 'wall', membrillo: 'yapa', charqui: 'spark' };

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const UP_V = new THREE.Vector3(0, 1, 0);
const CUFF_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export default class Empanadas {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.hornos = [];
    this.cur = null;
    this.bag = [];
    this.bought = 0;
    this.round = -1;
    this.acc = 0;
    this.glob = { freeze: 0, slow: 0, blind: 0, x2: -1 };
    this.buildHornos();
    // una sola luz para los hornos (la creada en la carga; va al que está prendido más cerca)
    this.light = new THREE.PointLight(0xff8a3a, 0, 3.6, 2);
    this.light.visible = this.hornos.length > 0;
    this.root.add(this.light);
    this.buildHud();
    this.hookPlayer();
    this.hookPowerups();
    this.hookPoints();
    this.wrapCosts();
  }

  // ---------------- el horno ----------------
  buildHornos() {
    const g = this.g;
    const I = g.interact;
    (HORNO_SPOTS || []).forEach((spot, i) => {
      const a = g.world.wallAnchor(spot.cell, spot.face, HORNO.D / 2 + 0.02 + (spot.out || 0));
      if (spot.slide) {
        if (spot.face[0]) a.z += spot.slide;
        else a.x += spot.slide;
      }
      const fy = spot.y ?? g.world.floorAt(spot.cell[0] + 0.5 + spot.face[0], spot.cell[1] + 0.5 + spot.face[1]);
      const parts = buildHorno(g.textures, i);
      const group = parts.group;
      group.position.set(a.x, fy, a.z);
      group.rotation.y = a.rot;
      this.root.add(group);
      const half = spot.face[0] !== 0 ? [HORNO.D / 2, HORNO.W / 2] : [HORNO.W / 2, HORNO.D / 2];
      g.world.addBox([a.x - half[0], fy, a.z - half[1], a.x + half[0], fy + HORNO.top + 0.1, a.z + half[1]], { kind: 'machine' });
      g.world.addBox([a.x - half[0] * 0.8, fy, a.z - half[1] * 0.8, a.x + half[0] * 0.8, fy + HORNO.H, a.z + half[1] * 0.8], { kind: 'machine' });
      const front = new THREE.Vector3(a.x + spot.face[0] * (HORNO.D / 2 + 0.8), fy, a.z + spot.face[1] * (HORNO.D / 2 + 0.8));
      const h = { i, spot, group, parts, fy, front, state: 'idle', t: 0, model: null, id: null, by: null, peelK: 0, boardKey: null, smokeT: Math.random() * 3 };
      h.it = I.add({
        kind: 'horno',
        local: true,
        floorY: fy,
        pos: new THREE.Vector3(a.x, fy + 1.1, a.z),
        front,
        radius: 2.1,
        horno: h,
        prompt: () => this.prompt(h),
        cost: () => this.costFor(h),
        use: () => this.use(h),
      });
      this.hornos.push(h);
    });
  }

  price() {
    return HORNO_COST[this.bought] ?? 0;
  }

  prompt(h) {
    const g = this.g;
    if (g.weapons.state === 'drink') return null;
    if (h.state === 'ready' && h.by === 'me') {
      const E = EMPANADA[h.id];
      return { text: `comer ${E.name}`, noCost: true };
    }
    if (h.state !== 'idle') return { text: h.by === 'me' ? 'El horno está sacando tu empanada...' : 'Otro está sacando una empanada', noCost: true, info: true };
    if (this.bought >= HORNO_COST.length) return { text: 'Por esta ronda no hay más empanadas: el horno vuelve a calentar en la próxima', noCost: true, info: true };
    return 'sacar una empanada del horno';
  }

  costFor(h) {
    if (h.state === 'ready' && h.by === 'me') return 0;
    if (h.state !== 'idle' || this.bought >= HORNO_COST.length) return 0;
    return this.price();
  }

  use(h) {
    const g = this.g;
    if (h.state === 'ready' && h.by === 'me') {
      this.take(h);
      return true;
    }
    if (h.state !== 'idle' || this.bought >= HORNO_COST.length) return false;
    const id = this.pick();
    if (!id) return false;
    this.bought++;
    this.startHorno(h, id, 'me');
    g.net?.share('emp', { k: 'horno', h: h.i, id, by: g.net.id });
    return true;
  }

  startHorno(h, id, by) {
    h.state = 'cooking';
    h.t = 0;
    h.id = id;
    h.by = by;
    h.model?.dispose();
    h.model = buildEmpanada(id);
    h.model.group.scale.setScalar(1.35);
    h.model.group.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    h.parts.tray.add(h.model.group);
    const g = this.g;
    const at = h.group.localToWorld(h.parts.mouth.clone());
    this.sfxOven(at);
    g.fx.fire(at, 0.25, 4);
  }

  closeHorno(h) {
    h.state = 'closing';
    h.t = 0;
  }

  // La saca de la pala y se la come.
  take(h) {
    const g = this.g;
    const id = h.id;
    const E = EMPANADA[id];
    // las especiales se gastan recién acá (si se va sin comerla, no pierde nada)
    if (E.kind === 'especial' && !P.useMega(id)) {
      g.audio.deny();
      g.hud.subtitle('Esa especial ya no te quedaba.', 2.5);
      this.closeHorno(h);
      return;
    }
    h.model?.group.removeFromParent();
    h.model?.dispose();
    h.model = null;
    this.closeHorno(h);
    g.net?.share('emp', { k: 'took', h: h.i });
    this.eat(id);
  }

  // Qué sale: la canasta mezclada, sin repetir hasta que salgan todas (las
  // especiales que ya no quedan se van de la bolsa).
  loadout() {
    const unlocked = (req) => P.unlocked(req);
    let ids = P.canasta() || defaultCanasta(unlocked);
    const megas = P.megas();
    ids = ids.filter((id) => {
      const E = EMPANADA[id];
      if (!E) return false;
      // (las especiales fuertes se usan recién desde su nivel)
      return E.kind === 'clasica' ? unlocked({ level: E.level }) : megas[id] > 0 && (!E.level || unlocked({ level: E.level }));
    });
    if (!ids.length) ids = defaultCanasta(unlocked);
    return ids;
  }

  pick() {
    const ids = this.loadout();
    this.bag = this.bag.filter((id) => ids.includes(id));
    if (!this.bag.length) {
      this.bag = ids.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // (que no salga la misma dos veces seguidas al rearmar la bolsa)
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
    }
    this.last = this.bag.pop();
    return this.last;
  }

  updateHornos(dt) {
    const g = this.g;
    const t = g.time;
    let lit = null;
    let litD = 144;
    for (const h of this.hornos) {
      h.t += dt;
      const P0 = h.parts;
      // las brasas laten (y se avivan cuando cocina)
      const hot = h.state === 'cooking' ? 1 : h.state === 'ready' ? 0.6 : 0;
      const d2 = h.group.position.distanceToSquared(g.player.pos);
      if (d2 < 900) {
        const fl = 0.85 + Math.sin(t * 7.3 + h.i) * 0.08 + Math.sin(t * 13.1 + h.i * 2) * 0.06;
        P0.back.material.emissiveIntensity = (1.1 + hot * 1.4) * fl;
        P0.glow.material.opacity = (0.45 + hot * 0.35) * fl;
        P0.floor.material.emissiveIntensity = (0.9 + hot * 1.2) * fl;
        if (d2 < litD) {
          litD = d2;
          lit = { h, hot, fl };
        }
        // humo de la chimenea
        h.smokeT -= dt * (1 + hot * 3);
        if (h.smokeT <= 0 && d2 < 600) {
          h.smokeT = 1.4 + Math.random();
          g.fx.steam(h.group.localToWorld(tmpV.copy(P0.chimTop)), 1, 0.12);
        }
      }
      // la pizarra: el precio de esta ronda
      const key = this.bought >= HORNO_COST.length ? 0 : this.price();
      if (key !== h.boardKey) {
        h.boardKey = key;
        drawBoard(P0.board.canvas, key);
        P0.board.tex.needsUpdate = true;
      }
      switch (h.state) {
        case 'cooking':
          h.peelK = 0;
          if (h.t > COOK_T) {
            h.state = 'ready';
            h.t = 0;
            this.sfxPeel(h.group.localToWorld(tmpV.copy(P0.mouth)));
          }
          break;
        case 'ready': {
          h.peelK = Math.min(1, h.peelK + dt * 2.2);
          // humea recién salida
          if (Math.random() < dt * 6) g.fx.steam(h.group.localToWorld(tmpV.set(0, HORNO.top + 0.08, P0.peelZ[1] + 0.02)), 1, 0.05);
          if (h.t > READY_T || (h.by !== 'me' && h.t > READY_T + 2)) {
            if (h.by === 'me') g.hud.subtitle('La empanada volvió al horno.', 2);
            this.closeHorno(h);
          }
          break;
        }
        case 'closing':
          h.peelK = Math.max(0, h.peelK - dt * 2.4);
          if (h.peelK <= 0) {
            h.model?.group.removeFromParent();
            h.model?.dispose();
            h.model = null;
            h.state = 'idle';
            h.id = null;
            h.by = null;
          }
          break;
        default:
          break;
      }
      const k = smooth(h.peelK);
      P0.peel.position.z = P0.peelZ[0] + (P0.peelZ[1] - P0.peelZ[0]) * k;
      if (h.model) h.model.group.visible = h.state !== 'cooking';
    }
    const L = this.light;
    if (lit) {
      lit.h.group.localToWorld(L.position.copy(lit.h.parts.mouth));
      L.position.y += 0.05;
      L.intensity = (0.35 + lit.hot * 2.2) * lit.fl;
    } else L.intensity = 0;
  }

  // ---------------- comer ----------------
  eat(id) {
    const g = this.g;
    const E = EMPANADA[id];
    this.munch(id, EAT_KEYS, EAT_T, BITES, () => this.start(id));
    this.sfxChew();
    g.net?.share('emp', { k: 'eat', id, by: g.net.id });
    g.hud.toast(`¡${E.name}!`);
  }

  // La mano sube la empanada y la muerde (keys: las poses; bitesAt: cuándo
  // muerde). Al final, onDone (también si algo la corta: sale igual).
  munch(id, keys, T, bitesAt, onDone) {
    const g = this.g;
    const W = g.weapons;
    if (!W.drinkFrame) {
      W.drinkFrame = new THREE.Group();
      W.vmRoot.add(W.drinkFrame);
    }
    if (!this.hand) {
      this.hand = new THREE.Group();
      this.hand.add(buildEatHand(VM, g.textures));
      this.holder = new THREE.Group();
      this.hand.add(this.holder);
      // la manga y el puño van aparte: se tienden de la muñeca al hombro
      const hand = this.hand.children[0];
      this.wrist = hand.userData.wrist;
      this.arm = new THREE.Group();
      for (const n of ['sleeve', 'cuff']) {
        const o = hand.getObjectByName(n);
        if (o) this.arm.add(o);
      }
      this.sleeve = this.arm.getObjectByName('sleeve');
      this.cuff = this.arm.getObjectByName('cuff');
    }
    this.eatModel?.dispose();
    this.eatModel = buildEmpanada(id);
    this.eatModel.prepareBites();
    this.eatModel.mesh.castShadow = false;
    // (en la mano: la base apoyada en los dedos, la punta mordible hacia +x)
    this.eatModel.group.position.set(-0.07, -0.004, -0.012);
    this.holder.clear();
    this.holder.add(this.eatModel.group);
    W.drinkFrame.add(this.hand, this.arm);
    this.hand.visible = true;
    let bites = 0;
    const pose = [0, 0, 0, 0, 0, 0];
    const anim = (t) => {
      if (t < 0) {
        // cortado (lo tiraron, cambió de arma...): la mano se va
        this.hand.removeFromParent();
        this.arm.removeFromParent();
        return 0;
      }
      for (let i = bites; i < bitesAt.length; i++) {
        if (t >= bitesAt[i]) {
          bites = i + 1;
          this.eatModel.setBite(bites);
          this.sfxBite();
          this.crumbs();
          g.fx.addShake?.(0.05);
        }
      }
      // entre dos poses (la de ida puede quedar a medio camino: k)
      let i = 1;
      while (i < keys.length - 1 && t > keys[i][0]) i++;
      const [t0, A0, k0 = 1] = keys[i - 1];
      const [t1, B1, k1 = 1] = keys[i];
      const u = smooth((t - t0) / (t1 - t0 || 1));
      for (let j = 0; j < 6; j++) {
        const a = k0 < 1 ? MOUTH[j] + (A0[j] - MOUTH[j]) * k0 : A0[j];
        const b = k1 < 1 ? MOUTH[j] + (B1[j] - MOUTH[j]) * k1 : B1[j];
        pose[j] = a + (b - a) * u;
      }
      // masticando: la mano se mueve un poco con la mandíbula
      const last = bitesAt[bitesAt.length - 1];
      const chew = t > last + 0.25 && t < T - 0.4 ? Math.sin(t * 17) * 0.004 : 0;
      this.hand.position.set(pose[0], pose[1] + chew, pose[2]);
      this.hand.rotation.set(pose[3], pose[4], pose[5]);
      this.placeArm();
      const near = Math.max(...bitesAt.map((b) => bump(t, b, 0.22)));
      const up = smooth(t / 0.35) * (1 - smooth((t - (T - 0.45)) / 0.4));
      return up * 0.06 + near * 0.08;
    };
    anim(0);
    W.eat(anim, T, () => {
      this.hand.removeFromParent();
      this.arm.removeFromParent();
      onDone();
    });
  }

  // La manga, de la muñeca al hombro (antes iba pegada a la mano y, con la
  // mano girada hacia la boca, quedaba flotando a la izquierda).
  placeArm() {
    const h = this.hand;
    h.updateMatrix();
    const w = tmpV.copy(this.wrist).applyMatrix4(h.matrix);
    const len = FOREARM.length();
    const d = tmpD.copy(FOREARM).divideScalar(-len);
    const s = this.sleeve;
    s.quaternion.setFromUnitVectors(UP_V, d);
    s.position.copy(w).addScaledVector(d, -len / 2);
    s.scale.set(1, len / 0.55, 1);
    const c = this.cuff;
    if (c) {
      c.quaternion.copy(s.quaternion).multiply(CUFF_Q);
      c.position.copy(w);
    }
  }

  // Migas que caen del mordisco (delante de la cara).
  crumbs() {
    const g = this.g;
    const cam = g.camera;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const at = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.35);
    at.y -= 0.14;
    const E = EMPANADA[this.eatModel?.id] || {};
    const c = new THREE.Color(E.look?.cook === 'frita' ? 0xd89a4a : 0xe0b070);
    const P = g.fx.alpha;
    if (!P?.spawn) return;
    for (let i = 0; i < 12; i++) {
      const k = 0.6 + Math.random() * 0.8;
      P.spawn(at.x + (Math.random() - 0.5) * 0.08, at.y, at.z + (Math.random() - 0.5) * 0.08, (fwd.x * 0.5 + (Math.random() - 0.5)) * k, (0.6 + Math.random()) * k, (fwd.z * 0.5 + (Math.random() - 0.5)) * k, {
        color: [c.r * (0.8 + Math.random() * 0.3), c.g * (0.8 + Math.random() * 0.3), c.b * 0.9],
        size: 0.012 + Math.random() * 0.01,
        size1: 0.01,
        life: 0.6 + Math.random() * 0.3,
        alpha: 1,
        drag: 0.6,
        gravity: 9,
      });
    }
  }

  // El efecto arranca (y reemplaza al que había).
  start(id) {
    const g = this.g;
    const E = EMPANADA[id];
    this.stop(true);
    const c = { id, E, uses: E.dur, until: 0, toRound: 0, on: 0 };
    if (E.use === 'tiempo') c.until = g.time + E.dur;
    if (E.use === 'rondas') c.toRound = g.rounds.round + E.dur - 1;
    this.cur = c;
    g.hud.subtitle(`${E.name}: ${E.desc}${E.use === 'activa' ? ` Usala con [${keyLabel('empanada')}].` : ''}`, 5);
    this.sfxActivate(E.kind === 'especial');
    // lo que hace efecto al toque
    if (id === 'yacare') {
      this.allPerks();
      this.cur = null;
    } else if (id === 'mendocina') this.global('slow', E.dur);
    else if (id === 'bondiola') this.global('x2', 0);
    this.iconFor(id);
    this.renderHud(true);
  }

  // Se terminó (quiet: la reemplaza otra).
  stop(quiet = false) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    if (c.id === 'verdura' && c.lend) this.endLend(c);
    if (!quiet) this.g.hud.toast(`Se terminó ${c.E.name}`);
    this.renderHud(true);
  }

  // Tecla de la empanada (las activas).
  activate() {
    const g = this.g;
    const c = this.cur;
    if (!c || c.E.use !== 'activa' || c.uses <= 0 || c.on > g.time) return;
    if (!g.player.alive || g.player.downed || g.weapons.state === 'drink') return;
    // otro mordisco y, al final, el efecto (si se la cambiaron mientras, nada)
    this.munch(c.id, USE_KEYS, USE_T, USE_BITE, () => {
      if (this.cur !== c || c.uses <= 0) return;
      const ok = this.fire(c);
      if (ok === false) {
        g.audio.deny();
        return;
      }
      c.uses--;
      if (c.E.secs) c.on = g.time + c.E.secs;
      this.sfxActivate(false);
      if (c.uses <= 0 && !c.E.secs) this.stop(true);
      this.renderHud(true);
    });
    this.sfxChew();
  }

  fire(c) {
    const g = this.g;
    const id = c.id;
    const pup = PUP_OF[id];
    if (pup) return this.drop([pup]);
    switch (id) {
      case 'humita':
        g.player.guardT = Math.max(g.player.guardT || 0, g.time + c.E.secs);
        g.net?.share('emp', { k: 'unseen', id: g.net.id, s: c.E.secs });
        return true;
      case 'pollo':
        return this.teleport();
      case 'verdura':
        return this.lend(c);
      case 'surubi':
        return this.drop([...TYPES]);
      case 'jabali':
        return this.global('blind', c.E.secs);
      case 'ciervo':
        return this.global('freeze', c.E.secs);
      case 'santiaguena':
        return this.rob();
      case 'mariscos':
        return this.freePerk();
      case 'cuatroquesos':
        return this.blowHeads();
      default:
        return false;
    }
  }

  // ---------------- lo que se consulta desde afuera ----------------
  has(id) {
    const c = this.cur;
    if (!c || c.id !== id) return false;
    const g = this.g;
    if (c.E.use === 'tiempo') return g.time < c.until;
    if (c.E.use === 'rondas') return g.rounds.round <= c.toRound;
    return true;
  }

  adsMult() {
    return this.has('carne') ? 2 : 1;
  }

  // el tiempo de sacar el mate (menos es más rápido)
  swapMult() {
    return this.has('carne') || this.has('tucumana') ? 0.5 : 1;
  }

  reloadMult() {
    return this.has('tucumana') ? 0.5 : 1;
  }

  sprintFire() {
    return this.has('caprese');
  }

  knifeMult() {
    return this.has('saltena') ? 5 : 1;
  }

  headAll() {
    return this.has('cabrito');
  }

  xpMult() {
    return this.has('patron') ? 2 : 1;
  }

  free() {
    return this.has('llama');
  }

  // Los de todos (los decide el anfitrión; en los invitados, para el HUD).
  frozen() {
    return this.g.time < this.glob.freeze;
  }

  slowAll() {
    return this.g.time < this.glob.slow;
  }

  blind() {
    return this.g.time < this.glob.blind;
  }

  // Un mate de la caja o de la pared que sale mejorado (Cajón Bendito, De la Pared).
  upFor(kind, weaponId) {
    const arm = kind === 'box' ? 'espinaca' : kind === 'wall' ? 'riojana' : null;
    if (!arm || !this.cur || this.cur.id !== arm || !WEAPONS[weaponId] || maxTier(weaponId) < 1) return 0;
    this.spend();
    return 1;
  }

  // Gasta un uso de las que esperan algo.
  spend() {
    const c = this.cur;
    if (!c) return;
    c.uses--;
    if (c.uses <= 0) this.stop(true);
    this.renderHud(true);
  }

  // El facón con el Chispazo (la de charqui): la descarga alrededor.
  onKnife() {
    const g = this.g;
    if (!this.cur || this.cur.id !== 'charqui') return;
    const at = g.player.pos.clone();
    cherryShock(g, at, 0.8, true);
    g.net?.share('cherry', { id: g.net.id, p: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], k: 0.8 });
    this.spend();
  }

  // ---------------- enganches ----------------
  hookPlayer() {
    const g = this.g;
    const p = g.player;
    const damage = p.damage.bind(p);
    // (src: el zombie que pegó, para el escudo: entities/Player)
    p.damage = (amount, from, explosion = false, src = null) => {
      const E = g.emp;
      // Sin Chamuscar (la picante): las explosiones no te hacen nada
      if (explosion && E?.has('picante')) return;
      const could = p.canBeHit() && !g.godMode;
      damage(amount, from, explosion, src);
      // Brasas (cebolla y queso): el golpe de un muerto larga la llamarada
      if (could && !explosion && from && E?.cur?.id === 'fugazzeta' && g.time > (E.burnT || 0)) {
        E.burnT = g.time + 1.2;
        const at = p.pos.clone();
        dragonBreath(g, at, true);
        g.net?.share('drag', { id: g.net.id, p: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] });
        E.spend();
      }
    };
    const lose = p.loseAllPerks.bind(p);
    p.loseAllPerks = () => {
      // Gusto a Más (roquefort): esta vez no se pierden
      if (g.emp?.cur?.id === 'roquefort') {
        g.emp.spend();
        g.hud.subtitle('Gusto a Más: te quedaste con los perks.', 3);
        return;
      }
      lose();
    };
    const give = p.givePerk.bind(p);
    p.givePerk = (id) => {
      give(id);
      // La Yapa (membrillo): el próximo perk viene con otro
      const E = g.emp;
      if (E && !E.giving && E.cur?.id === 'membrillo') {
        E.spend();
        const other = E.missingPerks()[0];
        if (other) {
          E.giving = true;
          g.later(0.6, () => {
            give(other);
            g.audio.perkDrink?.(other);
            g.hud.subtitle(`La Yapa: ${PERKS[other].name} de regalo.`, 3);
          });
          E.giving = false;
        }
      }
    };
  }

  // Tiempo Regalado (bondiola): los potenciadores de esta ronda duran el doble.
  hookPowerups() {
    const g = this.g;
    const pu = g.powerups;
    const apply = pu.applyEffect.bind(pu);
    pu.applyEffect = (type, local, known) => {
      const before = { ...pu.active };
      apply(type, local, known);
      if (g.emp?.glob.x2 === g.rounds.round) for (const k of Object.keys(pu.active)) if (pu.active[k] > (before[k] || 0) + 0.5) pu.active[k] *= 2;
    };
  }

  // Plata en Balas (la árabe): lo que se gana va a balas del mate en la mano.
  hookPoints() {
    const g = this.g;
    if (g.addPoints.__emp) return;
    const add = g.addPoints.bind(g);
    const wrapped = (n, point, raw, ...rest) => {
      const E = g.emp;
      if (E && n > 0 && !raw && E.has('arabe') && E.toAmmo(n)) return;
      add(n, point, raw, ...rest);
    };
    wrapped.__emp = true;
    g.addPoints = wrapped;
  }

  toAmmo(n) {
    const W = this.g.weapons;
    const s = W.slot;
    const st = W.stats;
    if (!s || !st || s.temp || st.kind === 'melee' || !(st.reserve > 0) || s.reserve >= st.reserve) return false;
    this.acc += n;
    const k = Math.floor(this.acc / 10);
    this.acc -= k * 10;
    s.reserve = Math.min(st.reserve, s.reserve + k);
    W.updateHud();
    return true;
  }

  // El Fiado (la de llama): todo lo que se paga sale gratis un minuto.
  wrapCosts() {
    const list = this.g.interact.list;
    for (let i = this.wrapped || 0; i < list.length; i++) {
      const it = list[i];
      if (!FREE_KINDS.has(it.kind) || it.cost.__emp) continue;
      const cost = it.cost;
      const c = () => (this.g.emp?.free() ? 0 : cost());
      c.__emp = true;
      it.cost = c;
    }
    this.wrapped = list.length;
  }

  // ---------------- efectos ----------------
  // Los potenciadores aparecen adelante (los tira el anfitrión).
  drop(types) {
    const g = this.g;
    const p = g.player;
    const fwd = tmpV.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const list = types.map((type, i) => {
      const a = types.length > 1 ? (i / types.length) * Math.PI * 2 : 0;
      const r = types.length > 1 ? 2.2 : 0;
      const x = p.pos.x + fwd.x * 2 + Math.cos(a) * r;
      const z = p.pos.z + fwd.z * 2 + Math.sin(a) * r;
      // (si cae en una pared o afuera, al lado del jugador)
      const ok = g.world.zoneAt(x, z, p.pos.y) && g.world.circleFree?.(x, z, 0.3, p.pos.y + 0.2, p.pos.y + 1.4) !== false;
      return { type, x: ok ? x : p.pos.x, y: p.pos.y, z: ok ? z : p.pos.z };
    });
    if (g.net?.guest) g.net.net.send({ t: 'emp', k: 'drop', l: list.map((d) => [d.type, +d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)]) });
    else for (const d of list) g.powerups.drop(new THREE.Vector3(d.x, d.y, d.z), true, d.type);
    return true;
  }

  // Los de todos: los muertos quietos, ciegos o caminando, y los potenciadores al doble.
  global(w, secs) {
    const g = this.g;
    if (g.net?.guest) g.net.net.send({ t: 'emp', k: 'g', w, s: secs });
    else {
      this.setGlobal(w, secs);
      g.net?.event('emp', { k: 'g', w, s: secs, r: g.rounds.round });
    }
    return true;
  }

  setGlobal(w, secs, round = this.g.rounds.round) {
    const g = this.g;
    if (w === 'x2') this.glob.x2 = round;
    else this.glob[w] = g.time + secs;
    const Z = g.zombies;
    if (w === 'freeze' && !g.net?.guest) for (const z of Z.pool) if (z.active && !z.dead && !z.boss) Z.paint(z, 0xb8dcff);
    const say = { freeze: '¡Tiempo Muerto! Los muertos se quedaron quietos.', blind: '¡Ojos de Vidrio! Los muertos no ven a nadie.', slow: '¡Paso de Tortuga! Todos los muertos caminan.', x2: 'Tiempo Regalado: esta ronda los potenciadores duran el doble.' };
    g.hud.subtitle(say[w], 3);
  }

  updateGlobals() {
    const g = this.g;
    // al terminar el Tiempo Muerto, cada uno vuelve a su color
    if (this.wasFrozen && !this.frozen() && !g.net?.guest) for (const z of g.zombies.pool) if (z.active && !z.dead && !z.boss && !(z.slowT > 0) && !(z.burnT > 0)) g.zombies.paint(z);
    this.wasFrozen = this.frozen();
  }

  // La Ronda Robada: se van todos y cada uno se lleva 1600.
  rob() {
    const g = this.g;
    if (g.net?.guest) {
      // (en el descanso o sin muertos no se gasta: el anfitrión la rechaza)
      if (!g.zombies.pool.some((z) => z.active && !z.dead && !z.boss)) return false;
      g.net.net.send({ t: 'emp', k: 'rob' });
      return true;
    }
    const R = g.rounds;
    if (R.state === 'break' || !(R.toSpawn > 0 || g.zombies.alive > 0)) return false;
    R.toSpawn = 0;
    R.bossPending = false;
    R.specials = 0;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.boss || z.crow || z.pombero) continue;
      g.fx.sparkle(tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z), [1, 0.85, 0.4], 6, 0.8);
      g.zombies.free(z);
    }
    this.robbed();
    g.net?.event('emp', { k: 'rob' });
    return true;
  }

  robbed() {
    const g = this.g;
    g.addPoints(1600, null, true);
    g.hud.subtitle('¡Ronda Robada! 1600 para cada uno.', 3);
    g.audio.powerupGrab();
  }

  missingPerks() {
    const p = this.g.player;
    const ids = [...new Set(PERK_SPOTS.map((s) => s.perk))].filter((id) => PERKS[id] && !p.perks.has(id));
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  allPerks() {
    const g = this.g;
    const ids = this.missingPerks();
    this.giving = true;
    for (const id of ids) g.player.givePerk(id);
    this.giving = false;
    if (ids.length) g.audio.perkDrink?.(ids[0]);
    g.hud.subtitle(ids.length ? `Todo Incluido: ${ids.map((id) => PERKS[id].name).join(', ')}.` : 'Todo Incluido: ya tenías todos los perks.', 4);
  }

  // (invita a todo el equipo: a cada compañero, uno que no tenía; onEvent 'perk')
  freePerk() {
    const g = this.g;
    const id = this.missingPerks()[0];
    const team = !!g.net?.remote.size;
    if (!id && !team) return false;
    if (team) g.net.share('emp', { k: 'perk', by: g.net.id });
    if (!id) {
      g.hud.subtitle('Invita la Casa: para los compañeros.', 3);
      return true;
    }
    this.giving = true;
    g.weapons.drink(PERKS[id].color, () => {
      g.player.givePerk(id);
      g.hud.subtitle(`Invita la Casa: ${PERKS[id].name}. ${PERKS[id].desc}`, 3);
    });
    this.giving = false;
    g.audio.perkJingle(id, g.player.pos);
    return true;
  }

  // Me Rajo (la de pollo): a otro lugar del mapa ya abierto, lejos de los muertos.
  teleport() {
    const g = this.g;
    const p = g.player;
    const nav = g.navFor ? g.navFor(p) : g.nav;
    const spots = [];
    for (const it of g.interact.list) {
      if (!['perk', 'horno', 'wallbuy', 'box'].includes(it.kind)) continue;
      const f = it.front || it.pos;
      spots.push({ x: f.x, y: it.floorY ?? g.world.floorAt(f.x, f.z, it.pos.y - 1), z: f.z });
    }
    if (PLAYER_START) spots.push({ x: PLAYER_START.x, y: g.world.floorAt(PLAYER_START.x, PLAYER_START.z), z: PLAYER_START.z });
    // y lugares sueltos del piso al que se llega caminando (con las puertas cerradas, lo de arriba puede no alcanzar)
    const W = g.world;
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(Math.random() * MAP_W) + 0.5;
      const z = Math.floor(Math.random() * MAP_H) + 0.5;
      const y = W.floorAt(x, z, p.pos.y);
      if (Math.abs(y - p.pos.y) > 3) continue;
      if (W.circleFree && !W.circleFree(x, z, 0.45, y + 0.2, y + 1.7)) continue;
      spots.push({ x, y, z });
    }
    const zs = g.zombies.pool.filter((z) => z.active && !z.dead);
    const ok = spots.filter((s) => {
      if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 7) return false;
      const d = nav?.distAt?.(s.x, s.z);
      if (d != null && !Number.isFinite(d)) return false;
      if (!g.world.zoneAt(s.x, s.z, s.y)) return false;
      return !zs.some((z) => Math.hypot(z.pos.x - s.x, z.pos.z - s.z) < 7);
    });
    ok.sort((a, b) => Math.hypot(b.x - p.pos.x, b.z - p.pos.z) - Math.hypot(a.x - p.pos.x, a.z - p.pos.z));
    const s = ok[Math.floor(Math.random() * Math.ceil(ok.length / 2))];
    if (!s) return false;
    g.fx.sparkle(tmpV.set(p.pos.x, p.pos.y + 1, p.pos.z), [1, 0.8, 0.4], 12, 0.8);
    p.pos.set(s.x, s.y, s.z);
    p.vel?.set(0, 0, 0);
    g.fx.sparkle(tmpV.set(s.x, s.y + 1, s.z), [1, 0.8, 0.4], 12, 0.8);
    g.audio.whoosh?.();
    g.post?.flash?.(0.6);
    return true;
  }

  // Prestada (la de verdura): el mate en la mano pasa por el Pack-a-Pava un rato.
  lend(c) {
    const g = this.g;
    const W = g.weapons;
    const s = W.slot;
    if (!s || s.temp || tierOf(s.up) >= 1 || maxTier(s.id) < 1 || WEAPONS[s.id]?.kind === 'melee') return false;
    if (c.lend) this.endLend(c);
    const st = weaponStats(s.id, 1);
    c.lend = { id: s.id, was: s.up, until: g.time + c.E.secs };
    s.up = 1;
    s.mag = st.mag;
    s.reserve = Math.max(s.reserve, Math.floor(st.reserve / 2));
    W.equipModel();
    W.updateHud();
    g.audio.pap?.();
    return true;
  }

  endLend(c) {
    const g = this.g;
    const W = g.weapons;
    const L = c.lend;
    c.lend = null;
    const s = W.slots.find((x) => x.id === L.id);
    // (si lo mejoró de verdad en el medio, se lo queda)
    if (!s || s.up !== 1 || s.lendKeep) return;
    s.up = L.was;
    const st = weaponStats(s.id, s.up);
    s.mag = Math.min(s.mag, st.mag);
    s.reserve = Math.min(s.reserve, st.reserve);
    if (W.slot === s) W.equipModel();
    W.updateHud();
    g.hud.subtitle('Se terminó la Prestada: el mate volvió a ser el de antes.', 2.5);
  }

  // Volado (cuatro quesos): la cabeza de todos los que tenés a la vista.
  blowHeads() {
    const g = this.g;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const eye = cam.getWorldPosition(new THREE.Vector3());
    let n = 0;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.boss || z.crow || z.pombero) continue;
      const head = tmpV.set(z.pos.x, (z.baseY || 0) + 1.6 * (z.scale || 1), z.pos.z);
      const d = head.clone().sub(eye);
      const len = d.length();
      if (len > 45 || d.normalize().dot(fwd) < 0.55) continue;
      if (g.world.raycast(eye, d, len, {}) < len - 0.5) continue;
      g.zombies.damage(z, 1e9, { type: 'bullet', zone: 'head', point: head.clone(), dir: d.clone() });
      n++;
    }
    if (!n) return false;
    g.audio.explosion?.(eye);
    return true;
  }

  // ---------------- en línea ----------------
  hookNet() {
    const g = this.g;
    if (!g.net || this.netHooked === g.net) return;
    this.netHooked = g.net;
    g.net.net.on('emp', (m, from) => {
      if (g.net?.host) g.emp?.onRequest(m, from);
    });
  }

  // Lo que pide un invitado (solo en el anfitrión).
  onRequest(m, from) {
    const g = this.g;
    if (m.k === 'drop' && Array.isArray(m.l)) {
      for (const d of m.l.slice(0, 8)) if (TYPES.includes(d[0]) || d[0] === 'muerte') g.powerups.drop(new THREE.Vector3(+d[1] || 0, +d[2] || 0, +d[3] || 0), true, d[0]);
    } else if (m.k === 'g' && ['freeze', 'blind', 'slow', 'x2'].includes(m.w)) {
      const s = Math.max(0, Math.min(120, +m.s || 0));
      this.setGlobal(m.w, s);
      g.net.event('emp', { k: 'g', w: m.w, s, r: g.rounds.round });
    } else if (m.k === 'rob') {
      this.rob();
    }
  }

  // Lo que avisa otro (evento del anfitrión o compartido por un invitado).
  onEvent(m) {
    const g = this.g;
    const net = g.net;
    if (m.k === 'g') this.setGlobal(m.w, m.s, m.r);
    else if (m.k === 'rob') this.robbed();
    else if (m.k === 'unseen') {
      const r = net?.remote.get(m.id);
      if (r) r.unseenT = g.time + Math.min(30, +m.s || 0);
    } else if (m.k === 'perk') {
      // Invita la Casa de un compañero: un perk que no tenías, también para vos
      const p = g.player;
      const id = m.by !== net?.id && p.alive && !p.downed ? this.missingPerks()[0] : null;
      if (id) {
        this.giving = true;
        p.givePerk(id);
        this.giving = false;
        g.audio.perkJingle(id, p.pos);
        g.hud.subtitle(`Invita la Casa (${net?.nameOf(m.by) || 'un compañero'}): ${PERKS[id].name}.`, 3);
      }
    } else if (m.k === 'eat') {
      const E = EMPANADA[m.id];
      if (E && m.by !== net?.id) g.hud.subtitle(`${net?.nameOf(m.by) || 'Un compañero'}: ${E.name}.`, 3);
    } else if (m.k === 'horno') {
      // el horno de otro: se ve salir su empanada (y no se puede usar mientras)
      const h = this.hornos[m.h];
      if (h && h.state === 'idle' && EMPANADA[m.id]) this.startHorno(h, m.id, m.by);
    } else if (m.k === 'took') {
      const h = this.hornos[m.h];
      if (h && h.by !== 'me') {
        h.model?.group.removeFromParent();
        h.model?.dispose();
        h.model = null;
        this.closeHorno(h);
      }
    }
  }

  // ---------------- HUD ----------------
  buildHud() {
    const hud = this.g.hud;
    // (el HUD es uno solo para todos los mapas: se reusa)
    let el = hud.root.querySelector('.mdu-emp');
    if (!el) {
      el = document.createElement('div');
      el.className = 'mdu-emp';
      el.innerHTML = '<i class="mdu-emp__ring"></i><img alt=""><b class="mdu-emp__n"></b><kbd class="mdu-emp__key"></kbd>';
      hud.root.appendChild(el);
    }
    this.hudEl = el;
    this.hudKey = null;
    this.icons = new Map();
    // arriba de lo de abajo a la izquierda (el escudo, los perks y la ronda), que crece y achica
    const bl = hud.root.querySelector('.mdu-bl');
    if (bl && window.ResizeObserver && !el.__ro) {
      el.__ro = new ResizeObserver(() => {
        const r = bl.getBoundingClientRect();
        const rr = hud.root.getBoundingClientRect();
        if (r.height) el.style.bottom = `${Math.round(rr.bottom - r.top + 18)}px`;
      });
      el.__ro.observe(bl);
    }
  }

  iconFor(id) {
    if (!this.icons.has(id)) {
      try {
        this.icons.set(id, empanadaIcon(this.g.renderer, id, 96));
      } catch {
        this.icons.set(id, '');
      }
    }
    return this.icons.get(id);
  }

  renderHud(force = false) {
    const g = this.g;
    const c = this.cur;
    const el = this.hudEl;
    let k = 1;
    let n = '';
    if (c) {
      if (c.E.use === 'tiempo') k = Math.max(0, (c.until - g.time) / c.E.dur);
      else if (c.E.use === 'rondas') k = Math.max(0, (c.toRound - g.rounds.round + 1) / c.E.dur);
      else if (c.on > g.time) k = (c.on - g.time) / c.E.secs;
      else k = c.uses / c.E.dur;
      if (c.E.use === 'activa' || c.E.use === 'auto') n = c.uses > 1 || c.E.dur > 1 ? String(c.uses) : '';
      if (c.E.use === 'rondas') n = String(Math.max(1, c.toRound - g.rounds.round + 1));
    }
    const key = c ? `${c.id}|${Math.round(k * 60)}|${n}|${c.on > g.time ? 1 : 0}` : '';
    if (!force && key === this.hudKey) return;
    this.hudKey = key;
    el.classList.toggle('is-on', !!c);
    if (!c) return;
    el.style.setProperty('--c', c.E.color);
    el.style.setProperty('--k', k.toFixed(3));
    el.classList.toggle('is-use', c.E.use === 'activa' && c.uses > 0 && !(c.on > g.time));
    el.classList.toggle('is-running', c.on > g.time);
    const img = el.querySelector('img');
    const src = this.iconFor(c.id);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.alt = c.E.name;
    el.title = `${c.E.name} (${c.E.sabor})`;
    el.querySelector('.mdu-emp__n').textContent = n;
    el.querySelector('.mdu-emp__key').textContent = c.E.use === 'activa' ? keyLabel('empanada') : '';
    // Ni Me Vieron: la pantalla se aclara mientras no te ven
    g.hud.root.classList.toggle('is-unseen', (g.player.guardT || 0) > g.time && c.id === 'humita');
  }

  // ---------------- sonidos ----------------
  sfxOven(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: at, gain: 0.7, reverb: 0.15 });
    // la chapa que se corre y el fuego que se aviva
    A.noise(o, { dur: 0.25, type: 'bandpass', freq: 2400, freqEnd: 900, q: 3, gain: 0.35 });
    A.noise(o, { t: A.now + 0.1, dur: 1.2, type: 'lowpass', freq: 380, freqEnd: 900, gain: 0.8, attack: 0.3, brown: true });
  }

  sfxPeel(at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: at, gain: 0.6, reverb: 0.1 });
    A.noise(o, { dur: 0.5, type: 'bandpass', freq: 600, freqEnd: 1400, q: 1.5, gain: 0.5, attack: 0.05 });
    A.tone(o, { t: A.now + 0.45, dur: 0.18, type: 'triangle', freq: 1320, gain: 0.15 });
    A.tone(o, { t: A.now + 0.55, dur: 0.3, type: 'triangle', freq: 1760, gain: 0.12 });
  }

  sfxBite() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.6, reverb: 0.02 });
    const t = A.now;
    for (let i = 0; i < 4; i++) A.noise(o, { t: t + i * 0.025 + Math.random() * 0.01, dur: 0.06, type: 'bandpass', freq: 2200 + Math.random() * 1600, q: 1.8, gain: 0.55 });
    A.noise(o, { t, dur: 0.14, type: 'lowpass', freq: 500, freqEnd: 180, gain: 0.5 });
  }

  sfxChew() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.45, reverb: 0.02 });
    const t = A.now + BITES[1] + 0.2;
    for (let i = 0; i < 4; i++) A.noise(o, { t: t + i * 0.19, dur: 0.12, type: 'lowpass', freq: 420, freqEnd: 160, gain: 0.55, attack: 0.02 });
    // y el trago
    A.tone(o, { t: A.now + EAT_T - 0.45, dur: 0.16, type: 'sine', freq: 180, freqEnd: 95, gain: 0.35 });
  }

  sfxActivate(mega) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.4, reverb: 0.25 });
    const notes = mega ? [523, 659, 784, 1047] : [587, 740, 880];
    notes.forEach((f, i) => A.tone(o, { t: A.now + i * 0.07, dur: 0.35, type: 'triangle', freq: f, gain: 0.22 }));
  }

  // ---------------- cada cuadro ----------------
  update(dt, input) {
    const g = this.g;
    this.hookNet();
    if (g.interact.list.length !== this.wrapped) this.wrapCosts();
    // ronda nueva: el horno vuelve a cobrar desde 500
    if (g.rounds.round !== this.round) {
      this.round = g.rounds.round;
      this.bought = 0;
    }
    this.updateHornos(dt);
    this.updateGlobals();
    const c = this.cur;
    if (c) {
      if ((c.E.use === 'tiempo' && g.time >= c.until) || (c.E.use === 'rondas' && g.rounds.round > c.toRound)) this.stop();
      else if (c.E.use === 'activa' && c.uses <= 0 && !(c.on > g.time)) this.stop();
      if (c.lend && g.time >= c.lend.until) this.endLend(c);
    }
    // A Cuenta (jamón y queso): el cargador se llena de la reserva
    if (this.has('jyq')) {
      const W = g.weapons;
      const s = W.slot;
      const st = W.stats;
      if (s && st && !s.temp && st.kind !== 'melee' && s.mag < st.mag && s.reserve > 0 && W.state !== 'reload') {
        const k = Math.min(st.mag - s.mag, s.reserve);
        s.mag += k;
        s.reserve -= k;
        W.updateHud();
      }
    }
    if (input?.hit('KeyB')) this.activate();
    this.renderHud();
  }

  // Partida nueva: sin empanada, el horno desde 500 y la bolsa mezclada de nuevo.
  newRun() {
    this.stop(true);
    this.bag = [];
    this.bought = 0;
    this.round = -1;
    this.acc = 0;
    this.glob = { freeze: 0, slow: 0, blind: 0, x2: -1 };
    for (const h of this.hornos) {
      h.model?.group.removeFromParent();
      h.model?.dispose();
      h.model = null;
      h.state = 'idle';
      h.peelK = 0;
    }
    // los íconos de la canasta, ya (leer la placa a mitad de partida traba un cuadro)
    for (const id of this.loadout()) this.iconFor(id);
    this.renderHud(true);
  }
}

function bump(t, at, w) {
  const x = (t - at) / w;
  return x > -1 && x < 1 ? Math.cos((x * Math.PI) / 2) ** 2 : 0;
}
