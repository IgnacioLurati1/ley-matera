import * as THREE from 'three';
import { makeNoise, rng } from '../core/noise';
import { MAP_W, MAP_H, ZONES, WINDOWS } from '../config/map';
import GeoBuilder from './GeoBuilder';
import { ceilMax } from './Levels';
import { windy } from '../fx/grassPush';

// La montaña del castillo del Mateendrache: el terreno de afuera (con la
// nieve arriba y la roca en lo empinado), el precipicio del puente levadizo,
// la ladera que tapa la bodega, la gruta y la cueva del dragón, las
// araucarias del valle y la cordillera de fondo con el Aconcagua.
//  · castleTerrain(w) lo llama Levels.computeHeights (w.terrain): la altura de
//    cada celda de afuera. Pegado a las paredes queda a la altura del piso de
//    al lado (las ventanas tienen por dónde llegar) y de a poco pasa a la
//    forma grande de la montaña (macroY).
//  · buildMountain(w) arma todo lo que se ve.

const NZ = makeNoise(907);
const OUT = 0;
const FLOOR = 1;
const WALL = 2;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// El precipicio que separa el castillo de las termas (al sur): de la puerta
// de la barbacana (z 71) al borde de las termas (z 82), con paredes a pique.
const CHASM = { z: 76.5, half: 5.3, bottom: 1.2 };
// Las termas: una meseta del otro lado del precipicio.
const TERMAS = { x0: 34, x1: 70, z0: 81, z1: 95, y: 19.2 };

// Forma grande de la montaña en (x, z), sin mirar la grilla (sirve también
// para el faldón de más allá de la grilla).
export function macroY(x, z) {
  // el espolón donde está el castillo, a la altura del patio
  let h = 24;
  // al oeste baja hacia el valle
  if (x < 13) h -= (13 - x) * 0.42;
  // detrás del gran salón, una hondonada de roca a la altura de la biblioteca
  // (ahí se paran los miradores y pasan los puentes de piedra)
  if (z < 34) h = Math.max(h, 24 + 3 * smooth(34, 28, z));
  // al norte, la montaña: empinada detrás de la cumbre
  const nz = 10 - z;
  if (nz > 0) h = Math.max(h, 27 + nz * 0.9 + Math.max(0, nz - 25) * 0.55 + Math.max(0, nz - 60) * 0.45);
  // al este, el flanco que guarda la gruta y la cueva
  const ex = x - 77;
  if (ex > 0) h = Math.max(h, 23 + (ex * 0.8 + Math.max(0, ex - 30) * 0.5) * (1 - smooth(60, 80, z)));
  // del otro lado del precipicio: la meseta de las termas y el valle que baja
  if (z > CHASM.z) {
    const inT = x > TERMAS.x0 - 6 && x < TERMAS.x1 + 6;
    const plateau = inT ? TERMAS.y : TERMAS.y - 3 - Math.min(Math.abs(x - (TERMAS.x0 + TERMAS.x1) / 2) - 18, 40) * 0.25;
    const south = Math.max(0, z - TERMAS.z1);
    h = Math.max(1.5, plateau - south * 0.42);
  }
  // el precipicio del puente levadizo (sigue como una quebrada hacia los
  // costados): las paredes caen casi a pique, sin lomas que asomen al lado
  // del puente
  const cz = Math.abs(z - CHASM.z);
  const deep = 1 - smooth(CHASM.half - 0.6, CHASM.half + 0.4, cz);
  if (deep > 0) h = h * (1 - deep) + CHASM.bottom * deep;
  // relieve: roca quebrada, más fuerte lejos del castillo (en la meseta de
  // las termas casi nada: si no, la nieve de afuera asoma sobre las piedras)
  const far = Math.min(1, Math.max(0, Math.hypot(x - 57, z - 50) - 40) / 60);
  const calm = 1 - 0.75 * smooth(3, 0, Math.max(TERMAS.x0 + 2 - x, x - TERMAS.x1 + 2, CHASM.z + CHASM.half + 1 - z, z - TERMAS.z1 + 1, 0));
  h += (NZ.fbm(x / 23, z / 23, 4, 4096) - 0.5) * (2.2 + far * 7) * calm;
  h += (NZ.fbm(x / 7 + 40, z / 7, 2, 4096) - 0.5) * 1.2 * calm;
  // crestas: aristas de roca que bajan de la montaña (ruido "quebrado")
  const up = Math.max(0, h - 30);
  if (up > 0) {
    const rg = 1 - Math.abs(NZ.fbm(x / 38 + 70, z / 38 + 20, 4, 4096) * 2 - 1);
    h += rg * rg * Math.min(22, up * 0.45) - Math.min(8, up * 0.12);
  }
  return h;
}

// Las celdas de un puente no cuentan como piso para el terreno de abajo
// (si no, el barranco queda a la altura del puente).
function bridgeCell(w, i) {
  const k = w.zoneKeys[w.zone[i]];
  const Z = k ? ZONES[k] : null;
  if (!Z) return false;
  const x = i % MAP_W;
  const z = (i - x) / MAP_W;
  for (const r of Z.rects || []) {
    if (!r[6]) continue;
    if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true;
  }
  return !!Z.bridge;
}

// Distancia (en celdas, 4 vecinos) desde unas semillas, con la altura de la más cercana.
function spread(seeds, block) {
  const n = MAP_W * MAP_H;
  const near = new Float32Array(n);
  const dist = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const [i, y] of seeds) {
    if (dist[i] >= 0) continue;
    dist[i] = 0;
    near[i] = y;
    q[tail++] = i;
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
      const j = nz * MAP_W + nx;
      if (dist[j] >= 0 || (block && block(j))) continue;
      dist[j] = dist[i] + 1;
      near[j] = near[i];
      q[tail++] = j;
    }
  }
  return { near, dist };
}

// Alturas del terreno (w.ty) de las celdas de afuera y de las paredes. La
// montaña es su propia forma (macroY): contra las paredes cae a pique (los
// muros del castillo se ven enteros), salvo delante de las ventanas, donde
// queda un borde a la altura de ese piso para que los muertos lleguen.
export function castleTerrain(w) {
  const n = MAP_W * MAP_H;
  const walk = (t) => t === FLOOR || t === 3 || t === 4;
  // las paredes: a la altura del piso más cercano (como en los demás mapas)
  const floors = [];
  for (let i = 0; i < n; i++) if (walk(w.grid[i]) && !bridgeCell(w, i)) floors.push([i, w.fy[i]]);
  const byFloor = spread(floors);
  // los bordes de las ventanas: la celda de afuera de cada una
  const seeds = [];
  for (const def of WINDOWS) {
    const [x, z] = def.cell;
    const ox = x + def.out[0];
    const oz = z + def.out[1];
    if (ox < 0 || oz < 0 || ox >= MAP_W || oz >= MAP_H) continue;
    seeds.push([oz * MAP_W + ox, w.fy[z * MAP_W + x]]);
  }
  const byWin = spread(seeds, (j) => w.grid[j] !== OUT);
  for (let i = 0; i < n; i++) {
    const t = w.grid[i];
    if (t === WALL) {
      w.ty[i] = byFloor.near[i];
      continue;
    }
    if (t !== OUT) continue;
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    let y = macroY(x + 0.5, z + 0.5);
    const d = byWin.dist[i];
    if (d >= 0 && d < 7) {
      const k = smooth(2.5, 6.5, d);
      y = byWin.near[i] * (1 - k) + y * k;
    }
    w.ty[i] = y;
  }
}

// ---------------- lo que se ve ----------------

// Material de la montaña: roca en lo empinado, nieve en lo plano y en lo alto.
function snowRockMaterial(T, M) {
  // (sin bumpMap: con las UV planas se estiraba en lo empinado y dejaba manchas)
  const mat = new THREE.MeshStandardMaterial({ map: T.rock || T.caveRock, roughness: 0.92 });
  // ni normal map (fx/Surfaces): la roca va proyectada desde tres lados, no por UV
  mat.userData.noRelief = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = { value: T.snow };
    sh.uniforms.uRock = { value: T.rock || T.caveRock };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wpI = vec4(transformed, 1.0);
        vec3 wnI = objectNormal;
        #ifdef USE_INSTANCING
          wpI = instanceMatrix * wpI;
          wnI = mat3(instanceMatrix) * wnI;
        #endif
        vWPos = (modelMatrix * wpI).xyz;
        vWNor = normalize(mat3(modelMatrix) * wnI);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSnow;\nuniform sampler2D uRock;\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace(
        '#include <map_fragment>',
        `vec3 an = pow(abs(normalize(vWNor)), vec3(4.0));
        an /= an.x + an.y + an.z + 1e-5;
        vec3 rock = texture2D(uRock, vWPos.zy * 0.18).rgb * an.x + texture2D(uRock, vWPos.xz * 0.18).rgb * an.y + texture2D(uRock, vWPos.xy * 0.18).rgb * an.z;
        // la misma roca en grande, para que la ladera no sea un solo azulejo
        vec3 rockB = texture2D(uRock, vWPos.zy * 0.029).rgb * an.x + texture2D(uRock, vWPos.xz * 0.029).rgb * an.y + texture2D(uRock, vWPos.xy * 0.029).rgb * an.z;
        rock *= 0.5 + rockB * 0.95;
        float up = clamp(vWNor.y, 0.0, 1.0);
        float wob = texture2D(uSnow, vWPos.xz * 0.037).r;
        // los estratos de la cordillera: franjas tibias a lo alto, onduladas
        float big = texture2D(uSnow, vWPos.xz * 0.009 + vec2(vWPos.y * 0.003)).r;
        float band = sin(vWPos.y * 0.72 + wob * 1.6 + big * 10.0 + vWPos.x * 0.025);
        float strata = smoothstep(0.1, 0.9, band) * (0.6 + big * 0.5);
        vec3 tint = mix(vec3(0.6, 0.54, 0.52), vec3(0.8, 0.7, 0.6), strata);
        diffuseColor.rgb *= rock * tint * 1.2;
        float snowK = smoothstep(0.42, 0.66, up + (wob - 0.8) * 0.35);
        // la nieve que queda en las cornisas de los estratos, en lo empinado
        snowK = max(snowK, smoothstep(0.9, 0.995, band) * smoothstep(0.1, 0.32, up) * smoothstep(0.42, 0.7, big + wob * 0.35) * 0.7);
        snowK = max(snowK, smoothstep(58.0, 80.0, vWPos.y + wob * 8.0) * smoothstep(0.25, 0.5, up));
        vec3 snowCol = texture2D(uSnow, vWPos.xz * 0.5).rgb * vec3(0.95, 0.97, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, snowK);`,
      );
  };
  mat.customProgramCacheKey = () => 'castleSnowRock';
  return mat;
}

// La cordillera de fondo: el mismo material de nieve y roca, sin niebla y con bruma.
function rangeMaterial(T) {
  const m = snowRockMaterial(T);
  m.fog = false;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    base(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.07, 0.09, 0.14), 0.42);');
  };
  m.customProgramCacheKey = () => 'castleRange';
  return m;
}

// Altura en una esquina de celda (el promedio de las celdas de afuera que la tocan).
function cornerHeights(w) {
  const W = MAP_W;
  const H = MAP_H;
  const cy = new Float32Array((W + 1) * (H + 1));
  const under = w.underCells;
  for (let z = 0; z <= H; z++) {
    for (let x = 0; x <= W; x++) {
      // (las paredes no cuentan: contra el muro el terreno cae a pique)
      let s = 0;
      let c = 0;
      let wallY = -Infinity;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const cx = x + dx;
        const cz = z + dz;
        if (cx < 0 || cz < 0 || cx >= W || cz >= H) continue;
        const i = cz * W + cx;
        if (under.has(i)) {
          s += under.get(i);
          c++;
          continue;
        }
        const t = w.grid[i];
        if (t === OUT) {
          s += w.ty[i];
          c++;
        } else wallY = Math.max(wallY, t === WALL ? w.ty[i] : w.fy[i]);
      }
      cy[z * (W + 1) + x] = c ? s / c : Number.isFinite(wallY) ? wallY - 0.4 : 0;
    }
  }
  return cy;
}

// Las zonas enterradas (la bodega, las mazmorras, la gruta y la cueva): la
// montaña pasa por arriba de sus techos.
function buriedCells(w) {
  const map = new Map();
  for (const [k, Z] of Object.entries(ZONES)) {
    if (!Z.under) continue;
    const zi = w.zoneKeys.indexOf(k);
    const roof = Z.roof ?? (Z.y || 0) + 3.6;
    for (let i = 0; i < w.zone.length; i++) {
      if (w.zone[i] !== zi) continue;
      const x = i % MAP_W;
      const z = (i - x) / MAP_W;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = x + dx;
          const cz = z + dz;
          if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) continue;
          const j = cz * MAP_W + cx;
          const t = w.grid[j];
          // la pared de la zona enterrada también, y sus puertas y ventanas
          // (si no, arriba de cada puerta entre dos cuevas queda un agujero en
          // la montaña y desde el vuelo del dragón se ve adentro)
          if (t === OUT) continue;
          if (t === FLOOR && w.zone[j] !== zi) continue;
          // (una escalera con techo propio sube más que el de la zona)
          const own = t === FLOOR ? ceilMax(w, j) : -Infinity;
          let lid = Math.max(macroY(cx + 0.5, cz + 0.5), roof + 0.6, w.top[j] + 0.3, own + 0.6);
          // arriba de la cueva, lomas (solo para arriba): si no, queda una mesa lisa
          if (t === FLOOR) lid += NZ.fbm(cx / 5 + 13, cz / 5 + 7, 3, 4096) * 1.8;
          map.set(j, Math.max(map.get(j) || -Infinity, lid));
        }
      }
    }
  }
  return map;
}

// El faldón de una celda de terreno: donde termina contra algo que no es
// terreno (una pared, el cordón de un borde) y queda más alto o más bajo que
// la cara de eso, baja o sube una cara de roca. Si no, por la rendija se ve
// a través (y de costado la loma parece una lámina). Al lado de un puente no:
// ahí abajo va el vacío.
const EDGE_DIRS = [
  [1, 0, [1, 0], [1, 1]],
  [-1, 0, [0, 1], [0, 0]],
  [0, 1, [1, 1], [0, 1]],
  [0, -1, [0, 0], [1, 0]],
];
function skirts(w, x, z, i, cy, pos, uv, idx) {
  const W = MAP_W;
  for (const [dx, dz, ea, eb] of EDGE_DIRS) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= MAP_H) continue;
    const j = nz * W + nx;
    const t = w.grid[j];
    // abajo de un puente, contra lo que no es terreno (la meseta de la cumbre,
    // los miradores, la barbacana, las termas): una cara de roca desde el
    // fondo hasta su piso, mirando para el lado del puente (si no, desde el
    // vuelo del dragón se veía el cielo por debajo de las puntas)
    if (w.bridgeUnder?.has(i)) {
      if (t === OUT || w.underCells.has(j)) continue;
      const ax = x + ea[0];
      const az = z + ea[1];
      const bx = x + eb[0];
      const bz = z + eb[1];
      const ha = cy[az * (W + 1) + ax];
      const hb = cy[bz * (W + 1) + bx];
      const top = w.fy[j];
      if (top < Math.min(ha, hb) + 0.02) continue;
      const ox = -dx * 0.01;
      const oz = -dz * 0.01;
      const k = pos.length / 3;
      pos.push(ax + ox, ha - 0.05, az + oz, bx + ox, hb - 0.05, bz + oz, bx + ox, top, bz + oz, ax + ox, top, az + oz);
      uv.push(0, 0, 1, 0, 1, (top - hb) / 4, 0, (top - ha) / 4);
      const nxv = bz - az;
      const nzv = -(bx - ax);
      if (nxv * dx + nzv * dz > 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
      continue;
    }
    if (t === OUT || t === FLOOR || w.underCells.has(j)) continue;
    let bridge = false;
    for (const [ddx, ddz] of DIRS) {
      const qx = nx + ddx;
      const qz = nz + ddz;
      if (qx >= 0 && qz >= 0 && qx < W && qz < MAP_H && w.grid[qz * W + qx] === FLOOR && bridgeCell(w, qz * W + qx)) bridge = true;
    }
    if (bridge) continue;
    const ax = x + ea[0];
    const az = z + ea[1];
    const bx = x + eb[0];
    const bz = z + eb[1];
    const ha = cy[az * (W + 1) + ax];
    const hb = cy[bz * (W + 1) + bx];
    // la cara de la pared (o del cordón) de ese lado: de lo = su base a hi
    const lo = w.edge[j] ? (w.curbBase ? w.curbBase(nx, nz, w.ty[i] - 0.6, w.fy[j]) : w.ty[i] - 0.6) : w.ty[i] - 0.6;
    const hi = w.edge[j] ? w.fy[j] : Infinity;
    // la franja que falta: entre el terreno y la cara (arriba o abajo de ella)
    const span = (h) => (h > hi ? [hi, h] : h < lo ? [h, lo] : [h, h]);
    const [a0, a1] = span(ha);
    const [b0, b1] = span(hb);
    if (a1 - a0 < 0.02 && b1 - b0 < 0.02) continue;
    // (un poquito hacia el terreno, para no pisarse con la cara de la pared)
    const ox = -dx * 0.01;
    const oz = -dz * 0.01;
    const k = pos.length / 3;
    pos.push(ax + ox, a0 - 0.05, az + oz, bx + ox, b0 - 0.05, bz + oz, bx + ox, b1 + 0.02, bz + oz, ax + ox, a1 + 0.02, az + oz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // que mire hacia la pared (hacia d)
    const ux = bx - ax;
    const uz = bz - az;
    const nxv = uz;
    const nzv = -ux;
    if (nxv * dx + nzv * dz > 0) idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    else idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
}

export function buildMountain(w) {
  const M = w.M;
  const T = w.T;
  const W = MAP_W;
  const H = MAP_H;
  const r = rng(4242);
  w.underCells = buriedCells(w);
  // debajo de los puentes (y de sus cordones) también va montaña: el fondo
  // del precipicio se ve por el hueco del puente levadizo y entre los pilares
  // (bridgeUnder: esas celdas, para los faldones de las puntas)
  w.bridgeUnder = new Set();
  for (const Z of Object.values(ZONES)) {
    for (const r of Z.rects || []) {
      if (!r[6]) continue;
      const alongX = r[2] - r[0] > r[3] - r[1];
      for (let z = r[1] - (alongX ? 1 : 0); z <= r[3] + (alongX ? 1 : 0); z++) {
        for (let x = r[0] - (alongX ? 0 : 1); x <= r[2] + (alongX ? 0 : 1); x++) {
          if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) continue;
          const j = z * MAP_W + x;
          if (!w.underCells.has(j)) {
            w.underCells.set(j, Math.min(macroY(x + 0.5, z + 0.5), (w.fy[j] || 0) - 3));
            w.bridgeUnder.add(j);
          }
        }
      }
    }
  }
  const cy = cornerHeights(w);
  const mat = snowRockMaterial(T, M);
  M.mountain = mat;
  const pos = [];
  const uv = [];
  const idx = [];
  const rocks = [];
  // (los bordes del mapa, en las esquinas impares, van en línea con las de a
  // 2 m del anillo de afuera: si no, quedan rendijas)
  for (let x = 1; x < W; x += 2) {
    for (const z of [0, H]) cy[z * (W + 1) + x] = (cy[z * (W + 1) + x - 1] + cy[z * (W + 1) + x + 1]) / 2;
  }
  for (let z = 1; z < H; z += 2) {
    for (const x of [0, W]) cy[z * (W + 1) + x] = (cy[(z - 1) * (W + 1) + x] + cy[(z + 1) * (W + 1) + x]) / 2;
  }
  // la grilla: afuera y encima de lo enterrado, con los vértices compartidos
  // entre celdas (así la luz no queda en escalones)
  const vid = new Int32Array((W + 1) * (H + 1)).fill(-1);
  const vtx = (x, z) => {
    const k = z * (W + 1) + x;
    if (vid[k] < 0) {
      vid[k] = pos.length / 3;
      pos.push(x, cy[k], z);
      uv.push(x / 4, z / 4);
    }
    return vid[k];
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (w.grid[i] !== OUT && !w.underCells.has(i)) continue;
      const A = vtx(x, z);
      const B = vtx(x + 1, z);
      const C = vtx(x + 1, z + 1);
      const D = vtx(x, z + 1);
      idx.push(D, C, B, D, B, A);
      skirts(w, x, z, i, cy, pos, uv, idx);
      const a = cy[z * (W + 1) + x];
      const bb = cy[z * (W + 1) + x + 1];
      const c = cy[(z + 1) * (W + 1) + x + 1];
      const d = cy[(z + 1) * (W + 1) + x];
      if (Math.max(a, bb, c, d) - Math.min(a, bb, c, d) > 1.4 && r() < 0.08) {
        const u = r();
        const v = r();
        rocks.push([x + u, a * (1 - u) * (1 - v) + bb * u * (1 - v) + c * u * v + d * (1 - u) * v, z + v, 0.3 + r() * 0.8]);
      }
    }
  }
  // más allá de la grilla la montaña sigue (de a 2 m), también con vértices compartidos
  const EXT = 90;
  const edgeH = (x, z) => {
    const cx = Math.max(0, Math.min(W, x));
    const cz = Math.max(0, Math.min(H, z));
    const d = Math.hypot(x - cx, z - cz);
    // (las piedras caen entre vértices: leer la grilla con un índice con coma
    // daba NaN y la piedra rota ensuciaba la pantalla entera)
    const ix = Math.min(W - 1, Math.floor(cx));
    const iz = Math.min(H - 1, Math.floor(cz));
    const u = cx - ix;
    const v = cz - iz;
    const at = (a, b) => cy[b * (W + 1) + a];
    const hb = at(ix, iz) * (1 - u) * (1 - v) + at(ix + 1, iz) * u * (1 - v) + at(ix + 1, iz + 1) * u * v + at(ix, iz + 1) * (1 - u) * v;
    const m = macroY(x, z);
    return hb + (m - hb) * smooth(0, 10, d);
  };
  const S = 2;
  const NX = (W + 2 * EXT) / S + 1;
  const ring = new Map();
  const rv = (x, z) => {
    const k = ((z + EXT) / S) * NX + (x + EXT) / S;
    let v = ring.get(k);
    if (v === undefined) {
      v = pos.length / 3;
      pos.push(x, edgeH(x, z), z);
      uv.push(x / 4, z / 4);
      ring.set(k, v);
    }
    return v;
  };
  for (let z = -EXT; z < H + EXT; z += S) {
    for (let x = -EXT; x < W + EXT; x += S) {
      if (x >= 0 && z >= 0 && x + S <= W && z + S <= H) continue;
      const A = rv(x, z);
      const B = rv(x + S, z);
      const C = rv(x + S, z + S);
      const D = rv(x, z + S);
      idx.push(D, C, B, D, B, A);
      if (r() < 0.012) {
        const px = x + r() * S;
        const pz = z + r() * S;
        rocks.push([px, edgeH(px, pz), pz, 0.6 + r() * 1.4]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  terrain.matrixAutoUpdate = false;
  w.root.add(terrain);
  w.terrainMesh = terrain;
  // piedras sueltas con nieve encima
  if (rocks.length) {
    const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mat, rocks.length);
    const m4 = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    rocks.forEach(([x, y, z, s], k) => {
      qq.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      m4.compose(new THREE.Vector3(x, y - s * 0.2, z), qq, new THREE.Vector3(s, s * (0.5 + r() * 0.4), s * (0.8 + r() * 0.4)));
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    w.root.add(im);
  }
  // la altura de la malla en (x, z), lo que de verdad se ve (con los mismos
  // triángulos): null donde no hay terreno (el castillo)
  const surfY = (x, z) => {
    let x0, z0, s, at;
    if (x >= 0 && z >= 0 && x < W && z < H) {
      x0 = Math.floor(x);
      z0 = Math.floor(z);
      const i = z0 * W + x0;
      if (w.grid[i] !== OUT && !w.underCells.has(i)) return null;
      s = 1;
      at = (a, b) => cy[b * (W + 1) + a];
    } else {
      x0 = Math.floor((x + EXT) / S) * S - EXT;
      z0 = Math.floor((z + EXT) / S) * S - EXT;
      s = S;
      at = edgeH;
    }
    const u = (x - x0) / s;
    const v = (z - z0) / s;
    const a = at(x0, z0);
    const bb = at(x0 + s, z0);
    const c = at(x0 + s, z0 + s);
    const d = at(x0, z0 + s);
    return u + v > 1 ? c + (d - c) * (1 - u) + (bb - c) * (1 - v) : a + (bb - a) * u + (d - a) * v;
  };
  buildRange(w, mat);
  buildAraucarias(w, M, surfY);
}

// La cordillera de fondo: un anillo de picos nevados, con el Aconcagua al noroeste.
function buildRange(w, mat) {
  const cx = MAP_W / 2;
  const cz = MAP_H / 2;
  // (bien fina: con pocas caras los picos eran triángulos de cartón)
  const A = 640;
  const R = 32;
  const r0 = 170;
  const r1 = 285;
  const pos = [];
  const idx = [];
  const hAt = (a, t) => {
    // picos: ruido "quebrado" (1 - |ruido|) a lo largo del anillo
    const u = (a / (Math.PI * 2)) * 40;
    const ridge = 1 - Math.abs(NZ.fbm(u, t * 3 + 11, 4, 40) * 2 - 1);
    let hgt = 40 + ridge * ridge * 95;
    // aristas secundarias y canaletas (más marcadas donde el pico es alto)
    const r2 = 1 - Math.abs(NZ.fbm(u * 3 + 7, t * 8 + 3, 3, 120) * 2 - 1);
    hgt += r2 * r2 * 24 * (0.35 + ridge) - 8;
    hgt += (NZ.fbm(u * 9, t * 22 + 50, 2, 360) - 0.5) * 7;
    // el Aconcagua, el techo de América (al noroeste)
    const da = Math.atan2(Math.sin(a - -2.25), Math.cos(a - -2.25));
    hgt += Math.exp(-(da * da) / 0.012) * 120 * (1 - Math.abs(t - 0.55) * 1.4);
    // de cerca más bajo (se ve el valle), en el medio los picos, atrás bajan
    return hgt * Math.sin(Math.min(1, t * 1.25) * Math.PI) - 10;
  };
  for (let i = 0; i <= A; i++) {
    const a = (i / A) * Math.PI * 2;
    for (let j = 0; j <= R; j++) {
      const t = j / R;
      const rr = r0 + (r1 - r0) * t;
      pos.push(cx + Math.cos(a) * rr, hAt(a, t), cz + Math.sin(a) * rr);
    }
  }
  for (let i = 0; i < A; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j;
      const b = a + R + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uvs = [];
  for (let k = 0; k < pos.length; k += 3) uvs.push(pos[k] / 12, pos[k + 2] / 12);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // (sin la niebla del juego, que a esa distancia la borraba: una bruma fija
  // del color del horizonte, así se ven los picos nevados con la luna)
  const far = rangeMaterial(w.T);
  const range = new THREE.Mesh(geo, far);
  range.matrixAutoUpdate = false;
  w.root.add(range);
}

// Araucarias en las laderas bajas del valle (al sur y al oeste): tronco recto
// y las ramas en paraguas, con nieve arriba.
function buildAraucarias(w, M, ground) {
  const r = rng(515);
  const list = [];
  const FOOT = [
    [0, 0],
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
  ];
  for (let t = 0; t < 900 && list.length < 70; t++) {
    const x = -70 + r() * (MAP_W + 140);
    const z = -40 + r() * (MAP_H + 110);
    // afuera del castillo y no en el precipicio ni en la montaña alta
    if (x > 8 && x < 104 && z > 0 && z < 98) continue;
    // parada en la malla de verdad y no en lo empinado: con macroY, en la
    // quebrada del precipicio (el faldón va de a 2 m) quedaba flotando frente
    // al barranco
    let lo = Infinity;
    let hi = -Infinity;
    for (const [dx, dz] of FOOT) {
      const h = ground(x + dx, z + dz);
      lo = Math.min(lo, h ?? NaN);
      hi = Math.max(hi, h ?? NaN);
    }
    if (!(hi - lo < 1.6)) continue;
    const y = lo;
    if (y > 30 || y < 2) continue;
    list.push([x, y, z, 0.7 + r() * 0.7]);
  }
  if (!list.length) return;
  // la araucaria (pehuén): tronco pelado y recto, y arriba las ramas en cinco
  // coronas (las de arriba cortas, las de abajo largas: el paraguas), gruesas
  // como sogas verdes, que salen casi derechas y levantan la punta; cada rama
  // lleva dos ramitas a los costados y la nieve se queda arriba de las ramas
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 7).translate(0, 0.5, 0);
  const branchCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, -0.02, 0), new THREE.Vector3(0.7, -0.02, 0), new THREE.Vector3(0.92, 0.1, 0), new THREE.Vector3(1.02, 0.26, 0)]);
  const twigCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.0, 0), new THREE.Vector3(0.85, 0.1, 0), new THREE.Vector3(1, 0.32, 0)]);
  const rope = (curve, segs, radial, rad, lift, from = 0) => {
    const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const pos = geo.attributes.position;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, c);
      const k = t < from ? 0.001 : rad * (1 - t * 0.4);
      for (let j = 0; j <= radial; j++) {
        const n = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c);
        v.y += lift;
        pos.setXYZ(n, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    return geo;
  };
  const leaf = windy(new THREE.MeshStandardMaterial({ color: 0x28452a, roughness: 0.95 }), { crown: true, amp: 0.6 });
  // (la nieve de las ramas se mece con ellas: una copia, la de los techos queda quieta)
  const branchSnow = windy(M.snowCap.clone(), { crown: true, amp: 0.6 });
  // [bajada desde la punta del tronco, ramas, largo, inclinación]
  const WHORLS = [
    [0.05, 6, 0.4, 0.12],
    [0.62, 7, 0.6, 0.02],
    [1.25, 7, 0.78, -0.03],
    [1.95, 8, 0.93, -0.06],
    [2.7, 7, 1, -0.1],
  ];
  const TWIGS = [
    [0.55, 0.85],
    [0.78, -0.85],
  ];
  const per = WHORLS.reduce((n, [, c]) => n + c, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, M.bark, list.length);
  const branches = new THREE.InstancedMesh(rope(branchCurve, 8, 5, 0.09, 0), leaf, list.length * per);
  const snows = new THREE.InstancedMesh(rope(branchCurve, 6, 3, 0.055, 0.06, 0.15), branchSnow, list.length * per);
  const twigs = new THREE.InstancedMesh(rope(twigCurve, 4, 4, 0.16, 0), leaf, list.length * per * TWIGS.length);
  const tops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leaf, list.length);
  const m4 = new THREE.Matrix4();
  const t4 = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const e = new THREE.Euler();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(0.34, 0.34, 0.34);
  let k = 0;
  let kt = 0;
  list.forEach(([x, y, z, s], i) => {
    const hgt = 10 * s;
    m4.compose(new THREE.Vector3(x, y - 0.3, z), qq.identity(), new THREE.Vector3(s, hgt, s));
    trunk.setMatrixAt(i, m4);
    const top = y + hgt - 0.3;
    const R = 3.6 * s;
    m4.compose(new THREE.Vector3(x, top + 0.25 * s, z), qq.identity(), new THREE.Vector3(0.5 * s, 0.6 * s, 0.5 * s));
    tops.setMatrixAt(i, m4);
    for (const [drop, count, reach, tilt] of WHORLS) {
      const off = r() * Math.PI;
      for (let j = 0; j < count; j++) {
        const a = off + (j / count) * Math.PI * 2 + (r() - 0.5) * 0.3;
        const len = R * reach * (0.85 + r() * 0.25);
        e.set(0, -a, tilt + (r() - 0.5) * 0.12);
        qq.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, top - drop * s, z), qq, new THREE.Vector3(len, len, len));
        branches.setMatrixAt(k, m4);
        snows.setMatrixAt(k, m4);
        k++;
        // las ramitas: salen de costado, hacia adelante y un poco para arriba
        for (const [u, side] of TWIGS) {
          branchCurve.getPointAt(u, at);
          e.set(0, side + (r() - 0.5) * 0.3, 0.12);
          qq.setFromEuler(e);
          t4.compose(at, qq, one);
          twigs.setMatrixAt(kt++, t4.premultiply(m4));
        }
      }
    }
  });
  trunk.castShadow = branches.castShadow = true;
  w.root.add(trunk, branches, snows, twigs, tops);
}


