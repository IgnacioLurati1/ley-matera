import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise';

// Utilería del mapa. Cada constructor devuelve { obj, boxes } donde boxes son
// cajas de colisión locales [x0, y0, z0, x1, y1, z1] (antes de rotar).
// Lo que se anima se marca con userData.dynamic para no fusionarlo.

// Junta las piezas sueltas (hijos directos) de un grupo en una malla por
// material: mismo dibujo, muchas menos llamadas de dibujo. `keep` se deja
// aparte (lo que se mueve o cambia de color).
export function mergeByMaterial(group, keep = []) {
  const byMat = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || keep.includes(o)) continue;
    o.updateMatrix();
    let g = o.geometry.clone().applyMatrix4(o.matrix);
    if (g.index) g = g.toNonIndexed();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    group.remove(o);
  }
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    list.forEach((x) => x.dispose());
  }
  return group;
}

// Lo mismo para un grupo que se mueve entero (una hoja de puerta, el mate
// colgado sobre la tiza): funde, a cualquier profundidad, las mallas que
// comparten material en una sola, en el espacio del grupo. Se dejan como
// estaban las que pueden cambiar solas: con hijos, escondidas, con su propio
// onBeforeRender, con huesos o morphs, varios materiales o atributos
// distintos (cada juego de atributos, sombras, capas y orden de dibujo va
// aparte, así se ve igual).
const BEFORE = THREE.Object3D.prototype.onBeforeRender;
const AFTER = THREE.Object3D.prototype.onAfterRender;
export function compactGroup(obj) {
  if (!obj?.isObject3D) return obj;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const sets = new Map();
  obj.traverse((o) => {
    if (o === obj || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.children.length || !o.visible) return;
    if (o.onBeforeRender !== BEFORE || o.onAfterRender !== AFTER || o.userData.dynamic || Object.keys(o.geometry.morphAttributes || {}).length) return;
    for (let p = o.parent; p && p !== obj; p = p.parent) if (!p.visible) return;
    const attrs = Object.keys(o.geometry.attributes).sort().join(',');
    const key = `${o.material.uuid}|${attrs}|${o.layers.mask}|${o.renderOrder}|${o.castShadow}|${o.receiveShadow}|${o.frustumCulled}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(o);
  });
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const a = list[0];
    const m = new THREE.Mesh(merged, a.material);
    m.castShadow = a.castShadow;
    m.receiveShadow = a.receiveShadow;
    m.layers.mask = a.layers.mask;
    m.renderOrder = a.renderOrder;
    m.frustumCulled = a.frustumCulled;
    for (const o of list) o.removeFromParent();
    obj.add(m);
  }
  return obj;
}

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function boxGeo(w, h, d) {
  return cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
}
export function rboxGeo(w, h, d, r = 0.05) {
  return cached(`r${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
}
export function cylGeo(rt, rb, h, seg = 12, open = false) {
  return cached(`c${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

// El aljibe: altura de la roldana y dónde queda el balde (k: 0 abajo, en el
// agua; 1 arriba, al lado de la roldana). La soga va de la roldana al asa.
const WELL_PULLEY_Y = 2.96;
export function setWellBucket(rig, k) {
  const bucket = rig.getObjectByName('bucket');
  const rope = rig.getObjectByName('rope');
  const pulley = rig.getObjectByName('pulley');
  const y = 0.45 + k * 2.05;
  bucket.position.y = y;
  const from = y + 0.23;
  const len = Math.max(0.02, WELL_PULLEY_Y - from);
  rope.scale.y = len;
  rope.position.y = from + len / 2;
  // lo que sube el balde lo enrolla la roldana (radio 8 cm)
  pulley.rotation.z = -k * 2.05 / 0.08;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const B = (g, w, h, d, mat, x, y, z, rx, ry, rz) => {
  const m = mesh(boxGeo(w, h, d), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};
const R = (g, w, h, d, mat, x, y, z, r, ry = 0) => {
  const m = mesh(rboxGeo(w, h, d, r), mat, x, y, z, 0, ry, 0);
  g.add(m);
  return m;
};
const C = (g, rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const m = mesh(cylGeo(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  g.add(m);
  return m;
};

function chair(g, M, x, z, ry) {
  const c = new THREE.Group();
  B(c, 0.45, 0.05, 0.45, M.wood, 0, 0.46, 0);
  for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) B(c, 0.05, 0.46, 0.05, M.wood, a, 0.23, b);
  B(c, 0.45, 0.5, 0.04, M.wood, 0, 0.72, -0.2);
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  g.add(c);
}

// Mate + termo para decorar mesas.
function mateSet(g, M, x, y, z) {
  C(g, 0.045, 0.035, 0.09, M.gourd, x, y + 0.045, z, 0, 0, 0, 10);
  C(g, 0.047, 0.047, 0.012, M.silver, x, y + 0.09, z, 0, 0, 0, 10);
  C(g, 0.004, 0.004, 0.16, M.silver, x + 0.02, y + 0.13, z, 0, 0, 0.3, 5);
  C(g, 0.05, 0.05, 0.3, M.termo, x + 0.16, y + 0.15, z + 0.04, 0, 0, 0, 12);
  C(g, 0.035, 0.05, 0.05, M.metal, x + 0.16, y + 0.32, z + 0.04, 0, 0, 0, 12);
}

const BUILDERS = {
  table(M) {
    const g = new THREE.Group();
    B(g, 1.8, 0.07, 0.9, M.wood, 0, 0.78, 0);
    for (const [a, b] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) B(g, 0.08, 0.78, 0.08, M.wood, a, 0.39, b);
    chair(g, M, -0.5, 0.75, Math.PI);
    chair(g, M, 0.55, -0.8, 0.2);
    mateSet(g, M, -0.3, 0.815, 0.1);
    // botella y vasos
    C(g, 0.035, 0.035, 0.28, M.glass, 0.5, 0.955, -0.1);
    return { obj: g, boxes: [[-0.95, 0, -0.5, 0.95, 0.85, 0.5]] };
  },
  crates(M, o, r) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(r() * 3);
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const s = 0.7 + r() * 0.25;
      const x = (i % 2) * 0.85 - 0.4;
      const z = Math.floor(i / 2) * 0.1;
      const y = i >= 2 ? 0.8 : 0;
      B(g, s, s, s, M.crate, x, y + s / 2, z, 0, (r() - 0.5) * 0.4, 0);
      boxes.push([x - s / 2, 0, z - s / 2, x + s / 2, y + s, z + s / 2]);
    }
    return { obj: g, boxes };
  },
  barrel(M, o, r) {
    const g = new THREE.Group();
    const mat = r() < 0.5 ? M.drum : M.drumRed;
    C(g, 0.3, 0.3, 0.9, mat, 0, 0.45, 0, 0, 0, 0, 16);
    for (const y of [0.15, 0.45, 0.75]) C(g, 0.31, 0.31, 0.03, M.metal, 0, y, 0, 0, 0, 0, 16);
    return { obj: g, boxes: [[-0.32, 0, -0.32, 0.32, 0.9, 0.32]] };
  },
  hay(M) {
    const g = new THREE.Group();
    R(g, 1.2, 0.5, 0.55, M.hay, 0, 0.25, 0, 0.06);
    R(g, 1.2, 0.5, 0.55, M.hay, 0.1, 0.75, 0.02, 0.06, 0.1);
    R(g, 1.2, 0.5, 0.55, M.hay, 0, 0.25, 0.58, 0.06);
    return { obj: g, boxes: [[-0.62, 0, -0.3, 0.7, 1, 0.88]] };
  },
  sacks(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const x = (i % 3) * 0.62 - 0.62;
      const y = i >= 3 ? 0.36 : 0;
      R(g, 0.58, 0.36, 0.42, i % 2 ? M.sack : M.sackYerba, x + (i >= 3 ? 0.3 : 0), y + 0.18, (r() - 0.5) * 0.08, 0.12, (r() - 0.5) * 0.3);
    }
    return { obj: g, boxes: [[-0.95, 0, -0.25, 0.95, 0.72, 0.25]] };
  },
  // Secadero: bastidor de palos con ramas de yerba secándose.
  rack(M) {
    const g = new THREE.Group();
    const L = 4.5;
    for (const x of [-L / 2, 0, L / 2]) {
      for (const z of [-0.6, 0.6]) C(g, 0.06, 0.07, 2.2, M.log, x, 1.1, z, 0, 0, 0, 6);
    }
    for (const y of [1.2, 1.9]) {
      for (const z of [-0.6, 0.6]) C(g, 0.04, 0.04, L + 0.3, M.log, 0, y, z, 0, 0, Math.PI / 2, 6);
      B(g, L, 0.12, 1.3, M.yerbaBranch, 0, y + 0.1, 0);
    }
    B(g, L + 0.8, 0.05, 1.8, M.roofTin, 0, 2.3, 0, 0.08, 0, 0);
    return { obj: g, boxes: [[-L / 2 - 0.1, 0, -0.7, L / 2 + 0.1, 2.3, 0.7]] };
  },
  // Aljibe con arco de hierro, roldana y balde. Los parantes se apoyan en el
  // brocal y la roldana cuelga de la clave del arco. La roldana, la soga y el
  // balde van aparte ('wellRig', dinámico): el balde arranca abajo, en el agua,
  // y el easter egg del molino lo sube y lo baja (setWellBucket).
  well(M) {
    const g = new THREE.Group();
    const ring = mesh(cylGeo(0.85, 0.9, 0.9, 20, true), M.brickRound, 0, 0.45, 0);
    g.add(ring);
    const inner = mesh(cylGeo(0.7, 0.7, 0.9, 20, true), M.stoneDark, 0, 0.45, 0);
    g.add(inner);
    const cap = mesh(new THREE.RingGeometry(0.68, 0.92, 24), M.stone, 0, 0.9, 0, -Math.PI / 2);
    g.add(cap);
    const water = mesh(new THREE.CircleGeometry(0.7, 20), M.water, 0, 0.35, 0, -Math.PI / 2);
    g.add(water);
    // parantes: del brocal (0,9) al arranque del arco (2,3), con su planchuela
    for (const x of [-0.8, 0.8]) {
      C(g, 0.035, 0.035, 1.4, M.iron, x, 1.6, 0, 0, 0, 0, 6);
      B(g, 0.14, 0.03, 0.14, M.iron, x, 0.915, 0);
    }
    const arch = mesh(new THREE.TorusGeometry(0.8, 0.025, 6, 20, Math.PI), M.iron, 0, 2.3, 0);
    g.add(arch);
    // el remate, parado arriba de la clave (3,1)
    const scroll = mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 14), M.iron, 0, 3.26, 0);
    g.add(scroll);
    // la horquilla de la roldana, colgada de la clave
    for (const z of [-0.035, 0.035]) B(g, 0.03, 0.2, 0.012, M.iron, 0, WELL_PULLEY_Y + 0.07, z);
    const rig = new THREE.Group();
    rig.name = 'wellRig';
    rig.userData.dynamic = true;
    const pulley = new THREE.Group();
    pulley.name = 'pulley';
    pulley.position.y = WELL_PULLEY_Y;
    C(pulley, 0.08, 0.08, 0.04, M.iron, 0, 0, 0, Math.PI / 2, 0, 0, 12);
    // un rayo de la roldana: así se ve cómo gira
    B(pulley, 0.15, 0.018, 0.046, M.metal, 0, 0, 0);
    rig.add(pulley);
    const rope = C(rig, 0.006, 0.006, 1, M.rope, 0.08, 0, 0, 0, 0, 0, 4);
    rope.name = 'rope';
    const bucket = C(rig, 0.13, 0.1, 0.22, M.metal, 0.08, 0, 0, 0, 0, 0, 12);
    bucket.name = 'bucket';
    bucket.add(mesh(new THREE.TorusGeometry(0.12, 0.008, 4, 12, Math.PI), M.iron, 0, 0.11, 0));
    setWellBucket(rig, 0);
    g.add(rig);
    return { obj: g, boxes: [[-0.95, 0, -0.95, 0.95, 1, 0.95]] };
  },
  tree(M, o, r) {
    const g = new THREE.Group();
    const h = 3.5 + r() * 1.5;
    C(g, 0.13, 0.22, h, M.bark, 0, h / 2, 0, (r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1, 8);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      C(g, 0.05, 0.08, 1.6, M.bark, Math.cos(a) * 0.4, h * 0.7 + i * 0.3, Math.sin(a) * 0.4, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7, 6);
    }
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.4 + r() * 1.1;
      const s = 0.8 + r() * 0.7;
      const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.leaf, Math.cos(a) * d, h + (r() - 0.3) * 1.2, Math.sin(a) * d);
      m.scale.set(s, s * 0.7, s);
      g.add(m);
    }
    return { obj: g, boxes: [[-0.25, 0, -0.25, 0.25, 3, 0.25]] };
  },
  cart(M) {
    const g = new THREE.Group();
    B(g, 2.2, 0.1, 1.3, M.wood, 0, 0.75, 0);
    for (const z of [-0.62, 0.62]) B(g, 2.2, 0.45, 0.06, M.wood, 0, 1.02, z);
    B(g, 0.06, 0.45, 1.3, M.wood, -1.08, 1.02, 0);
    for (const z of [-0.78, 0.78]) {
      const w = mesh(cached('wheel', () => new THREE.TorusGeometry(0.62, 0.05, 6, 20)), M.woodDark, 0.1, 0.65, z);
      g.add(w);
      for (let s = 0; s < 6; s++) B(g, 0.04, 1.2, 0.04, M.woodDark, 0.1, 0.65, z, 0, 0, (s * Math.PI) / 6);
      C(g, 0.08, 0.08, 0.14, M.woodDark, 0.1, 0.65, z, Math.PI / 2);
    }
    B(g, 2.2, 0.08, 0.08, M.wood, 2.1, 0.55, 0, 0, 0, -0.35);
    for (let i = 0; i < 3; i++) R(g, 0.55, 0.35, 0.4, M.sackYerba, -0.5 + i * 0.5, 1.0, (i - 1) * 0.2, 0.1, i);
    return { obj: g, boxes: [[-1.1, 0, -0.9, 1.3, 1.3, 0.9]] };
  },
  lamppost(M) {
    const g = new THREE.Group();
    C(g, 0.05, 0.08, 3.2, M.iron, 0, 1.6, 0, 0, 0, 0, 8);
    B(g, 0.05, 0.05, 0.6, M.iron, 0, 3.15, -0.25);
    const lamp = new THREE.Group();
    lamp.userData.dynamic = true;
    lamp.position.set(0, 3.3, -0.55);
    lamp.add(mesh(cylGeo(0.12, 0.18, 0.3, 6), M.glassLamp, 0, -0.1, 0));
    lamp.add(mesh(cylGeo(0.02, 0.2, 0.12, 6), M.iron, 0, 0.1, 0));
    g.add(lamp);
    return { obj: g, boxes: [[-0.12, 0, -0.12, 0.12, 3, 0.12]] };
  },
  // Estantería de almacén llena de paquetes de yerba.
  shelf(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 5;
    for (const x of [-L / 2, -L / 6, L / 6, L / 2]) {
      for (const z of [-0.3, 0.3]) B(g, 0.06, 2.3, 0.06, M.woodDark, x, 1.15, z);
    }
    const packMats = [M.packRed, M.packYellow, M.packGreen, M.packBlue, M.packWhite];
    for (const y of [0.15, 0.75, 1.35, 1.95]) {
      B(g, L + 0.1, 0.04, 0.66, M.woodDark, 0, y, 0);
      if (y > 1.9) continue;
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.1; x += 0.2) {
        if (r() < 0.12) continue;
        for (const z of [-0.15, 0.15]) {
          const m = packMats[Math.floor(r() * packMats.length)];
          B(g, 0.14, 0.25, 0.1, m, x + (r() - 0.5) * 0.03, y + 0.145, z, 0, (r() - 0.5) * 0.3, r() < 0.05 ? 0.4 : 0);
        }
      }
    }
    return { obj: g, boxes: [[-L / 2 - 0.05, 0, -0.35, L / 2 + 0.05, 2.3, 0.35]] };
  },
  shelfWall(M, o, r) {
    const res = BUILDERS.shelf(M, o, r);
    return res;
  },
  counter(M) {
    const g = new THREE.Group();
    B(g, 3.2, 1, 0.7, M.woodDark, 0, 0.5, 0);
    B(g, 3.3, 0.06, 0.8, M.wood, 0, 1.03, 0);
    // caja registradora
    B(g, 0.45, 0.25, 0.4, M.brass, -0.9, 1.19, 0);
    B(g, 0.4, 0.2, 0.1, M.brass, -0.9, 1.4, -0.12, -0.4);
    // balanza
    C(g, 0.12, 0.15, 0.08, M.redPaint, 0.6, 1.1, 0);
    C(g, 0.02, 0.02, 0.35, M.metal, 0.6, 1.3, 0);
    C(g, 0.16, 0.16, 0.02, M.metal, 0.6, 1.48, 0);
    // frascos
    for (let i = 0; i < 4; i++) C(g, 0.08, 0.08, 0.22, M.glass, 1.0 + i * 0.18, 1.17, 0.1);
    return { obj: g, boxes: [[-1.65, 0, -0.4, 1.65, 1.1, 0.4]] };
  },
  // Barbacuá: horno de ladrillo con fuego y parrilla de secado encima.
  kiln(M) {
    const g = new THREE.Group();
    const W = 5;
    const D = 3.2;
    B(g, W, 1.3, D, M.brickSoot, 0, 0.65, 0);
    B(g, W + 0.2, 0.15, D + 0.2, M.stone, 0, 1.35, 0);
    // boca del horno (frente, +z)
    B(g, 1.3, 0.9, 0.05, M.black, 0, 0.55, D / 2 + 0.01);
    const glow = mesh(boxGeo(1.1, 0.7, 0.02), M.fireGlow, 0, 0.5, D / 2 + 0.03);
    glow.userData.dynamic = true;
    glow.name = 'kilnGlow';
    g.add(glow);
    // arco
    const arch = mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 12, Math.PI), M.brickSoot, 0, 1.0, D / 2 + 0.05);
    g.add(arch);
    // parrilla de secado con yerba
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) C(g, 0.06, 0.06, 1.3, M.log, x, 2.05, z, 0, 0, 0, 6);
    B(g, W - 0.2, 0.18, D - 0.2, M.yerbaBranch, 0, 2.7, 0);
    for (let i = 0; i < 9; i++) C(g, 0.04, 0.04, D, M.log, -W / 2 + 0.4 + i * 0.52, 2.6, 0, Math.PI / 2, 0, 0, 5);
    // chimenea
    B(g, 0.7, 2.4, 0.7, M.brickSoot, W / 2 - 0.5, 2.5, -D / 2 + 0.5);
    return { obj: g, boxes: [[-W / 2, 0, -D / 2, W / 2, 3, D / 2 + 0.1]] };
  },
  firewood(M, o, r) {
    const g = new THREE.Group();
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5 - row; i++) {
        C(g, 0.11, 0.11, 1.1, M.log, (i - (4 - row) / 2) * 0.23, 0.11 + row * 0.2, 0, Math.PI / 2, (r() - 0.5) * 0.15, 0, 7);
      }
    }
    return { obj: g, boxes: [[-0.62, 0, -0.55, 0.62, 0.65, 0.55]] };
  },
  altar(M) {
    const g = new THREE.Group();
    B(g, 2, 1, 0.8, M.stone, 0, 0.5, 0);
    B(g, 2.1, 0.03, 0.9, M.clothWhite, 0, 1.015, 0);
    B(g, 0.1, 1.1, 0.06, M.brass, 0, 1.6, -0.25);
    B(g, 0.6, 0.1, 0.06, M.brass, 0, 1.85, -0.25);
    const flames = new THREE.Group();
    flames.userData.dynamic = true;
    flames.name = 'candles';
    for (const x of [-0.8, -0.55, 0.55, 0.8]) {
      C(g, 0.03, 0.03, 0.3, M.candle, x, 1.18, 0.1, 0, 0, 0, 8);
      const f = mesh(cached('flame', () => new THREE.ConeGeometry(0.02, 0.06, 6)), M.flame, x, 1.37, 0.1);
      flames.add(f);
    }
    g.add(flames);
    return { obj: g, boxes: [[-1, 0, -0.4, 1, 1.1, 0.4]] };
  },
  pew(M) {
    const g = new THREE.Group();
    B(g, 2.6, 0.06, 0.45, M.woodDark, 0, 0.45, 0);
    B(g, 2.6, 0.55, 0.05, M.woodDark, 0, 0.78, -0.22);
    for (const x of [-1.25, 1.25]) B(g, 0.06, 0.95, 0.5, M.woodDark, x, 0.47, -0.02);
    return { obj: g, boxes: [[-1.3, 0, -0.27, 1.3, 1, 0.25]] };
  },
  generator(M) {
    const g = new THREE.Group();
    B(g, 3, 0.25, 1.6, M.metal, 0, 0.125, 0);
    R(g, 2, 1.3, 1.2, M.metalGreen, -0.3, 0.9, 0, 0.08);
    C(g, 0.5, 0.5, 1.4, M.metalGreen, -0.3, 1.6, 0, 0, 0, Math.PI / 2, 16);
    const wheel = new THREE.Group();
    wheel.userData.dynamic = true;
    wheel.name = 'flywheel';
    wheel.position.set(1.1, 0.95, 0);
    wheel.add(mesh(cached('fly', () => new THREE.TorusGeometry(0.55, 0.08, 8, 20)), M.iron, 0, 0, 0, 0, Math.PI / 2));
    for (let s = 0; s < 4; s++) wheel.add(mesh(boxGeo(0.05, 1.1, 0.05), M.iron, 0, 0, 0, (s * Math.PI) / 4));
    g.add(wheel);
    C(g, 0.08, 0.08, 1.2, M.copper, -0.3, 2.3, 0.4, 0, 0, 0, 8);
    B(g, 0.3, 0.4, 0.1, M.brass, -1.1, 1.2, 0.62);
    return { obj: g, boxes: [[-1.5, 0, -0.8, 1.7, 2.2, 0.8]] };
  },
  pipes(M) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) C(g, 0.08, 0.08, 20, i === 1 ? M.copper : M.metal, 0, 2.6 + i * 0.25, -0.1 - i * 0.1, 0, 0, Math.PI / 2, 8);
    for (let i = -3; i <= 3; i++) {
      C(g, 0.1, 0.1, 0.2, M.redPaint, i * 3, 2.85, -0.2, Math.PI / 2, 0, 0, 8);
    }
    return { obj: g, boxes: [] };
  },
  bigsacks(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const x = (i % 2) * 1.05 - 0.5;
      const z = (Math.floor(i / 2) % 2) * 1.05 - 0.5;
      const y = i >= 4 ? 0.9 : 0;
      R(g, 1, 0.9, 1, i % 3 ? M.sackYerba : M.sack, x, y + 0.45, z, 0.18, (r() - 0.5) * 0.2);
    }
    R(g, 1, 0.9, 1, M.sackYerba, 0, 2.25, 0, 0.18, 0.4);
    return { obj: g, boxes: [[-1.05, 0, -1.05, 1.05, 2.7, 1.05]] };
  },
  pallets(M) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const y = k * 0.16;
      for (let i = 0; i < 5; i++) B(g, 1.2, 0.025, 0.16, M.wood, 0, y + 0.14, -0.5 + i * 0.25);
      for (const x of [-0.5, 0, 0.5]) B(g, 0.1, 0.1, 1.2, M.woodDark, x, y + 0.07, 0);
    }
    return { obj: g, boxes: [[-0.62, 0, -0.62, 0.62, 0.7, 0.62]] };
  },
  // Camioncito viejo de reparto cargado de bolsas.
  truck(M) {
    const g = new THREE.Group();
    B(g, 5.2, 0.25, 1.9, M.iron, 0, 0.6, 0);
    R(g, 1.7, 1.2, 1.9, M.truckPaint, 1.8, 1.35, 0, 0.12);
    R(g, 1.2, 0.8, 1.7, M.truckPaint, 2.95, 1.0, 0, 0.15);
    B(g, 0.05, 0.55, 1.6, M.glassDark, 1.2 + 0.02, 1.75, 0);
    B(g, 1.1, 0.5, 0.04, M.glassDark, 1.85, 1.7, 0.96);
    B(g, 3.2, 0.1, 1.9, M.wood, -1, 0.78, 0);
    for (const z of [-0.93, 0.93]) B(g, 3.2, 0.5, 0.06, M.wood, -1, 1.05, z);
    for (const [x, z] of [[2.6, 0.95], [2.6, -0.95], [-1.6, 0.95], [-1.6, -0.95]]) {
      C(g, 0.42, 0.42, 0.28, M.tire, x, 0.42, z, Math.PI / 2, 0, 0, 14);
      C(g, 0.22, 0.22, 0.3, M.metal, x, 0.42, z, Math.PI / 2, 0, 0, 10);
    }
    for (const z of [-0.6, 0.6]) C(g, 0.12, 0.12, 0.06, M.glassLampOff, 3.56, 1.1, z, 0, 0, Math.PI / 2, 10);
    for (let i = 0; i < 6; i++) R(g, 0.9, 0.45, 0.7, M.sackYerba, -2.1 + (i % 3) * 0.9, 1.07 + Math.floor(i / 3) * 0.45, (i % 2 ? 0.4 : -0.4), 0.1, i * 0.2);
    return { obj: g, boxes: [[-2.7, 0, -1.05, 3.6, 2, 1.05]] };
  },
  desk(M) {
    const g = new THREE.Group();
    B(g, 1.8, 0.06, 0.9, M.woodDark, 0, 0.78, 0);
    for (const x of [-0.7, 0.7]) B(g, 0.4, 0.75, 0.85, M.woodDark, x, 0.375, 0);
    B(g, 0.35, 0.25, 0.3, M.black, -0.4, 0.93, -0.1);
    for (let i = 0; i < 5; i++) B(g, 0.25, 0.01, 0.34, M.paper, 0.3 + (i % 2) * 0.05, 0.815 + i * 0.012, 0.05, 0, i * 0.2);
    mateSet(g, M, 0.65, 0.81, -0.2);
    chair(g, M, 0, -0.75, 0);
    return { obj: g, boxes: [[-0.92, 0, -0.47, 0.92, 0.9, 0.47]] };
  },
  cabinet(M) {
    const g = new THREE.Group();
    B(g, 0.6, 1.4, 0.6, M.metalGreen, 0, 0.7, 0);
    for (let i = 0; i < 4; i++) B(g, 0.2, 0.03, 0.03, M.brass, 0, 0.3 + i * 0.33, 0.31);
    return { obj: g, boxes: [[-0.3, 0, -0.3, 0.3, 1.4, 0.3]] };
  },
  armchair(M) {
    const g = new THREE.Group();
    R(g, 0.9, 0.45, 0.85, M.leather, 0, 0.3, 0, 0.08);
    R(g, 0.9, 0.7, 0.2, M.leather, 0, 0.75, -0.35, 0.08);
    for (const x of [-0.4, 0.4]) R(g, 0.15, 0.3, 0.85, M.leather, x, 0.6, 0, 0.06);
    return { obj: g, boxes: [[-0.5, 0, -0.47, 0.5, 1.1, 0.45]] };
  },
  bookshelf(M, o, r) {
    const g = new THREE.Group();
    B(g, 1.8, 2.2, 0.35, M.woodDark, 0, 1.1, 0);
    const cols = [M.packRed, M.packGreen, M.packBlue, M.leather, M.paper];
    for (let s = 0; s < 4; s++) {
      for (let x = -0.8; x < 0.8; x += 0.07) {
        const h = 0.3 + r() * 0.12;
        B(g, 0.06, h, 0.25, cols[Math.floor(r() * cols.length)], x, 0.2 + s * 0.52 + h / 2, 0.06);
      }
    }
    return { obj: g, boxes: [[-0.9, 0, -0.2, 0.9, 2.2, 0.2]] };
  },

  // ---------------- la granja ----------------
  // Fogón: ronda de piedras, leña cruzada y brasas.
  fogon(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = mesh(cached('stone', () => new THREE.IcosahedronGeometry(0.16, 0)), M.stone, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, r(), r(), r());
      st.scale.set(1.2, 0.8, 1);
      g.add(st);
    }
    for (let i = 0; i < 4; i++) C(g, 0.06, 0.07, 0.9, M.log, 0, 0.12, 0, Math.PI / 2 - 0.25, (i / 4) * Math.PI, 0, 6);
    g.add(mesh(cylGeo(0.4, 0.45, 0.06, 12), M.fireGlow, 0, 0.04, 0));
    return { obj: g, boxes: [[-0.8, 0, -0.8, 0.8, 0.35, 0.8]] };
  },
  // Tronco para sentarse al lado del fogón.
  logseat(M) {
    const g = new THREE.Group();
    C(g, 0.22, 0.24, 1.4, M.log, 0, 0.22, 0, 0, 0, Math.PI / 2, 9);
    return { obj: g, boxes: [[-0.7, 0, -0.24, 0.7, 0.44, 0.24]] };
  },
  // Ombú: tronco gordo con raíces que asoman y una copa enorme.
  ombu(M, o, r) {
    const g = new THREE.Group();
    C(g, 0.45, 0.8, 3.2, M.bark, 0, 1.6, 0, 0, 0, 0, 10);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.4;
      C(g, 0.1, 0.28, 1.6, M.bark, Math.cos(a) * 0.8, 0.2, Math.sin(a) * 0.8, Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25, 6);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r();
      C(g, 0.12, 0.25, 3, M.bark, Math.cos(a) * 1, 3.8, Math.sin(a) * 1, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8, 7);
    }
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.5 + r() * 2.6;
      const sc = 1.3 + r() * 1.1;
      const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.leaf, Math.cos(a) * d, 5 + r() * 1.6, Math.sin(a) * d);
      m.scale.set(sc, sc * 0.65, sc);
      g.add(m);
    }
    return { obj: g, boxes: [[-0.85, 0, -0.85, 0.85, 3.5, 0.85]] };
  },
  // Tendedero con ropa que quedó colgada.
  washline(M, o, r) {
    const g = new THREE.Group();
    for (const x of [-2, 2]) {
      C(g, 0.05, 0.06, 2.2, M.log, x, 1.1, 0, 0, 0, 0, 6);
      B(g, 0.05, 0.05, 0.5, M.log, x, 2.12, 0);
    }
    C(g, 0.006, 0.006, 4, M.rope, 0, 2.05, 0, 0, 0, Math.PI / 2, 4);
    const cloths = [M.whiteCloth, M.redCloth, M.whiteCloth, M.redCloth];
    for (let i = 0; i < 4; i++) {
      const w = 0.5 + r() * 0.3;
      const h = 0.6 + r() * 0.4;
      g.add(mesh(new THREE.PlaneGeometry(w, h), cloths[i], -1.4 + i * 0.95, 2.05 - h / 2, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.1));
    }
    return { obj: g, boxes: [[-2.08, 0, -0.08, -1.92, 2.2, 0.08], [1.92, 0, -0.08, 2.08, 2.2, 0.08]] };
  },
  // Cocina a leña de hierro, con su caño y la pava arriba.
  stove(M) {
    const g = new THREE.Group();
    B(g, 1.3, 0.82, 0.7, M.iron, 0, 0.41, 0);
    B(g, 1.36, 0.05, 0.76, M.metal, 0, 0.845, 0);
    B(g, 0.3, 0.25, 0.02, M.fireGlow, -0.3, 0.35, 0.36);
    for (const x of [-0.05, 0.25, 0.5]) B(g, 0.12, 0.03, 0.02, M.brass, x, 0.62, 0.36);
    C(g, 0.08, 0.08, 2.8, M.iron, 0.45, 2.25, -0.2, 0, 0, 0, 8);
    C(g, 0.13, 0.15, 0.2, M.metal, -0.3, 0.97, 0.05, 0, 0, 0, 12);
    return { obj: g, boxes: [[-0.66, 0, -0.36, 0.66, 0.9, 0.36]] };
  },
  // Catre con colchón de chala y la frazada colorada.
  bed(M) {
    const g = new THREE.Group();
    B(g, 1.0, 0.08, 2.0, M.woodDark, 0, 0.35, 0);
    for (const [a, b] of [[-0.46, -0.95], [0.46, -0.95], [-0.46, 0.95], [0.46, 0.95]]) B(g, 0.07, 0.4, 0.07, M.woodDark, a, 0.2, b);
    for (const a of [-0.46, 0.46]) B(g, 0.07, 0.8, 0.07, M.woodDark, a, 0.4, -0.95);
    B(g, 1.0, 0.07, 0.06, M.woodDark, 0, 0.75, -0.95);
    R(g, 0.92, 0.14, 1.9, M.sack, 0, 0.46, 0.02, 0.05);
    R(g, 0.94, 0.06, 1.2, M.redCloth, 0, 0.55, 0.35, 0.03);
    R(g, 0.5, 0.1, 0.3, M.clothWhite, 0, 0.58, -0.7, 0.04);
    return { obj: g, boxes: [[-0.52, 0, -1, 0.52, 0.6, 1]] };
  },
  // Surcos de la huerta: tierra levantada con plantas.
  huerta(M, o, r) {
    const g = new THREE.Group();
    const boxes = [];
    for (let k = 0; k < 3; k++) {
      const z = (k - 1) * 0.95;
      B(g, 4, 0.22, 0.55, M.dirtDark, 0, 0.11, z);
      for (let x = -1.8; x <= 1.8; x += 0.45) {
        const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.greenLeaf, x + (r() - 0.5) * 0.1, 0.3, z + (r() - 0.5) * 0.1);
        const sc = 0.14 + r() * 0.1;
        m.scale.set(sc, sc * 0.8, sc);
        g.add(m);
      }
      boxes.push([-2, 0, z - 0.28, 2, 0.35, z + 0.28]);
    }
    return { obj: g, boxes };
  },
  // Zapallos entre las guías.
  zapallos(M, o, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = 0.18 + r() * 0.14;
      const m = mesh(cached('pumpkin', () => new THREE.SphereGeometry(1, 12, 8)), M.pumpkin, (r() - 0.5) * 2, s * 0.8, (r() - 0.5) * 1.1);
      m.scale.set(s * 1.2, s * 0.85, s * 1.2);
      g.add(m);
      C(g, 0.015, 0.02, 0.08, M.log, m.position.x, s * 1.6, m.position.z, 0, 0, 0, 5);
    }
    for (let i = 0; i < 10; i++) {
      const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.greenLeaf, (r() - 0.5) * 2.4, 0.08, (r() - 0.5) * 1.4);
      m.scale.set(0.3, 0.08, 0.3);
      g.add(m);
    }
    return { obj: g, boxes: [[-1.1, 0, -0.6, 1.1, 0.45, 0.6]] };
  },
  // Espantapájaros chico de la huerta (el grande es otra cosa).
  espantajo(M) {
    const g = new THREE.Group();
    C(g, 0.04, 0.05, 2.3, M.log, 0, 1.15, 0, 0, 0, 0, 6);
    C(g, 0.035, 0.035, 1.5, M.log, 0, 1.65, 0, 0, 0, Math.PI / 2, 6);
    R(g, 0.46, 0.55, 0.24, M.redCloth, 0, 1.45, 0, 0.06);
    const head = mesh(cached('sackHead', () => new THREE.SphereGeometry(0.17, 10, 8)), M.sack, 0, 2.02, 0);
    head.scale.set(1, 1.15, 0.95);
    g.add(head);
    C(g, 0.34, 0.34, 0.03, M.straw, 0, 2.2, 0, 0.1, 0, 0.08, 14);
    C(g, 0.14, 0.17, 0.16, M.straw, 0, 2.28, 0, 0.1, 0, 0.08, 12);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) C(g, 0.006, 0.01, 0.2, M.straw, s * 0.78, 1.64 - i * 0.02, (i - 1.5) * 0.03, 0, 0, s * (1.3 + i * 0.15), 4);
    }
    return { obj: g, boxes: [[-0.08, 0, -0.08, 0.08, 2.2, 0.08]] };
  },
  // Surco de yerba mate: plantas bajas y tupidas en fila.
  yerbal(M, o, r) {
    const g = new THREE.Group();
    const L = o.len || 5;
    for (let x = -L / 2 + 0.4; x <= L / 2 - 0.3; x += 0.62) {
      C(g, 0.04, 0.06, 0.4, M.bark, x, 0.2, 0, 0, 0, 0, 5);
      for (let k = 0; k < 3; k++) {
        const m = mesh(cached('leaf', () => new THREE.IcosahedronGeometry(1, 1)), M.yerbaBush, x + (r() - 0.5) * 0.3, 0.6 + r() * 0.35, (r() - 0.5) * 0.3);
        const sc = 0.32 + r() * 0.16;
        m.scale.set(sc, sc * 0.9, sc);
        g.add(m);
      }
    }
    return { obj: g, boxes: [[-L / 2, 0, -0.42, L / 2, 1.1, 0.42]] };
  },
  // Silo de chapa con techo cónico, anillos y escalera.
  silo(M) {
    const g = new THREE.Group();
    const R0 = 2.1;
    const H = 10;
    C(g, R0, R0, H, M.silo, 0, H / 2, 0, 0, 0, 0, 28);
    for (let y = 1; y < H; y += 1.25) C(g, R0 + 0.02, R0 + 0.02, 0.06, M.metal, 0, y, 0, 0, 0, 0, 28);
    g.add(mesh(new THREE.ConeGeometry(R0 + 0.15, 1.6, 28), M.silo, 0, H + 0.8, 0));
    C(g, 0.25, 0.25, 0.4, M.metal, 0, H + 1.7, 0, 0, 0, 0, 10);
    // escalera de gato por el costado
    for (const x of [-0.22, 0.22]) C(g, 0.02, 0.02, H, M.rust, x, H / 2, R0 + 0.12, 0, 0, 0, 5);
    for (let y = 0.4; y < H; y += 0.35) B(g, 0.44, 0.02, 0.02, M.rust, 0, y, R0 + 0.12);
    // boca de descarga abajo
    B(g, 0.6, 0.6, 0.3, M.rust, 0, 0.5, -R0 - 0.1);
    return { obj: g, boxes: [[-R0, 0, -R0 - 0.25, R0, H, R0 + 0.2]] };
  },
  // Silo reventado: medio cuerpo, chapas dobladas y el techo en el piso.
  siloRoto(M, o, r) {
    const g = new THREE.Group();
    const R0 = 2.0;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      if (i === 3 || i === 4) continue;
      const a = (i / segs) * Math.PI * 2;
      const h = 2 + r() * 3.5;
      const w = (2 * Math.PI * R0) / segs;
      const m = mesh(boxGeo(w, 1, 0.05), M.silo, Math.cos(a) * R0, h / 2, Math.sin(a) * R0, (r() - 0.5) * 0.15, -a + Math.PI / 2, 0);
      m.scale.y = h;
      g.add(m);
    }
    g.add(mesh(new THREE.ConeGeometry(R0 + 0.1, 1.5, 24), M.rust, 2.6, 0.6, -1.4, 0.9, 0.3, 0.4));
    for (let i = 0; i < 5; i++) R(g, 0.8, 0.5, 0.6, M.sackYerba, (r() - 0.5) * 2, 0.25, (r() - 0.5) * 2, 0.1, r());
    return { obj: g, boxes: [[-R0 - 0.1, 0, -R0 - 0.1, R0 + 0.1, 3, R0 + 0.1], [1.6, 0, -2.6, 3.8, 1.3, -0.3]] };
  },
  // Box del establo: medias paredes, comedero atrás y la puerta abierta.
  stall(M) {
    const g = new THREE.Group();
    const wood = M.barn || M.woodDark;
    B(g, 2.2, 1.3, 0.08, wood, 0, 0.65, -0.95);
    for (const x of [-1.1, 1.1]) B(g, 0.08, 1.3, 1.9, wood, x, 0.65, 0);
    B(g, 1.2, 0.35, 0.45, M.woodDark, 0, 1.12, -0.68);
    R(g, 1.0, 0.18, 0.35, M.hay, 0, 1.3, -0.68, 0.05);
    B(g, 0.08, 1.2, 1.0, M.woodDark, -0.8, 0.6, 1.3, 0, -0.9, 0);
    return { obj: g, boxes: [[-1.15, 0, -1, 1.15, 1.3, -0.4], [-1.15, 0, -1, -1.05, 1.3, 0.95], [1.05, 0, -1, 1.15, 1.3, 0.95]] };
  },
  // Bebedero de chapa con agua.
  trough(M) {
    const g = new THREE.Group();
    B(g, 2.4, 0.55, 0.6, M.metal, 0, 0.3, 0);
    B(g, 2.3, 0.02, 0.5, M.water, 0, 0.5, 0);
    for (const x of [-1, 1]) B(g, 0.1, 0.1, 0.7, M.iron, x, 0.04, 0);
    return { obj: g, boxes: [[-1.2, 0, -0.3, 1.2, 0.6, 0.3]] };
  },
  // Rollo de pasto (fardo redondo), acostado.
  rollo(M) {
    const g = new THREE.Group();
    C(g, 0.75, 0.75, 1.2, M.hay, 0, 0.75, 0, 0, 0, Math.PI / 2, 18);
    for (const x of [-0.3, 0.3]) g.add(mesh(new THREE.TorusGeometry(0.755, 0.01, 4, 24), M.rope, x, 0.75, 0, 0, Math.PI / 2, 0));
    return { obj: g, boxes: [[-0.6, 0, -0.75, 0.6, 1.5, 0.75]] };
  },
  // Tractor viejo colorado.
  tractor(M) {
    const g = new THREE.Group();
    R(g, 2.0, 0.7, 0.8, M.tractor, 0.3, 1.05, 0, 0.1);
    R(g, 0.9, 0.7, 0.7, M.tractor, 1.35, 0.95, 0, 0.1);
    B(g, 0.05, 0.4, 0.5, M.black, 1.82, 1.0, 0);
    C(g, 0.06, 0.07, 1.0, M.iron, 0.9, 1.9, 0.25, 0, 0, 0, 8);
    B(g, 0.5, 0.08, 0.5, M.leather, -0.55, 1.5, 0);
    B(g, 0.5, 0.35, 0.06, M.leather, -0.82, 1.7, 0, 0, 0, 0.2);
    C(g, 0.18, 0.18, 0.03, M.black, -0.1, 1.9, 0, 0, 0, 1.0, 14);
    C(g, 0.025, 0.025, 0.5, M.iron, 0.02, 1.65, 0, 0, 0, 1.0, 5);
    for (const z of [-0.7, 0.7]) {
      C(g, 0.75, 0.75, 0.38, M.tire, -0.6, 0.75, z, Math.PI / 2, 0, 0, 18);
      C(g, 0.42, 0.42, 0.4, M.tractor, -0.6, 0.75, z, Math.PI / 2, 0, 0, 12);
      C(g, 0.4, 0.4, 0.25, M.tire, 1.4, 0.4, z * 0.8, Math.PI / 2, 0, 0, 14);
      C(g, 0.22, 0.22, 0.27, M.tractor, 1.4, 0.4, z * 0.8, Math.PI / 2, 0, 0, 10);
    }
    return { obj: g, boxes: [[-1.4, 0, -0.95, 1.9, 1.7, 0.95]] };
  },
  // Molino de viento: torre de hierro, rueda de aspas (gira siempre) y la cola.
  windmill(M) {
    const g = new THREE.Group();
    const H = 8;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(cylGeo(0.05, 0.06, H + 0.2, 5), M.iron, a * 0.6, H / 2, b * 0.6, b * 0.12, 0, -a * 0.12));
    }
    for (let y = 1.5; y < H; y += 1.6) {
      const w = 1.2 * (1 - y / H) + 0.3;
      for (const [x, z, ry] of [[0, -w / 2, 0], [0, w / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]]) B(g, w, 0.04, 0.04, M.iron, x, y, z, 0, ry, 0);
    }
    B(g, 0.6, 0.08, 0.6, M.woodDark, 0, H, 0);
    const fan = new THREE.Group();
    fan.userData.dynamic = true;
    fan.name = 'fan';
    fan.position.set(0, H + 0.4, 0.5);
    fan.add(mesh(cylGeo(0.12, 0.12, 0.2, 10), M.iron, 0, 0, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      fan.add(mesh(boxGeo(0.16, 1.2, 0.02), M.metal, Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0, 0, 0.35, a - Math.PI / 2));
    }
    fan.add(mesh(new THREE.TorusGeometry(1.2, 0.02, 4, 32), M.iron, 0, 0, 0));
    // gira entera: sus 18 piezas en 2 mallas (cada una se dibuja cada cuadro)
    mergeByMaterial(fan);
    g.add(fan);
    B(g, 0.05, 0.05, 1.8, M.iron, 0, H + 0.4, -0.6);
    B(g, 0.04, 0.9, 0.9, M.metal, 0, H + 0.4, -1.5);
    C(g, 0.04, 0.04, H, M.iron, 0.1, H / 2, 0.1, 0, 0, 0, 5);
    return { obj: g, boxes: [[-0.75, 0, -0.75, 0.75, 2.5, 0.75]] };
  },
  // Tanque australiano de chapa con agua.
  tank(M) {
    const g = new THREE.Group();
    g.add(mesh(cylGeo(1.8, 1.8, 1.1, 28, true), M.rust, 0, 0.55, 0));
    g.add(mesh(new THREE.CircleGeometry(1.78, 28), M.water, 0, 0.9, 0, -Math.PI / 2));
    g.add(mesh(new THREE.TorusGeometry(1.8, 0.04, 4, 28), M.metal, 0, 1.1, 0, Math.PI / 2, 0, 0));
    return { obj: g, boxes: [[-1.8, 0, -1.8, 1.8, 1.1, 1.8]] };
  },

  // ---------------- detalles de la granja ----------------
  // Los de pared tienen la espalda en z = 0 (la pared) y miran hacia +z.
  // Galería: techo de chapa sobre postes, adelante de la pared del rancho.
  galeria(M, o) {
    const g = new THREE.Group();
    const L = o.len || 8;
    const D = 2.2;
    for (let x = -L / 2 + 0.15; x <= L / 2; x += L / 3) C(g, 0.07, 0.08, 2.75, M.log, x, 1.37, D - 0.15, 0, 0, 0, 7);
    B(g, L + 0.2, 0.12, 0.12, M.log, 0, 2.72, D - 0.15);
    B(g, L + 0.2, 0.1, 0.1, M.log, 0, 3.15, 0.1);
    for (let x = -L / 2 + 0.3; x <= L / 2; x += 1.1) B(g, 0.07, 0.07, D + 0.3, M.woodDark, x, 2.95, D / 2, 0.19, 0, 0);
    const roof = mesh(boxGeo(L + 0.6, 0.03, D + 0.6), M.roofTin, 0, 3.02, D / 2, 0.19, 0, 0);
    g.add(roof);
    const boxes = [];
    for (let x = -L / 2 + 0.15; x <= L / 2; x += L / 3) boxes.push([x - 0.1, 0, D - 0.25, x + 0.1, 2.7, D - 0.05]);
    return { obj: g, boxes };
  },
  // Tablero con herramientas colgadas: pala, rastrillo, azada, serrucho y soga.
  toolrack(M) {
    const g = new THREE.Group();
    B(g, 1.9, 0.9, 0.04, M.woodDark, 0, 1.55, 0.03);
    // pala
    C(g, 0.018, 0.018, 1.2, M.log, -0.7, 1.4, 0.1, 0, 0, 0.05, 6);
    B(g, 0.22, 0.28, 0.02, M.metal, -0.72, 0.72, 0.1, 0, 0, 0.05);
    // rastrillo
    C(g, 0.016, 0.016, 1.3, M.log, -0.35, 1.45, 0.1, 0, 0, -0.04, 6);
    B(g, 0.36, 0.03, 0.03, M.iron, -0.33, 2.1, 0.1);
    for (let i = 0; i < 7; i++) B(g, 0.01, 0.08, 0.01, M.iron, -0.48 + i * 0.05, 2.15, 0.1);
    // azada
    C(g, 0.017, 0.017, 1.15, M.log, 0.05, 1.45, 0.1, 0, 0, 0.03, 6);
    B(g, 0.2, 0.14, 0.02, M.iron, 0.07, 2.02, 0.14, 0.9, 0, 0);
    // serrucho
    B(g, 0.5, 0.14, 0.01, M.metal, 0.48, 1.6, 0.08, 0, 0, 0.15);
    B(g, 0.12, 0.1, 0.03, M.woodDark, 0.77, 1.63, 0.08);
    // soga enrollada
    g.add(mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), M.rope, 0.75, 1.25, 0.08));
    return { obj: g, boxes: [] };
  },
  // Cuadro viejo en la pared (un paisaje oscurecido por el humo).
  picture(M) {
    const g = new THREE.Group();
    B(g, 0.62, 0.48, 0.03, M.woodDark, 0, 1.75, 0.02);
    B(g, 0.52, 0.38, 0.01, M.leather, 0, 1.75, 0.04);
    B(g, 0.46, 0.06, 0.012, M.dirtDark, 0, 1.64, 0.045);
    return { obj: g, boxes: [] };
  },
  // Cruz de madera con un rosario.
  cross(M) {
    const g = new THREE.Group();
    B(g, 0.06, 0.5, 0.03, M.woodDark, 0, 1.9, 0.02);
    B(g, 0.3, 0.06, 0.03, M.woodDark, 0, 2.0, 0.02);
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 16), M.brass, 0, 1.7, 0.04));
    return { obj: g, boxes: [] };
  },
  // Ollas colgando de una barra arriba de la cocina.
  potrack(M) {
    const g = new THREE.Group();
    B(g, 1.3, 0.04, 0.04, M.iron, 0, 2.35, 0.35);
    for (let i = 0; i < 4; i++) {
      const x = -0.5 + i * 0.33;
      C(g, 0.004, 0.004, 0.2, M.iron, x, 2.24, 0.35, 0, 0, 0, 4);
      C(g, 0.1 + (i % 2) * 0.03, 0.08, 0.14, i % 2 ? M.copper : M.iron, x, 2.07, 0.35, 0, 0, 0, 12);
    }
    return { obj: g, boxes: [] };
  },
  // Ropero de dos puertas con espejo.
  wardrobe(M) {
    const g = new THREE.Group();
    B(g, 1.3, 2.05, 0.58, M.woodDark, 0, 1.03, 0.3);
    B(g, 1.36, 0.08, 0.62, M.woodDark, 0, 2.1, 0.3);
    B(g, 0.01, 1.8, 0.01, M.black, 0, 1.05, 0.595);
    B(g, 0.36, 0.9, 0.01, M.glassDark, -0.32, 1.25, 0.6);
    for (const x of [-0.06, 0.06]) C(g, 0.015, 0.015, 0.04, M.brass, x, 1.1, 0.61, Math.PI / 2, 0, 0, 6);
    return { obj: g, boxes: [[-0.66, 0, 0, 0.66, 2.1, 0.6]] };
  },
  // Baúl de cuero con tachas.
  chest(M) {
    const g = new THREE.Group();
    B(g, 0.9, 0.45, 0.5, M.leather, 0, 0.23, 0);
    const lid = mesh(cylGeo(0.25, 0.25, 0.9, 12, false), M.leather, 0, 0.45, 0, 0, 0, Math.PI / 2);
    lid.scale.set(1, 1, 0.6);
    g.add(lid);
    for (const x of [-0.3, 0.3]) B(g, 0.05, 0.62, 0.52, M.brass, x, 0.35, 0);
    return { obj: g, boxes: [[-0.46, 0, -0.26, 0.46, 0.62, 0.26]] };
  },
  // Alfombra tejida (colorada con guarda).
  rug(M) {
    const g = new THREE.Group();
    B(g, 2.2, 0.012, 1.4, M.redCloth, 0, 0.006, 0);
    B(g, 1.9, 0.014, 0.08, M.clothWhite, 0, 0.007, 0.5);
    B(g, 1.9, 0.014, 0.08, M.clothWhite, 0, 0.007, -0.5);
    return { obj: g, boxes: [] };
  },
  // Mecedora vacía (se mece sola cuando nadie mira).
  rocker(M) {
    const g = new THREE.Group();
    for (const s of [-0.25, 0.25]) {
      const arc = mesh(new THREE.TorusGeometry(0.8, 0.02, 5, 16, 0.9), M.woodDark, s, 0.82, 0.05);
      arc.rotation.set(0, Math.PI / 2, Math.PI + 1.12);
      g.add(arc);
      B(g, 0.04, 0.42, 0.04, M.woodDark, s, 0.28, 0.18);
      B(g, 0.04, 0.95, 0.04, M.woodDark, s, 0.55, -0.2, -0.15, 0, 0);
    }
    B(g, 0.55, 0.05, 0.42, M.woodDark, 0, 0.47, 0);
    for (let i = 0; i < 5; i++) B(g, 0.03, 0.5, 0.02, M.woodDark, -0.18 + i * 0.09, 0.78, -0.25, -0.15, 0, 0);
    return { obj: g, boxes: [[-0.32, 0, -0.35, 0.32, 1, 0.32]] };
  },
  // Silla de paja.
  chair(M) {
    const g = new THREE.Group();
    chair(g, M, 0, 0, 0);
    return { obj: g, boxes: [[-0.25, 0, -0.25, 0.25, 0.9, 0.25]] };
  },
  // Mesita con velas (la luz de la atahona).
  candles(M) {
    const g = new THREE.Group();
    B(g, 0.5, 0.05, 0.4, M.woodDark, 0, 0.8, 0);
    for (const [a, b] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) B(g, 0.04, 0.8, 0.04, M.woodDark, a, 0.4, b);
    for (const [x, h] of [[-0.1, 0.22], [0.05, 0.16], [0.15, 0.26]]) {
      C(g, 0.025, 0.025, h, M.candle, x, 0.83 + h / 2, 0, 0, 0, 0, 8);
      g.add(mesh(cached('flame', () => new THREE.ConeGeometry(0.02, 0.06, 6)), M.flame, x, 0.86 + h + 0.03, 0));
    }
    return { obj: g, boxes: [[-0.27, 0, -0.22, 0.27, 0.85, 0.22]] };
  },
  // Ramas de yerba colgadas a secar de un palo cerca del techo.
  yerbahang(M, o, r) {
    const g = new THREE.Group();
    C(g, 0.03, 0.03, 3, M.log, 0, 3.1, 0, 0, 0, Math.PI / 2, 6);
    for (let i = 0; i < 7; i++) {
      const x = -1.3 + i * 0.43;
      C(g, 0.004, 0.004, 0.3, M.rope, x, 2.95, 0, 0, 0, 0, 4);
      const b = mesh(cylGeo(0.02, 0.14, 0.55, 6), M.yerbaBranch, x, 2.55, 0, (r() - 0.5) * 0.2, r() * 3, 0);
      g.add(b);
    }
    return { obj: g, boxes: [] };
  },
  // Cubiertas viejas apiladas.
  tires(M) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(mesh(cached('tire', () => new THREE.TorusGeometry(0.36, 0.13, 8, 18)), M.tire, (i % 2) * 0.05, 0.13 + i * 0.25, 0, Math.PI / 2, 0, i * 0.3));
    return { obj: g, boxes: [[-0.5, 0, -0.5, 0.5, 0.75, 0.5]] };
  },
  // Carretilla con tierra.
  barrow(M) {
    const g = new THREE.Group();
    B(g, 0.7, 0.3, 0.55, M.metal, 0, 0.5, 0, 0, 0, 0.08);
    B(g, 0.62, 0.05, 0.48, M.dirtDark, 0, 0.64, 0);
    g.add(mesh(cached('bwheel', () => new THREE.TorusGeometry(0.18, 0.05, 6, 14)), M.tire, 0.5, 0.22, 0, 0, Math.PI / 2, 0));
    for (const z of [-0.2, 0.2]) {
      C(g, 0.02, 0.02, 1.2, M.log, -0.3, 0.45, z, 0, 0, Math.PI / 2 - 0.25, 6);
      C(g, 0.02, 0.02, 0.4, M.iron, -0.05, 0.2, z, 0, 0, 0.2, 5);
    }
    return { obj: g, boxes: [[-0.9, 0, -0.3, 0.7, 0.7, 0.3]] };
  },
  // Gallinero: casilla de tablas con techo inclinado, tejido y rampa.
  coop(M, o, r) {
    const g = new THREE.Group();
    B(g, 2.4, 0.08, 1.6, M.woodDark, 0, 0.5, 0);
    for (const [x, z] of [[-1.15, -0.75], [1.15, -0.75], [-1.15, 0.75], [1.15, 0.75]]) B(g, 0.08, 1.9, 0.08, M.log, x, 0.95, z);
    B(g, 2.4, 1.2, 0.05, M.barn || M.wood, 0, 1.15, -0.78);
    for (const x of [-1.18, 1.18]) B(g, 0.05, 1.2, 1.6, M.barn || M.wood, x, 1.15, 0);
    // tejido de alambre adelante
    for (let x = -1.1; x <= 1.1; x += 0.2) B(g, 0.008, 1.2, 0.008, M.iron, x, 1.15, 0.8);
    for (let y = 0.6; y <= 1.75; y += 0.2) B(g, 2.3, 0.008, 0.008, M.iron, 0, y, 0.8);
    B(g, 2.6, 0.04, 1.9, M.roofTin, 0, 1.95, 0, -0.18, 0, 0);
    B(g, 0.4, 0.03, 1.1, M.wood, 0.7, 0.25, 1.2, 0.45, 0, 0);
    // plumas y maíz tirado
    for (let i = 0; i < 8; i++) B(g, 0.03, 0.01, 0.06, i % 2 ? M.clothWhite : M.packYellow, (r() - 0.5) * 2, 0.02, 1.1 + r() * 0.6, 0, r() * 3, 0);
    return { obj: g, boxes: [[-1.25, 0, -0.85, 1.25, 1.9, 0.85]] };
  },
  // Fuentón de lata con agua.
  washtub(M) {
    const g = new THREE.Group();
    g.add(mesh(cylGeo(0.5, 0.42, 0.35, 18, true), M.metal, 0, 0.18, 0));
    g.add(mesh(new THREE.CircleGeometry(0.47, 18), M.water, 0, 0.28, 0, -Math.PI / 2));
    for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.TorusGeometry(0.06, 0.01, 4, 10, Math.PI), M.iron, x, 0.33, 0, 0, Math.PI / 2, 0));
    return { obj: g, boxes: [[-0.5, 0, -0.5, 0.5, 0.36, 0.5]] };
  },
  // Acoplado para granos, oxidado, con una rueda pinchada.
  trailer(M) {
    const g = new THREE.Group();
    B(g, 4, 1.1, 2, M.rust, 0, 1.25, 0);
    B(g, 4.1, 0.08, 2.1, M.metal, 0, 1.82, 0);
    B(g, 4.2, 0.15, 0.2, M.iron, 0, 0.62, -0.7);
    B(g, 4.2, 0.15, 0.2, M.iron, 0, 0.62, 0.7);
    B(g, 1.4, 0.1, 0.1, M.iron, 2.7, 0.55, 0, 0, 0, 0.12);
    for (const [x, z, s] of [[-1.3, 1.05, 1], [-1.3, -1.05, 1], [1.3, 1.05, 1], [1.3, -1.05, 0.8]]) {
      C(g, 0.45 * s, 0.45 * s, 0.25, M.tire, x, 0.45 * s, z, Math.PI / 2, 0, 0, 14);
      C(g, 0.22, 0.22, 0.27, M.rust, x, 0.45 * s, z, Math.PI / 2, 0, 0, 10);
    }
    // grano que se derramó
    g.add(mesh(new THREE.ConeGeometry(0.7, 0.3, 12), M.packYellow, -2.3, 0.15, 0.4));
    return { obj: g, boxes: [[-2.1, 0, -1.2, 3.4, 1.9, 1.2]] };
  },
  // Montura en su caballete, con el pelero abajo.
  saddle(M) {
    const g = new THREE.Group();
    for (const x of [-0.35, 0.35]) {
      B(g, 0.05, 0.85, 0.05, M.woodDark, x, 0.42, -0.2, 0.3, 0, 0);
      B(g, 0.05, 0.85, 0.05, M.woodDark, x, 0.42, 0.2, -0.3, 0, 0);
    }
    C(g, 0.06, 0.06, 0.9, M.log, 0, 0.85, 0, 0, 0, Math.PI / 2, 8);
    B(g, 0.7, 0.04, 0.8, M.redCloth, 0, 0.9, 0, 0, 0, 0);
    const seat = mesh(cylGeo(0.3, 0.3, 0.55, 12, false), M.leather, 0, 0.97, 0, 0, 0, Math.PI / 2);
    seat.scale.set(1, 1, 0.5);
    g.add(seat);
    B(g, 0.08, 0.14, 0.1, M.leather, 0.3, 1.12, 0);
    for (const z of [-0.3, 0.3]) C(g, 0.01, 0.01, 0.5, M.leather, 0, 0.7, z, 0, 0, 0, 4);
    return { obj: g, boxes: [[-0.45, 0, -0.45, 0.45, 1.15, 0.45]] };
  },
  // Tarros de leche de aluminio.
  milkcans(M) {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.25, 0], [0.25, 0.05], [0, -0.35]]) {
      C(g, 0.18, 0.2, 0.55, M.metal, x, 0.28, z, 0, 0, 0, 14);
      C(g, 0.1, 0.18, 0.12, M.metal, x, 0.61, z, 0, 0, 0, 14);
      C(g, 0.11, 0.11, 0.05, M.iron, x, 0.69, z, 0, 0, 0, 12);
    }
    return { obj: g, boxes: [[-0.48, 0, -0.58, 0.48, 0.72, 0.28]] };
  },
  // Arado de mancera, oxidado.
  plow(M) {
    const g = new THREE.Group();
    C(g, 0.035, 0.035, 2.2, M.log, 0, 0.55, 0, 0, 0, Math.PI / 2 - 0.35, 6);
    for (const z of [-0.2, 0.2]) C(g, 0.025, 0.025, 0.9, M.log, -0.95, 0.75, z, 0, 0, 0.5, 6);
    B(g, 0.5, 0.35, 0.05, M.rust, 0.7, 0.18, 0, 0, 0.4, 0.3);
    B(g, 0.35, 0.05, 0.3, M.iron, 0.85, 0.05, 0);
    return { obj: g, boxes: [[-1.2, 0, -0.3, 1.1, 0.9, 0.3]] };
  },
  // Garrafa de gas.
  gastank(M) {
    const g = new THREE.Group();
    C(g, 0.16, 0.16, 0.55, M.drumRed, 0, 0.3, 0, 0, 0, 0, 14);
    C(g, 0.1, 0.16, 0.08, M.drumRed, 0, 0.61, 0, 0, 0, 0, 14);
    C(g, 0.03, 0.03, 0.08, M.brass, 0, 0.69, 0, 0, 0, 0, 8);
    return { obj: g, boxes: [[-0.17, 0, -0.17, 0.17, 0.7, 0.17]] };
  },
};

// Construye un prop y devuelve el objeto posicionado más sus cajas en mundo.
export function buildProp(def, M, seed) {
  const make = BUILDERS[def.type];
  if (!make) return null;
  const r = rng(seed);
  const { obj, boxes, firm } = make(M, def, r);
  const [x, z] = def.pos;
  const rot = def.rot || 0;
  // en los mapas con alturas el prop se apoya en el piso de su celda
  const y = def.y || 0;
  obj.position.set(x, y, z);
  obj.rotation.y = rot;
  obj.updateMatrixWorld(true);
  const world = boxes.map((b) => {
    const w = rotateBox(b, x, z, rot);
    w[1] += y;
    w[4] += y;
    return w;
  });
  return { obj, boxes: world, firm };
}

// Constructores de utilería de otro mapa (el penal suma los suyos).
export function addBuilders(more) {
  Object.assign(BUILDERS, more);
}

// Caja local -> caja alineada a ejes en mundo (conservadora si hay rotación).
export function rotateBox([x0, y0, z0, x1, y1, z1], px, pz, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const wx = px + x * c + z * s;
    const wz = pz - x * s + z * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return [minX, y0, minZ, maxX, y1, maxZ];
}
