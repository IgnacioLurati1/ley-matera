import * as THREE from 'three';
import { ZONES } from '../../config/map';
import { Pickup, glowMate, glowOrb, isHost, myId } from './common';
import { ART, buildLostMate } from './stepArt';
import { unlock as unlockLogro } from '../../core/logros';
import { PERKS } from '../../config/perks';

// Los siete mates perdidos (v5; el usuario: "tienen poco que hacer en ellos"):
// un mate escondido en cada isla, en un rincón de las secciones iguales a los
// mapas de origen (la cripta, la capilla, el pajar, los calabozos...). Sin
// faros ni brillos que guíen: solo el mate, con una luz chica. Con los siete,
// "la ronda completa": un perk de regalo para cada uno y el logro. Lo decide
// el anfitrión; viaja por 'pee' (k 'mates': { i } o { all: 1 }); `mt` en el
// estado entero (los que entran tarde).
const SPOTS = [
  { isla: 'centro', zone: 'cE4', pos: [126.5, 177.5], name: 'la cripta de la Reducción' },
  { isla: 'molino', zone: 'E', pos: [40.3, 111.2], name: 'la capilla de las velas' },
  { isla: 'tapera', zone: 'gH', pos: [105.5, 237.5], name: 'el pajar' },
  { isla: 'penal', zone: 'pK', pos: [120.5, 336.5], name: 'los calabozos' },
  { isla: 'monumento', zone: 'mD', pos: [307.5, 247.5], name: 'la cripta de Belgrano' },
  { isla: 'torre', zone: 'tP13', pos: [238.5, 113.5], name: 'la Capilla Torcida' },
  { isla: 'castillo', zone: 'kR', pos: [186.3, 49.3], name: 'la bodega' },
];
const TOTAL = SPOTS.length;

export default class Mates {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    const w = g.world;
    this.taken = 0; // máscara de bits
    this.done = false;
    this.list = SPOTS.map((S, i) => {
      const zy = ZONES[S.zone]?.y ?? 0;
      const y = w.floorAt(S.pos[0], S.pos[1], zy + 1.5);
      const pos = new THREE.Vector3(S.pos[0], y + 0.22, S.pos[1]);
      // (stepArt) cada uno, un mate de su mapa de origen (sin la mano), con un
      // halo violeta chico de la disformidad
      const obj = ART ? buildLostMate(g, i) : glowMate(0xb088ff);
      obj.rotation.y = i * 0.9;
      const pk = new Pickup(g, obj, pos, { radius: 1.5, text: 'agarrar el mate perdido', col: 0xa070ff });
      pk.onTake = () => this.request(i);
      pk.show(true);
      // (sin luz: siete luces más en escena todo el tiempo le cuestan a cada píxel
      // del mapa; el mate se ve por su brillo propio y un halo chico)
      pk.light.intensity = 0;
      if (!ART) {
        const halo = glowOrb(0x9a70ff, 0.16);
        halo.children[0].visible = false;
        halo.position.y = 0.2;
        obj.add(halo);
      }
      return { i, S, pk, pos };
    });
  }

  get host() {
    return isHost(this.g);
  }

  request(i) {
    const g = this.g;
    if (this.host) this.send({ i });
    else g.net?.net?.send({ t: 'pee', k: 'mates', i, from: myId(g) });
  }

  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'mates', ...m });
  }

  onGuest(m) {
    if (m.i != null && !(this.taken & (1 << m.i))) this.send({ i: m.i });
  }

  apply(m) {
    if (m.all) {
      for (let i = 0; i < TOTAL; i++) this.take(i, true);
      this.complete();
      return;
    }
    if (m.i == null || this.taken & (1 << m.i)) return;
    this.take(m.i, false);
    const n = this.count();
    this.g.hud?.toast?.(`Mate perdido ${n}/${TOTAL}`);
    if (n >= TOTAL) this.complete();
    else this.g.hud?.subtitle?.(TOTAL - n === 1 ? 'Falta uno.' : `Faltan ${TOTAL - n}: uno por isla.`, 2.5);
  }

  take(i, quiet) {
    const M = this.list[i];
    if (!M) return;
    this.taken |= 1 << i;
    M.pk.take();
    if (!quiet) {
      this.g.fx.sparkle?.(M.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), [0.7, 0.5, 1], 18, 1.2);
      this.ee.portals?.play?.('ptl-pasa', M.pos, 0.7);
    }
  }

  count() {
    let n = 0;
    for (let i = 0; i < TOTAL; i++) if (this.taken & (1 << i)) n++;
    return n;
  }

  // los siete: un perk de regalo para cada uno (cada compu se da el suyo) y el logro
  complete() {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    const P = g.player;
    const ids = Object.keys(PERKS).filter((id) => !P.perks?.has?.(id));
    if (ids.length && P.givePerk) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      P.givePerk(id);
      g.hud?.toast?.(`La ronda completa: ${PERKS[id]?.name || id}`);
    } else g.hud?.toast?.('La ronda completa');
    g.hud?.subtitle?.('Los siete mates perdidos. Un perk de regalo para cada uno.', 4);
    g.fx.addShake?.(0.1);
    unlockLogro?.('mates7');
  }

  // Alt+I: los siete de golpe
  debugAll() {
    if (this.host) this.send({ all: 1 });
  }

  update(dt, t) {
    for (const M of this.list) {
      if (M.pk.taken) continue;
      M.pk.obj.position.y = M.pos.y + Math.sin(t * 1.6 + M.i) * 0.05;
      M.pk.obj.rotation.y += dt * (ART ? 0.35 : 0.6);
      M.pk.obj.userData.tick?.(dt, t);
    }
  }

  state() {
    return { mt: this.taken };
  }

  applyFull(mt) {
    if (typeof mt !== 'number') return;
    for (let i = 0; i < TOTAL; i++) if (mt & (1 << i) && !(this.taken & (1 << i))) this.take(i, true);
    if (this.count() >= TOTAL) this.done = true;
  }

  dispose() {
    for (const M of this.list) {
      this.g.scene.remove(M.pk.obj);
      this.g.scene.remove(M.pk.light);
    }
  }
}
