import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toWorld, hLoc, YAW } from '../../world/eclipse/sanlorenzoCampo';
import { zombieHealth } from '../../config/rules';
import { buildFacon } from '../../ui/eclipseCineSets';
import { eclSfx } from '../../fx/eclipseSfx';
import FinEclipseBlend, { finBlendOn, preloadFinEclipse } from '../../ui/finEclipseBlend';
import Cupula from './cupula';
import { desgarradorModel } from '../../weapons/desgarradorModels';
import { myId } from './common';

// El final nuevo de San Lorenzo (el usuario, 2026-10-12; plan aprobado esa
// noche): rota la corona, todos van a Belgrano; un encierro de 30 s; una onda
// los mata a todos; las guadañas vuelan y se funden en el súper facón (el
// Facón Relámpago de Mate no Numa, más grande) mientras los cuatro caballeros
// le tiran sus mates; el Gil lo toma, la luz lo sube al pie de una rampa de
// piso arrancado que se arma delante de él mientras corre, y los demás lo
// cuidan desde abajo. Después sigue la cinemática (Blender: fin-eclipse; en
// gris, esperando el sí). La canción nueva (final-eclipse) arranca con la
// corona rota y su final abrupto (69,4 s) cae en el salto.
// (2026-10-14, el usuario: "Prende el final si": el final nuevo es EL final del juego. Prendido por defecto;
// globalThis.__mduSlFinal = false puesto antes de cargar vuelve al final viejo. Se lee en cada llamada, no al
// cargar el módulo)
export const finOn = () => globalThis.__mduSlFinal !== false;

// la hora de cada cosa, desde la corona rota (= el segundo de la canción)
const T_RING = 16.75;
const T_ONDA = 46.75;
const T_FORJA = 47.5;
const T_KNIGHT0 = 49;
const T_KNIGHT1 = 59;
const T_FACON = 60.5;
const T_RUN = 62.6;
const T_CINE = 67.4;
const T_END = 69.4;
// Belgrano y su encierro; la rampa (u del campo) y la carrera
const BEL = [8.5, 3.5];
const RING_R = 11;
const RUN_V = 6.4;
const U_CINE = 20.5;
const U0 = U_CINE - RUN_V * (T_CINE - T_RUN);
const U_FLAT = 27.5;
const U1 = 30;
const Y0 = 16;
const Y1 = 25;
const rampY = (u) => (u >= U_FLAT ? Y1 : Y0 + (Y1 - Y0) * Math.max(0, u - U0) / (U_FLAT - U0));
const KCOL = [0xff6a20, 0x8affd8, 0xfff27a, 0x8cc8ff];
// (fase 4, 2026-10-14: lo que faltaba de la fase 2. Cada parte con su interruptor, puesto antes de cargar:
//  __mduSlFinalSinCaballeros: las columnas de colores en vez de los caballeros de verdad;
//  __mduSlFinalGuadanasViejas: las cuatro guadañas de geometría simple, sin el modelo ni las de luz;
//  __mduSlFinalSinFaconMano: el facón se apaga al llegar, sin pasar a la mano del Gil;
//  __mduSlFinalSinJinetes: sin la tanda de jinetes contra el Gil en la carrera (entities/eclipse/slJinetes);
//  __mduSlFinalAnilloViejo: el anillo del encierro violeta parejo)
const SW = (k) => globalThis[`__mduSlFinal${k}`] === true;
// de un ángulo a otro por el lado corto
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// las guadañas: tamaño, de dónde salen las de luz (los desgarros del cielo) y cuánto tardan en llegar
const SCY_K = 1.7;
const RIFT_R = 18;
const RIFT_Y = 26;
const SCY_IN = 2.4;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tmpS = new THREE.Vector3();

// Las bandas del anillo del encierro: más luz abajo y tres franjas finas que se esfuman hacia arriba.
let BANDS = null;
function ringBands() {
  if (BANDS) return BANDS;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(4, 128);
  for (let j = 0; j < 128; j++) {
    const v = j / 127;
    // (la textura va de arriba —v 0— a abajo; el cilindro la pone al revés: 1 es arriba)
    const up = 1 - v;
    let a = Math.pow(1 - up, 3) * 0.9;
    for (const b of [0.18, 0.42, 0.66]) a += Math.exp(-(((up - b) / 0.018) ** 2)) * 0.55 * (1 - up);
    const k = Math.min(255, Math.round(a * 255));
    for (let i = 0; i < 4; i++) img.data.set([k, k, k, 255], (j * 4 + i) * 4);
  }
  x.putImageData(img, 0, 0);
  BANDS = new THREE.CanvasTexture(c);
  return BANDS;
}

// Una guadaña de luz (las que salen de los desgarros cuando hay menos de cuatro jugadores): el mismo modelo,
// hecho luz violeta.
let LIGHT_MAT = null;
function lightScythe(m) {
  LIGHT_MAT ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.45, 1).multiplyScalar(1.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  m.traverse((o) => {
    if (o.isMesh || o.isSprite || o.isPoints) o.material = LIGHT_MAT;
  });
  m.userData.light = true;
  return m;
}

// ---------------- las losas de la rampa: campo arrancado ----------------
// (2026-10-14, el usuario: "el piso que se levanta es muy básico, no tiene texturas ni nada". Cada losa es un
// pedazo de campo arrancado: arriba, el pasto del campo con su mismo material —world/eclipse/sanlorenzoLook,
// la textura y el anti-tiling por posición en el mundo, así que sigue al pasto de alrededor—, con el borde
// roto y algún terrón y mata suelta; abajo, un cono irregular de tierra, raíces y roca, con el material de lo
// construido del campo. Los dos materiales ya están compilados —son los del campo—: subir no recompila nada.
// La forma sale de una semilla por losa: igual en todas las compus. __mduSlFinalRampaLisa: la caja de antes)
const cA = new THREE.Color();
const cB = new THREE.Color();
function chunkGeos(L, H, W, seed) {
  const R = rng(seed);
  const NX = 8;
  const NZ = 6;
  const top = H / 2;
  // la tapa: una grilla con el borde roto (hacia adentro, más de costado que en las puntas) y bultitos
  const P = [];
  const C = [];
  const edge = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      let x = (i / NX - 0.5) * L;
      let z = (j / NZ - 0.5) * W;
      const bx = i === 0 || i === NX;
      const bz = j === 0 || j === NZ;
      let y = top + (bx || bz ? -0.04 - R() * 0.08 : (R() - 0.5) * 0.07);
      if (bz) z *= 1 - R() * 0.16;
      if (bx) x *= 1 - R() * 0.05;
      if (bz && !bx) x += (R() - 0.5) * (L / NX) * 0.5;
      if (bx && !bz) z += (R() - 0.5) * (W / NZ) * 0.5;
      P.push(x, y, z);
      // el pasto del campo (más seco o más oscuro a manchas) y, en el borde, la tierra que asoma
      cA.set(0x6e8434).lerp(cB.set(R() < 0.5 ? 0x948a44 : 0x56682a), R() * 0.6);
      // (un poco más claro que el suelo: el campo de alrededor se ve verde por las matas de pasto, que acá no van)
      cA.multiplyScalar(1.3);
      if (bx || bz) cA.lerp(cB.set(0x7a5636), 0.55);
      C.push(cA.r, cA.g, cA.b);
      if (bx || bz) edge.push(j * (NX + 1) + i);
    }
  }
  const T = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      T.push([a, a + 1, a + NX + 1], [a + 1, a + NX + 2, a + NX + 1]);
    }
  }
  const topGeo = triGeo(P, C, T, (n) => n.y < 0);
  // el contorno de la tapa, en orden alrededor
  const ring = [];
  for (let i = 0; i <= NX; i++) ring.push(i);
  for (let j = 1; j <= NZ; j++) ring.push(j * (NX + 1) + NX);
  for (let i = NX - 1; i >= 0; i--) ring.push(NZ * (NX + 1) + i);
  for (let j = NZ - 1; j >= 1; j--) ring.push(j * (NX + 1));
  // el cuerpo: tres anillos que bajan y se cierran (tierra oscura con raíces, tierra, arcilla y roca) y la
  // punta de abajo, roca
  const BP = [];
  const BC = [];
  const BT = [];
  const n = ring.length;
  const rings = [
    { k: 1.0, dy: -0.06, col: () => (R() < 0.25 ? 0x2c2620 : 0x4a3a2a) },
    { k: 0.86, dy: -0.42 - R() * 0.1, col: () => (R() < 0.3 ? 0x5a4632 : 0x7a5636) },
    { k: 0.58, dy: -H * 0.9, col: () => (R() < 0.35 ? 0x5a4a40 : R() < 0.5 ? 0x823e22 : 0x7a5636) },
  ];
  for (const rg of rings) {
    for (let q = 0; q < n; q++) {
      const v = ring[q];
      // (el primero, apenas afuera del borde de la tapa: sin rendija entre la tapa y la tierra)
      const jit = rg === rings[0] ? 1 + 0.02 + R() * 0.03 : 1 + (R() - 0.5) * 0.12;
      const x = P[v * 3] * rg.k * jit;
      const z = P[v * 3 + 2] * rg.k * jit;
      const y = rg === rings[0] ? P[v * 3 + 1] + rg.dy : top + rg.dy - R() * (rg === rings[2] ? 0.55 : 0.12);
      BP.push(x, y, z);
      cA.set(rg.col());
      BC.push(cA.r, cA.g, cA.b);
    }
  }
  const tip = BP.length / 3;
  BP.push((R() - 0.5) * 0.3, top - H * 1.45 - R() * 0.4, (R() - 0.5) * 0.3);
  cA.set(0x2e2630);
  BC.push(cA.r, cA.g, cA.b);
  for (let r = 0; r < 2; r++) {
    for (let q = 0; q < n; q++) {
      const a = r * n + q;
      const b = r * n + ((q + 1) % n);
      BT.push([a, b, b + n], [a, b + n, a + n]);
    }
  }
  for (let q = 0; q < n; q++) BT.push([2 * n + q, 2 * n + ((q + 1) % n), tip]);
  const parts = [triGeo(BP, BC, BT, (nn, c) => nn.x * c.x + nn.z * c.z + (c.y < top - H ? -nn.y : 0) < 0)];
  // terrones y matas sueltas arriba
  const nC = 2 + Math.floor(R() * 3);
  for (let k = 0; k < nC; k++) {
    const g = new THREE.IcosahedronGeometry(0.1 + R() * 0.12, 0).toNonIndexed();
    g.translate((R() - 0.5) * L * 0.8, top + 0.03, (R() - 0.5) * W * 0.7);
    paintGeo(g, R() < 0.5 ? 0x4a3a2a : 0x7a5636);
    parts.push(g);
  }
  // matas: cada una, cuatro a seis hojas finas y torcidas (no conos: de cerca se leían como pinches)
  const nT = 10 + Math.floor(R() * 7);
  for (let k = 0; k < nT; k++) {
    const x0 = (R() - 0.5) * L * 0.85;
    const z0 = (R() - 0.5) * W * 0.75;
    const col = R() < 0.5 ? 0x56682a : R() < 0.5 ? 0x6e8434 : 0x948a44;
    const nb = 4 + Math.floor(R() * 3);
    for (let b = 0; b < nb; b++) {
      const h = 0.16 + R() * 0.22;
      const g = new THREE.ConeGeometry(0.012 + R() * 0.008, h, 3).toNonIndexed();
      g.translate(0, h / 2, 0);
      g.rotateZ((R() - 0.5) * 0.9);
      g.rotateY(R() * Math.PI * 2);
      g.translate(x0 + (R() - 0.5) * 0.08, top - 0.03, z0 + (R() - 0.5) * 0.08);
      paintGeo(g, col);
      parts.push(g);
    }
  }
  for (const g of parts) {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.computeVertexNormals();
  }
  const bodyGeo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return { topGeo, bodyGeo };
}

// Triángulos sueltos (cada cara con su normal: se ve facetado, como el campo), girados para afuera.
function triGeo(P, C, T, flip) {
  const pos = [];
  const col = [];
  const uv = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const ce = new THREE.Vector3();
  for (const tri of T) {
    let [i, j, k] = tri;
    a.fromArray(P, i * 3);
    b.fromArray(P, j * 3);
    c.fromArray(P, k * 3);
    nn.subVectors(b, a).cross(tmpS.subVectors(c, a));
    ce.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (flip(nn, ce)) [j, k] = [k, j];
    for (const v of [i, j, k]) {
      pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
      uv.push(P[v * 3] * 0.22, P[v * 3 + 2] * 0.22);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function paintGeo(g, hex) {
  cA.set(hex);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([cA.r, cA.g, cA.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('normal');
}

export default class SlFinal {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    this.root = new THREE.Group();
    this.root.name = 'slFinal';
    this.g.scene.add(this.root);
    this.t0 = 0;
    this.on = false;
    this.done = {};
    this.noSpawn = false;
    // (fase 3: la cinemática de Blender aprobada en gris, ui/finEclipseBlend; se baja desde ya)
    if (finBlendOn()) preloadFinEclipse().then((D) => (this.blendD = D));
  }

  bel(y = 0) {
    return toWorld(BEL[0], BEL[1], hLoc(BEL[0], BEL[1]) + y, new THREE.Vector3());
  }

  // (todas) Arranca con la corona rota; late: segundos que ya pasaron (el que entra tarde).
  start(late = 0) {
    this.on = true;
    this.t0 = performance.now() / 1000 - late;
    const g = this.g;
    g.music?.play('final-eclipse', { at: Math.max(0, late), fadeIn: 0.2 });
    g.hud?.subtitle?.('¡A Belgrano!', 4);
    this.buildRing();
    this.buildRamp();
    // (los caballeros se arman ya, escondidos: se visten y se compilan antes de bajar —cupula.js dress—)
    if (!SW('SinCaballeros')) this.buildKnights();
    // (el que entra tarde: lo que ya pasó no se repite —el encierro no lo trae si la onda ya pasó—)
    this.late = late;
  }

  isGil() {
    const ee = this.sl.ee;
    return !this.g.net || !ee?.isGil || ee.isGil() || !ee.roles?.size;
  }

  once(k, t, fn) {
    if (this.done[k] || this.t < t) return;
    this.done[k] = true;
    fn();
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    this.t = performance.now() / 1000 - this.t0;
    const t = this.t;
    // la marca de Belgrano (late) y el anillo que se cierra
    if (this.beacon) this.beacon.material.opacity = t < T_RING ? 0.35 + 0.15 * Math.sin(t * 4) : Math.max(0, this.beacon.material.opacity - dt * 0.5);
    this.once('ring', T_RING, () => this.closeRing());
    if (this.ring) {
      const k = THREE.MathUtils.clamp((t - T_RING) / 0.8, 0, 1) * (t < T_ONDA ? 1 : Math.max(0, 1 - (t - T_ONDA) / 0.6));
      this.ring.scale.set(1, Math.max(0.001, k), 1);
      this.ring.material.opacity = this.ring.userData.op * k;
      this.ring.rotation.y += dt * 0.4;
      if (t >= T_RING && t < T_ONDA) this.keepInside();
    }
    // los muertos: encierro, nada después de la onda, vuelven con la carrera
    if (this.sl.host && !this.noSpawn && t >= T_RING && t < T_ONDA) this.horde(dt, 1);
    if (this.sl.host && t >= T_RUN + 1.4 && t < T_END) this.horde(dt, 0.8);
    this.once('onda', T_ONDA, () => this.onda());
    this.forge(t, dt);
    // (la onda se abre desde que sale, 46,75 s: antes iba adentro de la forja, que arranca a los 47,5, y se
    // quedaba quieta ese rato)
    this.waveTick(dt);
    this.knightsTick(t, dt);
    this.handsTick(t);
    this.once('facon', T_FACON, () => this.faconReady());
    this.once('mano', T_RUN, () => this.faconToHand());
    this.carry(t);
    this.ramp(t, dt);
    // (fase 3) la cinemática arranca cuando el Gil llega a u 20,5 de la rampa (el primer cuadro de la de
    // Blender); el final de hoy sigue cuando ella termina
    if (finBlendOn()) this.once('blend', T_CINE, () => this.startBlend());
    this.once('cine', T_END, () => this.end());
  }

  // ---------------- Belgrano y el encierro ----------------
  buildRing() {
    const c = this.bel();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(c).add(new THREE.Vector3(0, 30, 0));
    this.root.add(m);
    this.beacon = m;
    // (fase 4: mirando afuera, el anillo parejo teñía todo de violeta. Ahora son bandas que se esfuman hacia
    // arriba —más luz abajo, en el borde, y tres franjas finas—; __mduSlFinalAnilloViejo: como antes)
    const old = SW('AnilloViejo');
    const r = new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, 4, 48, 1, true), new THREE.MeshBasicMaterial({ color: old ? 0x9a50ff : 0xb070ff, map: old ? null : ringBands(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    r.userData.op = old ? 0.22 : 0.5;
    r.geometry.translate(0, 2, 0);
    r.position.copy(c);
    r.scale.set(1, 0.001, 1);
    this.root.add(r);
    this.ring = r;
  }

  // (todas) Se cierra: al que quedó afuera lo trae la luz.
  closeRing() {
    const g = this.g;
    g.post?.flash?.(0.25);
    const P = g.player;
    const c = this.bel();
    if (this.t < T_ONDA && P.alive && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > RING_R - 1) {
      const a = Math.random() * Math.PI * 2;
      P.pos.set(c.x + Math.cos(a) * 6, c.y, c.z + Math.sin(a) * 6);
      P.vel?.set?.(0, 0, 0);
    }
  }

  // (cada uno el suyo) Nadie sale del anillo.
  keepInside() {
    const P = this.g.player;
    const c = this.bel();
    const dx = P.pos.x - c.x;
    const dz = P.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const R = RING_R - 0.6;
    if (d > R) {
      P.pos.x = c.x + (dx / d) * R;
      P.pos.z = c.z + (dz / d) * R;
    }
  }

  // (anfitrión) Los muertos salen del pasto alrededor del anillo.
  horde(dt, k) {
    const g = this.g;
    this.spawnT = (this.spawnT || 0) - dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.35 / k;
    const n = g.net ? 1 + g.net.remote.size : 1;
    if (g.zombies.alive >= Math.round((30 + 6 * (n - 1)) * k)) return;
    const round = Math.max(8, g.rounds?.round || 12);
    const a = Math.random() * Math.PI * 2;
    // (fase 4: en la carrera vuelven para los de abajo —los que no son el Gil—, alrededor de donde estén; si
    // no hay ninguno, no salen. __mduSlFinalMuertosViejos: alrededor de Belgrano, como antes)
    if (this.t >= T_RUN && globalThis.__mduSlFinalMuertosViejos !== true) {
      const c = this.othersCenter();
      if (!c) return;
      const r = 9 + Math.random() * 9;
      const at = new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      at.y = g.world.floorAt?.(at.x, at.z, c.y + 3) ?? c.y;
      if (!Number.isFinite(at.y)) return;
      g.zombies.spawn(round, zombieHealth(round), at);
      return;
    }
    const r = RING_R + 2 + Math.random() * 9;
    const at = toWorld(BEL[0] + Math.cos(a) * r, BEL[1] + Math.sin(a) * r, null, new THREE.Vector3());
    g.zombies.spawn(round, zombieHealth(round), at);
  }

  // (anfitrión) El medio de los que miran desde abajo (vivos y que no son el Gil).
  othersCenter() {
    const g = this.g;
    const ee = this.sl.ee;
    const c = new THREE.Vector3();
    let n = 0;
    const add = (id, pos, ok) => {
      if (!ok || !pos || ee?.isGil?.(id)) return;
      c.add(pos);
      n++;
    };
    add(myId(g), g.player.pos, g.player.alive && !!g.net);
    if (g.net) for (const r of g.net.remote.values()) add(r.id, r.pos, !r.dead);
    return n ? c.multiplyScalar(1 / n) : null;
  }

  // ---------------- la onda ----------------
  onda() {
    const g = this.g;
    const c = this.bel(1);
    g.post?.flash?.(0.7);
    g.shake?.(0.6);
    if (this.sl.host) {
      for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', point: z.pos.clone().setY(z.pos.y + 1), dir: new THREE.Vector3(0, 1, 0), noPoints: true });
    }
    const P = g.player;
    if (P.downed || !P.alive) P.revive?.();
    // el anillo de la onda, que se va abriendo
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    w.rotation.x = Math.PI / 2;
    w.position.copy(c);
    this.root.add(w);
    this.wave = { m: w, t: 0 };
    eclSfx(g).play('furia-fin', { gain: 1 });
  }

  // ---------------- la forja ----------------
  buildForge() {
    const F = new THREE.Group();
    this.root.add(F);
    this.forjaG = F;
    if (!SW('GuadanasViejas')) {
      this.buildScythes(F);
      this.buildPillars();
      return;
    }
    const blade = new THREE.MeshStandardMaterial({ color: 0x2a1840, emissive: 0x9a50ff, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide });
    const pole = new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.8 });
    this.scythes = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Group();
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 4, 20, Math.PI * 0.85), blade);
      b.scale.set(1, 1, 0.3);
      b.position.set(0, 1.0, 0);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), pole);
      s.add(b, h);
      F.add(s);
      this.scythes.push(s);
    }
    this.buildPillars();
  }

  buildPillars() {
    if (this.cup) return;
    this.beams = KCOL.map((col) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.root.add(m);
      return m;
    });
    this.pillars = KCOL.map((col) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.root.add(m);
      return m;
    });
  }

  forge(t, dt) {
    if (t < T_FORJA || t > T_RUN + 1) {
      if (this.forjaG && t > T_RUN + 1) this.forjaG.visible = false;
      return;
    }
    if (!this.forjaG) this.buildForge();
    const C = this.bel(9);
    const k = THREE.MathUtils.clamp((t - T_FORJA) / (T_FACON - T_FORJA), 0, 1);
    // las cuatro guadañas: salen de las manos de cada uno (y las de luz, de los desgarros del cielo) y dan
    // vueltas en espiral, cada vez más juntas y rápido
    this.scythes.forEach((s, i) => {
      const rise = THREE.MathUtils.clamp((t - T_FORJA) / (s.userData.from ? SCY_IN : 2.2), 0, 1);
      const r = 6.5 * (1 - k * k) * rise + 0.05;
      const a = i * (Math.PI / 2) + k * k * 14 + t * 0.6;
      tmpS.set(C.x + Math.cos(a) * r, C.y - (s.userData.from ? 0 : (1 - rise) * 8), C.z + Math.sin(a) * r);
      if (s.userData.from) s.position.lerpVectors(s.userData.from, tmpS, rise * rise * (3 - 2 * rise));
      else s.position.copy(tmpS);
      s.rotation.set(0.4, a * 2.2, t * (3 + k * 12));
      s.visible = t < T_FACON;
    });
    // los cuatro caballeros: con los de verdad (knightsTick) estas columnas no van
    if (this.pillars) this.pillarsTick(t, C);
  }

  pillarsTick(t, C) {
    const on = t >= T_KNIGHT0 && t < T_KNIGHT1 + 1.2;
    const kk = on ? Math.min(1, (t - T_KNIGHT0) / 1.2) * Math.min(1, (T_KNIGHT1 + 1.2 - t) / 1.2) : 0;
    this.pillars.forEach((p, i) => {
      const a = i * (Math.PI / 2) + 0.4;
      const at = toWorld(BEL[0] + Math.cos(a) * 14, BEL[1] + Math.sin(a) * 14, null, new THREE.Vector3());
      p.position.copy(at).add(new THREE.Vector3(0, 20, 0));
      p.material.opacity = 0.35 * kk;
      const b = this.beams[i];
      const from = at.clone().add(new THREE.Vector3(0, 1.6, 0));
      const d = C.clone().sub(from);
      b.position.copy(from).addScaledVector(d, 0.5);
      b.scale.set(1 + 0.3 * Math.sin(t * 20 + i), d.length(), 1 + 0.3 * Math.sin(t * 17 + i));
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      b.material.opacity = (t >= T_KNIGHT0 + 1.2 ? 0.75 : 0) * kk;
    });
  }

  // la onda que se abre
  waveTick(dt) {
    if (this.wave) {
      this.wave.t += dt;
      const s = 1 + this.wave.t * 45;
      this.wave.m.scale.set(s, s, 1 + this.wave.t * 4);
      this.wave.m.material.opacity = Math.max(0, 0.9 - this.wave.t * 0.6);
      if (this.wave.t > 1.6) {
        this.root.remove(this.wave.m);
        this.wave = null;
      }
    }
  }

  // Las guadañas de la forja (fase 4): la de cada jugador, con el modelo del Desgarrador (la mejorada si la
  // tiene), sale de su mano; hasta cuatro, las que faltan son de luz y bajan de los desgarros del cielo. El
  // orden es el de los ids, igual en todas las compus.
  buildScythes(F) {
    const g = this.g;
    const me = myId(g);
    const ids = [me, ...(g.net ? [...g.net.remote.keys()] : [])].sort();
    const C = this.bel(9);
    this.scythes = [];
    for (let i = 0; i < 4; i++) {
      const id = ids[i];
      let m;
      if (id != null) {
        m = desgarradorModel(this.upOf(id));
        const p = id === me ? g.player.pos : g.net?.remote.get(id)?.pos;
        m.userData.from = p ? new THREE.Vector3(p.x, p.y + 1.3, p.z) : null;
      } else {
        m = desgarradorModel(0);
        lightScythe(m);
        const a = i * (Math.PI / 2) + 0.8;
        m.userData.from = new THREE.Vector3(C.x + Math.cos(a) * RIFT_R, C.y + RIFT_Y, C.z + Math.sin(a) * RIFT_R);
        // el desgarro: un fogonazo violeta donde se abre
        g.fx?.flash?.(m.userData.from, 0xb050ff, 14, 0.7, 40);
      }
      m.scale.setScalar(SCY_K);
      if (m.userData.from) m.position.copy(m.userData.from);
      F.add(m);
      this.scythes.push(m);
    }
  }

  // ¿Tiene la guadaña mejorada? (la propia: las ranuras; la de otro: lo que sabe su muñeco, si lo sabe)
  upOf(id) {
    const g = this.g;
    if (id === myId(g)) return g.weapons?.slots?.find((x) => x.id === 'desgarrador')?.up ? 1 : 0;
    const r = g.net?.remote.get(id);
    return r?.up || r?.wUp ? 1 : 0;
  }

  // (fase 4) Mientras la guadaña está en la forja, no está en la mano: la del que la tenía en la mano se va
  // de la vista (Game.update: ee.handsOff) desde que sube hasta que llega el facón.
  handsTick(t) {
    const ee = this.sl.ee;
    if (!ee) return;
    // (con la escena del salto: nada en la mano desde su primer cuadro —Game decide si hay escena antes de que
    // esta arranque, y el arma que vuelve a la mano se veía un momento sobre la primera toma—)
    if (this.blending) {
      ee.handsOff = true;
      return;
    }
    const forging = !SW('GuadanasViejas') && t >= T_FORJA && t < T_RUN && this.g.weapons?.slot?.id === 'desgarrador' && !this.g.weapons?.temp;
    ee.handsOff = forging;
  }

  // ---------------- los caballeros de verdad ----------------
  // Los cuatro caballeros de la luz de entities/eclipse/cupula.js (los del Desgarro: el cuerpo hecho luz de su
  // elemento, el mate en alto), sin la cúpula: bajan en sus columnas alrededor de Belgrano, levantan los
  // mates y sus rayos van al nudo de la forja; al terminar se arrodillan y se hunden en luz.
  buildKnights() {
    const ev = { g: this.g, root: this.root, st: { hp: 1 } };
    const K = new Cupula(ev);
    const c = this.bel();
    K.c.copy(c);
    K.kc = c.clone();
    K.knights.forEach((k, i) => {
      const a = i * (Math.PI / 2) + 0.4;
      const at = toWorld(BEL[0] + Math.cos(a) * 14, BEL[1] + Math.sin(a) * 14, null, new THREE.Vector3());
      k.home.copy(at);
      k.y0 = at.y;
      k.r.yaw = Math.atan2(at.x - c.x, at.z - c.z);
      k.r.pos.set(at.x, at.y - 200, at.z);
      k.col.position.set(at.x, at.y - 0.5, at.z);
    });
    const C = this.bel(9);
    K.apex.position.copy(C);
    K.light.position.copy(C);
    this.cup = K;
  }

  knightsTick(t, dt) {
    const K = this.cup;
    if (!K) return;
    if (t < T_KNIGHT0 - 0.1 || t > T_KNIGHT1 + 6) {
      if (this.knightsOn) {
        this.knightsOn = false;
        K.hide();
      }
      return;
    }
    if (!this.knightsOn && t < T_KNIGHT1) {
      this.knightsOn = true;
      K.arrive(Math.max(0, t - T_KNIGHT0));
    }
    if (!this.knightsOn) return;
    if (!this.done.kRaise && t >= T_KNIGHT0 + 2.8) {
      this.done.kRaise = true;
      K.want = 1;
      K.raise();
    }
    if (!this.done.kLeave && t >= T_KNIGHT1) {
      this.done.kLeave = true;
      K.want = 0;
      K.leave();
    }
    K.update(dt, t);
    // (sin la cúpula: solo los rayos al nudo y el brillo donde se juntan. Y sin su luz: al prenderse cambiaba
    // la cuenta de luces y se recompilaban 16 sombreadores en un cuadro de 4 s —medido, a los 51,9 s—)
    K.dome.visible = false;
    K.light.visible = false;
    K.light.intensity = 0;
  }

  // ---------------- el súper facón ----------------
  faconReady() {
    const g = this.g;
    g.post?.flash?.(0.9);
    eclSfx(g).play('portal-cose', { gain: 1 });
    const f = buildFacon();
    f.scale.setScalar(7);
    // (fase 4: el brillo es un resplandor, no una luz: una luz nueva en medio de la partida cambiaba la cuenta
    // de luces y se recompilaban 16 sombreadores en un cuadro de 3,6 s —medido, a los 60,5 s—.
    // globalThis.__mduSlFinalLuzFacon: con la luz, como antes)
    if (globalThis.__mduSlFinalLuzFacon === true) f.add(new THREE.PointLight(0xffd890, 6, 18, 2));
    else {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures?.dot || null, color: 0xffd890, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8, toneMapped: false, fog: false }));
      glow.scale.setScalar(0.9);
      glow.position.y = 0.12;
      f.add(glow);
    }
    f.position.copy(this.bel(9));
    this.root.add(f);
    this.facon = f;
    if (this.isGil()) {
      const P = g.player;
      this.lift = { from: P.pos.clone(), to: toWorld(U0, 0, rampY(U0), new THREE.Vector3()) };
      // (la vista, para llevarla de a poco a la de la carrera: ver carry)
      const r0 = toWorld(U0, 0, 0, new THREE.Vector3());
      const r1 = toWorld(U1, 0, 0, new THREE.Vector3());
      this.lift.yaw0 = P.yaw;
      this.lift.pitch0 = P.pitch;
      this.lift.yawRun = Math.atan2(-(r1.x - r0.x), -(r1.z - r0.z));
    }
  }

  // (fase 4, todas) Llega al pie de la rampa y pasa a la mano del Gil: el Facón Relámpago de Mate no Numa
  // (weapons/Facon.js, un arma de verdad, con su mano) hasta el salto; el grande del mundo se apaga.
  faconToHand() {
    if (SW('SinFaconMano') || !this.facon) return;
    this.facon.visible = false;
    this.g.fx?.flash?.(this.facon.position, 0xffd890, 8, 0.4, 14);
    if (this.isGil()) {
      this.g.weapons?.giveTemp?.('facon', T_END - T_RUN + 6);
      this.gotFacon = true;
    }
  }

  dropFacon() {
    const W = this.g.weapons;
    if (this.gotFacon && W?.temp?.id === 'facon') W.clearTemp();
    this.gotFacon = false;
  }

  // (fase 4) La tanda de jinetes del caos de la carrera (entities/eclipse/slJinetes): desde que la luz sube
  // al Gil hasta el salto. Salen de adelante —del lado de El Eclipse— y se tiran contra él; los de abajo los
  // bajan. Al Gil no lo tocan (gilShield: la luz del facón lo cubre) y no lo frenan.
  jinetesOn() {
    return !SW('SinJinetes') && this.on && !this.blending && !this.ended && this.t >= T_FACON + 0.5 && this.t < T_CINE;
  }

  // (adelante del final de la rampa y bajo: dan vueltas a la altura del Gil, a la vista mientras corre;
  // slJinetes baja también el alto de la ronda —Ry— durante la tanda)
  jinetesCenter(out) {
    return toWorld(U1 + 8, 0, Y1 - 6, out);
  }

  // (en la compu del Gil) ¿lo cubre la luz? Toda la carrera.
  gilShield() {
    return this.jinetesOn() && this.isGil();
  }

  // (el Gil) La luz lo lleva al pie de la rampa; el facón va con él.
  carry(t) {
    const g = this.g;
    if (this.facon && t < T_RUN + 0.5) {
      const k = THREE.MathUtils.clamp((t - T_FACON) / (T_RUN - T_FACON), 0, 1);
      const to = toWorld(U0, 0, rampY(U0) + 1.2, new THREE.Vector3());
      this.facon.position.lerpVectors(this.bel(9), to, k * k * (3 - 2 * k));
      this.facon.scale.setScalar(7 - 5.2 * k);
      this.facon.rotation.y = t * 3;
    } else if (this.facon && t >= T_RUN + 0.5 && SW('SinFaconMano')) this.facon.visible = false;
    if (!this.lift || t >= T_RUN) return;
    const P = g.player;
    const k = THREE.MathUtils.clamp((t - T_FACON) / (T_RUN - T_FACON), 0, 1);
    const e = k * k * (3 - 2 * k);
    P.pos.lerpVectors(this.lift.from, this.lift.to, e);
    P.pos.y += Math.sin(Math.PI * e) * 4;
    P.vel?.set?.(0, 0, 0);
    // (2026-10-15, el usuario: "cuando se creó el facón salí disparado, algo me tiró hacia atrás, y luego me
    // teletransportaron a la corrida; debería ser más uniforme". Medido: el vuelo es parejo, pero la vista quedaba
    // donde estaba —arriba, en el nudo de la forja— y al arrancar la carrera saltaba en un cuadro a la de la
    // rampa: hasta 86° de costado y 30° para abajo, con el facón ya en la mano. Ahora, después de ver nacer el
    // facón, la vista va de a poco a la de la carrera y llega justa. globalThis.__mduSlFinalVistaGolpe: como antes)
    if (!SW('VistaGolpe') && this.lift.yawRun != null) {
      const L = this.lift;
      const w = THREE.MathUtils.smoothstep(k, 0.25, 1);
      P.yaw = angLerp(L.yaw0, L.yawRun, w);
      P.pitch = L.pitch0 + (-0.12 - L.pitch0) * w;
    }
    this.camFix();
  }

  camFix() {
    const P = this.g.player;
    this.g.camera.position.set(P.pos.x, P.pos.y + (P.eye || 1.6), P.pos.z);
  }

  // ---------------- la rampa y la carrera ----------------
  buildRamp() {
    const R = rng(1813);
    const top = new THREE.MeshStandardMaterial({ color: 0x3e5a26, roughness: 1 });
    const side = new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 1 });
    const bot = new THREE.MeshStandardMaterial({ color: 0x3a3438, roughness: 1 });
    // (los materiales del campo: el del suelo, con el pasto, y el de lo construido)
    const campo = this.sl.campo;
    const gMat = !SW('RampaLisa') && campo?.ground?.material?.map ? campo.ground.material : null;
    const sMat = gMat && campo?.stat?.material ? campo.stat.material : null;
    this.slabs = [];
    let u = U0 - 1.2;
    while (u < U1) {
      const len = 2.2 + R() * 0.9;
      const um = Math.min(U1 - 0.6, u + len / 2);
      const wid = 2.8 + R() * 1.6;
      let m;
      if (gMat && sMat) {
        // (una semilla por losa: la forma no le cambia la cuenta a la rampa, que sigue igual)
        const { topGeo, bodyGeo } = chunkGeos(len + 0.25, 1.3, wid, 1813 + 97 * this.slabs.length);
        m = new THREE.Group();
        const tm = new THREE.Mesh(topGeo, gMat);
        const bm = new THREE.Mesh(bodyGeo, sMat);
        tm.receiveShadow = true;
        bm.castShadow = true;
        bm.receiveShadow = true;
        m.add(tm, bm);
      } else {
        const geo = new THREE.BoxGeometry(len + 0.25, 1.3, wid);
        m = new THREE.Mesh(geo, [side, side, top, bot, side, side]);
        m.castShadow = true;
        m.receiveShadow = true;
      }
      const y = rampY(um);
      const at = toWorld(um, (R() - 0.5) * 0.9, y - 0.65, new THREE.Vector3());
      const slope = um < U_FLAT ? Math.atan((Y1 - Y0) / (U_FLAT - U0)) : 0;
      m.rotation.set((R() - 0.5) * 0.09, YAW + (R() - 0.5) * 0.14, slope + (R() - 0.5) * 0.06, 'YXZ');
      m.position.copy(at);
      m.visible = false;
      this.root.add(m);
      // sube cuando el Gil está a ~10 m (el último escalón, antes)
      const tRise = T_RUN + (um - U0 - 10) / RUN_V;
      this.slabs.push({ m, at, tRise, up: false });
      u += len + 0.12;
    }
  }

  ramp(t, dt) {
    const g = this.g;
    for (const S of this.slabs || []) {
      if (t < S.tRise) continue;
      const k = Math.min(1, (t - S.tRise) / 0.9);
      if (!S.up) {
        S.up = true;
        S.m.visible = true;
        g.fx?.alpha?.spawn?.(S.at.x, S.at.y - 7, S.at.z, 0, 1.5, 0, { color: [0.45, 0.4, 0.34], size: 2, size1: 5, life: 2, alpha: 0.3, drag: 0.8, gravity: -0.2 });
        if (S === this.slabs[0] || Math.random() < 0.35) eclSfx(g).play('piedras-suben', { pos: S.at.clone(), gain: 0.7 });
      }
      const e = 1 - (1 - k) ** 3 * (1 + 1.6 * k);
      S.m.position.set(S.at.x, S.at.y - 9 * (1 - e), S.at.z);
    }
    // la carrera del Gil: adelante siempre, a la misma velocidad; no se cae ni frena ni vuelve
    // (fase 3: con la cinemática de Blender andando, la cámara es de ella: camFix la ponía en los ojos del Gil
    // de la carrera y la primera toma salía pegada a la nuca del Gil de la escena)
    if (!this.isGil() || t < T_RUN || this.done.cine || this.blending) return;
    const P = g.player;
    // (al arrancar: de cara a El Eclipse, mirando la rampa)
    if (!this.faced) {
      this.faced = true;
      const a = toWorld(U0, 0, 0, new THREE.Vector3());
      const b = toWorld(U1, 0, 0, new THREE.Vector3());
      P.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      P.pitch = -0.12;
    }
    const u = Math.min(U1 - 0.3, U0 + RUN_V * (t - T_RUN));
    // (de costado puede correrse un poco)
    const cur = this.vOff ?? 0;
    const want = THREE.MathUtils.clamp(cur + ((g.input?.key?.('KeyD') ? 1 : 0) - (g.input?.key?.('KeyA') ? 1 : 0)) * dt * 2.5, -1.1, 1.1);
    this.vOff = want;
    const at = toWorld(u, want, rampY(u), new THREE.Vector3());
    P.pos.copy(at);
    P.vel?.set?.(0, 0, 0);
    P.stamina = 99;
    P.sprinting = true;
    if (P.health < 20) P.health = 20;
    this.camFix();
  }

  // (todas) La cinemática nueva (ui/finEclipseBlend): el salto, el mundo blanco y Fierro. Si el archivo no
  // llegó o ya hay otra escena, sigue como antes.
  startBlend() {
    const ee = this.sl.ee;
    if (!this.blendD || !ee || ee.scene) return;
    this.blending = true;
    this.dropFacon();
    ee.handsOff = true;
    const cine = new FinEclipseBlend(ee, this.blendD, () => {
      this.blending = false;
      this.end();
    });
    cine.clock = () => performance.now() / 1000 - this.t0 - T_CINE;
    this.cine = cine;
    ee.scene = { update: (dt) => cine.update(dt), kind: 'eclipse-salto', cine };
    // (el que entra tarde, o un cuadro largo: la escena arranca donde va la de los demás)
    const late = this.t - T_CINE;
    if (late > 0.5) cine.seek?.(late);
  }

  // (todas) Llegó arriba: el blanco y el final de hoy (con la cinemática nueva, cuando ella termina).
  end() {
    if (this.blending || this.ended) return;
    this.ended = true;
    this.dropFacon();
    if (this.sl.ee) this.sl.ee.handsOff = false;
    this.sl.finish(!!this.cine);
  }

  dispose() {
    this.on = false;
    // (si se sale en el mundo blanco: el ambiente y lo lejano vuelven a sonar en la partida que sigue)
    this.cine?.quietWorld?.(false);
    this.cine = null;
    if (this.sl.ee) this.sl.ee.handsOff = false;
    this.dropFacon();
    this.cup?.dispose();
    this.cup = null;
    this.root.parent?.remove(this.root);
  }
}
