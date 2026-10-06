import * as THREE from 'three';
import Avatars from '../../net/Avatars';
import { sanMartin } from '../skins/sanmartin';
import { granadero } from '../skins/granadero';
import { Caballos } from '../skins/caballo';
import { Montura, POSE, prepararPersonas, addPerson } from './montar';
import { belgranoSkin, whenBelgrano } from '../monumento/belgranoSkin';
import { toWorld, toLocal, hLoc, yawOf, dirWorld, edgeU, F } from '../../world/eclipse/sanlorenzoCampo';

// Los de nuestro lado en San Lorenzo (entities/eclipse/SanLorenzo.js):
//  · San Martín (skins/sanmartin.js, sobre el zaino de skins/caballo.js con
//    entities/eclipse/montar.js): a pie junto a su caballo hasta que el Gil le
//    da el sable; después a caballo, al lado del portón: señala cada carga y
//    encabeza las de la pinza. Su caballo cae en la escena de Cabral; para la
//    fase 4 tiene otro (el de repuesto, escondido hasta entonces).
//  · Belgrano (entities/monumento/belgranoSkin, sólido) con la bandera:
//    enrollada al llegar; la planta cerca del muro y la va corriendo con las
//    fases. Donde está plantada hay un respiro (lo decide SanLorenzo).
//  · Los granaderos: dos escuadrones (norte y sur) formados en la huerta. Una
//    carga sale por la punta del muro, barre un carril del campo de oeste a
//    este a galope tendido (el anfitrión mata a los muertos que agarra; a los
//    jugadores no les hace nada), da la vuelta por el borde y vuelve a formar.
//    Cabral es el primero del escuadrón norte.
// Todo con guion, sin navegación: caminos fijos (curvas) y puntos.
// Orden por cuadro (montar.js): caballos → monturas → personas.

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const L = {};
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angLerp = (a, b, k) => a + wrapPi(b - a) * k;
// el yaw de un muñeco de Avatars (mira a -z con yaw 0) para un caballo/dirección con yaw del mundo h
const puppetYaw = (h) => h + Math.PI;

// los escuadrones: dónde forman (u, v del primero; v crece hacia afuera) y cuántos
const FORM_U = -48.3;
const FORM_V0 = 14.6;
const FORM_DV = 2.35;
// el carril de la carga: medio ancho de lo que barre (m)
export const LANE_HALF = 4.6;
// velocidades (m/s): galope tendido, al trote largo y al paso
const V_GAL = 11.5;
const V_TRO = 6.2;
const V_VUELTA = 8;
// San Martín a caballo, esperando: adelante del portón norte
const SM_WAIT = [-40.8, 13.4];
// Belgrano y la bandera: dónde está en cada fase (0 llega; 1 cerca del muro; 2 el medio; 3 adelante)
export const FLAG_SPOTS = [
  [-49.6, -8.2],
  [-38.4, 0.6],
  [-14.5, -3.5],
  [8.5, 3.5],
];

// La bandera de Belgrano: celeste, blanca y celeste.
function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = '#74acdf';
  x.fillRect(0, 0, 64, 48);
  x.fillStyle = '#f4f4ee';
  x.fillRect(0, 16, 64, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class Aliados {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    const g = this.g;
    this.t = 0;
    const q = g.settings?.quality;
    this.low = q === 'perf' || q === 'low';
    // (bajan los modelos y se compilan ya, con el mapa)
    prepararPersonas(g);
    this.C = new Caballos(g, { parent: sl.actors, shadows: !this.low });
    this.people = new Avatars(g, null);
    sl.actors.add(this.people.root);
    this.monts = [];
    this.buildSanMartin();
    this.buildBelgrano();
    this.buildSquadrons();
    this.dust = [];
  }

  // ---------------- San Martín ----------------
  buildSanMartin() {
    const at = toWorld(-47.0, 6.6);
    const a = sanMartin(this.people, { id: 470, pos: at, yaw: 0, sable: 'corvo' });
    const h = this.C.add({ x: 0, y: 0, z: 0, yaw: 0 });
    const r = a.r;
    // el de repuesto (para la fase 4), escondido en la huerta
    const spare = this.C.add({ x: 0, y: 0, z: 0, yaw: 0 });
    spare.visible = false;
    this.sm = { a, r, h, spare, mode: 'pie', t: 0, mont: null, sable: false, from: null, say: null, look: null, k: 0 };
    r.poseFn = (P) => this.smPose(P);
  }

  // A pie junto al caballo, sin sable, mirando a donde llegan los jugadores.
  smReset() {
    const S = this.sm;
    S.mode = 'pie';
    S.t = 0;
    S.sable = false;
    if (S.mont) {
      S.mont = null;
      this.monts = this.monts.filter((m) => m.a !== S.a);
    }
    S.r.poseFn = (P) => this.smPose(P);
    toWorld(-47.0, 6.6, null, S.r.pos);
    S.r.yaw = puppetYaw(yawOf(-0.35, -1));
    S.r.moving = false;
    S.r.speed = 0;
    S.r.dead = false;
    this.placeHorse(S.h, -47.9, 10.2, yawOf(1, 0.05));
    S.h.state = 'vivo';
    S.h.visible = true;
    S.h.gait = null;
    S.h.speed = 0;
    S.spare.visible = false;
  }

  placeHorse(h, u, v, yaw) {
    toWorld(u, v, null, h.pos);
    h.groundY = h.pos.y;
    h.yaw = yaw;
  }

  // El Gil le da el sable (giver: dónde está el que se lo da). Lo agarra, lo
  // alza y monta. Devuelve cuánto dura.
  smTakeSable(giver) {
    const S = this.sm;
    if (S.mode !== 'pie') return 0;
    S.mode = 'recibe';
    S.t = 0;
    if (giver) S.r.yaw = puppetYaw(Math.atan2(giver.x - S.r.pos.x, giver.z - S.r.pos.z));
    return 5.2;
  }

  smPose(P) {
    const S = this.sm;
    const t = this.t;
    const u = S.t;
    if (S.mode === 'pie') {
      POSE.firme(P, t);
      return;
    }
    if (S.mode === 'recibe') {
      POSE.firme(P, t);
      // estira la mano (0-0.8 s), lo agarra (0.8), lo mira y lo alza (1.4-2.6 s)
      const reach = ease(u / 0.8) * (1 - ease((u - 1.1) / 0.5));
      P.shLp += (-1.15 - P.shLp) * reach;
      P.elL += (-0.35 - P.elL) * reach;
      P.headP += 0.18 * reach;
      const up = ease((u - 1.3) / 1.0);
      if (up > 0) {
        P.shLp += (-2.85 - P.shLp) * up;
        P.shLr += (-0.18 - P.shLr) * up;
        P.elL += (-0.12 - P.elL) * up;
        P.headP += (-0.32 - P.headP) * up;
        P.torsoP -= 0.06 * up;
      }
      // y lo baja de a poco antes de montar
      const down = ease((u - 3.9) / 0.9);
      if (down > 0) POSE.guardia(P, t);
      return;
    }
    if (S.mode === 'monta') {
      // del suelo a la montura: el cuerpo pasa de parado a sentado
      const k = ease(u / 0.95);
      const A = {};
      POSE.firme(A, t);
      POSE.guardia(A, t);
      const B = {};
      POSE.montado(B, t, 0);
      for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) P[key] = (A[key] ?? 0) + ((B[key] ?? 0) - (A[key] ?? 0)) * k;
      P.rootY = S.r.pos.y;
      P.rootPitch = 0;
      P.rootRoll = 0;
      P.rootFwd = 0;
      P.hipY = 0.93;
    }
  }

  // Monta (de donde está a la montura de su caballo h).
  smMount(h = this.sm.h) {
    const S = this.sm;
    S.mode = 'monta';
    S.t = 0;
    S.from = { pos: S.r.pos.clone(), yaw: S.r.yaw };
    S.mh = h;
    if (!S.mont || S.mont.h !== h) {
      this.monts = this.monts.filter((m) => m.a !== S.a);
      const m = new Montura(S.a, h, { brazos: 'sable' });
      S.mont = m;
    }
    // (Montura ya puso su pose: mientras sube, la de acá)
    S.r.poseFn = (P) => this.smPose(P);
  }

  smUpdate(dt) {
    const S = this.sm;
    S.t += dt;
    if (S.mode === 'recibe' && S.t >= 5.2) this.smMount();
    if (S.mode === 'recibe' && S.t > 0.85 && !S.sable) {
      S.sable = true;
      this.g.audio?.whoosh?.(S.r.pos);
    }
    if (S.mode === 'monta') {
      const m = S.mont;
      const seat = m.seat({});
      const k = ease(S.t / 0.95);
      const F0 = S.from;
      S.r.pos.set(F0.pos.x + (seat.x - F0.pos.x) * k, F0.pos.y + (seat.y - F0.pos.y) * k + Math.sin(Math.PI * k) * 0.35, F0.pos.z + (seat.z - F0.pos.z) * k);
      S.r.yaw = angLerp(F0.yaw, seat.yaw - Math.PI, k);
      if (S.t >= 0.95) {
        S.mode = 'montado';
        S.r.poseFn = (P) => m.pose(P);
        this.monts.push(m);
      }
    }
    // el sable: escondido hasta que se lo dan
    if (S.a.gs?.sable) S.a.gs.sable.visible = S.sable;
  }

  // ---------------- Belgrano ----------------
  buildBelgrano() {
    const g = this.g;
    const r = { id: 466, name: '', noTag: true, pos: toWorld(...FLAG_SPOTS[0]), yaw: 0, pitch: 0, speed: 0, moving: false };
    const a = addPerson(this.people, r, (aa) => belgranoSkin(aa));
    // (sólido: en el Monumento es un ánima que aparece)
    whenBelgrano(() => {
      const m = a.M.belgrano;
      if (!m) return;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      // (la textura del ánima del Monumento es muy clara: sólido y con el sol
      // del eclipse, el pantalón y la banda se quemaban en blanco)
      m.color.setScalar(globalThis.__mduNoBelDim === true ? 1 : 0.62);
      m.needsUpdate = true;
    });
    // la levita oscura y sin sombrero (mientras baja el modelo, el muñeco de piezas)
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 });
    a.M.coat = coat;
    if (a.M.pants) a.M.pants.color.set(0xe8e4d8);
    a.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === a.M.hat || o.material === a.M.band) o.visible = false;
      if (o.material === a.M.poncho) o.material = coat;
    });
    for (const p of a.parts || []) if (p.material === a.M.poncho) p.material = coat;
    for (const c of a.hand.children) c.visible = false;
    r.poseFn = (P) => this.belPose(P);
    // la bandera: el asta, el paño (con su ondear) y el rollo de cuando está enrollada
    const flag = new THREE.Group();
    flag.name = 'slBandera';
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 3.3, 6).translate(0, 1.65, 0), wood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6).translate(0, 3.38, 0), new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.8, roughness: 0.3 }));
    const clothGeo = new THREE.PlaneGeometry(1.5, 1.0, 12, 6).translate(0.75, 0, 0);
    this.cloth0 = clothGeo.attributes.position.array.slice();
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
    cloth.position.set(0.03, 2.72, 0);
    cloth.castShadow = !this.low;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8).translate(0.0, 2.75, 0), new THREE.MeshStandardMaterial({ color: 0xbcd6ee, roughness: 0.9 }));
    flag.add(pole, tip, cloth, roll);
    // el respiro: un aro de luz en el piso donde está plantada
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.6, 6, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ac8ff).multiplyScalar(0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    ring.renderOrder = 2;
    this.sl.actors.add(flag, ring);
    this.bel = { a, r, flag, cloth, roll, ring, spot: 0, path: [], planted: false, unfurl: 0, pulse: 0, k: 0 };
  }

  // Belgrano a su lugar de la fase: camina (pasando por el portón sur si cruza el muro).
  belTo(i, now = false) {
    const B = this.bel;
    const [u1, v1] = FLAG_SPOTS[i];
    B.spot = i;
    if (now) {
      toWorld(u1, v1, null, B.r.pos);
      B.path = [];
      B.planted = i > 0;
      B.unfurl = i > 0 ? 1 : 0;
      return;
    }
    toLocal(B.r.pos.x, B.r.pos.z, L);
    const pts = [];
    const W = F.wallU;
    // (cruza el muro por el portón sur)
    if ((L.u < W) !== (u1 < W)) {
      const gv = (F.gates[0][0] + F.gates[0][1]) / 2;
      pts.push([W + (L.u < W ? -1.8 : 1.8), gv], [W + (L.u < W ? 1.8 : -1.8), gv]);
    }
    pts.push([u1, v1]);
    B.path = pts;
    B.planted = false;
  }

  belPose(P) {
    const B = this.bel;
    const t = this.t;
    POSE.firme(P, t, !B.r.moving);
    // con la bandera en la mano (la derecha del modelo: las piezas "L")
    if (!B.planted) {
      P.shLp = -0.62;
      P.shLr = -0.05;
      P.elL = -1.25;
      P.torsoR = 0.03;
    } else {
      // plantada: la mano izquierda apoyada en el asta, mira el campo
      P.shRp = -0.35;
      P.shRr = 0.2;
      P.elR = -0.9;
      P.headY = 0.25 * Math.sin(t * 0.3);
    }
  }

  belUpdate(dt) {
    const B = this.bel;
    const r = B.r;
    // camina por su camino
    if (B.path.length) {
      const [u, v] = B.path[0];
      const to = toWorld(u, v, null, tmpV);
      const dx = to.x - r.pos.x;
      const dz = to.z - r.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = 1.55;
      if (d < 0.15) B.path.shift();
      else {
        const s = Math.min(d, sp * dt);
        r.pos.x += (dx / d) * s;
        r.pos.z += (dz / d) * s;
        toLocal(r.pos.x, r.pos.z, L);
        r.pos.y = hLoc(L.u, L.v);
        r.yaw = angLerp(r.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 6));
      }
      r.moving = B.path.length > 0;
      r.speed = r.moving ? sp : 0;
      if (!B.path.length) {
        B.planted = B.spot > 0;
        if (B.planted) this.g.audio?.land?.();
      }
    } else {
      r.moving = false;
      r.speed = 0;
      // plantada: mira para el río
      if (B.planted) r.yaw = angLerp(r.yaw, puppetYaw(yawOf(1, 0.15)), Math.min(1, dt * 2));
    }
    B.unfurl = Math.min(1, Math.max(0, B.unfurl + (B.planted ? dt / 1.3 : -dt / 0.6)));
  }

  // Después de people.update: la bandera en la mano o clavada.
  flagPose(dt) {
    const B = this.bel;
    const r = B.r;
    const F2 = B.flag;
    // (adelante y a la derecha del cuerpo de Belgrano)
    const fy = r.yaw + Math.PI;
    const fwd = tmpW.set(Math.sin(fy), 0, Math.cos(fy));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    // (el paño va a lo largo de +x del grupo: este giro lo manda hacia (dx, dz))
    const yawX = (dx, dz) => Math.atan2(-dz, dx);
    if (!B.planted) {
      // en la mano: el asta al costado, un poco inclinada para atrás; el paño atrás
      F2.position.copy(r.pos).addScaledVector(right, -0.34).addScaledVector(fwd, 0.22);
      F2.position.y += 0.35 + (r.moving ? Math.abs(Math.sin(this.t * 7)) * 0.03 : 0);
      F2.rotation.set(0, yawX(-fwd.x, -fwd.z), 0.08);
    } else if (!B.plantAt) {
      B.plantAt = F2.position.clone();
      B.plantAt.y = r.pos.y;
    }
    if (B.planted && B.plantAt) {
      F2.position.copy(B.plantAt);
      // (flamea hacia el norte del campo, con el viento del río)
      const d = dirWorld(-0.25, 1, tmpV);
      F2.rotation.set(0, yawX(d.x, d.z), 0);
    }
    if (!B.planted) B.plantAt = null;
    // el paño: se despliega y flamea
    const k = ease(B.unfurl);
    B.roll.visible = k < 0.5;
    B.cloth.visible = k > 0.02;
    if (B.cloth.visible) {
      B.cloth.scale.set(Math.max(0.04, k), 1, 1);
      const pos = B.cloth.geometry.attributes.position;
      const a0 = this.cloth0;
      const t = this.t;
      for (let i = 0; i < pos.count; i++) {
        const x = a0[i * 3];
        const y = a0[i * 3 + 1];
        const w = x / 1.5;
        pos.setXYZ(i, x, y - w * w * 0.12, Math.sin(x * 3.2 - t * 5.2 + y * 0.6) * 0.13 * w + Math.sin(x * 7 - t * 9.1) * 0.025 * w);
      }
      pos.needsUpdate = true;
      B.cloth.geometry.computeVertexNormals();
    }
    // el aro del respiro (y su pulso)
    B.pulse = Math.max(0, B.pulse - dt * 0.8);
    const on = B.planted ? 1 : 0;
    B.k += (on - B.k) * Math.min(1, dt * 2);
    B.ring.visible = B.k > 0.01;
    if (B.ring.visible) {
      B.ring.position.set(F2.position.x, (B.plantAt?.y ?? r.pos.y) + 0.06, F2.position.z);
      B.ring.material.opacity = B.k * (0.22 + 0.08 * Math.sin(this.t * 2) + B.pulse * 0.8);
      B.ring.scale.setScalar(1 + B.pulse * 0.08);
    }
  }

  // Dónde está la bandera plantada (null si no está plantada).
  flagAt() {
    const B = this.bel;
    return B.planted && B.plantAt ? B.plantAt : null;
  }

  // ---------------- los granaderos ----------------
  buildSquadrons() {
    const n = this.low ? 4 : this.g.settings?.quality === 'medium' ? 5 : 6;
    this.n = n;
    this.sq = [1, -1].map((side, si) => {
      const riders = [];
      for (let i = 0; i < n; i++) {
        const cabral = si === 0 && i === 0;
        const a = granadero(this.people, { id: 480 + si * 10 + i, pos: new THREE.Vector3(), yaw: 0, cabral });
        const h = this.C.add({ x: 0, y: 0, z: 0, yaw: 0 });
        const m = new Montura(a, h, { brazos: 'riendas' });
        this.monts.push(m);
        riders.push({ a, h, m, i, cabral, slot: null, lat: 0, along: 0, k: 0 });
      }
      return { side, si, riders, state: 'formed', s: 0, path: null, laneA: 0, laneB: 0, lane: 0, lead: false, t: 0, hits: new Set(), hoofT: 0 };
    });
    this.cabral = this.sq[0].riders[0];
  }

  // Todos a formar (en la huerta, mirando al muro).
  formAll() {
    for (const S of this.sq) {
      S.state = 'formed';
      S.path = null;
      S.lead = false;
      S.riders.forEach((R, i) => {
        const v = S.side * (FORM_V0 + i * FORM_DV);
        R.slot = { u: FORM_U, v };
        this.placeHorse(R.h, FORM_U, v, yawOf(1, 0));
        R.h.speed = 0;
        R.h.gait = null;
        R.h.visible = true;
        R.a.r.dead = false;
        R.m.brazos = 'riendas';
        // en dos filas al cargar: el lugar de cada uno en la columna
        const k = Math.ceil(S.riders.length / 2);
        const rank = Math.floor(i / k);
        const file = i % k;
        R.lat = (file - (k - 1) / 2) * 2.5 * S.side;
        R.along = -rank * 3.6;
      });
    }
  }

  // El camino de una carga del lado `side` por el carril v = lane.
  chargePath(side, lane) {
    const e = edgeU(lane);
    const s = side;
    const P = [
      [FORM_U, s * (FORM_V0 + FORM_DV * 1.5)],
      [FORM_U + 0.4, s * 29.5],
      [-41.5, s * 35.5],
      [-34.5, s * 31],
      [-28, lane + s * 4],
      [-22, lane],
      [e - 6, lane],
      [e - 10, lane + s * 9],
      [e - 16, s * 41],
      [-28, s * 41.8],
      [-39.5, s * 38.5],
      [FORM_U + 0.6, s * 31.5],
      [FORM_U, s * (FORM_V0 + FORM_DV * 1.5)],
    ];
    const pts = P.map(([u, v]) => toWorld(u, v, 0, new THREE.Vector3()).setY(0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const len = curve.getLength();
    // dónde empieza y termina el barrido (lo más cerca de los puntos 5 y 6)
    const near = (p) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i <= 400; i++) {
        curve.getPointAt(i / 400, tmpV);
        const d = tmpV.distanceToSquared(p);
        if (d < bd) {
          bd = d;
          best = i / 400;
        }
      }
      return best * len;
    };
    return { curve, len, laneA: near(pts[5]), laneB: near(pts[6]), lane, dir: dirWorld(1, 0, new THREE.Vector3()) };
  }

  // Sale una carga (todas las compus). lead: San Martín va adelante.
  charge(side, lane, lead = false) {
    const S = this.sq[side > 0 ? 0 : 1];
    if (S.state !== 'formed') return false;
    const path = this.chargePath(S.side, lane);
    S.state = 'charge';
    S.path = path;
    S.s = 0;
    S.t = 0;
    S.lead = lead && S.si === 0;
    S.hits.clear();
    for (const R of S.riders) {
      R.k = 0;
      R.from = { pos: R.h.pos.clone(), yaw: R.h.yaw };
    }
    // (el que vuelve de la escena de Cabral se suma)
    if (S.lead) {
      const M = this.sm;
      M.lead = { from: { pos: M.h.pos.clone(), yaw: M.h.yaw }, k: 0 };
    }
    this.laneDust(path);
    this.clarin();
    return true;
  }

  busy(side) {
    return this.sq[side > 0 ? 0 : 1].state !== 'formed';
  }

  // La velocidad de la columna en el punto s del camino.
  speedAt(S, s) {
    const P = S.path;
    if (s < P.laneA - 8) return Math.min(V_TRO + (V_GAL - V_TRO) * clamp01((s - 6) / Math.max(1, P.laneA - 14)), 2 + s * 0.8);
    if (s < P.laneB + 6) return V_GAL;
    // (la vuelta al trote largo y, al llegar, al paso hasta su lugar)
    const left = P.len - s;
    if (left < 20) return Math.max(0.8, V_VUELTA * (left / 20));
    return V_VUELTA;
  }

  sqUpdate(S, dt) {
    if (S.state !== 'charge') return;
    const P = S.path;
    const g = this.g;
    S.t += dt;
    const v = this.speedAt(S, S.s);
    S.s = Math.min(P.len + 6, S.s + v * dt);
    const end = S.s >= P.len + 5;
    const n = S.riders.length;
    const lead = S.lead && this.sm.lead && this.sm.mode === 'montado';
    // cada uno en su lugar de la columna (con el desfasaje de su fila)
    const place = (h, along, lat, from, kIn) => {
      const s = Math.max(0, Math.min(P.len, S.s + along));
      const u = s / P.len;
      P.curve.getPointAt(u, tmpV);
      P.curve.getTangentAt(u, tmpW);
      tmpW.y = 0;
      tmpW.normalize();
      // (a la derecha del camino: -z de la tangente girada)
      const x = tmpV.x + -tmpW.z * lat;
      const z = tmpV.z + tmpW.x * lat;
      toLocal(x, z, L);
      const y = hLoc(L.u, L.v);
      const yaw = Math.atan2(tmpW.x, tmpW.z);
      // al salir, de su lugar en la fila a la columna; al volver, de la columna a su lugar
      const px = h.pos.x;
      const pz = h.pos.z;
      if (kIn < 1) {
        h.pos.set(from.pos.x + (x - from.pos.x) * kIn, 0, from.pos.z + (z - from.pos.z) * kIn);
        h.yaw = angLerp(from.yaw, yaw, kIn);
      } else {
        h.pos.set(x, 0, z);
        h.yaw = yaw;
      }
      toLocal(h.pos.x, h.pos.z, L);
      h.pos.y = hLoc(L.u, L.v);
      h.groundY = h.pos.y;
      h.speed = dt > 0 ? Math.hypot(h.pos.x - px, h.pos.z - pz) / dt : 0;
      if (h.speed > 25) h.speed = v;
      return y;
    };
    for (const R of S.riders) {
      // (el que se llevó la escena de Cabral)
      if (R.scene) continue;
      R.k = Math.min(1, R.k + dt / 1.6);
      // (al final, cada uno a su lugar en la fila)
      const back = clamp01((S.s - (P.len - 9)) / 9);
      if (back > 0 && R.slot) {
        place(R.h, R.along, R.lat, R.from, ease(R.k));
        const to = toWorld(R.slot.u, R.slot.v, null, tmpV);
        R.h.pos.x += (to.x - R.h.pos.x) * ease(back);
        R.h.pos.z += (to.z - R.h.pos.z) * ease(back);
        R.h.yaw = angLerp(R.h.yaw, yawOf(1, 0), ease(back));
        toLocal(R.h.pos.x, R.h.pos.z, L);
        R.h.pos.y = hLoc(L.u, L.v);
      } else place(R.h, R.along, R.lat, R.from, ease(R.k));
      const inLane = S.s + R.along > P.laneA - 10 && S.s + R.along < P.laneB + 4;
      R.m.brazos = inLane ? 'carga' : R.h.speed > 3 ? 'sable' : 'riendas';
    }
    if (lead) {
      const M = this.sm;
      M.lead.k = Math.min(1, M.lead.k + dt / 1.6);
      place(M.h, 4.2, 0, M.lead.from, ease(M.lead.k));
      const inLane = S.s + 4 > P.laneA - 10 && S.s + 4 < P.laneB + 4;
      M.mont.brazos = inLane ? 'carga' : 'sable';
    }
    // el anfitrión: los muertos del carril (los que agarra la primera fila)
    if (this.sl.host) this.chargeHits(S);
    // los cascos y el polvo
    this.chargeFx(S, dt);
    if (end) {
      S.state = 'formed';
      S.path = null;
      for (const R of S.riders) {
        if (R.scene) continue;
        this.placeHorse(R.h, R.slot.u, R.slot.v, yawOf(1, 0));
        R.h.speed = 0;
        R.m.brazos = 'riendas';
      }
      if (S.lead) {
        S.lead = false;
        this.sm.lead = null;
        this.smToWait(true);
      }
    }
  }

  // (anfitrión) Los muertos que agarra la carga en el carril: el frente de la
  // primera fila y un poco atrás, en todo el ancho.
  chargeHits(S) {
    const g = this.g;
    const P = S.path;
    const front = S.s + (S.lead ? 4.2 : 0);
    if (front < P.laneA - 4 || S.s - 6 > P.laneB) return;
    P.curve.getPointAt(clamp01(Math.min(P.len, front) / P.len), tmpV);
    toLocal(tmpV.x, tmpV.z, L);
    const fu = L.u;
    const lane = P.lane;
    const dir = dirWorld(1, 0, new THREE.Vector3());
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || S.hits.has(z.id)) continue;
      toLocal(z.pos.x, z.pos.z, L);
      if (Math.abs(L.v - lane) > LANE_HALF + 0.6) continue;
      if (L.u > fu + 1.6 || L.u < fu - 7.5) continue;
      S.hits.add(z.id);
      const out = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.75, (Math.random() - 0.5) * 0.6)).normalize();
      const point = new THREE.Vector3(z.pos.x, z.pos.y + 1.1, z.pos.z);
      g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', zone: 'torso', point, dir: out, noPoints: true });
      this.sl.onAllyKill?.(z);
    }
  }

  chargeFx(S, dt) {
    const g = this.g;
    S.hoofT -= dt;
    let fastest = 0;
    let mid = null;
    for (const R of S.riders) {
      const sp = R.h.speed || 0;
      if (sp > fastest) {
        fastest = sp;
        mid = R.h.pos;
      }
      // el polvo de los cascos
      if (sp > 4 && Math.random() < dt * (sp > 9 ? 7 : 3)) {
        const p = R.h.pos;
        g.fx.alpha.spawn(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.15, p.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, { color: [0.42, 0.36, 0.28], size: 0.35, size1: 1.6, life: 1.1 + Math.random() * 0.7, alpha: 0.28, drag: 1.6, gravity: -0.15 });
      }
    }
    if (mid && fastest > 2 && S.hoofT <= 0) {
      const A = g.audio;
      S.hoofT = fastest > 9 ? 0.07 : 0.16;
      if (A?.ctx) {
        const o = A.out({ pos: mid, gain: 0.8, reverb: 0.35, ref: 7 });
        const t = A.now;
        A.hoof(o, t, Math.min(1, fastest / 10));
        A.hoof(o, t + 0.02 + Math.random() * 0.03, 0.7 * Math.min(1, fastest / 10));
        if (fastest > 9) A.noise(o, { t, dur: 0.1, type: 'lowpass', freq: 160, gain: 0.35, brown: true });
      }
      if (Math.random() < 0.02) A?.neigh?.(mid, 0.95 + Math.random() * 0.2);
    }
  }

  // El aviso: un carril de polvo en el pasto, por donde va a pasar.
  laneDust(P) {
    this.dust.push({ P, t: 0 });
  }

  dustUpdate(dt) {
    const g = this.g;
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const D = this.dust[i];
      D.t += dt;
      if (D.t > 3.2) {
        this.dust.splice(i, 1);
        continue;
      }
      const n = Math.floor(dt * 34 + Math.random());
      for (let k = 0; k < n; k++) {
        const s = D.P.laneA + Math.random() * (D.P.laneB - D.P.laneA);
        D.P.curve.getPointAt(clamp01(s / D.P.len), tmpV);
        const side = (Math.random() < 0.5 ? -1 : 1) * LANE_HALF * (0.85 + Math.random() * 0.2);
        const d = dirWorld(0, side, tmpW);
        const x = tmpV.x + d.x;
        const z = tmpV.z + d.z;
        toLocal(x, z, L);
        const y = hLoc(L.u, L.v);
        g.fx.alpha.spawn(x, y + 0.1, z, 0, 0.5 + Math.random() * 0.5, 0, { color: [0.5, 0.44, 0.34], size: 0.3, size1: 1.3, life: 1.4, alpha: 0.32, drag: 1.2, gravity: -0.1 });
      }
    }
  }

  // El toque de carga del clarín, arriba en el campanario.
  clarin() {
    const g = this.g;
    const a = g.audio;
    if (!a?.ctx) return;
    const [tu0, tu1, tv0, tv1] = F.tower;
    const pos = toWorld((tu0 + tu1) / 2, (tv0 + tv1) / 2, null, new THREE.Vector3());
    pos.y += 17;
    const t = a.now + 0.02;
    const o = a.out({ pos, gain: 1.1, reverb: 0.9, ref: 18 });
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3000;
    f.Q.value = 2;
    f.connect(o);
    let at = t;
    for (const [n, d] of [[392, 0.11], [523, 0.11], [659, 0.11], [784, 0.26], [659, 0.11], [784, 0.11], [659, 0.11], [784, 0.26], [1046, 0.75]]) {
      const v = 1 + (Math.random() - 0.5) * 0.004;
      a.tone(f, { t: at, dur: d, type: 'sawtooth', freq: n * v, gain: 0.08, attack: 0.018 });
      a.tone(f, { t: at, dur: d, type: 'triangle', freq: n * v, gain: 0.13, attack: 0.018 });
      at += d + 0.035;
    }
  }

  // San Martín (montado) va a esperar adelante del portón norte.
  smToWait(now = false) {
    const S = this.sm;
    if (!S.mont) return;
    const [u, v] = SM_WAIT;
    if (now) {
      this.placeHorse(S.mh || S.h, u, v, yawOf(1, -0.1));
      (S.mh || S.h).speed = 0;
      S.walk = null;
      return;
    }
    S.walk = { to: toWorld(u, v, null, new THREE.Vector3()), yaw: yawOf(1, -0.1) };
  }

  smWalk(dt) {
    const S = this.sm;
    const W = S.walk;
    const h = S.mh || S.h;
    if (!W || S.mode !== 'montado' || S.lead || S.scene) return;
    const dx = W.to.x - h.pos.x;
    const dz = W.to.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      h.speed = 0;
      h.yaw = angLerp(h.yaw, W.yaw, Math.min(1, dt * 2));
      if (Math.abs(wrapPi(h.yaw - W.yaw)) < 0.02) S.walk = null;
      return;
    }
    const sp = Math.min(2.2, d);
    h.yaw = angLerp(h.yaw, Math.atan2(dx, dz), Math.min(1, dt * 2.5));
    const f = Math.max(0, Math.cos(wrapPi(Math.atan2(dx, dz) - h.yaw)));
    h.pos.x += Math.sin(h.yaw) * sp * f * dt;
    h.pos.z += Math.cos(h.yaw) * sp * f * dt;
    toLocal(h.pos.x, h.pos.z, L);
    h.pos.y = hLoc(L.u, L.v);
    h.groundY = h.pos.y;
    h.speed = sp * f;
  }

  // Señala (con el sable, a caballo) un rato.
  smPoint(secs = 2.2) {
    const S = this.sm;
    if (S.mode !== 'montado' || !S.mont) return;
    S.mont.brazos = 'senala';
    S.pointT = secs;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    this.t += dt;
    const S = this.sm;
    this.smUpdate(dt);
    this.smWalk(dt);
    if (S.pointT > 0) {
      S.pointT -= dt;
      if (S.pointT <= 0 && S.mont && !S.lead) S.mont.brazos = 'sable';
    }
    for (const Q of this.sq) this.sqUpdate(Q, dt);
    this.belUpdate(dt);
    this.dustUpdate(dt);
    this.C.update(dt);
    for (const m of this.monts) m.update(dt);
    this.people.update(dt);
    // (las manos de todos ocupadas: ni el mate ni nada en la mano de Avatars)
    for (const a of this.people.list.values()) if (a.hand) a.hand.visible = false;
    this.flagPose(dt);
  }

  // Al entrar a la arena: cada uno en su lugar de la llegada.
  reset() {
    this.smReset();
    this.formAll();
    this.belTo(0, true);
    this.bel.planted = false;
    this.bel.unfurl = 0;
    this.bel.r.yaw = puppetYaw(yawOf(0.2, 1));
    this.dust.length = 0;
  }

  dispose() {
    this.people.dispose();
    this.C.dispose();
    this.bel?.flag.removeFromParent();
    this.bel?.ring.removeFromParent();
  }
}
