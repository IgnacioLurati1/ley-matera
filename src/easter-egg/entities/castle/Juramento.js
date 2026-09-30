import * as THREE from 'three';
import Avatars from '../../net/Avatars';
import { EE, PROPS } from '../../config/map';
import { uprightMate } from '../../ui/castleCine';
import { warmScene } from '../../ui/cineWarm';
import { ELEMENTS, ELEM_COLOR, ELEM_RGB, myId, playerPos } from './common';

// El juramento en la cumbre, con toda la ceremonia (Vanguardia lo arma al
// llegar al paso 8 y le avisa cada vez que alguien jura):
//  · Mientras nadie juró: una columna de luz tenue marca el lugar, con el
//    sello de los cuatro elementos en la nieve, y el dragón mira al que se acerca.
//  · Manteniendo la F: la columna baja sobre el que jura, el coro sube, la
//    nieve se levanta en remolino y el sello gira cada vez más rápido.
//  · Al jurar (se ve en todas las compus): campanazo, destello dorado, la onda
//    en la nieve; uno de los cuatro caballeros de antes sale de su tumba, lo
//    mira y levanta el mate (su rayo le llega al pecho); el dragón ruge y le
//    tira una llamarada al cielo.
//  · Cuando juraron todos (paso 9): salen los cuatro, levantan los mates y
//    sus rayos se juntan arriba del dragón; truenos de los cuatro colores, el
//    coro entero, las campanas y el dragón que ruge y abre las alas... y a
//    la Gran Guerra (CastleEgg.onSworn espera FINALE segundos).

export const FINALE = 6.5;
const HOLD = 2;
const RISE = 1.8;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// La columna de luz: un cilindro abierto que se apaga hacia arriba, con
// vetas que suben.
const PILLAR_VS = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 v = normalize(cameraPosition - wp.xyz);
    vRim = abs(dot(n, v));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const PILLAR_FS = /* glsl */ `
  uniform float uK;
  uniform float uT;
  uniform vec3 uCol;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.02, h);
    float streak = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 7.0 + h * 40.0 - uT * 5.0) * sin(vUv.x * 6.2831 * 3.0 - h * 23.0 + uT * 3.1);
    float a = uK * fade * (0.35 + 0.65 * streak) * (0.25 + 0.75 * vRim);
    gl_FragColor = vec4(uCol * a, 1.0);
  }
`;

export default class Juramento {
  constructor(van) {
    this.van = van;
    this.egg = van.egg;
    this.g = van.g;
    this.root = new THREE.Group();
    this.root.name = 'juramento';
    this.g.scene.add(this.root);
    this.T = { value: 0 };
    this.k = 0;
    this.holdK = 0;
    this.flare = 0;
    this.count = 0;
    this.fx = [];
    this.fireT = 0;
    this.finaleT = -1;
    this.build();
    // (lo nuevo se compila ya, en segundo plano: los caballeros no traban al salir)
    warmScene(this.g);
  }

  build() {
    const g = this.g;
    const w = g.world;
    const [jx, jz] = EE.jura;
    const jy = w.floorAt(jx, jz);
    this.at = new THREE.Vector3(jx, jy, jz);
    // la columna
    this.pillarMat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uT: this.T, uCol: { value: new THREE.Color(1, 0.84, 0.5) } },
      vertexShader: PILLAR_VS,
      fragmentShader: PILLAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), this.pillarMat);
    pillar.scale.set(0.85, 46, 0.85);
    pillar.position.copy(this.at);
    pillar.frustumCulled = false;
    pillar.renderOrder = 3;
    this.pillar = pillar;
    this.root.add(pillar);
    // el sello en la nieve: el aro de oro y los cuatro cuartos de colores, que giran
    const add = (color, op = 0) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.seal = new THREE.Group();
    this.seal.position.set(jx, jy + 0.04, jz);
    const outer = new THREE.Mesh(new THREE.RingGeometry(1.52, 1.64, 64).rotateX(-Math.PI / 2), add(0xffd27a));
    this.seal.add(outer);
    this.quarters = ELEMENTS.map((el, i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.44, 32, 1, (i / 4) * Math.PI * 2 + 0.08, Math.PI / 2 - 0.16).rotateX(-Math.PI / 2), add(ELEM_COLOR[el]));
      this.seal.add(m);
      return m;
    });
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2), add(0xfff0c8));
    this.seal.add(inner);
    this.sealMats = [outer.material, inner.material, ...this.quarters.map((q) => q.material)];
    this.seal.renderOrder = 3;
    this.root.add(this.seal);
    // la onda que se abre en la nieve al jurar
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), add(0xffe0a0));
    this.wave.position.set(jx, jy + 0.06, jz);
    this.wave.visible = false;
    this.root.add(this.wave);
    this.waveT = 9;
    // los caballeros de antes: cada uno sale de la tumba de su elemento
    const tombs = PROPS.filter((p) => p.type === 'tumbaCaballero');
    this.people = new Avatars(g, null);
    this.knights = ELEMENTS.map((el, i) => {
      const t = tombs.find((p) => p.kind === el) || { pos: [jx - 6 + i * 3, jz - 3] };
      const x = t.pos[0];
      const z = t.pos[1] + 1.9;
      const y = w.floorAt(x, z);
      const c = ELEM_COLOR[el];
      const r = { id: 720 + i, name: '', noTag: true, pos: new THREE.Vector3(x, y - 2.2, z), yaw: 0, pitch: -0.1, speed: 0, moving: false };
      this.people.add(r);
      const av = this.people.list.get(r.id);
      for (const m of Object.values(av.M)) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(c);
          m.emissiveIntensity = 1.4;
        }
      }
      av.M.poncho.color.set(c);
      if (av.tag) av.tag.visible = false;
      const K = { el, r, av, c, y0: y, k: 0, rise: -1, lift: 0, bow: 0, raise: false, kneel: false, beam: 0, beamTo: null };
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
      // la luz del mate en la mano y el rayo que sale de ahí
      // el aura del ánima alrededor del cuerpo
      K.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
      K.aura.scale.set(1.8, 2.8, 1);
      this.root.add(K.aura);
      K.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
      this.root.add(K.glow);
      K.ray = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), add(c));
      K.ray.visible = false;
      K.ray.frustumCulled = false;
      this.root.add(K.ray);
      return K;
    });
    this.people.root.visible = false;
    // la corona: donde se juntan los cuatro rayos al final (un sol y un aro que gira)
    this.crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xfff0c8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    this.root.add(this.crown);
    this.crownRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 6, 48), add(0xffd27a));
    this.root.add(this.crownRing);
    this.bus = null;
  }

  // ---------------- lo que pasa ----------------
  // Juró alguien (en todas las compus). n: el número de juramento (0, 1...).
  sworn(id) {
    const g = this.g;
    const n = this.count++;
    const pos = (playerPos(g, id) || this.at).clone();
    const me = id === myId(g);
    this.flare = 1;
    this.waveT = 0;
    this.wave.visible = true;
    g.post?.flash(me ? 0.9 : 0.5);
    g.fx.addShake?.(me ? 0.5 : 0.25);
    g.fx.sparkle(tmpV.copy(pos).setY(pos.y + 1.1), [1, 0.88, 0.5], 70, 1.6);
    g.fx.explosion?.(tmpV.copy(pos).setY(pos.y + 0.3), 1.6, [1, 0.8, 0.4]);
    // el caballero de ese juramento sale de su tumba y le levanta el mate
    const K = this.knights[n % 4];
    this.riseKnight(K, pos);
    // el dragón ruge y le tira fuego al cielo
    this.dragonSalute(1.6);
    this.sndSworn(n, me);
    if (me) g.hud.location('Caballero de la Luz', '');
  }

  riseKnight(K, toward) {
    const g = this.g;
    this.people.root.visible = true;
    if (K.rise < 0) {
      K.rise = 0;
      g.fx.explosion?.(tmpV.set(K.r.pos.x, K.y0 + 0.4, K.r.pos.z), 1.2, ELEM_RGB[K.el]);
      g.fx.dust?.(tmpV.set(K.r.pos.x, K.y0 + 0.1, K.r.pos.z), UP, [0.9, 0.92, 0.95], 26);
    }
    K.raise = true;
    K.beam = 3.2;
    K.beamTo = toward.clone().setY(toward.y + 1.2);
  }

  // Todos juraron (paso 9): la ceremonia final antes del vuelo.
  finale() {
    const g = this.g;
    this.finaleT = 0;
    this.flare = 1.4;
    const crown = this.crownAt();
    for (const K of this.knights) {
      this.riseKnight(K, crown);
      K.beam = FINALE + 1;
    }
    this.dragonSalute(3);
    g.post?.flash(1.1);
    g.fx.addShake?.(0.7);
    // truenos de los cuatro colores sobre los caballeros
    this.knights.forEach((K, i) => {
      g.later(0.4 + i * 0.35, () => {
        g.fx.lightning?.(tmpV.set(K.r.pos.x + (Math.random() - 0.5) * 4, K.y0 + 34, K.r.pos.z - 6), tmpW.set(K.r.pos.x, K.y0 + 2.2, K.r.pos.z), K.c, 0.5);
        g.audio.thunder?.(tmpU.set(K.r.pos.x, K.y0 + 10, K.r.pos.z), i === 3);
      });
    });
    g.later(FINALE - 1.6, () => {
      // abre las alas: se va
      this.egg.dragon?.D?.setPose?.('fly', 1.2);
      this.egg.dragon?.fire?.roar(this.egg.dragon.D.root.position);
    });
    this.sndFinale();
  }

  // Arriba del dragón, donde se juntan los rayos.
  crownAt() {
    const D = this.egg.dragon?.D;
    const p = D ? D.root.position : this.at;
    return new THREE.Vector3(p.x + 1.5, p.y + 11, p.z);
  }

  dragonSalute(secs) {
    const Dr = this.egg.dragon;
    if (!Dr?.D) return;
    this.fireT = secs;
    Dr.D.open?.(1);
    Dr.fire?.roar(Dr.D.root.position);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const t = (this.T.value += dt);
    const egg = this.egg;
    const step = egg.step;
    if (step < 8) return;
    // (paso 9 en esta compu: la ceremonia; en el vuelo se apaga todo; el que
    // entra tarde, con el dragón ya en la guerra, no la ve)
    if (step >= 9 && this.finaleT < 0) {
      if (egg.dragon?.mode === 'cumbre') this.finale();
      else this.finaleT = 99;
    }
    if (this.finaleT >= 0) this.finaleT += dt;
    const gone = this.finaleT > FINALE + 2.5 || egg.dragon?.mode === 'war' || egg.dragon?.mode === 'gone';
    this.root.visible = !gone;
    if (gone) return;
    // ¿el local está jurando? (manteniendo la F sobre el lugar)
    const I = g.interact;
    const holding = step === 8 && I?.current === this.van.oathIt && g.input.key('KeyF') && !this.van.sworn.has(myId(g));
    const hk = holding ? clamp01((I.holdT || 0) / HOLD) : 0;
    if (holding && !this.holdOn) this.sndHold(true);
    if (!holding && this.holdOn) this.sndHold(false);
    this.holdOn = holding;
    this.holdK += (hk - this.holdK) * Math.min(1, dt * (holding ? 12 : 4));
    this.flare = Math.max(0, this.flare - dt * 0.55);
    const fin = this.finaleT >= 0 ? smooth(clamp01(this.finaleT / 1.2)) : 0;
    // la columna: tenue marcando el lugar, sube al jurar, estalla al terminar
    // (con la cámara adentro de la columna, o pegada, se apaga: si no, lavaba la pantalla)
    const cam = g.camera.position;
    const cd = Math.hypot(cam.x - this.pillar.position.x, cam.z - this.pillar.position.z) / this.pillar.scale.x;
    const near = smooth(clamp01((cd - 1.3) / 2.2));
    this.pillarMat.uniforms.uK.value = (0.12 + this.holdK * 0.42 + this.flare * 0.5 + fin * 0.35) * near;
    this.pillarMat.uniforms.uCol.value.setRGB(1, 0.84 + fin * 0.14, 0.5 + fin * 0.45);
    this.pillar.scale.x = this.pillar.scale.z = 0.85 - this.holdK * 0.2 + this.flare * 0.3 + fin * 0.45;
    // el sello gira más rápido cuanto más cerca de jurar
    this.spin = (this.spin || 0) + dt * (0.25 + this.holdK * 3.5 + this.flare * 2 + fin * 4);
    this.seal.rotation.y = this.spin;
    const sk = 0.35 + this.holdK * 0.65 + this.flare * 0.6 + fin;
    this.sealMats.forEach((m, i) => {
      m.opacity = Math.min(1, sk * (i < 2 ? 0.9 : 0.75) * (0.85 + Math.sin(t * 3 + i) * 0.15));
    });
    // la nieve y las chispas que suben en remolino alrededor del que jura
    if (this.holdK > 0.05) {
      const p = g.player.pos;
      const n = this.holdK * 60 * dt;
      for (let i = 0; i < n || Math.random() < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.6 + Math.random() * 1.4;
        const up = 1.2 + Math.random() * 2.5;
        g.fx.add.spawn(p.x + Math.cos(a) * r, p.y + 0.1 + Math.random() * 0.4, p.z + Math.sin(a) * r, -Math.sin(a) * 1.6 - Math.cos(a) * 0.4, up, Math.cos(a) * 1.6 - Math.sin(a) * 0.4, { color: Math.random() < 0.5 ? [1, 0.85, 0.5] : [0.85, 0.92, 1], size: 0.06, size1: 0.01, life: 1.1 + Math.random() * 0.6, drag: 0.6 });
        // y la luz que baja del cielo sobre él
        if (Math.random() < 0.5) g.fx.add.spawn(p.x + (Math.random() - 0.5) * 1.2, p.y + 3.5 + Math.random() * 3, p.z + (Math.random() - 0.5) * 1.2, 0, -2.6 - Math.random() * 1.5, 0, { color: [1, 0.9, 0.62], size: 0.09, size1: 0.02, life: 1.3, drag: 0.2 });
        if (i > 40) break;
      }
    }
    // la onda en la nieve
    if (this.wave.visible) {
      this.waveT += dt;
      const u = clamp01(this.waveT / 1.3);
      this.wave.scale.setScalar(1 + u * 9);
      this.wave.material.opacity = (1 - u) * 1.2;
      if (u >= 1) this.wave.visible = false;
    }
    // el dragón: mira al que se acerca (o al que juró) y escupe al cielo
    const Dr = egg.dragon;
    if (Dr?.D && Dr.mode === 'cumbre' && !Dr.flight) {
      const p = g.player.pos;
      const near = Math.hypot(p.x - this.at.x, p.z - this.at.z) < 9;
      if (this.fireT > 0) {
        this.fireT -= dt;
        const m = Dr.D.mouthPos?.(tmpV);
        if (m) Dr.fire.breathe(m, tmpW.copy(m).add(tmpU.set(1.5, 14, 0)), dt, false);
        Dr.D.look?.(tmpW.copy(this.crownAt()));
        if (this.fireT <= 0) Dr.D.open?.(0);
      } else Dr.D.look?.(near ? tmpW.set(p.x, p.y + 1.4, p.z) : null);
    }
    // la corona de luz arriba del dragón (al final)
    const cr = this.crownAt();
    this.crown.position.copy(cr);
    this.crownRing.position.copy(cr);
    this.crownRing.rotation.set(Math.PI / 2 + Math.sin(t) * 0.2, t * 1.4, 0);
    const ck = this.finaleT >= 0 ? smooth(clamp01((this.finaleT - 0.6) / 1.2)) : 0;
    this.crown.material.opacity = ck * (0.8 + Math.sin(t * 9) * 0.2);
    this.crown.scale.setScalar(ck * (3.5 + Math.sin(t * 5) * 0.4));
    this.crownRing.material.opacity = ck * 0.9;
    this.crownRing.scale.setScalar(0.4 + ck * (1 + Math.sin(t * 3) * 0.08));
    if (ck > 0.2 && Math.random() < dt * 30) g.fx.sparkle(tmpV.copy(cr), [1, 0.9, 0.6], 2, 1.2);
    this.updateKnights(dt, t);
  }

  updateKnights(dt, t) {
    const g = this.g;
    if (!this.people.root.visible) return;
    for (const K of this.knights) {
      if (K.rise >= 0 && K.rise < 1) K.rise = Math.min(1, K.rise + dt / RISE);
      const k = smooth(Math.max(0, K.rise));
      K.k = k;
      K.r.pos.y = K.y0 - 2.2 * (1 - k);
      // mira al que juró (o, al final, a la corona de luz)
      const to = K.beamTo || this.at;
      K.r.yaw = Math.atan2(-(to.x - K.r.pos.x), -(to.z - K.r.pos.z));
      K.lift += ((K.raise && k > 0.8 ? 1 : 0) - K.lift) * Math.min(1, dt * 3);
      for (const m of Object.values(K.av.M)) m.opacity = k * (0.72 + Math.sin(t * 3 + K.c) * 0.08);
      K.aura.material.opacity = k * (0.35 + Math.sin(t * 2.3 + K.c) * 0.08);
      K.aura.position.set(K.r.pos.x, K.r.pos.y + 1, K.r.pos.z);
      if (k > 0 && Math.random() < dt * 10) g.fx.sparkle(tmpV.set(K.r.pos.x, K.r.pos.y + 0.4 + Math.random() * 1.4, K.r.pos.z), ELEM_RGB[K.el], 1, 0.4);
    }
    this.people.update(dt);
    for (const K of this.knights) {
      uprightMate(K.av, smooth(K.lift), K.r.yaw);
      K.glow.position.setFromMatrixPosition(K.av.hand.matrixWorld);
      K.glow.material.opacity = K.k * (0.3 + K.lift * 0.7) * (0.85 + Math.sin(t * 7 + K.c) * 0.15);
      K.glow.scale.setScalar(0.5 + K.lift * 0.9);
      // el rayo del mate: al pecho del que juró o a la corona
      K.beam = Math.max(0, K.beam - dt);
      const on = K.beam > 0 && K.lift > 0.6 && K.beamTo;
      K.ray.visible = !!on;
      if (on) {
        const a = K.glow.position;
        const b = K.beamTo;
        const len = a.distanceTo(b);
        K.ray.position.copy(a);
        K.ray.lookAt(b);
        K.ray.scale.set(1 + Math.sin(t * 20 + K.c) * 0.25, 1 + Math.sin(t * 17) * 0.25, len);
        K.ray.material.opacity = Math.min(1, K.beam) * 0.9;
        if (Math.random() < dt * 25) g.fx.sparkle(tmpV.lerpVectors(a, b, Math.random()), ELEM_RGB[K.el], 1, 0.3);
      }
    }
  }

  // ---------------- lo que se oye ----------------
  out(gain = 1) {
    const a = this.g.audio;
    if (!a?.ctx) return null;
    return a.out({ gain, reverb: 0.9, bus: a.music });
  }

  // El coro que sube mientras se mantiene la F (y se apaga si se suelta).
  sndHold(on) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    if (on) {
      const o = this.out(0);
      if (!o) return;
      this.bus = o;
      o.gain.setValueAtTime(0, t);
      o.gain.linearRampToValueAtTime(1, t + HOLD);
      a.choir(o, t, [50, 57, 62, 66], { dur: HOLD + 0.6, gain: 0.05, attack: HOLD * 0.9, release: 1.2 });
      a.organ?.(o, t, 38, HOLD + 0.4, 0.05);
      a.noise(o, { t, dur: HOLD, type: 'bandpass', freq: 400, freqEnd: 3200, q: 0.8, gain: 0.08, attack: HOLD * 0.9 });
    } else if (this.bus) {
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setTargetAtTime(0, t, 0.25);
      this.bus = null;
    }
  }

  sndSworn(n, me) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    this.bus = null;
    const t = a.now;
    const o = this.out(me ? 1 : 0.8);
    if (!o) return;
    // el campanazo grave, el acorde del coro que se abre y un golpe de timbal
    a.bell(o, t, 38 + [0, 5, 7, 12][n % 4], { gain: 0.34, dur: 7 });
    a.bell(o, t + 0.02, 50 + [0, 5, 7, 12][n % 4], { gain: 0.14, dur: 5 });
    a.choir(o, t + 0.05, [50, 54, 57, 62, 66], { dur: 3.2, gain: 0.07, attack: 0.25, release: 2.4 });
    a.tone(o, { t, dur: 1.4, freq: 55, freqEnd: 38, gain: 0.8, attack: 0.005 });
    a.noise(o, { t, dur: 1.2, type: 'lowpass', freq: 220, freqEnd: 60, gain: 0.8, brown: true, attack: 0.005 });
  }

  sndFinale() {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const t = a.now;
    const o = this.out(1.1);
    if (!o) return;
    // las cuatro campanas bajando, el coro entero en re mayor y el órgano
    [62, 57, 54, 50].forEach((n, i) => a.bell(o, t + i * 0.32, n, { gain: 0.22, dur: 6 }));
    a.bell(o, t + 1.4, 38, { gain: 0.4, dur: 8 });
    a.choir(o, t + 0.2, [38, 50, 54, 57, 62, 66, 69], { dur: FINALE, gain: 0.06, attack: 0.8, release: 3 });
    a.organ?.(o, t + 0.2, 26, FINALE, 0.07);
    // el cuerno de guerra al final (llama a la Gran Guerra)
    for (const [d, n] of [[FINALE - 2.2, 45], [FINALE - 1.4, 50]]) {
      a.tone(o, { t: t + d, dur: 1.2, type: 'sawtooth', freq: 440 * 2 ** ((n - 69) / 12), gain: 0.07, attack: 0.12, release: 0.8 });
      a.tone(o, { t: t + d, dur: 1.2, type: 'triangle', freq: 440 * 2 ** ((n - 81) / 12), gain: 0.12, attack: 0.1, release: 0.8 });
    }
  }

  dispose() {
    this.sndHold(false);
    this.people?.dispose?.();
    this.root.removeFromParent();
  }
}
