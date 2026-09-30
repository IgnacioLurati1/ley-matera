import * as THREE from 'three';
import { TOWER } from '../config/map';
import { PLAYER } from '../config/rules';
import { sides, archSpans, depthIn, sidePoint, alongOf, inTower, sndGust } from './towerKit';

// Las ráfagas del remolino (la torre, modo historia; el Challenge tiene las
// suyas en entities/challengeEvents.js). Desde la ronda FROM, cada tanto el
// viento entra de golpe por las arcadas de un lado y cruza todos los pisos:
//  · se avisa (silbido que sube, polvo y yerba que empiezan a entrar por los
//    arcos de ese lado) y después sopla un par de segundos;
//  · al jugador lo arrastra hacia el otro lado (agachado casi no lo mueve);
//    si en el medio está el agujero, se puede caer;
//  · a los muertos también (el anfitrión): los que quedan en el agujero se
//    caen, y a algunos de los que estaban pegados a la baranda del otro lado
//    el remolino se los lleva por el arco (sin puntos).
// En línea: el anfitrión elige cuándo y de qué lado ('pee' gust); cada uno
// arrastra a su jugador.

const FROM = 8;
const WARN = 1.3;
const BLOW = 2.3;
const SPEED = 2.5;
const ZSPEED = 2.8;
// cada cuánto (s de ronda activa), y más seguido en la Noche del Remolino
const EVERY = [42, 78];

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const rnd = () => Math.random() - 0.5;

export default class TowerWind {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.gust = null;
    this.t = 22;
    this.told = false;
  }

  update(dt) {
    const g = this.g;
    const R = g.rounds;
    const host = !g.net?.guest;
    // (con la escalera divina abierta no: se suben todos por afuera)
    const calm = this.ee.fight || this.ee.scene || this.ee.step >= 8 || g.intro?.active || g.state !== 'playing';
    if (host && !this.gust && !calm && R.round >= FROM && R.state === 'active') {
      this.t -= dt * (this.ee.noche?.on ? 1.7 : 1);
      if (this.t <= 0) {
        this.t = EVERY[0] + Math.random() * (EVERY[1] - EVERY[0]);
        const s = Math.floor(Math.random() * 4);
        this.start(s);
        g.net?.event('pee', { gust: s + 1 });
      }
    }
    if (this.gust) this.blow(dt);
  }

  applyRemote(m) {
    if (m.gust) this.start(m.gust - 1);
  }

  start(s) {
    const g = this.g;
    this.gust = { s, t: 0, took: new Set() };
    sndGust(g, null, { warn: WARN, dur: BLOW, gain: this.inside() ? 1 : 0.4 });
    if (this.inside()) g.hud.subtitle(this.told ? '¡Ráfaga!' : '¡Ráfaga! Agachate', WARN + BLOW, 'boss');
    this.told = true;
  }

  // ¿El jugador está en la torre (no en el Infierno, no en una escena)?
  inside() {
    const p = this.g.player.pos;
    return inTower(p.x, p.z);
  }

  blow(dt) {
    const g = this.g;
    const G = this.gust;
    G.t += dt;
    const s = G.s;
    const S = sides()[s];
    const dir = tmpV.set(S.n[0], 0, S.n[1]);
    const bt = G.t - WARN;
    const k = bt > 0 ? Math.sin(Math.min(1, bt / BLOW) * Math.PI) : 0;
    const p = g.player;
    const me = p.alive && !p.downed && !p.ride && this.inside();
    // lo que entra por los arcos de ese lado, en el piso del jugador
    if (this.inside()) this.streaks(s, dir, bt > 0 ? 1 : Math.min(1, G.t / WARN) * 0.35, dt);
    if (me && k > 0) {
      const sp = SPEED * k * (p.crouching ? 0.15 : p.onGround ? 1 : 1.35) * dt;
      p.pos.x += dir.x * sp;
      p.pos.z += dir.z * sp;
      g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
      g.fx.addShake(dt * 0.6 * k);
    }
    // los muertos (anfitrión)
    if (!g.net?.guest && k > 0) {
      const back = (s + 2) % 4;
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || !['chase', 'attack'].includes(z.state) || !inTower(z.pos.x, z.pos.z)) continue;
        const sp = ZSPEED * k * (z.dog ? 0.6 : 1) * dt;
        z.pos.x += dir.x * sp;
        z.pos.z += dir.z * sp;
        // pegado a la baranda del otro lado, en un arco: a veces se lo lleva el remolino
        if (!z.dog && depthIn(back, z.pos.x, z.pos.z) < 1.35 && !G.took.has(z.id)) {
          G.took.add(z.id);
          const a = alongOf(back, z.pos.x, z.pos.z);
          const inArch = archSpans().some(([a0, a1]) => a > a0 + 0.3 && a < a1 - 0.3);
          if (inArch && Math.random() < 0.55) this.ee.flyers.suckOut(z, back, { noPoints: true });
        }
      }
    }
    if (bt > BLOW) this.gust = null;
  }

  // Rayas de viento, polvo, yerba y papeles que entran por los arcos del lado
  // s y cruzan el piso donde está el jugador.
  streaks(s, dir, k, dt) {
    const g = this.g;
    const T = this.T;
    const fy = T.yOf(T.levelOf(g.player.pos.y));
    const n = Math.random() < k * dt * 60 ? 1 : 0;
    for (const [a0, a1] of archSpans()) {
      for (let i = 0; i < n * 2; i++) {
        const a = a0 + 0.3 + Math.random() * (a1 - a0 - 0.6);
        const y = fy + 0.3 + Math.random() * 2.4;
        sidePoint(s, a, -1.5, y, tmpA);
        const sp = 9 + Math.random() * 7;
        if (Math.random() < 0.55) {
          g.fx.alpha.spawn(tmpA.x, tmpA.y, tmpA.z, dir.x * sp + rnd() * 2, rnd() * 1.5, dir.z * sp + rnd() * 2, { color: Math.random() < 0.5 ? [0.45, 0.42, 0.34] : [0.36, 0.46, 0.2], size: 0.04 + Math.random() * 0.05, size1: 0.1, life: 1.6, alpha: 0.55 });
        } else {
          // la raya: un trazo claro que cruza
          tmpA.addScaledVector(dir, 1.5 + Math.random() * 10);
          tmpB.copy(tmpA).addScaledVector(dir, 2.5 + Math.random() * 5);
          tmpB.y += rnd() * 0.3;
          g.fx.beam(tmpA, tmpB, { color: 0x4d5a6c, width: 0.012 + Math.random() * 0.014, life: 0.12 + Math.random() * 0.1 });
        }
      }
    }
    // alguna hoja de papel que vuela alto
    if (k > 0.8 && Math.random() < dt * 6) {
      const a = TOWER.x0 + Math.random() * (TOWER.x1 - TOWER.x0);
      sidePoint(s, a, -1, fy + 1 + Math.random() * 1.5, tmpA);
      g.fx.alpha.spawn(tmpA.x, tmpA.y, tmpA.z, dir.x * 8, 1.5, dir.z * 8, { color: [0.85, 0.82, 0.72], size: 0.12, size1: 0.1, life: 3, alpha: 0.9, gravity: 0.6 });
    }
  }
}
