import * as THREE from 'three';
import { mesh, boxGeo, rboxGeo, cylGeo, addBuilders } from './props';

// Utilería del penal de la Isla del Ceibo. Mismo formato que world/props.js:
// cada constructor devuelve { obj, boxes } con cajas locales (antes de rotar).
// Lo que va contra una pared mira hacia +z (la pared queda en z = 0 o detrás).

const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const R = (g, w, h, d, mat, x, y, z, r, ry = 0) => {
  const m = mesh(rboxGeo(w, h, d, r), mat, x, y, z, 0, ry, 0);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

// Texturas chicas pintadas a mano (carteles, el retrato, la bandera).
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
const matCache = new Map();
// materiales y geometrías que comparten varias piezas (así se funden juntas)
const shared = new Map();
const keep = (key, make) => {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
};
function texMat(key, w, h, draw, o = {}) {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: canvasTex(key, w, h, draw), roughness: 0.85, ...o });
    matCache.set(key, m);
  }
  return m;
}

// Reja: barrotes verticales cada `gap` metros entre x0 y x1, con planchuelas.
function bars(g, M, x0, x1, z, h, gap = 0.14, y0 = 0) {
  const mat = M.bars || M.iron;
  const n = Math.max(1, Math.round((x1 - x0) / gap));
  for (let k = 0; k <= n; k++) C(g, 0.018, 0.018, h, mat, x0 + ((x1 - x0) * k) / n, y0 + h / 2, z, 0, 0, 0, 5);
  for (const y of [0.12, h * 0.48, h - 0.08]) B(g, x1 - x0 + 0.04, 0.05, 0.04, mat, (x0 + x1) / 2, y0 + y, z);
}

// Catre de hierro con colchón de chala (una cucheta si `bunk`).
function cot(g, M, x, z, rot = 0, bunk = false) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  const levels = bunk ? [0.42, 1.45] : [0.42];
  for (const y of levels) {
    B(c, 0.8, 0.05, 1.9, M.iron, 0, y, 0);
    R(c, 0.74, 0.1, 1.82, M.sack, 0, y + 0.08, 0, 0.04);
    R(c, 0.76, 0.04, 0.9, M.woodDark, 0, y + 0.15, 0.4, 0.02);
  }
  const top = levels[levels.length - 1] + 0.3;
  for (const [a, b] of [[-0.38, -0.93], [0.38, -0.93], [-0.38, 0.93], [0.38, 0.93]]) C(c, 0.02, 0.02, top, M.iron, a, top / 2, b, 0, 0, 0, 5);
  g.add(c);
}

function bucket(g, M, x, y, z) {
  C(g, 0.15, 0.12, 0.28, M.metal, x, y + 0.14, z, 0, 0, 0, 12);
  g.add(mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 12, Math.PI), M.iron, x, y + 0.28, z));
}

// Haz de luz: un cono abierto que sale del origen hacia -z. Brilla más en el
// centro que en los bordes (según hacia dónde se lo mira) y se apaga a lo largo.
const beamMats = new Map();
function beam(len, width, opacity) {
  let mat = beamMats.get(opacity);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff0c8) }, uOpacity: { value: opacity } },
      // Sin normalizar en el vértice ni pow de valores interpolados: cuando el haz
      // pasa por la cámara (o en su borde) la interpolación da vectores casi nulos o
      // v apenas negativo, y en algunas placas eso es NaN. Un solo píxel NaN el
      // bloom lo desparrama por toda la pantalla (pantalla negra).
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){ vec3 n = vN / max(length(vN), 1e-4); vec3 v = -vP / max(length(vP), 1e-4);
          float d = min(abs(dot(n, v)), 1.0); float edge = d * d;
          float along = pow(clamp(vUv.y, 1e-4, 1.0), 1.8);
          gl_FragColor = vec4(uColor * uOpacity * edge * along, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    beamMats.set(opacity, mat);
  }
  const geo = new THREE.ConeGeometry(width, len, 20, 1, true).translate(0, -len / 2, 0).rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  return m;
}

const BUILDERS = {
  // Fila de celdas contra la pared: rejas al frente, cuchetas y un balde en cada una.
  celdas(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 8;
    const n = o.n || 3;
    const H = 2.7;
    const front = 1.3;
    const back = -1.6;
    const w = L / n;
    const wall = M.cellWall || M.plasterWhite;
    for (let k = 0; k <= n; k++) B(g, 0.14, H, front - back, wall, -L / 2 + k * w, H / 2, (front + back) / 2);
    B(g, L + 0.14, 0.14, front - back + 0.1, wall, 0, H + 0.07, (front + back) / 2);
    for (let k = 0; k < n; k++) {
      const cx = -L / 2 + (k + 0.5) * w;
      bars(g, M, cx - w / 2 + 0.08, cx + w / 2 - 0.08, front, H - 0.05);
      // la puerta: un marco más grueso y el candado
      B(g, 0.05, H - 0.1, 0.07, M.iron, cx + 0.45, H / 2, front + 0.02);
      B(g, 0.12, 0.16, 0.06, M.brass, cx + 0.38, 1.1, front + 0.05);
      cot(g, M, cx - w / 2 + 0.55, -0.2, 0, true);
      bucket(g, M, cx + w / 2 - 0.35, 0, back + 0.35);
      if (r() < 0.5) R(g, 0.5, 0.06, 0.4, M.redCloth || M.leather, cx + 0.3, 0.03, -0.5, 0.02, r());
    }
    return { obj: g, boxes: [[-L / 2 - 0.07, 0, front - 0.1, L / 2 + 0.07, H + 0.1, front + 0.1], [-L / 2 - 0.07, 0, back, L / 2 + 0.07, H + 0.1, front - 0.1]] };
  },
  // Celdas de mentira pintadas sobre un paredón: fondo oscuro, rejas y pilastras.
  celdasFalsas(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 10;
    const n = o.n || 4;
    const H = o.h || 3.6;
    const w = L / n;
    const dark = M.black;
    const wall = M.cellWall || M.plasterWhite;
    for (let k = 0; k < n; k++) {
      const cx = -L / 2 + (k + 0.5) * w;
      B(g, w - 0.34, H - 0.5, 0.02, dark, cx, (H - 0.5) / 2 + 0.05, 0.012);
      // la cucheta de adentro, apenas se ve
      B(g, w * 0.5, 0.08, 0.03, M.woodDark, cx - w * 0.12, 0.6, 0.03);
      B(g, w * 0.5, 0.08, 0.03, M.woodDark, cx - w * 0.12, 1.6, 0.03);
      bars(g, M, cx - w / 2 + 0.2, cx + w / 2 - 0.2, 0.1, H - 0.5, 0.15, 0.05);
      if (r() < 0.3) B(g, 0.25, 0.3, 0.02, M.paper, cx + w * 0.2, 1.4 + r() * 0.5, 0.035, 0, 0, (r() - 0.5) * 0.3);
    }
    for (let k = 0; k <= n; k++) B(g, 0.3, H, 0.18, wall, -L / 2 + k * w, H / 2, 0.09);
    B(g, L + 0.3, 0.3, 0.2, wall, 0, H - 0.3, 0.1);
    return { obj: g, boxes: [[-L / 2, 0, 0, L / 2, H, 0.18]] };
  },
  // El escritorio del guardia: libro de entradas, farol y llavero.
  mesaGuardia(M) {
    const g = new THREE.Group();
    B(g, 1.4, 0.06, 0.7, M.woodDark, 0, 0.78, 0);
    for (const [a, b] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) B(g, 0.06, 0.78, 0.06, M.woodDark, a, 0.39, b);
    B(g, 0.45, 0.04, 0.32, M.leather, -0.2, 0.83, 0, 0, 0.15, 0);
    B(g, 0.42, 0.005, 0.3, M.paper, -0.2, 0.855, 0, 0, 0.15, 0);
    C(g, 0.07, 0.09, 0.2, M.glassLamp, 0.45, 0.91, -0.15, 0, 0, 0, 8);
    C(g, 0.02, 0.09, 0.06, M.iron, 0.45, 1.04, -0.15, 0, 0, 0, 8);
    g.add(mesh(new THREE.TorusGeometry(0.08, 0.01, 5, 14), M.brass, 0.25, 0.815, 0.2, Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) B(g, 0.015, 0.08, 0.005, M.brass, 0.25 + Math.cos(i) * 0.08, 0.815, 0.2 + Math.sin(i) * 0.08, Math.PI / 2, 0, i);
    const ch = new THREE.Group();
    ch.position.set(0.1, 0, -0.7);
    B(ch, 0.45, 0.05, 0.45, M.woodDark, 0, 0.46, 0);
    B(ch, 0.45, 0.5, 0.05, M.woodDark, 0, 0.72, -0.2);
    for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) B(ch, 0.04, 0.46, 0.04, M.woodDark, a, 0.23, b);
    g.add(ch);
    return { obj: g, boxes: [[-0.72, 0, -0.36, 0.72, 0.9, 0.36]] };
  },
  // Cartel de chapa atornillado a la pared.
  cartel(M, o) {
    const g = new THREE.Group();
    const text = o.text || 'SILENCIO';
    const mat = texMat(`cartel-${text}`, 256, 96, (ctx, w, h) => {
      ctx.fillStyle = '#e8e0c8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#5a1a14';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#5a1a14';
      // (la letra se achica hasta que entra: "PABELLÓN B" se cortaba en los bordes)
      let size = 48;
      do ctx.font = `bold ${size}px Georgia, serif`;
      while (ctx.measureText(text).width > w - 34 && (size -= 2) > 20);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
      ctx.fillStyle = 'rgba(90,60,30,0.35)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 14, 3 + Math.random() * 8);
    });
    B(g, 1.2, 0.45, 0.02, mat, 0, 2.5, 0.02);
    return { obj: g, boxes: [] };
  },
  colchon(M) {
    const g = new THREE.Group();
    R(g, 0.9, 0.12, 1.9, M.sack, 0, 0.06, 0, 0.05);
    R(g, 0.8, 0.04, 0.9, M.redCloth || M.leather, 0.05, 0.13, 0.3, 0.02, 0.1);
    return { obj: g, boxes: [] };
  },
  balde(M) {
    const g = new THREE.Group();
    bucket(g, M, 0, 0, 0);
    return { obj: g, boxes: [[-0.16, 0, -0.16, 0.16, 0.3, 0.16]] };
  },
  // Mesa larga del comedor con dos bancos, platos de lata y jarros.
  mesaLarga(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 4.5;
    B(g, L, 0.07, 0.9, M.wood, 0, 0.76, 0);
    for (const x of [-L / 2 + 0.25, 0, L / 2 - 0.25]) B(g, 0.08, 0.76, 0.7, M.woodDark, x, 0.38, 0);
    for (const s of [-1, 1]) {
      B(g, L, 0.06, 0.32, M.wood, 0, 0.45, s * 0.72);
      for (const x of [-L / 2 + 0.3, L / 2 - 0.3]) B(g, 0.06, 0.45, 0.28, M.woodDark, x, 0.22, s * 0.72);
    }
    for (let x = -L / 2 + 0.5; x < L / 2 - 0.3; x += 0.75) {
      for (const s of [-1, 1]) {
        if (r() < 0.25) continue;
        C(g, 0.13, 0.11, 0.025, M.metal, x + (r() - 0.5) * 0.1, 0.81, s * 0.25, 0, 0, 0, 14);
        if (r() < 0.6) C(g, 0.04, 0.035, 0.1, M.metal, x + 0.2, 0.85, s * 0.3, 0, 0, 0, 8);
      }
    }
    return { obj: g, boxes: [[-L / 2, 0, -0.9, L / 2, 0.82, 0.9]] };
  },
  // Mostrador de la cocina del comedor.
  mostrador(M, o) {
    const g = new THREE.Group();
    const L = o.len || 5;
    B(g, L, 0.9, 0.7, M.whitewash || M.plasterWhite, 0, 0.45, 0);
    B(g, L + 0.1, 0.06, 0.8, M.woodDark, 0, 0.93, 0);
    return { obj: g, boxes: [[-L / 2, 0, -0.4, L / 2, 0.96, 0.4]] };
  },
  // Olla grande de guiso con cucharón (va arriba del mostrador).
  olla(M) {
    const g = new THREE.Group();
    C(g, 0.32, 0.28, 0.42, M.iron, 0, 1.17, 0, 0, 0, 0, 16);
    C(g, 0.3, 0.3, 0.02, M.dirtDark, 0, 1.36, 0, 0, 0, 0, 16);
    C(g, 0.015, 0.015, 0.7, M.metal, 0.1, 1.5, 0.05, 0.3, 0, 0.4, 6);
    return { obj: g, boxes: [] };
  },
  bandejas(M) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) B(g, 0.45, 0.02, 0.32, M.metal, 0, 0.98 + i * 0.022, 0, 0, (i % 3) * 0.04, 0);
    return { obj: g, boxes: [] };
  },
  // Cocina económica de ladrillo con horno, chapa y chimenea.
  fogonPenal(M) {
    const g = new THREE.Group();
    B(g, 2.4, 0.9, 1.0, M.brick || M.stone, 0, 0.45, 0);
    B(g, 2.5, 0.06, 1.1, M.iron, 0, 0.93, 0);
    B(g, 0.7, 0.45, 0.02, M.iron, -0.55, 0.45, 0.51);
    B(g, 0.5, 0.25, 0.02, M.fireGlow, -0.55, 0.42, 0.52);
    B(g, 0.6, 0.4, 0.02, M.iron, 0.6, 0.45, 0.51);
    C(g, 0.18, 0.18, 3.2, M.brick || M.stone, 0.9, 2.5, -0.3, 0, 0, 0, 10);
    C(g, 0.3, 0.25, 0.35, M.iron, -0.4, 1.12, 0.05, 0, 0, 0, 14);
    C(g, 0.22, 0.22, 0.25, M.copper, 0.35, 1.08, 0.1, 0, 0, 0, 14);
    return { obj: g, boxes: [[-1.25, 0, -0.55, 1.25, 1, 0.55]] };
  },
  caldero(M) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), M.iron);
    pot.position.y = 0.72;
    pot.castShadow = true;
    g.add(pot);
    C(g, 0.52, 0.52, 0.02, M.dirtDark, 0, 0.92, 0, 0, 0, 0, 18);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      C(g, 0.03, 0.03, 0.5, M.iron, Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3, 5);
    }
    C(g, 0.025, 0.03, 1.4, M.woodDark, 0.1, 1.2, 0, 0.2, 0, 0.35, 6);
    B(g, 0.4, 0.05, 0.4, M.fireGlow, 0, 0.06, 0);
    return { obj: g, boxes: [[-0.65, 0, -0.65, 0.65, 1.1, 0.65]] };
  },
  mesaCocina(M, o, r) {
    const g = new THREE.Group();
    B(g, 1.8, 0.08, 0.8, M.woodDark, 0, 0.84, 0);
    for (const [a, b] of [[-0.82, -0.34], [0.82, -0.34], [-0.82, 0.34], [0.82, 0.34]]) B(g, 0.08, 0.84, 0.08, M.woodDark, a, 0.42, b);
    for (let i = 0; i < 6; i++) {
      const m = mesh(new THREE.SphereGeometry(0.06, 8, 6), i % 2 ? M.pumpkin || M.redPaint : M.clothWhite, -0.6 + r() * 0.5, 0.93, -0.2 + r() * 0.3);
      g.add(m);
    }
    B(g, 0.4, 0.04, 0.25, M.wood, 0.3, 0.9, 0.1);
    B(g, 0.02, 0.01, 0.2, M.silver, 0.35, 0.93, 0.1, 0, 0.4, 0);
    R(g, 0.3, 0.1, 0.12, M.sack, 0.65, 0.93, -0.1, 0.04);
    return { obj: g, boxes: [[-0.9, 0, -0.4, 0.9, 0.95, 0.4]] };
  },
  // Torre de guardia de madera con reflector.
  torre(M) {
    const g = new THREE.Group();
    const H = 4.2;
    for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) B(g, 0.16, H + 2.2, 0.16, M.woodDark, a, (H + 2.2) / 2, b);
    for (const y of [1.4, 2.8]) {
      for (const s of [-1, 1]) {
        B(g, 1.9, 0.08, 0.08, M.woodDark, 0, y, s * 0.9, 0, 0, s * 0.5);
        B(g, 0.08, 0.08, 1.9, M.woodDark, s * 0.9, y, 0, s * 0.5, 0, 0);
      }
    }
    B(g, 2.3, 0.12, 2.3, M.wood, 0, H, 0);
    for (const s of [-1, 1]) {
      B(g, 2.3, 0.9, 0.06, M.wood, 0, H + 0.5, s * 1.12);
      B(g, 0.06, 0.9, 2.3, M.wood, s * 1.12, H + 0.5, 0);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.1, 4), M.roofTin);
    roof.position.set(0, H + 2.75, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    for (let y = 0.4; y < H; y += 0.4) B(g, 0.6, 0.05, 0.05, M.woodDark, 0, y, 1.3);
    for (const x of [-0.3, 0.3]) B(g, 0.05, H, 0.05, M.woodDark, x, H / 2, 1.3);
    const lamp = new THREE.Group();
    lamp.userData.dynamic = true;
    lamp.position.set(0.6, H + 1.2, 0.6);
    lamp.add(mesh(cylGeo(0.18, 0.24, 0.35, 10), M.glassLamp, 0, 0, 0, Math.PI / 2 - 0.4, 0, 0));
    g.add(lamp);
    return { obj: g, boxes: [[-1, 0, -1, -0.8, H, -0.8], [0.8, 0, -1, 1, H, -0.8], [-1, 0, 0.8, -0.8, H, 1], [0.8, 0, 0.8, 1, H, 1]] };
  },
  barras(M) {
    const g = new THREE.Group();
    for (const x of [-0.9, 0.9]) C(g, 0.05, 0.06, 2.4, M.iron, x, 1.2, 0, 0, 0, 0, 8);
    C(g, 0.03, 0.03, 1.8, M.iron, 0, 2.2, 0, 0, 0, Math.PI / 2, 8);
    C(g, 0.03, 0.03, 1.8, M.iron, 0, 1.5, 0, 0, 0, Math.PI / 2, 8);
    return { obj: g, boxes: [[-1, 0, -0.1, -0.8, 2.4, 0.1], [0.8, 0, -0.1, 1, 2.4, 0.1]] };
  },
  pesas(M) {
    const g = new THREE.Group();
    for (const [x, z, ry] of [[0, 0, 0.2], [0.4, 0.3, 1.2], [-0.35, 0.25, -0.6]]) {
      C(g, 0.02, 0.02, 0.8, M.iron, x, 0.1, z, 0, ry, Math.PI / 2, 6);
      for (const s of [-1, 1]) C(g, 0.1, 0.1, 0.06, M.iron, x + Math.cos(ry) * s * 0.35, 0.1, z - Math.sin(ry) * s * 0.35, 0, ry, Math.PI / 2, 12);
    }
    return { obj: g, boxes: [] };
  },
  bancoPiedra(M) {
    const g = new THREE.Group();
    B(g, 2, 0.14, 0.5, M.stoneStep || M.stone, 0, 0.46, 0);
    for (const x of [-0.75, 0.75]) B(g, 0.3, 0.4, 0.4, M.stoneWall || M.stone, x, 0.2, 0);
    return { obj: g, boxes: [[-1, 0, -0.25, 1, 0.53, 0.25]] };
  },
  // La horca del patio: tarima, escalera, travesaño y la soga.
  horca(M) {
    const g = new THREE.Group();
    B(g, 3, 0.12, 2, M.wood, 0, 1.5, 0);
    for (const [a, b] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) B(g, 0.14, 1.5, 0.14, M.woodDark, a, 0.75, b);
    B(g, 3, 1.4, 0.04, M.woodDark, 0, 0.72, 0.98);
    B(g, 0.9, 0.03, 0.9, M.woodDark, 0.4, 1.57, 0);
    for (let k = 0; k < 5; k++) B(g, 0.9, 0.08, 0.28, M.wood, -2, 0.15 + k * 0.3, 0.3 - k * 0.0, 0, 0, 0);
    C(g, 0.09, 0.09, 3.4, M.woodDark, -1.2, 3.2, 0, 0, 0, 0, 8);
    B(g, 1.9, 0.14, 0.14, M.woodDark, -0.3, 4.8, 0);
    B(g, 0.08, 0.9, 0.08, M.woodDark, -0.9, 4.4, 0, 0, 0, 0.8);
    C(g, 0.015, 0.015, 1.3, M.rope, 0.4, 4.1, 0, 0, 0, 0, 5);
    g.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14), M.rope, 0.4, 3.35, 0, 0, Math.PI / 2, 0));
    return { obj: g, boxes: [[-1.5, 0, -1, 1.5, 1.56, 1], [-1.3, 0, -0.1, -1.1, 4.9, 0.1]] };
  },
  // Bote de madera amarrado.
  bote(M) {
    const g = new THREE.Group();
    const hull = new THREE.Group();
    B(hull, 1.3, 0.08, 3.6, M.woodDark, 0, 0.1, 0);
    for (const s of [-1, 1]) B(hull, 0.06, 0.55, 3.6, M.wood, s * 0.68, 0.36, 0, 0, 0, s * 0.18);
    B(hull, 1.4, 0.55, 0.06, M.wood, 0, 0.36, -1.8);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.2, 4, 1), M.wood);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.5);
    bow.position.set(0, 0.36, 2.3);
    hull.add(bow);
    for (const z of [-0.8, 0.6]) B(hull, 1.3, 0.05, 0.3, M.wood, 0, 0.5, z);
    for (const s of [-1, 1]) C(hull, 0.03, 0.03, 2.4, M.wood, s * 0.5, 0.58, 0.2, Math.PI / 2 - 0.1, s * 0.2, 0, 6);
    g.add(hull);
    return { obj: g, boxes: [] };
  },
  bitas(M) {
    const g = new THREE.Group();
    C(g, 0.13, 0.16, 0.5, M.iron, 0, 0.25, 0, 0, 0, 0, 12);
    C(g, 0.2, 0.2, 0.06, M.iron, 0, 0.5, 0, 0, 0, 0, 12);
    g.add(mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14), M.rope, 0, 0.3, 0, Math.PI / 2, 0, 0));
    return { obj: g, boxes: [[-0.2, 0, -0.2, 0.2, 0.55, 0.2]] };
  },
  sogas(M) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.34 - i * 0.02, 0.035, 6, 20), M.rope, 0, 0.04 + i * 0.06, 0, Math.PI / 2, 0, 0));
    return { obj: g, boxes: [] };
  },
  // Celda de calabozo: la reja al frente (con la puerta) y la paja adentro.
  celdaK(M, o, r) {
    const g = new THREE.Group();
    const w = o.w || 6;
    const d = o.d || 6;
    const H = 3.2;
    const f = d / 2;
    const door = 1.1;
    bars(g, M, -w / 2 + 0.05, -door / 2, f, H, 0.16);
    bars(g, M, door / 2, w / 2 - 0.05, f, H, 0.16);
    if (!o.open) bars(g, M, -door / 2, door / 2, f, H - 0.3, 0.16);
    else {
      // la puerta quedó abierta hacia afuera
      const dg = new THREE.Group();
      dg.position.set(door / 2, 0, f);
      dg.rotation.y = -1.9;
      bars(dg, M, -door, 0, 0, H - 0.3, 0.16);
      g.add(dg);
    }
    B(g, w, 0.12, 0.08, M.iron, 0, H, f);
    for (let i = 0; i < 12; i++) R(g, 0.5 + r() * 0.4, 0.05, 0.4 + r() * 0.3, M.hay || M.sack, (r() - 0.5) * (w - 1.5), 0.03, (r() - 0.5) * (d - 1.5), 0.02, r() * 3);
    cot(g, M, -w / 2 + 0.6, -f + 1.3, 0);
    bucket(g, M, w / 2 - 0.5, 0, -f + 0.5);
    const boxes = [[-w / 2, 0, f - 0.08, -door / 2, H, f + 0.08], [door / 2, 0, f - 0.08, w / 2, H, f + 0.08]];
    if (!o.open) boxes.push([-door / 2, 0, f - 0.08, door / 2, H, f + 0.08]);
    return { obj: g, boxes };
  },
  // Cadenas con grilletes clavadas a la pared.
  grilletes(M) {
    const g = new THREE.Group();
    for (const x of [-0.5, 0.5]) {
      B(g, 0.12, 0.12, 0.04, M.iron, x, 2.1, 0.02);
      for (let i = 0; i < 7; i++) g.add(mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 8), M.iron, x + Math.sin(i * 0.4) * 0.03, 2.02 - i * 0.07, 0.05, 0, i % 2 ? Math.PI / 2 : 0, 0));
      g.add(mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 12), M.iron, x, 1.47, 0.06));
    }
    return { obj: g, boxes: [] };
  },
  // La pared de las duchas en el medio: azulejos, caños arriba y regaderas de los dos lados.
  duchas(M, o) {
    const g = new THREE.Group();
    const L = o.len || 12;
    B(g, L, 1.8, 0.24, M.azulejo || M.plasterWhite, 0, 0.9, 0);
    B(g, L + 0.1, 0.06, 0.3, M.stoneStep || M.stone, 0, 1.83, 0);
    C(g, 0.04, 0.04, L, M.copper, 0, 2.5, 0, 0, 0, Math.PI / 2, 8);
    for (let x = -L / 2 + 1; x <= L / 2 - 0.9; x += 1.6) {
      C(g, 0.025, 0.025, 0.7, M.copper, x, 2.15, 0, 0, 0, 0, 6);
      for (const s of [-1, 1]) {
        C(g, 0.02, 0.02, 0.35, M.copper, x, 2.4, s * 0.17, Math.PI / 2, 0, 0, 6);
        C(g, 0.08, 0.04, 0.06, M.metal, x, 2.33, s * 0.34, 0, 0, 0, 10);
        C(g, 0.1, 0.1, 0.01, M.iron, x, 0.005, s * 0.7, 0, 0, 0, 10);
        B(g, 0.08, 0.1, 0.04, M.brass, x + 0.2, 1.3, s * 0.13);
      }
    }
    return { obj: g, boxes: [[-L / 2, 0, -0.14, L / 2, 1.85, 0.14]] };
  },
  bancoMadera(M) {
    const g = new THREE.Group();
    B(g, 1.8, 0.06, 0.4, M.wood, 0, 0.45, 0);
    for (const x of [-0.75, 0.75]) B(g, 0.06, 0.45, 0.35, M.woodDark, x, 0.22, 0);
    return { obj: g, boxes: [[-0.9, 0, -0.2, 0.9, 0.5, 0.2]] };
  },
  // Tres piletas contra la pared con espejos rotos.
  lavatorios(M) {
    const g = new THREE.Group();
    for (const x of [-1, 0, 1]) {
      B(g, 0.6, 0.15, 0.45, M.clothWhite, x, 0.85, 0.25);
      C(g, 0.05, 0.07, 0.8, M.clothWhite, x, 0.4, 0.25, 0, 0, 0, 8);
      C(g, 0.015, 0.015, 0.15, M.metal, x, 1.0, 0.08, 0, 0, 0, 6);
      B(g, 0.5, 0.6, 0.02, M.glassDark, x, 1.55, 0.02);
      B(g, 0.54, 0.64, 0.015, M.iron, x, 1.55, 0.012);
    }
    return { obj: g, boxes: [[-1.35, 0, 0, 1.35, 1, 0.5]] };
  },
  // Retrato del alcaide: kepí, bigote y cara de pocos amigos.
  retrato(M) {
    const g = new THREE.Group();
    const mat = texMat('retrato', 160, 200, (ctx, w, h) => {
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#3a2a1c');
      grd.addColorStop(1, '#1a120c');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1d2b3a';
      ctx.beginPath();
      ctx.ellipse(80, 200, 70, 70, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8a07a';
      ctx.beginPath();
      ctx.ellipse(80, 100, 32, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2b3a';
      ctx.fillRect(46, 52, 68, 24);
      ctx.fillRect(40, 72, 80, 6);
      ctx.fillStyle = '#c8a040';
      ctx.fillRect(74, 58, 12, 10);
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(80, 118, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(66, 94, 8, 4);
      ctx.fillRect(86, 94, 8, 4);
      ctx.fillStyle = '#e0c870';
      ctx.font = 'italic 13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('El Alcaide', 80, 190);
    });
    B(g, 0.74, 0.9, 0.04, M.brass, 0, 1.9, 0.02);
    B(g, 0.62, 0.78, 0.01, mat, 0, 1.9, 0.045);
    return { obj: g, boxes: [] };
  },
  // Bandera argentina colgada (con el sol).
  bandera(M) {
    const g = new THREE.Group();
    const mat = texMat('bandera', 180, 120, (ctx, w, h) => {
      ctx.fillStyle = '#74acdf';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f4f0e6';
      ctx.fillRect(0, h / 3, w, h / 3);
      ctx.fillStyle = '#f6b40e';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }, { side: THREE.DoubleSide });
    B(g, 1.3, 0.85, 0.01, mat, 0, 2.2, 0.03);
    C(g, 0.02, 0.02, 1.5, M.brass, 0, 2.65, 0.05, 0, 0, Math.PI / 2, 6);
    return { obj: g, boxes: [] };
  },
  perchero(M) {
    const g = new THREE.Group();
    C(g, 0.03, 0.04, 1.8, M.woodDark, 0, 0.9, 0, 0, 0, 0, 8);
    C(g, 0.2, 0.22, 0.04, M.woodDark, 0, 0.02, 0, 0, 0, 0, 12);
    // el kepí y el rebenque del alcaide
    C(g, 0.11, 0.12, 0.13, M.black, 0.08, 1.78, 0, 0, 0, 0.2, 12);
    B(g, 0.14, 0.02, 0.08, M.black, 0.16, 1.72, 0.05, 0, 0, 0.2);
    C(g, 0.012, 0.012, 0.7, M.leather, -0.1, 1.35, 0.03, 0, 0, -0.1, 5);
    return { obj: g, boxes: [[-0.2, 0, -0.2, 0.2, 1.8, 0.2]] };
  },
  // Cama de hospital de hierro con sábanas manchadas.
  camaEnf(M) {
    const g = new THREE.Group();
    B(g, 0.9, 0.05, 1.95, M.iron, 0, 0.55, 0);
    for (const b of [-0.97, 0.97]) {
      for (const a of [-0.43, 0.43]) C(g, 0.02, 0.02, b < 0 ? 1.1 : 0.85, M.iron, a, b < 0 ? 0.55 : 0.43, b, 0, 0, 0, 6);
      C(g, 0.018, 0.018, 0.86, M.iron, 0, b < 0 ? 1.05 : 0.8, b, 0, 0, Math.PI / 2, 6);
    }
    R(g, 0.84, 0.12, 1.88, M.clothWhite, 0, 0.64, 0, 0.05);
    R(g, 0.45, 0.1, 0.3, M.clothWhite, 0, 0.74, -0.7, 0.04);
    B(g, 0.35, 0.005, 0.4, M.redPaint, 0.1, 0.705, 0.2, 0, 0.4, 0);
    return { obj: g, boxes: [[-0.46, 0, -1, 0.46, 0.8, 1]] };
  },
  biombo(M) {
    const g = new THREE.Group();
    for (const [x, ry] of [[-0.62, 0.35], [0, 0], [0.62, -0.35]]) {
      const p = new THREE.Group();
      p.position.set(x, 0, 0);
      p.rotation.y = ry;
      B(p, 0.6, 1.5, 0.01, M.whiteCloth || M.clothWhite, 0, 1, 0);
      for (const s of [-0.3, 0.3]) C(p, 0.012, 0.012, 1.8, M.iron, s, 0.9, 0, 0, 0, 0, 5);
      g.add(p);
    }
    return { obj: g, boxes: [[-0.9, 0, -0.2, 0.9, 1.8, 0.2]] };
  },
  // Vitrina de remedios contra la pared.
  vitrina(M, o, r) {
    const g = new THREE.Group();
    B(g, 1.1, 1.9, 0.4, M.whitewash || M.clothWhite, 0, 0.95, 0.2);
    B(g, 1.0, 1.4, 0.01, M.glass, 0, 1.15, 0.405);
    for (const y of [0.55, 1.0, 1.45]) {
      B(g, 1.0, 0.02, 0.36, M.iron, 0, y, 0.2);
      for (let x = -0.42; x < 0.42; x += 0.12) {
        if (r() < 0.2) continue;
        const col = [M.glass, M.glassDark, M.copper, M.redPaint][Math.floor(r() * 4)];
        C(g, 0.03, 0.035, 0.14 + r() * 0.08, col, x, y + 0.09, 0.2 + (r() - 0.5) * 0.1, 0, 0, 0, 8);
      }
    }
    return { obj: g, boxes: [[-0.55, 0, 0, 0.55, 1.9, 0.42]] };
  },
  // Banderas coloradas del Gauchito: mástiles de caña con paños y cintas.
  banderas(M, o, r) {
    const g = new THREE.Group();
    const red = M.redCloth || M.redPaint;
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.6 + (r() - 0.5) * 0.2;
      const z = (r() - 0.5) * 0.5;
      const h = 2.4 + r() * 1.2;
      C(g, 0.025, 0.03, h, M.woodDark, x, h / 2, z, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08, 5);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 4, 2), red);
      const pa = cloth.geometry.attributes.position;
      for (let k = 0; k < pa.count; k++) pa.setZ(k, Math.sin(pa.getX(k) * 5 + i) * 0.06);
      cloth.geometry.computeVertexNormals();
      cloth.position.set(x + 0.42, h - 0.3, z);
      cloth.rotation.y = r() * 0.6;
      cloth.castShadow = true;
      g.add(cloth);
    }
    for (let i = 0; i < 6; i++) B(g, 0.04, 0.35, 0.005, red, (r() - 0.5) * 1.2, 0.9 + r() * 0.6, (r() - 0.5) * 0.4, 0, r() * 3, (r() - 0.5) * 0.4);
    // una piedra con velas al pie
    R(g, 0.5, 0.3, 0.4, M.stone, 0, 0.15, 0.3, 0.08);
    for (const x of [-0.12, 0.05, 0.16]) C(g, 0.02, 0.02, 0.14, M.redPaint, x, 0.37, 0.3, 0, 0, 0, 6);
    return { obj: g, boxes: [[-0.3, 0, 0.1, 0.3, 0.3, 0.5]] };
  },
  // Roperos de chapa de los guardias contra la pared (uno quedó abierto).
  lockers(M, o, r) {
    const g = new THREE.Group();
    const n = o.n || 3;
    const mat = M.metalGreen || M.metal;
    const W = 0.52;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * W;
      B(g, W - 0.02, 1.9, 0.02, mat, x, 0.95, 0.01);
      for (const s of [-1, 1]) B(g, 0.02, 1.9, 0.48, mat, x + s * (W / 2 - 0.02), 0.95, 0.25);
      B(g, W - 0.02, 0.02, 0.48, mat, x, 1.89, 0.25);
      B(g, W - 0.02, 0.02, 0.48, mat, x, 0.02, 0.25);
      const open = k === n - 1 && r() < 0.7;
      const door = new THREE.Group();
      door.position.set(x - W / 2 + 0.03, 0, 0.49);
      door.rotation.y = open ? -1.3 : 0;
      B(door, W - 0.06, 1.84, 0.02, mat, W / 2 - 0.03, 0.95, 0);
      for (let v = 0; v < 4; v++) B(door, 0.26, 0.015, 0.01, M.black, W / 2 - 0.03, 1.55 + v * 0.05, 0.012);
      B(door, 0.03, 0.12, 0.03, M.iron, W - 0.12, 1.0, 0.02);
      g.add(door);
      if (open) {
        // adentro: el uniforme colgado y una gorra
        B(g, 0.3, 0.7, 0.08, M.clothWhite, x, 1.35, 0.25);
        C(g, 0.1, 0.11, 0.1, M.black, x, 1.72, 0.25, 0, 0, 0, 10);
      }
    }
    return { obj: g, boxes: [[-(n * W) / 2, 0, 0, (n * W) / 2, 1.9, 0.52]] };
  },
  // Papeles tirados por el piso (partes, cartas, fojas).
  papeles(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = 0.18 + r() * 0.12;
      B(g, s, 0.004, s * 1.35, r() < 0.2 ? M.sack : M.paper, (r() - 0.5) * 1.6, 0.004 + i * 0.001, (r() - 0.5) * 1.2, (r() - 0.5) * 0.08, r() * 3, 0);
    }
    return { obj: g, boxes: [] };
  },
  // Manchas oscuras en el piso (sangre vieja y óxido).
  manchas(M, o, r) {
    const g = new THREE.Group();
    const mat = texMat('mancha', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 34;
        const rr = 6 + Math.random() * 22;
        const grd = ctx.createRadialGradient(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr);
        grd.addColorStop(0, 'rgba(58,6,4,0.55)');
        grd.addColorStop(1, 'rgba(40,4,2,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }
    }, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.35 });
    const s = 1.3 + r() * 0.9;
    const m = mesh(new THREE.PlaneGeometry(s, s * (0.7 + r() * 0.5)), mat, 0, 0.012, 0, -Math.PI / 2, 0, r() * 3);
    m.castShadow = false;
    g.add(m);
    return { obj: g, boxes: [] };
  },
  // Charco de agua de la ducha (o de la gotera).
  charco(M, o, r) {
    const g = new THREE.Group();
    const mat = texMat('charco', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = 64 + (Math.random() - 0.5) * 50;
        const y = 64 + (Math.random() - 0.5) * 40;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 18 + Math.random() * 16);
        grd.addColorStop(0, 'rgba(70,86,96,0.45)');
        grd.addColorStop(0.8, 'rgba(70,86,96,0.3)');
        grd.addColorStop(1, 'rgba(70,86,96,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }
    }, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.05, metalness: 0.3 });
    const s = 1.4 + r() * 0.8;
    g.add(mesh(new THREE.PlaneGeometry(s, s * 0.8), mat, 0, 0.01, 0, -Math.PI / 2, 0, r() * 3));
    return { obj: g, boxes: [] };
  },
  // Pizarra colgada: las rayitas de los días, el menú del comedor o el mapa de la isla.
  pizarra(M, o) {
    const g = new THREE.Group();
    const kind = o.text || 'marcas';
    const mat = texMat(`pizarra-${kind}`, 256, 180, (ctx, w, h) => {
      ctx.fillStyle = '#1e2a22';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 2);
      ctx.strokeStyle = '#e8e4d8';
      ctx.fillStyle = '#e8e4d8';
      ctx.lineWidth = 3;
      if (kind === 'marcas') {
        // cuatro palitos y uno cruzado, fila tras fila
        for (let row = 0; row < 5; row++) {
          for (let k = 0; k < 7 - (row === 4 ? 4 : 0); k++) {
            const x0 = 18 + k * 33;
            const y0 = 16 + row * 32;
            for (let s = 0; s < 4; s++) {
              ctx.beginPath();
              ctx.moveTo(x0 + s * 6, y0);
              ctx.lineTo(x0 + s * 6 + 1, y0 + 22);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(x0 - 3, y0 + 18);
            ctx.lineTo(x0 + 23, y0 + 4);
            ctx.stroke();
          }
        }
      } else if (kind === 'menu') {
        ctx.font = 'bold 26px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('MENÚ', w / 2, 34);
        ctx.font = '20px Georgia, serif';
        ['Lunes: guiso', 'Martes: guiso', 'Jueves: GUISO', 'Mate cocido', 'Galleta (1)'].forEach((t, i) => ctx.fillText(t, w / 2, 66 + i * 24));
      } else {
        // el mapa de la isla con una cruz colorada arriba del cerro
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, 100, 62, 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(80, 60, 50, 30);
        ctx.strokeRect(70, 96, 40, 26);
        ctx.strokeStyle = '#d8402a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(185, 50);
        ctx.lineTo(205, 70);
        ctx.moveTo(205, 50);
        ctx.lineTo(185, 70);
        ctx.stroke();
        ctx.font = 'italic 16px Georgia, serif';
        ctx.fillText('¿el cerro?', 170, 100);
      }
    });
    B(g, 1.3, 0.92, 0.04, M.woodDark, 0, 1.75, 0.02);
    B(g, 1.18, 0.8, 0.01, mat, 0, 1.75, 0.045);
    B(g, 0.9, 0.04, 0.06, M.woodDark, 0, 1.3, 0.05);
    return { obj: g, boxes: [] };
  },
  // Cadenas que cuelgan del techo (o del borde de la pasarela) con un gancho.
  cadenas(M, o, r) {
    const g = new THREE.Group();
    const top = (o.top ?? (o.y || 0) + 3.4) - (o.y || 0);
    const len = o.h || 1.5;
    const link = new THREE.TorusGeometry(0.035, 0.009, 4, 8);
    for (const s of [-0.18, 0.18]) {
      const l = len * (0.8 + r() * 0.4);
      const n = Math.floor(l / 0.065);
      for (let i = 0; i < n; i++) g.add(mesh(link, M.iron, s, top - 0.04 - i * 0.065, 0, 0, i % 2 ? Math.PI / 2 : 0, 0));
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.013, 5, 10, Math.PI * 1.4), M.iron, s, top - l - 0.08, 0, 0, 0, Math.PI * 0.8));
    }
    return { obj: g, boxes: [] };
  },
  // Riel de ganchos de carnicero con charque colgado (la cocina).
  ganchos(M, o, r) {
    const g = new THREE.Group();
    const top = (o.top ?? (o.y || 0) + 3.4) - (o.y || 0);
    const meat = M.redCloth || M.redPaint;
    C(g, 0.02, 0.02, 3, M.iron, 0, top - 0.5, 0, 0, 0, Math.PI / 2, 6);
    for (const s of [-1.3, 1.3]) C(g, 0.01, 0.01, 0.5, M.iron, s, top - 0.25, 0, 0, 0, 0, 4);
    for (let k = 0; k < 5; k++) {
      const x = -1.1 + k * 0.55;
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 8, Math.PI * 1.5), M.metal, x, top - 0.6, 0, 0, 0, Math.PI));
      if (r() < 0.75) {
        const m = mesh(new THREE.CapsuleGeometry(0.09 + r() * 0.04, 0.35 + r() * 0.2, 3, 8), k % 2 ? meat : M.leather, x, top - 0.95, 0, (r() - 0.5) * 0.2, r() * 3, 0);
        g.add(m);
      }
    }
    return { obj: g, boxes: [] };
  },
  // Tachos de basura de chapa (uno volcado).
  tachos(M, o, r) {
    const g = new THREE.Group();
    C(g, 0.26, 0.23, 0.75, M.metal, 0, 0.375, 0, 0, 0, 0, 14);
    C(g, 0.28, 0.28, 0.04, M.iron, 0, 0.77, 0, 0.1, 0, 0.05, 14);
    const t = new THREE.Group();
    t.position.set(0.55, 0.23, 0.2);
    t.rotation.set(0, r() * 3, Math.PI / 2);
    C(t, 0.23, 0.2, 0.7, M.rust || M.metal, 0, 0, 0, 0, 0, 0, 14);
    g.add(t);
    for (let i = 0; i < 5; i++) B(g, 0.15, 0.01, 0.12, M.paper, 0.9 + r() * 0.5, 0.01, 0.2 + (r() - 0.5) * 0.6, 0, r() * 3, 0);
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 0.8, 0.3], [0.2, 0, -0.1, 0.9, 0.45, 0.5]] };
  },
  // Santuario del Gauchito Gil a la vera del camino: casita colorada en un poste,
  // con la estampita, velas, cintas y botellas de agua (la ofrenda).
  santuario(M, o, r) {
    const g = new THREE.Group();
    const red = M.redCloth || M.redPaint;
    B(g, 0.08, 1.1, 0.08, M.woodDark, 0, 0.55, 0);
    B(g, 0.7, 0.5, 0.45, M.redPaint, 0, 1.35, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 4), M.redPaint);
    roof.position.set(0, 1.78, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.75);
    roof.castShadow = true;
    g.add(roof);
    const est = texMat('estampita', 64, 96, (ctx, w, h) => {
      ctx.fillStyle = '#d8c8a0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#a0141a';
      ctx.fillRect(18, 34, 28, 50);
      ctx.fillStyle = '#c89878';
      ctx.beginPath();
      ctx.arc(32, 26, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1010';
      ctx.fillRect(22, 14, 20, 6);
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 10);
      ctx.lineTo(10, 90);
      ctx.moveTo(4, 24);
      ctx.lineTo(56, 24);
      ctx.stroke();
    });
    B(g, 0.5, 0.38, 0.01, M.black, 0, 1.35, 0.226);
    B(g, 0.2, 0.3, 0.005, est, 0, 1.36, 0.232);
    for (const x of [-0.18, 0.16]) {
      C(g, 0.02, 0.02, 0.1, M.candle, x, 1.15, 0.2, 0, 0, 0, 6);
      g.add(mesh(new THREE.SphereGeometry(0.012, 5, 4), M.flame, x, 1.21, 0.2));
    }
    for (let i = 0; i < 4; i++) B(g, 0.03, 0.5 + r() * 0.3, 0.004, red, (r() - 0.5) * 0.7, 1.0, 0.24 + r() * 0.02, 0, 0, (r() - 0.5) * 0.3);
    // botellas de agua y velas al pie del poste
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      C(g, 0.04, 0.045, 0.22, M.glass, Math.cos(a) * 0.3, 0.11, 0.2 + Math.sin(a) * 0.15, 0, 0, 0, 8);
    }
    for (let i = 0; i < 5; i++) C(g, 0.025, 0.025, 0.08 + r() * 0.1, M.redPaint, (r() - 0.5) * 0.6, 0.06, 0.35 + r() * 0.15, 0, 0, 0, 6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4, 3, 1), red);
    flag.position.set(0.4, 2.3, -0.05);
    g.add(flag);
    C(g, 0.015, 0.015, 1.1, M.woodDark, 0.1, 1.95, -0.05, 0, 0, 0.1, 5);
    return { obj: g, boxes: [[-0.36, 0, -0.24, 0.36, 1.6, 0.24]] };
  },
  // Balcón del segundo piso de celdas (no se llega): losa, baranda y ménsulas.
  // Va con su `y` a la altura del piso de arriba, contra la pared (mira a +z).
  balcon(M, o) {
    const g = new THREE.Group();
    const L = o.len || 10;
    const D = o.d || 1.1;
    const slab = M.stoneStep || M.stone;
    B(g, L, 0.16, D, slab, 0, -0.08, D / 2);
    for (let x = -L / 2 + 0.6; x <= L / 2 - 0.5; x += 2.2) {
      B(g, 0.12, 0.7, 0.12, M.iron, x, -0.5, 0.1);
      B(g, 0.08, 0.08, D * 0.95, M.iron, x, -0.45, D * 0.45, -0.6, 0, 0);
    }
    const railMat = M.bars || M.iron;
    for (const hy of [0.5, 1.0]) B(g, L, 0.04, 0.04, railMat, 0, hy, D - 0.05);
    for (let x = -L / 2; x <= L / 2 + 0.01; x += 0.5) B(g, 0.025, 1.0, 0.025, railMat, x, 0.5, D - 0.05);
    return { obj: g, boxes: [] };
  },
  // Mesa de operaciones con la lámpara, el pie de suero y la bandeja de fierros.
  mesaOperaciones(M, o, r) {
    const g = new THREE.Group();
    B(g, 0.8, 0.08, 2.0, M.metal, 0, 0.85, 0);
    C(g, 0.08, 0.14, 0.8, M.iron, 0, 0.42, 0, 0, 0, 0, 10);
    B(g, 0.7, 0.05, 1.3, M.clothWhite, 0, 0.92, 0.2);
    B(g, 0.4, 0.004, 0.5, M.redPaint, 0.1, 0.95, 0.1, 0, 0.3, 0);
    // la lámpara de arriba
    C(g, 0.02, 0.02, 1.2, M.iron, -0.6, 1.5, -0.8, 0, 0, 0, 5);
    C(g, 0.02, 0.02, 0.7, M.iron, -0.3, 2.1, -0.8, 0, 0, Math.PI / 2, 5);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.18, 12, 1, true), M.metalGreen || M.metal, 0, 2.0, -0.8));
    // pie de suero
    C(g, 0.012, 0.012, 1.8, M.metal, 0.6, 0.9, 0.7, 0, 0, 0, 5);
    C(g, 0.18, 0.2, 0.02, M.metal, 0.6, 0.01, 0.7, 0, 0, 0, 8);
    B(g, 0.12, 0.2, 0.04, M.glass, 0.6, 1.7, 0.7);
    // bandeja de fierros
    B(g, 0.5, 0.02, 0.3, M.metal, -0.65, 1.0, 0.4);
    C(g, 0.012, 0.012, 1.0, M.metal, -0.65, 0.5, 0.4, 0, 0, 0, 5);
    for (let i = 0; i < 5; i++) B(g, 0.02, 0.008, 0.16, M.silver, -0.8 + i * 0.07, 1.015, 0.4 + (r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.4, 0);
    return { obj: g, boxes: [[-0.45, 0, -1.0, 0.45, 0.95, 1.0]] };
  },
  // Reflector de la torre de guardia: la carcasa y el haz de luz que barre el
  // patio (gira solo: World lo anima por el nombre 'spin').
  reflector(M, o) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    spin.position.y = o.lift || 0;
    spin.name = 'spin';
    spin.userData.dynamic = true;
    spin.userData.speed = o.speed || 0.45;
    const head = new THREE.Group();
    head.rotation.x = -(o.pitch ?? 0.32);
    head.add(mesh(cylGeo(0.26, 0.3, 0.5, 14), M.iron, 0, 0, 0, Math.PI / 2, 0, 0));
    head.add(mesh(cylGeo(0.24, 0.24, 0.02, 14), M.glassLamp, 0, 0, -0.26, Math.PI / 2, 0, 0));
    head.add(beam(o.len || 22, o.width || 2.6, 0.16));
    spin.add(head);
    g.add(spin);
    B(g, 0.1, 0.4, 0.1, M.iron, 0, (o.lift || 0) - 0.3, 0);
    return { obj: g, boxes: [] };
  },
  // El faro de la isla, sobre su peñón en el río: la torre blanca y colorada y
  // la linterna con dos haces que giran.
  faro(M, o, r) {
    const g = new THREE.Group();
    const rock = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const d = i ? 2.2 + r() * 1.2 : 0;
      const s = 2 + r() * 1.6;
      const m = mesh(rock, M.rock || M.stone, Math.cos(a) * d, -1.2 + r() * 0.6, Math.sin(a) * d, r() * 3, r() * 3, 0);
      m.scale.set(s, s * 0.7, s);
      g.add(m);
    }
    const H = 11;
    const white = M.whitewash || M.plasterWhite;
    for (let k = 0; k < 5; k++) C(g, 1.25 - (k + 1) * 0.1, 1.25 - k * 0.1, H / 5, k % 2 ? M.redPaint : white, 0, 0.8 + (k + 0.5) * (H / 5), 0, 0, 0, 0, 16);
    C(g, 1.1, 1.1, 0.2, M.iron, 0, 0.8 + H + 0.1, 0, 0, 0, 0, 16);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      C(g, 0.02, 0.02, 0.9, M.iron, Math.cos(a) * 1.05, 0.8 + H + 0.65, Math.sin(a) * 1.05, 0, 0, 0, 4);
    }
    C(g, 0.62, 0.62, 1.4, M.glassLamp, 0, 0.8 + H + 0.9, 0, 0, 0, 0, 12);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 12), M.redPaint);
    cap.position.set(0, 0.8 + H + 2.05, 0);
    g.add(cap);
    const spin = new THREE.Group();
    spin.name = 'spin';
    spin.userData.dynamic = true;
    spin.userData.speed = 0.6;
    spin.position.set(0, 0.8 + H + 0.9, 0);
    for (const s of [0, Math.PI]) {
      const b = beam(70, 7, 0.1);
      b.rotation.y = s;
      b.rotation.x = -0.03;
      spin.add(b);
    }
    g.add(spin);
    // la puertita y una ventana
    B(g, 0.6, 1.3, 0.05, M.woodDark, 0, 1.45, 1.2);
    B(g, 0.3, 0.4, 0.05, M.glassDark, 0, 6.5, 0.95);
    return { obj: g, boxes: [] };
  },
  // El vapor hundido: medio casco afuera del agua, la chimenea y el mástil roto.
  naufragio(M, o, r) {
    const g = new THREE.Group();
    const hull = new THREE.Group();
    hull.rotation.set(0.12, 0, 0.35);
    const rust = M.rust || M.metal;
    B(hull, 3.4, 0.2, 13, M.woodDark, 0, -0.6, 0);
    for (const s of [-1, 1]) B(hull, 0.15, 2.4, 13, rust, s * 1.7, 0.4, 0, 0, 0, s * 0.1);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 4, 1), rust);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.6);
    bow.position.set(0, 0.4, 8.1);
    bow.castShadow = true;
    hull.add(bow);
    B(hull, 3.2, 0.12, 12, M.wood, 0, 1.3, -0.3);
    B(hull, 2.2, 1.6, 3, M.woodDark, 0, 2.1, -2.5);
    B(hull, 1.4, 0.7, 0.05, M.glassDark, 0, 2.3, -0.98);
    C(hull, 0.45, 0.5, 3.2, M.black, 0, 3.6, 0.8, 0, 0, 0, 12);
    C(hull, 0.5, 0.5, 0.25, M.redPaint, 0, 4.9, 0.8, 0, 0, 0, 12);
    C(hull, 0.09, 0.12, 5, M.woodDark, 0, 3.6, 4.5, 0.3, 0, 0.2, 6);
    C(hull, 0.07, 0.07, 3, M.woodDark, 0.3, 5.2, 4.6, 0, 0, 1.2, 6);
    // la rueda de paletas del costado, rota
    const wheel = new THREE.Group();
    wheel.position.set(1.9, 0.6, -3.5);
    wheel.rotation.z = Math.PI / 2;
    wheel.add(mesh(new THREE.TorusGeometry(1.4, 0.07, 6, 16, Math.PI * 1.5), rust, 0, 0, 0, Math.PI / 2, 0, 0));
    for (let k = 0; k < 6; k++) wheel.add(mesh(boxGeo(0.08, 1.4, 0.5), M.woodDark, 0, 0, 0, 0, (k / 6) * Math.PI, 0));
    hull.add(wheel);
    g.add(hull);
    for (let i = 0; i < 5; i++) C(g, 0.02, 0.02, 1.6 + r(), M.rope, (r() - 0.5) * 2, 2 + r(), (r() - 0.5) * 8, r(), 0, r(), 4);
    return { obj: g, boxes: [] };
  },
  // Rollo de alambre de púas al pie de la reja.
  alambre(M, o) {
    const g = new THREE.Group();
    const L = o.len || 6;
    const n = Math.round(L / 0.3);
    const ring = new THREE.TorusGeometry(0.3, 0.008, 3, 14);
    for (let i = 0; i < n; i++) g.add(mesh(ring, M.iron, -L / 2 + i * 0.3, 0.3, 0, 0, Math.PI / 2 + 0.35 * Math.sin(i), 0));
    return { obj: g, boxes: [] };
  },
  // Escombros: ladrillos sueltos, un tablón y polvo.
  escombros(M, o, r) {
    const g = new THREE.Group();
    const brick = M.brick || M.stone;
    for (let i = 0; i < 14; i++) B(g, 0.24, 0.07, 0.12, brick, (r() - 0.5) * 1.2, 0.035 + (i > 9 ? 0.07 : 0), (r() - 0.5) * 0.9, (r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4);
    for (let i = 0; i < 4; i++) R(g, 0.35 + r() * 0.3, 0.2, 0.3 + r() * 0.3, M.stoneWall || M.stone, (r() - 0.5) * 0.9, 0.1, (r() - 0.5) * 0.7, 0.05, r() * 3);
    B(g, 1.8, 0.05, 0.22, M.woodDark, 0.1, 0.25, 0.1, 0, 0.5, 0.25);
    return { obj: g, boxes: [[-0.6, 0, -0.45, 0.6, 0.35, 0.45]] };
  },
  // El barbacuá: el secadero de yerba a fuego lento. Un fogón hundido con
  // brasas y un armazón de palos en arco con las ramas de yerba encima.
  barbacua(M, o, r) {
    const g = new THREE.Group();
    const brick = M.brick || M.stone;
    const W = 4.2;
    const D = 3.2;
    // el fogón
    for (const s of [-1, 1]) B(g, 1.8, 0.45, 0.2, brick, 0, 0.22, s * 0.6);
    for (const s of [-1, 1]) B(g, 0.2, 0.45, 1.4, brick, s * 0.9, 0.22, 0);
    B(g, 1.6, 0.05, 1.0, M.fireGlow, 0, 0.08, 0);
    for (let i = 0; i < 7; i++) C(g, 0.05, 0.06, 0.8, M.log, (r() - 0.5) * 1.1, 0.16, (r() - 0.5) * 0.6, Math.PI / 2, r() * 3, 0, 6);
    // arcos de palo
    for (let k = 0; k < 5; k++) {
      const z = -D / 2 + (k * D) / 4;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.05, 5, 16, Math.PI), M.log);
      arc.position.set(0, 0, z);
      arc.scale.set(1, 1.25, 1);
      arc.castShadow = true;
      g.add(arc);
    }
    for (const x of [-1.6, -0.8, 0, 0.8, 1.6]) {
      const y = Math.sqrt(Math.max(0, 1 - (x / (W / 2)) ** 2)) * (W / 2) * 1.25;
      C(g, 0.04, 0.04, D + 0.2, M.log, x, y, 0, Math.PI / 2, 0, 0, 5);
    }
    // las ramas de yerba tendidas arriba
    const leaf = new THREE.IcosahedronGeometry(0.13, 0);
    for (let i = 0; i < 150; i++) {
      const x = (r() - 0.5) * (W - 0.5);
      const y = Math.sqrt(Math.max(0, 1 - (x / (W / 2)) ** 2)) * (W / 2) * 1.25 + 0.04;
      const m = mesh(leaf, r() < 0.6 ? M.yerbaBush || M.leaf : M.yerbaBranch, x, y, (r() - 0.5) * (D - 0.1), 0, r() * 3, -Math.atan2(x, 2.4) * 0.8);
      m.scale.set(1.5, 0.3, 1.1);
      g.add(m);
    }
    const boxes = [[-1.0, 0, -0.7, 1.0, 0.5, 0.7]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push([sx * (W / 2) - 0.12, 0, sz * (D / 2) - 0.12, sx * (W / 2) + 0.12, 1.2, sz * (D / 2) + 0.12]);
    return { obj: g, boxes };
  },
  // Red de pesca tendida con boyas.
  redes(M, o, r) {
    const g = new THREE.Group();
    const mat = texMat('red', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(150,140,110,1)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 16; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, 0);
        ctx.lineTo(i * 8 + 12, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 8);
        ctx.lineTo(w, i * 8 + 12);
        ctx.stroke();
      }
    }, { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(2.2, 1.6, 10, 8);
    const pa = geo.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const x = pa.getX(k);
      const y = pa.getY(k);
      pa.setZ(k, Math.sin(x * 3 + y * 2) * 0.12 + Math.cos(y * 4) * 0.08);
    }
    geo.computeVertexNormals();
    const net = new THREE.Mesh(geo, mat);
    net.rotation.x = -Math.PI / 2 + 0.25;
    net.position.set(0, 0.25, 0);
    g.add(net);
    B(g, 0.9, 0.5, 0.6, M.crate || M.wood, -0.6, 0.25, -0.3, 0, 0.3, 0);
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M.pumpkin || M.redPaint, (r() - 0.5) * 1.8, 0.1 + r() * 0.2, (r() - 0.5) * 1.2));
    return { obj: g, boxes: [[-1.05, 0, -0.6, -0.15, 0.5, 0]] };
  },
  // Cajones de pescado apilados.
  cajones(M, o, r) {
    const g = new THREE.Group();
    const spots = [[0, 0, 0], [0.62, 0, 0.05], [0.3, 0.32, 0.02], [-0.1, 0, 0.5]];
    for (const [x, y, z] of spots) {
      const c = new THREE.Group();
      c.position.set(x, y, z);
      c.rotation.y = (r() - 0.5) * 0.3;
      B(c, 0.58, 0.04, 0.4, M.wood, 0, 0.02, 0);
      for (const s of [-1, 1]) B(c, 0.58, 0.26, 0.03, M.wood, 0, 0.15, s * 0.19);
      for (const s of [-1, 1]) B(c, 0.03, 0.26, 0.4, M.wood, s * 0.28, 0.15, 0);
      if (r() < 0.6) for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CapsuleGeometry(0.04, 0.2, 3, 6), M.silver, x + (r() - 0.5) * 0.35, y + 0.22, z + (r() - 0.5) * 0.25, 0, r() * 3, Math.PI / 2));
      g.add(c);
    }
    return { obj: g, boxes: [[-0.35, 0, -0.25, 0.95, 0.62, 0.75]] };
  },
  // Cruz grande de palo con el paño colorado, colgada en la pared de la capilla.
  cruzPared(M) {
    const g = new THREE.Group();
    B(g, 0.2, 3.2, 0.12, M.woodDark, 0, 3.2, 0.06);
    B(g, 1.6, 0.2, 0.12, M.woodDark, 0, 4.1, 0.06);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7, 4, 2), M.redCloth || M.redPaint);
    cloth.position.set(0, 3.75, 0.14);
    g.add(cloth);
    return { obj: g, boxes: [] };
  },
  // El espinillo del cerro: tronco retorcido, espinas, cintas coloradas y la soga.
  espinillo(M, o, r) {
    const g = new THREE.Group();
    const red = M.redCloth || M.redPaint;
    C(g, 0.14, 0.26, 2.2, M.bark, 0, 1.1, 0, 0.1, 0, 0.12, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5;
      const len = 1.2 + r() * 0.9;
      const p = new THREE.Group();
      p.position.set(0.1, 2.0 + r() * 0.5, 0);
      p.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      C(p, 0.03, 0.07, len, M.bark, 0, len / 2, 0, 0, 0, 0, 6);
      for (let k = 0; k < 6; k++) C(p, 0.004, 0.012, 0.12, M.bark, 0.04, len * (k / 6), 0, 0, 0, 1.2, 3);
      const crown = mesh(new THREE.IcosahedronGeometry(0.55, 0), M.leaf, 0, len + 0.1, 0);
      crown.scale.set(1.3, 0.5, 1.3);
      p.add(crown);
      if (r() < 0.7) p.add(mesh(boxGeo(0.04, 0.5, 0.005), red, 0.05, len * 0.6 - 0.25, 0.03, 0, r() * 3, 0.1));
      g.add(p);
    }
    // la soga del ahorcado
    C(g, 0.015, 0.015, 1.1, M.rope, 0.9, 2.1, 0, 0, 0, 0, 5);
    g.add(mesh(new THREE.TorusGeometry(0.12, 0.022, 5, 12), M.rope, 0.9, 1.45, 0, 0, Math.PI / 2, 0));
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 2.4, 0.3]] };
  },
  // Tumbas de los presos: montículos de tierra con cruces de palo.
  tumbas(M, o, r) {
    const g = new THREE.Group();
    const n = o.n || 5;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 1.5 + (r() - 0.5) * 0.3;
      const z = (r() - 0.5) * 0.5;
      const mound = mesh(new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.dirtDark || M.dirt, x, -0.05, z + 0.3);
      mound.scale.set(0.8, 0.45, 1.6);
      g.add(mound);
      const c = new THREE.Group();
      c.position.set(x, 0, z - 0.6);
      c.rotation.set((r() - 0.5) * 0.25, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
      B(c, 0.07, 1.1, 0.05, M.woodDark, 0, 0.5, 0);
      B(c, 0.45, 0.07, 0.05, M.woodDark, 0, 0.8, 0);
      if (r() < 0.35) B(c, 0.05, 0.3, 0.005, M.redCloth || M.redPaint, 0.12, 0.62, 0.03, 0, 0, 0.1);
      g.add(c);
    }
    return { obj: g, boxes: [] };
  },
  // ---------------- el islote de las ánimas ----------------
  // El muellecito del islote: tablas arriba del piso de la zona (a lo largo de z).
  tablado(M, o, r) {
    const g = new THREE.Group();
    const w = o.w || 4;
    const len = o.len || 8;
    const n = Math.round(len / 0.32);
    const step = len / n;
    for (let i = 0; i < n; i++) B(g, w - 0.05 - r() * 0.06, 0.04, step - 0.03, i % 3 ? M.wood : M.woodDark, (r() - 0.5) * 0.05, 0.02, -len / 2 + (i + 0.5) * step);
    for (const s of [-1, 1]) B(g, 0.12, 0.07, len, M.woodDark, s * (w / 2 - 0.08), 0.035, 0);
    return { obj: g, boxes: [] };
  },
  // San La Muerte, el santo de los presos: el esqueleto con manto negro,
  // corona y guadaña, parado en su pedestal (mira a +z). shelf: en una
  // ménsula contra la pared; small: la capillita del patio, en un poste.
  sanLaMuerte(M, o, r) {
    const g = new THREE.Group();
    const bone = M.bone || keep('bone', () => new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.75 }));
    const cloak = keep('cloak', () => new THREE.MeshStandardMaterial({ color: 0x151015, roughness: 0.9, side: THREE.DoubleSide }));
    const eyes = keep('slmEyes', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a10).multiplyScalar(2.2), toneMapped: false }));
    const red = M.redCloth || M.redPaint;
    const f = new THREE.Group();
    g.add(f);
    if (o.small) {
      // la capillita: poste, nicho colorado con techito y el santo adentro
      C(g, 0.05, 0.06, 1.05, M.woodDark, 0, 0.525, 0, 0, 0, 0, 6);
      B(g, 0.62, 0.05, 0.42, M.woodDark, 0, 1.06, 0);
      B(g, 0.62, 0.8, 0.04, M.redPaint, 0, 1.47, -0.19);
      for (const x of [-0.29, 0.29]) B(g, 0.04, 0.8, 0.42, M.redPaint, x, 1.47, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.32, 4), M.woodDark);
      roof.position.set(0, 2.0, 0);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1, 1, 0.72);
      roof.castShadow = true;
      g.add(roof);
      for (let i = 0; i < 3; i++) B(g, 0.03, 0.4 + r() * 0.2, 0.004, red, -0.2 + i * 0.2, 1.25, 0.22, 0, 0, (r() - 0.5) * 0.3);
      f.position.set(0, 1.09, 0.02);
      f.scale.setScalar(0.36);
    } else if (o.shelf) {
      // ménsula de piedra contra la pared
      B(g, 1.0, 0.14, 0.7, M.stone, 0, -0.07, 0.35);
      B(g, 0.4, 0.5, 0.3, M.stone, 0, -0.39, 0.15);
      f.position.z = 0.36;
    }
    R(f, 0.8, 0.32, 0.56, M.stone, 0, 0.16, 0, 0.04);
    // el manto, abierto adelante: se le ven las costillas
    const mant = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.2, 14, 1, true, 0.55, Math.PI * 2 - 1.1), cloak);
    mant.position.y = 0.92;
    mant.castShadow = true;
    f.add(mant);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0.6, Math.PI * 2 - 1.2), cloak);
    hood.position.set(0, 1.55, -0.01);
    hood.scale.set(1, 1.15, 1);
    f.add(hood);
    B(f, 0.04, 0.62, 0.04, bone, 0, 1.02, 0.1);
    for (let k = 0; k < 5; k++) B(f, 0.27 - k * 0.025, 0.024, 0.03, bone, 0, 1.26 - k * 0.075, 0.15 - k * 0.005);
    B(f, 0.24, 0.08, 0.1, bone, 0, 0.74, 0.1);
    f.add(mesh(new THREE.SphereGeometry(0.105, 12, 9), bone, 0, 1.53, 0.05));
    B(f, 0.11, 0.05, 0.07, bone, 0, 1.43, 0.09);
    for (const x of [-0.037, 0.037]) f.add(mesh(new THREE.SphereGeometry(0.024, 6, 5), eyes, x, 1.545, 0.135));
    // la corona
    f.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.06, 10, 1, true), M.brass, 0, 1.66, 0.04));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      f.add(mesh(new THREE.ConeGeometry(0.018, 0.07, 4), M.brass, Math.sin(a) * 0.095, 1.72, 0.04 + Math.cos(a) * 0.095));
    }
    // los brazos: con la derecha la guadaña, con la izquierda el mundo
    C(f, 0.018, 0.018, 0.42, bone, 0.2, 1.18, 0.14, 0.6, 0, 0.35, 6);
    C(f, 0.018, 0.018, 0.42, bone, -0.2, 1.18, 0.14, 0.6, 0, -0.35, 6);
    f.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), M.brass, -0.26, 1.02, 0.32));
    C(f, 0.017, 0.017, 1.95, M.woodDark, 0.28, 1.05, 0.3, 0, 0, -0.06, 6);
    const blade = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 4, 14, Math.PI * 0.62), M.iron);
    blade.position.set(0.1, 1.98, 0.3);
    blade.rotation.set(0, 0, 0.35);
    blade.scale.set(1, 1, 0.35);
    f.add(blade);
    // velas coloradas y negras al pie
    for (let i = 0; i < 4; i++) {
      const x = -0.3 + i * 0.2;
      C(f, 0.022, 0.022, 0.1, i % 2 ? M.black : M.redPaint, x, 0.37, 0.22, 0, 0, 0, 6);
      f.add(mesh(new THREE.SphereGeometry(0.013, 5, 4), M.flame, x, 0.44, 0.22));
    }
    const boxes = o.small ? [[-0.32, 0, -0.24, 0.32, 1.9, 0.24]] : o.shelf ? [] : [[-0.42, 0, -0.3, 0.42, 1.9, 0.3]];
    return { obj: g, boxes };
  },
  // La espadaña de la ermita: el murito de la campana arriba de la fachada
  // (va con su y a la altura del techo; mira a +z).
  espadana(M) {
    const g = new THREE.Group();
    const white = M.whitewash || M.plasterWhite;
    for (const x of [-0.9, 0.9]) B(g, 0.5, 1.5, 0.42, white, x, 0.75, 0);
    B(g, 2.3, 0.34, 0.42, white, 0, 1.67, 0);
    const tri = new THREE.Shape();
    tri.moveTo(-1.15, 0);
    tri.lineTo(1.15, 0);
    tri.lineTo(0, 0.75);
    tri.lineTo(-1.15, 0);
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.42, bevelEnabled: false }).translate(0, 1.84, -0.21), white);
    gable.castShadow = true;
    g.add(gable);
    B(g, 0.07, 0.7, 0.07, M.iron, 0, 2.95, 0);
    B(g, 0.36, 0.07, 0.07, M.iron, 0, 3.05, 0);
    // la campana colgada del yugo, en el hueco
    B(g, 1.3, 0.1, 0.12, M.woodDark, 0, 1.44, 0);
    const bell = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.42], [0.1, 0.4], [0.16, 0.3], [0.19, 0.12], [0.26, 0.02], [0.27, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 16), M.brass);
    bell.position.set(0, 0.98, 0);
    bell.castShadow = true;
    g.add(bell);
    return { obj: g, boxes: [] };
  },
  // El ceibo del islote: tronco retorcido, copa rala y la flor colorada (también en el piso).
  ceibo(M, o, r) {
    const g = new THREE.Group();
    const flower = keep('ceiboFlower', () => new THREE.MeshStandardMaterial({ color: 0xc8141a, roughness: 0.6, emissive: 0x2a0000 }));
    const petal = keep('ceiboGeo', () => new THREE.ConeGeometry(0.08, 0.15, 5));
    C(g, 0.22, 0.4, 2.4, M.bark, 0, 1.2, 0, 0.06, 0, -0.08, 9);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r() * 0.6;
      const len = 1.6 + r() * 1.1;
      const p = new THREE.Group();
      p.position.set(0, 2.1 + r() * 0.4, 0);
      p.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      C(p, 0.05, 0.12, len, M.bark, 0, len / 2, 0, 0, 0, 0, 6);
      const crown = mesh(new THREE.IcosahedronGeometry(0.85, 0), M.leaf, 0, len + 0.2, 0);
      crown.scale.set(1.3, 0.55, 1.3);
      p.add(crown);
      for (let k = 0; k < 7; k++) p.add(mesh(petal, flower, (r() - 0.5) * 1.8, len + 0.15 + (r() - 0.3) * 0.5, (r() - 0.5) * 1.8, r() * 3, r() * 3, 0));
      g.add(p);
    }
    for (let k = 0; k < 12; k++) g.add(mesh(petal, flower, (r() - 0.5) * 2.8, 0.03, (r() - 0.5) * 2.8, Math.PI / 2, r() * 3, 0));
    return { obj: g, boxes: [[-0.35, 0, -0.35, 0.35, 2.4, 0.35]] };
  },
  // Ofrendas a San La Muerte: botellas de caña, velas coloradas y negras,
  // cigarrillos y una calaverita de hueso.
  ofrendas(M, o, r) {
    const g = new THREE.Group();
    const bone = M.bone || keep('bone', () => new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 0.75 }));
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.12 + r() * 0.2;
      C(g, 0.035, 0.04, 0.26, M.glass, Math.cos(a) * d, 0.13, Math.sin(a) * d * 0.7, 0, 0, 0, 8);
      C(g, 0.012, 0.016, 0.07, M.glass, Math.cos(a) * d, 0.3, Math.sin(a) * d * 0.7, 0, 0, 0, 6);
    }
    for (let i = 0; i < 6; i++) {
      const x = (r() - 0.5) * 0.6;
      const z = (r() - 0.5) * 0.4;
      const h = 0.06 + r() * 0.12;
      C(g, 0.022, 0.022, h, i % 2 ? M.black : M.redPaint, x, h / 2, z, 0, 0, 0, 6);
      g.add(mesh(new THREE.SphereGeometry(0.013, 5, 4), M.flame, x, h + 0.02, z));
    }
    for (let i = 0; i < 5; i++) C(g, 0.006, 0.006, 0.08, M.candle, (r() - 0.5) * 0.5, 0.006, (r() - 0.5) * 0.3, Math.PI / 2, r() * 3, 0, 5);
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), bone, (r() - 0.5) * 0.3, 0.05, 0.12));
    return { obj: g, boxes: [] };
  },
};

let registered = false;
export function registerPenalProps() {
  if (registered) return;
  registered = true;
  addBuilders(BUILDERS);
}

export { bars, cot, bucket, canvasTex, texMat };
