import * as THREE from 'three';
import Avatars from '../../net/Avatars';
import { sanMartin } from '../skins/sanmartin';
import { granadero } from '../skins/granadero';
import { Caballos } from '../skins/caballo';
import { Montura, POSE, prepararPersonas, addPerson } from './montar';
import { belgranoSkin, whenBelgrano } from '../monumento/belgranoSkin';
import { toWorld, toLocal, hLoc, yawOf, dirWorld, edgeU, F, avoidProps, propCyls } from '../../world/eclipse/sanlorenzoCampo';

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
const tmpU = new THREE.Vector3();
const L = {};
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// lleva P hacia T (k: 0..1), como montar.js
const toward = (P, T, k) => {
  for (const key in T) P[key] = (P[key] ?? 0) + (T[key] - (P[key] ?? 0)) * k;
};
const angLerp = (a, b, k) => a + wrapPi(b - a) * k;
// El caballo que monta San Martín. (Sesión 1f, el usuario: "el caballo muerto
// sigue cabalgando acostado": después de la escena de Cabral monta el de
// repuesto (mh), pero las cargas que encabezaba movían su zaino caído (h).
// __mduOldDeadLead: como antes)
const leadHorse = (M) => (globalThis.__mduOldDeadLead === true ? M.h : M.mh || M.h);
// el yaw de un muñeco de Avatars (mira a -z con yaw 0) para un caballo/dirección con yaw del mundo h
const puppetYaw = (h) => h + Math.PI;
// San Martín a pie hasta su caballo (m/s) y lo que tarda en subir (s)
const SM_WALK = 1.35;
const SM_MOUNT = 1.25;
const sv = new THREE.Vector3();

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
// (sesión 1f, el usuario: "San Martín atraviesa la muralla": el lugar de espera
// estaba a 2 m del costado del portón norte —iba derecho y cruzaba el muro—;
// ahora, delante del portón. __mduOldSmWall: como antes)
const SM_WAIT = globalThis.__mduOldSmWall === true ? [-40.8, 13.4] : [-40.8, 9.5];
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
    // (se da vuelta hacia el que se lo da de a poco: antes, de golpe)
    if (giver) S.face = puppetYaw(Math.atan2(giver.x - S.r.pos.x, giver.z - S.r.pos.z));
    // (y después camina hasta el costado de su caballo y monta: el que espera
    // a que esté arriba —el desembarco— cuenta también eso)
    if (globalThis.__mduOldSmMount === true) return 5.2;
    const st = this.smStirrup(S.h);
    return 5.2 + Math.hypot(st.x - S.r.pos.x, st.z - S.r.pos.z) / SM_WALK + 0.6 + SM_MOUNT;
  }

  // El estribo: al costado de la montura, del lado más cerca de San Martín, en el piso.
  smStirrup(h) {
    const S = this.sm;
    h.seatAt(sv);
    const sx = Math.cos(h.yaw);
    const sz = -Math.sin(h.yaw);
    const a = { x: sv.x + sx * 0.78, z: sv.z + sz * 0.78 };
    const b = { x: sv.x - sx * 0.78, z: sv.z - sz * 0.78 };
    const p = S.r.pos;
    const T = Math.hypot(a.x - p.x, a.z - p.z) <= Math.hypot(b.x - p.x, b.z - p.z) ? a : b;
    T.face = Math.atan2(sv.x - T.x, sv.z - T.z);
    return T;
  }

  smPose(P) {
    const S = this.sm;
    const t = this.t;
    const u = S.t;
    if (S.mode === 'pie') {
      POSE.firme(P, t);
      // (sesión 1f, el usuario: "San Martín, animaciones rígidas": mira al que
      // se le acerca, llama con la mano, señala el campo. __mduOldSmStatue: quieto)
      if (globalThis.__mduOldSmStatue !== true) {
        const rel = S.lookRel || 0;
        P.torsoY = Math.max(-0.4, Math.min(0.4, rel * 0.4));
        P.headY = Math.max(-0.7, Math.min(0.7, rel * 0.6)) + 0.06 * Math.sin(t * 0.6);
        P.headP = -0.05 + 0.03 * Math.sin(t * 0.4);
        P.torsoR += 0.025 * Math.sin(t * 0.35);
        const G = S.gest;
        if (G) {
          const u2 = (t - G.t0) / G.dur;
          const k = ease(Math.min(1, u2 / 0.18)) * (1 - ease(Math.max(0, (u2 - 0.78) / 0.22)));
          if (G.kind === 'llama') toward(P, { shLp: -2.25, shLr: -0.35, elL: -0.95 - 0.45 * Math.sin(t * 7), headP: -0.12 }, k);
          else toward(P, { shLp: -1.5, shLr: -0.25, elL: -0.05, headP: -0.06, torsoY: P.torsoY + 0.12 }, k);
        }
      }
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
    if (S.mode === 'acerca') {
      // camina hasta el estribo con el sable abajo, el brazo colgando (las piernas, de Avatars)
      POSE.firme(P, t, false);
      return;
    }
    if (S.mode === 'monta') {
      // del suelo a la montura: el cuerpo pasa de parado a sentado
      const k = ease(u / (S.mountDur || 0.95));
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

  // Monta (de donde está a la montura de su caballo h). walk: primero camina
  // hasta el estribo (la del sable; las otras —el que entra tarde, las
  // pruebas, la escena de Cabral— suben de una).
  smMount(h = this.sm.h, walk = false) {
    const S = this.sm;
    S.mh = h;
    if (!S.mont || S.mont.h !== h) {
      this.monts = this.monts.filter((m) => m.a !== S.a);
      const m = new Montura(S.a, h, { brazos: 'sable', life: true, gestos: true });
      m.lookAt = () => this.lookTarget();
      S.mont = m;
    }
    // (Montura ya puso su pose: mientras sube, la de acá)
    S.r.poseFn = (P) => this.smPose(P);
    S.t = 0;
    S.mountDur = 0.95;
    if (walk && globalThis.__mduOldSmMount !== true) {
      // (2026-10-07, el usuario: "se sube al caballo de un teleport": volaba 3,7 m en un segundo)
      S.to = this.smStirrup(h);
      S.mode = 'acerca';
      S.waitT = 0;
      return;
    }
    S.mode = 'monta';
    S.from = { pos: S.r.pos.clone(), yaw: S.r.yaw };
  }

  // Adónde miran los nuestros: El Eclipse si está, si no el medio del campo.
  lookTarget() {
    const boss = this.sl.boss?.R?.root;
    if (boss?.visible) return boss.position;
    return toWorld(10, 0, null, this.lookV || (this.lookV = new THREE.Vector3()));
  }

  // (San Martín a pie: a quién mira y qué gesto hace; lo llama smUpdate)
  smLife(dt) {
    const S = this.sm;
    if (globalThis.__mduOldSmStatue === true || S.mode !== 'pie') {
      S.gest = null;
      return;
    }
    const t = this.t;
    const g = this.g;
    // el jugador más cerca (si hay uno a menos de 30 m); si no, El Eclipse
    let best = null;
    let bd = 30;
    const cands = [g.player?.pos];
    for (const a of g.net?.avatars?.list?.values?.() || []) cands.push(a?.r?.pos);
    for (const p of cands) {
      if (!p) continue;
      const d = Math.hypot(p.x - S.r.pos.x, p.z - S.r.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const T = best || this.lookTarget();
    const rel = wrapPi(Math.atan2(T.x - S.r.pos.x, T.z - S.r.pos.z) - (S.r.yaw + Math.PI));
    S.lookRel = (S.lookRel || 0) + (rel - (S.lookRel || 0)) * Math.min(1, dt * 1.8);
    if (S.gest && t - S.gest.t0 > S.gest.dur) S.gest = null;
    if (!S.gest) {
      S.nextG = S.nextG ?? t + 2.5;
      if (t >= S.nextG) {
        const kind = best && bd < 16 ? 'llama' : 'senala';
        S.gest = { kind, t0: t, dur: kind === 'llama' ? 2.2 : 2.0 };
        S.nextG = t + S.gest.dur + 3.5 + Math.random() * 4;
      }
    }
  }

  smUpdate(dt) {
    const S = this.sm;
    S.t += dt;
    this.smLife(dt);
    if (S.mode === 'recibe' && S.face != null) {
      S.r.yaw = angLerp(S.r.yaw, S.face, Math.min(1, dt * 5));
      if (Math.abs(wrapPi(S.r.yaw - S.face)) < 0.01) S.face = null;
    }
    if (S.mode === 'recibe' && S.t >= 5.2) this.smMount(S.h, true);
    if (S.mode === 'acerca') {
      const T = S.to;
      const dx = T.x - S.r.pos.x;
      const dz = T.z - S.r.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.04) {
        const st = Math.min(d, SM_WALK * dt);
        S.r.pos.x += (dx / d) * st;
        S.r.pos.z += (dz / d) * st;
        toLocal(S.r.pos.x, S.r.pos.z, L);
        S.r.pos.y = hLoc(L.u, L.v);
        S.r.yaw = angLerp(S.r.yaw, puppetYaw(Math.atan2(dx, dz)), Math.min(1, dt * 6));
        S.r.moving = true;
        S.r.speed = SM_WALK;
      } else {
        // de cara al caballo y sube
        S.r.moving = false;
        S.r.speed = 0;
        const fy = puppetYaw(T.face);
        S.r.yaw = angLerp(S.r.yaw, fy, Math.min(1, dt * 7));
        S.waitT += dt;
        if (Math.abs(wrapPi(S.r.yaw - fy)) < 0.05 || S.waitT > 0.6) {
          S.mode = 'monta';
          S.t = 0;
          S.mountDur = SM_MOUNT;
          S.from = { pos: S.r.pos.clone(), yaw: S.r.yaw };
        }
      }
    }
    if (S.mode === 'recibe' && S.t > 0.85 && !S.sable) {
      S.sable = true;
      this.g.audio?.whoosh?.(S.r.pos);
    }
    if (S.mode === 'monta') {
      const m = S.mont;
      const seat = m.seat({});
      const dur = S.mountDur || 0.95;
      const k = ease(Math.min(1, S.t / dur));
      const F0 = S.from;
      // (desde el estribo: sube primero —el pie en el estribo— y después pasa la pierna)
      const ky = dur > 1 ? ease(Math.min(1, S.t / (dur * 0.6))) : k;
      S.r.pos.set(F0.pos.x + (seat.x - F0.pos.x) * k, F0.pos.y + (seat.y - F0.pos.y) * ky + Math.sin(Math.PI * k) * (dur > 1 ? 0.12 : 0.35), F0.pos.z + (seat.z - F0.pos.z) * k);
      S.r.yaw = angLerp(F0.yaw, seat.yaw - Math.PI, k);
      if (S.t >= dur) {
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
      // (sesión 1f, el usuario: "Belgrano se queda estatua toda la pelea": mira
      // a El Eclipse con la cabeza y el cuerpo, grita con el puño en alto,
      // señala, alza la bandera y la sacude. __mduOldBelStatue: como antes)
      if (globalThis.__mduOldBelStatue !== true) {
        const rel = B.lookRel || 0;
        P.torsoY = Math.max(-0.45, Math.min(0.45, rel * 0.45));
        P.headY = Math.max(-0.6, Math.min(0.6, rel * 0.55)) + 0.08 * Math.sin(t * 0.7);
        P.headP = -0.06 + 0.04 * Math.sin(t * 0.45);
        const G = B.gest;
        if (G) {
          const u = (t - G.t0) / G.dur;
          const k = ease(Math.min(1, u / 0.18)) * (1 - ease(Math.max(0, (u - 0.78) / 0.22)));
          if (G.kind === 'grita') {
            toward(P, { shLp: -2.75 + 0.12 * Math.sin(t * 9), shLr: -0.18, elL: -0.55, headP: -0.3, torsoP: -0.06 }, k);
          } else if (G.kind === 'senala') {
            toward(P, { shLp: -1.55, shLr: -0.3, elL: -0.06, headP: -0.08, torsoY: P.torsoY + 0.15 }, k);
          } else if (G.kind === 'alza') {
            // las dos manos en el asta, la sube y la sacude
            toward(P, { shRp: -1.75 + 0.18 * Math.sin(t * 6), shRr: 0.1, elR: -0.55, shLp: -1.6 + 0.18 * Math.sin(t * 6), shLr: 0.25, elL: -0.7, headP: -0.25 }, k);
          }
        }
      }
    }
  }

  // (Belgrano vivo: a quién mira y qué gesto hace; lo llama belUpdate)
  belLife(dt) {
    const B = this.bel;
    if (globalThis.__mduOldBelStatue === true || !B.planted || B.r.moving) {
      B.gest = null;
      B.lift = 0;
      return;
    }
    const t = this.t;
    // mira a El Eclipse (o al medio del campo)
    const boss = this.sl.boss?.R?.root;
    const tx = boss?.visible ? boss.position.x : toWorld(10, 0, null, tmpU).x;
    const tz = boss?.visible ? boss.position.z : toWorld(10, 0, null, tmpU).z;
    const want = Math.atan2(tx - B.r.pos.x, tz - B.r.pos.z);
    // (el cuerpo de Belgrano mira a r.yaw + PI)
    const rel = wrapPi(want - (B.r.yaw + Math.PI));
    B.lookRel = (B.lookRel || 0) + (rel - (B.lookRel || 0)) * Math.min(1, dt * 1.5);
    if (B.gest && t - B.gest.t0 > B.gest.dur) B.gest = null;
    if (!B.gest) {
      B.nextG = B.nextG ?? t + 3;
      if (t >= B.nextG) {
        const kinds = ['grita', 'senala', 'alza', 'grita', 'alza'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        B.gest = { kind, t0: t, dur: kind === 'alza' ? 3.2 : kind === 'grita' ? 2.4 : 2.0 };
        B.nextG = t + B.gest.dur + 4 + Math.random() * 5;
      }
    }
    const G = B.gest;
    const lift = G?.kind === 'alza' ? ease(Math.min(1, (t - G.t0) / 0.5)) * (1 - ease(Math.max(0, (t - G.t0 - G.dur + 0.6) / 0.6))) : 0;
    B.lift = lift * (0.55 + 0.08 * Math.sin(t * 6));
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
    this.belLife(dt);
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
      // (la alza con las dos manos: la bandera sube y se sacude)
      if (B.lift) {
        F2.position.y += B.lift;
        F2.rotation.z = 0.12 * Math.sin(this.t * 6) * (B.lift / 0.55);
      }
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
        const m = new Montura(a, h, { brazos: 'riendas', life: true });
        m.lookAt = () => this.lookTarget();
        this.monts.push(m);
        riders.push({ a, h, m, i, cabral, slot: null, lat: 0, along: 0, k: 0 });
      }
      return { side, si, riders, state: 'formed', s: 0, path: null, laneA: 0, laneB: 0, lane: 0, lead: false, t: 0, hits: new Set(), hoofT: 0 };
    });
    this.cabral = this.sq[0].riders[0];
  }

  // Todos a formar (en la huerta, mirando al muro). skipScene: los que maneja
  // una escena (Cabral y el que pasa barriendo) quedan donde están.
  formAll(skipScene = false) {
    for (const S of this.sq) {
      S.state = 'formed';
      S.path = null;
      S.lead = false;
      S.riders.forEach((R, i) => {
        if (skipScene && R.scene) return;
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
        // (la fila de adelante: los que forman más afuera, que es para donde
        // sale la columna; al revés se cruzaban al salir. __mduOldColumnStart)
        const rank = globalThis.__mduOldColumnStart === true ? Math.floor(i / k) : Math.floor((S.riders.length - 1 - i) / k);
        const file = i % k;
        R.lat = (file - (k - 1) / 2) * 2.5 * S.side;
        R.along = -rank * 3.6;
      });
    }
  }

  // El camino de una carga del lado `side` por el carril v = lane.
  chargePath(side, lane) {
    // (2026-10-07: la columna pasaba por arriba de los cañones de la barranca;
    // el carril, a 6 m de cada uno. __mduOldChargeSmooth: como antes)
    if (globalThis.__mduOldChargeSmooth !== true) {
      for (const [, cv] of F.cannons) if (Math.abs(lane - cv) < 6) lane = cv + (lane >= cv ? 6 : -6);
    }
    const e = edgeU(lane);
    const s = side;
    // (sesión 1f, el usuario: "San Martín atraviesa la muralla": la fila de
    // adentro de la columna pasaba por la punta del muro (|v| 31, el muro llega
    // a 32). Rodea 2,5 m más afuera. __mduOldWallEnd: como antes)
    const W2 = globalThis.__mduOldWallEnd === true ? 0 : 1;
    const P = [
      [FORM_U, s * (FORM_V0 + FORM_DV * 1.5)],
      [FORM_U + 0.4, s * (29.5 + 2.5 * W2)],
      [-41.5, s * (35.5 + 2.5 * W2)],
      [-34.5, s * 31],
      [-28, lane + s * 4],
      [-22, lane],
      [e - 6, lane],
      [e - 10, lane + s * 9],
      [e - 16, s * 41],
      [-28, s * 41.8],
      [-39.5, s * (38.5 + 1.5 * W2)],
      [FORM_U + 0.6, s * (31.5 + 2.5 * W2)],
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
    // (sesión 1f: los caballos se atravesaban al salir y al volver. La fila de
    // adelante es la de los que forman más afuera —para allá sale la columna— y
    // al volver cada uno va al lugar que le queda en orden. __mduOldColumnStart)
    S.reslot = false;
    if (globalThis.__mduOldColumnStart !== true) {
      const k = Math.ceil(S.riders.length / 2);
      [...S.riders]
        .filter((R) => R.slot)
        .sort((a, b) => Math.abs(b.slot.v) - Math.abs(a.slot.v))
        .forEach((R, j) => {
          R.lat = ((j % k) - (k - 1) / 2) * 2.5 * S.side;
          R.along = -Math.floor(j / k) * 3.6;
        });
    }
    // (el que vuelve de la escena de Cabral se suma)
    if (S.lead) {
      const M = this.sm;
      const mh = leadHorse(M);
      M.lead = { from: { pos: mh.pos.clone(), yaw: mh.yaw }, k: 0 };
    }
    this.laneDust(path);
    this.clarin();
    return true;
  }

  busy(side) {
    return this.sq[side > 0 ? 0 : 1].state !== 'formed';
  }

  // Cuánto se corre de costado el caballo h (en el camino en B, con la
  // tangente T, a lat del medio) para pasar lejos de lo que tiene adelante.
  dodge(h, B, T, lat, dt) {
    const nx = -T.z;
    const nz = T.x;
    const rx = B.x + nx * lat;
    const rz = B.z + nz * lat;
    toLocal(rx, rz, L);
    const u0 = L.u;
    const v0 = L.v;
    toLocal(rx + T.x, rz + T.z, L);
    const tu = L.u - u0;
    const tv = L.v - v0;
    toLocal(rx + nx, rz + nz, L);
    const nu = L.u - u0;
    const nv = L.v - v0;
    // (todo lo que tiene adelante como un solo estorbo —el cañón con sus
    // ruedas y cestones—: se pasa por un costado, el del lado contrario a donde
    // está la mayor parte, y lo que hay que correrse alcanza para todo)
    let wsum = 0;
    let first = true;
    for (const [cu, cv, cr] of propCyls()) {
      const du = cu - u0;
      const dv = cv - v0;
      const ahead = du * tu + dv * tv;
      if (ahead < -2.5 || ahead > 10) continue;
      const side = du * nu + dv * nv;
      const w = ahead < 4 ? 1 : 1 - (ahead - 4) / 6;
      if (Math.abs(side) > cr + 1.6 + 3) continue;
      wsum += side * cr * w;
      first = false;
      (this._dz ||= []).push([side, cr, w]);
    }
    let want = 0;
    if (!first) {
      const away = wsum > 0.01 ? -1 : wsum < -0.01 ? 1 : lat >= 0 ? 1 : -1;
      // lo justo para dejar todos del otro lado: la punta más saliente de ese lado + margen
      let m = 0;
      for (const [side, cr, w] of this._dz) {
        const edge = away < 0 ? side - cr - 1.6 : side + cr + 1.6;
        const sh = away < 0 ? Math.min(0, edge) : Math.max(0, edge);
        if (Math.abs(sh * w) > Math.abs(m)) m = sh * w;
      }
      want = m;
      this._dz.length = 0;
    }
    const d = h.dodgeK || 0;
    h.dodgeK = d + (want - d) * Math.min(1, dt * 3.5);
    return h.dodgeK;
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
      // (2026-10-07: lo que tiene adelante —cañones, carretas, troncos— lo
      // esquiva corriéndose de costado de a poco, desde unos metros antes;
      // __mduOldChargeSmooth: como antes, de golpe al llegar)
      if (globalThis.__mduOldChargeSmooth !== true && dt > 0) lat += this.dodge(h, tmpV, tmpW, lat, dt);
      let x = tmpV.x + -tmpW.z * lat;
      let z = tmpV.z + tmpW.x * lat;
      // (sesión 1f: al salir, la segunda fila iba al mismo punto que la primera
      // —el camino empieza en 0— y los caballos se atravesaban: atrás del
      // arranque, sobre la tangente. __mduOldColumnStart: como antes)
      const back = S.s + along;
      if (back < 0 && globalThis.__mduOldColumnStart !== true) {
        x += tmpW.x * back;
        z += tmpW.z * back;
      }
      toLocal(x, z, L);
      // (sesión 1f: nadie más allá de 3 m antes de la barranca —"casi se salen
      // del mapa"—; __mduNoCavEdge: como antes)
      // (2026-10-07, el usuario: "los caballos se caen por el barranco y se
      // teletransportan arriba": en la vuelta junto a la barranca pasaban por
      // las bajadas al río y bajaban hasta 5 m por la rampa. Ahí, 11 m antes del
      // borde. __mduOldChargeSmooth: como antes)
      const SM2 = globalThis.__mduOldChargeSmooth !== true;
      const lim = edgeU(L.v) - (SM2 && F.bajadas.some((b) => Math.abs(L.v - b) < F.bajW + 5) ? 11 : 3);
      if (globalThis.__mduNoCavEdge !== true && L.u > lim) {
        L.u = lim;
        const Wp = toWorld(L.u, L.v, 0, tmpU);
        x = Wp.x;
        z = Wp.z;
      }
      // (los cañones, las carretas, el pozo y los troncos del campo: los rodean; __mduNoSlEsquiva)
      if (globalThis.__mduNoSlEsquiva !== true && avoidProps(L, 1.3)) {
        const Wp = toWorld(L.u, L.v, 0, tmpU);
        x = Wp.x;
        z = Wp.z;
      }
      // (y al esquivar los cañones y los árboles saltaban 1-5 m de un cuadro al
      // otro: ahora no se mueven más rápido que la columna, rodean de a poco)
      if (SM2 && kIn >= 1 && dt > 0) {
        const dx = x - h.pos.x;
        const dz = z - h.pos.z;
        const d = Math.hypot(dx, dz);
        const max = Math.max(2, v) * dt * 1.45 + 0.02;
        if (d > max && d < 30) {
          x = h.pos.x + (dx / d) * max;
          z = h.pos.z + (dz / d) * max;
          toLocal(x, z, L);
        }
      }
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
    // (al empezar la vuelta a formar: los lugares, en el orden en que vienen)
    if (!S.reslot && globalThis.__mduOldColumnStart !== true && S.s > P.len - 9) {
      S.reslot = true;
      const live = S.riders.filter((R) => R.slot && !R.scene);
      const slots = live.map((R) => R.slot).sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
      live
        .map((R) => [R, toLocal(R.h.pos.x, R.h.pos.z, {}).v])
        .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))
        .forEach(([R], j) => (R.slot = slots[j]));
    }
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
      // (sesión 1f: si San Martín espera del lado del campo y la columna todavía
      // va por atrás del muro, espera a que la columna salga: si no, se iba
      // derecho a ella atravesando el muro. __mduOldSmWall: como antes)
      let hold = false;
      if (globalThis.__mduOldSmWall !== true && M.lead.k === 0) {
        P.curve.getPointAt(Math.max(0, Math.min(1, (S.s + 4.2) / P.len)), tmpU);
        const fu = toLocal(M.lead.from.pos.x, M.lead.from.pos.z, {}).u;
        const tu = toLocal(tmpU.x, tmpU.z, {}).u;
        hold = fu > F.wallU && tu < F.wallU + 1.5;
      }
      if (!hold) M.lead.k = Math.min(1, M.lead.k + dt / 1.6);
      const mh = leadHorse(M);
      if (hold) {
        mh.speed = 0;
        M.lead.from.pos.copy(mh.pos);
      } else place(mh, 4.2, 0, M.lead.from, ease(M.lead.k));
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
        this.smToWait(globalThis.__mduOldWallEnd === true);
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
    S.walk = { to: toWorld(u, v, null, new THREE.Vector3()), yaw: yawOf(1, -0.1), via: [] };
    // (del otro lado del muro: por el portón del norte, adentro y afuera)
    const h = S.mh || S.h;
    toLocal(h.pos.x, h.pos.z, L);
    if (globalThis.__mduOldWallEnd !== true && L.u < F.wallU !== u < F.wallU) {
      const gv = (F.gates[1][0] + F.gates[1][1]) / 2;
      const inU = F.wallU - 2.2;
      const outU = F.wallU + 2.2;
      const [a, b] = L.u < F.wallU ? [inU, outU] : [outU, inU];
      S.walk.via.push(toWorld(a, gv, null, new THREE.Vector3()), toWorld(b, gv, null, new THREE.Vector3()));
    }
  }

  smWalk(dt) {
    const S = this.sm;
    const W = S.walk;
    const h = S.mh || S.h;
    if (!W || S.mode !== 'montado' || S.lead || S.scene) return;
    // (los puntos de paso: el portón)
    if (W.via?.length && Math.hypot(W.via[0].x - h.pos.x, W.via[0].z - h.pos.z) < 0.6) W.via.shift();
    const T = W.via?.length ? W.via[0] : W.to;
    const dx = T.x - h.pos.x;
    const dz = T.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2 && T === W.to) {
      h.speed = 0;
      h.yaw = angLerp(h.yaw, W.yaw, Math.min(1, dt * 2));
      if (Math.abs(wrapPi(h.yaw - W.yaw)) < 0.02) S.walk = null;
      return;
    }
    const sp = T === W.to ? Math.min(2.2, d) : 2.2;
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
