import * as THREE from 'three';
import { EE } from '../config/map';
import { zombieHealth, maxAlive } from '../config/rules';
import { mesh, boxGeo, cylGeo, mergeByMaterial, compactGroup } from '../world/props';
import { missingIn, missingText } from './Encierro';
import FarmDefense from './FarmDefense';
import SongEgg from '../world/SongEgg';
import { fireflies } from '../fx/Fireflies';
import Navigation from '../world/Navigation';

// Easter egg de la granja: "La Hoz de la Muerte". Lo va guiando una voz que
// baja del cielo (la Entidad) y, a medida que se avanza, el sol se hunde y se
// hace de noche.
//  1. Prender el grupo electrógeno del galpón: la voz se presenta.
//  2. Tres pedazos de la hoz (la hoja en la huerta, el mango en los silos y
//     la virola en el pajar). Cada uno está en un altar: al tocarlo empieza
//     un ritual de encierro (salen muertos y hay que liquidarlos adentro del
//     círculo hasta juntar las almas que pide), cada uno con su vuelta:
//     - la Hoja: cuatro velones alrededor. Los muertos los apagan y hay que
//       volver a prenderlos (mantener F); si se apagan todos, se escapa la
//       mitad de las almas.
//     - el Mango: el círculo se muda entre los silos; una luz avisa adónde.
//     - la Virola: en el pajar las almas no vuelan solas: quedan flotando y
//       hay que pasar a buscarlas antes de que se apaguen.
//  3. Armar la hoz en la morsa del galpón. Cada jugador se lleva la suya.
//  4. La hoja toma sangre: entre todos, liquidar muertos con la hoz.
//  5. La forja: poner la hoz en el Pack-a-Pava y cuidarla adentro del
//     círculo mientras se forja. A mitad de camino llega el Cuervo, se posa
//     en el techo del establo y arranca la chapa (la forja retrocede): hay
//     que salir a bajarlo. Sale la Hoz de la Muerte (y después, cualquiera
//     convierte la suya gratis).
//  6. Cosechar con la Hoz de la Muerte las cinco plantas que brillan en los tablones.
//  7. Sapecarla en el barbacuá de los tablones: tenderla arriba, prender el
//     fuego en la boca de abajo y aguantar arriba (dándola vuelta y apagando
//     las llamaradas) mientras los muertos suben por la escalera.
//  8. Moler la yerba en la atahona (mantener F) y empaquetarla en el galpón.
//  9. Se abre el maizal hacia el prado: ofrecerle la yerba a la Entidad
//     despierta al Espantapájaros gigante. Si cae, la cinemática del final.
// En línea lo lleva el anfitrión; cualquiera puede hacer cada paso.

const VOICE = {
  intro: 'Por fin prendieron la luz. No me busquen, estoy arriba, donde no llega el humo. Necesito algo de ustedes.',
  hoz: 'Armen una hoz. La hoja está en la huerta, el mango en los silos y la virola en el pajar. Y los muertos no sueltan fácil.',
  ritual: 'Quédense adentro del círculo. Que las almas paguen el pedazo.',
  piece: '¿Sienten cómo baja el sol? Uno menos.',
  pieces: 'Ya están los tres pedazos. Arménla en la morsa del galpón.',
  built: 'Cada uno agarre la suya. Pero la hoja está seca... tiene que tomar sangre. Corten muertos con ella.',
  blood: 'Ahí está. Ya tomó sangre. Ahora al Pack-a-Pava del establo, que la forje.',
  pap: 'Que la máquina la forje. Ustedes quédense al lado y cuídenla... hay algo allá arriba que la quiere.',
  crow: 'El Cuervo. Si se posa en el techo, se la lleva. Salgan y bájenlo.',
  velas: 'Los velones no se pueden apagar. Si se apagan todos, las almas se me escapan.',
  velasOut: 'Se apagaron todos... la mitad de las almas se fue.',
  luz: 'El círculo no se queda quieto. Sigan la luz.',
  almas: 'Acá arriba las almas no suben solas. Vayan a buscarlas antes de que se apaguen.',
  papDone: 'La Hoz de la Muerte. Corten tres plantas de los tablones.',
  // (con la defensa del yerbal por venir: no se corta nada hasta que termine)
  papWait: 'La Hoz de la Muerte. Todavía no corten nada... algo viene por el yerbal.',
  cosecha: 'Ahora sí. Corten tres plantas de los tablones.',
  madre: 'Falta la Yerba Madre. Está escondida en el matorral, atrás de la atahona.',
  harvest: 'Ya está. Pero verde no se muele... al barbacuá de los tablones, con fuego abajo.',
  spread: 'Así, bien tendida. Ahora el fuego, que la boca está abajo.',
  lit: 'Que no se queme. Quédense arriba dándola vuelta y apaguen las llamaradas... el humo me gusta.',
  dried: 'Sapecada. Ahora sí, a la atahona, a molerla.',
  milled: 'Falta empaquetarla. La mesa está en el galpón.',
  packed: 'Eso. Ahora tráiganmela. Les abrí el maizal, vayan al prado. Allá lo van a ver... a él.',
  prado: 'Déjenla en la piedra del medio. Y no se asusten, es solo paja... y odio.',
  offer: 'Ya está en la piedra. Ahí viene... prepárense.',
  regrow: 'Las plantas vuelven a crecer. Esperen unas rondas... y esta vez cuiden el yerbal.',
  remind: [
    'Hay pedazos de la hoz que todavía esperan su ritual.',
    'La morsa del galpón. Ahí se arma.',
    'La hoja está seca. Corten muertos con la hoz, que tome sangre.',
    'El Pack-a-Pava, en el establo. Ahí se forja la hoja.',
    'Tres plantas de los tablones. Córtenlas con la Hoz de la Muerte.',
    'El barbacuá, en los tablones. La yerba verde no se muele.',
    'La atahona. Muelan la yerba.',
    'La mesa del galpón. Empaquétenla.',
    'El prado. Los estoy esperando.',
  ],
};

// Las plantas que hay que cortar: las cinco de los tablones (EE.plants, cada
// una con su parcela en la defensa del yerbal) y la Yerba Madre, en el claro
// del campamento del fondo del matorral (entities/Matorral.js). Cortarla prende el matorral.
const allPlants = () => (EE.matorral ? [...EE.plants, EE.matorral.plant] : EE.plants);
// De las de los tablones alcanzan tres: si la defensa rompe una, no se pierde
// el paso. La Yerba Madre va sí o sí (el usuario, 2026-09-29).
const NEED_TABLONES = 3;

const PIECE_NAMES = { hoja: 'Hoja de la hoz', mango: 'Mango de la hoz', virola: 'Virola de la hoz' };
const INV = [
  ['hoja', 'Hoja', '☾'],
  ['mango', 'Mango', '┃'],
  ['virola', 'Virola', '◎'],
  ['hoz', 'Hoz armada', '⚒'],
  ['sangre', 'Hoz ensangrentada', '✚'],
  ['muerte', 'Hoz de la Muerte', '☠'],
  ['yerba', 'Yerba cosechada', '❦'],
  ['seca', 'Yerba sapecada', '♨'],
  ['molida', 'Yerba molida', '✺'],
  ['paquete', 'Paquete de yerba', '▣'],
];
// pasos que cuentan para que baje el sol (de 1 a la noche cerrada)
const STEPS = 10;
// el alma suelta del pajar: cuánto dura y de qué distancia se agarra
const WISP_LIFE = 6;
const WISP_R = 1.2;
// la forja: cuánto suma cada muerto en el círculo, cuánto resta el Cuervo en
// el techo (al posarse y por segundo) y cuánta vida trae
const FORGE_KILL = 0.012;
const FORGE_HIT = 0.05;
const FORGE_PECK = 0.04;
const FORGE_CROW_HP = 0.6;
// el barbacuá: apagado, yerba tendida, secándose y listo
const DRY = ['off', 'spread', 'on', 'done'];
const DRY_GREEN = new THREE.Color(0x2e5a1e);
const DRY_BROWN = new THREE.Color(0x6a5a26);
const RITUAL_NAME = { velas: 'de las velas', luz: 'de la luz', almas: 'de las almas sueltas' };
const tmpV = new THREE.Vector3();

export default class FarmEgg {
  constructor(game) {
    this.g = game;
    this.pieces = { hoja: 'idle', mango: 'idle', virola: 'idle' };
    this.ritual = null;
    this.hozBuilt = false;
    // la hoja toma sangre (muertos con la hoz, entre todos)
    this.blood = 0;
    this.bloodOk = false;
    // almas sueltas del pajar
    this.wisps = [];
    this.wispId = 0;
    this.velaG = { vela: 0, x: 0, z: 0, d: 0, nav: null };
    const [rx, rz, ry] = EE.papRitual.roof;
    this.roof = { i: 'techo', x: rx, z: rz, y: ry };
    this.papRitual = 'off';
    this.harvested = allPlants().map(() => false);
    this.dryState = 'off';
    this.dry = 0;
    this.flare = null;
    this.flarePos = new THREE.Vector3();
    this.mill = 0;
    this.milled = false;
    this.packed = false;
    this.fight = false;
    this.started = null;
    this.done = false;
    this.voiceT = 60;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.M = game.world.M;
    this.buildAltars();
    this.buildBench();
    this.buildPlants();
    this.buildMill();
    this.buildPack();
    this.buildBarbacua();
    this.buildPradoAltar();
    this.buildBeam();
    this.register();
    // la defensa del yerbal (cada 10 rondas, o antes si se llega a la
    // cosecha): los muertos la buscan por g.defense
    this.defense = new FarmDefense(game, this);
    // Los muertos y el Cuervo buscan adónde ir por g.defense (Zombies.chase y
    // Crow.update): en la defensa, a las parcelas; en el ritual de las velas,
    // a los velones; en la forja, el Cuervo al techo del establo. Este envoltorio
    // reparte entre la defensa y el easter egg (el resto va derecho a la defensa).
    const D = this.defense;
    const routes = {
      goal: (z, target, distP) => (D.active ? D.goal(z, target, distP) : this.velaGoal(z, target, distP)),
      zombieHit: (G) => (G.vela != null ? this.velaHit(G) : D.zombieHit(G)),
      crowPlot: () => (D.active ? D.crowPlot() : this.roofPlot()),
      crowHit: (i) => (i === 'techo' ? this.roofHit() : D.crowHit(i)),
      crowPeck: (i, dt) => (i === 'techo' ? this.roofPeck(dt) : D.crowPeck(i, dt)),
    };
    this.goals = new Proxy(D, {
      get: (t, k) => {
        if (k === 'active') return t.active || this.luring();
        if (Object.hasOwn(routes, k)) return routes[k];
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    game.defense = this.goals;
    // easter egg musical: tres escarapelas en las paredes (world/SongEgg.js)
    this.song = new SongEgg(game, 'granja');
  }

  get papDone() {
    return this.papRitual === 'done';
  }

  // El ritual del Pack-a-Pava es un encierro: tienen que estar todos ahí.
  papMissing() {
    const [x, z] = EE.papRitual.pos;
    const miss = missingIn(this.g, this.g.world.zoneAt(x, z));
    return miss.length ? missingText(miss, 'el Pack-a-Pava') : null;
  }

  // Muertos con la hoz que faltan antes de la forja (entre todos).
  get bloodNeed() {
    return EE.blood.need + EE.blood.per * (this.players() - 1);
  }

  // El Pack-a-Pava no toma la hoz hasta que la hoja tomó sangre (world/Interactables.js).
  hozWait() {
    if (this.papDone || this.bloodOk || !this.hozBuilt) return null;
    const n = Math.max(1, this.bloodNeed - this.blood);
    return `La hoja todavía está seca: liquidá ${n} ${n === 1 ? 'muerto' : 'muertos'} más con la hoz y volvé al Pack-a-Pava`;
  }

  get progress() {
    const taken = Object.values(this.pieces).filter((s) => s === 'taken').length;
    return taken + (this.hozBuilt ? 1 : 0) + (this.bloodOk ? 1 : 0) + (this.papDone ? 1 : 0) + (this.harvestDone() ? 1 : 0) + (this.dryState === 'done' ? 1 : 0) + (this.milled ? 1 : 0) + (this.packed ? 1 : 0);
  }

  // ---------------- la cosecha ----------------
  cutTablones() {
    let n = 0;
    for (const p of this.plants) if (!p.madre && this.harvested[p.i]) n++;
    return n;
  }

  get needTablones() {
    return Math.min(NEED_TABLONES, EE.plants.length);
  }

  // ¿Esta planta todavía hace falta? (de los tablones, hasta tener tres; la Madre, siempre)
  needed(p) {
    if (this.harvested[p.i]) return false;
    return p.madre || this.cutTablones() < this.needTablones;
  }

  harvestDone() {
    return !!this.plants && this.plants.every((p) => !this.needed(p));
  }

  // Cuántas van y cuántas hacen falta (para el cartel).
  harvestCount() {
    const madres = this.plants.filter((p) => p.madre);
    const got = Math.min(this.cutTablones(), this.needTablones) + madres.filter((p) => this.harvested[p.i]).length;
    return [got, this.needTablones + madres.length];
  }

  // (anfitrión) Terminó una defensa del yerbal: si estaban en la cosecha, ahora sí se corta.
  defenseOver() {
    if (!this.papDone || this.harvestDone() || this.fight) return;
    this.voiceT = 90;
    if (this.harvestWaiting()) this.voice(VOICE.regrow, 5);
    else this.voice(this.cutTablones() >= this.needTablones ? VOICE.madre : VOICE.cosecha, 5);
  }

  // Solo quedan plantas de los tablones rotas (volviendo a crecer): hay que esperar.
  harvestWaiting() {
    if (this.cutTablones() >= this.needTablones) return false;
    const up = this.plants.filter((p) => !p.madre && !this.harvested[p.i] && !this.defense.down(p.i)).length;
    return this.cutTablones() + up < this.needTablones;
  }

  // ---------------- modelos ----------------
  pieceModel(id) {
    const M = this.M;
    const g = new THREE.Group();
    if (id === 'hoja') {
      const blade = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 28, 3.6), M.metal);
      blade.scale.set(1, 1, 0.25);
      g.add(blade);
    } else if (id === 'mango') {
      g.add(mesh(cylGeo(0.03, 0.035, 0.45, 10), M.wood, 0, 0, 0, 0, 0, 0.5));
      for (const y of [-0.12, 0, 0.12]) g.add(mesh(new THREE.TorusGeometry(0.034, 0.006, 5, 12), M.leather, Math.sin(0.5) * -y, y * Math.cos(0.5), 0, Math.PI / 2, 0.5, 0));
    } else {
      g.add(mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 20), M.brass, 0, 0, 0, Math.PI / 2 - 0.3, 0, 0));
    }
    return g;
  }

  // Hoz de adorno (la que queda en la morsa): mango y hoja.
  hozModel(death = false) {
    const M = this.M;
    const g = new THREE.Group();
    g.add(mesh(cylGeo(0.03, 0.034, 0.4, 10), death ? M.clothWhite : M.wood, 0, 0.2, 0));
    const blade = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 28, 3.7), death ? M.black : M.metal);
    blade.rotation.y = -Math.PI / 2;
    blade.position.set(0, 0.4, -0.26);
    blade.scale.set(1, 1, 0.25);
    g.add(blade);
    return g;
  }

  glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.scale.setScalar(size);
    return s;
  }

  // Los tres altares: una piedra con el pedazo flotando y el círculo del ritual.
  buildAltars() {
    const M = this.M;
    this.altars = {};
    for (const def of EE.rituals) this.altars[def.id] = this.makeAltar(def, M);
    // el círculo del ritual del Pack-a-Pava (sin altar: la máquina hace de altar)
    this.papRing = this.makeRing(EE.papRitual.pos, EE.papRitual.r);
    // los velones de la Hoja y el círculo que se muda del Mango (con el que avisa adónde)
    const velas = EE.rituals.find((r) => r.kind === 'velas');
    if (velas) this.buildCandles(velas);
    const luz = EE.rituals.find((r) => r.kind === 'luz');
    if (luz) {
      this.luzRing = this.makeMovingRing(luz.spotR, 0xff3a2a, true);
      this.luzNext = this.makeMovingRing(luz.spotR, 0xffe6a0, false);
    }
  }

  // Cuatro velones alrededor del círculo, cada uno en el lugar libre más
  // cercano a su diagonal. Se prenden solo durante el ritual.
  buildCandles(def) {
    const M = this.M;
    const nav = this.g.nav;
    const [cx, cz] = def.pos;
    this.candles = [];
    for (let k = 0; k < 4; k++) {
      let x = cx;
      let z = cz;
      for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
        const a = Math.PI / 4 + (k * Math.PI) / 2 + da;
        x = cx + Math.cos(a) * def.r * 0.72;
        z = cz + Math.sin(a) * def.r * 0.72;
        if (!nav.blocked(Math.floor(x), Math.floor(z))) break;
      }
      const y = this.g.world.floorAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      grp.add(mesh(cylGeo(0.2, 0.26, 0.22, 10), M.stoneDark, 0, 0.11, 0));
      grp.add(mesh(cylGeo(0.075, 0.085, 0.5, 10), M.candle, 0, 0.47, 0));
      // la cera chorreada
      grp.add(mesh(cylGeo(0.1, 0.12, 0.05, 10), M.candle, 0, 0.245, 0));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), M.flame);
      flame.position.y = 0.8;
      grp.add(flame);
      const glow = this.glowSprite(0xffa040, 1.1);
      glow.position.y = 0.82;
      grp.add(glow);
      this.root.add(grp);
      this.candles.push({ i: k, x, y, z, grp, flame, glow, lit: false, nav: null });
    }
  }

  // Un círculo de ritual que se puede mover (el del Mango y el que avisa adónde va).
  makeMovingRing(r, color, withCandles) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 64).rotateX(-Math.PI / 2), mat);
    ring.position.y = 0.04;
    ring.renderOrder = 2;
    group.add(ring);
    const candles = new THREE.Group();
    for (let i = 0; withCandles && i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cx = Math.cos(a) * (r + 0.2);
      const cz = Math.sin(a) * (r + 0.2);
      candles.add(mesh(cylGeo(0.035, 0.04, 0.22, 8), this.M.candle, cx, 0.11, cz));
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), this.M.flame);
      f.position.set(cx, 0.27, cz);
      candles.add(f);
    }
    // (se prenden enteras: una malla de cera y una de llamas, sin sombra de llama)
    mergeByMaterial(candles);
    for (const o of candles.children) if (o.material === this.M.flame) o.castShadow = false;
    candles.visible = false;
    group.add(candles);
    this.root.add(group);
    return { group, ring, candles, r };
  }

  makeRing(pos, r) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 64).rotateX(-Math.PI / 2), mat);
    const y = this.g.world.floorAt(pos[0], pos[1]);
    ring.position.set(pos[0], y + 0.04, pos[1]);
    ring.renderOrder = 2;
    this.root.add(ring);
    // velas alrededor
    const candles = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      candles.add(mesh(cylGeo(0.035, 0.04, 0.22, 8), this.M.candle, pos[0] + Math.cos(a) * (r + 0.2), y + 0.11, pos[1] + Math.sin(a) * (r + 0.2)));
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), this.M.flame);
      f.position.set(pos[0] + Math.cos(a) * (r + 0.2), y + 0.27, pos[1] + Math.sin(a) * (r + 0.2));
      candles.add(f);
    }
    // (se prenden enteras: una malla de cera y una de llamas, sin sombra de llama)
    mergeByMaterial(candles);
    for (const o of candles.children) if (o.material === this.M.flame) o.castShadow = false;
    candles.visible = false;
    this.root.add(candles);
    return { ring, candles, pos: new THREE.Vector3(pos[0], y, pos[1]), r };
  }

  makeAltar(def, M) {
    const [x, z] = def.pos;
    const y = this.g.world.floorAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(mesh(cylGeo(0.42, 0.5, 0.9, 10), M.stone, 0, 0.45, 0));
    g.add(mesh(cylGeo(0.5, 0.5, 0.08, 10), M.stoneDark, 0, 0.93, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(cylGeo(0.02, 0.02, 0.16, 6), M.candle, Math.cos(i * 2.1) * 0.36, 1.05, Math.sin(i * 2.1) * 0.36));
    mergeByMaterial(g);
    this.root.add(g);
    this.g.world.addBox([x - 0.5, y, z - 0.5, x + 0.5, y + 1, z + 0.5], { kind: 'prop' });
    const piece = this.pieceModel(def.id);
    piece.position.set(x, y + 1.35, z);
    this.root.add(piece);
    const glow = fireflies(this.g, 0xff6a3a, 1.2);
    glow.position.set(x, y + 1.35, z);
    this.root.add(glow);
    const ring = this.makeRing(def.pos, def.r);
    return { def, group: g, piece, glow, ring, y, pos: new THREE.Vector3(x, y + 1.2, z) };
  }

  // La morsa del galpón: mesa de herrero con una morsa y la piedra de afilar.
  buildBench() {
    const M = this.M;
    const [x, z] = EE.bench.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = EE.bench.rot;
    g.add(mesh(boxGeo(2, 0.1, 0.8), M.woodDark, 0, 0.9, 0));
    for (const [a, b] of [[-0.9, -0.33], [0.9, -0.33], [-0.9, 0.33], [0.9, 0.33]]) g.add(mesh(boxGeo(0.09, 0.9, 0.09), M.woodDark, a, 0.45, b));
    g.add(mesh(boxGeo(0.22, 0.16, 0.2), M.iron, 0.6, 1.03, -0.15));
    g.add(mesh(boxGeo(0.06, 0.2, 0.2), M.iron, 0.48, 1.1, -0.15));
    g.add(mesh(cylGeo(0.02, 0.02, 0.3, 6), M.iron, 0.6, 1.14, 0.02, 0, 0, Math.PI / 2));
    g.add(mesh(cylGeo(0.25, 0.25, 0.08, 16), M.stone, -0.55, 1.2, 0, Math.PI / 2, 0, 0));
    mergeByMaterial(g);
    this.root.add(g);
    this.g.world.addBox([x - 1.05, 0, z - 0.45, x + 1.05, 1.05, z + 0.45], { kind: 'prop' });
    // los pedazos se van poniendo arriba de la mesa a medida que llegan
    this.benchPieces = {};
    let k = 0;
    for (const id of ['hoja', 'mango', 'virola']) {
      const p = this.pieceModel(id);
      p.position.set(x - 0.3 + k * 0.35, 1.02, z + 0.1);
      p.rotation.x = -Math.PI / 2;
      p.visible = false;
      this.root.add(p);
      this.benchPieces[id] = p;
      k++;
    }
    this.benchHoz = this.hozModel(false);
    this.benchHoz.position.set(x - 0.1, 1.0, z);
    this.benchHoz.rotation.set(Math.PI / 2, 0, 0.4);
    this.benchHoz.visible = false;
    this.root.add(this.benchHoz);
    this.benchPos = new THREE.Vector3(x, 1.1, z);
  }

  // Las seis plantas de yerba que hay que cortar (brillan cuando corresponde).
  // La Yerba Madre (la del matorral) es más grande y tiene las florcitas blancas.
  buildPlants() {
    const M = this.M;
    this.glowLeaf = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, emissive: 0x3aff7a, emissiveIntensity: 0.9, roughness: 0.8, flatShading: true });
    this.plants = allPlants().map(([x, z], i) => {
      const madre = i >= EE.plants.length;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      let fl = null;
      if (madre) {
        g.scale.setScalar(1.9);
        this.flowerMat ||= new THREE.MeshStandardMaterial({ color: 0xf4f0e0, emissive: 0xfff6d0, emissiveIntensity: 0.35, roughness: 0.6 });
        fl = new THREE.Group();
        for (let k = 0; k < 14; k++) {
          const a = k * 2.4;
          fl.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), this.flowerMat, Math.cos(a) * (0.2 + (k % 3) * 0.08), 0.9 + (k % 4) * 0.13, Math.sin(a) * (0.2 + (k % 3) * 0.08)));
        }
        mergeByMaterial(fl);
        g.add(fl);
      }
      g.add(mesh(cylGeo(0.05, 0.08, 0.6, 6), M.bark, 0, 0.3, 0));
      // (las siete matas en una malla: se esconden y cambian de material juntas)
      const lg = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const m = mesh(new THREE.IcosahedronGeometry(1, 1), M.yerbaBush, Math.cos(a) * 0.25, 0.85 + (k % 3) * 0.18, Math.sin(a) * 0.25);
        m.scale.setScalar(0.3 + (k % 2) * 0.08);
        lg.add(m);
      }
      if (!globalThis.__mduNoMerge) compactGroup(lg);
      g.add(lg);
      const leaves = [...lg.children];
      const stump = mesh(cylGeo(0.09, 0.1, 0.18, 6), M.bark, 0, 0.09, 0);
      stump.visible = false;
      g.add(stump);
      this.root.add(g);
      const glow = this.glowSprite(0x6aff9a, madre ? 3 : 1.6);
      glow.position.set(x, madre ? 1.8 : 1, z);
      glow.visible = false;
      this.root.add(glow);
      return { i, g, leaves, stump, glow, madre, fl, pos: new THREE.Vector3(x, 0, z) };
    });
  }

  // La atahona: base de piedra, la rueda parada que gira alrededor y el palo.
  buildMill() {
    const M = this.M;
    const [x, z] = EE.mill.pos;
    const base = new THREE.Group();
    base.position.set(x, 0, z);
    base.add(mesh(cylGeo(1.15, 1.25, 0.55, 20), M.stone, 0, 0.27, 0));
    base.add(mesh(cylGeo(0.12, 0.12, 1.6, 8), M.woodDark, 0, 0.8, 0));
    const rot = new THREE.Group();
    rot.position.y = 0.55;
    const wheel = mesh(cylGeo(0.55, 0.55, 0.28, 22), M.stoneDark, 0.55, 0.55, 0, 0, 0, Math.PI / 2);
    rot.add(wheel);
    rot.add(mesh(cylGeo(0.05, 0.05, 2.4, 6), M.log, 0.3, 0.55, 0, 0, 0, Math.PI / 2));
    base.add(rot);
    // la yerba que se va moliendo
    this.millYerba = mesh(cylGeo(0.9, 0.95, 0.04, 20), M.yerbaBranch, 0, 0.57, 0);
    this.millYerba.visible = false;
    base.add(this.millYerba);
    this.root.add(base);
    this.g.world.addBox([x - 1.25, 0, z - 1.25, x + 1.25, 1.1, z + 1.25], { kind: 'prop' });
    this.millRot = rot;
    this.millPos = new THREE.Vector3(x, 1, z);
  }

  // La mesa de empaquetar del galpón.
  buildPack() {
    const M = this.M;
    const [x, z] = EE.pack.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = EE.pack.rot;
    g.add(mesh(boxGeo(1.6, 0.07, 0.8), M.wood, 0, 0.85, 0));
    for (const [a, b] of [[-0.72, -0.33], [0.72, -0.33], [-0.72, 0.33], [0.72, 0.33]]) g.add(mesh(boxGeo(0.07, 0.85, 0.07), M.wood, a, 0.42, b));
    // balanza, papeles doblados y la estampilla
    g.add(mesh(cylGeo(0.12, 0.15, 0.08, 12), M.redPaint, 0.5, 0.93, 0));
    g.add(mesh(cylGeo(0.17, 0.17, 0.02, 14), M.metal, 0.5, 1.12, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(boxGeo(0.3, 0.01, 0.4), M.paper, -0.4, 0.9 + i * 0.012, 0.05, 0, i * 0.15, 0));
    mergeByMaterial(g);
    this.root.add(g);
    const pk = new THREE.Group();
    pk.add(mesh(boxGeo(0.16, 0.26, 0.1), new THREE.MeshStandardMaterial({ map: packTexture(), roughness: 0.7 }), 0, 0.13, 0));
    pk.position.set(x, 0.89, z);
    pk.visible = false;
    this.root.add(pk);
    this.packObj = pk;
    this.g.world.addBox([x - 0.45, 0, z - 0.85, x + 0.45, 0.95, z + 0.85], { kind: 'prop' });
    this.packPos = new THREE.Vector3(x, 1, z);
  }

  // El barbacuá (la estructura la arma world/Farm.js): la yerba tendida en el
  // catre, que pasa de verde a sapecada, la luz del fuego de la boca y la
  // marca de la llamarada.
  buildBarbacua() {
    const w = this.g.world.barbacua;
    const def = EE.barbacua;
    if (!w || !def) return;
    const { x0, z0, x1, z1, y } = w.deck;
    // ramitas con hojas, tiradas en el catre (una sola malla)
    this.dryMat = new THREE.MeshStandardMaterial({ color: DRY_GREEN, roughness: 1, flatShading: true });
    const n = 220;
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.dryMat, n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const r = Math.random;
    for (let k = 0; k < n; k++) {
      p.set(x0 + 0.3 + r() * (x1 - x0 - 0.6), y + 0.1 + r() * 0.05, z0 + 0.3 + r() * (z1 - z0 - 0.6));
      q.setFromEuler(e.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3));
      s.set(0.18 + r() * 0.16, 0.035 + r() * 0.03, 0.08 + r() * 0.06);
      im.setMatrixAt(k, m4.compose(p, q, s));
    }
    im.castShadow = false;
    im.receiveShadow = true;
    im.visible = false;
    this.root.add(im);
    this.dryYerba = im;
    this.flareGlow = this.glowSprite(0xff6a1a, 2.2);
    this.flareGlow.visible = false;
    this.root.add(this.flareGlow);
    this.dryLight = new THREE.PointLight(0xff7a2a, 0, 9, 1.6);
    this.dryLight.position.copy(w.mouth).setY(0.7);
    // (no cuenta como luz mientras está apagada: World.adoptLight)
    this.root.add(this.g.world.adoptLight(this.dryLight));
    this.deck = { x0, z0, x1, z1, y, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
    this.deckPos = new THREE.Vector3(this.deck.cx, y + 1, this.deck.cz);
    this.mouthPos = new THREE.Vector3(w.mouth.x, 1, w.mouth.z + 0.4);
    this.embers = w.embers;
  }

  // La piedra del medio del prado, donde se deja la yerba.
  buildPradoAltar() {
    const M = this.M;
    const [x, z] = EE.altar.pos;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.add(mesh(boxGeo(1.3, 0.8, 0.8), M.stone, 0, 0.4, 0, 0, 0.3, 0));
    g.add(mesh(boxGeo(1.45, 0.08, 0.95), M.stoneDark, 0, 0.84, 0, 0, 0.3, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(cylGeo(0.025, 0.025, 0.2, 6), M.candle, Math.cos(i * 1.6) * 0.5, 0.98, Math.sin(i * 1.6) * 0.3));
    this.root.add(g);
    this.g.world.addBox([x - 0.75, 0, z - 0.55, x + 0.75, 0.9, z + 0.55], { kind: 'prop' });
    this.altarPack = this.packObj.clone();
    this.altarPack.position.set(x, 0.88, z);
    this.altarPack.visible = false;
    this.root.add(this.altarPack);
    this.altarPos = new THREE.Vector3(x, 1, z);
  }

  // La luz que baja del cielo sobre lo que hay que hacer (la voz guía).
  buildBeam() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.1, 60, 16, 1, true), mat);
    this.beam.visible = false;
    this.root.add(this.beam);
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    for (const a of Object.values(this.altars)) {
      const id = a.def.id;
      I.add({
        kind: 'ee',
        pos: a.pos,
        radius: 2.2,
        prompt: () => {
          const st = this.pieces[id];
          if (st === 'taken') return null;
          if (!g.world.power) return { text: 'Hay algo en la piedra... sin luz no se anima nadie a tocarlo', noCost: true, info: true };
          if (st === 'ready') return { text: `agarrar ${a.def.name} de la hoz`, noCost: true };
          if (st === 'ritual') return { text: `Ritual ${RITUAL_NAME[a.def.kind]}: ${this.ritual?.souls || 0} de ${this.ritual?.need || '?'} almas`, noCost: true, info: true };
          if (this.ritual) return { text: 'Hay otro ritual en marcha', noCost: true, info: true };
          const miss = missingIn(g, a.def.zone);
          if (miss.length) return { text: missingText(miss, 'el círculo'), noCost: true, info: true };
          return { text: `empezar el ritual ${RITUAL_NAME[a.def.kind]} (${a.def.name})`, noCost: true };
        },
        cost: () => 0,
        use: () => {
          const st = this.pieces[id];
          if (!g.world.power) return false;
          if (st === 'ready') {
            this.takePiece(id);
            return true;
          }
          if (st !== 'idle' || this.ritual || missingIn(g, a.def.zone).length) return false;
          this.startRitual(id);
          return true;
        },
      });
    }
    // la morsa: armar (lo decide el anfitrión) y agarrar la tuya (cada uno)
    I.add({
      kind: 'ee',
      pos: this.benchPos,
      radius: 2.2,
      prompt: () => {
        if (this.hozBuilt) return null;
        const got = Object.values(this.pieces).filter((s) => s === 'taken').length;
        if (!got) return null;
        if (got < 3) return { text: `La morsa: faltan ${3 - got} ${3 - got === 1 ? 'pedazo' : 'pedazos'} de la hoz`, noCost: true, info: true };
        return { text: 'armar la hoz en la morsa', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.hozBuilt || !Object.values(this.pieces).every((s) => s === 'taken')) return false;
        this.buildHoz();
        return true;
      },
    });
    I.add({
      kind: 'hozbench',
      local: true,
      pos: this.benchPos,
      radius: 2.2,
      prompt: () => (this.hozBuilt && !g.weapons.has('hoz') && g.weapons.slot?.id !== 'hoz' && g.interact.pap?.entry?.id !== 'hoz' ? { text: 'agarrar tu hoz', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.hozBuilt || g.weapons.has('hoz')) return false;
        // (después de la forja sale ya convertida)
        g.weapons.give('hoz', this.papDone ? 1 : 0);
        g.audio.powerupGrab();
        if (!this.papDone) g.hud.subtitle('La hoz: clic izquierdo para cortar.', 4);
        return true;
      },
    });
    for (const c of this.candles || []) {
      I.add({
        kind: 'ee',
        hold: true,
        holdTime: 1.1,
        local: true,
        pos: new THREE.Vector3(c.x, c.y + 0.6, c.z),
        radius: 1.8,
        prompt: () => (this.ritual?.kind === 'velas' && !c.lit && !this.ritual.relightT ? { text: 'prender el velón', hold: true, noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (this.ritual?.kind !== 'velas' || c.lit) return false;
          // de invitado se le pide al anfitrión (como cebar las torres)
          if (g.net?.guest) {
            g.net.net.send({ t: 'pee', a: 'vela', i: c.i });
            return true;
          }
          return this.fixVela(c.i);
        },
      });
    }
    for (const p of this.plants) {
      I.add({
        kind: 'ee',
        pos: new THREE.Vector3(p.pos.x, 1, p.pos.z),
        radius: 2.4,
        prompt: () => {
          if (!this.papDone || !this.needed(p)) return null;
          if (this.defense.harvestLock()) return { text: 'Primero, la defensa del yerbal', noCost: true, info: true };
          if (this.defense.down(p.i)) return { text: `La rompieron: está volviendo a crecer (${this.defense.plots[p.i].regrow} ${this.defense.plots[p.i].regrow === 1 ? 'ronda' : 'rondas'})`, noCost: true, info: true };
          const s = g.weapons.slot;
          if (s?.id === 'hoz' && s.up) return { text: 'Cortala con la Hoz de la Muerte (clic izquierdo)', noCost: true, info: true };
          return { text: 'Esta planta se corta con la Hoz de la Muerte', noCost: true, info: true };
        },
        cost: () => 1,
        use: () => false,
      });
    }
    if (this.deck) {
      // arriba: tender la yerba en el catre
      I.add({
        kind: 'ee',
        pos: this.deckPos,
        radius: 3.2,
        prompt: () => {
          if (!this.harvestDone() || this.dryState === 'done') return null;
          if (this.dryState === 'off') return { text: 'tender la yerba en el barbacuá', noCost: true };
          if (this.dryState === 'spread') return { text: 'La yerba está tendida: el fuego se prende en la boca de abajo', noCost: true, info: true };
          return { text: `Secando la yerba: ${Math.round(this.dry * 100)}% (quedate arriba dándola vuelta)`, noCost: true, info: true };
        },
        cost: () => 0,
        use: () => {
          if (!this.harvestDone() || this.dryState !== 'off') return false;
          this.spreadYerba();
          return true;
        },
      });
      // abajo: prender el fuego en la boca
      I.add({
        kind: 'ee',
        pos: this.mouthPos,
        radius: 1.9,
        prompt: () => {
          if (!this.harvestDone() || this.dryState === 'on' || this.dryState === 'done') return null;
          if (this.dryState === 'off') return { text: 'La boca del barbacuá: primero tiendan la yerba arriba', noCost: true, info: true };
          return { text: 'prender el fuego del barbacuá', noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (this.dryState !== 'spread') return false;
          this.lightFire();
          return true;
        },
      });
      // la llamarada: se apaga manteniendo F
      I.add({
        kind: 'ee',
        hold: true,
        pos: this.flarePos,
        radius: 1.7,
        prompt: () => (this.flare ? { text: 'apagar la llamarada', hold: true, noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (!this.flare) return false;
          this.beatFlare();
          return true;
        },
      });
    }
    I.add({
      kind: 'ee',
      hold: true,
      pos: this.millPos,
      radius: 2.3,
      prompt: () => {
        if (this.milled || this.dryState !== 'done') return null;
        return { text: `mover la atahona (${Math.round(this.mill * 100)}%)`, hold: true, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.milled || this.dryState !== 'done') return false;
        this.turnMill();
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.packPos,
      radius: 2.1,
      prompt: () => (this.milled && !this.packed ? { text: 'empaquetar la yerba', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.milled || this.packed) return false;
        this.pack();
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.altarPos,
      radius: 2.4,
      prompt: () => (this.packed && !this.fight ? { text: 'dejar la yerba en la piedra', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.packed || this.fight) return false;
        this.offer();
        return true;
      },
    });
  }

  // ---------------- pasos ----------------
  voice(text, delay = 0) {
    const g = this.g;
    if (g.net?.guest) return;
    const say = () => {
      g.say('entidad', text, 'entidad');
      this.voiceT = 70;
    };
    if (delay) g.later(delay, say);
    else say();
  }

  announce(text, secs = 3, sting = false) {
    const g = this.g;
    // (texto vacío: solo el sting. El usuario, 2026-10-08, sacó los avisos de
    // lo que se ve o ya dice la guía)
    if (text) g.hud.subtitle(text, secs);
    if (sting) g.audio.sting();
    g.net?.event('sub', { x: text, d: secs, s: sting ? 1 : 0 });
  }

  toastAll(text) {
    const g = this.g;
    g.hud.toast(text);
    g.audio.sting();
    g.net?.event('toast', { x: text });
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  startRitual(id) {
    const def = EE.rituals.find((r) => r.id === id);
    this.pieces[id] = 'ritual';
    const y = this.g.world.floorAt(def.pos[0], def.pos[1]);
    const R = { id, kind: def.kind, souls: 0, need: def.need + 6 * (this.players() - 1), pos: new THREE.Vector3(def.pos[0], y, def.pos[1]), r: def.r, spawnT: 1.5, level: EE.rituals.indexOf(def), up: !!def.up, zone: def.zone };
    this.ritual = R;
    if (R.kind === 'velas') for (const c of this.candles) c.lit = true;
    if (R.kind === 'luz') {
      R.spot = 0;
      R.next = -1;
      R.moveT = def.every;
      R.r = def.spotR;
      this.placeLuz(R);
    }
    this.announce('', 5, true);
    this.voice(VOICE.ritual, 0.5);
    this.voice(VOICE[R.kind], 6);
    this.g.audio.bossArrive();
    this.netSync();
  }

  // El Pack-a-Pava recibió la primera hoz: la forja. Avanza mientras haya
  // alguien adentro del círculo; a mitad de camino llega el Cuervo.
  startPapRitual(by) {
    if (this.papRitual !== 'off') return;
    const P = EE.papRitual;
    this.papRitual = 'on';
    this.papBy = by;
    this.ritual = { id: 'pap', kind: 'forja', prog: 0, souls: 0, need: 0, pos: new THREE.Vector3(P.pos[0], 0, P.pos[1]), r: P.r, spawnT: 1.5, level: 3, crowSent: false, idleT: 4, syncT: 0 };
    this.announce('', 5, true);
    this.voice(VOICE.pap, 0.5);
    this.g.audio.bossArrive();
    this.netSync();
  }

  // El círculo del Mango en el lugar de ahora (y el que avisa adónde va).
  placeLuz(R) {
    const def = EE.rituals.find((r) => r.id === R.id);
    const w = this.g.world;
    const [x, z] = def.spots[R.spot];
    R.pos.set(x, w.floorAt(x, z), z);
    this.luzRing.group.position.copy(R.pos);
    if (R.next >= 0) {
      const [nx, nz] = def.spots[R.next];
      this.luzNext.group.position.set(nx, w.floorAt(nx, nz), nz);
    }
  }

  // Todos o alguno adentro del círculo (de pie).
  someoneInside(R) {
    const g = this.g;
    const inside = (p) => Math.hypot(p.pos.x - R.pos.x, p.pos.z - R.pos.z) < R.r && Math.abs((p.pos.y || 0) - R.pos.y) < 1.6;
    if (g.player.canBeHit() && inside(g.player)) return true;
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && inside(r)) return true;
    return false;
  }

  // ¿Hay algo que los muertos o el Cuervo tengan que ir a buscar? (g.defense.active)
  luring() {
    const R = this.ritual;
    return R?.kind === 'velas' || (R?.kind === 'forja' && R.crowSent);
  }

  finishRitual() {
    const g = this.g;
    const R = this.ritual;
    this.ritual = null;
    this.clearWisps();
    if (R.id === 'pap') {
      this.papRitual = 'done';
      this.toastAll('Conseguiste: Hoz de la Muerte');
      g.hud.achievement('La Hoz de la Muerte', 'La hoja tomó sangre en el Pack-a-Pava');
      // la hoz de un invitado vuelve a sus manos
      if (g.net?.host && this.papBy != null && this.papBy !== g.net.id) g.net.net.to(this.papBy, { t: 'hozup' });
      this.forgeAll();
      // la cosecha: si todavía no hubo defensa del yerbal, viene ahora (después
      // de la voz) y no se corta nada hasta que termine (defense.harvestLock)
      const wait = this.defense.expectEarly();
      this.voice(wait ? VOICE.papWait : VOICE.papDone, 1);
      if (!g.net?.guest) g.later(6, () => this.defense.forceEarly());
    } else {
      this.pieces[R.id] = 'ready';
      g.fx.sparkle(this.altars[R.id].pos, [1, 0.6, 0.3], 30, 0.5);
      this.announce('', 3.5, true);
    }
    g.zombies.setEyeColor(0xffc23a);
    this.netSync();
  }

  takePiece(id) {
    this.pieces[id] = 'taken';
    this.toastAll(`Conseguiste: ${PIECE_NAMES[id]}`);
    this.netSync();
    const all = Object.values(this.pieces).every((s) => s === 'taken');
    this.voice(all ? VOICE.pieces : VOICE.piece, 1);
  }

  buildHoz() {
    const g = this.g;
    this.hozBuilt = true;
    g.audio.boardRepair(this.benchPos);
    g.fx.sparks(this.benchPos, 3, { x: 0, y: 1, z: 0 });
    this.toastAll('La hoz está armada: cada uno agarre la suya en la morsa');
    this.voice(VOICE.built, 1);
    this.netSync();
  }

  // ---------------- la hoja toma sangre ----------------
  // Un muerto cayó por la hoz (anfitrión): la hoja se va tiñendo.
  addBlood(z) {
    const g = this.g;
    this.blood++;
    g.fx.blood(tmpV.set(z.pos.x, (z.baseY || 0) + 1.2, z.pos.z), { x: 0, y: 1, z: 0 }, 16, 1.4);
    if (this.blood >= this.bloodNeed) {
      this.bloodOk = true;
      this.toastAll('La hoja tomó sangre');
      this.voice(VOICE.blood, 1);
    }
    this.netSync();
  }

  // La hoja de la hoz en la mano se va manchando de sangre: manchas que
  // crecen (un umbral sobre un ruido de manchones) hasta cubrirla.
  showBlood() {
    const m = this.g.weapons.model;
    if (!m?.hoz || m.upgraded) return;
    if (m !== this.bloodModel) {
      this.bloodModel = m;
      this.bloodMat ||= new THREE.MeshStandardMaterial({ color: 0x4a0303, roughness: 0.3, metalness: 0.1, alphaMap: bloodTexture(), alphaTest: 0.97, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const blade = m.hoz.blade.children[0];
      m.hoz.blade.add(new THREE.Mesh(blade.geometry, this.bloodMat));
    }
    // (sin sangre el umbral descarta todo, pero la malla se dibuja igual: así su
    // shader se compila al agarrar la hoz y no en el primer tajo de la pelea)
    const k = this.bloodOk || this.papDone ? 1 : Math.min(1, this.blood / this.bloodNeed);
    this.bloodMat.alphaTest = 0.97 - k * 0.9;
  }

  // ---------------- los velones (ritual de la Hoja) ----------------
  // Adónde va un muerto en el ritual de las velas: dos de cada cinco van a
  // apagar un velón (salvo que tengan a alguien cerca).
  velaGoal(z, target, distP) {
    const R = this.ritual;
    if (R?.kind !== 'velas' || R.relightT || z.dog || z.boss || z.id % 5 > 1) return null;
    if (target && distP < 4 && Math.abs((target.pos.y || 0) - (z.baseY || 0)) < 1.6) return null;
    let best = null;
    let bs = Infinity;
    for (const c of this.candles) {
      if (!c.lit) continue;
      // se reparten entre los velones
      const s = Math.hypot(c.x - z.pos.x, c.z - z.pos.z) + ((c.i + z.id) % 4) * 2;
      if (s < bs) {
        bs = s;
        best = c;
      }
    }
    if (!best) return null;
    if (!best.nav) {
      best.nav = new Navigation(this.g.world);
      best.nav.update(best.x, best.z, true);
    }
    const G = this.velaG;
    G.vela = best.i;
    G.x = best.x;
    G.z = best.z;
    G.d = Math.hypot(best.x - z.pos.x, best.z - z.pos.z) - 0.4;
    G.nav = best.nav;
    return G;
  }

  // Un muerto llegó al velón y lo apagó (anfitrión).
  velaHit(G) {
    const R = this.ritual;
    const c = this.candles[G.vela];
    if (R?.kind !== 'velas' || !c?.lit) return;
    c.lit = false;
    this.velaFx(c);
    if (!this.candles.some((x) => x.lit)) {
      // los cuatro apagados: se va la mitad y la Entidad los vuelve a prender
      R.souls = Math.floor(R.souls / 2);
      R.relightT = 2.5;
      this.announce(`Se apagaron los cuatro velones: se escapó la mitad de las almas (${R.souls} de ${R.need}).`, 4, true);
      this.voice(VOICE.velasOut, 0.5);
    } else if (!R.saidVela) {
      R.saidVela = true;
    }
    this.netSync();
  }

  velaFx(c) {
    const g = this.g;
    g.fx.steam(tmpV.set(c.x, c.y + 0.85, c.z), 4, 0.15);
    g.fx.sparks(tmpV.set(c.x, c.y + 0.8, c.z), 0.4, { x: 0, y: 1, z: 0 }, [1, 0.6, 0.2]);
  }

  // Volver a prender un velón (anfitrión; lo pide cualquiera).
  fixVela(i) {
    const g = this.g;
    const c = this.candles?.[i];
    if (this.ritual?.kind !== 'velas' || !c || c.lit) return false;
    c.lit = true;
    g.fx.flash(tmpV.set(c.x, c.y + 0.9, c.z), 0xffa040, 3, 0.2, 5);
    g.fx.sparkle(tmpV.set(c.x, c.y + 0.85, c.z), [1, 0.7, 0.3], 6, 0.2);
    this.netSync();
    return true;
  }

  updateVelas(R, dt) {
    if (!R.relightT) return;
    R.relightT = Math.max(0, R.relightT - dt);
    if (R.relightT > 0) return;
    for (const c of this.candles) this.fixVela(c.i);
  }

  // ---------------- el círculo que se muda (ritual del Mango) ----------------
  updateLuz(R, dt) {
    const def = EE.rituals.find((r) => r.id === R.id);
    R.moveT -= dt;
    if (R.moveT <= 3 && R.next < 0) {
      R.next = (R.spot + 1 + Math.floor(Math.random() * (def.spots.length - 1))) % def.spots.length;
      this.placeLuz(R);
      this.netSync();
    }
    if (R.moveT <= 0 && R.next >= 0) {
      R.spot = R.next;
      R.next = -1;
      R.moveT = def.every;
      this.placeLuz(R);
      this.g.audio.whoosh(R.pos);
      this.netSync();
    }
  }

  // ---------------- las almas sueltas (ritual de la Virola) ----------------
  // Un muerto cayó en el pajar: deja el alma flotando (anfitrión).
  dropWisp(z) {
    const g = this.g;
    const id = ++this.wispId;
    const y = (z.baseY || 0) + 1.1;
    this.spawnWisp(id, z.pos.x, y, z.pos.z);
    g.net?.event('ee', { wisp: [id, +z.pos.x.toFixed(2), +y.toFixed(2), +z.pos.z.toFixed(2)] });
  }

  spawnWisp(id, x, y, z) {
    const s = this.glowSprite(0xbff5ff, 0.9);
    s.position.set(x, y, z);
    this.root.add(s);
    this.wisps.push({ id, s, x, y, z, t: WISP_LIFE });
  }

  removeWisp(w) {
    w.s.removeFromParent();
    w.s.material.dispose();
    this.wisps.splice(this.wisps.indexOf(w), 1);
  }

  clearWisps() {
    while (this.wisps.length) this.removeWisp(this.wisps[0]);
  }

  updateWisps(dt) {
    const g = this.g;
    const R = this.ritual;
    const host = !g.net?.guest;
    const near = (p, w) => Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < WISP_R && Math.abs((p.pos.y || 0) + 1.1 - w.y) < 1.8;
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.t -= dt;
      w.s.position.y = w.y + Math.sin(g.time * 3 + w.id) * 0.12;
      w.s.material.opacity = Math.min(1, w.t / 1.5) * (0.75 + Math.sin(g.time * 8 + w.id) * 0.15);
      if (Math.random() < dt * 8) g.fx.sparkle(w.s.position, [0.6, 1, 1], 1, 0.2);
      if (w.t <= 0) {
        this.removeWisp(w);
        continue;
      }
      if (!host || R?.kind !== 'almas') continue;
      let got = g.player.canBeHit() && near(g.player, w);
      if (!got && g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && near(r, w)) got = true;
      if (!got) continue;
      const to = this.altars[R.id].pos;
      g.fx.soul(w.s.position, to);
      g.net?.event('ee', { soul: [+w.x.toFixed(1), +w.z.toFixed(1), +w.y.toFixed(1)], to: R.id, wo: w.id });
      this.removeWisp(w);
      R.souls++;
      if (R.souls >= R.need) {
        this.finishRitual();
        return;
      }
      if (R.souls % 3 === 0) this.netSync();
    }
  }

  // ---------------- la forja y el Cuervo ----------------
  updateForge(R, dt) {
    const P = EE.papRitual;
    if (this.someoneInside(R)) R.prog = Math.min(1, R.prog + dt / P.secs);
    else {
      R.idleT -= dt;
      if (R.idleT <= 0) {
        R.idleT = 8;
        this.announce('Nadie cuida el Pack-a-Pava: la forja se frena. Volvé adentro del círculo.', 3);
      }
    }
    if (!R.crowSent && R.prog >= P.crowAt) {
      R.crowSent = true;
      this.callCrow();
    }
    R.syncT -= dt;
    if (R.syncT <= 0) {
      R.syncT = 0.5;
      this.netSync();
    }
    if (R.prog >= 1) this.finishRitual();
  }

  // Llega el Cuervo a llevarse la hoz (con menos vida que en su ronda).
  callCrow() {
    const g = this.g;
    const c = g.crow;
    if (c && !c.z.active && c.spawn(Math.max(1, g.rounds.round))) {
      c.z.maxHp *= FORGE_CROW_HP;
      c.z.hp = c.z.maxHp;
    }
    this.announce('', 5, true);
    this.voice(VOICE.crow, 2.5);
  }

  // Adónde se tira el Cuervo en la forja: al lomo del techo, arriba de la máquina.
  roofPlot() {
    const R = this.ritual;
    return R?.kind === 'forja' && R.crowSent ? this.roof : null;
  }

  roofHit() {
    const R = this.ritual;
    if (R?.kind !== 'forja') return;
    const g = this.g;
    R.prog = Math.max(0, R.prog - FORGE_HIT);
    g.audio.boardTear(tmpV.set(this.roof.x, this.roof.y, this.roof.z));
    this.announce('', 3.5, !R.saidRoof);
    R.saidRoof = true;
    this.netSync();
  }

  roofPeck(dt) {
    const R = this.ritual;
    if (R?.kind !== 'forja') return;
    const g = this.g;
    R.prog = Math.max(0, R.prog - dt * FORGE_PECK);
    R.peckT = (R.peckT || 0) - dt;
    if (R.peckT <= 0) {
      R.peckT = 0.45;
      const p = tmpV.set(this.roof.x + (Math.random() - 0.5) * 0.8, this.roof.y + 0.1, this.roof.z + (Math.random() - 0.5) * 0.8);
      g.fx.sparks(p, 0.6, { x: 0, y: 1, z: 0 }, [1, 0.85, 0.6]);
      g.audio.boardTear(p);
    }
  }

  // Cortar una planta con la Hoz de la Muerte (lo pide cualquiera; decide el anfitrión).
  onScythe(pos, fwd, st, crescent = false) {
    const g = this.g;
    // durante la defensa del yerbal (o con la del paso de la cosecha por venir) no se corta
    if (this.papDone && this.defense.harvestLock()) {
      if ((this.lockSaidT || 0) > g.time) return;
      if (this.plants.some((p) => this.needed(p) && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 2.9)) {
        this.lockSaidT = g.time + 6;
        g.hud.subtitle('Primero, la defensa del yerbal.', 2.5);
      }
      return;
    }
    if (!this.papDone || !st?.upgraded) {
      if (!this.papDone || this.saidNotYet) return;
      // con la hoz común no corta: una vez se avisa
      for (const p of this.plants) {
        if (!this.harvested[p.i] && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 2.6) {
          this.saidNotYet = true;
          g.hud.subtitle('Con la hoz común no se corta: primero convertila en el Pack-a-Pava.', 3);
          break;
        }
      }
      return;
    }
    for (const p of this.plants) {
      if (!this.needed(p) || this.defense.down(p.i)) continue;
      const dx = p.pos.x - pos.x;
      const dz = p.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (crescent ? d > 1.4 : d > 2.9) continue;
      if (!crescent && d > 0.6 && (dx * fwd.x + dz * fwd.z) / d < 0.2) continue;
      if (g.net?.guest) {
        if ((this.askT?.[p.i] || 0) > g.time) continue;
        this.askT ||= {};
        this.askT[p.i] = g.time + 1;
        g.net.net.send({ t: 'harvest', i: p.i });
      } else this.harvest(p.i);
    }
  }

  harvest(i) {
    const g = this.g;
    const p = this.plants[i];
    if (!this.papDone || !p || !this.needed(p) || this.defense.down(i) || this.defense.harvestLock()) return;
    const hadTablones = this.cutTablones() >= this.needTablones;
    this.harvested[i] = true;
    this.cutFx(i);
    g.net?.event('ee', { cut: i });
    const [n, of] = this.harvestCount();
    this.toastAll(`Yerba cosechada: ${n} de ${of}`);
    // cortarla despierta a los de abajo
    const round = Math.max(3, g.rounds.round);
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2;
      const at = new THREE.Vector3(p.pos.x + Math.cos(a) * 3, 0, p.pos.z + Math.sin(a) * 3);
      if (!g.nav.blocked(Math.floor(at.x), Math.floor(at.z))) g.later(0.6 + k * 0.5, () => g.zombies.spawn(round, zombieHealth(round), at));
    }
    if (this.harvestDone()) this.voice(VOICE.harvest, 1.5);
    // las de los tablones ya están: la voz manda al matorral
    else if (!hadTablones && this.cutTablones() >= this.needTablones) this.voice(VOICE.madre, 1.5);
    this.netSync();
    // la Yerba Madre: cortarla prende el matorral (entities/Matorral.js)
    if (p.madre) g.matorral?.ignite();
  }

  cutFx(i) {
    const g = this.g;
    const p = this.plants[i];
    for (const l of p.leaves) l.visible = false;
    if (p.fl) p.fl.visible = false;
    p.stump.visible = true;
    p.glow.visible = false;
    g.fx.yerbaPuff?.(p.pos);
    g.fx.sparkle(tmpV.set(p.pos.x, 1, p.pos.z), [0.4, 1, 0.6], 20, 0.6);
    g.audio.knife(true);
  }

  // ---------------- el barbacuá ----------------
  spreadYerba() {
    this.dryState = 'spread';
    this.g.audio.boardRepair(this.deckPos);
    this.voice(VOICE.spread, 0.8);
    this.netSync();
  }

  lightFire() {
    const g = this.g;
    this.dryState = 'on';
    this.dry = 0;
    this.flareT = 7;
    this.dryR = { spawnT: 2, level: 4 };
    g.fx.fire(tmpV.copy(this.mouthPos).setY(0.4), 1.2, 6);
    g.audio.bossArrive();
    this.announce('', 4.5, true);
    this.voice(VOICE.lit, 1);
    this.netSync();
  }

  // Alguien está arriba, en el catre (el que la da vuelta).
  onDeck(p) {
    const D = this.deck;
    return p.pos.x > D.x0 && p.pos.x < D.x1 && p.pos.z > D.z0 && p.pos.z < D.z1 && (p.pos.y || 0) > D.y - 0.6;
  }

  someoneOnDeck() {
    const g = this.g;
    if (g.player.canBeHit() && this.onDeck(g.player)) return true;
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && this.onDeck(r)) return true;
    return false;
  }

  // Sale una llamarada en algún lugar del catre.
  startFlare() {
    const D = this.deck;
    const x = D.x0 + 0.8 + Math.random() * (D.x1 - D.x0 - 1.6);
    const z = D.z0 + 0.8 + Math.random() * (D.z1 - D.z0 - 1.6);
    this.flare = { t: 8, hp: 1 };
    this.flarePos.set(x, D.y + 0.6, z);
    this.g.audio.fireWhoosh?.(this.flarePos);
    this.netSync();
  }

  beatFlare() {
    const g = this.g;
    this.flare.hp -= 0.3;
    g.fx.dust(tmpV.copy(this.flarePos), { x: 0, y: 1, z: 0 }, [0.25, 0.22, 0.2], 6);
    if (this.flare.hp <= 0) {
      this.flare = null;
      g.audio.boardRepair(this.flarePos);
      this.netSync();
    }
  }

  // Lo maneja el anfitrión mientras se seca: avanza con alguien arriba, las
  // llamaradas que no se apagan la queman un poco y los muertos van llegando.
  updateDry(dt) {
    const g = this.g;
    if (this.someoneOnDeck()) this.dry = Math.min(1, this.dry + dt / EE.barbacua.secs);
    if (this.flare) {
      this.flare.t -= dt;
      if (this.flare.t <= 0) {
        this.flare = null;
        this.dry = Math.max(0, this.dry - 0.15);
        g.fx.fire(tmpV.copy(this.flarePos), 1.4, 8);
        this.announce('Se quemó un poco de yerba.', 2.5);
        this.flareT = 9 + Math.random() * 4;
        this.netSync();
      }
    } else {
      this.flareT -= dt;
      if (this.flareT <= 0 && this.dry < 0.95) {
        this.flareT = 9 + Math.random() * 4;
        this.startFlare();
      }
    }
    // los muertos se acercan a la escalera
    const R = this.dryR;
    R.spawnT -= dt;
    if (R.spawnT <= 0) {
      R.spawnT = 2 / Math.sqrt(this.players());
      if (g.zombies.alive < maxAlive(this.players())) {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 6 + Math.random() * 4;
          const x = this.deck.cx + Math.cos(a) * d;
          const z = this.deck.cz + Math.sin(a) * d;
          if (g.world.zoneAt(x, z) !== 'T' || g.nav.blocked(Math.floor(x), Math.floor(z)) || !Number.isFinite(g.nav.distAt(x, z))) continue;
          const round = Math.max(3 + R.level, g.rounds.round);
          g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, 0, z));
          break;
        }
      }
    }
    if (this.dry >= 1) {
      this.dryState = 'done';
      this.flare = null;
      this.toastAll('Conseguiste: Yerba sapecada');
      this.voice(VOICE.dried, 1);
      this.netSync();
      return;
    }
    this.drySyncT = (this.drySyncT || 0) - dt;
    if (this.drySyncT <= 0) {
      this.drySyncT = 1;
      this.netSync();
    }
  }

  // Lo que se ve del barbacuá (en todos): la yerba, el fuego y el humo.
  showDry(dt) {
    if (!this.deck) return;
    const g = this.g;
    const on = this.dryState === 'on';
    this.dryYerba.visible = this.dryState === 'spread' || on;
    // de verde a sapecada
    this.dryMat.color.copy(DRY_GREEN).lerp(DRY_BROWN, this.dry);
    const fl = on ? 0.8 + Math.sin(g.time * 13) * 0.12 + Math.random() * 0.1 : 0;
    this.embers.material.opacity = fl;
    this.dryLight.intensity = fl * 26;
    if (on) {
      if (Math.random() < dt * 8) g.fx.fire(tmpV.copy(this.mouthPos).setY(0.35), 0.5, 1);
      // humo que sube entre las tacuaras
      if (Math.random() < dt * 14) {
        const D = this.deck;
        g.fx.alpha.spawn(D.x0 + 0.3 + Math.random() * (D.x1 - D.x0 - 0.6), D.y + 0.1, D.z0 + 0.3 + Math.random() * (D.z1 - D.z0 - 0.6), 0, 0.7, 0, { color: [0.32, 0.3, 0.28], size: 0.5, life: 3, alpha: 0.25, gravity: -0.05, drag: 0.4 });
      }
    }
    this.flareGlow.visible = !!this.flare;
    if (this.flare) {
      const p = this.flarePos;
      this.flareGlow.position.set(p.x, p.y - 0.2, p.z);
      this.flareGlow.material.opacity = 0.6 + Math.sin(g.time * 17) * 0.15 + Math.random() * 0.15;
      if (Math.random() < dt * 30) g.fx.fire(tmpV.set(p.x + (Math.random() - 0.5) * 0.9, p.y - 0.5, p.z + (Math.random() - 0.5) * 0.9), 1, 2);
    }
  }

  turnMill() {
    const g = this.g;
    this.mill = Math.min(1, this.mill + 0.09);
    g.audio.mech(g.audio.now, [0, 0.1]);
    if (this.mill >= 1 && !this.milled) {
      this.milled = true;
      this.toastAll('Conseguiste: Yerba molida');
      this.voice(VOICE.milled, 1);
    }
    this.netSync();
  }

  pack() {
    const g = this.g;
    this.packed = true;
    g.audio.purchase();
    this.toastAll('Conseguiste: Paquete de yerba "La Tapera"');
    this.voice(VOICE.packed, 1);
    // se abre el maizal hacia el prado
    g.later(3, () => this.openPrado());
    this.netSync();
  }

  openPrado() {
    const g = this.g;
    const it = g.interact.list.find((x) => x.kind === 'door' && x.door.def.kind === 'corn');
    if (it && !it.door.open) {
      g.interact.openDoor(it.door);
      g.fx.addShake(0.3);
      this.announce('', 4, true);
    }
  }

  offer() {
    const g = this.g;
    this.fight = true;
    this.altarPack.visible = true;
    this.voice(VOICE.offer);
    this.netSync();
    g.later(4, () => g.arena.start());
  }

  // Un invitado metió su hoz en la máquina (se la llevó el Pack-a-Pava).
  papGiven() {
    this.g.weapons.drop('hoz');
  }

  // La forja terminó: la hoz de cada uno ya es la Hoz de la Muerte, en la mano
  // o guardada (la defensa del yerbal llega enseguida: no da tiempo a pasar
  // por la máquina). La que está adentro de la máquina vuelve con receiveHoz.
  forgeAll() {
    const W = this.g.weapons;
    const i = W.slots.findIndex((s) => s.id === 'hoz');
    if (i < 0 || W.slots[i].up) return;
    if (i === W.cur) W.give('hoz', 1);
    else W.slots[i].up = 1;
    this.g.audio.powerupGrab();
  }

  // El ritual terminó y la máquina te devuelve la Hoz de la Muerte.
  receiveHoz() {
    const g = this.g;
    g.weapons.give('hoz', 1);
    g.audio.powerupGrab();
  }

  // ---------------- ganchos del juego ----------------
  onPower() {
    this.started = this.g.time;
    this.voice(VOICE.intro, 3);
    this.voice(VOICE.hoz, 14);
  }

  onZone() {}

  onShot() {}

  onExplosion() {}

  dropHat() {}

  onKill(z, info) {
    const g = this.g;
    if (g.net?.guest) return;
    // la hoja toma sangre: cualquier muerto que caiga por la hoz
    if (this.hozBuilt && !this.bloodOk && info?.type === 'scythe' && !z.boss) this.addBlood(z);
    const R = this.ritual;
    if (!R) return;
    // en el pajar las almas quedan sueltas en todo el piso de arriba
    if (Math.hypot(z.pos.x - R.pos.x, z.pos.z - R.pos.z) > R.r + (R.kind === 'almas' ? 3 : 1.5)) return;
    // en el pajar: el de abajo no cuenta
    if (Math.abs((z.baseY || 0) - R.pos.y) > 1.6) return;
    if (R.kind === 'almas') {
      this.dropWisp(z);
      return;
    }
    // solo cuenta si hay alguien adentro del círculo
    if (!this.someoneInside(R)) return;
    const to = R.id === 'pap' ? g.interact.pap.slotPos : this.altars[R.id].pos;
    g.fx.soul(z.pos, to);
    g.net?.event('ee', { soul: [+z.pos.x.toFixed(1), +z.pos.z.toFixed(1)], to: R.id });
    // en la forja cada muerto la apura un poco
    if (R.kind === 'forja') {
      R.prog = Math.min(1, R.prog + FORGE_KILL);
      return;
    }
    R.souls++;
    if (R.souls >= R.need) this.finishRitual();
    else if (R.souls % 3 === 0) this.netSync();
  }

  // ---------------- red ----------------
  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  fullState() {
    const R = this.ritual;
    return {
      pieces: this.pieces,
      rit: R ? [R.id, R.souls, R.need, this.ritExtra(R)] : null,
      hoz: this.hozBuilt ? 1 : 0,
      blood: this.blood,
      bok: this.bloodOk ? 1 : 0,
      pap: this.papRitual,
      harv: this.harvested.map((x) => (x ? 1 : 0)),
      dry: [DRY.indexOf(this.dryState), +this.dry.toFixed(3), this.flare ? [+this.flarePos.x.toFixed(2), +this.flarePos.z.toFixed(2)] : 0],
      mill: +this.mill.toFixed(2),
      milled: this.milled ? 1 : 0,
      packed: this.packed ? 1 : 0,
      fight: this.fight ? 1 : 0,
      df: this.defense.state(),
    };
  }

  // Lo propio de cada ritual para los invitados: los velones prendidos (y si
  // la Entidad los está por prender), dónde está el círculo del Mango y
  // adónde va, o cuánto va de la forja y si ya llegó el Cuervo.
  ritExtra(R) {
    if (R.kind === 'velas') return this.candles.reduce((m, c) => m | (c.lit ? 1 << c.i : 0), 0) | (R.relightT ? 16 : 0);
    if (R.kind === 'luz') return [R.spot, R.next];
    if (R.kind === 'forja') return [Math.round(R.prog * 1000), R.crowSent ? 1 : 0];
    return 0;
  }

  applyRitExtra(R, x) {
    if (R.kind === 'velas') {
      for (const c of this.candles) {
        const lit = !!(x & (1 << c.i));
        if (c.lit && !lit) this.velaFx(c);
        c.lit = lit;
      }
      R.relightT = x & 16 ? 1 : 0;
    } else if (R.kind === 'luz' && x) {
      R.r = EE.rituals.find((r) => r.id === R.id).spotR;
      [R.spot, R.next] = x;
      this.placeLuz(R);
    } else if (R.kind === 'forja' && x) {
      R.prog = x[0] / 1000;
      R.crowSent = !!x[1];
    }
  }

  applyRemote(m) {
    const g = this.g;
    if (m.song) {
      this.song.applyRemote(m.song);
      return;
    }
    if (m.pieces) this.pieces = { ...m.pieces };
    if (m.rit !== undefined) {
      if (m.rit) {
        const [id, souls, need, x] = m.rit;
        const def = id === 'pap' ? EE.papRitual : EE.rituals.find((r) => r.id === id);
        const R = this.ritual?.id === id ? this.ritual : { id, kind: id === 'pap' ? 'forja' : def.kind, prog: 0, pos: new THREE.Vector3(def.pos[0], g.world.floorAt(def.pos[0], def.pos[1]), def.pos[1]), r: def.r };
        R.souls = souls;
        R.need = need;
        this.applyRitExtra(R, x);
        this.ritual = R;
      } else {
        this.ritual = null;
        this.clearWisps();
      }
    }
    if (m.hoz !== undefined) this.hozBuilt = !!m.hoz;
    if (m.blood !== undefined) this.blood = m.blood;
    if (m.bok !== undefined) this.bloodOk = !!m.bok;
    if (m.wisp) this.spawnWisp(...m.wisp);
    if (m.pap) {
      const was = this.papRitual;
      this.papRitual = m.pap;
      if (m.pap === 'done' && was !== 'done') this.forgeAll();
    }
    if (m.harv) m.harv.forEach((c, i) => {
      if (c && !this.harvested[i]) this.cutFx(i);
      this.harvested[i] = !!c;
    });
    if (m.cut != null && !this.harvested[m.cut]) {
      this.harvested[m.cut] = true;
      this.cutFx(m.cut);
    }
    if (m.dry) {
      this.dryState = DRY[m.dry[0]] || 'off';
      this.dry = m.dry[1];
      if (m.dry[2]) {
        this.flare ||= { t: 8, hp: 1 };
        this.flarePos.set(m.dry[2][0], (this.deck?.y || 0) + 0.6, m.dry[2][1]);
      } else this.flare = null;
    }
    if (m.mill !== undefined) this.mill = m.mill;
    if (m.milled !== undefined) this.milled = !!m.milled;
    if (m.packed !== undefined) this.packed = !!m.packed;
    if (m.fight !== undefined) this.fight = !!m.fight;
    // la defensa del yerbal: el estado, cada tiro de las torres y el premio
    if (m.df) this.defense.applyRemote(m.df);
    if (m.dfs) this.defense.remoteShot(m.dfs);
    if (m.dfr) this.defense.reward(m.dfr);
    if (m.soul) {
      const to = m.to === 'pap' ? g.interact.pap.slotPos : this.altars[m.to]?.pos;
      if (to) g.fx.soul(new THREE.Vector3(m.soul[0], m.soul[2] || 0, m.soul[1]), to);
      if (this.ritual && this.ritual.kind !== 'forja') this.ritual.souls++;
      const w = m.wo != null && this.wisps.find((x) => x.id === m.wo);
      if (w) this.removeWisp(w);
    }
  }

  // Alt+K (solo): la yerba ya empaquetada y el prado abierto.
  debugFinal() {
    const g = this.g;
    if (!g.world.power) g.turnOnPower();
    for (const k of Object.keys(this.pieces)) this.pieces[k] = 'taken';
    this.hozBuilt = true;
    this.blood = this.bloodNeed;
    this.bloodOk = true;
    this.papRitual = 'done';
    this.harvested = this.harvested.map(() => true);
    this.plants.forEach((p) => this.cutFx(p.i));
    this.dryState = 'done';
    this.dry = 1;
    this.flare = null;
    this.mill = 1;
    this.milled = true;
    this.packed = true;
    this.openPrado();
    if (!g.weapons.has('hoz')) g.weapons.give('hoz', 1);
    this.netSync();
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.song.update(dt);
    // se va haciendo de noche con cada paso (y la ronda de los caballos es de
    // noche, con luna roja: config/maps/granja.js SKY.states.dogs)
    g.world.setDaylight(g.weather?.name === 'dogs' ? 0 : 1 - this.progress / STEPS);
    // los pedazos en sus piedras
    for (const a of Object.values(this.altars)) {
      const st = this.pieces[a.def.id];
      a.piece.visible = st !== 'taken';
      a.glow.visible = st !== 'taken' && g.world.power;
      a.piece.rotation.y += dt * (st === 'ready' ? 2.5 : 0.8);
      a.piece.position.y = 1.35 + Math.sin(t * 2 + a.def.pos[0]) * 0.06 + (st === 'ready' ? 0.25 : 0);
      a.glow.material.color.setHex(st === 'ready' ? 0xffd27a : st === 'ritual' ? 0xff2a1a : 0xff6a3a);
      a.glow.material.opacity = (st === 'ritual' ? 0.9 : 0.55) + Math.sin(t * 4) * 0.15;
      // (el del Mango se muda: su círculo es luzRing)
      this.showRing(a.ring, st === 'ritual' && a.def.kind !== 'luz', dt);
    }
    this.showRing(this.papRing, this.papRitual === 'on', dt);
    const R0 = this.ritual;
    if (this.luzRing) {
      this.showRing(this.luzRing, R0?.kind === 'luz', dt);
      this.showRing(this.luzNext, R0?.kind === 'luz' && R0.next >= 0, dt);
      if (R0?.kind === 'luz' && R0.next >= 0 && Math.random() < dt * 12) {
        const p = this.luzNext.group.position;
        const a = Math.random() * Math.PI * 2;
        g.fx.sparkle(tmpV.set(p.x + Math.cos(a) * this.luzNext.r, p.y + 0.2 + Math.random(), p.z + Math.sin(a) * this.luzNext.r), [1, 0.9, 0.6], 1, 0.3);
      }
    }
    // los velones: prendidos solo en su ritual
    for (const c of this.candles || []) {
      const lit = R0?.kind === 'velas' && c.lit;
      c.flame.visible = lit;
      c.glow.visible = lit;
      if (lit) {
        const f = 1 + Math.sin(t * 13 + c.i * 2) * 0.12;
        c.flame.scale.set(f, 1 + Math.sin(t * 9 + c.i) * 0.2, f);
        c.glow.material.opacity = 0.55 + Math.sin(t * 7 + c.i) * 0.1;
      }
    }
    this.updateWisps(dt);
    this.showBlood();
    // la morsa: los pedazos que ya están y la hoz armada
    for (const [id, p] of Object.entries(this.benchPieces)) p.visible = !this.hozBuilt && this.pieces[id] === 'taken';
    this.benchHoz.visible = this.hozBuilt;
    // las plantas brillan cuando ya hay Hoz de la Muerte
    for (const p of this.plants) {
      const lit = this.papDone && this.needed(p) && !this.defense.down(p.i);
      p.glow.visible = lit;
      if (lit) {
        p.glow.material.opacity = 0.5 + Math.sin(t * 3 + p.i) * 0.25;
        for (const l of p.leaves) l.material = this.glowLeaf;
        if (Math.random() < dt * 4) g.fx.sparkle(tmpV.set(p.pos.x, 1 + Math.random() * 0.5, p.pos.z), [0.5, 1, 0.6], 1, 0.4);
      }
    }
    // la atahona gira mientras se muele
    this.millShown = (this.millShown || 0) + (this.mill - (this.millShown || 0)) * Math.min(1, dt * 3);
    this.millRot.rotation.y = this.millShown * Math.PI * 8;
    this.millYerba.visible = this.dryState === 'done' || this.mill > 0;
    // el barbacuá: se seca (lo maneja el anfitrión) y se ve en todos
    if (this.dryState === 'on' && !g.net?.guest) this.updateDry(dt);
    this.showDry(dt);
    this.packObj.visible = this.packed && !this.fight;
    this.altarPack.visible = this.fight;
    // el ritual en marcha (lo maneja el anfitrión)
    const R = this.ritual;
    if (R) {
      if (R.kind === 'forja') g.hud.setCraftText?.(`<span>Forja</span><b>${Math.floor(R.prog * 100)}%</b>`);
      else if (R.kind === 'velas') g.hud.setCraftText?.(`<span>Velones ${this.candles.filter((c) => c.lit).length}/4</span><b>${R.souls} / ${R.need}</b>`);
      else g.hud.setCraftText?.(`<span>${R.kind === 'almas' ? 'Almas' : 'Ritual'}</span><b>${R.souls} / ${R.need}</b>`);
      if (!g.net?.guest) {
        if (R.kind === 'velas') this.updateVelas(R, dt);
        else if (R.kind === 'luz') this.updateLuz(R, dt);
        else if (R.kind === 'forja') this.updateForge(R, dt);
      }
      // (la forja o los velones pueden haber terminado el ritual)
      if (this.ritual && !g.net?.guest) this.ritualSpawns(dt);
      if (Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2;
        g.fx.fire(tmpV.set(R.pos.x + Math.cos(a) * R.r, R.pos.y + 0.1, R.pos.z + Math.sin(a) * R.r), 0.3, 1);
      }
    } else if (this.dryState === 'on') g.hud.setCraftText?.(`<span>Barbacuá</span><b>${Math.round(this.dry * 100)}%</b>`);
    else if (this.hozBuilt && !this.bloodOk) g.hud.setCraftText?.(`<span>Sangre de la hoz</span><b>${this.blood} / ${this.bloodNeed}</b>`);
    else g.hud.setCraftText?.(null);
    // la defensa del yerbal: parcelas, torres y el cartel
    this.defense.update(dt);
    // la luz que baja del cielo sobre lo que sigue
    this.updateBeam();
    // inventario de la hoz
    if (g.world.power) {
      const it = {
        hoja: this.pieces.hoja === 'taken',
        mango: this.pieces.mango === 'taken',
        virola: this.pieces.virola === 'taken',
        hoz: this.hozBuilt,
        sangre: this.bloodOk && !this.papDone,
        muerte: this.papDone,
        yerba: this.harvestDone() && this.dryState !== 'done',
        seca: this.dryState === 'done' && !this.milled,
        molida: this.milled,
        paquete: this.packed,
      };
      const key = Object.values(it).map((x) => (x ? 1 : 0)).join('') + (this.fight ? 'f' : '');
      if (key !== this.invKey) {
        this.invKey = key;
        g.hud.setInventory(this.fight ? null : it, false, INV);
      }
    }
    // la voz habla apenas alguien entra al prado (no recién al dejar la yerba)
    if (this.packed && !this.fight && !this.pradoSaid && !g.net?.guest) {
      const A = EE.arena;
      const inside = (p) => Math.hypot(p.pos.x - A.x, p.pos.z - A.z) < A.r;
      let someone = g.player.alive && inside(g.player);
      if (g.net) for (const r of g.net.remote.values()) if (!r.dead && inside(r)) someone = true;
      if (someone) {
        this.pradoSaid = true;
        this.voiceT = 90;
        this.voice(VOICE.prado);
      }
    }
    // la voz vuelve a recordar lo que falta si pasa mucho sin avanzar
    if (g.world.power && !this.fight && !g.net?.guest) {
      this.voiceT -= dt;
      if (this.voiceT <= 0) {
        this.voiceT = 90;
        const step = this.nextStep();
        if (step === 4) {
          // (durante la defensa no; después, lo que falta: los tablones o la Madre)
          if (!this.defense.harvestLock()) this.voice(this.harvestWaiting() ? VOICE.regrow : this.cutTablones() >= this.needTablones ? VOICE.madre : VOICE.remind[4]);
        } else if (step >= 0) this.voice(VOICE.remind[step]);
      }
    }
  }

  showRing(ring, on, dt) {
    ring.k = (ring.k || 0) + ((on ? 1 : 0) - (ring.k || 0)) * Math.min(1, dt * 3);
    ring.ring.material.opacity = ring.k * (0.45 + Math.sin(this.g.time * 6) * 0.15);
    ring.ring.visible = ring.k > 0.01;
    ring.candles.visible = ring.k > 0.5;
  }

  // Muertos que salen alrededor del círculo mientras dura el ritual.
  ritualSpawns(dt) {
    const g = this.g;
    const R = this.ritual;
    R.spawnT -= dt;
    if (R.spawnT > 0) return;
    R.spawnT = Math.max(1.1, 2.4 - R.level * 0.3) / Math.sqrt(this.players());
    if (g.zombies.alive >= maxAlive(this.players())) return;
    // el del pajar: la mitad sale de entre la paja, arriba (lejos de los jugadores)
    if (R.up && Math.random() < 0.5) {
      const cells = this.zoneCells(R.zone);
      for (let i = 0; i < 8 && cells.length; i++) {
        const [cx, cz] = cells[Math.floor(Math.random() * cells.length)];
        const x = cx + 0.5;
        const z = cz + 0.5;
        if (g.nav.blocked(cx, cz) || this.nearPlayer(x, z, 2.5)) continue;
        const round = Math.max(3 + R.level, g.rounds.round);
        g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, g.world.floorAt(x, z), z));
        return;
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = R.r + 1.5 + Math.random() * 3;
      const x = R.pos.x + Math.cos(a) * d;
      const z = R.pos.z + Math.sin(a) * d;
      if (g.nav.blocked(Math.floor(x), Math.floor(z)) || !Number.isFinite(g.nav.distAt(x, z))) continue;
      const round = Math.max(3 + R.level, g.rounds.round);
      g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, 0, z));
      break;
    }
  }

  // Las celdas de una zona (el pajar), para que salgan de ahí.
  zoneCells(k) {
    this.cells ||= {};
    if (!this.cells[k]) {
      const w = this.g.world;
      const zi = w.zoneKeys.indexOf(k);
      const out = [];
      for (let i = 0; i < w.zone.length; i++) if (w.zone[i] === zi) out.push([i % w.W, Math.floor(i / w.W)]);
      this.cells[k] = out;
    }
    return this.cells[k];
  }

  nearPlayer(x, z, d) {
    const g = this.g;
    const near = (p) => Math.hypot(p.pos.x - x, p.pos.z - z) < d;
    if (near(g.player)) return true;
    if (g.net) for (const r of g.net.remote.values()) if (near(r)) return true;
    return false;
  }

  // Qué sigue (para la voz y la luz del cielo): -1 si no hay nada.
  nextStep() {
    if (!this.g.world.power) return -1;
    if (Object.values(this.pieces).some((s) => s !== 'taken')) return 0;
    if (!this.hozBuilt) return 1;
    if (!this.bloodOk && !this.papDone) return 2;
    if (!this.papDone) return 3;
    if (!this.harvestDone()) return 4;
    if (this.deck && this.dryState !== 'done') return 5;
    if (!this.milled) return 6;
    if (!this.packed) return 7;
    if (!this.fight) return 8;
    return -1;
  }

  updateBeam() {
    const g = this.g;
    const step = this.nextStep();
    let at = null;
    // (en el ritual del Mango, la luz va adonde se muda el círculo)
    if (this.ritual) at = this.ritual.next >= 0 ? this.luzNext.group.position : this.ritual.pos;
    else if (step === 0) {
      const next = EE.rituals.find((r) => this.pieces[r.id] === 'ready') || EE.rituals.find((r) => this.pieces[r.id] === 'idle');
      if (next) at = tmpV.set(next.pos[0], 0, next.pos[1]);
    } else if (step === 1) at = this.benchPos;
    else if (step === 3) at = g.interact.pap.slotPos;
    // (a la Yerba Madre no: dónde está es secreto, el usuario 2026-09-29)
    else if (step === 4) at = this.plants.find((p) => !p.madre && this.needed(p) && !this.defense.down(p.i))?.pos;
    else if (step === 5) at = this.flare ? this.flarePos : this.dryState === 'spread' ? this.mouthPos : this.deckPos;
    else if (step === 6) at = this.millPos;
    else if (step === 7) at = this.packPos;
    else if (step === 8) at = this.altarPos;
    const b = this.beam;
    b.visible = !!at;
    if (!at) return;
    b.position.set(at.x, 30, at.z);
    b.material.opacity = 0.05 + Math.sin(g.time * 1.5) * 0.02 + (this.ritual ? 0.03 : 0);
  }

  // Lo que pide un invitado ('pee'): cebar una torre de la defensa o prender un velón.
  onGuest(m, from) {
    if (m.a === 'vela') this.fixVela(m.i | 0);
    else this.defense.onGuest(m, from);
  }

  dispose() {
    this.song?.dispose();
    this.g.hud.setCraftText?.(null);
    this.defense.dispose();
    this.clearWisps();
    if (this.g.defense === this.goals) this.g.defense = null;
  }
}

// Manchones de sangre para la hoja (en el canal verde, que es el que usa alphaMap).
function bloodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const r = 6 + Math.random() * 22;
    const v = Math.floor(120 + Math.random() * 135);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.9)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // las UV de la hoja van en metros (la hoja mide unos 30 cm)
  t.repeat.set(5, 5);
  return t;
}

// Paquete de yerba con la etiqueta de la chacra.
function packTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, 128, 200);
  ctx.fillStyle = '#2f5a2a';
  ctx.fillRect(0, 60, 128, 80);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('LA', 64, 92);
  ctx.fillText('TAPERA', 64, 118);
  ctx.fillStyle = '#5a2a1a';
  ctx.font = 'italic 13px Georgia, serif';
  ctx.fillText('yerba mate', 64, 40);
  ctx.fillText('cosecha 1987', 64, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
