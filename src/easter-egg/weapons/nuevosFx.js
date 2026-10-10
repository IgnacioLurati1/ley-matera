import * as THREE from 'three';

// Los efectos de los mates nuevos de la caja (config/weapons.js, 2026-10-08):
//  · `trail: 'fuego'` (la Llamarada Matera): el trazo es una lengua de fuego
//    con el centro amarillo, la boca escupe brasas y donde pega saltan chispas.
//    Mejorada (Llamarada del Dragón), fuego azul.
//  · `trail: 'caos'` (el Mate Caótico): el trazo es una grieta de vacío
//    violeta quebrada en tramos con el hilo celeste en el medio, y donde pega
//    salen esquirlas violetas. Mejorado (Lobizón del Caos), carmesí y oro.
//  · `projectile.rocket` (el Mate Explosivo): el cohete (cuerpo verde oliva,
//    punta colorada, aletas y la llama de atrás) que deja humo; revienta con
//    una de las dos explosiones grabadas. El de un compañero llega por la red
//    ('cohete') y se ve y se oye nomás (el daño lo hizo él).

const COL = {
  fuego: { outer: 0xff6a14, core: 0xffe0a0, spark: [1, 0.45, 0.1], flash: 0xff8a30 },
  fuegoUp: { outer: 0x2a7aff, core: 0xd8f0ff, spark: [0.35, 0.65, 1], flash: 0x60a0ff },
  caos: { outer: 0x8a3aff, core: 0x6af0ff, spark: [0.6, 0.3, 1], flash: 0xa060ff },
  caosUp: { outer: 0xff2a3a, core: 0xffd070, spark: [1, 0.3, 0.18], flash: 0xff5040 },
};
const colOf = (st) => COL[st.trail + (st.upgraded ? 'Up' : '')] || COL[st.trail];

const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tD = new THREE.Vector3();
const tS = new THREE.Vector3();

// El color del fogonazo (la luz que prende la boca al tirar).
export function trailFlash(st) {
  return st.trail ? colOf(st).flash : null;
}

// El trazo de un tiro (a: la boca, b: donde termina).
export function trailShot(g, st, a, b) {
  const C = colOf(st);
  if (st.trail === 'fuego') {
    g.fx.beam(a, b, { color: C.outer, width: 0.045, life: 0.07 });
    g.fx.beam(a, b, { color: C.core, width: 0.014, life: 0.05 });
    return;
  }
  // el caos: tres tramos corridos a los costados (como una grieta) y el hilo derecho
  tD.subVectors(b, a);
  const len = tD.length();
  const k = Math.min(0.12, len * 0.02);
  let prev = tA.copy(a);
  for (let i = 1; i <= 3; i++) {
    const p = tB.copy(a).addScaledVector(tD, i / 3);
    if (i < 3) p.add(tS.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k));
    g.fx.beam(prev, p, { color: C.outer, width: 0.05, life: 0.08 });
    prev = tA.copy(p);
  }
  g.fx.beam(a, b, { color: C.core, width: 0.013, life: 0.05 });
}

// Lo que sale de la boca con cada tiro (n: el número de tiro).
export function muzzleTrail(g, st, muzzle, fwd, n) {
  const C = colOf(st);
  if (st.trail === 'fuego') {
    if (n % 2) return;
    for (let i = 0; i < 3; i++) {
      const v = 3 + Math.random() * 5;
      g.fx.add.spawn(muzzle.x, muzzle.y, muzzle.z, fwd.x * v + (Math.random() - 0.5) * 1.5, fwd.y * v + Math.random() * 1.2, fwd.z * v + (Math.random() - 0.5) * 1.5, { color: C.spark, size: 0.035, size1: 0, life: 0.25 + Math.random() * 0.2, drag: 2 });
    }
    return;
  }
  // el caos: un remolinito de motas que se abre y se apaga
  if (n % 3) return;
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 0.6 + Math.random();
    g.fx.add.spawn(muzzle.x, muzzle.y, muzzle.z, fwd.x * 2 + Math.cos(a) * v, fwd.y * 2 + Math.sin(a) * v, fwd.z * 2 + Math.sin(a + 1) * v, { color: i % 2 ? C.spark : [0.4, 0.95, 1], size: 0.03, size1: 0, life: 0.22 + Math.random() * 0.15, drag: 4 });
  }
}

// Donde pega (en un muerto o en la pared). dir: para dónde salen.
export function trailHit(g, st, point, dir) {
  const C = colOf(st);
  g.fx.sparks(point, st.trail === 'fuego' ? 3 : 2, dir, C.spark);
}

// ---------------- el cohete ----------------
let ROCKET = null;
function rocketParts() {
  if (ROCKET) return ROCKET;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4, ...o });
  // el cuerpo a lo largo de +z (lookAt lo apunta para donde va)
  const body = new THREE.CylinderGeometry(0.018, 0.02, 0.15, 10).rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.018, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0, 0.1);
  const fin = new THREE.BoxGeometry(0.003, 0.045, 0.04).translate(0, 0.03, -0.06);
  const flame = new THREE.ConeGeometry(0.016, 0.09, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.12);
  const glow = new THREE.SpriteMaterial({ color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 });
  ROCKET = {
    body,
    nose,
    fin,
    flame,
    glow,
    mats: [
      { body: std({ color: 0x56603a }), nose: std({ color: 0xb02818 }), fin: std({ color: 0x3a3e2a }) },
      { body: std({ color: 0xc8202a }), nose: std({ color: 0xffc640, metalness: 1, roughness: 0.25 }), fin: std({ color: 0xf2efe8 }) },
    ],
    fire: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9030).multiplyScalar(2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  return ROCKET;
}

// Un cohete nuevo (up: el del Circo Explosivo, colorado y dorado). dot: la textura del brillo.
export function rocketMesh(up, dot) {
  const R = rocketParts();
  const m = R.mats[up ? 1 : 0];
  const g = new THREE.Group();
  g.add(new THREE.Mesh(R.body, m.body));
  g.add(new THREE.Mesh(R.nose, m.nose));
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(R.fin, m.fin);
    f.rotation.z = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(f);
  }
  g.add(new THREE.Mesh(R.flame, R.fire));
  if (dot && !R.glow.map) {
    R.glow.map = dot;
    R.glow.needsUpdate = true;
  }
  const s = new THREE.Sprite(R.glow);
  s.position.z = -0.11;
  s.scale.setScalar(0.22);
  g.add(s);
  return g;
}

// Cada cuadro del cohete en vuelo: humo atrás y alguna chispa de la llama.
export function rocketTrail(g, p, dt) {
  p.smokeT = (p.smokeT || 0) - dt;
  if (p.smokeT > 0) return;
  p.smokeT = 0.016;
  tD.copy(p.vel).normalize();
  const x = p.pos.x - tD.x * 0.14;
  const y = p.pos.y - tD.y * 0.14;
  const z = p.pos.z - tD.z * 0.14;
  const s = 0.15 + Math.random() * 0.25;
  g.fx.alpha.spawn(x, y, z, (Math.random() - 0.5) * s, 0.25 + Math.random() * s, (Math.random() - 0.5) * s, { color: [0.42, 0.4, 0.38], size: 0.07, size1: 0.45, life: 0.8 + Math.random() * 0.5, alpha: 0.32, drag: 1.6, gravity: -0.3 });
  if (Math.random() < 0.6) g.fx.add.spawn(x, y, z, -tD.x * 2 + (Math.random() - 0.5), -tD.y * 2 + (Math.random() - 0.5), -tD.z * 2 + (Math.random() - 0.5), { color: [1, 0.55, 0.15], size: 0.05, size1: 0, life: 0.12 + Math.random() * 0.1, drag: 3 });
}

// Cuál de las dos explosiones grabadas (core/weaponSfx.js ONE).
export const rocketBoom = () => (Math.random() < 0.5 ? 'cohete-boom-1' : 'cohete-boom-2');
