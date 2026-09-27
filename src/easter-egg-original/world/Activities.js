import * as THREE from 'three';
import { PERKS, PERK_ORDER } from '../config/perks';
import { mesh, boxGeo, cylGeo } from './props';

// Cosas para hacer en las habitaciones, además de sobrevivir:
//  · Frascos de las Ánimas: los zombies que caen cerca les mandan el alma;
//    cada frasco lleno deja un regalo (mejor cuanto más frascos llenaste).
//  · Trampas: la del trapiche (eléctrica, con luz) y la llamarada del barbacuá.
//  · Radio Misiones: tres radios viejas que cuentan qué pasó en el molino;
//    con las tres escuchadas suena un chamamé.

const JARS = [
  { cell: [3, 36], face: [1, 0], zone: 'A' },
  { cell: [38, 46], face: [0, -1], zone: 'C' },
  { cell: [3, 14], face: [1, 0], zone: 'G' },
  { cell: [56, 43], face: [-1, 0], zone: 'H' },
];
const JAR_NEED = [8, 12, 16, 20];
const JAR_RANGE = 7.5;

const GIFTS = [
  { id: 'perk', name: 'Ánima del Peón', text: 'un perk de regalo' },
  { id: 'pap', name: 'Ánima del Herrero', text: 'la próxima mejora en el Pack-a-Pava, gratis' },
  { id: 'ammo', name: 'Ánima de la Curandera', text: 'munición completa y tres pavas silbadoras' },
  { id: 'wunder', name: 'Ánima del Patrón', text: 'el Wunder-Mate' },
];

const TRAPS = [
  {
    id: 'trapiche',
    name: 'la Trampa del Trapiche',
    kind: 'shock',
    power: true,
    lever: { cell: [53, 17], face: [0, -1] },
    rect: [49.4, 15.9, 52.6, 18.9],
    posts: [[49.75, 16.25], [52.25, 16.25]],
  },
  {
    id: 'llamarada',
    name: 'la Llamarada',
    kind: 'fire',
    power: false,
    lever: { cell: [31, 22], face: [1, 0] },
    rect: [29.9, 23.7, 33.1, 26.3],
  },
];
const TRAP_COST = 1000;
const TRAP_TIME = 22;
const TRAP_COOL = 35;

const RADIOS = [
  {
    pos: [8.45, 0.815, 36.78],
    rot: 0.3,
    lines: [
      'Radio Misiones, boletín de las nueve. En el molino Santa Ana siguen sin aparecer los peones del turno noche.',
      'El patrón asegura que es un asunto gremial. Los vecinos hablan de otra cosa.',
    ],
  },
  {
    pos: [36.35, 1.06, 34.9],
    rot: Math.PI / 2,
    lines: [
      'Se recomienda a la población no acercarse al barbacuá después de hora. Dicen que el humo tiene voces.',
      'Y si escucha una mecedora en la capilla... no conteste.',
    ],
  },
  {
    pos: [48.95, 0.84, 35.85],
    rot: -0.2,
    lines: [
      'Última transmisión. Si alguien escucha esto: la yerba no se toca, la yerba se ceba.',
      'Y ahora, un chamamé para los que siguen de pie.',
    ],
  },
];

// Escudo armable: tres piezas repartidas por el mapa y la mesa de trabajo del patio.
const PARTS = [
  { id: 'tapa', name: 'Tapa de olla de hierro', pos: [16.2, 0.93, 33.45], zone: 'A' },
  { id: 'cuero', name: 'Cuero crudo de vaca', pos: [38.6, 0.03, 34.3], zone: 'C' },
  { id: 'tientos', name: 'Tientos y hebillas', pos: [10.4, 0.03, 9.2], zone: 'G' },
];
const BENCH = { pos: [12, 19.15], rot: 0 };
const SHIELD_HP = 900;

const tmpV = new THREE.Vector3();

export default class Activities {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.M = game.world.M;
    this.filled = 0;
    this.freePap = false;
    this.buildJars();
    this.buildTraps();
    this.buildRadios();
    this.buildShield();
  }

  // ---------------- frascos de las ánimas ----------------
  buildJars() {
    const g = this.g;
    const M = this.M;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe3e0, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1 });
    this.soulMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.85 });
    const jarGeo = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.19, 0.03], [0.2, 0.3], [0.17, 0.4], [0.12, 0.44], [0.12, 0.48]].map(([r, y]) => new THREE.Vector2(r, y)), 26);
    this.jars = JARS.map((def, i) => {
      const a = g.world.wallAnchor(def.cell, def.face, 0.28);
      const group = new THREE.Group();
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.rot;
      // repisa de madera con ménsulas
      group.add(mesh(boxGeo(0.7, 0.05, 0.5), M.woodDark, 0, 1.12, -0.03));
      for (const x of [-0.26, 0.26]) group.add(mesh(boxGeo(0.05, 0.28, 0.05), M.woodDark, x, 0.96, -0.22, 0.6, 0, 0));
      const jar = new THREE.Mesh(jarGeo, glass);
      jar.position.set(0, 1.145, 0);
      jar.renderOrder = 3;
      group.add(jar);
      group.add(mesh(cylGeo(0.135, 0.135, 0.05, 20), M.brass, 0, 1.64, 0));
      group.add(mesh(new THREE.TorusGeometry(0.13, 0.006, 6, 20, Math.PI), M.iron, 0, 1.66, 0));
      // almas acumuladas: una columna que brilla y crece
      const soul = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.15, 1, 20), this.soulMat.clone());
      soul.position.set(0, 1.16, 0);
      soul.scale.y = 0.001;
      group.add(soul);
      // etiqueta escrita a mano
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshStandardMaterial({ map: jarLabel(i), roughness: 1, transparent: true }));
      label.position.set(0, 1.35, 0.205);
      group.add(label);
      // velitas al costado
      for (const x of [-0.28, 0.28]) {
        group.add(mesh(cylGeo(0.022, 0.022, 0.12, 8), M.candle, x, 1.205, 0.05));
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 6), M.flame);
        f.position.set(x, 1.29, 0.05);
        group.add(f);
      }
      this.root.add(group);
      const top = new THREE.Vector3(a.x, 1.5, a.z);
      const jarObj = { def, i, group, soul, top, count: 0, need: 0, shown: 0, state: 'open', pulse: 0 };
      g.interact.add({
        kind: 'jar',
        pos: new THREE.Vector3(a.x, 1.3, a.z),
        radius: 2.2,
        prompt: () => {
          if (jarObj.state === 'gift') return { text: `agarrar el regalo de las ánimas (${GIFTS[jarObj.giftI].text})`, noCost: true };
          if (jarObj.state === 'open' && jarObj.count > 0) return { text: `Frasco de las Ánimas: ${jarObj.count}/${this.needFor()} almas`, noCost: true, info: true };
          if (jarObj.state === 'open') return { text: 'Frasco de las Ánimas: matá zombies cerca para llenarlo', noCost: true, info: true };
          return null;
        },
        cost: () => (jarObj.state === 'gift' ? 0 : 1),
        use: () => {
          if (jarObj.state !== 'gift') return false;
          this.giveGift(jarObj);
          return true;
        },
      });
      return jarObj;
    });
  }

  needFor() {
    return JAR_NEED[Math.min(this.filled, JAR_NEED.length - 1)];
  }

  onKill(z) {
    const g = this.g;
    let best = null;
    let bd = JAR_RANGE;
    for (const j of this.jars) {
      if (j.state !== 'open' || !g.activeZones.has(j.def.zone)) continue;
      const d = Math.hypot(z.pos.x - j.top.x, z.pos.z - j.top.z);
      if (d < bd && g.world.clear(tmpV.set(z.pos.x, 1.2, z.pos.z), j.top)) {
        bd = d;
        best = j;
      }
    }
    if (!best) return;
    g.fx.soul(z.pos, best.top);
    best.count++;
    best.pulse = 1;
    if (!this.hinted) {
      this.hinted = true;
      g.hud.subtitle('Un alma voló hacia el frasco de la repisa...', 3, 'soul');
    }
    g.net?.event('jar', { i: this.jars.indexOf(best), c: best.count });
    if (best.count >= this.needFor()) {
      best.state = 'gift';
      best.giftI = this.filled;
      this.filled++;
      g.audio.sting();
      g.hud.subtitle(`El frasco se llenó. ${GIFTS[best.giftI].name}: te dejó ${GIFTS[best.giftI].text}.`, 4, 'soul');
      g.fx.sparkle(best.top, [1, 0.6, 0.25], 30, 0.5);
      this.spawnGiftOrb(best);
      g.net?.event('jar', { i: this.jars.indexOf(best), c: best.count, s: 'gift' });
    }
  }

  spawnGiftOrb(j) {
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: new THREE.Color(0xffb060).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    orb.scale.setScalar(0.45);
    const out = new THREE.Vector3(j.def.face[0], 0, j.def.face[1]);
    orb.position.copy(j.top).addScaledVector(out, 0.55).setY(1.35);
    this.root.add(orb);
    j.orb = orb;
  }

  giveGift(j) {
    const g = this.g;
    const gift = GIFTS[j.giftI];
    j.state = 'done';
    j.orb?.removeFromParent();
    j.soulTarget = 0;
    g.audio.powerupGrab();
    g.hud.toast(gift.name);
    if (gift.id === 'perk') {
      const missing = PERK_ORDER.filter((id) => !g.player.perks.has(id) && id !== 'deadshot');
      const id = missing[Math.floor(Math.random() * missing.length)];
      if (id) g.weapons.drink(PERKS[id].color, () => g.player.givePerk(id));
      else g.addPoints(2500, null, true);
    } else if (gift.id === 'pap') {
      this.freePap = true;
      g.hud.subtitle('Tu próxima mejora en el Pack-a-Pava no cuesta nada.', 3.5, 'soul');
    } else if (gift.id === 'ammo') {
      g.weapons.maxAmmo();
      g.weapons.give('pava');
    } else if (gift.id === 'wunder') {
      if (g.weapons.has('wunder')) g.addPoints(5000, null, true);
      else g.weapons.give('wunder');
    }
    if (this.filled >= JARS.length && this.jars.every((x) => x.state === 'done')) {
      g.hud.achievement('Las Ánimas en paz', 'Llenaste los cuatro frascos');
    }
  }

  updateJars(dt) {
    const g = this.g;
    for (const j of this.jars) {
      const need = this.needFor();
      const target = j.state === 'open' ? j.count / need : j.state === 'gift' ? 1 : 0.02;
      j.shown += (target - j.shown) * Math.min(1, dt * 2.5);
      j.soul.scale.y = Math.max(0.001, j.shown * 0.44);
      j.soul.position.y = 1.16 + j.soul.scale.y / 2;
      j.pulse = Math.max(0, j.pulse - dt * 2);
      const flick = 0.75 + Math.sin(g.time * 5 + j.i) * 0.12 + j.pulse * 0.8;
      j.soul.material.color.setRGB(1, 0.54, 0.16).multiplyScalar(1.4 * flick);
      if (j.orb) {
        j.orb.position.y = 1.35 + Math.sin(g.time * 2.5) * 0.06;
        j.orb.material.rotation += dt;
        if (Math.random() < 0.3) g.fx.sparkle(j.orb.position, [1, 0.7, 0.3], 1, 0.3);
      }
    }
  }

  // ---------------- trampas ----------------
  buildTraps() {
    const g = this.g;
    const M = this.M;
    this.traps = TRAPS.map((def) => {
      const a = g.world.wallAnchor(def.lever.cell, def.lever.face, 0.08);
      const group = new THREE.Group();
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.rot;
      group.add(mesh(boxGeo(0.55, 0.75, 0.14), def.kind === 'shock' ? M.metalGreen : M.iron, 0, 1.4, 0));
      const lever = new THREE.Group();
      lever.position.set(0, 1.35, 0.09);
      lever.add(mesh(cylGeo(0.02, 0.02, 0.36, 8), M.iron, 0, 0.18, 0));
      lever.add(mesh(cylGeo(0.04, 0.04, 0.12, 10), M.redPaint, 0, 0.37, 0, 0, 0, Math.PI / 2));
      lever.rotation.x = 0.5;
      group.add(lever);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3010, emissiveIntensity: 1.5 }));
      lamp.position.set(0.18, 1.68, 0.08);
      group.add(lamp);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ map: trapSign(def), roughness: 1 }));
      sign.position.set(0, 1.9, 0.075);
      group.add(sign);
      this.root.add(group);
      const trap = { def, lever, lamp, state: 'idle', t: 0, zapT: 0, hurtT: 0, snd: null };
      // postes con aisladores (trapiche) o rejillas en el piso (llamarada)
      if (def.kind === 'shock') {
        trap.posts = def.posts.map(([x, z]) => {
          const p = new THREE.Group();
          p.position.set(x, 0, z);
          p.add(mesh(cylGeo(0.05, 0.06, 2.3, 8), M.iron, 0, 1.15, 0));
          for (const y of [0.5, 1.1, 1.7]) p.add(mesh(cylGeo(0.06, 0.06, 0.1, 10), M.glassLampOff, 0, y, 0));
          this.root.add(p);
          return new THREE.Vector3(x, 0, z);
        });
      } else {
        const [x0, z0, x1, z1] = def.rect;
        for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.8) {
          for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.8) this.root.add(mesh(boxGeo(0.5, 0.02, 0.5), M.iron, x, 0.012, z));
        }
      }
      g.interact.add({
        kind: 'trap',
        pos: new THREE.Vector3(a.x, 1.3, a.z),
        radius: 1.9,
        prompt: () => {
          if (def.power && !g.world.power) return { text: 'La trampa necesita luz', noCost: true, info: true };
          if (trap.state === 'on') return null;
          if (trap.state === 'cool') return { text: 'La trampa se está enfriando...', noCost: true, info: true };
          return `activar ${def.name}`;
        },
        cost: () => (trap.state === 'idle' && (!def.power || g.world.power) ? TRAP_COST : 1),
        use: () => {
          if (trap.state !== 'idle' || (def.power && !g.world.power)) return false;
          this.fireTrap(trap);
          return true;
        },
      });
      return trap;
    });
  }

  applyRemoteTrap(i) {
    const trap = this.traps[i];
    if (trap && trap.state === 'idle') this.fireTrap(trap, true);
  }

  applyRemoteJar(i, count, state) {
    const jar = this.jars[i];
    if (!jar) return;
    jar.count = count;
    if (state && state !== jar.state) {
      jar.state = state;
      if (state === 'gift') {
        jar.giftI = Math.min(this.filled, 3);
        this.filled++;
        this.g.audio.sting();
        this.spawnGiftOrb(jar);
      } else if (state === 'done') {
        jar.orb?.removeFromParent();
        jar.orb = null;
      }
    }
  }

  // El anfitrión saca el regalo de un frasco para el invitado que lo pidió.
  giftFor(jar) {
    jar.state = 'done';
    jar.orb?.removeFromParent();
    jar.orb = null;
    this.g.net?.event('jar', { i: this.jars.indexOf(jar), c: jar.count, s: 'done' });
    return GIFTS[jar.giftI].id;
  }

  // Aplica un regalo que resolvió el anfitrión (modo invitado).
  applyGift(id) {
    const g = this.g;
    const gift = GIFTS.find((x) => x.id === id);
    g.audio.powerupGrab();
    g.hud.toast(gift ? gift.name : 'Ánima');
    if (id === 'perk') {
      const missing = PERK_ORDER.filter((p) => !g.player.perks.has(p) && p !== 'deadshot');
      const pick = missing[Math.floor(Math.random() * missing.length)];
      if (pick) g.weapons.drink(PERKS[pick].color, () => g.player.givePerk(pick));
      else g.addPoints(2500, null, true);
    } else if (id === 'pap') {
      this.freePap = true;
      g.hud.subtitle('Tu próxima mejora en el Pack-a-Pava no cuesta nada.', 3.5, 'soul');
    } else if (id === 'ammo') {
      g.weapons.maxAmmo();
      g.weapons.give('pava');
    } else if (id === 'wunder') {
      if (g.weapons.has('wunder')) g.addPoints(5000, null, true);
      else g.weapons.give('wunder');
    }
  }

  // Arma o entrega el escudo cuando lo pide un invitado.
  benchUse(remote = false) {
    const g = this.g;
    if (!this.shieldBuilt) {
      if (!Object.values(this.parts).every((p) => p.taken)) return false;
      this.shieldBuilt = true;
      g.hud.setParts(null);
      g.audio.boardRepair(new THREE.Vector3(BENCH.pos[0], 1, BENCH.pos[1]));
      g.net?.event('shield');
      if (!remote) g.hud.achievement('Escudo de tranquera', 'Te cubre la espalda de los golpes');
    }
    return true;
  }

  fireTrap(trap, remote = false) {
    const g = this.g;
    if (!remote) g.net?.event('trap', { i: this.traps.indexOf(trap) });
    trap.state = 'on';
    trap.t = TRAP_TIME;
    trap.lever.rotation.x = -0.5;
    trap.lamp.material.emissive.set(0x20ff40);
    const [x0, z0, x1, z1] = trap.def.rect;
    const center = new THREE.Vector3((x0 + x1) / 2, 1, (z0 + z1) / 2);
    trap.snd = this.trapSound(trap.def.kind, center);
    g.audio.chain(center);
  }

  trapSound(kind, pos) {
    const a = this.g.audio;
    const c = a.ctx;
    const o = a.out({ pos, gain: kind === 'shock' ? 0.5 : 0.8, reverb: 0.2 });
    const nodes = [];
    if (kind === 'shock') {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 2;
      osc.connect(f).connect(o);
      osc.start();
      nodes.push(osc);
    } else {
      const src = c.createBufferSource();
      src.buffer = a.brownBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      src.connect(f).connect(o);
      src.start();
      nodes.push(src);
    }
    return { o, nodes, stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }) };
  }

  updateTraps(dt) {
    const g = this.g;
    for (const trap of this.traps) {
      if (trap.state === 'cool') {
        trap.t -= dt;
        if (trap.t <= 0) {
          trap.state = 'idle';
          trap.lever.rotation.x = 0.5;
          trap.lamp.material.emissive.set(0xff3010);
        }
        continue;
      }
      if (trap.state !== 'on') continue;
      trap.t -= dt;
      const [x0, z0, x1, z1] = trap.def.rect;
      const inRect = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
      if (trap.def.kind === 'shock') {
        trap.zapT -= dt;
        if (trap.zapT <= 0) {
          trap.zapT = 0.06;
          const [a, b] = trap.posts;
          const ya = 0.5 + Math.random() * 1.3;
          const yb = 0.5 + Math.random() * 1.3;
          g.fx.lightning(tmpV.set(a.x, ya, a.z).clone(), new THREE.Vector3(b.x, yb, b.z), 0x9ac8ff, 0.08);
          if (Math.random() < 0.2) g.fx.flash(new THREE.Vector3((a.x + b.x) / 2, 1.2, a.z), 0x8ab8ff, 14, 0.12, 8);
        }
      } else if (Math.random() < 0.9) {
        for (let i = 0; i < 3; i++) g.fx.fire(new THREE.Vector3(x0 + Math.random() * (x1 - x0), 0.1, z0 + Math.random() * (z1 - z0)), 0.5, 1);
        if (Math.random() < 0.08) g.fx.flash(new THREE.Vector3((x0 + x1) / 2, 0.8, (z0 + z1) / 2), 0xff7a2a, 16, 0.2, 8);
      }
      for (const { z } of g.net?.guest ? [] : g.zombies.inRadius(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), 4)) {
        if (!inRect(z.pos) || z.boss) continue;
        g.zombies.damage(z, 1e9, { type: trap.def.kind === 'shock' ? 'chain' : 'trapfire', point: new THREE.Vector3(z.pos.x, 1.1, z.pos.z) });
      }
      // la trampa también te lastima si te metés
      trap.hurtT -= dt;
      if (inRect(g.player.pos) && trap.hurtT <= 0) {
        trap.hurtT = 0.6;
        g.player.damage(35, g.player.pos);
      }
      if (trap.t <= 0) {
        trap.state = 'cool';
        trap.t = TRAP_COOL;
        trap.snd?.stop();
        trap.snd = null;
        trap.lamp.material.emissive.set(0xffa010);
      }
    }
  }

  // ---------------- Radio Misiones ----------------
  buildRadios() {
    const g = this.g;
    const M = this.M;
    const wood = new THREE.MeshStandardMaterial({ map: g.textures.woodCarved, color: 0x8a5a36, roughness: 0.5 });
    const cloth = new THREE.MeshStandardMaterial({ map: g.textures.burlap, color: 0x9a8a60, roughness: 1 });
    this.heard = 0;
    this.radios = RADIOS.map((def, i) => {
      const group = new THREE.Group();
      group.position.set(...def.pos);
      group.rotation.y = def.rot;
      // radio de capilla (arco arriba), parlante de tela y dial que se ilumina
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.16), wood);
      body.position.y = 0.12;
      group.add(body);
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 20, 1, false, 0, Math.PI), wood);
      // medio cilindro acostado: la parte redonda para arriba
      arch.rotation.set(Math.PI / 2, 0, Math.PI / 2, 'ZYX');
      arch.position.y = 0.24;
      group.add(arch);
      const grill = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20, 0, Math.PI), cloth);
      grill.position.set(0, 0.2, 0.081);
      group.add(grill);
      const dialMat = new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: 0xffb050, emissiveIntensity: 0.15 });
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), dialMat);
      dial.position.set(-0.08, 0.08, 0.081);
      group.add(dial);
      for (const x of [0.05, 0.11]) group.add(mesh(cylGeo(0.018, 0.018, 0.02, 10), M.brass, x, 0.07, 0.085, Math.PI / 2, 0, 0));
      this.root.add(group);
      const radio = { def, i, dial: dialMat, heard: false, playing: false, pos: new THREE.Vector3(def.pos[0], def.pos[1] + 0.2, def.pos[2]) };
      g.interact.add({
        kind: 'radio',
        pos: radio.pos,
        radius: 1.8,
        prompt: () => (radio.heard || radio.playing ? null : { text: 'escuchar la radio', noCost: true }),
        cost: () => 0,
        use: () => {
          if (radio.heard || radio.playing) return false;
          this.playRadio(radio);
          return true;
        },
      });
      return radio;
    });
  }

  playRadio(radio) {
    const g = this.g;
    if (radio.playing || radio.heard) return;
    g.net?.event('radio', { i: this.radios.indexOf(radio) });
    radio.playing = true;
    radio.dial.emissiveIntensity = 2.5;
    g.audio.radioTune(radio.pos, 4);
    // cada frase arranca cuando termina la anterior
    const next = (k) => {
      if (k >= radio.def.lines.length) {
        this.radioDone(radio);
        return;
      }
      // cada compu reproduce la radio por su cuenta: no se repite a los demás
      const d = g.say('radio', radio.def.lines[k], 'radio', { local: true });
      g.audio.radioTune(radio.pos, d + 0.4);
      g.later(d + 0.6, () => next(k + 1));
    };
    g.later(0.9, () => next(0));
  }

  radioDone(radio) {
    const g = this.g;
    radio.playing = false;
    radio.heard = true;
    radio.dial.emissiveIntensity = 0.3;
    this.heard++;
    if (this.heard === RADIOS.length) {
      g.later(0.8, () => g.audio.chamame());
      g.hud.achievement('Oyente de Radio Misiones', 'Escuchaste las tres transmisiones');
    } else g.hud.subtitle(`Transmisiones escuchadas: ${this.heard} de ${RADIOS.length}.`, 3);
  }

  // ---------------- escudo ----------------
  buildShield() {
    const g = this.g;
    const M = this.M;
    this.parts = {};
    this.shieldBuilt = false;
    for (const def of PARTS) {
      const obj = new THREE.Group();
      obj.position.set(...def.pos);
      if (def.id === 'tapa') {
        obj.add(mesh(cylGeo(0.26, 0.26, 0.03, 20), M.iron, 0, 0.015, 0));
        obj.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), M.iron, 0, 0.04, 0, Math.PI / 2, 0, 0));
      } else if (def.id === 'cuero') {
        const hide = new THREE.Mesh(new THREE.CircleGeometry(0.45, 9), M.leather);
        hide.scale.set(1.2, 0.8, 1);
        hide.rotation.x = -Math.PI / 2;
        hide.position.y = 0.01;
        obj.add(hide);
      } else {
        for (let i = 0; i < 3; i++) obj.add(mesh(new THREE.TorusGeometry(0.12 - i * 0.02, 0.012, 5, 16), M.leather, 0, 0.02 + i * 0.02, 0, Math.PI / 2, 0, 0));
        obj.add(mesh(boxGeo(0.06, 0.012, 0.05), M.brass, 0.14, 0.02, 0));
      }
      this.root.add(obj);
      // halo y un haz de luz que sube: se ven de lejos
      const fx = new THREE.Group();
      fx.position.set(def.pos[0], def.pos[1], def.pos[2]);
      const halo = new THREE.Sprite(this.partHaloMat());
      halo.scale.setScalar(1.1);
      halo.position.y = 0.2;
      fx.add(halo);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 3.2, 10, 1, true), this.partBeamMat());
      beam.position.y = 1.6;
      fx.add(beam);
      this.root.add(fx);
      const part = { def, obj, fx, halo, taken: false };
      this.parts[def.id] = part;
      g.interact.add({
        kind: 'part',
        pos: new THREE.Vector3(def.pos[0], def.pos[1] + 0.3, def.pos[2]),
        radius: 1.8,
        prompt: () => (part.taken ? null : { text: `agarrar ${def.name.toLowerCase()} (pieza del escudo)`, noCost: true }),
        cost: () => 0,
        use: () => {
          if (part.taken) return false;
          this.takePart(def.id);
          return true;
        },
      });
    }
    // mesa de trabajo del patio, con el plano del escudo
    const bench = new THREE.Group();
    bench.position.set(BENCH.pos[0], 0, BENCH.pos[1]);
    bench.rotation.y = BENCH.rot;
    bench.add(mesh(boxGeo(1.9, 0.08, 0.8), M.wood, 0, 0.9, 0));
    for (const [a, b] of [[-0.85, -0.33], [0.85, -0.33], [-0.85, 0.33], [0.85, 0.33]]) bench.add(mesh(boxGeo(0.08, 0.9, 0.08), M.woodDark, a, 0.45, b));
    bench.add(mesh(boxGeo(0.2, 0.14, 0.16), M.iron, 0.7, 1.01, -0.2));
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), new THREE.MeshStandardMaterial({ map: shieldPlan(), roughness: 1 }));
    plan.rotation.x = -Math.PI / 2;
    plan.position.set(-0.3, 0.945, 0.05);
    bench.add(plan);
    this.root.add(bench);
    g.world.addBox([BENCH.pos[0] - 1, 0, BENCH.pos[1] - 0.45, BENCH.pos[0] + 1, 1, BENCH.pos[1] + 0.45], { kind: 'prop' });
    g.interact.add({
      kind: 'bench',
      pos: new THREE.Vector3(BENCH.pos[0], 1.1, BENCH.pos[1]),
      radius: 2.1,
      prompt: () => {
        if (g.player.shield) return null;
        if (this.shieldBuilt) return { text: 'agarrar el escudo', noCost: true };
        const missing = Object.values(this.parts).filter((p) => !p.taken).length;
        if (missing) return { text: `Mesa de trabajo: faltan ${missing} ${missing === 1 ? 'pieza' : 'piezas'} para el escudo`, noCost: true, info: true };
        return { text: 'armar el escudo', noCost: true };
      },
      cost: () => {
        if (g.player.shield) return 1;
        if (this.shieldBuilt) return 0;
        return Object.values(this.parts).every((p) => p.taken) ? 0 : 1;
      },
      use: () => {
        if (g.player.shield) return false;
        if (!this.shieldBuilt) {
          if (!Object.values(this.parts).every((p) => p.taken)) return false;
          this.shieldBuilt = true;
          g.hud.setParts(null);
          g.audio.boardRepair(new THREE.Vector3(BENCH.pos[0], 1, BENCH.pos[1]));
          g.hud.achievement('Escudo de tranquera', 'Te cubre la espalda de los golpes');
        }
        this.equipShield();
        return true;
      },
    });
  }

  // Una pieza del escudo agarrada (por cualquiera: las piezas son del equipo).
  takePart(id, remote = false) {
    const g = this.g;
    const part = this.parts[id];
    if (!part || part.taken) return;
    part.taken = true;
    part.obj.visible = false;
    part.fx.visible = false;
    g.audio.shell();
    if (!remote) g.net?.event('part', { id });
    const got = Object.values(this.parts).filter((p) => p.taken).length;
    g.hud.toast(`Pieza del escudo: ${got} de ${PARTS.length}`);
    if (got === PARTS.length) g.hud.subtitle('Tenés todo para el escudo. Armalo en la mesa de trabajo del patio.', 4);
  }

  partHaloMat() {
    this.haloMat ||= new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 });
    return this.haloMat;
  }

  partBeamMat() {
    if (this.beamMat) return this.beamMat;
    // degradé de abajo (fuerte) hacia arriba (nada)
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 4, 64);
    this.beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0xffc860, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, side: THREE.DoubleSide });
    return this.beamMat;
  }

  updateParts(dt) {
    const g = this.g;
    if (!this.parts) return;
    const pulse = 0.75 + Math.sin(g.time * 3) * 0.25;
    if (this.haloMat) this.haloMat.opacity = 0.55 + pulse * 0.35;
    if (this.beamMat) this.beamMat.opacity = 0.2 + pulse * 0.15;
    for (const p of Object.values(this.parts)) {
      if (p.taken) continue;
      p.obj.rotation.y += dt * 0.6;
      if (Math.random() < dt * 6) g.fx.sparkle(tmpV.set(p.def.pos[0], p.def.pos[1] + 0.25, p.def.pos[2]), [1, 0.85, 0.45], 1, 0.35);
    }
    // contador de piezas siempre a la vista hasta armar el escudo
    g.hud.setParts(this.shieldBuilt ? null : Object.values(this.parts).map((p) => p.taken));
  }

  equipShield() {
    const g = this.g;
    g.player.shield = { hp: SHIELD_HP };
    g.hud.setShield(1);
    g.hud.subtitle('Escudo a la espalda: los golpes de atrás no te llegan.', 3);
  }

  // Un golpe por la espalda lo frena el escudo.
  shieldHit(amount, from) {
    const g = this.g;
    const s = g.player.shield;
    if (!s) return;
    s.hp -= amount;
    g.audio.shieldHit();
    g.fx.addShake(0.12);
    g.fx.sparks(tmpV.set(g.player.pos.x, 1.2, g.player.pos.z), 0.6, { x: from.x - g.player.pos.x, y: 0.3, z: from.z - g.player.pos.z });
    if (s.hp <= 0) {
      g.player.shield = null;
      g.hud.setShield(null);
      g.audio.shatter(tmpV.set(g.player.pos.x, 1.2, g.player.pos.z));
      g.hud.subtitle('Se te rompió el escudo. Buscá otro en la mesa de trabajo del patio.', 4);
    } else g.hud.setShield(s.hp / SHIELD_HP);
  }

  // ---------------- general ----------------
  update(dt) {
    this.updateJars(dt);
    this.updateTraps(dt);
    this.updateParts(dt);
  }

  dispose() {
    for (const t of this.traps) t.snd?.stop();
  }
}

function shieldPlan() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 180;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a4a7a';
  ctx.fillRect(0, 0, 256, 180);
  ctx.strokeStyle = 'rgba(230,240,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 30, 110, 120);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(70 + i * 27.5, 30);
    ctx.lineTo(70 + i * 27.5, 150);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(125, 90, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,240,255,0.9)';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('ESCUDO: tapa + cuero + tientos', 10, 172);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Etiqueta de papel del frasco, escrita a mano.
function jarLabel(i) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 72;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e4d6b0';
  ctx.fillRect(0, 0, 128, 72);
  ctx.strokeStyle = 'rgba(90,60,30,0.6)';
  ctx.strokeRect(4, 4, 120, 64);
  ctx.fillStyle = '#3a2410';
  ctx.font = 'italic 17px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Ánimas', 64, 30);
  ctx.font = '13px Georgia, serif';
  ctx.fillText(['del peón', 'del herrero', 'de la curandera', 'del patrón'][i], 64, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function trapSign(def) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 100;
  const ctx = c.getContext('2d');
  ctx.fillStyle = def.kind === 'shock' ? '#e8c020' : '#a01c10';
  ctx.fillRect(0, 0, 256, 100);
  ctx.fillStyle = def.kind === 'shock' ? '#111' : '#f3e6c8';
  ctx.font = 'bold 30px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.kind === 'shock' ? '¡PELIGRO!' : '¡FUEGO!', 128, 42);
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(`$${TRAP_COST} · ${def.kind === 'shock' ? 'ALTA TENSIÓN' : 'NO PASAR'}`, 128, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

