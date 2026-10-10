import * as THREE from 'three';
import CastleCine, { smooth, lerp, uprightMate } from './castleCine';
import Avatars from '../net/Avatars';
import { crewIds, PERSONA_T } from './cineCrew';
import CineActors, { yawTo } from './cineActors';
import { EE } from '../config/map';
import { belgranoSkin } from '../entities/monumento/belgranoSkin';
import SableBeat, { sableBeatOn } from './monumentoSableBeat';
import { warmObject } from './cineWarm';

// El final del easter egg del Monumento ("La Primera Bandera"), adentro del
// juego (MonumentoEgg.scene): la partida queda quieta y no se termina.
//  1. La Bandera sube por el mástil de la barranca y flamea; la niebla sube del río.
//  2. En el borde de la barranca se arma el ánima de Manuel Belgrano.
//  3. Mira la Bandera y a los cuatro gauchos.
//  4. Un fogonazo: Rosario, 27 de febrero de 1812 (en sepia). Las baterías
//     disparan, Belgrano levanta la mano hacia la Bandera y jura (la única
//     frase, en murmullo).
//  5. De vuelta: el que está en el medio le convida un mate. Lo toma, lo
//     devuelve y se va con la luz del río.
//  6. La cámara sube: toda la barranca, el Monumento y la Bandera.
// Siempre cuatro gauchos (ui/cineCrew), animados con los clips de Blender
// (ui/cineActors) y cada uno con su carácter: el Valiente encara al ánima y
// después se lleva la mano al pecho, el Miedoso se agacha y reza, el Viejo se
// arrodilla ante el prócer, y el Canchero (anteojos) ceba como si nada y es el
// que rodea el mástil para convidarle. globalThis.__mduBlend = false: como antes.
// En línea cada uno la ve en su compu.

const ME = 470;
const BELGRANO = 466;
const LINE = 'Juremos vencer, y la América del Sur será el templo de la libertad.';
// (los cuatro con los clips: la fila, cuánto más atrás del mástil que antes)
const ROW_BACK = 0.6;
const tmpV = new THREE.Vector3();
// gira el yaw de r hacia y, lo más corto
function turnTo(r, y, k) {
  let d = y - r.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  r.yaw += d * Math.min(1, k);
}

export default class MonumentoEnding extends CastleCine {
  constructor(game) {
    super(game, { drive: false, kind: 'monumento' });
    // (el cartel grande con la letra del Monumento, no la de las otras escenas)
    this.titleEl.style.cssText = "font-family:'Cinzel',Georgia,serif;color:#eef6ff;text-shadow:0 0 28px rgba(116,172,223,.85),0 2px 0 #000;letter-spacing:.08em";
  }

  build() {
    const g = this.g;
    const w = g.world;
    const [mx, mz] = EE.mastil;
    const my = w.floorAt(mx, mz, -2);
    this.M = new THREE.Vector3(mx, my, mz);
    // el borde de la barranca (antes de la baranda) y la fila de los gauchos
    this.B = new THREE.Vector3(103.35, my, mz);
    this.people = new Avatars(g, null);
    // (los muñecos de Avatars no bajan de y 0 y el Parque está a -2,6: se baja
    // todo el grupo y ellos van a y 0)
    this.people.root.position.y = my;
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // la Bandera abajo: se iza en la primera toma (Bandera.update la pone en el mástil)
    this.flagK = 0.06;
    this.hoistT = -1;
    // (la Bandera va en el mástil: desde el menú de escenas, o si se llega
    // sin el paso de izarla, no estaba y la escena la subía invisible)
    if (g.ee?.bnd && g.ee.bnd.st.flag !== 'mast' && globalThis.__mduNoFinFlag !== true) g.ee.bnd.st.flag = 'mast';
    if (g.ee?.bnd) g.ee.bnd.st.hoist = this.flagK;
    // (los muertos quietos de la ronda no entran en la escena)
    this.hidden = [];
    for (const z of g.zombies.pool) if (z.active && !z.dead) this.hidden.push(z);
    g.zombies.root && (g.zombies.root.visible = false);
    if (globalThis.__mduBlend !== false) this.buildCrew();
    else this.buildGauchos();
    this.buildBelgrano();
    // el sable de San Martín para el Gil (ui/monumentoSableBeat: entre el mate y
    // la despedida; globalThis.__mduNoSableGil: como antes)
    this.sableBeat = sableBeatOn(this) ? new SableBeat(this) : null;
    const M = this.M;
    const B = this.B;
    const mid = this.mid;
    const C = this.crew;
    // (cada uno a su tiempo: PERSONA_T)
    // (en línea, desde la hora programada del paso: si una compu corrió el paso
    // tarde por una trabada, las reacciones salen a la misma hora que en la otra)
    const each = (base, clips) => C?.each(clips, base - (this.g.net && this.stepAt != null ? Math.max(0, this.t - this.stepAt) : 0));
    return [
      // 1. la Bandera sube por el mástil, desde la costanera (la cámara la sigue)
      [0, () => {
        // (desde la costanera, justo enfrente: entre medio no hay copas)
        this.shot(7, (u, lt, pos, look) => {
          pos.set(lerp(109.4, 108.2, smooth(u)), lerp(-3.0, -2.4, u), lerp(28.6, 30.0, smooth(u)));
          look.set(M.x + 0.8, M.y + lerp(3.2, 10.2, smooth(u)), M.z + 0.4);
        });
        this.later(0.4, () => {
          this.hoistT = 0;
          this.sfxHoist();
        });
        this.later(4.2, () => this.title('La Primera Bandera'));
        // la Bandera sube: el Valiente, la mano en el pecho; el Viejo la
        // señala; el Miedoso se santigua; el Canchero ceba
        each(0.6, { valiente: ['chestHand', { loop: true, look: 0.35, fade: 0.6 }], viejo: ['pointUp', { loop: true, fade: 0.7 }], miedoso: ['santiguar', { look: 0.3, fade: 0.5 }] });
        if (C) C.later(3.4, () => C.act(C.by.miedoso, 'chestHand', { loop: true, look: 0.3, fade: 0.6 }));
        this.later(6.4, () => this.title(null, false));
        return 7;
      }],
      // 2. el ánima se arma en el borde de la barranca
      [0, () => {
        this.shot(5, (u, lt, pos, look) => {
          // (C: la fila está 0,6 m más atrás; la cámara también, a la misma distancia del Miedoso)
          pos.set(lerp(97.8, 98.6, u) - (C ? ROW_BACK : 0), M.y + lerp(2.1, 1.9, u), lerp(32.9, 32.3, smooth(u)));
          look.set(B.x, B.y + 1.3, B.z);
        });
        this.later(0.6, () => this.appear());
        // y lo que ve el ánima: los cuatro, cada uno con su susto
        if (C) {
          this.later(2.7, () =>
            // (de frente el mástil quedaba entre el ánima y la fila y partía a
            // los cuatro en dos pares: con la fila 0,6 m más atrás y la cámara
            // a 24° del lado del Viejo, el mástil queda a la izquierda, pasando
            // al Miedoso, y los cuatro juntos, cada uno con la cara a la vista)
            this.shot(2.3, (u, lt, pos, look) => {
              const k = smooth(u);
              const an = lerp(-0.44, -0.4, k);
              const rd = lerp(3.45, 3.2, k);
              const cx = B.x - 3.2 - ROW_BACK;
              pos.set(cx + Math.cos(an) * rd, B.y + lerp(1.95, 1.85, k), B.z + Math.sin(an) * rd);
              look.set(cx, B.y + 1.0, B.z + 0.2);
            }),
          );
        }
        // se arma el ánima: cada uno se asusta a su manera (el Canchero no)
        each(0.75, { valiente: ['flinch', { fade: 0.2 }], miedoso: ['duck', { fade: 0.15 }], viejo: ['stagger', { fade: 0.3 }] });
        each(2.0, { valiente: ['fists', { loop: true, fade: 0.5 }], miedoso: ['cower', { loop: true, fade: 0.5 }], viejo: ['winded', { loop: true, fade: 0.6 }] });
        return 5;
      }],
      // 3. mira la Bandera, después a los gauchos
      [0, () => {
        this.bel.look = 'flag';
        this.shot(4.5, (u, lt, pos, look) => {
          pos.set(B.x - 2.2, B.y + lerp(1.2, 1.5, u), B.z - 1.6);
          look.set(B.x, B.y + lerp(1.7, 2.4, smooth(u)), B.z);
        });
        this.later(2.6, () => (this.bel.look = 'crew'));
        // lo reconocen: el Valiente baja los puños y se lleva la mano al
        // pecho, el Viejo se arrodilla, el Miedoso reza (espiando)
        each(1.2, { miedoso: ['pray', { loop: true, look: 0.15, fade: 0.6 }] });
        each(2.7, { valiente: ['chestHand', { loop: true, fade: 0.7 }], viejo: ['kneelDown', { fade: 0.5 }] });
        if (C) C.later(2.7 + PERSONA_T.viejo.delay + 1.0, () => C.act(C.by.viejo, 'kneelHold', { loop: true, fade: 0.35 }));
        return 4.5;
      }],
      // 4. el fogonazo: 1812
      [0, () => {
        this.whiteEl.style.transition = 'opacity 0.5s';
        this.white(true);
        this.later(0.6, () => {
          this.past(true);
          this.white(false);
          // (en 1812 no están)
          C?.show(false);
          this.card('Rosario, 27 de febrero de 1812', 4.2);
          this.bel.solid = true;
          this.bel.look = 'flag';
          if (globalThis.__mduNoFinFlag === true) {
            this.shot(7.5, (u, lt, pos, look) => {
              pos.set(lerp(98.6, 99.2, u), B.y + lerp(1.3, 1.6, u), lerp(26.8, 27.6, smooth(u)));
              look.set(B.x, B.y + lerp(1.8, 3.4, smooth(u)), B.z);
            });
            return;
          }
          // Belgrano iza la Bandera: abajo en el mástil y, al segundo, sube
          // hasta la mitad mientras él levanta la mano y jura (antes él quedaba
          // chico abajo y la Bandera fuera de cuadro; switch __mduNoFinFlag)
          this.flagK = 0.0;
          this.hoistTo = 0.42;
          this.hoistT = -1;
          if (g.ee?.bnd) g.ee.bnd.st.hoist = 0;
          this.later(1.0, () => (this.hoistT = 0));
          this.shot(7.5, (u, lt, pos, look) => {
            // (adentro del Parque, en un claro entre las copas, abierta: de
            // afuera la reja y un pilar tapaban a Belgrano, del norte la
            // Bandera se ve de canto y más al sur una tipa la tapaba arriba).
            // Belgrano entero al pie y la Bandera subiendo, los dos en cuadro
            // toda la toma
            this.setFov(74);
            pos.set(lerp(98.0, 98.2, smooth(u)), B.y + 1.0, lerp(26.6, 27.0, smooth(u)));
            look.set(102.0, B.y + lerp(2.6, 3.0, smooth(u)), B.z);
          });
        });
        // las baterías: tres cañonazos
        [1.6, 2.5, 3.3].forEach((t, i) => this.later(t, () => this.salvo(i)));
        this.later(4.4, () => (this.bel.arm = 1));
        this.later(4.8, () => this.say('belgrano', LINE));
        return 9.2;
      }],
      // 5. de vuelta: el mate
      [0, () => {
        this.whiteEl.style.transition = 'opacity 0.45s';
        this.white(true);
        this.later(0.5, () => {
          this.past(false);
          this.white(false);
          if (this.fov0) this.setFov(this.fov0);
          // (de vuelta al presente: la Bandera arriba, como quedó en la toma 1)
          if (this.hoistTo != null) {
            this.hoistTo = null;
            this.hoistT = -1;
            if (g.ee?.bnd) g.ee.bnd.st.hoist = 1;
          }
          this.quiet();
          this.bel.solid = false;
          this.bel.arm = 0;
          this.bel.look = 'crew';
          C?.show(true);
          if (!C) {
            mid.arms = 'offer';
            // (rodeando el mástil por el costado: antes lo atravesaba por el medio)
            mid.path = [new THREE.Vector3(M.x, 0, B.z - 1.45), new THREE.Vector3(B.x - 0.95, 0, B.z - 0.62)];
          }
          this.shot(9, (u, lt, pos, look) => {
            if (C) {
              // (del lado del camino: el Canchero pasa por delante del mástil, nunca detrás de la base)
              pos.set(B.x - 1.0 + Math.sin(u * 0.8) * 0.25, B.y + 1.6, B.z + lerp(3.4, 3.1, u));
              look.set(B.x - 0.65, B.y + 1.3, B.z + 0.45);
              return;
            }
            pos.set(B.x - 1.3 + Math.sin(u * 0.8) * 0.3, B.y + 1.5, B.z + lerp(2.4, 2.0, u));
            look.set(B.x - 0.5, B.y + 1.35, B.z - 0.3);
          });
        });
        // (con los clips: el Canchero ya arranca a caminar en el blanco)
        const d = C ? 0.4 : 0;
        if (C) this.crewMate(C);
        this.later(2.6 + d, () => (this.bel.arm = 2));
        this.later(3.2 + d, () => {
          this.bel.mate = 1;
          mid.arms = null;
          mid.mateOff = true;
          if (C) {
            mid.mate = false;
            C.act(mid, 'cool', { loop: true, fade: 0.5 });
          }
        });
        this.later(4.0 + d, () => (this.bel.arm = 3));
        // los de atrás no quedan de estatua mientras Belgrano toma: el
        // Valiente lo saluda y vuelve a la mano en el pecho; el Miedoso se
        // santigua y sigue rezando (switch __mduNoBelArms)
        if (C && globalThis.__mduNoBelArms !== true) {
          each(4.2, { valiente: ['wave', { fade: 0.5 }], miedoso: ['santiguar', { fade: 0.5 }] });
          each(6.4, { valiente: ['chestHand', { loop: true, fade: 0.7 }], miedoso: ['pray', { loop: true, look: 0.15, fade: 0.6 }] });
        }
        this.later(6.0, () => (this.bel.arm = 2));
        this.later(6.6, () => {
          this.bel.mate = 0;
          this.bel.arm = 0;
          mid.mateOff = false;
          mid.arms = 'nod';
          if (C) {
            mid.mate = true;
            C.act(mid, 'cebar', { loop: true, fade: 0.45 });
          }
        });
        return 7.6;
      }],
      // 5b. el desgarro: sale el Gil y se lleva el sable (ui/monumentoSableBeat)
      ...(this.sableBeat ? [[0, () => this.sableBeat.step()]] : []),
      // 6. se va con la luz del río y la cámara sube
      [0, () => {
        this.bel.fade = true;
        // la grúa: de atrás de los gauchos hasta ver la Bandera adelante y la Torre atrás
        this.shot(9, (u, lt, pos, look) => {
          const k = smooth(u);
          pos.set(lerp(107.5, 109.5, k), lerp(-1.2, 13.5, k), lerp(34.5, 39.5, k));
          look.set(lerp(B.x, 86, k), lerp(B.y + 2.5, 11, k), lerp(B.z, 29, k));
        });
        this.later(4.5, () => this.card('La Primera Bandera flamea otra vez sobre el Paraná', 3.6));
        // se va: el Valiente lo saluda, el Miedoso se santigua, el Canchero
        // le levanta el mate (un brindis), el Viejo con la mano en el pecho
        each(0.3, { valiente: ['wave', { fade: 0.5 }], miedoso: ['santiguar', { fade: 0.5 }], canchero: ['offer', { fade: 0.6 }], viejo: ['chestHand', { loop: true, fade: 0.7 }] });
        each(3.2, { valiente: ['fistUp', { loop: true, fade: 0.6 }], miedoso: ['pray', { loop: true, fade: 0.6 }] });
        this.later(7.4, () => this.fade(true));
        return 8.8;
      }],
    ];
  }

  // ---------------- los personajes ----------------
  // Los cuatro con los clips de Blender, en la misma fila (mirando al río):
  // el Viejo, el Valiente, el Canchero (el que convida) y el Miedoso.
  buildCrew() {
    const g = this.g;
    const my = this.M.y;
    const C = new CineActors(g, {
      floor: (x, z) => {
        const y = g.world.floorAt(x, z, -2);
        return Number.isFinite(y) && Math.abs(y - my) < 1 ? y : my;
      },
    });
    // (el Canchero del lado de la cámara del mate: pasa por delante del
    // mástil, a la vista, y no por atrás de la base de piedra)
    const SLOT = { viejo: 0, valiente: 1, canchero: 2, miedoso: 3 };
    for (const r of C.list) {
      const s = SLOT[r.persona] - 1.5;
      // (ROW_BACK: más lejos del mástil, para que la toma del ánima los vea a los cuatro sin el palo en el medio)
      r.pos.set(this.B.x - 3.0 - ROW_BACK - Math.abs(s) * 0.35, 0, this.B.z + s * 1.15);
      r.pos.y = C.floor(r.pos.x, r.pos.z);
      r.yaw = yawTo(r.pos, this.B) + s * 0.04;
    }
    const b = C.by;
    C.act(b.valiente, 'cool', { loop: true });
    C.act(b.miedoso, 'cower', { loop: true });
    C.act(b.viejo, 'winded', { loop: true });
    C.act(b.canchero, 'cebar', { loop: true, look: 0.2 });
    b.canchero.mate = true;
    this.crew = C;
    this.mid = b.canchero;
    this.gauchos = C.list;
  }

  // El Canchero rodea el mástil (por el lado de afuera: lejos de la base de
  // piedra) hasta Belgrano y le convida; los otros, cada uno a lo suyo.
  crewMate(C) {
    const b = C.by;
    const r = b.canchero;
    const B = this.B;
    r.mate = false;
    // (a 1 m o más del centro del mástil: la base mide 0,72; y lejos del Miedoso)
    const pts = [new THREE.Vector3(B.x - 2.05, 0, B.z + 1.25), new THREE.Vector3(B.x - 0.9, 0, B.z + 0.6)];
    // (desde la fila, 0,6 m más atrás: un poco más ligero, para llegar a la misma hora que Belgrano estira la mano)
    C.walkPath(r, pts, 1.2, 'cool', { loop: true });
    const arrive = r.mv.dur;
    C.later(arrive + 0.05, () => {
      C.turnTo(r, this.bel.r.pos, 0.5);
      r.mate = true;
      C.act(r, 'offer', { fade: 0.45 });
    });
    // el Viejo se levanta despacio; el Valiente, de brazos cruzados, orgulloso;
    // el Miedoso, más tranquilo, lo saluda tímido
    C.act(b.viejo, 'kneelDown', { t: 1.0, rate: -0.7, fade: 0.3 });
    C.later(1.6, () => C.act(b.viejo, 'chestHand', { loop: true, fade: 0.6 }));
    C.later(0.9, () => C.act(b.valiente, 'crossArms', { loop: true, fade: 0.6 }));
    C.later(4.2, () => C.act(b.miedoso, 'wave', { fade: 0.6 }));
  }

  // (__mduBlend = false: los de piezas, como antes)
  // Los cuatro gauchos (vos en el medio), mirando al río, al lado del mástil.
  buildGauchos() {
    const g = this.g;
    const me = g.net?.id ?? 0;
    const ids = crewIds(g).filter((id) => id !== me);
    ids.splice(1, 0, me);
    this.gauchos = ids.map((id, i) => {
      const r = { id: ME + id, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false };
      this.people.add(r);
      const a = this.people.list.get(r.id);
      const own = this.people.materials(id);
      a.M.poncho.color.copy(own.poncho.color);
      for (const m of Object.values(own)) m.dispose();
      r.a = a;
      const s = i - 1.5;
      r.pos.set(this.B.x - 3.0 - Math.abs(s) * 0.35, 0, this.B.z + s * 1.15);
      r.yaw = Math.atan2(-(this.B.x - r.pos.x), -(this.B.z - r.pos.z));
      r.poseFn = (P) => this.gauchoPose(r, P);
      return r;
    });
  }

  gauchoPose(r, P) {
    const T = {};
    if (r.arms === 'offer') {
      // estira el mate con las dos manos
      T.shRp = -1.2;
      T.shRr = 0.2;
      T.elR = -0.5;
      T.shLp = -1.0;
      T.shLr = -0.2;
      T.elL = -0.6;
    } else if (r.arms === 'nod') {
      T.headP = 0.35 * Math.max(0, Math.sin(this.t * 3));
    }
    this.ease(r, P, T);
  }

  // Las poses de la escena van y vienen suaves (antes saltaban de una a otra
  // de golpe: los brazos parecían de robot). T: lo que pide la toma; lo que no
  // pide vuelve a la pose de siempre.
  ease(r, P, T, rate = 5) {
    const cur = (r.cur ||= {});
    const k = 1 - Math.exp(-(this.dt || 0.016) * rate);
    for (const key of new Set([...Object.keys(cur), ...Object.keys(T)])) {
      const goal = T[key] ?? P[key] ?? 0;
      const c = cur[key] ?? P[key] ?? goal;
      cur[key] = c + (goal - c) * k;
      P[key] = cur[key];
    }
  }

  // Belgrano: el ánima (azul, transparente); sin sombrero, de levita oscura.
  buildBelgrano() {
    const g = this.g;
    // (dead: escondido hasta que aparece)
    const r = { id: BELGRANO, name: '', noTag: true, pos: this.B.clone().setY(0), yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true, dead: true };
    // (de piezas, como las ánimas de luz del castillo: el modelo de gaucho trae
    // el sombrero pegado. Sin sombrero, de levita oscura y pantalón blanco)
    const off = window.__gauchoSkinOff;
    window.__gauchoSkinOff = true;
    this.people.add(r);
    window.__gauchoSkinOff = off;
    const a = this.people.list.get(r.id);
    // el de verdad (Meshy, entities/monumento/belgranoSkin); mientras baja, el de piezas
    belgranoSkin(a);
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 });
    a.M.coat = coat;
    if (a.M.pants) a.M.pants.color.set(0xe8e4d8);
    a.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === a.M.hat || o.material === a.M.band) o.visible = false;
      if (o.material === a.M.poncho) o.material = coat;
    });
    for (const p of a.parts || []) if (p.material === a.M.poncho) p.material = coat;
    this.mid ||= this.gauchos[1];
    r.yaw = Math.atan2(-(this.mid.pos.x - r.pos.x), -(this.mid.pos.z - r.pos.z));
    r.poseFn = (P) => this.belPose(P);
    this.bel = { r, a, k: 0, on: false, look: 'crew', arm: 0, mate: 0, fade: false, solid: false };
  }

  belPose(P) {
    const b = this.bel;
    const T = { headP: b.look === 'flag' ? -0.55 : 0.05 };
    // (asiente: ui/monumentoSableBeat, cuando el Gil alza el sable)
    if (b.nod) T.headP += b.nod;
    // respira (el pecho y los hombros apenas)
    T.torsoP = 0.03 * Math.sin(this.t * 1.6);
    T.shLp = 0.04 * Math.sin(this.t * 1.6 + 0.4);
    if (this.crew) {
      // y no queda de estatua: el peso de un pie al otro, la cabeza que mira
      T.torsoR = 0.035 * Math.sin(this.t * 0.55);
      T.headY = 0.07 * Math.sin(this.t * 0.37 + 1);
      T.headR = -0.02 * Math.sin(this.t * 0.55);
      T.shLr = 0.12 + 0.03 * Math.sin(this.t * 0.8);
      // (los brazos no cuelgan tiesos de maniquí: los codos apenas doblados y
      // el izquierdo un poco adelante; switch __mduNoBelArms)
      if (globalThis.__mduNoBelArms !== true) {
        T.shLp += -0.1;
        T.elL = -0.34 + 0.05 * Math.sin(this.t * 0.8 + 0.6);
        T.elR = -0.26 + 0.04 * Math.sin(this.t * 0.7 + 1.3);
        T.shRp = -0.06;
      }
    }
    if (b.arm === 1) {
      // la mano derecha en alto, hacia la Bandera
      T.shRp = -2.5;
      T.shRr = 0.25;
      T.elR = -0.15;
    } else if (b.arm === 2) {
      // recibe el mate
      T.shRp = -1.1;
      T.shRr = 0.15;
      T.elR = -0.55;
    } else if (b.arm === 3 && this.belSip()) {
      // toma: el mate abajo del mentón, la bombilla a los labios, la cabeza
      // apenas inclinada (medido en el juego con el modelo de verdad: con la
      // pose de las piezas la mano le quedaba abierta al lado de la oreja)
      T.shRp = -0.69;
      T.shRr = 0.16;
      T.shRy = -1.11;
      T.elR = -1.83;
      T.headP = 0.1;
    } else if (b.arm === 3) {
      // toma (el de piezas)
      T.shRp = -1.35;
      T.shRr = 0.1;
      T.elR = -1.9;
      T.headP = -0.25;
    }
    if (this.crew) this.spring(b.r, P, T, b.arm === 1 ? 4.2 : 5.5);
    else this.ease(b.r, P, T, b.arm === 1 ? 3.2 : 4.5);
  }

  // ¿Toma con la pose del modelo de verdad? (globalThis.__mduNoBelMate: como antes)
  belSip() {
    return !!this.bel.a.gs && globalThis.__mduNoBelMate !== true;
  }

  // Como ease, pero con inercia (un resorte apenas amortiguado): el brazo
  // arranca despacio, llega y se asienta, en vez de ir en línea a la pose.
  spring(r, P, T, w) {
    const cur = (r.cur ||= {});
    const vel = (r.vel ||= {});
    const dt = Math.min(1 / 20, this.dt || 0.016);
    for (const key of new Set([...Object.keys(cur), ...Object.keys(T)])) {
      const goal = T[key] ?? P[key] ?? 0;
      const c = cur[key] ?? P[key] ?? goal;
      const v0 = vel[key] ?? 0;
      const v = v0 + (w * w * (goal - c) - 2 * 0.82 * w * v0) * dt;
      vel[key] = v;
      cur[key] = c + v * dt;
      P[key] = cur[key];
    }
  }

  // la driza que corre por la roldana mientras sube la Bandera
  sfxHoist() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const [mx, mz] = EE.mastil;
    const o = A.out({ pos: tmpV.set(mx, this.M.y + 2, mz), gain: 0.8, reverb: 0.4, ref: 6 });
    for (let i = 0; i < 16; i++) A.noise(o, { t: A.now + 0.05 + i * 0.3, dur: 0.18, type: 'bandpass', freq: 900 + (i % 3) * 140, q: 3, gain: 0.08, attack: 0.02 });
  }

  appear() {
    const g = this.g;
    this.bel.on = true;
    this.bel.r.dead = false;
    const p = tmpV.copy(this.B).setY(this.B.y + 1.2);
    g.fx.flash(p, 0x8ac8ff, 40, 0.8, 14);
    g.fx.sparkle(p, [0.6, 0.85, 1], 40, 1.2);
    g.audio.bell?.(g.audio.out({ pos: p, gain: 0.6, reverb: 0.8, ref: 8 }), g.audio.now + 0.05, 62, { gain: 0.12, dur: 5 });
  }

  // un cañonazo de la Batería Libertad (los dos cañones viejos del Parque)
  salvo(i) {
    const g = this.g;
    const bat = g.world.mon?.bateria || [];
    const c = bat[i % Math.max(1, bat.length)];
    const p = c ? c.getWorldPosition(new THREE.Vector3()).add(tmpV.set(1.2, 0.7, 0)) : new THREE.Vector3(103.5, -1.9, 9 + i);
    g.fx.flash(p, 0xffb060, 60, 0.35, 22);
    g.fx.smoke?.(p, 12) ?? g.fx.steam(p, 14, 0.6);
    g.fx.sparks(p, 3, { x: 1, y: 0.3, z: 0 });
    this.shake = 0.6;
    const A = g.audio;
    if (A?.ctx) {
      const o = A.out({ pos: p, gain: 1.2, reverb: 0.9, ref: 10 });
      A.noise(o, { t: A.now, dur: 1.4, type: 'lowpass', freq: 520, freqEnd: 90, gain: 1, attack: 0.002, brown: true });
      A.tone(o, { t: A.now, dur: 0.6, type: 'sine', freq: 60, freqEnd: 30, gain: 0.6 });
    }
  }

  // 1812: la imagen en sepia (un filtro del canvas) y la niebla más clara
  past(on) {
    // (un velo con backdrop-filter arriba del juego: el canvas puede ser otro, el de FSR)
    if (!this.sepia) {
      const el = document.createElement('i');
      el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s;backdrop-filter:sepia(.9) saturate(.75) brightness(1.35) contrast(1.08);-webkit-backdrop-filter:sepia(.9) saturate(.75) brightness(1.35) contrast(1.08);background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(40,22,6,.55) 100%)';
      this.el.insertBefore(el, this.el.firstChild);
      this.sepia = el;
    }
    this.sepia.style.opacity = on ? '1' : '0';
  }

  // ---------------- cada cuadro ----------------
  tick(dt) {
    const g = this.g;
    const b = this.bel;
    this.dt = dt;
    // la Bandera que sube (toma 1)
    if (this.hoistT >= 0 && g.ee?.bnd) {
      this.hoistT += dt;
      const k = smooth(Math.min(1, this.hoistT / 5.4));
      // (hoistTo: en 1812 sube hasta la mitad, a la vista; arriba la tapaban las copas)
      g.ee.bnd.st.hoist = this.flagK + ((this.hoistTo ?? 1) - this.flagK) * k;
    }
    // el modelo de verdad: ánima azul y transparente, o sólido en 1812
    const bm = b.a.M.belgrano;
    // (baja después de armar la escena: se compila apenas llega, escondido
    // todavía. Si no, al aparecer trababa el cuadro: 0,3 s en Baja y 0,7 s en
    // Épica, medido. globalThis.__mduNoBelWarm: como antes)
    if (bm && !this.belWarm && globalThis.__mduNoBelWarm !== true) {
      this.belWarm = true;
      warmObject(g, b.a.group);
    }
    if (bm) {
      const ghost = !b.solid;
      if (bm.depthWrite === ghost) {
        bm.depthWrite = !ghost;
        bm.emissive.set(ghost ? 0x2a70c8 : 0x000000);
        bm.emissiveIntensity = ghost ? 0.9 : 0;
      }
    }
    // el ánima: aparece, se ve sólida en 1812 y al final se va con el río
    if (b.on) {
      b.k = b.fade ? Math.max(0, b.k - dt / 2.4) : Math.min(1, b.k + dt / 1.6);
      b.r.ghost = !b.solid;
      for (const m of Object.values(b.a.M)) {
        if (!b.solid) m.opacity = 0.42 * b.k;
      }
      if (b.a.M.belgrano) b.a.M.belgrano.opacity = b.solid ? 1 : 0.55 * b.k;
      if (b.fade) {
        b.r.pos.x += dt * 0.6;
        b.r.pos.y += dt * 0.25;
        if (Math.random() < dt * 20) g.fx.sparkle(tmpV.copy(b.r.pos).setY(this.M.y + b.r.pos.y + 1 + Math.random()), [0.6, 0.85, 1], 1, 0.4);
      }
      // (lookAt: a quién mira mientras tanto, el Gil en ui/monumentoSableBeat)
      const tgt = b.look === 'flag' ? this.M : b.lookAt || this.mid.pos;
      const yaw = Math.atan2(-(tgt.x - b.r.pos.x), -(tgt.z - b.r.pos.z));
      b.r.yaw += (yaw - b.r.yaw) * Math.min(1, dt * 3);
      b.a.hand.visible = b.mate > 0;
    }
    // el del medio camina hasta Belgrano para convidarle
    for (const r of this.crew ? [] : this.gauchos) {
      if (r.path?.length) {
        const d = tmpV.subVectors(r.path[0], r.pos).setY(0);
        const L = d.length();
        if (L > 0.06) {
          r.pos.addScaledVector(d.normalize(), Math.min(L, dt * 1.1));
          r.moving = true;
          r.speed = 1.1;
          // mira para donde camina (gira de a poco)
          turnTo(r, Math.atan2(-d.x, -d.z), dt * 5);
        } else r.path.shift();
        if (!r.path.length) {
          r.moving = false;
          r.speed = 0;
          r.facing = true;
        }
      } else if (r.facing) {
        // llegó: se da vuelta hacia Belgrano
        turnTo(r, Math.atan2(-(b.r.pos.x - r.pos.x), -(b.r.pos.z - r.pos.z)), dt * 4);
      }
      if (r.a.hand) r.a.hand.visible = !r.mateOff;
    }
    this.people.update(dt);
    // (Avatars le esconde el mate a las ánimas: Belgrano levantaba la mano
    // vacía a la cara; el mate que le convidan va en su mano)
    if (b.on && globalThis.__mduNoBelMate !== true) {
      b.a.hand.visible = b.mate > 0;
      // y es el mate del Canchero, de verdad: con el material del ánima
      // (azul y transparente sobre su cuerpo azul) no se distinguía
      if (b.mate > 0 && !this.belMate && this.mid?.a?.hand) {
        this.belMate = true;
        const mine = [];
        const his = [];
        b.a.hand.traverse((o) => o.isMesh && mine.push(o));
        this.mid.a.hand.traverse((o) => o.isMesh && his.push(o));
        if (mine.length === his.length) mine.forEach((o, i) => (o.material = his[i].material));
      }
    }
    // (la bombilla inclinada hacia su cara, no hacia el costado)
    uprightMate(b.a, b.arm >= 2 ? 1 : 0, b.r.yaw + (this.belSip() ? Math.PI / 2 : 0));
    if (this.crew) {
      // (con el reloj de la escena, que en línea es el de verdad: si una compu
      // se traba, los cuatro siguen en hora con Belgrano y las tomas)
      const cdt = Math.max(0, this.t - (this.crewT ?? this.t - dt));
      this.crewT = this.t;
      this.crew.tick(cdt);
      this.sableBeat?.tick(cdt);
    }
    else uprightMate(this.gauchos[1].a, this.gauchos[1].arms === 'offer' ? 1 : 0, this.gauchos[1].yaw);
  }

  cleanup() {
    const g = this.g;
    // (si se saltó la escena, la Bandera queda arriba)
    if (g.ee?.bnd) g.ee.bnd.st.hoist = 1;
    g.hud.show(true);
    g.weapons.vmRoot.visible = true;
    this.past(false);
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (g.zombies.root) g.zombies.root.visible = true;
    this.people?.dispose?.();
    this.people?.root?.removeFromParent();
    this.sableBeat?.dispose();
    this.crew?.dispose();
  }
}
