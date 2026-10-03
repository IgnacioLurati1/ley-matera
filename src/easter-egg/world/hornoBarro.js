import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, mergeByMaterial, compactGroup } from './props';
import { buildEmpanada } from '../weapons/empanadaModels';

// El horno de barro de las empanadas (el de los chicles de Black Ops 3):
// base de ladrillo con la leña abajo, la mesada, la cúpula de barro con la boca
// en arco, la chimenea, la chapa de la puerta apoyada, la pala que saca la
// empanada, una canasta con repasador y la pizarra con el precio.
// El frente mira a +z y la base apoya en y = 0. Ocupa HORNO.W x HORNO.D.

export const HORNO = { W: 1.3, D: 1.3, H: 1.62, top: 0.81 };

let MATS = null;
function mats(T) {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  MATS = {
    brick: std({ map: T.brick, color: 0xe8c0a0 }),
    soot: std({ map: T.brick, color: 0x4a2e22 }),
    clay: std({ map: T.plasterWhite, vertexColors: true, roughness: 0.97 }),
    slab: std({ map: T.concrete, color: 0xb8a890 }),
    wood: std({ map: T.planks, color: 0xc89a6a, roughness: 0.8 }),
    woodDark: std({ map: T.planksDark, color: 0x9a7050 }),
    bark: std({ color: 0x4a3526, roughness: 1 }),
    grain: std({ color: 0xc8a070, roughness: 0.9 }),
    niche: std({ color: 0x120a06, roughness: 1 }),
    // el adentro del hueco de la leña y del túnel del horno (se ve de los dos lados)
    nicheIn: std({ map: T.brick, color: 0x2a1c14, side: THREE.DoubleSide }),
    tunnel: std({ map: T.brick, color: 0x3a2418, side: THREE.DoubleSide }),
    lip: std({ map: T.plasterWhite, color: 0xb88458, roughness: 0.95 }),
    barkTex: std({ map: barkTexture(), color: 0x9a8070, roughness: 1 }),
    rings: std({ map: ringsTexture(), roughness: 0.85 }),
    // el piso del horno: hollín y brasas que se avivan atrás
    hearth: new THREE.MeshStandardMaterial({ color: 0x0c0604, emissive: 0xffffff, emissiveMap: hearthTexture(), emissiveIntensity: 1, roughness: 1 }),
    tin: std({ color: 0x5a4a3c, metalness: 0.55, roughness: 0.6 }),
    basket: std({ map: T.burlap, color: 0xb07a3a }),
    cloth: std({ map: checkerTexture(), roughness: 0.95 }),
    // la boca: el fondo con las brasas (Empanadas lo hace latir) y el resplandor
    embers: new THREE.MeshStandardMaterial({ color: 0x080302, emissive: 0xffffff, emissiveMap: embersTexture(), emissiveIntensity: 1.2, roughness: 1 }),
    glow: new THREE.SpriteMaterial({ map: T.dot, color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }),
    // (la tiza se ve aunque el lugar esté oscuro)
    board: new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.35 }),
  };
  return MATS;
}

const canvasTex = (w, h, draw, repeat = false) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// La corteza de la leña: vetas oscuras a lo largo.
function barkTexture() {
  return canvasTex(
    64,
    128,
    (x, w, h) => {
      const r = rnd(7);
      x.fillStyle = '#5a4434';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        x.fillStyle = r() < 0.5 ? 'rgba(30,20,12,0.55)' : 'rgba(140,110,80,0.35)';
        x.fillRect(r() * w, r() * h, 1 + r() * 3, 20 + r() * 60);
      }
    },
    true,
  );
}

// La punta cortada del tronco: anillos, la médula y unas grietas.
function ringsTexture() {
  return canvasTex(64, 64, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
    g.addColorStop(0, '#6a4a2a');
    g.addColorStop(0.15, '#d8b884');
    g.addColorStop(0.85, '#c49a64');
    g.addColorStop(0.93, '#7a5a3a');
    g.addColorStop(1, '#3a2a1a');
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
    x.strokeStyle = 'rgba(110,70,40,0.45)';
    x.lineWidth = 0.8;
    for (let k = 4; k < w / 2 - 3; k += 3.2) {
      x.beginPath();
      x.arc(w / 2 + Math.sin(k) * 0.6, w / 2, k, 0, Math.PI * 2);
      x.stroke();
    }
    x.strokeStyle = 'rgba(40,20,10,0.6)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(w / 2, w / 2);
    x.lineTo(w * 0.9, w * 0.3);
    x.moveTo(w / 2, w / 2);
    x.lineTo(w * 0.2, w * 0.75);
    x.stroke();
  });
}

// El piso del horno: casi negro adelante, brasas atrás (arriba de la textura = el fondo).
function hearthTexture() {
  return canvasTex(64, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff8a2a');
    g.addColorStop(0.3, '#6a1c04');
    g.addColorStop(0.6, '#140602');
    g.addColorStop(1, '#000000');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    const r = rnd(29);
    for (let i = 0; i < 90; i++) {
      const py = Math.pow(r(), 1.8) * h * 0.7;
      x.fillStyle = `rgba(255,${(110 + r() * 120) | 0},30,${0.4 + r() * 0.6})`;
      x.beginPath();
      x.arc(r() * w, py, 0.8 + r() * 2.4, 0, Math.PI * 2);
      x.fill();
    }
  });
}

// El repasador a cuadros de la canasta.
function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2ebe0';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(190,30,36,0.85)';
  for (let i = 0; i < 64; i += 16) {
    x.fillRect(i, 0, 8, 64);
    x.fillRect(0, i, 64, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// El fondo del horno: oscuro arriba, brasas y llamitas abajo.
function embersTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.45, '#1a0602');
  g.addColorStop(0.8, '#7a2206');
  g.addColorStop(1, '#ff7a1a');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 96);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const px = r() * 128;
    const py = 70 + r() * 26;
    x.fillStyle = `rgba(255,${120 + r() * 110 | 0},${20 + r() * 40 | 0},${0.5 + r() * 0.5})`;
    x.beginPath();
    x.arc(px, py, 1 + r() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
  // llamitas
  for (let i = 0; i < 9; i++) {
    const px = 10 + r() * 108;
    const h = 14 + r() * 26;
    const f = x.createLinearGradient(0, 96 - h, 0, 96);
    f.addColorStop(0, 'rgba(255,160,40,0)');
    f.addColorStop(1, 'rgba(255,200,80,0.9)');
    x.fillStyle = f;
    x.beginPath();
    x.moveTo(px - 5, 92);
    x.quadraticCurveTo(px - 3, 96 - h * 0.6, px, 96 - h);
    x.quadraticCurveTo(px + 3, 96 - h * 0.6, px + 5, 92);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// La pizarra: "EMPANADAS" y el precio (o "mañana", cuando ya no hay más en la ronda).
export function drawBoard(canvas, price) {
  const x = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  x.fillStyle = '#6a4424';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#1e2420';
  x.fillRect(8, 8, W - 16, H - 16);
  // polvo de tiza
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) x.fillRect(12 + ((i * 97) % (W - 30)), 12 + ((i * 53) % (H - 30)), 18, 3);
  x.fillStyle = '#f2efe4';
  x.textAlign = 'center';
  x.font = 'bold 34px "Comic Sans MS", "Segoe Print", cursive';
  x.fillText('EMPANADAS', W / 2, 50);
  x.font = 'bold 30px "Comic Sans MS", "Segoe Print", cursive';
  x.fillStyle = price ? '#ffd86a' : '#ff9a8a';
  x.fillText(price ? `$${price}` : 'Mañana hay más', W / 2, 92);
}

// UVs de una caja proporcionales a su tamaño (para que el ladrillo no se estire).
function boxUV(w, h, d, s = 0.8) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const [a, b] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * a) / s, (uv.getY(i) * b) / s);
  }
  return g;
}

// La cúpula: un torno con el hollín alrededor de la boca (colores por vértice).
function domeGeo() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI * 0.5;
    const r = 0.57 * Math.cos(a) * (1 + 0.04 * Math.sin(t * Math.PI));
    const y = 0.64 * Math.sin(a);
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  // la boca: se sacan los triángulos del frente, adentro del arco (el borde
  // desparejo lo tapan el arco de ladrillo y el labio de barro)
  const g = cutMouth(new THREE.LatheGeometry(pts, 72));
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // hollín arriba de la boca (el frente, +z) y un poco en la punta
    const front = Math.max(0, z / 0.57);
    const soot = Math.min(1, Math.exp(-((x / 0.22) ** 2)) * front * Math.min(1, Math.max(0, (y - 0.2) / 0.2)) * 1.3 + Math.max(0, (y - 0.5) / 0.14) * 0.3);
    c.set(0xc89060).lerp(new THREE.Color(0x3a2418), soot * 0.85);
    // barro alisado a mano: manchas más claras
    const n = Math.sin(x * 23 + y * 7) * Math.sin(z * 19 - y * 11);
    c.multiplyScalar(0.92 + n * 0.08);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.5);
  return g;
}

function cutMouth(geo) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const keep = [];
  const p = src.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const inArch = cz > 0.15 && Math.abs(cx) < 0.22 && cy < 0.16 + Math.sqrt(Math.max(0, 0.22 * 0.22 - cx * cx)) * 0.95;
    if (!inArch) keep.push(i, i + 1, i + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) {
    const a = src.attributes[k];
    const arr = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, j) => {
      for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c];
    });
    out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

// El túnel de la boca: paredes y bóveda en arco, abierto abajo (el piso va aparte).
function tunnelGeo(w, h, z0, z1) {
  const r = w / 2;
  const prof = [[-r, 0], [-r, h - r]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    prof.push([Math.cos(a) * r, h - r + Math.sin(a) * r]);
  }
  prof.push([r, h - r], [r, 0]);
  const pos = [];
  const uv = [];
  const idx = [];
  let len = 0;
  prof.forEach(([x, y], i) => {
    if (i) len += Math.hypot(x - prof[i - 1][0], y - prof[i - 1][1]);
    pos.push(x, y, z0, x, y, z1);
    uv.push(len / 0.3, 0, len / 0.3, (z1 - z0) / 0.3);
  });
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// El arco de la boca (anillo de ladrillos) y su túnel.
function archShape(w, h) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  return s;
}

// Un horno entero. Devuelve las partes que se animan.
// Lo fijo del horno en menos dibujos (sin cambiar cómo se ve): el ladrillo y
// el hollín (la misma textura, otro color) van en una malla con el color en
// los vértices, con la cara de ladrillo del arco; el adentro del hueco de la
// leña y el del túnel (de las dos caras), con la parte de túnel del arco; el
// labio de barro con la cúpula; la chapa de la puerta en una. Lo que cambia
// (brasas, piso, brillo, pizarra, pala) queda aparte.
// (__mduNoMerge / __mduNo1d: como antes, para comparar)
let VMATS = null;
function foldHorno(g, M, arch, dome, door) {
  if (!VMATS) {
    const v = (m) => {
      const c = m.clone();
      c.color.setRGB(1, 1, 1);
      c.vertexColors = true;
      return c;
    };
    VMATS = { front: v(M.brick), both: v(M.nicheIn) };
  }
  const tint = (geo, c) => {
    const n = geo.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const only = (geo, names) => {
    for (const n of Object.keys(geo.attributes)) if (!names.includes(n)) geo.deleteAttribute(n);
    for (const n of names) if (!geo.attributes[n] && n === 'uv') geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    return geo;
  };
  const take = (o) => {
    o.updateMatrix();
    let geo = o.geometry.clone().applyMatrix4(o.matrix);
    if (geo.index) geo = geo.toNonIndexed();
    return geo;
  };
  const front = [];
  const both = [];
  for (const o of [...g.children]) {
    if (!o.isMesh || Array.isArray(o.material)) continue;
    const m = o.material;
    if (m !== M.brick && m !== M.soot && m !== M.nicheIn && m !== M.tunnel) continue;
    (m === M.brick || m === M.soot ? front : both).push(tint(only(take(o), ['position', 'normal', 'uv']), m.color));
    o.removeFromParent();
  }
  // el arco: cada parte (ladrillo / túnel) con los suyos
  const ag = take(arch);
  for (const grp of ag.groups) {
    const part = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) {
      const a = ag.attributes[n];
      part.setAttribute(n, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
    }
    const m = arch.material[grp.materialIndex];
    (m === M.brick ? front : both).push(tint(part, m.color));
  }
  arch.removeFromParent();
  for (const [list, mat] of [[front, VMATS.front], [both, VMATS.both]]) {
    const merged = mergeGeometries(list);
    list.forEach((x) => x.dispose());
    const mm = new THREE.Mesh(merged, mat);
    mm.castShadow = true;
    mm.receiveShadow = true;
    g.add(mm);
  }
  // el labio de barro con la cúpula (la cúpula ya va con el color en los vértices)
  const lip = g.children.find((o) => o.isMesh && o.material === M.lip);
  if (lip) {
    const dg = only(take(dome), ['position', 'normal', 'color', 'uv']);
    const lg = tint(only(take(lip), ['position', 'normal', 'uv']), M.lip.color);
    const merged = mergeGeometries([dg, lg]);
    dg.dispose();
    lg.dispose();
    const mm = new THREE.Mesh(merged, dome.material);
    mm.castShadow = true;
    mm.receiveShadow = true;
    lip.removeFromParent();
    dome.removeFromParent();
    g.add(mm);
  }
  compactGroup(door);
}

export function buildHorno(T, seed = 0) {
  const M = mats(T);
  const g = new THREE.Group();
  const top = HORNO.top;
  // base de ladrillo con el hueco de la leña de verdad (0,8 x 0,36, medio metro de hondo)
  const bz0 = -0.645;
  const bz1 = 0.405;
  const B = (w, h, d, x, y, z) => g.add(mesh(boxUV(w, h, d), M.brick, x, y, z));
  B(1.3, 0.06, 1.05, 0, 0.03, -0.12);
  B(0.25, 0.36, 1.05, -0.525, 0.24, -0.12);
  B(0.25, 0.36, 1.05, 0.525, 0.24, -0.12);
  B(1.3, 0.32, 1.05, 0, 0.58, -0.12);
  B(0.8, 0.36, 0.545, 0, 0.24, bz0 + 0.2725);
  g.add(mesh(boxUV(0.8, 0.36, 0.5, 0.5), M.nicheIn, 0, 0.24, bz1 - 0.25));
  // la leña: troncos enteros, apilados medio chuecos, con las puntas afuera
  const r = rnd(101 + seed * 13);
  const logs = [];
  for (let i = 0; i < 4; i++) logs.push([-0.3 + i * 0.2 + (r() - 0.5) * 0.03, 0.125, 0.058 + r() * 0.014]);
  for (let i = 0; i < 3; i++) logs.push([-0.2 + i * 0.2 + (r() - 0.5) * 0.04, 0.24, 0.055 + r() * 0.012]);
  logs.push([-0.08 + r() * 0.16, 0.35, 0.05]);
  for (const [x, y, rad] of logs) {
    const L = 0.42 + r() * 0.1;
    const log = new THREE.Group();
    log.add(mesh(new THREE.CylinderGeometry(rad, rad * (1.02 + r() * 0.06), L, 10, 1, true), M.barkTex));
    for (const e of [1, -1]) log.add(mesh(new THREE.CircleGeometry(rad * 0.97, 12), M.rings, 0, (e * L) / 2, 0, (-e * Math.PI) / 2, 0, r() * 6));
    // acostado a lo largo de z: la punta de adelante asoma un poco del hueco
    log.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.12, (r() - 0.5) * 0.1, 0);
    log.position.set(x, y, bz1 + 0.02 + r() * 0.06 - L / 2);
    // (las piezas pasan al grupo, así se juntan con las demás por material)
    log.updateMatrix();
    for (const c of [...log.children]) {
      c.applyMatrix4(log.matrix);
      g.add(c);
    }
  }
  // la mesada de piedra y el mostrador de madera adelante, donde sale la pala
  g.add(mesh(boxUV(1.38, 0.07, 1.12, 0.6), M.slab, 0, top - 0.035, -0.1));
  g.add(mesh(boxUV(0.86, 0.05, 0.3, 0.5), M.wood, 0, top - 0.02, 0.6));
  for (const x of [-0.36, 0.36]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), M.woodDark, x, top - 0.1, 0.72, 0.3, 0, 0));
  // el arco de ladrillo, el túnel adentro de la cúpula y el labio de barro
  const archG = new THREE.ExtrudeGeometry(
    (() => {
      const sh = archShape(0.52, 0.44);
      sh.holes.push(archShape(0.34, 0.3));
      return sh;
    })(),
    { depth: 0.26, bevelEnabled: false, curveSegments: 12 },
  );
  const arch = new THREE.Mesh(archG, [M.brick, M.tunnel]);
  arch.position.set(0, top, 0.26);
  arch.castShadow = true;
  g.add(arch);
  const tunnel = mesh(tunnelGeo(0.34, 0.3, -0.26, 0.27), M.tunnel, 0, top, 0);
  tunnel.castShadow = false;
  g.add(tunnel);
  const lipG = new THREE.ExtrudeGeometry(
    (() => {
      const sh = archShape(0.6, 0.5);
      sh.holes.push(archShape(0.36, 0.31));
      return sh;
    })(),
    { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.014, bevelSegments: 3, curveSegments: 12 },
  );
  g.add(mesh(lipG, M.lip, 0, top + 0.002, 0.52));
  // la cúpula (con el hueco de la boca)
  const dome = mesh(domeGeo(), M.clay, 0, top, -0.08);
  g.add(dome);
  // adentro: el piso con brasas y el fondo con el fuego
  const floor = mesh(new THREE.PlaneGeometry(0.34, 0.8), M.hearth, 0, top + 0.004, 0.14, -Math.PI / 2, 0, 0);
  floor.castShadow = false;
  g.add(floor);
  const back = mesh(new THREE.ShapeGeometry(archShape(0.34, 0.3), 12), M.embers, 0, top, -0.25);
  back.castShadow = false;
  g.add(back);
  const glow = new THREE.Sprite(M.glow);
  glow.scale.set(0.5, 0.4, 1);
  glow.position.set(0, top + 0.1, 0.3);
  g.add(glow);
  // la chimenea
  const chim = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 10), M.soot, 0, top + 0.58, 0.18, 0.18, 0, 0);
  g.add(chim);
  const chimTop = new THREE.Vector3(0, top + 0.69, 0.2);
  // la chapa de la puerta, apoyada al costado de la boca
  const door = new THREE.Group();
  door.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.015), M.tin, 0, 0.15, 0));
  const handle = mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), M.tin, 0, 0.17, 0.012);
  door.add(handle);
  door.position.set(0.44, top, 0.4);
  door.rotation.set(-0.22, -0.55, 0);
  g.add(door);
  // la canasta con el repasador y unas empanadas
  const basket = new THREE.Group();
  basket.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.08, 16), M.basket, 0, 0.04, 0));
  const cloth = mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.012, 16), M.cloth, 0, 0.08, 0);
  basket.add(cloth);
  basket.position.set(-0.42, top, 0.33);
  g.add(basket);
  const decor = ['carne', 'humita', 'jyq'].map((id, i) => {
    const e = buildEmpanada(id);
    e.mesh.geometry.rotateY(i * 2.1 + seed);
    e.mesh.geometry.translate(Math.cos(i * 2.1) * 0.05, 0.09 + i * 0.012, Math.sin(i * 2.1) * 0.05);
    return e;
  });
  const decorMesh = new THREE.Mesh(mergeGeometries(decor.map((e) => e.mesh.geometry)), decor[0].mesh.material);
  decor.forEach((e) => e.dispose());
  decorMesh.position.copy(basket.position);
  decorMesh.castShadow = true;
  g.add(decorMesh);
  // la pizarra colgada en la base
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  drawBoard(canvas, 500);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = M.board.clone();
  boardMat.map = tex;
  boardMat.emissiveMap = tex;
  const board = mesh(new THREE.PlaneGeometry(0.5, 0.22), boardMat, 0, 0.58, 0.412);
  g.add(board);
  // la pala: la tabla y el cabo, adentro del horno hasta que sale
  const peel = new THREE.Group();
  const blade = new THREE.Shape();
  blade.moveTo(-0.12, 0);
  blade.lineTo(-0.12, 0.2);
  blade.quadraticCurveTo(-0.12, 0.27, 0, 0.28);
  blade.quadraticCurveTo(0.12, 0.27, 0.12, 0.2);
  blade.lineTo(0.12, 0);
  blade.lineTo(0.03, -0.04);
  blade.lineTo(-0.03, -0.04);
  const bladeG = new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: false });
  // (la tabla va acostada: la punta redonda hacia +z, el cabo hacia -z; centrada en 0)
  bladeG.rotateX(Math.PI / 2);
  bladeG.translate(0, 0.012, -0.12);
  peel.add(mesh(bladeG, M.wood));
  peel.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.6, 8), M.woodDark, 0, 0.018, -0.46, Math.PI / 2, 0, 0));
  const tray = new THREE.Group();
  tray.position.set(0, 0.014, 0.02);
  peel.add(tray);
  peel.position.set(0, top, 0.05);
  g.add(peel);
  mergeByMaterial(g, [dome, back, floor, arch, board, decorMesh, peel, door]);
  if (!(globalThis.__mduNoMerge || globalThis.__mduNo1d)) foldHorno(g, M, arch, dome, door);
  return {
    group: g,
    peel,
    tray,
    glow,
    back,
    floor,
    board: { canvas, tex },
    chimTop,
    mouth: new THREE.Vector3(0, top + 0.12, 0.5),
    // la pala: adentro (0) y afuera, sobre el mostrador (1)
    peelZ: [0.05, 0.62],
  };
}
