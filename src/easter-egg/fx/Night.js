import * as THREE from 'three';
import NightSounds from './NightSounds';

// La noche del estero (SKY.night del mapa): la luna llena de verdad (un disco
// con sus manchas en vez del punto borroso), la niebla baja que se junta sobre
// el agua y las luciérnagas. Todo se mueve solo antes de dibujarse (sin tocar
// el bucle del juego) y sigue al nivel del agua (la creciente la sube).
//  - niebla: capas horizontales de ruido que corre con el viento, más espesas
//    sobre el agua y lo bajo, nada bajo techo; brillan del lado de la luna.
//  - luciérnagas: puntitos que se prenden y apagan de a uno alrededor de la
//    cámara (dan la vuelta al salir de la caja), nunca adentro de las casas.
// SKY.night = { mist: { amount, color }, fireflies: { count, radius, color } }.

// capas de niebla: altura sobre el agua (m) y cuánto tapa cada una. Bajas:
// donde una capa corta el pajonal se ve la raya (a 1,3 m quedaba a la vista).
const LAYERS = [
  [0.1, 0.18],
  [0.3, 0.15],
  [0.55, 0.11],
  [0.85, 0.07],
];
// en Baja, Media y Alta van menos capas (cada una es un plano transparente
// sobre media pantalla); en Rendimiento, nada (como el resto del ambiente)
const TIER_LAYERS = { perf: 0, low: 2, medium: 3, high: 2 };
// lo que guarda el mapa de profundidad de fx/Water (base - fondo, de -2,5 a 6 m)
const DEP_SCALE = 8.5;
const DEP_OFF = 2.5;

const tmpC = new THREE.Color();
const tmpV = new THREE.Vector2();

// Ruido suave que empalma (para la niebla): tres octavas de ruido de valor.
function noiseTexture(size = 128) {
  const data = new Uint8Array(size * size);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grids = [8, 16, 32].map((n) => ({ n, v: Float32Array.from({ length: n * n }, rnd) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      let amp = 0.55;
      let tot = 0;
      for (const { n, v } of grids) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const u = smooth(fx - ix);
        const w = smooth(fy - iy);
        const at = (i, j) => v[((j + n) % n) * n + ((i + n) % n)];
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
        const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
        acc += (a + (b - a) * w) * amp;
        tot += amp;
        amp *= 0.5;
      }
      data[y * size + x] = Math.round((acc / tot) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// La luna llena: disco con el borde un poco más oscuro, los mares y un cráter
// brillante abajo (Tycho), y un brillo suave alrededor.
function moonTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const R = 74;
  const glow = x.createRadialGradient(S / 2, S / 2, R * 0.9, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.28)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, S, S);
  const disc = x.createRadialGradient(S / 2 - 8, S / 2 - 8, 6, S / 2, S / 2, R);
  disc.addColorStop(0, '#ffffff');
  disc.addColorStop(0.75, '#eef0f3');
  disc.addColorStop(1, '#c4c8d2');
  x.save();
  x.beginPath();
  x.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  x.fillStyle = disc;
  x.fill();
  x.clip();
  // los mares (manchas grises que se superponen)
  const maria = [
    [104, 98, 24, 0.3],
    [132, 90, 17, 0.26],
    [150, 116, 21, 0.28],
    [124, 124, 13, 0.2],
    [96, 128, 15, 0.22],
    [158, 146, 12, 0.18],
    [116, 106, 30, 0.12],
  ];
  for (const [mx, my, mr, ma] of maria) {
    const g = x.createRadialGradient(mx, my, mr * 0.2, mx, my, mr);
    g.addColorStop(0, `rgba(88,94,112,${ma})`);
    g.addColorStop(1, 'rgba(88,94,112,0)');
    x.fillStyle = g;
    x.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  }
  // cráteres chicos y Tycho con sus rayos
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R * 0.95;
    x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '120,125,140'},${0.08 + rnd() * 0.1})`;
    x.beginPath();
    x.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1 + rnd() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = 'rgba(255,255,255,0.1)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    x.beginPath();
    x.moveTo(120, 178);
    x.lineTo(120 + Math.cos(a) * 40, 178 + Math.sin(a) * 40);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath();
  x.arc(120, 178, 3, 0, Math.PI * 2);
  x.fill();
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MIST_VS = `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const MIST_FS = `
  uniform sampler2D tNoise, tDepth;
  uniform vec4 uDB;
  uniform vec2 uDN, uWind;
  uniform float uT, uLift, uAlpha, uSeed;
  uniform vec3 uCol, uMoonDir, uMoonCol;
  varying vec3 vW;
  void main() {
    vec2 p = vW.xz;
    float n1 = texture2D(tNoise, (p + uWind * uT) / 26.0 + uSeed * 0.37).r;
    float n2 = texture2D(tNoise, (p - vec2(uWind.y, -uWind.x) * uT * 0.7) / 9.0 + uSeed * 0.71).r;
    float n = smoothstep(0.3, 0.8, n1 * 0.7 + n2 * 0.45 - 0.1);
    vec2 dt = texture2D(tDepth, ((p - uDB.xy) / uDB.z + 0.5) / uDN).rg;
    float dep = dt.r * ${DEP_SCALE.toFixed(1)} - ${DEP_OFF.toFixed(1)} + uLift;
    // sobre el agua y lo bajo, espesa; en lo alto, apenas; bajo techo, nada
    float over = mix(0.2, 1.0, smoothstep(-0.5, 0.25, dep)) * (1.0 - dt.g);
    vec3 v = vW - cameraPosition;
    float d = length(v);
    // no se ve el corte de la capa: ni pegada a la cámara ni a la altura de los ojos
    float near = smoothstep(1.5, 7.0, d) * smoothstep(0.1, 0.7, abs(v.y));
    float far = 1.0 - smoothstep(60.0, 110.0, d);
    float a = uAlpha * n * over * near * far;
    // del lado de la luna la niebla se ilumina
    float ph = pow(max(dot(v / max(d, 1e-3), uMoonDir), 0.0), 5.0);
    vec3 col = uCol + uMoonCol * ph * 0.6;
    gl_FragColor = vec4(col * a, a);
  }`;

const FLY_VS = `
  attribute vec4 aSeed;
  uniform float uT, uR, uScale, uBase, uLift, uSize;
  uniform vec3 uCam;
  uniform sampler2D tDepth;
  uniform vec4 uDB;
  uniform vec2 uDN;
  varying float vB;
  void main() {
    float R = uR;
    vec2 drift = vec2(sin(uT * (0.09 + aSeed.w * 0.08) + aSeed.x * 40.0), cos(uT * (0.07 + aSeed.z * 0.08) + aSeed.y * 40.0)) * 2.5;
    vec2 base = aSeed.xy * 2.0 * R + drift;
    vec2 xz = uCam.xz + mod(base - uCam.xz + R, 2.0 * R) - R;
    vec2 dt = texture2D(tDepth, ((xz - uDB.xy) / uDB.z + 0.5) / uDN).rg;
    // el suelo (o el agua, si está más arriba)
    float ground = uBase - (dt.r * ${DEP_SCALE.toFixed(1)} - ${DEP_OFF.toFixed(1)});
    float y = max(ground, uBase + uLift) + 0.3 + aSeed.z * 1.9 + sin(uT * (0.5 + aSeed.w) + aSeed.x * 20.0) * 0.25;
    // se prende un ratito y se apaga (cada una a su ritmo)
    float ph = fract(uT * (0.1 + aSeed.w * 0.12) + aSeed.z * 7.0);
    vB = smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.07, 0.22, ph)) + 0.03;
    // bajo techo no hay; en el borde de la caja se apagan de a poco
    vec2 e = abs(xz - uCam.xz);
    vB *= (1.0 - step(0.5, dt.g)) * (1.0 - smoothstep(R * 0.75, R, max(e.x, e.y)));
    vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vB < 0.001 ? 0.0 : clamp(uSize * uScale / max(-mv.z, 0.1), 1.5, 26.0);
  }`;

const FLY_FS = `
  uniform vec3 uCol;
  varying float vB;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r2 = dot(q, q) * 4.0;
    float a = (exp(-r2 * 6.0) + exp(-r2 * 1.6) * 0.25) * vB;
    gl_FragColor = vec4(uCol * a, a);
  }`;

export default class Night {
  constructor(g, world, cfg) {
    this.g = g;
    this.w = world;
    this.cfg = cfg;
    this.root = new THREE.Group();
    world.root.add(this.root);
    // la luna llena
    if (cfg.fullMoon !== false && world.moonSprite) {
      const m = world.moonSprite.material;
      m.map = moonTexture();
      m.needsUpdate = true;
    }
    this.noise = cfg.mist ? noiseTexture() : null;
    this.layers = [];
    this.mistU = null;
    this.fly = null;
    this.q = null;
    this.last = -1;
    if (cfg.mist) this.buildMist(cfg.mist);
    if (cfg.fireflies) this.buildFireflies(cfg.fireflies);
    // los ruidos de la noche (fx/NightSounds.js)
    this.sounds = cfg.sounds ? new NightSounds(g, world, cfg.sounds) : null;
  }

  // Cada cuadro de juego (Game.update): los ruidos.
  update(dt) {
    this.sounds?.update(dt);
    if (this.cfg.zones) this.zoneTint(dt);
    // un rato después de arrancar (ya están todas las máquinas, puertas y
    // cosas del easter egg): lo diminuto deja de hacer sombra de luna
    if (this.cfg.trimShadows && !this.trimmed) {
      this.trimT = (this.trimT || 0) + dt;
      if (this.trimT > 1.5) {
        this.trimmed = true;
        this.trimShadows(this.cfg.trimShadows);
      }
    }
  }

  // Las piezas sueltas chiquitas (lamparitas, tornillos, astillas, tizas) no
  // hacen sombra: su sombra de luna no se ve y cada una es una llamada de
  // dibujo más en el mapa de sombras. r: el radio (m) de lo que se saca.
  trimShadows(r) {
    let n = 0;
    const s = new THREE.Sphere();
    this.g.scene.traverse((o) => {
      // (los muñecos y los jefes se arman a mano, pieza por pieza: esos no)
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.castShadow || !o.geometry || o.matrixAutoUpdate === false) return;
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      if (s.copy(geo.boundingSphere).applyMatrix4(o.matrixWorld).radius < r) {
        o.castShadow = false;
        n++;
      }
    });
    return n;
  }

  // Cada zona con su aire: la niebla y la luz de abajo (la hemisférica) toman
  // de a poco el tono de la zona donde está el jugador (SKY.night.zones,
  // multiplicadores [r, g, b]). El clima las vuelve a poner cada cuadro
  // (world/Weather.js, World.js): acá se tiñen después.
  zoneTint(dt) {
    const g = this.g;
    const w = this.w;
    const P = g.player?.pos;
    if (!P) return;
    const Z = this.cfg.zones;
    const key = w.zoneAt?.(P.x, P.z, P.y);
    const z = (key && (Z[key] || Z[key[0]])) || Z.default || null;
    const T = (this.tint ||= { fog: new THREE.Color(1, 1, 1), hemi: new THREE.Color(1, 1, 1), to: new THREE.Color(), toH: new THREE.Color() });
    T.to.setRGB(...(z?.fog || [1, 1, 1]));
    T.toH.setRGB(...(z?.hemi || z?.fog || [1, 1, 1]));
    const k = Math.min(1, dt * 0.8);
    T.fog.lerp(T.to, k);
    T.hemi.lerp(T.toH, k);
    const fog = g.scene.fog;
    if (fog) fog.color.multiply(T.fog);
    w.sky?.material?.uniforms?.uFogColor?.value.multiply(T.fog);
    w.hemi?.color.multiply(T.hemi);
  }

  // los datos del agua (profundidad, techo) que usan la niebla y las luciérnagas
  waterU() {
    const W = this.w.water || this.g.water;
    return W ? { tDepth: W.u.tDepth, uDB: W.u.uDB, uDN: W.u.uDN, uLift: W.u.uLift } : null;
  }

  buildMist(M) {
    const W = this.waterU();
    if (!W) return;
    const col = new THREE.Color(M.color ?? 0x9fb2c8);
    this.mistCol = col;
    const shared = {
      tNoise: { value: this.noise },
      ...W,
      uWind: { value: new THREE.Vector2(0.25, 0.1) },
      uT: { value: 0 },
      uCol: { value: new THREE.Color() },
      uMoonDir: { value: this.w.moonDir.clone() },
      uMoonCol: { value: new THREE.Color() },
    };
    this.mistU = shared;
    const W0 = this.w.water || this.g.water;
    const D = W0.D;
    const sx = (D.nx - 1) * D.res;
    const sz = (D.nz - 1) * D.res;
    const geo = new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2);
    LAYERS.forEach(([h, a], i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: MIST_VS,
        fragmentShader: MIST_FS,
        uniforms: { ...shared, uAlpha: { value: a * (M.amount ?? 1) }, uSeed: { value: i + 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        side: THREE.DoubleSide,
        forceSinglePass: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(D.x0 + sx / 2, W0.level + h, D.z0 + sz / 2);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.userData.h = h;
      // (el espejo del agua no la dibuja: una capa plana reflejada no suma nada)
      mesh.userData.reflect = false;
      if (i === 0) mesh.onBeforeRender = () => this.step();
      this.root.add(mesh);
      this.layers.push(mesh);
    });
  }

  buildFireflies(F) {
    const W = this.waterU();
    if (!W) return;
    const n = F.count ?? 300;
    const seed = new Float32Array(n * 4);
    let s = 99;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n * 4; i++) seed[i] = rnd();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const W0 = this.w.water || this.g.water;
    const u = {
      ...W,
      uT: { value: 0 },
      uR: { value: F.radius ?? 32 },
      uScale: { value: 800 },
      uBase: { value: W0.base },
      uSize: { value: F.size ?? 0.07 },
      uCam: { value: new THREE.Vector3() },
      uCol: { value: new THREE.Color(F.color ?? 0xc8ff6a).multiplyScalar(F.glow ?? 3) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: FLY_VS, fragmentShader: FLY_FS, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    pts.onBeforeRender = (renderer, scene, camera) => {
      this.step();
      // el tamaño en pantalla de cada cámara (la del espejo tiene la misma vista)
      const h = renderer.getDrawingBufferSize(tmpV).y;
      u.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad((camera.fov || 70) / 2)));
    };
    this.flyU = u;
    this.fly = pts;
    this.root.add(pts);
  }

  // Una vez por cuadro: el tiempo, la luz de la luna, la calidad y el nivel del agua.
  step() {
    const g = this.g;
    const t = g.time || 0;
    if (t === this.last) return;
    this.last = t;
    // (Personalizada: Game.tier('night'))
    const q = g.tier?.('night') || g.settings?.quality || 'medium';
    if (q !== this.q) {
      this.q = q;
      const n = TIER_LAYERS[q] ?? LAYERS.length;
      this.layers.forEach((m, i) => (m.visible = i < n));
      if (this.fly) this.fly.visible = q !== 'perf';
    }
    const W = this.w.water || g.water;
    const moon = this.w.moon;
    if (this.mistU) {
      const u = this.mistU;
      u.uT.value = t;
      // la niebla toma la luz de la luna (y los relámpagos, si hubiera)
      const k = moon ? moon.intensity : 1;
      tmpC.copy(this.mistCol).multiplyScalar(0.07 + k * 0.1);
      u.uCol.value.copy(tmpC);
      if (moon) u.uMoonCol.value.copy(moon.color).multiplyScalar(k * 0.25);
      const wind = g.weather?.cur?.wind ?? 0.15;
      u.uWind.value.set(0.2 + wind * 0.8, 0.08 + wind * 0.3);
      // la neblina del clima 'fog' la espesa
      const extra = 1 + (g.weather?.cur?.mist ?? 0) * 0.8;
      for (const m of this.layers) {
        m.position.y = (W?.level ?? 0) + m.userData.h;
        m.material.uniforms.uAlpha.value = LAYERS[this.layers.indexOf(m)][1] * (this.cfg.mist.amount ?? 1) * extra;
      }
    }
    if (this.flyU) {
      this.flyU.uT.value = t;
      this.flyU.uCam.value.copy(g.camera.position);
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.layers) m.material.dispose();
    this.layers[0]?.geometry.dispose();
    this.fly?.geometry.dispose();
    this.fly?.material.dispose();
    this.noise?.dispose();
  }
}
