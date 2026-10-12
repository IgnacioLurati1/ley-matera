import * as THREE from 'three';
import { EE } from '../../config/map';
import { zombieHealth } from '../../config/rules';
import { mesh, boxGeo } from '../../world/props';
import Encierro from '../Encierro';
import { isHost, announce } from '../castle/common';
import { MAT, mat, glint, pulse } from './common';

// "El Pacto", entre las almas y la luz: el velorio del Embalsado (pedido del
// usuario, 2026-10-10: otro paso y más encierros). Con las almas juntas la luz
// de la laguna todavía no cuaja: hay que velar a los ahogados en el Embalsado,
// la isla que flota. Todos arriba, F en las velas y la isla se cierra
// (encierro) WAKE segundos: salen muertos del barro y cada tanto un yacaré.
// Cuando aguantan, la luz queda lista en la laguna (Ofrenda.js).
// Lo decide el anfitrión; el estado viaja en state()/apply().

const WAKE = 75;
const YAC_EVERY = 14;
const COLOR = 0x9affc8;
const RGB = [0.6, 1, 0.8];
const tmp = new THREE.Vector3();

export default class Velorio {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // off (todavía no toca), wait (falta empezarlo), on (la isla cerrada), done
    this.phase = 'off';
    this.t = 0;
    this.yacT = YAC_EVERY;
    this.enc = new Encierro(g, { zone: 'F', color: COLOR, place: 'el Embalsado' });
    this.build();
    this.register();
    this.show();
  }

  get done() {
    return this.phase === 'done';
  }

  // Cuánto va (0 a 1).
  k() {
    return this.phase === 'done' ? 1 : this.phase === 'on' ? Math.min(1, this.t / WAKE) : 0;
  }

  // Lo que se ve: una cruz chica con cinta y siete velas en ronda, en el barro.
  build() {
    const g = this.g;
    const [x, z] = EE.velorio;
    const y = g.world.floorAt(x, z);
    this.at = new THREE.Vector3(x, y, z);
    const grp = new THREE.Group();
    grp.position.copy(this.at);
    grp.add(mesh(boxGeo(0.07, 1.1, 0.06), MAT.wood(), 0, 0.55, 0));
    grp.add(mesh(boxGeo(0.5, 0.07, 0.06), MAT.wood(), 0, 0.8, 0));
    grp.add(mesh(boxGeo(0.05, 0.4, 0.006), MAT.ribbon(), 0.12, 0.58, 0.04, 0, 0, 0.15));
    const wax = mat('velaCera', () => new THREE.MeshStandardMaterial({ color: 0xd8ccaa, roughness: 0.8 }));
    this.flames = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const h = 0.14 + (i % 3) * 0.05;
      const vx = Math.cos(a) * 0.75;
      const vz = Math.sin(a) * 0.75;
      grp.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, h, 7), wax, vx, h / 2, vz));
      const f = glint(g, 0xffd890, 0.45);
      f.position.set(vx, h + 0.08, vz);
      grp.add(f);
      this.flames.push(f);
    }
    // el brillo que lo marca mientras falta empezarlo, y lo que sube al velarlos
    this.mark = glint(g, COLOR, 1.6);
    this.mark.position.y = 1.5;
    // (alto y suave: de cerca tapaba toda la pantalla de verde)
    this.glow = glint(g, COLOR, 2);
    this.glow.position.y = 2.6;
    grp.add(this.mark, this.glow);
    this.root.add(grp);
  }

  register() {
    const g = this.g;
    this.it = g.interact.add({
      kind: 'ee',
      pos: this.at.clone().setY(this.at.y + 1),
      radius: 2.6,
      prompt: () => {
        if (this.phase === 'wait') {
          const miss = this.enc.missingText();
          return miss ? { text: miss, noCost: true, info: true } : { text: 'prender las velas del velorio', noCost: true };
        }
        if (this.phase === 'on') return { text: `El velorio: aguanten ${Math.max(0, Math.ceil(WAKE - this.t))} s`, noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.phase !== 'wait' || this.enc.missing().length) return false;
        this.phase = 'on';
        this.t = 0;
        this.yacT = YAC_EVERY;
        this.enc.start();
        announce(g, '', 5, true);
        this.show();
        this.changed();
        return true;
      },
    });
  }

  // (anfitrión) Se juntaron las almas: falta velarlas.
  start() {
    this.phase = 'wait';
    this.t = 0;
    this.show();
  }

  // (anfitrión; también el atajo de prueba) Aguantaron: la luz cuaja.
  finish(tell = true) {
    if (this.phase === 'done') return;
    const was = this.phase;
    this.phase = 'done';
    this.enc.stop();
    if (was === 'on') this.g.fx.explosion(this.at.clone().setY(this.at.y + 1.3), 1.6, RGB);
    this.show();
    if (tell) this.egg.onVelorio();
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    this.enc.update(dt);
    if (this.phase === 'wait') pulse(this.mark, t, 0.55, 0.3, 2.2);
    if (this.phase === 'on') {
      const k = this.k();
      for (const [i, f] of this.flames.entries()) pulse(f, t + i, 0.8, 0.15, 9 + i);
      this.glow.scale.setScalar(1.4 + k * 2);
      this.glow.material.opacity = 0.12 + k * 0.2 + Math.sin(t * 3) * 0.04;
      if (Math.random() < dt * (4 + k * 10)) g.fx.sparkle(tmp.set(this.at.x + (Math.random() - 0.5) * 2, this.at.y + 0.4 + Math.random() * 2, this.at.z + (Math.random() - 0.5) * 2), RGB, 1, 0.7);
      // (el invitado cuenta el tiempo solo entre aviso y aviso)
      if (!isHost(g)) this.t = Math.min(WAKE, this.t + dt);
    }
    if (!isHost(g) || this.phase !== 'on') return;
    this.t += dt;
    this.enc.spawns(dt, 1.3);
    this.yacT -= dt;
    if (this.yacT <= 0) {
      this.yacT = YAC_EVERY;
      const round = Math.max(3, g.rounds.round);
      g.zombies.spawnDog?.(Math.max(150, Math.floor(zombieHealth(round) * 0.6)), 'yacare');
    }
    if (this.t >= WAKE) this.finish();
  }

  show() {
    const lit = this.phase === 'on' || this.phase === 'done';
    for (const f of this.flames) f.visible = lit;
    this.mark.visible = this.phase === 'wait';
    this.glow.visible = this.phase === 'on';
  }

  line() {
    if (this.phase === 'on') return { main: 'El velorio', sub: 'El Embalsado está cerrado: aguanten', count: `${Math.max(0, Math.ceil(WAKE - this.t))} s` };
    return { main: 'El velorio de los ahogados', sub: 'Todos al Embalsado (la isla, por la pasarela de la laguna): prendan las velas' };
  }

  changed() {
    this.egg.netSync();
  }

  state() {
    return { p: this.phase, t: +this.t.toFixed(1) };
  }

  apply(m) {
    const was = this.phase;
    if (m.p) this.phase = m.p;
    if (m.t != null) this.t = m.t;
    if (was === this.phase) return;
    // la cortina de la isla, también en las compus de los invitados
    if (this.phase === 'on') this.enc.start();
    if (was === 'on') {
      this.enc.stop();
      if (this.phase === 'done') this.g.fx.explosion(this.at.clone().setY(this.at.y + 1.3), 1.6, RGB);
    }
    this.show();
  }

  dispose() {
    this.enc.dispose();
    this.root.removeFromParent();
  }
}
