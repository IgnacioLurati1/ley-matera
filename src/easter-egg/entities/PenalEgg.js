import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EE } from '../config/map';
import { zombieHealth, maxAlive, SPEEDS } from '../config/rules';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { bars, cot, bucket } from '../world/penalProps';
import Avatars from '../net/Avatars';
import Encierro, { missingIn, missingText } from './Encierro';
import { buildVoz, updateVoz } from '../ui/voz';
import PenalBoat, { DOCKS } from './PenalBoat';
import PenalLift from './PenalLift';
import SongEgg from '../world/SongEgg';
import Cuchillo, { buildCleaver, knifeName } from '../weapons/Cuchillo';
import PenalGhosts from './PenalGhosts';
import PenalPlane from '../world/penalPlane';
import { keyLabel } from '../core/controls';
import { fireflies } from '../fx/Fireflies';
import { reachableSpot } from './reach';
import { buildSupremoDisplay, animateSupremoDisplay } from '../weapons/Supremo';
import PenalForge from './penalForge';
import PenalMotin from './penalMotin';

// Easter egg del penal: "Los Tres Gauchos". En tres celdas hay tres gauchos
// presos (Anacleto en el pabellón, Cirilo en los calabozos, Benito en la
// enfermería). Cada uno cuenta cómo se consigue su llave y, recién cuando uno
// sale, el que sigue te habla:
//  1. Anacleto: la llave la tienen los tres perros del penal (patio,
//     yerbales, muelle). Tienen hambre de almas: se liquidan muertos cerca
//     de cada uno. Cuando comen los tres, el último la devuelve.
//  2. Cirilo: cuelga del cinturón del Alcaide y solo se suelta con ácido. La
//     Bombilla Gut (de la caja) se mejora con el kit de ácido: tres piezas,
//     la mesa de la enfermería y el encierro de los calabozos (almas). Un
//     frasco de ácido en el Alcaide y se le cae el llavero.
//  3. Benito: la bombilla ácida en la silla eléctrica de la oficina, y la
//     corriente del gaucho life. La llave sale de la chispa.
// Al abrir la tercera celda, la Voz de Arriba (la de la granja) devuelve la
// yerba de la tapera, ahora dorada: baja en el patio en plena partida. Benito
// pide agua embrujada del río para despertar la bombilla suprema: en el
// cruce siguiente del bote (entities/PenalBoat.js) la damajuana se llena en
// medio del río; en el islote se deja en el Pack-a-Pava de la ermita de San
// La Muerte y arranca un encierro; si se aguanta, el agua queda embrujada y
// se le lleva a Benito, que da la bombilla suprema y abre el camino al cerro.
// Anacleto, al salir, da su cuchillo de carnicero (el tomahawk,
// weapons/Cuchillo.js; opcional): tirado en el Pack-a-Pava arranca un
// encierro en la ermita y, si se aguanta, sale mejorado. El mate dorado está en la
// caja fuerte del alcaide (se abre con la electricidad del gaucho life). En el
// espinillo del cerro se ponen las tres cosas y aparece el Gauchito Gil.
// En línea lo lleva el anfitrión; lo que toca las armas de cada uno (dejar la
// bombilla en el encierro o en la silla) lo hace cada uno y avisa.

const LINES = {
  g1: {
    intro: [
      '¡Eh, vos! ¿Estás vivo? Soy Anacleto. Nos encerraron por no servirle al Alcaide... y ni la muerte nos deja salir.',
      'Mi llave la tienen los perros del penal, en el patio, en los yerbales y en el muelle. Tienen hambre de almas.',
    ],
    remind: 'Los perros, paisano. Patio, yerbales y muelle. Almas, que tienen hambre.',
    freed: [
      '¡Libre, por fin! Gracias, paisano.',
      'Tomá mi cuchillo de carnicero. Tiralo y vuelve solo. Y si cae en el Pack-a-Pava... sale otra cosa.',
      'El que sigue es Cirilo, allá abajo, en los calabozos. Él sabe lo del Alcaide.',
    ],
    knife: 'Mi cuchillo, paisano. Tiralo al Pack-a-Pava y aguantá lo que salga, que vale la pena.',
  },
  // Cirilo no sabe dónde quedó su llave: el que vio todo es Nicanor, su
  // compañero de celda, muerto en la celda abierta del fondo (solo le habla al
  // alma: entities/PenalGhosts.js). Cuando Nicanor cuenta, el recordatorio es el del ácido.
  g2: {
    intro: [
      '¿Te mandó Anacleto? Mi llave... ni sé dónde fue a parar. La noche que me encerraron me dieron tan fuerte que no me acuerdo de nada.',
      'El que vio todo fue Nicanor, mi compañero de celda. Se murió en la celda de al lado, la abierta, al fondo del pasillo. A los muertos no los ves con los ojos, paisano: buscalo desde el gaucho life.',
    ],
    remind: 'Nicanor, paisano. En la celda abierta, al fondo de los calabozos. Solo lo vas a ver con el alma: entrá al gaucho life.',
    remindAcid: 'Ácido, paisano, como dijo Nicanor. Y un frasco en el Alcaide cuando aparezca.',
    freed: ['¡Ja! Ese porteño se quedó sin llaves.', 'Falta Benito, en la enfermería, en la celda de aislamiento. Está medio loco, pero es buena gente.'],
  },
  g3: {
    intro: [
      '¿Cirilo? ¿Anacleto? ¿Están afuera? Entonces es cierto... Escuchame bien. La tercera llave se forja con rayo.',
      'Llevá la bombilla del ácido a la silla eléctrica del Alcaide. Después, desde el gaucho life, dale corriente.',
    ],
    remind: 'La silla, en la oficina del Alcaide. Y la corriente de tu alma.',
    water: [
      'Libres los tres... La bombilla suprema está dormida. Para despertarla hace falta agua del río. Agua embrujada.',
      'Crucen en el bote. En el medio del río se llena la damajuana. Después, al Pack-a-Pava de la ermita del islote... y aguanten.',
    ],
    remindWater: 'El agua, paisano. Del río a la ermita del islote, y de vuelta acá.',
    freed: [
      'Agua embrujada... con esto se despierta. Tomá, la bombilla suprema. Nos la quitó el Gil cuando nos encerró.',
      '¿El Gil? El Gauchito, el de las banderas coloradas. Él es el carcelero de este penal. Tiene presas nuestras almas.',
      'Subí al cerro por la capilla. En el espinillo poné el mate dorado, la yerba y la bombilla. Ahí lo vas a encontrar.',
      'El mate dorado lo guarda el Alcaide en la caja fuerte de su oficina. La cerradura es eléctrica: abrila con la corriente de tu alma, desde el gaucho life.',
    ],
  },
};
const VOICE = [
  '¿Se acuerdan de mí? Ustedes me trajeron la yerba de la tapera.',
  'La cuidé todo este tiempo. Ahora es de oro. Tómenla... la van a necesitar allá arriba, en el cerro.',
];
const SPEAKER = { g1: 'anacleto', g2: 'cirilo', g3: 'benito' };
const PONCHO = { g1: 0x3a6a2a, g2: 0x2a3a7a, g3: 0x7a5a2a };
const INV = [
  ['llave1', 'Llave de Anacleto', '⚿'],
  ['llave2', 'Llave de Cirilo', '⚿'],
  ['llave3', 'Llave de Benito', '⚿'],
  ['frasco', 'Frasco de ácido', '⚗'],
  ['manguera', 'Manguera de goma', '➰'],
  ['valvula', 'Válvula de bronce', '⚙'],
  ['kit', 'Kit de ácido', '☣'],
  ['mate', 'Mate dorado', '◉'],
  ['yerba', 'Yerba dorada', '❦'],
  ['bombilla', 'Bombilla suprema', '⟋'],
  ['agua', 'Agua embrujada', '≈'],
  ['timon', 'Timón del bote', '☸'],
];
// los encierros de la ermita (en el Pack-a-Pava): cuánto hay que aguantar con el cuchillo y con el agua
const KNIFE_RITUAL = 70;
const WATER_RITUAL = 60;
const GOLD = 0xffc84a;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// los perros: hasta dónde llega la cadena y cuánto tarda en comerse a uno
const DOG_CHAIN = 4.6;
const DOG_EAT = 2.6;

// Funde las mallas de un grupo que se mueve entero en una por material (en el
// espacio del grupo). Las de material único quedan como estaban (así las que
// se prenden o apagan, como la cerradura de la reja del gaucho life, siguen iguales).
function compactPiece(obj) {
  if (!obj?.isGroup) return;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const byMat = new Map();
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const list = byMat.get(o.material) || [];
    list.push(o);
    byMat.set(o.material, list);
  });
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      return geo;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = list.some((o) => o.castShadow);
    m.receiveShadow = list.some((o) => o.receiveShadow);
    for (const o of list) o.removeFromParent();
    obj.add(m);
  }
}

export default class PenalEgg {
  constructor(game) {
    this.g = game;
    this.M = game.world.M;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // el avión que cruza el cielo de lejos cada tanto (world/penalPlane.js)
    this.plane = new PenalPlane(game, this.root);
    this.fight = false;
    // 0 nadie habló, 1 perros, 2 Anacleto libre, 3 ácido/alcaide, 4 Cirilo libre, 5 silla, 6 Benito libre, 7 altar
    this.step = 0;
    this.talked = { g1: false, g2: false, g3: false };
    this.freed = { g1: false, g2: false, g3: false };
    this.keys = { k1: 'none', k2: 'none', k3: 'none' };
    this.dogFed = EE.dogs.map(() => 0);
    this.parts = Object.fromEntries(EE.parts.map((p) => [p.id, false]));
    this.kit = false;
    this.acidDone = false;
    this.encierro = null;
    this.chair = 'empty';
    this.safeOpen = false;
    // agua: none, asked (Benito la pidió), boat (la damajuana llena), pap (en el
    // Pack-a-Pava: encierro), ready (embrujada, en la máquina), held, given
    this.items = { mate: 'safe', yerba: 'none', bombilla: 'none', agua: 'none' };
    // el encierro del agua: cuánto va y si ya salió el Alcaide
    this.waterT = 0;
    this.waterBoss = false;
    this.altar = { mate: false, yerba: false, bombilla: false };
    // el cuchillo en el Pack-a-Pava: { by, state: ritual | cook | ready, t, dur }
    this.kn = null;
    this.knifeDone = false;
    this.myKnifeUp = false;
    this.voiceT = 80;
    this.npc = new Avatars(game, null);
    this.buildCells();
    this.buildDogs();
    this.buildParts();
    this.buildTable();
    this.buildEncierro();
    this.buildChair();
    this.buildSafe();
    this.buildAltar();
    this.buildKeys();
    this.buildBeam();
    // la Voz de la escena de la yerba (armada desde ya, escondida)
    this.voz = buildVoz(game.textures, { beam: 30 });
    this.voz.root.visible = false;
    this.root.add(this.voz.root);
    this.register();
    // el cuchillo de Anacleto, los encierros de la ermita y el bote del muelle
    this.knife = new Cuchillo(game);
    this.knife.onPap = (up) => this.knifeIntoPap(up);
    // lo que solo se ve desde el gaucho life: las calaveras (con el cuchillo,
    // una Bombilla Gut gratis) y los rastros de los presos
    this.ghosts = new PenalGhosts(game, this);
    this.knife.onFly = (pos, dir, len) => this.ghosts.knifeFly(pos, dir, len);
    this.encM = new Encierro(game, { zone: 'M', color: 0xb050ff, place: 'la ermita' });
    this.papKnife = null;
    this.boat = new PenalBoat(game, this);
    // la telesilla del muelle a la estación del cerro (entities/PenalLift.js)
    this.lift = new PenalLift(game, this);
    // easter egg musical: tres guitarras (world/SongEgg.js)
    this.song = new SongEgg(game, 'penal');
    this.registerKnife();
    this.registerWater();
    // el motín de cada 10 rondas (y el que hace saltar Anacleto): los muertos
    // y las rondas lo buscan por g.defense (entities/penalMotin.js)
    this.motin = new PenalMotin(game, this);
    this.defense = this.motin;
    game.defense = this.motin;
    this.mergeStatic();
    // atajos de prueba (solo, jugando): Alt+N el cuchillo, Alt+B el bote
    this.onKey = (e) => {
      if (!import.meta.env.DEV || !e.altKey || game.state !== 'playing' || game.net) return;
      if (e.code === 'KeyN') {
        e.preventDefault();
        this.debugKnife();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        this.debugBoat();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  // ---------------- lo que se ve ----------------
  // Lo que nunca se mueve (paredes y rejas de las celdas, cuchas, mesa, silla,
  // pedestal, caja fuerte, altar) se funde con la utilería del mapa: son
  // cientos de dibujos menos por cuadro (y por la sombra). Lo que se mueve, se
  // prende o desaparece queda aparte.
  mergeStatic() {
    const w = this.g.world;
    if (!w.addStatic) return;
    const dyn = [
      ...Object.values(this.cells).map((c) => c.door),
      ...this.dogs.flatMap((d) => [d.dog.g, d.ring, d.glow]),
      ...Object.values(this.partObjs).flatMap((p) => [p.g, p.glow]),
      ...Object.values(this.tableParts),
      ...Object.values(this.keyObjs).flatMap((k) => [k.g, k.glow]),
      this.kitObj, this.encRing, this.chairGlow, this.safeDoor, this.mateObj,
      this.altarMate, this.altarYerba, this.altarBomb, this.altarGlow, this.altarSup,
      this.yerbaObj, this.yerbaGlow, this.beam, this.voz.root,
    ];
    for (const o of dyn) if (o) o.userData.dynamic = true;
    const fixed = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== this.root; p = p.parent) if (p.userData.dynamic) return;
      fixed.push(o);
    });
    w.addStatic(this.root);
    for (const o of fixed) o.removeFromParent();
    // las puertas del penal: cada hoja o reja se mueve entera, así que sus
    // barrotes y tablas se funden adentro de la pieza (uno por material)
    for (const it of this.g.interact.list) if (it.kind === 'door') for (const p of it.door.pieces) compactPiece(p.obj);
  }

  floor(x, z) {
    return this.g.world.floorAt(x, z);
  }

  glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.scale.setScalar(size);
    return s;
  }

  // Las tres celdas: paredes, reja con puerta y el gaucho adentro.
  buildCells() {
    const M = this.M;
    this.cells = {};
    const wall = M.cellWall || M.plasterWhite;
    EE.gauchos.forEach((def, i) => {
      const [x, z] = def.cell;
      const y = this.floor(x, z);
      const w = def.w;
      const d = def.d;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = def.rot;
      const H = 2.8;
      // paredes de los costados y la de atrás (si la celda no está contra la pared, se arman)
      for (const s of [-1, 1]) g.add(mesh(boxGeo(0.14, H, d), wall, s * (w / 2), H / 2, 0));
      g.add(mesh(boxGeo(w + 0.14, 0.14, d + 0.1), wall, 0, H + 0.07, 0));
      // reja: dos paños fijos y la puerta
      bars(g, M, -w / 2 + 0.08, -0.5, d / 2, H - 0.05);
      bars(g, M, 0.5, w / 2 - 0.08, d / 2, H - 0.05);
      const door = new THREE.Group();
      door.position.set(0.5, 0, d / 2);
      bars(door, M, -1, 0, 0, H - 0.25);
      const lock = mesh(boxGeo(0.14, 0.18, 0.08), M.brass, -0.9, 1.15, 0.04);
      door.add(lock);
      g.add(door);
      cot(g, M, -w / 2 + 0.55, -d / 2 + 1.1, 0, false);
      bucket(g, M, w / 2 - 0.4, 0, -d / 2 + 0.4);
      this.root.add(g);
      // colisión de la reja (la puerta se abre)
      const world = this.g.world;
      const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, def.rot).add(new THREE.Vector3(x, 0, z));
      const box = (a, b) => {
        const p = toWorld(a[0], a[1]);
        const q = toWorld(b[0], b[1]);
        return world.addBox([Math.min(p.x, q.x) - 0.05, y, Math.min(p.z, q.z) - 0.05, Math.max(p.x, q.x) + 0.05, y + H, Math.max(p.z, q.z) + 0.05], { kind: 'prop' });
      };
      box([-w / 2, d / 2], [-0.5, d / 2]);
      box([0.5, d / 2], [w / 2, d / 2]);
      const doorBox = box([-0.5, d / 2], [0.5, d / 2]);
      for (const s of [-1, 1]) box([s * (w / 2), -d / 2], [s * (w / 2), d / 2]);
      // el gaucho: sentado en el catre mirando la reja
      const gp = toWorld(-w / 2 + 0.9, -d / 2 + 1.4);
      const npc = { id: 300 + i, name: def.name, pos: new THREE.Vector3(gp.x, y, gp.z), yaw: def.rot + Math.PI, pitch: 0, speed: 0, crouch: true, moving: false };
      this.npc.add(npc);
      const a = this.npc.list.get(npc.id);
      a.M.poncho.color.set(new THREE.Color(PONCHO[def.id]).multiplyScalar(1.7));
      const front = toWorld(0, d / 2 + 0.9);
      this.cells[def.id] = { def, group: g, door, doorBox, npc, front: new THREE.Vector3(front.x, y, front.z), y, open: 0 };
    });
    for (const n of this.npc.list.values()) n.hand.visible = false;
  }

  // Un perro grande y negro, atado a su cucha.
  dogModel(M) {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95 });
    const body = new THREE.Group();
    body.add(mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), fur, 0, 0.62, 0, Math.PI / 2, 0, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.85, 0.52);
    head.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), fur, 0, 0, 0));
    head.add(mesh(boxGeo(0.14, 0.12, 0.2), fur, 0, -0.04, 0.16));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 5), fur, s * 0.09, 0.15, -0.02, 0, 0, s * -0.3));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a1a).multiplyScalar(2.5), toneMapped: false }));
      eye.position.set(s * 0.07, 0.04, 0.13);
      head.add(eye);
    }
    body.add(head);
    // las patas cuelgan de la cadera (así corren)
    const legs = [];
    for (const [a, b] of [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.3], [0.14, -0.3]]) {
      const hip = new THREE.Group();
      hip.position.set(a, 0.5, b);
      hip.add(mesh(cylGeo(0.05, 0.045, 0.5, 6), fur, 0, -0.25, 0));
      body.add(hip);
      legs.push(hip);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.8, -0.42);
    tail.add(mesh(cylGeo(0.03, 0.015, 0.4, 5), fur, 0, 0.14, -0.1, -0.9, 0, 0));
    body.add(tail);
    g.add(body);
    // el collar (la cadena la arma buildDogs: se estira cuando sale a comer)
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.02, 5, 12), M.iron, 0, 0.78, 0.4, Math.PI / 2 - 0.4, 0, 0));
    return { g, body, head, legs, tail };
  }

  buildDogs() {
    const M = this.M;
    this.dogs = EE.dogs.map((def, i) => {
      const [x, z] = def.pos;
      const y = this.floor(x, z);
      const root = new THREE.Group();
      root.position.set(x, y, z);
      root.rotation.y = def.rot;
      // la cucha
      const k = new THREE.Group();
      k.position.set(0, 0, -1.1);
      k.add(mesh(boxGeo(1.2, 0.9, 1.1), M.woodDark, 0, 0.45, 0));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 4), M.wood);
      roof.position.set(0, 1.15, 0);
      roof.rotation.y = Math.PI / 4;
      k.add(roof);
      k.add(mesh(boxGeo(0.5, 0.6, 0.02), M.black, 0, 0.35, 0.56));
      root.add(k);
      // la cadena: eslabones de la cucha al collar (se acomodan cada cuadro)
      const links = [];
      for (let c = 0; c < 14; c++) {
        const l = mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 8), M.iron, 0, 0.05, -0.5 + c * 0.07);
        root.add(l);
        links.push(l);
      }
      const dog = this.dogModel(M);
      root.add(dog.g);
      // el plato de las almas
      root.add(mesh(cylGeo(0.2, 0.16, 0.08, 12), M.metal, 0.6, 0.04, 0.5));
      this.root.add(root);
      this.g.world.addBox([x - 0.8, y, z - 0.8, x + 0.8, y + 1.2, z + 0.8], { kind: 'prop' });
      const ring = this.makeRing(x, y, z, def.r, 0x7a3aff);
      const glow = this.glowSprite(0x9a5aff, 1.4);
      glow.position.set(x, y + 1.2, z);
      glow.visible = false;
      this.root.add(glow);
      return { i, def, root, dog, ring, glow, links, pos: new THREE.Vector3(x, y, z), state: 'idle', t: 0, run: 0, goal: new THREE.Vector3(), bite: new THREE.Vector3(), corpse: null, souled: false };
    });
  }

  // ---------------- los perros salen a comer ----------------
  // (anfitrión) el perro sale al muerto que cayó en su radio y se lo come; los
  // invitados lo ven por el evento 'deat'. Mientras come no toma otro.
  dogEat(d, z) {
    const g = this.g;
    d.corpse = z;
    this.startEat(d, z.pos);
    g.net?.event('pee', { deat: d.i, at: [+z.pos.x.toFixed(2), +z.pos.y.toFixed(2), +z.pos.z.toFixed(2)] });
  }

  startEat(d, at) {
    const g = this.g;
    d.state = 'out';
    d.t = 0;
    d.souled = false;
    d.bite.copy(at);
    // a dónde llega (en el espacio de la cucha): hasta el cuerpo, lo que dé la cadena
    d.root.updateMatrixWorld();
    const local = d.root.worldToLocal(tmpV.copy(at));
    const len = Math.hypot(local.x, local.z);
    const reach = Math.min(Math.max(0, len - 0.75), DOG_CHAIN);
    d.goal.set((local.x / (len || 1)) * reach, 0, (local.z / (len || 1)) * reach);
    g.audio.growl?.(tmpV.copy(d.pos).setY(d.pos.y + 0.8), 'attack');
  }

  // El perro, cada cuadro: sale corriendo, come, vuelve; la cadena lo sigue.
  animateDog(d, dt, t) {
    const g = this.g;
    const D = d.dog.g;
    const B = d.dog.body;
    const H = d.dog.head;
    const legs = d.dog.legs;
    d.t += dt;
    if (d.state === 'out' || d.state === 'back') {
      const goal = d.state === 'out' ? d.goal : tmpV2.set(0, 0, 0);
      const dx = goal.x - D.position.x;
      const dz = goal.z - D.position.z;
      const dist = Math.hypot(dx, dz);
      const sp = d.state === 'out' ? 6.5 : 2.4;
      if (dist > 0.04) {
        const k = Math.min(dist, sp * dt) / dist;
        D.position.x += dx * k;
        D.position.z += dz * k;
        const want = Math.atan2(dx, dz);
        D.rotation.y += Math.atan2(Math.sin(want - D.rotation.y), Math.cos(want - D.rotation.y)) * Math.min(1, dt * 12);
        d.run += dt * (d.state === 'out' ? 17 : 10);
      } else if (d.state === 'out') {
        d.state = 'eat';
        d.t = 0;
        g.fx.blood?.(d.bite, UP, 12, 1.2);
      } else {
        d.state = 'idle';
        d.t = 0;
      }
      // galope: patas cruzadas, el cuerpo sube y baja, la cabeza adelante
      const a = d.state === 'out' ? 0.9 : 0.5;
      legs.forEach((l, k) => (l.rotation.x = Math.sin(d.run + (k === 0 || k === 3 ? 0 : Math.PI)) * a));
      B.position.y = Math.abs(Math.sin(d.run)) * 0.06;
      B.rotation.x = 0;
      H.rotation.x = -0.15;
      d.dog.tail.rotation.x = 0.5;
    } else if (d.state === 'eat') {
      // la cabeza hundida en el muerto: mordiscones, sacude y tira sangre
      D.rotation.y += Math.sin(t * 9) * dt * 0.8;
      B.rotation.x = 0.28;
      B.position.y = -0.06;
      H.rotation.x = 0.75 + Math.sin(t * 17) * 0.22;
      legs.forEach((l, k) => (l.rotation.x = k < 2 ? -0.35 : 0.2));
      d.dog.tail.rotation.x = Math.sin(t * 14) * 0.5;
      if (Math.random() < dt * 5) g.fx.blood?.(d.bite, UP, 3, 0.7);
      if (!d.souled && d.t > 0.6) {
        // el alma sale del muerto y se la traga
        d.souled = true;
        D.updateMatrixWorld();
        g.fx.soul(tmpV.copy(d.bite).setY(d.bite.y + 0.4), H.getWorldPosition(new THREE.Vector3()));
        g.audio.growl?.(tmpV.copy(d.bite).setY(d.bite.y + 0.6), 'boss');
      }
      if (d.t > DOG_EAT) {
        d.state = 'back';
        d.t = 0;
        if (!g.net?.guest) {
          // se lo terminó: el cuerpo desaparece y cuenta el alma
          if (d.corpse?.dead && d.corpse.active) g.zombies.free(d.corpse);
          d.corpse = null;
          this.feedDog(d.i, d.bite, true);
        }
      }
    }
    // la cadena: de la puerta de la cucha al collar, con una panza que se estira
    const A = tmpA.set(0, 0.32, -0.56);
    const C = tmpB.set(Math.sin(D.rotation.y) * 0.4, 0.78, Math.cos(D.rotation.y) * 0.4).add(D.position);
    const span = A.distanceTo(C);
    const sag = Math.max(0, 0.9 - span * 0.16) * 0.5;
    const n = d.links.length;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const l = d.links[k];
      l.position.lerpVectors(A, C, u);
      l.position.y = Math.max(0.04, l.position.y - sag * 4 * u * (1 - u) * 1.6);
      l.lookAt(tmpC.lerpVectors(A, C, Math.min(1, u + 0.05)).applyMatrix4(d.root.matrixWorld));
      if (k % 2) l.rotateZ(Math.PI / 2);
    }
  }


  makeRing(x, y, z, r, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r, 64).rotateX(-Math.PI / 2), mat);
    ring.position.set(x, y + 0.04, z);
    ring.renderOrder = 2;
    this.root.add(ring);
    return ring;
  }

  // Las piezas del kit de ácido, tiradas por el penal.
  buildParts() {
    const M = this.M;
    this.partObjs = {};
    for (const def of EE.parts) {
      const [x, z] = def.pos;
      const y = this.floor(x, z);
      const g = new THREE.Group();
      if (def.id === 'frasco') {
        g.add(mesh(cylGeo(0.06, 0.06, 0.18, 10), M.glass, 0, 0.09, 0));
        g.add(mesh(cylGeo(0.05, 0.05, 0.13, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff3a).multiplyScalar(1.6), toneMapped: false }), 0, 0.075, 0));
        g.add(mesh(cylGeo(0.04, 0.04, 0.03, 10), M.copper, 0, 0.195, 0));
      } else if (def.id === 'manguera') {
        for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.16 - i * 0.02, 0.022, 6, 16), M.tire, 0, 0.03 + i * 0.04, 0, Math.PI / 2, 0, 0));
      } else {
        g.add(mesh(cylGeo(0.05, 0.05, 0.12, 10), M.brass, 0, 0.08, 0, 0, 0, Math.PI / 2));
        g.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 12), M.brass, 0, 0.16, 0));
        g.add(mesh(cylGeo(0.01, 0.01, 0.08, 6), M.brass, 0, 0.12, 0));
      }
      g.position.set(x, y + 0.05, z);
      this.root.add(g);
      const glow = fireflies(this.g, 0x9aff6a, 0.7);
      glow.position.set(x, y + 0.35, z);
      this.root.add(glow);
      this.partObjs[def.id] = { def, g, glow, pos: new THREE.Vector3(x, y + 0.6, z) };
    }
  }

  // La mesa de la enfermería donde se arma el kit.
  buildTable() {
    const M = this.M;
    const [x, z] = EE.table.pos;
    const y = this.floor(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = EE.table.rot;
    g.add(mesh(boxGeo(1.6, 0.06, 0.8), M.metal, 0, 0.88, 0));
    for (const [a, b] of [[-0.72, -0.33], [0.72, -0.33], [-0.72, 0.33], [0.72, 0.33]]) g.add(mesh(cylGeo(0.025, 0.025, 0.88, 6), M.iron, a, 0.44, b));
    g.add(mesh(boxGeo(0.5, 0.02, 0.3), M.paper, -0.45, 0.92, 0.1, 0, 0.2, 0));
    this.root.add(g);
    this.g.world.addBox([x - 0.85, y, z - 0.45, x + 0.85, y + 0.95, z + 0.45], { kind: 'prop' });
    // lo que se va poniendo arriba
    this.tableParts = {};
    EE.parts.forEach((def, k) => {
      const src = this.partObjs[def.id].g.clone();
      src.position.set(x - 0.4 + k * 0.4, y + 0.92, z);
      src.visible = false;
      this.root.add(src);
      this.tableParts[def.id] = src;
    });
    // el kit armado: el frasco grande con caños
    const kit = new THREE.Group();
    kit.add(mesh(cylGeo(0.1, 0.1, 0.28, 12), M.glass, 0, 0.14, 0));
    kit.add(mesh(cylGeo(0.085, 0.085, 0.22, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff3a).multiplyScalar(1.8), toneMapped: false }), 0, 0.12, 0));
    kit.add(mesh(cylGeo(0.1, 0.1, 0.04, 12), M.copper, 0, 0.3, 0));
    kit.add(mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 14, Math.PI), M.tire, 0.12, 0.2, 0, 0, 0, -Math.PI / 2));
    kit.position.set(x, y + 0.92, z);
    kit.visible = false;
    this.root.add(kit);
    this.kitObj = kit;
    this.tablePos = new THREE.Vector3(x, y + 1, z);
  }

  // El encierro de los calabozos: la celda donde el ácido toma almas.
  buildEncierro() {
    const [x, z] = EE.encierro.pos;
    const y = this.floor(x, z);
    this.encPos = new THREE.Vector3(x, y, z);
    this.encRing = this.makeRing(x, y, z, EE.encierro.r, 0x6aff3a);
    // el pedestal donde queda la bombilla
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(mesh(boxGeo(0.7, 0.8, 0.5), M.stoneStep || M.stone, 0, 0.4, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 8), M.iron, -0.25 + i * 0.16, 0.82, 0.2, Math.PI / 2, 0, 0));
    this.root.add(g);
    this.g.world.addBox([x - 0.38, y, z - 0.28, x + 0.38, y + 0.85, z + 0.28], { kind: 'prop' });
    this.encGun = null;
    this.encTop = new THREE.Vector3(x, y + 1.05, z);
  }

  // La silla eléctrica de la oficina del Alcaide.
  buildChair() {
    const M = this.M;
    const [x, z] = EE.chair.pos;
    const y = this.floor(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = EE.chair.rot;
    g.add(mesh(boxGeo(0.8, 0.12, 0.7), M.woodDark, 0, 0.5, 0));
    g.add(mesh(boxGeo(0.8, 1.2, 0.1), M.woodDark, 0, 1.05, -0.32));
    for (const s of [-1, 1]) {
      g.add(mesh(boxGeo(0.1, 0.1, 0.7), M.woodDark, s * 0.38, 0.78, 0));
      g.add(mesh(boxGeo(0.12, 0.05, 0.14), M.leather, s * 0.38, 0.84, 0.1));
      for (const b of [-0.28, 0.28]) g.add(mesh(boxGeo(0.08, 0.5, 0.08), M.woodDark, s * 0.34, 0.25, b));
    }
    // el casco con los cables
    g.add(mesh(cylGeo(0.16, 0.18, 0.12, 12), M.metal, 0, 1.75, -0.22));
    for (const s of [-1, 1]) g.add(mesh(cylGeo(0.012, 0.012, 1.4, 5), M.black, s * 0.2, 1.1, -0.45, 0.3, 0, s * 0.1));
    g.add(mesh(boxGeo(0.4, 0.6, 0.3), M.metalGreen, 0.9, 0.3, -0.3));
    this.root.add(g);
    this.g.world.addBox([x - 0.5, y, z - 0.5, x + 0.5, y + 1.8, z + 0.5], { kind: 'prop' });
    this.chairPos = new THREE.Vector3(x, y + 0.9, z);
    this.chairGun = null;
    this.chairGlow = this.glowSprite(0x5ab8ff, 1.6);
    this.chairGlow.position.copy(this.chairPos);
    this.chairGlow.visible = false;
    this.root.add(this.chairGlow);
  }

  // La caja fuerte del Alcaide (con el mate dorado adentro).
  buildSafe() {
    const M = this.M;
    const [x, z] = EE.safe.pos;
    const y = this.floor(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = EE.safe.rot;
    // hueca, con un estante: abierta se ve el mate adentro (antes era un
    // bloque macizo y el mate quedaba tapado)
    g.add(mesh(boxGeo(0.9, 1.1, 0.06), M.iron, 0, 0.55, -0.37));
    for (const s of [-1, 1]) g.add(mesh(boxGeo(0.06, 1.1, 0.8), M.iron, s * 0.42, 0.55, 0));
    g.add(mesh(boxGeo(0.9, 0.06, 0.8), M.iron, 0, 1.07, 0));
    g.add(mesh(boxGeo(0.9, 0.12, 0.8), M.iron, 0, 0.06, 0));
    g.add(mesh(boxGeo(0.78, 0.92, 0.01), M.black, 0, 0.58, -0.335));
    g.add(mesh(boxGeo(0.78, 0.03, 0.62), M.iron, 0, 0.3, -0.03));
    const door = new THREE.Group();
    door.position.set(-0.4, 0, 0.41);
    door.add(mesh(boxGeo(0.8, 0.95, 0.06), M.metalGreen, 0.4, 0.58, 0));
    door.add(mesh(cylGeo(0.09, 0.09, 0.04, 16), M.brass, 0.5, 0.6, 0.04, Math.PI / 2, 0, 0));
    door.add(mesh(boxGeo(0.18, 0.03, 0.03), M.brass, 0.5, 0.6, 0.07));
    g.add(door);
    this.root.add(g);
    this.g.world.addBox([x - 0.5, y, z - 0.5, x + 0.5, y + 1.15, z + 0.5], { kind: 'prop' });
    this.safeDoor = door;
    const front = new THREE.Vector3(0, 0, 0.9).applyAxisAngle(THREE.Object3D.DEFAULT_UP, EE.safe.rot);
    this.safePos = new THREE.Vector3(x, y + 0.7, z);
    this.safeFront = new THREE.Vector3(x + front.x, y, z + front.z);
    this.mateObj = this.goldMate();
    this.mateObj.position.set(x, y + 0.315, z);
    this.mateObj.scale.setScalar(0.9);
    this.root.add(this.mateObj);
  }

  // El mate dorado: calabaza de oro, virola de plata.
  goldMate() {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 1, emissive: 0x3a2800, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.08, 0.01], [0.13, 0.08], [0.13, 0.16], [0.09, 0.24], [0.07, 0.27]].map(([r, y]) => new THREE.Vector2(r, y)), 20), gold);
    g.add(body);
    g.add(mesh(new THREE.TorusGeometry(0.072, 0.012, 6, 18), this.M.silver, 0, 0.27, 0, Math.PI / 2, 0, 0));
    return g;
  }

  goldYerba() {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 200;
    const ctx = c.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 128, 200);
    grd.addColorStop(0, '#fff0a0');
    grd.addColorStop(0.5, '#d8a030');
    grd.addColorStop(1, '#fff0a0');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 200);
    ctx.fillStyle = '#5a3a0a';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('LA', 64, 92);
    ctx.fillText('TAPERA', 64, 118);
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillText('yerba de oro', 64, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.6, emissive: 0x3a2800, emissiveIntensity: 0.6 })));
    return g;
  }

  supremeBombilla() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff0d0, roughness: 0.15, metalness: 1, emissive: 0x6a4a10, emissiveIntensity: 0.8 });
    g.add(mesh(cylGeo(0.012, 0.012, 0.36, 8), mat, 0, 0, 0));
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat, 0, -0.18, 0));
    g.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 10), this.M.brass, 0, 0.12, 0, Math.PI / 2, 0, 0));
    return g;
  }

  // El espinillo del cerro: un árbol seco con cintas, la piedra y lo que se va poniendo.
  buildAltar() {
    const M = this.M;
    const [x, z] = EE.altar;
    const y = this.floor(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // el espinillo, torcido y seco
    const bark = M.bark;
    g.add(mesh(cylGeo(0.18, 0.3, 3.2, 8), bark, 0.8, 1.6, -1.2, 0.1, 0, -0.15));
    const branches = [[0.6, 2.8, -1.1, 1.2, 0.8], [1.2, 2.5, -1.4, -0.9, 1.1], [0.9, 3.1, -0.9, 0.2, 0.9], [0.4, 2.2, -1.3, -1.4, 0.7]];
    for (const [bx, by, bz, rz, len] of branches) g.add(mesh(cylGeo(0.05, 0.09, len * 1.4, 6), bark, bx, by, bz, 0.4, 0, rz));
    // la soga que cuelga de la rama
    g.add(mesh(cylGeo(0.012, 0.012, 1.1, 5), M.rope, -0.2, 2.2, -1.2));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.02, 5, 12), M.rope, -0.2, 1.62, -1.2, 0, Math.PI / 2, 0));
    // cintas coloradas
    const red = M.redCloth || M.redPaint;
    for (let i = 0; i < 12; i++) g.add(mesh(boxGeo(0.04, 0.4, 0.005), red, 0.8 + Math.cos(i) * 0.9, 2.2 + (i % 4) * 0.25, -1.2 + Math.sin(i * 1.7) * 0.6, 0, i, 0.2));
    // la piedra del altar
    g.add(mesh(boxGeo(1.4, 0.85, 0.9), M.stone, 0, 0.42, 0));
    g.add(mesh(boxGeo(1.55, 0.08, 1.0), M.stoneDark, 0, 0.88, 0));
    for (const [cx, cz] of [[-0.55, 0.3], [0.5, 0.32], [-0.6, -0.3], [0.58, -0.28]]) g.add(mesh(cylGeo(0.025, 0.025, 0.16, 6), M.candle, cx, 1.0, cz));
    this.root.add(g);
    this.g.world.addBox([x - 0.8, y, z - 0.5, x + 0.8, y + 0.95, z + 0.5], { kind: 'prop' });
    this.g.world.addBox([x + 0.55, y, z - 1.45, x + 1.05, y + 3, z - 0.95], { kind: 'prop' });
    this.altarPos = new THREE.Vector3(x, y + 1, z);
    // lo que se pone en la piedra
    this.altarMate = this.goldMate();
    this.altarMate.position.set(x, y + 0.92, z);
    this.altarYerba = this.goldYerba();
    this.altarYerba.position.set(x - 0.45, y + 1.08, z);
    this.altarYerba.rotation.y = 0.4;
    this.altarBomb = this.supremeBombilla();
    this.altarBomb.position.set(x + 0.02, y + 1.3, z);
    this.altarBomb.rotation.z = -0.25;
    for (const o of [this.altarMate, this.altarYerba, this.altarBomb]) {
      o.visible = false;
      this.root.add(o);
    }
    this.altarGlow = this.glowSprite(0xff3a2a, 3);
    this.altarGlow.position.set(x, y + 1.2, z);
    this.altarGlow.visible = false;
    this.root.add(this.altarGlow);
    // el mate supremo armado (el mate y la bombilla en la piedra): el Mate
    // Supremo de verdad (weapons/Supremo.js), con sus reliquias girando
    this.altarSup = buildSupremoDisplay(this.g.textures, 0.3);
    this.altarSup.position.set(x, y + 0.92, z);
    this.altarSup.visible = false;
    this.root.add(this.altarSup);
  }

  // Las llaves (flotan donde aparecen) y la yerba dorada del patio.
  buildKeys() {
    const M = this.M;
    const keyModel = () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 14), M.brass, 0, 0.1, 0));
      g.add(mesh(boxGeo(0.02, 0.22, 0.02), M.brass, 0, -0.05, 0));
      g.add(mesh(boxGeo(0.06, 0.02, 0.02), M.brass, 0.03, -0.12, 0));
      g.add(mesh(boxGeo(0.045, 0.02, 0.02), M.brass, 0.025, -0.07, 0));
      return g;
    };
    this.keyObjs = {};
    for (const k of ['k1', 'k2', 'k3']) {
      const g = keyModel();
      g.visible = false;
      this.root.add(g);
      const glow = fireflies(this.g, GOLD, 0.9);
      glow.visible = false;
      this.root.add(glow);
      this.keyObjs[k] = { g, glow, pos: new THREE.Vector3() };
    }
    this.yerbaObj = this.goldYerba();
    this.yerbaObj.visible = false;
    this.root.add(this.yerbaObj);
    const [yx, yz] = EE.yerba;
    this.yerbaPos = new THREE.Vector3(yx, this.floor(yx, yz) + 1.1, yz);
    this.yerbaGlow = fireflies(this.g, GOLD, 2.4);
    this.yerbaGlow.visible = false;
    this.root.add(this.yerbaGlow);
  }

  buildBeam() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.1, 60, 16, 1, true), mat);
    this.beam.visible = false;
    this.root.add(this.beam);
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    // las celdas: hablar con el gaucho o abrir con la llave
    for (const def of EE.gauchos) {
      const c = this.cells[def.id];
      const n = Number(def.id[1]);
      I.add({
        kind: 'ee',
        pos: c.front.clone().setY(c.y + 1.3),
        radius: 2.4,
        prompt: () => {
          // Benito, ya libre, espera el agua embrujada
          if (this.freed[def.id]) return n === 3 && this.items.agua === 'held' ? { text: 'darle el agua embrujada a Benito', noCost: true } : null;
          const k = `k${n}`;
          if (this.keys[k] === 'held') return { text: `abrir la celda de ${def.name}`, noCost: true };
          // (Cirilo espera a que pase el motín que hizo saltar Anacleto)
          if (n === 2 && this.freed.g1 && this.motin?.eeLock()) return { text: 'Primero, el motín', noCost: true, info: true };
          if (!this.canTalk(n)) return { text: `${def.name} te mira en silencio desde la celda`, noCost: true, info: true };
          return { text: `hablar con ${def.name}`, noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (this.freed[def.id]) {
            if (n !== 3 || this.items.agua !== 'held') return false;
            this.giveWater();
            return true;
          }
          const k = `k${n}`;
          if (this.keys[k] === 'held') {
            this.openCell(def.id);
            return true;
          }
          if (!this.canTalk(n)) return false;
          this.talk(def.id);
          return true;
        },
      });
    }
    // piezas del kit
    for (const p of Object.values(this.partObjs)) {
      I.add({
        kind: 'ee',
        pos: p.pos,
        radius: 1.8,
        prompt: () => (this.parts[p.def.id] ? null : { text: `agarrar: ${p.def.name}`, noCost: true }),
        cost: () => 0,
        use: () => {
          if (this.parts[p.def.id]) return false;
          this.takePart(p.def.id);
          return true;
        },
      });
    }
    // la mesa: armar el kit
    I.add({
      kind: 'ee',
      pos: this.tablePos,
      radius: 2.1,
      prompt: () => {
        if (this.kit) return null;
        const got = Object.values(this.parts).filter(Boolean).length;
        if (!got) return { text: 'Una mesa de enfermería llena de manchas verdes', noCost: true, info: true };
        if (got < 3) return { text: `Kit de ácido: faltan ${3 - got} ${3 - got === 1 ? 'pieza' : 'piezas'}`, noCost: true, info: true };
        return { text: 'armar el kit de ácido', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.kit || !Object.values(this.parts).every(Boolean)) return false;
        this.buildKit();
        return true;
      },
    });
    // el encierro: dejar tu Bombilla Gut (cada uno la suya) o llevarte la ácida
    I.add({
      kind: 'ee',
      local: true,
      pos: this.encTop,
      radius: 2.2,
      prompt: () => {
        const w = g.weapons;
        if (this.encierro) {
          if (this.encierro.by === this.myId() && this.encierro.state === 'ready') return { text: 'agarrar la Bombilla Ácida', noCost: true };
          return this.encierro.state === 'ready' ? null : { text: `El encierro: ${this.encierro.souls} de ${this.encierro.need} almas`, noCost: true, info: true };
        }
        if (!this.kit) return this.step >= 3 ? { text: 'El encierro: primero armá el kit de ácido en la enfermería', noCost: true, info: true } : null;
        if (w.has('gutacida')) return null;
        if (!w.has('gut')) return { text: 'El encierro: traé una Bombilla Gut (sale de la caja)', noCost: true, info: true };
        const miss = this.acidDone ? [] : this.encMissing();
        if (miss.length) return { text: missingText(miss, 'los calabozos'), noCost: true, info: true };
        return { text: this.acidDone ? 'convertir tu Bombilla Gut en Bombilla Ácida' : 'dejar la Bombilla Gut en el encierro (ritual de almas)', noCost: true };
      },
      cost: () => 0,
      use: () => {
        const w = g.weapons;
        if (this.encierro) {
          if (this.encierro.by !== this.myId() || this.encierro.state !== 'ready') return false;
          this.takeAcid();
          return true;
        }
        if (!this.kit || !w.has('gut') || w.has('gutacida')) return false;
        if (!this.acidDone && this.encMissing().length) return false;
        this.putGut();
        return true;
      },
    });
    // la silla eléctrica: dejar la bombilla ácida y llevártela de vuelta
    I.add({
      kind: 'ee',
      local: true,
      pos: this.chairPos,
      radius: 2.2,
      prompt: () => {
        if (this.step < 5 || this.freed.g3) return null;
        if (this.chair === 'empty') return g.weapons.has('gutacida') ? { text: 'poner la Bombilla Ácida en la silla eléctrica', noCost: true } : { text: 'La silla eléctrica: traé la Bombilla Ácida', noCost: true, info: true };
        if (this.chair === 'loaded') return { text: 'Salí en gaucho life y dale corriente a la silla', noCost: true, info: true };
        if (this.chair === 'done' && this.chairBy === this.myId()) return { text: 'agarrar tu Bombilla Ácida', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.chair === 'empty' && g.weapons.has('gutacida') && this.step >= 5) {
          this.putChair();
          return true;
        }
        if (this.chair === 'done' && this.chairBy === this.myId()) {
          this.takeChair();
          return true;
        }
        return false;
      },
    });
    // la caja fuerte y el mate dorado
    I.add({
      kind: 'ee',
      pos: this.safePos,
      radius: 2.2,
      prompt: () => {
        if (!this.safeOpen && this.step < 7) return { text: 'La caja fuerte del Alcaide', noCost: true, info: true };
        if (!this.safeOpen) return { text: 'La caja fuerte del Alcaide: cerradura eléctrica (dale corriente desde el gaucho life)', noCost: true, info: true };
        if (this.items.mate === 'safe') return { text: 'agarrar el mate dorado', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (!this.safeOpen || this.items.mate !== 'safe') return false;
        this.items.mate = 'held';
        this.toastAll('Conseguiste: Mate dorado');
        this.netSync();
        return true;
      },
    });
    // las llaves
    for (const [k, o] of Object.entries(this.keyObjs)) {
      I.add({
        kind: 'ee',
        pos: o.pos,
        radius: 2,
        prompt: () => (this.keys[k] === 'ground' ? { text: 'agarrar la llave', noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (this.keys[k] !== 'ground') return false;
          this.keys[k] = 'held';
          const who = { k1: 'Anacleto', k2: 'Cirilo', k3: 'Benito' }[k];
          this.toastAll(`Conseguiste: la llave de ${who}`);
          this.netSync();
          return true;
        },
      });
    }
    // la yerba dorada del patio
    I.add({
      kind: 'ee',
      pos: this.yerbaPos,
      radius: 2.2,
      prompt: () => (this.items.yerba === 'ground' ? { text: 'agarrar la yerba dorada', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.items.yerba !== 'ground') return false;
        this.items.yerba = 'held';
        this.toastAll('Conseguiste: Yerba dorada');
        this.netSync();
        this.checkBombilla();
        return true;
      },
    });
    // el altar del espinillo
    I.add({
      kind: 'ee',
      pos: this.altarPos,
      radius: 2.6,
      prompt: () => {
        if (this.fight || this.step < 7) return null;
        const next = ['mate', 'yerba', 'bombilla'].find((k) => this.items[k] === 'held' && !this.altar[k]);
        if (next) return { text: `poner ${{ mate: 'el mate dorado', yerba: 'la yerba dorada', bombilla: 'la bombilla suprema' }[next]} en el espinillo`, noCost: true };
        const miss = ['mate', 'yerba', 'bombilla'].filter((k) => !this.altar[k]);
        if (miss.length) return { text: `El espinillo: falta ${miss.map((k) => ({ mate: 'el mate dorado', yerba: 'la yerba dorada', bombilla: 'la bombilla suprema' })[k]).join(', ')}`, noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.fight || this.step < 7) return false;
        const next = ['mate', 'yerba', 'bombilla'].find((k) => this.items[k] === 'held' && !this.altar[k]);
        if (!next) return false;
        this.placeAltar(next);
        return true;
      },
    });
    // el rayo del gaucho life: la caja fuerte y la silla
    const vida = g.vida;
    if (vida) {
      // (la caja fuerte, recién cuando Benito cuenta del mate dorado: antes un
      // invitado la abrió en la ronda 1)
      vida.addTarget({ pos: this.safePos, r: 0.8, on: () => !this.safeOpen && this.step >= 7, hit: () => this.openSafe() });
      vida.addTarget({ pos: this.chairPos, r: 0.9, on: () => this.chair === 'loaded', hit: () => this.shockChair() });
    }
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  // Puede hablar con el gaucho n si ya salió el anterior.
  canTalk(n) {
    if (n === 2 && this.motin?.eeLock()) return false;
    return n === 1 || this.freed[`g${n - 1}`];
  }

  // ---------------- pasos ----------------
  say(id, text, delay = 0) {
    const g = this.g;
    if (g.net?.guest) return;
    const fn = () => g.say(SPEAKER[id], text, 'npc');
    if (delay) g.later(delay, fn);
    else fn();
  }

  lines(id, list, gap = 0.6) {
    let t = 0;
    for (const text of list) {
      this.say(id, text, t);
      t += Math.max(2.5, text.length * 0.065 + gap);
    }
    return t;
  }

  announce(text, secs = 3, sting = false) {
    const g = this.g;
    g.hud.subtitle(text, secs);
    if (sting) g.audio.sting();
    g.net?.event('sub', { x: text, d: secs, s: sting ? 1 : 0 });
  }

  toastAll(text) {
    const g = this.g;
    g.hud.toast(text);
    g.audio.sting();
    g.net?.event('toast', { x: text });
  }

  talk(id) {
    const n = Number(id[1]);
    if (!this.talked[id]) {
      this.talked[id] = true;
      this.lines(id, LINES[id].intro);
      if (n === 1 && this.step < 1) this.step = 1;
      if (n === 2 && this.step < 3) this.step = 3;
      if (n === 3 && this.step < 5) this.step = 5;
      this.netSync();
    } else this.say(id, this.remindOf(id));
    this.voiceT = 90;
  }

  // Lo que recuerda cada uno (Cirilo, después de Nicanor, el ácido).
  remindOf(id) {
    return id === 'g2' && this.ghosts?.nicanor ? LINES.g2.remindAcid : LINES[id].remind;
  }

  openCell(id) {
    const g = this.g;
    const n = Number(id[1]);
    this.keys[`k${n}`] = 'used';
    this.freed[id] = true;
    const c = this.cells[id];
    c.doorBox.active = false;
    g.world.computeNavBlock();
    g.audio.door(c.front, false);
    this.toastAll(`${c.def.name} está libre`);
    g.hud.achievement(`${c.def.name}, libre`, `Abriste la celda ${n === 1 ? 'del pabellón' : n === 2 ? 'de los calabozos' : 'de la enfermería'}`);
    if (n === 1) this.step = Math.max(this.step, 2);
    if (n === 2) this.step = Math.max(this.step, 4);
    // Anacleto suelto hace saltar la alarma: si todavía no hubo motín, viene
    // cuando él termina de hablar (entities/penalMotin.js)
    if (n === 1) this.motin?.expectEarly();
    if (n === 3) {
      this.step = Math.max(this.step, 6);
      // antes de que hable Benito, la Voz devuelve la yerba de la granja
      g.later(2.5, () => this.startYerbaScene());
    } else
      g.later(1.2, () => {
        const t = this.lines(id, LINES[id].freed);
        if (n === 1) this.motin?.afterRelease(t);
      });
    this.netSync();
  }

  // ---------------- perros ----------------
  // (5 almas por perro, las mismas juegue quien juegue: cada una la sale a comer)
  dogNeed(i) {
    return EE.dogs[i].need;
  }

  dogsFed() {
    return this.dogFed.every((n, i) => n >= this.dogNeed(i));
  }

  feedDog(i, from, eaten = false) {
    const g = this.g;
    const d = this.dogs[i];
    // (si se lo comió, el alma ya se vio salir mientras comía)
    if (!eaten) {
      g.fx.soul(from, tmpV.copy(d.pos).setY(d.pos.y + 0.8).clone());
      g.net?.event('pee', { soul: [+from.x.toFixed(1), +from.y.toFixed(1), +from.z.toFixed(1)], dog: i });
    }
    this.dogFed[i]++;
    if (this.dogFed[i] === this.dogNeed(i)) {
      g.audio.howl?.(tmpV.copy(d.pos).setY(d.pos.y + 1));
      this.announce(`Un perro se llenó de almas (${this.dogFed.filter((n, k) => n >= this.dogNeed(k)).length} de 3).`, 3, true);
      if (this.dogsFed()) {
        // el último devuelve la llave
        const k = this.keyObjs.k1;
        k.pos.set(d.pos.x, d.pos.y + 0.9, d.pos.z).addScaledVector(new THREE.Vector3(Math.sin(d.def.rot), 0, Math.cos(d.def.rot)), 1.1);
        this.keys.k1 = 'ground';
        this.announce('El perro escupió una llave vieja. La de Anacleto.', 4, true);
      }
    }
    this.netSync();
  }

  // ---------------- el kit de ácido ----------------
  takePart(id) {
    this.parts[id] = true;
    this.toastAll(`Conseguiste: ${EE.parts.find((p) => p.id === id).name}`);
    this.netSync();
  }

  buildKit() {
    const g = this.g;
    this.kit = true;
    g.audio.boardRepair(this.tablePos);
    g.fx.sparks(this.tablePos, 2, { x: 0, y: 1, z: 0 }, [0.5, 1, 0.3]);
    this.toastAll('El kit de ácido está armado: ahora el encierro de los calabozos');
    this.netSync();
  }

  // Dejás tu Bombilla Gut en el encierro (cada uno la suya).
  putGut() {
    const g = this.g;
    g.weapons.drop('gut');
    g.audio.purchase();
    // después del primer ritual, cualquiera la convierte al toque
    if (this.acidDone) {
      g.weapons.give('gutacida');
      g.hud.subtitle('Tu Bombilla Gut salió convertida en Bombilla Ácida.', 3);
      return;
    }
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'encierro' });
    else this.startEncierro(this.myId());
  }

  // El encierro es de todos: para el ritual tienen que estar todos en los calabozos.
  encMissing() {
    const p = this.encPos;
    return missingIn(this.g, this.g.world.zoneAt(p.x, p.z, p.y));
  }

  startEncierro(by) {
    const g = this.g;
    if (this.encierro) return;
    this.encierro = { by, souls: 0, need: EE.encierro.need + 3 * (this.players() - 1), state: 'ritual', spawnT: 1.5 };
    this.announce(`El encierro. Liquidá muertos adentro del círculo (${this.encierro.need} almas).`, 4, true);
    g.audio.bossArrive();
    this.netSync();
  }

  finishEncierro() {
    const g = this.g;
    this.encierro.state = 'ready';
    this.acidDone = true;
    g.zombies.setEyeColor?.(0xffc23a);
    this.toastAll('La Bombilla Ácida está lista en el encierro');
    g.hud.achievement('Bombilla Ácida', 'El ácido tomó almas en el encierro');
    this.netSync();
  }

  takeAcid() {
    const g = this.g;
    g.weapons.give('gutacida');
    g.audio.powerupGrab();
    g.hud.subtitle('La Bombilla Ácida: sus frascos se pegan y revientan. Probala con el Alcaide.', 4);
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'acidtaken' });
    else {
      this.encierro = null;
      this.netSync();
    }
  }

  // El Alcaide recibió ácido: se le derrite el cinturón y se le cae el llavero.
  onBossAcid(z) {
    // (hasta que Nicanor no cuenta dónde está la llave, el Alcaide no tiene nada que soltar)
    if (this.g.net?.guest || this.step < 3 || !this.ghosts.nicanor || this.keys.k2 !== 'none' || z.kind !== 'alcaide') return;
    const k = this.keyObjs.k2;
    k.pos.set(z.pos.x, (z.baseY || 0) + 0.6, z.pos.z);
    // (si el Alcaide estaba afuera del mapa o del otro lado de una baranda, el
    // llavero cae en el lugar alcanzable más cercano)
    const s = reachableSpot(this.g, k.pos);
    if (s) k.pos.copy(s);
    this.keys.k2 = 'ground';
    this.g.say('alcaide', '¡Mi cinturón! ¡Mis llaves! ¡Ah, gaucho degenerado!');
    this.announce('¡Al Alcaide se le derritió el llavero! La llave de Cirilo quedó en el piso.', 4, true);
    this.netSync();
  }

  // ---------------- la silla eléctrica ----------------
  putChair() {
    const g = this.g;
    g.weapons.drop('gutacida');
    g.audio.purchase();
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'chair' });
    else this.loadChair(this.myId());
  }

  loadChair(by) {
    if (this.chair !== 'empty') return;
    this.chair = 'loaded';
    this.chairBy = by;
    this.announce('La bombilla quedó en la silla. Ahora, corriente desde el gaucho life.', 3.5);
    this.netSync();
  }

  shockChair() {
    const g = this.g;
    if (this.chair !== 'loaded') return;
    this.chair = 'done';
    g.fx.flash(this.chairPos, 0x5ab8ff, 120, 1, 14);
    g.fx.electric(this.chairPos, 40);
    g.audio.tesla(this.chairPos);
    g.post?.flash(0.4);
    const k = this.keyObjs.k3;
    k.pos.copy(this.chairPos).add(new THREE.Vector3(0, 0.4, 0));
    this.keys.k3 = 'ground';
    this.announce('¡La chispa forjó una llave! La de Benito quedó sobre la silla.', 4, true);
    this.netSync();
  }

  takeChair() {
    const g = this.g;
    g.weapons.give('gutacida');
    g.audio.powerupGrab();
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'chairtaken' });
    else {
      this.chair = 'taken';
      this.netSync();
    }
  }

  // ---------------- la caja fuerte ----------------
  openSafe() {
    const g = this.g;
    if (this.safeOpen) return;
    this.safeOpen = true;
    g.audio.door(this.safePos, false);
    g.fx.electric(this.safePos, 25);
    this.announce('La caja fuerte del Alcaide se abrió. Adentro brilla un mate dorado.', 4, true);
    this.netSync();
  }

  // ---------------- la yerba de la Voz ----------------
  startYerbaScene() {
    const g = this.g;
    if (this.items.yerba !== 'none') return;
    this.items.yerba = 'falling';
    this.netSync();
    g.net?.event('pee', { scene: 1 });
    this.playScene();
  }

  // La escena de la yerba: la ven todos (cada uno en su compu), con la
  // partida quieta y sin el HUD. La Voz baja entre la tormenta, habla, y la
  // yerba de la tapera sale de ella hecha oro y baja por su luz hasta el
  // patio. Espacio la saltea; en línea, cuando termina la del anfitrión
  // termina la de todos.
  playScene() {
    const g = this.g;
    if (this.scene) return;
    const el = document.createElement('div');
    el.className = 'mdu-fcine is-on mdu-fcine--mid';
    el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"><b class="mdu-fcine__who">La Voz de Arriba</b><span></span></p><span class="mdu-cine__skip">Saltar (Espacio)</span><i class="mdu-fcine__black"></i>';
    g.root.appendChild(el);
    const S = { t: 0, el, text: el.querySelector('.mdu-fcine__text'), span: el.querySelector('.mdu-fcine__text span'), black: el.querySelector('.mdu-fcine__black'), step: 0, next: 0, shot: 'sky', shotT: 0, sub: null, fall: null };
    this.scene = S;
    S.steps = this.sceneSteps(S);
    S.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') this.sceneOut();
    };
    window.addEventListener('keydown', S.onKey);
    const V = this.voz;
    V.root.visible = true;
    V.evil = 0;
    V.beam.material.opacity = 0;
    V.root.position.set(this.yerbaPos.x, this.yerbaPos.y + 34, this.yerbaPos.z);
    this.yerbaObj.visible = false;
    this.yerbaGlow.visible = false;
    g.hud.show(false);
    // corte a negro y se abre sobre el patio, con un trueno
    this.sceneBlack(1, 0);
    void S.black.offsetWidth;
    this.sceneBlack(0, 0.7);
    g.audio.thunder?.(this.yerbaPos);
    g.post?.flash(0.8);
    if (g.weather) g.weather.flash = 1;
  }

  // Los pasos de la escena: [espera antes, acción que devuelve cuánto dura].
  sceneSteps(S) {
    return [
      // la Voz baja entre las nubes
      [0, () => 2.8],
      [0, () => {
        this.sceneShot('eye');
        return this.sceneSay(VOICE[0]);
      }],
      // la yerba sale del ojo hecha oro y baja por la luz mientras habla
      [0.2, () => {
        const d = this.sceneSay(VOICE[1]);
        this.yerbaOut(Math.max(4.2, d - 0.3));
        this.sceneShot('fall');
        return S.fall.dur;
      }],
      [0, () => {
        this.yerbaLand();
        this.sceneShot('ground');
        return 2.6;
      }],
      [0, () => {
        this.sceneOut();
        return 99;
      }],
    ];
  }

  sceneShot(name) {
    this.scene.shot = name;
    this.scene.shotT = this.scene.t;
  }

  // Lo que dice la Voz: el subtítulo va apareciendo al ritmo de la voz.
  sceneSay(text) {
    const S = this.scene;
    const d = this.g.audio.say(text, 'entidad', { cine: true });
    S.sub = { text, t0: S.t, rev: Math.max(0.5, Math.min(d * 0.85, text.length * 0.045)), k: -1 };
    S.span.textContent = '';
    S.text.classList.add('is-on');
    return d;
  }

  sceneBlack(v, fade) {
    const b = this.scene?.black;
    if (!b) return;
    b.style.transition = fade ? `opacity ${fade}s` : 'none';
    b.style.opacity = String(v);
  }

  // La yerba se forma en el ojo (un fogonazo de oro) y empieza a bajar.
  yerbaOut(dur) {
    const g = this.g;
    const S = this.scene;
    const E = this.voz.root.position;
    S.fall = { t0: S.t, dur, from: E.clone().setY(E.y - 1.3) };
    this.yerbaObj.visible = true;
    this.yerbaObj.position.copy(S.fall.from);
    g.fx.sparkle(E, [1, 0.85, 0.4], 60, 2.2);
    g.fx.flash(E, 0xffc84a, 90, 0.7, 26);
    g.post?.flash(0.5);
    g.audio.powerupSpawn?.(E.clone());
  }

  // Toca el piso del patio: un anillo de chispas de oro y la Voz se va.
  yerbaLand() {
    const g = this.g;
    const S = this.scene;
    const Y = this.yerbaPos;
    const fy = Y.y - 1.1;
    S.fall = null;
    this.yerbaObj.position.copy(Y);
    this.yerbaGlow.visible = true;
    this.yerbaGlow.position.copy(Y);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      g.fx.add.spawn(Y.x + Math.cos(a) * 0.4, fy + 0.15, Y.z + Math.sin(a) * 0.4, Math.cos(a) * 3.4, 0.5, Math.sin(a) * 3.4, { color: [1, 0.8, 0.35], size: 0.13, size1: 0, life: 0.9, drag: 2 });
    }
    g.fx.dust(tmpV.set(Y.x, fy + 0.05, Y.z), { x: 0, y: 1, z: 0 }, [0.55, 0.45, 0.3], 16);
    g.fx.flash(Y, 0xffc84a, 70, 0.7, 12);
    g.audio.powerupGrab();
    S.leaving = true;
    S.text.classList.remove('is-on');
  }

  // Cuadro a cuadro de la escena (lo llama Game después de mover al jugador):
  // el guion, la Voz, la yerba que baja y la cámara.
  sceneCam(dt) {
    const S = this.scene;
    if (!S) return false;
    // (la del espinillo se maneja sola: entities/penalForge.js)
    if (S.forge) return S.update(dt);
    const g = this.g;
    S.t += dt;
    const t = S.t;
    while (this.scene === S && S.step < S.steps.length && t >= S.next + S.steps[S.step][0]) {
      const [wait, fn] = S.steps[S.step];
      const start = S.next + wait;
      S.step++;
      const dur = fn() || 0;
      S.next = Math.max(start, t) + dur;
    }
    if (this.scene !== S) return true;
    // ni la mano del gaucho life
    if (g.vida?.hand) g.vida.hand.root.visible = false;
    const cam = g.camera;
    const Y = this.yerbaPos;
    const fy = Y.y - 1.1;
    const V = this.voz;
    const E = V.root.position;
    // la Voz: baja del cielo, flota y al final se vuelve a ir
    if (S.leaving) {
      S.leaveV = (S.leaveV || 0) + dt * 16;
      E.y += S.leaveV * dt;
    } else {
      const k = Math.min(1, t / 2.8);
      E.y = Y.y + 34 - (1 - (1 - k) ** 3) * 23 + Math.sin(t) * 0.3;
    }
    updateVoz(V, dt, t, cam.position);
    // la yerba baja por la luz
    const F = S.fall;
    const B = V.beam.material;
    if (F) {
      const u = Math.min(1, (t - F.t0) / F.dur);
      const s = u * u * (3 - 2 * u);
      this.yerbaObj.position.lerpVectors(F.from, Y, s);
      this.yerbaObj.rotation.y += dt * (2 + (1 - u) * 3);
      if (Math.random() < 0.7) g.fx.sparkle(this.yerbaObj.position, [1, 0.85, 0.4], 2, 0.3);
      B.opacity = Math.min(0.16, B.opacity + dt * 0.2);
    } else {
      B.opacity = Math.max(0, B.opacity - dt * 0.15);
      if (this.yerbaGlow.visible) {
        this.yerbaObj.rotation.y += dt;
        this.yerbaGlow.material.opacity = 0.6 + Math.sin(t * 3) * 0.2;
      }
    }
    // las tomas (todas adentro del patio)
    const st = t - S.shotT;
    if (S.shot === 'sky') {
      cam.position.set(Y.x - 3.2, fy + 1.4, Y.z + 3.4);
      cam.lookAt(tmpV.lerpVectors(Y, E, 0.85));
    } else if (S.shot === 'eye') {
      cam.position.set(Y.x + 2.8 - st * 0.1, fy + 3.2 + st * 0.12, Y.z + 3.6 - st * 0.1);
      cam.lookAt(E);
    } else if (S.shot === 'fall') {
      // desde el patio, un poco más abajo que la yerba: arriba queda el ojo
      const P = this.yerbaObj.position;
      cam.position.set(Y.x + 3.2, Math.min(Y.y + 5, Math.max(fy + 0.8, P.y - 2.5)), Y.z + 3.4);
      cam.lookAt(tmpV.copy(P).setY(P.y + 0.3));
    } else {
      cam.position.set(Y.x + 1.9 + st * 0.12, fy + 0.6 + st * 0.08, Y.z + 2.3 + st * 0.14);
      cam.lookAt(tmpV.set(Y.x, Y.y - 0.15 + st * 0.3, Y.z));
    }
    // el subtítulo, letra por letra
    const sub = S.sub;
    if (sub) {
      const k = Math.min(sub.text.length, Math.floor(((t - sub.t0) / sub.rev) * sub.text.length));
      if (k !== sub.k) {
        sub.k = k;
        S.span.textContent = sub.text.slice(0, k);
      }
    }
    return true;
  }

  // Cierre: a negro y, del otro lado, de vuelta a la partida.
  sceneOut() {
    const S = this.scene;
    if (!S || S.out) return;
    S.out = true;
    this.sceneBlack(1, 0.35);
    setTimeout(() => {
      if (this.scene === S) this.endScene();
    }, 380);
  }

  endScene() {
    const g = this.g;
    const S = this.scene;
    if (!S) return;
    this.scene = null;
    window.removeEventListener('keydown', S.onKey);
    S.el.remove();
    this.voz.root.visible = false;
    this.yerbaObj.position.copy(this.yerbaPos);
    if (g.state === 'playing' || g.state === 'paused') g.hud.show(true);
    g.player.guardT = g.time + 2;
    // se vuelve a la partida desde negro
    const black = document.createElement('i');
    black.className = 'mdu-fcine__black';
    black.style.cssText = 'opacity:1;z-index:50;transition:none';
    g.root.appendChild(black);
    void black.offsetWidth;
    black.style.transition = 'opacity 0.5s';
    black.style.opacity = '0';
    setTimeout(() => black.remove(), 700);
    if (!g.net?.guest) {
      this.items.yerba = 'ground';
      if (this.items.agua === 'none') this.items.agua = 'asked';
      this.announce('La yerba dorada quedó en el patio de recreo.', 4, true);
      this.netSync();
      g.net?.event('pee', { scene: 2 });
      // y ahora sí habla Benito: para la bombilla quiere agua embrujada del río
      g.later(1, () => this.lines('g3', LINES.g3.water));
    }
  }

  // Benito te da la bombilla suprema y se abre el cerro.
  checkBombilla(force = false) {
    const g = this.g;
    if (g.net?.guest || this.items.bombilla !== 'none' || !this.freed.g3 || this.items.agua !== 'given' || (!force && this.items.yerba === 'falling')) return;
    this.items.bombilla = 'held';
    this.step = 7;
    this.toastAll('Conseguiste: Bombilla suprema');
    const gates = g.interact.list.filter((x) => x.kind === 'door' && x.door.def.kind === 'cerro' && !x.door.open);
    if (gates.length) g.later(3, () => {
      for (const it of gates) if (!it.door.open) g.interact.openDoor(it.door);
      this.announce('Se abrió el portón de la capilla, el camino al cerro del Espinillo.', 4, true);
    });
    this.netSync();
  }

  placeAltar(k) {
    const g = this.g;
    this.altar[k] = true;
    this.items[k] = 'altar';
    g.audio.purchase();
    g.fx.sparkle(this.altarPos, [1, 0.8, 0.4], 25, 0.6);
    this.netSync();
    if (Object.values(this.altar).every(Boolean)) {
      this.fight = true;
      this.netSync();
      // se arma y muestra lo que es: la escena del espinillo (la ven todos);
      // cuando termina, viene el Gil (endForge)
      g.net?.event('pee', { scene: 3 });
      this.playForge();
    }
  }

  // El Mate Supremo se arma en el espinillo (entities/penalForge.js).
  playForge() {
    if (this.scene) return;
    this.scene = new PenalForge(this, () => this.endForge());
  }

  endForge() {
    const g = this.g;
    this.scene = null;
    if (g.net?.guest) return;
    // (termina la de todos)
    g.net?.event('pee', { scene: 4 });
    this.announce('Algo se mueve entre las banderas...', 3, true);
    g.later(1, () => g.arena.start());
  }

  // ---------------- ganchos del juego ----------------
  onPower() {}

  onZone() {}

  onShot() {}

  onExplosion() {}

  dropHat() {}

  onKill(z) {
    const g = this.g;
    if (g.net?.guest || z.boss) return;
    const p = z.pos;
    // los perros comen almas (después de que Anacleto explicó)
    if (this.step >= 1 && !this.freed.g1 && this.keys.k1 === 'none') {
      for (const d of this.dogs) {
        if (this.dogFed[d.i] >= this.dogNeed(d.i)) continue;
        if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) > d.def.r || Math.abs(p.y - d.pos.y) > 2) continue;
        // sale a comérselo; si ya está comiendo, ese no cuenta (hay que
        // esperarlo). Volviendo a la cucha sí: da la vuelta y sale de nuevo.
        if (d.state === 'out' || d.state === 'eat') {
          if (g.time - (this.busyT || -99) > 8) {
            this.busyT = g.time;
            this.announce('El perro está comiendo: esperá que termine para darle otro.', 3, true);
          }
          return;
        }
        this.dogEat(d, z);
        return;
      }
    }
    // el encierro
    const E = this.encierro;
    if (E && E.state === 'ritual' && Math.hypot(p.x - this.encPos.x, p.z - this.encPos.z) < EE.encierro.r + 2.5) {
      g.fx.soul(p, this.encTop);
      g.net?.event('pee', { esoul: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] });
      E.souls++;
      if (E.souls >= E.need) this.finishEncierro();
      else if (E.souls % 3 === 0) this.netSync();
    }
  }

  // ---------------- el cuchillo de Anacleto ----------------
  registerKnife() {
    const g = this.g;
    const I = g.interact;
    const c = this.cells.g1;
    // Anacleto da su cuchillo (a cada uno el suyo); si lo cambiaste por la pava, te lo vuelve a dar
    I.add({
      kind: 'ee',
      local: true,
      pos: c.front.clone().setY(c.y + 1.3),
      radius: 2.4,
      prompt: () => {
        if (!this.freed.g1) return null;
        const t = g.weapons.tactical;
        if (t?.id === 'cuchillo' || this.kn?.by === this.myId()) return null;
        return { text: t?.id === 'pava' ? 'cambiarle a Anacleto tu pava por el cuchillo' : `agarrar el ${knifeName(this.myKnifeUp)} de Anacleto`, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!this.freed.g1 || g.weapons.tactical?.id === 'cuchillo' || this.kn?.by === this.myId()) return false;
        this.giveKnife(this.myKnifeUp);
        if (!this.myKnifeUp) g.say(SPEAKER.g1, LINES.g1.knife, 'npc', { local: true });
        return true;
      },
    });
    // la cuchilla mejorada, lista en el Pack-a-Pava (solo para el que la tiró)
    const pap = g.interact.pap;
    if (!pap) return;
    I.add({
      kind: 'ee',
      local: true,
      pos: pap.slotPos.clone().addScaledVector(pap.face, 0.4).setY(pap.slotPos.y + 0.3),
      radius: 2.6,
      prompt: () => (this.kn?.by === this.myId() && this.kn.state === 'ready' ? { text: `agarrar la ${knifeName(1)}`, noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.kn?.by !== this.myId() || this.kn.state !== 'ready') return false;
        this.takePapKnife();
        return true;
      },
    });
  }

  giveKnife(up) {
    const g = this.g;
    g.weapons.tactical = { id: 'cuchillo', count: 1, up: up ? 1 : 0 };
    g.weapons.updateHud();
    g.audio.powerupGrab();
    g.hud.subtitle(`${knifeName(up)}: ${keyLabel('tactical')} lo tira y vuelve solo. Busca muertos y levanta potenciadores.`, 4);
    this.lastTac = 'cuchillo';
  }

  // El cuchillo de este jugador entró al Pack-a-Pava. true si la máquina se lo queda.
  knifeIntoPap(up) {
    const g = this.g;
    const pap = g.interact.pap;
    let why = null;
    if (up) why = 'Tu cuchilla ya salió del Pack-a-Pava.';
    else if ((g.papq && !g.papq.done) || !g.interact.machineOn(pap)) why = 'El Pack-a-Pava está apagado: el cuchillo rebotó.';
    else if (this.kn || pap.state !== 'idle' || this.items.agua === 'pap' || this.items.agua === 'ready') why = 'El Pack-a-Pava está ocupado: el cuchillo rebotó.';
    else if (!this.knifeDone) {
      const miss = this.encM.missing();
      if (miss.length) why = missingText(miss, 'la ermita');
    }
    if (why) {
      g.hud.subtitle(why, 3);
      return false;
    }
    g.audio.pap(pap.slotPos);
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'kpap' });
    else this.startKnifePap(this.myId());
    return true;
  }

  // (anfitrión) La primera vez es un encierro en la ermita; después sale al toque.
  startKnifePap(by) {
    const g = this.g;
    if (this.kn) {
      if (by !== this.myId()) g.net?.net.to(by, { t: 'ev', e: 'pee', kno: 1 });
      return;
    }
    const ritual = !this.knifeDone;
    this.kn = { by, state: ritual ? 'ritual' : 'cook', t: 0, dur: ritual ? KNIFE_RITUAL : 3.4, boss: false };
    if (ritual) {
      this.encM.start();
      this.announce(`¡El Pack-a-Pava se tragó el cuchillo y la ermita se cerró! Aguanten ${KNIFE_RITUAL} segundos.`, 4, true);
    }
    this.netSync();
  }

  takePapKnife() {
    const g = this.g;
    this.myKnifeUp = true;
    this.giveKnife(1);
    this.kn = null;
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'ktaken' });
    else this.netSync();
  }

  // Cada cuadro: el vuelo, la cortina de la ermita y (el anfitrión) el encierro.
  updateKnife(dt) {
    const g = this.g;
    this.knife.update(dt);
    const K = this.kn;
    const want = K?.state === 'ritual' || this.items.agua === 'pap';
    if (want && !this.encM.on) this.encM.start();
    else if (!want && this.encM.on) this.encM.stop();
    this.encM.update(dt);
    // compraste la pava en la caja: el cuchillo vuelve a Anacleto
    const tac = g.weapons.tactical?.id || null;
    if (this.lastTac === 'cuchillo' && tac === 'pava') g.hud.subtitle('Cambiaste el cuchillo por la pava. Anacleto te lo vuelve a dar cuando quieras.', 4);
    this.lastTac = tac;
    this.updatePapKnife();
    if (g.net?.guest && this.items.agua === 'pap') this.waterT += dt;
    this.updateWater(dt);
    if (!K) return;
    K.t += dt;
    if (g.net?.guest) return;
    // el que lo tiró se fue de la partida
    if (g.net && K.by !== this.myId() && !g.net.remote.has(K.by)) {
      this.kn = null;
      this.netSync();
      return;
    }
    if (K.state === 'ritual') {
      // muchos y corriendo; a mitad de camino, el Alcaide
      this.ritualSpawns(dt);
      if (!K.boss && K.t > K.dur * 0.4) {
        K.boss = true;
        this.ritualBoss();
      }
      if (K.t >= K.dur) {
        K.state = 'ready';
        K.t = 0;
        this.knifeDone = true;
        this.announce('¡Aguantaron! La Cuchilla del Matarife está lista en el Pack-a-Pava.', 4, true);
        g.hud.achievement('La Cuchilla del Matarife', 'Aguantaste el encierro de la ermita');
        this.netSync();
      }
    } else if (K.state === 'cook' && K.t >= K.dur) {
      K.state = 'ready';
      K.t = 0;
      this.netSync();
    }
  }

  // El cuchillo adentro de la máquina: gira sobre la pava mientras dura y sale adelante.
  updatePapKnife() {
    const g = this.g;
    const K = this.kn;
    const pap = g.interact.pap;
    const ready = K?.state === 'ready';
    if (this.papKnife && (!K || this.papKnife.userData.up !== ready)) {
      this.papKnife.removeFromParent();
      this.papKnife = null;
    }
    if (!K || !pap) return;
    if (!this.papKnife) {
      this.papKnife = buildCleaver(ready ? 1 : 0);
      this.papKnife.userData.up = ready;
      this.papKnife.scale.setScalar(2.2);
      this.root.add(this.papKnife);
    }
    const m = this.papKnife;
    const t = g.time;
    if (ready) {
      m.position.copy(pap.slotPos).addScaledVector(pap.face, 0.25);
      m.position.y += Math.sin(t * 3) * 0.04;
      m.rotation.set(0, t * 1.5, 0);
      if (Math.random() < 0.3) g.fx.sparkle(m.position, [1, 0.3, 0.2], 1, 0.3);
    } else {
      m.position.copy(pap.group.position);
      m.position.y += 3 + Math.sin(t * 2) * 0.1;
      m.rotation.set(t * 3, t * 2, 0);
      if (Math.random() < 0.4) g.fx.sparkle(m.position, [0.8, 0.4, 1], 1, 0.4);
    }
  }

  // Los muertos del encierro de la ermita: muchos y corriendo.
  ritualSpawns(dt) {
    const g = this.g;
    if (!this.encM.spawns(dt, 0.9)) return;
    const z = g.zombies.pool.find((q) => q.active && q.id === g.zombies.idc);
    if (z && !z.dead) {
      z.speedType = 'sprint';
      z.speed = SPEEDS.sprint * (0.92 + Math.random() * 0.16);
    }
  }

  // A mitad del encierro entra el Alcaide por la puerta de la ermita.
  ritualBoss() {
    const g = this.g;
    if (!g.zombies.boss) g.zombies.spawnBoss(Math.max(8, g.rounds.round), { at: new THREE.Vector3(13, this.floor(13, 128.8), 128.8) });
  }

  // ---------------- el agua embrujada ----------------
  // En el islote: la damajuana se deja en el Pack-a-Pava (encierro) y, embrujada, se saca.
  registerWater() {
    const g = this.g;
    const pap = g.interact.pap;
    if (!pap) return;
    const at = pap.slotPos.clone().addScaledVector(pap.face, 0.45).setY(pap.slotPos.y + 0.3);
    at.x += 0.35;
    g.interact.add({
      kind: 'ee',
      pos: at,
      radius: 2.6,
      prompt: () => {
        const a = this.items.agua;
        if (a === 'ready') return { text: 'agarrar el agua embrujada', noCost: true };
        if (a !== 'boat') return null;
        const why = this.waterBlock();
        return why ? { text: why, noCost: true, info: true } : { text: 'dejar la damajuana en el Pack-a-Pava (encierro)', noCost: true };
      },
      cost: () => 0,
      use: () => {
        const a = this.items.agua;
        if (a === 'ready') {
          this.takeWater();
          return true;
        }
        if (a !== 'boat' || this.waterBlock()) return false;
        this.startWater();
        return true;
      },
    });
  }

  // Por qué no se puede dejar el agua todavía (null si se puede).
  waterBlock() {
    const g = this.g;
    const pap = g.interact.pap;
    if ((g.papq && !g.papq.done) || !g.interact.machineOn(pap)) return 'El Pack-a-Pava está apagado: primero hay que prenderlo';
    if (this.kn || pap.state !== 'idle') return 'El Pack-a-Pava está ocupado';
    const miss = this.encM.missing();
    return miss.length ? missingText(miss, 'la ermita') : null;
  }

  startWater() {
    const g = this.g;
    this.items.agua = 'pap';
    this.waterT = 0;
    this.waterBoss = false;
    g.audio.pap(g.interact.pap.slotPos);
    this.encM.start();
    this.announce(`¡San La Muerte se quedó con el agua y la ermita se cerró! Aguanten ${WATER_RITUAL} segundos.`, 4, true);
    this.netSync();
  }

  takeWater() {
    this.items.agua = 'held';
    this.g.audio.powerupGrab();
    this.toastAll('Conseguiste: Agua embrujada');
    this.announce('Llévenle el agua embrujada a Benito, a la enfermería. El bote los espera en el muellecito.', 5, true);
    this.netSync();
  }

  // Cada cuadro: la damajuana en el Pack-a-Pava y (el anfitrión) el encierro del agua.
  updateWater(dt) {
    const g = this.g;
    const a = this.items.agua;
    const pap = g.interact.pap;
    const show = (a === 'pap' || a === 'ready') && pap;
    if (show && !this.papJug) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8, emissive: 0x3aff4a, emissiveIntensity: 1 });
      const jug = new THREE.Group();
      jug.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat));
      jug.add(mesh(cylGeo(0.05, 0.06, 0.2, 8), mat, 0, 0.28, 0));
      jug.add(mesh(new THREE.TorusGeometry(0.25, 0.035, 5, 14), this.M.rope || this.M.woodDark, 0, -0.05, 0, Math.PI / 2, 0, 0));
      jug.userData.mat = mat;
      this.root.add(jug);
      this.papJug = jug;
    }
    if (!show && this.papJug) {
      this.papJug.removeFromParent();
      this.papJug = null;
    }
    if (this.papJug) {
      const m = this.papJug;
      const t = g.time;
      const ready = a === 'ready';
      if (ready) {
        m.position.copy(pap.slotPos).addScaledVector(pap.face, 0.3);
        m.position.y += 0.1 + Math.sin(t * 3) * 0.04;
      } else {
        m.position.copy(pap.group.position);
        m.position.y += 3 + Math.sin(t * 2) * 0.12;
      }
      m.rotation.y = t * (ready ? 1 : 2.5);
      m.userData.mat.emissive.setHex(ready ? 0x9a5aff : 0x3aff4a);
      m.userData.mat.emissiveIntensity = 1 + Math.sin(t * 5) * 0.3;
      if (Math.random() < 0.35) g.fx.sparkle(m.position, ready ? [0.7, 0.45, 1] : [0.4, 1, 0.4], 1, 0.35);
    }
    if (a !== 'pap' || g.net?.guest) return;
    this.waterT += dt;
    this.ritualSpawns(dt);
    if (!this.waterBoss && this.waterT > WATER_RITUAL * 0.4) {
      this.waterBoss = true;
      this.ritualBoss();
    }
    if (this.waterT >= WATER_RITUAL) {
      this.items.agua = 'ready';
      this.announce('¡Aguantaron! San La Muerte embrujó el agua. Agárrenla del Pack-a-Pava y llévensela a Benito.', 5, true);
      this.netSync();
    } else if (Math.floor(this.waterT) % 10 === 0 && Math.floor(this.waterT - dt) % 10 !== 0) this.netSync();
  }

  giveWater() {
    const g = this.g;
    this.items.agua = 'given';
    g.audio.powerupGrab();
    this.netSync();
    this.lines('g3', LINES.g3.freed);
    g.later(4, () => this.checkBombilla(true));
  }

  // ---------------- atajos de prueba ----------------
  // Alt+N (solo): Anacleto libre, el cuchillo en la mano, el Pack-a-Pava con
  // corriente, las puertas abiertas y vos en la ermita del islote (con el bote ahí).
  debugKnife() {
    const g = this.g;
    g.addPoints(20000, null, true);
    // (la partida arranca en gaucho life: con el alma no se tira nada)
    if (g.vida?.active) g.vida.leave(true);
    if (!this.freed.g1) {
      this.talked.g1 = true;
      this.freed.g1 = true;
      this.cells.g1.doorBox.active = false;
      this.keys.k1 = 'used';
      this.step = Math.max(this.step, 2);
      g.world.computeNavBlock();
    }
    for (const it of g.interact.list) if (it.kind === 'door' && !it.door.open && it.door.def.kind !== 'cerro') g.interact.openDoor(it.door);
    g.papq?.finish();
    if (g.interact.pap) g.interact.powerMachine(g.interact.pap);
    this.giveKnife(this.myKnifeUp);
    this.boat.debugReady('isle');
    this.toErmita();
    g.hud.subtitle(`Modo prueba: Anacleto libre y el cuchillo en la mano (${keyLabel('tactical')}). Estás en la ermita y el Pack-a-Pava ya tiene corriente: tiralo adentro.`, 5);
  }

  // (atajos) Parado en la ermita, mirando al Pack-a-Pava.
  toErmita() {
    const g = this.g;
    g.activateZone('L');
    const p = g.player;
    p.pos.set(13, g.world.floorAt(13, 131), 131);
    p.vel.set(0, 0, 0);
    p.yaw = Math.PI;
    p.pitch = 0;
  }

  // Alt+B (solo): los tres libres, Benito pidiendo el agua, el bote armado, el
  // Pack-a-Pava de la ermita con corriente y vos parado en el muelle al lado.
  debugBoat() {
    const g = this.g;
    g.addPoints(20000, null, true);
    if (g.vida?.active) g.vida.leave(true);
    for (const id of ['g1', 'g2', 'g3']) {
      this.talked[id] = true;
      if (!this.freed[id]) {
        this.freed[id] = true;
        this.cells[id].doorBox.active = false;
      }
    }
    g.world.computeNavBlock();
    this.keys = { k1: 'used', k2: 'used', k3: 'used' };
    this.step = Math.max(this.step, 6);
    if (this.items.yerba === 'none' || this.items.yerba === 'falling') this.items.yerba = 'held';
    if (this.items.agua === 'none') this.items.agua = 'asked';
    for (const it of g.interact.list) if (it.kind === 'door' && !it.door.open && it.door.def.kind !== 'cerro') g.interact.openDoor(it.door);
    g.papq?.finish();
    if (g.interact.pap) g.interact.powerMachine(g.interact.pap);
    this.boat.debugReady('land');
    const p = g.player;
    const [x, z] = DOCKS.land.pier[1];
    p.pos.set(x, g.world.floorAt(x, z), z);
    p.vel.set(0, 0, 0);
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    g.hud.subtitle('Modo prueba: Benito pidió el agua y el bote ya está armado. Subí con F (vas al timón): zarpás solo al islote.', 5);
  }

  // ---------------- red ----------------
  // Lo que pide un invitado (su bombilla entra o sale de algún lado).
  onGuest(m, from) {
    if (m.a === 'kt') {
      if (Array.isArray(m.kt)) {
        this.knife.ghost(m.kt, from);
        this.g.net.event('pee', { kt: m.kt, by: from });
      }
      return;
    }
    if (m.a === 'kpap') this.startKnifePap(from);
    else if (m.a === 'ktaken') {
      if (this.kn?.by === from) {
        this.kn = null;
        this.netSync();
      }
    } else if (m.a === 'board' || m.a === 'unboard' || m.a === 'helm') this.boat.onGuest(m, from);
    else if (m.a === 'encierro') this.startEncierro(from);
    else if (m.a === 'acidtaken' && this.encierro?.by === from) {
      this.encierro = null;
      this.netSync();
    } else if (m.a === 'skull' || m.a === 'gutgrab' || m.a === 'nicanor') this.ghosts.onGuest(m, from);
    else if (m.a === 'chair') this.loadChair(from);
    else if (m.a === 'chairtaken' && this.chairBy === from) {
      this.chair = 'taken';
      this.netSync();
    }
  }

  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  fullState() {
    const E = this.encierro;
    return {
      step: this.step,
      talked: this.talked,
      freed: this.freed,
      keys: this.keys,
      kpos: Object.fromEntries(Object.entries(this.keyObjs).map(([k, o]) => [k, o.pos.toArray().map((v) => +v.toFixed(2))])),
      dogs: this.dogFed,
      parts: this.parts,
      kit: this.kit ? 1 : 0,
      acid: this.acidDone ? 1 : 0,
      enc: E ? [E.by, E.souls, E.need, E.state] : null,
      chair: this.chair,
      chairBy: this.chairBy ?? -1,
      safe: this.safeOpen ? 1 : 0,
      items: this.items,
      altar: this.altar,
      fight: this.fight ? 1 : 0,
      kn: this.kn ? [this.kn.by, this.kn.state, +this.kn.t.toFixed(1), this.kn.dur] : null,
      kdone: this.knifeDone ? 1 : 0,
      wt: +this.waterT.toFixed(1),
      boat: this.boat.netState(),
      lift: this.lift.netState(),
      sk: this.ghosts.netState(),
      mo: this.motin.state(),
    };
  }

  applyRemote(m) {
    const g = this.g;
    // el motín (entities/penalMotin.js); el estado entero también lo trae
    if (m.mo || m.mwail) {
      this.motin?.applyNet(m);
      if (m.step === undefined) return;
    }
    if (m.song) {
      this.song.applyRemote(m.song);
      return;
    }
    // el cuchillo de un compañero, el bote navegando y el agua que se vuelve verde
    if (m.kt) {
      if (m.by !== this.myId()) this.knife.ghost(m.kt, m.by);
      return;
    }
    if (m.bp) {
      this.boat.applyPose(m);
      return;
    }
    if (m.magic) {
      this.boat.applyRemote(m);
      return;
    }
    // una calavera del gaucho life se rompió; la Bombilla Gut del Alcaide es mía
    if (m.skb !== undefined) {
      this.ghosts.burst(m.skb);
      return;
    }
    if (m.gutyou) {
      this.ghosts.given();
      return;
    }
    // el Pack-a-Pava ya estaba ocupado: el cuchillo vuelve a la mano
    if (m.kno) {
      const t = g.weapons.tactical;
      if (t?.id === 'cuchillo') {
        t.count = 1;
        g.weapons.updateHud();
      }
      g.hud.subtitle('El Pack-a-Pava está ocupado: el cuchillo volvió a tu mano.', 3);
      return;
    }
    // la escena del espinillo: 3 arranca, 4 terminó la del anfitrión
    if (m.scene === 3) {
      this.playForge();
      return;
    }
    if (m.scene === 4) {
      if (this.scene?.forge) this.scene.out();
      return;
    }
    // la escena de la yerba: 1 arranca, 2 terminó la del anfitrión
    if (m.scene === 2) {
      this.sceneOut();
      return;
    }
    if (m.scene) {
      this.playScene();
      return;
    }
    if (m.deat !== undefined) {
      const d = this.dogs[m.deat];
      if (d) this.startEat(d, new THREE.Vector3(...m.at));
      return;
    }
    if (m.soul) {
      const d = this.dogs[m.dog];
      if (d) g.fx.soul(new THREE.Vector3(...m.soul), d.pos.clone().setY(d.pos.y + 0.8));
      return;
    }
    if (m.esoul) {
      g.fx.soul(new THREE.Vector3(...m.esoul), this.encTop);
      if (this.encierro) this.encierro.souls++;
      return;
    }
    if (m.step !== undefined) this.step = m.step;
    if (m.talked) this.talked = { ...m.talked };
    if (m.freed) {
      for (const [id, v] of Object.entries(m.freed)) {
        if (v && !this.freed[id]) {
          this.cells[id].doorBox.active = false;
          g.world.computeNavBlock();
        }
      }
      this.freed = { ...m.freed };
    }
    if (m.keys) this.keys = { ...m.keys };
    if (m.kpos) for (const [k, p] of Object.entries(m.kpos)) this.keyObjs[k].pos.fromArray(p);
    if (m.dogs) this.dogFed = [...m.dogs];
    if (m.parts) this.parts = { ...m.parts };
    if (m.kit !== undefined) this.kit = !!m.kit;
    if (m.acid !== undefined) this.acidDone = !!m.acid;
    if (m.enc !== undefined) this.encierro = m.enc ? { by: m.enc[0], souls: m.enc[1], need: m.enc[2], state: m.enc[3] } : null;
    if (m.chair) this.chair = m.chair;
    if (m.chairBy !== undefined) this.chairBy = m.chairBy;
    if (m.safe !== undefined) this.safeOpen = !!m.safe;
    if (m.items) this.items = { ...m.items };
    if (m.altar) this.altar = { ...m.altar };
    if (m.fight !== undefined) this.fight = !!m.fight;
    if (m.kn !== undefined) this.kn = m.kn ? { by: m.kn[0], state: m.kn[1], t: m.kn[2], dur: m.kn[3] } : null;
    if (m.kdone !== undefined) this.knifeDone = !!m.kdone;
    if (m.wt !== undefined) this.waterT = m.wt;
    if (m.boat) this.boat.applyState(m.boat);
    if (m.lift) this.lift.applyState(m.lift);
    if (m.lz) this.lift.applyRiders(m.lz);
    if (m.sk) this.ghosts.applyState(m.sk);
  }

  // Alt+K (solo): los tres gauchos libres, todo en la mano y el cerro abierto.
  debugFinal() {
    const g = this.g;
    for (const id of ['g1', 'g2', 'g3']) {
      this.talked[id] = true;
      if (!this.freed[id]) {
        this.freed[id] = true;
        this.cells[id].doorBox.active = false;
      }
    }
    g.world.computeNavBlock();
    this.keys = { k1: 'used', k2: 'used', k3: 'used' };
    for (const k of Object.keys(this.parts)) this.parts[k] = true;
    this.kit = true;
    this.acidDone = true;
    this.safeOpen = true;
    this.items = { mate: 'held', yerba: 'held', bombilla: 'held', agua: 'given' };
    this.step = 7;
    for (const it of g.interact.list) if (it.kind === 'door' && it.door.def.kind === 'cerro' && !it.door.open) g.interact.openDoor(it.door);
    if (!g.weapons.has('gutacida')) g.weapons.give('gutacida');
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.npc.update(dt);
    this.updateKnife(dt);
    this.ghosts.update(dt);
    this.boat.update(dt);
    this.lift.update(dt);
    this.song.update(dt);
    this.plane.update(dt);
    // los gauchos: los libres se paran y miran a quien tengan cerca
    for (const [id, c] of Object.entries(this.cells)) {
      const r = c.npc;
      if (this.freed[id]) {
        r.crouch = false;
        c.open = Math.min(1, c.open + dt * 1.5);
        const p = g.player.pos;
        r.yaw += ((Math.atan2(p.x - r.pos.x, p.z - r.pos.z) + Math.PI) - r.yaw) * Math.min(1, dt * 2);
      }
      c.door.rotation.y = -c.open * 1.9;
      // cuando uno se acerca por primera vez, el gaucho llama (cada uno lo escucha en su compu)
      const n = Number(id[1]);
      if (!this.talked[id] && !this.freed[id] && this.canTalk(n) && !c.called) {
        const d = Math.hypot(g.player.pos.x - c.front.x, g.player.pos.z - c.front.z);
        if (d < 7 && Math.abs(g.player.pos.y - c.y) < 2) {
          c.called = true;
          g.say(SPEAKER[id], n === 1 ? '¡Psst! ¡Vos! Vení, acercate a la reja.' : n === 2 ? '¿Quién anda ahí? Si te manda Anacleto, vení.' : '¿Son pasos de vivo? ¡Acá, en la celda!', 'npc', { local: true });
        }
      }
    }
    // los perros: respiran y gruñen; los que comieron se echan
    for (const d of this.dogs) {
      const full = this.dogFed[d.i] >= this.dogNeed(d.i);
      const active = this.step >= 1 && !full && !this.freed.g1;
      this.animateDog(d, dt, t);
      if (d.state === 'idle') {
        d.dog.body.scale.y = 1 + Math.sin(t * (active ? 5 : 2) + d.i) * 0.03;
        d.dog.body.position.y = full ? -0.25 : 0;
        d.dog.body.rotation.z = full ? 0.25 : 0;
        d.dog.body.rotation.x = 0;
        d.dog.head.rotation.x = active ? Math.sin(t * 7 + d.i) * 0.08 : full ? 0.35 : 0;
        d.dog.g.rotation.y += Math.atan2(Math.sin(-d.dog.g.rotation.y), Math.cos(-d.dog.g.rotation.y)) * Math.min(1, dt * 4);
        for (const l of d.dog.legs) l.rotation.x = 0;
        d.dog.tail.rotation.x = active ? Math.sin(t * 6 + d.i) * 0.3 : 0;
      }
      d.ring.material.opacity = active ? 0.35 + Math.sin(t * 5) * 0.12 : 0;
      d.ring.visible = active;
      d.glow.visible = active;
      if (active) d.glow.material.opacity = 0.3 + (this.dogFed[d.i] / this.dogNeed(d.i)) * 0.6;
    }
    // piezas y mesa
    for (const p of Object.values(this.partObjs)) {
      const got = this.parts[p.def.id];
      p.g.visible = !got;
      p.glow.visible = !got;
      p.g.rotation.y += dt;
      p.glow.material.opacity = 0.35 + Math.sin(t * 3 + p.pos.x) * 0.15;
    }
    for (const [id, o] of Object.entries(this.tableParts)) o.visible = !this.kit && this.parts[id];
    this.kitObj.visible = this.kit;
    // el encierro
    const E = this.encierro;
    const ritual = E?.state === 'ritual';
    this.encRing.visible = ritual;
    this.encRing.material.opacity = ritual ? 0.45 + Math.sin(t * 6) * 0.15 : 0;
    const showGun = !!E;
    if (showGun && !this.encGun) {
      this.encGun = this.gunModel(E.state === 'ready');
      this.encGun.position.copy(this.encTop);
      this.root.add(this.encGun);
    }
    if (this.encGun && (!showGun || this.encGun.userData.acid !== (E?.state === 'ready'))) {
      this.encGun.removeFromParent();
      this.encGun = null;
    }
    if (this.encGun) this.encGun.rotation.y += dt;
    if (ritual) {
      g.hud.setCraftText?.(`<span>Encierro</span><b>${E.souls} / ${E.need}</b>`);
      if (!g.net?.guest) this.encierroSpawns(dt);
      if (Math.random() < dt * 8) {
        const a = Math.random() * Math.PI * 2;
        g.fx.sparkle(tmpV.set(this.encPos.x + Math.cos(a) * EE.encierro.r, this.encPos.y + 0.2, this.encPos.z + Math.sin(a) * EE.encierro.r), [0.5, 1, 0.3], 1, 0.2);
      }
    } else if (this.kn?.state === 'ritual') g.hud.setCraftText?.(`<span>Encierro de la ermita</span><b>${Math.max(0, Math.ceil(this.kn.dur - this.kn.t))} s</b>`);
    else if (this.items.agua === 'pap') g.hud.setCraftText?.(`<span>Encierro del agua</span><b>${Math.max(0, Math.ceil(WATER_RITUAL - this.waterT))} s</b>`);
    else if (this.boat.hudText()) g.hud.setCraftText?.(this.boat.hudText());
    else if (this.lift.hudText()) g.hud.setCraftText?.(this.lift.hudText());
    else if (this.step >= 1 && !this.freed.g1 && this.keys.k1 === 'none') {
      const fed = this.dogFed.filter((n, i) => n >= this.dogNeed(i)).length;
      g.hud.setCraftText?.(`<span>Perros</span><b>${fed} / 3</b>`);
    } else g.hud.setCraftText?.(null);
    // la silla
    const chairShow = this.chair === 'loaded' || this.chair === 'done';
    if (chairShow && !this.chairGun) {
      this.chairGun = this.gunModel(true);
      this.chairGun.position.copy(this.chairPos).add(new THREE.Vector3(0, 0.05, 0));
      this.root.add(this.chairGun);
    }
    if (!chairShow && this.chairGun) {
      this.chairGun.removeFromParent();
      this.chairGun = null;
    }
    this.chairGlow.visible = this.chair === 'loaded';
    if (this.chair === 'loaded') this.chairGlow.material.opacity = 0.4 + Math.sin(t * 9) * 0.2;
    // la caja fuerte
    this.safeOpenK = (this.safeOpenK || 0) + ((this.safeOpen ? 1 : 0) - (this.safeOpenK || 0)) * Math.min(1, dt * 2);
    this.safeDoor.rotation.y = -this.safeOpenK * 1.7;
    this.mateObj.visible = this.items.mate === 'safe';
    if (this.mateObj.visible) this.mateObj.rotation.y += dt * (this.safeOpen ? 1.5 : 0.3);
    // llaves en el piso
    for (const [k, o] of Object.entries(this.keyObjs)) {
      const on = this.keys[k] === 'ground';
      o.g.visible = on;
      o.glow.visible = on;
      if (on) {
        o.g.position.copy(o.pos).setY(o.pos.y + Math.sin(t * 2) * 0.08);
        o.g.rotation.y += dt * 2;
        o.glow.position.copy(o.g.position);
      }
    }
    // la yerba del patio
    if (!this.scene) {
      const onGround = this.items.yerba === 'ground';
      this.yerbaObj.visible = onGround;
      this.yerbaGlow.visible = onGround;
      if (onGround) {
        this.yerbaObj.position.copy(this.yerbaPos).setY(this.yerbaPos.y + Math.sin(t * 1.5) * 0.1);
        this.yerbaObj.rotation.y += dt;
        this.yerbaGlow.position.copy(this.yerbaObj.position);
      }
    }
    // el altar (en la cinemática del final no: la escena usa sus copias y la
    // Voz se lleva el mate; mostrar los de acá lo dejaba duplicado en la piedra)
    // (en la escena del espinillo los maneja ella: entities/penalForge.js)
    if (!g.cine && !this.scene?.forge) {
      // (armado, el mate y la bombilla son el Mate Supremo)
      const armed = this.altar.mate && this.altar.yerba && this.altar.bombilla;
      this.altarMate.visible = this.altar.mate && !armed;
      this.altarYerba.visible = this.altar.yerba;
      this.altarBomb.visible = this.altar.bombilla && !armed;
      this.altarSup.visible = armed;
      if (armed) animateSupremoDisplay(this.altarSup, dt, g.time);
    }
    this.altarGlow.visible = this.fight && !g.arena?.active && (!this.scene?.forge || !!this.scene.omenOn);
    // inventario del equipo
    const inv = {
      llave1: this.keys.k1 === 'held',
      llave2: this.keys.k2 === 'held',
      llave3: this.keys.k3 === 'held',
      frasco: this.parts.frasco && !this.kit,
      manguera: this.parts.manguera && !this.kit,
      valvula: this.parts.valvula && !this.kit,
      kit: this.kit && !this.acidDone,
      mate: this.items.mate === 'held',
      yerba: this.items.yerba === 'held',
      bombilla: this.items.bombilla === 'held',
      agua: this.items.agua === 'held' || this.items.agua === 'boat',
      timon: this.boat.timon === 'held',
    };
    const key = Object.values(inv).map((x) => (x ? 1 : 0)).join('') + (this.fight ? 'f' : '');
    if (key !== this.invKey) {
      this.invKey = key;
      g.hud.setInventory(this.fight ? null : inv, false, INV);
    }
    this.updateBeam();
    this.motin.update(dt);
    // los gauchos recuerdan lo que falta si pasa mucho sin avanzar
    if (!g.net?.guest && !this.fight && !this.scene) {
      this.voiceT -= dt;
      if (this.voiceT <= 0) {
        this.voiceT = 100;
        const who = !this.freed.g1 && this.talked.g1 ? 'g1' : this.freed.g1 && !this.freed.g2 && this.talked.g2 ? 'g2' : this.freed.g2 && !this.freed.g3 && this.talked.g3 ? 'g3' : null;
        if (who) this.say(who, this.remindOf(who));
        else if (this.freed.g3 && ['asked', 'boat', 'ready', 'held'].includes(this.items.agua) && this.boat.state !== 'sail') this.say('g3', LINES.g3.remindWater);
        else if (this.items.bombilla !== 'none' && this.items.mate === 'safe') this.say('g3', LINES.g3.freed[3]);
      }
    }
  }

  // Muertos que salen alrededor del encierro mientras dura el ritual.
  encierroSpawns(dt) {
    const g = this.g;
    const E = this.encierro;
    E.spawnT -= dt;
    if (E.spawnT > 0) return;
    E.spawnT = 1.8 / Math.sqrt(this.players());
    if (g.zombies.alive >= maxAlive(this.players())) return;
    // salen por el pasillo de los calabozos, delante de la celda
    for (let i = 0; i < 8; i++) {
      const x = 8.5 + Math.random() * 5;
      const z = this.encPos.z + (Math.random() - 0.5) * 12;
      if (g.nav.blocked(Math.floor(x), Math.floor(z)) || !Number.isFinite(g.nav.distAt(x, z))) continue;
      const round = Math.max(4, g.rounds.round);
      g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, 0, z));
      break;
    }
  }

  gunModel(acid) {
    const g = new THREE.Group();
    const M = this.M;
    g.userData.acid = acid;
    g.add(mesh(cylGeo(0.05, 0.04, 0.5, 8), M.gourd || M.wood, 0, 0.05, 0.1, Math.PI / 2, 0, 0));
    g.add(mesh(cylGeo(0.02, 0.05, 0.5, 8), M.brass, 0, 0.05, -0.35, Math.PI / 2, 0, 0));
    if (acid) g.add(mesh(cylGeo(0.04, 0.04, 0.1, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff3a).multiplyScalar(1.6), toneMapped: false }), 0, 0.14, -0.05));
    return g;
  }

  // La luz que baja del cielo sobre lo que sigue.
  updateBeam() {
    const g = this.g;
    let at = null;
    const c = (id) => this.cells[id].front;
    if (this.fight || this.motin?.eeLock()) at = null;
    else if (this.encierro?.state === 'ritual') at = this.encPos;
    else if (!this.freed.g1) at = !this.talked.g1 ? c('g1') : this.keys.k1 === 'ground' ? this.keyObjs.k1.pos : this.keys.k1 === 'held' ? c('g1') : this.dogs.find((d) => this.dogFed[d.i] < this.dogNeed(d.i))?.pos;
    else if (!this.freed.g2) at = !this.talked.g2 ? c('g2') : this.keys.k2 === 'ground' ? this.keyObjs.k2.pos : this.keys.k2 === 'held' ? c('g2') : !this.ghosts.nicanor ? this.ghosts.nic.pos : null;
    else if (!this.freed.g3) at = !this.talked.g3 ? c('g3') : this.keys.k3 === 'ground' ? this.keyObjs.k3.pos : this.keys.k3 === 'held' ? c('g3') : this.chair !== 'done' ? this.chairPos : null;
    else if (this.items.yerba === 'ground') at = this.yerbaPos;
    else if (this.items.agua === 'asked') at = this.boat.state === 'hull' || this.boat.state === 'moored' ? this.boat.pos : null;
    else if (this.items.agua === 'boat' || this.items.agua === 'ready') at = this.boat.state === 'sail' ? null : g.interact.pap?.group.position;
    else if (this.items.agua === 'held') at = c('g3');
    // (el mate dorado está en la caja fuerte de la oficina: antes la luz nunca la marcaba)
    else if (this.items.mate === 'safe' && this.items.bombilla !== 'none') at = this.safePos;
    else if (this.step >= 7) at = this.altarPos;
    const b = this.beam;
    b.visible = !!at;
    if (!at) return;
    b.position.set(at.x, at.y + 30, at.z);
    b.material.opacity = 0.05 + Math.sin(g.time * 1.5) * 0.02;
  }

  dispose() {
    this.song?.dispose();
    this.g.hud.setCraftText?.(null);
    if (this.scene?.forge) this.scene.dispose();
    if (this.scene) window.removeEventListener('keydown', this.scene.onKey);
    this.scene?.el?.remove();
    this.scene = null;
    this.npc.dispose();
    window.removeEventListener('keydown', this.onKey);
    this.knife.dispose();
    this.ghosts.dispose();
    this.boat.dispose();
    this.lift.dispose();
    this.encM.dispose();
    this.papJug?.removeFromParent();
    this.motin?.dispose();
  }
}
