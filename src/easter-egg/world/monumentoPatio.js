import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { bbox, mergeMeshes, place } from './monumentoKit';
import { toTexture } from '../core/textures';
import { rng } from '../core/noise';

// El patio de la 2043 (Colegio San José, Rosario), de día: lo arma la grilla
// lejos de todo (sobre el río, a 150 m de alto) y solo se ve cuando uno está
// adentro (entities/monumento/Patio2043.js lo prende). Como la foto: la cancha
// de cemento con las líneas blancas y los arcos azules, los edificios blancos
// de dos pisos (abajo ventanas altas con rejas, arriba ventanas de arco), las
// vallas amarillas de los canteros, dos árboles, la Virgen con el marco dorado,
// el arco de fútbol y el aro. Al fondo, los jardincitos con borde de cemento,
// la bandera en su piso de cemento y el pasillo angosto con más aulas.

export const PATIO = { x0: 128, x1: 158, z0: 16, z1: 42, y: 150, cx: 143, cz: 29 };
// las estatuas: en ronda alrededor del portal (la séptima es la de Fortu)
export const RONDA_R = 5.4;
export const PROBADORES = ['Luta', 'Juli', 'Jero', 'Bruno', 'Mateo', 'Eze'];
// el orden del cartel (el de la ronda de mate)
export const ORDEN = ['Juli', 'Mateo', 'Luta', 'Eze', 'Bruno', 'Jero'];

const W = PATIO.x1 - PATIO.x0;
const D = PATIO.z1 - PATIO.z0;
const H1 = 4.4; // planta baja
const H2 = 4.2; // primer piso
const TOP = H1 + H2 + 1.1; // con la cornisa y el parapeto

// ---------------- texturas ----------------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function speckle(x, w, h, n, col, a, r = 1.5) {
  const R = rng(w * 7 + h);
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${col},${a * (0.4 + R() * 0.6)})`;
    x.beginPath();
    x.arc(R() * w, R() * h, R() * r + 0.3, 0, Math.PI * 2);
    x.fill();
  }
}

// La cancha: el cemento alisado con manchas y las líneas pintadas (una sola
// textura para todo el piso: las líneas quedan nítidas y no hay nada encima).
function courtTexture() {
  const S = 68;
  const [c, x] = canvas(W * S, D * S);
  x.fillStyle = '#b9b6ae';
  x.fillRect(0, 0, c.width, c.height);
  // las manchas del cemento y las juntas de dilatación
  const R = rng(2043);
  for (let i = 0; i < 160; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const dark = R() < 0.55;
    g.addColorStop(0, dark ? 'rgba(90,86,80,0.10)' : 'rgba(235,232,224,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.translate(R() * c.width, R() * c.height);
    x.scale(40 + R() * 220, 30 + R() * 160);
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 1, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  speckle(x, c.width, c.height, 9000, '70,66,60', 0.25, 1.2);
  speckle(x, c.width, c.height, 5000, '250,248,240', 0.22, 1.0);
  x.strokeStyle = 'rgba(80,76,70,0.45)';
  x.lineWidth = 2;
  for (let m = 5; m < W; m += 5) {
    x.beginPath();
    x.moveTo(m * S, 0);
    x.lineTo(m * S, c.height);
    x.stroke();
  }
  for (let m = 5; m < D; m += 5) {
    x.beginPath();
    x.moveTo(0, m * S);
    x.lineTo(c.width, m * S);
    x.stroke();
  }
  // la cancha de handball/futsal: 24 x 14, en el medio del patio
  const L = (px) => px * S;
  const cx = L(W / 2);
  const cz = L(D / 2 - 0.5);
  const hw = L(12);
  const hd = L(7);
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(246,246,240,0.92)';
  x.lineWidth = L(0.07);
  x.strokeRect(cx - hw, cz - hd, hw * 2, hd * 2);
  x.beginPath();
  x.moveTo(cx, cz - hd);
  x.lineTo(cx, cz + hd);
  x.stroke();
  x.beginPath();
  x.arc(cx, cz, L(2.2), 0, Math.PI * 2);
  x.stroke();
  // las áreas (semicírculos de 5 m) en cada arco
  for (const s of [-1, 1]) {
    x.beginPath();
    x.arc(cx + s * hw, cz, L(5), s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2);
    x.stroke();
  }
  // las líneas azules (otra cancha, más vieja, que cruza)
  x.strokeStyle = 'rgba(40,96,190,0.85)';
  x.lineWidth = L(0.06);
  for (const s of [-1, 1]) {
    x.beginPath();
    x.arc(cx + s * L(15), cz + L(1), L(9), s > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, s > 0 ? Math.PI * 1.38 : Math.PI * 0.38);
    x.stroke();
  }
  x.beginPath();
  x.moveTo(cx - hw - L(1.4), cz + hd + L(1.6));
  x.lineTo(cx + hw + L(1.4), cz + hd + L(1.6));
  x.stroke();
  // el desgaste de las líneas donde más se corre
  x.globalCompositeOperation = 'destination-out';
  speckle(x, c.width, c.height, 2600, '0,0,0', 0.5, 2.5);
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = '#b9b6ae';
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-over';
  const t = toTexture(c, { repeat: false });
  return t;
}

// El revoque blanco de las fachadas (con lo sucio de abajo y las chorreaduras).
function plasterTexture() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#ece8de';
  x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 5000, '150,140,120', 0.12, 1.4);
  speckle(x, 512, 512, 2000, '255,255,250', 0.2, 1.2);
  const R = rng(17);
  for (let i = 0; i < 26; i++) {
    const X = R() * 512;
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(120,110,95,0.12)');
    g.addColorStop(1, 'rgba(120,110,95,0)');
    x.fillStyle = g;
    x.fillRect(X, 0, 3 + R() * 8, 140 + R() * 300);
  }
  return toTexture(c);
}

function leafTexture() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#4f7a2e';
  x.fillRect(0, 0, 256, 256);
  const R = rng(5);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `hsl(${85 + R() * 30},${45 + R() * 25}%,${22 + R() * 30}%)`;
    x.beginPath();
    x.ellipse(R() * 256, R() * 256, 3 + R() * 5, 1.5 + R() * 2.5, R() * 3, 0, Math.PI * 2);
    x.fill();
  }
  return toTexture(c);
}

// El cartel de los primeros probadores (pintado, colgado en la fachada).
function bannerTexture() {
  const [c, x] = canvas(1536, 384);
  x.fillStyle = '#1f4f9e';
  x.fillRect(0, 0, 1536, 384);
  x.fillStyle = '#f4f2ec';
  x.fillRect(14, 14, 1508, 356);
  x.fillStyle = '#1f4f9e';
  x.fillRect(26, 26, 1484, 332);
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '700 70px Georgia, serif';
  x.fillText('¡GRACIAS, PRIMEROS PROBADORES!', 768, 110);
  x.font = 'italic 600 64px Georgia, serif';
  x.fillStyle = '#ffe48a';
  x.fillText(ORDEN.join('  ·  '), 768, 222);
  x.font = '400 34px Georgia, serif';
  x.fillStyle = '#d8e6ff';
  x.fillText('Mate der Untoten · la primera ronda fue de ustedes', 768, 312);
  return toTexture(c, { repeat: false });
}

// La Virgen del marco dorado (la de la fachada del fondo).
function virgenTexture() {
  const [c, x] = canvas(256, 384);
  const g = x.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, '#3a6cc0');
  g.addColorStop(1, '#bcd6f2');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 384);
  // el manto celeste y blanco, la cara y la aureola
  x.fillStyle = '#ffe9a0';
  x.beginPath();
  x.arc(128, 96, 46, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#f2d2b6';
  x.beginPath();
  x.ellipse(128, 104, 20, 25, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#e8f1ff';
  x.beginPath();
  x.moveTo(128, 70);
  x.bezierCurveTo(60, 120, 50, 300, 70, 360);
  x.lineTo(186, 360);
  x.bezierCurveTo(206, 300, 196, 120, 128, 70);
  x.fill();
  x.fillStyle = '#2f62b0';
  x.beginPath();
  x.moveTo(128, 120);
  x.bezierCurveTo(96, 170, 100, 300, 108, 360);
  x.lineTo(148, 360);
  x.bezierCurveTo(156, 300, 160, 170, 128, 120);
  x.fill();
  return toTexture(c, { repeat: false });
}

// ---------------- los materiales ----------------
function mats() {
  const plaster = plasterTexture();
  return {
    court: new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.82 }),
    plaster: new THREE.MeshStandardMaterial({ map: plaster, color: 0xffffff, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ map: plaster, color: 0xd8d2c4, roughness: 0.85 }),
    base: new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.15, metalness: 0.4 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.7 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.5, metalness: 0.6 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.45, metalness: 0.35 }),
    cement: new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.92 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x5a8a34, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.95, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a838, roughness: 0.3, metalness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    net: new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.65 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.95 }),
    tower: new THREE.MeshStandardMaterial({ color: 0xc9b8a0, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ color: 0xb06a48, roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.92 }),
    flower: new THREE.MeshStandardMaterial({ color: 0xd84a7a, roughness: 0.8 }),
  };
}

// ---------------- el armado ----------------
export function buildPatio(w) {
  const P = PATIO;
  const M = mats();
  const root = new THREE.Group();
  root.name = 'patio2043';
  root.visible = false;
  const gb = new GeoBuilder();
  const extra = [];
  const y = P.y;
  const box = (key, x0, y0, z0, x1, y1, z1, o) => bbox(gb, key, x0, y0, z0, x1, y1, z1, { b: 0.02, ...o });
  // el piso: la losa (con canto, de abajo no se ve hueca) y la cancha pintada
  box('cement', P.x0 - 2, y - 0.6, P.z0 - 2, P.x1 + 2, y - 0.01, P.z1 + 2, { b: 0.05 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), M.court);
  floor.position.set((P.x0 + P.x1) / 2, y, (P.z0 + P.z1) / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- las fachadas: planta baja con ventanas altas enrejadas, primer piso
  // con ventanas de arco, la moldura entre pisos, la cornisa y el parapeto.
  // facade(a lo largo de 'x' o 'z', la línea, desde, hasta, hacia adentro)
  const facade = (ax, line, a0, a1, inward, { doors = [], skip = [], arches = true } = {}) => {
    // el muro (grueso, del lado de adentro para afuera)
    const at = (u, v) => (ax === 'x' ? [u, line + v * inward] : [line + v * inward, u]);
    const slab = (u0, u1, v0, v1, y0, y1, key, o) => {
      const [xa, za] = at(u0, v0);
      const [xb, zb] = at(u1, v1);
      box(key, Math.min(xa, xb), y + y0, Math.min(za, zb), Math.max(xa, xb), y + y1, Math.max(za, zb), o);
    };
    slab(a0, a1, -1.2, 0, 0, TOP, 'plaster', { b: 0.01 });
    // el zócalo gris, la moldura entre pisos y la cornisa con su parapeto
    slab(a0, a1, 0, 0.06, 0, 0.75, 'base', { b: 0.015 });
    slab(a0, a1, 0, 0.14, H1 - 0.05, H1 + 0.22, 'trim', { b: 0.03 });
    slab(a0, a1, 0, 0.32, H1 + H2 - 0.1, H1 + H2 + 0.25, 'trim', { b: 0.05 });
    slab(a0, a1, 0, 0.12, H1 + H2 + 0.25, TOP, 'plaster', { b: 0.02 });
    slab(a0, a1, 0, 0.16, TOP - 0.06, TOP + 0.06, 'trim', { b: 0.02 });
    // las pilastras y las ventanas, en vanos de 3 m
    const n = Math.round((a1 - a0) / 3);
    const step = (a1 - a0) / n;
    for (let i = 0; i <= n; i++) slab(a0 + i * step - 0.22, a0 + i * step + 0.22, 0, 0.1, 0.75, H1 + H2 - 0.1, 'trim', { b: 0.02 });
    for (let i = 0; i < n; i++) {
      const u = a0 + (i + 0.5) * step;
      if (skip.some(([s0, s1]) => u > s0 && u < s1)) continue;
      const isDoor = doors.some(([s0, s1]) => u > s0 && u < s1);
      // planta baja: la ventana alta (o la puerta de dos hojas), con su reja
      const ww = isDoor ? 1.5 : 1.25;
      const y0 = isDoor ? 0.02 : 0.95;
      const y1 = isDoor ? 3.0 : 3.4;
      slab(u - ww / 2 - 0.1, u + ww / 2 + 0.1, 0, 0.08, y0 - (isDoor ? 0 : 0.12), y1 + 0.12, 'trim', { b: 0.015 });
      slab(u - ww / 2, u + ww / 2, 0.08, 0.1, y0, y1, isDoor ? 'door' : 'glass', { b: 0.005 });
      if (isDoor) {
        slab(u - 0.03, u + 0.03, 0.1, 0.12, y0, y1, 'frame', { b: 0.005 });
        for (const s of [-1, 1]) slab(u + s * 0.35 - 0.02, u + s * 0.35 + 0.02, 0.1, 0.16, 1.3, 1.36, 'gold', { b: 0.005 });
      } else {
        slab(u - ww / 2, u + ww / 2, 0.1, 0.12, (y0 + y1) / 2 - 0.03, (y0 + y1) / 2 + 0.03, 'frame', { b: 0.005 });
        for (let k = 1; k < 7; k++) {
          const b = u - ww / 2 + (k * ww) / 7;
          slab(b - 0.012, b + 0.012, 0.13, 0.16, y0, y1, 'iron', { b: 0.003 });
        }
        slab(u - ww / 2, u + ww / 2, 0.13, 0.16, y0 + 0.15, y0 + 0.19, 'iron', { b: 0.003 });
        slab(u - ww / 2, u + ww / 2, 0.13, 0.16, y1 - 0.2, y1 - 0.16, 'iron', { b: 0.003 });
      }
      // primer piso: la ventana de arco con su moldura
      const aw = 1.1;
      const ay0 = H1 + 0.75;
      const ay1 = H1 + 2.75;
      slab(u - aw / 2 - 0.12, u + aw / 2 + 0.12, 0, 0.08, ay0 - 0.15, ay1, 'trim', { b: 0.015 });
      slab(u - aw / 2, u + aw / 2, 0.08, 0.1, ay0, ay1, 'glass', { b: 0.005 });
      slab(u - aw / 2 - 0.2, u + aw / 2 + 0.2, 0, 0.14, ay0 - 0.2, ay0 - 0.12, 'trim', { b: 0.02 });
      if (arches) {
        const cxz = at(u, 0.09);
        const arc = new THREE.Mesh(new THREE.CircleGeometry(aw / 2, 18, 0, Math.PI), M.glass);
        const ring = new THREE.Mesh(new THREE.RingGeometry(aw / 2, aw / 2 + 0.12, 18, 1, 0, Math.PI), M.trim);
        for (const m of [arc, ring]) {
          m.position.set(cxz[0], y + ay1 - 0.01, cxz[1]);
          m.rotation.y = ax === 'x' ? (inward > 0 ? 0 : Math.PI) : inward > 0 ? Math.PI / 2 : -Math.PI / 2;
          m.updateMatrixWorld(true);
          extra.push(m);
        }
      }
    }
  };
  // el fondo (z0): la fachada principal, con la Virgen y la puerta del medio
  facade('x', P.z0, P.x0, P.x1, 1, { doors: [[P.cx - 1.6, P.cx + 1.6]], skip: [[P.cx - 4.6, P.cx - 1.6]] });
  // los costados
  facade('z', P.x0, P.z0 + 1.2, P.z1, 1, { doors: [[27, 30]] });
  facade('z', P.x1, P.z0 + 1.2, P.z1, -1, { doors: [[30, 33]] });

  // ---- la Virgen del marco dorado (al lado de la puerta del medio)
  {
    const vx = P.cx - 3.1;
    const vz = P.z0 + 0.12;
    box('gold', vx - 0.85, y + 1.0, vz, vx + 0.85, y + 3.4, vz + 0.12, { b: 0.03 });
    box('gold', vx - 1.0, y + 3.4, vz, vx + 1.0, y + 3.6, vz + 0.16, { b: 0.03 });
    box('gold', vx - 0.95, y + 0.9, vz, vx + 0.95, y + 1.02, vz + 0.18, { b: 0.02 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.1), new THREE.MeshStandardMaterial({ map: virgenTexture(), roughness: 0.6 }));
    pic.position.set(vx, y + 2.2, vz + 0.125);
    root.add(pic);
    // las flores de abajo
    for (let i = 0; i < 5; i++) extra.push(place(new THREE.IcosahedronGeometry(0.09, 0), M.flower, vx - 0.5 + i * 0.25, y + 1.1, vz + 0.2));
  }

  // ---- el cartel de los probadores (arriba de la puerta del medio)
  {
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.85, side: THREE.DoubleSide }));
    ban.position.set(P.cx + 1.4, y + H1 + 1.2, P.z0 + 0.2);
    root.add(ban);
    for (const s of [-1, 1]) box('iron', P.cx + 1.4 + s * 2.85 - 0.02, y + H1 + 0.4, P.z0, P.cx + 1.4 + s * 2.85 + 0.02, y + H1 + 2.0, P.z0 + 0.25);
  }

  // ---- el timbre de la escuela (al lado de la puerta)
  const bell = new THREE.Group();
  bell.position.set(P.cx + 2.4, y + 3.25, P.z0 + 0.28);
  bell.add(place(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, 0, 0, 0));
  bell.add(place(new THREE.BoxGeometry(0.3, 0.06, 0.18), M.iron, 0, 0.14, -0.06));
  root.add(bell);

  // ---- los canteros con las vallas amarillas delante de la fachada del fondo
  const cantero = (x0, x1, z0, z1) => {
    box('cement', x0, y, z0, x1, y + 0.32, z1, { b: 0.03 });
    box('soil', x0 + 0.1, y + 0.28, z0 + 0.1, x1 - 0.1, y + 0.31, z1 - 0.1, { b: 0.005 });
    const R = rng(Math.floor(x0 * 13 + z0));
    for (let i = 0; i < (x1 - x0) * 3; i++) {
      const px = x0 + 0.3 + R() * (x1 - x0 - 0.6);
      const pz = z0 + 0.3 + R() * (z1 - z0 - 0.6);
      const s = 0.25 + R() * 0.35;
      const b = place(new THREE.IcosahedronGeometry(s, 0), M.leaf, px, y + 0.3 + s * 0.7, pz);
      b.scale.set(1, 0.8 + R() * 0.6, 1);
      extra.push(b);
    }
  };
  const valla = (ax, line, a0, a1) => {
    const at = (u) => (ax === 'x' ? [u, line] : [line, u]);
    const n = Math.max(1, Math.round((a1 - a0) / 1.6));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = at(a0 + ((a1 - a0) * i) / n);
      extra.push(place(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), M.yellow, px, y + 0.5, pz));
    }
    for (const h of [0.3, 0.95]) {
      const [xa, za] = at(a0);
      const [xb, zb] = at(a1);
      const L = Math.hypot(xb - xa, zb - za);
      const r = place(new THREE.CylinderGeometry(0.024, 0.024, L, 8), M.yellow, (xa + xb) / 2, y + h, (za + zb) / 2);
      r.rotation.set(ax === 'x' ? 0 : Math.PI / 2, 0, ax === 'x' ? Math.PI / 2 : 0);
      extra.push(r);
    }
    for (let u = a0 + 0.12; u < a1; u += 0.12) {
      const [px, pz] = at(u);
      extra.push(place(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5), M.yellow, px, y + 0.62, pz));
    }
  };
  cantero(P.x0 + 0.4, P.cx - 5, P.z0 + 0.3, P.z0 + 1.7);
  cantero(P.cx + 5.4, P.x1 - 0.4, P.z0 + 0.3, P.z0 + 1.7);
  valla('x', P.z0 + 2.05, P.x0 + 0.4, P.cx - 5);
  valla('x', P.z0 + 2.05, P.cx + 5.4, P.x1 - 0.4);
  w.addBox([P.x0, y, P.z0, P.cx - 5, y + 1.0, P.z0 + 2.1], { kind: 'prop' });
  w.addBox([P.cx + 5.4, y, P.z0, P.x1, y + 1.0, P.z0 + 2.1], { kind: 'prop' });

  // ---- los dos árboles (en sus canteros redondos)
  const tree = (tx, tz, h, k) => {
    extra.push(place(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 16), M.cement, tx, y + 0.17, tz));
    extra.push(place(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 16), M.soil, tx, y + 0.35, tz));
    const t = place(new THREE.CylinderGeometry(0.16, 0.28, h, 8), M.bark, tx, y + h / 2, tz);
    extra.push(t);
    const R = rng(Math.floor(tx * 31 + tz));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + R();
      const br = place(new THREE.CylinderGeometry(0.06, 0.12, 2.4 * k, 6).rotateZ(0.65).rotateY(a), M.bark, tx + Math.cos(a) * 0.6 * k, y + h + 0.5, tz + Math.sin(a) * 0.6 * k);
      extra.push(br);
    }
    for (let i = 0; i < 9; i++) {
      const c = place(new THREE.IcosahedronGeometry(1, 1), M.leaf, tx + (R() - 0.5) * 4.2 * k, y + h + 1.4 + R() * 2.2 * k, tz + (R() - 0.5) * 4.2 * k);
      c.scale.set((1.4 + R()) * k, (1.0 + R() * 0.6) * k, (1.4 + R()) * k);
      extra.push(c);
    }
    w.addBox([tx - 0.85, y, tz - 0.85, tx + 0.85, y + h, tz + 0.85], { kind: 'prop' });
  };
  tree(P.x0 + 3.2, P.z0 + 4.4, 4.2, 1.25);
  tree(P.x1 - 7.5, P.z0 + 4.0, 3.6, 1.0);

  // ---- los arcos de fútbol (en las dos cabeceras) y el aro
  const goals = [];
  for (const s of [-1, 1]) {
    const gx = s < 0 ? P.x0 + 2.3 : P.x1 - 2.3;
    const gz = P.cz - 0.5;
    const g = new THREE.Group();
    g.position.set(gx, y, gz);
    const post = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 10);
    for (const dz of [-1.5, 1.5]) g.add(place(post, M.white, 0, 1.0, dz));
    const bar = place(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 10).rotateX(Math.PI / 2), M.white, 0, 2.0, 0);
    g.add(bar);
    // la red (atrás) y los caños de atrás
    const back = s < 0 ? -1 : 1;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0, 12, 8), M.net);
    net.position.set(back * 0.9, 1.0, 0);
    net.rotation.y = Math.PI / 2;
    g.add(net);
    for (const dz of [-1.5, 1.5]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), M.net);
      side.position.set(back * 0.45, 1.0, dz);
      g.add(side);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.0), M.net);
    top.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    top.position.set(back * 0.45, 2.0, 0);
    g.add(top);
    root.add(g);
    goals.push({ x: gx, z: gz, s, half: 1.5, back });
  }
  {
    // el aro de básquet en la fachada del costado oeste
    const hx = P.x0 + 0.15;
    const hz = P.z1 - 6;
    box('white', hx, y + 2.6, hz - 0.9, hx + 0.06, y + 3.65, hz + 0.9, { b: 0.01 });
    box('iron', hx + 0.06, y + 2.9, hz - 0.04, hx + 0.45, y + 2.96, hz + 0.04, { b: 0.005 });
    const ring = place(new THREE.TorusGeometry(0.23, 0.015, 6, 20).rotateX(Math.PI / 2), M.yellow, hx + 0.68, y + 3.05, hz);
    extra.push(ring);
    const netH = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true), M.net);
    netH.position.set(hx + 0.68, y + 2.85, hz);
    root.add(netH);
  }

  // ---- el fondo (z1): los jardincitos con borde de cemento, la bandera en su
  // piso de cemento y el pasillo angosto con las aulas
  const gz0 = P.z1 - 6;
  const gz1 = P.z1 - 2.6;
  const flagX = P.cx;
  const jardin = (x0, x1) => {
    box('cement', x0, y, gz0, x1, y + 0.35, gz0 + 0.15, { b: 0.02 });
    box('cement', x0, y, gz1 - 0.15, x1, y + 0.35, gz1, { b: 0.02 });
    box('cement', x0, y, gz0, x0 + 0.15, y + 0.35, gz1, { b: 0.02 });
    box('cement', x1 - 0.15, y, gz0, x1, y + 0.35, gz1, { b: 0.02 });
    box('grass', x0 + 0.15, y, gz0 + 0.15, x1 - 0.15, y + 0.22, gz1 - 0.15, { b: 0.005 });
    const R = rng(Math.floor(x0 * 7));
    for (let i = 0; i < (x1 - x0) * 2; i++) {
      const px = x0 + 0.4 + R() * (x1 - x0 - 0.8);
      const pz = gz0 + 0.4 + R() * (gz1 - gz0 - 0.8);
      extra.push(place(new THREE.IcosahedronGeometry(0.16 + R() * 0.12, 0), R() < 0.3 ? M.flower : M.leaf, px, y + 0.35, pz));
    }
    w.addBox([x0, y, gz0, x1, y + 0.35, gz1], { kind: 'prop', solid: false });
  };
  jardin(P.x0 + 2, flagX - 2.2);
  jardin(flagX + 2.2, P.x1 - 2);
  // el piso de cemento de la bandera (un escalón) y el mástil
  box('cement', flagX - 1.6, y, gz0 + 0.2, flagX + 1.6, y + 0.12, gz1 - 0.2, { b: 0.03 });
  extra.push(place(new THREE.CylinderGeometry(0.05, 0.08, 7.5, 10), M.white, flagX, y + 3.85, (gz0 + gz1) / 2));
  extra.push(place(new THREE.SphereGeometry(0.09, 10, 8), M.gold, flagX, y + 7.65, (gz0 + gz1) / 2));
  const fl = (() => {
    const [c, x] = canvas(256, 160);
    x.fillStyle = '#74acdf';
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#f4f2ec';
    x.fillRect(0, 53, 256, 54);
    x.fillStyle = '#f6b40e';
    x.beginPath();
    x.arc(128, 80, 16, 0, Math.PI * 2);
    x.fill();
    const t = toTexture(c, { repeat: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15, 10, 4).translate(0.9, -0.575, 0), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3.2) * 0.08 * p.getX(i));
    m.position.set(flagX + 0.06, y + 7.4, (gz0 + gz1) / 2);
    return m;
  })();
  root.add(fl);
  w.addBox([flagX - 0.15, y, (gz0 + gz1) / 2 - 0.15, flagX + 0.15, y + 7.6, (gz0 + gz1) / 2 + 0.15], { kind: 'prop' });
  // el pasillo: una galería angosta con techo, columnas y las puertas de las aulas
  {
    const pz0 = P.z1 - 2.0;
    box('cement', P.x0, y, pz0, P.x1, y + 0.08, P.z1, { b: 0.02 });
    box('plaster', P.x0, y, P.z1, P.x1, y + TOP, P.z1 + 1.2, { b: 0.01 });
    box('roof', P.x0, y + 3.0, pz0 - 0.2, P.x1, y + 3.25, P.z1, { b: 0.04 });
    for (let x = P.x0 + 1.5; x < P.x1; x += 3) box('trim', x - 0.15, y, pz0 - 0.15, x + 0.15, y + 3.0, pz0 + 0.15, { b: 0.03 });
    let k = 1;
    for (let x = P.x0 + 3; x < P.x1 - 1; x += 4.5) {
      box('trim', x - 0.6, y, P.z1 - 0.08, x + 0.6, y + 2.45, P.z1, { b: 0.01 });
      box('door', x - 0.48, y, P.z1 - 0.1, x + 0.48, y + 2.3, P.z1 - 0.07, { b: 0.005 });
      box('glass', x + 0.9, y + 1.0, P.z1 - 0.07, x + 2.1, y + 2.2, P.z1 - 0.05, { b: 0.005 });
      // el cartelito del aula
      const [c, ctx] = canvas(128, 64);
      ctx.fillStyle = '#f4f2ec';
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#1f4f9e';
      ctx.font = '700 38px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${k}° ${'ABC'[k % 3]}`, 64, 34);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: toTexture(c, { repeat: false }) }));
      sign.position.set(x, y + 2.55, P.z1 - 0.11);
      sign.rotation.y = Math.PI;
      root.add(sign);
      k++;
    }
  }

  // ---- lo de atrás, arriba de los techos: los edificios de la ciudad
  const R = rng(4309);
  const backdrop = [
    [P.x1 + 8, P.z0 + 4, 9, 7, 26],
    [P.x1 + 6, P.z0 - 10, 12, 8, 16],
    [P.x0 - 9, P.z0 - 6, 10, 9, 21],
    [P.cx + 6, P.z0 - 12, 14, 7, 14],
    [P.x0 - 8, P.z1 + 6, 10, 10, 18],
    [P.x1 + 7, P.z1 + 4, 9, 9, 22],
  ];
  for (const [bx, bz, bw, bd, bh] of backdrop) {
    const mat = R() < 0.4 ? 'brick' : 'tower';
    box(mat, bx - bw / 2, y, bz - bd / 2, bx + bw / 2, y + bh, bz + bd / 2, { b: 0.05 });
    // los balcones y las ventanas (filas de vidrio)
    for (let f = 1; f < bh / 3; f++) {
      const fy = y + f * 3;
      for (const s of [-1, 1]) {
        box('glass', bx - bw / 2 + 0.6, fy + 0.8, s > 0 ? bz + bd / 2 : bz - bd / 2 - 0.02, bx + bw / 2 - 0.6, fy + 2.1, s > 0 ? bz + bd / 2 + 0.02 : bz - bd / 2, { b: 0.005 });
        box('glass', s > 0 ? bx + bw / 2 : bx - bw / 2 - 0.02, fy + 0.8, bz - bd / 2 + 0.6, s > 0 ? bx + bw / 2 + 0.02 : bx - bw / 2, fy + 2.1, bz + bd / 2 - 0.6, { b: 0.005 });
      }
      box('trim', bx - bw / 2 - 0.25, fy - 0.1, bz - bd / 2 - 0.25, bx + bw / 2 + 0.25, fy, bz + bd / 2 + 0.25, { b: 0.02 });
    }
  }
  // las azoteas de los edificios del patio (de arriba se ven)
  box('roof', P.x0 - 12, y + TOP - 0.2, P.z0 - 12, P.x1 + 12, y + TOP - 0.1, P.z0 - 1.2, { b: 0.02 });
  box('roof', P.x0 - 12, y + TOP - 0.2, P.z1 + 1.2, P.x1 + 12, y + TOP - 0.1, P.z1 + 12, { b: 0.02 });
  box('roof', P.x0 - 12, y + TOP - 0.2, P.z0 - 1.2, P.x0 - 1.2, y + TOP - 0.1, P.z1 + 1.2, { b: 0.02 });
  box('roof', P.x1 + 1.2, y + TOP - 0.2, P.z0 - 1.2, P.x1 + 12, y + TOP - 0.1, P.z1 + 1.2, { b: 0.02 });

  root.add(gb.build(M));
  if (extra.length) root.add(mergeMeshes(extra));
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  w.root.add(root);
  return { root, bell, goals, M, flag: fl };
}
