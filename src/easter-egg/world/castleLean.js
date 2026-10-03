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
export function flattenProps(w) {
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
    const pbr = new THREE.BufferAttribute(new Uint8Array(n * 2), 2, true);
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
    // lo que el juego le cambia a un material después: a sus vértices
    mesh.onBeforeRender = () => {
      let dirty = false;
      for (const p of parts) {
        if (!changed(p)) continue;
        write(p, col, pbr, emi, refl);
        dirty = true;
      }
      if (dirty) for (const a of [col, pbr, emi, refl]) a.needsUpdate = true;
    };
    w.root.add(mesh);
  }
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
  const ro = Math.round(Math.min(1, Math.max(0, m.roughness)) * 255);
  const me = Math.round(Math.min(1, Math.max(0, m.metalness)) * 255);
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
