import * as THREE from 'three';
import { ZOMBIE_DAMAGE } from '../config/rules';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, boxGeo, cylGeo } from '../world/props';

// La telesilla del alcaide (penal): una cabina colgada de un cable que va de la
// punta del muelle a la estación del cerro (la zona T, lo más alto del mapa).
// Es una plataforma que se mueve: adentro se camina, se tira y se pelea igual
// que en cualquier lado.
// - La primera vez no anda: el motor del muelle se prende con la electricidad
//   del gaucho life. Después cada viaje cuesta plata (la palanca de adentro la
//   hace salir; el poste de cada estación la llama si está en la otra punta) y,
//   al llegar, el motor se enfría un rato antes de volver a salir.
// - Mientras la puerta está abierta entra cualquiera, también los muertos: el
//   campo de flujo une las dos estaciones (world.navLinks), así que los que
//   buscan a alguien de la otra punta van a la cabina y la esperan adentro. Al
//   arrancar se cierra, y el que quedó adentro viaja.
// - En el muelle la cabina primero sube derecho por la torre de madera, después
//   va por el cable (pasa por una torre de hierro) y arriba baja a la estación.
// La cabina no gira: queda alineada a la grilla, así sus paredes son cajas del
// mundo (World.addBox) que se prenden en la estación donde está parada.
// En línea lo decide el anfitrión (cuándo sale, qué muertos viajan y dónde van
// adentro); el recorrido es siempre el mismo, así que cada compu mueve su cabina
// con el tiempo que pasó y cada uno se lleva a su jugador si quedó adentro.

const COST = 500;
const COOLDOWN = 20;
// de la palanca a que arranca (la puerta se cierra en el último tramo)
const CLOSE_T = 1.8;
const DOOR_T = 0.7;
// adentro: 3 x 3 m (medio ancho), alineado a la grilla; la puerta, al oeste
const HALF = 1.5;
const WALL = 0.06;
const LOW_WALL = 1.1;
const HEIGHT = 2.6;
// del piso de la cabina al cable
const HANG = 3.5;
// la rueda de cada estación: el eje por encima del cable (el carro llega abajo de la rueda)
const WHEEL_R = 0.75;
const WHEEL_UP = 1.1;
// la altura de la viga de arriba de cada torre (del piso de la estación)
const TOWER_TOP = (lift) => lift + HANG + 0.12 + WHEEL_UP + WHEEL_R + 0.35;
// las puntas de los cables: un ancla colgada de la viga, atrás de donde para el carro
const ANCHOR = 0.7;
// el recorrido: sube derecho en la torre, va por el cable y baja en la estación
const RISE = 6;
const DROP = 2.4;
const RISE_T = 4;
const GLIDE_T = 14;
const DROP_T = 2.2;
const TOTAL = RISE_T + GLIDE_T + DROP_T;
// si la esperan del otro lado: un rato, después vuelven a salir cerca de los jugadores
const WAIT_MAX = 25;
// la palanca de adentro (giro sobre la pared): abajo apagada, arriba andando
const LEVER_OFF = 2.3;
const LEVER_ON = 0.35;
export const STATIONS = {
  low: { x: 60.5, z: 79.5, y: 0 },
  high: { x: 85.5, z: 30.5, y: 12 },
};
// la torre de hierro de la mitad (el piso de la cabina pasa a esa altura)
const PYLON = { x: 75.5, z: 50.1, y: 12.15 };
const GLIDE = [
  new THREE.Vector3(STATIONS.low.x, STATIONS.low.y + RISE, STATIONS.low.z),
  new THREE.Vector3(PYLON.x, PYLON.y, PYLON.z),
  new THREE.Vector3(STATIONS.high.x, STATIONS.high.y + DROP, STATIONS.high.z),
];
const SEG = [GLIDE[0].distanceTo(GLIDE[1]), GLIDE[1].distanceTo(GLIDE[2])];
const GLIDE_LEN = SEG[0] + SEG[1];
// el motor (en el muelle) y los postes para llamarla
const MOTOR = { x: 55.3, z: 81.35 };
const POSTS = { low: { x: 55.3, z: 80.45 }, high: { x: 82.6, z: 32.9 } };
const other = (k) => (k === 'low' ? 'high' : 'low');
const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

// Dónde está el piso de la cabina a los `e` segundos de salir del muelle.
function pathAt(e, out) {
  const L = STATIONS.low;
  const H = STATIONS.high;
  if (e <= RISE_T) return out.set(L.x, L.y + RISE * ease(e / RISE_T), L.z);
  if (e <= RISE_T + GLIDE_T) {
    const d = ease((e - RISE_T) / GLIDE_T) * GLIDE_LEN;
    if (d <= SEG[0]) return out.lerpVectors(GLIDE[0], GLIDE[1], d / SEG[0]);
    return out.lerpVectors(GLIDE[1], GLIDE[2], (d - SEG[0]) / SEG[1]);
  }
  return out.set(H.x, H.y + DROP * (1 - ease((e - RISE_T - GLIDE_T) / DROP_T)), H.z);
}

export default class PenalLift {
  constructor(game, egg) {
    this.g = game;
    this.egg = egg;
    this.M = game.world.M;
    this.powered = false;
    // dock (parada en `at`) → close (cerrando la puerta) → move (viajando desde `at`)
    this.at = 'low';
    this.st = 'dock';
    this.t = 0;
    this.cd = 0;
    this.doorK = 1;
    this.pos = new THREE.Vector3(STATIONS.low.x, STATIONS.low.y, STATIONS.low.z);
    // el jugador de esta compu, si va adentro: dónde está parado en la cabina
    this.me = null;
    // (anfitrión) los muertos que viajan; (invitado) dónde van, por número
    this.riders = [];
    this.remoteRiders = new Map();
    this.waitT = 0;
    this.sendT = 0;
    this.humT = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.rideFn = () => this.keepGround();
    this.build();
    this.buildWalls();
    this.register();
    this.link();
    // lo que no se mueve (torres, cables, el motor, la estación), junto por
    // material: eran ~190 piezas sueltas, un dibujo cada una
    // (window.__noMergeStill: sueltas, para comparar)
    if (!window.__noMergeStill) mergeStill(this.root, [this.cabin, this.winch, this.fly, this.redLamp, ...this.wheels]);
    // lo que se mueve entero, junto por dentro: la cabina (menos la puerta, el
    // brazo de la palanca, el carro que gira y el farol que se prende), el
    // carro, el volante del motor y cada rueda del cable
    if (!globalThis.__mduNoMerge) {
      mergeStill(this.cabin, [this.door, this.arm, this.car, this.bulb]);
      for (const o of [this.car, this.fly, ...this.wheels.map((w) => w.children[0])]) mergeStill(o, []);
    }
  }

  // ---------------- lo que se ve ----------------
  build() {
    const M = this.M;
    this.dir = new THREE.Vector3().subVectors(GLIDE[2], GLIDE[0]).setY(0).normalize();
    this.side = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    this.wheels = [];
    this.cabin = this.cabinModel();
    this.root.add(this.cabin);
    this.buildLowStation();
    this.buildHighStation();
    this.buildPylon();
    // los dos cables (y el de arrastre en el medio), de la torre del muelle a la
    // de arriba: en cada punta, atados al ancla
    const top = (v) => new THREE.Vector3(v.x, v.y + HANG + 0.12, v.z);
    const pts = GLIDE.map(top);
    pts[0].addScaledVector(this.dir, -ANCHOR);
    pts[2].addScaledVector(this.dir, ANCHOR);
    this.anchor(pts[0], STATIONS.low.y + TOWER_TOP(RISE) - 0.21, null);
    this.anchor(pts[2], STATIONS.high.y + TOWER_TOP(DROP) - 0.22, STATIONS.high.z);
    const side = this.side;
    for (const k of [-0.32, 0, 0.32]) {
      for (let i = 0; i < 2; i++) {
        const a = pts[i].clone().addScaledVector(side, k);
        const b = pts[i + 1].clone().addScaledVector(side, k);
        if (k === 0) {
          a.y -= 0.22;
          b.y -= 0.22;
        }
        this.root.add(this.rod(a, b, k === 0 ? 0.018 : 0.03, M.iron));
      }
    }
    // la soga del guinche: de la rueda de cada torre a la cabina mientras sube o baja
    this.winch = new THREE.Mesh(cylGeo(0.025, 0.025, 1, 6), M.iron);
    this.winch.visible = false;
    this.root.add(this.winch);
  }

  // La rueda del cable (aro y rayos): gira alrededor de su eje z.
  wheelModel() {
    const M = this.M;
    const r = new THREE.Group();
    r.add(mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 24), M.iron));
    for (let k = 0; k < 6; k++) r.add(mesh(boxGeo(1.4, 0.05, 0.05), M.iron, 0, 0, 0, 0, 0, (k / 6) * Math.PI));
    return r;
  }

  // El ancla de los cables en una estación: una barra de hierro atravesada,
  // colgada de la viga de arriba (beamZ: la viga de la horca va a lo largo de
  // x por ese z; si no, hay una viga justo arriba).
  anchor(p, beamY, beamZ) {
    const M = this.M;
    const a = new THREE.Group();
    a.position.copy(p);
    a.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    a.add(mesh(boxGeo(0.95, 0.4, 0.16), M.iron, 0, -0.1, 0));
    for (const x of [-0.32, 0, 0.32]) a.add(mesh(boxGeo(0.1, 0.1, 0.22), M.metal, x, x ? 0 : -0.22, 0));
    this.root.add(a);
    for (const s of [-0.4, 0.4]) {
      const from = new THREE.Vector3(s, 0.1, 0).applyEuler(a.rotation).add(p);
      const to = from.clone().setY(beamY);
      if (beamZ != null) to.z = beamZ;
      this.root.add(this.rod(from, to, 0.035, M.iron));
    }
  }

  // La horquilla de la rueda de una estación: dos chapas a los costados de la
  // rueda, del eje a la viga de arriba.
  fork(g, hubY, topY) {
    const f = new THREE.Group();
    f.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    for (const x of [-0.16, 0.16]) f.add(mesh(boxGeo(0.05, topY - hubY + 0.15, 0.3), this.M.iron, x, (topY + hubY - 0.15) / 2, 0));
    f.add(mesh(cylGeo(0.05, 0.05, 0.4, 8), this.M.iron, 0, hubY, 0, 0, 0, Math.PI / 2));
    g.add(f);
  }

  // Un palo (cilindro) de a a b.
  rod(a, b, r, mat) {
    const m = new THREE.Mesh(cylGeo(r, r, 1, 6), mat);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.scale.y = a.distanceTo(b);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpV.subVectors(b, a).normalize());
    m.castShadow = true;
    return m;
  }

  // La cabina: piso de tablas, medio cuerpo de madera, ventanas abiertas (se
  // tira por arriba de la baranda), techo de chapa, la puerta corrediza al
  // oeste, la palanca adentro y el carro con las ruedas que van por el cable.
  cabinModel() {
    const M = this.M;
    const g = new THREE.Group();
    const W = HALF + WALL;
    g.add(mesh(boxGeo(W * 2, 0.14, W * 2), M.woodDark, 0, -0.07, 0));
    for (const x of [-1, 0, 1]) g.add(mesh(boxGeo(0.14, 0.18, W * 2), M.iron, x * 1.3, -0.23, 0));
    // el medio cuerpo: tablas, con la abertura de la puerta
    const low = (w, d, x, z) => g.add(mesh(boxGeo(w, LOW_WALL, d), M.wood, x, LOW_WALL / 2, z));
    low(W * 2, WALL * 2, 0, -HALF);
    low(W * 2, WALL * 2, 0, HALF);
    low(WALL * 2, W * 2, HALF, 0);
    low(WALL * 2, HALF - 0.5 + WALL, -HALF, -(HALF + 0.5 + WALL) / 2);
    low(WALL * 2, HALF - 0.5 + WALL, -HALF, (HALF + 0.5 + WALL) / 2);
    // la baranda de arriba del medio cuerpo (la del oeste, cortada en la puerta),
    // los parantes y la viga de arriba
    for (const [w, d, x, z] of [[W * 2, 0.16, 0, -HALF], [W * 2, 0.16, 0, HALF], [0.16, W * 2, HALF, 0], [0.16, W * 2, -HALF, 0]]) {
      if (x < 0) {
        for (const s of [-1, 1]) g.add(mesh(boxGeo(0.16, 0.08, W - 0.5), M.woodDark, x, LOW_WALL + 0.04, (s * (W + 0.5)) / 2));
      } else g.add(mesh(boxGeo(w, 0.08, d), M.woodDark, x, LOW_WALL + 0.04, z));
      g.add(mesh(boxGeo(w, 0.12, d), M.woodDark, x, HEIGHT - 0.06, z));
    }
    for (const x of [-HALF, 0, HALF]) {
      for (const z of [-HALF, 0, HALF]) {
        if ((x === 0 && z === 0) || (x === -HALF && z === 0)) continue;
        g.add(mesh(boxGeo(0.12, HEIGHT, 0.12), M.woodDark, x, HEIGHT / 2, z));
      }
    }
    // el marco de la puerta
    for (const z of [-0.5, 0.5]) g.add(mesh(boxGeo(0.14, HEIGHT, 0.1), M.woodDark, -HALF, HEIGHT / 2, z));
    // el techo de chapa, con el borde de madera
    g.add(mesh(boxGeo(W * 2 + 0.3, 0.08, W * 2 + 0.3), M.roofTin, 0, HEIGHT + 0.05, 0));
    g.add(mesh(boxGeo(W * 2 + 0.34, 0.12, 0.08), M.woodDark, 0, HEIGHT, -W - 0.15));
    g.add(mesh(boxGeo(W * 2 + 0.34, 0.12, 0.08), M.woodDark, 0, HEIGHT, W + 0.15));
    // el colgador y el carro de ruedas (mira siempre a lo largo del cable)
    const hang = new THREE.Group();
    hang.position.y = HEIGHT + 0.1;
    for (const s of [-1, 1]) hang.add(mesh(boxGeo(0.08, HANG - HEIGHT - 0.15, 0.08), M.iron, s * 0.25, (HANG - HEIGHT) / 2 - 0.05, 0, 0, 0, -s * 0.18));
    // (el cuerpo va entre los dos cables, así pasa por arriba de los zapatos de la torre)
    const car = new THREE.Group();
    car.position.y = HANG - HEIGHT - 0.1;
    car.add(mesh(boxGeo(0.4, 0.2, 0.86), M.iron, 0, 0, 0));
    for (const x of [-0.255, 0.255]) car.add(mesh(boxGeo(0.04, 0.36, 0.86), M.iron, x, 0.1, 0));
    for (const x of [-0.32, 0.32]) {
      for (const z of [-0.3, 0.3]) car.add(mesh(cylGeo(0.13, 0.13, 0.06, 12), M.metal, x, 0.22, z, 0, 0, Math.PI / 2));
    }
    hang.add(car);
    this.car = car;
    g.add(hang);
    // la puerta corrediza (con una ventanita): cerrada tapa la abertura, abierta
    // se corre para el sur por afuera de la pared
    const door = new THREE.Group();
    door.add(mesh(boxGeo(0.05, 1.95, 1.02), M.woodDark, 0, 0.98, 0));
    door.add(mesh(boxGeo(0.06, 0.1, 1.04), M.iron, 0, 2.0, 0));
    door.add(mesh(boxGeo(0.06, 0.08, 0.2), M.brass, 0.02, 1.05, -0.36));
    door.position.set(-HALF - WALL - 0.04, 0, 0);
    g.add(door);
    this.door = door;
    // la palanca, en la pared de enfrente de la puerta: gira pegada a la pared
    // (abajo parada, arriba viajando)
    const lev = new THREE.Group();
    lev.position.set(HALF - 0.1, 0.9, 0.55);
    lev.add(mesh(boxGeo(0.06, 0.4, 0.24), M.iron, 0.02, 0, 0));
    const arm = new THREE.Group();
    arm.add(mesh(cylGeo(0.025, 0.025, 0.46, 6), M.brass, 0, 0.23, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M.redPaint || M.brass, 0, 0.48, 0));
    arm.rotation.x = LEVER_OFF;
    lev.add(arm);
    g.add(lev);
    this.arm = arm;
    // el farol de adentro
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(1.8), toneMapped: false }));
    bulb.position.set(0, HEIGHT - 0.2, 0);
    g.add(bulb);
    this.bulb = bulb;
    // el cartel de afuera
    g.add(mesh(boxGeo(1.4, 0.34, 0.04), this.signMat(), 0, 0.72, HALF + WALL + 0.03));
    return g;
  }

  signMat() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#2a1a0e';
    x.fillRect(0, 0, 256, 64);
    x.strokeStyle = '#c9a25a';
    x.lineWidth = 3;
    x.strokeRect(4, 4, 248, 56);
    x.fillStyle = '#e8d2a0';
    x.textAlign = 'center';
    x.font = 'bold 22px serif';
    x.fillText('TELESILLA DEL ALCAIDE', 128, 30);
    x.font = '15px serif';
    x.fillText(`Muelle · Cerro   —   $${COST} el viaje`, 128, 51);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  }

  // La torre del muelle: cuatro postes altos alrededor de la cabina (se sube
  // derecho entre ellos), las vigas y la rueda arriba, y el motor al costado.
  // La torre mira para donde sale el cable: los postes quedan a los costados
  // del camino de la cabina (cuadrada, ocupa 2,3 m para cada lado).
  buildLowStation() {
    const M = this.M;
    const S = STATIONS.low;
    const g = new THREE.Group();
    g.position.set(S.x, S.y, S.z);
    // por encima de la rueda (que queda arriba del carro)
    const top = RISE + HANG + 0.12 + WHEEL_UP + WHEEL_R + 0.35;
    const PX = 2.65;
    const front = 1.6;
    const back = -2.0;
    // x: de costado (x = -side), z: para donde sale (dir)
    const t = new THREE.Group();
    t.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    g.add(t);
    for (const x of [-PX, PX]) {
      for (const z of [back, front]) {
        t.add(mesh(boxGeo(0.24, top, 0.24), M.woodDark, x, top / 2, z));
        const wx = S.x + this.dir.x * z - this.side.x * x;
        const wz = S.z + this.dir.z * z - this.side.z * x;
        this.g.world.addBox([wx - 0.15, S.y, wz - 0.15, wx + 0.15, S.y + top, wz + 0.15], { kind: 'prop' });
      }
    }
    // las vigas de arriba (por encima de la cabina colgada)
    const L = front - back;
    for (const z of [back, front]) t.add(mesh(boxGeo(PX * 2 + 0.3, 0.22, 0.22), M.woodDark, 0, top - 0.1, z));
    for (const x of [-PX, PX]) t.add(mesh(boxGeo(0.22, 0.22, L + 0.3), M.woodDark, x, top - 0.1, (front + back) / 2));
    // la del medio, de la que cuelga la rueda, y la del ancla de los cables
    t.add(mesh(boxGeo(PX * 2 + 0.3, 0.22, 0.22), M.woodDark, 0, top - 0.1, 0));
    t.add(mesh(boxGeo(PX * 2 + 0.3, 0.22, 0.22), M.woodDark, 0, top - 0.1, -ANCHOR));
    // (sin cruces: abajo tapaban la puerta y las ventanas del muelle, y por
    // adelante sale la cabina) una viga a media altura, por encima de las cabezas
    t.add(mesh(boxGeo(PX * 2 + 0.3, 0.2, 0.2), M.woodDark, 0, 4.8, back));
    for (const x of [-PX, PX]) t.add(mesh(boxGeo(0.2, 0.2, L + 0.3), M.woodDark, x, 4.8, (front + back) / 2));
    // la rueda del cable
    const wheel = new THREE.Group();
    wheel.position.set(0, RISE + HANG + 0.12 + WHEEL_UP, 0);
    wheel.rotation.y = Math.atan2(GLIDE[1].x - GLIDE[0].x, GLIDE[1].z - GLIDE[0].z) + Math.PI / 2;
    wheel.add(this.wheelModel());
    g.add(wheel);
    this.wheels.push(wheel);
    this.fork(g, wheel.position.y, top - 0.2);
    this.root.add(g);
    // el motor: un cajón con el volante, las bobinas y la lamparita (roja sin corriente)
    const m = new THREE.Group();
    const y = this.g.world.floorAt(MOTOR.x, MOTOR.z);
    m.position.set(MOTOR.x, y, MOTOR.z);
    m.add(mesh(boxGeo(1.8, 1.0, 0.9), M.metalGreen || M.metal, 0, 0.5, 0));
    m.add(mesh(boxGeo(1.9, 0.08, 1.0), M.woodDark, 0, 1.04, 0));
    const fly = new THREE.Group();
    fly.position.set(0.55, 1.45, 0);
    fly.add(mesh(new THREE.TorusGeometry(0.36, 0.06, 6, 18), M.iron));
    for (let k = 0; k < 4; k++) fly.add(mesh(boxGeo(0.7, 0.04, 0.04), M.iron, 0, 0, 0, 0, 0, (k / 4) * Math.PI));
    m.add(fly);
    this.fly = fly;
    for (const x of [-0.55, -0.15]) m.add(mesh(cylGeo(0.16, 0.16, 0.5, 10), M.copper || M.brass, x, 1.3, 0, 0, 0, Math.PI / 2));
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(1.6), toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.lampMat);
    lamp.position.set(-0.7, 1.2, -0.46);
    m.add(lamp);
    // la palanca para llamarla (en el frente)
    m.add(mesh(boxGeo(0.3, 0.3, 0.05), M.iron, -0.2, 0.8, -0.47));
    m.add(mesh(cylGeo(0.02, 0.02, 0.35, 6), M.brass, -0.2, 0.95, -0.52, 0.4, 0, 0));
    this.root.add(m);
    this.g.world.addBox([MOTOR.x - 0.9, y, MOTOR.z - 0.45, MOTOR.x + 0.9, y + 1.1, MOTOR.z + 0.45], { kind: 'prop' });
    this.motorPos = new THREE.Vector3(MOTOR.x, y + 1.2, MOTOR.z);
  }

  // Arriba: una horca de dos postes del lado del río con la viga que sale
  // sobre la cabina (así no tapa el portón del cerro) y el poste para llamarla.
  buildHighStation() {
    const M = this.M;
    const S = STATIONS.high;
    const g = new THREE.Group();
    g.position.set(S.x, S.y, S.z);
    const top = DROP + HANG + 0.12 + WHEEL_UP + WHEEL_R + 0.35;
    const px = 2.7;
    for (const z of [-1.9, 1.9]) {
      g.add(mesh(boxGeo(0.26, top, 0.26), M.woodDark, px, top / 2, z));
      g.add(this.rod(new THREE.Vector3(px, top - 2.2, z), new THREE.Vector3(0.6, top - 0.1, z * 0.3), 0.07, M.woodDark));
      this.g.world.addBox([S.x + px - 0.14, S.y, S.z + z - 0.14, S.x + px + 0.14, S.y + top, S.z + z + 0.14], { kind: 'prop' });
    }
    g.add(mesh(boxGeo(0.24, 0.24, 4.1), M.woodDark, px, top - 0.1, 0));
    g.add(mesh(boxGeo(px + 0.4, 0.24, 0.3), M.woodDark, px / 2, top - 0.1, 0));
    const wheel = new THREE.Group();
    wheel.position.set(0, DROP + HANG + 0.12 + WHEEL_UP, 0);
    wheel.rotation.y = Math.atan2(GLIDE[2].x - GLIDE[1].x, GLIDE[2].z - GLIDE[1].z) + Math.PI / 2;
    wheel.add(this.wheelModel());
    g.add(wheel);
    this.wheels.push(wheel);
    this.fork(g, wheel.position.y, top - 0.2);
    this.root.add(g);
    this.postPos = {};
    for (const k of ['low', 'high']) {
      const P = POSTS[k];
      const y = this.g.world.floorAt(P.x, P.z);
      if (k === 'high') {
        const post = new THREE.Group();
        post.position.set(P.x, y, P.z);
        post.add(mesh(boxGeo(0.16, 1.4, 0.16), M.woodDark, 0, 0.7, 0));
        post.add(mesh(boxGeo(0.3, 0.3, 0.06), M.iron, 0, 1.05, -0.1));
        post.add(mesh(cylGeo(0.02, 0.02, 0.35, 6), M.brass, 0, 1.2, -0.16, 0.4, 0, 0));
        // la campana
        post.add(mesh(cylGeo(0.06, 0.14, 0.18, 10, true), M.brass, 0.16, 1.5, 0));
        post.add(mesh(boxGeo(0.34, 0.04, 0.04), M.woodDark, 0.08, 1.62, 0));
        this.root.add(post);
        this.g.world.addBox([P.x - 0.1, y, P.z - 0.1, P.x + 0.1, y + 1.4, P.z + 0.1], { kind: 'prop' });
      }
      this.postPos[k] = new THREE.Vector3(P.x, y + 1.1, P.z);
    }
  }

  // La torre de hierro de la mitad, al costado del cable (la cabina pasa al
  // lado): cuatro patas que se juntan, cruces y arriba el brazo que sale por
  // encima del cable, con la horquilla y los dos zapatos donde se apoya.
  buildPylon() {
    const M = this.M;
    const w = this.g.world;
    const cable = PYLON.y + HANG + 0.12;
    const armY = cable + 1.2;
    // del cable al medio de la torre (la cabina, cuadrada, ocupa 2,3 m para ese lado)
    const D = 3.6;
    const cx = PYLON.x + this.side.x * D;
    const cz = PYLON.z + this.side.z * D;
    const base = w.floorAt(cx, cz);
    const top = armY - 0.05;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const legs = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = new THREE.Vector3(sx * 1.3, base - 0.5, sz * 1.3);
      const b = new THREE.Vector3(sx * 0.35, top, sz * 0.35);
      legs.push([a, b]);
      g.add(this.rod(a, b, 0.08, M.iron));
    }
    const n = Math.max(3, Math.round((top - base) / 2.4));
    for (let k = 0; k < n; k++) {
      const u0 = k / n;
      const u1 = (k + 1) / n;
      for (let i = 0; i < 4; i++) {
        const [a0, b0] = legs[i];
        const [a1, b1] = legs[(i + 1) % 4];
        const p0 = a0.clone().lerp(b0, u0);
        const p1 = a1.clone().lerp(b1, u1);
        const q0 = a1.clone().lerp(b1, u0);
        const q1 = a0.clone().lerp(b0, u1);
        g.add(this.rod(p0, p1, 0.03, M.iron));
        g.add(this.rod(q0, q1, 0.03, M.iron));
      }
    }
    // una luz roja arriba, como las antenas
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(2), toneMapped: false }));
    red.position.set(0, armY + 0.45, 0);
    g.add(red);
    this.redLamp = red;
    this.root.add(g);
    // el brazo (z: para el lado de la torre; x: a lo largo del cable), con la
    // pata en diagonal que lo sostiene
    const arm = new THREE.Group();
    arm.position.set(PYLON.x, armY, PYLON.z);
    arm.rotation.y = Math.atan2(this.side.x, this.side.z);
    arm.add(mesh(boxGeo(0.18, 0.18, D + 1.1), M.iron, 0, 0, (D - 0.7) / 2));
    arm.add(this.rod(new THREE.Vector3(0, -1.9, D - 0.35), new THREE.Vector3(0, -0.09, 1.0), 0.05, M.iron));
    // la horquilla: bajan por afuera de las ruedas del carro y sostienen un
    // zapato debajo de cada cable (el carro pasa por arriba)
    const drop = cable - armY;
    for (const s of [-1, 1]) {
      arm.add(mesh(boxGeo(0.08, 0.25 - drop, 0.08), M.iron, 0, (drop - 0.25) / 2, s * 0.62));
      arm.add(mesh(boxGeo(0.08, 0.06, 0.37), M.iron, 0, drop - 0.2, s * 0.455));
      arm.add(mesh(boxGeo(1.4, 0.16, 0.07), M.metal, 0, drop - 0.11, s * 0.32));
    }
    this.root.add(arm);
  }

  // ---------------- las paredes (cajas del mundo) ----------------
  // En cada estación, las paredes de la cabina parada ahí (con el hueco de la
  // puerta): tapan el paso y, el medio cuerpo, las balas (la parte de las
  // ventanas deja pasar los tiros). Se prenden donde la cabina está parada.
  buildWalls() {
    const w = this.g.world;
    this.walls = {};
    const O = HALF + WALL;
    const I = HALF - WALL;
    for (const k of ['low', 'high']) {
      const S = STATIONS[k];
      const list = [];
      const add = (x0, z0, x1, z1) => {
        for (const [y0, y1, shoot] of [[0, LOW_WALL, true], [LOW_WALL, HEIGHT, false]]) {
          const b = w.addBox([S.x + x0, S.y + y0, S.z + z0, S.x + x1, S.y + y1, S.z + z1], { kind: 'prop', shoot });
          b.active = false;
          list.push(b);
        }
      };
      add(-O, -O, O, -I);
      add(-O, I, O, O);
      add(I, -O, O, O);
      add(-O, -O, -I, -0.5);
      add(-O, 0.5, -I, O);
      this.walls[k] = list;
    }
    this.wallsAt = null;
    this.setWalls();
  }

  setWalls() {
    const k = this.st === 'move' ? null : this.at;
    if (k === this.wallsAt) return;
    this.wallsAt = k;
    for (const [s, list] of Object.entries(this.walls)) for (const b of list) b.active = s === k;
    this.g.world.computeNavBlock();
  }

  // El campo de flujo une las dos estaciones: el que busca a alguien de la
  // otra punta va a la cabina.
  link() {
    const w = this.g.world;
    const cell = (S) => w.idx(Math.floor(S.x), Math.floor(S.z));
    const a = cell(STATIONS.low);
    const b = cell(STATIONS.high);
    w.navLinks = new Map([
      [a, [[b, 40]]],
      [b, [[a, 40]]],
    ]);
    this.cells = { low: a, high: b };
    w.navVersion = (w.navVersion || 0) + 1;
  }

  // ---------------- interacciones ----------------
  ready() {
    return this.powered && this.st === 'dock' && this.cd <= 0;
  }

  register() {
    const I = this.g.interact;
    const off = { text: 'La telesilla no tiene corriente: el motor del muelle se prende con la electricidad del gaucho life', noCost: true, info: true };
    const cooling = () => ({ text: `El motor de la telesilla se está enfriando (${Math.ceil(this.cd)} s)`, noCost: true, info: true });
    // la palanca de adentro (va con la cabina)
    this.leverPos = new THREE.Vector3();
    I.add({
      kind: 'ee',
      pos: this.leverPos,
      radius: 1.7,
      prompt: () => {
        if (!this.powered) return off;
        if (this.st !== 'dock') return null;
        if (this.cd > 0) return cooling();
        return `viajar en la telesilla ${this.at === 'low' ? 'al cerro' : 'al muelle'}`;
      },
      // (con corriente siempre cobra: el invitado paga cuando llega el ok, y para
      // entonces la cabina ya está cerrando)
      cost: () => (this.powered ? COST : 0),
      use: () => {
        if (!this.ready()) return false;
        this.go();
        return true;
      },
    });
    // los postes para llamarla desde la otra punta
    for (const k of ['low', 'high']) {
      I.add({
        kind: 'ee',
        pos: this.postPos[k],
        radius: 1.8,
        prompt: () => {
          if (!this.powered) return k === 'low' ? off : { text: 'La telesilla no tiene corriente', noCost: true, info: true };
          if (this.st !== 'dock') return { text: 'La telesilla está viajando', noCost: true, info: true };
          if (this.at === k) return { text: 'La telesilla está acá: la palanca está adentro de la cabina', noCost: true, info: true };
          if (this.cd > 0) return cooling();
          return 'llamar la telesilla';
        },
        cost: () => (this.powered ? COST : 0),
        use: () => {
          if (!this.ready() || this.at === k) return false;
          this.go();
          return true;
        },
      });
    }
    // el motor: la primera vez, el rayo del gaucho life
    this.g.vida?.addTarget({ pos: this.motorPos, r: 1.1, on: () => !this.powered, hit: () => this.power() });
  }

  // (anfitrión)
  power() {
    const g = this.g;
    if (this.powered) return;
    this.powered = true;
    this.powerFx();
    this.egg.announce(`¡La telesilla tiene corriente! Del muelle al cerro, $${COST} el viaje.`, 5, true);
    this.sync();
  }

  powerFx() {
    const g = this.g;
    g.fx.electric?.(this.motorPos, 30);
    g.fx.flash?.(this.motorPos, 0x5ab8ff, 30, 0.5, 8);
    g.audio.zap?.(this.motorPos);
  }

  // (anfitrión) Suena la campana y se empieza a cerrar la puerta.
  go() {
    if (!this.ready()) return;
    this.st = 'close';
    this.t = 0;
    this.bells();
    this.sync();
  }

  // ---------------- el viaje ----------------
  // (anfitrión) Se cerró la puerta: los que quedaron adentro viajan.
  depart() {
    const g = this.g;
    const Z = g.zombies;
    this.riders = [];
    const S = STATIONS[this.at];
    for (const z of Z.pool) {
      if (!z.active || z.dead || z.dog || z.boss) continue;
      if (!['chase', 'attack', 'boat', 'boatHit'].includes(z.state)) continue;
      if (!this.inside(z.pos, S, 0.2)) continue;
      z.state = 'boat';
      z.stateT = 0;
      z.attackT = 0;
      z.liftWait = 0;
      z.P.rootY = 0;
      this.riders.push({ z, id: z.id, lx: z.pos.x - S.x, lz: z.pos.z - S.z });
    }
    this.st = 'move';
    this.t = 0;
    this.startMove();
    this.sync();
  }

  // (anfitrión) Llegó: se abre la puerta y los muertos que viajaban bajan a buscar.
  arrive() {
    const g = this.g;
    const to = other(this.at);
    const S = STATIONS[to];
    for (const r of this.riders) {
      const z = r.z;
      if (!z.active || z.id !== r.id) continue;
      z.pos.set(S.x + r.lx, S.y, S.z + r.lz);
      z.baseY = S.y;
      if (!z.dead && (z.state === 'boat' || z.state === 'boatHit')) {
        z.state = 'chase';
        z.stateT = 0;
        z.attackT = 0;
      }
    }
    this.riders = [];
    this.at = to;
    this.st = 'dock';
    this.t = 0;
    this.cd = COOLDOWN;
    this.endMove();
    // la estación del cerro: la primera vez que se llega se abre la zona (salen
    // muertos ahí) y la puerta de la pasarela al pabellón, así la estación no
    // queda aislada (antes arriba no llegaba ningún muerto y eras invencible)
    if (to === 'high') {
      g.activateZone('T');
      const it = g.interact.list.find((q) => q.kind === 'door' && q.door.def.id === 16);
      if (it && !it.door.open) g.interact.openDoor(it.door);
    }
    this.sync();
  }

  // Cada compu: si el jugador de acá quedó adentro, viaja.
  startMove() {
    const g = this.g;
    const p = g.player;
    const S = STATIONS[this.at];
    this.setWalls();
    this.chime(this.pos, 0);
    if (p.alive === false || !this.inside(p.pos, S, 0.05) || Math.abs(p.pos.y - S.y) > 1.3) return;
    this.me = { lx: p.pos.x - S.x, lz: p.pos.z - S.z, h: 0, px: p.pos.x, pz: p.pos.z, py: p.pos.y };
    p.ride = this.rideFn;
  }

  endMove() {
    const g = this.g;
    this.setWalls();
    this.remoteRiders.clear();
    this.chime(this.pos, 1);
    if (!this.me) return;
    this.me = null;
    if (g.player.ride === this.rideFn) g.player.ride = null;
  }

  // (Player.update, a bordo) el piso de la cabina lo sostiene: no se cae entre cuadro y cuadro.
  keepGround() {
    const m = this.me;
    if (!m) return;
    const p = this.g.player;
    if (m.h <= 0.001 && p.pos.y <= m.py + 0.001) {
      p.onGround = true;
      if (p.vel.y < 0) p.vel.y = 0;
    }
  }

  // ¿Va en la cabina que está viajando? Los muertos de abajo no lo alcanzan
  // (antes le pegaban desde abajo del piso mientras subía).
  riding(p) {
    if (this.st !== 'move') return false;
    return Math.abs(p.pos.x - this.pos.x) < HALF && Math.abs(p.pos.z - this.pos.z) < HALF && Math.abs((p.pos.y || 0) - this.pos.y) < 1.6;
  }

  inside(p, S, pad) {
    return Math.abs(p.x - S.x) < HALF - pad && Math.abs(p.z - S.z) < HALF - pad && Math.abs((p.y || 0) - S.y) < 1.4;
  }

  // Dónde está el piso de la cabina ahora.
  where(out) {
    if (this.st !== 'move') {
      const S = STATIONS[this.at];
      return out.set(S.x, S.y, S.z);
    }
    const e = Math.min(TOTAL, this.t);
    return pathAt(this.at === 'low' ? e : TOTAL - e, out);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    const t = g.time;
    if (this.st === 'close') {
      this.t += dt;
      if (host && this.t >= CLOSE_T) this.depart();
    } else if (this.st === 'move') {
      this.t += dt;
      if (host && this.t >= TOTAL) this.arrive();
    } else this.cd = Math.max(0, this.cd - dt);
    this.where(this.pos);
    this.cabin.position.copy(this.pos);
    // se hamaca un poco al arrancar y frenar
    const moving = this.st === 'move';
    const e = this.t;
    const sway = moving ? Math.sin(e * 1.7) * 0.012 * Math.min(1, e, TOTAL - e) : 0;
    this.cabin.rotation.set(sway * this.dir.z * -1, 0, sway * this.dir.x);
    this.car.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    // la puerta: abierta parada, se cierra al final del aviso y se abre al llegar
    let want = 1;
    if (this.st === 'close') want = this.t > CLOSE_T - DOOR_T ? 0 : 1;
    else if (moving) want = 0;
    this.doorK += Math.max(-dt / DOOR_T, Math.min(dt / DOOR_T, want - this.doorK));
    this.door.position.z = this.doorK * 1.05;
    const lw = this.st === 'dock' ? LEVER_OFF : LEVER_ON;
    this.arm.rotation.x += (lw - this.arm.rotation.x) * Math.min(1, dt * 8);
    this.leverPos.set(this.pos.x + HALF - 0.3, this.pos.y + 1.1, this.pos.z + 0.55);
    // la soga del guinche, mientras sube derecho en el muelle o baja arriba
    const L = STATIONS.low;
    const H = STATIONS.high;
    let wy = null;
    const up = HANG + 0.12 + WHEEL_UP - WHEEL_R;
    if (moving && Math.abs(this.pos.x - L.x) < 0.01 && Math.abs(this.pos.z - L.z) < 0.01) wy = L.y + RISE + up;
    else if (moving && Math.abs(this.pos.x - H.x) < 0.01 && Math.abs(this.pos.z - H.z) < 0.01) wy = H.y + DROP + up;
    else if (!moving) wy = this.at === 'low' ? L.y + RISE + up : H.y + DROP + up;
    const cy = this.pos.y + HANG;
    this.winch.visible = wy !== null && wy - cy > 0.2;
    if (this.winch.visible) {
      this.winch.position.set(this.pos.x, (wy + cy) / 2, this.pos.z);
      this.winch.scale.y = wy - cy;
    }
    // las ruedas y el volante del motor giran con el viaje
    const spin = moving ? dt * 4 : 0;
    for (const w of this.wheels) w.children[0].rotation.z += spin;
    this.fly.rotation.z += moving ? dt * 9 : 0;
    this.lampMat.color.setHex(this.powered ? 0x40ff60 : 0xff3020).multiplyScalar(1.6);
    this.bulb.visible = this.powered;
    this.redLamp.visible = Math.sin(t * 3) > 0;
    // el ruido del motor, a los golpecitos
    if (moving) {
      this.humT -= dt;
      if (this.humT <= 0) {
        this.humT = 0.28;
        this.hum();
      }
    }
    this.setWalls();
    this.carryMe();
    if (host) {
      this.carryRiders(dt, t);
      this.waiters(dt, t);
      this.sendT -= dt;
      if (g.net && moving && this.sendT <= 0) {
        this.sendT = 0.1;
        g.net.event('pee', { lz: this.riders.map((r) => [r.id, +r.lx.toFixed(2), +r.lz.toFixed(2)]) });
      }
    } else this.carryRemote();
  }

  // El jugador de acá, a bordo: lo que caminó en este cuadro se suma adentro de
  // la cabina (sin salirse de las paredes) y la cabina lo lleva.
  carryMe() {
    const m = this.me;
    if (!m) return;
    const g = this.g;
    const p = g.player;
    if (p.alive === false) {
      this.me = null;
      if (p.ride === this.rideFn) p.ride = null;
      return;
    }
    const lim = HALF - 0.4;
    m.lx = Math.max(-lim, Math.min(lim, m.lx + p.pos.x - m.px));
    m.lz = Math.max(-lim, Math.min(lim, m.lz + p.pos.z - m.pz));
    let h = m.h + p.pos.y - m.py;
    if (h <= 0.001) {
      h = 0;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
    h = Math.min(h, 1.0);
    p.pos.set(this.pos.x + m.lx, this.pos.y + h, this.pos.z + m.lz);
    p.airTop = p.pos.y;
    m.px = p.pos.x;
    m.pz = p.pos.z;
    m.py = p.pos.y;
    m.h = h;
    p.updateCamera(g.camera);
  }

  // Los que van adentro (vivos, tirados o muertos) y dónde, en la cabina.
  aboard() {
    const g = this.g;
    const out = [];
    if (this.me && g.player.canBeHit()) out.push({ pl: g.player, lx: this.me.lx, lz: this.me.lz });
    if (g.net) {
      for (const r of g.net.remote.values()) {
        if (r.dead || r.downed || r.ghost) continue;
        const lx = r.pos.x - this.pos.x;
        const lz = r.pos.z - this.pos.z;
        if (Math.abs(lx) < HALF && Math.abs(lz) < HALF && Math.abs(r.pos.y - this.pos.y) < 1.6) out.push({ pl: r, lx, lz });
      }
    }
    return out;
  }

  // (anfitrión) Los muertos que viajan: caminan adentro hacia el más cercano y pegan.
  carryRiders(dt, t) {
    const g = this.g;
    const Z = g.zombies;
    if (!this.riders.length) return;
    const on = this.aboard();
    const lim = HALF - 0.3;
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      const z = r.z;
      if (!z.active || z.id !== r.id || z.state === 'flung') {
        this.riders.splice(i, 1);
        continue;
      }
      const alive = !z.dead && (z.state === 'boat' || z.state === 'boatHit');
      if (alive) {
        let best = null;
        let bd = Infinity;
        for (const o of on) {
          const d = Math.hypot(o.lx - r.lx, o.lz - r.lz);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        let walk = 0;
        if (best) {
          const dx = best.lx - r.lx;
          const dz = best.lz - r.lz;
          Z.turn(z, Math.atan2(dx, dz), 6, dt);
          if (bd > 0.95 && z.state !== 'boatHit') {
            walk = Math.min(bd - 0.9, (z.speed || 1.2) * 0.8 * dt);
            r.lx += (dx / bd) * walk;
            r.lz += (dz / bd) * walk;
          }
          if (bd < 1.15 || z.state === 'boatHit') {
            if (z.state !== 'boatHit') {
              z.state = 'boatHit';
              z.attackT = 0;
              z.attackHit = false;
              g.audio.growl(tmpW.set(z.pos.x, z.pos.y + 1.6, z.pos.z), 'attack');
            }
            z.attackT += dt;
            if (!z.attackHit && z.attackT > 0.42) {
              z.attackHit = true;
              if (bd < 1.4) g.damagePlayer(best.pl, ZOMBIE_DAMAGE, z.pos);
            }
            if (z.attackT > 0.95) {
              z.state = 'boat';
              z.attackT = 0;
            }
          }
        }
        // no se apilan entre ellos
        for (const q of this.riders) {
          if (q === r || q.z.dead) continue;
          const dx = r.lx - q.lx;
          const dz = r.lz - q.lz;
          const d = Math.hypot(dx, dz);
          if (d > 0.01 && d < 0.6) {
            r.lx += (dx / d) * (0.6 - d) * 0.5;
            r.lz += (dz / d) * (0.6 - d) * 0.5;
          }
        }
        r.lx = Math.max(-lim, Math.min(lim, r.lx));
        r.lz = Math.max(-lim, Math.min(lim, r.lz));
        if (z.state === 'boatHit') Z.poseAttack(z, t);
        else if (walk > 0) Z.poseGait(z, dt, walk / dt, t);
        else Z.poseIdle(z, t);
      }
      z.pos.set(this.pos.x + r.lx, this.pos.y, this.pos.z + r.lz);
      z.baseY = this.pos.y;
    }
    Z.render();
  }

  // (invitado) Los muertos que viajan, pegados a la cabina de esta compu.
  carryRemote() {
    const Z = this.g.zombies;
    if (!this.remoteRiders.size || this.st !== 'move') return;
    for (const [id, [lx, lz]] of this.remoteRiders) {
      const z = Z.remoteMap?.get(id & 0xffff);
      if (!z?.active) continue;
      z.pos.set(this.pos.x + lx, this.pos.y, this.pos.z + lz);
      z.baseY = z.ny = this.pos.y;
    }
    Z.render();
  }

  applyRiders(list) {
    if (this.st !== 'move') return;
    this.remoteRiders.clear();
    for (const [id, lx, lz] of list) this.remoteRiders.set(id, [lx, lz]);
  }

  // (anfitrión) Los que llegan a una estación para ir a la otra punta la esperan
  // adentro (quietos); si tarda mucho, vuelven a la cola de la ronda.
  waiters(dt, t) {
    const g = this.g;
    const Z = g.zombies;
    this.waitT -= dt;
    const check = this.waitT <= 0;
    if (check) this.waitT = 0.25;
    for (const z of Z.pool) {
      if (!z.active || z.dead || z.dog || z.boss) continue;
      if (z.liftWait) {
        // la cabina se lo llevó (ya es de los que viajan) o dejó de esperar
        if (z.state !== 'boat') {
          z.liftWait = 0;
          continue;
        }
        if (this.riders.some((r) => r.z === z)) continue;
        // (mientras la cabina viene o sale no se cansa de esperar)
        if (this.st === 'dock') z.liftWait += dt;
        Z.poseIdle(z, t);
        if (check && !this.viaLink(z)) {
          z.liftWait = 0;
          z.state = 'chase';
          z.stateT = 0;
        } else if (z.liftWait > WAIT_MAX) {
          z.liftWait = 0;
          Z.free(z);
          g.rounds.requeue(1);
        }
        continue;
      }
      if (!check || (z.state !== 'chase' && z.state !== 'attack')) continue;
      for (const k of ['low', 'high']) {
        if (!this.inside(z.pos, STATIONS[k], 0.3)) continue;
        if (this.st === 'move' && this.at === k) break;
        if (this.viaLink(z)) {
          z.state = 'boat';
          z.stateT = 0;
          z.attackT = 0;
          z.liftWait = 0.001;
        }
        break;
      }
    }
  }

  // ¿El camino hacia el que busca sigue por la telesilla?
  viaLink(z) {
    const g = this.g;
    const target = g.nearestPlayer(z.pos.x, z.pos.z, z.pos.y);
    if (!target) return false;
    const nav = g.navFor ? g.navFor(target) : g.nav;
    const w = g.world;
    const here = w.idx(Math.floor(z.pos.x), Math.floor(z.pos.z));
    const links = w.navLinks?.get(here);
    const d = nav?.dist?.[here];
    if (!links || !Number.isFinite(d) || d <= 0) {
      // parado en la cabina pero no justo en la celda del enlace: la de la estación
      for (const k of ['low', 'high']) {
        if (!this.inside(z.pos, STATIONS[k], 0)) continue;
        const c = this.cells[k];
        const dc = nav?.dist?.[c];
        const L = w.navLinks?.get(c);
        if (!L || !Number.isFinite(dc)) return false;
        return L.some(([ni, cost]) => nav.dist[ni] + cost <= dc + 1e-3);
      }
      return false;
    }
    return links.some(([ni, cost]) => nav.dist[ni] + cost <= d + 1e-3);
  }

  // ---------------- sonido ----------------
  bells() {
    const a = this.g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: tmpV.set(this.pos.x, this.pos.y + 2.4, this.pos.z), gain: 0.9, reverb: 0.3, ref: 6 });
    for (let k = 0; k < 3; k++) a.bell(o, a.now + k * 0.32, 88, { gain: 0.16, dur: 1.4 });
  }

  chime(p, n) {
    const a = this.g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: tmpV.set(p.x, p.y + 1, p.z), gain: 0.8, reverb: 0.25, ref: 5 });
    // el golpe del freno o del arranque, y la puerta
    a.noise(o, { dur: 0.35, freq: 420, freqEnd: 160, gain: 0.7, attack: 0.005 });
    a.tone(o, { dur: 0.25, type: 'square', freq: n ? 140 : 110, freqEnd: n ? 90 : 160, gain: 0.08 });
  }

  hum() {
    const a = this.g.audio;
    if (!a.ctx) return;
    const o = a.out({ pos: tmpV.set(this.pos.x, this.pos.y + HANG, this.pos.z), gain: 0.5, reverb: 0.15, ref: 5 });
    a.tone(o, { dur: 0.32, type: 'sawtooth', freq: 58 + Math.random() * 3, gain: 0.05, attack: 0.03 });
    a.noise(o, { dur: 0.3, freq: 900, gain: 0.08, attack: 0.02 });
  }

  // ---------------- red ----------------
  sync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('pee', { lift: this.netState() });
  }

  netState() {
    return { pw: this.powered ? 1 : 0, at: this.at, st: this.st, t: +this.t.toFixed(2), cd: +this.cd.toFixed(1) };
  }

  applyState(s) {
    const was = this.st;
    const wasPw = this.powered;
    this.powered = !!s.pw;
    if (this.powered && !wasPw && was) this.powerFx();
    if (s.st === 'move' && was !== 'move') {
      this.at = s.at;
      this.st = 'move';
      this.t = s.t;
      this.where(this.pos);
      this.startMove();
    } else if (s.st !== 'move' && was === 'move') {
      this.st = s.st;
      this.at = s.at;
      this.where(this.pos);
      this.endMove();
    }
    if (s.st === 'close' && was !== 'close') this.bells();
    this.at = s.at;
    this.st = s.st;
    this.t = s.t;
    this.cd = s.cd;
    this.setWalls();
  }

  // Lo que se muestra en el HUD mientras se viaja o se cierra la puerta.
  hudText() {
    if (this.st === 'move' && this.me) return `<span>Telesilla · ${this.at === 'low' ? 'al cerro' : 'al muelle'}</span><b>${Math.max(0, Math.ceil(TOTAL - this.t))} s</b>`;
    if (this.st === 'close' && this.inside(this.g.player.pos, STATIONS[this.at], 0)) return `<span>Telesilla · se cierra la puerta</span><b>${Math.max(0, Math.ceil(CLOSE_T - this.t))} s</b>`;
    return null;
  }

  // Atajo de prueba (solo): con corriente, parada en `where` y sin enfriar.
  debugReady(where = 'low') {
    this.powered = true;
    this.at = where;
    this.st = 'dock';
    this.t = 0;
    this.cd = 0;
    this.setWalls();
  }

  dispose() {
    const g = this.g;
    if (g.player.ride === this.rideFn) g.player.ride = null;
    for (const list of Object.values(this.walls)) for (const b of list) b.active = false;
    if (g.world.navLinks) g.world.navLinks = null;
    this.root.removeFromParent();
  }
}

// Las mallas quietas de un grupo (a cualquier profundidad, fuera de las ramas
// de skip, que se mueven o se prenden y apagan), juntas por material y sombra.
function mergeStill(root, skip) {
  const out = new Set(skip.filter(Boolean));
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map();
  const walk = (o) => {
    if (out.has(o) || !o.visible) return;
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.children.length && !Array.isArray(o.material) && !o.morphTargetInfluences && o.geometry?.attributes?.position) {
      const k = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      let L = sets.get(k);
      if (!L) sets.set(k, (L = []));
      L.push(o);
      return;
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  const m4 = new THREE.Matrix4();
  for (const L of sets.values()) {
    if (L.length < 2) continue;
    const geos = L.map((o) => {
      let g = o.geometry.clone().applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      // (las caras de una caja o un cilindro vienen en grupos: con un material, sobran)
      g.clearGroups();
      if (g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, L[0].material);
    m.castShadow = L[0].castShadow;
    m.receiveShadow = L[0].receiveShadow;
    m.renderOrder = L[0].renderOrder;
    root.add(m);
    for (const o of L) o.removeFromParent();
  }
}
