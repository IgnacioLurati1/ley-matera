import * as THREE from 'three';
import { MAP_W, MAP_H, ZONES } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';

// La roca de las islas de Eclipse Matero: lo que hace que cada pedazo de mundo
// sea una isla que flota y no una caja. Alrededor del piso de cada isla sale
// una repisa de tierra y piedra de borde irregular que cae hacia afuera, y
// abajo cuelga la masa de roca arrancada, en punta, con colmillos.
//
// Todo es UNA malla (un dibujo): caras planas, color por vértice, sin
// texturas. Se arma una vez, en la carga, desde la grilla del mundo (las
// celdas que no son vacío), así sigue al layout sin tocar nada a mano.
// No tiene choques: queda del lado de afuera de las barandas.

const OUT = 0;
// hasta dónde puede salir la repisa del borde de la isla (celdas)
const PAD = 8;

// la tierra de arriba y la piedra de abajo de cada isla
const LOOK = {
  centro: { soil: 0x3d5a34, rock: 0x4a4038, deep: 0x241c22 },
  molino: { soil: 0x8a3c22, rock: 0x6a4030, deep: 0x2c1a1c },
  tapera: { soil: 0x9a6a34, rock: 0x75553a, deep: 0x30201c },
  penal: { soil: 0x5c6258, rock: 0x4c5050, deep: 0x1e2226 },
  monumento: { soil: 0xb8b0a0, rock: 0x8c8880, deep: 0x3a3a44 },
  torre: { soil: 0x5a5236, rock: 0x3c3830, deep: 0x1c1a20 },
  castillo: { soil: 0xdfe8f2, rock: 0x6c7480, deep: 0x282c38 },
  desgarro: { soil: 0x3a1c58, rock: 0x241238, deep: 0x100618 },
};
// cuánto puede colgar la masa de abajo (m). El Desgarro flota arriba del claro y
// al lado del castillo: con la fórmula sola su roca bajaba 35 m y atravesaba el
// claro como una columna.
const HANG = { centro: 20, molino: 18, tapera: 20, penal: 22, monumento: 18, torre: 16, castillo: 15, desgarro: 8 };
// el brillo del desgarro en las puntas de abajo
const RIFT = new THREE.Color(0x7a2cc8);

const fract = (v) => v - Math.floor(v);
const hash = (x, z, s) => fract(Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453);
function vnoise(x, z, s) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s);
  const b = hash(xi + 1, zi, s);
  const c = hash(xi, zi + 1, s);
  const d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm = (x, z, s) => vnoise(x, z, s) * 0.6 + vnoise(x * 2.1, z * 2.1, s + 9) * 0.28 + vnoise(x * 4.3, z * 4.3, s + 21) * 0.12;

export function buildEclipseRock(w) {
  const pos = [];
  const col = [];
  const tmp = new THREE.Color();
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const cC = new THREE.Color();
  // De qué isla es cada celda maciza. El piso, por su zona; las paredes y los
  // bordes (sin zona), por el piso que tienen pegado. (Antes se miraba la caja
  // de la isla con dos celdas de margen: el borde irregular del claro caía
  // adentro de la caja del Desgarro, que está a 5 celdas, y su roca tomaba la
  // altura del claro: colgaba 30 m, como una columna.)
  const names = Object.keys(ISLANDS);
  const own = new Int8Array(MAP_W * MAP_H).fill(-1);
  for (let i = 0; i < own.length; i++) {
    const zi = w.zone[i];
    if (w.grid[i] !== OUT && zi >= 0) own[i] = names.indexOf(ZONES[w.zoneKeys[zi]].isla);
  }
  for (let pass = 0; pass < 2; pass++) {
    const add = [];
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] === OUT || own[i] >= 0) continue;
        for (let dz = -1; dz <= 1 && own[i] < 0; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!w.inside(x + dx, z + dz)) continue;
            const o = own[w.idx(x + dx, z + dz)];
            if (o >= 0) {
              add.push(i, o);
              dz = 2;
              break;
            }
          }
        }
      }
    }
    for (let k = 0; k < add.length; k += 2) own[add[k]] = add[k + 1];
  }
  let seed = 3;
  for (const [isla, I] of Object.entries(ISLANDS)) {
    seed += 17;
    const me = names.indexOf(isla);
    const L = LOOK[isla] || LOOK.centro;
    cA.setHex(L.soil);
    cB.setHex(L.rock);
    cC.setHex(L.deep);
    const x0 = Math.max(0, I.box[0] - PAD - 2);
    const z0 = Math.max(0, I.box[1] - PAD - 2);
    const x1 = Math.min(MAP_W - 1, I.box[2] + PAD + 2);
    const z1 = Math.min(MAP_H - 1, I.box[3] + PAD + 2);
    const W = x1 - x0 + 1;
    const H = z1 - z0 + 1;
    const n = W * H;
    const at = (x, z) => (z - z0) * W + (x - x0);
    // lo macizo de la isla (piso, paredes, bordes) y su altura
    const solid = new Uint8Array(n);
    const dOut = new Float32Array(n).fill(1e6); // de una celda de afuera a lo macizo
    const dIn = new Float32Array(n).fill(1e6); // de una celda maciza al borde
    const near = new Float32Array(n); // altura del piso macizo más cercano
    let yMin = Infinity;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, z);
        if (w.grid[i] === OUT || own[i] !== me) continue;
        const j = at(x, z);
        solid[j] = 1;
        dOut[j] = 0;
        near[j] = w.fy[i];
        yMin = Math.min(yMin, w.fy[i]);
      }
    }
    for (let j = 0; j < n; j++) if (!solid[j]) dIn[j] = 0;
    // lo macizo de OTRAS islas que cae en este recuadro, engordado dos celdas:
    // ahí esta roca no entra (ni la repisa por arriba ni la masa por abajo)
    const blocked = new Uint8Array(n);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (w.grid[w.idx(x, z)] === OUT || solid[at(x, z)]) continue;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx >= x0 && nx <= x1 && nz >= z0 && nz <= z1) blocked[at(nx, nz)] = 1;
          }
        }
      }
    }
    // distancias por barrido (ida y vuelta, vecinos de costado y en diagonal)
    const sweep = (D, carry) => {
      const pass = (zs, ze, zd, xs, xe, xd) => {
        for (let z = zs; z !== ze; z += zd) {
          for (let x = xs; x !== xe; x += xd) {
            const j = z * W + x;
            for (const [dx, dz, c] of [[-xd, 0, 1], [0, -zd, 1], [-xd, -zd, 1.414], [xd, -zd, 1.414]]) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
              const k = nz * W + nx;
              if (D[k] + c < D[j]) {
                D[j] = D[k] + c;
                if (carry) near[j] = near[k];
              }
            }
          }
        }
      };
      pass(0, H, 1, 0, W, 1);
      pass(H - 1, -1, -1, W - 1, -1, -1);
    };
    sweep(dOut, true);
    sweep(dIn, false);
    // el ancho de la repisa en cada punto: lóbulos grandes y ruido
    const cx = I.center[0];
    const cz = I.center[1];
    // el "radio" de la isla (para cuánto se afina la roca hacia abajo)
    const R = Math.max(I.box[2] - I.box[0], I.box[3] - I.box[1]) / 2 + 3;
    const wide = new Float32Array(n);
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const gx = x + x0;
        const gz = z + z0;
        const a = Math.atan2(gz - cz, gx - cx);
        wide[z * W + x] = Math.min(PAD - 0.5, 2.0 + 3.8 * fbm(gx * 0.09, gz * 0.09, seed) + 1.5 * Math.sin(a * 3 + seed) + 1.0 * Math.sin(a * 5 + seed * 1.7));
      }
    }
    const inRock = (j) => dOut[j] <= wide[j] && !blocked[j];
    // un vértice por celda (en su medio, corrido un poco), arriba y abajo
    const top = new Float32Array(n * 3);
    const bot = new Float32Array(n * 3);
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const j = z * W + x;
        if (!inRock(j)) continue;
        const gx = x + x0;
        const gz = z + z0;
        const d = dOut[j];
        const wj = Math.max(0.5, wide[j]);
        const out = d > 0 ? 1 : 0;
        const px = gx + 0.5 + out * (hash(gx, gz, seed + 1) - 0.5) * 0.6;
        const pz = gz + 0.5 + out * (hash(gx, gz, seed + 2) - 0.5) * 0.6;
        const k = Math.min(1, d / wj);
        // arriba: a ras del piso contra la isla; hacia afuera cae
        const drop = Math.pow(k, 1.5) * (1.1 + 2.4 * vnoise(gx * 0.3, gz * 0.3, seed + 3)) + out * (hash(gx, gz, seed + 4) - 0.5) * 0.35;
        top[j * 3] = px;
        top[j * 3 + 1] = near[j] - 0.3 - drop;
        top[j * 3 + 2] = pz;
        // abajo: cuanto más adentro de la isla, más honda la roca; cada tanto, un colmillo
        const e = d > 0 ? Math.max(0, wj - d) : wj + dIn[j];
        let deep = 1.2 + 1.55 * Math.pow(e, 0.92) * (0.65 + 0.7 * fbm(gx * 0.13, gz * 0.13, seed + 5));
        if (hash(gx, gz, seed + 6) > 0.94) deep *= 1.35 + hash(gx, gz, seed + 7) * 0.6;
        deep = Math.min(deep, (HANG[isla] || 16) * (0.85 + 0.3 * hash(gx, gz, seed + 13)));
        const by = Math.min(top[j * 3 + 1] - 0.8, yMin - deep);
        // cuanto más abajo, más hacia el eje de la isla: la masa cuelga en
        // punta, como arrancada, y no como una columna de paredes rectas
        const pull = Math.min(0.62, Math.max(0, near[j] - by - 2.5) / (R * 1.9));
        // (y más desparejo cuanto más honda: si no, las caras planas quedaban
        // en paños enormes, como losas)
        const rough = Math.min(1, (near[j] - by) / 9);
        bot[j * 3] = px + (cx - px) * pull + (hash(gx, gz, seed + 8) - 0.5) * (0.5 + 1.1 * rough);
        bot[j * 3 + 1] = by + (hash(gx, gz, seed + 10) - 0.5) * 2.6 * rough;
        bot[j * 3 + 2] = pz + (cz - pz) * pull + (hash(gx, gz, seed + 9) - 0.5) * (0.5 + 1.1 * rough);
      }
    }
    const yLow = (() => {
      let m = Infinity;
      for (let j = 0; j < n; j++) if (inRock(j)) m = Math.min(m, bot[j * 3 + 1]);
      return m;
    })();
    const push = (P, j, c) => {
      pos.push(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
      col.push(c.r, c.g, c.b);
    };
    const topCol = (j) => {
      // tierra arriba, piedra donde cae
      const k = Math.min(1, dOut[j] / Math.max(0.5, wide[j]));
      return tmp.copy(cA).lerp(cB, Math.min(1, k * 1.3)).multiplyScalar(0.82 + 0.3 * hash(j, seed, 11));
    };
    const botCol = (j) => {
      // piedra que se oscurece hacia abajo; las puntas, con el violeta del desgarro
      const k = Math.min(1, (near[j] - bot[j * 3 + 1]) / Math.max(4, yMin - yLow + 4));
      tmp.copy(cB).lerp(cC, Math.min(1, k * 1.25)).multiplyScalar(0.8 + 0.3 * hash(j, seed, 12));
      if (k > 0.72) tmp.lerp(RIFT, (k - 0.72) * 1.6);
      return tmp;
    };
    for (let z = 0; z < H - 1; z++) {
      for (let x = 0; x < W - 1; x++) {
        const a = z * W + x;
        const b = a + 1;
        const c = a + W;
        const d = c + 1;
        if (!inRock(a) || !inRock(b) || !inRock(c) || !inRock(d)) continue;
        // arriba: solo donde asoma (lo de adentro lo tapa la isla)
        if (!(solid[a] && solid[b] && solid[c] && solid[d])) {
          for (const j of [a, c, b, b, c, d]) push(top, j, topCol(j));
        }
        // abajo: toda la panza, mirando hacia abajo
        for (const j of [a, b, c, b, d, c]) push(bot, j, botCol(j));
      }
    }
    // los costados: donde un cuadro de roca no tiene vecino
    const quad = (x, z) => x >= 0 && z >= 0 && x < W - 1 && z < H - 1 && inRock(z * W + x) && inRock(z * W + x + 1) && inRock((z + 1) * W + x) && inRock((z + 1) * W + x + 1);
    const side = (p, q) => {
      // (p, q): borde recorrido con el vacío a la derecha
      push(top, p, topCol(p));
      push(bot, p, botCol(p));
      push(top, q, topCol(q));
      push(top, q, topCol(q));
      push(bot, p, botCol(p));
      push(bot, q, botCol(q));
    };
    for (let z = 0; z < H - 1; z++) {
      for (let x = 0; x < W - 1; x++) {
        if (!quad(x, z)) continue;
        const a = z * W + x;
        const b = a + 1;
        const c = a + W;
        const d = c + 1;
        if (!quad(x, z - 1)) side(b, a);
        if (!quad(x, z + 1)) side(c, d);
        if (!quad(x - 1, z)) side(a, c);
        if (!quad(x + 1, z)) side(d, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'eclipseRock';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  w.root.add(mesh);
  return mesh;
}
