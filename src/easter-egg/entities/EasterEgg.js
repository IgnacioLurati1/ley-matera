import * as THREE from 'three';
import { EE, RISERS } from '../config/map';
import { mesh, boxGeo, cylGeo, mergeByMaterial, setWellBucket } from '../world/props';
import { getMats } from '../weapons/viewmodels';
import Encierro from './Encierro';
import LuzMala from './LuzMala';

// Easter egg "La Ronda del Abuelo":
//  1. Prender la luz: aparece el fantasma del Abuelo en la capilla.
//  2. Bajar de un tiro su calabaza, arriba de todo en el almacén.
//  3. Subir el balde del aljibe del patio: ahí está la bombilla.
//  4. Cargar el barbacuá: encierro (todos adentro) hasta juntar almas. La
//     yerba se seca pero el fuego se desboca y la tapa: hay que apagarlo de
//     un soplido con el Mate Tronador (sale de la caja).
//  5. Moler la yerba: en la sala de máquinas hay una palanca por jugador;
//     cada uno baja la suya y todas tienen que estar abajo a la vez.
//  6. Calentar el agua en el fogón de la oficina (despacio, y con encierro)
//     y sacarla entre 75 y 85 °C.
//  7. Cebarle el mate al Abuelo: cada uno agarra su Mate de Oro.
//  8. El sombrero del Capataz va a su tumba, en el cementerio: de cada tumba
//     sale un peón (encierro) y sus almas solo las junta la luz mala del Mate
//     de la Luz Mala (world/Curandero.js: tres pruebas, uno por jugador).
//     La Voz de Arriba habla y manda a todos a la Salamanca, contra el Mandinga.
// En línea lo lleva el anfitrión, pero cualquiera puede hacer cada paso: los
// avisos y el premio les llegan a todos.

const LINES = {
  dark: 'Está todo oscuro, m\'hijo... Prendé la luz en la sala de máquinas.',
  intro: 'Hace más de cien años que no tomo un mate como la gente. Me falta la calabaza, la bombilla, la yerba... y el agua.',
  calabaza: 'Mi calabaza quedó arriba de todo en el almacén. Bajala de un tiro, no te vas a subir.',
  bombilla: 'La bombilla se me cayó al aljibe del patio. Subí el balde, despacito.',
  yerba: 'La yerba se seca en el barbacuá, con almas, como antes. Vayan juntos, que ese fuego no deja salir a nadie.',
  tronador: 'Ese fuego no lo apaga ni el Paraná, m\'hijo. Hace falta un mate que truene... la caja sabe cuál.',
  agua: 'El agua va al fogón de la oficina. ¡Nunca hervida! Entre setenta y cinco y ochenta y cinco grados. Y no se separen.',
  molino1: 'Ahora a moler. Bajá la palanca de la sala de máquinas.',
  molinoN: (n) => `Ahora a moler. En la sala de máquinas hay ${n} palancas. Bájenlas todas juntas, m'hijos.`,
  ready: '¡Ahora sí! Cebame uno, m\'hijo.',
  done: '¡Eso es un mate! Andá, que yo me quedo acá tranquilo.',
  hat: 'Una cosa más, m\'hijo. Cuando caiga el Capataz, llévenle el sombrero a su tumba, todos juntos. Esas almas no se juntan con balas... solo con la luz mala.',
  gotHat: 'El sombrero del Capataz. A su tumba... y prepárense, que los muertos no descansan.',
  noche: "Primero las luces malas, m'hijo. Esas no se apagan con balas: al facón.",
};
// La Voz de Arriba, cuando el cementerio se calma.
const VOZ = [
  'Los estuve observando, gauchitos. Desde el primer mate.',
  'Lo hicieron bien. Pero no se confíen, la pelea final está al caer.',
];

// Palancas del molino (sala de máquinas), repartidas por las cuatro paredes.
const LEVERS = [
  { cell: [56, 10], face: [-1, 0] },
  { cell: [31, 14], face: [1, 0] },
  { cell: [52, 3], face: [0, 1] },
  { cell: [35, 17], face: [0, -1] },
];
// cuánto queda baja cada palanca antes de volver sola
const LEVER_HOLD = 2.5;
// ángulo del mango: arriba (inclinado hacia la sala) y abajo
const LEVER_UP = 0.35;
const LEVER_DOWN = 2.6;
// la pava: grados por segundo
const HEAT = 1.5;
// el barbacuá: boca (donde está el fuego) y el borde de arriba
const KILN_MOUTH = new THREE.Vector3(38.5, 0.6, 24.5);
const KILN_TOP = new THREE.Vector3(38.5, 3.2, 23.9);

const tmpV = new THREE.Vector3();

export default class EasterEgg {
  constructor(game) {
    this.g = game;
    this.items = { calabaza: false, bombilla: false, yerba: false, agua: false };
    this.calabazaState = 'shelf';
    this.bucketT = 0;
    // idle, souls (encierro), hot (fuego desbocado), ready (apagado), dry, done
    this.kiln = 'idle';
    this.souls = 0;
    this.kilnNeed = 0;
    this.hearth = 'idle';
    this.temp = 20;
    this.done = false;
    this.talkT = 0;
    this.started = null;
    this.hasHat = false;
    this.arenaGone = false;
    this.hatObj = null;
    // la tumba del Capataz: idle, souls (encierro), voz
    this.tumba = 'idle';
    this.tSouls = 0;
    this.tumbaNeed = 0;
    // quiénes ya agarraron su Mate de Oro (lo lleva el anfitrión)
    this.oro = new Set();
    this.myOro = false;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.buildAbuelo();
    this.buildCalabaza();
    this.buildHearth();
    this.buildLevers();
    this.buildYerba();
    this.buildTumba();
    this.encD = new Encierro(game, { zone: 'D', color: 0xff5a1a, place: 'el barbacuá' });
    this.encH = new Encierro(game, { zone: 'H', color: 0x7ac8ff, place: 'la oficina' });
    this.encI = new Encierro(game, { zone: 'I', color: 0x5affa8, place: 'el cementerio' });
    this.graves = RISERS.filter((r) => r.grave).map((r) => r.pos);
    this.fireLight = game.world.lights.find((e) => e.def.kind === 'fire' && e.def.zone === 'D') || null;
    this.register();
    // la Noche de la Luz Mala (cada 10 rondas, o antes con los Mates de Oro):
    // la ronda la lleva por g.defense (Rounds, Zombies.spawn)
    this.noche = new LuzMala(game, this);
    this.defense = this.noche;
    game.defense = this.noche;
  }

  // Cuántas palancas hay: una por jugador en la partida.
  get leverCount() {
    if (this.g.net?.guest) return this.nlev || 1;
    return Math.max(1, Math.min(LEVERS.length, this.g.net ? this.g.net.net.count : 1));
  }

  // El fuego del barbacuá quedó apagado (lo mira Game para las llamas).
  get fireOut() {
    return this.kiln === 'ready' || this.kiln === 'dry' || this.kiln === 'done';
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  buildLevers() {
    const M = this.g.world.M;
    this.levers = LEVERS.map((def, i) => {
      const a = this.g.world.wallAnchor(def.cell, def.face, 0.06);
      const group = new THREE.Group();
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.rot;
      group.add(mesh(boxGeo(0.42, 0.7, 0.1), M.metalGreen, 0, 1.35, 0));
      group.add(mesh(boxGeo(0.3, 0.08, 0.04), M.black, 0, 1.78, 0.05));
      // número de la palanca pintado arriba
      for (let k = 0; k <= i; k++) group.add(mesh(boxGeo(0.03, 0.05, 0.01), M.redPaint, -0.045 * i + k * 0.09, 1.78, 0.075));
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.3, 0.08);
      pivot.add(mesh(cylGeo(0.022, 0.022, 0.42, 8), M.iron, 0, 0.2, 0));
      pivot.add(mesh(cylGeo(0.045, 0.045, 0.12, 10), M.redPaint, 0, 0.42, 0, 0, 0, Math.PI / 2));
      pivot.rotation.x = LEVER_UP;
      group.add(pivot);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x220a06, emissive: 0xff3a1a, emissiveIntensity: 0 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lampMat);
      lamp.position.set(0.14, 1.62, 0.07);
      group.add(lamp);
      mergeByMaterial(group, [lamp]);
      this.root.add(group);
      return { i, group, pivot, lamp: lampMat, downT: 0, down: false, by: -1, angle: LEVER_UP, pos: new THREE.Vector3(a.x, 1.3, a.z) };
    });
  }

  // ---------------- modelos ----------------
  buildAbuelo() {
    const M = this.g.world.M;
    const [x, z] = EE.abuelo.pos;
    const chair = new THREE.Group();
    chair.position.set(x, 0, z);
    chair.rotation.y = 0;
    // mecedora
    const rocker = new THREE.Group();
    for (const s of [-0.28, 0.28]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 20, 0.9), M.woodDark);
      arc.rotation.set(0, Math.PI / 2, Math.PI + 1.12);
      arc.position.set(s, 0.9, 0.05);
      rocker.add(arc);
      rocker.add(mesh(boxGeo(0.04, 0.45, 0.04), M.woodDark, s, 0.3, 0.2));
      rocker.add(mesh(boxGeo(0.04, 1.0, 0.04), M.woodDark, s, 0.55, -0.22, -0.15));
      rocker.add(mesh(boxGeo(0.04, 0.04, 0.45), M.woodDark, s, 0.7, 0.02));
    }
    rocker.add(mesh(boxGeo(0.6, 0.05, 0.45), M.woodDark, 0, 0.5, 0));
    for (let i = 0; i < 5; i++) rocker.add(mesh(boxGeo(0.03, 0.55, 0.02), M.woodDark, -0.2 + i * 0.1, 0.8, -0.27, -0.15));
    rocker.add(mesh(boxGeo(0.6, 0.06, 0.04), M.woodDark, 0, 1.08, -0.31, -0.15));
    // fantasma sentado
    const ghost = new THREE.MeshStandardMaterial({ color: 0xa8d8ff, emissive: 0x4a88d0, emissiveIntensity: 1.8, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.5 });
    this.ghostMat = ghost;
    const body = new THREE.Group();
    body.add(mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 10), ghost, 0, 0.88, -0.05, -0.12));
    body.add(mesh(new THREE.SphereGeometry(0.14, 14, 10), ghost, 0, 1.35, 0.0));
    body.add(mesh(cylGeo(0.16, 0.15, 0.05, 14), ghost, 0, 1.47, -0.01, -0.15));
    // bigote y poncho
    body.add(mesh(boxGeo(0.12, 0.025, 0.03), ghost, 0, 1.3, 0.13));
    body.add(mesh(boxGeo(0.55, 0.45, 0.35), ghost, 0, 0.95, 0.0, -0.1));
    for (const s of [-0.1, 0.1]) {
      body.add(mesh(new THREE.CapsuleGeometry(0.07, 0.35, 3, 8), ghost, s, 0.55, 0.22, Math.PI / 2));
      body.add(mesh(new THREE.CapsuleGeometry(0.06, 0.35, 3, 8), ghost, s, 0.3, 0.42));
    }
    body.add(mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8), ghost, 0.25, 0.95, 0.12, 1.1, 0, 0.3));
    body.visible = false;
    rocker.add(body);
    chair.add(rocker);
    this.root.add(chair);
    this.g.world.addBox([x - 0.4, 0, z - 0.45, x + 0.4, 1.2, z + 0.5], { kind: 'prop' });
    this.chair = { group: chair, rocker, body };
    this.abueloPos = new THREE.Vector3(x, 1.2, z);
    // luz fantasmal
    this.ghostLight = new THREE.PointLight(0x7ab8ff, 0, 6, 2);
    this.ghostLight.position.set(x, 1.6, z + 0.3);
    this.root.add(this.ghostLight);
  }

  buildCalabaza() {
    const mats = getMats(this.g.textures);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), mats.gourd);
    body.scale.set(1, 0.95, 1);
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16), mats.gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    g.add(rim);
    const [x, , z] = EE.calabaza.pos;
    g.position.set(x, 2.06, z);
    this.root.add(g);
    this.calabaza = g;
    this.calabazaVel = new THREE.Vector3();
  }

  buildHearth() {
    const M = this.g.world.M;
    const mats = getMats(this.g.textures);
    const a = this.g.world.wallAnchor(EE.hearth.cell, EE.hearth.face, 0.45);
    const g = new THREE.Group();
    g.position.set(a.x, 0, a.z);
    g.rotation.y = a.rot;
    g.add(mesh(boxGeo(1.4, 0.9, 0.9), M.brickSoot, 0, 0.45, 0));
    g.add(mesh(boxGeo(1.5, 0.08, 1.0), M.stone, 0, 0.94, 0));
    g.add(mesh(boxGeo(0.5, 0.35, 0.05), M.black, 0, 0.45, 0.45));
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4a10, emissiveIntensity: 0.4 }));
    coals.position.set(0, 0.32, 0.47);
    g.add(coals);
    const pava = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.15, 0.05], [0.14, 0.16], [0.08, 0.22], [0.03, 0.24]].map(([r, y]) => new THREE.Vector2(r, y)), 20), mats.aluminium);
    pava.add(body);
    pava.add(mesh(cylGeo(0.015, 0.035, 0.2, 8), mats.aluminium, 0, 0.1, 0.17, 1.0, 0, 0));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14, Math.PI), M.iron);
    handle.position.y = 0.24;
    pava.add(handle);
    pava.position.set(0.2, 0.98, 0);
    g.add(pava);
    this.root.add(g);
    this.g.world.addBox([a.x - 0.75, 0, a.z - 0.5, a.x + 0.75, 1.0, a.z + 0.5], { kind: 'prop' });
    this.hearthObj = { group: g, coals, pava, pos: new THREE.Vector3(a.x, 1.2, a.z), front: new THREE.Vector3(a.x + EE.hearth.face[0] * 1.2, 0, a.z + EE.hearth.face[1] * 1.2) };
  }

  // El atado de yerba seca: queda en la boca del barbacuá cuando se apaga el fuego.
  buildYerba() {
    const M = this.g.world.M;
    const g = new THREE.Group();
    g.position.set(KILN_MOUTH.x, 0, KILN_MOUTH.z - 0.15);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.add(mesh(cylGeo(0.06, 0.05, 0.62, 6), M.yerbaBranch, Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1, Math.PI / 2 + (Math.random() - 0.5) * 0.2, a * 0.2, 0));
    }
    g.add(mesh(cylGeo(0.14, 0.14, 0.05, 10), M.rope, 0, 0.16, 0, Math.PI / 2, 0, 0));
    // la luz va aparte, siempre en la escena (apagada con intensidad 0): si
    // aparecía con el atado cambiaba la cuenta de luces y se recompilaban todos
    // los materiales (un tirón enorme al soplar el barbacuá y al levantar la yerba)
    const glow = new THREE.PointLight(0xc8ff6a, 0, 3, 2);
    glow.position.set(g.position.x, 0.5, g.position.z + 0.3);
    g.visible = false;
    this.root.add(g, glow);
    this.yerbaObj = { group: g, glow };
  }

  // El sombrero colgado en la cruz del panteón y el ojo de la Voz en el cielo.
  buildTumba() {
    const g = this.g;
    const [x, z] = EE.tumba.pos;
    this.tumbaPos = new THREE.Vector3(x, 1, z);
    // la cruz está en la cabecera (hacia la tapia, +x) y el camino llega por -x
    this.tumbaFront = new THREE.Vector3(x - 1.7, 0, z);
    const hat = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
    hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), mat));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.2, 16), mat);
    crown.position.y = 0.1;
    hat.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.04, 16), g.world.M.redPaint);
    band.position.y = 0.04;
    hat.add(band);
    hat.position.set(x + 1.05, 1.98, z);
    hat.rotation.set(0, 0, -0.35);
    hat.visible = false;
    this.root.add(hat);
    this.tumbaHat = hat;
    // el ojo de la Voz: anillos y un iris, allá arriba entre las nubes
    const eye = new THREE.Group();
    const glow = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.eyeMats = [];
    this.eyeRings = [];
    for (let i = 0; i < 3; i++) {
      const m = glow(i === 1 ? 0xff5a3a : 0x9a6aff, 1.1);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 1.6, 0.07 + i * 0.02, 8, 64), m);
      ring.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      eye.add(ring);
      this.eyeRings.push(ring);
      this.eyeMats.push(m);
    }
    const ball = glow(0xf0e0ff, 1.6);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), ball));
    this.eyeMats.push(ball);
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x2a0a0a, transparent: true, opacity: 0 });
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), irisMat);
    eye.add(iris);
    this.eyeMats.push(irisMat);
    this.eyeIris = iris;
    eye.position.set(x - 4, 34, z - 3);
    eye.scale.setScalar(1.8);
    eye.visible = false;
    this.root.add(eye);
    this.eye = eye;
    this.eyeK = 0;
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    const kilnPos = new THREE.Vector3(EE.kiln.pos[0], 1.2, EE.kiln.pos[1]);
    this.kilnTarget = new THREE.Vector3(EE.kiln.pos[0], 0.6, EE.kiln.pos[1] - 0.6);
    const wellPos = new THREE.Vector3(EE.well.pos[0], 1, EE.well.pos[1]);

    I.add({
      kind: 'ee',
      pos: this.abueloPos,
      radius: 2.4,
      prompt: () => {
        if (!g.world.power || this.done) return null;
        const all = Object.values(this.items).every(Boolean);
        return all ? { text: 'cebarle un mate al Abuelo', noCost: true } : null;
      },
      cost: () => 0,
      use: () => {
        if (this.done || !Object.values(this.items).every(Boolean)) return false;
        this.complete();
        return true;
      },
    });
    // el Mate de Oro: cada uno va a buscar el suyo a la mano del Abuelo
    I.add({
      kind: 'oro',
      local: true,
      pos: this.abueloPos.clone().add(new THREE.Vector3(0.32, -0.25, 0.3)),
      radius: 2.4,
      prompt: () => (this.done && !this.myOro && !this.arenaGone ? { text: 'agarrar tu Mate de Oro', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (!this.done || this.myOro) return false;
        this.takeOro();
        return true;
      },
    });
    this.calabazaIt = I.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 1.6,
      prompt: () => (this.calabazaState === 'floor' ? { text: 'agarrar la calabaza del Abuelo', noCost: true } : null),
      cost: () => 0,
      use: () => {
        this.calabazaState = 'taken';
        this.calabaza.visible = false;
        this.gain('calabaza', 'Calabaza del Abuelo');
        return true;
      },
    });
    I.add({
      kind: 'ee',
      hold: true,
      pos: wellPos,
      radius: 2,
      prompt: () => (g.world.power ? { text: 'subir el balde del aljibe', hold: true, noCost: true } : null),
      cost: () => 0,
      // mientras se mantiene F el balde sube (unos 3 s hasta arriba); al soltar
      // baja solo (update). Lo mueve el anfitrión y les avisa a los demás.
      use: () => {
        this.bucketT = Math.min(3, this.bucketT + 0.55);
        this.crankT = g.time;
        g.audio.chain(wellPos);
        g.net?.event('ee', { bk: +this.bucketT.toFixed(2) });
        if (this.bucketT >= 3 && !this.items.bombilla) {
          this.gain('bombilla', 'Bombilla de alpaca');
          g.fx.sparkle(wellPos, [0.9, 0.95, 1], 20, 0.5);
        }
        return true;
      },
    });
    // el barbacuá: encierro, fuego desbocado, soplido y yerba seca
    I.add({
      kind: 'ee',
      pos: kilnPos,
      radius: 2.6,
      prompt: () => {
        if (!g.world.power || this.items.yerba) return null;
        if (this.kiln === 'idle') {
          const miss = this.encD.missingText();
          return miss ? { text: miss, noCost: true, info: true } : { text: 'cargar el barbacuá con yerba (encierro)', noCost: true };
        }
        if (this.kiln === 'souls') return { text: `El encierro del barbacuá: ${this.souls} de ${this.kilnNeed} almas`, noCost: true, info: true };
        if (this.kiln === 'hot') return { text: g.weapons.has('tronador') ? 'El fuego tapa la yerba. Soplale con el Mate Tronador' : 'El fuego tapa la yerba. Hace falta un mate que truene', noCost: true, info: true };
        if (this.kiln === 'ready') return { text: 'sacar la yerba seca', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (!g.world.power) return false;
        if (this.kiln === 'idle') {
          if (this.encD.missing().length) return false;
          this.startKiln();
          return true;
        }
        if (this.kiln === 'ready') {
          // la yerba sale seca pero entera: falta pasarla por el molino
          this.kiln = 'dry';
          this.yerbaObj.group.visible = false;
          this.toastAll('Conseguiste: Yerba seca (falta molerla)');
          this.netSync();
          g.later(1.2, () => g.say('abuelo', this.molinoLine()));
          return true;
        }
        return false;
      },
    });
    // palancas: cada uno baja la suya (se resuelve en el anfitrión con quién fue)
    for (const lever of this.levers) {
      lever.it = I.add({
        kind: 'ee',
        local: true,
        pos: lever.pos,
        radius: 1.9,
        prompt: () => {
          if (!g.world.power || this.kiln !== 'dry' || lever.i >= this.leverCount) return null;
          if (lever.down) return { text: this.leverCount > 1 ? 'Esperando las otras palancas...' : 'El molino está arrancando...', noCost: true, info: true };
          if (this.levers.some((l) => l.down && l.by === this.myId())) return { text: 'Ya bajaste una: las otras las bajan tus compañeros', noCost: true, info: true };
          return { text: this.leverCount > 1 ? 'bajar la palanca del molino (todas a la vez)' : 'bajar la palanca del molino', noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (this.kiln !== 'dry' || lever.down || lever.i >= this.leverCount) return false;
          if (g.net?.guest) {
            g.net.net.send({ t: 'pee', a: 'lever', i: lever.i });
            return true;
          }
          return this.pullLever(lever, this.myId());
        },
      });
    }
    I.add({
      kind: 'ee',
      pos: this.hearthObj.pos,
      front: this.hearthObj.front,
      radius: 2.2,
      prompt: () => {
        if (!g.world.power || this.items.agua) return null;
        if (this.hearth === 'idle') {
          const miss = this.encH.missingText();
          return miss ? { text: miss, noCost: true, info: true } : { text: 'poner la pava en el fogón (encierro)', noCost: true };
        }
        if (this.hearth === 'heating') return { text: `sacar la pava (${Math.round(this.temp)} °C)`, noCost: true };
        if (this.hearth === 'cooldown') return { text: 'La pava se está enfriando...', noCost: true, info: true };
        return null;
      },
      cost: () => (this.hearth === 'cooldown' ? 1 : 0),
      use: () => {
        if (this.hearth === 'idle') {
          if (this.encH.missing().length) return false;
          this.startHearth();
          return true;
        }
        if (this.hearth === 'heating') {
          if (this.temp >= 75 && this.temp <= 85) {
            this.hearth = 'done';
            this.hearthObj.coals.material.emissiveIntensity = 0.4;
            this.encH.stop();
            this.gain('agua', `Agua a ${Math.round(this.temp)} °C`);
            this.announce('¡Agua a punto! La oficina se abrió.', 3);
          } else if (this.temp < 75) {
            this.announce(`Todavía está fría (${Math.round(this.temp)} °C). Se apagó el fogón y se abrió la oficina.`, 3);
            this.fail('fría');
          } else this.fail('hervida');
          return true;
        }
        return false;
      },
    });
    // la tumba del Capataz: su sombrero y lo último
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(this.tumbaFront.x + 0.5, 1, this.tumbaFront.z),
      radius: 2.4,
      prompt: () => {
        if (this.arenaGone || this.tumba === 'voz') return null;
        if (this.tumba === 'souls') return { text: `El cementerio: ${this.tSouls} de ${this.tumbaNeed} almas`, noCost: true, info: true };
        if (!this.done) return { text: this.hasHat ? 'La tumba del Capataz: primero cebale el mate al Abuelo' : 'Aquí yace Anselmo, capataz del molino', noCost: true, info: true };
        // (la Noche de la Luz Mala que viene con los Mates de Oro: primero eso)
        if (this.noche?.lock()) return { text: 'Primero, la Luz Mala', noCost: true, info: true };
        if (!this.hasHat) return { text: 'La tumba del Capataz: falta su sombrero (se le vuela cuando cae)', noCost: true, info: true };
        const oro = this.missingOro();
        if (oro.length) return { text: `Falta que ${oro.join(', ')} agarre${oro.length > 1 ? 'n' : ''} su Mate de Oro`, noCost: true, info: true };
        const miss = this.encI.missingText();
        if (miss) return { text: miss, noCost: true, info: true };
        if (this.g.curandero && !this.g.curandero.anyoneHas()) return { text: 'Estas almas solo las junta la luz mala', noCost: true, info: true };
        return { text: 'dejar el sombrero del Capataz en su tumba', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!this.done || !this.hasHat || this.tumba !== 'idle' || this.arenaGone) return false;
        if (this.noche?.lock()) return false;
        if (this.missingOro().length || this.encI.missing().length) return false;
        if (this.g.curandero && !this.g.curandero.anyoneHas()) return false;
        this.startTumba();
        return true;
      },
    });
  }

  fail(kind) {
    const g = this.g;
    this.hearth = 'cooldown';
    this.coolT = kind === 'hervida' ? 15 : 3;
    this.hearthObj.coals.material.emissiveIntensity = 0.4;
    this.encH.stop();
    if (kind === 'hervida') {
      this.announce('¡La hervistes! Así no se ceba. Esperá que se enfríe y vuelvan a empezar.', 3);
      g.audio.laugh(this.hearthObj.pos);
    }
    this.netSync();
  }

  // ---------------- barbacuá ----------------
  startKiln() {
    const g = this.g;
    this.kiln = 'souls';
    this.souls = 0;
    this.kilnNeed = 12 + 4 * (this.players() - 1);
    this.encD.start();
    this.announce(`¡El barbacuá los encerró! Liquiden muertos adentro para secar la yerba (${this.kilnNeed} almas).`, 4, true);
    g.fx.explosion(KILN_MOUTH, 1.6, [1, 0.5, 0.15]);
    this.netSync();
  }

  // Juntaron las almas: la yerba se secó pero el fuego se desbocó y la tapa.
  kilnHot() {
    const g = this.g;
    this.kiln = 'hot';
    this.encD.stop();
    g.fx.explosion(KILN_TOP, 2.4, [1, 0.45, 0.1]);
    g.fx.addShake(0.3);
    this.announce('¡La yerba se secó! Pero el fuego del barbacuá se desbocó y la tapa toda.', 4, true);
    g.later(3, () => g.say('abuelo', LINES.tronador));
    this.netSync();
  }

  // Un soplido del Tronador (lo avisa weapons/Weapons.js al disparar el cono).
  onBlast(origin, dir, range, angle) {
    if (this.kiln !== 'hot' || this.blastSent) return;
    const g = this.g;
    const cos = Math.cos(angle + 0.15);
    let hit = false;
    for (const p of [KILN_MOUTH, KILN_TOP]) {
      tmpV.subVectors(p, origin);
      const d = tmpV.length();
      if (d > range + 1.5 || d < 0.01) continue;
      if (tmpV.dot(dir) / d < cos) continue;
      if (!g.world.clear(origin, p)) continue;
      hit = true;
      break;
    }
    if (!hit) return;
    if (g.net?.guest) {
      this.blastSent = true;
      g.later(1.5, () => {
        this.blastSent = false;
      });
      g.net.net.send({ t: 'pee', a: 'blast' });
      return;
    }
    this.extinguish();
  }

  extinguish() {
    const g = this.g;
    if (this.kiln !== 'hot') return;
    this.kiln = 'ready';
    this.applyFire();
    this.announce('¡El soplido apagó el barbacuá! La yerba seca quedó a la vista.', 4, true);
    this.netSync();
  }

  // Lo que se ve del fuego según cómo quedó el barbacuá (en cada compu).
  applyFire() {
    const g = this.g;
    if (!this.fireOut || this.fireDone) return;
    this.fireDone = true;
    this.yerbaObj.group.visible = this.kiln === 'ready';
    const k = g.world.dynamic.kilnGlow;
    if (k) k.visible = false;
    // se corta el crepitar
    const f = g.audio.fire;
    if (f) {
      clearInterval(f.crackle);
      try {
        f.src.stop();
      } catch {
        /* */
      }
      g.audio.fire = null;
    }
    // humo y vapor donde estaba el fuego
    for (let i = 0; i < 14; i++) g.fx.steam(tmpV.set(KILN_MOUTH.x + (Math.random() - 0.5) * 2, KILN_MOUTH.y + Math.random() * 2.5, KILN_MOUTH.z - Math.random() * 2), 4, 1);
    g.fx.sparkle(KILN_MOUTH, [0.8, 1, 0.4], 30, 1);
  }

  // ---------------- molino ----------------
  molinoLine() {
    const n = this.leverCount;
    return n > 1 ? LINES.molinoN(n) : LINES.molino1;
  }

  // by: quién la bajó. Cada uno puede tener una sola abajo.
  pullLever(lever, by) {
    const g = this.g;
    if (this.kiln !== 'dry' || lever.down || lever.i >= this.leverCount) return false;
    if (this.levers.some((l) => l.down && l.by === by)) return false;
    lever.down = true;
    lever.by = by;
    lever.downT = LEVER_HOLD;
    g.audio.mech(g.audio.now, [0, 0.08]);
    g.fx.sparks(lever.pos, 4, { x: 0, y: 1, z: 0 });
    const active = this.levers.slice(0, this.leverCount);
    if (active.every((l) => l.down)) this.grind();
    else if (this.leverCount > 1) this.announce(`Palancas bajas: ${active.filter((l) => l.down).length} de ${this.leverCount}. ¡Rápido!`, 1.4);
    this.netSync();
    return true;
  }

  // Todas las palancas abajo a la vez: el molino arranca y muele la yerba.
  grind() {
    const g = this.g;
    this.kiln = 'done';
    for (const l of this.levers) {
      l.down = true;
      l.downT = Infinity;
      g.fx.sparks(l.pos, 12, { x: 0, y: 1, z: 0 });
    }
    g.audio.powerOn(new THREE.Vector3(43.5, 2, 10));
    g.fx.addShake(0.35);
    g.net?.event('ee', { shake: 1 });
    this.announce('¡El molino arrancó! La yerba quedó molida.', 3.5);
    this.gain('yerba', 'Yerba molida');
  }

  // ---------------- fogón ----------------
  startHearth() {
    this.hearth = 'heating';
    this.temp = 20;
    this.hearthObj.coals.material.emissiveIntensity = 3;
    this.encH.start();
    this.announce('La pava está al fuego y la oficina quedó encerrada. Aguanten y sáquenla entre 75 y 85 °C.', 4, true);
    this.netSync();
  }

  // ---------------- cementerio ----------------
  startTumba() {
    const g = this.g;
    this.hasHat = false;
    this.tumba = 'souls';
    this.tSouls = 0;
    this.tumbaNeed = this.graves.length + 3 * (this.players() - 1);
    this.tumbaHat.visible = true;
    this.encI.start();
    g.fx.lightning(new THREE.Vector3(this.tumbaPos.x + 1, 30, this.tumbaPos.z), new THREE.Vector3(this.tumbaPos.x + 1, 2, this.tumbaPos.z), 0x9affc8, 0.5);
    g.audio.thunder?.(this.tumbaPos);
    g.post.flash(0.6);
    this.announce(`¡Se abren las tumbas! Liquiden a los peones (${this.tumbaNeed} almas)`, 4.5, true);
    this.netSync();
  }

  // El cementerio se calmó: habla la Voz y los manda a la Salamanca.
  tumbaDone() {
    const g = this.g;
    this.tumba = 'voz';
    this.encI.stop();
    g.zombies.nuke();
    // la ronda se queda quieta mientras habla
    if (!g.net?.guest) g.rounds.state = 'voz';
    this.netSync();
    g.later(1.2, () => {
      g.post.flash(0.7);
      g.audio.thunder?.(this.tumbaPos);
      const d1 = g.say('entidad', VOZ[0]);
      g.later(d1 + 0.8, () => {
        const d2 = g.say('entidad', VOZ[1]);
        g.later(d2 + 1.2, () => {
          this.arenaGone = true;
          this.netSync();
          g.fx.explosion(this.tumbaPos, 3, [0.6, 1, 0.7]);
          g.arena.start();
        });
      });
    });
  }

  // Aviso para todo el equipo (el easter egg es de todos).
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

  gain(key, label) {
    const g = this.g;
    if (this.items[key]) return;
    this.items[key] = true;
    this.netSync();
    g.hud.setInventory(this.items);
    this.toastAll(`Conseguiste: ${label}`);
    const missing = Object.entries(this.items).filter(([, v]) => !v).length;
    if (!missing) this.announce('Está todo. Vayan a la capilla a cebarle al Abuelo.', 3.5);
  }

  // Más Tronadores en la caja mientras el fuego tapa la yerba.
  boxBoost(id) {
    return id === 'tronador' && this.kiln === 'hot' ? 6 : 1;
  }

  // ---------------- ganchos del juego ----------------
  onPower() {
    const g = this.g;
    this.started = g.time;
    this.chair.body.visible = true;
    this.ghostLight.intensity = 4;
    g.later(4, () => g.hud.subtitle('Se escucha una mecedora en la capilla...', 3));
    if (g.world.zoneAt(g.player.pos.x, g.player.pos.z) === 'E') this.onZone('E');
  }

  // Lo que pide un invitado (una palanca o un soplido al barbacuá).
  onGuest(m, from) {
    if (m.a === 'lever') {
      const lever = this.levers[m.i];
      if (lever) this.pullLever(lever, from);
    } else if (m.a === 'blast') this.extinguish();
    // (el facón o un tiro a una luz mala: entities/LuzMala.js)
    else this.noche?.onGuest(m, from);
  }

  // Estado del easter egg que manda el anfitrión (modo invitado).
  applyRemote(m) {
    const g = this.g;
    // la Noche de la Luz Mala: su estado y sus efectos
    if (m.ln || m.lnf || m.lnr || m.lnb != null || m.lne) this.noche?.applyEvent(m);
    // el balde del aljibe (lo sube el anfitrión; baja solo acá también)
    if (m.bk != null) {
      this.bucketT = m.bk;
      this.crankT = g.time;
    }
    if (m.calabaza && this.calabazaState === 'shelf') this.dropCalabaza(new THREE.Vector3(0, 0, 1));
    if (m.calabaza === 'taken') {
      this.calabazaState = 'taken';
      this.calabaza.visible = false;
    }
    if (m.items) {
      this.items = { ...this.items, ...m.items };
      g.hud.setInventory(this.items);
    }
    if (m.drop && this.calabazaState === 'shelf') this.dropCalabaza(new THREE.Vector3(m.drop[0], 0, m.drop[1]));
    if (m.kiln) {
      this.kiln = m.kiln;
      if (this.fireOut) this.applyFire();
      this.yerbaObj.group.visible = this.kiln === 'ready';
    }
    if (m.lm) g.curandero?.applyRemote(m.lm, m.lsoul);
    if (m.ks !== undefined) this.souls = m.ks;
    if (m.kn !== undefined) this.kilnNeed = m.kn;
    if (m.ts !== undefined) this.tSouls = m.ts;
    if (m.tn !== undefined) this.tumbaNeed = m.tn;
    if (m.tumba) {
      this.tumba = m.tumba;
      this.tumbaHat.visible = this.tumba !== 'idle';
    }
    if (m.hearth) {
      if (m.hearth !== this.hearth) this.hearthObj.coals.material.emissiveIntensity = m.hearth === 'heating' ? 3 : 0.4;
      this.hearth = m.hearth;
    }
    if (m.temp !== undefined) this.temp = m.temp;
    if (m.nlev) this.nlev = m.nlev;
    if (m.lev) m.lev.forEach((d, i) => {
      if (d && !this.levers[i].down) g.audio.mech(g.audio.now, [0, 0.08]);
      this.levers[i].down = !!d;
    });
    if (m.lby) m.lby.forEach((b, i) => {
      this.levers[i].by = b;
    });
    if (m.soul) g.fx.soul(new THREE.Vector3(m.soul[0], 0, m.soul[1]), m.tsoul ? this.tumbaPos : this.kilnTarget);
    if (m.shake) g.fx.addShake(0.35);
    if (m.grave) g.fx.dirt(new THREE.Vector3(m.grave[0], 0, m.grave[1]), 20);
    if (m.hasHat !== undefined) this.hasHat = m.hasHat;
    if (m.gone !== undefined) this.arenaGone = m.gone;
    if (m.egg != null) this.eggDone(m.egg);
    if (m.done && !this.done) {
      this.done = true;
      this.reward();
    }
    if (m.hat) this.dropHat(new THREE.Vector3(m.hat[0], 0, m.hat[1]));
    if (m.hatTaken && this.hatObj) this.hatObj.visible = false;
    if (m.oro) {
      this.oro = new Set(m.oro);
      if (this.oro.has(g.net?.id)) this.myOro = true;
    }
    this.syncEnc();
  }

  // Las cortinas de los encierros siguen al estado (en cada compu).
  syncEnc() {
    const set = (enc, on) => (on ? enc.start() : enc.stop());
    set(this.encD, this.kiln === 'souls');
    set(this.encH, this.hearth === 'heating');
    set(this.encI, this.tumba === 'souls');
  }

  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  // Estado completo (también para un jugador que entra a mitad de partida).
  fullState() {
    return {
      items: this.items,
      kiln: this.kiln,
      ks: this.souls,
      kn: this.kilnNeed,
      hearth: this.hearth,
      temp: Math.round(this.temp),
      done: this.done,
      hasHat: this.hasHat,
      gone: this.arenaGone,
      tumba: this.tumba,
      ts: this.tSouls,
      tn: this.tumbaNeed,
      nlev: this.leverCount,
      lev: this.levers.map((l) => (l.down ? 1 : 0)),
      lby: this.levers.map((l) => (l.down ? l.by : -1)),
      calabaza: this.calabazaState === 'taken' ? 'taken' : null,
      oro: [...this.oro],
      lm: this.g.curandero?.netState(),
      ln: this.noche?.state(),
    };
  }

  onZone(k) {
    const g = this.g;
    if (k === 'I' && !this.iSeen) {
      this.iSeen = true;
      g.later(2.5, () => g.hud.subtitle('Se siente que algo te mira desde arriba...', 3));
    }
    if (k !== 'E' || !g.world.power || this.arenaGone) return;
    this.talkT = 6;
    g.later(1.6, () => {
      if (this.arenaGone) return;
      this.talkT = Math.max(2, g.say('abuelo', this.nextLine(), 'abuelo', { local: true }) + 18);
    });
  }

  onShot(origin, dir, maxT) {
    this.noche?.onShot(origin, dir, maxT);
    if (this.calabazaState !== 'shelf' || !this.g.world.power || this.shotSent) return;
    const p = this.calabaza.position;
    const v = new THREE.Vector3().subVectors(p, origin);
    const t = v.dot(dir);
    if (t < 0 || t > maxT + 0.3) return;
    const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
    if (closest.distanceTo(p) < 0.16) this.hitCalabaza(dir);
  }

  onExplosion(pos, radius) {
    this.noche?.onExplosion(pos, radius);
    if (this.calabazaState === 'shelf' && this.g.world.power && pos.distanceTo(this.calabaza.position) < radius * 0.6) this.hitCalabaza(new THREE.Vector3(0, 0, 1));
  }

  // De invitado, el que decide es el anfitrión: se le avisa y él la tira para todos.
  hitCalabaza(dir) {
    const g = this.g;
    if (g.net?.guest) {
      this.shotSent = true;
      g.later(1.5, () => {
        this.shotSent = false;
      });
      g.net.net.send({ t: 'eeshot', x: +dir.x.toFixed(2), z: +dir.z.toFixed(2) });
      return;
    }
    this.dropCalabaza(dir);
  }

  dropCalabaza(dir) {
    if (this.calabazaState !== 'shelf') return;
    this.g.net?.event('ee', { drop: [+dir.x.toFixed(2), +dir.z.toFixed(2)] });
    this.calabazaState = 'falling';
    this.calabazaVel.set(dir.x * 1.5, 1.5, dir.z * 1.5);
    this.g.audio.shell();
    this.g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 12, 0.3);
  }

  // Cada muerto que cae adentro de un encierro es un alma para lo suyo.
  onKill(z, info = {}) {
    const g = this.g;
    g.curandero?.onKill(z);
    if (this.kiln === 'souls' && this.encD.inside(z.pos)) {
      this.souls++;
      g.fx.soul(z.pos, this.kilnTarget);
      g.net?.event('ee', { soul: [+z.pos.x.toFixed(1), +z.pos.z.toFixed(1)], ks: this.souls });
      if (this.souls >= this.kilnNeed) this.kilnHot();
      return;
    }
    if (this.tumba === 'souls' && this.encI.inside(z.pos)) {
      // solo las luces del Mate de la Luz Mala juntan estas almas
      if (g.curandero && info.type !== 'wisp') {
        if ((this.wispWarnT || 0) < g.time) {
          this.wispWarnT = g.time + 6;
          this.announce('Esa alma se perdió. Acá solo sirve la luz mala.', 3);
        }
        return;
      }
      this.tSouls++;
      g.fx.soul(z.pos, this.tumbaPos);
      g.net?.event('ee', { soul: [+z.pos.x.toFixed(1), +z.pos.z.toFixed(1)], tsoul: 1, ts: this.tSouls });
      if (this.tSouls >= this.tumbaNeed) this.tumbaDone();
    }
  }

  complete() {
    const g = this.g;
    this.done = true;
    g.later(0.1, () => this.netSync());
    g.say('abuelo', LINES.done);
    g.zombies.nuke();
    this.reward();
    // lo que sigue: el sombrero del Capataz a su tumba
    this.talkT = 40;
    g.later(8, () => {
      g.say('abuelo', this.hasHat ? LINES.gotHat : LINES.hat);
      if (!this.hasHat) this.announce('Cuando caiga el Capataz, su sombrero va a su tumba.', 5);
    });
  }

  // El premio (cada jugador en su compu): el Abuelo deja cebado el Mate de
  // Oro y cada uno lo va a buscar cuando quiere (no te cambia lo que tenés).
  reward() {
    const g = this.g;
    g.audio.fanfare();
    g.post.flash(1.5);
    g.zombies.setEyeColor(0x39a8ff);
    g.later(3, () => g.hud.subtitle(g.net ? 'El Abuelo les cebó el Mate de Oro: cada uno vaya a buscar el suyo a la capilla.' : 'El Abuelo te cebó el Mate de Oro: agarralo de su mano.', 5));
    g.hud.setInventory(null);
    // el Abuelo con su mate
    const mats = getMats(g.textures);
    const mate = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mats.gold);
    mate.position.set(0.32, 0.95, 0.3);
    this.chair.rocker.add(mate);
  }

  // El easter egg se completa recién cuando cae el Mandinga (el anfitrión
  // mide el tiempo desde que arrancó y se lo pasa a los demás).
  onBossDeath(_pos, z) {
    const g = this.g;
    // (el Capataz Maldito: se apaga la última luz y su tesoro queda ahí)
    this.noche?.onBossDeath(_pos, z);
    if (!z?.mandinga || g.net?.guest) return;
    const secs = Math.round(g.time - (this.started ?? g.time));
    this.eggDone(secs);
    g.net?.event('ee', { egg: secs });
  }

  eggDone(secs) {
    if (this.eggShown) return;
    this.eggShown = true;
    this.g.hud.achievement('La Ronda del Abuelo', `Easter egg completado en ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  }

  takeOro() {
    const g = this.g;
    this.myOro = true;
    g.weapons.give('oro');
    g.audio.powerupGrab();
    g.fx.sparkle(this.abueloPos, [1, 0.85, 0.3], 14, 0.6);
    const id = g.net?.id ?? 0;
    if (g.net?.guest) g.net.net.send({ t: 'oro' });
    else this.gotOro(id);
  }

  // El anfitrión anota quién ya tiene el suyo y les avisa a todos.
  gotOro(id) {
    const g = this.g;
    this.oro.add(id);
    g.net?.event('ee', { oro: [...this.oro] });
    // todos con su Mate de Oro: si todavía no hubo Noche de la Luz Mala, viene
    // ahora (y la tumba espera hasta que termine)
    if (!this.missingOro().length && this.noche?.expectEarly()) return;
    if (g.net && this.hasHat && !this.missingOro().length) this.announce('Todos tienen su Mate de Oro. Llévenle el sombrero a la tumba del Capataz.', 4);
  }

  // Nombres de los que todavía no agarraron su Mate de Oro.
  missingOro() {
    const g = this.g;
    if (!g.net) return this.myOro ? [] : ['vos'];
    const out = [];
    const me = g.net.id;
    if (!this.myOro && !this.oro.has(me)) out.push('vos');
    for (const id of g.net.remote.keys()) if (!this.oro.has(id)) out.push(g.net.nameOf(id));
    return out;
  }

  // Alt+K (solo): todo listo para el último mate, con el sombrero en la mano.
  debugFinal() {
    const g = this.g;
    if (!g.world.power) g.turnOnPower();
    for (const k of Object.keys(this.items)) this.items[k] = true;
    this.calabazaState = 'taken';
    this.calabaza.visible = false;
    this.kiln = 'done';
    this.applyFire();
    this.hearth = 'done';
    this.introDone = true;
    this.hasHat = true;
    // el cementerio pide el Mate de la Luz Mala: las piezas y el tuyo
    g.curandero?.debugParts();
    if (g.curandero && !g.weapons.hasLuz?.()) g.weapons.give('luzmala');
    this.syncEnc();
    g.hud.setInventory(this.items);
  }

  // El Capataz pierde el sombrero al caer: queda tirado brillando.
  dropHat(pos) {
    const g = this.g;
    if (this.hasHat || this.arenaGone || this.tumba !== 'idle') return;
    if (!g.net?.guest) g.net?.event('ee', { hat: [+pos.x.toFixed(2), +pos.z.toFixed(2)] });
    if (!this.hatObj) {
      const M = g.world.M;
      const hat = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
      hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), mat));
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.2, 16), mat);
      crown.position.y = 0.1;
      hat.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.04, 16), M.redPaint);
      band.position.y = 0.04;
      hat.add(band);
      this.root.add(hat);
      this.hatObj = hat;
      this.hatIt = g.interact.add({
        kind: 'ee',
        pos: new THREE.Vector3(),
        radius: 1.8,
        prompt: () => (this.hatObj?.visible ? { text: 'agarrar el sombrero del Capataz', noCost: true } : null),
        cost: () => 0,
        use: () => {
          if (!this.hatObj?.visible) return false;
          this.hatObj.visible = false;
          this.hasHat = true;
          this.toastAll('Conseguiste: Sombrero del Capataz');
          g.net?.event('ee', { hatTaken: 1 });
          this.netSync();
          if (this.done) this.announce(this.missingOro().length ? 'Primero, cada uno su Mate de Oro.' : 'Llévenle el sombrero a la tumba del Capataz, en el cementerio.', 4);
          return true;
        },
      });
    }
    // si cayó fuera del mapa (en una ventana), queda donde estás vos
    const zone = g.world.zoneAt(pos.x, pos.z);
    const p = zone ? pos : g.player.pos;
    this.hatObj.position.set(p.x, 0.03, p.z);
    this.hatObj.rotation.set(0.1, Math.random() * 6, 0.05);
    this.hatObj.visible = true;
    this.hatIt.pos.set(p.x, 0.5, p.z);
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    // el balde del aljibe: sube mientras alguien mantiene F y, al soltar, baja solo
    if (this.bucketT > 0 && t - (this.crankT ?? -9) > 1.2) this.bucketT = Math.max(0, this.bucketT - dt * 1.4);
    this.wellRig ??= g.world.dynamic.wells?.find((r) => Math.hypot(r.position.x - EE.well.pos[0], r.position.z - EE.well.pos[1]) < 2) || null;
    if (this.wellRig) {
      const k = (this.bucketShown || 0) + (this.bucketT / 3 - (this.bucketShown || 0)) * Math.min(1, dt * 6);
      if (Math.abs(k - (this.bucketShown || 0)) > 1e-4) setWellBucket(this.wellRig, k);
      this.bucketShown = k;
    }
    // mecedora
    if (g.world.power) {
      this.chair.rocker.rotation.x = Math.sin(t * 1.4) * 0.12;
      this.ghostMat.opacity = 0.35 + Math.sin(t * 2.3) * 0.08;
      if (Math.random() < 0.05) g.fx.sparkle(this.abueloPos, [0.6, 0.8, 1], 1, 0.8);
      // charla cuando te acercás
      this.talkT -= dt;
      const d = g.player.pos.distanceTo(this.abueloPos.clone().setY(0));
      if (d < 7 && this.talkT <= 0 && !this.arenaGone) {
        this.talkT = 25;
        const line = this.nextLine();
        this.talkT = Math.max(this.talkT, g.say('abuelo', line, 'abuelo', { local: true }) + 18);
      }
    }
    // brillo de la calabaza en el estante
    if (this.calabazaState === 'shelf' && g.world.power && Math.floor(t * 1.2) % 3 === 0 && Math.random() < 0.3) {
      g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 1, 0.15);
    }
    if (this.calabazaState === 'falling') {
      this.calabazaVel.y -= 9.8 * dt;
      this.calabaza.position.addScaledVector(this.calabazaVel, dt);
      this.calabaza.rotation.x += dt * 8;
      if (this.calabaza.position.y <= 0.07) {
        this.calabaza.position.y = 0.07;
        this.calabazaState = 'floor';
        this.calabazaIt.pos.copy(this.calabaza.position).setY(0.6);
        g.audio.land();
      }
    }
    if (this.calabazaState === 'floor' && Math.random() < 0.1) g.fx.sparkle(this.calabaza.position, [1, 0.85, 0.4], 1, 0.2);
    if (this.hatObj?.visible && Math.random() < 0.15) g.fx.sparkle(this.hatObj.position, [1, 0.5, 0.3], 1, 0.4);
    this.updateHearth(dt);
    this.updateKiln(dt);
    this.updateLevers(dt);
    this.updateTumba(dt);
    // los encierros: cortinas y muertos que salen de adentro (los pone el anfitrión)
    this.encD.update(dt);
    this.encH.update(dt);
    this.encI.update(dt);
    if (!g.net?.guest) {
      if (this.kiln === 'souls') this.encD.spawns(dt, 1.7, RISERS.filter((r) => r.zone === 'D').map((r) => r.pos));
      if (this.hearth === 'heating') this.encH.spawns(dt, 1.9);
      if (this.tumba === 'souls') {
        const at = this.encI.spawns(dt, 1.3, this.graves);
        if (at) {
          g.fx.dirt(at, 20);
          g.net?.event('ee', { grave: [+at.x.toFixed(1), +at.z.toFixed(1)] });
        }
      }
    }
    // la Noche de la Luz Mala (después del fuego del barbacuá: apaga las luces del mapa)
    this.noche?.update(dt);
    // el contador de lo que se está haciendo
    let craft = null;
    if (this.kiln === 'souls') craft = `<span>Barbacuá</span><b>${this.souls} / ${this.kilnNeed}</b>`;
    else if (this.hearth === 'heating') craft = `<span>Pava</span><b>${Math.round(this.temp)} °C</b>`;
    else if (this.tumba === 'souls') craft = `<span>Cementerio</span><b>${this.tSouls} / ${this.tumbaNeed}</b>`;
    else craft = g.curandero?.hudText() || null;
    g.hud.setCraftText?.(craft);
  }

  // Fogón: lo lleva el anfitrión; el invitado solo ve el vapor.
  updateHearth(dt) {
    const g = this.g;
    if (this.hearth === 'heating') {
      if (!g.net?.guest) this.temp += dt * HEAT;
      if (Math.random() < this.temp / 200) {
        const p = new THREE.Vector3();
        this.hearthObj.pava.getWorldPosition(p);
        g.fx.steam(p.add(new THREE.Vector3(0, 0.3, 0)), 1, 0.1);
      }
      if (!g.net?.guest && this.temp >= 98) {
        this.temp = 100;
        this.fail('hervida');
      }
    } else if (this.hearth === 'cooldown' && !g.net?.guest) {
      this.coolT -= dt;
      if (this.coolT <= 0) {
        this.hearth = 'idle';
        this.netSync();
      }
    }
    // la temperatura les llega a los invitados cada medio segundo
    if (this.hearth === 'heating' && g.net?.host) {
      this.tempT = (this.tempT || 0) - dt;
      if (this.tempT <= 0) {
        this.tempT = 0.5;
        g.net.event('ee', { temp: Math.round(this.temp) });
      }
    }
  }

  // El barbacuá: llamas del encierro, fuego desbocado o la yerba a la vista.
  updateKiln(dt) {
    const g = this.g;
    if (this.kiln === 'souls' && Math.random() < 0.3) g.fx.fire(this.kilnTarget, 0.5, 1);
    if (this.kiln === 'hot') {
      g.fx.fire(tmpV.set(KILN_MOUTH.x, 0.3, KILN_MOUTH.z - 0.2), 1.4, 3);
      g.fx.fire(tmpV.set(KILN_MOUTH.x + (Math.random() - 0.5) * 4.4, 2.9, KILN_MOUTH.z - 0.6 - Math.random() * 2.6), 0.8, 2);
      if (Math.random() < 0.2) g.fx.sparkle(tmpV.set(KILN_MOUTH.x, 3.4, 22.5), [1, 0.5, 0.15], 3, 3);
    }
    if (this.fireLight) {
      const b = this.fireLight.base;
      this.fireLight.target = this.kiln === 'hot' ? b * 1.8 : this.fireOut ? b * 0.08 : g.world.power ? b : b * this.fireLight.def.noPower;
    }
    if (this.kiln === 'ready') {
      const y = this.yerbaObj;
      y.glow.intensity = 3 + Math.sin(g.time * 3) * 1;
      if (Math.random() < 0.15) g.fx.sparkle(tmpV.copy(y.group.position).setY(0.4), [0.8, 1, 0.4], 1, 0.6);
    } else this.yerbaObj.glow.intensity = 0;
  }

  // El sombrero en la cruz y el ojo de la Voz mientras habla.
  updateTumba(dt) {
    const g = this.g;
    if (this.tumbaHat.visible && Math.random() < 0.1) g.fx.sparkle(this.tumbaHat.position, [0.5, 1, 0.7], 1, 0.4);
    const want = this.tumba === 'voz' && !this.arenaGone ? 1 : 0;
    this.eyeK += (want - this.eyeK) * Math.min(1, dt * 0.8);
    this.eye.visible = this.eyeK > 0.01;
    if (!this.eye.visible) return;
    for (const m of this.eyeMats) m.opacity = this.eyeK * (m === this.eyeIris.material ? 1 : 0.85);
    this.eyeRings.forEach((r, i) => {
      r.rotation.x += dt * (0.3 + i * 0.2);
      r.rotation.y += dt * (0.2 - i * 0.1);
    });
    // el iris mira al jugador
    const e = this.eye.position;
    const cam = g.camera.position;
    tmpV.subVectors(cam, e).normalize().multiplyScalar(0.95);
    this.eyeIris.position.copy(tmpV);
  }

  updateLevers(dt) {
    const g = this.g;
    const n = this.leverCount;
    const active = g.world.power && (this.kiln === 'dry' || this.kiln === 'done');
    for (const l of this.levers) {
      l.group.visible = l.i < n || this.kiln === 'done';
      // la palanca vuelve sola si las otras no bajaron a tiempo (lo decide el anfitrión)
      if (l.down && Number.isFinite(l.downT) && !g.net?.guest) {
        l.downT -= dt;
        if (l.downT <= 0) {
          l.down = false;
          l.by = -1;
          g.audio.mech(g.audio.now, [0]);
          this.netSync();
        }
      }
      const target = l.down ? LEVER_DOWN : LEVER_UP;
      l.angle += (target - l.angle) * Math.min(1, dt * 14);
      l.pivot.rotation.x = l.angle;
      // luz: roja apagada sin molienda, parpadea esperando, verde al moler
      const lamp = l.lamp;
      if (this.kiln === 'done') {
        lamp.emissive.setHex(0x3aff5a);
        lamp.emissiveIntensity = 2.5;
      } else if (active && this.kiln === 'dry') {
        lamp.emissive.setHex(l.down ? 0xffc23a : 0xff3a1a);
        lamp.emissiveIntensity = l.down ? 3 : 1 + Math.sin(g.time * 6 + l.i) * 0.8;
      } else lamp.emissiveIntensity = 0;
    }
  }

  nextLine() {
    if (this.done) return this.noche?.lock() ? LINES.noche : this.hasHat ? LINES.gotHat : LINES.hat;
    if (!this.introDone) {
      this.introDone = true;
      return LINES.intro;
    }
    const it = this.items;
    if (!it.calabaza) return LINES.calabaza;
    if (!it.bombilla) return LINES.bombilla;
    if (!it.yerba) return this.kiln === 'hot' ? LINES.tronador : this.kiln === 'dry' ? this.molinoLine() : LINES.yerba;
    if (!it.agua) return LINES.agua;
    return LINES.ready;
  }

  dispose() {
    this.g.hud.setCraftText?.(null);
    this.encD.dispose();
    this.encH.dispose();
    this.encI.dispose();
    this.noche?.dispose();
    if (this.g.defense === this.noche) this.g.defense = null;
  }
}

export { LINES };
