import * as THREE from 'three';
import { VM, VM_POSE, registerMate } from './viewmodels';
import { flameMaterial } from '../world/castleFire';

// Los cuatro mates de la luz (el castillo del Mateendrache), en la mano:
//  · Pillán (fuego): calabaza de obsidiana con grietas de lava que laten, la
//    virola de oro con una corona de llamitas y brasas en vez de yerba.
//  · Zonda (viento): calabaza de jade con dos espirales de plata, una turbina
//    que gira en la cintura y plumas de cóndor colgando de tientos.
//  · Illapa (rayo): calabaza gris de tormenta con el rayo de oro incrustado,
//    un resorte de cobre y el cristal de cuarzo que chisporrotea.
//  · Penitente (hielo): calabaza de hielo con el corazón azul, agujas de
//    escarcha que le crecen y la virola de plata con penitentes.
// Mejorados (el temple en su altar) cambian la piel: más brillo, cuernos,
// un remolino que gira arriba, tormenta en el cristal, corona de hielo.
// Cada modelo devuelve en `elem` las piezas que anima weapons/Elementales.js.

const { mats, lathe, cyl, sph, tor, bombilla, cupHand, yerba, profileRadius, PROFILES, topOf, limb } = VM;

const cache = {};
function mat(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

// Grietas de lava pintadas en un canvas (mapa de brillo de la obsidiana).
function lavaTex() {
  return mat('lavaTex', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 256, 256);
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    x.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let px = r() * 256;
      let py = r() * 256;
      x.strokeStyle = `rgba(255,${120 + r() * 90},20,${0.6 + r() * 0.4})`;
      x.lineWidth = 1 + r() * 3;
      x.beginPath();
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        px += (r() - 0.5) * 50;
        py += (r() - 0.3) * 40;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// Una llama chiquita (dos planos cruzados con el material del fuego).
function tinyFlame(g, x, y, z, w, h) {
  const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const f = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(geo, flameMaterial());
    m.rotation.y = ry;
    f.add(m);
  }
  f.position.set(x, y, z);
  g.add(f);
  return f;
}

// Arma el mate con la mano, la inclinación de siempre y la punta de la bombilla.
function assemble({ mate, rAt, top, bomb, anim, upgraded, elem }) {
  const M = mats(null);
  mate.userData.yerba = mate.userData.yerba || null;
  // todo lo del mate (con la bombilla) va en un grupo aparte de la mano: así
  // puede girar en la palma (la recarga y la inspección del Zonda)
  const gourd = new THREE.Group();
  while (mate.children.length) gourd.add(mate.children[0]);
  mate.add(gourd);
  elem.gourd = gourd;
  elem.topY = top.y;
  elem.sideR = rAt(0.05);
  // (la bombilla queda quieta en la mano aunque la calabaza gire)
  const b = bombilla(bomb, M, top.y);
  mate.add(b.group);
  const muzzle = b.tips[0];
  elem.straw = b.straws[0];
  elem.strawLen = b.len;
  const tilt = new THREE.Group();
  // (la mano queda anotada: en el altar el mate flota solo)
  elem.hand = cupHand(M, rAt, top.y);
  mate.add(elem.hand);
  const mouth = new THREE.Object3D();
  mouth.position.set(0, top.y - 0.004, 0);
  gourd.add(mouth);
  mate.rotation.set(VM_POSE.pitch, 0, VM_POSE.roll);
  tilt.add(mate);
  tilt.rotation.y = VM_POSE.yaw;
  tilt.scale.setScalar(1.08 * VM_POSE.scale);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded, tip, mouth, mate, bombGroup: b.group, yerba: mate.userData.yerba, mk3: null, elem };
}

// La base común: cuerpo de torno con el perfil y el material, la virola y la yerba.
function body(profile, bodyMat, sx = 1, sy = 1) {
  const mate = new THREE.Group();
  const prof = PROFILES[profile];
  const b = lathe(prof, bodyMat, 28);
  b.scale.set(sx, sy, sx);
  mate.add(b);
  const t = topOf(prof);
  const top = { r: t.r * sx, y: t.y * sy };
  const rAt = (y) => profileRadius(prof, y / sy) * sx;
  return { mate, top, rAt, body: b };
}

function virola(mate, top, m, h = 0.014) {
  const v = lathe([[top.r - 0.001, top.y - h], [top.r + 0.003, top.y - h], [top.r + 0.004, top.y - h / 2], [top.r + 0.003, top.y + 0.002], [top.r - 0.001, top.y + 0.002]], m, 24);
  mate.add(v);
  return v;
}

// ---------------- Pillán (fuego) ----------------
function buildPillan(up, T) {
  const M = mats(T);
  const lava = mat(`obsidian${up ? 1 : 0}`, () => new THREE.MeshStandardMaterial({ color: 0x140e0c, roughness: 0.28, metalness: 0.2, emissive: 0xff5a14, emissiveMap: lavaTex(), emissiveIntensity: up ? 2.6 : 1.6 }));
  const { mate, top, rAt } = body('calabaza', lava, 1.05, 1.02);
  const anim = { spin: [], glow: [], wobble: null };
  const elem = { kind: 'fuego', lava, embers: [], flames: [] };
  virola(mate, top, M.gold, 0.016);
  // la corona de llamitas de oro alrededor de la boca
  const n = up ? 10 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.006, up ? 0.03 : 0.02, 5), M.gold);
    f.position.set(Math.cos(a) * (top.r + 0.002), top.y + 0.008, Math.sin(a) * (top.r + 0.002));
    f.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    mate.add(f);
  }
  // brasas en vez de yerba
  const coal = mat('coalGlow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(1.8), toneMapped: false }));
  const y0 = yerba(top.r, top.y, M);
  y0.material = coal;
  mate.add(y0);
  mate.userData.yerba = y0;
  elem.coal = coal;
  // la llamita que siempre arde en la boca, al lado de la bombilla
  elem.flames.push(tinyFlame(mate, 0.012, top.y - 0.004, -0.008, up ? 0.05 : 0.035, up ? 0.08 : 0.055));
  // las brasas que flotan alrededor (las mueve Elementales)
  const emberMat = mat('emberVm', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2.2), toneMapped: false }));
  for (let k = 0; k < (up ? 9 : 5); k++) {
    const e = sph(0.0035, emberMat, 5, 4);
    e.userData.a = (k / 5) * Math.PI * 2;
    e.userData.s = 0.6 + (k % 3) * 0.3;
    mate.add(e);
    elem.embers.push(e);
  }
  if (up) {
    // Pillán Despierto: dos cuernos de oro curvos y un anillo de fuego en la cintura
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI * 0.7), M.gold);
      horn.position.set(s * rAt(0.07), 0.07, 0);
      horn.rotation.set(0, s > 0 ? 0 : Math.PI, 0.6);
      mate.add(horn);
    }
    const ring = tor(rAt(0.045) + 0.003, 0.003, coal, 6, 30);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.045;
    mate.add(ring);
    elem.flames.push(tinyFlame(mate, -0.02, top.y - 0.004, 0.01, 0.04, 0.06));
  }
  return assemble({ mate, rAt, top, bomb: { len: 0.2, thick: 1.8, mat: M.dark }, anim, upgraded: up, elem });
}

// ---------------- Zonda (viento) ----------------
function buildZonda(up, T) {
  const M = mats(T);
  const jade = mat('jade', () => new THREE.MeshStandardMaterial({ color: 0x7fbf98, roughness: 0.3, metalness: 0.15, emissive: 0x0c3a22, emissiveIntensity: 0.5 }));
  const { mate, top, rAt } = body('porongo', jade, 1.02, 1);
  const anim = { spin: [], glow: [], wobble: null };
  const elem = { kind: 'viento', feathers: [], turbine: null, tornado: null };
  // dos espirales de plata grabadas, que suben dando vueltas
  for (const off of [0, Math.PI]) {
    const pts = [];
    const h = top.y - 0.012;
    for (let i = 0; i <= 80; i++) {
      const y = 0.006 + (i / 80) * (h - 0.006);
      const a = off + (y / h) * Math.PI * 3;
      const r = rAt(y) + 0.0012;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.0022, 5), M.silver));
  }
  virola(mate, top, M.silver, 0.012);
  const y0 = yerba(top.r, top.y, M);
  mate.add(y0);
  mate.userData.yerba = y0;
  // la turbina de plata en la cintura: un aro con paletas (gira)
  const turb = new THREE.Group();
  const ty = 0.052;
  turb.position.y = ty;
  const R = rAt(ty) + 0.009;
  turb.add(tor(R, 0.0028, M.silver, 6, 32));
  turb.children[0].rotation.x = Math.PI / 2;
  for (let k = 0; k < (up ? 12 : 8); k++) {
    const a = (k / (up ? 12 : 8)) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.006), M.silver);
    blade.position.set(Math.cos(a) * (R + 0.005), 0, Math.sin(a) * (R + 0.005));
    blade.rotation.set(0.6, -a, 0);
    turb.add(blade);
  }
  mate.add(turb);
  elem.turbine = turb;
  elem.turbineR = R + 0.006;
  // plumas de cóndor (negras con la punta blanca) colgando de tientos
  const featherMat = mat('feather', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, side: THREE.DoubleSide }));
  const tipMat = mat('featherTip', () => new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7, side: THREE.DoubleSide }));
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Group();
    f.position.set(rAt(0.08) + 0.004, 0.085 - k * 0.004, -0.012 + k * 0.012);
    f.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.02, 3), M.leather));
    f.children[0].position.y = -0.01;
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.05), featherMat);
    vane.position.y = -0.045;
    f.add(vane);
    const tipM = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.012), tipMat);
    tipM.position.y = -0.074;
    f.add(tipM);
    f.rotation.z = 0.2 + k * 0.15;
    mate.add(f);
    elem.feathers.push(f);
  }
  if (up) {
    // Zonda Desatado: el remolino que gira arriba de la boca y dos alas de plata
    const twister = new THREE.Group();
    twister.position.set(0, top.y + 0.005, 0.018);
    const wind = mat('twister', () => new THREE.MeshBasicMaterial({ color: 0xa8e8c4, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.008 + k * 0.004, 0.035, 10, 1, true), wind);
      cone.rotation.x = Math.PI;
      cone.position.y = 0.025 + k * 0.004;
      cone.scale.set(1, 1, 0.9);
      twister.add(cone);
    }
    mate.add(twister);
    elem.tornado = twister;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 3), M.silver);
      wing.scale.set(1, 1, 0.15);
      wing.position.set(s * (rAt(0.06) + 0.012), 0.066, -0.006);
      wing.rotation.set(0, 0, s * -1.1);
      mate.add(wing);
    }
    const runes = mat('runeGreen', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6affa8).multiplyScalar(2), toneMapped: false }));
    const band = tor(rAt(0.03) + 0.0015, 0.002, runes, 5, 28);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.03;
    mate.add(band);
    anim.glow.push(band);
  }
  return assemble({ mate, rAt, top, bomb: { len: 0.21, thick: 1.4, mat: M.silver }, anim, upgraded: up, elem });
}

// ---------------- Illapa (rayo) ----------------
function buildIllapa(up, T) {
  const M = mats(T);
  const storm = mat(`storm${up ? 1 : 0}`, () => new THREE.MeshStandardMaterial({ color: up ? 0x2c3350 : 0x323a48, roughness: 0.32, metalness: 0.45 }));
  const { mate, top, rAt } = body('calabaza', storm, 1.02, 1.04);
  const anim = { spin: [], glow: [], wobble: null };
  const elem = { kind: 'rayo', arcs: [], orb: null };
  // el rayo de oro incrustado (del lado que se ve)
  const boltMat = mat('boltYellow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd84a).multiplyScalar(up ? 2 : 1.4), toneMapped: false }));
  const pts = [[2.1, 0.09], [2.55, 0.072], [2.2, 0.062], [2.7, 0.04], [2.35, 0.03], [2.8, 0.012]].map(([a, y]) => new THREE.Vector3(Math.cos(a) * (rAt(y) + 0.0008), y, Math.sin(a) * (rAt(y) + 0.0008)));
  for (let i = 0; i < pts.length - 1; i++) mate.add(limb(pts[i], pts[i + 1], 0.0028, boltMat));
  // el resorte de cobre abajo
  const coil = [];
  for (let i = 0; i <= 90; i++) {
    const y = 0.008 + (i / 90) * 0.03;
    const a = (i / 90) * Math.PI * 2 * 6;
    const r = rAt(y) + 0.0022;
    coil.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  mate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 180, 0.0017, 5), M.copper));
  virola(mate, top, M.copper, 0.014);
  // los pararrayos de la virola
  elem.rods = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const rod = cyl(0.0012, 0.002, 0.018, M.copper, 5);
    rod.position.set(Math.cos(a) * top.r, top.y + 0.009, Math.sin(a) * top.r);
    mate.add(rod);
    elem.rods.push(rod);
  }
  const y0 = yerba(top.r, top.y, M);
  mate.add(y0);
  mate.userData.yerba = y0;
  // el cristal de cuarzo, en una ventanita del lado de la cara
  const cy = top.y * 0.52;
  const win = new THREE.Group();
  win.position.set(0, cy, rAt(cy) - 0.002);
  win.add(tor(0.015, 0.003, M.copper, 8, 24));
  const orbMat = mat(`orb${up ? 1 : 0}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(up ? 0xfff0a0 : 0xe8f0ff).multiplyScalar(2.4), toneMapped: false }));
  const orb = sph(0.011, orbMat, 12, 8);
  orb.position.z = 0.002;
  win.add(orb);
  mate.add(win);
  elem.orb = orb;
  elem.orbMat = orbMat;
  anim.glow.push(orb);
  // los arcos (segmentos finitos que Elementales mueve al azar)
  const arcMat = mat('arcVm', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4a0).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  for (let k = 0; k < (up ? 6 : 3); k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 4, 1, true), arcMat);
    seg.visible = false;
    mate.add(seg);
    elem.arcs.push(seg);
  }
  elem.arcFrom = win.position.clone();
  elem.topY = top.y;
  elem.topR = top.r;
  if (up) {
    // Tormenta de Illapa: cuernos de oro y una nubecita adentro del cristal
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 6), M.gold);
      horn.position.set(s * (top.r - 0.004), top.y + 0.018, -0.01);
      horn.rotation.set(-0.3, 0, s * -0.5);
      mate.add(horn);
    }
    const cloud = sph(0.006, mat('cloudVm', () => new THREE.MeshBasicMaterial({ color: 0x3a4a6a })), 8, 6);
    cloud.position.set(0.003, 0.003, 0.004);
    win.add(cloud);
    elem.cloud = cloud;
  }
  // bombilla de cobre con la punta en horqueta
  const res = assemble({ mate, rAt, top, bomb: { len: 0.2, thick: 1.6, mat: M.copper }, anim, upgraded: up, elem });
  for (const s of [-1, 1]) {
    const prong = cyl(0.0022, 0.0022, 0.018, M.copper, 5);
    prong.position.set(s * 0.006, 0.006, 0);
    prong.rotation.z = s * -0.5;
    res.muzzle.add(prong);
  }
  return res;
}

// ---------------- Penitente (hielo) ----------------
function buildPenitente(up, T) {
  const M = mats(T);
  const ice = mat(`vmIce${up ? 1 : 0}`, () => new THREE.MeshPhysicalMaterial({ color: 0xc8e8f8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, emissive: 0x1a5a8a, emissiveIntensity: up ? 0.35 : 0.18, depthWrite: false }));
  const { mate, top, rAt } = body('camionero', ice, 0.92, 1.05);
  const anim = { spin: [], glow: [], wobble: null };
  const elem = { kind: 'hielo', spikes: [], flakes: [] };
  // el corazón azul que se ve a través del hielo
  const coreMat = mat(`iceCore${up ? 1 : 0}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(up ? 0x5ac8ff : 0x2a7ac8).multiplyScalar(up ? 2 : 1.3), toneMapped: false }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), coreMat);
  core.scale.set(rAt(0.05) * 0.55, 0.035, rAt(0.05) * 0.55);
  core.position.y = 0.05;
  mate.add(core);
  elem.core = core;
  elem.coreMat = coreMat;
  anim.glow.push(core);
  virola(mate, top, M.silver, 0.016);
  // yerba congelada (blanca y brillante)
  const frozen = mat('frozenYerba', () => new THREE.MeshStandardMaterial({ color: 0xe8f4f0, roughness: 0.25, emissive: 0x3a6a7a, emissiveIntensity: 0.4 }));
  const y0 = yerba(top.r, top.y, M);
  y0.material = frozen;
  mate.add(y0);
  mate.userData.yerba = y0;
  // agujas de escarcha que le crecen de costado
  const spikeMat = mat('vmSpike', () => new THREE.MeshStandardMaterial({ color: 0xcfe8f6, roughness: 0.08, emissive: 0x2a6aa0, emissiveIntensity: 0.25 }));
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < (up ? 12 : 7); k++) {
    const y = 0.02 + r() * (top.y - 0.03);
    const a = 1.2 + r() * 2.4;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02 + r() * 0.02, 4), spikeMat);
    const out = new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)).normalize();
    s.position.set(Math.cos(a) * rAt(y), y, Math.sin(a) * rAt(y));
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
    mate.add(s);
    elem.spikes.push(s);
  }
  // la virola con penitentes (la corona de hielo; mejorada, más alta)
  for (let k = 0; k < (up ? 10 : 7); k++) {
    const a = (k / (up ? 10 : 7)) * Math.PI * 2;
    const h = (up ? 0.035 : 0.02) * (0.7 + ((k * 7) % 5) * 0.12);
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.004, h, 4), spikeMat);
    p.position.set(Math.cos(a) * (top.r + 0.003), top.y + h / 2, Math.sin(a) * (top.r + 0.003));
    mate.add(p);
    elem.spikes.push(p);
  }
  if (up) {
    // Penitente Eterno: copos que giran alrededor
    const flakeMat = mat('flakeVm', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f8ff).multiplyScalar(1.8), side: THREE.DoubleSide, toneMapped: false }));
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.004, 6), flakeMat);
      f.userData.a = (k / 6) * Math.PI * 2;
      mate.add(f);
      elem.flakes.push(f);
    }
  }
  elem.topY = top.y;
  return assemble({ mate, rAt, top, bomb: { len: 0.2, thick: 1.4, mat: M.silver }, anim, upgraded: up, elem });
}

registerMate('pillan', (up, T) => buildPillan(!!up, T));
registerMate('zonda', (up, T) => buildZonda(!!up, T));
registerMate('illapa', (up, T) => buildIllapa(!!up, T));
registerMate('penitente', (up, T) => buildPenitente(!!up, T));

export const ELEMENTAL_IDS = ['pillan', 'zonda', 'illapa', 'penitente'];
