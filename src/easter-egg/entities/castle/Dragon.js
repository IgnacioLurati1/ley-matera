import * as THREE from 'three';
import { EE } from '../../config/map';
import { isHost } from './common';
import DragonFire from '../../fx/DragonFire';

// Dónde está y qué hace el Mateendrache (el modelo es world/Mateendrache.js):
//  · 'cave': enroscado en la cueva (se dibuja solo si hay alguien cerca).
//  · 'exit': rompió las cadenas y se va volando por la chimenea de la cueva.
//  · 'roof': posado en el techo del gran salón, cuidando el patio: cada tanto
//    le escupe una llamarada a los muertos (y a los caballeros).
//  · 'cumbre': bajó a la cumbre de los caballeros para el juramento.
//  · 'gone': se fue con los jugadores (la Gran Guerra).
// Los vuelos entre un lugar y otro se ven igual en todas las compus: el
// anfitrión manda el modo y cada una hace el recorrido.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class Dragon {
  constructor(egg, model) {
    this.egg = egg;
    this.g = egg.g;
    this.D = model;
    this.mode = 'cave';
    this.flight = null;
    this.spitT = 6;
    this.jet = null;
    // la llamarada (la usa también la Gran Guerra)
    this.fire = new DragonFire(this.g, model);
    const w = this.g.world;
    const [cx, cz, cr] = EE.cueva.dragon;
    this.spots = {
      cave: { pos: new THREE.Vector3(cx, w.floorAt(cx, cz), cz), yaw: cr || 0 },
      roof: { pos: new THREE.Vector3(EE.techo[0], EE.techo[1], EE.techo[2]), yaw: EE.techo[3] || 0 },
      cumbre: { pos: new THREE.Vector3(EE.cumbre[0], w.floorAt(EE.cumbre[0], EE.cumbre[1]), EE.cumbre[1]), yaw: EE.cumbre[2] || 0 },
    };
    this.place('cave');
    this.D.setPose('sleep', 0.01);
  }

  place(spot) {
    const S = this.spots[spot];
    this.D.root.position.copy(S.pos);
    this.D.root.rotation.set(0, S.yaw, 0);
  }

  // Cambia de modo (en todas las compus): los vuelos se arman acá.
  setMode(mode) {
    if (mode === this.mode) return;
    const from = this.mode;
    this.mode = mode;
    const D = this.D;
    if (mode === 'exit') {
      // sube por la chimenea de la cueva y desaparece en la roca
      D.setPose('fly', 1.2);
      this.flight = { t: 0, dur: 5, from: D.root.position.clone(), to: D.root.position.clone().add(tmpV.set(0, 26, -4)), yaw0: D.root.rotation.y, yaw1: D.root.rotation.y, then: 'roofArrive' };
      this.rumble();
    } else if (mode === 'roof') {
      // (el que entra tarde: ya está posado; si todavía vuela, llega solo)
      if (from === 'exit' && this.flight) {
        this.mode = 'exit';
        return;
      }
      this.flight = null;
      this.place('roof');
      D.setPose('stand', 0.5);
    } else if (mode === 'cumbre') {
      const a = this.D.root.position.clone();
      const S = this.spots.cumbre;
      D.setPose('fly', 1);
      this.flight = { t: 0, dur: 5, from: a, to: S.pos.clone(), yaw0: D.root.rotation.y, yaw1: S.yaw, then: 'perch', arc: 10 };
    } else if (mode === 'gone') {
      D.root.visible = false;
    }
  }

  // El retumbe de la cueva cuando se suelta (en todas las compus).
  rumble() {
    const g = this.g;
    g.fx.addShake(0.8);
    const a = g.audio;
    if (a.ctx) {
      const o = a.out({ pos: this.D.root.position, reverb: 0.9, gain: 1.4, ref: 16 });
      a.noise(o, { dur: 4, type: 'lowpass', freq: 160, freqEnd: 60, gain: 1.2, brown: true, attack: 0.3 });
      // y ruge al soltarse
      this.fire?.roar(this.D.root.position);
    }
    this.egg.cueva?.whistle(1.2);
  }

  // ---------------- la llamarada ----------------
  // (anfitrión) le apunta a un muerto del patio cada tanto
  spitAt(target) {
    const g = this.g;
    const at = new THREE.Vector3(target.pos.x, (target.pos.y || 0) + 1, target.pos.z);
    this.jet = { t: 0, at };
    g.net?.event('ee', { dr: 'jet', at: [+at.x.toFixed(1), +at.y.toFixed(1), +at.z.toFixed(1)] });
    this.D.look(at);
    this.D.open(0.8);
  }

  updateJet(dt) {
    const J = this.jet;
    if (!J) return;
    const g = this.g;
    J.t += dt;
    const D = this.D;
    if (J.t > 0.5 && J.t < 2.2) {
      const m = D.mouthPos(tmpV);
      this.fire.breathe(m, tmpW.set(J.at.x, J.at.y - 1, J.at.z), dt);
      // quema a todo lo que está donde cae (lo cuenta el anfitrión)
      if (isHost(g) && (J.tick = (J.tick || 0) - dt) <= 0) {
        J.tick = 0.25;
        for (const { z } of g.zombies.inRadius(J.at, 3.2)) g.zombies.damage(z, z.boss ? 320 : z.maxHp * 0.6 + 1, { type: z.boss ? 'scald' : 'burn', point: tmpW.set(z.pos.x, (z.pos.y || 0) + 1, z.pos.z), noPoints: true });
      }
    }
    if (J.t > 2.6) {
      this.jet = null;
      D.look(null);
      D.open(0);
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const D = this.D;
    // en la Gran Guerra lo maneja la arena (world/GranGuerra.js)
    if (this.mode === 'war') return;
    const F = this.flight;
    if (F) {
      F.t += dt;
      const k = Math.min(1, F.t / F.dur);
      const e = k * k * (3 - 2 * k);
      D.root.position.lerpVectors(F.from, F.to, e);
      D.root.position.y += Math.sin(k * Math.PI) * (F.arc ?? 4);
      let dy = F.yaw1 - F.yaw0;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      D.root.rotation.y = F.yaw0 + dy * Math.min(1, e * 1.5);
      if (k > 0.8 && F.then === 'perch' && D.pose === 'fly') D.setPose('stand', 1.4);
      if (k >= 1) {
        this.flight = null;
        if (F.then === 'roofArrive') this.arriveRoof();
      }
    }
    // qué se ve: la cueva solo de cerca; el techo y la cumbre siempre
    const p = g.player.pos;
    const inCave = p.y < 26 && p.x > 70 && p.z < 60;
    D.root.visible = this.mode !== 'gone' && (this.mode !== 'cave' || inCave || !!this.forceShow);
    if (!D.root.visible) return;
    D.update(dt);
    this.updateJet(dt);
    this.fire.update(dt);
    // posado: mira al patio y cada tanto escupe (el anfitrión elige a quién)
    if (this.mode === 'roof' && !this.flight && isHost(g) && !this.jet) {
      this.spitT -= dt;
      if (this.spitT <= 0) {
        this.spitT = 7 + Math.random() * 5;
        const S = this.spots.roof.pos;
        let best = null;
        let bd = 30;
        for (const z of g.zombies.pool) {
          if (!z.active || z.dead) continue;
          const d = Math.hypot(z.pos.x - S.x, z.pos.z - (S.z + 12));
          if (d < bd && Math.abs((z.pos.y || 0) - 24) < 3) {
            bd = d;
            best = z;
          }
        }
        const boss = g.zombies.boss;
        if (boss && !boss.dead && Math.hypot(boss.pos.x - S.x, boss.pos.z - (S.z + 12)) < 26) best = boss;
        if (best) this.spitAt(best);
      }
    }
  }

  // Salió de la cueva: llega volando desde el cerro y se posa en el techo.
  arriveRoof() {
    const D = this.D;
    const S = this.spots.roof;
    const start = S.pos.clone().add(tmpV.set(-40, 22, -30));
    this.mode = 'roof';
    D.setPose('fly', 0.01);
    this.flight = { t: 0, dur: 6, from: start, to: S.pos.clone(), yaw0: Math.atan2(S.pos.x - start.x, S.pos.z - start.z), yaw1: S.yaw, then: 'perch' };
  }

  apply(m) {
    if (m.dr === 'jet') {
      this.jet = { t: 0, at: new THREE.Vector3(...m.at) };
      this.D.look(this.jet.at);
      this.D.open(0.8);
    }
  }
}
