import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from '../../world/props';
import { leanGroup } from '../../world/staticLean';

// Los modelos del asedio del castillo (entities/castle/Asedio.js): la
// catapulta del Chiquitijuein, la escalera de asalto, el ariete con cabeza de
// carnero, el caldero-calabaza de los matacanes, el cofre del botín, los
// estandartes con antorcha de las crestas, la piedra en llamas, el anillo que
// avisa dónde cae, los cascotes y el hielo del rastrillo. Todo se arma una vez
// al cargar el mapa (escondido) y se reusa en cada asedio.

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();

// Una textura pintada en un canvas.
export function makeTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// El estandarte del Chiquitijuein: paño negro con la guarda colorada, los dos
// ojitos encendidos y los flecos rotos abajo.
export function bannerTex() {
  return makeTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0b0807';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = y % 6 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y, w, 1);
    }
    // la guarda: dientes colorados arriba y abajo
    ctx.fillStyle = '#8a0f0a';
    ctx.fillRect(0, 14, w, 10);
    ctx.fillRect(0, h - 62, w, 10);
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x + 8, 34);
      ctx.lineTo(x + 16, 24);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, h - 62);
      ctx.lineTo(x + 8, h - 72);
      ctx.lineTo(x + 16, h - 62);
      ctx.fill();
    }
    // los ojitos del Chiquitijuein (con su resplandor)
    ctx.save();
    ctx.shadowColor = '#ff2a10';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff3a18';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(w / 2 + sx * 17, h * 0.42, 9, 6, sx * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // el sombrerito puntiagudo arriba de los ojos
    ctx.fillStyle = '#3a0806';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, h * 0.33);
    ctx.lineTo(w / 2 + 34, h * 0.33);
    ctx.lineTo(w / 2 + 4, h * 0.16);
    ctx.closePath();
    ctx.fill();
    // flecos rotos
    ctx.clearRect(0, h - 40, w, 40);
    ctx.fillStyle = '#0b0807';
    for (let x = 0; x < w; x += 7) ctx.fillRect(x, h - 40, 4, 10 + ((x * 37) % 28));
  });
}

// Las grietas de lava de la piedra encendida (va de emissiveMap).
export function lavaTex() {
  return makeTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 26; k++) {
      let x = r() * w;
      let y = r() * h;
      ctx.lineWidth = 1 + r() * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

// El chorro de mate hirviendo que cae por el matacán: vetas que bajan.
export function streamTex() {
  return makeTex(32, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let k = 0; k < 18; k++) {
      const x = (k * 13) % w;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(210,220,150,0)');
      g.addColorStop(0.3, 'rgba(200,210,120,0.9)');
      g.addColorStop(0.7, 'rgba(140,160,60,0.75)');
      g.addColorStop(1, 'rgba(200,210,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, (k * 23) % h, 2 + (k % 3), h * 0.6);
    }
  });
}

// Una viga entre dos puntos (para riostras y patas).
function beam(g, a, b, w, d, mat) {
  tmpA.subVectors(b, a);
  const len = tmpA.length();
  const m = mesh(boxGeo(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, tmpA.normalize());
  g.add(m);
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- la catapulta ----------------
// Un mangonel de madera oscura sobre cuatro ruedas, con la madeja de sogas
// retorcida, el brazo con la cuchara al final, el tope acolchado arriba, el
// torno de atrás, el estandarte del Chiquitijuein y un brasero para prender
// las piedras. Mira hacia +z (al castillo). El brazo gira en x: 0 parado,
// ARM_COCK cargado (para atrás), ARM_FIRE contra el tope.
export const ARM_COCK = -1.48;
export const ARM_FIRE = 0.44;
export const ARM_PIVOT = V(0, 1.0, 0.9);
export const ARM_LEN = 4.6;

export function buildCatapult(M, bannerMat, glowMat) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wood = M.woodDark || M.wood;
  const light = M.wood || wood;
  const iron = M.iron;
  const rope = M.rope || M.leather || wood;
  const frame = new THREE.Group();
  // el bastidor: dos largueros y cuatro travesaños
  for (const s of [-1, 1]) frame.add(mesh(boxGeo(0.28, 0.32, 6.3), wood, s * 1.05, 0.8, -0.3));
  for (const z of [-3.25, -1.6, 0.9, 2.6]) frame.add(mesh(boxGeo(2.38, 0.24, 0.3), light, 0, 0.8, z));
  // los ejes y las ruedas macizas con su llanta
  for (const z of [-2.4, 1.9]) {
    frame.add(mesh(cylGeo(0.07, 0.07, 2.95, 8), iron, 0, 0.62, z, 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) {
      frame.add(mesh(cylGeo(0.62, 0.62, 0.2, 18), wood, s * 1.36, 0.62, z, 0, 0, Math.PI / 2));
      frame.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 22), iron, s * 1.36, 0.62, z, 0, Math.PI / 2, 0));
      frame.add(mesh(cylGeo(0.15, 0.15, 0.32, 8), iron, s * 1.4, 0.62, z, 0, 0, Math.PI / 2));
    }
  }
  // los parantes con sus riostras y el tope acolchado
  for (const s of [-1, 1]) {
    frame.add(mesh(boxGeo(0.26, 3.0, 0.26), wood, s * 0.92, 2.35, 2.2));
    beam(frame, V(s * 0.92, 0.9, 0.2), V(s * 0.92, 3.1, 2.15), 0.18, 0.18, light);
    beam(frame, V(s * 0.92, 0.9, 2.75), V(s * 0.92, 2.4, 2.25), 0.16, 0.16, light);
    // la madeja: los soportes de hierro del eje del brazo
    frame.add(mesh(cylGeo(0.44, 0.44, 0.12, 14), iron, s * 0.98, 1.0, 0.9, 0, 0, Math.PI / 2));
  }
  frame.add(mesh(boxGeo(2.1, 0.34, 0.36), wood, 0, 3.66, 2.2));
  frame.add(mesh(boxGeo(1.3, 0.4, 0.16), M.leather || rope, 0, 3.62, 1.98));
  // la madeja de sogas retorcida (donde está la fuerza)
  frame.add(mesh(cylGeo(0.32, 0.32, 1.72, 16), rope, 0, 1.0, 0.9, 0, 0, Math.PI / 2));
  for (const x of [-0.6, -0.2, 0.2, 0.6]) frame.add(mesh(new THREE.TorusGeometry(0.33, 0.035, 5, 16), iron, x, 1.0, 0.9, 0, Math.PI / 2, 0));
  // las piedras de repuesto atrás
  mergeByMaterial(frame);
  body.add(frame);
  // el torno de atrás (gira cuando le dan cuerda)
  const winch = new THREE.Group();
  winch.position.set(0, 1.12, -3.0);
  winch.add(mesh(cylGeo(0.17, 0.17, 2.0, 10), light, 0, 0, 0, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    winch.add(mesh(boxGeo(0.07, 1.1, 0.07), wood, s * 1.08, 0, 0));
    winch.add(mesh(boxGeo(0.07, 0.07, 1.1), wood, s * 1.08, 0, 0));
  }
  body.add(winch);
  // el brazo
  const arm = new THREE.Group();
  arm.position.copy(ARM_PIVOT);
  arm.add(mesh(boxGeo(0.24, ARM_LEN, 0.28), wood, 0, ARM_LEN / 2, 0));
  for (const y of [0.6, 2.2, 3.7]) arm.add(mesh(boxGeo(0.3, 0.07, 0.34), iron, 0, y, 0));
  // la cuchara: un cuenco que abre hacia +z del brazo
  const cupGeo = new THREE.LatheGeometry([[0, 0], [0.26, 0.02], [0.42, 0.12], [0.5, 0.3], [0.53, 0.34]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  cupGeo.rotateX(Math.PI / 2);
  const cup = mesh(cupGeo, wood, 0, ARM_LEN - 0.1, 0.1);
  arm.add(cup);
  const slot = new THREE.Object3D();
  slot.position.set(0, ARM_LEN - 0.1, 0.42);
  arm.add(slot);
  body.add(arm);
  // el estandarte del Chiquitijuein en un palo atrás
  body.add(mesh(cylGeo(0.05, 0.06, 5.2, 6), wood, -1.12, 3.4, -3.25));
  body.add(mesh(cylGeo(0.035, 0.035, 1.3, 6), wood, -0.5, 5.86, -3.25, 0, 0, Math.PI / 2));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2, 4, 1).translate(0, -1.1, 0), bannerMat);
  flag.position.set(-0.5, 5.86, -3.25);
  body.add(flag);
  // el brasero para prender las piedras (con su resplandor)
  const brazier = new THREE.Group();
  brazier.position.set(1.95, 0, -2.6);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    beam(brazier, V(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), V(Math.cos(a) * 0.2, 1.1, Math.sin(a) * 0.2), 0.05, 0.05, iron);
  }
  brazier.add(mesh(cylGeo(0.42, 0.26, 0.3, 12), iron, 0, 1.2, 0));
  const coals = mesh(cylGeo(0.38, 0.38, 0.04, 12), glowMat, 0, 1.33, 0);
  coals.castShadow = false;
  brazier.add(coals);
  body.add(brazier);
  // (cada parte que se mueve entera —el bastidor con el palo del estandarte,
  // el torno, el brazo, el brasero—: una malla por material; world/staticLean
  // leanGroup. Eran ~23 dibujos por catapulta en cada pasada; quedan 12)
  const fixed = new THREE.Group();
  body.add(fixed);
  for (const o of [...body.children]) if (o === frame || (o.isMesh && o !== flag)) fixed.add(o);
  for (const grp of [fixed, winch, arm, brazier]) leanGroup(grp);
  return { root, body, arm, slot, winch, flag, brazier, theta: ARM_FIRE };
}

// ---------------- la escalera de asalto ----------------
// Dos largueros de tronco y peldaños atados; los ganchos de hierro arriba se
// enganchan del parapeto. Sale del pie (el origen) hacia +y.
export function buildLadder(M, len) {
  const g = new THREE.Group();
  const wood = M.wood || M.woodDark;
  const iron = M.iron;
  const parts = new THREE.Group();
  for (const s of [-1, 1]) {
    parts.add(mesh(boxGeo(0.09, len, 0.11), M.woodDark || wood, s * 0.29, len / 2, 0));
    // los ganchos
    parts.add(mesh(boxGeo(0.06, 0.36, 0.06), iron, s * 0.29, len + 0.12, 0));
    parts.add(mesh(boxGeo(0.06, 0.06, 0.32), iron, s * 0.29, len + 0.28, -0.14));
  }
  for (let y = 0.35; y < len - 0.1; y += 0.36) parts.add(mesh(cylGeo(0.03, 0.03, 0.62, 6), wood, 0, y, 0, 0, 0, Math.PI / 2));
  mergeByMaterial(parts);
  for (const c of [...parts.children]) g.add(c);
  return g;
}

// ---------------- el ariete ----------------
// Un tronco de algarrobo zunchado con una cabeza de carnero de hierro (con los
// cuernos enroscados y los ojitos colorados del Chiquitijuein) y cuatro
// manijas. La cabeza mira a +z.
export function buildRam(M, eyeMat, hotMat = null, glowMat = null) {
  const g = new THREE.Group();
  const wood = M.log || M.woodDark || M.wood;
  const iron = M.iron;
  // (la cabeza al rojo vivo: si no, en la barbacana oscura y detrás de la reja no se veía)
  const head = hotMat || iron;
  const parts = new THREE.Group();
  parts.add(mesh(cylGeo(0.3, 0.34, 5.0, 12), wood, 0, 0, 0, Math.PI / 2, 0, 0));
  for (const z of [-2.1, -0.9, 0.4, 1.6]) parts.add(mesh(new THREE.TorusGeometry(0.335, 0.045, 6, 18), iron, 0, 0, z));
  // las manijas de los que lo cargan
  for (const z of [-1.3, 1.0]) parts.add(mesh(cylGeo(0.045, 0.045, 1.7, 6), M.woodDark || wood, 0, -0.05, z, 0, 0, Math.PI / 2));
  // la cabeza: la caperuza, el cráneo y el hocico
  parts.add(mesh(cylGeo(0.4, 0.34, 0.5, 12), iron, 0, 0, 2.62, Math.PI / 2, 0, 0));
  const skull = mesh(new THREE.IcosahedronGeometry(0.42, 1), head, 0, 0.04, 3.05);
  skull.scale.set(0.95, 0.85, 1.15);
  parts.add(skull);
  parts.add(mesh(cylGeo(0.2, 0.27, 0.42, 10), head, 0, -0.06, 3.42, Math.PI / 2, 0, 0));
  // los cuernos de carnero: una vuelta y media para cada lado
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.TorusGeometry(0.24, 0.08, 6, 14, Math.PI * 1.6), head, s * 0.4, 0.12, 2.95, 0, s * Math.PI / 2, 0);
    parts.add(horn);
  }
  mergeByMaterial(parts);
  for (const c of [...parts.children]) g.add(c);
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat, s * 0.17, 0.16, 3.38);
    e.castShadow = false;
    g.add(e);
  }
  // el resplandor de la cabeza (se ve entre los barrotes)
  if (glowMat) {
    const s = new THREE.Sprite(glowMat);
    s.scale.setScalar(1.9);
    s.position.set(0, 0.05, 3.1);
    g.add(s);
  }
  return g;
}

// ---------------- el caldero de los matacanes ----------------
// Un fogón de piedra con un caldero de hierro con forma de calabaza (es mate,
// al fin y al cabo: borde de alpaca y la bombilla gigante) y la canaleta que
// entra al muro de la barbacana. dir: para qué lado vuelca (+1 +x, -1 -x).
// El caldero gira sobre el borde de ese lado (pot.rotation.z).
export function buildCauldron(M, liquidMat, glowMat, dir, spillMat) {
  const root = new THREE.Group();
  const stone = M.castleStone || M.stone;
  const iron = M.iron;
  const base = new THREE.Group();
  base.add(mesh(boxGeo(1.25, 0.55, 1.25), stone, 0, 0.275, 0));
  base.add(mesh(boxGeo(1.32, 0.08, 1.32), M.castleStoneDark || stone, 0, 0.58, 0));
  // la canaleta de piedra hasta el muro, un poco en bajada
  base.add(mesh(boxGeo(0.95, 0.12, 0.5), stone, dir * 0.95, 0.66, 0, 0, 0, -dir * 0.12));
  for (const s of [-1, 1]) base.add(mesh(boxGeo(0.95, 0.14, 0.07), stone, dir * 0.95, 0.76, s * 0.22, 0, 0, -dir * 0.12));
  // las patas de hierro que sostienen el eje
  for (const s of [-1, 1]) {
    base.add(mesh(boxGeo(0.07, 0.62, 0.07), iron, 0, 0.9, s * 0.66));
    base.add(mesh(cylGeo(0.05, 0.05, 0.12, 8), iron, 0, 1.18, s * 0.66, Math.PI / 2, 0, 0));
    // los muñones del caldero
    base.add(mesh(cylGeo(0.035, 0.035, 0.14, 8), iron, 0, 1.18, s * 0.6, Math.PI / 2, 0, 0));
  }
  mergeByMaterial(base);
  root.add(base);
  // las brasas que se ven por la boca del fogón
  const coals = mesh(boxGeo(0.62, 0.22, 0.04), glowMat, 0, 0.22, -0.64);
  coals.castShadow = false;
  root.add(coals);
  // el caldero: cuelga de dos muñones (a los costados) y se inclina hacia la canaleta
  const pot = new THREE.Group();
  pot.position.set(0, 1.18, 0);
  const body = new THREE.Group();
  body.position.set(0, -0.58, 0);
  const prof = [[0, 0], [0.32, 0.02], [0.55, 0.1], [0.66, 0.26], [0.68, 0.42], [0.64, 0.56], [0.6, 0.64], [0.64, 0.68], [0.66, 0.71]];
  body.add(mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22), M.copper || iron, 0, 0, 0));
  // los aros de hierro del caldero
  for (const y of [0.16, 0.48]) body.add(mesh(new THREE.TorusGeometry(y < 0.3 ? 0.61 : 0.69, 0.03, 6, 24), iron, 0, y, 0, Math.PI / 2, 0, 0));
  body.add(mesh(new THREE.TorusGeometry(0.65, 0.04, 6, 28), M.silver || M.brass || iron, 0, 0.71, 0, Math.PI / 2, 0, 0));
  // la bombilla gigante
  body.add(mesh(cylGeo(0.035, 0.035, 1.35, 8), M.silver || M.brass || iron, -dir * 0.18, 1.2, -0.12, 0.25, 0, dir * 0.35));
  body.add(mesh(cylGeo(0.07, 0.05, 0.12, 8), M.brass || iron, -dir * 0.41, 1.82, -0.28, 0.25, 0, dir * 0.35));
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.6, 22).rotateX(-Math.PI / 2), liquidMat);
  liquid.position.y = 0.62;
  body.add(liquid);
  pot.add(body);
  root.add(pot);
  // (el caldero se inclina entero: una malla por material; el mate de adentro aparte)
  leanGroup(body);
  // el mate que corre por la canaleta cuando se vuelca
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36).rotateX(-Math.PI / 2), spillMat);
  spill.position.set(dir * 0.98, 0.74, 0);
  spill.rotation.z = -dir * 0.12;
  spill.visible = false;
  spill.renderOrder = 4;
  root.add(spill);
  return { root, pot, liquid, coals, spill };
}

// ---------------- el cofre del botín ----------------
// Un baúl grande con flejes, esquinas de bronce y el sello colorado del
// Chiquitijuein (roto cuando se abre); adentro, monedas.
export function buildChest(M, goldMat, sealMat) {
  const root = new THREE.Group();
  const wood = M.woodDark || M.wood;
  const iron = M.iron;
  const brass = M.brass || goldMat;
  const box = new THREE.Group();
  box.add(mesh(boxGeo(1.3, 0.66, 0.82), wood, 0, 0.33, 0));
  for (const x of [-0.45, 0, 0.45]) box.add(mesh(boxGeo(0.07, 0.68, 0.86), iron, x, 0.33, 0));
  for (const x of [-0.66, 0.66]) for (const z of [-0.42, 0.42]) box.add(mesh(boxGeo(0.1, 0.7, 0.1), brass, x, 0.33, z));
  mergeByMaterial(box);
  root.add(box);
  // las monedas de adentro (se ven con la tapa abierta)
  const coins = new THREE.InstancedMesh(cylGeo(0.07, 0.07, 0.018, 10), goldMat, 70);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    tmpQ.setFromAxisAngle(tmpA.set(r() - 0.5, 1, r() - 0.5).normalize(), r() * 0.6);
    tmpM.compose(tmpA.set((r() - 0.5) * 1.1, 0.5 + r() * 0.2 + (i % 5) * 0.012, (r() - 0.5) * 0.66), tmpQ, tmpB.set(1, 1, 1));
    coins.setMatrixAt(i, tmpM);
  }
  root.add(coins);
  // la tapa curva (gira desde atrás)
  const lid = new THREE.Group();
  lid.position.set(0, 0.66, -0.41);
  const lidParts = new THREE.Group();
  lidParts.add(mesh(new THREE.CylinderGeometry(0.41, 0.41, 1.3, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), wood, 0, 0, 0.41));
  for (const x of [-0.45, 0, 0.45]) lidParts.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.07, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), iron, x, 0, 0.41));
  mergeByMaterial(lidParts);
  for (const c of [...lidParts.children]) lid.add(c);
  const seal = mesh(cylGeo(0.12, 0.12, 0.04, 14), sealMat, 0, 0.0, 0.83, Math.PI / 2, 0, 0);
  seal.castShadow = false;
  lid.add(seal);
  root.add(lid);
  return { root, lid, coins, seal };
}

// ---------------- la piedra en llamas ----------------
export function boulderGeo() {
  const geo = new THREE.IcosahedronGeometry(0.55, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    tmpA.fromBufferAttribute(p, i);
    const k = 0.82 + 0.3 * Math.abs(Math.sin(tmpA.x * 7.1 + tmpA.y * 3.3) * Math.cos(tmpA.z * 5.7 - tmpA.y));
    tmpA.multiplyScalar(k);
    p.setXYZ(i, tmpA.x, tmpA.y, tmpA.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------- el hielo del rastrillo ----------------
// Una placa de hielo sobre la reja con estalactitas abajo y arriba.
export function buildGateIce(iceMat, W = 4.1, H = 3.5) {
  const g = new THREE.Group();
  g.add(mesh(boxGeo(W, H, 0.34), iceMat, 0, H / 2, 0));
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 14; k++) {
    const x = -W / 2 + 0.15 + r() * (W - 0.3);
    const h = 0.3 + r() * 0.7;
    const c = mesh(new THREE.ConeGeometry(0.09 + r() * 0.08, h, 5), iceMat, x, H - 0.05 - h / 2, (r() - 0.5) * 0.3, Math.PI, 0, 0);
    g.add(c);
    const c2 = mesh(new THREE.ConeGeometry(0.1 + r() * 0.1, 0.4 + r() * 0.8, 5), iceMat, x * 0.9, 0.2, 0.2 + r() * 0.1, 0.2 * (r() - 0.5), 0, 0);
    g.add(c2);
  }
  return g;
}

// ---------------- los estandartes de las crestas ----------------
// Palos con el paño del Chiquitijuein y una antorcha al lado, instanciados.
// Devuelve las mallas y la lista de llamas (sprites) para que el asedio los
// haga subir de a uno.
export function buildStandards(M, bannerMat, flameMat, n) {
  const root = new THREE.Group();
  const poles = new THREE.InstancedMesh(cylGeo(0.07, 0.1, 5.4, 6).clone().translate(0, 2.7, 0), M.woodDark || M.wood, n * 2);
  const cloth = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 2.4, 2, 1).translate(0.65, -1.2, 0), bannerMat, n);
  poles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const m of [poles, cloth]) {
    m.frustumCulled = false;
    m.castShadow = false;
    root.add(m);
  }
  const flames = [];
  for (let i = 0; i < n; i++) {
    const f = new THREE.Sprite(flameMat);
    f.visible = false;
    root.add(f);
    flames.push(f);
  }
  return { root, poles, cloth, flames };
}
