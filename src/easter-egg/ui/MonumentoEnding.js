import * as THREE from 'three';
import CastleCine, { smooth, lerp, uprightMate } from './castleCine';
import Avatars from '../net/Avatars';
import { crewIds } from './cineCrew';
import { EE } from '../config/map';

// El final del easter egg del Monumento ("La Primera Bandera"), adentro del
// juego (MonumentoEgg.scene): la partida queda quieta y no se termina.
//  1. La Bandera recién izada flamea sobre la barranca; la niebla sube del río.
//  2. En el borde de la barranca se arma el ánima de Manuel Belgrano.
//  3. Mira la Bandera y a los cuatro gauchos.
//  4. Un fogonazo: Rosario, 27 de febrero de 1812 (en sepia). Las baterías
//     disparan, Belgrano levanta la mano hacia la Bandera y jura (la única
//     frase, en murmullo).
//  5. De vuelta: el que está en el medio le convida un mate. Lo toma, lo
//     devuelve y se va con la luz del río.
//  6. La cámara sube: toda la barranca, el Monumento y la Bandera.
// Siempre cuatro gauchos (ui/cineCrew). En línea cada uno la ve en su compu.

const ME = 470;
const BELGRANO = 466;
const LINE = 'Juremos vencer, y la América del Sur será el templo de la libertad.';
const tmpV = new THREE.Vector3();

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
    // (los muertos quietos de la ronda no entran en la escena)
    this.hidden = [];
    for (const z of g.zombies.pool) if (z.active && !z.dead) this.hidden.push(z);
    g.zombies.root && (g.zombies.root.visible = false);
    this.buildGauchos();
    this.buildBelgrano();
    const M = this.M;
    const B = this.B;
    const mid = this.gauchos[1];
    return [
      // 1. la Bandera arriba, desde la costanera
      [0, () => {
        // (desde la costanera, justo enfrente: entre medio no hay copas)
        this.shot(6, (u, lt, pos, look) => {
          pos.set(lerp(109.4, 108.2, smooth(u)), lerp(-3.0, -2.4, u), lerp(28.6, 30.0, smooth(u)));
          look.set(M.x + 0.8, M.y + lerp(6.5, 10.2, smooth(u)), M.z + 0.4);
        });
        this.title('La Primera Bandera');
        this.later(3.2, () => this.title(null, false));
        return 5.6;
      }],
      // 2. el ánima se arma en el borde de la barranca
      [0, () => {
        this.shot(5, (u, lt, pos, look) => {
          pos.set(lerp(97.8, 98.6, u), M.y + lerp(2.1, 1.9, u), lerp(32.9, 32.3, smooth(u)));
          look.set(B.x, B.y + 1.3, B.z);
        });
        this.later(0.6, () => this.appear());
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
        return 4.5;
      }],
      // 4. el fogonazo: 1812
      [0, () => {
        this.whiteEl.style.transition = 'opacity 0.5s';
        this.white(true);
        this.later(0.6, () => {
          this.past(true);
          this.white(false);
          this.card('Rosario, 27 de febrero de 1812', 4.2);
          this.bel.solid = true;
          this.bel.look = 'flag';
          this.shot(7.5, (u, lt, pos, look) => {
            pos.set(lerp(98.6, 99.2, u), B.y + lerp(1.3, 1.6, u), lerp(26.8, 27.6, smooth(u)));
            look.set(B.x, B.y + lerp(1.8, 3.4, smooth(u)), B.z);
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
          this.quiet();
          this.bel.solid = false;
          this.bel.arm = 0;
          this.bel.look = 'crew';
          mid.arms = 'offer';
          mid.walkTo = new THREE.Vector3(B.x - 1.05, 0, B.z + 0.15);
          this.shot(9, (u, lt, pos, look) => {
            pos.set(B.x - 1.3 + Math.sin(u * 0.8) * 0.3, B.y + 1.5, B.z + lerp(2.9, 2.5, u));
            look.set(B.x - 0.5, B.y + 1.35, B.z);
          });
        });
        this.later(2.6, () => (this.bel.arm = 2));
        this.later(3.2, () => {
          this.bel.mate = 1;
          mid.arms = null;
          mid.mateOff = true;
        });
        this.later(4.0, () => (this.bel.arm = 3));
        this.later(6.0, () => (this.bel.arm = 2));
        this.later(6.6, () => {
          this.bel.mate = 0;
          this.bel.arm = 0;
          mid.mateOff = false;
          mid.arms = 'nod';
        });
        return 7.6;
      }],
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
        this.later(7.4, () => this.fade(true));
        return 8.8;
      }],
    ];
  }

  // ---------------- los personajes ----------------
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
    if (r.arms === 'offer') {
      // estira el mate con las dos manos
      P.shRp = -1.2;
      P.shRr = 0.2;
      P.elR = -0.5;
      P.shLp = -1.0;
      P.shLr = -0.2;
      P.elL = -0.6;
    } else if (r.arms === 'nod') {
      P.headP = 0.35 * Math.max(0, Math.sin(this.t * 3));
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
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 });
    a.M.coat = coat;
    if (a.M.pants) a.M.pants.color.set(0xe8e4d8);
    a.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === a.M.hat || o.material === a.M.band) o.visible = false;
      if (o.material === a.M.poncho) o.material = coat;
    });
    for (const p of a.parts || []) if (p.material === a.M.poncho) p.material = coat;
    r.yaw = Math.atan2(-(this.gauchos[1].pos.x - r.pos.x), -(this.gauchos[1].pos.z - r.pos.z));
    r.poseFn = (P) => this.belPose(P);
    this.bel = { r, a, k: 0, on: false, look: 'crew', arm: 0, mate: 0, fade: false, solid: false };
  }

  belPose(P) {
    const b = this.bel;
    P.headP = b.look === 'flag' ? -0.55 : 0.05;
    if (b.arm === 1) {
      // la mano derecha en alto, hacia la Bandera
      P.shRp = -2.5;
      P.shRr = 0.25;
      P.elR = -0.15;
    } else if (b.arm === 2) {
      // recibe el mate
      P.shRp = -1.1;
      P.shRr = 0.15;
      P.elR = -0.55;
    } else if (b.arm === 3) {
      // toma
      P.shRp = -1.35;
      P.shRr = 0.1;
      P.elR = -1.9;
      P.headP = -0.25;
    }
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
    // el ánima: aparece, se ve sólida en 1812 y al final se va con el río
    if (b.on) {
      b.k = b.fade ? Math.max(0, b.k - dt / 2.4) : Math.min(1, b.k + dt / 1.6);
      b.r.ghost = !b.solid;
      for (const m of Object.values(b.a.M)) {
        if (!b.solid) m.opacity = 0.42 * b.k;
      }
      if (b.fade) {
        b.r.pos.x += dt * 0.6;
        b.r.pos.y += dt * 0.25;
        if (Math.random() < dt * 20) g.fx.sparkle(tmpV.copy(b.r.pos).setY(this.M.y + b.r.pos.y + 1 + Math.random()), [0.6, 0.85, 1], 1, 0.4);
      }
      const tgt = b.look === 'flag' ? this.M : this.gauchos[1].pos;
      const yaw = Math.atan2(-(tgt.x - b.r.pos.x), -(tgt.z - b.r.pos.z));
      b.r.yaw += (yaw - b.r.yaw) * Math.min(1, dt * 3);
      b.a.hand.visible = b.mate > 0;
    }
    // el del medio camina hasta Belgrano para convidarle
    for (const r of this.gauchos) {
      if (r.walkTo) {
        const d = tmpV.subVectors(r.walkTo, r.pos).setY(0);
        const L = d.length();
        if (L > 0.05) {
          r.pos.addScaledVector(d.normalize(), Math.min(L, dt * 1.1));
          r.moving = true;
          r.speed = 1.1;
        } else {
          r.moving = false;
          r.speed = 0;
          r.walkTo = null;
        }
      }
      if (r.a.hand) r.a.hand.visible = !r.mateOff;
    }
    this.people.update(dt);
    uprightMate(b.a, b.arm >= 2 ? 1 : 0, b.r.yaw);
    uprightMate(this.gauchos[1].a, this.gauchos[1].arms === 'offer' ? 1 : 0, this.gauchos[1].yaw);
  }

  cleanup() {
    const g = this.g;
    g.hud.show(true);
    g.weapons.vmRoot.visible = true;
    this.past(false);
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (g.zombies.root) g.zombies.root.visible = true;
    this.people?.dispose?.();
    this.people?.root?.removeFromParent();
  }
}
