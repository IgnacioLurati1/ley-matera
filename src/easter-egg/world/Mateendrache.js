import * as THREE from 'three';

// El Mateendrache: el dragón de piedra y yerba que duerme encadenado abajo
// del castillo. Escamas de piedra verde con yerba entre las juntas, el pecho
// que brilla como brasas bajo las escamas, dos bombillas de plata por
// cuernos, bigote de gaucho, alas de poncho con guarda pampa y un penacho de
// hojas de yerba en la punta de la cola. Escupe fuego (fx/DragonFire.js) y,
// como una pava, cuando se enoja silba.
//
// El lomo es una cadena de segmentos que sigue una curva calculada cada
// cuadro según la pose ('sleep' enroscado en el piso, 'stand' parado, 'fly'
// volando), así pasa de una a otra de a poco. Las patas se acomodan solas
// (dos huesos, hasta el piso) y las alas son una membrana que se rearma entre
// los dedos. Mira hacia +z; el origen es el centro del cuerpo, a la altura
// del piso.

const N = 30;
const SP = 0.56;
const NECK = 8;
const HIP = 17;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// El grosor del cuerpo en cada segmento (0 la nuca, N-1 la punta de la cola).
function radius(i) {
  if (i < NECK) return 0.42 + (i / NECK) * 0.38;
  if (i < HIP) {
    const k = (i - NECK) / (HIP - NECK);
    return 0.82 + Math.sin(k * Math.PI) * 0.45;
  }
  const k = (i - HIP) / (N - 1 - HIP);
  return 0.85 * (1 - k) ** 1.25 + 0.08;
}

// ---------------- texturas ----------------
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Escamas de piedra verde en hileras, con yerba entre las juntas.
function scaleTex() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#28301f';
    x.fillRect(0, 0, w, h);
    const s = 32;
    for (let row = 0; row < h / (s * 0.55) + 2; row++) {
      for (let col = -1; col < w / s + 1; col++) {
        const cx = col * s + (row % 2) * s * 0.5;
        const cy = row * s * 0.55;
        const g = x.createRadialGradient(cx, cy - s * 0.1, 2, cx, cy, s * 0.62);
        const v = 0.85 + ((row * 7 + col * 13) % 5) * 0.05;
        g.addColorStop(0, `rgb(${Math.round(112 * v)},${Math.round(128 * v)},${Math.round(96 * v)})`);
        g.addColorStop(0.7, `rgb(${Math.round(72 * v)},${Math.round(86 * v)},${Math.round(62 * v)})`);
        g.addColorStop(1, '#1a2014');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(cx, cy, s * 0.52, s * 0.5, 0, 0, Math.PI);
        x.fill();
      }
    }
    // yerba en las juntas
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(${120 + Math.random() * 60},${150 + Math.random() * 50},${50 + Math.random() * 30},${0.25 + Math.random() * 0.3})`;
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
    }
  });
}

// Las placas de la panza: color hueso, en franjas.
function bellyTex() {
  return canvas(64, 128, (x, w, h) => {
    x.fillStyle = '#b8a47c';
    x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      x.fillStyle = '#7a6a4a';
      x.fillRect(0, y, w, 3);
      x.fillStyle = 'rgba(255,240,210,0.25)';
      x.fillRect(0, y + 4, w, 4);
    }
  });
}

// El poncho de las alas: colorado, con dos guardas pampa y los flecos.
function wingTex() {
  return canvas(256, 256, (x, w, h) => {
    x.fillStyle = '#7a1810';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i += 3) {
      x.fillStyle = i % 6 ? 'rgba(0,0,0,0.12)' : 'rgba(255,120,80,0.06)';
      x.fillRect(0, i, w, 1);
    }
    const band = (y0, bh) => {
      x.fillStyle = '#120c0a';
      x.fillRect(0, y0, w, bh);
      const u = bh / 6;
      for (let cx = 0; cx < w; cx += u * 6) {
        x.fillStyle = '#e8e0d0';
        for (let r = 0; r < 6; r++) {
          const wr = (r < 3 ? r + 1 : 6 - r) * 2 * u;
          x.fillRect(cx + u * 3 - wr / 2, y0 + r * u, wr, u);
        }
        x.fillStyle = '#c8281a';
        x.fillRect(cx + u * 2.5, y0 + u * 2, u, u * 2);
      }
    };
    band(40, 36);
    band(170, 30);
    // los flecos del borde
    x.fillStyle = '#120c0a';
    for (let cx = 0; cx < w; cx += 5) x.fillRect(cx, h - 18, 2, 18);
  });
}

// La cabeza del dragón (sirve para el bicho y para la estatua de la fuente):
// cráneo y hocico en una pieza, cejas de hueso, ojos de ámbar, dientes, la
// mandíbula que se abre, los cuernos-bombilla y el bigote de gaucho.
// M: { scale, bone, eye, pupil, mouth, silver, gold, hair }.
export function dragonHead(M) {
  const head = new THREE.Group();
  // el cráneo y el hocico en una pieza: una esfera estirada hacia adelante,
  // chata arriba y afinada en la punta
  const sg = new THREE.SphereGeometry(0.6, 22, 16);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i);
    let y = sp.getY(i);
    let z = sp.getZ(i);
    if (z > 0) {
      const k = z / 0.6;
      z *= 2.5;
      x *= 1 - k * 0.48;
      y *= 1 - k * 0.38;
      y -= k * k * 0.1;
    } else z *= 1.1;
    y *= y > 0 ? 0.74 : 0.62;
    sp.setXYZ(i, x, y, z);
  }
  sg.computeVertexNormals();
  const skull = new THREE.Mesh(sg, M.scale);
  skull.position.set(0, 0.08, 0.05);
  head.add(skull);
  // el lomo del hocico y las cejas de piedra
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.1), M.scale);
  ridge.position.set(0, 0.36, 0.75);
  ridge.rotation.x = 0.16;
  head.add(ridge);
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), M.bone);
    brow.position.set(s * 0.32, 0.38, 0.2);
    brow.rotation.set(-1.95, 0, s * 0.35);
    head.add(brow);
  }
  // los ojos de ámbar (grandes, a los costados) con la pupila de raya
  const eyeMeshes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M.eye);
    e.position.set(s * 0.4, 0.24, 0.42);
    e.scale.set(0.7, 1, 1.2);
    head.add(e);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.03), M.pupil);
    p.position.set(s * 0.475, 0.24, 0.45);
    head.add(p);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.scale);
    lid.position.copy(e.position);
    lid.scale.set(0.8, 1, 1.25);
    head.add(lid);
    eyeMeshes.push({ e, p, lid });
  }
  // las fosas (de ahí sale el vapor)
  const nostrils = [-1, 1].map((s) => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), M.pupil);
    n.position.set(s * 0.12, 0.1, 1.52);
    head.add(n);
    return n;
  });
  // los dientes de arriba (asoman del borde del hocico)
  for (let k = 0; k < 8; k++) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.15, 5), M.bone);
      const z = 0.35 + k * 0.15;
      t.position.set(s * (0.36 - k * 0.028), -0.16, z);
      t.rotation.x = Math.PI;
      head.add(t);
    }
  }
  // la mandíbula (se abre para silbar y para el chorro)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.05);
  const jg = new THREE.BoxGeometry(0.62, 0.18, 1.45, 3, 1, 6);
  const pj = jg.attributes.position;
  for (let i = 0; i < pj.count; i++) {
    const k = Math.max(0, (pj.getZ(i) + 0.725) / 1.45);
    pj.setX(i, pj.getX(i) * (1 - k * 0.5));
    pj.setY(i, pj.getY(i) * (1 - k * 0.3));
  }
  jg.computeVertexNormals();
  const jm = new THREE.Mesh(jg, M.scale);
  jm.position.set(0, -0.08, 0.72);
  jaw.add(jm);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 1.1), M.mouth);
  tongue.position.set(0, 0.03, 0.7);
  jaw.add(tongue);
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.13, 5), M.bone);
      t.position.set(s * (0.26 - k * 0.025), 0.06, 0.3 + k * 0.16);
      jaw.add(t);
    }
  }
  head.add(jaw);
  // los cuernos: dos bombillas de plata, con el filtro contra el cráneo y la
  // boquilla atrás, arriba
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.3, 0.36, -0.05), new THREE.Vector3(s * 0.46, 0.6, -0.42), new THREE.Vector3(s * 0.52, 0.78, -0.82), new THREE.Vector3(s * 0.46, 1.0, -1.15)]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 8), M.silver));
    const filter = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), M.silver);
    filter.scale.set(1, 0.55, 1.3);
    filter.position.set(s * 0.3, 0.34, 0);
    head.add(filter);
    for (const u of [0.3, 0.55]) {
      const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), M.gold);
      ringG.position.copy(curve.getPoint(u));
      ringG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(u));
      head.add(ringG);
    }
    const mouthpiece = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.16), M.silver);
    mouthpiece.position.copy(curve.getPoint(1));
    mouthpiece.rotation.x = -0.6;
    head.add(mouthpiece);
  }
  // el bigote de gaucho (dos tientos que cuelgan del hocico)
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.2, 0.0, 1.3), new THREE.Vector3(s * 0.5, -0.08, 1.2), new THREE.Vector3(s * 0.74, -0.4, 1.02), new THREE.Vector3(s * 0.8, -0.9, 0.92)]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.035, 6), M.hair));
  }
  // la melena de pinchos detrás de la cabeza
  for (let k = 0; k < 5; k++) {
    const sp2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 5), M.bone);
    const a = (k - 2) * 0.4;
    sp2.position.set(Math.sin(a) * 0.38, 0.2 + Math.cos(a) * 0.12, -0.52);
    sp2.rotation.set(-2.2, 0, -a);
    head.add(sp2);
  }
  return { head, jaw, eyes: eyeMeshes, nostrils };
}

// ---------------- el bicho ----------------
export default class Mateendrache {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    this.t = 0;
    this.pose = 'sleep';
    this.from = null;
    this.blend = 1;
    this.blendDur = 1;
    this.breathOn = 0;
    this.jaw = 0;
    this.jawWant = 0;
    this.lookAt = null;
    this.flap = 0;
    this.eyes = 0;
    this.P = Array.from({ length: N }, () => new THREE.Vector3());
    this.F = Array.from({ length: N }, () => new THREE.Vector3(0, 0, 1));
    this.mats();
    this.buildBody();
    this.buildHead();
    this.buildLegs();
    this.buildWings();
    // (sin sombra: las del castillo son quietas y el dragón se mueve)
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    for (const W of this.wings) W.mem.frustumCulled = false;
    this.update(0);
  }

  mats() {
    const scale = scaleTex();
    scale.repeat.set(2, 1);
    this.M = {
      scale: new THREE.MeshStandardMaterial({ map: scale, color: 0xd0d8c0, roughness: 0.78, metalness: 0.05 }),
      belly: new THREE.MeshStandardMaterial({ map: bellyTex(), roughness: 0.7 }),
      coal: new THREE.MeshStandardMaterial({ map: bellyTex(), color: 0x6a4028, roughness: 0.6, emissive: 0xff5a14, emissiveIntensity: 0.8 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xe6dcc2, roughness: 0.55 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.22, metalness: 1 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: 0.3, metalness: 0.9 }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.12).multiplyScalar(1.8), toneMapped: false }),
      pupil: new THREE.MeshBasicMaterial({ color: 0x050302 }),
      wing: new THREE.MeshStandardMaterial({ map: wingTex(), roughness: 0.9, side: THREE.DoubleSide }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x3a0e0a, roughness: 0.8, emissive: 0x401006, emissiveIntensity: 0.6 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 0.8, side: THREE.DoubleSide }),
      hair: new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 }),
    };
  }

  buildBody() {
    const M = this.M;
    this.segs = [];
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const spike = new THREE.ConeGeometry(0.12, 0.5, 5);
    for (let i = 0; i < N; i++) {
      const o = new THREE.Group();
      const r = radius(i);
      const body = new THREE.Mesh(geo, M.scale);
      body.scale.set(r, r * 0.88, SP * 1.15);
      o.add(body);
      // la panza (en el pecho, con brasas abajo de las placas)
      const coal = i >= NECK && i < NECK + 7;
      const belly = new THREE.Mesh(geo, coal ? M.coal : M.belly);
      belly.scale.set(r * 0.8, r * 0.5, SP * 1.1);
      belly.position.y = -r * 0.42;
      o.add(belly);
      // la cresta del lomo
      if (i > 1 && i < N - 2) {
        const s = new THREE.Mesh(spike, M.bone);
        const k = i < NECK ? 0.7 : i < HIP ? 1.2 : 1 - (i - HIP) / (N - HIP);
        s.scale.setScalar(0.6 + k * 0.8);
        s.position.y = r * 0.85;
        s.rotation.x = -0.5;
        o.add(s);
      }
      this.root.add(o);
      this.segs.push({ o, r, body });
    }
    // el penacho de yerba en la punta de la cola
    const tuft = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.9).translate(0, -0.45, 0), M.leaf);
      leaf.rotation.set(0.4 + (k % 3) * 0.3, (k / 7) * Math.PI * 2, 0.3);
      tuft.add(leaf);
    }
    this.segs[N - 1].o.add(tuft);
    tuft.rotation.x = -Math.PI / 2;
  }

  buildHead() {
    const H = dragonHead(this.M);
    this.eyeMeshes = H.eyes;
    this.nostrils = H.nostrils;
    this.jawObj = H.jaw;
    H.head.scale.setScalar(1.5);
    this.root.add(H.head);
    this.head = H.head;
  }

  // Cuatro patas de dos huesos (se acomodan solas hasta el piso) con garras.
  buildLegs() {
    const M = this.M;
    const bone = new THREE.CylinderGeometry(1, 0.8, 1, 10).translate(0, 0.5, 0);
    this.legs = [
      { seg: NECK + 1, side: 1, front: true },
      { seg: NECK + 1, side: -1, front: true },
      { seg: HIP - 1, side: 1, front: false },
      { seg: HIP - 1, side: -1, front: false },
    ].map((L) => {
      const up = new THREE.Mesh(bone, M.scale);
      const lo = new THREE.Mesh(bone, M.scale);
      const foot = new THREE.Group();
      for (let k = -1; k <= 1; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), M.bone);
        c.position.set(k * 0.14, 0.06, 0.28);
        c.rotation.x = Math.PI / 2 - 0.3;
        foot.add(c);
      }
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), M.scale);
      pad.scale.set(1, 0.45, 1.3);
      pad.position.y = 0.08;
      foot.add(pad);
      this.root.add(up, lo, foot);
      return { ...L, up, lo, foot, l1: L.front ? 1.3 : 1.5, l2: L.front ? 1.25 : 1.35, r: L.front ? 0.24 : 0.3 };
    });
  }

  // Las alas: el brazo, cuatro dedos y la membrana de poncho entre ellos.
  buildWings() {
    const M = this.M;
    const bone = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
    this.wings = [1, -1].map((side) => {
      const anchor = new THREE.Group();
      this.root.add(anchor);
      const bones = [];
      for (let k = 0; k < 6; k++) {
        const b = new THREE.Mesh(bone, M.scale);
        anchor.add(b);
        bones.push(b);
      }
      // la membrana: 11 puntos (hombro, codo, muñeca, 4 dedos con los festones y el lomo)
      const geo = new THREE.BufferGeometry();
      const idx = [];
      // abanico desde la muñeca (2)
      const ring = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10];
      for (let k = 0; k < ring.length - 1; k++) idx.push(2, ring[k], ring[k + 1]);
      idx.push(2, 10, 0);
      geo.setIndex(side > 0 ? idx : idx.map((v, i) => (i % 3 === 1 ? idx[i + 1] : i % 3 === 2 ? idx[i - 1] : v)));
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(11 * 3), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(11 * 2), 2));
      const mem = new THREE.Mesh(geo, M.wing);
      anchor.add(mem);
      return { side, anchor, bones, geo, mem, uvDone: false };
    });
  }

  // ---------------- poses ----------------
  // Los puntos del lomo para cada pose (en el marco del bicho).
  posePoints(name, t, out) {
    const breathe = Math.sin(t * 1.1) * 0.05;
    if (name === 'sleep') {
      // enroscado en el piso: el cuerpo en espiral y la cabeza apoyada cerca de la cola
      let a = 0.4;
      for (let i = 0; i < N; i++) {
        const R = i < HIP ? 3.3 : 3.3 - (i - HIP) * 0.1;
        a += (i === 0 ? 0 : SP / R);
        const y = radius(i) * 0.82 + (i >= NECK && i < HIP ? breathe * 0.6 : 0);
        out[i].set(Math.cos(a) * R, y, Math.sin(a) * R);
      }
      // la cabeza apoyada: el cuello baja al piso
      for (let i = 0; i < 3; i++) out[i].y = 0.42 + i * 0.08;
      return;
    }
    if (name === 'fly') {
      // estirado, con una ondulación que corre del cuello a la cola
      for (let i = 0; i < N; i++) {
        const z = (NECK + 3 - i) * SP;
        const wave = Math.sin(t * 2.2 - i * 0.35) * (0.05 + (i / N) * 0.5);
        out[i].set(wave, Math.sin(t * 2.2 - i * 0.3 + 1) * 0.12 * (i / N) + (i < 4 ? (4 - i) * 0.12 : 0), z);
      }
      return;
    }
    // parado: el torso a 2.6 m, el cuello sube en curva y la cola baja al piso
    const sway = Math.sin(t * 0.7) * 0.25;
    for (let i = 0; i < N; i++) {
      if (i < NECK) {
        const k = 1 - i / NECK;
        const e = k * k;
        out[i].set(sway * e * 2, 2.9 + e * 3.2 + breathe, 2.4 + k * 1.2 + e * 1.4);
      } else if (i < HIP) {
        const k = (i - NECK) / (HIP - NECK);
        out[i].set(0, 2.7 - k * 0.3 + breathe * (1 - k), 2.3 - k * 4.4);
      } else {
        const k = (i - HIP) / (N - 1 - HIP);
        out[i].set(Math.sin(k * 2.4 + t * 0.9) * k * 1.8, Math.max(radius(i) * 0.9, 2.3 * (1 - k) ** 2), -2.3 - k * 7.5);
      }
    }
  }

  // Cambia de pose en `secs` (desde donde esté ahora).
  setPose(name, secs = 1.5) {
    if (name === this.pose && this.blend >= 1) return;
    this.from = this.P.map((p) => p.clone());
    this.pose = name;
    this.blend = 0;
    this.blendDur = Math.max(0.01, secs);
  }

  // Abre la boca (0 a 1) y mira a un punto (en el mundo) o a nada.
  open(k) {
    this.jawWant = k;
  }

  look(p) {
    this.lookAt = p ? p.clone() : null;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.blend = Math.min(1, this.blend + dt / this.blendDur);
    const target = this._tgt || (this._tgt = Array.from({ length: N }, () => new THREE.Vector3()));
    this.posePoints(this.pose, t, target);
    const k = smooth(this.blend);
    for (let i = 0; i < N; i++) {
      if (this.from && k < 1) this.P[i].lerpVectors(this.from[i], target[i], k);
      else this.P[i].copy(target[i]);
    }
    // el marco de cada segmento: mira hacia la cabeza
    for (let i = 0; i < N; i++) {
      const a = this.P[Math.max(0, i - 1)];
      const b = this.P[Math.min(N - 1, i + 1)];
      this.F[i].subVectors(a, b).normalize();
      const s = this.segs[i];
      frame(this.F[i], tmpM);
      s.o.position.copy(this.P[i]);
      s.o.quaternion.setFromRotationMatrix(tmpM);
    }
    // el pecho respira brasas
    const glow = 0.7 + Math.sin(t * 1.1) * 0.25 + this.breathOn * 1.5;
    this.M.coal.emissiveIntensity = glow;
    this.updateHead(dt, t);
    this.updateLegs();
    this.updateWings(t);
  }

  updateHead(dt, t) {
    const h = this.head;
    const p0 = this.P[0];
    const f = tmpV.copy(this.F[0]);
    // la cabeza sigue al cuello; si hay a dónde mirar, gira hacia ahí (un poco)
    if (this.lookAt) {
      tmpW.copy(this.lookAt);
      this.root.worldToLocal(tmpW);
      tmpW.sub(p0).normalize();
      f.lerp(tmpW, 0.6).normalize();
    }
    if (this.pose === 'sleep' && this.blend >= 1) f.y = Math.min(f.y, -0.08);
    h.position.copy(p0).addScaledVector(this.F[0], 0.35);
    frame(f, tmpM);
    tmpQ.setFromRotationMatrix(tmpM);
    h.quaternion.slerp(tmpQ, Math.min(1, dt * 4 + (this.hSnap ? 1 : 0)));
    this.hSnap = false;
    // la mandíbula y los ojos
    this.jaw += (this.jawWant - this.jaw) * Math.min(1, dt * 6);
    this.jawObj.rotation.x = this.jaw * 0.55;
    const awake = this.pose !== 'sleep' || this.eyes > 0;
    const lid = awake ? 0 : 1;
    for (const E of this.eyeMeshes) {
      E.lid.visible = lid > 0.5;
      E.e.scale.setScalar(0.8 + Math.sin(t * 3) * 0.05);
    }
  }

  updateLegs() {
    for (const L of this.legs) {
      const s = this.segs[L.seg];
      const r = s.r;
      // el hombro: al costado del segmento, un poco abajo
      frame(this.F[L.seg], tmpM);
      const side = tmpU.set(1, 0, 0).applyMatrix4(tmpM).multiplyScalar(L.side);
      const A = tmpV.copy(this.P[L.seg]).addScaledVector(side, r * 0.8);
      A.y -= r * 0.25;
      // el pie: al piso abajo del hombro (parado), recogido (volando) o al costado (durmiendo)
      const T = tmpW.copy(A).addScaledVector(side, 0.35);
      if (this.pose === 'fly') {
        T.copy(A).addScaledVector(this.F[L.seg], -1.4);
        T.y -= 0.9;
      } else T.y = 0;
      if (this.pose !== 'fly') T.addScaledVector(this.F[L.seg], L.front ? 0.25 : -0.1);
      const knee = ik(A, T, L.l1, L.l2, tmpU.copy(this.F[L.seg]).multiplyScalar(L.front ? -1 : 1).add(side.multiplyScalar(0.4)));
      bone(L.up, A, knee, L.r);
      bone(L.lo, knee, T, L.r * 0.75);
      L.foot.position.copy(T);
      L.foot.rotation.y = Math.atan2(this.F[L.seg].x, this.F[L.seg].z);
    }
  }

  updateWings(t) {
    const S = this.segs[NECK + 2];
    const fly = this.pose === 'fly' ? smooth(this.blend) : this.from && this.fromFly ? 1 - smooth(this.blend) : 0;
    this.fromFly = this.pose === 'fly';
    const spread = this.pose === 'stand' ? 0.55 + Math.sin(t * 0.5) * 0.05 : fly;
    // (flapK: cuánto aletea; menos cuando planea con alguien arriba)
    const flap = Math.sin(t * 3.2) * 0.75 * fly * (this.flapK ?? 1) + (this.pose === 'stand' ? Math.sin(t * 1.3) * 0.08 : 0);
    for (const W of this.wings) {
      // el ancla: arriba del lomo, mirando hacia la cabeza
      frame(this.F[NECK + 2], tmpM);
      W.anchor.position.copy(S.o.position).addScaledVector(tmpU.set(0, 1, 0).applyMatrix4(tmpM), S.r * 0.6);
      W.anchor.quaternion.setFromRotationMatrix(tmpM);
      const pts = wingPoints(spread, flap * W.side, W.side);
      const pos = W.geo.attributes.position;
      pts.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
      pos.needsUpdate = true;
      W.geo.computeVertexNormals();
      W.geo.computeBoundingSphere();
      if (!W.uvDone) {
        const open = wingPoints(1, 0, W.side);
        const uv = W.geo.attributes.uv;
        open.forEach((p, i) => uv.setXY(i, (p.x * W.side) / 9, p.z / 9 + 0.9));
        uv.needsUpdate = true;
        W.uvDone = true;
      }
      // los huesos: hombro-codo, codo-muñeca y los cuatro dedos
      const [s, e, w, f1, , f2, , f3, , f4] = pts;
      bone(W.bones[0], s, e, 0.14);
      bone(W.bones[1], e, w, 0.11);
      bone(W.bones[2], w, f1, 0.06);
      bone(W.bones[3], w, f2, 0.055);
      bone(W.bones[4], w, f3, 0.05);
      bone(W.bones[5], w, f4, 0.045);
    }
  }

  // Dónde está la boca (en el mundo), para el chorro y el vapor.
  mouthPos(out = new THREE.Vector3()) {
    return out.set(0, -0.05, 1.7).applyMatrix4(this.head.matrixWorld);
  }

  mouthDir(out = new THREE.Vector3()) {
    return out.set(0, -0.15, 1).applyQuaternion(this.head.getWorldQuaternion(tmpQ)).normalize();
  }

  chestPos(out = new THREE.Vector3()) {
    return this.segs[NECK + 3].o.getWorldPosition(out);
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.M)) {
      m.map?.dispose();
      m.dispose();
    }
  }
}

// ---------------- geometría ----------------
// Matriz de un marco que mira hacia `f` (z) con el arriba lo más vertical posible.
function frame(f, out) {
  const z = tmpFz.copy(f).normalize();
  const x = tmpFx.crossVectors(UP, z);
  if (x.lengthSq() < 1e-6) x.copy(X);
  x.normalize();
  const y = tmpFy.crossVectors(z, x).normalize();
  return out.makeBasis(x, y, z);
}
const tmpFx = new THREE.Vector3();
const tmpFy = new THREE.Vector3();
const tmpFz = new THREE.Vector3();

// Un cilindro (con el pie en y=0 y largo 1) de a hasta b, de radio r.
function bone(m, a, b, r) {
  const d = tmpB.subVectors(b, a);
  const len = d.length() || 0.001;
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  m.scale.set(r, len, r);
}
const tmpB = new THREE.Vector3();

// Dos huesos de a (hombro) a t (pie): devuelve la rodilla, doblada hacia `hint`.
function ik(a, t, l1, l2, hint) {
  const d = tmpI.subVectors(t, a);
  let len = d.length();
  const max = l1 + l2 - 0.001;
  if (len > max) {
    d.multiplyScalar(max / len);
    t.copy(a).add(d);
    len = max;
  }
  const dir = d.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const bend = hint.clone().addScaledVector(dir, -hint.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1);
  bend.normalize();
  return a.clone().addScaledVector(dir, x).addScaledVector(bend, h);
}
const tmpI = new THREE.Vector3();

// Los 11 puntos del ala en el marco del ancla (x afuera, y arriba, z hacia la
// cabeza): hombro, codo, muñeca, dedo 1, festón, dedo 2, festón, dedo 3,
// festón, dedo 4 y el lomo. spread: 0 plegada, 1 abierta; flap: el aleteo.
const WING = Array.from({ length: 11 }, () => new THREE.Vector3());
function wingPoints(spread, flap, side) {
  const k = clamp01(spread);
  const lerp = (a, b) => a + (b - a) * k;
  const out = WING;
  const c = Math.cos(flap);
  const s = Math.sin(flap);
  // el giro del aleteo: alrededor del eje del cuerpo (z)
  const rot = (x, y, z, o) => o.set(x * c - y * s * side, x * s * side + y * c, z);
  out[0].set(0, 0, 0);
  rot(lerp(0.7, 2.5), lerp(0.7, 0.5), lerp(-0.9, 0.35), out[1]);
  rot(lerp(0.9, 5.3), lerp(1.0, 0.8), lerp(-2.6, -0.35), out[2]);
  const fingers = [
    [lerp(1.0, 9.2), lerp(1.0, 0.7), lerp(-3.4, -0.4)],
    [lerp(1.0, 8.4), lerp(0.9, 0.2), lerp(-3.8, -3.2)],
    [lerp(0.9, 6.6), lerp(0.8, -0.1), lerp(-4.1, -5.2)],
    [lerp(0.7, 3.8), lerp(0.7, -0.2), lerp(-4.2, -5.6)],
  ];
  const tips = fingers.map((f) => rot(f[0], f[1], f[2], new THREE.Vector3()));
  out[3].copy(tips[0]);
  out[5].copy(tips[1]);
  out[7].copy(tips[2]);
  out[9].copy(tips[3]);
  // los festones entre los dedos (el borde de atrás se hunde un poco)
  for (const [m, a, b] of [[4, 3, 5], [6, 5, 7], [8, 7, 9]]) out[m].lerpVectors(out[a], out[b], 0.5).lerp(out[2], 0.18);
  out[10].set(lerp(0.3, 0.4), 0, lerp(-3.6, -4.2));
  for (const p of out) p.x *= side;
  return out;
}
