import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/noise';
import { toTexture } from '../core/textures';
import { TOWER } from '../config/map';
import { buildProp } from './props';
import { registerPenalProps } from './penalProps';
import { windy } from '../fx/grassPush';

// El llano alrededor de la torre (Revelaciones Materas). Adentro del remolino
// se ve la explanada del pie de la torre: piedras que se cayeron de las
// arcadas, yuyos, tumbas viejas y el camino que sale para el norte. Cuando el
// remolino se calma (el final) se ve todo lo demás: lomas, cerros a lo lejos,
// lo que el viento se trajo de los otros mapas (el molino, la tapera, el vapor
// del penal) y, al costado del camino, la explanada del Chiquitijuein: un
// claro quemado, rodeado de apachetas, con un montón de bombillas clavadas en
// la tierra (las de todos los mates que se llevó), un algarrobo seco con cintas
// coloradas y la cueva de donde sale.
// Afuera no se camina: nada de esto tiene colisión.

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const sstep = (a, b, x) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// El camino sale de la cara norte de la torre y se va serpenteando.
export function roadX(z) {
  const d = TOWER.z0 - z;
  return TOWER.cx + Math.sin(d * 0.035) * 2.5 * sstep(10, 40, d);
}

// Altura del llano en (x, z): plano al pie de la torre, en la caverna del
// final y en la explanada del Chiquitijuein; lomas suaves y cerros a lo lejos.
export function groundY(x, z) {
  const T = TOWER;
  const dx = x - T.cx;
  const dz = z - T.cz;
  const r = Math.hypot(dx, dz);
  const A = T.arena;
  const ra = Math.hypot(x - A.x, z - A.z);
  const [sx, sz] = T.llano.spot;
  const rs = Math.hypot(x - sx, z - sz);
  const roll = (Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.7) + Math.sin((x + z) * 0.021) * 0.8 + Math.sin(x * 0.11 - z * 0.07) * 0.25) * 1.6;
  let h = roll * sstep(30, 70, r) * sstep(20, 34, ra) * sstep(8, 18, rs);
  // la caverna del Infierno, de afuera, es un cerrito de piedra
  if (ra > 16) h += 7 * sstep(34, 19, ra);
  // cerros a lo lejos
  const a = Math.atan2(dz, dx);
  h += sstep(100, 200, r) * (11 + Math.sin(a * 5 + 0.6) * 4 + Math.sin(a * 13) * 1.6);
  return h - 0.02;
}

export default class Llano {
  constructor(world) {
    this.w = world;
    this.M = world.M;
    this.root = new THREE.Group();
    this.stat = new Map();
    const [sx, sz] = TOWER.llano.spot;
    this.spot = new THREE.Vector3(sx, groundY(sx, sz), sz);
    registerPenalProps();
    this.buildGround();
    this.buildRoad();
    this.buildBase();
    this.buildClearing();
    this.buildFar();
    this.buildGrass();
    this.flush();
    world.root.add(this.root);
  }

  // ---------------- piezas estáticas (una malla por material) ----------------
  add(geo, mat, m4) {
    let g = geo.clone().applyMatrix4(m4);
    if (g.index) g = g.toNonIndexed();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.stat.has(mat)) this.stat.set(mat, []);
    this.stat.get(mat).push(g);
  }

  put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    this.add(geo, mat, m4);
  }

  // Un tramo de cilindro de a hasta b (troncos, ramas, postes caídos).
  seg(mat, a, b, r0, r1, sides = 6) {
    const d = tmpV.copy(b).sub(a);
    const len = d.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
    const m4 = new THREE.Matrix4().compose(tmpW.copy(a).add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), ONE);
    this.add(geo, mat, m4);
    geo.dispose();
  }

  // Un prop de world/props.js (o del penal) sin colisión.
  prop(type, x, z, rot = 0, extra = {}) {
    const res = buildProp({ type, pos: [x, z], rot, y: groundY(x, z), ...extra }, this.M, 7000 + Math.round(x * 13 + z * 7));
    if (!res) return;
    res.obj.updateMatrixWorld(true);
    res.obj.traverse((o) => {
      if (o.isMesh) this.add(o.geometry, o.material, o.matrixWorld);
    });
  }

  flush() {
    for (const [mat, list] of this.stat) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      // casi todo queda fuera de la sombra de la luna (y es una sola malla
      // enorme que nunca se descarta): no proyecta, solo recibe
      m.castShadow = false;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.root.add(m);
    }
    this.stat.clear();
  }

  // ---------------- el suelo ----------------
  buildGround() {
    const T = TOWER;
    const S = 480;
    const N = 128;
    const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const [sx, sz] = T.llano.spot;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + T.cx;
      const z = pos.getZ(i) + T.cz;
      pos.setX(i, x);
      pos.setZ(i, z);
      pos.setY(i, groundY(x, z));
      uv.setXY(i, x / 4, z / 4);
      // manchones de pasto seco sobre la tierra; más pelado al pie de la torre
      const r = Math.hypot(x - T.cx, z - T.cz);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2) * Math.cos(z * 0.11 - Math.sin(x * 0.07));
      const grass = Math.min(1, patch * sstep(14, 30, r) * sstep(3, 9, Math.hypot(x - sx, z - sz)));
      const far = sstep(90, 200, r);
      col[i * 3] = 1 + grass * 0.25 - far * 0.2;
      col[i * 3 + 1] = 0.95 + grass * 0.3 - far * 0.15;
      col[i * 3 + 2] = 0.9 - grass * 0.25 - far * 0.05;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = this.M.dirtDark.clone();
    mat.vertexColors = true;
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  // ---------------- el camino y el alambrado ----------------
  buildRoad() {
    const T = TOWER;
    const M = this.M;
    const z0 = T.z0 - 2.2;
    const z1 = -200;
    const step = 1.5;
    const verts = [];
    const uvs = [];
    const idx = [];
    let n = 0;
    for (let z = z0; z >= z1; z -= step) {
      const x = roadX(z);
      for (const s of [-1, 1]) {
        const px = x + s * 2;
        verts.push(px, groundY(px, z) + 0.04, z);
        uvs.push(s < 0 ? 0 : 1, (z0 - z) / 5);
      }
      if (n > 0) {
        const a = (n - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    road.receiveShadow = true;
    road.renderOrder = 1;
    this.root.add(road);
    // postes de alambrado a los dos lados (algunos torcidos, alguno caído);
    // al lado de la explanada del Chiquitijuein el alambrado está roto
    const r = rng(501);
    const post = new THREE.CylinderGeometry(0.045, 0.06, 1.3, 5);
    const wire = [];
    const [sx, sz] = T.llano.spot;
    for (const s of [-1, 1]) {
      let prev = null;
      for (let z = z0 - 1; z > -170; z -= 3.2) {
        const x = roadX(z) + s * 3.4;
        const y = groundY(x, z);
        const broken = Math.hypot(x - sx, z - sz) < 8;
        if (r() < 0.06 || (broken && r() < 0.5)) {
          // caído
          this.put(post, M.fenceDark, x + s * 0.4, y + 0.05, z, Math.PI / 2, r() * 3, 0);
          prev = null;
          continue;
        }
        const lean = broken ? 0.5 : (r() - 0.5) * 0.18;
        this.put(post, M.fenceDark, x, y + 0.6, z, (r() - 0.5) * 0.1, 0, lean * s);
        const top = new THREE.Vector3(x - Math.sin(lean * s) * 1.1, y, z);
        if (prev && !broken) for (const h of [0.45, 0.8, 1.1]) wire.push(prev.x, prev.y + h, prev.z, top.x, top.y + h, top.z);
        prev = broken ? null : top;
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.root.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3632 })));
  }

  // ---------------- al pie de la torre ----------------
  // Lo que el viento le arrancó a la torre, tumbas viejas y alguna banderita.
  buildBase() {
    const T = TOWER;
    const M = this.M;
    const r = rng(333);
    const stoneMat = M.towerStone || M.stone;
    const block = new THREE.BoxGeometry(1, 1, 1);
    const drum = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 10);
    const balu = new THREE.CylinderGeometry(0.05, 0.06, 0.78, 6);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = 16.5 + r() * 9;
      const x = T.cx + Math.cos(a) * d;
      const z = T.cz + Math.sin(a) * d;
      // el camino queda libre
      if (z < T.z0 && Math.abs(x - roadX(z)) < 2.6) continue;
      const y = groundY(x, z);
      const k = r();
      if (k < 0.45) {
        const s = 0.35 + r() * 0.55;
        this.put(block, stoneMat, x, y + s * 0.3, z, (r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4, s * 1.4, s, s);
      } else if (k < 0.7) {
        this.put(drum, stoneMat, x, y + 0.4, z, Math.PI / 2, r() * 3, 0, 1, 0.6 + r() * 0.8, 1);
      } else {
        for (let j = 0; j < 3; j++) this.put(balu, stoneMat, x + (r() - 0.5), y + 0.05, z + (r() - 0.5), Math.PI / 2, r() * 3, 0);
      }
    }
    // tumbas de los que no llegaron: cruces de palo torcidas con piedras al pie
    const cross = [];
    for (const [x, z] of [[12.6, 36.5], [11.8, 39.4], [13.4, 41.8], [46.4, 44.2], [47.6, 41]]) {
      const y = groundY(x, z);
      const lean = (r() - 0.5) * 0.35;
      this.put(new THREE.BoxGeometry(0.07, 1.1, 0.07), M.woodDark || M.wood, x, y + 0.5, z, 0, r(), lean);
      this.put(new THREE.BoxGeometry(0.5, 0.06, 0.06), M.woodDark || M.wood, x - Math.sin(lean) * 0.3, y + 0.82, z, 0, r() * 0.3, lean);
      this.put(new THREE.BoxGeometry(0.5, 0.08, 1.2), M.dirtDark, x, y + 0.02, z + 0.7, 0, 0, 0);
      cross.push([x, z]);
    }
    // banderas coloradas del Gauchito, rotas por el viento
    for (const [x, z] of [[14.6, 38.2], [45.2, 43]]) {
      const y = groundY(x, z);
      this.put(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), M.woodDark || M.wood, x, y + 1.2, z);
      this.put(new THREE.PlaneGeometry(0.7, 0.45), M.redCloth, x + 0.36, y + 2.1, z, 0, 0.3, -0.12);
    }
    // piedras sueltas
    const stone = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = 16 + r() * 60;
      const x = T.cx + Math.cos(a) * d;
      const z = T.cz + Math.sin(a) * d;
      if (z < T.z0 && Math.abs(x - roadX(z)) < 2.4) continue;
      const s = 0.15 + r() * (d > 40 ? 1.3 : 0.6);
      this.put(stone, M.rock || M.stone, x, groundY(x, z) + s * 0.15, z, r() * 3, r() * 3, r() * 3, s, s * 0.6, s);
    }
  }

  // ---------------- la explanada del Chiquitijuein ----------------
  buildClearing() {
    const M = this.M;
    const S = this.spot;
    const r = rng(777);
    const y0 = S.y;
    // la tierra quemada del medio, con grietas que brillan apenas
    const burn = burnTextures();
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: burn.map, emissiveMap: burn.glow, emissive: 0xff2a10, emissiveIntensity: 0.3, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    scorch.position.set(S.x, y0 + 0.03, S.z);
    scorch.renderOrder = 2;
    this.root.add(scorch);
    this.scorch = scorch;
    // la ronda de apachetas (montoncitos de piedra, como en los caminos del norte)
    const stone = new THREE.DodecahedronGeometry(1, 0);
    const rock = M.rock || M.stone;
    const cairn = (x, z, h) => {
      let y = groundY(x, z);
      let w = 0.34 * h;
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const hh = w * 0.5;
        this.put(stone, rock, x + (r() - 0.5) * 0.06, y + hh * 0.8, z + (r() - 0.5) * 0.06, (r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3, w, hh, w * 0.9);
        y += hh * 1.45;
        w *= 0.78;
      }
      return y;
    };
    const ring = 11;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + 0.2;
      // el hueco de la ronda da al camino
      if (Math.abs(Math.sin(a / 2 - 0.02)) < 0.14) continue;
      cairn(S.x + Math.cos(a) * 5.4, S.z + Math.sin(a) * 5.4, 0.8 + r() * 0.6);
    }
    // la apacheta grande, con una calabaza dada vuelta arriba
    const top = cairn(S.x - 1.2, S.z - 6.6, 2.4);
    this.put(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), M.gourd, S.x - 1.2, top + 0.14, S.z - 6.6, Math.PI, 0, 0.2);
    // bombillas clavadas en la tierra: las de todos los mates que se llevó
    const straw = new THREE.CylinderGeometry(0.008, 0.008, 0.26, 5);
    const tarnish = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.35, metalness: 1 });
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.6 + Math.sqrt(r()) * 3.2;
      const x = S.x + Math.cos(a) * d;
      const z = S.z + Math.sin(a) * d;
      this.put(straw, tarnish, x, groundY(x, z) + 0.1, z, (r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7, 1, 0.7 + r() * 0.6, 1);
    }
    // y las calabazas vacías, tiradas (algunas partidas)
    const gourd = new THREE.LatheGeometry([[0, 0], [0.07, 0.01], [0.1, 0.07], [0.1, 0.13], [0.07, 0.19], [0.055, 0.21]].map(([a, b]) => new THREE.Vector2(a, b)), 10);
    const half = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI);
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.4 + r() * 3.4;
      const x = S.x + Math.cos(a) * d;
      const z = S.z + Math.sin(a) * d;
      const y = groundY(x, z);
      if (r() < 0.3) this.put(half, M.gourd, x, y + 0.02, z, -Math.PI / 2 + (r() - 0.5) * 0.4, r() * 3, 0);
      else this.put(gourd, M.gourd, x, y + 0.08, z, Math.PI / 2 + (r() - 0.5) * 0.5, r() * 6, 0, 0.8 + r() * 0.4);
    }
    // el algarrobo seco, torcido, con cintas coloradas atadas en las ramas
    const tree = new THREE.Vector3(S.x - 4.2, groundY(S.x - 4.2, S.z - 3.4), S.z - 3.4);
    this.tips = this.deadTree(tree, 1.25, r);
    const ribbon = new THREE.PlaneGeometry(0.06, 0.5);
    ribbon.translate(0, -0.25, 0);
    for (const t of this.tips.slice(0, 9)) this.put(ribbon, M.redCloth, t.x, t.y, t.z, (r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3);
    // la cueva, entre las raíces: un montículo de tierra con la boca negra
    const cave = new THREE.Vector3(tree.x + 1.1, tree.y, tree.z + 0.9);
    const mound = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.put(mound, M.dirtDark, cave.x, cave.y - 0.05, cave.z, 0, 0.4, 0, 1.1, 0.55, 0.9);
    const hole = new THREE.CircleGeometry(0.38, 16);
    this.put(hole, M.black, cave.x + 0.62, cave.y + 0.22, cave.z + 0.62, -0.25, Math.PI / 4, 0, 1, 0.7, 1);
    // adentro, lejos, algo colorado
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.w.T.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    glow.position.set(cave.x + 0.55, cave.y + 0.24, cave.z + 0.55);
    glow.scale.setScalar(0.5);
    this.root.add(glow);
    this.caveGlow = glow;
    this.cave = cave;
    // el cartel al costado del camino
    this.sign(S.x + 4.4, S.z + 2.6, -2.5);
    // pajonales altos alrededor (esconden bien a un bicho chiquito)
    this.pajas = [];
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const d = 6.4 + r() * 5;
      const x = S.x + Math.cos(a) * d;
      const z = S.z + Math.sin(a) * d;
      if (Math.abs(x - roadX(z)) < 4) continue;
      this.pajas.push([x, z, 1.6 + r() * 0.9]);
    }
    // bruma baja que se arrastra por la explanada
    this.mist = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.w.T.dot, color: 0xa8a4a0, transparent: true, depthWrite: false, opacity: 0.07 }));
      m.userData.a = (i / 9) * Math.PI * 2;
      m.userData.d = 2 + r() * 6;
      m.scale.set(7, 1.6, 1);
      this.root.add(m);
      this.mist.push(m);
    }
  }

  // Un algarrobo seco: tronco torcido y ramas en dos niveles. Devuelve las puntas.
  deadTree(base, s, r) {
    const M = this.M;
    const bark = M.bark || M.woodDark;
    const tips = [];
    let p = base.clone();
    const dir = new THREE.Vector3(0.25, 1, 0.1).normalize();
    let rad = 0.26 * s;
    const forks = [];
    for (let i = 0; i < 4; i++) {
      const q = p.clone().addScaledVector(dir, (1 - i * 0.12) * s);
      this.seg(bark, p, q, rad, rad * 0.8, 7);
      p = q;
      rad *= 0.8;
      dir.x += (r() - 0.5) * 0.7;
      dir.z += (r() - 0.5) * 0.7;
      dir.normalize();
      if (i >= 1) forks.push([p.clone(), rad]);
    }
    const grow = (from, d, len, rr, depth) => {
      const to = from.clone().addScaledVector(d, len);
      this.seg(bark, from, to, rr, rr * 0.55, 5);
      if (depth === 0) {
        tips.push(to.clone().add(new THREE.Vector3(0, -0.02, 0)));
        return;
      }
      for (let k = 0; k < 2; k++) {
        const nd = d.clone().add(new THREE.Vector3((r() - 0.5) * 1.4, (r() - 0.2) * 0.8, (r() - 0.5) * 1.4)).normalize();
        grow(to, nd, len * 0.6, rr * 0.55, depth - 1);
      }
    };
    forks.forEach(([f, rr], i) => {
      for (let k = 0; k < 2; k++) {
        const a = r() * Math.PI * 2;
        const d = new THREE.Vector3(Math.cos(a), 0.35 + r() * 0.5, Math.sin(a)).normalize();
        grow(f, d, (1.3 - i * 0.2) * s, rr * 0.7, 2);
      }
    });
    // las raíces que asoman
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r();
      const to = base.clone().add(new THREE.Vector3(Math.cos(a) * 0.9 * s, -0.1, Math.sin(a) * 0.9 * s));
      this.seg(bark, base.clone().add(new THREE.Vector3(0, 0.25, 0)), to, 0.1 * s, 0.03, 5);
    }
    return tips;
  }

  // Cartel de madera, viejo, a la orilla del camino.
  sign(x, z, rot) {
    const M = this.M;
    const y = groundY(x, z);
    const tex = toTexture(signCanvas(), { repeat: false });
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.5, 0.09), M.woodDark || M.wood);
    post.position.y = 0.75;
    g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.46, 0.04), [M.woodDark, M.woodDark, M.woodDark, M.woodDark, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), M.woodDark]);
    board.position.set(0, 1.28, 0.06);
    board.rotation.z = -0.08;
    g.add(board);
    g.rotation.x = 0.05;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) {
        // el tablero (con la cara pintada) queda como malla propia
        const m = o.clone();
        m.matrixAutoUpdate = false;
        m.matrix.copy(o.matrixWorld);
        this.root.add(m);
      } else this.add(o.geometry, o.material, o.matrixWorld);
    });
  }

  // ---------------- lo que se trajo el viento ----------------
  buildFar() {
    const M = this.M;
    // el molino de la estancia (el primer mapa), quieto
    this.prop('windmill', -24, 6, 0.6);
    // el vapor del penal, varado en el medio del llano
    this.prop('naufragio', -30, 78, 2.2);
    // una carreta volcada al costado del camino
    this.prop('cart', roadX(-78) + 6, -78, 1.2);
    this.prop('well', 66, -8, 0);
    this.prop('ombu', -18, -52, 0);
    this.prop('ombu', 95, 88, 2);
    // la tapera: paredes de adobe sin techo
    const r = rng(909);
    const tx = 74;
    const tz = -34;
    const ty = groundY(tx, tz);
    const wall = (x0, z0, x1, z1, h) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const a = Math.atan2(z1 - z0, x1 - x0);
      // en pedazos de altura despareja
      const n = Math.ceil(len / 1.2);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const hh = h * (0.4 + r() * 0.6);
        this.put(new THREE.BoxGeometry(len / n + 0.02, hh, 0.35), M.adobe || M.dirt, x0 + (x1 - x0) * u, ty + hh / 2, z0 + (z1 - z0) * u, 0, -a, 0);
      }
    };
    wall(tx - 3, tz - 2.5, tx + 3, tz - 2.5, 2.6);
    wall(tx + 3, tz - 2.5, tx + 3, tz + 2.5, 2.2);
    wall(tx - 3, tz - 2.5, tx - 3, tz + 0.5, 2);
    wall(tx - 3, tz + 2.5, tx + 0.5, tz + 2.5, 1.4);
    for (let k = 0; k < 4; k++) this.put(new THREE.BoxGeometry(0.12, 0.12, 3 + r() * 2), M.woodDark || M.wood, tx - 1 + k * 0.9, ty + 0.3 + r() * 1.6, tz + (r() - 0.5), r() * 0.6, r() * 0.4, 0.2 + r() * 0.3);
    // postes del telégrafo a lo largo del camino (alguno tirado)
    for (let z = -20; z > -180; z -= 22) {
      const x = roadX(z) + 6;
      const y = groundY(x, z);
      if (r() < 0.2) {
        this.seg(M.woodDark || M.wood, new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(x + 5, y + 0.1, z + 2), 0.1, 0.08);
        continue;
      }
      this.put(new THREE.CylinderGeometry(0.08, 0.11, 6, 6), M.woodDark || M.wood, x, y + 3, z, 0, 0, (r() - 0.5) * 0.08);
      this.put(new THREE.BoxGeometry(1.2, 0.08, 0.08), M.woodDark || M.wood, x, y + 5.6, z);
    }
  }

  // ---------------- los yuyos ----------------
  buildGrass() {
    const T = TOWER;
    const r = rng(1234);
    const tex = toTexture(tuftCanvas(), { repeat: false });
    const mat = windy(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xd8cca0 }));
    // tres planos cruzados
    const parts = [0, 1, 2].map((k) => new THREE.PlaneGeometry(0.7, 0.55).translate(0, 0.27, 0).rotateY((k / 3) * Math.PI));
    const geo = mergeGeometries(parts);
    const pts = [];
    const [sx, sz] = T.llano.spot;
    const ok = (x, z) => {
      const rr = Math.hypot(x - T.cx, z - T.cz);
      if (rr < 15.8) return false;
      if (Math.hypot(x - T.arena.x, z - T.arena.z) < 19) return false;
      if (z < T.z0 - 1 && Math.abs(x - roadX(z)) < 2.1) return false;
      // la explanada quemada está pelada
      return Math.hypot(x - sx, z - sz) > 4.4;
    };
    for (let i = 0; i < 5200; i++) {
      // más cerca, más tupido (y un manchón alrededor de la explanada)
      let x;
      let z;
      if (i < 900) {
        const a = r() * Math.PI * 2;
        const d = 4.4 + r() * 14;
        x = sx + Math.cos(a) * d;
        z = sz + Math.sin(a) * d;
      } else {
        const a = r() * Math.PI * 2;
        const d = 16 + Math.pow(r(), 1.6) * 150;
        x = T.cx + Math.cos(a) * d;
        z = T.cz + Math.sin(a) * d;
      }
      if (!ok(x, z)) continue;
      pts.push([x, z, 0.6 + r() * 1.1, r() * Math.PI]);
    }
    for (const [x, z, s] of this.pajas || []) {
      for (let k = 0; k < 5; k++) pts.push([x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, s * (1.3 + r() * 0.8), r() * Math.PI]);
    }
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    pts.forEach(([x, z, s, a], i) => {
      q.setFromAxisAngle(UP, a);
      m4.compose(tmpV.set(x, groundY(x, z) - 0.02, z), q, tmpW.set(s, s * (0.8 + (i % 5) * 0.08), s));
      im.setMatrixAt(i, m4);
    });
    im.receiveShadow = true;
    this.root.add(im);
    // los penachos blancos de los pajonales
    const plume = new THREE.SphereGeometry(0.04, 6, 5).scale(1, 4.5, 1);
    const stalkGeo = new THREE.CylinderGeometry(0.006, 0.008, 1, 4).translate(0, 0.5, 0);
    const pm = new THREE.MeshStandardMaterial({ color: 0xcdbf9e, roughness: 1 });
    for (const [x, z, s] of this.pajas || []) {
      const y = groundY(x, z);
      for (let k = 0; k < 4; k++) {
        const lean = (r() - 0.5) * 0.5;
        const h = s * (0.9 + r() * 0.5);
        const ax = x + (r() - 0.5) * 0.3;
        const az = z + (r() - 0.5) * 0.3;
        this.put(stalkGeo, this.M.straw || this.M.hay, ax, y, az, 0, 0, lean, 1, h, 1);
        this.put(plume, pm, ax - Math.sin(lean) * h, y + Math.cos(lean) * h + 0.15, az, 0, 0, lean);
      }
    }
    this.flush();
  }

  // ---------------- cada cuadro ----------------
  update(dt, t) {
    const S = this.spot;
    for (const m of this.mist) {
      const a = m.userData.a + t * 0.05;
      m.position.set(S.x + Math.cos(a) * m.userData.d, S.y + 0.35, S.z + Math.sin(a) * m.userData.d);
    }
    // la cueva: algo colorado respira adentro (se apaga cuando él se fue)
    if (this.caveGlow) this.caveGlow.material.opacity = this.caveOff ? 0 : 0.35 + Math.sin(t * 1.3) * 0.15 + (Math.sin(t * 7.1) > 0.97 ? 0.3 : 0);
  }
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

// ---------------- texturas pintadas ----------------
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  const r = rng(71);
  const img = x.createImageData(64, 256);
  for (let j = 0; j < 256; j++) {
    for (let i = 0; i < 64; i++) {
      const u = i / 63;
      // bordes que se funden con el pasto y dos huellas de carreta
      const edge = Math.min(1, Math.min(u, 1 - u) * 5.5);
      const rut = Math.exp(-(((u - 0.3) / 0.06) ** 2)) + Math.exp(-(((u - 0.7) / 0.06) ** 2));
      const n = r();
      const k = (i + j * 64) * 4;
      const base = 120 - rut * 38 + n * 22;
      img.data[k] = base * 1.02;
      img.data[k + 1] = base * 0.86;
      img.data[k + 2] = base * 0.66;
      img.data[k + 3] = Math.max(0, Math.min(255, edge * (200 + n * 55) - (n > 0.93 ? 90 : 0)));
    }
  }
  x.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

// La tierra quemada: ceniza que se va aclarando hacia el borde y grietas que brillan.
function burnTextures() {
  const S = 256;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    return c;
  };
  const a = mk();
  const x = a.getContext('2d');
  const grad = x.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(14,10,8,0.95)');
  grad.addColorStop(0.6, 'rgba(28,22,18,0.85)');
  grad.addColorStop(0.85, 'rgba(60,52,44,0.45)');
  grad.addColorStop(1, 'rgba(60,52,44,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, S, S);
  const b = mk();
  const y = b.getContext('2d');
  y.fillStyle = '#000';
  y.fillRect(0, 0, S, S);
  const r = rng(99);
  // grietas desde el medio hacia afuera, como una telaraña
  for (let k = 0; k < 10; k++) {
    const px = S / 2 + (r() - 0.5) * 30;
    const py = S / 2 + (r() - 0.5) * 30;
    const ang = (k / 10) * Math.PI * 2 + r() * 0.5;
    const len = 30 + r() * 50;
    for (const [ctx, col, lw] of [[x, 'rgba(0,0,0,0.8)', 1.6], [y, 'rgba(170,40,20,0.8)', 0.8]]) {
      let qx = px;
      let qy = py;
      let qa = ang;
      const rr = rng(1000 + k);
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      for (let s = 0; s < len; s += 6) {
        qa += (rr() - 0.5) * 0.7;
        qx += Math.cos(qa) * 6;
        qy += Math.sin(qa) * 6;
        ctx.lineTo(qx, qy);
      }
      ctx.stroke();
    }
  }
  return { map: toTexture(a, { repeat: false }), glow: toTexture(b, { repeat: false }) };
}

// Una mata de pasto seco (hojas finitas que se abren), fondo transparente.
function tuftCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const r = rng(3);
  for (let i = 0; i < 34; i++) {
    const bx = 64 + (r() - 0.5) * 40;
    const lean = (r() - 0.5) * 70;
    const h = 60 + r() * 64;
    const tone = r();
    x.strokeStyle = `rgb(${Math.round(150 + tone * 70)},${Math.round(130 + tone * 60)},${Math.round(70 + tone * 30)})`;
    x.lineWidth = 1.5 + r() * 2;
    x.beginPath();
    x.moveTo(bx, 128);
    x.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h);
    x.stroke();
  }
  return c;
}

// "NO LE CONVIDE": pintado a mano, con un mate tachado.
function signCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 248;
  const x = c.getContext('2d');
  x.fillStyle = '#6a5438';
  x.fillRect(0, 0, 512, 248);
  const r = rng(12);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(30,20,10,${0.1 + r() * 0.2})`;
    x.lineWidth = 2;
    x.beginPath();
    const yy = r() * 248;
    x.moveTo(0, yy);
    x.lineTo(512, yy + (r() - 0.5) * 10);
    x.stroke();
  }
  x.fillStyle = '#e8dcc4';
  x.font = 'bold 52px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('SI LO VE,', 290, 100);
  x.font = 'bold 46px Georgia, serif';
  x.fillText('NO LE CONVIDE', 290, 176);
  // el mate tachado
  x.strokeStyle = '#e8dcc4';
  x.lineWidth = 6;
  x.beginPath();
  x.ellipse(52, 138, 24, 30, 0, 0, Math.PI * 2);
  x.moveTo(58, 108);
  x.lineTo(72, 70);
  x.stroke();
  x.strokeStyle = '#a0201a';
  x.lineWidth = 9;
  x.beginPath();
  x.moveTo(18, 182);
  x.lineTo(92, 84);
  x.stroke();
  return c;
}
