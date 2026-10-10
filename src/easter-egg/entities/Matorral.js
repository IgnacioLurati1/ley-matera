import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EE, DOORS, ZONES } from '../config/map';
import { rng } from '../core/noise';
import { depthPrepass } from '../fx/prepass';
import { lightGrass } from '../config/quality';
import { buildCamps } from '../world/matorralCamps';
import MatorralChests from './matorralChests';

// El Matorral (La Tapera, zona K, atrás de la despensa de la atahona): un
// campo inmenso de maíz más alto que uno (el mismo que levanta el
// Espantapájaros en el prado, world/Prado.js), tupido, con huellas ralas
// entre campamentos abandonados (world/matorralCamps.js). Se atraviesa (las
// plantas se abren alrededor del que pasa) y se corta con la hoz: la común
// lo aparta un segundo, la de la Muerte cinco y la del bastón de oro un
// minuto (el usuario, 2026-09-28). Adentro andan los Yasy (entities/Yasy.js);
// el dorado se esconde en los campamentos y en el del fondo está la Yerba
// Madre: la sexta planta del easter egg (entities/FarmEgg.js).
// El fuego: si se corta la Yerba Madre o alguien agarra el bastón del Yasy
// dorado, el matorral se prende del fondo hacia la puerta y hay que salir.
// Fuera del paso de la cosecha, además, desde que entra el primero hay
// EE.matorral.secs segundos antes de que se prenda solo (en el paso de la
// cosecha, solo se prende al cortar la planta). Quemado, vuelve a crecer a
// las EE.matorral.regrow rondas.
// Todo lo que cambia (corte, fuego, rebrote) lo hace el shader: por planta
// solo se guarda cuándo se cortó y hasta cuándo (aCut); el fuego es un frente
// que avanza desde la distancia más lejana a la puerta.
// En línea: el anfitrión decide el fuego, el tiempo y el rebrote ('mato'
// {k:'st'}); los cortes los manda cada uno ({k:'cut'}) y todos los aplican
// (cada compu tiene sus plantas: un corte es un arco que todas cortan igual).

// separación entre plantas (m; con calidad mínima, menos), lo que se deja
// libre en la puerta, lado de cada pedazo del maizal (se dibuja por pedazos)
// y hasta dónde se dibujan
const STEP = 0.52;
const STEP_LOW = 0.74;
const DOOR_FREE = 3.2;
const CHUNK = 22;
const VIEW = 95;
// alto de las plantas (escala de la tarjeta de 2,7 m, como el maíz del prado)
const H = [1.12, 1.46];
// los cortes: [alcance, coseno del arco] (la medialuna corta en redondo a su paso)
const CUT = { hoz: [3.1, 0.15], crescent: [1.8, -1] };
// cuánto queda apartada una planta: hoz común, de la Muerte, con el bastón de oro
export const CUT_SECS = [1, 5, 60];
// cuánto tarda en caer y en volver a pararse (s); al rebrotar después del
// fuego, cuánto tarda la ola en llegar de la puerta al fondo
const SHRINK = 0.12;
const REGROW = 0.7;
const GROW_SPREAD = 3;
// el fuego: ancho de la franja que arde (m; ahí las plantas arden paradas y
// después se caen, negras), daño por segundo en las llamas y en la brasa de
// atrás; a los muertos, cada medio segundo
const FRONT_W = 6;
const BURN_LEN = 9;
const FIRE_DPS = 45;
const EMBER_DPS = 14;
const BURN_EVERY = 0.5;
// partículas por segundo (no por cuadro: con muchos fps se llenaba el pozo de
// partículas y el fuego tiraba los cuadros): llamas de cada fogón, llamas y
// humo negro de la franja que arde
const CAMP_FLAMES = 22;
const FIRE_FLAMES = 700;
const FIRE_SMOKE = 50;
// los que abren el maíz (jugadores, Yasy y los muertos más cerca de la cámara)
const PUSHERS = 6;
const R_PLAYER = 1.4;
const R_ZOMBIE = 1.05;
// la grilla para buscar plantas cerca (m)
const BUCKET = 2;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const f3 = (n) => n.toFixed(3);

// Ruido suave y fijo (matas más tupidas, más altas o más secas).
const wob = (x, z) => Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.09 - z * 0.23 + 1.3) * 0.35 + Math.sin(x * 0.53 + z * 0.41 + 2.1) * 0.15;

function segDist(x, z, a, b) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
}

// ---------------- el material ----------------
// El maíz del mapa (M.corn) con todo en el vértice: el corte (cae en SHRINK,
// espera, se vuelve a parar en REGROW), el rebrote desde la puerta, lo
// quemado (se achica y se pone negro), el viento del maizal (world.cornU) y
// los que pasan (cada planta se inclina alejándose de ellos, más arriba que
// abajo: se abre un pasillo). A menos de medio metro de la cámara se deshace
// en puntitos. El mismo parche va a la pasada de profundidad (fx/prepass) y
// al G-buffer de Ultra/Épica (fx/Epic.js, userData.gbuf): si no, la
// oclusión y la profundidad dibujaban el maíz quieto y entero.
// mode: 'main' (con el color quemado y el brillo del fuego), 'pre' o 'gbuf'.
function cornPatch(U, mode) {
  const main = mode === 'main';
  return (sh) => {
    sh.uniforms.uWind = U.wind;
    sh.uniforms.uMcT = U.t;
    sh.uniforms.uMcPush = U.push;
    sh.uniforms.uMcN = U.n;
    sh.uniforms.uMcDoor = U.door;
    sh.uniforms.uMcFront = U.front;
    sh.uniforms.uMcBurnLen = U.burnLen;
    sh.uniforms.uMcEmber = U.ember;
    sh.uniforms.uMcGrow = U.grow;
    sh.uniforms.uMcMaxD = U.maxD;
    const vary = main ? 'varying float vMcBurn;\nvarying float vMcGlow;\nvarying float vMcH;\n' : '';
    sh.vertexShader = `uniform float uWind;
uniform float uMcT;
uniform vec4 uMcPush[${PUSHERS}];
uniform int uMcN;
uniform vec2 uMcDoor;
uniform float uMcFront;
uniform float uMcBurnLen;
uniform float uMcEmber;
uniform float uMcGrow;
uniform float uMcMaxD;
attribute vec2 aCut;
varying float vMcCam;
${vary}${sh.vertexShader}`
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
	mat4 mcM = modelMatrix * instanceMatrix;
	vec3 mcB = mcM[3].xyz;
	float mcD = distance(mcB.xz, uMcDoor);
	float mcK = clamp(max(1.0 - (uMcT - aCut.x) / ${f3(SHRINK)}, (uMcT - aCut.y) / ${f3(REGROW)}), 0.04, 1.0);
	mcK *= clamp((uMcGrow - mcD / uMcMaxD * ${f3(GROW_SPREAD)}) / ${f3(REGROW)}, 0.001, 1.0);
	float mcBurn = clamp((mcD - uMcFront) / uMcBurnLen, 0.0, 1.0);
	float mcFall = smoothstep(0.3, 0.9, mcBurn);
	float mcY = uv.y;
	transformed.y *= max(0.02, mcK * (1.0 - 0.74 * mcFall));
	transformed.xz *= (0.35 + 0.65 * mcK) * (1.0 - 0.3 * mcFall);
	float mcS = sin(uWind * 1.4 + mcB.x * 0.35 + mcB.z * 0.22) * 0.09 + sin(uWind * 3.1 + mcB.x) * 0.02;
	vec2 mcO = vec2(mcS, mcS * 0.6) * mcY * mcY * (1.0 - mcBurn);
	for (int i = 0; i < ${PUSHERS}; i++) {
		if (i >= uMcN) break;
		vec4 P = uMcPush[i];
		vec2 d = mcB.xz - P.xz;
		float dist = length(d);
		float k = (1.0 - smoothstep(P.w * 0.3, P.w, dist)) * (1.0 - smoothstep(2.0, 3.5, abs(mcB.y - P.y)));
		mcO += (dist > 0.001 ? d / dist : vec2(0.7071)) * k * P.w * 0.95 * mcY;
	}
	transformed += inverse(mat3(mcM)) * vec3(mcO.x, -length(mcO) * 0.35 * mcY, mcO.y);${
    main
      ? `
	vMcBurn = mcBurn;
	vMcGlow = mcD >= uMcFront ? max((1.0 - smoothstep(0.0, ${FRONT_W.toFixed(1)}, mcD - uMcFront)) * (0.55 + 0.45 * sin(uMcT * 9.0 + mcB.x * 3.7 + mcB.z * 2.9)), uMcEmber) : 0.0;
	vMcH = mcY;`
      : ''
  }`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
	vMcCam = distance((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);`,
      );
    sh.fragmentShader = `varying float vMcCam;\n${main ? 'uniform float uMcT;\nvarying float vMcBurn;\nvarying float vMcGlow;\nvarying float vMcH;\n' : ''}${sh.fragmentShader}`.replace(
      'void main() {',
      mode === 'gbuf'
        ? `void main() {
	if (vMcCam < 0.6) discard;`
        : `void main() {
	float mcNear = clamp((vMcCam - 0.3) / 0.6, 0.0, 1.0);
	if (mcNear < 1.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > mcNear) discard;`,
    );
    if (main) {
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
	vec3 mcTint = vMcBurn < 0.4 ? mix(vec3(1.0), vec3(0.55, 0.28, 0.12), vMcBurn * 2.5) : mix(vec3(0.55, 0.28, 0.12), vec3(0.09, 0.075, 0.06), min(1.0, (vMcBurn - 0.4) * 2.0));
	diffuseColor.rgb *= mcTint;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
	float mcF = vMcGlow * (0.6 + 0.4 * sin(uMcT * 14.0 - vMcH * 7.0 + gl_FragCoord.x * 0.05));
	totalEmissiveRadiance += mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.45, 0.08), vMcH) * mcF * (0.6 + vMcH * 0.7) * 2.2;`,
        );
    }
  };
}

// ---------------- el matorral ----------------
export default class Matorral {
  constructor(g) {
    this.g = g;
    this.C = EE.matorral;
    const D = DOORS.find((d) => d.id === this.C.door);
    const cx = D.cells.reduce((s, c) => s + c[0], 0) / D.cells.length + 0.5;
    const cz = D.cells.reduce((s, c) => s + c[1], 0) / D.cells.length + 0.5;
    this.door = new THREE.Vector3(cx, 0, cz);
    // 'grown' (crecido), 'fire' (ardiendo) o 'ash' (quemado)
    this.state = 'grown';
    this.fireT = 0;
    this.front = Infinity;
    this.ashRound = 0;
    // (anfitrión) segundos que quedan antes de que se prenda solo (-1: no corre);
    // armed: el primero que entre arranca la cuenta (una vez por cada vez que crece)
    this.timer = -1;
    this.armed = true;
    this.warnT = 0;
    this.hurtAcc = 0;
    this.burnT = 0;
    this.roarT = 0;
    this.syncT = 0;
    this.cullT = 0;
    this.smokeT = 0;
    this.crackT = 0;
    this.outbox = [];
    this.outT = 0;
    this.U = {
      wind: g.world.cornU || { value: 0 },
      t: { value: 0 },
      push: { value: Array.from({ length: PUSHERS }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
      n: { value: 0 },
      door: { value: new THREE.Vector2(this.door.x, this.door.z) },
      front: { value: 1e5 },
      burnLen: { value: BURN_LEN },
      ember: { value: 0 },
      grow: { value: 1e5 },
      maxD: { value: 100 },
    };
    // los campamentos primero: el maíz no crece adentro de sus cosas
    this.camps = buildCamps(g.world, this.C.camps);
    this.build();
    // los cofres de los campamentos (entities/matorralChests.js)
    this.chests = new MatorralChests(this);
  }

  inside(x, z) {
    return this.g.world.zoneAt(x, z) === this.C.zone;
  }

  // ¿Adentro, en el paso de la cosecha, falta cortar la Yerba Madre? (entonces no corre el tiempo)
  harvestStep() {
    const ee = this.g.ee;
    return !!ee?.papDone && !!ee.plants?.some((p) => p.madre && !ee.harvested[p.i]);
  }

  // ---------------- el maizal ----------------
  build() {
    const g = this.g;
    const C = this.C;
    const low = lightGrass(g);
    const step = low ? STEP_LOW : STEP;
    const r = rng(4417);
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [a, b, c, d] of ZONES[C.zone].rects) {
      x0 = Math.min(x0, a);
      z0 = Math.min(z0, b);
      x1 = Math.max(x1, c + 1);
      z1 = Math.max(z1, d + 1);
    }
    this.bounds = [x0, z0, x1, z1];
    const boxes = this.camps.boxes;
    const P = [];
    for (let gz = z0 + step / 2; gz < z1; gz += step) {
      for (let gx = x0 + step / 2; gx < x1; gx += step) {
        const x = gx + (r() - 0.5) * step * 0.9;
        const z = gz + (r() - 0.5) * step * 0.9;
        if (!this.inside(x, z)) continue;
        const d = Math.hypot(x - this.door.x, z - this.door.z);
        if (d < DOOR_FREE) continue;
        // las matas: más tupido, más alto o más seco según dónde
        const n = wob(x, z);
        const n2 = wob(z * 1.7 + 11, x * 1.7);
        let keep = 0.93 + 0.07 * n;
        let h = (H[0] + r() * (H[1] - H[0])) * (0.93 + 0.1 * n2);
        // los claros de los campamentos (con el borde ralo y más bajo)
        let skip = false;
        for (const c of C.camps) {
          const dc = Math.hypot(x - c.at[0], z - c.at[1]);
          if (dc < c.r) skip = true;
          else if (dc < c.r + 1.6) {
            keep *= 0.5;
            h *= 0.82;
          }
        }
        if (skip) continue;
        // las huellas
        let dt = Infinity;
        for (const line of C.trails) for (let k = 0; k + 1 < line.length; k++) dt = Math.min(dt, segDist(x, z, line[k], line[k + 1]));
        if (dt < 0.7) {
          keep *= 0.12;
          h *= 0.6;
        } else if (dt < 1.35) {
          keep *= 0.5;
          h *= 0.82;
        }
        if (r() > keep) continue;
        if (boxes.some((b) => x > b[0] - 0.25 && x < b[3] + 0.25 && z > b[2] - 0.25 && z < b[5] + 0.25)) continue;
        P.push({ x, z, d, h, w: 0.9 + r() * 0.25, yaw: r() * Math.PI, dry: Math.max(0, n2) * 0.6 + r() * 0.4 });
      }
    }
    const N = P.length;
    this.n = N;
    this.px = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.pd = new Float32Array(N);
    this.ph = new Float32Array(N);
    this.pc = new Uint16Array(N);
    this.pi = new Uint16Array(N);
    let maxD = 0;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      this.px[i] = p.x;
      this.pz[i] = p.z;
      this.pd[i] = p.d;
      this.ph[i] = p.h * 2.7;
      maxD = Math.max(maxD, p.d);
    }
    this.maxD = maxD + 2;
    this.U.maxD.value = this.maxD;
    // de cerca a lejos de la puerta (la franja del fuego es un rango)
    this.order = Int32Array.from({ length: N }, (_, i) => i).sort((a, b) => this.pd[a] - this.pd[b]);
    this.sortedD = Float32Array.from(this.order, (i) => this.pd[i]);
    // la grilla para los cortes
    const bw = Math.ceil((x1 - x0) / BUCKET);
    const bh = Math.ceil((z1 - z0) / BUCKET);
    this.bw = bw;
    this.bh = bh;
    const cellOf = (i) => Math.min(bh - 1, Math.floor((this.pz[i] - z0) / BUCKET)) * bw + Math.min(bw - 1, Math.floor((this.px[i] - x0) / BUCKET));
    const start = new Int32Array(bw * bh + 1);
    for (let i = 0; i < N; i++) start[cellOf(i) + 1]++;
    for (let k = 0; k < bw * bh; k++) start[k + 1] += start[k];
    const fill = start.slice(0, bw * bh);
    this.bStart = start;
    this.bItems = new Int32Array(N);
    for (let i = 0; i < N; i++) this.bItems[fill[cellOf(i)]++] = i;
    // el material y los pedazos
    const M = g.world.M;
    const mat = M.corn.clone();
    mat.onBeforeCompile = cornPatch(this.U, 'main');
    mat.customProgramCacheKey = () => 'matorralCorn';
    mat.userData.foliage = true;
    mat.userData.gbuf = { key: 'matorralCorn', patch: cornPatch(this.U, 'gbuf') };
    this.mat = mat;
    const a = new THREE.PlaneGeometry(1.05, 2.7).translate(0, 1.35, 0);
    const base = mergeGeometries([a, a.clone().rotateY(Math.PI / 2)]);
    const cw = Math.ceil((x1 - x0) / CHUNK);
    const lists = new Map();
    for (let i = 0; i < N; i++) {
      const k = Math.floor((this.pz[i] - z0) / CHUNK) * cw + Math.floor((this.px[i] - x0) / CHUNK);
      if (!lists.has(k)) lists.set(k, []);
      lists.get(k).push(i);
    }
    const green = new THREE.Color(0.8, 0.92, 0.66);
    const dry = new THREE.Color(1.08, 0.98, 0.8);
    this.chunks = [];
    for (const list of lists.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setIndex(base.index);
      for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, base.attributes[k]);
      const cut = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 2).fill(-1e4), 2);
      cut.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aCut', cut);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      let cx = 0;
      let cz = 0;
      list.forEach((i, j) => {
        const p = P[i];
        this.pc[i] = this.chunks.length;
        this.pi[i] = j;
        cx += p.x;
        cz += p.z;
        tmpQ.setFromAxisAngle(UP, p.yaw);
        tmpS.set(p.w, p.h, p.w);
        im.setMatrixAt(j, tmpM.compose(tmpP.set(p.x, g.world.floorAt(p.x, p.z), p.z), tmpQ, tmpS));
        im.setColorAt(j, tmpC.copy(green).lerp(dry, p.dry));
      });
      im.receiveShadow = true;
      im.castShadow = false;
      im.computeBoundingSphere();
      // (lo que se abre y se mece se sale un poco)
      im.boundingSphere.radius += 2;
      depthPrepass(im);
      const pre = im.userData.prepass;
      pre.material.onBeforeCompile = cornPatch(this.U, 'pre');
      pre.material.customProgramCacheKey = () => 'matorralCornPre';
      g.scene.add(im);
      this.chunks.push({ im, cut, dirty: false, x: cx / list.length, z: cz / list.length, r: im.boundingSphere.radius });
    }
  }

  // (La Yerba Madre no tiene columna de luz: dónde está es secreto, se busca
  // en el maizal; el usuario, 2026-09-29.)

  // ---------------- los cortes ----------------
  // Un golpe de acá (Weapons: el tajo de la hoz, la medialuna a su paso).
  onCut(pos, fwd, st, kind = 'hoz') {
    if (this.state !== 'grown') return;
    // (la medialuna que viene de afuera también corta, si pasa cerca)
    if (!this.inside(pos.x, pos.z) && kind !== 'crescent') return;
    const len = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / len;
    const fz = fwd.z / len;
    const [range, cos] = CUT[kind] || CUT.hoz;
    const secs = CUT_SECS[st?.upgraded ? (st.baston ? 2 : 1) : 0];
    if (!this.cutArc(pos.x, pos.z, fx, fz, range, cos, secs)) return;
    if (this.g.net) this.outbox.push(+pos.x.toFixed(2), +pos.z.toFixed(2), +fx.toFixed(2), +fz.toFixed(2), range, cos, secs);
  }

  // Lo que está adelante, en el arco, se aparta `secs` segundos. Devuelve cuántas.
  cutArc(x, z, fx, fz, range, cos, secs) {
    const g = this.g;
    if (this.state !== 'grown') return 0;
    const t = g.time;
    const [x0, z0] = this.bounds;
    const R = range + 0.6;
    const bx0 = Math.max(0, Math.floor((x - R - x0) / BUCKET));
    const bx1 = Math.min(this.bw - 1, Math.floor((x + R - x0) / BUCKET));
    const bz0 = Math.max(0, Math.floor((z - R - z0) / BUCKET));
    const bz1 = Math.min(this.bh - 1, Math.floor((z + R - z0) / BUCKET));
    let n = 0;
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const k = bz * this.bw + bx;
        for (let q = this.bStart[k]; q < this.bStart[k + 1]; q++) {
          const i = this.bItems[q];
          const dx = this.px[i] - x;
          const dz = this.pz[i] - z;
          const d = Math.hypot(dx, dz);
          if (d - 0.5 > range) continue;
          if (d > 0.5 && (dx * fx + dz * fz) / d < cos) continue;
          const ch = this.chunks[this.pc[i]];
          const A = ch.cut.array;
          const j = this.pi[i] * 2;
          // (sigue desde donde está: si ya estaba cortada, no salta)
          const now = Math.min(1, Math.max(0.04, Math.max(1 - (t - A[j]) / SHRINK, (t - A[j + 1]) / REGROW)));
          A[j] = t - (1 - now) * SHRINK;
          A[j + 1] = Math.max(A[j + 1], t + secs);
          ch.dirty = true;
          if (now < 0.5) continue;
          if (n < 7) this.chaff(i, fx, fz);
          n++;
        }
      }
    }
    if (n) {
      // el chas de las cañas
      const A = g.audio;
      if (A?.ctx) {
        const o = A.out({ pos: tmpP.set(x + fx, g.world.floorAt(x, z) + 1, z + fz), gain: Math.min(0.9, 0.4 + n * 0.05), reverb: 0.12, ref: 3 });
        A.noise(o, { dur: 0.18 + Math.random() * 0.06, type: 'bandpass', freq: 2600 + Math.random() * 900, freqEnd: 1400, q: 0.9, gain: 0.6, attack: 0.005 });
        A.noise(o, { t: A.now + 0.03, dur: 0.24, type: 'highpass', freq: 4200, q: 0.5, gain: 0.3, attack: 0.01 });
      }
    }
    return n;
  }

  // Hojas y chalas que saltan del corte.
  chaff(i, fx, fz) {
    const g = this.g;
    const x = this.px[i];
    const z = this.pz[i];
    const y = g.world.floorAt(x, z);
    for (let k = 0; k < 3; k++) {
      g.fx.alpha.spawn(x + (Math.random() - 0.5) * 0.8, y + 0.5 + Math.random() * 2.2, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2 + fx * 1.5, Math.random() * 1.6, (Math.random() - 0.5) * 2 + fz * 1.5, {
        color: [0.62 + Math.random() * 0.15, 0.56 + Math.random() * 0.12, 0.3],
        size: 0.08 + Math.random() * 0.05,
        size1: 0.03,
        life: 0.9 + Math.random() * 0.6,
        gravity: 3,
        drag: 1.5,
        bounce: 0.5,
      });
    }
  }

  // Todas las plantas paradas (al crecer y al quemarse).
  resetCuts() {
    for (const ch of this.chunks) {
      ch.cut.array.fill(-1e4);
      ch.dirty = true;
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.U.t.value = g.time;
    this.pushers();
    for (const ch of this.chunks) {
      if (!ch.dirty) continue;
      ch.dirty = false;
      ch.cut.needsUpdate = true;
    }
    if (this.U.grow.value < 1e4) {
      this.U.grow.value += dt;
      if (this.U.grow.value > GROW_SPREAD + REGROW + 0.5) this.U.grow.value = 1e5;
    }
    if (this.state === 'fire') this.updateFire(dt);
    else if (this.state === 'ash') this.updateAsh(dt);
    if (this.warnT > 0) this.updateWarn(dt);
    this.campFx(dt);
    this.cull(dt);
    this.chests.update(dt);
    if (!g.net?.guest) {
      this.chests.hostTick();
      this.hostTick(dt);
    }
    // los cortes de acá, juntos, a los demás
    this.outT -= dt;
    if (this.outbox.length && this.outT <= 0 && g.net) {
      this.outT = 0.12;
      g.net.share('mato', { k: 'cut', c: this.outbox.slice() });
      this.outbox.length = 0;
    }
  }

  // Los pedazos lejos de la cámara no se dibujan (el maizal de alrededor los tapa).
  cull(dt) {
    this.cullT -= dt;
    if (this.cullT > 0) return;
    this.cullT = 0.25;
    const c = this.g.camera.position;
    for (const ch of this.chunks) ch.im.visible = Math.hypot(ch.x - c.x, ch.z - c.z) < VIEW + ch.r;
  }

  // Los que abren el maíz: los jugadores, los Yasy y los muertos más cerca de la cámara.
  pushers() {
    const g = this.g;
    const P = this.U.push.value;
    let n = 0;
    const add = (x, y, z, r) => {
      if (n >= PUSHERS || !this.inside(x, z)) return;
      P[n++].set(x, y, z, r);
    };
    if (this.state !== 'ash') {
      const p = g.player;
      if (p.alive) add(p.pos.x, p.pos.y, p.pos.z, R_PLAYER);
      if (g.net) for (const r of g.net.remote.values()) if (!r.dead) add(r.pos.x, r.pos.y || 0, r.pos.z, R_PLAYER);
      g.yasy?.pushers(add);
      if (n < PUSHERS) {
        const c = g.camera.position;
        const near = [];
        for (const z of g.zombies?.pool || []) {
          if (!z.active || z.dead) continue;
          const d = (z.pos.x - c.x) ** 2 + (z.pos.z - c.z) ** 2;
          if (d < 900 && this.inside(z.pos.x, z.pos.z)) near.push([d, z]);
        }
        near.sort((a, b) => a[0] - b[0]);
        for (const [, z] of near) add(z.pos.x, z.baseY || 0, z.pos.z, z.boss ? 2.2 : R_ZOMBIE);
      }
    }
    for (let i = n; i < PUSHERS; i++) P[i].w = 0;
    this.U.n.value = n;
  }

  // Los fogones de los campamentos: llamas cerca, la columna de humo (se ve
  // de lejos, arriba del maíz: sirve para orientarse) y el crepitar del más cercano.
  campFx(dt) {
    const g = this.g;
    const cam = g.camera.position;
    this.smokeT -= dt;
    const smoke = this.smokeT <= 0;
    if (smoke) this.smokeT = 0.32;
    let near = null;
    let nd = Infinity;
    for (const f of this.camps.fires) {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      if (d < nd) {
        nd = d;
        near = f;
      }
      // (por segundo, no por cuadro: a 144 fps eran cinco veces más llamas)
      if (d < 45 && Math.random() < dt * CAMP_FLAMES) g.fx.fire(f, 0.45, 1);
      if (d < 20 && Math.random() < dt * 3) g.fx.sparkle(tmpV.set(f.x, f.y + 0.5, f.z), [1, 0.55, 0.15], 2, 0.6);
      if (smoke && d < 150) {
        g.fx.alpha.spawn(f.x + (Math.random() - 0.5) * 0.3, f.y + 1.1, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.25, 1.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.25, { color: [0.2, 0.19, 0.18], size: 0.45, size1: 2.8, life: 6.5, alpha: 0.7, gravity: -0.04, drag: 0.12 });
      }
    }
    const A = g.audio;
    this.crackT -= dt;
    if (!near || nd > 24 || !A?.ctx || this.crackT > 0) return;
    this.crackT = 0.12 + Math.random() * 0.1;
    const o = A.out({ pos: tmpP.set(near.x, near.y + 0.5, near.z), gain: 0.45, reverb: 0.08 });
    A.noise(o, { dur: 0.03, type: 'highpass', freq: 2300 + Math.random() * 1400, gain: 0.25 + Math.random() * 0.45 });
    if (Math.random() < 0.12) A.noise(o, { dur: 0.9, type: 'lowpass', freq: 380, q: 0.5, gain: 0.35, attack: 0.3, brown: true });
  }

  // ---------------- el fuego ----------------
  // (todas) Del fondo hacia la puerta: lo de más allá del frente se quema; la
  // franja del frente arde y quema al que está adentro; atrás queda la brasa.
  updateFire(dt) {
    const g = this.g;
    this.fireT += dt;
    this.front = this.maxD - this.fireT * this.C.speed;
    this.U.front.value = this.front;
    this.U.ember.value = 0.16;
    // la franja que arde (de la lista ordenada por distancia a la puerta)
    const lo = this.lowerBound(this.front);
    const hi = this.lowerBound(this.front + FRONT_W);
    // (cuántas tocan en este cuadro; lo que sobra queda para el próximo)
    this.flameAcc = Math.min(40, (this.flameAcc || 0) + dt * FIRE_FLAMES);
    this.smokeAcc = Math.min(6, (this.smokeAcc || 0) + dt * FIRE_SMOKE);
    if (hi > lo) {
      const cam = g.camera.position;
      const Ad = g.fx.add;
      const want = Math.floor(this.flameAcc);
      let made = 0;
      for (let k = 0; k < 90 && made < want; k++) {
        const i = this.order[lo + ((Math.random() * (hi - lo)) | 0)];
        const x = this.px[i];
        const z = this.pz[i];
        if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > 3000) continue;
        made++;
        // (arde parada: las llamas suben por toda la planta y la pasan)
        const b = Math.min(1, (this.pd[i] - this.front) / BURN_LEN);
        const h = this.ph[i] * (b < 0.3 ? 1 : 1 - 0.74 * Math.min(1, (b - 0.3) / 0.6));
        const y = g.world.floorAt(x, z);
        Ad.spawn(x + (Math.random() - 0.5) * 0.9, y + 0.2 + Math.random() * h, z + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.5, 2 + Math.random() * 2.2, (Math.random() - 0.5) * 0.5, {
          color: [1, 0.3 + Math.random() * 0.35, 0.05],
          size: 1.4 + Math.random() * 1.2,
          size1: 0.15,
          life: 0.5 + Math.random() * 0.5,
          drag: 0.4,
        });
        if (Math.random() < 0.25) g.fx.sparkle(tmpV.set(x, y + h, z), [1, 0.55, 0.15], 3, 1.2);
      }
      // (las que no se pudieron, lejos de la cámara, no se guardan)
      this.flameAcc -= want;
      // el humo negro, de toda la franja (se ve de lejos, arriba del maíz)
      for (; this.smokeAcc >= 1; this.smokeAcc--) {
        const i = this.order[lo + ((Math.random() * (hi - lo)) | 0)];
        const x = this.px[i];
        const z = this.pz[i];
        g.fx.alpha.spawn(x + (Math.random() - 0.5), g.world.floorAt(x, z) + 3.5, z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, { color: [0.09, 0.08, 0.07], size: 2.4, size1: 7.5, life: 5, alpha: 0.85, gravity: -0.12, drag: 0.25 });
      }
    }
    this.roar(dt);
    this.hurtLocal(dt);
    if (!g.net?.guest) this.burnZombies(dt);
    if (this.front < -2 && !g.net?.guest) this.setState('ash');
  }

  // Primera planta a esa distancia de la puerta o más (en this.order).
  lowerBound(d) {
    let a = 0;
    let b = this.sortedD.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (this.sortedD[m] < d) a = m + 1;
      else b = m;
    }
    return a;
  }

  // ¿Ese lugar está ardiendo (o ya quemado, con brasa)? Para los Yasy.
  burning(x, z) {
    if (this.state !== 'fire' || !this.inside(x, z)) return false;
    return Math.hypot(x - this.door.x, z - this.door.z) > this.front - 0.3;
  }

  // El jugador de esta compu: en las llamas o en la brasa, se quema.
  hurtLocal(dt) {
    const g = this.g;
    const p = g.player;
    if (!p.canBeHit() || !this.inside(p.pos.x, p.pos.z)) {
      this.hurtAcc = 0;
      return;
    }
    const d = Math.hypot(p.pos.x - this.door.x, p.pos.z - this.door.z);
    if (d < this.front - 0.3) return;
    this.hurtAcc += (d <= this.front + FRONT_W ? FIRE_DPS : EMBER_DPS) * dt;
    if (this.hurtAcc < 10) return;
    // (de dónde: del lado del fuego, para el indicador)
    const k = 2 / (d || 1);
    p.damage(this.hurtAcc, tmpV.set(p.pos.x + (p.pos.x - this.door.x) * k, p.pos.y, p.pos.z + (p.pos.z - this.door.z) * k));
    this.hurtAcc = 0;
  }

  // (anfitrión) Los muertos que agarra el fuego.
  burnZombies(dt) {
    const g = this.g;
    this.burnT -= dt;
    if (this.burnT > 0) return;
    this.burnT = BURN_EVERY;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || !this.burning(z.pos.x, z.pos.z)) continue;
      g.zombies.damage(z, Math.max(400, z.maxHp * 0.4), { type: 'burn', zone: 'torso', burn: true, noPoints: true, point: tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z) });
    }
  }

  // El rugido del fuego: donde el frente queda más cerca de uno, y el crepitar.
  roar(dt) {
    const g = this.g;
    const A = g.audio;
    this.roarT -= dt;
    if (this.roarT > 0 || !A?.ctx || this.front < -1) return;
    this.roarT = 0.35;
    const p = g.player.pos;
    const dx = p.x - this.door.x;
    const dz = p.z - this.door.z;
    const d = Math.hypot(dx, dz) || 1;
    const f = Math.max(0, Math.min(this.front + 1, this.maxD));
    const o = A.out({ pos: tmpP.set(this.door.x + (dx / d) * f, g.world.floorAt(p.x, p.z) + 1.5, this.door.z + (dz / d) * f), gain: 0.9, reverb: 0.25, ref: 7 });
    A.noise(o, { dur: 0.9, type: 'lowpass', freq: 420 + Math.random() * 160, q: 0.6, gain: 0.8, attack: 0.25, brown: true });
    for (let i = 0; i < 3; i++) A.noise(o, { t: A.now + Math.random() * 0.3, dur: 0.03, type: 'highpass', freq: 2400 + Math.random() * 1500, gain: 0.35 + Math.random() * 0.4 });
  }

  // Quemado: la brasa se apaga en unos segundos y sube un poco de humo, un rato.
  updateAsh(dt) {
    const g = this.g;
    this.fireT += dt;
    this.U.ember.value = Math.max(0, 1 - this.fireT / 8) * 0.16;
    if (this.fireT > 30 || Math.random() > dt * 8 || !this.n) return;
    const cam = g.camera.position;
    const i = (Math.random() * this.n) | 0;
    const x = this.px[i];
    const z = this.pz[i];
    if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > 3600) return;
    const y = g.world.floorAt(x, z);
    g.fx.alpha.spawn(x, y + 0.4, z, (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, { color: [0.16, 0.15, 0.14], size: 0.4, size1: 1.4, life: 3.5, gravity: -0.1, drag: 0.4 });
    if (Math.random() < 0.3) g.fx.sparkle(tmpV.set(x, y + 0.3, z), [1, 0.45, 0.1], 1, 0.3);
  }

  // El aviso: olor a quemado y humo que viene del fondo.
  warn() {
    const g = this.g;
    this.warnT = this.C.warn;
    const p = g.player;
    if (this.inside(p.pos.x, p.pos.z)) g.hud.subtitle('Huele a quemado...', 2.5);
  }

  updateWarn(dt) {
    const g = this.g;
    this.warnT -= dt;
    if (this.state !== 'grown' || Math.random() > dt * 10 || !this.n) return;
    // el humo, del fondo
    const lo = this.lowerBound(this.maxD * 0.75);
    const i = this.order[lo + ((Math.random() * (this.n - lo)) | 0)];
    if (i == null) return;
    const x = this.px[i];
    const z = this.pz[i];
    g.fx.alpha.spawn(x, g.world.floorAt(x, z) + 3, z, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, { color: [0.3, 0.29, 0.27], size: 0.8, size1: 3, life: 5, gravity: -0.05, drag: 0.3 });
  }

  // ---------------- lo que decide el anfitrión ----------------
  hostTick(dt) {
    const g = this.g;
    const C = this.C;
    this.syncT -= dt;
    if (this.syncT <= 0) this.send();
    // quemado: vuelve a crecer a las C.regrow rondas
    if (this.state === 'ash' && g.rounds.round >= this.ashRound + C.regrow) this.setState('grown');
    if (this.state !== 'grown') return;
    // en el paso de la cosecha no corre el tiempo: se prende al cortar la Yerba Madre
    if (this.harvestStep()) {
      if (this.timer >= 0) {
        this.timer = -1;
        this.send();
      }
      return;
    }
    if (this.timer < 0) {
      if (this.armed && this.anyoneInside()) {
        this.armed = false;
        this.timer = C.secs;
        this.send();
      }
      return;
    }
    this.timer -= dt;
    if (this.warnT <= 0 && this.timer <= C.warn && this.timer > C.warn - 1) {
      this.warn();
      g.net?.event('mato', { k: 'warn' });
    }
    if (this.timer <= 0) this.ignite();
  }

  anyoneInside() {
    const g = this.g;
    const p = g.player;
    if (p.alive && !p.downed && this.inside(p.pos.x, p.pos.z)) return true;
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && !r.downed && this.inside(r.pos.x, r.pos.z)) return true;
    return false;
  }

  // (anfitrión) Se cortó la Yerba Madre (FarmEgg) o alguien agarró el bastón (Yasy).
  ignite() {
    if (this.g.net?.guest || this.state !== 'grown') return;
    this.setState('fire');
  }

  setState(s, send = true) {
    const g = this.g;
    if (this.state === s) return;
    this.state = s;
    this.fireT = 0;
    this.timer = -1;
    if (s === 'fire') {
      this.front = this.maxD;
      this.U.front.value = this.maxD;
      this.U.ember.value = 0.16;
      this.warnT = 0;
      g.audio.explosion?.(tmpV.set(this.door.x, 1, this.door.z), 0.15);
    } else if (s === 'ash') {
      this.front = -Infinity;
      this.U.front.value = -1e5;
      this.ashRound = g.rounds.round;
      this.resetCuts();
    } else if (s === 'grown') {
      // vuelve a crecer: de la puerta hacia el fondo
      this.front = Infinity;
      this.U.front.value = 1e5;
      this.U.ember.value = 0;
      this.U.grow.value = 0;
      this.armed = true;
      this.warnT = 0;
      this.resetCuts();
      g.yasy?.onRegrow();
    }
    this.chests.onState(s);
    if (send) this.send();
  }

  send() {
    const g = this.g;
    this.syncT = this.state === 'fire' || this.timer >= 0 ? 3 : 8;
    if (!g.net?.host) return;
    // (ft y no t: la t es el tipo del mensaje de la red)
    g.net.event('mato', { k: 'st', s: this.state, ft: +this.fireT.toFixed(2), r: this.ashRound, tm: +this.timer.toFixed(1), ch: this.chests.net() });
  }

  // ---------------- para los Yasy ----------------
  // Un lugar adentro, entre min y max metros de alguno de los de adentro.
  randomSpot(ins, min, max) {
    for (let k = 0; k < 30; k++) {
      const c = ins[(Math.random() * ins.length) | 0]?.p?.pos;
      if (!c) break;
      const a = Math.random() * Math.PI * 2;
      const d = min + Math.random() * (max - min);
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      if (!this.inside(x, z) || this.inProp(x, z)) continue;
      if (ins.some(({ p }) => Math.hypot(p.pos.x - x, p.pos.z - z) < min)) continue;
      return [x, z];
    }
    const i = (Math.random() * this.n) | 0;
    return [this.px[i], this.pz[i]];
  }

  inProp(x, z) {
    return this.camps.boxes.some((b) => x > b[0] - 0.4 && x < b[3] + 0.4 && z > b[2] - 0.4 && z < b[5] + 0.4);
  }

  // ---------------- red ----------------
  onEvent(m) {
    const g = this.g;
    if (m.k === 'chest' || m.k === 'open' || m.k === 'opened') {
      this.chests.onEvent(m);
      return;
    }
    if (m.k === 'cut') {
      const c = m.c || [];
      for (let i = 0; i + 6 < c.length; i += 7) this.cutArc(c[i], c[i + 1], c[i + 2], c[i + 3], c[i + 4], c[i + 5], c[i + 6]);
      return;
    }
    if (!g.net?.guest) return;
    if (m.k === 'warn') this.warn();
    else if (m.k === 'st') {
      if (m.s !== this.state) this.setState(m.s, false);
      if (m.s === 'fire') this.fireT = m.ft;
      this.ashRound = m.r;
      this.timer = m.tm;
      if (m.ch) this.chests.apply(m.ch);
    }
  }

  // Alt+K y las pruebas: prenderlo ya.
  debugIgnite() {
    this.ignite();
  }
}
