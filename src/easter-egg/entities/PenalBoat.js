import * as THREE from 'three';
import { zombieHealth, ZOMBIE_DAMAGE } from '../config/rules';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { texMat } from '../world/penalProps';
import { CELL } from '../world/World';

// El bote del muelle (penal): la única forma de llegar al islote de las
// ánimas, enfrente, donde está la ermita de San La Muerte con el
// Pack-a-Pava. Está a medio armar al costado del muelle chico: le falta el
// timón, que un náufrago colgó de promesa en la capilla (donde antes estaba
// el Pack-a-Pava). Con el timón se arma manteniendo F (uno solo por partida).
// Para zarpar se suben todos los vivos: el primero que sube va al timón y
// maneja con WASD; los demás van sentados y todos pueden tirar. En cada cruce
// salen botes llenos de muertos que se ponen al costado y pegan; si el bote
// llega al otro muelle, los que quedaban se hunden. Mientras cruzan no salen
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
    this.spot = new THREE.Vector3(DOCKS.land.x - 1.2, 0.6, DOCKS.land.z);
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.build();
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
    const wheel = this.wheelModel(0.42);
    wheel.position.set(0, 1.72, 0.1);
    grp.add(wheel);
    this.exWheel = wheel;
    this.root.add(grp);
    this.exPos = new THREE.Vector3(EXVOTO.x, y + 1.3, EXVOTO.z - 0.6);
  }

  showBuilt(on) {
    for (const p of this.planks) p.visible = on;
    this.pile.visible = !on;
    this.body.rotation.z = on ? 0 : 0.12;
  }

  // Un bote de los muertos: casco podrido, algas y un farol verde.
  enemyModel() {
    const M = this.M;
    const g = new THREE.Group();
    const rot = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.95 });
    g.add(mesh(boxGeo(1.5, 0.08, 3.8), rot, 0, EDECK - 0.05, 0));
    for (const s of [-1, 1]) g.add(mesh(boxGeo(0.06, 0.5, 3.8), rot, s * 0.78, EDECK + 0.2, 0, 0, 0, s * 0.18));
    g.add(mesh(boxGeo(1.6, 0.5, 0.06), rot, 0, EDECK + 0.2, -1.9));
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.2, 4, 1), rot);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.5);
    bow.position.set(0, EDECK + 0.2, 2.4);
    g.add(bow);
    const weed = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 1 });
    for (let i = 0; i < 6; i++) g.add(mesh(boxGeo(0.04, 0.35, 0.02), weed, (i % 2 ? 1 : -1) * 0.86, EDECK - 0.02, -1.5 + i * 0.6, 0, 0, (i % 2 ? 1 : -1) * 0.2));
    g.add(mesh(cylGeo(0.02, 0.02, 1.4, 5), M.woodDark, 0, EDECK + 0.9, 1.6));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff5a).multiplyScalar(2.2), toneMapped: false }));
    lamp.position.set(0, EDECK + 1.65, 1.6);
    g.add(lamp);
    this.root.add(g);
    return g;
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
        if (this.state !== 'moored') return null;
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
      if (i === 0 && this.state === 'moored') g.hud.subtitle('Vas al timón: cuando zarpen, manejás con WASD. Todos pueden tirar.', 4);
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
    // los que andaban en tierra vuelven a la cola de la ronda
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      g.zombies.free(z);
      if (g.rounds.state === 'active') g.rounds.requeue(1);
    }
    const text = water
      ? '¡Al río! En el medio el agua está maldita, y ahí se llena la damajuana... si los muertos dejan.'
      : this.dest === 'isle'
        ? '¡Al islote! Del vapor hundido salen botes llenos de muertos. Que no se les pongan al costado.'
        : '¡De vuelta al penal! Cuidado con los botes de los muertos.';
    this.egg.announce(text, 5, true);
    if (water) g.audio.bossArrive();
    this.egg.netSync();
  }

  // (anfitrión) Mientras cruzan: las tandas, el agua de Benito y la llegada.
  voyage(dt) {
    const g = this.g;
    const T = this.trip;
    T.t += dt;
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
    // a mitad de camino: el río agarra el bote para el agua de Benito o, si no, los esperan en el muelle
    if (!T.half && left < T.total * 0.5) {
      T.half = true;
      T.wave = 2;
      if (T.water) {
        this.fillT = 0;
        this.egg.announce('¡El río se puso verde y agarró el bote! Aguanten mientras se llena la damajuana.', 4, true);
        g.audio.bossArrive();
        this.spawnWave(Math.min(5, 3 + n - 1), 3);
      } else this.spawnWave(1 + Math.floor(n / 2), crew, D);
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

  spawnWave(n, crew, around = null) {
    const g = this.g;
    let made = 0;
    for (let k = 0; k < n; k++) if (this.spawnEnemy(Math.min(3, crew + (Math.random() < 0.3 ? 1 : 0)), around)) made++;
    if (!made) return;
    this.egg.netSync();
    g.audio.growl(tmpV.set(this.pos.x, 1, this.pos.z + 20), 'scream');
  }

  // Un bote de los muertos por delante (para el lado del muelle de enfrente)
  // o, con `around`, esperando cerca de ese punto.
  spawnEnemy(crew, around = null) {
    const g = this.g;
    const D = DOCKS[this.dest] || DOCKS.isle;
    const base = Math.atan2(D.x - this.pos.x, D.z - this.pos.z);
    const ref = around || this.pos;
    for (let t = 0; t < 24; t++) {
      const a = around ? Math.random() * Math.PI * 2 : base + (Math.random() - 0.5) * 2.6;
      const d = around ? 7 + Math.random() * 7 : 12 + Math.random() * 12;
      const x = ref.x + Math.sin(a) * d;
      const z = ref.z + Math.cos(a) * d;
      const yaw = Math.atan2(this.pos.x - x, this.pos.z - z);
      if (!this.clear(x, z, yaw)) continue;
      const b = { id: ++this.eid, pos: new THREE.Vector3(x, WATER, z), yaw, speed: 0, state: 'come', side: Math.random() < 0.5 ? -1 : 1, lz: this.pickLz(), t: 0, sinkT: 0, crew: [], mesh: this.enemyModel() };
      const round = Math.max(6, g.rounds.round);
      for (let k = 0; k < Math.min(3, crew); k++) {
        const at = this.toWorld(x, z, yaw, CREW[k][0], CREW[k][1], new THREE.Vector3());
        at.y = EDECK;
        if (!g.zombies.spawn(round, zombieHealth(round), at)) break;
        const zz = g.zombies.pool.find((q) => q.active && q.id === g.zombies.idc);
        if (!zz) break;
        zz.state = 'boat';
        zz.stateT = 0;
        zz.P.rootY = 0;
        zz.pos.y = zz.baseY = EDECK;
        zz.boatOf = b.id;
        b.crew.push({ z: zz, id: zz.id, l: CREW[k], gone: false });
      }
      if (!b.crew.length) {
        b.mesh.removeFromParent();
        return false;
      }
      this.enemies.push(b);
      return true;
    }
    return false;
  }

  // A la altura de alguien sentado (así la del medio de la tripulación queda frente a él).
  pickLz() {
    const taken = SEATS.filter((_, i) => this.seats[i] >= 0);
    const s = taken.length ? taken[Math.floor(Math.random() * taken.length)] : SEATS[0];
    return Math.max(-2.1, Math.min(1.6, s[1] + (Math.random() - 0.5) * 0.6));
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
    return { pl: best, d: bestD };
  }

  updateEnemies(dt, t) {
    const g = this.g;
    const Z = g.zombies;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const b = this.enemies[i];
      b.t += dt;
      for (const c of b.crew) if (!c.gone && !this.crewAlive(c)) this.dropCrew(c);
      if (b.state !== 'sink' && b.crew.every((c) => c.gone)) {
        b.state = 'sink';
        b.sinkT = 0;
      }
      if (b.state === 'sink') {
        b.sinkT += dt;
        b.speed *= Math.max(0, 1 - dt);
        if (b.sinkT > 4) {
          b.mesh.removeFromParent();
          this.enemies.splice(i, 1);
          continue;
        }
      } else if (b.state === 'come') {
        // va a ponerse al costado del bote de los jugadores
        const tg = this.toWorld(this.pos.x, this.pos.z, this.yaw, b.side * 2.55, b.lz, tmpW);
        const dx = tg.x - b.pos.x;
        const dz = tg.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        // de lejos rema de proa hacia el lugar; de cerca se arrima de costado y se endereza
        const want = d < 3.5 ? this.yaw : Math.atan2(dx, dz);
        let da = want - b.yaw;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        b.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
        const v = Math.min(5.4, 1.4 + d * 0.5);
        b.speed += (v - b.speed) * Math.min(1, dt * 1.5);
        let nx;
        let nz;
        if (d < 3.5) {
          const step = Math.min(d, (Math.max(1.6, Math.abs(this.speed) + 1.2)) * dt);
          nx = b.pos.x + (dx / (d || 1)) * step;
          nz = b.pos.z + (dz / (d || 1)) * step;
        } else {
          nx = b.pos.x + Math.sin(b.yaw) * b.speed * dt;
          nz = b.pos.z + Math.cos(b.yaw) * b.speed * dt;
        }
        if (this.isWater(nx, nz)) b.pos.set(nx, WATER, nz);
        else b.yaw += 1.5 * dt;
        if (d < 0.9) {
          b.state = 'side';
          b.fastT = 0;
          g.audio.shuffle?.(b.pos);
        }
      } else {
        // al costado: se queda pegado mientras el bote no se escape
        const tg = this.toWorld(this.pos.x, this.pos.z, this.yaw, b.side * 2.55, b.lz, tmpW);
        b.pos.x += (tg.x - b.pos.x) * Math.min(1, dt * 6);
        b.pos.z += (tg.z - b.pos.z) * Math.min(1, dt * 6);
        b.yaw = this.yaw;
        b.speed = this.speed;
        b.fastT = Math.abs(this.speed) > 4.6 ? b.fastT + dt : 0;
        if (b.fastT > 1.6) {
          b.state = 'come';
          b.speed = 1;
          b.lz = this.pickLz();
          this.egg.announce('¡Los dejaste atrás!', 2);
        }
      }
      // no se meten adentro del bote de los jugadores
      const ox = b.pos.x - this.pos.x;
      const oz = b.pos.z - this.pos.z;
      const od = Math.hypot(ox, oz);
      if (b.state === 'come' && od < 2.3 && od > 0.01) {
        b.pos.x = this.pos.x + (ox / od) * 2.3;
        b.pos.z = this.pos.z + (oz / od) * 2.3;
      }
      this.poseEnemy(b, t);
      // la tripulación: parada, mira al más cercano y si llega, pega
      for (const c of b.crew) {
        if (c.gone) continue;
        const z = c.z;
        const w = this.toWorld(b.pos.x, b.pos.z, b.yaw, c.l[0], c.l[1], tmpV);
        z.pos.set(w.x, EDECK + b.mesh.position.y - WATER, w.z);
        z.baseY = z.pos.y;
        const { pl, d } = this.nearestSeated(z.pos);
        if (pl) {
          let da = Math.atan2(pl.pos.x - z.pos.x, pl.pos.z - z.pos.z) - z.yaw;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          z.yaw += Math.max(-5 * dt, Math.min(5 * dt, da));
        }
        // se estiran por arriba de la borda: llegan a los asientos del costado de ellos
        if (pl && b.state === 'side' && d < 3) {
          if (z.state !== 'boatHit') {
            z.state = 'boatHit';
            z.attackT = 0;
            z.attackHit = false;
            g.audio.growl(tmpW.set(z.pos.x, z.pos.y + 1.6, z.pos.z), 'attack');
          }
          z.attackT += dt;
          Z.poseAttack(z, t);
          if (!z.attackHit && z.attackT > 0.42) {
            z.attackHit = true;
            if (d < 3.1) g.damagePlayer(pl, ZOMBIE_DAMAGE, z.pos);
          }
          if (z.attackT > 0.95) {
            z.attackT = 0;
            z.attackHit = false;
          }
        } else {
          z.state = 'boat';
          z.attackT = 0;
          Z.poseIdle(z, t);
        }
      }
    }
  }

  poseEnemy(b, t) {
    const m = b.mesh;
    const sink = b.state === 'sink' ? b.sinkT : 0;
    m.position.set(b.pos.x, WATER + Math.sin(t * 1.7 + b.id) * 0.05 - sink * 0.35, b.pos.z);
    m.rotation.set(Math.sin(t * 1.3 + b.id) * 0.03 + sink * 0.12, b.yaw, Math.sin(t * 1.1 + b.id * 2) * 0.05 + sink * 0.1);
    if (b.speed > 1.5 && Math.random() < 0.4) this.wake(b.pos, b.yaw, 2);
    // las ondas en el agua (fx/Water)
    if (b.state !== 'sink') this.g.water?.wake(b.pos.x, b.pos.z, Math.sin(b.yaw), Math.cos(b.yaw), b.speed, 2);
  }

  // Timón: el bote avanza, dobla y no se sube a la costa.
  drive(dt) {
    // mientras se llena la damajuana el río tiene agarrado el bote
    const h = this.fillT !== null ? { f: 0, s: 0 } : this.helm;
    const target = h.f > 0 ? MAXV : h.f < 0 ? -REV : 0;
    const acc = (h.f ? 2.8 : 1.4) * dt;
    this.speed += Math.max(-acc, Math.min(acc, target - this.speed));
    const grip = Math.min(1, 0.3 + Math.abs(this.speed) / 3);
    const tv = -h.s * 0.9 * grip * (this.speed < -0.2 ? -1 : 1);
    this.turnV += (tv - this.turnV) * Math.min(1, dt * 4);
    const yaw = this.yaw + this.turnV * dt;
    const nx = this.pos.x + Math.sin(yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(yaw) * this.speed * dt;
    if (this.clear(nx, nz, yaw)) {
      this.dyaw += yaw - this.yaw;
      this.yaw = yaw;
      this.pos.set(nx, WATER, nz);
    } else if (this.clear(this.pos.x, this.pos.z, yaw)) {
      this.dyaw += yaw - this.yaw;
      this.yaw = yaw;
      this.bump();
    } else this.bump();
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
          g.net.event('pee', { bp: [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(3), +this.speed.toFixed(2), +this.turnV.toFixed(3)], eb: this.enemies.map((b) => [b.id, +b.pos.x.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(3), b.state === 'sink' ? 1 : 0, b.speed > 1.5 ? 1 : 0, ...b.crew.map((c) => c.id)]) });
        }
        // la tripulación se dibuja donde quedó este cuadro (si no, va un paso atrás del bote)
        if (this.enemies.length) g.zombies.render();
      } else {
        this.follow(dt, t);
        if (this.fillT !== null) this.fillT = Math.min(FILL, this.fillT + dt);
      }
      if (Math.abs(this.speed) > 1.2 && Math.random() < 0.6) this.wake(this.pos, this.yaw, 2.9);
      g.water?.wake(this.pos.x, this.pos.z, Math.sin(this.yaw), Math.cos(this.yaw), this.speed, 2.9);
      // el remolino verde que agarra el bote
      if (this.fillT !== null && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 3.5;
        g.fx.add?.spawn(this.pos.x + Math.cos(a) * r, WATER + 0.05, this.pos.z + Math.sin(a) * r, -Math.sin(a) * 1.5, 0.4 + Math.random() * 0.6, Math.cos(a) * 1.5, { color: [0.35, 1, 0.45], size: 0.14, size1: 0.02, life: 1.2, alpha: 0.7, gravity: 0.5 });
      }
    }
    // amarrado: el bote se acomoda de a poco con la proa hacia el río
    if (this.state === 'moored') {
      let da = DOCKS[this.at].yaw - this.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const step = Math.max(-dt * 1.2, Math.min(dt * 1.2, da));
      this.yaw += step;
      this.dyaw += step;
    }
    // cómo se mueve el agua
    this.bobY = Math.sin(t * 1.3) * 0.04;
    this.boat.position.set(this.pos.x, this.bobY, this.pos.z);
    this.boat.rotation.y = this.yaw;
    if (this.state !== 'hull') this.body.rotation.z = Math.sin(t * 1.1) * 0.025 - this.turnV * 0.08;
    this.body.rotation.x = Math.sin(t * 0.9) * 0.015 - this.speed * 0.006;
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
    for (const b of this.enemies) {
      const k = Math.min(1, dt * 8);
      let da = b.ty - b.yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      b.yaw += da * k;
      b.pos.x += (b.tx - b.pos.x) * k;
      b.pos.z += (b.tz - b.pos.z) * k;
      // pegado a su tripulación (los muertos llegan con el mismo atraso)
      const zz = b.zids?.map((id) => this.g.zombies.remoteMap?.get(id & 0xffff)).find((q) => q?.active && !q.dead);
      if (zz && b.state !== 'sink') {
        const k2 = b.zids.findIndex((id) => (id & 0xffff) === zz.id);
        const l = CREW[Math.max(0, k2)];
        const s = Math.sin(b.yaw);
        const c = Math.cos(b.yaw);
        b.pos.x = zz.pos.x - (l[0] * c + l[1] * s);
        b.pos.z = zz.pos.z - (-l[0] * s + l[1] * c);
      }
      if (b.state === 'sink') b.sinkT += dt;
      this.poseEnemy(b, t);
    }
  }

  // Lo que manda el anfitrión diez veces por segundo mientras cruzan.
  applyPose(m) {
    const [x, z, yaw, speed, turn] = m.bp;
    this.pose = { x, z, yaw, speed, turn, at: performance.now() };
    if (Math.hypot(x - this.pos.x, z - this.pos.z) > 8) {
      this.pos.set(x, WATER, z);
      this.yaw = yaw;
    }
    const seen = new Set();
    for (const e of m.eb || []) {
      const [id, ex, ez, eyaw, sink, fast, ...zids] = e;
      seen.add(id);
      let b = this.enemies.find((q) => q.id === id);
      if (!b) {
        b = { id, pos: new THREE.Vector3(ex, WATER, ez), yaw: eyaw, speed: 0, state: 'come', sinkT: 0, mesh: this.enemyModel() };
        this.enemies.push(b);
      }
      b.tx = ex;
      b.tz = ez;
      b.ty = eyaw;
      b.zids = zids;
      b.speed = fast ? 3 : 0;
      if (sink && b.state !== 'sink') {
        b.state = 'sink';
        b.sinkT = 0;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (seen.has(this.enemies[i].id)) continue;
      this.splash(this.enemies[i].pos);
      this.enemies[i].mesh.removeFromParent();
      this.enemies.splice(i, 1);
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

  // Amarra en un muelle: se bajan todos y los botes de los muertos que quedaban se hunden.
  dock(k) {
    const g = this.g;
    const D = DOCKS[k];
    const first = k === 'isle' && !this.visited;
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
    for (const b of this.enemies) {
      for (const c of b.crew) if (!c.gone && this.crewAlive(c)) g.zombies.free(c.z);
      this.splash(b.pos);
      b.mesh.removeFromParent();
    }
    this.enemies.length = 0;
    // en el islote salen los muertos de la orilla (la zona se abre la primera vez)
    // y, al rato de bajar, se abre sola la puerta de la ermita
    if (k === 'isle') {
      this.visited = true;
      g.activateZone('L');
      const it = g.interact.list.find((x) => x.kind === 'door' && x.door.def.zones.includes('M'));
      if (it && !it.door.open) g.later(2.5, () => it.door.open || g.interact.openDoor(it.door));
    }
    this.egg.announce(k === 'land' ? 'De vuelta en el penal.' : first ? 'El islote de las ánimas. El Pack-a-Pava está en la ermita de San La Muerte.' : 'En el islote. El bote los espera en el muellecito.', 4, true);
    this.egg.netSync();
    g.net?.event('pee', { bp: [D.x, D.z, this.yaw, 0, 0], eb: [] });
  }

  // Estela: espuma atrás del casco.
  wake(p, yaw, back) {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const x = p.x - s * back + (Math.random() - 0.5) * 1.2 * c;
    const z = p.z - c * back - (Math.random() - 0.5) * 1.2 * s;
    this.g.fx.add?.spawn(x, WATER + 0.04, z, (Math.random() - 0.5) * 0.6, 0.35, (Math.random() - 0.5) * 0.6, { color: [0.75, 0.82, 0.85], size: 0.16, size1: 0.45, life: 1.1, alpha: 0.35, drag: 1.5 });
  }

  splash(p) {
    const g = this.g;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fx.add?.spawn(p.x, WATER + 0.05, p.z, Math.cos(a) * 1.4, 2 + Math.random() * 2, Math.sin(a) * 1.4, { color: [0.7, 0.8, 0.85], size: 0.12, size1: 0.05, life: 0.8, alpha: 0.5, gravity: 9 });
    }
    const a = g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: tmpV.set(p.x, WATER, p.z), gain: 0.6, reverb: 0.2 });
    a.noise(o, { dur: 0.5, freq: 900, freqEnd: 200, gain: 0.8, attack: 0.01 });
  }

  // ---------------- red ----------------
  netState() {
    return { st: this.state, at: this.at, dest: this.dest, tm: this.timon, vis: this.visited ? 1 : 0, fl: this.fillT === null ? -1 : +this.fillT.toFixed(1), seats: this.seats, p: [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(3)], w: this.trip?.wave || 0 };
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
    if (s.st !== 'sail') {
      for (const b of this.enemies) b.mesh.removeFromParent();
      this.enemies.length = 0;
    }
  }

  applyRemote(m) {
    if (m.magic) this.magic();
  }

  // Lo que muestra el HUD con el bote: cuántos van a bordo o cuánto falta para cruzar.
  hudText() {
    if (this.state === 'sail' && this.fillT !== null) return `<span>Llenando la damajuana</span><b>${Math.max(0, Math.ceil(FILL - this.fillT))} s</b>`;
    if (this.state === 'sail' && this.dest) {
      const D = DOCKS[this.dest];
      const left = this.enemies.filter((b) => b.state !== 'sink').length;
      const dist = Math.round(Math.hypot(this.pos.x - D.x, this.pos.z - D.z));
      return `<span>${this.dest === 'isle' ? 'Al islote' : 'Al penal'} (la luz verde)${left ? ` · ${left} ${left === 1 ? 'bote' : 'botes'}` : ''}</span><b>${dist} m</b>`;
    }
    if (this.state === 'moored') {
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
  }

  dispose() {
    this.g.player.ride = null;
    for (const b of this.enemies) b.mesh.removeFromParent();
    this.enemies.length = 0;
    this.root.removeFromParent();
  }
}
