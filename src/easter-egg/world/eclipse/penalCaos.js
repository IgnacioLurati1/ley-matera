import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, DOORS } from '../../config/map';
import { ISLANDS } from '../../config/maps/eclipse';
import { rng } from '../../core/noise';
import { voidRockMat, keepOut } from './centro';
import { cot, bucket } from '../penalProps';
import { compactGroup } from '../props';

// El penal desarmado por la disformidad (arte6, 2026-10-06; el usuario: "la
// zona de Mate of the Dead está poco deforme, es casi un calco del original").
// Al estilo de Revelations, sin tocar el choque ni el paso (todo es visual):
//  · boquetes: pedazos de pared arrancados (las paredes que dan al vacío) por
//    donde se ve el vacío de verdad (un "punzón" de profundidad que se dibuja
//    antes que la pared: se ve el cielo del eclipse), el borde roto con la luz
//    violeta, piedras que asoman y ladrillos que se van en hilera hacia el vacío;
//  · techos reventados: el cielorraso abierto al cielo (el mismo punzón, desde
//    adentro), la chapa levantada en pétalos alrededor y chapas que vuelan;
//  · pedazos enteros del penal (piso, pared con su ventana enrejada, un catre)
//    que se soltaron y flotan a unos metros, inclinados, con la estela de
//    piedras que los une al borde;
//  · el patio partido: losas que se van del borde de las rejas hacia el vacío;
//  · grietas de luz violeta que corren por los pisos;
//  · rejas dobladas que flotan en el aire del pabellón y del comedor;
//  · catres y baldes flotando adentro de las celdas;
//  · (la torre de guardia partida e inclinada: breakTower, desde penal.js).
// Se arma en el primer cuadro (después de v5b: no pisa sus piezas). Lo que se
// mueve: unas pocas mallas instanciadas, solo con la cámara cerca.
// globalThis.__mduNoPenalCaos: nada de esto.

const FLOOR = 1;
const WALL = 2;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const OFF = () => globalThis.__mduNoPenalCaos === true;

let W = null;
let LIVE = null;

export function build(w) {
  if (OFF() || globalThis.__mduEclipse !== true || !ISLANDS.penal) return;
  W = w;
  LIVE = { built: false };
}

export function update(dt, t) {
  if (!LIVE) return;
  if (!LIVE.built) {
    const g = W.g;
    if (!g?.interact?.list?.length || !g.ee || !W.navBlock) return;
    LIVE.built = true;
    try {
      armar(W, g);
    } catch (e) {
      console.error('Eclipse penalCaos: no se armó', e);
    }
  }
  const cam = W.g?.camera;
  if (!cam || !LIVE.anim) return;
  const [x0, z0, x1, z1] = ISLANDS.penal.box;
  const c = cam.position;
  const near = c.x > x0 - 70 && c.x < x1 + 70 && c.z > z0 - 70 && c.z < z1 + 70;
  LIVE.root.visible = near;
  if (!near) return;
  for (const a of LIVE.anim) a(t);
}

// ---------------- materiales ----------------
let MATS = null;
function mats(w) {
  if (MATS) return MATS;
  const T = w.T;
  MATS = {
    // el punzón: solo profundidad, antes que todo (después del cielo): lo de atrás no se dibuja
    punch: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.FrontSide }),
    // el borde roto: violeta que quema adentro, oscuro afuera (color por vértice, > 1 brilla)
    rim: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15), side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ map: T.stoneWall, roughness: 0.92 }),
    plaster: w.M.cellWall || w.M.plasterWhite || w.M.concrete,
    tin: w.M.roofTin || w.M.corrugated || w.M.iron,
    iron: w.M.bars || w.M.iron,
    rock: voidRockMat(w),
    dirt: w.M.dirt || w.M.dirtDark,
    concrete: w.M.concrete,
    // la grieta del piso: luz que corre a lo largo
    crack: new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'attribute float aW; varying vec2 vUv; varying float vW; void main() { vUv = uv; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vW;
        void main() {
          float d = abs(vUv.y - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.12, 0.35, d);
          float glow = 1.0 - smoothstep(0.2, 1.0, d);
          float run = 0.65 + 0.35 * sin(vUv.x * 0.9 - uTime * 1.6);
          vec3 col = vec3(0.02, 0.0, 0.05) * core + vec3(0.62, 0.3, 1.0) * (glow - core * 0.6) * 1.7 * run + vec3(0.9, 0.6, 1.3) * core * 0.15 * run;
          float a = clamp(core + glow * 0.75, 0.0, 1.0) * vW;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    }),
  };
  // el vacío visto desde arriba de un techo (sin punzón: ahí debajo está la sala)
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = rng(717);
  x.fillStyle = '#06020e';
  x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 70; k++) {
    x.fillStyle = `rgba(230,210,255,${0.3 + r() * 0.7})`;
    x.fillRect(r() * 256, r() * 256, 1.6, 1.6);
  }
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(120,50,220,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  MATS.voidTop = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return MATS;
}

// un contorno quebrado (n puntos) de semiancho a, semialto b
function jagged(r, a, b, n = 22) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const k2 = 0.72 + r() * 0.3 + (k % 2 ? -0.08 : 0.06);
    pts.push([Math.cos(t) * a * k2, Math.sin(t) * b * k2]);
  }
  return pts;
}
// el polígono plano (en x, y local) y el anillo del borde (de pts a pts*grow, color de adentro a afuera)
function holeGeos(r, pts) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const punch = new THREE.ShapeGeometry(shape);
  const P = [];
  const C = [];
  const I = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const [x, y] = pts[k];
    // (un borde fino y quebrado: el canto quemado de violeta, afuera el revoque/la madera rota oscura)
    const g = 1.04 + r() * 0.14 + (k % 3 === 0 ? 0.08 : 0);
    P.push(x, y, 0, x * g, y * g, 0);
    const hot = 0.45 + r() * 0.55;
    C.push(0.62 * hot, 0.26 * hot, 1.0 * hot, 0.06, 0.04, 0.05);
  }
  for (let k = 0; k < n; k++) {
    const a = k * 2;
    const b = ((k + 1) % n) * 2;
    I.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  rim.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  rim.setIndex(I);
  return { punch, rim };
}

// ---------------- armado ----------------
function armar(w, g) {
  const M = mats(w);
  const r = rng(9191);
  const root = new THREE.Group();
  root.name = 'eclipse:penalCaos';
  w.root.add(root);
  const out = keepOut();
  // lo usable (g.interact) y lo que ya deformó v5b
  const busy = [];
  for (const it of g.interact.list) if (it.pos) busy.push([it.pos.x, it.pos.z, 2.2]);
  for (const d of w.v5bDeform || []) if (Number.isFinite(d[2])) busy.push([d[2], d[3], 2.5]);
  const isBusy = (x, z, rad = 0) => out(x, z, rad) || busy.some(([px, pz, rr]) => Math.hypot(x - px, z - pz) < rr + rad);
  const own = new Set(ISLANDS.penal.zones.filter((k) => ZONES[k] && !ZONES[k].frag).map((k) => w.zoneKeys.indexOf(k)));
  const zoneOf = (i) => (w.grid[i] === FLOOR && own.has(w.zone[i]) ? ZONES[w.zoneKeys[w.zone[i]]] : null);
  const doorNear = (x, z, d = 2.2) => DOORS.some((D) => D.cells.some(([cx, cz]) => Math.hypot(cx + 0.5 - x, cz + 0.5 - z) < d));
  // lo que se junta en mallas: [material] -> geometrías en el mundo
  const bag = new Map();
  const put = (mat, geo) => {
    if (!bag.has(mat)) bag.set(mat, []);
    bag.get(mat).push(geo);
  };
  const punches = [];
  const anim = [];
  const flows = []; // ladrillos/piedras que se van: { c, dir, len, up, n, s, kind }
  const floats = []; // cosas que flotan quietas (con vaivén): { geoKind, mat, c, rot, sp, amp }
  // ---- 1. boquetes en las paredes que dan al vacío ----
  const [bx0, bz0, bx1, bz1] = ISLANDS.penal.box;
  const cands = [];
  for (let z = bz0; z <= bz1; z++) {
    for (let x = bx0; x <= bx1; x++) {
      if (!w.inside(x, z)) continue;
      const j = w.idx(x, z);
      if (w.grid[j] !== WALL || w.edge[j] !== 0) continue;
      for (const [dx, dz] of D4) {
        const i = w.idx(x - dx, z - dz);
        const Z = zoneOf(i);
        if (!Z || Z.outdoor) continue;
        const k = w.idx(x + dx, z + dz);
        if (w.grid[k] === FLOOR || w.grid[k] === WALL) continue;
        if (w.top[j] - w.fy[i] < 3.3) continue;
        cands.push({ x, z, dx, dz, i, j, Z });
      }
    }
  }
  // tramos seguidos de 4 celdas (sin puertas ni nada usable delante)
  const okRun = (c) => {
    const ax = c.dz ? 1 : 0;
    const az = c.dx ? 1 : 0;
    for (let q = -1; q <= 1; q++) {
      const j = w.idx(c.x + ax * q, c.z + az * q);
      const i = w.idx(c.x + ax * q - c.dx, c.z + az * q - c.dz);
      if (w.grid[j] !== WALL || w.edge[j] !== 0 || zoneOf(i) !== c.Z || Math.abs(w.fy[i] - w.fy[c.i]) > 0.05) return false;
    }
    return true;
  };
  const holes = [];
  for (let t = 0; t < 1500 && holes.length < 12; t++) {
    const c = cands[Math.floor(r() * cands.length)];
    if (!c || !okRun(c)) continue;
    const fx = c.x + 0.5 - c.dx * 0.5;
    const fz = c.z + 0.5 - c.dz * 0.5;
    if (holes.some((h) => Math.hypot(h.fx - fx, h.fz - fz) < 6) || doorNear(fx, fz, 1.6) || isBusy(fx - c.dx * 1.2, fz - c.dz * 1.2, 1)) continue;
    if (holes.filter((h) => h.Z === c.Z).length >= 3) continue;
    holes.push({ ...c, fx, fz });
  }
  const wallH = (c) => w.top[c.j] - w.fy[c.i];
  for (const h of holes) {
    const fy = w.fy[h.i];
    const H = wallH(h);
    const a = 1.7 + r() * 1.1;
    const b = Math.max(0.7, Math.min(1.6 + r() * 0.9, (H - 1.2) / 2));
    const cy = fy + 0.95 + b + r() * Math.max(0, H - 2.4 - 2 * b) * 0.5;
    const pts = jagged(r, a, b);
    const { punch, rim } = holeGeos(r, pts);
    // de los dos lados: la cara de la sala (mirando a la sala) y la de afuera (mirando al vacío)
    for (const s of [-1, 1]) {
      const nx = h.dx * s;
      const nz = h.dz * s;
      // (la cara de la sala está en el borde de la celda de pared; la de afuera, un poco más allá: penal.js buildOutside)
      const off = s < 0 ? -0.035 : 1.07;
      const m4 = new THREE.Matrix4().makeRotationY(Math.atan2(nx, nz));
      m4.setPosition(h.x + 0.5 - h.dx * 0.5 + h.dx * off, cy, h.z + 0.5 - h.dz * 0.5 + h.dz * off);
      punches.push(punch.clone().applyMatrix4(m4));
      const m5 = m4.clone().setPosition(h.x + 0.5 - h.dx * 0.5 + h.dx * (off + s * 0.015), cy, h.z + 0.5 - h.dz * 0.5 + h.dz * (off + s * 0.015));
      put(M.rim, rim.clone().applyMatrix4(m5));
      // piedras rotas que asoman del canto
      for (const [px, py] of pts) {
        if (r() < 0.45) continue;
        const sz = 0.1 + r() * 0.2;
        const st = new THREE.DodecahedronGeometry(sz, 0);
        st.scale(1.4, 0.8, 1);
        const p = new THREE.Vector3(px * 1.08, py * 1.08, 0.04 + r() * 0.18).applyMatrix4(m4);
        st.rotateX(r() * 3).rotateY(r() * 3).translate(p.x, p.y, p.z);
        put(s < 0 ? M.plaster : M.stone, st);
      }
    }
    // los ladrillos que se van por el boquete hacia el vacío, en hilera
    flows.push({ c: [h.x + 0.5 + h.dx * 0.6, cy, h.z + 0.5 + h.dz * 0.6], dir: [h.dx, 0.25, h.dz], len: 11 + r() * 6, n: 16, ph: r() * 10, sp: 0.06 + r() * 0.03, kind: 'brick' });
    // y unos que flotan adentro, cerca del boquete (arriba de las cabezas)
    for (let k = 0; k < 5; k++) floats.push({ kind: 'brick', c: [h.fx - h.dx * (0.4 + r() * 0.8) + (h.dz ? (r() - 0.5) * a * 1.6 : 0), Math.max(fy + 2.3, cy + (r() - 0.5) * b), h.fz - h.dz * (0.4 + r() * 0.8) + (h.dx ? (r() - 0.5) * a * 1.6 : 0)], ph: r() * 6, sp: 0.2 + r() * 0.3, s: 1 });
  }
  // ---- 2. techos reventados ----
  const roofs = [];
  for (const k of ['pA', 'pA', 'pB', 'pC', 'pD', 'pE', 'pF', 'pG']) {
    const Z = ZONES[k];
    if (!Z || Z.outdoor || !Z.roof) continue;
    const zid = w.zoneKeys.indexOf(k);
    for (let t = 0; t < 60; t++) {
      const R0 = Z.rects[0];
      const x = R0[0] + 2 + r() * Math.max(0.1, R0[2] - R0[0] - 3);
      const z = R0[1] + 2 + r() * Math.max(0.1, R0[3] - R0[1] - 3);
      const i = w.idx(Math.floor(x), Math.floor(z));
      if (w.grid[i] !== FLOOR || w.zone[i] !== zid) continue;
      if (roofs.some((q) => Math.hypot(q.x - x, q.z - z) < 7)) continue;
      // (el techo de la zona; los rects con su techo propio, no)
      roofs.push({ x, z, Z, roof: Z.roof });
      break;
    }
  }
  for (const R of roofs) {
    const a = 1.9 + r() * 1.0;
    const pts = jagged(r, a, a * (0.7 + r() * 0.3), 20);
    const { punch, rim } = holeGeos(r, pts);
    const rot = r() * 3;
    // desde adentro: el punzón mirando para abajo, debajo del cielorraso
    const m4 = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(rot));
    m4.setPosition(R.x, R.roof - 0.03, R.z);
    punches.push(punch.clone().applyMatrix4(m4));
    put(M.rim, rim.clone().applyMatrix4(m4.clone().setPosition(R.x, R.roof - 0.045, R.z)));
    // desde arriba: el vacío (sin punzón) y la chapa levantada en pétalos
    const m6 = new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationY(rot));
    m6.setPosition(R.x, R.roof + 0.06, R.z);
    const top = punch.clone().applyMatrix4(m6);
    // (uv del vacío: de la caja)
    const P = top.attributes.position;
    const U = new Float32Array(P.count * 2);
    for (let k = 0; k < P.count; k++) {
      U[k * 2] = (P.getX(k) - R.x) / (a * 2.4) + 0.5;
      U[k * 2 + 1] = (P.getZ(k) - R.z) / (a * 2.4) + 0.5;
    }
    top.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    put(M.voidTop, top);
    put(M.rim, rim.clone().applyMatrix4(m6.clone().setPosition(R.x, R.roof + 0.07, R.z)));
    for (let k = 0; k < 7; k++) {
      const t = (k / 7) * Math.PI * 2 + r() * 0.4;
      const [px, pz] = [Math.cos(t) * a * 0.95, Math.sin(t) * a * 0.8];
      const sheet = new THREE.PlaneGeometry(1.1 + r() * 0.5, 1.0 + r() * 0.6, 1, 4);
      // (doblada: más cuanto más lejos de la bisagra)
      const SP = sheet.attributes.position;
      for (let q = 0; q < SP.count; q++) {
        const v = SP.getY(q) + 0.5;
        SP.setZ(q, v * v * 0.35);
      }
      sheet.translate(0, 0.5, 0);
      sheet.computeVertexNormals();
      const ang = Math.atan2(pz, px);
      const mm = new THREE.Matrix4().makeRotationX(-(0.5 + r() * 1.1));
      mm.premultiply(new THREE.Matrix4().makeRotationY(-ang + Math.PI / 2));
      mm.setPosition(R.x + Math.cos(ang + rot) * 0, R.roof + 0.08, R.z);
      const hinge = new THREE.Vector3(px, 0, pz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      mm.setPosition(R.x + hinge.x, R.roof + 0.08, R.z + hinge.z);
      // (la bisagra mira hacia afuera del agujero)
      const look = new THREE.Matrix4().makeRotationY(Math.atan2(hinge.x, hinge.z));
      const tilt = new THREE.Matrix4().makeRotationX(-(0.6 + r() * 1.0));
      const mf = new THREE.Matrix4().multiplyMatrices(look, tilt);
      mf.setPosition(R.x + hinge.x, R.roof + 0.08, R.z + hinge.z);
      put(M.tin, sheet.applyMatrix4(mf));
      void mm;
    }
    // el pedazo de techo que se arrancó: flota arriba, torcido, con su cielorraso y su chapa
    {
      const sx = a * 2.1;
      const sz = a * 1.7;
      const L = (w2, h2, d2, x2 = 0, y2 = 0, z2 = 0) => new THREE.Matrix4().makeTranslation(x2, y2, z2).multiply(new THREE.Matrix4().makeScale(w2, h2, d2));
      const pos = [R.x + (r() - 0.5) * 2, R.roof + 3.5 + r() * 3, R.z + (r() - 0.5) * 2];
      RIGID.push({
        p: pos,
        rot: [(r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9],
        ph: r() * 6,
        sp: 0.3,
        spin: 0.03,
        parts: { tin: [L(sx, 0.3, sz)], ceil: [L(sx - 0.1, 0.06, sz - 0.1, 0, -0.18)], beam: [L(0.22, 0.3, sz * 1.15, -sx * 0.3, -0.35), L(0.22, 0.3, sz * 1.15, sx * 0.3, -0.35)], glow: [L(sx + 0.04, 0.07, 0.07, 0, -0.1, sz / 2)] },
      });
      flows.push({ c: [R.x, R.roof + 0.2, R.z], dir: [0, 1, 0], len: pos[1] - R.roof - 0.4, n: 10, ph: r() * 10, sp: 0.05, kind: 'rock' });
    }
    // chapas que vuelan arriba del agujero, dando vueltas
    for (let k = 0; k < 4; k++) floats.push({ kind: 'tin', c: [R.x + (r() - 0.5) * 4, R.roof + 2 + r() * 5, R.z + (r() - 0.5) * 4], ph: r() * 6, sp: 0.15 + r() * 0.2, s: 0.9 + r() * 0.5 });
    // y pedazos del cielorraso que se despegan hacia adentro (arriba de las cabezas)
    for (let k = 0; k < 4; k++) floats.push({ kind: 'plank', c: [R.x + (r() - 0.5) * 2.5, R.roof - 0.8 - r() * 1.4, R.z + (r() - 0.5) * 2.5], ph: r() * 6, sp: 0.15 + r() * 0.2, s: 1 });
  }
  // ---- 3. pedazos del penal que se fueron flotando (afuera del borde) ----
  const chunkAt = [];
  for (const c of cands) {
    if (chunkAt.length >= 6) break;
    if (r() < 0.55) continue;
    const ex = c.x + 0.5 + c.dx * (7 + r() * 4);
    const ez = c.z + 0.5 + c.dz * (7 + r() * 4);
    if (chunkAt.some((q) => Math.hypot(q.x - ex, q.z - ez) < 14)) continue;
    let clear = true;
    for (let oz = -4; oz <= 4 && clear; oz++) for (let ox = -4; ox <= 4; ox++) {
      const cx = Math.floor(ex + ox);
      const cz = Math.floor(ez + oz);
      if (w.inside(cx, cz) && w.grid[w.idx(cx, cz)] !== 0) clear = false;
    }
    if (!clear) continue;
    chunkAt.push({ x: ex, z: ez, y: w.fy[c.i] + 1.5 + r() * 5, c, Z: c.Z });
  }
  for (const C of chunkAt) {
    const grp = new THREE.Group();
    const sx = 4.5 + r() * 2;
    const sz = 3.4 + r() * 1.4;
    const floorMat = w.M[C.Z.floor] || M.concrete;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.35, sz), floorMat);
    slab.position.y = -0.17;
    grp.add(slab);
    // la roca de abajo (el cimiento arrancado)
    for (let k = 0; k < 6; k++) {
      const s = 0.6 + r() * 0.9;
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
      rk.position.set((r() - 0.5) * sx * 0.7, -0.4 - s * 0.5 - r() * 0.6, (r() - 0.5) * sz * 0.7);
      rk.scale.set(1.2, 0.8 + r() * 0.8, 1.1);
      grp.add(rk);
    }
    // la pared del penal en L, con su ventana enrejada (el revoque de adentro)
    const wh = 2.6 + r() * 1.2;
    const wl = new THREE.Mesh(new THREE.BoxGeometry(sx, wh, 0.4), M.stone);
    wl.position.set(0, wh / 2, -sz / 2 + 0.2);
    const wi = new THREE.Mesh(new THREE.BoxGeometry(sx - 0.1, wh - 0.1, 0.05), M.plaster);
    wi.position.set(0, wh / 2, -sz / 2 + 0.43);
    const wl2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, wh * (0.5 + r() * 0.4), sz * 0.7), M.stone);
    wl2.position.set(-sx / 2 + 0.2, wl2.geometry.parameters.height / 2, -sz * 0.15);
    grp.add(wl, wi, wl2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), new THREE.MeshBasicMaterial({ color: 0x050208 }));
    win.position.set(sx * 0.15, wh * 0.62, -sz / 2 + 0.47);
    grp.add(win);
    for (let k = 0; k < 5; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 5), M.iron);
      bar.position.set(sx * 0.15 - 0.36 + k * 0.18, wh * 0.62, -sz / 2 + 0.5);
      bar.rotation.z = k === 3 ? 0.35 : 0;
      grp.add(bar);
    }
    // un catre y un balde (lo de la celda que se fue con el pedazo)
    const fur = new THREE.Group();
    cot(fur, w.M, 0.3, -sz / 2 + 0.9, 0, false);
    bucket(fur, w.M, -sx / 2 + 0.8, 0, sz / 2 - 0.6);
    grp.add(fur);
    // el canto roto con la luz violeta
    const edge = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.05, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.7, 2.4), toneMapped: false }));
    edge.position.set(0, -0.05, sz / 2);
    grp.add(edge);
    grp.position.set(C.x, C.y, C.z);
    grp.rotation.set((r() - 0.5) * 0.5, Math.atan2(C.c.dx, C.c.dz) + (r() - 0.5) * 0.8, (r() - 0.5) * 0.5);
    grp.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    // (una malla por material: pocos dibujos)
    compactGroup(grp);
    root.add(grp);
    const base = grp.rotation.clone();
    const by = C.y;
    const ph = r() * 6;
    anim.push((t) => {
      grp.position.y = by + Math.sin(t * 0.35 + ph) * 0.35;
      grp.rotation.x = base.x + Math.sin(t * 0.21 + ph) * 0.05;
      grp.rotation.z = base.z + Math.cos(t * 0.18 + ph) * 0.05;
    });
    // la estela de piedras del borde de la isla al pedazo
    const sx0 = C.c.x + 0.5 + C.c.dx * 1.2;
    const sz0 = C.c.z + 0.5 + C.c.dz * 1.2;
    const len = Math.hypot(C.x - sx0, C.z - sz0);
    flows.push({ c: [sx0, w.fy[C.c.i] - 0.5, sz0], dir: [(C.x - sx0) / len, (C.y - w.fy[C.c.i] + 0.5) / len, (C.z - sz0) / len], len, n: 22, ph: r() * 10, sp: 0.035, kind: 'rock' });
  }
  // ---- 4. el patio partido: losas que se van del borde hacia el vacío ----
  for (const [zk, nStrips, slabMat] of [['pH', 3, M.dirt], ['pJ', 3, w.M.planks || M.dirt], ['pT', 2, w.M.planks || M.dirt], ['pI', 2, w.M.dirtDark || M.dirt]]) {
  const pH = w.zoneKeys.indexOf(zk);
  if (pH < 0) continue;
  {
    const edgeCells = [];
    for (let z = bz0; z <= bz1; z++) {
      for (let x = bx0; x <= bx1; x++) {
        if (!w.inside(x, z)) continue;
        const i = w.idx(x, z);
        if (w.grid[i] !== FLOOR || w.zone[i] !== pH) continue;
        for (const [dx, dz] of D4) {
          const j = w.idx(x + dx, z + dz);
          const k2 = w.idx(x + dx * 2, z + dz * 2);
          if (w.grid[j] !== FLOOR && (w.grid[j] !== WALL || w.edge[j] !== 0) && w.grid[k2] !== FLOOR && !doorNear(x, z, 2)) {
            // (hacia el vacío de verdad: nada de piso ni pared en 12 celdas para allá)
            let open = true;
            for (let q = 2; q <= 12 && open; q++) for (let l = -2; l <= 2; l++) {
              const cx = x + dx * q + (dz ? l : 0);
              const cz = z + dz * q + (dx ? l : 0);
              if (w.inside(cx, cz) && w.grid[w.idx(cx, cz)] !== 0) open = false;
            }
            if (open) edgeCells.push([x, z, dx, dz, i]);
          }
        }
      }
    }
    // las tres tiras de losas, donde el borde es más largo
    const used = [];
    for (let t = 0; t < 80 && used.length < nStrips; t++) {
      const e = edgeCells[Math.floor(r() * edgeCells.length)];
      if (!e || used.some((u) => Math.hypot(u[0] - e[0], u[1] - e[1]) < 5)) continue;
      used.push(e);
      SLABS.push([zk, e[0], e[1], e[2], e[3]]);
      const [x, z, dx, dz, i] = e;
      const fy = w.fy[i];
      for (let k = 0; k < 6; k++) {
        const d = 1.6 + k * (1.3 + r() * 0.5);
        const s = 1.9 - k * 0.15 + r() * 0.4;
        // (instanciadas: SLAB_ITEMS, al final)
        SLAB_ITEMS.push({ mat: slabMat, s, k2: 0.7 + r() * 0.4, p: [x + 0.5 + dx * d + (dz ? (r() - 0.5) * 2 : 0), fy - 0.3 + k * 0.45 + r() * 0.5, z + 0.5 + dz * d + (dx ? (r() - 0.5) * 2 : 0)], rot: [(r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7], ph: r() * 6, sp: 0.25 + r() * 0.2 });
      }
      // la grieta que llega al borde desde el medio del patio
      CRACK_SEEDS.push([x + 0.5 - dx * 0.5, z + 0.5 - dz * 0.5, -dx, -dz, pH]);
    }
  }
  }
  // ---- 4b. la corona de los muros que da al vacío: tramos arrancados que flotan arriba ----
  const crests = [];
  for (let t = 0; t < 600 && crests.length < 12; t++) {
    const c = cands[Math.floor(r() * cands.length)];
    if (!c || crests.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 6)) continue;
    if (holes.some((h) => Math.hypot(h.x - c.x, h.z - c.z) < 3)) continue;
    crests.push(c);
    const top = w.top[c.j];
    const L = 2.4 + r() * 1.8;
    const hh = 0.7 + r() * 0.7;
    const L2 = (w2, h2, d2, y2 = 0) => new THREE.Matrix4().makeTranslation(0, y2, 0).multiply(new THREE.Matrix4().makeScale(w2, h2, d2));
    const bw = c.dz ? L : 1.0;
    const bd = c.dx ? L : 1.0;
    RIGID.push({
      p: [c.x + 0.5 + c.dx * (0.3 + r() * 1.2), top + 1.2 + r() * 2.4, c.z + 0.5 + c.dz * (0.3 + r() * 1.2)],
      rot: [(r() - 0.5) * 0.6, (r() - 0.5) * 0.5, (r() - 0.5) * 0.6],
      ph: r() * 6,
      sp: 0.4,
      spin: 0,
      parts: { stone: [L2(bw, hh, bd)], glow: [L2(bw * 0.95, 0.06, bd * 0.95, -hh / 2 - 0.02)] },
    });
  }
  // ---- 5. grietas de luz por los pisos ----
  buildCracks(w, root, M, r, own, zoneOf);
  // ---- 6. rejas dobladas flotando (pabellón y comedor) ----
  const barGeo = bentBars(r);
  const barSpots = [];
  if (ZONES.pA) {
    for (let k = 0; k < 6; k++) barSpots.push([136 + r() * 24, ZONES.pA.y + 4.6 + r() * 3.4, 297.5 + r() * 5.5]);
  }
  if (ZONES.pB) {
    const [x0, z0, x1, z1] = ZONES.pB.rects[0];
    for (let k = 0; k < 2; k++) barSpots.push([x0 + 2 + r() * (x1 - x0 - 3), ZONES.pB.roof - 1.3, z0 + 2 + r() * (z1 - z0 - 3)]);
  }
  for (const c of barSpots) floats.push({ kind: 'bars', c, ph: r() * 6, sp: 0.1 + r() * 0.12, s: 1 });
  // ---- 7. catres y baldes flotando adentro de las celdas (el pabellón: las tres filas) ----
  for (const [cx0, cx1] of [[137.5, 141.5], [144, 154], [158.2, 161.8]]) {
    for (let x = cx0 + 1; x < cx1 - 0.5; x += 2.5) {
      if (r() < 0.25) continue;
      floats.push({ kind: 'cot', c: [x, ZONES.pA ? ZONES.pA.y + 1.3 + r() * 0.5 : 5.5, 305.6 + r() * 0.5], ph: r() * 6, sp: 0.15 + r() * 0.15, s: 1, small: true });
      if (r() < 0.6) floats.push({ kind: 'bucket', c: [x + 0.7, (ZONES.pA?.y ?? 4) + 1.9 + r() * 0.4, 306], ph: r() * 6, sp: 0.3, s: 1, small: true });
    }
  }
  // ---- juntar lo quieto, el punzón, lo que flota y lo que fluye ----
  for (const [mat, list] of bag) {
    const gs = list.map((g2) => {
      let q = g2.index ? g2.toNonIndexed() : g2;
      for (const nm of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(nm)) q.deleteAttribute(nm);
      if (!q.attributes.normal) q.computeVertexNormals();
      if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
      if (mat === M.rim && !q.attributes.color) q.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 3).fill(0.5), 3));
      if (mat !== M.rim && q.attributes.color) q.deleteAttribute('color');
      return q;
    });
    const merged = mergeGeometries(gs, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = mat !== M.rim && mat !== M.voidTop;
    m.receiveShadow = true;
    root.add(m);
  }
  if (punches.length) {
    const pm = new THREE.Mesh(mergeGeometries(punches.map((p) => {
      for (const nm of Object.keys(p.attributes)) if (nm !== 'position') p.deleteAttribute(nm);
      return p;
    }), false), M.punch);
    pm.name = 'eclipse:penalCaos:punzon';
    // (después del cielo —-1— y antes que todo lo demás)
    pm.renderOrder = -0.5;
    pm.castShadow = false;
    pm.receiveShadow = false;
    pm.userData.reflect = false;
    root.add(pm);
  }
  anim.push(...slabsInst(root, M));
  anim.push(...rigidInst(w, root, M));
  anim.push(...floaters(w, root, floats, M));
  anim.push(...flowers(w, root, flows, M));
  anim.push((t) => {
    M.crack.uniforms.uTime.value = t;
  });
  LIVE.root = root;
  LIVE.anim = anim;
  w.penalCaos = { slabs: SLABS.slice(), crests: crests.length, holes: holes.length, roofs: roofs.length, chunks: chunkAt.length, flows: flows.length, floats: floats.length, holeAt: holes.map((h) => [h.fx, h.fz, h.dx, h.dz]), roofAt: roofs.map((q) => [q.x, q.z, q.roof]), chunkAt: chunkAt.map((q) => [q.x, q.y, q.z]) };
  CRACK_SEEDS.length = 0;
}
const CRACK_SEEDS = [];
const SLABS = [];
const SLAB_ITEMS = [];
const RIGID = [];

// Piezas rígidas que flotan (los pedazos de techo, las coronas de los muros): cada
// parte una caja de 1 m estirada; una malla instanciada por parte para todas.
function rigidInst(w, root, M) {
  const L = RIGID.splice(0);
  if (!L.length) return [];
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.7, 2.4), toneMapped: false });
  const MAT = { tin: M.tin, ceil: w.M.planksDark || w.M.woodDark, beam: w.M.woodDark || w.M.wood, glow: glowMat, stone: M.stone };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sets = [];
  for (const key of Object.keys(MAT)) {
    const list = [];
    for (const it of L) for (const loc of it.parts[key] || []) list.push([it, loc]);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(box, MAT[key], list.length);
    im.castShadow = key !== 'glow';
    im.receiveShadow = true;
    im.frustumCulled = false;
    root.add(im);
    sets.push([im, list]);
  }
  const G = new THREE.Matrix4();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const upd = (t) => {
    for (const it of L) {
      v.set(it.p[0], it.p[1] + Math.sin(t * it.sp + it.ph) * 0.25, it.p[2]);
      q.setFromEuler(e.set(it.rot[0] + Math.sin(t * 0.2 + it.ph) * 0.06, it.rot[1] + t * it.spin, it.rot[2] + Math.cos(t * 0.22 + it.ph) * 0.05));
      (it.G ||= new THREE.Matrix4()).compose(v, q, one);
    }
    for (const [im, list] of sets) {
      for (let i = 0; i < list.length; i++) {
        m4.multiplyMatrices(list[i][0].G, list[i][1]);
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    void G;
  };
  upd(0);
  return [upd];
}

// Las losas que se van del borde (patio, muelle, estación, yerbal): instanciadas
// por material (la tapa) y una para todas las rocas de abajo.
function slabsInst(root, M) {
  const L = SLAB_ITEMS.splice(0);
  if (!L.length) return [];
  const m4 = new THREE.Matrix4();
  const m5 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const topGeo = new THREE.BoxGeometry(1, 0.28, 1);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const byMat = new Map();
  for (const it of L) {
    if (!byMat.has(it.mat)) byMat.set(it.mat, []);
    byMat.get(it.mat).push(it);
  }
  const sets = [];
  const mk = (geo, mat, list, part) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    root.add(im);
    sets.push([im, list, part]);
  };
  for (const [mat, list] of byMat) mk(topGeo, mat, list, 0);
  mk(rockGeo, M.rock, L, 1);
  const place = (it, t, part) => {
    v.set(it.p[0], it.p[1] + Math.sin(t * it.sp + it.ph) * 0.18, it.p[2]);
    q.setFromEuler(e.set(it.rot[0] + Math.sin(t * it.sp * 0.7 + it.ph) * 0.06, it.rot[1], it.rot[2]));
    m4.compose(v, q, sc.set(1, 1, 1));
    if (part === 0) m5.makeScale(it.s, 1, it.s * it.k2);
    else m5.compose(v.set(0, -it.s * 0.3, 0), q.identity(), sc.set(it.s * 0.45 * 1.3, it.s * 0.45 * 0.8, it.s * 0.45 * 1.2));
    m4.multiply(m5);
  };
  const upd = (t) => {
    for (const [im, list, part] of sets) {
      for (let i = 0; i < list.length; i++) {
        place(list[i], t, part);
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  };
  upd(0);
  return [upd];
}

// Las grietas: caminos al azar por el piso de cada sala (y las que llegan al
// borde del patio), cintas finitas que siguen el piso, todas en una malla.
function buildCracks(w, root, M, r, own, zoneOf) {
  const P = [];
  const U = [];
  const A = [];
  const I = [];
  const line = (pts, wd) => {
    const b = P.length / 3;
    let run = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x, y, z] = pts[k];
      const [px, , pz] = pts[Math.max(0, k - 1)];
      const [nx2, , nz2] = pts[Math.min(pts.length - 1, k + 1)];
      let tx = nx2 - px;
      let tz = nz2 - pz;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (k) run += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][2]);
      const t = k / (pts.length - 1);
      const ww = wd * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * (0.7 + r() * 0.6);
      for (const s of [-1, 1]) {
        P.push(x - tz * s * ww, y, z + tx * s * ww);
        U.push(run, s < 0 ? 0 : 1);
        A.push(k === 0 || k === pts.length - 1 ? 0 : 1);
      }
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = b + k * 2;
      I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  const walk = (x, z, dx, dz, zid, steps, wd, depth = 0) => {
    const i0 = w.idx(Math.floor(x), Math.floor(z));
    const fy = w.fy[i0];
    let a = Math.atan2(dz, dx);
    const pts = [[x, fy + 0.018, z]];
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.9;
      const nx = x + Math.cos(a) * 0.45;
      const nz = z + Math.sin(a) * 0.45;
      const i = w.idx(Math.floor(nx), Math.floor(nz));
      if (w.grid[i] !== FLOOR || w.zone[i] !== zid || Math.abs(w.fy[i] - fy) > 0.05 || w.rampAt?.[i] >= 0) break;
      x = nx;
      z = nz;
      pts.push([x, fy + 0.018, z]);
      if (depth < 2 && k > 4 && r() < 0.07) walk(x, z, Math.cos(a + (r() < 0.5 ? 1 : -1) * (0.8 + r() * 0.6)), Math.sin(a + 1), zid, Math.floor(steps * 0.4), wd * 0.55, depth + 1);
    }
    if (pts.length > 3) line(pts, wd);
  };
  for (const [x, z, dx, dz, zid] of CRACK_SEEDS) walk(x, z, dx, dz, zid, 28, 0.2);
  const keys = ['pA', 'pB', 'pC', 'pH', 'pD', 'pE', 'pF', 'pG', 'pS', 'pK'];
  for (const k of keys) {
    const Z = ZONES[k];
    if (!Z) continue;
    const zid = w.zoneKeys.indexOf(k);
    const n = k === 'pA' || k === 'pH' ? 5 : 2;
    for (let c = 0; c < n; c++) {
      for (let t = 0; t < 30; t++) {
        const R0 = Z.rects[Math.floor(r() * Z.rects.length)];
        const x = R0[0] + r() * (R0[2] - R0[0] + 1);
        const z = R0[1] + r() * (R0[3] - R0[1] + 1);
        const i = w.idx(Math.floor(x), Math.floor(z));
        if (w.grid[i] !== FLOOR || w.zone[i] !== zid) continue;
        const a = r() * Math.PI * 2;
        walk(x, z, Math.cos(a), Math.sin(a), zid, 20 + Math.floor(r() * 20), 0.1 + r() * 0.1);
        break;
      }
    }
  }
  void own;
  void zoneOf;
  if (!I.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('aW', new THREE.Float32BufferAttribute(A, 1));
  geo.setIndex(I);
  const m = new THREE.Mesh(geo, M.crack);
  m.renderOrder = 2;
  m.name = 'eclipse:penalCaos:grietas';
  root.add(m);
}

// Una reja doblada: 7 barrotes (cada uno una curva) y 2 travesaños, en una geometría.
function bentBars(r) {
  const parts = [];
  const bend = 0.25 + r() * 0.3;
  for (let k = 0; k < 7; k++) {
    const x = -0.9 + k * 0.3;
    const pts = [];
    for (let q = 0; q <= 6; q++) {
      const y = -1.2 + q * 0.4;
      const b = Math.sin((q / 6) * Math.PI) * bend * (0.4 + Math.abs(3 - k) * 0.25) * (k % 2 ? 1 : 1.2);
      pts.push(new THREE.Vector3(x + (k === 5 ? Math.sin(q) * 0.08 : 0), y, b));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 5, false));
  }
  for (const y of [-0.9, 0.9]) {
    const pts = [];
    for (let q = 0; q <= 6; q++) pts.push(new THREE.Vector3(-1 + q * 0.33, y, Math.sin((q / 6) * Math.PI) * bend * 0.6));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.035, 5, false));
  }
  for (const p of parts) {
    p.deleteAttribute('uv');
    p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
}

// Lo que flota con vaivén (ladrillos, chapas, tablas, rejas, catres, baldes): una
// malla instanciada por clase y material.
function floaters(w, root, list, M) {
  const B = (geo, mat) => [[geo, mat]];
  const fromGroup = (build) => {
    const g = new THREE.Group();
    build(g);
    g.updateMatrixWorld(true);
    const by = new Map();
    g.traverse((o) => {
      if (!o.isMesh) return;
      let gg = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (gg.index) gg = gg.toNonIndexed();
      for (const nm of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) gg.deleteAttribute(nm);
      if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      if (!by.has(o.material)) by.set(o.material, []);
      by.get(o.material).push(gg);
    });
    const res = [];
    for (const [m, L] of by) {
      const mg = mergeGeometries(L, false);
      if (!mg) continue;
      mg.computeBoundingBox();
      const c = mg.boundingBox.getCenter(new THREE.Vector3());
      res.push([mg, m, c]);
    }
    // (todas las partes centradas en el mismo punto: el medio de todo)
    const box = new THREE.Box3();
    for (const [mg] of res) box.union(mg.boundingBox);
    const c = box.getCenter(new THREE.Vector3());
    return res.map(([mg, m]) => [mg.translate(-c.x, -c.y, -c.z), m]);
  };
  const KINDS = {
    brick: B(new THREE.BoxGeometry(0.28, 0.1, 0.14), M.stone),
    tin: B(new THREE.PlaneGeometry(1.2, 0.9, 1, 3), M.tin),
    plank: B(new THREE.BoxGeometry(1.2, 0.05, 0.22), w.M.planksDark || w.M.woodDark),
    bars: B(bentBars(rng(5)), M.iron),
    cot: fromGroup((g) => cot(g, w.M, 0, 0, 0, false)),
    bucket: fromGroup((g) => bucket(g, w.M, 0, 0, 0)),
  };
  const by = {};
  for (const f of list) (by[f.kind] ||= []).push(f);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (f, t) => {
    v.set(f.c[0] + Math.sin(t * f.sp + f.ph) * 0.1, f.c[1] + Math.sin(t * f.sp * 1.7 + f.ph) * (f.small ? 0.06 : 0.18), f.c[2] + Math.cos(t * f.sp * 0.8 + f.ph) * 0.1);
    if (f.kind === 'bars' || f.kind === 'cot' || f.kind === 'bucket') q.setFromEuler(e.set(0.35 * Math.sin(f.ph) + Math.sin(t * f.sp + f.ph) * 0.08, f.ph + t * f.sp * 0.3, 0.3 * Math.cos(f.ph) + Math.cos(t * f.sp * 0.9) * 0.06));
    else q.setFromEuler(e.set(f.ph + t * f.sp * 0.7, f.ph * 2 + t * f.sp, f.ph * 0.5));
    m4.compose(v, q, s.set(f.s, f.s, f.s));
  };
  const sets = [];
  for (const [k, L] of Object.entries(by)) {
    for (const [geo, mat] of KINDS[k] || []) {
      const im = new THREE.InstancedMesh(geo, mat, L.length);
      L.forEach((f, i) => {
        place(f, 0);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = true;
      root.add(im);
      sets.push([im, L]);
    }
  }
  return [
    (t) => {
      for (const [im, L] of sets) {
        for (let i = 0; i < L.length; i++) {
          place(L[i], t);
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    },
  ];
}

// Lo que fluye: ladrillos y piedras que salen y se van en hilera (por el
// boquete hacia el vacío, del borde al pedazo suelto), y vuelven a empezar.
function flowers(w, root, list, M) {
  const by = { brick: [], rock: [] };
  for (const F of list) for (let k = 0; k < F.n; k++) by[F.kind].push({ F, k });
  const geos = { brick: [new THREE.BoxGeometry(0.28, 0.1, 0.14), M.stone], rock: [new THREE.DodecahedronGeometry(0.22, 0), M.rock] };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = ({ F, k }, t) => {
    const u = (t * F.sp + k / F.n + F.ph) % 1;
    const d = u * F.len;
    const wob = Math.sin(k * 12.9 + t * 0.6) * 0.35 * (0.3 + u);
    v.set(F.c[0] + F.dir[0] * d + (F.dir[2] ? wob : 0), F.c[1] + F.dir[1] * d + Math.sin(k * 7.1) * 0.3 + u * u * 1.5, F.c[2] + F.dir[2] * d + (F.dir[0] ? wob : 0));
    q.setFromEuler(e.set(k + t * 0.7, k * 2 + t * 0.5, k * 0.3));
    // (crecen al salir y se achican al irse)
    const sc = Math.min(1, u * 6) * (1 - u * 0.6) * (0.7 + ((k * 37) % 10) / 20);
    m4.compose(v, q, s.set(sc, sc, sc));
  };
  const sets = [];
  for (const [k, L] of Object.entries(by)) {
    if (!L.length) continue;
    const im = new THREE.InstancedMesh(geos[k][0], geos[k][1], L.length);
    L.forEach((it, i) => {
      place(it, 0);
      im.setMatrixAt(i, m4);
    });
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = true;
    root.add(im);
    sets.push([im, L]);
  }
  return [
    (t) => {
      for (const [im, L] of sets) {
        for (let i = 0; i < L.length; i++) {
          place(L[i], t);
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    },
  ];
}

// La torre de guardia (penal.js, J9): más inclinada, las patas partidas a media
// altura y la garita suelta flotando arriba, torcida, con la luz violeta en la
// quebradura. obj: la torre de penalProps ('torre'); g: el pedazo suelto.
export function breakTower(obj, g, M) {
  if (OFF()) return;
  obj.updateMatrixWorld(true);
  const top = new THREE.Group();
  const H = 4.2;
  const legs = [];
  const moveUp = [];
  for (const o of [...obj.children]) {
    const b = new THREE.Box3().setFromObject(o);
    const h = b.max.y - b.min.y;
    const cy = (b.min.y + b.max.y) / 2 - obj.position.y;
    if (o.isMesh && h > 5.5) legs.push(o);
    else if (cy > H - 0.4 || o.userData.dynamic) moveUp.push(o);
  }
  // las patas: partidas (la mitad de abajo queda; la punta de cada una sube con la garita)
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 2.6), toneMapped: false });
  for (const L of legs) {
    const full = L.geometry.parameters?.height ?? 6.4;
    const keep = 2.6 + Math.random() * 0.5;
    const stub = L.clone();
    L.scale.y = keep / full;
    L.position.y = keep / 2;
    L.rotation.z += (Math.random() - 0.5) * 0.12;
    const tip = stub;
    tip.scale.y = (full - keep - 1.2) / full;
    tip.position.y = H + 0.1 - ((full - keep - 1.2) / 2);
    moveUp.push(tip);
    obj.add(tip);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), hot);
    glow.position.set(L.position.x, keep, L.position.z);
    obj.add(glow);
  }
  obj.add(top);
  for (const o of moveUp) top.attach(o);
  // la garita suelta: 2,2 m más arriba, corrida y torcida
  top.position.set(0.5, 2.2, -0.3);
  top.rotation.set(-0.22, 0.4, 0.3);
  // la quebradura de abajo de la garita, con la luz
  const under = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 2.3), hot);
  under.position.set(0, H - 0.1, 0);
  top.add(under);
  // toda la torre, más volcada
  obj.rotation.z += 0.16;
  obj.rotation.x -= 0.08;
  // astillas entre las patas y la garita
  for (let k = 0; k < 10; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4 + Math.random() * 0.5, 0.05), M.woodDark || M.wood);
    s.position.set((Math.random() - 0.5) * 2, 3.2 + Math.random() * 2.6, (Math.random() - 0.5) * 2);
    s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    obj.add(s);
  }
  void g;
}
