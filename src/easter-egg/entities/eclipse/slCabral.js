import * as THREE from 'three';
import CastleCine, { smooth, lerp } from '../../ui/castleCine';
import CineActors, { yawTo } from '../../ui/cineActors';
import CineHorde from '../../ui/cineHorde';
import { POSE } from './montar';
import { gilVincha } from '../../net/gilLook';
import { toWorld, toLocal, hLoc, dirWorld, yawOf } from '../../world/eclipse/sanlorenzoCampo';
import { actPerson, tickPerson } from './personClip';
import { cineClip, gauchoClip } from '../../net/gauchoSkin';
import { assetUrl } from '../../../lib/assets';
import { eclSfx } from '../../fx/eclipseSfx';

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

// (2026-10-08, ITERACION-8, el usuario: "cuando va caminando a ayudar a San
// Martín va robotizado, ataca robotizado, muere robotizado; en mi partida ni
// llegó a matar a los zombies de encima". Cabral se movía con poses de piezas
// armadas a mano. Ahora, con clips de verdad (los del gaucho, que tiene el
// mismo esqueleto: entities/eclipse/personClip): corre, se planta en guardia,
// tres sablazos —uno por realista: los mata a los tres—, el golpe que recibe,
// se tambalea, cae de rodillas mientras llegan dos más —que barre el
// granadero que pasa— y muere tendido. Los clips, juntos en
// /assets/sotano/modelos/granadero/cine-cabral.json (314 KB; se piden al
// empezar la pelea: SanLorenzo.start). globalThis.__mduOldCabral8: como antes)
let CAB = null;
let cabAsked = false;
export function loadCabralClips() {
  if (cabAsked) return;
  cabAsked = true;
  fetch(assetUrl('/assets/sotano/modelos/granadero/cine-cabral.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip({ ...c, fps: c.fps || J.fps });
      CAB = C;
    })
    .catch(() => (cabAsked = false));
}
const cabClip = (n) => CAB?.[n] || gauchoClip(n);
// (a qué velocidad corre con el clip: la del clip es la del gaucho; las piernas del granadero, 0,86)
const RUN_V = 4.4;
// (gira de a poco hacia un ángulo: a, el de ahora; b, el que busca; k, cuánto)
const angTo = (a, b, k) => a + ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * k;

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
    // (2026-10-08, el usuario: "falla en sacar todos los zombies de la escena:
    // los que aparecieron antes de la cinemática quedan congelados en su
    // lugar", y al volver el control quedaban encima del jugador. Los muertos
    // del campo se van —el anfitrión los saca, sin puntos— y los jinetes del
    // caos no se ven mientras dura. __mduOldCabral3: como antes)
    this.v3 = globalThis.__mduOldCabral3 !== true;
    // (v8: Cabral con clips; hacen falta los suyos y los del gaucho —correr, tendido—)
    loadCabralClips();
    this.v8 = this.v3 && globalThis.__mduOldCabral8 !== true && !!CAB && !!gauchoClip('sprint') && !!gauchoClip('lay');
    // (2026-10-08, el usuario: "la escena de Cabral no tiene ningún tipo de
    // música": la del peligro desde la carga, el violín en la muerte y se va
    // con el grito de San Martín —la marcha entra con la carga—. core/music.js
    // cabral-peligro / cabral-violin. __mduOldCabralMus: en silencio, como antes)
    this.mus8 = globalThis.__mduOldCabralMus !== true;
    if (this.v3) {
      // (el resplandor de la pantalla agarraba lo blanco de los uniformes —el
      // pecho de Cabral, las piernas de San Martín— en las tomas de cerca y lo
      // volvía una mancha que brillaba: más bajo mientras dura; ×0,33 en la
      // muerte de Cabral. Vuelve en el paso 6)
      if (g.post?.bloom && this.bloom0 == null) {
        this.bloom0 = g.post.bloom.strength;
        g.post.bloom.strength = this.bloom0 * 0.6;
      }
      if (sl.host) for (const z of Z.pool) if (z.active) Z.free(z);
      const J = sl.jinetes?.root;
      if (J?.visible) {
        J.visible = false;
        this.jHide = J;
      }
    }
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
    // (sesión 1f, el usuario: "los granaderos congelados en la cinemática": los
    // dos que se lleva la escena quedaban quietos donde estaban —a veces en
    // medio de la carga— hasta su momento. Escondidos hasta entonces;
    // __mduOldCabralFreeze: como antes)
    if (globalThis.__mduOldCabralFreeze !== true) {
      for (const R of [this.cab, this.rider]) {
        if (!R) continue;
        R.h.visible = false;
        R.h.speed = 0;
        R.a.r.dead = true;
      }
    }
    // (2026-10-07, el usuario: "la cinemática no se entiende nada porque no se
    // llega a ver de la oscuridad del piso": del 50 al 80% de cada cuadro era
    // piso negro. La totalidad queda en el cielo; el campo, con luz de escena
    // desde el principio —SanLorenzo.look, liftK— y más exposición.
    // __mduOldCabralDark: como antes)
    if (globalThis.__mduOldCabralDark !== true) {
      sl.darkTo = 0;
      if (this.expo0 == null) this.expo0 = g.renderer.toneMappingExposure;
      g.renderer.toneMappingExposure = this.expo0 * 1.45;
    }
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
          if (this.mus8) g.music?.play('cabral-peligro', { fadeIn: 0.5 });
          if (this.v3) return this.chargeIn();
          this.slamAt = this.P(2.2, 0.6);
          B.slam(this.slamAt.x, this.slamAt.z, 1.15);
          B.C.u = B.C.uTo;
          B.C.v = B.C.vTo;
          // (sanlorenzo2: El Eclipse ahora mide 78 m: la toma lo mira desde abajo,
          // con la mano que baja sobre el caballo; __mduOldCabralCam: la de antes)
          if (globalThis.__mduOldCabralCam === true) {
            this.shot(2.7, (u, lt, pos, look) => {
              pos.copy(this.P(-13 + u * 2.5, -8.5, 1.7));
              look.copy(this.P(5, 0.5, 5 + u * 1.5));
            });
            this.setFov(70);
          } else {
            this.shot(2.7, (u, lt, pos, look) => {
              pos.copy(this.P(-15 + u * 3, -9.5, 1.25));
              // (empieza en la cabeza del coloso y baja con la mano hasta el caballo)
              const k = u * u * (3 - 2 * u);
              look.copy(this.P(22 - k * 12, 1.0, 44 - k * 41));
            });
            this.setFov(80);
          }
          this.later(1.15, () => this.horseDown());
          return 2.7;
        },
      ],
      // 2. San Martín atrapado; se le vienen tres
      [
        0,
        () => {
          if (this.v3) {
            // (2026-10-08: "la cámara está lejísimo cuando cae": de cerca, del
            // lado del convento, con los realistas que vienen atrás de él)
            const sm0 = this.sm.r.pos.clone();
            this.shot(2.5, (u, lt, pos, look) => {
              pos.copy(sm0).addScaledVector(this.dir, -2.3 - u * 0.3).addScaledVector(this.side, -1.1);
              pos.y += 1.0;
              look.copy(sm0).addScaledVector(this.dir, 4);
              look.y += 0.6;
            });
            this.setFov(58);
          } else {
            this.shot(2.5, (u, lt, pos, look) => {
              pos.copy(this.P(-2.6 - u * 0.4, -3.0, 0.95));
              look.copy(this.P(0.6, 0.2, 0.45));
            });
            this.setFov(55);
          }
          for (const s of [-1.6, 0, 1.6]) {
            const p = this.P(11 + Math.abs(s) * 0.8, s);
            const z = this.horde.spawn(p.x, p.z, yawOf(-1, 0), { state: 'lurk', speedType: 'run' });
            if (z) {
              // (v8: Cabral se planta adelante del caballo caído —antes quedaba
              // parado encima— y ellos enfrente, en fila; vienen más despacio:
              // llegan cuando llega él)
              const to = this.v8 ? this.P(2.7, -0.55 + s * 0.45) : this.P(1.4, s * 0.45);
              this.horde.run(z, to.x, to.z, this.v8 ? 2.05 : 3.3);
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
          if (this.v3) {
            // (de costado y cerca: llega al galope, salta y se planta adelante;
            // antes, desde 12 m atrás de los cuatro)
            this.shot(3.0, (u, lt, pos, look) => {
              const c = this.cabAt(tmpV);
              pos.copy(this.P(-2.2 + u * 0.8, -3.4, 1.35));
              look.copy(c);
              look.y += 1.1;
            });
            this.setFov(50);
            this.later(1.0, () => this.say('cabral', '¡Mi general!'));
          } else {
            const c = this.P(-8.6, -1.0);
            this.shot(2.6, (u, lt, pos, look) => {
              pos.copy(c).addScaledVector(dir, -3.6 + u * 0.4).addScaledVector(side, -0.4);
              pos.y += 1.95;
              look.copy(this.P(0.8, 0.4, 0.9));
            });
            this.setFov(64);
          }
          crew?.each({ valiente: ['fists', { loop: true }], miedoso: ['santiguar', { loop: true }], canchero: ['crossArms', { loop: true }], viejo: ['winded', { loop: true }] }, 0.2);
          if (crew?.by.valiente) {
            const r = crew.by.valiente;
            crew.later(0.3, () => crew.walkTo(r, r.pos.clone().addScaledVector(dir, 2.6).addScaledVector(side, 0.4), 1.3, 'fists', { loop: true }));
          }
          return this.v3 ? 3.0 : 2.6;
        },
      ],
      // 4. la pelea: los frena a sablazos, cae uno; los otros dos le pegan; cae de rodillas
      [
        0,
        () => {
          if (this.v8) return this.fight8(crew);
          this.shot(3.2, (u, lt, pos, look) => {
            if (this.v3) {
              pos.copy(this.P(1.6 + u * 0.3, -4.4, 1.35));
              look.copy(this.P(2.2, 0.2, 1.0));
            } else {
              pos.copy(this.P(5.2 - u * 0.6, -3.6, 1.25));
              look.copy(this.cabAt(tmpV).setY(this.cabAt(tmpV).y + 1.0));
            }
          });
          this.setFov(this.v3 ? 54 : 52);
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
          // (sesión 1f, el usuario: "la muerte de Cabral es espantosa y se supone
          // que es lo más épico": de cerca, sin el pasto delante de la lente, la
          // oscuridad del eclipse que se abre, la mano que cae y el sol que asoma
          // detrás —Febo asoma—. globalThis.__mduOldCabral2: como antes)
          if (globalThis.__mduOldCabral2 !== true) return this.cabralDeath();
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
          for (const o of this.grassOff || []) o.visible = true;
          this.grassOff = null;
          this.grassBack();
          if (this.expo0 != null) {
            g.renderer.toneMappingExposure = this.expo0;
            this.expo0 = null;
          }
          if (this.bloom0 != null) {
            if (g.post?.bloom) g.post.bloom.strength = this.bloom0;
            this.bloom0 = null;
          }
          // (sesión 1f, el usuario: "los granaderos congelados en la cinemática":
          // la carga sale con el grito y una toma la sigue saliendo de la huerta;
          // __mduOldCabralCharge: como antes, la carga a los 1,6 s y sin toma)
          if (globalThis.__mduOldCabralCharge !== true) return this.chargeShot(crew);
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
          this.later(0.55, () => {
            this.say('sanmartin', '¡Granaderos! ¡A la carga!');
            this.marcha();
          });
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

  // (v8) El paso 4, con Cabral de clips: las tomas. Lo que pasa en la pelea
  // lo lleva fightSeq, que arranca cuando Cabral llega (cabUpdate), unos 0,9 s
  // antes de este paso. 5,4 s.
  fight8(crew) {
    // (2026-10-08: las de antes miraban a Cabral a través del realista del lado
    // de la cámara, y cuando caía de rodillas lo tapaba el caballo)
    // A. de costado, a la altura de la pelea: San Martín tirado a la izquierda,
    // Cabral en guardia, los realistas a la derecha. El segundo sablazo, el
    // golpe que recibe y el tercero
    this.shot(1.95, (u, lt, pos, look) => {
      pos.copy(this.P(2.4 + u * 0.25, -4.3, 1.3));
      look.copy(this.P(2.45, -0.45, 1.05));
    });
    this.setFov(50);
    // B. de atrás y al costado: herido, se tambalea; enfrente vienen dos más
    this.later(1.95, () => {
      this.shot(1.4, (u, lt, pos, look) => {
        pos.copy(this.P(0.9 - u * 0.2, -3.0, 1.15));
        look.copy(this.P(4.5, 0.0, 1.1));
      });
      this.setFov(52);
    });
    // C. de atrás de San Martín, más alto que el caballo caído: cae de
    // rodillas; el granadero pasa y barre
    this.later(3.35, () => {
      this.shot(2.1, (u, lt, pos, look) => {
        pos.copy(this.P(-1.6 - u * 0.3, -3.3, 1.75));
        look.copy(this.P(2.5, -0.4, 0.8));
      });
      this.setFov(46);
    });
    crew?.each({ miedoso: ['pray', { loop: true }], canchero: ['chestHand', { loop: true }], viejo: ['kneelDown', {}] }, 2.2);
    crew?.later(4.4, () => crew.by.viejo && crew.act(crew.by.viejo, 'kneelHold', { loop: true }));
    return 5.4;
  }

  // (v8) La pelea, desde que Cabral se planta adelante de San Martín (t en s):
  // un sablazo por realista, el golpe, el tercero, se tambalea, cae de
  // rodillas; dos más que llegan y el granadero que los barre.
  fightSeq() {
    const a = this.cab.a;
    const act = (n, o) => {
      const c = cabClip(n);
      if (c) actPerson(a, c, o);
    };
    const guard = () => act('luGilGuard', { loop: true, fade: 0.22 });
    // (a quién va cada sablazo: el del medio, el del lado de la cámara de
    // costado —que si no quedaba tapándolo— y el de atrás)
    const F = this.F;
    const sideOf = (z) => (z.pos.x - F.x) * this.side.x + (z.pos.z - F.z) * this.side.z;
    const pick = (k) => {
      const L = this.horde.alive.filter((z) => !z.late).sort((p, q) => sideOf(p) - sideOf(q));
      if (!L.length) return null;
      return k === 0 ? L[L.length >> 1] : k === 1 ? L[0] : L[L.length - 1];
    };
    // los tres, a pegarle a él
    const c0 = this.cabAt(new THREE.Vector3());
    for (const z of this.horde.alive) {
      if (z.late) continue;
      this.horde.set(z, 'attack');
      z.attackT = Math.random() * 0.5;
      z.face = Math.atan2(c0.x - z.pos.x, c0.z - z.pos.z);
    }
    let tgt = null;
    const aim = (k) => {
      tgt = pick(k);
      if (!tgt) return;
      const p = this.cabAt(tmpV);
      this.cabFace = Math.atan2(-(tgt.pos.x - p.x), -(tgt.pos.z - p.z));
    };
    // el realista más cerca de Cabral, vivo
    const near = () => {
      const p = this.cabAt(tmpV);
      let best = null;
      let bd = 1e9;
      for (const z of this.horde.alive) {
        const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z);
        if (d < bd) {
          bd = d;
          best = z;
        }
      }
      return best;
    };
    const cut = (dir) => {
      const z = tgt && !tgt.dead ? tgt : near();
      if (!z) return;
      // (cae para atrás, del lado que vino el sablazo: de Cabral hacia él)
      const p = this.cabAt(new THREE.Vector3());
      dir = new THREE.Vector3(z.pos.x - p.x, 0, z.pos.z - p.z);
      if (dir.lengthSq() < 1e-4) dir.copy(this.dir);
      dir.normalize();
      const g = this.g;
      g.fx.sparks?.(tmpV.copy(z.pos).setY(z.pos.y + 1.2), 0.5, { x: this.dir.x, y: 0.5, z: this.dir.z }, [1, 0.9, 0.7]);
      this.horde.kill(z, dir, 'back', 1.4);
      g.audio?.knife?.(true);
    };
    const slash = (clip) => {
      act(clip, { fade: 0.08 });
      this.g.audio?.whoosh?.(a.r.pos);
    };
    this.fseq = [
      [0.0, guard],
      [0.05, () => aim(0)],
      [0.25, () => slash('luSlashFore')],
      [0.45, () => cut(this.dir)],
      [0.78, guard],
      [0.8, () => aim(1)],
      [0.95, () => slash('luSlashBack')],
      [1.15, () => cut(tmpV.copy(this.dir).addScaledVector(this.side, -0.6).normalize().clone())],
      [1.55, () => {
        this.hurt();
        act('hitDouble', { fade: 0.08 });
      }],
      [1.85, () => this.hurt()],
      // (dos más, de lejos: llegan cuando ya está de rodillas)
      [2.0, () => {
        for (const s of [-1.3, 1.2]) {
          const p = this.P(13.5, s);
          const z = this.horde.spawn(p.x, p.z, yawOf(-1, 0), { state: 'lurk', speedType: 'run' });
          if (z) {
            const to = this.P(3.4, -0.55 + s * 0.45);
            this.horde.run(z, to.x, to.z, 3.5);
            z.late = true;
          }
        }
      }],
      [2.1, () => aim(2)],
      [2.3, () => slash('luSlashOver')],
      [2.5, () => cut(tmpV.copy(this.dir).addScaledVector(this.side, 0.6).normalize().clone())],
      [2.9, () => {
        act('stagger', { fade: 0.2 });
        this.cabFace = puppetYaw(this.east);
      }],
      [4.0, () => this.riderBy()],
      [4.2, () => act('kneelDown', { fade: 0.3 })],
      [5.25, () => act('kneelHold', { loop: true, fade: 0.2 })],
    ];
  }

  // (2026-10-08) La toma 1 nueva, 6,4 s. El usuario: "a San Martín lo derriban
  // de la nada y no sé por qué". Ahora se ve y se dice: San Martín al galope
  // adelante de la carga, de costado y de cerca; El Eclipse lo mira y lo dice
  // —sin San Martín no hay patria, y sin patria no hay mate: por eso va por
  // él—; se le prenden los ojos y marca el pasto adelante del caballo; San
  // Martín lo ve venir; el rayo de los ojos (el de la pelea, el que los
  // jugadores ya conocen) baja del cielo, corre por el pasto y le pega al
  // caballo: de costado, el rayo y el caballo en el mismo cuadro.
  // (Antes, el manotazo: medido, en el golpe la mano del gigante quedaba 15 m
  // arriba y 17 m al costado del caballo —el gigante no sale del río y el
  // manotazo de la animación no baja tanto—: el caballo caía solo.)
  chargeIn() {
    const g = this.g;
    const B = this.sl.boss;
    const IMPACT = 4.3;
    // el galope: del carril, 4,2 s hasta el lugar del golpe
    this.ride = { t: 0, from: -37.5, v: 37.5 / IMPACT, dur: IMPACT };
    if (this.mont) this.mont.brazos = 'carga';
    if (this.sm.a.gs) this.sm.a.gs.sableK = 0.9;
    const H = this.h;
    // a. de costado, a su altura: el general adelante de la carga
    this.shot(1.9, (u, lt, pos, look) => {
      pos.copy(H.pos).addScaledVector(this.side, -4.4).addScaledVector(this.dir, 1.4 - u * 0.6);
      pos.y += 1.45;
      look.copy(H.pos).addScaledVector(this.dir, 2.5);
      look.y += 1.75;
    });
    this.setFov(54);
    // b. de atrás y abajo, hacia El Eclipse: lo mira, se le prenden los ojos y
    // marca el pasto (la línea roja) adelante del caballo
    this.later(1.9, () => {
      // (el gigante, donde quedaba para el manotazo: la toma lo encuadra ahí)
      const sp = this.P(0.6, 0.3);
      toLocal(sp.x, sp.z, L);
      const HS = B.slamHand || new THREE.Vector3(0.1, 0.05, 0.38);
      // (78: la escala del gigante, slEclipse SCALE)
      B.C.u = B.C.uTo = Math.max(56, L.u + HS.z * 78);
      B.C.v = B.C.vTo = L.v + HS.x * 78;
      // el rayo: arranca a 10 m adelante y llega al caballo justo en el golpe
      const a = this.P(10, 0.3);
      const b = this.P(0.2, 0);
      B.eyeBeam(a.x, a.z, b.x, b.z, IMPACT - 0.55 - 1.9, 0.55);
      this.shot(1.4, (u, lt, pos, look) => {
        pos.copy(H.pos).addScaledVector(this.dir, -3.4).addScaledVector(this.side, 1.6);
        pos.y += 1.1;
        look.copy(this.P(22 - u * 4, 1.0, 34 - u * 6));
      });
      this.setFov(72);
      this.say('eclipse', 'Sin San Martín no hay patria. Y sin patria... no hay mate.');
    });
    // c. San Martín la ve venir: la cara, de cerca, mirando para arriba
    this.later(3.0, () => {
      this.shot(0.75, (u, lt, pos, look) => {
        const hd = this.smHead(tmpV);
        pos.copy(hd).addScaledVector(this.dir, 1.6).addScaledVector(this.side, -0.9);
        pos.y -= 0.25;
        look.copy(hd);
        look.y += 0.35;
      });
      this.setFov(44);
    });
    // d. de costado, a 12 m: el rayo baja adelante, corre por el pasto y le
    // pega al caballo que viene; después, el caballo en el piso
    this.later(3.75, () => {
      const at = this.P(4, 0);
      const hit = this.P(0, 0);
      // (6 m más atrás: a 1,5 m quedaba pegada a la bandera realista de la
      // barranca, que tapaba la caída)
      const c0 = at.clone().addScaledVector(this.side, -12).addScaledVector(this.dir, -6);
      c0.y += 2.2;
      this.shot(2.65, (u, lt, pos, look) => {
        pos.copy(c0).addScaledVector(this.side, 2.5 * smooth(u));
        const k = smooth(clamp01((lt - 0.2) / 0.6));
        look.lerpVectors(at, hit, k);
        look.y += 3.2 - 2.0 * k;
      });
      this.setFov(48);
    });
    this.later(IMPACT, () => {
      this.horseDown();
      const hp = this.h.pos;
      g.fx.explosion(tmpV.copy(hp).setY(hp.y + 0.6), 3.5, [0.55, 0.2, 1]);
      g.audio?.explosion?.(hp, 0.7);
    });
    return 6.4;
  }

  // La cabeza de San Martín (en el mundo), o arriba del caballo si todavía no hay huesos.
  smHead(out) {
    const hb = this.sm.a.gs?.bones?.Head;
    if (hb) return hb.getWorldPosition(out);
    return out.copy(this.h.pos).setY(this.h.pos.y + 2.6);
  }

  // (2026-10-09, el usuario: "cuando San Martín diga 'Granaderos', ahí
  // arranque a sonar la marcha de San Lorenzo": con el grito, no cuando
  // termina la escena. La pelea después la deja seguir —SanLorenzo fase 4—.
  // globalThis.__mduOldCabralMarcha: entra al terminar la escena, como antes)
  marcha() {
    if (globalThis.__mduOldCabralMarcha === true) return;
    const sl = this.sl;
    this.g.music?.play('marcha-san-lorenzo', { loop: true, while: (G) => sl.active && [3, 4, 5].includes(sl.st.phase) && (G.state === 'playing' || G.state === 'paused') });
  }

  // (sesión 1f) Paso 6: San Martín se levanta y alza el sable; con el grito sale la
  // carga y la cámara va adelante de la columna que sale de la huerta.
  chargeShot(crew) {
    const g = this.g;
    const dir = this.dir;
    const side = this.side;
    this.smPose = 'arriba';
    this.smT = 0;
    if (this.sm.a.gs) this.sm.a.gs.sableK = 0.9;
    this.sm.r.yaw = puppetYaw(this.east);
    const s0 = this.sm.r.pos;
    if (this.v3) {
      // (2026-10-08: no se lo veía pararse —quedaba acostado, ver smPoseFn—:
      // de frente y de abajo, que se pare y alce el sable contra el cielo)
      // (a 1 m del piso: más abajo, un pastito del campo tapaba media toma)
      const c0 = s0.clone().addScaledVector(dir, 2.8).addScaledVector(side, -0.9);
      c0.y += 1.0;
      this.shot(2.6, (u, lt, pos, look) => {
        pos.copy(c0).addScaledVector(dir, 0.3 * smooth(u));
        look.copy(s0);
        look.y += 1.5 + 0.4 * smooth(u);
      });
      this.setFov(52);
    } else {
      this.shot(2.6, (u, lt, pos, look) => {
        pos.copy(s0).addScaledVector(dir, 3.2 + u * 0.4).addScaledVector(side, -1.3 - u * 0.3);
        pos.y += 0.7 + u * 0.4;
        look.copy(s0).addScaledVector(dir, -u * 4);
        look.y += 1.7;
      });
      this.setFov(56);
    }
    this.later(0.4, () => {
      this.say('sanmartin', '¡Granaderos! ¡A la carga!');
      this.marcha();
    });
    // (el violín se va bajo el grito: la marcha entra limpia con la carga)
    if (this.mus8) this.later(0.3, () => g.music?.is('cabral-violin') && g.music.stop(2.6));
    this.later(0.8, () => {
      this.sl.al.clarin();
      for (const s2 of [1, -1]) this.sl.al.charge(s2, s2 * 6);
    });
    crew?.each({ valiente: ['fistUp', { loop: true }], miedoso: ['cool', { loop: true }], canchero: ['cool', { loop: true }] }, 0.9);
    // la columna del norte, de adelante y del lado de afuera (lejos del muro)
    this.later(2.6, () => {
      const Q = this.sl.al.sq[0];
      const P = Q.path;
      const R = Q.riders.find((q) => !q.scene) || Q.riders[0];
      if (!P || !R) return;
      // (quieta, 9 m adelante de la cabeza de la columna y 4,5 m al costado de
      // afuera —el lado más al oeste, lejos del muro—: la columna viene y pasa)
      const k = Math.min(1, (Q.s + 9) / P.len);
      const cp = P.curve.getPointAt(k, new THREE.Vector3());
      const tg = P.curve.getTangentAt(k, new THREE.Vector3()).setY(0).normalize();
      const rt = new THREE.Vector3(-tg.z, 0, tg.x);
      const A = cp.clone().addScaledVector(rt, 4.5);
      const B = cp.clone().addScaledVector(rt, -4.5);
      const cam = toLocal(A.x, A.z, {}).u < toLocal(B.x, B.z, {}).u ? A : B;
      toLocal(cam.x, cam.z, L);
      cam.y = hLoc(L.u, L.v) + 1.0;
      this.shot(3.0, (u, lt, pos, look) => {
        pos.copy(cam);
        look.copy(R.h.pos);
        look.y += 1.5;
      });
      this.setFov(48);
    });
    return 5.6;
  }

  // (sesión 1f) La muerte de Cabral, de cerca: 8,5 s. Cabral de espaldas: la
  // cabeza 1,3 m hacia el oeste (-dir) de su raíz, el pecho a ~0,95.
  cabralDeath() {
    const g = this.g;
    const sl = this.sl;
    if (this.mus8) g.music?.play('cabral-violin', { fadeIn: 2.2 });
    this.smFree();
    // (2026-10-08, el usuario: "San Martín invoca a los granaderos, que aparecen
    // detrás de la muralla y se quedan completamente trabados". Medido: la
    // columna del norte todavía volvía de la carga de San Martín y la orden
    // de cargar se perdía —solo carga el escuadrón formado—: quedaba al
    // trote en el lugar detrás del muro. Acá, en las tomas de cerca, los dos
    // escuadrones forman en la huerta; con el grito salen los dos.)
    if (this.v3) sl.al.formAll(true);
    this.cabPose = 'tendido';
    this.cabT = 0;
    const dir = this.dir;
    const side = this.side;
    // (tendido 1,3 m al costado: donde cayó de rodillas quedaba con las piernas
    // adentro del caballo caído; con el corte no se ve el cambio)
    const cr = this.cab.a.r;
    // (v8: ahora pelea adelante del caballo; tendido donde quedaba antes, las
    // tomas de la muerte están medidas ahí)
    if (this.v8) cr.pos.copy(this.P(0.88, 0.27));
    cr.pos.addScaledVector(side, 1.3);
    // (el sable de Cabral, fuera: de espaldas lo tenía parado, para arriba)
    if (this.cab.a.gs?.sable) this.cab.a.gs.sable.visible = false;
    toLocal(cr.pos.x, cr.pos.z, L);
    cr.pos.y = hLoc(L.u, L.v);
    const c = cr.pos.clone();
    if (this.v8) {
      // (v8) tendido de espaldas, los pies al río: el clip pone la cabeza 0,47 m
      // atrás de su origen y las tomas la esperan a 1,31 m: el origen, 0,85 m atrás
      this.fseq = null;
      cr.pos.addScaledVector(dir, -0.85);
      cr.yaw = puppetYaw(this.east);
      cr.clipFwd = 0;
      actPerson(this.cab.a, cabClip('lay'), { loop: true, fade: 0 });
    }
    // el pasto del campo, fuera de las tomas de cerca (vuelve en la grúa)
    const C = sl.campo;
    // (2026-10-09, el usuario: "cuando está tirado, desaparece el pasto del
    // mapa". Ahora se saca solo el pasto de al lado de las cámaras de cerca —el
    // que tapaba la lente—, el resto del campo queda. Ver grassNear.
    // globalThis.__mduOldCabralGrass: todo el pasto afuera, como antes)
    const OLDG = globalThis.__mduOldCabralGrass === true;
    this.grassOff = OLDG ? [C?.grass, C?.cardos].filter((o) => o?.visible) : [];
    for (const o of this.grassOff) o.visible = false;
    // (los realistas caídos, fuera: quedaban tirados delante de la lente)
    if (this.horde?.root) this.horde.root.visible = false;
    // se abre la oscuridad de la totalidad; y más luz para estas tomas (vuelve en el paso 6)
    sl.darkTo = 0;
    const R = g.renderer;
    if (this.expo0 == null) this.expo0 = R.toneMappingExposure;
    // (×1,7 quemaba lo blanco del uniforme —el pecho de Cabral, las piernas de
    // San Martín— en una mancha que brillaba: ×1,35)
    R.toneMappingExposure = this.expo0 * (this.v3 ? 1.35 : 1.7);
    if (this.bloom0 != null && g.post?.bloom) g.post.bloom.strength = this.bloom0 * 0.33;
    const at = (fwd, sd, up = 0) => {
      const v = c.clone().addScaledVector(dir, fwd).addScaledVector(side, sd);
      toLocal(v.x, v.z, L);
      v.y = hLoc(L.u, L.v) + up;
      return v;
    };
    // San Martín, de rodilla a la altura del pecho, mirándolo (antes, al lado de las piernas)
    const smr = this.sm.r;
    smr.pos.copy(at(-0.92, -0.7));
    smr.yaw = yawTo(smr.pos, at(-0.92, 0));
    const head = at(-1.31, 0, 0.24);
    const smHead = at(-0.92, -0.45, 1.05);
    // a. los dos, bajo y en diagonal desde los pies; la cámara se acerca
    const a0 = at(0.4, 2.0, 0.75);
    const aL = at(-0.95, -0.3, 0.5);
    if (!OLDG) this.grassNear([C?.grass, C?.cardos], [a0, a0.clone().lerp(aL, 0.14), at(-1.05, 1.05, 0.62)], 1.7);
    this.shot(3.4, (u, lt, pos, look) => {
      pos.copy(a0).lerp(aL, 0.14 * smooth(u));
      look.copy(aL);
    });
    this.setFov(38);
    this.later(0.7, () => this.say('cabral', 'Muero contento. Hemos batido al enemigo.'));
    // b. la cara de Cabral de perfil, y atrás San Martín que lo mira
    this.later(3.4, () => {
      const b0 = at(-1.05, 1.05, 0.62);
      const bL = head.clone().lerp(smHead, 0.35);
      this.shot(2.8, (u, lt, pos, look) => {
        pos.copy(b0).lerp(bL, 0.1 * smooth(u));
        look.copy(bL);
      });
      this.setFov(32);
    });
    this.later(4.6, () => {
      this.cabDead = 1;
      // (v8) se va: la cabeza cae y el brazo se abre (el clip de muerto queda 0,23 m
      // corrido hacia los pies: el cuerpo se corre lo mismo para atrás, ver tick)
      if (this.v8) actPerson(this.cab.a, cabClip('deadBrave'), { loop: true, fade: 1.4 });
    });
    // c. la grúa: sube y mira al horizonte, donde asoma el sol
    this.later(6.2, () => {
      for (const o of this.grassOff || []) o.visible = true;
      this.grassOff = null;
      this.grassBack();
      // (de atrás de la cabeza de Cabral, hacia el este: los dos, el caballo y el horizonte)
      const c0 = at(-3.0, 0.6, 1.4);
      const c1 = at(-5.6, 1.4, 3.6);
      const l0 = at(0, -0.2, 0.5);
      const l1 = at(22, 0, 3.5);
      this.shot(2.3, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.lerpVectors(c0, c1, k);
        look.lerpVectors(l0, l1, k * 0.8);
      });
      this.setFov(46);
      g.fx?.flash?.(tmpV.copy(c).addScaledVector(dir, 30).setY(c.y + 25), 0xffd08a, 40, 1.6, 120);
    });
    return 8.5;
  }

  // El pasto a menos de r m de esos puntos (las cámaras de cerca), fuera un
  // rato: la instancia achicada a cero; grassBack la vuelve.
  grassNear(list, pts, r) {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.grassHole ||= [];
    for (const im of list) {
      if (!im?.isInstancedMesh) continue;
      im.updateWorldMatrix(true, false);
      const keep = [];
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        // (el pasto está en lo local del campo: al mundo)
        p.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);
        if (!pts.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < r)) continue;
        keep.push([i, m.clone()]);
        im.setMatrixAt(i, Z);
      }
      if (keep.length) {
        im.instanceMatrix.needsUpdate = true;
        this.grassHole.push([im, keep]);
      }
    }
  }

  grassBack() {
    for (const [im, keep] of this.grassHole || []) {
      for (const [i, m] of keep) im.setMatrixAt(i, m);
      im.instanceMatrix.needsUpdate = true;
    }
    this.grassHole = null;
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
    // (con el nombre arriba, como el resto de la pelea; El Eclipse habla con la voz de la Entidad)
    const d = super.say(who === 'eclipse' ? 'entidad' : who, text);
    const NAME = { sanmartin: 'San Martín', cabral: 'Sargento Cabral', eclipse: 'El Eclipse' };
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
    R.h.visible = true;
    R.a.r.dead = false;
    this.cabRide = { t: 0 };
    al.monts = al.monts.filter((m) => m !== R.m);
    const r = R.a.r;
    r.poseFn = (P) => this.cabPoseFn(P);
    this.cabPose = 'salta';
    this.cabT = 0;
    this.cabFrom = null;
    this.guard = this.P(1.0, 0.25);
    // (v8: adelante del caballo caído, entre San Martín y los realistas; corre
    // por el costado del caballo —no por encima— y dobla para ponerse adelante)
    if (this.v8) {
      this.guard = this.P(2.0, -0.55);
      this.cabWay = this.P(1.7, 1.0);
      this.cabFace = null;
    }
    // (v8) el sable sale de la vaina mientras salta (grabado, del usuario)
    if (this.v8) this.later(0.25, () => eclSfx(this.g).play('sable-desenvaina', { pos: this.cab.a.r.pos, gain: 0.7, reverb: 0.3 }));
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
    // (2026-10-08: "firme" no pone la cadera y la mezcla la tomaba como 0: en
    // el grito San Martín quedaba acostado, la cabeza a 0,6 m del piso)
    B2.hipY = 0.93;
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
      const R0 = this.ride;
      const d = Math.min(R0.dur ?? 1.15, R0.t);
      this.h.pos.copy(this.P((R0.from ?? -10.5) + d * (R0.v ?? 9.4), 0));
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
    if (this.v8 && this.cab) {
      // la fila de la pelea
      const Q = this.fseq;
      if (Q && this.cabPose === 'pelea') while (Q.length && this.cabT >= Q[0][0]) Q.shift()[1]();
      // muerto: el cuerpo se corre para que la cabeza quede donde estaba
      if (this.cabDead) this.cab.a.r.clipFwd = -0.23 * ease((this.cabDT || 0) / 1.4);
      if (this.cabFace != null && this.cabPose === 'pelea') this.cab.a.r.yaw = angTo(this.cab.a.r.yaw, this.cabFace, Math.min(1, dt * 12));
      tickPerson(this.cab.a, dt);
    }
    this.smT = (this.smT || 0) + dt;
    // el granadero que pasa barriendo
    if (this.byT != null && this.rider) {
      this.byT += dt;
      const R = this.rider;
      const s = -14 + this.byT * 12;
      R.h.pos.copy(this.P(this.v8 ? 3.6 : 3.2, -s));
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
        this.cabLand = this.v8 ? this.P(-4.6, 1.05) : this.P(-5.2, 1.1);
      }
      const k = ease(this.cabT / 0.5);
      r.pos.lerpVectors(this.cabFrom, this.cabLand, k);
      r.pos.y += Math.sin(Math.PI * k) * 0.3;
      r.yaw = puppetYaw(this.east);
      if (this.cabT > 0.5) {
        this.cabPose = 'corre';
        this.cabT = 0;
        // (v8) corre de verdad: el clip, al paso de lo que avanza
        if (this.v8) {
          const c = gauchoClip('sprint');
          actPerson(R.a, c, { loop: true, fade: 0.14, rate: RUN_V / Math.max(0.5, (c.speed || 3.6) * 0.86) });
        }
      }
    } else if (this.cabPose === 'corre') {
      if (this.cabWay && Math.hypot(this.cabWay.x - r.pos.x, this.cabWay.z - r.pos.z) < 0.4) this.cabWay = null;
      const to = this.cabWay || this.guard;
      const dx = to.x - r.pos.x;
      const dz = to.z - r.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        r.moving = false;
        r.speed = 0;
        if (this.v8) this.cabFace = puppetYaw(this.east);
        else r.yaw = puppetYaw(this.east);
        this.cabPose = 'pelea';
        this.cabT = 0;
        if (this.v8) this.fightSeq();
      } else {
        const s = Math.min(d, (this.v8 ? RUN_V : 4.6) * dt);
        r.pos.x += (dx / d) * s;
        r.pos.z += (dz / d) * s;
        toLocal(r.pos.x, r.pos.z, L);
        r.pos.y = hLoc(L.u, L.v);
        r.moving = true;
        r.speed = this.v8 ? RUN_V : 4.6;
        if (this.v8) r.yaw = angTo(r.yaw, Math.atan2(-dx, -dz), Math.min(1, dt * 9));
        else r.yaw = Math.atan2(-dx, -dz);
      }
    } else {
      r.moving = false;
      r.speed = 0;
    }
    // (los realistas le pegan a Cabral, no a San Martín, cuando él está adelante)
    if (this.cabPose === 'pelea' || this.cabPose === 'rodillas') {
      let k = 0;
      for (const z of this.horde.alive) {
        // (v8: los dos que llegan tarde siguen a lo suyo: los barre el granadero)
        if (this.v8 && z.late) continue;
        if (z.state === 'attack' || z.state === 'run') {
          const p = this.cabAt(tmpV).addScaledVector(this.dir, 0.95);
          // (v8: cada uno a su lugar, en abanico: no los tres encimados)
          if (this.v8) p.addScaledVector(this.side, [0.1, -0.75, 0.8][k % 3]).addScaledVector(this.dir, [0, 0.1, -0.05][k % 3]);
          z.to.set(p.x, 0, p.z);
          k++;
        }
      }
    }
  }

  cleanup() {
    const g = this.g;
    const sl = this.sl;
    const al = sl.al;
    const sm = this.sm;
    for (const o of this.grassOff || []) o.visible = true;
    this.grassOff = null;
    this.grassBack();
    if (this.expo0 != null) {
      g.renderer.toneMappingExposure = this.expo0;
      this.expo0 = null;
    }
    if (this.bloom0 != null) {
      if (g.post?.bloom) g.post.bloom.strength = this.bloom0;
      this.bloom0 = null;
    }
    g.hud.show(true);
    g.weapons.vmRoot.visible = true;
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    for (const o of this.zHide || []) o.visible = true;
    if (this.jHide) this.jHide.visible = true;
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
      // (v8: tendido con su clip, quieto)
      if (this.v8 && this.cab.a.gs?.cc) {
        const c = cabClip('deadBrave');
        if (c && this.cab.a.gs.cc.c !== c) {
          // (la escena se salteó antes de la muerte: tendido donde corresponde)
          actPerson(this.cab.a, c, { loop: true, fade: 0 });
          r.yaw = puppetYaw(this.east);
        }
        r.clipFwd = -0.23;
        if (this.cab.a.gs.sable) this.cab.a.gs.sable.visible = false;
      }
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
