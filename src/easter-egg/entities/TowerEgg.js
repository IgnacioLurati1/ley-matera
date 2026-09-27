import * as THREE from 'three';
import { EE, TOWER } from '../config/map';
import { zombieHealth, maxAlive } from '../config/rules';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { toTexture } from '../core/textures';
import Avatars from '../net/Avatars';
import SongEgg from '../world/SongEgg';
import { TRACKS } from '../core/music';
import { fireflies } from '../fx/Fireflies';

// Easter egg de la torre: "Las Revelaciones". Lo guía el ánima de Martín
// Fierro (el que en el molino se hacía pasar por el Abuelo), que espera junto
// al fogón de la planta baja y después sube a la cima. En pantalla queda
// siempre el objetivo que sigue, una luz marca dónde ir y Fierro lo repite si
// pasa mucho sin avanzar.
//  1. Las tres piezas del cañón de la Vuelta de Obligado:
//     · el caño, tirado en el secadero (piso 3);
//     · la rueda, colgada de tres cadenas arriba del agujero del piso 8: se
//       rompen los candados a tiros y cae hasta la plaza del piso 5;
//     · la mecha, sellada bajo la plaza del piso 10: el sello solo se rompe si
//       alguien le cae encima desde algún piso de arriba con la PhD Flopper.
//  2. Se arma el cañón en la cima (piso 15).
//  3. El encierro: las rejas del penal rodean el cañón y hay que liquidar
//     muertos adentro hasta llenarlo de almas.
//  4. La Voz, enojada, manda un alma pesada (un jefe): bajándolo, el cañón
//     queda cargado.
//  5. Se prende la mecha: cañonazo al ojo de la tormenta (escena en el
//     juego). La Voz queda herida y baja una escalera de oro... trabada.
//  6. "Buyable ending": la escalera se paga en la pared dorada de la cima:
//     40.000 solo y 20.000 más por cada jugador (endingCost; entre todos:
//     cada uno aporta lo que tiene).
//  7. Se sube la escalera; cuando están todos arriba se rompe y caen al
//     Infierno Matero, donde espera la Voz: Francisco (world/Infierno.js).
// En línea lo lleva el anfitrión; la plata que aporta cada uno y los golpes
// al sello y a los candados que hace un invitado le llegan como aviso.

const FIERRO = {
  intro: [
    'Tranquilo, paisano, que no muerdo. Soy el alma de Martín Fierro... el mismo que en el molino se hacía pasar por abuelo.',
    'La Voz que los guió no es un ángel. Se quedó con el mate supremo y vive arriba de todo, en el ojo del remolino.',
    'Para bajarla hace falta el cañón de la Vuelta de Obligado, en la cima. Le faltan tres piezas.',
    'El caño quedó en el secadero, en el piso 3. La rueda cuelga sobre el agujero del piso 8, con candados.',
    'Y la mecha está sellada bajo la plaza del piso 10. Ese sello solo cede si alguien le cae encima... con Flopa en el cuerpo.',
  ],
  parts: 'Ya tienen las tres piezas. Suban a la cima, que los espero al lado del cañón.',
  built: [
    'El cañón está armado, pero no tiene pólvora. La pólvora de este cañón son almas.',
    'Armen el encierro con las rejas del penal y llénenlo. Liquiden muertos adentro.',
  ],
  heavy: '¡Esa alma pesada es la bala! Bájenlo y el cañón queda cargado.',
  loaded: 'Cargado. Ahora sí, prendan la mecha y apunten al ojo de la tormenta.',
  shot: [
    'Le dieron. Miren, se abrió el cielo. Allá arriba espera una escalera de oro... pero la Voz no la deja bajar.',
    // ({plata}: lo que cuesta con los que son, endingCost)
    'Esa escalera se paga. {plata}. {junten} en la pared dorada y va a bajar.',
  ],
  paid: 'Suban. Yo no puedo ir, las ánimas no pisamos el cielo. Cuídense de lo que haya arriba.',
};
const VOZ = {
  start: '¿Otra vez ustedes? Suban, suban nomás. Los estoy esperando.',
  cano: 'Ese caño viejo no les va a servir de nada.',
  rueda: '¿Rompiendo candados? Qué falta de respeto.',
  sello: 'Mi sello... ¿quién les enseñó eso?',
  encierro: 'Almas, almas... todas terminan siendo mías.',
  heavy: '¿Almas quieren? Les mando una bien pesada.',
};
const CANNON_LINES = [
  [2.2, 'entidad', '¿Un cañón? ¿A mí? No me hagan reír.'],
  [6.4, 'entidad', '¡AAAAH! ¡Malditos gauchos!'],
  [10.5, 'entidad', 'Está bien. ¿Quieren subir? La escalera al cielo está abierta... pero el cielo se paga.'],
];
const FALL_LINES = [
  [0.6, 'entidad', '¿De verdad creyeron que iban a subir al cielo?'],
  [6.9, 'entidad', 'Bienvenidos a mi casa.'],
];
// la caída de la escalera: se rompe, caen por afuera de la torre, todo se
// pone colorado y bajan por la bóveda del Infierno
const FALL = { crack: 1.1, out: 19, red: 5.1, cave: 6.4, end: 10.2 };
// La canción de la pelea con Francisco arranca en la caída: la subida de la
// intro acompaña la bajada y el golpe de verdad (boom, 23,9 s) cae cuando
// aparece Francisco, 3,2 s después de la bóveda (world/Arena BOSS_IN). La
// intro es más larga que la caída: arranca ya empezada (FALL_AT), pasado el
// pico chico de los 10,75, en la parte bajita y con un fundido; si da el
// tiempo, un poco después de que se rompe el cielo (FALL_SONG).
const FALL_BOOM = FALL.end + 3.2;
const BOOM_T = TRACKS['jefe-torre']?.boom || 0;
const FALL_AT = Math.max(BOOM_T - FALL_BOOM, Math.min(11.6, BOOM_T));
const FALL_SONG = Math.max(0, FALL_BOOM - (BOOM_T - FALL_AT));
const INV = [
  ['cano', 'Caño de bronce', '▬'],
  ['rueda', 'Rueda de la cureña', '◎'],
  ['mecha', 'Mecha', '〰'],
];
const PART_NAME = { cano: 'el caño de bronce', rueda: 'la rueda de la cureña', mecha: 'la mecha' };
const GOLD = 0xffc84a;
const tmpV = new THREE.Vector3();

export default class TowerEgg {
  constructor(game) {
    this.g = game;
    this.M = game.world.M;
    this.T = game.world.tower;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // easter egg musical: tres amplificadores en la torre (world/SongEgg.js)
    this.song = new SongEgg(game, 'torre');
    this.fight = false;
    // 0 hablar con Fierro, 1 piezas, 2 armar, 3 encierro por armar, 4 almas,
    // 5 alma pesada, 6 prender la mecha, 7 pagar, 8 subir, 9 la pelea
    this.step = 0;
    this.parts = { cano: 'none', rueda: 'hanging', mecha: 'sealed' };
    this.placed = { cano: false, rueda: false, mecha: false };
    this.locks = [true, true, true];
    this.enc = null;
    this.bank = 0;
    this.voiceT = 90;
    this.startT = 22;
    this.npc = new Avatars(game, null);
    this.buildFogon();
    this.buildFierro();
    this.buildCano();
    this.buildRueda();
    this.buildSeal();
    this.buildCannon();
    this.buildEnding();
    this.buildBeam();
    this.buildObjective();
    this.register();
  }

  // ---------------- lo que se ve ----------------
  glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.scale.setScalar(size);
    return s;
  }

  makeRing(x, y, z, r, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r, 64).rotateX(-Math.PI / 2), mat);
    ring.position.set(x, y + 0.04, z);
    ring.renderOrder = 2;
    this.root.add(ring);
    return ring;
  }

  // El fogón de la planta baja, con un tronco para sentarse.
  buildFogon() {
    const M = this.M;
    const [x, z] = EE.fogon;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), M.stone, Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55));
    }
    for (let i = 0; i < 4; i++) g.add(mesh(cylGeo(0.05, 0.06, 0.8, 6), M.log, 0, 0.12, 0, Math.PI / 2 - 0.25, (i / 4) * Math.PI, 0));
    g.add(mesh(cylGeo(0.4, 0.4, 0.04, 12), M.fireGlow, 0, 0.03, 0));
    this.root.add(g);
    this.g.world.addBox([x - 0.7, 0, z - 0.7, x + 0.7, 0.4, z + 0.7], { kind: 'prop' });
    this.fogonPos = new THREE.Vector3(x, 0.25, z);
    this.fogonLight = new THREE.PointLight(0xff8a3a, 14, 9, 1.8);
    this.fogonLight.position.set(x, 0.8, z);
    this.root.add(this.fogonLight);
  }

  // El ánima de Martín Fierro: un gaucho de luz azulada.
  buildFierro() {
    const [x, z] = EE.fierro.pos;
    const n = { id: 500, name: 'Martín Fierro', pos: new THREE.Vector3(x, EE.fierro.y, z), yaw: EE.fierro.rot, pitch: 0.1, speed: 0, crouch: true, moving: false };
    this.npc.add(n);
    const a = this.npc.list.get(500);
    for (const m of Object.values(a.M)) {
      m.transparent = true;
      m.opacity = 0.62;
      m.depthWrite = false;
      if (m.emissive) {
        m.emissive.set(0x3a7aff);
        m.emissiveIntensity = 0.9;
      }
    }
    a.M.poncho.color.set(0x6a8ad8);
    a.hand.visible = true;
    this.fierro = n;
    this.fierroGlow = this.glowSprite(0x6a9aff, 2.6);
    this.root.add(this.fierroGlow);
    this.fierroSpot = 'base';
  }

  // Dónde está Fierro: abajo, al lado del fogón, o arriba, junto al cañón.
  fierroHome(spot) {
    if (spot === 'top') {
      const [cx, cz] = EE.canon.pos;
      return { pos: new THREE.Vector3(cx - 2.4, EE.canon.y, cz + 3.4), yaw: 2.6, crouch: false };
    }
    const [x, z] = EE.fierro.pos;
    return { pos: new THREE.Vector3(x, EE.fierro.y, z), yaw: EE.fierro.rot, crouch: true };
  }

  // El caño de bronce, tirado en el secadero.
  cannonBarrel(scale = 1) {
    const M = this.M;
    const g = new THREE.Group();
    const bronze = M.brass;
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.24, 0], [0.26, 0.1], [0.22, 0.3], [0.17, 1.5], [0.19, 1.55], [0.19, 1.62], [0.14, 1.62], [0.14, 1.4], [0, 1.4]].map(([r, y]) => new THREE.Vector2(r * scale, y * scale)), 18), bronze);
    g.add(body);
    g.add(mesh(new THREE.SphereGeometry(0.14 * scale, 10, 8), bronze, 0, -0.05 * scale, 0));
    for (const s of [-1, 1]) g.add(mesh(cylGeo(0.05 * scale, 0.05 * scale, 0.14 * scale, 8), bronze, s * 0.28 * scale, 0.45 * scale, 0, 0, 0, Math.PI / 2));
    return g;
  }

  cannonWheel() {
    const M = this.M;
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), M.woodDark, 0, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.46, 0.02, 4, 20), M.iron, 0, 0, 0.04));
    g.add(mesh(cylGeo(0.09, 0.09, 0.16, 10), M.iron, 0, 0, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) g.add(mesh(boxGeo(0.04, 0.9, 0.04), M.wood, 0, 0, 0, 0, 0, (i / 8) * Math.PI));
    return g;
  }

  fuseModel() {
    const M = this.M;
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.1 - i * 0.012, 0.014, 5, 16), M.rope, 0, 0.02 + i * 0.028, 0, Math.PI / 2, 0, 0));
    g.add(mesh(cylGeo(0.012, 0.012, 0.3, 5), M.rope, 0.08, 0.2, 0, 0, 0, 0.6));
    return g;
  }

  buildCano() {
    const [x, z] = EE.cano.pos;
    const y = EE.cano.y;
    const g = this.cannonBarrel(0.8);
    g.rotation.set(Math.PI / 2 - 0.08, 0.6, 0);
    g.position.set(x, y + 0.22, z);
    this.root.add(g);
    this.canoObj = g;
    this.canoGlow = fireflies(this.g, GOLD, 1.4);
    this.canoGlow.position.set(x, y + 0.5, z);
    this.root.add(this.canoGlow);
    this.canoPos = new THREE.Vector3(x, y + 0.6, z);
  }

  // La rueda colgada arriba del agujero del piso 8 (tres cadenas con candado).
  buildRueda() {
    const [x, z] = EE.rueda.pos;
    const top = EE.rueda.y + TOWER.fh - TOWER.slab;
    const hang = top - 1.25;
    const g = this.cannonWheel();
    g.scale.setScalar(1.25);
    g.position.set(x, hang, z);
    this.root.add(g);
    this.ruedaObj = g;
    this.ruedaY = hang;
    this.chains = [];
    this.lockObjs = [];
    const chainGeo = new THREE.TorusGeometry(0.06, 0.016, 4, 8);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const ax = x + Math.cos(a) * 1.1;
      const az = z + Math.sin(a) * 1.1;
      const ch = new THREE.Group();
      const from = new THREE.Vector3(ax, top - 0.1, az);
      const to = new THREE.Vector3(x + Math.cos(a) * 0.5, hang + 0.4, z + Math.sin(a) * 0.5);
      const n = 9;
      for (let k = 0; k < n; k++) {
        const link = new THREE.Mesh(chainGeo, this.M.iron);
        link.position.lerpVectors(from, to, k / (n - 1));
        link.rotation.y = k % 2 ? Math.PI / 2 : 0;
        link.rotation.x = 0.2;
        ch.add(link);
      }
      this.root.add(ch);
      this.chains.push(ch);
      const lock = new THREE.Group();
      lock.add(mesh(boxGeo(0.22, 0.26, 0.1), this.M.brass, 0, 0, 0));
      lock.add(mesh(new THREE.TorusGeometry(0.07, 0.02, 5, 10, Math.PI), this.M.iron, 0, 0.13, 0));
      const glow = this.glowSprite(0xffb040, 0.8);
      lock.add(glow);
      lock.position.set(ax, top - 0.45, az);
      this.root.add(lock);
      this.lockObjs.push({ obj: lock, glow, pos: lock.position.clone() });
    }
    // donde cae: la plaza del piso 5
    this.ruedaLand = new THREE.Vector3(x + 0.6, EE.rueda.land, z - 0.4);
    this.ruedaGlow = fireflies(this.g, GOLD, 1.6);
    this.ruedaGlow.visible = false;
    this.root.add(this.ruedaGlow);
    this.ruedaPos = this.ruedaLand.clone().setY(EE.rueda.land + 0.7);
  }

  // El sello de la plaza del piso 10.
  buildSeal() {
    const [x, z] = EE.sello.pos;
    const y = EE.sello.y;
    const r = EE.sello.r;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.translate(256, 256);
    ctx.strokeStyle = '#ffe090';
    ctx.shadowColor = '#ffb030';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 240, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.stroke();
    // una estrella de ocho puntas y marcas de yerba alrededor
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 80 : 190;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillStyle = '#ffd070';
    ctx.textAlign = 'center';
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.rotate((i / 12) * Math.PI * 2);
      ctx.fillText('✦', 0, -218);
      ctx.restore();
    }
    const tex = toTexture(c, { repeat: false });
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xffd070).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const seal = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), mat);
    seal.position.set(x, y + 0.02, z);
    seal.renderOrder = 2;
    this.root.add(seal);
    this.sealObj = seal;
    this.sealPos = new THREE.Vector3(x, y, z);
    this.mechaObj = this.fuseModel();
    this.mechaObj.position.set(x, y + 0.4, z);
    this.mechaObj.visible = false;
    this.root.add(this.mechaObj);
    this.mechaGlow = fireflies(this.g, 0xff8a3a, 1.4);
    this.mechaGlow.visible = false;
    this.root.add(this.mechaGlow);
    this.mechaPos = new THREE.Vector3(x, y + 0.8, z);
  }

  // El cañón de la cima y el encierro (las rejas) alrededor.
  buildCannon() {
    const M = this.M;
    const [x, z] = EE.canon.pos;
    const y = EE.canon.y;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // la cureña: dos flancos de madera con herrajes
    for (const s of [-1, 1]) {
      g.add(mesh(boxGeo(0.14, 0.7, 1.9), M.woodDark, s * 0.38, 0.55, 0, -0.28, 0, 0));
      g.add(mesh(boxGeo(0.16, 0.06, 1.7), M.iron, s * 0.38, 0.88, 0.05, -0.28, 0, 0));
    }
    g.add(mesh(boxGeo(0.9, 0.12, 0.3), M.woodDark, 0, 0.25, -0.75));
    g.add(mesh(cylGeo(0.06, 0.06, 1.2, 8), M.iron, 0, 0.5, 0.55, 0, 0, Math.PI / 2));
    // una rueda de fábrica; la otra es la que se busca
    const w0 = this.cannonWheel();
    w0.position.set(-0.62, 0.48, 0.55);
    w0.rotation.y = Math.PI / 2;
    g.add(w0);
    const w1 = this.cannonWheel();
    w1.position.set(0.62, 0.48, 0.55);
    w1.rotation.y = Math.PI / 2;
    w1.visible = false;
    g.add(w1);
    // el caño apunta al cielo (al ojo de la tormenta)
    const barrel = this.cannonBarrel(1);
    barrel.position.set(0, 0.9, 0.1);
    barrel.rotation.x = -0.35;
    barrel.visible = false;
    g.add(barrel);
    // la mecha, enrollada arriba del travesaño de atrás de la cureña, con la
    // punta inclinada hacia la recámara (antes quedaba colgando del borde del
    // flanco, en el aire)
    const fuse = this.fuseModel();
    fuse.position.set(0, 0.31, -0.7);
    fuse.rotation.y = Math.PI / 2;
    fuse.visible = false;
    g.add(fuse);
    this.root.add(g);
    this.g.world.addBox([x - 0.9, y, z - 1.1, x + 0.9, y + 1.3, z + 1.1], { kind: 'prop' });
    this.cannon = { group: g, barrel, wheel: w1, fuse, pos: new THREE.Vector3(x, y + 1.2, z), mouth: new THREE.Vector3() };
    // las rejas del encierro (salen del piso cuando se arma)
    this.cage = new THREE.Group();
    const R = EE.canon.cage;
    const bars = [];
    this.cageBoxes = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      // cuatro entradas (norte, sur, este y oeste)
      const gap = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].some((c) => Math.abs(((a - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.2);
      if (gap) continue;
      const bx = x + Math.cos(a) * R;
      const bz = z + Math.sin(a) * R;
      bars.push(mesh(cylGeo(0.035, 0.035, 2.6, 6), M.bars || M.iron, bx, 1.3, bz));
      this.cageBoxes.push(this.g.world.addBox([bx - 0.12, y, bz - 0.12, bx + 0.12, y + 2.6, bz + 0.12], { kind: 'prop', shoot: false }));
    }
    for (const b of bars) this.cage.add(b);
    // anillos de arriba y de abajo
    this.cage.add(mesh(new THREE.TorusGeometry(R, 0.04, 5, 64), M.bars || M.iron, x, 2.55, z, Math.PI / 2, 0, 0));
    this.cage.add(mesh(new THREE.TorusGeometry(R, 0.05, 5, 64), M.bars || M.iron, x, 0.1, z, Math.PI / 2, 0, 0));
    this.cage.position.y = y - 2.7;
    this.cage.visible = false;
    this.root.add(this.cage);
    for (const b of this.cageBoxes) b.active = false;
    this.cageK = 0;
    this.encRing = this.makeRing(x, y, z, R, 0x9a6aff);
  }

  // La pared dorada del "buyable ending".
  buildEnding() {
    const def = EE.ending;
    const a = this.g.world.wallAnchor(def.cell, def.face, 0.03);
    const y = def.y;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    this.endingCtx = c.getContext('2d');
    const tex = toTexture(c, { repeat: false });
    this.endingTex = tex;
    this.drawEnding(this.endingCost());
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.7, emissive: 0xffb030, emissiveMap: tex, emissiveIntensity: 0.1 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
    panel.position.set(a.x, y + 1.55, a.z);
    panel.rotation.y = a.rot;
    this.root.add(panel);
    this.endingMat = mat;
    this.endingPos = new THREE.Vector3(a.x, y + 1.4, a.z);
  }

  // Lo que cuesta la escalera divina: 40.000 solo y 20.000 más por cada
  // jugador de más. Lo decide el anfitrión con los que hay ahora (el invitado
  // usa el que le mandó; si todavía no le llegó, cuenta los que ve).
  endingCost() {
    const g = this.g;
    if (g.net?.guest && this.costNet) return this.costNet;
    const def = EE.ending;
    const n = Math.max(1, Math.min(4, g.net ? g.net.net.count : 1));
    return def.cost + (def.perPlayer || 0) * (n - 1);
  }

  // El precio dicho en palabras (para las voces).
  costWords() {
    const n = this.endingCost();
    return { 40000: 'Cuarenta mil', 60000: 'Sesenta mil', 80000: 'Ochenta mil', 100000: 'Cien mil' }[n] || n.toLocaleString('es-AR');
  }

  // El cartel de la pared dorada, con el precio de ahora.
  drawEnding(cost) {
    this.drawnCost = cost;
    const ctx = this.endingCtx;
    const grd = ctx.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#fff0b0');
    grd.addColorStop(0.5, '#d8a030');
    grd.addColorStop(1, '#8a5a10');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#5a3a0a';
    ctx.lineWidth = 12;
    ctx.strokeRect(14, 14, 484, 484);
    ctx.fillStyle = '#3a2408';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.fillText('BUYABLE', 256, 150);
    ctx.fillText('ENDING', 256, 215);
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillText('la escalera al cielo', 256, 280);
    ctx.font = 'bold 64px Impact, "Arial Black", sans-serif';
    ctx.fillText(`$${cost.toLocaleString('es-AR')}`, 256, 390);
    ctx.font = '22px Georgia, serif';
    ctx.fillText('se aporta entre todos', 256, 432);
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText(`${EE.ending.cost.toLocaleString('es-AR')} solo · +${(EE.ending.perPlayer || 0).toLocaleString('es-AR')} por jugador`, 256, 462);
    this.endingTex.needsUpdate = true;
  }

  buildBeam() {
    // una columna de luz del piso al techo del piso que sigue (no atraviesa los otros pisos)
    const mat = new THREE.MeshBasicMaterial({ color: 0x9ac8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, TOWER.fh - 0.4, 16, 1, true), mat);
    this.beam.visible = false;
    this.root.add(this.beam);
  }

  // El cartel del objetivo (abajo de los íconos de arriba a la derecha; el
  // estilo es .mdu-obj en ui/hudThemes.css).
  buildObjective() {
    const el = document.createElement('div');
    el.className = 'mdu-obj';
    el.hidden = true;
    this.g.hud.root.appendChild(el);
    this.objEl = el;
    this.objKey = '';
  }

  // o: { main, sub, count, list: [[pieza, dónde, ya está]] } o null. Arriba,
  // un rombo por paso (nueve del easter egg y la pelea).
  setObjective(o) {
    const stage = this.fight ? 9 : this.step;
    const key = o ? `${stage}|${JSON.stringify(o)}` : '';
    if (key === this.objKey) return;
    this.objKey = key;
    this.objEl.hidden = !o;
    if (!o) {
      this.objEl.innerHTML = '';
      return;
    }
    const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}"></i>`).join('');
    const list = o.list ? `<ul>${o.list.map(([name, where, done]) => `<li class="${done ? 'is-done' : ''}">${name}${where ? ` <span>· ${where}</span>` : ''}</li>`).join('')}</ul>` : '';
    this.objEl.innerHTML =
      `<header><span>${this.fight ? 'El Infierno Matero' : 'Las Revelaciones'}</span><em class="mdu-obj__pips">${pips}</em></header>` +
      `<p>${o.main}</p>${o.sub ? `<small>${o.sub}</small>` : ''}${o.count ? `<b class="mdu-obj__count">${o.count}</b>` : ''}${list}`;
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    const I = g.interact;
    this.fierroIt = I.add({
      kind: 'ee',
      pos: new THREE.Vector3(),
      radius: 2.6,
      prompt: () => (this.fight ? null : { text: 'hablar con Martín Fierro', noCost: true }),
      cost: () => 0,
      use: () => {
        if (this.fight) return false;
        this.talk();
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.canoPos,
      radius: 2,
      prompt: () => (this.parts.cano === 'none' ? { text: 'agarrar el caño de bronce', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.parts.cano !== 'none') return false;
        this.take('cano');
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.ruedaPos,
      radius: 2.2,
      prompt: () => (this.parts.rueda === 'ground' ? { text: 'agarrar la rueda de la cureña', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.parts.rueda !== 'ground') return false;
        this.take('rueda');
        return true;
      },
    });
    I.add({
      kind: 'ee',
      pos: this.mechaPos,
      radius: 2.2,
      prompt: () => {
        if (this.parts.mecha === 'ground') return { text: 'agarrar la mecha', noCost: true };
        if (this.parts.mecha === 'sealed' && this.step >= 1) return { text: 'Un sello de oro. Solo se rompe si alguien le cae encima desde arriba... con PhD Flopper', noCost: true, info: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.parts.mecha !== 'ground') return false;
        this.take('mecha');
        return true;
      },
    });
    // el cañón: poner piezas, armar el encierro, prender la mecha
    I.add({
      kind: 'ee',
      pos: this.cannon.pos,
      radius: 2.8,
      prompt: () => {
        if (this.fight || this.step >= 7) return null;
        const next = ['cano', 'rueda', 'mecha'].find((k) => this.parts[k] === 'held' && !this.placed[k]);
        if (next) return { text: `poner ${PART_NAME[next]} en el cañón`, noCost: true };
        const miss = ['cano', 'rueda', 'mecha'].filter((k) => !this.placed[k]);
        if (miss.length) return { text: `El cañón de la Vuelta de Obligado: falta ${miss.map((k) => PART_NAME[k]).join(', ')}`, noCost: true, info: true };
        if (this.step === 3) return { text: 'armar el encierro (las rejas alrededor del cañón)', noCost: true };
        if (this.step === 4) return { text: `El encierro: ${this.enc?.souls || 0} de ${this.enc?.need || 0} almas`, noCost: true, info: true };
        if (this.step === 5) return { text: 'Falta la bala: el alma pesada que mandó la Voz', noCost: true, info: true };
        if (this.step === 6) return { text: 'prender la mecha y disparar', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.fight || this.step >= 7 || this.scene) return false;
        const next = ['cano', 'rueda', 'mecha'].find((k) => this.parts[k] === 'held' && !this.placed[k]);
        if (next) {
          this.place(next);
          return true;
        }
        if (this.step === 3) {
          this.startEncierro();
          return true;
        }
        if (this.step === 6) {
          this.fire();
          return true;
        }
        return false;
      },
    });
    // la pared dorada: cada uno aporta lo suyo (la plata es de cada uno)
    I.add({
      kind: 'ee',
      local: true,
      pos: this.endingPos,
      radius: 2.4,
      prompt: () => {
        if (this.step < 7) return this.step >= 1 ? { text: 'Una pared de oro que dice "BUYABLE ENDING". Todavía no pasa nada', noCost: true, info: true } : null;
        if (this.step > 7) return null;
        const left = Math.max(0, this.endingCost() - this.bank);
        if (g.points <= 0) return { text: `Escalera divina: faltan ${left.toLocaleString('es-AR')} (no tenés plata para aportar)`, noCost: true, info: true };
        return { text: `aportar ${Math.min(left, g.points).toLocaleString('es-AR')} a la escalera divina (faltan ${left.toLocaleString('es-AR')})`, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.step !== 7) return false;
        const n = Math.min(this.endingCost() - this.bank, g.points);
        if (n <= 0 || !g.spend(n)) return false;
        g.audio.purchase();
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'deposit', n });
        else this.deposit(n, g.net?.id ?? 0);
        return true;
      },
    });
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  say(who, text, delay = 0) {
    const g = this.g;
    if (g.net?.guest) return;
    const fn = () => g.say(who, text, who === 'entidad' ? 'boss' : 'npc');
    if (delay) g.later(delay, fn);
    else fn();
  }

  lines(who, list, start = 0) {
    let t = start;
    for (const text of list) {
      this.say(who, text, t);
      t += Math.max(2.5, text.length * 0.065 + 0.6);
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

  // ---------------- pasos ----------------
  talk() {
    if (this.step === 0) {
      this.step = 1;
      this.lines('fierro', FIERRO.intro);
      this.netSync();
    } else this.say('fierro', this.remind());
    this.voiceT = 100;
  }

  // Lo que dice Fierro si le hablás de nuevo (o si pasa mucho sin avanzar).
  remind() {
    const p = this.parts;
    if (this.step <= 1) {
      if (p.cano === 'none') return 'El caño, paisano. En el secadero, en el piso 3.';
      if (p.rueda === 'hanging') return 'La rueda cuelga arriba del agujero del piso 8. Tres candados, a tiros.';
      if (p.rueda === 'ground') return 'La rueda se cayó hasta la plaza del piso 5. Andá a buscarla.';
      if (p.mecha === 'sealed') return 'El sello del piso 10 cede si le caés encima desde arriba, con la Flopa Hermanos en el cuerpo.';
      if (p.mecha === 'ground') return 'La mecha quedó en la plaza del piso 10.';
    }
    if (this.step === 2) return 'Las piezas van al cañón de la cima, en el piso 15.';
    if (this.step === 3) return 'Armen el encierro alrededor del cañón.';
    if (this.step === 4) return 'Almas, muchachos. Liquiden muertos adentro de las rejas.';
    if (this.step === 5) return 'El alma pesada... bájenlo, que esa es la bala.';
    if (this.step === 6) return 'Prendan la mecha. Al ojo de la tormenta.';
    if (this.step === 7) return `La pared dorada, en la cima. ${this.costWords()}${this.players() > 1 ? ' entre todos. Si alguno anda corto, convídenle plata.' : '.'}`;
    if (this.step === 8) return 'Suban la escalera. Todos juntos.';
    return 'Aguanten, paisanos.';
  }

  take(k) {
    const g = this.g;
    this.parts[k] = 'held';
    this.toastAll(`Conseguiste: ${PART_NAME[k]}`);
    if (k === 'cano') this.say('entidad', VOZ.cano, 1.5);
    if (this.step < 1) this.step = 1;
    if (['cano', 'rueda', 'mecha'].every((x) => this.parts[x] === 'held' || this.placed[x])) {
      this.step = Math.max(this.step, 2);
      this.say('fierro', FIERRO.parts, 2);
      g.later(4, () => this.moveFierro('top'));
    }
    this.netSync();
  }

  moveFierro(spot) {
    if (this.fierroSpot === spot) return;
    this.fierroSpot = spot;
    const g = this.g;
    g.fx.sparkle(this.fierro.pos.clone().setY(this.fierro.pos.y + 1), [0.5, 0.7, 1], 30, 0.8);
    this.netSync();
  }

  place(k) {
    const g = this.g;
    this.placed[k] = true;
    this.parts[k] = 'placed';
    g.audio.boardRepair?.(this.cannon.pos);
    g.fx.sparkle(this.cannon.pos, [1, 0.85, 0.4], 25, 0.8);
    if (Object.values(this.placed).every(Boolean)) {
      this.step = 3;
      this.toastAll('El cañón de la Vuelta de Obligado está armado');
      this.lines('fierro', FIERRO.built, 1);
    }
    this.netSync();
  }

  startEncierro() {
    const g = this.g;
    if (this.step !== 3) return;
    this.step = 4;
    this.enc = { souls: 0, need: EE.canon.souls + 8 * (this.players() - 1), spawnT: 2 };
    for (const b of this.cageBoxes) b.active = true;
    g.world.computeNavBlock();
    g.audio.door(this.cannon.pos, false);
    g.audio.bossArrive();
    this.announce(`El encierro. Liquidá muertos adentro de las rejas (${this.enc.need} almas).`, 4, true);
    this.say('entidad', VOZ.encierro, 2);
    this.netSync();
  }

  finishEncierro() {
    const g = this.g;
    this.step = 5;
    this.enc = null;
    this.toastAll('El encierro se llenó de almas');
    this.say('entidad', VOZ.heavy, 0.8);
    this.say('fierro', FIERRO.heavy, 4.5);
    g.later(3, () => this.sendHeavy());
    this.netSync();
  }

  // La Voz manda un jefe a la cima: es la bala del cañón.
  sendHeavy() {
    const g = this.g;
    if (this.step !== 5 || (this.heavy && !this.heavy.dead && g.zombies.boss === this.heavy)) return;
    // también el cadáver de un jefe de ronda recién muerto (si no, spawnBoss lo devuelve a él)
    if (g.zombies.boss) g.zombies.removeBoss();
    // adentro de las rejas del encierro (antes salía afuera, del otro lado),
    // lejos del cañón y del lado contrario al jugador
    const [x, z] = EE.canon.pos;
    const y = EE.canon.y;
    const pp = g.player.pos;
    const away = Math.atan2(z - pp.z, x - pp.x);
    let at = null;
    for (let i = 0; i < 13 && !at; i++) {
      const a = away + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
      const px = x + Math.cos(a) * 5;
      const pz = z + Math.sin(a) * 5;
      if (!g.nav.blocked(Math.floor(px), Math.floor(pz), y)) at = new THREE.Vector3(px, y, pz);
    }
    at ||= new THREE.Vector3(x + 4, y, z + 4);
    const kind = Math.random() < 0.5 ? 'capataz' : 'alcaide';
    this.heavy = g.zombies.spawnBoss(Math.max(10, g.rounds.round), { kind, at });
    g.hud.subtitle('¡El alma pesada! Bajalo en la cima.', 3, 'boss');
  }

  fire() {
    const g = this.g;
    if (this.step !== 6) return;
    this.step = 7;
    // primero la escena: si le llega antes el paso 7, al invitado se le abre el cielo antes del cañonazo
    g.net?.event('pee', { scene: 'cannon' });
    this.netSync();
    this.playScene('cannon');
  }

  deposit(n, from) {
    const cost = this.endingCost();
    const take = this.step === 7 ? Math.max(0, Math.min(n, cost - this.bank)) : 0;
    // lo que sobra (dos que aportan a la vez, o llegó tarde) vuelve al que lo puso
    if (n > take) this.refund(n - take, from);
    if (take <= 0) return;
    this.bank += take;
    const who = this.g.net ? this.g.net.nameOf(from) : 'Vos';
    this.announce(`${who} aportó ${take.toLocaleString('es-AR')} a la escalera divina (${this.bank.toLocaleString('es-AR')} de ${cost.toLocaleString('es-AR')}).`, 3.5);
    if (this.bank >= cost) this.openStair();
    this.netSync();
  }

  // El anfitrión devuelve plata de la escalera (al invitado se la manda).
  refund(n, from) {
    const g = this.g;
    if (!g.net || from === this.myId()) this.gotRefund(n);
    else g.net.net.to(from, { t: 'ev', e: 'pee', refund: n });
  }

  gotRefund(n) {
    this.g.receivePoints(n);
    this.g.hud.subtitle(`La escalera ya estaba paga: te devolvieron ${n.toLocaleString('es-AR')}.`, 3);
  }

  openStair() {
    const g = this.g;
    this.step = 8;
    this.T.setSky('open');
    this.addStairBoxes();
    g.post?.flash(0.8);
    g.audio.fanfare?.();
    this.toastAll('¡Baja la escalera divina!');
    g.hud.achievement('Buyable Ending', 'Pagaron la escalera al cielo');
    this.say('fierro', FIERRO.paid, 1.5);
    this.netSync();
  }

  // Los escalones más bajos de la escalera divina frenan al que pasa por abajo.
  addStairBoxes() {
    if (this.stairBoxes) return;
    const T = TOWER;
    const S = T.sky;
    const base = EE.canon.y;
    this.stairBoxes = [];
    for (let u = 0.08; u < 0.28; u += 0.035) {
      const h = u * S.pitch;
      const a = S.a0 + u * Math.PI * 2;
      const rm = (S.r0 + S.r1) / 2;
      const x = T.cx + Math.cos(a) * rm;
      const z = T.cz + Math.sin(a) * rm;
      this.stairBoxes.push(this.g.world.addBox([x - 0.8, base, z - 0.8, x + 0.8, base + h - 0.5, z + 0.8], { kind: 'ground', shoot: false }));
    }
  }

  // Todos arriba: la escalera se rompe y caen al Infierno.
  breakStair() {
    const g = this.g;
    if (this.step !== 8) return;
    this.step = 9;
    this.fight = true;
    this.netSync();
    g.net?.event('pee', { scene: 'fall' });
    this.playScene('fall');
  }

  // ---------------- el sello y los candados ----------------
  // Un jugador cayó desde `drop` metros (lo avisa Player; phd: tenía la Flopa).
  onPhdLand(pos, drop, phd = true) {
    const g = this.g;
    if (this.parts.mecha !== 'sealed' || this.step < 1) return;
    const dx = pos.x - this.sealPos.x;
    const dz = pos.z - this.sealPos.z;
    if (Math.hypot(dx, dz) > EE.sello.r + 0.6 || Math.abs(pos.y - this.sealPos.y) > 0.6 || drop < TOWER.fh * 0.8) return;
    if (!phd) {
      if (!this.sealHintT || g.time > this.sealHintT) {
        this.sealHintT = g.time + 20;
        g.say('fierro', '¡Así no, paisano! El sello aguanta el golpe, pero vos no. Tomate la Flopa Hermanos y probá de nuevo.', 'npc', { local: true });
      }
      return;
    }
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'seal' });
    else this.breakSeal();
  }

  breakSeal() {
    const g = this.g;
    if (this.parts.mecha !== 'sealed') return;
    this.parts.mecha = 'ground';
    g.fx.explosion(this.sealPos.clone().setY(this.sealPos.y + 0.3), 4, [1, 0.8, 0.3]);
    g.fx.sparkle(this.sealPos.clone().setY(this.sealPos.y + 0.5), [1, 0.85, 0.4], 60, 3);
    g.post?.flash(0.5);
    this.announce('¡El sello se rompió! Debajo había una mecha.', 4, true);
    this.say('entidad', VOZ.sello, 1.5);
    this.netSync();
  }

  // Un tiro cruzó el mapa: ¿le pegó a algún candado de la rueda?
  onShot(o, d, maxT) {
    // en el Infierno: las calabazas y las ánimas de la pelea con Francisco
    if (this.fight) {
      this.g.arena?.onShot?.(o, d, maxT);
      return;
    }
    if (this.parts.rueda !== 'hanging') return;
    this.lockObjs.forEach((L, i) => {
      if (!this.locks[i]) return;
      const t = rayHitSphere(o, d, L.pos, 0.3);
      if (t !== null && t <= maxT + 0.3) this.hitLock(i);
    });
  }

  onExplosion(pos, radius) {
    if (this.fight) {
      this.g.arena?.onExplosion?.(pos, radius);
      return;
    }
    if (this.parts.rueda !== 'hanging') return;
    this.lockObjs.forEach((L, i) => {
      if (this.locks[i] && L.pos.distanceTo(pos) < radius * 0.6) this.hitLock(i);
    });
  }

  hitLock(i) {
    const g = this.g;
    if (g.net?.guest) {
      g.net.net.send({ t: 'pee', a: 'lock', i });
      return;
    }
    this.breakLock(i);
  }

  breakLock(i) {
    const g = this.g;
    if (!this.locks[i] || this.parts.rueda !== 'hanging') return;
    this.locks[i] = false;
    const L = this.lockObjs[i];
    g.fx.sparks(L.pos, 1.5, { x: 0, y: -1, z: 0 }, [1, 0.8, 0.3]);
    g.audio.chain?.(L.pos);
    const left = this.locks.filter(Boolean).length;
    if (left) this.announce(`¡Candado roto! Quedan ${left}.`, 2);
    else this.dropRueda();
    this.netSync();
  }

  dropRueda() {
    const g = this.g;
    this.parts.rueda = 'falling';
    this.fallT = 0;
    this.announce('¡La rueda se soltó! Cae por el agujero...', 3, true);
    this.say('entidad', VOZ.rueda, 1.5);
    g.later(2.2, () => {
      if (this.parts.rueda !== 'falling') return;
      this.parts.rueda = 'ground';
      this.announce('La rueda cayó en la plaza del piso 5.', 3);
      this.netSync();
    });
  }

  // ---------------- ganchos del juego ----------------
  onPower() {}

  onZone() {}

  dropHat() {}

  onKill(z) {
    const g = this.g;
    if (g.net?.guest) return;
    // el alma pesada
    if (z.boss && this.step === 5 && z === this.heavy) {
      this.heavy = null;
      this.step = 6;
      g.fx.soul(z.pos.clone().setY(z.pos.y + 1.5), this.cannon.pos.clone());
      this.toastAll('El alma pesada cargó el cañón');
      this.say('fierro', FIERRO.loaded, 1.5);
      this.netSync();
      return;
    }
    if (z.boss || !this.enc || this.step !== 4) return;
    const p = z.pos;
    const [x, zz] = EE.canon.pos;
    if (Math.abs(p.y - EE.canon.y) > 1.5 || Math.hypot(p.x - x, p.z - zz) > EE.canon.cage + 0.5) return;
    g.fx.soul(p.clone().setY(p.y + 1), this.cannon.pos);
    g.net?.event('pee', { esoul: [+p.x.toFixed(1), +(p.y + 1).toFixed(1), +p.z.toFixed(1)] });
    this.enc.souls++;
    if (this.enc.souls >= this.enc.need) this.finishEncierro();
    else if (this.enc.souls % 3 === 0) this.netSync();
  }

  // El remolino del Mark III: lo ven todos y el anfitrión arrastra a los muertos.
  shareVortex(v) {
    const g = this.g;
    if (!g.net) return;
    v.by = this.myId();
    if (g.net.guest) g.net.net.send({ t: 'pee', a: 'vx', vx: v });
    else g.net.event('pee', { vx: v });
  }

  // Lo que manda un invitado.
  onGuest(m, from) {
    if (m.a === 'vx' && Array.isArray(m.vx?.p) && Array.isArray(m.vx?.v)) {
      m.vx.by = from;
      this.g.weapons.spawnNetVortex(m.vx);
      this.g.net.event('pee', { vx: m.vx });
    } else if (m.a === 'deposit') this.deposit(Math.max(0, m.n | 0), from);
    else if (m.a === 'seal') this.breakSeal();
    else if (m.a === 'lock') this.breakLock(m.i | 0);
    else if (m.a === 'inf') this.g.arena?.onGuestHit?.(m);
  }

  // ---------------- escenas (adentro del juego) ----------------
  playScene(kind) {
    const g = this.g;
    if (this.scene) return;
    const el = document.createElement('div');
    el.className = 'mdu-fcine is-on mdu-fcine--mid';
    el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p>';
    g.root.appendChild(el);
    this.scene = { kind, t: 0, said: 0, el, text: el.querySelector('.mdu-fcine__text') };
    // la escena ocupa la pantalla: sin HUD ni barra de jefe
    g.hud.setBossBar(null);
    g.hud.show(false);
    if (kind === 'cannon') {
      // el cielo arranca cerrado: se abre recién cuando pega la bala
      this.T.skyOpenK = 0;
      // la bala
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8a0ff).multiplyScalar(2.5), toneMapped: false }));
      this.ball.visible = false;
      this.root.add(this.ball);
    } else {
      this.T.setSky('broken');
      g.audio.shatter?.(g.camera.position);
      g.post?.flash(0.8);
      const S = this.scene;
      S.hold = g.player.pos.clone();
      S.yaw0 = g.player.yaw;
      S.pitch0 = g.player.pitch;
      // de dónde sale despedido: del lado de la torre donde estaba en la escalera
      S.a0 = Math.atan2(S.hold.z - TOWER.cz, S.hold.x - TOWER.cx);
      S.r0 = Math.hypot(S.hold.x - TOWER.cx, S.hold.z - TOWER.cz);
      g.player.guardT = g.time + 16;
    }
  }

  // Cámara de la escena (la llama Game después de mover al jugador).
  sceneCam(dt) {
    const S = this.scene;
    if (!S) return false;
    const g = this.g;
    S.t += dt;
    const t = S.t;
    const cam = g.camera;
    const lines = S.kind === 'cannon' ? CANNON_LINES : FALL_LINES;
    while (S.said < lines.length && t >= lines[S.said][0]) {
      const [, who, text] = lines[S.said];
      S.text.textContent = text;
      S.text.classList.remove('is-on');
      void S.text.offsetWidth;
      S.text.classList.add('is-on');
      g.audio.say(text, who, { cine: true });
      S.said++;
    }
    if (S.kind === 'cannon') this.cannonCam(t, dt, cam);
    else this.fallCam(t, dt, cam);
    return true;
  }

  // El cañonazo: la cámara mira el cañón, sigue la bala hasta el ojo y ve cómo se abre el cielo.
  cannonCam(t, dt, cam) {
    const g = this.g;
    const C = this.cannon;
    const eye = this.T.eye.position;
    const mouth = C.barrel.localToWorld(tmpV.set(0, 1.6, 0)).clone();
    if (t < 3) {
      const a = 0.6 + t * 0.12;
      cam.position.set(C.pos.x + Math.sin(a) * 5, C.pos.y + 1.2 + t * 0.2, C.pos.z + Math.cos(a) * 5);
      cam.lookAt(C.pos.x, C.pos.y + 0.8, C.pos.z);
      if (t > 1.2 && Math.random() < 0.6) g.fx.fire(C.fuse.localToWorld(new THREE.Vector3(0.08, 0.3, 0)), 0.05, 1);
      return;
    }
    if (!S2(this.scene, 'shot')) {
      g.fx.explosion(mouth, 2.2, [1, 0.7, 0.3]);
      g.fx.flash(mouth, 0xffc070, 150, 0.6, 30);
      g.audio.explosion(mouth, 1.6);
      g.audio.thunder?.(mouth);
      g.fx.addShake(0.8);
      this.ball.visible = true;
      this.ballFrom = mouth;
    }
    const k = Math.min(1, (t - 3) / 3.2);
    this.ball.position.lerpVectors(this.ballFrom, eye, k * k);
    if (Math.random() < 0.8) g.fx.fire(this.ball.position, 0.15, 1);
    if (k < 1) {
      cam.position.lerpVectors(C.pos.clone().add(new THREE.Vector3(3, 1.5, 3)), this.ball.position.clone().add(new THREE.Vector3(4, -6, 4)), Math.min(1, k * 0.9));
      cam.lookAt(this.ball.position);
      return;
    }
    if (!S2(this.scene, 'hit')) {
      this.ball.visible = false;
      this.T.hurtEye(1.5);
      g.post?.flash(1.4);
      g.audio.explosion(eye, 2);
      g.audio.thunder?.(null, true);
      g.fx.lightning(eye.clone(), eye.clone().add(new THREE.Vector3(18, -30, 4)), 0xffe8ff, 0.8);
      g.fx.lightning(eye.clone(), eye.clone().add(new THREE.Vector3(-14, -28, -10)), 0xc8a0ff, 0.8);
      if (g.weather) g.weather.flash = 1;
    }
    // el cielo se abre de oro (la escalera baja recién cuando se paga)
    if (t > 8.5 && !S2(this.scene, 'sky')) this.T.skyOpenK = 1;
    const u = Math.min(1, (t - 6.2) / 6);
    const base = EE.canon.y;
    cam.position.set(TOWER.cx + 11 - u * 3, base + 4 + u * 2, TOWER.cz + 11 - u * 3);
    cam.lookAt(TOWER.cx, base + 10 + (1 - u) * 40, TOWER.cz);
    if (t > 15.5) this.endScene();
  }

  // La escalera se rompe y caen. La caída va por AFUERA de la torre (antes la
  // cámara bajaba por adentro y atravesaba los quince pisos): el golpe los
  // tira hacia el remolino, caen de espaldas mirando la torre y el cielo roto,
  // todo se pone colorado y aparecen bajando por la bóveda del Infierno.
  fallCam(t, dt, cam) {
    const g = this.g;
    const S = this.scene;
    if (!S.song && t >= FALL_SONG) {
      S.song = true;
      // (world/Arena la ve sonando y no la vuelve a arrancar; la pelea la sigue)
      g.music?.play('jefe-torre', { at: FALL_AT + Math.max(0, t - FALL_SONG), fadeIn: FALL_AT ? 1 : 0, loop: true, while: (G) => (this.scene?.kind === 'fall' || (G.arena?.active && G.arena.phase !== 'won')) && (G.state === 'playing' || G.state === 'paused') });
    }
    // el jugador no cae de verdad (la cámara hace la caída); al invitado lo
    // suelta cuando el anfitrión arranca la pelea (ahí lo lleva a la caverna)
    const H = S.hold;
    if (H && !g.arena?.active) {
      g.player.pos.copy(H);
      g.player.vel.set(0, 0, 0);
      g.player.airTop = H.y;
      g.player.onGround = true;
    }
    const eyeY = H.y + 1.62;
    if (t < FALL.crack) {
      // se rompe bajo los pies: mira para abajo y tiembla todo
      const k = t / FALL.crack;
      cam.position.set(H.x, eyeY - k * 0.4, H.z);
      cam.rotation.set(S.pitch0 + (-0.75 - S.pitch0) * k * k, S.yaw0, 0, 'YXZ');
      g.fx.addShake(dt * 1.5);
      if (Math.random() < 0.5) g.fx.sparkle(tmpV.set(H.x + (Math.random() - 0.5) * 3, H.y - Math.random(), H.z + (Math.random() - 0.5) * 3), [1, 0.85, 0.4], 2, 0.3);
      return;
    }
    if (t < FALL.cave) {
      if (!S2(S, 'toss')) {
        g.audio.whoosh?.(cam.position);
        g.audio.shatter?.(cam.position);
      }
      // de la escalera hacia afuera, dando la vuelta despacio alrededor de la torre
      const u = t - FALL.crack;
      const e = Math.min(1, u / 1.2);
      const r = S.r0 + (FALL.out - S.r0) * e * (2 - e);
      const a = S.a0 + u * 0.16;
      const y = Math.max(3, eyeY + 3 * u - 4.5 * u * u);
      cam.position.set(TOWER.cx + Math.cos(a) * r, y, TOWER.cz + Math.sin(a) * r);
      // de espaldas: mira la torre de abajo hacia arriba, con el cielo roto atrás
      cam.lookAt(TOWER.cx, Math.max(y + 9, EE.canon.y + 4), TOWER.cz);
      cam.rotation.z += Math.sin(t * 3.1) * 0.08;
      if (Math.random() < 0.8) g.fx.sparkle(tmpV.set(cam.position.x + (Math.random() - 0.5) * 5, y + 2 + Math.random() * 6, cam.position.z + (Math.random() - 0.5) * 5), [1, 0.85, 0.4], 2, 0.4);
      if (t > FALL.red && !S2(S, 'red')) {
        S.el.style.transition = 'background 0.9s';
        S.el.style.background = 'rgba(70, 4, 0, 1)';
        g.audio.thunder?.(cam.position);
      }
      return;
    }
    // la bóveda del Infierno: baja despacio hasta donde arranca la pelea
    const A = EE.arena;
    const ay = A.y || 0;
    if (!S2(S, 'cave')) {
      const ar = g.arena;
      if (ar?.root) ar.root.visible = true;
      for (const l of ar?.lights || []) l.intensity = 34;
      S.el.style.transition = 'background 1.4s';
      S.el.style.background = 'rgba(70, 4, 0, 0)';
      g.audio.bossSlam?.(tmpV.set(A.x, ay + 2, A.z));
    }
    const k = Math.min(1, (t - FALL.cave) / (FALL.end - FALL.cave - 0.4));
    const e = k * k * (3 - 2 * k);
    cam.position.set(A.x + 3 * (1 - e), ay + 10.5 - (10.5 - 1.62) * e, A.z + 4 + (A.r - 7) * e);
    cam.lookAt(A.x, ay + 2.2 * e, A.z - (A.r - 2.2) * e);
    // el invitado espera en la bóveda a que el anfitrión arranque la pelea (si no, queda arriba de la escalera rota)
    if (t > FALL.end && (!g.net?.guest || g.arena?.active || t > FALL.end + 8)) this.endScene();
  }

  endScene() {
    const g = this.g;
    const S = this.scene;
    if (!S) return;
    this.scene = null;
    S.el.remove();
    g.hud.show(true);
    this.ball?.removeFromParent();
    this.ball = null;
    g.player.guardT = g.time + 2;
    g.player.airTop = g.player.pos.y;
    if (S.kind === 'cannon') {
      this.T.skyOpenK = 1;
      if (!g.net?.guest) {
        this.announce('Se abrió el cielo. La escalera divina baja si se paga en la pared dorada de la cima.', 5, true);
        const many = this.players() > 1;
        this.lines('fierro', FIERRO.shot.map((l) => l.replace('{plata}', this.costWords()).replace('{junten}', many ? 'Junten entre todos' : 'Juntala')), 1);
      }
    } else if (!g.net?.guest) g.arena.start();
  }

  // ---------------- red ----------------
  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  fullState() {
    return {
      step: this.step,
      parts: this.parts,
      placed: this.placed,
      locks: this.locks,
      enc: this.enc ? [this.enc.souls, this.enc.need] : null,
      bank: this.bank,
      cost: this.endingCost(),
      fierro: this.fierroSpot,
      fight: this.fight ? 1 : 0,
    };
  }

  applyRemote(m) {
    const g = this.g;
    if (m.song) {
      this.song.applyRemote(m.song);
      return;
    }
    if (m.refund) {
      this.gotRefund(m.refund);
      return;
    }
    // el remolino del Mark III de otro jugador (el propio ya está en esta compu)
    if (m.vx) {
      if (m.vx.by !== this.myId()) g.weapons.spawnNetVortex(m.vx);
      return;
    }
    if (m.scene) {
      this.playScene(m.scene);
      return;
    }
    // el remolino de Francisco (la pelea final)
    if (m.pull) {
      g.arena?.pull?.(m.pull);
      return;
    }
    // las etapas de la pelea, las ondas y lo que se rompe
    if (m.inf) {
      g.arena?.onNet?.(m.inf);
      return;
    }
    if (m.esoul) {
      g.fx.soul(new THREE.Vector3(...m.esoul), this.cannon.pos);
      if (this.enc) this.enc.souls++;
      return;
    }
    if (m.step !== undefined) {
      if (m.step >= 4 && this.step < 4) {
        for (const b of this.cageBoxes) b.active = true;
        g.world.computeNavBlock();
      }
      if (m.step >= 8 && this.step < 8) {
        this.T.setSky('open');
        this.addStairBoxes();
      }
      // (aparte: el que entra con la escalera ya abierta también ve el cielo abierto)
      if (m.step >= 7 && !this.scene) this.T.skyOpenK = 1;
      this.step = m.step;
    }
    if (m.parts) this.parts = { ...m.parts };
    if (m.placed) this.placed = { ...m.placed };
    if (m.locks) this.locks = [...m.locks];
    if (m.enc !== undefined) this.enc = m.enc ? { souls: m.enc[0], need: m.enc[1] } : null;
    if (m.bank !== undefined) this.bank = m.bank;
    if (m.cost) this.costNet = m.cost;
    if (m.fierro) this.fierroSpot = m.fierro;
    if (m.fight !== undefined) this.fight = !!m.fight;
  }

  // Alt+K (solo): el cañón ya disparó y la escalera espera la plata.
  debugFinal() {
    const g = this.g;
    this.parts = { cano: 'placed', rueda: 'placed', mecha: 'placed' };
    this.placed = { cano: true, rueda: true, mecha: true };
    this.locks = [false, false, false];
    this.enc = null;
    this.step = 7;
    this.fierroSpot = 'top';
    this.T.skyOpenK = 1;
    // a la cima, al lado de la pared dorada
    const a = this.endingPos;
    g.player.pos.set(a.x, EE.canon.y, a.z + 2);
    g.player.vel.set(0, 0, 0);
    g.player.airTop = EE.canon.y;
    for (let n = 1; n <= TOWER.floors; n++) g.activateZone(`P${n}`);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    this.song.update(dt);
    // Fierro: se prende y apaga despacio como una vela
    const home = this.fierroHome(this.fierroSpot);
    const f = this.fierro;
    if (f.pos.distanceTo(home.pos) > 0.1) {
      f.pos.copy(home.pos);
      f.yaw = home.yaw;
      g.fx.sparkle(f.pos.clone().setY(f.pos.y + 1), [0.5, 0.7, 1], 30, 0.8);
    }
    f.crouch = home.crouch;
    const pp = g.player.pos;
    // mira al que se le acerca
    if (Math.abs(pp.y - f.pos.y) < 2 && Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z) < 6) {
      let d = Math.atan2(pp.x - f.pos.x, pp.z - f.pos.z) + Math.PI - f.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, dt * 1.5);
    }
    this.npc.update(dt);
    const a = this.npc.list.get(500);
    if (a) for (const m of Object.values(a.M)) m.opacity = 0.5 + Math.sin(t * 2.3) * 0.12;
    this.fierroGlow.position.set(f.pos.x, f.pos.y + 1.1, f.pos.z);
    this.fierroGlow.material.opacity = 0.35 + Math.sin(t * 2.3) * 0.12;
    this.fierroIt.pos.set(f.pos.x, f.pos.y + 1.2, f.pos.z);
    // el primer acercamiento: Fierro llama (no durante la intro del mapa: ahí
    // las voces van calladas y el llamado se perdía la primera vez; y un rato
    // después de que termina, así el audio ya salió del modo escena y la
    // música de la intro se apagó: si no, salía el subtítulo sin voz)
    this.freeT = g.intro?.active || this.scene ? 0 : (this.freeT || 0) + dt;
    if (!this.called && this.step === 0 && this.freeT > 2.2 && Math.abs(pp.y - f.pos.y) < 2 && Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z) < 8) {
      this.called = true;
      g.say('fierro', '¡Eh, paisano! Acá, junto al fogón. Vení que tengo que contarte algo.', 'npc', { local: true });
    }
    // fogón
    if (Math.random() < 0.8) g.fx.fire(this.fogonPos, 0.25, 1);
    this.fogonLight.intensity = 12 + Math.sin(t * 13) * 2 + Math.random() * 2;
    // el caño
    const canoOn = this.parts.cano === 'none';
    this.canoObj.visible = canoOn;
    this.canoGlow.visible = canoOn;
    this.canoGlow.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
    // la rueda: colgada, cayendo o en la plaza
    const R = this.parts.rueda;
    this.ruedaObj.visible = R === 'hanging' || R === 'falling' || R === 'ground';
    if (R === 'hanging') {
      this.ruedaObj.position.y = this.ruedaY + Math.sin(t * 0.8) * 0.04;
      this.ruedaObj.rotation.y = Math.sin(t * 0.5) * 0.3;
    } else if (R === 'falling') {
      this.fallT = (this.fallT || 0) + dt;
      const y = this.ruedaY - 0.5 * 9.8 * this.fallT * this.fallT;
      this.ruedaObj.position.set(this.ruedaLand.x, Math.max(this.ruedaLand.y + 0.58, y), this.ruedaLand.z);
      this.ruedaObj.rotation.x += dt * 4;
      if (y <= this.ruedaLand.y + 0.58 && !this.ruedaThud) {
        this.ruedaThud = true;
        g.fx.dust(this.ruedaLand, { x: 0, y: 1, z: 0 }, [0.45, 0.4, 0.35], 16);
        g.audio.bossSlam?.(this.ruedaLand);
      }
    } else if (R === 'ground') {
      this.ruedaObj.position.set(this.ruedaLand.x, this.ruedaLand.y + 0.58, this.ruedaLand.z);
      this.ruedaObj.rotation.set(0, t * 0.6, 0);
    }
    this.ruedaGlow.visible = R === 'ground';
    this.ruedaGlow.position.set(this.ruedaLand.x, this.ruedaLand.y + 0.7, this.ruedaLand.z);
    this.chains.forEach((c) => {
      c.visible = R === 'hanging';
    });
    this.lockObjs.forEach((L, i) => {
      L.obj.visible = R === 'hanging' && this.locks[i];
      L.glow.material.opacity = 0.5 + Math.sin(t * 4 + i) * 0.25;
    });
    // el sello y la mecha
    const M = this.parts.mecha;
    this.sealObj.visible = M === 'sealed';
    this.sealObj.material.opacity = 0.75 + Math.sin(t * 1.7) * 0.25;
    this.sealObj.rotation.y = t * 0.1;
    this.mechaObj.visible = M === 'ground';
    this.mechaGlow.visible = M === 'ground';
    if (M === 'ground') {
      this.mechaObj.position.y = this.sealPos.y + 0.4 + Math.sin(t * 2) * 0.08;
      this.mechaObj.rotation.y += dt;
      this.mechaGlow.position.copy(this.mechaObj.position);
    }
    // el cañón
    this.cannon.barrel.visible = this.placed.cano;
    this.cannon.wheel.visible = this.placed.rueda;
    this.cannon.fuse.visible = this.placed.mecha;
    // las rejas del encierro suben (y bajan después del cañonazo)
    const cageUp = this.step >= 4 && this.step <= 6;
    this.cageK += ((cageUp ? 1 : 0) - this.cageK) * Math.min(1, dt * 1.2);
    this.cage.visible = this.cageK > 0.01;
    this.cage.position.y = EE.canon.y - 2.7 * (1 - this.cageK);
    if (!cageUp && this.cageBoxes[0].active) {
      for (const b of this.cageBoxes) b.active = false;
      g.world.computeNavBlock();
    }
    const ritual = this.step === 4;
    this.encRing.visible = ritual;
    this.encRing.material.opacity = ritual ? 0.45 + Math.sin(t * 6) * 0.15 : 0;
    if (ritual && !g.net?.guest && this.enc) this.encierroSpawns(dt);
    const cost = this.endingCost();
    if (cost !== this.drawnCost) {
      this.drawEnding(cost);
      this.netSync();
    }
    if (this.step === 7 && !g.net?.guest && this.bank >= cost) this.openStair();
    // la pared dorada brilla cuando se puede pagar
    this.endingMat.emissiveIntensity = this.step === 7 ? 0.6 + Math.sin(t * 3) * 0.25 : 0.1;
    // la escalera divina: cuando están todos arriba, se rompe (lo decide el anfitrión)
    if (this.step === 8 && !g.net?.guest && !this.scene) {
      const top = EE.canon.y + TOWER.sky.breakAt;
      const list = g.player.alive && !g.player.downed ? [g.player.pos] : [];
      if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed) list.push(r.pos);
      if (list.length && list.every((p) => p.y > top)) this.breakStair();
      else if (list.some((p) => p.y > top) && !this.waitSaid) {
        this.waitSaid = true;
        this.announce('La escalera tiembla... esperá a que suban todos.', 3);
      }
    }
    // el alma pesada desapareció sin morir (se la llevó otro jefe): la Voz manda otra
    if (this.step === 5 && !g.net?.guest && this.heavy && g.zombies.boss !== this.heavy) {
      this.heavy = null;
      g.later(2, () => this.sendHeavy());
    }
    this.updateHud();
    this.updateBeam();
    // Fierro recuerda lo que falta
    if (!g.net?.guest && !this.fight && !this.scene) {
      this.voiceT -= dt;
      if (this.voiceT <= 0) {
        this.voiceT = 110;
        if (this.step >= 1) this.say('fierro', this.remind());
      }
      if (this.startT > 0) {
        this.startT -= dt;
        if (this.startT <= 0) this.say('entidad', VOZ.start);
      }
    }
  }

  // Muertos que salen en la cima mientras dura el encierro.
  encierroSpawns(dt) {
    const g = this.g;
    const E = this.enc;
    E.spawnT -= dt;
    if (E.spawnT > 0) return;
    E.spawnT = 1.7 / Math.sqrt(this.players());
    if (g.zombies.alive >= maxAlive(this.players())) return;
    const [cx, cz] = EE.canon.pos;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = EE.canon.cage + 2 + Math.random() * 2.5;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = EE.canon.y;
      if (g.nav.blocked(Math.floor(x), Math.floor(z), y)) continue;
      const round = Math.max(5, g.rounds.round);
      g.zombies.spawn(round, zombieHealth(round), new THREE.Vector3(x, y, z));
      break;
    }
  }

  // El objetivo en pantalla y el inventario de piezas.
  updateHud() {
    const g = this.g;
    const floorOpen = (n) => g.activeZones.has(`P${n}`);
    // el piso todavía está tapado por los escombros de la escalera
    const go = (n) => (floorOpen(n) ? '' : ' <i class="is-locked">(abrí paso)</i>');
    let o = null;
    const p = this.parts;
    if (this.scene) o = null;
    else if (this.fight) o = g.arena?.objective?.() || null;
    else if (this.step === 0) o = { main: 'Hablá con Martín Fierro', sub: 'Piso 1, junto al fogón' };
    else if (this.step === 1) {
      o = {
        main: 'Juntá las piezas del cañón',
        list: [
          p.cano === 'none' ? ['Caño', `piso 3${go(3)}`] : ['Caño', '', true],
          p.rueda === 'hanging' ? ['Rueda', `piso 8, rompé los 3 candados${go(8)}`] : p.rueda === 'falling' || p.rueda === 'ground' ? ['Rueda', 'cayó al piso 5'] : ['Rueda', '', true],
          p.mecha === 'sealed' ? ['Mecha', `piso 10, caé encima con PhD${go(11)}`] : p.mecha === 'ground' ? ['Mecha', 'quedó en el piso 10'] : ['Mecha', '', true],
        ],
      };
    } else if (this.step === 2) o = { main: 'Llevá las piezas al cañón', sub: `Piso 15, la cima${go(15)}` };
    else if (this.step === 3) o = { main: 'Armá el encierro del cañón', sub: 'Piso 15' };
    else if (this.step === 4) o = { main: 'Llená el encierro de almas', sub: 'Matá muertos adentro de las rejas', count: `${this.enc?.souls || 0} / ${this.enc?.need || 0}` };
    else if (this.step === 5) o = { main: 'Bajá al alma pesada', sub: 'El jefe que mandó la Voz, en la cima' };
    else if (this.step === 6) o = { main: 'Prendé la mecha del cañón', sub: 'Piso 15' };
    else if (this.step === 7) o = { main: 'Pagá la escalera divina', sub: 'En la pared dorada de la cima', count: `${this.bank.toLocaleString('es-AR')} / ${this.endingCost().toLocaleString('es-AR')}` };
    else if (this.step === 8) o = { main: 'Subí la escalera divina', sub: 'Todos juntos' };
    this.setObjective(o);
    this.objEl.style.opacity = g.hud.root.style.display === 'none' ? '0' : '1';
    // en línea, abajo del panel de los compañeros; y abajo de la tarjeta de las
    // piezas del escudo mientras está
    const tb = g.hud.team;
    const pl = g.hud.parts;
    let top = tb?.childElementCount ? tb.offsetTop + tb.offsetHeight + 14 : 154;
    if (pl?.classList.contains('is-on')) top = Math.max(top, pl.offsetTop + pl.offsetHeight + 16);
    if (top !== this.objTop) {
      this.objTop = top;
      this.objEl.style.top = `${top}px`;
    }
    const inv = { cano: p.cano === 'held', rueda: p.rueda === 'held', mecha: p.mecha === 'held' };
    const key = Object.values(inv).map((x) => (x ? 1 : 0)).join('') + (this.fight ? 'f' : '');
    if (key !== this.invKey) {
      this.invKey = key;
      g.hud.setInventory(this.fight ? null : inv, false, INV);
    }
  }

  // Una columna de luz sobre lo que sigue (solo en ese piso).
  updateBeam() {
    const g = this.g;
    let at = null;
    const p = this.parts;
    if (this.fight || this.scene) at = null;
    else if (this.step === 0) at = this.fierro.pos;
    else if (this.step === 1) {
      // lo que falta en el piso más cercano al jugador
      const opts = [];
      if (p.cano === 'none') opts.push(this.canoPos);
      if (p.rueda === 'hanging') opts.push(new THREE.Vector3(EE.rueda.pos[0], EE.rueda.y, EE.rueda.pos[1]));
      if (p.rueda === 'ground') opts.push(this.ruedaLand);
      if (p.mecha === 'sealed' || p.mecha === 'ground') opts.push(this.sealPos);
      const py = g.player.pos.y;
      opts.sort((a, b) => Math.abs(a.y - py) - Math.abs(b.y - py));
      at = opts[0] || null;
    } else if (this.step >= 2 && this.step <= 6) at = this.cannon.pos;
    else if (this.step === 7) at = this.endingPos;
    const b = this.beam;
    b.visible = !!at;
    if (!at) return;
    const fy = this.T.yOf(this.T.levelOf(at.y));
    b.position.set(at.x, fy + (TOWER.fh - 0.4) / 2, at.z);
    b.material.opacity = 0.07 + Math.sin(g.time * 1.5) * 0.03;
  }

  dispose() {
    this.song?.dispose();
    this.g.hud.setInventory(null);
    this.objEl?.remove();
    this.scene?.el?.remove();
    this.scene = null;
    this.npc.dispose();
  }
}

// ¿Pasó ya este momento de la escena? (la primera vez devuelve false y lo marca)
function S2(scene, key) {
  if (!scene) return true;
  scene.done ||= {};
  if (scene.done[key]) return true;
  scene.done[key] = true;
  return false;
}

function rayHitSphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t < 0 ? null : t;
}

