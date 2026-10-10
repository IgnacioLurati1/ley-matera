import * as THREE from 'three';
import { PAP } from '../../config/maps/eclipse';
import { buildProp } from '../../world/props';
import { QStep, Marker, glowOrb, myId, playerAt } from './common';
import { ART, buildHojaHoz, buildTacuaral, glowSprite } from './stepArt';

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
    // la hoja de la Hoz de la Muerte, clavada de punta en un fardo del establo
    // (era una esfera blanca; qa-flujo 2026-10-07): un fardo sin choque y la hoja
    // curva de fierro negro con el filo violeta, con un brillo que late
    this.hojaObj = new THREE.Group();
    const bale = buildProp({ type: 'hay', pos: [HOJA.x, HOJA.z], rot: 0.4, y: HOJA.y }, g.world.M, 777)?.obj;
    if (bale) {
      bale.position.set(0, 0, 0);
      this.hojaObj.add(bale);
    }
    // (stepArt) la hoja de verdad: media luna de fierro negro con el filo
    // violeta, clavada de punta en el fardo de arriba
    if (ART) {
      const hoja = buildHojaHoz(g);
      hoja.position.set(0.12, 0.93, 0.1);
      // (de plano hacia el este: se entra al establo desde el maizal)
      hoja.rotation.set(0.12, Math.PI / 2 - 0.35, 2.0);
      const halo = new THREE.Group();
      halo.add(glowSprite(g, 0xb088ff, 0.9, 0.3));
      halo.position.set(0.12, 1.35, 0.1);
      this.hojaHalo = halo;
      this.hojaObj.add(hoja, halo);
    }
    const blade = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 20, Math.PI * 0.95), new THREE.MeshStandardMaterial({ color: 0x1a1522, metalness: 0.85, roughness: 0.35 }));
    blade.scale.set(1, 1, 0.25);
    blade.rotation.set(0.5, 0.3, -0.9);
    blade.position.set(0.15, 0.95, 0.05);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.012, 4, 20, Math.PI * 0.95), new THREE.MeshBasicMaterial({ color: 0xc090ff, toneMapped: false }));
    edge.scale.copy(blade.scale);
    edge.rotation.copy(blade.rotation);
    edge.position.copy(blade.position);
    const halo = glowOrb(0xb088ff, 0.14);
    halo.children[0].visible = false;
    halo.position.set(0.15, 0.95, 0.05);
    if (!ART) {
      this.hojaHalo = halo;
      this.hojaObj.add(blade, edge, halo);
    }
    this.hojaObj.position.copy(HOJA);
    // (stepArt) el tacuaral de la orilla: la tacuara con la cinta colorada se corta
    this.tac = ART ? buildTacuaral(g) : null;
    if (this.tac) {
      this.tac.root.position.copy(ASTA);
      this.arts.push(this.tac);
    }
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
    // (v5, el usuario: "algún paso del easter egg adentro de la Disformidad") el filo
    // se templa en el Pack-a-Pava despierto, en La Disformidad (antes, en cualquier
    // desgarro abierto): con las dos piezas, templar; después, sacar la propia si se perdió
    const w = g.world;
    const px = PAP.cell[0] + 0.5 + PAP.face[0] * 1.2 + PAP.face[1] * 2.6;
    const pz = PAP.cell[1] + 0.5 + PAP.face[1] * 1.2 + PAP.face[0] * 2.6;
    const py = w.floorAt(px, pz, PAP.y + 1);
    this.forgeAt = V(px, py, pz);
    this.its.push(
      g.interact.add({
        kind: 'eclipse-temple',
        pos: V(px, py + 1, pz),
        radius: 2.2,
        prompt: () => {
          if (!this.papAwake()) return this.st.hoja && this.st.asta && !this.st.forged ? { text: 'El Pack-a-Pava duerme: el ritual', noCost: true, info: true } : null;
          if (!this.st.forged) return this.st.hoja && this.st.asta ? { text: 'templar el filo en la Disformidad', noCost: true, hold: true } : null;
          return g.weapons.cosmic?.held?.() ? null : { text: 'sacar un Desgarrador de la Disformidad', noCost: true, hold: true };
        },
        cost: () => 0,
        holdTime: 4,
        use: () => {
          if (!this.papAwake()) return false;
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

  // el Pack-a-Pava despierto (el ritual de world/papDesgarro.js hecho)
  papAwake() {
    return !!this.g.papq?.done;
  }

  // (qa-flujo) con las dos piezas: dónde se templa, y cómo se llega si el
  // Pack-a-Pava todavía duerme
  both() {
    if (this.papAwake()) return 'Con las dos piezas: templá el filo al lado del Pack-a-Pava, en la Disformidad.';
    // (2026-10-10: el acto I del Pack-a-Pava son las cuatro grietas, world/papGrietas.js)
    const T = this.g.papq?.termas;
    if (T?.gr) return this.g.world.power ? `Las dos piezas. A la Disformidad: ${T.hintI()}` : 'Las dos piezas. Para la Disformidad, primero la luz: el galpón del Molino.';
    return this.g.world.power ? 'Las dos piezas. A la Disformidad: cerrá a tiros las tres cicatrices del claro.' : 'Las dos piezas. Para la Disformidad, primero la luz: el galpón del Molino.';
  }

  apply(m) {
    const g = this.g;
    if (m.a === 'hoja') {
      this.st.hoja = 1;
      this.mH.set(false);
      this.hojaObj.visible = false;
      g.hud.toast('La hoja de la Hoz');
      g.hud.subtitle(this.st.asta ? this.both() : 'Falta el asta: una tacuara a orillas de la laguna del claro.', 4.5);
    } else if (m.a === 'asta') {
      this.st.asta = 1;
      this.mA.set(false);
      this.tac?.setCut(true);
      g.hud.toast('El asta de tacuara');
      g.hud.subtitle(this.st.hoja ? this.both() : 'Falta la hoja: en el Establo Colorado de La Tapera.', 4.5);
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
      g.hud.subtitle('La Disformidad templó el filo. Nace el Desgarrador Cósmico.', 4.5);
      this.ee.got('guadana', m.id);
    }
  }

  refresh() {
    this.mH.set(!this.st.hoja);
    this.mA.set(!this.st.asta);
    this.hojaObj.visible = !this.st.hoja;
    this.tac?.setCut(!!this.st.asta);
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.hojaObj.visible && this.hojaHalo) this.hojaHalo.scale.setScalar(1 + 0.25 * Math.sin(t * 2.4));
  }

  dispose() {
    super.dispose();
    this.hojaObj.removeFromParent();
  }
}
