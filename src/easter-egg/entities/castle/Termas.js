import * as THREE from 'three';
import { PROPS } from '../../config/map';

// El baño de las termas del Inca: con las pozas deshieladas (el paso previo
// del Pack-a-Pava), quedarse un rato adentro del agua caliente da el "Calor
// del Inca": un minuto curándose rápido aunque te sigan pegando. Cada uno lo
// toma por su cuenta y después hay que esperar para volver a bañarse.

const BATH = 2.5;
const BUFF = 60;
const COOLDOWN = 150;
const REGEN = 20;
const tmpV = new THREE.Vector3();

export default class Termas {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.pools = PROPS.filter((p) => p.type === 'terma').map((p) => ({ x: p.pos[0], z: p.pos[1], r: p.r || 1.8, y: g.world.floorAt(p.pos[0], p.pos[1]) }));
    this.bathT = 0;
    this.buffT = 0;
    this.coolT = 0;
    this.puffT = 0;
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    if (this.coolT > 0) this.coolT -= dt;
    // el calor: se cura rápido aunque le peguen
    if (this.buffT > 0) {
      this.buffT -= dt;
      if (p.alive !== false && !p.downed && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + REGEN * dt);
        g.hud.hurt?.(1 - p.health / p.maxHealth);
      }
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.3;
        g.fx.alpha?.spawn(p.pos.x + (Math.random() - 0.5) * 0.6, p.pos.y + 0.3, p.pos.z + (Math.random() - 0.5) * 0.6, 0, 0.5, 0, { color: [1, 0.86, 0.7], size: 0.25, size1: 0.9, life: 1.2, alpha: 0.12, drag: 0.4 });
      }
    }
    if (!g.papq?.done || this.buffT > 0 || this.coolT > 0 || p.downed || p.alive === false) {
      this.bathT = 0;
      return;
    }
    const inside = this.pools.some((q) => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < q.r * 0.85 && Math.abs(p.pos.y - q.y) < 0.6);
    if (!inside) {
      this.bathT = 0;
      return;
    }
    this.bathT += dt;
    if (this.bathT < BATH) return;
    this.bathT = 0;
    this.buffT = BUFF;
    this.coolT = BUFF + COOLDOWN;
    g.hud.toast('Calor del Inca: te curás rápido durante un minuto');
    g.fx.steam?.(tmpV.set(p.pos.x, p.pos.y + 0.4, p.pos.z), 14, 0.6);
    const a = g.audio;
    if (a?.out) {
      const o = a.out({ gain: 0.5, reverb: 0.6 });
      const t = a.now;
      for (const [f, d] of [[392, 0], [494, 0.08], [587, 0.16]]) a.tone(o, { t: t + d, dur: 1.2, type: 'sine', freq: f, gain: 0.07, attack: 0.05 });
      a.noise(o, { t, dur: 0.9, type: 'highpass', freq: 3000, gain: 0.08, attack: 0.1 });
    }
  }
}
