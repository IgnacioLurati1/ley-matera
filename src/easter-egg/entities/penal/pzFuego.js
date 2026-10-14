import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, compactGroup } from '../../world/props';
import { PZS } from '../../config/porteno';

// Porteño encubierto: lo que se ve del incendio del islote (el usuario,
// 2026-10-13: "provocar un incendio en la isla [...] Al llegar al puerto de la
// isla habrá extintores que hay que agarrar y disparar a las llamas [...] Si
// el incendio no se apaga la isla es brutalmente carbonizada").
//  · Las llamas: planos cruzados con la llama del castillo (world/castleFire.js),
//    chispas y humo; crecen de a poco (no aparecen de golpe), se achican con
//    el chorro y al apagarse dejan vapor y la mancha quemada. Tres luces de
//    evento (World.adoptLight) las acompañan.
//  · Los extintores: dos estantes en el tablado del muellecito (5 cada uno).
//    El que tiene uno lo ve en primera persona (sube de abajo) y los demás en
//    la mano de su muñeco; con clic sostenido sale el chorro de espuma.
//  · La isla quemada: el piso negro con brasas, el hollín en la ermita, más
//    llamas por todos lados que se apagan solas y humo que no para.
// Lo decide entities/penal/pzSabotaje.js (el anfitrión); acá solo se dibuja.

// las llamas, cerca del muellecito y en el patio de la ermita (sin tapar el
// tablado, la puerta de la ermita ni el santito)
export const FLAMES = [
  [8.1, 121.2],
  [4.8, 125.2],
  [16.9, 121.4],
  [21.0, 121.7],
  [17.7, 125.4],
  [5.2, 128.6],
  [21.0, 128.4],
  [9.4, 124.7],
];
// las de la isla quemada (además de las de arriba)
const BURN = [
  [3.8, 121.0],
  [12.0, 123.2],
  [14.6, 124.4],
  [19.4, 126.2],
  [6.6, 126.6],
  [4.6, 132.6],
  [21.2, 132.9],
  [20.0, 130.4],
  [13.0, 118.6],
  [12.4, 114.6],
  [10.2, 131.0],
  [15.8, 131.0],
];
// los estantes de los extintores: en los costados del tablado, mirando al medio
export const RACKS = [
  { x: 11.28, z: 116.0, face: 1 },
  { x: 14.72, z: 115.4, face: -1 },
];
const PER_RACK = 5;
// las luces: una por cada grupo de llamas
const LIGHTS = [
  { at: [7.5, 123.5], idx: [0, 1, 5, 7] },
  { at: [19.0, 123.5], idx: [2, 3, 4, 6] },
];
// el islote para la isla quemada (los rectángulos de las zonas L y M)
const ISLE_RECTS = [
  [11, 112, 15, 120],
  [3, 120, 23, 127],
  [3, 127, 7, 135],
  [19, 127, 23, 135],
  [8, 128, 18, 136],
];
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const P_SMOKE = { color: [0.2, 0.19, 0.18], size: 0.8, size1: 4.2, life: 5, alpha: 0.32, drag: 0.3 };
const P_HOT = { color: [0.55, 0.28, 0.12], size: 0.5, size1: 1.8, life: 1.3, alpha: 0.22, drag: 0.5 };
const P_EMBER = { color: [1, 0.55, 0.18], size: 0.04, size1: 0.015, life: 1.6, gravity: -0.6, drag: 0.4 };
const P_FOAM = { color: [0.93, 0.95, 0.97], size: 0.08, size1: 0.55, life: 0.55, alpha: 0.55, gravity: 2.2, drag: 1.6 };
const P_STEAM = { color: [0.82, 0.84, 0.86], size: 0.3, size1: 1.6, life: 1.5, alpha: 0.22, drag: 0.7 };

// La llama: la forma de la del castillo (world/castleFire.js flameMaterial),
// pero naranja y sin sumar luz (sumada se veía blanca, como de gas).
let FLAME = null;
function flameMat() {
  if (FLAME) return FLAME;
  FLAME = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float seed = dot(floor(vW.xz * 3.0), vec2(1.7, 9.2));
        float t = uTime * 2.4 + seed;
        float x = (vUv.x - 0.5) * 2.0;
        float y = clamp(vUv.y, 0.0, 1.0);
        float turb = vn(vec2(x * 2.5, y * 3.0 - t * 1.6)) * 0.55 + vn(vec2(x * 5.0 + 3.0, y * 6.0 - t * 2.7)) * 0.3;
        float width = (1.0 - y) * 0.9 * (0.75 + 0.25 * sin(t * 3.0 + y * 6.0)) + 0.001;
        float dx = abs(x + (turb - 0.45) * 0.6 * y);
        float body = 1.0 - smoothstep(width * 0.3, width, dx);
        float tip = 1.0 - smoothstep(0.4 + turb * 0.3, 1.0, y);
        float a = clamp(body * smoothstep(0.0, 0.06, y) * tip * 1.4, 0.0, 1.0);
        if (a < 0.02) discard;
        float core = clamp(1.0 - (y * 1.3 + (1.0 - body) * 0.8), 0.0, 1.0);
        vec3 col = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.0, 0.5, core));
        col = mix(col, vec3(1.0, 0.86, 0.45), smoothstep(0.55, 1.0, core));
        gl_FragColor = vec4(col * 1.35, a * 0.92);
      }`,
  });
  return FLAME;
}

// El extintor: el tubo colorado, el cabezal con la manija y la manguera con su boquilla.
// (y: 0 en la base; mira a +z)
export function extModel(M) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc0140c, roughness: 0.32, metalness: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
  const steel = M?.metal || new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
  g.add(mesh(cylGeo(0.075, 0.08, 0.42, 14), red, 0, 0.23, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
  dome.position.y = 0.44;
  g.add(dome);
  g.add(mesh(cylGeo(0.022, 0.026, 0.07, 8), steel, 0, 0.53, 0));
  g.add(mesh(boxGeo(0.03, 0.018, 0.13), steel, 0, 0.575, 0.03, 0.2, 0, 0));
  g.add(mesh(boxGeo(0.026, 0.014, 0.11), black, 0, 0.555, 0.025, -0.12, 0, 0));
  // la etiqueta blanca
  g.add(mesh(cylGeo(0.0765, 0.0815, 0.12, 14, true), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7, side: THREE.DoubleSide }), 0, 0.24, 0));
  // la manguera, de la cabeza a la boquilla (adelante, al costado)
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.53, 0.02), new THREE.Vector3(0.07, 0.47, 0.09), new THREE.Vector3(0.09, 0.4, 0.15), new THREE.Vector3(0.08, 0.36, 0.2)]), 10, 0.011, 6), black);
  g.add(hose);
  const horn = mesh(cylGeo(0.012, 0.03, 0.12, 8), black, 0.08, 0.36, 0.25, Math.PI / 2, 0, 0);
  g.add(horn);
  g.userData.nozzle = new THREE.Vector3(0.08, 0.36, 0.32);
  return g;
}

export default class PzFuego {
  constructor(sab) {
    this.sab = sab;
    const g = (this.g = sab.g);
    const W = g.world;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    // las llamas: cada una, tres pares de planos (del más grande al chico) y su mancha quemada
    this.flames = [...FLAMES, ...BURN].map(([x, z], i) => this.makeFlame(x, z, i, i >= FLAMES.length));
    // las luces del fuego
    this.lights = LIGHTS.map((L) => {
      const l = new THREE.PointLight(0xff6418, 0, 20, 1.5);
      l.position.set(L.at[0], W.floorAt(L.at[0], L.at[1]) + 2.2, L.at[1]);
      l.userData.noShadow = true;
      this.root.add(l);
      W.adoptLight?.(l, 1.4);
      return { l, idx: L.idx };
    });
    this.buildRacks();
    this.buildChar();
    // lo que se ve: k de cada llama (0 a 1+), suavizado hacia lo que dice el anfitrión
    this.k = new Float32Array(this.flames.length);
    this.char = 0;
    this.burnAll = 0;
    this.emitT = 0;
    this.sndT = 0;
    // el extintor en primera persona y el chorro
    this.vm = null;
    this.vmK = 0;
    this.sprayT = 0;
  }

  makeFlame(x, z, i, extra) {
    const W = this.g.world;
    const y = W.floorAt(x, z);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    // un manojo de lenguas de distinto alto alrededor del punto (el pasto que arde)
    const tongues = extra ? [[0, 0, 2.4, 3.6], [0.7, 0.2, 1.5, 2.4], [-0.6, 0.5, 1.3, 2], [0.1, -0.7, 1.1, 1.7]] : [[0, 0, 2, 3.1], [0.6, 0.3, 1.3, 2.1], [-0.55, 0.35, 1.2, 1.8], [0.15, -0.6, 1, 1.5], [-0.3, -0.35, 0.8, 1.1]];
    tongues.forEach(([ox, oz, w, h], j) => {
      const geo = new THREE.PlaneGeometry(w, h).translate(0, h / 2 - 0.05, 0);
      const a = i * 1.3 + j * 0.9;
      for (const ry of [0, Math.PI / 2]) {
        const m = new THREE.Mesh(geo, flameMat());
        m.rotation.y = ry + a;
        m.position.set(ox * Math.cos(a) - oz * Math.sin(a), 0, ox * Math.sin(a) + oz * Math.cos(a));
        m.renderOrder = 5;
        m.frustumCulled = false;
        grp.add(m);
      }
    });
    // el resplandor de abajo (de lejos es lo que se ve)
    const dot = this.g.world.T?.dot || this.g.textures?.dot;
    if (dot) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xff6a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.position.y = 0.9;
      glow.scale.setScalar(extra ? 5.5 : 4.6);
      grp.add(glow);
    }
    grp.visible = false;
    this.root.add(grp);
    // la mancha quemada del pasto
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(extra ? 1.9 : 1.6, 20).rotateX(-Math.PI / 2), this.scorchMat());
    scorch.position.set(x, y + 0.025 + i * 0.0006, z);
    scorch.renderOrder = 1;
    scorch.visible = false;
    this.root.add(scorch);
    return { x, y, z, grp, scorch, extra, seen: 0, phase: Math.random() * 10 };
  }

  scorchMat() {
    if (this.sMat) return this.sMat.clone();
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(8,6,5,0.95)');
    gr.addColorStop(0.55, 'rgba(14,10,8,0.8)');
    gr.addColorStop(1, 'rgba(20,14,10,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    return this.sMat.clone();
  }

  // ---------------- los extintores ----------------
  buildRacks() {
    const g = this.g;
    const M = g.world.M;
    this.slots = [];
    for (const R of RACKS) {
      const y = g.world.floorAt(R.x, R.z);
      const rack = new THREE.Group();
      rack.position.set(R.x, y, R.z);
      rack.rotation.y = R.face > 0 ? Math.PI / 2 : -Math.PI / 2;
      const wood = M.woodDark || M.wood;
      // la tabla de atrás, dos patas y el estante con el cartelito colorado
      rack.add(mesh(boxGeo(1.9, 1.05, 0.05), wood, 0, 0.62, -0.17));
      for (const s of [-1, 1]) rack.add(mesh(boxGeo(0.07, 1.15, 0.07), wood, s * 0.92, 0.575, -0.14));
      rack.add(mesh(boxGeo(1.9, 0.05, 0.3), wood, 0, 0.08, -0.03));
      rack.add(mesh(boxGeo(0.62, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0xb01810, emissive: 0x400400, roughness: 0.5 }), 0, 1.08, -0.14));
      if (!globalThis.__mduNoMerge) compactGroup(rack);
      for (let i = 0; i < PER_RACK; i++) {
        const e = extModel(M);
        e.position.set((i - 2) * 0.36, 0.105, -0.04);
        e.rotation.y = Math.PI;
        rack.add(e);
        this.slots.push({ e, k: 1, want: 1, rack: R });
      }
      this.root.add(rack);
      g.world.addBox([R.x - (R.face > 0 ? 0 : 0.3), y, R.z - 0.95, R.x + (R.face > 0 ? 0.3 : 0), y + 1.2, R.z + 0.95], { kind: 'prop' });
    }
  }

  // ¿Hay un estante a mano? (para el aviso de F)
  nearRack(p) {
    for (const R of RACKS) if (Math.hypot(p.x - R.x, p.z - R.z) < 1.9 && Math.abs(p.y - this.g.world.floorAt(R.x, R.z)) < 1.4) return R;
    return null;
  }

  // ---------------- la isla quemada ----------------
  buildChar() {
    const g = this.g;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#0d0b0a';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const v = 8 + Math.random() * 22;
      x.fillStyle = `rgba(${v + 4},${v},${v - 2},${0.3 + Math.random() * 0.5})`;
      const r = 1 + Math.random() * 6;
      x.beginPath();
      x.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
      x.fill();
    }
    // las brasas: rajas y puntitos (van en el mapa de brillo)
    const e = document.createElement('canvas');
    e.width = e.height = 256;
    const y = e.getContext('2d');
    y.fillStyle = '#000';
    y.fillRect(0, 0, 256, 256);
    y.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      let px = Math.random() * 256;
      let pz = Math.random() * 256;
      y.strokeStyle = `rgba(255,${80 + Math.random() * 60},20,${0.25 + Math.random() * 0.45})`;
      y.lineWidth = 0.5 + Math.random() * 0.8;
      y.beginPath();
      y.moveTo(px, pz);
      for (let s = 0; s < 4; s++) {
        px += (Math.random() - 0.5) * 18;
        pz += (Math.random() - 0.5) * 18;
        y.lineTo(px, pz);
      }
      y.stroke();
    }
    for (let i = 0; i < 160; i++) {
      y.fillStyle = `rgba(255,${80 + Math.random() * 100},20,${Math.random()})`;
      y.beginPath();
      y.arc(Math.random() * 256, Math.random() * 256, 0.6 + Math.random() * 1.8, 0, Math.PI * 2);
      y.fill();
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const emap = new THREE.CanvasTexture(e);
    emap.colorSpace = THREE.SRGBColorSpace;
    emap.wrapS = emap.wrapT = THREE.RepeatWrapping;
    this.charMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, emissive: 0xff6a20, emissiveMap: emap, emissiveIntensity: 1.2, roughness: 0.95, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.charGrp = new THREE.Group();
    this.charGrp.visible = false;
    for (const [x0, z0, x1, z1] of ISLE_RECTS) {
      const w = x1 - x0;
      const d = z1 - z0;
      const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      // (la textura, de a 4 m)
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 4 + x0 / 4, (uv.getY(i) * d) / 4 + z0 / 4);
      const m = new THREE.Mesh(geo, this.charMat);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      m.position.set(cx, g.world.floorAt(cx, cz) + 0.035, cz);
      m.renderOrder = 1;
      this.charGrp.add(m);
    }
    // el hollín en la pared de la ermita que da al patio (a los costados de la puerta)
    const s = document.createElement('canvas');
    s.width = 64;
    s.height = 128;
    const sx = s.getContext('2d');
    const gr = sx.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(6,5,4,0.95)');
    gr.addColorStop(0.5, 'rgba(10,8,6,0.75)');
    gr.addColorStop(1, 'rgba(12,10,8,0)');
    sx.fillStyle = gr;
    sx.fillRect(0, 0, 64, 128);
    const st = new THREE.CanvasTexture(s);
    st.colorSpace = THREE.SRGBColorSpace;
    this.sootMat = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const [x0, x1] of [[7, 12], [14, 19]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 5.2), this.sootMat);
      // (la pared de verdad: un rayo desde el patio; el revoque sobresale de la celda)
      const cx = (x0 + x1) / 2;
      const d = g.world.raycast(tmpV.set(cx, 1.5, 124), tmpW.set(0, 0, 1), 6);
      m.position.set(cx, 2.55, 124 + Math.min(3, d) - 0.03);
      m.rotation.y = Math.PI;
      this.charGrp.add(m);
    }
    this.root.add(this.charGrp);
  }

  // ---------------- cada cuadro ----------------
  // st: el estado del incendio del anfitrión (o null); dt: el del cuadro.
  update(dt, F) {
    const g = this.g;
    const t = g.time;
    const on = !!F;
    flameMat().uniforms.uTime.value = t;
    const n0 = FLAMES.length;
    // a qué tamaño va cada llama: lo del anfitrión; en la isla quemada, primero
    // todas grandes y después se apagan solas
    let burnK = 0;
    if (F && F.st === 'burn') {
      const bt = F.bt;
      burnK = bt < 0.6 ? smooth(bt / 0.6) * 1.5 : bt < 3.6 ? 1.5 : Math.max(0.22, 1.5 - (bt - 3.6) * 0.45);
      this.char = Math.max(this.char, clamp01((bt - 0.5) / 2.6));
    } else if (F && F.st === 'burnt') {
      burnK = 0.22;
      this.char = 1;
    } else if (!F) burnK = 0;
    for (let i = 0; i < this.flames.length; i++) {
      const fl = this.flames[i];
      let want = 0;
      if (i < n0) {
        const h = F?.h?.[i] ?? 0;
        want = F && (F.st === 'burn' || F.st === 'burnt') ? burnK * (0.8 + (i % 3) * 0.12) : h > 0 ? h : 0;
      } else want = burnK * (0.75 + (i % 4) * 0.1);
      // crece y se achica suave (en la isla quemada las de más entran de a una)
      const delay = i >= n0 && F?.st === 'burn' ? (i - n0) * 0.05 : 0;
      if (F?.st === 'burn' && F.bt < delay) want = 0;
      const rate = want > this.k[i] ? 1.6 : 2.4;
      this.k[i] += Math.max(-rate * dt, Math.min(rate * dt, want - this.k[i]));
      const k = this.k[i];
      fl.seen = Math.max(fl.seen, Math.min(1, k * 1.4));
      const vis = k > 0.01;
      fl.grp.visible = vis;
      if (vis) {
        const wob = 1 + Math.sin(t * 9 + fl.phase) * 0.05;
        fl.grp.scale.set(k * wob, k * (1 + Math.sin(t * 6.3 + fl.phase) * 0.08), k * wob);
      }
      fl.scorch.visible = fl.seen > 0.01;
      fl.scorch.material.opacity = fl.seen * 0.85;
    }
    // la isla quemada
    this.charGrp.visible = this.char > 0.001;
    this.charMat.opacity = this.char;
    this.charMat.emissiveIntensity = (0.55 + Math.sin(t * 2.3) * 0.2 + Math.sin(t * 5.1) * 0.1) * this.char;
    this.sootMat.opacity = this.char * 0.92;
    // las luces: lo que arde cerca de cada una (en la isla quemada, las brasas)
    for (const L of this.lights) {
      let s = 0;
      for (const i of L.idx) s += this.k[i];
      if (burnK > 0) s = Math.max(s, burnK * 3);
      s += this.char * 0.5;
      const fl = 0.85 + Math.sin(t * 13 + L.idx[0]) * 0.08 + Math.sin(t * 7.3) * 0.07;
      L.l.intensity = Math.min(16, s * 3.4) * fl;
    }
    // chispas, humo y brasas (de a ratos: como mucho 30 veces por segundo)
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 1 / 30;
      this.emit(1 / 30);
    }
    // el ruido del fuego cerca
    this.sndT -= dt;
    if (this.sndT <= 0) {
      this.sndT = 0.55 + Math.random() * 0.35;
      this.crackle();
    }
    void on;
  }

  emit(step) {
    const fx = this.g.fx;
    for (let i = 0; i < this.flames.length; i++) {
      const k = this.k[i];
      const fl = this.flames[i];
      if (k > 0.05) {
        if (Math.random() < k * 0.9) fx.fire(tmpV.set(fl.x, fl.y + 0.15, fl.z), 1.3 * Math.min(1.4, k), 2);
        if (Math.random() < k * step * 10) fx.alpha.spawn(fl.x + (Math.random() - 0.5) * 0.8, fl.y + 2.4 * k, fl.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4 + 0.3, 1.3 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, P_SMOKE);
        if (Math.random() < k * step * 8) fx.alpha.spawn(fl.x + (Math.random() - 0.5) * 0.8, fl.y + 1.2 * k, fl.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, P_HOT);
        if (Math.random() < k * step * 10) fx.add.spawn(fl.x + (Math.random() - 0.5), fl.y + 0.8, fl.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, P_EMBER);
      }
    }
    // la isla quemada humea por todos lados
    if (this.char > 0.05) {
      for (let n = 0; n < 2; n++) {
        if (Math.random() > this.char * step * 22) continue;
        const R = ISLE_RECTS[(Math.random() * ISLE_RECTS.length) | 0];
        const x = R[0] + Math.random() * (R[2] - R[0]);
        const z = R[1] + Math.random() * (R[3] - R[1]);
        fx.alpha.spawn(x, 0.3, z, 0.2 + (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, P_SMOKE);
        if (Math.random() < 0.5) fx.add.spawn(x, 0.1, z, (Math.random() - 0.5) * 0.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.4, P_EMBER);
      }
    }
  }

  crackle() {
    const g = this.g;
    let best = -1;
    let bd = 26 * 26;
    const cp = g.camera.position;
    for (let i = 0; i < this.flames.length; i++) {
      if (this.k[i] < 0.1) continue;
      const fl = this.flames[i];
      const d = (fl.x - cp.x) ** 2 + (fl.z - cp.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return;
    const fl = this.flames[best];
    const D = this.sab.pz.enc?.doors;
    if (D?.sfx) D.sfx('crackle', tmpV.set(fl.x, fl.y + 0.8, fl.z));
    const a = g.audio;
    if (a?.ctx) {
      const o = a.out({ pos: tmpV.set(fl.x, fl.y + 1, fl.z), gain: 0.5 * Math.min(1.5, this.k[best]), reverb: 0.2, ref: 4 });
      a.noise(o, { dur: 0.7, freq: 500, freqEnd: 260, gain: 0.25, attack: 0.08, brown: true });
    }
  }

  // ---------------- el chorro ----------------
  // ¿A qué llamas le llega el chorro desde `o` hacia `dir`? (las que siguen prendidas)
  hits(o, dir, h, out) {
    out.length = 0;
    for (let i = 0; i < FLAMES.length; i++) {
      if (!(h[i] > 0)) continue;
      const fl = this.flames[i];
      tmpW.set(fl.x - o.x, fl.y + 0.7 - o.y, fl.z - o.z);
      const d = tmpW.length();
      if (d > PZS.sprayR + 0.8) continue;
      // (de cerca alcanza con apuntarle más o menos; el cuerpo de la llama es ancho)
      const cos = tmpW.dot(dir) / Math.max(0.01, d);
      if (cos < (d < 2 ? 0.6 : PZS.sprayCos)) continue;
      if (this.g.world.raycast(o, tmpW.divideScalar(d), d) < d - 0.9) continue;
      out.push(i);
    }
    return out;
  }

  // La espuma que sale de una boquilla (de cualquiera) hacia `dir`.
  foam(o, dir, step, mine) {
    const fx = this.g.fx;
    const n = mine ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const s = 7.5 + Math.random() * 2;
      fx.alpha.spawn(o.x, o.y, o.z, dir.x * s + (Math.random() - 0.5) * 1.1, dir.y * s + (Math.random() - 0.5) * 0.9 + 0.4, dir.z * s + (Math.random() - 0.5) * 1.1, P_FOAM);
    }
    if (Math.random() < 0.5) fx.add.spawn(o.x, o.y, o.z, dir.x * 6, dir.y * 6, dir.z * 6, { color: [0.6, 0.65, 0.7], size: 0.05, size1: 0.18, life: 0.35, alpha: 0.4, drag: 1.2 });
    void step;
  }

  // Vapor donde el chorro le pega a una llama.
  steam(i) {
    const fl = this.flames[i];
    const fx = this.g.fx;
    if (Math.random() < 0.6) fx.alpha.spawn(fl.x + (Math.random() - 0.5) * 0.8, fl.y + 0.6, fl.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, P_STEAM);
  }

  // Se apagó una llama: un soplido de vapor y el siseo.
  out(i) {
    const fl = this.flames[i];
    const fx = this.g.fx;
    for (let n = 0; n < 14; n++) fx.alpha.spawn(fl.x + (Math.random() - 0.5), fl.y + 0.3, fl.z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6, P_STEAM);
    const a = this.g.audio;
    if (a?.ctx) {
      const o = a.out({ pos: tmpV.set(fl.x, fl.y + 0.8, fl.z), gain: 0.8, reverb: 0.3, ref: 5 });
      a.noise(o, { dur: 1.1, freq: 5200, freqEnd: 2400, gain: 0.32, attack: 0.02 });
    }
  }

  // El siseo del chorro (cada tanto, mientras sale).
  hiss(pos, mine) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: mine ? null : pos, gain: mine ? 0.32 : 0.5, reverb: 0.1, ref: 4 });
    a.noise(o, { dur: 0.26, freq: 3400, freqEnd: 3000, gain: 0.3, attack: 0.03 });
  }

  // ---------------- el extintor en la mano ----------------
  // En primera persona: sube de abajo al agarrarlo y baja al soltarlo.
  vmTick(dt, hold, spraying) {
    const W = this.g.weapons;
    if (!W?.vmRoot) return;
    if (!this.vm && hold) {
      this.vm = extModel(this.g.world.M);
      this.vm.scale.setScalar(0.75);
      W.vmRoot.add(this.vm);
    }
    if (!this.vm) return;
    this.vmK += Math.max(-dt / 0.35, Math.min(dt / 0.35, (hold ? 1 : 0) - this.vmK));
    const k = smooth(this.vmK);
    this.vm.visible = k > 0.01;
    const t = this.g.time;
    const shake = spraying ? Math.sin(t * 60) * 0.004 : 0;
    // (abajo a la derecha, con la boquilla para adelante)
    // (la manguera y la boquilla del lado de adentro, hacia el medio de la pantalla)
    this.vm.position.set(0.33 + shake, -0.5 - (1 - k) * 0.45 + shake, -0.66);
    this.vm.rotation.set(0.14 + (spraying ? -0.06 : 0), -2.2, 0.05);
  }

  // La boquilla en el mundo (para el chorro de este jugador): adelante y abajo a la derecha de la cámara.
  nozzleWorld(out) {
    const cam = this.g.camera;
    cam.getWorldQuaternion(tmpQ);
    return out.set(0.26, -0.4, -0.9).applyQuaternion(tmpQ).add(cam.getWorldPosition(tmpW));
  }

  // La boquilla del extintor del muñeco de otro, en el mundo (o null si no se ve).
  avatarNozzle(a, out) {
    const e = a?.pzExtIn;
    if (!e || !a.pzExt.visible) return null;
    e.updateWorldMatrix(true, false);
    return e.localToWorld(out.copy(e.userData.nozzle));
  }

  // En el muñeco de otro: en la mano (la pieza 6), entra y sale achicándose.
  avatarExt(a, k) {
    if (!a.pzExt) {
      if (k <= 0.001) return;
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      const e = extModel(this.g.world.M);
      holder.add(e);
      a.group.add(holder);
      a.pzExt = holder;
      a.pzExtIn = e;
    }
    const on = k > 0.001;
    a.pzExt.visible = on;
    if (!on) return;
    a.pzExt.matrix.copy(a.mats[6]);
    a.pzExtIn.position.set(0, -0.62, 0.02);
    a.pzExtIn.rotation.set(0, 0, 0);
    a.pzExtIn.scale.setScalar(Math.max(0.001, k));
    a.pzExt.matrixWorldNeedsUpdate = true;
  }

  // Los extintores del estante: el que se lleva alguien se va achicando; vuelven al terminar.
  rackTick(dt, taken) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      s.want = taken.has(i) ? 0 : 1;
      s.k += Math.max(-dt / 0.3, Math.min(dt / 0.5, s.want - s.k));
      const k = smooth(clamp01(s.k));
      s.e.visible = k > 0.01;
      s.e.scale.setScalar(Math.max(0.001, k));
      s.e.position.y = 0.105 + (1 - k) * 0.25;
    }
  }

  reset() {
    this.k.fill(0);
    this.char = 0;
    for (const fl of this.flames) {
      fl.seen = 0;
      fl.grp.visible = false;
      fl.scorch.visible = false;
    }
    this.charGrp.visible = false;
    for (const L of this.lights) L.l.intensity = 0;
  }

  dispose() {
    const g = this.g;
    this.root.removeFromParent();
    this.vm?.removeFromParent();
    const v = g.world.virt;
    for (const L of this.lights) {
      const i = v ? v.indexOf(L.l) : -1;
      if (i >= 0) v.splice(i, 1);
    }
  }
}
