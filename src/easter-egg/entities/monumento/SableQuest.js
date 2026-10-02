import * as THREE from 'three';
import { sableModel, sablePartModel } from '../../weapons/sableModels';
import { cargaGeos, cargaGhostMat, CARGA_TIME, CARGA_LEGS, CARGA_HIP, CARGA_UPPER } from '../../weapons/sableCarga';
import { warmObject } from '../../fx/ghostMat';
import { sfxClang } from '../../world/shieldSfx';
import { EE } from '../../config/map';
import GeoBuilder from '../../world/GeoBuilder';
import { quad } from '../../world/monumentoKit';

// El Sable Corvo de San Martín (la maravilla del Monumento, weapons/Sable.js):
// se arma con tres piezas y se forja en la Llama Votiva.
//  · La hoja, clavada en la piedra al pie de la Proa (mantener F para sacarla).
//  · La empuñadura, la lleva un granadero fantasma que galopa por el Parque
//    desde la ronda 3: a los tiros se desarma y la deja caer.
//  · La vaina, en el fondo del espejo de agua del norte del Pasaje: con
//    corriente, la válvula del borde lo vacía.
//  · Las tres en la Llama prendida (después de la posta de la antorcha): se
//    forja y queda flotando sobre el fuego; cada uno agarra el suyo.
// Lo decide el anfitrión; viaja por 'pee' (k: 'sbl') como el resto del
// easter egg (entities/MonumentoEgg.js).

const PARTS = ['hoja', 'emp', 'vaina'];
const HOJA = { x: 90.55, y: -2.0, z: 30.5 };
const VALVE = { x: 18.4, y: 3.6, z: 26.78 };
const VAINA = { x: 13.6, y: 3.12, z: 25.7 };
const POOL_BED = 3.1;
const DRAIN_T = 6;
const FORGE_T = 9;
const GHOST_FROM = 3; // ronda
const GHOST_HITS = 8;
const GHOST_SPEED = 7;
// el circuito del granadero en el Parque (dos rectas y dos medias vueltas)
const TRACK = { x0: 99.3, x1: 101.7, z0: 9.5, z1: 51, y: -2.6 };
const R = (TRACK.x1 - TRACK.x0) / 2;
const STRAIGHT = TRACK.z1 - TRACK.z0;
const LAP = STRAIGHT * 2 + Math.PI * R * 2;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpC = new THREE.Color();
const ICON = { hoja: '⟋', emp: '♞', vaina: '▭' };
const NAME = { hoja: 'La hoja', emp: 'La empuñadura', vaina: 'La vaina' };

const myId = (g) => (g.net ? g.net.id : 0);
const isHost = (g) => !g.net || g.net.host;

// Dónde va el granadero a la distancia s del circuito (y para dónde mira).
function trackAt(s, out) {
  s = ((s % LAP) + LAP) % LAP;
  const cx = (TRACK.x0 + TRACK.x1) / 2;
  if (s < STRAIGHT) return out.set(TRACK.x0, 0, TRACK.z0 + s), 0;
  s -= STRAIGHT;
  if (s < Math.PI * R) {
    const a = s / R;
    out.set(cx - Math.cos(a) * R, 0, TRACK.z1 + Math.sin(a) * R);
    return a;
  }
  s -= Math.PI * R;
  if (s < STRAIGHT) return out.set(TRACK.x1, 0, TRACK.z1 - s), Math.PI;
  s -= STRAIGHT;
  const a = s / R;
  out.set(cx + Math.cos(a) * R, 0, TRACK.z0 - Math.sin(a) * R);
  return Math.PI + a;
}

// Materiales propios (para encenderlos sin tocar los del sable de la mano).
// El aro celeste en el piso que marca una pieza tirada.
function partRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.46, 36).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  ring.visible = false;
  return ring;
}

function ownMats(obj) {
  const list = [];
  const seen = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    let m = seen.get(o.material);
    if (!m) {
      m = o.material.clone();
      seen.set(o.material, m);
      if (m.emissive) list.push(m);
    }
    o.material = m;
    o.castShadow = true;
  });
  return list;
}

export default class SableQuest {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'sableQuest';
    g.scene.add(this.root);
    // got: piezas juntadas (del equipo); forge: 0 nada, 1 forjando, 2 listo
    this.st = { got: { hoja: 0, emp: 0, vaina: 0 }, drained: 0, forge: 0, ghost: 0, hits: 0, fx: 0, fz: 0 };
    this.drainK = 0;
    this.forgeT = 0;
    this.ghostS = 0;
    this.ghostFall = 0;
    this.hitSend = 0;
    this.biteT = 0;
    this.hoofT = 0;
    this.buildHoja();
    this.buildValve();
    this.buildForge();
    this.syncHud();
  }

  get M() {
    return this.g.world.M;
  }

  // ---------------- la hoja en la piedra ----------------
  buildHoja() {
    const g = this.g;
    const h = sablePartModel('hoja');
    // de punta, clavada en la terraza al pie de la Proa, apenas inclinada al río
    h.rotation.set(0, Math.PI / 2, Math.PI + 0.22);
    h.position.set(HOJA.x, HOJA.y + 0.62, HOJA.z);
    this.root.add(h);
    // la piedra rajada alrededor
    const crack = new THREE.Mesh(new THREE.CircleGeometry(0.22, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15120e, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    crack.position.set(HOJA.x, HOJA.y + 0.004, HOJA.z);
    crack.scale.set(1, 1, 0.55);
    this.root.add(crack);
    this.hoja = { obj: h, crack };
    g.interact.add({
      kind: 'sable',
      pos: new THREE.Vector3(HOJA.x + 0.75, HOJA.y + 0.3, HOJA.z),
      radius: 1.9,
      holdTime: 1.6,
      wide: true,
      prompt: () => (this.st.got.hoja ? null : { text: 'sacar la hoja', noCost: true, hold: true }),
      cost: () => 0,
      use: () => this.take('hoja'),
    });
  }

  // ---------------- la válvula y la vaina ----------------
  buildValve() {
    const g = this.g;
    const M = this.M;
    const grp = new THREE.Group();
    grp.position.set(VALVE.x, VALVE.y, VALVE.z);
    // el caño que sale del borde y el volante de hierro
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 10), M.iron);
    pipe.position.y = 0.37;
    grp.add(pipe);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), M.bronzeDark || M.iron);
    box.position.y = 0.78;
    grp.add(box);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.92, 0);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 6, 24).rotateX(Math.PI / 2), M.iron));
    for (let i = 0; i < 4; i++) wheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.025).rotateY((i / 4) * Math.PI), M.iron));
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), M.bronzeDark || M.iron));
    grp.add(wheel);
    grp.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.root.add(grp);
    // la vaina, en el fondo (se ve cuando baja el agua), con su aro
    const v = sablePartModel('vaina');
    v.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.3);
    v.position.set(VAINA.x, VAINA.y + 0.03, VAINA.z);
    v.scale.setScalar(1.25);
    v.visible = false;
    this.root.add(v);
    const ring = partRing();
    ring.scale.set(2.2, 1, 1.4);
    ring.position.set(VAINA.x, POOL_BED + 0.012, VAINA.z);
    this.root.add(ring);
    // el fondo vacío: la piedra mojada (más clara que bajo el agua), los
    // charcos que quedan y la rejilla del desagüe junto a la válvula
    const bed = new THREE.Group();
    const gb = new GeoBuilder();
    const by = POOL_BED + 0.004;
    quad(gb, 'bed', [[5, by, 26.55], [20, by, 26.55], [20, by, 15], [5, by, 15]], [0, 1, 0]);
    const wet = M.poolBed.clone();
    wet.color.set(0x9a978c);
    wet.roughness = 0.16;
    bed.add(gb.build({ bed: wet }, { castShadow: false }));
    const pud = new THREE.MeshStandardMaterial({ color: 0x0b1316, roughness: 0.04, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const [px, pz, r, sx] of [[7.2, 17, 0.9, 1.6], [11, 21.2, 0.7, 1.2], [16.8, 16.4, 1.1, 1.3], [18.6, 22.5, 0.6, 2], [9, 25.4, 0.55, 1.5], [14.8, 19.5, 0.5, 1.1]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 12).rotateX(-Math.PI / 2), pud);
      c.position.set(px, by + 0.003, pz);
      c.scale.set(sx, 1, 1);
      c.rotation.y = px * 1.7;
      c.receiveShadow = true;
      bed.add(c);
    }
    const grate = new THREE.Group();
    grate.position.set(VALVE.x, by + 0.006, VALVE.z - 1.0);
    grate.add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505 })));
    for (let i = -2; i <= 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, Math.sqrt(0.3 * 0.3 - (i * 0.1) ** 2) * 2), M.iron);
      b.position.set(i * 0.1, 0.012, 0);
      grate.add(b);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.02, 4, 20).rotateX(Math.PI / 2), M.iron);
    rim.position.y = 0.01;
    grate.add(rim);
    bed.add(grate);
    bed.visible = false;
    this.root.add(bed);
    this.valve = { grp, wheel, vaina: v, ring, bed, water: g.world.mon?.poolWater?.[0] || null };
    this.waterY = this.valve.water?.position.y ?? 3.45;
    g.interact.add({
      kind: 'sable',
      pos: new THREE.Vector3(VALVE.x, VALVE.y + 1.0, VALVE.z + 0.2),
      radius: 1.7,
      holdTime: 1.2,
      prompt: () => {
        if (this.st.drained) return null;
        if (!g.world.power) return { text: 'Necesita electricidad', noCost: true, info: true };
        return { text: 'abrir la válvula', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        if (this.st.drained || !g.world.power) return false;
        if (isHost(g)) this.send({ a: 'drain' });
        return true;
      },
    });
    g.interact.add({
      kind: 'sable',
      pos: new THREE.Vector3(VAINA.x, VALVE.y + 0.8, VAINA.z + 1.0),
      radius: 2.0,
      wide: true,
      prompt: () => (this.st.drained && this.drainK >= 1 && !this.st.got.vaina ? { text: 'agarrar la vaina', noCost: true, hold: true } : null),
      cost: () => 0,
      use: () => this.take('vaina'),
    });
  }

  // ---------------- el granadero fantasma ----------------
  ensureGhost() {
    if (this.ghost) return this.ghost;
    const g = this.g;
    const G = cargaGeos();
    const mat = cargaGhostMat();
    const mk = (geo, n) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.renderOrder = 7;
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, ZERO);
        im.setColorAt(i, tmpC.setRGB(1, 1, 1));
      }
      return im;
    };
    const grp = new THREE.Group();
    const meshes = { rider: mk(G.rider, 1), upper: mk(G.upper, 4), lower: mk(G.lower, 4) };
    grp.add(meshes.rider, meshes.upper, meshes.lower);
    this.root.add(grp);
    warmObject(g, grp);
    // la empuñadura que lleva y que deja caer
    const emp = sablePartModel('empunadura');
    emp.visible = false;
    this.root.add(emp);
    // el aro celeste en el piso donde quedó tirada
    const ring = partRing();
    this.root.add(ring);
    this.ghost = { grp, meshes, emp, ring, pos: new THREE.Vector3(), yaw: 0, ph: 0, f: 0 };
    return this.ghost;
  }

  ghostDraw(dt) {
    const G = this.ghost;
    if (!G) return;
    const M = G.meshes;
    const alive = this.st.ghost === 1;
    const falling = this.ghostFall > 0;
    G.f = alive ? Math.min(1, G.f + dt * 0.8) : falling ? Math.max(0, 1 - this.ghostFall / 1.6) : 0;
    if (G.f <= 0.003) {
      for (const im of [M.rider, M.upper, M.lower]) {
        for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
        im.instanceMatrix.needsUpdate = true;
      }
      G.grp.visible = false;
      return;
    }
    G.grp.visible = true;
    CARGA_TIME.value = this.g.time;
    const ph = G.ph;
    // el que cae se para de manos y se deshace
    const rear = falling ? Math.min(1, this.ghostFall * 2) : 0;
    const pitch = falling ? -0.55 * rear : Math.sin(ph * 2) * 0.06;
    const y = falling ? 0.25 * rear : Math.abs(Math.sin(ph)) * 0.12;
    tmpV.set(G.pos.x, TRACK.y + y, G.pos.z);
    tmpE.set(pitch, G.yaw, Math.sin(ph) * 0.03, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpV, tmpQ, tmpS);
    M.rider.setMatrixAt(0, tmpM);
    const f = G.f * (0.85 + 0.15 * Math.sin(this.g.time * 9));
    M.rider.setColorAt(0, tmpC.setRGB(f, f, f));
    const a = falling ? 0.3 : 0.86;
    const legs = [Math.sin(ph) * a, Math.sin(ph + 0.5) * a, Math.sin(ph + Math.PI) * a, Math.sin(ph + Math.PI + 0.5) * a];
    for (let k = 0; k < 4; k++) {
      const [lx, lz] = CARGA_LEGS[k];
      const front = lz > 0;
      const sw = legs[k] + (falling && front ? -0.9 * rear : 0);
      tmpE.set(sw, 0, 0, 'YXZ');
      tmpL.makeRotationFromEuler(tmpE).setPosition(lx, CARGA_HIP, lz);
      tmpR.multiplyMatrices(tmpM, tmpL);
      M.upper.setMatrixAt(k, tmpR);
      tmpL.makeRotationX((front ? -1 : 1) * (0.25 + Math.max(0, front ? -sw : sw) * 0.75)).setPosition(0, -CARGA_UPPER, 0);
      M.lower.setMatrixAt(k, tmpR.multiply(tmpL));
      M.upper.setColorAt(k, tmpC.setRGB(f, f, f));
      M.lower.setColorAt(k, tmpC);
    }
    for (const im of [M.rider, M.upper, M.lower]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  updateGhost(dt) {
    const g = this.g;
    const st = this.st;
    // aparece desde la ronda 3 (lo larga el anfitrión)
    if (isHost(g) && st.ghost === 0 && !st.got.emp && (g.rounds?.round || 0) >= GHOST_FROM) this.send({ a: 'ride' });
    if (st.ghost === 0 && !this.ghostFall) return;
    const G = this.ensureGhost();
    if (st.ghost === 1) {
      this.ghostS += dt * GHOST_SPEED;
      G.yaw = trackAt(this.ghostS, G.pos);
      G.ph += dt * 11;
      // los cascos (y el temblor si pasa cerca)
      this.hoofT -= dt;
      const d = Math.hypot(g.player.pos.x - G.pos.x, g.player.pos.z - G.pos.z);
      if (this.hoofT <= 0) {
        this.hoofT = 0.36;
        const A = g.audio;
        if (A?.ctx && A.hoof && d < 45) {
          const o = A.out({ pos: tmpV2.set(G.pos.x, TRACK.y + 0.3, G.pos.z), gain: 0.7, reverb: 0.5, ref: 5 });
          for (let i = 0; i < 3; i++) A.hoof(o, A.now + i * 0.07, 0.8);
        }
        if (Math.random() < 0.08) g.audio.neigh?.(tmpV2.set(G.pos.x, TRACK.y + 2, G.pos.z), 0.7);
      }
      if (d < 8) g.fx.addShake(dt * 0.5 * (1 - d / 8));
      // el que se le cruza se lleva un sablazo
      this.biteT -= dt;
      if (d < 1.1 && Math.abs(g.player.pos.y - TRACK.y) < 1.5 && this.biteT <= 0 && g.player.alive && !g.player.downed) {
        this.biteT = 1.5;
        g.player.damage(35, tmpV2.set(G.pos.x, TRACK.y + 1, G.pos.z));
        g.audio.saber?.(tmpV2.clone());
      }
      // un resplandor celeste que lo sigue
      if (Math.random() < dt * 4) g.fx.flash(tmpV2.set(G.pos.x, TRACK.y + 1.8, G.pos.z), 0x6fbcff, 4, 0.3, 9);
      // la empuñadura en la mano del jinete (va con él)
      G.emp.visible = false;
    } else if (this.ghostFall > 0) {
      this.ghostFall += dt;
      G.ph += dt * 3;
      if (this.ghostFall > 1.6) this.ghostFall = 0;
    }
    this.ghostDraw(dt);
  }

  // Un tiro (Weapons.onShot, en esta compu): ¿le dio al granadero?
  onShot(o, d, maxT) {
    const G = this.ghost;
    if (!G || this.st.ghost !== 1) return;
    const hit = (cx, cy, cz, r) => {
      const ox = o.x - cx;
      const oy = o.y - cy;
      const oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const h = b * b - c;
      if (h < 0) return false;
      const t = -b - Math.sqrt(h);
      return t > 0 && t < maxT;
    };
    const P = G.pos;
    if (!hit(P.x, TRACK.y + 1.25, P.z, 0.95) && !hit(P.x, TRACK.y + 2.15, P.z, 0.48)) return;
    const g = this.g;
    // (una sola por tiro de escopeta)
    if (g.time - this.hitSend < 0.09) return;
    this.hitSend = g.time;
    g.hud.hitmarker?.(false);
    g.fx.sparkle(tmpV.set(P.x, TRACK.y + 1.6, P.z), [0.5, 0.75, 1], 6, 0.6);
    if (isHost(g)) this.ghostHit();
    else g.net.net.send({ t: 'pee', k: 'sbl', a: 'hit' });
  }

  ghostHit() {
    const st = this.st;
    if (st.ghost !== 1) return;
    st.hits++;
    if (st.hits >= GHOST_HITS) {
      const P = this.ghost.pos;
      const fx = Math.max(98.7, Math.min(102.3, P.x));
      const fz = Math.max(7, Math.min(53, P.z));
      this.send({ a: 'fall', x: +fx.toFixed(2), z: +fz.toFixed(2) });
    }
  }

  // ---------------- la forja en la Llama ----------------
  buildForge() {
    const g = this.g;
    // (la Llama, world/papLlama.js, se arma después: se usa su lugar del config)
    const L = new THREE.Vector3(EE.llama[0], 4.2, EE.llama[1]);
    this.llamaPos = L;
    const s = sableModel(0);
    s.visible = false;
    s.scale.setScalar(1.4);
    this.root.add(s);
    this.forged = { obj: s, mats: ownMats(s) };
    // las tres piezas que bajan al fuego
    this.forgeParts = PARTS.map((k) => {
      const p = sablePartModel(k === 'emp' ? 'empunadura' : k);
      p.visible = false;
      ownMats(p);
      this.root.add(p);
      return p;
    });
    g.interact.add({
      kind: 'sable',
      pos: new THREE.Vector3(L.x, L.y + 1.2, L.z + 1.35),
      radius: 1.8,
      prompt: () => {
        const st = this.st;
        if (st.forge === 2) return g.weapons.has('sable') ? null : { text: 'agarrar el Sable Corvo', noCost: true, hold: true };
        if (st.forge === 1) return null;
        if (!PARTS.every((k) => st.got[k])) return null;
        if ((g.papq?.termas?.st || 0) < 2) return { text: 'Necesita la Llama encendida', noCost: true, info: true };
        return { text: 'forjar el Sable Corvo', noCost: true, hold: true };
      },
      cost: () => 0,
      use: () => {
        const st = this.st;
        const who = g.net?.useFrom ?? myId(g);
        if (st.forge === 2) {
          if (who === myId(g)) this.giveSable();
          else g.net?.event('pee', { k: 'sbl', a: 'give', id: who });
          return true;
        }
        if (st.forge !== 0 || !PARTS.every((k) => st.got[k]) || (g.papq?.termas?.st || 0) < 2) return false;
        if (isHost(g)) this.send({ a: 'forge' });
        return true;
      },
    });
  }

  giveSable() {
    const g = this.g;
    g.weapons.sable.give(0);
    g.audio.saber?.(g.player.pos.clone().setY(g.player.pos.y + 1.4));
  }

  updateForge(dt) {
    const g = this.g;
    const st = this.st;
    const S = this.forged;
    const L = this.llamaPos;
    if (st.forge === 0) return;
    if (st.forge === 1) {
      this.forgeT += dt;
      const t = this.forgeT;
      // 0-2 s: las piezas giran sobre la Llama y bajan al fuego
      this.forgeParts.forEach((p, i) => {
        const k = Math.min(1, t / (1.6 + i * 0.25));
        const a = t * 2.2 + (i * Math.PI * 2) / 3;
        const r = 0.8 * (1 - k);
        p.visible = k < 1;
        p.position.set(L.x + Math.cos(a) * r, L.y + 1.5 + 2.2 * (1 - k * k), L.z + Math.sin(a) * r);
        p.rotation.set(0, -a, Math.PI * k);
        p.scale.setScalar(1.3);
      });
      // los martillazos
      const hits = [2.4, 3.1, 3.8, 4.5, 5.2];
      for (const h of hits) {
        if (t - dt < h && t >= h) {
          sfxClang(g.audio, tmpV.set(L.x, L.y + 1.6, L.z).clone(), 1.2);
          g.fx.sparks(tmpV.set(L.x, L.y + 1.7, L.z), 3, { x: 0, y: 1, z: 0 });
          g.fx.flash(tmpV, 0xffa040, 30, 0.2, 12);
        }
      }
      // 2,2 s en adelante: el sable sale de la llama al rojo, sube y se enfría
      const up = Math.max(0, Math.min(1, (t - 2.2) / 2.6));
      S.obj.visible = t > 2.2;
      S.obj.position.set(L.x, L.y + 2.3 + (1 - (1 - up) * (1 - up)) * 1.7, L.z + 0.15);
      S.obj.rotation.set(0, t * 1.4, 0);
      const heat = t < 6 ? 1 : Math.max(0, 1 - (t - 6) / 2.5);
      for (const m of S.mats) {
        m.emissive.setRGB(1, 0.2, 0.03);
        m.emissiveIntensity = heat * 3.2;
      }
      if (t > 2.2 && Math.random() < dt * 20 * heat) g.fx.sparkle(tmpV.set(L.x, S.obj.position.y + Math.random() * 1.2, L.z + 0.15), [1, 0.6, 0.2], 1, 0.3);
      if (t - dt < 6 && t >= 6) {
        g.fx.steam(tmpV.set(L.x, L.y + 4.4, L.z), 16, 0.5);
        g.audio.kettle?.(tmpV.clone(), 0.4);
      }
      if (t >= FORGE_T && isHost(g)) this.send({ a: 'ready' });
      return;
    }
    // listo: flota sobre la Llama, girando despacio
    S.obj.visible = true;
    S.obj.position.set(L.x, L.y + 4.0 + Math.sin(g.time * 1.3) * 0.06, L.z + 0.15);
    S.obj.rotation.set(0, g.time * 0.7, 0);
    for (const m of S.mats) m.emissiveIntensity = 0;
    if (Math.random() < dt * 3) g.fx.sparkle(tmpV.set(L.x, L.y + 4.6, L.z + 0.15), [0.7, 0.85, 1], 1, 0.6);
  }

  // ---------------- piezas ----------------
  take(kind) {
    const g = this.g;
    const st = this.st;
    if (st.got[kind]) return false;
    if (kind === 'vaina' && !(st.drained && this.drainK >= 1)) return false;
    if (kind === 'emp' && st.ghost !== 2) return false;
    if (isHost(g)) this.send({ a: 'take', p: kind, by: g.net?.useFrom ?? myId(g) });
    return true;
  }

  // El agua que se va por el desagüe: el volante que rechina y el remolino.
  drainSound() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now;
    const o = A.out({ pos: tmpV.set(VALVE.x, VALVE.y + 0.5, VALVE.z - 1.5), gain: 0.9, reverb: 0.3, ref: 4 });
    A.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 1400, freqEnd: 900, q: 6, gain: 0.25, attack: 0.05 });
    A.noise(o, { t: t + 0.3, dur: DRAIN_T, type: 'lowpass', freq: 520, freqEnd: 180, gain: 0.55, attack: 0.8 });
    for (let i = 0; i < 26; i++) {
      const at = t + 0.5 + Math.random() * (DRAIN_T - 0.8);
      const f = 240 + Math.random() * 320;
      A.tone(o, { t: at, dur: 0.09, type: 'sine', freq: f, freqEnd: f * 2.2, gain: 0.07 });
    }
  }

  syncHud() {
    const g = this.g;
    const st = this.st;
    const any = PARTS.some((k) => st.got[k]);
    if (!any || st.forge) {
      if (this.hudOn) g.hud.setCraftText?.(null);
      this.hudOn = false;
      return;
    }
    this.hudOn = true;
    g.hud.setCraftText?.(`<span>Sable Corvo</span>${PARTS.map((k) => `<i class="${st.got[k] ? 'is-got' : ''}" title="${NAME[k]}">${ICON[k]}</i>`).join('')}`);
  }

  // ---------------- la red ----------------
  // El anfitrión decide y avisa a todos (y lo aplica él mismo).
  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'sbl', ...m });
  }

  onGuest(m, from) {
    if (m.a === 'hit') this.ghostHit();
    void from;
  }

  apply(m) {
    const g = this.g;
    const st = this.st;
    switch (m.a) {
      case 'take': {
        if (st.got[m.p]) return;
        st.got[m.p] = 1;
        if (m.p === 'hoja') {
          this.hoja.obj.visible = false;
          g.fx.sparks(tmpV.set(HOJA.x, HOJA.y + 0.4, HOJA.z), 2, { x: 0, y: 1, z: 0 });
          sfxClang(g.audio, tmpV.clone(), 0.8);
          g.fx.dust?.(tmpV.set(HOJA.x, HOJA.y + 0.05, HOJA.z), { x: 0, y: 1, z: 0 }, [0.6, 0.55, 0.48], 10);
        } else if (m.p === 'vaina') this.valve.vaina.visible = false;
        else if (m.p === 'emp' && this.ghost) this.ghost.emp.visible = this.ghost.ring.visible = false;
        if (m.by === myId(g) || !g.net) g.audio.powerupGrab?.();
        g.hud.toast?.(`${NAME[m.p]} del Sable Corvo`);
        this.syncHud();
        // las tres: a dónde se llevan
        if (PARTS.every((k) => st.got[k])) g.hud.subtitle?.('El Sable Corvo se forja en la Llama Votiva', 4);
        break;
      }
      case 'drain':
        st.drained = 1;
        this.drainSound();
        break;
      case 'ride':
        if (st.ghost) return;
        st.ghost = 1;
        st.hits = 0;
        this.ghostS = 0;
        this.ensureGhost();
        g.audio.bugle?.(tmpV.set(100.5, TRACK.y + 2, 30));
        if (Math.hypot(g.player.pos.x - 100.5, g.player.pos.z - 30) < 40) g.hud.subtitle?.('Un granadero fantasma galopa en el Parque.', 3);
        break;
      case 'fall': {
        if (st.ghost === 2) return;
        st.ghost = 2;
        st.fx = m.x;
        st.fz = m.z;
        this.ghostFall = 0.001;
        const G = this.ensureGhost();
        G.pos.set(m.x, 0, m.z);
        g.audio.neigh?.(tmpV.set(m.x, TRACK.y + 2, m.z), 1.2);
        g.fx.flash(tmpV.set(m.x, TRACK.y + 1.5, m.z), 0x8ac8ff, 30, 0.5, 14);
        g.fx.sparkle(tmpV, [0.6, 0.85, 1], 24, 1.4);
        this.dropEmp();
        break;
      }
      case 'forge':
        st.forge = 1;
        this.forgeT = 0;
        this.syncHud();
        break;
      case 'ready':
        st.forge = 2;
        for (const p of this.forgeParts) p.visible = false;
        g.fx.flash(tmpV.set(this.llamaPos.x, this.llamaPos.y + 3, this.llamaPos.z), 0xcfe6ff, 40, 0.6, 16);
        g.audio.bugle?.(tmpV.clone());
        g.hud.achievement?.('Sable Corvo', 'El sable de San Martín');
        break;
      case 'give':
        if (m.id === myId(g)) this.giveSable();
        break;
      default:
    }
  }

  // la empuñadura queda tirada donde cayó el granadero
  dropEmp() {
    const g = this.g;
    const st = this.st;
    const G = this.ensureGhost();
    G.emp.visible = !st.got.emp;
    G.emp.position.set(st.fx, TRACK.y + 0.06, st.fz);
    G.emp.rotation.set(Math.PI / 2, 0, 0.6);
    G.emp.scale.setScalar(1.3);
    G.ring.visible = !st.got.emp;
    G.ring.position.set(st.fx, TRACK.y + 0.03, st.fz);
    if (!this.empItem) {
      this.empItem = g.interact.add({
        kind: 'sable',
        pos: new THREE.Vector3(st.fx, TRACK.y + 0.6, st.fz),
        radius: 1.8,
        wide: true,
        prompt: () => (this.st.ghost === 2 && !this.st.got.emp ? { text: 'agarrar la empuñadura', noCost: true, hold: true } : null),
        cost: () => 0,
        use: () => this.take('emp'),
      });
    } else this.empItem.pos.set(st.fx, TRACK.y + 0.6, st.fz);
  }

  state() {
    const st = this.st;
    return { got: { ...st.got }, drained: st.drained, forge: st.forge, ghost: st.ghost, hits: st.hits, fx: st.fx, fz: st.fz };
  }

  applyFull(s) {
    if (!s) return;
    const st = this.st;
    Object.assign(st.got, s.got || {});
    st.drained = s.drained || 0;
    st.hits = s.hits || 0;
    st.fx = s.fx || 0;
    st.fz = s.fz || 0;
    if (st.got.hoja) this.hoja.obj.visible = false;
    if (st.drained) this.drainK = 1;
    if (s.ghost === 1 && st.ghost !== 1) {
      st.ghost = 1;
      this.ensureGhost();
    } else if (s.ghost === 2) {
      st.ghost = 2;
      this.dropEmp();
    }
    st.forge = s.forge || 0;
    if (st.forge === 1) this.forgeT = 0;
    this.syncHud();
  }

  update(dt) {
    const g = this.g;
    const st = this.st;
    // la hoja brilla con la luna de vez en cuando
    if (!st.got.hoja && Math.random() < dt * 0.8) g.fx.sparkle(tmpV.set(HOJA.x, HOJA.y + 0.4 + Math.random() * 0.4, HOJA.z), [0.85, 0.92, 1], 1, 0.1);
    // el agua que se va por la válvula (gira el volante, baja el nivel, burbujea)
    if (st.drained && this.drainK < 1) {
      this.drainK = Math.min(1, this.drainK + dt / DRAIN_T);
      this.valve.wheel.rotation.y += dt * 4;
      if (Math.random() < dt * 10) g.fx.steam(tmpV.set(VAINA.x + (Math.random() - 0.5) * 4, this.waterY, VAINA.z - 4 + (Math.random() - 0.5) * 4), 2, 0.4);
    }
    const W = this.valve.water;
    if (W) {
      W.position.y = this.waterY + (POOL_BED - 0.02 - this.waterY) * this.drainK;
      W.visible = this.drainK < 0.999;
    }
    const V = this.valve;
    V.bed.visible = st.drained > 0;
    V.vaina.visible = this.drainK > 0.85 && !st.got.vaina;
    V.ring.visible = V.vaina.visible;
    if (V.vaina.visible) {
      V.ring.material.opacity = Math.min(1, (this.drainK - 0.85) * 7) * (0.35 + Math.sin(g.time * 3) * 0.2);
      if (Math.random() < dt * 3) g.fx.sparkle(tmpV.set(VAINA.x, VAINA.y + 0.15, VAINA.z), [0.7, 0.85, 1], 1, 0.4);
    }
    this.updateGhost(dt);
    if (st.ghost === 2 && !st.got.emp && this.ghost) {
      const R = this.ghost.ring;
      R.material.opacity = 0.35 + Math.sin(g.time * 3) * 0.2;
      R.scale.setScalar(1 + Math.sin(g.time * 1.5) * 0.08);
      if (Math.random() < dt * 3) g.fx.sparkle(tmpV.set(st.fx, TRACK.y + 0.25, st.fz), [0.7, 0.85, 1], 1, 0.4);
    }
    this.updateForge(dt);
  }

  dispose() {
    this.root.removeFromParent();
    this.g.hud?.setCraftText?.(null);
  }
}
