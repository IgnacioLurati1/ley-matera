import * as THREE from 'three';
import { DOORS } from '../../config/map';

// Cómo se ve y cómo suena la trampa del desgarro (arte6, 2026-10-06; el
// usuario: "las trampas de la deformidad son feas, su activación es fea y son
// bastante débiles"). Lo usa entities/eclipse/Trampas.js (la lógica, la red).
//  · Quieta: una costura del desgarro en el piso (la grieta negra con el borde
//    violeta que late), el círculo de runas que marca hasta dónde llega y el
//    ancla: una piedra negra con runas, el cristal que flota arriba y la palanca.
//  · En descanso: la costura apagada, el círculo se va llenando como un reloj,
//    el cristal oscuro.
//  · Al abrirse: la costura se raja, el tajo vertical del vacío sube del piso,
//    la onda que barre (mata a todo lo de alrededor), el remolino violeta en el
//    piso y tres hojas de vacío que giran; temblor cerca, trueno de vidrio.
//  · Abierta: cada muerto que entra, un rayo del tajo y se lo chupa.
// Todo se arma en la carga; lo que se prende al abrir va en w.warmHidden (se
// compila con el resto). Sin luces nuevas (los destellos son los de g.fx).

const VOID_GLSL = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 stars(vec2 p) {
  vec2 c = floor(p);
  float h = h21(c);
  vec2 f = fract(p) - 0.5;
  float d = length(f - (vec2(h21(c + 7.1), h21(c + 3.3)) - 0.5) * 0.6);
  float s = step(0.86, h) * (1.0 - smoothstep(0.0, 0.08, d));
  return vec3(0.85, 0.75, 1.0) * s;
}
`;
const VIO = 'vec3(0.62, 0.3, 1.0)';

// la costura: una cinta por una línea quebrada (+ ramas); aTaper = cuánto ancho en ese punto
function seamGeometry(R, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const P = [];
  const U = [];
  const A = [];
  const I = [];
  const line = (pts, wMax) => {
    const b = P.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const [x, z] = pts[k];
      const [px, pz] = pts[Math.max(0, k - 1)];
      const [nx2, nz2] = pts[Math.min(pts.length - 1, k + 1)];
      let tx = nx2 - px;
      let tz = nz2 - pz;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const t = k / (pts.length - 1);
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 0.85 + 0.15 * (k > 0 && k < pts.length - 1 ? 1 : 0);
      for (const sd of [-1, 1]) {
        P.push(x - tz * sd * wMax, 0, z + tx * sd * wMax);
        U.push(t, sd < 0 ? 0 : 1);
        A.push(taper);
      }
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = b + k * 2;
      I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  const L = R * 0.92;
  const main = [];
  const n = 13;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    main.push([-L + 2 * L * t, (k === 0 || k === n ? 0 : (rnd() - 0.5) * 0.7)]);
  }
  line(main, 0.62);
  // dos ramas que salen de la grieta grande
  for (let b = 0; b < 3; b++) {
    const k0 = 3 + Math.floor(rnd() * (n - 6));
    const [x0, z0] = main[k0];
    const a = (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.8) + (rnd() < 0.5 ? 0 : Math.PI);
    const len = R * (0.35 + rnd() * 0.3);
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push([x0 + Math.cos(a) * len * (k / 5) + (k ? (rnd() - 0.5) * 0.3 : 0), z0 + Math.sin(a) * len * (k / 5) + (k ? (rnd() - 0.5) * 0.3 : 0)]);
    line(pts, 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aTaper', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

const SHARED = { mats: null, geos: null };
function shared() {
  if (SHARED.mats) return SHARED.mats;
  const common = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
  const seam = new THREE.ShaderMaterial({
    ...common,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uTime: { value: 0 }, uW: { value: 0.25 }, uGlow: { value: 1 }, uHot: { value: 0 } },
    vertexShader: `attribute float aTaper; varying vec2 vUv; varying float vT; varying vec3 vW;
      void main() { vUv = uv; vT = aTaper; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform float uW; uniform float uGlow; uniform float uHot; varying vec2 vUv; varying float vT; varying vec3 vW;
      ${VOID_GLSL}
      void main() {
        float d = abs(vUv.y - 0.5) * 2.0;
        // el borde quebrado: el ancho tiembla a lo largo
        float jag = 0.8 + 0.2 * sin(vUv.x * 63.0 + uTime * 0.7) + 0.15 * (h21(vec2(floor(vUv.x * 40.0), 1.0)) - 0.5);
        float wv = max(uW * vT * jag, 0.001);
        float core = 1.0 - smoothstep(wv * 0.55, wv * 0.7, d);
        float rim = (1.0 - smoothstep(wv * 0.55, wv * 1.05, d)) * (1.0 - core);
        float halo = (1.0 - smoothstep(wv, min(1.0, wv * 2.4 + 0.15), d));
        vec3 voidc = vec3(0.012, 0.0, 0.03) + stars(vW.xz * 9.0 + vec2(uTime * 0.05, 0.0)) * 1.4;
        vec3 vio = ${VIO};
        vec3 hot = mix(vio * 2.6, vec3(1.6, 1.3, 2.2), uHot);
        vec3 col = voidc * core + hot * rim * uGlow + vio * halo * 0.6 * uGlow * (1.0 - core);
        float a = clamp(core + rim * uGlow + halo * 0.55 * uGlow, 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const ring = new THREE.ShaderMaterial({
    ...common,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: { uTime: { value: 0 }, uFill: { value: 1 }, uK: { value: 0.6 }, uSpin: { value: 0 }, uCol: { value: new THREE.Color(0x9a5cff) } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uFill; uniform float uK; uniform float uSpin; uniform vec3 uCol; varying vec2 vP;
      void main() {
        float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
        float seg = fract((a + uSpin) * 28.0);
        float dash = smoothstep(0.08, 0.2, seg) * (1.0 - smoothstep(0.62, 0.74, seg));
        float lit = step(fract(a + 0.25), uFill);
        float k = uK * (lit * dash + (1.0 - lit) * dash * 0.12);
        gl_FragColor = vec4(uCol * k * 1.8, 1.0);
      }`,
  });
  const vortex = new THREE.ShaderMaterial({
    ...common,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uR: { value: 4 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uOpen; uniform float uR; varying vec2 vP;
      ${VOID_GLSL}
      void main() {
        float r = length(vP) / uR;
        float a = atan(vP.y, vP.x);
        float sp = sin(a * 4.0 + r * 13.0 - uTime * 7.0);
        float arms = smoothstep(0.25, 1.0, sp);
        float rim = smoothstep(0.82, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        vec3 vio = ${VIO};
        vec3 col = vec3(0.015, 0.0, 0.035) + stars(vP * 4.0 + vec2(uTime * 0.3, 0.0)) + vio * arms * (1.3 - r) * 0.55 + vio * rim * 1.3;
        float a2 = uOpen * (1.0 - smoothstep(0.9, 1.0, r)) * (0.72 + 0.2 * arms + 0.08 * (1.0 - r)) + uOpen * rim * 0.6;
        if (a2 < 0.01) discard;
        gl_FragColor = vec4(col, clamp(a2, 0.0, 1.0));
      }`,
  });
  const rift = new THREE.ShaderMaterial({
    ...common,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uH: { value: 0 }, uW: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uH; uniform float uW; varying vec2 vUv;
      ${VOID_GLSL}
      void main() {
        float y = vUv.y;
        if (y > uH) discard;
        float x = abs(vUv.x - 0.5) * 2.0;
        float prof = sin(3.14159 * clamp(y / max(uH, 0.01), 0.0, 1.0));
        float jag = 0.85 + 0.15 * sin(y * 37.0 + uTime * 4.0) + 0.12 * (h21(vec2(floor(y * 26.0), floor(uTime * 8.0))) - 0.5);
        float wv = max(0.5 * prof * jag * uW, 0.002);
        float core = 1.0 - smoothstep(wv * 0.9, wv, x);
        float rim = (1.0 - smoothstep(wv, wv + 0.04, x)) * (1.0 - core);
        float halo = (1.0 - smoothstep(wv, wv + 0.3, x)) * prof;
        vec3 vio = ${VIO};
        vec3 col = vec3(0.01, 0.0, 0.03) + stars(vUv * vec2(10.0, 24.0) + vec2(0.0, uTime * 0.4)) * 1.5;
        col = col * core + mix(vio * 2.0, vec3(1.6, 1.3, 2.0), 0.4) * rim + vio * 0.6 * halo * (1.0 - core - rim);
        float a = clamp(core + rim + halo * 0.35, 0.0, 1.0) * smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(uH - 0.06, uH, y));
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const blade = new THREE.ShaderMaterial({
    ...common,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; varying vec2 vP;
      void main() {
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float t = clamp(a / 2.3, 0.0, 1.0);
        float e = clamp((r - 0.82) / 0.42, 0.0, 1.0);
        float body = sin(3.14159 * t) * (0.25 + e * e * 1.8);
        vec3 col = ${VIO} * body * 1.1 + vec3(0.9, 0.8, 1.1) * smoothstep(0.85, 1.0, e) * sin(3.14159 * t) * 0.9;
        gl_FragColor = vec4(col * uK, 1.0);
      }`,
  });
  const wave = new THREE.MeshBasicMaterial({ color: 0x8a50ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  const runes = new THREE.MeshBasicMaterial({ color: 0x9a5cff, toneMapped: false, fog: false });
  const crystal = new THREE.MeshStandardMaterial({ color: 0x1a0830, emissive: 0x8a3cff, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.1, flatShading: true });
  SHARED.mats = { seam, ring, vortex, rift, blade, wave, runes, crystal };
  SHARED.geos = {
    ring: (R) => new THREE.RingGeometry(R - 0.09, R + 0.07, 112, 1).rotateX(-Math.PI / 2),
    disc: (R) => new THREE.RingGeometry(0.02, R * 1.04, 72, 16).rotateX(-Math.PI / 2),
    rift: new THREE.PlaneGeometry(2.6, 4.6).translate(0, 2.3, 0),
    blade: new THREE.RingGeometry(0.82, 1.24, 28, 1, 0, 2.3),
    waveRing: new THREE.RingGeometry(0.86, 1.0, 72, 1).rotateX(-Math.PI / 2),
    waveWall: new THREE.CylinderGeometry(1, 1, 1.8, 48, 1, true).translate(0, 0.9, 0),
  };
  return SHARED.mats;
}

// El lugar del ancla: contra la pared más cercana fuera del círculo (sin choque:
// lo visual nunca cambia el paso), lejos de las puertas; si no hay, al borde.
function anchorSpot(w, pos, R) {
  const doorNear = (x, z) => DOORS.some((d) => d.cells.some(([cx, cz]) => Math.hypot(cx + 0.5 - x, cz + 0.5 - z) < 1.6));
  let best = null;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let wall = null;
    for (let d = R + 0.3; d < R + 2.6; d += 0.2) {
      const x = pos.x + dx * d;
      const z = pos.z + dz * d;
      const fy = w.floorAt(x, z, pos.y + 1.5);
      if (!(Math.abs(fy - pos.y) < 0.3) || !w.circleFree(x, z, 0.15, pos.y + 0.3, pos.y + 2)) {
        wall = d;
        break;
      }
    }
    if (wall == null || wall < R + 0.8) continue;
    const d = wall - 0.45;
    const x = pos.x + dx * d;
    const z = pos.z + dz * d;
    // (a la vista desde la trampa: no detrás de rejas ni dentro de una celda)
    if (doorNear(x, z) || !w.sweepFree(pos.x, pos.z, x, z, 0.15, pos.y + 0.3, pos.y + 2)) continue;
    if (!best || wall < best.wall) best = { x, z, a, wall };
  }
  if (best) return best;
  // al borde del círculo, donde haya piso
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const x = pos.x + Math.cos(a) * (R + 0.6);
    const z = pos.z + Math.sin(a) * (R + 0.6);
    if (Math.abs(w.floorAt(x, z, pos.y + 1.5) - pos.y) < 0.3 && !doorNear(x, z) && w.sweepFree(pos.x, pos.z, x, z, 0.15, pos.y + 0.3, pos.y + 2)) return { x, z, a };
  }
  return { x: pos.x + R + 0.6, z: pos.z, a: 0 };
}

// la piedra del ancla con sus runas, la palanca y el cristal
function buildAnchor(w, M) {
  const g = new THREE.Group();
  const stone = w.M.stoneDark || w.M.caveRock || w.M.concrete;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 7), stone);
  base.position.y = 0.11;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 1.25, 5), stone);
  col.position.y = 0.8;
  col.rotation.y = 0.3;
  g.add(base, col);
  // las runas: tiras que brillan en las caras de la piedra
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3 + Math.PI / 5;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.75, 0.02), M.runes);
    r.position.set(Math.cos(a) * 0.205, 0.8, Math.sin(a) * 0.205);
    r.rotation.y = -a + Math.PI / 2;
    r.rotation.x = 0.1;
    g.add(r);
  }
  // la palanca: el brazo de hierro con la empuñadura que brilla
  const lever = new THREE.Group();
  lever.position.set(0, 0.95, 0.26);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55).translate(0, 0, 0.27), w.M.iron || w.M.metal || stone);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.runes);
  knob.position.z = 0.56;
  lever.add(arm, knob);
  lever.rotation.x = -0.7;
  g.add(lever);
  // el cristal que flota arriba (octaedro estirado) y dos esquirlas
  const cr = new THREE.Group();
  cr.position.y = 1.85;
  const c0 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), M.crystal);
  c0.scale.set(1, 2.1, 1);
  cr.add(c0);
  for (const s of [-1, 1]) {
    const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), M.crystal);
    c1.scale.set(1, 2, 1);
    c1.position.set(s * 0.32, -0.05, 0);
    cr.add(c1);
  }
  g.add(cr);
  g.traverse((o) => {
    if (o.isMesh && o.material !== M.runes) o.castShadow = o.receiveShadow = true;
  });
  return { g, lever, cr };
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export class TrapLook {
  // T: la trampa de Trampas.js (pos, i); R: el radio que mata
  constructor(g, T, R, CD) {
    this.g = g;
    this.T = T;
    this.R = R;
    this.CD = CD;
    const w = g.world;
    const M = shared();
    this.mats = {
      seam: M.seam.clone(),
      ring: M.ring.clone(),
      vortex: M.vortex.clone(),
      rift: M.rift.clone(),
      blade: M.blade.clone(),
      wave: M.wave.clone(),
      crystal: M.crystal.clone(),
      runes: M.runes.clone(),
    };
    this.mats.vortex.uniforms.uR.value = R;
    const G = SHARED.geos;
    const root = new THREE.Group();
    root.name = `eclipse:trampa:${T.i}`;
    root.position.copy(T.pos);
    this.root = root;
    const yaw = T.i * 1.7;
    // (lo del piso sigue al piso: escalones, la loma; nada queda en el aire)
    const conform = (geo, rot = 0) => {
      const P = geo.attributes.position;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let k = 0; k < P.count; k++) {
        const lx = P.getX(k);
        const lz = P.getZ(k);
        const wx = T.pos.x + lx * c + lz * sn;
        const wz = T.pos.z - lx * sn + lz * c;
        const fy = w.floorAt(wx, wz, T.pos.y + 1.2);
        P.setY(k, Number.isFinite(fy) ? Math.max(-1.5, Math.min(1.2, fy - T.pos.y)) : 0);
      }
      P.needsUpdate = true;
      geo.computeBoundingSphere();
      return geo;
    };
    const seam = new THREE.Mesh(conform(seamGeometry(R, 1000 + T.i * 77), yaw), this.mats.seam);
    seam.position.y = 0.03;
    seam.rotation.y = yaw;
    seam.renderOrder = 3;
    const ring = new THREE.Mesh(conform(G.ring(R)), this.mats.ring);
    ring.position.y = 0.035;
    ring.renderOrder = 3;
    const vortex = new THREE.Mesh(conform(G.disc(R)), this.mats.vortex);
    vortex.position.y = 0.02;
    vortex.renderOrder = 2;
    const rift = new THREE.Mesh(G.rift, this.mats.rift);
    rift.renderOrder = 4;
    const blades = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(G.blade, this.mats.blade);
      const piv = new THREE.Group();
      piv.rotation.y = (k / 3) * Math.PI * 2;
      b.position.set(R * 0.45, 0.7 + k * 0.35, 0);
      b.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
      b.scale.setScalar(R * 0.42);
      piv.add(b);
      blades.add(piv);
    }
    blades.renderOrder = 5;
    const waveR = new THREE.Mesh(G.waveRing, this.mats.wave);
    const waveW = new THREE.Mesh(G.waveWall, this.mats.wave);
    waveR.position.y = 0.08;
    root.add(seam, ring, vortex, rift, blades, waveR, waveW);
    // el ancla
    const sp = anchorSpot(w, T.pos, R);
    const an = buildAnchor(w, { runes: this.mats.runes, crystal: this.mats.crystal });
    an.g.position.set(sp.x - T.pos.x, w.floorAt(sp.x, sp.z, T.pos.y + 1.5) - T.pos.y, sp.z - T.pos.z);
    // (la palanca del lado del círculo)
    an.g.rotation.y = Math.atan2(-(sp.x - T.pos.x), -(sp.z - T.pos.z));
    root.add(an.g);
    this.anchor = an;
    this.anchorPos = new THREE.Vector3(sp.x, T.pos.y, sp.z);
    Object.assign(this, { seam, ring, vortex, rift, blades, waveR, waveW });
    // lo que se prende al abrir: escondido, pero se compila en la carga
    const hid = [vortex, rift, blades, waveR, waveW];
    for (const o of hid) o.visible = false;
    (w.warmHidden ||= []).push(...hid);
    this.open = 0; // 0..1 cuánto está abierta (sube rápido, baja al cerrar)
    this.openT = -1; // tiempo desde que se abrió (-1: cerrada)
    this.closeT = -1;
    this.state = 'ready';
    this.t = 0;
  }

  // la onda, el tajo, el temblor y el trueno
  burst() {
    const g = this.g;
    const T = this.T;
    this.openT = 0;
    this.closeT = -1;
    tmpV.copy(T.pos).setY(T.pos.y + 1.5);
    g.fx.flash?.(tmpV, 0xb070ff, 22, 0.7, 18);
    g.fx.explosion?.(tmpV.copy(T.pos).setY(T.pos.y + 0.4), 2.2, [0.6, 0.3, 1]);
    // las esquirlas del piso que saltan
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * this.R * 0.9;
      g.fx.add?.spawn(T.pos.x + Math.cos(a) * r, T.pos.y + 0.1, T.pos.z + Math.sin(a) * r, Math.cos(a) * 3, 3 + Math.random() * 5, Math.sin(a) * 3, { color: [0.7, 0.4, 1], size: 0.12, size1: 0, life: 0.9 + Math.random() * 0.6, gravity: 9 });
    }
    this.lever(true);
    const d = g.player ? Math.hypot(g.player.pos.x - T.pos.x, g.player.pos.z - T.pos.z) : 99;
    g.fx.addShake?.(0.75 * Math.max(0, 1 - d / 22));
    this.play('trap-desg-abre', 1.0);
    this.loop?.stop?.();
    this.loop = this.loopSnd();
  }

  shut() {
    const g = this.g;
    this.closeT = 0;
    this.openT = -1;
    g.fx.flash?.(tmpV.copy(this.T.pos).setY(this.T.pos.y + 1.4), 0x7a40ff, 10, 0.4, 10);
    this.play('trap-desg-cierra', 0.9);
    this.loop?.stop?.(0.4);
    this.loop = null;
    this.lever(false);
  }

  lever(on) {
    this.anchor.lever.rotation.x = on ? 0.7 : -0.7;
  }

  // un muerto que se traga: el rayo del tajo, las chispas que vuelan al tajo
  swallow(z) {
    const g = this.g;
    const T = this.T;
    tmpV.copy(T.pos).setY(T.pos.y + 1.6 + Math.random() * 1.2);
    tmpW.copy(z.pos).setY(z.pos.y + 1.1);
    g.fx.lightning?.(tmpV.clone(), tmpW.clone(), 0xb27bff, 0.25);
    g.fx.flash?.(tmpW, 0xd0a0ff, 6, 0.25, 8);
    const at = tmpV.clone();
    for (let k = 0; k < 14; k++) g.fx.add?.spawn(tmpW.x + (Math.random() - 0.5) * 0.6, tmpW.y + (Math.random() - 0.5) * 1.2, tmpW.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, { color: [0.75, 0.45, 1], size: 0.1, size1: 0.02, life: 0.7, attract: at });
    this.play('trap-desg-traga', 0.8, z.pos);
  }

  play(key, gain, pos = this.T.pos) {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.(key);
    if (buf) a.playBuffer(buf, { pos, gain, reverb: 0.35, ref: 5 });
  }

  loopSnd() {
    const a = this.g.audio;
    const buf = a?.ctx && a.bakedBuf?.('trap-desg-loop');
    if (!buf || !a.guns?.loopBuf) return null;
    return a.guns.loopBuf(buf, this.T.pos.clone().setY(this.T.pos.y + 1.5), { gain: 0.55, reverb: 0.3, ref: 5, fadeIn: 0.5 });
  }

  // cada cuadro: on (abierta), cd (segundos de descanso que quedan)
  update(dt, on, cd) {
    const t = (this.t += dt);
    const T = this.T;
    const cam = this.g.camera;
    const far = cam ? cam.position.distanceToSquared(T.pos) > 75 * 75 : false;
    this.root.visible = !far;
    if (far) return;
    const m = this.mats;
    if (this.openT >= 0) this.openT += dt;
    if (this.closeT >= 0) this.closeT += dt;
    const target = on ? 1 : 0;
    this.open += (target - this.open) * Math.min(1, dt * (on ? 5 : 3.5));
    const op = this.open;
    const ot = this.openT;
    // la costura: dormida late despacio; abierta, ancha y al rojo violeta; en descanso, casi apagada
    const ready = !on && cd <= 0;
    const beat = 0.5 + 0.5 * Math.sin(t * (on ? 8 : 1.8) + T.i);
    m.seam.uniforms.uTime.value = t;
    m.seam.uniforms.uW.value = 0.24 + op * 0.75 + (ot >= 0 && ot < 0.35 ? (1 - ot / 0.35) * 0.4 : 0);
    m.seam.uniforms.uGlow.value = on ? 1.1 + 0.4 * beat : ready ? 0.45 + 0.55 * beat : 0.12;
    m.seam.uniforms.uHot.value = ot >= 0 ? Math.max(0, 1 - ot / 0.8) : 0;
    // el círculo: lleno y latiendo lista; reloj en descanso; girando abierta
    const R = m.ring.uniforms;
    R.uTime.value = t;
    R.uFill.value = on || ready ? 1 : 1 - cd / this.CD;
    R.uK.value = on ? 0.8 + 0.25 * beat : ready ? 0.35 + 0.35 * beat : 0.28;
    R.uSpin.value = on ? t * 0.15 : 0;
    R.uCol.value.setHex(on ? 0xc49bff : ready ? 0x9a5cff : 0x6a4a9a);
    // el ancla
    m.runes.color.setHex(on ? 0xd8b8ff : ready ? 0x9a5cff : 0x2a1a44);
    m.crystal.emissiveIntensity = on ? 2.4 + beat : ready ? 0.9 + 0.9 * beat : 0.08;
    const cr = this.anchor.cr;
    cr.rotation.y += dt * (on ? 3 : ready ? 0.6 : 0.1);
    cr.position.y = 1.85 + Math.sin(t * 1.3 + T.i) * (ready || on ? 0.07 : 0.02);
    // lo de abierta
    const vis = op > 0.02;
    this.vortex.visible = vis;
    this.rift.visible = vis;
    this.blades.visible = vis;
    if (vis) {
      m.vortex.uniforms.uTime.value = t;
      m.vortex.uniforms.uOpen.value = op;
      // el tajo sube del piso en 0,4 s (y se encoge al cerrar)
      const hk = on ? Math.min(1, Math.max(0, ot) / 0.4) : op;
      m.rift.uniforms.uTime.value = t;
      m.rift.uniforms.uH.value = Math.max(0.001, hk * (0.92 + 0.06 * Math.sin(t * 3)));
      m.rift.uniforms.uW.value = op * (1 + (ot >= 0 && ot < 0.5 ? (1 - ot / 0.5) * 0.8 : 0));
      // (de cara a la cámara, girando solo en y)
      if (cam) this.rift.rotation.y = Math.atan2(cam.position.x - T.pos.x, cam.position.z - T.pos.z);
      this.blades.rotation.y += dt * (2.2 + op * 2.5);
      m.blade.uniforms.uK.value = op * (0.8 + 0.2 * beat);
      this.blades.scale.setScalar(0.4 + 0.6 * op);
      // chispas que caen al remolino
      if (on && Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2;
        const r = this.R * (0.8 + Math.random() * 0.5);
        this.g.fx.add?.spawn(T.pos.x + Math.cos(a) * r, T.pos.y + 0.2 + Math.random() * 2, T.pos.z + Math.sin(a) * r, 0, 0, 0, { color: [0.7, 0.4, 1], size: 0.08, size1: 0.01, life: 0.9, attract: tmpV.copy(T.pos).setY(T.pos.y + 1.2).clone() });
      }
    }
    // la onda: 0,6 s, de 0,5 a 7 m
    const wv = ot >= 0 && ot < 0.7;
    this.waveR.visible = this.waveW.visible = wv;
    if (wv) {
      const k = ot / 0.7;
      const s = 0.5 + k * (this.blastR() - 0.5);
      this.waveR.scale.set(s, 1, s);
      this.waveW.scale.set(s, 1 - k * 0.6, s);
      m.wave.opacity = (1 - k) * 0.45;
    }
  }

  // hasta dónde barre la onda al abrir
  blastR() {
    return this.R + 2.5;
  }
}

// Los sonidos (horneados una vez, al cargar el mapa)
export function bakeTrapSounds(a) {
  if (!a?.ctx || a.baked?.['trap-desg-abre']) return;
  // abrir: el vidrio que se raja, el trueno hondo que cae y el chillido del vacío que se abre
  a.bakeSound('trap-desg-abre', 2.6, function (o, t) {
    this.noise(o, { t, dur: 0.25, type: 'highpass', freq: 5200, freqEnd: 2000, gain: 0.55, attack: 0.002 });
    for (let i = 0; i < 9; i++) this.noise(o, { t: t + 0.01 + i * 0.025 + Math.random() * 0.02, dur: 0.05, type: 'bandpass', freq: 2500 + Math.random() * 4000, q: 3, gain: 0.3, attack: 0.001 });
    this.tone(o, { t: t + 0.03, dur: 1.4, type: 'sine', freq: 95, freqEnd: 32, gain: 0.7, attack: 0.004 });
    this.tone(o, { t: t + 0.03, dur: 1.0, type: 'triangle', freq: 190, freqEnd: 60, gain: 0.25, attack: 0.004 });
    this.noise(o, { t: t + 0.02, dur: 1.2, type: 'lowpass', freq: 2400, freqEnd: 140, gain: 0.85, attack: 0.004 });
    for (const [f, d] of [[220, 0], [223, 7], [330, -5]]) this.tone(o, { t: t + 0.1, dur: 2.2, type: 'sawtooth', freq: f, freqEnd: f / 4, gain: 0.05, attack: 0.05, detune: d });
    this.noise(o, { t: t + 0.25, dur: 2.1, type: 'bandpass', freq: 400, freqEnd: 3200, q: 2.2, gain: 0.35, attack: 0.5 });
  });
  // abierta: el zumbido del vacío que chupa (se repite sin corte)
  a.bakeSound('trap-desg-loop', 2.0, function (o, t) {
    for (const [f, ty, gn] of [[55, 'sawtooth', 0.14], [55.5, 'sawtooth', 0.12], [82.5, 'triangle', 0.1], [27.5, 'sine', 0.3]]) this.tone(o, { t, dur: 2.0, type: ty, freq: f, gain: gn, attack: 0.001 });
    this.noise(o, { t, dur: 2.0, type: 'bandpass', freq: 700, freqEnd: 700, q: 1.6, gain: 0.18, attack: 0.001 });
  });
  // tragar: el chupón que sube y el pop
  a.bakeSound('trap-desg-traga', 0.7, function (o, t) {
    this.noise(o, { t, dur: 0.35, type: 'bandpass', freq: 500, freqEnd: 3800, q: 1.4, gain: 0.55, attack: 0.15 });
    this.tone(o, { t: t + 0.33, dur: 0.25, type: 'sine', freq: 140, freqEnd: 45, gain: 0.45, attack: 0.003 });
    this.tone(o, { t: t + 0.33, dur: 0.3, type: 'triangle', freq: 880, freqEnd: 1760, gain: 0.05, attack: 0.003 });
  }, 3);
  // cerrar: se chupa a sí mismo y el golpe sordo
  a.bakeSound('trap-desg-cierra', 1.3, function (o, t) {
    this.noise(o, { t, dur: 0.8, type: 'bandpass', freq: 3000, freqEnd: 300, q: 1.8, gain: 0.45, attack: 0.5 });
    this.tone(o, { t, dur: 0.8, type: 'sawtooth', freq: 60, freqEnd: 240, gain: 0.06, attack: 0.5 });
    this.tone(o, { t: t + 0.8, dur: 0.45, type: 'sine', freq: 75, freqEnd: 30, gain: 0.6, attack: 0.003 });
    this.noise(o, { t: t + 0.8, dur: 0.35, type: 'lowpass', freq: 1500, freqEnd: 120, gain: 0.5, attack: 0.003 });
  });
}
