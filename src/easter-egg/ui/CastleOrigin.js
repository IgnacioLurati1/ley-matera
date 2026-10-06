import * as THREE from 'three';
import CastleCine, { smooth, lerp, uprightMate, knightMate, knightMouth } from './castleCine';
import { ELEMENTS, MATE_OF } from '../entities/castle/common';
import Avatars from '../net/Avatars';
import { PERSONA_T, personaOf } from './cineCrew';
import CastleClips, { personaLetter } from './castleClips';
import { buildChiqui, chiquiGiggle, chiquiGlitch, chiquiEmber } from '../world/Chiqui';
import { EE } from '../config/map';

// La escena del medio del juego: con los cuatro mates de la luz en sus
// altares, Martín Fierro cuenta de dónde salieron, junto al fogón.
//  1. El fogón del gran salón: Fierro, agachado, empieza el cuento.
//  2. La visión, en la sala del trono: el Chiquitijuein grande, en el trono.
//     Aparecen los cuatro caballeros de la luz (fuego, viento, rayo y hielo).
//  3. La pelea: cada uno le tira lo suyo y al final, juntos, lo bajan del
//     trono. Cae de rodillas en la alfombra, rajado, perdiendo la oscuridad.
//  4. Lo rodean. Discuten: al Chiquitijuein no se lo puede matar (su hambre
//     no se muere), así que lo encierran.
//  5. El sello: levantan los mates, el círculo se prende de a un color, la luz
//     de los cuatro hace un mate de piedra; el Chiquitijuein se achica y se
//     mete adentro, y la bombilla de oro entra como una llave. Adentro, dos
//     puntitos colorados: se achicó y se puso a esperar.
//  6. Se arrodillan y juran esconder los mates: las cuatro luces se van.
//  7. La cumbre: las cuatro tumbas, las espadas que brillan.
//  8. De vuelta al fogón: ahora les toca a ustedes empuñarlos.
// Pasa adentro del juego (CastleEgg.scene): la partida queda quieta. En línea
// la ve cada uno en su compu, igual.

const COLORS = [0xff6a1a, 0x8affb8, 0xffe45a, 0x9adcff];
const RGB = [[1, 0.5, 0.15], [0.6, 1, 0.75], [1, 0.92, 0.45], [0.66, 0.88, 1]];
const KNIGHTS = [
  { name: 'El Caballero del Fuego', voice: 'caballeroFuego', css: '#ff9a5a' },
  { name: 'El Caballero del Viento', voice: 'caballeroViento', css: '#9affc4' },
  { name: 'El Caballero del Rayo', voice: 'caballeroRayo', css: '#ffe870' },
  { name: 'El Caballero del Hielo', voice: 'caballeroHielo', css: '#a8e2ff' },
];
// lo que se dicen alrededor del Chiquitijuein vencido (en el orden en que hablan)
const TALK = [
  [0, 'Terminemos con esto. Que arda hasta la última sombra.'],
  [3, 'Si lo matamos, su hambre se desparrama por el mundo. Lo que no está vivo no se muere.'],
  [1, 'Entonces que no vuelva a salir. Nunca.'],
  [2, 'Los cuatro mates juntos. Un encierro que ninguno pueda abrir solo.'],
];
const FIERRO = [
  'Lo tenían de rodillas. Pero al Chiquitijuein no se lo puede matar: su hambre no se muere nunca.',
  'Juntaron la luz de los cuatro mates en uno de piedra... y le clavaron la bombilla de llave.',
  'El trono quedó vacío. Y adentro de ese mate, el Chiquitijuein se achicó... y se puso a esperar.',
];
const GIANT = 2.6;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export default class CastleOrigin extends CastleCine {
  constructor(game, lines) {
    super(game, { drive: false, kind: 'castillo' });
    this.lines = lines;
  }

  build() {
    const g = this.g;
    const L = this.lines;
    const w = g.world;
    const [fx, fz] = EE.fierro;
    const fy = w.floorAt(fx, fz);
    const F = new THREE.Vector3(fx, fy, fz);
    const TH = new THREE.Vector3(51.5, w.floorAt(51.5, 23), 21.5);
    // donde cae de rodillas: en la alfombra, delante del trono
    const G = new THREE.Vector3(51.5, w.floorAt(51.5, 25.4), 25.4);
    this.G = G;
    this.TH = TH;
    const TOMBS = [45, 49, 54, 58].map((x) => new THREE.Vector3(x, w.floorAt(x, 13), 11));
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    this.buildGiant(TH);
    this.buildKnights(TH, G);
    this.buildSeal(G);
    // el brillo de las espadas de la cumbre
    this.swords = TOMBS.map((p, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: COLORS[i], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.scale.setScalar(1.6);
      s.position.copy(p).add(tmpV.set(0, 1.5, 0.3));
      this.root.add(s);
      return s;
    });
    this.swordK = 0;
    // la música de la visión va por su propio canal (coro y campanas); con la
    // canción de la escena (core/music.js) el coro calla y las campanas bajan
    const au = g.audio;
    const scored = g.music?.play('cine-castillo-medio', { while: (G) => G.ee?.scene?.kind === 'origen' });
    const bus = au.ctx ? au.out({ gain: scored ? 0.55 : 1, reverb: 0.7, bus: au.music }) : null;
    this.choir = (t, notes, o) => bus && !scored && au.choir(bus, au.now + t, notes, o);
    this.bell = (t, n, o) => bus && au.bell(bus, au.now + t, n, o);
    return [
      // 1. el fogón
      [0, () => {
        // (desde el lado de las mesas: del otro está la escalera)
        this.shot(12, (u, lt, pos, look) => {
          pos.set(F.x + lerp(-3.4, -2.1, smooth(u)), F.y + lerp(1.95, 1.5, u), F.z + lerp(3.5, 2.4, smooth(u)));
          look.set(F.x - lerp(0.9, 0.5, u), F.y + 0.95, F.z - lerp(1, 0.6, u));
        });
        return 1.2;
      }],
      [0, () => this.say('fierro', L[0])],
      // 2. la visión: el Chiquitijuein grande en su trono; llegan los caballeros
      [0.2, () => {
        this.whiteEl.style.transition = 'opacity 0.8s';
        this.white(true);
        this.later(0.8, () => {
          this.giant.root.visible = true;
          // en su trono, en su momento: el resplandor colorado bajo el ala y los ojos prendidos
          this.giant.halo.material.opacity = 0.55;
          this.giant.eyeK = 2;
          this.white(false);
          chiquiGiggle(g.audio, { pos: this.giant.root.position, gain: 1.2, ref: 12, pitch: 0.55 });
          this.choir(0.2, [38, 45, 50], { dur: 9, gain: 0.035, attack: 3, release: 3 });
        });
        this.shot(12, (u, lt, pos, look) => {
          pos.set(TH.x + lerp(-1.4, 1.2, u), TH.y + lerp(1.3, 1.7, u), TH.z + lerp(10.2, 9.2, smooth(u)));
          look.set(TH.x, TH.y + 2.1, TH.z);
        });
        // uno por uno, en la alfombra
        this.knights.forEach((K, i) => this.later(2.2 + i * 0.9, () => this.arrive(i)));
        return 1;
      }],
      [0, () => this.say('fierro', L[1])],
      // 3. la pelea: cada uno lo suyo, y al final juntos lo bajan del trono
      [0.2, () => {
        this.shot(9, (u, lt, pos, look) => {
          const a = 1.15 + u * 0.8;
          pos.set(TH.x + Math.cos(a) * 8.5, TH.y + lerp(2.4, 3.2, u), TH.z + 3.5 + Math.sin(a) * 6);
          look.set(TH.x, TH.y + 1.6, TH.z + 2);
        });
        this.knights.forEach((K, i) => this.later(0.7 + i * 1.05, () => this.strike(i, TH)));
        this.later(5.4, () => this.together(TH));
        this.later(5.9, () => this.throwOff(TH, G));
        // la caída, de abajo
        this.later(6.3, () =>
          this.shot(3, (u, lt, pos, look) => {
            pos.set(G.x - 2.6, G.y + 0.45, G.z + 4.2);
            look.set(G.x, G.y + lerp(2.4, 1.4, smooth(u)), G.z - 0.5);
          }),
        );
        return Math.max(8.4, this.say('fierro', L[2]));
      }],
      // 4. vencido: lo rodean
      [0.3, () => {
        this.beaten = true;
        this.shot(9, (u, lt, pos, look) => {
          pos.set(G.x + lerp(1.4, 0.7, smooth(u)), G.y + lerp(0.55, 0.9, u), G.z + lerp(5, 3.6, smooth(u)));
          look.set(G.x, G.y + 1.8, G.z);
        });
        this.knights.forEach((K, i) => this.later(0.4 + i * 0.25, () => this.walkTo(i, K.ring, 2.4)));
        return this.say('fierro', FIERRO[0]);
      }],
      // 5. discuten: uno por uno, por encima del hombro del que habla
      ...TALK.map(([i, text], n) => [
        0.25,
        () => {
          const K = this.knights[i];
          const P = K.ring;
          if (P.z > G.z) {
            // los del lado de la alfombra: por encima de su hombro, hacia el vencido
            const out = tmpW.subVectors(P, G).setY(0).normalize().clone();
            const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(n % 2 ? -0.75 : 0.75);
            this.shot(7, (u, lt, pos, look) => {
              pos.copy(P).addScaledVector(out, lerp(1.9, 1.6, u)).add(side).setY(P.y + 1.8);
              look.set(G.x, G.y + lerp(1.7, 1.9, u), G.z);
            });
          } else {
            // los del lado del trono: de frente, desde su mismo costado (el
            // sombrero del vencido queda en el borde y no lo tapa)
            // (desde afuera de la ronda, por el costado: los de la alfombra quedan atrás)
            const sx = P.x < G.x ? -1 : 1;
            this.shot(7, (u, lt, pos, look) => {
              pos.set(G.x + sx * lerp(3.15, 2.95, u), G.y + lerp(1.95, 1.85, u), G.z + lerp(1.3, 1.1, u));
              look.set(P.x + sx * 0.1, P.y + 1.4, P.z);
            });
          }
          // el tercero habla y el vencido levanta la cabeza y se ríe, bajito
          if (n === 2) this.later(0.2, () => this.defiant());
          return this.knightSay(i, text);
        },
      ]),
      // 6. el sello
      [0.35, () => {
        this.defy = false;
        this.shot(13, (u, lt, pos, look) => {
          pos.set(G.x + lerp(-1.3, 1.3, smooth(u)), G.y + lerp(5.9, 4.9, u), G.z + lerp(5.9, 5, u));
          look.set(G.x, G.y + lerp(1.5, 2.2, u), G.z);
        });
        this.later(0.2, () => this.say('fierro', FIERRO[1]));
        this.knights.forEach((K, i) => {
          // (cada uno a su tiempo: el valiente primero, el viejo se toma su rato)
          this.later(0.1 + PERSONA_T[personaOf(i)].delay * 1.5, () => (K.raise = true));
          this.later(0.7 + i * 0.8, () => this.ignite(i));
        });
        this.later(3.9, () => this.formMate());
        this.later(4.8, () => this.suck());
        this.later(7.7, () => this.plug());
        this.later(9.1, () => this.lower());
        return 11.2;
      }],
      // de cerca: adentro del mate de piedra, dos puntitos colorados
      [0.1, () => {
        const M = this.mate.position;
        this.shot(8, (u, lt, pos, look) => {
          pos.set(M.x + lerp(1.2, 0.8, u), M.y + lerp(1.6, 1.45, u), M.z + lerp(1.9, 1.4, smooth(u)));
          look.set(M.x, M.y + 0.95, M.z);
        });
        this.later(1.4, () => {
          this.peekK = 0.001;
          chiquiGiggle(g.audio, { pos: this.mate.position, gain: 0.5, ref: 5, whisper: true });
        });
        return Math.max(6, this.say('fierro', FIERRO[2]));
      }],
      // 7. juran esconder los mates: se arrodillan y las cuatro luces se van
      [0.3, () => {
        this.shot(12, (u, lt, pos, look) => {
          pos.set(G.x + lerp(-3.2, -2.2, u), G.y + lerp(2.1, 2.6, u), G.z + lerp(6.2, 5, smooth(u)));
          look.set(G.x, G.y + lerp(0.9, 2.4, smooth(u)), G.z - lerp(0, 2, u));
        });
        this.knights.forEach((K, i) =>
          this.later(PERSONA_T[personaOf(i)].delay, () => {
            K.raise = false;
            K.kneel = true;
          }),
        );
        this.later(2.2, () => this.sendLights());
        this.choir(0.4, [45, 52, 57], { dur: 7, gain: 0.04, attack: 2, release: 3 });
        return this.say('fierro', L[3]);
      }],
      // 8. la cumbre, las tumbas
      [0.3, () => {
        this.whiteEl.style.transition = 'opacity 0.6s';
        this.white(true);
        this.later(0.6, () => {
          this.clearVision();
          this.white(false);
          this.swordOn = true;
        });
        this.shot(8, (u, lt, pos, look) => {
          pos.set(51.5 + lerp(-5, 5, smooth(u)), TOMBS[0].y + lerp(3.6, 3, u), 19.6);
          look.set(51.5 + lerp(-3.5, 3.5, smooth(u)), TOMBS[0].y + 0.9, 11);
        });
        this.later(1, () => this.bell(0, 57, { gain: 0.08, dur: 5 }));
        return 6.5;
      }],
      // 9. de vuelta al fogón
      [0.3, () => {
        this.swordOn = false;
        this.shot(12, (u, lt, pos, look) => {
          pos.set(F.x + lerp(-1.9, -1.5, u), F.y + 1.5, F.z + lerp(2.4, 2, u));
          look.set(F.x, F.y + 1.05, F.z);
        });
        return this.say('fierro', L[4]);
      }],
      [0.4, () => {
        this.quiet();
        this.card('Ahora les toca a ustedes. Templen los cuatro mates.', 4);
        return 4.2;
      }],
    ];
  }

  // ---------------- lo que se arma ----------------
  // El Chiquitijuein grande (el de antes de achicarse): rajaduras coloradas
  // que se prenden cuando está vencido.
  buildGiant(TH) {
    const g = this.g;
    const gn = buildChiqui(g.textures);
    gn.root.scale.setScalar(GIANT);
    gn.root.position.copy(TH).add(tmpV.set(0, 0.55, 0.35));
    gn.root.visible = false;
    const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.16, 0.04).multiplyScalar(2.4), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    let seed = 11;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cracks = [];
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2;
      const y = 0.32 + r() * 0.42;
      const rad = 0.245 + (0.78 - y) * 0.1;
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08 + r() * 0.14, 0.012), crackMat);
      c.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      c.rotation.set(r() - 0.5, -a, (r() - 0.5) * 1.6);
      gn.root.add(c);
      cracks.push(c);
    }
    // con el cuerpo de verdad: en el trono se frota las manos; las rajaduras
    // son grietas de fuego en la piel (y las de piezas se esconden)
    gn.idle = 'taunt';
    gn.auto = false;
    gn.onSkin(() => {
      this.giantEmber = chiquiEmber(gn);
      this.giantEmber.value = 0;
      for (const c of cracks) c.visible = false;
    });
    // el resplandor de adentro (sale por las rajaduras)
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    core.scale.setScalar(0.9);
    core.position.set(0, 0.55, 0.12);
    gn.root.add(core);
    this.root.add(gn.root);
    this.giant = gn;
    this.crackMat = crackMat;
    this.core = core;
    this.crack = 0;
  }

  // Los cuatro caballeros: brillan de su color, casi de humo.
  buildKnights(TH, G) {
    const g = this.g;
    this.people = new Avatars(g, null);
    this.knights = COLORS.map((c, i) => {
      const id = 20 + i;
      // la fila en la alfombra y su lugar en la ronda (esquinas alrededor)
      const pos = new THREE.Vector3(TH.x + [-2.4, -0.8, 0.8, 2.4][i], 0, TH.z + [5.4, 5.8, 5.8, 5.4][i]);
      pos.y = g.world.floorAt(pos.x, pos.z);
      // (cada uno a la esquina que no cruza el camino de otro: con la de su
      // índice, el del rayo y el del hielo se atravesaban a los 29 s)
      const a = [2.36, 0.79, -0.79, -2.36][[0, 3, 1, 2][i]];
      const ring = new THREE.Vector3(G.x + Math.cos(a) * 2.3, 0, G.z + Math.sin(a) * 2.3 + 0.3);
      ring.y = g.world.floorAt(ring.x, ring.z);
      // (ya mirando al trono, como cuando aparecen: si no, giraban de golpe al llegar)
      const r = { id, name: '', noTag: true, pos, yaw: Math.atan2(-(TH.x - pos.x), -(TH.z - pos.z)), pitch: -0.1, speed: 0, moving: false };
      this.people.add(r);
      const av = this.people.list.get(id);
      for (const m of Object.values(av.M)) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(c);
          m.emissiveIntensity = 0.6;
        }
      }
      av.M.poncho.color.set(c);
      if (av.tag) av.tag.visible = false;
      // en la mano, el mate de la luz de su elemento (no el de siempre)
      knightMate(this.people, av, MATE_OF[ELEMENTS[i]]);
      const K = { r, M: av.M, av, c, ring, k: 0, on: false, raise: false, kneel: false, lift: 0, bow: 0, walk: null };
      // la pose: el mate en alto o arrodillado
      r.poseFn = (P) => {
        if (K.lift > 0) {
          P.shRp = lerp(P.shRp, -2.85, K.lift);
          P.elR = lerp(P.elR, -0.12, K.lift);
          P.headP = lerp(P.headP, 0.3, K.lift);
        }
        if (K.bow > 0) {
          P.torsoP = lerp(P.torsoP, 0.55, K.bow);
          P.hipY = lerp(P.hipY, 0.55, K.bow);
          P.headP = lerp(P.headP, -0.5, K.bow);
        }
      };
      // la luz del mate que lleva en la mano
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(0.7);
      this.root.add(glow);
      K.glow = glow;
      return K;
    });
  }

  // El círculo del sello (cuatro cuartos, uno por color), los rayos de los
  // mates, el mate de piedra con su virola de oro y la bombilla-llave.
  buildSeal(G) {
    const g = this.g;
    const M = g.world.M;
    this.quarters = COLORS.map((c, i) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.35, 32, 1, (i / 4) * Math.PI * 2 + 0.06, Math.PI / 2 - 0.12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(G.x, G.y + 0.03, G.z);
      this.root.add(m);
      return m;
    });
    // el anillo de adentro, que se prende cuando se cierra
    this.inner = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.55, 48), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.inner.rotation.x = -Math.PI / 2;
    this.inner.position.set(G.x, G.y + 0.035, G.z);
    this.root.add(this.inner);
    this.beams = COLORS.map((c) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      b.visible = false;
      this.root.add(b);
      return b;
    });
    // el mate de piedra: una calabaza de piedra tallada
    const stone = M.castleStone || M.stone || new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: 0.3, metalness: 0.9, emissive: 0x3a2400, emissiveIntensity: 0.4 });
    const prof = [[0.02, 0], [0.3, 0.03], [0.52, 0.22], [0.6, 0.5], [0.53, 0.8], [0.36, 0.98], [0.25, 1.1], [0.23, 1.2], [0.27, 1.3], [0.22, 1.31]].map(([x, y]) => new THREE.Vector2(x, y));
    const mate = new THREE.Group();
    mate.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), stone));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.035, 8, 28), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.3;
    mate.add(rim);
    // las guardas talladas: cuatro fajas del color de cada caballero
    this.bands = COLORS.map((c, i) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.58 - Math.abs(i - 1.5) * 0.03, 0.018, 6, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.5), transparent: true, opacity: 0, toneMapped: false }));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.44 + i * 0.1;
      band.scale.setScalar(1 + (i === 0 || i === 3 ? -0.03 : 0.02));
      mate.add(band);
      return band;
    });
    mate.position.set(G.x, G.y + 2.4, G.z);
    mate.scale.setScalar(0.001);
    mate.visible = false;
    for (const o of mate.children) o.castShadow = true;
    this.root.add(mate);
    this.mate = mate;
    // la bombilla de oro, la llave
    const key = new THREE.Group();
    key.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 10), gold));
    const filt = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), gold);
    filt.scale.set(1, 0.45, 1);
    filt.position.y = -0.8;
    key.add(filt);
    const pico = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 10), gold);
    pico.position.set(0.07, 0.86, 0);
    pico.rotation.z = -0.8;
    key.add(pico);
    key.visible = false;
    this.root.add(key);
    this.key = key;
    // lo que brilla adentro de la boca del mate después
    this.peek = [-1, 1].map((s) => {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      e.scale.setScalar(0.1);
      e.userData.s = s;
      this.root.add(e);
      return e;
    });
    this.peekK = 0;
  }

  // ---------------- lo que pasa ----------------
  // Un caballero aparece en su columna de color.
  arrive(i) {
    const g = this.g;
    const K = this.knights[i];
    K.on = true;
    const p = tmpV.copy(K.r.pos).setY(K.r.pos.y + 1);
    g.fx.flash(p, K.c, 10, 0.6, 10);
    g.fx.sparkle(p, RGB[i], 14, 0.7);
    this.bell(0, [62, 66, 69, 74][i], { gain: 0.06, dur: 2.5 });
    K.r.yaw = Math.atan2(-(this.TH.x - K.r.pos.x), -(this.TH.z - K.r.pos.z));
  }

  // Un caballero le tira su elemento al del trono.
  strike(i, TH) {
    const g = this.g;
    const K = this.knights[i];
    const from = K.r.pos.clone().setY(K.r.pos.y + 1.4);
    const at = TH.clone().setY(TH.y + 1.6);
    this.giant.act('hit');
    if (i === 0) g.fx.fire(at, 0.9, 30);
    else if (i === 1) g.fx.blastCone(from, at.clone().sub(from).normalize(), 7);
    else if (i === 2) {
      g.fx.lightning(from, at, K.c, 0.35);
      g.audio.thunderCrack?.(at, { dur: 1.6, gain: 0.8 });
    } else g.fx.frost(at, 34);
    g.fx.explosion(at, 1.4, RGB[i]);
    g.fx.flash(at, K.c, 16, 0.5, 14);
    this.shake = 0.3;
    chiquiGlitch(g.audio, 0.35);
  }

  // Los cuatro a la vez: un rayo de cada color.
  together(TH) {
    const g = this.g;
    const at = TH.clone().setY(TH.y + 1.7);
    this.giant.act('scream', { at: 0.4 });
    this.knights.forEach((K) => g.fx.lightning(K.r.pos.clone().setY(K.r.pos.y + 1.4), at, K.c, 0.5));
    g.audio.thunder?.(at);
    g.fx.explosion(at, 2.4, [1, 0.9, 0.7]);
    g.fx.flash(at, 0xffffff, 30, 0.6, 18);
    g.post?.flash(0.35);
    this.shake = 0.6;
    this.bell(0, 50, { gain: 0.12, dur: 4 });
  }

  // Sale volando del trono y cae de rodillas en la alfombra.
  throwOff(TH, G) {
    const g = this.g;
    // (el de piezas se hunde para parecer arrodillado; el de verdad se arrodilla)
    this.fall = { t: 0, from: this.giant.root.position.clone(), to: G.clone().setY(G.y - (this.giant.skin ? 0 : 0.22 * GIANT)) };
    // (el de verdad no da la vuelta en el aire: grande, la cabeza hacía un
    // círculo enorme a toda velocidad; vuela agarrándose y cae)
    if (this.giant.skin) this.giant.act('hit', { at: 0.2, rate: 0.9 });
    chiquiGlitch(g.audio, 0.9);
  }

  // Los caballeros caminan a su lugar alrededor del vencido.
  walkTo(i, to, secs) {
    const K = this.knights[i];
    K.walk = { t: 0, secs, from: K.r.pos.clone(), to: to.clone() };
  }

  // Levanta la cabeza y se ríe despacito (no se rinde).
  defiant() {
    const g = this.g;
    this.defy = true;
    this.crack = Math.max(this.crack, 0.8);
    chiquiGiggle(g.audio, { pos: this.giant.root.position, gain: 0.9, ref: 8, pitch: 0.5 });
  }

  // Un cuarto del círculo se prende y su rayo sube al medio.
  ignite(i) {
    const g = this.g;
    const K = this.knights[i];
    K.beam = true;
    this.quarters[i].userData.on = true;
    const q = this.quarters[i].position;
    g.fx.sparkle(tmpV.set(q.x, q.y + 0.2, q.z), RGB[i], 20, 2.2);
    g.fx.flash(tmpV.set(q.x, q.y + 0.5, q.z), K.c, 12, 0.5, 10);
    this.bell(0, [57, 60, 64, 69][i], { gain: 0.1, dur: 4 });
  }

  // La luz de los cuatro se junta y hace el mate de piedra.
  formMate() {
    const g = this.g;
    this.mate.visible = true;
    this.mateK = 0.001;
    this.inner.userData.on = true;
    g.fx.flash(this.mate.position, 0xfff0c0, 20, 0.8, 14);
    this.choir(0, [50, 57, 62, 66], { dur: 6, gain: 0.05, attack: 1, release: 2 });
  }

  // El Chiquitijuein se achica y se mete adentro del mate.
  suck() {
    const g = this.g;
    this.shrink = { t: 0, from: this.giant.root.position.clone() };
    this.crack = 1;
    chiquiGlitch(g.audio, 1);
    g.audio.bossSlam?.(this.G);
    this.shake = 0.5;
  }

  // Entra la bombilla: la llave.
  plug() {
    const g = this.g;
    this.key.visible = true;
    this.keyK = 0.001;
  }

  // El mate baja al piso y queda quieto.
  lower() {
    this.drop = { t: 0, from: this.mate.position.y, to: this.G.y };
  }

  // Juran: las luces de los mates se van a esconderse (una para cada lado).
  sendLights() {
    const g = this.g;
    this.knights.forEach((K, i) => {
      const dir = [[-1, 0.8, 0.2], [0.2, 0.9, -1], [1, 0.8, 0.1], [0.1, 0.7, 1]][i];
      K.away = { t: 0, from: K.glow.position.clone(), dir: new THREE.Vector3(...dir).normalize() };
      this.bell(i * 0.35, [69, 72, 76, 81][i], { gain: 0.05, dur: 3 });
    });
    g.fx.sparkle(this.mate.position, [1, 0.95, 0.8], 20, 1);
  }

  clearVision() {
    this.giant.root.visible = false;
    this.mate.visible = false;
    this.key.visible = false;
    for (const e of this.peek) e.visible = false;
    for (const q of this.quarters) q.visible = false;
    this.inner.visible = false;
    for (const b of this.beams) b.visible = false;
    for (const K of this.knights) {
      K.on = false;
      K.k = 0;
      K.glow.visible = false;
      for (const m of Object.values(K.M)) m.opacity = 0;
    }
  }

  // Habla un caballero: su nombre, de su color, y la voz de cada uno.
  knightSay(i, text) {
    const K = KNIGHTS[i];
    const el = this.textEl;
    el.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${K.name}: `;
    b.style.color = K.css;
    el.append(b, document.createTextNode(text));
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    this.el.classList.remove('is-fierro');
    const d = this.g.audio.say(text, K.voice, { cine: true });
    // (la boca del que habla se mueve lo que dura: tick)
    const Kn = this.knights[i];
    if (Kn) Kn.talk = d || text.length * 0.065;
    return (d || text.length * 0.065) + 0.5;
  }

  // Los cuerpos animados en Blender (ui/castleClips.js), cada uno con su
  // carácter: hablando, con el mate en alto o arrodillados jurando. Caminando,
  // el paso de siempre (clips.json 'walk') al ritmo de lo que avanzan: con el
  // de piezas patinaban. Ya apagados vuelven a la pose de piezas.
  knightClips(dt) {
    const C = (this.clips ||= new CastleClips());
    this.knights.forEach((K, i) => {
      const L = personaLetter(i);
      const talking = K.mouth && K.mouth.t < K.mouth.dur;
      const W = K.walk;
      // (al llegar giran en el lugar hacia el del medio: dando pasitos, no pivotando sobre los pies)
      let turn = 0;
      if (K.on && !W && !K.kneel && !K.raise && !talking && K.r.cc?.name === 'walk') {
        const tgt = this.beaten ? this.G : this.TH;
        turn = Math.atan2(-(tgt.x - K.r.pos.x), -(tgt.z - K.r.pos.z)) - K.r.yaw;
        turn = Math.abs(turn - Math.round(turn / (Math.PI * 2)) * Math.PI * 2);
      }
      const want = !K.on ? null : W || turn > 0.12 ? 'walk' : K.kneel ? 'kneelOath' : K.raise ? `raise${L}` : talking ? `talk${L}` : null;
      if (want) C.act(K.r, [K.av], want, { fade: want === 'kneelOath' ? 0.9 : want === 'walk' ? 0.3 : 0.55, t: want === 'walk' ? 0 : i * 0.37, rate: want === 'walk' ? 0 : 1, ...(want === 'walk' ? { loop: true } : {}) });
      // (del paso a quieto, despacio: con 0,7 s los pies se corrían de golpe)
      else C.release(K.r, K.r.cc?.name === 'walk' ? 1.3 : 0.7, [K.av]);
      if (want === 'walk' && !W && K.r.cc?.c?.speed) C.rate(K.r, Math.min(0.8, 0.3 + turn));
      else if (want === 'walk' && K.r.cc?.c?.speed) {
        // (lo que avanza este cuadro: el camino va con arranque y frenada suaves)
        const u = Math.min(1, W.t + dt / W.secs);
        const v = (W.from.distanceTo(W.to) * 6 * u * (1 - u)) / W.secs;
        C.rate(K.r, Math.min(2.2, v / K.r.cc.c.speed));
      }
    });
    C.update(dt);
  }

  // ---------------- cada cuadro ----------------
  tick(dt) {
    const g = this.g;
    const t = this.t;
    const gn = this.giant;
    gn.update(dt, g.time);
    this.people.update(dt);
    this.knightClips(dt);
    for (const K of this.knights) uprightMate(K.av, smooth(K.lift), K.r.yaw);
    const G = this.G;
    // los caballeros: aparecen, caminan, levantan el mate, se arrodillan
    for (const K of this.knights) {
      if (K.on) K.k = Math.min(1, K.k + dt / 1.2);
      for (const m of Object.values(K.M)) m.opacity = K.k * (0.5 + Math.sin(t * 3 + K.c) * 0.07);
      // la boca (cuando el cuerpo de verdad ya está) y lo que dice
      if (!K.mouth && K.k > 0) K.mouth = knightMouth(K.av, this.root, { color: 0x140604 });
      if (K.mouth && K.talk) {
        K.mouth.talk(K.talk);
        K.talk = 0;
      }
      K.mouth?.update(dt, K.k * 0.8);
      const W = K.walk;
      if (W) {
        W.t = Math.min(1, W.t + dt / W.secs);
        K.r.pos.lerpVectors(W.from, W.to, smooth(W.t));
        K.r.moving = W.t < 1;
        K.r.speed = W.t < 1 ? 1.4 : 0;
        if (W.t >= 1) K.walk = null;
      }
      // miran al del medio (o a donde está); caminando, para donde van (de
      // costado, con el paso por lo que avanzan, patinaban) y al llegar giran
      const tgt = this.beaten ? G : this.TH;
      if (K.on) {
        const Wk = K.walk;
        const want = Wk ? Math.atan2(-(Wk.to.x - Wk.from.x), -(Wk.to.z - Wk.from.z)) : Math.atan2(-(tgt.x - K.r.pos.x), -(tgt.z - K.r.pos.z));
        let d = want - K.r.yaw;
        d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        // (a lo sumo ~10° por cuadro: daban media vuelta en tres cuadros al
        // salir a caminar; cada uno con su ritmo, ui/cineCrew PERSONA_T)
        const turn = PERSONA_T[personaOf(this.knights.indexOf(K))].turn;
        K.r.yaw += Math.max(-dt * 5.5, Math.min(dt * 5.5, d * Math.min(1, dt * (2 + turn * 1.6))));
      }
      K.lift += ((K.raise ? 1 : 0) - K.lift) * Math.min(1, dt * 3);
      K.bow += ((K.kneel ? 1 : 0) - K.bow) * Math.min(1, dt * 2.5);
      K.r.crouch = K.bow > 0.5;
      // la luz del mate en la mano
      if (!K.away) {
        K.glow.position.setFromMatrixPosition(K.av.hand.matrixWorld);
        K.glow.material.opacity = K.k * (0.25 + K.lift * 0.75) * (0.85 + Math.sin(t * 7 + K.c) * 0.15);
        K.glow.scale.setScalar(0.5 + K.lift * 0.6);
      } else {
        const A = K.away;
        A.t = Math.min(1, A.t + dt / 3.5);
        K.glow.position.copy(A.from).addScaledVector(A.dir, smooth(A.t) * 14);
        K.glow.material.opacity = (1 - A.t) * 0.9;
        if (Math.random() < dt * 30) g.fx.sparkle(K.glow.position, RGB[this.knights.indexOf(K)], 1, 0.2);
      }
    }
    // del trono a la alfombra, dando vueltas; cae de rodillas
    const Fl = this.fall;
    if (Fl && Fl.t < 1) {
      Fl.t = Math.min(1, Fl.t + dt / 0.9);
      const p = gn.root.position.lerpVectors(Fl.from, Fl.to, Fl.t);
      p.y += Math.sin(Fl.t * Math.PI) * 1.4;
      gn.root.rotation.x = gn.skin ? Math.sin(Fl.t * Math.PI) * -0.25 : Fl.t * Math.PI * 2 + Fl.t * 0.32;
      if (Fl.t >= 1) {
        gn.halo.material.opacity = 0.2;
        gn.eyeK = 1;
        gn.root.rotation.x = gn.skin ? 0 : 0.32;
        gn.head.rotation.x = 0.45;
        for (const a of gn.arms) a.rotation.x = -0.75;
        // (el de verdad: de rodilla, quieto)
        gn.act('kneel', { at: 0.25, rate: 0, hold: true });
        this.crack = 0.55;
        g.fx.dust(tmpV.copy(G).setY(G.y + 0.1), UP, [0.45, 0.4, 0.35], 26);
        g.fx.explosion(tmpV.copy(G).setY(G.y + 0.2), 1.2, [0.35, 0.05, 0.03]);
        g.audio.bossSlam?.(G);
        this.shake = 0.8;
      }
    }
    // levanta la cabeza para reírse y la vuelve a bajar
    if (this.beaten && !this.shrink) gn.head.rotation.x += ((this.defy ? -0.25 : 0.45) - gn.head.rotation.x) * Math.min(1, dt * 2);
    // vencido: las rajaduras laten y se le va la oscuridad
    const beat = this.crack * (0.7 + 0.3 * Math.sin(t * 5));
    this.crackMat.opacity = beat;
    // (en el trono ya se le ven las brasas, apenas: si no, a contraluz era una sombra)
    if (this.giantEmber) this.giantEmber.value = Math.max(beat * 1.3, this.beaten ? 0 : 0.4);
    this.core.material.opacity = beat * 0.8;
    this.core.scale.setScalar(0.9 + beat * 0.6);
    if (this.beaten && gn.root.visible && !this.shrink) {
      const s = gn.root.scale.x;
      if (Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * 0.3 * s;
        g.fx.alpha.spawn(G.x + Math.cos(a) * rr, G.y + 0.4 + Math.random() * 1.6, G.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, { color: [0.06, 0.02, 0.02], size: 0.35, size1: 1.5, life: 1.6 + Math.random(), alpha: 0.45, drag: 0.5 });
      }
      if (Math.random() < dt * 14) g.fx.sparkle(tmpV.set(G.x + (Math.random() - 0.5) * 1.2, G.y + 0.5 + Math.random() * 1.5, G.z + (Math.random() - 0.5) * 1.2), [1, 0.2, 0.05], 1, 0.2);
    }
    // el sello: los cuartos del círculo y los rayos de los mates
    this.quarters.forEach((q, i) => {
      const on = q.userData.on ? 1 : 0;
      q.material.opacity += (on * (0.75 + Math.sin(t * 6 + i) * 0.15) * (this.sealed ? 0.25 : 1) - q.material.opacity) * Math.min(1, dt * 4);
    });
    this.inner.material.opacity += ((this.inner.userData.on ? (this.sealed ? 0.2 : 0.8) : 0) - this.inner.material.opacity) * Math.min(1, dt * 3);
    const focus = tmpW.copy(this.mate.position).setY(this.mate.position.y + 0.65);
    this.knights.forEach((K, i) => {
      const b = this.beams[i];
      b.visible = !!K.beam && !this.sealed;
      if (!b.visible) return;
      const from = K.glow.position;
      b.position.addVectors(from, focus).multiplyScalar(0.5);
      tmpV.subVectors(focus, from);
      b.scale.set(1 + Math.sin(t * 20 + i) * 0.25, tmpV.length(), 1 + Math.sin(t * 20 + i) * 0.25);
      b.quaternion.setFromUnitVectors(UP, tmpV.normalize());
      b.material.opacity = 0.75;
      if (Math.random() < dt * 20) g.fx.sparkle(from, RGB[i], 1, 0.15);
    });
    // el mate de piedra crece de la luz
    if (this.mateK > 0 && this.mateK < 1) {
      this.mateK = Math.min(1, this.mateK + dt / 1.3);
      this.mate.scale.setScalar(smooth(this.mateK));
      this.mate.rotation.y += dt * 1.5;
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        g.fx.sparkle(tmpV.set(this.mate.position.x + Math.cos(a) * 1.4, this.mate.position.y + Math.random() * 1.3, this.mate.position.z + Math.sin(a) * 1.4), [1, 0.95, 0.8], 1, 0.2);
      }
    }
    this.bands.forEach((b, i) => {
      b.material.opacity = this.mateK > 0 ? (this.sealed ? 0.55 : 0.9) * Math.min(1, this.mateK * 1.5) * (0.8 + Math.sin(t * 4 + i) * 0.2) : 0;
    });
    // se achica y entra por la boca del mate, en espiral, soltando humo
    const S = this.shrink;
    if (S && S.t < 1) {
      S.t = Math.min(1, S.t + dt / 2.6);
      const k = S.t * S.t;
      const mouth = tmpV.copy(this.mate.position).setY(this.mate.position.y + 1.3 * this.mate.scale.y);
      const sp = (1 - k) * 0.9;
      gn.root.position.lerpVectors(S.from, mouth, k);
      gn.root.position.x += Math.cos(t * 9) * sp;
      gn.root.position.z += Math.sin(t * 9) * sp;
      gn.root.scale.setScalar(Math.max(0.02, GIANT * (1 - k) * (1 - k) + 0.05));
      gn.root.rotation.y += dt * (4 + k * 18);
      for (let n = 0; n < 3; n++) g.fx.alpha.spawn(gn.root.position.x, gn.root.position.y + 0.3, gn.root.position.z, (mouth.x - gn.root.position.x) * 2, (mouth.y - gn.root.position.y) * 2 + 0.5, (mouth.z - gn.root.position.z) * 2, { color: [0.05, 0.01, 0.01], size: 0.3, size1: 0.1, life: 0.5, alpha: 0.6, drag: 0.2 });
      if (S.t >= 1) {
        gn.root.visible = false;
        g.fx.flash(mouth, 0xff2a10, 14, 0.4, 10);
      }
    }
    // la bombilla baja y entra; al tocar, se cierra el sello
    if (this.keyK > 0 && this.keyK < 1) {
      this.keyK = Math.min(1, this.keyK + dt / 0.9);
      const M = this.mate.position;
      this.key.position.set(M.x + 0.08, M.y + 1.3 + 0.8 - 0.55 + (1 - this.keyK * this.keyK) * 2.4, M.z);
      this.key.rotation.z = 0.12;
      if (this.keyK >= 1) {
        this.sealed = true;
        const top = tmpV.set(M.x, M.y + 1.35, M.z);
        g.fx.flash(top, 0xfff4d0, 40, 0.8, 20);
        g.fx.sparkle(top, [1, 0.9, 0.6], 40, 1.2);
        g.post?.flash(0.55);
        this.shake = 0.7;
        this.bell(0, 45, { gain: 0.2, dur: 6 });
        this.bell(0.02, 57, { gain: 0.12, dur: 5 });
        this.choir(0.1, [45, 52, 57, 64], { dur: 5, gain: 0.06, attack: 0.2, release: 3 });
      }
    }
    // el mate baja al piso: un golpe seco
    const D = this.drop;
    if (D && D.t < 1) {
      D.t = Math.min(1, D.t + dt / 1.3);
      const y = lerp(D.from, D.to, smooth(D.t));
      const dy = y - this.mate.position.y;
      this.mate.position.y = y;
      this.key.position.y += dy;
      this.mate.rotation.y *= 1 - Math.min(1, dt * 2);
      if (D.t >= 1) {
        g.fx.dust(tmpV.copy(this.mate.position).setY(D.to + 0.05), UP, [0.5, 0.46, 0.42], 20);
        g.audio.bossSlam?.(this.mate.position);
        this.shake = 0.5;
      }
    }
    // adentro de la boca: dos puntitos que se prenden despacio
    if (this.peekK > 0) {
      this.peekK = Math.min(1, this.peekK + dt / 2);
      const M = this.mate.position;
      for (const e of this.peek) {
        e.visible = true;
        e.position.set(M.x + e.userData.s * 0.05, M.y + 1.16, M.z + 0.06);
        const blink = Math.sin(t * 1.9) > 0.97 ? 0 : 1;
        e.material.opacity = this.peekK * blink * (0.8 + Math.sin(t * 8) * 0.15);
      }
    }
    // las espadas de la cumbre se prenden de a una
    this.swordK = this.swordOn ? Math.min(4, this.swordK + dt * 0.9) : Math.max(0, this.swordK - dt * 2);
    this.swords.forEach((s, i) => {
      s.material.opacity = Math.max(0, Math.min(1, this.swordK - i)) * (0.7 + Math.sin(t * 4 + i) * 0.15);
    });
  }

  cleanup() {
    const g = this.g;
    for (const K of this.knights || []) K.mouth?.dispose();
    this.people?.root.removeFromParent();
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    g.hud.show(true);
    g.player.updateCamera?.(g.camera);
  }
}
