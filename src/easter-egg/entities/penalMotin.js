import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PERK_SPOTS, ZONES } from '../config/map';
import { PERKS } from '../config/perks';
import { WEAPONS, BOWIE, tierOf, maxTier } from '../config/weapons';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from '../world/props';
import { bars } from '../world/penalProps';
import { warmObject } from '../fx/ghostMat';
import { keyLabel } from '../core/controls';

// El Motín del penal (Mate of the Dead). Cada 10 rondas (10, 20, 30...) el
// pabellón se amotina: suena la sirena, el Alcaide grita por los parlantes y
// se corta la luz. El penal queda en rojo (las lámparas en emergencia, las
// balizas que giran y los reflectores de las torres barriendo el patio), las
// máquinas que tenían la corriente del gaucho life se apagan (los perks que
// ya tomaste quedan) y las trampas eléctricas no andan. Las celdas del
// pabellón revientan y la horda sale de adentro; a mitad del motín llega el
// Alcaide.
//  - Tres tableros quemados en distintas zonas (uno siempre en la oficina del
//    Alcaide, que se llega por el hueco del gaucho life): solo el rayo del
//    alma los vuelve a prender, y mientras dura el motín entrar al gaucho life
//    a mano no gasta carga. Cada tablero devuelve la luz de su parte del
//    penal; con los tres vuelven las máquinas y las trampas.
//  - Termina cuando cae toda la horda y el Alcaide. Si faltó algún tablero,
//    la luz vuelve sola al final.
//  - El premio, "Pertenencias confiscadas": con los tres tableros revienta el
//    depósito del pabellón (atrás del escritorio del guardia) y cada uno abre
//    su casillero (mantener F): un perk que no tenga, las cargas del gaucho
//    life llenas, munición y una tirada (el Pack-a-Pava del mate que tiene en
//    la mano, la Bombilla Gut, el Facón de Plata o 2500). Con uno o dos
//    tableros, una carga y un power-up por tablero.
//  - Siempre toca uno durante el easter egg: soltar a Anacleto hace saltar la
//    alarma. Si todavía no hubo motín (antes de la ronda 10) es ahí mismo (o
//    con la ronda que viene) y el de la 10 ya no viene; mientras tanto Cirilo
//    no habla.
// En línea lo lleva el anfitrión (la horda, el Alcaide, los tableros, los
// casilleros) y lo manda por el canal 'ee' de PenalEgg ({ mo }); cada compu
// arma lo que se ve y se oye. El rayo de un invitado le pega al tablero por
// GauchoLife (vidahit), su casillero lo abre con requestUse y lo que sale de
// adentro lo recibe cada uno en su compu (mlo).

const EVERY = 10;
// cuándo revientan las celdas (después de la sirena y el corte de luz): en
// la punta del tercer lamento de la sirena, donde también late la luz
const CELL_AT = 7.6;
// Sin canción (el usuario, 2026-10-01): el apagón grabado (evento-apagon-penal)
// chisporrotea y a los 5,35 s da el golpe: ahí se corta la luz; las luces
// titilan antes en los chispazos de la toma (APAGON_FLICKS).
const APAGON_CUT = 5.35;
const APAGON_FLICKS = [0.05, 0.5, 1.0, 1.9, 2.4, 3.4, 3.9, 4.6];
// qué parte de la horda tiene que haber salido para que llegue el Alcaide (el
// primer motín y los que siguen), y no antes de estos segundos
const BOSS_AT = [0.45, 0.3];
const BOSS_MIN_T = 28;
const REWARD_PTS = 2500;
const RED = new THREE.Color(0xff2a14);
const RED_BEAM = new THREE.Color(1, 0.07, 0.03);
const BLUE = 0x5ab8ff;
const GOLD = 0xffc84a;

// Los tableros (pared, hacia dónde mira y el nombre corto del cartel). En cada
// motín se queman tres: el de la oficina siempre (del pabellón se llega solo
// por el hueco del gaucho life) y otros dos en lugares ya abiertos.
const SPOTS = [
  { cell: [47, 25], face: [0, -1], name: 'Oficina' },
  { cell: [25, 29], face: [0, 1], name: 'Duchas' },
  { cell: [33, 52], face: [0, -1], name: 'Comedor' },
  { cell: [49, 51], face: [0, -1], name: 'Cocina' },
  { cell: [57, 49], face: [1, 0], name: 'Patio' },
  { cell: [24, 54], face: [-1, 0], name: 'Calabozos' },
  { cell: [58, 25], face: [0, 1], name: 'Pasarela' },
];
const BOARD_Y = 1.45;

// Las balizas: [x, y, z, nx, nz]. En la pared, (x, z) es la cara y (nx, nz)
// hacia dónde mira; arriba de las torres de guardia (nx = nz = 0), y es la
// altura sobre el piso.
const BEACONS = [
  [32, 7.5, 38.6, 1, 0],
  [60, 7.5, 39.6, -1, 0],
  [52, 11.2, 26, 0, 1],
  [41.6, 7.0, 42, 0, 1],
  [52.4, 7.0, 51, 0, -1],
  [31, 6.8, 34.6, -1, 0],
  [57, 11.2, 21.6, -1, 0],
  [21, 2.95, 61, 1, 0],
  [24, 2.95, 70.5, -1, 0],
  [42, 4.8, 66.5, 1, 0],
  [69.3, 7.78, 44.3, 0, 0],
  [53.6, 7.78, 72, 0, 0],
  [78, 7.78, 43, 0, 0],
  // colgada del techo del pabellón, en el medio: barre el piso y las paredes
  [46, 12.25, 35.5, 0, 0, 'ceil'],
];
// Los cuartos (caja [x0, y0, z0, x1, y1, z1]) donde el haz de cada baliza
// pega en las paredes y el techo: ahí se dibuja la mancha roja que barre.
const ROOMS = [
  [32, 4, 30, 60, 12.6, 41],
  [32, 4, 42, 46, 7.9, 52],
  [47, 4, 42, 57, 7.8, 51],
  [20, 4, 30, 31, 7.6, 39],
  [45, 8, 15, 57, 11.9, 25],
  [21, 0, 48, 24, 3.4, 79],
];
// la luz de ambiente en la alarma (late con la sirena) y la neblina del pabellón
const AMB_RED = new THREE.Color(1, 0.07, 0.03);
const HAZE = { color: [0.5, 0.19, 0.14], size: 3, size1: 5.5, life: 7, alpha: 0.12, drag: 0.5, gravity: -0.03 };
const BURST_DUST = { color: [0.5, 0.42, 0.36], size: 0.9, size1: 3.2, life: 3.5, alpha: 0.2, drag: 1.4, gravity: -0.05 };
const SPOT_R = 0.24;
const ZAXIS = new THREE.Vector3(0, 0, 1);

// El depósito de pertenencias: contra la pared del pabellón, debajo de la
// pasarela, atrás del escritorio del guardia. Cuatro casilleros, uno por jugador.
const DEP = { x: 40.6, z: 30, n: 4, w: 0.88, h: 2.2, d: 0.6 };

const LINES = {
  start: '¡Motín en el pabellón! ¡Que no salga ni un gaucho!',
  boss: '¡Ahora van a ver quién manda en este penal!',
};

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpCol = new THREE.Color();
const tmpM = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);
const UPV = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';
const SPARK = [1, 0.75, 0.35];
const SPARK_DIR = { x: 0, y: 0.4, z: 0 };
const UP_DIR = { x: 0, y: 1, z: 0 };
const SMOKE = [0.08, 0.07, 0.06];
const GOLD_RGB = [1, 0.85, 0.4];

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c;
  return t;
}

// Un cartelito pintado (el del tablero y los de los casilleros).
function plateDraw(text, { bg = '#d8cfb4', fg = '#231c14', font = 'bold 30px Georgia, serif', border = '#3a3226' } = {}) {
  return (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = border;
    x.lineWidth = 5;
    x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = font;
    x.fillText(text, w / 2, h / 2 + 2, w - 24);
  };
}

// El haz de luz (como el de los reflectores de world/penalProps.js, pero de
// a muchos: instanciado). Sin normalizar en el vértice ni pow de valores
// negativos: un píxel NaN el bloom lo desparrama por toda la pantalla.
function beamMaterial(color, opacity = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vUv = uv; vec4 p = vec4(position, 1.0); vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
      #endif
        vec4 mv = modelViewMatrix * p; vN = normalMatrix * n; vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 n = vN / max(length(vN), 1e-4); vec3 v = -vP / max(length(vP), 1e-4);
        float d = min(abs(dot(n, v)), 1.0); float edge = d * d;
        float along = pow(clamp(vUv.y, 1e-4, 1.0), 1.6);
        gl_FragColor = vec4(uColor * uOpacity * edge * along, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Un cono de luz con la punta en el origen que apunta hacia -z.
const coneGeo = (r, len) => new THREE.ConeGeometry(r, len, 18, 1, true).translate(0, -len / 2, 0).rotateX(Math.PI / 2);

export default class PenalMotin {
  constructor(game, ee) {
    this.g = game;
    this.ee = ee;
    this.M = game.world.M;
    this.every = EVERY;
    // (la interfaz de g.defense: Rounds, Zombies)
    this.active = false;
    this.zones = null;
    // el motín adelantado por el easter egg (forceEarly): pendiente, para la
    // ronda que viene, y cuál de las de siempre se saltea
    this.pending = false;
    this.early = false;
    this.forced = false;
    this.forcedNext = false;
    this.forcedNow = false;
    this.skipRound = 0;
    this.lockRemote = false;
    this.count = 0;
    this.round = 0;
    this.t = 0;
    this.cutOn = false;
    this.cutList = [];
    // el Alcaide: 0 por venir, 1 suelto, 2 caído
    this.bossSt = 0;
    this.bossZ = null;
    this.bossDue = false;
    this.bossTry = 0;
    this.horde = 1;
    // el depósito: 0 cerrado, 1 abierto; de quién es cada casillero y cuáles se abrieron
    this.dep = 0;
    this.owners = [];
    this.claimed = [false, false, false, false];
    this.syncT = 0;
    this.hordeT = 0;
    this.cellShare = 0.8;
    this.shareT = 0;
    // lo que se ve (en todas las compus)
    this.alarm = 0;
    this.alarmOn = false;
    this.cutAt = Infinity;
    this.cellT = -1;
    this.cellClose = -1;
    this.depK = 0;
    this.sirenT0 = 0;
    this.inK = 0;
    this.inWant = 0;
    this.zoneT = 0;
    this.atmos = null;
    this.hazeT = 0;
    this.sparkT = 0;
    this.hudT = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // lo que no se mueve se funde con la utilería del mapa
    this.fixed = new THREE.Group();
    this.makeMats();
    this.buildBoards();
    this.buildBeacons();
    this.findReflectors();
    this.buildCellDoors();
    this.buildDeposito();
    this.lx = game.world.lights.map((e, i) => ({ e, sec: 0, r: 0, flick: 0, phase: i * 1.37, touched: false }));
    if (game.world.addStatic) game.world.addStatic(this.fixed);
    else this.root.add(this.fixed);
    this.register();
    this.buildHud();
    // los materiales de lo que está escondido se compilan ya (que el motín no trabe)
    const hidden = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    warmObject(game, this.root);
    for (const o of hidden) o.visible = false;
    this.bakeSfx();
  }

  // ---------------- materiales ----------------
  makeMats() {
    const M = this.M;
    const soot = canvasTex(128, 160, (x, w, h) => {
      // la mancha alrededor del gabinete y las lenguas de humo que subieron
      // por la pared (manchas estiradas, sin bordes)
      const blob = (cx, cy, r, a, sy = 1) => {
        x.save();
        x.translate(cx, cy);
        x.scale(1, sy);
        const gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, `rgba(6,4,3,${a})`);
        gr.addColorStop(0.6, `rgba(6,4,3,${a * 0.45})`);
        gr.addColorStop(1, 'rgba(6,4,3,0)');
        x.fillStyle = gr;
        x.beginPath();
        x.arc(0, 0, r, 0, Math.PI * 2);
        x.fill();
        x.restore();
      };
      blob(w / 2, h * 0.62, w * 0.46, 0.85);
      for (let i = 0; i < 6; i++) blob(w * (0.3 + Math.random() * 0.4), h * (0.28 + Math.random() * 0.12), 9 + Math.random() * 8, 0.35 + Math.random() * 0.2, 3);
    });
    // el adentro del tablero reventado: tapones negros, loza quemada y grietas
    const inside = canvasTex(128, 160, (x, w, h) => {
      x.fillStyle = '#17110c';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const cx = 24 + i * 40;
        x.fillStyle = '#4a4238';
        x.fillRect(cx - 12, 22, 24, 34);
        x.fillStyle = '#0a0806';
        x.beginPath();
        x.arc(cx, 39, 9, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#3a3128';
      x.fillRect(20, 80, 88, 56);
    });
    const cracks = canvasTex(128, 160, (x, w, h) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#fff';
      x.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let px = Math.random() * w;
        let py = Math.random() * h;
        x.lineWidth = 1 + Math.random() * 2.5;
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 5; k++) {
          px += (Math.random() - 0.5) * 30;
          py += (Math.random() - 0.5) * 30;
          x.lineTo(px, py);
        }
        x.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const gr = x.createRadialGradient(24 + i * 40, 39, 1, 24 + i * 40, 39, 14);
        gr.addColorStop(0, '#fff');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, w, h);
      }
    });
    // la luz de adentro de los casilleros: un óvalo suave (no una tabla amarilla)
    const soft = canvasTex(64, 128, (x, w, h) => {
      const gr = x.createRadialGradient(w / 2, h * 0.45, 2, w / 2, h * 0.45, h * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    });
    this.mats = {
      box: new THREE.MeshStandardMaterial({ color: 0x3a423e, roughness: 0.5, metalness: 0.6 }),
      porcelain: new THREE.MeshStandardMaterial({ color: 0xe2dccb, roughness: 0.35 }),
      sign: new THREE.MeshStandardMaterial({ map: canvasTex(256, 80, plateDraw('PELIGRO', { bg: '#e8c23a', fg: '#1a1408', font: 'bold 40px Georgia, serif', border: '#1a1408' })), roughness: 0.7 }),
      soot: new THREE.MeshBasicMaterial({ map: soot, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      inside,
      cracks,
      glowGold: new THREE.MeshBasicMaterial({ map: soft, color: new THREE.Color(GOLD).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      rimGold: new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    };
  }

  // ---------------- los tableros ----------------
  // En todos los lugares posibles hay un tablero de siempre (gabinete de
  // hierro, lamparita, aisladores y el cartel), fundido con la utilería. En
  // el motín, a los tres que se queman se les pone encima lo reventado: el
  // tizne, la puerta colgando, el adentro con grietas que brillan, la
  // cuchilla caída y la lamparita roja.
  buildBoards() {
    const W = this.g.world;
    const M = this.M;
    const P = this.mats;
    this.spots = SPOTS.map((s) => {
      const a = W.wallAnchor(s.cell, s.face, 0.005);
      const fy = W.floorAt(s.cell[0] + 0.5 + s.face[0], s.cell[1] + 0.5 + s.face[1], 20);
      const zone = W.zoneAt(s.cell[0] + 0.5 + s.face[0], s.cell[1] + 0.5 + s.face[1], fy + 1);
      const grp = new THREE.Group();
      grp.position.set(a.x, fy, a.z);
      grp.rotation.y = a.rot;
      const y = BOARD_Y;
      grp.add(mesh(boxGeo(0.74, 1.0, 0.04), M.woodDark, 0, y, 0.02));
      // (con los materiales del mapa: se funden en los dibujos que ya hay)
      grp.add(mesh(boxGeo(0.5, 0.64, 0.13), M.iron, 0, y, 0.105));
      grp.add(mesh(boxGeo(0.03, 0.12, 0.03), M.black, 0.2, y, 0.18));
      for (const x of [-0.18, 0, 0.18]) {
        grp.add(mesh(cylGeo(0.022, 0.03, 0.06, 8), M.whitewash || P.porcelain, x, y + 0.36, 0.1));
        grp.add(mesh(cylGeo(0.008, 0.008, 1.6, 5), M.black, x, y + 1.19, 0.1));
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.094), P.sign);
      sign.position.set(0, y - 0.43, 0.042);
      grp.add(sign);
      this.fixed.add(grp);
      grp.updateMatrixWorld(true);
      return { ...s, a, fy, zone, center: new THREE.Vector3(0, y, 0.2).applyMatrix4(grp.matrixWorld), rot: a.rot };
    });
    // los tres reventados (se mueven al lugar que toca en cada motín)
    this.tab = [0, 1, 2].map((i) => this.buildBurnt(i));
  }

  buildBurnt(i) {
    const M = this.M;
    const P = this.mats;
    const y = BOARD_Y;
    const grp = new THREE.Group();
    grp.visible = false;
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), P.soot);
    soot.position.set(0, y + 0.22, 0.045);
    soot.renderOrder = 2;
    grp.add(soot);
    // el adentro (tapa la puerta del gabinete de siempre)
    const inMat = new THREE.MeshStandardMaterial({ map: P.inside, emissive: 0xffffff, emissiveMap: P.cracks, emissiveIntensity: 1.4, roughness: 0.9 });
    inMat.emissive.setHex(0xff5a10);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.62), inMat);
    inner.position.set(0, y, 0.174);
    grp.add(inner);
    // la puerta del gabinete: arrancada de una bisagra, colgando de costado
    const door = new THREE.Group();
    door.position.set(-0.25, y, 0.17);
    door.rotation.set(0, -1.72, 0.3);
    door.add(mesh(boxGeo(0.5, 0.64, 0.018), P.box, 0.25, 0, 0.009));
    door.add(mesh(boxGeo(0.03, 0.12, 0.03), M.black, 0.45, 0, 0.03));
    grp.add(door);
    // la cuchilla (caída: abierta), con su mango
    const blades = new THREE.Group();
    blades.position.set(-0.04, y - 0.12, 0.21);
    for (const x of [-0.05, 0.05]) blades.add(mesh(boxGeo(0.022, 0.3, 0.024), M.copper, x, 0.15, 0));
    blades.add(mesh(cylGeo(0.022, 0.022, 0.2, 8), M.redPaint || M.black, 0, 0.3, 0.03, 0, 0, Math.PI / 2));
    grp.add(blades);
    // la lamparita (roja que titila; azul cuando vuelve la corriente)
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x200808, emissive: 0xff2010, emissiveIntensity: 2.2 });
    const lamp = mesh(new THREE.SphereGeometry(0.038, 12, 8), lampMat, 0, y + 0.4, 0.06);
    grp.add(lamp);
    // el resplandor de las chispas
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
    glow.scale.setScalar(0.62);
    glow.position.set(0, y, 0.34);
    grp.add(glow);
    mergeByMaterial(grp, [soot, inner, door, blades, lamp, glow]);
    mergeByMaterial(door);
    mergeByMaterial(blades);
    this.root.add(grp);
    const t = { i, spot: -1, on: false, grp, inner, inMat, door, blades, lamp, lampMat, glow, center: new THREE.Vector3(0, -100, 0), k: 0, onT: 0, sparkT: 0, sec: [] };
    return t;
  }

  // Pone el tablero i en el lugar `spot` (en todas las compus igual).
  placeBoard(i, spot) {
    const t = this.tab[i];
    t.spot = spot;
    const s = this.spots[spot];
    if (!s) {
      t.grp.visible = false;
      t.center.set(0, -100, 0);
      return;
    }
    t.grp.position.set(s.a.x, s.fy, s.a.z);
    t.grp.rotation.y = s.rot;
    t.grp.updateMatrixWorld(true);
    t.center.copy(s.center);
    if (t.it) t.it.pos.copy(s.center);
  }

  // (anfitrión) Los tres que se queman: la oficina (por el hueco) y dos más
  // en zonas ya abiertas, distintas entre sí; si no alcanzan, la pasarela.
  pickSpots() {
    const g = this.g;
    const open = (s) => !s.zone || g.activeZones.has(s.zone);
    const pick = [0];
    const pool = this.spots.map((s, i) => i).filter((i) => i > 0 && i < 6 && open(this.spots[i]));
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    for (const i of pool) {
      if (pick.length >= 3) break;
      if (pick.some((p) => this.spots[p].zone === this.spots[i].zone)) continue;
      pick.push(i);
    }
    for (const i of [6, ...pool, 1, 2, 3]) {
      if (pick.length >= 3) break;
      if (!pick.includes(i)) pick.push(i);
    }
    pick.forEach((sp, i) => {
      this.placeBoard(i, sp);
      this.tab[i].on = false;
    });
    this.assignSectors();
  }

  // Cada lámpara del mapa vuelve con el tablero que le queda más cerca.
  assignSectors() {
    for (const L of this.lx) {
      const [x, y, z] = L.e.def.pos;
      let best = 0;
      let bd = Infinity;
      this.tab.forEach((t, i) => {
        const d = (t.center.x - x) ** 2 + ((t.center.y - y) * 1.5) ** 2 + (t.center.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      L.sec = best;
    }
  }

  // ---------------- las balizas ----------------
  // Una base de hierro, la cúpula colorada (brilla más cuando el haz te mira)
  // y dos haces que giran. Todo instanciado: tres dibujos para todas.
  buildBeacons() {
    const W = this.g.world;
    const M = this.M;
    // (las de las torres, grandes: se ven desde todo el patio)
    this.beacons = BEACONS.map(([x, y, z, nx, nz, kind]) => {
      const ceil = kind === 'ceil';
      const top = !nx && !nz;
      const sc = ceil ? 1.9 : top ? 2.4 : 1.5;
      const by = ceil ? y : top ? W.floorAt(x, z, 20) + y : y;
      const b = { x: x + nx * 0.24 * sc, y: by, z: z + nz * 0.24 * sc, nx, nz, top, ceil, sc, bs: ceil ? 1.5 : top ? 1.7 : 1, tilt: ceil ? -0.62 : top ? -0.1 : -0.04, phase: Math.random() * 6.28, spin: 2.7 + Math.random() * 0.7, room: null };
      b.room = ROOMS.find((r) => b.x > r[0] - 0.6 && b.x < r[3] + 0.6 && b.y > r[1] && b.y < r[4] + 0.3 && b.z > r[2] - 0.6 && b.z < r[5] + 0.6) || null;
      return b;
    });
    const n = this.beacons.length;
    const base = mergeGeometries([cylGeo(0.1, 0.12, 0.07, 12).clone().translate(0, -0.11, 0), cylGeo(0.035, 0.035, 0.05, 8).clone().translate(0, -0.06, 0)].map((g) => (g.index ? g.toNonIndexed() : g)));
    this.beaconBase = new THREE.InstancedMesh(base, M.iron, n);
    const walls = this.beacons.filter((b) => !b.top);
    this.beaconArm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.26).translate(0, -0.13, -0.12), M.iron, Math.max(1, walls.length));
    const dome = mergeGeometries([new THREE.CylinderGeometry(0.085, 0.09, 0.1, 14, 1, true).translate(0, -0.02, 0), new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.03, 0)].map((g) => (g.index ? g.toNonIndexed() : g)));
    this.domeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.beaconDome = new THREE.InstancedMesh(dome, this.domeMat, n);
    this.beamMat = beamMaterial(RED_BEAM, 0);
    this.beaconBeam = new THREE.InstancedMesh(coneGeo(1.15, 4.6), this.beamMat, n * 2);
    this.beaconBeam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beaconBeam.frustumCulled = false;
    this.beaconBeam.renderOrder = 4;
    this.beaconBeam.visible = false;
    let k = 0;
    this.beacons.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.ceil ? Math.PI : 0, b.top ? 0 : Math.atan2(b.nx, b.nz), 0);
      dummy.scale.setScalar(b.sc);
      dummy.updateMatrix();
      this.beaconBase.setMatrixAt(i, dummy.matrix);
      this.beaconDome.setMatrixAt(i, dummy.matrix);
      this.beaconDome.setColorAt(i, tmpCol.setRGB(0.18, 0.02, 0.01));
      if (!b.top) this.beaconArm.setMatrixAt(k++, dummy.matrix);
    });
    this.beaconArm.count = k;
    for (const im of [this.beaconBase, this.beaconArm, this.beaconDome]) {
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = false;
      this.root.add(im);
    }
    this.beaconDome.instanceColor.needsUpdate = true;
    this.root.add(this.beaconBeam);
    this.beaconIdle = false;
    // las manchas rojas que los haces dejan en las paredes y el techo de los
    // cuartos (un plano suave por haz, instanciado: un dibujo para todas)
    const spotTex = canvasTex(64, 64, (x, w, h) => {
      const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    });
    this.spotMat = new THREE.MeshBasicMaterial({ map: spotTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.spotBeacons = this.beacons.filter((b) => b.room);
    this.spots2 = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.spotMat, Math.max(1, this.spotBeacons.length * 2));
    this.spots2.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spots2.frustumCulled = false;
    this.spots2.renderOrder = 3;
    this.spots2.visible = false;
    for (let i = 0; i < this.spots2.count; i++) this.spots2.setColorAt(i, tmpCol.setRGB(0, 0, 0));
    this.root.add(this.spots2);
    this.hitTmp = [0, 0, 0, 0];
  }

  // Dónde pega un haz (desde p, dirección d) adentro de la caja del cuarto:
  // la distancia y la normal de la cara (en out: [t, nx, ny, nz]).
  roomHit(r, px, py, pz, dx, dy, dz, out) {
    let t = Infinity;
    const ax = (d, p, lo, hi, k) => {
      if (Math.abs(d) < 1e-4) return;
      const tt = ((d > 0 ? hi : lo) - p) / d;
      if (tt > 0 && tt < t) {
        t = tt;
        out[1] = k === 0 ? -Math.sign(d) : 0;
        out[2] = k === 1 ? -Math.sign(d) : 0;
        out[3] = k === 2 ? -Math.sign(d) : 0;
      }
    };
    ax(dx, px, r[0], r[3], 0);
    ax(dy, py, r[1], r[4], 1);
    ax(dz, pz, r[2], r[5], 2);
    out[0] = t;
    return out;
  }

  updateBeacons(dt, t) {
    const K = this.alarm;
    const on = K > 0.003;
    this.beaconBeam.visible = on;
    this.beamMat.uniforms.uOpacity.value = 0.55 * K;
    if (!on && this.beaconIdle) return;
    this.beaconIdle = !on;
    const cam = this.g.camera.position;
    this.spots2.visible = on;
    const pulse = 0.45 + 0.55 * this.pulseAt(t);
    const H = this.hitTmp;
    let si = 0;
    this.beacons.forEach((b, i) => {
      const a = b.phase + t * b.spin;
      const ct = Math.cos(b.tilt);
      const st = Math.sin(b.tilt);
      for (let k = 0; k < 2; k++) {
        const ak = a + k * Math.PI;
        // (el haz que apunta a la pared se achica: es la luz que pega contra ella)
        const dot = b.top ? 1 : -Math.sin(ak) * b.nx - Math.cos(ak) * b.nz;
        const s = Math.max(0.04, dot);
        let len = 1;
        if (b.room) {
          // adentro de un cuarto: el haz llega hasta la pared (o el techo) y ahí deja la mancha
          const dx = -ct * Math.sin(ak);
          const dz = -ct * Math.cos(ak);
          this.roomHit(b.room, b.x, b.y, b.z, dx, st, dz, H);
          const d = H[0];
          const live = s > 0.06 && Number.isFinite(d) && d > 0.6;
          if (live) {
            len = Math.min(2.6, Math.max(1, d / 4.6));
            const r = Math.min(3.2, Math.max(0.7, d * SPOT_R));
            dummy.position.set(b.x + dx * d + H[1] * 0.03, b.y + st * d + H[2] * 0.03, b.z + dz * d + H[3] * 0.03);
            tmpV.set(H[1], H[2], H[3]);
            dummy.quaternion.setFromUnitVectors(ZAXIS, tmpV);
            dummy.scale.set(r * 2, r * 2, 1);
            dummy.updateMatrix();
            const lum = K * pulse * Math.min(1, 7 / d) * Math.min(1, s * 3) * 1.4;
            this.spots2.setColorAt(si, tmpCol.setRGB(lum, lum * 0.08, lum * 0.04));
          } else {
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
          }
          this.spots2.setMatrixAt(si, dummy.matrix);
          si++;
        }
        dummy.position.set(b.x, b.y + (b.ceil ? -0.02 : 0.02) * b.sc, b.z);
        dummy.rotation.set(b.tilt, ak, 0);
        dummy.scale.set(Math.sqrt(s) * b.bs, Math.sqrt(s) * b.bs, s * b.bs * len);
        dummy.updateMatrix();
        this.beaconBeam.setMatrixAt(i * 2 + k, dummy.matrix);
      }
      // el destello cuando el haz apunta a la cámara
      const look = Math.atan2(cam.x - b.x, cam.z - b.z);
      const f = Math.max(0, Math.cos(wrap(look - a - Math.PI)), Math.cos(wrap(look - a)));
      const f2 = f * f * f * f;
      const lum = 0.16 + K * (0.9 + 3.2 * f2 * f2);
      this.beaconDome.setColorAt(i, tmpCol.setRGB(lum, lum * 0.1, lum * 0.05));
    });
    this.beaconBeam.instanceMatrix.needsUpdate = true;
    this.beaconDome.instanceColor.needsUpdate = true;
    if (si) {
      this.spots2.instanceMatrix.needsUpdate = true;
      this.spots2.instanceColor.needsUpdate = true;
    }
  }

  // El latido de la alarma, al ritmo de la sirena: un lamento cada 3 s, que
  // llega arriba a los 1,6 s (ahí la luz pega más fuerte). 0..1, con punta.
  pulseAt(t) {
    const ph = ((((t - this.sirenT0) / 3) % 1) + 1) % 1;
    const c = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (ph - 0.53));
    return c * c * c;
  }

  // La luz de ambiente y la de abajo: en la alarma, adentro (más en el
  // pabellón), la de ambiente se vuelve roja y late; la azulada baja.
  updateAtmos(dt, t) {
    const g = this.g;
    const W = g.world;
    this.zoneT -= dt;
    if (this.zoneT <= 0) {
      this.zoneT = 0.25;
      const c = g.camera.position;
      const z = W.zoneAt(c.x, c.z, c.y);
      this.inWant = !z ? 0.3 : ZONES[z]?.outdoor ? 0.3 : z === 'A' ? 1 : 0.75;
    }
    this.inK += (this.inWant - this.inK) * Math.min(1, dt * 2);
    const k = this.alarm * (this.cutOn ? 1 : 0.4) * this.inK;
    if (k < 0.002) {
      if (this.atmos) {
        W.hemiBase = this.atmos.hemi;
        if (W.ambient) {
          W.ambient.intensity = this.atmos.amb;
          W.ambient.color.copy(this.atmos.col);
        }
        this.atmos = null;
      }
      return;
    }
    if (!this.atmos) this.atmos = { hemi: W.hemiBase, amb: W.ambient?.intensity ?? 0.5, col: W.ambient ? W.ambient.color.clone() : null };
    const A = this.atmos;
    const p = this.pulseAt(t);
    W.hemiBase = (A.hemi ?? 0.9) * (1 - 0.5 * k);
    if (W.ambient) {
      W.ambient.color.copy(A.col).lerp(AMB_RED, Math.min(1, k * 1.2));
      W.ambient.intensity = A.amb * (1 - 0.4 * k) + k * (0.22 + 1.5 * p);
    }
  }

  // La neblina de polvo del pabellón después de que revientan las celdas
  // (de cerca: las partículas son las de siempre, fx.alpha).
  updateHaze(dt) {
    if (!this.active || this.cellT < 0.5 || this.distTo(46, 35.5) > 34) return;
    this.hazeT -= dt;
    if (this.hazeT > 0) return;
    this.hazeT = 0.24;
    const x = 35 + Math.random() * 24;
    const z = 33.5 + Math.random() * 6;
    this.g.fx.alpha.spawn(x, 4.4 + Math.random() * 2.2, z, (Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.25, HAZE);
  }

  // ---------------- los reflectores de las torres ----------------
  // En el motín se ponen colorados, giran a los barquinazos y cabecean (barren el patio).
  findReflectors() {
    const spins = this.g.world.dynamic.spins || [];
    this.refl = [];
    for (const s of spins) {
      // (el faro del río no: ese sigue igual)
      if (Math.hypot(s.position.x - 17, s.position.z - 97) < 5) continue;
      const head = s.children[0];
      if (!head) continue;
      let mat = null;
      head.traverse((o) => {
        if (!mat && o.material?.uniforms?.uColor) mat = o.material;
      });
      this.refl.push({ s, head, speed0: s.userData.speed, pitch0: head.rotation.x, k: this.refl.length });
      if (mat && !this.reflMat) {
        this.reflMat = mat;
        this.reflCol0 = mat.uniforms.uColor.value.clone();
        this.reflOp0 = mat.uniforms.uOpacity.value;
      }
    }
  }

  updateReflectors(dt, t) {
    const K = this.alarm;
    if (K <= 0.001 && this.reflIdle) return;
    this.reflIdle = K <= 0.001;
    for (const r of this.refl) {
      const sweep = 1.25 * Math.sin(t * 0.55 + r.k * 2.1) + Math.sign(r.speed0 || 1) * 0.35;
      r.s.userData.speed = r.speed0 * (1 - K) + sweep * K;
      r.head.rotation.x = r.pitch0 - K * (0.1 + 0.12 * Math.sin(t * 0.8 + r.k * 1.7));
    }
    if (this.reflMat) {
      this.reflMat.uniforms.uColor.value.copy(this.reflCol0).lerp(RED_BEAM, K);
      this.reflMat.uniforms.uOpacity.value = this.reflOp0 * (1 + 1.6 * K);
    }
  }

  // ---------------- las celdas del pabellón ----------------
  // Las rejas de las celdas (world/penalProps.js celdas) dejan el hueco de la
  // puerta y una marca en la bisagra: las puertas las arma esto, instanciadas
  // (todas iguales), y revientan para afuera cuando empieza el motín.
  buildCellDoors() {
    const W = this.g.world;
    const M = this.M;
    const marks = (W.dynamic.lamps || []).filter((o) => o.name === 'celdaPuerta');
    const H = 2.62;
    const iron = [];
    for (let k = 0; k <= 5; k++) iron.push(cylGeo(0.018, 0.018, H - 0.1, 5).clone().translate(0.08 + k * 0.128, H / 2, 0));
    for (const x of [0.02, 0.78]) iron.push(boxGeo(0.045, H, 0.045).clone().translate(x, H / 2, 0));
    for (const y of [0.14, H * 0.48, H - 0.06]) iron.push(boxGeo(0.8, 0.05, 0.04).clone().translate(0.4, y, 0));
    const ironGeo = mergeGeometries(iron.map((g) => (g.index ? g.toNonIndexed() : g)));
    const lockGeo = boxGeo(0.12, 0.17, 0.07).clone().translate(0.7, 1.12, 0.05);
    this.cells = marks.map((m) => {
      m.updateMatrixWorld(true);
      const pos = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      const q = new THREE.Quaternion().setFromRotationMatrix(m.matrixWorld);
      const at = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyQuaternion(q).add(pos);
      const inside = at(0.4, -1.45);
      const out = at(0.4, 0.95);
      const lock = at(0.7, 0.05).setY(pos.y + 1.12);
      return { pos, q, a: 0, v: 0, sp: { x: inside.x, y: pos.y, z: inside.z, ox: out.x, oz: out.z }, lock, cd: 0, delay: 0, k: 0 };
    });
    const n = Math.max(1, this.cells.length);
    this.doorIron = new THREE.InstancedMesh(ironGeo, M.bars || M.iron, n);
    this.doorLock = new THREE.InstancedMesh(lockGeo, M.brass, n);
    for (const im of [this.doorIron, this.doorLock]) {
      im.count = this.cells.length;
      // (las hojas se mueven: la esfera que calcula three no las sigue)
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(im);
    }
    this.poseDoors(true);
  }

  poseDoors(force = false) {
    if (!this.cells.length) return;
    let moved = force;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!force && c.shown === c.a) continue;
      c.shown = c.a;
      moved = true;
      // (para afuera de la celda: el giro negativo lleva la hoja hacia +z de la bisagra)
      tmpQ.setFromAxisAngle(UPV, -c.a).premultiply(c.q);
      tmpM.compose(c.pos, tmpQ, ONE);
      this.doorIron.setMatrixAt(i, tmpM);
      this.doorLock.setMatrixAt(i, tmpM);
    }
    if (!moved) return;
    this.doorIron.instanceMatrix.needsUpdate = true;
    this.doorLock.instanceMatrix.needsUpdate = true;
    this.shadowDirty = true;
  }

  // Revientan (las de a una, muy seguido): chispas en el candado, polvo y el golpe.
  burstCells(instant = false) {
    const g = this.g;
    this.cellT = instant ? 99 : 0;
    this.cellClose = -1;
    this.cells.forEach((c, i) => {
      c.delay = instant ? 0 : i * 0.13 + Math.random() * 0.06;
      c.burst = !instant;
      if (instant) {
        c.a = 1.85;
        c.v = 0;
      }
    });
    // las rejas grabadas (desde el pabellón, se oyen en todo el penal); con
    // ellas no suena el golpe sintetizado de cada reja
    this.cellRec = !instant && !!g.audio?.eventSfx?.('evento-celdas-penal', { pos: tmpV.set(46, 3, 35), gain: 1.2, reverb: 0.45, ref: 12 });
    if (!instant) {
      g.fx.addShake(Math.max(0.12, 0.45 - this.distTo(46, 35) * 0.012));
      // el fogonazo rojo del pabellón (una de las luces de destello de siempre)
      g.fx.flash(tmpV.set(47, 6, 37), 0xff3010, 70, 0.7, 20);
    }
    this.poseDoors(true);
  }

  updateCells(dt) {
    const g = this.g;
    if (this.cellT >= 0 && this.cellClose < 0) {
      this.cellT += dt;
      for (const c of this.cells) {
        if (this.cellT < c.delay) continue;
        if (c.burst) {
          c.burst = false;
          // de una patada: la hoja sale volando hasta el tope y rebota
          c.v = 9 + Math.random() * 3;
          g.fx.sparks(c.lock, 3, SPARK_DIR, SPARK);
          g.fx.dust(tmpV.copy(c.lock).setY(c.pos.y + 0.1), UP_DIR, BURST_DUST.color, 6);
          // la polvareda que sale de la celda
          const ox = c.sp.ox - c.sp.x;
          const oz = c.sp.oz - c.sp.z;
          for (let q = 0; q < 4; q++) g.fx.alpha.spawn(c.sp.ox + (Math.random() - 0.5) * 0.8, c.pos.y + 0.4 + Math.random() * 1.6, c.sp.oz, ox * (0.3 + Math.random() * 0.4), 0.15, oz * (0.3 + Math.random() * 0.4), BURST_DUST);
          if (!this.cellRec) this.sfx('clang', c.lock);
        }
        // un resorte con tope (la reja pega contra la pared de la celda de al lado)
        const goal = 1.85;
        c.v += (goal - c.a) * 40 * dt - c.v * 5 * dt;
        c.a += c.v * dt;
        if (c.a > 2.05) {
          c.a = 2.05;
          c.v = -Math.abs(c.v) * 0.35;
        }
      }
      this.poseDoors();
    } else if (this.cellClose >= 0) {
      this.cellClose += dt;
      let all = true;
      for (const [i, c] of this.cells.entries()) {
        const k = Math.max(0, Math.min(1, (this.cellClose - i * 0.1) / 1.4));
        const a = c.open0 * (1 - k * k);
        if (k < 1) all = false;
        else if (c.a > 0) this.sfx('shut', c.lock);
        c.a = k >= 1 ? 0 : a;
      }
      this.poseDoors();
      if (all) {
        this.cellClose = -1;
        this.cellT = -1;
      }
    }
  }

  closeCells(instant = false) {
    if (instant) {
      for (const c of this.cells) c.a = 0;
      this.cellT = -1;
      this.cellClose = -1;
      this.poseDoors(true);
      return;
    }
    for (const c of this.cells) c.open0 = c.a;
    this.cellClose = 0;
  }

  // (anfitrión, Zombies.spawn) Mientras las celdas están abiertas, casi todos
  // salen de adentro: aparecen en el fondo y caminan para afuera por la
  // puerta (estado 'cellOut'). Solo si alguien anda cerca del pabellón.
  spawnCell() {
    if (!this.active || this.cellT < 0.6 || this.cellClose >= 0 || !this.cells.length) return null;
    if (Math.random() > this.cellShare) return null;
    const now = this.g.time;
    const start = Math.floor(Math.random() * this.cells.length);
    for (let k = 0; k < this.cells.length; k++) {
      const c = this.cells[(start + k) % this.cells.length];
      if (now < c.cd) continue;
      c.cd = now + 0.9;
      return c.sp;
    }
    return null;
  }

  // ---------------- el depósito de pertenencias ----------------
  buildDeposito() {
    const g = this.g;
    const W = g.world;
    const M = this.M;
    const P = this.mats;
    const x0 = DEP.x;
    const z0 = DEP.z;
    const fy = W.floorAt(x0, z0 + 1.5, 20);
    this.depY = fy;
    const fixed = new THREE.Group();
    fixed.position.set(0, fy, 0);
    const span = DEP.n * DEP.w;
    const green = M.metalGreen || M.metal;
    // el fondo de tablas y el marco de hierro de la reja
    fixed.add(mesh(boxGeo(span + 0.7, 2.95, 0.04), M.woodDark, x0, 1.475, z0 + 0.02));
    for (const s of [-1, 1]) fixed.add(mesh(boxGeo(0.1, 2.9, 0.1), M.iron, x0 + s * (span / 2 + 0.3), 1.45, z0 + 0.92));
    fixed.add(mesh(boxGeo(span + 0.7, 0.1, 0.1), M.iron, x0, 2.9, z0 + 0.92));
    // la jaula: los costados y el techo de barrotes, de la pared a la reja
    // (antes solo estaba el frente y por arriba y los lados quedaba abierto)
    const cage = new THREE.Group();
    const barM = M.bars || M.iron;
    for (const s of [-1, 1]) {
      const side = new THREE.Group();
      side.rotation.y = -Math.PI / 2;
      side.position.set(x0 + s * (span / 2 + 0.3), 0, z0 + 0.04);
      bars(side, M, 0, 0.84, 0, 2.82, 0.15, 0.04);
      mergeByMaterial(side);
      cage.add(side);
    }
    const top = span + 0.6;
    const nTop = Math.round(top / 0.15);
    for (let k = 0; k <= nTop; k++) cage.add(mesh(cylGeo(0.018, 0.018, 0.9, 5), barM, x0 - top / 2 + (top * k) / nTop, 2.9, z0 + 0.48, Math.PI / 2, 0, 0));
    cage.add(mesh(boxGeo(span + 0.7, 0.06, 0.06), M.iron, x0, 2.9, z0 + 0.07));
    for (const s of [-1, 1]) cage.add(mesh(boxGeo(0.06, 0.06, 0.9), M.iron, x0 + s * (span / 2 + 0.3), 2.9, z0 + 0.48));
    mergeByMaterial(cage);
    fixed.add(cage);
    // el cartel, clavado en las tablas del fondo (arriba de los casilleros)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(512, 80, plateDraw('DEPÓSITO · PERTENENCIAS', { font: 'bold 38px Georgia, serif' })), roughness: 0.7 }));
    sign.position.set(x0, 2.55, z0 + 0.045);
    fixed.add(sign);
    this.lockers = [];
    for (let i = 0; i < DEP.n; i++) {
      const x = x0 + (i - (DEP.n - 1) / 2) * DEP.w;
      const w = DEP.w;
      const d = DEP.d;
      const h = DEP.h;
      // el cuerpo: costados, techo, piso, fondo, un estante y lo de adentro
      for (const s of [-1, 1]) fixed.add(mesh(boxGeo(0.025, h, d), green, x + s * (w / 2 - 0.0125), h / 2, z0 + d / 2));
      fixed.add(mesh(boxGeo(w, 0.025, d), green, x, h - 0.0125, z0 + d / 2));
      fixed.add(mesh(boxGeo(w, 0.025, d), green, x, 0.0125, z0 + d / 2));
      fixed.add(mesh(boxGeo(w - 0.05, h - 0.05, 0.02), M.black, x, h / 2, z0 + 0.05));
      fixed.add(mesh(boxGeo(w - 0.05, 0.02, d - 0.08), M.metal || green, x, 1.5, z0 + d / 2));
      // las pertenencias: el sombrero en el estante, el poncho doblado y la guitarra o la bota
      fixed.add(mesh(cylGeo(0.2, 0.2, 0.02, 14), M.leather || M.black, x, 1.53, z0 + 0.3));
      fixed.add(mesh(cylGeo(0.11, 0.12, 0.12, 12), M.leather || M.black, x, 1.6, z0 + 0.3));
      fixed.add(mesh(boxGeo(0.5, 0.18, 0.36), [M.redCloth, M.packBlue || M.redCloth, M.sack || M.redCloth, M.redCloth][i] || M.redCloth, x, 0.12, z0 + 0.32));
      if (i % 2) fixed.add(mesh(boxGeo(0.12, 0.5, 0.18), M.leather || M.black, x + 0.18, 0.46, z0 + 0.3));
      else fixed.add(mesh(cylGeo(0.012, 0.012, 0.75, 5), M.silver || M.metal, x - 0.2, 0.62, z0 + 0.45, 0.3, 0, 0.2));
      // la puerta (se abre cuando el dueño la reclama): la chapa con el
      // nombre va sola; la hoja, las rejillas, la manija y el candado de las
      // cuatro están instanciados (lockerIM)
      const door = new THREE.Group();
      door.position.set(x - w / 2 + 0.02, 0, z0 + d + 0.012);
      const tex = canvasTex(256, 64, plateDraw(`Nº ${i + 1}`));
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.105), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      plate.position.set((w - 0.04) / 2, 1.5, 0.012);
      door.add(plate);
      this.root.add(door);
      // la luz de adentro (dorada) y el borde que se escapa por las rendijas
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), P.glowGold.clone());
      glow.position.set(x, fy + h / 2, z0 + 0.07);
      glow.visible = false;
      this.root.add(glow);
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.05, h + 0.05), P.rimGold.clone());
      rim.position.set(x, fy + h / 2, z0 + d + 0.002);
      rim.visible = false;
      this.root.add(rim);
      door.position.y = fy;
      const front = new THREE.Vector3(x, fy + 1.2, z0 + 1.35);
      this.lockers.push({ i, x, door, plate, tex, glow, rim, front, a: 0, shown: -1, name: '', k: 0 });
    }
    {
      const w = DEP.w;
      const h = DEP.h;
      const dw = w - 0.04;
      const nonIdx = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
      const vents = [];
      for (let v = 0; v < 5; v++) vents.push(boxGeo(0.4, 0.016, 0.01).clone().translate(dw / 2, h - 0.35 - v * 0.06, 0.012));
      const parts = [
        [nonIdx([boxGeo(dw, h - 0.04, 0.02).clone().translate(dw / 2, h / 2, 0)]), green],
        [nonIdx(vents), M.black],
        [nonIdx([boxGeo(0.04, 0.16, 0.04).clone().translate(dw - 0.1, 1.05, 0.03)]), M.iron],
        [nonIdx([boxGeo(0.09, 0.12, 0.05).clone().translate(dw - 0.1, 0.88, 0.04)]), M.brass],
      ];
      this.lockerIM = parts.map(([geo, mat]) => {
        const im = new THREE.InstancedMesh(geo, mat, DEP.n);
        im.frustumCulled = false;
        im.castShadow = true;
        im.receiveShadow = true;
        this.root.add(im);
        return im;
      });
      this.poseLockers(true);
    }
    this.fixed.add(fixed);
    W.addBox([x0 - span / 2 - 0.35, fy, z0, x0 + span / 2 + 0.35, fy + 2.4, z0 + DEP.d + 0.04], { kind: 'prop' });
    // la reja: dos hojas que revientan para afuera
    this.reja = [-1, 1].map((s) => {
      const leaf = new THREE.Group();
      leaf.position.set(x0 + s * (span / 2 + 0.25), fy, z0 + 0.92);
      const L = span / 2 + 0.22;
      const inner = new THREE.Group();
      inner.scale.x = -s;
      bars(inner, M, 0.02, L, 0, 2.7, 0.15, 0.04);
      // la cadena y el candado del medio
      inner.add(mesh(boxGeo(0.14, 0.2, 0.08), M.brass, L - 0.06, 1.2, 0.06));
      inner.add(mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 10), M.iron, L - 0.02, 1.36, 0.05));
      leaf.add(inner);
      mergeByMaterial(inner);
      this.root.add(leaf);
      return { leaf, s, a: 0, v: 0 };
    });
    this.rejaBox = W.addBox([x0 - span / 2 - 0.35, fy, z0 + 0.86, x0 + span / 2 + 0.35, fy + 2.9, z0 + 0.98], { kind: 'prop' });
    // (los costados de la jaula no se abren)
    for (const s of [-1, 1]) W.addBox([x0 + s * (span / 2 + 0.3) - 0.06, fy, z0, x0 + s * (span / 2 + 0.3) + 0.06, fy + 2.9, z0 + 0.98], { kind: 'prop' });
    // el chorro de luz que sale cuando se abre
    this.depBeamMat = beamMaterial(GOLD, 0);
    this.depBeam = new THREE.Mesh(coneGeo(1.6, 3.8), this.depBeamMat);
    this.depBeam.position.set(x0, fy + 1.5, z0 + 0.35);
    this.depBeam.rotation.set(0.14, Math.PI, 0);
    this.depBeam.renderOrder = 4;
    this.depBeam.visible = false;
    this.root.add(this.depBeam);
  }

  // Las puertas de los casilleros (la chapa y lo instanciado van juntos).
  poseLockers(force = false) {
    let moved = false;
    for (const L of this.lockers) {
      if (!force && L.shown === L.a) continue;
      L.shown = L.a;
      L.door.rotation.y = -L.a;
      L.door.updateMatrix();
      for (const im of this.lockerIM) im.setMatrixAt(L.i, L.door.matrix);
      moved = true;
    }
    if (!moved) return;
    for (const im of this.lockerIM) im.instanceMatrix.needsUpdate = true;
    this.shadowDirty = true;
  }

  // El nombre de cada dueño en su chapa.
  paintPlates() {
    this.lockers.forEach((L, i) => {
      const id = this.owners[i];
      const name = id == null ? `Nº ${i + 1}` : this.nameOf(id);
      if (L.name === name) return;
      L.name = name;
      const c = L.tex.userData.canvas;
      plateDraw(name.slice(0, 16), { font: name.length > 10 ? 'bold 24px Georgia, serif' : 'bold 30px Georgia, serif' })(c.getContext('2d'), c.width, c.height);
      L.tex.needsUpdate = true;
    });
  }

  nameOf(id) {
    const g = this.g;
    if (g.net) return g.net.nameOf(id);
    try {
      return localStorage.getItem('lm-zombies-name') || 'Vos';
    } catch {
      return 'Vos';
    }
  }

  updateDeposito(dt, t) {
    const g = this.g;
    // la reja: abierta revienta para afuera (con rebote), cerrada vuelve despacio
    const goal = this.dep ? 1.75 : 0;
    for (const r of this.reja) {
      if (this.dep) {
        r.v += (goal - r.a) * 30 * dt - r.v * 4.5 * dt;
        r.a += r.v * dt;
      } else r.a = Math.max(0, r.a - dt * 1.2);
      r.leaf.rotation.y = r.s * r.a;
    }
    const want = this.dep && this.claimed.some((c, i) => !c && this.owners[i] != null) ? 1 : 0;
    this.depK += (want - this.depK) * Math.min(1, dt * (want ? 2 : 0.7));
    const k = this.depK;
    this.depBeam.visible = k > 0.01;
    this.depBeamMat.uniforms.uOpacity.value = k * (0.13 + Math.sin(t * 2.4) * 0.03);
    for (const L of this.lockers) {
      const open = this.claimed[L.i] ? 1 : 0;
      L.a += (open * 1.95 - L.a) * Math.min(1, dt * 5);
      if (Math.abs(L.a - open * 1.95) < 0.001) L.a = open * 1.95;
      const mine = this.dep && !this.claimed[L.i] && this.owners[L.i] != null;
      L.k = Math.max(0, L.k - dt * 0.6);
      L.rim.visible = mine && k > 0.01;
      if (L.rim.visible) L.rim.material.opacity = k * (0.45 + 0.25 * Math.sin(t * 5 + L.i));
      L.glow.visible = L.k > 0.01;
      if (L.glow.visible) L.glow.material.opacity = L.k * L.k;
    }
    this.poseLockers();
    if (k > 0.3 && Math.random() < dt * 10) g.fx.sparkle(tmpV.set(DEP.x + (Math.random() - 0.5) * 3.4, this.depY + 0.3 + Math.random() * 2, DEP.z + 0.9), GOLD_RGB, 1, 0.3);
  }

  // ---------------- la luz del mapa ----------------
  // Las lámparas se ponen coloradas y laten como balizas; cada una vuelve con
  // el tablero de su parte del penal (y todas al final).
  updateLights(dt, t) {
    const W = this.g.world;
    const cut = this.cutOn && this.g.time >= this.cutAt;
    for (const L of this.lx) {
      const want = cut && !this.tab[L.sec]?.on ? 1 : 0;
      L.r += (want - L.r) * Math.min(1, dt * (want ? 4 : 2.5));
      if (L.flick > 0) L.flick -= dt;
      if (want === 0 && L.r < 0.004 && L.flick <= 0) {
        if (L.touched) this.resetLight(L);
        continue;
      }
      L.touched = true;
      const e = L.e;
      const def = e.def;
      const base = def.emergency && !W.power ? RED : tmpCol.set(def.color);
      e.light.color.copy(base).lerp(RED, L.r);
      // (late con la sirena, cada lámpara un poquito corrida: parece que gira)
      const s = this.pulseAt(t - (L.phase % 3) * 0.06);
      if (e.bulb) e.bulb.material.emissive.copy(e.light.color).multiplyScalar(1 + L.r * (0.2 + 2.6 * s));
      const normal = W.power ? e.base : e.base * def.noPower;
      let tgt = normal * (1 - L.r) + e.base * (0.1 + 1.55 * s) * L.r;
      if (L.flick > 0) tgt *= Math.random() < 0.45 ? 0.04 : 1.4;
      e.target = tgt;
    }
  }

  resetLight(L) {
    const W = this.g.world;
    const e = L.e;
    const def = e.def;
    L.touched = false;
    L.r = 0;
    e.light.color.set(def.emergency && !W.power ? 0xff2a1a : def.color);
    if (e.bulb) e.bulb.material.emissive.set(def.color);
    e.target = W.power ? e.base : e.base * def.noPower;
  }

  // ---------------- interacciones ----------------
  register() {
    const g = this.g;
    // los casilleros (cada uno el suyo: mantener F)
    for (const L of this.lockers) {
      const i = L.i;
      g.interact.add({
        kind: 'ee',
        hold: true,
        holdTime: 1.1,
        pos: L.front,
        radius: 1.3,
        prompt: () => {
          if (this.dep !== 1 || this.claimed[i] || this.owners[i] == null) return null;
          if (this.owners[i] !== this.myId()) return { text: `Casillero de ${this.nameOf(this.owners[i])}`, noCost: true, info: true };
          return { text: 'abrir tu casillero', hold: true, noCost: true };
        },
        cost: () => 0,
        use: () => this.claim(i, g.net?.useFrom ?? this.myId()),
      });
    }
    // los tableros: el rayo del alma (GauchoLife: mismo orden en todas las
    // compus) y, para el que anda en su cuerpo, que necesitan electricidad
    for (const t of this.tab) {
      g.vida?.addTarget({ pos: t.center, r: 0.6, on: () => this.active && t.spot >= 0 && !t.on, hit: () => this.energize(t.i) });
      t.it = g.interact.add({
        kind: 'ee',
        local: true,
        pos: t.center.clone(),
        radius: 1.8,
        prompt: () => (this.active && t.spot >= 0 && !t.on ? { text: 'Necesita electricidad', noCost: true, info: true } : null),
        cost: () => 0,
        use: () => false,
      });
    }
  }

  myId() {
    return this.g.net?.id ?? 0;
  }

  playerIds() {
    const g = this.g;
    if (!g.net) return [0];
    return [this.myId(), ...g.net.remote.keys()].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).slice(0, DEP.n);
  }

  distTo(x, z) {
    const p = this.g.player.pos;
    return Math.hypot(p.x - x, p.z - z);
  }

  // ---------------- la interfaz de g.defense ----------------
  // (Zombies.chase) Los del motín persiguen como siempre.
  goal() {
    return null;
  }

  zombieHit() {}

  // Mientras el Alcaide no llegó, la ronda no termina (Rounds.update).
  get holding() {
    return this.active && this.bossDue;
  }

  // Sin luz: las máquinas no se prenden con el rayo y las trampas no andan.
  get cut() {
    return this.cutOn;
  }

  // Entrar al gaucho life a mano no gasta carga (GauchoLife.tryEnter).
  get freeVida() {
    return this.active;
  }

  // Cirilo espera mientras el motín del easter egg está por venir o dura.
  eeLock() {
    if (this.g.net?.guest) return !!this.lockRemote;
    return this.pending || this.early || (this.active && this.forcedNow);
  }

  // ---------------- rondas ----------------
  onRound(R) {
    const g = this.g;
    if (this.active) return;
    const due = R.round >= this.every && R.round % this.every === 0 && R.round !== this.skipRound;
    if ((due || this.early) && !R.dogs && !this.ee.fight && g.state === 'playing') this.start(R);
  }

  onRoundEnd() {
    if (this.active) this.finish();
  }

  // (anfitrión) Soltaron a Anacleto: salta la alarma. Si todavía no hubo
  // motín (antes de la ronda 10), viene; desde ya Cirilo espera.
  expectEarly() {
    const R = this.g.rounds;
    if (this.forced || this.active || this.count > 0 || this.g.net?.guest || !R || R.round >= this.every) return false;
    this.pending = true;
    this.sync(true);
    return true;
  }

  // (anfitrión) Anacleto terminó de hablar (t segundos): ahí arranca.
  afterRelease(t) {
    if (!this.pending || this.g.net?.guest) return;
    this.g.later(t + 0.4, () => this.forceEarly());
  }

  forceEarly() {
    const g = this.g;
    const R = g.rounds;
    const was = this.pending;
    this.pending = false;
    if (this.forced || this.active || this.count > 0 || g.net?.guest || !R || R.round >= this.every) {
      if (was) this.sync(true);
      return;
    }
    this.forced = true;
    this.forcedNext = true;
    this.skipRound = this.every;
    // (en el descanso: arranca con la ronda que viene)
    if (R.state === 'active' && !this.ee.fight && g.state === 'playing') this.start(R);
    else {
      this.early = true;
      this.sync(true);
    }
  }

  // (anfitrión) Arranca el motín en esta ronda.
  start(R) {
    const g = this.g;
    if (this.active) return;
    this.active = true;
    this.early = false;
    this.pending = false;
    this.forcedNow = this.forcedNext;
    this.forcedNext = false;
    this.count++;
    this.round = R.round;
    this.t = 0;
    // la horda: más, de a montones y más seguido (más con más jugadores y en
    // cada motín que pasa)
    const extra = Math.max(0, this.ee.players() - 1);
    const more = this.count - 1;
    R.total = R.toSpawn = Math.round(R.total * (1.3 + extra * 0.25 + more * 0.15));
    R.capBonus = (R.capBonus || 0) + 2 + extra * 4 + more * 2;
    R.delay = Math.max(0.22, R.delay * 0.5);
    // (los primeros salen cuando revientan las celdas)
    R.spawnT = Math.max(R.spawnT || 0, CELL_AT + 0.5);
    R.bossPending = false;
    // el Alcaide: si ya anda suelto el de la ronda, es ese
    const zb = g.zombies.boss;
    if (zb && !zb.dead && zb.kind === 'alcaide') {
      this.bossZ = zb;
      this.bossSt = 1;
      this.bossDue = false;
      R.mini = zb;
    } else {
      this.bossZ = null;
      this.bossSt = 0;
      this.bossDue = true;
    }
    this.bossTry = 0;
    this.horde = 1;
    this.pickSpots();
    // se corta la luz: las máquinas con corriente se apagan
    const I = g.interact;
    this.cutList = [...I.perkMachines.filter((m) => m.powered && !m.gone).map((m) => m.perk), ...(I.pap?.powered ? ['pap'] : [])];
    this.cutOn = true;
    this.applyCut(true);
    // el depósito se vuelve a cerrar (los guardias confiscan de nuevo)
    this.dep = 0;
    this.owners = [];
    this.claimed = [false, false, false, false];
    this.startFx(false);
    g.later(2.1, () => this.active && g.say('alcaide', LINES.start));
    g.later(3.8, () => this.active && this.ee.announce('Tres tableros quemados: dales corriente desde el gaucho life', 4));
    this.sync(true);
  }

  // Las máquinas que se cortaron se apagan (on) o vuelven (en todas las compus).
  applyCut(on) {
    const I = this.g.interact;
    for (const id of this.cutList) {
      const m = id === 'pap' ? I.pap : I.perkMachines.find((x) => x.perk === id);
      if (m) m.powered = !on;
    }
    I.setPowerVisuals(this.g.world.power);
  }

  // (anfitrión) El rayo del alma le pegó a un tablero.
  energize(i) {
    const g = this.g;
    const t = this.tab[i];
    if (!this.active || !t || t.on || t.spot < 0) return;
    t.on = true;
    this.energizeFx(i);
    const n = this.tab.filter((x) => x.on).length;
    if (n === 3) g.later(1.1, () => this.allOn());
    else this.ee.toastAll(`Tablero de ${this.spots[t.spot].name}: ${n} de 3`);
    this.sync(true);
  }

  // (anfitrión) Los tres: vuelve la luz, las máquinas y las trampas.
  allOn() {
    if (!this.active || !this.cutOn) return;
    this.applyCut(false);
    this.cutOn = false;
    this.restoreFx();
    this.ee.toastAll('¡Volvió la luz!');
    this.sync(true);
  }

  // (anfitrión) Se larga el Alcaide.
  spawnBoss() {
    const g = this.g;
    const R = g.rounds;
    const b = g.zombies.spawnBoss(R.round, { kind: 'alcaide' });
    if (!b) {
      this.bossTry = 2;
      return;
    }
    this.bossZ = b;
    this.bossSt = 1;
    this.bossDue = false;
    R.mini = b;
    this.wail(3.5, 0.7);
    g.later(1.3, () => g.say('alcaide', LINES.boss));
    this.sync(true);
  }

  // (anfitrión) Terminó la ronda: cayó la horda y el Alcaide.
  finish() {
    const g = this.g;
    this.active = false;
    this.forcedNow = false;
    this.bossDue = false;
    const n = this.tab.filter((t) => t.on).length;
    // (si faltó algún tablero, la luz vuelve sola)
    if (this.cutOn) {
      this.applyCut(false);
      this.cutOn = false;
    }
    if (n === 3) {
      this.dep = 1;
      this.owners = this.playerIds();
      this.claimed = [false, false, false, false];
    }
    this.endFx(n, false);
    this.applyFin(n);
    if (n === 3) {
      this.openFx();
      g.later(3, () => this.ee.announce('El depósito del pabellón se abrió: buscá tu casillero', 5, true));
    } else if (n > 0) {
      // un power-up por tablero, cerca de los que quedaron de pie
      const c = this.teamCenter(tmpW);
      for (let k = 0; k < n; k++) {
        const at = new THREE.Vector3(c.x + Math.cos(k * 2.1) * 1.4, c.y, c.z + Math.sin(k * 2.1) * 1.4);
        g.later(1.5 + k * 0.5, () => g.powerups.drop(at, true));
      }
    }
    g.net?.event('ee', { mo: this.state(), mfin: n });
  }

  teamCenter(out) {
    const g = this.g;
    out.set(0, 0, 0);
    let n = 0;
    const add = (p) => {
      out.add(p);
      n++;
    };
    if (g.player.alive && !g.player.ghost) add(g.player.pos);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) add(r.pos);
    if (!n) return out.copy(g.player.pos);
    return out.multiplyScalar(1 / n);
  }

  // El premio de cada uno (en su compu): con uno o dos tableros, una carga más.
  applyFin(n) {
    const g = this.g;
    if (n > 0 && n < 3 && g.vida) {
      g.vida.charges = Math.min(g.vida.max, g.vida.charges + 1);
      g.vida.hud();
    }
  }

  // (anfitrión) Alguien quiere abrir su casillero.
  claim(i, by) {
    const g = this.g;
    if (this.dep !== 1 || this.claimed[i] || this.owners[i] !== by) return false;
    this.claimed[i] = true;
    this.lockerFx(i);
    if (by === this.myId()) this.loot(i);
    g.net?.event('ee', { mo: this.state(), mlo: [i, by] });
    return true;
  }

  // Lo que hay en tu casillero (en tu compu): un perk que no tengas, las
  // cargas del gaucho life llenas, munición y una tirada.
  loot() {
    const g = this.g;
    const W = g.weapons;
    const p = g.player;
    const missing = [...new Set(PERK_SPOTS.map((s) => s.perk))].filter((id) => PERKS[id] && !p.perks.has(id));
    const perk = missing.length ? missing[Math.floor(Math.random() * missing.length)] : null;
    if (g.vida) {
      g.vida.charges = g.vida.max;
      g.vida.hud();
    }
    W.maxAmmo();
    const sl = W.slot;
    const papId = sl?.id;
    const papUp = tierOf(sl?.up) + 1;
    const canPap = !!sl && sl.id !== 'hoz' && !WEAPONS[sl.id]?.wonder && tierOf(sl.up) < maxTier(sl.id);
    const canGut = !!WEAPONS.gut && !W.has('gut') && !W.has('gutacida');
    const pool = [['pap', canPap ? 4 : 0], ['gut', canGut ? 2.2 : 0], ['facon', W.bowie ? 0 : 1.8], ['plata', 3]].filter(([, w]) => w > 0);
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    let bonus = pool[pool.length - 1][0];
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) {
        bonus = k;
        break;
      }
    }
    const give = () => {
      if (bonus === 'pap' && W.has(papId)) W.give(papId, papUp);
      else if (bonus === 'gut') W.give('gut');
      else if (bonus === 'facon') W.giveBowie();
    };
    if (bonus === 'plata') g.addPoints(REWARD_PTS, null, true);
    const names = { pap: 'Pack-a-Pava', gut: 'Bombilla Gut', facon: BOWIE.name, plata: `+${REWARD_PTS}` };
    if (perk) {
      g.audio.perkJingle(perk, p.pos);
      W.drink(
        PERKS[perk].color,
        () => {
          p.givePerk(perk);
          give();
        },
        perk,
      );
    } else {
      g.addPoints(1500, null, true);
      give();
    }
    g.hud.toast(`Pertenencias: ${perk ? PERKS[perk].name : '+1500'} + ${names[bonus]}`);
  }

  // ---------------- lo que se ve y se oye ----------------
  startFx(instant) {
    const g = this.g;
    this.bakeSfx();
    this.alarmOn = true;
    this.sirenT0 = g.time;
    this.tab.forEach((t) => {
      t.grp.visible = t.spot >= 0;
      t.k = 0;
      t.onT = 0;
      this.poseBoard(t);
    });
    this.closeDeposit(instant);
    if (instant) {
      this.alarm = 1;
      this.cutAt = 0;
      this.burstCells(true);
      return;
    }
    // la sirena desde las tres torres (y de fondo, en todo el penal)
    for (const b of this.beacons) if (b.top) this.siren(tmpV.set(b.x, b.y, b.z), 9.5, 1.1);
    this.siren(null, 9.5, 0.35);
    this.banner('¡MOTÍN!', 'Se cortó la luz');
    this.flashEl?.classList.remove('is-on');
    void this.flashEl?.offsetWidth;
    this.flashEl?.classList.add('is-on');
    // el apagón grabado: titilan en sus chispazos y se cortan con el golpe
    // (si no bajó, el corte sintetizado de siempre al medio segundo)
    const rec = g.audio?.eventSfx?.('evento-apagon-penal', { gain: 1.1, reverb: 0.3 });
    const cutIn = rec ? APAGON_CUT : 0.5;
    if (rec) for (const s of APAGON_FLICKS) g.later(s, () => this.active && this.lx.forEach((L) => (L.flick = Math.max(L.flick, 0.12 + Math.random() * 0.2))));
    this.cutAt = g.time + cutIn;
    g.later(cutIn, () => {
      if (!rec) this.sfx('down', g.camera.position);
      for (const L of this.lx) L.flick = 0.55 + Math.random() * 0.4;
      g.fx.addShake(rec ? 0.25 : 0.15);
      this.cutSparks();
    });
    g.later(CELL_AT, () => this.active && this.burstCells(false));
  }

  // Chispazos donde se cortó: las máquinas que se apagan y los tableros que se queman.
  cutSparks() {
    const g = this.g;
    const I = g.interact;
    // las trampas eléctricas que estaban andando se cortan
    for (const tr of g.activities?.traps || []) if (tr.def?.power && tr.state === 'on') tr.t = 0;
    for (const id of this.cutList) {
      const m = id === 'pap' ? I.pap : I.perkMachines.find((x) => x.perk === id);
      if (!m) continue;
      const at = tmpV.copy(m.group.position).setY(m.group.position.y + 1.6);
      g.fx.electric(at, 14);
      g.fx.sparks(at, 2, SPARK_DIR, SPARK);
    }
    for (const t of this.tab) {
      if (t.spot < 0) continue;
      g.fx.sparks(t.center, 4, { x: 0, y: 0.5, z: 0 }, SPARK);
      g.fx.dust(t.center, { x: 0, y: 1, z: 0 }, [0.1, 0.09, 0.08], 10);
      if (this.distTo(t.center.x, t.center.z) < 16) this.sfx('pop', t.center);
    }
  }

  // Volvió la corriente en un tablero: la cuchilla sube, rayo azul y la luz de su parte.
  energizeFx(i, instant = false) {
    const g = this.g;
    const t = this.tab[i];
    t.onT = instant ? 9 : 0;
    for (const L of this.lx) if (L.sec === i && !instant) L.flick = 0.5 + Math.random() * 0.3;
    if (instant) return;
    const c = t.center;
    g.fx.lightning(tmpV.set(c.x, c.y + 1.8, c.z), c, BLUE, 0.35);
    g.fx.electric(c, 30);
    g.fx.flash(c, BLUE, 50, 0.5, 10);
    g.audio.powerOn?.(c);
  }

  // Volvieron las máquinas y las trampas.
  restoreFx() {
    const g = this.g;
    for (const L of this.lx) L.flick = Math.max(L.flick, 0.4 + Math.random() * 0.3);
    const I = g.interact;
    for (const id of this.cutList) {
      const m = id === 'pap' ? I.pap : I.perkMachines.find((x) => x.perk === id);
      if (m) g.fx.electric(tmpV.copy(m.group.position).setY(m.group.position.y + 1.6), 18);
    }
    this.sfx('up', g.camera.position);
  }

  // Terminó: las balizas se apagan, las celdas se cierran, los tableros se arreglan.
  endFx(n, instant) {
    const g = this.g;
    this.alarmOn = false;
    if (instant) {
      this.alarm = 0;
      this.closeCells(true);
      for (const t of this.tab) t.grp.visible = false;
      return;
    }
    this.banner('MOTÍN SOFOCADO', n === 3 ? 'Tres tableros: se abrió el depósito' : n ? `+1 carga y ${n} power-up${n > 1 ? 's' : ''}` : 'Volvió la luz', true);
    g.audio.sting();
    for (const L of this.lx) if (L.r > 0.05) L.flick = 0.4 + Math.random() * 0.4;
    // los que faltaban se arreglan solos (la luz vuelve sola)
    this.tab.forEach((t, i) => {
      if (!t.on && t.spot >= 0) g.later(0.4 + i * 0.25, () => !this.active && g.fx.electric(t.center, 12));
    });
    g.later(2.5, () => !this.active && this.closeCells(false));
    g.later(7, () => {
      if (this.active) return;
      for (const t of this.tab) t.grp.visible = false;
    });
  }

  // Revienta el depósito: la reja sale volando, la luz dorada y las chispas.
  openFx() {
    const g = this.g;
    const at = tmpV.set(DEP.x, this.depY + 1.4, DEP.z + 1);
    g.fx.flash(at, GOLD, 80, 1.2, 14);
    g.fx.sparkle(at, [1, 0.85, 0.4], 40, 2.4);
    g.fx.dust(tmpV.set(DEP.x, this.depY + 0.1, DEP.z + 1), { x: 0, y: 1, z: 0.5 }, [0.5, 0.45, 0.35], 14);
    for (const r of this.reja) r.v = 8;
    if (this.distTo(DEP.x, DEP.z) < 14) g.fx.addShake(0.3);
    this.sfx('burst', at);
    this.paintPlates();
  }

  closeDeposit(instant) {
    this.dep = 0;
    for (const r of this.reja) {
      if (instant) r.a = 0;
      r.v = 0;
    }
    this.paintPlates();
    this.setReja(false);
  }

  setReja(open) {
    if (!this.rejaBox || this.rejaBox.active === !open) return;
    this.rejaBox.active = !open;
    this.g.world.computeNavBlock();
  }

  lockerFx(i) {
    const g = this.g;
    const L = this.lockers[i];
    if (!L) return;
    L.k = 1;
    const at = tmpV.set(L.x, this.depY + 1.2, DEP.z + 0.7);
    g.fx.sparkle(at, [1, 0.85, 0.4], 30, 0.8);
    g.fx.flash(at, GOLD, 30, 0.8, 8);
    g.audio.boxOpen?.(at);
  }

  // El cartel grande del medio (arranca o termina).
  banner(title, sub, win = false) {
    const el = this.bannerEl;
    if (!el) return;
    el.querySelector('b').textContent = title;
    el.querySelector('span').textContent = sub;
    el.classList.toggle('is-win', win);
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  // ---------------- red ----------------
  state() {
    return {
      a: this.active ? 1 : 0,
      l: this.eeLock() ? 1 : 0,
      n: this.count,
      e: this.active ? +this.t.toFixed(1) : 0,
      sk: this.skipRound,
      s: this.tab.map((t) => t.spot),
      o: this.tab.map((t) => (t.on ? 1 : 0)),
      c: this.cutOn ? 1 : 0,
      cl: this.cutList,
      b: this.bossSt,
      h: Math.round(this.horde * 100),
      d: this.dep,
      w: this.owners,
      k: this.claimed.map((x) => (x ? 1 : 0)),
    };
  }

  sync(force = false) {
    const g = this.g;
    if (!g.net?.host) return;
    if (!force && !this.dirty) return;
    this.dirty = false;
    g.net.event('ee', { mo: this.state() });
  }

  // Un mensaje del canal 'ee' de PenalEgg con lo del motín.
  applyNet(m) {
    if (m.mwail) this.wailLocal(m.mwail);
    if (m.mo) this.applyRemote(m.mo, m);
  }

  // Lo que manda el anfitrión (m: el mensaje entero, por lo que pasa una vez).
  applyRemote(s, m = {}) {
    const g = this.g;
    const was = this.active;
    this.lockRemote = !!s.l;
    this.count = s.n || 0;
    this.skipRound = s.sk || 0;
    s.s?.forEach((sp, i) => {
      if (this.tab[i] && this.tab[i].spot !== sp) this.placeBoard(i, sp);
    });
    if (s.s) this.assignSectors();
    const late = (s.e || 0) > 3;
    if (s.a && !was) {
      this.active = true;
      this.t = s.e || 0;
      for (const t of this.tab) t.on = false;
      this.cutList = s.cl || [];
      this.startFx(late);
    }
    s.o?.forEach((on, i) => {
      const t = this.tab[i];
      if (!t) return;
      if (on && !t.on) {
        t.on = true;
        this.energizeFx(i, late && !was);
      } else if (!on) t.on = false;
    });
    if (s.c && !this.cutOn) {
      this.cutList = s.cl || [];
      this.cutOn = true;
      this.applyCut(true);
    } else if (!s.c && this.cutOn) {
      this.applyCut(false);
      this.cutOn = false;
      if (s.a) this.restoreFx();
    }
    this.bossSt = s.b || 0;
    this.horde = (s.h ?? 100) / 100;
    this.owners = s.w || [];
    if (s.d && !this.dep) {
      this.dep = 1;
      // (el que entra tarde lo encuentra abierto, sin el golpe)
      if (was) this.openFx();
      else for (const r of this.reja) r.a = 1.75;
    } else if (!s.d && this.dep) this.closeDeposit(false);
    this.paintPlates();
    s.k?.forEach((k, i) => {
      if (k && !this.claimed[i]) {
        this.claimed[i] = true;
        this.lockerFx(i);
      } else if (!k) this.claimed[i] = false;
    });
    if (!s.a && was) {
      this.active = false;
      this.endFx(m.mfin ?? this.tab.filter((t) => t.on).length, false);
    }
    if (m.mfin !== undefined) this.applyFin(m.mfin);
    if (m.mlo && m.mlo[1] === this.myId()) this.loot(m.mlo[0]);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    const host = !g.net?.guest;
    if (this.active) this.t += dt;
    if (host && this.active) this.think(dt);
    // la alarma (balizas y reflectores) sube y baja de a poco
    this.alarm += ((this.alarmOn ? 1 : 0) - this.alarm) * Math.min(1, dt * (this.alarmOn ? 1.6 : 0.8));
    if (this.alarm < 0.002 && !this.alarmOn) this.alarm = 0;
    this.updateBeacons(dt, t);
    this.updateReflectors(dt, t);
    this.updateLights(dt, t);
    this.updateAtmos(dt, t);
    this.updateHaze(dt);
    this.updateCells(dt);
    this.updateBoards(dt, t);
    this.updateDeposito(dt, t);
    this.setReja(this.dep === 1);
    // (las sombras son estáticas: se rehacen cuando las rejas dejan de moverse)
    if (this.shadowDirty) {
      this.shadowT = 0.3;
      this.shadowDirty = false;
    } else if (this.shadowT > 0) {
      this.shadowT -= dt;
      if (this.shadowT <= 0) g.renderer.shadowMap.needsUpdate = true;
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.15;
      this.updateHud();
    }
  }

  // (anfitrión) La horda, el Alcaide y lo que se manda a los invitados.
  think(dt) {
    const g = this.g;
    const R = g.rounds;
    this.hordeT -= dt;
    if (this.hordeT <= 0) {
      this.hordeT = 0.5;
      const h = R.total ? Math.max(0, Math.min(1, R.remainingTotal() / R.total)) : 0;
      if (Math.abs(h - this.horde) > 0.005) {
        this.horde = h;
        this.dirty = true;
      }
    }
    // de las celdas salen casi todos mientras haya alguien cerca del pabellón
    this.shareT -= dt;
    if (this.shareT <= 0) {
      this.shareT = 0.5;
      let near = this.distTo(46, 35) < 40 && g.player.pos.z < 100;
      if (!near && g.net) for (const r of g.net.remote.values()) if (!r.dead && Math.hypot(r.pos.x - 46, r.pos.z - 35) < 40) near = true;
      this.cellShare = near ? 0.8 : 0.15;
    }
    if (this.bossDue) {
      this.bossTry -= dt;
      const out = R.total ? (R.total - R.toSpawn) / R.total : 1;
      const need = BOSS_AT[Math.min(1, this.count - 1)];
      const ready = this.t > CELL_AT + 3 && ((out >= need && this.t >= BOSS_MIN_T) || (R.toSpawn <= 0 && g.zombies.alive <= 3));
      if (ready && this.bossTry <= 0 && R.state === 'active') this.spawnBoss();
    } else if (this.bossSt === 1 && (!this.bossZ || this.bossZ.dead || g.zombies.boss !== this.bossZ)) {
      this.bossSt = 2;
      this.dirty = true;
    }
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 1;
      this.sync();
    }
  }

  // Los tableros: chispas y humo mientras están quemados; la cuchilla sube
  // y la luz se pone azul cuando vuelve la corriente.
  updateBoards(dt, t) {
    const g = this.g;
    for (const b of this.tab) {
      if (!b.grp.visible) continue;
      b.onT += dt;
      const want = b.on || (!this.active && b.spot >= 0) ? 1 : 0;
      b.k += (want - b.k) * Math.min(1, dt * 6);
      this.poseBoard(b);
      if (b.on || !this.active) {
        b.glow.material.opacity = Math.max(0, 0.7 - b.onT * 0.5);
        continue;
      }
      // titila y escupe chispas (cerca se oyen)
      const fl = 0.3 + Math.random() * 0.35 + (Math.sin(t * 23 + b.i) > 0.7 ? 0.35 : 0);
      b.glow.material.opacity = fl * 0.6;
      b.inMat.emissiveIntensity = 0.45 + fl;
      b.lampMat.emissiveIntensity = Math.sin(t * 9) > 0 ? 3 : 0.2;
      b.sparkT -= dt;
      if (b.sparkT <= 0) {
        b.sparkT = 0.25 + Math.random() * 0.9;
        const c = b.center;
        g.fx.sparks(c, 1, SPARK_DIR, SPARK);
        if (Math.random() < 0.5) g.fx.electric(c, 4);
        if (Math.random() < 0.6) g.fx.dust(tmpV.set(c.x, c.y + 0.35, c.z), UP_DIR, SMOKE, 2);
        if (Math.random() < 0.5 && this.distTo(c.x, c.z) < 12) this.sfx('crackle', c);
      }
    }
  }

  poseBoard(b) {
    const k = b.k;
    b.blades.rotation.x = (1 - k) * 2.5;
    b.door.rotation.y = -1.72 + k * 0.08;
    if (k > 0.5) {
      b.inMat.emissive.setHex(0x3a9cff);
      b.inMat.emissiveIntensity = 0.7;
      b.lampMat.emissive.setHex(0x40ff6a);
      b.lampMat.emissiveIntensity = 2.2;
      b.glow.material.color.setHex(BLUE);
    } else {
      b.inMat.emissive.setHex(0xff5a10);
      b.lampMat.emissive.setHex(0xff2010);
      b.glow.material.color.setHex(0xff7a2a);
    }
  }

  // ---------------- el cartel ----------------
  buildHud() {
    const g = this.g;
    const root = g.hud?.root;
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'mdu-motin';
    el.innerHTML = `<b><i></i>MOTÍN</b><small>Presos sueltos</small><div class="mdu-motin__bar"><s></s></div><ul>${this.tab.map(() => '<li><i></i><span></span></li>').join('')}</ul><p class="mdu-motin__boss"></p><em></em>`;
    root.appendChild(el);
    const banner = document.createElement('div');
    banner.className = 'mdu-motin-banner';
    banner.innerHTML = '<b></b><span></span>';
    root.appendChild(banner);
    const flash = document.createElement('div');
    flash.className = 'mdu-motin-flash';
    root.appendChild(flash);
    this.hudEl = el;
    this.bannerEl = banner;
    this.flashEl = flash;
    this.hud = { bar: el.querySelector('s'), lis: [...el.querySelectorAll('li')], boss: el.querySelector('.mdu-motin__boss'), em: el.querySelector('em'), key: '' };
  }

  updateHud() {
    const h = this.hud;
    if (!h) return;
    const on = this.active && this.g.state === 'playing';
    this.hudEl.classList.toggle('is-on', on);
    if (!on) return;
    const w = `${Math.round(this.horde * 100)}%`;
    if (h.bar.style.width !== w) h.bar.style.width = w;
    const key = this.tab.map((t) => `${t.spot}${t.on ? 1 : 0}`).join('') + this.bossSt + (this.g.vida?.active ? 'v' : '');
    if (key === h.key) return;
    h.key = key;
    this.tab.forEach((t, i) => {
      const li = h.lis[i];
      li.classList.toggle('is-on', t.on);
      li.querySelector('span').textContent = this.spots[t.spot]?.name || '';
    });
    h.boss.textContent = this.bossSt === 0 ? 'El Alcaide: en camino' : this.bossSt === 1 ? 'El Alcaide: suelto' : 'El Alcaide: caído';
    h.boss.className = `mdu-motin__boss is-${this.bossSt}`;
    h.em.textContent = this.g.vida?.active ? 'Tableros: el rayo los prende' : `${keyLabel('vida')}: gaucho life gratis`;
  }

  // ---------------- sonidos ----------------
  // La sirena de mano: sube y baja (un lamento cada 3 s).
  siren(pos, dur, gain) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const c = a.ctx;
    const t = a.now;
    const o = a.out({ pos, gain, reverb: 0.7, ref: pos ? 18 : 2.2 });
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.8);
    env.gain.setValueAtTime(1, t + dur - 1.2);
    env.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(env).connect(o);
    for (const [type, det, gg] of [['sawtooth', 0, 0.1], ['square', 9, 0.05], ['triangle', -1200, 0.08]]) {
      const osc = c.createOscillator();
      osc.type = type;
      osc.detune.value = det;
      const og = c.createGain();
      og.gain.value = gg;
      const P = osc.frequency;
      P.setValueAtTime(380, t);
      for (let k = 0; k * 3 < dur; k++) {
        P.linearRampToValueAtTime(1080, t + k * 3 + 1.6);
        P.linearRampToValueAtTime(380, t + k * 3 + 3);
      }
      osc.connect(og).connect(f);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  // Un lamento corto de la sirena (cuando llega el Alcaide), en todas las compus.
  wail(dur, gain) {
    this.wailLocal(dur, gain);
    this.g.net?.event('ee', { mwail: dur });
  }

  wailLocal(dur, gain = 0.7) {
    for (const b of this.beacons) if (b.top) this.siren(tmpV.set(b.x, b.y, b.z), dur, gain);
  }

  // Los que suenan seguido (las chispas de los tableros, las rejas de las
  // celdas) se hornean una vez y después se tocan grabados: armar el grafo de
  // ruido y filtros en cada uno le pesa al audio en las compus flojas.
  bakeSfx() {
    const a = this.g.audio;
    if (this.baked || !a?.ctx || !a.bakeSound) return;
    this.baked = true;
    const me = this;
    for (const [kind, dur, takes] of [['crackle', 0.2, 3], ['clang', 1.6, 3], ['shut', 0.7, 2], ['pop', 0.4, 1]]) {
      a.bakeSound(`motin-${kind}`, dur, function (o, t) {
        me.sfxBody(kind, this, o, t);
      }, takes);
    }
  }

  sfxBody(kind, a, o, t) {
    if (kind === 'clang') {
      // la reja que revienta contra la pared
      a.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 2400, freqEnd: 1500, q: 5, gain: 0.7 });
      a.tone(o, { t, dur: 1.1, type: 'triangle', freq: 330 + Math.random() * 60, freqEnd: 300, gain: 0.22, release: 1.4 });
      a.tone(o, { t, dur: 0.8, type: 'square', freq: 517 + Math.random() * 40, freqEnd: 490, gain: 0.05 });
      a.noise(o, { t, dur: 0.25, freq: 400, freqEnd: 90, gain: 0.8, brown: true });
    } else if (kind === 'shut') {
      a.noise(o, { t, dur: 0.2, type: 'bandpass', freq: 1800, q: 4, gain: 0.5 });
      a.tone(o, { t, dur: 0.6, type: 'triangle', freq: 280 + Math.random() * 30, freqEnd: 260, gain: 0.12 });
    } else if (kind === 'pop') {
      a.noise(o, { t, dur: 0.3, type: 'highpass', freq: 2500, gain: 0.7 });
      a.tone(o, { t, dur: 0.2, freq: 140, freqEnd: 50, gain: 0.6 });
    } else if (kind === 'crackle') {
      for (let k = 0; k < 3; k++) a.noise(o, { t: t + k * 0.04 + Math.random() * 0.03, dur: 0.05, type: 'highpass', freq: 3000 + Math.random() * 2000, gain: 0.5 });
    }
  }

  sfx(kind, pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const SET = { clang: [1, 0.5, 4], shut: [0.7, 0.4, 3], pop: [1, 0.4, 2.2], crackle: [0.45, 0.1, 2.2] }[kind];
    if (SET) {
      this.bakeSfx();
      const buf = a.bakedBuf?.(`motin-${kind}`);
      if (buf) a.playBuffer(buf, { pos, gain: SET[0], reverb: SET[1], ref: SET[2] });
      else this.sfxBody(kind, a, a.out({ pos, gain: SET[0], reverb: SET[1], ref: SET[2] }), t);
      return;
    }
    if (kind === 'down') {
      // se corta la luz: el zumbido que cae y el golpe del disyuntor
      const o = a.out({ gain: 0.9, reverb: 0.6 });
      a.tone(o, { t, dur: 0.25, freq: 75, freqEnd: 30, gain: 0.9 });
      a.noise(o, { t, dur: 0.5, freq: 1600, freqEnd: 80, gain: 0.7, brown: true });
      a.tone(o, { t: t + 0.05, dur: 1.9, type: 'sawtooth', freq: 120, freqEnd: 16, gain: 0.22 });
    } else if (kind === 'up') {
      const o = a.out({ gain: 0.7, reverb: 0.7 });
      a.tone(o, { t, dur: 2.2, type: 'sawtooth', freq: 30, freqEnd: 120, gain: 0.18, attack: 0.6 });
      a.tone(o, { t: t + 0.1, dur: 0.3, freq: 90, freqEnd: 40, gain: 0.6 });
    } else if (kind === 'burst') {
      // revienta el depósito: el golpe de la reja y un acorde de premio
      const o = a.out({ pos, gain: 1, reverb: 0.7, ref: 5 });
      a.noise(o, { t, dur: 0.6, freq: 900, freqEnd: 120, gain: 0.9, brown: true });
      a.noise(o, { t, dur: 0.4, type: 'bandpass', freq: 2200, q: 4, gain: 0.6 });
      const m = a.out({ gain: 0.5, reverb: 0.9 });
      for (const [k, f] of [[0, 523.25], [0.08, 659.25], [0.16, 783.99], [0.24, 1046.5]]) a.tone(m, { t: t + 0.25 + k, dur: 2.2, freq: f, gain: 0.12, release: 2.6 });
    }
  }

  // ---------------- prueba ----------------
  // Alt+I (core/music.js): el motín ya, con la ronda en curso.
  debugStart() {
    const g = this.g;
    g.godMode = true;
    const R = g.rounds;
    if (R.state !== 'active') {
      R.breakT = 0;
      R.nextRound();
    }
    this.start(R);
  }

  dispose() {
    const g = this.g;
    this.alarm = 0;
    this.alarmOn = false;
    // (el material de los reflectores es del caché de la utilería: vuelve a como estaba)
    for (const r of this.refl || []) {
      r.s.userData.speed = r.speed0;
      r.head.rotation.x = r.pitch0;
    }
    if (this.reflMat) {
      this.reflMat.uniforms.uColor.value.copy(this.reflCol0);
      this.reflMat.uniforms.uOpacity.value = this.reflOp0;
    }
    for (const L of this.lx) if (L.touched) this.resetLight(L);
    if (this.atmos) {
      const W = g.world;
      W.hemiBase = this.atmos.hemi;
      if (W.ambient) {
        W.ambient.intensity = this.atmos.amb;
        W.ambient.color.copy(this.atmos.col);
      }
      this.atmos = null;
    }
    this.hudEl?.remove();
    this.bannerEl?.remove();
    this.flashEl?.remove();
    this.hud = null;
    this.root.removeFromParent();
    if (g.defense === this) g.defense = null;
  }
}
