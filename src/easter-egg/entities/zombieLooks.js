import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise } from '../core/noise';
import { toTexture } from '../core/textures';

// Cómo se visten los muertos de cada mapa: colores, telas, prendas propias y
// el color de los ojos.
//  - molino: los de siempre (peones de boina, pañuelo y tiradores).
//  - granja: chacareros de camisa de lienzo, sombrero de paja y jardinero.
//  - penal: presos de uniforme a rayas, gorra, grilletes y el número.
//  - torre: peregrinos de hábito, capucha y cordón, pálidos como ánimas.
//  - castillo: conquistadores de morrión y peto, o arrieros de chullo y
//    poncho; escarchados y con los ojos colorados.
//  - esteros: ahogados de la partida (chaqueta azul, kepí, correaje) y
//    peones del estero (lienzo, poncho deshilachado); pálidos, empapados, con
//    barro, verdín y camalotes colgando, y los ojos verde agua.
// Zombies arma una malla instanciada por prenda (need: la bandera que la
// prende en cada zombie), así que cada mapa paga solo por lo que usa.

const N = makeNoise(407);
const pick = (r, list) => list[Math.floor(r() * list.length)];
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Pinta pixel por pixel: fn(x, y) devuelve [r, g, b] (0..255).
function paint(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const p = fn(x, y);
      d[i] = clamp(p[0]);
      d[i + 1] = clamp(p[1]);
      d[i + 2] = clamp(p[2]);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Una vez por página: los mapas que se arman de nuevo usan la misma.
const once = (fn) => {
  let t = null;
  return () => (t ||= toTexture(fn()));
};

// Rotura de la tela: se ve la piel oscura.
const torn = (x, y, s) => N.fbm(x / 8 + s, y / 8 + s * 0.7, 3, 16) > 0.77;

// ---------------- telas ----------------
// Uniforme de presidio: rayas anchas ocre y carbón, gastado y roto.
const stripesTex = once(() =>
  paint(128, 128, (x, y) => {
    if (torn(x, y, 17)) return [60, 48, 44];
    const light = Math.floor(y / 16) % 2 === 0;
    const n = N.fbm(x / 16 + 5, y / 16, 4, 8);
    const v = (0.72 + n * 0.42) * ((x + y) % 4 < 2 ? 0.94 : 1.05);
    return light ? [200 * v, 164 * v, 82 * v] : [54 * v, 52 * v, 62 * v];
  }),
);

// Camisa de lienzo de chacra: trama gruesa, manchas de sudor y tierra.
const cottonTex = once(() =>
  paint(128, 128, (x, y) => {
    if (torn(x, y, 40)) return [64, 50, 44];
    const n = N.fbm(x / 16 + 2, y / 16 + 9, 4, 8);
    let v = (0.74 + n * 0.4) * (x % 3 === 0 ? 0.93 : 1) * (y % 3 === 0 ? 0.95 : 1);
    if (N.fbm(x / 32 + 30, y / 32, 3, 4) > 0.6) v *= 0.8;
    return [222 * v, 214 * v, 198 * v];
  }),
);

// Hábito de lana cruda: acanalado, remendado y deshilachado.
const woolTex = once(() => {
  const c = paint(128, 128, (x, y) => {
    if (torn(x, y, 60)) return [46, 40, 38];
    const n = N.fbm(x / 16 + 60, y / 16, 4, 8);
    const v = (0.7 + n * 0.45) * (0.9 + Math.sin(x * 1.6) * 0.08);
    return [200 * v, 194 * v, 186 * v];
  });
  // remiendos cosidos
  const ctx = c.getContext('2d');
  for (const [x, y, w, h] of [[14, 70, 26, 22], [84, 20, 22, 26]]) {
    ctx.fillStyle = 'rgba(120,112,100,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,24,20,0.8)';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.setLineDash([]);
  }
  return c;
});

// Tejido andino (aguayo): franjas de colores con rombos.
const aguayoTex = once(() => {
  const cols = [[190, 40, 40], [230, 170, 40], [40, 120, 80], [110, 40, 130], [230, 220, 200], [40, 80, 160]];
  return paint(128, 128, (x, y) => {
    const band = Math.floor(y / 8);
    let col = cols[band % cols.length];
    if (band % 4 === 1 && Math.abs((x % 16) - 8) / 2 + Math.abs((y % 8) - 4) < 3) col = cols[(band + 2) % cols.length];
    const n = N.fbm(x / 16 + 80, y / 16 + 3, 3, 8);
    const v = (0.72 + n * 0.4) * (x % 2 === 0 ? 0.92 : 1.04);
    return [col[0] * v, col[1] * v, col[2] * v];
  });
});

// El estero: tela empapada y podrida, con manchas de barro y de verdín.
const mudTex = once(() =>
  paint(128, 128, (x, y) => {
    if (torn(x, y, 31)) return [52, 50, 44];
    const n = N.fbm(x / 16 + 40, y / 16 + 9, 4, 8);
    const m = N.fbm(x / 32 + 3, y / 32 + 60, 3, 4);
    const v = 0.62 + n * 0.32;
    const c = [185 * v, 180 * v, 168 * v];
    // barro (manchas grandes y difusas) y verdín donde no hay barro
    const k = Math.max(0, Math.min(0.55, (m - 0.5) * 2.2));
    const w = Math.max(0, Math.min(0.5, (0.42 - m) * 2.5));
    return [(c[0] * (1 - k) + 90 * k) * (1 - w * 0.3), (c[1] * (1 - k) + 76 * k) * (1 - w * 0.1), (c[2] * (1 - k) + 52 * k) * (1 - w * 0.45)];
  }),
);

// El poncho del peón: lana lisa y gastada con dos guardas oscuras cerca del
// borde (sin ellas, de lejos parecía una canasta), agujereado.
const ponchoTex = once(() =>
  paint(64, 64, (x, y) => {
    if (torn(x * 2, y * 2, 53)) return [40, 36, 30];
    const v = 1 - y / 64;
    const n = N.fbm(x / 8 + 20, y / 8 + 4, 3, 8);
    const k = (0.78 + n * 0.3) * (y % 2 === 0 ? 0.95 : 1.02);
    const band = (v > 0.1 && v < 0.17) || (v > 0.22 && v < 0.25) ? 0.4 : 1;
    return [215 * k * band, 205 * k * band, 190 * k * band];
  }),
);

// ---------------- piezas ----------------
// Solo posición, normal y uv, sin índices: así se pueden juntar.
function merge(list) {
  return mergeGeometries(
    list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
      return n;
    }),
  );
}

// Tela que se ve de los dos lados (capucha, hábito, poncho): una copia apenas
// más chica con las caras dadas vuelta.
function twoSided(geo, k = 0.96) {
  const out = geo.index ? geo.toNonIndexed() : geo;
  const inn = out.clone();
  inn.scale(k, 1, k);
  for (const name of ['position', 'normal', 'uv']) {
    const a = inn.attributes[name];
    const s = a.itemSize;
    for (let i = 0; i < a.count; i += 3) {
      for (let c = 0; c < s; c++) {
        const t = a.array[(i + 1) * s + c];
        a.array[(i + 1) * s + c] = a.array[(i + 2) * s + c];
        a.array[(i + 2) * s + c] = t;
      }
    }
  }
  const nor = inn.attributes.normal;
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return merge([out, inn]);
}

const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// La tapera: sombrero de paja de ala ancha y el jardinero (pechera y tiradores).
const strawHat = () =>
  merge([
    new THREE.CylinderGeometry(0.215, 0.215, 0.012, 22).translate(0, -0.005, 0),
    new THREE.CylinderGeometry(0.098, 0.112, 0.085, 16).translate(0, 0.04, 0),
    new THREE.CylinderGeometry(0.115, 0.115, 0.022, 16).translate(0, 0.012, 0),
  ]);
const overall = () =>
  merge([
    new THREE.BoxGeometry(0.22, 0.25, 0.02).translate(0, -0.03, 0.13),
    new THREE.BoxGeometry(0.08, 0.04, 0.012).translate(0, 0.02, 0.142),
    ...[-1, 1].flatMap((s) => [
      new THREE.BoxGeometry(0.035, 0.2, 0.012).translate(s * 0.075, 0.18, 0.133),
      new THREE.BoxGeometry(0.035, 0.014, 0.27).translate(s * 0.08, 0.285, 0),
      new THREE.BoxGeometry(0.035, 0.52, 0.012).translate(s * 0.075, 0.02, -0.132),
      new THREE.SphereGeometry(0.014, 6, 4).translate(s * 0.075, 0.09, 0.143),
    ]),
  ]);

// El penal: gorra redonda a rayas, grilletes con la cadena cortada, esposas y el número.
const prisonCap = () => {
  const g = new THREE.CylinderGeometry(0.118, 0.126, 0.08, 16).translate(0, 0.02, 0);
  // dos o tres rayas en la gorra (la tela entera serían ocho)
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.3);
  return g;
};
const link = (r, t) => new THREE.TorusGeometry(r, t, 4, 8);
const shackle = () =>
  merge([
    new THREE.TorusGeometry(0.08, 0.017, 6, 14).rotateX(Math.PI / 2).translate(0, -0.17, 0),
    link(0.024, 0.007).translate(0.05, -0.2, 0.06),
    link(0.024, 0.007).rotateY(Math.PI / 2).translate(0.07, -0.235, 0.075),
    link(0.024, 0.007).translate(0.085, -0.27, 0.08),
  ]);
const cuff = () =>
  merge([
    new THREE.TorusGeometry(0.058, 0.014, 6, 12).rotateX(Math.PI / 2).translate(0, -0.1, 0),
    link(0.02, 0.006).translate(0.045, -0.125, 0.03),
    link(0.02, 0.006).rotateY(Math.PI / 2).translate(0.055, -0.155, 0.035),
  ]);
const numPatch = () => new THREE.BoxGeometry(0.1, 0.065, 0.008).translate(-0.095, 0.13, 0.128);

// La torre: capucha con punta, el cuello del hábito, la falda hasta la canilla y el cordón.
const hood = () => {
  const shell = new THREE.SphereGeometry(0.158, 16, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.15);
  shell.scale(1, 1.08, 1.1).translate(0, 0.012, -0.012);
  const tip = new THREE.ConeGeometry(0.07, 0.14, 8).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.07, -0.19);
  return merge([twoSided(shell, 0.95), tip]);
};
const cowl = () => new THREE.TorusGeometry(0.14, 0.055, 6, 16).rotateX(Math.PI / 2).scale(1, 0.7, 0.85).translate(0, 0.28, -0.005);
const robe = () => {
  const g = lathe([[0.305, -0.6], [0.285, -0.42], [0.25, -0.2], [0.22, 0.0], [0.205, 0.11]], 16);
  g.scale(1, 1, 0.78);
  return twoSided(g, 0.95);
};
const cord = () =>
  merge([
    new THREE.TorusGeometry(0.228, 0.014, 5, 22).rotateX(Math.PI / 2).scale(1, 1, 0.8).translate(0, 0.05, 0),
    new THREE.CylinderGeometry(0.01, 0.01, 0.34, 5).rotateZ(0.08).translate(0.07, -0.13, 0.19),
    new THREE.CylinderGeometry(0.01, 0.01, 0.28, 5).rotateZ(-0.05).translate(0.1, -0.1, 0.185),
    new THREE.SphereGeometry(0.02, 6, 4).translate(0.075, 0.03, 0.19),
    new THREE.SphereGeometry(0.016, 6, 4).translate(0.057, -0.3, 0.19),
    new THREE.SphereGeometry(0.016, 6, 4).translate(0.107, -0.24, 0.185),
  ]);

// El castillo: morrión de cresta, peto con faldar, chullo de orejeras y poncho andino.
const morion = () => {
  const brim = new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24);
  brim.scale(0.82, 1, 1.22);
  // el ala se levanta adelante y atrás, como una barca
  const p = brim.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (p.getZ(i) / 0.244) ** 2 * 0.07);
  brim.computeVertexNormals();
  const dome = new THREE.SphereGeometry(0.125, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.2, 1.12);
  const crest = new THREE.CylinderGeometry(0.1, 0.1, 0.014, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.09, 0);
  return merge([brim.translate(0, -0.01, 0), dome.translate(0, -0.01, 0), crest]);
};
const cuirass = () =>
  merge([
    new THREE.CylinderGeometry(0.224, 0.206, 0.42, 16, 1, true).scale(1, 1, 0.64).translate(0, 0.04, 0),
    new THREE.BoxGeometry(0.02, 0.38, 0.02).translate(0, 0.04, 0.142),
    new THREE.CylinderGeometry(0.222, 0.24, 0.08, 16, 1, true).scale(1, 1, 0.68).translate(0, -0.2, 0),
  ]);
// hombreras de chapa sobre el brazo
const pauldron = () => new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.05).translate(0, 0.1, 0);
const chullo = () =>
  merge([
    new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1.04).translate(0, 0.05, -0.008),
    new THREE.SphereGeometry(0.03, 8, 6).translate(0, 0.21, -0.01),
    ...[-1, 1].flatMap((s) => [
      new THREE.SphereGeometry(0.06, 8, 6).scale(0.28, 1.25, 0.72).translate(s * 0.12, -0.02, -0.01),
      new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5).translate(s * 0.12, -0.13, -0.01),
      new THREE.SphereGeometry(0.014, 6, 4).translate(s * 0.12, -0.195, -0.01),
    ]),
  ]);
// las franjas del poncho andino van de arriba abajo (la tela del chullo, de costado)
function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.5, uv.getX(i));
  return g;
}
const poncho = () => {
  const yoke = swapUV(lathe([[0.265, 0.1], [0.25, 0.18], [0.205, 0.25], [0.125, 0.295], [0.07, 0.305]], 16));
  yoke.scale(1, 1, 0.68);
  const panels = [0, Math.PI].map((a) => swapUV(new THREE.CylinderGeometry(0.265, 0.29, 0.3, 12, 1, true, a - 1.05, 2.1)).scale(1, 1, 0.68).translate(0, -0.05, 0));
  return merge([twoSided(yoke, 0.97), ...panels.map((g) => twoSided(g, 0.97))]);
};
const snow = () =>
  merge([
    ...[-1, 1].map((s) => new THREE.SphereGeometry(0.07, 8, 5).scale(1.3, 0.32, 1.1).translate(s * 0.13, 0.285, 0)),
    new THREE.SphereGeometry(0.05, 7, 4).scale(1.4, 0.3, 1).translate(0.02, 0.29, -0.06),
  ]);

// El estero: el kepí de la partida (copa blanda caída adelante, visera y
// botón), el correaje cruzado con el cinto, el poncho hecho jirones y los
// camalotes y el verdín que les cuelgan de la cabeza y los hombros.
const kepi = () => {
  const crown = new THREE.CylinderGeometry(0.105, 0.122, 0.1, 14, 2);
  const p = crown.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + ((p.getY(i) + 0.05) / 0.1) * 0.035);
  crown.computeVertexNormals();
  return merge([
    crown.translate(0, 0.035, 0),
    new THREE.CylinderGeometry(0.106, 0.106, 0.01, 14).translate(0, 0.087, 0.035),
    new THREE.CylinderGeometry(0.125, 0.125, 0.026, 14).translate(0, -0.008, 0),
    new THREE.CylinderGeometry(0.11, 0.11, 0.008, 14, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.62).rotateX(0.3).translate(0, -0.018, 0.085),
    new THREE.SphereGeometry(0.012, 6, 4).translate(0, 0.012, 0.128),
  ]);
};
const crossBelt = () =>
  merge([
    new THREE.BoxGeometry(0.045, 0.62, 0.012).rotateZ(0.52).translate(0, 0.01, 0.131),
    new THREE.BoxGeometry(0.045, 0.62, 0.012).rotateZ(-0.52).translate(0, 0.01, -0.131),
    new THREE.BoxGeometry(0.432, 0.05, 0.262).translate(0, -0.245, 0),
    new THREE.BoxGeometry(0.08, 0.06, 0.03).translate(-0.12, -0.245, 0.135),
  ]);
const raggedPoncho = () => {
  const yoke = lathe([[0.245, 0.1], [0.238, 0.18], [0.2, 0.25], [0.125, 0.295], [0.07, 0.305]], 16);
  yoke.scale(1, 1, 0.68);
  const panels = [0, Math.PI].map((a, j) => {
    const g = new THREE.CylinderGeometry(0.245, 0.28, 0.44, 18, 2, true, a - 1.05, 2.1);
    // el borde de abajo en jirones
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.2) p.setY(i, p.getY(i) + (((i * 7 + j * 3) % 5) / 5) * 0.13);
    g.computeVertexNormals();
    return g.scale(1, 1, 0.68).translate(0, -0.12, 0);
  });
  return merge([twoSided(yoke, 0.97), ...panels.map((g) => twoSided(g, 0.97))]);
};
const strand = (pts, r = 0.009) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 8, r, 4, false);
const algaeHead = () =>
  merge([
    strand([[0.1, 0.13, 0.02], [0.118, 0.1, 0.03], [0.122, 0.02, 0.02], [0.13, -0.08, 0.03]]),
    strand([[-0.095, 0.13, -0.05], [-0.118, 0.09, -0.06], [-0.121, 0, -0.05], [-0.128, -0.12, -0.06]]),
    strand([[0.03, 0.137, -0.09], [0.035, 0.1, -0.128], [0.03, 0, -0.13], [0.04, -0.1, -0.135]]),
    strand([[-0.06, 0.137, 0.06], [-0.118, 0.11, 0.07], [-0.12, 0.03, 0.08]], 0.008),
  ]);
const algaeShoulders = () =>
  merge([
    ...[-1, 1].flatMap((s) => [
      strand([[s * 0.14, 0.29, -0.03], [s * 0.15, 0.285, 0.13], [s * 0.16, 0.18, 0.135], [s * 0.14, 0.02, 0.138], [s * 0.15, -0.08, 0.14]], 0.01),
      strand([[s * 0.17, 0.29, 0.02], [s * 0.18, 0.28, -0.13], [s * 0.17, 0.12, -0.133], [s * 0.19, -0.02, -0.136]]),
    ]),
    strand([[0.02, 0.29, 0], [0, 0.26, 0.128], [0.03, 0.12, 0.132]], 0.008),
  ]);

// ---------------- los mapas ----------------
const HAIR = [0x1a1410, 0x3a2a1a, 0x6a6a64, 0x2a2a2a];
const steel = (mk, T) => mk(T.grime, { metalness: 0.45, roughness: 0.45 });

const LOOKS = {
  molino: {
    base: ['hair', 'boina', 'scarf', 'susp'],
    dress(r) {
      const colors = {
        skin: pick(r, [0x6d7a5e, 0x7a7f68, 0x5e6456, 0x858a76, 0x6a5f52, 0x78705a]),
        shirt: pick(r, [0x4a4f3a, 0x5a2c24, 0x2f3b4a, 0x6a6454, 0x3d4a34, 0x7a6a48, 0x2a2a2a, 0x8a8478]),
        pants: pick(r, [0x3a3328, 0x5a5040, 0x26282c, 0x4a3a2a, 0x6a5a44, 0x3a4048]),
        boots: pick(r, [0x1c1612, 0x2a1e14, 0x3a2a1a]),
        hat: pick(r, [0x1a1a1a, 0x2a2440, 0x3a1a18, 0x40382a]),
        scarf: pick(r, [0x8a1a14, 0xd8d0c0, 0x1e3a6a, 0x6a1a3a]),
        hair: pick(r, HAIR),
      };
      // sombrero, pelo o boina; pañuelo y tiradores al azar
      const top = r();
      return { colors, hat: top <= 0.4, flags: { hair: top > 0.4 && top < 0.78, boina: top >= 0.78, scarf: r() < 0.4, susp: r() < 0.35 } };
    },
  },
  granja: {
    tex: { cloth: cottonTex },
    geo: { hat: strawHat, overall },
    base: ['hair', 'scarf', 'susp'],
    parts: [{ key: 'overall', parts: [1], color: 'pants', mat: 'pants', need: 'overall' }],
    dress(r) {
      const colors = {
        skin: pick(r, [0x7a6c52, 0x6e6450, 0x857458, 0x6a6a52, 0x7c6650, 0x746e5a]),
        shirt: pick(r, [0xd8d0c0, 0xb8a88a, 0x8a9aa8, 0xc8b89a, 0x9a8a6a, 0xa87a6a, 0x7a8a6a]),
        pants: pick(r, [0x3a4a6a, 0x2e3e5a, 0x4a5a78, 0x5a5040, 0x3a3a40]),
        boots: pick(r, [0x1a1a1a, 0x2a3422, 0x3a2a1a]),
        hat: pick(r, [0xc8a860, 0xb89850, 0xd4b870, 0xa88a48]),
        scarf: pick(r, [0xa81c1c, 0x1c3a8a, 0xd8d0c0, 0x2a6a3a]),
        hair: pick(r, HAIR),
      };
      const top = r();
      const overall = r() < 0.45;
      return { colors, hat: top < 0.55, flags: { hair: top >= 0.55 && top < 0.9, scarf: r() < 0.35, susp: !overall && r() < 0.25, overall } };
    },
  },
  penal: {
    tex: { cloth: stripesTex, pants: stripesTex },
    geo: { hat: prisonCap, shackle, cuff, num: numPatch },
    hatMat: 'cloth',
    mats: { steel },
    base: ['hair'],
    parts: [
      { key: 'shackle', parts: [9, 10], color: 'metal', mat: 'steel', need: 'shackle' },
      { key: 'cuff', parts: [5, 6], color: 'metal', mat: 'steel', need: 'cuff' },
      { key: 'num', parts: [1], color: 'patch', mat: 'plain', need: 'num' },
    ],
    dress(r) {
      // el uniforme es uno solo: cambia lo gastado y sucio que está
      const uni = pick(r, [0xffffff, 0xe8e0d0, 0xd6ccba, 0xc0b8a8]);
      const colors = {
        skin: pick(r, [0x8a8c7a, 0x7c8070, 0x9a9484, 0x70766a, 0x86806e]),
        shirt: uni,
        pants: pick(r, [uni, 0xe0d8c8, 0xc8c0b0]),
        boots: pick(r, [0x1c1612, 0x2a2420, 0x3a3028]),
        hat: uni,
        metal: pick(r, [0x5a5a5c, 0x4e4a46, 0x686258]),
        patch: pick(r, [0xe8e4d8, 0xd8d0c0, 0xcfc6b0]),
        hair: pick(r, HAIR),
      };
      const top = r();
      return { colors, hat: top < 0.45, flags: { hair: top >= 0.45 && top < 0.82, shackle: r() < 0.75, cuff: r() < 0.4, num: r() < 0.65 } };
    },
  },
  torre: {
    tex: { cloth: woolTex, pants: woolTex },
    geo: { hood, cowl, robe, cord },
    drop: ['hat'],
    base: ['hair'],
    parts: [
      { key: 'hood', parts: [2], color: 'shirt', mat: 'cloth', need: 'hood' },
      { key: 'cowl', parts: [1], color: 'shirt', mat: 'cloth', need: 'hood' },
      { key: 'robe', parts: [0], color: 'shirt', mat: 'cloth', need: 'robe' },
      { key: 'cord', parts: [0], color: 'rope', mat: 'plain', need: 'cord' },
    ],
    dress(r) {
      const habit = pick(r, [0x4a3a2a, 0x3a3834, 0x2a2622, 0x5a4a38, 0x6a6458, 0x3a2e28]);
      const colors = {
        skin: pick(r, [0x9aa0a0, 0x8a9498, 0xa8a8a0, 0x7a8488, 0x949890]),
        shirt: habit,
        pants: pick(r, [habit, 0x2a2622, 0x3a3834]),
        boots: pick(r, [0x3a2a1a, 0x2a2018, 0x4a3a28]),
        hat: habit,
        rope: pick(r, [0xb89a68, 0xa08a60, 0xc8b088]),
        hair: pick(r, HAIR),
      };
      const hooded = r() < 0.7;
      return { colors, hat: false, flags: { hood: hooded, hair: !hooded && r() < 0.7, robe: r() < 0.85, cord: r() < 0.7 } };
    },
  },
  castillo: {
    // rojos de verdad: muy fuerte, el tono de la imagen los vira a naranja
    eyes: 0xff0000,
    eyeGlow: 1.1,
    geo: { hat: morion, cuirass, pauldron, chullo, poncho, snow },
    hatMat: 'steel',
    mats: { steel, woven: (mk) => mk(aguayoTex()) },
    base: ['hair'],
    parts: [
      { key: 'cuirass', parts: [1], color: 'metal', mat: 'steel', need: 'armor' },
      { key: 'pauldron', parts: [3, 4], color: 'metal', mat: 'steel', need: 'armor' },
      { key: 'chullo', parts: [2], color: 'weave', mat: 'woven', need: 'chullo' },
      { key: 'poncho', parts: [1], color: 'weave', mat: 'woven', need: 'poncho' },
      { key: 'snow', parts: [1], color: 'snow', mat: 'plain', need: 'snow' },
    ],
    dress(r) {
      // mitad soldados de la conquista, mitad arrieros de la cordillera
      const soldier = r() < 0.5;
      const colors = {
        skin: pick(r, [0x8a9aa4, 0x9aa4a8, 0x7a8a94, 0xa0a8a8, 0x868e8a]),
        shirt: soldier ? pick(r, [0x7a2a24, 0x8a6a2a, 0x5a2a3a, 0x6a5a3a]) : pick(r, [0x5a4a3a, 0x6a5a48, 0x4a4238, 0x7a6a50]),
        pants: pick(r, [0x3a3228, 0x4a4238, 0x2a2a2e, 0x5a4a38]),
        boots: pick(r, [0x1c1612, 0x2a1e14, 0x3a2a1a]),
        hat: pick(r, [0xb8b8b4, 0xa8a8a0, 0x9a968c]),
        metal: pick(r, [0x8c8c88, 0x7a7870, 0x6a6862]),
        weave: pick(r, [0xffffff, 0xf0e0d8, 0xe0e8f0, 0xe8e0c8]),
        snow: 0xf2f6fa,
        hair: pick(r, HAIR),
      };
      const hat = soldier && r() < 0.8;
      const wool = !soldier && r() < 0.8;
      return { colors, hat, flags: { armor: soldier && r() < 0.8, chullo: wool, poncho: !soldier && r() < 0.75, hair: !hat && !wool && r() < 0.8, snow: r() < 0.5 } };
    },
  },
  esteros: {
    // verde agua, como los del Sargento
    eyes: 0x5affc0,
    eyeGlow: 2.2,
    geo: { hat: kepi, belts: crossBelt, rags: raggedPoncho, algae: algaeHead, algaeS: algaeShoulders },
    hatMat: 'cloth',
    // empapados: la ropa y la piel brillan
    mats: {
      cloth: (mk) => mk(mudTex(), { roughness: 0.55 }),
      pants: (mk) => mk(mudTex(), { roughness: 0.6 }),
      skin: (mk, T) => mk(T.zskin, { roughness: 0.42 }),
      algae: (mk, T) => mk(T.grime, { roughness: 0.35 }),
      wool: (mk) => mk(ponchoTex(), { roughness: 0.65 }),
    },
    base: ['hair', 'scarf'],
    parts: [
      { key: 'belts', parts: [1], color: 'belt', mat: 'leather', need: 'belts' },
      { key: 'rags', parts: [1], color: 'poncho', mat: 'wool', need: 'poncho' },
      { key: 'algae', parts: [2], color: 'algae', mat: 'algae', need: 'algaeH' },
      { key: 'algaeS', parts: [1], color: 'algae', mat: 'algae', need: 'algae' },
    ],
    dress(r) {
      // casi la mitad son de la partida (uniforme y kepí); los demás, peones
      const soldier = r() < 0.45;
      const colors = {
        skin: pick(r, [0x8a9a8e, 0x7e8e88, 0x96a096, 0x7a8a80, 0x8c968a, 0x9aa49a]),
        shirt: soldier ? pick(r, [0x27313c, 0x2e3a4c, 0x3a4658, 0x34404a]) : pick(r, [0xb0a894, 0x9a9078, 0x807a66, 0x948e76, 0x6e6c5c]),
        pants: soldier ? pick(r, [0x2a2e34, 0x5a2a24, 0x3a3a34]) : pick(r, [0x3a3328, 0x2a2a2a, 0x4a4234, 0x5a4a38]),
        boots: pick(r, [0x1c1612, 0x2a1e14, 0x3a2e22]),
        hat: pick(r, [0x27313c, 0x2a3040, 0x5a2420]),
        poncho: pick(r, [0x7a2a20, 0x5a4a32, 0x4a5058, 0x6a5a3e, 0x3a2e28]),
        belt: pick(r, [0xc8c0a8, 0xb0a890, 0x2a2018]),
        scarf: pick(r, [0x8a1a14, 0xd8d0c0, 0x6a1a1a, 0x3a4a2a]),
        algae: pick(r, [0x4e7a2c, 0x5a8a34, 0x3e6a28, 0x6a8a3a]),
        hair: pick(r, HAIR),
      };
      const hat = soldier && r() < 0.75;
      return { colors, hat, flags: { hair: !hat && r() < 0.75, belts: soldier && r() < 0.8, poncho: !soldier && r() < 0.7, scarf: !soldier && r() < 0.4, algae: r() < 0.55, algaeH: r() < 0.4 } };
    },
  },
};

export function zombieLook(mapId) {
  return LOOKS[mapId] || LOOKS.molino;
}

// Las piezas propias del mapa (y las que reemplaza, como el sombrero).
export function lookGeometries(L) {
  return Object.fromEntries(Object.entries(L.geo || {}).map(([k, f]) => [k, f()]));
}
