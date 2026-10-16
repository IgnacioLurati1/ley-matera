import * as THREE from 'three';
import { UMBRAL_REVIENTA } from './sentirTiro';

// Los tiros a lo Left 4 Dead (el usuario, 2026-10-16, eligió de la propuesta:
// "1 (con la variante, la labrador empuja menos porque si no estaría rotísima),
// 2, 3, 4 (ojo que no tape la visión), 5 (buscá sonidos), 6 me parece bien").
//
//  1. Cada tiro se siente: la parte donde pega se sacude (la cabeza para
//     atrás, el hombro, la cintura), sumado a lo que esté haciendo y sin
//     frenarlo (un resorte por muerto, solo en la imagen). La variante que
//     cambia el juego: la escopeta de cerca lo hace tambalear para atrás (el
//     estado 'reel' de entities/zombieReel.js, que ya viaja en la red); la
//     Labrador, menos (TAMBALEO).
//  2. Un tiro fuerte al brazo se lo arranca con el muerto vivo: sale volando
//     (entities/munieco.js) y queda el muñón chorreando. Sigue igual.
//  3. Al morir, las explosiones y la escopeta de cerca lo desarman: brazos y
//     piernas por su lado, el cuerpo cae como muñeco.
//  4. Más sangre: la niebla roja del impacto, la mancha en la pared o el piso
//     de atrás, y gotas en la pantalla cuando revienta uno muy cerca (solo
//     por los bordes: nunca en el medio).
//  6. Opciones > Sangre: poca (sin pedazos, sin manchas de atrás ni gotas,
//     las cabezas no revientan), normal o mucha.
//
// Lo decide el anfitrión; el invitado lo ve por la foto (net/Session: los
// pedazos que faltan y para dónde cae) y la sacudida de sus propios tiros.
// Interruptores: __mduSinReaccion (1), __mduSinTambaleo (la variante),
// __mduSinDespiece (2 y 3), __mduSinSangre2 (4).

// ---- 1. La sacudida ----------------------------------------------------------
// canales del resorte (se suman a la pose: rad)
const CH = ['torsoP', 'torsoR', 'torsoY', 'headP', 'headR', 'shLp', 'shRp', 'hipLp', 'hipRp'];
const NCH = CH.length;
const RES_HZ = 3.4;
const RES_Z = 0.42;
const TOPE = 0.85;
// cuánto se mueve cada canal por golpe (rad, a fuerza 1). f: de frente (+ si el
// tiro viene de adelante), s: de costado (+ si viene de su derecha)
const REAC = {
  head: { headP: [-0.55, 0], headR: [0, -0.45], torsoP: [-0.12, 0] },
  neck: { headP: [-0.35, 0], torsoP: [-0.3, 0], torsoY: [0, 0.25] },
  torso: { torsoP: [-0.32, 0], torsoY: [0, 0.32], torsoR: [0, -0.14], headP: [-0.18, 0] },
  pelvis: { torsoP: [0.3, 0], headP: [0.15, 0], torsoR: [0, -0.1] },
  armL: { shLp: [0.9, 0], torsoY: [-0.26, 0] },
  armR: { shRp: [0.9, 0], torsoY: [0.26, 0] },
  legL: { hipLp: [0.55, 0], torsoP: [0.14, 0] },
  legR: { hipRp: [0.55, 0], torsoP: [0.14, 0] },
};

// ---- 1. El tambaleo de la escopeta (cambia el juego) -------------------------
// t: cuánto dura (s), v: el empujón (m/s), de cerca (hasta cerca m) y de lejos
// (hasta lejos m; más lejos, nada). n: perdigones que le tienen que pegar.
// espera: después de un tambaleo, cuánto más (s) hasta poder tambalear otra vez.
const TAMBALEO = {
  escopeta: { t: [0.5, 0.3], v: [4.5, 1.8], cerca: 3, lejos: 7, n: 3 },
  labrador: { t: [0.3, 0.2], v: [2.2, 0.8], cerca: 3, lejos: 6, n: 2 },
  espera: 0.9,
};

// ---- 2 y 3. Los pedazos ------------------------------------------------------
// probabilidad con "Sangre: normal" (mucha: x MUCHA, hasta 1)
const DESPIECE = {
  // vivo: un tiro fuerte al brazo
  brazoVivo: 0.55,
  // al morir: explosión, por brazo y por pierna (entero / la mitad de abajo)
  // (medido con 20 juntos: con 0,3/0,3 y 0,22/0,25 volaban 46 pedazos)
  explosionBrazo: [0.2, 0.22],
  explosionPierna: [0.14, 0.18],
  // al morir: escopeta de cerca o tiro fuerte, en la parte que le pegó
  tiroBrazo: 0.7,
  tiroPierna: 0.5,
  // escopeta a quemarropa en el cuerpo: un brazo
  quemarropa: 0.25,
  quemarropaM: 2.2,
  escopetaM: 4,
};
const MUCHA = 1.6;

// ---- 4. La sangre ---------------------------------------------------------
// la mancha de atrás: hasta dónde busca (m), cada cuántos golpes (escopeta:
// por perdigón), tamaño (m) y cuántas por cuadro como mucho
const MANCHA = { lejos: 2.6, bala: 0.6, perdigon: 0.22, chica: 0.35, grande: 0.8, porCuadro: 4 };
// gotas en la pantalla: desde qué distancia (m) y cuántas a la vez como mucho
const GOTAS = { lejos: 2.4, max: 8 };

// ---- el muerto como cae (también va en la foto de la red) --------------------
// fuerza (m/s del cuerpo entero) por clase: 0 bala, 1 fuerte, 2 escopeta, 3 explosión
const FUERZA = [1.3, 2.4, 3.6, 7];
const ALZA = [0.2, 0.5, 1.2, 5];

const SND_DIR = '/assets/sotano/sfx/golpes/';
const SONIDOS = ['desgarro-1', 'desgarro-2', 'desgarro-3', 'carne-1', 'carne-2', 'carne-3', 'carne-4', 'cuerpo-1', 'cuerpo-2'];

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpH = {};
const tmpG = new THREE.Vector3();

const CSS = `
.mdu-gotas { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mdu-gota { position: absolute; background-size: 100% 100%; opacity: 0; transform-origin: 50% 0; animation: mdu-gota 1.9s ease-out forwards; }
@keyframes mdu-gota { 0% { opacity: 0; transform: scale(0.6) translateY(0); } 6% { opacity: var(--a, 0.85); transform: scale(1) translateY(0); } 35% { opacity: var(--a, 0.85); } 100% { opacity: 0; transform: scale(1) translateY(var(--cae, 4vmin)); } }
`;

// las manchas para la pantalla: una gota grande y mojada (centro oscuro, brillo
// arriba), salpicaduras alrededor y un chorrito que cae; hechas una vez
function manchas() {
  const out = [];
  for (let k = 0; k < 5; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const x = c.getContext('2d');
    let a = (k + 1) * 2654435761;
    const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    const blob = (cx, cy, rad, al) => {
      const g = x.createRadialGradient(cx, cy - rad * 0.2, rad * 0.1, cx, cy, rad);
      g.addColorStop(0, `rgba(70,2,2,${al})`);
      g.addColorStop(0.75, `rgba(118,6,5,${al * 0.95})`);
      g.addColorStop(0.92, `rgba(140,10,8,${al * 0.6})`);
      g.addColorStop(1, 'rgba(120,6,6,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(cx, cy, rad * (0.9 + r() * 0.2), rad * (0.9 + r() * 0.2), r() * 3, 0, Math.PI * 2);
      x.fill();
    };
    const R0 = 30 + r() * 14;
    blob(80, 72, R0, 0.92);
    // bordes irregulares
    for (let i = 0; i < 7; i++) {
      const an = r() * Math.PI * 2;
      blob(80 + Math.cos(an) * R0 * 0.7, 72 + Math.sin(an) * R0 * 0.7, R0 * (0.3 + r() * 0.25), 0.88);
    }
    // salpicaduras
    for (let i = 0; i < 12; i++) {
      const an = r() * Math.PI * 2;
      const d = R0 + 6 + r() * 30;
      blob(80 + Math.cos(an) * d, 72 + Math.sin(an) * d, 2 + r() * 5, 0.85);
    }
    // el chorrito que cae
    const cx = 72 + r() * 16;
    const gr = x.createLinearGradient(0, 80, 0, 158);
    gr.addColorStop(0, 'rgba(100,4,4,0.85)');
    gr.addColorStop(1, 'rgba(100,4,4,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.ellipse(cx, 110, 3 + r() * 2, 34 + r() * 14, 0, 0, Math.PI * 2);
    x.fill();
    // el brillo de mojado
    const hl = x.createRadialGradient(80 - R0 * 0.35, 72 - R0 * 0.4, 0, 80 - R0 * 0.35, 72 - R0 * 0.4, R0 * 0.35);
    hl.addColorStop(0, 'rgba(255,190,180,0.35)');
    hl.addColorStop(1, 'rgba(255,190,180,0)');
    x.fillStyle = hl;
    x.fillRect(0, 0, 160, 160);
    out.push(c.toDataURL());
  }
  return out;
}

export default class Golpes {
  constructor(g) {
    this.g = g;
    // los que tienen la sacudida andando y los tambaleos por decidir
    this.reac = [];
    this.tamb = [];
    this.manchasN = 0;
    this.carneT = 0;
    this.instalar();
  }

  // ---------------- lo que se engancha una vez ----------------
  instalar() {
    const g = this.g;
    const hud = g.hud;
    if (hud?.root && !hud.mduGotas) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      const el = document.createElement('div');
      el.className = 'mdu-gotas';
      hud.root.insertBefore(el, hud.root.firstChild);
      hud.mduGotas = el;
    }
    const a = g.audio;
    if (a?.ctx && !a.mduGolpes) {
      a.mduGolpes = { buf: {} };
      for (const id of SONIDOS) {
        fetch(SND_DIR + id + '.mp3')
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((ab) => a.ctx.decodeAudioData(ab))
          .then((b) => {
            a.mduGolpes.buf[id] = b;
          })
          .catch(() => {});
      }
    }
  }

  // ---------------- 6. el nivel de sangre ----------------
  nivel() {
    const v = this.g.settings?.gore;
    return v === 'poca' || v === 'mucha' ? v : 'normal';
  }

  poca() {
    return this.nivel() === 'poca';
  }

  prob(p) {
    const n = this.nivel();
    if (n === 'poca') return 0;
    return n === 'mucha' ? Math.min(1, p * MUCHA) : p;
  }

  despiece() {
    return !globalThis.__mduSinDespiece && !this.poca() && !globalThis.__mduSinMunieco;
  }

  // los que no tienen nada de esto: jefes y minijefes, bichos y los jugadores-zombi
  noEs(z) {
    return !!(z.boss || z.dog || z.horse || z.jinete || z.pombero || z.crow || z.yasy || z.stake || z.gz != null || z === this.g.zombies?.boss);
  }

  // ---------------- lo que trae el tiro ----------------
  propio(info) {
    return info.by == null || info.by === this.g.net?.id;
  }

  // 0 nada, 1 escopeta, 2 la Labrador
  escopeta(info) {
    if ((info.type || 'bullet') !== 'bullet') return 0;
    if (info.sf != null) return info.sf & 2 ? (info.sf & 4 ? 2 : 1) : 0;
    const st = this.propio(info) ? this.g.sentir?.tiro : null;
    if (!st || (st.pellets || 1) < 2) return 0;
    return st.sound === 'labrador' ? 2 : 1;
  }

  fuerte(info) {
    if ((info.type || 'bullet') !== 'bullet') return false;
    if (info.sf != null) return !!(info.sf & 1);
    const st = this.propio(info) ? this.g.sentir?.tiro : null;
    return !!st && (st.damage || 0) * (st.pellets || 1) * (st.headMult || 1) >= UMBRAL_REVIENTA;
  }

  // a cuántos metros estaba el que tiró
  distancia(z, info) {
    const g = this.g;
    const from = this.propio(info) ? g.player?.pos : g.net?.remote?.get(info.by)?.pos;
    return from ? Math.hypot(z.pos.x - from.x, z.pos.z - from.z) : 8;
  }

  // ---------------- cada golpe ----------------
  // Zombies.damage: en el anfitrión (y jugando solo) con el daño ya puesto,
  // vivo o no; en el invitado (inv) solo lo que se ve de su propio tiro.
  alGolpe(z, dmg, info, inv = false) {
    const g = this.g;
    // (solo los muertos comunes: ni jefes ni minijefes —el Capataz y los de
    // spawnBoss, el Pombero, el Cuervo, la Yasy, la estaca—, ni bichos; el usuario, 2026-10-16)
    if (this.noEs(z) || !info.point) return;
    const type = info.type || 'bullet';
    if (['freeze', 'chain', 'blast', 'burn', 'nuke', 'luz', 'yerba', 'melt', 'scald', 'acid', 'trapfire', 'juicio'].includes(type)) return;
    const esc = this.escopeta(info);
    const fuerte = this.fuerte(info);
    // lo que juntó este muerto en este tiro (todos los perdigones pasan en el mismo cuadro)
    if (z.gsT !== g.time || z.gsId !== z.id) {
      z.gsT = g.time;
      z.gsId = z.id;
      z.gsN = 0;
      z.gsParts = 0;
      z.gsArm = [0, 0];
    }
    z.gsN++;
    if (info.part != null) z.gsParts |= 1 << info.part;
    if (info.arm !== undefined) z.gsArm[info.arm] += dmg;
    z.gsEsc = esc;
    z.gsFuerte = fuerte;
    z.gsDir = info.dir;
    z.gsInfo = info;
    const d = this.distancia(z, info);
    z.gsD = d;
    // 1. la sacudida
    if (!globalThis.__mduSinReaccion) this.sacudir(z, dmg, info, esc, inv, fuerte);
    // 4. la sangre
    if (!globalThis.__mduSinSangre2) this.sangre(z, info, esc, fuerte);
    if (g.time - this.carneT > 0.05 && type === 'bullet') {
      this.carneT = g.time;
      this.sonar('carne-' + (1 + Math.floor(Math.random() * 4)), info.point, 0.5);
    }
    if (inv || z.hp <= 0 || z.dead) return;
    // 1. el tambaleo (se decide al terminar el cuadro, con todos los perdigones)
    if (esc && !globalThis.__mduSinTambaleo && !this.tamb.includes(z)) this.tamb.push(z);
    // 2. el brazo con el muerto vivo
    if (info.arm !== undefined && this.despiece()) this.brazoVivo(z, info, esc, fuerte, d);
    // (la explosión que lo dejó arrastrándose: las canillas vuelan)
    this.sueltos(z, info.dir);
  }

  // 1. la sacudida
  sacudir(z, dmg, info, esc, inv, fuerte) {
    const R = REAC[this.zona(info)];
    if (!R) return;
    const dir = info.dir;
    if (!dir) return;
    if (z.gkId !== z.id) {
      z.gkId = z.id;
      z.gk = new Float32Array(NCH * 2);
    }
    // el tiro en el cuerpo del muerto: f > 0 si viene de adelante, s > 0 de su derecha
    const sy = Math.sin(z.yaw);
    const cy = Math.cos(z.yaw);
    const f = -(dir.x * sy + dir.z * cy);
    const s = -(dir.x * cy - dir.z * sy);
    // la fuerza: según cuánto de su vida se llevó (los perdigones suman de a poco)
    // (en el invitado no sabe la vida que le queda: por el mate)
    const k0 = inv ? (fuerte ? 1.1 : 0.75) : Math.min(1.3, 0.35 + (1.6 * dmg) / Math.max(1, z.maxHp || 1));
    const k = k0 * (esc ? 0.32 : 1) * (0.85 + Math.random() * 0.3);
    const w = RES_HZ * Math.PI * 2 * 2.2;
    const gk = z.gk;
    for (const key in R) {
      const c = CH.indexOf(key);
      const [kf, ks] = R[key];
      gk[c * 2 + 1] += (kf * f + ks * s) * k * w;
    }
    if (!this.reac.includes(z)) this.reac.push(z);
  }

  zona(info) {
    const p = info.part;
    if (info.zone === 'head') return 'head';
    if (info.zone === 'neck') return 'neck';
    if (p === 0) return 'pelvis';
    if (p === 3 || p === 5 || info.arm === 0) return 'armL';
    if (p === 4 || p === 6 || info.arm === 1) return 'armR';
    if (p === 7 || p === 9) return 'legL';
    if (p === 8 || p === 10) return 'legR';
    return 'torso';
  }

  // Zombies.render: la sacudida se suma a la pose solo para dibujar (k = 1) y se saca después (k = -1)
  sumar(R, gk, k) {
    for (let c = 0; c < NCH; c++) {
      const v = gk[c * 2];
      if (v) R[CH[c]] = (R[CH[c]] || 0) + v * k;
    }
  }

  // 4. la sangre
  sangre(z, info, esc, fuerte) {
    const g = this.g;
    const p = info.point;
    const d = info.dir;
    if (!d) return;
    const big = fuerte ? 1.4 : esc ? 0.8 : 1;
    // la niebla roja del impacto, para el lado que sale el tiro
    const fx = g.fx;
    for (let i = 0; i < 2; i++) {
      fx.alpha.spawn(p.x, p.y, p.z, d.x * (0.8 + i) + (Math.random() - 0.5) * 0.4, d.y * 0.5 + 0.15, d.z * (0.8 + i) + (Math.random() - 0.5) * 0.4, { color: [0.28, 0.01, 0.01], size: 0.08 * big, size1: 0.45 * big, life: 0.45, alpha: 0.42, drag: 3.5 });
    }
    // el chorro que sale por atrás
    if (!esc || Math.random() < 0.35) fx.blood(p, { x: d.x * 1.3, y: 0.35 + (d.y || 0), z: d.z * 1.3 }, fuerte ? 10 : 5, big);
    // la mancha en la pared o el piso de atrás
    if (this.poca() || this.manchasN >= MANCHA.porCuadro) return;
    const ch = this.prob(esc ? MANCHA.perdigon : MANCHA.bala);
    if (Math.random() >= ch) return;
    const w = g.world;
    if (!w?.raycast) return;
    tmpD.set(d.x, d.y || 0, d.z);
    // (un poco para abajo: la sangre cae)
    tmpD.y -= 0.25;
    tmpD.normalize();
    const t = w.raycast(p, tmpD, MANCHA.lejos, tmpH);
    if (!Number.isFinite(t) || t >= MANCHA.lejos || !tmpH.point || !tmpH.normal) return;
    this.manchasN++;
    const size = (MANCHA.chica + Math.random() * (MANCHA.grande - MANCHA.chica)) * (fuerte ? 1.3 : 1) * (1 - (t / MANCHA.lejos) * 0.4);
    fx.decal(1, tmpH.point, tmpH.normal, size);
  }

  // 2. el brazo con el muerto vivo (un tiro fuerte, la escopeta de cerca, o
  // más de un 30 % de su vida de un tiro, como el antebrazo de antes)
  brazoVivo(z, info, esc, fuerte, d) {
    const arm = info.arm;
    const acc = z.gsArm?.[arm] || 0;
    const cerca = esc && d < DESPIECE.escopetaM;
    if (!(fuerte || cerca || acc > (z.maxHp || 1) * 0.3)) return;
    if (z.gsBrazo === z.gsT) return;
    if (Math.random() >= this.prob(DESPIECE.brazoVivo)) return;
    z.gsBrazo = z.gsT;
    const sd = arm === 0 ? 'L' : 'R';
    const arriba = info.part === 3 || info.part === 4;
    const sinAnte = z.looseId === z.id && z.loose & (1 << (5 + arm));
    const nombre = sinAnte ? 'hombro' + sd : arriba && (fuerte || cerca) ? 'brazo' + sd : 'antebrazo' + sd;
    this.arrancar(z, nombre, info.dir, 1);
  }

  // un pedazo que vuela, con su sangre y su ruido
  arrancar(z, nombre, dir, fuerza = 1, v = null) {
    const g = this.g;
    const mu = g.zombies?.mu;
    if (!mu) return false;
    const vel = v || tmpV.set((dir?.x || 0) * (2.5 + Math.random() * 2) * fuerza + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.6, (dir?.z || 0) * (2.5 + Math.random() * 2) * fuerza + (Math.random() - 0.5) * 1.5);
    if (!mu.arrancar(z, nombre, vel, 1.6 + Math.random())) return false;
    // la sangre de donde salió y el chorro del muñón
    const j = mu.junta(z, nombre, tmpD);
    if (j) {
      g.fx.blood(j, { x: vel.x * 0.15, y: 0.6, z: vel.z * 0.15 }, 18, 1.2);
      z.mduMunon = 1.1;
      z.mduMunonId = z.id;
      z.mduMunonP = nombre;
      if (!this.munones) this.munones = [];
      if (!this.munones.includes(z)) this.munones.push(z);
      this.sonar('desgarro-' + (1 + Math.floor(Math.random() * 3)), j, 0.8);
      this.gotasSi(j, 0.6);
    }
    return true;
  }

  // los pedazos que el juego de siempre escondió (la explosión que lo deja
  // arrastrándose, el antebrazo de la Gut o de la explosión al morir): vuelan
  sueltos(z, dir) {
    if (!this.despiece()) return;
    const lz = z.looseId === z.id ? z.loose : 0;
    for (const [bits, nombre] of [
      [1 << 5, 'antebrazoL'],
      [1 << 6, 'antebrazoR'],
      [(1 << 9) | (1 << 11), 'canillaL'],
      [(1 << 10) | (1 << 12), 'canillaR'],
    ]) {
      if ((z.hidden & bits) === bits && !(lz & bits)) {
        // (escondido sin volar: que vuele)
        z.hidden &= ~bits;
        this.arrancar(z, nombre, dir, 0.8);
      }
    }
  }

  // ---------------- 3. al morir ----------------
  // Zombies.kill, al final (en el anfitrión o jugando solo)
  alMorir(z, info, type) {
    const g = this.g;
    if (this.noEs(z)) return;
    const mu = g.zombies?.mu;
    if (!mu || mu.apagado()) return;
    // los que salían volando (la explosión, el puñado de la Gut, el ventarrón):
    // ahora vuelan como muñeco
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let clase = 0;
    const dir = info.dir;
    const dl = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
    const hx = dir ? dir.x / dl : 0;
    const hz = dir ? dir.z / dl : 0;
    const exp = type === 'explosive' || type === 'blast' || type === 'gut' || z.state === 'flung';
    if (z.state === 'flung') {
      vx = z.vel.x * 0.7;
      vy = Math.min(6, z.vel.y);
      vz = z.vel.z * 0.7;
      z.state = 'dead';
      z.stateT = 0;
      z.window = -1;
      z.pos.y = z.baseY || 0;
      clase = 3;
    } else if (exp) {
      vx = hx * FUERZA[3];
      vz = hz * FUERZA[3];
      vy = ALZA[3];
      clase = 3;
    } else if (z.state === 'dead' && dir) {
      const esc = this.escopeta(info);
      const d = this.distancia(z, info);
      clase = esc ? (d < 3 ? 2 : 1) : this.fuerte(info) ? 1 : 0;
      const F = esc && d >= 3 ? FUERZA[1] + (FUERZA[2] - FUERZA[1]) * Math.max(0, 1 - (d - 3) / 6) : FUERZA[clase];
      vx = hx * F;
      vz = hz * F;
      vy = ALZA[clase];
    }
    if (z.state !== 'dead') return;
    // el empujón del muñeco: todo el cuerpo y, de más, donde pegó
    const p = info.point;
    const hk = clase === 3 ? 0 : 2.6 + clase;
    z.ragImp = { vx, vy, vz, hx: hx * hk, hy: (dir?.y || 0) * hk, hz: hz * hk, px: p?.x || 0, py: p?.y || 0, pz: p?.z || 0 };
    z.ragImpId = z.id;
    // para la red: para dónde (8) y con cuánta fuerza (4)
    const ang = Math.atan2(vx, vz);
    z.mduGolpe = 32 | ((((Math.round((ang / (Math.PI * 2)) * 8) % 8) + 8) % 8) | (clase << 3));
    z.mduGolpeId = z.id;
    if (!this.despiece()) return;
    // 3. los pedazos
    const v0 = tmpV.set(vx, vy, vz);
    const salen = [];
    if (exp) {
      for (const [sd, i] of [['L', 0], ['R', 1]]) {
        const r = Math.random();
        const [b0, b1] = DESPIECE.explosionBrazo.map((q) => this.prob(q));
        if (r < b0) salen.push('brazo' + sd);
        else if (r < b0 + b1) salen.push('antebrazo' + sd);
        const r2 = Math.random();
        const [p0, p1] = DESPIECE.explosionPierna.map((q) => this.prob(q));
        if (!z.crawler && r2 < p0) salen.push('pierna' + sd);
        else if (!z.crawler && r2 < p0 + p1) salen.push('canilla' + sd);
        void i;
      }
    } else if (z.gsT === g.time && z.gsId === z.id && (type === 'bullet' || type === 'gut')) {
      const esc = z.gsEsc;
      const cerca = esc && z.gsD < DESPIECE.escopetaM;
      if (cerca || z.gsFuerte) {
        const P = z.gsParts || 0;
        for (const [sd, up, lo] of [['L', 3, 5], ['R', 4, 6]]) {
          if (P & ((1 << up) | (1 << lo)) && Math.random() < this.prob(DESPIECE.tiroBrazo)) salen.push((P & (1 << up)) && cerca ? 'brazo' + sd : 'antebrazo' + sd);
        }
        for (const [sd, th, sh] of [['L', 7, 9], ['R', 8, 10]]) {
          if (!z.crawler && P & ((1 << th) | (1 << sh)) && Math.random() < this.prob(DESPIECE.tiroPierna)) salen.push(P & (1 << th) ? 'pierna' + sd : 'canilla' + sd);
        }
        if (esc && z.gsD < DESPIECE.quemarropaM && !salen.length && Math.random() < this.prob(DESPIECE.quemarropa)) salen.push(Math.random() < 0.5 ? 'brazoL' : 'brazoR');
      }
    }
    for (const n of salen) {
      // si ya no tenía el antebrazo, se va lo que queda
      const sd = n.slice(-1);
      const arm = sd === 'L' ? 0 : 1;
      let nombre = n;
      if (n.startsWith('brazo') && z.looseId === z.id && z.loose & (1 << (5 + arm))) nombre = 'hombro' + sd;
      const vel = new THREE.Vector3(v0.x * 1.3 + (Math.random() - 0.5) * 4, v0.y + 1.5 + Math.random() * 3, v0.z * 1.3 + (Math.random() - 0.5) * 4);
      this.arrancar(z, nombre, null, 1, vel);
    }
    // los que el juego de siempre escondió en esta muerte (la Gut, la explosión)
    this.sueltos(z, dir);
    // las gotas en la pantalla si reventó cerca
    if (exp || clase >= 2 || z.mduRevId === z.id) this.gotasSi(tmpV.setFromMatrixPosition(z.mats[1]), exp ? 1 : 0.7);
  }

  // ---------------- en la red ----------------
  // Session: lo que va en la foto de cada muerto (dos bytes). m: las partes que
  // volaron; c: para dónde cae y con cuánta fuerza (32 = hay)
  foto(z) {
    const lz = z.looseId === z.id ? z.loose : 0;
    let m = 0;
    if (lz) {
      // 5 6 3 4 9 10 7 8 → bits 0..7
      const P = [5, 6, 3, 4, 9, 10, 7, 8];
      for (let i = 0; i < 8; i++) if (lz & (1 << P[i])) m |= 1 << i;
    }
    return [m, z.dead && z.mduGolpeId === z.id ? z.mduGolpe || 0 : 0];
  }

  // Zombies.applyRemote, en el invitado
  remota(z, f, was, state) {
    const m = f.gm || 0;
    const c = f.gc || 0;
    // para dónde cae (antes de que arranque el muñeco)
    if (c & 32 && z.ragImpId !== z.id) {
      const clase = (c >> 3) & 3;
      const ang = ((c & 7) / 8) * Math.PI * 2;
      z.ragImp = { vx: Math.sin(ang) * FUERZA[clase], vy: ALZA[clase], vz: Math.cos(ang) * FUERZA[clase] };
      z.ragImpId = z.id;
    }
    if (!m || globalThis.__mduSinMunieco || !z.solved) return;
    const lz = z.looseId === z.id ? z.loose : 0;
    const P = [5, 6, 3, 4, 9, 10, 7, 8];
    let nuevos = 0;
    for (let i = 0; i < 8; i++) if (m & (1 << i) && !(lz & (1 << P[i]))) nuevos |= 1 << P[i];
    if (!nuevos) return;
    // para dónde: desde el jugador más cerca (el que tiró, casi seguro)
    const pl = this.cercano(z);
    const dir = pl ? tmpD.set(z.pos.x - pl.x, 0, z.pos.z - pl.z).normalize() : null;
    const I = z.ragImpId === z.id ? z.ragImp : null;
    for (const [sd, up, lo] of [['L', 3, 5], ['R', 4, 6]]) {
      const a = nuevos & (1 << up);
      const b = nuevos & (1 << lo);
      if (a && b) this.arrancarRemoto(z, 'brazo' + sd, dir, I);
      else if (b) this.arrancarRemoto(z, 'antebrazo' + sd, dir, I);
      else if (a) this.arrancarRemoto(z, 'hombro' + sd, dir, I);
    }
    for (const [sd, th, sh] of [['L', 7, 9], ['R', 8, 10]]) {
      const a = nuevos & (1 << th);
      const b = nuevos & (1 << sh);
      if (a && b) this.arrancarRemoto(z, 'pierna' + sd, dir, I);
      else if (b) this.arrancarRemoto(z, 'canilla' + sd, dir, I);
      else if (a) this.arrancarRemoto(z, 'muslo' + sd, dir, I);
    }
    void was;
    void state;
  }

  arrancarRemoto(z, nombre, dir, I) {
    const v = I ? new THREE.Vector3(I.vx * 1.3 + (Math.random() - 0.5) * 4, (I.vy || 0) + 1.5 + Math.random() * 3, I.vz * 1.3 + (Math.random() - 0.5) * 4) : null;
    this.arrancar(z, nombre, dir, 1, v);
  }

  cercano(z) {
    const g = this.g;
    let best = g.player?.pos;
    let bd = best ? Math.hypot(best.x - z.pos.x, best.z - z.pos.z) : Infinity;
    for (const r of g.net?.remote?.values?.() || []) {
      const p = r.pos;
      if (!p) continue;
      const d = Math.hypot(p.x - z.pos.x, p.z - z.pos.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ---------------- 4. gotas en la pantalla ----------------
  gotasSi(p, k = 1) {
    const g = this.g;
    if (globalThis.__mduSinSangre2 || this.poca() || !p) return;
    const cam = g.camera?.position;
    if (!cam || g.state !== 'playing') return;
    p = tmpG.copy(p);
    const d = cam.distanceTo(p);
    if (d > GOTAS.lejos) return;
    // que esté adelante (lo de atrás no salpica la cara)
    g.camera.getWorldDirection(tmpD);
    tmpV.set(p.x - cam.x, p.y - cam.y, p.z - cam.z).normalize();
    if (tmpD.dot(tmpV) < 0.2) return;
    this.gotas(Math.round((2 + Math.random() * 3) * k * (1 - d / GOTAS.lejos) + 1));
  }

  gotas(n) {
    const g = this.g;
    const box = g.hud?.mduGotas;
    if (!box) return;
    const imgs = (this.imgs ||= manchas());
    const calm = g.settings?.calmFx;
    if (this.nivel() === 'mucha') n += 2;
    if (calm) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      while (box.childElementCount >= GOTAS.max) box.firstChild.remove();
      const el = document.createElement('div');
      el.className = 'mdu-gota';
      const sz = 14 + Math.random() * 12;
      // solo los bordes: los costados (hasta el 20 %) o arriba (hasta el 14 %)
      let x;
      let y;
      if (Math.random() < 0.8) {
        x = Math.random() < 0.5 ? Math.random() * 20 - sz * 0.3 : 100 - Math.random() * 20 - sz * 0.7;
        y = 4 + Math.random() * 80;
      } else {
        x = 18 + Math.random() * 64;
        y = Math.random() * 14 - sz * 0.4;
      }
      el.style.cssText = `left:${x}%;top:${y}%;width:${sz}vmin;height:${sz}vmin;background-image:url(${imgs[(Math.random() * imgs.length) | 0]});--a:${calm ? 0.45 : 0.82};--cae:${2 + Math.random() * 5}vmin`;
      el.addEventListener('animationend', () => el.remove(), { once: true });
      box.appendChild(el);
    }
  }

  // ---------------- sonidos ----------------
  sonar(id, pos, gain = 0.7) {
    const a = this.g.audio;
    const buf = a?.mduGolpes?.buf[id];
    if (!buf || !pos) return;
    const was = a.cat;
    a.cat = 'zombies';
    try {
      a.playBuffer(buf, { pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), gain, reverb: 0.1, ref: 3, rate: 0.92 + Math.random() * 0.16 });
    } finally {
      a.cat = was;
    }
  }

  // el muñeco golpeó el piso fuerte (entities/munieco.js)
  golpePiso(p, v) {
    if (v < 2.5) return;
    if (this.g.time - (this.pisoT || 0) < 0.08) return;
    this.pisoT = this.g.time;
    this.sonar('cuerpo-' + (1 + Math.floor(Math.random() * 2)), p, Math.min(0.7, 0.2 + v * 0.06));
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.manchasN = 0;
    // 1. el tambaleo, con todos los perdigones del tiro ya contados
    for (const z of this.tamb) this.tambalear(z);
    this.tamb.length = 0;
    // el resorte de cada uno
    const W = RES_HZ * Math.PI * 2;
    const n = dt > 1 / 50 ? 2 : 1;
    const h = dt / n;
    for (let i = this.reac.length - 1; i >= 0; i--) {
      const z = this.reac[i];
      const gk = z.gk;
      if (!z.active || z.gkId !== z.id || z.dead || !gk) {
        if (gk && z.gkId === z.id) gk.fill(0);
        this.reac.splice(i, 1);
        continue;
      }
      let quieto = true;
      for (let c = 0; c < NCH; c++) {
        let x = gk[c * 2];
        let v = gk[c * 2 + 1];
        if (!x && !v) continue;
        for (let s = 0; s < n; s++) {
          v += (-W * W * x - 2 * RES_Z * W * v) * h;
          x += v * h;
        }
        if (x > TOPE) {
          x = TOPE;
          v = Math.min(v, 0);
        } else if (x < -TOPE) {
          x = -TOPE;
          v = Math.max(v, 0);
        }
        if (Math.abs(x) < 1e-4 && Math.abs(v) < 1e-3) x = v = 0;
        else quieto = false;
        gk[c * 2] = x;
        gk[c * 2 + 1] = v;
      }
      if (quieto) this.reac.splice(i, 1);
    }
    // el chorro de los muñones
    const M = this.munones;
    if (M) {
      const mu = g.zombies?.mu;
      for (let i = M.length - 1; i >= 0; i--) {
        const z = M[i];
        if (!z.active || z.mduMunonId !== z.id || !(z.mduMunon > 0) || !mu) {
          M.splice(i, 1);
          continue;
        }
        z.mduMunon -= dt;
        z.mduMunonGota = (z.mduMunonGota || 0) - dt;
        if (z.mduMunonGota > 0) continue;
        z.mduMunonGota = 1 / 24;
        const j = mu.munon(z, z.mduMunonP, tmpV);
        if (!j) continue;
        const k = Math.max(0.3, z.mduMunon / 1.1);
        g.fx.blood(j.p, { x: j.d.x * 1.6 * k, y: j.d.y * 1.6 * k + 0.4, z: j.d.z * 1.6 * k }, 1, 0.7);
      }
    }
  }

  // 1. la escopeta de cerca: tambalea para atrás (el anfitrión)
  tambalear(z) {
    const g = this.g;
    if (!z.active || z.dead || z.gsId !== z.id || g.time - z.gsT > 0.2) return;
    if (this.noEs(z) || z.crawler || !(z.state === 'chase' || z.state === 'attack')) return;
    if (z.tambHasta && g.time < z.tambHasta && z.tambId === z.id) return;
    const T = z.gsEsc === 2 ? TAMBALEO.labrador : TAMBALEO.escopeta;
    const d = z.gsD ?? 99;
    if (z.gsN < T.n || d > T.lejos) return;
    const k = Math.max(0, Math.min(1, (d - T.cerca) / (T.lejos - T.cerca)));
    const t = T.t[0] + (T.t[1] - T.t[0]) * k;
    const v = T.v[0] + (T.v[1] - T.v[0]) * k;
    const dir = z.gsDir;
    const l = dir ? Math.hypot(dir.x, dir.z) : 0;
    if (l < 0.1) return;
    z.reelT = t;
    z.reelV = { x: (dir.x / l) * v, z: (dir.z / l) * v };
    g.zombies.setState(z, 'reel');
    z.tambHasta = g.time + t + TAMBALEO.espera;
    z.tambId = z.id;
  }

  dispose() {
    this.reac.length = 0;
    this.tamb.length = 0;
    if (this.munones) this.munones.length = 0;
    this.g.hud?.mduGotas?.replaceChildren();
  }
}
