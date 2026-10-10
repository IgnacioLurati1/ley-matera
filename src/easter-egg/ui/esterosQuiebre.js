import * as THREE from 'three';
import { rng } from '../core/noise';
import { crackMat, floorCrackMat, heartMat, canvasTex } from '../world/eclipse/centro';
import { eclSfx } from '../fx/eclipseSfx';
import { glow } from '../entities/castle/common';

// El algarrobo de los colgados que se parte: el final de "Mate no Numa" donde
// el Gil se niega ("La ronda se ha roto", ui/EsterosEnding.js). Los cuatro se
// van al fogón y, atrás, la disformidad empieza a desarmar el árbol. Es el
// que después está partido en el claro de Eclipse Matero (world/eclipse/centro
// buildAlgarrobo) y se rompe como lo que el caos rompió allá
// (world/eclipse/penalCaos): la grieta de luz violeta, la madera de adentro
// con las vetas que brillan, los pedazos que se sueltan y quedan flotando, las
// piedras negras que suben del piso y las grietas de luz que corren por el suelo.
//  · 0 s: el hueco, que había quedado callado, se prende violeta; un temblor
//    grave; las sogas de los colgados empiezan a levantarse solas;
//  · una raja fina de luz sube y baja por la corteza desde el hueco;
//  · SNAP: el tronco se raja en dos (la grieta, de frente a la cámara) y las
//    mitades se abren en V de a tirones (JOLTS); saltan astillas de corteza;
//  · con cada tirón se quiebra un pedazo de una mitad (BREAK): el del medio se
//    corre y el de arriba sube con sus ramas, y quedan flotando;
//  · las copas, las puntas de las ramas y después las ramas del medio se
//    sueltan y quedan flotando; suben piedras; las grietas corren por el piso.
// No llega a terminar: a los LEN s la escena corta a negro (stop()).
// El árbol es el del mapa (world/esterosProps algarrobo: world.dynamic.algarrobo,
// con sus piezas sueltas en .pieces): se lo esconde y se ponen esas mismas
// piezas, cada una en su lugar (swap(), con la cámara mirando para otro lado).
// Todo sale del segundo de la escena y de un azar fijo: en línea se ve igual.
// Sin luces nuevas (ui/cineWarm): la del hueco pasa a ser la de la grieta.

export const SNAP = 3;
export const LEN = SNAP + 3.4;
// los tirones con que se abre (s después de SNAP): el último, justo antes del corte
const JOLTS = [1.2, 2.25, 3.25];
// con qué tirón se suelta cada pedazo del tronco, por lado: [el del medio, el de arriba]
const BREAK = { 1: [JOLTS[0], JOLTS[1]], [-1]: [JOLTS[1], JOLTS[2]] };
const VIOLET = 0xa860ff;
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => {
  const k = clamp01(u);
  return k * k * (3 - 2 * k);
};
// (de golpe y se asienta: 0 antes de 0, hacia 1 con ese tiempo)
const e1 = (x, tau) => (x <= 0 ? 0 : 1 - Math.exp(-x / tau));

// Las piedras que suben: negras, con las vetas violetas (como world/eclipse/centro
// voidRockMat, que es del mapa de Eclipse: usa su textura de roca).
function rockMat() {
  const em = canvasTex(256, 256, (x, W, H) => {
    const r = rng(303);
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) {
      x.strokeStyle = `rgba(${170 + r() * 60},${90 + r() * 40},255,${0.5 + r() * 0.5})`;
      x.lineWidth = 1 + r() * 2.5;
      x.beginPath();
      let px = r() * W;
      let py = r() * H;
      x.moveTo(px, py);
      for (let s = 0; s < 6; s++) {
        px += (r() - 0.5) * 70;
        py += (r() - 0.5) * 70;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  }, { repeat: true });
  return new THREE.MeshStandardMaterial({ color: 0x2e2a36, emissiveMap: em, emissive: 0xb070ff, emissiveIntensity: 1.1, roughness: 0.9, flatShading: true });
}

export default class Quiebre {
  // tree: el algarrobo del mapa; eye: desde dónde se lo va a mirar (la grieta
  // se abre de frente a ese lado); light: la luz del hueco; hole: el hueco
  // negro de la corteza (se va cuando el tronco se parte por ahí).
  constructor(g, parent, tree, { eye, light, hole = null }) {
    const w = g.world;
    const r = rng(1877);
    this.g = g;
    this.tree = tree;
    this.light = light;
    this.hole = hole;
    this.T = 0;
    this.on = false;
    this.glow = 0;
    this.shake = 0;
    this.shadowT = 0;
    this.sparkT = 0;
    this.own = [];
    const keep = (x) => {
      this.own.push(x);
      return x;
    };
    const root = (this.root = new THREE.Group());
    root.position.copy(tree.position);
    root.quaternion.copy(tree.quaternion);
    root.visible = false;
    parent.add(root);
    // (lo que tiembla: el árbol entero; las piedras y las grietas del piso, no)
    const body = (this.body = new THREE.Group());
    root.add(body);
    root.updateMatrixWorld(true);

    // ---- el tronco: dos mitades, con la grieta de frente a `eye` ----
    const trunk = tree.pieces.find((m) => m.userData.part.kind === 'trunk');
    const { radiusTop: rt, radiusBottom: rb, height: H } = trunk.geometry.parameters;
    const bark = trunk.material;
    this.H = H;
    const up = tmpV.copy(UP).applyQuaternion(trunk.quaternion).clone();
    const axis = (this.axis = new THREE.Group());
    axis.position.copy(trunk.position).addScaledVector(up, -H / 2);
    const e = root.worldToLocal(eye.clone()).sub(axis.position);
    axis.quaternion.copy(trunk.quaternion).multiply(tmpQ.setFromAxisAngle(UP, Math.atan2(e.x, e.z)));
    body.add(axis);
    const heart = (this.heart = keep(heartMat().clone()));
    heart.emissiveIntensity = 0;
    // Cada mitad, en tres pedazos (cortados a distinta altura de cada lado): el
    // de abajo queda en el piso; el del medio y el de arriba (con sus ramas) se
    // sueltan con los tirones y quedan flotando, con la madera de adentro a la vista.
    const R = (y) => rb - (rb - rt) * (y / H);
    this.halves = {};
    this.tops = {};
    this.chunks = [];
    for (const side of [1, -1]) {
      const half = new THREE.Group();
      axis.add(half);
      this.halves[side] = half;
      const cuts = side > 0 ? [0, 0.36 * H, 0.68 * H, H] : [0, 0.43 * H, 0.75 * H, H];
      for (let k = 0; k < 3; k++) {
        const y0 = cuts[k];
        const y1 = cuts[k + 1];
        const d = (y1 - y0) / 2;
        const r0 = R(y0);
        const r1 = R(y1);
        const grp = new THREE.Group();
        grp.position.y = y0 + d;
        // media corteza (θ de 0 a π es x ≥ 0), con la textura del tronco entero
        const geo = keep(new THREE.CylinderGeometry(r1, r0, y1 - y0, 10, 1, true, side > 0 ? 0 : Math.PI, Math.PI));
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + (side > 0 ? 0 : 0.5), (y0 + uv.getY(i) * (y1 - y0)) / H);
        grp.add(new THREE.Mesh(geo, bark));
        // la cara del corte: la madera de adentro (mira hacia la grieta)
        const cut = keep(new THREE.BufferGeometry());
        cut.setAttribute('position', new THREE.Float32BufferAttribute([0, -d, -r0, 0, -d, r0, 0, d, r1, 0, d, -r1], 3));
        cut.setAttribute('uv', new THREE.Float32BufferAttribute([0, y0 / H, 1, y0 / H, 1, y1 / H, 0, y1 / H], 2));
        cut.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
        cut.computeVertexNormals();
        grp.add(new THREE.Mesh(cut, heart));
        // las tapas (semicírculos): por donde se quebró, madera de adentro; la de arriba del todo, corteza
        const cap = (y, rr, mat) => {
          const c = new THREE.Mesh(keep(new THREE.CircleGeometry(rr, 10, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)), mat);
          c.position.y = y;
          grp.add(c);
        };
        cap(d, r1, k === 2 ? bark : heart);
        if (k) cap(-d, r0, heart);
        for (const m of grp.children) m.castShadow = m.receiveShadow = true;
        half.add(grp);
        if (k === 2) this.tops[side] = grp;
        if (k) this.chunks.push({ grp, side, y: y0 + d, top: k === 2, at: SNAP + BREAK[side][k - 1] });
      }
    }

    // ---- las piezas del árbol, cada una en su lugar ----
    const bare = new Map();
    const items = [];
    for (const src of tree.pieces) {
      const p = src.userData.part;
      if (p.kind === 'trunk') continue;
      const m = src.clone();
      // (como lo fundido con el mapa: sin el color por vértice)
      if (m.geometry.attributes.color) {
        if (!bare.has(m.geometry)) {
          const b = keep(m.geometry.clone());
          b.deleteAttribute('color');
          bare.set(m.geometry, b);
        }
        m.geometry = bare.get(m.geometry);
      }
      m.castShadow = m.receiveShadow = true;
      body.add(m);
      items.push({ m, p });
    }
    root.updateMatrixWorld(true);
    // de qué mitad cuelga cada rama grande
    const sideOf = {};
    for (const { m, p } of items) if (p.kind === 'branch' && !p.id.includes('.')) sideOf[p.id] = axis.worldToLocal(m.getWorldPosition(tmpV)).x >= 0 ? 1 : -1;
    // (las ramas van con el pedazo de arriba de su mitad)
    const halfOf = (id) => this.tops[sideOf[id.split('.')[0]] || 1];
    // las sogas: atadas a su punta; esas ramas no se sueltan
    const roped = [...new Set(items.filter(({ p }) => p.kind === 'rope').map(({ p }) => p.id))];
    const held = (id) => roped.some((q) => q === id || q.startsWith(`${id}.`));
    // cuándo se suelta cada rama: las puntas primero, después las del medio
    // (cuando ya soltaron las dos suyas); las grandes quedan en su mitad
    const at = {};
    const branches = items.filter(({ p }) => p.kind === 'branch');
    for (const { p } of branches) if (p.depth === 0) at[p.id] = held(p.id) ? Infinity : SNAP - 0.3 + r() * 2.6;
    for (const { p } of branches) if (p.depth === 1) at[p.id] = held(p.id) ? Infinity : Math.max(at[`${p.id}.0`], at[`${p.id}.1`]) + 0.4 + r() * 0.8;
    this.loose = [];
    const ropes = new Map();
    const qHalf = new THREE.Quaternion();
    for (const it of items) {
      const { m, p } = it;
      if (p.kind === 'root') continue;
      const half = halfOf(p.id);
      if (p.kind === 'rope') {
        // (la soga y su lazo, colgados del nudo)
        if (!ropes.has(p.id)) {
          const knot = new THREE.Group();
          knot.position.set(...p.at);
          body.add(knot);
          knot.updateMatrixWorld(true);
          ropes.set(p.id, knot);
        }
        ropes.get(p.id).attach(m);
        continue;
      }
      half.attach(m);
      const main = p.kind === 'branch' && p.depth > 1;
      const t = p.kind === 'crown' ? Math.min((at[p.id] ?? Infinity) - 0.25, SNAP - 0.8 + r() * 2.4) : main ? Infinity : at[p.id];
      if (!(t < LEN + 1)) continue;
      // hacia afuera del tronco y para arriba: un envión que se frena y queda flotando
      const out = tmpV.set(m.position.x, 0, m.position.z);
      if (out.lengthSq() < 0.01) out.set(r() - 0.5, 0, r() - 0.5);
      out.normalize();
      const crown = p.kind === 'crown';
      const fly = out.clone().multiplyScalar(crown ? 0.2 + r() * 0.6 : 0.5 + r() * 1.2);
      fly.y += crown ? 1.0 + r() * 1.5 : 0.5 + r() * 1.3;
      this.loose.push({
        m,
        at: t,
        p0: m.position.clone(),
        q0: m.quaternion.clone(),
        fly,
        rise: 0.08 + r() * 0.14,
        ax: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: (crown ? 0.4 : 0.7) + r() * 1.3,
        slow: (r() - 0.5) * 0.35,
      });
    }
    // las sogas se levantan solas: del nudo, hacia afuera y para arriba
    this.ropes = [];
    let j = 0;
    for (const [id, knot] of ropes) {
      const half = halfOf(id);
      half.attach(knot);
      half.getWorldQuaternion(qHalf);
      knot.getWorldPosition(tmpV);
      axis.getWorldPosition(tmpW);
      const out = tmpV.sub(tmpW).setY(0).normalize();
      // (el eje, en el espacio de la mitad: de colgar a plomo, hacia afuera)
      const ax = new THREE.Vector3(0, -1, 0).cross(out).normalize().applyQuaternion(qHalf.invert());
      this.ropes.push({ knot, q0: knot.quaternion.clone(), ax, t0: 0.6 + j * 0.7, amp: 2.0 + r() * 0.5, ph: r() * 6 });
      j++;
    }

    // ---- la luz de la grieta ----
    // la raja fina sobre la corteza, antes de que se parta (nace a la altura del hueco)
    const hairMat = (this.hairMat = keep(crackMat().clone()));
    hairMat.opacity = 0;
    const hair = (this.hair = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.22, H)), hairMat));
    hair.rotation.x = -Math.atan((rb - rt) / H);
    hair.renderOrder = 2;
    hair.visible = false;
    axis.add(hair);
    this.hairZ = (y) => rb - (rb - rt) * (y / H) + 0.02;
    // la luz entre las dos mitades: de frente (se ve por la raja y arriba de la
    // horqueta) y a lo largo de la grieta (de costado)
    const sheetMat = (this.sheetMat = keep(crackMat().clone()));
    sheetMat.opacity = 0;
    const sheetGeo = keep(new THREE.PlaneGeometry(1, H * 1.35));
    this.sheets = [0, Math.PI / 2].map((ry) => {
      const s = new THREE.Mesh(sheetGeo, sheetMat);
      s.position.y = (H * 1.35) / 2 - 0.05;
      s.rotation.y = ry;
      s.renderOrder = 2;
      s.visible = false;
      axis.add(s);
      return s;
    });
    this.core = axis.localToWorld(new THREE.Vector3(0, H * 0.55, 0));
    this.top = axis.localToWorld(new THREE.Vector3(0, H * 1.12, 0));
    // dónde queda la luz cuando se abre: delante de la grieta, del lado de la
    // cámara y un poco más arriba (alumbra la cara del tronco que se ve)
    this.front = light.position.clone().add(tmpV.copy(eye).sub(this.core).setY(0).normalize().multiplyScalar(0.9));
    this.front.y += 0.8;
    // el resplandor violeta del hueco (crece cuando el tronco se abre)
    const halo = (this.halo = glow(g.textures, VIOLET, 1, 0));
    halo.material.toneMapped = false;
    halo.position.copy(root.worldToLocal(light.position.clone()));
    halo.visible = false;
    root.add(halo);

    // ---- las grietas del piso: salen del pie y corren (de a un tramo por hilo) ----
    const floorY = (x, z) => {
      tmpV.set(x, 0, z).applyMatrix4(root.matrixWorld);
      return w.floorAt(tmpV.x, tmpV.z) - root.position.y + 0.035;
    };
    const strands = [];
    const n = 8;
    for (let k = 0; k < n; k++) {
      let a = (k / n) * Math.PI * 2 + r() * 0.5;
      let px = axis.position.x + Math.cos(a) * (rb + 0.05);
      let pz = axis.position.z + Math.sin(a) * (rb + 0.05);
      let wd = 0.17;
      const m = 6 + Math.floor(r() * 7);
      const segs = [];
      for (let s = 0; s < m; s++) {
        a += (r() - 0.5) * 0.9;
        const nx = px + Math.cos(a) * 0.55;
        const nz = pz + Math.sin(a) * 0.55;
        const y0 = floorY(px, pz);
        const y1 = floorY(nx, nz);
        if (Math.abs(y1 - y0) > 0.3) break;
        const ex = -Math.sin(a) * wd;
        const ez = Math.cos(a) * wd;
        const w2 = wd * 0.84;
        const fx = -Math.sin(a) * w2;
        const fz = Math.cos(a) * w2;
        const v0 = s / m;
        const v1 = (s + 1) / m;
        segs.push([[px - ex, y0, pz - ez, px + ex, y0, pz + ez, nx + fx, y1, nz + fz, px - ex, y0, pz - ez, nx + fx, y1, nz + fz, nx - fx, y1, nz - fz], [0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1]]);
        px = nx;
        pz = nz;
        wd = w2;
      }
      strands.push(segs);
    }
    const P = [];
    const U = [];
    for (let s = 0; strands.some((x) => x.length > s); s++) {
      for (const x of strands) {
        if (!x[s]) continue;
        P.push(...x[s][0]);
        U.push(...x[s][1]);
      }
    }
    const cg = keep(new THREE.BufferGeometry());
    cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    cg.setDrawRange(0, 0);
    this.floorN = P.length / 18;
    this.floorMat = keep(floorCrackMat().clone());
    const floor = (this.floor = new THREE.Mesh(cg, this.floorMat));
    floor.renderOrder = 2;
    floor.frustumCulled = false;
    root.add(floor);

    // ---- las piedras que suben del piso ----
    // (más del lado de la cámara: atrás las tapa el tronco)
    const face = Math.atan2(e.z, e.x);
    this.rocks = [];
    for (let k = 0; k < 14; k++) {
      const a = face + (r() - 0.5) * (k < 10 ? 3.4 : 6.28);
      const d = rb + 0.5 + r() * 2.6;
      const x = axis.position.x + Math.cos(a) * d;
      const z = axis.position.z + Math.sin(a) * d;
      const s = 0.09 + r() * 0.24;
      this.rocks.push({
        x,
        z,
        y: floorY(x, z) - 0.3,
        s: new THREE.Vector3(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.4), s * (0.8 + r() * 0.5)),
        at: SNAP + 0.05 + r() * 2.8,
        h: 0.7 + r() * 2.0,
        ax: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        w: 0.4 + r() * 1.2,
        ph: r() * 6,
      });
    }
    const rock = keep(rockMat());
    this.rockTex = rock.emissiveMap;
    const rm = (this.rockMesh = new THREE.InstancedMesh(keep(new THREE.DodecahedronGeometry(1, 0)), rock, this.rocks.length));
    rm.frustumCulled = false;
    rm.castShadow = true;
    root.add(rm);

    // ---- las astillas de corteza que saltan de la raja (adelante y atrás) ----
    this.chips = [];
    for (let k = 0; k < 30; k++) {
      const front = k % 3 ? 1 : -1;
      const y = 0.25 + r() * (H - 0.4);
      const ph = (r() - 0.5) * 0.9;
      const rr = rb - (rb - rt) * (y / H);
      const dir = new THREE.Vector3(Math.sin(ph), 0, Math.cos(ph) * front);
      const fly = dir.clone().multiplyScalar(0.5 + r() * 1.6);
      fly.y = (r() - 0.25) * 1.3;
      this.chips.push({
        p0: dir.clone().multiplyScalar(rr).setY(y),
        fly,
        // (astillas: largas, finas y en punta)
        s: new THREE.Vector3(0.06 + r() * 0.1, 0.16 + r() * 0.3, 0.02 + r() * 0.03),
        q0: new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(dir.x, dir.z)),
        // (las primeras, cuando se parte; después con cada tirón y algunas sueltas)
        at: SNAP + (k < 9 ? r() * 0.1 : k % 2 ? JOLTS[k % JOLTS.length] + r() * 0.15 : 0.2 + r() * 2.8),
        rise: 0.06 + r() * 0.16,
        ax: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: 1.5 + r() * 3,
      });
    }
    const cm = (this.chipMesh = new THREE.InstancedMesh(keep(new THREE.TetrahedronGeometry(1, 0)), bark, this.chips.length));
    cm.frustumCulled = false;
    cm.castShadow = true;
    axis.add(cm);
    this.pose(0);
    // (los susurros y las piedras de Eclipse: que bajen ya)
    eclSfx(g).load(['piedras-suben', 'dim-susurro-1']);
  }

  // El árbol del mapa por sus pedazos (igual de armado: no se nota).
  swap() {
    if (this.swapped) return;
    this.swapped = true;
    this.tree.visible = false;
    this.root.visible = true;
  }

  start() {
    if (this.on || this.done) return;
    this.swap();
    this.on = true;
    this.T = 0;
    const l = this.light;
    this.light0 = { color: l.color.clone(), pos: l.position.clone() };
    l.color.set(VIOLET);
    this.sound();
  }

  // El corte: queda como está y se calla de una.
  stop() {
    this.on = false;
    this.done = true;
    this.mute();
  }

  mute() {
    const A = this.g.audio;
    if (!this.bus || !A?.ctx) return;
    try {
      this.bus.gain.cancelScheduledValues(A.now);
      this.bus.gain.setTargetAtTime(0, A.now, 0.006);
    } catch {
      /* sin audio */
    }
  }

  // Lo que suena (solo en esta compu), todo por una salida propia para poder
  // cortarlo en seco: el grave que crece, las piedras, el tronco que se raja
  // y cada tirón.
  sound() {
    const A = this.g.audio;
    if (!A?.ctx || !A.tone || !A.noise) return;
    try {
      const bus = (this.bus = A.ctx.createGain());
      bus.connect(A.sfx);
      const o = A.out({ bus, reverb: 0 });
      const t = A.now;
      A.tone(o, { t, dur: LEN + 0.6, freq: 36, freqEnd: 50, gain: 0.6, attack: LEN });
      A.tone(o, { t, dur: LEN + 0.6, type: 'triangle', freq: 72, freqEnd: 99, gain: 0.13, attack: LEN });
      A.noise(o, { t, dur: SNAP + 0.1, type: 'bandpass', freq: 180, freqEnd: 1500, q: 1.4, gain: 0.2, attack: SNAP });
      const E = eclSfx(this.g);
      if (E.buf?.['dim-susurro-1']) A.playBuffer(E.buf['dim-susurro-1'], { gain: 0.5, reverb: 0, bus, when: t + 0.3 });
      if (E.buf?.['piedras-suben']) A.playBuffer(E.buf['piedras-suben'], { gain: 0.95, reverb: 0, bus, when: t + SNAP - 0.5 });
      const crack = (at, k) => {
        for (const d of [0, 0.045, 0.1]) A.noise(o, { t: at + d, dur: 0.035, type: 'highpass', freq: 2600 + d * 9000, gain: 0.9 * k, attack: 0.002 });
        A.tone(o, { t: at, dur: 0.6, freq: 110, freqEnd: 30, gain: 0.95 * k, attack: 0.004 });
        A.noise(o, { t: at, dur: 0.9, freq: 520, freqEnd: 110, gain: 0.8 * k, attack: 0.006, brown: true });
        // la madera que cruje abriéndose
        A.noise(o, { t: at + 0.12, dur: 0.5, type: 'bandpass', freq: 300, freqEnd: 130, q: 9, gain: 0.5 * k, attack: 0.03 });
      };
      crack(t + SNAP, 1);
      JOLTS.forEach((d, i) => crack(t + SNAP + d, 0.55 + i * 0.12));
    } catch {
      /* sin audio */
    }
  }

  update(dt) {
    if (!this.on) return;
    this.T += dt;
    this.pose(this.T);
    const g = this.g;
    const T = this.T;
    // la luz del hueco: violeta, y al partirse el tronco se planta delante de la grieta
    this.light.position.lerpVectors(this.light0.pos, this.front, smooth((T - (SNAP - 0.3)) / 0.6));
    // chispas violetas: en el hueco, y con cada tirón a lo largo de la grieta
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = T < SNAP ? 0.3 : 0.12;
      const p = T < SNAP ? this.light0.pos : tmpV.copy(this.core).setY(this.core.y + (Math.random() - 0.4) * this.H);
      g.fx.sparkle?.(p, [0.75, 0.45, 1], T < SNAP ? 2 : 4, T < SNAP ? 0.3 : 0.7);
    }
    // las sombras van guardadas: que sigan a los pedazos
    this.shadowT -= dt;
    if (this.shadowT <= 0 && g.renderer?.shadowMap?.enabled) {
      this.shadowT = 0.2;
      g.renderer.shadowMap.needsUpdate = true;
      const moon = g.world.moon;
      if (moon?.castShadow && moon.shadow?.map) moon.shadow.needsUpdate = true;
    }
  }

  // Cómo está todo a los T s (nada guarda estado: sale de T).
  pose(T) {
    const x = T - SNAP;
    const H = this.H;
    // tiembla (crece hasta que se parte; después, con cada tirón)
    let jolt = 0;
    let open = 0.03 * e1(x, 0.07) + 0.075 * smooth(x / 3.6);
    for (const d of JOLTS) {
      open += 0.014 * e1(x - d, 0.09);
      if (x >= d) jolt += Math.exp(-(x - d) / 0.25);
    }
    const pre = smooth((T - 0.8) / (SNAP - 0.8));
    const amp = x < 0 ? 0.011 * pre : 0.004 + 0.012 * Math.exp(-x / 0.3) + 0.008 * jolt;
    this.body.position.set(amp * Math.sin(T * 61.3), 0, amp * Math.sin(T * 47.1 + 1));
    this.shake = x < 0 ? 0.1 * pre : 0.3 + 0.7 * Math.exp(-x / 0.3) + 0.5 * jolt;
    this.glow = x < 0 ? (0.9 + 0.7 * Math.sin(T * 4.6) ** 2) * smooth(T / 1.4) + 2.4 * smooth((T - (SNAP - 1)) / 1) : 3.6 + 8 * Math.exp(-x / 0.35) + Math.sin(T * 13) * Math.sin(T * 7.3) + x * 0.5 + 2.5 * jolt;
    // las mitades, en V (una se abre un poco más que la otra)
    for (const side of [1, -1]) {
      const half = this.halves[side];
      half.rotation.z = -side * open * (side > 0 ? 1 : 0.8);
      half.position.x = side * (0.012 * e1(x, 0.07) + open * 0.05);
    }
    // los pedazos del tronco que se sueltan: el del medio se corre y gira; el
    // de arriba sube con sus ramas y se vuelca más
    for (const C of this.chunks) {
      const u = Math.max(0, T - C.at);
      const k = e1(u, 0.45);
      if (C.top) {
        C.grp.position.set(C.side * 0.22 * k, C.y + 0.4 * k + 0.07 * u, 0.05 * k);
        C.grp.rotation.set(0.05 * k, 0, -C.side * 0.15 * k);
      } else {
        C.grp.position.set(C.side * 0.3 * k, C.y + 0.1 * k + 0.03 * u, -0.08 * k);
        C.grp.rotation.set(-0.06 * k, C.side * 0.22 * k, -C.side * 0.1 * k);
      }
    }
    this.heart.emissiveIntensity = 1.7 * e1(x, 0.5) * (0.85 + 0.15 * Math.sin(T * 11));
    // el hueco: el resplandor late y, cuando el tronco se parte por ahí, el
    // agujero ya no está y el resplandor se abre
    if (this.hole) this.hole.visible = x < 0;
    this.halo.visible = T > 0;
    this.halo.scale.setScalar(x < 0 ? 0.7 + 0.5 * smooth(T / 1.2) + 0.25 * Math.sin(T * 4.6) ** 2 : 1.8 + 3.4 * Math.exp(-x / 0.25) + 0.8 * jolt + 0.15 * Math.sin(T * 13));
    this.halo.material.opacity = x < 0 ? 0.55 * smooth(T / 1.2) : 0.2 + 0.6 * Math.exp(-x / 0.25) + 0.15 * jolt;
    // la raja fina crece desde el hueco y se va cuando el tronco se abre
    const hk = smooth((T - 0.5) / (SNAP - 0.7));
    const hy = H * 0.45;
    const cy = hy + (H / 2 - hy) * hk;
    this.hair.visible = T > 0.5 && x < 0.6;
    this.hair.scale.y = Math.max(0.001, hk);
    this.hair.position.set(0, cy, this.hairZ(cy));
    this.hairMat.opacity = 0.95 * smooth((T - 0.5) / 0.6) * (0.7 + 0.3 * Math.sin(T * 9)) * (1 - e1(x, 0.15));
    const lit = e1(x, 0.12);
    for (const s of this.sheets) {
      s.visible = x > 0;
      s.scale.x = 0.55 + open * 6;
    }
    this.sheetMat.opacity = lit * (0.85 + 0.15 * Math.sin(T * 17));
    // las sogas
    for (const R of this.ropes) {
      const k = smooth((T - R.t0) / 3.6);
      R.knot.quaternion.copy(R.q0).premultiply(tmpQ.setFromAxisAngle(R.ax, R.amp * k + 0.14 * k * Math.sin(T * 2.3 + R.ph)));
    }
    // lo que se suelta
    for (const L of this.loose) {
      const u = T - L.at;
      if (u <= 0) {
        L.m.position.copy(L.p0);
        L.m.quaternion.copy(L.q0);
        continue;
      }
      const k = e1(u, 1.5);
      L.m.position.copy(L.p0).addScaledVector(L.fly, k);
      L.m.position.y += L.rise * u;
      L.m.quaternion.copy(L.q0).premultiply(tmpQ.setFromAxisAngle(L.ax, L.spin * k + L.slow * u));
    }
    // las grietas del piso
    this.floor.geometry.setDrawRange(0, 6 * Math.round(this.floorN * smooth(x / 3)));
    this.floorMat.opacity = 0.75 + 0.25 * Math.sin(T * 8);
    // las piedras
    this.rocks.forEach((R, i) => {
      const u = T - R.at;
      if (u <= 0) tmpM.makeScale(0, 0, 0);
      else {
        tmpV.set(R.x, R.y + (R.h + 0.3) * e1(u, 1.2) + 0.05 * Math.sin(T * 1.7 + R.ph), R.z);
        tmpM.compose(tmpV, tmpQ.setFromAxisAngle(R.ax, R.ph + R.w * u), tmpS.copy(R.s).multiplyScalar(smooth(u / 0.3)));
      }
      this.rockMesh.setMatrixAt(i, tmpM);
    });
    this.rockMesh.instanceMatrix.needsUpdate = true;
    // las astillas
    this.chips.forEach((C, i) => {
      const u = T - C.at;
      if (u <= 0) tmpM.makeScale(0, 0, 0);
      else {
        tmpV.copy(C.p0).addScaledVector(C.fly, e1(u, 0.4));
        tmpV.y += C.rise * u;
        const k = e1(u, 0.9);
        tmpM.compose(tmpV, tmpQ.setFromAxisAngle(C.ax, C.spin * k + 0.3 * u).multiply(C.q0), u < 0.05 ? tmpS.copy(C.s).multiplyScalar(u / 0.05) : C.s);
      }
      this.chipMesh.setMatrixAt(i, tmpM);
    });
    this.chipMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.on = false;
    this.mute();
    const bus = this.bus;
    if (bus) setTimeout(() => bus.disconnect(), 300);
    this.bus = null;
    if (this.light0) {
      this.light.color.copy(this.light0.color);
      this.light.position.copy(this.light0.pos);
    }
    this.tree.visible = true;
    if (this.hole) this.hole.visible = true;
    this.halo.material.dispose();
    this.root.removeFromParent();
    this.rockMesh.dispose?.();
    this.chipMesh.dispose?.();
    // (las texturas de la grieta y de la madera son de world/eclipse/centro: quedan)
    this.rockTex.dispose();
    for (const x of this.own) x.dispose();
  }
}
