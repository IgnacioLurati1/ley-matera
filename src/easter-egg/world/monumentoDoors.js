import * as THREE from 'three';

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

export function vallaDoor(M, group, pieces, width, seed = 1) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
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
