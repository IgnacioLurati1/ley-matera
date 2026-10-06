import * as THREE from 'three';
import { PORTALS } from '../../config/maps/eclipse';
import { QStep, Marker, glowOrb, myId, playerAt } from './common';

// Cómo se consigue el Desgarrador Cósmico (entities/EclipseEgg.js, acto I):
// se arma con dos piezas y se templa en un desgarro abierto.
//  · La hoja: la de la Hoz de la Muerte, clavada en un fardo del Establo
//    Colorado (mantener F para sacarla).
//  · El asta: una tacuara del tacuaral de la laguna del claro (mantener F).
//  · El filo: con las dos, mantener F en cualquier desgarro abierto: el tajo
//    la templa y la guadaña queda en la mano del que la templó. Después, cada
//    uno saca la suya en un desgarro abierto (F), si no tiene.
// Lo decide el anfitrión; viaja por 'pee' (k 'eq', s 'guadana').

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HOJA = V(26.5, 12, 252.5);
const ASTA = V(161.5, 30, 175.5);

export default class Guadana extends QStep {
  constructor(ee) {
    super(ee, 'guadana');
    const g = this.g;
    // got: piezas del equipo; forged: ya se templó una; owners: quién tiene
    this.st = { on: 1, done: 0, hoja: 0, asta: 0, forged: 0 };
    this.mH = new Marker(g, HOJA, 0xe0e0ff, 0.6);
    this.mA = new Marker(g, ASTA, 0x90e080, 0.6);
    this.mH.set(true);
    this.mA.set(true);
    this.marks.push(this.mH, this.mA);
    this.hojaObj = glowOrb(0xe0e0ff, 0.1);
    this.hojaObj.position.copy(HOJA).add(V(0, 0.9, 0));
    g.scene.add(this.hojaObj);
    this.its = [];
    this.its.push(
      g.interact.add({
        kind: 'eclipse-hoja',
        pos: HOJA.clone().add(V(0, 1, 0)),
        radius: 2,
        prompt: () => (this.st.hoja ? null : { text: 'sacar la hoja de la Hoz', noCost: true, hold: true }),
        cost: () => 0,
        holdTime: 4,
        use: () => (this.st.hoja ? false : (this.send({ a: 'hoja' }), true)),
      }),
      g.interact.add({
        kind: 'eclipse-asta',
        pos: ASTA.clone().add(V(0, 1, 0)),
        radius: 2,
        prompt: () => (this.st.asta ? null : { text: 'cortar una tacuara', noCost: true, hold: true }),
        cost: () => 0,
        holdTime: 2.5,
        use: () => (this.st.asta ? false : (this.send({ a: 'asta' }), true)),
      }),
    );
    // en cada punta de cada portal: templar (con las dos piezas) o sacar la propia
    const w = g.world;
    for (const def of PORTALS) {
      for (const e of [def.a, def.b]) {
        const y = w.floorAt(e.pos[0], e.pos[1]);
        const pos = V(e.pos[0] + e.face[0] * 1.2, y + 1, e.pos[1] + e.face[1] * 1.2);
        this.its.push(
          g.interact.add({
            kind: 'eclipse-temple',
            pos,
            radius: 2.2,
            prompt: () => {
              if (!this.openPortal(def.id)) return null;
              if (!this.st.forged) return this.st.hoja && this.st.asta ? { text: 'templar el filo en el desgarro', noCost: true, hold: true } : null;
              return g.weapons.cosmic?.held?.() ? null : { text: 'sacar un Desgarrador del desgarro', noCost: true, hold: true };
            },
            cost: () => 0,
            holdTime: 4,
            use: () => {
              if (!this.openPortal(def.id)) return false;
              if (!this.st.forged) {
                if (!(this.st.hoja && this.st.asta)) return false;
                this.send({ a: 'forge', id: myId(g) });
                return true;
              }
              if (g.weapons.cosmic?.held?.()) return false;
              g.weapons.cosmic?.give(0);
              g.hud.toast('Desgarrador Cósmico');
              return true;
            },
          }),
        );
      }
    }
  }

  openPortal(id) {
    const P = this.ee.portals?.list.find((p) => p.def.id === id);
    return !!P?.open;
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'hoja') {
      this.st.hoja = 1;
      this.mH.set(false);
      this.hojaObj.visible = false;
      g.hud.toast('La hoja de la Hoz');
      g.hud.subtitle(this.st.asta ? 'Con las dos piezas: templarla en un desgarro abierto.' : 'Falta el asta: una tacuara, en la laguna del claro.', 4);
    } else if (m.a === 'asta') {
      this.st.asta = 1;
      this.mA.set(false);
      g.hud.toast('El asta de tacuara');
      g.hud.subtitle(this.st.hoja ? 'Con las dos piezas: templarla en un desgarro abierto.' : 'Falta la hoja: en el Establo Colorado de La Tapera.', 4);
    } else if (m.a === 'forge') {
      this.st.forged = 1;
      this.st.done = 1;
      const p = playerAt(g, m.id);
      if (p) g.fx.sparkle(p.clone().add(V(0, 1.2, 0)), [0.7, 0.3, 1], 24, 0.9);
      g.fx.addShake?.(0.25);
      if (m.id === myId(g)) {
        g.weapons.cosmic?.give(0);
        g.hud.toast('Desgarrador Cósmico');
      }
      g.hud.subtitle('El desgarro templó el filo. Nace el Desgarrador Cósmico.', 4.5);
      this.ee.got('guadana', m.id);
    }
  }

  refresh() {
    this.mH.set(!this.st.hoja);
    this.mA.set(!this.st.asta);
    this.hojaObj.visible = !this.st.hoja;
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.hojaObj.visible) this.hojaObj.position.y = HOJA.y + 0.9 + Math.sin(t * 2) * 0.08;
  }

  dispose() {
    super.dispose();
    this.hojaObj.removeFromParent();
  }
}
