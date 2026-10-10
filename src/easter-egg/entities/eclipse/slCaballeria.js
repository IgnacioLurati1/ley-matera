import * as THREE from 'three';
import { whenModel, MODEL } from './montar';
import { toWorld, toLocal, hLoc, yawOf, dirWorld, avoidProps, edgeU } from '../../world/eclipse/sanlorenzoCampo';

// La caballería entera de San Lorenzo (fase 4, el clímax: entities/eclipse/
// SanLorenzo.js): después de Cabral, San Martín la larga y dos alas de
// granaderos (hasta 48) salen de atrás del convento, pasan en columna por las
// puntas del muro, se abren en línea en el llano, barren a los realistas y
// llegan a la barranca: ahí el sol estalla y las lanzas de luz voltean a El
// Eclipse. Después dan la vuelta por el borde y vuelven al convento.
//
// Barato: TRES dibujos para todos. El caballo es el zaino de skins/caballo.js
// con su galope horneado en una textura (posiciones por vértice, 16 cuadros:
// el sombreador interpola por instancia, sin huesos); el jinete y su sable son
// un granadero de verdad (slAliados) en la pose de carga, copiado una vez en la
// arena y montado sobre el lomo del cuadro que toca. Los programas se compilan
// en la carga con datos de relleno (las mismas variantes: instancias, mapa,
// caras planas). Sin sombras (el polvo las tapa). __mduNoSlCaballeria: sin esto.

const FRAMES = 16;
const VAT_W = 2048;
// el galope: m/s y largo del tranco (skins/caballo GAITS.galope.L)
const SPEED = 14;
const STRIDE = 4.0;
// la formación: por ala, de a FILES en fondo, separados así (m)
const FILES = 8;
const GAP_L = 2.6;
const GAP_A = 4.2;
// el camino de cada ala (u, v; el sur es el mismo con -v): de atrás del convento,
// en columna entre la punta del muro y el palenque, en línea por el llano hasta
// la barranca, la vuelta por el borde y de nuevo al convento
const PATH = [
  [-78, 39],
  [-62, 39],
  [-48, 38.5],
  [-38, 36.5],
  [-27, 31],
  [-12, 24],
  [4, 18.5],
  [20, 15],
  [33, 14],
  [39.5, 14],
  [37, 21],
  [31, 30],
  [22, 37],
  [4, 39.5],
  [-20, 39.5],
  [-40, 38.5],
  [-56, 39.5],
  [-76, 40],
];
// cuánto se abre la línea en cada punto del camino (0,45: en columna)
const SPREAD = [0.42, 0.42, 0.42, 0.45, 0.7, 0.95, 1, 1, 1, 1, 0.75, 0.6, 0.55, 0.45, 0.42, 0.42, 0.42, 0.42];
// (2026-10-07, el usuario: "los granaderos salen detrás de la pared del convento
// y se quedan trabados corriendo contra la pared": el ala del sur salía de
// adentro de la tapia, la cruzaba y corría contra la galería del claustro. Ahora
// sale por el portón de la tapia (sanlorenzoCampo), por el medio entre la tapia
// y el claustro y un poco más junta. __mduOldSlTapia: el camino de antes)
if (globalThis.__mduOldSlTapia !== true) {
  PATH[0][1] = 40.6;
  PATH[1][1] = 40.6;
  PATH[2][1] = 39.6;
  SPREAD[0] = SPREAD[1] = SPREAD[2] = 0.38;
}
// dónde está la barranca en el camino (el punto 9)
const EDGE_I = 9;

const tmpM = new THREE.Matrix4();
const tmpN = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpE = new THREE.Euler();
const L = {};
const UPV = new THREE.Vector3(0, 1, 0);
const fract = (x) => x - Math.floor(x);

// El galope en el sombreador: la posición de cada vértice sale de la textura
// (dos cuadros, interpolados por la fase de la instancia).
function vatPatch(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uVat;\nuniform float uVerts, uFrames, uVatW;\nattribute float aGal;').replace(
      '#include <begin_vertex>',
      `float fph = fract(aGal) * uFrames;
      float f0 = floor(fph);
      float fr = fph - f0;
      float f1 = mod(f0 + 1.0, uFrames);
      int VW = int(uVatW);
      int i0 = int(f0) * int(uVerts) + gl_VertexID;
      int i1 = int(f1) * int(uVerts) + gl_VertexID;
      vec3 transformed = mix(texelFetch(uVat, ivec2(i0 % VW, i0 / VW), 0).xyz, texelFetch(uVat, ivec2(i1 % VW, i1 / VW), 0).xyz, fr);`,
    );
  };
  mat.customProgramCacheKey = () => 'slVatCaballo';
}

// El banderín de la lanza (uno de cada seis): el asta desde la montura y el
// paño celeste, blanco y celeste hacia atrás (en el lomo del caballo, como el jinete).
function banderin() {
  const pos = [];
  const col = [];
  const q = (a, b, c, d, cl) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) col.push(...cl);
  };
  // el asta: un prisma fino de 3,4 m
  const x = 0.32;
  const z = 0.15;
  const r = 0.025;
  const y0 = 1.1;
  const y1 = 4.5;
  const wood = [0.32, 0.22, 0.13];
  for (const [ax, az, bx, bz] of [
    [-r, -r, r, -r],
    [r, -r, r, r],
    [r, r, -r, r],
    [-r, r, -r, -r],
  ])
    q([x + ax, y0, z + az], [x + bx, y0, z + bz], [x + bx, y1, z + bz], [x + ax, y1, z + az], wood);
  // la moharra
  q([x - 0.03, y1, z], [x + 0.03, y1, z], [x, y1 + 0.3, z], [x, y1 + 0.3, z], [0.75, 0.75, 0.78]);
  // el paño: tres franjas, de los dos lados
  const cel = [0.45, 0.67, 0.87];
  const bla = [0.95, 0.95, 0.92];
  const bands = [
    [y1 - 0.05, y1 - 0.25, cel],
    [y1 - 0.25, y1 - 0.45, bla],
    [y1 - 0.45, y1 - 0.65, cel],
  ];
  for (const [ya, yb, cl] of bands) {
    const a = [x, ya, z];
    const b = [x, ya, z - 1.3];
    const c = [x, yb, z - 1.3 + (y1 - yb) * 0.15];
    const d = [x, yb, z];
    q(a, b, c, d, cl);
    q(a, d, c, b, cl);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Un triángulo de relleno (para compilar en la carga).
function dummyGeo(withGal) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  if (withGal) g.setAttribute('aGal', new THREE.InstancedBufferAttribute(new Float32Array(64), 1));
  return g;
}

export default class Caballeria {
  constructor(sl) {
    this.sl = sl;
    this.g = sl.g;
    const g = this.g;
    this.off = globalThis.__mduNoSlCaballeria === true;
    const q = g.settings?.quality;
    this.N = q === 'perf' || q === 'low' ? 20 : q === 'medium' ? 32 : 48;
    this.root = new THREE.Group();
    this.root.name = 'slCaballeria';
    sl.actors.add(this.root);
    this.on = false;
    this.t = 0;
    this.baked = false;
    this.riderOk = false;
    // los materiales (con relleno: se compilan ya, con el mapa)
    const ph = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    ph.colorSpace = THREE.SRGBColorSpace;
    ph.needsUpdate = true;
    const vat0 = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    vat0.needsUpdate = true;
    this.U = { uVat: { value: vat0 }, uVerts: { value: 1 }, uFrames: { value: 1 }, uVatW: { value: 1 } };
    // (el zaino con la luz del alba se iba a colorado: un poco más oscuro y apagado)
    this.horseMat = new THREE.MeshStandardMaterial({ map: ph, color: new THREE.Color(0.62, 0.56, 0.54), roughness: 0.85, metalness: 0, flatShading: true });
    vatPatch(this.horseMat, this.U);
    this.riderMat = new THREE.MeshStandardMaterial({ map: ph, roughness: 0.85, metalness: 0, flatShading: true });
    this.sableMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55, flatShading: true });
    const N = this.N;
    this.horses = new THREE.InstancedMesh(dummyGeo(true), this.horseMat, N);
    this.riders = new THREE.InstancedMesh(dummyGeo(false), this.riderMat, N);
    this.sables = new THREE.InstancedMesh(dummyGeo(false), this.sableMat, N);
    for (const m of [this.horses, this.riders, this.sables]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = true;
      // (en la carga: uno lejos abajo, para compilar; en la arena, escondidos hasta la carga)
      m.setMatrixAt(0, tmpM.makeTranslation(0, -500, 0));
      m.count = 1;
      this.root.add(m);
    }
    // los banderines: uno de cada seis (mismo material que los sables)
    this.flagIdx = [];
    for (let i = 0; i < N; i++) if (i % 6 === 2) this.flagIdx.push(i);
    this.flags = new THREE.InstancedMesh(banderin(), this.sableMat, Math.max(1, this.flagIdx.length));
    this.flags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flags.frustumCulled = false;
    this.flags.count = 0;
    this.flags.name = 'slCaballeriaBanderines';
    this.root.add(this.flags);
    this.horses.name = 'slCaballeriaCaballos';
    this.riders.name = 'slCaballeriaJinetes';
    this.sables.name = 'slCaballeriaSables';
    this.gal = new Float32Array(N);
    // cada jinete: su lugar en el ala, su paso y su fase
    this.list = [];
    for (let i = 0; i < N; i++) {
      const wing = i < N / 2 ? 1 : -1;
      const k = i % (N / 2);
      const file = k % FILES;
      const rank = Math.floor(k / FILES);
      this.list.push({ i, wing, file, rank, ph: fract(Math.sin(i * 12.9898) * 43758.5453), lag: (Math.sin(i * 3.7) * 0.5 + 0.5) * 1.2, wob: Math.sin(i * 7.1) * 0.6, pos: new THREE.Vector3(), yaw: 0, at: 0 });
    }
    // el camino de cada ala (en el mundo) y lo largo de cada tramo
    this.paths = [1, -1].map((s) => {
      const pts = PATH.map(([u, v]) => toWorld(u, v * s, 0, new THREE.Vector3()).setY(0));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      const len = curve.getLength();
      // (dónde cae cada punto del camino a lo largo: para el ancho y la barranca)
      const at = [];
      const divs = curve.getLengths(600);
      for (let j = 0; j < pts.length; j++) {
        let best = 0;
        let bd = Infinity;
        for (let q = 0; q <= 600; q++) {
          curve.getPointAt(q / 600, tmpV);
          const d = tmpV.distanceToSquared(pts[j]);
          if (d < bd) {
            bd = d;
            best = q / 600;
          }
        }
        at.push(best * len);
      }
      return { s, curve, len, at, divs };
    });
    if (this.off) return;
    // el galope, horneado en cuanto baja el caballo (después de skins/caballo)
    whenModel(MODEL.caballo, () => {
      try {
        this.bakeHorse();
      } catch (e) {
        console.warn('caballería: sin galope', e);
      }
    });
  }

  // Lo que la carga (ui/Arrival) tiene que mostrar para compilar.
  warmList() {
    return [this.root, this.horses, this.riders, this.sables, this.flags];
  }

  // ---------------- el horneado ----------------
  // El zaino al galope, 16 cuadros: cada vértice ya con sus huesos (en el
  // lugar del caballo, sin girar), a una textura de punto flotante. Y el lomo
  // de cada cuadro (para montar al jinete).
  bakeHorse() {
    const C = this.sl.al?.C;
    if (!C?.ready || this.baked) return;
    const h = C.add({ x: 0, y: 0, z: 0, yaw: 0 });
    h.gait = 'galope';
    h.speed = SPEED;
    for (let i = 0; i < 40; i++) h.step(0.05);
    const geo = C.geo;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const n = pos.count;
    const H = Math.ceil((n * FRAMES) / VAT_W);
    const data = new Float32Array(VAT_W * H * 4);
    const NB = C.inv.length;
    const M = Array.from({ length: NB }, () => new THREE.Matrix4());
    this.body = [];
    const v = new THREE.Vector3();
    const acc = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    for (let f = 0; f < FRAMES; f++) {
      h.phase = f / FRAMES;
      h.step(0);
      h.draw();
      for (let b = 0; b < NB; b++) M[b].multiplyMatrices(h.W[b], C.inv[b]);
      const bp = new THREE.Vector3();
      const bq = new THREE.Quaternion();
      h.W[0].decompose(bp, bq, tmp);
      this.body.push({ p: bp, q: bq });
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i);
        acc.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (w <= 0) continue;
          tmp.copy(v).applyMatrix4(M[si.getComponent(i, k)]);
          acc.addScaledVector(tmp, w);
        }
        const o = (f * n + i) * 4;
        data[o] = acc.x;
        data[o + 1] = acc.y;
        data[o + 2] = acc.z;
        data[o + 3] = 1;
      }
    }
    // el de muestra se va
    h.dispose();
    const tex = new THREE.DataTexture(data, VAT_W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.U.uVat.value = tex;
    this.U.uVerts.value = n;
    this.U.uFrames.value = FRAMES;
    this.U.uVatW.value = VAT_W;
    this.g.renderer?.initTexture?.(tex);
    // la malla del caballo: la del zaino sin huesos, con la fase por instancia
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', pos.clone());
    if (geo.attributes.uv) hg.setAttribute('uv', geo.attributes.uv.clone());
    if (geo.attributes.normal) hg.setAttribute('normal', geo.attributes.normal.clone());
    const ga = new THREE.InstancedBufferAttribute(this.gal, 1);
    ga.setUsage(THREE.DynamicDrawUsage);
    hg.setAttribute('aGal', ga);
    this.galAttr = ga;
    this.horses.geometry.dispose();
    this.horses.geometry = hg;
    if (C.mat?.map) this.horseMat.map = C.mat.map;
    this.baked = true;
  }

  // El jinete: un granadero de verdad del escuadrón sur (formado), un momento
  // en la pose de carga; se copia su malla (y la del sable) en el lomo de su caballo.
  captureRider() {
    const al = this.sl.al;
    const S = al?.sq?.[1];
    const R = S?.riders?.[S.riders.length - 1];
    const G = R?.a?.gs;
    if (!G?.mesh || !R.h?.mesh || S.state !== 'formed') return false;
    const mesh = G.mesh;
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const inv = tmpN.copy(R.h.W[0]).invert();
    const src = mesh.geometry;
    const n = src.attributes.position.count;
    const out = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(out, 3));
    if (src.attributes.uv) rg.setAttribute('uv', src.attributes.uv.clone());
    if (src.index) rg.setIndex(src.index.clone());
    rg.computeVertexNormals();
    this.riders.geometry.dispose();
    this.riders.geometry = rg;
    if (G.mat?.map) this.riderMat.map = G.mat.map;
    // el sable
    const s = G.sable;
    if (s) {
      let sm = null;
      s.traverse((o) => {
        if (o.isMesh && !sm) sm = o;
      });
      if (sm?.geometry) {
        sm.updateMatrixWorld(true);
        const sg = sm.geometry.clone();
        sg.applyMatrix4(tmpM.multiplyMatrices(inv, sm.matrixWorld));
        if (!sg.attributes.color) {
          const c = new Float32Array(sg.attributes.position.count * 3).fill(0.8);
          sg.setAttribute('color', new THREE.BufferAttribute(c, 3));
        }
        this.sables.geometry.dispose();
        this.sables.geometry = sg;
      }
    }
    this.riderOk = true;
    return true;
  }

  // ---------------- la carga ----------------
  reset() {
    this.on = false;
    this.t = 0;
    this.hide();
  }

  hide() {
    for (const m of [this.horses, this.riders, this.sables, this.flags]) m.count = 0;
  }

  // Sale la caballería (todas las compus; SanLorenzo, fase 4).
  start() {
    if (this.off || !this.baked) return false;
    this.on = true;
    this.t = 0;
    this.struck = false;
    this.hits = new Set();
    for (const m of [this.horses, this.riders, this.sables]) m.count = this.N;
    if (!this.riderOk) this.riders.count = this.sables.count = 0;
    this.flags.count = this.riderOk && this.body ? this.flagIdx.length : 0;
    return true;
  }

  // Llegaron a la barranca: las lanzas de luz al pecho de El Eclipse (SanLorenzo.cavHit).
  strike() {
    if (!this.on) return;
    const g = this.g;
    const B = this.sl.boss;
    const at = B.bodyAt(tmpW).clone();
    let k = 0;
    for (const R of this.list) {
      if (R.rank > 0 || k++ > 12) continue;
      const from = R.pos.clone().setY(R.pos.y + 2.6);
      for (let j = 0; j < 3; j++) {
        g.later(j * 0.28 + Math.random() * 0.15, () => {
          const to = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 16));
          g.fx.beam(from, to, { color: 0xffd070, width: 0.5, life: 0.35 });
          g.fx.sparkle(to, [1, 0.85, 0.4], 6, 3);
        });
      }
    }
    // y el sol, de lleno
    for (let j = 0; j < 4; j++) {
      g.later(0.2 + j * 0.3, () => {
        const from = at.clone().add(new THREE.Vector3(0, 160, 0)).addScaledVector(dirWorld(1, 0, tmpV), 140);
        g.fx.beam(from, at, { color: 0xfff0b0, width: 3.5, life: 0.5 });
        g.fx.flash(at, 0xffd070, 60, 0.6, 120);
      });
    }
  }

  // El ala w en el punto s del camino: dónde y para dónde (y el ancho de la línea).
  sample(P, s, out) {
    const sc = Math.max(0, Math.min(P.len, s));
    const u = sc / P.len;
    P.curve.getPointAt(u, out.p);
    P.curve.getTangentAt(u, out.t);
    out.t.y = 0;
    out.t.normalize();
    // (el ancho: interpolado entre los puntos del camino)
    let j = 0;
    while (j < P.at.length - 2 && P.at[j + 1] < sc) j++;
    const a = P.at[j];
    const b = P.at[j + 1];
    const k = b > a ? Math.max(0, Math.min(1, (sc - a) / (b - a))) : 0;
    out.spread = SPREAD[j] + (SPREAD[j + 1] - SPREAD[j]) * k;
    return out;
  }

  update(dt) {
    if (this.off) return;
    const sl = this.sl;
    // (el jinete se copia una vez, apenas se puede, en la arena)
    if (!this.riderOk && sl.active && sl.t > 1.0) this.tryCapture(dt);
    if (!this.on) return;
    const g = this.g;
    this.t += dt;
    const S0 = this.t * SPEED;
    const end = this.paths[0].len + (Math.ceil(this.N / 2 / FILES) + 1) * GAP_A;
    if (S0 > end) {
      this.on = false;
      this.hide();
      return;
    }
    const smp = { p: new THREE.Vector3(), t: new THREE.Vector3(), spread: 1 };
    const cab = this.sl.al?.cabral?.a?.r?.pos;
    const im = this.horses;
    let near = Infinity;
    const cam = g.camera.position;
    for (const R of this.list) {
      const P = this.paths[R.wing > 0 ? 0 : 1];
      // (cada uno con su atraso y un vaivén: no en fila de soldaditos)
      const s = S0 - R.rank * GAP_A - R.lag + Math.sin(this.t * 1.3 + R.i) * 0.5;
      this.sample(P, s, smp);
      const lat = (R.file - (FILES - 1) / 2) * GAP_L * smp.spread + R.wob * smp.spread;
      // (a la derecha de la marcha: -z de la tangente girada)
      const x = smp.p.x - smp.t.z * lat * R.wing;
      const z = smp.p.z + smp.t.x * lat * R.wing;
      R.pos.set(x, 0, z);
      // (no pisan a Cabral: lo esquivan)
      if (cab) {
        const dx = R.pos.x - cab.x;
        const dz = R.pos.z - cab.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.5 && d > 1e-3) {
          R.pos.x = cab.x + (dx / d) * 3.5;
          R.pos.z = cab.z + (dz / d) * 3.5;
        }
      }
      toLocal(R.pos.x, R.pos.z, L);
      // (sesión 1f, el usuario: "los granaderos casi se salen del mapa": en la
      // vuelta por la barranca la línea abierta (±9 m) pasaba el borde. Nadie
      // más allá de 3 m antes de la barranca. __mduNoCavEdge: como antes)
      if (globalThis.__mduNoCavEdge !== true) {
        const lim = edgeU(L.v) - 3;
        if (L.u > lim) {
          L.u = lim;
          toWorld(L.u, L.v, 0, R.pos);
        }
      }
      // (los troncos, las carretas, los cañones: los rodean)
      if (avoidProps(L, 1.5)) toWorld(L.u, L.v, 0, R.pos);
      R.pos.y = hLoc(L.u, L.v);
      R.yaw = Math.atan2(smp.t.x, smp.t.z);
      // (los que todavía no salieron, o ya volvieron: abajo de todo)
      const vis = s > -2 && s < P.len - 1;
      R.vis = vis;
      R.at = s;
      // el galope: la fase por instancia (el tranco a la velocidad)
      const gp = R.ph + (this.t * SPEED) / STRIDE;
      this.gal[R.i] = fract(gp);
      tmpQ.setFromAxisAngle(UPV, R.yaw);
      tmpM.compose(vis ? R.pos : tmpV.set(0, -500, 0), tmpQ, tmpS.set(1, 1, 1));
      im.setMatrixAt(R.i, tmpM);
      // el jinete y el sable: sobre el lomo del cuadro que toca
      if (this.riderOk && this.body) {
        const ff = fract(gp) * FRAMES;
        const f0 = Math.floor(ff) % FRAMES;
        const f1 = (f0 + 1) % FRAMES;
        const fr = ff - Math.floor(ff);
        const A = this.body[f0];
        const B = this.body[f1];
        tmpV.lerpVectors(A.p, B.p, fr);
        tmpQ2.slerpQuaternions(A.q, B.q, fr);
        tmpN.compose(tmpV, tmpQ2, tmpS.set(1, 1, 1));
        tmpN.premultiply(tmpM);
        this.riders.setMatrixAt(R.i, tmpN);
        this.sables.setMatrixAt(R.i, tmpN);
        const fi = this.flagIdx.indexOf(R.i);
        if (fi >= 0) this.flags.setMatrixAt(fi, tmpN);
      }
      if (vis) near = Math.min(near, R.pos.distanceTo(cam));
      // el polvo
      if (vis && Math.random() < dt * 9) g.fx.alpha.spawn(R.pos.x + (Math.random() - 0.5), R.pos.y + 0.2, R.pos.z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.6 - Math.sin(R.yaw) * 2, 0.6 + Math.random() * 1.0, (Math.random() - 0.5) * 1.6 - Math.cos(R.yaw) * 2, { color: [0.5, 0.43, 0.34], size: 0.8, size1: 3.6, life: 1.8 + Math.random() * 1.0, alpha: 0.32, drag: 1.2, gravity: -0.12 });
    }
    im.instanceMatrix.needsUpdate = true;
    if (this.galAttr) this.galAttr.needsUpdate = true;
    if (this.riderOk) {
      this.riders.instanceMatrix.needsUpdate = true;
      this.sables.instanceMatrix.needsUpdate = true;
      this.flags.instanceMatrix.needsUpdate = true;
    }
    // el trueno de los cascos (más cerca, más fuerte) y la tierra que tiembla
    this.hoofT = (this.hoofT || 0) - dt;
    if (this.hoofT <= 0 && near < 140) {
      this.hoofT = 0.06;
      const A = g.audio;
      if (A?.ctx) {
        const c = this.paths[0].curve.getPointAt(Math.min(1, S0 / this.paths[0].len), tmpW);
        toLocal(c.x, c.z, L);
        const p = toWorld(L.u, 0);
        const o = A.out({ pos: p, gain: 1.1, reverb: 0.4, ref: 14 });
        const t = A.now;
        A.hoof(o, t, 1);
        A.hoof(o, t + 0.02 + Math.random() * 0.02, 0.8);
        A.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 140, gain: 0.5, brown: true });
        if (Math.random() < 0.04) A.neigh?.(p, 0.95 + Math.random() * 0.2);
      }
    }
    if (near < 40) g.fx.addShake(0.02 * (1 - near / 40));
    // (anfitrión) los realistas que agarra la línea
    if (this.sl.host) this.sweep();
  }

  // (anfitrión) Los muertos dentro de la formación de alguna ala: volando.
  sweep() {
    const g = this.g;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || this.hits.has(z.id)) continue;
      for (const R of this.list) {
        if (!R.vis || R.rank > 1) continue;
        const dx = z.pos.x - R.pos.x;
        const dz = z.pos.z - R.pos.z;
        if (dx * dx + dz * dz > 5.5) continue;
        this.hits.add(z.id);
        const dir = new THREE.Vector3(Math.sin(R.yaw), 0.7, Math.cos(R.yaw)).normalize();
        g.zombies.damage(z, (z.maxHp || 1000) * 4 + 10, { type: 'blast', zone: 'torso', point: new THREE.Vector3(z.pos.x, z.pos.y + 1.1, z.pos.z), dir, noPoints: true });
        this.sl.onAllyKill?.(z);
        break;
      }
    }
  }

  // El jinete: primero lo pone en la pose de carga; un rato después lo copia.
  tryCapture(dt) {
    const al = this.sl.al;
    const S = al?.sq?.[1];
    const R = S?.riders?.[S.riders.length - 1];
    if (!R?.a?.gs || !R.h?.mesh || S.state !== 'formed') return;
    this.capT = (this.capT || 0) + dt;
    if (this.capT < 0.05) {
      this.capWas = R.m.brazos;
      R.m.brazos = 'carga';
      return;
    }
    if (this.capT < 0.9) return;
    try {
      this.captureRider();
    } catch (e) {
      console.warn('caballería: sin jinete', e);
      this.riderOk = true;
    }
    R.m.brazos = this.capWas || 'riendas';
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of [this.horses, this.riders, this.sables, this.flags]) m.geometry.dispose();
    this.horseMat.dispose();
    this.riderMat.dispose();
    this.sableMat.dispose();
    this.U.uVat.value?.dispose?.();
  }
}
