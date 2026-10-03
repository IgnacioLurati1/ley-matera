import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { bbox, quad, mergeMeshes, lathe, place } from './monumentoKit';
import { statue } from './monumentoStatues';
import { rng } from '../core/noise';

// La utilería del Monumento: los mástiles-farola de las barandas del Patio con
// sus banderas, el mástil mayor de la explanada, los bolardos de piedra de la
// avenida, las columnas de alumbrado, el Parque (tipas, bancos, faroles y la
// Batería Libertad), la baranda de hierro de la Costanera, los faroles del
// Pasaje, el agua de los espejos y las estatuas de Lola Mora, las banderas de
// la Cripta y las de América en la Sala. Lo que se mueve (las banderas, el
// agua) queda aparte y lo anima w.extraUpdate.

const FLAG_VS = `
  uniform float uT;
  uniform float uAmp;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    float u = uv.x;
    float wv = sin(u * 9.0 - uT * 4.2 + p.y * 1.3) * 0.5 + sin(u * 4.3 - uT * 2.7) * 0.5;
    p.z += wv * uAmp * u;
    p.y -= u * u * uAmp * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;

// La bandera argentina (con el Sol de Mayo), pintada en un canvas.
let flagTex = null;
function argentina() {
  if (flagTex) return flagTex;
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 240;
  const x = c.getContext('2d');
  x.fillStyle = '#74acdf';
  x.fillRect(0, 0, 384, 240);
  x.fillStyle = '#f4f2ec';
  x.fillRect(0, 80, 384, 80);
  // el Sol de Mayo: 32 rayos rectos y flamígeros alternados, con su cara
  x.save();
  x.translate(192, 120);
  x.fillStyle = '#f6b40e';
  x.strokeStyle = '#85340a';
  x.lineWidth = 1;
  for (let i = 0; i < 32; i++) {
    x.save();
    x.rotate((i / 32) * Math.PI * 2);
    x.beginPath();
    if (i % 2) {
      x.moveTo(13, -2.5);
      x.quadraticCurveTo(22, 4, 31, 0);
      x.quadraticCurveTo(22, -4, 13, 2.5);
    } else {
      x.moveTo(13, -3);
      x.lineTo(34, 0);
      x.lineTo(13, 3);
    }
    x.closePath();
    x.fill();
    x.stroke();
    x.restore();
  }
  x.beginPath();
  x.arc(0, 0, 13, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#85340a';
  x.beginPath();
  x.arc(-4, -2, 1.4, 0, Math.PI * 2);
  x.arc(4, -2, 1.4, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.arc(0, 3, 4, 0.2, Math.PI - 0.2);
  x.stroke();
  x.restore();
  flagTex = new THREE.CanvasTexture(c);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  flagTex.anisotropy = 4;
  return flagTex;
}

// Una bandera que flamea (tela con su sombreado de luz de noche).
function flagMesh(w, wid, hgt, amp = 0.25, tex = argentina()) {
  const geo = new THREE.PlaneGeometry(wid, hgt, 16, 6).translate(wid / 2, -hgt / 2, 0);
  const u = { uT: w.mon.flagT, uAmp: { value: amp } };
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = u.uT;
    s.uniforms.uAmp = u.uAmp;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT;\nuniform float uAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        { float u = uv.x; float wv = sin(u * 9.0 - uT * 4.2 + position.y * 1.3) * 0.5 + sin(u * 4.3 - uT * 2.7) * 0.5;
          transformed.z += wv * uAmp * u; transformed.y -= u * u * uAmp * 0.25; }`,
      );
  };
  mat.customProgramCacheKey = () => 'monFlag';
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function buildDecor(w) {
  const M = w.M;
  w.mon.flagT = { value: 0 };
  const gb = new GeoBuilder();
  const extra = [];
  const dyn = new THREE.Group();
  w.root.add(dyn);
  const r = rng(225);
  // ---- el Patio: los mástiles-farola de bronce sobre las barandas y sus banderas
  const lampHead = lathe([[0, 0], [0.12, 0], [0.16, 0.04], [0.16, 0.08], [0.06, 0.12], [0, 0.12]], 10);
  const globe = new THREE.SphereGeometry(0.17, 14, 10);
  const pole = lathe([[0, 0], [0.13, 0], [0.13, 0.14], [0.09, 0.2], [0.07, 0.6], [0.05, 0.66], [0.045, 4.4], [0.06, 4.44], [0.06, 4.5], [0, 4.5]], 10);
  const patioTop = (x) => (x <= 40 ? 2.2 : x <= 60 ? 2.2 - (2.2 * (x - 40)) / 20 : 0) + 1.0;
  for (const [zc, s] of [[16.69, 1], [43.31, -1]]) {
    for (let x = 41.5; x <= 59; x += 3.5) {
      const y = patioTop(x);
      extra.push(place(pole, M.bronze, x, y, zc));
      // la cruz de cuatro globos
      for (const [dx, dz] of [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) {
        extra.push(place(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5).rotateZ(dx ? Math.PI / 2 : 0).rotateX(dz ? Math.PI / 2 : 0), M.bronze, x + dx / 2, y + 4.3, zc + dz / 2));
        extra.push(place(lampHead, M.bronze, x + dx, y + 4.26, zc + dz));
        const g = place(globe, M.lampGlass, x + dx, y + 4.5, zc + dz);
        w.mon.lamps.push(g);
        dyn.add(g);
      }
      // la bandera en su asta, del lado de afuera de la baranda
      const fx = x + 1.75;
      if (fx < 60) {
        extra.push(place(new THREE.CylinderGeometry(0.03, 0.04, 6.2, 6), M.iron, fx, patioTop(fx) + 3.1, zc - s * 0.15));
        const f = flagMesh(w, 1.5, 0.95, 0.22);
        f.position.set(fx, patioTop(fx) + 6.1, zc - s * 0.15);
        f.rotation.y = s > 0 ? -0.3 : Math.PI + 0.3;
        dyn.add(f);
      }
    }
  }
  // ---- la explanada: el mástil mayor con la bandera grande
  const mx = 87;
  const mz = 13.5;
  bbox(gb, 'travertino', mx - 1.2, -2.6, mz - 1.2, mx + 1.2, -1.9, mz + 1.2, { b: 0.05, top: 'travStep' });
  extra.push(place(lathe([[0, 0], [0.7, 0], [0.7, 0.3], [0.45, 0.5], [0.3, 1.4], [0.22, 1.5], [0, 1.5]], 16), M.bronze, mx, -1.9, mz));
  extra.push(place(new THREE.CylinderGeometry(0.1, 0.2, 22, 10), M.iron, mx, -0.4 + 11, mz));
  extra.push(place(new THREE.SphereGeometry(0.22, 12, 10), M.bronze, mx, 21.75, mz));
  const big = flagMesh(w, 7.2, 4.5, 0.65);
  big.position.set(mx, 21.3, mz);
  big.rotation.y = 0.5;
  dyn.add(big);
  w.addBox([mx - 1.2, -2.6, mz - 1.2, mx + 1.2, 21, mz + 1.2], { kind: 'prop' });
  // los bolardos de piedra (esferas) a lo largo de la avenida
  const bol = new THREE.SphereGeometry(0.26, 12, 9);
  for (let z = 10.5; z <= 50; z += 2.2) {
    if (z > 22 && z < 38) continue;
    extra.push(place(bol, M.travertino, 90.4, -2.4, z));
    w.addBox([90.18, -2.6, z - 0.22, 90.62, -2.15, z + 0.22], { kind: 'prop', solid: false });
  }
  // las columnas de alumbrado de la avenida (pescante con la luminaria)
  const lum = (x, y, z, armDir) => {
    extra.push(place(new THREE.CylinderGeometry(0.08, 0.13, 7.6, 8), M.iron, x, y + 3.8, z));
    extra.push(place(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).rotateZ(Math.PI / 2), M.iron, x + armDir * 0.8, y + 7.5, z));
    const h = place(new THREE.BoxGeometry(0.7, 0.14, 0.32), M.iron, x + armDir * 1.55, y + 7.45, z);
    extra.push(h);
    const g = place(new THREE.BoxGeometry(0.6, 0.04, 0.26), M.lampGlass, x + armDir * 1.55, y + 7.37, z);
    w.mon.lamps.push(g);
    dyn.add(g);
    w.addBox([x - 0.13, y, z - 0.13, x + 0.13, y + 7.6, z + 0.13], { kind: 'prop', solid: false });
  };
  for (const [x, z, d] of [[84, 14, 1], [84, 46, 1], [94, 30, -1], [91.2, 18, 1], [91.2, 42, 1]]) lum(x, -2.6, z, d);
  // ---- el Parque: tipas, bancos, faroles y la Batería Libertad
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 1, 7);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  // (lejos del mástil de la barranca, en 101,5 / 30,5: la Bandera izada no se enreda en las copas)
  const trees = [[99.2, 9], [102.5, 13], [99, 24], [102.6, 25.4], [99.3, 35.0], [102.4, 37.6], [99.1, 45], [102.7, 49], [99.5, 52.5], [102.4, 21.5], [99.4, 39.4]];
  const leafM = new THREE.MeshStandardMaterial({ color: 0x24361e, roughness: 0.95, flatShading: true });
  for (const [x, z] of trees) {
    const h = 3.2 + r() * 1.6;
    const t = place(trunk, M.bark, x, -2.6 + h / 2, z);
    t.scale.set(1, h, 1);
    extra.push(t);
    // tres ramas abiertas y la copa ancha y achatada de la tipa
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + r();
      extra.push(place(new THREE.CylinderGeometry(0.08, 0.14, 2.2, 5).rotateZ(0.7).rotateY(a), M.bark, x + Math.cos(a) * 0.6, -2.6 + h + 0.6, z + Math.sin(a) * 0.6));
    }
    for (let k = 0; k < 5; k++) {
      const c = place(crownG, leafM, x + (r() - 0.5) * 3.2, -2.6 + h + 1.6 + r() * 1.2, z + (r() - 0.5) * 3.2);
      c.scale.set(2.0 + r() * 1.2, 1.0 + r() * 0.5, 2.0 + r() * 1.2);
      extra.push(c);
    }
    w.addBox([x - 0.3, -2.6, z - 0.3, x + 0.3, -2.6 + h + 1, z + 0.3], { kind: 'prop' });
  }
  // bancos de plaza (listones de madera y patas de hierro)
  const bench = (x, z, ry) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(place(new THREE.BoxGeometry(1.7, 0.035, 0.09), M.wood, 0, 0.44, -0.16 + i * 0.1));
    for (let i = 0; i < 3; i++) g.add(place(new THREE.BoxGeometry(1.7, 0.08, 0.03), M.wood, 0, 0.6 + i * 0.12, -0.24).rotateX(-0.15));
    for (const sx of [-0.75, 0.75]) g.add(place(new THREE.BoxGeometry(0.06, 0.44, 0.5), M.iron, sx, 0.22, 0));
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    return g;
  };
  for (const [x, z, ry] of [[101, 16.5, -Math.PI / 2], [101, 43.5, -Math.PI / 2], [101.4, 33.6, -Math.PI / 2], [110.5, 12, Math.PI / 2], [110.5, 48, Math.PI / 2], [110.5, 24, Math.PI / 2]]) {
    const y = x > 105 ? -4.4 : -2.6;
    const b = bench(x, z, ry);
    b.position.y = y;
    b.updateMatrixWorld(true);
    b.traverse((o) => o.isMesh && extra.push(o));
    w.addBox([x - 0.4, y, z - 0.9, x + 0.4, y + 0.85, z + 0.9], { kind: 'prop' });
  }
  // la Batería Libertad: el parapeto de piedra, la placa y los dos cañones viejos
  bbox(gb, 'travertino', 101.4, -2.6, 6.2, 103.9, -1.9, 6.6, { b: 0.04, top: 'travStep' });
  const bat = w.mon.bateria = [];
  for (const z of [8.2, 10.6]) {
    const c = cannon(M);
    c.position.set(102.6, -2.6, z);
    c.rotation.y = Math.PI / 2;
    c.updateMatrixWorld(true);
    bat.push(c);
    w.root.add(c);
    w.addBox([102.0, -2.6, z - 0.55, 103.4, -1.6, z + 0.55], { kind: 'prop' });
  }
  // ---- la reja del Parque: sobre el cordón de la avenida, los extremos y el
  // murito de la barranca (antes era un cordón bajo que no se podía pasar: una
  // pared invisible). Barrotes con punta de lanza, dos travesaños y pilares de
  // piedra cada tanto; los huecos son los de las vallas y las escaleras.
  const spear = new THREE.ConeGeometry(0.026, 0.1, 4).translate(0, 0.05, 0);
  const reja = (ax, c, a0, a1, y0, h) => {
    const at = (u, v) => (ax === 'z' ? [c + v, u] : [u, c + v]);
    const box3 = (u0, u1, v0, v1, yy0, yy1, key, o) => {
      const [x0, z0] = at(u0, v0);
      const [x1, z1] = at(u1, v1);
      bbox(gb, key, Math.min(x0, x1), yy0, Math.min(z0, z1), Math.max(x0, x1), yy1, Math.max(z0, z1), o);
    };
    const n = Math.max(1, Math.round((a1 - a0) / 6));
    const step = (a1 - a0) / n;
    for (let k = 0; k <= n; k++) {
      const u = a0 + k * step;
      const u0 = Math.min(a1 - 0.36, Math.max(a0, u - 0.18));
      box3(u0, u0 + 0.36, -0.19, 0.19, y0 - 0.02, y0 + h + 0.22, 'travertino', { b: 0.03, top: 'travStep' });
      // el remate del pilar
      box3(u0 - 0.03, u0 + 0.39, -0.22, 0.22, y0 + h + 0.22, y0 + h + 0.3, 'travertino', { b: 0.02, top: 'travStep' });
    }
    for (let k = 0; k < n; k++) {
      const b0 = a0 + k * step + 0.18;
      const b1 = a0 + (k + 1) * step - 0.18;
      for (const y of [y0 + 0.1, y0 + h - 0.16]) box3(b0, b1, -0.022, 0.022, y, y + 0.045, 'ironBar', { b: 0.004 });
      const nb = Math.max(2, Math.round((b1 - b0) / 0.15));
      for (let i = 1; i < nb; i++) {
        const u = b0 + ((b1 - b0) * i) / nb;
        box3(u - 0.012, u + 0.012, -0.012, 0.012, y0, y0 + h, 'ironBar', { b: 0.002 });
        const [x, z] = at(u, 0);
        extra.push(place(spear, M.ironBar, x, y0 + h, z));
      }
    }
  };
  // la avenida (x 97-98, el cordón tiene arriba -2.25) y los extremos del parque
  for (const [a0, a1] of [[5.0, 13.0], [16.0, 45.0], [48.0, 56.0]]) reja('z', 97.5, a0, a1, -2.25, 1.15);
  // (los extremos tienen la ventana de los muertos en x 100-101: queda el hueco)
  for (const z of [5.5, 55.5]) for (const [a0, a1] of [[97.0, 99.7], [101.3, 104.65]]) reja('x', z, a0, a1, -2.25, 1.15);
  // la barranca (el murito de x 104-104.65, arriba -2.15), menos las escaleras
  for (const [a0, a1] of [[5.0, 18.0], [21.0, 40.0], [43.0, 56.0]]) reja('z', 104.33, a0, a1, -2.15, 0.95);
  // ---- la Costanera: la baranda de hierro y los faroles
  const rail = (z0, z1) => {
    for (let z = z0; z <= z1; z += 1.2) extra.push(place(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), M.iron, 113.25, -4.1 + 0.5, z));
    for (const y of [-3.14, -3.6]) extra.push(place(new THREE.CylinderGeometry(0.03, 0.03, z1 - z0, 6).rotateX(Math.PI / 2), M.iron, 113.25, y, (z0 + z1) / 2));
  };
  rail(4.2, 27.8);
  rail(33.2, 56.8);
  for (const [z] of [[14], [46]]) {
    extra.push(place(new THREE.CylinderGeometry(0.06, 0.1, 4.8, 8), M.iron, 112.6, -4.4 + 2.4, z));
    const g = place(new THREE.SphereGeometry(0.24, 14, 10), M.lampGlass, 112.6, -4.4 + 5.0, z);
    w.mon.lamps.push(g);
    dyn.add(g);
    w.addBox([112.45, -4.4, z - 0.15, 112.75, 0.6, z + 0.15], { kind: 'prop', solid: false });
  }
  // el farol de la punta del muelle
  extra.push(place(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 8), M.iron, 124.2, -4.4 + 1.2, 30.5));
  const tip = place(new THREE.SphereGeometry(0.2, 12, 9), M.lampGlass, 124.2, -4.4 + 2.5, 30.5);
  w.mon.lamps.push(tip);
  dyn.add(tip);
  // ---- el Pasaje: los faroles y el agua de los espejos
  for (const [x, z] of [[6, 33], [15, 26.3]]) {
    extra.push(place(new THREE.CylinderGeometry(0.07, 0.12, 4.0, 8), M.iron, x, 3.6 + 2.0, z));
    const g = place(new THREE.SphereGeometry(0.26, 14, 10), M.lampGlass, x, 3.6 + 4.2, z);
    w.mon.lamps.push(g);
    dyn.add(g);
  }
  const waterM = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.86 });
  for (const P of w.mon.pools || []) {
    const geo = new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(-Math.PI / 2);
    const m = place(geo, waterM, (P.x0 + P.x1) / 2, P.y, (P.z0 + P.z1) / 2);
    m.receiveShadow = true;
    dyn.add(m);
    // (el del norte se vacía con la válvula: entities/monumento/SableQuest.js)
    (w.mon.poolWater ||= []).push(m);
  }
  // las estatuas de Lola Mora: cinco en el estanque del norte, cinco en el espejo del sur
  const lola = [
    ['lola', 8, 3.1, 19, 0.4],
    ['lolaPar', 12.5, 3.1, 18, 0],
    ['lola', 17, 3.1, 20, -0.4],
    ['granadero', 10, 3.1, 23.6, 0.2],
    ['lolaPar', 15.5, 3.1, 23.6, -0.2],
    ['lola', 7.5, 3.35, 36.5, Math.PI - 0.3],
    ['lolaPar', 11.5, 3.35, 37, Math.PI],
    ['lola', 15.5, 3.35, 36.5, Math.PI + 0.3],
    ['lolaPar', 9.5, 3.35, 34.2, Math.PI],
    ['lola', 18.6, 3.35, 35.5, Math.PI + 0.6],
  ];
  for (const [kind, x, y, z, ry] of lola) {
    bbox(gb, 'travertino', x - 0.6, y - 0.1, z - 0.5, x + 0.6, y + 0.75, z + 0.5, { b: 0.05, top: 'travStep' });
    extra.push(...statue(kind, M.marble, x, y + 0.75, z, ry, kind === 'granadero' ? 0.9 : 1.05));
    if (y > 3.2) w.addBox([x - 0.6, y - 0.1, z - 0.5, x + 0.6, y + 2.6, z + 0.5], { kind: 'prop' });
  }
  // ---- la Sala de Honor: las banderas de América en sus vitrinas (marco de
  // bronce, fondo de pana azul, la luz de museo arriba y la placa con el nombre)
  {
    const velvet = new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 1 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffdcae, emissiveIntensity: 1.6 });
    const names = AMERICA.map((f) => f[0]);
    const atlas = document.createElement('canvas');
    atlas.width = 512;
    atlas.height = 64 * names.length;
    const ax = atlas.getContext('2d');
    names.forEach((n, i) => {
      ax.fillStyle = '#6b5226';
      ax.fillRect(0, i * 64, 512, 64);
      ax.fillStyle = '#e9cf8a';
      ax.font = '600 34px Cinzel, Georgia, serif';
      ax.textAlign = 'center';
      ax.textBaseline = 'middle';
      ax.fillText(n.toUpperCase(), 256, i * 64 + 33);
    });
    const plaqueMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(atlas), metalness: 0.6, roughness: 0.45 });
    plaqueMat.map.colorSpace = THREE.SRGBColorSpace;
    // [x, cara]: la pared del norte (z 15, mira a +z) y la del sur (z 22, mira a -z),
    // entre la lata, la Mula, la ventana y la caja
    const spots = [[6.3, 1], [7.8, 1], [14.6, 1], [18.6, 1], [6.3, -1], [7.8, -1], [9.3, -1], [10.8, -1], [15.6, -1], [17.1, -1], [18.6, -1]];
    spots.forEach(([x, f], i) => {
      const wz = f > 0 ? 15 : 22;
      const z = (d) => wz + f * d;
      const lo = (a, b) => Math.min(z(a), z(b));
      const hi = (a, b) => Math.max(z(a), z(b));
      // el marco
      for (const [x0, y0, x1, y1] of [[x - 0.62, 0.92, x + 0.62, 0.98], [x - 0.62, 2.08, x + 0.62, 2.14], [x - 0.62, 0.92, x - 0.56, 2.14], [x + 0.56, 0.92, x + 0.62, 2.14]]) {
        bbox(gb, 'bronze', x0, y0, lo(0, 0.2), x1, y1, hi(0, 0.2), { b: 0.01 });
      }
      bbox(gb, 'bronze', x - 0.66, 0.86, lo(0, 0.26), x + 0.66, 0.92, hi(0, 0.26), { b: 0.012 });
      extra.push(place(new THREE.BoxGeometry(1.12, 1.1, 0.03), velvet, x, 1.53, z(0.04)));
      extra.push(place(new THREE.BoxGeometry(1.0, 0.025, 0.04), glow, x, 2.06, z(0.16)));
      // la placa con el nombre (un renglón del atlas)
      const pg = new THREE.PlaneGeometry(0.62, 0.078);
      const uv = pg.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / names.length);
      const pl = place(pg, plaqueMat, x, 0.79, z(0.012));
      pl.rotation.y = f > 0 ? 0 : Math.PI;
      pl.updateMatrix();
      extra.push(pl);
      // la bandera, apenas caída
      const fl = flagMesh(w, 0.98, 0.62, 0.03, americaFlag(AMERICA[i]));
      fl.position.set(x - f * 0.49, 1.84, z(0.1));
      fl.rotation.y = f > 0 ? 0 : Math.PI;
      dyn.add(fl);
    });
  }
  // ---- la Cripta: banderas en sus astas de bronce
  for (const [x, z] of w.mon.cryptFlags || []) {
    extra.push(place(new THREE.CylinderGeometry(0.025, 0.03, 2.8, 6), M.bronze, x, -2.6 + 1.4, z));
    const f = flagMesh(w, 1.0, 0.64, 0.05);
    f.position.set(x, -2.6 + 2.7, z);
    f.rotation.y = z < 30 ? 0 : Math.PI;
    dyn.add(f);
  }
  w.root.add(gb.build(M));
  if (extra.length) w.root.add(mergeMeshes(extra));
  // lo que se mueve: las banderas flamean y la baliza de la Torre titila
  const prev = w.extraUpdate;
  w.extraUpdate = (dt, t) => {
    prev?.(dt, t);
    w.mon.flagT.value = t;
    if (w.mon.beacon) w.mon.beacon.emissiveIntensity = Math.sin(t * 2.4) > 0.6 ? 4 : 0.4;
    if (w.mon.puenteRed) w.mon.puenteRed.opacity = 0.4 + 0.6 * (Math.sin(t * 1.9) > 0.2 ? 1 : 0);
  };
}

// Las banderas de América de la Sala de Honor: [nombre, dibujo en 256×160].
const star = (x, cx, cy, r, n = 5) => {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * 0.42 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
};
const bands = (x, cols, vertical = false) => {
  const n = cols.length;
  cols.forEach((c, i) => {
    x.fillStyle = c;
    if (vertical) x.fillRect((256 * i) / n, 0, 256 / n + 1, 160);
    else x.fillRect(0, (160 * i) / n, 256, 160 / n + 1);
  });
};
const emblem = (x, cx, cy, r, ring, inner) => {
  x.fillStyle = ring;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = inner;
  x.beginPath();
  x.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  x.fill();
};
const AMERICA = [
  ['Argentina', null],
  ['Bolivia', (x) => bands(x, ['#d52b1e', '#f9e300', '#007934'])],
  ['Brasil', (x) => {
    x.fillStyle = '#009c3b';
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#ffdf00';
    x.beginPath();
    x.moveTo(128, 14); x.lineTo(240, 80); x.lineTo(128, 146); x.lineTo(16, 80);
    x.fill();
    x.fillStyle = '#002776';
    x.beginPath();
    x.arc(128, 80, 36, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#f4f2ec';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(150, 130, 70, Math.PI * 1.08, Math.PI * 1.55);
    x.stroke();
  }],
  ['Chile', (x) => {
    bands(x, ['#f4f2ec', '#d52b1e']);
    x.fillStyle = '#0039a6';
    x.fillRect(0, 0, 80, 80);
    x.fillStyle = '#f4f2ec';
    star(x, 40, 40, 18);
  }],
  ['Colombia', (x) => bands(x, ['#fcd116', '#fcd116', '#003893', '#ce1126'])],
  ['Ecuador', (x) => {
    bands(x, ['#ffdd00', '#ffdd00', '#034ea2', '#ed1c24']);
    emblem(x, 128, 80, 22, '#7a5a22', '#5aa0d0');
  }],
  ['México', (x) => {
    bands(x, ['#006847', '#f4f2ec', '#ce1126'], true);
    emblem(x, 128, 80, 22, '#8a5a2a', '#c49a3c');
  }],
  ['Paraguay', (x) => {
    bands(x, ['#d52b1e', '#f4f2ec', '#0038a8']);
    emblem(x, 128, 80, 16, '#0f6b3a', '#f6c80a');
  }],
  ['Perú', (x) => bands(x, ['#d91023', '#f4f2ec', '#d91023'], true)],
  ['Uruguay', (x) => {
    for (let i = 0; i < 9; i++) {
      x.fillStyle = i % 2 ? '#0038a8' : '#f4f2ec';
      x.fillRect(0, (160 * i) / 9, 256, 160 / 9 + 1);
    }
    x.fillStyle = '#f4f2ec';
    x.fillRect(0, 0, 96, 89);
    x.fillStyle = '#fcd116';
    star(x, 48, 44, 30, 16);
    x.beginPath();
    x.arc(48, 44, 14, 0, Math.PI * 2);
    x.fill();
  }],
  ['Venezuela', (x) => {
    bands(x, ['#ffcc00', '#00247d', '#cf142b']);
    x.fillStyle = '#f4f2ec';
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (1.12 + (i / 7) * 0.76);
      star(x, 128 + Math.cos(a) * 34, 96 + Math.sin(a) * 34, 6);
    }
  }],
];
const AMERICA_TEX = new Map();
function americaFlag([name, paint]) {
  if (!paint) return argentina();
  let t = AMERICA_TEX.get(name);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  paint(c.getContext('2d'));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  AMERICA_TEX.set(name, t);
  return t;
}

// Un cañón viejo de la Batería: el tubo de bronce oscuro sobre la cureña de madera.
export function cannon(M) {
  const g = new THREE.Group();
  const tube = lathe([[0, -0.05], [0.2, -0.05], [0.22, 0.05], [0.19, 0.12], [0.17, 0.8], [0.15, 1.5], [0.16, 1.56], [0.14, 1.6], [0.1, 1.6], [0.1, 1.5], [0, 1.5]], 14);
  const t = new THREE.Mesh(tube, M.bronzeDark);
  t.rotation.x = Math.PI / 2 - 0.12;
  t.position.set(0, 0.62, -0.5);
  t.name = 'tubo';
  g.add(t);
  for (const sx of [-0.2, 0.2]) {
    g.add(place(new THREE.BoxGeometry(0.08, 0.36, 1.2), M.woodDark, sx, 0.34, 0));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14).rotateZ(Math.PI / 2), M.woodDark);
    wheel.position.set(sx * 1.45, 0.3, 0.25);
    g.add(wheel);
  }
  g.add(place(new THREE.BoxGeometry(0.5, 0.08, 1.2), M.woodDark, 0, 0.18, 0));
  return g;
}
