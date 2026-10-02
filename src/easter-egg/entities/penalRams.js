import * as THREE from 'three';
import { mesh, boxGeo, cylGeo } from '../world/props';

// Lo que se ve y se oye de las embestidas en el río del penal (entities/PenalBoat.js):
// los botes de los muertos (un solo modelo compartido: se clonan y al hundirse
// se sacan de la escena sin dejar nada colgado), las astillas que vuelan, el
// casco del bote de los jugadores roto (grietas, astillas, agua adentro y humo),
// la barrita del casco en el HUD, el crujido del golpe, las burbujas y el negro
// cuando el bote se hunde.

const WATER = -0.55;
const DECK = -0.4;
const EDECK = -0.42;
// las grietas del casco: [lado, z], en el orden en que aparecen
const CRACKS = [[1, 0.9], [-1, -0.5], [1, -1.6], [-1, 1.5], [1, 0.1], [-1, -1.9], [-1, 0.5], [1, 1.9]];
const NSPL = 80;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const dummy = new THREE.Object3D();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const P_DRIP = { color: [0.55, 0.65, 0.62], size: 0.04, size1: 0.02, life: 0.5, alpha: 0.7, gravity: 9 };
const P_EMBER = { color: [1, 0.45, 0.15], size: 0.03, size1: 0, life: 0.6, gravity: -0.5 };
const P_SCUM = { color: [0.72, 0.78, 0.74], size: 0.05, size1: 0.14, life: 1.3, alpha: 0.45 };
const P_SMOKE = { color: [0.3, 0.28, 0.26], size: 0.3, size1: 1.7, life: 2.6, alpha: 0.38, drag: 0.5, gravity: -0.35 };
const P_BUBS = { color: [0.8, 0.9, 0.9], size: 0.07, size1: 0.1, life: 0.6, alpha: 0.6, gravity: -0.5 };
// Los ruidos (versiones, segundos, cómo se arman: this es audio sobre el
// contexto de horneado, d la salida, t el arranque).
const BAKED = new WeakSet();
const BAKE = {
  crunch: [3, 1, function (d, t) {
    this.tone(d, { t, dur: 0.5, type: 'sine', freq: 88, freqEnd: 30, gain: 0.95, attack: 0.002 });
    this.noise(d, { t, dur: 0.32, freq: 450, freqEnd: 110, gain: 0.95, brown: true, attack: 0.002 });
    this.noise(d, { t, dur: 0.42, type: 'bandpass', freq: 700, freqEnd: 230, q: 1.6, gain: 0.85 });
    for (let i = 0; i < 8; i++) this.noise(d, { t: t + 0.01 + i * 0.028 + Math.random() * 0.02, dur: 0.04 + Math.random() * 0.05, type: 'bandpass', freq: 1300 + Math.random() * 2400, q: 3, gain: 0.55 });
    this.tone(d, { t: t + 0.1, dur: 0.55, type: 'sawtooth', freq: 150, freqEnd: 92, gain: 0.06 });
    this.noise(d, { t: t + 0.07, dur: 0.8, freq: 1800, freqEnd: 260, gain: 0.6 });
  }],
  sink: [2, 1.9, function (d, t) {
    this.noise(d, { t, dur: 1.6, freq: 500, freqEnd: 120, gain: 0.7, brown: true, attack: 0.1 });
    this.noise(d, { t: t + 0.2, dur: 0.6, type: 'bandpass', freq: 380, freqEnd: 200, q: 1.5, gain: 0.5 });
    this.tone(d, { t: t + 0.1, dur: 1.2, type: 'sawtooth', freq: 120, freqEnd: 70, gain: 0.05 });
    for (let i = 0; i < 8; i++) {
      const f = 200 + Math.random() * 300;
      this.tone(d, { t: t + 0.2 + Math.random() * 1.4, dur: 0.07, freq: f, freqEnd: f * (2 + Math.random()), gain: 0.35 });
    }
  }],
  whoosh: [2, 1.4, function (d, t) {
    this.noise(d, { t, dur: 1.2, type: 'bandpass', freq: 350, freqEnd: 1100, q: 0.9, gain: 0.6, attack: 0.6 });
    this.noise(d, { t, dur: 1.3, freq: 300, freqEnd: 600, gain: 0.5, brown: true, attack: 0.5 });
  }],
  bubbles: [2, 1.6, function (d, t) {
    for (let i = 0; i < 10; i++) {
      const f = 200 + Math.random() * 300;
      this.tone(d, { t: t + Math.random() * 1.4, dur: 0.07, freq: f, freqEnd: f * (2 + Math.random()), gain: 0.4 });
    }
  }],
  splash: [2, 0.7, function (d, t) {
    this.noise(d, { t, dur: 0.5, freq: 900, freqEnd: 200, gain: 0.8, attack: 0.01 });
    this.noise(d, { t: t + 0.04, dur: 0.5, freq: 600, freqEnd: 150, gain: 0.4, brown: true });
  }],
};

// (la barrita va adentro del cartel del bote: .mdu-craft; Hud.layout corre la
// lista del equipo debajo. Sin <i>: con <i> y sin <b> el cartel pasa a lista de Tab)
const CSS = `
.mdu-craft:has(.mdu-hull){flex-wrap:wrap;justify-content:flex-end;max-width:380px}
.mdu-craft .mdu-hull{flex-basis:100%;display:flex;justify-content:flex-end;align-items:center;gap:9px;margin-top:2px;font:700 12px/1 'Stardos Stencil','Special Elite',serif;font-style:normal;letter-spacing:.12em;text-transform:uppercase;color:#d8e6ec;text-shadow:0 1px 2px #000,0 0 8px rgba(0,0,0,.8)}
.mdu-craft .mdu-hull span{font:inherit;color:inherit;margin:0}
.mdu-craft .mdu-hull u{position:relative;display:block;width:150px;height:10px;text-decoration:none;border:1px solid rgba(216,230,236,.6);background:rgba(4,10,14,.65);box-shadow:0 0 10px rgba(0,0,0,.6);overflow:hidden}
.mdu-craft .mdu-hull s{position:absolute;left:0;top:0;bottom:0;text-decoration:none;background:linear-gradient(90deg,#5a3a1c,#c8945a)}
.mdu-craft .mdu-hull u::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 24px,rgba(0,0,0,.45) 24px 25px)}
.mdu-craft .mdu-hull.is-low s{background:linear-gradient(90deg,#7a140c,#ff5a36);animation:mdu-hull-low .5s infinite alternate}
.mdu-craft .mdu-hull.is-low{color:#ffb0a0}
.mdu-craft .mdu-hull.is-hit{animation:mdu-hull-hit .4s}
@keyframes mdu-hull-hit{15%{transform:translate(-6px,1px)}40%{transform:translate(5px,-1px)}65%{transform:translate(-3px,0)}}
@keyframes mdu-hull-low{to{opacity:.5}}
`;

// La grieta: un boquete con astillas de madera fresca a lo largo de la veta
// (horizontal: las tablas van a lo largo del bote), rajaduras finas y un poco
// de mugre alrededor (transparente afuera, sin borde de calcomanía).
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  const cx = 128;
  const cy = 64;
  const R = Math.random;
  // la mugre y la humedad alrededor del golpe
  const gr = x.createRadialGradient(cx, cy, 10, cx, cy, 70);
  gr.addColorStop(0, 'rgba(10,6,3,0.55)');
  gr.addColorStop(1, 'rgba(10,6,3,0)');
  x.save();
  x.scale(1.7, 1);
  x.fillStyle = gr;
  x.fillRect(0, 0, 256 / 1.7, 128);
  x.restore();
  // rajaduras a lo largo de la veta
  x.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    let px = cx + side * (30 + R() * 10);
    let py = cy + (R() - 0.5) * 30;
    let a = (side > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.4;
    x.strokeStyle = 'rgba(12,8,4,0.9)';
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) {
      a += (R() - 0.5) * 0.35;
      px += Math.cos(a) * (8 + R() * 9);
      py += Math.sin(a) * (2 + R() * 3);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // astillas: agujas de madera clara (y alguna oscura) que salen del boquete
  for (let i = 0; i < 34; i++) {
    const a = R() * Math.PI * 2;
    const ex = cx + Math.cos(a) * 34;
    const ey = cy + Math.sin(a) * 15;
    const dir = Math.cos(a) >= 0 ? 1 : -1;
    const len = 12 + R() * 34;
    const w = 1.5 + R() * 3.5;
    const tilt = (R() - 0.5) * 0.5 + Math.sin(a) * 0.35;
    x.fillStyle = R() < 0.75 ? `rgba(${200 + R() * 40 | 0},${150 + R() * 40 | 0},${90 + R() * 30 | 0},0.95)` : 'rgba(110,72,36,0.95)';
    x.beginPath();
    x.moveTo(ex - dir * 6, ey - w);
    x.lineTo(ex + dir * len * Math.cos(tilt), ey + len * Math.sin(tilt));
    x.lineTo(ex - dir * 6, ey + w);
    x.closePath();
    x.fill();
  }
  // el boquete: negro, desparejo y con dientes a lo largo de la veta
  x.fillStyle = '#070402';
  x.beginPath();
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2;
    const tooth = k % 3 === 0 ? 1.2 + R() * 0.35 : 0.72 + R() * 0.22;
    x.lineTo(cx + Math.cos(a) * 38 * tooth, cy + Math.sin(a) * 17 * (0.8 + R() * 0.3));
  }
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class RamFx {
  constructor(game, boat) {
    this.g = game;
    this.boat = boat;
    this.M = game.world.M;
    this.frac = 1;
    this.shown = -1;
    this.smokeT = 0;
    this.buildEnemy();
    this.buildSplinters();
    this.buildDamage();
    this.buildHud();
    this.bakeAll();
  }

  // ---------------- los botes de los muertos ----------------
  // Casco podrido con cuadernas, un espolón de hierro con púas en la proa, una
  // calavera de vaca de mascarón, algas, un trapo negro y el farol verde.
  buildEnemy() {
    const M = this.M;
    const rot = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.95 });
    const rib = new THREE.MeshStandardMaterial({ color: 0x17130c, roughness: 1 });
    const weed = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 1 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.75 });
    const rag = new THREE.MeshStandardMaterial({ color: 0x110e0b, roughness: 1, side: THREE.DoubleSide });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6aff5a).multiplyScalar(2.2), toneMapped: false });
    const iron = M.iron || rib;
    const bowGeo = new THREE.ConeGeometry(0.85, 1.2, 4, 1);
    const ramGeo = new THREE.ConeGeometry(0.2, 1.05, 6, 1);
    const spikeGeo = new THREE.ConeGeometry(0.045, 0.32, 4, 1);
    const skullGeo = new THREE.SphereGeometry(0.17, 10, 8);
    const hornGeo = new THREE.ConeGeometry(0.05, 0.42, 5, 1);
    const lampGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const ragGeo = new THREE.PlaneGeometry(0.55, 0.4, 3, 2);
    // el trapo, roto y caído
    const rp = ragGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setZ(i, Math.sin(rp.getX(i) * 7) * 0.05 + (rp.getY(i) < 0 ? (Math.random() - 0.5) * 0.08 : 0));
    ragGeo.computeVertexNormals();
    this.eMats = [rot, rib, weed, bone, rag, lampMat];
    this.eGeos = [bowGeo, ramGeo, spikeGeo, skullGeo, hornGeo, lampGeo, ragGeo];
    const g = new THREE.Group();
    g.name = 'zboat';
    g.rotation.order = 'YXZ';
    g.add(mesh(boxGeo(1.5, 0.08, 3.8), rot, 0, EDECK - 0.05, 0));
    for (const s of [-1, 1]) {
      g.add(mesh(boxGeo(0.06, 0.5, 3.8), rot, s * 0.78, EDECK + 0.2, 0, 0, 0, s * 0.18));
      g.add(mesh(boxGeo(0.09, 0.07, 3.8), rib, s * 0.86, EDECK + 0.46, 0));
    }
    for (const z of [-1.1, 0, 1.1]) g.add(mesh(boxGeo(1.5, 0.06, 0.1), rib, 0, EDECK + 0.05, z));
    g.add(mesh(boxGeo(1.6, 0.5, 0.06), rot, 0, EDECK + 0.2, -1.9));
    const bow = new THREE.Mesh(bowGeo, rot);
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
    bow.scale.set(1, 1, 0.5);
    bow.position.set(0, EDECK + 0.2, 2.4);
    g.add(bow);
    // el espolón: hierro en la línea del agua, con zunchos y púas
    const ram = new THREE.Mesh(ramGeo, iron);
    ram.rotation.set(Math.PI / 2, 0, 0);
    ram.scale.set(1, 1, 0.7);
    ram.position.set(0, EDECK - 0.02, 3.15);
    g.add(ram);
    for (const z of [2.55, 2.85]) g.add(mesh(boxGeo(0.5 - (z - 2.55), 0.05, 0.06), iron, 0, EDECK + 0.02, z));
    for (const [sx, sy] of [[-0.18, 0.12], [0.18, 0.12], [0, 0.3]]) {
      const sp = new THREE.Mesh(spikeGeo, iron);
      sp.rotation.set(Math.PI / 2 - sy * 0.6, 0, -sx * 1.4);
      sp.position.set(sx, EDECK + sy, 2.95);
      g.add(sp);
    }
    // la calavera de vaca en la proa
    const skull = new THREE.Mesh(skullGeo, bone);
    skull.scale.set(0.85, 0.75, 1.25);
    skull.position.set(0, EDECK + 0.62, 2.45);
    g.add(skull);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(hornGeo, bone);
      h.rotation.set(0.3, 0, -s * 1.15);
      h.position.set(s * 0.26, EDECK + 0.72, 2.4);
      g.add(h);
    }
    for (let i = 0; i < 6; i++) g.add(mesh(boxGeo(0.04, 0.35, 0.02), weed, (i % 2 ? 1 : -1) * 0.86, EDECK - 0.02, -1.5 + i * 0.6, 0, 0, (i % 2 ? 1 : -1) * 0.2));
    // el palo con el farol y el trapo
    g.add(mesh(cylGeo(0.02, 0.02, 1.4, 5), M.woodDark, 0, EDECK + 0.9, 1.6));
    const flag = new THREE.Mesh(ragGeo, rag);
    flag.position.set(0, EDECK + 1.3, 1.32);
    flag.rotation.y = Math.PI / 2;
    g.add(flag);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.name = 'lamp';
    lamp.position.set(0, EDECK + 1.65, 1.6);
    g.add(lamp);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    lamp.castShadow = false;
    // el resplandor verde del farol (de noche es lo que se ve de lejos)
    const dot = this.g.textures?.dot || this.g.world.T?.dot;
    if (dot) {
      this.haloMat = new THREE.SpriteMaterial({ map: dot, color: 0x5aff6a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Sprite(this.haloMat);
      halo.name = 'halo';
      halo.position.copy(lamp.position);
      halo.scale.setScalar(1.7);
      g.add(halo);
    }
    this.eTpl = g;
  }

  // Un bote nuevo (comparte geometría y materiales con el modelo).
  enemyMesh() {
    const m = this.eTpl.clone(true);
    m.rotation.order = 'YXZ';
    this.boat.root.add(m);
    return m;
  }

  // ---------------- astillas ----------------
  buildSplinters() {
    const geo = new THREE.BoxGeometry(0.05, 0.035, 0.42);
    const m = new THREE.InstancedMesh(geo, this.M.wood, NSPL);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    for (let i = 0; i < NSPL; i++) m.setMatrixAt(i, ZERO);
    this.boat.root.add(m);
    this.spl = { mesh: m, geo, p: new Float32Array(NSPL * 3), v: new Float32Array(NSPL * 3), r: new Float32Array(NSPL * 3), w: new Float32Array(NSPL * 3), s: new Float32Array(NSPL), life: new Float32Array(NSPL), next: 0, alive: 0 };
  }

  // n astillas desde p, para el lado (dx, dz), con tamaño `big`.
  splinters(p, dx, dz, n, big = 1, up = 3) {
    const S = this.spl;
    for (let k = 0; k < n; k++) {
      const i = S.next;
      S.next = (S.next + 1) % NSPL;
      const j = i * 3;
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 2.2;
      const sp = 1.5 + Math.random() * 3.5;
      S.p[j] = p.x + (Math.random() - 0.5) * 0.4;
      S.p[j + 1] = p.y + Math.random() * 0.3;
      S.p[j + 2] = p.z + (Math.random() - 0.5) * 0.4;
      S.v[j] = Math.sin(a) * sp;
      S.v[j + 1] = up * (0.5 + Math.random());
      S.v[j + 2] = Math.cos(a) * sp;
      for (let q = 0; q < 3; q++) {
        S.r[j + q] = Math.random() * 6;
        S.w[j + q] = (Math.random() - 0.5) * 18;
      }
      S.s[i] = big * (0.5 + Math.random() * 0.9);
      S.life[i] = 4 + Math.random() * 3;
    }
    S.alive = Math.max(S.alive, 8);
  }

  updateSplinters(dt) {
    const S = this.spl;
    if (!S.alive) return;
    let any = false;
    for (let i = 0; i < NSPL; i++) {
      if (S.life[i] <= 0) continue;
      const j = i * 3;
      S.life[i] -= dt;
      if (S.life[i] <= 0) {
        S.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      any = true;
      const fl = S.p[j + 1] <= WATER + 0.03;
      if (!fl) {
        S.v[j + 1] -= 9.8 * dt;
        for (let q = 0; q < 3; q++) S.r[j + q] += S.w[j + q] * dt;
      } else {
        // flota: se frena, se acuesta y al final se hunde
        const k = Math.exp(-2.5 * dt);
        S.v[j] *= k;
        S.v[j + 2] *= k;
        S.v[j + 1] = S.life[i] < 1.2 ? -0.25 : 0;
        S.r[j] += (0 - S.r[j]) * Math.min(1, dt * 3);
        S.r[j + 2] += (0 - S.r[j + 2]) * Math.min(1, dt * 3);
      }
      S.p[j] += S.v[j] * dt;
      S.p[j + 1] = Math.max(fl && S.life[i] < 1.2 ? -5 : WATER + 0.02, S.p[j + 1] + S.v[j + 1] * dt);
      dummy.position.set(S.p[j], S.p[j + 1], S.p[j + 2]);
      dummy.rotation.set(S.r[j], S.r[j + 1], S.r[j + 2]);
      dummy.scale.setScalar(S.s[i] * Math.min(1, S.life[i] * 1.5));
      dummy.updateMatrix();
      S.mesh.setMatrixAt(i, dummy.matrix);
    }
    S.mesh.count = any ? NSPL : 0;
    S.mesh.instanceMatrix.needsUpdate = true;
    if (!any) S.alive = 0;
  }

  // ---------------- el casco de los jugadores, roto ----------------
  buildDamage() {
    const body = this.boat.body;
    const tex = crackTexture();
    this.crackTex = tex;
    this.crackMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.crackGeo = new THREE.PlaneGeometry(0.98, 0.5);
    this.cracks = [];
    for (const [s, z] of CRACKS) {
      const grp = new THREE.Group();
      // por fuera (el casco se abre hacia afuera) y por dentro
      const out = new THREE.Group();
      out.position.set(s * 1.095, DECK + 0.24, z);
      out.rotation.z = s * 0.14;
      const po = new THREE.Mesh(this.crackGeo, this.crackMat);
      po.rotation.y = s * Math.PI / 2;
      out.add(po);
      grp.add(out);
      const pi = new THREE.Mesh(this.crackGeo, this.crackMat);
      pi.position.set(s * 0.955, DECK + 0.24, z);
      pi.rotation.y = -s * Math.PI / 2;
      grp.add(pi);
      // astillas que asoman para afuera
      for (let k = 0; k < 4; k++) {
        const sp = mesh(boxGeo(0.03, 0.03, 0.3 + Math.random() * 0.2), k % 2 ? this.M.wood : this.M.woodDark, s * (1.1 + Math.random() * 0.05), DECK + 0.16 + Math.random() * 0.16, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.9, s * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6);
        sp.castShadow = false;
        grp.add(sp);
      }
      grp.visible = false;
      body.add(grp);
      this.cracks.push({ grp, s, z });
    }
    // el agua que entra
    this.bilgeMat = new THREE.MeshStandardMaterial({ color: 0x3a6052, roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.86, depthWrite: false });
    this.bilgeGeo = new THREE.PlaneGeometry(1.84, 4.7).rotateX(-Math.PI / 2);
    this.bilge = new THREE.Mesh(this.bilgeGeo, this.bilgeMat);
    this.bilge.position.set(0, DECK + 0.01, -0.1);
    this.bilge.visible = false;
    this.bilge.renderOrder = 3;
    body.add(this.bilge);
  }

  // f: lo que le queda al casco (0..1); sink: hundiéndose (0..1).
  setHull(f, sink = 0) {
    this.frac = f;
    const dmg = 1 - f;
    const n = Math.min(this.cracks.length, Math.floor(dmg * (this.cracks.length + 1.2)));
    if (n !== this.shown) {
      this.shown = n;
      this.cracks.forEach((c, i) => (c.grp.visible = i < n));
    }
    const lvl = Math.max(0, dmg - 0.12) * 0.32 + sink * 0.3;
    this.bilge.visible = lvl > 0.005;
    this.bilge.position.y = DECK + 0.01 + lvl;
  }

  // Cada cuadro: astillas, el agua que entra por las grietas y el humo del casco destrozado.
  update(dt, t, on) {
    this.updateSplinters(dt);
    const B = this.boat;
    const fx = this.g.fx;
    if (!on || !fx) return;
    const f = this.frac;
    if (this.bilge.visible) this.bilge.rotation.z = Math.sin(t * 2.3) * 0.02;
    // chorritos por las grietas (de adentro)
    if (f < 0.75 && this.shown > 0 && Math.random() < dt * (6 + (1 - f) * 18)) {
      const c = this.cracks[Math.floor(Math.random() * this.shown)];
      tmpV.set(c.s * 0.9, DECK + 0.26, c.z + (Math.random() - 0.5) * 0.3);
      B.body.localToWorld(tmpV);
      tmpW.set(-c.s, 0, 0).applyQuaternion(B.boat.quaternion);
      fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, tmpW.x * 1.4, 0.3 + Math.random() * 0.5, tmpW.z * 1.4, P_DRIP);
    }
    // espuma sucia flotando en el agua que entró
    if (this.bilge.visible && Math.random() < dt * 10) {
      tmpV.set((Math.random() - 0.5) * 1.6, this.bilge.position.y + 0.015, -0.1 + (Math.random() - 0.5) * 4.2);
      B.body.localToWorld(tmpV);
      fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, 0, 0.02, 0, P_SCUM);
    }
    // humo negro con el casco a la miseria
    if (f < 0.38) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.06 + f * 0.25;
        tmpV.set((Math.random() - 0.5) * 1.4, DECK + 0.35, -0.6 + (Math.random() - 0.5) * 3);
        B.body.localToWorld(tmpV);
        fx.alpha.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.7, (Math.random() - 0.5) * 0.4, P_SMOKE);
        if (Math.random() < 0.3) fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, P_EMBER);
      }
    }
  }

  // ---------------- el golpe ----------------
  // En (x, z) sobre el casco, de un bote que venía para (dx, dz); k: qué tan fuerte.
  // near: el que mira va arriba del bote (se siente adentro).
  ramFx(x, z, dx, dz, k, near) {
    const g = this.g;
    const fx = g.fx;
    tmpV.set(x, DECK + 0.35, z);
    this.splinters(tmpV, dx, dz, Math.round(10 + 8 * k), 1, 3.2);
    this.splinters(tmpV, -dx, -dz, 4, 0.7, 2);
    if (g.water?.splash) g.water.splash(x, z, 0.8 + 0.2 * k, { sound: false });
    // la pared de agua y la espuma del choque
    for (let i = 0; i < 26; i++) {
      const a = Math.atan2(dx, dz) + Math.PI / 2 * (i % 2 ? 1 : -1) + (Math.random() - 0.5) * 1.4;
      const s = 1 + Math.random() * 2.5;
      fx.alpha.spawn(x, WATER + 0.1, z, Math.sin(a) * s, 2.5 + Math.random() * 3.5 * k, Math.cos(a) * s, { color: [0.82, 0.88, 0.9], size: 0.08 + Math.random() * 0.1, size1: 0.03, life: 0.7 + Math.random() * 0.5, alpha: 0.75, gravity: 9.8 });
    }
    for (let i = 0; i < 6; i++) fx.alpha.spawn(x, WATER + 0.2, z, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5, { color: [0.55, 0.6, 0.62], size: 0.25, size1: 0.9, life: 0.9, alpha: 0.12, drag: 1.4, gravity: -0.2 });
    fx.dust(tmpV, { x: 0, y: 1, z: 0 }, [0.45, 0.36, 0.24], 8);
    g.water?.ripple?.(x, z, 1, 1.6);
    this.crunch(tmpV, k, near);
    if (near) {
      fx.addShake(0.55 + 0.35 * k);
      g.post?.flash?.(0.12);
    } else {
      const cp = g.camera.position;
      const d = Math.hypot(cp.x - x, cp.z - z);
      if (d < 18) fx.addShake(0.25 * (1 - d / 18));
    }
    this.hit();
  }

  // El bote de los muertos sale de abajo del agua (del vapor hundido).
  riseFx(p) {
    const g = this.g;
    if (g.water?.splash) g.water.splash(p.x, p.z, 0.9, { sound: false });
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2;
      g.fx.add.spawn(p.x + Math.cos(a) * r * 0.6, WATER + 0.05, p.z + Math.sin(a) * r, 0, 0.6 + Math.random() * 1.5, 0, { color: [0.35, 0.9, 0.45], size: 0.06, size1: 0, life: 1 + Math.random(), alpha: 0.7, gravity: -0.3 });
    }
    this.bubbles(p, 10);
  }

  // Se hunde: tablones que quedan flotando, burbujas, un salpicón y el gluglú.
  sinkFx(b) {
    const g = this.g;
    tmpV.set(b.pos.x, WATER + 0.2, b.pos.z);
    this.splinters(tmpV, Math.sin(b.yaw), Math.cos(b.yaw), 6, 2.2, 1.2);
    this.splinters(tmpV, -Math.sin(b.yaw), -Math.cos(b.yaw), 4, 1.6, 1);
    if (g.water?.splash) g.water.splash(b.pos.x, b.pos.z, 0.8, { sound: false });
    this.bubbles(b.pos, 14);
    this.play('sink', tmpV, 0.9, 5, 0.3);
  }

  // Burbujas que suben (y su gluglú, como mucho uno cada tanto).
  bubbles(p, n) {
    const g = this.g;
    for (let i = 0; i < n * 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      g.fx.alpha.spawn(p.x + Math.cos(a) * r, WATER + 0.02, p.z + Math.sin(a) * r, 0, 0.4 + Math.random() * 0.6, 0, P_BUBS);
    }
    const now = g.time || 0;
    if (now - (this.bubT || -9) < 0.7) return;
    this.bubT = now;
    this.play('bubbles', tmpW.set(p.x, WATER, p.z), 0.5, 4, 0.15);
  }

  // El bote de los muertos arranca a embestir: el agua que corta.
  whoosh(p) {
    this.play('whoosh', tmpW.set(p.x, WATER + 0.3, p.z), 0.8, 4, 0.2);
  }

  // El crujido de madera contra madera: golpe sordo, astillas y el agua.
  crunch(p, k = 1, near = false) {
    this.play('crunch', near ? null : p, (near ? 0.85 : 1.1) * Math.min(1.2, 0.6 + k * 0.45), 6, 0.3);
  }

  // Un chapuzón (uno que se cae del bote).
  splashSnd(p) {
    this.play('splash', tmpW.set(p.x, WATER, p.z), 0.6, 2.2, 0.2);
  }

  // ---------------- los ruidos, horneados ----------------
  // Cada ruido se hornea una vez (audio.bakeSound, varias tomas) y cada golpe
  // toca un buffer: armar ruido y filtros en cada embestida cargaba el hilo de
  // audio en las compus flojas. Mientras no terminó de hornearse, la misma
  // receta suena en vivo.
  bakeAll() {
    const A = this.g.audio;
    if (!A?.ctx || !A.bakeSound || BAKED.has(A)) return;
    BAKED.add(A);
    for (const key of Object.keys(BAKE)) A.bakeSound('boat-' + key, BAKE[key][1], BAKE[key][2], BAKE[key][0]);
  }

  play(key, pos, gain, ref = 4, reverb = 0.2) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    this.bakeAll();
    const buf = A.bakedBuf?.('boat-' + key);
    if (buf) A.playBuffer(buf, { pos, gain, reverb, ref, rate: 0.92 + Math.random() * 0.16 });
    else BAKE[key][2].call(A, A.out({ pos, gain, reverb, ref }), A.now);
  }

  // ---------------- el HUD y el negro ----------------
  buildHud() {
    if (document.getElementById('mdu-hull-css')) return;
    const st = document.createElement('style');
    st.id = 'mdu-hull-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // La barrita del casco (f: 0..1) para el cartel del bote (PenalBoat.hudText).
  barHtml(f) {
    const hit = (this.g.time || 0) - (this.hitT ?? -9) < 0.45;
    return `<em class="mdu-hull${f < 0.34 ? ' is-low' : ''}${hit ? ' is-hit' : ''}"><span>Casco</span><u><s style="width:${Math.round(f * 100)}%"></s></u></em>`;
  }

  hit() {
    this.hitT = this.g.time || 0;
  }

  // Negro de pantalla completa que entra o sale (el bote se hunde).
  black(on, secs) {
    const g = this.g;
    if (!this.blackEl) {
      const el = document.createElement('i');
      el.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:60;transition:none';
      this.blackEl = el;
    }
    const el = this.blackEl;
    if (!el.isConnected) (g.root || document.body).appendChild(el);
    void el.offsetWidth;
    el.style.transition = `opacity ${secs}s`;
    el.style.opacity = on ? '1' : '0';
    this.blackOn = on;
  }

  dispose() {
    this.blackEl?.remove();
    this.spl.mesh.removeFromParent();
    this.spl.geo.dispose();
    this.spl.mesh.dispose?.();
    for (const m of this.eMats) m.dispose();
    this.haloMat?.dispose();
    for (const g of this.eGeos) g.dispose();
    this.crackMat.dispose();
    this.crackTex.dispose();
    this.crackGeo.dispose();
    this.bilgeMat.dispose();
    this.bilgeGeo.dispose();
  }
}
