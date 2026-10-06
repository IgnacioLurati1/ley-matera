import * as THREE from 'three';
import { zombieHealth } from '../config/rules';
import { mesh, boxGeo, cylGeo, compactGroup } from '../world/props';
import { texMat } from '../world/penalProps';
import { CELL } from '../world/World';
import RamFx from './penalRams';

// El bote del muelle (penal): la única forma de llegar al islote de las
// ánimas, enfrente, donde está la ermita de San La Muerte con el
// Pack-a-Pava. Está a medio armar al costado del muelle chico: le falta el
// timón, que un náufrago colgó de promesa en la capilla (donde antes estaba
// el Pack-a-Pava). Con el timón se arma manteniendo F (uno solo por partida).
// Para zarpar se suben todos los vivos: el primero que sube va al timón y
// maneja con WASD; los demás van sentados y todos pueden tirar. En cada cruce
// salen botes llenos de muertos, siempre del lado del muelle al que van (de
// abajo del agua, de frente): no abordan, embisten. El golpe le saca al casco y
// lastima a los de a bordo; después reculan, dan la vuelta en un arco y vuelven
// a embestir. Si se mueren los de un bote, se hunde (y se saca de la escena);
// si el bote llega al otro muelle, los que quedaban se hunden. Con el casco en
// cero el bote se va a pique: negro, todos de vuelta en el muelle de salida y
// hay que arreglarlo (mantener F). Al amarrar bien se emparcha solo. Mientras cruzan no salen
// muertos en tierra (la ronda espera) y los que andaban sueltos vuelven a la
// cola. Cuando Benito pide el agua, el cruce que sigue es más bravo: en el
// medio del río el agua verde agarra el bote y hay que aguantar quietos
// mientras se llena la damajuana (después se deja en el Pack-a-Pava de la
// ermita: entities/PenalEgg.js).
// En línea el bote lo mueve el anfitrión (el timonel invitado manda lo que
// aprieta) y cada uno se sienta en su compu sobre su copia del bote.

const WATER = -0.55;
const DECK = -0.4;
const EDECK = -0.42;
// los dos amarres: el muelle chico del penal y el muellecito del islote
// (yaw: para dónde queda la proa, hacia el río; pier: dónde queda parado el de
// cada asiento cuando se baja)
export const DOCKS = {
  land: { x: 55.6, z: 86.6, yaw: 0, pier: [[51.6, 85.2], [51.4, 86.4], [51.6, 87.6], [51.4, 88.8], [51.5, 84]] },
  isle: { x: 17.6, z: 115.5, yaw: Math.PI, pier: [[13.6, 114.1], [13.4, 115.3], [13.6, 116.5], [13.4, 117.7], [13.5, 113]] },
};
// el timón, colgado de promesa en la pared de la capilla (mira al norte)
const EXVOTO = { x: 62.5, z: 24.93 };
const SEATS = [[0, -2.05], [-0.5, -0.8], [0.5, -0.8], [-0.5, 0.6], [0.5, 0.6]];
const HULL = [[0, 2.8], [0, -2.6], [-1.1, 1.3], [1.1, 1.3], [-1.1, -1.3], [1.1, -1.3], [-1.1, 0], [1.1, 0]];
const CREW = [[0.12, 1.05], [-0.14, -0.05], [0.1, -1.15]];
// lo que asoma en el río: el faro, el vapor hundido y los botes viejos del muelle
const ROCKS = [[17, 97, 4.6], [72, 91.5, 5.4], [28.2, 85, 1.5], [34.8, 86.5, 1.5], [48.2, 87, 1.5]];
const MAXV = 6.2;
const REV = 2.4;
// lo que tarda en llenarse la damajuana (con el bote agarrado por el río)
const FILL = 8;
// los botes de los muertos: lo que andan, lo que corren para embestir y lo que doblan
const E_CRUISE = 4.4;
const E_RAM = 9;
const E_TURN = 1.3;
// la proa de uno de ellos (desde su centro) y el casco de los jugadores (medio ancho, popa, proa)
const E_BOW = 2.6;
const HB = [1.3, -2.9, 3.3];
// lo que tarda en irse al fondo uno que se quedó sin muertos
const SINK_T = 3.6;
const ESTATE = ['come', 'charge', 'back', 'loop', 'sink'];
// el casco: la vida según cuántos son, lo que le saca cada embestida y lo que
// le pega a cada uno de a bordo (sube con la ronda; nunca mata de una)
const hullMax = (n) => 160 + 60 * Math.max(0, n - 1);
const RAM_HULL = 10;
const ramDamage = (round) => Math.round(Math.min(45, 24 + round * 0.7));
// hundiéndose: cuándo entra el negro y cuándo aparecen todos en el muelle de salida
const SW_BLACK = 1.3;
const SW_DOCK = 2.3;
const STILL = { f: 0, s: 0 };
// (las partículas de cada cuadro, sin armar objetos nuevos)
const P_FOAM = { color: [0.88, 0.92, 0.94], size: 0.07, size1: 0.2, life: 0.6, alpha: 0.7, gravity: 6, drag: 0.5 };
const P_SPRAY = { color: [0.86, 0.9, 0.92], size: 0.06, size1: 0.16, life: 0.5, alpha: 0.6, gravity: 6, drag: 0.6 };
const P_WAKE = { color: [0.62, 0.68, 0.7], size: 0.16, size1: 0.5, life: 1.1, alpha: 0.32, drag: 1.5 };
const P_BUB = { color: [0.8, 0.9, 0.9], size: 0.06, size1: 0.12, life: 0.5, alpha: 0.6, gravity: -0.4 };
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export default class PenalBoat {
  constructor(game, egg) {
    this.g = game;
    this.egg = egg;
    this.M = game.world.M;
    // hull (a medio armar) → moored (amarrado en `at`) ⇄ sail (cruzando a `dest`)
    this.state = 'hull';
    this.at = 'land';
    this.dest = null;
    this.trip = null;
    // llenando la damajuana en el medio del río (segundos, o null)
    this.fillT = null;
    this.visited = false;
    // el timón: chapel (colgado en la capilla), held (lo tiene el equipo), set (puesto)
    this.timon = 'chapel';
    this.seats = [-1, -1, -1, -1, -1];
    this.pos = new THREE.Vector3(DOCKS.land.x, WATER, DOCKS.land.z);
    this.yaw = 0;
    this.speed = 0;
    this.turnV = 0;
    this.helm = { f: 0, s: 0 };
    this.sent = { f: 0, s: 0, t: 0 };
    this.bobY = 0;
    this.dyaw = 0;
    this.departT = 0;
    this.sendT = 0;
    this.enemies = [];
    this.eid = 0;
    this.pose = null;
    this.wasSeat = -1;
    // el casco (vida), roto después de hundirse (hay que arreglarlo) y el hundimiento en curso (s, o null)
    this.hpMax = hullMax(1);
    this.hp = this.hpMax;
    this.wreck = false;
    this.swampT = null;
    // el empujón y el giro de una embestida, y cómo se sacude (escora, cabeceo, salto: resortes)
    this.push = new THREE.Vector3();
    this.spinV = 0;
    this.rock = { r: 0, rv: 0, p: 0, pv: 0, h: 0, hv: 0 };
    this.spot = new THREE.Vector3(DOCKS.land.x - 1.2, 0.6, DOCKS.land.z);
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.build();
    // las embestidas: los botes de los muertos, astillas, el casco roto, la barrita y los ruidos
    this.rams = new RamFx(game, this);
    this.buildExvoto();
    this.register();
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  // ---------------- lo que se ve ----------------
  build() {
    const M = this.M;
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    this.boat = g;
    this.body = body;
    const wood = M.wood;
    const dark = M.woodDark;
    // el fondo, la popa y la proa
    body.add(mesh(boxGeo(1.9, 0.1, 4.9), dark, 0, DECK - 0.05, -0.1));
    body.add(mesh(boxGeo(2.1, 0.62, 0.08), wood, 0, DECK + 0.22, -2.6));
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.08, 1.4, 4, 1), wood);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.52);
    bow.position.set(0, DECK + 0.22, 2.9);
    body.add(bow);
    // las tablas de los costados: las que faltan son las que se ponen al armarlo
    this.planks = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const p = mesh(boxGeo(0.06, 0.2, 4.9), k === 2 ? dark : wood, s * (0.98 + k * 0.04), DECK + 0.02 + k * 0.2, -0.1, 0, 0, s * 0.14);
        body.add(p);
        if (k > 0) this.planks.push(p);
      }
      body.add(mesh(boxGeo(0.1, 0.06, 4.9), dark, s * 1.08, DECK + 0.64, -0.1));
    }
    // bancos, timón y mástil con la vela recogida
    for (const z of [-0.8, 0.6]) body.add(mesh(boxGeo(1.95, 0.06, 0.34), wood, 0, DECK + 0.38, z));
    body.add(mesh(boxGeo(0.7, 0.06, 0.34), wood, 0, DECK + 0.38, -2.05));
    body.add(mesh(boxGeo(0.06, 0.5, 0.9), dark, 0, DECK + 0.05, -3.0));
    body.add(mesh(cylGeo(0.03, 0.03, 1.1, 6), wood, 0, DECK + 0.72, -2.55, 0.9, 0, 0));
    body.add(mesh(cylGeo(0.06, 0.07, 3.4, 8), dark, 0, DECK + 1.7, 1.55));
    body.add(mesh(cylGeo(0.12, 0.12, 1.5, 8), M.rope || wood, 0, DECK + 1.1, 1.55, 0, 0, Math.PI / 2));
    // la rueda del timón (la de la capilla), adelante del timonel
    const post = mesh(cylGeo(0.04, 0.05, 0.8, 6), dark, 0, DECK + 0.4, -1.45);
    body.add(post);
    const wheel = this.wheelModel(0.26);
    wheel.position.set(0, DECK + 0.86, -1.5);
    body.add(wheel);
    this.planks.push(post, wheel);
    // el farol de proa
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(2), toneMapped: false }));
    lamp.position.set(0, DECK + 3.2, 1.55);
    body.add(lamp);
    // y alumbra de verdad: entra en el reparto de luces del mapa (World.cullLights:
    // siempre la misma cantidad prendida, así no se recompila nada)
    const dotT = this.g.world.T?.dot;
    if (dotT) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotT, color: 0xffb060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(lamp.position);
      halo.scale.setScalar(1.3);
      body.add(halo);
    }
    this.lampLight = new THREE.PointLight(0xffb060, 2.6, 11, 1.6);
    this.root.add(this.lampLight);
    this.lampDef = { pos: [this.pos.x, DECK + 2.6, this.pos.z], color: 0xffb060, intensity: 2.6, noPower: 1, kind: 'fire' };
    this.lampEntry = { def: this.lampDef, light: this.lampLight, base: 2.6, phase: Math.random() * 100, bulb: null };
    this.g.world.lights?.push(this.lampEntry);
    // (con las lámparas recortadas por calidad: la misma cuenta al cargar y al jugar)
    this.g.world.recull?.();
    // la damajuana (se llena de agua verde)
    this.jugMat = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75, emissive: 0x000000 });
    const jug = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), this.jugMat);
    jug.position.set(0.45, DECK + 0.25, 1.95);
    body.add(jug);
    const neck = mesh(cylGeo(0.04, 0.05, 0.16, 8), this.jugMat, 0.45, DECK + 0.5, 1.95);
    body.add(neck);
    const straw = mesh(new THREE.TorusGeometry(0.21, 0.03, 5, 14), M.rope || dark, 0.45, DECK + 0.2, 1.95, Math.PI / 2, 0, 0);
    body.add(straw);
    this.jug = jug;
    this.jugParts = [jug, neck, straw];
    this.root.add(g);
    // las tablas que faltan, apiladas en el muelle
    const pile = new THREE.Group();
    for (let i = 0; i < 5; i++) pile.add(mesh(boxGeo(0.25, 0.06, 2.6), i % 2 ? wood : dark, (i % 3) * 0.28 - 0.28, 0.03 + Math.floor(i / 3) * 0.07, 0, 0, (i - 2) * 0.05, 0));
    pile.position.set(51.3, this.g.world.floorAt(51.3, 89.4), 89.4);
    this.root.add(pile);
    this.pile = pile;
    this.showBuilt(false);
    // lo fijo del casco, una malla por material (se mueve y se mece entero con
    // body); quedan sueltas las tablas que faltan, el poste y la rueda (están
    // escondidos ahora), la damajuana (se esconde en el Pack-a-Pava) y el farol
    if (!globalThis.__mduNoMerge) {
      for (const p of this.jugParts) p.userData.dynamic = true;
      compactGroup(body);
      compactGroup(wheel);
      compactGroup(pile);
    }
    g.position.set(this.pos.x, 0, this.pos.z);
    // la luz del cruce: una columna y un anillo en el agua donde se amarra del otro lado
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x7affa0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 70, 16, 1, true), beaconMat);
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 48).rotateX(-Math.PI / 2), beaconMat);
    this.beacon.visible = this.beaconRing.visible = false;
    this.root.add(this.beacon, this.beaconRing);
    // el islote se ve desde el muelle aunque haya niebla (está a unos 48 m):
    // las velas de la puerta de la ermita, la espadaña y el farol del muellecito
    const dot = this.g.world.T?.dot;
    if (dot) {
      for (const [x, y, z, c, s] of [[13, 1.6, 126.8, 0xff5a2a, 5.6], [13, 7.2, 127.3, 0xff7a3a, 3], [14.5, 3.25, 118.05, 0xffb070, 3.8]]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: c, fog: false, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.position.set(x, y, z);
        sp.scale.setScalar(s);
        this.root.add(sp);
      }
    }
  }

  // Una rueda de timón en el plano xy (mira a +z): aro, maza y rayos con manijas.
  wheelModel(r) {
    const M = this.M;
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(r, r * 0.07, 6, 20), M.wood));
    g.add(mesh(cylGeo(r * 0.16, r * 0.16, r * 0.22, 10), M.woodDark, 0, 0, 0, Math.PI / 2, 0, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(mesh(cylGeo(r * 0.035, r * 0.045, r * 1.3, 5), M.woodDark, Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65, 0, 0, 0, a - Math.PI / 2));
    }
    return g;
  }

  // El exvoto de la capilla: la rueda colgada de un clavo, cintas coloradas y
  // la plaquita de la promesa (el clavo, las cintas y la plaquita quedan).
  buildExvoto() {
    const M = this.M;
    const y = this.g.world.floorAt(EXVOTO.x, EXVOTO.z - 0.6);
    const grp = new THREE.Group();
    grp.position.set(EXVOTO.x, y, EXVOTO.z);
    grp.rotation.y = Math.PI;
    grp.add(mesh(cylGeo(0.02, 0.02, 0.14, 5), M.iron, 0, 2.15, 0.07, Math.PI / 2, 0, 0));
    const red = M.redCloth || M.redPaint;
    for (let k = 0; k < 4; k++) grp.add(mesh(boxGeo(0.05, 0.6 + (k % 2) * 0.25, 0.004), red, -0.3 + k * 0.2, 1.85 - (k % 2) * 0.12, 0.03, 0, 0, (k - 1.5) * 0.12));
    const plaque = texMat('promesa-timon', 256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#c9b07a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#5a4020';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#3a2410';
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px serif';
      ctx.fillText('PROMESA CUMPLIDA', w / 2, 46);
      ctx.font = 'italic 17px serif';
      ctx.fillText('Al Gauchito, que me sacó del río', w / 2, 78);
      ctx.fillText('Naufragio del vapor Esperanza', w / 2, 102);
    });
    grp.add(mesh(boxGeo(0.62, 0.31, 0.02), plaque, 0, 0.98, 0.02));
    // (el clavo y las cintas juntos; la rueda va aparte: se descuelga)
    if (!globalThis.__mduNoMerge) compactGroup(grp);
    const wheel = this.wheelModel(0.42);
    wheel.position.set(0, 1.72, 0.1);
    grp.add(wheel);
    if (!globalThis.__mduNoMerge) compactGroup(wheel);
    this.exWheel = wheel;
    this.root.add(grp);
    this.exPos = new THREE.Vector3(EXVOTO.x, y + 1.3, EXVOTO.z - 0.6);
  }

  showBuilt(on) {
    for (const p of this.planks) p.visible = on;
    this.pile.visible = !on;
    this.body.rotation.z = on ? 0 : 0.12;
  }

  // Un bote de los muertos: casco podrido, espolón de hierro, calavera de vaca,
  // algas y un farol verde (entities/penalRams.js: un modelo compartido, clonado).
  enemyModel() {
    return this.rams.enemyMesh();
  }

  // ---------------- interacciones ----------------
  register() {
    const I = this.g.interact;
    // descolgar el timón de la capilla: lo decide el anfitrión
    I.add({
      kind: 'ee',
      pos: this.exPos,
      radius: 2.2,
      prompt: () => (this.timon === 'chapel' ? { text: 'descolgar el timón del bote (la promesa de un náufrago)', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.timon !== 'chapel') return false;
        this.takeTimon();
        return true;
      },
    });
    // armarlo (manteniendo F), en el muelle chico
    I.add({
      kind: 'ee',
      pos: new THREE.Vector3(DOCKS.land.x - 1.2, 0.6, DOCKS.land.z),
      radius: 3,
      hold: true,
      holdTime: 4,
      prompt: () => {
        if (this.state !== 'hull') return null;
        if (this.timon !== 'held') return { text: 'Al bote le falta el timón. Dicen que alguien lo dejó de promesa en la capilla', noCost: true, info: true };
        return { text: 'armar el bote (ponerle el timón)', hold: true, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.state !== 'hull' || this.timon !== 'held') return false;
        this.finishBuild();
        return true;
      },
    });
    // subir o bajar (cada uno el suyo), en el muelle donde está amarrado
    I.add({
      kind: 'ee',
      local: true,
      pos: this.spot,
      radius: 3,
      prompt: () => {
        if (this.state !== 'moored' || this.wreck) return null;
        const i = this.seats.indexOf(this.myId());
        if (i >= 0) return { text: 'bajar del bote', noCost: true };
        if (!this.seats.includes(-1)) return { text: 'El bote está lleno', noCost: true, info: true };
        const to = this.at === 'land' ? 'al islote' : 'al penal';
        return { text: this.seats[0] < 0 ? `subir al bote para cruzar ${to} (vas al timón)` : `subir al bote para cruzar ${to}`, noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.state !== 'moored') return false;
        const on = this.seats.includes(this.myId());
        if (this.g.net?.guest) this.g.net.net.send({ t: 'pee', a: on ? 'unboard' : 'board' });
        else if (on) this.unboard(this.myId());
        else this.board(this.myId());
        return true;
      },
    });
    // arreglarlo (manteniendo F) después de que se fue a pique: lo decide el anfitrión
    I.add({
      kind: 'ee',
      pos: this.spot,
      radius: 3,
      hold: true,
      holdTime: 3,
      prompt: () => (this.state === 'moored' && this.wreck ? { text: 'arreglar el bote', hold: true, noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.state !== 'moored' || !this.wreck) return false;
        this.repair();
        return true;
      },
    });
  }

  // El casco nuevo: tablas, brea y a cruzar de nuevo.
  repair() {
    this.wreck = false;
    this.hpMax = hullMax(this.egg.players());
    this.hp = this.hpMax;
    this.repairFx();
    this.egg.netSync();
  }

  repairFx() {
    const g = this.g;
    g.audio.boardRepair(this.pos);
    g.fx.dust(tmpV.set(this.pos.x, DECK + 0.3, this.pos.z), { x: 0, y: 1, z: 0 }, [0.5, 0.42, 0.3], 14);
  }

  takeTimon() {
    this.timon = 'held';
    this.g.audio.powerupGrab();
    this.egg.toastAll('Conseguiste: el timón del bote');
    this.egg.announce('Con el timón se arma el bote del muelle chico. Del otro lado del río, en el islote, espera una ermita.', 5);
    this.egg.netSync();
  }

  finishBuild() {
    const g = this.g;
    this.state = 'moored';
    this.at = 'land';
    this.timon = 'set';
    this.showBuilt(true);
    g.audio.boardRepair(this.pos);
    g.fx.dust(tmpV.set(this.pos.x, DECK + 0.3, this.pos.z), { x: 0, y: 1, z: 0 }, [0.5, 0.42, 0.3], 14);
    this.egg.announce('El bote está armado. Para cruzar al islote se suben todos, y el primero que sube va al timón.', 4, true);
    this.egg.netSync();
  }

  board(id) {
    if (this.state !== 'moored' || this.seats.includes(id)) return;
    const i = this.seats.indexOf(-1);
    if (i < 0) return;
    this.seats[i] = id;
    this.egg.netSync();
  }

  unboard(id) {
    const i = this.seats.indexOf(id);
    if (i < 0 || this.state !== 'moored') return;
    this.seats[i] = -1;
    this.fixHelm();
    this.egg.netSync();
  }

  // Si el timón quedó vacío, pasa a manejar el primero que esté sentado.
  fixHelm() {
    if (this.seats[0] >= 0) return;
    const j = this.seats.findIndex((s) => s >= 0);
    if (j > 0) {
      this.seats[0] = this.seats[j];
      this.seats[j] = -1;
    }
  }

  onGuest(m, from) {
    if (m.a === 'board') this.board(from);
    else if (m.a === 'unboard') this.unboard(from);
    else if (m.a === 'helm' && this.seats[0] === from) {
      this.helm.f = Math.sign(+m.f || 0);
      this.helm.s = Math.sign(+m.s || 0);
    }
  }

  // ---------------- el agua ----------------
  isWater(x, z) {
    if (z < 83.2 || x < -40 || x > 138 || z > 178) return false;
    for (const [rx, rz, r] of ROCKS) if ((x - rx) ** 2 + (z - rz) ** 2 < r * r) return false;
    const w = this.g.world;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return true;
    const i = w.idx(cx, cz);
    return w.grid[i] === CELL.OUT && w.ty[i] < WATER - 0.3;
  }

  // Cabe el casco en (x, z) mirando a yaw.
  clear(x, z, yaw) {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    for (const [lx, lz] of HULL) if (!this.isWater(x + lx * c + lz * s, z - lx * s + lz * c)) return false;
    return true;
  }

  // Del sistema del bote al mundo (x al costado, z hacia la proa).
  toWorld(px, pz, yaw, lx, lz, out) {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    return out.set(px + lx * c + lz * s, 0, pz - lx * s + lz * c);
  }

  seatWorld(i, out) {
    return this.toWorld(this.pos.x, this.pos.z, this.yaw, SEATS[i][0], SEATS[i][1], out);
  }

  // ---------------- a bordo ----------------
  // Lo llama Player.update: el que va sentado no camina, lo lleva el bote.
  ride(dt, input) {
    const i = this.seats.indexOf(this.myId());
    if (i < 0 || (this.state !== 'moored' && this.state !== 'sail')) {
      this.g.player.ride = null;
      return;
    }
    if (i === 0) this.readHelm(input);
    this.placeLocal(i);
  }

  placeLocal(i) {
    const p = this.g.player;
    this.seatWorld(i, tmpV);
    p.pos.set(tmpV.x, DECK + this.bobY, tmpV.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.airTop = p.pos.y;
    p.crouching = true;
    p.sprinting = false;
    p.lungeT = 0;
  }

  readHelm(input) {
    const g = this.g;
    const f = this.state === 'moored' ? 0 : (input.key('KeyW') ? 1 : 0) - (input.key('KeyS') ? 1 : 0);
    const s = this.state === 'moored' ? 0 : (input.key('KeyD') ? 1 : 0) - (input.key('KeyA') ? 1 : 0);
    if (!g.net?.guest) {
      this.helm.f = f;
      this.helm.s = s;
      return;
    }
    if (f === this.sent.f && s === this.sent.s && g.time - this.sent.t < 0.5) return;
    this.sent = { f, s, t: g.time };
    g.net.net.send({ t: 'pee', a: 'helm', f, s });
  }

  // Cambió el asiento de este jugador (sube, baja o llegaron al otro muelle).
  syncLocalSeat() {
    const g = this.g;
    const p = g.player;
    const i = this.seats.indexOf(this.myId());
    if (i === this.wasSeat) return;
    const was = this.wasSeat;
    this.wasSeat = i;
    if (i >= 0) {
      p.ride = (dt, input) => this.ride(dt, input);
      this.placeLocal(i);
      g.audio.land();
      // el del timón mira para la proa (si no, maneja de espaldas)
      if (i === 0 && was < 0) {
        p.yaw = this.yaw + Math.PI;
        p.pitch = -0.08;
      }
      if (i === 0 && this.state === 'moored') g.hud.subtitle('Al timón: manejás con WASD.', 3);
      return;
    }
    p.ride = null;
    if (was < 0) return;
    // se baja al muelle donde está amarrado
    const pier = DOCKS[this.at].pier;
    const [x, z] = pier[was] || pier[0];
    p.pos.set(x, g.world.floorAt(x, z), z);
    p.vel.set(0, 0, 0);
    p.crouching = false;
  }

  // ---------------- el cruce ----------------
  players() {
    const g = this.g;
    const ids = [];
    if (g.player.alive) ids.push(this.myId());
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) ids.push(r.id);
    return ids;
  }

  depart() {
    const g = this.g;
    this.state = 'sail';
    this.dest = this.at === 'land' ? 'isle' : 'land';
    const D = DOCKS[this.dest];
    const water = this.egg.items.agua === 'asked';
    this.trip = { water, half: false, wave: 0, t: 0, away: 0, total: Math.hypot(D.x - this.pos.x, D.z - this.pos.z) };
    this.speed = 0;
    this.departT = 0;
    // el casco sano (más vida si son más: salen más botes)
    this.hpMax = hullMax(this.egg.players());
    this.hp = this.hpMax;
    this.wreck = false;
    this.swampT = null;
    this.push.set(0, 0, 0);
    this.spinV = 0;
    // los que andaban en tierra vuelven a la cola de la ronda
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      g.zombies.free(z);
      if (g.rounds.state === 'active') g.rounds.requeue(1);
    }
    const text = water
      ? '¡Al río! En el medio se llena la damajuana... si los muertos dejan.'
      : this.dest === 'isle'
        ? '¡Al islote! ¡Botes de frente!'
        : '¡Al penal! ¡Botes de frente!';
    this.egg.announce(text, 5, true);
    if (water) g.audio.bossArrive();
    this.egg.netSync();
  }

  // (anfitrión) Mientras cruzan: las tandas, el agua de Benito y la llegada.
  voyage(dt) {
    const g = this.g;
    const T = this.trip;
    T.t += dt;
    // yéndose a pique: ni tandas ni llegada (update lo lleva al muelle de salida)
    if (this.swampT !== null) return;
    const from = this.dest === 'isle' ? 'land' : 'isle';
    const O = DOCKS[from];
    const D = DOCKS[this.dest];
    T.away = Math.max(T.away, Math.hypot(this.pos.x - O.x, this.pos.z - O.z));
    const left = Math.hypot(this.pos.x - D.x, this.pos.z - D.z);
    const n = this.egg.players();
    const crew = (g.rounds.round || 1) >= 12 ? 3 : 2;
    // apenas salen: una tanda de frente
    if (T.wave === 0 && T.t > 0.6) {
      T.wave = 1;
      this.spawnWave(Math.min(4, 2 + n - 1), crew);
    }
    // a mitad de camino: el río agarra el bote para el agua de Benito o, si no, otra tanda de frente
    if (!T.half && left < T.total * 0.5) {
      T.half = true;
      T.wave = 2;
      if (T.water) {
        this.fillT = 0;
        this.egg.announce('¡El río se puso verde y agarró el bote! Aguanten mientras se llena la damajuana.', 4, true);
        g.audio.bossArrive();
        this.spawnWave(Math.min(5, 3 + n - 1), 3);
      } else this.spawnWave(1 + Math.floor(n / 2), crew);
      this.egg.netSync();
    }
    if (this.fillT !== null) {
      this.fillT += dt;
      if (T.wave === 2 && this.fillT > FILL * 0.5) {
        T.wave = 3;
        this.spawnWave(Math.min(4, 2 + n - 1), crew);
      }
      if (this.fillT >= FILL) this.fillJug();
      return;
    }
    // llegó al muelle de enfrente (o se volvió al de salida)
    if (Math.abs(this.speed) >= 3.2) return;
    if (left < 5.5) this.dock(this.dest);
    else if (T.away > 8 && Math.hypot(this.pos.x - O.x, this.pos.z - O.z) < 5.5) this.dock(from);
  }

  spawnWave(n, crew) {
    const g = this.g;
    let made = 0;
    for (let k = 0; k < n; k++) if (this.spawnEnemy(Math.min(3, crew + (Math.random() < 0.3 ? 1 : 0)), k, n)) made++;
    if (!made) return;
    this.egg.netSync();
    const b = this.enemies[this.enemies.length - 1];
    g.audio.growl(tmpV.set(b.pos.x, 1, b.pos.z), 'scream');
  }

  // Un bote de los muertos, siempre del lado del muelle al que van: por
  // delante, entre el bote y ese muelle, de frente, y sale de abajo del agua
  // (del vapor hundido). Los k de n de una tanda salen repartidos de costado.
  spawnEnemy(crew, k = 0, n = 1) {
    const g = this.g;
    const D = DOCKS[this.dest] || DOCKS.isle;
    const dx = D.x - this.pos.x;
    const dz = D.z - this.pos.z;
    const left = Math.hypot(dx, dz) || 1;
    const ux = dx / left;
    const uz = dz / left;
    for (let t = 0; t < 30; t++) {
      const along = Math.max(6, Math.min(left - 2, 12 + Math.random() * 8 - t * 0.25));
      const side = (k - (n - 1) / 2) * 4.4 + (Math.random() - 0.5) * (2 + t * 0.3);
      const x = this.pos.x + ux * along + uz * side;
      const z = this.pos.z + uz * along - ux * side;
      const yaw = Math.atan2(this.pos.x - x, this.pos.z - z);
      if (!this.clear(x, z, yaw)) continue;
      if (this.enemies.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 4)) continue;
      const b = { id: ++this.eid, pos: new THREE.Vector3(x, WATER, z), yaw, speed: 0, turn: 0, state: 'come', st: 0, t: 0, dir: side < 0 ? -1 : 1, rise: 1, sinkT: 0, crew: [], mesh: this.enemyModel() };
      b.lamp = b.mesh.getObjectByName('lamp');
      b.halo = b.mesh.getObjectByName('halo');
      const round = Math.max(6, g.rounds.round);
      for (let q = 0; q < Math.min(3, crew); q++) {
        const at = this.toWorld(x, z, yaw, CREW[q][0], CREW[q][1], new THREE.Vector3());
        at.y = EDECK;
        if (!g.zombies.spawn(round, zombieHealth(round), at)) break;
        const zz = g.zombies.pool.find((p) => p.active && p.id === g.zombies.idc);
        if (!zz) break;
        zz.state = 'boat';
        zz.stateT = 0;
        zz.P.rootY = 0;
        zz.pos.y = zz.baseY = EDECK;
        zz.yaw = yaw;
        zz.boatOf = b.id;
        b.crew.push({ z: zz, id: zz.id, l: CREW[q], gone: false });
      }
      if (!b.crew.length) {
        b.mesh.removeFromParent();
        return false;
      }
      this.enemies.push(b);
      this.poseEnemy(b, g.time);
      this.rams.riseFx(b.pos);
      return true;
    }
    return false;
  }

  crewAlive(c) {
    const z = c.z;
    return z.active && !z.dead && z.id === c.id && (z.state === 'boat' || z.state === 'boatHit');
  }

  // Se cayó del bote (muerto, congelado o volando): al agua.
  dropCrew(c) {
    const z = c.z;
    c.gone = true;
    if (!z.active || z.id !== c.id) return;
    z.boatOf = 0;
    if (!z.dead && z.state === 'boatHit') z.state = 'boat';
    const fy = this.g.world.floorAt(z.pos.x, z.pos.z);
    z.baseY = fy;
    if (z.dead) z.pos.y = fy;
    this.splash(z.pos);
  }

  // El jugador sentado más cercano (vivo y de pie) al punto.
  nearestSeated(p) {
    const g = this.g;
    let best = null;
    let bestD = Infinity;
    for (const id of this.seats) {
      if (id < 0) continue;
      const pl = id === this.myId() ? g.player : g.net?.remote.get(id);
      if (!pl || pl.dead || pl.downed || (pl === g.player && !g.player.canBeHit())) continue;
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = pl;
      }
    }
    const R = this.nsR || (this.nsR = { pl: null, d: 0 });
    R.pl = best;
    R.d = bestD;
    return R;
  }

  // Cuántos están embistiendo ahora (de a pocos: los demás dan vueltas).
  charging() {
    let n = 0;
    for (const b of this.enemies) if (b.state === 'charge') n++;
    return n;
  }

  setE(b, s) {
    b.state = s;
    b.st = 0;
    if (s !== 'charge') return;
    // arranca: el agua que corta y un muerto que grita
    this.rams.whoosh(b.pos);
    const c = b.crew.find((q) => !q.gone);
    if (c) this.g.audio.growl(tmpW.set(c.z.pos.x, c.z.pos.y + 1.6, c.z.pos.z), 'attack');
  }

  // (anfitrión) Los botes de los muertos: vienen de frente, embisten, reculan,
  // dan la vuelta en un arco y vuelven a embestir. Sin muertos arriba se hunden.
  updateEnemies(dt, t) {
    const n = this.egg.players();
    const maxCharge = n >= 3 ? 3 : 2;
    // con el bote yéndose a pique ya no embisten
    const calm = this.swampT !== null || this.state !== 'sail';
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const b = this.enemies[i];
      b.t += dt;
      b.st += dt;
      if (b.rise > 0) b.rise = Math.max(0, b.rise - dt / 1.4);
      for (const c of b.crew) if (!c.gone && !this.crewAlive(c)) this.dropCrew(c);
      if (b.state !== 'sink' && b.crew.every((c) => c.gone)) this.sinkEnemy(b);
      if (b.state === 'sink') {
        b.sinkT += dt;
        b.speed *= Math.max(0, 1 - dt * 1.5);
        this.moveEnemy(b, dt);
        if (b.sinkT > SINK_T) {
          this.removeEnemy(i);
          continue;
        }
        this.poseEnemy(b, t);
        continue;
      }
      const ox = this.pos.x - b.pos.x;
      const oz = this.pos.z - b.pos.z;
      const d = Math.hypot(ox, oz);
      const toP = Math.atan2(ox, oz);
      let want = toP;
      let v = E_CRUISE;
      let turn = E_TURN;
      let acc = 4;
      if (b.state === 'come') {
        // de frente, derecho al bote; ya cerca: a embestir (si hay lugar) o a dar vueltas
        v = E_CRUISE + 1;
        if (b.rise === 0 && d < 14) {
          if (!calm && this.charging() < maxCharge) this.setE(b, 'charge');
          else this.setE(b, 'loop');
        }
      } else if (b.state === 'charge') {
        // apunta adonde va a estar el bote y acelera a fondo
        const lead = Math.min(1, d / E_RAM);
        want = Math.atan2(this.pos.x + (Math.sin(this.yaw) * this.speed + this.push.x) * lead - b.pos.x, this.pos.z + (Math.cos(this.yaw) * this.speed + this.push.z) * lead - b.pos.z);
        // primero dobla (en un arco, a media máquina) y, ya de frente, a fondo
        const aim = Math.abs(wrap(want - b.yaw));
        v = aim < 0.4 ? E_RAM : aim < 1.1 ? E_CRUISE : 3;
        turn = 1.8;
        acc = 7;
        // se pasó de largo (o se hunde el bote): a dar la vuelta
        if (calm || b.st > 6) this.setE(b, 'loop');
      } else if (b.state === 'back') {
        // recula después del golpe, torciendo un poco
        want = b.yaw + b.dir * 0.8;
        v = -2.6;
        turn = 0.7;
        acc = 6;
        if (b.st > 1.1) this.setE(b, 'loop');
      } else {
        // la vuelta: se abre en un arco, rodea el bote a unos 10 m y lo vuelve a encarar
        want = toP + b.dir * Math.max(0.35, Math.min(2.5, Math.PI / 2 + (10 - d) * 0.14));
        if (!calm && b.st > 2.6 && d > 7 && d < 24 && this.charging() < maxCharge) this.setE(b, 'charge');
      }
      // dobla de a poco (casi parado, casi no dobla) y anda
      b.speed += Math.max(-acc * dt, Math.min(acc * dt, v - b.speed));
      const grip = Math.min(1, 0.3 + Math.abs(b.speed) / 3);
      const step = Math.max(-turn * grip * dt, Math.min(turn * grip * dt, wrap(want - b.yaw)));
      b.yaw = wrap(b.yaw + step);
      b.turn = step / Math.max(dt, 1e-3);
      this.moveEnemy(b, dt);
      // no se meten adentro del bote de los jugadores (salvo el que embiste) ni se enciman
      if (b.state !== 'charge' && d < 3.6 && d > 0.01) this.nudge(b, (-ox / d) * (3.6 - d), (-oz / d) * (3.6 - d));
      for (const o of this.enemies) {
        if (o === b || o.state === 'sink') continue;
        const ex = b.pos.x - o.pos.x;
        const ez = b.pos.z - o.pos.z;
        const ed = Math.hypot(ex, ez);
        if (ed < 3.4 && ed > 0.01) this.nudge(b, (ex / ed) * (3.4 - ed) * 0.5, (ez / ed) * (3.4 - ed) * 0.5);
      }
      // ¿la proa se clavó en el casco?
      if (b.state === 'charge' && b.st > 0.25) {
        const bx = b.pos.x + Math.sin(b.yaw) * E_BOW - this.pos.x;
        const bz = b.pos.z + Math.cos(b.yaw) * E_BOW - this.pos.z;
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        const lx = bx * c - bz * s;
        const lz = bx * s + bz * c;
        if ((Math.abs(lx) < HB[0] && lz > HB[1] && lz < HB[2]) || d < 2.6) this.ram(b, lx, lz);
      }
      this.poseEnemy(b, t);
      this.poseCrew(b, t, dt);
    }
  }

  // Anda para donde mira (con la proa, que no se suba a la costa: si no, dobla).
  moveEnemy(b, dt) {
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    const nx = b.pos.x + s * b.speed * dt;
    const nz = b.pos.z + c * b.speed * dt;
    const f = b.speed >= 0 ? E_BOW - 0.4 : -2;
    if (this.isWater(nx, nz) && this.isWater(nx + s * f, nz + c * f)) {
      b.pos.set(nx, WATER, nz);
      return;
    }
    b.yaw = wrap(b.yaw + b.dir * 2.2 * dt);
    b.speed *= Math.max(0, 1 - dt * 3);
    if (b.state === 'charge' && b.st > 0.8) this.setE(b, 'loop');
  }

  nudge(b, dx, dz) {
    const nx = b.pos.x + dx;
    const nz = b.pos.z + dz;
    if (this.isWater(nx, nz)) b.pos.set(nx, WATER, nz);
  }

  // (anfitrión) La proa de un bote de los muertos se clavó en el casco (lx, lz:
  // dónde, en el sistema del bote de los jugadores).
  ram(b, lx, lz) {
    const g = this.g;
    const ex = Math.sin(b.yaw);
    const ez = Math.cos(b.yaw);
    // qué tan fuerte: uno contra el otro
    const rv = Math.hypot(ex * b.speed - Math.sin(this.yaw) * this.speed - this.push.x, ez * b.speed - Math.cos(this.yaw) * this.speed - this.push.z);
    const k = Math.max(0.6, Math.min(1.3, rv / 9));
    // dónde: sobre el borde del casco
    const ix = Math.max(-1.1, Math.min(1.1, lx));
    const iz = Math.max(-2.6, Math.min(3, lz));
    const P = this.toWorld(this.pos.x, this.pos.z, this.yaw, ix, iz, tmpW);
    const px = P.x;
    const pz = P.z;
    // el casco y cada uno de los de a bordo (por el camino de siempre: modo dios, Juggernog, escudo)
    this.hp = Math.max(0, this.hp - RAM_HULL * k);
    const dmg = Math.round(ramDamage(g.rounds.round || 1) * (0.85 + 0.15 * k));
    for (const id of this.seats) {
      if (id < 0) continue;
      const pl = id === this.myId() ? g.player : g.net?.remote.get(id);
      if (!pl || pl.dead || pl.downed) continue;
      g.damagePlayer(pl, dmg, b.pos);
    }
    // el empujón para donde venía el otro, y el giro según dónde pegó
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const fl = ex * c - ez * s;
    this.push.x += ex * 2.8 * k;
    this.push.z += ez * 2.8 * k;
    this.spinV += iz * fl * 0.32 * k;
    this.speed *= 0.6;
    // el de los muertos rebota y recula
    b.speed = -2.4 * k;
    b.dir = Math.random() < 0.5 ? -1 : 1;
    this.setE(b, 'back');
    this.rams.ramN = (this.rams.ramN || 0) + 1;
    this.ramKick(fl, iz, k);
    this.rams.ramFx(px, pz, ex, ez, k, this.seats.includes(this.myId()));
    g.net?.event('pee', { bp: this.poseArr(), hp: Math.round(this.hp), hm: this.hpMax, ram: [+px.toFixed(2), +pz.toFixed(2), +ex.toFixed(3), +ez.toFixed(3), +k.toFixed(2), +fl.toFixed(2), +iz.toFixed(2)] });
    if (this.hp <= 0) this.startSwamp();
  }

  // El sacudón (en todas las compus): escora para el lado del golpe, cabecea y salta.
  ramKick(fl, iz, k) {
    const R = this.rock;
    R.rv += -(Math.sign(fl) || 1) * (0.55 + 0.4 * Math.abs(fl)) * k;
    R.pv += (iz > 0 ? -1 : 1) * 0.35 * k;
    R.hv += 0.6 * k;
  }

  // (anfitrión) El casco no da más: se llena de agua y se va a pique.
  startSwamp() {
    if (this.swampT !== null) return;
    this.swampT = 0;
    this.fillT = null;
    for (const b of this.enemies) if (b.state === 'charge') this.setE(b, 'loop');
    this.egg.announce('¡Se hunde el bote!', 2.5, true);
    this.g.net?.event('pee', { bp: this.poseArr(), hp: 0, hm: this.hpMax, sw: 1 });
    this.swampFx();
    this.egg.netSync();
  }

  swampFx() {
    const g = this.g;
    const P = this.pos;
    this.rams.crunch(P, 1.3, this.seats.includes(this.myId()));
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 1.6;
      if (g.water?.splash) g.water.splash(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, 1.2, { sound: i === 0 });
      else this.splash(tmpV.set(P.x + Math.cos(a) * r, WATER, P.z + Math.sin(a) * r));
    }
    this.rams.bubbles(P, 16);
    tmpV.set(P.x, DECK + 0.3, P.z);
    this.rams.splinters(tmpV, Math.sin(this.yaw), Math.cos(this.yaw), 10, 1.6, 2);
    g.fx.addShake(0.6);
  }

  // Se quedó sin muertos arriba: se va al fondo.
  sinkEnemy(b) {
    b.state = 'sink';
    b.st = 0;
    b.sinkT = 0;
    this.rams.sinkFx(b);
  }

  // Ya hundido: afuera de la escena (el modelo es compartido: no queda nada colgado).
  removeEnemy(i) {
    const b = this.enemies[i];
    b.mesh.removeFromParent();
    this.enemies.splice(i, 1);
  }

  // La tripulación, parada en su bote: embistiendo mira para adelante; si no, al de a bordo más cercano.
  poseCrew(b, t, dt) {
    const Z = this.g.zombies;
    for (const c of b.crew) {
      if (c.gone) continue;
      const z = c.z;
      const w = this.toWorld(b.pos.x, b.pos.z, b.yaw, c.l[0], c.l[1], tmpV);
      z.pos.set(w.x, EDECK + b.mesh.position.y - WATER, w.z);
      z.baseY = z.pos.y;
      let want = b.yaw;
      if (b.state !== 'charge') {
        const { pl } = this.nearestSeated(z.pos);
        if (pl) want = Math.atan2(pl.pos.x - z.pos.x, pl.pos.z - z.pos.z);
      }
      z.yaw += Math.max(-5 * dt, Math.min(5 * dt, wrap(want - z.yaw)));
      if (z.state !== 'boat') z.state = 'boat';
      z.attackT = 0;
      Z.poseIdle(z, t);
    }
  }

  // (todas las compus) Cómo se ve: hamaca en el agua, sale de abajo, levanta la
  // proa al embestir (con espuma) y al hundirse se va de popa y escora.
  poseEnemy(b, t) {
    const m = b.mesh;
    const g = this.g;
    const sk = b.state === 'sink' ? Math.min(1, b.sinkT / SINK_T) : 0;
    const rise = b.rise || 0;
    const ch = b.state === 'charge' ? Math.min(1, Math.max(0, b.speed) / E_RAM) : 0;
    m.position.set(b.pos.x, WATER + Math.sin(t * 1.7 + b.id) * 0.05 - rise * rise * 1.8 - sk * sk * 2.4 + ch * 0.06, b.pos.z);
    m.rotation.set(Math.sin(t * 1.3 + b.id) * 0.03 - ch * 0.1 - sk * 0.55 - rise * 0.3, b.yaw, Math.sin(t * 1.1 + b.id * 2) * 0.05 + sk * 0.3 * (b.dir || 1) - (b.turn || 0) * 0.08);
    if (b.lamp) {
      b.lamp.visible = sk < 0.3 || (sk < 0.7 && Math.random() < 0.35);
      if (b.halo) b.halo.visible = b.lamp.visible;
    }
    if ((sk > 0 || rise > 0.05) && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.8;
      g.fx.alpha.spawn(b.pos.x + Math.cos(a) * r * 0.6, WATER + 0.02, b.pos.z + Math.sin(a) * r, 0, 0.5 + Math.random() * 0.5, 0, P_BUB);
    }
    if (sk > 0) return;
    if (Math.abs(b.speed) > 1.5 && Math.random() < 0.5) this.wake(b.pos, b.yaw, 2);
    // las ondas en el agua (fx/Water)
    g.water?.wake(b.pos.x, b.pos.z, Math.sin(b.yaw), Math.cos(b.yaw), b.speed, 2);
    // la espuma que levanta la proa embistiendo
    if (ch > 0.35) {
      const s = Math.sin(b.yaw);
      const c = Math.cos(b.yaw);
      const bx = b.pos.x + s * 2.8;
      const bz = b.pos.z + c * 2.8;
      for (let side = -1; side <= 1; side += 2) {
        const w = side * (1.2 + Math.random() * 1.2);
        g.fx.alpha.spawn(bx, WATER + 0.08, bz, c * w + s * b.speed * 0.35, 1 + Math.random() * 1.6 * ch, -s * w + c * b.speed * 0.35, P_FOAM);
      }
    }
  }

  // Timón: el bote avanza, dobla y no se sube a la costa.
  drive(dt) {
    // mientras se llena la damajuana el río tiene agarrado el bote (y yéndose a pique no hay timón)
    const sw = this.swampT !== null;
    const h = this.fillT !== null || sw ? STILL : this.helm;
    const target = h.f > 0 ? MAXV : h.f < 0 ? -REV : 0;
    const acc = (h.f ? 2.8 : sw || this.fillT !== null ? 5 : 1.4) * dt;
    this.speed += Math.max(-acc, Math.min(acc, target - this.speed));
    const grip = Math.min(1, 0.3 + Math.abs(this.speed) / 3);
    const tv = -h.s * 0.9 * grip * (this.speed < -0.2 ? -1 : 1);
    this.turnV += (tv - this.turnV) * Math.min(1, dt * 4);
    // el empujón de una embestida (se apaga solo) y el giro que deja
    const kp = Math.exp(-2.2 * dt);
    this.push.x *= kp;
    this.push.z *= kp;
    this.spinV *= Math.exp(-3 * dt);
    const yaw = this.yaw + (this.turnV + this.spinV) * dt;
    const nx = this.pos.x + (Math.sin(yaw) * this.speed + this.push.x) * dt;
    const nz = this.pos.z + (Math.cos(yaw) * this.speed + this.push.z) * dt;
    if (this.clear(nx, nz, yaw)) {
      this.dyaw += yaw - this.yaw;
      this.yaw = yaw;
      this.pos.set(nx, WATER, nz);
    } else if (this.clear(this.pos.x, this.pos.z, yaw)) {
      this.dyaw += yaw - this.yaw;
      this.yaw = yaw;
      this.push.set(0, 0, 0);
      this.bump();
    } else {
      this.push.set(0, 0, 0);
      this.spinV = 0;
      this.bump();
    }
  }

  poseArr() {
    return [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(3), +this.speed.toFixed(2), +this.turnV.toFixed(3)];
  }

  bump() {
    if (Math.abs(this.speed) > 1.2) {
      this.g.fx.addShake(0.12);
      this.g.audio.shuffle?.(this.pos);
    }
    this.speed *= -0.25;
  }

  update(dt) {
    const g = this.g;
    const t = g.time;
    const host = !g.net?.guest;
    this.dyaw = 0;
    // sacar de los asientos a los que se fueron de la partida
    if (host && g.net) {
      let changed = false;
      for (let i = 0; i < this.seats.length; i++) {
        const id = this.seats[i];
        if (id >= 0 && id !== this.myId() && !g.net.remote.has(id)) {
          this.seats[i] = -1;
          changed = true;
        }
      }
      if (changed) {
        this.fixHelm();
        this.egg.netSync();
      }
    }
    if (host && this.state === 'moored') {
      const ids = this.players();
      const all = ids.length && ids.every((id) => this.seats.includes(id));
      if (all) {
        if (this.departT === 0) this.egg.announce('Están todos a bordo. Zarpan en 3 segundos...', 3);
        this.departT += dt;
        if (this.departT > 3) this.depart();
      } else this.departT = 0;
    }
    if (this.state === 'sail') {
      if (host) {
        this.drive(dt);
        this.updateEnemies(dt, t);
        // la ronda espera: no salen muertos en tierra
        g.rounds.spawnT = Math.max(g.rounds.spawnT || 0, 0.5);
        this.voyage(dt);
        this.sendT -= dt;
        if (g.net && this.state === 'sail' && this.sendT <= 0) {
          this.sendT = 0.1;
          // (cada bote: id, x, z, yaw, estado, velocidad, cuánto le falta salir del agua y su tripulación)
          g.net.event('pee', { bp: this.poseArr(), hp: Math.round(this.hp), hm: this.hpMax, eb: this.enemies.map((b) => [b.id, +b.pos.x.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(3), ESTATE.indexOf(b.state), +b.speed.toFixed(1), +b.rise.toFixed(2), ...b.crew.map((c) => c.id)]) });
        }
        // la tripulación se dibuja donde quedó este cuadro (si no, va un paso atrás del bote)
        if (this.enemies.length) g.zombies.render();
      } else {
        this.follow(dt, t);
        if (this.fillT !== null) this.fillT = Math.min(FILL, this.fillT + dt);
      }
      if (Math.abs(this.speed) > 1.2 && Math.random() < 0.6) this.wake(this.pos, this.yaw, 2.9);
      g.water?.wake(this.pos.x, this.pos.z, Math.sin(this.yaw), Math.cos(this.yaw), this.speed, 2.9);
      // la espuma de la proa con el bote lanzado
      if (this.speed > 3.5 && Math.random() < 0.7) {
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        const w = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random());
        g.fx.alpha.spawn(this.pos.x + s * 3.3, WATER + 0.08, this.pos.z + c * 3.3, c * w + s * this.speed * 0.3, 0.6 + Math.random() * 0.8, -s * w + c * this.speed * 0.3, P_SPRAY);
      }
      // yéndose a pique: el negro y (el anfitrión) todos de vuelta en el muelle de salida
      if (this.swampT !== null) this.swamping(dt, host);
      // el remolino verde que agarra el bote
      if (this.fillT !== null && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 3.5;
        g.fx.add?.spawn(this.pos.x + Math.cos(a) * r, WATER + 0.05, this.pos.z + Math.sin(a) * r, -Math.sin(a) * 1.5, 0.4 + Math.random() * 0.6, Math.cos(a) * 1.5, { color: [0.35, 1, 0.45], size: 0.14, size1: 0.02, life: 1.2, alpha: 0.7, gravity: 0.5 });
      }
    }
    // amarrados: se terminan de hundir los botes de los muertos que quedaban
    if (this.state !== 'sail' && this.enemies.length) this.sweep(dt, t);
    // amarrado: el bote se acomoda de a poco con la proa hacia el río
    if (this.state === 'moored') {
      let da = DOCKS[this.at].yaw - this.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const step = Math.max(-dt * 1.2, Math.min(dt * 1.2, da));
      this.yaw += step;
      this.dyaw += step;
    }
    // el sacudón de las embestidas: resortes que se apagan solos
    const R = this.rock;
    const kd = Math.min(dt, 1 / 20);
    R.rv += (-R.r * 38 - R.rv * 4.5) * kd;
    R.r += R.rv * kd;
    R.pv += (-R.p * 30 - R.pv * 5) * kd;
    R.p += R.pv * kd;
    R.hv += (-R.h * 40 - R.hv * 6) * kd;
    R.h += R.hv * kd;
    // el casco: roto se ve (grietas, astillas, agua adentro, humo) y va más hundido
    const frac = this.wreck ? 0 : Math.max(0, Math.min(1, this.hp / this.hpMax));
    const sink = this.swampT !== null ? Math.min(1, this.swampT / SW_DOCK) : this.wreck ? 0.55 : 0;
    this.rams.setHull(frac, sink);
    this.rams.update(dt, t, this.state === 'sail' || this.wreck);
    // cómo se mueve el agua
    this.bobY = Math.sin(t * 1.3) * 0.04 + R.h - (1 - frac) * 0.1 - sink * 0.42;
    this.boat.position.set(this.pos.x, this.bobY, this.pos.z);
    // la luz del farol va con el bote
    const lx = this.pos.x + Math.sin(this.yaw) * 1.55;
    const lz = this.pos.z + Math.cos(this.yaw) * 1.55;
    this.lampLight.position.set(lx, DECK + 2.6 + this.bobY, lz);
    this.lampDef.pos[0] = lx;
    this.lampDef.pos[2] = lz;
    this.boat.rotation.y = this.yaw;
    if (this.state !== 'hull') this.body.rotation.z = Math.sin(t * 1.1) * 0.025 - this.turnV * 0.08 + R.r + sink * 0.16;
    this.body.rotation.x = Math.sin(t * 0.9) * 0.015 - this.speed * 0.006 + R.p - sink * 0.05;
    // cruzando: el muelle de enfrente se marca con una columna de luz que se ve de todo el río
    const sail = this.state === 'sail' && !!this.dest;
    this.beacon.visible = this.beaconRing.visible = sail;
    if (sail) {
      const D = DOCKS[this.dest];
      this.beacon.position.set(D.x, WATER + 35, D.z);
      this.beaconRing.position.set(D.x, WATER + 0.05, D.z);
      this.beacon.material.opacity = 0.2 + Math.sin(t * 3) * 0.06;
      this.beaconRing.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
    }
    // la damajuana: verde con el agua del río, más fuerte ya embrujada; no está mientras la tiene el Pack-a-Pava
    const agua = this.egg.items.agua;
    const inPap = agua === 'pap' || agua === 'ready';
    for (const p of this.jugParts) p.visible = !inPap;
    const full = agua === 'boat' || agua === 'held' || this.fillT !== null;
    this.jugMat.emissive.setHex(agua === 'held' ? 0x9a5aff : full ? 0x3aff4a : 0x000000);
    this.jugMat.emissiveIntensity = this.fillT !== null ? (this.fillT / FILL) * 0.9 : full ? (agua === 'held' ? 1.2 : 0.8) + Math.sin(t * 4) * 0.3 : 0;
    if (full && Math.random() < 0.15) g.fx.sparkle(this.jug.getWorldPosition(tmpV), agua === 'held' ? [0.7, 0.45, 1] : [0.4, 1, 0.4], 1, 0.2);
    // el timón de la capilla
    this.exWheel.visible = this.timon === 'chapel';
    // el que va sentado: se lo acomoda al asiento después de mover el bote
    this.syncLocalSeat();
    const i = this.seats.indexOf(this.myId());
    if (i >= 0 && g.player.ride && g.player.alive) {
      g.player.yaw += this.dyaw;
      this.placeLocal(i);
      g.player.updateCamera(g.camera);
      // la cámara se ladea con la escora del golpe
      if (Math.abs(R.r) > 1e-3) g.camera.rotateZ(R.r * 0.8);
    }
  }

  // Yéndose a pique (en todas las compus): agua por todos lados, el negro a los
  // de a bordo y, el anfitrión, todos al muelle de salida con el bote roto.
  swamping(dt, host) {
    const g = this.g;
    const was = this.swampT;
    this.swampT += dt;
    const T = this.swampT;
    if (Math.random() < dt * 10) {
      const a = Math.random() * Math.PI * 2;
      g.water?.splash?.(this.pos.x + Math.cos(a) * 1.3, this.pos.z + Math.sin(a) * 2, 0.7, { sound: false });
      this.rams.bubbles(this.pos, 2);
    }
    if (was < SW_BLACK && T >= SW_BLACK && this.seats.includes(this.myId())) this.rams.black(true, 0.8);
    if (host && was < SW_DOCK && T >= SW_DOCK) this.dock(this.dest === 'isle' ? 'land' : 'isle', true);
    // (el invitado, por si no llega el aviso del anfitrión)
    else if (!host && T > SW_DOCK + 2.5) {
      this.swampT = null;
      this.rams.black(false, 0.8);
    }
  }

  // Invitado: el bote y los de los muertos siguen lo que manda el anfitrión.
  follow(dt, t) {
    const P = this.pose;
    if (P) {
      const age = Math.min(0.4, (performance.now() - P.at) / 1000);
      const yaw = P.yaw + P.turn * age;
      const x = P.x + Math.sin(yaw) * P.speed * age;
      const z = P.z + Math.cos(yaw) * P.speed * age;
      const k = Math.min(1, dt * 8);
      let da = yaw - this.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.dyaw += da * k;
      this.yaw += da * k;
      this.pos.x += (x - this.pos.x) * k;
      this.pos.z += (z - this.pos.z) * k;
      this.speed = P.speed;
      this.turnV = P.turn;
    }
    // los botes de los muertos: lo que manda el anfitrión, adelantado con su velocidad
    const now = performance.now();
    const k = Math.min(1, dt * 10);
    let pinned = false;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const b = this.enemies[i];
      // (el que el anfitrión ya no manda y se hundió acá)
      if (b.orphan && b.sinkT > SINK_T) {
        this.removeEnemy(i);
        continue;
      }
      const age = Math.min(0.3, (now - (b.at || now)) / 1000);
      const tx = b.tx + Math.sin(b.ty) * b.speed * age;
      const tz = b.tz + Math.cos(b.ty) * b.speed * age;
      b.yaw = wrap(b.yaw + wrap(b.ty - b.yaw) * k);
      b.pos.x += (tx - b.pos.x) * k;
      b.pos.z += (tz - b.pos.z) * k;
      b.rise += (b.trise - b.rise) * Math.min(1, dt * 6);
      if (b.state === 'sink') b.sinkT += dt;
      this.poseEnemy(b, t);
      // la tripulación, parada en su bote (los muertos llegan con atraso: así no se despegan)
      if (b.state !== 'sink' && b.zids && this.pinCrew(b)) pinned = true;
    }
    if (pinned) this.g.zombies.render();
  }

  // (invitado) Los muertos de un bote, en sus lugares sobre el casco.
  pinCrew(b) {
    const Z = this.g.zombies;
    let any = false;
    for (let q = 0; q < b.zids.length; q++) {
      const z = Z.remoteMap?.get(b.zids[q] & 0xffff);
      if (!z?.active || z.dead || (z.state !== 'boat' && z.state !== 'boatHit')) continue;
      const l = CREW[q] || CREW[0];
      const w = this.toWorld(b.pos.x, b.pos.z, b.yaw, l[0], l[1], tmpV);
      z.pos.set(w.x, EDECK + b.mesh.position.y - WATER, w.z);
      z.baseY = z.pos.y;
      any = true;
    }
    return any;
  }

  // Lo que manda el anfitrión diez veces por segundo mientras cruzan (y al
  // momento: una embestida, ram; se va a pique, sw).
  applyPose(m) {
    const [x, z, yaw, speed, turn] = m.bp;
    this.pose = { x, z, yaw, speed, turn, at: performance.now() };
    if (Math.hypot(x - this.pos.x, z - this.pos.z) > 8) {
      this.pos.set(x, WATER, z);
      this.yaw = yaw;
    }
    if (m.hm) this.hpMax = m.hm;
    if (m.hp != null) this.hp = m.hp;
    // una embestida: el golpe, las astillas, el agua y el sacudón
    if (m.ram) {
      const [rx, rz, dx, dz, k, fl, iz] = m.ram;
      this.ramKick(fl, iz, k);
      this.rams.ramFx(rx, rz, dx, dz, k, this.seats.includes(this.myId()));
    }
    if (m.sw && this.swampT === null) {
      this.swampT = 0;
      this.fillT = null;
      this.swampFx();
    }
    if (!m.eb) return;
    const now = performance.now();
    for (const e of m.eb) {
      const [id, ex, ez, eyaw, st, sp, rise, ...zids] = e;
      const s = ESTATE[st] || 'come';
      let b = this.enemies.find((q) => q.id === id);
      if (!b) {
        b = { id, pos: new THREE.Vector3(ex, WATER, ez), yaw: eyaw, speed: sp, turn: 0, state: s === 'sink' ? 'loop' : s, st: 0, dir: 1, rise, trise: rise, sinkT: 0, tx: ex, tz: ez, ty: eyaw, mesh: this.enemyModel() };
        b.lamp = b.mesh.getObjectByName('lamp');
        b.halo = b.mesh.getObjectByName('halo');
        this.enemies.push(b);
        if (rise > 0.4) this.rams.riseFx(b.pos);
      }
      b.seen = now;
      b.turn = Math.max(-1.6, Math.min(1.6, wrap(eyaw - b.ty) / 0.1));
      b.tx = ex;
      b.tz = ez;
      b.ty = eyaw;
      b.speed = sp;
      b.trise = rise;
      b.at = now;
      b.zids = zids;
      if (s === 'sink') {
        if (b.state !== 'sink') this.sinkEnemy(b);
      } else if (s !== b.state) {
        b.state = s;
        if (s === 'charge') this.rams.whoosh(b.pos);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const b = this.enemies[i];
      if (b.seen === now) continue;
      // el anfitrión ya no lo manda: si ya se estaba hundiendo, afuera; si no, que se hunda acá
      if (b.state === 'sink' && !b.orphan) this.removeEnemy(i);
      else if (b.state !== 'sink') {
        this.sinkEnemy(b);
        b.orphan = true;
      }
    }
  }

  // El agua de Benito: en el medio del río se pone verde y la damajuana se llena.
  fillJug() {
    const g = this.g;
    this.fillT = null;
    this.egg.items.agua = 'boat';
    this.magic();
    g.net?.event('pee', { magic: 1 });
    this.egg.toastAll('Conseguiste: la damajuana con agua del río');
    this.egg.announce('¡La damajuana está llena y el río soltó el bote! Hay que dejarla en el Pack-a-Pava de la ermita.', 5, true);
    this.egg.netSync();
  }

  magic() {
    const g = this.g;
    const P = this.pos;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 5;
      g.fx.add.spawn(P.x + Math.cos(a) * r, WATER + 0.05, P.z + Math.sin(a) * r, 0, 1.5 + Math.random() * 3, 0, { color: [0.35, 1, 0.4], size: 0.16, size1: 0, life: 1.4, gravity: 2 });
    }
    g.fx.flash(tmpV.set(P.x, 1.5, P.z), 0x4aff5a, 90, 1, 18);
    g.post?.flash(0.4);
    g.audio.powerupSpawn?.(tmpV.set(P.x, 0.5, P.z));
  }

  // Amarra en un muelle: se bajan todos y los botes de los muertos que quedaban
  // se hunden. wrecked: se fue a pique y aparecen todos en el muelle de salida,
  // con el bote roto (hay que arreglarlo); si no, los del muelle lo emparchan.
  dock(k, wrecked = false) {
    const g = this.g;
    const D = DOCKS[k];
    const first = k === 'isle' && !this.visited && !wrecked;
    this.state = 'moored';
    this.at = k;
    this.dest = null;
    this.trip = null;
    this.fillT = null;
    this.pos.set(D.x, WATER, D.z);
    this.speed = 0;
    this.turnV = 0;
    this.helm = { f: 0, s: 0 };
    this.seats = [-1, -1, -1, -1, -1];
    this.spot.set(D.x - 1.2, 0.6, D.z);
    this.swampT = null;
    this.push.set(0, 0, 0);
    this.spinV = 0;
    this.wreck = wrecked;
    this.hp = wrecked ? 0 : this.hpMax;
    if (wrecked) this.yaw = D.yaw;
    for (const b of this.enemies) {
      for (const c of b.crew) {
        if (!c.gone && this.crewAlive(c)) g.zombies.free(c.z);
        c.gone = true;
      }
      if (b.state !== 'sink') this.sinkEnemy(b);
    }
    // en el islote salen los muertos de la orilla (la zona se abre la primera vez)
    // y, al rato de bajar, se abre sola la puerta de la ermita
    if (k === 'isle' && !wrecked) {
      this.visited = true;
      g.activateZone('L');
      const it = g.interact.list.find((x) => x.kind === 'door' && x.door.def.zones.includes('M'));
      if (it && !it.door.open) g.later(2.5, () => it.door.open || g.interact.openDoor(it.door));
    }
    if (wrecked) {
      this.rams.black(false, 1.1);
      this.egg.announce('¡Se hundió! Arreglen el bote en el muelle.', 3.5, true);
    } else this.egg.announce(k === 'land' ? 'De vuelta en el penal.' : first ? 'El islote de las ánimas. El Pack-a-Pava está en la ermita de San La Muerte.' : 'En el islote. El bote los espera en el muellecito.', 4, true);
    this.egg.netSync();
    g.net?.event('pee', { bp: [D.x, D.z, this.yaw, 0, 0], hp: Math.round(this.hp), hm: this.hpMax, eb: [] });
  }

  // Los que se hunden con el bote ya amarrado (los que quedaban al llegar).
  sweep(dt, t) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const b = this.enemies[i];
      if (b.state !== 'sink') this.sinkEnemy(b);
      b.sinkT += dt;
      b.speed *= Math.max(0, 1 - dt * 1.5);
      if (b.sinkT > SINK_T) this.removeEnemy(i);
      else this.poseEnemy(b, t);
    }
  }

  // Estela: espuma atrás del casco.
  wake(p, yaw, back) {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const x = p.x - s * back + (Math.random() - 0.5) * 1.2 * c;
    const z = p.z - c * back - (Math.random() - 0.5) * 1.2 * s;
    // (espuma: mezcla normal; sumada brillaba como luz de noche)
    this.g.fx.alpha?.spawn(x, WATER + 0.04, z, (Math.random() - 0.5) * 0.6, 0.25, (Math.random() - 0.5) * 0.6, P_WAKE);
  }

  splash(p) {
    const g = this.g;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fx.add?.spawn(p.x, WATER + 0.05, p.z, Math.cos(a) * 1.4, 2 + Math.random() * 2, Math.sin(a) * 1.4, { color: [0.7, 0.8, 0.85], size: 0.12, size1: 0.05, life: 0.8, alpha: 0.5, gravity: 9 });
    }
    this.rams.splashSnd(p);
  }

  // ---------------- red ----------------
  netState() {
    return { st: this.state, at: this.at, dest: this.dest, tm: this.timon, vis: this.visited ? 1 : 0, fl: this.fillT === null ? -1 : +this.fillT.toFixed(1), seats: this.seats, p: [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(3)], w: this.trip?.wave || 0, hp: Math.round(this.hp), hm: this.hpMax, wr: this.wreck ? 1 : 0 };
  }

  applyState(s) {
    const was = this.state;
    this.state = s.st;
    if (s.at) this.at = s.at;
    this.dest = s.dest || null;
    if (s.tm) this.timon = s.tm;
    this.visited = !!s.vis;
    this.fillT = s.fl >= 0 ? s.fl : null;
    if (Array.isArray(s.seats)) this.seats = [...s.seats];
    if (s.st !== 'sail' && s.p) {
      this.pos.set(s.p[0], WATER, s.p[1]);
      this.yaw = s.p[2];
      this.speed = 0;
      this.turnV = 0;
    }
    const D = DOCKS[this.at];
    this.spot.set(D.x - 1.2, 0.6, D.z);
    if (was === 'hull' && s.st !== 'hull') this.showBuilt(true);
    // el casco (y si quedó roto después de irse a pique)
    if (s.hm) this.hpMax = s.hm;
    if (s.hp != null) this.hp = s.hp;
    const wr = !!s.wr;
    if (this.wreck && !wr) this.repairFx();
    this.wreck = wr;
    if (s.st !== 'sail' && this.swampT !== null) {
      this.swampT = null;
      this.rams.black(false, 1.1);
    }
    // amarrados: los botes de los muertos que quedaban se hunden (update: sweep)
    if (s.st !== 'sail') for (const b of this.enemies) if (b.state !== 'sink') this.sinkEnemy(b);
  }

  applyRemote(m) {
    if (m.magic) this.magic();
  }

  // Lo que muestra el HUD con el bote: cuántos van a bordo o cuánto falta para cruzar.
  hudText() {
    // (con la barrita del casco cruzando, o roto en el muelle)
    const bar = this.state === 'sail' ? this.rams.barHtml(Math.max(0, Math.min(1, this.hp / this.hpMax))) : '';
    if (this.state === 'sail' && this.fillT !== null) return `<span>Llenando la damajuana</span><b>${Math.max(0, Math.ceil(FILL - this.fillT))} s</b>${bar}`;
    if (this.state === 'sail' && this.dest) {
      const D = DOCKS[this.dest];
      const left = this.enemies.filter((b) => b.state !== 'sink').length;
      const dist = Math.round(Math.hypot(this.pos.x - D.x, this.pos.z - D.z));
      return `<span>${this.dest === 'isle' ? 'Al islote' : 'Al penal'} (la luz verde)${left ? ` · ${left} ${left === 1 ? 'bote' : 'botes'}` : ''}</span><b>${dist} m</b>${bar}`;
    }
    if (this.state === 'moored') {
      const p = this.g.player.pos;
      if (this.wreck) return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 20 ? `<span>Bote roto</span>${this.rams.barHtml(0)}` : null;
      const on = this.seats.filter((s) => s >= 0).length;
      if (on) return `<span>A bordo</span><b>${on} / ${Math.max(on, this.players().length)}</b>`;
    }
    return null;
  }

  // Atajos de prueba (solo): el bote armado y amarrado en el muelle `where`.
  debugReady(where = 'land') {
    const D = DOCKS[where];
    if (this.state === 'hull') this.showBuilt(true);
    this.timon = 'set';
    this.state = 'moored';
    this.at = where;
    this.pos.set(D.x, WATER, D.z);
    this.yaw = D.yaw;
    this.spot.set(D.x - 1.2, 0.6, D.z);
    if (where === 'isle') this.visited = true;
    this.wreck = false;
    this.hp = this.hpMax;
  }

  dispose() {
    this.g.player.ride = null;
    for (const b of this.enemies) b.mesh.removeFromParent();
    this.enemies.length = 0;
    this.rams.dispose();
    const L = this.g.world.lights;
    const li = L ? L.indexOf(this.lampEntry) : -1;
    if (li >= 0) L.splice(li, 1);
    this.root.removeFromParent();
  }
}
