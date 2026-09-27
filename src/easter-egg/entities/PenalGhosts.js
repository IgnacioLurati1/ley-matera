import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePose, solvePose, solveExtras, PART_COUNT } from './skeleton';
import { buildMate } from '../weapons/viewmodels';
import { ghostMaterial, warmObject } from '../fx/ghostMat';

// Lo del penal que solo se ve desde el gaucho life (entities/GauchoLife.js):
//  · Las tres calaveras de ánima: escondidas en el mapa (el secadero, la horca
//    del patio y la cruz de la capilla). Con el cuerpo no se ven, pero el
//    cuchillo de Anacleto (weapons/Cuchillo.js) las rompe igual: hay que
//    encontrarlas de alma y volver con el cuchillo. Rotas las tres, en el
//    escritorio del Alcaide aparece una Bombilla Gut gratis: una sola, para el
//    primero que la agarre, y no vuelve (los demás, de la caja).
//  · Los rastros de los presos muertos: lo que escribieron en las paredes,
//    las manos, la ronda de pisadas del patio, los presos que siguen sentados
//    donde estaban y ánimas que flotan.
// Todo con el material de fx/ghostMat.js, que queda compilado desde que se
// arma el mapa (con uOn en 0 no dibuja nada): entrar al alma no traba.
// En línea las calaveras y la bombilla las decide el anfitrión.

const GHOST = 0x3a8cff;
// dónde está cada calavera; rope: de dónde cuelga (la altura del palo o la soga)
const SKULLS = [
  { where: 'el secadero', pos: [46.2, 4.32, 62], rope: 4.9 },
  { where: 'la horca del patio', pos: [62.6, 7.12, 49.2], rope: 8.8 },
  { where: 'la cruz de la capilla', pos: [62.5, 13.05, 11.12] },
];
const SKULL_R = 0.6;
// (el doble de una de verdad: si no, de lejos es una bolita de luz)
const SKULL_K = 1.9;
// la Bombilla Gut del Alcaide: acostada en el escritorio de la oficina
const GUT_AT = [50.25, 8.95, 18.1];
// lo que escribieron los presos: [texto, punto adentro, hacia dónde está la pared, ancho, manos]
const WRITINGS = [
  ['Cien años sin mate. Cien años sin salir.', [56, 5.7, 36], [1, 0, 0], 1.55, 2],
  ['ACÁ ESTUVO CIRILO', [22.4, 1.6, 67.6], [-1, 0, 0], 1.6, 1],
  ['Guiso de los jueves: 5.217 jueves', [34, 5.8, 49.8], [-1, 0, 0], 1.9, 1],
  ['Benito no está loco', [35, 9.8, 22], [0, 0, 1], 1.7, 2],
  ['San La Muerte, llevame con vos', [60, 10, 17], [-1, 0, 0], 1.9, 1],
  ['La yerba del secadero sabe a nosotros', [45, 1.8, 63.5], [0, 0, -1], 1.9, 1],
  ['El Alcaide nunca tomó un mate', [53, 9.8, 19.6], [1, 0, 0], 1.9, 0],
  ['El Gil nos mira', [27, 5.8, 36], [0, 0, 1], 1.6, 2],
];
// las rayitas de los días (en el pabellón, al lado de la frase)
const TALLY = [[51.5, 5.4, 34], [0, 0, -1], 1.4];
// los presos que siguen ahí: [x, z, yaw, pose]
const SITTING = { hipY: 0.5, hipLp: -1.45, hipRp: -1.45, knL: 1.45, knR: 1.45, torsoP: 0.12, shLp: -0.9, shRp: -0.9, elL: -0.75, elR: -0.75, headP: 0.35 };
const PRESOS = [
  // el comedor, cada uno en su banco
  [34.4, 44.28, 0, SITTING],
  [43.3, 49.22, Math.PI, { ...SITTING, headP: 0.1, shRp: -1.2, elR: -1.4 }],
  // rezando de rodillas frente al altar de la capilla
  [62.5, 14.3, Math.PI, { hipY: 0.5, hipLp: 0.12, hipRp: 0.12, knL: 1.62, knR: 1.62, torsoP: 0.32, headP: 0.6, shLp: -0.85, shRp: -0.85, shLr: -0.25, shRr: 0.25, elL: -1.6, elR: -1.6 }],
  // sentado en la cama de la enfermería, con la cabeza gacha
  [38.85, 16.1, Math.PI / 2, { ...SITTING, hipY: 0.72, torsoP: 0.45, headP: 0.55, shLp: -0.45, shRp: -0.45, elL: -0.9, elR: -0.9 }],
  // en la punta del muelle, con las piernas colgando sobre el río
  [51.5, 90.72, 0, { hipY: 0.13, hipLp: -1.4, hipRp: -1.5, knL: 1.5, knR: 1.35, torsoP: 0.2, headP: -0.1, shLp: 0.25, shRp: 0.25, shLr: 0.35, shRr: -0.35 }],
  // frente al santuario del patio
  [59.65, 46.4, -Math.PI / 2, { headP: 0.45, torsoP: 0.1, shLp: -0.7, shRp: -0.7, shLr: -0.22, shRr: 0.22, elL: -1.5, elR: -1.5 }],
  // bajo la ducha, quieto
  [25.5, 33.7, 0, { headP: 0.55, torsoP: 0.05, shLr: 0.05, shRr: -0.05 }],
];
// Nicanor, el compañero de celda de Cirilo: hecho un bollito en la celda
// abierta del fondo de los calabozos. Es el que sabe dónde está la llave de
// Cirilo y solo le habla al alma (acercarse y mirarlo desde el gaucho life).
// Dos poses: hecho un bollito y, cuando habla, con la cabeza levantada.
const NICANOR = { x: 17.9, z: 71.6, yaw: Math.PI / 2 };
const NIC_POSES = [
  { hipY: 0.14, hipLp: -1.95, hipRp: -1.95, knL: 2.35, knR: 2.35, torsoP: 0.55, headP: 0.65, shLp: -1.05, shRp: -1.05, elL: -0.55, elR: -0.55 },
  { hipY: 0.14, hipLp: -1.8, hipRp: -1.9, knL: 2.2, knR: 2.3, torsoP: 0.12, headP: -0.2, headY: 0.15, shLp: -0.95, shRp: -1.35, shRr: -0.25, elL: -0.6, elR: -0.25 },
];
const NIC_LINES = {
  // antes de que Cirilo mande a nadie
  early: ['Cien años acá adentro... El Cirilo, el de la celda de al lado, todavía espera que alguien le hable. Andá con él primero.'],
  tell: [
    '¿Me ves? Hace cien años que nadie me ve... Soy Nicanor. ¿Te manda el Cirilo?',
    'Yo vi todo. Su llave se la colgó el Alcaide del cinturón, ese porteño. Con balas no sale: hay que derretirle el llavero.',
    'Ácido, gaucho. La Bombilla Gut sale de la caja. El kit de ácido se arma en la mesa de la enfermería, y el encierro de acá, de los calabozos, le da de comer. Después, un frasco en el Alcaide... y el llavero al piso.',
  ],
  again: ['Ácido en el Alcaide, gaucho. El kit en la mesa de la enfermería y el encierro de acá, de los calabozos.'],
  // (Cirilo ya salió)
  free: ['El Cirilo ya está afuera... Gracias, gaucho. Algún día me va a tocar a mí.'],
};
const NIC_TOLD = 'Nicanor contó dónde está la llave de Cirilo: colgada del cinturón del Alcaide. Hay que derretirle el llavero con ácido (Bombilla Gut + kit de la enfermería + encierro de los calabozos).';

// la ronda del patio (una hora de sol por día, dando vueltas)
const RONDA = { x: 66, z: 47, rx: 3, rz: 2.2, n: 30 };
// las ánimas que flotan: [x, y, z]
const WISPS = [
  [60, 10.6, 15], [65, 10.2, 20.5], [62.5, 11.4, 22.5],
  [22, 1.9, 55], [22, 1.7, 74.5], [44.2, 2.6, 67.5],
  [40, 1.3, 84], [46, 1.6, 86.5], [56, 1.1, 84.5],
  [66, 5.9, 47], [40, 10, 20.5], [48, 5.6, 46.5],
];

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

// Una malla lista para fundir: sin índice y solo posición, normal y uv.
function plain(geo) {
  let g2 = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g2.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g2.deleteAttribute(k);
  if (!g2.attributes.normal) g2.computeVertexNormals();
  if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
  return g2;
}

// ---------------- los dibujos (una sola textura) ----------------
// 1024x1280: las frases en cuadros de 512x256 (dos por fila, cuatro filas) y
// abajo la pisada, la mano y las rayitas.
const TW = 512;
const TH = 256;
const AW = 1024;
const AH = 1280;
function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = AW;
  c.height = AH;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, AW, AH);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // la frase partida en renglones que entren en el cuadro, con la letra más grande que se pueda
  const layout = (text) => {
    for (let size = 104; size > 30; size -= 4) {
      x.font = `bold ${size}px Georgia, serif`;
      const lines = [];
      let cur = '';
      for (const w of text.split(' ')) {
        const next = cur ? `${cur} ${w}` : w;
        if (x.measureText(next).width > TW - 40 && cur) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      lines.push(cur);
      if (lines.every((l) => x.measureText(l).width <= TW - 40) && lines.length * size * 1.08 <= TH - 30) return { size, lines };
    }
    return { size: 30, lines: [text] };
  };
  WRITINGS.forEach(([text], k) => {
    const ox = (k % 2) * TW;
    const oy = Math.floor(k / 2) * TH;
    const { size, lines } = layout(text);
    x.font = `bold ${size}px Georgia, serif`;
    const lh = size * 1.08;
    const top = oy + (TH - lines.length * lh) / 2 + size * 0.82;
    lines.forEach((line, li) => {
      // rayado a mano: cada letra un poco torcida y repasada
      let px = ox + TW / 2 - x.measureText(line).width / 2;
      for (const ch of line) {
        const cw = x.measureText(ch).width;
        x.save();
        x.translate(px + cw / 2, top + li * lh + (rnd() - 0.5) * size * 0.08);
        x.rotate((rnd() - 0.5) * 0.14);
        x.fillStyle = '#fff';
        x.fillText(ch, -cw / 2, 0);
        x.strokeStyle = 'rgba(255,255,255,0.5)';
        x.lineWidth = 2;
        x.strokeText(ch, -cw / 2 + 2, -1.5);
        x.restore();
        px += cw;
      }
    });
    // unos rayones sueltos
    x.strokeStyle = 'rgba(255,255,255,0.3)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const sx = ox + 30 + rnd() * (TW - 60);
      const sy = oy + 20 + rnd() * (TH - 40);
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + (rnd() - 0.5) * 60, sy + (rnd() - 0.5) * 24);
      x.stroke();
    }
  });
  const B = 4 * TH;
  // la pisada (una bota: suela y taco), en [0, B, 128, 256]
  x.fillStyle = '#fff';
  x.beginPath();
  x.ellipse(64, B + 78, 46, 70, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(64, B + 200, 34, 40, 0, 0, Math.PI * 2);
  x.fill();
  // la mano abierta, en [144, B, 256, 256]
  const hx = 272;
  const hy = B + 170;
  x.beginPath();
  x.ellipse(hx, hy, 56, 62, 0, 0, Math.PI * 2);
  x.fill();
  x.lineCap = 'round';
  x.strokeStyle = '#fff';
  [[-40, -62, -48, -128], [-14, -70, -15, -150], [13, -70, 15, -146], [38, -60, 46, -120], [-54, -8, -104, -56]].forEach(([a, b, c2, d], i) => {
    x.lineWidth = i === 4 ? 32 : 26;
    x.beginPath();
    x.moveTo(hx + a, hy + b);
    x.lineTo(hx + c2, hy + d);
    x.stroke();
  });
  // las rayitas de a cinco, en [416, B, 608, 256]
  x.lineWidth = 10;
  for (let gI = 0; gI < 6; gI++) {
    const bx = 436 + gI * 98;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(bx + i * 17 + (rnd() - 0.5) * 4, B + 50);
      x.lineTo(bx + i * 17 + (rnd() - 0.5) * 6, B + 200);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(bx - 10, B + 180);
    x.lineTo(bx + 68, B + 70);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
// rectángulos de la textura (en píxeles, y desde arriba)
const R_TILE = (k) => [(k % 2) * TW, Math.floor(k / 2) * TH, TW, TH];
const R_FOOT = [0, 4 * TH, 128, 256];
const R_HAND = [144, 4 * TH, 256, 256];
const R_TALLY = [416, 4 * TH, 608, 256];

// Un cartelito plano con un pedazo de la textura, parado en m (matriz).
function decalGeo(rect, w, h, m) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  const [rx, ry, rw, rh] = rect;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / AW, 1 - (ry + (1 - uv.getY(i)) * rh) / AH);
  geo.applyMatrix4(m);
  return plain(geo);
}

// ---------------- la calavera ----------------
function skullGeo() {
  const parts = [];
  // dark: lo oscuro (las cuencas y la nariz), marcado en uv.x = 2 (fx/ghostMat.js)
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, dark = false) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const g2 = plain(geo).applyMatrix4(m);
    const uv = g2.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, dark ? 2 : 0.5, 0.5);
    parts.push(g2);
  };
  // el cráneo, la cara y la mandíbula
  add(new THREE.SphereGeometry(0.12, 18, 14), 0, 0.03, -0.01, 1, 0.95, 1.12);
  add(new THREE.SphereGeometry(0.085, 14, 10), 0, -0.055, 0.055, 1.05, 0.75, 0.85);
  add(new THREE.BoxGeometry(0.1, 0.03, 0.075), 0, -0.118, 0.06);
  for (const s of [-1, 1]) {
    // las cuencas (el borde brilla: adentro queda oscuro) y los pómulos
    add(new THREE.SphereGeometry(0.031, 12, 8), s * 0.043, -0.012, 0.108, 1, 1.12, 0.55, 0, s * 0.25, 0, true);
    add(new THREE.SphereGeometry(0.022, 8, 6), s * 0.07, -0.05, 0.08);
  }
  add(new THREE.ConeGeometry(0.016, 0.034, 3), 0, -0.05, 0.122, 1, 1, 0.6, Math.PI, 0, 0, true);
  // los dientes
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.012, 0.018, 0.01), -0.03 + i * 0.012, -0.097, 0.108 - Math.abs(i - 2.5) * 0.004);
  return mergeGeometries(parts, false);
}

export default class PenalGhosts {
  constructor(game, egg) {
    this.g = game;
    this.egg = egg;
    // cuánto se ve (sigue al gaucho life del jugador de esta compu)
    this.on = { value: 0 };
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.broken = SKULLS.map(() => false);
    // la bombilla del Alcaide: none (faltan calaveras), ready (en el escritorio), taken
    this.gut = 'none';
    this.hinted = false;
    this.buildTrails();
    this.buildPresos();
    this.buildSkulls();
    this.buildWisps();
    this.buildGut();
    this.register();
    // todo compilado ya (lo escondido también): el alma no traba al entrar
    warmObject(game, this.root);
  }

  // ---------------- lo que se ve ----------------
  // Las frases, las manos, las rayitas y la ronda de pisadas: una sola malla.
  buildTrails() {
    const g = this.g;
    const W = g.world;
    this.atlas = buildAtlas();
    this.trailMat = ghostMaterial({ map: this.atlas, color: 0x4aa8ff, rim: 0xe6f8ff, base: 1.25, wave: 0, far: 40, on: this.on });
    const geos = [];
    const o = new THREE.Object3D();
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // en la pared que haya en esa dirección (si no hay, no va)
    // Solo en pared de verdad (caja 'wall', no rejas ni utilería) y pareja:
    // el centro y las cuatro puntas del dibujo tienen que dar en la misma
    // pared. Si ahí no entra, se corre a lo largo de la pared hasta encontrar
    // lugar (o no va). Devuelve dónde quedó (o null).
    const hitWall = (p, d) => {
      const H = {};
      const t = W.raycast(p, d, 7, H);
      // (o el frente de un desnivel del terreno: 'floor' con la normal de costado)
      const wall = H.box?.kind === 'wall' || H.box === 'floor';
      return Number.isFinite(t) && t < 6.9 && wall && H.normal.dot(d) < -0.9 ? t : null;
    };
    const onWall = (at, dir, rect, w, h, off = 0, dy = 0, roll = 0) => {
      const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      const side = new THREE.Vector3(-d.z, 0, d.x);
      const q = new THREE.Vector3();
      for (const slide of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5]) {
        const p = new THREE.Vector3(at[0], at[1] + dy, at[2]).addScaledVector(side, off + slide);
        const t = hitWall(p, d);
        if (t == null) continue;
        const ok = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sy]) => {
          q.copy(p).addScaledVector(side, (sx * w) / 2).setY(p.y + (sy * h) / 2);
          const tt = hitWall(q, d);
          return tt != null && Math.abs(tt - t) < 0.08;
        });
        if (!ok) continue;
        const pos = p.clone().addScaledVector(d, t - 0.03);
        o.position.copy(pos);
        o.rotation.set(0, 0, 0);
        o.lookAt(pos.clone().sub(d));
        o.rotateZ(roll);
        o.updateMatrix();
        geos.push(decalGeo(rect, w, h, o.matrix));
        return [p.x, p.y - dy, p.z];
      }
      return null;
    };
    // (las que no encontraron pared: para las pruebas)
    this.missed = [];
    WRITINGS.forEach(([text, at, dir, w, hands], k) => {
      const got = onWall(at, dir, R_TILE(k), w, w * (TH / TW), 0);
      if (!got) {
        this.missed.push(text);
        return;
      }
      // las manos, al lado de la frase (donde quedó)
      for (let i = 0; i < hands; i++) {
        const s = i % 2 ? 1 : -1;
        onWall(got, dir, R_HAND, 0.22, 0.22, s * (w * 0.5 + 0.15 + rnd() * 0.3), -0.35 + rnd() * 0.6, (rnd() - 0.5) * 0.9);
      }
    });
    onWall(TALLY[0], TALLY[1], R_TALLY, TALLY[2], TALLY[2] * (256 / 608));
    // la ronda del patio: pisadas en óvalo, de a una por pie
    const R = RONDA;
    for (let i = 0; i < R.n; i++) {
      const a = (i / R.n) * Math.PI * 2;
      const px = R.x + Math.cos(a) * R.rx;
      const pz = R.z + Math.sin(a) * R.rz;
      // hacia dónde camina (contra el reloj) y el pie de cada lado
      const tx = -Math.sin(a) * R.rx;
      const tz = Math.cos(a) * R.rz;
      const len = Math.hypot(tx, tz);
      const s = i % 2 ? 0.11 : -0.11;
      const x = px + (tz / len) * s;
      const z = pz - (tx / len) * s;
      const y = W.floorAt(x, z, 4.5) + 0.02;
      const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(tx, tz) + Math.PI)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      geos.push(decalGeo(R_FOOT, 0.16, 0.32, m));
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), this.trailMat);
    geos.forEach((x) => x.dispose());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.root.add(mesh);
    this.trails = mesh;
  }

  // Los presos que siguen donde estaban: el cuerpo de los zombies (las mismas
  // piezas), con sombrero y poncho, en una pose quieta. Todos en una malla.
  buildPresos() {
    this.presoMat = ghostMaterial({ color: GHOST, rim: 0xcfeeff, base: 0.07, rimK: 1.6, wave: 0.018, far: 45, on: this.on });
    const mesh = new THREE.Mesh(this.bodies(PRESOS), this.presoMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.root.add(mesh);
    this.presos = mesh;
    // Nicanor: más brillante (es el que importa) y con sus dos poses ya armadas
    this.nicMat = ghostMaterial({ color: 0x4a9cff, rim: 0xe6f8ff, base: 0.1, rimK: 2.1, wave: 0.014, far: 45, on: this.on });
    const N = NICANOR;
    const geos = NIC_POSES.map((P) => this.bodies([[N.x, N.z, N.yaw, P]]));
    const nm = new THREE.Mesh(geos[0], this.nicMat);
    nm.frustumCulled = false;
    nm.renderOrder = 2;
    this.root.add(nm);
    // (la otra pose también se dibuja, invisible y chiquita: así ya está en la placa)
    const warm = new THREE.Mesh(geos[1], this.nicMat);
    warm.scale.setScalar(1e-4);
    warm.frustumCulled = false;
    this.root.add(warm);
    const y = this.g.world.floorAt(N.x, N.z, 20);
    this.nic = { mesh: nm, geos, pos: new THREE.Vector3(N.x, y + 0.6, N.z), cd: 0, talkT: 0 };
    this.nicanor = false;
  }

  // Los cuerpos de los presos (el de los zombies, con sombrero y poncho) en
  // poses quietas: [x, z, yaw, pose], todos en una sola geometría.
  bodies(list0) {
    const g = this.g;
    const G = g.zombies.geo;
    const mats = Array.from({ length: PART_COUNT }, () => new THREE.Matrix4());
    const brim = plain(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 20));
    const crown = plain(new THREE.CylinderGeometry(0.095, 0.11, 0.11, 16)).translate(0, 0.06, 0);
    const cape = plain(new THREE.CylinderGeometry(0.15, 0.36, 0.5, 14, 1, true)).scale(1, 1, 0.72).translate(0, -0.25, 0);
    const list = [[G.pelvis, 0], [G.torso, 1], [G.head, 2], [G.uarm, 3], [G.uarm, 4], [G.farm, 5], [G.farm, 6], [G.thigh, 7], [G.thigh, 8], [G.shin, 9], [G.shin, 10], [G.foot, 11], [G.foot, 12]];
    const base = list.map(([geo]) => (geo ? plain(geo) : null));
    const geos = [];
    for (const [x, z, yaw, over] of list0) {
      const P = Object.assign(makePose(), over);
      P.rootY = g.world.floorAt(x, z, 20);
      solvePose(mats, x, z, yaw, 1, P);
      solveExtras(mats);
      list.forEach(([, i], k) => {
        if (base[k]) geos.push(base[k].clone().applyMatrix4(mats[i]));
      });
      const head = new THREE.Matrix4().multiplyMatrices(mats[2], new THREE.Matrix4().makeTranslation(0, 0.125, -0.005));
      geos.push(brim.clone().applyMatrix4(head), crown.clone().applyMatrix4(head));
      geos.push(cape.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(mats[1], new THREE.Matrix4().makeTranslation(0, 0.27, 0))));
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    base.forEach((x) => x?.dispose());
    [brim, crown, cape].forEach((x) => x.dispose());
    return merged;
  }

  // ---------------- Nicanor ----------------
  // Te acercaste de alma y lo estás mirando: habla (lo oye solo el alma; lo
  // que importa, la llave, se avisa a todos al terminar).
  nicTalk() {
    const g = this.g;
    const N = this.nic;
    const kind = this.egg.freed.g2 ? 'free' : this.egg.step < 3 ? 'early' : this.nicanor ? 'again' : 'tell';
    let t = 0;
    for (const text of NIC_LINES[kind]) {
      g.later(t, () => g.say('nicanor', text, 'npc', { local: true }));
      t += Math.max(2.8, text.length * 0.068 + 0.7);
    }
    N.talkT = t + 0.8;
    N.cd = t + (kind === 'tell' ? 20 : 35);
    if (kind === 'tell') {
      g.later(t, () => {
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'nicanor' });
        else this.tellNicanor();
      });
    }
  }

  // (anfitrión) Nicanor ya dijo dónde está la llave: el Alcaide suelta el llavero con ácido.
  tellNicanor() {
    if (this.nicanor) return;
    this.nicanor = true;
    this.egg.announce(NIC_TOLD, 7, true);
    this.egg.netSync();
  }

  updateNicanor(dt, vis) {
    const g = this.g;
    const N = this.nic;
    N.cd -= dt;
    N.talkT -= dt;
    const pose = N.talkT > 0 ? 1 : 0;
    if (N.mesh.geometry !== N.geos[pose]) N.mesh.geometry = N.geos[pose];
    if (!vis || N.cd > 0 || !g.vida?.active) return;
    const cam = g.camera;
    const d = tmpV.copy(N.pos).sub(cam.position);
    const len = d.length();
    if (len > 3.4) return;
    const fwd = tmpA.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (d.dot(fwd) / len < 0.55) return;
    this.nicTalk();
  }

  // Las tres calaveras (cada una con su soga si cuelga) y la que revienta al romperse.
  buildSkulls() {
    const geo = skullGeo().scale(SKULL_K, SKULL_K, SKULL_K);
    this.skullMat = ghostMaterial({ color: 0xc4e8ff, rim: 0xffffff, base: 0.75, rimK: 1.1, wave: 0.003, far: 45, on: this.on, marks: true });
    this.skulls = SKULLS.map((S) => {
      const [x, y, z] = S.pos;
      const parts = [geo.clone()];
      if (S.rope) parts.push(plain(new THREE.CylinderGeometry(0.008, 0.008, S.rope - y - 0.1, 5)).translate(0, (S.rope - y + 0.1) / 2, -0.01));
      const g2 = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
      const m = new THREE.Mesh(g2, this.skullMat);
      m.position.set(x, y, z);
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.root.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0x7ac8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.55);
      glow.position.set(x, y + 0.02, z - 0.12);
      glow.visible = false;
      this.root.add(glow);
      return { S, mesh: m, glow, pos: new THREE.Vector3(x, y, z), done: false };
    });
    // la que revienta (con su propio encendido: se ve aunque no estés de alma)
    this.burstMat = ghostMaterial({ color: 0xc4e8ff, rim: 0xffffff, base: 0.9, rimK: 1.4, wave: 0.01, far: 60, on: 0, marks: true });
    this.burstMesh = new THREE.Mesh(geo, this.burstMat);
    this.burstMesh.frustumCulled = false;
    this.root.add(this.burstMesh);
    this.burstT = -1;
  }

  // Ánimas que flotan (puntitos de luz que van y vienen).
  buildWisps() {
    const mat = new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0x8ad0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    this.wispMat = mat;
    this.wisps = WISPS.map(([x, y, z], i) => {
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.32 + (i % 3) * 0.08);
      s.position.set(x, y, z);
      s.visible = false;
      this.root.add(s);
      return { s, base: new THREE.Vector3(x, y, z), ph: i * 1.7, sp: 0.35 + (i % 4) * 0.08 };
    });
  }

  // La Bombilla Gut del Alcaide (la de verdad, armada desde ya y escondida).
  buildGut() {
    const g = this.g;
    const m = buildMate('gut', 0, g.textures);
    const root = m.root;
    root.scale.multiplyScalar(1.6);
    root.position.set(GUT_AT[0], GUT_AT[1], GUT_AT[2]);
    root.rotation.set(0, 0.9, Math.PI / 2);
    root.traverse((o) => {
      o.castShadow = false;
    });
    root.visible = false;
    this.root.add(root);
    this.gutObj = root;
  }

  register() {
    const g = this.g;
    g.interact.add({
      kind: 'ee',
      local: true,
      pos: new THREE.Vector3(GUT_AT[0], GUT_AT[1], GUT_AT[2]),
      radius: 1.9,
      prompt: () => {
        if (this.gut !== 'ready') return null;
        const w = g.weapons;
        if (w.has('gut') || w.has('gutacida')) return { text: 'La Bombilla Gut del Alcaide (ya tenés una: dejala para otro)', noCost: true, info: true };
        return { text: 'agarrar la Bombilla Gut del Alcaide', noCost: true };
      },
      cost: () => 0,
      use: () => {
        const w = g.weapons;
        if (this.gut !== 'ready' || w.has('gut') || w.has('gutacida')) return false;
        if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'gutgrab' });
        else this.grab(this.egg.myId());
        return true;
      },
    });
  }

  // ---------------- las calaveras ----------------
  // El vuelo del cuchillo de este jugador (Cuchillo.step): si pasa cerca de una, la rompe.
  knifeFly(pos, dir, len) {
    for (let i = 0; i < this.skulls.length; i++) {
      const K = this.skulls[i];
      if (K.done || this.broken[i]) continue;
      const along = Math.max(0, Math.min(len, tmpV.copy(K.pos).sub(pos).dot(dir)));
      if (tmpA.copy(pos).addScaledVector(dir, along).distanceTo(K.pos) > SKULL_R) continue;
      this.burst(i);
      if (this.g.net?.guest) this.g.net.net.send({ t: 'pee', a: 'skull', i });
      else this.breakSkull(i);
    }
  }

  // (anfitrión) Se rompió una: cuenta y, con las tres, aparece la bombilla.
  breakSkull(i) {
    const g = this.g;
    if (this.broken[i] || !this.skulls[i]) return;
    this.broken[i] = true;
    this.burst(i);
    g.net?.event('pee', { skb: i });
    const n = this.broken.filter(Boolean).length;
    if (n < this.skulls.length) this.egg.announce(`Se quebró una calavera de ánima (${n}/${this.skulls.length}). Su alma se fue para la oficina del Alcaide.`, 4);
    else {
      this.gut = 'ready';
      this.egg.announce('Se quebraron las tres calaveras. En el escritorio del Alcaide apareció una Bombilla Gut: es del primero que la agarre.', 5, true);
      g.hud.achievement?.('Las calaveras de ánima', 'Las rompiste con el cuchillo de Anacleto');
    }
    this.egg.netSync();
  }

  // La calavera revienta (se ve con o sin alma): luz, chispas, el ruido y su
  // alma que sale para la oficina.
  burst(i) {
    const g = this.g;
    const K = this.skulls[i];
    if (!K || K.done) return;
    K.done = true;
    K.mesh.visible = false;
    K.glow.visible = false;
    this.burstMesh.position.copy(K.pos);
    this.burstT = 0;
    g.fx.electric(K.pos, 26);
    g.fx.flash(K.pos, 0x7ac8ff, 40, 0.6, 10);
    g.fx.soul(tmpV.copy(K.pos).setY(K.pos.y - 1.2), new THREE.Vector3(GUT_AT[0], GUT_AT[1], GUT_AT[2]));
    g.audio.shatter?.(K.pos);
    g.audio.zap?.(K.pos);
  }

  // (anfitrión) Alguien quiere la bombilla: la primera vez es suya.
  grab(by) {
    const g = this.g;
    if (this.gut !== 'ready') return;
    this.gut = 'taken';
    if (by === this.egg.myId()) this.given();
    else g.net?.net.to(by, { t: 'ev', e: 'pee', gutyou: 1 });
    this.egg.netSync();
  }

  // Me tocó la bombilla.
  given() {
    const g = this.g;
    this.gut = 'taken';
    g.weapons.give('gut');
    g.audio.powerupGrab();
    g.hud.subtitle('La Bombilla Gut del Alcaide es tuya. No hay otra: la próxima sale de la caja.', 4);
  }

  // ---------------- red ----------------
  onGuest(m, from) {
    if (m.a === 'skull' && Number.isInteger(m.i)) this.breakSkull(m.i);
    else if (m.a === 'gutgrab') this.grab(from);
    else if (m.a === 'nicanor') this.tellNicanor();
  }

  netState() {
    return [...this.broken.map((b) => (b ? 1 : 0)), this.gut, this.nicanor ? 1 : 0];
  }

  applyState(s) {
    if (!Array.isArray(s)) return;
    this.skulls.forEach((K, i) => {
      this.broken[i] = !!s[i];
      if (this.broken[i] && !K.done) {
        K.done = true;
        K.mesh.visible = false;
        K.glow.visible = false;
      }
    });
    const gut = s[this.skulls.length];
    if (gut === 'none' || gut === 'ready' || gut === 'taken') this.gut = gut;
    if (s[this.skulls.length + 1] !== undefined) this.nicanor = !!s[this.skulls.length + 1];
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const want = g.vida?.active && g.state !== 'won' ? 1 : 0;
    const u = this.on;
    u.value += (want - u.value) * Math.min(1, dt * (want ? 2.5 : 5));
    if (u.value < 0.003) u.value = 0;
    const k = u.value;
    const t = g.time;
    // las ánimas y el brillo de las calaveras (sprites: solo si se ven)
    const vis = k > 0.01;
    this.wispMat.opacity = k * 0.55;
    for (const W of this.wisps) {
      W.s.visible = vis;
      if (!vis) continue;
      const a = t * W.sp + W.ph;
      W.s.position.set(W.base.x + Math.sin(a) * 0.7, W.base.y + Math.sin(a * 1.7) * 0.25, W.base.z + Math.cos(a * 0.8) * 0.7);
    }
    for (const K of this.skulls) {
      if (K.done) continue;
      K.glow.visible = vis;
      K.glow.material.opacity = k * (0.2 + Math.sin(t * 2.3 + K.pos.x) * 0.06);
      K.mesh.rotation.y = Math.sin(t * 0.7 + K.pos.z) * 0.35;
    }
    this.updateNicanor(dt, vis);
    // la primera vez que ves una de alma: qué es y cómo se rompe
    if (vis && !this.hinted) {
      const cam = g.camera;
      const fwd = tmpA.set(0, 0, -1).applyQuaternion(cam.quaternion);
      for (const K of this.skulls) {
        if (K.done) continue;
        const d = tmpV.copy(K.pos).sub(cam.position);
        const len = d.length();
        if (len > 10 || d.dot(fwd) / len < 0.8) continue;
        this.hinted = true;
        g.hud.subtitle('Una calavera de ánima... Con el cuerpo no se ve, pero el cuchillo de Anacleto la encuentra igual. Acordate dónde está.', 6);
        break;
      }
    }
    // la que revienta
    if (this.burstT >= 0) {
      this.burstT += dt;
      const b = this.burstT / 0.9;
      if (b >= 1) {
        this.burstT = -1;
        this.burstMat.uniforms.uOn.value = 0;
      } else {
        this.burstMat.uniforms.uOn.value = (1 - b) * (1 - b);
        this.burstMesh.scale.setScalar(1 + b * 0.9);
        this.burstMesh.position.y += dt * 0.5;
      }
    }
    // la bombilla del escritorio
    const ready = this.gut === 'ready';
    this.gutObj.visible = ready;
    if (ready && Math.random() < dt * 4) g.fx.sparkle(this.gutObj.position, [0.6, 1, 0.4], 1, 0.7);
  }

  dispose() {
    this.root.removeFromParent();
    this.atlas?.dispose();
    for (const m of [this.trailMat, this.presoMat, this.nicMat, this.skullMat, this.burstMat]) m?.dispose();
  }
}
