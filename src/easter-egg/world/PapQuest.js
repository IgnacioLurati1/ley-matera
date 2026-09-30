import * as THREE from 'three';
import { MAP_ID, PAP, ZONES, START_ZONE } from '../config/map';
import { getMats } from '../weapons/viewmodels';
import { mesh, boxGeo, cylGeo } from './props';
import PapTermas from './papTermas';
import PapYacare from './papYacare';

// Antes de usar el Pack-a-Pava hay que prepararlo, y cada mapa tiene su vuelta
// (corta, pero no al toque):
//  · El Molino: la máquina no tiene presión. Tres pavitas silban escondidas
//    en lo alto de las paredes (galpón, patio y acopio): hay que bajarlas a tiros.
//  · La Tapera: la Colorada, una gallina, se robó la tapa de la pava y anda
//    suelta en una zona al azar (nunca en la del arranque). Corre, pero se
//    cansa: hay que agarrarla y después ponerle la tapa.
//  · Mate of the Dead: la máquina está encadenada. Las llaves las tiene un
//    guardia muerto que anda entre los zombies (tintinea): matarlo, levantar
//    las llaves y abrir los candados.
//  · Revelaciones Materas: le falta la garrafa, que cuelga de una roldana
//    afuera de la arcada del piso 10. Se sube a manivela (tiene traba cada cuarto).
//  · Der Mateendrache: las termas se helaron. Hay que romper a tiros los tres
//    tapones de hielo de las pozas (world/papTermas.js).
// Lo decide el anfitrión: los invitados le avisan lo que hacen (las pavitas
// con 'papq'; lo demás con F, como cualquier cosa del mapa) y él reparte el
// estado con el evento 'papq'.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

// Las pavitas del molino: pared (celda y cara) y altura de la repisa.
const PAVITAS = [
  { cell: [3, 36], face: [1, 0], y: 2.5 }, // el galpón (el arranque)
  { cell: [26, 17], face: [0, 1], y: 2.7 }, // el patio del secadero
  { cell: [31, 14], face: [-1, 0], y: 2.75 }, // el acopio, al lado del Pack-a-Pava
];

// La Colorada: cómo camina, corre y se cansa (la zona la elige al azar el anfitrión).
const HEN = { walk: 0.8, run: 5.3, runFor: 2.4, rest: 1.1, scare: 4.2, calm: 9 };
const HEN_STATES = ['peck', 'run', 'tired', 'calm'];

// La roldana de la torre: la manivela y el pescante, en la arcada de al lado del Pack-a-Pava.
const CRANK = { x: 18.9, z: 30.5 };
const HOIST = { x: 16.2, z: 30.5, depth: 20 };
const CRANK_STEP = 1 / 14;
const SLIP = 0.04;

export default class PapQuest {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.M = game.world.M;
    this.mats = getMats(game.textures);
    this.pap = game.interact.pap;
    this.papIt = game.interact.list.find((it) => it.kind === 'pap');
    this.done = false;
    this.kind = { granja: 'gallina', penal: 'llaves', torre: 'roldana', castillo: 'termas', esteros: 'yacare' }[MAP_ID] || 'pavitas';
    if (this.kind === 'pavitas') this.buildPavitas();
    else if (this.kind === 'gallina') this.buildHen();
    else if (this.kind === 'llaves') this.buildKeys();
    // el castillo: las termas heladas
    else if (this.kind === 'termas') this.termas = new PapTermas(this);
    // el estero: el yacaré enroscado en la máquina (world/papYacare.js; usa
    // los mismos ganchos que las termas)
    else if (this.kind === 'yacare') this.termas = new PapYacare(this);
    else this.buildHoist();
    // lo que dice la máquina mientras no está lista (la de verdad no dice nada)
    const it = this.papIt;
    game.interact.add({
      kind: 'papq',
      floorY: it.floorY,
      pos: it.pos.clone(),
      front: it.front.clone(),
      radius: it.radius,
      holdTime: 1.2,
      prompt: () => (this.done ? null : this.papPrompt()),
      cost: () => 0,
      use: () => !this.done && this.papUse(),
    });
  }

  get playing() {
    return this.g.state === 'playing';
  }

  papPrompt() {
    if (this.termas) return this.termas.prompt();
    const info = (text) => ({ text, noCost: true, info: true });
    if (this.kind === 'pavitas') {
      const n = this.pavitas.filter((p) => p.state !== 'up').length;
      return info(`El Pack-a-Pava no tiene presión. Tres pavitas silban en lo alto del molino (${n}/3)`);
    }
    if (this.kind === 'gallina') {
      if (this.lid) return { text: 'ponerle la tapa al Pack-a-Pava', noCost: true };
      const h = this.hen;
      const zk = !this.g.net?.guest || h.net ? this.g.world.zoneAt(h.pos.x, h.pos.z) : null;
      const where = zk ? `anda suelta por ${ZONES[zk].name}` : 'anda suelta por algún lado de la chacra';
      return info(`Al Pack-a-Pava le falta la tapa. Se la llevó la Colorada, que ${where}. Seguí el cacareo`);
    }
    if (this.kind === 'llaves') {
      if (this.keys === 'taken') return { text: 'abrir los candados del Pack-a-Pava', hold: true, noCost: true };
      if (this.keys === 'floor') return info('Las llaves quedaron donde cayó el guardia. Seguí el brillo');
      return info('El Pack-a-Pava está encadenado. Entre los muertos se oyen unas llaves');
    }
    return info(`Al Pack-a-Pava le falta la garrafa. Cuelga de la roldana, en la arcada de al lado (${Math.round(this.prog * 100)}%)`);
  }

  papUse() {
    if (this.termas) return this.termas.use();
    if (this.kind === 'gallina' && this.lid) {
      this.finish();
      return true;
    }
    if (this.kind === 'llaves' && this.keys === 'taken') {
      this.finish();
      return true;
    }
    return false;
  }

  // El anfitrión la da por lista (también el atajo de prueba Alt+K).
  finish() {
    if (this.done || this.g.net?.guest) return;
    this.g.net?.event('papq', { d: 1 });
    this.complete();
  }

  complete(quiet = false) {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    if (this.kind === 'gallina') this.gotLid(true);
    if (this.kind === 'llaves') this.dropChains(quiet);
    if (this.kind === 'roldana') this.landGarrafa(quiet);
    this.termas?.complete(quiet);
    if (quiet) return;
    const top = this.pap.kettle.getWorldPosition(tmpV).clone();
    top.y += 1;
    g.fx.steam(top, 16, 0.5);
    g.fx.sparkle(this.pap.slotPos, [0.9, 0.5, 1], 30, 0.8);
    g.audio?.kettle(top, 2.2);
    if (!g.interact.machineOn(this.pap)) g.hud.subtitle(g.interact.shockPower ? 'Ahora dale corriente desde el gaucho life.' : 'Ahora le falta la luz.', 3);
  }

  // ---------------- red ----------------
  fullState() {
    const s = { kd: this.kind, d: this.done ? 1 : 0 };
    if (this.kind === 'pavitas') s.pvs = this.pavitas.map((p) => (p.state === 'up' ? 0 : 1));
    if (this.kind === 'gallina') {
      s.h = this.henPacket();
      if (this.lid) s.lid = 1;
    }
    if (this.kind === 'llaves') {
      if (this.keys === 'guard') s.g = this.guardNet;
      if (this.keys === 'floor') s.k = this.keysAt.toArray().map((v) => +v.toFixed(2));
      if (this.keys === 'taken') s.kt = 1;
    }
    if (this.kind === 'roldana') s.r = +this.prog.toFixed(3);
    if (this.termas) Object.assign(s, this.termas.state());
    return s;
  }

  // (en la sala puede llegar el estado de otro mapa: cada uno toma solo lo suyo)
  applyRemote(m, quiet = false) {
    const k = this.kind;
    if (m.kd && m.kd !== k) return;
    if (k === 'pavitas') {
      if (m.pv != null) this.dropPavita(m.pv, m.dx || 0, m.dz || 0);
      if (m.pvs) m.pvs.forEach((v, i) => v && this.dropPavita(i, 0, 0, true));
    } else if (k === 'gallina') {
      if (m.h) this.henNet(m.h);
      if (m.lid) this.gotLid(quiet);
    } else if (k === 'llaves') {
      if (m.g != null) this.setGuard(m.g, quiet);
      if (m.k) this.dropKeys(tmpV.fromArray(m.k), quiet);
      if (m.kt) this.takeKeys(quiet);
    } else if (this.termas) this.termas.apply(m, quiet);
    else if (m.r != null) this.prog = m.r;
    if (m.d) this.complete(quiet);
  }

  // Lo que manda un invitado (las pavitas: el que le pegó fue él).
  onGuest(m) {
    if (this.termas) return this.termas.onGuest(m);
    if (m.pv != null && this.pavitas?.[m.pv | 0]) this.knockPavita(m.pv | 0, +m.dx || 0, +m.dz || 0);
  }

  update(dt) {
    if (this.termas) return this.termas.update(dt);
    if (this.kind === 'pavitas') this.updatePavitas(dt);
    else if (this.kind === 'gallina') this.updateHen(dt);
    else if (this.kind === 'llaves') this.updateKeys(dt);
    else this.updateHoist(dt);
  }

  // ---------------- el molino: las pavitas ----------------
  buildPavitas() {
    const g = this.g;
    const M = this.M;
    this.pavitas = PAVITAS.map((d, i) => {
      const a = g.world.wallAnchor(d.cell, d.face, 0.2);
      const fy = g.world.floorAt(d.cell[0] + 0.5 + d.face[0], d.cell[1] + 0.5 + d.face[1]);
      // repisa de madera con su ménsula
      const shelf = new THREE.Group();
      shelf.position.set(a.x, fy + d.y, a.z);
      shelf.rotation.y = a.rot;
      shelf.add(mesh(boxGeo(0.5, 0.05, 0.4), M.woodDark, 0, -0.025, 0));
      shelf.add(mesh(boxGeo(0.05, 0.34, 0.05), M.woodDark, 0, -0.2, -0.08, 0.7, 0, 0));
      this.root.add(shelf);
      const kettle = this.smallKettle();
      kettle.position.set(a.x, fy + d.y, a.z);
      kettle.rotation.y = a.rot;
      this.root.add(kettle);
      return {
        i,
        kettle,
        base: kettle.position.clone(),
        center: kettle.position.clone().setY(kettle.position.y + 0.15),
        face: new THREE.Vector3(d.face[0], 0, d.face[1]),
        floor: fy,
        state: 'up',
        vel: new THREE.Vector3(),
        spin: 0,
        shake: 0,
        steamT: Math.random(),
        nextT: 2 + i * 2.7 + Math.random() * 2,
      };
    });
  }

  // Una pava enlozada (verde agua, para que se vea contra la pared).
  smallKettle() {
    const al = (this.enamel ||= new THREE.MeshStandardMaterial({ color: 0x5f9e96, roughness: 0.35, metalness: 0.1 }));
    const k = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.62, 0], [0.7, 0.15], [0.68, 0.55], [0.45, 0.85], [0.18, 0.95], [0.2, 1.02]].map(([r, y]) => new THREE.Vector2(r * 0.2, y * 0.2)), 18), al);
    body.castShadow = true;
    k.add(body);
    k.add(mesh(cylGeo(0.012, 0.032, 0.16, 8), al, 0, 0.09, 0.124, 1.0, 0, 0));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 6, 12, Math.PI), this.M.iron);
    handle.position.y = 0.2;
    handle.rotation.y = Math.PI / 2;
    k.add(handle);
    k.scale.setScalar(1.5);
    return k;
  }

  spout(p) {
    return p.kettle.localToWorld(tmpV2.set(0, 0.14, 0.2));
  }

  updatePavitas(dt) {
    const g = this.g;
    for (const p of this.pavitas) {
      if (p.state === 'up') {
        if (!this.playing) continue;
        // un hilito de vapor siempre, y cada tanto un silbido que se oye de lejos
        p.steamT -= dt;
        if (p.steamT <= 0) {
          p.steamT = 0.35;
          g.fx.steam(this.spout(p), 1, 0.04);
        }
        p.nextT -= dt;
        if (p.nextT <= 0) {
          p.nextT = 7 + Math.random() * 4;
          if (p.center.distanceTo(g.player.pos) < 45) {
            g.audio?.kettle(p.center, 1.5);
            g.fx.steam(this.spout(p), 6, 0.08);
            p.shake = 1.5;
          }
        }
        if (p.shake > 0) {
          p.shake -= dt;
          p.kettle.position.x = p.base.x + (p.shake > 0 ? Math.sin(g.time * 55) * 0.006 : 0);
        }
      } else if (p.state === 'fall') {
        p.vel.y -= 9.8 * dt;
        p.kettle.position.addScaledVector(p.vel, dt);
        p.kettle.rotation.x += p.spin * dt;
        if (p.kettle.position.y <= p.floor + 0.02) {
          p.kettle.position.y = p.floor + 0.02;
          if (p.vel.y < -2.5) {
            p.vel.set(p.vel.x * 0.5, -p.vel.y * 0.35, p.vel.z * 0.5);
            this.clang(p.kettle.position, 0.6);
          } else {
            p.state = 'down';
            this.layDown(p);
          }
        }
      }
    }
  }

  layDown(p) {
    p.kettle.position.y = p.floor + 0.2;
    p.kettle.rotation.set(0, p.kettle.rotation.y, Math.PI / 2);
  }

  onShot(origin, dir, maxT) {
    if (this.termas && !this.done) this.termas.onShot(origin, dir, maxT);
    if (this.kind !== 'pavitas' || this.done) return;
    for (const p of this.pavitas) {
      if (p.state !== 'up') continue;
      const t = tmpV.subVectors(p.center, origin).dot(dir);
      if (t < 0 || t > maxT + 0.3) continue;
      if (tmpV2.copy(origin).addScaledVector(dir, t).distanceTo(p.center) < 0.28) this.hitPavita(p, dir);
    }
  }

  onExplosion(pos, radius) {
    if (this.termas && !this.done) this.termas.onExplosion(pos, radius);
    if (this.kind !== 'pavitas' || this.done) return;
    for (const p of this.pavitas) {
      if (p.state === 'up' && pos.distanceTo(p.center) < radius * 0.7) this.hitPavita(p, tmpV.subVectors(p.center, pos).normalize());
    }
  }

  // De invitado decide el anfitrión: se le avisa y él la tira para todos.
  hitPavita(p, dir) {
    const g = this.g;
    if (g.net?.guest) {
      if (p.sent) return;
      p.sent = true;
      g.later(1.5, () => {
        p.sent = false;
      });
      g.net.net.send({ t: 'papq', pv: p.i, dx: +dir.x.toFixed(2), dz: +dir.z.toFixed(2) });
      return;
    }
    this.knockPavita(p.i, dir.x, dir.z);
  }

  knockPavita(i, dx, dz) {
    if (this.pavitas[i].state !== 'up') return;
    this.g.net?.event('papq', { pv: i, dx: +dx.toFixed(2), dz: +dz.toFixed(2) });
    this.dropPavita(i, dx, dz);
    if (this.pavitas.every((p) => p.state !== 'up')) this.g.later(1.2, () => this.finish());
  }

  dropPavita(i, dx, dz, quiet = false) {
    const p = this.pavitas[i];
    if (!p || p.state !== 'up') return;
    const g = this.g;
    p.kettle.position.copy(p.base);
    if (quiet) {
      p.state = 'down';
      p.kettle.position.addScaledVector(p.face, 0.8);
      this.layDown(p);
      return;
    }
    p.state = 'fall';
    p.vel.set(dx * 1.6 + p.face.x * 1.2, 2.2, dz * 1.6 + p.face.z * 1.2);
    p.spin = 7 + Math.random() * 5;
    this.clang(p.center, 1);
    g.fx.steam(p.center, 10, 0.2);
    g.fx.sparks(p.center, 1, { x: 0, y: 1, z: 0 });
    const n = this.pavitas.filter((q) => q.state !== 'up').length;
    g.hud.subtitle(n < 3 ? `Pavita ${n}/3: el Pack-a-Pava junta presión.` : 'Tercera pavita: ¡el Pack-a-Pava ya silba!', 3);
  }

  clang(pos, k) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos, gain: 0.7 * k, reverb: 0.35 });
    a.tone(o, { dur: 0.55, type: 'triangle', freq: 1250, freqEnd: 1170, gain: 0.25 });
    a.tone(o, { dur: 0.35, type: 'sine', freq: 2630, gain: 0.1 });
    a.noise(o, { dur: 0.08, type: 'bandpass', freq: 3000, q: 1.5, gain: 0.5 });
  }

  // ---------------- la tapera: la Colorada ----------------
  buildHen() {
    const g = this.g;
    const red = new THREE.MeshStandardMaterial({ color: 0x9a3a1c, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3e160a, roughness: 0.9 });
    const comb = new THREE.MeshStandardMaterial({ color: 0xd01818, roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.6 });
    const obj = new THREE.Group();
    const body = new THREE.Group();
    obj.add(body);
    const ball = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      return m;
    };
    body.add(ball(0.16, red, 0, 0.3, 0, 0.85, 0.8, 1.15));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), dark);
    tail.position.set(0, 0.42, -0.17);
    tail.rotation.x = -0.6;
    body.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 0.42, 0.13);
    body.add(head);
    head.add(ball(0.075, red, 0, 0.04, 0.02));
    for (let k = 0; k < 3; k++) head.add(mesh(boxGeo(0.018, 0.045, 0.03), comb, 0, 0.12 - Math.abs(k - 1) * 0.012, -0.01 + k * 0.028));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), yellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.03, 0.11);
    head.add(beak);
    head.add(ball(0.022, comb, 0, -0.02, 0.08));
    for (const s of [-1, 1]) head.add(ball(0.011, this.M.black, s * 0.05, 0.06, 0.06));
    // la tapa de la pava, en el pico
    const lid = new THREE.Group();
    lid.position.set(0, 0.03, 0.2);
    lid.rotation.x = Math.PI / 2;
    lid.add(mesh(cylGeo(0.1, 0.1, 0.014, 18), this.mats.aluminium));
    lid.add(mesh(cylGeo(0.018, 0.024, 0.03, 8), this.M.black, 0, 0.02, 0));
    head.add(lid);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Group();
      w.position.set(s * 0.12, 0.34, 0);
      w.add(ball(0.1, dark, s * 0.02, -0.03, -0.02, 0.3, 0.7, 1.2));
      body.add(w);
      return w;
    });
    const legs = [-1, 1].map((s) => {
      const l = new THREE.Group();
      l.position.set(s * 0.05, 0.17, 0);
      l.add(mesh(cylGeo(0.012, 0.012, 0.16, 5), yellow, 0, -0.08, 0));
      l.add(mesh(boxGeo(0.05, 0.01, 0.07), yellow, 0, -0.16, 0.02));
      obj.add(l);
      return l;
    });
    obj.scale.setScalar(1.25);
    this.root.add(obj);
    // una zona al azar de la planta baja (ni la del arranque, ni el prado del final)
    const zones = Object.keys(ZONES).filter((k) => k !== START_ZONE && ZONES[k].rects && !ZONES[k].circle && !ZONES[k].with && !ZONES[k].y && !ZONES[k].wild);
    this.henZone = zones[Math.floor(Math.random() * zones.length)] || START_ZONE;
    const spot = this.henSpot(this.henZone);
    const y = g.world.floorAt(spot[0], spot[1]);
    this.lid = false;
    this.hen = {
      obj,
      body,
      head,
      lid,
      wings,
      legs,
      pos: new THREE.Vector3(spot[0], y, spot[1]),
      dir: new THREE.Vector3(1, 0, 0),
      yaw: 0,
      state: 'peck',
      t: 0,
      runT: 0,
      restT: 0,
      pickT: 0,
      wanderT: 0,
      target: null,
      cluckT: 2,
      netT: 0,
      sentKey: '',
      net: null,
      phase: 0,
      peckT: 0,
    };
    this.henIt = g.interact.add({
      kind: 'papq',
      pos: new THREE.Vector3(spot[0], y + 0.4, spot[1]),
      radius: 1.8,
      wide: true,
      prompt: () => (!this.done && !this.lid && this.hen.obj.visible ? { text: 'agarrar a la Colorada', noCost: true } : null),
      cost: () => 0,
      use: () => this.catchHen(),
    });
  }

  // Un lugar libre de la zona (el rectángulo más grande pesa más).
  henSpot(zone) {
    const rects = ZONES[zone].rects;
    const area = (r) => (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
    const total = rects.reduce((a, r) => a + area(r), 0);
    for (let k = 0; k < 200; k++) {
      let t = Math.random() * total;
      const r = rects.find((q) => (t -= area(q)) < 0) || rects[0];
      const x = r[0] + 0.5 + Math.random() * (r[2] - r[0]);
      const z = r[1] + 0.5 + Math.random() * (r[3] - r[1]);
      if (this.henOk(x, z, zone) && this.henOk(x + 1, z, zone) && this.henOk(x - 1, z, zone) && this.henOk(x, z + 1, zone) && this.henOk(x, z - 1, zone)) return [x, z];
    }
    const r = rects[0];
    return [(r[0] + r[2] + 1) / 2, (r[1] + r[3] + 1) / 2];
  }

  henOk(x, z, zone = this.henZone) {
    const w = this.g.world;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz) || w.navBlock?.[w.idx(cx, cz)]) return false;
    return w.zoneAt(x, z) === zone;
  }

  // Para dónde dispara: lejos del que la corre, sin frenar contra el alambrado
  // (prefiere seguir derecho y lo abierto; un poco de zigzag para que sea gracioso).
  fleeDir(threat) {
    const h = this.hen;
    const tx = h.pos.x - threat.x;
    const tz = h.pos.z - threat.z;
    const td = Math.hypot(tx, tz) || 1;
    let best = null;
    let bs = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      if (!this.henOk(h.pos.x + dx * 0.8, h.pos.z + dz * 0.8) || !this.henOk(h.pos.x + dx * 1.8, h.pos.z + dz * 1.8)) continue;
      const open = this.henOk(h.pos.x + dx * 3.2, h.pos.z + dz * 3.2) ? 0.4 : 0;
      const s = ((dx * tx + dz * tz) / td) * 1.0 + (dx * h.dir.x + dz * h.dir.z) * 0.5 + open + Math.random() * 0.35;
      if (s > bs) {
        bs = s;
        best = [dx, dz];
      }
    }
    return best;
  }

  // Un paso en la dirección que lleva; si se topa con algo, se desliza o se queda.
  henStep(speed, dt) {
    const h = this.hen;
    const nx = h.pos.x + h.dir.x * speed * dt;
    const nz = h.pos.z + h.dir.z * speed * dt;
    const ax = h.dir.x * 0.3;
    const az = h.dir.z * 0.3;
    if (this.henOk(nx + ax, nz + az)) h.pos.set(nx, h.pos.y, nz);
    else if (this.henOk(nx + ax, h.pos.z)) h.pos.x = nx;
    else if (this.henOk(h.pos.x, nz + az)) h.pos.z = nz;
    else return false;
    return true;
  }

  updateHen(dt) {
    const g = this.g;
    const h = this.hen;
    // el lugar se elige de nuevo con el mapa terminado (al armarla todavía no
    // estaban marcadas las celdas con utilería)
    if (!h.placed) {
      h.placed = true;
      const s = this.henSpot(this.henZone);
      h.pos.set(s[0], h.pos.y, s[1]);
    }
    const px = h.pos.x;
    const pz = h.pos.z;
    if (g.net?.guest) {
      // la maneja el anfitrión: acá se la sigue suave
      if (h.net) {
        const k = Math.min(1, dt * 12);
        h.pos.x += (h.net[0] - h.pos.x) * k;
        h.pos.z += (h.net[1] - h.pos.z) * k;
        h.yaw = h.net[2];
        h.state = HEN_STATES[h.net[3]] || 'peck';
      }
    } else if (this.playing) this.henBrain(dt);
    h.pos.y = g.world.floorAt(h.pos.x, h.pos.z);
    // animación: patas, alas, picoteo y el cuerpo que se hamaca
    const speed = Math.hypot(h.pos.x - px, h.pos.z - pz) / Math.max(dt, 1e-4);
    h.phase += dt * (4 + speed * 5);
    const step = Math.min(1, speed / 2);
    h.legs[0].rotation.x = Math.sin(h.phase) * 0.9 * step;
    h.legs[1].rotation.x = -Math.sin(h.phase) * 0.9 * step;
    const flap = h.state === 'run' || h.state === 'tired';
    for (const [k, w] of h.wings.entries()) w.rotation.z = (k ? -1 : 1) * (flap ? 0.4 + Math.sin(g.time * (h.state === 'run' ? 34 : 20)) * 0.6 : 0.05);
    h.body.position.y = Math.abs(Math.sin(h.phase)) * 0.03 * step;
    h.body.rotation.x = h.state === 'run' ? 0.25 : h.state === 'tired' ? -0.1 + Math.sin(g.time * 12) * 0.05 : 0;
    h.peckT -= dt;
    if (speed < 0.2 && (h.state === 'peck' || h.state === 'calm') && h.peckT < -1.2 - Math.random() * 2) h.peckT = 0.35;
    h.head.rotation.x = h.peckT > 0 ? 1.0 : 0;
    let dy = h.yaw - h.obj.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    h.obj.rotation.y += dy * Math.min(1, dt * 14);
    h.obj.position.copy(h.pos);
    h.obj.visible = !g.net?.guest || !!h.net;
    this.henIt.pos.set(h.pos.x, h.pos.y + 0.4, h.pos.z);
    // cacareo (de cerca)
    if (this.playing) {
      h.cluckT -= dt;
      if (h.cluckT <= 0) {
        h.cluckT = h.state === 'run' ? 0.7 + Math.random() * 0.5 : 2.5 + Math.random() * 3;
        if (h.obj.visible && h.pos.distanceTo(g.player.pos) < 30) this.cluck(h.pos, h.state === 'run');
      }
    }
  }

  henBrain(dt) {
    const g = this.g;
    const h = this.hen;
    // el que la corre: el jugador en pie más cercano
    let near = null;
    let nd = Infinity;
    const see = (p) => {
      const d = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
      if (d < nd && Math.abs(p.y - h.pos.y) < 2.5) {
        nd = d;
        near = p;
      }
    };
    if (g.player.alive && !g.player.downed) see(g.player.pos);
    for (const r of g.net?.remote.values() || []) if (!r.dead && !r.downed) see(r.pos);
    const was = h.state;
    if (h.state === 'peck' || h.state === 'calm') {
      h.wanderT -= dt;
      if (!h.target || h.wanderT <= 0) {
        h.wanderT = 2 + Math.random() * 2.5;
        h.target = null;
        for (let k = 0; k < 6 && !h.target; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 1 + Math.random() * 2.5;
          const x = h.pos.x + Math.cos(a) * r;
          const z = h.pos.z + Math.sin(a) * r;
          if (this.henOk(x, z)) h.target = [x, z];
        }
      }
      if (h.target) {
        const dx = h.target[0] - h.pos.x;
        const dz = h.target[1] - h.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.25) {
          h.dir.set(dx / d, 0, dz / d);
          h.yaw = Math.atan2(h.dir.x, h.dir.z);
          if (!this.henStep(HEN.walk, dt)) h.target = null;
        } else h.target = null;
      }
      if (h.state === 'peck' && near && nd < HEN.scare) {
        h.state = 'run';
        h.runT = 0;
        h.pickT = 0;
      }
    } else if (h.state === 'run') {
      h.runT += dt;
      h.pickT -= dt;
      if (h.pickT <= 0 && near) {
        h.pickT = 0.2;
        const d = this.fleeDir(near);
        if (d) h.dir.set(d[0], 0, d[1]);
        else h.runT = HEN.runFor;
      }
      h.yaw = Math.atan2(h.dir.x, h.dir.z);
      const moved = this.henStep(HEN.run, dt);
      // se cansa enseguida (o queda arrinconada): ahí se la agarra
      if (h.runT >= HEN.runFor || !moved) {
        h.state = 'tired';
        h.restT = HEN.rest;
      } else if (!near || nd > HEN.calm) h.state = 'peck';
    } else if (h.state === 'tired') {
      h.restT -= dt;
      if (h.restT <= 0) {
        h.state = near && nd < HEN.scare ? 'run' : 'peck';
        h.runT = 0;
        h.pickT = 0;
      }
    }
    if (h.state === 'run' && was !== 'run') this.squawk(h.pos);
    // los demás la ven donde está (unas diez veces por segundo)
    if (g.net?.host && g.net.remote.size) {
      h.netT -= dt;
      if (h.netT <= 0) {
        h.netT = 0.1;
        const pk = this.henPacket();
        const key = pk.join(',');
        if (key !== h.sentKey) {
          h.sentKey = key;
          g.net.event('papq', { h: pk });
        }
      }
    }
  }

  henPacket() {
    const h = this.hen;
    return [+h.pos.x.toFixed(2), +h.pos.z.toFixed(2), +h.yaw.toFixed(2), HEN_STATES.indexOf(h.state)];
  }

  henNet(a) {
    const h = this.hen;
    if (!h.net) h.pos.set(a[0], h.pos.y, a[1]);
    h.net = a;
  }

  catchHen() {
    if (this.lid || this.done || this.g.net?.guest) return false;
    this.g.net?.event('papq', { lid: 1 });
    this.gotLid();
    return true;
  }

  gotLid(quiet = false) {
    if (this.lid) return;
    this.lid = true;
    const g = this.g;
    const h = this.hen;
    h.lid.visible = false;
    // ya no tiene nada que esconder: se queda picoteando tranquila
    h.state = 'calm';
    if (quiet) return;
    const at = tmpV.copy(h.pos).setY(h.pos.y + 0.4);
    this.squawk(at);
    for (let i = 0; i < 18; i++) {
      g.fx.alpha.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 2.5, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5, {
        color: Math.random() < 0.5 ? [0.55, 0.2, 0.08] : [0.3, 0.1, 0.04],
        size: 0.05,
        size1: 0.04,
        life: 1.2 + Math.random(),
        alpha: 0.9,
        gravity: 1.2,
        drag: 2.5,
      });
    }
    g.fx.sparkle(at, [0.9, 0.95, 1], 16, 0.4);
    g.hud.subtitle('¡Agarraste a la Colorada! Soltó la tapa. Llevásela al Pack-a-Pava.', 4);
  }

  cluck(pos, scared) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos, gain: 0.5, reverb: 0.2 });
    const n = scared ? 3 : 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = a.now + i * (scared ? 0.1 : 0.17);
      const f = (scared ? 640 : 520) + Math.random() * 80;
      a.tone(o, { t, dur: 0.08, type: 'square', freq: f, freqEnd: f * 0.75, gain: 0.07 });
      a.noise(o, { t, dur: 0.06, type: 'bandpass', freq: 1300, q: 3, gain: 0.22 });
    }
  }

  squawk(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos, gain: 0.6, reverb: 0.25 });
    const t = a.now;
    a.tone(o, { t, dur: 0.18, type: 'sawtooth', freq: 820, freqEnd: 1350, gain: 0.1 });
    a.tone(o, { t: t + 0.16, dur: 0.3, type: 'sawtooth', freq: 1350, freqEnd: 700, gain: 0.1 });
    a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 1800, q: 2, gain: 0.3 });
  }

  // ---------------- el penal: las cadenas y las llaves del guardia ----------------
  buildKeys() {
    const g = this.g;
    const M = this.M;
    const D = 1.1;
    // cadenas cruzadas por delante, una vuelta alrededor de la pava y un candado
    const chains = new THREE.Group();
    const link = new THREE.TorusGeometry(0.05, 0.013, 6, 10);
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(-0.95 * s, 1.2, D / 2 + 0.05);
      const b = new THREE.Vector3(0.95 * s, 0.12, D / 2 + 0.05);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const m = new THREE.Mesh(link, M.iron);
        m.position.lerpVectors(a, b, i / n);
        m.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, ang, 'ZXY');
        chains.add(m);
      }
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const m = new THREE.Mesh(link, M.iron);
      m.position.set(Math.cos(a) * 0.72, 1.62, Math.sin(a) * 0.72);
      m.rotation.set(i % 2 ? Math.PI / 2 : 0, -a - Math.PI / 2, 0, 'YXZ');
      chains.add(m);
    }
    chains.add(mesh(boxGeo(0.26, 0.3, 0.12), M.brass, 0, 0.62, D / 2 + 0.1));
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), M.iron);
    shackle.position.set(0, 0.77, D / 2 + 0.1);
    chains.add(shackle);
    this.pap.group.add(chains);
    this.chains = chains;
    // el manojo de llaves (en el cinto del guardia o tirado en el piso)
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3, emissive: 0xffb030, emissiveIntensity: 0.9 });
    const ring = new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16), keyMat));
    for (let k = 0; k < 3; k++) {
      const key = new THREE.Group();
      key.rotation.z = (k - 1) * 0.5;
      key.add(mesh(boxGeo(0.012, 0.13, 0.006), keyMat, 0, -0.12, 0));
      key.add(mesh(boxGeo(0.03, 0.012, 0.006), keyMat, 0.012, -0.17, 0));
      key.add(mesh(cylGeo(0.022, 0.022, 0.008, 10), keyMat, 0, -0.06, 0, Math.PI / 2, 0, 0));
      ring.add(key);
    }
    ring.visible = false;
    this.root.add(ring);
    this.ring = ring;
    // un haz dorado que marca dónde quedaron tiradas
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.visible = false;
    this.root.add(beam);
    this.beam = beam;
    this.keys = 'none';
    this.keysAt = new THREE.Vector3();
    this.guard = null;
    this.guardId = 0;
    this.guardNet = -1;
    // el guardia no sale enseguida ni siempre: cada tanto, con suerte
    this.markT = 45;
    this.jingleT = 1;
    this.keysIt = g.interact.add({
      kind: 'papq',
      pos: new THREE.Vector3(),
      radius: 1.8,
      wide: true,
      prompt: () => (this.keys === 'floor' ? { text: 'agarrar el manojo de llaves', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.keys !== 'floor' || g.net?.guest) return false;
        g.net?.event('papq', { kt: 1 });
        this.takeKeys();
        return true;
      },
    });
  }

  // Marca a un zombie como el guardia (o a ninguno, con -1).
  setGuard(id, quiet = false) {
    const g = this.g;
    if (this.keys === 'floor' || this.keys === 'taken') return;
    this.guardNet = id;
    this.guard = id >= 0 ? g.net?.findZombie(id) || g.zombies.pool.find((z) => z.active && (z.id & 0xffff) === id) || null : null;
    this.keys = id >= 0 ? 'guard' : 'none';
    this.ring.visible = false;
    if (this.guard) this.dressGuard(this.guard);
    if (id >= 0 && !this.announced && !quiet) g.hud.subtitle('Se oye un manojo de llaves entre los muertos: un guardia del penal anda suelto.', 4);
    if (id >= 0) this.announced = true;
  }

  // El uniforme del guardia (gris azulado), para reconocerlo.
  dressGuard(z) {
    if (!z.colors) return;
    z.colors.shirt = 0x3b4a5e;
    z.colors.pants = 0x262d3a;
    this.g.zombies.paint(z);
  }

  pickGuard() {
    const g = this.g;
    const list = g.zombies.pool.filter((z) => z.active && !z.dead && !z.dog && !z.boss);
    if (!list.length) return;
    const z = list[Math.floor(Math.random() * list.length)];
    this.guardId = z.id;
    const id = z.id & 0xffff;
    g.net?.event('papq', { g: id });
    this.setGuard(id);
  }

  dropKeys(at, quiet = false) {
    if (this.keys === 'floor' || this.keys === 'taken') return;
    const g = this.g;
    this.keys = 'floor';
    this.guard = null;
    this.keysAt.copy(at);
    this.ring.visible = true;
    this.ring.position.set(at.x, at.y + 0.02, at.z);
    this.ring.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    this.beam.visible = true;
    this.beam.position.set(at.x, at.y + 3.5, at.z);
    this.keysIt.pos.set(at.x, at.y + 0.5, at.z);
    if (quiet) return;
    this.jingle(at);
    g.fx.sparkle(tmpV.copy(at).setY(at.y + 0.3), [1, 0.8, 0.3], 14, 0.4);
    g.hud.subtitle('El guardia soltó el manojo de llaves.', 3);
  }

  takeKeys(quiet = false) {
    if (this.keys === 'taken') return;
    this.keys = 'taken';
    this.guard = null;
    this.ring.visible = false;
    this.beam.visible = false;
    if (quiet) return;
    this.jingle(this.keysAt);
    this.g.hud.subtitle('Tienen las llaves del Pack-a-Pava: vayan a abrir los candados.', 3.5);
  }

  dropChains(quiet) {
    const chains = this.chains;
    if (!chains) return;
    if (quiet) {
      chains.removeFromParent();
      return;
    }
    const g = this.g;
    g.audio?.chain(this.pap.slotPos);
    g.later(0.35, () => g.audio?.chain(this.pap.slotPos));
    this.fall = chains.children.map((m) => ({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, 0.8 + Math.random() * 1.2) }));
    this.fallT = 0;
  }

  updateKeys(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    // las cadenas que se caen al abrir los candados
    if (this.fall) {
      this.fallT += dt;
      for (const f of this.fall) {
        f.v.y -= 9.8 * dt;
        f.m.position.addScaledVector(f.v, dt);
        if (f.m.position.y < 0.03) {
          f.m.position.y = 0.03;
          f.v.set(0, 0, 0);
        }
      }
      if (this.fallT > 4) {
        this.chains.removeFromParent();
        this.fall = null;
      }
    }
    if (this.done) return;
    if (this.keys === 'guard') {
      let z = this.guard;
      if (host) {
        if (!z || z.id !== this.guardId || !z.active) {
          // se fue sin morir (se saltó la ronda): otro va a tener las llaves
          g.net?.event('papq', { g: -1 });
          this.setGuard(-1);
          this.markT = 30;
          return;
        }
        if (z.dead) {
          const at = tmpV.set(z.pos.x, 0, z.pos.z);
          // cayó del otro lado de la ventana: las llaves quedan del lado de adentro
          const w = z.window >= 0 && !g.world.zoneAt(at.x, at.z, z.pos.y + 0.5) ? g.barriers.windows[z.window] : null;
          if (w) at.set(w.int.x - w.out.x * 0.8, 0, w.int.z - w.out.z * 0.8);
          at.y = g.world.floorAt(at.x, at.z, z.pos.y + 0.5);
          g.net?.event('papq', { k: at.toArray().map((v) => +v.toFixed(2)) });
          this.dropKeys(at);
          return;
        }
      } else if (!z || !z.active || (z.id & 0xffff) !== this.guardNet) {
        z = this.guard = g.net.findZombie(this.guardNet);
        if (z) this.dressGuard(z);
      }
      // colgado del cinto, bamboleándose
      this.ring.visible = !!z && !z.dead;
      if (z) {
        const yaw = z.yaw || 0;
        this.ring.position.set(z.pos.x + Math.cos(yaw) * 0.22, z.pos.y + 0.95 * (z.scale || 1), z.pos.z - Math.sin(yaw) * 0.22);
        this.ring.rotation.set(0, yaw + Math.PI / 2, Math.sin(g.time * 9) * 0.4);
        this.jingleT -= dt;
        if (this.jingleT <= 0) {
          this.jingleT = 1.1 + Math.random() * 0.7;
          if (z.pos.distanceTo(g.player.pos) < 25) this.jingle(z.pos);
        }
      }
    } else if (this.keys === 'none' && host && this.playing) {
      this.markT -= dt;
      if (this.markT <= 0) {
        // una tirada cada 25-45 s, con 40% de chance (en promedio, uno cada minuto y medio)
        this.markT = 25 + Math.random() * 20;
        if (Math.random() < 0.4) this.pickGuard();
      }
    } else if (this.keys === 'floor') {
      this.beam.material.opacity = 0.14 + Math.sin(g.time * 3) * 0.05;
      if (Math.random() < 0.08) g.fx.sparkle(tmpV.copy(this.keysAt).setY(this.keysAt.y + 0.15), [1, 0.8, 0.3], 1, 0.3);
    }
  }

  jingle(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos, gain: 0.5, reverb: 0.25 });
    for (let i = 0; i < 4; i++) a.noise(o, { t: a.now + i * 0.05 + Math.random() * 0.03, dur: 0.05, type: 'bandpass', freq: 5200 + Math.random() * 2500, q: 9, gain: 0.35 });
    a.tone(o, { dur: 0.25, type: 'sine', freq: 3900 + Math.random() * 400, gain: 0.03 });
  }

  // ---------------- la torre: la garrafa de la roldana ----------------
  buildHoist() {
    const g = this.g;
    const M = this.M;
    const fy = PAP.y ?? 0;
    this.fy = fy;
    this.prog = 0;
    this.shown = 0;
    this.lock = 0;
    this.lastCrank = -10;
    this.slipNetT = 0;
    // el pescante: un poste sobre el antepecho y el brazo hacia el remolino
    this.root.add(mesh(boxGeo(0.14, 1.7, 0.14), M.woodDark, 17.55, fy + 1.04 + 0.85, HOIST.z));
    this.root.add(mesh(boxGeo(1.65, 0.12, 0.12), M.woodDark, 16.8, fy + 2.62, HOIST.z));
    this.root.add(mesh(boxGeo(0.08, 0.9, 0.08), M.woodDark, 17.2, fy + 2.2, HOIST.z, 0, 0, -0.75));
    const pulley = mesh(cylGeo(0.16, 0.16, 0.06, 16), M.iron, HOIST.x, fy + 2.4, HOIST.z, Math.PI / 2, 0, 0);
    this.root.add(pulley);
    this.pulley = pulley;
    // la manivela: dos parantes, el tambor con la soga y la manija
    const crank = new THREE.Group();
    crank.position.set(CRANK.x, fy, CRANK.z);
    for (const s of [-1, 1]) crank.add(mesh(boxGeo(0.1, 1.0, 0.1), M.woodDark, 0, 0.5, s * 0.35));
    crank.add(mesh(boxGeo(0.4, 0.08, 0.9), M.woodDark, 0, 0.04, 0));
    const drum = new THREE.Group();
    drum.position.y = 0.92;
    drum.add(mesh(cylGeo(0.12, 0.12, 0.6, 14), M.wood, 0, 0, 0, Math.PI / 2, 0, 0));
    drum.add(mesh(cylGeo(0.13, 0.13, 0.4, 14), M.rope, 0, 0, 0, Math.PI / 2, 0, 0));
    const handle = new THREE.Group();
    handle.position.z = 0.42;
    handle.add(mesh(boxGeo(0.05, 0.32, 0.05), M.iron, 0, 0.14, 0));
    handle.add(mesh(cylGeo(0.03, 0.03, 0.16, 8), M.wood, 0, 0.28, 0.08, Math.PI / 2, 0, 0));
    drum.add(handle);
    crank.add(drum);
    this.root.add(crank);
    this.drum = drum;
    // la soga: del tambor a la roldana, y de la roldana a la garrafa
    const rope = (a, b) => {
      const m = mesh(cylGeo(0.015, 0.015, 1, 5), M.rope);
      this.stretch(m, a, b);
      this.root.add(m);
      return m;
    };
    rope(new THREE.Vector3(CRANK.x, fy + 1.05, CRANK.z), new THREE.Vector3(HOIST.x + 0.08, fy + 2.56, HOIST.z));
    this.rope = rope(new THREE.Vector3(HOIST.x, fy + 2.24, HOIST.z), new THREE.Vector3(HOIST.x, fy + 1, HOIST.z));
    // la garrafa (naranja, con su válvula)
    const garrafa = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: 0xd9531e, roughness: 0.45, metalness: 0.3 });
    garrafa.add(mesh(cylGeo(0.17, 0.17, 0.42, 16), paint, 0, 0.25, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint);
    dome.position.y = 0.46;
    garrafa.add(dome);
    garrafa.add(mesh(cylGeo(0.15, 0.15, 0.05, 16), M.iron, 0, 0.025, 0));
    garrafa.add(mesh(cylGeo(0.04, 0.05, 0.08, 8), M.brass, 0, 0.66, 0));
    garrafa.add(mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), M.iron, 0, 0.66, 0, Math.PI / 2, 0, 0));
    this.root.add(garrafa);
    this.garrafa = garrafa;
    this.crankIt = g.interact.add({
      kind: 'papq',
      hold: true,
      pos: new THREE.Vector3(CRANK.x, fy + 1.0, CRANK.z),
      radius: 1.9,
      wide: true,
      prompt: () => (this.done ? null : { text: `girar la manivela (la garrafa va por el ${Math.round(this.prog * 100)}%)`, hold: true, noCost: true }),
      cost: () => 0,
      use: () => this.crank(),
    });
    this.placeGarrafa(0);
  }

  // Estira un cilindro de alto 1 entre dos puntos.
  stretch(m, a, b) {
    m.position.addVectors(a, b).multiplyScalar(0.5);
    tmpV.subVectors(b, a);
    m.scale.set(1, tmpV.length(), 1);
    m.quaternion.setFromUnitVectors(tmpV2.set(0, 1, 0), tmpV.normalize());
  }

  placeGarrafa(p) {
    const t = this.g.time || 0;
    const sway = 1 - p;
    const y = this.fy - HOIST.depth + (HOIST.depth + 1.35) * p;
    this.garrafa.position.set(HOIST.x + Math.sin(t * 1.3) * 0.1 * sway, y, HOIST.z + Math.sin(t * 0.9) * 0.14 * sway);
    this.garrafa.rotation.y = t * 0.4 * sway;
    this.ropeTop ||= new THREE.Vector3(HOIST.x, this.fy + 2.24, HOIST.z);
    this.ropeEnd ||= new THREE.Vector3();
    this.stretch(this.rope, this.ropeTop, this.ropeEnd.set(this.garrafa.position.x, y + 0.7, this.garrafa.position.z));
  }

  crank() {
    const g = this.g;
    if (this.done || g.net?.guest) return false;
    this.prog = Math.min(1, this.prog + CRANK_STEP);
    this.lastCrank = g.time;
    // la traba: cada cuarto ya no vuelve para atrás
    const q = Math.floor(this.prog * 4 + 1e-6) / 4;
    if (q > this.lock) {
      this.lock = q;
      this.ratchet(true);
    }
    if (this.prog >= 1) this.finish();
    else g.net?.event('papq', { r: +this.prog.toFixed(3) });
    return true;
  }

  landGarrafa(quiet) {
    this.prog = 1;
    this.landT = quiet ? 1 : 0;
    this.landFrom = this.garrafa.position.clone();
    this.pap.group.updateMatrixWorld();
    this.landTo = this.pap.group.localToWorld(new THREE.Vector3(-1.3, 0, 0.1));
    this.landTo.y = this.fy;
    this.rope.visible = false;
    if (quiet) this.garrafa.position.copy(this.landTo);
  }

  updateHoist(dt) {
    const g = this.g;
    if (this.landT != null) {
      if (this.landT < 1) {
        this.landT = Math.min(1, this.landT + dt / 0.8);
        const k = this.landT;
        this.garrafa.position.lerpVectors(this.landFrom, this.landTo, k);
        this.garrafa.position.y += Math.sin(k * Math.PI) * 0.8;
        this.garrafa.rotation.y = 0;
        if (k >= 1) {
          this.clang(this.landTo, 0.8);
          g.fx.sparkle(tmpV.copy(this.landTo).setY(this.fy + 0.5), [1, 0.7, 0.3], 14, 0.4);
        }
      }
      return;
    }
    // si nadie gira, se va resbalando hasta la última traba
    if (!g.net?.guest && this.prog > this.lock && g.time - this.lastCrank > 1.6) {
      this.prog = Math.max(this.lock, this.prog - SLIP * dt);
      this.slipNetT -= dt;
      if (this.slipNetT <= 0) {
        this.slipNetT = 0.3;
        g.net?.event('papq', { r: +this.prog.toFixed(3) });
      }
    }
    const before = this.shown;
    this.shown += (this.prog - this.shown) * Math.min(1, dt * 6);
    // la manija gira con lo que sube (y para atrás cuando se resbala)
    this.drum.rotation.z = -this.shown * 60;
    if (this.playing && Math.floor(before * 28) !== Math.floor(this.shown * 28)) this.ratchet(false);
    this.placeGarrafa(this.shown);
  }

  ratchet(big) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: tmpV.set(CRANK.x, this.fy + 1, CRANK.z), gain: big ? 0.8 : 0.4, reverb: 0.2 });
    a.noise(o, { dur: 0.04, type: 'bandpass', freq: big ? 1400 : 2400, q: 4, gain: 0.5 });
    if (big) a.tone(o, { dur: 0.12, type: 'square', freq: 180, freqEnd: 120, gain: 0.08 });
  }
}
