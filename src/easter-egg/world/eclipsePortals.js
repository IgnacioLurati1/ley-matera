import * as THREE from 'three';
import { ZONES } from '../config/map';
import { PORTALS, ISLANDS } from '../config/maps/eclipse';
import { ISLE_IDS } from './eclipseSky';

// Los portales del desgarro de Eclipse Matero. Las islas no tienen puentes: se
// pasa de una a otra por estos tajos en el aire. Cada portal une dos puntas;
// se abre pagando de cualquiera de los dos lados y queda abierto, de ida y
// vuelta. El que lleva `locked` no se compra (lo abre el paso previo del
// Pack-a-Pava, world/papDesgarro.js).
//
// - Cerrado es una cicatriz fina que late. Abierto es un tajo de borde
//   quebrado y adentro SE VE LA OTRA ISLA: una cámara parada en la otra punta
//   dibuja lo que hay allá en una textura chica (`capture`). De lejos es una
//   foto que se renueva cada tanto; de cerca y en las calidades altas, en vivo.
//   Alrededor flotan esquirlas de roca y en el piso queda la marca.
// - El jugador que entra hace el viaje (`begin`): el túnel del desgarro le
//   tapa la pantalla desde los bordes, en el medio pasa a la otra punta, y la
//   otra isla aparece por un tajo que se abre. Mientras dura nadie lo lastima.
// - Los muertos lo siguen: world.navLinks une las dos puntas en el campo de
//   flujo (como la telesilla del penal), así que caminan hasta el tajo; ahí,
//   si en su isla ya no queda nadie a quien perseguir, cruzan (lo decide el
//   anfitrión).
// - En línea lo lleva el anfitrión: EclipseEgg manda y recibe (`send`, `apply`,
//   `state`, `applyFull`).
//
// Interruptores de prueba: __mduNoPortalView (sin la vista de la otra isla),
// __mduNoPortalLive (solo fotos, nunca en vivo), __mduNoPortalTrip (cruce seco,
// sin el viaje).

// el paño donde se dibuja (con lugar para el resplandor) y el tajo adentro
const QW = 4.6;
const QH = 6.2;
const TW = 2.1;
const TH = 4.3;
// a qué altura del piso queda el medio del tajo
const MID = 2.45;
// a qué distancia del tajo se cruza, y cuánto se espera para volver a cruzar
const REACH = 0.85;
const COOLDOWN = 0.9;
// lo que le cuesta al campo de flujo cruzar un portal (en celdas)
const LINK_COST = 4;
// el viaje: taparse, el túnel, abrirse (s)
const T_IN = 0.32;
const T_HOLD = 0.4;
const T_OUT = 0.55;
const T_ALL = T_IN + T_HOLD + T_OUT;
// la vista de la otra isla: de cerca en vivo, más lejos una foto que se renueva
const LIVE_R = 15;
const SNAP_R = 70;
const SNAP_AGE = 12;
const SNAP_GAP = 2.5;
// las esquirlas de cada punta
const SHARDS = 7;

const NOISE = /* glsl */ `
  #define TAU 6.28318531
  float h1(float n) { return fract(sin(n * 127.1 + 0.37) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fb3(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.3) * 0.2; }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// El tajo. Sale premultiplicado: el color se suma y el alfa tapa lo de atrás
// (adentro del tajo tapa todo; alrededor oscurece un poco, así el filo se lee
// contra cualquier cielo).
const FRAG = /* glsl */ `
  uniform float uTime, uOpen, uLock, uHas, uSeed, uKick;
  uniform vec2 uPar;
  uniform vec3 uCol;
  uniform sampler2D uMap;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * vec2(${QW.toFixed(2)}, ${QH.toFixed(2)});
    float t = uTime;
    float yn = p.y / ${(TH / 2).toFixed(3)};
    float ay = abs(yn);
    // el cuerpo: una almendra; cerrado, un pelo
    float body = pow(max(1.0 - ay * ay, 0.0), 0.7);
    float beat = 0.5 + 0.5 * sin(t * 2.1 + uSeed * 6.0);
    // el filo quebrado, cada lado el suyo, y la columna que se tuerce
    float jl = fb3(vec2(p.y * 1.7 + uSeed * 11.0, t * 0.35)) - 0.5;
    float jr = fb3(vec2(p.y * 1.7 + uSeed * 23.0 + 40.0, t * 0.35 + 9.0)) - 0.5;
    float fine = h2(vec2(floor(p.y * 9.0 + uSeed * 5.0), 3.0)) - 0.5;
    float cx = (fb3(vec2(p.y * 0.8 + uSeed * 3.0, t * 0.2)) - 0.5) * 0.4 * body;
    float x = p.x - cx;
    float hw = body * (0.016 + 0.012 * beat + uOpen * ${(TW / 2).toFixed(3)} + (x < 0.0 ? jl : jr) * (0.05 + 0.55 * uOpen) + fine * 0.06 * uOpen);
    hw = max(hw, 0.0);
    float d = abs(x) - hw;
    // (más allá de las puntas, nada)
    float gm = smoothstep(1.16, 0.96, ay);
    float ins = (1.0 - smoothstep(-0.03, 0.0, d)) * step(ay, 1.0);

    // adentro: la otra isla, torcida por el desgarro (más hacia el filo)
    float edgeN = smoothstep(-0.55, 0.0, d);
    vec2 tuv = vec2(x / ${TW.toFixed(2)} + 0.5, p.y / ${TH.toFixed(2)} + 0.5);
    vec2 wob = vec2(vn(vec2(p.y * 2.2 - t * 0.9, p.x * 2.0 + uSeed)), vn(vec2(p.x * 2.4 + t * 0.7, p.y * 2.0 + 5.0 + uSeed))) - 0.5;
    tuv += wob * (0.02 + 0.11 * edgeN) + uPar;
    tuv = clamp(tuv, 0.01, 0.99);
    vec3 view;
    if (uHas > 0.5) {
      float ca = 0.003 + 0.022 * edgeN;
      view = vec3(texture2D(uMap, tuv + vec2(ca, 0.0)).r, texture2D(uMap, tuv).g, texture2D(uMap, tuv - vec2(ca, 0.0)).b);
    } else {
      // (sin vista: el aire de la otra isla, revuelto)
      float sw = fb3(tuv * 3.0 + vec2(t * 0.15, -t * 0.25) + wob);
      view = mix(vec3(0.02, 0.0, 0.05), uCol * 0.5, smoothstep(0.3, 0.8, sw));
    }
    // el velo: violeta, más cargado hacia el filo, y un brillo que corre
    view = mix(view, view * vec3(0.78, 0.6, 1.25) + uCol * 0.015, 0.1 + 0.5 * edgeN * edgeN);
    view *= 1.0 - 0.55 * pow(edgeN, 4.0);
    view += vec3(0.4, 0.16, 0.85) * pow(edgeN, 6.0) * 0.4;
    float mem = vn(vec2(p.x * 3.0 + sin(p.y * 2.0 + t), p.y * 5.0 - t * 1.3));
    view += vec3(0.35, 0.2, 0.7) * smoothstep(0.74, 0.92, mem) * 0.05;
    view = mix(vec3(0.02, 0.0, 0.05), view, smoothstep(0.15, 0.85, uOpen));

    // el filo: un núcleo casi blanco, el resplandor y chispas que saltan
    float core = exp(-abs(d) / 0.016);
    float glow = exp(-max(d, 0.0) / (0.1 + 0.12 * uOpen)) * step(0.0, d);
    float flick = 0.78 + 0.22 * sin(t * 17.0 + p.y * 6.0) * sin(t * 7.3 + uSeed);
    float sy = floor(p.y * 7.0);
    float sk = floor(t * 14.0);
    float sl = fract(p.y * 7.0) - 0.5;
    float spark = step(0.93, h2(vec2(sy, sk + uSeed * 31.0))) * exp(-max(d, 0.0) / (0.06 + 0.16 * h2(vec2(sy + 3.0, sk)))) * step(0.0, d) * exp(-sl * sl * 90.0);
    vec3 hot = mix(vec3(1.5, 1.15, 2.2), vec3(1.5, 0.75, 0.7), uLock);
    vec3 vio = mix(vec3(0.45, 0.13, 1.0), vec3(0.5, 0.1, 0.14), uLock);
    float life = mix(0.5 + 0.3 * beat, 1.0, uOpen) * (1.0 - 0.4 * uLock) + uKick * 1.6;
    vec3 col = (hot * core + vio * glow * 0.55 * flick + vec3(1.3, 0.85, 1.9) * spark * (0.4 + 0.6 * uOpen)) * life * gm;
    col += view * ins;
    float a = max(ins, 0.62 * exp(-max(d, 0.0) / 0.3) * gm * (0.35 + 0.65 * uOpen));
    if (a < 0.004 && max(col.r, max(col.g, col.b)) < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// La marca en el piso: grietas que salen del pie del tajo y un charco de luz.
const FRAG_MARK = /* glsl */ `
  uniform float uTime, uOpen, uLock, uSeed, uKick;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    vec2 dir = p / max(r, 1e-4);
    float a = atan(p.y, p.x);
    float n = vn(dir * 1.6 + vec2(uSeed * 7.0, r * 2.5));
    float ac = a / TAU * 11.0 + n * 1.1 + uSeed;
    float k = abs(fract(ac) - 0.5) * 2.0;
    float on = step(0.35, h1(floor(ac) + uSeed * 3.0));
    float len = 0.45 + 0.55 * h1(floor(ac) * 1.7 + uSeed);
    float crack = (1.0 - smoothstep(0.0, 0.06 + 0.1 * r, k)) * on * smoothstep(len, len * 0.3, r);
    float pool = exp(-r * 4.5);
    float pulse = 0.6 + 0.4 * sin(uTime * 2.1 + uSeed * 6.0 - r * 5.0);
    vec3 vio = mix(vec3(0.5, 0.16, 1.1), vec3(0.6, 0.12, 0.16), uLock);
    float life = mix(0.3, 1.0, uOpen) * (1.0 - 0.3 * uLock) + uKick * 0.6;
    vec3 col = vio * (crack * 2.2 * pulse + pool * 0.12) * life;
    // (la tierra quemada alrededor)
    float burn = smoothstep(1.0, 0.0, r + (vn(dir * 3.0 + uSeed * 9.0) - 0.5) * 0.5);
    float al = 0.5 * burn * (0.45 + 0.55 * uOpen) * (1.0 - crack);
    gl_FragColor = vec4(col, al);
  }
`;

// El viaje: el túnel del desgarro, a pantalla entera (no mira la cámara).
const VERT_TRIP = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const FRAG_TRIP = /* glsl */ `
  uniform float uTime, uIn, uHold, uOut, uAspect, uSeed, uCalm;
  uniform vec3 uCol;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    float a = atan(p.y, p.x);
    float z = 1.0 / (r + 0.06);
    float t = uTime;
    // las paredes: nubes violetas que pasan
    float wl = fb3(dir * 2.2 + vec2(z * 0.35 - t * 2.6, uSeed * 5.0));
    vec3 col = mix(vec3(0.006, 0.0, 0.018), vec3(0.09, 0.02, 0.2), smoothstep(0.35, 0.8, wl));
    col *= 0.15 + 0.85 * smoothstep(0.0, 0.55, r);
    // las rayas de luz que vienen de frente
    float ac = a / TAU * 96.0;
    float cell = floor(ac);
    float rnd = h1(cell + uSeed * 13.0);
    float af = fract(ac) - 0.5;
    float head = fract(z * 0.22 * (0.6 + rnd) - t * (2.2 + 2.5 * rnd) + rnd * 7.0);
    float streak = smoothstep(0.0, 0.5, head) * smoothstep(1.0, 0.5, head) * step(0.62, rnd) * exp(-af * af * 70.0) * smoothstep(0.06, 0.5, r);
    col += mix(vec3(0.42, 0.16, 0.95), vec3(0.85, 0.7, 1.15), h1(cell * 3.7)) * streak * 0.55;
    // anillos que pasan
    float ring = exp(-abs(fract(z * 0.18 - t * 1.4) - 0.5) * 18.0) * smoothstep(0.1, 0.6, r);
    col += vec3(0.3, 0.1, 0.62) * ring * 0.22;
    // al fondo, la luz de la isla a la que se va: crece
    float endGlow = exp(-r * (8.0 - 4.0 * uHold));
    col += (uCol * 0.4 + vec3(0.45, 0.3, 0.75)) * endGlow * (0.3 + 0.7 * uHold);
    col *= uCalm;
    // taparse: desde los bordes hacia el medio
    float rin = mix(2.0 * max(uAspect, 1.0), -0.4, uIn);
    float al = smoothstep(rin - 0.02, rin + 0.36, r);
    vec3 rim = vec3(0.7, 0.35, 1.2) * uCalm * exp(-abs(r - rin) * 12.0) * step(0.001, uIn) * (1.0 - step(0.999, uIn));
    // abrirse: un tajo que crece desde el medio y deja ver la isla nueva
    if (uOut > 0.0) {
      float k = uOut * uOut * (3.0 - 2.0 * uOut);
      float jag = (fb3(vec2(p.y * 2.6 + uSeed * 9.0, 1.7)) - 0.5) * 0.34 + (h2(vec2(floor(p.y * 11.0), uSeed)) - 0.5) * 0.07;
      float hw = k * (uAspect * 1.3 + 0.5) * (1.0 - 0.4 * abs(p.y) * (1.0 - k)) + jag * k * (1.0 - k) * 4.0;
      float dd = abs(p.x - jag * (1.0 - k)) - hw;
      al = smoothstep(-0.02, 0.05, dd);
      rim = vec3(0.85, 0.5, 1.4) * uCalm * exp(-abs(dd) * 20.0) * (1.0 - k);
    }
    gl_FragColor = vec4(col * al + rim, al);
  }
`;

const PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false };
const backOut = (k) => {
  const s = 1.9;
  const q = k - 1;
  return q * q * ((s + 1) * q + s) + 1;
};
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export default class EclipsePortals {
  constructor(game, egg) {
    this.g = game;
    this.egg = egg;
    this.root = new THREE.Group();
    this.root.name = 'eclipsePortals';
    game.scene.add(this.root);
    this.time = { value: 0 };
    this.cd = 0;
    // cuántos muertos cruzaron y cuántas vistas se dibujaron (lo miran las pruebas)
    this.crossed = 0;
    this.shots = 0;
    this.lastSnap = -99;
    this.trip = null;
    this.frame = 0;
    const w = game.world;
    const geo = (this.geo = new THREE.PlaneGeometry(QW, QH));
    geo.translate(0, MID, 0);
    const markGeo = (this.markGeo = new THREE.CircleGeometry(1, 28));
    markGeo.rotateX(-Math.PI / 2);
    const islaOf = (k) => ZONES[k].isla;
    this.ends = [];
    this.list = PORTALS.map((def) => {
      const P = { def, open: false, k: 0, ends: [] };
      for (const [e, o] of [[def.a, def.b], [def.b, def.a]]) {
        const y = w.floorAt(e.pos[0], e.pos[1]);
        const seed = (def.id * 0.37 + (e === def.a ? 0.11 : 0.61)) % 1;
        // (sin vista todavía, el tajo muestra el color del cielo de la isla a la que lleva)
        const col = new THREE.Color(ISLANDS[islaOf(o.zone)].lamp);
        const U = { uTime: this.time, uOpen: { value: 0 }, uLock: { value: def.locked ? 1 : 0 }, uHas: { value: 0 }, uSeed: { value: seed }, uKick: { value: 0 }, uPar: { value: new THREE.Vector2() }, uCol: { value: col }, uMap: { value: null } };
        const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, side: THREE.DoubleSide, ...PREMUL });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(e.pos[0], y, e.pos[1]);
        mesh.renderOrder = 6;
        this.root.add(mesh);
        // la marca: adentro de la isla, hasta donde hay piso parejo
        let mr = 1.9;
        const mx = e.pos[0] + e.face[0] * 0.9;
        const mz = e.pos[1] + e.face[1] * 0.9;
        const flat = (r) => {
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            if (Math.abs(w.floorAt(mx + Math.cos(a) * r, mz + Math.sin(a) * r, y + 1) - y) > 0.12) return false;
          }
          return true;
        };
        while (mr > 0.7 && !flat(mr)) mr -= 0.15;
        const markMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_MARK, uniforms: U, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...PREMUL });
        const mark = new THREE.Mesh(markGeo, markMat);
        mark.position.set(mx, y + 0.02, mz);
        mark.scale.setScalar(mr);
        mark.renderOrder = 2;
        this.root.add(mark);
        const end = {
          P, pos: new THREE.Vector3(e.pos[0], y, e.pos[1]), face: e.face, zone: e.zone, isla: islaOf(e.zone), cell: w.idx(Math.floor(e.pos[0]), Math.floor(e.pos[1])),
          mat, markMat, mesh, mark, U, seed, col, rt: null, stale: true, shotT: -99, dist: 999, kick: 0, other: null, n: this.ends.length,
        };
        P.ends.push(end);
        this.ends.push(end);
        game.interact.add({
          kind: 'desgarro',
          pos: new THREE.Vector3(e.pos[0], y + 1.2, e.pos[1]),
          radius: 2.4,
          prompt: () => (P.open ? null : def.locked ? { text: 'Sellado', noCost: true, info: true } : 'abrir el desgarro'),
          cost: () => (def.locked ? 0 : game.interact.doorCost({ cost: def.cost })),
          use: () => {
            if (P.open || def.locked) return false;
            this.send({ a: 'open', i: def.id });
            return true;
          },
        });
      }
      P.ends[0].other = P.ends[1];
      P.ends[1].other = P.ends[0];
      return P;
    });

    // las esquirlas de roca de todas las puntas, en un solo dibujo
    const sg = (this.shardGeo = new THREE.OctahedronGeometry(1, 0));
    const sm = (this.shardMat = new THREE.MeshStandardMaterial({ color: 0x0d0912, emissive: 0x2a0f52, emissiveIntensity: 0.14, roughness: 0.85, metalness: 0, flatShading: true }));
    const shards = (this.shards = new THREE.InstancedMesh(sg, sm, this.ends.length * SHARDS));
    shards.name = 'eclipsePortalShards';
    shards.frustumCulled = false;
    shards.castShadow = false;
    shards.receiveShadow = false;
    this.root.add(shards);
    this.shardData = [];
    for (const e of this.ends) {
      for (let j = 0; j < SHARDS; j++) {
        const r = (n) => {
          const v = Math.sin((e.n * 31 + j * 17 + n * 7.3) * 12.9898) * 43758.5453;
          return v - Math.floor(v);
        };
        this.shardData.push({ a: r(1) * Math.PI * 2, rad: 1.25 + r(2) * 0.8, h: 0.5 + (j / (SHARDS - 1)) * 3.9, sp: (0.12 + r(3) * 0.2) * (r(4) < 0.5 ? -1 : 1), bob: r(5) * 6.28, s: [0.035 + r(6) * 0.05, 0.1 + r(7) * 0.2, 0.03 + r(8) * 0.04], rot: [r(9) * 6.28, r(10) * 6.28, 0.3 + r(11) * 0.9] });
      }
      this.placeShards(e);
    }
    shards.instanceMatrix.needsUpdate = true;

    // la cámara que mira desde la otra punta
    this.pcam = new THREE.PerspectiveCamera(64, TW / TH, 0.3, 400);
    // el viaje, a pantalla entera
    this.tripU = { uTime: this.time, uIn: { value: 0 }, uHold: { value: 0 }, uOut: { value: 0 }, uAspect: { value: 1.78 }, uSeed: { value: 0 }, uCalm: { value: 1 }, uCol: { value: new THREE.Color() } };
    this.over = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT_TRIP, fragmentShader: FRAG_TRIP, uniforms: this.tripU, depthTest: false, ...PREMUL }));
    this.over.frustumCulled = false;
    this.over.renderOrder = 10000;
    this.over.visible = false;
    this.over.name = 'eclipsePortalTrip';
    this.root.add(this.over);
    this.bake();
  }

  get host() {
    return !this.g.net || this.g.net.host;
  }

  // ---------------- lo que se escucha (horneado una vez, en la carga) ----------------
  bake() {
    const a = this.g.audio;
    if (this.baked || !a?.ctx || !a.bakeSound) return;
    this.baked = true;
    // se abre: el crujido, el aire que se rasga, el golpe sordo y un brillo que sube
    a.bakeSound('ptl-abre', 1.9, function (o, t) {
      for (let i = 0; i < 7; i++) this.noise(o, { t: t + i * 0.03 + Math.random() * 0.02, dur: 0.05, type: 'highpass', freq: 2600 + Math.random() * 3200, gain: 0.4 - i * 0.04, attack: 0.002 });
      this.noise(o, { t: t + 0.12, dur: 0.55, type: 'bandpass', freq: 300, freqEnd: 4200, q: 0.9, gain: 0.8, attack: 0.05 });
      this.tone(o, { t: t + 0.15, dur: 1.3, type: 'sine', freq: 72, freqEnd: 32, gain: 0.5, attack: 0.01 });
      this.tone(o, { t: t + 0.3, dur: 1.5, type: 'sine', freq: 660, freqEnd: 1320, gain: 0.045, attack: 0.25 });
      this.tone(o, { t: t + 0.3, dur: 1.5, type: 'triangle', freq: 990, freqEnd: 1980, gain: 0.025, attack: 0.3 });
    });
    // el viaje: el tirón, el túnel y la salida
    a.bakeSound('ptl-viaje', 1.5, function (o, t) {
      this.noise(o, { t, dur: 0.4, type: 'bandpass', freq: 200, freqEnd: 3200, q: 1, gain: 0.85, attack: 0.22 });
      this.tone(o, { t: t + 0.25, dur: 0.8, type: 'sine', freq: 120, freqEnd: 38, gain: 0.42, attack: 0.03 });
      this.noise(o, { t: t + 0.32, dur: 0.5, type: 'bandpass', freq: 1100, freqEnd: 480, q: 1.4, gain: 0.4, attack: 0.05 });
      this.tone(o, { t: t + 0.3, dur: 0.5, type: 'sawtooth', freq: 180, freqEnd: 90, gain: 0.04, attack: 0.05 });
      this.noise(o, { t: t + 0.72, dur: 0.35, type: 'highpass', freq: 4200, gain: 0.3, attack: 0.01 });
      this.tone(o, { t: t + 0.72, dur: 0.7, type: 'sine', freq: 1760, freqEnd: 880, gain: 0.05, attack: 0.01 });
      this.tone(o, { t: t + 0.74, dur: 0.6, type: 'sine', freq: 60, freqEnd: 34, gain: 0.3, attack: 0.005 });
    });
    // un muerto que pasa
    a.bakeSound('ptl-pasa', 0.4, function (o, t) {
      this.noise(o, { t, dur: 0.22, type: 'bandpass', freq: 700, freqEnd: 2200, q: 1.5, gain: 0.5, attack: 0.03 });
      this.tone(o, { t, dur: 0.3, type: 'sine', freq: 520, freqEnd: 240, gain: 0.1, attack: 0.01 });
    }, 2);
  }

  play(key, pos = null, gain = 1) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.(key);
    if (buf) a.playBuffer(buf, { pos, gain, reverb: 0.3, ref: pos ? 4 : undefined });
  }

  // El anfitrión decide y avisa (los invitados piden por el uso de siempre).
  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'ptl', ...m });
  }

  apply(m) {
    if (m.a === 'open') this.openNow(m.i);
  }

  // Abre el portal (también los trabados: el paso del Pack-a-Pava, la prueba).
  unlock(id) {
    this.send({ a: 'open', i: id });
  }

  openNow(id, quiet = false) {
    const P = this.list.find((p) => p.def.id === id);
    if (!P || P.open) return;
    P.open = true;
    const g = this.g;
    const w = g.world;
    // el campo de flujo une las dos puntas
    const L = w.navLinks || (w.navLinks = new Map());
    const [A, B] = P.ends;
    for (const [from, to] of [[A, B], [B, A]]) {
      const list = L.get(from.cell) || [];
      list.push([to.cell, LINK_COST]);
      L.set(from.cell, list);
    }
    w.navVersion = (w.navVersion || 0) + 1;
    g.activateZone(A.zone);
    g.activateZone(B.zone);
    for (const e of P.ends) e.U.uLock.value = 0;
    if (quiet) {
      P.k = 1;
      for (const e of P.ends) e.U.uOpen.value = 1;
      return;
    }
    // (suena en la punta más cercana al que escucha)
    const cp = g.camera.position;
    const near = A.pos.distanceToSquared(cp) < B.pos.distanceToSquared(cp) ? A : B;
    for (const e of P.ends) e.kick = 1;
    this.play('ptl-abre', near.pos, 1);
    if (near.pos.distanceTo(cp) < 14) g.post?.flash?.(0.18);
  }

  state() {
    return { o: this.list.filter((p) => p.open).map((p) => p.def.id) };
  }

  applyFull(s) {
    for (const id of s?.o || []) this.openNow(id, true);
  }

  // Las islas donde hay alguien a quien perseguir.
  livePlaces() {
    const g = this.g;
    const out = new Set();
    const add = (p, down) => {
      if (!p || down) return;
      const k = g.world.zoneAt(p.x, p.z, p.y);
      if (k) out.add(ZONES[k].isla);
    };
    add(g.player?.pos, g.player?.downed);
    if (g.net?.remote) for (const r of g.net.remote.values()) add(r.pos, r.downed);
    return out;
  }

  // Las esquirlas de una punta: cerrado, pocas y pegadas al piso; abierto,
  // dando vueltas alrededor del tajo.
  placeShards(e) {
    const k = e.P.k;
    const t = this.time.value;
    for (let j = 0; j < SHARDS; j++) {
      const D = this.shardData[e.n * SHARDS + j];
      const a = D.a + t * D.sp;
      const rad = (0.55 + D.rad * 0.25) * (1 - k) + D.rad * k;
      const h = (0.25 + (j % 3) * 0.3) * (1 - k) + D.h * k + Math.sin(t * 0.7 + D.bob) * 0.12;
      const s = 0.55 + 0.45 * k;
      tmpV.set(e.pos.x + Math.cos(a) * rad, e.pos.y + h, e.pos.z + Math.sin(a) * rad);
      tmpQ.setFromEuler(tmpE.set(D.rot[0] + t * D.rot[2] * 0.4, D.rot[1] + t * D.rot[2] * 0.3, 0));
      tmpS.set(D.s[0] * s, D.s[1] * s, D.s[2] * s);
      this.shards.setMatrixAt(e.n * SHARDS + j, tmpM.compose(tmpV, tmpQ, tmpS));
    }
  }

  update(dt) {
    const g = this.g;
    this.time.value += dt;
    this.frame++;
    if (!this.baked) this.bake();
    for (const P of this.list) {
      const want = P.open ? 1 : 0;
      if (P.k !== want) {
        P.k += Math.sign(want - P.k) * Math.min(Math.abs(want - P.k), dt / 1.1);
        const o = P.k >= 1 ? 1 : Math.max(0, backOut(P.k));
        for (const e of P.ends) e.U.uOpen.value = o;
      }
    }
    // de frente al que mira (girando solo de costado), la vista corrida según
    // desde dónde se mira, y las esquirlas de las puntas cercanas
    const cp = g.camera.position;
    let moved = false;
    for (const e of this.ends) {
      const dx = cp.x - e.pos.x;
      const dz = cp.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      e.dist = Math.hypot(d, cp.y - e.pos.y - MID);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      if (d > 0.01) e.U.uPar.value.set(((dx * -e.face[1] + dz * e.face[0]) / d) * 0.1, Math.max(-0.05, Math.min(0.05, (cp.y - e.pos.y - 1.7) * 0.02)));
      if (e.kick > 0) e.kick = Math.max(0, e.kick - dt * 1.3);
      e.U.uKick.value = e.kick * e.kick;
      if (e.dist < 80 || (e.P.k > 0 && e.P.k < 1)) {
        this.placeShards(e);
        moved = true;
      }
    }
    if (moved) this.shards.instanceMatrix.needsUpdate = true;
    if (this.trip) this.tripStep(dt);
    if (g.state !== 'playing') return;
    this.cd = Math.max(0, this.cd - dt);
    const pl = g.player;
    if (pl && !pl.downed && !pl.ride && this.cd <= 0 && !this.trip) {
      for (const P of this.list) {
        if (!P.open || P.k < 0.9) continue;
        for (let i = 0; i < 2; i++) {
          const e = P.ends[i];
          if (Math.abs(pl.pos.y - e.pos.y) > 1.8 || Math.hypot(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z) > REACH) continue;
          this.begin(pl, e, P.ends[1 - i]);
          return;
        }
      }
    }
    if (this.host) this.herd();
    // los muertos que entran a La Disformidad (por un portal o como sea) se
    // deforman ahí mismo (en todas las compus: lo decide el id y la zona)
    this.dimT = (this.dimT || 0) - dt;
    if (this.dimT <= 0 && g.zombies?.deformIf) {
      this.dimT = 0.5;
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || z.disforme) continue;
        g.zombies.deformIf(z);
      }
    }
  }

  // ---------------- el viaje ----------------
  begin(pl, from, to) {
    const g = this.g;
    if (globalThis.__mduNoPortalTrip === true) {
      this.cross(pl, to);
      this.cd = COOLDOWN;
      g.post?.flash?.(0.22);
      this.play('ptl-pasa', null, 1);
      return;
    }
    this.trip = { t: 0, from, to, moved: false, fov: 0 };
    // (mientras viaja y un momento después, nada lo lastima)
    pl.guardT = Math.max(pl.guardT || 0, g.time + T_ALL + 0.7);
    this.tripU.uSeed.value = Math.random();
    // (opción "menos destellos")
    this.tripU.uCalm.value = g.settings?.calmFx ? 0.55 : 1;
    this.tripU.uCol.value.copy(from.col);
    this.tripU.uIn.value = this.tripU.uHold.value = this.tripU.uOut.value = 0;
    this.over.visible = true;
    from.kick = 1;
    this.play('ptl-viaje', null, 0.95);
  }

  tripStep(dt) {
    const g = this.g;
    const T = this.trip;
    const pl = g.player;
    T.t += dt;
    if (!T.moved && T.t >= T_IN) {
      this.cross(pl, T.to);
      T.moved = true;
      T.to.kick = 1;
    }
    // (adentro del túnel no se camina)
    if (T.moved && T.t < T_IN + T_HOLD) pl.vel?.set?.(0, 0, 0);
    const U = this.tripU;
    const c = (v) => Math.max(0, Math.min(1, v));
    U.uIn.value = c(T.t / T_IN);
    U.uHold.value = c((T.t - T_IN) / T_HOLD);
    U.uOut.value = c((T.t - T_IN - T_HOLD) / T_OUT);
    const cv = g.renderer?.domElement;
    if (cv?.height) U.uAspect.value = cv.width / cv.height;
    // el tirón: la vista se abre al entrar y vuelve al salir (sobre el campo
    // de visión de base del juego, que lo lleva suave a la cámara)
    const want = T.t < T_IN + T_HOLD ? 24 * c(T.t / (T_IN + T_HOLD * 0.5)) : 24 * (1 - U.uOut.value);
    if (g.baseFov != null) {
      g.baseFov += want - T.fov;
      T.fov = want;
    }
    if (T.t >= T_ALL) this.endTrip();
  }

  endTrip() {
    const T = this.trip;
    if (!T) return;
    if (this.g.baseFov != null) this.g.baseFov = Math.round((this.g.baseFov - T.fov) * 1e4) / 1e4;
    if (!T.moved) this.cross(this.g.player, T.to);
    this.over.visible = false;
    this.trip = null;
    this.cd = COOLDOWN;
  }

  // El jugador sale por la otra punta, un paso adentro de la isla.
  cross(pl, to) {
    const g = this.g;
    const x = to.pos.x + to.face[0] * 1.5;
    const z = to.pos.z + to.face[1] * 1.5;
    pl.pos.set(x, g.world.floorAt(x, z, to.pos.y + 1), z);
    pl.vel?.set?.(0, 0, 0);
    pl.yaw = Math.atan2(-to.face[0], -to.face[1]);
    this.cd = COOLDOWN;
  }

  // Los muertos: el que llegó a un tajo abierto y en su isla ya no tiene a
  // nadie, cruza.
  herd() {
    const g = this.g;
    const pool = g.zombies?.pool;
    if (!pool) return;
    let live = null;
    for (const z of pool) {
      if (!z.active || z.dead || z.boss || (z.eclT || 0) > g.time) continue;
      for (const P of this.list) {
        if (!P.open) continue;
        for (let i = 0; i < 2; i++) {
          const e = P.ends[i];
          if (Math.abs(z.pos.y - e.pos.y) > 1.8 || Math.hypot(z.pos.x - e.pos.x, z.pos.z - e.pos.z) > 1.15) continue;
          live = live || this.livePlaces();
          if (live.has(e.isla)) continue;
          const to = P.ends[1 - i];
          const side = (Math.random() - 0.5) * 1.2;
          const x = to.pos.x + to.face[0] * 1.1 - to.face[1] * side;
          const zz = to.pos.z + to.face[1] * 1.1 + to.face[0] * side;
          const y = g.world.floorAt(x, zz, to.pos.y + 1);
          z.pos.set(x, y, zz);
          z.baseY = y;
          z.eclT = g.time + 1.2;
          this.crossed++;
          // (el tajo late donde sale, y se lo escucha llegar)
          if (to.kick < 0.3) {
            to.kick = 0.3;
            if (to.dist < 30) this.play('ptl-pasa', to.pos, 0.7);
          }
        }
      }
    }
  }

  // ---------------- la vista de la otra isla ----------------
  // 0: solo fotos; 1: en vivo cada cuadro; 2: en vivo cuadro por medio
  liveMode() {
    if (globalThis.__mduNoPortalLive === true) return 0;
    const q = this.g.settings?.quality;
    // (en Alta, solo fotos: dibujar la otra isla cada dos cuadros costaba 10 ms
    // de CPU en el Monumento y la Torre con el layout v4, 2026-10-06)
    return q === 'ultra' || q === 'epic' ? 1 : 0;
  }

  // Antes del dibujo del mundo (fx/PostFX.render, junto al espejo del agua):
  // como mucho UNA vista por cuadro.
  prerender(renderer, scene, cam) {
    const g = this.g;
    if (scene !== g.scene || this.trip || globalThis.__mduNoPortalView === true || g.settings?.quality === 'perf') return;
    const live = this.liveMode();
    const now = this.time.value;
    cam.getWorldDirection(tmpV);
    let best = null;
    let bd = Infinity;
    for (const e of this.ends) {
      if (!e.P.open || e.dist > SNAP_R) continue;
      let need = false;
      if (!e.rt || e.stale) need = true;
      else {
        // (delante de la cámara)
        const facing = ((e.pos.x - cam.position.x) * tmpV.x + (e.pos.y + MID - cam.position.y) * tmpV.y + (e.pos.z - cam.position.z) * tmpV.z) / Math.max(e.dist, 0.01) > 0.25;
        if (live && e.dist < LIVE_R && facing) need = live === 1 || this.frame % 2 === 0;
        else if (facing && now - e.shotT > SNAP_AGE && now - this.lastSnap > SNAP_GAP) need = true;
      }
      if (need && e.dist < bd) {
        best = e;
        bd = e.dist;
      }
    }
    if (best) this.capture(renderer, scene, best);
  }

  capture(renderer, scene, e) {
    const g = this.g;
    const to = e.other;
    const small = g.settings?.quality === 'low' || g.settings?.quality === 'medium';
    e.rt ||= new THREE.WebGLRenderTarget(small ? 192 : 256, small ? 384 : 512, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const pc = this.pcam;
    pc.position.set(to.pos.x + to.face[0] * 0.7, to.pos.y + 1.75, to.pos.z + to.face[1] * 0.7);
    pc.lookAt(to.pos.x + to.face[0] * 12, to.pos.y + 1.9, to.pos.z + to.face[1] * 12);
    pc.updateMatrixWorld(true);
    // el aire de la isla de allá (la niebla y el cenit del cielo), mientras dura
    const fog = scene.fog;
    const A = g.weather?.atmos;
    const ii = ISLE_IDS.indexOf(to.isla);
    const SU = g.world.sky?.material?.uniforms;
    const keep = fog && A?.P?.[ii] ? { c: tmpC.copy(fog.color), d: fog.density, a: SU?.uCapA?.value, b: SU?.uCapB?.value, m: SU?.uCapMix?.value } : null;
    if (keep) {
      fog.color.copy(A.P[ii].fog);
      if (fog.isFogExp2) fog.density = A.P[ii].dens;
      if (SU?.uCapA) {
        SU.uCapA.value = SU.uCapB.value = ii;
        SU.uCapMix.value = 0;
        SU.uFogColor?.value.copy(fog.color);
      }
    }
    // (el propio tajo fuera: lee la textura en la que se está dibujando)
    e.mesh.visible = false;
    const over = this.over.visible;
    this.over.visible = false;
    const rt0 = renderer.getRenderTarget();
    const auto = renderer.shadowMap.autoUpdate;
    const need = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    const mwa = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try {
      renderer.setRenderTarget(e.rt);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, pc);
    } finally {
      renderer.setRenderTarget(rt0);
      scene.matrixWorldAutoUpdate = mwa;
      renderer.shadowMap.autoUpdate = auto;
      renderer.shadowMap.needsUpdate = need;
      e.mesh.visible = true;
      this.over.visible = over;
      if (keep) {
        fog.color.copy(keep.c);
        fog.density = keep.d;
        if (SU?.uCapA) {
          SU.uCapA.value = keep.a;
          SU.uCapB.value = keep.b;
          SU.uCapMix.value = keep.m;
          SU.uFogColor?.value.copy(fog.color);
        }
      }
    }
    e.U.uMap.value = e.rt.texture;
    e.U.uHas.value = 1;
    e.stale = false;
    e.shotT = this.lastSnap = this.time.value;
    this.shots++;
  }

  dispose() {
    this.endTrip();
    this.root.removeFromParent();
    for (const e of this.ends) {
      e.mat.dispose();
      e.markMat.dispose();
      e.rt?.dispose();
    }
    this.geo.dispose();
    this.markGeo.dispose();
    this.shardGeo.dispose();
    this.shardMat.dispose();
    this.shards.dispose();
    this.over.geometry.dispose();
    this.over.material.dispose();
  }
}
