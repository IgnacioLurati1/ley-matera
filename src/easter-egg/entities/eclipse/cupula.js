import * as THREE from 'three';
import Avatars from '../../net/Avatars';
import { ZONES } from '../../config/map';
import { ISLANDS } from '../../config/maps/eclipse';
import { knightMate, uprightMate } from '../../ui/castleCine';
import CastleClips, { personaLetter } from '../../ui/castleClips';
import { personaOf, PERSONA_T } from '../../ui/cineCrew';
import { ELEMENTS, ELEM_COLOR, ELEM_RGB, MATE_OF } from '../castle/common';
import { warmObject } from '../../fx/ghostMat';

// La cúpula de los caballeros (el Desgarro Cósmico: entities/eclipse/Desgarro10.js).
// Nuestros cuatro gauchos en su forma de caballeros de la luz (los de Der
// Mateendrache: el cuerpo del gaucho hecho luz de su elemento, el mate de la
// luz en la mano; el Valiente es el fuego, el Miedoso el viento, el Canchero
// el rayo y el Viejo el hielo) bajan del cielo en columnas de luz alrededor del
// medio de la isla, levantan los mates y sus cuatro rayos arman arriba una
// cúpula de cuatro colores que tapa la isla entera.
//  · Cada embestida de un jinete le pega a la cúpula: una onda desde el golpe
//    y se va apagando (hp). Si cae, se rompe en pedazos de luz y los
//    caballeros acusan el golpe, cada uno a su manera; a los 20 s la levantan
//    de nuevo (eso lo cuenta Desgarro10).
//  · Al terminar, los caballeros se arrodillan y se hunden en luz.
// Todo se arma en la carga, escondido bajo la raíz del evento (ui/Arrival lo
// calienta); en partida solo se mueven números. Un solo dibujo para la
// cúpula (sombreador aditivo de un paso, sin isnan) y una luz de evento
// (World.adoptLight) en el medio.

// el largo del brazo de luz hacia arriba (apex) y cuánto tarda cada cosa
const DESCEND = 2.2;
const DROP_H = 12;
const SINK_T = 2.4;
const GROW = 1.6;
const SHATTER = 0.35;
const FADE = 2;
// dónde busca lugar para cada caballero (radios, m) alrededor del medio de la isla
const RADII = [6, 7.5, 5, 9, 4.2, 10.5, 3.2, 12];
const SPREAD = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2];
// qué hace cada uno cuando se rompe la cúpula (los clips del castillo: ui/castleClips)
const HURT = { valiente: ['stagger', 'fists'], miedoso: ['cower', 'cower'], canchero: ['stagger', 'cool'], viejo: ['stagger', 'pantO'] };
// cuánto brilla cada uno (el rayo y el hielo, claros, con más brillo eran una mancha blanca)
const GLOW = { fuego: 0.7, viento: 0.6, rayo: 0.42, hielo: 0.5 };
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rnd = () => Math.random() - 0.5;

// ---------------- el sombreador de la cúpula ----------------
const VERT = /* glsl */ `
uniform vec3 uS;
varying vec3 vL, vW, vN;
void main() {
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  // (la normal de la esfera escalada: la del elipsoide; se normaliza en el fragmento)
  vN = position / uS;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
// (sin isnan, sin pow sobre negativos, acos con el coseno recortado)
const FRAG = /* glsl */ `
uniform float uTime, uK, uHp, uBreak, uAlpha, uScale;
uniform vec3 uCol[4];
uniform vec4 uHit[4];
varying vec3 vL, vW, vN;
void main() {
  vec3 L = vL / max(length(vL), 1e-4);
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = cameraPosition - vW;
  v /= max(length(v), 1e-4);
  float fr = 1.0 - abs(dot(n, v));
  float rim = fr * fr;
  float y = L.y;
  // aparece desde arriba (uK de 0 a 1) y abajo se funde (debajo del piso de la isla)
  float edge = 1.0 - uK * 1.2;
  float reveal = smoothstep(edge - 0.02, edge + 0.07, y);
  float bottom = smoothstep(-0.12, 0.1, y);
  // los cuatro colores alrededor, que giran despacio y se tuercen hacia arriba
  float a = atan(L.z, L.x) + uTime * 0.12 + y * 1.4;
  vec3 c4 = vec3(0.0);
  float ws = 0.0;
  for (int i = 0; i < 4; i++) {
    float w = max(0.0, cos(a - float(i) * 1.5707963));
    w *= w;
    c4 += uCol[i] * w;
    ws += w;
  }
  c4 /= max(ws, 1e-3);
  // el panal: hexágonos sobre la esfera (56 de vuelta: sin costura)
  vec2 hp = vec2(atan(L.z, L.x) * 8.9126, y * 16.0 * uScale);
  vec2 r = vec2(1.0, 1.732);
  vec2 hh = r * 0.5;
  vec2 ga = mod(hp, r) - hh;
  vec2 gb = mod(hp - hh, r) - hh;
  vec2 gv = dot(ga, ga) < dot(gb, gb) ? ga : gb;
  float hd = max(dot(abs(gv), vec2(0.5, 0.866)), abs(gv.x));
  float line = smoothstep(0.43, 0.5, hd);
  // lo gastada: titila más y se ven menos celdas enteras
  float wear = 1.0 - uHp;
  float fl = 1.0 - wear * 0.55 * (0.5 + 0.5 * sin(uTime * 23.0 + L.x * 6.0 + L.z * 4.0));
  // las ondas de los golpes
  float rip = 0.0;
  float core = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 H = uHit[i];
    if (H.w < 0.0 || H.w > 2.5) continue;
    float ang = acos(clamp(dot(L, H.xyz), -1.0, 1.0));
    float dr = (ang - H.w * 0.9) * 10.0;
    rip += exp(-dr * dr) * exp(-H.w * 1.6);
    core += exp(-ang * 9.0) * exp(-H.w * 4.0);
  }
  // (desde adentro se ve la cara de atrás: más tenue, que no tape el cielo ni la pelea)
  float face = gl_FrontFacing ? 1.0 : 0.42;
  float body = 0.02 + 0.32 * rim + line * (0.05 + 0.24 * rim) * (0.55 + 0.45 * uHp);
  vec3 col = c4 * body * (0.4 + 0.6 * uHp) * fl * face;
  col += (c4 * 0.6 + vec3(0.6, 0.5, 0.7)) * (rip * 0.8 + core * 1.5) * (0.6 + 0.4 * face);
  col *= reveal;
  // el borde que baja mientras se arma
  col += c4 * smoothstep(0.09, 0.0, abs(y - edge)) * step(0.001, uK) * (1.0 - step(0.999, uK)) * 1.1 * face;
  // el estallido al romperse
  col += vec3(1.0, 0.92, 1.0) * uBreak * (0.25 + rim) * 0.8;
  col *= bottom * uAlpha;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

function domeMat() {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uK: { value: 0 },
      uHp: { value: 1 },
      uBreak: { value: 0 },
      uAlpha: { value: 1 },
      uScale: { value: 1 },
      uS: { value: new THREE.Vector3(1, 1, 1) },
      uCol: { value: ELEMENTS.map((el) => new THREE.Color(ELEM_COLOR[el])) },
      uHit: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, -1)) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  m.forceSinglePass = true;
  return m;
}

// La columna de luz en la que baja cada caballero: brilla en el medio y se
// apaga hacia los bordes (no un caño de color) y arriba se pierde.
const COL_VERT = /* glsl */ `
varying vec3 vN, vW;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = mat3(modelMatrix) * normal;
  vY = uv.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const COL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOp;
varying vec3 vN, vW;
varying float vY;
void main() {
  vec3 n = vN / max(length(vN), 1e-4);
  vec3 v = cameraPosition - vW;
  v /= max(length(v), 1e-4);
  float f = abs(dot(n, v));
  float vert = smoothstep(0.0, 0.06, vY) * (1.0 - smoothstep(0.3, 1.0, vY));
  gl_FragColor = vec4(uColor * (f * f * f) * vert * uOp, 1.0);
}`;
function columnMat(c) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(c) }, uOp: { value: 0 } },
    vertexShader: COL_VERT,
    fragmentShader: COL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  m.forceSinglePass = true;
  return m;
}

// ---------------- los sonidos ----------------
// El golpe en la cúpula: un gong de vidrio (parciales que no son armónicos) y el chasquido.
function domeBody(o, t) {
  for (const [f, gn, d] of [
    [92, 0.5, 1.6],
    [231, 0.28, 1.2],
    [377, 0.2, 0.9],
    [612, 0.12, 0.6],
    [1190, 0.08, 0.35],
  ])
    this.tone(o, { t, dur: d, type: 'sine', freq: f, freqEnd: f * 0.97, gain: gn, attack: 0.003 });
  this.noise(o, { t, dur: 0.25, type: 'highpass', freq: 3000, gain: 0.35, attack: 0.002 });
  this.noise(o, { t, dur: 0.6, type: 'lowpass', freq: 600, freqEnd: 90, gain: 0.5, attack: 0.004, brown: true });
}
// Se rompe: el golpe hondo y una lluvia de vidrio.
function breakBody(o, t) {
  this.tone(o, { t, dur: 2.0, type: 'sine', freq: 70, freqEnd: 30, gain: 0.7, attack: 0.005 });
  this.noise(o, { t, dur: 1.6, type: 'lowpass', freq: 900, freqEnd: 60, gain: 0.8, attack: 0.004, brown: true });
  for (let i = 0; i < 26; i++) {
    const tt = t + Math.random() * Math.random() * 1.3;
    this.noise(o, { t: tt, dur: 0.05 + Math.random() * 0.12, type: 'bandpass', freq: 2500 + Math.random() * 5000, q: 6, gain: 0.25 + Math.random() * 0.3, attack: 0.001 });
    this.tone(o, { t: tt, dur: 0.2 + Math.random() * 0.4, type: 'sine', freq: 1800 + Math.random() * 3000, gain: 0.06, attack: 0.001 });
  }
}
// Se levanta: un acorde que crece, con brillo arriba.
function raiseBody(o, t) {
  for (const [f, d] of [
    [392, 0],
    [587, 0.08],
    [784, 0.16],
    [1175, 0.24],
  ])
    this.tone(o, { t: t + d, dur: 2.2, type: 'triangle', freq: f, gain: 0.12, attack: 0.6 });
  this.noise(o, { t, dur: 2.0, type: 'bandpass', freq: 5000, freqEnd: 9000, q: 2, gain: 0.12, attack: 0.9 });
}
// Un caballero toca el piso.
function landBody(o, t) {
  this.tone(o, { t, dur: 0.6, type: 'sine', freq: 140, freqEnd: 60, gain: 0.5 });
  this.tone(o, { t, dur: 1.2, type: 'triangle', freq: 880, freqEnd: 870, gain: 0.08, attack: 0.01 });
  this.noise(o, { t, dur: 0.5, type: 'bandpass', freq: 1200, freqEnd: 300, gain: 0.3 });
}

export default class Cupula {
  constructor(ev) {
    this.ev = ev;
    const g = (this.g = ev.g);
    this.root = new THREE.Group();
    this.root.name = 'cupula';
    ev.root.add(this.root);
    // el medio (la base de la cúpula), el radio y la altura
    this.c = new THREE.Vector3();
    this.R = 20;
    this.Ry = 12;
    this.isla = null;
    // cuánto se ve (0-1), adónde va y a qué velocidad
    this.k = 0;
    this.want = 0;
    this.hpShow = 1;
    this.brk = 0;
    this.alpha = 1;
    this.hits = 0;
    this.mat = domeMat();
    // (la mitad de arriba de una esfera y un poquito más: el borde queda debajo del piso)
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 26, 0, Math.PI * 2, 0, Math.PI / 2 + 0.16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 8;
    this.dome.visible = false;
    this.root.add(this.dome);
    // la luz del medio (de evento: no cuenta mientras está apagada)
    this.light = new THREE.PointLight(0xd8b8ff, 0, 34, 2);
    this.light.visible = false;
    this.root.add(g.world.adoptLight(this.light, 1.3));
    // el brillo de arriba, donde se juntan los cuatro rayos
    this.apex = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: 0xfff0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, fog: false }));
    this.apex.visible = false;
    this.root.add(this.apex);
    this.buildKnights();
    this.bake();
  }

  // ---------------- los caballeros ----------------
  buildKnights() {
    const g = this.g;
    this.people = new Avatars(g, null);
    this.root.add(this.people.root);
    const beamGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const colGeo = new THREE.CylinderGeometry(0.55, 0.7, DROP_H + 4, 18, 1, true).translate(0, (DROP_H + 4) / 2, 0);
    this.knights = ELEMENTS.map((el, i) => {
      const c = ELEM_COLOR[el];
      const r = { id: 760 + i, name: '', noTag: true, pos: new THREE.Vector3(0, -200, 0), yaw: 0, pitch: -0.1, speed: 0, moving: false };
      this.people.add(r);
      const av = this.people.list.get(r.id);
      av.M.poncho.color.set(c);
      if (av.tag) av.tag.visible = false;
      knightMate(this.people, av, MATE_OF[el]);
      av.glowK = GLOW[el];
      this.lightLook(av, c, 0);
      const K = { i, el, c, r, av, persona: personaOf(i), delay: PERSONA_T[personaOf(i)].delay, st: 'off', t: 0, k: 0, y0: 0, home: new THREE.Vector3(), lift: 0, skin: false, beamK: 0 };
      // (sin clips todavía: el mate en alto con la pose de piezas)
      r.poseFn = (P) => {
        if (K.lift > 0 && !this.clips?.has(`raise${personaLetter(i)}`)) {
          P.shRp += (-2.85 - P.shRp) * K.lift;
          P.elR += (-0.12 - P.elR) * K.lift;
          P.headP += (0.3 - P.headP) * K.lift;
        }
      };
      const mk = (map, size) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, fog: false }));
        s.scale.set(size[0], size[1], 1);
        s.visible = false;
        this.root.add(s);
        return s;
      };
      K.aura = mk(g.textures.dot, [1.8, 2.8]);
      K.glow = mk(g.textures.dot, [0.6, 0.6]);
      K.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      K.beam.frustumCulled = false;
      K.beam.visible = false;
      this.root.add(K.beam);
      // la columna de luz en la que baja
      K.col = new THREE.Mesh(colGeo, columnMat(c));
      K.col.frustumCulled = false;
      K.col.visible = false;
      this.root.add(K.col);
      return K;
    });
    this.people.root.visible = false;
    this.clips = new CastleClips();
  }

  // El cuerpo hecho luz de su color (también el gaucho de verdad, cuando baja: a.M.gaucho).
  lightLook(av, c, opacity) {
    for (const [key, m] of Object.entries(av.M)) {
      if (!m.transparent || m.depthWrite) {
        m.transparent = true;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
      // (el mate de la luz —gun0, gun1...— queda con su brillo propio)
      if (m.emissive && !m.userData.d10 && !key.startsWith('gun')) {
        m.emissive.set(c);
        m.emissiveIntensity = av.glowK ?? 0.7;
        m.userData.d10 = true;
      }
    }
  }

  // ---------------- dónde ----------------
  // La isla del evento: el medio, el radio que tapa toda su caja y el lugar de cada caballero.
  place(isla) {
    const I = ISLANDS[isla] || ISLANDS.centro;
    this.isla = isla;
    const [x0, z0, x1, z1] = I.box;
    const cx = I.center[0];
    const cz = I.center[1];
    // (2026-10-06, el usuario: "te parás debajo del escudo y no hacés nada": la
    // cúpula ya no tapa la isla entera; es un refugio chico en el medio que se
    // achica cuando se gasta: R0 es la entera, R la de ahora: Desgarro10.update)
    this.R0 = Math.min(13, Math.max(9, Math.hypot(Math.max(cx - x0, x1 - cx), Math.max(cz - z0, z1 - cz)) * 0.45));
    this.R = this.R0;
    this.Ry = Math.max(9, this.R * 0.7, Math.min(14, (I.top - I.y) + 6));
    this.c.set(cx, I.y - 0.6, cz);
    this.dome.position.copy(this.c);
    this.dome.scale.set(this.R, this.Ry, this.R);
    this.dome.updateMatrixWorld(true);
    this.mat.uniforms.uScale.value = this.Ry / this.R;
    this.mat.uniforms.uS.value.set(this.R, this.Ry, this.R);
    this.light.position.set(cx, I.y + 4, cz);
    this.apex.position.set(cx, this.c.y + this.Ry, cz);
    const w = this.g.world;
    // (bajan del cielo: al aire libre. Si la isla tiene partes techadas —el
    // pabellón del penal, el Gran Salón, el galpón—, la ronda de los cuatro va
    // en el medio de lo abierto; __mduNoKnightOpen: alrededor del medio, como antes)
    const open = (k) => !!ZONES[k]?.outdoor && !ZONES[k]?.roof;
    let kx = cx;
    let kz = cz;
    const zs = I.zones || [];
    if (globalThis.__mduNoKnightOpen !== true && zs.some((k) => !open(k)) && zs.some(open)) {
      let sx = 0;
      let sz = 0;
      let sa = 0;
      for (const k of zs.filter(open)) {
        for (const [x0, z0, x1, z1] of ZONES[k].rects) {
          const a = (x1 - x0 + 1) * (z1 - z0 + 1);
          sx += ((x0 + x1 + 1) / 2) * a;
          sz += ((z0 + z1 + 1) / 2) * a;
          sa += a;
        }
      }
      if (sa > 0) {
        kx = sx / sa;
        kz = sz / sa;
      }
    }
    this.kc = new THREE.Vector3(kx, I.y, kz);
    const taken = [];
    const find = (a, needOpen) => {
      for (const r of RADII) {
        for (const da of SPREAD) {
          const x = kx + Math.cos(a + da) * r;
          const z = kz + Math.sin(a + da) * r;
          const k = w.zoneAt(x, z, I.y + 1);
          if (!k || ZONES[k]?.isla !== isla || (needOpen && !open(k))) continue;
          // (no encima de otro)
          if (taken.some((s) => Math.hypot(s[0] - x, s[2] - z) < 2.5)) continue;
          const y = w.floorAt(x, z, I.y + 2);
          if (!Number.isFinite(y) || Math.abs(y - I.y) > 2.5) continue;
          if (!w.circleFree(x, z, 0.6, y + 0.2, y + 1.8)) continue;
          return [x, y, z];
        }
      }
      return null;
    };
    this.knights.forEach((K, i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const spot = find(a, true) || find(a, false) || [kx + Math.cos(a) * 2, I.y, kz + Math.sin(a) * 2];
      taken.push(spot);
      K.home.set(spot[0], spot[1], spot[2]);
      K.y0 = spot[1];
      // mirando al medio de la ronda (a los que cuidan)
      K.r.yaw = Math.atan2(spot[0] - kx, spot[2] - kz);
      K.r.pos.set(spot[0], spot[1] - 200, spot[2]);
      K.col.position.set(spot[0], spot[1] - 0.5, spot[2]);
    });
  }

  // Dónde se deja el premio: el medio de la ronda de los caballeros si es piso
  // libre; si no, entre el primero y ese medio; si no, donde estaba él.
  dropSpot(out) {
    const w = this.g.world;
    const I = ISLANDS[this.isla] || ISLANDS.centro;
    const K = this.knights[0];
    const kc = this.kc || this.c;
    for (const u of [1, 0.5]) {
      const x = K.home.x + (kc.x - K.home.x) * u;
      const z = K.home.z + (kc.z - K.home.z) * u;
      const k = w.zoneAt(x, z, I.y + 1);
      const y = w.floorAt(x, z, I.y + 2);
      if (k && ZONES[k]?.isla === this.isla && Number.isFinite(y) && Math.abs(y - I.y) < 2.5 && w.circleFree(x, z, 0.5, y + 0.2, y + 1.6)) return out.set(x, y, z);
    }
    return out.copy(K.home);
  }

  // f < 1: adentro del elipsoide de la cúpula
  f(p) {
    const dx = (p.x - this.c.x) / this.R;
    const dz = (p.z - this.c.z) / this.R;
    const dy = Math.max(0, p.y - this.c.y) / this.Ry;
    return dx * dx + dz * dz + dy * dy;
  }

  // la normal hacia afuera en p
  normal(p, out) {
    return out.set((p.x - this.c.x) / (this.R * this.R), Math.max(0, p.y - this.c.y) / (this.Ry * this.Ry), (p.z - this.c.z) / (this.R * this.R)).normalize();
  }

  // ---------------- lo que pasa (en todas las compus) ----------------
  // Bajan del cielo; at: cuánto hace que empezó el evento (el que entra tarde los ve ya parados).
  arrive(at = 0) {
    this.people.root.visible = true;
    this.brk = 0;
    this.alpha = 1;
    this.hits = 0;
    for (const u of this.mat.uniforms.uHit.value) u.w = -1;
    for (const K of this.knights) {
      K.st = at > DESCEND + 1 ? 'idle' : 'down';
      K.t = at > DESCEND + 1 ? 0 : -K.delay - at;
      K.k = at > DESCEND + 1 ? 1 : 0;
      K.lift = 0;
      K.beamK = 0;
      K.av.group.visible = true;
      K.aura.visible = K.glow.visible = true;
    }
  }

  // Levantan los mates (la cúpula sale de los rayos).
  raise() {
    for (const K of this.knights) {
      if (K.st === 'hurt') {
        K.st = 'idle';
        K.t = 0;
      }
      if (K.st === 'idle' || K.st === 'down') K.raise = true;
    }
    this.snd('d10Raise', tmpV.copy(this.c).setY(this.c.y + 3), 1.1, 30);
  }

  // Un jinete le pegó en p (la onda sale de ahí).
  hit(p) {
    const H = this.mat.uniforms.uHit.value[this.hits++ % 4];
    tmpV.set((p.x - this.c.x) / this.R, Math.max(0, p.y - this.c.y) / this.Ry, (p.z - this.c.z) / this.R).normalize();
    H.set(tmpV.x, tmpV.y, tmpV.z, 0);
    const g = this.g;
    g.fx.flash(p, 0xe0c0ff, 10, 0.3, 24);
    for (let i = 0; i < 26; i++) g.fx.add.spawn(p.x, p.y, p.z, rnd() * 7, rnd() * 7, rnd() * 7, { color: i % 2 ? [1, 0.85, 1] : ELEM_RGB[ELEMENTS[i % 4]], size: 0.14, size1: 0, life: 0.5 + Math.random() * 0.4, drag: 2 });
    this.snd('d10Dome', p, 1.5, 22);
    for (const K of this.knights) K.beamK = Math.max(K.beamK, 1.6);
  }

  // Se rompe: pedazos de luz por toda la cúpula; los caballeros lo sienten.
  shatter() {
    const g = this.g;
    this.brk = 1;
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.9;
      const r = Math.sqrt(1 - y * y);
      tmpV.set(this.c.x + Math.cos(a) * r * this.R, this.c.y + y * this.Ry, this.c.z + Math.sin(a) * r * this.R);
      const col = ELEM_RGB[ELEMENTS[i % 4]];
      for (let k = 0; k < 4; k++) g.fx.add.spawn(tmpV.x + rnd(), tmpV.y + rnd(), tmpV.z + rnd(), rnd() * 2, -1 - Math.random() * 3, rnd() * 2, { color: col, size: 0.22, size1: 0, life: 1.2 + Math.random() * 0.8, gravity: 4, drag: 0.4 });
    }
    g.fx.flash(tmpV.copy(this.c).setY(this.c.y + 4), 0xffffff, 14, 0.5, 40);
    g.fx.addShake?.(0.45);
    this.snd('d10Break', tmpV.copy(this.c).setY(this.c.y + 3), 1.6, 40);
    for (const K of this.knights) {
      if (K.st === 'off' || K.st === 'sink') continue;
      K.st = 'hurt';
      K.t = -K.delay;
      K.raise = false;
    }
  }

  // Se terminó: se arrodillan y se hunden en luz; la cúpula se apaga.
  leave() {
    for (const K of this.knights) {
      if (K.st === 'off') continue;
      K.st = 'sink';
      K.t = -K.delay;
      K.raise = false;
    }
  }

  // Ya (las escenas del easter egg): nada a la vista.
  hide() {
    this.k = 0;
    this.want = 0;
    this.dome.visible = false;
    this.apex.visible = false;
    this.light.intensity = 0;
    this.light.visible = false;
    for (const K of this.knights) {
      K.st = 'off';
      K.k = 0;
      K.lift = 0;
      K.r.pos.y = K.y0 - 200;
      K.av.group.visible = false;
      K.aura.visible = K.glow.visible = K.beam.visible = K.col.visible = false;
      this.clips?.release(K.r, 0.01, [K.av]);
    }
    this.people.root.visible = false;
  }

  // ---------------- los sonidos ----------------
  bake() {
    const A = this.g.audio;
    if (this.baked || !A?.ctx || !A.bakeSound) return;
    this.baked = true;
    if (A.baked?.d10Dome) return;
    A.bakeSound('d10Dome', 1.7, domeBody, 2);
    A.bakeSound('d10Break', 2.2, breakBody, 1);
    A.bakeSound('d10Raise', 2.6, raiseBody, 1);
    A.bakeSound('d10Land', 1.3, landBody, 2);
  }

  snd(key, pos, gain = 1, ref = 12) {
    const A = this.g.audio;
    const b = A?.bakedBuf?.(key);
    if (b) A.playBuffer(b, { pos: pos.clone(), gain, reverb: 0.6, ref });
  }

  // ---------------- cada cuadro ----------------
  update(dt, t) {
    const g = this.g;
    // el gaucho de verdad bajó: también hecho luz, y se compila ya (escondido)
    if (!this.skinned && this.knights.every((K) => K.av.gs)) {
      this.skinned = true;
      for (const K of this.knights) this.lightLook(K.av, K.c, K.k * 0.72);
      warmObject(g, this.people.root);
    }
    // la cúpula: crece desde arriba, se rompe de golpe, se apaga al final
    const sp = this.want > this.k ? dt / GROW : this.brk > 0 ? dt / SHATTER : dt / FADE;
    this.k = this.want > this.k ? Math.min(this.want, this.k + sp) : Math.max(this.want, this.k - sp);
    this.brk = Math.max(0, this.brk - dt * 1.6);
    const U = this.mat.uniforms;
    this.hpShow += (this.ev.st.hp - this.hpShow) * Math.min(1, dt * 4);
    U.uTime.value = t;
    // (sale desde arriba; al romperse o al terminar se apaga entera, sin el borde que baja)
    U.uK.value = this.want > 0 && this.brk <= 0 ? smooth(this.k) : 1;
    U.uAlpha.value = this.want > 0 && this.brk <= 0 ? 1 : this.k;
    U.uHp.value = clamp01(this.hpShow);
    U.uBreak.value = this.brk;
    for (const H of U.uHit.value) if (H.w >= 0) H.w = H.w > 3 ? -1 : H.w + dt;
    const on = this.k > 0.001 || this.brk > 0;
    this.dome.visible = on;
    this.apex.visible = on;
    this.apex.material.opacity = this.k * (0.55 + 0.25 * Math.sin(t * 3.1));
    this.apex.scale.setScalar(3 + Math.sin(t * 2.2) * 0.4 + this.brk * 4);
    this.light.visible = on;
    this.light.intensity = this.k * (2.2 + 0.4 * Math.sin(t * 2.7)) * (0.5 + 0.5 * this.hpShow);
    this.updateKnights(dt, t);
  }

  updateKnights(dt, t) {
    const g = this.g;
    if (!this.people.root.visible) return;
    let any = false;
    const apex = this.apex.position;
    for (const K of this.knights) {
      if (K.st === 'off') continue;
      any = true;
      K.t += dt;
      let drop = 0;
      if (K.st === 'down') {
        const u = clamp01(K.t / DESCEND);
        drop = DROP_H * (1 - smooth(u)) * (1 - u * 0.2);
        K.k = clamp01(K.t / 0.6);
        K.col.visible = K.t > -0.2;
        K.col.material.uniforms.uOp.value = clamp01((K.t + 0.2) / 0.4) * (1 - smooth(clamp01((K.t - DESCEND) / 0.8))) * 0.55;
        if (K.t >= DESCEND) {
          K.st = 'idle';
          K.t = 0;
          // toca el piso: el destello, un anillo de chispas y el golpe
          tmpV.copy(K.home);
          g.fx.flash(tmpV, K.c, 7, 0.4, 10);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            g.fx.add.spawn(tmpV.x + Math.cos(a) * 0.4, tmpV.y + 0.1, tmpV.z + Math.sin(a) * 0.4, Math.cos(a) * 3, 0.6, Math.sin(a) * 3, { color: ELEM_RGB[K.el], size: 0.12, size1: 0, life: 0.6, drag: 2.5 });
          }
          this.snd('d10Land', tmpV, 0.9, 10);
        }
      } else if (K.st === 'sink') {
        const u = clamp01((K.t - 1.0) / SINK_T);
        drop = -1.9 * smooth(u);
        K.k = 1 - smooth(u);
        if (u > 0 && Math.random() < dt * 30) g.fx.sparkle(tmpV.set(K.home.x + rnd() * 0.8, K.home.y + Math.random() * 1.8, K.home.z + rnd() * 0.8), ELEM_RGB[K.el], 2, 0.4);
        if (u >= 1) {
          K.st = 'off';
          K.av.group.visible = false;
          K.aura.visible = K.glow.visible = K.beam.visible = K.col.visible = false;
          this.clips.release(K.r, 0.01, [K.av]);
          continue;
        }
      } else {
        K.k = Math.min(1, K.k + dt * 2);
        if (K.col.visible) {
          const U = K.col.material.uniforms.uOp;
          U.value = Math.max(0, U.value - dt * 1.2);
          K.col.visible = U.value > 0.005;
        }
      }
      K.r.pos.set(K.home.x, K.home.y + drop, K.home.z);
      K.lift += ((K.raise && K.st === 'idle' ? 1 : 0) - K.lift) * Math.min(1, dt * 3);
      const op = K.k * (0.66 + Math.sin(t * 3 + K.i) * 0.06);
      this.lightLook(K.av, K.c, op);
      K.aura.material.opacity = K.k * 0.22 * (1 + Math.sin(t * 2.3 + K.i) * 0.2);
      K.aura.position.set(K.r.pos.x, K.r.pos.y + 1, K.r.pos.z);
      if (K.k > 0 && K.st !== 'sink' && Math.random() < dt * 8) g.fx.sparkle(tmpV.set(K.r.pos.x + rnd() * 0.5, K.r.pos.y + 0.3 + Math.random() * 1.4, K.r.pos.z + rnd() * 0.5), ELEM_RGB[K.el], 1, 0.3);
    }
    if (!any) {
      this.people.root.visible = false;
      return;
    }
    this.people.update(dt);
    // los cuerpos con los clips del castillo (ui/castleClips.js), cada uno con su carácter
    const C = this.clips;
    for (const K of this.knights) {
      if (K.st === 'off') continue;
      const L = personaLetter(K.i);
      let mate = true;
      if (K.st === 'idle' && K.raise) C.act(K.r, [K.av], `raise${L}`, { fade: 0.6 });
      else if (K.st === 'hurt') {
        const [a, b] = HURT[K.persona];
        if (K.t >= 0) C.act(K.r, [K.av], K.t < 1.4 ? a : b, { fade: 0.35, loop: K.t >= 1.4 });
        mate = false;
      } else if (K.st === 'sink') {
        if (K.t >= 0) C.act(K.r, [K.av], 'kneelOath', { fade: 0.6 });
        mate = K.t < 0;
      } else C.release(K.r, 0.6, [K.av]);
      // (el mate: en alto con el brazo, en la palma parado o, con las manos ocupadas, escondido)
      if (K.av.gun) K.av.gun.visible = mate;
    }
    C.update(dt);
    for (const K of this.knights) {
      if (K.st === 'off') continue;
      uprightMate(K.av, smooth(K.lift), K.r.yaw);
      K.av.hand.updateMatrixWorld(true);
      K.glow.position.setFromMatrixPosition(K.av.hand.matrixWorld);
      K.glow.material.opacity = K.k * (0.3 + K.lift * 0.7) * (0.85 + Math.sin(t * 7 + K.i) * 0.15) * (K.av.gun?.visible === false ? 0.3 : 1);
      K.glow.scale.setScalar(0.45 + K.lift * 0.8);
      // el rayo de su mate a lo alto de la cúpula (más fuerte cuando le pegan)
      K.beamK = Math.max(0, K.beamK - dt * 1.5);
      const on = K.lift > 0.6 && (this.want > 0 || this.k > 0.02);
      K.beam.visible = on;
      if (on) {
        const a = K.glow.position;
        K.beam.position.copy(a);
        K.beam.lookAt(apex);
        const len = a.distanceTo(apex);
        const thick = 1 + Math.sin(t * 20 + K.i) * 0.2 + K.beamK * 0.8;
        K.beam.scale.set(thick, thick, len);
        // (pegado a la cámara un rayo es un sable que tapa todo: ahí se apaga)
        const cam = g.camera.position;
        tmpW.subVectors(apex, a);
        const u = clamp01(tmpV.subVectors(cam, a).dot(tmpW) / Math.max(tmpW.lengthSq(), 1e-4));
        const near = cam.distanceTo(tmpV.copy(a).addScaledVector(tmpW, u));
        K.beam.material.opacity = Math.min(1, K.lift) * (0.4 + K.beamK * 0.3) * Math.max(0.25, Math.min(1, this.k * 3)) * smooth(clamp01((near - 1.2) / 5));
        if (Math.random() < dt * 14) g.fx.sparkle(tmpW.lerpVectors(a, apex, Math.random()), ELEM_RGB[K.el], 1, 0.3);
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.people.dispose();
    this.mat.dispose();
    this.dome.geometry.dispose();
    this.apex.material.dispose();
    for (const K of this.knights) {
      K.aura.material.dispose();
      K.glow.material.dispose();
      K.beam.material.dispose();
      K.col.material.dispose();
    }
    this.knights[0]?.beam.geometry.dispose();
    this.knights[0]?.col.geometry.dispose();
  }
}
