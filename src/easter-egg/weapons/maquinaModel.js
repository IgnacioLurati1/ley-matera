import * as THREE from 'three';
import { VM, registerMate } from './viewmodels';
import { flameMaterial } from '../world/castleFire';

// La Máquina de Muerte del penal (config/weapons.js `gutmuerte`): la Bombilla
// Gut hecha Gatling del infierno (el usuario, 2026-10-07: "fuego viviente,
// que dispare balas del infierno"). La culata es una calabaza carbonizada con
// grietas de lava que laten; la caja, de hierro quemado con costuras de brasa
// y dos cuernitos; el tambor, seis caños negros con las bocas al rojo y una
// funda de calor que se prende con la vuelta; arriba, el mate de tolva lleno
// de brasas, con llamas que le salen y chispas que suben (por ahí se la ceba:
// es la boca que busca el termo al recargar). La cinta trae balas al rojo.
// maq: las piezas que mueve maquinaSpin (Weapons.animate) y que también usa
// la que queda montada en la cureña (entities/penalMaquina.js).

const { mats, lathe, cyl, box, sph, tor, wrapHand, PROFILES } = VM;

// Las texturas de la Gatling del infierno, pintadas una vez en canvas: el
// carbón de la calabaza y la caja (color con vetas, relieve con poros y las
// grietas hundidas) y la lava que brilla en esas mismas grietas; el hierro
// quemado de los caños (manchas y picaduras). (El usuario, 2026-10-07: la
// calabaza de arriba se veía plana, "medio 2D", sobre todo abajo.)
let TEX = null;
function hellTex() {
  if (TEX) return TEX;
  const N = 256;
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    return c;
  };
  // ruido de manchas: muchos círculos suaves de tono parecido
  const blotch = (x, n, rad, col) => {
    for (let i = 0; i < n; i++) {
      const px = r() * N;
      const py = r() * N;
      const rr = rad * (0.4 + r());
      const gr = x.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, col(r()));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      // (de los dos lados del borde, así no se nota la costura)
      for (const dx of [-N, 0, N]) {
        x.save();
        x.translate(dx, 0);
        x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
        x.restore();
      }
    }
  };
  // las grietas (las mismas en el relieve, el color y la lava)
  const cracks = [];
  for (let k = 0; k < 34; k++) {
    let px = r() * N;
    let py = r() * N;
    const pts = [[px, py]];
    for (let s = 0; s < 6; s++) {
      px += (r() - 0.5) * 60;
      py += (r() - 0.5) * 60;
      pts.push([px, py]);
    }
    cracks.push({ pts, w: 1 + r() * 3, a: 0.55 + r() * 0.45, g: 110 + r() * 100 });
  }
  const drawCracks = (x, style, widen = 1) => {
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (const c of cracks) {
      x.strokeStyle = style(c);
      x.lineWidth = c.w * widen;
      x.beginPath();
      x.moveTo(c.pts[0][0], c.pts[0][1]);
      for (const q of c.pts.slice(1)) x.lineTo(q[0], q[1]);
      x.stroke();
    }
  };
  // el color del carbón: negro rojizo con vetas y ceniza
  const ca = canvas();
  let x = ca.getContext('2d');
  x.fillStyle = '#463429';
  x.fillRect(0, 0, N, N);
  blotch(x, 90, 26, (v) => `rgba(${80 + v * 50},${48 + v * 26},${32 + v * 18},0.5)`);
  blotch(x, 60, 12, (v) => `rgba(${14 + v * 12},${10 + v * 8},${8 + v * 8},0.6)`);
  blotch(x, 45, 10, (v) => `rgba(${140 + v * 50},${128 + v * 40},${116 + v * 36},0.35)`);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(120,80,60,0.25)';
    x.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  drawCracks(x, () => '#0a0605', 1.6);
  // el relieve: poros y grietas hundidas (blanco = alto)
  const cb = canvas();
  x = cb.getContext('2d');
  x.fillStyle = '#909090';
  x.fillRect(0, 0, N, N);
  blotch(x, 120, 18, (v) => `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.25)`);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)';
    x.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  drawCracks(x, () => '#000', 2.2);
  // la lava, en el fondo de las grietas
  const cl = canvas();
  x = cl.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, N, N);
  drawCracks(x, (c) => `rgba(255,${c.g},20,${c.a})`);
  // el hierro quemado de los caños: manchas, óxido y picaduras
  const cm = canvas();
  x = cm.getContext('2d');
  x.fillStyle = '#2b2622';
  x.fillRect(0, 0, N, N);
  blotch(x, 80, 20, (v) => `rgba(${70 + v * 50},${40 + v * 20},${25 + v * 10},0.35)`);
  blotch(x, 50, 10, (v) => `rgba(${12 + v * 8},${10 + v * 8},${10 + v * 8},0.55)`);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  const cmb = canvas();
  x = cmb.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, N, N);
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = r() < 0.7 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.3)';
    const s = 1 + r() * 2.5;
    x.beginPath();
    x.arc(r() * N, r() * N, s, 0, Math.PI * 2);
    x.fill();
  }
  const tex = (c, srgb, rep = 1) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = 4;
    return t;
  };
  TEX = { color: tex(ca, true), bump: tex(cb, false), lava: tex(cl, true), metal: tex(cm, true, 2), metalBump: tex(cmb, false, 2) };
  return TEX;
}

// Los materiales propios (uno por arma armada: la lava y las brasas laten).
function hellMats(upgraded) {
  const TX = hellTex();
  return {
    lava: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.color, bumpMap: TX.bump, bumpScale: 4, roughness: 0.78, metalness: 0.05, emissive: upgraded ? 0xb05aff : 0xff5a14, emissiveMap: TX.lava, emissiveIntensity: 1.6 }),
    char: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.metal, bumpMap: TX.metalBump, bumpScale: 1.2, roughness: 0.55, metalness: 0.7 }),
    ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(upgraded ? 0xc070ff : 0xff6a18).multiplyScalar(2.2), toneMapped: false }),
    tip: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a10).multiplyScalar(1.4), toneMapped: false }),
  };
}

// Abulta una calabaza del torno (bultos y surcos de carbón de verdad, no solo
// pintados): corre cada vértice para afuera o para adentro según el ángulo y
// la altura (con vueltas enteras: no queda costura).
function lumpy(mesh, amp) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const n = Math.sin(a * 5 + y * 90) * 0.5 + Math.sin(a * 11 - y * 140 + 1.3) * 0.3 + Math.sin(a * 3 + y * 40 + 2) * 0.2;
    const k = 1 + amp * n;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return mesh;
}

// Una llama (dos planos cruzados con el fuego del castillo, world/castleFire).
function flame(parent, x, y, z, w, h, rx = 0) {
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const f = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(geo, flameMaterial());
    m.rotation.y = ry;
    m.userData.dynamic = true;
    f.add(m);
  }
  f.position.set(x, y, z);
  f.rotation.x = rx;
  f.userData.dynamic = true;
  parent.add(f);
  return f;
}

// hand: con la mano en la empuñadura (la de la cureña va sin mano).
export function buildMaquina(upgraded, T, hand = true) {
  const M = mats(T);
  const H = hellMats(upgraded);
  const g = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  const accent = upgraded ? M.glowPurple : M.gold;
  // la culata: la calabaza carbonizada con la lava adentro
  const stock = lumpy(lathe([[0, 0], [0.04, 0.01], [0.062, 0.05], [0.066, 0.09], [0.055, 0.13], [0.034, 0.155], [0.02, 0.16]], H.lava, 28), 0.05);
  stock.rotation.x = -Math.PI / 2;
  stock.position.z = 0.2;
  g.add(stock);
  // la caja del mecanismo: carbón con las grietas de lava (es lo que más se ve en la mano)
  const casing = cyl(0.045, 0.045, 0.078, H.lava, 20);
  casing.rotation.x = Math.PI / 2;
  casing.position.z = 0.022;
  g.add(casing);
  for (const z of [-0.017, 0.061]) {
    const lid = tor(0.045, 0.005, accent, 6, 22);
    lid.position.z = z;
    g.add(lid);
  }
  const seam = tor(0.0455, 0.0022, H.ember, 4, 26);
  seam.position.z = 0.022;
  g.add(seam);
  // dos cuernitos negros adelante de la caja
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, 8), M.hornBlack || M.dark);
    horn.position.set(s * 0.033, 0.036, -0.006);
    horn.rotation.set(-0.5, 0, -s * 0.55);
    g.add(horn);
  }
  // el tambor: seis caños negros, las bocas al rojo y sus aros
  const drum = new THREE.Group();
  const axle = cyl(0.007, 0.007, 0.36, M.dark, 8);
  axle.rotation.x = Math.PI / 2;
  axle.position.z = -0.19;
  drum.add(axle);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.027;
    const y = Math.sin(a) * 0.027;
    const b = cyl(0.0078, 0.0078, 0.35, H.char, 8);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, y, -0.19);
    drum.add(b);
    const tip = cyl(0.0082, 0.0105, 0.022, H.tip, 8);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(x, y, -0.372);
    drum.add(tip);
  }
  for (const z of [-0.08, -0.22, -0.345]) {
    const ring = tor(0.035, 0.0055, z === -0.22 ? H.char : accent, 6, 22);
    ring.position.z = z;
    drum.add(ring);
  }
  const plate = cyl(0.036, 0.036, 0.006, H.char, 18);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = -0.345;
  drum.add(plate);
  g.add(drum);
  // la funda de calor del tambor: casi nada quieta, al rojo con la vuelta y el calor
  const hotMat = new THREE.MeshBasicMaterial({ color: upgraded ? 0xa050ff : 0xff4a10, transparent: true, opacity: 0.02, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const hot = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.3, 14, 1, true), hotMat);
  hot.rotation.x = Math.PI / 2;
  hot.position.z = -0.2;
  g.add(hot);
  // las brasas vivas arriba de la caja y del tambor: resplandores que tiemblan
  const licks = [];
  if (T?.dot) {
    for (const [x, y, z, s] of [[0.018, 0.04, 0.0, 0.03], [-0.02, 0.038, 0.04, 0.026], [0.0, 0.034, -0.05, 0.028], [0.012, 0.03, -0.12, 0.022], [-0.01, 0.03, -0.2, 0.02]]) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: upgraded ? 0xb060ff : 0xff6a20, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 }));
      b.position.set(x, y, z);
      b.scale.setScalar(s);
      b.userData.s = s;
      b.userData.ph = Math.random() * 6;
      b.userData.dynamic = true;
      g.add(b);
      licks.push(b);
    }
  }
  // la manivela, a la derecha: eje, brazo y mango (gira sobre x)
  const crank = new THREE.Group();
  crank.position.set(0.046, 0, 0.022);
  const cAxle = cyl(0.006, 0.006, 0.03, M.dark, 8);
  cAxle.rotation.z = Math.PI / 2;
  cAxle.position.x = 0.012;
  crank.add(cAxle);
  const arm = box(0.006, 0.058, 0.01, H.char);
  arm.position.set(0.028, 0.022, 0);
  crank.add(arm);
  const knob = cyl(0.008, 0.008, 0.034, M.boneDark || M.wood, 10);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.046, 0.048, 0);
  crank.add(knob);
  g.add(crank);
  // la tolva: un mate chico arriba de la caja, lleno de brasas (se la ceba por ahí)
  const hop = new THREE.Group();
  hop.position.set(0, 0.04, 0.022);
  hop.scale.setScalar(0.7);
  hop.add(lumpy(lathe(PROFILES.calabaza, H.lava, 30), 0.07));
  // (las brasas tapan la boca entera: con la yerba de antes, más chica que la
  // boca, se veía para adentro un agujero entre el aro y la yerba)
  const coal = cyl(0.0315, 0.029, 0.014, H.ember, 18);
  coal.position.y = 0.091;
  hop.add(coal);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.008, 0), i % 2 ? H.char : H.tip);
    lump.position.set(Math.cos(a) * 0.016, 0.1, Math.sin(a) * 0.016);
    lump.rotation.set(a, a * 2, 0);
    hop.add(lump);
  }
  const hring = tor(0.031, 0.004, accent, 6, 18);
  hring.rotation.x = Math.PI / 2;
  hring.position.y = 0.1;
  hop.add(hring);
  g.add(hop);
  const hopFlame = flame(g, 0, 0.04 + 0.1 * 0.7, 0.022, 0.026, 0.045);
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 0.04 + 0.1 * 0.7, 0.022);
  g.add(mouth);
  // las chispas que suben del mate (vuelven a empezar abajo)
  const embers = [];
  for (let i = 0; i < 6; i++) {
    const e = sph(0.0022, H.ember, 5, 4);
    e.userData.dynamic = true;
    e.userData.ph = i / 6;
    e.userData.x = (Math.random() - 0.5) * 0.02;
    e.userData.z = (Math.random() - 0.5) * 0.02;
    g.add(e);
    embers.push(e);
  }
  // la cinta de balas del infierno: cuelga a la izquierda, las puntas al rojo
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const px = -0.047 - t * 0.012 - Math.sin(t * 2.2) * 0.012;
    const py = 0.012 - t * 0.085;
    const s = cyl(0.0048, 0.0048, 0.042, accent, 6);
    s.rotation.x = Math.PI / 2;
    s.position.set(px, py, 0.026);
    g.add(s);
    const tip = sph(0.0046, H.tip, 6, 4);
    tip.position.set(px, py, 0.003);
    g.add(tip);
    if (i < 6) {
      const link = box(0.004, 0.016, 0.03, M.leather);
      link.position.set(px - 0.002, py - 0.007, 0.022);
      g.add(link);
    }
  }
  // guardamonte, gatillo y la empuñadura de cuero
  const guard = tor(0.02, 0.003, M.dark, 6, 14, Math.PI);
  guard.position.set(0, -0.05, 0.085);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(guard);
  const trig = box(0.004, 0.02, 0.006, M.dark);
  trig.position.set(0, -0.05, 0.085);
  g.add(trig);
  const grip = cyl(0.016, 0.018, 0.11, M.leather, 8);
  grip.position.set(0, -0.09, 0.125);
  grip.rotation.x = 0.35;
  g.add(grip);
  if (hand) {
    const h = wrapHand(M, { radius: 0.017, y0: -0.035, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.4), scale: 0.95 });
    h.position.set(0, -0.09, 0.125);
    h.rotation.x = 0.35;
    g.add(h);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.39);
  g.add(muzzle);
  const tilt = new THREE.Group();
  g.rotation.set(0.04, 0.06, 0);
  g.position.set(-0.03, 0.0, 0.06);
  tilt.add(g);
  tilt.scale.setScalar(1.2);
  tilt.updateMatrixWorld(true);
  const tipW = new THREE.Vector3();
  muzzle.getWorldPosition(tipW);
  const maq = { drum, crank, hot, hotMat, H, licks, hopFlame, embers, hopY: 0.04 + 0.1 * 0.7, v: 0 };
  return { root: tilt, muzzle, anim, upgraded, tip: tipW, mouth, mate: g, bombGroup: null, yerba: null, maq };
}

// Cada cuadro (Weapons.animate y la cureña): con `hold` (el gatillo, el clic
// derecho o la manivela) el tambor toma vuelta (k de 0 a 1 en st.spinUp
// segundos) y al soltar la pierde. Devuelve k. Late la lava, suben las
// chispas, las llamas se avivan con la vuelta y el tambor se pone al rojo con
// la vuelta y el calor (0-1). g: para los ruidos (null, sin ruidos).
export function maquinaSpin(maq, dt, st, k, hold, g = null, heat = 0) {
  const up = st?.spinUp || 0.35;
  const was = k;
  k = hold ? Math.min(1, k + dt / up) : Math.max(0, k - dt * 1.6);
  // los caños que toman vuelta (una vez por apretada), el zumbido mientras
  // giran a pleno y la frenada al soltar (core/weaponSfx.js)
  const G = g?.audio?.guns;
  if (G) {
    if (hold && was === 0) G.play('gatling-arranque');
    if (hold && k >= 1 && !maq.whir) maq.whir = G.loop('gatling-giro', null, { fadeIn: 0.12 });
    if (!hold && maq.whir) {
      maq.whir.stop(0.15);
      maq.whir = null;
    }
    if (!hold && maq.held && was >= 1) G.play('gatling-fin');
  }
  maq.held = hold;
  maq.v = 1.2 + k * 36;
  maq.drum.rotation.z += dt * maq.v;
  maq.crank.rotation.x -= dt * maq.v * 0.5;
  const t = performance.now() / 1000;
  flameMaterial().uniforms.uTime.value = t;
  const h = Math.max(0, Math.min(1, heat));
  maq.hotMat.opacity = Math.min(0.7, 0.02 + k * 0.16 + h * 0.4 + Math.sin(t * 9) * 0.015 * k);
  // la lava de la calabaza late (más con la vuelta)
  maq.H.lava.emissiveIntensity = 1.3 + Math.sin(t * 3.1) * 0.35 + k * 0.6;
  maq.H.tip.color.setRGB(1, 0.22 + k * 0.25, 0.05).multiplyScalar(0.7 + k * 1.3 + h);
  // las brasas tiemblan (más vivas con la vuelta)
  for (const b of maq.licks) {
    const f = 0.75 + Math.sin(t * 11 + b.userData.ph) * 0.15 + Math.sin(t * 23 + b.userData.ph * 2) * 0.1;
    b.scale.setScalar(b.userData.s * (f + k * 0.5));
    b.material.opacity = 0.55 + f * 0.3;
  }
  maq.hopFlame.scale.set(1, 0.9 + Math.sin(t * 7) * 0.1 + k * 0.4, 1);
  // las chispas suben del mate y vuelven a empezar
  for (const e of maq.embers) {
    const u = (e.userData.ph + t * (0.6 + k * 0.8)) % 1;
    e.position.set(e.userData.x + Math.sin(t * 3 + e.userData.ph * 9) * 0.006, maq.hopY + 0.01 + u * 0.09, 0.022 + e.userData.z);
    e.scale.setScalar(1 - u * 0.8);
  }
  return k;
}

// El trazo de una bala del infierno (la de la mano, la de la cureña y la de un
// compañero): fuego por fuera, blanco caliente en el medio (mejorada, violeta).
export function hellTracer(g, a, b, up = false) {
  g.fx.beam(a, b, { color: up ? 0xb050ff : 0xff5a10, width: 0.05, life: 0.06 });
  g.fx.beam(a, b, { color: up ? 0xf0d0ff : 0xffd890, width: 0.016, life: 0.05 });
}

registerMate('gutmuerte', (up, T) => buildMaquina(!!up, T));
