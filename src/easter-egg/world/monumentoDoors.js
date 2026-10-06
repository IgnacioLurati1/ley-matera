import * as THREE from 'three';
import { PROP, COLS, COL_W } from './monumentoPropileo';

// Las puertas del Monumento (las arma world/Interactables.buildDoors):
//  · 'valla': las vallas amarillas de los actos (las que cortan el paso el 20
//    de junio): paneles de caño con barrotes, patas en T y una franja
//    reflectiva. Al pagar, se las lleva por delante una ráfaga y vuelan.
//  · 'door' (en el Monumento): portones de bronce de dos hojas con casetones
//    y aldabas, que abren hacia adentro.
// Todo en el grupo de la puerta (origen en el centro del vano, sobre el piso,
// x a lo largo del vano). Cada pieza lleva `fall(k)` o `swing` (la animación).

const mats = new WeakMap();
function M2(M) {
  let m = mats.get(M);
  if (m) return m;
  m = {
    yellow: new THREE.MeshStandardMaterial({ color: 0xe8b81a, roughness: 0.5, metalness: 0.35 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, emissive: 0x404040, emissiveIntensity: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.4, emissive: 0x300000, emissiveIntensity: 0.6 }),
  };
  mats.set(M, m);
  return m;
}

const box = (w, h, d, mat, x, y, z) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
const tube = (r, len, mat, x, y, z, horiz) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  if (horiz) o.rotation.z = Math.PI / 2;
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};

// Una valla de 2 m (o lo que entre): marco de caño, barrotes, patas y la franja.
function valla(M, w) {
  const C = M2(M);
  const g = new THREE.Group();
  const h = 1.1;
  g.add(tube(0.025, w, C.yellow, 0, h, 0, true));
  g.add(tube(0.025, w, C.yellow, 0, 0.16, 0, true));
  for (const s of [-1, 1]) g.add(tube(0.03, h, C.yellow, (s * w) / 2, h / 2 + 0.05, 0));
  const nb = Math.max(4, Math.round(w / 0.14));
  for (let k = 1; k < nb; k++) g.add(tube(0.009, h - 0.16, C.yellow, -w / 2 + (k * w) / nb, (h + 0.16) / 2, 0));
  // las patas en T y la franja reflectiva roja y blanca
  for (const s of [-1, 1]) g.add(box(0.05, 0.03, 0.62, C.yellow, (s * w) / 2, 0.015, 0));
  const band = new THREE.Group();
  const n = Math.max(2, Math.round(w / 0.25));
  for (let k = 0; k < n; k++) band.add(box(w / n, 0.09, 0.012, k % 2 ? C.stripe : C.red, -w / 2 + (k + 0.5) * (w / n), h - 0.12, 0.03));
  g.add(band);
  return g;
}

// Si la valla va sobre una fila de columnas del Propileo (el frente del
// Patio), los huecos entre columnas: [{ x, w }] en el eje de la valla, y z, el
// medio de la fila (en el eje de adelante). Si no, null.
function columnGaps(group, width) {
  group.updateMatrix();
  const a = new THREE.Vector3(-width / 2, 0, 0).applyMatrix4(group.matrix);
  const b = new THREE.Vector3(width / 2, 0, 0).applyMatrix4(group.matrix);
  if (Math.abs(a.x - b.x) > 0.01) return null;
  const row = PROP.rows.find((x) => Math.abs(x - a.x) < 0.7);
  if (row == null) return null;
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const cuts = COLS.filter((c) => c + COL_W / 2 > z0 && c - COL_W / 2 < z1);
  const edges = [z0];
  for (const c of cuts) edges.push(c - COL_W / 2, c + COL_W / 2);
  edges.push(z1);
  const inv = new THREE.Matrix4().copy(group.matrix).invert();
  const gaps = [];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const g0 = Math.max(z0, edges[i]);
    const g1 = Math.min(z1, edges[i + 1]);
    if (g1 - g0 < 0.5) continue;
    const l = new THREE.Vector3(row, group.position.y, (g0 + g1) / 2).applyMatrix4(inv);
    gaps.push({ x: l.x, z: l.z, w: g1 - g0 });
  }
  return gaps.length ? gaps : null;
}

export function vallaDoor(M, group, pieces, width, seed = 1) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // (sobre la fila de columnas del frente del Propileo: un tramo en cada hueco
  // entre columnas, en el medio de la fila, y al abrir sale derecho por el
  // hueco; antes los tramos de 2 m atravesaban las columnas, cerrados y
  // volando. globalThis.__mduNoVallaCols: como antes)
  const gaps = globalThis.__mduNoVallaCols === true ? null : columnGaps(group, width);
  if (gaps) {
    for (const gp of gaps) {
      const v = valla(M, gp.w - 0.1);
      v.position.set(gp.x, 0, gp.z);
      group.add(v);
      const delay = r() * 0.25;
      const dir = r() < 0.5 ? 1 : -1;
      const vz = 2.5 + r() * 2;
      pieces.push({
        obj: v,
        fall(k) {
          const t = Math.max(0, (k - delay) / (1 - delay));
          v.rotation.x = -t * 1.45 * dir;
          v.position.set(gp.x, Math.sin(t * Math.PI) * 0.6, gp.z + dir * vz * t);
          v.visible = k < 1;
        },
      });
    }
    return;
  }
  // del ancho del vano, en tramos de ~2 m, apenas desalineadas
  const n = Math.max(1, Math.round(width / 2));
  const w = width / n;
  for (let k = 0; k < n; k++) {
    const v = valla(M, w - 0.06);
    const x = -width / 2 + (k + 0.5) * w;
    const z = (r() - 0.5) * 0.12 + 0.3;
    const ry = (r() - 0.5) * 0.06;
    v.position.set(x, 0, z);
    v.rotation.y = ry;
    group.add(v);
    // al abrir: se tumba hacia adelante y sale despedida (cada una a su tiempo)
    const delay = r() * 0.25;
    const dir = r() < 0.5 ? 1 : -1;
    const vx = (r() - 0.5) * 2;
    const vz = 2.5 + r() * 2;
    pieces.push({
      obj: v,
      fall(k) {
        const t = Math.max(0, (k - delay) / (1 - delay));
        v.rotation.x = -t * 1.45 * dir;
        v.rotation.z = t * vx * 0.4;
        v.position.set(x + vx * t, Math.sin(t * Math.PI) * 0.6, z + dir * vz * t);
        v.visible = k < 1;
      },
    });
  }
}

// La reja de hierro de dos hojas (la Cripta a la Proa): barrotes con punta de
// lanza y tres travesaños. Abre girando hacia adentro de la Cripta, con las
// bisagras corridas del marco (antes corría de costado y se metía en la pared).
export function rejaDoor(M, group, pieces, width, H = 2.6, side = 1) {
  const I = M.ironBar || M.iron;
  const lw = width / 2 - 0.1;
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * (width / 2 - 0.08), 0, 0);
    const parts = [];
    const nb = Math.max(3, Math.round(lw / 0.12));
    for (let k = 0; k <= nb; k++) {
      const x = -s * (0.02 + (k * (lw - 0.04)) / nb);
      parts.push(box(0.024, H - 0.14, 0.024, I, x, (H - 0.14) / 2 + 0.06, 0));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), I);
      tip.position.set(x, H - 0.02, 0);
      parts.push(tip);
    }
    for (const y of [0.12, 1.25, H - 0.2]) parts.push(box(lw, 0.05, 0.05, I, (-s * lw) / 2, y, 0));
    // la aldaba y el cerrojo
    parts.push(box(0.06, 0.18, 0.08, M.bronzeDark || I, -s * (lw - 0.06), 1.25, 0.03));
    for (const p of parts) hinge.add(p);
    group.add(hinge);
    pieces.push({ obj: hinge, swing: s * 1.45 * side });
  }
}

// El portón de bronce de dos hojas (la Cripta): casetones en relieve, una
// aldaba de anillo en cada hoja y la cruz arriba.
export function bronzeDoor(M, group, pieces, width, H = 2.7, side = 1) {
  const C = M.bronze;
  const D = M.bronzeDark;
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set((s * width) / 2, 0, 0);
    const lw = width / 2 - 0.02;
    hinge.add(box(lw, H - 0.04, 0.09, C, (-s * lw) / 2, H / 2, 0));
    // los casetones: tres por hoja, con su marco
    for (let k = 0; k < 3; k++) {
      const y = 0.45 + k * 0.78;
      for (const f of [-1, 1]) {
        hinge.add(box(lw * 0.72, 0.6, 0.03, D, (-s * lw) / 2, y + 0.32, f * 0.055));
        hinge.add(box(lw * 0.56, 0.44, 0.03, C, (-s * lw) / 2, y + 0.32, f * 0.07));
      }
    }
    // la aldaba
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), D);
    ring.position.set(-s * (lw - 0.18), 1.3, 0.1);
    hinge.add(ring);
    group.add(hinge);
    pieces.push({ obj: hinge, swing: s * 1.6 * side });
  }
}
