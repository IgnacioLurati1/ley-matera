import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flameMaterial } from '../../world/castleFire';
import { buildMate, getMats } from '../../weapons/viewmodels';
import { sableModel } from '../../weapons/sableModels';
import { buildScythe, cosmicMats, TOP_Y } from '../../weapons/desgarradorModels';
import { buildProp } from '../../world/props';

// Lo que se ve de los pasos de "El Primer Mate" (entities/eclipse/*): las
// marcas, los siete ingredientes, las velas de la capilla, la Yerba Madre, los
// altares de la jura, la celda de la Bombilla, las cavas de la laguna, la
// tacuara, la hoja de la Hoz, los mates perdidos y lo del Temple.
// (2026-10-08, el usuario, después de ver las fotos de los pasos contra el
// arte del mapa: "hacé tu propuesta y mejorá lo que consideres. Que sea digno
// de ser el mejor mapa". Antes eran esferas, conos y el mismo "huevo" blanco
// para todo.) Todo armado acá, sin archivos; las piezas fijas de cada objeto
// juntas por material (bake). globalThis.__mduOldEclProps: como antes.
export const ART = globalThis.__mduOldEclProps !== true;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// un caño entre dos puntos
function rod(a, b, r0, r1, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}
const tube = (pts, r, mat, seg = 24, rs = 6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false), mat);

// Junta las mallas fijas del grupo en una por material (menos dibujos). Las
// marcadas con userData.keep (y los sprites, los puntos y las instanciadas)
// quedan como están.
function bake(group, { shadow = false } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const loose = [];
  group.traverse((o) => {
    if (o === group) return;
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) {
      // (los grupos comunes se recorren: sus mallas se juntan; quedan sueltos
      // solo los marcados, los instanciados, los sprites, los puntos y las líneas)
      if (o.parent === group && (o.userData.keep || o.isInstancedMesh || o.isSprite || o.isPoints || o.isLine)) loose.push(o);
      return;
    }
    let skip = false;
    for (let p = o.parent; p && p !== group; p = p.parent) if (p.userData.keep) skip = true;
    if (skip) return;
    let geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const list = byMat.get(o.material) || [];
    list.push(geo);
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    out.add(m);
  }
  for (const o of loose) out.add(o);
  return out;
}

// ---------------- texturas pintadas ----------------
function canvasTex(w, h, paint, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// El círculo de las marcas: dos anillos finos y entre los dos una ronda de
// signos (el sol tapado, medias lunas, rayas y puntos), blanco sobre nada.
let RUNES = null;
function runeTex() {
  if (RUNES) return RUNES;
  RUNES = canvasTex(512, 512, (x, w) => {
    const c = w / 2;
    const r = seeded(77);
    x.clearRect(0, 0, w, w);
    // (el brillo suave de adentro, en el mismo círculo: un dibujo menos)
    const rg = x.createRadialGradient(c, c, 0, c, c, w * 0.42);
    rg.addColorStop(0, 'rgba(255,255,255,0.22)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, w, w);
    x.strokeStyle = '#fff';
    x.fillStyle = '#fff';
    x.lineCap = 'round';
    const ring = (rad, lw, a = 1) => {
      x.globalAlpha = a;
      x.lineWidth = lw;
      x.beginPath();
      x.arc(c, c, rad, 0, TAU);
      x.stroke();
    };
    ring(w * 0.485, 5, 0.95);
    ring(w * 0.45, 2, 0.6);
    ring(w * 0.33, 3, 0.75);
    ring(w * 0.305, 1.5, 0.4);
    // la ronda de signos
    const N = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const R = w * 0.39;
      x.save();
      x.translate(c + Math.cos(a) * R, c + Math.sin(a) * R);
      x.rotate(a + Math.PI / 2);
      x.globalAlpha = 0.85;
      x.lineWidth = 3;
      const s = w * 0.03;
      const k = Math.floor(r() * 5);
      x.beginPath();
      if (k === 0) {
        // el sol tapado: un círculo y otro corrido adentro
        x.arc(0, 0, s, 0, TAU);
        x.stroke();
        x.beginPath();
        x.arc(s * 0.35, 0, s * 0.7, 0, TAU);
        x.fill();
      } else if (k === 1) {
        // media luna con una raya
        x.arc(0, 0, s, Math.PI * 0.2, Math.PI * 1.8);
        x.moveTo(0, -s * 1.3);
        x.lineTo(0, s * 1.3);
        x.stroke();
      } else if (k === 2) {
        // tres rayas que se juntan
        x.moveTo(-s, s);
        x.lineTo(0, -s);
        x.lineTo(s, s);
        x.moveTo(-s * 0.5, s * 0.1);
        x.lineTo(s * 0.5, s * 0.1);
        x.stroke();
      } else if (k === 3) {
        // la bombilla: un palo con la cuchara
        x.moveTo(0, -s * 1.3);
        x.lineTo(0, s * 0.6);
        x.stroke();
        x.beginPath();
        x.ellipse(0, s * 0.85, s * 0.45, s * 0.35, 0, 0, TAU);
        x.fill();
      } else {
        // rombo con punto
        x.moveTo(0, -s);
        x.lineTo(s * 0.8, 0);
        x.lineTo(0, s);
        x.lineTo(-s * 0.8, 0);
        x.closePath();
        x.stroke();
        x.beginPath();
        x.arc(0, 0, s * 0.22, 0, TAU);
        x.fill();
      }
      x.restore();
    }
    // las rayitas finas entre los dos anillos de afuera
    x.globalAlpha = 0.5;
    x.lineWidth = 2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const l = i % 6 === 0 ? 0.03 : 0.012;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * w * 0.45, c + Math.sin(a) * w * 0.45);
      x.lineTo(c + Math.cos(a) * w * (0.45 + l), c + Math.sin(a) * w * (0.45 + l));
      x.stroke();
    }
  });
  return RUNES;
}

// La columna de luz, que se apaga para arriba (antes un cilindro parejo).
let SHAFT = null;
function shaftTex() {
  if (SHAFT) return SHAFT;
  SHAFT = canvasTex(8, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
  });
  return SHAFT;
}

// Las grietas de una brasa: negro con venas encendidas.
let CRACKS = null;
function crackTex() {
  if (CRACKS) return CRACKS;
  CRACKS = canvasTex(256, 256, (x, w) => {
    const r = seeded(19);
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, w);
    for (let i = 0; i < 26; i++) {
      let px = r() * w;
      let py = r() * w;
      x.strokeStyle = `rgba(255,${120 + Math.floor(r() * 90)},40,${0.6 + r() * 0.4})`;
      x.lineWidth = 1.5 + r() * 4;
      x.beginPath();
      x.moveTo(px, py);
      for (let k = 0; k < 6; k++) {
        px += (r() - 0.5) * 60;
        py += (r() - 0.5) * 60;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    // manchas tibias
    for (let i = 0; i < 40; i++) {
      const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(255,90,20,0.5)');
      gr.addColorStop(1, 'rgba(255,90,20,0)');
      x.save();
      x.translate(r() * w, r() * w);
      x.scale(10 + r() * 24, 10 + r() * 24);
      x.fillStyle = gr;
      x.beginPath();
      x.arc(0, 0, 1, 0, TAU);
      x.fill();
      x.restore();
    }
  });
  return CRACKS;
}

// La tacuara: verde amarillenta, con el nudo oscuro y su anillo cada 40 cm.
let CANE = null;
function caneTex() {
  if (CANE) return CANE;
  CANE = canvasTex(
    32,
    128,
    (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#9aa64a');
      gr.addColorStop(0.5, '#b7ba62');
      gr.addColorStop(1, '#8c9a40');
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
      // vetas a lo largo
      x.globalAlpha = 0.18;
      for (let i = 0; i < 9; i++) {
        x.fillStyle = i % 2 ? '#6a7428' : '#d8d488';
        x.fillRect((i / 9) * w, 0, 1.5, h);
      }
      x.globalAlpha = 1;
      // el nudo
      x.fillStyle = '#5c5a24';
      x.fillRect(0, h - 9, w, 5);
      x.fillStyle = '#d6d08a';
      x.fillRect(0, h - 4, w, 2);
      x.fillStyle = 'rgba(60,50,20,0.35)';
      x.fillRect(0, h - 20, w, 11);
    },
    { repeat: true },
  );
  return CANE;
}

// ---------------- materiales ----------------
let MT = null;
let MTT = null;
export function artMats(g) {
  const T = g.textures || {};
  if (MT && MTT === T) return MT;
  MTT = T;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
  MT = {
    iron: std({ color: 0x302b28, metalness: 0.75, roughness: 0.46, map: T.metal || null }),
    ironDark: std({ color: 0x1c1a19, metalness: 0.7, roughness: 0.55 }),
    rust: std({ color: 0x4a3122, metalness: 0.35, roughness: 0.8, map: T.metal || null }),
    brass: std({ color: 0xb48a3a, metalness: 1, roughness: 0.3 }),
    gold: std({ color: 0xe0b048, metalness: 1, roughness: 0.22 }),
    silver: std({ color: 0xe2e2e2, metalness: 1, roughness: 0.2 }),
    wax: std({ color: 0xece0c4, roughness: 0.55 }),
    wick: std({ color: 0x151110, roughness: 1 }),
    gourd: std({ map: T.gourd || null, color: 0xa87440, roughness: 0.6 }),
    gourdOld: std({ map: T.gourd || null, color: 0xa8743e, roughness: 0.62, emissive: 0x2a1406, emissiveIntensity: 0.5 }),
    leather: std({ map: T.leather || null, color: 0x8a5a38, roughness: 0.8 }),
    red: std({ map: T.wool || null, color: 0xb81e1e, roughness: 1 }),
    woodDark: std({ map: T.woodCarved || null, color: 0x6a4a32, roughness: 0.72 }),
    bark: std({ map: T.woodCarved || null, color: 0x5a4632, roughness: 0.92 }),
    stone: std({ map: T.stoneWall || null, color: 0x8c8780, roughness: 0.9 }),
    cloth: std({ map: T.burlap || null, color: 0xe8e0cc, roughness: 1, side: THREE.DoubleSide }),
    clothRed: std({ map: T.burlap || null, color: 0x8a1c1c, roughness: 1, side: THREE.DoubleSide }),
    mud: std({ map: T.dirt || null, color: 0x4c3b2a, roughness: 1 }),
    mudWet: std({ map: T.dirt || null, color: 0x2a2018, roughness: 0.4 }),
    pebble: std({ color: 0x6a645c, roughness: 0.8, flatShading: true }),
    leafB: std({ color: 0x5a9a3a, roughness: 0.42, side: THREE.DoubleSide, emissive: 0x1c4a10, emissiveIntensity: 0.6 }),
    caneLeaf: std({ color: 0x6f8a36, roughness: 0.6, side: THREE.DoubleSide }),
    cane: std({ map: caneTex(), roughness: 0.45 }),
    caneCut: std({ color: 0xd8cf96, roughness: 0.7 }),
    enamel: std({ color: 0x86bcd4, roughness: 0.3, metalness: 0.05 }),
    enamelChip: std({ color: 0x1c1c22, roughness: 0.6, metalness: 0.4 }),
    bladeIron: std({ color: 0x1b1720, metalness: 0.88, roughness: 0.3 }),
    ice: std({ color: 0xcfeeff, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.75, emissive: 0x1a4a70, emissiveIntensity: 0.6, flatShading: true }),
    water: std({ color: 0x4f9ccc, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.8, emissive: 0x0c3456, emissiveIntensity: 0.9, depthWrite: false }),
    violet: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb27aff).multiplyScalar(1.6), toneMapped: false }),
  };
  return MT;
}

// Un brillo (sprite) del color pedido.
export function glowSprite(g, col, scale, opacity = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot || null, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity }));
  s.scale.setScalar(scale);
  s.userData.keep = true;
  s.userData.base = opacity;
  return s;
}

// Motas que suben (o giran): un THREE.Points chico con su propio paso.
// mode 'rise' (de abajo hacia arriba, en un radio) | 'orbit' (alrededor).
export function motes(g, { n = 8, col = 0xffffff, size = 0.07, r = 0.5, h = 1.6, mode = 'rise', speed = 0.35, seed = 5 } = {}) {
  const rnd = seeded(seed);
  const pos = new Float32Array(n * 3);
  const st = [];
  for (let i = 0; i < n; i++) st.push({ a: rnd() * TAU, d: (0.3 + 0.7 * rnd()) * r, y: rnd(), s: 0.6 + rnd() * 0.8, ph: rnd() * TAU });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: g.textures?.dot || null, color: col, size, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  // (la esfera fija que las contiene: se recortan fuera de cuadro; si no, se
  // dibujaban y subían el búfer en cada cuadro aunque estuvieran detrás)
  geo.boundingSphere = mode === 'rise' ? new THREE.Sphere(V(0, h / 2, 0), Math.max(r, h / 2) + 0.3) : new THREE.Sphere(V(0, 0, 0), r + h + 0.3);
  pts.userData.keep = true;
  pts.userData.tick = (dt, t, k = 1) => {
    // (apagadas no se cuentan ni se suben)
    if (k <= 0.01) {
      pts.visible = false;
      return;
    }
    for (let i = 0; i < n; i++) {
      const S = st[i];
      if (mode === 'rise') {
        S.y += dt * speed * S.s / h;
        if (S.y > 1) {
          S.y -= 1;
          S.a = rnd() * TAU;
          S.d = (0.3 + 0.7 * rnd()) * r;
        }
        const w = Math.sin(t * 1.3 + S.ph) * 0.05;
        pos[i * 3] = Math.cos(S.a) * S.d + w;
        pos[i * 3 + 1] = S.y * h;
        pos[i * 3 + 2] = Math.sin(S.a) * S.d + w;
      } else {
        const a = S.a + t * speed * S.s;
        pos[i * 3] = Math.cos(a) * S.d;
        pos[i * 3 + 1] = (S.y - 0.5) * h + Math.sin(t * 1.7 + S.ph) * 0.06;
        pos[i * 3 + 2] = Math.sin(a) * S.d;
      }
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.85 * k;
    pts.visible = k > 0.01;
  };
  return pts;
}

// ---------------- la marca (common.Marker) ----------------
// El círculo de signos en el piso, que gira despacio; adentro un brillo suave;
// una columna tenue que se apaga para arriba y motas que suben.
export function buildMark(g, col, r) {
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2.1, r * 2.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: runeTex(), color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  );
  ring.position.y = 0.035;

  const H = 2.6;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.16, r * 0.42, H, 18, 1, true),
    new THREE.MeshBasicMaterial({ map: shaftTex(), color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  pillar.position.y = H / 2;
  const mo = motes(g, { n: Math.round(6 + r * 5), col, size: 0.06 + r * 0.02, r: r * 0.85, h: 1.7, seed: Math.floor(col % 997) + 3 });
  return { ring, pillar, motes: mo };
}

// ---------------- las velas de la capilla (la Brasa) ----------------
// Un candelero de hierro de pie (tres patas, caño con dos nudos y el platillo)
// con un cirio gastado, chorreado; prendido: la llama, el brillo y la cera
// tibia. big: el altar del medio (mesa de piedra con el mantel y el cirio).
export function buildCandle(g, { altar = false, seed = 1 } = {}) {
  const M = artMats(g);
  const r = seeded(seed * 31 + 7);
  const root = new THREE.Group();
  const fix = new THREE.Group();
  const wax = M.wax.clone();
  wax.emissive = new THREE.Color(0xff8a30);
  wax.emissiveIntensity = 0;
  let top;
  if (!altar) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + r();
      fix.add(rod(V(0, 0.2, 0), V(Math.cos(a) * 0.16, 0.012, Math.sin(a) * 0.16), 0.011, 0.014, M.iron));
      fix.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), M.iron, Math.cos(a) * 0.165, 0.014, Math.sin(a) * 0.165));
    }
    fix.add(mesh(lathe([[0, 0.17], [0.05, 0.17], [0.04, 0.2], [0.022, 0.25], [0, 0.25]], 10), M.iron));
    const H = 0.95 + r() * 0.2;
    fix.add(mesh(new THREE.CylinderGeometry(0.016, 0.02, H, 8), M.iron, 0, 0.25 + H / 2, 0));
    fix.add(mesh(new THREE.SphereGeometry(0.034, 10, 8), M.iron, 0, 0.25 + H * 0.4, 0));
    fix.add(mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 14).rotateX(Math.PI / 2), M.iron, 0, 0.25 + H * 0.82, 0));
    top = 0.25 + H;
    fix.add(mesh(lathe([[0, top - 0.02], [0.03, top - 0.02], [0.095, top + 0.004], [0.1, top + 0.018], [0.09, top + 0.02], [0, top + 0.012]], 16), M.iron));
    top += 0.012;
  } else {
    // la mesa del altar: dos patas de piedra, la losa, el mantel blanco con la
    // guarda colorada y el cirio grande en su candelero de bronce
    fix.add(mesh(new THREE.BoxGeometry(0.22, 0.86, 0.42), M.stone, -0.42, 0.43, 0));
    fix.add(mesh(new THREE.BoxGeometry(0.22, 0.86, 0.42), M.stone, 0.42, 0.43, 0));
    fix.add(mesh(new THREE.BoxGeometry(1.24, 0.08, 0.62), M.stone, 0, 0.9, 0));
    fix.add(mesh(new THREE.BoxGeometry(1.2, 0.012, 0.58), M.cloth, 0, 0.946, 0));
    for (const s of [-1, 1]) {
      fix.add(mesh(new THREE.PlaneGeometry(1.2, 0.36), M.cloth, 0, 0.77, s * 0.292, 0, s > 0 ? 0 : Math.PI, 0));
      fix.add(mesh(new THREE.PlaneGeometry(1.2, 0.05), M.clothRed, 0, 0.64, s * 0.293, 0, s > 0 ? 0 : Math.PI, 0));
    }
    fix.add(mesh(lathe([[0, 0.95], [0.09, 0.95], [0.08, 0.97], [0.03, 1.0], [0.025, 1.08], [0.07, 1.1], [0.075, 1.115], [0, 1.115]], 18), M.brass, -0.38, 0, 0));
    fix.add(mesh(lathe([[0, 0.95], [0.09, 0.95], [0.08, 0.97], [0.03, 1.0], [0.025, 1.08], [0.07, 1.1], [0.075, 1.115], [0, 1.115]], 18), M.brass, 0.38, 0, 0));
    top = 1.115;
  }
  // el cirio, con la boca gastada (más alto el borde que el medio)
  const cw = altar ? 0.055 : 0.042;
  const chH = altar ? 0.34 : 0.22 + r() * 0.1;
  const cx = altar ? -0.38 : 0;
  const cand = (x) => {
    const c = mesh(lathe([[0, 0], [cw, 0], [cw * 1.04, 0.04], [cw * 1.02, chH - 0.02], [cw * 0.95, chH], [cw * 0.7, chH - 0.008], [cw * 0.3, chH - 0.014], [0, chH - 0.016]], 16), wax, x, top, 0);
    fix.add(c);
    for (let k = 0; k < 3; k++) {
      const a = r() * TAU;
      const L = 0.03 + r() * 0.07;
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, L, 3, 6), wax);
      d.position.set(x + Math.cos(a) * cw * 1.02, top + chH - 0.01 - L / 2, Math.sin(a) * cw * 1.02);
      fix.add(d);
    }
    fix.add(mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.022, 5), M.wick, x, top + chH - 0.005, 0));
  };
  cand(cx);
  if (altar) cand(0.38);
  const baked = bake(fix);
  root.add(baked);
  // las llamas (una por cirio)
  const flames = [];
  const tips = altar ? [-0.38, 0.38] : [0];
  for (const x of tips) {
    const fl = new THREE.Group();
    fl.position.set(x, top + chH + 0.004, 0);
    const geo = new THREE.PlaneGeometry(0.08, 0.17).translate(0, 0.075, 0);
    for (const ry of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(geo, flameMaterial());
      p.rotation.y = ry + 0.4;
      p.renderOrder = 5;
      fl.add(p);
    }
    const core = glowSprite(g, 0xfff0c0, 0.12, 0.9);
    core.position.y = 0.045;
    const halo = glowSprite(g, 0xff9a40, 0.75, 0.42);
    halo.position.y = 0.05;
    fl.add(core, halo);
    fl.visible = false;
    root.add(fl);
    flames.push({ fl, halo, ph: r() * TAU });
  }
  let on = 0;
  let k = 0;
  let burst = 0;
  const api = {
    root,
    top: top + chH,
    lit(v, instant = false) {
      on = v ? 1 : 0;
      if (instant) k = on;
      else if (on) burst = 1;
    },
    tick(dt, t) {
      k += (on - k) * Math.min(1, dt * 4);
      burst = Math.max(0, burst - dt * 1.5);
      const vis = k > 0.02;
      for (const F of flames) {
        F.fl.visible = vis;
        if (!vis) continue;
        const fl = 1 + Math.sin(t * 13 + F.ph) * 0.06 + Math.sin(t * 7.3 + F.ph) * 0.05;
        F.fl.scale.set(k, k * fl * (1 + burst * 0.8), k);
        F.halo.material.opacity = F.halo.userData.base * k * fl * (1 + burst * 2);
      }
      wax.emissiveIntensity = k * (0.16 + Math.sin(t * 9 + flames[0].ph) * 0.03);
    },
  };
  return api;
}

// El ánima que vuela al jugador: un brillo frío con su estela de chispas.
export function buildWisp(g, col = 0x9fd8ff) {
  const root = new THREE.Group();
  const core = glowSprite(g, 0xeaf8ff, 0.16, 1);
  const halo = glowSprite(g, col, 0.7, 0.55);
  root.add(core, halo);
  const N = 10;
  const hist = [];
  const pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const trail = new THREE.Points(geo, new THREE.PointsMaterial({ map: g.textures?.dot || null, color: col, size: 0.11, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  trail.frustumCulled = false;
  g.scene.add(trail);
  let acc = 0;
  return {
    root,
    tick(dt, t) {
      const s = 1 + Math.sin(t * 17) * 0.12;
      core.scale.setScalar(0.16 * s);
      halo.scale.setScalar(0.7 * (1 + Math.sin(t * 5) * 0.1));
      acc += dt;
      if (acc > 0.03) {
        acc = 0;
        hist.unshift(root.position.clone());
        if (hist.length > N) hist.pop();
      }
      for (let i = 0; i < N; i++) {
        const p = hist[Math.min(i, hist.length - 1)] || root.position;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y - i * 0.01;
        pos[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      trail.removeFromParent();
      geo.dispose();
      trail.material.dispose();
      core.material.dispose();
      halo.material.dispose();
    },
  };
}

// ---------------- los ingredientes ----------------
// La Brasa: un carbón encendido por dentro (las grietas laten), su llamita y
// las chispas que suben.
export function buildBrasa(g) {
  const M = artMats(g);
  const root = new THREE.Group();
  const emb = new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 0.92, emissive: 0xff5a14, emissiveMap: crackTex(), emissiveIntensity: 2 });
  const r = seeded(11);
  const rock = (rad, det) => {
    const geo = new THREE.IcosahedronGeometry(rad, det);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.82 + r() * 0.3;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    return geo;
  };
  root.add(mesh(rock(0.09, 1), emb, 0, 0, 0));
  root.add(mesh(rock(0.05, 1), emb, 0.07, -0.025, 0.03, 0.4, 1, 0));
  root.add(mesh(rock(0.04, 0), emb, -0.06, -0.03, -0.04, 1, 0.3, 0.2));
  const fl = new THREE.Group();
  fl.position.y = 0.05;
  const geo = new THREE.PlaneGeometry(0.11, 0.22).translate(0, 0.1, 0);
  for (const ry of [0, Math.PI / 2]) {
    const p = new THREE.Mesh(geo, flameMaterial());
    p.rotation.y = ry + 0.4;
    p.renderOrder = 5;
    p.userData.keep = true;
    fl.add(p);
  }
  fl.userData.keep = true;
  root.add(fl);
  const halo = glowSprite(g, 0xff7a2a, 0.9, 0.45);
  root.add(halo);
  const sp = motes(g, { n: 10, col: 0xffa040, size: 0.04, r: 0.08, h: 0.55, speed: 0.6, seed: 13 });
  root.add(sp);
  root.userData.tick = (dt, t) => {
    emb.emissiveIntensity = 1.7 + Math.sin(t * 3.1) * 0.5 + Math.sin(t * 7.3) * 0.25;
    halo.material.opacity = 0.38 + Math.sin(t * 4.2) * 0.08;
    fl.rotation.y = -root.rotation.y;
    sp.userData.tick(dt, t, 1);
  };
  void M;
  return root;
}

// La hoja de yerba: una lanza con la punta, plegada por el nervio.
function leafGeo(len, w, fold = 0.35) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w, len * 0.35, 0, len);
  s.quadraticCurveTo(-w, len * 0.35, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 5);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // plegada por el nervio y arqueada hacia atrás
    p.setZ(i, -Math.abs(x) * fold - (y / len) * (y / len) * len * 0.12);
  }
  geo.computeVertexNormals();
  return geo;
}

// La Yerba: un atado de ramitas de yerba mate, atado con un tiento colorado.
export function buildYerbaAtado(g) {
  const M = artMats(g);
  const r = seeded(23);
  const fix = new THREE.Group();
  const lg = leafGeo(0.085, 0.032);
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * TAU;
    const spread = 0.025 + r() * 0.02;
    const tip = V(Math.cos(a) * spread * 3.2, 0.2 + r() * 0.06, Math.sin(a) * spread * 3.2);
    const base = V(Math.cos(a) * spread * 0.6, -0.12, Math.sin(a) * spread * 0.6);
    fix.add(rod(base, tip, 0.006, 0.0035, M.bark, 5));
    // las hojas, alternadas a lo largo de la ramita (de la mitad para arriba)
    for (let k = 0; k < 6; k++) {
      const u = 0.35 + k * 0.12;
      const p = base.clone().lerp(tip, u);
      const leaf = new THREE.Mesh(lg, M.leafB);
      leaf.position.copy(p);
      const side = k % 2 ? 1 : -1;
      leaf.rotation.set(0.5 + r() * 0.4, a + side * 1.2 + r() * 0.3, side * (0.7 + r() * 0.3));
      const sc = 0.8 + u * 0.4;
      leaf.scale.setScalar(sc);
      fix.add(leaf);
    }
  }
  // el tiento colorado, dos vueltas y el nudo
  fix.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 18).rotateX(Math.PI / 2), M.red, 0, -0.04, 0));
  fix.add(mesh(new THREE.TorusGeometry(0.031, 0.007, 6, 18).rotateX(Math.PI / 2), M.red, 0, -0.022, 0));
  fix.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), M.red, 0.031, -0.03, 0));
  fix.add(rod(V(0.034, -0.03, 0), V(0.05, -0.09, 0.01), 0.004, 0.003, M.red, 4));
  fix.add(rod(V(0.034, -0.03, 0), V(0.06, -0.08, -0.012), 0.004, 0.003, M.red, 4));
  const root = bake(fix);
  root.rotation.z = 0.5;
  const out = new THREE.Group();
  out.add(root);
  out.scale.setScalar(1.35);
  const halo = glowSprite(g, 0x7aff9a, 0.7, 0.32);
  out.add(halo);
  const mo = motes(g, { n: 6, col: 0x9affb0, size: 0.03, r: 0.14, h: 0.3, mode: 'orbit', speed: 0.8, seed: 29 });
  out.add(mo);
  out.userData.tick = (dt, t) => mo.userData.tick(dt, t, 1);
  return out;
}

// La Bombilla: la de alpaca labrada, con la cuchara del filtro, las fajas de
// oro y el pico doblado. Parada, de 0 a ~0,34 (sin escalar).
export function buildBombilla(g, { glow = true } = {}) {
  const M = artMats(g);
  const fix = new THREE.Group();
  // la cuchara del filtro, aplanada, con los agujeritos (puntos oscuros)
  const cuch = mesh(new THREE.SphereGeometry(0.024, 14, 10), M.silver, 0, 0.02, 0);
  cuch.scale.set(1, 1.15, 0.42);
  fix.add(cuch);
  for (let i = 0; i < 7; i++) fix.add(mesh(new THREE.CircleGeometry(0.0028, 6), M.ironDark, (i % 3 - 1) * 0.009, 0.012 + Math.floor(i / 3) * 0.009, 0.0102));
  fix.add(mesh(new THREE.CylinderGeometry(0.0065, 0.009, 0.03, 10), M.silver, 0, 0.05, 0));
  fix.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0065, 0.24, 10), M.silver, 0, 0.18, 0));
  // las fajas y la virola labrada
  for (const y of [0.09, 0.2, 0.25]) fix.add(mesh(new THREE.TorusGeometry(0.0085, 0.0026, 6, 14).rotateX(Math.PI / 2), M.gold, 0, y, 0));
  fix.add(mesh(lathe([[0.0066, 0.13], [0.011, 0.134], [0.012, 0.15], [0.011, 0.166], [0.0066, 0.17]], 14), M.gold));
  // el pico: doblado, aplanado, con la punta de oro
  const pico = new THREE.Group();
  pico.position.y = 0.3;
  pico.rotation.z = -0.42;
  const pc = mesh(new THREE.CylinderGeometry(0.0045, 0.0062, 0.05, 10), M.silver, 0, 0.025, 0);
  pc.scale.set(1.35, 1, 0.7);
  pico.add(pc);
  pico.add(mesh(new THREE.CylinderGeometry(0.0052, 0.0047, 0.012, 10), M.gold, 0, 0.052, 0));
  fix.add(pico);
  const root = bake(fix);
  if (glow) {
    const halo = glowSprite(g, 0xd8e4ff, 0.6, 0.25);
    halo.position.y = 0.17;
    root.add(halo);
  }
  return root;
}

// El Agua: la pava enlozada celeste, con el pico, la tapa, el asa con la
// manija de madera y el vapor que sale.
export function buildPava(g) {
  const M = artMats(g);
  const fix = new THREE.Group();
  fix.add(mesh(lathe([[0, 0], [0.072, 0], [0.098, 0.012], [0.114, 0.045], [0.112, 0.08], [0.094, 0.108], [0.062, 0.126], [0.05, 0.13], [0.049, 0.134]], 24), M.enamel));
  // el borde oscuro de abajo y la boca
  fix.add(mesh(new THREE.TorusGeometry(0.072, 0.006, 6, 24).rotateX(Math.PI / 2), M.enamelChip, 0, 0.003, 0));
  fix.add(mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 20).rotateX(Math.PI / 2), M.enamelChip, 0, 0.133, 0));
  // saltaduras del enlozado
  const r = seeded(41);
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const y = 0.03 + r() * 0.06;
    const c = mesh(new THREE.CircleGeometry(0.006 + r() * 0.008, 7), M.enamelChip, Math.cos(a) * 0.1135, y, Math.sin(a) * 0.1135, 0, -a + Math.PI / 2, 0);
    c.position.multiplyScalar(1.004);
    c.position.y = y;
    fix.add(c);
  }
  // la tapa con la perilla
  fix.add(mesh(lathe([[0, 0.152], [0.018, 0.15], [0.042, 0.142], [0.052, 0.134], [0.05, 0.13]], 20), M.enamel));
  fix.add(mesh(new THREE.SphereGeometry(0.013, 10, 8), M.woodDark, 0, 0.158, 0));
  // el pico
  fix.add(tube([V(0.09, 0.04, 0), V(0.13, 0.07, 0), V(0.16, 0.115, 0), V(0.185, 0.15, 0)], 0.011, M.enamel, 16, 8));
  fix.add(mesh(new THREE.TorusGeometry(0.01, 0.003, 6, 12), M.enamelChip, 0.186, 0.152, 0, Math.PI / 2, 0, 0.5));
  // el asa (alambre) y la manija de madera
  fix.add(tube([V(0.048, 0.128, 0), V(0.05, 0.2, 0), V(0, 0.235, 0), V(-0.05, 0.2, 0), V(-0.055, 0.125, 0)], 0.004, M.ironDark, 24, 5));
  fix.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 8), M.woodDark, 0, 0.232, 0, 0, 0, Math.PI / 2));
  const root = new THREE.Group();
  const body = bake(fix);
  body.position.y = -0.08;
  root.add(body);
  root.scale.setScalar(1.55);
  const halo = glowSprite(g, 0x8fd0ff, 0.6, 0.25);
  root.add(halo);
  // el vapor del pico
  const steam = [];
  for (let i = 0; i < 4; i++) {
    const s = glowSprite(g, 0xe8f4ff, 0.08, 0);
    s.position.set(0.185, 0.07, 0);
    root.add(s);
    steam.push({ s, ph: i / 4 });
  }
  root.userData.tick = (dt, t) => {
    for (const S of steam) {
      const u = (t * 0.45 + S.ph) % 1;
      S.s.position.set(0.19 + u * 0.05, 0.075 + u * 0.18, Math.sin(t + S.ph * 6) * 0.01);
      S.s.scale.setScalar(0.05 + u * 0.12);
      S.s.material.opacity = Math.sin(u * Math.PI) * 0.28;
    }
  };
  return root;
}

// La Calabaza: el Primer Mate vacío, viejo y oscuro, con el tiento en el
// cuello y la boca sin virola.
export function buildCalabaza(g) {
  const M = artMats(g);
  const P = [[0, 0], [0.02, 0.002], [0.036, 0.012], [0.044, 0.032], [0.046, 0.052], [0.042, 0.072], [0.034, 0.086], [0.029, 0.093], [0.031, 0.1]];
  const S = 2.7;
  const fix = new THREE.Group();
  fix.add(mesh(lathe(P.map(([r, y]) => [r * S, y * S]), 26), M.gourdOld));
  // la pared de adentro de la boca
  fix.add(mesh(lathe([[0.031 * S, 0.1 * S], [0.028 * S, 0.1 * S], [0.027 * S, 0.085 * S]], 22), M.gourdOld));
  fix.add(mesh(new THREE.CircleGeometry(0.027 * S, 16).rotateX(-Math.PI / 2), M.ironDark, 0, 0.087 * S, 0));
  // el tiento de cuero en el cuello, con la vuelta colgando
  fix.add(mesh(new THREE.TorusGeometry(0.0305 * S, 0.0045, 6, 26).rotateX(Math.PI / 2), M.leather, 0, 0.09 * S, 0));
  fix.add(tube([V(0.031 * S, 0.09 * S, 0), V(0.05 * S, 0.075 * S, 0.01), V(0.052 * S, 0.05 * S, 0.02)], 0.004, M.leather, 10, 5));
  const root = new THREE.Group();
  const body = bake(fix);
  body.position.y = -0.13;
  root.add(body);
  const halo = glowSprite(g, 0xffd08a, 0.9, 0.38);
  root.add(halo);
  return root;
}

// El Sable de San Martín flotando de punta (para recibirlo en la Llama).
export function buildSableFloat(g) {
  const root = new THREE.Group();
  const s = sableModel(0);
  s.rotation.z = Math.PI;
  root.add(s);
  const halo = glowSprite(g, 0xfff0c8, 1.1, 0.22);
  halo.position.y = -0.4;
  root.add(halo);
  const mo = motes(g, { n: 8, col: 0xffe8b0, size: 0.04, r: 0.12, h: 0.9, mode: 'orbit', speed: 0.6, seed: 47 });
  mo.position.y = -0.45;
  root.add(mo);
  root.userData.tick = (dt, t) => mo.userData.tick(dt, t, 1);
  return root;
}

// ---------------- la Yerba Madre (tapera) ----------------
// Un arbusto de yerba mate de verdad: tronco retorcido, ramas y una copa de
// hojas lustrosas (instanciadas). Despierta brilla por dentro y la rodean
// luciérnagas; cada tajo le saca un tercio de la copa. Queda el tocón.
export function buildYerbaMadre(g) {
  const M = artMats(g);
  const r = seeded(61);
  const root = new THREE.Group();
  const crown = new THREE.Group();
  // el tocón (queda siempre)
  const stumpFix = new THREE.Group();
  stumpFix.add(mesh(lathe([[0, 0], [0.13, 0], [0.11, 0.06], [0.085, 0.2], [0.08, 0.32], [0, 0.31]], 10), M.bark));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.3;
    stumpFix.add(rod(V(0, 0.05, 0), V(Math.cos(a) * 0.24, -0.02, Math.sin(a) * 0.24), 0.04, 0.015, M.bark, 6));
  }
  const stump = bake(stumpFix, { shadow: true });
  root.add(stump);
  // el tronco de arriba y las ramas
  const fix = new THREE.Group();
  fix.add(tube([V(0, 0.28, 0), V(0.04, 0.55, 0.02), V(-0.02, 0.8, 0.05), V(0.03, 1.05, 0)], 0.065, M.bark, 16, 8));
  const tips = [];
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * TAU + r() * 0.5;
    const y0 = 0.5 + r() * 0.5;
    const len = 0.45 + r() * 0.3;
    const p0 = V(0.02, y0, 0.02);
    const p1 = V(Math.cos(a) * len * 0.5, y0 + 0.2 + r() * 0.15, Math.sin(a) * len * 0.5);
    const p2 = V(Math.cos(a) * len, y0 + 0.4 + r() * 0.35, Math.sin(a) * len);
    fix.add(tube([p0, p1, p2], 0.028 - b * 0.001, M.bark, 10, 6));
    tips.push(p2, p1.clone().lerp(p2, 0.4));
  }
  tips.push(V(0.03, 1.25, 0), V(0, 1.45, 0.05));
  crown.add(bake(fix, { shadow: true }));
  // la copa
  const leafM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, side: THREE.DoubleSide, emissive: 0x3cff7a, emissiveIntensity: 0 });
  const N = 640;
  const leaves = new THREE.InstancedMesh(leafGeo(0.12, 0.045), leafM, N);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const order = [];
  for (let i = 0; i < N; i++) {
    const c = tips[i % tips.length];
    const rad = 0.18 + r() * 0.24;
    const th = r() * TAU;
    const ph = Math.acos(1 - 2 * r());
    const p = V(c.x + Math.sin(ph) * Math.cos(th) * rad, c.y + Math.cos(ph) * rad * 0.8, c.z + Math.sin(ph) * Math.sin(th) * rad);
    e.set(r() * TAU, Math.atan2(p.x, p.z) + (r() - 0.5), r() * 1.2 - 0.6);
    q.setFromEuler(e);
    const s = 0.75 + r() * 0.5;
    mtx.compose(p, q, V(s, s, s));
    leaves.setMatrixAt(i, mtx);
    col.setHSL(0.27 + r() * 0.05, 0.45 + r() * 0.2, 0.17 + r() * 0.12);
    leaves.setColorAt(i, col);
    // el orden en que se van: primero los de afuera y arriba
    order.push({ i, k: p.y + Math.hypot(p.x, p.z) * 0.5 + r() * 0.3 });
  }
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  // (los tajos sacan hojas del final: ordenadas para que primero se vayan las de afuera)
  order.sort((a, b) => a.k - b.k);
  const sorted = new THREE.InstancedMesh(leaves.geometry, leafM, N);
  for (let j = 0; j < N; j++) {
    leaves.getMatrixAt(order[j].i, mtx);
    sorted.setMatrixAt(j, mtx);
    leaves.getColorAt(order[j].i, col);
    sorted.setColorAt(j, col);
  }
  sorted.castShadow = true;
  sorted.userData.keep = true;
  leaves.dispose();
  crown.add(sorted);
  // las luciérnagas
  const ff = motes(g, { n: 16, col: 0xc8ff70, size: 0.07, r: 1.0, h: 1.3, mode: 'orbit', speed: 0.25, seed: 67 });
  ff.position.y = 1.0;
  crown.add(ff);
  root.add(crown);
  return {
    root,
    crown,
    leafM,
    cut(n) {
      sorted.count = Math.round(N * Math.max(0, 1 - n / 3));
    },
    tick(dt, t, k) {
      ff.userData.tick(dt, t, k);
      crown.rotation.y = Math.sin(t * 0.4) * 0.03 * (1 + k);
    },
  };
}

// ---------------- la celda de la Bombilla (penal) ----------------
// La Bombilla en el aire, en el medio de la celda, sostenida por tres cadenas
// tirantes a tres argollas del piso. Cada corte suelta una: cae al piso.
// Los rumbos libres alrededor de `at` a R m: piso parejo y ninguna caja
// (pared, escalera, utilería) en el tramo de la argolla a la Bombilla.
export function freeAngles(g, at, R, H = 1.1, n = 24) {
  const w = g.world;
  const out = [];
  const hit = (x, y, z) => {
    // (las escaleras y rampas son piso, no cajas)
    if (w.floorAt(x, z, y + 0.6) > y - 0.03) return true;
    for (const b of w.boxes) {
      // (las de 'ground' son el terreno de abajo del piso)
      if (!b.active || !b.solid || b.kind === 'ground') continue;
      if (x <= b.x0 || x >= b.x1 || z <= b.z0 || z >= b.z1) continue;
      const fl = w.floorAt(x, z, y + 0.3);
      const y0 = b.y0 < 10 && b.kind !== 'prop' ? fl + b.y0 : b.y0;
      const y1 = b.y0 < 10 && b.kind !== 'prop' ? fl + b.y1 : b.y1;
      if (y > y0 && y < y1) return true;
    }
    return false;
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const ax = at.x + Math.cos(a) * R;
    const az = at.z + Math.sin(a) * R;
    if (Math.abs(w.floorAt(ax, az, at.y + 0.5) - at.y) > 0.08) continue;
    let ok = true;
    for (let k = 0; k <= 8 && ok; k++) {
      const u = k / 8;
      if (hit(at.x + Math.cos(a) * R * (1 - u), at.y + 0.12 + H * u, at.z + Math.sin(a) * R * (1 - u))) ok = false;
    }
    // y un poco más afuera de la argolla (que la chapa no quede contra la pared)
    if (ok && hit(at.x + Math.cos(a) * (R + 0.12), at.y + 0.3, at.z + Math.sin(a) * (R + 0.12))) ok = false;
    if (ok) out.push(a);
  }
  return out;
}
// tres rumbos de los libres, lo más abiertos posible
function pick3(list) {
  if (list.length < 3) return null;
  let best = null;
  let bs = -1;
  const gap = (a, b) => {
    const d = Math.abs(a - b) % TAU;
    return Math.min(d, TAU - d);
  };
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      for (let k = j + 1; k < list.length; k++) {
        const sc = Math.min(gap(list[i], list[j]), gap(list[j], list[k]), gap(list[i], list[k]));
        if (sc > bs) {
          bs = sc;
          best = [list[i], list[j], list[k]];
        }
      }
  return best;
}

export function buildCadenas(g, at) {
  const M = artMats(g);
  let R = 0.9;
  let ang = pick3(freeAngles(g, at, R));
  if (!ang) {
    R = 0.65;
    ang = pick3(freeAngles(g, at, R)) || [Math.PI / 2, Math.PI / 2 + TAU / 3, Math.PI / 2 + (2 * TAU) / 3];
  }
  const root = new THREE.Group();
  root.position.copy(at);
  const H = 1.15;
  const bomb = buildBombilla(g, { glow: false });
  bomb.scale.setScalar(1.3);
  bomb.position.y = H - 0.22;
  root.add(bomb);
  const halo = glowSprite(g, 0xc8d8ff, 0.8, 0.2);
  halo.position.y = H;
  root.add(halo);
  const linkGeo = new THREE.TorusGeometry(0.024, 0.0075, 6, 12);
  linkGeo.scale(1, 1.45, 1);
  const anchors = [];
  const chains = [];
  const fix = new THREE.Group();
  let total = 0;
  for (let c = 0; c < 3; c++) {
    const a = ang[c];
    const A = V(Math.cos(a) * R, 0.05, Math.sin(a) * R);
    const B = V(Math.cos(a) * 0.035, H - 0.06, Math.sin(a) * 0.035);
    // la argolla del piso: la chapa, los bulones y el aro
    fix.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), M.iron, A.x, 0.01, A.z, 0, a, 0));
    for (const [dx, dz] of [[-0.055, -0.055], [0.055, 0.055], [-0.055, 0.055], [0.055, -0.055]]) fix.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), M.ironDark, A.x + dx, 0.024, A.z + dz));
    const ringM = mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), M.iron, A.x, 0.05, A.z, 0, -a, 0);
    fix.add(ringM);
    anchors.push(A);
    const L = A.distanceTo(B);
    const n = Math.floor(L / 0.044);
    chains.push({ A, B, n, start: total, a });
    total += n;
  }
  // el collar de la Bombilla (de donde tiran las tres)
  fix.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 16).rotateX(Math.PI / 2), M.iron, 0, H - 0.06, 0));
  root.add(bake(fix));
  // los eslabones: los tirantes y los caídos (escondidos hasta el corte)
  const FALL = 12;
  // (fierro gastado, más claro que el piso: oscuras no se veían)
  const chainM = new THREE.MeshStandardMaterial({ color: 0x8a8278, metalness: 0.8, roughness: 0.42, map: g.textures?.metal || null });
  const links = new THREE.InstancedMesh(linkGeo, chainM, total + FALL * 3);
  links.userData.keep = true;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const up = V(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = (C, sag = 0.04) => {
    const dir = new THREE.Vector3().subVectors(C.B, C.A);
    for (let i = 0; i < C.n; i++) {
      const u = (i + 0.5) / C.n;
      const p = C.A.clone().addScaledVector(dir, u);
      p.y -= Math.sin(u * Math.PI) * sag;
      q.setFromUnitVectors(up, dir.clone().normalize());
      q2.setFromAxisAngle(up, (i % 2) * Math.PI / 2);
      mtx.compose(p, q.clone().multiply(q2), V(1, 1, 1));
      links.setMatrixAt(C.start + i, mtx);
    }
  };
  for (const C of chains) place(C);
  const r = seeded(83);
  for (let c = 0; c < 3; c++) {
    const C = chains[c];
    for (let i = 0; i < FALL; i++) {
      // la cadena suelta, amontonada al pie de su argolla
      const a = C.a + Math.PI + (r() - 0.5) * 1.2;
      const d = 0.06 + i * 0.04;
      const p = V(C.A.x + Math.cos(a) * d * 0.7, 0.012 + (i % 3) * 0.006, C.A.z + Math.sin(a) * d * 0.7);
      q.setFromEuler(new THREE.Euler(Math.PI / 2, r() * TAU, 0));
      mtx.compose(p, q, V(1, 1, 1));
      C.fall = C.fall || [];
      C.fall.push(mtx.clone());
      links.setMatrixAt(total + c * FALL + i, zero);
    }
  }
  links.instanceMatrix.needsUpdate = true;
  root.add(links);
  g.scene.add(root);
  const cut = [false, false, false];
  const api = {
    root,
    bomb,
    // n: cuántas cadenas cortadas (en orden)
    setCut(n) {
      for (let c = 0; c < 3; c++) {
        const C = chains[c];
        const off = c < n;
        if (off === cut[c]) continue;
        cut[c] = off;
        if (off) {
          for (let i = 0; i < C.n; i++) links.setMatrixAt(C.start + i, zero);
          for (let i = 0; i < FALL; i++) links.setMatrixAt(total + c * FALL + i, C.fall[i]);
        } else {
          place(C);
          for (let i = 0; i < FALL; i++) links.setMatrixAt(total + c * FALL + i, zero);
        }
      }
      links.instanceMatrix.needsUpdate = true;
    },
    // libre: la Bombilla de las cadenas se va (la que se agarra es la del Pickup)
    setFree(free) {
      bomb.visible = !free;
      halo.visible = !free;
    },
    tick(dt, t) {
      // con alguna cadena cortada tironea
      const loose = cut.filter(Boolean).length;
      bomb.rotation.z = Math.sin(t * 2.3) * 0.03 * loose;
      bomb.rotation.x = Math.sin(t * 1.7) * 0.02 * loose;
      halo.material.opacity = 0.16 + Math.sin(t * 2) * 0.05;
    },
  };
  return api;
}

// ---------------- los altares de la jura (castillo) ----------------
// El altar del caballero de cada naturaleza (world/castleDecor altarMate, el de
// los mates de la luz) más chico, y arriba, en la pileta, lo suyo: la llama,
// el viento, el rayo o el cristal. Apagado mientras nadie jura; jurando,
// fuerte; jurado, firme.
export function buildAltar(g, a, seed = 1) {
  const M = artMats(g);
  const root = new THREE.Group();
  root.position.copy(a.pos);
  const S = 0.52;
  const prop = buildProp({ type: 'altarMate', pos: [0, 0], kind: a.id }, g.world.M, 900 + seed)?.obj;
  if (prop) {
    // (unas 30 piezas: juntas por material, con su sombra)
    prop.position.set(0, 0, 0);
    prop.rotation.set(0, 0, 0);
    prop.scale.setScalar(S);
    const hold = new THREE.Group();
    hold.add(prop);
    root.add(bake(hold, { shadow: true }));
  }
  const top = 1.58 * S;
  const em = new THREE.Group();
  em.position.y = top + 0.22;
  root.add(em);
  const col = new THREE.Color(a.col);
  const halo = glowSprite(g, a.col, 1.2, 0.3);
  em.add(halo);
  let part = null;
  const r = seeded(seed * 13 + 5);
  if (a.id === 'fuego') {
    const geo = new THREE.PlaneGeometry(0.26, 0.42).translate(0, 0.16, 0);
    const f = new THREE.Group();
    for (const ry of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(geo, flameMaterial());
      p.rotation.y = ry + 0.4;
      p.renderOrder = 5;
      f.add(p);
    }
    f.position.y = -0.2;
    em.add(f);
    part = { f, tick: (t, k) => f.scale.set(k, k * (1 + Math.sin(t * 9) * 0.06), k) };
  } else if (a.id === 'viento') {
    const mo = motes(g, { n: 14, col: a.col, size: 0.07, r: 0.26, h: 0.3, mode: 'orbit', speed: 2.2, seed: 91 });
    em.add(mo);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 4, 40, Math.PI * 1.3), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ribbon.rotation.x = Math.PI / 2;
    em.add(ribbon);
    part = { tick: (t, k, dt) => { mo.userData.tick(dt, t, k); ribbon.rotation.z = t * 3; ribbon.material.opacity = 0.55 * k; } };
  } else if (a.id === 'rayo') {
    const N = 10;
    const pos = new Float32Array(N * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    geo.boundingSphere = new THREE.Sphere(V(0, 0, 0), 0.6);
    em.add(lines);
    const core = glowSprite(g, 0xfff6c0, 0.18, 0.9);
    em.add(core);
    let acc = 0;
    part = {
      tick: (t, k, dt) => {
        acc += dt;
        if (acc > 0.07) {
          acc = 0;
          let px = 0;
          let py = 0;
          let pz = 0;
          for (let i = 0; i < N; i++) {
            if (i % 3 === 0) px = py = pz = 0;
            const nx = px + (r() - 0.5) * 0.14;
            const ny = py + (r() - 0.5) * 0.14;
            const nz = pz + (r() - 0.5) * 0.14;
            pos.set([px, py, pz, nx, ny, nz], i * 6);
            px = nx;
            py = ny;
            pz = nz;
          }
          geo.attributes.position.needsUpdate = true;
        }
        lines.material.opacity = 0.9 * k * (0.6 + r() * 0.4);
        core.material.opacity = 0.9 * k;
      },
    };
  } else {
    const cg = lathe([[0, -0.16], [0.07, -0.1], [0.08, 0.08], [0.03, 0.15], [0, 0.17]], 6);
    const cr = new THREE.Mesh(cg, M.ice);
    em.add(cr);
    const small = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(cg, M.ice);
      s.scale.setScalar(0.4);
      em.add(s);
      small.push(s);
    }
    part = {
      tick: (t, k) => {
        cr.rotation.y = t * 0.6;
        cr.position.y = Math.sin(t * 1.2) * 0.03;
        cr.scale.setScalar(0.4 + 0.6 * k);
        small.forEach((s, i) => {
          const aa = t * 0.9 + (i / 3) * TAU;
          s.position.set(Math.cos(aa) * 0.2, Math.sin(t * 2 + i) * 0.04, Math.sin(aa) * 0.2);
          s.rotation.y = -t;
          s.visible = k > 0.5;
        });
      },
    };
  }
  g.scene.add(root);
  // state: 0 sin jurar, 1 jurando, 2 jurado
  let state = 0;
  let k = 0.3;
  return {
    root,
    set(s) {
      state = s;
    },
    tick(dt, t) {
      const want = state === 1 ? 1 + Math.sin(t * 6) * 0.15 : state === 2 ? 0.85 : 0.32;
      k += (want - k) * Math.min(1, dt * 3);
      halo.material.opacity = 0.32 * k;
      part.tick(t, Math.min(1, k), dt);
    },
  };
}

// La fuente que se deshiela: agua que sube sobre el hielo de la pileta, los
// anillos que se abren y la neblina.
export function buildDeshielo(g, at, R = 2.1) {
  const M = artMats(g);
  const root = new THREE.Group();
  root.position.copy(at);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.14, R - 0.14, 0.02, 8), M.water.clone());
  water.rotation.y = Math.PI / 8;
  water.position.y = 0.5;
  root.add(water);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.y = 0.515;
    root.add(m);
    rings.push({ m, ph: i / 3 });
  }
  const mist = motes(g, { n: 12, col: 0xdff2ff, size: 0.35, r: R * 0.8, h: 1.2, speed: 0.15, seed: 103 });
  mist.position.y = 0.5;
  root.add(mist);
  root.visible = false;
  g.scene.add(root);
  let on = 0;
  let k = 0;
  return {
    root,
    set(v, instant = false) {
      on = v ? 1 : 0;
      if (instant) k = on;
    },
    tick(dt, t) {
      k += (on - k) * Math.min(1, dt * 0.6);
      root.visible = k > 0.01;
      if (!root.visible) return;
      water.position.y = 0.46 + 0.05 * k;
      water.material.opacity = 0.8 * k;
      water.material.emissiveIntensity = 0.7 + Math.sin(t * 2.2) * 0.15;
      for (const Rg of rings) {
        const u = (t * 0.35 + Rg.ph) % 1;
        Rg.m.scale.setScalar(1 + u * (R * 3.2));
        Rg.m.material.opacity = (1 - u) * 0.35 * k;
      }
      mist.userData.tick(dt, t, k * 0.35);
    },
  };
}

// ---------------- las cavas de la laguna (la Calabaza) ----------------
// Un montículo de barro con piedritas en el fondo; el que toca larga
// burbujas. Cavado: queda el pozo con el barro corrido.
export function buildCava(g, at, seed = 1) {
  const M = artMats(g);
  const r = seeded(seed * 7 + 3);
  const root = new THREE.Group();
  root.position.copy(at);
  const moundG = new THREE.SphereGeometry(0.62, 16, 6, 0, TAU, 0, Math.PI / 2);
  const p = moundG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + Math.sin(p.getX(i) * 9 + seed) * 0.08 + Math.cos(p.getZ(i) * 7) * 0.08;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.32, p.getZ(i) * k);
  }
  moundG.computeVertexNormals();
  const mound = new THREE.Group();
  mound.add(mesh(moundG, M.mud, 0, -0.02, 0));
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const d = 0.2 + r() * 0.4;
    mound.add(mesh(new THREE.DodecahedronGeometry(0.04 + r() * 0.05, 0), M.pebble, Math.cos(a) * d, 0.12 - d * 0.18, Math.sin(a) * d, r(), r(), r()));
  }
  // el pozo: el borde de barro corrido y el fondo mojado
  const pit = new THREE.Group();
  const lip = new THREE.TorusGeometry(0.5, 0.13, 6, 18);
  lip.scale(1, 1, 0.35);
  pit.add(mesh(lip, M.mud, 0, 0.02, 0, Math.PI / 2, 0, 0));
  pit.add(mesh(new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2), M.mudWet, 0, -0.03, 0));
  const moundB = bake(mound);
  const pitB = bake(pit);
  pitB.visible = false;
  root.add(moundB, pitB);
  const bub = motes(g, { n: 8, col: 0xdfefff, size: 0.05, r: 0.25, h: 1.4, speed: 0.5, seed: seed * 11 + 1 });
  bub.position.y = 0.15;
  root.add(bub);
  g.scene.add(root);
  let active = false;
  return {
    root,
    setActive(v) {
      active = v;
    },
    dig(v = true) {
      moundB.visible = !v;
      pitB.visible = v;
      if (v) active = false;
    },
    tick(dt, t) {
      bub.userData.tick(dt, t, active ? 0.7 : 0);
    },
  };
}

// ---------------- la hoja de la Hoz y el asta (la guadaña) ----------------
// La hoja curva de la Hoz de la Muerte: fierro negro con el filo violeta y la
// espiga con sus remaches. Origen en la punta.
export function buildHojaHoz(g) {
  const M = artMats(g);
  const s = new THREE.Shape();
  // media luna: el lomo (de afuera) y el filo (de adentro), de la espiga a la punta
  const R1 = 0.44;
  const R2 = 0.4;
  const a0 = -0.15;
  const a1 = 2.35;
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    const x = Math.cos(a) * R1;
    const y = Math.sin(a) * R1;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const edge = [];
  for (let i = N; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / N;
    // el filo se abre hacia la espiga (la hoja es más ancha atrás)
    const u = i / N;
    const rr = R2 - (1 - u) * 0.07 + u * 0.035;
    const x = Math.cos(a) * rr + 0.035 * (1 - u);
    const y = Math.sin(a) * rr - 0.02 * (1 - u);
    s.lineTo(x, y);
    edge.push(V(x, y, 0));
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -0.004);
  const fix = new THREE.Group();
  fix.add(new THREE.Mesh(geo, M.bladeIron));
  // la espiga y los remaches
  fix.add(mesh(new THREE.BoxGeometry(0.14, 0.034, 0.014), M.ironDark, Math.cos(a0) * 0.42 + 0.06, Math.sin(a0) * 0.42 - 0.015, 0, 0, 0, a0));
  for (const dx of [0.04, 0.09]) fix.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), M.brass, Math.cos(a0) * 0.42 + dx, Math.sin(a0) * 0.42 - 0.012, 0, Math.PI / 2, 0, 0));
  const blade = bake(fix);
  const glow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.0045, 4, false), M.violet);
  glow.userData.keep = true;
  blade.add(glow);
  // el origen en la punta (para clavarla)
  const tip = V(Math.cos(a1) * R1, Math.sin(a1) * R1, 0);
  const root = new THREE.Group();
  blade.position.copy(tip).multiplyScalar(-1);
  root.add(blade);
  return root;
}

// El tacuaral de la orilla: once cañas con sus nudos y las hojas de arriba;
// la que se corta lleva atada una cinta colorada. Cortada: queda el tocón.
export function buildTacuaral(g, seed = 1) {
  const M = artMats(g);
  const r = seeded(seed * 17 + 9);
  const root = new THREE.Group();
  const fix = new THREE.Group();
  const leafTips = [];
  let chosen = null;
  for (let i = 0; i < 11; i++) {
    const a = r() * TAU;
    const d = i === 0 ? 0 : 0.18 + r() * 0.42;
    const h = i === 0 ? 3.1 : 2.2 + r() * 1.8;
    const rad = 0.024 + r() * 0.012;
    const lean = V((r() - 0.5) * 0.25 + Math.cos(a) * 0.08, 1, (r() - 0.5) * 0.25 + Math.sin(a) * 0.08).normalize();
    const base = V(Math.cos(a) * d, -0.05, Math.sin(a) * d);
    const geo = new THREE.CylinderGeometry(rad * 0.85, rad, h, 8, 1);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (h / 0.42));
    const m = new THREE.Mesh(geo, M.cane);
    m.position.copy(base).addScaledVector(lean, h / 2);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), lean);
    if (i === 0) {
      // la elegida, suelta (se va al cortarla)
      chosen = new THREE.Group();
      chosen.add(m);
      // la cinta colorada atada a la altura del pecho, con las dos puntas
      const ry = 1.25;
      const rp = base.clone().addScaledVector(lean, ry);
      chosen.add(mesh(new THREE.TorusGeometry(rad * 1.3, 0.013, 5, 14).rotateX(Math.PI / 2), M.red, rp.x, rp.y, rp.z));
      chosen.add(mesh(new THREE.TorusGeometry(rad * 1.3, 0.013, 5, 14).rotateX(Math.PI / 2), M.red, rp.x, rp.y - 0.035, rp.z));
      chosen.add(mesh(new THREE.PlaneGeometry(0.07, 0.48).translate(0, -0.24, 0), M.red, rp.x + rad, rp.y, rp.z, 0.1, 0.4, 0.15));
      chosen.add(mesh(new THREE.PlaneGeometry(0.06, 0.38).translate(0, -0.19, 0), M.red, rp.x + rad, rp.y, rp.z + 0.01, -0.05, -0.3, -0.12));
      chosen.userData.top = base.clone().addScaledVector(lean, h);
    } else fix.add(m);
    // las hojas: en el último tercio, en abanicos chicos
    for (let k = 0; k < 4; k++) {
      const p = base.clone().addScaledVector(lean, h * (0.7 + k * 0.09));
      leafTips.push({ p, a: r() * TAU, chosen: i === 0 });
    }
  }
  const stems = bake(fix, { shadow: true });
  root.add(stems);
  // las hojas, instanciadas (las de la elegida aparte)
  const lg = leafGeo(0.32, 0.03, 0.2);
  const mk = (list) => {
    const n = list.length * 5;
    const im = new THREE.InstancedMesh(lg, M.caneLeaf, n);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let j = 0;
    for (const L of list) {
      for (let f = 0; f < 5; f++) {
        q.setFromEuler(new THREE.Euler(1.1 + r() * 0.5, L.a + (f / 5) * TAU, 0));
        mtx.compose(L.p, q, V(1, 1, 1));
        im.setMatrixAt(j++, mtx);
      }
    }
    im.castShadow = true;
    im.userData.keep = true;
    return im;
  };
  root.add(mk(leafTips.filter((l) => !l.chosen)));
  chosen.add(mk(leafTips.filter((l) => l.chosen)));
  root.add(chosen);
  // el tocón de la elegida: la caña cortada en bisel
  const stump = new THREE.Group();
  const sg = new THREE.CylinderGeometry(0.03, 0.032, 0.34, 8);
  const sp = sg.attributes.position;
  for (let k = 0; k < sp.count; k++) if (sp.getY(k) > 0) sp.setY(k, sp.getY(k) + sp.getX(k) * 0.9);
  sg.computeVertexNormals();
  stump.add(mesh(sg, M.cane, 0, 0.12, 0));
  stump.add(mesh(new THREE.CircleGeometry(0.026, 8).rotateX(-Math.PI / 2), M.caneCut, 0, 0.29, 0, 0, 0, 0.73));
  stump.visible = false;
  root.add(stump);
  g.scene.add(root);
  return {
    root,
    setCut(v) {
      chosen.visible = !v;
      stump.visible = v;
    },
  };
}

// ---------------- los mates perdidos ----------------
// Cada uno es un mate de su mapa de origen (los de la armería: el viewmodel,
// sin la mano), grande para que se lea, con un halo violeta chico de la
// disformidad. Orden de Mates.SPOTS: claro, molino, tapera, penal, monumento,
// torre, castillo.
const LOST = ['algarrobo', 'porongo', 'camionero', 'lata', 'imperial', 'torpedo', 'campanario'];
export function buildLostMate(g, i) {
  const T = g.textures;
  const VMM = getMats(T);
  const hand = new Set([VMM.skin, VMM.nail, VMM.sleeve, VMM.cuff, VMM.glove]);
  const m = buildMate(LOST[i % LOST.length], false, T);
  const drop = [];
  m.root.traverse((o) => {
    if (o.isMesh && hand.has(o.material)) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  m.mate.rotation.set(0, 0, 0);
  m.root.rotation.set(0, 0, 0);
  // (la bombilla viene inclinada para apuntar con la mano: casi parada)
  // y más corta, de alpaca del mundo (la de la mano, con su reflejo, acá encandilaba)
  const W = artMats(g);
  for (const st of m.bombGroup?.children || []) {
    st.rotation.x = -0.26;
    st.scale.y = 0.72;
    st.traverse((o) => {
      if (o.isMesh) o.material = W.silver;
    });
  }
  m.root.scale.setScalar(2.4);
  // (unas 20 piezas por mate, siete mates en el mapa: juntas por material)
  const hold = new THREE.Group();
  hold.add(m.root);
  const root = new THREE.Group();
  root.add(bake(hold));
  const halo = glowSprite(g, 0xa070ff, 0.75, 0.22);
  halo.position.y = 0.14;
  root.add(halo);
  const mo = motes(g, { n: 5, col: 0xc8a8ff, size: 0.035, r: 0.2, h: 0.25, mode: 'orbit', speed: 0.7, seed: 200 + i });
  mo.position.y = 0.14;
  root.add(mo);
  root.userData.tick = (dt, t) => {
    mo.userData.tick(dt, t, 1);
    halo.material.opacity = 0.18 + Math.sin(t * 2 + i) * 0.06;
  };
  return root;
}

// ---------------- el Temple ----------------
// El brasero de la fragua: trípode de fierro con las patas curvas, la taza
// remachada y las brasas (que se prenden con el fuego de la etapa 2).
export function buildBrasero(g) {
  const M = artMats(g);
  const fix = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    fix.add(tube([V(Math.cos(a) * 0.12, 0.85, Math.sin(a) * 0.12), V(Math.cos(a) * 0.2, 0.45, Math.sin(a) * 0.2), V(Math.cos(a) * 0.34, 0.08, Math.sin(a) * 0.34), V(Math.cos(a) * 0.4, 0.02, Math.sin(a) * 0.4)], 0.022, M.iron, 16, 6));
    fix.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), M.iron, Math.cos(a) * 0.41, 0.03, Math.sin(a) * 0.41));
  }
  fix.add(mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 20).rotateX(Math.PI / 2), M.iron, 0, 0.55, 0));
  const bowl = new THREE.LatheGeometry([[0.08, 0.82], [0.26, 0.86], [0.42, 0.98], [0.47, 1.1], [0.5, 1.12], [0.48, 1.13], [0.44, 1.1], [0.4, 1.0], [0.24, 0.89], [0.06, 0.86]].map(([x, y]) => new THREE.Vector2(x, y)), 22);
  fix.add(new THREE.Mesh(bowl, M.iron));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    fix.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), M.ironDark, Math.cos(a) * 0.46, 1.06, Math.sin(a) * 0.46));
  }
  const root = bake(fix, { shadow: true });
  const coalM = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.9, emissive: 0xff5a18, emissiveMap: crackTex(), emissiveIntensity: 0 });
  const N = 22;
  const coals = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.075, 0), coalM, N);
  const r = seeded(131);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 0.36;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    const s = 0.7 + r() * 0.6;
    mtx.compose(V(Math.cos(a) * d, 1.02 + (0.36 - d) * 0.15 + r() * 0.03, Math.sin(a) * d), q, V(s, s * 0.8, s));
    coals.setMatrixAt(i, mtx);
  }
  coals.userData.keep = true;
  root.add(coals);
  return { root, coalM };
}

// La guadaña clavada en la muela (etapa 5, el hielo): el Desgarrador de punta
// en la piedra, con la escarcha que le crece al pie.
export function buildStuck(g) {
  const M = artMats(g);
  const root = new THREE.Group();
  const s = buildScythe(0, cosmicMats('world'));
  // la punta de la hoja para abajo, clavada en `at` (relativo a root), y el
  // asta que sube inclinada unos 50 grados
  const H = V(0, TOP_Y, 0);
  const tipL = s.tip.position.clone();
  const q1 = new THREE.Quaternion().setFromUnitVectors(tipL.clone().sub(H).normalize(), V(0, -1, 0));
  const sh = V(0, -1, 0).applyQuaternion(q1);
  const axis = new THREE.Vector3().crossVectors(sh, V(0, 1, 0));
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  axis.normalize();
  let best = null;
  for (const sg of [1, -1]) {
    const q2 = new THREE.Quaternion().setFromAxisAngle(axis, sg * 0.87);
    const q = q2.clone().multiply(q1);
    const up = V(0, -1, 0).applyQuaternion(q).y;
    if (!best || up > best.up) best = { q, up };
  }
  s.group.quaternion.copy(best.q);
  const at = V(0, 0.42, 1.0);
  s.group.position.copy(at).sub(tipL.clone().applyQuaternion(best.q));
  root.add(s.group);
  const cg = lathe([[0, 0], [0.05, 0.03], [0.055, 0.18], [0.02, 0.26], [0, 0.28]], 6);
  const r = seeded(151);
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU;
    const d = 0.08 + r() * 0.25;
    const c = mesh(cg, M.ice, at.x + Math.cos(a) * d, at.y - 0.05, at.z + Math.sin(a) * d, Math.cos(a) * 0.5, r() * 3, -Math.sin(a) * 0.5);
    c.scale.setScalar(0.6 + r() * 0.9);
    root.add(c);
  }
  const cold = glowSprite(g, 0x9ad8ff, 1.4, 0.3);
  cold.position.copy(at).add(V(0, 0.25, 0));
  root.add(cold);
  // (la hoja oscura contra la piedra oscura no se leía: un brillo violeta en el filo)
  const vio = glowSprite(g, 0xb27aff, 1.1, 0.35);
  vio.position.copy(s.mid.position).applyQuaternion(best.q).add(s.group.position);
  root.add(vio);
  const mo = motes(g, { n: 10, col: 0xdff4ff, size: 0.05, r: 0.5, h: 1.4, speed: 0.25, seed: 157 });
  mo.position.copy(at);
  root.add(mo);
  root.userData.tick = (dt, t) => {
    mo.userData.tick(dt, t, 1);
    cold.material.opacity = 0.25 + Math.sin(t * 1.5) * 0.06;
  };
  return root;
}

// La llama del desgarro (etapa 3, la llevan de la torre al algarrobo): una
// llama fría verde agua que tiembla, con su estela.
export function buildSpiritFlame(g, col = 0xa0ffd0) {
  const root = new THREE.Group();
  const core = glowSprite(g, 0xf0fff8, 0.12, 0.75);
  const halo = glowSprite(g, col, 0.5, 0.42);
  const tongue = glowSprite(g, col, 0.2, 0.65);
  tongue.position.y = 0.08;
  root.add(halo, core, tongue);
  const mo = motes(g, { n: 8, col, size: 0.05, r: 0.08, h: 0.4, speed: 0.7, seed: 163 });
  root.add(mo);
  root.userData.tick = (dt, t) => {
    const f = 1 + Math.sin(t * 19) * 0.1 + Math.sin(t * 7) * 0.08;
    core.scale.setScalar(0.12 * f);
    tongue.scale.set(0.15 * f, 0.28 * f, 1);
    halo.material.opacity = 0.4 + Math.sin(t * 5) * 0.06;
    mo.userData.tick(dt, t, 1);
  };
  return root;
}
