import * as THREE from 'three';

// Las caras repetidas de Eclipse Matero (sesión 1f, 2026-10-07). El usuario:
// "la zona del Monumento tiene paredes que clipean en todos lados". Cada isla
// junta tres cosas que dibujan las mismas superficies: la arquitectura por
// celdas del layout (world/Levels), el arte de la isla (world/eclipse/<isla>.js)
// y las secciones copiadas del mapa de origen (world/eclipse/v5.js). Donde dos
// caras quedan en el mismo plano (a menos de 2 cm, mirando para el mismo lado)
// se pisan y titilan según el ángulo. Acá, una sola vez al armar el mundo, de
// cada par se queda la de más rango —lo copiado del origen, después el arte de
// la isla, después Levels; entre iguales, la primera— y la otra se borra
// (el triángulo queda en un punto). Los calcos (mugre, manchas, charcos de luz)
// no cuentan: van con polygonOffset. Solo caras de más de AREA m² (lo chico no
// se nota y es casi todo: así tarda poco).
// globalThis.__mduNoEclDedupe: como antes.
// (2026-10-08, el usuario: "triángulos bugueados", tres agujeros en fila en el
// travertino abajo de una cornisa, y "paredes que siguen clipeando", una franja
// oscura dentada al pie de un muro. Se borraba el triángulo tapado en 5 de 7
// muestras aunque asomara del que tapa —el pedazo de afuera quedaba hueco— y
// el corrido para atrás era 1,2 cm desde donde estaba: si la que tapa estaba
// 1 cm más atrás, quedaban a 2 mm y titilaban en diente de sierra. Ahora se
// borra solo si está tapado entero (las 7 muestras y los 3 vértices) y se corre
// hasta quedar 1,2 cm detrás de la más honda de las que lo tapan, contando
// dónde quedó esa si también la corrieron (se recorren de más rango a menos: al
// pie de la Proa el granito copiado y el parapeto de la isla iban los dos 1,2 cm
// para atrás y quedaban otra vez en el mismo plano).
// Y lo aditivo (las grietas violetas) ya no tapa: en los pisos de la torre la
// grieta que cruza el agujero tapado borraba el piso y se veía el vacío.
// globalThis.__mduOldEclDedupe: como antes de eso.)

const TOL = 0.02;
const CELL = 4;
const AREA = 0.005;
// (las que tapan pueden ser más chicas: un muro de bloques copiado del origen)
const AREA_COVER = 0.001;
const DECAL = /grime|stain|mancha|eclPools|crack|grieta|wet|mojado|decal|charco|trampa|pool/i;

function rankOf(o) {
  let s = '';
  for (let q = o; q; q = q.parent) s += `|${q.name || ''}`;
  if (DECAL.test(s)) return -1;
  if (/v5/.test(s)) return 3;
  if (/eclipseIsla|eclipse:/.test(s)) return 2;
  return 1;
}

export function dedupeEclipse(w) {
  if (globalThis.__mduNoEclDedupe === true) return null;
  const OLD = globalThis.__mduOldEclDedupe === true;
  const t0 = performance.now();
  w.root.updateMatrixWorld(true);
  // (una geometría o un material que usan varias mallas no se tocan)
  const geoUse = new Map();
  const matDecal = new Map();
  const all = [];
  w.root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    geoUse.set(o.geometry, (geoUse.get(o.geometry) || 0) + 1);
    const r = rankOf(o);
    for (const mm of Array.isArray(o.material) ? o.material : [o.material]) if (mm) matDecal.set(mm, (matDecal.get(mm) ?? true) && r < 0);
    all.push([o, r]);
  });
  const meshes = [];
  for (const [o, r] of all) {
    if (o.isInstancedMesh || o.isSkinnedMesh || !o.geometry.attributes?.position) continue;
    if (r < 0) {
      for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
        if (mm && matDecal.get(mm) && !mm.polygonOffset) {
          mm.polygonOffset = true;
          mm.polygonOffsetFactor = -2;
          mm.polygonOffsetUnits = -2;
        }
      }
      continue;
    }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false || m.colorWrite === false) continue;
    // (lo que suma luz no tapa: la grieta violeta aditiva de los pisos de la
    // torre borraba el piso de abajo y quedaba un agujero al vacío)
    if (!OLD && m.blending === THREE.AdditiveBlending) continue;
    // (las transparentes tapan —el pasto copiado del origen— pero no se tocan)
    const see = m.transparent || m.depthWrite === false;
    meshes.push({ o, r, edit: !see && geoUse.get(o.geometry) === 1 });
  }
  // los triángulos grandes: plano, rango y su proyección 2D (typed arrays)
  let cap = 1 << 16;
  let N = 0;
  let F = new Float32Array(cap * 12); // nx ny nz d  u0 v0 u1 v1 u2 v2  cu cv
  let I = new Int32Array(cap * 4); // mesh, tri, rank, dom
  const grow = () => {
    cap *= 2;
    const F2 = new Float32Array(cap * 12);
    F2.set(F);
    F = F2;
    const I2 = new Int32Array(cap * 4);
    I2.set(I);
    I = I2;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const A2 = AREA_COVER * 2;
  const big = new Uint8Array(1 << 22);
  for (let mi = 0; mi < meshes.length; mi++) {
    const geo = meshes[mi].o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const nt = idx ? idx.count / 3 : pos.count / 3;
    const wm = meshes[mi].o.matrixWorld;
    for (let t = 0; t < nt; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(wm);
      b.fromBufferAttribute(pos, i1).applyMatrix4(wm);
      c.fromBufferAttribute(pos, i2).applyMatrix4(wm);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const L = n.length();
      if (L < A2) continue;
      n.multiplyScalar(1 / L);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const dom = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
      if (N >= cap) grow();
      const f = N * 12;
      F[f] = n.x;
      F[f + 1] = n.y;
      F[f + 2] = n.z;
      F[f + 3] = n.dot(a);
      const U = (v) => (dom === 0 ? v.y : v.x);
      const V = (v) => (dom === 2 ? v.y : v.z);
      F[f + 4] = U(a);
      F[f + 5] = V(a);
      F[f + 6] = U(b);
      F[f + 7] = V(b);
      F[f + 8] = U(c);
      F[f + 9] = V(c);
      F[f + 10] = (F[f + 4] + F[f + 6] + F[f + 8]) / 3;
      F[f + 11] = (F[f + 5] + F[f + 7] + F[f + 9]) / 3;
      const k = N * 4;
      big[N] = L >= AREA * 2 ? 1 : 0;
      I[k] = mi;
      I[k + 1] = t;
      I[k + 2] = meshes[mi].r;
      I[k + 3] = dom;
      N++;
    }
  }
  const tA = performance.now();
  // por plano (dirección cuantizada + distancia) y celda 2D
  // (claves numéricas: la dirección cuantizada y la distancia)
  const NK = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const f = i * 12;
    NK[i] = (((I[i * 4 + 3] * 61 + Math.round(F[f] * 30) + 30) * 61 + Math.round(F[f + 1] * 30) + 30) * 61 + Math.round(F[f + 2] * 30) + 30) * 1e6;
  }
  const pkey = (i, dd) => NK[i] + dd + 500000;
  const planes = new Map();
  // cuántas mallas distintas hay en cada plano (con una sola, nada que hacer)
  const planeMesh = new Map();
  for (let i = 0; i < N; i++) {
    const f = i * 12;
    const k = pkey(i, Math.round(F[f + 3] / (TOL * 2)));
    const pm = planeMesh.get(k);
    if (pm === undefined) planeMesh.set(k, I[i * 4]);
    else if (pm !== I[i * 4]) planeMesh.set(k, -1);
    let P = planes.get(k);
    if (!P) planes.set(k, (P = new Map()));
    const gx0 = Math.floor(Math.min(F[f + 4], F[f + 6], F[f + 8]) / CELL);
    const gx1 = Math.floor(Math.max(F[f + 4], F[f + 6], F[f + 8]) / CELL);
    const gy0 = Math.floor(Math.min(F[f + 5], F[f + 7], F[f + 9]) / CELL);
    const gy1 = Math.floor(Math.max(F[f + 5], F[f + 7], F[f + 9]) / CELL);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 256) {
      let L = P.get('big');
      if (!L) P.set('big', (L = []));
      L.push(i);
      continue;
    }
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const ck = gx * 100003 + gy;
      let L = P.get(ck);
      if (!L) P.set(ck, (L = []));
      L.push(i);
    }
  }
  const tB = performance.now();
  const inTri = (x, y, f) => {
    const d1 = (x - F[f + 6]) * (F[f + 5] - F[f + 7]) - (F[f + 4] - F[f + 6]) * (y - F[f + 7]);
    const d2 = (x - F[f + 8]) * (F[f + 7] - F[f + 9]) - (F[f + 6] - F[f + 8]) * (y - F[f + 9]);
    const d3 = (x - F[f + 4]) * (F[f + 9] - F[f + 5]) - (F[f + 8] - F[f + 4]) * (y - F[f + 5]);
    const neg = d1 < -1e-6 || d2 < -1e-6 || d3 < -1e-6;
    const pos = d1 > 1e-6 || d2 > 1e-6 || d3 > 1e-6;
    return !(neg && pos);
  };
  // ¿se solapan dos triángulos del mismo plano? (ejes separadores, con 1 cm de margen)
  const sat = (f, g) => {
    for (const [P, Q] of [[f, g], [g, f]]) {
      for (let e = 0; e < 3; e++) {
        const e2 = (e + 1) % 3;
        const ax = -(F[P + 5 + e2 * 2] - F[P + 5 + e * 2]);
        const ay = F[P + 4 + e2 * 2] - F[P + 4 + e * 2];
        const L = Math.hypot(ax, ay) || 1;
        let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
        for (let v = 0; v < 3; v++) {
          const dp = (F[P + 4 + v * 2] * ax + F[P + 5 + v * 2] * ay) / L;
          const dq = (F[Q + 4 + v * 2] * ax + F[Q + 5 + v * 2] * ay) / L;
          if (dp < p0) p0 = dp;
          if (dp > p1) p1 = dp;
          if (dq < q0) q0 = dq;
          if (dq > q1) q1 = dq;
        }
        if (Math.min(p1, q1) - Math.max(p0, q0) < 0.01) return false;
      }
    }
    return true;
  };
  const dead = new Uint8Array(N);
  const stamp = new Uint32Array(N);
  let stampN = 0;
  const NS = OLD ? 7 : 10;
  const SX = new Float32Array(10);
  const SY = new Float32Array(10);
  const cov = new Uint8Array(10);
  // (cuánto más adelante está este que la más honda de las que lo pisan, y
  // cuánto se corrió cada uno)
  const ahead = new Float32Array(N);
  const push = new Float32Array(N);
  // (de más rango a menos y, entre iguales, por orden: las que tapan a uno ya
  // están en su lugar cuando le toca)
  const order = new Int32Array(N);
  {
    let o = 0;
    if (OLD) for (let i = 0; i < N; i++) order[o++] = i;
    else for (let rk = 3; rk >= 0; rk--) for (let i = 0; i < N; i++) if (I[i * 4 + 2] === rk) order[o++] = i;
    if (o < N) for (let i = 0; i < N; i++) if (I[i * 4 + 2] > 3 || I[i * 4 + 2] < 0) order[o++] = i;
  }
  let killed = 0;
  let pushed = 0;
  let spared = 0;
  for (let oi = 0; oi < N; oi++) {
    const i = order[oi];
    if (!meshes[I[i * 4]].edit || !big[i]) continue;
    const f = i * 12;
    const cx = F[f + 10], cy = F[f + 11];
    SX[0] = cx;
    SY[0] = cy;
    for (let v = 0; v < 3; v++) {
      SX[1 + v] = cx + (F[f + 4 + v * 2] - cx) * 0.8;
      SY[1 + v] = cy + (F[f + 5 + v * 2] - cy) * 0.8;
      const w2 = (v + 1) % 3;
      SX[4 + v] = cx + ((F[f + 4 + v * 2] + F[f + 4 + w2 * 2]) / 2 - cx) * 0.8;
      SY[4 + v] = cy + ((F[f + 5 + v * 2] + F[f + 5 + w2 * 2]) / 2 - cy) * 0.8;
      // (los vértices, un pelo adentro: si asoma una punta, no se borra)
      SX[7 + v] = cx + (F[f + 4 + v * 2] - cx) * 0.97;
      SY[7 + v] = cy + (F[f + 5 + v * 2] - cy) * 0.97;
    }
    cov.fill(0);
    let touch = false;
    const r = I[i * 4 + 2];
    const dd0 = Math.round(F[f + 3] / (TOL * 2));
    // (solo esta malla en su plano y en los de al lado: nada que tapar)
    {
      const me = I[i * 4];
      let other = false;
      for (let dd = dd0 - 1; dd <= dd0 + 1 && !other; dd++) {
        const pm = planeMesh.get(pkey(i, dd));
        if (pm !== undefined && pm !== me) other = true;
      }
      if (!other) continue;
    }
    // (todas las celdas que toca este, no solo la del centro)
    const gx0 = Math.floor(Math.min(F[f + 4], F[f + 6], F[f + 8]) / CELL);
    const gx1 = Math.floor(Math.max(F[f + 4], F[f + 6], F[f + 8]) / CELL);
    const gy0 = Math.floor(Math.min(F[f + 5], F[f + 7], F[f + 9]) / CELL);
    const gy1 = Math.floor(Math.max(F[f + 5], F[f + 7], F[f + 9]) / CELL);
    stampN++;
    for (let dd = dd0 - 1; dd <= dd0 + 1; dd++) {
      const P = planes.get(pkey(i, dd));
      if (!P) continue;
      const lists = [P.get('big')];
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) <= 64) for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) lists.push(P.get(gx * 100003 + gy));
      for (const L of lists) {
        if (!L) continue;
        for (const j of L) {
          if (j === i || (OLD ? dead[j] : dead[j] === 1) || stamp[j] === stampN) continue;
          stamp[j] = stampN;
          const rj = I[j * 4 + 2];
          if (rj < r || (rj === r && j > i)) continue;
          const g = j * 12;
          if (F[g] * F[f] + F[g + 1] * F[f + 1] + F[g + 2] * F[f + 2] < 0.999) continue;
          if (Math.abs(F[g + 3] - F[f + 3]) > TOL) continue;
          if (OLD) {
            for (let s = 0; s < 7; s++) if (!cov[s] && inTri(SX[s], SY[s], g)) cov[s] = 1;
            // (y al revés: si la otra cae adentro de esta, aunque las muestras de
            // esta no la toquen —una franja angosta—, se pisan)
            if (!touch && sat(f, g)) touch = true;
            continue;
          }
          let hit = false;
          for (let s = 0; s < NS; s++) if (!cov[s] && inTri(SX[s], SY[s], g)) cov[s] = hit = 1;
          if (!hit) hit = sat(f, g);
          if (hit) {
            touch = true;
            const dz = F[f + 3] - (F[g + 3] - push[j]);
            if (dz > ahead[i]) ahead[i] = dz;
          }
        }
      }
    }
    let k = 0;
    for (let s = 0; s < NS; s++) k += cov[s];
    if (OLD ? k >= 5 : k === NS) {
      dead[i] = 1;
      killed++;
    } else if (k > 0 || touch) {
      if (!OLD && k - cov[7] - cov[8] - cov[9] >= 5) {
        spared++;
        // (para las pruebas: cuáles eran los que antes quedaban huecos)
        if (globalThis.__eclDedupeDbg) (globalThis.__eclDedupeSpared ||= []).push([meshes[I[i * 4]].o, I[i * 4 + 1]]);
      }
      // tapada a medias: un centímetro para atrás (la otra gana donde se pisan)
      dead[i] = 2;
      push[i] = 0.012 + (OLD ? 0 : ahead[i]);
      pushed++;
    }
  }
  const tC = performance.now();
  // borrar: el triángulo queda en un punto
  const byMesh = new Map();
  const back = new Map();
  for (let i = 0; i < N; i++) if (dead[i]) {
    const mi = I[i * 4];
    const M = dead[i] === 1 ? byMesh : back;
    if (!M.has(mi)) M.set(mi, []);
    M.get(mi).push(i);
  }
  // las de atrás: cada vértice una vez, en el espacio de la malla
  const inv = new THREE.Matrix4();
  const nl = new THREE.Vector3();
  for (const [mi, list] of back) {
    const o = meshes[mi].o;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    inv.copy(o.matrixWorld).invert();
    const moved = new Set();
    for (const i of list) {
      const f = i * 12;
      const t = I[i * 4 + 1];
      // la normal al espacio de la malla (sin escala rara: las del layout no tienen)
      nl.set(F[f], F[f + 1], F[f + 2]).transformDirection(inv).multiplyScalar(-push[i]);
      for (let v = 0; v < 3; v++) {
        const vi = idx ? idx.getX(t * 3 + v) : t * 3 + v;
        if (moved.has(vi)) continue;
        moved.add(vi);
        pos.setXYZ(vi, pos.getX(vi) + nl.x, pos.getY(vi) + nl.y, pos.getZ(vi) + nl.z);
      }
    }
    pos.needsUpdate = true;
  }
  for (const [mi, list0] of byMesh) {
    const list = list0.map((i) => I[i * 4 + 1]);
    const geo = meshes[mi].o.geometry;
    const idx = geo.index;
    if (idx) {
      for (const t of list) {
        const v = idx.getX(t * 3);
        idx.setX(t * 3 + 1, v);
        idx.setX(t * 3 + 2, v);
      }
      idx.needsUpdate = true;
    } else {
      const pos = geo.attributes.position;
      for (const t of list) {
        const x = pos.getX(t * 3), y = pos.getY(t * 3), z = pos.getZ(t * 3);
        pos.setXYZ(t * 3 + 1, x, y, z);
        pos.setXYZ(t * 3 + 2, x, y, z);
      }
      pos.needsUpdate = true;
    }
  }
  const ms = Math.round(performance.now() - t0);
  globalThis.__eclDedupe = { tris: N, killed, pushed, spared, meshes: meshes.length, ms, build: Math.round(tA - t0), reg: Math.round(tB - tA), test: Math.round(tC - tB) };
  return globalThis.__eclDedupe;
}
