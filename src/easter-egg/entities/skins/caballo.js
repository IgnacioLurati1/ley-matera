import * as THREE from 'three';
import { local, seg, sstep, packWeights } from '../animalSkin';
import { skinLook } from '../bossSkin';
import { whenModel, MODEL } from '../eclipse/montar';
import { warmObject } from '../../fx/ghostMat';

// El caballo de San Lorenzo (Eclipse Matero): el zaino ensillado de Meshy,
// facetado (public/assets/sotano/modelos/zaino/modelo.glb; el del infierno
// sigue en modelos/caballo). Como el del infierno (entities/horseSkin.js) no
// trae esqueleto: los huesos se arman acá al cargar con las articulaciones
// del GLB (userData.caballo): el cuerpo, el cogote con la cabeza y la crin, la
// cola y muslo y caña de cada pata (las rodillas de adelante doblan para
// atrás y los garrones para adelante, como de verdad). Andares: parado,
// paso, trote y galope (por la velocidad, o fijos) y la caída de costado.
// No es un jefe (no exporta `kind`): lo usa la escena o la pelea de San Lorenzo.
//
//   const C = new Caballos(g);              // uno por escena, en la carga (baja el modelo y compila)
//   const h = C.add({ x, y, z, yaw });      // h.pos, h.yaw, h.speed (m/s) o h.gait
//   C.update(dt);                           // cada cuadro (antes de las monturas)
//   h.caer(lado)                            // +1: cae sobre su derecha; queda tendido
//   h.seatAt(v)                             // el asiento en el mundo (montar.js)
// Mientras no baja el modelo no se dibuja nada (C.ready dice si ya está).

const BODY = 0;
const HEAD = 1;
const TAIL = 2;
const UP = 3; // 3-6
const LOW = 7; // 7-10
const NB = 11;
// lo que mide cada borde entre huesos (m)
const BLEND = 0.1;
// las patas: hasta qué distancia de su eje es pata del todo y desde cuál ya es cuerpo (m)
const LEG_R = [0.1, 0.18];
const TAIL_W = [0.09, 0.15];
// el barril (para acostarlo de costado): la altura del medio parado y la mitad del ancho
const BARREL_Y = 1.08;
const BARREL_R = 0.36;
// los andares: largo del tranco (m por ciclo), parte del ciclo con el vaso en el
// piso, amplitud de la pata (rad), cuánto doblan rodilla y garrón, y el orden de
// las patas (mano +x, mano -x, pata +x, pata -x; +x es la izquierda del caballo)
const GAITS = {
  paso: { L: 1.65, duty: 0.62, A: 0.42, bendF: 0.75, bendB: 0.55, off: [0.25, 0.75, 0, 0.5], bob: 0.012, pitch: 0.012, head: 0.07 },
  trote: { L: 2.5, duty: 0.42, A: 0.5, bendF: 1.05, bendB: 0.8, off: [0, 0.5, 0.5, 0], bob: 0.045, pitch: 0.02, head: 0.05 },
  galope: { L: 4.0, duty: 0.33, A: 0.68, bendF: 1.35, bendB: 1.0, off: [0.57, 0.45, 0.12, 0], bob: 0.07, pitch: 0.075, head: 0.13 },
};
const ORDER = ['parado', 'paso', 'trote', 'galope'];

function bonesFor(X, S, out) {
  out[BODY].copy(S.M);
  const n = X.neck;
  local(out[HEAD], out[BODY], n[0], n[1], n[2], S.headP, S.headY || 0, 0);
  const t = X.tail;
  local(out[TAIL], out[BODY], t[0], t[1], t[2], S.tailR, S.tailY || 0, 0);
  for (let k = 0; k < 4; k++) {
    const G = X.legs[k];
    const L = S.legs[k];
    local(out[UP + k], out[BODY], G.hip[0], G.hip[1], G.hip[2], L.sw, 0, L.out || 0);
    // (mano: la rodilla dobla con la caña para atrás; pata: el garrón, para adelante)
    local(out[LOW + k], out[UP + k], G.knee[0] - G.hip[0], G.knee[1] - G.hip[1], G.knee[2] - G.hip[2], (k < 2 ? 1 : -1) * L.bend, 0, 0);
  }
}
const REST = { M: new THREE.Matrix4(), headP: 0, tailR: 0, legs: [0, 1, 2, 3].map(() => ({ sw: 0, bend: 0 })) };

// Los pesos: las patas, lo cerca de su eje (muslo / caña); la cola, lo angosto
// de atrás; la cabeza, lo que está adelante del corte inclinado del cogote.
function weigh(X, pos) {
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const o1 = {};
  const o2 = {};
  const N = X.neck;
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const W = new Map();
    const add = (b, w) => w > 1e-4 && W.set(b, (W.get(b) || 0) + w);
    let legW = 0;
    for (let k = 0; k < 4; k++) {
      const G = X.legs[k];
      if (Math.sign(p.x) !== Math.sign(G.hip[0])) continue;
      const d1 = seg(p, G.hip, G.knee, o1);
      const d2 = seg(p, G.knee, G.hoof, o2);
      const w = (1 - sstep(LEG_R[0], LEG_R[1], Math.min(d1, d2))) * (d1 <= d2 ? sstep(0, 0.45, o1.t) : 1);
      if (w <= 0) continue;
      const lo = sstep(-0.03, 0.03, d1 - d2);
      add(UP + k, w * (1 - lo));
      add(LOW + k, w * lo);
      legW = Math.max(legW, w);
    }
    let rest = 1 - legW;
    if (rest > 0) {
      const tw = rest * sstep(X.tailZ + BLEND / 2, X.tailZ - BLEND / 2, p.z) * (1 - sstep(TAIL_W[0], TAIL_W[1], Math.abs(p.x)));
      add(TAIL, tw);
      rest -= tw;
      const h = rest * sstep(-BLEND, BLEND, p.z - N[2] + (p.y - N[1]) * X.headTilt);
      add(HEAD, h);
      add(BODY, rest - h);
    }
    packWeights(W, idx, wt, i);
  }
  return { idx, wt };
}

const tE = new THREE.Euler();
const tQ = new THREE.Quaternion();
const tV = new THREE.Vector3();
const tS = new THREE.Vector3();
const ease = (x) => x * x * (3 - 2 * x);
const KEEP = [];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// La pose de una pata en un andar: u, la parte del ciclo de esa pata
function legIn(gt, u, front, out) {
  const A = gt.A;
  if (u < gt.duty) {
    // apoyada: va de adelante (-A) a atrás (+A), derecha
    out.sw = -A + (2 * A * u) / gt.duty;
    out.bend = 0.05;
  } else {
    // en el aire: vuelve para adelante doblada
    const s = (u - gt.duty) / (1 - gt.duty);
    out.sw = A * Math.cos(Math.PI * s);
    out.bend = Math.sin(Math.PI * s) * (front ? gt.bendF : gt.bendB);
  }
  return out;
}

export class Caballo {
  constructor(C, o = {}) {
    this.C = C;
    this.pos = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0);
    this.yaw = o.yaw || 0;
    this.s = o.s || 1;
    this.speed = 0;
    // gait: null = por la velocidad; si no, 'parado' | 'paso' | 'trote' | 'galope'
    this.gait = o.gait || null;
    this.state = 'vivo';
    this.visible = true;
    this.phase = Math.random();
    this.t = Math.random() * 10;
    this.w = { parado: 1, paso: 0, trote: 0, galope: 0 };
    this.pitch = 0;
    this.roll = 0;
    this.bob = 0;
    this.fallT = 0;
    this.lado = 1;
    this.groundY = this.pos.y;
    this.S = { M: new THREE.Matrix4(), headP: 0, headY: 0, tailR: 0, tailY: 0, legs: [0, 1, 2, 3].map(() => ({ sw: 0, bend: 0, out: 0 })) };
    this.mesh = null;
    this.bones = null;
    this.W = Array.from({ length: NB }, () => new THREE.Matrix4());
  }

  // se cae de costado (lado +1: sobre su derecha) y queda tendido
  caer(lado = 1) {
    if (this.state !== 'vivo') return;
    this.state = 'caida';
    this.fallT = 0;
    this.lado = lado;
    this.fallSpeed = this.speed;
    this.groundY = this.pos.y;
  }

  // el asiento de la montura en el mundo
  seatAt(out) {
    const X = this.C.X;
    if (!X) return out.copy(this.pos).setY(this.pos.y + 1.4 * this.s);
    return out.set(X.saddle[0], X.saddle[1], X.saddle[2]).applyMatrix4(this.W[BODY]);
  }

  step(dt) {
    this.t += dt;
    const S = this.S;
    const L = S.legs;
    let y = 0;
    let pitch = 0;
    let roll = 0;
    let dx = 0;
    if (this.state === 'vivo') {
      const v = this.speed;
      const want = this.gait || (v < 0.3 ? 'parado' : v < 2.4 ? 'paso' : v < 5.2 ? 'trote' : 'galope');
      for (const k of ORDER) this.w[k] += ((k === want ? 1 : 0) - this.w[k]) * Math.min(1, dt * 4);
      // el ciclo: lo que avanza sobre el tranco del andar que manda (si está fijo y quieto, a su paso)
      let Lm = 0;
      let wsum = 0;
      for (const k of ORDER.slice(1)) {
        Lm += GAITS[k].L * this.w[k];
        wsum += this.w[k];
      }
      if (wsum > 0.01) {
        const vv = this.gait && v < 0.3 ? { paso: 1.6, trote: 3.6, galope: 8 }[this.gait] || 0 : v;
        this.phase = (this.phase + (dt * vv) / (Lm / wsum)) % 1;
      }
      for (let k = 0; k < 4; k++) {
        L[k].sw = 0;
        L[k].bend = 0;
        L[k].out = 0;
      }
      const tmp = { sw: 0, bend: 0 };
      let head = 0;
      for (const k of ORDER.slice(1)) {
        const w = this.w[k];
        if (w < 0.001) continue;
        const gt = GAITS[k];
        for (let j = 0; j < 4; j++) {
          legIn(gt, (this.phase + gt.off[j]) % 1, j < 2, tmp);
          L[j].sw += tmp.sw * w;
          L[j].bend += tmp.bend * w;
        }
        const ph = this.phase * Math.PI * 2;
        // (el trote y el paso rebotan dos veces por ciclo; el galope, una, con el cuerpo que cabecea)
        y += (k === 'galope' ? 0.5 + 0.5 * Math.sin(ph + 0.6) : Math.abs(Math.sin(ph * 2))) * gt.bob * w;
        pitch += (k === 'galope' ? Math.sin(ph + 2.2) : Math.sin(ph * 2)) * gt.pitch * w;
        head += (k === 'galope' ? Math.sin(ph + 1.1) : Math.sin(ph * 2 + 0.6)) * gt.head * w;
      }
      // parado: respira, mueve la cabeza y la cola
      const wp = this.w.parado;
      const t = this.t;
      S.headP = head + wp * (0.04 * Math.sin(t * 0.45) + 0.03 * Math.max(0, Math.sin(t * 0.13)) ** 8);
      S.headY = wp * 0.12 * Math.sin(t * 0.21);
      S.tailR = 0.08 + 0.35 * this.w.galope + 0.18 * this.w.trote + 0.05 * Math.sin(t * 3.1) * (1 - wp);
      S.tailY = 0.22 * Math.sin(t * 0.9) * wp + 0.08 * Math.sin(this.phase * Math.PI * 4) * (1 - wp);
      y += wp * 0.006 * Math.sin(t * 1.4);
      this.bob = y;
    } else {
      // se cae: las manos se le doblan y clava el pecho, y se va de costado
      this.fallT += dt;
      const f = this.fallT;
      const a = clamp01(f / 0.45);
      const b = clamp01((f - 0.35) / 0.85);
      const eb = ease(b);
      const st = f > 1.25;
      if (st) this.state = 'tendido';
      // (sigue de largo un poco con lo que venía)
      // (sesión 1f, el usuario: "el caballo muerto sigue cabalgando acostado":
      // seguía deslizándose al 30% de su velocidad para siempre. Solo mientras
      // cae. __mduOldHorseSlide: como antes)
      const slide = Math.max(0, (this.fallSpeed || 0) * (1 - a * 0.7) * (globalThis.__mduOldHorseSlide === true ? 1 : 1 - eb)) * dt;
      this.pos.x += Math.sin(this.yaw) * slide;
      this.pos.z += Math.cos(this.yaw) * slide;
      const dip = Math.sin(Math.PI * Math.min(1, a * 1.1)) * (1 - eb);
      pitch = 0.32 * dip;
      y = -0.28 * a * (1 - eb);
      roll = this.lado * 1.48 * eb;
      // acostado: el barril apoya en el piso (el medio a BARREL_R) y no se corre de lado
      const hc = BARREL_Y - 0.28 * a * (1 - eb);
      const want = Math.max(BARREL_R + 0.02, hc * Math.cos(roll));
      y += want - hc * Math.cos(roll);
      dx = Math.sin(roll) * hc * 0.85;
      for (let k = 0; k < 4; k++) {
        const front = k < 2;
        const up = (k === 0 || k === 2) === this.lado > 0;
        // (las manos se doblan al clavarse; ya tendido, las patas flojas, las de arriba un poco recogidas)
        L[k].sw = front ? -0.35 * a * (1 - eb) + 0.25 * eb : 0.3 * a * (1 - eb) - 0.15 * eb;
        L[k].bend = front ? 1.5 * a * (1 - eb) + (up ? 0.6 : 0.25) * eb : 0.35 * (1 - eb) + (up ? 0.45 : 0.15) * eb;
        L[k].out = 0;
      }
      const tt = this.t;
      // tendido: respira, alguna patada floja. (Sesión 1f, el usuario: "los
      // caballos muertos siguen moviéndose": después de unos segundos, quieto
      // del todo. __mduOldHorseKick: sigue respirando y pateando, como antes)
      if (st && (f < 3.5 || globalThis.__mduOldHorseKick === true)) {
        y += 0.008 * Math.sin(tt * 1.2);
        L[0].bend += 0.15 * Math.max(0, Math.sin(tt * 0.7)) ** 6;
      }
      S.headP = 0.45 * dip - 0.2 * eb;
      S.headY = -0.1 * eb * this.lado;
      S.tailR = 0.1 * (1 - eb);
      S.tailY = 0;
      this.bob = 0;
    }
    this.pitch = pitch;
    this.roll = roll;
    tE.set(pitch, this.yaw, roll, 'YXZ');
    tQ.setFromEuler(tE);
    // (el corrimiento de costado, en lo del caballo: x local)
    tV.set(dx * Math.cos(this.yaw), 0, -dx * Math.sin(this.yaw));
    tV.add(this.pos);
    tV.y = this.pos.y + y * this.s;
    S.M.compose(tV, tQ, tS.set(this.s, this.s, this.s));
    // (parado o andando, ningún vaso abajo del piso: si alguno se hunde, el cuerpo sube)
    const X = this.C.X;
    if (X && this.state === 'vivo') {
      bonesFor(X, S, this.W);
      let low = Infinity;
      for (let k = 0; k < 4; k++) {
        const G = X.legs[k];
        tV.set(G.hoof[0] - G.knee[0], G.hoof[1] - G.knee[1] - 0.025, G.hoof[2] - G.knee[2]).applyMatrix4(this.W[LOW + k]);
        low = Math.min(low, tV.y);
      }
      if (low < this.pos.y) S.M.elements[13] += this.pos.y - low;
    }
  }

  // los huesos y la malla (lo llama Caballos.update)
  draw() {
    if (!this.mesh) return;
    this.mesh.visible = this.visible;
    if (!this.visible) return;
    const C = this.C;
    bonesFor(C.X, this.S, this.W);
    for (let i = 0; i < NB; i++) this.bones[i].matrixWorld.copy(this.W[i]);
    const B = this.mesh.boundingSphere;
    B.center.copy(C.bc).applyMatrix4(this.W[BODY]);
    B.radius = C.br * this.s;
    if (this.warm && --this.warm === 0) this.mesh.frustumCulled = true;
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.C.list.delete(this);
  }
}

export class Caballos {
  constructor(g, { parent = null, shadows = true } = {}) {
    this.g = g;
    this.parent = parent || g.scene;
    this.shadows = shadows;
    this.list = new Set();
    this.ready = false;
    this.X = null;
    whenModel(MODEL.caballo, (gltf) => {
      try {
        this.prep(gltf);
      } catch (e) {
        console.warn('caballo: sin modelo', e);
      }
    });
  }

  prep(gltf) {
    let src = null;
    gltf.scene.traverse((o) => {
      if (o.isMesh && !src) src = o;
    });
    const X = src.userData.caballo;
    this.X = X;
    // (los pesos sobre la malla con índices, una vez por vértice; después un
    // vértice por cara con su normal plana: facetado)
    let geo = src.geometry.clone();
    const { idx, wt } = weigh(X, geo.attributes.position);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    this.geo = geo;
    const mat = new THREE.MeshStandardMaterial({ map: src.material.map || null, roughness: 0.85, metalness: 0 });
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    skinLook(mat, { rim: 0.35 });
    this.mat = mat;
    const R = Array.from({ length: NB }, () => new THREE.Matrix4());
    bonesFor(X, REST, R);
    this.inv = R.map((r) => r.clone().invert());
    geo.computeBoundingSphere();
    this.bc = geo.boundingSphere.center.clone();
    // (con margen para las patas estiradas y la caída)
    this.br = geo.boundingSphere.radius * 1.3;
    this.ready = true;
    // (sus programas, ya, con uno de muestra que no entra a la escena: el suyo y
    // los de su sombra —la de la luna y la de los faroles, con textura y sin—,
    // con los mismos materiales que le arma three, como ui/Arrival.js
    // warmShadowPrograms para lo que está en la carga)
    const tmp = new THREE.SkinnedMesh(geo, mat);
    tmp.bind(new THREE.Skeleton(R.map(() => new THREE.Bone()), this.inv), new THREE.Matrix4());
    warmObject(this.g, tmp);
    const RR = this.g.renderer;
    if (mat.map) RR?.initTexture?.(mat.map);
    if (this.shadows && RR?.shadowMap?.enabled && RR.compile) {
      const rt = new THREE.WebGLRenderTarget(1, 1);
      const prev = RR.getRenderTarget();
      const fog = this.g.scene.fog;
      RR.setRenderTarget(rt);
      this.g.scene.fog = null;
      try {
        for (const base of [new THREE.MeshDistanceMaterial(), new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })]) {
          for (const map of [mat.map, null]) {
            const d = base.clone();
            d.side = THREE.BackSide;
            d.map = map;
            tmp.material = d;
            RR.compile(tmp, this.g.camera, this.g.scene);
            // (sin dispose: soltar el material soltaba también el programa)
            KEEP.push(d);
          }
        }
      } catch {
        /* lo que no compila acá, al verlo */
      } finally {
        tmp.material = mat;
        this.g.scene.fog = fog;
        RR.setRenderTarget(prev);
        rt.dispose();
      }
    }
    for (const h of this.list) this.build(h);
  }

  build(h) {
    if (h.mesh) return;
    const bones = Array.from({ length: NB }, () => {
      const b = new THREE.Bone();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      return b;
    });
    const sk = new THREE.Skeleton(bones, this.inv.map((m) => m.clone()));
    const mesh = new THREE.SkinnedMesh(this.geo, this.mat);
    mesh.name = 'zaino';
    mesh.bind(sk, new THREE.Matrix4());
    mesh.boundingSphere = new THREE.Sphere();
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = true;
    // (los huesos no están en la escena: la malla queda en el origen del padre, que no se mueve)
    mesh.matrixAutoUpdate = false;
    h.mesh = mesh;
    h.bones = bones;
    h.warm = 4;
    this.parent.add(mesh);
  }

  add(o = {}) {
    const h = new Caballo(this, o);
    this.list.add(h);
    if (this.ready) this.build(h);
    h.step(0);
    if (this.ready) h.draw();
    return h;
  }

  update(dt) {
    for (const h of this.list) {
      h.step(dt);
      h.draw();
    }
  }

  dispose() {
    for (const h of this.list) h.mesh?.removeFromParent();
    this.list.clear();
    this.mat?.dispose();
    this.geo?.dispose();
  }
}
