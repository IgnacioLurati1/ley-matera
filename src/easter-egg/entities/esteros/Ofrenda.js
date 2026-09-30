import * as THREE from 'three';
import { EE } from '../../config/map';
import { isHost, announce, isDown, playerById } from '../castle/common';
import { mat, glint, freeBoss } from './common';

// "El Pacto", pasos 4 y 5: la ofrenda y el Luisón.
//  4. Las almas de la creciente se juntan en una luz que flota en medio de la
//     Laguna del Irupé. Solo Gil puede tocarla y llevarla (los demás lo
//     cubren); si cae, la luz queda en el piso hasta que la levante. Se la da a
//     la voz en el hueco del algarrobo (EsterosEgg).
//  5. Con la ofrenda, algo viene a cobrarse lo de Gil: el Luisón, el séptimo
//     hijo, entra por el oeste del algarrobo.
// Lo decide el anfitrión.

const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();

export default class Ofrenda {
  constructor(egg) {
    this.egg = egg;
    const g = (this.g = egg.g);
    this.root = new THREE.Group();
    egg.root.add(this.root);
    // la luz: none (todavía no hay almas), grow (se está juntando), lake (lista
    // en la laguna), carried (la lleva Gil), floor (se le cayó), given
    this.orb = 'none';
    this.carrier = null;
    this.dropPos = null;
    this.luison = false;
    this.build();
    this.register();
  }

  build() {
    const g = this.g;
    const core = mat('orbCore', () => new THREE.MeshBasicMaterial({ color: 0xd8ffe8, toneMapped: false }));
    this.ball = new THREE.Group();
    this.ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), core));
    this.halo = glint(g, 0x9affc8, 2.2);
    this.halo2 = glint(g, 0x6ad8ff, 3.6);
    this.halo2.material.opacity = 0.35;
    this.ball.add(this.halo, this.halo2);
    this.ball.visible = false;
    this.root.add(this.ball);
  }

  // Dónde flota la luz en la laguna (sube y baja con el agua).
  lakePos(v) {
    const [x, z] = EE.orbe;
    return v.set(x, (this.g.water?.level ?? 0) + 1.1, z);
  }

  register() {
    const g = this.g;
    const E = this.egg;
    // la luz: la agarra Gil (en la laguna o donde se le cayó)
    this.it = g.interact.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 2.2,
      wide: true,
      prompt: () => {
        if (this.orb !== 'lake' && this.orb !== 'floor') return null;
        if (!E.isGil()) return { text: 'La luz de los ahogados quema los dedos: solo Gil puede tocarla', noCost: true, info: true };
        return { text: 'agarrar la luz de los ahogados', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        const from = g.net?.useFrom ?? E.myId();
        if ((this.orb !== 'lake' && this.orb !== 'floor') || !E.isGil(from)) return false;
        this.orb = 'carried';
        this.carrier = from;
        announce(g, 'Gil levantó la luz de los ahogados. Al hueco del algarrobo: cúbranlo.', 4, true);
        E.netSync();
        return true;
      },
    });
  }

  // (anfitrión) Se juntaron todas las almas: la luz queda lista en la laguna.
  ready() {
    this.orb = 'lake';
  }

  // (anfitrión) Gil se la da a la voz.
  give() {
    this.orb = 'given';
    this.carrier = null;
    const [x, z] = EE.hueco;
    this.g.fx.explosion(new THREE.Vector3(x, this.g.world.floorAt(x, z) + 1.4, z), 1.4, [0.6, 1, 0.8]);
  }

  // (anfitrión) El Luisón entra por el oeste del algarrobo. o: { at, yaw,
  // quiet } cuando viene de la escena de la llegada (ui/LuisonArrival): ya está
  // ahí, ya aulló, y sale corriendo derecho.
  callLuison(o = {}) {
    const g = this.g;
    this.luison = true;
    // (si queda el cuerpo de otro jefe, se va; si anda uno vivo, spawnBoss lo saca)
    freeBoss(g);
    const [x, z] = EE.luison;
    const round = Math.max(12, g.rounds.round);
    const b = g.zombies.spawnBoss(round, { at: o.at || new THREE.Vector3(x, g.world.floorAt(x, z), z), kind: 'luison', quiet: o.quiet });
    if (o.quiet && b) {
      if (o.yaw != null) b.yaw = o.yaw;
      b.state = 'chase';
      b.stateT = 0;
      // (recién caído de la loma: un momento quieto, mirándolos, antes de atacar)
      if (o.hold) b.holdT = o.hold;
    }
    if (!o.quiet) g.audio.bossArrive?.();
    this.egg.netSync();
  }

  // Dónde está la luz ahora.
  where(v) {
    if (this.orb === 'lake' || this.orb === 'grow') return this.lakePos(v);
    if (this.orb === 'floor' && this.dropPos) return v.set(this.dropPos[0], this.dropPos[1] + 0.9, this.dropPos[2]);
    if (this.orb === 'carried') {
      const E = this.egg;
      if (this.carrier === E.myId()) {
        // la mía: adelante y abajo, a la vista
        const cam = this.g.camera;
        tmpF.set(0.28, -0.32, -0.75).applyQuaternion(cam.quaternion);
        return v.copy(cam.position).add(tmpF);
      }
      const r = this.g.net?.remote.get(this.carrier);
      if (r) return v.set(r.pos.x, r.pos.y + 1.2, r.pos.z);
    }
    return null;
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    const E = this.egg;
    // mientras se juntan las almas, la luz crece en la laguna
    const grow = E.step === 3 ? E.poder.souls / E.poder.need() : 1;
    if (E.step === 3 && this.orb === 'none' && E.poder.souls > 0) this.orb = 'grow';
    const at = this.orb === 'none' || this.orb === 'given' ? null : this.where(tmpV);
    this.ball.visible = !!at;
    if (at) {
      this.ball.position.copy(at);
      if (this.orb !== 'carried') this.ball.position.y += Math.sin(t * 1.4) * 0.12;
      const mine = this.orb === 'carried' && this.carrier === E.myId();
      const s = (0.3 + grow * 0.7) * (mine ? 0.35 : 1);
      this.ball.scale.setScalar(s);
      this.halo.material.opacity = 0.6 + Math.sin(t * 5) * 0.2;
      this.halo2.material.opacity = 0.25 + Math.sin(t * 2.3) * 0.1;
      this.it.pos.copy(at).setY(at.y - (this.orb === 'lake' ? 1 : 0.5));
      if (Math.random() < dt * 6 && !mine) g.fx.sparkle(at, [0.6, 1, 0.8], 1, 0.6);
    }
    if (!isHost(g) || this.orb !== 'carried') return;
    // (anfitrión) si Gil cae o se va, la luz queda en el piso
    if (isDown(g, this.carrier)) {
      const p = playerById(g, this.carrier)?.pos || (this.carrier === E.myId() ? g.player.pos : null);
      const w = g.world;
      const pos = p || this.lakePos(tmpV);
      this.orb = 'floor';
      this.dropPos = [pos.x, w.floorAt(pos.x, pos.z, pos.y), pos.z];
      this.carrier = null;
      announce(g, 'A Gil se le cayó la luz de los ahogados. Que la levante (solo él puede).', 4);
      E.netSync();
    }
  }

  line() {
    const E = this.egg;
    const gil = E.isGil();
    if (this.orb === 'lake') return { main: 'La luz de los ahogados', sub: gil ? 'Flota en medio de la Laguna del Irupé. Solo vos podés tocarla: llevásela a la voz, al hueco del algarrobo' : 'Flota en medio de la Laguna del Irupé. Solo Gil puede llevarla al algarrobo: cúbranlo' };
    if (this.orb === 'floor') return { main: 'La luz se cayó', sub: gil ? 'Levantala de donde caíste y seguí hasta el algarrobo' : 'Quedó donde cayó Gil: solo él puede levantarla' };
    if (this.orb === 'carried') return { main: 'La ofrenda', sub: gil ? 'Al hueco del Algarrobo de los Colgados' : 'Gil lleva la luz al Algarrobo de los Colgados: cúbranlo' };
    return null;
  }

  state() {
    return { ob: this.orb, oc: this.carrier, od: this.dropPos, lu: this.luison ? 1 : 0 };
  }

  apply(m) {
    if (m.ob) this.orb = m.ob;
    if (m.oc !== undefined) this.carrier = m.oc;
    if (m.od !== undefined) this.dropPos = m.od;
    if (m.lu != null) this.luison = !!m.lu;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
