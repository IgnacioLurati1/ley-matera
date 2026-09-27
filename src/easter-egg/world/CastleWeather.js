import * as THREE from 'three';
import Weather from './Weather';
import { MAP_W, MAP_H, ZONES } from '../config/map';
import { bossRound } from '../config/rules';

// El clima del castillo del Mateendrache: siempre nieva un poco, a veces una
// nevada grande o una ventisca, y en la ronda de los pumas el viento blanco
// (no se ve nada a diez metros). Es el clima de siempre (world/Weather.js)
// con estados propios y nieve en vez de lluvia. La nieve es una nube de
// copos que se mueve en la GPU alrededor de la cámara; una máscara del mapa
// dice dónde hay cielo abierto y a qué altura está cada techo (así no nieva
// adentro de los salones, pero sí arriba de sus techos).

const STATES = {
  clear: { rain: 0, snow: 0.28, storm: 0, fog: 0.011, fogColor: 0x141b27, wind: 0.2, cloud: 0.12, mist: 0.15, blood: 0 },
  nevada: { rain: 0, snow: 0.85, storm: 0, fog: 0.019, fogColor: 0x252d3a, wind: 0.35, cloud: 0.85, mist: 0.15, blood: 0 },
  ventisca: { rain: 0, snow: 1, storm: 0, fog: 0.032, fogColor: 0x3a4250, wind: 1, cloud: 1, mist: 0.5, blood: 0 },
  // la ronda de los pumas: viento blanco
  dogs: { rain: 0, snow: 1, storm: 0, fog: 0.055, fogColor: 0x58626e, wind: 1, cloud: 1, mist: 1, blood: 0 },
  blood: { rain: 0, snow: 0.35, storm: 0, fog: 0.02, fogColor: 0x3a0e0a, wind: 0.35, cloud: 0.3, mist: 0.35, blood: 1 },
  // el cielo del final del easter egg: tormenta seca con relámpagos
  storm: { rain: 0, snow: 0.6, storm: 1, fog: 0.024, fogColor: 0x1c2230, wind: 0.8, cloud: 1, mist: 0.2, blood: 0 },
  // la Gran Guerra, en el Éter: sin nieve, niebla violeta finita y relámpagos
  eter: { rain: 0, snow: 0, storm: 1, fog: 0.006, fogColor: 0x2a1838, wind: 0.5, cloud: 1, mist: 0, blood: 0 },
};

const FLAKES = 7000;
const BOX = new THREE.Vector3(44, 26, 44);
const ROOF_MAX = 64;

export default class CastleWeather extends Weather {
  constructor(game) {
    super(game);
    this.cur = { ...STATES.clear };
    this.target = STATES.clear;
    this.fogColor.set(STATES.clear.fogColor);
    this.buildSnow();
  }

  // Máscara: rojo = cielo abierto, verde = altura del techo (sobre ROOF_MAX).
  buildSnowMask() {
    const w = this.g.world;
    const data = new Uint8Array(MAP_W * MAP_H * 4);
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = (z * MAP_W + x) * 4;
        const open = !w.isIndoorCell(x, z);
        let roof = 0;
        if (!open) {
          const k = w.zoneAt(x + 0.5, z + 0.5);
          const Z = k ? ZONES[k] : null;
          roof = Z ? (Z.roof ?? (Z.y || 0) + 3.6) : w.top?.[z * MAP_W + x] || 0;
          // las paredes: su propio alto
          if (!Z && w.top) roof = w.top[z * MAP_W + x];
          // lo enterrado: la montaña encima
          if (Z?.under) roof = ROOF_MAX;
        }
        data[i] = open ? 255 : 0;
        data[i + 1] = Math.min(255, Math.round((roof / ROOF_MAX) * 255));
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, MAP_W, MAP_H, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  buildSnow() {
    const pos = new Float32Array(FLAKES * 3);
    const seed = new Float32Array(FLAKES);
    for (let i = 0; i < FLAKES; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.snowU = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uWind: { value: new THREE.Vector2() },
      uAmount: { value: 0 },
      uFlash: { value: 0 },
      uMask: { value: this.buildSnowMask() },
      uMap: { value: new THREE.Vector2(MAP_W, MAP_H) },
      uRoofMax: { value: ROOF_MAX },
      uScale: { value: 300 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.snowU,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float seed;
        uniform float uTime, uAmount, uRoofMax, uScale; uniform vec3 uCam, uBox; uniform vec2 uWind, uMap; uniform sampler2D uMask;
        varying float vA;
        void main(){
          vec3 o = position;
          float fall = 0.7 + seed * 0.9;
          // copos que bailan: se van de costado y vuelven
          float sw = uTime * (0.6 + seed * 0.9) + seed * 40.0;
          vec3 vel = vec3(uWind.x * (1.5 + seed * 2.5), -fall * (1.0 + length(uWind) * 0.6), uWind.y * (1.5 + seed * 2.5));
          vec3 p = o * uBox + vel * uTime + vec3(sin(sw) * 0.6, 0.0, cos(sw * 0.8) * 0.6);
          vec3 origin = uCam - uBox * 0.5;
          p = origin + mod(p - origin, uBox);
          vec2 m = texture2D(uMask, p.xz / uMap).rg;
          float vis = (m.r > 0.5 || p.y > m.g * uRoofMax + 0.1) ? 1.0 : 0.0;
          vis *= step(seed, uAmount);
          float d = distance(p, uCam);
          vA = vis * smoothstep(uBox.x * 0.5, uBox.x * 0.25, d) * smoothstep(0.35, 1.2, d);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uScale * (0.035 + seed * 0.03) / max(0.1, -mv.z), 1.0, 22.0);
          if (vA < 0.01) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform float uFlash; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float r = dot(c, c) * 4.0;
          float a = smoothstep(1.0, 0.15, r) * vA * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(0.86, 0.9, 1.0), vec3(1.0), uFlash), a);
        }`,
    });
    this.snowPts = new THREE.Points(geo, mat);
    this.snowPts.frustumCulled = false;
    this.snowPts.renderOrder = 4;
    this.g.scene.add(this.snowPts);
  }

  // (sin cartel: el clima se ve y se oye)
  set(name, _announce = true) {
    if (!STATES[name] || name === this.name) return;
    this.name = name;
    this.g.net?.event('weather', { n: name });
    this.target = STATES[name];
    this.timer = 110 + Math.random() * 120;
    if (name === 'storm') this.nextBolt = 3 + Math.random() * 4;
  }

  onRound(round) {
    if (bossRound(round) && this.g.rounds?.bossPending) {
      this.set('blood');
      return;
    }
    if (this.name === 'blood') {
      this.set('clear', false);
      return;
    }
    if (round < 3 || this.timer > 0) return;
    const pool = [['clear', 3], ['nevada', 3], ['ventisca', 1.5]].filter(([n]) => n !== this.name);
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
    const c = this.cur;
    const T = this.target;
    // la nieve: acá (el resto lo hace el clima de siempre)
    c.snow = (c.snow ?? 0) + ((T.snow ?? 0) - (c.snow ?? 0)) * Math.min(1, dt / 12);
    super.update(dt);
    const g = this.g;
    const u = this.snowU;
    u.uTime.value = g.time;
    u.uCam.value.copy(g.camera.position);
    u.uAmount.value = c.snow;
    u.uWind.value.copy(this.windDir).multiplyScalar(c.wind);
    u.uFlash.value = this.flash * (g.settings?.calmFx ? 0.3 : 1);
    u.uScale.value = (g.renderer?.getDrawingBufferSize?.(tmpSize).y || 900) * 0.5;
    this.snowPts.visible = c.snow > 0.02;
  }

  // Con viento: remolinos de nieve que corren pegados al piso (en vez de hojas).
  leaves(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 9) return;
    const cam = g.camera.position;
    const w = this.windDir;
    const x = cam.x - w.x * 9 + (Math.random() - 0.5) * 16;
    const z = cam.z - w.y * 9 + (Math.random() - 0.5) * 16;
    if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) return;
    const y = g.world.floorAt(x, z);
    const s = 4 + Math.random() * 4;
    g.fx.alpha.spawn(x, y + 0.15 + Math.random() * 0.5, z, w.x * s, 0.2 + Math.random() * 0.4, w.y * s, { color: [0.86, 0.9, 0.96], size: 0.5, size1: 1.8, life: 1.6 + Math.random(), alpha: 0.16, drag: 0.4 });
  }

  // Bruma: blanca y a ras del piso de donde esté la cámara.
  mists(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 6) return;
    const cam = g.camera.position;
    const x = cam.x + (Math.random() - 0.5) * 28;
    const z = cam.z + (Math.random() - 0.5) * 28;
    // (adentro de las salas no hay bruma)
    if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) return;
    const y = g.world.floorAt(x, z);
    g.fx.alpha.spawn(x, y + 0.3 + Math.random() * 0.6, z, this.windDir.x * 0.6, 0.02, this.windDir.y * 0.6, {
      color: this.cur.blood > 0.5 ? [0.35, 0.1, 0.08] : [0.8, 0.84, 0.9],
      size: 2.8,
      size1: 5,
      life: 6 + Math.random() * 4,
      alpha: 0.05 + amount * 0.05,
      drag: 0.1,
    });
  }

  dispose() {
    super.dispose();
    this.snowPts.geometry.dispose();
    this.snowPts.material.dispose();
    this.snowU.uMask.value.dispose();
  }
}

const tmpSize = new THREE.Vector2();
