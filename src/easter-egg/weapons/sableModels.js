import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// El Sable Corvo de San Martín, en piezas (weapons/Sable.js lo usa en la
// mano; el Monumento al Mate pone las tres piezas y el sable armado en el mapa).
// Como el de verdad (Museo Histórico Nacional): hoja de acero de Damasco de
// 818 mm, 27 mm de ancho y 5 de lomo, recta hasta casi la mitad y después
// curva (por eso la vaina lleva una ranura); cruz dorada de gavilanes cortos
// con bolitas y escusones; puño de ébano negro, segrinado (rombos) cerca de la
// cruz, con el pomo doblado hacia el filo y su casquete dorado; la dragona
// colgando. Vaina de cuero negro con brocal y contera dorados y dos
// abrazaderas con sus anillas.
// Mejorado (Sable de San Lorenzo): el filo y una veta de la hoja se encienden
// celeste y blanco, el Damasco brilla celeste, el dorado relumbra, una
// escarapela en la cruz y la dragona es una cinta celeste y blanca.
//
// Medidas en metros, de verdad. La hoja sube por +y desde la cruz (y = 0), el
// puño baja; el filo mira a +x (lado de afuera de la curva) y el lomo a -x.

export const BLADE_L = 0.818;
const W0 = 0.027;
const T0 = 0.005;
// el tramo recto (fracción del largo) y cuánto gira la hoja hasta la punta
const STRAIGHT = 0.38;
const BEND = 0.6;
// dónde arranca la punta (el filo sube a encontrarse con el lomo)
const TIP = 0.86;
const N = 64;

// ---------------- la línea del lomo ----------------
// S(u): el lomo; d: hacia la punta; n: hacia el filo. Se integra la curvatura
// (cero en el tramo recto, va entrando de a poco).
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const FINE = 800;
const SP = [];
{
  let total = 0;
  for (let i = 0; i < FINE; i++) total += smooth(STRAIGHT - 0.1, STRAIGHT + 0.16, (i + 0.5) / FINE) / FINE;
  const k0 = BEND / (total * BLADE_L);
  let x = 0;
  let y = 0;
  let th = 0;
  const ds = BLADE_L / FINE;
  for (let i = 0; i <= FINE; i++) {
    SP.push({ x, y, th });
    th += k0 * smooth(STRAIGHT - 0.1, STRAIGHT + 0.16, (i + 0.5) / FINE) * ds;
    x -= Math.sin(th) * ds;
    y += Math.cos(th) * ds;
  }
}
// ancho (del lomo al filo) y espesor del lomo a lo largo (u de 0 a 1)
const wAt = (u) => {
  const base = W0 * (1 - 0.2 * Math.min(u, TIP));
  if (u <= TIP) return base;
  const k = Math.min(1, (u - TIP) / (1 - TIP));
  return base * Math.pow(Math.max(0, Math.cos((k * Math.PI) / 2)), 0.8);
};
const tAt = (u) => T0 * (1 - 0.55 * u);

// El lomo, la dirección y el filo en u (para la estela, la punta, la mitad).
export function bladeFrame(u, out = {}) {
  const f = Math.min(FINE, Math.max(0, u * FINE));
  const i = Math.min(FINE - 1, Math.floor(f));
  const k = f - i;
  const a = SP[i];
  const b = SP[i + 1];
  const th = a.th + (b.th - a.th) * k;
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.nx = Math.cos(th);
  out.ny = Math.sin(th);
  out.w = wAt(u);
  out.t = tAt(u);
  return out;
}
// Un punto del filo (e de 0 a 1, de la cruz a la punta), en el plano de la hoja.
export function edgePoint(e, out = new THREE.Vector3(), into = 1) {
  const f = bladeFrame(e);
  return out.set(f.x + f.nx * f.w * into, f.y + f.ny * f.w * into, 0);
}

// Una malla en grilla: filas (de un borde al otro) de puntos a lo largo.
// Normal = de una fila a la siguiente × a lo largo.
function gridGeo(rows, uvAcross = null) {
  const K = rows.length;
  const M = rows[0].length;
  const pos = new Float32Array(K * M * 3);
  const uv = new Float32Array(K * M * 2);
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < M; i++) {
      const p = rows[k][i];
      const o = k * M + i;
      pos[o * 3] = p[0];
      pos[o * 3 + 1] = p[1];
      pos[o * 3 + 2] = p[2];
      uv[o * 2] = p[3] ?? i / (M - 1);
      uv[o * 2 + 1] = uvAcross ? uvAcross[k] : k / (K - 1);
    }
  }
  const idx = [];
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < M - 1; i++) {
      const a = k * M + i;
      const b = a + 1;
      const c = a + M;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------- texturas ----------------
let TEX = null;
function textures() {
  if (TEX) return TEX;
  // el acero de Damasco: vetas onduladas claras y oscuras a lo largo de la hoja
  const W = 512;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;
  const gctx = glow.getContext('2d');
  const gimg = gctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const warp = Math.sin(u * 31 + Math.sin(v * 9 + u * 13) * 1.7) * 0.9 + Math.sin(u * 77 + v * 5) * 0.25;
      const f = Math.sin((v * 7 + warp) * Math.PI * 2);
      const line = Math.pow(Math.abs(f), 0.35);
      const lum = 0.74 + 0.2 * line + Math.sin(u * 400 + v * 60) * 0.015;
      const o = (y * W + x) * 4;
      img.data[o] = lum * 238;
      img.data[o + 1] = lum * 242;
      img.data[o + 2] = lum * 248;
      img.data[o + 3] = 255;
      // (para el mejorado: solo las vetas finas, que se encienden)
      const gl = Math.pow(1 - Math.abs(f), 6);
      gimg.data[o] = gl * 255;
      gimg.data[o + 1] = gl * 255;
      gimg.data[o + 2] = gl * 255;
      gimg.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  gctx.putImageData(gimg, 0, 0);
  const damasco = new THREE.CanvasTexture(c);
  damasco.colorSpace = THREE.SRGBColorSpace;
  damasco.anisotropy = 4;
  const vetas = new THREE.CanvasTexture(glow);
  vetas.anisotropy = 4;
  // el ébano del puño: rombos (segrinado) cerca de la cruz, liso más abajo.
  // (uv.y = 0 junto a la cruz: abajo del lienzo)
  const g = document.createElement('canvas');
  g.width = 64;
  g.height = 256;
  const gx = g.getContext('2d');
  gx.fillStyle = '#16120f';
  gx.fillRect(0, 0, 64, 256);
  // vetas de la madera
  for (let i = 0; i < 40; i++) {
    gx.strokeStyle = `rgba(${40 + Math.random() * 20},${30 + Math.random() * 14},${24},0.35)`;
    gx.lineWidth = 0.6 + Math.random();
    gx.beginPath();
    const x0 = Math.random() * 64;
    gx.moveTo(x0, 0);
    gx.bezierCurveTo(x0 + Math.random() * 10 - 5, 90, x0 + Math.random() * 10 - 5, 170, x0 + Math.random() * 8 - 4, 256);
    gx.stroke();
  }
  gx.save();
  gx.beginPath();
  gx.rect(0, 140, 64, 116);
  gx.clip();
  gx.strokeStyle = 'rgba(0,0,0,0.85)';
  gx.lineWidth = 1.6;
  for (let i = -20; i < 40; i++) {
    gx.beginPath();
    gx.moveTo(i * 8, 140);
    gx.lineTo(i * 8 + 116, 256);
    gx.stroke();
    gx.beginPath();
    gx.moveTo(i * 8 + 116, 140);
    gx.lineTo(i * 8, 256);
    gx.stroke();
  }
  gx.strokeStyle = 'rgba(120,100,80,0.18)';
  gx.lineWidth = 0.7;
  for (let i = -20; i < 40; i++) {
    gx.beginPath();
    gx.moveTo(i * 8 + 1.5, 140);
    gx.lineTo(i * 8 + 117.5, 256);
    gx.stroke();
  }
  gx.restore();
  const ebano = new THREE.CanvasTexture(g);
  ebano.colorSpace = THREE.SRGBColorSpace;
  ebano.wrapS = THREE.RepeatWrapping;
  ebano.repeat.set(2, 1);
  TEX = { damasco, vetas, ebano };
  return TEX;
}

// ---------------- materiales ----------------
const CELESTE = new THREE.Color(0x6cc4ff);
let MATS = null;
export function sableMats() {
  if (MATS) return MATS;
  const T = textures();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, ...o });
  MATS = {
    steel: std({ color: 0xd6dbe2, map: T.damasco, metalness: 1, roughness: 0.32 }),
    // el mejorado: el Damasco se enciende celeste por las vetas
    steelUp: std({ color: 0xd0dae6, map: T.damasco, metalness: 1, roughness: 0.3, emissive: CELESTE.clone(), emissiveMap: T.vetas, emissiveIntensity: 0.55 }),
    edge: std({ color: 0xe4eaf0, metalness: 1, roughness: 0.22, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    edgeUp: new THREE.MeshBasicMaterial({ color: CELESTE.clone().multiplyScalar(1.9), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    inlay: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f6ff).multiplyScalar(1.6), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    gilt: std({ color: 0xe0ac4a, metalness: 1, roughness: 0.24 }),
    giltUp: std({ color: 0xf2bf55, metalness: 1, roughness: 0.16, emissive: 0xffa526, emissiveIntensity: 0.35 }),
    ebony: std({ color: 0xffffff, map: T.ebano, roughness: 0.34, metalness: 0.05 }),
    tang: std({ color: 0x4a4c50, metalness: 0.9, roughness: 0.55 }),
    leather: std({ color: 0x171312, roughness: 0.48, metalness: 0.05 }),
    slit: new THREE.MeshBasicMaterial({ color: 0x050403 }),
    cord: std({ color: 0xd8a53e, metalness: 0.7, roughness: 0.45 }),
    celeste: std({ color: 0x7cc0ee, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x2a6aa0, emissiveIntensity: 0.25 }),
    white: std({ color: 0xf4f6f8, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x606a74, emissiveIntensity: 0.2 }),
  };
  return MATS;
}

// Los reflejos de los metales: el mapa de la sala de Weapons (envMap) puesto
// en el material, así brillan igual en la mano y en el mundo (con el del
// mundo, a 0,12, el acero de noche se veía negro). Lo llama weapons/Sable.js.
const ENV_K = { steel: 0.4, steelUp: 0.4, edge: 0.5, gilt: 0.9, giltUp: 0.9, cord: 0.6, tang: 0.5, ebony: 0.35, leather: 0.25 };
export function setSableEnv(envMap) {
  const M = sableMats();
  for (const [k, v] of Object.entries(ENV_K)) {
    if (M[k].envMap === envMap) continue;
    M[k].envMap = envMap;
    M[k].envMapIntensity = v;
    M[k].needsUpdate = true;
  }
}

// ---------------- la hoja ----------------
let BLADE_GEO = null;
function bladeGeos() {
  if (BLADE_GEO) return BLADE_GEO;
  const fr = {};
  const spP = [];
  const spM = [];
  const rP = [];
  const rM = [];
  const eE = [];
  const edgeF0 = [];
  const edgeF1 = [];
  const edgeB0 = [];
  const edgeB1 = [];
  const inF0 = [];
  const inF1 = [];
  const inB0 = [];
  const inB1 = [];
  // la parte del ancho donde va la arista (el vaciado se ve en la luz)
  const RIDGE = 0.3;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    bladeFrame(u, fr);
    const { x, y, nx, ny, w, t } = fr;
    const at = (a) => [x + nx * w * a, y + ny * w * a];
    spP.push([x, y, t / 2, u]);
    spM.push([x, y, -t / 2, u]);
    const r = at(RIDGE);
    rP.push([r[0], r[1], t * 0.42, u]);
    rM.push([r[0], r[1], -t * 0.42, u]);
    const e = at(1);
    eE.push([e[0], e[1], 0, u]);
    // el filo: una franja brillante sobre el bisel, de los dos lados
    const span = w * (1 - RIDGE);
    const del = Math.min(0.0034, span * 0.9);
    const zb = span > 1e-5 ? ((t * 0.42) * del) / span : 0;
    const ein = [x + nx * (w - del), y + ny * (w - del)];
    const eout = [x + nx * (w + 0.0003), y + ny * (w + 0.0003)];
    edgeF0.push([ein[0], ein[1], zb + 0.00012, u]);
    edgeF1.push([eout[0], eout[1], 0.00012, u]);
    edgeB0.push([eout[0], eout[1], -0.00012, u]);
    edgeB1.push([ein[0], ein[1], -zb - 0.00012, u]);
    // la veta de luz del mejorado (entre el lomo y la arista), afinada en las puntas
    const ui = Math.min(1, Math.max(0, (u - 0.03) / 0.8));
    const taper = Math.sin(Math.PI * ui) ** 0.6;
    const a0 = 0.13;
    const a1 = 0.13 + 0.1 * taper;
    const zf = (a) => t / 2 + (t * 0.42 - t / 2) * (a / RIDGE) + 0.00015;
    const p0 = at(a0);
    const p1 = at(a1);
    inF0.push([p0[0], p0[1], zf(a0), u]);
    inF1.push([p1[0], p1[1], zf(a1), u]);
    inB0.push([p1[0], p1[1], -zf(a1), u]);
    inB1.push([p0[0], p0[1], -zf(a0), u]);
  }
  // (la veta va de 0.03 a 0.83 del largo: afuera se aplasta en cero)
  const cut = (rows) => rows.map((r) => r.filter((p) => p[3] >= 0.03 && p[3] <= 0.83));
  const steel = mergeGeometries([gridGeo([spP, rP, eE], [0, RIDGE, 1]), gridGeo([eE, rM, spM], [1, RIDGE, 0]), gridGeo([spM, spP], [0, 0])]);
  const edge = mergeGeometries([gridGeo([edgeF0, edgeF1]), gridGeo([edgeB0, edgeB1])]);
  const inlay = mergeGeometries([[inF0, inF1], [inB0, inB1]].map((pair) => gridGeo(cut(pair))));
  // la espiga (lo que entra en el puño; solo se ve en la pieza suelta)
  const tang = new THREE.BoxGeometry(0.012, 0.11, 0.004).translate(-0.004 + 0.008, -0.055, 0);
  BLADE_GEO = { steel, edge, inlay, tang };
  return BLADE_GEO;
}

// La hoja sola: { group, tip, mid } (tip y mid: la punta y la mitad del filo).
function bladeMesh(up, M) {
  const G = bladeGeos();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.steel, up ? M.steelUp : M.steel));
  g.add(new THREE.Mesh(G.edge, up ? M.edgeUp : M.edge));
  if (up) g.add(new THREE.Mesh(G.inlay, M.inlay));
  const tip = new THREE.Object3D();
  edgePoint(1, tip.position);
  const mid = new THREE.Object3D();
  edgePoint(0.4, mid.position, 0.5);
  g.add(tip, mid);
  return { group: g, tip, mid };
}

// ---------------- la empuñadura ----------------
// Barrido de un óvalo por una curva plana (en x-y): radios rx (en el plano) y
// rz (de canto) a lo largo. uv: x alrededor, y a lo largo.
function sweepGeo(pts, radius, seg = 14, caps = false) {
  const M = pts.length;
  const pos = [];
  const uv = [];
  const d = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(M - 1, i + 1)];
    d.subVectors(b, a).normalize();
    // en el plano: perpendicular a la curva; de canto: z
    const nx = d.y;
    const ny = -d.x;
    const [rx, rz] = radius(i / (M - 1));
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      pos.push(pts[i].x + nx * c * rx, pts[i].y + ny * c * rx, pts[i].z + s * rz);
      uv.push(j / seg, i / (M - 1));
    }
  }
  const idx = [];
  for (let i = 0; i < M - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (caps) {
    for (const [i, flip] of [[0, false], [M - 1, true]]) {
      const ci = pos.length / 3;
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      uv.push(0.5, i / (M - 1));
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j;
        if (flip) idx.push(ci, a + 1, a);
        else idx.push(ci, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// La línea del puño: baja derecho y al final el pomo se dobla hacia el filo.
const GRIP_TOP = -0.019;
const GRIP_LEN = 0.112;
function gripPts() {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    const y = GRIP_TOP - k * GRIP_LEN;
    const bend = Math.pow(Math.max(0, (k - 0.55) / 0.45), 2.2);
    pts.push(new THREE.Vector3(bend * 0.024, y + bend * 0.006, 0));
  }
  return pts;
}

let HILT_GEO = null;
function hiltGeos() {
  if (HILT_GEO) return HILT_GEO;
  // la cruz: el centro, los gavilanes (un poco caídos hacia el puño) con sus
  // bolitas, los escusones en rombo de los dos lados y la virola de abajo
  const giltParts = [];
  giltParts.push(new RoundedBoxGeometry(0.03, 0.017, 0.016, 2, 0.003).translate(0.004, -0.004, 0));
  for (const sx of [-1, 1]) {
    const q = new THREE.CylinderGeometry(0.0038, 0.0052, 0.046, 10).rotateZ(Math.PI / 2).translate(sx * 0.03, 0, 0);
    q.rotateZ(sx * -0.12);
    q.translate(0.004, -0.005, 0);
    giltParts.push(q);
    const tipX = 0.004 + sx * 0.053 * Math.cos(0.12);
    const tipY = -0.005 - 0.053 * Math.sin(0.12);
    giltParts.push(new THREE.SphereGeometry(0.0068, 12, 10).translate(tipX, tipY, 0));
    giltParts.push(new THREE.ConeGeometry(0.0035, 0.008, 10).rotateZ(-sx * Math.PI / 2).translate(tipX + sx * 0.0085, tipY, 0));
    // un anillito entre el gavilán y la bolita
    giltParts.push(new THREE.TorusGeometry(0.0046, 0.0012, 6, 14).rotateY(Math.PI / 2).translate(tipX - sx * 0.0072, tipY + 0.0008, 0));
  }
  const lang = new THREE.Shape();
  lang.moveTo(0, 0.042);
  lang.quadraticCurveTo(0.0045, 0.022, 0.0095, 0.004);
  lang.lineTo(0.007, -0.012);
  lang.quadraticCurveTo(0.002, -0.024, 0, -0.03);
  lang.quadraticCurveTo(-0.002, -0.024, -0.007, -0.012);
  lang.lineTo(-0.0095, 0.004);
  lang.quadraticCurveTo(-0.0045, 0.022, 0, 0.042);
  for (const sz of [-1, 1]) {
    const l = new THREE.ExtrudeGeometry(lang, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 6 });
    l.translate(0, 0, -0.0008);
    l.translate(0.007, -0.004, sz * (T0 / 2 + 0.0016));
    giltParts.push(l);
  }
  // la virola del puño y el casquete del pomo (orientado con la punta de la curva)
  giltParts.push(new THREE.CylinderGeometry(0.0128, 0.0134, 0.008, 18).scale(1, 1, 0.78).translate(0, GRIP_TOP + 0.002, 0));
  const P = gripPts();
  const end = P[P.length - 1];
  const dir = new THREE.Vector3().subVectors(end, P[P.length - 3]).normalize();
  const cap = mergeGeometries([
    new THREE.CylinderGeometry(0.0118, 0.0138, 0.011, 18).scale(1, 1, 0.8).translate(0, 0.0055, 0),
    new THREE.SphereGeometry(0.0118, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.8).translate(0, 0.011, 0),
    new THREE.SphereGeometry(0.0034, 10, 8).translate(0, 0.0175, 0),
  ]);
  cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  cap.translate(end.x - dir.x * 0.002, end.y - dir.y * 0.002, 0);
  giltParts.push(cap);
  // el puño de ébano: ovalado, más gordo al medio
  const grip = sweepGeo(P, (k) => {
    const bulge = 1 + Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.1;
    return [0.0118 * bulge, 0.0094 * bulge];
  }, 18);
  // la argolla de la dragona, abajo del lado del lomo
  const ring = new THREE.TorusGeometry(0.0042, 0.0011, 6, 14).translate(-0.011, GRIP_TOP - 0.086, 0);
  giltParts.push(ring);
  HILT_GEO = { gilt: mergeGeometries(giltParts.map((g) => (g.index ? g.toNonIndexed() : g)).map(cleanAttrs)), grip, ring: new THREE.Vector3(-0.011, GRIP_TOP - 0.09, 0), pommel: end.clone() };
  return HILT_GEO;
}
// (para juntar geometrías: todas con posición, normal y uv)
function cleanAttrs(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// La escarapela del mejorado, en la cruz (de los dos lados).
let ESC_GEO = null;
function escarapela(M) {
  ESC_GEO ||= {
    out: new THREE.RingGeometry(0.0062, 0.0098, 24),
    mid: new THREE.RingGeometry(0.0032, 0.0062, 24),
    inner: new THREE.CircleGeometry(0.0032, 20),
  };
  const g = new THREE.Group();
  for (const sz of [-1, 1]) {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(ESC_GEO.out, M.celeste), new THREE.Mesh(ESC_GEO.mid, M.white), new THREE.Mesh(ESC_GEO.inner, M.celeste));
    e.children[1].position.z = 0.0002;
    e.children[2].position.z = 0.0004;
    e.position.set(0.004, -0.004, sz * 0.0089);
    if (sz < 0) e.rotation.y = Math.PI;
    g.add(e);
  }
  return g;
}

// La dragona: un cordón dorado que cuelga del pomo con su borla (el mejorado:
// dos cintas, celeste y blanca). Cuelga de `pivot` (para que se hamaque).
let DRAG_GEO = null;
function dragona(up, M) {
  if (!DRAG_GEO) {
    const loop = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0.002),
      new THREE.Vector3(0.006, -0.03, 0.006),
      new THREE.Vector3(0.002, -0.07, 0.004),
      new THREE.Vector3(-0.004, -0.09, 0),
      new THREE.Vector3(-0.006, -0.07, -0.004),
      new THREE.Vector3(-0.004, -0.03, -0.006),
      new THREE.Vector3(0, 0, -0.002),
    ]);
    const cord = new THREE.TubeGeometry(loop, 40, 0.0017, 6, false);
    const slide = new THREE.CylinderGeometry(0.0045, 0.0052, 0.012, 12).translate(-0.003, -0.094, 0);
    const knob = new THREE.SphereGeometry(0.0072, 12, 10).scale(1, 1.15, 1).translate(-0.003, -0.105, 0);
    // los flecos: muchos hilitos en cono (un cilindro abierto alcanza)
    const fringe = new THREE.CylinderGeometry(0.0062, 0.0105, 0.04, 16, 1, true).translate(-0.003, -0.13, 0);
    const tassel = mergeGeometries([slide, knob, fringe].map((g) => cleanAttrs(g.toNonIndexed())));
    // las cintas del mejorado: dos tiras que caen y se abren
    const strip = (x0, sway) => {
      const rows = [[], []];
      for (let i = 0; i <= 16; i++) {
        const k = i / 16;
        const y = -k * 0.13;
        const x = x0 + Math.sin(k * 3.2) * sway;
        const z = Math.sin(k * 5 + x0 * 90) * 0.004;
        rows[0].push([x - 0.0045, y, z]);
        rows[1].push([x + 0.0045, y, z]);
      }
      return gridGeo(rows);
    };
    DRAG_GEO = { cord, tassel, cel: strip(-0.005, 0.008), bla: strip(0.005, -0.006) };
  }
  const g = new THREE.Group();
  if (up) {
    g.add(new THREE.Mesh(DRAG_GEO.cel, M.celeste), new THREE.Mesh(DRAG_GEO.bla, M.white));
    const knot = new THREE.Mesh(DRAG_GEO.tassel, M.giltUp);
    knot.scale.setScalar(0.6);
    knot.position.y = 0.05;
    g.add(knot);
  } else g.add(new THREE.Mesh(DRAG_GEO.cord, M.cord), new THREE.Mesh(DRAG_GEO.tassel, M.cord));
  return g;
}

// La empuñadura entera: { group, dragona }.
function hiltMesh(up, M, withDragona = true) {
  const G = hiltGeos();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.gilt, up ? M.giltUp : M.gilt));
  g.add(new THREE.Mesh(G.grip, M.ebony));
  if (up) g.add(escarapela(M));
  let drag = null;
  if (withDragona) {
    drag = new THREE.Group();
    drag.position.copy(G.ring);
    drag.add(dragona(up, M));
    g.add(drag);
  }
  return { group: g, dragona: drag };
}

// El sable armado (sin vaina): { group, blade, tip, mid, dragona }.
export function buildSable(up = 0, { dragona: withD = true } = {}) {
  const M = sableMats();
  const g = new THREE.Group();
  const b = bladeMesh(up, M);
  const h = hiltMesh(up, M, withD);
  g.add(b.group, h.group);
  return { group: g, blade: b.group, tip: b.tip, mid: b.mid, dragona: h.dragona };
}

// ---------------- la vaina ----------------
const VAINA_L = 0.845;
let VAINA_GEO = null;
function vainaGeos() {
  if (VAINA_GEO) return VAINA_GEO;
  const fr = {};
  const pts = [];
  const rad = [];
  const NV = 60;
  // sigue la curva de la hoja por el medio del ancho, un poco más larga
  for (let i = 0; i <= NV; i++) {
    const s = (i / NV) * VAINA_L;
    const u = Math.min(1, s / BLADE_L);
    bladeFrame(Math.min(0.97, u), fr);
    const w = Math.max(0.013, W0 * (1 - 0.2 * Math.min(u, TIP)));
    // (pasada la hoja sigue derecho en la dirección del final)
    const ext = Math.max(0, s - BLADE_L * 0.97);
    const dx = -fr.ny;
    const dy = fr.nx;
    pts.push(new THREE.Vector3(fr.x + fr.nx * w * 0.5 + dx * ext, fr.y + fr.ny * w * 0.5 + dy * ext, 0));
    const end = smooth(0.94, 1, i / NV);
    rad.push([w * 0.5 + 0.0052 - end * 0.006, tAt(u) * 0.5 + 0.0042 - end * 0.002]);
  }
  const radius = (k) => rad[Math.round(k * NV)];
  const leather = sweepGeo(pts, radius, 16, true);
  const span = (a, b, grow) => {
    const i0 = Math.round((a / VAINA_L) * NV);
    const i1 = Math.round((b / VAINA_L) * NV);
    const P = pts.slice(i0, i1 + 1);
    const R = rad.slice(i0, i1 + 1);
    return sweepGeo(P, (k) => {
      const r = R[Math.round(k * (R.length - 1))];
      return [r[0] + grow, r[1] + grow];
    }, 16, true);
  };
  const giltParts = [span(0, 0.075, 0.0013), span(0.2, 0.222, 0.0011), span(0.42, 0.442, 0.0011), span(0.74, VAINA_L, 0.0012)];
  // las anillas de las abrazaderas, del lado del lomo (-n)
  for (const s of [0.211, 0.431]) {
    const i = Math.round((s / VAINA_L) * NV);
    bladeFrame(s / BLADE_L, fr);
    const r = rad[i][0] + 0.0012;
    const c = pts[i];
    const lug = new THREE.BoxGeometry(0.006, 0.01, 0.004).translate(c.x - fr.nx * (r + 0.002), c.y - fr.ny * (r + 0.002), 0);
    const ring = new THREE.TorusGeometry(0.011, 0.0016, 8, 20).rotateX(Math.PI / 2).translate(c.x - fr.nx * (r + 0.012), c.y - fr.ny * (r + 0.012), 0);
    giltParts.push(lug, ring);
  }
  // la bolita de la contera
  const last = pts[NV];
  giltParts.push(new THREE.SphereGeometry(0.0062, 12, 10).translate(last.x, last.y, 0));
  // la ranura de la boca, del lado del lomo
  bladeFrame(0.05, fr);
  const slit = new THREE.BoxGeometry(0.0016, 0.1, 0.0034).translate(pts[0].x - fr.nx * (rad[0][0] + 0.0004), 0.05, 0);
  VAINA_GEO = { leather, gilt: mergeGeometries(giltParts.map((g) => cleanAttrs(g.index ? g.toNonIndexed() : g))), slit };
  return VAINA_GEO;
}

function vainaMesh(M) {
  const G = vainaGeos();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.leather, M.leather), new THREE.Mesh(G.gilt, M.gilt), new THREE.Mesh(G.slit, M.slit));
  return g;
}

// ---------------- lo que usa el mapa ----------------
// El sable armado de verdad (para la forja de la Llama Votiva): la cruz en el
// origen, la hoja hacia +y, el filo hacia +x. up: 1 el de San Lorenzo.
// vaina: true lo pone envainado a medias al lado (no: solo el sable).
export function sableModel(up = 0) {
  const s = buildSable(up);
  s.group.userData.sable = { tip: s.tip, mid: s.mid };
  s.group.name = 'sableCorvo';
  return s.group;
}

// Las tres piezas del sable para buscar en el mapa (de tamaño real):
// 'hoja' (la hoja con su espiga), 'empunadura' (cruz, puño, pomo y dragona) y
// 'vaina'. Cada una con el origen en el lugar donde se juntan (la cruz).
export function sablePartModel(kind) {
  const M = sableMats();
  const g = new THREE.Group();
  const k = String(kind).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (k === 'hoja') {
    const b = bladeMesh(0, M);
    g.add(b.group);
    g.add(new THREE.Mesh(bladeGeos().tang, M.tang));
  } else if (k === 'empunadura' || k === 'puno' || k === 'mango') g.add(hiltMesh(0, M, true).group);
  else if (k === 'vaina') g.add(vainaMesh(M));
  else throw new Error(`sablePartModel: pieza desconocida ${kind}`);
  g.name = `sable-${k}`;
  return g;
}
