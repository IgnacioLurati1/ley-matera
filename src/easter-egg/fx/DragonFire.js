import * as THREE from 'three';

// La llamarada del Mateendrache (en el techo del castillo y en la Gran Guerra)
// y el golpe de la embestida.
//  · El chorro: dos conos, el de afuera colorado y naranja y el de adentro
//    casi blanco, con un ruido que corre hacia adelante y bordes que se
//    esfuman según de dónde se lo mira (parece un volumen, no un tubo). Sale
//    de la boca de a poco y, cuando corta, se despega de la boca.
//  · Alrededor: lenguas de fuego que viajan por el chorro y, donde pega, el
//    fuego que se abre en el piso, chispas, humo negro, la quemadura y la luz.
//  · El rugido del fuego dura lo que dura el chorro.
// breathe(boca, destino, dt) cada cuadro mientras escupe; update(dt) siempre.
// En Rendimiento y Baja: un solo cono y menos partículas.

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

const VERT = /* glsl */ `
uniform float uLen;
uniform float uR0;
uniform float uR1;
uniform float uTime;
varying float vAlong;
varying float vAround;
varying vec3 vN;
varying vec3 vV;
void main() {
  float v = position.y;
  vec2 c = position.xz;
  float ang = atan(c.y, c.x);
  float r = mix(uR0, uR1, pow(max(v, 0.0), 0.75));
  // lo de adelante se infla y ondula
  r *= 1.0 + (sin(v * 11.0 - uTime * 17.0 + ang * 3.0) * 0.2 + sin(v * 5.0 - uTime * 9.0 - ang * 2.0) * 0.16) * v;
  vec4 w = modelMatrix * vec4(c.x * r, v * uLen, c.y * r, 1.0);
  vN = mat3(modelMatrix) * vec3(c.x, 0.0, c.y);
  vV = cameraPosition - w.xyz;
  vAlong = v;
  vAround = uv.x;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform float uK;
uniform float uReach;
uniform float uCut;
uniform float uCore;
varying float vAlong;
varying float vAround;
varying vec3 vN;
varying vec3 vV;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// ruido que da la vuelta justo alrededor del cono (sin costura)
float vnp(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, per);
  float x1 = mod(i.x + 1.0, per);
  float a = h1(vec2(x0, i.y));
  float b = h1(vec2(x1, i.y));
  float c = h1(vec2(x0, i.y + 1.0));
  float d = h1(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  float v = vAlong;
  float facing = abs(dot(normalize(vN + vec3(1e-5)), normalize(vV + vec3(1e-5))));
  // el ruido corre hacia adelante (en metros: no se estira con el largo)
  float s = v * uLen;
  float n = vnp(vec2(vAround * 5.0, s * 0.3 - uTime * 6.0), 5.0) * 0.55
          + vnp(vec2(vAround * 10.0, s * 0.7 - uTime * 10.0 + 3.1), 10.0) * 0.3
          + vnp(vec2(vAround * 20.0, s * 1.5 - uTime * 15.0 + 7.3), 20.0) * 0.15;
  float body = pow(clamp(facing, 0.0, 1.0), uCore > 0.5 ? 2.2 : 1.1);
  // lenguas: el ruido recorta el borde y abre huecos (más lejos de la boca, más)
  float rag = smoothstep(0.34 + v * 0.3, 0.58 + v * 0.22, n * 0.8 + body * 0.45);
  float a = body * rag;
  a *= smoothstep(0.0, 0.05, v);
  a *= 1.0 - smoothstep(0.82, 1.0, v) * 0.7;
  a *= 1.0 - smoothstep(uReach - 0.08, uReach, v);
  a *= smoothstep(uCut, uCut + 0.12, v);
  a = clamp(a * uK, 0.0, 1.0);
  if (a < 0.004) discard;
  // el color: amarillo adentro y cerca de la boca, naranja, y colorado oscuro
  // en los bordes y las puntas (el ruido lo veta)
  float heat = clamp(body * (1.15 - v * 0.8) + (n - 0.5) * 0.9, 0.0, 1.0);
  vec3 col = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.3, 0.03), smoothstep(0.05, 0.45, heat));
  col = mix(col, vec3(1.0, 0.72, 0.28), smoothstep(0.55, 0.95, heat));
  if (uCore > 0.5) col = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.9, 0.65), body);
  gl_FragColor = uCore > 0.5 ? vec4(col * a * 0.55, a) : vec4(col * a * 1.15, a * 0.85);
}`;

export default class DragonFire {
  constructor(g, model) {
    this.g = g;
    this.D = model;
    this.root = new THREE.Group();
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.time = 0;
    this.k = 0;
    this.fedT = 0;
    this.tOn = 0;
    this.cut = -0.15;
    this.on = false;
    this.acc = {};
    this.decalT = 0;
    this.lightT = 0;
    // el chorro (un cilindro de 0 a 1 en y; el vértice lo estira y lo abre)
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 18, true).translate(0, 0.5, 0);
    const U = { uTime: { value: 0 }, uLen: { value: 1 }, uK: { value: 0 }, uReach: { value: 0 }, uCut: { value: -0.15 } };
    this.U = U;
    const mat = (core) =>
      new THREE.ShaderMaterial({
        ...(core ? {} : { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }),
        uniforms: { ...U, uR0: { value: 0.2 }, uR1: { value: 1 }, uCore: { value: core } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        ...(core ? { blending: THREE.AdditiveBlending } : {}),
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
    this.outer = new THREE.Mesh(geo, mat(0));
    this.core = new THREE.Mesh(geo, mat(1));
    for (const m of [this.outer, this.core]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.root.add(m);
    }
    this.root.visible = false;
    // la onda del golpe (un anillo que se abre en el piso)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.4).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }),
    );
    this.ring.visible = false;
    this.ringT = 9;
    // piedras que salen volando
    const M = g.world?.M || {};
    this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), M.caveRock || M.stoneDark || new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 }), 22);
    this.rocks.count = 0;
    this.rocks.frustumCulled = false;
    this.bits = [];
    const parent = model?.root.parent || g.scene;
    parent.add(this.root, this.ring, this.rocks);
  }

  low() {
    // (Personalizada: Game.tier('fire'))
    const q = this.g.tier?.('fire') ?? this.g.settings?.quality;
    return q === 'perf' || q === 'low';
  }

  // cuántas partículas tocan este cuadro (a tanto por segundo)
  emit(key, n) {
    const v = (this.acc[key] || 0) + n;
    const k = Math.floor(v);
    this.acc[key] = v - k;
    return k;
  }

  // Escupe de a (la boca) a b. ground: b está en el piso (si no, el chorro
  // termina en el aire y no hay fuego abajo).
  breathe(a, b, dt, ground = true) {
    const g = this.g;
    const fx = g.fx;
    if (!this.on) this.start(b);
    this.fedT = 0.12;
    this.a.copy(a);
    this.b.copy(b);
    const low = this.low();
    const m = low ? 0.35 : 1;
    const dir = tmpD.subVectors(b, a);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    const r1 = Math.min(2.6, 0.5 + len * 0.12);
    const reach = Math.min(1, this.tOn / 0.18);
    // lenguas de fuego que viajan por el chorro
    for (let n = this.emit('flame', dt * 50 * m); n > 0; n--) {
      const k = Math.random() * 0.85 * reach;
      const rr = (0.2 + r1 * k) * 0.6;
      tmpP.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(rr * 2);
      tmpP.addScaledVector(dir, -tmpP.dot(dir)).addScaledVector(dir, len * k).add(a);
      const sp = (len / 0.32) * (0.6 + Math.random() * 0.4);
      fx.add.spawn(tmpP.x, tmpP.y, tmpP.z, dir.x * sp, dir.y * sp, dir.z * sp, {
        color: [1, 0.35 + Math.random() * 0.3, 0.06 + Math.random() * 0.08],
        size: 0.25 + k * 0.9,
        size1: 0.7 + k * 1.6,
        life: 0.18 + Math.random() * 0.14,
        alpha: 0.18,
        drag: 1.2,
      });
    }
    // humo oscuro que se despega de la punta del chorro
    for (let n = this.emit('trail', dt * 14 * m); n > 0; n--) {
      const k = 0.55 + Math.random() * 0.4 * reach;
      tmpP.copy(a).addScaledVector(dir, len * k);
      fx.alpha.spawn(tmpP.x + (Math.random() - 0.5) * r1, tmpP.y + (Math.random() - 0.5) * r1, tmpP.z + (Math.random() - 0.5) * r1, dir.x * 2, 1 + Math.random(), dir.z * 2, { color: [0.09, 0.07, 0.06], size: 0.8, size1: 2.6, life: 0.9 + Math.random() * 0.5, alpha: 0.22, drag: 0.8 });
    }
    if (!ground || reach < 1) return;
    // donde pega: el fuego se abre por el piso
    for (let n = this.emit('splash', dt * 45 * m); n > 0; n--) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 4;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      fx.add.spawn(b.x + c * 0.4, b.y + 0.3, b.z + s * 0.4, c * sp + dir.x * 3, 0.8 + Math.random() * 1.6, s * sp + dir.z * 3, {
        color: [1, 0.4 + Math.random() * 0.25, 0.08],
        size: 0.6,
        size1: 1.8 + Math.random(),
        life: 0.35 + Math.random() * 0.3,
        alpha: 0.16,
        drag: 2.2,
        gravity: -1.5,
      });
    }
    // chispas
    for (let n = this.emit('ember', dt * 45 * m); n > 0; n--) {
      fx.add.spawn(b.x, b.y + 0.3, b.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6, { color: [1, 0.62, 0.2], size: 0.06, size1: 0.02, life: 0.9 + Math.random() * 0.9, gravity: 4, drag: 0.4 });
    }
    // humo negro que sube
    for (let n = this.emit('smoke', dt * 18 * m); n > 0; n--) {
      fx.alpha.spawn(b.x + (Math.random() - 0.5) * 2, b.y + 0.8, b.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, {
        color: [0.07, 0.06, 0.055],
        size: 1,
        size1: 3.6,
        life: 1.6 + Math.random() * 0.8,
        alpha: 0.32,
        drag: 0.5,
      });
    }
    // la quemadura y la luz del fuego en el piso
    this.decalT -= dt;
    if (this.decalT <= 0) {
      this.decalT = 0.14;
      fx.decal(2, tmpV.set(b.x + (Math.random() - 0.5) * 1.4, b.y + 0.02, b.z + (Math.random() - 0.5) * 1.4), UP, 1.4 + Math.random() * 1.4);
    }
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.06;
      fx.flash(tmpV.set(b.x, b.y + 1.2, b.z), 0xff7a2a, 7 + Math.random() * 4, 0.11, 14);
    }
    // de cerca, el calor sacude un poco
    if (g.player && g.player.pos.distanceTo(b) < 7) fx.addShake(dt * 0.5);
  }

  start(b) {
    this.on = true;
    this.tOn = 0;
    this.cut = -0.15;
    this.startRoar(b);
  }

  // ---------------- el sonido ----------------
  // el fuego: un soplido grave que dura lo que dura el chorro, con chasquidos
  startRoar(pos) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const c = a.ctx;
    const t = a.now;
    // el grabado (dos tomas, una y una): arranca con el chorro y, si dura más
    // que la toma, da vueltas por el medio parejo. Si no bajó, el sintetizado.
    this.take = this.take === 1 ? 2 : 1;
    const buf = a.sfxBuf?.['dragon-fuego-' + this.take];
    if (buf) {
      const o = a.out({ pos, reverb: 0.5, gain: this.take === 1 ? 1.5 : 1.45, ref: 18 });
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 1;
      src.loopEnd = buf.duration - 1.3;
      const gn = c.createGain();
      gn.gain.setValueAtTime(1, t);
      src.connect(gn).connect(o);
      src.start(t);
      src.stop(t + 8);
      this.roarOut = o;
      this.roarNodes = [{ src, gn }];
      return;
    }
    const o = a.out({ pos, reverb: 0.6, gain: 1.3, ref: 18 });
    const layer = (buf, type, freq, q, gain) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(gain, t + 0.12);
      src.connect(f).connect(gn).connect(o);
      src.start(t, Math.random());
      // (por las dudas: si nadie lo corta, se corta solo)
      src.stop(t + 8);
      return { src, gn };
    };
    this.roarOut = o;
    this.roarNodes = [layer(a.brownBuf, 'lowpass', 260, 0.7, 1), layer(a.noiseBuf, 'bandpass', 1400, 0.6, 0.3)];
    // la prendida: un "fuum"
    a.noise(o, { t, dur: 0.5, type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.9, brown: true, attack: 0.01 });
  }

  stopRoar() {
    const a = this.g.audio;
    if (!a?.ctx || !this.roarNodes) return;
    const t = a.now;
    for (const { src, gn } of this.roarNodes) {
      gn.gain.cancelScheduledValues(t);
      gn.gain.setValueAtTime(Math.max(0.0001, gn.gain.value), t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      try {
        src.stop(t + 0.4);
      } catch {}
    }
    this.roarNodes = null;
    this.roarOut = null;
  }

  // El rugido de la embestida (arriba, antes de tirarse).
  roar(pos) {
    const a = this.g.audio;
    // (ruge con la boca abierta, aunque no escupa: world/Mateendrache roarJaw)
    const buf = a?.sfxBuf?.['dragon-rugido'];
    this.D?.roarJaw?.(buf ? Math.min(2.6, buf.duration) : 1.4);
    if (!a?.ctx) return;
    const t = a.now;
    // el rugido grabado (si no bajó, el sintetizado)
    if (buf) {
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(a.out({ pos, reverb: 0.7, gain: 1.2, ref: 30 }));
      src.start(t);
      return;
    }
    const o = a.out({ pos, reverb: 0.9, gain: 1.8, ref: 30 });
    a.tone(o, { t, dur: 1.3, type: 'sawtooth', freq: 92, freqEnd: 46, gain: 0.35, attack: 0.08 });
    a.tone(o, { t, dur: 1.2, type: 'sawtooth', freq: 138, freqEnd: 70, gain: 0.18, attack: 0.1, detune: 12 });
    a.noise(o, { t, dur: 1.4, type: 'bandpass', freq: 520, freqEnd: 240, q: 1.4, gain: 0.7, attack: 0.1, brown: true });
    a.noise(o, { t, dur: 1.1, type: 'lowpass', freq: 300, freqEnd: 90, gain: 0.9, attack: 0.15, brown: true });
  }

  // El viento de la picada (sube hasta el golpe).
  whoosh(pos, dur) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos, reverb: 0.4, gain: 1.4, ref: 24 });
    a.noise(o, { dur, type: 'bandpass', freq: 300, freqEnd: 2400, q: 1.2, gain: 0.9, attack: dur * 0.85 });
  }

  // ---------------- el golpe de la embestida ----------------
  // (en todas las compus) p: donde pega, en el piso
  slam(p) {
    const g = this.g;
    const fx = g.fx;
    const low = this.low();
    fx.explosion(tmpV.set(p.x, p.y + 0.6, p.z), 4, [1, 0.62, 0.28]);
    fx.flash(tmpV.set(p.x, p.y + 2, p.z), 0xffb070, 70, 0.6, 32);
    g.post?.flash?.(0.35);
    fx.decal(2, tmpV.set(p.x, p.y + 0.02, p.z), UP, 7);
    // polvo y nieve en anillo, y tierra para arriba
    const n = low ? 24 : 60;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 7 + Math.random() * 7;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      fx.alpha.spawn(p.x + c * 1.5, p.y + 0.4, p.z + s * 1.5, c * sp, 0.6 + Math.random() * 1.2, s * sp, { color: [0.78, 0.78, 0.82], size: 0.8, size1: 2.8, life: 0.9 + Math.random() * 0.5, alpha: 0.4, drag: 2.4 });
    }
    fx.dirt?.(tmpV.set(p.x, p.y + 0.3, p.z), low ? 10 : 24);
    // la onda
    this.ring.position.set(p.x, p.y + 0.15, p.z);
    this.ring.visible = true;
    this.ringT = 0;
    // las piedras
    this.bits.length = 0;
    const nb = low ? 10 : this.rocks.instanceMatrix.count;
    for (let i = 0; i < nb; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 8;
      this.bits.push({
        p: new THREE.Vector3(p.x + Math.cos(ang) * 1.2, p.y + 0.5, p.z + Math.sin(ang) * 1.2),
        v: new THREE.Vector3(Math.cos(ang) * sp, 5 + Math.random() * 8, Math.sin(ang) * sp),
        r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
        w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        s: 0.35 + Math.random() * 0.7,
        t: 2.4 + Math.random() * 0.8,
      });
    }
    // el sacudón (más fuerte de cerca) y el ruido
    const d = g.player ? g.player.pos.distanceTo(p) : 99;
    fx.addShake(d < 14 ? 1.1 : d < 35 ? 0.6 : 0.3);
    const a = g.audio;
    a?.explosion?.(p, 1.3);
    if (a?.ctx) {
      const o = a.out({ pos: p, reverb: 0.9, gain: 1.6, ref: 30 });
      a.tone(o, { dur: 0.9, type: 'sine', freq: 70, freqEnd: 28, gain: 0.9, attack: 0.005 });
      a.noise(o, { t: a.now + 0.08, dur: 1.2, type: 'bandpass', freq: 900, freqEnd: 300, q: 0.8, gain: 0.35, attack: 0.02 });
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.time += dt;
    const U = this.U;
    U.uTime.value = this.time;
    if (this.fedT > 0) {
      this.fedT -= dt;
      this.tOn += dt;
      this.k = Math.min(1, this.k + dt * 8);
      this.cut = -0.15;
    } else if (this.on) {
      // cortó: el chorro se despega de la boca y se apaga
      this.on = false;
      this.stopRoar();
    }
    if (!this.on && this.k > 0) {
      this.cut = Math.min(1.05, this.cut + dt * 4.3);
      if (this.cut >= 1.05) this.k = 0;
    }
    // chasquidos mientras sale
    const au = g.audio;
    if (this.on && this.roarOut && au?.ctx && Math.random() < dt * 14) au.noise(this.roarOut, { dur: 0.03 + Math.random() * 0.04, type: 'highpass', freq: 2500 + Math.random() * 2500, gain: 0.18 + Math.random() * 0.15 });
    const show = this.k > 0.001;
    this.root.visible = show;
    if (show) {
      const dir = tmpD.subVectors(this.b, this.a);
      const len = dir.length() || 1;
      dir.divideScalar(len);
      this.root.position.copy(this.a);
      this.root.quaternion.setFromUnitVectors(UP, dir);
      const r1 = Math.min(2.6, 0.5 + len * 0.12);
      const ou = this.outer.material.uniforms;
      const cu = this.core.material.uniforms;
      ou.uR0.value = 0.22;
      ou.uR1.value = r1;
      cu.uR0.value = 0.1;
      cu.uR1.value = r1 * 0.42;
      U.uLen.value = len;
      U.uK.value = this.k;
      U.uReach.value = Math.min(1.1, (this.tOn / 0.18) * 1.1);
      U.uCut.value = this.cut;
      this.core.visible = !this.low();
    }
    // el pecho del dragón brilla más mientras escupe
    if (this.D) this.D.breathOn += ((this.on ? 1 : 0) - this.D.breathOn) * Math.min(1, dt * 5);
    // la onda del golpe
    if (this.ringT < 0.7) {
      this.ringT += dt;
      const u = Math.min(1, this.ringT / 0.6);
      this.ring.scale.setScalar(1 + (1 - (1 - u) ** 3) * 17);
      this.ring.material.opacity = (1 - u) ** 1.5;
      if (u >= 1) this.ring.visible = false;
    }
    // las piedras: caen, rebotan en el piso y se achican
    if (this.bits.length) {
      const w = g.world;
      let n = 0;
      for (const B of this.bits) {
        B.t -= dt;
        if (B.t <= 0) continue;
        B.v.y -= 22 * dt;
        B.p.addScaledVector(B.v, dt);
        const fy = w?.floorAt ? w.floorAt(B.p.x, B.p.z, B.p.y + 1) : -1e9;
        if (B.p.y < fy + B.s * 0.4 && B.v.y < 0 && B.p.y > fy - 2) {
          B.p.y = fy + B.s * 0.4;
          B.v.y *= -0.35;
          B.v.x *= 0.6;
          B.v.z *= 0.6;
          B.w.multiplyScalar(0.6);
        }
        B.r.x += B.w.x * dt;
        B.r.y += B.w.y * dt;
        B.r.z += B.w.z * dt;
        const s = B.s * Math.min(1, B.t / 0.5);
        tmpM.compose(B.p, tmpQ.setFromEuler(tmpE.copy(B.r)), tmpS.setScalar(s));
        this.rocks.setMatrixAt(n++, tmpM);
      }
      this.rocks.count = n;
      this.rocks.instanceMatrix.needsUpdate = true;
      if (!n) this.bits.length = 0;
    }
  }

  dispose() {
    this.stopRoar();
    this.root.removeFromParent();
    this.ring.removeFromParent();
    this.rocks.removeFromParent();
    this.outer.geometry.dispose();
    this.outer.material.dispose();
    this.core.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.rocks.geometry.dispose();
  }
}
