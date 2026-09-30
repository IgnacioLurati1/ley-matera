import * as THREE from 'three';
import { EE } from '../config/map';
import { zombieHealth, maxAlive } from '../config/rules';
import { mesh, boxGeo, cylGeo } from '../world/props';
import { sndBell, sndCreak } from './towerKit';

// Las Campanas de las Ánimas: el paso del easter egg de la torre que llena de
// pólvora el cañón (antes era el encierro). Tres campanas (EE.campanas), en
// orden: la de la cima, la del patio del 10 y la de la plaza del 5 (esas dos
// cuelgan en el hueco del medio: se les tira también desde los pisos de
// arriba). Es una carrera para abajo:
//  · la que toca brilla; un tiro y queda repicando;
//  · desde ahí hay WIN segundos para darle a la siguiente (el anillo de luz
//    de la que sigue se achica y el repique se apura al final);
//  · si no llegan, se callan todas y se empieza de nuevo desde la cima;
//  · mientras suenan, el remolino trae muertos volando (towerKit flyIn).
// Con la tercera a tiempo quedan las tres de oro y la Voz manda el alma
// pesada (TowerEgg.bellsDone).
// En línea: el anfitrión lleva la cuenta; los tiros del invitado le llegan
// ('pee' a: 'bell') y lo que se ve va en 'pee' bell [idx, left, 0, hit]
// (hit: la que sonó; -1 quedaron de oro; -2 se callaron).

// segundos para llegarle a la siguiente: bajar cinco pisos corriendo (o
// tirarle por el agujero desde más arriba)
const WIN = 40;
// cada cuánto el remolino trae uno (más seguido con más jugadores)
const FLY_EVERY = 2.1;
const NOTES = [50, 45, 38];
const BRONZE = 0xc8923a;
const GOLD = 0xffd070;

const tmpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export default class TowerBells {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    this.T = ee.T;
    this.root = new THREE.Group();
    this.g.scene.add(this.root);
    // idx: la que toca (las de antes están repicando; 3: todas de oro);
    // left: lo que queda para darle (s)
    this.idx = 0;
    this.left = 0;
    this.shown = false;
    this.flyT = 1;
    this.netT = 0;
    this.list = (EE.campanas || []).map((def, i) => this.build(def, i));
  }

  // ---------------- la campana ----------------
  build(def, i) {
    const g = this.g;
    const M = g.world.M;
    const [x, z] = def.pos;
    const top = def.top;
    const mat = new THREE.MeshStandardMaterial({ color: BRONZE, roughness: 0.32, metalness: 0.9, emissive: GOLD, emissiveIntensity: 0 });
    // el perfil de una campana de verdad: hombro, cintura, labio que se abre
    const prof = [[0, 0], [0.2, 0], [0.26, -0.06], [0.3, -0.25], [0.33, -0.55], [0.4, -0.8], [0.55, -0.98], [0.58, -1.05], [0.54, -1.06], [0.47, -1.0], [0.35, -0.82], [0.28, -0.55], [0.24, -0.25], [0.18, -0.08], [0, -0.06]];
    const bellGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    // pivote en el yugo: la campana cuelga y se hamaca
    const pivot = new THREE.Group();
    pivot.position.set(x, top, z);
    const bell = new THREE.Mesh(bellGeo, mat);
    bell.position.y = -0.18;
    bell.castShadow = true;
    pivot.add(bell);
    // la corona y el yugo de madera con herrajes
    pivot.add(mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12), mat, 0, -0.12, 0, 0, Math.PI / 2, 0));
    pivot.add(mesh(boxGeo(1.5, 0.2, 0.22), M.woodDark, 0, 0, 0));
    for (const s of [-1, 1]) pivot.add(mesh(boxGeo(0.06, 0.3, 0.26), M.iron, s * 0.25, -0.05, 0));
    // el badajo
    const clap = new THREE.Group();
    clap.position.y = -0.3;
    clap.add(mesh(cylGeo(0.025, 0.025, 0.7, 6), M.iron, 0, -0.35, 0));
    clap.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), M.iron, 0, -0.72, 0));
    pivot.add(clap);
    // el brillo: la que toca, el anillo que se achica y la de oro
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: GOLD, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    halo.scale.setScalar(3.2);
    halo.position.set(x, top - 0.7, z);
    const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 48), ringMat);
    ring.position.set(x, top - 1.15, z);
    ring.rotation.x = Math.PI / 2;
    this.root.add(pivot, halo, ring);
    const extra = new THREE.Group();
    if (def.frame) {
      // el campanario de palo de la cima: dos postes, el travesaño y un techito
      const y0 = this.T.yOf(def.n - 1);
      const H = top - y0 + 0.2;
      for (const s of [-1, 1]) {
        extra.add(mesh(boxGeo(0.24, H, 0.24), M.woodDark, x + s * 1.05, y0 + H / 2, z));
        extra.add(mesh(boxGeo(0.5, 0.12, 0.7), M.woodDark, x + s * 1.05, y0 + 0.06, z, 0, 0, 0));
        extra.add(mesh(boxGeo(0.12, 1.1, 0.12), M.woodDark, x + s * 0.8, y0 + H - 0.55, z, 0, 0, s * 0.6));
        g.world.addBox([x + s * 1.05 - 0.2, y0, z - 0.2, x + s * 1.05 + 0.2, y0 + H, z + 0.2], { kind: 'prop' });
      }
      extra.add(mesh(boxGeo(2.6, 0.22, 0.3), M.woodDark, x, top + 0.12, z));
      for (const s of [-1, 1]) extra.add(mesh(boxGeo(2.9, 0.06, 0.95), M.woodDark, x, top + 0.55, z + s * 0.4, s * 0.45, 0, 0));
    } else {
      // colgada con cuatro cadenas de las esquinas del agujero del piso de arriba
      const [h0, h1, h2, h3] = this.T.T.hole;
      const ay = top + 0.4;
      for (const [cx, cz] of [[h0, h1], [h2 + 1, h1], [h0, h3 + 1], [h2 + 1, h3 + 1]]) {
        const a = new THREE.Vector3(cx, ay, cz);
        const b = new THREE.Vector3(x + Math.sign(cx - x) * 0.6, top, z + Math.sign(cz - z) * 0.08);
        const len = a.distanceTo(b);
        const ch = mesh(cylGeo(0.03, 0.03, len, 5), M.iron, 0, 0, 0);
        ch.position.copy(a).add(b).multiplyScalar(0.5);
        ch.quaternion.setFromUnitVectors(UP, tmpV.subVectors(b, a).normalize());
        extra.add(ch);
      }
    }
    this.root.add(extra);
    const B = { i, def, pivot, bell, mat, clap, halo, ring, ringMat, extra, top, pos: new THREE.Vector3(x, top - 0.65, z), ang: 0, vel: 0, cang: 0, cvel: 0, drop: 0 };
    this.setShown(B, false);
    return B;
  }

  setShown(B, on) {
    B.pivot.visible = on;
    B.halo.visible = on;
    B.ring.visible = on;
    // el campanario queda siempre (en la cima se ve de entrada); las cadenas, con la campana
    if (!B.def.frame) B.extra.visible = on;
  }

  // (todas) El cañón quedó armado: bajan las campanas.
  show() {
    if (this.shown) return;
    this.shown = true;
    for (const B of this.list) {
      this.setShown(B, true);
      B.drop = 1;
      sndCreak(this.g, B.pos, 2.2);
    }
  }

  // ---------------- los tiros ----------------
  onShot(o, d, maxT) {
    if (!this.shown || this.idx >= this.list.length) return;
    for (const B of this.list) {
      if (B.drop > 0.05) continue;
      const t = raySphere(o, d, B.pos, 0.62);
      if (t !== null && t <= maxT + 0.4) {
        this.hit(B.i);
        return;
      }
    }
  }

  onExplosion(pos, radius) {
    if (!this.shown || this.idx >= this.list.length) return;
    const B = this.list[this.idx];
    if (B.pos.distanceTo(pos) < Math.max(2, radius * 0.8)) this.hit(B.i);
  }

  hit(i) {
    const g = this.g;
    // (se ve y se oye en seguida en el que tiró)
    this.clang(i, true);
    if (g.net?.guest) g.net.net.send({ t: 'pee', a: 'bell', i });
    else this.ring(i);
  }

  // (anfitrión) Le pegaron a la campana i: si es la que toca, suena y corre
  // el tiempo para la siguiente.
  ring(i) {
    const g = this.g;
    if (i !== this.idx || this.idx >= this.list.length || this.ee.step !== 3) return;
    // (el tiro de un invitado: acá también se oye)
    this.clang(i);
    this.idx++;
    if (this.idx >= this.list.length) {
      this.complete();
      return;
    }
    this.left = WIN;
    this.flyT = 1;
    g.net?.event('pee', { bell: [this.idx, WIN, 0, i] });
    this.ee.bellNext(this.idx);
  }

  // El golpe: se hamaca, suena y larga el anillo (todas las compus; `mine`: el que tiró).
  clang(i, mine = false) {
    const g = this.g;
    const B = this.list[i];
    if (!B) return;
    // (una ráfaga de tiros no es una ráfaga de campanadas; y al que tiró le
    // llega de vuelta el aviso del anfitrión)
    if (B.lastClang && g.time - B.lastClang < (mine ? 0.3 : 0.6)) return;
    B.lastClang = g.time;
    B.vel += (Math.random() < 0.5 ? -1 : 1) * 1.6;
    const on = i === this.idx;
    sndBell(g, B.pos, NOTES[i] ?? 45, on ? 0.9 : 0.35, on ? 7 : 2.5);
    if (on) {
      g.fx.sparkle(B.pos, [1, 0.85, 0.45], 16, 1.4);
      B.wave = 0;
    }
  }

  // ¿Están sonando (corre el tiempo para la siguiente)?
  racing() {
    return this.shown && this.ee.step === 3 && this.idx > 0 && this.idx < this.list.length;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = g.time;
    const host = !g.net?.guest;
    const racing = this.racing();
    if (racing) {
      // (el invitado también la baja, entre aviso y aviso)
      this.left = Math.max(0, this.left - dt);
      if (host) {
        // mientras suenan, el remolino trae muertos
        this.flyT -= dt;
        if (this.flyT <= 0) {
          this.flyT = FLY_EVERY / Math.sqrt(this.ee.players());
          this.bringOne();
        }
        if (this.left <= 0) this.fail();
        else if ((this.netT -= dt) <= 0) {
          this.netT = 1;
          g.net?.event('pee', { bell: [this.idx, +this.left.toFixed(2), 0] });
        }
      }
    }
    if (!this.shown) return;
    // (1 recién tocada, 0 se acaba el tiempo)
    const hurry = racing ? this.left / WIN : 1;
    for (const B of this.list) {
      // baja desde lo oscuro
      if (B.drop > 0) {
        B.drop = Math.max(0, B.drop - dt / 2.6);
        const k = B.drop * B.drop;
        B.pivot.position.y = B.top + k * 3;
        B.extra.position.y = B.def.frame ? 0 : k * 3;
      }
      // se hamaca (péndulo con freno) y el badajo va atrasado
      B.vel += (-9 * Math.sin(B.ang) - 0.9 * B.vel) * dt;
      B.ang += B.vel * dt;
      B.cvel += (-14 * Math.sin(B.cang - B.ang * 0.4) - 1.6 * B.cvel) * dt;
      B.cang += B.cvel * dt;
      B.pivot.rotation.x = B.ang;
      B.clap.rotation.x = B.cang - B.ang;
      const done = this.idx >= this.list.length;
      const now = !done && B.i === this.idx && this.ee.step === 3;
      const ringing = racing && B.i < this.idx;
      // la que ya sonó repica sola, cada vez más apurada
      if (ringing) {
        B.rep = (B.rep ?? 0) - dt;
        if (B.rep <= 0) {
          B.rep = 0.45 + hurry * 0.8;
          B.vel += (B.ang >= 0 ? -1 : 1) * 0.9;
          sndBell(g, B.pos, NOTES[B.i] ?? 45, 0.45, 4);
          B.wave = 0;
        }
      }
      B.mat.color.setHex(done ? GOLD : BRONZE);
      B.mat.emissiveIntensity = done ? 0.55 + Math.sin(t * 2) * 0.1 : ringing ? 0.3 + Math.max(0, Math.sin(t * 6)) * 0.2 : now ? 0.1 + Math.max(0, Math.sin(t * 3)) * 0.12 : 0;
      B.halo.material.opacity = done ? 0.35 : ringing ? 0.45 : now ? 0.3 + Math.sin(t * 4) * 0.08 : 0;
      // el anillo de la que sigue: el tiempo que queda (se achica); sin
      // carrera, late para que se note cuál es
      const r = now ? (racing ? 0.35 + hurry * 1.4 : 1.2 + Math.sin(t * 5) * 0.12) : 0;
      B.ring.visible = now;
      B.ring.scale.setScalar(Math.max(0.01, r));
      B.ringMat.opacity = now ? (racing ? 0.4 + (hurry < 0.25 ? Math.abs(Math.sin(t * 16)) * 0.5 : 0.2) : 0.25) : 0;
      // la onda de sonido que sale
      if (B.wave != null) {
        B.wave += dt;
        if (B.wave < 0.9 && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const rr = 0.8 + B.wave * 6;
          g.fx.add.spawn(B.pos.x + Math.cos(a) * rr, B.pos.y - 0.3, B.pos.z + Math.sin(a) * rr, Math.cos(a) * 3, 0, Math.sin(a) * 3, { color: [1, 0.85, 0.45], size: 0.1, size1: 0, life: 0.5 });
        } else if (B.wave >= 0.9) B.wave = null;
      }
      // la que ya quedó de oro larga almas para arriba, hacia el cañón
      if (done && Math.random() < 0.08) g.fx.add.spawn(B.pos.x, B.pos.y, B.pos.z, (Math.random() - 0.5) * 0.4, 2 + Math.random(), (Math.random() - 0.5) * 0.4, { color: [1, 0.8, 0.4], size: 0.12, size1: 0, life: 2 });
    }
  }

  // (anfitrión) Un muerto que llega volando al piso de algún jugador.
  bringOne() {
    const g = this.g;
    const players = this.ee.players();
    if (g.zombies.alive >= maxAlive(players)) return;
    const ref = g.zombies.spawnRef();
    const fy = this.T.yOf(this.T.levelOf(ref.pos.y));
    const round = Math.max(6, g.rounds.round);
    this.ee.flyers.bring(fy, ref.pos, round, zombieHealth(round));
  }

  // (anfitrión) Llegaron a la última: las tres de oro.
  complete() {
    const g = this.g;
    this.idx = this.list.length;
    this.left = 0;
    this.gildAll();
    g.net?.event('pee', { bell: [this.idx, 0, 0, -1] });
    this.ee.bellsDone();
    this.ee.netSync();
  }

  // (anfitrión) No llegaron: se callan todas y vuelta a la cima.
  fail() {
    const g = this.g;
    this.silence();
    this.idx = 0;
    this.left = 0;
    g.net?.event('pee', { bell: [0, 0, 0, -2] });
    this.ee.announce('Se callaron. De nuevo, desde la cima', 4, true);
    this.ee.netSync();
  }

  // Se callan las que sonaban (todas las compus): un golpe sordo y se frenan.
  silence() {
    for (const B of this.list) {
      if (B.i >= this.idx) continue;
      B.vel *= 0.25;
      B.rep = null;
      sndBell(this.g, B.pos, (NOTES[B.i] ?? 45) - 5, 0.3, 1.2);
    }
  }

  // De oro de abajo para arriba (todas las compus).
  gildAll() {
    [...this.list].reverse().forEach((B, k) => this.g.later(k * 0.6, () => this.gild(B)));
  }

  // Queda de oro (todas las compus): tres campanadas y una columna de almas.
  gild(B) {
    const g = this.g;
    if (!B) return;
    for (let k = 0; k < 3; k++) g.later(k * 0.9, () => sndBell(g, B.pos, NOTES[B.i] ?? 45, 1, 8));
    g.fx.sparkle(B.pos, [1, 0.85, 0.45], 70, 2.2);
    g.fx.flash(B.pos, 0xffd070, 30, 0.6, 18);
    for (let k = 0; k < 8; k++) g.fx.soul(B.pos.clone().setY(B.pos.y - 1), this.ee.cannon.pos, [1, 0.8, 0.35]);
    g.post?.flash(0.25);
  }

  applyRemote(m) {
    const [idx, left, , hit] = m.bell;
    if (hit === -2) {
      if (this.racing()) this.silence();
      this.idx = 0;
      this.left = 0;
      return;
    }
    if (idx >= this.list.length) {
      if (this.idx < this.list.length) this.gildAll();
      this.idx = idx;
      this.left = 0;
      return;
    }
    if (hit != null && hit >= 0) this.clang(hit);
    this.idx = idx;
    this.left = left;
  }

  fullState() {
    return [this.idx, +this.left.toFixed(2), this.shown ? 1 : 0];
  }

  applyState(s) {
    if (!Array.isArray(s)) return;
    if (s[2] && !this.shown) this.show();
    this.idx = s[0] | 0;
    this.left = s[1] || 0;
  }

  // (Alt+K y los que entran tarde) Todas de oro.
  finish() {
    this.show();
    this.idx = this.list.length;
    this.left = 0;
    for (const B of this.list) B.drop = 0;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t < 0 ? null : t;
}
