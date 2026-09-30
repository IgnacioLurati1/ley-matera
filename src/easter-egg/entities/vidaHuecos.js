import * as THREE from 'three';
import { DOORS, HUECOS, ZONES } from '../config/map';
import { warmObject } from '../fx/ghostMat';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from '../world/props';

// Los huecos del gaucho life (el penal, como el afterlife de Mob of the Dead).
// Las rejas eléctricas no tienen la cerradura a mano: el tablero que las abre
// está del otro lado. Con el cuerpo se ve la pared de siempre, entera; en
// gaucho life, al lado de la reja, la pared tiene un boquete de verdad (se
// ve a través) y el alma lo cruza agachada caminando contra él. Del otro
// lado se le pega al tablero con la electricidad. Los muertos, las balas y
// los vivos no pasan (la celda sigue siendo pared para la navegación y los
// choques).
//
// El boquete se recorta en la arquitectura ya armada (world/Levels.js): las
// caras de esa celda se anulan y se arman de nuevo dos veces, con el mismo
// material y la textura en el mismo lugar: enteras (el tapón, lo que ve el
// que anda en su cuerpo) y con el arco, el grosor y el piso del paso (lo
// que ve el alma). Cada compu muestra lo de su propio jugador.
//
// En línea: cada uno pasa con su alma (es su posición); el golpe al tablero
// lo decide el anfitrión (es un objetivo más del rayo, GauchoLife) y la reja
// se abre en todas las compus con el evento de siempre. La palanca del
// tablero sigue a la reja: se ve igual en todas.

const HOLE_W = 0.9;
const HOLE_H = 1.45;
// desde dónde se entra (distancia a la cara de la pared y al medio del hueco)
const REACH = 0.75;
const SIDE = 0.45;
const CROSS_T = 0.75;
// dónde se sale (desde la cara de la otra punta)
const OUT = 0.62;
const COLOR = 0x5ab8ff;
const UP = new THREE.Vector3(0, 1, 0);

const tmpV = new THREE.Vector3();
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tC = new THREE.Vector3();

const smooth = (t) => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

// El borde roto del boquete: un arco con dientes (ladrillos que faltan), en
// (t, y): t a lo largo de la pared desde el medio de la celda, y desde el piso.
// De abajo a la izquierda, sube, el arco y baja por la derecha.
function holeOutline(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  const w = HOLE_W / 2;
  const sh = HOLE_H - w;
  pts.push([-w, 0]);
  for (let i = 1; i <= 5; i++) pts.push([-w + (rnd() - 0.5) * 0.07, (i / 5) * sh]);
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    const r = w * (0.9 + rnd() * 0.18);
    pts.push([Math.cos(a) * r, sh + Math.sin(a) * r * 1.05]);
  }
  for (let i = 5; i >= 1; i--) pts.push([w + (rnd() - 0.5) * 0.07, (i / 5) * sh]);
  pts.push([w, 0]);
  return pts;
}

// El cartelito del tablero.
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#d8cfb4';
  x.fillRect(0, 0, 256, 64);
  x.strokeStyle = '#3a3226';
  x.lineWidth = 4;
  x.strokeRect(4, 4, 248, 56);
  x.fillStyle = '#231c14';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 22px Georgia, serif';
  x.fillText(text, 128, 33, 232);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Arma una malla de triángulos sueltos: cada uno se da vuelta si hace falta
// para mirar hacia `want` (así no importa en qué orden vienen los puntos).
function triMesh(tris, mat) {
  const pos = [];
  const nor = [];
  const uv = [];
  for (const { p, uv: u, n } of tris) {
    tA.subVectors(p[1], p[0]);
    tB.subVectors(p[2], p[0]);
    tC.crossVectors(tA, tB);
    const order = tC.dot(n) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      pos.push(p[k].x, p[k].y, p[k].z);
      nor.push(n.x, n.y, n.z);
      uv.push(u[k][0], u[k][1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export default class VidaHuecos {
  constructor(game, life) {
    this.g = game;
    this.life = life;
    this.list = [];
    this.geos = [];
    this.cross = null;
    this.cd = 0;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    // la pared entera (con el cuerpo) y el boquete (en gaucho life)
    this.plug = new THREE.Group();
    this.holed = new THREE.Group();
    this.holed.visible = false;
    this.root.add(this.plug, this.holed);
    this.rideFn = (dt) => this.ride(dt);
    if (!HUECOS.length) return;
    this.panelMats = {
      box: new THREE.MeshStandardMaterial({ color: 0x33403b, roughness: 0.55, metalness: 0.55 }),
      porcelain: new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.3 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xc07a45, roughness: 0.3, metalness: 0.85 }),
      black: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
      face: new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.5 }),
    };
    HUECOS.forEach((h, i) => this.build(h, i));
    this.wrapPrompts();
    // (los materiales son los de la pared: ya están; el tablero, compilado ya)
    warmObject(game, this.root);
  }

  // ---------------- lo que se ve ----------------
  build(def, i) {
    const g = this.g;
    const W = g.world;
    const di = DOORS.findIndex((d) => d.id === def.door);
    const it = g.interact.list.find((o) => o.kind === 'door' && o.door.index === di);
    if (!it) return;
    const n = new THREE.Vector3(def.into[0], 0, def.into[1]);
    const t = new THREE.Vector3(-n.z, 0, n.x);
    const c = new THREE.Vector3(def.cell[0] + 0.5, 0, def.cell[1] + 0.5);
    const h = { def, door: it.door, it, n, t, c, fy: {}, panel: null, open: it.door.open };
    // las dos caras: s = -1 del lado abierto (se entra hacia n), 1 del cerrado
    for (const s of [-1, 1]) h.fy[s] = W.floorAt(c.x + n.x * s * 1.05, c.z + n.z * s * 1.05, 20);
    const pts = holeOutline(97 + i * 31);
    h.pts = pts;
    this.cutWall(h);
    this.buildPanel(h);
    this.list.push(h);
  }

  // El boquete: saca de la arquitectura las dos caras de esa celda (sus
  // triángulos quedan en cero) y las arma de nuevo, enteras y con el arco
  // recortado, con el mismo material y la misma textura; después el grosor
  // (la piedra rota de adentro) y el piso del paso.
  cutWall(h) {
    const g = this.g;
    const W = g.world;
    const M = W.M;
    const { n, t, c, pts } = h;
    const fy = h.fy[-1];
    const meshes = [];
    W.root.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.geometry?.index && o.geometry.attributes.normal && o.geometry.attributes.uv) meshes.push(o);
    });
    const at = (a, tt, y) => new THREE.Vector3(c.x + n.x * a + t.x * tt, y, c.z + n.z * a + t.z * tt);
    const cellBox = new THREE.Box3(new THREE.Vector3(c.x - 0.6, fy - 0.2, c.z - 0.6), new THREE.Vector3(c.x + 0.6, fy + HOLE_H + 0.2, c.z + 0.6));
    const tmpBox = new THREE.Box3();
    for (const s of [-1, 1]) {
      const want = n.clone().multiplyScalar(s);
      const plane = 0.5 * s;
      for (const m of meshes) {
        m.updateWorldMatrix(true, false);
        const G = m.geometry;
        // (solo las mallas que llegan a la celda)
        if (!G.boundingBox) G.computeBoundingBox();
        if (!cellBox.intersectsBox(tmpBox.copy(G.boundingBox).applyMatrix4(m.matrixWorld))) continue;
        const P = G.attributes.position;
        const N = G.attributes.normal;
        const U = G.attributes.uv;
        const idx = G.index.array;
        const mw = m.matrixWorld;
        const got = [];
        for (let k = 0; k < idx.length; k += 3) {
          if (idx[k] === idx[k + 1]) continue;
          let okTri = true;
          let y0 = Infinity;
          let y1 = -Infinity;
          const vs = [];
          for (let j = 0; j < 3 && okTri; j++) {
            const vi = idx[k + j];
            const v = tmpV.fromBufferAttribute(P, vi).applyMatrix4(mw);
            const a = (v.x - c.x) * n.x + (v.z - c.z) * n.z;
            const tt = (v.x - c.x) * t.x + (v.z - c.z) * t.z;
            if (Math.abs(a - plane) > 0.004 || Math.abs(tt) > 0.502) okTri = false;
            y0 = Math.min(y0, v.y);
            y1 = Math.max(y1, v.y);
            vs.push({ vi, t: tt, y: v.y });
          }
          if (!okTri || y1 < fy + 0.05 || y0 > fy + HOLE_H + 0.05) continue;
          tmpV.fromBufferAttribute(N, idx[k]);
          if (tmpV.dot(want) < 0.9) continue;
          got.push(...vs);
          idx[k + 1] = idx[k];
          idx[k + 2] = idx[k];
        }
        if (!got.length) continue;
        G.index.needsUpdate = true;
        this.rebuildFace(h, s, m, got, at);
      }
    }
    // el grosor: la piedra rota de adentro del boquete, mirando al hueco
    const inner = M.stoneWall || M.stoneStep || M.cellWall;
    const tris = [];
    let run = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const [t0, y0] = pts[k];
      const [t1, y1] = pts[k + 1];
      const len = Math.hypot(t1 - t0, y1 - y0);
      if (len < 1e-4) continue;
      // (hacia adentro del hueco: el borde va de abajo a la izquierda, subiendo)
      const nin = t.clone().multiplyScalar((y1 - y0) / len).addScaledVector(UP, -(t1 - t0) / len);
      const a0 = at(-0.5, t0, fy + y0);
      const a1 = at(-0.5, t1, fy + y1);
      const b0 = at(0.5, t0, fy + y0);
      const b1 = at(0.5, t1, fy + y1);
      const u0 = run / 1.5;
      const u1 = (run + len) / 1.5;
      tris.push({ p: [a0, a1, b1], uv: [[u0, 0], [u1, 0], [u1, 0.66]], n: nin });
      tris.push({ p: [a0, b1, b0], uv: [[u0, 0], [u1, 0.66], [u0, 0.66]], n: nin });
      run += len;
    }
    const lining = triMesh(tris, inner);
    this.geos.push(lining.geometry);
    this.holed.add(lining);
    // el piso del paso (el de la zona de este lado)
    const floorKey = ZONES[W.zoneKeys[W.zone[W.idx(Math.floor(c.x - n.x), Math.floor(c.z - n.z))]]]?.floor;
    const fm = M[floorKey] || inner;
    const w = HOLE_W / 2 + 0.05;
    const q = [at(-0.5, -w, fy + 0.003), at(-0.5, w, fy + 0.003), at(0.5, w, fy + 0.003), at(0.5, -w, fy + 0.003)];
    const fuv = q.map((v) => [v.x / 2, v.z / 2]);
    const floor = triMesh([{ p: [q[0], q[1], q[2]], uv: [fuv[0], fuv[1], fuv[2]], n: UP }, { p: [q[0], q[2], q[3]], uv: [fuv[0], fuv[2], fuv[3]], n: UP }], fm);
    this.geos.push(floor.geometry);
    this.holed.add(floor);
  }

  // Una cara de la pared, dos veces: el mismo rectángulo que había (el tapón)
  // y con el boquete recortado desde el piso, con la textura donde estaba
  // (u, v salen de los vértices sacados: la pared la arma lineal en t y en y).
  rebuildFace(h, s, m, got, at) {
    const G = m.geometry;
    const U = G.attributes.uv;
    const fy = h.fy[-1];
    let t0 = Infinity;
    let t1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const v of got) {
      t0 = Math.min(t0, v.t);
      t1 = Math.max(t1, v.t);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    // uv = uvA + J (dt, dy): con un vértice corrido en t y otro en y
    const A = got[0];
    const B = got.find((v) => Math.abs(v.t - A.t) > 0.3) || A;
    const C = got.find((v) => Math.abs(v.y - A.y) > 0.3 && Math.abs((B.t - A.t) * (v.y - A.y) - (B.y - A.y) * (v.t - A.t)) > 0.05) || A;
    const uvOf = (v) => [U.getX(v.vi), U.getY(v.vi)];
    const [ua, va] = uvOf(A);
    const [ub, vb] = uvOf(B);
    const [uc, vc] = uvOf(C);
    const d1 = [B.t - A.t, B.y - A.y];
    const d2 = [C.t - A.t, C.y - A.y];
    const det = d1[0] * d2[1] - d1[1] * d2[0] || 1;
    // (resuelve [d1; d2] * [du/dt, du/dy] = [ub - ua, uc - ua], y lo mismo con v)
    const solve = (e1, e2) => [(e1 * d2[1] - e2 * d1[1]) / det, (d1[0] * e2 - d2[0] * e1) / det];
    const [ut, uy] = solve(ub - ua, uc - ua);
    const [vt, vy] = solve(vb - va, vc - va);
    const uv = (tt, y) => [ua + ut * (tt - A.t) + uy * (y - A.y), va + vt * (tt - A.t) + vy * (y - A.y)];
    // la forma en (t, y): el rectángulo con el arco desde abajo (o de agujero, si la cara baja más que el piso)
    const P = h.pts;
    const hy = (p) => fy + p[1];
    let shape;
    if (y0 < fy - 0.02) {
      shape = new THREE.Shape([new THREE.Vector2(t0, y0), new THREE.Vector2(t1, y0), new THREE.Vector2(t1, y1), new THREE.Vector2(t0, y1)]);
      shape.holes.push(new THREE.Path(P.map((p) => new THREE.Vector2(p[0], hy(p)))));
    } else {
      const out = [new THREE.Vector2(t0, y0)];
      for (const p of P) out.push(new THREE.Vector2(p[0], Math.max(y0, hy(p))));
      out.push(new THREE.Vector2(t1, y0), new THREE.Vector2(t1, y1), new THREE.Vector2(t0, y1));
      shape = new THREE.Shape(out);
    }
    const want = h.n.clone().multiplyScalar(s);
    const plugShape = new THREE.Shape([new THREE.Vector2(t0, y0), new THREE.Vector2(t1, y0), new THREE.Vector2(t1, y1), new THREE.Vector2(t0, y1)]);
    for (const [sh, into] of [[shape, this.holed], [plugShape, this.plug]]) {
      const sg = new THREE.ShapeGeometry(sh, 1);
      const sp = sg.attributes.position;
      const tris = [];
      const ix = sg.index ? sg.index.array : [...Array(sp.count).keys()];
      for (let k = 0; k < ix.length; k += 3) {
        const p = [];
        const u = [];
        for (let j = 0; j < 3; j++) {
          const tt = sp.getX(ix[k + j]);
          const y = sp.getY(ix[k + j]);
          p.push(at(0.5 * s, tt, y));
          u.push(uv(tt, y));
        }
        tris.push({ p, uv: u, n: want });
      }
      sg.dispose();
      const face = triMesh(tris, m.material);
      face.castShadow = m.castShadow;
      face.receiveShadow = m.receiveShadow;
      // lo demás que traiga la pared (color de vértice, otra uv): el del primero
      for (const name of Object.keys(G.attributes)) {
        if (name === 'position' || name === 'normal' || name === 'uv') continue;
        const src = G.attributes[name];
        const cnt = face.geometry.attributes.position.count;
        const arr = new Float32Array(cnt * src.itemSize);
        for (let q = 0; q < cnt; q++) for (let j = 0; j < src.itemSize; j++) arr[q * src.itemSize + j] = src.array[A.vi * src.itemSize + j];
        face.geometry.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
      }
      this.geos.push(face.geometry);
      into.add(face);
    }
  }

  // El tablero: una caja de hierro con la cuchilla de cobre, el reloj, la
  // lamparita azul (cerrada) y los cables que suben. Lo ven todos.
  buildPanel(h) {
    const g = this.g;
    const W = g.world;
    const P = this.panelMats;
    const M = W.M;
    const { cell, face } = h.def.panel;
    const a = W.wallAnchor(cell, face, 0.005);
    const fy = W.floorAt(cell[0] + 0.5 + face[0], cell[1] + 0.5 + face[1], 20);
    const grp = new THREE.Group();
    grp.position.set(a.x, fy, a.z);
    grp.rotation.y = a.rot;
    const y = 1.35;
    grp.add(mesh(boxGeo(0.7, 0.95, 0.04), M.woodDark || P.black, 0, y, 0.02));
    grp.add(mesh(boxGeo(0.5, 0.64, 0.13), P.box, 0, y, 0.105));
    // la base de loza de la cuchilla y las dos mordazas de arriba
    grp.add(mesh(boxGeo(0.2, 0.3, 0.025), P.porcelain, -0.08, y - 0.05, 0.18));
    for (const x of [-0.13, -0.03]) grp.add(mesh(boxGeo(0.02, 0.05, 0.04), P.copper, x, y + 0.07, 0.2));
    // el reloj
    const dial = mesh(cylGeo(0.06, 0.06, 0.02, 20), P.face, 0.14, y + 0.14, 0.18);
    dial.rotation.x = Math.PI / 2;
    grp.add(dial);
    grp.add(mesh(cylGeo(0.068, 0.068, 0.015, 20), P.black, 0.14, y + 0.14, 0.172, Math.PI / 2, 0, 0));
    // los aisladores y los cables que suben al techo
    for (const x of [-0.16, 0, 0.16]) {
      grp.add(mesh(cylGeo(0.022, 0.03, 0.06, 8), P.porcelain, x, y + 0.36, 0.1));
      grp.add(mesh(cylGeo(0.008, 0.008, 1.3, 5), P.black, x, y + 1.02, 0.1));
    }
    // el cartel: qué reja abre
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: labelTexture(h.def.label || 'REJA'), roughness: 0.8 }));
    label.position.set(0, y - 0.39, 0.043);
    grp.add(label);
    // lo que se mueve: la cuchilla, la aguja y la lamparita
    const blades = new THREE.Group();
    blades.position.set(-0.08, y - 0.17, 0.2);
    for (const x of [-0.05, 0.05]) blades.add(mesh(boxGeo(0.014, 0.23, 0.02), P.copper, x, 0.115, 0));
    blades.add(mesh(cylGeo(0.016, 0.016, 0.14, 8), P.black, 0, 0.23, 0.03, 0, 0, Math.PI / 2));
    grp.add(blades);
    const needle = new THREE.Group();
    needle.position.set(0.14, y + 0.14, 0.192);
    needle.add(mesh(boxGeo(0.006, 0.05, 0.004), P.black, 0, 0.022, 0));
    grp.add(needle);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, emissive: COLOR, emissiveIntensity: 1.6, roughness: 0.3 });
    const lamp = mesh(new THREE.SphereGeometry(0.035, 12, 8), lampMat, 0.14, y - 0.16, 0.18);
    grp.add(lamp);
    mergeByMaterial(grp, [blades, needle, lamp, label]);
    for (const o of grp.children) if (o.isMesh) this.geos.push(o.geometry);
    this.root.add(grp);
    grp.updateMatrixWorld(true);
    h.panel = { grp, blades, needle, lamp, lampMat, center: new THREE.Vector3(0, y, 0.2).applyMatrix4(grp.matrixWorld), face: new THREE.Vector3(face[0], 0, face[1]), k: h.open ? 1 : 0 };
    this.pose(h);
  }

  // La cuchilla abierta (colgando hacia afuera) o cerrada (arriba, en las mordazas).
  pose(h) {
    const P = h.panel;
    const k = P.k;
    P.blades.rotation.x = (1 - k) * 2.2;
    P.lampMat.emissive.setHex(k > 0.5 ? 0xffb050 : COLOR);
    P.lampMat.emissiveIntensity = k > 0.5 ? 0.6 : 1.6;
  }

  // El cartel de la reja: corto (lo demás lo descubre cada uno).
  wrapPrompts() {
    for (const h of this.list) {
      const base = h.it.prompt;
      h.it.prompt = () => {
        const r = base();
        return r && r.info ? { ...r, text: 'Necesita electricidad' } : r;
      };
    }
  }

  // Los objetivos del rayo (GauchoLife los registra: mismo orden en todas las compus).
  targets() {
    const I = this.g.interact;
    return this.list.map((h) => ({ pos: h.panel.center, r: 0.55, on: () => !h.door.open, hit: () => I.openDoor(h.door), panel: true }));
  }

  // ¿Esta reja tiene tablero? (entonces la cerradura de la reja ya no se toca)
  hasPanel(door) {
    return this.list.some((h) => h.door === door);
  }

  // ---------------- cada cuadro ----------------
  update(dt, input) {
    const g = this.g;
    const L = this.life;
    if (!this.list.length) return;
    // el boquete solo en gaucho life (el de esta compu); si no, la pared entera
    this.holed.visible = L.active;
    this.plug.visible = !L.active;
    for (const h of this.list) {
      // el tablero sigue a la reja (así se ve igual en todas las compus)
      if (h.door.open !== h.open) {
        h.open = h.door.open;
        if (h.open) {
          g.fx.electric(h.panel.center, 24);
          g.fx.flash(h.panel.center, COLOR, 30, 0.35, 8);
          g.audio.zap?.(h.panel.center);
        }
      }
      const P = h.panel;
      const goal = h.open ? 1 : 0;
      if (P.k !== goal) {
        P.k = goal ? Math.min(1, P.k + dt * 2.5) : 0;
        this.pose(h);
      }
      // la aguja: tiembla con la reja cerrada, se clava arriba al abrir
      P.needle.rotation.z = h.open ? -1.1 + Math.sin(g.time * 30) * 0.02 : 0.9 + Math.sin(g.time * 7) * 0.08 + Math.sin(g.time * 23) * 0.03;
    }
    if (this.cross || !L.active) return;
    if (this.cd > 0) this.cd -= dt;
    const p = g.player;
    // hacia dónde quiere ir (las mismas teclas que Player)
    const f = (input.key('KeyW') ? 1 : 0) - (input.key('KeyS') ? 1 : 0);
    const sd = (input.key('KeyD') ? 1 : 0) - (input.key('KeyA') ? 1 : 0);
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    let wx = -sin * f + cos * sd;
    let wz = -cos * f - sin * sd;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    for (const h of this.list) {
      tmpV.set(p.pos.x - h.c.x, 0, p.pos.z - h.c.z);
      const along = tmpV.dot(h.n);
      const lat = tmpV.dot(h.t);
      const s = along < 0 ? -1 : 1;
      // distancia a la cara de ese lado
      const d = Math.abs(along) - 0.5;
      if (d > REACH || Math.abs(lat) > SIDE || Math.abs(p.pos.y - h.fy[s]) > 1) continue;
      const push = -s * (wx * h.n.x + wz * h.n.z);
      if (this.cd <= 0 && len > 0 && d < REACH && Math.abs(lat) < SIDE && push > 0.5) {
        this.start(h, s, lat);
        return;
      }
    }
  }

  // Pasar: el alma se agacha y cruza la pared (Player.ride la lleva).
  start(h, s, lat) {
    const g = this.g;
    const p = g.player;
    const out = -s;
    this.cross = {
      h,
      out,
      lat,
      // cuánto le falta hasta el medio de la pared
      a: Math.abs(tmpV.set(p.pos.x - h.c.x, 0, p.pos.z - h.c.z).dot(h.n)),
      y0: p.pos.y,
      y1: h.fy[out],
      t: 0,
      prev: p.ride || null,
    };
    p.ride = this.rideFn;
    g.audio.whoosh?.(p.pos);
    const at = tmpV.set(h.c.x, h.fy[s] + 1, h.c.z);
    g.fx.electric(at, 10);
  }

  ride(dt) {
    const g = this.g;
    const p = g.player;
    const c = this.cross;
    if (!c || !this.life.active) {
      this.cancel();
      return;
    }
    c.t += dt;
    const k = Math.min(1, c.t / CROSS_T);
    const e = smooth(k);
    const h = c.h;
    // a lo largo: de donde estaba (del lado de entrada) a la salida del otro lado
    const along = -c.out * c.a + c.out * (c.a + 0.5 + OUT) * e;
    // a lo ancho: se centra rápido en el hueco
    const lat = c.lat * (1 - smooth(k / 0.35));
    p.pos.set(h.c.x + h.n.x * along + h.t.x * lat, c.y0 + (c.y1 - c.y0) * e, h.c.z + h.n.z * along + h.t.z * lat);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.airTop = p.pos.y;
    p.crouching = true;
    p.sprinting = false;
    p.lungeT = 0;
    if (k >= 1) {
      this.end();
      p.vel.set(h.n.x * c.out * 2.2, 0, h.n.z * c.out * 2.2);
      g.audio.whoosh?.(p.pos);
    }
  }

  end() {
    const p = this.g.player;
    if (p.ride === this.rideFn) p.ride = this.cross?.prev || null;
    this.cross = null;
    this.cd = 0.5;
  }

  // Se cortó (se acabó la energía, volvió al cuerpo): la posición la pone GauchoLife.
  cancel() {
    const p = this.g.player;
    if (p.ride === this.rideFn) p.ride = null;
    this.cross = null;
  }

  dispose() {
    this.cancel();
    this.root.removeFromParent();
    // (las cajas y cilindros sueltos son del caché de props: esas no)
    for (const geo of this.geos) geo.dispose();
  }
}
