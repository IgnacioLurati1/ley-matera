import * as THREE from 'three';
import { VM, VM_POSE, registerMate } from './viewmodels';

// El Mate Meme (solo en el Challenge de la torre: sale en la caja y en la
// pared de la casita escondida, entities/TowerChallenge.js). Una calabaza de
// arcoíris con cara: sonrisa, cachetes y anteojos pixelados de "deal with it"
// que bajan cuando lo sacás; un molinete de colores que gira más rápido al
// tirar y confeti en cada tiro. El sonido del tiro es el mp3 que pone el
// usuario (public/assets/sotano/sfx/mate-meme.mp3, core/audio.js memeShot);
// hasta que esté, un "BOOM" sintetizado.
// Anda como el Mate 47 (config/weapons.js meme).

// hacia dónde mira la cara (giro del grupo; su +z es el frente)
const FACE_YAW = -1;

let bodyTex = null;
// La calabaza: franjas de arcoíris con brillitos (y el sello "MEME").
function memeTexture(up) {
  if (bodyTex?.[up]) return bodyTex[up];
  bodyTex = bodyTex || [];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  const cols = up ? ['#ff2d9a', '#ffcf2a', '#2affc0', '#2a9dff', '#b44aff', '#ff2d9a'] : ['#ff4b4b', '#ff9f2a', '#ffe93a', '#4bdc5a', '#3aa8ff', '#9a5aff'];
  const h = 128 / cols.length;
  cols.forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect(0, i * h, 256, h + 1);
  });
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(255,255,255,${(0.25 + Math.random() * 0.6).toFixed(2)})`;
    const s = 1 + Math.random() * 2.5;
    x.fillRect(Math.random() * 256, Math.random() * 128, s, s);
  }
  x.font = 'bold 22px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.lineWidth = 4;
  x.strokeStyle = '#000';
  x.fillStyle = '#fff';
  x.strokeText(up ? 'MOMAZO' : 'MEME', 64, 74);
  x.fillText(up ? 'MOMAZO' : 'MEME', 64, 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  bodyTex[up] = t;
  return t;
}

const cache = {};
function memeMats(up) {
  if (cache[up]) return cache[up];
  const tex = memeTexture(up);
  cache[up] = {
    body: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3, metalness: 0.2 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xff7aa8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 1, roughness: 0.2, emissive: 0x4a2a00, emissiveIntensity: 0.6 }),
    blades: [0xff4b4b, 0xffe93a, 0x3aa8ff, 0x4bdc5a].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })),
  };
  return cache[up];
}

// Los anteojos pixelados: cada lente es una grilla de cuadraditos negros con
// dos brillos blancos, y el puente arriba (como el meme).
function pixelGlasses(P) {
  const g = new THREE.Group();
  const px = 0.0042;
  const cube = new THREE.BoxGeometry(px, px, px * 0.8);
  // 0: nada, 1: negro, 2: brillo
  const rows = ['1111111111111111', '0111112211111120', '0011121111112100', '0001111000111100'];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '0') continue;
      const m = new THREE.Mesh(cube, row[i] === '2' ? P.white : P.black);
      m.position.set((i - row.length / 2 + 0.5) * px, -j * px, 0);
      g.add(m);
    }
  });
  return g;
}

function buildMeme(up, T) {
  const M = VM.mats(T);
  const P = memeMats(up);
  const prof = VM.PROFILES.calabaza;
  const top = VM.topOf(prof);
  const rAt = (y) => VM.profileRadius(prof, y);
  const mate = new THREE.Group();
  const body = VM.lathe(prof, P.body, 32);
  body.add(VM.lathe([[top.r, top.y], [top.r - 0.0025, top.y], [top.r - 0.0025, top.y - 0.03]], P.body));
  mate.add(body);
  const yerba = VM.yerba(top.r, top.y - 0.006, M);
  mate.add(yerba);
  const vir = VM.tor(top.r + 0.0012, 0.0032, up ? P.gold : M.silver, 8, 36);
  vir.rotation.x = Math.PI / 2;
  vir.position.y = top.y;
  mate.add(vir);
  // la cara: del lado que mira a la cámara (el -x del torno)
  const face = new THREE.Group();
  face.rotation.y = FACE_YAW;
  mate.add(face);
  const fr = rAt(0.055) + 0.0035;
  const glasses = pixelGlasses(P);
  glasses.position.set(0, 0.062, fr);
  face.add(glasses);
  const smile = VM.tor(0.012, 0.0018, P.black, 6, 20, Math.PI);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.036, rAt(0.036) + 0.0015);
  face.add(smile);
  for (const s of [-1, 1]) {
    const ch = VM.sph(0.0045, P.cheek, 8, 6);
    ch.scale.z = 0.35;
    ch.position.set(s * 0.02, 0.043, rAt(0.043) + 0.0006);
    face.add(ch);
  }
  // la mejorada: cadena de oro "bling" en el cuello
  if (up) {
    const chain = VM.tor(rAt(0.02) + 0.003, 0.0022, P.gold, 6, 40);
    chain.rotation.x = Math.PI / 2 + 0.25;
    chain.position.y = 0.022;
    mate.add(chain);
    const medal = VM.sph(0.006, P.gold, 10, 8);
    medal.position.set(0, 0.01, rAt(0.01) + 0.006);
    face.add(medal);
  }
  // el molinete de colores, clavado en la virola del lado de atrás
  const pin = new THREE.Group();
  pin.position.set(-top.r * 0.7, top.y + 0.012, -top.r * 0.5);
  mate.add(pin);
  const stick = VM.cyl(0.0012, 0.0012, 0.03, M.wood || P.black, 6);
  stick.position.y = 0.015;
  pin.add(stick);
  const wheel = new THREE.Group();
  wheel.position.y = 0.032;
  wheel.rotation.y = 0.6;
  pin.add(wheel);
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.014, 0.004, 0), new THREE.Vector3(0.012, 0.014, 0)]);
  tri.computeVertexNormals();
  P.blades.forEach((m, i) => {
    const b = new THREE.Mesh(tri, m);
    b.rotation.z = (i / 4) * Math.PI * 2;
    wheel.add(b);
  });
  const b = VM.bombilla({ len: 0.22, mat: up ? P.gold : M.silver, thick: 1.3 }, M, top.y);
  mate.add(b.group);
  mate.add(VM.cupHand(M, rAt, top.y));
  const mouth = new THREE.Object3D();
  mouth.position.set(0, top.y - 0.004, 0);
  mate.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(1.1 * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  b.tips[0].getWorldPosition(tip);
  return { root: tilt, muzzle: b.tips[0], anim: { spin: [], glow: [], wobble: null }, upgraded: !!up, tip, mouth, mate, bombGroup: b.group, yerba, meme: { glasses, gy: glasses.position.y, wheel, spin: 0, face } };
}

registerMate('meme', (up, T) => buildMeme(up ? 1 : 0, T));

// Cada cuadro, con el Mate Meme en la mano (entities/TowerChallenge.js): los
// anteojos bajan al sacarlo y el molinete gira (más rápido al tirar).
export function animateMeme(W, dt) {
  const m = W.model?.meme;
  if (!m) return;
  const raise = W.state === 'raise' ? Math.min(1, W.stateT / 0.55) : 1;
  const k = raise * raise * (3 - 2 * raise);
  m.glasses.position.y = m.gy + (1 - k) * 0.07;
  m.glasses.rotation.z = (1 - k) * 0.5;
  const firing = W.fireCd > 0 || W.g?.input?.mouse?.left;
  m.spin += dt * (firing ? 38 : 6);
  m.wheel.rotation.z = m.spin;
}

// Confeti y estrellitas en cada tiro (Weapons.fire, st.meme).
export function memeFx(g, muzzle, fwd, up) {
  const cols = up ? [[1, 0.2, 0.6], [1, 0.8, 0.2], [0.2, 1, 0.75], [0.7, 0.3, 1]] : [[1, 0.3, 0.3], [1, 0.9, 0.2], [0.3, 0.9, 0.35], [0.25, 0.65, 1], [0.6, 0.35, 1]];
  const n = up ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const s = 2.5 + Math.random() * 4;
    g.fx.alpha.spawn(muzzle.x, muzzle.y, muzzle.z, fwd.x * s + (Math.random() - 0.5) * 2.5, fwd.y * s + Math.random() * 2, fwd.z * s + (Math.random() - 0.5) * 2.5, { color: cols[i % cols.length], size: 0.035, size1: 0.03, life: 0.9 + Math.random() * 0.5, alpha: 1, gravity: 5, drag: 1.5, bounce: 0.3 });
  }
  g.fx.flash(muzzle, up ? 0xff5ad8 : 0x7ad0ff, 5, 0.05, 6);
}
