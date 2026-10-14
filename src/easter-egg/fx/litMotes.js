import * as THREE from 'three';
import { MAP_W, MAP_H } from '../config/map';

// Partículas con luz (2026-10-12, el usuario, mejoras gráficas de Ultra y
// Épica #8: "ceniza, chispas, hojas y polvo iluminados por el farol que tienen
// cerca"). Miles de motas que se mueven solas en la placa (nada por partícula
// en la CPU: cada cuadro solo se ponen la hora, la cámara y las luces):
//  - el campo (polvo, ceniza, hojas): cada mota tiene su lugar fijo en el
//    mundo y da la vuelta en una caja alrededor de la cámara, como la lluvia
//    (world/Weather.js); en el borde de la caja se desvanece.
//  - las chispas: salen de los fuegos más cercanos, suben con vaivén y se apagan.
// La luz: las K lámparas prendidas más cercanas (world.lights, las del pool de
// las de evento y el fogonazo de los tiros) se suman en cada mota, con más
// brillo cuando la lámpara queda detrás (el polvo a contraluz). Lejos de las
// luces no se ven: es el polvo en el haz del farol. Afuera, un poco de luna.
// Todo aditivo, sin escribir profundidad. Lo que va en cada mapa y calidad:
// config/quality.js GFX_PLUS.motes. globalThis.__mduSinParticulasLuz: como antes
// (el polvo plano de fx/Ambience).

const K = 8;
const FIRES = 4;

// clases de mota: tamaño (m), velocidad (m/s), remolino (m), caja (m), dónde
// (1 solo afuera, -1 solo adentro, 0 en todos lados), color propio, brillo
export const KINDS = {
  dust: { size: 0.022, vel: [0.025, -0.008, 0.018], swirl: 0.22, box: [22, 7, 22], where: 0, color: [1.0, 0.92, 0.8], gain: 0.8, fwd: 5, flick: 0 },
  ash: { size: 0.04, vel: [0.22, -0.32, 0.08], swirl: 0.55, box: [28, 12, 28], where: 1, color: [0.75, 0.72, 0.7], gain: 0.4, fwd: 2, flick: 0.5, amb: 1 },
  leaf: { size: 0.075, vel: [0.7, -0.45, 0.25], swirl: 0.9, box: [30, 10, 30], where: 1, color: [0.62, 0.48, 0.22], gain: 0.42, fwd: 1, flick: 1, amb: 1 },
  ember: { size: 0.026, color: [1.0, 0.5, 0.16], gain: 1.3, ember: 1 },
};

// cuántas de cada una en cada mapa (en Épica; en Ultra, el 60 %)
export const MOTE_SPEC = {
  molino: { dust: 3000, ember: 160, leaf: 500 },
  granja: { dust: 2500, ember: 160, leaf: 600 },
  penal: { dust: 4000, ember: 160 },
  torre: { dust: 4000 },
  castillo: { dust: 3500, ember: 160 },
  esteros: { dust: 1500, ember: 160 },
  monumento: { dust: 2500, leaf: 500 },
  eclipse: { ash: 3000, ember: 160, dust: 1500 },
};
const ULTRA = 0.6;
// (el usuario, 2026-10-13: "son demasiadas y quizás muy grandes": el 40 % del
// polvo, la ceniza y las hojas, y un tercio más chicas; las brasas de los
// fuegos quedan igual. __mduMotasViejas = true: como antes)
const viejas = () => globalThis.__mduMotasViejas === true;
const MENOS = 0.4;
const CHICAS = 0.65;

const VERT = /* glsl */ `
  #define K ${K}
  #define FIRES ${FIRES}
  attribute vec4 aR;
  uniform float uTime, uScale, uSize, uSwirl, uWhere, uGain, uFwd, uFlick, uRoof, uEmber, uOn, uAmbK;
  uniform vec3 uCam, uBox, uVel, uBase, uAmb;
  uniform vec2 uMap;
  uniform sampler2D uMask;
  uniform vec4 uLp[K];
  uniform vec4 uLc[K];
  uniform vec4 uFire[FIRES];
  varying vec3 vCol;
  varying float vA;
  varying float vRot;
  varying float vLeaf;
  void main() {
    vec3 p;
    float a = uOn;
    vec3 self = vec3(0.0);
    if (uEmber < 0.5) {
      p = position * uBox + uVel * (0.6 + aR.z * 0.8) * uTime;
      float w = uTime * (0.5 + aR.z);
      p += vec3(sin(w * 0.37 + aR.x * 6.283), sin(w * 0.23 + aR.y * 6.283) * 0.6, cos(w * 0.31 + aR.x * 4.0)) * uSwirl;
      vec3 org = uCam - uBox * 0.5;
      p = org + mod(p - org, uBox);
      vec3 q = abs(p - uCam) / (uBox * 0.5);
      a *= 1.0 - smoothstep(0.72, 1.0, max(q.x, max(q.y, q.z)));
    } else {
      // la chispa: un fuego de los cercanos, su vida y por dónde sube
      int fi = int(floor(aR.x * float(FIRES) * 0.9999));
      vec4 F = uFire[fi];
      float life = fract(uTime * (0.32 + aR.z * 0.45) + aR.y * 7.0);
      float up = life * (0.9 + aR.w * 0.9);
      p = F.xyz + vec3((position.x - 0.5) * 0.45, 0.1, (position.z - 0.5) * 0.45);
      p += vec3(sin(life * 6.0 + aR.x * 40.0) * 0.22 * life, up, cos(life * 5.0 + aR.y * 40.0) * 0.22 * life);
      a *= F.w * smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.45, 1.0, life));
      // titila al enfriarse
      self = uBase * (1.2 - life) * (0.75 + 0.25 * sin(uTime * 23.0 + aR.x * 50.0));
    }
    // afuera o adentro (la máscara de techos de la lluvia)
    vec4 mk = texture2D(uMask, p.xz / uMap);
    float open = (mk.r > 0.5 || p.y > mk.g * uRoof) ? 1.0 : 0.0;
    if (uWhere > 0.5) a *= open;
    else if (uWhere < -0.5) a *= 1.0 - open;
    vec3 V = p - uCam;
    float dc = length(V);
    V /= max(dc, 1e-3);
    vec3 lit = uAmb * open * uAmbK;
    for (int i = 0; i < K; i++) {
      vec3 d = uLp[i].xyz - p;
      float d2 = dot(d, d);
      float r2 = uLp[i].w * uLp[i].w;
      float f = max(0.0, 1.0 - d2 / max(r2, 1e-3));
      f *= f;
      // a contraluz brilla más (la luz pasa por la mota hacia la cámara)
      float mu = max(0.0, dot(d, V) * inversesqrt(max(d2, 1e-4)));
      float ph = 1.0 + uFwd * pow(mu, 6.0);
      lit += uLc[i].rgb * (f * ph / (1.0 + d2 * 0.6));
    }
    // las hojas y la ceniza dan vueltas: se prenden y se apagan al girar
    float tumble = 1.0 - uFlick * 0.65 * (0.5 + 0.5 * sin(uTime * (1.5 + aR.w * 3.0) + aR.x * 30.0));
    // (lo muy cerca del farol no se vuelve una bola de luz: se aplana el brillo)
    vec3 lc = uBase * lit * tumble;
    lc /= 1.0 + dot(lc, vec3(0.6));
    vCol = (lc + self) * uGain;
    // cerca de la cámara se desvanece (no una mancha grande)
    a *= smoothstep(0.9, 2.4, dc);
    vA = a;
    vRot = aR.w * 6.283 + uTime * (0.5 + aR.z) * uFlick;
    vLeaf = uFlick;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = uSize * (0.6 + aR.y * 0.8) * uScale / max(-mv.z, 0.05);
    // (de cerca no crecen como una bola: el tope va con la resolución)
    gl_PointSize = clamp(px, 1.0, max(2.0, uScale * uSize * 0.45));
    // las que no se ven (sin luz, fuera de la caja, adentro de un techo): fuera del dibujo
    if (a < 0.003 || dot(vCol, vec3(1.0)) < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  varying float vRot;
  varying float vLeaf;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // la hoja: una elipse que gira; lo demás, un punto redondo y suave
    float cs = cos(vRot), sn = sin(vRot);
    c = mix(c, vec2(c.x * cs - c.y * sn, (c.x * sn + c.y * cs) * 2.2), step(0.9, vLeaf));
    float r = length(c) * 2.0;
    float m = 1.0 - smoothstep(0.35, 1.0, r);
    if (m <= 0.0) discard;
    gl_FragColor = vec4(vCol * m * vA, 1.0);
  }`;

// una nube de motas de una clase (un dibujo)
function cloud(kind, n, scaleU, maskU) {
  const pos = new Float32Array(n * 3);
  const r = new Float32Array(n * 4);
  let s = 1234 + n;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * 3; i++) pos[i] = rnd();
  for (let i = 0; i < n * 4; i++) r[i] = rnd();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  const D = KINDS[kind];
  const U = {
    uTime: { value: 0 },
    uScale: scaleU,
    uSize: { value: D.size * (kind === 'ember' || viejas() ? 1 : CHICAS) },
    uSwirl: { value: D.swirl || 0 },
    uWhere: { value: D.where || 0 },
    uGain: { value: D.gain },
    uFwd: { value: D.fwd || 0 },
    uFlick: { value: D.flick || 0 },
    uRoof: maskU.uRoof,
    uMask: maskU.uMask,
    uMap: { value: new THREE.Vector2(MAP_W, MAP_H) },
    uEmber: { value: D.ember ? 1 : 0 },
    uOn: { value: 0 },
    uAmbK: { value: D.amb || 0.25 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...(D.box || [1, 1, 1])) },
    uVel: { value: new THREE.Vector3(...(D.vel || [0, 0, 0])) },
    uBase: { value: new THREE.Vector3(...D.color) },
    uAmb: { value: new THREE.Vector3() },
    uLp: { value: Array.from({ length: K }, () => new THREE.Vector4()) },
    uLc: { value: Array.from({ length: K }, () => new THREE.Vector4()) },
    uFire: { value: Array.from({ length: FIRES }, () => new THREE.Vector4()) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  // (sin espejo del agua ni G-buffer: son aditivas y no tapan nada)
  pts.userData.reflect = false;
  pts.renderOrder = 5;
  return { pts, U, kind, n };
}

export default class LitMotes {
  // spec: { dust: n, ash: n, leaf: n, ember: n } (las de Épica; Ultra lleva menos)
  constructor(game, spec, parent) {
    this.g = game;
    this.root = new THREE.Group();
    parent.add(this.root);
    // (la máscara de techos de la lluvia, world/Weather: el clima se arma después
    // que el ambiente; hasta que esté, todo cuenta como afuera. Cambiar la
    // textura no recompila nada)
    this.maskU = { uMask: { value: openMask() }, uRoof: { value: 99 } };
    const maskU = this.maskU;
    const scaleU = game.fx?.add?.uniforms?.uScale || { value: 600 };
    this.clouds = [];
    for (const [kind, n] of Object.entries(spec || {})) {
      if (!KINDS[kind] || !(n > 0)) continue;
      const c = cloud(kind, n, scaleU, maskU);
      this.root.add(c.pts);
      this.clouds.push(c);
    }
    this.on = false;
    this.fade = 0;
    this.cand = [];
    // (apagadas quedan escondidas: igual se compilan en la llegada y al cambiar
    // la calidad, con lo escondido del mapa; ui/Arrival.js warmWorld)
    (game.world.warmHidden ||= []).push(this.root);
    this.tmp = new THREE.Vector3();
  }

  // Las luces de este cuadro: las K que más alumbran cerca de la cámara.
  pickLights(cam) {
    const g = this.g;
    const C = this.cand;
    C.length = 0;
    const add = (l, pos, reach) => {
      const I = l.intensity;
      if (!(I > 0.01)) return;
      const d2 = pos.distanceToSquared(cam);
      if (d2 > (reach + 14) ** 2) return;
      C.push({ l, pos, s: I / (1 + d2 * 0.02), reach });
    };
    for (const e of g.world?.lights || []) {
      const l = e.light;
      if (!l?.visible || !l.parent) continue;
      add(l, l.position, l.distance > 0 ? l.distance : 22);
    }
    for (const l of g.world?.pool || []) if (l.visible && l.userData.src) add(l, l.position, l.distance > 0 ? l.distance : 12);
    // (la torre mueve sus propias luces de farol en farol: world/Tower.js lightPool)
    for (const l of g.world?.tower?.lightPool || []) if (l.visible) add(l, l.position, l.distance > 0 ? l.distance : 12);
    const f0 = g.fx?.flashes?.[0]?.light;
    if (f0) add(f0, f0.position, f0.distance || 12);
    C.sort((a, b) => b.s - a.s);
    return C;
  }

  update(dt, want) {
    const g = this.g;
    // (Ultra lleva menos: las primeras de cada nube)
    const part = (g.tier?.('base') ?? g.settings?.quality) === 'epic' ? 1 : ULTRA;
    if (part !== this.part) {
      this.part = part;
      for (const c of this.clouds) c.pts.geometry.setDrawRange(0, Math.ceil(c.n * part * (c.kind === 'ember' || viejas() ? 1 : MENOS)));
    }
    // (al prender o apagar, de a poco: nada aparece de golpe)
    // (al cargar el mapa, ya en su lugar)
    if (this.first === undefined) this.first = this.fade = want ? 1 : 0;
    this.fade = Math.max(0, Math.min(1, this.fade + (want ? dt : -dt) * 1.5));
    const vis = this.fade > 0.001;
    this.root.visible = vis;
    if (!vis) return;
    const wu = g.weather?.rainU;
    if (wu && this.maskU.uMask.value !== wu.uMask.value) {
      this.maskU.uMask.value = wu.uMask.value;
      this.maskU.uRoof.value = wu.uRoof.value;
    }
    const cam = g.camera.position;
    const C = this.pickLights(cam);
    // los lugares de las K luces no cambian de dueño de golpe: la que sale se
    // apaga en medio segundo y la que entra se prende igual (si no, las motas
    // de alrededor de una lámpara se apagaban de un cuadro al otro al caminar)
    const SL = (this.slots ||= Array.from({ length: K }, () => ({ it: null, k: 0 })));
    const top = C.slice(0, K);
    const step = Math.min(1, dt * 2);
    for (const sl of SL) {
      if (!sl.it) continue;
      const w = top.find((x) => x.l === sl.it.l);
      if (w) {
        sl.it = w;
        sl.k = Math.min(1, sl.k + step);
      } else {
        sl.k -= step;
        if (sl.k <= 0) sl.it = null;
      }
    }
    for (const w of top) {
      if (SL.some((sl) => sl.it?.l === w.l)) continue;
      const free = SL.find((sl) => !sl.it);
      if (free) {
        free.it = w;
        free.k = this.lit ? 0 : 1;
      }
    }
    this.lit = true;
    // (lo mismo con los fuegos de las chispas: una chispa no salta de un fuego a otro)
    const fires = C.filter((c) => this.isFire(c.l)).slice(0, FIRES);
    const FS = (this.fslots ||= Array.from({ length: FIRES }, () => ({ it: null, k: 0 })));
    for (const sl of FS) {
      if (!sl.it) continue;
      const w = fires.find((x) => x.l === sl.it.l);
      if (w) {
        sl.it = w;
        sl.k = Math.min(1, sl.k + step);
      } else {
        sl.k -= step;
        if (sl.k <= 0) sl.it = null;
      }
    }
    for (const w of fires) {
      if (FS.some((sl) => sl.it?.l === w.l)) continue;
      const free = FS.find((sl) => !sl.it);
      if (free) {
        free.it = w;
        free.k = this.flit ? 0 : 1;
      }
    }
    this.flit = true;
    const moon = g.world?.moon;
    for (const c of this.clouds) {
      const U = c.U;
      c.pts.visible = true;
      U.uOn.value = this.fade;
      U.uTime.value = g.time || 0;
      U.uCam.value.copy(cam);
      for (let i = 0; i < K; i++) {
        const it = SL[i].it;
        if (!it) {
          U.uLc.value[i].set(0, 0, 0, 0);
          continue;
        }
        // el radio de lo que alumbra, más corto que el de la luz: lo que se ve es el halo
        const I = it.l.intensity * SL[i].k;
        U.uLp.value[i].set(it.pos.x, it.pos.y, it.pos.z, Math.min(it.reach, 14) * 0.75);
        U.uLc.value[i].set(it.l.color.r * I, it.l.color.g * I, it.l.color.b * I, 0);
      }
      if (moon) U.uAmb.value.set(moon.color.r, moon.color.g, moon.color.b).multiplyScalar(moon.intensity * 0.08);
      if (U.uEmber.value > 0.5) {
        for (let i = 0; i < FIRES; i++) {
          // (un fuego por lugar: si hay menos, sobran chispas, no se amontonan)
          const f = FS[i].it;
          const near = f ? Math.max(0, 1 - f.pos.distanceTo(cam) / 26) : 0;
          if (f) U.uFire.value[i].set(f.pos.x, f.pos.y - 0.35, f.pos.z, near * Math.min(1, f.l.intensity / 1.5) * FS[i].k);
          else U.uFire.value[i].w = 0;
        }
      }
    }
  }

  // ¿Echa chispas? Un fuego del mapa al aire libre: nada encima hasta 2,2 m (la
  // campana de un fogón, un estante, el techo bajo) ni una pared pegada (el
  // hogar metido en la pared): si no, las chispas lo atravesaban. Una vez por fuego.
  isFire(l) {
    const e = (this.fireOf ||= new Map());
    if (e.has(l)) return e.get(l);
    const w = this.g.world;
    let ok = !!w?.lights?.find((x) => x.light === l && (x.def.kind === 'fire' || x.def.kind === 'fuego'));
    // (y a cielo abierto: los de adentro —el barbacuá del secadero del penal, los
    // hogares— tienen encima cosas que el rayo no ve, como estantes y tarimas)
    if (ok && w.isIndoorCell?.(Math.floor(l.position.x), Math.floor(l.position.z))) ok = false;
    if (ok && w.raycast) {
      const o = l.position.clone();
      o.y -= 0.2;
      const hit = {};
      const dirs = [[0, 1, 0, 2.2], [1, 0, 0, 0.55], [-1, 0, 0, 0.55], [0, 0, 1, 0.55], [0, 0, -1, 0.55]];
      for (const [x, y, z, d] of dirs) {
        let t = Infinity;
        try {
          t = w.raycast(o, this.tmp.set(x, y, z), d, hit);
        } catch {
          t = Infinity;
        }
        if (t !== Infinity && t < d) {
          ok = false;
          break;
        }
      }
    }
    e.set(l, ok);
    return ok;
  }

  dispose() {
    for (const c of this.clouds) {
      c.pts.geometry.dispose();
      c.pts.material.dispose();
    }
    this.root.parent?.remove(this.root);
  }
}

// (sin clima: todo afuera)
function openMask() {
  const t = new THREE.DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
