import * as THREE from 'three';
import { WEAPONS, weaponStats } from '../config/weapons';
import { zombieHealth, bossHealth } from '../config/rules';
import { VM, registerMate } from './viewmodels';
import { mistEye, eyeMats } from './cazadorModels';

// El Cazador del Caos: el potenciador de Eclipse Matero (entities/Powerups
// PERSONAL.caos), un arma temporal propia de 20 s. v4 (el usuario: "el
// powerup especial es muy pedorro, tanto en animaciones como en poder"):
//  · Agarrarlo: el destello, la pantalla que se rasga un instante, las manos
//    que se vuelven bruma violeta con ojos, su sonido; de fondo, el zumbido del
//    vacío mientras dura; el jugador corre más (config moveMult).
//  · Izquierdo: un rayo de vacío que salta de muerto en muerto (chain.jumps
//    saltos) y los parte al medio.
//  · Derecho: la succión. Un agujero negro adelante que arrastra todo lo de
//    suck.radius m, se los traga (los ejecuta) y cada uno cura.
//  · Cada muerto del Cazador revienta en esquirlas negras que lastiman a los
//    de al lado (una vez: las esquirlas no hacen más esquirlas).
// Con el Desgarrador en la mano el potenciador no da esto: la guadaña se
// vuelve la ejecutora (Powerups.applyEffect → Desgarrador.exec), v4 mucho más
// fuerte (config desgarrador.exec).
// Lo maneja Desgarrador (update, ghost, clear); Weapons le pasa el gatillo
// (input, rama de las armas temporales). En línea va por 'desg' (zc el rayo,
// zs la succión, zx las esquirlas; zm la bruma de la v3, por compatibilidad).

const ID = 'cazador';
const EYES = (1 << 14) | (1 << 15);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const near = [];
const hitTmp = {};
const rnd = () => Math.random() - 0.5;
const big = (z) => !!(z.boss || z.pombero || z.crow || z.mandinga || z.yasy || z.jinete);
const chest = (z, out) => out.set(z.pos.x, (z.baseY ?? z.pos.y ?? 0) + (z.dog ? 0.5 : 1.15) * (z.scale || 1), z.pos.z);
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const VIOLET = [0.62, 0.3, 1];
const PINK = [1, 0.4, 0.8];
const MIST = [
  [0.42, 0.16, 0.85],
  [0.78, 0.28, 0.66],
  [0.58, 0.28, 0.92],
];

// ---------------- la bruma (el modelo de la mano) ----------------
// Humo violeta: ruido que gira, más denso en el borde, el corazón rosa. uNs:
// la escala del ruido (la bola de la palma, o las manos, que son chiquitas).
// (sin isnan ni pow sobre lo que puede ser negativo)
const MIST_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const MIST_FS = `
uniform float uTime, uK, uNs;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
void main(){
  vec3 v = vV / max(length(vV), 1e-4);
  float f = 1.0 - clamp(abs(dot(normalize(vN), v)), 0.0, 1.0);
  float a = uTime * 1.7;
  vec3 q = vec3(vP.x * cos(a) - vP.z * sin(a), vP.y - uTime * 0.35 / max(uNs * 0.3, 1.0), vP.x * sin(a) + vP.z * cos(a)) * uNs;
  float n = n3(q) * 0.6 + n3(q * 2.2 + 3.0) * 0.4;
  float swirl = smoothstep(0.35, 0.9, n);
  float a1 = (0.12 + f * f * 0.75) * (0.45 + swirl * 0.9) * clamp(uK, 0.0, 2.0);
  vec3 col = mix(vec3(0.55, 0.22, 1.0), vec3(1.0, 0.42, 0.85), swirl * (1.0 - f));
  gl_FragColor = vec4(col * a1 * 0.85, a1);
}`;
let MIST_MAT = null;
function mistMats() {
  if (MIST_MAT) return MIST_MAT;
  const add = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, ...o });
  const shell = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uNs: { value: 3.2 } }, vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide, forceSinglePass: true, fog: false, toneMapped: false });
  // (las manos: el mismo programa, el ruido más fino)
  const hand = shell.clone();
  hand.uniforms = { uTime: shell.uniforms.uTime, uK: { value: 1 }, uNs: { value: 70 } };
  MIST_MAT = {
    shell,
    hand,
    // (v4: el corazón es vacío: negro; las volutas, más tenues)
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.0, 0.06), toneMapped: false, fog: false }),
    wisp: add({ color: new THREE.Color(0.85, 0.45, 1).multiplyScalar(0.6), side: THREE.DoubleSide }),
    eye: add({ color: new THREE.Color(0.75, 0.3, 1).multiplyScalar(2.2) }),
  };
  return MIST_MAT;
}

// Una mano de bruma: la mano de primera persona con la carne hecha vacío
// (oscura, medio transparente) y la bruma encima; la manga, vacío.
function mistHand(M, left) {
  const B = mistMats();
  const E = eyeMats();
  const R = 0.05;
  const h = VM.cupHand(M, (y) => Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))) * 0.92, R * 1.15);
  const glow = [];
  h.traverse((o) => {
    if (!o.isMesh) return;
    const skin = o.material === M.skin || o.material === M.nail;
    o.material = E.void;
    o.renderOrder = 3;
    if (skin) glow.push(o);
  });
  for (const o of glow) {
    const c = new THREE.Mesh(o.geometry, B.hand);
    c.position.copy(o.position);
    c.quaternion.copy(o.quaternion);
    c.scale.copy(o.scale).multiplyScalar(1.05);
    c.renderOrder = 4;
    o.parent.add(c);
  }
  if (left) h.scale.x = -1;
  return h;
}

registerMate(ID, (up, T) => {
  const M = VM.mats(T);
  const B = mistMats();
  const R = 0.05;
  const g = new THREE.Group();
  // la derecha: abierta, la palma para arriba, con la bola de vacío
  const handR = mistHand(M, false);
  g.add(handR);
  const mist = new THREE.Group();
  mist.position.set(0, R + 0.012, 0);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), B.shell);
  shell.scale.setScalar(0.055);
  shell.renderOrder = 4;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), B.core);
  mist.add(core, shell);
  const wisps = [];
  for (let k = 0; k < 3; k++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.05 + k * 0.012, 0.0022, 4, 40, Math.PI * 1.25), B.wisp);
    w.rotation.set(Math.PI / 2 + (k - 1) * 0.6, 0, (k * Math.PI * 2) / 3);
    w.renderOrder = 5;
    mist.add(w);
    wisps.push(w);
  }
  // los ojos: en la bola, en el dorso de las manos y en las muñecas (miran adelante)
  const eyes = [];
  for (let k = 0; k < 4; k++) {
    const e = mistEye(0.008);
    mist.add(e);
    eyes.push({ o: e, home: null, orbit: true, k });
  }
  g.add(mist);
  const muzzle = new THREE.Object3D();
  mist.add(muzzle);
  // la izquierda: más afuera a la izquierda, abierta hacia adelante
  const left = new THREE.Group();
  const handL = mistHand(M, true);
  left.add(handL);
  left.position.set(-0.26, -0.1, -0.1);
  left.rotation.set(0.7, -0.35, 0.35);
  g.add(left);
  for (const [par, at] of [
    [handR, [0.012, -0.004, 0.03]],
    [handR, [-0.016, -0.012, 0.038]],
    [handR, [0.03, -0.02, 0.055]],
    [left, [-0.01, -0.004, 0.03]],
    [left, [0.02, -0.014, 0.045]],
    [left, [-0.028, -0.024, 0.06]],
  ]) {
    const e = mistEye(0.0085);
    e.position.set(...at);
    par.add(e);
    eyes.push({ o: e, home: e.position.clone(), orbit: false, k: eyes.length });
  }
  const tilt = new THREE.Group();
  // (la derecha adelante, a la derecha y un poco alta: la bruma a la vista)
  g.rotation.set(0.25, 0.35, -0.05);
  g.position.set(-0.05, 0.06, -0.02);
  tilt.add(g);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim: { spin: [], glow: [], wobble: null }, upgraded: false, tip, mouth: null, mate: g, bombGroup: null, yerba: null, caz: { g, mist, shell, core, wisps, eyes, left, base: g.position.clone(), lbase: left.position.clone() } };
});

export default class Cazador {
  constructor(d) {
    this.d = d;
    this.w = d.w;
    this.g = d.g;
    this.mistCd = 0;
    this.suckCd = 0;
    this.chainCd = 0;
    this.pushT = 0;
    this.raiseT = 0;
    this.swell = 0;
    this.form = 0;
    this.clouds = [];
    this.had = false;
    this.hum = null;
    this.shardT = 0;
  }

  get on() {
    return this.w.temp?.id === ID;
  }

  // ---------------- el gatillo (Weapons, rama de las armas temporales) ----------------
  input(input, st, p) {
    if (st?.kind !== 'cazador') return false;
    if (!p.alive || p.downed) return true;
    if (st.chain && globalThis.__mduCazV3 !== true) {
      if (input.mouse.leftPressed || (input.mouse.left && this.chainCd <= 0)) this.tryChain(st);
    } else if (input.mouse.leftPressed || (input.mouse.left && this.mistCd <= 0)) this.tryMist(st);
    if (input.mouse.rightPressed) this.trySuck(st);
    return true;
  }

  // dónde está la bruma en el mundo (del jugador, no de la cámara)
  hand(out) {
    return this.d.handWorld(out, 0.12, -0.12, -0.55);
  }

  // ---------------- el rayo de vacío (izquierdo, v4) ----------------
  // Sale de la mano hacia el primero que está a la vista adelante y salta al
  // más cercano que no tocó, hasta C.jumps; a cada común lo parte al medio
  // (el que lo mata revienta en esquirlas); a los jefes les saca C.boss.
  tryChain(st) {
    const g = this.g;
    if (this.chainCd > 0) return false;
    const C = st.chain;
    this.chainCd = C.cd;
    this.pushT = 0.28;
    const o = this.hand(new THREE.Vector3());
    const eye = this.d.eye(new THREE.Vector3());
    const f = this.d.aim(new THREE.Vector3());
    // el primero: el más cerca de la mira (a la vista, adelante)
    let first = null;
    let best = -1;
    for (const { z, d } of g.zombies.inRadius(eye, C.range, near)) {
      if (z.dead || !z.active || z.state === 'rise') continue;
      chest(z, tmpV);
      tmpV2.subVectors(tmpV, eye);
      const dl = tmpV2.length() || 1;
      const c = tmpV2.dot(f) / dl;
      if (c < 0.86) continue;
      const score = c * 2 - d / C.range;
      if (score <= best) continue;
      if (d > 1.4 && !g.world.clear(eye, tmpV)) continue;
      best = score;
      first = z;
    }
    const pts = [o.clone()];
    const hit = new Set();
    let cur = first;
    let from = o.clone();
    const r = g.rounds?.round || 1;
    let n = 0;
    while (cur && n < C.jumps) {
      hit.add(cur);
      const to = chest(cur, new THREE.Vector3());
      pts.push(to.clone());
      this.bolt(from, to, true);
      const dir = tmpU.subVectors(to, from).setY(0).normalize().clone();
      if (big(cur)) g.zombies.damage(cur, Math.max(C.bossMin, (cur.maxHp || bossHealth(r)) * C.boss), { type: 'scythe', zone: 'torso', point: to.clone(), dir, pup: WEAPONS[ID].bossMult });
      else {
        cur.swallowAt = null;
        if (this.d.hitZ(cur, Math.max(zombieHealth(r), cur.maxHp || 0) * 1.2, { type: 'slice', zone: 'torso', point: to.clone(), dir }, 'rayo-caos')) this.onKill(cur, false, true);
      }
      n++;
      from = to;
      // el siguiente: el más cerca de este que no tocó (a la vista)
      let nx = null;
      let nd = C.hop;
      for (const { z, d } of g.zombies.inRadius(to, C.hop, near)) {
        if (hit.has(z) || z.dead || !z.active || z.state === 'rise') continue;
        if (d < nd && g.world.clear(to, chest(z, tmpV))) {
          nd = d;
          nx = z;
        }
      }
      cur = nx;
    }
    // sin nadie: el rayo va igual a la mira (corto) y chisporrotea
    if (!n) {
      const reach = Math.min(12, g.world.raycast(eye, f, 12, hitTmp));
      const end = eye.clone().addScaledVector(f, Number.isFinite(reach) ? reach : 12);
      pts.push(end);
      this.bolt(o, end, true);
    }
    if (n) g.hud.hitmarker(false);
    this.d.fx.play('caz-rayo', { gain: 0.9, rate: 0.95 + Math.random() * 0.1 });
    g.fx.addShake(0.06 + n * 0.02);
    g.net?.share('desg', { k: 'zc', id: g.net.id, l: pts.slice(0, 8).map(r2) });
    g.stats.shots++;
    return true;
  }

  // Un rayo de vacío de a a b: violeta grueso, el corazón rosa, chispas.
  bolt(a, b, own) {
    const g = this.g;
    // (un zigzag propio, más grueso que el del Wunder-Mate: violeta, el corazón rosa y blanco)
    const segs = 8;
    const len = a.distanceTo(b);
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i < segs) p.add(tmpU.set(rnd(), rnd(), rnd()).multiplyScalar(Math.min(1.2, len * 0.12)));
      g.fx.beam(prev, p, { color: 0x6a1cff, width: 0.22, life: 0.3 });
      g.fx.beam(prev, p, { color: 0xff7ae0, width: 0.08, life: 0.22 });
      g.fx.beam(prev, p, { color: 0xffffff, width: 0.025, life: 0.14 });
      prev = p;
    }
    g.fx.flash(b, 0x9040ff, own ? 4 : 3, 0.18, 6);
    g.fx.sparkle(b, PINK, 4, 0.5);
    for (let i = 0; i < 6; i++) g.fx.add.spawn(b.x, b.y, b.z, rnd() * 4, Math.random() * 3, rnd() * 4, { color: MIST[i % 3], size: 0.05, size1: 0, life: 0.35, drag: 3 });
  }

  // ---------------- la bruma que se tira (la v3; con __mduCazV3) ----------------
  tryMist(st) {
    const g = this.g;
    if (this.mistCd > 0) return false;
    const M = st.mist;
    this.mistCd = M.cd;
    this.pushT = 0.32;
    const o = this.hand(new THREE.Vector3());
    const f = this.d.aim(new THREE.Vector3());
    this.cloud(o, f, M, true);
    this.d.fx.play('caz-bruma', { gain: 0.9, rate: 0.95 + Math.random() * 0.1 });
    g.net?.share('desg', { k: 'zm', id: g.net.id, o: r2(o), f: r2(f) });
    g.stats.shots++;
    return true;
  }

  cloud(o, f, M, own) {
    const c = { o: o.clone().addScaledVector(f, 0.9), f: f.clone().normalize(), t: 0, life: M.time, M, own, tick: 0, hit: new Map(), seen: new Map() };
    this.clouds.push(c);
    this.g.fx.flash(o, 0xb050ff, 4, 0.2, 6);
    return c;
  }

  stepCloud(c, dt) {
    const g = this.g;
    const M = c.M;
    c.t += dt;
    const k = c.t / c.life;
    const n = c.t < 0.5 ? 9 : c.t < 1.1 ? 3 : 1;
    const side = tmpU.set(-c.f.z, 0, c.f.x).normalize();
    for (let i = 0; i < n; i++) {
      const sp = 4 + Math.random() * 6;
      const spread = Math.sqrt(1 - M.cos * M.cos) * 0.9;
      const vx = c.f.x * sp + side.x * rnd() * sp * spread * 2;
      const vy = c.f.y * sp + rnd() * sp * spread * 1.2;
      const vz = c.f.z * sp + side.z * rnd() * sp * spread * 2;
      const col = MIST[(Math.random() * 3) | 0];
      g.fx.alpha.spawn(c.o.x, c.o.y, c.o.z, vx, vy, vz, { color: col, size: 0.2, size1: 1.0 + Math.random() * 0.7, life: 0.7 + Math.random() * 0.5, alpha: 0.17, drag: 2.2 });
      if (i % 3 === 0) g.fx.add.spawn(c.o.x, c.o.y, c.o.z, vx * 1.1, vy, vz * 1.1, { color: col, size: 0.06, size1: 0, life: 0.6, drag: 1.8 });
    }
    if (!c.own) return k >= 1;
    c.tick -= dt;
    if (c.tick <= 0) {
      c.tick = 0.1;
      const reach = Math.min(M.range, 2 + c.t * 9);
      for (const { z } of g.zombies.inRadius(c.o, reach + 1, near)) {
        if (z.dead || !z.active || z.state === 'rise') continue;
        chest(z, tmpV);
        tmpV2.subVectors(tmpV, c.o);
        const d = tmpV2.length();
        if (d > reach || d < 0.01) continue;
        tmpV2.divideScalar(d);
        if (tmpV2.dot(c.f) < M.cos && d > 1.6) continue;
        if (!c.seen.has(z)) c.seen.set(z, d < 1.4 || g.world.raycast(c.o, tmpV2, d, hitTmp) >= d - 0.5);
        if (!c.seen.get(z)) continue;
        if (big(z)) {
          g.zombies.damage(z, (z.maxHp || bossHealth(g.rounds?.round || 1)) * M.boss * 0.1, { type: 'scythe', zone: 'torso', point: tmpV.clone(), pup: WEAPONS[ID].bossMult });
          continue;
        }
        const acc = (c.hit.get(z) || 0) + 0.1;
        c.hit.set(z, acc);
        if (Math.random() < 0.5) g.fx.sparkle(tmpV, PINK, 2, 0.5);
        if (acc >= M.kill) this.dissolve(z);
      }
    }
    return k >= 1;
  }

  dissolve(z) {
    const g = this.g;
    const D = this.d;
    D.fx.dust(z, 4, 'exec');
    const was = !!z.dead;
    g.zombies.damage(z, 1e9, { type: 'luz', zone: 'torso', point: chest(z, new THREE.Vector3()) });
    const killed = g.net?.guest ? true : !was && (z.dead || !z.active);
    if (killed) this.onKill(z, false);
  }

  // ---------------- la succión (derecho) ----------------
  // v4: un agujero negro a S.at m adelante; todo lo de S.radius m (a la vista o
  // pegado) se estira hacia él y entra: ejecutados; cada uno cura.
  trySuck(st) {
    const g = this.g;
    if (this.suckCd > 0) {
      g.audio.deny?.();
      return false;
    }
    const S = st.suck;
    this.suckCd = S.cd;
    this.raiseT = 0.8;
    const P = g.player.pos;
    const eye = this.d.eye(new THREE.Vector3());
    const f = this.d.aim(new THREE.Vector3(), true);
    // (el agujero: adelante, a la altura del pecho; si hay pared, antes)
    const at = S.at || 0;
    let H;
    if (at > 0 && globalThis.__mduCazV3 !== true) {
      const wall = g.world.raycast(eye, f, at + 0.5, hitTmp);
      const dd = Math.max(1.2, Math.min(at, (Number.isFinite(wall) ? wall : at + 0.5) - 0.5));
      H = new THREE.Vector3(P.x + f.x * dd, eye.y - 0.35, P.z + f.z * dd);
    } else H = this.hand(new THREE.Vector3());
    const list = [];
    for (const { z, d } of g.zombies.inRadius(P, S.radius, near)) {
      if (z.dead || !z.active || z.state === 'rise' || Math.abs(z.pos.y - P.y) > 3) continue;
      chest(z, tmpV);
      if (d > 1.4 && !g.world.clear(eye, tmpV)) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    const ids = [];
    const r = g.rounds?.round || 1;
    let n = 0;
    for (const { z, d } of list.slice(0, S.targets)) {
      chest(z, tmpV);
      if (big(z)) {
        g.zombies.damage(z, Math.max(S.bossMin, (z.maxHp || bossHealth(r)) * S.boss), { type: 'scythe', zone: 'torso', point: tmpV.clone(), pup: WEAPONS[ID].bossMult });
        continue;
      }
      this.eyesOut(z);
      const dur = S.time * (0.55 + (d / S.radius) * 0.6);
      const was = !!z.dead;
      z.swallowAt = { p: H.clone(), t: g.time, dur };
      if (g.net) this.d.swq.push([z === g.zombies.boss ? 0xffff : z.id & 0xffff, +H.x.toFixed(2), +H.y.toFixed(2), +H.z.toFixed(2), +dur.toFixed(2)]);
      const amount = Math.max(zombieHealth(r), z.maxHp || 0) * 1.2;
      g.zombies.damage(z, amount, { type: 'slice', zone: 'torso', point: tmpV.clone(), dir: tmpV2.subVectors(H, z.pos).setY(0).normalize().clone() });
      const killed = g.net?.guest ? true : !was && z.dead;
      if (killed) this.onKill(z, true);
      ids.push(z === g.zombies.boss ? 0xffff : z.id & 0xffff);
      n++;
    }
    this.suckFx(H, S.radius, n);
    if (n) g.hud.hitmarker(false);
    g.net?.share('desg', { k: 'zs', id: g.net.id, p: r2(H), l: ids, v: at > 0 ? 1 : 0 });
    g.stats.shots++;
    return true;
  }

  // Los ojos violetas que se apagan: el brillo sale de la cabeza en una chispa.
  eyesOut(z) {
    const g = this.g;
    if (z.hidden & EYES) return;
    z.hidden |= EYES;
    const y = (z.baseY ?? z.pos.y ?? 0) + 1.62 * (z.scale || 1);
    tmpV.set(z.pos.x, y, z.pos.z);
    g.fx.sparkle(tmpV, VIOLET, 5, 0.35);
    for (let i = 0; i < 6; i++) g.fx.add.spawn(tmpV.x, tmpV.y, tmpV.z, rnd() * 1.2, 0.6 + Math.random(), rnd() * 1.2, { color: VIOLET, size: 0.045, size1: 0, life: 0.5, drag: 2 });
  }

  // La succión: el aire que entra al agujero desde todo el radio, el agujero
  // negro (v4) y el sonido.
  suckFx(H, R, n, own = true, holeOn = true) {
    const g = this.g;
    const N = Math.min(150, 50 + R * 6);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R * (0.35 + Math.random() * 0.65);
      const x = H.x + Math.cos(a) * r;
      const z = H.z + Math.sin(a) * r;
      const y = H.y - 1.2 + Math.random() * 2.4;
      const t = 0.5 + Math.random() * 0.3;
      const vx = (H.x - x) / t - Math.sin(a) * 4;
      const vz = (H.z - z) / t + Math.cos(a) * 4;
      g.fx.add.spawn(x, y, z, vx, (H.y - y) / t, vz, { color: MIST[i % 3], size: 0.07, size1: 0.02, life: t, drag: 0 });
      if (i % 4 === 0) g.fx.alpha.spawn(x, y, z, vx * 0.8, (H.y - y) / t, vz * 0.8, { color: i % 8 ? MIST[i % 3] : [0.03, 0, 0.06], size: 0.8, size1: 0.1, life: t, alpha: 0.28, drag: 0.3 });
    }
    g.fx.flash(H, 0xc060ff, n ? 9 : 5, 0.4, 10);
    g.fx.addShake(0.16 + Math.min(0.3, n * 0.03));
    if (own) {
      this.swell = 1;
      this.d.rip = Math.max(this.d.rip, 0.45);
      this.d.ripA = Math.PI / 2 + rnd() * 0.6;
      this.d.ripSeed = Math.random() * 50;
    }
    // (v4) el agujero negro que se los traga (con su sonido)
    if (holeOn && globalThis.__mduCazV3 !== true) this.d.fx.hole(H, 0.7, 1.15, { pal: 'exec', gold: false, own });
    this.d.fx.play('caz-succion', { pos: own ? null : H, gain: 1 });
    if (n) this.d.fx.play('caz-ojos', { pos: own ? null : H, gain: 0.8 });
  }

  // Cada uno que se lleva: cura, le suma Furia a la guadaña (si la tiene) y
  // revienta en esquirlas (v4; las esquirlas no hacen más esquirlas).
  onKill(z, heal, shards = true) {
    const g = this.g;
    const p = g.player;
    const st = WEAPONS[ID];
    if (heal && p.alive && !p.downed) p.health = Math.min(p.maxHealth, p.health + st.suck.heal);
    const D = this.d;
    const s = this.w.slots?.find((x) => x.id === 'desgarrador');
    if (s && !D.furiaOn) {
      const F = weaponStats('desgarrador', s.up)?.furia;
      if (F) D.addKill(F, 1);
    }
    if (shards && st.shards && globalThis.__mduCazV3 !== true) this.shards(z);
    D.emit({ type: 'kill', how: heal ? 'caos' : 'bruma', z, pos: z.pos.clone() });
  }

  // Revienta en esquirlas negras: lastiman a los de al lado (el que mató).
  shards(z, own = true) {
    const g = this.g;
    const X = WEAPONS[ID].shards;
    const p = chest(z, new THREE.Vector3());
    this.shardFx(p);
    if (own) {
      g.net?.share('desg', { k: 'zx', id: g.net.id, p: r2(p) });
      const r = g.rounds?.round || 1;
      for (const { z: o } of g.zombies.inRadius(p, X.radius, near)) {
        if (o === z || o.dead || !o.active || big(o)) continue;
        const dir = new THREE.Vector3(o.pos.x - p.x, 0.3, o.pos.z - p.z).normalize();
        const was = !!o.dead;
        g.zombies.damage(o, zombieHealth(r) * X.frac, { type: 'blast', zone: 'torso', point: chest(o, new THREE.Vector3()), dir });
        if (!was && (o.dead || !o.active) && !g.net?.guest) this.onKill(o, false, false);
      }
    }
  }

  shardFx(p) {
    const g = this.g;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      g.fx.alpha.spawn(p.x, p.y, p.z, Math.cos(a) * s, rnd() * 4 + 1.5, Math.sin(a) * s, { color: [0.04, 0.0, 0.08], size: 0.09, size1: 0.03, life: 0.5 + Math.random() * 0.3, alpha: 0.95, gravity: 9, drag: 0.6 });
      if (i % 2) g.fx.add.spawn(p.x, p.y, p.z, Math.cos(a) * s, rnd() * 4 + 1.5, Math.sin(a) * s, { color: i % 4 === 1 ? [1.3, 0.95, 0.45] : VIOLET, size: 0.05, size1: 0, life: 0.4, gravity: 6, drag: 0.6 });
    }
    g.fx.flash(p, 0xa040ff, 3, 0.15, 5);
    if (g.time - this.shardT > 0.08) {
      this.shardT = g.time;
      this.d.fx.play('caz-esquirlas', { pos: p, gain: 0.8 });
    }
  }

  // ---------------- cada cuadro (Desgarrador.update) ----------------
  update(dt) {
    const g = this.g;
    this.mistCd -= dt;
    this.suckCd -= dt;
    this.chainCd -= dt;
    for (let i = this.clouds.length - 1; i >= 0; i--) if (this.stepCloud(this.clouds[i], dt)) this.clouds.splice(i, 1);
    const on = this.on;
    if (on !== this.had) {
      this.had = on;
      if (on) this.start();
      else this.end();
    }
    this.form = on ? Math.min(1, this.form + dt / 0.6) : 0;
    this.animate(dt, on);
  }

  // Lo agarró: el destello, la pantalla que se rasga, las manos que se hacen
  // bruma (form), el sonido propio y el zumbido de fondo.
  start() {
    const g = this.g;
    const D = this.d;
    this.mistCd = 0;
    this.suckCd = 0;
    this.chainCd = 0;
    this.form = 0;
    if (globalThis.__mduCazV3 === true) {
      D.fx.play('caz-bruma', { gain: 0.6, rate: 0.7 });
      return;
    }
    D.fx.play('caz-toma', { gain: 1 });
    this.hum?.stop(0.1);
    this.hum = D.fx.loop('caz-zumbido', null, { gain: 0.32, fadeIn: 1.2, from: 2, to: 6 });
    D.rip = Math.max(D.rip, 1.2);
    D.ripA = Math.PI / 2 - 0.25;
    D.ripSeed = Math.random() * 50;
    g.post?.flash?.(0.18);
    g.fx.addShake(0.35);
    const at = this.hand(tmpV);
    g.fx.flash(at, 0xb050ff, 10, 0.45, 10);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fx.add.spawn(at.x, at.y, at.z, Math.cos(a) * 4, rnd() * 4, Math.sin(a) * 4, { color: MIST[i % 3], size: 0.06, size1: 0, life: 0.5, drag: 3 });
    }
  }

  // Se terminó: el vacío se cierra en la mano, se apaga el zumbido.
  end() {
    const g = this.g;
    this.hum?.stop(0.8);
    this.hum = null;
    if (globalThis.__mduCazV3 === true) return;
    this.d.fx.play('caz-fin', { gain: 0.8 });
    const at = this.hand(tmpV);
    g.fx.flash(at, 0x9040ff, 5, 0.3, 6);
    this.d.rip = Math.max(this.d.rip, 0.35);
  }

  // Las manos de bruma: la bola gira y late, se achica cuando tira y vuelve a
  // crecer; con la succión se hincha, la mano sube y tiembla; los ojos miran y
  // parpadean. Su luz: la del farol (Potenciadores), siempre en la escena de la mano.
  animate(dt, on) {
    const g = this.g;
    const m = this.w.model?.caz;
    const Lt = this.w.pot?.farolLight;
    if (!m || !on) {
      if (this.lit && Lt) {
        Lt.color.setHex(0x4aff78);
        Lt.intensity = 0;
        this.lit = false;
      }
      return;
    }
    const t = g.time;
    this.pushT = Math.max(0, this.pushT - dt);
    this.raiseT = Math.max(0, this.raiseT - dt);
    this.swell = Math.max(0, this.swell - dt * 1.6);
    const push = Math.sin(Math.min(1, (0.3 - this.pushT) / 0.3) * Math.PI) * (this.pushT > 0 ? 1 : 0);
    const raise = this.raiseT > 0 ? Math.sin(Math.min(1, (0.8 - this.raiseT) / 0.8) * Math.PI) : 0;
    m.g.position.set(m.base.x - push * 0.02, m.base.y + push * 0.03 + raise * 0.05 + Math.sin(t * 1.4) * 0.004, m.base.z - push * 0.1 - raise * 0.04);
    m.g.rotation.x = 0.25 - push * 0.25 + raise * 0.15 + Math.sin(t * 31) * 0.01 * raise;
    if (m.left) {
      // la izquierda: se adelanta con la succión (abre la mano hacia el agujero)
      m.left.position.set(m.lbase.x + raise * 0.04, m.lbase.y + Math.sin(t * 1.2 + 1) * 0.005 + raise * 0.05, m.lbase.z - raise * 0.08);
    }
    const regrow = this.chainCd > 0 ? 1 - Math.min(1, this.chainCd / (WEAPONS[ID].chain?.cd || 1)) : 1;
    const s = (0.6 + 0.4 * regrow) * (1 + 0.06 * Math.sin(t * 5) + this.swell * 0.35) * (0.3 + 0.7 * this.form);
    m.mist.scale.setScalar(s);
    const B = mistMats();
    B.shell.uniforms.uTime.value = t;
    B.shell.uniforms.uK.value = (0.24 + this.swell * 0.4 + push * 0.22) * (0.5 + 0.5 * this.form);
    B.hand.uniforms.uK.value = (0.36 + 0.12 * Math.sin(t * 3) + this.swell * 0.35) * this.form;
    m.wisps.forEach((w, k) => {
      w.rotation.z += dt * (2.4 + this.swell * 9) * (k % 2 ? -1 : 1);
      w.rotation.y += dt * (0.8 + this.swell * 3);
    });
    // los ojos: los de la bola dan vueltas; los de las manos tiemblan; todos
    // se abren con la forma y parpadean de a uno
    for (const e of m.eyes) {
      const blink = ((t + e.k * 0.77) % 4.1) < 0.1 ? 0.15 : 1;
      const open = Math.min(1, this.form * 1.3 - e.k * 0.05);
      if (e.orbit) {
        const a = t * (1.3 + e.k * 0.37) + e.k * 1.6;
        e.o.position.set(Math.cos(a) * 0.04, Math.sin(a * 1.7) * 0.022, Math.sin(a) * 0.04);
      } else if (e.home) e.o.position.set(e.home.x + Math.sin(t * 7 + e.k) * 0.0008, e.home.y + Math.sin(t * 5 + e.k * 2) * 0.0008, e.home.z);
      e.o.scale.set(Math.max(0.01, open), Math.max(0.01, open * blink), Math.max(0.01, open));
    }
    m.core.scale.setScalar(1 + 0.25 * Math.sin(t * 7) + this.swell * 0.8);
    // (mientras dura, un humito violeta que sube de las manos, en el mundo)
    if (Math.random() < dt * 14) {
      const at = this.hand(tmpV);
      g.fx.alpha.spawn(at.x + rnd() * 0.3, at.y + rnd() * 0.2, at.z + rnd() * 0.3, rnd() * 0.2, 0.3 + Math.random() * 0.3, rnd() * 0.2, { color: MIST[(Math.random() * 3) | 0], size: 0.12, size1: 0.35, life: 0.8, alpha: 0.18, drag: 1 });
    }
    if (Lt) {
      Lt.color.setHex(0xb050ff);
      m.core.getWorldPosition(Lt.position);
      Lt.intensity = (0.22 + this.swell * 0.7 + push * 0.3) * (0.9 + Math.random() * 0.1);
      this.lit = true;
    }
  }

  // ---------------- lo de otro jugador ('desg' zc / zs / zx / zm): solo se ve ----------------
  ghost(m) {
    const g = this.g;
    const ok = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (m.k === 'zc') {
      const L = (Array.isArray(m.l) ? m.l.slice(0, 8) : []).filter(ok).map((a) => new THREE.Vector3(...a));
      for (let i = 1; i < L.length; i++) this.bolt(L[i - 1], L[i], false);
      if (L.length) this.d.fx.play('caz-rayo', { pos: L[0], gain: 0.9 });
    } else if (m.k === 'zx') {
      if (ok(m.p)) this.shardFx(new THREE.Vector3(...m.p));
    } else if (m.k === 'zm') {
      if (!ok(m.o) || !ok(m.f)) return;
      this.cloud(new THREE.Vector3(...m.o), new THREE.Vector3(...m.f), WEAPONS[ID].mist, false);
      this.d.fx.play('caz-bruma', { pos: new THREE.Vector3(...m.o), gain: 0.9 });
    } else if (m.k === 'zs') {
      if (!ok(m.p)) return;
      const H = new THREE.Vector3(...m.p);
      let n = 0;
      for (const id of Array.isArray(m.l) ? m.l.slice(0, 30) : []) {
        const z = g.net?.findZombie?.(id);
        if (!z) continue;
        this.eyesOut(z);
        n++;
      }
      this.suckFx(H, WEAPONS[ID].suck.radius, n, false, !!m.v);
    }
  }

  clear() {
    this.clouds.length = 0;
    this.mistCd = 0;
    this.suckCd = 0;
    this.chainCd = 0;
    this.swell = 0;
    this.form = 0;
    this.had = false;
    this.hum?.stop(0.1);
    this.hum = null;
    const Lt = this.w.pot?.farolLight;
    if (this.lit && Lt) {
      Lt.color.setHex(0x4aff78);
      Lt.intensity = 0;
    }
    this.lit = false;
  }
}
