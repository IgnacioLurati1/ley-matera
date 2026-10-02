import * as THREE from 'three';
import { EE } from '../../config/map';
import { buildChiqui, chiquiGiggle } from '../../world/Chiqui';
import { myId, isHost, announce, players } from './common';
import Juramento from './Juramento';
import { preloadBossSkin } from '../bossSkin';

// Los dos pasos del final antes de la Gran Guerra:
//  · La vanguardia: el Chiquitijuein (chiquito, en la muralla del patio)
//    manda a sus cuatro Caballeros Negros, uno detrás del otro: el de la
//    Sequía, el de la Helada, el del Granizo y el de la Langosta (las cuatro
//    plagas del campo). El dragón, posado en el techo, ayuda con su chorro.
//  · El juramento: el dragón baja a la cumbre, entre las tumbas de los
//    caballeros viejos. Cada uno se para al lado de la cabeza y jura
//    (mantener F). Cuando juraron todos, el dragón los lleva a la Gran Guerra.
//    La ceremonia (la luz, los caballeros de antes, el coro): Juramento.js.

const NAMES = ['de la Sequía', 'de la Helada', 'del Granizo', 'de la Langosta'];
const CHIQUI = [
  '¿Creían que se lo iban a llevar así nomás? Ese dragón es mío.',
  'Uno menos... tengo más.',
  'Ja. Ja. Ja.',
  'Esto no termina acá. Los espero en la Gran Guerra.',
];
export default class Vanguardia {
  constructor(egg) {
    this.egg = egg;
    this.g = egg.g;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    this.dead = 0;
    this.nextT = -1;
    this.sworn = new Set();
    // el Chiquitijuein en la muralla del patio (escondido hasta la vanguardia)
    this.chiquiRig = buildChiqui(this.g.textures);
    this.chiqui = this.chiquiRig.root;
    const [cx, cy, cz] = EE.chiqui;
    this.chiqui.position.set(cx, cy, cz);
    this.chiqui.rotation.y = Math.PI;
    this.chiqui.scale.setScalar(1.3);
    this.chiqui.visible = false;
    this.root.add(this.chiqui);
    this.register();
  }

  register() {
    const g = this.g;
    const [x, z] = EE.jura;
    this.oathIt = g.interact.add({
      kind: 'ee',
      holdTime: 2,
      pos: new THREE.Vector3(x, g.world.floorAt(x, z) + 1.2, z),
      radius: 3,
      wide: true,
      prompt: () => {
        if (this.egg.step !== 8 || this.egg.dragon.mode !== 'cumbre' || this.egg.dragon.flight) return null;
        if (this.sworn.has(myId(g))) return { text: `Ya juraste. Faltan ${this.missing()}`, noCost: true, info: true };
        return { text: 'jurar como Caballero de la Luz', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => this.swear(g.net?.useFrom ?? myId(g)),
    });
  }

  missing() {
    const n = players(this.g).filter((p) => !this.sworn.has(p.id)).length;
    return n === 1 ? '1' : String(n);
  }

  // ---------------- la vanguardia ----------------
  // (anfitrión)
  start() {
    const g = this.g;
    this.dead = 0;
    this.nextT = 5;
    this.showChiqui(true);
    g.net?.event('ee', { vg: 'chiqui', on: 1, line: 0 });
    announce(g, 'La vanguardia del Chiquitijuein. Cuatro Caballeros Negros vienen por el dragón.', 5, true);
    this.egg.say('fierro', LINES.vanguardia, 2);
  }

  showChiqui(on, line = -1) {
    const g = this.g;
    this.chiqui.visible = on;
    // la pelea con los Caballeros Negros: la canción de pelea que sirve para
    // todo (core/music.js), mientras el Chiquitijuein mira desde la muralla
    if (on && !g.music?.is('jefe-generico')) g.music?.play('jefe-generico', { loop: true, while: () => this.chiqui.visible && (g.state === 'playing' || g.state === 'paused') });
    if (on) {
      // (el cuerpo de verdad de los Caballeros Negros se baja antes de que salgan)
      preloadBossSkin(g.zombies, 'caballero');
      // (el cuerpo de verdad: les mueve el dedo, "no, no, no"; el último, se va frotando las manos)
      this.chiquiRig.act(line === 3 ? 'taunt' : 'wag', { until: 3.2 });
      g.fx.sparkle(this.chiqui.position.clone().setY(this.chiqui.position.y + 0.8), [1, 0.2, 0.1], 30, 0.8);
      chiquiGiggle(g.audio, { pos: this.chiqui.position, gain: 1.2, ref: 10 });
    }
    if (line >= 0 && CHIQUI[line]) g.hud.subtitle(`El Chiquitijuein: ${CHIQUI[line]}`, 4, 'boss');
  }

  // (anfitrión) un jefe cayó: si era un Caballero Negro, cuenta
  onKill(z) {
    const g = this.g;
    if (this.egg.step !== 7 || !z.boss || z.kind !== 'caballero') return;
    this.dead++;
    if (this.dead >= NAMES.length) {
      this.showChiqui(false, 3);
      g.net?.event('ee', { vg: 'chiqui', on: 0, line: 3 });
      this.egg.onVanguard?.();
      return;
    }
    const line = this.dead === 1 ? 1 : 2;
    this.showChiqui(true, line);
    g.net?.event('ee', { vg: 'chiqui', on: 1, line });
    announce(g, `Cayó el Caballero ${NAMES[this.dead - 1]}. Quedan ${NAMES.length - this.dead}.`, 3);
    this.nextT = 2;
    this.egg.netSync();
  }

  // (anfitrión) el que sigue, en el patio, donde está la reja de la barbacana
  spawnKnight() {
    const g = this.g;
    const [x, z] = EE.caballeros;
    const at = new THREE.Vector3(x, g.world.floorAt(x, z), z);
    // cada uno con su plaga (entities/bossMoves.js): 0 Sequía, 1 Helada, 2 Granizo, 3 Langosta
    const k = g.zombies.spawnBoss(Math.max(10, g.rounds.round), { kind: 'caballero', at, plague: this.dead });
    if (!k) return false;
    return true;
  }

  // ---------------- el juramento ----------------
  // (anfitrión)
  swear(id) {
    const g = this.g;
    if (!isHost(g) || this.egg.step !== 8 || this.sworn.has(id)) return false;
    this.sworn.add(id);
    const who = id === myId(g) ? 'Juraste' : `${g.net?.nameOf(id) || 'Alguien'} juró`;
    const left = players(g).filter((p) => !this.sworn.has(p.id)).length;
    announce(g, `${who} como Caballero de la Luz.${left ? ` Faltan ${left}.` : ''}`, 3, true);
    this.juramento().sworn(id);
    this.egg.netSync();
    if (!left) this.egg.onSworn?.();
    return true;
  }

  // ---------------- red ----------------
  state() {
    return { d: this.dead, s: [...this.sworn] };
  }

  apply(s) {
    if (s.vg === 'chiqui') {
      this.showChiqui(!!s.on, s.line ?? -1);
      return;
    }
    this.dead = s.d | 0;
    if (s.s) {
      // (los que juraron recién: la ceremonia en esta compu también)
      const prev = this.sworn;
      this.sworn = new Set(s.s);
      for (const id of this.sworn) if (!prev.has(id)) this.juramento().sworn(id);
    }
  }

  juramento() {
    if (!this.jura) this.jura = new Juramento(this);
    return this.jura;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    // la cumbre del juramento se arma cuando el dragón baja (paso 8)
    if (this.egg.step >= 8 && this.egg.dragon) this.juramento().update(dt);
    if (this.chiqui.visible) {
      // se balancea y mira al que tenga más cerca
      const p = g.player.pos;
      this.chiqui.rotation.y = Math.atan2(p.x - this.chiqui.position.x, p.z - this.chiqui.position.z);
      this.chiqui.position.y = EE.chiqui[1] + (this.chiquiRig.skin ? 0 : Math.abs(Math.sin(t * 3)) * 0.04);
      this.chiquiRig.update(dt, t);
    }
    if (!isHost(g) || this.egg.step !== 7 || this.nextT < 0) return;
    // el que sigue sale cuando ya no queda ningún jefe (ni el cuerpo del anterior)
    if (g.zombies.boss) return;
    this.nextT -= dt;
    if (this.nextT <= 0 && this.spawnKnight()) this.nextT = -1;
  }

  dispose() {
    this.jura?.dispose();
    this.root.removeFromParent();
  }
}

const LINES = {
  vanguardia: '¡La vanguardia del Chiquitijuein! Cuatro caballeros negros. El escudo los cubre de frente... por la espalda.',
};
