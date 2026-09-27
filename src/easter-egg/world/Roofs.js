import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { tejasTexture } from './Farm';

// Techos de adorno (solo se ven de afuera; adentro siguen los cielorrasos de
// siempre y no chocan con nada): a dos aguas sobre cada edificio, para que
// no parezcan cajas. Por ahora los usa el molino.
//
// rect: el borde de afuera de las paredes (x0, z0, x1, z1); axis: hacia dónde
// corre la cumbrera; base: la altura de las paredes (el altillo de la oficina
// es más alto); mat: 'tin' (chapa) o 'tejas'; vent: respiradero del humo
// arriba de la cumbrera (el barbacuá); cross: una cruz en la punta (la capilla).
const MOLINO = [
  // la fila de atrás: el acopio y la sala de máquinas
  { rect: [3, 3, 31.45, 18], axis: 'x', rise: 2.4, mat: 'tin' },
  { rect: [31.55, 3, 57, 17.5], axis: 'x', rise: 2.8, mat: 'tin' },
  // el barbacuá (con el respiradero) y la capilla
  { rect: [31, 17.5, 46.5, 32.5], axis: 'z', rise: 3, mat: 'tin', soot: true, vent: true },
  { rect: [46.5, 17.5, 57, 32.5], axis: 'z', rise: 3.8, mat: 'tejas', cross: true },
  // la fila de adelante: el galpón, el almacén y la oficina (arriba del altillo)
  { rect: [3, 32, 20.45, 47], axis: 'x', rise: 2.4, mat: 'tin' },
  { rect: [20.55, 32.5, 41.5, 47], axis: 'x', rise: 2.6, mat: 'tejas' },
  { rect: [41, 32, 57, 47], axis: 'x', rise: 2.4, base: 6.4, mat: 'tejas' },
];
const ROOFS = { molino: MOLINO };
const WALL = 3.6;
// cuánto sale el alero de los costados (fuera de las paredes)
const OVER = 0.4;
// medianeras: el grueso, cuánto asoman por arriba de los techos y hasta
// dónde baja la pared (por debajo de los aleros)
const FW_T = 0.3;
const FW_UP = 0.22;
const FW_LOW = WALL - 0.45;
// lo que sale cada techo hacia la medianera (queda adentro de la pared)
const FW_END = 0.1;

export function buildRoofs(world, mapId) {
  if (!ROOFS[mapId]) return;
  const list = ROOFS[mapId].map((d) => ({ ...d }));
  const walls = firewalls(list);
  const M = world.M;
  const mats = {
    tin: M.roofTin,
    soot: (() => {
      const m = M.roofTin.clone();
      m.color = new THREE.Color(0x5a524a);
      return m;
    })(),
    tejas: new THREE.MeshStandardMaterial({ map: tejasTexture(), roughness: 0.82, side: THREE.DoubleSide }),
  };
  mats.tejas.bumpMap = mats.tejas.map;
  mats.tejas.bumpScale = 1.5;
  const head = M.exterior.clone();
  head.side = THREE.DoubleSide;
  const g = new THREE.Group();
  for (const d of list) {
    const mat = d.soot ? mats.soot : mats[d.mat] || mats.tin;
    gable(g, d, mat, head, M);
  }
  const brick = M.exterior;
  const cap = M.wallTop || M.stoneDark;
  for (const w of walls) firewall(g, w, brick, cap);
  world.addStatic(g);
}

// Dos techos pegados cabecera con cabecera (el galpón y el almacén, el acopio
// y la sala de máquinas): tienen anchos y alturas distintos, y los aleros y
// las tablas de uno se metían en el otro (la chapa atravesaba las tejas).
// Entre los dos va una medianera de ladrillo que asoma por arriba de ambos,
// y cada techo sale apenas hacia ella (FW_END), así queda adentro de la pared.
function firewalls(list) {
  const out = [];
  for (const a of list) {
    for (const b of list) {
      if (a === b || a.axis !== b.axis) continue;
      const X = a.axis === 'x';
      const aEnd = X ? a.rect[2] : a.rect[3];
      const bStart = X ? b.rect[0] : b.rect[1];
      if (Math.abs(bStart - aEnd) > 0.2) continue;
      // tienen que estar uno enfrente del otro, no de costado
      const lo = Math.max(X ? a.rect[1] : a.rect[0], X ? b.rect[1] : b.rect[0]);
      const hi = Math.min(X ? a.rect[3] : a.rect[2], X ? b.rect[3] : b.rect[2]);
      if (hi - lo < 1) continue;
      a.endB = FW_END;
      b.endA = FW_END;
      out.push({ at: (aEnd + bStart) / 2, axis: a.axis, roofs: [a, b] });
    }
  }
  return out;
}

// El perfil de un techo visto desde la cabecera: altura según v (la
// coordenada de un alero al otro), entre lo y hi (con los aleros).
function profile(d) {
  const [x0, z0, x1, z1] = d.rect;
  const X = d.axis === 'x';
  const lo = X ? z0 : x0;
  const hi = X ? z1 : x1;
  const mid = (lo + hi) / 2;
  const rise = d.rise || 2.4;
  const k = rise / ((hi - lo) / 2);
  const top = (d.base ?? WALL) + rise;
  return { lo: lo - OVER, hi: hi + OVER, mid, y: (v) => top - k * Math.abs(v - mid) };
}

// La medianera: el perfil del más alto de los dos techos en cada punto, un
// poco más arriba, con su tapa de cemento.
function firewall(g, w, brick, cap) {
  const P = w.roofs.map(profile);
  const v0 = Math.min(...P.map((p) => p.lo)) - 0.05;
  const v1 = Math.max(...P.map((p) => p.hi)) + 0.05;
  const topAt = (v) => Math.max(...P.map((p) => p.y(Math.min(p.hi, Math.max(p.lo, v))))) + FW_UP;
  // puntos del borde de arriba: cada 0.25 m más los quiebres (cumbreras y aleros)
  const vs = new Set([v0, v1, ...P.flatMap((p) => [p.lo, p.hi, p.mid])]);
  for (let v = v0; v < v1; v += 0.25) vs.add(v);
  const pts = [...vs].filter((v) => v >= v0 && v <= v1).sort((a, b) => a - b);
  const wall = new THREE.Shape();
  wall.moveTo(v0, FW_LOW);
  for (const v of pts) wall.lineTo(v, topAt(v));
  wall.lineTo(v1, FW_LOW);
  wall.closePath();
  // la tapa: una faja que sigue el borde de arriba, más ancha que la pared
  const top = new THREE.Shape();
  top.moveTo(pts[0], topAt(pts[0]) - 0.03);
  for (const v of pts) top.lineTo(v, topAt(v) + 0.07);
  for (const v of [...pts].reverse()) top.lineTo(v, topAt(v) - 0.03);
  top.closePath();
  for (const [sh, mat, t] of [[wall, brick, FW_T], [top, cap, FW_T + 0.1]]) {
    const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 1 });
    const m = new THREE.Mesh(geo, mat);
    // la forma está en (v, y) y se estira en z; a lo largo de x hay que girarla
    if (w.axis === 'x') {
      m.rotation.y = -Math.PI / 2;
      m.position.x = w.at + t / 2;
    } else m.position.z = w.at - t / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
}

// Un techo a dos aguas: los dos faldones, las cabeceras triangulares, las
// tablas de los bordes y lo que tenga encima.
function gable(g, d, mat, head, M) {
  const [x0, z0, x1, z1] = d.rect;
  const alongX = d.axis === 'x';
  const len = alongX ? x1 - x0 : z1 - z0;
  const wide = alongX ? z1 - z0 : x1 - x0;
  const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const a0 = alongX ? x0 : z0;
  const base = d.base ?? WALL;
  const rise = d.rise || 2.4;
  const over = 0.4;
  // lo que sale el techo más allá de cada cabecera (menos contra una medianera)
  const eA = d.endA ?? 0.3;
  const eB = d.endB ?? 0.3;
  const L = len + eA + eB;
  const uc = (len + eB - eA) / 2;
  const half = wide / 2;
  const k = rise / half;
  const eaveY = base - over * k;
  const top = base + rise;
  // u a lo largo de la cumbrera, v de lado a lado
  const P = (u, v, y) => (alongX ? [a0 + u, y, mid + v] : [mid + v, y, a0 + u]);
  const slope = Math.hypot(half + over, rise + over * k);
  for (const sg of [-1, 1]) {
    const pos = [...P(-eA, sg * (half + over), eaveY), ...P(len + eB, sg * (half + over), eaveY), ...P(len + eB, 0, top), ...P(-eA, 0, top)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L / 1.5, 0, L / 1.5, slope / 1.6, 0, slope / 1.6], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    // tabla del alero
    const [ex, , ez] = P(uc, sg * (half + over), 0);
    g.add(mesh(alongX ? boxGeo(L, 0.16, 0.05) : boxGeo(0.05, 0.16, L), M.woodDark, ex, eaveY - 0.06, ez));
  }
  // cumbrera
  const [rx, , rz] = P(uc, 0, 0);
  g.add(mesh(alongX ? boxGeo(L + 0.05, 0.12, 0.3) : boxGeo(0.3, 0.12, L + 0.05), M.metal, rx, top + 0.03, rz));
  // cabeceras: el triángulo entre la pared y el techo, con sus tablas
  const sh = new THREE.Shape();
  sh.moveTo(-half, 0);
  sh.lineTo(half, 0);
  sh.lineTo(0, rise);
  sh.closePath();
  const shGeo = new THREE.ShapeGeometry(sh);
  for (const u of [0, len]) {
    const [px, , pz] = P(u, 0, 0);
    const t = new THREE.Mesh(shGeo, head);
    t.position.set(px, base, pz);
    t.rotation.y = alongX ? Math.PI / 2 : 0;
    g.add(t);
    // tablas de los bordes inclinados
    for (const sg of [-1, 1]) {
      const [bx, , bz] = P(u + (u ? eB : -eA), (sg * (half + over)) / 2, 0);
      const bar = mesh(boxGeo(0.06, 0.2, slope + 0.1), M.woodDark, bx, (eaveY + top) / 2, bz);
      const tilt = Math.atan2(rise + over * k, half + over);
      if (alongX) bar.rotation.set(sg * tilt, 0, 0);
      else {
        bar.rotation.set(0, Math.PI / 2, 0);
        bar.rotateX(sg * tilt);
      }
      g.add(bar);
    }
  }
  // respiradero del barbacuá: un techito arriba de la cumbrera, con el hueco oscuro abajo
  if (d.vent) {
    const vl = len * 0.55;
    const vh = 0.55;
    const vw = 1.1;
    const [cx, , cz] = P(len / 2, 0, 0);
    g.add(mesh(alongX ? boxGeo(vl, vh, vw * 0.9) : boxGeo(vw * 0.9, vh, vl), M.black, cx, top + vh / 2, cz));
    for (const sg of [-1, 1]) {
      const [sx, , sz] = P(len / 2, (sg * vw) / 2, 0);
      const s = mesh(alongX ? boxGeo(vl + 0.3, 0.05, vw * 0.75) : boxGeo(vw * 0.75, 0.05, vl + 0.3), mat, sx, top + vh + 0.15, sz);
      if (alongX) s.rotation.set(-sg * 0.45, 0, 0);
      else s.rotation.set(0, 0, sg * 0.45);
      g.add(s);
    }
  }
  // cruz de hierro en la punta de adelante (la capilla)
  if (d.cross) {
    const [cx, , cz] = P(len, 0, 0);
    g.add(mesh(cylGeo(0.05, 0.05, 1.3, 6), M.iron, cx, top + 0.6, cz));
    g.add(mesh(alongX ? boxGeo(0.08, 0.08, 0.7) : boxGeo(0.7, 0.08, 0.08), M.iron, cx, top + 0.85, cz));
  }
}
