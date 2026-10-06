import * as THREE from 'three';
import { WEAPONS, weaponStats } from '../config/weapons';
import { zombieHealth, bossHealth } from '../config/rules';
import { VM, registerMate } from './viewmodels';

// El Cazador del Caos: el potenciador de Eclipse Matero (entities/Powerups
// PERSONAL.caos), un arma temporal propia (antes daba el farol del penal: "es
// exactamente igual al farol", el usuario). En la mano, una bruma violeta y
// rosa que gira sobre la palma abierta.
//  · Izquierdo: la tira adelante. Un cono corto de bruma que dura 1,5 s: a
//    los comunes que quedan adentro les saca el caos y se deshacen en polvo
//    violeta; a los jefes les va sacando.
//  · Derecho: la succión. Los muertos de alrededor (6 m) se estiran hacia la
//    mano, se les apagan los ojos violetas (se les sale el caos) y se meten en
//    la bruma; cada uno cura y, si el jugador tiene el Desgarrador, le suma
//    Furia.
// Con el Desgarrador en la mano el potenciador no da esto: la guadaña se
// vuelve la ejecutora (Powerups.applyEffect → Desgarrador.exec).
// Lo maneja Desgarrador (update, ghost, clear); Weapons le pasa el gatillo
// (input, rama de las armas temporales). En línea va por 'desg' (zm, zs).

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
const VIOLET = [0.62, 0.3, 1];
const PINK = [1, 0.4, 0.8];
const MIST = [
  [0.42, 0.16, 0.85],
  [0.78, 0.28, 0.66],
  [0.58, 0.28, 0.92],
];

// ---------------- la bruma (el modelo de la mano) ----------------
// Una esfera de humo violeta: ruido que gira, más denso en el borde, el
// corazón rosa. (sin isnan ni pow sobre lo que puede ser negativo)
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
uniform float uTime, uK;
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
  // el humo gira alrededor del eje (y sube despacio)
  float a = uTime * 1.7;
  vec3 q = vec3(vP.x * cos(a) - vP.z * sin(a), vP.y - uTime * 0.35, vP.x * sin(a) + vP.z * cos(a));
  float n = n3(q * 3.2) * 0.6 + n3(q * 7.1 + 3.0) * 0.4;
  float swirl = smoothstep(0.35, 0.9, n);
  float a1 = (0.12 + f * f * 0.75) * (0.45 + swirl * 0.9) * clamp(uK, 0.0, 2.0);
  vec3 col = mix(vec3(0.55, 0.22, 1.0), vec3(1.0, 0.42, 0.85), swirl * (1.0 - f));
  gl_FragColor = vec4(col * a1 * 0.85, a1);
}`;
let MIST_MAT = null;
function mistMats() {
  if (MIST_MAT) return MIST_MAT;
  const add = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, ...o });
  MIST_MAT = {
    shell: new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uK: { value: 1 } }, vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide, forceSinglePass: true, fog: false, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.35, 0.95).multiplyScalar(0.9), toneMapped: false, fog: false }),
    wisp: add({ color: new THREE.Color(0.85, 0.45, 1).multiplyScalar(1.6), side: THREE.DoubleSide }),
    eye: add({ color: new THREE.Color(0.75, 0.3, 1).multiplyScalar(2.2) }),
  };
  return MIST_MAT;
}

registerMate(ID, (up, T) => {
  const M = VM.mats(T);
  const B = mistMats();
  const R = 0.05;
  const g = new THREE.Group();
  // la mano abierta, la palma para arriba, abrazando la bola de bruma
  g.add(VM.cupHand(M, (y) => Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))) * 0.92, R * 1.15));
  const mist = new THREE.Group();
  mist.position.set(0, R + 0.012, 0);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), B.shell);
  shell.scale.setScalar(0.055);
  shell.renderOrder = 4;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), B.core);
  mist.add(core, shell);
  // las volutas que giran (tres arcos de humo de luz)
  const wisps = [];
  for (let k = 0; k < 3; k++) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.05 + k * 0.012, 0.0022, 4, 40, Math.PI * 1.25), B.wisp);
    w.rotation.set(Math.PI / 2 + (k - 1) * 0.6, 0, (k * Math.PI * 2) / 3);
    w.renderOrder = 5;
    mist.add(w);
    wisps.push(w);
  }
  // ojitos violetas que dan vueltas adentro (el caos que ya chupó)
  const eyes = [];
  for (let k = 0; k < 5; k++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), B.eye);
    e.renderOrder = 5;
    mist.add(e);
    eyes.push(e);
  }
  g.add(mist);
  const muzzle = new THREE.Object3D();
  mist.add(muzzle);
  const tilt = new THREE.Group();
  // (la mano adelante, a la derecha y un poco alta: la bruma a la vista)
  g.rotation.set(0.25, 0.35, -0.05);
  g.position.set(-0.05, 0.06, -0.02);
  tilt.add(g);
  tilt.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  muzzle.getWorldPosition(tip);
  return { root: tilt, muzzle, anim: { spin: [], glow: [], wobble: null }, upgraded: false, tip, mouth: null, mate: g, bombGroup: null, yerba: null, caz: { g, mist, shell, core, wisps, eyes, base: g.position.clone() } };
});

export default class Cazador {
  constructor(d) {
    this.d = d;
    this.w = d.w;
    this.g = d.g;
    this.mistCd = 0;
    this.suckCd = 0;
    this.pushT = 0;
    this.raiseT = 0;
    this.swell = 0;
    this.clouds = [];
    this.had = false;
  }

  get on() {
    return this.w.temp?.id === ID;
  }

  // ---------------- el gatillo (Weapons, rama de las armas temporales) ----------------
  input(input, st, p) {
    if (st?.kind !== 'cazador') return false;
    if (!p.alive || p.downed) return true;
    if (input.mouse.leftPressed || (input.mouse.left && this.mistCd <= 0)) this.tryMist(st);
    if (input.mouse.rightPressed) this.trySuck(st);
    return true;
  }

  // dónde está la bruma en el mundo (del jugador, no de la cámara)
  hand(out) {
    return this.d.handWorld(out, 0.12, -0.12, -0.55);
  }

  // ---------------- la bruma que se tira (izquierdo) ----------------
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
    g.net?.share('desg', { k: 'zm', id: g.net.id, o: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)], f: [+f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2)] });
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
    // el humo sale de la mano en un cono y se va abriendo (más al principio)
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
    // a los de adentro les saca el caos (cada 0,1 s); a los jefes, de a poco
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
        // (a la vista: una vez por muerto por nube)
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

  // Se le salió todo el caos: se deshace en polvo violeta.
  dissolve(z) {
    const g = this.g;
    const D = this.d;
    D.fx.dust(z, 4, 'exec');
    const was = !!z.dead;
    g.zombies.damage(z, 1e9, { type: 'luz', zone: 'torso', point: chest(z, new THREE.Vector3()) });
    // ('luz' lo libera en el acto: dead ya volvió a false)
    const killed = g.net?.guest ? true : !was && (z.dead || !z.active);
    if (killed) this.onKill(z, false);
  }

  // ---------------- la succión (derecho) ----------------
  trySuck(st) {
    const g = this.g;
    if (this.suckCd > 0) {
      g.audio.deny?.();
      return false;
    }
    const S = st.suck;
    this.suckCd = S.cd;
    this.raiseT = 0.8;
    const H = this.hand(new THREE.Vector3());
    const P = g.player.pos;
    const eye = this.d.eye(new THREE.Vector3());
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
      // los ojos violetas se apagan (el caos sale) y el cuerpo se estira hacia la mano
      this.eyesOut(z);
      const dur = S.time * (0.7 + (d / S.radius) * 0.5);
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
    g.net?.share('desg', { k: 'zs', id: g.net.id, p: [+H.x.toFixed(2), +H.y.toFixed(2), +H.z.toFixed(2)], l: ids });
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

  // La succión: el aire que entra a la mano desde 6 m, el destello y el sonido.
  suckFx(H, R, n, own = true) {
    const g = this.g;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R * (0.6 + Math.random() * 0.4);
      const x = H.x + Math.cos(a) * r;
      const z = H.z + Math.sin(a) * r;
      const y = H.y - 1 + Math.random() * 2;
      const t = 0.45 + Math.random() * 0.25;
      // (en espiral: un poco de costado)
      const vx = (H.x - x) / t - Math.sin(a) * 3;
      const vz = (H.z - z) / t + Math.cos(a) * 3;
      g.fx.add.spawn(x, y, z, vx, (H.y - y) / t, vz, { color: MIST[i % 3], size: 0.06, size1: 0.02, life: t, drag: 0 });
      if (i % 4 === 0) g.fx.alpha.spawn(x, y, z, vx * 0.8, (H.y - y) / t, vz * 0.8, { color: MIST[i % 3], size: 0.6, size1: 0.1, life: t, alpha: 0.25, drag: 0.3 });
    }
    g.fx.flash(H, 0xc060ff, n ? 8 : 4, 0.35, 8);
    g.fx.addShake(0.12 + Math.min(0.2, n * 0.03));
    if (own) this.swell = 1;
    this.d.fx.play('caz-succion', { pos: own ? null : H, gain: 1 });
    if (n) this.d.fx.play('caz-ojos', { pos: own ? null : H, gain: 0.8 });
  }

  // Cada uno que se lleva: cura y le suma Furia a la guadaña (si la tiene).
  onKill(z, heal) {
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
    D.emit({ type: 'kill', how: heal ? 'caos' : 'bruma', z, pos: z.pos.clone() });
  }

  // ---------------- cada cuadro (Desgarrador.update) ----------------
  update(dt) {
    const g = this.g;
    this.mistCd -= dt;
    this.suckCd -= dt;
    for (let i = this.clouds.length - 1; i >= 0; i--) if (this.stepCloud(this.clouds[i], dt)) this.clouds.splice(i, 1);
    const on = this.on;
    if (on !== this.had) {
      this.had = on;
      if (on) {
        this.mistCd = 0;
        this.suckCd = 0;
        this.d.fx.play('caz-bruma', { gain: 0.6, rate: 0.7 });
      }
    }
    this.animate(dt, on);
  }

  // La bruma en la mano: gira, late, se achica cuando se tira y vuelve a
  // crecer; con la succión se hincha, la mano sube y tiembla. Su luz: la del
  // farol (Potenciadores), que siempre está en la escena de la mano.
  animate(dt, on) {
    const g = this.g;
    const m = this.w.model?.caz;
    const Lt = this.w.pot?.farolLight;
    if (!m || !on) {
      if (this.lit && Lt) {
        Lt.color.setHex(0x4aff78);
        this.lit = false;
      }
      return;
    }
    const t = g.time;
    this.pushT = Math.max(0, this.pushT - dt);
    this.raiseT = Math.max(0, this.raiseT - dt);
    this.swell = Math.max(0, this.swell - dt * 1.6);
    const push = Math.sin(Math.min(1, (0.32 - this.pushT) / 0.32) * Math.PI) * (this.pushT > 0 ? 1 : 0);
    const raise = this.raiseT > 0 ? Math.sin(Math.min(1, (0.8 - this.raiseT) / 0.8) * Math.PI) : 0;
    m.g.position.set(m.base.x - push * 0.02, m.base.y + push * 0.03 + raise * 0.05 + Math.sin(t * 1.4) * 0.004, m.base.z - push * 0.1 - raise * 0.04);
    m.g.rotation.x = 0.25 - push * 0.25 + raise * 0.15 + Math.sin(t * 31) * 0.01 * raise;
    // (vuelve a crecer cuando se puede tirar de nuevo)
    const regrow = this.mistCd > 0 ? 1 - Math.min(1, this.mistCd / (WEAPONS[ID].mist.cd || 1)) : 1;
    const s = (0.55 + 0.45 * regrow) * (1 + 0.06 * Math.sin(t * 5) + this.swell * 0.35);
    m.mist.scale.setScalar(s);
    const B = mistMats();
    B.shell.uniforms.uTime.value = t;
    B.shell.uniforms.uK.value = 0.42 + this.swell * 0.5 + push * 0.3;
    m.wisps.forEach((w, k) => {
      w.rotation.z += dt * (2.4 + this.swell * 9) * (k % 2 ? -1 : 1);
      w.rotation.y += dt * (0.8 + this.swell * 3);
    });
    m.eyes.forEach((e, k) => {
      const a = t * (1.3 + k * 0.37) + k * 1.3;
      e.position.set(Math.cos(a) * 0.035, Math.sin(a * 1.7) * 0.02, Math.sin(a) * 0.035);
    });
    m.core.scale.setScalar(1 + 0.25 * Math.sin(t * 7) + this.swell * 0.8);
    if (Lt) {
      Lt.color.setHex(0xb050ff);
      m.core.getWorldPosition(Lt.position);
      Lt.intensity = (0.18 + this.swell * 0.6 + push * 0.25) * (0.9 + Math.random() * 0.1);
      this.lit = true;
    }
  }

  // ---------------- lo de otro jugador ('desg' zm / zs): solo se ve ----------------
  ghost(m) {
    const g = this.g;
    const ok = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (m.k === 'zm') {
      if (!ok(m.o) || !ok(m.f)) return;
      this.cloud(new THREE.Vector3(...m.o), new THREE.Vector3(...m.f), WEAPONS[ID].mist, false);
      this.d.fx.play('caz-bruma', { pos: new THREE.Vector3(...m.o), gain: 0.9 });
    } else if (m.k === 'zs') {
      if (!ok(m.p)) return;
      const H = new THREE.Vector3(...m.p);
      let n = 0;
      for (const id of Array.isArray(m.l) ? m.l.slice(0, 20) : []) {
        const z = g.net?.findZombie?.(id);
        if (!z) continue;
        this.eyesOut(z);
        n++;
      }
      this.suckFx(H, WEAPONS[ID].suck.radius, n, false);
    }
  }

  clear() {
    this.clouds.length = 0;
    this.mistCd = 0;
    this.suckCd = 0;
    this.swell = 0;
    this.had = false;
    const Lt = this.w.pot?.farolLight;
    if (this.lit && Lt) {
      Lt.color.setHex(0x4aff78);
      Lt.intensity = 0;
    }
    this.lit = false;
  }
}
