import * as THREE from 'three';
import { EE, ZONES } from '../config/map';
import { mesh, boxGeo, cylGeo } from './props';
import Encierro, { missingText } from '../entities/Encierro';
import { Pickup } from '../entities/eclipse/common';
import { maxAlive } from '../config/rules';
import { eclSfx } from '../fx/eclipseSfx';

// El paso I del Pack-a-Pava de Eclipse Matero, nuevo (2026-10-10). El usuario:
// "cambiá el 1er paso a 1 grieta en el molino, otra en la tapera, otra mate of
// the dead y otra en la torre. Son fáciles de distinguir (a diferencia del
// diseño actual que no se entiende). Al abrirlas llevan a una isla flotante
// chiquita de la dimensión oscura con pedazos del mapa original. En esta hay que
// aguantar un encierro de 30 segundos. Hacerla expulsa al jugador de la grieta y
// con una animación vistosa la grieta se cose y dropea un objeto significativo
// de ese mapa. Al ir a la zona del medio al lado del portal, habrá 4 pilares, al
// colocar los 4 objetos, se abre la disformidad y se sigue al paso 2."
//
// Cada grieta (config EE.grietas) pasa por:
//  0 cerrada: un tajo fino que late en el aire, en su mapa. Mantener F la abre;
//    tienen que estar todos los que están de pie a NEAR_R m (regla de los encierros).
//  1 abriéndose: se abre de golpe y a OPEN_T s se traga a los que están cerca
//    (el viaje de los portales, world/eclipsePortals begin) a su jirón
//    (world/eclipse/grietas.js).
//  2 el encierro: SECS segundos (corren mientras haya alguien de pie adentro);
//    los muertos salen del piso del jirón (entities/Encierro spawn) y la ronda
//    espera. Si adentro no queda nadie, la grieta los escupe y vuelve a 0.
//  3 ganado: la grieta de adentro se abre y los saca; en el mapa, la grieta se
//    cose de abajo hacia arriba con hilo de oro (once puntadas) y al cerrarse
//    suelta su objeto.
//  4 el objeto en el piso · 5 lo tiene el equipo (no se pierde) · 6 en su pilar.
// Los cuatro objetos son lo que despertó al Pack-a-Pava en cada mapa: la pavita
// del Molino, la tapa de La Tapera, las llaves del Penal y la garrafa de la
// Torre. Los pilares están en El Nudo, alrededor del portal negro
// (EE.grietas[].pilar; la piedra la arma world/eclipse/grietas.js buildPilares): arriba de
// cada uno flota la sombra de lo que le falta y su cartel dice dónde está su
// grieta. Con los cuatro puestos, el portal negro se abre (EE.desgarroPortal).
//
// En línea decide el anfitrión; todo viaja por 'papq' con `gr` (la grieta):
// eventos { gr, a: 'go' | 'in' | 'win' | 'fail' | 'take' | 'put' }, pedidos de
// los invitados { gr, q: 'go' | 'take' | 'put' } y el estado entero { gr: [..] }.
// Lo arma world/papDesgarro.js. globalThis.__mduOldPapGrietas === true (al
// cargar): las tres cicatrices del claro, como antes.

const SECS = 30;
const OPEN_T = 1.3;
// a los cuántos segundos de puesto el cuarto objeto revienta el portal negro
const OPEN_AT = 2.0;
const TRIP_T = 1.5;
const SEW_WAIT = 2.0;
// (lo que crece el sonido del cosido, fx/eclipseSfx portal-cose: 3,9 s y se corta)
const SEW_T = 3.9;
// los sonidos grabados de los portales (con __mduOldPortalSfx, los sintetizados)
const OLD_SFX = () => globalThis.__mduOldPortalSfx === true;
const STITCHES = 11;
const NEAR_R = 9;
const PULL_R = 16;
const RIFT_W = 3.6;
const RIFT_H = 5.4;
// el plato de los pilares del Nudo (world/eclipse/grietas.js PILAR_TOP)
const PIL_TOP = 1.26;
// lo de arriba de los pilares se dibuja solo a menos de esto (metros)
const PIL_SEE = 70;
// a cuánto de la grieta sale el que vuelve del jirón (m)
const OUT_D = 3.6;

// (nom: cómo se lo nombra; de: de dónde es)
const ITEMS = {
  pavita: { nom: 'la pavita', de: 'del Molino', col: 0xffc27a },
  tapa: { nom: 'la tapa', de: 'de La Tapera', col: 0xff9a5a },
  llaves: { nom: 'las llaves', de: 'del Penal', col: 0x9ae0b0, pl: true },
  garrafa: { nom: 'la garrafa', de: 'de la Torre', col: 0xffd060 },
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// La grieta: un tajo quebrado. uOpen 0: una rendija que late; 1: la boca abierta
// al vacío violeta. uSew 0-1: el cosido sube; lo cosido queda cerrado con sus
// puntadas de oro. uScar 0-1: ya cosida, se apaga a una cicatriz con el hilo.
const FRAG = /* glsl */ `
  uniform float uTime, uOpen, uSew, uScar, uFlash, uSeed, uDim;
  uniform vec3 uTint;
  varying vec2 vUv;
  float h1(float n) { return fract(sin(n * 127.1 + uSeed * 31.7) * 43758.5453); }
  float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.0) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  // la espina quebrada del tajo, a la altura y
  float spineAt(float y) { return ((n1(y * 3.4 + 7.0) - 0.5) * 0.3 + (n1(y * 8.5 + 3.0) - 0.5) * 0.1) * pow(max(1.0 - y * y, 0.0), 0.62); }
  void main() {
    // (x en ±1 = ±1,8 m; y en ±1 = ±2,7 m)
    vec2 p = (vUv - 0.5) * 2.0;
    float y = p.y;
    float env = pow(max(1.0 - y * y, 0.0), 0.62);
    float x = p.x - spineAt(y);
    float beat = 0.5 + 0.5 * sin(uTime * 2.6 + uSeed * 6.0);
    float jag = (n1(y * 13.0 + uTime * 0.6) - 0.5) * 0.05;
    float hw = mix(0.085 + 0.03 * beat + jag * 0.6, 0.5 + jag + 0.03 * sin(uTime * 3.1 + y * 5.0), uOpen) * env;
    // el cosido: de abajo hacia arriba
    float front = -1.06 + 2.12 * uSew;
    float sewOn = step(0.0005, uSew);
    float sewing = sewOn * (1.0 - step(0.999, uSew));
    float sewn = smoothstep(front + 0.1, front - 0.04, y) * sewOn;
    hw *= 1.0 - sewn * 0.99;
    // (justo arriba de la aguja, los labios se juntan)
    hw *= 1.0 - 0.45 * sewing * exp(-max(y - front, 0.0) * 5.0);
    float d = abs(x) - hw;
    float inside = 1.0 - smoothstep(-0.012, 0.0, d);
    float edge = exp(-abs(d) * 44.0);
    float halo = exp(-max(d, 0.0) * 6.5) * env;
    // adentro: el vacío de la dimensión (negro, con su nube y sus estrellas)
    vec2 m = vec2(x * 1.8, y * 2.7);
    float neb = n2(m * 1.3 + vec2(uTime * 0.07, -uTime * 0.11)) * n2(m * 2.9 - vec2(uTime * 0.05, uTime * 0.09));
    vec2 sg = m / 0.13;
    vec2 sc = floor(sg);
    float tw = 0.5 + 0.5 * sin(uTime * 3.0 + h2(sc + 3.0) * 40.0);
    float star = step(0.955, h2(sc)) * smoothstep(0.3, 0.05, length(fract(sg) - 0.5 - (vec2(h2(sc + 7.0), h2(sc + 11.0)) - 0.5) * 0.4)) * tw;
    vec3 inner = vec3(0.006, 0.0, 0.016) + vec3(0.3, 0.06, 0.62) * neb * 0.55 + vec3(0.9, 0.8, 1.0) * star * 0.75;
    inner += vec3(0.5, 0.16, 0.95) * exp(d * 14.0) * 0.45;
    float live = 1.0 - 0.75 * uScar;
    vec3 rim = vec3(0.95, 0.5, 1.7) * edge * live;
    vec3 glow = mix(vec3(0.5, 0.14, 1.05), uTint, 0.3) * halo * (0.3 + 0.18 * beat + 0.12 * uOpen) * (1.0 - 0.92 * uScar);
    vec3 col = (inner * inside + rim + glow * (1.0 - inside)) * uDim;
    // las puntadas: cruces de hilo de oro, una cada tanto, de abajo hacia arriba
    float fk = clamp(floor((y + 0.92) / 1.84 * NST + 0.5), 0.0, NST);
    float yk = -0.92 + 1.84 * fk / NST;
    vec2 l = vec2(p.x - spineAt(yk), (y - yk) * 1.5);
    float sd = min(seg(l, vec2(-0.085, -0.065), vec2(0.085, 0.065)), seg(l, vec2(-0.085, 0.065), vec2(0.085, -0.065)));
    float done = step(yk, front) * sewOn;
    // (recién hecha, la puntada brilla un momento)
    float pop = exp(-max(front - yk, 0.0) * 9.0) * sewing;
    float thread = smoothstep(0.014, 0.005, sd) * done;
    float tglow = exp(-sd * 30.0) * done;
    vec3 gold = vec3(1.0, 0.72, 0.22);
    col += gold * (thread * (0.34 + 0.4 * live + 0.5 * pop) + tglow * (0.05 + 0.1 * live + 0.3 * pop));
    // el hilo: de la última puntada a la aguja, y la aguja (una chispa)
    vec2 nl = vec2(p.x - spineAt(front), (y - front) * 1.5);
    float nd = length(nl);
    float lead = smoothstep(0.012, 0.004, abs(p.x - spineAt(y))) * step(yk - 0.02, y) * step(y, front) * done;
    col += gold * lead * 0.55 * sewing;
    col += vec3(1.25, 1.05, 0.7) * exp(-nd * 22.0) * sewing;
    col *= 1.0 + uFlash * 1.4;
    col += vec3(0.8, 0.6, 1.0) * uFlash * halo * 0.7 * uDim;
    float a = clamp(inside + thread * 0.9, 0.0, 1.0);
    if (max(a, max(col.r, max(col.g, col.b))) < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`.replace(/NST/g, (STITCHES - 1).toFixed(1));
// el resplandor en el piso, al pie
const FRAG_POOL = /* glsl */ `
  uniform float uTime, uK, uSeed;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float rays = 0.6 + 0.4 * sin(a * 7.0 + uSeed * 9.0 + sin(uTime * 0.7) * 1.5) * sin(a * 3.0 - uTime * 0.4);
    float g = exp(-r * 3.4) * 0.5 + exp(-r * 1.6) * 0.2 * rays;
    g *= smoothstep(1.0, 0.7, r) * uK * (0.8 + 0.2 * sin(uTime * 2.6 + uSeed * 6.0));
    if (g < 0.004) discard;
    gl_FragColor = vec4(mix(vec3(0.5, 0.15, 1.05), uTint, 0.3) * g, 0.0);
  }
`;
const PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false, toneMapped: false };
const backOut = (k) => {
  const c = 1.9;
  const q = k - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};
const smooth = (k) => k * k * (3 - 2 * k);
const tmpV = new THREE.Vector3();

export default class PapGrietas {
  constructor(T) {
    this.T = T;
    this.q = T.q;
    this.g = T.g;
    const g = this.g;
    const w = g.world;
    this.root = new THREE.Group();
    this.root.name = 'papGrietas';
    g.scene.add(this.root);
    this.time = { value: 0 };
    this.geo = new THREE.PlaneGeometry(RIFT_W, RIFT_H).translate(0, RIFT_H / 2 + 0.12, 0);
    this.poolGeo = new THREE.PlaneGeometry(6.4, 6.4).rotateX(-Math.PI / 2);
    this.ghostMats = [];
    this.busyHint = 0;
    this.openT = -1;
    this.warm = [];
    // lo de arriba de los pilares (la sombra de cada objeto, el objeto puesto,
    // el aro), todo junto: lejos de El Nudo no se dibuja. Desde el Claro, a 190
    // m, eran ~30 dibujos por cuadro de cosas de dos píxeles (medido, Épica
    // 1440p). globalThis.__mduPilaresLejos: como antes
    this.pilG = new THREE.Group();
    this.root.add(this.pilG);
    this.warm.push(this.pilG);
    this.rifts = (EE.grietas || []).map((G, i) => this.buildRift(G, i));
    this.pilC = new THREE.Vector3();
    for (const R of this.rifts) this.pilC.addScaledVector(R.pil, 1 / this.rifts.length);
    (w.warmHidden ||= []).push(...this.warm);
    for (const R of this.rifts) this.paint(R, true);
    // el portal negro: adónde van los rayos cuando se completan los pilares
    this.bake();
    if (!OLD_SFX()) eclSfx(g).load(['portal-cose', 'portal-caos-abre']);
    this.checkT = 0;
  }

  // ---------------- armado ----------------
  riftMesh(seed, tint) {
    const U = { uTime: this.time, uOpen: { value: 0 }, uSew: { value: 0 }, uScar: { value: 0 }, uFlash: { value: 0 }, uSeed: { value: seed }, uTint: { value: new THREE.Color(tint) }, uDim: { value: 1 } };
    const m = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, side: THREE.DoubleSide, ...PREMUL }));
    m.renderOrder = 6;
    m.frustumCulled = true;
    const PU = { uTime: this.time, uK: { value: 1 }, uSeed: { value: seed }, uTint: U.uTint };
    const pool = new THREE.Mesh(this.poolGeo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_POOL, uniforms: PU, ...PREMUL, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    pool.renderOrder = 5;
    return { mesh: m, U, pool, PU };
  }

  buildRift(G, i) {
    const g = this.g;
    const w = g.world;
    const I = ITEMS[G.item];
    const Z = ZONES[G.zone];
    const [ax, az] = G.at;
    const ay = w.floorAt(ax, az, G.y != null ? G.y + 1 : undefined);
    const fl = Math.hypot(G.face[0], G.face[1]) || 1;
    const face = [G.face[0] / fl, G.face[1] / fl];
    const ll = Math.hypot(G.look[0], G.look[1]) || 1;
    const look = [G.look[0] / ll, G.look[1] / ll];
    const iy = Z.y;
    // la caja en planta de su jirón
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of Z.rects) {
      box[0] = Math.min(box[0], r[0]);
      box[1] = Math.min(box[1], r[1]);
      box[2] = Math.max(box[2], r[2]);
      box[3] = Math.max(box[3], r[3]);
    }
    const col = new THREE.Color(0x9a50ff);
    const R = {
      i,
      G,
      I,
      box,
      st: 0,
      t: 0,
      k: 0,
      emptyT: 0,
      at: new THREE.Vector3(ax, ay, az),
      // las puntas del viaje (lo que pide world/eclipsePortals begin/cross)
      mapEnd: { col, kick: 0, pos: new THREE.Vector3(ax, ay, az), face },
      // (el que vuelve sale a OUT_D m de la grieta, mirándola coserse)
      outEnd: { col, kick: 0, pos: new THREE.Vector3(ax + face[0] * (OUT_D + 1.5), ay, az + face[1] * (OUT_D + 1.5)), face: [-face[0], -face[1]] },
      isleEnd: { col, kick: 0, pos: new THREE.Vector3(G.land[0] - look[0] * 1.5, iy, G.land[1] - look[1] * 1.5), face: look },
    };
    // la grieta del mapa y la de adentro del jirón
    const A = this.riftMesh(0.13 + i * 0.21, I.col);
    A.mesh.position.copy(R.at);
    A.pool.position.set(ax, ay + 0.03, az);
    const B = this.riftMesh(0.57 + i * 0.17, I.col);
    B.mesh.position.copy(R.isleEnd.pos);
    B.pool.position.set(R.isleEnd.pos.x, iy + 0.05, R.isleEnd.pos.z);
    B.mesh.scale.setScalar(0.8);
    B.pool.scale.setScalar(0.7);
    this.root.add(A.mesh, A.pool, B.mesh, B.pool);
    R.A = A;
    R.B = B;
    // el objeto: cae a 1,7 m de la grieta, del lado por el que se sale
    const drop = new THREE.Vector3(ax + face[0] * 1.7, ay, az + face[1] * 1.7);
    drop.y = w.floorAt(drop.x, drop.z, ay + 1);
    R.drop = drop;
    R.pick = new Pickup(g, this.itemMesh(G.item, 1.9), drop, { radius: 2, text: `agarrar ${I.nom}`, col: I.col });
    R.pick.onTake = () => this.ask(i, 'take');
    // (lo que aparece de golpe —el objeto, el que queda en el pilar, la grieta de
    // adentro—: que la llegada lo deje compilado, ui/Arrival warmWorld)
    this.warm.push(R.pick.obj, B.mesh, B.pool);
    R.popT = -1;
    // el encierro del jirón (sin puertas: solo de dónde salen los muertos)
    R.enc = new Encierro(g, { zone: G.zone, color: 0x9a50ff, place: Z.name });
    // la grieta: mantener F
    R.it = g.interact.add({
      kind: 'grieta',
      pos: new THREE.Vector3(ax, ay + 1.1, az),
      radius: 3.2,
      wide: true,
      holdTime: 1.2,
      prompt: () => this.riftPrompt(R),
      cost: () => 0,
      use: () => this.riftUse(R),
    });
    // su pilar, en El Nudo
    const [px, pz] = G.pilar;
    const py = w.floorAt(px, pz);
    R.pil = new THREE.Vector3(px, py, pz);
    R.ghost = this.itemMesh(G.item, 1.5, I.col);
    R.ghost.position.set(px, py + PIL_TOP + 0.2, pz);
    R.placed = this.itemMesh(G.item, 1.5);
    R.placed.position.set(px, py + PIL_TOP + 0.12, pz);
    R.placed.visible = false;
    this.warm.push(R.placed);
    // el aro del pilar: apagado mientras falta, prendido con el objeto puesto
    R.ringMat = new THREE.MeshBasicMaterial({ color: I.col, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
    R.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.028, 6, 28).rotateX(Math.PI / 2), R.ringMat);
    R.ring.position.set(px, py + PIL_TOP + 0.05, pz);
    this.pilG.add(R.ghost, R.placed, R.ring);
    R.pit = g.interact.add({
      kind: 'grieta-pilar',
      pos: new THREE.Vector3(px, py + 1.1, pz),
      radius: 2.1,
      wide: true,
      prompt: () => this.pilarPrompt(R),
      cost: () => 0,
      use: () => this.pilarUse(R),
    });
    return R;
  }

  // Los cuatro objetos (s: escala; ghost: color de la sombra que flota en el pilar).
  itemMesh(kind, s = 1, ghost = null) {
    const M = this.q.M;
    const grp = new THREE.Group();
    const steel = (this.matSteel ||= new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.32, metalness: 0.85, emissive: 0x30343c, emissiveIntensity: 0.5 }));
    const gold = (this.matGold ||= new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3, emissive: 0xffb030, emissiveIntensity: 0.7 }));
    const paint = (this.matPaint ||= new THREE.MeshStandardMaterial({ color: 0xd8641c, roughness: 0.45, metalness: 0.25, emissive: 0x5a2206, emissiveIntensity: 0.6 }));
    if (kind === 'pavita') {
      const k = this.q.smallKettle();
      k.scale.setScalar(1.25);
      grp.add(k);
    } else if (kind === 'tapa') {
      // la tapa del Pack-a-Pava: el plato, el borde y la perilla
      const t = new THREE.Group();
      t.add(mesh(cylGeo(0.2, 0.22, 0.03, 20), steel, 0, 0, 0));
      t.add(mesh(new THREE.SphereGeometry(0.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1), steel, 0, 0.012, 0));
      t.add(mesh(cylGeo(0.018, 0.024, 0.05, 10), M.iron, 0, 0.09, 0));
      t.add(mesh(new THREE.SphereGeometry(0.034, 12, 8), M.woodDark || M.iron, 0, 0.13, 0));
      // (de canto, que girando se vea el plato)
      t.rotation.x = 1.05;
      t.position.y = 0.2;
      grp.add(t);
    } else if (kind === 'llaves') {
      // el manojo de llaves del guardia: la argolla y tres llaves
      const r = new THREE.Group();
      r.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16), gold));
      for (let k = 0; k < 3; k++) {
        const key = new THREE.Group();
        key.rotation.z = (k - 1) * 0.5;
        key.add(mesh(boxGeo(0.012, 0.13, 0.006), gold, 0, -0.12, 0));
        key.add(mesh(boxGeo(0.03, 0.012, 0.006), gold, 0.012, -0.17, 0));
        key.add(mesh(boxGeo(0.022, 0.012, 0.006), gold, 0.009, -0.145, 0));
        key.add(mesh(cylGeo(0.022, 0.022, 0.008, 10), gold, 0, -0.06, 0, Math.PI / 2, 0, 0));
        r.add(key);
      }
      r.scale.setScalar(1.7);
      r.position.y = 0.33;
      grp.add(r);
    } else {
      // la garrafa (naranja, con su válvula)
      const b = new THREE.Group();
      b.add(mesh(cylGeo(0.17, 0.17, 0.42, 16), paint, 0, 0.25, 0));
      b.add(mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), paint, 0, 0.46, 0));
      b.add(mesh(cylGeo(0.15, 0.15, 0.05, 16), M.iron, 0, 0.025, 0));
      b.add(mesh(cylGeo(0.04, 0.05, 0.08, 8), M.brass || gold, 0, 0.6, 0));
      b.add(mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), M.iron, 0, 0.6, 0, Math.PI / 2, 0, 0));
      b.scale.setScalar(0.62);
      grp.add(b);
    }
    grp.scale.setScalar(s);
    grp.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      if (ghost != null) {
        // (la sombra: un solo material por color, sin profundidad)
        const m = new THREE.MeshBasicMaterial({ color: ghost, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
        this.ghostMats.push(m);
        o.material = m;
      }
    });
    return grp;
  }

  bake() {
    const a = this.g.audio;
    if (!a?.ctx || !a.bakeSound) return;
    // el zumbido de una grieta cerrada: dos latidos graves en 4 s (lazo)
    a.bakeSound('gr-zumbido', 4, function (o, t) {
      for (let k = 0; k < 2; k++) {
        const t0 = t + k * 2;
        this.tone(o, { t: t0, dur: 1.9, type: 'sine', freq: 58, freqEnd: 51, gain: 0.5, attack: 0.5 });
        this.tone(o, { t: t0, dur: 1.9, type: 'sawtooth', freq: 116.5, freqEnd: 109, gain: 0.06, attack: 0.6 });
        this.noise(o, { t: t0 + 0.1, dur: 1.6, type: 'bandpass', freq: 2400, freqEnd: 900, q: 9, gain: 0.07, attack: 0.5 });
      }
    });
    // una puntada: el tirón del hilo
    a.bakeSound('gr-puntada', 0.5, function (o, t) {
      this.tone(o, { t, dur: 0.16, type: 'triangle', freq: 1320, freqEnd: 1980, gain: 0.3, attack: 0.003 });
      this.noise(o, { t, dur: 0.09, type: 'highpass', freq: 3200, q: 0.8, gain: 0.22, attack: 0.002 });
      this.tone(o, { t: t + 0.03, dur: 0.4, type: 'sine', freq: 660, freqEnd: 640, gain: 0.1, attack: 0.01 });
    }, 3);
    // la grieta se cierra: el golpe sordo y un acorde que queda
    a.bakeSound('gr-cierre', 2.4, function (o, t) {
      this.tone(o, { t, dur: 1.6, type: 'sine', freq: 92, freqEnd: 38, gain: 0.9, attack: 0.005 });
      this.noise(o, { t, dur: 0.5, type: 'lowpass', freq: 900, freqEnd: 120, q: 0.7, gain: 0.5, attack: 0.004, brown: true });
      for (const [f, d] of [[523.25, 0], [659.25, 0.07], [783.99, 0.14], [1046.5, 0.22]]) this.tone(o, { t: t + 0.12 + d, dur: 1.8, type: 'sine', freq: f, gain: 0.14, attack: 0.02 });
    });
    // la grieta se abre: el desgarrón
    a.bakeSound('gr-abre', 1.8, function (o, t) {
      this.noise(o, { t, dur: 1.1, type: 'bandpass', freq: 300, freqEnd: 3400, q: 2.5, gain: 0.6, attack: 0.02 });
      this.tone(o, { t, dur: 1.5, type: 'sawtooth', freq: 180, freqEnd: 44, gain: 0.35, attack: 0.01 });
      this.tone(o, { t: t + 0.5, dur: 1.2, type: 'sine', freq: 62, freqEnd: 40, gain: 0.7, attack: 0.05 });
    });
  }

  play(key, pos = null, gain = 1) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.(key);
    if (buf) a.playBuffer(buf, { pos, gain, reverb: 0.35, ref: pos ? 5 : undefined });
  }

  // ---------------- quién está dónde ----------------
  // todos los que juegan: [{ id, name, pos, up (de pie), dead }]
  crew() {
    const g = this.g;
    const P = g.player;
    const out = [{ me: true, name: 'vos', pos: P.pos, up: !!P.alive && !P.downed, dead: !P.alive }];
    if (g.net?.remote) for (const [id, r] of g.net.remote) if (r.pos) out.push({ me: false, name: r.name || g.net.nameOf?.(id) || 'un compañero', pos: r.pos, up: !r.dead && !r.downed, dead: !!r.dead });
    return out;
  }

  // ¿en el jirón de esta grieta? (por su caja: el que salta o el muerto que
  // todavía está saliendo del piso no tienen zona un momento)
  inZone(p, R, y = p.y) {
    const [x0, z0, x1, z1] = R.box;
    return p.x > x0 - 1.5 && p.x < x1 + 2.5 && p.z > z0 - 1.5 && p.z < z1 + 2.5 && y > R.isleEnd.pos.y - 4 && y < R.isleEnd.pos.y + 9;
  }

  busy() {
    return this.rifts.some((R) => R.st >= 1 && R.st <= 3);
  }

  done() {
    return this.rifts.length > 0 && this.rifts.every((R) => R.st === 6);
  }

  placedN() {
    return this.rifts.filter((R) => R.st === 6).length;
  }

  // ---------------- los carteles ----------------
  // (por qué no se puede abrir ahora, o null)
  blocked(R) {
    const g = this.g;
    if (g.ee?.scene || g.cine || g.intro?.active || g.ee?.holding || g.ee?.arena?.active || g.defense?.holding) return 'Ahora no';
    if (this.busy()) return 'Hay otra grieta abierta';
    const C = this.crew();
    if (C.some((c) => !c.dead && !c.up)) return 'Primero levantá al caído';
    const miss = C.filter((c) => c.up && (Math.hypot(c.pos.x - R.at.x, c.pos.z - R.at.z) > NEAR_R || Math.abs(c.pos.y - R.at.y) > 4)).map((c) => c.name);
    if (miss.length) return missingText(miss, 'la grieta');
    return null;
  }

  riftPrompt(R) {
    if (R.st !== 0 || this.q.done) return null;
    const why = this.blocked(R);
    if (why) return { text: why, noCost: true, info: true };
    return { text: 'abrir la grieta (encierro)', noCost: true, hold: true };
  }

  riftUse(R) {
    if (R.st !== 0 || this.q.done || this.blocked(R)) return false;
    this.ask(R.i, 'go');
    return true;
  }

  pilarPrompt(R) {
    if (R.st === 6) return null;
    const I = R.I;
    if (R.st === 5) return { text: `poner ${I.nom}`, noCost: true };
    if (R.st === 4) return { text: `Falta${I.pl ? 'n' : ''} ${I.nom}. Quedó${I.pl ? 'aron' : ''} en ${R.G.lugar}`.replace('Quedóaron', 'Quedaron'), noCost: true, info: true };
    return { text: `Falta${I.pl ? 'n' : ''} ${I.nom}. Su grieta: ${R.G.lugar}`, noCost: true, info: true };
  }

  pilarUse(R) {
    if (R.st !== 5) return false;
    this.ask(R.i, 'put');
    return true;
  }

  // Qué falta y dónde (lo dice Fierro): lo que está más cerca de terminarse.
  hint() {
    const R = this.rifts.find((r) => r.st === 5) || this.rifts.find((r) => r.st === 4) || this.rifts.find((r) => r.st < 4);
    if (!R) return '';
    const I = R.I;
    if (R.st === 5) return `Llevá ${I.nom} ${I.de} a su pilar del Nudo, junto al portal negro.`;
    if (R.st === 4) return `${I.nom[0].toUpperCase()}${I.nom.slice(1)} ${I.pl ? 'quedaron' : 'quedó'} donde se cosió su grieta: ${R.G.lugar}.`;
    return `Hay una grieta en ${R.G.lugar}. Abrila, aguantá adentro y llevá lo que suelte a los pilares del Nudo.`;
  }

  // ---------------- la red ----------------
  // (cualquiera) pide; el anfitrión decide y avisa a todos
  ask(i, q) {
    const g = this.g;
    if (g.net?.guest) g.net.net.send({ t: 'papq', gr: i, q });
    else this.decide(i, q);
  }

  emit(m) {
    this.g.net?.event('papq', m);
    this.apply(m);
  }

  // (anfitrión)
  decide(i, q) {
    const R = this.rifts[i];
    if (!R || this.q.done) return;
    if (q === 'go' && R.st === 0 && !this.blocked(R)) this.emit({ gr: i, a: 'go' });
    else if (q === 'take' && R.st === 4) this.emit({ gr: i, a: 'take' });
    else if (q === 'put' && R.st === 5) this.emit({ gr: i, a: 'put' });
  }

  onGuest(m) {
    if (typeof m.gr === 'number' && m.q) this.decide(m.gr, m.q);
  }

  state() {
    return this.rifts.map((R) => R.st);
  }

  // m.gr: un número (un evento, con m.a) o la lista entera (el que entra tarde)
  apply(m, quiet = false) {
    if (Array.isArray(m.gr)) {
      m.gr.forEach((st, i) => {
        const R = this.rifts[i];
        // (lo que estaba a mitad: abriéndose, como cerrada; cosiéndose, ya con el objeto en el piso)
        if (R) this.setState(R, st === 1 ? 0 : st === 3 ? 4 : st, true);
      });
      return;
    }
    const R = this.rifts[m.gr];
    if (!R || !m.a) return;
    if (m.a === 'go' && R.st === 0) this.setState(R, 1, quiet);
    else if (m.a === 'in' && R.st === 1) this.setState(R, 2, quiet);
    else if (m.a === 'win' && R.st === 2) this.setState(R, 3, quiet);
    else if (m.a === 'fail' && (R.st === 2 || R.st === 1)) this.fail(R);
    else if (m.a === 'take' && R.st === 4) this.setState(R, 5, quiet);
    else if (m.a === 'put' && R.st === 5) this.setState(R, 6, quiet);
  }

  // ---------------- los cambios de estado ----------------
  setState(R, st, quiet = false) {
    const g = this.g;
    const was = R.st;
    R.st = st;
    R.t = 0;
    const I = R.I;
    if (st === 0) {
      R.k = 0;
      R.pulled = R.pushed = R.cleaned = R.swept = false;
    } else if (st === 1) {
      R.pulled = false;
      R.k = 0;
      R.A.U.uFlash.value = 1;
      if (!quiet) {
        if (OLD_SFX() || !eclSfx(g).has('portal-caos-abre')) this.play('gr-abre', R.at, 1.1);
        // (el rugido del portal negro, desde donde ya ruge; suena en la grieta:
        // al que se traga lo deja atrás)
        else eclSfx(g).play('portal-caos-abre', { pos: R.at.clone().setY(R.at.y + 2), gain: 0.75, reverb: 0.2, ref: 7, offset: 1.7 });
        if (g.camera.position.distanceTo(R.at) < 16) {
          g.post?.flash?.(0.1);
          g.fx.addShake?.(0.35);
        }
      }
    } else if (st === 2) {
      R.k = 0;
      R.emptyT = 0;
      R.swept = false;
      R.enc.spawnT = 1.6;
      if (!quiet && this.inZone(g.player.pos, R)) {
        g.hud?.location?.(ZONES[R.G.zone].name, ZONES[R.G.zone].sub || '');
        g.hud?.subtitle?.(`Aguantá ${SECS} s.`, 3);
        g.audio?.bossArrive?.();
      }
    } else if (st === 3) {
      R.pushed = R.cleaned = false;
      R.stitch = 0;
      R.sewRec = false;
      R.B.U.uFlash.value = 1;
      if (!quiet && this.inZone(g.player.pos, R)) g.hud?.setHint?.('');
    } else if (st === 4) {
      R.pick.show(true);
      R.popT = quiet || was !== 3 ? -1 : 0;
    } else if (st === 5) {
      R.pick.take();
      if (!quiet) {
        g.audio?.pickup?.();
        g.hud?.subtitle?.(`Tienen ${I.nom} ${I.de}. A su pilar del Nudo, junto al portal negro.`, 4.5);
      }
    } else if (st === 6) {
      R.pick.take();
      R.placed.visible = true;
      R.ghost.visible = false;
      if (!quiet) {
        g.fx.sparkle?.(tmpV.copy(R.pil).setY(R.pil.y + 1.5), [1, 0.8, 1], 16, 0.7);
        this.play('gr-puntada', R.pil, 1.2);
        const left = this.rifts.length - this.placedN();
        g.hud?.subtitle?.(left ? `${I.nom[0].toUpperCase()}${I.nom.slice(1)}, en su pilar. Falta${left > 1 ? 'n' : ''} ${left}.` : 'Los cuatro en su pilar. El portal negro se abre.', 4);
      }
      if (this.done()) this.openT = quiet ? -1 : 0;
      // (el que entra tarde con todo puesto: el portal lo abre su propio estado)
    }
    this.paint(R, true);
  }

  // la grieta los escupe: nadie quedó adentro
  fail(R) {
    const g = this.g;
    const was = R.st;
    this.expel(R);
    if (!g.net?.guest) this.sweep(R, false);
    this.setState(R, 0);
    if (was === 2) g.hud?.subtitle?.('La grieta se cerró sola. Hay que abrirla de nuevo.', 4);
  }

  // saca al jugador de esta compu del jirón (si está adentro)
  expel(R) {
    const g = this.g;
    const P = g.player;
    const PT = g.ee?.portals;
    if (!P || !PT || !this.inZone(P.pos, R)) return;
    g.hud?.setHint?.('');
    if (P.downed || !P.alive || PT.trip) PT.cross(P, R.outEnd);
    else PT.begin(P, R.isleEnd, R.outEnd);
  }

  // (anfitrión) los muertos: los de afuera vuelven a la cola de la ronda (inside
  // false) o los del jirón se van (inside true)
  sweep(R, outside) {
    const g = this.g;
    const Z = g.zombies;
    if (!Z?.pool) return;
    for (const z of Z.pool) {
      if (!z.active || z.dead || z.boss) continue;
      const here = this.inZone(z.pos, R, z.baseY ?? z.pos.y);
      if (outside && !here) {
        Z.free(z);
        g.rounds?.requeue?.(1);
      } else if (!outside && here) Z.free(z);
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.time.value += dt;
    const t = this.time.value;
    const playing = g.state === 'playing';
    const cam = g.camera.position;
    this.pilG.visible = globalThis.__mduPilaresLejos === true || cam.distanceToSquared(this.pilC) < PIL_SEE * PIL_SEE;
    for (const R of this.rifts) {
      R.t += dt;
      if (playing) this.logic(R, dt);
      this.paint(R, false, dt);
      R.pick.update(dt, t);
      // el objeto recién soltado: sale de la cicatriz y cae a su lugar
      if (R.popT >= 0) {
        R.popT += dt;
        const k = Math.min(1, R.popT / 0.75);
        const o = R.pick.obj;
        o.position.x = R.at.x + (R.drop.x - R.at.x) * k;
        o.position.z = R.at.z + (R.drop.z - R.at.z) * k;
        o.position.y = R.at.y + 2.4 + (R.drop.y + 0.9 - R.at.y - 2.4) * k + Math.sin(k * Math.PI) * 0.9;
        if (k >= 1) R.popT = -1;
      }
      // de frente al que mira (girando solo de costado)
      for (const [S, p] of [[R.A, R.at], [R.B, R.isleEnd.pos]]) {
        if (!S.mesh.visible) continue;
        S.mesh.rotation.y = Math.atan2(cam.x - p.x, cam.z - p.z);
        // (de cerca brilla menos: a 2 m el resplandor lavaba toda la pantalla)
        const dd = Math.hypot(cam.x - p.x, cam.z - p.z);
        S.U.uDim.value = 0.5 + 0.5 * Math.max(0, Math.min(1, (dd - 2.5) / 11));
      }
      // el pilar
      if (R.ghost.visible) {
        R.ghost.rotation.y = t * 0.6 + R.i;
        R.ghost.position.y = R.pil.y + PIL_TOP + 0.2 + Math.sin(t * 1.3 + R.i) * 0.05;
      }
      if (R.placed.visible) {
        R.placed.rotation.y = t * 0.35 + R.i;
        R.placed.position.y = R.pil.y + PIL_TOP + 0.12 + Math.sin(t * 1.1 + R.i * 2) * 0.03;
      }
      // la grieta cerrada escupe, cada tanto, un rayo corto al piso
      if (R.st === 0 && playing) {
        R.arcT = (R.arcT ?? 1 + R.i) - dt;
        if (R.arcT <= 0) {
          R.arcT = 2.2 + Math.random() * 3.2;
          if (cam.distanceTo(R.at) < 45) {
            const a = Math.random() * Math.PI * 2;
            const r = 1.5 + Math.random() * 1.9;
            const to = new THREE.Vector3(R.at.x + Math.cos(a) * r, R.at.y + 0.05, R.at.z + Math.sin(a) * r);
            g.fx.lightning?.(new THREE.Vector3(R.at.x, R.at.y + 1 + Math.random() * 3.2, R.at.z), to, 0xb070ff, 0.2);
            g.fx.sparkle?.(to, [0.75, 0.4, 1], 3, 0.25);
            R.A.U.uFlash.value = Math.max(R.A.U.uFlash.value, 0.18);
          }
        }
      }
      R.ringMat.opacity = R.st === 6 ? 0.5 + 0.1 * Math.sin(t * 3 + R.i) : R.st === 5 ? 0.32 + 0.2 * Math.sin(t * 5) : 0.15;
    }
    // el zumbido de la grieta cerrada más cercana
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.4;
      this.hum(playing);
    }
    // los cuatro puestos: los rayos de los pilares al portal y se abre
    if (this.openT >= 0) this.opening(dt);
  }

  logic(R, dt) {
    const g = this.g;
    const host = !g.net?.guest;
    const P = g.player;
    if (R.st === 1) {
      // a OPEN_T se traga a los que están cerca y de pie
      if (R.t >= OPEN_T && !R.pulled) {
        R.pulled = true;
        const PT = g.ee?.portals;
        const near = Math.hypot(P.pos.x - R.at.x, P.pos.z - R.at.z) < PULL_R && Math.abs(P.pos.y - R.at.y) < 5;
        if (PT && P.alive && !P.downed && near) {
          if (PT.trip) PT.cross(P, R.isleEnd);
          else PT.begin(P, R.mapEnd, R.isleEnd);
        }
      }
      if (host && R.t >= OPEN_T + TRIP_T) this.emit({ gr: R.i, a: 'in' });
      return;
    }
    if (R.st === 2) {
      const C = this.crew();
      const up = C.some((c) => c.up && this.inZone(c.pos, R));
      const any = C.some((c) => !c.dead && this.inZone(c.pos, R));
      const before = R.k;
      if (up) R.k = Math.min(SECS, R.k + dt);
      R.emptyT = any ? 0 : R.emptyT + dt;
      if (this.inZone(P.pos, R) && Math.floor(R.k * 2) !== Math.floor(before * 2)) g.hud?.setHint?.(`Aguantá: ${Math.ceil(SECS - R.k)} s`);
      if (!host) return;
      // la ronda espera y los de afuera vuelven a su cola
      g.rounds?.holdSpawns?.(1.5);
      if (!R.swept) {
        R.swept = true;
        this.sweep(R, true);
      }
      // los muertos del jirón: de a uno, con tope (es chico)
      const n = g.net ? g.net.net.count : 1;
      const cap = Math.min(maxAlive(n), 8 + (n - 1) * 4);
      if (g.zombies.alive < cap) R.enc.spawns(dt, 1.35);
      if (R.k >= SECS) this.emit({ gr: R.i, a: 'win' });
      else if (R.emptyT > 2) this.emit({ gr: R.i, a: 'fail' });
      return;
    }
    if (R.st === 3) {
      // la grieta de adentro se abre y saca a los que quedaron
      if (R.t >= 0.5 && !R.pushed) {
        R.pushed = true;
        this.expel(R);
      }
      if (host && R.t >= 1.2 && !R.cleaned) {
        R.cleaned = true;
        this.sweep(R, false);
      }
      // el cosido: una puntada cada tanto, y al final suelta el objeto
      const k = (R.t - SEW_WAIT) / SEW_T;
      const rec = !OLD_SFX() && eclSfx(g).has('portal-cose');
      if (k > 0) {
        const n = Math.min(STITCHES, Math.floor(k * STITCHES) + 1);
        if (n > R.stitch) {
          // (el grabado: crece mientras cose y se corta cuando cierra)
          if (R.stitch === 0 && rec && g.camera.position.distanceTo(R.at) < 60) {
            eclSfx(g).play('portal-cose', { pos: R.at.clone().setY(R.at.y + 2), gain: 1.1, reverb: 0.2, ref: 8 });
            R.sewRec = true;
          }
          R.stitch = n;
          const y = R.at.y + 0.5 + (4.6 * (n - 0.5)) / STITCHES;
          if (g.camera.position.distanceTo(R.at) < 45) {
            const at = new THREE.Vector3(R.at.x, y, R.at.z);
            if (!R.sewRec) this.play('gr-puntada', at, 0.9);
            g.fx.sparkle?.(at, [1, 0.8, 0.3], 2, 0.18);
          }
        }
      }
      if (k >= 1) {
        const near = g.camera.position.distanceTo(R.at) < 30;
        if (!R.sewRec) this.play('gr-cierre', R.at, 1.2);
        g.fx.sparkle?.(tmpV.set(R.at.x, R.at.y + 2.4, R.at.z), [1, 0.85, 0.5], 14, 1.1);
        if (near) {
          g.post?.flash?.(0.08);
          g.fx.addShake?.(0.3);
        }
        R.A.U.uFlash.value = 0.7;
        this.setState(R, 4);
        if (near) g.hud?.subtitle?.(`La grieta se cosió. Soltó ${R.I.nom} ${R.I.de}.`, 4);
      }
    }
  }

  // Lo que se ve de la grieta según su estado (now: sin transición).
  paint(R, now, dt = 0) {
    const A = R.A.U;
    const B = R.B.U;
    const st = R.st;
    let open = 0;
    let sew = 0;
    let scar = 0;
    let bOpen = 0;
    if (st === 1) open = R.t >= OPEN_T ? 1 : Math.max(0, backOut(Math.min(1, R.t / (OPEN_T * 0.75))));
    else if (st === 2) open = 1;
    else if (st === 3) {
      const k = Math.max(0, Math.min(1, (R.t - SEW_WAIT) / SEW_T));
      open = 1;
      sew = smooth(k);
      bOpen = Math.min(1, R.t / 0.45);
    } else if (st >= 4) {
      open = 1;
      sew = 1;
      scar = now ? 1 : Math.min(1, A.uScar.value + dt * 0.5);
    }
    A.uOpen.value = open;
    A.uSew.value = sew;
    A.uScar.value = scar;
    if (A.uFlash.value > 0) A.uFlash.value = Math.max(0, A.uFlash.value - dt * 1.6);
    if (B.uFlash.value > 0) B.uFlash.value = Math.max(0, B.uFlash.value - dt * 1.6);
    // el resplandor del piso: prendido mientras está viva
    const pk = st >= 4 ? 0 : st === 3 ? 1 - sew : 1 + open * 0.6;
    R.A.PU.uK.value += (pk - R.A.PU.uK.value) * (now ? 1 : Math.min(1, dt * 4));
    R.A.pool.visible = R.A.PU.uK.value > 0.01;
    // la de adentro: solo mientras hay encierro (una rendija) y cuando saca (abierta)
    const inside = st === 2 || st === 3 || (st === 1 && R.t >= OPEN_T);
    R.B.mesh.visible = R.B.pool.visible = inside;
    B.uOpen.value = st === 3 ? bOpen : 0;
    R.B.PU.uK.value = st === 3 ? 1.4 : 0.8;
  }

  hum(playing) {
    const g = this.g;
    const a = g.audio;
    const cam = g.camera.position;
    let best = null;
    let bd = 34;
    if (playing && a?.ctx) {
      for (const R of this.rifts) {
        if (R.st > 1) continue;
        const d = cam.distanceTo(R.at);
        if (d < bd) {
          bd = d;
          best = R;
        }
      }
    }
    if (best === this.humOf) return;
    this.humLoop?.stop?.();
    this.humLoop = null;
    this.humOf = null;
    if (!best) return;
    const buf = a.bakedBuf?.('gr-zumbido');
    if (!buf || !a.guns?.loopBuf) return;
    this.humOf = best;
    this.humLoop = a.guns.loopBuf(buf, tmpV.set(best.at.x, best.at.y + 2, best.at.z).clone(), { gain: 0.9, reverb: 0.4, ref: 4, fadeIn: 0.8, from: 0, to: buf.duration });
    // (como los susurros, world/papDesgarro watchWhisper: el lazo se apaga desde
    // update, y en el menú update ya no corre. Fuera de la partida, se calla)
    if (!this.humWatch) {
      this.humWatch = setInterval(() => {
        // (y si la partida se rearmó —Game.buildScene—, esta ya no es la de ahora)
        if (this.humLoop && g.papq?.termas?.gr === this && (g.state === 'playing' || g.state === 'paused')) return;
        clearInterval(this.humWatch);
        this.humWatch = null;
        this.humLoop?.stop?.();
        this.humLoop = null;
        this.humOf = null;
      }, 400);
    }
  }

  // Los cuatro en su pilar: un rayo de cada uno al portal negro y se abre.
  // (2026-10-10, con el sonido grabado de la apertura, fx/eclipseSfx
  // portal-caos-abre: sube 2 s —un rayo de cada pilar—, a los 2 s el portal
  // revienta y ruge hasta los 5,5 —se abre despacio, world/eclipsePortals
  // DARK_OPEN, con rayos alrededor—.)
  opening(dt) {
    const g = this.g;
    const before = this.openT;
    this.openT += dt;
    const PT = g.ee?.portals;
    const P15 = PT?.list?.find((p) => p.def.id === EE.desgarroPortal);
    const base = P15 ? P15.ends[0].pos : null;
    const to = base ? base.clone().setY(base.y + 3) : null;
    const hit = (t) => before < t && this.openT >= t;
    if (before === 0 && to && !OLD_SFX() && PT) {
      PT.caosAt = g.time;
      eclSfx(g).play('portal-caos-abre', { pos: to, gain: 1, reverb: 0.25, ref: 10 });
    }
    for (let k = 0; k < this.rifts.length; k++) {
      if (hit(0.35 + k * 0.42) && to) {
        const R = this.rifts[k];
        const from = R.pil.clone().setY(R.pil.y + 1.5);
        g.fx.lightning?.(from, to, 0xc080ff, 0.55);
        g.fx.sparkle?.(from, [0.9, 0.5, 1], 10, 0.6);
        this.play('gr-puntada', from, 1);
        g.fx.addShake?.(0.12 + k * 0.05);
      }
    }
    if (hit(OPEN_AT)) {
      g.world.eclipse?.pulse?.();
      g.fx.addShake?.(0.6);
      if (to && g.camera.position.distanceTo(to) < 40) g.post?.flash?.(0.25);
      // (lo manda el anfitrión)
      if (!g.net?.guest) PT?.unlock(EE.desgarroPortal);
    }
    // mientras ruge: rayos de los colmillos de alrededor al tajo, y tiembla
    if (this.openT > OPEN_AT && to) {
      this.boltT = (this.boltT ?? 0) - dt;
      if (this.boltT <= 0) {
        this.boltT = 0.3 + Math.random() * 0.3;
        const a = Math.random() * Math.PI * 2;
        const r = 5.5 + Math.random() * 2.5;
        const from = new THREE.Vector3(base.x + Math.cos(a) * r, base.y + 3 + Math.random() * 5, base.z + Math.sin(a) * r);
        if (g.camera.position.distanceTo(to) < 60) g.fx.lightning?.(from, new THREE.Vector3(base.x, base.y + 1 + Math.random() * 4.5, base.z), 0xb070ff, 0.3);
        g.fx.addShake?.(0.1);
      }
    }
    if (this.openT >= OPEN_AT + 3.4) this.openT = -1;
  }

  // (el atajo de prueba y el que entra tarde con el paso hecho)
  complete() {
    for (const R of this.rifts) if (R.st !== 6) this.setState(R, 6, true);
    this.openT = -1;
  }

  dispose() {
    clearInterval(this.humWatch);
    this.humWatch = null;
    this.humLoop?.stop?.();
    this.humLoop = null;
    this.root.removeFromParent();
    for (const R of this.rifts) {
      R.pick.dispose();
      R.enc.dispose();
      R.A.mesh.material.dispose();
      R.A.pool.material.dispose();
      R.B.mesh.material.dispose();
      R.B.pool.material.dispose();
      R.ringMat.dispose();
      R.ring.geometry.dispose();
    }
    for (const m of this.ghostMats) m.dispose();
    this.geo.dispose();
    this.poolGeo.dispose();
  }
}
