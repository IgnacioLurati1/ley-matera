import * as THREE from 'three';
import { ZONES, DOORS } from '../../config/map';
import { PORTALS } from '../../config/maps/eclipse';
import { buildProp } from '../../world/props';
import { isHost, myId } from './common';

// Cosas para hacer en cada rincón (iteración 4; el usuario: "hay muchas zonas
// del mapa que no ofrecen prácticamente nada más que ver y ya está"). En las
// zonas que no tenían nada, algo propio de su mapa de origen:
//  - trampa: una palanca en la pared; pagás y por unos segundos el lugar de
//    adelante mata a los muertos que lo pisan (la caldera del molino, las
//    duchas del penal, la fragua y el glaciar del castillo, el silo de La
//    Tapera, el pararrayos de la torre). Lo decide el anfitrión.
//  - compra: algo para tomar o comer (el Malbec de la bodega, el choripán del
//    parque...): te cura entera y por 30 s te recuperás aunque te peguen. Es de
//    cada uno (local).
//  - secreto: algo escondido que se hace una vez por partida (enderezar una
//    cruz, abrir la caja fuerte del Alcaide, hacer sonar la campana a tiros...):
//    puntos para el que lo encontró y un potenciador ahí mismo. Lo decide el
//    anfitrión ('pee' k 'rinc').
//  - lore: algo para leer (la carta de Belgrano...), corto; la primera vez,
//    unos puntos. Local.
// Todo se arma en la carga (sin luces nuevas), contra una pared libre de la
// zona que se elige igual en todas las compus. globalThis.__mduNoRincones ===
// true: no se arma nada.

// (zona, qué, cerca de dónde: [x, z] opcional; si no, el medio de la zona)
const SPOTS = [
  // trampas
  { k: 'trampa', zone: 'nF', name: 'la caldera', fx: 'vapor', obj: 'palanca' },
  { k: 'trampa', zone: 'pD', name: 'el agua hirviendo', fx: 'vapor', obj: 'palanca', near: [132, 300] },
  { k: 'trampa', zone: 'kC', name: 'la fragua', fx: 'fuego', obj: 'palanca' },
  { k: 'trampa', zone: 'kI', name: 'el glaciar', fx: 'hielo', obj: 'palanca' },
  { k: 'trampa', zone: 'gF', name: 'el silo', fx: 'polvo', obj: 'palanca' },
  { k: 'trampa', zone: 'tP8', name: 'el pararrayos', fx: 'chispa', obj: 'palanca' },
  // compras (cada uno lo suyo)
  { k: 'compra', zone: 'kR', name: 'un vaso de Malbec', obj: 'botella', cost: 750 },
  { k: 'compra', zone: 'kM', name: 'agua de las termas', obj: 'balde', cost: 750 },
  { k: 'compra', zone: 'pF', name: 'el botiquín', obj: 'botiquin', cost: 750 },
  { k: 'compra', zone: 'mG', name: 'un choripán', obj: 'plato', cost: 750 },
  { k: 'compra', zone: 'D', name: 'un mate cocido', obj: 'taza', cost: 500 },
  { k: 'compra', zone: 'gT', name: 'una torta frita', obj: 'plato', cost: 500 },
  // secretos (uno por partida)
  { k: 'secreto', zone: 'nI', name: 'la cruz torcida', act: 'hold', hold: 3, verb: 'enderezar la cruz', obj: 'cruz', drop: 'maxammo', done: 'La cruz, derecha. El peón descansa.' },
  { k: 'secreto', zone: 'F', name: 'la tumba removida', act: 'hold', hold: 4, verb: 'cavar', obj: 'tumba', drop: 'insta', done: 'Había algo enterrado.' },
  { k: 'secreto', zone: 'pE', name: 'la caja fuerte', act: 'hold', hold: 5, verb: 'forzar la caja fuerte', obj: 'caja', drop: 'double', pts: 1000, done: 'La caja del Alcaide, abierta.' },
  { k: 'secreto', zone: 'pG', name: 'la campana', act: 'tiro', hits: 3, obj: 'campana', drop: 'nuke', done: 'La campana suena. Los muertos se caen.' },
  { k: 'secreto', zone: 'mE', near: [250, 238], name: 'el espejo', act: 'tiro', hits: 3, obj: 'espejo', drop: 'firesale', done: 'El espejo se rompe. Detrás, algo.' },
  { k: 'secreto', zone: 'kP', name: 'el preso olvidado', act: 'hold', hold: 3, verb: 'soltar al preso', obj: 'preso', drop: 'maxammo', done: 'Las cadenas caen.' },
  { k: 'secreto', zone: 'kO', near: [140, 27], name: 'el libro abierto', act: 'hold', hold: 3, verb: 'cerrar el libro', obj: 'libro', drop: 'double', done: 'El libro se cierra solo.' },
  { k: 'secreto', zone: 'tP14', name: 'la aureola', act: 'tiro', hits: 3, obj: 'aureola', drop: 'nuke', done: 'La aureola cae. El santo mira.' },
  { k: 'secreto', zone: 'pJ', name: 'la red', act: 'hold', hold: 3, verb: 'levantar la red', obj: 'red', drop: 'maxammo', done: 'En la red, algo brilla.' },
  { k: 'secreto', zone: 'kS', name: 'la herradura', act: 'hold', hold: 2, verb: 'dar vuelta la herradura', obj: 'herradura', drop: 'double', done: 'Herradura para arriba: suerte.' },
  { k: 'secreto', zone: 'G2', name: 'la bolsa rota', act: 'hold', hold: 3, verb: 'revisar la bolsa', obj: 'bolsa', drop: 'insta', done: 'Entre la yerba, algo.' },
  { k: 'secreto', zone: 'pI', name: 'el raído', act: 'hold', hold: 3, verb: 'abrir el raído', obj: 'bolsa', drop: 'maxammo', done: 'El raído de un mensú.' },
  // lore (local)
  { k: 'lore', zone: 'mD', name: 'una carta', obj: 'nota', text: ['"Siendo preciso enarbolar bandera..."', 'M. Belgrano, Rosario, 1812.'] },
  { k: 'lore', zone: 'kF', name: 'el juramento', obj: 'nota', text: ['"Ningún caballero toma mate solo."', 'Grabado en la piedra.'] },
  { k: 'lore', zone: 'pT', name: 'el cartel', obj: 'nota', text: ['Telesilla del Cerro: fuera de servicio.', 'El cable se cortó con la ronda.'] },
  { k: 'lore', zone: 'nG', name: 'la libreta', obj: 'nota', text: ['Acopio, marzo de 1911: 40 raídos.', 'Uno no volvió del monte.'] },
  { k: 'lore', zone: 'cB3', name: 'el diario', obj: 'nota', text: ['"La luna se partió y el agua no corre."', 'El barraquero.'] },
  { k: 'lore', zone: 'mF', name: 'la placa', obj: 'nota', text: ['Las banderas de América.', 'Todas miran al mismo cielo roto.'] },
];

// las trampas: precio, segundos prendida, descanso, radio del lugar que mata
// (las celdas del mundo: world/World.js CELL; sin importarlo para no atar el módulo al mundo)
const CELL = { FLOOR: 1, WALL: 2 };
const TRAP_COST = 1000;
const TRAP_ON = 15;
const TRAP_CD = 50;
const TRAP_R = 2.6;
const TRAP_AHEAD = 2.8;
const TRAP_KILL_T = 0.4;
const TRAP_COL = { vapor: 0xd8e4ff, fuego: 0xff7a2a, hielo: 0x8ad8ff, polvo: 0xd8b070, chispa: 0x9ac8ff };
// las compras: la cura y el aguante
const BUFF_T = 30;
const BUFF_HP = 10;
const BUFF_CD = 45;
const SECRET_PTS = 500;
const LORE_PTS = 100;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function rayHits(origin, dir, maxT, center, r) {
  const t = tmpV.subVectors(center, origin).dot(dir);
  if (t < 0 || t > maxT + r) return false;
  return tmpV2.copy(origin).addScaledVector(dir, t).distanceTo(center) < r;
}

export default class Rincones {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.list = [];
    this.buffT = 0;
    this.time = 0;
    if (globalThis.__mduNoRincones === true) return;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'eclipse:rincones';
    this.mats = this.makeMats();
    this.used = [];
    SPOTS.forEach((S, i) => {
      // (si no hay lugar libre de todo, uno que solo pida la pared y la celda propia sin cajas)
      const at = this.spotIn(S.zone, S.near) || this.spotIn(S.zone, S.near, true);
      if (!at) {
        console.warn('[rincones] sin lugar en', S.zone);
        return;
      }
      const R = { ...S, i, at, on: 0, cd: 0, found: false, hitsN: 0, read: false, flash: 0, inside: new Map() };
      this.build(R);
      this.list.push(R);
    });
    g.scene.add(this.root);
  }

  get host() {
    return isHost(this.g);
  }

  makeMats() {
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1 });
    return {
      iron: M(0x3a3c40, { r: 0.55, m: 0.7 }),
      rust: M(0x6a3a22, { r: 0.9, m: 0.3 }),
      red: M(0x8a1c14, { r: 0.6 }),
      brass: M(0xb08a3a, { r: 0.35, m: 0.8 }),
      wood: M(0x5a3a22),
      dark: M(0x1a1410),
      paper: M(0xe8dcc0, { r: 0.95 }),
      glass: M(0x2a4a2a, { r: 0.15, m: 0.1 }),
      wine: M(0x4a0a14, { r: 0.3 }),
      white: M(0xe8e8e0, { r: 0.7 }),
      bone: M(0xb8ab8c, { r: 0.9 }),
      dirt: M(0x3a2a1a, { r: 1 }),
      gold: M(0xd8b048, { r: 0.3, m: 0.9, e: 0x3a2a08, ei: 1 }),
      mirror: M(0xb8c8d8, { r: 0.08, m: 0.95 }),
      food: M(0x9a5a2a, { r: 0.7 }),
      sack: M(0xa89070, { r: 1 }),
      rope: M(0x8a7a5a, { r: 1 }),
      // el anillo de las trampas en el piso (como la del desgarro, tenue)
      ring: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    };
  }

  // Una celda de la zona contra una pared, libre (sin cajas, lejos de puertas,
  // portales y de lo que ya se usa), la más cerca de `near` (o del medio).
  spotIn(zone, near, relaxed = false) {
    const g = this.g;
    const w = g.world;
    const Z = ZONES[zone];
    if (!Z) return null;
    let cx = 0;
    let cz = 0;
    let n = 0;
    const cells = [];
    for (const r of Z.rects) {
      for (let x = r[0]; x <= r[2]; x++) {
        for (let z = r[1]; z <= r[3]; z++) {
          if (!w.inside(x, z)) continue;
          const i = w.idx(x, z);
          if (w.grid[i] !== CELL.FLOOR || w.zoneKeys[w.zone[i]] !== zone || w.rampAt[i] >= 0) continue;
          cells.push([x, z, i]);
          cx += x + 0.5;
          cz += z + 0.5;
          n++;
        }
      }
    }
    if (!n) return null;
    const tx = near ? near[0] : cx / n;
    const tz = near ? near[1] : cz / n;
    const avoid = [];
    for (const it of g.interact.list) if (it.pos) avoid.push([it.pos.x, it.pos.z, 2.4]);
    for (const D of DOORS) for (const c of D.cells) avoid.push([c[0] + 0.5, c[1] + 0.5, 2.2]);
    for (const P of PORTALS) for (const e of [P.a, P.b]) avoid.push([e.pos[0], e.pos[1], 3.5]);
    for (const u of this.used) avoid.push([u[0], u[1], 3]);
    let best = null;
    let bd = Infinity;
    for (const [x, z, i] of cells) {
      const fy = w.fy[i];
      // la pared al lado (la primera que haya, en orden fijo)
      let wall = null;
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (!w.inside(x + dx, z + dz)) continue;
        const t = w.grid[w.idx(x + dx, z + dz)];
        if (t === CELL.WALL) {
          wall = [dx, dz];
          break;
        }
      }
      if (!wall) continue;
      // la celda de enfrente (hacia la sala) también tiene que ser piso de la zona
      const fx = x - wall[0];
      const fz = z - wall[1];
      if (!w.inside(fx, fz)) continue;
      const fi = w.idx(fx, fz);
      if (w.grid[fi] !== CELL.FLOOR || w.zoneKeys[w.zone[fi]] !== zone || Math.abs(w.fy[fi] - fy) > 0.3) continue;
      // (y dos más: nunca en un pasillo angosto, donde taparía el paso)
      if (!relaxed) {
        let deep = true;
        for (const k of [2, 3]) {
          const qx = x - wall[0] * k;
          const qz = z - wall[1] * k;
          const qi = w.inside(qx, qz) ? w.idx(qx, qz) : -1;
          if (qi < 0 || w.grid[qi] !== CELL.FLOOR || w.zoneKeys[w.zone[qi]] !== zone) deep = false;
        }
        if (!deep) continue;
      }
      const px = x + 0.5;
      const pz = z + 0.5;
      // (el más cercano gana: el que ya queda más lejos ni se prueba; las cajas
      // eran ~0,4 s de la carga. agente rend; __mduNoRinconFast: como antes)
      if (globalThis.__mduNoRinconFast !== true && Math.hypot(px - tx, pz - tz) >= bd) continue;
      if (avoid.some(([ax, az, r]) => Math.hypot(px - ax, pz - az) < (relaxed ? Math.min(r, 1.6) : r))) continue;
      // sin cajas encima (la utilería del mapa) en la celda y la de enfrente
      const busy = (qx, qz) => w.boxes.some((b) => b.active !== false && qx + 0.45 > b.x0 && qx - 0.45 < b.x1 && qz + 0.45 > b.z0 && qz - 0.45 < b.z1 && b.y1 > fy + 0.15 && b.y0 < fy + 1.9);
      if (busy(px, pz) || (!relaxed && busy(fx + 0.5, fz + 0.5))) continue;
      const d = Math.hypot(px - tx, pz - tz);
      if (d < bd) {
        bd = d;
        best = { x: px + wall[0] * 0.18, z: pz + wall[1] * 0.18, y: fy, face: [-wall[0], -wall[1]], rot: Math.atan2(-wall[0], -wall[1]) };
      }
    }
    if (best) this.used.push([best.x, best.z]);
    return best;
  }

  // ---------------- lo que se ve ----------------
  build(R) {
    const g = this.g;
    const m = this.mats;
    const grp = new THREE.Group();
    grp.position.set(R.at.x, R.at.y, R.at.z);
    grp.rotation.y = R.at.rot;
    const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.castShadow = true;
      grp.add(o);
      return o;
    };
    const cyl = (rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = 12) => {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.castShadow = true;
      grp.add(o);
      return o;
    };
    // una mesita (de props.js) para lo que se toma o se come
    const table = () => {
      const res = buildProp({ type: 'table', pos: [0, 0], rot: 0 }, g.world.M, 900 + R.i);
      if (res) {
        res.obj.scale.setScalar(0.62);
        res.obj.position.set(0, 0, 0.1);
        grp.add(res.obj);
        grp.updateMatrixWorld(true);
        const h = new THREE.Box3().setFromObject(res.obj).max.y - R.at.y;
        if (h > 0.2 && h < 1.2) return h;
      }
      return 0.5;
    };
    let hitAt = null;
    let boxes = [[-0.4, 0, -0.35, 0.4, 1.0, 0.25]];
    switch (R.obj) {
      case 'palanca': {
        // el gabinete de la palanca en la pared, con su chapa
        box(0.7, 1.0, 0.24, m.iron, 0, 1.25, -0.2);
        box(0.6, 0.16, 0.02, m.brass, 0, 1.84, -0.08);
        // la chapa del color de lo que larga (vapor, fuego, hielo...)
        const plate = box(0.5, 0.5, 0.02, new THREE.MeshStandardMaterial({ color: TRAP_COL[R.fx] || 0xffffff, roughness: 0.5, emissive: TRAP_COL[R.fx] || 0xffffff, emissiveIntensity: 0.25 }), 0, 1.25, -0.075);
        R.plate = plate;
        const lever = cyl(0.03, 0.03, 0.6, m.rust, 0.42, 1.25, -0.12, 0, 0, 0.5, 8);
        lever.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), m.red));
        lever.children[0].position.y = 0.25;
        R.lever = lever;
        cyl(0.04, 0.04, 2.4, m.iron, -0.36, 1.2, -0.25, 0, 0, 0, 8);
        // el lugar que mata: adelante, un anillo tenue en el piso
        const ring = new THREE.Mesh(new THREE.RingGeometry(TRAP_R - 0.12, TRAP_R, 48).rotateX(-Math.PI / 2), m.ring.clone());
        ring.material.color.setHex(TRAP_COL[R.fx] || 0xffffff);
        const a = new THREE.Vector3(R.at.face[0] * TRAP_AHEAD, 0, R.at.face[1] * TRAP_AHEAD);
        R.area = new THREE.Vector3(R.at.x + a.x, 0, R.at.z + a.z);
        R.area.y = g.world.floorAt(R.area.x, R.area.z, R.at.y + 1);
        ring.position.set(R.area.x, R.area.y + 0.04, R.area.z);
        this.root.add(ring);
        R.ring = ring;
        boxes = [[-0.3, 0.75, -0.32, 0.3, 1.65, -0.05]];
        break;
      }
      case 'botella': {
        const h = table();
        cyl(0.05, 0.06, 0.3, m.glass, -0.08, h + 0.15, 0.1);
        cyl(0.018, 0.02, 0.1, m.glass, -0.08, h + 0.35, 0.1);
        cyl(0.04, 0.03, 0.1, m.wine, 0.12, h + 0.05, 0.05);
        break;
      }
      case 'balde': {
        cyl(0.22, 0.18, 0.32, m.iron, 0, 0.16, 0.1, 0, 0, 0, 16);
        cyl(0.2, 0.2, 0.02, m.mirror, 0, 0.3, 0.1, 0, 0, 0, 16);
        boxes = [[-0.25, 0, -0.15, 0.25, 0.35, 0.35]];
        break;
      }
      case 'botiquin': {
        box(0.5, 0.4, 0.18, m.white, 0, 1.35, -0.2);
        box(0.2, 0.06, 0.01, m.red, 0, 1.35, -0.1);
        box(0.06, 0.2, 0.01, m.red, 0, 1.35, -0.1);
        boxes = [[-0.28, 1.1, -0.3, 0.28, 1.6, -0.1]];
        break;
      }
      case 'plato': {
        const h = table();
        cyl(0.16, 0.12, 0.03, m.white, 0, h + 0.02, 0.08, 0, 0, 0, 16);
        box(0.22, 0.06, 0.07, m.food, 0, h + 0.06, 0.08, 0, 0.3, 0);
        break;
      }
      case 'taza': {
        const h = table();
        cyl(0.06, 0.05, 0.1, m.white, 0, h + 0.05, 0.08, 0, 0, 0, 14);
        cyl(0.05, 0.05, 0.005, m.food, 0, h + 0.1, 0.08, 0, 0, 0, 14);
        break;
      }
      case 'cruz': {
        // una cruz de fierro torcida (se endereza)
        const c = new THREE.Group();
        c.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.06), m.rust));
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.06), m.rust);
        t.position.y = 0.3;
        c.add(t);
        c.position.set(0, 0.6, 0.35);
        c.rotation.set(0.25, 0, 0.42);
        grp.add(c);
        R.cross = c;
        box(0.9, 0.12, 1.6, m.dirt, 0, 0.06, 0.6);
        boxes = [[-0.35, 0, 0.1, 0.35, 1.2, 0.6]];
        break;
      }
      case 'tumba': {
        box(0.9, 0.35, 1.8, m.dirt, 0, 0.17, 0.95, 0.06, 0, 0);
        box(0.5, 0.7, 0.1, m.iron, 0, 0.5, 0.05, 0.1, 0, 0.12);
        R.mound = grp.children[grp.children.length - 2];
        boxes = [[-0.45, 0, 0, 0.45, 0.4, 1.85]];
        break;
      }
      case 'caja': {
        box(0.7, 0.85, 0.6, m.iron, 0, 0.43, 0.05);
        box(0.55, 0.65, 0.02, m.dark, 0, 0.45, 0.36);
        R.door = cyl(0.07, 0.07, 0.04, m.brass, 0.12, 0.5, 0.38, Math.PI / 2, 0, 0, 16);
        boxes = [[-0.36, 0, -0.26, 0.36, 0.88, 0.37]];
        break;
      }
      case 'campana': {
        // colgada de una ménsula en la pared, alta
        box(0.08, 0.08, 0.7, m.wood, 0, 2.6, 0.1);
        const bell = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.45], [0.08, 0.44], [0.16, 0.36], [0.2, 0.15], [0.28, 0.0], [0.3, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 18), m.brass);
        bell.position.set(0, 2.05, 0.4);
        bell.castShadow = true;
        grp.add(bell);
        R.bell = bell;
        hitAt = new THREE.Vector3(0, 2.25, 0.4);
        boxes = [];
        break;
      }
      case 'espejo': {
        // un espejo de pie, apoyado (de marco hasta el piso, con dos patas)
        box(0.9, 1.9, 0.06, m.wood, 0, 0.95, -0.1, -0.08, 0, 0);
        const glass = box(0.76, 1.72, 0.02, m.mirror, 0, 0.97, -0.065, -0.08, 0, 0);
        for (const sx of [-0.38, 0.38]) box(0.06, 0.06, 0.5, m.wood, sx, 0.03, 0.05);
        R.glass = glass;
        hitAt = new THREE.Vector3(0, 1.1, -0.05);
        boxes = [[-0.45, 0, -0.2, 0.45, 1.9, 0.3]];
        break;
      }
      case 'preso': {
        // los huesos de un preso sentado contra la pared, con sus cadenas
        const sk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), m.bone);
        sk.scale.set(0.9, 1.05, 1);
        sk.position.set(0.04, 0.82, -0.04);
        sk.rotation.z = 0.3;
        grp.add(sk);
        // las costillas y la columna, los brazos colgando de las cadenas, las piernas estiradas
        cyl(0.025, 0.025, 0.5, m.bone, 0, 0.5, -0.12, 0.1, 0, 0, 6);
        for (let k = 0; k < 4; k++) box(0.26 - k * 0.03, 0.025, 0.12, m.bone, 0, 0.62 - k * 0.07, -0.08);
        for (const sx of [-1, 1]) {
          cyl(0.02, 0.02, 0.42, m.bone, sx * 0.17, 0.82, -0.14, 0, 0, sx * 0.5, 6);
          cyl(0.022, 0.022, 0.5, m.bone, sx * 0.09, 0.1, 0.15, Math.PI / 2 - 0.1, 0, 0, 6);
        }
        box(0.18, 0.06, 0.12, m.dirt, 0, 0.27, -0.05);
        for (const s of [-1, 1]) {
          cyl(0.015, 0.015, 0.6, m.iron, s * 0.28, 0.95, -0.15, 0, 0, s * 0.4, 6);
          cyl(0.05, 0.05, 0.05, m.iron, s * 0.4, 1.22, -0.2, Math.PI / 2, 0, 0, 10);
        }
        boxes = [[-0.3, 0, -0.25, 0.3, 1.0, 0.4]];
        break;
      }
      case 'libro': {
        const res = buildProp({ type: 'desk', pos: [0, 0], rot: 0 }, g.world.M, 700 + R.i);
        let h = 0.78;
        if (res) {
          res.obj.position.set(0, 0, 0.15);
          grp.add(res.obj);
          grp.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(res.obj);
          h = bb.max.y - R.at.y;
          if (!(h > 0.3 && h < 1.4)) h = 0.78;
        }
        for (const s of [-1, 1]) box(0.22, 0.02, 0.3, m.paper, s * 0.12, h + 0.02, 0.15, 0, 0, s * -0.12);
        box(0.48, 0.03, 0.32, m.red, 0, h + 0.005, 0.15);
        break;
      }
      case 'aureola': {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 28), m.gold);
        halo.position.set(0, 2.5, 0.15);
        grp.add(halo);
        R.halo = halo;
        hitAt = new THREE.Vector3(0, 2.5, 0.15);
        boxes = [];
        break;
      }
      case 'red': {
        const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8, 6, 4), new THREE.MeshStandardMaterial({ color: 0x6a5a40, wireframe: true }));
        net.position.set(0, 0.25, 0.4);
        net.rotation.x = -1.2;
        grp.add(net);
        box(1.0, 0.05, 0.05, m.wood, 0, 0.6, 0.0);
        boxes = [[-0.6, 0, 0, 0.6, 0.6, 0.8]];
        break;
      }
      case 'herradura': {
        cyl(0.05, 0.05, 1.3, m.wood, 0, 0.65, 0.1, 0, 0, 0, 8);
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 16, Math.PI * 1.25), m.iron);
        h.position.set(0, 1.2, 0.16);
        h.rotation.z = Math.PI + 0.5;
        grp.add(h);
        R.shoe = h;
        boxes = [[-0.1, 0, 0, 0.1, 1.3, 0.2]];
        break;
      }
      case 'bolsa': {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), m.sack);
        s.scale.set(1, 0.7, 0.8);
        s.position.set(0, 0.28, 0.25);
        s.castShadow = true;
        grp.add(s);
        cyl(0.04, 0.12, 0.25, m.rope, 0, 0.62, 0.25, 0, 0, 0.2, 8);
        boxes = [[-0.4, 0, -0.1, 0.4, 0.6, 0.6]];
        break;
      }
      case 'nota': {
        // un atril con un papel (la carta, el cartel)
        cyl(0.03, 0.04, 1.0, m.wood, 0, 0.5, 0.15, 0, 0, 0, 8);
        box(0.42, 0.3, 0.03, m.wood, 0, 1.08, 0.18, -0.6, 0, 0);
        box(0.36, 0.25, 0.01, m.paper, 0, 1.09, 0.2, -0.6, 0, 0);
        boxes = [[-0.2, 0, 0, 0.2, 1.2, 0.3]];
        break;
      }
    }
    grp.updateMatrixWorld(true);
    this.root.add(grp);
    R.grp = grp;
    // las cajas (choque), en mundo
    const c = Math.cos(R.at.rot);
    const s = Math.sin(R.at.rot);
    for (const [x0, y0, z0, x1, y1, z1] of boxes) {
      let a = Infinity;
      let b = -Infinity;
      let cc = Infinity;
      let d = -Infinity;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const wx = R.at.x + x * c + z * s;
        const wz = R.at.z - x * s + z * c;
        a = Math.min(a, wx);
        b = Math.max(b, wx);
        cc = Math.min(cc, wz);
        d = Math.max(d, wz);
      }
      g.world.addBox([a, R.at.y + y0, cc, b, R.at.y + y1, d], { kind: 'prop' });
    }
    if (hitAt) R.hitAt = grp.localToWorld(hitAt.clone());
    // el interactuable
    const front = new THREE.Vector3(R.at.x + R.at.face[0] * 0.6, R.at.y + 1, R.at.z + R.at.face[1] * 0.6);
    if (R.k === 'trampa') this.addTrap(R, front);
    else if (R.k === 'compra') this.addBuy(R, front);
    else if (R.k === 'secreto' && R.act === 'hold') this.addSecret(R, front);
    else if (R.k === 'lore') this.addLore(R, front);
  }

  addTrap(R, pos) {
    const g = this.g;
    g.interact.add({
      kind: 'eclipse-rincon',
      pos,
      radius: 1.8,
      prompt: () => {
        if (R.on > 0) return null;
        if (R.cd > 0) return { text: `${cap(R.name)}: ${Math.ceil(R.cd)} s`, noCost: true, info: true };
        if (!g.world.power) return { text: 'Necesita electricidad', noCost: true, info: true };
        return `prender ${R.name}`;
      },
      cost: () => TRAP_COST,
      use: () => {
        if (R.on > 0 || R.cd > 0 || !g.world.power) return false;
        if (this.host) this.send({ i: R.i, a: 'on' });
        return true;
      },
    });
  }

  addBuy(R, pos) {
    const g = this.g;
    g.interact.add({
      kind: 'eclipse-rincon',
      local: true,
      pos,
      radius: 1.8,
      prompt: () => (R.cd > 0 ? { text: `${cap(R.name)}: ${Math.ceil(R.cd)} s`, noCost: true, info: true } : `tomar ${R.name}`),
      cost: () => R.cost,
      use: () => {
        if (R.cd > 0) return false;
        R.cd = BUFF_CD;
        this.buff();
        return true;
      },
    });
  }

  addSecret(R, pos) {
    const g = this.g;
    g.interact.add({
      kind: 'eclipse-rincon',
      pos,
      radius: 1.7,
      prompt: () => (R.found ? null : { text: R.verb, noCost: true, hold: true }),
      cost: () => 0,
      holdTime: R.hold || 3,
      use: () => {
        if (R.found) return false;
        if (this.host) this.send({ i: R.i, a: 'se', by: g.net?.useFrom ?? myId(g) });
        return true;
      },
    });
  }

  addLore(R, pos) {
    const g = this.g;
    g.interact.add({
      kind: 'eclipse-rincon',
      local: true,
      pos,
      radius: 1.6,
      prompt: () => ({ text: `leer ${R.name}`, noCost: true }),
      cost: () => 0,
      use: () => {
        g.hud?.subtitle?.(R.text[0], 4);
        if (R.text[1]) g.later?.(1.2, () => g.hud?.subtitle?.(R.text[1], 3.5));
        if (!R.read) {
          R.read = true;
          g.addPoints?.(LORE_PTS, null, true);
        }
        return true;
      },
    });
  }

  // ---------------- la red ----------------
  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'rinc', ...m });
  }

  apply(m) {
    const R = this.list.find((x) => x.i === m.i);
    if (!R) return;
    if (m.a === 'on') this.trapOn(R);
    else if (m.a === 'off') this.trapOff(R);
    else if (m.a === 'se') this.reveal(R, m.by);
  }

  // (un invitado pidió: el anfitrión decide)
  onGuest(m, from) {
    const R = this.list.find((x) => x.i === m.i);
    if (!R) return;
    if (m.a === 'hit' && R.k === 'secreto' && !R.found) this.send({ i: R.i, a: 'se', by: from });
  }

  state() {
    return { rc: { tp: this.list.filter((R) => R.k === 'trampa').map((R) => [R.i, +R.on.toFixed(1), +R.cd.toFixed(1)]), sc: this.list.filter((R) => R.k === 'secreto' && R.found).map((R) => R.i) } };
  }

  applyFull(rc) {
    if (!rc) return;
    for (const [i, on, cd] of rc.tp || []) {
      const R = this.list.find((x) => x.i === i);
      if (!R) continue;
      R.on = on;
      R.cd = cd;
    }
    for (const i of rc.sc || []) {
      const R = this.list.find((x) => x.i === i);
      if (R && !R.found) this.reveal(R, null, true);
    }
  }

  // ---------------- las trampas ----------------
  trapOn(R) {
    const g = this.g;
    R.on = TRAP_ON;
    R.cd = 0;
    R.inside.clear();
    if (R.lever) R.lever.rotation.z = -0.5;
    g.fx.flash?.(tmpV.copy(R.area).setY(R.area.y + 1), TRAP_COL[R.fx] || 0xffffff, 5, 0.35, 10);
    g.fx.addShake?.(0.08);
    if (R.fx === 'vapor') g.audio?.kettle?.(R.area, 2);
    g.hud?.subtitle?.(`${cap(R.name)}, prendida.`, 2);
  }

  trapOff(R) {
    R.on = 0;
    R.cd = TRAP_CD;
    R.inside.clear();
    if (R.lever) R.lever.rotation.z = 0.5;
  }

  trapFx(R) {
    const g = this.g;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * TRAP_R * 0.9;
    const p = tmpV.set(R.area.x + Math.cos(a) * r, R.area.y + 0.15, R.area.z + Math.sin(a) * r);
    if (R.fx === 'vapor') g.fx.steam?.(p, 3, 0.5);
    else if (R.fx === 'fuego') g.fx.fire?.(p, 0.5, 2);
    else if (R.fx === 'hielo') g.fx.frost?.(p, 6);
    else if (R.fx === 'polvo') g.fx.dust?.(p.setY(p.y + 1.6 * Math.random()), UP, [0.75, 0.6, 0.35], 6);
    else if (R.fx === 'chispa') {
      g.fx.electric?.(p.setY(p.y + 0.4), 5);
      if (Math.random() < 0.12) g.fx.lightning?.(tmpV2.set(p.x, p.y + 4, p.z), p, 0x9ac8ff, 0.2);
    }
  }

  // ---------------- los secretos ----------------
  onShot(origin, dir, maxT) {
    for (const R of this.list) {
      if (R.k !== 'secreto' || R.act !== 'tiro' || R.found || !R.hitAt) continue;
      if (!rayHits(origin, dir, maxT, R.hitAt, 0.45)) continue;
      R.hitsN++;
      R.flash = 1;
      this.g.fx.sparks?.(R.hitAt, 1, UP);
      if (R.bell) this.g.audio?.door?.(R.hitAt, false);
      if (R.hitsN < R.hits) continue;
      if (this.host) this.send({ i: R.i, a: 'se', by: myId(this.g) });
      else this.g.net?.net?.send({ t: 'pee', k: 'rinc', i: R.i, a: 'hit', from: myId(this.g) });
    }
  }

  reveal(R, by, quiet = false) {
    if (R.found) return;
    R.found = true;
    const g = this.g;
    // lo que cambia a la vista
    if (R.cross) R.cross.rotation.set(0, 0, 0);
    if (R.mound) R.mound.scale.y = 0.25;
    if (R.door) R.door.rotation.y = 1.2;
    if (R.glass) R.glass.visible = false;
    if (R.halo) R.halo.visible = false;
    if (R.shoe) R.shoe.rotation.z = 0.5;
    if (quiet) return;
    const at = R.hitAt ? R.hitAt.clone() : new THREE.Vector3(R.at.x + R.at.face[0] * 1.2, R.at.y + 1, R.at.z + R.at.face[1] * 1.2);
    g.fx.sparkle?.(at, [1, 0.85, 0.4], 18, 0.8);
    g.hud?.subtitle?.(R.done, 3);
    if (by != null && by === myId(g)) g.addPoints?.(R.pts || SECRET_PTS, null, true);
    // el potenciador, en el piso delante (lo tira el anfitrión: viaja solo)
    if (this.host && R.drop) {
      const p = new THREE.Vector3(R.at.x + R.at.face[0] * 1.3, R.at.y, R.at.z + R.at.face[1] * 1.3);
      g.later?.(0.6, () => g.powerups?.drop?.(p, true, R.drop));
    }
  }

  // ---------------- las compras ----------------
  buff() {
    const g = this.g;
    const P = g.player;
    P.health = P.maxHealth;
    P.stamina = Math.max(P.stamina || 0, 3);
    this.buffT = BUFF_T;
    g.hud?.hurt?.(0);
    g.hud?.subtitle?.('Te cae bien. Aguantás más.', 2.5);
  }

  update(dt) {
    if (!this.list.length) return;
    const g = this.g;
    this.time += dt;
    const P = g.player;
    if (this.buffT > 0) {
      this.buffT -= dt;
      if (P && !P.downed && P.health < P.maxHealth) P.health = Math.min(P.maxHealth, P.health + BUFF_HP * dt);
    }
    for (const R of this.list) {
      if (R.k === 'compra') {
        if (R.cd > 0) R.cd = Math.max(0, R.cd - dt);
        continue;
      }
      if (R.k === 'secreto') {
        if (R.flash > 0) {
          R.flash = Math.max(0, R.flash - dt * 3);
          if (R.bell) R.bell.rotation.z = Math.sin(this.time * 18) * 0.25 * R.flash;
        }
        continue;
      }
      if (R.k !== 'trampa') continue;
      if (R.cd > 0) R.cd = Math.max(0, R.cd - dt);
      const on = R.on > 0;
      R.ring.material.opacity = on ? 0.45 + 0.2 * Math.sin(this.time * 9) : R.cd > 0 ? 0.04 : 0.12;
      if (!on) continue;
      R.on -= dt;
      if (R.on <= 0 && this.host) {
        this.send({ i: R.i, a: 'off' });
        continue;
      }
      // lo que se ve, en todas las compus (unas cuantas por cuadro)
      for (let k = 0; k < 2; k++) this.trapFx(R);
      if (!this.host) continue;
      // los muertos que lo pisan, un instante, caen
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || z.jinete) continue;
        const d = Math.hypot(z.pos.x - R.area.x, z.pos.z - R.area.z);
        if (d > TRAP_R || Math.abs(z.pos.y - R.area.y) > 1.6) {
          R.inside.delete(z.id);
          continue;
        }
        const s = (R.inside.get(z.id) || 0) + dt;
        R.inside.set(z.id, s);
        if (s < TRAP_KILL_T) continue;
        R.inside.delete(z.id);
        g.zombies.kill?.(z, { type: 'blast', point: z.pos.clone() });
      }
    }
  }

  // (pruebas) todos los secretos a mano
  debugAll() {
    for (const R of this.list) if (R.k === 'secreto' && !R.found) this.send({ i: R.i, a: 'se', by: myId(this.g) });
  }

  dispose() {
    if (this.root) this.g.scene.remove(this.root);
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
