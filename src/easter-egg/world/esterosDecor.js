import * as THREE from 'three';
import { MAP_W, MAP_H, DOORS, PERK_SPOTS, WALL_BUYS, BOX_SPOTS, POWER, PAP, RISERS } from '../config/map';
import { WATER_Y, DECOR, ZONES } from '../config/maps/esteros';
import { rng } from '../core/noise';
import { coverageMips } from '../core/textures';
import { leafCrownGeometry, evenFoliage } from './esterosGrass';

// Lo chico que hace que el estero no se vea vacío (todo instanciado):
//  · en el barro: matas de pasto, flores del bañado, troncos caídos, tocones
//    y piedras;
//  · en el agua: irupés (las hojas gigantes de borde levantado, con su flor),
//    camalotes con flores violetas, juncos en lo bajo y árboles muertos
//    parados en el agua con barba de viejo colgando;
//  · alrededor: más monte (palmeras, ceibos y timbós detrás del pajonal).
// Lo que flota sube y baja con el agua (la creciente): w.estero.float.

const FLOOR = 1;
const DOOR = 3;

// Lugares donde no va nada (máquinas, puertas, cajas, risers).
function keepOut() {
  const pts = [];
  for (const d of [...PERK_SPOTS, ...WALL_BUYS, ...BOX_SPOTS, POWER, PAP].filter(Boolean)) pts.push([d.cell[0] + 0.5 + d.face[0], d.cell[1] + 0.5 + d.face[1], 1.6]);
  for (const d of DOORS) for (const [x, z] of d.cells) pts.push([x + 0.5, z + 0.5, 1.8]);
  for (const r of RISERS) pts.push([r.pos[0], r.pos[1], 1.2]);
  return (x, z) => pts.some(([px, pz, rr]) => Math.hypot(x - px, z - pz) < rr);
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Matas de pasto: tallitos finos, verdes y pajizos.
function tuftTex() {
  return canvasTex(128, 128, (x) => {
    const r = rng(31);
    x.lineCap = 'round';
    for (let k = 0; k < 70; k++) {
      const bx = 10 + r() * 108;
      const top = 10 + r() * 70;
      const lean = (r() - 0.5) * 40;
      const d = r();
      x.strokeStyle = `rgb(${50 + d * 60},${66 + d * 50},${26 + d * 18})`;
      x.lineWidth = 1 + r() * 1.5;
      x.beginPath();
      x.moveTo(bx, 128);
      x.quadraticCurveTo(bx + lean * 0.3, 70, bx + lean, top);
      x.stroke();
    }
  });
}

// La hoja del irupé vista de arriba: verde con nervaduras que salen del centro.
function irupeTex() {
  return canvasTex(256, 256, (x, w) => {
    const r = rng(41);
    const c = w / 2;
    const g = x.createRadialGradient(c, c, 4, c, c, c);
    g.addColorStop(0, '#3e5a22');
    g.addColorStop(0.85, '#4e6a2a');
    g.addColorStop(1, '#6a3a24');
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
    x.strokeStyle = 'rgba(160,190,110,0.35)';
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(c, c);
      x.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      x.stroke();
    }
    // las celdas entre nervaduras
    x.strokeStyle = 'rgba(40,60,20,0.35)';
    x.lineWidth = 1;
    for (let rr = 20; rr < c; rr += 14 + r() * 6) {
      x.beginPath();
      x.arc(c, c, rr, 0, Math.PI * 2);
      x.stroke();
    }
  });
}

// La barba de viejo: hebras grises que cuelgan.
function mossTex() {
  return canvasTex(64, 256, (x) => {
    const r = rng(51);
    for (let k = 0; k < 40; k++) {
      const bx = 4 + r() * 56;
      const len = 60 + r() * 190;
      x.strokeStyle = `rgba(${150 + r() * 40},${160 + r() * 30},${140 + r() * 30},0.9)`;
      x.lineWidth = 1 + r();
      x.beginPath();
      x.moveTo(bx, 0);
      let px = bx;
      for (let y = 0; y < len; y += 12) {
        px += (r() - 0.5) * 4;
        x.lineTo(px, y);
      }
      x.stroke();
    }
  });
}

export function buildDecor(w) {
  const G = w.estero.G;
  const r = rng(2024);
  const out = keepOut();
  const M = w.M;
  const lvl = WATER_Y;
  const wet = (x, z) => lvl - G.at(x, z);
  const inZone = (x, z) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!w.inside(cx, cz)) return false;
    const i = w.idx(cx, cz);
    return (w.grid[i] === FLOOR && w.groundCell[i]) || w.grid[i] === DOOR;
  };
  // Adentro de las casas, los muelles, la cripta y su escalera no crece nada:
  // el pasto va a la altura del suelo de afuera y asomaba por el piso (o
  // flotaba en el hueco de la escalera, que baja por debajo del suelo). Se
  // mira también el ancho de la mata (la de la pared asomaba del otro lado).
  // En la iglesia en ruinas sí: el pasto entre las piedras. (Se descartan
  // después de sortear alto y giro, así lo demás del estero no se mueve.)
  const roofed = (x, z, top, rad) => {
    const d = rad * 0.7;
    for (const [ox, oz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [d, d], [d, -d], [-d, d], [-d, -d]]) {
      const cx = Math.floor(x + ox);
      const cz = Math.floor(z + oz);
      if (!w.inside(cx, cz)) continue;
      const i = w.idx(cx, cz);
      if ((w.grid[i] !== FLOOR && w.grid[i] !== DOOR) || w.groundCell[i] || top < w.fy[i]) continue;
      if (!ZONES[w.zoneKeys[w.zone[i]]]?.ruin) return true;
    }
    return false;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (im, list, fn) => {
    list.forEach((it, k) => {
      fn(it, k);
      im.setMatrixAt(k, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  };
  const fixed = new THREE.Group();
  const float = new THREE.Group();

  // ---- matas de pasto en el barro seco (dentro de las zonas y alrededor) ----
  const tufts = [];
  for (let z = -6; z < MAP_H + 6; z += 0.9) {
    for (let x = -6; x < MAP_W + 6; x += 0.9) {
      const px = x + r() * 0.9;
      const pz = z + r() * 0.9;
      const d = wet(px, pz);
      if (d > 0.05 || out(px, pz)) continue;
      // en las sendas (lo pisado) casi no hay
      if (inZone(px, pz) && r() < 0.55) continue;
      const h = 0.35 + r() * 0.45;
      const a = r() * Math.PI;
      if (!roofed(px, pz, G.at(px, pz) + h, 0.35 * (0.6 + h))) tufts.push([px, G.at(px, pz), pz, h, a]);
    }
  }
  const tuftMat = evenFoliage(new THREE.MeshStandardMaterial({ map: coverageMips(tuftTex(), 0.45), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  const tuftGeo = crossGeo(0.7, 1);
  fixed.add(
    place(new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length), tufts, ([x, y, z, h, a]) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.03, z), q, s.set(0.6 + h, h, 0.6 + h));
    }),
  );

  // ---- juncos en lo bajo (el agua hasta la rodilla) ----
  const rush = [];
  for (let z = -10; z < MAP_H + 10; z += 1.1) {
    for (let x = -10; x < MAP_W + 10; x += 1.1) {
      const px = x + r();
      const pz = z + r();
      const d = wet(px, pz);
      if (d < 0.08 || d > 0.8 || out(px, pz) || r() < 0.35) continue;
      const h = 1 + r() * 0.9 + d;
      const a = r() * Math.PI;
      if (!roofed(px, pz, G.at(px, pz) + h, 0.2)) rush.push([px, G.at(px, pz), pz, h, a]);
    }
  }
  const rushMat = evenFoliage(new THREE.MeshStandardMaterial({ map: M.reed.map, color: 0x9aa070, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  fixed.add(
    place(new THREE.InstancedMesh(crossGeo(0.5, 1), rushMat, rush.length), rush, ([x, y, z, h, a]) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, y - 0.05, z), q, s.set(0.8, h, 0.8));
    }),
  );

  // ---- irupés: las hojas redondas de borde levantado (flotan) ----
  const pads = [];
  for (const [cx, cz, rad, n] of DECOR.irupe) {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      if (wet(px, pz) < 0.5) continue;
      const size = 0.55 + r() * 0.9;
      if (pads.some(([x2, z2, s2]) => Math.hypot(px - x2, pz - z2) < (size + s2) * 0.95)) continue;
      pads.push([px, pz, size, r() * Math.PI * 2]);
    }
  }
  const padGeo = irupeGeo();
  const padMat = new THREE.MeshStandardMaterial({ map: irupeTex(), color: 0x9aa890, roughness: 0.82, envMapIntensity: 0.2, side: THREE.DoubleSide });
  float.add(
    place(new THREE.InstancedMesh(padGeo, padMat, pads.length), pads, ([x, z, sz, a]) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, lvl + 0.015, z), q, s.set(sz, 1, sz));
    }),
  );
  // la flor del irupé: blanca, con el centro rosado (una de cada cinco hojas)
  const flowers = pads.filter(() => r() < 0.22);
  const petalGeo = flowerGeo();
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, emissive: 0x3a2a30, emissiveIntensity: 0.4, roughness: 0.6, side: THREE.DoubleSide });
  float.add(
    place(new THREE.InstancedMesh(petalGeo, petalMat, flowers.length), flowers, ([x, z, sz, a]) => {
      q.setFromAxisAngle(up, a + 1);
      m4.compose(v.set(x + Math.cos(a) * sz * 0.9, lvl + 0.04, z + Math.sin(a) * sz * 0.9), q, s.set(1, 1, 1));
    }),
  );

  // ---- camalotes: matas de hojas brillantes con flores violetas (flotan) ----
  const cam = [];
  for (const [cx, cz, rad, n] of DECOR.camalote) {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      if (wet(px, pz) < 0.35) continue;
      cam.push([px, pz, 0.5 + r() * 0.5, r() * Math.PI]);
    }
  }
  const leafGeo = new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.45, 1);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5a26, roughness: 0.45, flatShading: true });
  float.add(
    place(new THREE.InstancedMesh(leafGeo, leafMat, cam.length), cam, ([x, z, sz, a]) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, lvl + 0.06, z), q, s.set(sz, sz, sz));
    }),
  );
  const campFl = cam.filter(() => r() < 0.45);
  const lilac = new THREE.MeshStandardMaterial({ color: 0x9a70d8, emissive: 0x2a1a44, emissiveIntensity: 0.5, roughness: 0.6 });
  float.add(
    place(new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.28, 6).translate(0, 0.14, 0), lilac, campFl.length), campFl, ([x, z, sz]) => {
      m4.compose(v.set(x + 0.05, lvl + 0.18 * sz, z), q.identity(), s.set(1.2, 1, 1.2));
    }),
  );

  // ---- árboles muertos parados en el agua, con barba de viejo ----
  const snags = DECOR.snags.map(([x, z, h]) => [x, z, h, r() * Math.PI * 2]);
  const snagG = new THREE.Group();
  const moss = new THREE.MeshStandardMaterial({ map: mossTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0xaab0a0 });
  for (const [x, z, h, a] of snags) {
    const t = new THREE.Group();
    t.position.set(x, G.at(x, z) - 0.2, z);
    t.rotation.y = a;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, h, 6).translate(0, h / 2, 0), M.bark);
    trunk.rotation.z = (r() - 0.5) * 0.12;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const len = 1 + r() * 1.8;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, len, 5).translate(0, len / 2, 0), M.bark);
      b.position.y = h * (0.5 + r() * 0.45);
      b.rotation.set((r() - 0.5) * 0.6, r() * 6, 0.7 + r() * 0.6);
      t.add(b);
      // la barba de viejo colgando de la rama
      const tip = new THREE.Vector3(0, len * 0.8, 0).applyEuler(b.rotation).add(b.position);
      const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4).translate(0, -0.7, 0), moss);
      strand.position.copy(tip);
      strand.rotation.y = r() * 3;
      t.add(strand);
    }
    snagG.add(t);
  }
  fixed.add(snagG);

  // ---- troncos caídos, tocones y piedras en el barro ----
  const logs = [];
  for (const [x, z, len, a] of DECOR.logs) logs.push([x, z, len, a]);
  const logGeo = new THREE.CylinderGeometry(0.22, 0.26, 1, 8).rotateZ(Math.PI / 2);
  fixed.add(
    place(new THREE.InstancedMesh(logGeo, M.bark, logs.length), logs, ([x, z, len, a]) => {
      q.setFromAxisAngle(up, a);
      m4.compose(v.set(x, G.at(x, z) + 0.12, z), q, s.set(len, 1, 1));
    }),
  );
  logs.forEach(([x, z, len, a]) => {
    const c = Math.cos(a);
    const sn = -Math.sin(a);
    // (el tronco frena como un banco: no se pasa por arriba)
    w.addBox([x - Math.abs(c) * len * 0.5 - 0.2, G.at(x, z) - 0.2, z - Math.abs(sn) * len * 0.5 - 0.2, x + Math.abs(c) * len * 0.5 + 0.2, G.at(x, z) + 0.4, z + Math.abs(sn) * len * 0.5 + 0.2], { kind: 'prop' });
  });
  const stones = [];
  for (let k = 0; k < 160; k++) {
    const px = r() * MAP_W;
    const pz = r() * MAP_H;
    if (wet(px, pz) > 0.3 || out(px, pz)) continue;
    stones.push([px, pz, 0.08 + r() * 0.16]);
  }
  fixed.add(
    place(new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.stone, stones.length), stones, ([x, z, sz]) => {
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      m4.compose(v.set(x, G.at(x, z) + sz * 0.2, z), q, s.set(sz * 1.3, sz * 0.7, sz));
    }),
  );

  // ---- más monte alrededor, detrás del pajonal ----
  // (en tierra, entre 3 y 9 m afuera de las zonas; un ceibo de cada cuatro)
  const dist = new Int8Array(MAP_W * MAP_H).fill(99);
  const qq = [];
  for (let i = 0; i < dist.length; i++) if (w.grid[i] === FLOOR) {
    dist[i] = 0;
    qq.push(i);
  }
  for (let h = 0; h < qq.length; h++) {
    const i = qq[h];
    if (dist[i] >= 9) continue;
    const x = i % MAP_W;
    const z = (i - x) / MAP_W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.inside(x + dx, z + dz)) continue;
      const j = w.idx(x + dx, z + dz);
      if (dist[j] <= dist[i] + 1) continue;
      dist[j] = dist[i] + 1;
      qq.push(j);
    }
  }
  const monte = [];
  for (let k = 0; k < 900 && monte.length < DECOR.monte; k++) {
    const x = r() * MAP_W;
    const z = r() * MAP_H;
    const i = w.idx(Math.floor(x), Math.floor(z));
    if (dist[i] < 3 || dist[i] > 9 || wet(x, z) > 0.2) continue;
    if (monte.some(([x2, z2]) => Math.hypot(x - x2, z - z2) < 4)) continue;
    monte.push([x, z, 4 + r() * 4, r() < 0.25 ? 'ceibo' : 'monte']);
  }
  const crowns = [];
  const trunks = [];
  for (const [x, z, h, kind] of monte) {
    trunks.push([x, z, h, kind]);
    const n = kind === 'ceibo' ? 4 : 6;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * (kind === 'ceibo' ? 1.4 : 2);
      crowns.push([x + Math.cos(a) * d, G.at(x, z) + h + (r() - 0.3) * 1.2, z + Math.sin(a) * d, 1.3 + r() * 1.1, kind]);
    }
  }
  fixed.add(
    place(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.34, 1, 7).translate(0, 0.5, 0), M.bark, trunks.length), trunks, ([x, z, h]) => {
      q.setFromAxisAngle(v.set(0, 0, 1), (r() - 0.5) * 0.12);
      m4.compose(v.set(x, G.at(x, z) - 0.2, z), q, s.set(1, h + 0.3, 1));
    }),
  );
  const crownMat = [M.leafDark, M.ceiboLeaf];
  for (const [mat, pick] of [[crownMat[0], (c) => c[4] !== 'ceibo'], [crownMat[1], (c) => c[4] === 'ceibo']]) {
    const list = crowns.filter(pick);
    fixed.add(
      place(new THREE.InstancedMesh(leafCrownGeometry(), mat, list.length), list, ([x, y, z, sz]) => {
        q.setFromAxisAngle(up, r() * 3);
        m4.compose(v.set(x, y, z), q, s.set(sz * 1.2, sz * 0.75, sz * 1.2));
      }),
    );
  }
  // las flores rojas del ceibo (puntitos que brillan un poco)
  const ceiboFl = crowns.filter((c) => c[4] === 'ceibo');
  const red = new THREE.MeshStandardMaterial({ color: 0xd01818, emissive: 0x3a0000, emissiveIntensity: 0.6, roughness: 0.6 });
  const flw = [];
  for (const [x, y, z, sz] of ceiboFl) for (let k = 0; k < 8; k++) flw.push([x + (r() - 0.5) * sz * 2, y + (r() - 0.2) * sz, z + (r() - 0.5) * sz * 2]);
  fixed.add(
    place(new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.22, 5), red, flw.length), flw, ([x, y, z]) => {
      q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, 0));
      m4.compose(v.set(x, y, z), q, s.set(1, 1, 1));
    }),
  );

  fixed.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
      if (o.geometry !== tuftGeo) o.castShadow = o.material !== tuftMat && o.material !== rushMat;
    }
  });
  float.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  w.root.add(fixed, float);
  w.estero.float = float;
}

// Una mata: dos planos cruzados de ancho `wd` y alto 1 (se escala en y).
function crossGeo(wd, h) {
  const geo = new THREE.BufferGeometry();
  const P = [];
  const U = [];
  const I = [];
  for (let k = 0; k < 2; k++) {
    const a = (k * Math.PI) / 2;
    const cx = (Math.cos(a) * wd) / 2;
    const cz = (Math.sin(a) * wd) / 2;
    const b = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, h, cz, -cx, h, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  return geo;
}

// La hoja del irupé: un disco de radio 1 con el borde levantado 12 cm.
function irupeGeo() {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.01), new THREE.Vector2(0.97, 0.04), new THREE.Vector2(1, 0.12), new THREE.Vector2(1.01, 0.14)];
  const geo = new THREE.LatheGeometry(pts, 28);
  // uv de arriba: la textura vista desde arriba
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, 0.5 + p.getX(k) * 0.5, 0.5 + p.getZ(k) * 0.5);
  return geo;
}

// La flor del irupé: dos coronas de pétalos abiertas.
function flowerGeo() {
  const parts = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 10 : 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.3;
      const pet = new THREE.SphereGeometry(0.09, 6, 4).scale(0.5, 0.25, 1.4);
      pet.rotateX(-0.5 - ring * 0.5);
      pet.translate(0, 0.05 + ring * 0.04, 0.12 - ring * 0.04);
      pet.rotateY(a);
      parts.push(pet);
    }
  }
  const out = mergeAll(parts);
  return out;
}

function mergeAll(list) {
  let n = 0;
  let ni = 0;
  for (const g of list) {
    n += g.attributes.position.count;
    ni += g.index.count;
  }
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let k = 0; k < g.index.count; k++) idx.push(g.index.array[k] + o);
    o += g.attributes.position.count;
  }
  void ni;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

// Lo que flota sigue al agua (la creciente sube y baja).
export function updateDecor(w) {
  const f = w.estero?.float;
  if (!f || !w.water) return;
  f.position.y = w.water.level - WATER_Y;
}

