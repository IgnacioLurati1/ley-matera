import * as THREE from 'three';
import { VM, registerMate } from './viewmodels';

// Las armas de los potenciadores de cada mapa, en la mano:
//  · Admin Mate (la torre): un Mate Eagle de oro, uno en cada mano. Corredera
//    de oro grabada con "ADMIN", el frente es un mate laqueado de negro con
//    virola de oro y la bombilla hace de caño; cachas de nácar.
//  · Farol de las Ánimas (el penal): un farol de hierro labrado que cuelga
//    de una cadena, con vidrios verdosos y el corazón verde de las almas
//    adentro; la cinta colorada del Gauchito atada a la cadena.
// weapons/Potenciadores.js anima lo que devuelven en `pot`.

const { mats, lathe, cyl, box, sph, tor, wrapHand, PROFILES } = VM;

const cache = {};
function mat(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

// La corredera grabada: oro con arabescos y ADMIN en letras hundidas.
// flip: para el de la mano izquierda (que se arma espejado).
function engraving(flip) {
  const tex = mat('adminTex', () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 112;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 112);
    gr.addColorStop(0, '#fff0a8');
    gr.addColorStop(0.45, '#f2bf3c');
    gr.addColorStop(1, '#a8741a');
    x.fillStyle = gr;
    x.fillRect(0, 0, 512, 112);
    // arabescos finitos alrededor
    x.strokeStyle = 'rgba(90,56,6,0.7)';
    x.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const cx = 20 + i * 44;
      x.beginPath();
      x.arc(cx, 14, 9, 0, Math.PI);
      x.stroke();
      x.beginPath();
      x.arc(cx + 22, 98, 9, Math.PI, Math.PI * 2);
      x.stroke();
    }
    x.strokeRect(6, 26, 500, 60);
    // letras hundidas: sombra oscura arriba, brillo abajo
    x.font = 'bold 64px Georgia, "Times New Roman", serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff6c8';
    x.fillText('A D M I N', 258, 60);
    x.fillStyle = '#3a2400';
    x.fillText('A D M I N', 256, 57);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  if (!flip) return tex;
  return mat('adminTexL', () => {
    const t = tex.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = -1;
    t.needsUpdate = true;
    return t;
  });
}

function buildAdminMate(T, hand) {
  const M = mats(T);
  const gold = M.gold;
  const lacquer = mat('lacquer', () => new THREE.MeshStandardMaterial({ color: 0x131316, metalness: 0.6, roughness: 0.22 }));
  const pearl = mat('pearl', () => new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.25, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color(0xb8d8ff), sheenRoughness: 0.4 }));
  const g = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  const put = (m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // la corredera de oro con su nervio de arriba y las estrías de atrás
  put(box(0.034, 0.042, 0.25, gold), 0, 0.035, -0.07);
  put(box(0.012, 0.006, 0.23, M.dark), 0, 0.059, -0.075);
  for (let i = 0; i < 6; i++) put(box(0.0366, 0.03, 0.003, M.dark), 0, 0.035, 0.012 + i * 0.007);
  // el grabado, de los dos lados
  const eng = mat(`engMat${hand}`, () => new THREE.MeshStandardMaterial({ map: engraving(hand === 'L'), metalness: 1, roughness: 0.28 }));
  for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.036), eng), s * 0.0172, 0.035, -0.075, 0, s * Math.PI / 2, 0);
  // el frente: un mate laqueado acostado, con la boca para adelante
  const mate = lathe(PROFILES.calabaza.map(([r, y]) => [r * 0.9, y * 0.95]), lacquer, 24);
  put(mate, 0, 0.03, -0.095, -Math.PI / 2, 0, 0);
  for (const z of [-0.12, -0.15]) put(tor(0.041, 0.0025, gold, 6, 24), 0, 0.03, z);
  put(tor(0.03, 0.005, gold, 8, 24), 0, 0.03, -0.186);
  // la bombilla hace de caño, con su freno de boca
  put(cyl(0.0085, 0.0085, 0.07, M.silver, 14), 0, 0.03, -0.22, Math.PI / 2, 0, 0);
  put(box(0.026, 0.02, 0.03, M.dark), 0, 0.03, -0.262);
  for (const s of [-1, 1]) put(box(0.004, 0.012, 0.018, gold), s * 0.0135, 0.03, -0.262);
  // miras
  put(box(0.006, 0.01, 0.01, M.dark), 0, 0.064, -0.19);
  put(box(0.014, 0.01, 0.008, M.dark), 0, 0.064, 0.05);
  // el armazón, el guardamonte, la cola del disparador y el martillo
  put(box(0.03, 0.028, 0.16, M.dark), 0, 0.004, -0.03);
  put(tor(0.022, 0.004, gold, 6, 16, Math.PI), 0, -0.01, -0.02, 0, Math.PI / 2, Math.PI);
  put(box(0.005, 0.02, 0.006, gold), 0, -0.012, -0.015, 0.3, 0, 0);
  put(box(0.01, 0.02, 0.012, M.dark), 0, 0.058, 0.062, -0.5, 0, 0);
  // la culata con cachas de nácar y dos tornillos de oro por lado
  const grip = new THREE.Group();
  grip.position.set(0, -0.052, 0.036);
  grip.rotation.x = 0.26;
  g.add(grip);
  grip.add(box(0.026, 0.11, 0.044, M.dark));
  const panel = box(0.031, 0.085, 0.034, pearl);
  panel.position.y = -0.004;
  grip.add(panel);
  for (const s of [-1, 1]) {
    for (const y of [0.022, -0.03]) {
      const r = sph(0.0035, gold, 8, 6);
      r.position.set(s * 0.016, y, 0);
      grip.add(r);
    }
  }
  // la gema del medallón de abajo (late con cada tiro)
  const gem = sph(0.006, M.glowGold, 10, 8);
  gem.position.set(0, -0.058, 0);
  grip.add(gem);
  anim.glow.push(gem);
  // la mano en la culata
  const hnd = wrapHand(M, { radius: 0.021, y0: -0.035, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(0.2, -0.9, 0.45), scale: 0.95 });
  grip.add(hnd);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.28);
  g.add(muzzle);
  const tilt = new THREE.Group();
  // girado hacia adentro y un poco acostado: se ve el grabado del costado
  g.rotation.set(0.05, 0.2, -0.3);
  g.position.set(-0.02, 0.055, 0.02);
  tilt.add(g);
  tilt.scale.setScalar(0.78);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded: false, tip, mouth: null, mate: g, bombGroup: null, yerba: null, pot: { gem } };
}

// El Farol de las Ánimas, más grande y colgando de una cadena: la mano agarra
// el travesaño de arriba, la cadena baja y el farol se hamaca (lo mueve
// weapons/Potenciadores.js con la inercia de la mano). Jaula de hierro de seis
// caras con volutas, vidrios verdosos, techo de pagoda con la corona y el
// remate, y adentro el vidrio de las almas con el corazón verde (su luz alumbra
// la mano) y las ánimas girando.
function buildFarol(T) {
  const M = mats(T);
  const iron = mat('farolIron', () => new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.75, roughness: 0.42 }));
  const brass = mat('farolBrass', () => new THREE.MeshStandardMaterial({ color: 0xb8893a, metalness: 0.9, roughness: 0.32 }));
  // (los vidrios no se alumbran: con la luz verde pegada quedaban blancos)
  const pane = mat('farolGlassG', () => new THREE.MeshBasicMaterial({ color: 0x5aa87a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  const soulGlass = mat('farolSoulGlass', () => new THREE.MeshBasicMaterial({ color: 0x6affa0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  // el corazón verde (sin pasarse de blanco en el centro) y su resplandor
  const core = mat('farolCoreG', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9affb0).multiplyScalar(2.3), toneMapped: false }));
  const aura = mat('farolAuraG', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3aff6a).multiplyScalar(1.3), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const wisp = mat('farolWisp', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ffe0).multiplyScalar(1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const ribbon = mat('farolRibbon', () => new THREE.MeshStandardMaterial({ color: 0xc41616, roughness: 0.7, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const anim = { spin: [], glow: [], wobble: null };
  const put = (parent, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  // el travesaño de madera que agarra la mano (arriba de todo)
  const PIV = 0.21;
  put(g, cyl(0.011, 0.011, 0.07, M.woodDark, 10), 0, PIV + 0.012, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) put(g, cyl(0.013, 0.013, 0.008, brass, 10), s * 0.037, PIV + 0.012, 0, 0, 0, Math.PI / 2);
  // la mano: el puño cerrado en el travesaño, el brazo sale abajo a la derecha
  // (la mano envuelve un palo parado: se acuesta con el puño, y el brazo se
  // da vuelta para que quede saliendo abajo a la derecha)
  const hnd = wrapHand(M, { radius: 0.011, y0: -0.035, side: Math.PI / 2, dir: 1, arm: new THREE.Vector3(-0.55, -0.62, 0.56), scale: 0.95 });
  const fist = new THREE.Group();
  fist.position.set(0, PIV + 0.012, 0);
  fist.rotation.z = Math.PI / 2;
  fist.add(hnd);
  g.add(fist);
  // todo lo que cuelga: la cadena y el farol (se hamaca desde la mano)
  const swing = new THREE.Group();
  swing.position.set(0, PIV, 0);
  g.add(swing);
  // la cadena: eslabones alternados
  const link = new THREE.TorusGeometry(0.0085, 0.0024, 5, 12);
  const NL = 8;
  const LS = 0.0135;
  for (let i = 0; i < NL; i++) {
    const l = new THREE.Mesh(link, iron);
    l.scale.set(1, 1.35, 1);
    l.position.set(0, -0.006 - i * LS, 0);
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    swing.add(l);
  }
  const top = -0.006 - NL * LS;
  // la cinta colorada del Gauchito, atada a la cadena
  const cinta = new THREE.Group();
  cinta.position.set(0.004, top + 0.05, 0.004);
  swing.add(cinta);
  cinta.add(tor(0.009, 0.0025, ribbon, 5, 14));
  cinta.children[0].rotation.x = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.075), ribbon);
  tail.position.set(0.008, -0.04, 0.006);
  tail.rotation.set(0.2, 0.4, 0.2);
  cinta.add(tail);
  anim.wobble = cinta;
  // el farol
  const L = new THREE.Group();
  L.position.set(0, top - 0.004, 0);
  swing.add(L);
  const W = 0.058;
  const H = 0.19;
  const R6 = W / Math.cos(Math.PI / 6);
  const yTop = -0.085;
  const yBot = yTop - H;
  // la argolla, la corona de pinchos, el remate y el techo de pagoda
  put(L, tor(0.012, 0.0032, iron, 6, 16), 0, -0.004, 0);
  put(L, sph(0.011, brass, 12, 8), 0, -0.022, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    put(L, new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.022, 5), iron), Math.cos(a) * 0.016, -0.03, Math.sin(a) * 0.016, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
  put(L, cyl(0.013, 0.02, 0.018, iron, 6), 0, -0.043, 0, 0, Math.PI / 6, 0);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, R6 * 1.32, 0.042, 6, 1), iron);
  put(L, roof, 0, yTop + 0.021, 0, 0, Math.PI / 6, 0);
  // el alero con las puntas curvas para arriba
  put(L, tor(R6 * 1.3, 0.003, brass, 5, 6), 0, yTop + 0.001, 0, Math.PI / 2, 0, Math.PI / 6);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02, 5), iron);
    put(L, c, Math.cos(a) * R6 * 1.34, yTop + 0.008, Math.sin(a) * R6 * 1.34, -Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9);
  }
  // los marcos de arriba y de abajo, los seis parantes y los vidrios
  for (const y of [yTop - 0.004, yBot + 0.004]) put(L, tor(R6, 0.0036, iron, 5, 6), 0, y, 0, Math.PI / 2, 0, Math.PI / 6);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    // parante retorcido: una vara con anillitos
    const px = Math.cos(a) * R6;
    const pz = Math.sin(a) * R6;
    put(L, cyl(0.0038, 0.0038, H, iron, 6), px, yBot + H / 2, pz);
    for (let q = 1; q < 5; q++) put(L, tor(0.0048, 0.0014, brass, 4, 8), px, yBot + (H * q) / 5, pz, Math.PI / 2, 0, 0);
    // la cara: vidrio verdoso y la voluta de hierro (una S de dos arcos)
    const b = (k / 6) * Math.PI * 2;
    const fx = Math.cos(b) * W;
    const fz = Math.sin(b) * W;
    const p = put(L, new THREE.Mesh(new THREE.PlaneGeometry(W * 1.12, H - 0.01), pane), fx, yBot + H / 2, fz, 0, Math.PI / 2 - b, 0);
    p.renderOrder = 2;
    const face = new THREE.Group();
    face.position.set(Math.cos(b) * (W + 0.003), yBot + H / 2, Math.sin(b) * (W + 0.003));
    face.rotation.y = Math.PI / 2 - b;
    L.add(face);
    const arcU = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0019, 4, 14, Math.PI * 1.3), iron);
    arcU.position.set(0, 0.03, 0);
    arcU.rotation.z = -0.4;
    face.add(arcU);
    const arcD = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0019, 4, 14, Math.PI * 1.3), iron);
    arcD.position.set(0, -0.03, 0);
    arcD.rotation.z = Math.PI - 0.4;
    face.add(arcD);
    face.add(box(0.0026, H * 0.86, 0.0026, iron));
  }
  // la base de seis caras y la gota colgante de abajo
  put(L, cyl(R6 * 1.08, R6 * 0.95, 0.016, iron, 6), 0, yBot - 0.006, 0, 0, Math.PI / 6, 0);
  put(L, cyl(R6 * 0.6, 0.012, 0.03, iron, 6), 0, yBot - 0.028, 0, 0, Math.PI / 6, 0);
  put(L, sph(0.009, brass, 10, 8), 0, yBot - 0.046, 0);
  put(L, new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 6), brass), 0, yBot - 0.062, 0, Math.PI, 0, 0);
  // el vidrio de las almas: una lágrima de vidrio con el corazón verde adentro
  const cy = yBot + H * 0.48;
  const vial = lathe([[0.001, -0.052], [0.02, -0.046], [0.034, -0.02], [0.036, 0.012], [0.026, 0.04], [0.012, 0.056], [0.001, 0.06]], soulGlass, 20);
  vial.position.y = cy;
  vial.renderOrder = 3;
  L.add(vial);
  put(L, cyl(0.014, 0.016, 0.008, brass, 12), 0, cy + 0.062, 0);
  put(L, cyl(0.016, 0.014, 0.008, brass, 12), 0, cy - 0.054, 0);
  const soul = new THREE.Group();
  soul.position.set(0, cy, 0);
  L.add(soul);
  const coreM = sph(0.013, core, 14, 10);
  soul.add(coreM);
  const auraM = sph(0.028, aura, 16, 12);
  soul.add(auraM);
  // (el latido lo maneja Potenciadores: no va en anim.glow)
  // las ánimas que giran adentro del vidrio (tres estelas en espiral)
  const wisps = [];
  for (let k = 0; k < 3; k++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.022 - k * 0.003, 0.0013, 4, 24, Math.PI * 0.9), wisp);
    w.rotation.set(Math.PI / 2 + (k - 1) * 0.5, 0, (k * Math.PI * 2) / 3);
    soul.add(w);
    wisps.push(w);
  }
  // la luz verde del corazón: la de la escena de la mano la pone Potenciadores
  // (una sola, siempre ahí, así no se recompilan los materiales al agarrarlo)
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(soul.position);
  L.add(muzzle);
  const tilt = new THREE.Group();
  // (en alto: la mano arriba a la derecha y el farol colgando a la vista)
  g.rotation.set(0.06, 0.3, -0.04);
  g.position.set(-0.06, 0.22, 0.03);
  tilt.add(g);
  tilt.scale.setScalar(0.58);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim, upgraded: false, tip, mouth: null, mate: g, bombGroup: null, yerba: null, pot: { soul, core: coreM, aura: auraM, wisps, swing, lantern: L, ring: wisps[0] } };
}

registerMate('adminmate', (up, T, hand) => buildAdminMate(T, hand));
registerMate('farol', (up, T) => buildFarol(T));
