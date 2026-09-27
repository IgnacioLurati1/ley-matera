import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from './props';
import { flame } from './castleFire';
import { buildFountain, statueMat } from './castleStatue';
import { tombPlate } from './castleDecor';

// Más utilería del castillo del Mateendrache: la fuente congelada con la
// estatua del dragón, el hielo de la gruta (penitentes y carámbanos), las
// rocas de la cueva, las termas del Inca, el palenque (el arco de la sortija
// y la tribuna), el establo con los caballos congelados, la fragua, el
// asador a la cruz, los toneles de la bodega, las veletas, la espadaña de las
// campanas, las tumbas de la cumbre y el Cristo de los Andes a lo lejos.

const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
// ---------------- materiales propios ----------------
const cache = {};
function mat(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}
const iceMat = () => mat('ice', () => new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.08, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.35, transparent: true, opacity: 0.5, depthWrite: false }));
const iceBlue = () => mat('iceBlue', () => new THREE.MeshStandardMaterial({ color: 0x9ccfee, roughness: 0.1, metalness: 0.15, emissive: 0x0a3050, emissiveIntensity: 0.6 }));
const iceFacet = () => mat('iceFacet', () => new THREE.MeshStandardMaterial({ color: 0x92c8ea, roughness: 0.07, metalness: 0.2, emissive: 0x0a3050, emissiveIntensity: 0.55, flatShading: true }));
const iceSnowy = () => mat('iceSnowy', () => new THREE.MeshStandardMaterial({ color: 0xd6ebf8, roughness: 0.35, metalness: 0.05, emissive: 0x0c2c46, emissiveIntensity: 0.35, flatShading: true }));
// Una aguja de penitente: el sol la talla en escalones (el perfil ondula al
// subir), ancha abajo, con la punta torcida y las caras desparejas. Nace en y 0.
function spireGeo(s, h, r) {
  const n = 8;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = i === n ? 0 : Math.max(0.012, s * (1 - t) ** 0.75 * (1 + (i % 2 ? 0.16 : -0.1) * (1 - t) + (r() - 0.5) * 0.14));
    pts.push(new THREE.Vector2(w, t * h));
  }
  const geo = new THREE.LatheGeometry(pts, 6, r() * 6);
  const bx = (r() - 0.5) * 0.5 * h * 0.3;
  const bz = (r() - 0.5) * 0.5 * h * 0.3;
  const ph = r() * 20;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = y / h;
    // (función de la posición: los vértices repetidos de la costura se mueven igual)
    const j = Math.sin(x * 31 + y * 17 + ph) * Math.cos(z * 29 - y * 11) * s * 0.18 * (1 - k);
    p.setXYZ(i, x + j + bx * k * k, y, z - j * 0.7 + bz * k * k);
  }
  geo.computeVertexNormals();
  return geo;
}
const bronze = () => mat('bronze', () => new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.35, metalness: 0.9 }));
const ochre = () => mat('ochre', () => new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.95 }));
const sulfur = () => mat('sulfur', () => new THREE.MeshStandardMaterial({ color: 0x9a8446, roughness: 0.9 }));
// La costra de minerales que deja el agua caliente: ocre y óxido que se apagan
// hacia afuera (un anillo transparente en el piso).
const crust = () =>
  mat('crust', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
    g.addColorStop(0, 'rgba(150,84,36,0.9)');
    g.addColorStop(0.62, 'rgba(150,84,36,0.85)');
    g.addColorStop(0.75, 'rgba(176,120,52,0.6)');
    g.addColorStop(1, 'rgba(120,80,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    // chorreaduras
    x.strokeStyle = 'rgba(110,56,24,0.45)';
    x.lineWidth = 3;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + Math.sin(k * 7.3) * 0.2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36);
      x.lineTo(64 + Math.cos(a) * (50 + (k % 4) * 3), 64 + Math.sin(a) * (50 + (k % 4) * 3));
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  });
const hotWater = () =>
  mat('hotWater', () => new THREE.MeshStandardMaterial({ color: 0x3a8a8a, roughness: 0.15, metalness: 0.1, emissive: 0x0c3a36, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }));
const horseMat = () => mat('horse', () => new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 }));
const ribbon = (c) => mat(`ribbon${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));

export const NATURE = {
  // La fuente del patio: el Mateendrache de piedra sobre una roca, con el
  // chorro congelado (world/castleStatue.js).
  fuenteDragon(M, o) {
    return buildFountain(M, o);
  },

  // Penitentes: agujas de hielo de la alta montaña, en un manchón.
  penitentes(M, o, r) {
    const g = new THREE.Group();
    const n = o.n || 12;
    const rad = o.r || 1.6;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const h = 0.6 + r() * (o.h || 2.2);
      const s = 0.12 + r() * 0.18;
      // agujas talladas, torcidas y aplastadas como hojas, de hielo azul
      // facetado (algunas más claras, casi nieve)
      const c = mesh(spireGeo(s, h, r), k % 3 ? iceFacet() : iceSnowy(), Math.cos(a) * d, -0.04, Math.sin(a) * d, (r() - 0.5) * 0.2, r() * 3, (r() - 0.5) * 0.2);
      c.scale.set(1, 1, 0.45 + r() * 0.4);
      g.add(c);
    }
    return { obj: g, boxes: o.solid === false ? [] : [[-rad * 0.6, 0, -rad * 0.6, rad * 0.6, 1.6, rad * 0.6]] };
  },

  // Carámbanos colgando del techo (top: la altura del techo sobre el piso).
  carambanos(M, o, r) {
    const g = new THREE.Group();
    const n = o.n || 10;
    const top = o.top || 4;
    for (let k = 0; k < n; k++) {
      const x = (r() - 0.5) * (o.w || 3);
      const z = (r() - 0.5) * (o.d || 3);
      const h = 0.4 + r() * 1.3;
      g.add(mesh(new THREE.ConeGeometry(0.06 + r() * 0.1, h, 5), iceMat(), x, top - h / 2, z, Math.PI, r() * 3, 0));
    }
    return { obj: g, boxes: [] };
  },

  // Rocas de la cueva: estalagmitas y peñascos.
  rocaCueva(M, o, r) {
    const g = new THREE.Group();
    const rock = M.caveRock || M.rock || M.stone;
    const n = o.n || 5;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * (o.r || 1.5);
      if (r() < 0.55) {
        const h = 1 + r() * (o.h || 4);
        g.add(mesh(new THREE.ConeGeometry(0.25 + r() * 0.4, h, 6), rock, Math.cos(a) * d, h / 2, Math.sin(a) * d, (r() - 0.5) * 0.15, r() * 3, (r() - 0.5) * 0.15));
      } else {
        const s = 0.5 + r() * 1.1;
        const b = mesh(new THREE.DodecahedronGeometry(s, 0), rock, Math.cos(a) * d, s * 0.5, Math.sin(a) * d, r(), r(), r());
        b.scale.set(1, 0.7, 1.1);
        g.add(b);
      }
    }
    const R = (o.r || 1.5) * 0.7;
    return { obj: g, boxes: [[-R, 0, -R, R, 2, R]] };
  },

  // Una poza de las termas del Inca: agua caliente verdosa en un anillo de
  // piedras teñidas de ocre y azufre (como el Puente del Inca). El vapor lo
  // echa buildCastle (las pozas se anotan en w.castleSteam).
  terma(M, o, r) {
    const g = new THREE.Group();
    const R = o.r || 1.8;
    const water = mesh(new THREE.CircleGeometry(R, 24), hotWater(), 0, 0.12, 0, -Math.PI / 2, 0, 0);
    g.add(water);
    const ring = mesh(new THREE.CircleGeometry(R + 1.1, 28), crust(), 0, 0.02, 0, -Math.PI / 2, 0, r() * 3);
    ring.receiveShadow = true;
    g.add(ring);
    const n = Math.round(R * 8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.2;
      const s = 0.24 + r() * 0.3;
      const t = r();
      const m = t < 0.2 ? ochre() : t < 0.28 ? sulfur() : k % 2 ? M.castleStoneDark || M.stone : M.rock || M.stone;
      const d = R + 0.05 + r() * 0.25;
      const rock = mesh(new THREE.DodecahedronGeometry(s, 0), m, Math.cos(a) * d, s * 0.3, Math.sin(a) * d, r() * 3, r() * 3, r() * 3);
      rock.scale.set(1, 0.55 + r() * 0.2, 1);
      g.add(rock);
    }
    g.userData.steam = { r: R };
    return { obj: g, boxes: [[-R * 0.6, 0, -R * 0.6, R * 0.6, 0.3, R * 0.6]] };
  },

  // El arco de la sortija: dos postes, el travesaño con cintas celestes y
  // blancas y la sortija colgando de un hilo en el medio.
  sortija(M, o) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    for (const s of [-1, 1]) {
      C(g, 0.1, 0.12, 3.4, wood, s * 2.2, 1.7, 0, 0, 0, 0, 8);
      for (let k = 0; k < 3; k++) g.add(mesh(new THREE.PlaneGeometry(0.1, 0.6), ribbon(k % 2 ? 0xf0f0f0 : 0x7ab8e8), s * 2.2 + (k - 1) * 0.07, 3.0, 0.1, 0, 0, (k - 1) * 0.15));
    }
    C(g, 0.07, 0.07, 4.6, wood, 0, 3.3, 0, 0, 0, Math.PI / 2, 8);
    for (let k = -4; k <= 4; k++) g.add(mesh(new THREE.PlaneGeometry(0.08, 0.45), ribbon(k % 2 ? 0xf0f0f0 : 0x7ab8e8), k * 0.45, 3.05, 0.02));
    // (live: la sortija la cuelga y la hamaca el juego, entities/castle/Sortija.js)
    if (!o.live) {
      C(g, 0.004, 0.004, 0.5, M.rope || wood, 0, 3.02, 0, 0, 0, 0, 4);
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14), bronze(), 0, 2.72, 0));
    }
    return { obj: g, boxes: [[-2.35, 0, -0.15, -2.05, 3.4, 0.15], [2.05, 0, -0.15, 2.35, 3.4, 0.15]] };
  },

  // La tribuna del palenque: tres gradas de tablones con techito de paja.
  tribuna(M, o) {
    const g = new THREE.Group();
    const L = o.len || 5;
    const wood = M.woodDark || M.wood;
    for (let k = 0; k < 3; k++) {
      B(g, L, 0.08, 0.5, M.wood || wood, 0, 0.45 + k * 0.45, -k * 0.55);
      B(g, L, 0.45 + k * 0.45, 0.06, wood, 0, (0.45 + k * 0.45) / 2, -k * 0.55 + 0.22);
    }
    for (const sx of [-1, 1]) {
      C(g, 0.06, 0.07, 3, wood, sx * (L / 2 - 0.1), 1.5, -1.3, 0, 0, 0, 6);
      C(g, 0.06, 0.07, 2.4, wood, sx * (L / 2 - 0.1), 1.2, 0.3, 0, 0, 0, 6);
    }
    const roof = B(g, L + 0.4, 0.12, 2.2, M.hay || M.sack || wood, 0, 2.75, -0.5, 0.18, 0, 0);
    roof.castShadow = true;
    B(g, L + 0.3, 0.05, 2.1, M.snowCap || wood, 0, 2.84, -0.5, 0.18, 0, 0);
    return { obj: g, boxes: [[-L / 2, 0, -1.6, L / 2, 1.6, 0.3]] };
  },

  // Los boxes del establo: tres divisiones de madera, pasto, el recado en su
  // caballete y un caballo congelado adentro de un bloque de hielo.
  establo(M, o, r) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    const n = o.n || 3;
    const w = 2.4;
    for (let k = 0; k <= n; k++) {
      const x = -((n * w) / 2) + k * w;
      B(g, 0.12, 1.5, 2.6, wood, x, 0.75, 1.3);
      C(g, 0.08, 0.08, 1.9, wood, x, 0.95, 2.7, 0, 0, 0, 6);
    }
    for (let k = 0; k < n; k++) {
      const x = -((n * w) / 2) + (k + 0.5) * w;
      // pasto en el piso y un bebedero
      const hay = mesh(new THREE.SphereGeometry(0.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.hay || M.sack, x + (r() - 0.5) * 0.6, 0, 0.6, 0, r() * 3, 0);
      hay.scale.set(1.2, 0.4, 0.9);
      g.add(hay);
      B(g, 1, 0.4, 0.4, wood, x + 0.5, 0.2, 0.3);
      if (k === 1) {
        // el caballo congelado (parado, con la cabeza gacha)
        const horse = horseFigure(horseMat());
        horse.position.set(x, 0, 1.4);
        horse.rotation.y = Math.PI / 2 + 0.2;
        g.add(horse);
        const block = mesh(new THREE.BoxGeometry(2.4, 2.1, 1.3), iceMat(), x, 1.05, 1.4, 0, 0.2, 0);
        g.add(block);
      }
    }
    // el recado (montura gaucha) en su caballete
    const rack = new THREE.Group();
    rack.position.set((n * w) / 2 - 0.9, 0, 3.3);
    B(rack, 0.1, 0.9, 0.1, wood, -0.4, 0.45, 0);
    B(rack, 0.1, 0.9, 0.1, wood, 0.4, 0.45, 0);
    B(rack, 0.95, 0.12, 0.12, wood, 0, 0.92, 0);
    const pad = mesh(new THREE.BoxGeometry(0.7, 0.14, 0.8), M.leather || wood, 0, 1.02, 0);
    rack.add(pad);
    const fleece = mesh(new THREE.BoxGeometry(0.66, 0.12, 0.7), mat('pelego', () => new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 1 })), 0, 1.14, 0);
    rack.add(fleece);
    for (const s of [-1, 1]) rack.add(mesh(new THREE.TorusGeometry(0.08, 0.015, 5, 10), M.iron, s * 0.42, 0.72, 0));
    g.add(rack);
    return { obj: g, boxes: [[-(n * w) / 2 - 0.1, 0, 0, (n * w) / 2 + 0.1, 1.5, 2.8]] };
  },

  // La fragua: el yunque sobre su tronco y el fuelle de cuero.
  yunque(M) {
    const g = new THREE.Group();
    C(g, 0.3, 0.34, 0.6, M.log || M.wood, 0, 0.3, 0, 0, 0, 0, 10);
    B(g, 0.55, 0.22, 0.24, M.iron, 0, 0.72, 0);
    B(g, 0.3, 0.12, 0.18, M.iron, 0, 0.56, 0);
    const horn = mesh(new THREE.ConeGeometry(0.1, 0.4, 8), M.iron, 0.46, 0.75, 0, 0, 0, Math.PI / 2);
    g.add(horn);
    // el martillo y unas tenazas apoyadas
    C(g, 0.02, 0.02, 0.45, M.woodDark || M.wood, -0.1, 0.9, 0.06, 0, 0, 1.3, 5);
    B(g, 0.12, 0.07, 0.07, M.iron, -0.3, 0.86, 0.06);
    return { obj: g, boxes: [[-0.35, 0, -0.35, 0.6, 0.85, 0.35]] };
  },

  fuelle(M) {
    const g = new THREE.Group();
    const wood = M.woodDark || M.wood;
    B(g, 0.5, 0.06, 1.1, wood, 0, 0.55, 0, 0.12, 0, 0);
    B(g, 0.5, 0.06, 1.1, wood, 0, 0.8, 0, -0.12, 0, 0);
    const bag = mesh(new THREE.SphereGeometry(0.4, 10, 6), M.leather || wood, 0, 0.67, 0.05);
    bag.scale.set(0.62, 0.3, 1.2);
    g.add(bag);
    C(g, 0.04, 0.06, 0.4, M.iron, 0, 0.67, -0.7, Math.PI / 2, 0, 0, 8);
    C(g, 0.03, 0.03, 0.5, wood, 0, 0.95, 0.75, 0.4, 0, 0, 6);
    for (const s of [-1, 1]) B(g, 0.06, 0.55, 0.06, wood, s * 0.2, 0.27, 0.3);
    return { obj: g, boxes: [[-0.3, 0, -0.9, 0.3, 1, 0.6]] };
  },

  // El asador a la cruz: el cordero abierto en la cruz de hierro clavada al
  // lado del fuego del piso (el fuego es una llama y unas brasas).
  asador(M) {
    const g = new THREE.Group();
    const meat = mat('meat', () => new THREE.MeshStandardMaterial({ color: 0x8a3e1c, roughness: 0.5, emissive: 0x220802, emissiveIntensity: 0.4 }));
    // la cruz, inclinada hacia el fuego
    const cross = new THREE.Group();
    cross.position.set(0, 0, -0.9);
    cross.rotation.x = 0.35;
    cross.add(mesh(cylGeo(0.03, 0.03, 2.4, 6), M.iron, 0, 1.2, 0));
    cross.add(mesh(cylGeo(0.025, 0.025, 1.2, 6), M.iron, 0, 1.55, 0, 0, 0, Math.PI / 2));
    cross.add(mesh(cylGeo(0.025, 0.025, 1.0, 6), M.iron, 0, 0.85, 0, 0, 0, Math.PI / 2));
    // el cordero abierto (el pecho y las cuatro patas estiradas)
    const lamb = mesh(new THREE.BoxGeometry(0.7, 1.1, 0.12), meat, 0, 1.2, 0.08);
    cross.add(lamb);
    for (const [x, y, a] of [[-0.45, 1.6, 0.5], [0.45, 1.6, -0.5], [-0.4, 0.8, -0.4], [0.4, 0.8, 0.4]]) cross.add(mesh(new THREE.CapsuleGeometry(0.06, 0.35, 3, 6), meat, x, y, 0.08, 0, 0, a + Math.PI / 2));
    g.add(cross);
    // el fuego en el piso
    for (let k = 0; k < 6; k++) C(g, 0.06, 0.07, 0.8, M.log || M.wood, 0, 0.1, 0.3, Math.PI / 2, (k / 6) * Math.PI, 0, 6);
    flame(g, 0, 0.08, 0.3, 0.8, 1.0);
    return { obj: g, boxes: [[-0.5, 0, -1.2, 0.5, 2.2, 0.8]] };
  },

  // Tonel grande de la bodega, acostado en su cuna, con la canilla.
  tonel(M, o) {
    const g = new THREE.Group();
    const R = o.r || 0.8;
    const L = o.len || 1.6;
    const wood = M.wood || M.woodDark;
    const cask = mesh(new THREE.CylinderGeometry(R, R, L, 18), wood, 0, R + 0.25, 0, 0, 0, Math.PI / 2);
    g.add(cask);
    for (const x of [-L / 2 + 0.12, -L / 5, L / 5, L / 2 - 0.12]) g.add(mesh(new THREE.TorusGeometry(R + 0.01, 0.025, 5, 22), M.iron, x, R + 0.25, 0, 0, Math.PI / 2, 0));
    for (const s of [-1, 1]) B(g, 0.2, 0.3, R * 1.8, M.woodDark || wood, s * (L / 2 - 0.25), 0.15, 0);
    C(g, 0.03, 0.03, 0.2, M.brass || M.iron, L / 2 + 0.1, R * 0.6, 0, 0, 0, Math.PI / 2, 6);
    const lid = mesh(new THREE.CircleGeometry(R * 0.96, 18), M.woodDark || wood, L / 2 + 0.005, R + 0.25, 0, 0, Math.PI / 2, 0);
    g.add(lid);
    return { obj: g, boxes: [[-L / 2, 0, -R, L / 2, R * 2 + 0.25, R]] };
  },

  // Veleta: un mástil con la flecha, las letras de los cuatro vientos y un
  // cóndor recortado en chapa. Gira toda junta (userData.dynamic: 'veleta').
  veleta(M, o) {
    const g = new THREE.Group();
    const h = o.h || 3;
    C(g, 0.04, 0.05, h, M.iron, 0, h / 2, 0, 0, 0, 0, 6);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      B(g, 0.02, 0.02, 0.45, M.iron, dx * 0.22, h - 0.4, dz * 0.22, 0, Math.atan2(dx, dz), 0);
      B(g, 0.08, 0.1, 0.02, M.iron, dx * 0.48, h - 0.4, dz * 0.48, 0, Math.atan2(dx, dz), 0);
    }
    const vane = new THREE.Group();
    vane.name = 'veleta';
    vane.userData.dynamic = true;
    vane.position.set(0, h + 0.05, 0);
    B(vane, 0.02, 0.02, 1.2, M.iron, 0, 0, 0);
    vane.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 4), M.iron, 0, 0, 0.66, Math.PI / 2, 0, 0));
    // el cóndor: alas abiertas en chapa negra
    const condor = new THREE.Shape();
    condor.moveTo(0, 0);
    condor.lineTo(-0.5, 0.08);
    condor.lineTo(-0.36, 0.14);
    condor.lineTo(-0.1, 0.1);
    condor.lineTo(0, 0.2);
    condor.lineTo(0.1, 0.1);
    condor.lineTo(0.36, 0.14);
    condor.lineTo(0.5, 0.08);
    condor.closePath();
    const cm = mesh(new THREE.ShapeGeometry(condor), mat('chapa', () => new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })), 0, 0.05, -0.4, 0, Math.PI / 2, 0);
    vane.add(cm);
    g.add(vane);
    return { obj: g, boxes: [] };
  },

  // La espadaña del campanario: un muro de piedra con tres arcos y una
  // campana de bronce en cada uno (la grande en el medio).
  espadana(M) {
    const g = new THREE.Group();
    const st = M.castleStone || M.stone;
    B(g, 5.4, 1.2, 0.8, st, 0, 0.6, 0);
    for (const x of [-2.4, -0.8, 0.8, 2.4]) B(g, 0.6, 3.2, 0.8, st, x, 2.8, 0);
    B(g, 5.4, 0.7, 0.8, st, 0, 4.75, 0);
    const top = mesh(new THREE.ConeGeometry(0.9, 1.2, 4), st, 0, 5.7, 0, 0, Math.PI / 4, 0);
    top.scale.set(1, 1, 0.5);
    g.add(top);
    B(g, 5.5, 0.08, 0.9, M.snowCap || st, 0, 5.12, 0);
    const bells = [];
    for (const [x, s] of [[-1.6, 0.75], [0, 1.0], [1.6, 0.85]]) {
      const bell = new THREE.Group();
      bell.position.set(x, 4.3, 0);
      bell.add(mesh(new THREE.LatheGeometry([[0.02, 0], [0.18, -0.02], [0.28, -0.3], [0.36, -0.62], [0.45, -0.72], [0.44, -0.76], [0.02, -0.7]].map(([r, y]) => new THREE.Vector2(r * s, y * s)), 16), bronze()));
      bell.add(mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), M.iron, 0, -0.66 * s, 0));
      C(bell, 0.02, 0.02, 0.9, M.woodDark || M.wood, 0, 0.05, 0, 0, 0, Math.PI / 2, 6);
      bell.name = 'campana';
      bell.userData.dynamic = true;
      g.add(bell);
      bells.push(bell);
    }
    // la base, los pilares y el arco de arriba: los huecos de las campanas
    // quedan libres para que los tiros lleguen
    const boxes = [[-2.7, 0, -0.4, 2.7, 1.2, 0.4], [-2.7, 4.4, -0.4, 2.7, 5.2, 0.4]];
    for (const x of [-2.4, -0.8, 0.8, 2.4]) boxes.push([x - 0.3, 1.2, -0.4, x + 0.3, 4.4, 0.4]);
    return { obj: g, boxes };
  },

  // Tumbas de los caballeros en la cumbre: lajas con una espada clavada en la
  // nieve y el poncho de cada uno atado a la empuñadura.
  tumbaCaballero(M, o, r) {
    const g = new THREE.Group();
    const st = statueMat(M);
    const dark = M.castleStoneDark || M.stone;
    // el sarcófago: la caja y la tapa con el borde biselado
    B(g, 1.1, 0.55, 2.2, dark, 0, 0.27, 0);
    B(g, 1.22, 0.12, 2.32, st, 0, 0.6, 0);
    // el caballero acostado arriba de la tapa, las manos juntas sobre la espada
    const knight = new THREE.Group();
    knight.position.y = 0.66;
    const head = mesh(new THREE.SphereGeometry(0.15, 12, 10), st, 0, 0.12, -0.75);
    head.scale.set(1, 0.85, 1.05);
    knight.add(head);
    const hat = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), st, 0, 0.1, -0.93, Math.PI / 2 - 0.2, 0, 0);
    knight.add(hat);
    const body = mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 10), st, 0, 0.13, -0.05, Math.PI / 2, 0, 0);
    body.scale.set(1.15, 1, 0.7);
    knight.add(body);
    for (const s of [-1, 1]) {
      const leg = mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 8), st, s * 0.1, 0.11, 0.68, Math.PI / 2, 0, 0);
      knight.add(leg);
      knight.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.12), st, s * 0.1, 0.16, 1.02));
      const arm = mesh(new THREE.CapsuleGeometry(0.055, 0.42, 3, 8), st, s * 0.12, 0.26, -0.2, Math.PI / 2 - 0.35, 0, s * 0.5);
      knight.add(arm);
    }
    // la espada de piedra sobre el pecho
    knight.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.95), st, 0, 0.33, 0.12));
    knight.add(mesh(new THREE.BoxGeometry(0.28, 0.04, 0.05), st, 0, 0.33, -0.33));
    g.add(knight);
    // la lápida en arco, con el símbolo y el nombre
    const arch = new THREE.Shape();
    arch.moveTo(-0.5, 0);
    arch.lineTo(0.5, 0);
    arch.lineTo(0.5, 1.05);
    arch.absarc(0, 1.05, 0.5, 0, Math.PI, false);
    arch.closePath();
    const stele = mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }), st, 0, 0, -1.42);
    g.add(stele);
    g.add(mesh(new THREE.PlaneGeometry(0.9, 0.9), tombPlate(o.kind), 0, 0.98, -1.2));
    // la espada de acero clavada en la nieve, al pie, con la cinta del caballero
    const sword = new THREE.Group();
    sword.position.set(0, 0, 1.5);
    sword.rotation.set(-0.12 + (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.18);
    const steel = mat('acero', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 1 }));
    sword.add(mesh(new THREE.BoxGeometry(0.08, 1.2, 0.016), steel, 0, 0.45, 0));
    sword.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.06), bronze(), 0, 1.07, 0));
    sword.add(mesh(cylGeo(0.024, 0.024, 0.26, 6), M.leather || M.wood, 0, 1.23, 0));
    sword.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), bronze(), 0, 1.38, 0));
    const colors = { fuego: 0x8e1d16, viento: 0x1d5a34, rayo: 0x8a6a10, hielo: 0x183e74 };
    sword.add(mesh(new THREE.PlaneGeometry(0.13, 0.62), ribbon(colors[o.kind] || 0x6a1a14), 0.06, 0.9, 0.03, 0, 0, 0.28));
    // la nieve amontonada donde entra la hoja
    sword.add(mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.snowCap || st, 0, -0.05, 0));
    g.add(sword);
    // dos velas en el pie del sarcófago
    for (const s of [-1, 1]) {
      C(g, 0.03, 0.035, 0.22, mat('cera', () => new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.4 })), s * 0.42, 0.11, 1.26, 0, 0, 0, 8);
      const f = mesh(new THREE.SphereGeometry(0.022, 6, 5), mat('llamita', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2.2), toneMapped: false })), s * 0.42, 0.26, 1.26);
      f.scale.set(1, 1.8, 1);
      g.add(f);
    }
    return { obj: g, boxes: [[-0.62, 0, -1.45, 0.62, 0.72, 1.18]] };
  },

  // El Cristo de los Andes, chiquito, sobre un pico lejano (se ve de noche,
  // recortado contra el cielo). Va con y propia.
  cristo(M) {
    const g = new THREE.Group();
    const st = mat('bronceOscuro', () => new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7, metalness: 0.4 }));
    B(g, 2.4, 3, 2.4, M.castleStone || M.stone, 0, 1.5, 0);
    B(g, 1.6, 2.2, 1.6, M.castleStone || M.stone, 0, 4.1, 0);
    C(g, 0.45, 0.8, 4.2, st, 0, 7.3, 0, 0, 0, 0, 10);
    g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), st, 0, 9.8, 0));
    C(g, 0.16, 0.2, 2.4, st, 0.9, 8.9, 0, 0, 0, 1.2, 6);
    C(g, 0.16, 0.2, 2.0, st, -0.9, 8.6, 0, 0, 0, -0.9, 6);
    // la cruz que sostiene
    B(g, 0.22, 4.4, 0.22, st, -1.3, 8.4, 0.3);
    B(g, 1.6, 0.22, 0.22, st, -1.3, 9.6, 0.3);
    return { obj: g, boxes: [] };
  },
};

// Un caballo parado, de piezas simples (cuerpo, patas, cuello y cabeza gacha).
function horseFigure(m) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.34, 1.0, 4, 10), m, 0, 1.25, 0, 0, 0, Math.PI / 2);
  g.add(body);
  for (const [x, z] of [[-0.5, -0.2], [-0.5, 0.2], [0.55, -0.2], [0.55, 0.2]]) g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.85, 3, 6), m, x, 0.52, z));
  const neck = mesh(new THREE.CapsuleGeometry(0.16, 0.6, 3, 8), m, 0.85, 1.45, 0, 0, 0, -0.9);
  g.add(neck);
  const head = mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), m, 1.2, 1.18, 0, 0, 0, -1.1);
  g.add(head);
  const mane = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), mat('crin', () => new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 })), 0.8, 1.62, 0, 0, 0, -0.9);
  g.add(mane);
  const tail = mesh(new THREE.ConeGeometry(0.08, 0.7, 5), mat('crin', () => new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 })), -0.95, 1.05, 0, 0, 0, -0.5);
  g.add(tail);
  return g;
}
