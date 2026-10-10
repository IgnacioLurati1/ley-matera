import * as THREE from 'three';
import { ZONES, DOORS, RAMPS, PLAYER_START, EE, WATER_Y } from '../../config/map';
import { PORTALS } from '../../config/maps/eclipse';
import { rng } from '../../core/noise';
import { buildTussocks } from '../esterosGrass';
import { addGrassPush } from '../../fx/grassPush';
import { jitterGrass } from '../../fx/TAA';
import { depthPrepass } from '../../fx/prepass';
import { keepOut, zoneAtCell, inst, cutToGbuf } from './centro';

// El pajonal del estero en el claro del comienzo (arte6, 2026-10-06; el
// usuario: "la zona inicial es de Mate no Numa y no tiene ni un matorral de ese
// mapa"). Las matas de verdad del estero (world/esterosGrass.js: hojas sólidas
// con volumen, con detalle por distancia) en:
//  · el borde del claro y de la loma (el pajonal que encierra, como allá);
//  · manchones (matorrales) por el claro, lejos de las sendas, los portales,
//    las máquinas, la trampa, el fogón y el algarrobo;
//  · la orilla de la laguna (en el agua de la orilla y en el bordo).
// Se aparta al pasar (fx/grassPush; el empuje es uno solo para el mapa: lo
// corre world/eclipse/tapera.js con w.eclGrassAt de acá).
// Y la playa (la rampa que baja a la laguna; el usuario: "la bajada es una
// rampa perfecta en lugar de terreno normal"): una orilla de barro con
// ondulaciones, piedras, borde deshilachado, juncos y matas en el agua. Lo de
// Levels queda abajo (el choque sigue siendo la rampa).
// Una sola variante de mata: 3 dibujos (cerca, medio, lejos).
// globalThis.__mduNoClaroVeg: nada de esto; __mduNoPlaya: sin la orilla.

const FLOOR = 1;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let live = null;

export function build(w) {
  if (globalThis.__mduNoClaroVeg === true || globalThis.__mduEclipse !== true) return;
  const r = rng(6061);
  const root = new THREE.Group();
  root.name = 'eclipse:claroVeg';
  const out0 = keepOut();
  // las sendas del claro (del inicio a cada portal, puerta, fogón y escalera): 2,6 m a cada lado
  const st = [PLAYER_START.x, PLAYER_START.z];
  const targets = [];
  for (const p of PORTALS) for (const e of [p.a, p.b]) if (e.zone === 'A' || e.zone === 'A2') targets.push([e.pos[0], e.pos[1]]);
  for (const d of DOORS) if (d.zones.includes('A') || d.zones.includes('A2')) targets.push([d.cells[0][0] + 0.5, d.cells[0][1] + 0.5]);
  if (EE?.fogon) targets.push(EE.fogon);
  if (EE?.algarrobo) targets.push(EE.algarrobo);
  for (const R of RAMPS) if (R.own === 'loma' || R.own === 'playa') targets.push([(R.rect[0] + R.rect[2] + 1) / 2, (R.rect[1] + R.rect[3] + 1) / 2]);
  const segD = (x, z, a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const busyPts = [];
  for (const k of ['algarrobo', 'fogon', 'llama', 'corte']) if (EE?.[k]) busyPts.push([EE[k][0], EE[k][1], 4.5]);
  // la trampa del desgarro del claro (entities/eclipse/Trampas.js) y las cosas para usar
  const trap = globalThis.__mduOldTrampas === true ? [135.5, 167] : [143.5, 166.5];
  busyPts.push([trap[0], trap[1], 4.8]);
  // (2026-10-08: esa lista, al armar el mapa, es la de la partida ANTERIOR —la
  // de esta se arma después del mundo—: en la primera partida no hay ninguna (o
  // es la de otro mapa) y las matas caían donde querían; en la tacuara de la
  // Guadaña, a 40 cm, tapándola. Y como cada lugar ocupado corre el azar, el
  // pajonal entero salía distinto en la primera partida y en el fast restart.
  // Ahora las matas se arman al final de Game.buildScene (World.finalizeStatic),
  // ya con las cosas para usar de ESTA partida, y las que caen encima no van.
  // globalThis.__mduOldClaroBusy: como antes)
  const LATE = globalThis.__mduOldClaroBusy !== true;
  if (!LATE) for (const it of w.g?.interact?.list || []) if (it.pos) busyPts.push([it.pos.x, it.pos.z, 2.2]);
  // (arte6, 10-06 tarde) la cinemática del comienzo (ui/eclipseIntro.js): los cuatro
  // del algarrobo y las cámaras bajas van hacia el fogón (el mismo lado que elige
  // la intro); el usuario: "queda tapado por los matorrales". Libre: 5,5 m
  // alrededor del algarrobo y el rectángulo de 10 x 8 m hacia ese lado.
  const introOut = introClear(w);
  const out = (x, z, rad = 0) => out0(x, z, rad) || introOut(x, z, rad) || busyPts.some(([px, pz, rr]) => Math.hypot(x - px, z - pz) < rr + rad);
  const onPath = (x, z, m = 2.6) => targets.some((t) => segD(x, z, st, t) < m) || Math.hypot(x - st[0], z - st[1]) < 4;
  const zoneOk = (x, z) => {
    const k = zoneAtCell(w, x, z);
    if (k !== 'A' && k !== 'A2') return null;
    const i = w.idx(Math.floor(x), Math.floor(z));
    if (w.rampAt?.[i] >= 0) return null;
    return k;
  };
  const tuft = [];
  const lowQ = ['perf', 'hidden', 'low'].includes(w.g?.tier?.('grass'));
  const cells = new Set();
  // (2026-10-08, el usuario: "el pasto desaparece al empezar la partida" y "un
  // fast restart lo arregla". Una mata de la playa caía en una celda del vacío
  // —floorAt da -60— y la esfera de todas quedaba con el centro a 6 m de alto
  // y 70 m de radio; las de cerca, que siguen a la cámara a esa altura, tenían
  // la esfera 24 m abajo del claro y se cortaban al mirar derecho o para
  // arriba. Que caiga ahí depende del azar, que se corre con la lista vieja de
  // interactuables —la del título en la primera partida, la de la partida
  // anterior en el fast restart—. Ahora lo que no está sobre el claro no va; el
  // azar sigue igual. globalThis.__mduOldClaroVoid: como antes)
  const yMin = globalThis.__mduOldClaroVoid === true ? -Infinity : (WATER_Y ?? 29.85) - 6;
  const add = (x, y, z, h, wd = 1) => {
    const a = r() * Math.PI * 2;
    if (!(y > yMin) && yMin > -Infinity) return;
    tuft.push([x, y, z, h, a, wd]);
    cells.add(w.idx(Math.floor(x), Math.floor(z)));
  };
  // 1. el borde del claro y de la loma: matas altas pegadas a la baranda / al vacío
  const ids = new Set(['A', 'A2'].map((k) => w.zoneKeys.indexOf(k)));
  const [bx0, bz0, bx1, bz1] = [124, 138, 189, 200];
  for (let z = bz0; z <= bz1; z++) {
    for (let x = bx0; x <= bx1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR || !ids.has(w.zone[i]) || w.rampAt?.[i] >= 0) continue;
      let ox = 0;
      let oz = 0;
      for (const [dx, dz] of D4) {
        const j = w.idx(x + dx, z + dz);
        if (w.grid[j] !== FLOOR) {
          ox += dx;
          oz += dz;
        }
      }
      if (!ox && !oz) continue;
      const n = lowQ ? 2 : 3 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const px = x + 0.5 + ox * 0.28 + (r() - 0.5) * (oz ? 0.9 : 0.3);
        const pz = z + 0.5 + oz * 0.28 + (r() - 0.5) * (ox ? 0.9 : 0.3);
        if (out(px, pz, 0.5) || onPath(px, pz, 1.6)) continue;
        add(px, w.fy[i] - 0.06, pz, 1.85 + r() * 0.7, 0.9 + r() * 0.35);
      }
    }
  }
  // 2. matorrales por el claro: manchones de 5-11 matas, lejos de las sendas
  let patches = 0;
  for (let t = 0; t < 900 && patches < 30; t++) {
    const cx = bx0 + r() * (bx1 - bx0);
    const cz = bz0 + r() * (bz1 - bz0);
    if (!zoneOk(cx, cz) || out(cx, cz, 1.8) || onPath(cx, cz, 3.4)) continue;
    patches++;
    const n = lowQ ? 6 + Math.floor(r() * 4) : 10 + Math.floor(r() * 8);
    const y0 = w.floorAt(cx, cz);
    for (let j = 0; j < n; j++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 1.7;
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      if (!zoneOk(px, pz) || out(px, pz, 0.3) || Math.abs(w.floorAt(px, pz) - y0) > 0.05) continue;
      // (en el medio, más altas)
      add(px, y0 - 0.06, pz, (d < 0.8 ? 1.9 : 1.35) + r() * 0.7, 0.9 + r() * 0.35);
    }
  }
  // 3. la orilla de la laguna: en el agua pegada al bordo y en las celdas de pajonal
  const lag = w.zoneKeys.indexOf('B');
  const playaR = RAMPS.find((R) => R.own === 'playa')?.rect;
  const lvl = WATER_Y ?? 29.85;
  for (let z = bz0; z <= bz1; z++) {
    for (let x = bx0; x <= bx1; x++) {
      if (!w.inside(x, z)) continue;
      const i = w.idx(x, z);
      if (w.grid[i] !== FLOOR || w.zone[i] !== lag) continue;
      let edge = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = w.idx(x + dx, z + dz);
        if (w.grid[j] !== FLOOR || w.zone[j] !== lag) edge = true;
      }
      if (!edge) continue;
      // (ralo: los irupés y el agua se siguen viendo; la playa, despejada)
      if (playaR && x >= playaR[0] - 2 && x <= playaR[2] + 4 && z >= playaR[1] - 1 && z <= playaR[3] + 1) continue;
      for (let k = 0; k < 1; k++) {
        if (r() < 0.45) continue;
        const px = x + 0.15 + r() * 0.7;
        const pz = z + 0.15 + r() * 0.7;
        if (out(px, pz, 0.3)) continue;
        // (del lecho: asoma ~1,2-1,9 m sobre el agua)
        add(px, w.fy[i] - 0.05, pz, lvl - w.fy[i] + 1.2 + r() * 0.7, 0.9 + r() * 0.3);
      }
    }
  }
  // 4. la playa: matas en la línea del agua y a los costados
  const playa = RAMPS.find((R) => R.own === 'playa');
  if (playa && globalThis.__mduNoPlaya !== true) buildPlaya(w, root, r, playa, lvl, add);
  // las matas de verdad del estero (con su viento y que se apartan al pasar)
  // (el material de las matas del estero, w.M.tussock: el mismo arreglo que en
  // Mate no Numa —world/Esteros.js buildPajonal—: viento y empuje (fx/grassPush),
  // corrido de una fracción de píxel por cuadro para el suavizado temporal
  // (fx/TAA jitterGrass), la marca de pasto del G-buffer de Épica (si no, el
  // temporal no lo toca y los bordes quedan filosos) y la pasada de profundidad)
  const mat = w.M.tussock || new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  addGrassPush(mat);
  jitterGrass(mat);
  cutToGbuf(mat);
  const low = ['perf', 'hidden', 'low'].includes(w.g?.tier?.('grass'));
  // (sesión 1f, el usuario: "los matorrales al subir la escalera desaparecen de
  // la nada": desde la loma se ve todo el claro y las del fondo, a más de 78 m,
  // se apagaban de golpe. Acá se dibujan hasta 150 m —el claro entero—.
  // __mduOldClaroFar: como antes)
  const far = globalThis.__mduOldClaroFar === true ? undefined : 150;
  let meshes = null;
  const finish = (spots) => {
    if (meshes) return;
    meshes = buildTussocks(root, spots, mat, { variants: 1, ...(low ? { leaves: 22, stems: 5 } : {}), seed: 73, ...(far ? { far } : {}) });
    if (globalThis.__mduNoTuftPre !== true) {
      let tpre = null;
      for (const t of meshes) {
        depthPrepass(t);
        if (tpre) t.userData.prepass.material = tpre;
        else tpre = t.userData.prepass.material;
      }
      if (tpre) {
        addGrassPush(tpre);
        jitterGrass(tpre);
      }
    }
    live = { root, meshes, n: spots.length };
    w.claroVeg = live;
  };
  // (las que caen a menos de 2,7 m de algo para usar de esta partida no van)
  const late = () => {
    if (meshes) return;
    const its = [];
    for (const it of w.g?.interact?.list || []) if (it.pos) its.push([it.pos.x, it.pos.z]);
    finish(tuft.filter(([x, , z]) => !its.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.7)));
  };
  w.root.add(root);
  if (!LATE) finish(tuft);
  else {
    const fin = w.finalizeStatic;
    w.finalizeStatic = function (...a) {
      const out = fin.apply(this, a);
      try {
        late();
      } catch (e) {
        console.error('Eclipse claroVeg: las matas', e);
      }
      return out;
    };
  }
  const pre0 = w.preRender;
  w.preRender = function (cam, dt) {
    pre0.call(this, cam, dt);
    // (si nadie llamó a finalizeStatic: en el primer cuadro)
    if (!meshes) late();
    meshes.lod(cam);
  };
  // el empuje del pasto (lo corre tapera.js): ¿hay mata en esta celda o al lado?
  w.eclGrassAt = (x, z) => cells.has(w.idx(Math.floor(x), Math.floor(z)));
}

// ---------------- la playa ----------------
// La orilla de barro: una grilla de 0,25 m arriba de la rampa (siempre 2-12 cm
// por encima: la rampa no asoma), que se mete en el pasto del claro y en el
// agua con el borde deshilachado (los triángulos de afuera no van), con
// ondulaciones, charcos oscuros y piedras. El choque es la rampa de siempre.
function buildPlaya(w, root, r, R, lvl, add) {
  const [rx0, rz0, rx1, rz1] = R.rect;
  // la caja con margen: 2,5 m hacia el claro y hacia los costados, 2 m hacia el agua
  const X0 = rx0 - 2.5;
  const X1 = rx1 + 1 + 2.2;
  const Z0 = rz0 - 2.2;
  const Z1 = rz1 + 1 + 2.2;
  const S = 0.25;
  const nx = Math.round((X1 - X0) / S);
  const nz = Math.round((Z1 - Z0) / S);
  // ruido suave (suma de senos con fases al azar)
  const ph = Array.from({ length: 8 }, () => r() * 6.28);
  const noise = (x, z) => Math.sin(x * 1.3 + ph[0]) * Math.sin(z * 1.1 + ph[1]) * 0.5 + Math.sin(x * 3.1 + z * 2.3 + ph[2]) * 0.3 + Math.sin(x * 7.3 - z * 6.1 + ph[3]) * 0.2;
  const inRamp = (x, z) => x >= rx0 && x < rx1 + 1 && z >= rz0 && z < rz1 + 1;
  // cuánto "es orilla" cada punto: 1 en la rampa, baja hacia afuera, con el borde ruidoso
  const weight = (x, z) => {
    const dx = Math.max(rx0 - x, 0, x - (rx1 + 1));
    const dz = Math.max(rz0 - z, 0, z - (rz1 + 1));
    const d = Math.hypot(dx, dz);
    return 1 - d / 2.4 + noise(x * 1.7, z * 1.7) * 0.45;
  };
  const base = (x, z) => {
    const fy = w.floorAt(x, z, 31);
    return Number.isFinite(fy) ? fy : lvl - 1;
  };
  const P = [];
  const C = [];
  const U = [];
  const keep = [];
  const col = new THREE.Color();
  const mud = new THREE.Color(0xb09878);
  const wet = new THREE.Color(0x6a5844);
  const dry = new THREE.Color(0xc8b08a);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * S + (i && i < nx ? (r() - 0.5) * 0.08 : 0);
      const z = Z0 + j * S + (j && j < nz ? (r() - 0.5) * 0.08 : 0);
      const wt = weight(x, z);
      const b = base(x, z);
      // ondulaciones: más en el medio de la orilla, nada en el borde (apoya en el pasto)
      const k = Math.max(0, Math.min(1, wt));
      const y = b + 0.02 + k * (0.05 + 0.05 * noise(x * 2.2, z * 2.2) + 0.035 * Math.max(0, noise(x * 5, z * 5)));
      P.push(x, y, z);
      U.push(x * 0.5, z * 0.5);
      // húmedo cerca del agua, más seco arriba, charcos oscuros
      const nearW = Math.max(0, Math.min(1, 1 - (b - lvl) / 0.9));
      col.copy(dry).lerp(mud, Math.min(1, 0.4 + nearW)).lerp(wet, Math.max(0, noise(x * 1.9 + 3, z * 1.9) - 0.35) * 1.4 * (0.4 + nearW));
      C.push(col.r, col.g, col.b);
      keep.push(wt > 0.5 && b > lvl - 1.8);
    }
  }
  const I = [];
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i, j + 1);
      const d = id(i + 1, j + 1);
      if (keep[a] && keep[b] && keep[c]) I.push(a, c, b);
      if (keep[b] && keep[c] && keep[d]) I.push(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const tex = w.M.dirt?.map || w.M.dirtDark?.map || null;
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.78, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  if (w.M.dirtDark?.normalMap) mat.normalMap = w.M.dirtDark.normalMap;
  const m = new THREE.Mesh(geo, mat);
  m.name = 'eclipse:playa';
  m.receiveShadow = true;
  root.add(m);
  // piedras: medio enterradas en el barro, más en la línea del agua
  const stones = [];
  for (let t = 0; t < 260 && stones.length < 46; t++) {
    const x = X0 + r() * (X1 - X0);
    const z = Z0 + r() * (Z1 - Z0);
    const wt = weight(x, z);
    if (wt < 0.55) continue;
    const b = base(x, z);
    const nearW = Math.abs(b - lvl) < 0.35;
    if (!nearW && r() < 0.55) continue;
    // (en el medio de la bajada, chicas: se camina por ahí)
    const s = inRamp(x, z) && !nearW ? 0.06 + r() * 0.08 : 0.1 + r() * 0.22;
    stones.push([x, b + 0.02, z, s, r() * 6.28, r()]);
  }
  const sm = w.M.caveRock || w.M.rock || w.M.stoneDark;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  root.add(inst(new THREE.DodecahedronGeometry(1, 0), sm, stones, ([x, y, z, s, a, t], m4) => {
    q.setFromEuler(e.set(t * 0.6, a, t * 0.4));
    m4.compose(v.set(x, y, z), q, sc.set(s * 1.3, s * 0.55, s));
  }, { shadow: true }));
  // las matas y juncos: en la línea del agua (de los costados al medio, dejando el paso) y a los costados de la bajada
  const zc = (rz0 + rz1 + 1) / 2;
  for (let t = 0; t < 400; t++) {
    const x = X0 + r() * (X1 - X0);
    const z = Z0 + r() * (Z1 - Z0);
    const b = base(x, z);
    const wt = weight(x, z);
    if (wt < 0.3) continue;
    const side = !inRamp(x, z) && x < rx1 + 1 && x > rx0 - 1.5;
    const water = b < lvl + 0.15 && b > lvl - 1.2;
    if (!side && !water) continue;
    // (el paso al agua: el medio de la playa queda libre)
    if (Math.abs(z - zc) < 4.5 && !side) continue;
    if (r() < 0.8) continue;
    add(x, b - 0.05, z, (water ? Math.max(0, lvl - b) + 0.9 : 0.8) + r() * 0.7, 0.8 + r() * 0.3);
  }
}

// Lo que la intro necesita libre (ui/eclipseIntro.js): el lado del algarrobo que
// ella elige (hacia el fogón, o girando hasta que los lugares estén libres).
function introClear(w) {
  const A = EE?.algarrobo;
  if (!A || globalThis.__mduNoIntroClear === true) return () => false;
  const ay = w.floorAt(A[0], A[1]);
  const F = EE.fogon || [PLAYER_START.x, PLAYER_START.z];
  let dx = F[0] - A[0];
  let dz = F[1] - A[1];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const LAY = [[2.7, 0], [3.5, 1.25], [3.6, -1.3], [4.3, 0.35], [4.7, -0.15], [3.5, 1.35], [1.4, 0.35], [6.6, 2.0], [5.8, -2.3], [6.4, -0.9], [5.2, 0], [5.6, 0.9], [4.9, 1.9]];
  const probe = new THREE.Vector3();
  const free = (x, z) => {
    const y = w.floorAt(x, z);
    if (!(Math.abs(y - ay) < 0.6)) return false;
    probe.set(x, y, z);
    w.collide?.(probe, 0.35, y + 0.1, y + 1.8);
    return Math.hypot(probe.x - x, probe.z - z) < 1e-3;
  };
  let ux = dx;
  let uz = dz;
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    const cx = dx * Math.cos(a) + dz * Math.sin(a);
    const cz = -dx * Math.sin(a) + dz * Math.cos(a);
    if (LAY.every(([b, sd]) => free(A[0] + cx * b - cz * sd, A[1] + cz * b + cx * sd))) {
      ux = cx;
      uz = cz;
      break;
    }
  }
  return (x, z, rad = 0) => {
    const rx = x - A[0];
    const rz = z - A[1];
    if (Math.hypot(rx, rz) < 5.5 + rad) return true;
    const b = rx * ux + rz * uz;
    const sd = -rx * uz + rz * ux;
    return b > -1.5 - rad && b < 10 + rad && Math.abs(sd) < 4 + rad;
  };
}

export function update() {}
