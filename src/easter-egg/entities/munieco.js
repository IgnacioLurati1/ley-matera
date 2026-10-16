import * as THREE from 'three';

// El muñeco con física de los muertos (el usuario, 2026-10-16: "que cuando
// mueran caigan más tipo muñeco con física, creo que ahora caen de una forma
// media débil"). Verlet: quince puntos (las articulaciones del esqueleto de
// entities/skeleton.js) unidos por varillas; las piezas instanciadas de siempre
// se ponen entre sus puntos (z.mats), así se dibujan, dan sombra y salen en el
// reflejo como siempre. El tronco es firme (pelvis, caderas, pecho, hombros),
// la cintura y el cuello se doblan hasta un tope, y las rodillas y los codos
// se doblan para un solo lado.
//
// También los pedazos que se arrancan (core/golpes.js): un antebrazo, un
// brazo, una canilla o una pierna salen volando como un cuerpo chico de dos o
// tres puntos. Se dibujan con las piezas del mismo muerto (z.loose: esas
// partes van con z.lmats en lugar de z.mats) y no reciben tiros (z.hidden).
//
// Pisos con world.floorAt y paredes con world.collide. Cuando deja de moverse
// (o a los DORMIR_T s) se duerme y no cuesta más nada. Solo se ve: lo que
// suelta el muerto sale de donde murió y nada del juego mira el cuerpo.
// globalThis.__mduSinMunieco = true: la caída de antes (Zombies.poseDeath).

// los puntos
export const J = { pelvis: 0, chest: 1, head: 2, shL: 3, elL: 4, haL: 5, shR: 6, elR: 7, haR: 8, hiL: 9, knL: 10, ftL: 11, hiR: 12, knR: 13, ftR: 14 };
const N = 15;
// de qué parte sale cada punto y dónde está en ella (medidas de skeleton.js)
const FROM = [
  [0, 0, 0, 0],
  [1, 0, 0.28, 0.02],
  [2, 0, 0, 0],
  [3, 0, 0.15, 0],
  [3, 0, -0.14, 0],
  [5, 0, -0.17, 0],
  [4, 0, 0.15, 0],
  [4, 0, -0.14, 0],
  [6, 0, -0.17, 0],
  [7, 0, 0.21, 0],
  [7, 0, -0.22, 0],
  [9, 0, -0.24, 0],
  [8, 0, 0.21, 0],
  [8, 0, -0.22, 0],
  [10, 0, -0.24, 0],
];
// radio de cada punto (m, por la escala del muerto)
const RADIO = [0.12, 0.13, 0.12, 0.08, 0.06, 0.05, 0.08, 0.06, 0.05, 0.08, 0.07, 0.06, 0.08, 0.07, 0.06];
// varillas: [a, b, mín, máx] (mín y máx por el largo con que murió; 1, 1 = firme)
const VARILLAS = [
  // la cadera, el pecho y la columna
  [J.pelvis, J.hiL, 1, 1], [J.pelvis, J.hiR, 1, 1], [J.hiL, J.hiR, 1, 1],
  [J.chest, J.shL, 1, 1], [J.chest, J.shR, 1, 1], [J.shL, J.shR, 1, 1],
  [J.pelvis, J.chest, 1, 1],
  // la cintura se dobla y se tuerce un poco
  [J.pelvis, J.shL, 0.86, 1.06], [J.pelvis, J.shR, 0.86, 1.06], [J.hiL, J.chest, 0.86, 1.06], [J.hiR, J.chest, 0.86, 1.06],
  [J.hiL, J.shL, 0.82, 1.08], [J.hiR, J.shR, 0.82, 1.08],
  // el cuello
  [J.chest, J.head, 1, 1], [J.head, J.shL, 0.78, 1.12], [J.head, J.shR, 0.78, 1.12],
  // brazos y piernas
  [J.shL, J.elL, 1, 1], [J.elL, J.haL, 1, 1], [J.shR, J.elR, 1, 1], [J.elR, J.haR, 1, 1],
  [J.hiL, J.knL, 1, 1], [J.knL, J.ftL, 1, 1], [J.hiR, J.knR, 1, 1], [J.knR, J.ftR, 1, 1],
];
// hasta dónde se cierran el codo y la rodilla: [hombro/cadera, mano/pie, parte del largo estirado]
const TOPES = [[J.shL, J.haL, 0.32], [J.shR, J.haR, 0.32], [J.hiL, J.ftL, 0.5], [J.hiR, J.ftR, 0.5]];
// el muslo no se mete en la panza
const MUSLO = [[J.chest, J.knL, 0.5], [J.chest, J.knR, 0.5]];
// bisagras: [arriba, medio, abajo, lado (1 rodilla: el medio va adelante; -1 codo: atrás), eje (0 cadera, 1 hombros)]
const BISAGRAS = [[J.hiL, J.knL, J.ftL, 1, 0], [J.hiR, J.knR, J.ftR, 1, 0], [J.shL, J.elL, J.haL, -1, 1], [J.shR, J.elR, J.haR, -1, 1]];

// Los pedazos: qué puntos se llevan y qué partes dibujan [parte, punto de arriba, de abajo, dónde va la pieza]
export const PEDAZOS = {
  antebrazoL: { pts: [J.elL, J.haL], parts: [[5, 0, 1, 0.485]], eje: 1, bits: 1 << 5 },
  antebrazoR: { pts: [J.elR, J.haR], parts: [[6, 0, 1, 0.485]], eje: 1, bits: 1 << 6 },
  brazoL: { pts: [J.shL, J.elL, J.haL], parts: [[3, 0, 1, 0.517], [5, 1, 2, 0.485]], eje: 1, bits: (1 << 3) | (1 << 5) },
  brazoR: { pts: [J.shR, J.elR, J.haR], parts: [[4, 0, 1, 0.517], [6, 1, 2, 0.485]], eje: 1, bits: (1 << 4) | (1 << 6) },
  hombroL: { pts: [J.shL, J.elL], parts: [[3, 0, 1, 0.517]], eje: 1, bits: 1 << 3 },
  hombroR: { pts: [J.shR, J.elR], parts: [[4, 0, 1, 0.517]], eje: 1, bits: 1 << 4 },
  musloL: { pts: [J.hiL, J.knL], parts: [[7, 0, 1, 0.488]], eje: 0, bits: 1 << 7 },
  musloR: { pts: [J.hiR, J.knR], parts: [[8, 0, 1, 0.488]], eje: 0, bits: 1 << 8 },
  canillaL: { pts: [J.knL, J.ftL], parts: [[9, 0, 1, 0.467], [11, 0, 1, -1]], eje: 0, bits: (1 << 9) | (1 << 11) },
  canillaR: { pts: [J.knR, J.ftR], parts: [[10, 0, 1, 0.467], [12, 0, 1, -1]], eje: 0, bits: (1 << 10) | (1 << 12) },
  piernaL: { pts: [J.hiL, J.knL, J.ftL], parts: [[7, 0, 1, 0.488], [9, 1, 2, 0.467], [11, 1, 2, -1]], eje: 0, bits: (1 << 7) | (1 << 9) | (1 << 11) },
  piernaR: { pts: [J.hiR, J.knR, J.ftR], parts: [[8, 0, 1, 0.488], [10, 1, 2, 0.467], [12, 1, 2, -1]], eje: 0, bits: (1 << 8) | (1 << 10) | (1 << 12) },
};

const PASO = 1 / 90;
const PASOS_MAX = 4;
const GRAV = 13;
const ITER = 5;
// rozamiento contra el piso (lo que queda del deslizamiento por paso) y rebote
const ROCE = 0.55;
const REBOTE = 0.2;
// se duerme: quieto (m por paso) durante QUIETO_N pasos, o a los DORMIR_T s
const QUIETO = 0.0025;
const QUIETO_N = 24;
const DORMIR_T = 6;
// los que se mueven a la vez (los demás caen como antes)
const ACTIVOS = 18;
// lo más rápido que se mueve un punto (m/s)
const VMAX = 22;
// contra las paredes solo chocan estos (el tronco, la cabeza, manos y pies: el
// resto va atado a ellos); el piso, todos. Medido (t_costo, 20 muertos que
// revientan juntos): 0,65 ms por cuadro chocando todos los puntos
const CHOCA = new Uint8Array(N);
for (const i of [J.pelvis, J.chest, J.head, J.haL, J.haR, J.ftL, J.ftR]) CHOCA[i] = 1;

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vX = new THREE.Vector3();
const vY = new THREE.Vector3();
const vZ = new THREE.Vector3();
const vP = new THREE.Vector3();
const vXC = new THREE.Vector3();
const vXS = new THREE.Vector3();
const vUP = new THREE.Vector3();
const tmpC = { x: 0, y: 0, z: 0 };
const L = new THREE.Matrix4();
const E = new THREE.Euler();

function local(x, y, z, rx = 0) {
  E.set(rx, 0, 0, 'XYZ');
  return new THREE.Matrix4().makeRotationFromEuler(E).setPosition(x, y, z);
}
// sombrero y ojos, pegados a la cabeza como en skeleton.js
const HAT = local(0, 0.14, -0.01, -0.12);
const EYE_L = local(-0.048, 0.03, 0.122);
const EYE_R = local(0.048, 0.03, 0.122);

// La matriz de una pieza: y a lo largo del hueso, x lo más parecida a xh, escala s.
function base(m, px, py, pz, yv, xh, s) {
  vY.copy(yv);
  const ly = vY.length();
  if (ly < 1e-6) vY.set(0, 1, 0);
  else vY.multiplyScalar(1 / ly);
  vX.copy(xh).addScaledVector(vY, -xh.dot(vY));
  if (vX.lengthSq() < 1e-8) vX.set(vY.y, -vY.x, 0).addScaledVector(vY, 0);
  if (vX.lengthSq() < 1e-8) vX.set(1, 0, 0);
  vX.normalize();
  vZ.crossVectors(vX, vY);
  m.set(vX.x * s, vY.x * s, vZ.x * s, px, vX.y * s, vY.y * s, vZ.y * s, py, vX.z * s, vY.z * s, vZ.z * s, pz, 0, 0, 0, 1);
  return m;
}

class Cuerpo {
  constructor(n) {
    this.n = n;
    this.p = new Float32Array(n * 3);
    this.o = new Float32Array(n * 3);
    this.r = new Float32Array(n);
    // varillas en arreglos planos
    this.ca = [];
    this.cb = [];
    this.cmin = [];
    this.cmax = [];
    this.t = 0;
    this.quieto = 0;
    this.dormido = false;
    this.piso = 0;
    // el piso de donde murió (para no caerse al vacío de una isla para siempre)
    this.fondo = -Infinity;
  }

  varilla(a, b, kmin, kmax, largo = null) {
    const p = this.p;
    const d = largo ?? Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    this.ca.push(a);
    this.cb.push(b);
    this.cmin.push(d * kmin);
    this.cmax.push(d * kmax);
  }

  // velocidad v (m/s) a todos los puntos
  velocidad(i, vx, vy, vz) {
    const p = this.p;
    const o = this.o;
    o[i * 3] = p[i * 3] - vx * PASO;
    o[i * 3 + 1] = p[i * 3 + 1] - vy * PASO;
    o[i * 3 + 2] = p[i * 3 + 2] - vz * PASO;
  }
}

export default class Munieco {
  constructor(g) {
    this.g = g;
    this.cuerpos = [];
    this.acc = 0;
  }

  apagado() {
    return !!globalThis.__mduSinMunieco;
  }

  // Zombies.poseDeath, cada cuadro de un muerto: true si lo lleva el muñeco
  // (el que llama no toca la pose). Arranca el muñeco la primera vez.
  muerto(z) {
    if (z.ragId === z.id) return true;
    if (this.apagado() || z.ragNo === z.id) return false;
    if (z.boss || z.dog || z.horse || z.yac || z.jinete || z.pombero || z.crow || z.yasy || z.gz != null || z.slice || z.state !== 'dead' || !z.solved) return false;
    let vivos = 0;
    for (const c of this.cuerpos) if (c.main && !c.dormido) vivos++;
    if (vivos >= ACTIVOS) {
      z.ragNo = z.id;
      return false;
    }
    this.armar(z);
    return true;
  }

  // el cuerpo entero, desde la pose que tenía al morir (z.mats)
  armar(z) {
    const c = new Cuerpo(N);
    const s = z.scale || 1;
    for (let i = 0; i < N; i++) {
      const f = FROM[i];
      vP.set(f[1], f[2], f[3]).applyMatrix4(z.mats[f[0]]);
      c.p[i * 3] = c.o[i * 3] = vP.x;
      c.p[i * 3 + 1] = c.o[i * 3 + 1] = vP.y;
      c.p[i * 3 + 2] = c.o[i * 3 + 2] = vP.z;
      c.r[i] = RADIO[i] * s;
    }
    for (const [a, b, k0, k1] of VARILLAS) c.varilla(a, b, k0, k1);
    // los topes del codo y la rodilla: del largo de los dos huesos
    c.topes = TOPES.map(([a, b, k]) => {
      const m = a === J.shL ? J.elL : a === J.shR ? J.elR : a === J.hiL ? J.knL : J.knR;
      const la = Math.hypot(c.p[a * 3] - c.p[m * 3], c.p[a * 3 + 1] - c.p[m * 3 + 1], c.p[a * 3 + 2] - c.p[m * 3 + 2]);
      const lb = Math.hypot(c.p[m * 3] - c.p[b * 3], c.p[m * 3 + 1] - c.p[b * 3 + 1], c.p[m * 3 + 2] - c.p[b * 3 + 2]);
      return [a, b, (la + lb) * k];
    });
    c.muslos = MUSLO.map(([a, b, k]) => [a, b, Math.hypot(c.p[a * 3] - c.p[b * 3], c.p[a * 3 + 1] - c.p[b * 3 + 1], c.p[a * 3 + 2] - c.p[b * 3 + 2]) * k]);
    c.bisagras = BISAGRAS;
    c.main = true;
    c.z = z;
    c.zid = z.id;
    c.s = s;
    c.by = z.baseY || 0;
    c.fondo = c.by - 25;
    // el empujón del golpe que lo mató (core/golpes.js z.ragImp; en el invitado, de la foto)
    const I = z.ragImpId === z.id ? z.ragImp : null;
    this.empujar(c, I, z);
    z.ragId = z.id;
    z.rag = c;
    this.cuerpos.push(c);
    return c;
  }

  // I: { vx, vy, vz (todo el cuerpo), hx, hy, hz (de más en el punto del golpe), px, py, pz (dónde) }
  empujar(c, I, z) {
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (I) {
      bx = I.vx || 0;
      by = I.vy || 0;
      bz = I.vz || 0;
    } else {
      // sin golpe conocido: se desploma para el lado que dice deathBack
      const sg = z.deathBack ? -1 : 1;
      bx = Math.sin(z.yaw) * sg * 0.9;
      bz = Math.cos(z.yaw) * sg * 0.9;
    }
    const p = c.p;
    for (let i = 0; i < c.n; i++) {
      let vx = bx;
      let vy = by;
      let vz = bz;
      if (I && (I.hx || I.hy || I.hz)) {
        const d = Math.hypot(p[i * 3] - I.px, p[i * 3 + 1] - I.py, p[i * 3 + 2] - I.pz);
        const w = Math.max(0, 1 - d / 0.55);
        vx += I.hx * w;
        vy += I.hy * w;
        vz += I.hz * w;
      }
      // las rodillas se aflojan: los pies quedan un poco atrás
      if (i === J.ftL || i === J.ftR) {
        vx *= 0.35;
        vz *= 0.35;
      }
      c.velocidad(i, vx, vy, vz);
    }
  }

  // Un pedazo que se arranca (core/golpes.js): desde la pose de ahora (vivo o
  // muerto). v: velocidad (m/s); gira: cuánto más rápido va la punta. true si salió.
  arrancar(z, nombre, v, gira = 1) {
    const D = PEDAZOS[nombre];
    if (!D || this.apagado()) return false;
    if (z.looseId !== z.id) {
      z.looseId = z.id;
      z.loose = 0;
    }
    if (z.loose & D.bits) return false;
    const n = D.pts.length;
    const c = new Cuerpo(n);
    const s = z.scale || 1;
    // los puntos: del muñeco si ya cayó, si no de la pose
    const R = z.ragId === z.id ? z.rag : null;
    for (let k = 0; k < n; k++) {
      const i = D.pts[k];
      if (R) {
        c.p[k * 3] = c.o[k * 3] = R.p[i * 3];
        c.p[k * 3 + 1] = c.o[k * 3 + 1] = R.p[i * 3 + 1];
        c.p[k * 3 + 2] = c.o[k * 3 + 2] = R.p[i * 3 + 2];
      } else {
        const f = FROM[i];
        vP.set(f[1], f[2], f[3]).applyMatrix4(z.mats[f[0]]);
        c.p[k * 3] = c.o[k * 3] = vP.x;
        c.p[k * 3 + 1] = c.o[k * 3 + 1] = vP.y;
        c.p[k * 3 + 2] = c.o[k * 3 + 2] = vP.z;
      }
      c.r[k] = RADIO[i] * s;
    }
    for (let k = 0; k + 1 < n; k++) c.varilla(k, k + 1, 1, 1);
    if (n === 3) c.topes = [[0, 2, 0.4 * (c.cmin[0] + c.cmin[1])]];
    c.main = false;
    c.z = z;
    c.zid = z.id;
    c.s = s;
    c.by = z.baseY || 0;
    c.fondo = c.by - 25;
    c.D = D;
    // el eje de costado de la pieza (el de los hombros o la cadera, al salir)
    const m = z.mats[D.eje ? 1 : 0];
    c.xh = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize();
    // gira: la punta sale más rápido que la base
    for (let k = 0; k < n; k++) {
      const w = n === 1 ? 1 : 1 + (gira - 1) * (k / (n - 1));
      c.velocidad(k, v.x * w, v.y + (k === n - 1 ? 0.4 * gira : 0), v.z * w);
    }
    if (!z.lmats) z.lmats = Array.from({ length: 18 }, () => new THREE.Matrix4());
    z.loose |= D.bits;
    z.hidden |= D.bits;
    this.cuerpos.push(c);
    this.escribirPedazo(c);
    return true;
  }

  // Zombies.render, al principio: mueve los que están despiertos y pone sus
  // piezas (los muertos hundiéndose también)
  update(dt) {
    const list = this.cuerpos;
    if (!list.length) return;
    this.acc = Math.min(this.acc + dt, PASO * PASOS_MAX);
    let pasos = 0;
    while (this.acc >= PASO) {
      this.acc -= PASO;
      pasos++;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const z = c.z;
      if (!z.active || z.id !== c.zid) {
        if (c.main && z.ragId === c.zid) {
          z.ragId = -1;
          z.rag = null;
        }
        list.splice(i, 1);
        continue;
      }
      if (!c.dormido) for (let k = 0; k < pasos; k++) this.paso(c);
      // hundiéndose con el muerto (Zombies 'dead', corpseT > 9)
      const hunde = z.dead && z.corpseT > 9 ? Math.min(1.4, (z.corpseT - 9) * 0.8) : 0;
      if (c.dormido && hunde === c.hunde && c.escrito) continue;
      c.hunde = hunde;
      c.escrito = true;
      if (c.main) this.escribir(c);
      else this.escribirPedazo(c);
    }
  }

  paso(c) {
    const p = c.p;
    const o = c.o;
    const n = c.n;
    const h2 = PASO * PASO;
    const vmax = VMAX * PASO;
    c.t += PASO;
    // mover (verlet) con un poco de freno en el aire
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let vx = (p[j] - o[j]) * 0.995;
      let vy = (p[j + 1] - o[j + 1]) * 0.995;
      let vz = (p[j + 2] - o[j + 2]) * 0.995;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > vmax * vmax) {
        const k = vmax / Math.sqrt(v2);
        vx *= k;
        vy *= k;
        vz *= k;
      }
      o[j] = p[j];
      o[j + 1] = p[j + 1];
      o[j + 2] = p[j + 2];
      p[j] += vx;
      p[j + 1] += vy - GRAV * h2;
      p[j + 2] += vz;
    }
    for (let it = 0; it < ITER; it++) {
      this.varillas(c);
      if (c.topes) for (const [a, b, d] of c.topes) this.minimo(p, a, b, d);
      if (c.muslos) for (const [a, b, d] of c.muslos) this.minimo(p, a, b, d);
      if (c.bisagras && it % 2 === 1) this.bisagras(c);
    }
    this.chocar(c);
    // ¿se quedó quieto?
    let m2 = 0;
    for (let j = 0; j < n * 3; j += 3) {
      const dx = p[j] - o[j];
      const dy = p[j + 1] - o[j + 1];
      const dz = p[j + 2] - o[j + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > m2) m2 = d2;
    }
    if (m2 < QUIETO * QUIETO) c.quieto++;
    else c.quieto = 0;
    if (c.quieto > QUIETO_N || c.t > DORMIR_T) {
      c.dormido = true;
      c.escrito = false;
    }
  }

  varillas(c) {
    const p = c.p;
    const A = c.ca;
    const B = c.cb;
    for (let k = 0; k < A.length; k++) {
      const a = A[k] * 3;
      const b = B[k] * 3;
      const dx = p[b] - p[a];
      const dy = p[b + 1] - p[a + 1];
      const dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const lo = c.cmin[k];
      const hi = c.cmax[k];
      let want = d;
      if (d < lo) want = lo;
      else if (d > hi) want = hi;
      else continue;
      const f = ((d - want) / d) * 0.5;
      p[a] += dx * f;
      p[a + 1] += dy * f;
      p[a + 2] += dz * f;
      p[b] -= dx * f;
      p[b + 1] -= dy * f;
      p[b + 2] -= dz * f;
    }
  }

  minimo(p, ia, ib, lo) {
    const a = ia * 3;
    const b = ib * 3;
    const dx = p[b] - p[a];
    const dy = p[b + 1] - p[a + 1];
    const dz = p[b + 2] - p[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (d >= lo) return;
    const f = ((d - lo) / d) * 0.5;
    p[a] += dx * f;
    p[a + 1] += dy * f;
    p[a + 2] += dz * f;
    p[b] -= dx * f;
    p[b + 1] -= dy * f;
    p[b + 2] -= dz * f;
  }

  // La rodilla se dobla para adelante y el codo para atrás: si el punto del
  // medio quedó del lado equivocado de la recta, vuelve a la recta.
  bisagras(c) {
    const p = c.p;
    for (const [a, m, b, lado, eje] of c.bisagras) {
      const l = eje === 0 ? J.hiL : J.shL;
      const r = eje === 0 ? J.hiR : J.shR;
      vX.set(p[r * 3] - p[l * 3], p[r * 3 + 1] - p[l * 3 + 1], p[r * 3 + 2] - p[l * 3 + 2]);
      vA.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
      // para dónde tiene que ir el medio: (abajo - arriba) x eje
      vZ.crossVectors(vA, vX);
      const lz = vZ.length();
      if (lz < 1e-6) continue;
      vZ.multiplyScalar(1 / lz);
      vB.set(p[m * 3] - (p[a * 3] + p[b * 3]) * 0.5, p[m * 3 + 1] - (p[a * 3 + 1] + p[b * 3 + 1]) * 0.5, p[m * 3 + 2] - (p[a * 3 + 2] + p[b * 3 + 2]) * 0.5);
      const s = vB.dot(vZ) * lado;
      if (s >= 0) continue;
      // se corre el medio y, al revés, un poco las puntas
      const k = -s * lado;
      p[m * 3] += vZ.x * k;
      p[m * 3 + 1] += vZ.y * k;
      p[m * 3 + 2] += vZ.z * k;
    }
  }

  chocar(c) {
    const w = this.g.world;
    const p = c.p;
    const o = c.o;
    for (let i = 0; i < c.n; i++) {
      const j = i * 3;
      const r = c.r[i];
      // paredes y utilería (de costado)
      if (w?.collide && (!c.main || CHOCA[i])) {
        tmpC.x = p[j];
        tmpC.z = p[j + 2];
        w.collide(tmpC, r, p[j + 1] - r, p[j + 1] + r);
        const dx = tmpC.x - p[j];
        const dz = tmpC.z - p[j + 2];
        if (dx || dz) {
          p[j] = tmpC.x;
          p[j + 2] = tmpC.z;
          o[j] += dx * 0.8;
          o[j + 2] += dz * 0.8;
        }
      }
      // el piso
      let fy = w?.floorAt ? w.floorAt(p[j], p[j + 2], p[j + 1] + 0.35) : c.by;
      if (!Number.isFinite(fy)) fy = c.fondo;
      fy = Math.max(fy, c.fondo);
      if (p[j + 1] - r < fy) {
        const vy = p[j + 1] - o[j + 1];
        // el golpe del cuerpo contra el piso (core/golpes.js)
        if (c.main && (i === J.pelvis || i === J.chest) && vy < -2.5 * PASO) this.g.golpes?.golpePiso(vP.set(p[j], fy, p[j + 2]), -vy / PASO);
        p[j + 1] = fy + r;
        o[j + 1] = p[j + 1] + vy * REBOTE;
        o[j] = p[j] - (p[j] - o[j]) * ROCE;
        o[j + 2] = p[j + 2] - (p[j + 2] - o[j + 2]) * ROCE;
      }
    }
  }

  // las piezas del cuerpo entero, entre sus puntos
  escribir(c) {
    const z = c.z;
    const M = z.mats;
    const p = c.p;
    const s = c.s;
    const dy = -(c.hunde || 0);
    const P = (i, v) => v.set(p[i * 3], p[i * 3 + 1] + dy, p[i * 3 + 2]);
    const lerp = (i, j, k, v) => v.set(p[i * 3] + (p[j * 3] - p[i * 3]) * k, p[i * 3 + 1] + (p[j * 3 + 1] - p[i * 3 + 1]) * k + dy, p[i * 3 + 2] + (p[j * 3 + 2] - p[i * 3 + 2]) * k);
    const dir = (i, j, v) => v.set(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]);
    // ejes de costado: la cadera y los hombros
    const xc = dir(J.hiR, J.hiL, vXC);
    const xs = dir(J.shR, J.shL, vXS);
    const up = dir(J.chest, J.pelvis, vUP);
    P(J.pelvis, vP);
    base(M[0], vP.x, vP.y, vP.z, up, xc, s);
    lerp(J.pelvis, J.chest, 0.5625, vP);
    base(M[1], vP.x, vP.y, vP.z, up, xs, s);
    P(J.head, vP);
    base(M[2], vP.x, vP.y, vP.z, dir(J.head, J.chest, vA), xs, s);
    M[13].multiplyMatrices(M[2], HAT);
    M[14].multiplyMatrices(M[2], EYE_L);
    M[15].multiplyMatrices(M[2], EYE_R);
    // brazos
    lerp(J.shL, J.elL, 0.517, vP);
    base(M[3], vP.x, vP.y, vP.z, dir(J.shL, J.elL, vA), xs, s);
    lerp(J.shR, J.elR, 0.517, vP);
    base(M[4], vP.x, vP.y, vP.z, dir(J.shR, J.elR, vA), xs, s);
    lerp(J.elL, J.haL, 0.485, vP);
    base(M[5], vP.x, vP.y, vP.z, dir(J.elL, J.haL, vA), xs, s);
    lerp(J.elR, J.haR, 0.485, vP);
    base(M[6], vP.x, vP.y, vP.z, dir(J.elR, J.haR, vA), xs, s);
    // piernas y pies
    lerp(J.hiL, J.knL, 0.488, vP);
    base(M[7], vP.x, vP.y, vP.z, dir(J.hiL, J.knL, vA), xc, s);
    lerp(J.hiR, J.knR, 0.488, vP);
    base(M[8], vP.x, vP.y, vP.z, dir(J.hiR, J.knR, vA), xc, s);
    lerp(J.knL, J.ftL, 0.467, vP);
    base(M[9], vP.x, vP.y, vP.z, dir(J.knL, J.ftL, vA), xc, s);
    lerp(J.knR, J.ftR, 0.467, vP);
    base(M[10], vP.x, vP.y, vP.z, dir(J.knR, J.ftR, vA), xc, s);
    this.pie(M[11], M[9], J.ftL, p, dy, s);
    this.pie(M[12], M[10], J.ftR, p, dy, s);
  }

  // el pie: con el giro de la canilla, en el tobillo y 4 cm adelante
  pie(m, shin, i, p, dy, s) {
    m.copy(shin);
    vZ.setFromMatrixColumn(shin, 2).normalize();
    m.setPosition(p[i * 3] + vZ.x * 0.04 * s, p[i * 3 + 1] + dy + vZ.y * 0.04 * s, p[i * 3 + 2] + vZ.z * 0.04 * s);
  }

  escribirPedazo(c) {
    const z = c.z;
    const M = z.lmats;
    if (!M) return;
    const p = c.p;
    const s = c.s;
    const dy = -(c.hunde || 0);
    for (const [part, a, b, k] of c.D.parts) {
      vA.set(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
      if (k < 0) {
        // el pie, en la punta de la canilla
        base(L, 0, 0, 0, vA, c.xh, s);
        vZ.setFromMatrixColumn(L, 2).normalize();
        L.setPosition(p[b * 3] + vZ.x * 0.04 * s, p[b * 3 + 1] + dy + vZ.y * 0.04 * s, p[b * 3 + 2] + vZ.z * 0.04 * s);
        M[part].copy(L);
        continue;
      }
      vP.set(p[a * 3] + (p[b * 3] - p[a * 3]) * k, p[a * 3 + 1] + (p[b * 3 + 1] - p[a * 3 + 1]) * k + dy, p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * k);
      base(M[part], vP.x, vP.y, vP.z, vA, c.xh, s);
    }
  }

  // Dónde estaba lo que se arrancó (la punta de arriba del pedazo), del
  // muñeco si ya cayó o de la pose.
  junta(z, nombre, out) {
    const D = PEDAZOS[nombre];
    if (!D) return null;
    return this.punto(z, D.pts[0], out);
  }

  punto(z, i, out) {
    const R = z.ragId === z.id ? z.rag : null;
    if (R) return out.set(R.p[i * 3], R.p[i * 3 + 1] - (R.hunde || 0), R.p[i * 3 + 2]);
    const f = FROM[i];
    return out.set(f[1], f[2], f[3]).applyMatrix4(z.mats[f[0]]);
  }

  // El muñón (core/golpes.js: el chorro): dónde quedó y para dónde apunta
  // (del hueso de arriba hacia afuera).
  munon(z, nombre, out) {
    const D = PEDAZOS[nombre];
    if (!D) return null;
    const i = D.pts[0];
    const padre = { [J.elL]: J.shL, [J.elR]: J.shR, [J.shL]: J.chest, [J.shR]: J.chest, [J.knL]: J.hiL, [J.knR]: J.hiR, [J.hiL]: J.pelvis, [J.hiR]: J.pelvis }[i];
    if (padre == null) return null;
    const p = this.punto(z, i, out);
    const q = this.punto(z, padre, vB);
    const d = (this.munD ||= new THREE.Vector3()).subVectors(p, q);
    const l = d.length();
    if (l < 1e-5) d.set(0, 1, 0);
    else d.multiplyScalar(1 / l);
    const R = (this.munR ||= { p: null, d: null });
    R.p = p;
    R.d = d;
    return R;
  }

  // ¿cuántos se mueven ahora? (pruebas)
  activos() {
    let n = 0;
    for (const c of this.cuerpos) if (!c.dormido) n++;
    return n;
  }

  dispose() {
    for (const c of this.cuerpos) {
      if (c.main && c.z.ragId === c.zid) {
        c.z.ragId = -1;
        c.z.rag = null;
      }
    }
    this.cuerpos.length = 0;
  }
}
