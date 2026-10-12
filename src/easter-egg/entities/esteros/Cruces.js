import * as THREE from 'three';
import { EE } from '../../config/map';
import { zombieHealth, maxAlive } from '../../config/rules';
import { mesh, boxGeo } from '../../world/props';
import { isHost, announce, ring, players } from '../castle/common';
import { MAT, glint, pulse } from './common';

// "El Pacto", entre el Liquidificador y la creciente: las cuatro cruces (pedido
// del usuario, 2026-10-10: el easter egg "se quedó medio corto de duración" y
// le faltaba algo "para fomentar a que de a varios jugadores no lo haga todo
// uno"). Cuatro cruces altas con cintas coloradas: en el Obraje, la Pesquería,
// la Reducción y la Laguna del Irupé. Cada una se prende con F y aguantando al
// pie (HOLD segundos adentro de su círculo; si no queda nadie, se enfría). Una
// vez prendida arde un rato y se apaga: tienen que arder las cuatro a la vez.
// De a cuatro, una cada uno; con menos gente arden más tiempo (LIT) y alcanza
// con ir de una a otra. Mientras se prende una, salen muertos a su alrededor.
// Lo decide el anfitrión; el estado viaja en state()/apply().

const HOLD = 30;
const RADIUS = 3.6;
// cuánto arde una cruz según cuántos juegan (4 o más: 60 s)
const LIT = { 1: 240, 2: 150, 3: 100 };
const litFor = (n) => LIT[n] || 60;
const PLACES = ['el Obraje', 'la Pesquería', 'la Reducción', 'la Laguna del Irupé'];
const FIRE = [1, 0.42, 0.2];

// La cruz: un palo alto, el travesaño y las cintas que cuelgan.
function crossModel(seed) {
  const g = new THREE.Group();
  const r = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  g.add(mesh(boxGeo(0.11, 2.1, 0.09), MAT.wood(), 0, 1.05, 0, 0, 0, (r(1) - 0.5) * 0.08));
  g.add(mesh(boxGeo(0.95, 0.1, 0.08), MAT.wood(), 0, 1.6, 0));
  for (let k = 0; k < 6; k++) {
    const len = 0.35 + r(k + 2) * 0.5;
    g.add(mesh(boxGeo(0.06, len, 0.006), MAT.ribbon(), -0.4 + k * 0.16, 1.55 - len / 2, 0.05, 0, 0, (r(k + 9) - 0.5) * 0.3));
  }
  return g;
}

export default class Cruces {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // off (todavía no toca), on (hay que prenderlas), done
    this.phase = 'off';
    this.syncT = 0;
    this.list = EE.cruces.map(([x, z], i) => {
      const y = g.world.floorAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = i * 1.3 + 0.4;
      grp.add(crossModel(i + 1));
      // el círculo donde hay que quedarse, y adentro el que crece mientras se prende
      const circle = ring(RADIUS, 0xff5a3a, 0.14);
      circle.position.y = 0.06;
      const fill = ring(RADIUS, 0xffb070, 0.26);
      fill.position.y = 0.05;
      // la llama (o, apagada, el brillo que la marca de lejos)
      const flame = glint(g, 0xff7a3a, 1.2);
      flame.position.y = 1.75;
      const halo = glint(g, 0xff4a2a, 3.2);
      halo.position.y = 1.9;
      grp.add(circle, fill, flame, halo);
      this.root.add(grp);
      return { i, x, z, y, grp, circle, fill, flame, halo, k: 0, lit: 0, on: false, spT: 0 };
    });
    this.register();
    this.show();
  }

  get done() {
    return this.phase === 'done';
  }

  litCount() {
    return this.list.filter((c) => c.lit > 0).length;
  }

  register() {
    const g = this.g;
    for (const c of this.list) {
      c.it = g.interact.add({
        kind: 'ee',
        pos: new THREE.Vector3(c.x, c.y + 1.1, c.z),
        radius: 2.4,
        prompt: () => {
          if (this.phase !== 'on') return null;
          if (c.lit > 0) return { text: `La cruz arde: ${Math.ceil(c.lit)} s`, noCost: true, info: true };
          if (c.on) return { text: `Quedate al pie: ${Math.max(0, Math.ceil(HOLD - c.k))} s`, noCost: true, info: true };
          return { text: 'prender la cruz', noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (this.phase !== 'on' || c.lit > 0 || c.on) return false;
          c.on = true;
          c.k = 0.01;
          c.spT = 2;
          g.fx.sparkle(new THREE.Vector3(c.x, c.y + 1.6, c.z), FIRE, 20, 1);
          this.changed();
          return true;
        },
      });
    }
  }

  // (anfitrión) El Liquidificador ya está: toca prender las cruces.
  start() {
    this.phase = 'on';
    for (const c of this.list) Object.assign(c, { k: 0, lit: 0, on: false });
    this.show();
  }

  // (anfitrión; también el atajo de prueba) Las cuatro arden: sigue el pacto.
  finish(tell = true) {
    if (this.phase === 'done') return;
    this.phase = 'done';
    for (const c of this.list) {
      c.on = false;
      c.k = 0;
      this.g.fx.explosion(new THREE.Vector3(c.x, c.y + 1.7, c.z), 1.3, FIRE);
    }
    this.show();
    if (tell) this.egg.onCruces();
  }

  // ¿Hay alguien de pie adentro del círculo de esta cruz?
  held(c) {
    const g = this.g;
    for (const p of players(g)) {
      if (p.me ? g.player.downed : p.downed) continue;
      if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < RADIUS) return true;
    }
    return false;
  }

  // (anfitrión) Un muerto que sale cerca de la cruz que se está prendiendo.
  spawn(c) {
    const g = this.g;
    const w = g.world;
    const n = this.egg.players();
    if (g.zombies.alive >= maxAlive(n)) return;
    const who = players(g);
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 4;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      if (!w.inside(cx, cz) || w.navBlock[w.idx(cx, cz)] || !Number.isFinite(g.nav.distAt(x, z))) continue;
      const zone = w.zoneAt(x, z);
      if (!zone || !g.activeZones.has(zone)) continue;
      if (!who.every((p) => Math.hypot(p.pos.x - x, p.pos.z - z) > 3.2)) continue;
      const round = Math.max(3, g.rounds.round);
      g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, w.floorAt(x, z), z));
      return;
    }
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    if (this.phase === 'on') {
      for (const c of this.list) {
        // (lo que se ve: en todas las compus)
        const lit = c.lit > 0;
        const k = lit ? 1 : c.k / HOLD;
        c.fill.scale.setScalar(Math.max(0.02, k));
        c.fill.material.opacity = lit ? 0.14 + Math.sin(t * 3 + c.i) * 0.05 : 0.2 + k * 0.3;
        c.circle.material.opacity = c.on || lit ? 0.75 : 0.3 + Math.sin(t * 2 + c.i) * 0.12;
        c.flame.scale.setScalar(lit ? 2.4 + Math.sin(t * 9 + c.i) * 0.3 : 0.9 + k * 1.2);
        pulse(c.flame, t + c.i, lit ? 0.85 : 0.5 + k * 0.3, lit ? 0.12 : 0.25, lit ? 11 : 2.2);
        // (por apagarse: titila)
        c.halo.material.opacity = lit ? (c.lit < 12 ? 0.18 + Math.sin(t * 14) * 0.14 : 0.3) : k * 0.2;
        if ((lit || c.on) && Math.random() < dt * (lit ? 8 : 3)) g.fx.sparkle(tmp.set(c.x, c.y + 1.7, c.z), FIRE, 1, 0.5);
        // (el invitado cuenta el tiempo solo entre aviso y aviso)
        if (lit && !isHost(g)) c.lit = Math.max(0.01, c.lit - dt);
      }
    }
    if (!isHost(g) || this.phase !== 'on') return;
    let send = false;
    for (const c of this.list) {
      if (c.lit > 0) {
        c.lit -= dt;
        if (c.lit <= 0) {
          Object.assign(c, { lit: 0, k: 0, on: false });
          announce(g, `Se apagó la cruz de ${PLACES[c.i]}`, 3.5);
          send = true;
        }
        continue;
      }
      if (!c.on) continue;
      if (this.held(c)) c.k += dt;
      else {
        c.k -= dt * 2;
        if (c.k <= 0) {
          Object.assign(c, { k: 0, on: false });
          send = true;
        }
      }
      c.spT -= dt;
      if (c.spT <= 0) {
        c.spT = 3.2 / Math.sqrt(this.egg.players());
        this.spawn(c);
      }
      if (c.k >= HOLD) {
        Object.assign(c, { k: 0, on: false, lit: litFor(this.egg.players()) });
        g.fx.explosion(tmp.set(c.x, c.y + 1.7, c.z).clone(), 1.5, FIRE);
        const n = this.litCount();
        if (n < 4) announce(g, `Cruces prendidas: ${n} de 4`, 3, true);
        send = true;
      }
    }
    if (this.litCount() === 4) return this.finish();
    // (mientras se prende alguna, el avance viaja una vez por segundo)
    this.syncT -= dt;
    if (send) this.changed();
    else if (this.syncT <= 0 && this.list.some((c) => c.on || c.lit > 0)) {
      this.syncT = 1;
      g.net?.event('ee', { czq: this.state() });
    }
  }

  // Qué se ve según el momento.
  show() {
    const on = this.phase === 'on';
    for (const c of this.list) {
      c.circle.visible = c.fill.visible = c.halo.visible = on;
      // (terminadas, quedan ardiendo bajito; antes de tiempo, apagadas)
      c.flame.visible = this.phase !== 'off';
      if (this.phase === 'done') {
        c.flame.scale.setScalar(1.3);
        c.flame.material.opacity = 0.7;
      }
    }
  }

  line() {
    return {
      main: 'Las cuatro cruces',
      sub: 'Prendan las cuatro a la vez (F y aguantar al pie): el Obraje, la Pesquería, la Reducción y la Laguna del Irupé',
      count: `${this.litCount()}/4`,
    };
  }

  changed() {
    this.syncT = 1;
    this.egg.netSync();
  }

  state() {
    return { p: this.phase, c: this.list.map((c) => [+c.k.toFixed(1), +c.lit.toFixed(1), c.on ? 1 : 0]) };
  }

  apply(m) {
    const was = this.phase;
    if (m.p) this.phase = m.p;
    if (m.c) m.c.forEach(([k, lit, on], i) => Object.assign(this.list[i], { k, lit, on: !!on }));
    if (was !== this.phase) {
      if (this.phase === 'done') for (const c of this.list) this.g.fx.explosion(new THREE.Vector3(c.x, c.y + 1.7, c.z), 1.3, FIRE);
      this.show();
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const tmp = new THREE.Vector3();
