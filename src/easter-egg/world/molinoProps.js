import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, addBuilders } from './props';

// Utilería del cementerio del molino: tumbas de los peones (de cada una puede
// salir un muerto), el panteón del Capataz, árboles secos, una fosa abierta y
// cruces viejas contra la tapia. Se suma a los constructores de world/props.js.

const B = (g, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 8) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

// La placa del panteón, pintada en un canvas.
function plaque() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6a5a3a';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#3a2e1a';
  x.lineWidth = 8;
  x.strokeRect(6, 6, 244, 116);
  x.fillStyle = '#e8d8a0';
  x.textAlign = 'center';
  x.font = 'bold 30px Georgia, serif';
  x.fillText('ANSELMO', 128, 48);
  x.font = '20px Georgia, serif';
  x.fillText('CAPATAZ', 128, 76);
  x.fillText('1868 · 1911', 128, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.6 });
}

// Florcitas de plástico y cabos de vela al pie de una tumba.
function offerings(g, M, r, z) {
  const petal = [M.redPaint, M.packYellow, M.clothWhite];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.6;
    const zz = z + (r() - 0.5) * 0.25;
    C(g, 0.006, 0.006, 0.22, M.leaf, x, 0.11, zz, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4, 4);
    g.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), petal[Math.floor(r() * 3)], x, 0.23, zz));
  }
  if (r() < 0.6) {
    C(g, 0.025, 0.025, 0.08 + r() * 0.08, M.candle, (r() - 0.5) * 0.4, 0.05, z + 0.12, 0, 0, 0, 6);
  }
}

const BUILDERS = {
  // Una tumba: montículo de tierra con cruz de palo (o lápida, o reja de hierro).
  tumba(M, o, r) {
    const g = new THREE.Group();
    const kind = o.kind || 'cross';
    const mound = mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.dirtDark, 0, -0.04, 0);
    mound.scale.set(0.95, 0.42, 1.85);
    g.add(mound);
    // piedritas y pasto seco alrededor
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.04 + r() * 0.05, 0), M.stone, (r() - 0.5) * 1.1, 0.02, (r() - 0.5) * 1.9));
    const boxes = [];
    if (kind === 'stone') {
      // lápida de piedra gastada, un poco torcida
      const s = new THREE.Group();
      s.position.set(0, 0, -1.0);
      s.rotation.set((r() - 0.5) * 0.2, (r() - 0.5) * 0.2, (r() - 0.5) * 0.15);
      B(s, 0.62, 0.72, 0.13, M.stone, 0, 0.36, 0);
      const top = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.13, 14, 1, false, 0, Math.PI), M.stone, 0, 0.72, 0, Math.PI / 2, 0, Math.PI / 2);
      s.add(top);
      B(s, 0.34, 0.03, 0.02, M.stoneDark, 0, 0.62, 0.07);
      B(s, 0.4, 0.03, 0.02, M.stoneDark, 0, 0.5, 0.07);
      B(s, 0.28, 0.03, 0.02, M.stoneDark, 0, 0.4, 0.07);
      g.add(s);
      boxes.push([-0.36, 0, -1.12, 0.36, 1.0, -0.88]);
    } else {
      // cruz de palo o de hierro
      const iron = kind === 'fence';
      const mat = iron ? M.iron : M.woodDark;
      const c = new THREE.Group();
      c.position.set(0, 0, -1.0);
      c.rotation.set((r() - 0.5) * 0.25, (r() - 0.5) * 0.3, (r() - 0.5) * 0.25);
      B(c, iron ? 0.05 : 0.08, 1.15, iron ? 0.05 : 0.06, mat, 0, 0.55, 0);
      B(c, 0.5, iron ? 0.05 : 0.08, iron ? 0.05 : 0.06, mat, 0, 0.84, 0);
      if (iron) {
        // puntas de hierro forjado en los extremos
        for (const [x, y] of [[0, 1.14], [0.25, 0.84], [-0.25, 0.84]]) c.add(mesh(new THREE.OctahedronGeometry(0.04, 0), M.iron, x, y, 0));
      } else if (r() < 0.5) {
        // un trapo colorado atado (promesa)
        B(c, 0.05, 0.3, 0.006, M.redPaint, 0.1, 0.66, 0.04, 0, 0, 0.12);
      }
      g.add(c);
      boxes.push([-0.28, 0, -1.08, 0.28, 1.1, -0.92]);
      if (iron) {
        // rejita baja alrededor de la tumba (no frena: es de adorno)
        const H = 0.32;
        for (const s of [-1, 1]) {
          B(g, 0.03, 0.03, 2.0, M.iron, s * 0.55, H, 0);
          B(g, 0.03, 0.03, 2.0, M.iron, s * 0.55, 0.08, 0);
          for (let k = 0; k < 7; k++) C(g, 0.012, 0.012, H, M.iron, s * 0.55, H / 2, -0.95 + k * 0.32, 0, 0, 0, 4);
        }
        B(g, 1.1, 0.03, 0.03, M.iron, 0, H, 1.0);
        for (let k = 0; k < 4; k++) C(g, 0.012, 0.012, H, M.iron, -0.45 + k * 0.3, H / 2, 1.0, 0, 0, 0, 4);
      }
    }
    offerings(g, M, r, -0.75);
    return { obj: g, boxes };
  },

  // El panteón del Capataz: sarcófago de piedra con una cruz grande de hierro
  // en la cabecera (ahí se cuelga el sombrero) y la placa con su nombre.
  panteon(M, o, r) {
    const g = new THREE.Group();
    B(g, 1.5, 0.16, 2.7, M.stoneDark, 0, 0.08, 0);
    B(g, 1.2, 0.72, 2.3, M.stone, 0, 0.52, 0);
    B(g, 1.32, 0.1, 2.42, M.stone, 0, 0.93, 0);
    // tapa con una cruz en relieve
    B(g, 0.1, 0.03, 1.2, M.stoneDark, 0, 0.995, 0.15);
    B(g, 0.6, 0.03, 0.1, M.stoneDark, 0, 0.995, -0.2);
    // placa (del lado del camino)
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), plaque());
    p.position.set(0, 0.55, 1.152);
    g.add(p);
    // cruz de hierro en la cabecera
    B(g, 0.09, 1.9, 0.09, M.iron, 0, 1.0, -1.05);
    B(g, 0.8, 0.09, 0.09, M.iron, 0, 1.55, -1.05);
    for (const [x, y] of [[0, 1.98], [0.42, 1.55], [-0.42, 1.55]]) g.add(mesh(new THREE.OctahedronGeometry(0.07, 0), M.iron, x, y, -1.05));
    // una corona de flores secas y velas derretidas
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), M.leaf, 0, 1.2, -0.98);
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), i % 2 ? M.redPaint : M.packYellow, Math.cos(a) * 0.22, 1.2 + Math.sin(a) * 0.22, -0.93));
    }
    for (const [x, z, h] of [[-0.45, 0.8, 0.14], [-0.35, 0.95, 0.09], [0.4, 0.85, 0.18], [0.5, 1.0, 0.07], [0.1, -0.7, 0.12]]) {
      C(g, 0.03, 0.035, h, M.candle, x, 0.98 + h / 2, z, 0, 0, 0, 7);
      g.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 6), M.flame, x, 1.0 + h + 0.02, z));
    }
    return { obj: g, boxes: [[-0.75, 0, -1.35, 0.75, 1.05, 1.35], [-0.1, 0, -1.12, 0.1, 2.0, -0.98]] };
  },

  // Árbol seco, torcido, sin una hoja.
  arbolSeco(M, o, r) {
    const g = new THREE.Group();
    const h = 3.6 + r() * 1.2;
    const lean = (r() - 0.5) * 0.14;
    C(g, 0.12, 0.26, h, M.bark, 0, h / 2, 0, lean, 0, (r() - 0.5) * 0.12, 7);
    const branch = (x, y, z, len, rad, ry, rz, depth) => {
      const b = new THREE.Group();
      b.position.set(x, y, z);
      b.rotation.set(0, ry, rz);
      C(b, rad * 0.55, rad, len, M.bark, 0, len / 2, 0, 0, 0, 0, 5);
      g.add(b);
      if (depth > 0) {
        b.updateMatrix();
        const tip = new THREE.Vector3(0, len * (0.6 + r() * 0.3), 0).applyMatrix4(b.matrix);
        for (let k = 0; k < 2; k++) branch(tip.x, tip.y, tip.z, len * 0.55, rad * 0.55, ry + (r() - 0.5) * 2, rz + (r() - 0.5) * 1.2, depth - 1);
      }
    };
    for (let i = 0; i < 4; i++) {
      const y = h * (0.55 + i * 0.12);
      branch(0, y, 0, 1.1 + r() * 0.8, 0.07, r() * Math.PI * 2, 0.6 + r() * 0.5, 1);
    }
    // raíces que asoman
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r();
      C(g, 0.03, 0.09, 0.8, M.bark, Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3, 0, -a, Math.PI / 2 - 0.2, 5);
    }
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 3, 0.3]] };
  },

  // Fosa recién cavada: el pozo tapado con tablones, la tierra al lado y la pala.
  fosa(M, o, r) {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.0), M.black);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.012;
    g.add(hole);
    for (const s of [-1, 1]) {
      B(g, 0.14, 0.12, 2.2, M.dirtDark, s * 0.54, 0.05, 0);
      B(g, 1.2, 0.12, 0.14, M.dirtDark, 0, 0.05, s * 1.07);
    }
    // tablones cruzados (uno roto)
    B(g, 1.3, 0.05, 0.24, M.woodDark, 0, 0.13, -0.5, 0, 0.08, 0);
    B(g, 0.7, 0.05, 0.24, M.woodDark, -0.3, 0.13, 0.35, 0, -0.1, 0.05);
    const pile = mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.dirtDark, 1.25, -0.05, 0.2);
    pile.scale.set(0.9, 0.7, 1.4);
    g.add(pile);
    // la pala clavada en la tierra
    const sh = new THREE.Group();
    sh.position.set(1.2, 0, -0.5);
    sh.rotation.set(0.25, 0.4, -0.2);
    C(sh, 0.022, 0.022, 1.1, M.woodDark, 0, 0.75, 0, 0, 0, 0, 6);
    B(sh, 0.24, 0.3, 0.02, M.iron, 0, 0.1, 0);
    B(sh, 0.16, 0.04, 0.04, M.woodDark, 0, 1.3, 0);
    g.add(sh);
    return { obj: g, boxes: [[-0.62, 0, -1.15, 0.62, 0.3, 1.15]] };
  },

  // Cruces viejas y rotas apiladas contra la tapia.
  cruces(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Group();
      c.position.set(-0.9 + i * 0.6 + (r() - 0.5) * 0.2, 0, -0.18 - r() * 0.1);
      c.rotation.set(-0.18 - r() * 0.12, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
      const h = 0.8 + r() * 0.5;
      B(c, 0.07, h, 0.05, M.woodDark, 0, h / 2, 0);
      B(c, 0.4, 0.07, 0.05, M.woodDark, 0, h * 0.72, 0);
      g.add(c);
    }
    // una tirada en el piso
    B(g, 0.07, 0.05, 0.95, M.woodDark, 0.4, 0.03, 0.35, 0, 0.9, 0);
    B(g, 0.35, 0.05, 0.07, M.woodDark, 0.25, 0.03, 0.5, 0, 0.9, 0);
    return { obj: g, boxes: [] };
  },
};

let registered = false;
export function registerMolinoProps() {
  if (registered) return;
  registered = true;
  addBuilders(BUILDERS);
}
