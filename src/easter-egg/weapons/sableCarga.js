import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { warmObject } from '../fx/ghostMat';

// ¡La Carga de San Lorenzo! (el Sable de San Lorenzo con la carga llena,
// weapons/Sable.js): doce Granaderos a Caballo fantasmas salen de atrás del
// jugador y cargan al galope hacia donde mira, ~38 m, pisando y sableando a
// todo lo que encuentran en un pasillo ancho. Celestes y translúcidos, de
// casaca azul, morrión alto con su penacho y el sable en alto.
//
// Baratos: tres mallas instanciadas para los doce (el caballo y el jinete en
// una, con colores por vértice; los muslos y las cañas de las patas en otras
// dos, que galopan como los caballos de La Tapera: entities/Horses.js). Un
// solo shader de ánima (aditivo, borde que brilla, franjas que suben); el
// apagado de cada uno va en el color de la instancia. Nada se arma por cuadro.
// El daño lo hace solo el que cargó (own); los demás la ven (Session 'sable').

const RIDERS = 12;
// el caballo (las mismas medidas de entities/Horses.js)
const LEGS = [
  [0.19, 0.5],
  [-0.19, 0.5],
  [0.19, -0.5],
  [-0.19, -0.5],
];
const HIP_Y = 1.05;
const UPPER = 0.5;
const LOWER = 0.52;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpC = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);
const near = [];
const hitTmp = {};

// ---------------- el shader de ánima (con instancias) ----------------
const TIME = { value: 0 };
const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vN, vV, vC;
varying float vY;
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  n = mat3(instanceMatrix) * n;
#endif
  vec4 wp = modelMatrix * lp;
  // el temblor de ánima
  wp.x += sin(wp.y * 3.3 + uTime * 2.3) * 0.02;
  wp.z += cos(wp.y * 2.9 + uTime * 1.9) * 0.02;
  vY = wp.y;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = mat3(viewMatrix) * mat3(modelMatrix) * n;
  vec3 c = vec3(1.0);
#ifdef USE_COLOR
  c *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  c *= instanceColor;
#endif
  vC = c;
  gl_Position = projectionMatrix * mv;
}`;
// (divisiones con piso: en la placa del usuario isnan no anda)
const FRAG = /* glsl */ `
uniform float uTime, uBase, uRim;
varying vec3 vN, vV, vC;
varying float vY;
void main() {
  float d = length(vV);
  vec3 v = vV / max(d, 1e-4);
  vec3 n = vN / max(length(vN), 1e-4);
  float fr = 1.0 - abs(dot(n, v));
  fr *= fr;
  float band = 0.62 + 0.38 * sin(vY * 13.0 - uTime * 7.0);
  float flick = 0.9 + 0.1 * sin(uTime * 17.0 + vY * 3.0);
  // (el borde en el color de cada pieza; apenas blanco en el canto)
  vec3 col = vC * (uBase * band + uRim * fr * 1.1) + vec3(0.5, 0.75, 1.0) * fr * fr * fr * uRim * 0.25 * max(vC.r, max(vC.g, vC.b));
  gl_FragColor = vec4(max(col, vec3(0.0)) * flick, 1.0);
}`;
let MAT = null;
function ghostMat() {
  MAT ||= new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uBase: { value: 0.13 }, uRim: { value: 0.8 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  return MAT;
}

// ---------------- las mallas ----------------
// Pinta una geometría de un color (por vértice) y la deja con posición, normal y color.
function paint(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// Un cilindro de a hasta b.
function seg(a, b, r0, r1, c, rs = 7) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, rs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, c);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (geo, m) => geo.applyMatrix4(m);
const local = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z);

let GEO = null;
function geos() {
  if (GEO) return GEO;
  // colores (aditivos: brillo de ánima, no pintura)
  const HORSE = [0.2, 0.42, 1.0];
  const MANE = [0.55, 0.75, 1.0];
  const EYE = [1.6, 1.8, 2.0];
  const COAT = [0.1, 0.25, 1.0];
  const PANTS = [0.4, 0.55, 1.0];
  const BELT = [1.0, 1.0, 1.05];
  const FACE = [0.55, 0.7, 0.95];
  const SHAKO = [0.12, 0.2, 0.55];
  const PLUME = [0.95, 1.0, 1.1];
  const BRASS = [1.1, 0.95, 0.6];
  const BLADE = [1.2, 1.32, 1.55];
  const parts = [];
  // el caballo: cuerpo, cogote y cabeza (cabeza un poco gacha, al galope), crines y cola
  const body = mergeGeometries([
    new THREE.CapsuleGeometry(0.33, 0.95, 4, 12).rotateX(Math.PI / 2),
    new THREE.SphereGeometry(0.36, 12, 9).scale(1, 1, 0.9).translate(0, 0.02, -0.52),
    new THREE.SphereGeometry(0.34, 12, 9).translate(0, 0.04, 0.45),
  ].map((g) => paint(g, HORSE)));
  parts.push(at(body, local(0, HIP_Y + 0.22, 0)));
  const H = local(0, HIP_Y + 0.35, 0.55, -0.05, 0, 0);
  parts.push(at(mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.2, 0.78, 10).translate(0, 0.39, 0).rotateX(0.62),
    new THREE.BoxGeometry(0.22, 0.24, 0.52).translate(0, 0.62, 0.62).rotateX(0.18),
    new THREE.BoxGeometry(0.2, 0.18, 0.2).translate(0, 0.52, 0.86).rotateX(0.18),
    new THREE.ConeGeometry(0.04, 0.14, 5).translate(0.07, 0.86, 0.46),
    new THREE.ConeGeometry(0.04, 0.14, 5).translate(-0.07, 0.86, 0.46),
  ].map((g) => paint(g, HORSE))), H));
  parts.push(at(paint(new THREE.BoxGeometry(0.05, 0.16, 0.72).translate(0, 0.08, 0).rotateX(-0.95).translate(0, 0.42, 0.18), MANE), H.clone()));
  for (const sx of [-1, 1]) parts.push(at(paint(new THREE.SphereGeometry(0.035, 6, 5).translate(sx * 0.115, 0.7, 0.58), EYE), H.clone()));
  parts.push(at(paint(mergeGeometries([new THREE.CylinderGeometry(0.06, 0.02, 0.8, 6).translate(0, -0.4, 0), new THREE.CylinderGeometry(0.11, 0.03, 0.6, 6).translate(0, -0.58, 0.02)]), MANE), local(0, HIP_Y + 0.32, -0.95, -1.05, 0, 0)));
  // la montura
  parts.push(paint(new THREE.BoxGeometry(0.5, 0.06, 0.55).translate(0, HIP_Y + 0.56, -0.02), SHAKO));
  // el granadero: muslos y botas a los costados del caballo
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.15, 1.7, -0.02);
    const knee = V(sx * 0.33, 1.42, 0.28);
    const foot = V(sx * 0.33, 1.02, 0.12);
    parts.push(seg(hip, knee, 0.085, 0.07, PANTS));
    parts.push(seg(knee, foot, 0.065, 0.06, SHAKO));
    parts.push(paint(new THREE.BoxGeometry(0.1, 0.08, 0.22).translate(foot.x, foot.y - 0.02, foot.z + 0.06), SHAKO));
  }
  // el torso inclinado al galope, los faldones de la casaca y las bandoleras blancas
  const lean = 0.32;
  const T = local(0, 1.72, -0.04, lean, 0, 0);
  parts.push(at(paint(new THREE.CapsuleGeometry(0.16, 0.36, 4, 10).translate(0, 0.3, 0).scale(1.1, 1, 0.82), COAT), T));
  parts.push(at(paint(new THREE.BoxGeometry(0.36, 0.34, 0.05).translate(0, -0.12, -0.15).rotateX(-0.45), COAT), T.clone()));
  for (const s of [-1, 1]) parts.push(at(paint(new THREE.BoxGeometry(0.045, 0.52, 0.02).rotateZ(s * 0.62).translate(0, 0.3, 0.135), BELT), T.clone()));
  // charreteras
  for (const sx of [-1, 1]) parts.push(at(paint(new THREE.SphereGeometry(0.075, 8, 6).scale(1.3, 0.5, 1).translate(sx * 0.2, 0.52, 0), BRASS), T.clone()));
  // la cabeza y el morrión alto (con su chapa, la visera y el penacho)
  const Hd = T.clone().multiply(local(0, 0.66, 0.06, -lean * 0.6, 0, 0));
  parts.push(at(paint(new THREE.SphereGeometry(0.115, 10, 8), FACE), Hd));
  parts.push(at(paint(new THREE.CylinderGeometry(0.14, 0.118, 0.3, 12).translate(0, 0.22, -0.01), SHAKO), Hd.clone()));
  parts.push(at(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 12).translate(0, 0.37, -0.01), BRASS), Hd.clone()));
  parts.push(at(paint(new THREE.BoxGeometry(0.09, 0.1, 0.02).translate(0, 0.2, 0.12), BRASS), Hd.clone()));
  parts.push(at(paint(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.08, 0.04), SHAKO), Hd.clone()));
  parts.push(at(paint(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 3.2, 1).translate(0, 0.53, 0.04), PLUME), Hd.clone()));
  // el brazo derecho con el sable en alto, apuntando adelante; el izquierdo con las riendas
  const sh = new THREE.Vector3(0.2, 0.5, 0.02).applyMatrix4(T);
  const el = V(0.36, 2.3, 0.28);
  const hand = V(0.38, 2.5, 0.55);
  parts.push(seg(sh, el, 0.06, 0.055, COAT));
  parts.push(seg(el, hand, 0.052, 0.045, COAT));
  parts.push(paint(new THREE.SphereGeometry(0.05, 8, 6).translate(hand.x, hand.y, hand.z), FACE));
  // el sable: curvo, del puño para adelante y arriba
  const bl = [];
  const dir = V(0.02, 0.62, 1).normalize();
  const bend = V(0, 1, -0.6).normalize();
  let prev = hand.clone();
  for (let i = 1; i <= 6; i++) {
    const k = i / 6;
    const p = hand.clone().addScaledVector(dir, k * 0.95).addScaledVector(bend, -k * k * 0.16);
    bl.push(seg(prev, p, 0.022 * (1 - k * 0.5), 0.022 * (1 - k * 0.8) + 0.003, BLADE, 5));
    prev = p;
  }
  parts.push(...bl);
  parts.push(seg(hand.clone().addScaledVector(dir, -0.06).add(V(-0.06, 0, 0)), hand.clone().addScaledVector(dir, -0.06).add(V(0.06, 0, 0)), 0.012, 0.012, BRASS, 5));
  const shL = new THREE.Vector3(-0.2, 0.5, 0.02).applyMatrix4(T);
  const elL = V(-0.32, 1.95, 0.28);
  const handL = V(-0.12, 1.86, 0.52);
  parts.push(seg(shL, elL, 0.06, 0.055, COAT));
  parts.push(seg(elL, handL, 0.052, 0.045, COAT));
  // las riendas, del puño a la boca del caballo
  const mouth = new THREE.Vector3(0, 0.55, 0.8).applyMatrix4(H);
  parts.push(seg(handL, mouth, 0.008, 0.008, MANE, 4));
  const rider = mergeGeometries(parts);
  // las patas
  const upper = paint(new THREE.CapsuleGeometry(0.075, UPPER - 0.1, 3, 8).translate(0, -UPPER / 2, 0), HORSE);
  const lower = mergeGeometries([paint(new THREE.CapsuleGeometry(0.05, LOWER - 0.1, 3, 6).translate(0, -LOWER / 2, 0), HORSE), paint(new THREE.CylinderGeometry(0.06, 0.075, 0.1, 8).translate(0, -LOWER + 0.02, 0.01), MANE)]);
  GEO = { rider, upper, lower };
  return GEO;
}

function placeLocal(base, x, y, z, rx, ry, rz, out) {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpL.makeRotationFromEuler(tmpE).setPosition(x, y, z);
  return out.multiplyMatrices(base, tmpL);
}

export default class Carga {
  constructor(sable) {
    this.s = sable;
    this.g = sable.g;
    this.list = [];
    this.meshes = null;
    this.riders = Array.from({ length: RIDERS }, () => ({ lat: 0, along: 0, speed: 0, ph: 0, f: 0, bob: 0 }));
  }

  // Las mallas (la primera vez que hacen falta; se compilan ya).
  ensure() {
    const g = this.g;
    if (!this.meshes) {
      const G = geos();
      const mat = ghostMat();
      const mk = (geo, n) => {
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        im.renderOrder = 7;
        for (let i = 0; i < n; i++) {
          im.setMatrixAt(i, ZERO);
          im.setColorAt(i, tmpC.setRGB(0, 0, 0));
        }
        return im;
      };
      this.meshes = { rider: mk(G.rider, RIDERS), upper: mk(G.upper, RIDERS * 4), lower: mk(G.lower, RIDERS * 4) };
      this.root = new THREE.Group();
      this.root.name = 'sableCarga';
      this.root.add(this.meshes.rider, this.meshes.upper, this.meshes.lower);
    }
    if (this.root.parent !== g.scene) {
      g.scene.add(this.root);
      this.root.visible = true;
      warmObject(g, this.root);
    }
  }

  get active() {
    return this.list.length > 0;
  }

  // Arranca una carga. o: los pies del que carga; fwd: hacia dónde (horizontal);
  // reach: hasta dónde llegan; C: los datos (half, speed); own: el que cargó.
  start({ o, fwd, reach, C, own, id = 0 }) {
    const g = this.g;
    this.ensure();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const ch = {
      o: o.clone(),
      fwd: fwd.clone().setY(0).normalize(),
      right,
      reach,
      C,
      own,
      id,
      t: 0,
      front: -99,
      hits: new Set(),
      bosses: new Set(),
      hoofT: 0,
      done: false,
      yaw: Math.atan2(fwd.x, fwd.z),
      riders: [],
    };
    // dos filas de seis, la de atrás corrida media plaza
    const half = C.half;
    // (a los dos lados del que carga, con un hueco en el medio: pasan rozándolo)
    const sp = (half - 1.4) / 2;
    for (let i = 0; i < RIDERS; i++) {
      const rank = i < 6 ? 0 : 1;
      const file = i % 6;
      ch.riders.push({
        lat: (file < 3 ? -1 : 1) * (1.4 + (file % 3) * sp + (rank ? sp * 0.5 : 0)) + (Math.random() - 0.5) * 0.2,
        along: -7.5 - rank * 2.7 - Math.random() * 0.7,
        speed: C.speed * (0.96 + Math.random() * 0.08),
        ph: Math.random() * Math.PI * 2,
        f: 0,
        y: o.y,
      });
    }
    this.list.push(ch);
    this.sndStart(own ? null : o.clone().addScaledVector(ch.fwd, 6), ch);
    // un fogonazo celeste atrás, de donde salen
    const back = o.clone().addScaledVector(ch.fwd, -6).add(tmpV.set(0, 1.4, 0));
    g.fx.flash(back, 0x8cd0ff, 12, 0.5, 14);
    for (let i = 0; i < 24; i++) {
      const l = (Math.random() - 0.5) * half * 2;
      g.fx.add.spawn(back.x + right.x * l, back.y + Math.random() * 1.5 - 0.5, back.z + right.z * l, ch.fwd.x * 3, Math.random() * 2, ch.fwd.z * 3, { color: Math.random() < 0.4 ? [1, 1, 1] : [0.4, 0.75, 1], size: 0.12, size1: 0, life: 0.8 + Math.random() * 0.6, drag: 1.2 });
    }
    return ch;
  }

  update(dt) {
    if (!this.list.length) {
      if (this.meshes && this.root.visible) this.hideAll();
      return;
    }
    const g = this.g;
    TIME.value = g.time;
    this.ensure();
    this.root.visible = true;
    // (una carga a la vez se dibuja: la última; la otra, si quedó, termina igual)
    for (const ch of this.list) this.step(ch, dt);
    this.list = this.list.filter((c) => !c.done);
    this.draw(this.list[this.list.length - 1]);
  }

  step(ch, dt) {
    const g = this.g;
    ch.t += dt;
    let front = -99;
    let alive = 0;
    for (const r of ch.riders) {
      r.along += r.speed * dt;
      r.ph += dt * (3 + r.speed * 1.45);
      // aparece de a poco detrás, se apaga al llegar
      const fin = ch.reach - r.along;
      const fadeIn = Math.min(1, ch.t / 0.35);
      const fadeOut = Math.max(0, Math.min(1, fin / 3));
      r.f = fadeIn * fadeOut;
      if (fin > -0.5) alive++;
      if (r.f > 0.05) front = Math.max(front, r.along + 1.3);
      // el polvo celeste de los cascos y las luces que se sueltan
      if (r.f > 0.2 && Math.random() < dt * 9) {
        const x = ch.o.x + ch.fwd.x * r.along + ch.right.x * r.lat;
        const z = ch.o.z + ch.fwd.z * r.along + ch.right.z * r.lat;
        g.fx.alpha.spawn(x, ch.o.y + 0.1, z, -ch.fwd.x * 2 + (Math.random() - 0.5), 0.5 + Math.random(), -ch.fwd.z * 2 + (Math.random() - 0.5), { color: [0.42, 0.55, 0.75], size: 0.2, size1: 1.1, life: 0.9 + Math.random() * 0.5, alpha: 0.22 * r.f, drag: 2, gravity: -0.2 });
        g.fx.add.spawn(x, ch.o.y + 1.2 + Math.random() * 1.2, z, -ch.fwd.x * 4, Math.random() * 0.8, -ch.fwd.z * 4, { color: Math.random() < 0.3 ? [1, 1, 1] : [0.35, 0.7, 1], size: 0.08, size1: 0, life: 0.5 + Math.random() * 0.4, drag: 1.5 });
      }
    }
    const prev = ch.front;
    ch.front = Math.min(ch.reach, front);
    if (ch.own && ch.front > prev) this.s.cargaHits(ch, Math.max(-2, prev - 1.2), ch.front);
    // los cascos: un trueno de galope donde va la carga
    ch.hoofT -= dt;
    if (ch.hoofT <= 0 && alive) {
      ch.hoofT = 0.055;
      const mid = Math.min(ch.reach, Math.max(-6, ch.front - 1.5));
      tmpV.copy(ch.o).addScaledVector(ch.fwd, mid).setY(ch.o.y + 0.4);
      this.sndHooves(tmpV, Math.min(1, alive / 6));
    }
    // el resplandor celeste que llevan encima (las luces de destello de siempre)
    ch.glowT = (ch.glowT || 0) - dt;
    if (ch.glowT <= 0 && alive && ch.front > -4) {
      ch.glowT = 0.22;
      tmpV.copy(ch.o).addScaledVector(ch.fwd, Math.min(ch.reach, ch.front - 1.2)).setY(ch.o.y + 1.6);
      g.fx.flash(tmpV, 0x6fbcff, 5, 0.3, 11);
    }
    // pasan al lado: tiembla el piso
    const me = g.player?.pos;
    if (me && alive) {
      const d = Math.hypot(me.x - (ch.o.x + ch.fwd.x * (ch.front - 2)), me.z - (ch.o.z + ch.fwd.z * (ch.front - 2)));
      if (d < 10) g.fx.addShake(dt * 0.9 * (1 - d / 10));
    }
    if (!alive || ch.t > 6) ch.done = true;
  }

  draw(ch) {
    const M = this.meshes;
    if (!ch) {
      this.hideAll();
      return;
    }
    for (let i = 0; i < RIDERS; i++) {
      const r = ch.riders[i];
      if (r.f <= 0.003) {
        M.rider.setMatrixAt(i, ZERO);
        for (let k = 0; k < 4; k++) {
          M.upper.setMatrixAt(i * 4 + k, ZERO);
          M.lower.setMatrixAt(i * 4 + k, ZERO);
        }
        continue;
      }
      const ph = r.ph;
      const pitch = Math.sin(ph * 2) * 0.06;
      const y = Math.abs(Math.sin(ph)) * 0.12 + 0.15 * (1 - r.f);
      tmpV.copy(ch.o).addScaledVector(ch.fwd, r.along).addScaledVector(ch.right, r.lat);
      tmpV.y = ch.o.y + y;
      tmpE.set(pitch, ch.yaw, Math.sin(ph) * 0.03, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV, tmpQ, tmpS);
      M.rider.setMatrixAt(i, tmpM);
      const f = r.f;
      M.rider.setColorAt(i, tmpC.setRGB(f, f, f));
      // galope: las de atrás juntas y las de adelante juntas, desfasadas
      const a = 0.86;
      const legs = [Math.sin(ph) * a, Math.sin(ph + 0.5) * a, Math.sin(ph + Math.PI) * a, Math.sin(ph + Math.PI + 0.5) * a];
      for (let k = 0; k < 4; k++) {
        const [lx, lz] = LEGS[k];
        const front = lz > 0;
        const sw = legs[k];
        const hip = placeLocal(tmpM, lx, HIP_Y, lz, sw, 0, 0, tmpR);
        M.upper.setMatrixAt(i * 4 + k, hip);
        const knee = tmpL.makeRotationX((front ? -1 : 1) * (0.25 + Math.max(0, front ? -sw : sw) * 0.75)).setPosition(0, -UPPER, 0);
        M.lower.setMatrixAt(i * 4 + k, tmpR.multiply(knee));
        M.upper.setColorAt(i * 4 + k, tmpC.setRGB(f, f, f));
        M.lower.setColorAt(i * 4 + k, tmpC);
      }
    }
    for (const im of [M.rider, M.upper, M.lower]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  hideAll() {
    const M = this.meshes;
    if (!M) return;
    for (const im of [M.rider, M.upper, M.lower]) {
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
    this.root.visible = false;
  }

  clear() {
    this.list.length = 0;
    this.hideAll();
  }

  // ---------------- lo que se escucha ----------------
  // El clarín del toque de carga (bronce: diente de sierra filtrado con
  // vibrato), el relincho de los fantasmas, "¡A la carga!" murmurado y el viento.
  sndStart(pos, ch) {
    const g = this.g;
    const a = g.audio;
    if (!a?.ctx) return;
    const t = a.now + 0.02;
    const o = a.out({ pos, gain: 0.95, reverb: 0.9, ref: 9 });
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    f.Q.value = 2;
    f.connect(o);
    let at = t;
    // sol-do-mi-sol, sol, mi-sol... ¡do!
    for (const [n, d] of [[392, 0.11], [523, 0.11], [659, 0.11], [784, 0.26], [659, 0.11], [784, 0.11], [659, 0.11], [784, 0.26], [1046, 0.75]]) {
      const v = 1 + (Math.random() - 0.5) * 0.004;
      a.tone(f, { t: at, dur: d, type: 'sawtooth', freq: n * v, gain: 0.09, attack: 0.018 });
      a.tone(f, { t: at, dur: d, type: 'triangle', freq: n * v, gain: 0.14, attack: 0.018 });
      a.tone(f, { t: at, dur: d * 0.8, type: 'square', freq: n * 2 * v, gain: 0.012, attack: 0.02 });
      at += d + 0.035;
    }
    // el viento de las ánimas que pasan
    a.noise(o, { t, dur: 3.2, type: 'bandpass', freq: 380, freqEnd: 1400, q: 0.8, gain: 0.35, attack: 0.9 });
    g.later(0.25, () => a.neigh(pos || g.player.pos.clone().addScaledVector(ch.fwd, -5), 1.12));
    g.later(0.75, () => a.neigh(pos || g.player.pos.clone().addScaledVector(ch.fwd, 3), 1.25));
    // (las voces son solo murmullos; con las voces apagadas, solo el clarín)
    if (a.voiceMode !== 'off') g.later(1.35, () => a.murmur('¡A la carga!', 'sargento', a.now));
  }

  // Un golpe de cascos de muchos (k: cuántos quedan).
  sndHooves(pos, k) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const o = a.out({ pos, gain: 0.85, reverb: 0.45, ref: 6 });
    a.hoof(o, t, 0.9 * k);
    a.hoof(o, t + 0.018 + Math.random() * 0.02, 0.7 * k);
    a.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 160, gain: 0.5 * k, brown: true });
  }
}

// El granadero fantasma del Parque (entities/monumento/SableQuest.js) usa las
// mismas mallas y el mismo shader de ánima.
export { geos as cargaGeos, ghostMat as cargaGhostMat, TIME as CARGA_TIME, LEGS as CARGA_LEGS, HIP_Y as CARGA_HIP, UPPER as CARGA_UPPER };
