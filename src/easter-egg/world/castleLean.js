import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compactGroup } from './props';
import { flattenable, flatMaterial, reflBucket } from './perkMachines';

// Menos objetos y menos dibujos en el castillo (2026-10-02, pedido del
// usuario: bajar los objetos en escena). three recorre en cada cuadro todo
// lo que cuelga de la escena, aunque esté escondido o no se mueva.
// globalThis.__mduNoMerge (lo pone la prueba A/B al cargar) deja todo como
// antes, para comparar en el mismo árbol (__mduNoCastle: solo lo de acá).
export const lean = () => !globalThis.__mduNoMerge && !globalThis.__mduNoCastle;

// Lo que está escondido hasta que pasa algo y se anima por dentro cuando se
// ve: mientras está escondido, core/matrixCache no lo recorre (mcSleep) y al
// volver a verse se rehace entero una vez.
export function sleepHidden(...objs) {
  if (!lean()) return;
  for (const o of objs) if (o?.isObject3D) o.mcSleep = true;
}

// Las piezas de varios grupos quietos (que nadie mueve, esconde ni busca),
// juntas en un grupo de `parent` con una malla por material (compactGroup).
export function mergeFixed(parent, groups) {
  const fixed = new THREE.Group();
  parent.add(fixed);
  parent.updateMatrixWorld(true);
  for (const grp of groups) {
    grp.updateMatrixWorld(true);
    for (const o of [...grp.children]) fixed.attach(o);
    grp.removeFromParent();
  }
  return compactGroup(fixed);
}

// La utilería quieta del mapa (World.addStatic) se junta por material en todo
// el mapa: en el castillo eran ~215 mallas y 129 de material liso (sin
// textura), un dibujo cada una. Esas van a pocas mallas (una por cara, sombreado
// y sombra) con el color, la rugosidad, lo metálico, el brillo y el reflejo de
// fx/Epic de cada material en los vértices (el material de perkMachines.flatten,
// el mismo programa). Si el juego le cambia después el color, el brillo, la
// rugosidad o lo metálico a uno de esos materiales, se copia a sus vértices
// antes de dibujar. Se llama antes de World.finalizeStatic (Castle.js).
// (opts.pbr16: la rugosidad y lo metálico en 16 bits —el penal: con 8 bits el
// brillo del hierro, rugosidad 0,5 → 0,502, cambiaba hasta 5/255 en un borde—)
export function flattenProps(w, opts = {}) {
  const merged = w.mergedProps;
  if (!merged) return;
  const sets = new Map();
  for (const [m, list] of merged) {
    if (!flattenable(m) || !list.length) continue;
    const key = `${m.side}|${m.flatShading ? 1 : 0}|${m.envMapIntensity}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push({ m, list });
    merged.delete(m);
  }
  for (const parts of sets.values()) {
    const geos = [];
    for (const p of parts) {
      p.start = geos.reduce((n, x) => n + x.attributes.position.count, 0);
      for (const x of p.list) {
        x.deleteAttribute('uv');
        geos.push(x);
      }
      p.count = geos.reduce((n, x) => n + x.attributes.position.count, 0) - p.start;
    }
    const geo = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!geo) continue;
    const n = geo.attributes.position.count;
    // (color de 16 bits: los oscuros en lineal quedan bien; el brillo en medio flotante)
    const col = new THREE.BufferAttribute(new Uint16Array(n * 3), 3, true);
    const pbr = new THREE.BufferAttribute(opts.pbr16 ? new Uint16Array(n * 2) : new Uint8Array(n * 2), 2, true);
    const emi = new THREE.Float16BufferAttribute(new Uint16Array(n * 3), 3);
    const refl = new THREE.BufferAttribute(new Uint8Array(n), 1, true);
    geo.setAttribute('color', col);
    geo.setAttribute('pbr', pbr);
    geo.setAttribute('emi', emi);
    geo.setAttribute('refl', refl);
    geo.computeBoundingSphere();
    for (const p of parts) write(p, col, pbr, emi, refl);
    const m0 = parts[0].m;
    const mesh = new THREE.Mesh(geo, flatMaterial(m0.side, !!m0.flatShading, m0.envMapIntensity));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // lo que el juego le cambia a un material después: a sus vértices.
    // (sesión 1f, el usuario: "FPS malos en todos lados": en Eclipse un material
    // que late cada pocos cuadros hacía subir los 4 atributos enteros —8 MB, ~1,4
    // MB por cuadro, el 31% del tiempo de la CPU—. Ahora solo su tramo.
    // __mduNoFlatRange: entero, como antes)
    const ranged = globalThis.__mduNoFlatRange !== true;
    // (sesión 1f: en Eclipse un material de acá adentro cambiaba en CADA cuadro
    // —un brillo que late—: subir sus vértices a la placa en cada pasada la
    // frenaba entera: 72 → 152 fps sin eso. Lo que cambia seguido —4 veces en
    // 3 s— sale a su propia malla con su material de verdad (cambia por
    // uniforms, sin subir nada). __mduNoFlatLive: como antes)
    const live = globalThis.__mduNoFlatLive !== true;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      let dirty = false;
      const now = performance.now();
      for (const p of parts) {
        if (p.out) continue;
        // (su programa ya compilado aparte: recién ahí sale, sin trabar un cuadro)
        if (p.ready) {
          commitSplit(mesh, p);
          continue;
        }
        if (!changed(p)) continue;
        if (live && !p.pending) {
          if (p.t0 == null || now - p.t0 > 3000) {
            p.t0 = now;
            p.hits = 0;
          }
          if (++p.hits >= 4) prepareSplit(mesh, p, renderer, scene, camera);
        }
        write(p, col, pbr, emi, refl);
        dirty = true;
        if (ranged) for (const a of [col, pbr, emi, refl]) a.addUpdateRange(p.start * a.itemSize, p.count * a.itemSize);
      }
      if (dirty) for (const a of [col, pbr, emi, refl]) a.needsUpdate = true;
    };
    w.root.add(mesh);
  }
}

// Lo de un material que cambia seguido, fuera de la malla junta: una malla
// propia con sus triángulos y su material (en el mismo lugar), y en la junta
// esos vértices aplastados en un punto (triángulos vacíos). Una sola subida.
function prepareSplit(mesh, p, renderer, scene, camera) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  if (!pos?.array || pos.isInterleavedBufferAttribute || !mesh.parent) return false;
  p.pending = true;
  const a = p.start;
  const n = p.count;
  const sub = new THREE.BufferGeometry();
  sub.setAttribute('position', new THREE.BufferAttribute(pos.array.slice(a * 3, (a + n) * 3), 3));
  if (nrm?.array) sub.setAttribute('normal', new THREE.BufferAttribute(nrm.array.slice(a * 3, (a + n) * 3), 3));
  if (geo.index) {
    const I = geo.index.array;
    const keep = [];
    for (let i = 0; i < I.length; i += 3) if (I[i] >= a && I[i] < a + n) keep.push(I[i] - a, I[i + 1] - a, I[i + 2] - a);
    sub.setIndex(keep);
  }
  sub.computeBoundingSphere();
  const m = new THREE.Mesh(sub, p.m);
  m.name = 'flatLive';
  m.castShadow = mesh.castShadow;
  m.receiveShadow = mesh.receiveShadow;
  m.matrixAutoUpdate = false;
  m.matrix.copy(mesh.matrix);
  m.matrixWorld.copy(mesh.matrixWorld);
  const done = () => (p.ready = m);
  try {
    if (renderer?.compileAsync) renderer.compileAsync(m, camera, scene).then(done, done);
    else done();
  } catch {
    done();
  }
  return true;
}

function commitSplit(mesh, p) {
  const m = p.ready;
  p.ready = null;
  if (!mesh.parent) return;
  mesh.parent.add(m);
  const pos = mesh.geometry.attributes.position;
  const a = p.start;
  const n = p.count;
  const P = pos.array;
  const x = P[a * 3];
  const y = P[a * 3 + 1];
  const z = P[a * 3 + 2];
  for (let i = a; i < a + n; i++) {
    P[i * 3] = x;
    P[i * 3 + 1] = y;
    P[i * 3 + 2] = z;
  }
  pos.addUpdateRange(a * 3, n * 3);
  pos.needsUpdate = true;
  p.out = m;
  if (import.meta.env?.DEV) (globalThis.__flatSplit ||= []).push({ name: p.m.name, color: p.m.color.getHexString(), emissive: p.m.emissive.getHexString(), verts: n });
  return true;
}

const snapOf = (m) => [m.color.r, m.color.g, m.color.b, m.emissive.r, m.emissive.g, m.emissive.b, m.emissiveIntensity, m.roughness, m.metalness];

function changed(p) {
  const m = p.m;
  const s = p.snap;
  if (s[0] === m.color.r && s[1] === m.color.g && s[2] === m.color.b && s[3] === m.emissive.r && s[4] === m.emissive.g && s[5] === m.emissive.b && s[6] === m.emissiveIntensity && s[7] === m.roughness && s[8] === m.metalness) return false;
  // (lo que no se puede pasar a los vértices: avisa, en desarrollo)
  if (import.meta.env?.DEV && !p.warned && (!m.visible || m.transparent || m.opacity !== 1)) {
    p.warned = true;
    console.warn('castleLean: a un material aplanado le cambiaron visible/transparent/opacity', m);
  }
  return true;
}

function write(p, col, pbr, emi, refl) {
  const m = p.m;
  p.snap = snapOf(m);
  const k = m.emissiveIntensity;
  const r = Math.round(Math.min(1, Math.max(0, m.color.r)) * 65535);
  const gg = Math.round(Math.min(1, Math.max(0, m.color.g)) * 65535);
  const b = Math.round(Math.min(1, Math.max(0, m.color.b)) * 65535);
  const PS = pbr.array instanceof Uint16Array ? 65535 : 255;
  const ro = Math.round(Math.min(1, Math.max(0, m.roughness)) * PS);
  const me = Math.round(Math.min(1, Math.max(0, m.metalness)) * PS);
  const rf = Math.round((reflBucket(m) / 15) * 255);
  const c = col.array;
  const pb = pbr.array;
  const rl = refl.array;
  for (let i = p.start, e = p.start + p.count; i < e; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
    pb[i * 2] = ro;
    pb[i * 2 + 1] = me;
    rl[i] = rf;
    emi.setXYZ(i, m.emissive.r * k, m.emissive.g * k, m.emissive.b * k);
  }
}
