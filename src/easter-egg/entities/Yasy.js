import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EE } from '../config/map';
import '../ui/yasy.css';

// Los Yasy (La Tapera, adentro del matorral: entities/Matorral.js). El Yasy
// Yateré es el duende guaraní de la siesta: petiso, rubio, desnudo, con un
// bastón de oro. Acá son una cría de bichos feos (como los de Tranzit, el
// pedido del usuario 2026-09-28): salen de la tierra cuando hay alguien en el
// matorral, corren, se tiran a la cara y arañan. Se sacan con el cuchillo (V)
// o con un tajo de la hoz; en el piso se matan de un tiro.
// El Yasy dorado (el del bastón) se esconde en un claro y silba: si uno se
// acerca, se ríe y se muda de claro (dos veces); a la tercera se tira encima.
// Las balas no le hacen nada: se lo baja a cuchillo o con la hoz (en el piso
// o sacándoselo de la cara) y deja el bastón de oro. El que lo agarra tiene la
// hoz de oro (hozBaston: tajo más ancho, la medialuna le pega más al jefe
// final) y el matorral se prende fuego (Matorral.ignite).
// La primera vez que alguien se cruza uno, la Voz de Arriba dice lo suyo.
// Para las armas son "zombies" más (raycast e inRadius de Zombies los
// devuelven y el daño pasa por acá), pero no cuentan para la ronda. En línea
// los mueve el anfitrión y reparte dónde están ('yasy' {k:'l'}); el invitado
// avisa cuando se saca uno de la cara ({k:'off'}) o agarra el bastón ({k:'take'}).

export const YASY_ID = 0xfe00;
const NORMAL = 6;
const GOLD = NORMAL;
const SLOTS = NORMAL + 1;
const SPEED = 5.2;
const GOLD_SPEED = 7.4;
// salto: desde qué distancia, cuánto dura y hasta dónde agarra al llegar
const LEAP_AT = 2.4;
const LEAP_T = 0.42;
const LEAP_GRAB = 1.6;
// agarrado: cada cuánto araña y cuánto saca
const SCRATCH_EVERY = 1.1;
const SCRATCH = 12;
const RISE = 0.6;
const POINTS = 50;
const GOLD_POINTS = 500;
// el dorado: a qué distancia se asusta y cuántas veces se muda antes de pelear
const GOLD_NEAR = 6.5;
const GOLD_FLEES = 2;
// a qué distancia "se cruza" uno por primera vez (para la Voz)
const SEE = 10;
const LINE = 'Qué feos que son, me recuerdan a cuando era joven.';
// el de la cara (en la escena de la mano): dónde, cuánto se inclina y cómo
// agarra (hombros, codos)
const FACE = { y: -0.6, z: -0.44, s: 0.8, rx: 0, bx: 0, hx: -0.1, ax: 0.55, az: 2.45, ex: -0.4, ez: 0.9, flip: 0 };
export const YASY_FACE = FACE;
const STATES = ['off', 'rise', 'run', 'leap', 'latch', 'dead', 'hide', 'flee', 'sink'];

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

// La hoz con el bastón de oro (Weapons.stats): el tajo más largo y más
// abierto, la medialuna más ancha y con más daño al jefe final (el tope por
// golpe del Espantapájaros pasa de 900 a 2200; entities/Zombies.js, info.cap).
export function hozBaston(st) {
  const melee = st.melee && { ...st.melee, range: st.melee.range * 1.3, cos: st.melee.cos - 0.35, targets: st.melee.targets + 4 };
  const crescent = st.crescent && { ...st.crescent, radius: st.crescent.radius * 1.35, bossCap: 2200 };
  // (la de la Muerte con el bastón: el derecho, mantenido, es el rayo de oro; weapons/hozBeam.js)
  const desc = st.upgraded ? 'Clic izquierdo corta todo lo que toca. Clic derecho, mantenido: el rayo de oro.' : st.desc;
  return { ...st, baston: true, name: st.upgraded ? 'Hoz de Oro de la Muerte' : 'Hoz de Oro', desc, melee, crescent };
}

// ---------------- el modelo ----------------
// Petiso (85 cm), cabezón, flaco y panzón, piel pálida amarillenta, pelo rubio
// parado en mechones, orejas en punta, ojos que brillan y una boca ancha con
// dientitos; brazos largos con garras. El dorado lleva el bastón.
const G = {
  sph: (r, sx, sy, sz, x, y, z) => new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(x, y, z),
  cone: (r, h, x, y, z, rx = 0, rz = 0) => new THREE.ConeGeometry(r, h, 6).rotateX(rx).rotateZ(rz).translate(x, y, z),
  cyl: (r0, r1, h, x, y, z) => new THREE.CylinderGeometry(r0, r1, h, 7).translate(x, y - h / 2, z),
};

function merge(list) {
  return mergeGeometries(list.map((g) => g.toNonIndexed()));
}

function buildGeos() {
  const torso = merge([G.sph(1, 0.14, 0.17, 0.11, 0, 0.13, 0), G.sph(1, 0.125, 0.11, 0.12, 0, 0.03, 0.025), G.sph(1, 0.07, 0.05, 0.05, 0, 0.29, 0)]);
  const skull = merge([
    G.sph(1, 0.14, 0.13, 0.15, 0, 0.1, 0),
    G.sph(1, 0.1, 0.07, 0.1, 0, 0.02, 0.05),
    G.cone(0.025, 0.07, 0, 0.08, 0.16, Math.PI / 2),
    G.cone(0.035, 0.16, -0.16, 0.13, -0.02, 0, Math.PI / 2 + 0.35),
    G.cone(0.035, 0.16, 0.16, 0.13, -0.02, 0, -Math.PI / 2 - 0.35),
  ]);
  const hair = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 1.6 - Math.PI * 0.8;
    hair.push(G.cone(0.035, 0.18 + (i % 3) * 0.04, Math.sin(a) * 0.09, 0.22 + Math.cos(a) * 0.02, -Math.cos(a) * 0.05 - 0.03, -0.7 - Math.cos(a) * 0.4, -Math.sin(a) * 0.6));
  }
  const eyes = merge([G.sph(0.034, 1, 1, 0.7, -0.055, 0.11, 0.125), G.sph(0.034, 1, 1, 0.7, 0.055, 0.11, 0.125)]);
  // la boca, las pupilas (rajitas, como de gato) y las cejas fruncidas: todo del mismo oscuro
  const mouth = merge([
    G.sph(1, 0.075, 0.022, 0.03, 0, 0.02, 0.135),
    G.sph(1, 0.009, 0.026, 0.01, -0.055, 0.11, 0.152),
    G.sph(1, 0.009, 0.026, 0.01, 0.055, 0.11, 0.152),
    G.sph(1, 0.045, 0.012, 0.02, 0, 0, 0).rotateZ(-0.45).translate(-0.06, 0.16, 0.125),
    G.sph(1, 0.045, 0.012, 0.02, 0, 0, 0).rotateZ(0.45).translate(0.06, 0.16, 0.125),
  ]);
  const teeth = [];
  for (let i = 0; i < 6; i++) teeth.push(G.cone(0.008, 0.022, -0.05 + i * 0.02, 0.028, 0.15, Math.PI));
  const upper = G.cyl(0.028, 0.024, 0.22, 0, 0, 0);
  const fore = merge([G.cyl(0.024, 0.02, 0.22, 0, 0, 0), G.sph(0.04, 1, 0.8, 1.1, 0, -0.24, 0.01)]);
  const claws = merge([0, 1, 2].map((k) => G.cone(0.011, 0.075, (k - 1) * 0.02, -0.3, 0.03, Math.PI * 0.85)));
  const thigh = G.cyl(0.034, 0.028, 0.17, 0, 0, 0);
  const shin = merge([G.cyl(0.027, 0.022, 0.17, 0, 0, 0), G.sph(0.045, 0.8, 0.45, 1.5, 0, -0.18, 0.035)]);
  const cane = merge([G.cyl(0.013, 0.013, 0.72, 0, 0.36, 0), G.sph(0.035, 1, 1, 1, 0, 0.38, 0), G.sph(0.02, 1, 1, 1, 0, -0.37, 0)]);
  return { torso, skull, hair: merge(hair), eyes, mouth, teeth: merge(teeth), upper, fore, claws, thigh, shin, cane };
}

// ---------------- los Yasy ----------------
export default class Yasy {
  constructor(g) {
    this.g = g;
    this.C = EE.matorral;
    this.spawnT = 1;
    this.netT = 0;
    this.sentSome = false;
    this.said = false;
    this.goldDone = false;
    this.baston = null;
    this.bsT = 0;
    this.scratchFx = 0;
    const T = g.textures || {};
    this.M = {
      skin: new THREE.MeshStandardMaterial({ color: 0xc8ae7a, roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: 0xe6c865, roughness: 0.9 }),
      eyes: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ff5a).multiplyScalar(2.2), toneMapped: false }),
      goldEyes: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23a).multiplyScalar(2.6), toneMapped: false }),
      // (los del que está en la cara, de tan cerca, más bajos: si no encandilan)
      faceEyes: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ff5a).multiplyScalar(1.0), toneMapped: false }),
      faceGold: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23a).multiplyScalar(1), toneMapped: false }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x1a0c08, roughness: 1 }),
      teeth: new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.5 }),
      claws: new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.22, emissive: 0x6a4000, emissiveIntensity: 0.9 }),
    };
    this.geo = buildGeos();
    this.list = [];
    for (let i = 0; i < SLOTS; i++) this.list.push(this.make(i));
    this.buildBaston();
    this.buildOverlay();
    // el que uno tiene en la cara: colgado cabeza abajo delante de la cámara,
    // en la escena de la mano (así no lo corta el mundo y se ve de cerca)
    this.face = g.weapons?.vmScene ? this.rig(false, g.weapons.vmScene) : null;
    this.faceK = 0;
  }

  make(i) {
    const gold = i === GOLD;
    const rig = this.rig(gold, this.g.scene);
    const z = { yasy: true, gold, active: false, dead: true, boss: false, dog: false, id: YASY_ID + i, pos: new THREE.Vector3(), yaw: 0, scale: 0.5, hp: 1, maxHp: 1, hidden: 0, baseY: 0, state: 'chase' };
    return {
      i,
      gold,
      z,
      st: 'off',
      t: 0,
      tgt: null,
      ph: Math.random() * 6,
      cd: 0,
      lost: 0,
      scratchT: SCRATCH_EVERY,
      flees: 0,
      from: new THREE.Vector3(),
      hideAt: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      to: new THREE.Vector3(),
      toYaw: 0,
      whT: 2,
      glintT: 0,
      rig,
    };
  }

  // Arma un Yasy (escondido) en `parent`: la escena, o la de la mano para el
  // que se tiene en la cara (faceRig).
  rig(gold, parent) {
    const M = this.M;
    const Gs = this.geo;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.34;
    root.add(body);
    mesh(Gs.torso, M.skin, body);
    const head = new THREE.Group();
    head.position.set(0, 0.32, 0.02);
    body.add(head);
    mesh(Gs.skull, M.skin, head);
    mesh(Gs.hair, M.hair, head);
    const eyes = mesh(Gs.eyes, gold ? M.goldEyes : M.eyes, head);
    mesh(Gs.mouth, M.mouth, head);
    mesh(Gs.teeth, M.teeth, head);
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.13, 0.24, 0);
      body.add(sh);
      mesh(Gs.upper, M.skin, sh);
      const el = new THREE.Group();
      el.position.y = -0.22;
      sh.add(el);
      mesh(Gs.fore, M.skin, el);
      mesh(Gs.claws, M.claws, el);
      return [sh, el];
    };
    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.07, 0, 0);
      body.add(hip);
      mesh(Gs.thigh, M.skin, hip);
      const kn = new THREE.Group();
      kn.position.y = -0.17;
      hip.add(kn);
      mesh(Gs.shin, M.skin, kn);
      return [hip, kn];
    };
    const [shL, elL] = arm(-1);
    const [shR, elR] = arm(1);
    const [hipL, knL] = leg(-1);
    const [hipR, knR] = leg(1);
    let cane = null;
    if (gold) {
      cane = mesh(Gs.cane, M.gold, elR, 0, -0.26, 0.04);
      cane.rotation.x = 0.4;
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
    root.visible = false;
    parent.add(root);
    return { root, body, head, eyes, sh: [shL, shR], el: [elL, elR], hip: [hipL, hipR], kn: [knL, knR], cane };
  }

  // El bastón de oro en el piso: brilla, gira despacio y tiene una columna de luz para encontrarlo.
  buildBaston() {
    const g = this.g;
    const grp = new THREE.Group();
    const cane = new THREE.Mesh(this.geo.cane, this.M.gold);
    cane.position.y = 0.55;
    cane.rotation.z = 0.25;
    grp.add(cane);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23a).multiplyScalar(1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 7, 12, 1, true).translate(0, 3.5, 0), beamMat);
    grp.add(beam);
    grp.visible = false;
    g.scene.add(grp);
    this.bMesh = grp;
    this.bCane = cane;
    this.bPos = new THREE.Vector3(0, -100, 0);
    g.interact?.add({
      kind: 'ee',
      local: true,
      pos: this.bPos,
      radius: 1.8,
      prompt: () => {
        if (!this.baston) return null;
        if (g.player.baston) return { text: 'Ya tenés el bastón', noCost: true, info: true };
        return { text: 'Agarrar el bastón de oro', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (!this.baston || g.player.baston) return false;
        if (g.net?.guest) g.net.share('yasy', { k: 'take', id: this.me() });
        else this.take(this.me());
        return true;
      },
    });
  }

  // Lo que se ve con uno encima (además del bicho, faceRig): la pantalla
  // oscurecida en los bordes, los arañazos y la tecla para sacárselo.
  buildOverlay() {
    const el = document.createElement('div');
    el.className = 'mdu-yasy';
    el.innerHTML = `<svg class="mdu-yasy-scratch" viewBox="0 0 1000 620" preserveAspectRatio="none">
  <g stroke="#8a0a06" stroke-width="9" stroke-linecap="round" fill="none"><path d="M300 180 L520 520"/><path d="M350 160 L570 500"/><path d="M400 150 L610 470"/></g>
</svg>
<div class="mdu-yasy-key">V</div>`;
    (this.g.hud?.root || document.body).appendChild(el);
    this.overlay = el;
    this.scratchEl = el.querySelector('.mdu-yasy-scratch');
    this.overOn = false;
  }

  // ---------------- quiénes ----------------
  me() {
    return this.g.net ? this.g.net.id : 0;
  }

  who(id) {
    if (id === this.me()) return this.g.player;
    return this.g.net?.remote.get(id) || null;
  }

  up(p) {
    if (!p) return false;
    return p === this.g.player ? p.canBeHit() : !p.dead && !p.downed && !p.ghost;
  }

  // Los que están adentro del matorral, en pie y a la vista (al escondido en
  // una mata del Maizaster tampoco lo ven).
  insidePlayers() {
    const g = this.g;
    const M = g.matorral;
    const out = [];
    const add = (id, p) => {
      if (p && (p === g.player ? p.canBeHit() : !p.dead && !p.downed && !p.ghost) && !p.maizIn && M.inside(p.pos.x, p.pos.z)) out.push({ id, p });
    };
    add(this.me(), g.player);
    if (g.net) for (const [id, r] of g.net.remote) add(id, r);
    return out;
  }

  latchedOn(id) {
    return this.list.some((y) => y.st === 'latch' && y.tgt === id);
  }

  byId(id) {
    const y = this.list[id - YASY_ID];
    return y && y.st !== 'off' ? y.z : null;
  }

  // ---------------- para las armas ----------------
  hittable(y) {
    return y.st !== 'off' && y.st !== 'dead' && y.st !== 'latch' && y.st !== 'sink';
  }

  hitTest(o, d, maxT, hits) {
    for (const y of this.list) {
      if (!this.hittable(y)) continue;
      const p = y.z.pos;
      const low = y.st === 'hide' ? 0.6 : 1;
      for (const [cy, r, zone] of [
        [0.72 * low, 0.18, 'head'],
        [0.42 * low, 0.26, 'torso'],
      ]) {
        tmpV.set(p.x - o.x, p.y + cy - o.y, p.z - o.z);
        const along = tmpV.dot(d);
        if (along < 0 || along > maxT) continue;
        const perp2 = tmpV.lengthSq() - along * along;
        if (perp2 > r * r) continue;
        hits.push({ z: y.z, t: along - Math.sqrt(r * r - perp2), zone });
        break;
      }
    }
  }

  inRadius(check) {
    for (const y of this.list) if (this.hittable(y)) check(y.z);
  }

  // Los que abren la paja del matorral (Matorral.pushers).
  pushers(add) {
    for (const y of this.list) if (y.st !== 'off' && y.st !== 'latch' && y.st !== 'dead') add(y.z.pos.x, y.z.pos.y, y.z.pos.z, 0.8);
  }

  // (anfitrión) Un tiro, un tajo, una explosión. Al dorado solo le entra el cuchillo o la hoz.
  damage(z, amount, info = {}) {
    const g = this.g;
    const y = this.list[z.id - YASY_ID];
    g.zombies.lastPoints = 0;
    if (!y || !this.hittable(y) || !(amount > 0)) return false;
    const melee = info.type === 'knife' || info.type === 'scythe';
    if (y.gold && !melee) {
      if (info.point) g.fx.sparks(info.point, 0.5, { x: 0, y: 1, z: 0 }, [1, 0.8, 0.3]);
      if (y.st === 'hide') this.flee(y);
      return false;
    }
    const pts = y.gold ? GOLD_POINTS : POINTS;
    if (info.noPoints) g.zombies.lastPoints = pts;
    else g.addPoints(pts, info.point);
    this.die(y, info.dir);
    return true;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    if (!g.matorral) return;
    const still = g.state !== 'playing' || !!g.ee?.scene || !!g.intro?.active;
    if (!still) {
      if (g.net?.guest) this.guestTick(dt);
      else this.hostTick(dt);
    }
    for (const y of this.list) if (y.st !== 'off') this.animate(y, dt);
    this.sounds(dt);
    this.overlayTick(dt);
    this.bastonTick(dt);
  }

  hostTick(dt) {
    const g = this.g;
    const M = g.matorral;
    const ins = this.insidePlayers();
    if (M.state === 'grown' && ins.length) {
      this.spawnT -= dt;
      const players = 1 + (g.net ? g.net.remote.size : 0);
      const cap = Math.min(NORMAL, 1 + players);
      const n = this.list.filter((y) => !y.gold && y.st !== 'off').length;
      if (this.spawnT <= 0 && n < cap) {
        this.spawnT = 2.5 + Math.random() * 2.5;
        this.spawnNormal(ins);
      }
      // (ya es de todos: el dorado no vuelve)
      if (!this.goldDone && !this.baston && !g.player.baston && this.list[GOLD].st === 'off') this.spawnGold(ins);
    } else {
      this.spawnT = Math.min(this.spawnT, 1.2);
      // quemado, el dorado no queda (vuelve cuando el maizal crece de nuevo:
      // onRegrow), como los cofres de los campamentos
      const G = this.list[GOLD];
      if (M.state === 'ash' && !['off', 'dead', 'sink', 'latch'].includes(G.st)) this.setSt(G, 'sink');
    }
    for (const y of this.list) if (y.st !== 'off') this.think(y, dt, ins);
    // la primera vez que alguien se cruza uno
    if (!this.said) {
      for (const y of this.list) {
        if (!['run', 'leap', 'latch', 'hide', 'flee'].includes(y.st)) continue;
        if (!ins.some(({ p }) => Math.hypot(p.pos.x - y.z.pos.x, p.pos.z - y.z.pos.z) < SEE)) continue;
        this.said = true;
        if (g.ee?.voice) g.ee.voice(LINE, 0.4);
        else g.later(0.4, () => g.say('entidad', LINE, 'entidad'));
        break;
      }
    }
    // a los demás: dónde está cada uno
    if (g.net) {
      this.netT -= dt;
      const any = this.list.some((y) => y.st !== 'off');
      if (this.netT <= 0 && (any || this.sentSome)) {
        this.netT = 0.1;
        this.sentSome = any;
        const l = [];
        for (const y of this.list) {
          if (y.st === 'off') continue;
          const p = y.z.pos;
          l.push([y.i, STATES.indexOf(y.st), Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100), Math.round(y.z.yaw * 100), y.tgt ?? -1]);
        }
        g.net.event('yasy', { k: 'l', l });
      }
      this.bsT -= dt;
      if (this.bsT <= 0) {
        this.bsT = 6;
        g.net.event('yasy', { k: 'bs', b: this.baston ? [+this.baston.x.toFixed(2), +this.baston.z.toFixed(2)] : 0 });
      }
    }
  }

  // Un lugar entre el maíz, ni muy cerca ni muy lejos de los de adentro.
  spawnNormal(ins) {
    const g = this.g;
    const y = this.list.find((q) => !q.gold && q.st === 'off');
    if (!y) return;
    const [x, z] = g.matorral.randomSpot(ins, 7, 16);
    y.z.pos.set(x, g.world.floorAt(x, z), z);
    y.z.yaw = Math.random() * Math.PI * 2;
    y.cd = 0;
    y.lost = 0;
    y.tgt = null;
    this.setSt(y, 'rise');
  }

  // El dorado, en un campamento lejos de los que entraron (el de la Yerba Madre no).
  spawnGold(ins) {
    const y = this.list[GOLD];
    y.flees = 0;
    this.pickHide(y, ins);
    y.z.pos.copy(y.hideAt);
    y.tgt = null;
    this.setSt(y, 'hide');
  }

  // Uno de los tres campamentos más lejos de los de adentro (no en el que
  // ya está), en el borde del claro, entre las cosas y el maíz.
  pickHide(y, ins) {
    const g = this.g;
    const camps = this.C.camps;
    const list = [];
    for (let i = 1; i < camps.length; i++) {
      const [cx, cz] = camps[i].at;
      if (y.st !== 'off' && Math.hypot(cx - y.z.pos.x, cz - y.z.pos.z) < camps[i].r + 1) continue;
      const d = ins.length ? Math.min(...ins.map(({ p }) => Math.hypot(p.pos.x - cx, p.pos.z - cz))) : Math.random() * 10;
      list.push([d, i]);
    }
    list.sort((a, b) => b[0] - a[0]);
    const ci = list[(Math.random() * Math.min(3, list.length)) | 0][1];
    const spots = g.matorral.camps.hides[ci];
    const [x, z] = spots[(Math.random() * spots.length) | 0];
    y.hideAt.set(x, g.world.floorAt(x, z), z);
  }

  flee(y) {
    if (y.flees >= GOLD_FLEES) return;
    y.flees++;
    this.pickHide(y, this.insidePlayers());
    this.setSt(y, 'flee');
  }

  // (anfitrión) Lo que hace cada uno.
  think(y, dt, ins) {
    const g = this.g;
    const M = g.matorral;
    const z = y.z;
    y.t += dt;
    // el fuego: los comunes se queman; el dorado se escapa bajo tierra
    if (M.burning(z.pos.x, z.pos.z) && !['latch', 'dead', 'sink'].includes(y.st)) {
      if (y.gold) this.setSt(y, 'sink');
      else this.die(y, null);
      return;
    }
    switch (y.st) {
      case 'rise':
        if (y.t > RISE) this.setSt(y, 'run');
        break;
      case 'run': {
        y.cd -= dt;
        let T = null;
        let bd = Infinity;
        for (const c of ins) {
          const d = Math.hypot(c.p.pos.x - z.pos.x, c.p.pos.z - z.pos.z);
          if (d < bd) {
            bd = d;
            T = c;
          }
        }
        if (!T) {
          y.lost += dt;
          if (y.lost > 2.5) this.setSt(y, 'sink');
          break;
        }
        y.lost = 0;
        y.tgt = T.id;
        const dx = T.p.pos.x - z.pos.x;
        const dz = T.p.pos.z - z.pos.z;
        this.turn(y, Math.atan2(dx, dz), dt);
        if (bd < LEAP_AT && y.cd <= 0 && !this.latchedOn(T.id)) {
          y.from.copy(z.pos);
          this.setSt(y, 'leap');
          break;
        }
        if (bd > 0.9) this.move(y, dx / bd, dz / bd, (y.gold ? GOLD_SPEED : SPEED) * dt);
        break;
      }
      case 'leap': {
        const T = this.who(y.tgt);
        const k = Math.min(1, y.t / LEAP_T);
        if (!T) {
          this.land(y);
          break;
        }
        tmpV.set(T.pos.x, (T.pos.y || 0) + 1.45, T.pos.z);
        z.pos.lerpVectors(y.from, tmpV, k);
        z.pos.y += Math.sin(Math.PI * k) * 0.6;
        if (k < 1) break;
        if (this.up(T) && !this.latchedOn(y.tgt) && Math.hypot(T.pos.x - z.pos.x, T.pos.z - z.pos.z) < LEAP_GRAB) {
          y.scratchT = SCRATCH_EVERY * 0.6;
          this.setSt(y, 'latch');
        } else this.land(y);
        break;
      }
      case 'latch': {
        const T = this.who(y.tgt);
        if (!T || !this.up(T)) {
          this.land(y);
          break;
        }
        z.pos.set(T.pos.x, (T.pos.y || 0) + 1.45, T.pos.z);
        z.yaw = T.yaw || 0;
        y.scratchT -= dt;
        if (y.scratchT <= 0) {
          y.scratchT = SCRATCH_EVERY;
          g.damagePlayer(T, SCRATCH, tmpW.copy(z.pos));
        }
        break;
      }
      case 'hide': {
        const near = ins.some(({ p }) => Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z) < GOLD_NEAR);
        if (!near) break;
        if (y.flees < GOLD_FLEES) this.flee(y);
        else this.setSt(y, 'run');
        break;
      }
      case 'flee': {
        const dx = y.hideAt.x - z.pos.x;
        const dz = y.hideAt.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        this.turn(y, Math.atan2(dx, dz), dt);
        if (d < 0.4 || y.t > 12) {
          this.setSt(y, 'hide');
          break;
        }
        this.move(y, dx / d, dz / d, Math.min(d, GOLD_SPEED * dt), true);
        break;
      }
      case 'dead':
        if (y.t > 1.4) this.setSt(y, 'off');
        break;
      case 'sink':
        if (y.t > 0.6) this.setSt(y, 'off');
        break;
    }
  }

  land(y) {
    const g = this.g;
    y.z.pos.y = g.world.floorAt(y.z.pos.x, y.z.pos.z);
    if (!g.matorral.inside(y.z.pos.x, y.z.pos.z)) {
      // (se lo llevaron afuera: vuelve a la tierra)
      this.setSt(y, 'sink');
      return;
    }
    y.cd = 0.9;
    this.setSt(y, 'run');
  }

  turn(y, to, dt) {
    let d = to - y.z.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    y.z.yaw += d * Math.min(1, dt * 10);
  }

  // Avanza sin salir del matorral (contra el borde, resbala por un eje).
  // free: el dorado huyendo puede cruzar por cualquier lado.
  move(y, dx, dz, step, free = false) {
    const g = this.g;
    const M = g.matorral;
    const p = y.z.pos;
    const ok = (x, z) => free || M.inside(x, z);
    if (ok(p.x + dx * step, p.z + dz * step)) {
      p.x += dx * step;
      p.z += dz * step;
    } else if (ok(p.x + dx * step, p.z)) p.x += dx * step;
    else if (ok(p.x, p.z + dz * step)) p.z += dz * step;
    p.y = g.world.floorAt(p.x, p.z);
    y.ph += step * 5.5;
  }

  die(y, dir) {
    const g = this.g;
    if (y.st === 'dead' || y.st === 'off') return;
    const p = y.z.pos;
    y.vel.set(dir?.x ?? Math.random() - 0.5, 0, dir?.z ?? Math.random() - 0.5).normalize().multiplyScalar(3.2);
    y.vel.y = 3.4;
    if (y.gold) this.dropBaston(p.x, p.z);
    this.setSt(y, 'dead');
    if (g.net && !g.net.guest) g.net.event('yasy', { k: 'die', i: y.i, v: [+y.vel.x.toFixed(2), +y.vel.z.toFixed(2)] });
  }

  setSt(y, st) {
    const g = this.g;
    const prev = y.st;
    y.st = st;
    y.t = 0;
    const z = y.z;
    z.active = st !== 'off';
    z.dead = st === 'dead' || st === 'off';
    y.rig.root.visible = st !== 'off';
    if (prev === st) return;
    const at = tmpW.set(z.pos.x, z.pos.y + 0.5, z.pos.z);
    if (st === 'rise' || st === 'sink') g.fx.dirt?.(at, 10);
    if (st === 'rise') this.sndChitter(at);
    else if (st === 'leap') this.sndLeap(at);
    else if (st === 'dead') {
      g.fx.blood(at, { x: 0, y: 0.6, z: 0 }, 10);
      this.sndDie(at);
    } else if (st === 'flee') this.sndLaugh(at);
  }

  // ---------------- invitado ----------------
  guestTick(dt) {
    for (const y of this.list) {
      if (y.st === 'off') continue;
      y.t += dt;
      const z = y.z;
      if (y.st === 'dead') {
        // (como en el anfitrión: a los 1,4 s se va. Antes quedaba muerto para
        // siempre en el invitado, y el próximo Yasy de ese lugar no se veía ni
        // se lo podía sacar de encima)
        if (y.t > 1.4) this.setSt(y, 'off');
        continue;
      }
      const k = Math.min(1, dt * 12);
      const moved = Math.hypot(y.to.x - z.pos.x, y.to.z - z.pos.z);
      z.pos.lerp(y.to, k);
      let d = y.toYaw - z.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      z.yaw += d * k;
      y.ph += moved * k * 5.5;
    }
  }

  onEvent(m) {
    const g = this.g;
    const host = !g.net?.guest;
    if (m.k === 'off') {
      // (anfitrión) un invitado se sacó uno de la cara
      if (!host) return;
      const y = this.list.find((q) => q.st === 'latch' && q.tgt === m.id);
      if (y) this.die(y, null);
      return;
    }
    if (m.k === 'take') {
      if (host) this.take(m.id);
      return;
    }
    if (m.k === 'took') {
      if (!host) this.took(m.id);
      return;
    }
    if (host) return;
    if (m.k === 'l') {
      const seen = new Set();
      for (const [i, s, x, yy, zz, yaw, tgt] of m.l) {
        const y = this.list[i];
        if (!y) continue;
        seen.add(i);
        const st = STATES[s] || 'off';
        y.to.set(x / 100, yy / 100, zz / 100);
        y.toYaw = yaw / 100;
        y.tgt = tgt === -1 ? null : tgt;
        if (y.st === 'off') {
          y.z.pos.copy(y.to);
          y.z.yaw = y.toYaw;
        }
        // (uno que el invitado ya dio por muerto vuelve si el anfitrión lo
        // tiene vivo un rato después: es otro en el mismo lugar)
        if (st !== y.st && (y.st !== 'dead' || (y.t > 0.6 && st !== 'off'))) this.setSt(y, st);
      }
      for (const y of this.list) if (!seen.has(y.i) && y.st !== 'off' && y.st !== 'dead') this.setSt(y, 'off');
    } else if (m.k === 'die') {
      const y = this.list[m.i];
      if (!y || y.st === 'off') return;
      y.vel.set(m.v[0], 3.4, m.v[1]);
      this.setSt(y, 'dead');
    } else if (m.k === 'bast') this.showBaston(m.x, m.z);
    else if (m.k === 'bs') {
      if (m.b) this.showBaston(m.b[0], m.b[1]);
      else if (this.baston) this.hideBaston();
    }
  }

  // ---------------- el bastón ----------------
  dropBaston(x, z) {
    const g = this.g;
    this.showBaston(x, z);
    g.net?.event('yasy', { k: 'bast', x: +x.toFixed(2), z: +z.toFixed(2) });
  }

  showBaston(x, z) {
    const g = this.g;
    const y = g.world.floorAt(x, z);
    this.baston = { x, z };
    this.bPos.set(x, y + 0.6, z);
    this.bMesh.position.set(x, y, z);
    this.bMesh.visible = true;
  }

  hideBaston() {
    this.baston = null;
    this.bMesh.visible = false;
    this.bPos.set(0, -100, 0);
  }

  // (anfitrión) El primero que lo pide se lo lleva; el matorral se prende.
  take(id) {
    const g = this.g;
    if (!this.baston) return;
    const p = this.who(id);
    if (!p || p.baston) return;
    this.hideBaston();
    this.goldDone = true;
    g.net?.event('yasy', { k: 'took', id });
    this.took(id);
    g.matorral?.ignite();
  }

  // Uno lo agarra y la hoz de oro es de todos (antes solo del que lo
  // agarraba; pedido del usuario 2026-10-01).
  took(id) {
    const g = this.g;
    this.hideBaston();
    if (g.net) for (const r of g.net.remote.values()) r.baston = true;
    if (g.player.baston) return;
    g.player.baston = true;
    // la hoz cambia en la mano, al toque
    const W = g.weapons;
    if (W.slot?.id === 'hoz') {
      W.equipModel();
      W.updateHud();
    }
    this.sndGold();
  }

  onRegrow() {
    if (!this.baston) this.goldDone = false;
  }

  bastonTick(dt) {
    const g = this.g;
    if (!this.baston) return;
    this.bCane.rotation.y += dt * 1.2;
    this.bCane.position.y = 0.55 + Math.sin(g.time * 2.2) * 0.06;
    if (Math.random() < dt * 5) g.fx.sparkle(tmpV.set(this.bPos.x + (Math.random() - 0.5) * 0.4, this.bPos.y + Math.random() * 0.6, this.bPos.z + (Math.random() - 0.5) * 0.4), [1, 0.8, 0.3], 1, 0.3);
  }

  // ---------------- con uno encima ----------------
  // Un cuchillazo o un tajo de la hoz de esta compu: si hay uno en la cara, se lo saca.
  onMelee() {
    const g = this.g;
    const me = this.me();
    const y = this.list.find((q) => q.st === 'latch' && q.tgt === me);
    if (!y) return false;
    const fwd = tmpV.set(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
    g.addPoints(y.gold ? GOLD_POINTS : POINTS);
    g.audio.knife(true);
    g.fx.addShake(0.2);
    if (g.net?.guest) {
      g.net.share('yasy', { k: 'off', id: me });
      y.vel.set(fwd.x * 3, 3.4, fwd.z * 3);
      this.setSt(y, 'dead');
    } else this.die(y, fwd);
    return true;
  }

  overlayTick(dt) {
    const g = this.g;
    const me = this.me();
    const on = this.list.some((y) => y.st === 'latch' && y.tgt === me);
    if (on !== this.overOn) {
      this.overOn = on;
      this.overlay.classList.toggle('on', on);
      if (on) this.scratchFx = SCRATCH_EVERY * 0.6;
    }
    this.poseFace(dt, on);
    if (!on) return;
    this.scratchFx -= dt;
    if (this.scratchFx <= 0) {
      this.scratchFx = SCRATCH_EVERY;
      const s = this.scratchEl;
      s.style.transform = `rotate(${(Math.random() - 0.5) * 70}deg) translate(${(Math.random() - 0.5) * 30}%, ${(Math.random() - 0.5) * 20}%)`;
      s.classList.remove('go');
      void s.getBoundingClientRect();
      s.classList.add('go');
      g.fx.addShake(0.12);
      this.sndScratch(tmpV.copy(g.player.pos).setY(g.player.pos.y + 1.6));
    }
  }

  // El de la cara: abrazado a la cabeza, mirándote de frente, los brazos
  // para arriba agarrando los costados y arañando. (flip: cabeza abajo, colgado)
  poseFace(dt, on) {
    const F = this.face;
    if (!F) return;
    this.faceK = on ? Math.min(1, this.faceK + dt * 5) : 0;
    F.root.visible = on;
    if (!on) return;
    const t = this.g.time;
    const k = this.faceK;
    const gold = this.list.some((y) => y.gold && y.st === 'latch' && y.tgt === this.me());
    F.eyes.material = gold ? this.M.faceGold : this.M.faceEyes;
    F.root.position.set(Math.sin(t * 7) * 0.006, FACE.y + (1 - k) * 0.35 + Math.sin(t * 11) * 0.008, FACE.z);
    F.root.rotation.set(FACE.rx, 0, (FACE.flip ? Math.PI : 0) + Math.sin(t * 5) * 0.05);
    F.root.scale.setScalar(FACE.s);
    F.body.position.set(0, 0.34, 0);
    F.body.rotation.set(FACE.bx, 0, 0);
    F.head.rotation.set(FACE.hx + Math.sin(t * 9) * 0.06, Math.sin(t * 3) * 0.14, 0);
    const scr = Math.sin(t * 17) * 0.22;
    F.sh[0].rotation.set(FACE.ax + scr, 0, -FACE.az);
    F.sh[1].rotation.set(FACE.ax - scr, 0, FACE.az);
    F.el[0].rotation.set(FACE.ex, 0, -FACE.ez);
    F.el[1].rotation.set(FACE.ex, 0, FACE.ez);
    F.hip[0].rotation.set(-1.3, 0, 0.5);
    F.hip[1].rotation.set(-1.3, 0, -0.5);
    F.kn[0].rotation.x = F.kn[1].rotation.x = 1.9;
  }

  // ---------------- cómo se mueven ----------------
  animate(y, dt) {
    const g = this.g;
    const R = y.rig;
    const z = y.z;
    const t = g.time;
    if (y.st === 'dead') {
      y.vel.y -= 12 * dt;
      z.pos.addScaledVector(y.vel, dt);
      const fl = g.world.floorAt(z.pos.x, z.pos.z);
      if (z.pos.y < fl) {
        z.pos.y = fl;
        y.vel.multiplyScalar(0.4);
        y.vel.y = 0;
      }
    }
    // el que tengo encima no se ve en el mundo (se ve la pantalla tapada)
    R.root.visible = !(y.st === 'latch' && y.tgt === this.me());
    R.root.position.copy(z.pos);
    R.root.rotation.set(0, z.yaw, 0);
    const [shL, shR] = R.sh;
    const [elL, elR] = R.el;
    const [hipL, hipR] = R.hip;
    const [knL, knR] = R.kn;
    const b = R.body;
    b.position.set(0, 0.34, 0);
    b.rotation.set(0, 0, 0);
    R.head.rotation.set(0, 0, 0);
    const s = Math.sin(y.ph);
    const c = Math.cos(y.ph);
    switch (y.st) {
      case 'rise': {
        const k = Math.min(1, y.t / RISE);
        R.root.position.y -= (1 - k) * 0.9;
        b.rotation.x = 0.6;
        shL.rotation.set(-2.6 + k, 0, 0.3);
        shR.rotation.set(-2.6 + k, 0, -0.3);
        elL.rotation.x = elR.rotation.x = -0.4;
        hipL.rotation.x = hipR.rotation.x = -0.9;
        knL.rotation.x = knR.rotation.x = 1.6;
        break;
      }
      case 'run':
      case 'flee': {
        b.rotation.x = 0.5;
        b.position.y = 0.32 + Math.abs(s) * 0.05;
        R.head.rotation.x = -0.45 + Math.sin(t * 9 + y.i) * 0.08;
        hipL.rotation.x = s * 0.95 - 0.35;
        hipR.rotation.x = -s * 0.95 - 0.35;
        knL.rotation.x = Math.max(0, c) * 1.3 + 0.2;
        knR.rotation.x = Math.max(0, -c) * 1.3 + 0.2;
        shL.rotation.set(-s * 1.1 - 0.5, 0, 0.35);
        shR.rotation.set(s * 1.1 - 0.5, 0, -0.35);
        elL.rotation.x = elR.rotation.x = -0.7;
        break;
      }
      case 'leap': {
        b.rotation.x = 1.0;
        R.head.rotation.x = -0.9;
        shL.rotation.set(-2.7, 0, 0.4);
        shR.rotation.set(-2.7, 0, -0.4);
        elL.rotation.x = elR.rotation.x = -0.3;
        hipL.rotation.x = hipR.rotation.x = -1.3;
        knL.rotation.x = knR.rotation.x = 1.9;
        break;
      }
      case 'latch': {
        // abrazado a la cabeza, arañando
        R.root.position.y -= 0.35;
        b.position.z = 0.12;
        b.rotation.x = -0.25;
        const scr = Math.sin(t * 16 + y.i) * 0.35;
        shL.rotation.set(-1.9 + scr, 0, 0.9);
        shR.rotation.set(-1.9 - scr, 0, -0.9);
        elL.rotation.x = elR.rotation.x = -1.3;
        hipL.rotation.set(-1.4, 0, 0.5);
        hipR.rotation.set(-1.4, 0, -0.5);
        knL.rotation.x = knR.rotation.x = 2.0;
        break;
      }
      case 'hide': {
        // en cuclillas, mirando para todos lados
        b.position.y = 0.2;
        b.rotation.x = 0.35;
        R.head.rotation.y = Math.sin(t * 0.8 + 1.3) * 0.9;
        R.head.rotation.x = -0.25;
        hipL.rotation.x = hipR.rotation.x = -1.7;
        knL.rotation.x = knR.rotation.x = 2.4;
        shL.rotation.set(-0.9, 0, 0.2);
        shR.rotation.set(-1.4 + Math.sin(t * 2.3) * 0.2, 0, -0.2);
        elL.rotation.x = elR.rotation.x = -1.4;
        break;
      }
      case 'dead': {
        const k = Math.min(1, y.t / 0.5);
        R.root.rotation.x = -k * 1.5;
        R.root.rotation.z = Math.sin(y.i * 3) * k * 0.6;
        shL.rotation.set(-1.2, 0, 1.2);
        shR.rotation.set(-1.2, 0, -1.2);
        hipL.rotation.x = hipR.rotation.x = -0.3;
        if (y.t > 0.9) R.root.position.y -= (y.t - 0.9) * 0.8;
        break;
      }
      case 'sink': {
        R.root.position.y -= Math.min(1, y.t / 0.6) * 0.9;
        b.rotation.x = 0.6;
        shL.rotation.set(-2.4, 0, 0.3);
        shR.rotation.set(-2.4, 0, -0.3);
        break;
      }
    }
  }

  // ---------------- los ruidos ----------------
  // (cada compu: el silbido y el brillo del dorado escondido)
  sounds(dt) {
    const g = this.g;
    const y = this.list[GOLD];
    if (y.st !== 'hide') return;
    y.whT -= dt;
    if (y.whT <= 0) {
      y.whT = 4.5 + Math.random() * 2;
      this.sndWhistle(tmpV.set(y.z.pos.x, y.z.pos.y + 0.7, y.z.pos.z));
    }
    y.glintT -= dt;
    if (y.glintT <= 0) {
      y.glintT = 0.9 + Math.random() * 0.6;
      g.fx.sparkle(tmpV.set(y.z.pos.x, y.z.pos.y + 0.8, y.z.pos.z), [1, 0.8, 0.3], 2, 0.3);
    }
  }

  // El silbido del Yasy dorado: "ya-sy, ya-te-ré" (dos cortitos parejos, uno
  // que sube y un trino que cae; el del Pombero es distinto: sube y cae largo).
  sndWhistle(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.6, gain: 0.6, ref: 5 });
    const t = A.now;
    A.tone(o, { t, dur: 0.12, type: 'sine', freq: 2250, gain: 0.22, attack: 0.01 });
    A.tone(o, { t: t + 0.18, dur: 0.12, type: 'sine', freq: 2250, gain: 0.22, attack: 0.01 });
    A.tone(o, { t: t + 0.42, dur: 0.22, type: 'sine', freq: 1900, freqEnd: 2700, gain: 0.24, attack: 0.02 });
    for (let i = 0; i < 6; i++) A.tone(o, { t: t + 0.7 + i * 0.06, dur: 0.05, type: 'sine', freq: 2600 - i * 110, gain: 0.2, attack: 0.005 });
  }

  // La risita del dorado cuando se muda de claro: "ji-ji-ji" que baja.
  sndLaugh(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.4, gain: 0.55, ref: 4 });
    for (let i = 0; i < 5; i++) {
      const t = A.now + i * 0.11;
      A.tone(o, { t, dur: 0.07, type: 'triangle', freq: 1500 - i * 70, freqEnd: 1250 - i * 70, gain: 0.25, attack: 0.005 });
      A.noise(o, { t, dur: 0.06, type: 'bandpass', freq: 3200, q: 2, gain: 0.08 });
    }
  }

  // Cuando sale de la tierra: un castañeteo de dientes y un chillido corto.
  sndChitter(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.3, gain: 0.5, ref: 3 });
    for (let i = 0; i < 7; i++) A.noise(o, { t: A.now + i * 0.045, dur: 0.02, type: 'bandpass', freq: 3800 + Math.random() * 800, q: 3, gain: 0.5 });
    A.tone(o, { t: A.now + 0.33, dur: 0.18, type: 'sawtooth', freq: 1100, freqEnd: 1700, gain: 0.08, attack: 0.01 });
  }

  // El chillido del salto.
  sndLeap(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.25, gain: 0.6, ref: 3 });
    A.tone(o, { dur: 0.32, type: 'sawtooth', freq: 900, freqEnd: 2300, gain: 0.12, attack: 0.01 });
    A.tone(o, { dur: 0.32, type: 'square', freq: 1810, freqEnd: 4400, gain: 0.03, attack: 0.01 });
    A.noise(o, { dur: 0.3, type: 'bandpass', freq: 2600, q: 1.2, gain: 0.25 });
  }

  // El arañazo: tres rasguños secos.
  sndScratch(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.1, gain: 0.7, ref: 2 });
    for (let i = 0; i < 3; i++) A.noise(o, { t: A.now + i * 0.06, dur: 0.07, type: 'highpass', freq: 3000 + i * 500, freqEnd: 1800, q: 0.7, gain: 0.55, attack: 0.004 });
    A.tone(o, { t: A.now + 0.05, dur: 0.14, type: 'sawtooth', freq: 1600, freqEnd: 1200, gain: 0.05 });
  }

  // Al morir: un chillido que se ahoga.
  sndDie(pos) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos, reverb: 0.3, gain: 0.55, ref: 3 });
    A.tone(o, { dur: 0.45, type: 'sawtooth', freq: 2100, freqEnd: 420, gain: 0.11, attack: 0.01 });
    A.noise(o, { dur: 0.35, type: 'bandpass', freq: 1900, freqEnd: 500, q: 1, gain: 0.25 });
  }

  // La hoz se vuelve de oro: un brillo que sube.
  sndGold() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ gain: 0.5, reverb: 0.5 });
    [0, 4, 7, 12, 16].forEach((n, i) => A.tone(o, { t: A.now + i * 0.07, dur: 0.6 - i * 0.05, type: 'triangle', freq: 880 * 2 ** (n / 12), gain: 0.12, attack: 0.01 }));
  }
}
