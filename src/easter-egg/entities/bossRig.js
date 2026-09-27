import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { luisonJaw } from './luison';

// El cuerpo de los jefes (Capataz, Mandinga, Espantapájaros, Alcaide, Gauchito
// Gil, Francisco y el Caballero Negro). Lo mueve el mismo esqueleto que a los
// zombies (entities/skeleton.js): cada parte es una "percha" (parts[i]) que
// recibe la matriz de su hueso, y de ella cuelgan las piezas de verdad. Cada
// jefe muestra lo suyo (dress): el Capataz con chaleco, poncho y rastra; el
// Mandinga de negro, con capa, cuernos, cola y tridente; el Espantapájaros de
// bolsa y paja, con un cuervo en el hombro; el Alcaide de uniforme; el Gil de
// poncho colorado, vincha y melena; Francisco de camisa blanca, faja de oro y
// aureola. tick() anima lo que cuelga (poncho, capa, cola, aureola, cuervo).
// Los colores de piel, ropa y poncho viven en mats.skin/cloth/poncho: los
// finales (Cerro, Infierno, PenalCinematic) los prenden con emissive.

const LOOKS = {
  capataz: {
    skin: 0x9a8470,
    cloth: 0xcfc2a4,
    poncho: 0x7a2418,
    pants: 0x4a4844,
    boots: 0x2a1a10,
    hair: 0x2a2420,
    eye: 0xff3020,
    show: ['face', 'earsRound', 'hairShort', 'bigStache', 'vest', 'poncho', 'rastra', 'spurs', 'hat', 'shovel', 'bootsTall'],
  },
  mandinga: {
    skin: 0xa82a18,
    cloth: 0x140a08,
    poncho: 0x2a0806,
    pants: 0x100808,
    boots: 0x0c0806,
    hair: 0x0a0606,
    eye: 0xff3020,
    show: ['face', 'earsPointed', 'hairSlick', 'goatee', 'thinStache', 'horns', 'vestRed', 'cape', 'rastra', 'spurs', 'tail', 'trident', 'bootsTall'],
  },
  scarecrow: {
    skin: 0xc9a060,
    cloth: 0x3a4a6a,
    poncho: 0x7a3020,
    pants: 0x5a4a30,
    boots: 0x3a2a1a,
    hair: 0xd8b25a,
    eye: 0xff9a1a,
    show: ['sack', 'strawHat', 'straw', 'patches', 'rope', 'crow', 'fork', 'bootsWorn'],
  },
  alcaide: {
    skin: 0xa08c78,
    cloth: 0x1d2b3c,
    poncho: 0x24364c,
    pants: 0x1d2b3c,
    boots: 0x0a0a0a,
    hair: 0x1a120c,
    eye: 0xff3020,
    show: ['face', 'earsRound', 'hairShort', 'bigStache', 'buttons', 'epaulettes', 'strap', 'belt', 'keys', 'kepi', 'baton', 'bootsTall', 'stripe'],
  },
  gil: {
    skin: 0xb08662,
    cloth: 0x1f2a44,
    poncho: 0xa81414,
    pants: 0x141414,
    boots: 0x5a3a22,
    hair: 0x0e0a08,
    eye: 0xff2a10,
    show: ['face', 'earsRound', 'hairLong', 'beard', 'stache', 'vincha', 'panuelo', 'poncho', 'rastra', 'spurs', 'hat', 'facon', 'bootsTall'],
  },
  francisco: {
    skin: 0xc8a080,
    cloth: 0xc8c0ae,
    poncho: 0xd8a830,
    pants: 0x2a2420,
    boots: 0x14100c,
    hair: 0x2a1c12,
    eye: 0xffd060,
    show: ['face', 'earsRound', 'hairSlick', 'beardShort', 'faja', 'medallion', 'halo', 'collar', 'belt', 'bootsTall'],
  },
  caballero: {
    skin: 0x4a4640,
    cloth: 0x121216,
    poncho: 0x1a0808,
    pants: 0x121216,
    boots: 0x0c0c0e,
    hair: 0x0a0a0a,
    eye: 0xff3020,
    show: ['knight', 'bootsTall'],
  },
  // el Sargento de la partida (Mate no Numa): ahogado en el estero buscando al
  // Gil, pálido y verdoso, con el uniforme podrido y chorreando, kepí, patillas,
  // algas colgando y el sable de caballería
  sargento: {
    skin: 0x86a894,
    cloth: 0x27313c,
    poncho: 0x2e3a2c,
    pants: 0x33352f,
    boots: 0x16120e,
    hair: 0x191612,
    eye: 0x62ffc8,
    show: ['face', 'earsRound', 'hairShort', 'patillas', 'stache', 'buttons', 'strap', 'belt', 'stripe', 'kepi', 'algae', 'rags', 'saber', 'bootsTall'],
  },
  // el Luisón (Mate no Numa): el séptimo hijo varón hecho bestia, entre lobo y
  // perro, enorme, de pelo sucio y apelmazado; hiede a muerte (tick: miasma y
  // moscas). La camisa y las bombachas pasan a ser pelo (furTexture)
  luison: {
    skin: 0x2e2824,
    cloth: 0x7a6c5e,
    poncho: 0x3a322a,
    pants: 0x6a5c50,
    boots: 0x1c1814,
    hair: 0x2c2620,
    eye: 0xffb020,
    show: ['wolf', 'bootsWorn'],
  },
};

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// Percha de una parte: una malla vacía que recibe la matriz del hueso.
function perch() {
  const m = new THREE.Mesh(new THREE.BufferGeometry());
  m.matrixAutoUpdate = false;
  m.frustumCulled = false;
  return m;
}

const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// El tejido del poncho: lana cruda con franjas y la guarda pampa abajo (se
// tiñe con el color de cada uno).
function ponchoTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0ebe0';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(90,70,50,${0.05 + ((y * 7) % 5) * 0.012})`;
    ctx.fillRect(0, y, 128, 1);
  }
  // franjas oscuras finas y la guarda (escalones) cerca del borde de abajo
  ctx.fillStyle = 'rgba(20,12,8,0.75)';
  for (const y of [18, 26, 222]) ctx.fillRect(0, y, 128, 4);
  ctx.fillRect(0, 196, 128, 3);
  ctx.fillRect(0, 238, 128, 3);
  ctx.fillStyle = 'rgba(255,250,240,0.95)';
  ctx.fillRect(0, 201, 128, 19);
  ctx.fillStyle = 'rgba(20,12,8,0.8)';
  for (let x = 0; x < 128; x += 16) {
    ctx.fillRect(x, 204, 8, 4);
    ctx.fillRect(x + 4, 208, 8, 4);
    ctx.fillRect(x + 8, 212, 8, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tela lisa (camisa limpia, uniforme): apenas la trama, se tiñe con el color.
function fabricTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) {
    ctx.fillStyle = `rgba(60,50,40,${0.03 + ((i * 13) % 7) * 0.006})`;
    ctx.fillRect(i, 0, 1, 64);
    ctx.fillStyle = `rgba(60,50,40,${0.025 + ((i * 7) % 5) * 0.006})`;
    ctx.fillRect(0, i, 64, 1);
  }
  // alguna arruga
  ctx.strokeStyle = 'rgba(40,30,20,0.08)';
  ctx.lineWidth = 3;
  for (const [x, y] of [[10, 20], [40, 44], [24, 56]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y - 8, x + 22, y - 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

// Pelo del Luisón: mechones cortos, claros y oscuros, casi todos para abajo.
function furTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const len = 6 + r() * 12;
    const a = Math.PI / 2 + (r() - 0.5) * 0.7;
    const v = Math.floor(70 + r() * 150);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    ctx.lineWidth = 1 + r() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

// Cara de bolsa de arpillera: ojos de botón, costuras en cruz y una sonrisa cosida.
function sackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b89868';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    ctx.fillStyle = `rgba(70,50,30,${0.08 + (i % 6) * 0.02})`;
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillRect(0, i, 128, 1);
  }
  // un remiendo más oscuro de costado
  ctx.fillStyle = 'rgba(90,60,30,0.5)';
  ctx.fillRect(84, 18, 26, 22);
  ctx.strokeStyle = '#1a120a';
  ctx.lineWidth = 2;
  ctx.strokeRect(84, 18, 26, 22);
  ctx.lineWidth = 5;
  for (const x of [46, 82]) {
    ctx.beginPath();
    ctx.moveTo(x - 9, 50);
    ctx.lineTo(x + 9, 66);
    ctx.moveTo(x + 9, 50);
    ctx.lineTo(x - 9, 66);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(38, 88);
  ctx.quadraticCurveTo(64, 108, 92, 86);
  ctx.stroke();
  for (let x = 42; x <= 88; x += 7) {
    const y = 89 + Math.sin(((x - 38) / 54) * Math.PI) * 9;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // la cara ocupa solo el frente de la bolsa (un tercio de la vuelta)
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.repeat.set(3, 1);
  t.offset.set(-1, 0);
  return t;
}

export function buildBossRig(g) {
  const T = g.textures;
  // lo que se tiñe (y se prende en los finales)
  const skin = std({ color: 0x8a8270, map: T.skin || null, roughness: 0.78 });
  const fabric = fabricTexture();
  const cloth = std({ color: 0x3a3026, map: T.zcloth || fabric });
  const poncho = std({ color: 0x7a2418, map: ponchoTexture(), side: THREE.DoubleSide, roughness: 0.95 });
  const mats = { skin, cloth, poncho, base: { skin: skin.color.getHex(), cloth: cloth.color.getHex(), poncho: poncho.color.getHex() } };
  // lo demás
  const pants = std({ color: 0x4a4844, map: T.zpants || T.grime || null, roughness: 0.92 });
  const pantsMap = pants.map;
  const fur = furTexture();
  const boots = std({ color: 0x2a1a10, map: T.leather || null, roughness: 0.5 });
  const leather = std({ color: 0x3a2414, map: T.leather || null, roughness: 0.55 });
  const hairM = std({ color: 0x2a2420, roughness: 0.95 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x080404 });
  const silver = std({ color: 0xd8d8d0, roughness: 0.28, metalness: 0.95 });
  const gold = std({ color: 0xd0a040, roughness: 0.3, metalness: 0.9 });
  const iron = std({ color: 0x6a6a68, roughness: 0.4, metalness: 0.8 });
  const wood = std({ color: 0x5a4028, roughness: 0.8 });
  const red = std({ color: 0xb01818, roughness: 0.8 });
  const vestM = std({ color: 0x3a2618, map: T.leather || null, roughness: 0.7 });
  const vestRed = std({ color: 0x5a0a08, roughness: 0.6, metalness: 0.1 });
  const strawM = std({ color: 0xd8b25a, roughness: 1 });
  const sackM = std({ color: 0xd8c098, map: sackTexture(), roughness: 1 });
  const hornM = std({ color: 0x1a1210, roughness: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(3), toneMapped: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd070).multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.75 });

  const rig = new THREE.Group();
  rig.visible = false;
  const parts = [];
  for (let i = 0; i < 18; i++) {
    parts[i] = perch();
    rig.add(parts[i]);
  }
  // lo de cada jefe: nombre -> piezas (se prenden con dress)
  const feats = {};
  const feat = (name, obj, part) => {
    (feats[name] ||= []).push(obj);
    if (part !== undefined) parts[part].add(obj);
    return obj;
  };
  const drapes = [];

  // ================= el cuerpo (de todos) =================
  // la cadera: las bombachas y el cinto
  const hips = mesh(lathe([[0.15, -0.12], [0.185, -0.06], [0.19, 0.04], [0.178, 0.1]], 16), pants);
  hips.scale.set(1, 1, 0.72);
  parts[0].add(hips);
  // el torso: camisa con pecho, hombros redondos y el cuello
  const P1 = parts[1];
  const chest = mesh(lathe([[0.16, -0.27], [0.175, -0.12], [0.2, 0.05], [0.212, 0.16], [0.19, 0.24], [0.1, 0.285]], 16), cloth);
  chest.scale.set(1, 1, 0.64);
  P1.add(chest);
  for (const s of [-1, 1]) P1.add(mesh(new THREE.SphereGeometry(0.083, 12, 10), cloth, s * 0.215, 0.205, 0));
  P1.add(mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10), skin, 0, 0.3, 0.02));
  // la cabeza: cráneo, mandíbula, nariz, cejas, cuencas y boca
  const P2 = parts[2];
  const skull = mesh(new THREE.SphereGeometry(0.118, 20, 16), skin, 0, 0.015, -0.005);
  skull.scale.set(0.93, 1.08, 1.0);
  feat('face', skull, 2);
  const jaw = mesh(new THREE.SphereGeometry(0.088, 16, 12), skin, 0, -0.062, 0.028);
  jaw.scale.set(1, 0.78, 1.02);
  feat('face', jaw, 2);
  // nariz (tabique y punta) y los pómulos
  const nose = mesh(new THREE.ConeGeometry(0.02, 0.06, 4), skin, 0, -0.005, 0.12, -0.28, Math.PI / 4, 0);
  nose.scale.set(1, 1, 1.3);
  feat('face', nose, 2);
  feat('face', mesh(new THREE.SphereGeometry(0.016, 8, 6), skin, 0, -0.03, 0.124), 2);
  for (const s of [-1, 1]) {
    const cheek = mesh(new THREE.SphereGeometry(0.036, 10, 8), skin, s * 0.058, -0.022, 0.078);
    cheek.scale.set(1, 0.8, 0.9);
    feat('face', cheek, 2);
    const sock = mesh(new THREE.SphereGeometry(0.022, 10, 8), dark, s * 0.048, 0.03, 0.104);
    sock.scale.set(1.1, 0.72, 0.5);
    feat('face', sock, 2);
    // las cejas, fruncidas (en V)
    feat('face', mesh(new RoundedBoxGeometry(0.058, 0.016, 0.022, 1, 0.006), hairM, s * 0.05, 0.062, 0.108, 0.25, 0, s * 0.3), 2);
  }
  feat('face', mesh(new THREE.BoxGeometry(0.062, 0.012, 0.012), dark, 0, -0.074, 0.112), 2);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.03, 8, 8), skin, s * 0.108, 0.0, -0.005);
    ear.scale.set(0.42, 1, 0.72);
    feat('earsRound', ear, 2);
    const pe = mesh(new THREE.ConeGeometry(0.028, 0.1, 6), skin, s * 0.118, 0.035, -0.01, 0, 0, -s * 1.05);
    pe.scale.set(1, 1, 0.45);
    feat('earsPointed', pe, 2);
  }
  // los ojos que brillan (partes 14 y 15)
  for (const i of [14, 15]) parts[i].add(mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeMat, 0, 0, -0.008));
  // brazos: mangas, codos, puños y las manos cerradas
  for (const i of [3, 4]) {
    parts[i].add(mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.3, 12), cloth));
    parts[i].add(mesh(new THREE.SphereGeometry(0.058, 10, 8), cloth, 0, -0.15, 0));
  }
  for (const i of [5, 6]) {
    const side = i === 5 ? 1 : -1;
    parts[i].add(mesh(new THREE.CylinderGeometry(0.057, 0.047, 0.24, 12), cloth, 0, 0.04, 0));
    parts[i].add(mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.035, 12), cloth, 0, -0.085, 0));
    parts[i].add(mesh(new RoundedBoxGeometry(0.07, 0.09, 0.082, 2, 0.022), skin, 0, -0.138, 0.005));
    parts[i].add(mesh(new RoundedBoxGeometry(0.024, 0.05, 0.028, 1, 0.01), skin, side * 0.036, -0.122, 0.03, 0, 0, side * 0.3));
  }
  // piernas: bombachas anchas, rodillas, botas de caña alta y el pie
  for (const i of [7, 8]) parts[i].add(mesh(lathe([[0.078, -0.23], [0.09, -0.16], [0.106, -0.02], [0.104, 0.12], [0.092, 0.22]], 12), pants));
  for (const i of [9, 10]) {
    parts[i].add(mesh(new THREE.SphereGeometry(0.08, 10, 8), pants, 0, 0.2, 0));
    feat('bootsTall', mesh(lathe([[0.062, -0.215], [0.064, -0.1], [0.07, 0.04], [0.079, 0.15], [0.086, 0.2], [0.088, 0.225]], 12), boots), i);
    feat('bootsWorn', mesh(lathe([[0.062, -0.215], [0.066, -0.08], [0.074, 0.05], [0.078, 0.16]], 10), pants), i);
  }
  for (const i of [11, 12]) {
    parts[i].add(mesh(new RoundedBoxGeometry(0.105, 0.08, 0.25, 2, 0.03), boots, 0, 0, 0.025));
    parts[i].add(mesh(new THREE.BoxGeometry(0.085, 0.04, 0.07), boots, 0, -0.03, -0.075));
    // la espuela (rodaja con puntas)
    const spur = new THREE.Group();
    spur.add(mesh(new THREE.TorusGeometry(0.05, 0.006, 4, 12), silver, 0, 0, -0.1, 0, Math.PI / 2, 0));
    const star = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 8), silver, 0, 0, -0.145, 0, 0, Math.PI / 2);
    spur.add(star);
    feat('spurs', spur, i);
  }

  // ================= la ropa de cada uno =================
  // chaleco abierto adelante (Capataz)
  const vestGeo = new THREE.CylinderGeometry(0.218, 0.184, 0.42, 16, 1, true, 0.5, Math.PI * 2 - 1.0);
  vestM.side = THREE.DoubleSide;
  vestRed.side = THREE.DoubleSide;
  const vest = mesh(vestGeo, vestM, 0, 0.02, 0);
  vest.scale.set(1, 1, 0.68);
  feat('vest', vest, 1);
  const vr = mesh(vestGeo, vestRed, 0, 0.02, 0);
  vr.scale.set(1, 1, 0.68);
  feat('vestRed', vr, 1);
  // el uniforme del Alcaide: botones, charreteras, correaje y la franja del pantalón
  const buttons = new THREE.Group();
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) buttons.add(mesh(new THREE.SphereGeometry(0.016, 6, 5), gold, s * 0.065, -0.14 + k * 0.075, 0.132));
  feat('buttons', buttons, 1);
  for (const s of [-1, 1]) {
    const ep = mesh(new RoundedBoxGeometry(0.12, 0.025, 0.1, 1, 0.01), gold, s * 0.2, 0.28, 0, 0, 0, -s * 0.25);
    feat('epaulettes', ep, 1);
    for (let k = 0; k < 5; k++) feat('epaulettes', mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4), gold, s * (0.25 + k * 0.004), 0.25 - k * 0.004, -0.04 + k * 0.02), 1);
  }
  const strap = mesh(new THREE.BoxGeometry(0.045, 0.62, 0.01), leather, 0, 0.0, 0.134, 0, 0, 0.62);
  feat('strap', strap, 1);
  feat('strap', mesh(new THREE.BoxGeometry(0.045, 0.62, 0.01), leather, 0, 0.0, -0.132, 0, 0, -0.62), 1);
  for (const i of [7, 8]) feat('stripe', mesh(new THREE.BoxGeometry(0.02, 0.4, 0.012), red, (i === 7 ? -1 : 1) * 0.1, 0, 0), i);
  // cinto liso, rastra (cinto de monedas de plata) y faja
  const belt = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16), leather, 0, 0.09, 0);
  belt.scale.set(1, 1, 0.74);
  feat('belt', belt, 0);
  const rastra = new THREE.Group();
  const rb = mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.07, 16), leather, 0, 0.09, 0);
  rb.scale.set(1, 1, 0.74);
  rastra.add(rb);
  rastra.add(mesh(new RoundedBoxGeometry(0.11, 0.06, 0.012, 1, 0.005), silver, 0, 0.09, 0.143));
  for (let k = -3; k <= 3; k++) {
    if (!k) continue;
    const a = k * 0.26;
    rastra.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 10), silver, Math.sin(a) * 0.192, 0.09, Math.cos(a) * 0.142, Math.PI / 2, a, 0));
  }
  feat('rastra', rastra, 0);
  const faja = mesh(new THREE.CylinderGeometry(0.196, 0.19, 0.12, 16), poncho, 0, 0.08, 0);
  faja.scale.set(1, 1, 0.76);
  feat('faja', faja, 0);
  feat('faja', mesh(new THREE.BoxGeometry(0.05, 0.22, 0.012), poncho, 0.12, -0.04, 0.13, 0, 0, 0.12), 0);
  feat('faja', mesh(new THREE.BoxGeometry(0.05, 0.18, 0.012), poncho, 0.16, -0.03, 0.12, 0, 0, -0.1), 0);
  // el llavero y la cachiporra van en la cadera y en la mano
  const keys = new THREE.Group();
  keys.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 5, 14), gold));
  for (let k = 0; k < 5; k++) {
    const key = mesh(new THREE.BoxGeometry(0.014, 0.09, 0.005), gold, Math.cos(k * 1.2) * 0.05, -0.06, Math.sin(k * 1.2) * 0.02, 0, 0, (k - 2) * 0.25);
    keys.add(key);
  }
  keys.position.set(0.19, -0.05, 0.05);
  feat('keys', keys, 0);
  // el pañuelo colorado al cuello (Gil) y el cuello de camisa (Francisco)
  const pan = mesh(new THREE.ConeGeometry(0.1, 0.16, 3), red, 0, 0.19, 0.12, Math.PI, 0, 0);
  pan.scale.set(1, 1, 0.3);
  feat('panuelo', pan, 1);
  const panRing = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14), red, 0, 0.27, 0.02, Math.PI / 2 - 0.25, 0, 0);
  feat('panuelo', panRing, 1);
  for (const s of [-1, 1]) feat('collar', mesh(new THREE.BoxGeometry(0.07, 0.05, 0.01), cloth, s * 0.045, 0.27, 0.085, -0.3, s * 0.5, s * 0.2), 1);
  const medal = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), gold, 0, 0.12, 0.138, Math.PI / 2, 0, 0);
  feat('medallion', medal, 1);
  feat('medallion', mesh(new THREE.TorusGeometry(0.09, 0.004, 4, 16), gold, 0, 0.2, 0.08, 1.2, 0, 0), 1);
  // el Espantapájaros: remiendos, soga de cinto y paja por las mangas y el cuello
  for (const [x, y, w, h, c] of [[-0.08, -0.05, 0.1, 0.09, 0x8a5a3a], [0.09, 0.12, 0.08, 0.08, 0x6a7a4a], [0.04, -0.18, 0.07, 0.06, 0xa08050]]) {
    const pm = std({ color: c, roughness: 1 });
    feat('patches', mesh(new THREE.BoxGeometry(w, h, 0.01), pm, x, y, 0.134 - Math.abs(x) * 0.25), 1);
  }
  feat('patches', mesh(new THREE.BoxGeometry(0.08, 0.1, 0.01), std({ color: 0x7a5a3a, roughness: 1 }), 0.02, 0.05, 0.0).translateZ(0.11), 7);
  const rope = mesh(new THREE.TorusGeometry(0.17, 0.014, 5, 18), strawM, 0, 0.08, 0, Math.PI / 2, 0, 0);
  rope.scale.set(1, 0.74, 1);
  feat('rope', rope, 0);
  const tuft = (n, len, spread) => {
    const geos = [];
    for (let k = 0; k < n; k++) {
      const gg = new THREE.ConeGeometry(0.014, len * (0.7 + Math.random() * 0.5), 4);
      gg.rotateX(Math.PI + (Math.random() - 0.5) * spread);
      gg.rotateZ((Math.random() - 0.5) * spread);
      gg.translate((Math.random() - 0.5) * 0.07, -len * 0.4, (Math.random() - 0.5) * 0.07);
      geos.push(gg);
    }
    return new THREE.Mesh(mergeGeometries(geos), strawM);
  };
  for (const i of [5, 6]) feat('straw', tuft(9, 0.2, 0.9).translateY(-0.1), i);
  for (const i of [9, 10]) feat('straw', tuft(8, 0.18, 0.8).translateY(-0.2), i);
  const neckStraw = new THREE.Group();
  for (let k = 0; k < 12; k++) {
    const s = mesh(new THREE.ConeGeometry(0.02, 0.2, 4), strawM);
    const a = (k / 12) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.08);
    s.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    neckStraw.add(s);
  }
  feat('straw', neckStraw, 1);
  // la cabeza de bolsa atada al cuello con piolín
  const sack = mesh(new THREE.SphereGeometry(0.128, 18, 14), sackM, 0, 0.01, 0, 0, -Math.PI / 2, 0);
  sack.scale.set(0.95, 1.1, 1.0);
  feat('sack', sack, 2);
  const tie = mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 14), strawM, 0, -0.12, 0, Math.PI / 2, 0, 0);
  feat('sack', tie, 2);
  const bunch = mesh(new THREE.ConeGeometry(0.09, 0.1, 10, 1, true), sackM, 0, -0.16, 0);
  feat('sack', bunch, 2);
  // sombrero de paja roto (va en la cabeza: en el final no se lo vuelan)
  const strawHat = new THREE.Group();
  const sb = mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.02, 18, 1, false, 0, Math.PI * 1.8), strawM);
  sb.material = strawM;
  strawHat.add(sb);
  strawHat.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 12), strawM, 0, 0.08, 0));
  strawHat.add(mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.03, 12), std({ color: 0x5a3a1a }), 0, 0.03, 0));
  strawHat.position.set(0, 0.12, -0.01);
  strawHat.rotation.set(-0.12, 0, 0.14);
  feat('strawHat', strawHat, 2);
  // un cuervo en el hombro izquierdo
  const crow = new THREE.Group();
  const crowM = std({ color: 0x0c0c10, roughness: 0.5, metalness: 0.15 });
  const cb = mesh(new THREE.SphereGeometry(0.06, 10, 8), crowM);
  cb.scale.set(0.8, 0.85, 1.35);
  crow.add(cb);
  const crowHead = new THREE.Group();
  crowHead.position.set(0, 0.06, 0.06);
  crowHead.add(mesh(new THREE.SphereGeometry(0.036, 8, 8), crowM));
  crowHead.add(mesh(new THREE.ConeGeometry(0.012, 0.06, 5), std({ color: 0x2a2a28 }), 0, -0.005, 0.045, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) crowHead.add(mesh(new THREE.SphereGeometry(0.007, 5, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5020).multiplyScalar(2), toneMapped: false }), s * 0.022, 0.01, 0.02));
  crow.add(crowHead);
  crow.add(mesh(new THREE.BoxGeometry(0.05, 0.012, 0.1), crowM, 0, -0.01, -0.1, 0.4, 0, 0));
  crow.position.set(-0.22, 0.33, -0.01);
  crow.rotation.y = 0.5;
  feat('crow', crow, 1);

  // ================= el pelo, las barbas y lo de la cabeza =================
  const hairCap = (thetaLen, sx, sy, sz, y, z) => {
    const m = mesh(new THREE.SphereGeometry(0.124, 16, 10, 0, Math.PI * 2, 0, thetaLen), hairM, 0, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  feat('hairShort', hairCap(Math.PI * 0.5, 0.95, 1.08, 1.02, 0.02, -0.012), 2);
  for (const s of [-1, 1]) feat('hairShort', mesh(new THREE.BoxGeometry(0.018, 0.06, 0.04), hairM, s * 0.104, -0.01, 0.03), 2);
  feat('hairSlick', hairCap(Math.PI * 0.46, 0.96, 1.06, 1.04, 0.022, -0.016), 2);
  feat('hairSlick', mesh(new THREE.SphereGeometry(0.1, 10, 8), hairM, 0, 0.0, -0.05).translateY(0), 2);
  feat('hairLong', hairCap(Math.PI * 0.55, 0.98, 1.1, 1.05, 0.02, -0.015), 2);
  const mane = mesh(new RoundedBoxGeometry(0.22, 0.28, 0.07, 2, 0.03), hairM, 0, -0.08, -0.085, 0.12, 0, 0);
  feat('hairLong', mane, 2);
  for (const s of [-1, 1]) feat('hairLong', mesh(new RoundedBoxGeometry(0.04, 0.2, 0.08, 1, 0.015), hairM, s * 0.105, -0.06, -0.02, 0, 0, s * 0.1), 2);
  // las barbas: solo la mitad de abajo de la mandíbula (la boca queda a la vista)
  const beard = mesh(new THREE.SphereGeometry(0.095, 14, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), hairM, 0, -0.07, 0.03);
  beard.scale.set(1.04, 1.25, 1.06);
  feat('beard', beard, 2);
  const beardS = mesh(new THREE.SphereGeometry(0.092, 14, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), hairM, 0, -0.068, 0.03);
  beardS.scale.set(1.03, 0.95, 1.04);
  feat('beardShort', beardS, 2);
  const goatee = mesh(new THREE.ConeGeometry(0.03, 0.12, 6), hairM, 0, -0.14, 0.085, Math.PI + 0.35, 0, 0);
  feat('goatee', goatee, 2);
  for (const s of [-1, 1]) {
    feat('stache', mesh(new THREE.BoxGeometry(0.06, 0.022, 0.025), hairM, s * 0.03, -0.042, 0.118, 0, 0, -s * 0.2), 2);
    const big = mesh(new THREE.ConeGeometry(0.022, 0.1, 6), hairM, s * 0.048, -0.048, 0.116, 0, 0, s * (Math.PI / 2 + 0.35));
    feat('bigStache', big, 2);
    feat('thinStache', mesh(new THREE.BoxGeometry(0.07, 0.008, 0.012), hairM, s * 0.035, -0.045, 0.118, 0, 0, -s * 0.35), 2);
  }
  const vincha = mesh(new THREE.TorusGeometry(0.117, 0.014, 6, 20), red, 0, 0.065, -0.005, Math.PI / 2 + 0.12, 0, 0);
  vincha.scale.set(0.95, 1.05, 1);
  feat('vincha', vincha, 2);
  feat('vincha', mesh(new THREE.BoxGeometry(0.03, 0.14, 0.006), red, 0.03, -0.01, -0.125, 0.1, 0, 0.25), 2);
  // los cuernos del Mandinga: curvos, en tres tramos que se afinan
  const horns = new THREE.Group();
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    let r = 0.036;
    let y = 0;
    let a = -s * 0.55;
    const seg = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const len = 0.075;
      const c = mesh(new THREE.CylinderGeometry(r * 0.72, r, len, 8), hornM);
      c.position.set(Math.sin(-a) * y, y, 0);
      c.rotation.z = a;
      seg.add(c);
      y += len * 0.92;
      r *= 0.72;
      a += s * 0.38;
    }
    seg.add(mesh(new THREE.ConeGeometry(r, 0.06, 6), hornM, Math.sin(-a) * y, y + 0.02, 0, 0, 0, a));
    h.add(seg);
    h.position.set(s * 0.075, 0.1, 0.02);
    h.rotation.x = -0.35;
    horns.add(h);
  }
  feat('horns', horns, 2);
  // la aureola de Francisco (la Voz): un aro de oro que gira detrás de la cabeza
  const halo = new THREE.Group();
  halo.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.007, 6, 36), haloMat));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    halo.add(mesh(new THREE.BoxGeometry(0.006, k % 2 ? 0.035 : 0.055, 0.003), haloMat, Math.cos(a) * 0.205, Math.sin(a) * 0.205, 0, 0, 0, a - Math.PI / 2));
  }
  halo.position.set(0, 0.06, -0.19);
  feat('halo', halo, 2);

  // ================= el poncho y la capa (cuelgan del torso, parte 16) =================
  const P16 = parts[16];
  // la parte de arriba: cae del cuello sobre los hombros redondos y tapa el
  // arranque de los brazos (así el poncho no parece un barril)
  const yoke = mesh(lathe([[0.42, 0.1], [0.41, 0.17], [0.385, 0.235], [0.34, 0.29], [0.27, 0.335], [0.19, 0.362], [0.12, 0.377], [0.075, 0.385]], 24), poncho);
  yoke.scale.set(1, 1, 0.62);
  feat('poncho', yoke, 16);
  // los costados caen sobre cada brazo y se mueven con él
  for (const i of [3, 4]) {
    const out = i === 4 ? Math.PI / 2 : -Math.PI / 2;
    const flap = mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.25, 14, 2, true, out - 1.7, 3.4), poncho, 0, -0.035, 0);
    flap.scale.set(1, 1, 0.9);
    feat('poncho', flap, i);
  }
  // los flecos, siguiendo el borde curvo del paño
  const fringe = (r, a0, arc, n) => {
    const geos = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / (n - 1)) * arc;
      const gg = new THREE.BoxGeometry(0.008, 0.05, 0.004);
      gg.rotateY(a);
      gg.translate(Math.sin(a) * r, -0.02, Math.cos(a) * r * 0.7);
      geos.push(gg);
    }
    return mergeGeometries(geos);
  };
  // paño de adelante y de atrás: cuelgan de los hombros hasta la cadera
  const panel = (side, len, rTop, rBot, arc, name, y0 = 0.25, zs = 0.64) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, y0, 0);
    const a0 = side > 0 ? -arc / 2 : Math.PI - arc / 2;
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, 24, 4, true, a0, arc);
    // pliegues: la tela ondula de costado a costado, más abajo que arriba
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const a = Math.atan2(x, z);
      const f = 1 + Math.sin(a * 9) * 0.035 * (0.4 + (0.5 - y / len));
      pos.setXYZ(k, x * f, y, z * f);
    }
    geo.computeVertexNormals();
    const m = mesh(geo, poncho, 0, -len / 2, 0);
    m.scale.set(1, 1, zs);
    pivot.add(m);
    const fr = mesh(fringe(rBot, a0, arc, 30), poncho, 0, -len, 0);
    fr.scale.set(1, 1, zs / 0.7);
    pivot.add(fr);
    pivot.userData.side = side;
    drapes.push(pivot);
    feat(name, pivot, 16);
    return pivot;
  };
  // del borde de los hombros, más anchos abajo (trapecio)
  panel(1, 0.56, 0.42, 0.5, 2.3, 'poncho', 0.1, 0.62);
  panel(-1, 0.6, 0.42, 0.51, 2.3, 'poncho', 0.1, 0.62);
  // la capa del Mandinga: atrás, larga, con cuello alto
  const cape = panel(-1, 1.12, 0.33, 0.46, 2.6, 'cape');
  cape.userData.cape = true;
  for (const s of [-1, 1]) {
    const coll = mesh(new THREE.PlaneGeometry(0.16, 0.2), poncho, s * 0.12, 0.32, -0.07, -0.25, s * 0.55, 0);
    feat('cape', coll, 16);
  }

  // ================= el sombrero (parte 13: se puede volar de un tiro) =================
  const hatMat = std({ color: 0x2a2018, roughness: 0.8 });
  const hatWrap = parts[13];
  const hat = new THREE.Group();
  const brim = mesh(new THREE.CylinderGeometry(0.34, 0.35, 0.022, 24), hatMat);
  const rimRoll = mesh(new THREE.TorusGeometry(0.345, 0.012, 5, 24), hatMat, 0, 0.004, 0, Math.PI / 2, 0, 0);
  const crown = mesh(new THREE.CylinderGeometry(0.125, 0.148, 0.17, 18), hatMat, 0, 0.085, 0);
  const dent = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), std({ color: 0x1a140e }), 0, 0.172, 0);
  const band = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.032, 18), std({ color: 0x6a1a12 }), 0, 0.03, 0);
  hat.add(brim, rimRoll, crown, dent, band);
  feat('hat', hat, 13);
  // el kepí del Alcaide
  const navy = std({ color: 0x1a2636 });
  const kepi = new THREE.Group();
  kepi.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 16), navy, 0, 0.06, 0, -0.12, 0, 0));
  kepi.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), std({ color: 0x0a0a0a }), 0, 0, 0.06));
  kepi.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), gold, 0, 0.07, 0.145));
  kepi.add(mesh(new THREE.TorusGeometry(0.148, 0.006, 4, 18), gold, 0, 0.01, 0, Math.PI / 2, 0, 0));
  feat('kepi', kepi, 13);

  // ================= lo que llevan en la mano derecha (parte 17) =================
  const shovel = new THREE.Group();
  shovel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6), wood));
  shovel.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.02), iron, 0, -0.78, 0));
  shovel.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), wood, 0, 0.64, 0));
  feat('shovel', shovel, 17);
  const fork = new THREE.Group();
  fork.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), wood));
  const tines = std({ color: 0x5a5a58, roughness: 0.5, metalness: 0.7 });
  fork.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.03), tines, 0, -0.76, 0));
  for (const x of [-0.12, 0, 0.12]) fork.add(mesh(new THREE.ConeGeometry(0.012, 0.32, 5), tines, x, -0.92, 0, Math.PI, 0, 0));
  feat('fork', fork, 17);
  // el tridente del Mandinga: negro, con las puntas al rojo
  const trident = new THREE.Group();
  trident.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.6, 8), hornM));
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(2.2), toneMapped: false });
  trident.add(mesh(new THREE.BoxGeometry(0.3, 0.035, 0.035), hornM, 0, -0.8, 0));
  for (const x of [-0.14, 0, 0.14]) {
    trident.add(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.22, 6), hornM, x, -0.92, 0));
    trident.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 6), ember, x, -1.07, 0, Math.PI, 0, 0));
  }
  feat('trident', trident, 17);
  const baton = new THREE.Group();
  baton.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.8, 8), std({ color: 0x1a1410 })));
  baton.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 8), std({ color: 0x5a3a22 }), 0, 0.32, 0));
  baton.position.y = -0.2;
  feat('baton', baton, 17);
  // el facón largo del Gil, con la cinta colorada
  const facon = new THREE.Group();
  facon.add(mesh(new THREE.BoxGeometry(0.045, 0.4, 0.01), std({ color: 0xd8d8d8, roughness: 0.2, metalness: 1 }), 0, -0.3, 0));
  facon.add(mesh(new THREE.ConeGeometry(0.0225, 0.07, 4), std({ color: 0xd8d8d8, roughness: 0.2, metalness: 1 }), 0.0, -0.535, 0, Math.PI, 0, 0));
  facon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), std({ color: 0x3a2414 })));
  facon.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 0.03), silver, 0, -0.1, 0));
  facon.add(mesh(new THREE.BoxGeometry(0.03, 0.35, 0.004), red, 0.03, 0.05, 0, 0, 0, 0.4));
  feat('facon', facon, 17);

  // ================= el Sargento de la partida (el estero) =================
  // el sable de caballería: hoja curva que sale de la mano para abajo, guarda
  // de latón con el arco de nudillos, puño forrado y la vaina vacía en la cadera
  const saber = new THREE.Group();
  const blade = std({ color: 0x8a8a80, roughness: 0.42, metalness: 0.85 });
  const brass = std({ color: 0x9a7a3a, roughness: 0.4, metalness: 0.85 });
  const sabShape = new THREE.Shape();
  const SL = 0.86;
  const bend = (u) => 0.09 * u * u;
  const wid = (u) => 0.03 * (u < 0.86 ? 1 - u * 0.25 : ((1 - u) / 0.14) * 0.785);
  sabShape.moveTo(bend(0) - wid(0) / 2, 0);
  for (let i = 1; i <= 16; i++) sabShape.lineTo(bend(i / 16) - wid(i / 16) / 2, (-i / 16) * SL);
  for (let i = 16; i >= 0; i--) sabShape.lineTo(bend(i / 16) + wid(i / 16) / 2, (-i / 16) * SL);
  const sbGeo = new THREE.ExtrudeGeometry(sabShape, { depth: 0.006, bevelEnabled: false, curveSegments: 1 }).translate(0, -0.08, -0.003);
  // (la curva hacia atrás de la mano, el filo adelante)
  saber.add(mesh(sbGeo, blade, 0, 0, 0, 0, Math.PI / 2, 0));
  saber.add(mesh(new THREE.BoxGeometry(0.03, 0.014, 0.08), brass, 0, -0.075, 0.01));
  saber.add(mesh(new THREE.TorusGeometry(0.075, 0.006, 5, 14, Math.PI), brass, 0, 0.0, 0.045, 0, Math.PI / 2, Math.PI / 2));
  saber.add(mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.14, 8), leather, 0, 0.0, 0));
  saber.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), brass, 0, 0.08, 0));
  feat('saber', saber, 17);
  feat('saber', mesh(new THREE.BoxGeometry(0.04, 0.82, 0.022), iron, -0.21, -0.36, -0.06, 0.28, 0, 0.12), 0);
  // las patillas (y el bigote fino, 'stache')
  for (const s of [-1, 1]) feat('patillas', mesh(new RoundedBoxGeometry(0.03, 0.095, 0.055, 1, 0.012), hairM, s * 0.1, -0.035, 0.035, 0, 0, s * 0.08), 2);
  // algas del estero colgando del kepí, los hombros y el cinto
  const algaeM = std({ color: 0x4e7a2c, roughness: 0.5 });
  const strands = (list) => {
    const geos = list.map(([x, y, z, len, sway], i) => {
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const u = k / 4;
        pts.push(new THREE.Vector3(x + Math.sin(u * 5 + i) * 0.02 * u + sway * u * u * 0.06, y - u * len, z + Math.cos(u * 4 + i * 1.7) * 0.015 * u));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.009, 4, false);
    });
    return new THREE.Mesh(mergeGeometries(geos), algaeM);
  };
  feat('algae', strands([[0.13, 0.03, -0.02, 0.2, 1], [0.1, 0.05, -0.1, 0.26, -1], [-0.12, 0.04, -0.07, 0.17, 1], [0.02, 0.08, -0.14, 0.3, -1]]), 13);
  feat('algae', strands([[0.22, 0.27, 0.02, 0.32, 1], [0.19, 0.28, -0.07, 0.24, -1], [-0.21, 0.27, 0.05, 0.22, -1], [-0.16, 0.26, -0.09, 0.36, 1], [0.05, 0.22, 0.13, 0.18, 1]]), 1);
  feat('algae', strands([[0.15, 0.08, 0.1, 0.2, 1], [-0.12, 0.08, 0.11, 0.26, -1], [0.02, 0.07, -0.14, 0.22, 1]]), 0);
  // los faldones de la chaqueta, rotos en tiras
  const rags = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + 0.2;
    const len = 0.07 + ((k * 37) % 11) / 11 * 0.12;
    rags.push(new THREE.BoxGeometry(0.055, len, 0.008).translate(0, -len / 2, 0).rotateX(0.12).rotateY(a).translate(Math.sin(a) * 0.185, -0.25, Math.cos(a) * 0.185 * 0.66));
  }
  feat('rags', new THREE.Mesh(mergeGeometries(rags), cloth), 1);

  // ================= el Luisón (el estero) =================
  // cabeza de lobo (hocico largo, orejas paradas, colmillos, ojos amarillos),
  // joroba y melena, mechones en brazos y patas, garras y la cola peluda
  const clawM = std({ color: 0x1c1612, roughness: 0.3 });
  const fangM = std({ color: 0xd8ccaa, roughness: 0.4 });
  const mouthM = std({ color: 0x3a0c0a, roughness: 0.6 });
  const UP = new THREE.Vector3(0, 1, 0);
  // conos (mechones, garras, dientes): [x, y, z, dirección x/y/z, largo, radio]
  const spikes = (list, mat, r0 = 0.03) => {
    const geos = list.map(([x, y, z, dx, dy, dz, len, r = r0]) => {
      const gg = new THREE.ConeGeometry(r, len, 5).translate(0, len / 2, 0);
      gg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize()));
      return gg.translate(x, y, z);
    });
    return new THREE.Mesh(mergeGeometries(geos), mat);
  };
  const crani = mesh(new THREE.SphereGeometry(0.108, 16, 12), cloth, 0, 0.025, -0.02);
  crani.scale.set(1, 0.78, 1.12);
  feat('wolf', crani, 2);
  const muzzle = mesh(new THREE.CylinderGeometry(0.042, 0.078, 0.22, 10).rotateX(Math.PI / 2), cloth, 0, -0.03, 0.15);
  muzzle.scale.set(0.95, 0.78, 1);
  feat('wolf', muzzle, 2);
  const snout = mesh(new THREE.SphereGeometry(0.028, 10, 8), clawM, 0, -0.012, 0.262);
  snout.scale.set(1.25, 0.8, 0.85);
  feat('wolf', snout, 2);
  // la boca por dentro, los colmillos de arriba y la fila de dientes
  feat('wolf', mesh(new THREE.BoxGeometry(0.07, 0.02, 0.17), mouthM, 0, -0.068, 0.15), 2);
  const teeth = [];
  for (const s of [-1, 1]) {
    teeth.push([s * 0.028, -0.07, 0.228, 0, -1, 0.1, 0.052, 0.009]);
    for (let k = 0; k < 4; k++) teeth.push([s * 0.034, -0.068, 0.12 + k * 0.026, 0, -1, 0, 0.022, 0.005]);
  }
  feat('wolf', spikes(teeth, fangM), 2);
  // la mandíbula: abre para aullar y gruñir (tick)
  const wolfJaw = new THREE.Group();
  wolfJaw.position.set(0, -0.078, 0.05);
  const jawM = mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.19, 8).rotateX(Math.PI / 2), cloth, 0, -0.008, 0.095);
  jawM.scale.set(0.9, 0.55, 1);
  wolfJaw.add(jawM);
  wolfJaw.add(mesh(new THREE.BoxGeometry(0.058, 0.012, 0.16), mouthM, 0, 0.012, 0.09));
  wolfJaw.add(spikes([[0.024, 0.008, 0.17, 0, 1, 0.1, 0.04, 0.008], [-0.024, 0.008, 0.17, 0, 1, 0.1, 0.04, 0.008], [0.03, 0.006, 0.1, 0, 1, 0, 0.018, 0.005], [-0.03, 0.006, 0.1, 0, 1, 0, 0.018, 0.005]], fangM));
  feat('wolf', wolfJaw, 2);
  // ojos amarillos rasgados en cuencas oscuras, bajo el ceño fruncido
  for (const s of [-1, 1]) {
    const sock = mesh(new THREE.SphereGeometry(0.026, 10, 8), dark, s * 0.048, 0.022, 0.098);
    sock.scale.set(1.2, 0.75, 0.5);
    feat('wolf', sock, 2);
    const eye = mesh(new THREE.SphereGeometry(0.0125, 8, 6), eyeMat, s * 0.049, 0.022, 0.108, 0, 0, s * 0.35);
    eye.scale.set(1.4, 0.7, 0.6);
    feat('wolf', eye, 2);
    feat('wolf', mesh(new RoundedBoxGeometry(0.075, 0.024, 0.05, 1, 0.008), hairM, s * 0.046, 0.05, 0.1, 0.2, 0, s * 0.3), 2);
    const ear = mesh(new THREE.ConeGeometry(0.045, 0.13, 4), cloth, s * 0.07, 0.13, -0.04, -0.25, 0, -s * 0.3);
    ear.scale.set(1, 1, 0.5);
    feat('wolf', ear, 2);
    const inner = mesh(new THREE.ConeGeometry(0.03, 0.09, 4), mouthM, s * 0.068, 0.122, -0.026, -0.25, 0, -s * 0.3);
    inner.scale.set(1, 1, 0.4);
    feat('wolf', inner, 2);
  }
  // los cachetes peludos y el copete entre las orejas
  const ruff = [[0, 0.1, -0.05, 0, 0.5, -1, 0.12, 0.035], [0, 0.06, -0.1, 0, 0.2, -1, 0.14, 0.04]];
  for (const s of [-1, 1]) ruff.push([s * 0.09, -0.04, 0, s, -0.4, -0.6, 0.12, 0.035], [s * 0.1, 0, -0.03, s, 0.1, -0.8, 0.1, 0.03], [s * 0.07, -0.08, 0.04, s * 0.6, -1, -0.3, 0.1, 0.03]);
  feat('wolf', spikes(ruff, hairM), 2);
  // la joroba y la melena: sobre los hombros, por el lomo y el pecho
  const hump = mesh(new THREE.SphereGeometry(0.21, 14, 10), cloth, 0, 0.16, -0.07);
  hump.scale.set(1.15, 0.85, 0.75);
  feat('wolf', hump, 1);
  // la cintura: encorvado (torsoP 0,8-1,2) la camisa se despega de la cadera y
  // por atrás se veía el hueco de las dos (abiertas); una bola de pelo en la
  // bisagra del lomo (spine, 0,08 arriba de la cadera) lo tapa en cualquier pose
  // (del ancho de las bocas, así no asoma como un bulto)
  const waist = mesh(new THREE.SphereGeometry(0.175, 16, 12), cloth, 0, 0.08, 0);
  waist.scale.set(1, 0.9, 0.72);
  feat('wolf', waist, 0);
  const ruffs = [];
  for (let k = 0; k < 14; k++) {
    const a = -1.3 + k * 0.2;
    const j = ((k * 37) % 11) / 11;
    ruffs.push([Math.sin(a) * 0.18, 0.2 + j * 0.08, -Math.cos(a) * 0.14 - 0.03, Math.sin(a) * 0.6, 0.55, -Math.cos(a), 0.16 + j * 0.08, 0.045]);
    ruffs.push([Math.sin(a) * 0.2, 0.04 + j * 0.05, -Math.cos(a) * 0.13 - 0.02, Math.sin(a) * 0.7, 0.2, -Math.cos(a), 0.12 + j * 0.05, 0.04]);
  }
  for (let k = 0; k < 5; k++) ruffs.push([0, -0.04 - k * 0.055, -0.13 + k * 0.004, 0, 0.35, -1, 0.1 - k * 0.01, 0.03]);
  for (let k = 0; k < 7; k++) {
    const x = (k / 6 - 0.5) * 0.22;
    ruffs.push([x, 0.14 + (k % 2) * 0.08, 0.12, x * 1.5, -1, 0.5, 0.14, 0.035]);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ruffs.push([Math.sin(a) * 0.07, 0.3, Math.cos(a) * 0.06, Math.sin(a), -0.6, Math.cos(a) * 0.8, 0.1, 0.035]);
  }
  feat('wolf', spikes(ruffs, hairM), 1);
  for (const i of [3, 4]) feat('wolf', spikes([[0, 0.12, -0.04, 0, -0.3, -1, 0.1], [0.04, 0.05, -0.02, 0.6, -0.6, -0.8, 0.09], [-0.04, 0.05, -0.02, -0.6, -0.6, -0.8, 0.09]], hairM), i);
  // antebrazos: mechones en el codo, la mano peluda y las garras
  for (const i of [5, 6]) {
    feat('wolf', spikes([[0, 0.1, -0.05, 0, 0.4, -1, 0.12, 0.035], [0.03, 0.02, -0.05, 0.2, -0.2, -1, 0.1, 0.03], [-0.03, 0.02, -0.05, -0.2, -0.2, -1, 0.1, 0.03]], hairM), i);
    feat('wolf', mesh(new RoundedBoxGeometry(0.1, 0.09, 0.1, 2, 0.03), cloth, 0, -0.13, 0.008), i);
    const claws = [];
    for (let k = 0; k < 4; k++) claws.push([(k - 1.5) * 0.022, -0.16, 0.035, 0, -1, 0.45, 0.085, 0.009]);
    feat('wolf', spikes(claws, clawM), i);
  }
  // las patas: mechones en el garrón y garras en los pies
  for (const i of [9, 10]) feat('wolf', spikes([[0, 0.12, -0.07, 0, -0.3, -1, 0.1, 0.035], [0, -0.02, -0.07, 0, -0.5, -1, 0.09, 0.03]], hairM), i);
  for (const i of [11, 12]) {
    const toes = [];
    for (let k = 0; k < 4; k++) toes.push([(k - 1.5) * 0.026, -0.02, 0.14, 0, -0.5, 1, 0.075, 0.011]);
    feat('wolf', spikes(toes, clawM), i);
  }
  // la cola: peluda, cae atrás de la cadera (se mueve en tick)
  const wolfTail = new THREE.Group();
  wolfTail.position.set(0, 0.04, -0.16);
  const D = new THREE.Vector3(0, -0.59, -0.81);
  wolfTail.add(new THREE.Mesh(lathe([[0.001, 0], [0.045, 0.04], [0.07, 0.16], [0.075, 0.3], [0.055, 0.44], [0.001, 0.54]], 10).rotateX(-2.2), cloth));
  const bush = [];
  for (let k = 0; k < 12; k++) {
    const u = (0.1 + k * 0.07) * 0.54;
    const b = k * 2.4;
    const n = new THREE.Vector3(Math.cos(b), Math.sin(b) * 0.81, -Math.sin(b) * 0.59);
    bush.push([D.x * u + n.x * 0.05, D.y * u + n.y * 0.05, D.z * u + n.z * 0.05, n.x + D.x * 1.2, n.y + D.y * 1.2, n.z + D.z * 1.2, 0.1, 0.03]);
  }
  wolfTail.add(spikes(bush, hairM));
  feat('wolf', wolfTail, 0);
  let jawK = 0.12;
  let tailX = 0;
  let tailY = 0;

  // ================= el Caballero Negro (el castillo) =================
  const steel = std({ color: 0x1e1e24, roughness: 0.32, metalness: 0.9 });
  const redEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a10).multiplyScalar(2.6), toneMapped: false });
  const helm = new THREE.Group();
  helm.add(mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, 0, -0.06, 0));
  helm.add(mesh(new THREE.BoxGeometry(0.27, 0.15, 0.06), steel, 0, -0.14, 0.13));
  helm.add(mesh(new THREE.BoxGeometry(0.2, 0.018, 0.02), redEye, 0, -0.11, 0.165));
  helm.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.3), steel, 0, 0.1, -0.03));
  helm.add(mesh(new THREE.ConeGeometry(0.06, 0.55, 6), std({ color: 0x0a0606 }), 0, 0.2, -0.24, -1.15, 0, 0));
  feat('knight', helm, 13);
  // (debajo del yelmo, la cabeza lisa)
  feat('knight', mesh(new THREE.SphereGeometry(0.115, 12, 10), steel, 0, 0.01, 0), 2);
  const plate = new THREE.Group();
  plate.add(mesh(new THREE.CylinderGeometry(0.225, 0.2, 0.36, 14, 1, true, -Math.PI / 2, Math.PI), steel, 0, 0.06, 0.01));
  for (const s of [-1, 1]) plate.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), redEye, s * 0.045, 0.12, 0.2));
  feat('knight', plate, 1);
  for (const i of [3, 4]) {
    const pad = mesh(new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.1, 0);
    pad.scale.set(1.25, 0.8, 1.25);
    feat('knight', pad, i);
  }
  const shield = new THREE.Group();
  shield.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), steel, 0, 0, 0, 0, 0, Math.PI / 2));
  shield.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), steel, 0.03, 0, 0));
  shield.add(mesh(new THREE.TorusGeometry(0.34, 0.02, 5, 20), gold, 0, 0, 0, 0, Math.PI / 2, 0));
  for (const s of [-1, 1]) shield.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), redEye, 0.04, 0.12, s * 0.07));
  shield.position.set(0.1, -0.12, 0);
  feat('knight', shield, 5);
  const lance = new THREE.Group();
  lance.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 3.2, 8), std({ color: 0x1a1410 })));
  lance.add(mesh(new THREE.ConeGeometry(0.05, 0.4, 6), steel, 0, 1.8, 0));
  lance.add(mesh(new THREE.PlaneGeometry(0.5, 0.26), std({ color: 0x5a0c08, side: THREE.DoubleSide }), 0.25, 1.45, 0));
  lance.position.y = 0.3;
  feat('knight', lance, 17);

  rig.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  for (const list of Object.values(feats)) for (const o of list) o.visible = false;

  let kind = 'capataz';
  // el latigazo (rebenque): una lonja que sale ondulando de la mano y chasquea
  const lashMat = std({ color: 0x3a2414, roughness: 0.7 });
  const lash = new THREE.Mesh(new THREE.BufferGeometry(), lashMat);
  lash.frustumCulled = false;
  lash.visible = false;
  g.scene.add(lash);
  const lashA = new THREE.Vector3();
  const lashB = new THREE.Vector3();
  const lashPts = Array.from({ length: 14 }, () => new THREE.Vector3());
  let lashT = -1;
  // los sombreros volados: caen dando vueltas y quedan en el piso un rato
  const fallen = [];
  let lastT = null;
  const clearFallen = () => {
    for (const f of fallen) f.grp.removeFromParent();
    fallen.length = 0;
  };
  const R = {
    rig,
    parts,
    mats,
    hat: hatWrap,
    eyeMat,
    get kind() {
      return kind;
    },
    // Viste al jefe: colores y lo que se ve de cada uno.
    dress(k) {
      clearFallen();
      kind = LOOKS[k] ? k : 'capataz';
      const L = LOOKS[kind];
      skin.color.set(L.skin);
      cloth.color.set(L.cloth);
      // la camisa manchada solo para los sucios (cambiar de textura no recompila)
      const clean = kind === 'francisco' || kind === 'gil' || kind === 'alcaide' || kind === 'mandinga';
      if (clean) cloth.map = fabric;
      else if (T.zcloth) cloth.map = T.zcloth;
      // el Luisón: la ropa es pelo (las bombachas solo si ya tenían textura)
      if (kind === 'luison') cloth.map = fur;
      pants.map = kind === 'luison' && pantsMap ? fur : pantsMap;
      poncho.color.set(L.poncho);
      pants.color.set(L.pants);
      // el Sargento sale del agua: la ropa y la piel mojadas brillan
      const wet = kind === 'sargento';
      cloth.roughness = wet ? 0.42 : 0.85;
      pants.roughness = wet ? 0.45 : 0.92;
      skin.roughness = wet ? 0.35 : 0.78;
      boots.color.set(L.boots);
      hairM.color.set(kind === 'scarecrow' ? 0x2a2018 : L.hair);
      eyeMat.color.set(L.eye).multiplyScalar(3);
      for (const m of [skin, cloth, poncho]) if (m.emissive) m.emissiveIntensity = 0;
      const on = new Set(L.show);
      for (const [name, list] of Object.entries(feats)) for (const o of list) o.visible = on.has(name);
      // el Espantapájaros no tiene ojos de verdad: le brillan los botones
      for (const i of [14, 15]) parts[i].visible = kind !== 'caballero' && kind !== 'luison';
    },
    // El latigazo de la mano (from) hasta donde pega (to).
    whip(from, to) {
      lashA.copy(from);
      lashB.copy(to);
      lashT = 0;
    },
    // Le volaron el sombrero (o el kepí): una copia sale despedida y cae.
    dropHat() {
      const src = parts[13];
      const grp = new THREE.Group();
      for (const c of src.children) if (c.visible) grp.add(c.clone());
      if (!grp.children.length) return;
      src.updateWorldMatrix(true, false);
      src.matrixWorld.decompose(grp.position, grp.quaternion, grp.scale);
      g.scene.add(grp);
      const floor = g.world?.floorAt ? g.world.floorAt(grp.position.x, grp.position.z, grp.position.y - 1) : 0;
      const a = Math.random() * Math.PI * 2;
      fallen.push({ grp, floor, t: 0, v: new THREE.Vector3(Math.cos(a) * 1.6, 3.4, Math.sin(a) * 1.6), spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9) });
      if (fallen.length > 3) fallen.shift().grp.removeFromParent();
    },
    // Para compilar en la carga: todo a la vista un momento (devuelve cómo volver).
    showAll() {
      const was = [];
      rig.traverse((o) => was.push([o, o.visible]));
      rig.traverse((o) => {
        o.visible = true;
      });
      return () => {
        for (const [o, v] of was) o.visible = v;
      };
    },
    // Lo que cuelga y se mueve solo: el poncho y la capa caen a plomo cuando se
    // inclina, se mecen al andar; la cola, la aureola y el cuervo.
    tick(z, t) {
      const dt = lastT === null ? 0 : Math.max(0, Math.min(0.05, t - lastT));
      lastT = t;
      if (lashT >= 0) {
        lashT += dt;
        const k = lashT / 0.5;
        if (k >= 1) {
          lashT = -1;
          lash.visible = false;
        } else {
          // sale enrulada, se estira hasta el piso en un tercio y vuelve
          const reach = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) * 0.9;
          const n = lashPts.length - 1;
          for (let i = 0; i <= n; i++) {
            const u = (i / n) * reach;
            const p = lashPts[i].lerpVectors(lashA, lashB, u);
            const wave = Math.sin(u * 9 - k * 26) * 0.35 * (1 - k) * u;
            p.y += Math.sin(u * Math.PI) * 0.9 * (1 - reach * 0.7) + wave;
          }
          lash.geometry.dispose();
          lash.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lashPts), 28, 0.028, 5, false);
          lash.visible = true;
        }
      }
      for (let i = fallen.length - 1; i >= 0; i--) {
        const f = fallen[i];
        f.t += dt;
        const G = f.grp;
        if (f.v) {
          f.v.y -= 9.8 * dt;
          G.position.addScaledVector(f.v, dt);
          G.rotation.x += f.spin.x * dt;
          G.rotation.y += f.spin.y * dt;
          G.rotation.z += f.spin.z * dt;
          if (G.position.y <= f.floor + 0.03 && f.v.y < 0) {
            // cae de ala, derecho
            G.position.y = f.floor + 0.03;
            G.rotation.set(0, G.rotation.y, 0);
            f.v = null;
          }
        }
        if (f.t > 25) {
          G.removeFromParent();
          fallen.splice(i, 1);
        }
      }
      const P = z.P;
      const lean = (P.torsoP || 0) + (P.rootPitch || 0);
      const step = Math.sin(z.phase || 0);
      for (const d of drapes) {
        if (!d.visible) continue;
        const back = d.userData.side < 0;
        let a = -lean * (back ? 0.62 : 0.85) + step * 0.05 * d.userData.side + Math.sin(t * 1.7 + (back ? 1 : 0)) * 0.02;
        if (d.userData.cape) a = -lean * 0.9 - 0.12 - Math.abs(step) * 0.12 + Math.sin(t * 2.3) * 0.05;
        d.rotation.x = a;
      }
      if (tail.visible) {
        tail.rotation.y = Math.sin(t * 2.2) * 0.45;
        tail.rotation.x = -0.2 + Math.sin(t * 1.4) * 0.12;
      }
      if (halo.visible) {
        halo.rotation.z = t * 0.5;
        const k = 1 + Math.sin(t * 3) * 0.15;
        haloMat.color.setRGB(k, k * 0.8, k * 0.42);
      }
      // el Sargento chorrea agua del estero
      if (kind === 'sargento' && rig.visible && !z.dead && Math.random() < dt * 14) {
        const s = z.scale || 1;
        const a = Math.random() * Math.PI * 2;
        const r = (0.12 + Math.random() * 0.14) * s;
        g.fx.alpha.spawn(z.pos.x + Math.cos(a) * r, (z.baseY || 0) + (0.5 + Math.random() * 1.2) * s, z.pos.z + Math.sin(a) * r, 0, -0.5, 0, { color: [0.5, 0.6, 0.62], size: 0.022, size1: 0.012, life: 0.55, gravity: 9 });
      }
      // el Luisón: menea la cola, abre la boca para aullar y gruñir, y larga
      // un vaho podrido con moscas
      if (wolfTail.visible) {
        // la cola: corriendo y saltando va estirada atrás; aullando cuelga
        // quieta; atontado, entre las patas; enfurecido, azota
        const st = z.state;
        const howl = st === 'howl' || st === 'intro' || st === 'enrage' || st === 'summon';
        const run = st === 'chase' || st === 'charge' || st === 'toLock';
        const tx = run ? 0.45 + Math.sin(t * 9) * 0.1 : howl ? -0.25 : st === 'stunned' ? -0.4 : Math.sin(t * 1.3) * 0.08;
        const ty = z.enraged && !howl ? Math.sin(t * 7) * 0.45 : howl ? Math.sin(t * 1.1) * 0.06 : Math.sin(t * 2.6) * 0.3;
        tailX += (tx - tailX) * Math.min(1, dt * 6);
        tailY += (ty - tailY) * Math.min(1, dt * 8);
        wolfTail.rotation.x = tailX;
        wolfTail.rotation.y = tailY;
        const open = luisonJaw(z, t);
        jawK += (open - jawK) * Math.min(1, dt * 12);
        wolfJaw.rotation.x = jawK + Math.sin(t * 8) * 0.02;
        if (rig.visible && !z.dead) {
          const s = z.scale || 1;
          if (Math.random() < dt * 9) {
            const a = Math.random() * Math.PI * 2;
            const r = (0.2 + Math.random() * 0.3) * s;
            g.fx.alpha.spawn(z.pos.x + Math.cos(a) * r, (z.baseY || 0) + (0.3 + Math.random()) * s, z.pos.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3, { color: [0.3, 0.34, 0.18], size: 0.35, size1: 0.9, life: 1.8, alpha: 0.35 });
          }
          if (Math.random() < dt * 12) {
            const a = Math.random() * Math.PI * 2;
            g.fx.alpha.spawn(z.pos.x + Math.cos(a) * 0.5 * s, (z.baseY || 0) + (0.6 + Math.random() * 0.8) * s, z.pos.z + Math.sin(a) * 0.5 * s, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, { color: [0.02, 0.02, 0.02], size: 0.025, size1: 0.02, life: 0.7, drag: 1 });
          }
        }
      }
      if (crow.visible) {
        crowHead.rotation.y = Math.sin(t * 0.9) * 0.8 + (Math.sin(t * 7.3) > 0.93 ? 0.4 : 0);
        crowHead.rotation.x = Math.sin(t * 1.3) * 0.2;
      }
    },
  };

  // la cola del Mandinga: sale de atrás de la cadera y termina en punta de flecha
  const tail = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.15, -0.18), new THREE.Vector3(0, -0.42, -0.3), new THREE.Vector3(0, -0.62, -0.2), new THREE.Vector3(0, -0.7, 0.0)]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 6, false), skin));
  const tip = mesh(new THREE.ConeGeometry(0.05, 0.1, 4), hornM, 0, -0.72, 0.04, -1.9, 0, 0);
  tip.scale.set(1, 1, 0.3);
  tail.add(tip);
  tail.position.set(0, 0.02, -0.12);
  feat('tail', tail, 0);
  tail.visible = false;

  R.dress('capataz');
  return R;
}
