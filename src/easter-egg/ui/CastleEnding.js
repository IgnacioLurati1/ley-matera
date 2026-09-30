import * as THREE from 'three';
import CastleCine, { smooth, lerp, uprightMate } from './castleCine';
import Avatars from '../net/Avatars';
import { useMap } from '../config/map';
import { crewIds } from './cineCrew';
import { warmScene } from './cineWarm';
import { buildChiqui, chiquiGiggle, chiquiGlitch } from '../world/Chiqui';
import { ELEMENTS, ELEM_COLOR, ELEM_RGB, MATE_OF } from '../entities/castle/common';
import { buildSupremoDisplay, animateSupremoDisplay } from '../weapons/Supremo';

// El final de todo (Der Mateendrache, el último mapa). Arranca en la isla del
// Éter, con el Chiquitijuein recién deshecho. Todo lo que pasa es actuado:
// poses que se mezclan de a poco, cámaras que se mueven, luces que cambian.
//  1. Lo que quedó: el sombrero del Chiquitijuein y su bastón, tirados en la
//     nieve, humeando. La cámara sube y aparecen los cuatro (siempre cuatro:
//     ui/cineCrew.js), jadeando, con los mates de la luz bajos.
//  2. El cielo se calma: la tormenta se deshace en un amanecer dorado y el
//     Mateendrache baja en una vuelta larga y se posa atrás, levantando nieve.
//  3. Debajo del ala del sombrero se abren dos ojitos colorados. Una risita.
//     El sombrero se hace ceniza y los ojitos se escapan entre las piedras.
//  4. Del ojo del cielo baja una columna de luz y, adentro, se arma de abajo
//     para arriba el ánima de Martín Fierro.
//  5. Fierro cuenta lo que viene, con gestos y tomas para cada cosa:
//     · al Chiquitijuein no se lo mata: se esconde en la memoria (los ojitos,
//       escondidos, se cierran);
//     · el universo tiene que empezar de nuevo: cada mundo que nombra se
//       deshace en luz y sube al ojo del cielo; las columnas del castillo
//       se levantan; todo;
//     · van a vivir como leyendas: detrás de cada gaucho se levanta un
//       caballero gigante de su elemento;
//     · él va a ser un recuerdo: los ojos, enormes en el cielo, se rompen en
//       brasas coloradas que llueven por todos los mundos;
//     · ya fueron caballeros: cada gigante se mete en su gaucho (fuego,
//       viento, rayo, hielo) y el gaucho queda con el poncho de su elemento;
//     · el dragón baja la cabeza ante ellos.
//  6. "Nosotros, los cuatro caballeros, nos alzaremos una vez más": levantan
//     los mates, cuatro rayos se juntan en una estrella y el dragón le tira
//     fuego al cielo.
//  7. Los mates de la luz se les van de las manos, giran en el aire y se
//     funden en uno (el mate de los cuatro, como el supremo).
//  8. Fierro lo agarra y lo levanta: con él todo se deshace en luz (el
//     dragón, los gauchos y, el último, Fierro, que los despide). Blanco.
//  9. Unos cinco segundos de negro total, sin nada (el usuario sacó la vuelta
//     al molino el 2026-09-29: pasa directo a los caballeros).
// 10. Negro: lo que les dicen los cuatro caballeros, uno por uno, cada uno en
//     su forma de caballero de la luz y con el aire de su elemento (brasas,
//     remolino, relámpagos, nieve); al final, los cuatro juntos. Fin.
// Es la cinemática de la victoria del castillo (Game.win): pasa con el juego
// terminado y la mueve sola. En línea la ve cada uno en su compu.
// Luces: solo las que ya había (las dos del Éter y los destellos de fx), así
// no se recompila nada en el medio; lo nuevo se compila al arrancar (warmScene).

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const KNIGHT_GLOW = ELEMENTS.map((el) => ELEM_COLOR[el]);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const rnd = () => Math.random() - 0.5;
// (Avatars: yaw 0 mira hacia -z) el yaw de un punto mirando a otro
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

// Dónde está cada cosa, respecto del medio de la isla (x, z).
const HAT = [0.3, 0.5];
const FIERRO = [0, -3];
const CREW_AT = [[-3, 2.5], [-1, 3.2], [1, 3.2], [3, 2.5]];
const DRAGON_AT = [10.5, -5];
// donde se juntan los cuatro rayos y se funden los mates (delante de Fierro)
const STAR = [0, 5.2, 0.4];
// los mates de la luz: cuánto tardan en subir, cuánto giran antes de fundirse
const FLY_UP = 1.5;
const ORBIT = 2.9;
// el mate de los cuatro: su alto en el aire y cuánto se achica en la mano de Fierro
const SUP_SIZE = 0.62;
const SUP_HELD = 0.55;
const GIANT = 2.5;
const WHITE = 0xfff4e0;

// ---------------- el ánima (Fierro, los gigantes, lo que se deshace) ----------------
// Luz de ánima: brilla más en el borde (fresnel), con franjas que suben. uCut
// corta a una altura del mundo: uDir 1 se ve lo de abajo (se arma de abajo
// para arriba); -1, lo de arriba (se deshace de abajo para arriba). En el
// borde del corte, una línea que quema. Aditivo: no tapa ni va al G-buffer.
const ANI_VERT = /* glsl */ `
uniform float uTime, uWave;
varying vec3 vN, vV;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.x += sin(wp.y * 3.1 + uTime * 1.7) * uWave;
  wp.z += cos(wp.y * 2.7 + uTime * 1.3) * uWave;
  vY = wp.y;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;
// (divisiones con piso: en la placa del usuario isnan no anda)
// uAlpha: menos de 0, luz que se suma (aditivo); si no, cuerpo con su
// transparencia (y 1 con el material opaco: Fierro, lo que se deshace). En
// esos, una luz de mentira desde arriba para que el cuerpo tenga volumen (el
// cielo del amanecer es claro: la luz sumada se perdía).
const ANI_FRAG = /* glsl */ `
uniform float uTime, uK, uCut, uDir, uEdge, uBase, uRim, uAlpha;
uniform vec3 uColor, uRimColor;
varying vec3 vN, vV;
varying float vY;
void main() {
  float s = (vY - uCut) * uDir;
  if (s > 0.0) discard;
  vec3 v = vV / max(length(vV), 1e-4);
  vec3 n = vN / max(length(vN), 1e-4);
  float fr = 1.0 - abs(dot(n, v));
  fr *= fr;
  float band = 0.5 + 0.5 * sin(vY * 9.0 - uTime * 2.2);
  float flick = 0.9 + 0.1 * sin(uTime * 11.0 + vY * 3.0);
  float edge = 1.0 - smoothstep(0.0, max(uEdge, 1e-3), -s);
  float shade = uAlpha < 0.0 ? 1.0 : 0.55 + 0.45 * clamp(n.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 col = uColor * uBase * shade * (0.72 + 0.28 * band) + uRimColor * fr * uRim + mix(uRimColor, vec3(1.0), 0.5) * edge * edge * 1.8;
  col = max(col, vec3(0.0)) * flick;
  if (uAlpha < 0.0) gl_FragColor = vec4(col * uK, 1.0);
  else gl_FragColor = vec4(col, clamp(uK * (uAlpha + fr * 0.5 + edge), 0.0, 1.0));
}`;

// mode: 'add' (luz sumada), 'alpha' (cuerpo transparente) o 'solid' (opaco).
function aniMat(T, { color = 0xffc070, rim = 0xffe8c0, base = 0.3, rimK = 1.5, edge = 0.25, wave = 0.008, cut = null, k = null, dir = 1, mode = 'add', alpha = 0.5 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: T,
      uWave: { value: wave },
      uK: k || { value: 1 },
      uCut: cut || { value: 1e5 },
      uDir: { value: dir },
      uEdge: { value: edge },
      uBase: { value: base },
      uRim: { value: rimK },
      uAlpha: { value: mode === 'add' ? -1 : mode === 'solid' ? 1 : alpha },
      uColor: { value: new THREE.Color(color) },
      uRimColor: { value: new THREE.Color(rim) },
    },
    vertexShader: ANI_VERT,
    fragmentShader: ANI_FRAG,
    transparent: mode !== 'solid',
    depthWrite: mode === 'solid',
    blending: mode === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ---------------- el amanecer ----------------
// Un cielo encima del de la tormenta (world/GranGuerra, que queda abajo):
// dorado arriba, rosado al medio y ámbar en el horizonte, con nubecitas
// finas que giran alrededor del ojo. uWhite lo lleva a blanco (el final).
const DAWN_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DAWN_FRAG = /* glsl */ `
uniform float uDawn, uWhite, uTime, uEye;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 d = vDir / max(length(vDir), 1e-4);
  float r = acos(clamp(d.y, -1.0, 1.0)) / 3.14159;
  // (arriba todavía es de noche: índigo; al medio, rosado; el horizonte, oro)
  vec3 zen = vec3(0.07, 0.07, 0.2);
  vec3 mid = vec3(0.3, 0.14, 0.3);
  vec3 hor = vec3(0.66, 0.3, 0.11);
  vec3 low = vec3(0.3, 0.12, 0.14);
  vec3 col = mix(zen, mid, smoothstep(0.12, 0.34, r));
  col = mix(col, hor, smoothstep(0.34, 0.5, r));
  col = mix(col, low, smoothstep(0.52, 0.8, r));
  // (el ángulo da vueltas enteras: sin costura)
  float ang = atan(d.z, d.x + 1e-5);
  float sw = ang * 2.0 + r * 8.0 - uTime * 0.04;
  float n = noise(vec2(cos(sw), sin(sw)) * 3.0 + vec2(r * 7.0, uTime * 0.02));
  float m = noise(vec2(cos(sw * 0.5 + 1.3), sin(sw * 0.5 + 1.3)) * 6.0 + vec2(r * 13.0, 0.0));
  // (las nubecitas: prendidas de oro abajo, oscuras arriba)
  float cl = smoothstep(0.5, 0.85, n * 0.7 + m * 0.4);
  col = mix(col, mix(vec3(0.12, 0.07, 0.16), vec3(0.85, 0.5, 0.24), smoothstep(0.25, 0.48, r)), cl * 0.55);
  // el ojo: un sol blanco dorado (uEye lo hace latir), con su resplandor
  float eye = smoothstep(0.08, 0.0, r);
  col += vec3(1.0, 0.86, 0.58) * eye * (1.4 + uEye * 2.5);
  col += vec3(1.0, 0.62, 0.3) * smoothstep(0.26, 0.0, r) * 0.35 * (1.0 + uEye);
  col = mix(col, vec3(1.25, 1.2, 1.12), uWhite);
  float a = clamp(uDawn * (0.72 + 0.2 * smoothstep(0.0, 0.4, r)) + uWhite, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;

// La columna de luz que baja del ojo (como la del juramento, castle/Juramento):
// uDrop es cuánto bajó (0 arriba, 1 tocando el piso), con la punta que quema.
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
}`;
const PILLAR_FS = /* glsl */ `
uniform float uK, uT, uDrop;
uniform vec3 uCol;
varying vec2 vUv;
varying float vRim;
void main() {
  float h = vUv.y;
  float front = 1.0 - uDrop;
  if (h < front) discard;
  float tip = 1.0 - smoothstep(0.0, 0.1, h - front);
  float fade = pow(1.0 - h, 1.3) * smoothstep(0.0, 0.015, h);
  float streak = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 7.0 + h * 60.0 - uT * 5.0) * sin(vUv.x * 6.2831 * 3.0 - h * 33.0 + uT * 3.1);
  float a = uK * (fade * (0.35 + 0.65 * streak) + tip * 0.45) * (0.25 + 0.75 * vRim);
  gl_FragColor = vec4(uCol * a, 1.0);
}`;

export default class CastleEnding extends CastleCine {
  constructor(root, game) {
    super(game, { drive: true, kind: 'castillo' });
    void root;
    this.anims = [];
    this.dtNow = 0;
    this.T = { value: 0 };
  }

  // ================= armado =================
  build() {
    const g = this.g;
    const arena = g.arena;
    this.arena = arena;
    const A = arena?.A || { x: -170, y: 140, z: 50, r: 22 };
    this.A = A;
    this.C = new THREE.Vector3(A.x, A.y, A.z);
    this.clearArena();
    // arranca en negro (a la vista desde el primer cuadro) y se abre sobre el sombrero
    this.el.classList.add('is-on', 'mdu-fcine--fin');
    this.fadeEl =this.el.querySelector('.mdu-fcine__fade');
    this.fadeEl.style.transition = 'none';
    this.fade(true);
    this.buildSky();
    this.buildHat();
    this.buildEyes();
    this.buildCrew();
    this.buildFierro();
    this.buildColumn();
    this.buildGiants();
    this.buildBeams();
    this.buildSup();
    this.buildWorlds();
    this.buildDragon();
    this.buildLights();
    // la música de la escena va por su propio canal
    const au = g.audio;
    this.bus = au.ctx ? au.out({ gain: 1, reverb: 0.6, bus: au.music }) : null;
    // (el texto: el nombre de quien habla arriba y la frase que va apareciendo)
    this.textEl.innerHTML = '<b class="mdu-fcine__who"></b><span></span>';
    this.whoEl = this.textEl.querySelector('.mdu-fcine__who');
    this.span = this.textEl.querySelector('span');
    // todo lo que va a aparecer se compila ya, en segundo plano
    g.post?.sweep?.();
    warmScene(g);
    return this.script0();
  }

  P(x, y, z) {
    return new THREE.Vector3(this.C.x + x, this.C.y + y, this.C.z + z);
  }

  // Lo de la pelea se va (el piso queda limpio para la escena).
  clearArena() {
    const g = this.g;
    const arena = this.arena;
    if (arena) {
      if (arena.knights) arena.knights.root.visible = false;
      if (arena.gnome) arena.gnome.root.visible = false;
      // (el coloso ya se deshizo al aparecer el de verdad; si no, se va igual)
      if (arena.col) {
        arena.col.dissolve = 1;
        arena.col.root.visible = false;
        if (arena.col.smoke) arena.col.smoke.visible = false;
      }
      for (const M of arena.marks || []) M.mesh?.removeFromParent();
      arena.marks = [];
      // (las grietas del caos: su borde quemado se veía a través de los cuerpos)
      if (arena.cracks) arena.cracks.visible = false;
      arena.chaosK = 0;
      // el cuerno del dragón, los aros de los altares, el remolino y las trampas
      if (arena.horn?.grp) arena.horn.grp.visible = false;
      for (const R of arena.altRings || []) if (R.grp) R.grp.visible = false;
      if (arena.shield) arena.shield.visible = false;
      for (const M of arena.mines || []) M.grp?.removeFromParent();
      arena.mines = [];
    }
    // las quemaduras del dragón y la sangre de la pelea (calcos transparentes)
    // se dibujaban encima de los que son medio transparentes
    for (const D of g.fx.decals || []) {
      D.used = 0;
      D.next = 0;
      D.mesh.count = 0;
    }
    for (const z of g.zombies.pool) if (z.active) g.zombies.free(z);
    if (g.net?.avatars) g.net.avatars.root.visible = false;
  }

  sprite(color, size, opacity = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, fog: false, toneMapped: false }));
    s.scale.setScalar(size);
    this.root.add(s);
    return s;
  }

  addMat(color, opacity = 0) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  }

  // El amanecer (encima del cielo de la tormenta) y el resplandor sobre el mar de nubes.
  buildSky() {
    const g = this.g;
    this.dawnMat = new THREE.ShaderMaterial({
      uniforms: { uDawn: { value: 0 }, uWhite: { value: 0 }, uEye: { value: 0 }, uTime: this.T },
      vertexShader: DAWN_VERT,
      fragmentShader: DAWN_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    });
    this.dawnDome = new THREE.Mesh(new THREE.SphereGeometry(330, 48, 24), this.dawnMat);
    this.dawnDome.renderOrder = -9;
    this.dawnDome.frustumCulled = false;
    this.root.add(this.dawnDome);
    this.haze = new THREE.Mesh(new THREE.CircleGeometry(300, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: g.textures.dot, color: 0xffa060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.haze.frustumCulled = false;
    this.root.add(this.haze);
    this.dawn = 0;
    this.whiteK = 0;
    this.eyePulse = 0;
    // (la tormenta todavía está al arrancar: se apaga en la primera toma)
    this.storm = 0.55;
  }

  // Lo que quedó del Chiquitijuein: el sombrero aludo y el bastón (su bombilla vieja).
  buildHat() {
    const g = this.g;
    const gn = buildChiqui(g.textures);
    const H = this.P(HAT[0], 0, HAT[1]);
    this.H = H;
    this.hat = new THREE.Group();
    const hat = gn.head.children.find((o) => o.isGroup && Math.abs(o.position.y - 0.075) < 0.01);
    if (hat) {
      hat.removeFromParent();
      hat.position.set(0, 0, 0);
      hat.rotation.set(0.24, 0.5, 0.2);
      this.hat.add(hat);
    }
    // (el ala cae 0.075 en las puntas: apoyado)
    this.hat.position.set(H.x, H.y + 0.08, H.z);
    this.hat.scale.setScalar(1.3);
    this.root.add(this.hat);
    const staff = gn.staff;
    staff.removeFromParent();
    staff.position.set(H.x + 0.75, H.y + 0.03, H.z - 0.25);
    staff.rotation.set(0, 0.9, Math.PI / 2 - 0.02);
    staff.scale.setScalar(1.4);
    this.root.add(staff);
    this.staff = staff;
    this.hatK = 1;
    this.smoke = 1;
  }

  // Los ojitos colorados: debajo del ala, escondidos entre las piedras y, al
  // final, enormes en el cielo. Dos brillos (cada uno con su punto) que miran
  // siempre de frente a la cámara.
  buildEyes() {
    const E = new THREE.Group();
    this.root.add(E);
    const mk = (c, s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false }));
      sp.scale.setScalar(s);
      E.add(sp);
      return sp;
    };
    // (atrás, una sombra: en el cielo claro la luz sumada sola no se veía)
    const shade = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.textures.dot, color: 0x000000, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    shade.renderOrder = 1;
    E.add(shade);
    this.eyes = { grp: E, shade, glow: [mk(0xff2a10, 1), mk(0xff2a10, 1)], core: [mk(0xffd0a0, 0.3), mk(0xffd0a0, 0.3)], k: 0, want: 0, size: 0.1, gap: 0.08, blink: 0 };
    for (const o of [...this.eyes.glow, ...this.eyes.core]) o.renderOrder = 2;
    E.visible = false;
  }

  // Los cuatro: los ponchos de los jugadores y, en la mano, cada uno su mate de
  // la luz (el de fuego, el de viento, el de rayo y el de hielo).
  buildCrew() {
    const g = this.g;
    this.people = new Avatars(g, null);
    this.crew = crewIds(g).map((id, i) => {
      const [x, z] = CREW_AT[i];
      const el = ELEMENTS[i];
      const r = { id, name: '', noTag: true, pos: this.P(x, 0, z), yaw: 0, pitch: -0.7, speed: 0, moving: false };
      this.people.add(r);
      const a = this.people.list.get(id);
      a.tag.visible = false;
      this.people.setGun(a, MATE_OF[el], 1);
      r.yaw = yawTo(r.pos, this.H);
      const K = { i, el, r, a, c: ELEM_COLOR[el], rgb: ELEM_RGB[el], pose: { v: {}, want: {}, speed: 5 }, pant: 1, knight: 0, raise: 0, look: this.H.clone(), turn: 3 };
      K.poncho0 = a.M.poncho.color.clone();
      r.poseFn = (Q) => this.crewPose(K, Q);
      // la luz del mate de la luz y el aura de caballero (después)
      K.glow = this.sprite(K.c, 0.5);
      K.aura = this.sprite(K.c, 1);
      K.aura.scale.set(1.9, 2.9, 1);
      // lo que se deshace al final (se prende recién ahí)
      K.cut = { value: -1e5 };
      K.dis = aniMat(this.T, { color: K.c, rim: WHITE, base: 1.1, rimK: 1.2, edge: 0.35, cut: K.cut, dir: -1, mode: 'solid' });
      return K;
    });
  }

  // El ánima de Martín Fierro: su cuerpo de siempre, hecho de luz (cada parte
  // con su tono), que se arma de abajo para arriba.
  buildFierro() {
    const g = this.g;
    this.spirit = new Avatars(g, null);
    const F = { id: 9, name: '', noTag: true, pos: this.P(FIERRO[0], 0, FIERRO[1]), yaw: Math.PI, pitch: 0, speed: 0, moving: false, dead: true };
    this.spirit.add(F);
    const fa = this.spirit.list.get(9);
    fa.tag.visible = false;
    const TONE = { poncho: 0xe0782a, skin: 0xf2b27a, pants: 0x7a4a2a, boots: 0x4a2a14, hat: 0xa06a2a, band: 0xff4a1a, hair: 0x6a3a18, eye: 0x200a04, mate: 0xc88a40, metal: 0xffe8b0 };
    this.fCut = { value: -1e5 };
    this.fK = { value: 1 };
    const mats = {};
    const byMat = new Map(Object.entries(fa.M).map(([k, m]) => [m, k]));
    fa.group.traverse((o) => {
      if (!o.isMesh) return;
      const key = byMat.get(o.material) || 'poncho';
      mats[key] ||= aniMat(this.T, { color: TONE[key] ?? 0xffc070, rim: 0xffc870, base: key === 'eye' ? 0.3 : 0.95, rimK: 0.9, edge: 0.3, cut: this.fCut, k: this.fK, mode: 'solid' });
      o.material = mats[key];
    });
    // y encima, el mismo cuerpo hecho borde de luz (lo que lo hace ánima)
    // (su propio muñeco: repite la pose ya mezclada del de abajo, sin avanzarla)
    this.aura = new Avatars(g, null);
    const Fa = { id: 9, name: '', noTag: true, pos: F.pos, yaw: F.yaw, pitch: 0, speed: 0, moving: false, dead: true };
    Fa.poseFn = (Q) => {
      const v = this.fierro.pose.v;
      for (const f of Object.keys(v)) Q[f] = v[f];
    };
    this.aura.add(Fa);
    this.fAura = Fa;
    const au = this.aura.list.get(9);
    au.fake.phase = fa.fake.phase;
    au.tag.visible = false;
    const shell = aniMat(this.T, { color: 0xffb050, rim: 0xffd080, base: 0.04, rimK: 1.5, edge: 0.3, cut: this.fCut, k: this.fK, wave: 0.02 });
    au.group.traverse((o) => {
      if (o.isMesh) o.material = shell;
    });
    this.fierro = { r: F, a: fa, pose: { v: {}, want: {}, speed: 4 } };
    F.poseFn = (Q) => this.applyPose(this.fierro.pose, Q);
    this.fHalo = this.sprite(0xffc070, 1);
    this.fHalo.scale.set(2.6, 3.6, 1);
    this.fRaise = 0;
  }

  // La columna de luz y el sello de los cuatro elementos en las lajas.
  buildColumn() {
    const F = this.P(FIERRO[0], 0, FIERRO[1]);
    this.F = F;
    this.pillarMat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uT: this.T, uDrop: { value: 0 }, uCol: { value: new THREE.Color(1, 0.84, 0.52) } },
      vertexShader: PILLAR_VS,
      fragmentShader: PILLAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), this.pillarMat);
    pillar.scale.set(0.9, 70, 0.9);
    pillar.position.copy(F);
    pillar.frustumCulled = false;
    pillar.renderOrder = 3;
    this.root.add(pillar);
    this.pillar = pillar;
    this.seal = new THREE.Group();
    this.seal.position.set(F.x, F.y + 0.04, F.z);
    const outer = new THREE.Mesh(new THREE.RingGeometry(1.72, 1.86, 72).rotateX(-Math.PI / 2), this.addMat(0xffd27a));
    this.seal.add(outer);
    const quarters = ELEMENTS.map((el, i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(1.26, 1.62, 32, 1, (i / 4) * Math.PI * 2 + 0.08, Math.PI / 2 - 0.16).rotateX(-Math.PI / 2), this.addMat(ELEM_COLOR[el]));
      this.seal.add(m);
      return m;
    });
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 56).rotateX(-Math.PI / 2), this.addMat(0xfff0c8));
    this.seal.add(inner);
    this.sealMats = [outer.material, inner.material, ...quarters.map((q) => q.material)];
    this.seal.renderOrder = 3;
    this.root.add(this.seal);
    // la onda que sale del sello
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 72).rotateX(-Math.PI / 2), this.addMat(0xffe0a0));
    this.wave.position.set(F.x, F.y + 0.06, F.z);
    this.wave.visible = false;
    this.root.add(this.wave);
    this.col = { drop: 0, k: 0, seal: 0, spin: 0, waveT: 9 };
  }

  // Los caballeros de antes, gigantes y de luz, detrás de cada uno (cada uno
  // con su propia raíz agrandada: el muñeco se arma alrededor del cero).
  buildGiants() {
    const g = this.g;
    this.giants = this.crew.map((K, i) => {
      const people = new Avatars(g, null);
      const r = { id: 60 + i, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: -0.15, speed: 0, moving: false, dead: true };
      people.add(r);
      const av = people.list.get(r.id);
      av.tag.visible = false;
      const cut = { value: -1e5 };
      const k = { value: 1 };
      const mat = aniMat(this.T, { color: K.c, rim: tmpC.set(K.c).lerp(new THREE.Color(1, 1, 1), 0.45).getHex(), base: 1, rimK: 1.3, edge: 0.6, cut, k, wave: 0.02, mode: 'alpha', alpha: 0.22 });
      av.group.traverse((o) => {
        if (o.isMesh) o.material = mat;
      });
      // atrás del gaucho, del lado contrario a Fierro
      const away = tmpV.copy(K.r.pos).sub(this.F).setY(0).normalize();
      const from = K.r.pos.clone().addScaledVector(away, 2.1);
      people.root.position.copy(from);
      people.root.scale.setScalar(GIANT);
      r.yaw = yawTo(from, this.F);
      const Gi = { i, people, r, av, cut, k, from, rise: -1, merge: -1, lift: 0 };
      r.poseFn = (Q) => {
        // el mate en alto, a medias: la guardia de los caballeros
        const u = smooth(Gi.lift);
        Q.shRp = lerp(Q.shRp, -1.9, u);
        Q.elR = lerp(Q.elR, -0.5, u);
        Q.headP = lerp(Q.headP, 0.12, u);
      };
      return Gi;
    });
  }

  // Los rayos de los mates, la estrella donde se juntan y la luz blanca del final.
  buildBeams() {
    for (const K of this.crew) {
      K.ray = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), this.addMat(K.c, 0.9));
      K.ray.visible = false;
      K.ray.frustumCulled = false;
      this.root.add(K.ray);
    }
    this.S = this.P(...STAR);
    this.star = this.sprite(0xfff0c8, 1);
    this.starRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.07, 6, 48), this.addMat(0xffd27a));
    this.starRing.visible = false;
    this.root.add(this.starRing);
    this.starK = 0;
    // (un resplandor que crece, sin borde: la esfera se veía como una burbuja)
    this.nova = this.sprite(0xfff2dc, 1);
    this.nova.position.copy(this.S);
    this.nova.visible = false;
  }

  // El mate de los cuatro: el mismo mate que el supremo (perla, vetas de oro,
  // corona, sol y reliquias: weapons/Supremo.js), con las cuatro luces de los
  // mates de la luz girándole alrededor. Se arma ya (escondido): se compila.
  buildSup() {
    const g = this.g;
    this.sup = buildSupremoDisplay(g.textures, SUP_SIZE);
    this.sup.position.copy(this.S);
    this.sup.visible = false;
    this.root.add(this.sup);
    this.supGlow = this.sprite(0xffe0a0, 1);
    this.supOrbs = KNIGHT_GLOW.map((c) => ({ glow: this.sprite(c, 0.45), core: this.sprite(0xffffff, 0.12) }));
    this.supK = 0;
    this.shockT = -1;
    this.grab = null;
    this.held = 0;
  }

  // Dónde está la mano derecha de Fierro (en el mundo).
  fierroHand(out) {
    return out.set(0, -0.2, 0.06).applyMatrix4(this.fierro.a.mats[6]);
  }

  // Los pedazos de los mundos, las columnas rotas de la isla y las piedras
  // que flotan: lo que se va deshaciendo cuando Fierro lo nombra.
  buildWorlds() {
    const arena = this.arena;
    const A = this.A;
    this.frags = (arena?.fragments || []).map((f) => {
      const rim = f.children.find((o) => o.material?.uniforms?.uColor)?.material || null;
      const star = this.sprite(new THREE.Color(f.userData.frag?.rim || 0xffd080).getHex(), 1);
      return { f, id: f.userData.frag?.id, rim, rim0: rim ? rim.uniforms.uColor.value.clone() : null, y0: f.position.y, s0: f.scale.x, u: -1, star, ph: f.userData.ph || 0 };
    });
    const kids = arena?.root?.children || [];
    this.columns = kids
      .filter((o) => o.isMesh && o.geometry?.type === 'CylinderGeometry' && Math.abs(Math.hypot(o.position.x - A.x, o.position.z - A.z) - (A.r - 3.2)) < 0.6)
      .map((o, k) => ({ o, y0: o.position.y, r0: o.rotation.clone(), u: -1, d: k * 0.12 }));
    this.rocks = kids.find((o) => o.isInstancedMesh && o.geometry?.type === 'DodecahedronGeometry') || null;
    this.rocksUp = 0;
    // donde se esconden los ojitos: arriba de la columna rota del noroeste
    const want = this.P(-15.4, 0, -10.8);
    let best = null;
    for (const Cl of this.columns) if (!best || Cl.o.position.distanceTo(want) < best.o.position.distanceTo(want)) best = Cl;
    this.hideSpot = best ? best.o.position.clone().setY(this.C.y + (best.o.geometry.parameters?.height || 2) + 0.28).lerp(tmpV.set(this.C.x, best.o.position.y, this.C.z), 0.02) : this.P(-15, 3, -11);
  }

  // El Mateendrache: llega volando al final de la primera parte.
  buildDragon() {
    const g = this.g;
    const D = g.ee?.dragonModel;
    this.D = D;
    this.fire = this.arena?.fire || g.ee?.dragon?.fire || null;
    this.DL = this.P(DRAGON_AT[0], 0, DRAGON_AT[1]);
    this.dragonYaw = Math.atan2(this.C.x - this.DL.x, this.C.z + 1.5 - this.DL.z);
    if (!D) return;
    D.root.visible = false;
    D.root.position.copy(this.P(-40, 40, -60));
    D.setPose('fly', 0.1);
    D.flapK = 1;
    this.drag = { t: -1, curve: null, bow: 0, rear: 0, bowTo: 0, rearTo: 0, fireT: 0, dis: -1 };
    // la reverencia y el pararse a rugir: el cuello de la pose 'stand' baja
    // (la cabeza a la altura de ellos) o se echa atrás y arriba. Solo en este
    // dragón y mientras dura la escena (cleanup lo saca).
    const base = Object.getPrototypeOf(D).posePoints;
    const Dg = this.drag;
    D.posePoints = function (name, t, out) {
      base.call(this, name, t, out);
      if (name !== 'stand') return;
      const b = smooth(Dg.bow);
      const r = smooth(Dg.rear);
      if (b <= 0 && r <= 0) return;
      for (let i = 0; i < 8; i++) {
        const e = (1 - i / 8) ** 2;
        out[i].y += (-3.3 * b + 0.8 * r) * e;
        out[i].z += (1.4 * b - 0.4 * r) * e;
      }
    };
    // (lo que se deshace al final: su material de siempre queda guardado)
    this.dCut = { value: -1e5 };
    this.dMat = aniMat(this.T, { color: 0xc8e070, rim: 0xffe8a0, base: 1, rimK: 1.1, edge: 0.7, cut: this.dCut, dir: -1, mode: 'solid' });
  }

  // Las dos luces del Éter (ya están desde que se armó el mapa): una dorada
  // sobre Fierro y otra de relleno, rosada, alta sobre la isla. Y la luz de
  // día del mundo (World.dayCur): la luna y el cielo se vuelven del amanecer.
  buildLights() {
    const L = this.arena?.lights || [];
    this.L = L.map((l) => ({ l, c: l.color.clone(), i: l.intensity, p: l.position.clone(), d: l.distance }));
    // (al principio es la brasa del sombrero; con la columna, la de Fierro)
    if (L[0]) {
      L[0].color.set(0xff5a20);
      L[0].position.copy(this.H).add(tmpV.set(0, 0.45, 0));
      L[0].distance = 8;
      L[0].intensity = 3;
    }
    if (L[1]) {
      L[1].color.set(0xffb48a);
      L[1].position.copy(this.C).add(tmpV.set(0, 16, 7));
      L[1].distance = 60;
      L[1].intensity = 8;
    }
    const W = this.g.world;
    this.day0 = { day: W.daylight, cur: W.dayCur };
    // la tormenta se calma: sin relámpagos, niebla finita y tibia
    const Wt = this.g.weather;
    if (Wt) Wt.target = { ...Wt.target, storm: 0, fog: 0.004, fogColor: 0x3a2238, wind: 0.25, cloud: 0.3, mist: 0, snow: 0 };
  }

  // ================= poses que se mezclan =================
  // (como en ui/EsterosEnding: cada parte pedida se acerca de a poco)
  pose(S, fields, speed = 5) {
    S.speed = speed;
    for (const [f, v] of Object.entries(fields)) {
      if (v === null) delete S.want[f];
      else S.want[f] = v;
    }
  }

  unpose(S, speed = 4) {
    S.speed = speed;
    S.want = {};
  }

  applyPose(S, Q) {
    const k = Math.min(1, this.dtNow * S.speed);
    for (const f of Object.keys(S.v)) {
      const base = Q[f] ?? 0;
      const goal = f in S.want ? S.want[f] : base;
      S.v[f] += (goal - S.v[f]) * k;
      Q[f] = S.v[f];
      if (!(f in S.want) && Math.abs(S.v[f] - base) < 0.005) delete S.v[f];
    }
    for (const f of Object.keys(S.want)) if (!(f in S.v)) S.v[f] = Q[f] ?? 0;
  }

  // Los gauchos: la pose pedida, el jadeo de la pelea y, al final, el mate en alto.
  crewPose(K, Q) {
    this.applyPose(K.pose, Q);
    const t = this.T.value;
    const p = K.pant;
    if (p > 0) {
      Q.torsoP += (0.1 + Math.sin(t * 5.4 + K.i * 1.3) * 0.05) * p;
      Q.headP += Math.sin(t * 5.4 + K.i * 1.3 + 0.6) * 0.05 * p;
      Q.shLp += Math.sin(t * 5.4 + K.i) * 0.04 * p;
    }
    if (K.raise > 0) {
      const u = smooth(K.raise);
      Q.shRp = lerp(Q.shRp, -2.9, u);
      Q.elR = lerp(Q.elR, -0.1, u);
      Q.shLp = lerp(Q.shLp, -0.35, u);
      Q.headP = lerp(Q.headP, -0.35, u);
    }
  }

  anim(dur, fn, done) {
    this.anims.push({ t: 0, dur, fn, done });
  }

  // ================= texto =================
  // Habla alguien: su nombre arriba y la frase que va apareciendo al ritmo de la voz.
  say(who, text) {
    const d = this.g.audio.say(text, who, { cine: true }) || text.length * 0.065;
    this.whoEl.textContent = who === 'fierro' ? 'Martín Fierro' : '';
    this.span.textContent = '';
    const el = this.textEl;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    this.el.classList.toggle('is-fierro', who === 'fierro');
    // (al ritmo de la voz: las tomas que van con las palabras no se adelantan)
    this.sub = { text, from: 0, t0: this.t, rev: Math.max(0.6, d * 0.88) };
    return d;
  }

  // Sigue la misma frase: lo dicho queda y aparece lo nuevo (part), con su voz.
  sayMore(who, text, part) {
    const d = this.g.audio.say(part, who, { cine: true }) || part.length * 0.065;
    const el = this.textEl;
    if (!el.classList.contains('is-on')) el.classList.add('is-on');
    this.sub = { text, from: text.length - part.length, t0: this.t, rev: Math.max(0.4, d * 0.85) };
    return d;
  }

  // Cuándo aparece una palabra de la frase que se está diciendo (segundos desde ahora).
  wordAt(word) {
    const S = this.sub;
    const i = S.text.indexOf(word);
    return i < 0 ? 0 : (i / S.text.length) * S.rev;
  }

  // (el final va despacio: cada frase de Fierro queda un rato más para leerla)
  line(i) {
    return this.say('fierro', LINES[i]) + 1.2;
  }

  // ================= cámaras =================
  // De a -> b mirando de la -> lb (fov de fa a fb).
  glide(dur, a, b, la, lb = la, fa = 50, fb = fa) {
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(a, b, k);
      look.lerpVectors(la, lb, k);
      this.setFov(lerp(fa, fb, k));
    });
  }

  // Mirando algo que se mueve (fn da adónde mira cada cuadro).
  follow(dur, a, b, fn, fa = 50, fb = fa) {
    this.shot(dur, (u, lt, pos, look) => {
      const k = smooth(u);
      pos.lerpVectors(a, b, k);
      look.copy(fn(k));
      this.setFov(lerp(fa, fb, k));
    });
  }

  // Dando una vuelta alrededor de c (ángulos a0 -> a1, radio y altura).
  orbit(dur, c, a0, a1, r0, r1, h0, h1, look, fa = 48, fb = fa) {
    this.shot(dur, (u, lt, pos, lk) => {
      const k = smooth(u);
      const a = lerp(a0, a1, k);
      const r = lerp(r0, r1, k);
      pos.set(c.x + Math.cos(a) * r, c.y + lerp(h0, h1, k), c.z + Math.sin(a) * r);
      lk.copy(typeof look === 'function' ? look(k) : look);
      this.setFov(lerp(fa, fb, k));
    });
  }

  // ================= sonido =================
  choir(t, notes, o) {
    const au = this.g.audio;
    if (this.bus) au.choir(this.bus, au.now + t, notes, o);
  }

  bell(t, n, o) {
    const au = this.g.audio;
    if (this.bus) au.bell(this.bus, au.now + t, n, o);
  }

  // El viento del Éter que se va calmando.
  wind(dur, gain = 0.35) {
    const au = this.g.audio;
    if (!this.bus || !au.noise) return;
    au.noise(this.bus, { t: au.now, dur, type: 'bandpass', freq: 420, freqEnd: 260, q: 0.6, gain, attack: 1.5, brown: true });
  }

  // Una subida brillante (lo que se deshace en luz).
  shimmer(pos, gain = 0.5) {
    const au = this.g.audio;
    if (!au.ctx) return;
    try {
      const o = au.out({ pos, reverb: 0.8, gain, ref: 40 });
      au.noise(o, { t: au.now, dur: 1.6, type: 'highpass', freq: 2500, freqEnd: 7000, q: 0.7, gain: 0.35, attack: 0.9 });
      au.tone(o, { t: au.now, dur: 1.4, type: 'sine', freq: 440, freqEnd: 1320, gain: 0.12, attack: 0.6 });
    } catch {
      /* sin audio */
    }
  }

  rumble(dur, gain = 0.6) {
    const au = this.g.audio;
    if (!this.bus || !au.noise) return;
    au.noise(this.bus, { t: au.now, dur, type: 'lowpass', freq: 160, freqEnd: 60, q: 0.7, gain, attack: dur * 0.3, brown: true });
  }

  // ================= el guion =================
  script0() {
    const P = (x, y, z) => this.P(x, y, z);
    const H = this.H;
    const F = this.F;
    const crewMid = P(0, 1.25, 2.9);
    return [
      // 1. lo que quedó: el sombrero humeando; atrás, las botas de los cuatro
      [0, () => {
        this.later(0.4, () => {
          this.fadeEl.style.transition = 'opacity 2.4s';
          this.fade(false);
        });
        this.wind(16, 0.4);
        this.choir(0.4, [45, 52, 57], { dur: 12, gain: 0.04, attack: 4, release: 4 });
        this.glide(7, H.clone().add(tmpW.set(2.5, 0.5, -2.4)), H.clone().add(tmpW.set(1.55, 0.52, -1.45)), H.clone().add(tmpW.set(-0.1, 0.1, 0.1)), H.clone().add(tmpW.set(-0.35, 0.4, 0.7)), 38, 40);
        return 6.2;
      }],
      // la cámara sube: los cuatro, jadeando, con los mates de la luz bajos
      [0, () => {
        this.glide(6, H.clone().add(tmpW.set(1.3, 0.6, -1.3)), P(2.8, 3.6, -3.4), crewMid.clone().setY(crewMid.y - 0.4), crewMid, 42, 52);
        this.later(2.2, () => {
          for (const K of this.crew) this.pose(K.pose, { headP: -0.3 }, 1.5);
        });
        return 5.6;
      }],
      // 2. el cielo se calma y el dragón baja y se posa
      [0, () => {
        this.landDragon(6.2);
        const DL = this.DL;
        this.follow(7.2, P(-4.6, 1.3, 9.6), P(-4.0, 1.5, 8.9), () => {
          const D = this.D;
          if (!D) return tmpU.set(DL.x, DL.y + 3, DL.z);
          tmpU.copy(D.root.position).setY(D.root.position.y + 1.5);
          return tmpU.lerp(tmpW.set(DL.x - 3, DL.y + 2.5, DL.z + 2), 0.35);
        }, 58, 52);
        this.later(1.2, () => {
          for (const K of this.crew) {
            K.look = this.DL.clone().setY(this.DL.y + 3);
            this.pose(K.pose, { headP: -0.15 }, 2);
          }
        });
        return 7;
      }],
      // 3. debajo del ala: dos ojitos colorados. Una risita. Ceniza.
      [0, () => {
        for (const K of this.crew) {
          K.look = H.clone();
          this.pose(K.pose, { headP: 0.25 }, 2);
        }
        // (de cerca al sombrero; cuando se escapan, la cámara los sigue)
        const t0 = this.t;
        const hatLook = H.clone().add(tmpW.set(0, 0.12, 0));
        this.follow(5.6, H.clone().add(tmpW.set(1.05, 0.3, -1.0)), H.clone().add(tmpW.set(1.5, 0.7, -0.4)), () => {
          const k = smooth(clamp01((this.t - t0 - 3.2) / 0.9));
          return tmpU.copy(hatLook).lerp(this.eyes.pos || hatLook, k);
        }, 34, 42);
        this.later(0.8, () => this.eyesAt(H.clone().setY(H.y + 0.13), 0.2, 0.13, 1));
        this.later(1.4, () => chiquiGiggle(this.g.audio, { pos: H, whisper: false, gain: 1.1, ref: 6, pitch: 1.1 }));
        this.later(2.9, () => this.ashHat());
        this.later(3.3, () => this.eyesFlee());
        return 5.4;
      }],
      // 4. del ojo del cielo baja una columna de luz
      [0, () => {
        this.columnDown(3.4);
        // (de lejos y abajo: la columna baja por el cuadro; sigue su punta)
        this.follow(4.6, P(-4.6, 0.9, 12.6), P(-4, 1, 11.7), () => tmpU.set(F.x, Math.min(F.y + 11, Math.max(F.y + 2.5, F.y + 70 * (1 - this.col.drop) - 8)), F.z), 56, 50);
        for (const K of this.crew) {
          K.look = F.clone().setY(F.y + 2);
          this.pose(K.pose, { headP: -0.2 }, 2);
        }
        return 4.4;
      }],
      // adentro se arma Fierro, de abajo para arriba
      [0, () => {
        this.fierroForm(3.4);
        this.follow(4.8, P(1.7, 1.25, 0.9), P(1.15, 1.45, 0.3), () => tmpU.set(F.x, Math.min(F.y + 1.5, Math.max(F.y + 0.7, this.fCut.value - 0.2)), F.z), 42, 38);
        for (const K of this.crew) {
          K.look = F.clone().setY(F.y + 1.5);
          K.pant = Math.min(K.pant, 0.4);
          this.pose(K.pose, { headP: null }, 2);
        }
        return 4.6;
      }],
      // 5. lo que viene
      [0, () => {
        this.fPose({ shLp: -0.9, shRp: -0.9, shLr: 0.7, shRr: -0.7, elL: -0.25, elR: -0.25, headP: 0.05 }, 2.5);
        this.glide(5, P(-2.35, 2.05, 5.8), P(-2.05, 2, 5.3), F.clone().setY(F.y + 1.4), F.clone().setY(F.y + 1.45), 36, 34);
        return this.line(0);
      }],
      [0.2, () => {
        this.fPose({ shLp: -0.35, shRp: -0.35, shLr: 0.15, shRr: -0.15, elL: -0.4, elR: -0.4, headP: 0.12 }, 2);
        const d = this.line(1);
        this.glide(d, F.clone().add(tmpW.set(0.65, 1.58, 2.6)), F.clone().add(tmpW.set(0.38, 1.6, 2.05)), F.clone().setY(F.y + 1.55), F.clone().setY(F.y + 1.6), 40, 36);
        // mira al cielo cuando dice dónde se esconde
        this.later(this.wordAt('Se esconde'), () => this.fPose({ headP: -0.4 }, 2));
        // ...en la memoria: los ojitos, escondidos entre las piedras, se cierran
        this.later(this.wordAt('en la memoria'), () => this.memoryShot(d - this.wordAt('en la memoria')));
        return d;
      }],
      [0.2, () => {
        // Fierro levanta el brazo al cielo; el ojo late
        const d = this.line(2);
        this.fPose({ shRp: -2.9, shRr: -0.05, elR: -0.1, shLp: -0.3, headP: -0.35 }, 2.5);
        this.glide(d, this.P(2.1, 0.85, 1.4), this.P(1.7, 0.9, 1.0), F.clone().setY(F.y + 1.7), F.clone().setY(F.y + 3.2), 48, 52);
        this.eyePulse = 1;
        return d;
      }],
      // cada mundo que nombra, su toma (la escena sigue cuando termina la lista)
      [0.1, () => this.worldsMontage()],
      [0.3, () => {
        const d = this.line(3);
        this.fPose({ shLp: -1.25, shRp: -1.25, shLr: 0.25, shRr: -0.25, elL: -0.2, elR: -0.2, headP: 0.1 }, 2);
        // van a olvidar: los cuatro bajan la cabeza
        for (const K of this.crew) this.pose(K.pose, { headP: 0.3 }, 1.5);
        this.glide(d, F.clone().add(tmpW.set(0.9, 1.65, 1.1)), F.clone().add(tmpW.set(0.5, 1.6, 1.5)), crewMid, crewMid, 46, 42);
        // ...como leyendas: los caballeros gigantes se levantan detrás
        this.later(this.wordAt('Pero van'), () => this.giantsShot(d - this.wordAt('Pero van')));
        return d;
      }],
      [0.3, () => {
        const d = this.line(4);
        this.fPose({ shLp: -0.6, shLr: 0.42, elL: -2.25, shRp: -0.3, shRr: -0.1, elR: -0.3, headP: 0.2 }, 2);
        this.skyEyesShot(d);
        return d;
      }],
      [0.3, () => {
        const d = this.line(5);
        this.fPose({ shLp: -0.5, shRp: -1.6, shLr: 0.3, shRr: -0.05, elL: -0.4, elR: -0.1, headP: 0.05 }, 2);
        this.mergeShot(d);
        return d;
      }],
      [0.2, () => {
        const d = this.line(6);
        this.fPose({ shLp: -0.6, shLr: 0.42, elL: -2.25, shRp: -0.4, elR: -0.4, headP: 0.25 }, 2);
        this.bowShot(d);
        return d;
      }],
      // 6. todos juntos
      [0.3, () => {
        this.quiet();
        this.raiseShot(9.5);
        this.card(LINES[7], 8);
        return 9.8;
      }],
      // 7. los mates de la luz se les van de las manos y se funden en uno
      [0, () => this.fusionShot()],
      // 8. Fierro estira la mano, lo agarra y lo levanta
      [0, () => this.grabShot()],
      // 9. con él, todo se deshace en luz (el último, Fierro; el mate queda solo)
      [0, () => this.resetShot()],
      // del blanco al negro, y unos segundos de negro total (sin nada: suspenso)
      [0, () => this.blackout()],
      // 10. negro: lo que les dicen los cuatro caballeros
      [0, () => this.knightsWord()],
      [0, () => {
        this.title('Fin');
        // (más abajo: el título grande lo pisaba)
        this.cardEl.style.top = '62%';
        this.card('Der Mateendrache · Gracias por jugar', 6);
        return 6.5;
      }],
    ];
  }

  fPose(fields, speed = 3) {
    this.pose(this.fierro.pose, fields, speed);
  }

  // ================= lo que pasa =================
  // El dragón llega en una vuelta larga y se posa levantando nieve.
  landDragon(secs) {
    const D = this.D;
    if (!D) return;
    const DL = this.DL;
    D.root.visible = true;
    D.setPose('fly', 0.2);
    // una vuelta larga por el norte y la entrada de frente, por detrás de donde
    // se posa (así llega mirando a los cuatro); frena, levanta la nariz, bate
    // las alas y baja las patas. (centrípeta: sin rulos entre puntos cercanos)
    const f = new THREE.Vector3(Math.sin(this.dragonYaw), 0, Math.cos(this.dragonYaw));
    const back = (d, h) => DL.clone().addScaledVector(f, -d).setY(DL.y + h);
    this.drag.curve = new THREE.CatmullRomCurve3([this.P(-26, 30, -50), this.P(-4, 27, -45), this.P(22, 21, -36), this.P(34, 15, -22), back(17, 8.5), back(7, 3.4), back(2, 0.9), DL.clone()], false, 'centripetal');
    this.drag.t = 0;
    this.drag.dur = secs;
    this.drag.prev = null;
    D.root.position.copy(this.drag.curve.getPointAt(0));
    this.fire?.whoosh?.(DL, secs * 0.8);
    this.storm = Math.min(this.storm, 0.3);
  }

  touchdown() {
    const g = this.g;
    const DL = this.DL;
    g.fx.addShake?.(0.5);
    this.shake = Math.max(this.shake, 0.5);
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      g.fx.dust?.(tmpV.set(DL.x + Math.cos(a) * 3, DL.y + 0.1, DL.z + Math.sin(a) * 3), tmpW.set(Math.cos(a), 0.5, Math.sin(a)), [0.92, 0.93, 0.97], 4);
    }
    for (let k = 0; k < 120; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 3;
      g.fx.alpha.spawn(DL.x + Math.cos(a) * r, DL.y + 0.2, DL.z + Math.sin(a) * r, Math.cos(a) * (3 + Math.random() * 4), 0.8 + Math.random() * 1.6, Math.sin(a) * (3 + Math.random() * 4), { color: [0.9, 0.9, 0.95], size: 0.5, size1: 1.8, life: 1.4 + Math.random(), alpha: 0.45, drag: 1.2 });
    }
    this.rumble(1.4, 0.9);
    this.fire?.roar?.(DL);
    this.D?.open?.(0.8);
    this.later(1.4, () => this.D?.open?.(0));
  }

  // Los ojitos: aparecen en p, del tamaño size, separados gap.
  eyesAt(p, size, gap, k = 1) {
    const E = this.eyes;
    E.grp.visible = true;
    E.pos = p.clone();
    E.size = size;
    E.gap = gap;
    E.want = k;
    E.move = null;
  }

  // El sombrero se hace ceniza: se aplasta, humo negro y brasas.
  ashHat() {
    const g = this.g;
    const H = this.H;
    this.anim(1.1, (k) => {
      this.hat.scale.set(1.3 * (1 + k * 0.15), 1.3 * (1 - k * 0.92), 1.3 * (1 + k * 0.15));
      this.hat.position.y = H.y + 0.08 - k * 0.05;
    }, () => {
      this.hat.visible = false;
    });
    this.anim(1.4, (k) => {
      this.staff.scale.setScalar(1.4 * (1 - k));
    }, () => {
      this.staff.visible = false;
    });
    for (let i = 0; i < 70; i++) {
      g.fx.alpha.spawn(H.x + rnd() * 1.1, H.y + 0.1 + Math.random() * 0.2, H.z + rnd() * 1.1, rnd() * 0.8, 0.6 + Math.random() * 1.2, rnd() * 0.8, { color: [0.05, 0.03, 0.03], size: 0.25, size1: 1.1, life: 1.6 + Math.random(), alpha: 0.6, drag: 0.6 });
      if (i < 50) g.fx.add.spawn(H.x + rnd() * 0.9, H.y + 0.1, H.z + rnd() * 0.9, rnd() * 1.4, 1 + Math.random() * 2.2, rnd() * 1.4, { color: [1, 0.25 + Math.random() * 0.2, 0.05], size: 0.05, size1: 0.01, life: 1 + Math.random(), drag: 0.4 });
    }
    chiquiGlitch(g.audio, 0.35);
  }

  // Los ojitos se escapan: suben y se van a esconder entre las piedras (arriba al noroeste).
  eyesFlee() {
    const E = this.eyes;
    const from = E.pos.clone();
    const to = this.hideSpot;
    const mid = from.clone().lerp(to, 0.5).setY(to.y + 3);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    E.move = { t: 0, dur: 2.6, curve, s0: E.size, s1: 0.9, g0: E.gap, g1: 0.55 };
  }

  // La columna baja del cielo hasta el lugar de Fierro; el sello se prende.
  columnDown(secs) {
    const col = this.col;
    const F = this.F;
    this.anim(secs, (k) => {
      col.drop = 1 - (1 - k) * (1 - k);
      col.k = Math.min(1, k * 3);
    }, () => {
      col.seal = 0.001;
      col.waveT = 0;
      this.wave.visible = true;
      this.g.fx.flash(tmpV.set(F.x, F.y + 1, F.z), 0xffd080, 14, 1.2, 16);
      this.g.post?.flash?.(0.35);
      this.shake = Math.max(this.shake, 0.25);
      this.bell(0, 69, { gain: 0.14, dur: 6 });
      this.bell(0.08, 76, { gain: 0.08, dur: 6 });
    });
    this.bell(0.3, 81, { gain: 0.05, dur: 5 });
    this.choir(0, [57, 64, 69, 73], { dur: 9, gain: 0.05, attack: 2.5, release: 4 });
    const L0 = this.arena?.lights?.[0];
    if (L0) {
      L0.color.set(0xffc070);
      L0.position.copy(F).add(tmpV.set(0, 2.6, 1.4));
      L0.distance = 30;
      L0.intensity = 0;
    }
    this.shimmer(F.clone().setY(F.y + 20), 0.6);
  }

  // Fierro se arma de abajo para arriba adentro de la columna.
  fierroForm(secs) {
    const F = this.F;
    const r = this.fierro.r;
    r.dead = false;
    this.fOn = true;
    this.fCut.value = F.y - 0.05;
    this.fPose({ shLp: -0.5, shRp: -0.5, shLr: 0.35, shRr: -0.35, elL: -0.3, elR: -0.3, headP: 0.3 }, 20);
    this.anim(secs, (k) => {
      this.fCut.value = F.y - 0.05 + smooth(k) * 2.35;
      // chispas en la línea que se va armando
      const y = this.fCut.value;
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2;
        this.g.fx.add.spawn(F.x + Math.cos(a) * 0.3, y, F.z + Math.sin(a) * 0.25, Math.cos(a) * 0.4, 0.2 + Math.random() * 0.4, Math.sin(a) * 0.4, { color: [1, 0.86, 0.55], size: 0.05, size1: 0.01, life: 0.7 });
      }
    }, () => {
      this.fCut.value = 1e5;
      this.fPose({ headP: 0.05 }, 2);
    });
    this.later(secs * 0.9, () => {
      this.bell(0, 57, { gain: 0.12, dur: 6 });
      this.choir(0, [45, 57, 61, 64], { dur: 10, gain: 0.05, attack: 1.5, release: 4 });
    });
  }

  // "...en la memoria": los ojitos, escondidos entre las piedras, parpadean y se cierran.
  memoryShot(dur) {
    const E = this.eyes;
    const at = this.hideSpot;
    E.move = null;
    this.eyesAt(at, 0.9, 0.55, 1);
    const cam = this.P(-3.2, 1.5, 1.8);
    this.glide(Math.max(1.5, dur), cam, cam.clone().lerp(at, 0.05), at.clone().add(tmpW.set(0.6, -0.3, 0)), at, 16, 13);
    this.later(0.9, () => (E.blink = 0.25));
    this.later(1.7, () => (E.blink = 0.25));
    this.later(Math.max(1.5, dur) * 0.75, () => (E.want = 0));
    chiquiGiggle(this.g.audio, { gain: 0.5, whisper: true, pan: -0.4, echo: 0.7 });
  }

  // "...el molino, la tapera, el penal, la torre, el estero... este castillo. Todo."
  // "El molino, la tapera, el penal, la torre, el estero... este castillo. Todo."
  // Un nombre por vez, cada uno con su voz y su toma (el subtítulo va sumando):
  // la imagen nunca se adelanta a lo que dice. Devuelve una espera larga y, al
  // terminar la lista, suelta el guion (this.next).
  worldsMontage() {
    let said = '';
    const step = (i) => {
      if (this.done) return;
      if (i >= WORLDS.length) {
        this.next = this.t;
        return;
      }
      const [w, id] = WORLDS[i];
      said = said ? said + ' ' + w : w;
      const d = this.sayMore('fierro', said, w);
      const dur = Math.max(id === 'todo' ? 3.4 : 2.2, d + 0.8);
      if (id === 'castillo') this.columnsShot(dur);
      else if (id === 'todo') this.allShot(dur);
      else this.fragShot(id, dur);
      this.later(dur, () => step(i + 1));
    };
    step(0);
    return 9999;
  }

  // Un pedazo de mundo: la cámara en el borde de la isla, mirándolo de lejos.
  fragShot(id, dur) {
    const Fr = this.frags.find((x) => x.id === id);
    if (!Fr) return;
    const C = this.C;
    const fp = Fr.f.position;
    const dir = tmpV.set(fp.x - C.x, 0, fp.z - C.z).normalize();
    const cam = C.clone().addScaledVector(dir, this.A.r + 5).setY(C.y + 4.5);
    const side = tmpW.set(-dir.z, 0, dir.x).multiplyScalar(1.6);
    const look = fp.clone().setY(fp.y + 5);
    this.follow(dur + 0.3, cam.clone().sub(side), cam.clone().add(side), () => tmpU.copy(Fr.f.position).setY(Fr.f.position.y + 4).lerp(look, 0.5), 30, 27);
    this.unravel(Fr);
  }

  // Se deshace en luz: se prende el borde, tiembla, se estira y sube al ojo.
  unravel(Fr) {
    if (Fr.u >= 0) return;
    Fr.u = 0;
    this.shimmer(Fr.f.position, 0.9);
    this.bell(0.05, [69, 72, 76, 79, 81][this.frags.indexOf(Fr) % 5], { gain: 0.09, dur: 5 });
  }

  // "...este castillo": las columnas rotas de la isla se levantan.
  columnsShot(dur) {
    this.columns.forEach((Cl) => {
      Cl.u = -Cl.d;
    });
    this.rumble(2.4, 0.8);
    const at = this.P(-17, 4, 5);
    this.glide(dur + 0.4, this.P(-4, 0.6, 3), this.P(-4.6, 0.8, 2.4), at, at.clone().setY(at.y + 3), 46, 50);
  }

  // "Todo.": de arriba, la isla y todo lo que sube al ojo.
  allShot(dur) {
    const C = this.C;
    for (const Fr of this.frags) this.unravel(Fr);
    this.rocksUp = 0.001;
    this.eyePulse = 1.5;
    this.glide(dur, this.P(-8, 16, 34), this.P(-4, 26, 40), C.clone().setY(C.y + 4), C.clone().setY(C.y + 16), 58, 64);
    this.choir(0, [45, 52, 57, 64, 69], { dur: 7, gain: 0.05, attack: 1.2, release: 3 });
  }

  // "...como leyendas que nadie conoce": los gigantes se levantan detrás.
  giantsShot(dur) {
    const C = this.C;
    for (const Gi of this.giants) {
      Gi.r.dead = false;
      Gi.rise = 0;
      Gi.cut.value = C.y - 0.1;
    }
    this.later(0.3, () => {
      for (const K of this.crew) {
        this.pose(K.pose, { headP: -0.3 }, 1.2);
        K.turnTo = K.r.yaw + Math.PI;
      }
    });
    this.choir(0, [45, 52, 57, 61, 64], { dur: 8, gain: 0.055, attack: 1.5, release: 3 });
    this.bell(0.4, 45, { gain: 0.16, dur: 7 });
    this.rumble(2, 0.5);
    this.glide(Math.max(2, dur), this.P(0.9, 0.45, -0.3), this.P(-0.6, 0.4, -0.7), this.P(0, 3.4, 4.2), this.P(0, 4.6, 4.6), 58, 60);
  }

  // "Y él va a ser un recuerdo...": los ojos, enormes en el cielo, se rompen en brasas.
  skyEyesShot(d) {
    const g = this.g;
    const far = this.P(-14, 52, -80);
    this.eyesAt(far, 24, 15, 1);
    const cam = this.P(-2.4, 1.5, -0.6);
    const burst = this.wordAt('Uno que');
    this.follow(d, cam, cam.clone().add(tmpW.set(0, 0.2, 0.4)), () => {
      const u = clamp01((this.t - this.skyT0 - burst) / Math.max(1, d - burst - 0.5));
      return tmpU.copy(far).lerp(tmpW.set(this.C.x, this.C.y - 14, this.C.z - 34), smooth(u));
    }, 52, 58);
    this.skyT0 = this.t;
    this.later(burst, () => {
      this.eyes.want = 0;
      this.eyes.fast = true;
      this.embers = 1;
      this.emberAt = far.clone();
      chiquiGlitch(g.audio, 0.7);
      g.audio.thunder?.(far);
      chiquiGiggle(g.audio, { gain: 0.6, echo: 0.8, pitch: 0.8 });
      this.shake = Math.max(this.shake, 0.3);
    });
    this.later(burst + 1.8, () => {
      for (const K of this.crew) this.pose(K.pose, { headP: -0.35 }, 1);
    });
  }

  // "Ustedes ya fueron caballeros...": cada gigante se mete en su gaucho.
  mergeShot(d) {
    // (del lado de Fierro: se les ven las caras)
    const c = this.P(0, 0, 2.7);
    this.orbit(d, c, -1.05, -2.05, 5, 4.5, 2.3, 1.7, () => tmpU.set(c.x, c.y + 1.4, c.z), 50, 46);
    for (const K of this.crew) this.pose(K.pose, { headP: null }, 2);
    const gap = Math.max(1, Math.min(1.7, (d - 1.5) / 4));
    this.giants.forEach((Gi, i) => this.later(0.5 + i * gap, () => this.merge(Gi)));
  }

  merge(Gi) {
    const K = this.crew[Gi.i];
    const from = Gi.people.root.position.clone();
    const to = K.r.pos.clone();
    Gi.merge = 0;
    this.shimmer(to, 0.5);
    this.anim(1.1, (k) => {
      const u = smooth(k);
      Gi.people.root.position.lerpVectors(from, to, u);
      Gi.people.root.scale.setScalar(lerp(GIANT, 1, u));
      Gi.r.yaw = angLerp(Gi.r.yaw, K.r.yaw, Math.min(1, this.dtNow * 6));
      Gi.k.value = lerp(1, 0.6, u);
    }, () => {
      Gi.r.dead = true;
      K.knight = 0.001;
      this.elementBurst(K);
    });
  }

  // El gaucho se vuelve caballero: el golpe de su elemento.
  elementBurst(K) {
    const g = this.g;
    const p = K.r.pos;
    const c = tmpV.set(p.x, p.y + 1.1, p.z);
    // (una explosión de luz de su color, sin humo ni quemadura en las lajas)
    for (let i = 0; i < 70; i++) {
      tmpW.set(rnd(), Math.random() * 0.8, rnd()).normalize().multiplyScalar(2 + Math.random() * 4);
      g.fx.add.spawn(c.x, c.y, c.z, tmpW.x, tmpW.y, tmpW.z, { color: K.rgb, size: 0.35 + Math.random() * 0.4, size1: 0.05, life: 0.4 + Math.random() * 0.4, drag: 3 });
    }
    g.fx.flash(c, K.c, 12, 0.9, 10);
    g.fx.sparkle(c, K.rgb, 40, 1.6);
    g.audio.sting?.();
    if (K.el === 'fuego') {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        g.fx.fire(tmpW.set(p.x + Math.cos(a) * 1.1, p.y + 0.05, p.z + Math.sin(a) * 1.1), 0.3, 3);
      }
      g.audio.fireball?.(p);
    } else if (K.el === 'viento') {
      for (let k = 0; k < 90; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.4;
        g.fx.add.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 2.2, p.z + Math.sin(a) * r, -Math.sin(a) * 6, 1.2 + Math.random(), Math.cos(a) * 6, { color: [0.7, 1, 0.82], size: 0.05, size1: 0.01, life: 0.9, drag: 0.8 });
      }
      this.wind(1.6, 0.8);
    } else if (K.el === 'rayo') {
      g.fx.lightning(tmpW.set(p.x + rnd() * 3, p.y + 28, p.z - 4), c.clone(), K.c, 0.45);
      g.fx.lightning(tmpW.set(p.x + rnd() * 3, p.y + 24, p.z - 2), c.clone(), 0xffffff, 0.3);
      g.fx.electric?.(c, 30);
      g.audio.thunder?.(c, true);
      g.post?.flash?.(0.4);
    } else {
      g.fx.frost?.(tmpW.copy(p), 40);
      for (let k = 0; k < 60; k++) {
        const a = Math.random() * Math.PI * 2;
        g.fx.add.spawn(p.x, p.y + 0.1, p.z, Math.cos(a) * (2 + Math.random() * 3), 0.2 + Math.random(), Math.sin(a) * (2 + Math.random() * 3), { color: [0.75, 0.92, 1], size: 0.06, size1: 0.02, life: 0.9, drag: 1.2 });
      }
      this.bell(0, 88, { gain: 0.09, dur: 3 });
    }
    this.bell(0.05, [57, 60, 64, 69][K.i], { gain: 0.1, dur: 5 });
  }

  // "Y cuando la historia vuelva a necesitarlos...": el dragón baja la cabeza.
  bowShot(d) {
    const DL = this.DL;
    this.drag.bowTo = 1;
    // de costado: los cuatro a la izquierda, el dragón a la derecha, de perfil
    const mid = this.P(3.2, 2, 0.6);
    this.glide(d, this.P(5.2, 1.45, 10.8), this.P(4.7, 1.55, 10), mid, mid.clone().lerp(tmpW.set(DL.x, DL.y + 2, DL.z), 0.15), 50, 46);
    this.fire?.roar?.(DL);
    this.rumble(1.2, 0.4);
  }

  // "Nosotros, los cuatro caballeros, nos alzaremos una vez más."
  raiseShot(dur) {
    const S = this.S;
    // de atrás y abajo, subiendo: los cuatro con los mates en alto, Fierro enfrente, el dragón
    this.orbit(dur, this.P(0, 0, 1.2), 2.6, 1.7, 9, 11, 1, 4, (k) => tmpU.set(this.C.x, lerp(this.C.y + 2.2, S.y - 0.5, k), lerp(this.C.z + 0.5, S.z, k)), 50, 56);
    this.crew.forEach((K, i) => {
      this.later(0.4 + i * 0.25, () => {
        K.raising = true;
        K.look = S.clone();
      });
    });
    this.later(0.2, () => this.fPose({ shRp: -2.9, elR: -0.1, shLp: -2.6, elL: -0.2, shLr: 0.2, headP: -0.4 }, 2));
    this.later(1.8, () => {
      this.starK = 0.001;
      this.g.post?.flash?.(0.5);
      this.g.fx.flash(S, 0xfff0c8, 20, 1.5, 40);
    });
    // el dragón se para y le tira fuego al cielo
    this.later(2.6, () => {
      this.drag.bowTo = 0;
      this.drag.rearTo = 1;
      this.drag.fireT = 3.2;
      this.fire?.roar?.(this.DL);
    });
    // truenos de los cuatro colores
    this.crew.forEach((K, i) => {
      this.later(2.2 + i * 0.4, () => {
        const p = K.r.pos;
        this.g.fx.lightning(tmpV.set(S.x + rnd() * 4, S.y + 16, S.z + rnd() * 4), tmpW.copy(S), K.c, 0.5);
        this.g.audio.thunder?.(tmpU.set(p.x, p.y + 10, p.z), i === 3);
      });
    });
    this.choir(0.2, [45, 57, 61, 64, 69], { dur: 10, gain: 0.08, attack: 1.2, release: 3 });
    this.bell(0.8, 45, { gain: 0.22, dur: 7 });
    this.bell(2.2, 57, { gain: 0.14, dur: 7 });
  }

  // Los mates de la luz se les van de las manos, suben por sus rayos, giran
  // cada vez más rápido y más cerca, y se funden en uno (como el mate supremo).
  fusionShot() {
    const S = this.S;
    this.drag.rearTo = 0;
    this.detachMates();
    for (const K of this.crew) {
      K.raising = false;
      K.look = S.clone();
      this.pose(K.pose, { headP: -0.45 }, 1.5);
    }
    this.fPose({ shRp: -0.7, shLp: -0.7, shLr: 0.35, shRr: -0.35, elL: -0.3, elR: -0.3, headP: -0.3 }, 1.8);
    // desde abajo, delante de ellos: cómo suben
    this.glide(1.9, this.P(1.9, 0.7, 0.2), this.P(1.5, 0.8, -0.3), this.P(0, 2.4, 2.6), S.clone(), 52, 46);
    // de cerca, dando la vuelta a lo que gira
    this.later(1.9, () => this.orbit(3.1, S, -1.4, -2.9, 3.6, 2.8, -0.3, 0.3, S, 46, 40));
    this.later(FLY_UP + ORBIT + 0.55, () => this.fuse());
    // el mate de los cuatro, recién hecho: la cámara se le acerca
    // (entero, con sus cuatro luces: de más cerca no se lo llegaba a ver)
    // (desde el lado del dragón, que queda detrás de la cámara y no tapa)
    this.later(5, () => this.glide(4.8, S.clone().add(tmpW.set(5.4, -0.35, 2)), S.clone().add(tmpW.set(4.3, -0.15, 1.4)), S.clone().setY(S.y + 0.3), S.clone().setY(S.y + 0.35), 42, 40));
    // un zumbido que sube mientras giran
    const au = this.g.audio;
    if (this.bus && au.tone) {
      au.tone(this.bus, { t: au.now + FLY_UP, dur: ORBIT + 0.6, type: 'sine', freq: 110, freqEnd: 440, gain: 0.07, attack: ORBIT * 0.8 });
      au.tone(this.bus, { t: au.now + FLY_UP, dur: ORBIT + 0.6, type: 'triangle', freq: 220, freqEnd: 880, gain: 0.03, attack: ORBIT * 0.8 });
    }
    this.shimmer(S, 0.6);
    return 9.8;
  }

  // Cada mate sale de la mano (una copia del que tenía, en el mismo lugar): la
  // mano queda vacía.
  detachMates() {
    for (const K of this.crew) {
      const a = K.a;
      const src = a.gun?.children[0] || a.hand.children[0];
      src.updateWorldMatrix(true, false);
      const obj = src.clone();
      src.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
      obj.visible = true;
      this.root.add(obj);
      K.fly = { obj, from: obj.position.clone(), s0: obj.scale.x, t: -K.i * 0.18, a: 0, glow: this.sprite(K.c, 0.9) };
      this.people.setGun(a, null);
      a.hand.children[0].visible = false;
      K.flown = true;
      this.starFade = true;
      this.g.fx.sparkle(K.fly.from, K.rgb, 20, 0.5);
    }
  }

  // Se funden: un fogonazo de los cuatro colores, la onda y el mate de los cuatro.
  fuse() {
    const g = this.g;
    const S = this.S;
    for (const K of this.crew) {
      if (!K.fly) continue;
      K.fly.done = true;
      K.fly.obj.visible = false;
      K.fly.glow.visible = false;
    }
    this.starK = 0;
    this.sup.visible = true;
    this.sup.position.copy(S);
    this.supK = 0.001;
    this.shockT = 0;
    g.post?.flash?.(0.9);
    g.fx.flash(S, 0xffffff, 30, 1.4, 30);
    this.shake = Math.max(this.shake, 0.5);
    for (const K of this.crew) {
      for (let i = 0; i < 60; i++) {
        tmpW.set(rnd(), rnd() * 0.8, rnd()).normalize().multiplyScalar(3 + Math.random() * 6);
        g.fx.add.spawn(S.x, S.y, S.z, tmpW.x, tmpW.y, tmpW.z, { color: K.rgb, size: 0.3 + Math.random() * 0.3, size1: 0.04, life: 0.6 + Math.random() * 0.6, drag: 2.5 });
      }
    }
    g.audio.thunder?.(S, true);
    this.bell(0, 45, { gain: 0.24, dur: 8 });
    this.bell(0.06, 57, { gain: 0.16, dur: 8 });
    this.bell(0.12, 64, { gain: 0.1, dur: 8 });
    this.choir(0, [45, 57, 61, 64, 69, 73], { dur: 9, gain: 0.08, attack: 0.6, release: 4 });
    this.shimmer(S, 1);
  }

  // Fierro estira la mano: el mate de los cuatro baja hasta él, lo agarra, lo
  // mira y lo levanta.
  grabShot() {
    const g = this.g;
    const F = this.F;
    this.fPose({ shRp: -1.7, shRr: -0.05, elR: -0.2, shLp: -0.5, shLr: 0.3, elL: -0.4, headP: -0.2 }, 2.2);
    this.later(0.7, () => {
      this.grab = { t: 0, dur: 2.1, from: this.sup.position.clone() };
      this.shimmer(this.sup.position, 0.5);
    });
    this.onGrab = () => {
      // (su mate de siempre no: ahora tiene este)
      this.fierro.a.hand.children[0].visible = false;
      this.aura.list.get(9).hand.children[0].visible = false;
      g.fx.flash(this.sup.position, 0xffe0a0, 14, 0.8, 12);
      this.bell(0, 69, { gain: 0.12, dur: 5 });
      this.fPose({ headP: 0.15, shRp: -1.2, elR: -1.1 }, 3);
    };
    this.later(3.9, () => {
      this.fPose({ shRp: -2.95, shRr: -0.05, elR: -0.05, shLp: -0.8, shLr: 0.4, elL: -0.3, headP: -0.45 }, 2);
      this.supFlare = 0.001;
      this.choir(0, [57, 64, 69, 73, 76], { dur: 8, gain: 0.06, attack: 1.5, release: 3 });
      this.rumble(3, 0.5);
    });
    for (const K of this.crew) {
      K.look = F.clone().setY(F.y + 2);
      this.pose(K.pose, { headP: -0.15 }, 1.5);
    }
    // de frente y abajo: se lo ve bajar a su mano; después, la grúa cuando lo levanta
    this.follow(3.9, F.clone().add(tmpW.set(1.9, 1.3, 5.6)), F.clone().add(tmpW.set(1.4, 1.4, 4.6)), () => tmpU.copy(this.sup.position).lerp(tmpW.set(F.x, F.y + 1.4, F.z), 0.6), 48, 44);
    this.later(3.9, () => this.glide(3.6, F.clone().add(tmpW.set(1.2, 1, 2.9)), F.clone().add(tmpW.set(2.2, 0.6, 4.4)), F.clone().setY(F.y + 2.1), F.clone().setY(F.y + 2.9), 44, 50));
    return 7.5;
  }

  // Con el mate de los cuatro en alto, todo se deshace en luz: el dragón, los
  // cuatro y, el último, Fierro, que lo baja al pecho y los despide. El mate
  // queda solo, flotando, y se come todo de blanco.
  resetShot() {
    const g = this.g;
    const F = this.F;
    this.nova.visible = true;
    this.novaT = 0;
    this.shimmer(this.sup.position, 1);
    this.rumble(8, 0.7);
    this.choir(0, [57, 64, 69, 73, 76], { dur: 9, gain: 0.07, attack: 2, release: 3 });
    // de lejos: la luz sale del mate en alto y el dragón y los cuatro se van en luz
    this.glide(4.2, this.P(-6.5, 2.4, 10.5), this.P(-7.5, 3.4, 12), this.P(0.5, 2.6, -1), this.P(0.5, 3.6, -2), 54, 58);
    this.later(0.3, () => this.dissolveDragon());
    this.crew.forEach((K, i) => this.later(1.1 + i * 0.35, () => this.dissolveCrew(K)));
    // de cerca: Fierro baja el mate al pecho, los despide y se va
    this.later(4.2, () => {
      this.supCalm = true;
      this.novaClose = true;
      // (a la altura de la panza: más arriba tapaba la cara)
      this.holdUp = 0;
      this.holdSize = 0.42;
      this.fPose({ shRp: -0.5, shRr: -0.15, elR: -0.95, shLp: -0.45, shLr: 0.45, elL: -0.9, headP: 0.12 }, 2.2);
      this.glide(7.8, F.clone().add(tmpW.set(0.45, 1.55, 2.4)), F.clone().add(tmpW.set(0.3, 1.6, 1.9)), F.clone().setY(F.y + 1.5), F.clone().setY(F.y + 1.62), 38, 34);
      this.later(0.9, () => this.say('fierro', LINES[8]));
      this.later(2.4, () => this.fPose({ headP: 0.4 }, 3));
      this.later(3, () => this.fPose({ headP: 0.05 }, 2));
      this.later(3.4, () => {
        this.quiet();
        this.dissolveFierro(2.2);
      });
      this.later(4.6, () => (this.letGo = true));
    });
    // el mate solo brilla cada vez más: blanco
    this.later(9.2, () => (this.supCalm = false));
    this.later(9.6, () => (this.whiteGo = 0.001));
    this.later(10.4, () => this.white(true));
    g.fx.addShake?.(0.3);
    return 13;
  }

  dissolveDragon() {
    const D = this.D;
    if (!D?.root.visible) return;
    const saved = [];
    D.root.traverse((o) => {
      if (o.isMesh) {
        saved.push([o, o.material]);
        o.material = this.dMat;
      }
    });
    this.dSaved = saved;
    const y0 = this.DL.y - 0.2;
    this.drag.dis = 0;
    this.dCut.value = y0;
    this.anim(3, (k) => {
      this.dCut.value = y0 + smooth(k) * 10;
    }, () => {
      D.root.visible = false;
    });
    this.shimmer(this.DL, 0.8);
  }

  dissolveCrew(K) {
    const a = K.a;
    const y0 = K.r.pos.y - 0.05;
    K.cut.value = y0;
    K.dissolving = true;
    a.group.traverse((o) => {
      if (o.isMesh) o.material = K.dis;
    });
    this.anim(2.2, (k) => {
      K.cut.value = y0 + smooth(k) * 2.3;
    }, () => {
      a.group.visible = false;
      K.r.dead = true;
      K.gone = true;
    });
  }

  dissolveFierro(secs) {
    const F = this.F;
    const y0 = F.y - 0.05;
    for (const m of Object.values(this.fierroMatsAll())) m.uniforms.uDir.value = -1;
    this.fCut.value = y0;
    this.fDis = true;
    this.anim(secs, (k) => {
      this.fCut.value = y0 + smooth(k) * 2.4;
    }, () => {
      this.fierro.r.dead = true;
      this.fOn = false;
    });
  }

  fierroMatsAll() {
    const set = new Set();
    for (const grp of [this.fierro.a.group, this.aura.list.get(9)?.group]) {
      grp?.traverse((o) => {
        if (o.isMesh) set.add(o.material);
      });
    }
    return [...set];
  }

  // ================= cada cuadro =================
  tick(dt) {
    // la entrada del molino se mueve sola (ella pone la cámara)
    // (el negro de los caballeros, y el negro de antes: lo del Éter ya no corre)
    if (this.inVoid || this.void?.on) {
      this.voidTick(dt);
      return;
    }
    this.dtNow = dt;
    const t = (this.T.value += dt);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    this.skyTick(dt);
    this.subTick();
    this.crewTick(dt);
    this.people.update(dt);
    this.spirit.update(dt);
    this.fAura.yaw = this.fierro.r.yaw;
    this.fAura.dead = this.fierro.r.dead;
    this.aura.update(dt);
    for (const Gi of this.giants) {
      Gi.people.update(dt);
      // (el mate va pegado al antebrazo: con el brazo arriba quedaba boca abajo)
      if (!Gi.r.dead) uprightMate(Gi.av, 1, Gi.r.yaw);
    }
    this.afterPose(dt, t);
    this.hatTick(dt, t);
    this.eyesTick(dt, t);
    this.columnTick(dt, t);
    this.giantsTick(dt, t);
    this.worldsTick(dt, t);
    this.embersTick(dt);
    this.dragonTick(dt, t);
    this.fliesTick(dt, t);
    this.supTick(dt, t);
    this.starTick(dt, t);
    this.lightsTick(dt, t);
  }

  // El cielo: la tormenta se apaga, amanece, el ojo late y al final todo blanco.
  skyTick(dt) {
    const g = this.g;
    const cam = g.camera.position;
    const arena = this.arena;
    this.storm = Math.max(0, this.storm - dt / 8);
    if (arena?.sky) {
      const U = arena.sky.material.uniforms;
      U.uTime.value = g.time;
      U.uChaos.value = this.storm;
      U.uFlash.value = this.storm > 0.2 && Math.random() < dt * 0.6 ? 0.8 : Math.max(0, U.uFlash.value - dt * 3);
      arena.sky.position.copy(cam);
      if (arena.clouds) {
        arena.clouds.material.uniforms.uTime.value = g.time;
        arena.clouds.position.set(cam.x, this.A.y - 46, cam.z);
      }
    }
    // (amanece en los primeros 30 s)
    this.dawn = Math.min(1, this.dawn + dt / 26);
    const dawn = smooth(clamp01((this.dawn - 0.08) / 0.92));
    if (this.whiteGo) this.whiteGo = Math.min(1, this.whiteGo + dt / 5);
    this.eyePulse = Math.max(0, this.eyePulse - dt * 0.35);
    const U = this.dawnMat.uniforms;
    U.uDawn.value = dawn;
    U.uWhite.value = smooth(this.whiteGo || 0);
    U.uEye.value = this.eyePulse + (this.starK || 0) * 0.6;
    this.dawnDome.position.copy(cam);
    this.haze.position.set(cam.x, this.A.y - 45.4, cam.z);
    this.haze.material.opacity = dawn * 0.3;
    // la luz del día del mundo: la luna y el cielo se vuelven del amanecer
    const W = g.world;
    W.daylight = dawn * 0.6;
    W.dayCur = W.daylight;
  }

  // El subtítulo va apareciendo letra por letra.
  subTick() {
    const S = this.sub;
    if (!S) return;
    const k = clamp01((this.t - S.t0) / S.rev);
    const from = S.from || 0;
    const n = from + Math.ceil(k * (S.text.length - from));
    if (n !== S.n) {
      S.n = n;
      this.span.textContent = S.text.slice(0, n);
    }
  }

  // Los gauchos: miran lo que pasa, se calman, levantan los mates, brillan de caballeros.
  crewTick(dt) {
    for (const K of this.crew) {
      if (K.gone) continue;
      const r = K.r;
      K.pant = Math.max(0.15, K.pant - dt / 26);
      let want = yawTo(r.pos, K.look || this.F);
      if (K.turnTo != null) {
        // (se dan vuelta a ver al gigante un momento)
        want = K.turnTo;
        K.turnT = (K.turnT || 0) + dt;
        if (K.turnT > 2.4) {
          K.turnTo = null;
          K.turnT = 0;
        }
      }
      r.yaw = angLerp(r.yaw, want, Math.min(1, dt * 2.2));
      // el mate: bajo mientras jadean; arriba al final
      if (K.raising) K.raise = Math.min(1, K.raise + dt / 1.2);
      else K.raise = Math.max(0, K.raise - dt / 1.6);
      r.pitch = lerp(-0.7, 1.2, smooth(K.raise));
      // de gaucho a caballero: el poncho toma el color de su elemento y brilla
      if (K.knight > 0 && K.knight < 1) {
        K.knight = Math.min(1, K.knight + dt / 0.9);
        const u = smooth(K.knight);
        const M = K.a.M;
        M.poncho.color.copy(K.poncho0).lerp(tmpC.set(K.c).multiplyScalar(1.5), u);
        M.poncho.emissive?.set(K.c);
        if (M.poncho.emissive) M.poncho.emissiveIntensity = 0.28 * u;
        M.band.emissive?.set(K.c);
        if (M.band.emissive) M.band.emissiveIntensity = 0.6 * u;
      }
    }
  }

  // Lo que va después de la pose: el mate derecho de Fierro, las luces de los mates, las auras.
  afterPose(dt, t) {
    const F = this.fierro;
    uprightMate(F.a, 1, F.r.yaw);
    uprightMate(this.aura.list.get(9), 1, F.r.yaw);
    for (const K of this.crew) {
      const a = K.a;
      const vis = !K.gone && a.group.visible;
      const hp = tmpV.set(0, -0.2, 0.06).applyMatrix4(a.mats[6]);
      K.hand = K.hand || new THREE.Vector3();
      K.hand.copy(hp);
      K.glow.visible = vis && !K.flown;
      K.aura.visible = vis && K.knight > 0;
      if (!vis) {
        K.ray.visible = false;
        continue;
      }
      K.glow.position.copy(hp).add(tmpW.set(0, 0.1 + K.raise * 0.25, 0));
      K.glow.material.opacity = (0.35 + K.knight * 0.3 + K.raise * 0.4) * (0.85 + Math.sin(t * 8 + K.i) * 0.15) * (K.dissolving ? 0.4 : 1);
      K.glow.scale.setScalar(0.45 + K.raise * 0.6 + K.knight * 0.15);
      if (K.knight > 0) {
        K.aura.position.set(K.r.pos.x, K.r.pos.y + 1.05, K.r.pos.z);
        K.aura.material.opacity = smooth(K.knight) * (0.2 + Math.sin(t * 2.3 + K.i) * 0.05) * (K.dissolving ? 0.3 : 1);
        if (Math.random() < dt * 8) this.g.fx.sparkle(tmpW.set(K.r.pos.x + rnd() * 0.8, K.r.pos.y + 0.3 + Math.random() * 1.6, K.r.pos.z + rnd() * 0.8), K.rgb, 1, 0.3);
      }
      // el rayo del mate a la estrella
      const on = K.raise > 0.7 && this.starK > 0 && !K.dissolving && !K.flown;
      K.ray.visible = on;
      if (on) {
        const A = K.glow.position;
        const len = A.distanceTo(this.S);
        K.ray.position.copy(A);
        K.ray.lookAt(this.S);
        K.ray.scale.set(1 + Math.sin(t * 21 + K.i) * 0.3, 1 + Math.sin(t * 17 + K.i) * 0.3, len * smooth(clamp01((K.raise - 0.7) / 0.3)));
        K.ray.material.opacity = 0.9;
        if (Math.random() < dt * 30) this.g.fx.sparkle(tmpW.lerpVectors(A, this.S, Math.random()), K.rgb, 1, 0.4);
      }
    }
  }

  // El sombrero humea: humo negro finito y alguna brasa.
  hatTick(dt, t) {
    const g = this.g;
    if (!this.hat.visible || this.hatK <= 0) return;
    const H = this.H;
    if (Math.random() < dt * 14) g.fx.alpha.spawn(H.x + rnd() * 0.5, H.y + 0.25, H.z + rnd() * 0.5, rnd() * 0.2, 0.5 + Math.random() * 0.5, rnd() * 0.2, { color: [0.07, 0.05, 0.05], size: 0.18, size1: 0.9, life: 2.4, alpha: 0.4, drag: 0.3 });
    if (Math.random() < dt * 6) g.fx.add.spawn(H.x + rnd() * 0.6, H.y + 0.12, H.z + rnd() * 0.6, rnd() * 0.3, 0.6 + Math.random() * 0.8, rnd() * 0.3, { color: [1, 0.3, 0.08], size: 0.035, size1: 0.01, life: 1.2 });
    void t;
  }

  // Los ojitos: de frente a la cámara, parpadean, se mueven y se apagan.
  eyesTick(dt, t) {
    const E = this.eyes;
    if (!E.grp.visible) return;
    const cam = this.g.camera;
    E.k += (E.want - E.k) * Math.min(1, dt * (E.fast ? 9 : E.want > E.k ? 2.2 : 1.4));
    if (E.move) {
      const M = E.move;
      M.t = Math.min(1, M.t + dt / M.dur);
      const u = smooth(M.t);
      M.curve.getPoint(u, E.pos);
      E.size = lerp(M.s0, M.s1, u);
      E.gap = lerp(M.g0, M.g1, u);
      if (Math.random() < dt * 30) this.g.fx.add.spawn(E.pos.x + rnd() * 0.3, E.pos.y + rnd() * 0.2, E.pos.z + rnd() * 0.3, 0, -0.2, 0, { color: [0.7, 0.08, 0.03], size: 0.08, size1: 0.01, life: 0.9 });
      if (M.t >= 1) E.move = null;
    }
    E.blink = Math.max(0, E.blink - dt);
    const open = E.blink > 0 ? Math.abs(Math.cos((E.blink / 0.25) * Math.PI)) : 1;
    E.grp.position.copy(E.pos);
    E.grp.quaternion.copy(cam.quaternion);
    const flick = 0.85 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.05;
    [-1, 1].forEach((s, n) => {
      const G = E.glow[n];
      const Cc = E.core[n];
      G.position.set(s * E.gap * 0.5, 0, 0);
      Cc.position.copy(G.position);
      G.scale.set(E.size, E.size * (0.3 + 0.7 * open), 1);
      Cc.scale.set(E.size * 0.28, E.size * 0.28 * open, 1);
      G.material.opacity = E.k * 0.9 * flick;
      Cc.material.opacity = E.k * flick;
    });
    E.shade.scale.set(E.gap * 3.4 + E.size * 1.5, E.size * 2.6, 1);
    E.shade.material.opacity = E.k * 0.55;
    if (E.k < 0.01 && E.want === 0) E.grp.visible = false;
  }

  // La columna de luz, el sello que gira, la onda y lo que baja en espiral.
  columnTick(dt, t) {
    const g = this.g;
    const col = this.col;
    const F = this.F;
    const cam = g.camera.position;
    // (con la cámara pegada a la columna se apaga: lavaba la pantalla)
    const cd = Math.hypot(cam.x - F.x, cam.z - F.z) / this.pillar.scale.x;
    const near = smooth(clamp01((cd - 1.3) / 2.2));
    // Fierro ya armado: la columna queda tenue
    // (mientras se arma Fierro se va apagando: si no, no se lo veía)
    const rest = this.fOn ? (this.fCut.value > 1e4 ? 0.12 : lerp(1, 0.2, clamp01((this.fCut.value - F.y) / 1.2))) : 1;
    const fade = this.whiteGo ? Math.max(0, 1 - this.whiteGo * 2) : 1;
    this.pillarMat.uniforms.uK.value = col.k * rest * near * fade * 0.32;
    this.pillarMat.uniforms.uDrop.value = col.drop;
    this.pillar.visible = col.k > 0.001;
    if (col.seal > 0) col.seal = Math.min(1, col.seal + dt / 1.2);
    col.spin += dt * (0.3 + (1 - col.seal) * 2.5 + (this.starK || 0) * 2);
    this.seal.rotation.y = col.spin;
    const sk = smooth(col.seal) * fade;
    this.sealMats.forEach((m, i) => {
      m.opacity = Math.min(1, sk * (i < 2 ? 0.9 : 0.7) * (0.85 + Math.sin(t * 3 + i) * 0.15));
    });
    this.seal.visible = sk > 0.001;
    if (this.wave.visible) {
      col.waveT += dt;
      const u = clamp01(col.waveT / 1.4);
      this.wave.scale.setScalar(1 + u * 12);
      this.wave.material.opacity = (1 - u) * 1.2;
      if (u >= 1) this.wave.visible = false;
    }
    // la luz que baja en espiral mientras cae la columna
    if (col.k > 0 && col.drop < 1) {
      const top = F.y + 70 * (1 - col.drop);
      for (let n = 0; n < 4; n++) {
        const a = Math.random() * Math.PI * 2;
        g.fx.add.spawn(F.x + Math.cos(a) * 1.4, top + Math.random() * 6, F.z + Math.sin(a) * 1.4, -Math.sin(a) * 2, -14, Math.cos(a) * 2, { color: [1, 0.86, 0.55], size: 0.12, size1: 0.03, life: 0.8 });
      }
    }
    // Fierro: el halo detrás y las motas que suben de él
    const fr = this.fierro.r;
    const on = !fr.dead;
    this.fHalo.visible = on;
    if (on) {
      this.fHalo.position.set(F.x, F.y + 1.15, F.z - 0.5);
      const cut = this.fCut.value > 1e4 ? 1 : clamp01((this.fCut.value - F.y) / 2.2);
      this.fHalo.material.opacity = (this.fDis ? 1 - cut : cut) * (0.3 + Math.sin(t * 1.7) * 0.05);
      if (Math.random() < dt * 10) g.fx.add.spawn(F.x + rnd() * 0.8, F.y + Math.random() * 1.8, F.z + rnd() * 0.6, 0, 0.4 + Math.random() * 0.4, 0, { color: [1, 0.85, 0.55], size: 0.05, size1: 0, life: 1.2 });
    }
    // lo que se deshace: motas en la línea
    if (this.fDis && on) {
      for (let n = 0; n < 5; n++) g.fx.add.spawn(F.x + rnd() * 0.7, this.fCut.value, F.z + rnd() * 0.5, rnd() * 0.5, 1 + Math.random() * 1.5, rnd() * 0.5, { color: [1, 0.86, 0.55], size: 0.07, size1: 0.01, life: 1.3 });
    }
  }

  // Los gigantes: se arman de abajo para arriba y levantan el mate a medias.
  giantsTick(dt, t) {
    const g = this.g;
    for (const Gi of this.giants) {
      if (Gi.r.dead) continue;
      if (Gi.rise >= 0 && Gi.rise < 1) {
        Gi.rise = Math.min(1, Gi.rise + dt / 2.4);
        Gi.cut.value = this.C.y - 0.1 + smooth(Gi.rise) * 6.2;
        const K = this.crew[Gi.i];
        const p = Gi.people.root.position;
        for (let n = 0; n < 3; n++) g.fx.add.spawn(p.x + rnd() * 1.6, Gi.cut.value, p.z + rnd() * 1.2, 0, 0.6, 0, { color: K.rgb, size: 0.1, size1: 0.02, life: 0.8 });
        if (Gi.rise >= 1) Gi.cut.value = 1e5;
      }
      if (Gi.rise >= 1 && Gi.merge < 0) Gi.lift = Math.min(1, Gi.lift + dt / 1.5);
      if (Gi.merge < 0) Gi.k.value = 0.9 + Math.sin(t * 1.9 + Gi.i) * 0.1;
    }
  }

  // Los pedazos de los mundos que se deshacen, las columnas que suben y las piedras.
  worldsTick(dt, t) {
    const g = this.g;
    for (const Fr of this.frags) {
      const f = Fr.f;
      if (!f.visible) continue;
      if (Fr.u < 0) {
        // (flotan como siempre)
        f.position.y = Fr.y0 + Math.sin(g.time * 0.3 + Fr.ph) * 1.5;
        continue;
      }
      Fr.u = Math.min(1, Fr.u + dt / 3.2);
      const u = Fr.u;
      const rise = clamp01((u - 0.22) / 0.78);
      const sk = u < 0.3 ? (u / 0.3) * 0.6 : 0;
      f.position.set(f.position.x + rnd() * sk * 0.4, Fr.y0 + rise * rise * 70 + rnd() * sk, f.position.z + rnd() * sk * 0.4);
      const s = Fr.s0 * (1 - smooth(rise) * 0.98);
      f.scale.set(s, s * (1 + rise * 1.4), s);
      f.rotation.y += dt * (0.1 + rise * 2.4);
      if (Fr.rim) Fr.rim.uniforms.uColor.value.copy(Fr.rim0).multiplyScalar(1 + Math.min(1, u * 4) * 5);
      // su luz: una estrella en el medio
      Fr.star.visible = true;
      Fr.star.position.copy(f.position).setY(f.position.y + 3 * f.scale.y);
      Fr.star.material.opacity = Math.sin(Math.min(1, u * 1.3) * Math.PI) * 0.5;
      Fr.star.scale.setScalar(3 + Math.sin(u * Math.PI) * 8);
      // lo que se desgrana y sube
      const n = Math.round(dt * 160 * (0.3 + rise));
      const R = 9 * Math.max(0.2, f.scale.x / Fr.s0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * R;
        const warm = Math.random() < 0.6;
        g.fx.add.spawn(f.position.x + Math.cos(a) * rr, f.position.y + Math.random() * 8 * f.scale.y - 2, f.position.z + Math.sin(a) * rr, Math.cos(a) * 1.5, 6 + Math.random() * 12, Math.sin(a) * 1.5, { color: warm ? [1, 0.84, 0.5] : [Fr.rim0?.r || 1, Fr.rim0?.g || 1, Fr.rim0?.b || 1], size: 0.5 + Math.random() * 0.5, size1: 0.05, life: 1.6 + Math.random(), drag: 0.1 });
      }
      if (u >= 1) {
        f.visible = false;
        Fr.star.visible = false;
      }
    }
    for (const Cl of this.columns) {
      if (Cl.u === -1 || !Cl.o.visible) continue;
      Cl.u += dt / 4;
      if (Cl.u < 0) continue;
      const u = Math.min(1, Cl.u);
      const k = u * u;
      Cl.o.position.y = Cl.y0 + k * 26 + Math.sin(t * 2 + Cl.d * 9) * 0.08;
      Cl.o.rotation.set(Cl.r0.x + k * 1.2, Cl.r0.y + k * 2, Cl.r0.z + k * 0.8);
      if (u < 0.12 && Math.random() < 0.6) g.fx.dust?.(tmpV.set(Cl.o.position.x, this.C.y + 0.1, Cl.o.position.z), UP, [0.9, 0.9, 0.95], 2);
      if (Math.random() < dt * 12) g.fx.add.spawn(Cl.o.position.x + rnd(), Cl.o.position.y - 1.2, Cl.o.position.z + rnd(), 0, 2, 0, { color: [1, 0.86, 0.55], size: 0.18, size1: 0.02, life: 1.2 });
      if (u >= 1) Cl.o.visible = false;
    }
    if (this.rocks && this.rocksUp > 0) {
      this.rocksUp = Math.min(1, this.rocksUp + dt / 10);
      this.rocks.position.y = this.rocksUp * this.rocksUp * 60;
    }
  }

  // Las brasas coloradas que llueven por todos los mundos (el recuerdo).
  embersTick(dt) {
    if (!this.embers) return;
    const g = this.g;
    const C = this.C;
    this.embers = Math.max(0, this.embers - dt / 7);
    const n = Math.round(dt * 260 * this.embers);
    for (let i = 0; i < n; i++) {
      const x = C.x + rnd() * 70;
      const z = C.z - 30 + rnd() * 70;
      g.fx.add.spawn(x, C.y + 30 + Math.random() * 30, z, rnd() * 1.5, -7 - Math.random() * 6, rnd() * 1.5, { color: Math.random() < 0.7 ? [1, 0.16, 0.05] : [1, 0.5, 0.15], size: 0.14 + Math.random() * 0.12, size1: 0.05, life: 4 + Math.random() * 2, drag: 0.05 });
    }
    // (el estallido: de donde estaban los ojos)
    if (this.emberAt) {
      const p = this.emberAt;
      for (let i = 0; i < 300; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI - Math.PI / 2;
        const s = 6 + Math.random() * 22;
        g.fx.add.spawn(p.x + rnd() * 10, p.y + rnd() * 4, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * 0.6, Math.sin(a) * Math.cos(e) * s, { color: [1, 0.2 + Math.random() * 0.2, 0.05], size: 1.6, size1: 0.2, life: 2 + Math.random() * 1.5, gravity: 5, drag: 0.4 });
      }
      this.emberAt = null;
    }
  }

  // El dragón: el vuelo, la llegada, la reverencia, el fuego al cielo.
  dragonTick(dt, t) {
    const D = this.D;
    if (!D?.root.visible) return;
    const Dg = this.drag;
    const DL = this.DL;
    if (Dg.curve && Dg.t >= 0 && Dg.t < 1) {
      Dg.t = Math.min(1, Dg.t + dt / Dg.dur);
      const u = Dg.t;
      // (rápido al llegar, despacio al posarse; por largo de camino: parejo)
      const p = Dg.curve.getPointAt(Math.min(1, 1 - (1 - u) ** 2.2), tmpU);
      // hacia dónde mira: para donde va (como en la Gran Guerra), inclinado en
      // las curvas; el rumbo solo mientras avanza de verdad (bajando derecho,
      // el ángulo de la velocidad saltaba de un lado al otro)
      if (!Dg.prev) {
        Dg.prev = p.clone();
        Dg.vel = new THREE.Vector3();
        Dg.curve.getTangentAt(0, tmpV);
        Dg.yaw = Math.atan2(tmpV.x, tmpV.z);
        Dg.pitch = 0;
        Dg.roll = 0;
      }
      Dg.vel.subVectors(p, Dg.prev).divideScalar(Math.max(dt, 1e-3));
      Dg.prev.copy(p);
      const v = Dg.vel;
      const hs = Math.hypot(v.x, v.z);
      let yawRate = 0;
      if (hs > 0.8 && u < 0.86) {
        let dy = Math.atan2(v.x, v.z) - Dg.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        const st = dy * Math.min(1, dt * 5);
        Dg.yaw += st;
        yawRate = st / Math.max(dt, 1e-3);
      }
      // al final se acomoda de frente a ellos
      if (u > 0.8) Dg.yaw = angLerp(Dg.yaw, this.dragonYaw, Math.min(1, dt * 3));
      // el frenado: la nariz para arriba y las alas batiendo fuerte
      const flare = u > 0.66 ? Math.sin(clamp01((u - 0.66) / 0.32) * Math.PI) : 0;
      const pitch = THREE.MathUtils.clamp(-Math.atan2(v.y, Math.max(hs, 2)), -0.5, 0.5) * (1 - flare) - 0.34 * flare;
      Dg.pitch += (pitch - Dg.pitch) * Math.min(1, dt * 4);
      Dg.roll += (THREE.MathUtils.clamp(-yawRate * 1.5, -0.5, 0.5) * (1 - flare) - Dg.roll) * Math.min(1, dt * 3);
      D.flapK = 1 + flare * 0.7;
      if (u > 0.84 && D.pose === 'fly') D.setPose('stand', 1.1);
      D.root.position.copy(p);
      D.root.quaternion.setFromEuler(tmpE.set(Dg.pitch, Dg.yaw, Dg.roll, 'YXZ'));
      if (u >= 1) this.touchdown();
    }
    const crew = this.P(0, 1.2, 2.8);
    // la reverencia: el cuerpo abajo, la cabeza a la altura de ellos
    Dg.bow += Math.sign(Dg.bowTo - Dg.bow) * Math.min(Math.abs(Dg.bowTo - Dg.bow), dt / 2);
    Dg.rear += Math.sign(Dg.rearTo - Dg.rear) * Math.min(Math.abs(Dg.rearTo - Dg.rear), dt / 1.3);
    if (Dg.t >= 1) {
      D.root.position.set(DL.x, DL.y - smooth(Dg.bow) * 0.35 + smooth(Dg.rear) * 0.3, DL.z);
      // (posado: derecho y de frente, sin saltos)
      if (Dg.yaw != null) {
        const k = Math.min(1, dt * 4);
        Dg.pitch -= Dg.pitch * k;
        Dg.roll -= Dg.roll * k;
        Dg.yaw = angLerp(Dg.yaw, this.dragonYaw, k);
        D.root.quaternion.setFromEuler(tmpE.set(Dg.pitch, Dg.yaw, Dg.roll, 'YXZ'));
      }
      if (Dg.rear > 0.05) D.look(tmpV.copy(this.S).setY(this.S.y + 14));
      else if (Dg.bow > 0.05) D.look(tmpV.copy(crew).setY(crew.y - 1.6));
      else if (this.sup.visible) D.look(this.sup.position);
      else D.look(this.fierro.r.dead ? crew : tmpV.copy(this.F).setY(this.F.y + 1.6));
    }
    // fuego al cielo
    if (Dg.fireT > 0 && this.fire) {
      Dg.fireT -= dt;
      D.open(1);
      const m = D.mouthPos(tmpV);
      this.fire.breathe(m, tmpW.copy(m).add(tmpU.set(0.5, 16, 0.4)), dt, false);
      if (Dg.fireT <= 0) D.open(0);
    }
    D.update(dt);
    this.fire?.update?.(dt);
    // (se deshace: hojitas de yerba y chispas doradas en la línea)
    if (Dg.dis >= 0 && this.dCut.value < DL.y + 9) {
      for (let n = 0; n < 8; n++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 4.5;
        this.g.fx.add.spawn(D.root.position.x + Math.cos(a) * r, this.dCut.value, D.root.position.z + Math.sin(a) * r, rnd() * 1.5, 2 + Math.random() * 3, rnd() * 1.5, { color: Math.random() < 0.5 ? [0.7, 0.95, 0.35] : [1, 0.85, 0.45], size: 0.12, size1: 0.02, life: 1.4, drag: 0.3 });
      }
    }
    void t;
  }

  // Los mates de la luz en el aire: suben por sus rayos (una curva), se agrandan
  // y giran alrededor del punto donde se juntan, cada vez más rápido y más cerca.
  fliesTick(dt, t) {
    const g = this.g;
    const S = this.S;
    for (const K of this.crew) {
      const Fl = K.fly;
      if (!Fl || Fl.done) continue;
      Fl.t += dt;
      if (Fl.t < 0) continue;
      const o = Fl.obj;
      const a0 = K.i * Math.PI * 0.5 + 0.6;
      const R0 = 1.7;
      let big;
      if (Fl.t < FLY_UP) {
        const u = smooth(Fl.t / FLY_UP);
        const e = tmpW.set(S.x + Math.cos(a0) * R0, S.y, S.z + Math.sin(a0) * R0);
        const c = tmpU.copy(Fl.from).setY(Fl.from.y + 2.6);
        // (Bézier de tres puntos)
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * u * (1 - u);
        const w2 = u * u;
        o.position.set(Fl.from.x * w0 + c.x * w1 + e.x * w2, Fl.from.y * w0 + c.y * w1 + e.y * w2, Fl.from.z * w0 + c.z * w1 + e.z * w2);
        Fl.a = a0;
        big = lerp(1, 2.4, u);
      } else {
        const k = clamp01((Fl.t - FLY_UP) / ORBIT);
        Fl.a += dt * lerp(2.2, 16, k * k);
        const r = R0 * (1 - smooth(k)) + 0.1;
        o.position.set(S.x + Math.cos(Fl.a) * r, S.y + Math.sin(Fl.a * 1.5 + K.i) * 0.28 * (1 - k), S.z + Math.sin(Fl.a) * r);
        big = 2.4 * (1 - 0.45 * k);
      }
      o.scale.setScalar(Fl.s0 * big);
      o.quaternion.premultiply(tmpQ.setFromAxisAngle(UP, dt * (3 + Fl.t * 3)));
      Fl.glow.position.copy(o.position);
      Fl.glow.material.opacity = 0.5 + Math.sin(t * 11 + K.i) * 0.1;
      Fl.glow.scale.setScalar(0.5 + Math.min(1, Fl.t) * 0.2);
      // la estela de su color
      const n = Math.round(dt * 70) + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) g.fx.add.spawn(o.position.x + rnd() * 0.15, o.position.y + rnd() * 0.15, o.position.z + rnd() * 0.15, rnd() * 0.4, rnd() * 0.4, rnd() * 0.4, { color: K.rgb, size: 0.14, size1: 0.02, life: 0.7 + Math.random() * 0.4 });
    }
  }

  // El mate de los cuatro: aparece con un rebote, flota, baja a la mano de
  // Fierro y la sigue; al final queda solo, subiendo. Sus cuatro luces giran.
  supTick(dt, t) {
    const g = this.g;
    const sup = this.sup;
    const on = sup.visible;
    this.supGlow.visible = on;
    for (const O of this.supOrbs) {
      O.glow.visible = on;
      O.core.visible = on;
    }
    if (!on) return;
    if (this.supK > 0 && this.supK < 1) this.supK = Math.min(1, this.supK + dt / 0.9);
    if (this.supFlare > 0 && this.supFlare < 1) this.supFlare = Math.min(1, this.supFlare + dt / 1.5);
    const k = this.supK;
    const grow = smooth(k) * (k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1);
    const hand = this.fierroHand(tmpW).add(tmpU.set(0, this.holdUp ?? 0.32, 0));
    if (this.grab) {
      const G = this.grab;
      G.t += dt;
      const u = smooth(Math.min(1, G.t / G.dur));
      sup.position.lerpVectors(G.from, hand, u);
      sup.position.y += Math.sin(u * Math.PI) * 0.5;
      this.held = u;
      if (G.t >= G.dur) {
        this.grab = null;
        this.held = 1;
        this.onGrab?.();
      }
    } else if (this.letGo) sup.position.y += dt * 0.25;
    else if (this.held >= 1) sup.position.copy(hand);
    else sup.position.set(this.S.x, this.S.y + Math.sin(t * 1.3) * 0.12, this.S.z);
    const s = grow * lerp(1, this.holdSize ?? SUP_HELD, this.held);
    sup.scale.setScalar(Math.max(0.001, s));
    // (en el primer plano de Fierro brilla menos: si no, lavaba el cuadro)
    const flare = (this.supFlare || 0) * (this.supCalm ? 0.3 : 1);
    animateSupremoDisplay(sup, dt, t, { speed: 1.3 + flare * 2, open: 0.25 + flare * 0.6, lift: 0.2 });
    this.supGlow.position.copy(sup.position).add(tmpU.set(0, SUP_SIZE * 0.4 * s, 0));
    this.supGlow.material.opacity = Math.min(1, (0.26 + flare * 0.22) * grow) * (0.9 + Math.sin(t * 5) * 0.1) * (this.supCalm ? 0.45 : 1);
    this.supGlow.scale.setScalar((1.7 + flare * 1.2) * s);
    this.supOrbs.forEach((O, i) => {
      const a = t * 2.4 + (i * Math.PI) / 2;
      const r = 0.75 * s;
      O.glow.position.set(sup.position.x + Math.cos(a) * r, sup.position.y + SUP_SIZE * 0.45 * s + Math.sin(a * 2 + i) * 0.12 * s, sup.position.z + Math.sin(a) * r);
      O.core.position.copy(O.glow.position);
      O.glow.material.opacity = 0.6 * grow;
      O.core.material.opacity = grow;
      O.glow.scale.setScalar(0.38 * s + 0.04);
      O.core.scale.setScalar(0.13 * s + 0.02);
      if (Math.random() < dt * 20) g.fx.add.spawn(O.glow.position.x, O.glow.position.y, O.glow.position.z, rnd() * 0.3, rnd() * 0.3, rnd() * 0.3, { color: KNIGHT_RGB[i], size: 0.08, size1: 0.01, life: 0.6 });
    });
    if (Math.random() < dt * 25) g.fx.sparkle(tmpU.copy(sup.position).setY(sup.position.y + 0.3 * s), [1, 0.9, 0.6], 1, 0.5 * s);
  }

  // Donde se juntan los rayos (una estrella), la onda cuando se funden y la
  // luz blanca que sale del mate de los cuatro y se come todo.
  starTick(dt, t) {
    const g = this.g;
    const S = this.S;
    if (this.starFade) this.starK = Math.max(0, this.starK - dt / 0.8);
    else if (this.starK > 0) this.starK = Math.min(1, this.starK + dt / 1.2);
    const k = smooth(this.starK);
    this.star.visible = k > 0;
    if (k > 0) {
      this.star.position.copy(S);
      this.star.material.opacity = k * (0.85 + Math.sin(t * 9) * 0.15);
      this.star.scale.setScalar(k * (2.4 + Math.sin(t * 5) * 0.3));
      if (Math.random() < dt * 40) g.fx.sparkle(S, [1, 0.92, 0.7], 2, 1.2);
    }
    // la onda: un aro que se abre de frente a la cámara
    const R = this.starRing;
    if (this.shockT >= 0) {
      this.shockT += dt;
      const u = clamp01(this.shockT / 0.9);
      R.visible = u < 1;
      R.position.copy(S);
      R.quaternion.copy(g.camera.quaternion);
      R.scale.setScalar(0.4 + smooth(u) * 6);
      R.material.opacity = (1 - u) * 1.1;
      if (u >= 1) this.shockT = -1;
    } else R.visible = false;
    if (this.nova.visible) {
      this.novaT += dt;
      this.nova.position.copy(this.sup.visible ? this.sup.position : S);
      const u = smooth(Math.min(1, this.novaT / 10));
      // (crece de a poco; el estallido grande es con el blanco)
      const w = smooth(this.whiteGo || 0);
      // (chico hasta el blanco: en el primer plano de Fierro el mate está al lado de la cámara)
      this.nova.scale.setScalar(1.2 + u * 3 + w * 320);
      this.nova.material.opacity = Math.min(1, (this.novaClose ? 0 : 0.2 + u * 0.2) + w * 0.8);
      this.shake = Math.max(this.shake, 0.2 * u);
    }
  }

  // Las luces del Éter: la dorada de Fierro y la de relleno del amanecer.
  lightsTick(dt, t) {
    const L = this.arena?.lights;
    if (!L) return;
    const fOn = !this.fierro.r.dead;
    const ember = this.col.k > 0 ? 0 : this.hat.visible ? 3 + Math.sin(t * 7) * 0.6 + Math.sin(t * 13) * 0.4 : 0;
    const sup = this.sup.visible ? 6 + (this.supFlare || 0) * 8 : 0;
    const want0 = ember + (this.col.k > 0 ? 6 : 0) + (fOn ? 8 + Math.sin(t * 2.1) * 1.2 : 0) + (this.starK || 0) * 10 + sup + (this.whiteGo || 0) * 10;
    L[0].intensity = lerp(L[0].intensity, want0, Math.min(1, dt * 2.5));
    // (la luz sigue a donde se juntan los rayos y después al mate de los cuatro)
    const at = this.sup.visible ? this.sup.position : this.starK > 0 ? this.S : null;
    if (at) L[0].position.lerp(tmpV.copy(at).add(tmpU.set(0, 0.8, 1.2)), Math.min(1, dt * 2));
    if (L[1]) L[1].intensity = lerp(L[1].intensity, 6 + this.dawn * 8 + (this.whiteGo || 0) * 10, Math.min(1, dt));
  }

  // Se va el blanco y queda todo negro, sin nada (ni el botón de saltar), unos
  // cinco segundos. Mientras, lo del Éter se esconde, la luz del día vuelve a
  // la de antes (los caballeros se ven como siempre en lo oscuro) y el vacío de
  // los caballeros se arma y se compila: al aparecer no traba.
  blackout() {
    const g = this.g;
    this.fadeEl.style.transition = 'none';
    this.fade(true);
    this.whiteEl.style.transition = 'opacity 1.2s';
    this.white(false);
    this.quiet();
    this.cardEl.style.opacity = '0';
    this.skipEl = this.el.querySelector('.mdu-cine__skip');
    if (this.skipEl) this.skipEl.style.visibility = 'hidden';
    this.inVoid = true;
    this.cam = null;
    for (const o of this.root.children) o.visible = false;
    for (const A of [this.people, this.spirit, this.aura]) if (A) A.root.visible = false;
    if (this.D) this.D.root.visible = false;
    if (this.day0 && g.world) {
      g.world.daylight = this.day0.day;
      g.world.dayCur = this.day0.cur;
    }
    this.buildVoid();
    warmScene(g);
    return 5;
  }

  // En negro, uno por uno, del color de cada uno: lo que les dejan los cuatro
  // caballeros (con su voz). El que habla aparece en su forma de caballero de
  // la luz, solo en lo oscuro, con el aire de su elemento, y levanta el mate
  // despacio; al final, los cuatro juntos. Cada frase queda 3 segundos más
  // que antes para leerla.
  knightsWord() {
    const g = this.g;
    this.fade(true);
    if (this.skipEl) this.skipEl.style.visibility = '';
    const fadeEl = this.el.querySelector('.mdu-fcine__fade');
    if (fadeEl) fadeEl.style.transition = `opacity ${WORD_FADE}s`;
    // (el cartel y el título van arriba del negro; el cartel, abajo del caballero)
    this.cardEl.style.zIndex = '3';
    this.titleEl.style.zIndex = '3';
    this.cardEl.style.top = '80%';
    if (!this.void) this.buildVoid();
    this.noFog();
    const au = g.audio;
    // la canción de los caballeros (core/music.js): sigue en la pantalla del
    // final; con ella el coro calla y las campanas bajan
    const scored = g.music?.play('cine-castillo-caballeros', { while: (G) => G.state === 'won' });
    const bus = au.ctx ? au.out({ gain: scored ? 0.55 : 1, reverb: 0.7, bus: au.music }) : null;
    let t = 1.2;
    for (const [i, text] of WORD) {
      // lo que tardaba antes (a la velocidad de la voz) y 3 segundos más para leerla
      const d = Math.max(3.6, text.length * 0.075) + 3;
      if (bus && !scored) this.later(t, () => au.choir(bus, au.now + 0.3, i >= 0 ? [45, 52, 57, [64, 60, 64, 69][i]] : [45, 52, 57, 61, 64], { dur: d + 3, gain: i >= 0 ? 0.03 : 0.045, attack: 2.5, release: 3 }));
      this.later(t, () => this.showKnight(i, d + WORD_FADE + 0.3));
      this.later(t + 0.3, () => {
        this.wordCard(i, text, d);
        if (bus) au.bell(bus, au.now, i >= 0 ? [57, 60, 64, 69][i] : 45, { gain: i >= 0 ? 0.06 : 0.14, dur: 4 });
        if (i >= 0) au.say(text, KNIGHT_VOICE[i], { cine: true });
      });
      // se apaga el caballero y queda un momento en negro antes del siguiente
      this.later(t + 0.3 + d, () => this.fade(true));
      t += 0.3 + d + WORD_FADE + 0.2;
    }
    this.later(t - 1, () => {
      this.cardEl.style.color = '';
      this.cam = null;
      this.hideVoid();
    });
    return t + 0.2;
  }

  // Se apaga el vacío y vuelve la niebla del molino.
  hideVoid() {
    const V = this.void;
    if (!V) return;
    V.root.visible = false;
    V.on = false;
    for (const K of V.knights) {
      K.on = false;
      K.k = 0;
      for (const m of Object.values(K.M)) m.visible = false;
      K.av.group.visible = false;
      K.shell.group.visible = false;
      K.glow.visible = false;
      K.halo.visible = false;
    }
    const W = this.g.weather;
    if (W && V.fog0 != null) W.cur.fog = V.fog0;
    V.fog0 = null;
  }

  noFog() {
    const g = this.g;
    if (g.weather) g.weather.cur.fog = 0;
    if (g.scene.fog) g.scene.fog.density = 0;
  }

  // El vacío donde hablan los caballeros: lejos del molino (arriba, en el
  // cielo), una esfera negra alrededor y los cuatro en su forma de caballero
  // de la luz (el poncho y el brillo de su elemento, como en la visión de
  // Fierro, con el borde de luz del ánima), cada uno con la luz de su mate en
  // la mano. Debajo, un charco de luz de su color y el sello de su elemento.
  buildVoid() {
    const g = this.g;
    const O = new THREE.Vector3(0, 420, 0);
    const root = new THREE.Group();
    root.position.copy(O);
    this.root.add(root);
    // (con profundidad: tapa el cielo y todo lo de afuera)
    const dark = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false }));
    root.add(dark);
    const people = new Avatars(g, null);
    const shells = new Avatars(g, null);
    const T = this.T;
    const knights = KNIGHT_GLOW.map((c, i) => {
      const id = 40 + i;
      const r = { id, name: '', noTag: true, pos: O.clone(), yaw: 0, pitch: 0.05, speed: 0, moving: false };
      people.add(r);
      shells.add(r);
      const av = people.list.get(id);
      for (const m of Object.values(av.M)) {
        m.transparent = true;
        m.opacity = 0;
        m.depthWrite = false;
        if (m.emissive) {
          m.emissive.set(c);
          m.emissiveIntensity = 0.5;
        }
      }
      av.M.poncho.color.set(c);
      if (av.tag) av.tag.visible = false;
      // el borde de luz (el mismo cuerpo, con la luz de ánima)
      const sh = shells.list.get(id);
      sh.tag.visible = false;
      const shK = { value: 0 };
      const shMat = aniMat(T, { color: c, rim: 0xffffff, base: 0.05, rimK: 1.2, edge: 0.01, k: shK, wave: 0 });
      sh.group.traverse((o) => {
        if (o.isMesh) o.material = shMat;
      });
      const K = { r, av, shell: sh, shK, M: av.M, c, k: 0, on: false, lift: 0, el: ELEMENTS[i], rgb: ELEM_RGB[ELEMENTS[i]], boltT: 1 };
      r.poseFn = (P) => {
        if (K.lift <= 0) return;
        const u = smooth(K.lift);
        P.shRp = lerp(P.shRp, -2.85, u);
        P.elR = lerp(P.elR, -0.12, u);
        P.headP = lerp(P.headP, 0.22, u);
      };
      // la luz del mate en la mano y el resplandor de atrás
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      glow.scale.setScalar(0.7);
      this.root.add(glow);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.textures.dot, color: c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      halo.scale.set(3.4, 4.6, 1);
      this.root.add(halo);
      K.glow = glow;
      K.halo = halo;
      // el charco de luz y el cuarto del sello, en el piso de lo oscuro
      K.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: g.textures.dot, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      K.pool.scale.setScalar(4.2);
      root.add(K.pool);
      K.seal = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 40, 1, 0.08, Math.PI / 2 - 0.16).rotateX(-Math.PI / 2), this.addMat(c));
      root.add(K.seal);
      return K;
    });
    // el aro de oro de los cuatro juntos
    const gold = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.42, 96).rotateX(-Math.PI / 2), this.addMat(0xffd27a));
    gold.position.y = 0.02;
    root.add(gold);
    root.visible = false;
    // sin niebla mientras hablan: a esa altura la sombra de la luna no llega y
    // la bruma iluminada (fx/Epic, VolPass) ponía todo el negro gris. (El clima
    // la vuelve a poner cada cuadro: se le cambia el valor de base, como en la
    // entrada del molino.)
    const fog0 = g.weather ? g.weather.cur.fog : null;
    this.void = { root, O, people, shells, knights, row: false, fog0, gold, on: false };
    for (const K of knights) {
      K.av.group.visible = false;
      K.shell.group.visible = false;
    }
  }

  // Aparece el que habla (i: 0-3; -1: los cuatro en fila) y la cámara se le acerca despacio.
  showKnight(i, secs) {
    const V = this.void;
    if (!V) return;
    const O = V.O;
    const row = i < 0;
    V.knights.forEach((K, n) => {
      K.on = row || n === i;
      K.k = 0;
      K.lift = 0;
      K.r.pos.set(O.x + (row ? [-2.4, -0.8, 0.8, 2.4][n] : 0), O.y, O.z + (row ? [0.3, 0, 0, 0.3][n] : 0));
      // (mira a la cámara, un poquito de costado)
      K.r.yaw = row ? [0.12, 0.04, -0.04, -0.12][n] : 0.1;
      K.pool.position.set(K.r.pos.x - O.x, 0.012 + n * 0.001, K.r.pos.z - O.z);
      K.seal.position.set(K.r.pos.x - O.x, 0.02, K.r.pos.z - O.z);
      K.seal.rotation.y = row ? (n / 4) * Math.PI * 2 : 0;
    });
    V.root.visible = true;
    V.on = true;
    V.row = row;
    if (V.fog0 == null && this.g.weather) V.fog0 = this.g.weather.cur.fog;
    this.shot(secs, (u, lt, pos, look) => {
      const k = smooth(u);
      if (row) {
        pos.set(O.x + lerp(-0.6, 0.6, u), O.y + lerp(1.7, 1.55, k), O.z + lerp(8.2, 7, k));
        look.set(O.x, O.y + 1.25, O.z);
      } else {
        pos.set(O.x + lerp(0.9, 0.45, k), O.y + lerp(1.45, 1.6, k), O.z + lerp(4.4, 3.1, k));
        look.set(O.x, O.y + lerp(1.3, 1.45, k), O.z);
      }
    });
    this.fade(false);
  }

  // El cartel de lo que dice: el nombre chiquito arriba y la frase, del color de cada uno.
  wordCard(i, text, secs) {
    const el = this.cardEl;
    el.textContent = '';
    const b = document.createElement('span');
    b.textContent = i >= 0 ? KNIGHT_NAME[i] : 'Los cuatro caballeros';
    b.style.cssText = 'display:block;margin-bottom:.35em;font:600 clamp(11px,1.1vw,14px)/1.2 Georgia,serif;font-style:normal;letter-spacing:.3em;text-transform:uppercase;opacity:.75';
    el.append(b, document.createTextNode(text));
    el.style.color = i >= 0 ? KNIGHT_CSS[i] : '#f3e6c8';
    el.style.opacity = '1';
    this.wordTok = (this.wordTok || 0) + 1;
    const token = this.wordTok;
    this.later(secs, () => {
      if (this.wordTok === token) el.style.opacity = '0';
    });
  }

  // Los caballeros del vacío: aparecen de a poco, levantan el mate y brillan,
  // cada uno con el aire de su elemento alrededor.
  voidTick(dt) {
    const V = this.void;
    if (!V?.on) return;
    const g = this.g;
    const t = this.t;
    this.T.value += dt;
    V.people.update(dt);
    V.shells.update(dt);
    for (const K of V.knights) uprightMate(K.av, smooth(K.lift), K.r.yaw);
    this.noFog();
    let any = 0;
    V.knights.forEach((K, n) => {
      K.k = K.on ? Math.min(1, K.k + dt / 0.8) : Math.max(0, K.k - dt / 0.8);
      if (K.on && K.k > 0.5) K.lift = Math.min(1, K.lift + dt / 3.2);
      const vis = K.k > 0.001;
      any = Math.max(any, K.k);
      for (const m of Object.values(K.M)) {
        m.opacity = K.k * (0.82 + Math.sin(t * 2.3 + n) * 0.06);
        m.visible = vis;
      }
      K.av.group.visible = vis;
      K.shell.group.visible = vis;
      K.shK.value = K.k * (0.9 + Math.sin(t * 1.7 + n) * 0.1);
      K.glow.visible = vis;
      K.halo.visible = vis;
      K.pool.material.opacity = K.k * (V.row ? 0.28 : 0.45) * (0.9 + Math.sin(t * 1.9 + n) * 0.1);
      K.seal.material.opacity = K.k * 0.55;
      K.seal.rotation.y += dt * 0.25;
      if (!vis) return;
      // (la mano recién puesta: la del dibujo se actualiza recién al dibujar)
      K.glow.position.setFromMatrixPosition(K.av.mats[6]);
      K.glow.material.opacity = K.k * (0.35 + K.lift * 0.65) * (0.85 + Math.sin(t * 7 + n) * 0.15);
      K.glow.scale.setScalar(0.5 + K.lift * 0.7);
      K.halo.position.set(K.r.pos.x, K.r.pos.y + 1.2, K.r.pos.z - 0.6);
      K.halo.material.opacity = K.k * (V.row ? 0.22 : 0.32) * (0.9 + Math.sin(t * 1.3 + n) * 0.1) * (1 + (K.zap || 0));
      K.zap = Math.max(0, (K.zap || 0) - dt * 4);
      // chispitas de su color que suben
      if (Math.random() < dt * (V.row ? 5 : 12)) g.fx.sparkle(tmpV.set(K.r.pos.x + rnd() * 1.1, K.r.pos.y + Math.random() * 1.9, K.r.pos.z + rnd() * 0.6), KNIGHT_RGB[n], 1, 0.25);
      this.voidAir(K, dt * K.k * (V.row ? 0.45 : 1));
    });
    V.gold.material.opacity = V.row ? any * 0.6 : 0;
    V.gold.rotation.y += dt * 0.1;
  }

  // El aire de cada elemento alrededor del caballero que habla.
  voidAir(K, dt) {
    const g = this.g;
    const p = K.r.pos;
    const add = g.fx.add;
    const count = (rate) => {
      const n = rate * dt;
      return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    };
    if (K.el === 'fuego') {
      // brasas que suben del piso y lenguas de fuego chiquitas en ronda
      for (let i = count(45); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 2.2;
        add.spawn(p.x + Math.cos(a) * r, p.y + 0.05, p.z + Math.sin(a) * r * 0.7, rnd() * 0.4, 0.8 + Math.random() * 1.8, rnd() * 0.4, { color: [1, 0.35 + Math.random() * 0.35, 0.08], size: 0.045, size1: 0.01, life: 1.4 + Math.random(), drag: 0.3 });
      }
      for (let i = count(7); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        g.fx.fire(tmpV.set(p.x + Math.cos(a) * 1.25, p.y + 0.02, p.z + Math.sin(a) * 1.25 * 0.7), 0.25, 1);
      }
    } else if (K.el === 'viento') {
      // un remolino que gira alrededor (y alguna hojita)
      for (let i = count(40); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * 1.6;
        const s = 3 + Math.random() * 2;
        add.spawn(p.x + Math.cos(a) * r, p.y + 0.1 + Math.random() * 2.2, p.z + Math.sin(a) * r * 0.8, -Math.sin(a) * s, 0.25, Math.cos(a) * s * 0.8, { color: Math.random() < 0.8 ? [0.72, 1, 0.84] : [0.4, 0.8, 0.3], size: 0.035, size1: 0.005, life: 0.9 + Math.random() * 0.5 });
      }
    } else if (K.el === 'rayo') {
      // relámpagos lejos, en lo oscuro, y chispas en el mate
      K.boltT -= dt;
      if (K.boltT <= 0) {
        K.boltT = 0.6 + Math.random() * 1.1;
        const s = Math.random() < 0.5 ? -1 : 1;
        const x = p.x + s * (3.5 + Math.random() * 4);
        g.fx.lightning(tmpV.set(x + rnd() * 2, p.y + 6 + Math.random() * 3, p.z - 7 - Math.random() * 4), tmpW.set(x + rnd() * 3, p.y - 1, p.z - 5 - Math.random() * 3), 0xffe45a, 0.22);
        K.zap = 1;
      }
      if (Math.random() < dt * 14) g.fx.electric?.(K.glow.position, 2);
    } else {
      // nieve que cae despacio y escarcha que brilla en el piso
      for (let i = count(38); i > 0; i--) {
        add.spawn(p.x + rnd() * 6, p.y + 3.5 + Math.random() * 1.5, p.z + rnd() * 3 - 0.5, 0.15 + rnd() * 0.2, -0.55 - Math.random() * 0.3, rnd() * 0.2, { color: [0.85, 0.94, 1], size: 0.035, size1: 0.025, life: 7 });
      }
      for (let i = count(8); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.4 + Math.random() * 1.8;
        add.spawn(p.x + Math.cos(a) * r, p.y + 0.03, p.z + Math.sin(a) * r * 0.7, 0, 0.05, 0, { color: [0.7, 0.9, 1], size: 0.05, size1: 0, life: 0.9 });
      }
    }
  }

  cleanup() {
    const g = this.g;
    this.people?.dispose?.();
    this.people = null;
    this.spirit?.dispose?.();
    this.spirit = null;
    this.aura?.dispose?.();
    this.aura = null;
    for (const Gi of this.giants || []) Gi.people.dispose?.();
    this.giants = [];
    // el dragón vuelve a su material (por si se salteó a la mitad) y a su pose
    for (const [o, m] of this.dSaved || []) o.material = m;
    this.dSaved = null;
    if (this.D && Object.prototype.hasOwnProperty.call(this.D, 'posePoints')) delete this.D.posePoints;
    // las luces del Éter como estaban
    for (const S of this.L || []) {
      S.l.color.copy(S.c);
      S.l.intensity = S.i;
      S.l.position.copy(S.p);
      S.l.distance = S.d;
    }
    this.L = null;
    if (this.day0 && g.world) {
      g.world.daylight = this.day0.day;
      g.world.dayCur = this.day0.cur;
      this.day0 = null;
    }
    for (const Fr of this.frags || []) if (Fr.rim && Fr.rim0) Fr.rim.uniforms.uColor.value.copy(Fr.rim0);
    if (this.void) {
      this.hideVoid();
      this.void.people.dispose?.();
      this.void.shells.dispose?.();
      for (const K of this.void.knights) {
        K.glow.removeFromParent();
        K.halo.removeFromParent();
      }
      this.void.root.removeFromParent();
      this.void = null;
    }
  }

  finish() {
    const g = this.g;
    if (this.done) return;
    // el menú del final es el del castillo (el mapa que se ganó)
    g.mapId = 'castillo';
    useMap('castillo');
    super.finish();
  }
}

// lo que les dicen los cuatro caballeros al final, en negro (-1: los cuatro)
const KNIGHT_CSS = ['#ff9a5a', '#9affc4', '#ffe870', '#a8e2ff'];
const KNIGHT_NAME = ['El Caballero del Fuego', 'El Caballero del Viento', 'El Caballero del Rayo', 'El Caballero del Hielo'];
const KNIGHT_RGB = ELEMENTS.map((el) => ELEM_RGB[el]);
// (segundos del fundido de cada caballero)
const WORD_FADE = 0.8;
const KNIGHT_VOICE = ['caballeroFuego', 'caballeroViento', 'caballeroRayo', 'caballeroHielo'];
const WORD = [
  [0, 'Aunque no te acuerdes de nada, el fuego sigue prendido adentro tuyo.'],
  [1, 'Seguí para adelante, aunque el viento sople en contra.'],
  [2, 'Y si tenés miedo, hacé ruido. Que el trueno sea tuyo.'],
  [3, 'Aguantá firme. El que aguanta, gana.'],
  [-1, 'Mientras alguien le cebe un mate a otro, la luz no se apaga.'],
];

const LINES = [
  'Lo lograron, paisanos. Lo lograron.',
  'Pero al Chiquitijuein no se lo mata. Se esconde donde nadie lo puede sacar... en la memoria.',
  'Por eso este universo tiene que empezar de nuevo.',
  'Van a olvidar lo que pasó. Pero van a vivir como leyendas que nadie conoce.',
  'Y él va a ser un recuerdo. Uno que todos tienen... pero que nadie entiende de dónde viene.',
  'Ustedes ya fueron caballeros una vez, hace mucho. Por eso los mates de la luz los reconocieron.',
  'Y cuando la historia vuelva a necesitarlos...',
  'Nosotros, los cuatro caballeros, nos alzaremos una vez más.',
  'Hasta la próxima, paisanos.',
];

// lo que nombra Fierro, de a uno, con la toma de cada cosa (worldsMontage)
const WORLDS = [
  ['El molino,', 'molino'],
  ['la tapera,', 'tapera'],
  ['el penal,', 'penal'],
  ['la torre,', 'torre'],
  ['el estero...', 'esteros'],
  ['este castillo.', 'castillo'],
  ['Todo.', 'todo'],
];
