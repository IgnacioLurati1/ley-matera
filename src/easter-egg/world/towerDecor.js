import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { rng } from '../core/noise';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_BUYS, PERK_SPOTS, BOX_SPOTS, POWER, PAP, EE, ACT, PROPS, RISERS, ZONES } from '../config/map';

// El detalle de la torre (world/Tower.js lo llama al armarse):
//  · los arcos de las arcadas, curvos de verdad (antes eran escalones), con
//    su clave y sus impostas;
//  · el borde roto del agujero: la losa descascarada abajo, hierros que
//    quedaron de la baranda y cascotes;
//  · en cada piso, apliques con velas y estantes contra los pilares de las
//    esquinas, postigos abiertos (algunos se hamacan con el viento) y lo que
//    quedó tirado en el piso, según de qué es el piso;
//  · lo que el remolino hace volar alrededor de la torre (tablas, chapas,
//    ramas, cajones), girando en la placa de video.
// Nada de esto choca: lo que se choca es la utilería de config/maps/torre.js.
// Todo son unas pocas mallas instanciadas o fusionadas (pocas llamadas de
// dibujo) y materiales propios de la torre (no se tocan los compartidos).

// El color de las luces de cada piso (la luz de los faroles del piso).
export const FLOOR_TINTS = [
  0xffb070, // 1 zaguán
  0xffbe62, // 2 yerbera: ámbar
  0xff8c48, // 3 secadero: brasa
  0xffc890, // 4 pulpería
  0xd8e4b8, // 5 plaza de las ánimas: pálida
  0xfff0d4, // 6 galpón: foco pelado
  0xffd8a0, // 7 tambo
  0xf2e092, // 8 maizal
  0xffb070, // 9 tapera
  0xd2b0ff, // 10 patio del sello: violeta
  0xc4d6ff, // 11 calabozos: fría
  0xe8f2ff, // 12 enfermería
  0xffa060, // 13 capilla: velas
  0xff7a52, // 14 pabellón de los santos: roja
  0xffd0a0, // 15 cima
];

const m4 = new THREE.Matrix4();
const qt = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vS = new THREE.Vector3();
const eu = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

// ---------------- los arcos ----------------
// La enjuta de cada arco (lo que hay entre la curva y el dintel), extruida con
// el grosor de la pared: la curva es la misma media elipse que antes se hacía
// con escalones.
export function buildArches(tower, archTop) {
  const T = tower.T;
  const w = tower.w;
  const spring = archTop - 0.9;
  const rise = 0.885;
  const cache = new Map();
  const spandrel = (wdt) => {
    if (cache.has(wdt)) return cache.get(wdt);
    const R = wdt / 2;
    const s = new THREE.Shape();
    s.moveTo(0, archTop);
    s.lineTo(0, spring);
    const N = 32;
    for (let i = 1; i < N; i++) {
      const u = (i / N) * wdt;
      const t = (u - R) / R;
      s.lineTo(u, spring + rise * Math.sqrt(Math.max(0, 1 - t * t)));
    }
    s.lineTo(wdt, spring);
    s.lineTo(wdt, archTop);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    cache.set(wdt, g);
    return g;
  };
  const geos = [];
  const gb = new GeoBuilder();
  const spans = tower.archSpans();
  for (let l = 0; l < tower.L - 1; l++) {
    const y = tower.yOf(l);
    for (const side of [0, 1, 2, 3]) {
      for (const [a0, a1] of spans) {
        const wdt = a1 + 1 - a0;
        if (side === 0) m4.makeTranslation(a0, y, T.z0 - 1);
        else if (side === 2) m4.makeTranslation(a0, y, T.z1 + 1);
        else m4.makeRotationY(-Math.PI / 2).setPosition(side === 3 ? T.x0 : T.x1 + 2, y, a0);
        geos.push(spandrel(wdt).clone().applyMatrix4(m4));
        // la clave (piedra clara en lo alto) y las impostas donde arranca la curva
        const c = a0 + wdt / 2;
        const box = (u0, u1, y0, y1, out) => {
          if (side === 0) gb.box('keyStone', u0, y + y0, T.z0 - 1 - out, u1, y + y1, T.z0 + out, 1);
          else if (side === 2) gb.box('keyStone', u0, y + y0, T.z1 + 1 - out, u1, y + y1, T.z1 + 2 + out, 1);
          else if (side === 3) gb.box('keyStone', T.x0 - 1 - out, y + y0, u0, T.x0 + out, y + y1, u1, 1);
          else gb.box('keyStone', T.x1 + 1 - out, y + y0, u0, T.x1 + 2 + out, y + y1, u1, 1);
        };
        box(c - 0.17, c + 0.17, archTop - 0.3, archTop + 0.1, 0.04);
        for (const u of [a0, a1 + 1]) box(u - 0.14, u + 0.14, spring - 0.1, spring, 0.03);
      }
    }
  }
  const merged = mergeGeometries(geos);
  for (const g of cache.values()) g.dispose();
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, w.M.towerStone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  w.root.add(mesh, gb.build(w.M));
}

// ---------------- lo que vuela en el remolino ----------------
// Tablas, chapas, ramas y cajones que giran alrededor de la torre y suben en
// espiral. Todo en el vertex shader (posición, vuelta y giro sobre sí mismos);
// cuelgan de los puntitos del remolino (tower.debris), así la cinemática del
// final los apaga juntos.
export function buildOrbitDebris(tower, low) {
  const parent = tower.debris;
  const flash = tower.vortex[0].material.uniforms.uFlash;
  const time = parent.material.uniforms.uTime;
  const r = rng(4242);
  const plank = new THREE.BoxGeometry(1.7, 0.06, 0.24);
  const sheet = mergeGeometries([new THREE.BoxGeometry(1.2, 0.02, 0.75), new THREE.BoxGeometry(1.2, 0.05, 0.04).translate(0, 0.02, 0.2), new THREE.BoxGeometry(1.2, 0.05, 0.04).translate(0, 0.02, -0.2)]);
  // (la copa es un icosaedro, sin índice: todas las piezas sin índice para fusionarlas)
  const branch = mergeGeometries([
    new THREE.CylinderGeometry(0.05, 0.07, 2.2, 5).rotateZ(Math.PI / 2),
    new THREE.CylinderGeometry(0.025, 0.04, 0.9, 4).rotateZ(Math.PI / 2 - 0.7).translate(0.35, 0.28, 0),
    new THREE.CylinderGeometry(0.02, 0.035, 0.7, 4).rotateZ(Math.PI / 2 + 0.8).translate(-0.4, 0.22, 0.05),
    new THREE.IcosahedronGeometry(0.28, 0).scale(1, 0.6, 1).translate(0.75, 0.52, 0),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  const crate = mergeGeometries([
    new THREE.BoxGeometry(0.62, 0.62, 0.62),
    new THREE.BoxGeometry(0.66, 0.08, 0.66).translate(0, 0.22, 0),
    new THREE.BoxGeometry(0.66, 0.08, 0.66).translate(0, -0.22, 0),
  ]);
  const kinds = [
    [plank, 0x6a5238, low ? 50 : 120],
    [sheet, 0x6f7478, low ? 26 : 60],
    [branch, 0x3a3024, low ? 36 : 90],
    [crate, 0x7a6040, low ? 14 : 36],
  ];
  const vert = `
    attribute vec4 aOrbit; attribute vec4 aSpin; uniform float uTime; varying vec3 vN;
    mat3 rotAxis(vec3 a, float ang){ a = normalize(a); float s = sin(ang), c = cos(ang), oc = 1.0 - c;
      return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
                  oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
                  oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }
    void main(){
      float ang = aOrbit.z + uTime * aOrbit.w * (26.0 / aOrbit.x);
      float y = mod(aOrbit.y + uTime * aOrbit.w * 1.7, 126.0) - 2.0;
      // se achican al llegar arriba y al salir de abajo (ahí dan la vuelta)
      float k = smoothstep(-2.0, 6.0, y) * smoothstep(124.0, 112.0, y);
      mat3 R = rotAxis(aSpin.xyz, uTime * aSpin.w + aOrbit.z * 3.0);
      vec3 p = R * (position * k) + vec3(cos(ang) * aOrbit.x, y, sin(ang) * aOrbit.x);
      vN = R * normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const frag = `
    uniform vec3 uColor; uniform float uFlash; varying vec3 vN;
    void main(){
      vec3 n = normalize(vN);
      if (!gl_FrontFacing) n = -n;
      float d = max(dot(n, normalize(vec3(-0.35, 0.75, 0.45))), 0.0);
      vec3 c = uColor * (0.22 + d * 0.62) + vec3(0.55, 0.6, 0.75) * uFlash * (0.25 + d * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const out = [];
  for (const [geo, color, n] of kinds) {
    const g = new THREE.InstancedBufferGeometry().copy(geo);
    g.instanceCount = n;
    const orbit = new Float32Array(n * 4);
    const spin = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // la mayoría entre la torre y la primera cortina (se ven bien), el resto más lejos
      orbit[i * 4] = r() < 0.7 ? 21 + r() * 7 : 28 + r() * 16;
      orbit[i * 4 + 1] = r() * 126;
      orbit[i * 4 + 2] = r() * Math.PI * 2;
      orbit[i * 4 + 3] = 0.45 + r() * 0.55;
      spin[i * 4] = r() - 0.5;
      spin[i * 4 + 1] = r() - 0.5;
      spin[i * 4 + 2] = r() - 0.5;
      spin[i * 4 + 3] = 0.6 + r() * 2.4;
    }
    g.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
    g.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), 200);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: time, uFlash: flash, uColor: { value: new THREE.Color(color) } }, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    parent.add(m);
    out.push(m);
    geo.dispose();
  }
  return out;
}

// ---------------- dónde no va nada ----------------
// Por piso: lo que tiene que quedar despejado (máquinas, pozos, utilería,
// easter egg) como [x, z, radio].
function busyByFloor(tower) {
  const L = tower.L;
  const out = Array.from({ length: L }, () => []);
  const lv = (y) => Math.max(0, Math.min(L - 1, Math.round((y || 0) / tower.FH)));
  const spot = (s, rad = 1.6) => s?.cell && out[lv(s.y)].push([s.cell[0] + 0.5 + s.face[0] * 0.9, s.cell[1] + 0.5 + s.face[1] * 0.9, rad]);
  for (const s of [...WALL_BUYS, ...PERK_SPOTS, ...BOX_SPOTS, POWER, EE?.ending, EE?.altar, ...(ACT?.jars || [])]) spot(s);
  if (PAP) spot(PAP, 2.4);
  for (const k of RISERS) out[lv(k.y)].push([k.pos[0], k.pos[1], 1.6]);
  for (const p of PROPS) out[lv(p.y)].push([p.pos[0], p.pos[1], 1.25]);
  for (const p of ACT?.parts || []) out[lv(p.pos[1])].push([p.pos[0], p.pos[2], 1.1]);
  for (const p of ACT?.radios || []) out[lv(p.pos[1])].push([p.pos[0], p.pos[2], 1.1]);
  if (ACT?.bench) out[lv(ACT.bench.y)].push([ACT.bench.pos[0], ACT.bench.pos[1], 1.8]);
  if (EE?.cano) out[lv(EE.cano.y)].push([EE.cano.pos[0], EE.cano.pos[1], 1.8]);
  if (EE?.canon) out[lv(EE.canon.y)].push([EE.canon.pos[0], EE.canon.pos[1], (EE.canon.cage || 8) + 1]);
  // las paredes y columnas de los pisos distintos (layoutPieces)
  for (const W of tower.layout?.walls || []) for (let a = W.a0; a <= W.a1 + 0.01; a += 0.5) out[W.l].push(W.side % 2 ? [a, W.c, 0.45] : [W.c, a, 0.45]);
  for (const C of tower.layout?.cols || []) for (const [x, z] of C.list) out[C.l].push([x, z, 0.6]);
  return out;
}

// ¿(x, z) del piso l está libre? Lejos del agujero (y del medio de las
// plazas), de las escaleras que salen y llegan y de lo ocupado.
function freeAt(tower, busy, l, x, z, pad = 0) {
  const T = tower.T;
  if (x < T.x0 + 0.3 || x > T.x1 + 0.7 || z < T.z0 + 0.3 || z > T.z1 + 0.7) return false;
  if (x > 24 - pad && x < 36 + pad && z > 24 - pad && z < 36 + pad) return false;
  for (const R of [tower.ramps[l], tower.ramps[l - 1]]) {
    if (!R) continue;
    const [x0, z0, x1, z1] = R.rect;
    const ax = R.dir === '+x' || R.dir === '-x';
    const ex = ax ? 1.8 : 0.8;
    const ez = ax ? 0.8 : 1.8;
    if (x > x0 - ex && x < x1 + 1 + ex && z > z0 - ez && z < z1 + 1 + ez) return false;
  }
  for (const [bx, bz, rad] of busy[l]) if ((x - bx) ** 2 + (z - bz) ** 2 < (rad + pad) ** 2) return false;
  return true;
}

// ---------------- el piso de cada piso ----------------
// Lo que quedó tirado, según el piso (tipo, cuántos).
const CLUTTER = [
  [['paper', 10], ['leaf', 16], ['rubble', 6], ['bottle', 3]],
  [['yerba', 34], ['paper', 4], ['straw', 3], ['can', 2]],
  [['yerba', 22], ['ash', 5], ['rubble', 6], ['can', 2]],
  [['bottle', 14], ['can', 6], ['paper', 6], ['rubble', 3]],
  [['candle', 18], ['leaf', 10], ['paper', 3]],
  [['straw', 8], ['can', 6], ['rubble', 8], ['bottle', 2]],
  [['straw', 14], ['can', 3], ['leaf', 6]],
  [['cob', 16], ['leaf', 22], ['straw', 4]],
  [['bottle', 4], ['paper', 6], ['rubble', 6], ['leaf', 8], ['can', 3]],
  [['candle', 10], ['rubble', 8], ['ash', 4]],
  [['bone', 9], ['rubble', 8], ['can', 4], ['paper', 3]],
  [['paper', 12], ['bottle', 8], ['can', 2]],
  [['candle', 22], ['paper', 4], ['leaf', 6]],
  [['candle', 28], ['bone', 4], ['ash', 3]],
  [['leaf', 22], ['rubble', 10], ['paper', 4]],
];
// lo de los estantes de cada piso: frascos, botellas o cajitas
const SHELF = ['box', 'jar', 'jar', 'bottle', 'candle', 'box', 'jar', 'box', 'bottle', 'candle', 'box', 'jar', 'candle', 'candle', null];

export function buildFloorDecor(tower) {
  const w = tower.w;
  const T = tower.T;
  const M = w.M;
  const r = rng(6061);
  const busy = busyByFloor(tower);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  // las piezas: geometría y material de cada tipo (una malla instanciada cada uno)
  const K = {
    paper: [new THREE.PlaneGeometry(0.21, 0.3).rotateX(-Math.PI / 2), std(0xd8d0bc, { side: THREE.DoubleSide, roughness: 1 })],
    leaf: [new THREE.CircleGeometry(0.07, 5).scale(1, 0.5, 1).rotateX(-Math.PI / 2), std(0xffffff, { side: THREE.DoubleSide, roughness: 1 })],
    yerba: [new THREE.CircleGeometry(0.05, 5).scale(1, 0.45, 1).rotateX(-Math.PI / 2), std(0xffffff, { side: THREE.DoubleSide, roughness: 1 })],
    rubble: [new THREE.IcosahedronGeometry(0.12, 0).scale(1, 0.55, 0.9), M.towerStone],
    bottle: [new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.047, 0.16], [0.02, 0.21], [0.015, 0.27], [0, 0.27]].map(([a, b]) => new THREE.Vector2(a, b)), 7), std(0xffffff, { roughness: 0.2, metalness: 0.1 })],
    can: [new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8).translate(0, 0.06, 0), std(0x8a8a86, { roughness: 0.5, metalness: 0.7 })],
    candle: [new THREE.CylinderGeometry(0.028, 0.03, 1, 7).translate(0, 0.5, 0), std(0xe8dcc0)],
    flame: [new THREE.ConeGeometry(0.018, 0.06, 5).translate(0, 0.03, 0), M.flame],
    straw: [new THREE.ConeGeometry(0.3, 0.1, 6).scale(1, 1, 0.7).translate(0, 0.05, 0), std(0xc8a860, { roughness: 1 })],
    cob: [new THREE.CapsuleGeometry(0.035, 0.12, 2, 6).rotateZ(Math.PI / 2).translate(0, 0.035, 0), std(0xd8b040)],
    bone: [mergeGeometries([new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5).rotateZ(Math.PI / 2), new THREE.SphereGeometry(0.035, 5, 4).translate(0.16, 0, 0), new THREE.SphereGeometry(0.035, 5, 4).translate(-0.16, 0, 0)]).translate(0, 0.03, 0), std(0xd8ccb0)],
    ash: [new THREE.CircleGeometry(0.42, 9).rotateX(-Math.PI / 2), std(0x16110d, { roughness: 1, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })],
    jar: [new THREE.CylinderGeometry(0.06, 0.055, 0.16, 8).translate(0, 0.08, 0), std(0xffffff, { roughness: 0.3 })],
    box: [new THREE.BoxGeometry(0.2, 0.14, 0.16).translate(0, 0.07, 0), std(0xffffff)],
  };
  const lists = Object.fromEntries(Object.keys(K).map((k) => [k, []]));
  // [x, y, z, rx, ry, rz, sx, sy, sz, color]
  const put = (k, x, y, z, ry = 0, s = [1, 1, 1], c = null, rx = 0, rz = 0) => lists[k].push([x, y, z, rx, ry, rz, s[0], s[1], s[2], c]);
  const candle = (x, y, z, h) => {
    put('candle', x, y, z, 0, [1, h, 1], 0xe8dcc0 - Math.floor(r() * 3) * 0x080808);
    put('flame', x, y + h, z, 0, [1, 1 + r() * 0.5, 1]);
  };
  const LEAF = [0x6a5030, 0x7a6038, 0x5a4828, 0x806a40];
  const YERBA = [0x5a6a2a, 0x6a7a34, 0x4e5e24, 0x7a7040];
  const GLASS = [0x2a4a2a, 0x4a2e18, 0x20382e, 0x6a6a60];
  const piece = (k, x, y, z) => {
    const a = r() * Math.PI * 2;
    if (k === 'paper') put(k, x, y + 0.004 + r() * 0.004, z, a, [1, 1, 1], 0xd8d0bc - Math.floor(r() * 4) * 0x0a0a08, (r() - 0.5) * 0.08);
    else if (k === 'leaf') put(k, x, y + 0.005, z, a, [1, 1, 1], LEAF[Math.floor(r() * LEAF.length)], (r() - 0.5) * 0.3);
    else if (k === 'yerba') put(k, x, y + 0.005, z, a, [1, 1, 1], YERBA[Math.floor(r() * YERBA.length)], (r() - 0.5) * 0.3);
    else if (k === 'rubble') put(k, x, y + 0.03, z, a, [0.6 + r() * 0.9, 0.6 + r() * 0.8, 0.6 + r() * 0.9], null, r(), r());
    else if (k === 'bottle') {
      // parada o tirada
      if (r() < 0.55) put(k, x, y + 0.047, z, a, [1, 1, 1], GLASS[Math.floor(r() * GLASS.length)], Math.PI / 2);
      else put(k, x, y, z, a, [1, 1, 1], GLASS[Math.floor(r() * GLASS.length)]);
    } else if (k === 'can') {
      if (r() < 0.5) put(k, x, y + 0.045, z, a, [1, 1, 1], null, Math.PI / 2);
      else put(k, x, y, z, a);
    } else if (k === 'candle') {
      // de a grupitos
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) candle(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3, 0.08 + r() * 0.22);
    } else if (k === 'straw') put(k, x, y, z, a, [0.7 + r() * 0.8, 0.6 + r() * 0.8, 0.7 + r() * 0.8]);
    else if (k === 'cob' || k === 'bone') put(k, x, y, z, a);
    else if (k === 'ash') put(k, x, y + 0.006, z, a, [0.7 + r() * 0.6, 1, 0.7 + r() * 0.6]);
  };
  const W = new GeoBuilder();
  for (let l = 0; l < tower.L; l++) {
    const y = tower.yOf(l);
    const last = l === tower.L - 1;
    // lo tirado en el piso: al azar en el anillo, lejos de lo ocupado
    for (const [k, n] of CLUTTER[l]) {
      let placed = 0;
      for (let tries = 0; placed < n && tries < n * 30; tries++) {
        const x = T.x0 + 0.4 + r() * (T.x1 - T.x0 + 0.2);
        const z = T.z0 + 0.4 + r() * (T.z1 - T.z0 + 0.2);
        if (!freeAt(tower, busy, l, x, z, k === 'leaf' || k === 'yerba' || k === 'paper' ? -0.6 : 0)) continue;
        piece(k, x, y, z);
        // las hojas y los papeles, de a varios
        if (k === 'leaf' || k === 'yerba') for (let i = 0; i < 3; i++) piece(k, x + (r() - 0.5) * 0.6, y, z + (r() - 0.5) * 0.6);
        placed++;
      }
    }
    if (last) continue;
    // las esquinas: contra la cara de un pilar un estante; contra la otra, un aplique
    const corners = [
      // [x, z, a lo largo (eje), hacia adentro]
      [[19.6, T.z0, 'x', [0, 1]], [T.x0, 19.6, 'z', [1, 0]]],
      [[40.4, T.z0, 'x', [0, 1]], [T.x1 + 1, 19.6, 'z', [-1, 0]]],
      [[19.6, T.z1 + 1, 'x', [0, -1]], [T.x0, 40.4, 'z', [1, 0]]],
      [[40.4, T.z1 + 1, 'x', [0, -1]], [T.x1 + 1, 40.4, 'z', [-1, 0]]],
    ];
    corners.forEach((pair, ci) => {
      const flip = (ci + l) % 2;
      const [shelf, sconce] = flip ? [pair[1], pair[0]] : pair;
      const clear = ([x, z, , [nx, nz]]) => {
        const px = x + nx * 0.4;
        const pz = z + nz * 0.4;
        return !busy[l].some(([bx, bz]) => (px - bx) ** 2 + (pz - bz) ** 2 < 1.1 * 1.1);
      };
      if (SHELF[l] && clear(shelf)) buildShelf(W, shelf, y, SHELF[l], put, candle, r);
      if (clear(sconce)) buildSconce(W, sconce, y, candle);
    });
  }
  w.root.add(W.build(w.M));
  // las mallas instanciadas
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const [geo, mat] = K[k];
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const colored = list.some((p) => p[9] != null);
    list.forEach(([x, y, z, rx, ry, rz, sx, sy, sz, c], i) => {
      m4.compose(vA.set(x, y, z), qt.setFromEuler(eu.set(rx, ry, rz, 'YXZ')), vS.set(sx, sy, sz));
      im.setMatrixAt(i, m4);
      if (colored) im.setColorAt(i, col.set(c ?? 0xffffff));
    });
    im.castShadow = !['paper', 'leaf', 'yerba', 'ash', 'flame'].includes(k);
    im.receiveShadow = k !== 'flame';
    w.root.add(im);
  }
  return buildShutters(tower, r);
}

// Estante de dos tablas contra la cara de un pilar, con lo del piso encima.
function buildShelf(W, [x, z, along, [nx, nz]], y, item, put, candle, r) {
  const len = 2.2;
  const d = 0.26;
  const box = (a0, a1, y0, y1, n0, n1, key = 'woodDark') => {
    // a: a lo largo del pilar; n: hacia adentro desde la cara
    const s = nx || nz;
    const lo = Math.min(n0 * s, n1 * s);
    const hi = Math.max(n0 * s, n1 * s);
    if (along === 'x') W.box(key, x + a0, y + y0, z + lo, x + a1, y + y1, z + hi, 1);
    else W.box(key, x + lo, y + y0, z + a0, x + hi, y + y1, z + a1, 1);
  };
  for (const h of [1.2, 1.68]) {
    box(-len / 2, len / 2, h - 0.035, h, 0.01, d);
    // las escuadras de hierro
    for (const a of [-len / 2 + 0.2, len / 2 - 0.2]) box(a - 0.02, a + 0.02, h - 0.2, h - 0.035, 0.01, d * 0.8, 'iron');
    // lo de arriba
    for (let a = -len / 2 + 0.18; a < len / 2 - 0.1; a += 0.2 + r() * 0.18) {
      if (r() < 0.2) continue;
      const off = 0.06 + r() * (d - 0.14);
      const px = along === 'x' ? x + a : x + nx * off;
      const pz = along === 'x' ? z + nz * off : z + a;
      if (item === 'candle') candle(px, y + h, pz, 0.08 + r() * 0.16);
      else if (item === 'bottle') put('bottle', px, y + h, pz, r() * 6, [1, 0.8 + r() * 0.4, 1], [0x2a4a2a, 0x4a2e18, 0x20382e][Math.floor(r() * 3)]);
      else if (item === 'jar') put('jar', px, y + h, pz, r() * 6, [1, 0.8 + r() * 0.6, 1], [0xb8c8c0, 0x8a6a40, 0xc8b890, 0x6a7a8a][Math.floor(r() * 4)]);
      else put('box', px, y + h, pz, r() * 0.4 - 0.2, [0.8 + r() * 0.5, 0.7 + r() * 0.8, 0.8 + r() * 0.4], [0x8a6a48, 0x6a4a38, 0xa08868, 0x4a5a6a][Math.floor(r() * 4)]);
    }
  }
}

// Aplique de hierro con dos velas, contra la cara de un pilar.
function buildSconce(W, [x, z, along, [nx, nz]], y, candle) {
  const h = 1.9;
  const b = (a0, a1, y0, y1, n0, n1) => {
    const lo = Math.min(n0 * (nx || nz), n1 * (nx || nz));
    const hi = Math.max(n0 * (nx || nz), n1 * (nx || nz));
    if (along === 'x') W.box('iron', x + a0, y + y0, z + lo, x + a1, y + y1, z + hi, 1);
    else W.box('iron', x + lo, y + y0, z + a0, x + hi, y + y1, z + a1, 1);
  };
  // la chapa, el brazo y el platillo de cada vela
  b(-0.09, 0.09, h - 0.25, h + 0.15, 0.005, 0.03);
  b(-0.02, 0.02, h - 0.05, h - 0.02, 0.03, 0.2);
  b(-0.2, 0.2, h - 0.05, h - 0.02, 0.17, 0.21);
  for (const a of [-0.18, 0.18]) {
    b(a - 0.045, a + 0.045, h - 0.02, h, 0.145, 0.235);
    const px = along === 'x' ? x + a : x + nx * 0.19;
    const pz = along === 'x' ? z + nz * 0.19 : z + a;
    candle(px, y + h, pz, 0.14 + Math.abs(a) * 0.3);
  }
}

// ---------------- los postigos ----------------
// En algunos arcos quedaron las hojas de los postigos, abiertas contra la
// fachada de afuera; algunas a medio abrir se hamacan con el viento.
function buildShutters(tower, r) {
  const T = tower.T;
  const w = tower.w;
  const H = 1.75;
  const leaf = [];
  // marco y persianas (en su marco: ancho en +x desde la bisagra, alto en +y)
  leaf.push(new THREE.BoxGeometry(0.07, H, 0.045).translate(0.035, H / 2, 0));
  leaf.push(new THREE.BoxGeometry(0.07, H, 0.045).translate(0.965, H / 2, 0));
  for (const yy of [0.035, H / 2, H - 0.035]) leaf.push(new THREE.BoxGeometry(0.86, 0.07, 0.045).translate(0.5, yy, 0));
  for (let k = 0; k < 14; k++) {
    const yy = 0.12 + k * ((H - 0.24) / 13);
    if (Math.abs(yy - H / 2) < 0.06) continue;
    leaf.push(new THREE.BoxGeometry(0.86, 0.075, 0.012).rotateX(0.55).translate(0.5, yy, 0));
  }
  const geo = mergeGeometries(leaf);
  const mat = new THREE.MeshStandardMaterial({ map: w.T.planks || null, color: 0xffffff, roughness: 0.9 });
  const COLORS = [0x4a6a48, 0x3e5a6a, 0x6a5a44, 0x587050, 0x4a4e58];
  const spans = tower.archSpans();
  const list = [];
  for (let l = 0; l < tower.L - 1; l++) {
    const y = tower.yOf(l) + 1.1;
    const n = 3 + Math.floor(r() * 2);
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const side = Math.floor(r() * 4);
      const s = Math.floor(r() * spans.length);
      if (used.has(side * 10 + s)) continue;
      used.add(side * 10 + s);
      const [a0, a1] = spans[s];
      // el lado: a lo largo, hacia afuera y dónde está la cara de afuera
      const A = side % 2 ? [0, 0, 1] : [1, 0, 0];
      const O = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][side];
      const face = [T.z0 - 1, T.x1 + 2, T.z1 + 2, T.x0 - 1][side];
      const c = COLORS[Math.floor(r() * COLORS.length)];
      for (const [end, sgn] of [[a0, 1], [a1 + 1, -1]]) {
        if (r() < 0.18) continue; // se voló
        const hinge = side % 2 ? [face + O[0] * 0.03, y, end] : [end, y, face + O[2] * 0.03];
        const swing = r() < 0.3;
        list.push({ hinge, A: A.map((v) => v * sgn), O, th: swing ? 1.4 + r() * 0.8 : 2.85 + r() * 0.25, swing, ph: r() * 6, sp: 0.7 + r() * 0.8, tilt: r() < 0.15 ? (r() - 0.5) * 0.3 : 0, c });
      }
    }
  }
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  im.castShadow = true;
  im.receiveShadow = true;
  const Wv = new THREE.Vector3();
  const Zv = new THREE.Vector3();
  const tiltQ = new THREE.Quaternion();
  const place = (s, i, th) => {
    // el ancho de la hoja: hacia el arco cerrada (th = 0), contra la fachada abierta (th = π)
    Wv.set(s.A[0] * Math.cos(th) + s.O[0] * Math.sin(th), 0, s.A[2] * Math.cos(th) + s.O[2] * Math.sin(th));
    Zv.crossVectors(Wv, UP);
    m4.makeBasis(Wv, UP, Zv);
    if (s.tilt) m4.multiply(new THREE.Matrix4().makeRotationFromQuaternion(tiltQ.setFromAxisAngle(vA.set(0, 0, 1), s.tilt)));
    m4.setPosition(s.hinge[0], s.hinge[1], s.hinge[2]);
    im.setMatrixAt(i, m4);
  };
  list.forEach((s, i) => {
    place(s, i, s.th);
    im.setColorAt(i, col.set(s.c));
  });
  w.root.add(im);
  const moving = list.map((s, i) => [s, i]).filter(([s]) => s.swing);
  return {
    // las que están a medio abrir se hamacan con las ráfagas
    update(t) {
      if (!moving.length) return;
      for (const [s, i] of moving) {
        const gust = Math.max(0, Math.sin(t * 0.31 + s.ph)) ** 2;
        place(s, i, s.th + Math.sin(t * s.sp + s.ph) * (0.08 + gust * 0.35));
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------- el borde del agujero ----------------
// La losa rota alrededor del agujero: cascotes que cuelgan abajo del canto,
// hierros de la baranda que se voló (algunos doblados, con un pedazo de
// pasamanos) y cascotes sueltos en el piso, pegados al borde.
export function buildHoleLip(tower) {
  const w = tower.w;
  const T = tower.T;
  const [h0, h1, h2, h3] = T.hole;
  const r = rng(3131);
  const gb = new GeoBuilder();
  const bars = [];
  const chunks = [];
  // los cuatro bordes: [x0, z0, x1, z1] del canto y hacia dónde queda el agujero
  const edges = [
    [h0, h1, h2 + 1, h1, [0, 1]],
    [h0, h3 + 1, h2 + 1, h3 + 1, [0, -1]],
    [h0, h1, h0, h3 + 1, [1, 0]],
    [h2 + 1, h1, h2 + 1, h3 + 1, [-1, 0]],
  ];
  for (let l = 1; l < tower.L; l++) {
    if (!tower.hasHole(l + 1)) continue;
    const y = tower.yOf(l);
    const S = T.slab;
    for (const [x0, z0, x1, z1, [ix, iz]] of edges) {
      const alongX = z0 === z1;
      const len = alongX ? x1 - x0 : z1 - z0;
      // afuera del agujero (del lado de la losa)
      const ox = -ix;
      const oz = -iz;
      let a = 0.2 + r() * 0.4;
      while (a < len - 0.2) {
        const px = alongX ? x0 + a : x0;
        const pz = alongX ? z0 : z0 + a;
        // un cascote colgando abajo del canto
        if (r() < 0.55) {
          const wdt = 0.25 + r() * 0.55;
          const dep = 0.1 + r() * 0.3;
          const hang = 0.12 + r() * 0.4;
          const into = r() * 0.08;
          if (alongX) gb.box('towerStone', px - wdt / 2, y - S - hang, Math.min(pz + oz * dep, pz - oz * into), px + wdt / 2, y - S + 0.02, Math.max(pz + oz * dep, pz - oz * into), 1);
          else gb.box('towerStone', Math.min(px + ox * dep, px - ox * into), y - S - hang, pz - wdt / 2, Math.max(px + ox * dep, px - ox * into), y - S + 0.02, pz + wdt / 2, 1);
        }
        // el hierro de un parante (a veces doblado para el agujero) y a veces un pedazo de pasamanos
        if (r() < 0.45) {
          const bx = px + ox * 0.12;
          const bz = pz + oz * 0.12;
          const hgt = 0.18 + r() * 0.62;
          const lean = r() < 0.4 ? 0.2 + r() * 0.7 : r() * 0.12;
          bars.push([bx, y, bz, hgt, ix, iz, lean]);
          if (hgt > 0.55 && r() < 0.5) {
            const L2 = 0.3 + r() * 0.7;
            bars.push([bx, y + hgt * Math.cos(lean) - 0.04, bz, L2, alongX ? (r() < 0.5 ? 1 : -1) : ix * 0.3, alongX ? iz * 0.3 : r() < 0.5 ? 1 : -1, 1.25 + r() * 0.4]);
          }
        }
        // cascotes sueltos en el piso, pegados al borde
        if (r() < 0.5) {
          const d = 0.12 + r() * 0.7;
          chunks.push([px + ox * d + (r() - 0.5) * 0.3, y + 0.02, pz + oz * d + (r() - 0.5) * 0.3]);
        }
        a += 0.45 + r() * 0.6;
      }
    }
  }
  w.root.add(gb.build(w.M));
  // los hierros: un cilindro que sale del piso y se inclina hacia (dx, dz)
  const barGeo = new THREE.CylinderGeometry(0.018, 0.022, 1, 5).translate(0, 0.5, 0);
  const bim = new THREE.InstancedMesh(barGeo, w.M.iron, bars.length);
  bars.forEach(([x, y, z, len, dx, dz, lean], i) => {
    // girar el eje +y hacia la dirección (dx, dz) en `lean` radianes
    const axis = vA.set(dz, 0, -dx);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    qt.setFromAxisAngle(axis, lean);
    m4.compose(new THREE.Vector3(x, y, z), qt, vS.set(1, len, 1));
    bim.setMatrixAt(i, m4);
  });
  bim.castShadow = true;
  const cim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), w.M.towerStone, chunks.length);
  chunks.forEach(([x, y, z], i) => {
    m4.compose(vA.set(x, y, z), qt.setFromEuler(eu.set(r() * 3, r() * 3, r() * 3)), vS.set(0.7 + r() * 1.1, 0.5 + r() * 0.6, 0.7 + r() * 1.1));
    cim.setMatrixAt(i, m4);
  });
  cim.castShadow = true;
  cim.receiveShadow = true;
  w.root.add(bim, cim);
}

// ---------------- los pisos distintos ----------------
// Además del anillo abierto, dos plantas (TOWER.layouts):
//  · 'halves': dos paredes cruzan el anillo, del muro de afuera al borde del
//    agujero, en los dos lados que no tienen escalera en ese piso (así nunca
//    tapan una escalera ni su entrada o salida); cada una con su puerta
//    abierta de 2 m. Queda un ala aparte, que se cruza por las puertas.
//  · 'cloister': columnas con sus vigas alrededor del agujero, justo afuera del
//    anillo libre de 2 m (se pasa entre columna y columna); se saltea la que
//    quede pegada a un pozo, una máquina o una escalera.
// Devuelve lo que choca (cajas de pared) y lo que solo se ve.
export function layoutPieces(tower) {
  const T = tower.T;
  const layouts = T.layouts || {};
  const [h0, h1, h2, h3] = T.hole;
  const busy = busyByFloor(tower);
  const solids = [];
  const walls = [];
  const cols = [];
  const TH = 0.15;
  const DOOR = 2;
  const DOOR_H = 2.5;
  for (let l = 1; l < tower.L - 1; l++) {
    const n = l + 1;
    const kind = layouts[n];
    if (!kind || !tower.hasHole(n)) continue;
    const y = tower.yOf(l);
    const top = y + tower.FH - T.slab;
    if (kind === 'halves') {
      const stairSides = [tower.ramps[l]?.side, tower.ramps[l - 1]?.side];
      for (const side of [0, 1, 2, 3]) {
        if (stairSides.includes(side)) continue;
        // a lo largo de la pared: de a0 a a1 sobre la línea c (x = c en los lados
        // norte y sur), en el medio de una fila de celdas: así la navegación la
        // ve (traba esa fila) y no la cruza por entre dos celdas
        const c = (side % 2 ? T.cz : T.cx) + 0.5;
        const [a0, a1] = side === 0 ? [T.z0, h1 - 0.2] : side === 2 ? [h3 + 1.2, T.z1 + 1] : side === 3 ? [T.x0, h0 - 0.2] : [h2 + 1.2, T.x1 + 1];
        // la puerta, justo dos celdas enteras
        const m = Math.floor((a0 + a1) / 2);
        const d0 = m - DOOR / 2;
        const d1 = m + DOOR / 2;
        const box = (u0, u1, y0, y1) => (side % 2 ? [u0, y0, c - TH, u1, y1, c + TH] : [c - TH, y0, u0, c + TH, y1, u1]);
        for (const b of [box(a0, d0, y, top), box(d1, a1, y, top), box(d0, d1, y + DOOR_H, top)]) solids.push(b);
        walls.push({ l, side, c, a0, a1, d0, d1, y, top });
      }
    } else if (kind === 'cloister') {
      // en el centro de las celdas (cada columna traba la suya para la navegación)
      const lo = h0 - 2.5;
      const hi = h2 + 1 + 2.5;
      const steps = [lo, lo + 4, hi - 4, hi];
      // [x, z, se puede correr a lo largo de x / de z] (las de las esquinas, no)
      const pts = [];
      for (const a of steps) pts.push([a, lo, a !== lo && a !== hi ? 'x' : null], [a, hi, a !== lo && a !== hi ? 'x' : null]);
      for (const a of steps.slice(1, -1)) pts.push([lo, a, 'z'], [hi, a, 'z']);
      const R = 0.22;
      const list = [];
      // lejos de lo ocupado y de las escaleras (con su entrada y salida)
      const free = (x, z) => {
        if (busy[l].some(([bx, bz, rad]) => (x - bx) ** 2 + (z - bz) ** 2 < Math.max(1.75, rad) ** 2)) return false;
        for (const Rm of [tower.ramps[l], tower.ramps[l - 1]]) {
          if (!Rm) continue;
          const [x0, z0, x1, z1] = Rm.rect;
          if (x > x0 - 2.5 && x < x1 + 3.5 && z > z0 - 2.5 && z < z1 + 3.5) return false;
        }
        return true;
      };
      for (const [px, pz, axis] of pts) {
        // si pisa algo, se corre una celda para un lado o para el otro
        const at = [0, -1, 1].map((d) => (axis === 'x' ? [px + d, pz] : axis === 'z' ? [px, pz + d] : [px, pz])).find(([x, z]) => free(x, z));
        if (!at) continue;
        const [x, z] = at;
        list.push([x, z]);
        solids.push([x - R, y, z - R, x + R, top, z + R]);
      }
      cols.push({ l, y, top, list, lo, hi });
    }
  }
  return { solids, walls, cols };
}

// Lo que se ve de los pisos distintos: las paredes con el material del piso,
// el marco de madera de cada puerta y el remate contra el agujero; las
// columnas con base y capitel, y las vigas que las unen.
export function buildLayouts(tower, P) {
  const w = tower.w;
  const gb = new GeoBuilder();
  const TH = 0.15;
  for (const W of P.walls) {
    const zw = ZONES[`P${W.l + 1}`]?.wall;
    const key = zw && w.M[zw] ? zw : 'towerStone';
    const { side, c, a0, a1, d0, d1, y, top } = W;
    const box = (k, u0, u1, y0, y1, t = TH, s = 3.6) => (side % 2 ? gb.box(k, u0, y0, c - t, u1, y1, c + t, s) : gb.box(k, c - t, y0, u0, c + t, y1, u1, s));
    box(key, a0, d0, y, top);
    box(key, d1, a1, y, top);
    box(key, d0, d1, y + 2.5, top);
    // el marco de la puerta (forra el vano: ninguna cara suya cae en el mismo
    // plano que el canto de la pared, que si no titila a rayas) y el zócalo
    box('woodDark', d0 - 0.02, d0 + 0.08, y, y + 2.42, TH + 0.04, 1);
    box('woodDark', d1 - 0.08, d1 + 0.02, y, y + 2.42, TH + 0.04, 1);
    box('woodDark', d0 - 0.02, d1 + 0.02, y + 2.42, y + 2.52, TH + 0.04, 1);
    box('towerStone', a0, d0, y, y + 0.22, TH + 0.03, 1);
    box('towerStone', d1, a1, y, y + 0.22, TH + 0.03, 1);
    // el remate de piedra del lado del agujero (o del muro de afuera)
    const inner = side === 0 || side === 3 ? a1 : a0;
    box('keyStone', inner - 0.12, inner + 0.12, y, top, TH + 0.05, 1);
  }
  for (const C of P.cols) {
    const { y, top, list, lo, hi } = C;
    for (const [x, z] of list) {
      gb.box('keyStone', x - 0.3, y, z - 0.3, x + 0.3, y + 0.18, z + 0.3, 1);
      gb.box('towerStone', x - 0.22, y + 0.18, z - 0.22, x + 0.22, top - 0.35, z + 0.22, 1);
      gb.box('keyStone', x - 0.3, top - 0.35, z - 0.3, x + 0.3, top - 0.2, z + 0.3, 1);
    }
    // las vigas entre columna y columna, alrededor del agujero
    const beams = [];
    for (const k of [lo, hi]) {
      beams.push(['x', k]);
      beams.push(['z', k]);
    }
    for (const [axis, k] of beams) {
      const pts = list.filter(([x, z]) => Math.abs((axis === 'x' ? z : x) - k) < 0.01).map(([x, z]) => (axis === 'x' ? x : z)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [u0, u1] = [pts[i], pts[i + 1]];
        if (axis === 'x') gb.box('beam', u0, top - 0.2, k - 0.14, u1, top, k + 0.14, 1);
        else gb.box('beam', k - 0.14, top - 0.2, u0, k + 0.14, top, u1, 1);
      }
    }
  }
  w.root.add(gb.build(w.M));
}
