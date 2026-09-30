import * as THREE from 'three';
import { WEAPONS } from '../config/weapons';
import { VM, VM_POSE, registerMate } from './viewmodels';
import { flameMaterial } from '../world/castleFire';

// Los potenciadores de mano de cada mapa que no son un mate que tira balas:
//  · Piedra de Molino (el molino): cada clic tira una piedra de moler entera
//    que sale rodando por el piso y aplasta a todos los muertos que encuentra
//    (sin límite), levanta tierra y hace temblar todo. Rebota una vez contra la
//    pared y a los ~3 segundos (o al segundo golpe, o contra un jefe) se parte.
//  · Mate Dragón (el castillo): una calabaza de escamas con cabeza de dragón.
//    Mantenido echa fuego en cono (quema a todo lo que agarra adelante); con el
//    derecho escupe una bola de fuego que revienta y deja el piso ardiendo.
// Weapons (weapons/Weapons.js) le pasa el gatillo cuando el arma temporal es
// una de estas (input), cada cuadro (update) y el final (clear). El daño va por
// zombies.damage (en línea ya le avisa al anfitrión); los demás ven cada tiro
// como un "fantasma" (ghost): los mismos efectos y sonidos, sin daño.

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
// lo que dura el rugido del Mate Dragón al agarrarlo
const ROAR = 1.8;
// El Mate Dragón suena con los grabados del dragón grande (el chorro y el
// rugido: fx/DragonFire.js) y las bolas de fuego del Pillán (core/weaponSfx.js),
// mucho más bajos que en el dragón (ese se oye de lejos). Si no bajaron, los
// sintetizados.
const DRAGON_SFX = { breath: 0.66, ball: 1.09, roar: 0.87 };
const tmpO = new THREE.Vector3();
const hitTmp = {};
const near = [];
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

// ---------------- materiales y modelos ----------------
const cache = {};
const once = (k, make) => cache[k] || (cache[k] = make());

// Granito gris moteado (el costado de la piedra y los pedazos).
function graniteTex() {
  return once('granite', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#8a8680';
    x.fillRect(0, 0, 256, 256);
    let seed = 5;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) {
      const v = (90 + r() * 110) | 0;
      x.fillStyle = `rgba(${v},${(v * 0.97) | 0},${(v * 0.92) | 0},${0.35 + r() * 0.5})`;
      x.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// La cara de moler: granito con las estrías (el picado en "arpa") y el ojo
// cuadrado del medio.
function faceTex() {
  return once('face', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.drawImage(graniteTex().image, 0, 0);
    x.strokeStyle = 'rgba(40,36,32,0.55)';
    x.lineCap = 'round';
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        // cada sector: surcos paralelos que salen del ojo hacia el borde
        const off = (j - 2) * 0.09;
        const a = a0 + off;
        x.lineWidth = j === 2 ? 3 : 1.6;
        x.beginPath();
        x.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
        x.lineTo(128 + Math.cos(a0 + off * 0.4) * 122, 128 + Math.sin(a0 + off * 0.4) * 122);
        x.stroke();
      }
    }
    x.strokeStyle = 'rgba(30,26,22,0.8)';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(128, 128, 124, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#1a1612';
    x.fillRect(108, 108, 40, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// (la de la mano, más oscura: la escena de la mano tiene su propia luz, más fuerte)
function stoneMats(vm = false) {
  const tint = vm ? 0x9a948c : 0xffffff;
  return once(vm ? 'stoneMatsVm' : 'stoneMats', () => ({
    side: new THREE.MeshStandardMaterial({ map: graniteTex(), color: tint, roughness: 0.92 }),
    face: new THREE.MeshStandardMaterial({ map: faceTex(), color: tint, roughness: 0.88 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 }),
  }));
}

// Una piedra de moler con el eje a lo largo de X (así rueda hacia +z).
function stoneMesh(R, W, vm = false) {
  const S = stoneMats(vm);
  const g = new THREE.Group();
  const geo = once(`stone${R}|${W}`, () => new THREE.CylinderGeometry(R, R, W, 30, 1).rotateZ(Math.PI / 2));
  const m = new THREE.Mesh(geo, [S.side, S.face, S.face]);
  g.add(m);
  // el taco de madera del ojo, asomando de las dos caras
  const eye = new THREE.Mesh(once(`eye${R}|${W}`, () => new THREE.BoxGeometry(W * 1.18, R * 0.28, R * 0.28)), S.wood);
  g.add(eye);
  return g;
}

// Escamas de dragón: verde oscuro con bordes dorados.
function scaleTex() {
  return once('scales', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1e3a24';
    x.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cx = col * 16 + (row % 2 ? 8 : 0);
        const cy = row * 16;
        const gr = x.createRadialGradient(cx, cy + 4, 1, cx, cy + 4, 11);
        gr.addColorStop(0, '#3e7a44');
        gr.addColorStop(0.75, '#24482a');
        gr.addColorStop(1, '#b08a3a');
        x.fillStyle = gr;
        x.beginPath();
        x.arc(cx, cy + 4, 9, 0, Math.PI);
        x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return t;
  });
}

function dragonMats() {
  return once('dragonMats', () => ({
    scales: new THREE.MeshStandardMaterial({ map: scaleTex(), roughness: 0.45, metalness: 0.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0x2a5230, roughness: 0.5, metalness: 0.15 }),
    horn: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc640, metalness: 1, roughness: 0.25 }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd040).multiplyScalar(2.2), toneMapped: false }),
    ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a18).multiplyScalar(2.4), toneMapped: false }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x100804 }),
    wing: new THREE.MeshStandardMaterial({ color: 0x24482a, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }),
  }));
}

// El brillo de las escamas cuando echa fuego: los bordes, como brasas.
function heatTex() {
  return once('heat', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cx = col * 16 + (row % 2 ? 8 : 0);
        const cy = row * 16;
        const gr = x.createRadialGradient(cx, cy + 4, 1, cx, cy + 4, 11);
        gr.addColorStop(0, '#000');
        gr.addColorStop(0.6, '#2a0800');
        gr.addColorStop(1, '#ffb050');
        x.fillStyle = gr;
        x.beginPath();
        x.arc(cx, cy + 4, 9, 0, Math.PI);
        x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return t;
  });
}

// Los de la mano: las escamas y las alas se ponen al rojo cuando echa fuego.
function dragonVmMats() {
  return once('dragonVm', () => ({
    scales: new THREE.MeshStandardMaterial({ map: scaleTex(), emissiveMap: heatTex(), emissive: 0xff5a14, emissiveIntensity: 0.1, roughness: 0.45, metalness: 0.2 }),
    wing: new THREE.MeshStandardMaterial({ color: 0x24482a, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, emissive: 0xff4a10, emissiveIntensity: 0 }),
  }));
}

// Un ala de murciélago: la membrana y los dedos de oro, abierta hacia +x. s: escala.
function dragonWing(s, mat) {
  const D = dragonMats();
  const pivot = new THREE.Group();
  const W = [0.034, 0.05];
  const tips = [[0.078, 0.04], [0.084, 0.012], [0.066, -0.014]];
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(W[0] * s, W[1] * s);
  sh.lineTo(tips[0][0] * s, tips[0][1] * s);
  // los festones de la membrana entre dedo y dedo
  sh.quadraticCurveTo(0.058 * s, 0.03 * s, tips[1][0] * s, tips[1][1] * s);
  sh.quadraticCurveTo(0.056 * s, 0.006 * s, tips[2][0] * s, tips[2][1] * s);
  sh.quadraticCurveTo(0.036 * s, -0.004 * s, 0.006 * s, -0.012 * s);
  sh.lineTo(0, 0);
  pivot.add(new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), mat));
  const bone = (a, b, r) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * s;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6 * s, r * s, len, 5), D.gold);
    m.position.set(((a[0] + b[0]) / 2) * s, ((a[1] + b[1]) / 2) * s, 0);
    m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
    pivot.add(m);
  };
  bone([0, 0], W, 0.0026);
  for (const tip of tips) bone(W, tip, 0.0016);
  // la garra del codo
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.0022 * s, 0.009 * s, 4), D.horn);
  claw.position.set(W[0] * s, (W[1] + 0.005) * s, 0);
  pivot.add(claw);
  return pivot;
}

// La cola: da vuelta alrededor de la calabaza (rAt: el radio a cada altura),
// con púas de oro y la punta en pala.
function dragonTail(rAt, mat) {
  const D = dragonMats();
  const g = new THREE.Group();
  const seg = once('tailSeg', () => new THREE.SphereGeometry(1, 10, 8));
  const spike = once('tailSpike', () => new THREE.ConeGeometry(1, 1, 4));
  const n = 16;
  let a = 0;
  let y = 0;
  let R = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    y = 0.084 - u * 0.036;
    a = 0.3 + u * 4.2;
    const r = 0.0105 - u * 0.007;
    R = rAt(y) + r * 0.55;
    const m = new THREE.Mesh(seg, mat);
    m.position.set(Math.sin(a) * R, y, Math.cos(a) * R);
    m.scale.set(r * 1.3, r * 0.9, r);
    m.rotation.y = a;
    g.add(m);
    if (i % 2 === 0 && i < n - 2) {
      const sp = new THREE.Mesh(spike, D.gold);
      sp.rotation.order = 'YXZ';
      sp.rotation.set(0.9, a, 0);
      sp.scale.set(r * 0.45, r * 1.5, r * 0.45);
      sp.position.set(Math.sin(a) * (R + r * 0.6), y + r * 0.6, Math.cos(a) * (R + r * 0.6));
      g.add(sp);
    }
  }
  // la pala de la punta
  const tip = new THREE.Mesh(once('tailTip', () => new THREE.OctahedronGeometry(1, 0)), D.gold);
  a += 0.22;
  tip.position.set(Math.sin(a) * R, y - 0.002, Math.cos(a) * R);
  tip.rotation.y = a;
  tip.scale.set(0.009, 0.006, 0.0025);
  g.add(tip);
  return g;
}

// La cabeza de dragón (mirando a -z). s: escala. Devuelve { g, jaw, ember, eyes, tip }.
function dragonHead(s) {
  const D = dragonMats();
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sc = null, to = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * s, y * s, z * s);
    m.rotation.set(rx, ry, rz);
    if (sc) m.scale.set(...sc);
    to.add(m);
    return m;
  };
  // cráneo y hocico de arriba
  add(new THREE.SphereGeometry(0.03 * s, 14, 10), D.head, 0, 0.012, 0.004, 0, 0, 0, [1, 0.85, 1.1]);
  add(new THREE.BoxGeometry(0.036 * s, 0.018 * s, 0.05 * s), D.head, 0, 0.012, -0.034, 0.12);
  add(new THREE.BoxGeometry(0.03 * s, 0.01 * s, 0.03 * s), D.head, 0, 0.02, -0.022, 0.25);
  // cejas y ojos que brillan
  const eyes = [];
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.012 * s, 0.006 * s, 0.02 * s), D.head, sx * 0.014, 0.027, -0.006, 0.3, sx * 0.3, 0);
    eyes.push(add(new THREE.SphereGeometry(0.0055 * s, 8, 6), D.eye, sx * 0.0155, 0.02, -0.01));
    // la pupila de reptil, finita y parada
    add(new THREE.BoxGeometry(0.0013 * s, 0.0078 * s, 0.002 * s), D.pupil, sx * 0.0162, 0.02, -0.0152, 0, sx * 0.35, 0);
    // cuernos para atrás, con la punta que se curva para arriba
    add(new THREE.ConeGeometry(0.006 * s, 0.05 * s, 6), D.horn, sx * 0.014, 0.034, 0.03, 1.15, 0, -sx * 0.25);
    add(new THREE.ConeGeometry(0.0032 * s, 0.026 * s, 6), D.horn, sx * 0.0215, 0.047, 0.061, 0.55, 0, -sx * 0.35);
    // las aletas de oro de los cachetes
    for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(0.0026 * s, 0.017 * s, 4), D.gold, sx * (0.02 + k * 0.001), 0.009 - k * 0.006, 0.012 + k * 0.004, 1.35, 0, -sx * (0.7 + k * 0.15));
    // narinas
    add(new THREE.SphereGeometry(0.003 * s, 6, 4), D.ember, sx * 0.008, 0.019, -0.058);
    // dientes de arriba
    for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(0.0022 * s, 0.009 * s, 4), D.horn, sx * (0.006 + k * 0.004), 0.0015, -0.054 + k * 0.009, Math.PI);
  }
  // la cresta
  for (let k = 0; k < 4; k++) add(new THREE.ConeGeometry(0.004 * s, 0.014 * s, 4), D.gold, 0, 0.038 - k * 0.002, 0.012 + k * 0.012, -0.5);
  // la mandíbula (se abre para echar fuego)
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.002 * s, 0.006 * s);
  g.add(jaw);
  add(new THREE.BoxGeometry(0.03 * s, 0.009 * s, 0.05 * s), D.head, 0, -0.004, -0.03, 0, 0, 0, null, jaw);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(new THREE.ConeGeometry(0.002 * s, 0.008 * s, 4), D.horn, sx * (0.0055 + k * 0.0035), 0.003, -0.05 + k * 0.009, 0, 0, 0, null, jaw);
  // la brasa en la garganta
  const ember = add(new THREE.SphereGeometry(0.009 * s, 10, 8), D.ember, 0, 0.004, -0.02);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.006 * s, -0.064 * s);
  g.add(tip);
  // la lengua de fuego (dos planos cruzados con la llama del castillo), apagada
  const tongue = new THREE.Group();
  tongue.position.copy(tip.position);
  const fgeo = new THREE.PlaneGeometry(0.045 * s, 0.13 * s).translate(0, 0.065 * s, 0).rotateX(-Math.PI / 2);
  for (const rz of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(fgeo, flameMaterial());
    f.rotation.z = rz;
    f.renderOrder = 5;
    tongue.add(f);
  }
  tongue.visible = false;
  g.add(tongue);
  return { g, jaw, ember, eyes, tip, tongue };
}

// En la mano: la Piedra de Molino agarrada del canto con las dos manos.
registerMate('piedra', (up, T) => {
  const g = new THREE.Group();
  const R = 0.13;
  const W = 0.06;
  const inner = new THREE.Group();
  const stone = stoneMesh(R, W, true);
  // la cara de moler mirando para acá (un poco de costado, que se vea el canto)
  stone.rotation.set(-0.18, Math.PI / 2 - 0.35, 0);
  inner.add(stone);
  const M = VM.mats(T);
  if (VM.wrapHand) {
    for (const sx of [1, -1]) {
      const h = VM.wrapHand(M, { radius: W * 0.5, y0: -0.05, side: sx > 0 ? 0 : Math.PI, dir: sx, arm: new THREE.Vector3(sx * 0.55, -0.75, 0.4), scale: 1.05 });
      h.position.set(sx * R, 0, 0);
      inner.add(h);
    }
  }
  g.add(inner);
  // al medio y abajo de la vista (el grupo del arma arranca a la derecha)
  g.position.set(-0.19, -0.03, 0.03);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -R);
  inner.add(muzzle);
  g.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: g, muzzle, anim: { spin: [], glow: [], wobble: null }, upgraded: false, tip, mouth: null, mate: inner, bombGroup: null, yerba: null, piedra: inner };
});

// En la mano: el Mate Dragón (calabaza de escamas, la cabeza en la boca del mate).
registerMate('dragon', (up, T) => {
  const M = VM.mats(T);
  const D = dragonMats();
  const H = dragonVmMats();
  const mate = new THREE.Group();
  const prof = VM.PROFILES.calabaza;
  const top = VM.topOf(prof);
  const rAt = (y) => VM.profileRadius(prof, y);
  mate.add(VM.lathe(prof, H.scales));
  // la cola enroscada y las alitas plegadas en la espalda (se abren cuando ruge o echa fuego)
  const tail = dragonTail(rAt, H.scales);
  mate.add(tail);
  const wings = [-1, 1].map((sx) => {
    const w = dragonWing(1, H.wing);
    const hold = new THREE.Group();
    hold.position.set(sx * 0.024, 0.074, 0.03);
    hold.scale.x = sx;
    hold.add(w);
    mate.add(hold);
    return { pivot: w, sx };
  });
  // el humito de las narinas (en reposo)
  const smoke = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0x8a8580, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.ph = i / 3;
    return s;
  });
  // virola de oro y el cuello saliendo de la boca
  const ring = VM.tor(top.r, 0.004, D.gold, 6, 24);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = top.y;
  mate.add(ring);
  const neck = VM.cyl(0.017, 0.022, 0.03, D.head, 12);
  neck.position.set(0, top.y + 0.012, 0.004);
  neck.rotation.x = -0.35;
  mate.add(neck);
  const head = dragonHead(1.35);
  head.g.position.set(0, top.y + 0.034, -0.004);
  // mirando hacia el centro de la pantalla, un poco de perfil: se ve el hocico y los dientes
  head.g.rotation.set(0.1, 0.35, 0);
  mate.add(head.g);
  for (const s of smoke) head.g.add(s);
  mate.add(VM.cupHand(M, rAt, top.y));
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  const tilt = new THREE.Group();
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(1.1 * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  head.tip.getWorldPosition(tip);
  return { root: tilt, muzzle: head.tip, anim: { spin: [], glow: [], wobble: null }, upgraded: false, tip, mouth: null, mate, bombGroup: null, yerba: null, dragon: { ...head, wings, tail, smoke, heat: H, s: 1.35 } };
});

// El modelo del potenciador tirado en el piso (entities/Powerups.js).
export function pickupModel(type) {
  const g = new THREE.Group();
  if (type === 'piedra') {
    const s = stoneMesh(0.22, 0.1);
    g.add(s);
    return g;
  }
  const D = dragonMats();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), D.scales);
  body.scale.set(1, 0.95, 1);
  body.position.y = -0.06;
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 20), D.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  const h = dragonHead(3.2);
  h.g.position.y = 0.08;
  h.g.rotation.y = Math.PI;
  g.add(h.g);
  // las alas abiertas, atrás de la cabeza
  for (const sx of [-1, 1]) {
    const hold = new THREE.Group();
    hold.position.set(sx * 0.07, 0.03, -0.06);
    hold.scale.x = sx;
    const w = dragonWing(2.6, D.wing);
    w.rotation.set(-0.25, -0.35, 0.3);
    hold.add(w);
    g.add(hold);
  }
  return g;
}

// ---------------- en uso ----------------
export default class Especiales {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    this.stones = [];
    this.chunks = [];
    this.balls = [];
    this.patches = [];
    this.remote = [];
    this.breathing = false;
    this.inputT = -1;
    this.tickT = 0;
    this.fbCd = 0;
    this.sndT = 0;
    this.shareT = 0;
    this.flameAcc = 0;
    this.throwT = 9;
    this.jaw = 0;
    // el dragón de la mano: calor de las escamas, el rugido, el culatazo de la bola
    this.heat = 0;
    this.roarT = 0;
    this.kick = 0;
    this.wings = 0;
    this.tempRef = null;
    this.wasBreathing = false;
    this.rings = [];
    this.after = [];
  }

  // Lo llama Weapons.handleInput con un arma temporal en la mano; true si era una de estas.
  input(input, st, p) {
    if (st.kind !== 'especial') return false;
    const w = this.w;
    this.inputT = this.g.time;
    if (w.state === 'reload') w.state = 'idle';
    if (w.state !== 'idle' || p.sprinting) {
      this.breathing = false;
      return true;
    }
    if (st.id === 'piedra') {
      if (input.mouse.left && w.fireCd <= 0) this.throwStone(st);
    } else if (st.id === 'dragon') {
      this.breathing = !!input.mouse.left;
      if (input.mouse.rightPressed && this.fbCd <= 0) this.spitFireball(st);
    }
    return true;
  }

  // ---------------- Piedra de Molino ----------------
  throwStone(st) {
    const g = this.g;
    const w = this.w;
    const S = st.stone;
    w.fireCd = 60 / st.rpm;
    const P = g.player.pos;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
    fwd.normalize();
    // sale adelante del jugador (si hay pared encima, pegada a ella)
    let ahead = 1.3;
    const wall = g.world.raycast(tmpO.set(P.x, P.y + 0.6, P.z), fwd, ahead + S.radius, hitTmp);
    if (wall < ahead + S.radius) ahead = Math.max(0, wall - S.radius - 0.05);
    const start = new THREE.Vector3(P.x + fwd.x * ahead, 0, P.z + fwd.z * ahead);
    start.y = g.world.floorAt(start.x, start.z, P.y + 0.5);
    this.addStone(start, fwd.x * S.speed, fwd.z * S.speed, st, false);
    g.net?.share('esp', { k: 'piedra', p: r2(start), v: [+(fwd.x * S.speed).toFixed(2), +(fwd.z * S.speed).toFixed(2)] });
    w.recoilKick = Math.min(1.5, w.recoilKick + 1);
    g.player.addRecoil(0.05, 0);
    g.fx.addShake(0.15);
    g.stats.shots++;
    this.throwT = 0;
  }

  addStone(pos, vx, vz, st, ghost) {
    const g = this.g;
    const S = st.stone;
    const R = S.radius;
    const mesh = new THREE.Group();
    const roll = stoneMesh(R, R * 0.55);
    mesh.add(roll);
    mesh.position.set(pos.x, pos.y + R, pos.z);
    mesh.rotation.y = Math.atan2(vx, vz);
    g.scene.add(mesh);
    this.stones.push({ S, R, mesh, roll, vel: new THREE.Vector3(vx, 0, vz), t: 0, bounces: 1, hit: new Set(), ghost, dustT: 0, sndT: 0 });
    this.sndThrow(mesh.position);
    g.fx.dirt?.(pos, 10);
  }

  stepStone(s, dt) {
    const g = this.g;
    const R = s.R;
    const pos = s.mesh.position;
    s.t += dt;
    if (s.t > s.S.life) return this.breakStone(s);
    const sp = Math.hypot(s.vel.x, s.vel.z);
    const step = sp * dt;
    const dir = tmpV.set(s.vel.x / sp, 0, s.vel.z / sp);
    const base = pos.y - R;
    // pared adelante: rebota una vez; la segunda se parte
    const wall = g.world.raycast(tmpO.set(pos.x, base + 0.5, pos.z), dir, R + step, hitTmp);
    if (wall < R + step && hitTmp.normal && Math.abs(hitTmp.normal.y) < 0.5) {
      if (s.bounces <= 0) return this.breakStone(s);
      s.bounces--;
      const n = tmpV2.set(hitTmp.normal.x, 0, hitTmp.normal.z).normalize();
      const vn = s.vel.dot(n);
      s.vel.addScaledVector(n, -2 * vn).multiplyScalar(0.85);
      s.mesh.rotation.y = Math.atan2(s.vel.x, s.vel.z);
      const at = tmpO.set(pos.x + dir.x * R, base + 0.4, pos.z + dir.z * R);
      g.fx.dust(at, n, [0.5, 0.46, 0.4], 14);
      g.fx.sparks(at, 1, n, [1, 0.8, 0.5]);
      this.shakeNear(pos, 0.35, 12);
      this.sndThud(pos);
    } else {
      pos.x += s.vel.x * dt;
      pos.z += s.vel.z * dt;
    }
    // sigue el piso
    const fy = g.world.floorAt(pos.x, pos.z, base + 0.6);
    pos.y += (fy + R - pos.y) * Math.min(1, dt * 14);
    // rueda y se bambolea
    s.roll.rotation.x += step / R;
    s.mesh.rotation.z = Math.sin(s.t * 9) * 0.04;
    // aplasta (el de otro jugador solo se ve)
    if (!s.ghost) {
      for (const { z } of g.zombies.inRadius(tmpO.set(pos.x, fy + 0.2, pos.z), R + 0.7, near)) {
        if (s.hit.has(z)) continue;
        const dx = z.pos.x - pos.x;
        const dz = z.pos.z - pos.z;
        const reach = R * 0.9 + 0.35 * (z.scale || 1);
        if (dx * dx + dz * dz > reach * reach) continue;
        s.hit.add(z);
        if (this.crush(z, s)) return this.breakStone(s);
      }
    }
    // la polvareda de atrás y el temblor
    s.dustT -= dt;
    if (s.dustT <= 0) {
      s.dustT = 0.045;
      const ux = s.vel.x / sp;
      const uz = s.vel.z / sp;
      for (const side of [-1, 1]) {
        const bx = pos.x - ux * R * 0.3 - uz * side * R * 0.45;
        const bz = pos.z - uz * R * 0.3 + ux * side * R * 0.45;
        g.fx.alpha.spawn(bx, fy + 0.12, bz, -uz * side * (1 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.9, ux * side * (1 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6, {
          color: [0.52, 0.47, 0.4],
          size: 0.25,
          size1: 1.3,
          life: 0.7 + Math.random() * 0.5,
          alpha: 0.24,
          drag: 2,
        });
      }
      if (Math.random() < 0.35) g.fx.dirt?.(tmpO.set(pos.x, fy, pos.z), 3);
    }
    this.shakeNear(pos, dt * 0.9, 8);
    s.sndT -= dt;
    if (s.sndT <= 0) {
      s.sndT = 0.12;
      this.sndRoll(pos);
    }
    return false;
  }

  // Un muerto bajo la piedra. Devuelve true si la piedra se parte (un jefe).
  crush(z, s) {
    const g = this.g;
    const k = z.scale || 1;
    const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 0.9 * k, z.pos.z);
    const dir = s.vel.clone().normalize();
    const big = z.boss || k > 1.6;
    const amount = big ? s.S.boss : Math.max(60000, (z.maxHp || 0) * 3);
    g.zombies.damage(z, amount, { type: 'explosive', zone: 'torso', point, dir, pup: WEAPONS.piedra.bossMult });
    g.fx.blood(point, { x: dir.x * 2, y: 1.6, z: dir.z * 2 }, 22, 1.5);
    if (!big) {
      for (let i = 0; i < 3; i++) g.fx.gib(point, new THREE.Vector3(dir.x * 4 + (Math.random() - 0.5) * 3, 3 + Math.random() * 3, dir.z * 4 + (Math.random() - 0.5) * 3));
      g.fx.decal(1, { x: z.pos.x, y: (z.pos.y || 0) + 0.02, z: z.pos.z }, { x: 0, y: 1, z: 0 }, 1.4);
    }
    this.sndCrush(point);
    this.shakeNear(point, 0.12, 10);
    return big;
  }

  // Se parte: pedazos que saltan, polvareda y un crujido.
  breakStone(s) {
    const g = this.g;
    const pos = s.mesh.position;
    const R = s.R;
    s.mesh.removeFromParent();
    s.dead = true;
    const S = stoneMats();
    const fy = pos.y - R;
    for (let i = 0; i < 7; i++) {
      const size = R * (0.28 + Math.random() * 0.2);
      const m = new THREE.Mesh(once('chunk', () => new THREE.DodecahedronGeometry(1, 0)), i % 3 ? S.side : S.face);
      m.scale.setScalar(size);
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      m.position.set(pos.x + Math.cos(a) * R * 0.5, pos.y + (Math.random() - 0.5) * R, pos.z + Math.sin(a) * R * 0.5);
      g.scene.add(m);
      this.chunks.push({ m, size, fy, vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3) + s.vel.x * 0.25, 3 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3) + s.vel.z * 0.25), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), t: 0 });
    }
    for (let i = 0; i < 22; i++) {
      tmpV.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 3);
      g.fx.alpha.spawn(pos.x, fy + 0.4, pos.z, tmpV.x, tmpV.y, tmpV.z, { color: [0.5, 0.46, 0.4], size: 0.5, size1: 2.2, life: 1.2 + Math.random() * 0.8, alpha: 0.45, drag: 1.8, gravity: -0.2 });
    }
    g.fx.dirt?.(tmpO.set(pos.x, fy, pos.z), 16);
    this.shakeNear(pos, 0.45, 14);
    this.sndBreak(pos);
    return true;
  }

  stepChunk(c, dt) {
    c.t += dt;
    c.vel.y -= 14 * dt;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.spin.x * dt;
    c.m.rotation.y += c.spin.y * dt;
    if (c.m.position.y < c.fy + c.size * 0.7) {
      c.m.position.y = c.fy + c.size * 0.7;
      c.vel.y *= -0.3;
      c.vel.x *= 0.6;
      c.vel.z *= 0.6;
      c.spin.multiplyScalar(0.6);
    }
    if (c.t > 1.4) c.m.scale.setScalar(c.size * Math.max(0, 1 - (c.t - 1.4) / 0.5));
    return c.t > 1.9;
  }

  // ---------------- Mate Dragón ----------------
  // El aliento, mientras se mantiene el clic (lo llama update).
  breathe(st, dt) {
    const g = this.g;
    const w = this.w;
    const B = st.breath;
    const origin = g.camera.position;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion).clone();
    const muzzle = w.muzzleWorld(new THREE.Vector3());
    const wall = g.world.raycast(origin, fwd, B.range, hitTmp);
    const reach = Math.min(B.range, wall);
    // la llamarada arranca con un bufido (el chorro grabado ya lo trae)
    if (!this.wasBreathing) {
      this.breathSnd?.stop(0.2);
      this.breathSnd = this.breathLoop(null);
      if (!this.breathSnd) this.sndIgnite(muzzle);
    }
    this.flames(muzzle, fwd, reach, dt);
    // donde pega, el piso o la pared se prende y queda quemado
    if (wall < B.range && hitTmp.point) {
      this.scorchT = (this.scorchT || 0) - dt;
      const hp = hitTmp.point;
      if (Math.random() < 0.5) g.fx.fire(tmpO.set(hp.x, hp.y + 0.05, hp.z), 0.9, 1);
      if (this.scorchT <= 0 && hitTmp.normal) {
        this.scorchT = 0.35;
        g.fx.decal(2, hp, hitTmp.normal, 0.9 + Math.random() * 0.6);
      }
    }
    g.fx.addShake(dt * 0.35);
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 1 / B.rate;
      let n = 0;
      for (const { z } of g.zombies.inRadius(origin, B.range + 1.5, near)) {
        if (n >= 24) break;
        const k = z.scale || 1;
        const to = tmpV2.set(z.pos.x - origin.x, (z.pos.y || 0) + 1 * k - origin.y, z.pos.z - origin.z);
        const d = to.length();
        if (d > B.range + 0.5 * k || (d > 1.2 && to.dot(fwd) / d < B.cos)) continue;
        const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 1 * k, z.pos.z);
        if (!g.world.clear(origin, point)) continue;
        const amount = z.boss ? B.boss : Math.max(B.min, (z.maxHp || 0) * B.frac + 1);
        g.zombies.damage(z, amount, { type: 'bullet', zone: 'torso', point, dir: fwd, burn: true, pup: st.bossMult });
        n++;
      }
      // la luz del fuego: en la boca y en donde llega
      g.fx.flash(muzzle, 0xff6018, 4, 0.14, 8);
      if (reach > 5 && Math.random() < 0.5) g.fx.flash(tmpO.copy(origin).addScaledVector(fwd, reach * 0.8), 0xff4a10, 5, 0.16, 10);
    }
    w.recoilKick = Math.min(0.5, w.recoilKick + dt * 3);
    this.sndT -= dt;
    if (this.sndT <= 0 && !this.breathSnd) {
      this.sndT = 0.13;
      this.sndBreath(muzzle);
    }
    this.shareT -= dt;
    if (this.shareT <= 0 && g.net) {
      this.shareT = 0.15;
      g.net.share('esp', { k: 'aliento', m: r2(muzzle), f: r2(fwd), r: +reach.toFixed(1) });
    }
  }

  // Las llamas del aliento: salen de la boca y se abren en cono hasta `reach`.
  flames(from, dir, reach, dt) {
    const g = this.g;
    // (contra una pared o el piso de cerca, menos llamas: si no, se amontonan y queman la imagen)
    this.flameAcc += dt * 170 * Math.min(1, Math.max(0.3, reach / 9));
    const n = Math.floor(this.flameAcc);
    this.flameAcc -= n;
    from = tmpV2.copy(from).addScaledVector(dir, 0.45);
    // (la velocidad de cada llama sale de hasta dónde tiene que llegar: con el
    // freno del aire, recorre v/d·(1 − e^(−d·vida)))
    const D = 0.7;
    for (let i = 0; i < n; i++) {
      const life = 0.7 + Math.random() * 0.25;
      const to = Math.max(1.5, reach * (0.8 + Math.random() * 0.3));
      const sp = (to * D) / (1 - Math.exp(-D * life));
      // cerca de la boca, finito y amarillo; lejos, ancho y colorado
      const k = sp * 0.36;
      const sx = (Math.random() - 0.5) * k;
      const sy = (Math.random() - 0.5) * k * 0.75;
      const sz = (Math.random() - 0.5) * k;
      const hot = Math.random();
      g.fx.add.spawn(from.x, from.y, from.z, dir.x * sp + sx, dir.y * sp + sy + 0.6, dir.z * sp + sz, {
        color: [0.5, 0.12 + hot * 0.2, 0.02],
        size: 0.2,
        size1: 1.3 + Math.random() * 1.4,
        life,
        drag: D,
        gravity: -2,
      });
    }
    // el corazón amarillo del chorro, pegado a la boca
    if (Math.random() < 0.6) {
      const sp = 14 + Math.random() * 4;
      g.fx.add.spawn(from.x, from.y, from.z, dir.x * sp + (Math.random() - 0.5) * 2, dir.y * sp + (Math.random() - 0.5) * 2, dir.z * sp + (Math.random() - 0.5) * 2, { color: [0.55, 0.36, 0.1], size: 0.12, size1: 0.45, life: Math.min(0.18, (reach + 0.3) / sp), drag: 0.5 });
    }
    // chispas que saltan y caen
    if (Math.random() < dt * 45) {
      const sp = 8 + Math.random() * 6;
      g.fx.add.spawn(from.x, from.y, from.z, dir.x * sp + (Math.random() - 0.5) * 4, dir.y * sp + 1 + Math.random() * 3, dir.z * sp + (Math.random() - 0.5) * 4, { color: [1, 0.75, 0.35], size: 0.04, life: 1.1, gravity: 5, bounce: 0.4 });
    }
    // humo negro donde se apaga
    if (Math.random() < dt * 16) {
      const p = tmpO.copy(from).addScaledVector(dir, reach * (0.6 + Math.random() * 0.4));
      g.fx.alpha.spawn(p.x, p.y + 0.3, p.z, (Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6, { color: [0.12, 0.1, 0.09], size: 0.5, size1: 2, life: 1.4, alpha: 0.32, drag: 1 });
    }
  }

  spitFireball(st) {
    const g = this.g;
    const w = this.w;
    const F = st.fireball;
    this.fbCd = F.cd;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion).clone();
    const muzzle = w.muzzleWorld(new THREE.Vector3());
    const aim = w.aimPoint(g.camera.position, fwd, 90);
    const vel = aim.sub(muzzle).normalize().multiplyScalar(F.speed);
    vel.y += 1.2;
    this.addBall(muzzle, vel, st, false);
    g.net?.share('esp', { k: 'bola', m: r2(muzzle), v: r2(vel) });
    w.recoilKick = Math.min(1.5, w.recoilKick + 1.2);
    g.player.addRecoil(0.06, 0);
    g.fx.addShake(0.22);
    g.fx.flash(muzzle, 0xff7020, 6, 0.2, 10);
    this.jaw = 1;
    this.kick = 1;
  }

  addBall(pos, vel, st, ghost) {
    const g = this.g;
    const mats = once('ballMats', () => {
      const add = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      return { core: add(0xffe6a0, 2.8), halo: add(0xff6a1a, 2.2), outer: add(0xff3a08, 0.9) };
    });
    const ball = once('ballGeo', () => new THREE.SphereGeometry(1, 14, 10));
    const mesh = new THREE.Group();
    for (const [m, s] of [[mats.core, 0.3], [mats.halo, 0.58], [mats.outer, 0.95]]) {
      const b = new THREE.Mesh(ball, m);
      b.scale.setScalar(s);
      mesh.add(b);
    }
    // el resplandor alrededor
    const glow = new THREE.Sprite(once('ballGlow', () => new THREE.SpriteMaterial({ map: g.textures.dot, color: new THREE.Color(0xff6a1a).multiplyScalar(1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 })));
    glow.scale.setScalar(3.2);
    mesh.add(glow);
    mesh.position.copy(pos);
    g.scene.add(mesh);
    this.balls.push({ mesh, pos: mesh.position, prev: pos.clone(), vel: vel.clone(), F: st.fireball, t: 0, ghost, lightT: 0 });
    // (la bola grabada del Pillán, una u otra; la mía sin lugar)
    if (!this.g.audio.guns?.play(Math.random() < 0.5 ? 'fuego-1' : 'fuego-2', { pos: ghost ? pos : null, gain: DRAGON_SFX.ball, rate: 0.82 + Math.random() * 0.06 })) this.sndFireball(pos);
    g.fx.fire(pos, 0.1, 6);
  }

  stepBall(b, dt) {
    const g = this.g;
    b.t += dt;
    b.prev.copy(b.pos);
    b.vel.y -= b.F.gravity * dt;
    b.pos.addScaledVector(b.vel, dt);
    // es grande: revienta apenas le pasa cerca a un muerto
    if (g.zombies.inRadius(b.pos, 1.1, near).length) return this.boom(b, b.pos.clone());
    const seg = tmpV.subVectors(b.pos, b.prev);
    const len = seg.length();
    if (len > 1e-5) {
      const dir = seg.divideScalar(len);
      const wallT = g.world.raycast(b.prev, dir, len, hitTmp);
      const zh = g.zombies.raycast(b.prev, dir, Math.min(wallT, len));
      if (zh.length) return this.boom(b, b.prev.clone().addScaledVector(dir, zh[0].t));
      if (Number.isFinite(wallT) && wallT < len) return this.boom(b, hitTmp.point.clone().addScaledVector(hitTmp.normal, 0.2));
    }
    // el piso (con alturas, como el castillo, el rayo solo conoce el de abajo)
    const fy = g.world.floorAt(b.pos.x, b.pos.z, b.prev.y);
    if (b.pos.y <= fy + 0.1) return this.boom(b, new THREE.Vector3(b.pos.x, fy + 0.15, b.pos.z));
    if (b.t > 3) return this.boom(b, b.pos.clone());
    b.mesh.rotation.y += dt * 8;
    b.mesh.scale.setScalar(1 + Math.sin(b.t * 30) * 0.08);
    g.fx.fire(b.pos, 0.3, 3);
    if (Math.random() < 0.6) g.fx.sparkle(b.pos, [1, 0.55, 0.15], 1, 0.25);
    // la estela: fuego que queda atrás, chispas en espiral y humo
    const back = tmpO.copy(b.vel).normalize();
    for (let i = 0; i < 4; i++) {
      const k = Math.random();
      g.fx.add.spawn(b.prev.x + (b.pos.x - b.prev.x) * k, b.prev.y + (b.pos.y - b.prev.y) * k, b.prev.z + (b.pos.z - b.prev.z) * k, -back.x * 2 + (Math.random() - 0.5) * 1.5, -back.y * 2 + (Math.random() - 0.5) * 1.5 + 0.5, -back.z * 2 + (Math.random() - 0.5) * 1.5, { color: [0.5, 0.16 + Math.random() * 0.12, 0.03], size: 0.45, size1: 0.1, life: 0.35 + Math.random() * 0.2, drag: 2 });
    }
    const sa = b.t * 22;
    g.fx.add.spawn(b.pos.x + Math.cos(sa) * 0.5, b.pos.y + Math.sin(sa) * 0.5, b.pos.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, { color: [1, 0.8, 0.4], size: 0.05, life: 0.5, gravity: 2 });
    if (Math.random() < dt * 20) g.fx.alpha.spawn(b.prev.x, b.prev.y, b.prev.z, 0, 0.6, 0, { color: [0.14, 0.11, 0.1], size: 0.4, size1: 1.4, life: 0.9, alpha: 0.28, drag: 1 });
    // la luz que va con ella
    b.lightT -= dt;
    if (b.lightT <= 0) {
      b.lightT = 0.12;
      g.fx.flash(b.pos, 0xff6a1a, 5, 0.18, 12);
    }
    return false;
  }

  // Revienta: explosión grande (daño solo del que la tiró) y el piso ardiendo.
  boom(b, at) {
    const g = this.g;
    const F = b.F;
    b.mesh.removeFromParent();
    if (b.ghost) {
      g.fx.explosion(at, F.radius * 1.3, [1, 0.5, 0.15]);
      g.audio.explosion(at, 1.3);
    } else this.w.explode(at, F.radius, F.damage + (g.rounds?.round || 0) * 150, { color: [1, 0.5, 0.15], big: 1.3, pup: WEAPONS.dragon.bossMult });
    const fy = g.world.floorAt(at.x, at.z, at.y + 0.5);
    const ground = new THREE.Vector3(at.x, fy, at.z);
    this.patches.push({ pos: ground, r: F.radius * 0.85, t: 0, life: 4, tick: 0, ghost: b.ghost });
    for (let i = 0; i < 18; i++) g.fx.add.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 14, 3 + Math.random() * 8, (Math.random() - 0.5) * 14, { color: [1, 0.7, 0.3], size: 0.06, life: 1.4, gravity: 9, bounce: 0.4 });
    // la columna de fuego que sube
    for (let i = 0; i < 16; i++) g.fx.add.spawn(at.x + (Math.random() - 0.5) * 1.2, fy + 0.3, at.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.5, 5 + Math.random() * 6, (Math.random() - 0.5) * 1.5, { color: [0.4, 0.14, 0.03], size: 0.7, size1: 0.15, life: 0.6 + Math.random() * 0.4, drag: 1.4 });
    // la onda que corre por el piso y el quemado
    if (Math.abs(at.y - fy) < 2) {
      const ring = new THREE.Mesh(once('ringGeo', () => new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a30).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      ring.position.set(at.x, fy + 0.08, at.z);
      g.scene.add(ring);
      this.rings.push({ m: ring, t: 0, r: F.radius * 1.6 });
      g.fx.decal(2, ground, { x: 0, y: 1, z: 0 }, F.radius * 0.9);
    }
    this.shakeNear(at, 0.5, 20);
    this.sndBoom(at);
    // y unas explosiones más chicas alrededor, que siguen reventando
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = F.radius * (0.45 + Math.random() * 0.35);
      const p = new THREE.Vector3(at.x + Math.cos(a) * d, fy + 0.4, at.z + Math.sin(a) * d);
      this.after.push({ t: 0.18 + i * 0.14 + Math.random() * 0.08, fn: () => {
        if (b.ghost) {
          g.fx.explosion(p, 2.4, [1, 0.45, 0.12]);
          g.audio.explosion(p, 0.6);
        } else this.w.explode(p, 2.6, F.damage * 0.25, { color: [1, 0.45, 0.12], big: 0.9, pup: WEAPONS.dragon.bossMult });
      } });
    }
    return true;
  }

  // El piso que queda ardiendo: fuego y quemadura a los que pasan.
  stepPatch(p, dt) {
    const g = this.g;
    p.t += dt;
    const k = 1 - p.t / p.life;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * p.r;
      g.fx.fire(tmpO.set(p.pos.x + Math.cos(a) * d, p.pos.y + 0.05, p.pos.z + Math.sin(a) * d), 0.3 * k + 0.1, 1);
    }
    if (!p.ghost) {
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = 0.3;
        for (const { z } of g.zombies.inRadius(tmpO.set(p.pos.x, p.pos.y, p.pos.z), p.r, near)) {
          const point = new THREE.Vector3(z.pos.x, (z.pos.y || 0) + 0.5, z.pos.z);
          g.zombies.damage(z, z.boss ? 150 : Math.max(400, (z.maxHp || 0) * 0.2), { type: 'bullet', zone: 'legs', point, burn: true, noPoints: true, pup: WEAPONS.dragon.bossMult });
        }
      }
    }
    return p.t >= p.life;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const w = this.w;
    const st = w.temp ? w.stats : null;
    this.fbCd -= dt;
    // recién agarrado: el dragón despierta y ruge
    if (w.temp !== this.tempRef) {
      this.tempRef = w.temp;
      if (w.temp?.id === 'dragon') this.wake();
    }
    // el aliento sigue solo mientras Weapons nos pasa el gatillo (vivo, jugando)
    if (st?.id === 'dragon' && this.breathing && g.time - this.inputT < 0.15 && w.state === 'idle') this.breathe(st, dt);
    else this.breathing = false;
    this.wasBreathing = this.breathing;
    if (!this.breathing && this.breathSnd) {
      this.breathSnd.stop(0.35);
      this.breathSnd = null;
    }
    // lo que revienta después (las explosiones chicas de la bola)
    for (let i = this.after.length - 1; i >= 0; i--) {
      const a = this.after[i];
      a.t -= dt;
      if (a.t <= 0) {
        this.after.splice(i, 1);
        a.fn();
      }
    }
    // la onda de la bola por el piso
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / 0.5;
      const k = Math.min(1, r.t);
      r.m.scale.setScalar(0.5 + (1 - (1 - k) * (1 - k)) * r.r);
      r.m.material.opacity = 1 - k;
      if (k >= 1) {
        r.m.removeFromParent();
        r.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    // la llamarada del rugido (se ve, no lastima)
    if (this.flareT > 0) {
      this.flareT -= dt;
      if (this.flareT < 0.6 && w.model?.dragon) {
        const fwd = tmpV.set(0, 0.25, -1).applyQuaternion(g.camera.quaternion).normalize();
        this.flames(w.muzzleWorld(new THREE.Vector3()), fwd, 6, dt);
      }
    }
    for (let i = this.stones.length - 1; i >= 0; i--) if (this.stepStone(this.stones[i], dt)) this.stones.splice(i, 1);
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.stepChunk(this.chunks[i], dt)) {
        this.chunks[i].m.removeFromParent();
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.balls.length - 1; i >= 0; i--) if (this.stepBall(this.balls[i], dt)) this.balls.splice(i, 1);
    for (let i = this.patches.length - 1; i >= 0; i--) if (this.stepPatch(this.patches[i], dt)) this.patches.splice(i, 1);
    // el aliento de los otros jugadores
    for (let i = this.remote.length - 1; i >= 0; i--) {
      const r = this.remote[i];
      r.t -= dt;
      if (r.t <= 0) {
        r.loop?.stop(0.35);
        this.remote.splice(i, 1);
        continue;
      }
      this.flames(r.m, r.f, r.r, dt * 0.7);
      r.loop?.move(r.m);
      r.snd -= dt;
      if (r.snd <= 0 && !r.loop) {
        r.snd = 0.2;
        this.sndBreath(r.m);
      }
    }
    this.animate(dt, st);
  }

  // La mano: la piedra sale y vuelve a aparecer desde abajo; el dragón abre la boca.
  animate(dt, st) {
    const m = this.w.model;
    if (!m) return;
    if (m.piedra) {
      this.throwT += dt;
      const t = this.throwT;
      const cd = st ? 60 / st.rpm : 0.85;
      m.piedra.visible = t > 0.14;
      const k = smooth((t - 0.14) / Math.max(0.1, cd - 0.25));
      m.piedra.position.set(0, -0.3 * (1 - k) + Math.sin(this.g.time * 2) * 0.004, 0);
      m.piedra.rotation.z = (1 - k) * 0.5;
    }
    if (m.dragon) {
      const D = m.dragon;
      const t = this.g.time;
      // el rugido: sube la cabeza, abre grande la boca y las alas
      this.roarT = Math.max(0, this.roarT - dt);
      const roar = this.roarT > 0 ? Math.sin(Math.min(1, (ROAR - this.roarT) / ROAR) * Math.PI) : 0;
      this.kick = Math.max(0, this.kick - dt * 3);
      const want = this.breathing ? 0.6 : roar > 0 ? 0.25 + roar * 0.75 : 0.06 + Math.max(0, Math.sin(t * 1.3)) * 0.05;
      this.jaw = Math.max(want, this.jaw - dt * 3);
      D.jaw.rotation.x = this.jaw * 0.9;
      D.g.rotation.x = 0.1 - roar * 0.45 + this.kick * 0.25 + (roar > 0 ? Math.sin(t * 40) * 0.02 * roar : 0);
      const f = this.breathing ? 1.4 + Math.random() * 0.6 : 0.8 + Math.sin(t * 5) * 0.2 + roar;
      D.ember.scale.setScalar(f);
      const tg = D.tongue;
      tg.visible = this.breathing || roar > 0.5;
      if (tg.visible) tg.scale.set(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, (0.85 + Math.random() * 0.3) * (this.breathing ? 1 : roar * 0.6));
      // las escamas se ponen al rojo con el fuego (y laten despacio en reposo)
      const hot = this.breathing ? 1.3 : Math.max(roar * 1.5, this.kick);
      this.heat += (hot - this.heat) * Math.min(1, dt * (hot > this.heat ? 6 : 1.4));
      D.heat.scales.emissiveIntensity = 0.1 + Math.max(0, Math.sin(t * 2.2)) * 0.08 + this.heat;
      D.heat.wing.emissiveIntensity = this.heat * 0.5;
      // las alas: plegadas para atrás, contra la calabaza; se abren y aletean
      // con el fuego, el rugido o la bola
      const open = Math.max(this.breathing ? 0.55 : 0, roar, this.kick);
      this.wings += (open - this.wings) * Math.min(1, dt * 6);
      const o = this.wings;
      const flap = Math.sin(t * (o > 0.3 ? 17 : 2.4)) * (0.06 + o * 0.22);
      for (const W of D.wings) {
        W.pivot.rotation.set(0.2 - o * 0.1, -1.35 + o * 1.5 + flap, -0.9 + o * 1.35);
        W.pivot.scale.setScalar(0.55 + o * 0.45);
      }
      D.tail.rotation.y = Math.sin(t * 1.4) * 0.06 + roar * 0.12;
      // el humito de las narinas, solo en reposo
      const calm = !this.breathing && roar === 0 ? 1 : 0;
      for (const s of D.smoke) {
        const k = (t * 0.45 + s.userData.ph) % 1;
        s.position.set(Math.sin(k * 9 + s.userData.ph * 6) * 0.004 * D.s, (0.024 + k * 0.05) * D.s, (-0.058 - k * 0.02) * D.s);
        s.scale.setScalar((0.012 + k * 0.03) * D.s);
        s.material.opacity = calm * Math.sin(k * Math.PI) * 0.35;
      }
    }
  }

  // Recién agarrado: el dragón se despierta, ruge y escupe una llamarada al aire.
  wake() {
    const g = this.g;
    this.roarT = ROAR;
    this.flareT = 0.9;
    this.sndRoar(null);
    g.fx.addShake(0.35);
    g.net?.share('esp', { k: 'rugido', p: r2(g.player.pos) });
  }

  // ---------------- en línea ----------------
  // El tiro de otro jugador: lo mismo que se ve acá, sin daño.
  ghost(m) {
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    if (m.k === 'piedra' && m.p && m.v) this.addStone(V(m.p), m.v[0], m.v[1], WEAPONS.piedra, true);
    else if (m.k === 'bola' && m.m && m.v) this.addBall(V(m.m), V(m.v), WEAPONS.dragon, true);
    else if (m.k === 'rugido' && m.p) this.sndRoar(V(m.p));
    else if (m.k === 'aliento' && m.m && m.f) {
      // uno por jugador: el mensaje nuevo reemplaza al del mismo lugar
      const at = V(m.m);
      const old = this.remote.find((r) => r.m.distanceToSquared(at) < 4);
      const r = old || { snd: 0 };
      Object.assign(r, { m: at, f: V(m.f).normalize(), r: m.r || 9, t: 0.25 });
      if (!old) {
        r.loop = this.breathLoop(at);
        this.remote.push(r);
      }
    }
  }

  clear() {
    for (const s of this.stones) s.mesh.removeFromParent();
    for (const c of this.chunks) c.m.removeFromParent();
    for (const b of this.balls) b.mesh.removeFromParent();
    for (const r of this.rings) {
      r.m.removeFromParent();
      r.m.material.dispose();
    }
    this.rings.length = 0;
    this.after.length = 0;
    this.flareT = 0;
    this.stones.length = 0;
    this.chunks.length = 0;
    this.balls.length = 0;
    this.patches.length = 0;
    for (const r of this.remote) r.loop?.stop(0.2);
    this.remote.length = 0;
    this.breathing = false;
    this.breathSnd?.stop(0.2);
    this.breathSnd = null;
  }

  // ---------------- lo que se escucha ----------------
  shakeNear(pos, amount, dist) {
    const d = this.g.camera.position.distanceTo(pos);
    if (d < dist) this.g.fx.addShake(amount * (1 - d / dist));
  }

  sndThrow(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.4, gain: 0.9 });
    a.noise(o, { t, dur: 0.45, freq: 500, freqEnd: 120, q: 0.8, gain: 0.8, brown: true });
    a.tone(o, { t, dur: 0.3, freq: 80, freqEnd: 38, gain: 0.8 });
  }

  sndRoll(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.3, gain: 0.75 });
    a.noise(o, { t, dur: 0.22, freq: 180 + Math.random() * 60, q: 0.7, gain: 0.9, brown: true, attack: 0.02 });
    a.tone(o, { t, dur: 0.16, freq: 42 + Math.random() * 8, gain: 0.35 });
  }

  sndThud(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.6, gain: 1.2 });
    a.tone(o, { t, dur: 0.4, freq: 70, freqEnd: 28, gain: 1 });
    a.noise(o, { t, dur: 0.35, freq: 900, freqEnd: 150, q: 0.6, gain: 0.8, brown: true });
    a.noise(o, { t, dur: 0.05, type: 'highpass', freq: 2500, gain: 0.3 });
  }

  sndCrush(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.3, gain: 0.8 });
    a.noise(o, { t, dur: 0.16, type: 'bandpass', freq: 900, freqEnd: 260, q: 1.2, gain: 0.9 });
    a.tone(o, { t, dur: 0.14, freq: 130, freqEnd: 55, gain: 0.5 });
    for (let i = 0; i < 3; i++) a.noise(o, { t: t + 0.02 + Math.random() * 0.1, dur: 0.03, type: 'highpass', freq: 2000 + Math.random() * 1500, gain: 0.25 });
  }

  sndBreak(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.7, gain: 1.3 });
    a.tone(o, { t, dur: 0.5, freq: 60, freqEnd: 25, gain: 1 });
    a.noise(o, { t, dur: 0.9, freq: 1400, freqEnd: 90, q: 0.5, gain: 0.9, brown: true });
    for (let i = 0; i < 12; i++) a.noise(o, { t: t + Math.random() * 0.6, dur: 0.04, type: 'highpass', freq: 1800 + Math.random() * 2500, gain: 0.25 });
  }

  sndBreath(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.35, gain: 0.8 });
    a.noise(o, { t, dur: 0.24, type: 'bandpass', freq: 650 + Math.random() * 200, freqEnd: 1500, q: 0.7, gain: 0.8, brown: true, attack: 0.03 });
    a.noise(o, { t, dur: 0.2, freq: 220, q: 0.6, gain: 0.6, brown: true });
    // el retumbe grave del chorro y el crepitar
    a.noise(o, { t, dur: 0.26, freq: 90, q: 0.5, gain: 0.7, brown: true, attack: 0.04 });
    for (let i = 0; i < 2; i++) if (Math.random() < 0.7) a.noise(o, { t: t + Math.random() * 0.12, dur: 0.025, type: 'highpass', freq: 2600 + Math.random() * 1500, gain: 0.2 });
  }

  // La llamarada que arranca: un bufido que se prende.
  sndIgnite(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.4, gain: 1 });
    a.noise(o, { t, dur: 0.45, type: 'bandpass', freq: 250, freqEnd: 1800, q: 0.8, gain: 1, attack: 0.02 });
    a.tone(o, { t, dur: 0.3, freq: 70, freqEnd: 40, gain: 0.6 });
    this.growl(o, t, 0.5, 0.55);
  }

  sndFireball(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.45, gain: 1.2 });
    a.noise(o, { t, dur: 0.7, type: 'bandpass', freq: 400, freqEnd: 2400, q: 0.8, gain: 0.9 });
    a.tone(o, { t, dur: 0.35, type: 'sawtooth', freq: 140, freqEnd: 45, gain: 0.35 });
    a.tone(o, { t, dur: 0.4, freq: 95, freqEnd: 40, gain: 0.7 });
    this.growl(o, t, 0.4, 0.5);
  }

  // Cuando revienta la bola: un golpe grave que queda sonando y los cascotes.
  sndBoom(pos) {
    const a = this.g.audio;
    const t = a.now;
    const o = a.out({ pos, reverb: 0.8, gain: 1.4 });
    a.tone(o, { t, dur: 1.2, freq: 55, freqEnd: 22, gain: 1, attack: 0.01 });
    a.noise(o, { t: t + 0.05, dur: 1.4, freq: 700, freqEnd: 80, q: 0.5, gain: 0.8, brown: true });
    for (let i = 0; i < 8; i++) a.noise(o, { t: t + 0.1 + Math.random() * 0.8, dur: 0.04, type: 'highpass', freq: 1800 + Math.random() * 2400, gain: 0.22 });
  }

  // La garganta del dragón: sierras graves que tiemblan (el ronquido) pasando
  // por un filtro que se abre y se cierra, como una boca.
  growl(o, t, dur, gain) {
    const a = this.g.audio;
    const c = a.ctx;
    if (!c) return;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.35);
    f.frequency.linearRampToValueAtTime(420, t + dur);
    f.connect(o);
    for (const [f0, f1, det] of [[88, 56, 0], [132, 70, 12], [60, 40, -9]]) {
      const { o: osc } = a.tone(f, { t, dur, type: 'sawtooth', freq: f0, freqEnd: f1, gain: gain * 0.4, attack: Math.min(0.15, dur * 0.2), detune: det });
      // el ronquido: la voz tiembla rápido
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 22 + Math.random() * 8;
      lg.gain.value = f0 * 0.14;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
  }

  // El chorro grabado del dragón grande (dragon-fuego-1/2, una y una): arranca
  // con la prendida y da vueltas por el medio parejo. null si no bajó.
  breathLoop(pos) {
    const a = this.g.audio;
    this.take = this.take === 1 ? 2 : 1;
    const buf = a.sfxBuf?.['dragon-fuego-' + this.take];
    if (!buf || !a.guns || buf.duration < 3) return null;
    return a.guns.loopBuf(buf, pos, { gain: DRAGON_SFX.breath * (pos ? 1.4 : 1), reverb: 0.35, ref: 4, fadeIn: 0.05, from: 1, to: buf.duration - 1.3 });
  }

  // El rugido al agarrarlo (pos null: el tuyo, sin lugar): el del dragón
  // grande grabado, más bajo; si no bajó, el sintetizado.
  sndRoar(pos) {
    const a = this.g.audio;
    if (!a.ctx) return;
    const rec = a.sfxBuf?.['dragon-rugido'];
    if (rec) {
      a.guns?.withCat(() => a.playBuffer(rec, { pos, gain: DRAGON_SFX.roar * (pos ? 1.6 : 1), reverb: 0.6, ref: 6 }));
      return;
    }
    const t = a.now;
    const o = a.out({ pos, reverb: 0.7, gain: pos ? 1.8 : 1.1, ref: 6 });
    this.growl(o, t, ROAR, 1);
    // el aire que sale: se abre y se cierra
    a.noise(o, { t, dur: 1.6, type: 'bandpass', freq: 380, freqEnd: 1300, q: 1.1, gain: 0.8, attack: 0.15 });
    a.noise(o, { t: t + 0.6, dur: 1.2, type: 'bandpass', freq: 1500, freqEnd: 300, q: 0.9, gain: 0.55, attack: 0.1 });
    a.noise(o, { t, dur: 1.9, freq: 160, freqEnd: 60, q: 0.6, gain: 0.9, brown: true, attack: 0.2 });
    // la llamarada del final
    a.noise(o, { t: t + 0.9, dur: 0.8, type: 'bandpass', freq: 300, freqEnd: 2000, q: 0.7, gain: 0.7, attack: 0.05 });
    for (let i = 0; i < 10; i++) a.noise(o, { t: t + 0.9 + Math.random() * 0.8, dur: 0.03, type: 'highpass', freq: 2200 + Math.random() * 2000, gain: 0.18 });
  }
}
