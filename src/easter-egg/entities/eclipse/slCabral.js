import * as THREE from 'three';
import CastleCine, { smooth, lerp } from '../../ui/castleCine';
import CineActors, { yawTo } from '../../ui/cineActors';
import CineHorde from '../../ui/cineHorde';
import { POSE } from './montar';
import { gilVincha } from '../../net/gilLook';
import { toWorld, toLocal, hLoc, dirWorld, yawOf } from '../../world/eclipse/sanlorenzoCampo';

// La caída (San Lorenzo, fase 3; CINEMATICAS.md §3): escena dentro del juego,
// con la cámara suelta ~18 s. En plena carga, El Eclipse le voltea el caballo
// a San Martín de un manotazo; San Martín queda con la pierna atrapada y se le
// vienen tres realistas. Cabral salta del caballo, se pone adelante, los frena
// a sablazos y recibe los golpes; cae de rodillas. Pasa un granadero y barre a
// los que quedan. San Martín se zafa y se arrodilla al lado de Cabral:
// "Muero contento. Hemos batido al enemigo." San Martín se levanta, alza el
// sable: "¡Granaderos! ¡A la carga!" y la caballería sale del convento.
// Los cuatro del estero miran desde atrás, cada uno a su manera (ui/cineCrew
// PERSONA): el Valiente corre hacia ahí, el Miedoso se santigua, el Canchero
// se lleva la mano al pecho, el Viejo cae de rodillas. Las manos ocupadas: sin
// mate. Sin sangre de más: se entiende, no se regodea.
// Usa a los de verdad (slAliados: San Martín, su caballo, Cabral, un granadero)
// y El Eclipse (slEclipse); los realistas son títeres (ui/cineHorde) y los
// cuatro, ui/cineActors. Al terminar Cabral queda tendido en el campo y San
// Martín, montado en el caballo de repuesto.

const CREW_COLOR = { gil: 0xb01c14, anacleto: 0x3a6a2a, cirilo: 0x2a3a7a, benito: 0x7a5a2a, nicasio: 0x5a2a6a };
const MATES = ['anacleto', 'cirilo', 'benito', 'nicasio'];
const tmpV = new THREE.Vector3();
const L = {};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => smooth(clamp01(x));
const puppetYaw = (h) => h + Math.PI;

export default class CabralScene extends CastleCine {
  // at: { u, v } donde cae el caballo (lo dice el anfitrión)
  constructor(sl, at) {
    super(sl.g, { drive: false, kind: 'eclipse' });
    this.sl = sl;
    this.at = at || { u: 32, v: 4 };
  }

  // un punto: F + adelante (hacia el río) + al costado (al norte) + alto
  P(fwd, side, up = 0, out = new THREE.Vector3()) {
    const F = this.F;
    out.set(F.x + this.dir.x * fwd + this.side.x * side, 0, F.z + this.dir.z * fwd + this.side.z * side);
    toLocal(out.x, out.z, L);
    out.y = hLoc(L.u, L.v) + up;
    return out;
  }

  build() {
    const g = this.g;
    const sl = this.sl;
    const al = sl.al;
    const B = sl.boss;
    this.F = toWorld(this.at.u, this.at.v);
    this.dir = dirWorld(1, 0, new THREE.Vector3());
    this.side = dirWorld(0, 1, new THREE.Vector3());
    this.east = yawOf(1, 0);
    // lo de la partida, afuera de cuadro
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    const Z = g.zombies;
    this.zHide = [...(Z.meshes || []).map((M) => M.im), Z.batch?.mesh, Z.blobs].filter((o) => o && o.visible);
    for (const o of this.zHide) o.visible = false;
    // San Martín: sale de la columna (la escena lo maneja)
    const sm = al.sm;
    this.sm = sm;
    al.sq[0].lead = false;
    sm.lead = null;
    sm.scene = true;
    this.h = sm.mh || sm.h;
    this.mont = sm.mont;
    this.h.state = 'vivo';
    this.h.gait = null;
    // Cabral y el granadero que pasa: salen de su escuadrón
    this.cab = al.cabral;
    this.cab.scene = true;
    this.rider = al.sq[0].riders[1];
    if (this.rider) this.rider.scene = true;
    // los realistas
    this.horde = new CineHorde(g, 6);
    // los cuatro del estero
    this.buildCrew();
    // El Eclipse, en su lugar para el manotazo (la escena empieza con un corte)
    B.R.root.visible = true;
    this.smPose = 'monta';
    this.cabPose = 'monta';
    const F = this.F;
    const dir = this.dir;
    const side = this.side;
    // el caballo de San Martín llega al galope
    this.ride = { t: 0 };
    const crew = this.crew;
    return [
      // 1. la carga: San Martín al galope; El Eclipse levanta la mano y la baja
      [
        0,
        () => {
          this.slamAt = this.P(2.2, 0.6);
          B.slam(this.slamAt.x, this.slamAt.z, 1.15);
          B.C.u = B.C.uTo;
          B.C.v = B.C.vTo;
          this.shot(2.7, (u, lt, pos, look) => {
            pos.copy(this.P(-13 + u * 2.5, -8.5, 1.7));
            look.copy(this.P(5, 0.5, 5 + u * 1.5));
          });
          this.setFov(70);
          this.later(1.15, () => this.horseDown());
          return 2.7;
        },
      ],
      // 2. San Martín atrapado; se le vienen tres
      [
        0,
        () => {
          this.shot(2.5, (u, lt, pos, look) => {
            pos.copy(this.P(-2.6 - u * 0.4, -3.0, 0.95));
            look.copy(this.P(0.6, 0.2, 0.45));
          });
          this.setFov(55);
          for (const s of [-1.6, 0, 1.6]) {
            const p = this.P(11 + Math.abs(s) * 0.8, s);
            const z = this.horde.spawn(p.x, p.z, yawOf(-1, 0), { state: 'lurk', speedType: 'run' });
            if (z) {
              const to = this.P(1.4, s * 0.45);
              this.horde.run(z, to.x, to.z, 3.3);
            }
          }
          this.struggle = 1;
          return 2.5;
        },
      ],
      // 3. Cabral salta del caballo y se pone adelante (los cuatro, de espaldas, miran)
      [
        0,
        () => {
          this.cabIn();
          const c = this.P(-8.6, -1.0);
          this.shot(2.6, (u, lt, pos, look) => {
            pos.copy(c).addScaledVector(dir, -3.6 + u * 0.4).addScaledVector(side, -0.4);
            pos.y += 1.95;
            look.copy(this.P(0.8, 0.4, 0.9));
          });
          this.setFov(64);
          crew?.each({ valiente: ['fists', { loop: true }], miedoso: ['santiguar', { loop: true }], canchero: ['crossArms', { loop: true }], viejo: ['winded', { loop: true }] }, 0.2);
          if (crew?.by.valiente) {
            const r = crew.by.valiente;
            crew.later(0.3, () => crew.walkTo(r, r.pos.clone().addScaledVector(dir, 2.6).addScaledVector(side, 0.4), 1.3, 'fists', { loop: true }));
          }
          return 2.6;
        },
      ],
      // 4. la pelea: los frena a sablazos, cae uno; los otros dos le pegan; cae de rodillas
      [
        0,
        () => {
          this.shot(3.2, (u, lt, pos, look) => {
            pos.copy(this.P(5.2 - u * 0.6, -3.6, 1.25));
            look.copy(this.cabAt(tmpV).setY(this.cabAt(tmpV).y + 1.0));
          });
          this.setFov(52);
          this.fight = 0;
          this.later(0.25, () => this.slash(0));
          this.later(1.0, () => this.slash(1));
          this.later(1.55, () => this.hurt());
          this.later(2.1, () => this.hurt());
          this.later(2.6, () => {
            this.cabPose = 'rodillas';
            this.cabT = 0;
          });
          this.later(2.85, () => this.riderBy());
          crew?.each({ miedoso: ['pray', { loop: true }], canchero: ['chestHand', { loop: true }], viejo: ['kneelDown', {}] }, 0.6);
          crew?.later(2.9, () => crew.by.viejo && crew.act(crew.by.viejo, 'kneelHold', { loop: true }));
          return 3.2;
        },
      ],
      // 5. San Martín se zafa y se arrodilla al lado; Cabral: la línea
      [
        0,
        () => {
          this.smFree();
          this.cabPose = 'tendido';
          this.cabT = 0;
          const c = this.cab.a.r.pos;
          this.shot(4.4, (u, lt, pos, look) => {
            pos.copy(c).addScaledVector(side, 2.5 - u * 0.3).addScaledVector(dir, 1.3);
            pos.y += 1.05;
            look.copy(c).addScaledVector(side, -0.45);
            look.y += 0.55;
          });
          this.setFov(48);
          this.later(0.5, () => this.say('cabral', 'Muero contento. Hemos batido al enemigo.'));
          this.later(3.7, () => (this.cabDead = 1));
          return 4.4;
        },
      ],
      // 6. San Martín se levanta y alza el sable: ¡a la carga! Sale la caballería.
      [
        0,
        () => {
          this.smPose = 'arriba';
          this.smT = 0;
          if (this.sm.a.gs) this.sm.a.gs.sableK = 0.9;
          this.sm.r.yaw = puppetYaw(this.east);
          const s = this.sm.r.pos;
          this.shot(4.0, (u, lt, pos, look) => {
            pos.copy(s).addScaledVector(dir, 3.4 + u * 0.6).addScaledVector(side, -1.3 - u * 0.4);
            pos.y += 0.7 + u * 0.5;
            look.copy(s).addScaledVector(dir, -u * 6);
            look.y += 1.7;
          });
          this.setFov(56);
          this.later(0.55, () => this.say('sanmartin', '¡Granaderos! ¡A la carga!'));
          this.later(1.6, () => {
            this.sl.al.clarin();
            for (const s2 of [1, -1]) this.sl.al.charge(s2, s2 * 6);
          });
          crew?.each({ valiente: ['fistUp', { loop: true }], miedoso: ['cool', { loop: true }], canchero: ['cool', { loop: true }] }, 0.9);
          return 4.0;
        },
      ],
    ];
  }

  // Los cuatro del estero, con los colores de sus papeles; el Gil con la vincha.
  buildCrew() {
    const g = this.g;
    let C;
    try {
      C = new CineActors(g, { base: 640, parent: this.root });
    } catch {
      return;
    }
    const ee = this.sl.ee;
    const used = new Set();
    for (const r of C.list) {
      const id = r.id - 640;
      const role = ee.roleOf?.(id);
      if (role) used.add(role);
      r.role = role;
    }
    for (const r of C.list) {
      if (!r.role) r.role = MATES.find((m) => !used.has(m)) || 'nicasio';
      used.add(r.role);
      r.a.M.poncho.color.set(CREW_COLOR[r.role] || 0x7a5a2a).multiplyScalar(1.7);
    }
    // en fila, atrás (del lado del convento), mirando adonde cae el caballo
    C.list.forEach((r, i) => {
      const p = this.P(-8.2 - Math.abs(i - 1.5) * 0.5, -3.2 + i * 1.45);
      r.pos.copy(p);
      r.yaw = yawTo(r.pos, this.F);
    });
    C.each({ valiente: ['cool', { loop: true }], miedoso: ['cower', { loop: true }], canchero: ['cool', { loop: true }], viejo: ['winded', { loop: true }] }, 0);
    this.crew = C;
  }

  say(who, text) {
    // (con el nombre arriba, como el resto de la pelea)
    const d = super.say(who, text);
    const NAME = { sanmartin: 'San Martín', cabral: 'Sargento Cabral' };
    this.textEl.textContent = `${NAME[who] || who}: ${text}`;
    return d;
  }

  // El manotazo le pega al caballo: cae de costado con San Martín abajo.
  horseDown() {
    const g = this.g;
    if (this.sm.a.gs) this.sm.a.gs.sableK = 0;
    const h = this.h;
    h.speed = 1.2;
    h.caer(-1);
    this.mont?.caer({ lado: -1, atrapado: true, delay: 0.15 });
    g.audio?.neigh?.(h.pos, 0.85);
    g.fx.addShake?.(0.9);
    this.shake = 1;
    g.fx.dirt(h.pos, 40);
  }

  // Dónde está Cabral (los pies).
  cabAt(out) {
    return out.copy(this.cab.a.r.pos);
  }

  // Cabral: llega al galope de atrás, salta y corre a ponerse adelante de San Martín.
  cabIn() {
    const R = this.cab;
    const al = this.sl.al;
    // el caballo de Cabral viene por el carril, al galope
    R.h.pos.copy(this.P(-9, 1.6));
    R.h.yaw = this.east;
    R.h.speed = 9;
    this.cabRide = { t: 0 };
    al.monts = al.monts.filter((m) => m !== R.m);
    const r = R.a.r;
    r.poseFn = (P) => this.cabPoseFn(P);
    this.cabPose = 'salta';
    this.cabT = 0;
    this.cabFrom = null;
    this.guard = this.P(1.0, 0.25);
  }

  cabPoseFn(P) {
    const t = this.t;
    const k = this.cabT || 0;
    const mode = this.cabPose;
    if (mode === 'salta') {
      // del montado a parado
      const A = {};
      POSE.montado(A, t, 0);
      const B2 = {};
      POSE.firme(B2, t, true);
      POSE.guardia(B2, t);
      const e = ease(k / 0.5);
      for (const key of new Set([...Object.keys(A), ...Object.keys(B2)])) P[key] = (A[key] ?? 0) + ((B2[key] ?? 0) - (A[key] ?? 0)) * e;
      P.rootPitch = 0;
      P.rootRoll = 0;
      P.rootFwd = 0;
      P.hipY = 0.93;
      return;
    }
    if (mode === 'corre') {
      POSE.firme(P, t, false);
      POSE.guardia(P, t);
      P.torsoP = 0.25;
      return;
    }
    if (mode === 'pelea') {
      POSE.firme(P, t, true);
      POSE.guardia(P, t);
      // los sablazos: de arriba hacia abajo y adelante
      const s = this.slashK || 0;
      if (s > 0) {
        const a = Math.sin(Math.PI * s);
        P.shLp = -0.6 - 2.1 * Math.max(0, Math.sin(Math.PI * Math.min(1, s * 1.6))) + 1.2 * Math.max(0, s - 0.5);
        P.elL = -0.3 - 0.4 * a;
        P.torsoY = 0.3 * a;
        P.torsoP = 0.12 + 0.18 * Math.max(0, s - 0.4);
      }
      // los golpes que recibe: se dobla para atrás
      const h = this.hurtK || 0;
      if (h > 0) {
        P.torsoP -= 0.35 * h;
        P.headP -= 0.25 * h;
        P.shRp -= 0.4 * h;
        P.shRr += 0.3 * h;
      }
      P.hipLp = -0.25;
      P.knL = 0.35;
      P.hipRp = 0.2;
      P.knR = 0.15;
      return;
    }
    if (mode === 'rodillas') {
      // cae de rodillas, el sable apoyado
      const e = ease(k / 0.7);
      POSE.firme(P, t, true);
      POSE.guardia(P, t);
      P.hipY = 0.93 - 0.42 * e;
      P.hipLp = -0.15 * e;
      P.hipRp = -0.15 * e;
      P.knL = 1.55 * e;
      P.knR = 1.55 * e;
      P.torsoP = 0.25 * e;
      P.headP = 0.3 * e;
      P.shLp = -0.45 + 0.25 * e;
      P.elL = -0.6;
      P.shRp = -0.2 * e;
      P.elR = -0.5 * e;
      return;
    }
    if (mode === 'tendido') {
      // de espaldas en el piso, la cabeza hacia San Martín; al final se va
      POSE.tendido(P, t, {});
      P.rootPitch = -1.5;
      P.hipY = 0.93;
      const r = this.cab.a.r;
      P.rootY = r.pos.y + 0.14;
      P.headY = -0.5;
      P.headP = -0.3 + (this.cabDead ? 0.25 * ease((this.cabDT || 0) / 1.2) : 0.04 * Math.sin(t * 3));
      P.shLp = -0.2;
      P.shLr = -0.6;
      P.elL = -0.25;
      // (la mano hacia San Martín; al morir cae)
      P.shRp = -0.45 + (this.cabDead ? 0.4 * ease((this.cabDT || 0) / 1.2) : 0);
      P.shRr = 0.45;
      P.elR = -0.65;
    }
  }

  // Un sablazo de Cabral: el primero frena, el segundo voltea a uno.
  slash(i) {
    this.slashT = 0;
    this.g.audio?.whoosh?.(this.cab.a.r.pos);
    if (i === 1) {
      const z = this.horde.alive[0];
      if (z) this.horde.kill(z, this.dir, 'back', 1.2);
    }
  }

  hurt() {
    this.hurtT = 0;
    const g = this.g;
    const p = this.cab.a.r.pos;
    g.fx.sparks(tmpV.copy(p).setY(p.y + 1.3), 0.4, { x: -this.dir.x, y: 0.4, z: -this.dir.z }, [0.8, 0.5, 1]);
    g.audio?.hurt?.(p);
  }

  // Un granadero pasa al galope entre ellos y barre a los dos que quedan.
  riderBy() {
    const R = this.rider;
    if (!R) {
      for (const z of this.horde.alive) this.horde.kill(z, this.side, 'fly', 2.5);
      return;
    }
    this.byT = 0;
    R.m.brazos = 'carga';
  }

  // San Martín se zafa (corte): de rodillas al lado de Cabral, ya tendido.
  smFree() {
    const sm = this.sm;
    const al = this.sl.al;
    // Cabral, tendido donde cayó de rodillas
    const c = this.cab.a.r;
    // San Martín: fuera de la montura, al lado de Cabral
    al.monts = al.monts.filter((m) => m !== this.mont);
    sm.mode = 'escena';
    const r = sm.r;
    r.pos.copy(c.pos).addScaledVector(this.side, -0.85).addScaledVector(this.dir, 0.3);
    toLocal(r.pos.x, r.pos.z, L);
    r.pos.y = hLoc(L.u, L.v);
    r.yaw = yawTo(r.pos, c.pos);
    r.moving = false;
    r.speed = 0;
    this.smPose = 'rodilla';
    this.smT = 0;
    r.poseFn = (P) => this.smPoseFn(P);
    // (los realistas que quedaban, caídos)
    for (const z of this.horde.alive) this.horde.kill(z, this.side, 'back', 0.5);
  }

  smPoseFn(P) {
    const t = this.t;
    const k = this.smT || 0;
    if (this.smPose === 'rodilla') {
      // una rodilla en el piso, la mano en el pecho de Cabral
      POSE.firme(P, t, true);
      P.hipY = 0.6;
      P.hipLp = -1.35;
      P.knL = 1.45;
      P.hipRp = 0.1;
      P.knR = 1.9;
      P.torsoP = 0.42;
      P.headP = 0.35;
      P.shRp = -0.9;
      P.shRr = 0.1;
      P.elR = -0.5;
      P.shLp = -0.35;
      P.elL = -0.5;
      return;
    }
    // se levanta y alza el sable
    const e = ease(k / 0.9);
    const A = {};
    POSE.firme(A, t, true);
    A.hipY = 0.6;
    A.hipLp = -1.35;
    A.knL = 1.45;
    A.hipRp = 0.1;
    A.knR = 1.9;
    A.torsoP = 0.42;
    A.headP = 0.35;
    const B2 = {};
    POSE.firme(B2, t, true);
    for (const key of new Set([...Object.keys(A), ...Object.keys(B2)])) P[key] = (A[key] ?? 0) + ((B2[key] ?? 0) - (A[key] ?? 0)) * e;
    const up = ease((k - 0.5) / 0.7);
    P.shLp += (-2.95 - P.shLp) * up;
    P.shLr += (-0.12 - P.shLr) * up;
    P.elL += (-0.1 - P.elL) * up;
    P.headP += (-0.35 - P.headP) * up;
    P.torsoP -= 0.08 * up;
  }

  // Cada cuadro (después de que el juego movió todo).
  tick(dt) {
    const g = this.g;
    const sl = this.sl;
    const al = sl.al;
    // el galope de San Martín hasta el golpe
    if (this.h.state === 'vivo' && !this.mont?.fall) {
      this.ride.t += dt;
      const d = Math.min(1.15, this.ride.t);
      this.h.pos.copy(this.P(-10.5 + d * 9.4, 0));
      this.h.groundY = this.h.pos.y;
      this.h.yaw = this.east;
      this.h.speed = 9;
    } else this.h.speed = 0;
    // San Martín atrapado: forcejea
    if (this.struggle && this.sm.mode !== 'escena' && this.mont?.fall?.t > 1.2) {
      const r = this.sm.r;
      const base = this.mont;
      if (!this.wrapped) {
        this.wrapped = true;
        // (el brazo del sable queda en el piso; el otro empuja al caballo, la cabeza se levanta)
        r.poseFn = (P) => {
          base.pose(P);
          const s = Math.sin(this.t * 4.2);
          P.shRp -= 0.45 + 0.3 * Math.sin(this.t * 3.1 + 1);
          P.elR -= 0.25 * Math.max(0, s);
          P.headP -= 0.25 + 0.1 * Math.sin(this.t * 2.3);
          P.torsoP -= 0.1 + 0.06 * s;
        };
      }
    }
    // Cabral
    this.cabT = (this.cabT || 0) + dt;
    if (this.cabDead) this.cabDT = (this.cabDT || 0) + dt;
    this.slashT = (this.slashT ?? 9) + dt;
    this.slashK = this.slashT < 0.55 ? this.slashT / 0.55 : 0;
    this.hurtT = (this.hurtT ?? 9) + dt;
    this.hurtK = this.hurtT < 0.5 ? Math.sin(Math.PI * (this.hurtT / 0.5)) : 0;
    if (this.cabRide) this.cabUpdate(dt);
    this.smT = (this.smT || 0) + dt;
    // el granadero que pasa barriendo
    if (this.byT != null && this.rider) {
      this.byT += dt;
      const R = this.rider;
      const s = -14 + this.byT * 12;
      R.h.pos.copy(this.P(3.2, -s));
      R.h.yaw = yawOf(0, -1);
      R.h.speed = 12;
      R.h.visible = s < 22;
      R.a.r.dead = s >= 22;
      if (!this.swept && s > -1) {
        this.swept = true;
        for (const z of this.horde.alive) this.horde.kill(z, tmpV.copy(this.side).negate(), 'fly', 2.8);
        g.audio?.neigh?.(R.h.pos, 1.1);
      }
    }
    this.horde.update(dt, this.t);
    this.crew?.tick(dt);
    // el Gil, con la vincha
    if (this.crew) for (const r of this.crew.list) if (r.role === 'gil') gilVincha(r.a);
  }

  cabUpdate(dt) {
    const R = this.cab;
    const r = R.a.r;
    const C = this.cabRide;
    C.t += dt;
    // el caballo sigue de largo y se va
    R.h.pos.addScaledVector(this.dir, 9 * dt);
    toLocal(R.h.pos.x, R.h.pos.z, L);
    R.h.pos.y = hLoc(L.u, L.v);
    R.h.groundY = R.h.pos.y;
    R.h.speed = 9;
    if (C.t > 2.4) R.h.visible = false;
    if (this.cabPose === 'salta') {
      // del asiento al piso, al costado del caballo
      if (!this.cabFrom) {
        const seat = R.m.seat({});
        this.cabFrom = new THREE.Vector3(seat.x, seat.y, seat.z);
        this.cabLand = this.P(-5.2, 1.1);
      }
      const k = ease(this.cabT / 0.5);
      r.pos.lerpVectors(this.cabFrom, this.cabLand, k);
      r.pos.y += Math.sin(Math.PI * k) * 0.3;
      r.yaw = puppetYaw(this.east);
      if (this.cabT > 0.5) {
        this.cabPose = 'corre';
        this.cabT = 0;
      }
    } else if (this.cabPose === 'corre') {
      const to = this.guard;
      const dx = to.x - r.pos.x;
      const dz = to.z - r.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        r.moving = false;
        r.speed = 0;
        r.yaw = puppetYaw(this.east);
        this.cabPose = 'pelea';
        this.cabT = 0;
      } else {
        const s = Math.min(d, 4.6 * dt);
        r.pos.x += (dx / d) * s;
        r.pos.z += (dz / d) * s;
        toLocal(r.pos.x, r.pos.z, L);
        r.pos.y = hLoc(L.u, L.v);
        r.moving = true;
        r.speed = 4.6;
        r.yaw = Math.atan2(-dx, -dz);
      }
    } else {
      r.moving = false;
      r.speed = 0;
    }
    // (los realistas le pegan a Cabral, no a San Martín, cuando él está adelante)
    if (this.cabPose === 'pelea' || this.cabPose === 'rodillas') {
      for (const z of this.horde.alive) {
        if (z.state === 'attack' || z.state === 'run') {
          const p = this.cabAt(tmpV).addScaledVector(this.dir, 0.95);
          z.to.set(p.x, 0, p.z);
        }
      }
    }
  }

  cleanup() {
    const g = this.g;
    const sl = this.sl;
    const al = sl.al;
    const sm = this.sm;
    g.hud.show(true);
    g.weapons.vmRoot.visible = true;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    for (const o of this.zHide || []) o.visible = true;
    this.horde?.clear();
    this.horde?.root.removeFromParent();
    this.crew?.dispose();
    // Cabral queda tendido en el campo (y su caballo, ido)
    if (this.cab) {
      this.cab.h.visible = false;
      this.cabPose = 'tendido';
      this.cabDead = 1;
      this.cabDT = 9;
      const r = this.cab.a.r;
      r.poseFn = (P) => this.cabPoseFn(P);
    }
    if (this.rider) {
      const R = this.rider;
      R.scene = false;
      R.h.visible = true;
      R.a.r.dead = false;
      // (vuelve a su escuadrón: a su lugar, o a la columna si está cargando)
      const Q = al.sq[0];
      R.from = { pos: R.h.pos.clone(), yaw: R.h.yaw };
      R.k = 0;
      if (Q.state === 'formed' && R.slot) al.placeHorse(R.h, R.slot.u, R.slot.v, yawOf(1, 0));
    }
    // San Martín, en el caballo de repuesto (su zaino queda tendido)
    if (sm) {
      sm.scene = false;
      if (sm.a.gs) sm.a.gs.sableK = 0.9;
      this.h.speed = 0;
      const sp = sm.spare;
      sp.visible = true;
      sp.state = 'vivo';
      sp.pos.copy(sm.r.pos).addScaledVector(this.side, 1.4);
      toLocal(sp.pos.x, sp.pos.z, L);
      sp.pos.y = hLoc(L.u, L.v);
      sp.groundY = sp.pos.y;
      sp.yaw = this.east;
      sm.mode = 'pie';
      al.smMount(sp);
      sm.t = 0.95;
    }
  }
}
