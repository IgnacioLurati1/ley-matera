import * as THREE from 'three';
import { flareTexture, raysTexture } from './supremoFx';
import { PART_COUNT } from '../entities/skeleton';

// El rayo de oro de la hoz al nivel 3 (la Hoz de Oro de la Muerte: de la
// Muerte en el Pack-a-Pava y con el bastón del Yasy dorado). Mientras se
// mantiene el clic derecho, de la punta de la hoja sale un rayo de oro parejo
// hasta la primera pared: atraviesa a todos los que toca y los deshace en
// polvo de oro (a los jefes les va sacando de a poco, con el mismo tope que
// la medialuna). Corta el maíz y el matorral a su paso y cosecha como la
// medialuna. Gasta el cargador de a poco (DRAIN s por carga); vacío, se afila.
// Lo que se ve: el núcleo blanco y el halo de oro que corre hacia afuera, dos
// hebras que giran alrededor, medialunas de oro que vuelan por el rayo, un sol
// donde pega (chispas, brasas y quemado) y la hoja encendida en la mano.
// Suena la medialuna al prender y después el loop del rayo (hoz-rayo-loop,
// core/weaponSfx.js).
// Weapons le pasa el clic derecho con la hoz en la mano (input), cada cuadro
// (update), la pose de la mano (pose) y el final (clear). En línea: el daño lo
// pone cada uno (el invitado se lo pasa al anfitrión) y los demás ven el rayo
// por 'hozr' (ghost), con su sonido donde pasa.

const TICK = 0.1;
const RANGE = 36;
// el radio en el que agarra (más el ancho de cada uno)
const WIDTH = 0.6;
// segundos de rayo por cada carga del cargador
const DRAIN = 0.75;
// lo que corre la punta al prender (m/s)
const GROW = 80;
// a los jefes: lo mismo por segundo que la medialuna (una cada 0,55 s)
const TOSS = 0.55;
const RIGS = 4;
const RINGS = 10;
const GOLD = [[1, 0.82, 0.35], [1, 0.93, 0.66], [1, 0.68, 0.2]];
// (el polvo de los muertos, más oscuro: muchos juntos no se hacen blanco)
const DUST = [[0.9, 0.55, 0.12], [1, 0.72, 0.25], [0.8, 0.45, 0.08]];
const tough = (z) => z.boss || z.pombero || z.crow || z.mandinga || z.yasy;
const aimY = (z) => (z.dog ? (z.yacY ?? z.pos.y) + 0.3 : z.pos.y + 1.05 * (z.scale || 1));
const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const rnd = () => Math.random() - 0.5;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const hitTmp = {};
const near = [];

// ¿Esta hoz tira el rayo? (Weapons.stats: la de la Muerte con el bastón)
export const hozBeamOn = (st) => !!(st?.baston && st.upgraded && st.crescent);

// ---------------- los shaders ----------------
// El tubo del rayo (núcleo y halo, el mismo programa): position.z va de 0 a 1
// y el largo lo pone uLen, así el mismo tubo sirve para cualquier largo.
// Arranca finito en la hoja, engorda en el primer metro y medio y late.
const TUBE_VS = `
uniform float uLen, uR, uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vAx; varying float vAlong;
void main(){
  float along = position.z * uLen;
  float t0 = smoothstep(0.0, 1.5, along);
  float t1 = 1.0 - 0.55 * smoothstep(uLen - 0.3, uLen, along);
  float pulse = 1.0 + 0.16 * sin(along * 2.3 - uTime * 27.0) + 0.07 * sin(along * 7.1 + uTime * 33.0);
  float r = uR * mix(0.3, 1.0, t0) * t1 * pulse;
  vec4 mv = modelViewMatrix * vec4(position.xy * r, along, 1.0);
  vN = normalMatrix * vec3(position.xy, 0.0);
  vAx = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  vV = -mv.xyz;
  vUv = uv;
  vAlong = along;
  gl_Position = projectionMatrix * mv;
}`;
const NOISE = `
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
// uSharp: qué tan angosto se ve (el núcleo, alto; el halo, bajo); uFlow: cuánto
// le cambia la energía que corre
const TUBE_FS = `
uniform float uLen, uTime, uGrow, uK, uSharp, uFlow, uGain, uNear;
uniform vec3 uA, uB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vAx; varying float vAlong;
${NOISE}
void main(){
  if (vAlong > uGrow) discard;
  vec3 n = vN / max(length(vN), 1e-4);
  // el perfil del tubo, contra la vista sin la parte a lo largo del rayo (si
  // no, mirándolo de punta, como el que tira, desaparecía)
  vec3 v = vV / max(length(vV), 1e-4);
  vec3 vp = v - vAx * dot(v, vAx);
  float lp = length(vp);
  float face = lp < 1e-3 ? 1.0 : clamp(abs(dot(n, vp / lp)), 0.0, 1.0);
  float core = pow(face, uSharp);
  float a1 = vUv.x * 6.2832;
  float fl = nz(vec2(cos(a1) * 1.5 + 3.0, vAlong * 1.2 - uTime * 15.0)) * 0.6 + nz(vec2(sin(a1) * 3.0, vAlong * 3.4 - uTime * 26.0)) * 0.4;
  float energy = mix(1.0, 0.35 + fl * 1.3, uFlow);
  // la punta que avanza al prender, más blanca
  float head = smoothstep(uGrow - 1.2, uGrow, vAlong) * step(uGrow, uLen - 0.01);
  // de cerca de la cámara baja (el que tira mira a lo largo del rayo: el
  // halo se apaga más que el núcleo, que se ve salir de la hoja)
  float cam = mix(uNear, 1.0, smoothstep(0.4, 3.5, length(vV))) * smoothstep(0.12, 0.45, length(vV));
  float tail = 1.0 - smoothstep(uLen - 0.5, uLen + 0.05, vAlong) * 0.5;
  vec3 col = mix(uA, uB, core * 0.85 + head * 0.6) * (0.75 + core * 0.55 + head * 1.2);
  float a = core * energy * cam * tail * (1.0 - uK) * uGain;
  gl_FragColor = vec4(col * a, a);
}`;
// Las dos hebras: una cinta que gira alrededor del rayo (position.x: de qué
// lado de la cinta; y: la fase de cada hebra; z: de 0 a 1 a lo largo).
const HELIX_VS = `
uniform float uLen, uTime, uR;
varying float vSide; varying float vAlong; varying float vDist;
void main(){
  float along = position.z * uLen;
  float ang = along * 1.35 - uTime * 9.0 + position.y;
  float t0 = smoothstep(0.0, 2.2, along);
  float r = uR * mix(0.12, 1.0, t0) * (1.0 + 0.18 * sin(along * 1.6 - uTime * 7.0 + position.y));
  vec3 p = vec3(cos(ang) * r, sin(ang) * r, along + position.x * 0.07);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vSide = position.x;
  vAlong = along;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const HELIX_FS = `
uniform float uLen, uTime, uGrow, uK;
uniform vec3 uA;
varying float vSide; varying float vAlong; varying float vDist;
void main(){
  if (vAlong > uGrow) discard;
  float edge = 1.0 - vSide * vSide;
  float spark = 0.55 + 0.45 * sin(vAlong * 9.0 - uTime * 40.0);
  float cam = smoothstep(0.6, 2.2, vDist);
  float tail = 1.0 - smoothstep(uLen - 1.0, uLen, vAlong);
  float a = edge * spark * cam * tail * (1.0 - uK) * 0.9;
  gl_FragColor = vec4(uA * a, a);
}`;

let GEO = null;
function geos() {
  if (GEO) return GEO;
  const tube = new THREE.CylinderGeometry(1, 1, 1, 18, 48, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  // las hebras: dos cintas de N tramos
  const N = 160;
  const pos = [];
  const idx = [];
  for (let s = 0; s < 2; s++) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pos.push(-1, s * Math.PI, u, 1, s * Math.PI, u);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const helix = new THREE.BufferGeometry();
  helix.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  helix.setIndex(idx);
  // la medialuna que corre por el rayo: un arco de oro alrededor del eje
  const ring = new THREE.TorusGeometry(0.3, 0.022, 6, 26, Math.PI * 1.25);
  GEO = { tube, helix, ring };
  return GEO;
}

const shader = (uniforms, vs, fs) =>
  new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide, fog: false, toneMapped: false });
const sprite = (map, hex, k) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
const prep = (o) => {
  o.frustumCulled = false;
  o.renderOrder = 8;
  o.userData.reflect = false;
  return o;
};

// ---------------- un rayo armado (el propio o el de otro jugador) ----------------
class Rig {
  constructor(home, dot) {
    const G = geos();
    this.home = home;
    this.root = new THREE.Group();
    this.root.userData.reflect = false;
    this.TIME = { value: 0 };
    this.LEN = { value: 1 };
    this.GROW = { value: 0 };
    this.K = { value: 1 };
    const tube = (r, sharp, flow, gain, near, a, b) =>
      prep(new THREE.Mesh(G.tube, shader({ uLen: this.LEN, uTime: this.TIME, uGrow: this.GROW, uK: this.K, uR: { value: r }, uSharp: { value: sharp }, uFlow: { value: flow }, uGain: { value: gain }, uNear: { value: near }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } }, TUBE_VS, TUBE_FS)));
    // el halo (ancho, ámbar, con la energía que corre) y el núcleo (oro claro)
    this.glow = tube(0.2, 1.3, 1, 0.38, 0.25, 0xff7a0c, 0xffb83a);
    this.core = tube(0.055, 2.6, 0.4, 0.8, 0.8, 0xffb43c, 0xfff0c0);
    this.R0 = [0.2, 0.055, 0.36];
    this.helix = prep(new THREE.Mesh(G.helix, shader({ uLen: this.LEN, uTime: this.TIME, uGrow: this.GROW, uK: this.K, uR: { value: 0.36 }, uA: { value: new THREE.Color(0xffc248).multiplyScalar(1.2) } }, HELIX_VS, HELIX_FS)));
    this.root.add(this.glow, this.core, this.helix);
    // las medialunas que vuelan por el rayo
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23a).multiplyScalar(1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = prep(new THREE.Mesh(G.ring, this.ringMat));
      m.visible = false;
      this.root.add(m);
      this.rings.push({ m, u: 0, on: false, spin: 0 });
    }
    this.ringT = 0;
    // el sol donde pega: el destello, los rayos que giran y el halo
    this.hit = new THREE.Group();
    this.hitFlare = prep(sprite(flareTexture(), 0xffd890, 1.15));
    this.hitRays = prep(sprite(raysTexture(), 0xffa424, 1));
    this.hitHalo = prep(sprite(dot, 0xff7a14, 0.55));
    this.hit.add(this.hitHalo, this.hitRays, this.hitFlare);
    this.root.add(this.hit);
    // (la punta de la hoja de otro jugador; la propia va en la mano)
    this.tip = prep(sprite(flareTexture(), 0xffe6a0, 1.8));
    this.root.add(this.tip);
    this.busy = false;
    home.add(this.root);
  }

  take(scene) {
    this.busy = true;
    this.ringT = 0;
    for (const r of this.rings) {
      r.on = false;
      r.m.visible = false;
    }
    scene.add(this.root);
  }

  release() {
    this.busy = false;
    this.home.add(this.root);
  }

  // De a hasta b, con k (0 apagado, 1 entero) y la punta que avanza (grow, m).
  // wall: si pega en algo (el sol de la punta). tip: el destello de la hoja.
  set(a, b, k, grow, wall, time, dt, tip, ws = 1) {
    this.glow.material.uniforms.uR.value = this.R0[0] * ws;
    this.core.material.uniforms.uR.value = this.R0[1] * ws;
    this.helix.material.uniforms.uR.value = this.R0[2] * ws;
    const d = tmpD.subVectors(b, a);
    const len = Math.max(0.05, d.length());
    d.divideScalar(len);
    this.root.position.copy(a);
    this.root.quaternion.setFromUnitVectors(Z_AXIS, d);
    this.root.updateMatrixWorld(true);
    this.LEN.value = len;
    this.GROW.value = grow;
    this.K.value = 1 - k;
    this.TIME.value = time;
    const reach = Math.min(len, grow);
    // las medialunas: salen seguido, vuelan y giran; achicándose al final
    this.ringT -= dt;
    if (this.ringT <= 0 && k > 0.5) {
      this.ringT = 0.085;
      const r = this.rings.find((x) => !x.on);
      if (r) {
        r.on = true;
        r.u = 0.4;
        r.spin = Math.random() * Math.PI * 2;
      }
    }
    for (const r of this.rings) {
      if (!r.on) continue;
      r.u += dt * 42;
      if (r.u > reach) {
        r.on = false;
        r.m.visible = false;
        continue;
      }
      r.spin += dt * 15;
      const s = (0.3 + 0.7 * smooth(r.u / 2.5)) * (1 - 0.75 * smooth((r.u - (reach - 4)) / 4)) * k;
      r.m.visible = s > 0.02;
      r.m.position.set(0, 0, r.u);
      r.m.rotation.set(0, 0, r.spin);
      r.m.scale.setScalar(s);
    }
    this.ringMat.opacity = 0.9 * k;
    // el sol de la punta: late y gira
    const on = wall && grow >= len - 0.01;
    this.hit.visible = on;
    if (on) {
      this.hit.position.set(0, 0, len - 0.08);
      const f = 0.85 + 0.15 * Math.sin(time * 31) + rnd() * 0.12;
      this.hitFlare.scale.setScalar(0.95 * f * k);
      this.hitRays.scale.setScalar(1.5 * (0.9 + 0.1 * Math.sin(time * 9)) * k);
      this.hitRays.material.rotation = time * 2.2;
      this.hitHalo.scale.setScalar(1.6 * f * k);
    }
    this.tip.visible = !!tip;
    if (tip) this.tip.scale.setScalar((0.55 + rnd() * 0.12) * k);
  }
}

export default class HozBeam {
  constructor(weapons) {
    this.w = weapons;
    this.g = weapons.g;
    // (los rayos viven escondidos con los mates: la carga compila sus shaders)
    this.rigs = [];
    for (let i = 0; i < RIGS; i++) this.rigs.push(new Rig(weapons.warm, weapons.T.dot));
    this.remote = [];
    this.own = null;
    this.k = 0;
    this.pk = 0;
    this.on = false;
    this.inputT = -1;
    this.want = false;
    this.grow = 0;
    this.tickT = 0;
    this.fuel = 0;
    this.shareT = 0;
    this.scorchT = 0;
    this.moteAcc = 0;
    this.loop = null;
    this.kills = [];
    // el destello de la punta de la hoja, en la mano (escena de la mano)
    this.vmTip = sprite(flareTexture(), 0xffe6a0, 2.2);
    this.vmTip.renderOrder = 10;
    this.vmTip.visible = false;
    weapons.warm.add(this.vmTip);
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
  }

  rig() {
    const r = this.rigs.find((x) => !x.busy);
    if (r) r.take(this.g.scene);
    return r || null;
  }

  // ---------------- el gatillo ----------------
  // (Weapons.handleInput, con la hoz en la mano) true si se quedó con el clic.
  input(input, st, p) {
    if (!hozBeamOn(st)) return false;
    this.want = false;
    // (el derecho de esta hoz es solo el rayo: nunca la medialuna, ni al
    // soltar con la mira en modo alternar)
    if (!input.mouse.right) return input.mouse.rightPressed;
    const w = this.w;
    const g = this.g;
    this.inputT = g.time;
    if (w.state !== 'idle' || p.sprinting) return true;
    const s = w.slot;
    if (s.mag <= 0) {
      if (input.mouse.rightPressed) {
        if (s.reserve > 0) w.startReload(st);
        else g.audio.empty();
      }
      return true;
    }
    this.want = true;
    return true;
  }

  // La punta de la hoja, en el mundo, donde se la ve en la pantalla (la mano se
  // dibuja con su propia cámara, de otro ángulo de visión).
  tipWorld(out) {
    const w = this.w;
    const cam = this.g.camera;
    w.firing.muzzle.getWorldPosition(out);
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(w.vmCamera.fov / 2));
    out.x *= k;
    out.y *= k;
    return cam.localToWorld(out);
  }

  // La pose de la mano con el rayo [x, y, z, rx, ry, rz, muñeca] (sumada a la
  // de la cadera; Weapons.animate la multiplica por pk): la hoz acostada hacia
  // adelante, con la punta abajo a la derecha de la mira (de ahí sale el rayo),
  // y temblando mientras tira.
  pose(time, out) {
    const tr = this.on ? 1 : 0;
    out[0] = -0.07 + Math.sin(time * 47) * 0.0014 * tr;
    out[1] = -0.01 + Math.sin(time * 53 + 1) * 0.0014 * tr;
    out[2] = -0.07;
    out[3] = -1.15;
    out[4] = 0.45;
    out[5] = 0.75;
    out[6] = 0.45;
    return out;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const w = this.w;
    const p = g.player;
    const st = w.stats;
    const live = this.want && g.time - this.inputT < 0.15 && w.state === 'idle' && hozBeamOn(st) && w.slot?.mag > 0 && p.alive && !p.downed;
    if (live && !this.on) this.start();
    else if (!live && this.on) this.stop();
    this.k = live ? Math.min(1, this.k + dt / 0.07) : Math.max(0, this.k - dt / 0.16);
    // la mano va y vuelve un poco más despacio que el rayo
    this.pk = live ? Math.min(1, this.pk + dt / 0.14) : Math.max(0, this.pk - dt / 0.22);
    if (this.k > 0 && this.own) this.drawOwn(st, dt, live);
    else if (this.own) {
      this.own.release();
      this.own = null;
    }
    this.updateVmTip(dt);
    this.updateRemote(dt);
  }

  start() {
    const g = this.g;
    this.on = true;
    this.grow = 0;
    this.tickT = 0;
    this.shareT = 0;
    this.own ||= this.rig();
    // prende: el tajo de la medialuna y después el loop del rayo
    g.audio.shot('hoz', null, true);
    this.loop?.stop(0.05);
    this.loop = g.audio.guns?.loop('hoz-rayo-loop', null, { fadeIn: 0.12 }) || null;
    g.fx.addShake(0.12);
  }

  stop() {
    const g = this.g;
    this.on = false;
    this.loop?.stop(0.28);
    this.loop = null;
    if (g.net) g.net.share('hozr', { id: g.net.id, o: 1 });
  }

  drawOwn(st, dt, live) {
    const g = this.g;
    const w = this.w;
    const origin = g.camera.position;
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const wall = g.world.raycast(origin, fwd, RANGE, hitTmp);
    const reach = Math.min(RANGE, wall);
    const end = this.to.copy(origin).addScaledVector(fwd, reach);
    const tip = this.tipWorld(this.from);
    if (live) this.grow = Math.min(this.grow + dt * GROW, 99);
    const hitWall = Number.isFinite(wall) && wall < RANGE;
    const len = tip.distanceTo(end);
    this.own.set(tip, end, this.k, this.grow, hitWall, g.time, dt, false, 0.85);
    if (!live) return;
    const fwdC = fwd.clone();
    // las brasas que se sueltan del rayo (no en la cara)
    this.motes(tip, end, len, dt, 1);
    if (hitWall && this.grow >= len) this.impact(end, hitTmp.normal, dt, true);
    g.fx.addShake(dt * 0.3);
    w.recoilKick = Math.min(0.35, w.recoilKick + dt * 2.5);
    // el cargador se va gastando
    this.fuel += dt;
    if (this.fuel >= DRAIN) {
      this.fuel -= DRAIN;
      w.slot.mag = Math.max(0, w.slot.mag - 1);
      w.updateHud();
      if (w.slot.mag <= 0) {
        this.stop();
        if (w.slot.reserve > 0) g.later(0.25, () => w.state === 'idle' && hozBeamOn(w.stats) && w.slot.mag <= 0 && w.startReload(w.stats));
      }
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = TICK;
      this.hitTick(st, origin, fwdC, Math.min(reach, Math.max(0, this.grow - 0.4)), hitWall);
    }
    this.shareT -= dt;
    if (this.shareT <= 0 && g.net) {
      this.shareT = 0.1;
      g.net.share('hozr', { id: g.net.id, a: r2(tip), b: r2(end), w: hitWall && this.grow >= len ? 1 : 0, k: this.kills.splice(0, 5) });
    }
  }

  // Cada TICK: a todos los que toca el rayo, el maíz, la cosecha y lo que se tira.
  hitTick(st, origin, fwd, reach, hitWall) {
    const g = this.g;
    if (reach <= 0.3) return;
    let n = 0;
    const C = st.crescent;
    const boss = Math.round((C.damage * TICK) / TOSS);
    const cap = Math.round(((C.bossCap || 2200) * TICK) / TOSS);
    for (const { z } of g.zombies.inRadius(origin, reach + 2, near)) {
      if (n >= 24) break;
      const k = z.scale || 1;
      const cy = aimY(z);
      const hh = z.dog ? 0.3 : 0.8 * k;
      // lo más cerca que pasa el rayo del cuerpo (un palo parado)
      let t = (z.pos.x - origin.x) * fwd.x + (cy - origin.y) * fwd.y + (z.pos.z - origin.z) * fwd.z;
      const y = Math.max(cy - hh, Math.min(cy + hh, origin.y + fwd.y * t));
      t = (z.pos.x - origin.x) * fwd.x + (y - origin.y) * fwd.y + (z.pos.z - origin.z) * fwd.z;
      if (t < 0.3 || t > reach + 0.3 * k) continue;
      const dx = z.pos.x - (origin.x + fwd.x * t);
      const dy = y - (origin.y + fwd.y * t);
      const dz = z.pos.z - (origin.z + fwd.z * t);
      if (dx * dx + dy * dy + dz * dz > (WIDTH + 0.3 * k) ** 2) continue;
      const point = new THREE.Vector3(z.pos.x, y, z.pos.z);
      n++;
      if (tough(z)) {
        g.zombies.damage(z, boss, { type: 'scythe', zone: 'torso', point, dir: fwd.clone(), cap });
        if (Math.random() < 0.6) g.fx.sparks(point, 1, { x: -fwd.x, y: 0.5, z: -fwd.z }, GOLD[0]);
        continue;
      }
      // los comunes se deshacen en polvo de oro
      this.dust(z, n < 5 ? 4 : 2);
      if (this.kills.length < 8) this.kills.push(r2(point));
      g.zombies.damage(z, 1e9, { type: 'luz', zone: 'torso', point, dir: fwd.clone() });
    }
    if (n) g.hud.hitmarker(false);
    // el maíz del Prado, el matorral y la cosecha de la granja: como la
    // medialuna a su paso (a ras del piso nomás)
    const y0 = g.player.pos.y;
    for (let d = 1.2; d <= reach; d += 1.6) {
      const p = tmpA.copy(origin).addScaledVector(fwd, d);
      if (p.y - y0 > 3.2 || p.y < y0 - 2) continue;
      g.ee?.onScythe?.(p, fwd, st, true);
      g.arena?.onScythe?.(p, fwd, st, 'crescent');
      g.matorral?.onCut(p, fwd, st, 'crescent');
    }
    // como un tiro: el agua, los blancos del easter egg y los secretos
    g.water?.shot(origin, fwd, reach);
    g.ee?.onShot?.(origin, fwd, reach);
    g.secrets?.onShot(origin, fwd, reach);
    g.papq?.onShot(origin, fwd, reach);
    if (Math.random() < 0.3) g.critters?.onNoise(origin);
  }

  // Donde pega: chispas, brasas, el quemado y la luz.
  impact(at, normal, dt, own) {
    const g = this.g;
    const nrm = normal || { x: 0, y: 1, z: 0 };
    this.impT = (this.impT || 0) - dt;
    if (this.impT > 0) return;
    this.impT = 0.05;
    g.fx.sparks(at, own ? 1.4 : 1, nrm, GOLD[(Math.random() * 3) | 0]);
    for (let i = 0; i < 4; i++) {
      const c = GOLD[i % 3];
      g.fx.add.spawn(at.x, at.y, at.z, nrm.x * 2 + rnd() * 5, nrm.y * 2 + Math.random() * 3.5, nrm.z * 2 + rnd() * 5, { color: c, size: 0.07, size1: 0, life: 0.5 + Math.random() * 0.5, gravity: 7, drag: 1, bounce: 0.4 });
    }
    if (Math.random() < 0.35) g.fx.add.spawn(at.x, at.y + 0.1, at.z, rnd() * 0.4, 0.8 + Math.random() * 0.8, rnd() * 0.4, { color: [1, 0.55, 0.15], size: 0.4, size1: 0.9, life: 0.5, alpha: 0.5, drag: 1.5 });
    g.fx.flash(at, 0xffa030, own ? 3.5 : 2.5, 0.14, 8);
    this.scorchT -= 0.05;
    if (own && this.scorchT <= 0 && normal) {
      this.scorchT = 0.3;
      g.fx.decal(2, at, normal, 0.45 + Math.random() * 0.4);
    }
  }

  // Brasas de oro que se sueltan a lo largo del rayo.
  motes(a, b, len, dt, rate) {
    const g = this.g;
    this.moteAcc += dt * 70 * rate * Math.min(1, len / 10);
    const n = Math.floor(this.moteAcc);
    this.moteAcc -= n;
    const d = tmpB.subVectors(b, a).divideScalar(Math.max(0.01, len));
    for (let i = 0; i < n; i++) {
      const u = 1.6 + Math.random() * Math.max(0, len - 1.6);
      const x = a.x + d.x * u + rnd() * 0.3;
      const y = a.y + d.y * u + rnd() * 0.3;
      const z = a.z + d.z * u + rnd() * 0.3;
      const c = GOLD[(Math.random() * 3) | 0];
      g.fx.add.spawn(x, y, z, rnd() * 0.8, 0.2 + Math.random() * 0.7, rnd() * 0.8, { color: c, size: 0.05 + Math.random() * 0.04, size1: 0, life: 0.5 + Math.random() * 0.5, gravity: -0.4, drag: 1.2 });
    }
  }

  // El muerto que toca el rayo: el cuerpo se hace polvo de oro que sube.
  dust(z, n) {
    const g = this.g;
    const y0 = z.pos.y || 0;
    const sc = z.scale || 1;
    if (!z.mats || z.dog) {
      for (let i = 0; i < 14; i++) g.fx.add.spawn(z.pos.x + rnd() * 0.5, y0 + 0.3 + Math.random() * 0.6 * sc, z.pos.z + rnd() * 0.5, rnd() * 0.6, 0.6 + Math.random() * 1.6, rnd() * 0.6, { color: GOLD[i % 3], size: 0.09, size1: 0, life: 0.8 + Math.random() * 0.6, gravity: -1.5, drag: 0.6 });
      return;
    }
    for (let k = 0; k < PART_COUNT; k++) {
      const e = z.mats[k]?.elements;
      if (!e) continue;
      const px = e[12];
      const py = e[13];
      const pz = e[14];
      if (!Number.isFinite(px + py + pz) || (px === 0 && py === 0 && pz === 0)) continue;
      const h = Math.max(0, py - y0);
      g.fx.add.spawn(px, py, pz, 0, 0.1, 0, { color: [1, 0.62, 0.18], size: 0.16 * sc, size1: 0.05 * sc, life: 0.28 + h * 0.05, drag: 4 });
      for (let i = 0; i < n; i++) {
        const jx = rnd() * 0.2 * sc;
        const jz = rnd() * 0.2 * sc;
        g.fx.add.spawn(px + jx, py + rnd() * 0.2 * sc, pz + jz, jx, 0.1 + Math.random() * 0.3, jz, { color: DUST[(i + k) % 3], size: 0.045 + Math.random() * 0.035, size1: 0, life: 0.9 + h * 0.25 + Math.random() * 0.5, gravity: -(1.6 + h * 1.2), drag: 0.4 });
      }
    }
  }

  // El destello en la punta de la hoja (en la mano).
  updateVmTip(dt) {
    const w = this.w;
    const s = this.vmTip;
    const m = w.model;
    if (this.k <= 0 || !m?.hoz) {
      if (s.visible) {
        s.visible = false;
        w.warm.add(s);
      }
      return;
    }
    if (s.parent !== m.muzzle) m.muzzle.add(s);
    s.visible = true;
    const f = this.k * (0.9 + rnd() * 0.25);
    s.scale.setScalar(0.11 * f);
    s.material.rotation += dt * 3;
  }

  // ---------------- en línea ----------------
  // El rayo de otro jugador (solo se ve y se oye: el daño lo reporta él).
  ghost(m) {
    const g = this.g;
    let r = this.remote.find((x) => x.id === m.id);
    if (m.o) {
      if (r) r.t = 0;
      return;
    }
    if (!m.a || !m.b) return;
    if (!r) {
      const rig = this.rig();
      if (!rig) return;
      r = { id: m.id, rig, a: new THREE.Vector3().fromArray(m.a), b: new THREE.Vector3().fromArray(m.b), ta: new THREE.Vector3(), tb: new THREE.Vector3(), k: 0, t: 0, grow: 0, loop: null, wall: false };
      r.loop = g.audio.guns?.loop('hoz-rayo-loop', r.a, { gain: 1.3, fadeIn: 0.12 }) || null;
      g.audio.shot('hoz', r.a, true);
      this.remote.push(r);
    }
    r.ta.fromArray(m.a);
    r.tb.fromArray(m.b);
    r.t = 0.35;
    r.wall = !!m.w;
    for (const p of m.k || []) {
      tmpV.fromArray(p);
      for (let i = 0; i < 16; i++) g.fx.add.spawn(tmpV.x + rnd() * 0.5, tmpV.y - 0.6 + Math.random() * 1.2, tmpV.z + rnd() * 0.5, rnd() * 0.6, 0.6 + Math.random() * 1.6, rnd() * 0.6, { color: GOLD[i % 3], size: 0.09, size1: 0, life: 0.8 + Math.random() * 0.6, gravity: -1.5, drag: 0.6 });
    }
  }

  updateRemote(dt) {
    const g = this.g;
    for (let i = this.remote.length - 1; i >= 0; i--) {
      const r = this.remote[i];
      r.t -= dt;
      const live = r.t > 0;
      r.k = live ? Math.min(1, r.k + dt / 0.07) : Math.max(0, r.k - dt / 0.16);
      if (!live && r.k <= 0) {
        r.loop?.stop(0.25);
        r.rig.release();
        this.remote.splice(i, 1);
        continue;
      }
      if (!live && r.loop) {
        r.loop.stop(0.25);
        r.loop = null;
      }
      const f = Math.min(1, dt * 14);
      r.a.lerp(r.ta, f);
      r.b.lerp(r.tb, f);
      r.grow = Math.min(99, r.grow + dt * GROW);
      const len = r.a.distanceTo(r.b);
      r.rig.set(r.a, r.b, r.k, r.grow, r.wall, g.time, dt, true);
      if (!live) continue;
      this.motes(r.a, r.b, len, dt, 0.6);
      if (r.wall && r.grow >= len) this.impact(r.b, null, dt, false);
      // el sonido, en el punto del rayo más cerca del que escucha
      if (r.loop) {
        const cam = g.camera.position;
        const d = tmpB.subVectors(r.b, r.a);
        const u = clamp01(tmpA.subVectors(cam, r.a).dot(d) / Math.max(1e-4, d.lengthSq()));
        r.loop.move(tmpA.copy(r.a).addScaledVector(d, u));
      }
    }
  }

  clear() {
    this.loop?.stop(0.1);
    this.loop = null;
    this.on = false;
    this.k = 0;
    this.pk = 0;
    this.want = false;
    if (this.own) this.own.release();
    this.own = null;
    for (const r of this.remote) {
      r.loop?.stop(0.1);
      r.rig.release();
    }
    this.remote.length = 0;
    this.kills.length = 0;
    this.vmTip.visible = false;
    this.w.warm?.add(this.vmTip);
  }
}
