import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Los Frascos de las Ánimas, uno distinto por mapa (world/Activities.js los
// pone en la pared y los llena). Cada modelo se arma en el lugar de la repisa:
// el piso en y = 0, la pared atrás (z = -0.28) y el frente hacia +z.
//  · molino: frasco de conserva con tapa de trapo a cuadros y piolín, en una
//    repisa de tabla, con velas y unas ramas de yerba. Almas naranjas.
//  · granja: damajuana forrada de mimbre, con corcho e hilo colorado, un atado
//    de yuyos secos y una pluma de cuervo. Almas verde amarillento.
//  · penal: frasco de formol del laboratorio del penal: cinchas de hierro,
//    candado y chapita con el número, en una ménsula de hierro. Almas azules.
//  · torre: relicario del remolino: un globo de vidrio en jaula de bronce sobre
//    una ménsula de piedra, con un anillo violeta que gira. Almas violetas.
//  · castillo: farol-relicario de hierro, hexagonal, con escarcha, colgado de
//    un dragón de hierro sobre una ménsula de granito. Almas de hielo.
//  · esteros: botellón con cintas coloradas del Gauchito Gil, velas rojas y
//    ofrendas en una tabla atada con tiento. Almas coloradas.
//  · monumento: urna votiva de bronce con campana de vidrio, sobre una
//    ménsula de travertino, con la escarapela y una rama de laurel. Almas celestes.
// Devuelve { obj, soul, y0, h, rgb, top, anim }: la columna de almas (soul)
// crece de y0 hasta y0 + h; top es la altura a la que vuelan las almas; anim
// (dt, t, fill) mueve lo que se mueve.

export const JAR_STYLE = { molino: 'molino', granja: 'granja', penal: 'penal', torre: 'torre', castillo: 'castillo', esteros: 'esteros', monumento: 'monumento' };

const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, mat, x, y, z, seg = 16, rx = 0, ry = 0, rz = 0) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------- materiales (una vez por mapa) ----------------
const cache = new WeakMap();
function mats(M) {
  let K = cache.get(M);
  if (K) return K;
  const glass = (c, o = 0.26) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.06, transparent: true, opacity: o, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.08 });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  K = {
    glass: glass(0xd8ece6),
    glassGreen: glass(0x9ad0a0, 0.32),
    glassAmber: glass(0xb89a60, 0.3),
    glassFrost: glass(0xe8f6ff, 0.34),
    glassClear: glass(0xe8f0ff, 0.2),
    wood: M.woodDark,
    iron: M.iron,
    brass: M.brass,
    stone: M.castleStone || M.stoneStep || M.stone,
    candle: M.candle,
    flame: M.flame,
    twine: std({ color: 0x9a7a4a, roughness: 1 }),
    red: std({ color: 0xb0141a, roughness: 0.7, side: THREE.DoubleSide }),
    redWax: std({ color: 0x9a1a14, roughness: 0.6 }),
    cork: std({ color: 0xa87a4a, roughness: 1 }),
    herb: std({ color: 0x8a7a44, roughness: 1 }),
    leaf: std({ color: 0x4a6a2a, roughness: 0.9, side: THREE.DoubleSide }),
    feather: std({ color: 0x0c0c10, roughness: 0.5, side: THREE.DoubleSide }),
    leather: std({ color: 0x6a4a2a, roughness: 0.9 }),
    gold: std({ color: 0xd8a83a, roughness: 0.25, metalness: 1 }),
    frost: std({ color: 0xeef6ff, roughness: 0.6 }),
    rust: std({ color: 0x5a3a28, roughness: 0.8, metalness: 0.6 }),
    gingham: std({
      map: canvasTex(64, 64, (x) => {
        x.fillStyle = '#f2ece0';
        x.fillRect(0, 0, 64, 64);
        x.fillStyle = 'rgba(170,24,24,0.55)';
        for (let i = 0; i < 64; i += 16) {
          x.fillRect(i, 0, 8, 64);
          x.fillRect(0, i, 64, 8);
        }
      }),
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    wicker: std({
      map: canvasTex(128, 64, (x) => {
        x.fillStyle = '#7a5a30';
        x.fillRect(0, 0, 128, 64);
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 16; c++) {
            x.fillStyle = (r + c) % 2 ? '#c09a5a' : '#a8804a';
            x.fillRect(c * 8 + 1, r * 8 + 1, 6, 6);
          }
        }
      }),
      roughness: 1,
    }),
  };
  cache.set(M, K);
  return K;
}

// La columna que brilla (una por frasco: cambia de color y de alto).
function soulMesh(r, rb = r * 0.94, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, rb, 1, seg), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }));
  m.renderOrder = 2;
  m.scale.y = 0.001;
  return m;
}

// Velitas (con su llama) en la repisa.
function candles(grp, K, spots, wax = K.candle) {
  const flames = [];
  for (const [x, z, h] of spots) {
    grp.add(cyl(0.022, 0.024, h, wax, x, 1.145 + h / 2, z, 8));
    const f = mesh(new THREE.ConeGeometry(0.014, 0.045, 6), K.flame, x, 1.145 + h + 0.03, z);
    grp.add(f);
    flames.push(f);
  }
  return flames;
}
const flicker = (flames, t) => {
  flames.forEach((f, i) => {
    const k = 1 + Math.sin(t * 13 + i * 2.1) * 0.12 + Math.sin(t * 7.3 + i) * 0.08;
    f.scale.set(1, k, 1);
  });
};

// Una repisa de tabla con dos ménsulas de hierro.
function shelf(grp, K, w = 0.7, d = 0.46) {
  grp.add(box(w, 0.05, d, K.wood, 0, 1.12, -0.05));
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    grp.add(box(0.03, 0.26, 0.03, K.iron, x, 0.99, -0.26));
    grp.add(box(0.03, 0.03, 0.3, K.iron, x, 1.08, -0.12));
    grp.add(box(0.025, 0.3, 0.025, K.iron, x, 0.99, -0.15, -0.8));
  }
}

const BUILD = {
  // Frasco de conserva, tapa de trapo a cuadros atada con piolín.
  molino(M, i, label) {
    const K = mats(M);
    const g = new THREE.Group();
    shelf(g, K);
    g.add(mesh(lathe([[0, 0], [0.15, 0], [0.172, 0.02], [0.178, 0.34], [0.152, 0.4], [0.138, 0.42], [0.14, 0.46]]), K.glass, 0, 1.145, 0)).children.at(-1).renderOrder = 3;
    // la tapa de trapo: el disco y la pollera que cae, y el piolín
    g.add(cyl(0.165, 0.165, 0.02, K.gingham, 0, 1.615, 0, 20));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.09, 20, 1, true), K.gingham, 0, 1.57, 0));
    g.add(mesh(new THREE.TorusGeometry(0.148, 0.006, 6, 24), K.twine, 0, 1.575, 0, Math.PI / 2));
    g.add(box(0.012, 0.08, 0.006, K.twine, 0.03, 1.53, 0.16, 0, 0, 0.3));
    // la etiqueta escrita a mano
    g.add(mesh(new THREE.PlaneGeometry(0.2, 0.11), new THREE.MeshStandardMaterial({ map: label, roughness: 1, transparent: true }), 0, 1.36, 0.181));
    // velas y unas ramitas de yerba sobre la tabla
    const flames = candles(g, K, [[-0.28, 0.05, 0.12], [0.27, 0.08, 0.09]]);
    for (let k = 0; k < 4; k++) g.add(box(0.012, 0.012, 0.22, K.herb, 0.2 + k * 0.012, 1.152, -0.12 + k * 0.01, 0, 0.3 + k * 0.15));
    for (let k = 0; k < 6; k++) g.add(mesh(new THREE.PlaneGeometry(0.04, 0.022), K.leaf, 0.18 + (k % 3) * 0.03, 1.156, -0.18 + k * 0.035, -Math.PI / 2, 0, k));
    const soul = soulMesh(0.155);
    return { obj: g, soul, y0: 1.16, h: 0.34, rgb: [1, 0.54, 0.16], top: 1.5, anim: (dt, t) => flicker(flames, t) };
  },

  // Damajuana de mimbre con corcho e hilo colorado.
  granja(M, i, label) {
    const K = mats(M);
    const g = new THREE.Group();
    // la tabla gruesa, con dos palos de ménsula y la soga
    g.add(box(0.72, 0.07, 0.5, K.wood, 0, 1.105, -0.03));
    for (const x of [-0.26, 0.26]) g.add(cyl(0.025, 0.03, 0.42, K.wood, x, 0.93, -0.16, 7, -0.75));
    const prof = [[0, 0], [0.13, 0], [0.19, 0.05], [0.215, 0.15], [0.2, 0.27], [0.13, 0.35], [0.055, 0.41], [0.048, 0.5], [0.058, 0.52]];
    g.add(mesh(lathe(prof), K.glassGreen, 0, 1.14, 0)).children.at(-1).renderOrder = 3;
    // el mimbre: forra la panza hasta la mitad, con dos asas
    g.add(mesh(lathe([[0.135, 0], [0.197, 0.05], [0.222, 0.15], [0.214, 0.22]], 28), K.wicker, 0, 1.139, 0));
    g.add(mesh(new THREE.TorusGeometry(0.222, 0.012, 6, 28), K.wicker, 0, 1.36, 0, Math.PI / 2));
    for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 14, Math.PI), K.wicker, s * 0.2, 1.36, 0, 0, Math.PI / 2, 0));
    // corcho e hilo colorado atado al cuello
    g.add(cyl(0.04, 0.036, 0.05, K.cork, 0, 1.675, 0, 10));
    g.add(mesh(new THREE.TorusGeometry(0.05, 0.005, 5, 16), K.red, 0, 1.6, 0, Math.PI / 2));
    g.add(box(0.006, 0.12, 0.004, K.red, 0.03, 1.55, 0.05, 0, 0, 0.2));
    // la etiqueta de papel madera colgando del hilo
    g.add(mesh(new THREE.PlaneGeometry(0.13, 0.08), new THREE.MeshStandardMaterial({ map: label, roughness: 1, color: 0xd8b888, side: THREE.DoubleSide }), 0.06, 1.47, 0.075, -0.1, 0.35, 0.12));
    // el atado de yuyos colgando del borde y la pluma de cuervo en el mimbre
    const herbs = new THREE.Group();
    herbs.position.set(-0.3, 1.07, 0.2);
    for (let k = 0; k < 7; k++) herbs.add(cyl(0.004, 0.012, 0.22, K.herb, (k - 3) * 0.01, -0.11, (k % 2) * 0.01, 5, 0, 0, (k - 3) * 0.05));
    herbs.add(mesh(new THREE.TorusGeometry(0.02, 0.005, 5, 10), K.twine, 0, -0.01, 0, Math.PI / 2));
    g.add(herbs);
    g.add(mesh(new THREE.PlaneGeometry(0.035, 0.16), K.feather, 0.17, 1.33, 0.13, 0, 0.6, -0.4));
    const soul = soulMesh(0.17, 0.13);
    return {
      obj: g,
      soul,
      y0: 1.16,
      h: 0.26,
      rgb: [0.62, 1, 0.22],
      top: 1.5,
      anim: (dt, t) => {
        herbs.rotation.z = Math.sin(t * 1.1) * 0.05;
      },
    };
  },

  // Frasco de formol del penal: cinchas, candado y número.
  penal(M, i) {
    const K = mats(M);
    const g = new THREE.Group();
    // la ménsula de hierro: placa atrás con remaches, bandeja y tirante
    g.add(box(0.44, 0.5, 0.03, K.iron, 0, 1.05, -0.265));
    for (const [x, y] of [[-0.18, 1.25], [0.18, 1.25], [-0.18, 0.85], [0.18, 0.85]]) g.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), K.rust, x, y, -0.245));
    g.add(box(0.46, 0.035, 0.44, K.iron, 0, 1.12, -0.05));
    g.add(box(0.03, 0.03, 0.34, K.iron, 0, 0.99, -0.12, -0.72));
    for (const x of [-0.2, 0.2]) g.add(box(0.02, 0.05, 0.4, K.iron, x, 1.155, -0.05));
    // el frasco alto
    g.add(mesh(lathe([[0, 0], [0.13, 0], [0.142, 0.02], [0.142, 0.47], [0.125, 0.5], [0.126, 0.53]]), K.glassClear, 0, 1.14, 0)).children.at(-1).renderOrder = 3;
    // tapa de hierro con la argolla
    g.add(cyl(0.14, 0.14, 0.05, K.iron, 0, 1.69, 0, 20));
    g.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), K.iron, 0, 1.745, 0));
    // las cinchas y el candado
    for (const y of [1.22, 1.54]) g.add(mesh(new THREE.TorusGeometry(0.147, 0.009, 6, 28), K.iron, 0, y, 0, Math.PI / 2));
    for (const s of [-1, 1]) g.add(box(0.018, 0.56, 0.01, K.iron, s * 0.06, 1.43, 0.146));
    g.add(box(0.07, 0.07, 0.03, K.brass, 0, 1.43, 0.165));
    g.add(mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), K.iron, 0, 1.465, 0.165));
    // la chapita con el número
    const num = canvasTex(64, 40, (x) => {
      x.fillStyle = '#8a8a86';
      x.fillRect(0, 0, 64, 40);
      x.strokeStyle = '#3a3a38';
      x.lineWidth = 3;
      x.strokeRect(2, 2, 60, 36);
      x.fillStyle = '#1a1a18';
      x.font = 'bold 22px monospace';
      x.textAlign = 'center';
      x.fillText(`Nº ${[7, 13, 23, 31, 40][i % 5]}`, 32, 28);
    });
    g.add(mesh(new THREE.PlaneGeometry(0.1, 0.062), new THREE.MeshStandardMaterial({ map: num, roughness: 0.5, metalness: 0.6 }), 0, 1.1, 0.172));
    const soul = soulMesh(0.128);
    return { obj: g, soul, y0: 1.155, h: 0.47, rgb: [0.3, 0.68, 1], top: 1.55 };
  },

  // Relicario del remolino: globo de vidrio en jaula de bronce.
  torre(M, i) {
    const K = mats(M);
    const g = new THREE.Group();
    // la ménsula de piedra tallada, con filete de oro
    g.add(box(0.5, 0.1, 0.44, K.stone, 0, 1.08, -0.05));
    g.add(box(0.38, 0.1, 0.34, K.stone, 0, 0.98, -0.1));
    g.add(box(0.24, 0.12, 0.22, K.stone, 0, 0.87, -0.16));
    g.add(box(0.51, 0.015, 0.45, K.gold, 0, 1.135, -0.05));
    // la copa de bronce, el globo y la jaula
    g.add(mesh(lathe([[0, 0], [0.1, 0], [0.11, 0.02], [0.06, 0.05], [0.05, 0.08], [0.09, 0.1], [0.1, 0.12]], 20), K.brass, 0, 1.14, 0));
    const C = 1.43;
    g.add(mesh(new THREE.SphereGeometry(0.17, 28, 18), K.glass, 0, C, 0)).children.at(-1).renderOrder = 3;
    for (let k = 0; k < 6; k++) g.add(mesh(new THREE.TorusGeometry(0.178, 0.006, 5, 36), K.brass, 0, C, 0, 0, (k / 6) * Math.PI, 0));
    g.add(mesh(new THREE.TorusGeometry(0.18, 0.009, 6, 36), K.gold, 0, C, 0, Math.PI / 2));
    g.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 8), K.gold, 0, C + 0.24, 0));
    g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), K.gold, 0, C + 0.32, 0));
    // el anillo violeta que da vueltas alrededor
    const ring = mesh(new THREE.TorusGeometry(0.24, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.5, 1).multiplyScalar(1.6), transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }), 0, C, 0, Math.PI / 2 - 0.35);
    g.add(ring);
    const soul = soulMesh(0.1, 0.1);
    return {
      obj: g,
      soul,
      y0: C - 0.15,
      h: 0.3,
      rgb: [0.72, 0.42, 1],
      top: 1.5,
      anim: (dt, t, fill) => {
        ring.rotation.z += dt * (0.8 + fill * 2);
        ring.material.opacity = 0.35 + fill * 0.5;
      },
    };
  },

  // Farol-relicario de hierro con escarcha, colgado de un dragón de hierro.
  castillo(M, i) {
    const K = mats(M);
    const g = new THREE.Group();
    // ménsula de granito
    g.add(box(0.52, 0.12, 0.46, K.stone, 0, 1.08, -0.05));
    g.add(box(0.36, 0.14, 0.3, K.stone, 0, 0.95, -0.12));
    // el farol hexagonal: base, vidrio, parantes, techo y argolla
    g.add(cyl(0.16, 0.18, 0.05, K.iron, 0, 1.165, 0, 6));
    g.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.38, 6, 1, true), K.glassFrost, 0, 1.38, 0)).children.at(-1).renderOrder = 3;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.add(box(0.018, 0.4, 0.018, K.iron, Math.cos(a) * 0.14, 1.38, Math.sin(a) * 0.14));
    }
    g.add(cyl(0.155, 0.155, 0.03, K.iron, 0, 1.585, 0, 6));
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.14, 6), K.iron, 0, 1.67, 0));
    g.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), K.iron, 0, 1.77, 0));
    // la escarcha en la base y el techo
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      const fr = mesh(new THREE.SphereGeometry(0.035, 8, 5), K.frost, Math.cos(a) * 0.15, 1.19, Math.sin(a) * 0.15, 0, -a, 0);
      fr.scale.set(1.4, 0.45, 1);
      g.add(fr);
    }
    // el dragón de hierro: sale de la pared y tiene la argolla en el hocico
    const d = new THREE.Group();
    d.position.set(0, 1.86, -0.2);
    d.add(box(0.06, 0.06, 0.3, K.iron, 0, 0, 0.1));
    d.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 6), K.iron, 0, -0.01, 0.3, Math.PI / 2));
    for (const s of [-1, 1]) d.add(mesh(new THREE.ConeGeometry(0.012, 0.08, 5), K.iron, s * 0.025, 0.05, 0.06, -0.6, 0, s * 0.3));
    d.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 10), K.iron, 0, -0.05, 0.2));
    g.add(d);
    g.add(box(0.12, 0.2, 0.03, K.iron, 0, 1.86, -0.265));
    const soul = soulMesh(0.11, 0.11, 6);
    return { obj: g, soul, y0: 1.2, h: 0.36, rgb: [0.5, 0.88, 1], top: 1.55 };
  },

  // Botellón del Gauchito Gil: cintas coloradas, velas rojas y ofrendas.
  esteros(M, i) {
    const K = mats(M);
    const g = new THREE.Group();
    // la tabla atada con tiento a dos estacas de la pared
    g.add(box(0.72, 0.05, 0.44, K.wood, 0, 1.12, -0.05));
    for (const x of [-0.3, 0.3]) {
      g.add(cyl(0.02, 0.02, 0.3, K.wood, x, 1.2, -0.25, 6));
      g.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 10), K.leather, x, 1.14, -0.24, Math.PI / 2));
    }
    // el trapo colorado que cuelga del frente de la tabla
    g.add(mesh(new THREE.PlaneGeometry(0.72, 0.14), K.red, 0, 1.05, 0.172));
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.1, 3), K.red, 0, 0.93, 0.172, Math.PI, 0, 0));
    // el botellón
    g.add(mesh(lathe([[0, 0], [0.15, 0], [0.162, 0.03], [0.162, 0.3], [0.12, 0.38], [0.05, 0.44], [0.045, 0.58], [0.056, 0.6]]), K.glassAmber, 0, 1.145, 0)).children.at(-1).renderOrder = 3;
    g.add(cyl(0.042, 0.038, 0.05, K.cork, 0, 1.765, 0, 10));
    // las cintas coloradas atadas al cuello (se mueven)
    g.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 16), K.red, 0, 1.64, 0, Math.PI / 2));
    const ribbons = [-0.4, 0.3, 1.1].map((a, k) => {
      const r = new THREE.Group();
      r.position.set(Math.sin(a) * 0.05, 1.64, Math.cos(a) * 0.05);
      r.rotation.y = a;
      r.add(box(0.022, 0.2 + k * 0.04, 0.003, K.red, 0, -(0.1 + k * 0.02), 0.004));
      g.add(r);
      return r;
    });
    // velas coloradas y ofrendas: una botellita, una moneda, una estampita
    const flames = candles(g, K, [[-0.28, 0.06, 0.14], [-0.2, -0.1, 0.1], [0.27, 0.05, 0.12]], K.redWax);
    g.add(cyl(0.018, 0.02, 0.09, K.glassGreen, 0.22, 1.19, -0.12, 8));
    g.add(cyl(0.02, 0.02, 0.004, K.gold, 0.14, 1.148, 0.12, 12));
    g.add(mesh(new THREE.PlaneGeometry(0.07, 0.1), K.red, -0.05, 1.2, -0.25));
    const soul = soulMesh(0.145);
    return {
      obj: g,
      soul,
      y0: 1.17,
      h: 0.3,
      rgb: [1, 0.2, 0.14],
      top: 1.5,
      anim: (dt, t) => {
        flicker(flames, t);
        ribbons.forEach((r, k) => {
          r.rotation.x = Math.sin(t * 1.6 + k * 1.3) * 0.16;
          r.rotation.z = Math.sin(t * 1.1 + k) * 0.1;
        });
      },
    };
  },

  // La urna votiva del Monumento: bronce verde con campana de vidrio.
  monumento(M, i, label) {
    const K = mats(M);
    const g = new THREE.Group();
    const trav = M.travertino || K.stone;
    const bronze = M.bronze || K.brass;
    // la ménsula de travertino, con su moldura
    g.add(box(0.62, 0.08, 0.48, trav, 0, 1.1, -0.04));
    g.add(box(0.56, 0.05, 0.42, trav, 0, 1.05, -0.06));
    g.add(box(0.2, 0.32, 0.2, trav, 0, 0.88, -0.18));
    // el pie de bronce y la urna
    g.add(mesh(lathe([[0, 0], [0.16, 0], [0.16, 0.03], [0.1, 0.06], [0.07, 0.12], [0.12, 0.16], [0.17, 0.2], [0.17, 0.22], [0, 0.22]], 24), bronze, 0, 1.14, 0));
    // la campana de vidrio arriba (adentro, las almas)
    g.add(mesh(lathe([[0, 0], [0.15, 0], [0.155, 0.04], [0.152, 0.28], [0.12, 0.36], [0.06, 0.4], [0, 0.41]], 28), K.glassClear, 0, 1.36, 0)).children.at(-1).renderOrder = 3;
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), bronze, 0, 1.79, 0));
    // la escarapela al frente de la ménsula y la rama de laurel
    const cel = new THREE.MeshStandardMaterial({ color: 0x74acdf, roughness: 0.5 });
    const bla = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 });
    g.add(cyl(0.06, 0.06, 0.008, cel, 0, 1.1, 0.205, 20, Math.PI / 2));
    g.add(cyl(0.04, 0.04, 0.01, bla, 0, 1.1, 0.207, 20, Math.PI / 2));
    g.add(cyl(0.02, 0.02, 0.012, cel, 0, 1.1, 0.209, 16, Math.PI / 2));
    for (let k = 0; k < 7; k++) g.add(mesh(new THREE.PlaneGeometry(0.05, 0.022), K.leaf, -0.2 + k * 0.035, 1.152, 0.1 - k * 0.012, -Math.PI / 2, 0, 0.4 + k * 0.3));
    g.add(mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ map: label, roughness: 1, transparent: true }), 0.0, 1.0, 0.152));
    const soul = soulMesh(0.13);
    return { obj: g, soul, y0: 1.4, h: 0.26, rgb: [0.45, 0.76, 1], top: 1.7, anim: () => {} };
  },
};

// Las piezas quietas del frasco (ménsula, cinchas, remaches, tapa: una decena
// de hierro en el del penal) en una malla por material: se ve igual y son
// unas pocas llamadas de dibujo en vez de una por pieza. Quedan sueltas las
// que se mueven o se dibujan aparte: el vidrio y la etiqueta (transparentes,
// con su orden), las llamitas de las velas y lo que va en un grupo propio.
function mergeJar(g, M) {
  // (un grupo adentro se mueve entero, como el atado de yuyos: se junta adentro suyo)
  for (const c of g.children) if (!c.isMesh && c.children.length) mergeJar(c, M);
  const by = new Map();
  for (const o of g.children) {
    if (!o.isMesh || o.children.length || o.renderOrder || Array.isArray(o.material) || o.material.transparent || o.material === M.flame) continue;
    const L = by.get(o.material) || [];
    L.push(o);
    by.set(o.material, L);
  }
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    let geo = null;
    try {
      geo = mergeGeometries(
        list.map((o) => {
          const src = o.geometry;
          const ge = new THREE.BufferGeometry();
          for (const k of ['position', 'normal', 'uv']) {
            if (!src.attributes[k]) throw new Error('sin ' + k);
            ge.setAttribute(k, src.attributes[k]);
          }
          if (src.index) ge.setIndex(src.index);
          o.updateMatrix();
          return (ge.index ? ge.toNonIndexed() : ge.clone()).applyMatrix4(o.matrix);
        }),
      );
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = list.some((o) => o.castShadow);
    m.receiveShadow = list.some((o) => o.receiveShadow);
    for (const o of list) o.removeFromParent();
    g.add(m);
  }
}

export function buildJar(style, M, i, label) {
  const J = (BUILD[style] || BUILD.molino)(M, i, label);
  mergeJar(J.obj, M);
  return J;
}
