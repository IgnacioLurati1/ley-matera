import * as THREE from 'three';
import { MAP_W, MAP_H, WALL_H, ZONES, SKY, FEATURES } from '../config/map';
import { bossRound } from '../config/rules';
import { ceilAt } from './Levels';

// Clima: despejado, llovizna, tormenta con relámpagos, niebla, viento y la
// luna roja de las rondas del Capataz. Todo cambia de a poco (unos 12 s).
// La lluvia es una nube de rayitas que se mueve en la GPU alrededor de la
// cámara; una máscara del mapa evita que caiga adentro de los galpones.

const STATES = {
  clear: { rain: 0, storm: 0, fog: 0.034, fogColor: 0x0b0d14, wind: 0.15, cloud: 0.15, mist: 0, blood: 0 },
  drizzle: { rain: 0.45, storm: 0, fog: 0.042, fogColor: 0x0f131a, wind: 0.3, cloud: 0.7, mist: 0.2, blood: 0 },
  storm: { rain: 1, storm: 1, fog: 0.05, fogColor: 0x1a1f28, wind: 0.85, cloud: 1, mist: 0.1, blood: 0 },
  fog: { rain: 0, storm: 0, fog: 0.075, fogColor: 0x4c5555, wind: 0.05, cloud: 0.6, mist: 1, blood: 0 },
  wind: { rain: 0, storm: 0, fog: 0.036, fogColor: 0x0d0f14, wind: 1, cloud: 0.45, mist: 0, blood: 0 },
  blood: { rain: 0, storm: 0, fog: 0.045, fogColor: 0x3a0e0a, wind: 0.35, cloud: 0.3, mist: 0.35, blood: 1 },
  // la Cárcel de las Almas del penal (world/Cerro.js): tormenta con el cielo
  // colorado y poca niebla (el redondel es grande: se tiene que ver entero)
  carcel: { rain: 0.7, storm: 1, fog: 0.02, fogColor: 0x24090a, wind: 0.8, cloud: 1, mist: 0, blood: 0.6 },
  // ronda de perros: niebla baja y relámpagos secos, sin lluvia
  dogs: { rain: 0, storm: 1, fog: 0.07, fogColor: 0x262a33, wind: 0.35, cloud: 1, mist: 0.9, blood: 0 },
};

const DROPS = 4200;
const tmpDusk = new THREE.Color(0x7a4e46);
const BOX = new THREE.Vector3(34, 18, 34);

export default class Weather {
  constructor(game) {
    this.g = game;
    this.name = 'clear';
    // cada mapa puede cambiar el color de sus climas (SKY.states: la noche de luna del estero)
    this.S = { ...STATES };
    for (const [k, v] of Object.entries(SKY.states || {})) this.S[k] = { ...STATES[k], ...v };
    this.cur = { ...this.S.clear };
    this.target = this.S.clear;
    this.fogColor = new THREE.Color(this.S.clear.fogColor);
    this.timer = 90;
    this.flash = 0;
    this.nextBolt = 10;
    this.wet = 0;
    this.windDir = new THREE.Vector2(0.8, 0.35).normalize();
    this.dusk = 0;
    this.duskCur = 0;
    this.buildRain();
    this.wetMats = [game.world.M.dirt, game.world.M.dirtDark, game.world.M.ground].filter(Boolean).map((m) => ({ m, r: m.roughness, c: m.color.clone() }));
  }

  // Máscara del mapa: R = 1 donde está a cielo abierto; G = hasta dónde llega
  // el techo de esa celda (sobre roofMax). En los mapas con alturas (el penal,
  // el castillo) cada techo tiene la suya: con una sola, abajo de los techos
  // altos llovía adentro.
  buildMask() {
    const w = this.g.world;
    const data = new Uint8Array(MAP_W * MAP_H * 4);
    const roofs = new Float32Array(MAP_W * MAP_H);
    let top = WALL_H + 0.05;
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const j = z * MAP_W + x;
        if (!w.isIndoorCell(x, z)) continue;
        let r = WALL_H + 0.05;
        if (w.levels) {
          let c = ceilAt(w, x, z);
          // (una pared: hasta el techo más alto de al lado)
          if (!Number.isFinite(c)) {
            c = -Infinity;
            let fy = 0;
            for (const [dx, dz] of N4) {
              const n = ceilAt(w, x + dx, z + dz);
              if (Number.isFinite(n)) c = Math.max(c, n);
              if (w.inside(x + dx, z + dz)) fy = Math.max(fy, w.fy?.[w.idx(x + dx, z + dz)] || 0);
            }
            if (!Number.isFinite(c)) c = fy + WALL_H;
          }
          r = c + 0.1;
        }
        roofs[j] = r;
        top = Math.max(top, r);
      }
    }
    this.roofMax = top + 0.5;
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const j = z * MAP_W + x;
        const i = j * 4;
        const open = !roofs[j];
        data[i] = data[i + 2] = open ? 255 : 0;
        data[i + 1] = open ? 0 : Math.min(255, Math.ceil((roofs[j] / this.roofMax) * 255));
        data[i + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, MAP_W, MAP_H, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  buildRain() {
    const pos = new Float32Array(DROPS * 2 * 3);
    const side = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      for (let s = 0; s < 2; s++) {
        pos.set([x, y, z], (i * 2 + s) * 3);
        side[i * 2 + s] = s;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
    this.rainU = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uWind: { value: new THREE.Vector2() },
      uAmount: { value: 0 },
      uFlash: { value: 0 },
      uMask: { value: this.buildMask() },
      uMap: { value: new THREE.Vector2(MAP_W, MAP_H) },
      uRoof: { value: this.roofMax },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainU,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float side;
        uniform float uTime, uAmount, uRoof; uniform vec3 uCam, uBox; uniform vec2 uWind, uMap; uniform sampler2D uMask;
        varying float vA;
        void main(){
          vec3 o = position;
          float speed = 11.0 + fract(o.x * 57.3) * 4.0;
          vec3 vel = vec3(uWind.x * 4.0, -speed, uWind.y * 4.0);
          vec3 p = o * uBox + vel * uTime;
          vec3 origin = uCam - uBox * 0.5;
          p = origin + mod(p - origin, uBox);
          p -= normalize(vel) * side * (0.35 + fract(o.z * 13.1) * 0.25);
          vec4 mk = texture2D(uMask, p.xz / uMap);
          float vis = (mk.r > 0.5 || p.y > mk.g * uRoof) ? 1.0 : 0.0;
          vis *= step(fract(o.y * 91.7 + o.x * 13.3), uAmount);
          float d = distance(p, uCam);
          vA = vis * (1.0 - side * 0.85) * smoothstep(uBox.x * 0.5, 3.0, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          if (vis < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform float uFlash; varying float vA;
        void main(){ gl_FragColor = vec4(mix(vec3(0.55, 0.6, 0.68), vec3(1.0), uFlash), vA * (0.32 + uFlash * 0.5)); }`,
    });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.rain.visible = false;
    this.g.scene.add(this.rain);
  }

  // ---------------- sonido ----------------
  startAudio() {
    const a = this.g.audio;
    if (this.snd || !a) return;
    const c = a.ctx;
    const src = c.createBufferSource();
    src.buffer = a.noiseBuf;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(hp).connect(lp).connect(g).connect(a.music);
    src.start();
    // viento: ruido marrón con ráfagas
    const wsrc = c.createBufferSource();
    wsrc.buffer = a.brownBuf;
    wsrc.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.8;
    const wg = c.createGain();
    wg.gain.value = 0;
    wsrc.connect(wf).connect(wg).connect(a.music);
    wsrc.start();
    this.snd = { src, lp, g, wsrc, wf, wg };
  }

  stopAudio() {
    if (!this.snd) return;
    for (const n of [this.snd.src, this.snd.wsrc]) {
      try {
        n.stop();
      } catch {
        /* ya estaba parado */
      }
    }
    this.snd = null;
  }

  // storm: el de la tormenta (alterna los dos medios y el intenso; el lejano
  // llega sin agudos). Si no, el del rayo de los carpinchos: corto y suave.
  thunder(delay, close, storm = false) {
    const a = this.g.audio;
    let id = 'trueno-carpincho';
    if (storm) {
      // los tres en orden mezclado; al rearmar, sin repetir el último
      if (!this.thunderBag?.length) {
        const bag = ['trueno-medio-1', 'trueno-medio-2', 'trueno-intenso'].sort(() => Math.random() - 0.5);
        if (bag[0] === this.lastThunder) bag.push(bag.shift());
        this.thunderBag = bag;
      }
      id = this.lastThunder = this.thunderBag.shift();
    }
    const k = (storm ? (close ? 1.5 : 1.3) : 2) * (this.indoor ? 0.7 : 1);
    if (a.playThunder?.(id, { gain: k, bus: a.music, when: delay, muffle: storm && !close ? 1800 : 0 })) return;
    const t = a.now + delay;
    const o = a.out({ gain: (close ? 1.3 : 0.75) * (this.indoor ? 0.7 : 1), reverb: 0.9, bus: a.music });
    if (close) a.noise(o, { t, dur: 0.35, type: 'highpass', freq: 900, gain: 0.8, attack: 0.002 });
    a.noise(o, { t: t + 0.05, dur: 3.5 + Math.random() * 2, freq: 420, freqEnd: 60, q: 0.6, gain: 1, brown: true, attack: 0.15 });
    for (let i = 0; i < 4; i++) a.noise(o, { t: t + 0.4 + i * (0.4 + Math.random() * 0.6), dur: 1.4, freq: 260, freqEnd: 70, gain: 0.5 + Math.random() * 0.4, brown: true, attack: 0.2 });
    a.tone(o, { t, dur: 2.2, freq: 48, freqEnd: 26, gain: 0.7, attack: 0.1 });
  }

  // ---------------- lógica ----------------
  // (sin cartel: el clima se ve y se oye; _announce queda por los que lo llaman)
  set(name, _announce = true) {
    if (!this.S[name] || name === this.name) return;
    this.name = name;
    this.g.net?.event('weather', { n: name });
    this.target = this.S[name];
    this.timer = 110 + Math.random() * 120;
    if (name === 'storm') this.nextBolt = 3 + Math.random() * 4;
  }

  // Cada 5 rondas el cielo se pone más colorado, hasta la luna roja de la 20.
  setRoundSky(round) {
    const k = Math.min(1, Math.floor(round / 5) / 4);
    if (k <= this.dusk) return;
    this.dusk = k;
  }

  onRound(round) {
    // (el Monumento no tiene jefe de ronda: sin la luna roja que lo anuncia;
    // MonumentoEgg.tuneRound, __mduMonuRoundBoss)
    const noBoss = FEATURES.monumento && !globalThis.__mduMonuRoundBoss;
    if (bossRound(round, FEATURES.bossFrom) && !noBoss) {
      this.set('blood');
      return;
    }
    if (this.name === 'blood') {
      this.set('clear', false);
      return;
    }
    if (round < 3 || this.timer > 0) return;
    // (SKY.weathers: los climas del mapa; en el estero no llueve)
    const pool = (SKY.weathers || [['clear', 3], ['drizzle', 3], ['storm', 2.5], ['fog', 2], ['wind', 1.5]]).filter(([n]) => n !== this.name);
    let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
    for (const [n, w] of pool) {
      r -= w;
      if (r <= 0) {
        this.set(n);
        break;
      }
    }
  }

  update(dt) {
    const g = this.g;
    const c = this.cur;
    const T = this.target;
    const k = Math.min(1, dt / 12);
    for (const key of ['rain', 'storm', 'fog', 'wind', 'cloud', 'mist', 'blood']) c[key] += (T[key] - c[key]) * k;
    this.fogColor.lerp(new THREE.Color(T.fogColor), k);
    this.duskCur += (this.dusk - this.duskCur) * Math.min(1, dt / 20);
    const red = Math.max(c.blood, this.duskCur * 0.85);
    this.timer -= dt;
    const cam = g.camera;
    const zone = g.world.zoneAt(g.player?.pos.x ?? cam.position.x, g.player?.pos.z ?? cam.position.z);
    // (al precalentar otro mapa la zona puede no ser de este)
    this.indoor = !!zone && !!ZONES[zone] && !ZONES[zone].outdoor;

    // niebla y cielo (al atardecer, bruma anaranjada y más liviana)
    const fog = g.scene.fog;
    const day = g.world.dayCur || 0;
    fog.density = c.fog * (1 - day * 0.35);
    fog.color.copy(this.fogColor).lerp(tmpDusk, day * 0.85);
    const sky = g.world.sky?.material.uniforms;
    // opción "menos destellos": los relámpagos alumbran mucho menos
    const calm = g.settings?.calmFx ? 0.3 : 1;
    if (sky) {
      sky.uCloud.value = c.cloud;
      sky.uFlash.value = this.flash * calm;
      sky.uBlood.value = red;
      // (con menos niebla que la de siempre no tiene que alejarse del color de la niebla)
      sky.uFogAmt.value = Math.max(0, Math.min(1, (c.fog - 0.034) * 14));
      sky.uFogColor.value.copy(this.fogColor);
    }
    g.world.setMoon?.(c.cloud, Math.max(c.blood, this.duskCur));

    // relámpagos
    this.flash = Math.max(0, this.flash - dt * 4);
    if (c.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 16;
        this.bolt();
      }
    }
    if (this.pulses) {
      for (const p of this.pulses) {
        p.t -= dt;
        if (p.t <= 0 && !p.done) {
          p.done = true;
          this.flash = Math.max(this.flash, p.k);
        }
      }
      this.pulses = this.pulses.filter((p) => !p.done);
    }
    g.world.setFlash?.(this.flash * calm, c.blood);

    // lluvia
    const u = this.rainU;
    u.uTime.value = g.time;
    u.uCam.value.copy(cam.position);
    u.uAmount.value = c.rain;
    u.uFlash.value = this.flash * calm;
    this.windDir.rotateAround(new THREE.Vector2(), Math.sin(g.time * 0.05) * dt * 0.02);
    u.uWind.value.copy(this.windDir).multiplyScalar(c.wind);
    this.rain.visible = c.rain > 0.02;
    if (c.rain > 0.05) this.splashes(dt, c.rain);
    if (c.wind > 0.5) this.leaves(dt, c.wind);
    if (c.mist > 0.05) this.mists(dt, c.mist);

    // suelo mojado (tierra más oscura y brillosa)
    this.wet += ((c.rain > 0.3 ? 1 : 0) - this.wet) * Math.min(1, dt / (c.rain > 0.3 ? 20 : 60));
    for (const w of this.wetMats) {
      w.m.roughness = w.r - this.wet * 0.55;
      w.m.color.copy(w.c).multiplyScalar(1 - this.wet * 0.35);
    }

    // sonido: lluvia (apagada bajo techo), viento
    if (g.state === 'playing' && !this.snd) this.startAudio();
    if (this.snd) {
      const a = g.audio;
      const now = a.now;
      this.snd.g.gain.setTargetAtTime(c.rain * (this.indoor ? 0.3 : 0.4), now, 0.4);
      this.snd.lp.frequency.setTargetAtTime(this.indoor ? 900 : 5500, now, 0.3);
      const gust = 0.6 + 0.4 * Math.sin(g.time * 0.7) * Math.sin(g.time * 0.23 + 1);
      this.snd.wg.gain.setTargetAtTime(c.wind * gust * (this.indoor ? 0.35 : 0.8), now, 0.5);
      this.snd.wf.frequency.setTargetAtTime(350 + gust * 500, now, 0.5);
    }
  }

  bolt() {
    const close = Math.random() < 0.35;
    // dos o tres destellos seguidos, como un relámpago de verdad
    this.pulses = [{ t: 0, k: close ? 1 : 0.6 }, { t: 0.12 + Math.random() * 0.1, k: close ? 0.7 : 0.4 }];
    if (Math.random() < 0.5) this.pulses.push({ t: 0.35 + Math.random() * 0.2, k: 0.5 });
    this.thunder(close ? 0.15 + Math.random() * 0.3 : 1.2 + Math.random() * 2.2, close, true);
  }

  splashes(dt, amount) {
    const g = this.g;
    const cam = g.camera.position;
    const n = Math.floor(amount * 60 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const x = cam.x + (Math.random() - 0.5) * 22;
      const z = cam.z + (Math.random() - 0.5) * 22;
      if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) continue;
      g.fx.alpha.spawn(x, 0.03, z, 0, 0.8 + Math.random() * 0.6, 0, { color: [0.6, 0.65, 0.72], size: 0.035, size1: 0.01, life: 0.18, alpha: 0.45, gravity: 9 });
    }
  }

  leaves(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 6) return;
    const cam = g.camera.position;
    const w = this.windDir;
    const x = cam.x - w.x * 10 + (Math.random() - 0.5) * 14;
    const z = cam.z - w.y * 10 + (Math.random() - 0.5) * 14;
    if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) return;
    const s = 3 + Math.random() * 3;
    g.fx.alpha.spawn(x, 0.3 + Math.random() * 2.5, z, w.x * s, 0.3 + Math.random(), w.y * s, { color: [0.28 + Math.random() * 0.15, 0.2, 0.08], size: 0.06, life: 3, alpha: 0.9, gravity: 0.6, drag: 0.2 });
  }

  mists(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 5) return;
    const cam = g.camera.position;
    const x = cam.x + (Math.random() - 0.5) * 26;
    const z = cam.z + (Math.random() - 0.5) * 26;
    const blood = this.cur.blood;
    g.fx.alpha.spawn(x, 0.25 + Math.random() * 0.4, z, this.windDir.x * 0.3, 0.02, this.windDir.y * 0.3, {
      color: blood > 0.5 ? [0.35, 0.1, 0.08] : [0.42, 0.46, 0.46],
      size: 2.5,
      size1: 4.5,
      life: 7 + Math.random() * 4,
      alpha: 0.07 + amount * 0.05,
      drag: 0.1,
    });
  }

  dispose() {
    this.stopAudio();
    this.rain.geometry.dispose();
    this.rainU.uMask.value.dispose();
  }
}
