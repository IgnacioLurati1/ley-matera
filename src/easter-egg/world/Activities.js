import * as THREE from 'three';
import { PERKS, PERK_ORDER } from '../config/perks';
import { mesh, boxGeo, cylGeo } from './props';
import { ACT } from '../config/map';
import { fireflies } from '../fx/Fireflies';
import { shieldModel } from './shieldModels';
import { buildJar } from './jarModels';

// Cosas para hacer en las habitaciones, además de sobrevivir:
//  · Frascos de las Ánimas: los zombies que caen cerca les mandan el alma;
//    cada frasco lleno deja un regalo (mejor cuanto más frascos llenaste).
//  · Trampas: la del trapiche (eléctrica, con luz) y la llamarada del barbacuá.
//  · Radio Misiones: tres radios viejas que cuentan qué pasó en el molino;
//    con las tres escuchadas suena un chamamé.

const JAR_NEED = [8, 12, 16, 20];
const JAR_RANGE = 7.5;

const GIFTS = [
  { id: 'perk', name: 'Ánima del Peón', text: 'un perk de regalo' },
  { id: 'pap', name: 'Ánima del Herrero', text: 'la próxima mejora en el Pack-a-Pava, gratis' },
  { id: 'ammo', name: 'Ánima de la Curandera', text: 'munición completa y tres pavas silbadoras' },
  { id: 'wunder', name: 'Ánima del Patrón', text: 'el Wunder-Mate' },
];

const TRAP_COST = 1000;
const TRAP_TIME = 22;
const TRAP_COOL = 35;

// Escudo armable: tres piezas repartidas por el mapa y la mesa de trabajo
// (dónde y de qué está hecho lo dice cada mapa: config/maps/*; cómo se ve
// armado, world/shieldModels).
// dónde quedan las piezas juntadas en la mesa (x, z, giro), al lado del plano
const BENCH_SLOTS = [
  [-0.62, -0.2, 0.4],
  [0.25, 0.12, -0.3],
  [0.62, 0.18, 1.1],
];

const tmpV = new THREE.Vector3();

// Altura de lo que hay justo abajo de (x, y, z) (una mesa, un barril): así lo
// que se apoya no queda flotando si la utilería es más baja de lo anotado.
// Busca solo cerca (de 25 cm arriba a 35 cm abajo); si no hay nada, queda y.
// Se usa recién en el primer update: antes la utilería no está en la escena
// (el mundo la junta en una malla al final de armar el mapa).
const restRay = new THREE.Raycaster();
export function restY(g, x, y, z, skip = null) {
  g.scene.updateMatrixWorld();
  restRay.set(new THREE.Vector3(x, y + 0.25, z), new THREE.Vector3(0, -1, 0));
  restRay.far = 0.6;
  // solo mallas sólidas (los sprites y lo transparente no sostienen nada)
  const solids = [];
  g.scene.traverseVisible((o) => {
    if (o.isMesh && !o.material?.transparent && (!skip || !o.parent || (o.parent !== skip && o.parent.parent !== skip))) solids.push(o);
  });
  const hit = restRay.intersectObjects(solids, false)[0];
  return hit ? hit.point.y : y;
}

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
    this.jars = ACT.jars.map((def, i) => {
      // (o colgado de un poste: `pos` es donde va la repisa)
      const a = def.pos ? { x: def.pos[0], z: def.pos[1], rot: Math.atan2(def.face[0], def.face[1]) } : g.world.wallAnchor(def.cell, def.face, 0.28);
      // en el penal la repisa va a la altura del piso de ese lugar
      const fy = def.y ?? g.world.floorAt(def.cell[0] + 0.5 + def.face[0], def.cell[1] + 0.5 + def.face[1]);
      const group = new THREE.Group();
      group.position.set(a.x, fy, a.z);
      group.rotation.y = a.rot;
      // el frasco de cada mapa, con su repisa (world/jarModels.js); adentro,
      // las almas acumuladas: una columna que brilla y crece
      const J = buildJar(g.mapId, M, i, jarLabel(i));
      group.add(J.obj);
      J.soul.position.y = J.y0;
      group.add(J.soul);
      const soul = J.soul;
      this.root.add(group);
      const top = new THREE.Vector3(a.x, fy + J.top, a.z);
      const jarObj = { def, i, group, soul, top, fy, J, count: 0, need: 0, shown: 0, state: 'open', pulse: 0 };
      g.interact.add({
        kind: 'jar',
        pos: new THREE.Vector3(a.x, fy + 1.3, a.z),
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

  // Con más jugadores se llena más rápido: pide 3 almas más por cada uno de más.
  needFor() {
    const n = this.g.net ? this.g.net.net.count : 1;
    return JAR_NEED[Math.min(this.filled, JAR_NEED.length - 1)] + 3 * (n - 1);
  }

  onKill(z) {
    const g = this.g;
    let best = null;
    let bd = JAR_RANGE;
    for (const j of this.jars) {
      if (j.state !== 'open' || !g.activeZones.has(j.def.zone)) continue;
      const d = Math.hypot(z.pos.x - j.top.x, z.pos.z - j.top.z);
      // (con alturas, desde el piso donde cayó)
      const zy = g.world.levels ? (z.pos.y || 0) + 1.2 : 1.2;
      if (d < bd && g.world.clear(tmpV.set(z.pos.x, zy, z.pos.z), j.top)) {
        bd = d;
        best = j;
      }
    }
    if (!best) return;
    g.fx.soul(z.pos, best.top, best.J.rgb);
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
      g.fx.sparkle(best.top, best.J.rgb, 30, 0.5);
      this.spawnGiftOrb(best);
      g.net?.event('jar', { i: this.jars.indexOf(best), c: best.count, s: 'gift' });
    }
  }

  spawnGiftOrb(j) {
    const [r, gg, b] = j.J.rgb;
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: new THREE.Color(r, 0.3 + gg * 0.7, 0.2 + b * 0.8).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    orb.scale.setScalar(0.45);
    const out = new THREE.Vector3(j.def.face[0], 0, j.def.face[1]);
    // (a la altura del frasco, sobre el piso de su lugar: en los pisos de
    // arriba quedaba en el aire a 1,35 m del suelo de la planta baja)
    orb.position.copy(j.top).addScaledVector(out, 0.55).setY(j.fy + 1.35);
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
    if (this.filled >= ACT.jars.length && this.jars.every((x) => x.state === 'done')) {
      g.hud.achievement('Las Ánimas en paz', 'Llenaste todos los frascos');
    }
  }

  updateJars(dt) {
    const g = this.g;
    for (const j of this.jars) {
      const need = this.needFor();
      const target = j.state === 'open' ? j.count / need : j.state === 'gift' ? 1 : 0.02;
      j.shown += (target - j.shown) * Math.min(1, dt * 2.5);
      j.soul.scale.y = Math.max(0.001, j.shown * j.J.h);
      j.soul.position.y = j.J.y0 + j.soul.scale.y / 2;
      j.pulse = Math.max(0, j.pulse - dt * 2);
      const flick = 0.75 + Math.sin(g.time * 5 + j.i) * 0.12 + j.pulse * 0.8;
      j.soul.material.color.setRGB(...j.J.rgb).multiplyScalar(1.4 * flick);
      j.J.anim?.(dt, g.time, j.shown);
      if (j.orb) {
        j.orb.position.y = j.fy + 1.35 + Math.sin(g.time * 2.5) * 0.06;
        j.orb.material.rotation += dt;
        if (Math.random() < 0.3) g.fx.sparkle(j.orb.position, j.J.rgb, 1, 0.3);
      }
    }
  }

  // ---------------- trampas ----------------
  buildTraps() {
    const g = this.g;
    const M = this.M;
    this.traps = ACT.traps.map((def) => {
      const a = g.world.wallAnchor(def.lever.cell, def.lever.face, 0.08);
      const fy = g.world.floorAt(def.lever.cell[0] + 0.5 + def.lever.face[0], def.lever.cell[1] + 0.5 + def.lever.face[1]);
      const [rx0, rz0, rx1, rz1] = def.rect;
      // el piso del lugar de la trampa
      const ry = g.world.floorAt((rx0 + rx1) / 2, (rz0 + rz1) / 2);
      const group = new THREE.Group();
      group.position.set(a.x, fy, a.z);
      group.rotation.y = a.rot;
      group.add(mesh(boxGeo(0.55, 0.75, 0.14), def.kind === 'shock' ? M.metalGreen : def.kind === 'scald' ? M.copper : M.iron, 0, 1.4, 0));
      const lever = new THREE.Group();
      lever.position.set(0, 1.35, 0.09);
      lever.add(mesh(cylGeo(0.02, 0.02, 0.36, 8), M.iron, 0, 0.18, 0));
      lever.add(mesh(cylGeo(0.04, 0.04, 0.12, 10), M.redPaint, 0, 0.37, 0, 0, 0, Math.PI / 2));
      // lista: para abajo; al usarla sube por adelante (nunca hacia la pared)
      lever.rotation.x = Math.PI - 0.5;
      group.add(lever);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3010, emissiveIntensity: 1.5 }));
      lamp.position.set(0.18, 1.68, 0.08);
      group.add(lamp);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ map: trapSign(def), roughness: 1 }));
      sign.position.set(0, 1.9, 0.075);
      group.add(sign);
      this.root.add(group);
      const trap = { def, lever, lamp, state: 'idle', t: 0, zapT: 0, hurtT: 0, snd: null, fy: ry };
      // postes con aisladores (trapiche) o rejillas en el piso (llamarada)
      if (def.kind === 'shock') {
        trap.posts = def.posts.map(([x, z]) => {
          const p = new THREE.Group();
          p.position.set(x, ry, z);
          p.add(mesh(cylGeo(0.05, 0.06, 2.3, 8), M.iron, 0, 1.15, 0));
          for (const y of [0.5, 1.1, 1.7]) p.add(mesh(cylGeo(0.06, 0.06, 0.1, 10), M.glassLampOff, 0, y, 0));
          this.root.add(p);
          return new THREE.Vector3(x, ry, z);
        });
      } else if (def.kind !== 'scald') {
        // (las duchas hirvientes largan el agua por las regaderas: no llevan rejillas)
        const [x0, z0, x1, z1] = def.rect;
        for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.8) {
          for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.8) this.root.add(mesh(boxGeo(0.5, 0.02, 0.5), M.iron, x, ry + 0.012, z));
        }
      }
      g.interact.add({
        kind: 'trap',
        pos: new THREE.Vector3(a.x, fy + 1.3, a.z),
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
      g.audio.boardRepair(new THREE.Vector3(ACT.bench.pos[0], 1, ACT.bench.pos[1]));
      g.net?.event('shield');
      if (!remote) g.hud.achievement(ACT.shield.name, 'Te cubre la espalda de los golpes');
    }
    return true;
  }

  fireTrap(trap, remote = false) {
    const g = this.g;
    if (!remote) g.net?.event('trap', { i: this.traps.indexOf(trap) });
    trap.state = 'on';
    trap.t = TRAP_TIME;
    trap.lever.rotation.x = 0.5;
    trap.lamp.material.emissive.set(0x20ff40);
    const [x0, z0, x1, z1] = trap.def.rect;
    const center = new THREE.Vector3((x0 + x1) / 2, (trap.fy || 0) + 1, (z0 + z1) / 2);
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
      // el agua hirviendo silba; el fuego ruge
      f.type = kind === 'scald' ? 'highpass' : 'lowpass';
      f.frequency.value = kind === 'scald' ? 1800 : 700;
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
          trap.lever.rotation.x = Math.PI - 0.5;
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
          const ya = a.y + 0.5 + Math.random() * 1.3;
          const yb = b.y + 0.5 + Math.random() * 1.3;
          g.fx.lightning(tmpV.set(a.x, ya, a.z).clone(), new THREE.Vector3(b.x, yb, b.z), 0x9ac8ff, 0.08);
          if (Math.random() < 0.2) g.fx.flash(new THREE.Vector3((a.x + b.x) / 2, a.y + 1.2, a.z), 0x8ab8ff, 14, 0.12, 8);
        }
      } else if (trap.def.kind === 'scald') {
        // chorros de agua hirviendo desde el techo y el vapor que llena el cuarto
        for (let i = 0; i < 4; i++) {
          const x = x0 + Math.random() * (x1 - x0);
          const z = z0 + Math.random() * (z1 - z0);
          const fy = trap.fy || 0;
          g.fx.waterJet(tmpV.set(x, fy + 2.35, z).clone(), new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, fy, z + (Math.random() - 0.5) * 0.3), true);
        }
        g.fx.steam(new THREE.Vector3(x0 + Math.random() * (x1 - x0), (trap.fy || 0) + 0.3, z0 + Math.random() * (z1 - z0)), 4, 1.4);
      } else if (Math.random() < 0.9) {
        for (let i = 0; i < 3; i++) g.fx.fire(new THREE.Vector3(x0 + Math.random() * (x1 - x0), (trap.fy || 0) + 0.1, z0 + Math.random() * (z1 - z0)), 0.5, 1);
        if (Math.random() < 0.08) g.fx.flash(new THREE.Vector3((x0 + x1) / 2, (trap.fy || 0) + 0.8, (z0 + z1) / 2), 0xff7a2a, 16, 0.2, 8);
      }
      for (const { z } of g.net?.guest ? [] : g.zombies.inRadius(new THREE.Vector3((x0 + x1) / 2, trap.fy || 0, (z0 + z1) / 2), 4)) {
        if (!inRect(z.pos) || z.boss) continue;
        g.zombies.damage(z, 1e9, { type: trap.def.kind === 'shock' ? 'chain' : trap.def.kind === 'scald' ? 'scald' : 'trapfire', point: new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1.1, z.pos.z) });
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
    this.radios = ACT.radios.map((def, i) => {
      const group = new THREE.Group();
      const y = def.pos[1];
      group.position.set(def.pos[0], y, def.pos[2]);
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
      const radio = { def, i, group, dial: dialMat, heard: false, playing: false, pos: new THREE.Vector3(def.pos[0], y + 0.2, def.pos[2]) };
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
    if (this.heard === ACT.radios.length) {
      g.later(0.8, () => g.audio.chamame());
      g.hud.achievement(...ACT.radioAch);
    } else g.hud.subtitle(`Transmisiones escuchadas: ${this.heard} de ${ACT.radios.length}.`, 3);
  }

  // ---------------- escudo ----------------
  buildShield() {
    const g = this.g;
    const M = this.M;
    this.parts = {};
    this.shieldBuilt = false;
    for (const def of ACT.parts) {
      const obj = new THREE.Group();
      obj.position.set(...def.pos);
      if (def.id === 'tapa') {
        obj.add(mesh(cylGeo(0.26, 0.26, 0.03, 20), M.iron, 0, 0.015, 0));
        obj.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), M.iron, 0, 0.04, 0, Math.PI / 2, 0, 0));
      } else if (def.id === 'barrote') {
        // el penal: el escudo es de barrotes de hierro
        obj.add(mesh(cylGeo(0.022, 0.022, 1.1, 8), M.bars || M.iron, 0, 0.03, 0, 0, 0, Math.PI / 2));
        obj.add(mesh(cylGeo(0.022, 0.022, 1.0, 8), M.bars || M.iron, 0.05, 0.03, 0.12, 0, 0.3, Math.PI / 2));
      } else if (def.id === 'grillete') {
        for (let i = 0; i < 5; i++) obj.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), M.iron, -0.2 + i * 0.08, 0.02, 0, Math.PI / 2, 0, i % 2 ? 0.8 : 0));
        obj.add(mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 14), M.iron, 0.24, 0.02, 0, Math.PI / 2, 0, 0));
      } else if (def.id === 'chapa') {
        obj.add(mesh(boxGeo(0.6, 0.02, 0.45), M.rust || M.metal, 0, 0.012, 0, 0, 0.3, 0.05));
        for (const [x, z] of [[-0.25, -0.18], [0.25, 0.18]]) obj.add(mesh(cylGeo(0.02, 0.02, 0.02, 6), M.iron, x, 0.03, z));
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
      // unas luciérnagas alrededor: se ven si uno mira con atención
      const fx = new THREE.Group();
      fx.position.set(def.pos[0], def.pos[1], def.pos[2]);
      const halo = fireflies(g, 0xffd27a, 1.1);
      halo.position.y = 0.2;
      fx.add(halo);
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
    // mesa de trabajo, con el plano del escudo
    const bench = new THREE.Group();
    const by = ACT.bench.y ?? g.world.floorAt(ACT.bench.pos[0], ACT.bench.pos[1]);
    bench.position.set(ACT.bench.pos[0], by, ACT.bench.pos[1]);
    bench.rotation.y = ACT.bench.rot;
    bench.add(mesh(boxGeo(1.9, 0.08, 0.8), M.wood, 0, 0.9, 0));
    for (const [a, b] of [[-0.85, -0.33], [0.85, -0.33], [-0.85, 0.33], [0.85, 0.33]]) bench.add(mesh(boxGeo(0.08, 0.9, 0.08), M.woodDark, a, 0.45, b));
    bench.add(mesh(boxGeo(0.2, 0.14, 0.16), M.iron, 0.7, 1.01, -0.2));
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), new THREE.MeshStandardMaterial({ map: shieldPlan(), roughness: 1 }));
    plan.rotation.x = -Math.PI / 2;
    plan.position.set(-0.3, 0.945, 0.05);
    bench.add(plan);
    // el escudo armado, acostado en la mesa hasta que uno lo agarra (cada uno
    // ve el suyo: si ya lo tenés puesto, la mesa queda vacía)
    const built = shieldModel(M, g.mapId);
    built.rotation.x = -Math.PI / 2;
    built.position.y = 0.94 + built.userData.back;
    const holder = new THREE.Group();
    holder.position.set(0.12, 0, 0.02);
    holder.rotation.y = 0.25;
    holder.visible = false;
    holder.add(built);
    bench.add(holder);
    this.bench = bench;
    this.benchShield = holder;
    this.root.add(bench);
    g.world.addBox([ACT.bench.pos[0] - 1, by, ACT.bench.pos[1] - 0.45, ACT.bench.pos[0] + 1, by + 1, ACT.bench.pos[1] + 0.45], { kind: 'prop' });
    g.interact.add({
      kind: 'bench',
      pos: new THREE.Vector3(ACT.bench.pos[0], by + 1.1, ACT.bench.pos[1]),
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
          g.audio.boardRepair(new THREE.Vector3(ACT.bench.pos[0], 1, ACT.bench.pos[1]));
          g.hud.achievement(ACT.shield.name, 'Te cubre la espalda de los golpes');
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
    part.fx.visible = false;
    // queda suelta en la mesa de trabajo (más chica) hasta que se arma el escudo
    const i = ACT.parts.findIndex((d) => d.id === id);
    const [x, z, ry] = BENCH_SLOTS[i] || BENCH_SLOTS[0];
    part.obj.position.set(x, 0.945, z);
    part.obj.rotation.set(0, ry, 0);
    part.obj.scale.setScalar(0.55);
    this.bench.add(part.obj);
    g.audio.shell();
    if (!remote) g.net?.event('part', { id });
    const got = Object.values(this.parts).filter((p) => p.taken).length;
    g.hud.toast(`Pieza del escudo: ${got} de ${ACT.parts.length}`);
  }

  updateParts(dt) {
    const g = this.g;
    if (!this.parts) return;
    for (const p of Object.values(this.parts)) {
      if (p.taken) {
        p.obj.visible = !this.shieldBuilt;
        continue;
      }
      p.obj.rotation.y += dt * 0.6;
    }
    this.benchShield.visible = this.shieldBuilt && !g.player.shield;
    // contador de piezas siempre a la vista hasta armar el escudo
    g.hud.setParts(this.shieldBuilt ? null : Object.values(this.parts).map((p) => p.taken));
  }

  equipShield() {
    const g = this.g;
    g.player.shield = { hp: ACT.shield.hp };
    g.hud.setShield(1);
  }

  // Un golpe por la espalda lo frena el escudo.
  shieldHit(amount, from) {
    const g = this.g;
    const s = g.player.shield;
    if (!s) return;
    s.hp -= amount;
    g.audio.shieldHit();
    g.fx.addShake(0.12);
    g.fx.sparks(tmpV.set(g.player.pos.x, g.player.pos.y + 1.2, g.player.pos.z), 0.6, { x: from.x - g.player.pos.x, y: 0.3, z: from.z - g.player.pos.z });
    if (s.hp <= 0) {
      g.player.shield = null;
      g.hud.setShield(null);
      g.audio.shieldBreak();
    } else g.hud.setShield(s.hp / ACT.shield.hp);
  }

  // ---------------- general ----------------
  // Las radios, apoyadas en lo que tengan abajo (una sola vez, con la utilería ya puesta).
  settleRadios() {
    this.radiosSettled = true;
    for (const r of this.radios || []) {
      const y = restY(this.g, r.def.pos[0], r.def.pos[1], r.def.pos[2], this.root);
      r.group.position.y = y;
      r.pos.y = y + 0.2;
    }
  }

  update(dt) {
    if (!this.radiosSettled) this.settleRadios();
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
  ctx.fillText(ACT.shield.plan, 10, 172);
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
  const scald = def.kind === 'scald';
  ctx.fillStyle = def.kind === 'shock' ? '#e8c020' : scald ? '#1c4a8a' : '#a01c10';
  ctx.fillRect(0, 0, 256, 100);
  ctx.fillStyle = def.kind === 'shock' ? '#111' : '#f3e6c8';
  ctx.font = 'bold 30px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.kind === 'shock' ? '¡PELIGRO!' : scald ? '¡QUEMA!' : '¡FUEGO!', 128, 42);
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(`$${TRAP_COST} · ${def.kind === 'shock' ? 'ALTA TENSIÓN' : scald ? 'AGUA HIRVIENDO' : 'NO PASAR'}`, 128, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

