import * as THREE from 'three';
import { CELL } from './World';
import { PLAYER_START } from '../config/map';

// Manchas en el piso y en las paredes (prueba 2026-10-04: el usuario quiere
// ver si valen la pena): sangre seca, barro y humedad (en el piso al pie de las
// paredes y subiendo por la pared). Texturas hechas a mano en un canvas, cuatro
// mallas instanciadas (cuatro dibujos), sin sombra ni profundidad: se pegan al
// piso con polygonOffset. En todos los mapas (el usuario, 2026-10-04);
// globalThis.__mduNoStains = true (al cargar): sin manchas.

const rnd = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  draw(x, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// una mancha irregular: muchos círculos blandos alrededor del medio
function blob(x, S, r, n, rgb, a0, spread) {
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const d = Math.pow(r(), 0.7) * S * spread;
    const cx = S / 2 + Math.cos(ang) * d;
    const cy = S / 2 + Math.sin(ang) * d;
    const rad = S * (0.05 + r() * 0.14) * (1 - d / (S * 0.6));
    if (rad <= 1) continue;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${rgb},${a0})`);
    g.addColorStop(0.7, `rgba(${rgb},${a0 * 0.8})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fill();
  }
}

const TEX = {
  // sangre seca: oscura, con gotas alrededor
  blood: () =>
    canvasTex((x, S) => {
      const r = rnd(7);
      blob(x, S, r, 70, '98,16,10', 0.4, 0.22);
      blob(x, S, r, 30, '66,8,6', 0.38, 0.12);
      for (let i = 0; i < 46; i++) {
        const ang = r() * Math.PI * 2;
        const d = S * (0.22 + r() * 0.26);
        const rad = 1.5 + r() * r() * 6;
        x.fillStyle = `rgba(${80 + r() * 30},10,6,${0.4 + r() * 0.3})`;
        x.beginPath();
        x.ellipse(S / 2 + Math.cos(ang) * d, S / 2 + Math.sin(ang) * d, rad * (1 + r()), rad, ang, 0, Math.PI * 2);
        x.fill();
      }
    }),
  // barro: marrón, blando, con charquitos más oscuros
  mud: () =>
    canvasTex((x, S) => {
      const r = rnd(11);
      blob(x, S, r, 90, '96,72,44', 0.3, 0.3);
      blob(x, S, r, 26, '70,50,28', 0.32, 0.2);
    }),
  // humedad: un manchón oscuro con el borde marcado (donde se secó el agua)
  damp: () =>
    canvasTex((x, S) => {
      const r = rnd(23);
      blob(x, S, r, 60, '40,36,30', 0.1, 0.28);
      x.globalCompositeOperation = 'source-atop';
      const g = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5);
      g.addColorStop(0, 'rgba(34,30,26,0.05)');
      g.addColorStop(0.8, 'rgba(48,42,34,0.15)');
      g.addColorStop(1, 'rgba(48,42,34,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
    }),
  // la humedad que sube por la pared: de abajo (oscura) para arriba, con el borde ondulado
  wall: () =>
    canvasTex((x, S) => {
      const r = rnd(31);
      const cols = 32;
      for (let i = 0; i < cols; i++) {
        const h = S * (0.35 + 0.35 * Math.sin(i * 0.45 + r() * 0.8) * 0.5 + r() * 0.25);
        const g = x.createLinearGradient(0, S, 0, S - h);
        g.addColorStop(0, 'rgba(36,34,28,0.32)');
        g.addColorStop(0.75, 'rgba(46,42,34,0.18)');
        g.addColorStop(0.92, 'rgba(64,56,40,0.24)');
        g.addColorStop(1, 'rgba(46,44,30,0)');
        x.fillStyle = g;
        x.fillRect((i / cols) * S - 2, S - h, S / cols + 4, h);
      }
      // los costados se apagan
      x.globalCompositeOperation = 'destination-in';
      const e = x.createLinearGradient(0, 0, S, 0);
      e.addColorStop(0, 'rgba(0,0,0,0)');
      e.addColorStop(0.2, 'rgba(0,0,0,1)');
      e.addColorStop(0.8, 'rgba(0,0,0,1)');
      e.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = e;
      x.fillRect(0, 0, S, S);
    }),
};

const ROUGH = { blood: 0.32, mud: 0.85, damp: 0.55, wall: 0.7 };

export function buildStains(w, seed = 1) {
  const r = rnd(seed * 7919 + 13);
  const { W, H, grid } = w;
  const at = (x, z) => (w.inside(x, z) ? grid[w.idx(x, z)] : CELL.OUT);
  const list = { blood: [], mud: [], damp: [], wall: [] };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const ps = PLAYER_START;
  const start = ps ? (Array.isArray(ps) ? [ps[0], ps[ps.length > 2 ? 2 : 1]] : [ps.x, ps.z]) : null;
  // Cada mancha entera sobre piso plano (2026-10-05: salían del borde de un
  // escalón o caían sobre la escalera de al lado y quedaban en el aire: el
  // Propileo yendo al Pasaje, las escaleras de la Cripta). Se miran el medio y
  // dos anillos de puntos de la mancha: piso común (ni escalera, ni rampa, ni
  // puerta) a la misma altura; si no entra, se achica, y si queda chiquita, no
  // va. `wallOk`: la humedad al pie de una pared puede meterse abajo de la pared
  // (maciza: sin baranda ni reja). globalThis.__mduNoStainFit: como antes.
  const fitOn = globalThis.__mduNoStainFit !== true;
  const flatAt = (px, pz, y, wallOk) => {
    const cx = Math.floor(px);
    const cz = Math.floor(pz);
    if (!w.inside(cx, cz)) return false;
    const j = w.idx(cx, cz);
    if (grid[j] === CELL.WALL && wallOk) return !w.edge || w.edge[j] === 0;
    if (grid[j] !== CELL.FLOOR || w.rampAt?.[j] >= 0) return false;
    const h = w.groundCell?.[j] ? w.groundAt(px, pz) : w.fy[j];
    return Math.abs(h - y) < (w.groundCell?.[j] ? 0.03 : 0.01);
  };
  // (la torre: losa de la misma capa, no escalón, a la misma altura)
  const flatTower = (l, px, pz, y) => {
    const cx = Math.floor(px);
    const cz = Math.floor(pz);
    if (cx < 0 || cz < 0 || cx >= T.W || cz >= T.WH / T.W) return false;
    const k = l * T.WH + cz * T.W + cx;
    return !!T.kind[k] && T.kind[k] !== 2 && Math.abs(T.surfaceY(l, k, px, pz) - y) < 0.01;
  };
  // el tamaño que entra (la mancha mide s; su borde llega a s/2), o 0
  const fit = (x, z, s, ok) => {
    if (!fitOn) return s;
    for (let k = s; k >= 0.45; k *= 0.82) {
      const R = k * 0.5;
      let good = ok(x, z);
      for (let n = 0; n < 12 && good; n++) {
        const an = (n / 12) * Math.PI * 2;
        good = ok(x + Math.cos(an) * R, z + Math.sin(an) * R) && ok(x + Math.cos(an + 0.26) * R * 0.6, z + Math.sin(an + 0.26) * R * 0.6);
      }
      if (good) return k;
    }
    return 0;
  };
  const push = (L, p, ok) => {
    const s = fit(p.x, p.z, p.s, ok);
    if (s) L.push({ ...p, s });
  };
  // la torre: quince pisos de losa (world/Tower.js kind por capa); solo en el piso
  const T = w.tower;
  if (T) {
    for (let l = 0; l < T.L; l++) {
      for (let n = 0; n < 40; n++) {
        const x = T.T.x0 + r() * (T.T.x1 - T.T.x0 + 1);
        const z = T.T.z0 + r() * (T.T.z1 - T.T.z0 + 1);
        const k = l * T.WH + Math.floor(z) * T.W + Math.floor(x);
        if (!T.kind[k]) continue;
        const y = T.surfaceY(l, k, x, z);
        if (Math.abs(y - T.yOf(l)) > 0.05) continue;
        const u = r();
        const ok = (px, pz) => flatTower(l, px, pz, y);
        if (u < 0.3) push(list.blood, { x, y, z, s: 0.5 + r() * 1.2, a: r() * 6.3 }, ok);
        else if (u < 0.65) push(list.damp, { x, y, z, s: 0.8 + r() * 1.2, a: r() * 6.3 }, ok);
        else if (u < 0.85) push(list.mud, { x, y, z, s: 0.8 + r() * 1.3, a: r() * 6.3 }, ok);
      }
    }
  }
  for (let z = 1; z < H - 1 && !T; z++) {
    for (let x = 1; x < W - 1; x++) {
      const i = w.idx(x, z);
      if (grid[i] !== CELL.FLOOR || w.rampAt?.[i] >= 0) continue;
      // (lejos de donde arrancás: la primera vista, limpia)
      if (start && Math.hypot(x + 0.5 - start[0], z + 0.5 - start[1]) < 5) continue;
      const y = w.groundCell?.[i] ? w.groundAt(x + 0.5, z + 0.5) : w.fy[i];
      // (la pared de al lado, maciza: no una baranda ni una reja, que dejan ver el desnivel)
      const walls = DIRS.filter(([dx, dz]) => at(x + dx, z + dz) === CELL.WALL && (!fitOn || !w.edge || w.edge[w.idx(x + dx, z + dz)] === 0));
      const u = r();
      const ok = (px, pz) => flatAt(px, pz, y, false);
      if (walls.length && u < 0.07) {
        // humedad al pie de la pared, en el piso y subiendo por ella
        const [dx, dz] = walls[Math.floor(r() * walls.length)];
        const s = 0.7 + r() * 0.8;
        const n0 = list.damp.length;
        push(list.damp, { x: x + 0.5 + dx * 0.25, y, z: z + 0.5 + dz * 0.25, s, a: r() * 6.3 }, (px, pz) => flatAt(px, pz, y, true));
        // (la de la pared, solo si la del piso entró y la pared llega hasta arriba de la mancha)
        const h = 0.8 + r() * 0.9;
        const top = w.top?.[w.idx(x + dx, z + dz)];
        const tall = !fitOn || top == null || top >= y + h;
        // (y a lo largo de la pared no se pasa de donde hay pared y piso: en la
        // punta de un muro o en el vano de una puerta quedaba en el aire)
        let ws = 1.2 + r() * 1.4;
        if (fitOn) {
          const along = (k) => {
            for (let t = -k / 2; t <= k / 2 + 1e-6; t += 0.25) {
              const px = x + 0.5 + dz * t;
              const pz = z + 0.5 + dx * t;
              if (!flatAt(px, pz, y, false)) return false;
              const wx = Math.floor(px + dx * 0.75);
              const wz = Math.floor(pz + dz * 0.75);
              if (at(wx, wz) !== CELL.WALL || (w.edge && w.edge[w.idx(wx, wz)] !== 0)) return false;
            }
            return true;
          };
          while (ws >= 0.6 && !along(ws)) ws *= 0.8;
          if (ws < 0.6) ws = 0;
        }
        if (list.damp.length > n0 && tall && ws) list.wall.push({ x: x + 0.5 + dx * 0.49, y, z: z + 0.5 + dz * 0.49, s: ws, h, dx, dz });
      } else if (u < 0.085) {
        push(list.blood, { x: x + 0.2 + r() * 0.6, y, z: z + 0.2 + r() * 0.6, s: 0.5 + r() * 1.3, a: r() * 6.3 }, ok);
      } else if (!walls.length && u < 0.12) {
        push(list.mud, { x: x + r(), y, z: z + r(), s: 1 + r() * 1.8, a: r() * 6.3 }, ok);
      }
    }
  }
  // (no tantas: en La Tapera el patio entero es piso y salían cientos)
  const MAXN = { blood: 45, mud: 90, damp: 50, wall: 50 };
  for (const k of Object.keys(list)) {
    const L = list[k];
    while (L.length > MAXN[k]) L.splice(Math.floor(r() * L.length), 1);
  }
  const root = new THREE.Group();
  root.name = 'stains';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const up = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  for (const [k, L] of Object.entries(list)) {
    if (!L.length) continue;
    const mat = new THREE.MeshStandardMaterial({ map: TEX[k](), transparent: true, depthWrite: false, roughness: ROUGH[k], metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const im = new THREE.InstancedMesh(k === 'wall' ? up : flat, mat, L.length);
    L.forEach((p, n) => {
      if (k === 'wall') {
        // de cara al cuarto (la pared está del lado dx, dz)
        q.setFromAxisAngle(v.set(0, 1, 0), Math.atan2(-p.dx, -p.dz));
        m4.compose(v.set(p.x - p.dx * 0.012, p.y, p.z - p.dz * 0.012), q, sc.set(p.s, p.h, 1));
      } else {
        q.setFromAxisAngle(v.set(0, 1, 0), p.a);
        m4.compose(v.set(p.x, p.y + 0.012, p.z), q, sc.set(p.s, 1, p.s));
      }
      im.setMatrixAt(n, m4);
    });
    im.castShadow = false;
    im.receiveShadow = true;
    im.renderOrder = -1;
    im.computeBoundingSphere();
    root.add(im);
  }
  w.root.add(root);
  w.stains = root;
  return root;
}
