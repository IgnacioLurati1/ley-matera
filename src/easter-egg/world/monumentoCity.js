import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import Water from '../fx/Water';
import { bbox, quad, sweep, PROFILE, mergeMeshes, lathe, place, cylUV } from './monumentoKit';
import { streetY, riverBed } from './Monumento';
import { heightAt } from './Levels';
import { rng } from '../core/noise';

// Lo de afuera del Monumento: las calles Córdoba (norte) y Santa Fe (sur)
// que bajan al río entre edificios de departamentos con ventanas prendidas,
// la Catedral con su cúpula y el Palacio de los Leones en la punta del
// Pasaje, la plaza 25 de Mayo atrás, y el Paraná: ancho, negro, con las
// islas del frente y el puente Rosario-Victoria lejos, al norte.

const RIVER_Y = -5.2;

export function buildCiudad(w) {
  const gb = new GeoBuilder();
  const extra = [];
  buildStreets(w, gb);
  buildBuildings(w, gb, extra);
  buildCatedral(w, gb, extra);
  buildPalacio(w, gb, extra);
  w.root.add(gb.build(w.M, { castShadow: false }));
  if (extra.length) w.root.add(mergeMeshes(extra, { castShadow: false }));
}

// ---------------- las calles ----------------
// Una tira de calle en pendiente a lo largo de x (de xa a xb), entre z0 y z1.
function strip(gb, key, xa, xb, z0, z1, dy = 0, step = 4) {
  for (let x = xa; x < xb; x += step) {
    const x1 = Math.min(xb, x + step);
    quad(gb, key, [[x, streetY(x) + dy, z1], [x1, streetY(x1) + dy, z1], [x1, streetY(x1) + dy, z0], [x, streetY(x) + dy, z0]], [0, 1, 0]);
  }
}

// El cordón de granito de una vereda a lo largo de x: la cara que mira a la
// calzada (en z, hacia `face`) y la piedra de arriba, siguiendo la pendiente.
function curb(gb, xa, xb, z, face, step = 4) {
  for (let x = xa; x < xb; x += step) {
    const x1 = Math.min(xb, x + step);
    quad(gb, 'granito', [[x, streetY(x) - 0.03, z], [x1, streetY(x1) - 0.03, z], [x1, streetY(x1) + 0.125, z], [x, streetY(x) + 0.125, z]], [0, 0, face]);
  }
  strip(gb, 'granito', xa, xb, Math.min(z, z - face * 0.2), Math.max(z, z - face * 0.2), 0.125, step);
}

function buildStreets(w, gb) {
  // Córdoba (norte) y Santa Fe (sur): la vereda del monumento, la calzada de
  // adoquín y la vereda de enfrente, con sus cordones, bajan hasta la
  // avenida. La vereda y la calzada del lado del monumento terminan contra el
  // murete de la explanada de la Proa (x 73), que queda más abajo; la calzada
  // sigue a la avenida por delante del murete y la vereda de enfrente también.
  for (const [zs, zr0, zr1, ze, s, zm] of [[[13.6, 16.4], 6.4, 13.4, [2.6, 6.2], 1, 10], [[43.6, 46.4], 46.6, 53.6, [53.8, 57.4], -1, 51]]) {
    strip(gb, 'baldosa', 20, 73, zs[0], zs[1], 0.12);
    // (la vereda de enfrente, de 3,6 m: era de casi 8 y la calle quedaba corrida)
    strip(gb, 'baldosa', 20, 91, ze[0], ze[1], 0.12);
    strip(gb, 'adoquin', 20, 73, zr0 - 0.2, zr1 + 0.2, 0);
    // la esquina: la calzada sigue bajando hasta la avenida, delante del murete de la explanada
    strip(gb, 'adoquin', 73, 91, s > 0 ? zr0 - 0.2 : zm, s > 0 ? zm : zr1 + 0.2, 0);
    // los cordones de granito (miran a la calzada)
    curb(gb, 20, 73, s > 0 ? zs[0] : zs[1], s > 0 ? -1 : 1);
    curb(gb, 20, 91, s > 0 ? ze[1] : ze[0], s > 0 ? 1 : -1);
  }
  // la avenida Belgrano sigue al norte y al sur (fuera de lo jugable), con
  // sus cordones; del otro lado, el pasto del parque, la barranca y la
  // Costanera, que también siguen (si no, al final de la Costanera se ve el vacío)
  for (const [z0, z1, s] of [[-150, 4, -1], [57, 210, 1]]) {
    quad(gb, 'asfalto', [[90.9, -2.62, z1], [96.1, -2.62, z1], [96.1, -2.62, z0], [90.9, -2.62, z0]], [0, 1, 0]);
    const zb = s < 0 ? [z0, 2.6] : [57.4, z1];
    quad(gb, 'baldosa', [[82, -2.5, zb[1]], [90.9, -2.5, zb[1]], [90.9, -2.5, zb[0]], [82, -2.5, zb[0]]], [0, 1, 0]);
    for (const x of [90.85, 96.15]) bbox(gb, 'granito', x - 0.15, -3.1, z0, x + 0.15, -2.48, z1, { b: 0.03 });
    quad(gb, 'grass', [[96.1, -2.6, z1], [104.65, -2.6, z1], [104.65, -2.6, z0], [96.1, -2.6, z0]], [0, 1, 0]);
    // la baranda de piedra de la barranca, el pasto en pendiente y el muro de contención
    const zw = s < 0 ? [z0, 5] : [56, z1];
    bbox(gb, 'travertino', 104.0, -5.0, zw[0], 104.65, -2.15, zw[1], { b: 0.04, top: 'travStep' });
    const sl = (x) => -2.6 - Math.max(0, Math.min(1, (x - 104) / 4)) * 1.8;
    quad(gb, 'grass', [[104.65, sl(104.65), z1], [108, sl(108), z1], [108, sl(108), z0], [104.65, sl(104.65), z0]], [0.4, 1, 0]);
    bbox(gb, 'travertinoBig', 107.6, -4.8, z0, 108.0, -3.7, z1, { b: 0.03 });
    // la Costanera: la vereda y el cordón de piedra contra el río
    const zc = s < 0 ? [z0, 3.4] : [57.6, z1];
    quad(gb, 'baldosa', [[108, -4.398, zc[1]], [113, -4.398, zc[1]], [113, -4.398, zc[0]], [108, -4.398, zc[0]]], [0, 1, 0]);
    bbox(gb, 'travertino', 113.0, -7, z0, 113.5, -4.1, z1, { b: 0.03, top: 'travStep' });
  }
  // el pasto entre el final del parque y la avenida (el parque arranca en z 5 y termina en 56)
  quad(gb, 'grass', [[98, -2.6, 5], [104.65, -2.6, 5], [104.65, -2.6, 4], [98, -2.6, 4]], [0, 1, 0]);
  quad(gb, 'grass', [[98, -2.6, 57], [104.65, -2.6, 57], [104.65, -2.6, 56], [98, -2.6, 56]], [0, 1, 0]);
  // la plaza 25 de Mayo (al oeste del Pasaje): baldosa y canteros
  quad(gb, 'baldosa', [[-40, 3.38, 40], [0, 3.38, 40], [0, 3.38, 20], [-40, 3.38, 20]], [0, 1, 0]);
  quad(gb, 'grass', [[-40, 3.3, 20], [-6, 3.3, 20], [-6, 3.3, -6], [-40, 3.3, -6]], [0, 1, 0]);
  quad(gb, 'grass', [[-40, 3.3, 66], [-6, 3.3, 66], [-6, 3.3, 40], [-40, 3.3, 40]], [0, 1, 0]);
}

// ---------------- los edificios ----------------
// Un edificio de departamentos: el cuerpo con la fachada de ventanas (repite
// cada 2 m de ancho y 3 m de alto por piso), los balcones corridos y la
// azotea con el tanque.
function block(gb, extra, w, x0, x1, zf, depth, yb, hgt, face, fi, r) {
  const M = w.M;
  const zb = zf - face * depth;
  const yt = yb + hgt;
  const mat = M.fachadas[fi % M.fachadas.length];
  // la fachada: un quad con UV por piso (5 ventanas cada 2x... el canvas es un módulo de 5 x 8)
  const W = x1 - x0;
  const geo = new THREE.PlaneGeometry(W, hgt);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 10), uv.getY(i) * (hgt / 24));
  const pl = new THREE.Mesh(geo, mat);
  pl.position.set((x0 + x1) / 2, yb + hgt / 2, zf);
  pl.rotation.y = face > 0 ? 0 : Math.PI;
  extra.push(pl);
  // los costados (también con ventanas) y la azotea
  for (const sx of [-1, 1]) {
    const xs = sx < 0 ? x0 : x1;
    const sg = new THREE.PlaneGeometry(depth, hgt);
    const su = sg.attributes.uv;
    for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * (depth / 10), su.getY(i) * (hgt / 24));
    const sp = new THREE.Mesh(sg, mat);
    sp.position.set(xs, yb + hgt / 2, (zf + zb) / 2);
    sp.rotation.y = sx * Math.PI / 2;
    extra.push(sp);
  }
  // el zócalo de abajo de la fachada y de los costados: la fachada es pareja
  // y la calle baja, así que del lado de abajo quedaba una ranura bajo el edificio
  quad(gb, 'revoqueDark', [[x0, yb - 3, zf], [x1, yb - 3, zf], [x1, yb, zf], [x0, yb, zf]], [0, 0, face]);
  quad(gb, 'revoqueDark', [[x0, yb - 3, zf], [x0, yb - 3, zb], [x0, yb, zb], [x0, yb, zf]], [-1, 0, 0]);
  quad(gb, 'revoqueDark', [[x1, yb - 3, zf], [x1, yb - 3, zb], [x1, yb, zb], [x1, yb, zf]], [1, 0, 0]);
  bbox(gb, 'revoque', x0, yb - 3, Math.min(zf, zb), x1, yt, Math.max(zf, zb), { b: 0.05, skip: ['+z', '-z', '+x', '-x', 'bottom'], top: 'azotea' });
  // el pretil de la azotea
  bbox(gb, 'revoqueDark', x0, yt, Math.min(zf, zb), x1, yt + 0.9, Math.min(zf, zb) + 0.2, { b: 0.02 });
  bbox(gb, 'revoqueDark', x0, yt, Math.max(zf, zb) - 0.2, x1, yt + 0.9, Math.max(zf, zb), { b: 0.02 });
  // los balcones: losas corridas cada piso, con baranda de caño. Cada piso a la
  // altura de los de la fachada (la textura tiene 7, 8 o 9 pisos en 24 m: con
  // las losas cada 3 m cortaban las ventanas) y la baranda con sus parantes
  // (antes era un caño solo, volando delante de las ventanas).
  // globalThis.__mduNoBalcones: como antes.
  const fix = globalThis.__mduNoBalcones !== true;
  const rowH = fix ? 24 / (mat.userData.rows || 8) : 3;
  for (let y = yb + rowH; y < yt - 1; y += rowH) {
    const z0 = zf;
    const z1 = zf + face * 0.9;
    bbox(gb, 'revoqueDark', x0 + 0.3, y - 0.12, Math.min(z0, z1), x1 - 0.3, y, Math.max(z0, z1), { b: 0.02 });
    const zr0 = face > 0 ? z1 - 0.04 : z1;
    const zr1 = face > 0 ? z1 : z1 + 0.04;
    // (la baranda va sobre el borde de la losa, que llega a 0,88 de la pared)
    const zb0 = fix ? zr0 - face * 0.03 : zr0;
    const zb1 = fix ? zr1 - face * 0.03 : zr1;
    bbox(gb, 'ironBar', x0 + 0.3, y + 0.9, Math.min(zb0, zb1), x1 - 0.3, y + 0.95, Math.max(zb0, zb1), { b: 0.005 });
    if (!fix) continue;
    // los parantes (cada ~0,9 m) y los de las puntas, que bajan a la losa
    const n = Math.max(1, Math.round((x1 - x0 - 0.6) / 0.9));
    for (let k = 0; k <= n; k++) {
      const x = x0 + 0.32 + ((x1 - x0 - 0.64) * k) / n;
      bbox(gb, 'ironBar', x - 0.015, y, Math.min(zb0, zb1) + 0.005, x + 0.015, y + 0.9, Math.max(zb0, zb1) - 0.005, { b: 0.003 });
    }
    // y los costados de la baranda, de la punta a la pared
    for (const x of [x0 + 0.3, x1 - 0.34]) bbox(gb, 'ironBar', x, y + 0.9, Math.min(zf, zb0), x + 0.04, y + 0.95, Math.max(zf, zb1), { b: 0.005 });
  }
  // el tanque de agua y la sala de máquinas
  // (en los angostos de la esquina el tanque de 3 m se salía del costado y
  // quedaba volando: a lo sumo la mitad del ancho)
  const tw = Math.min(3, W * 0.5);
  if (r() < 0.7) bbox(gb, 'revoqueDark', x0 + W * 0.3, yt, Math.min(zf, zb) + depth * 0.3, x0 + W * 0.3 + tw, yt + 2.6, Math.min(zf, zb) + depth * 0.3 + 3, { b: 0.05 });
}

function buildBuildings(w, gb, extra) {
  const r = rng(1957);
  // el norte (calle Córdoba): frentes en z 2,6 mirando al sur; el sur (Santa Fe): en z 57,4
  for (const [zf, face] of [[2.6, 1], [57.4, -1]]) {
    let x = 20;
    let fi = 0;
    while (x < 90) {
      const W = 7 + Math.floor(r() * 9);
      const x1 = Math.min(90, x + W);
      const yb = streetY((x + x1) / 2) + 0.12;
      const hgt = 9 + Math.floor(r() * 7) * 3;
      block(gb, extra, w, x, x1, zf, 14, yb, hgt, face, fi++, r);
      // a veces un pasillo angosto entre dos edificios: con su piso
      const gap = r() < 0.2 ? 0.4 : 0;
      // (al lado de la avenida el piso es la vereda de la avenida: dos pisos en el mismo plano titilaban)
      if (gap && (x1 < 82 || globalThis.__mduNoZfix === true)) quad(gb, 'adoquin', [[x1, streetY(x1) + 0.1, zf], [x1 + gap, streetY(x1 + gap) + 0.1, zf], [x1 + gap, streetY(x1 + gap) + 0.1, zf - face * 14], [x1, streetY(x1) + 0.1, zf - face * 14]], [0, 1, 0]);
      x = x1 + gap;
    }
    // el fondo de la manzana (lo que se ve al final de los pasillos)
    const zb = zf - face * 14;
    quad(gb, 'revoqueDark', [[20, -6, zb], [90, -6, zb], [90, streetY(90) + 9, zb], [20, streetY(20) + 9, zb]], [0, 0, face]);
  }
  // al otro lado de la avenida, río abajo y río arriba (lejos): torres altas
  for (const [x0, z, face] of [[60, -26, 1], [74, -24, 1], [40, -28, 1], [60, 86, -1], [76, 84, -1], [44, 88, -1]]) {
    block(gb, extra, w, x0, x0 + 12, z, 12, streetY(x0 + 6), 36 + Math.floor(r() * 5) * 3, face, Math.floor(r() * 3), r);
  }
}

// ---------------- la Catedral ----------------
// La Catedral de Rosario: el costado norte (que da al Pasaje) con sus
// pilastras y ventanas de medio punto, el campanario y la cúpula verde.
function buildCatedral(w, gb, extra) {
  const M = w.M;
  const z = 40.6;
  const y0 = 3.0;
  // el muro del costado: revoque crema con zócalo, pilastras y cornisa
  bbox(gb, 'revoque', -14, y0 - 1, z, 21, y0 + 14, z + 18, { b: 0.06, skip: ['bottom'] });
  for (let x = -12; x <= 20; x += 4) {
    // (la del medio de la puerta lateral arranca arriba del dintel)
    bbox(gb, 'revoqueDark', x - 0.35, x === 12 ? y0 + 4.2 : y0, z - 0.25, x + 0.35, y0 + 13.2, z, { b: 0.03 });
  }
  sweep(gb, 'revoque', [21, z], [-14, z], [0, -1], PROFILE.cornisa(1.6), { y: y0 + 13.2, caps: false });
  sweep(gb, 'revoqueDark', [21, z], [-14, z], [0, -1], PROFILE.zocalo(2.4), { y: y0, caps: false });
  // las ventanas altas de medio punto (vitrales oscuros con algo de luz adentro)
  const vit = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, emissive: 0x6a3a18, emissiveIntensity: 0.6, roughness: 0.3 });
  for (let x = -10; x <= 18; x += 4) {
    const geo = new THREE.PlaneGeometry(1.4, 3.6);
    extra.push(place(geo, vit, x, y0 + 7.4, z - 0.02, Math.PI));
    const arc = new THREE.CircleGeometry(0.7, 16, 0, Math.PI);
    extra.push(place(arc, vit, x, y0 + 9.2, z - 0.02, Math.PI));
  }
  // la puerta lateral (por donde salen los muertos): un portal con las jambas
  // y el dintel salientes y la puerta metida en el muro, enfrente de la
  // ventana de config WINDOWS [12, 40] (antes el portal era un bloque macizo
  // con la puerta pegada adelante y las tablas quedaban adentro del bloque)
  // (el vano, de 1,2 m: las tablas de la ventana llegan de jamba a jamba)
  const pc = 12.5;
  for (const x of [pc - 1.4, pc + 0.6]) bbox(gb, 'revoqueDark', x, y0 - 0.4, z - 0.4, x + 0.8, y0 + 4.2, z, { b: 0.04 });
  bbox(gb, 'revoqueDark', pc - 0.6, y0 + 3.2, z - 0.4, pc + 0.6, y0 + 4.2, z, { b: 0.04, skip: ['-x', '+x'] });
  const door = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7 });
  extra.push(place(new THREE.PlaneGeometry(1.2, 3.2), door, pc, y0 + 1.6, z - 0.01, Math.PI));
  // el campanario (sobre la esquina del Pasaje) y la cúpula sobre el crucero
  bbox(gb, 'revoque', -8, y0 + 14, z + 2, -2, y0 + 26, z + 8, { b: 0.06, corners: true });
  bbox(gb, 'revoqueDark', -8.4, y0 + 26, z + 1.6, -1.6, y0 + 27, z + 8.4, { b: 0.04 });
  const dome = lathe([[0, 0], [5.2, 0], [5.2, 3.2], [5.0, 3.6], [4.6, 5.2], [3.8, 6.8], [2.6, 8.0], [1.2, 8.8], [0.6, 9.0], [0.6, 10.2], [0.9, 10.6], [0, 11.6]], 32);
  // (UV en metros: si no, el revoque quedaba estirado alrededor; __mduNoCylUV)
  const uvm = (g) => (globalThis.__mduNoCylUV === true ? g : cylUV(g));
  const tamb = uvm(new THREE.CylinderGeometry(5.6, 5.8, 4, 32));
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x6aa08a, roughness: 0.55, metalness: 0.4, emissive: 0x1a3a30, emissiveIntensity: 0.6 });
  extra.push(place(tamb, M.revoque, 6, y0 + 16, z + 9));
  extra.push(place(dome, domeMat, 6, y0 + 18, z + 9));
  extra.push(place(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M.iron, 6, y0 + 30.6, z + 9));
  extra.push(place(new THREE.BoxGeometry(0.9, 0.08, 0.08), M.iron, 6, y0 + 31.2, z + 9));
  w.mon.catedral = { x: 12, y: y0, z: z - 0.4 };
}

// ---------------- el Palacio de los Leones ----------------
// La Municipalidad (del otro lado del Pasaje): dos pisos altos de revoque
// crema, columnas pareadas, balaustrada arriba y los leones.
function buildPalacio(w, gb, extra) {
  const z = 13.9;
  const y0 = 3.3;
  // (la azotea a la altura de la balaustrada: el cuerpo subía hasta 13 m y la
  // balaustrada quedaba metida adentro de la pared, con el pasamanos asomando)
  bbox(gb, 'revoque', -14, y0 - 1, -4, 20.4, y0 + (globalThis.__mduNoPalacio === true ? 13 : 9.8), z, { b: 0.06, skip: ['bottom'] });
  // (las columnas bajan hasta la vereda: arrancaban 30 cm arriba, en el aire)
  for (let x = -12; x <= 19; x += 3.1) {
    for (const dx of [-0.32, 0.32]) {
      const col = globalThis.__mduNoCylUV === true ? new THREE.CylinderGeometry(0.2, 0.22, 8.9, 12) : cylUV(new THREE.CylinderGeometry(0.2, 0.22, 8.9, 12));
      extra.push(place(col, w.M.revoque, x + dx, y0 + 4.45, z + 0.25));
    }
  }
  sweep(gb, 'revoque', [-14, z], [20.4, z], [0, 1], PROFILE.cornisa(1.6), { y: y0 + 9.2, caps: false });
  // la balaustrada de la azotea
  for (let x = -13.6; x < 20; x += 0.4) {
    const b = lathe([[0, 0], [0.09, 0], [0.09, 0.05], [0.05, 0.12], [0.08, 0.32], [0.05, 0.52], [0.09, 0.58], [0.09, 0.62], [0, 0.62]], 8);
    extra.push(place(b, w.M.revoque, x, y0 + 9.8, z - 0.1));
  }
  bbox(gb, 'revoqueDark', -14, y0 + 10.42, z - 0.25, 20.4, y0 + 10.6, z + 0.05, { b: 0.02 });
  // las ventanas (balcones con luz)
  const win = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: 0xffc070, emissiveIntensity: 0.9, roughness: 0.4 });
  for (let x = -10.5; x <= 18; x += 3.1) {
    for (const y of [y0 + 2.2, y0 + 6.4]) extra.push(place(new THREE.PlaneGeometry(1.1, 2.3), win, x, y, z + 0.02));
  }
}

// ---------------- el río ----------------
export function buildRio(w) {
  const g = new GeoBuilder();
  // el fondo del río frente a la costanera (lo que se ve con poca agua)
  for (let x = 113; x < 160; x += 3) {
    quad(g, 'riverBed', [[x, riverBed(x), 210], [x + 3, riverBed(x + 3), 210], [x + 3, riverBed(x + 3), -150], [x, riverBed(x), -150]], [0, 1, 0]);
  }
  // la isla de enfrente: una franja baja de monte (la Isla del Espinillo)
  const isle = new THREE.Group();
  const r = rng(1812);
  const shoreX = 330;
  quad(g, 'grass', [[shoreX, RIVER_Y + 0.6, 400], [shoreX + 80, RIVER_Y + 0.6, 400], [shoreX + 80, RIVER_Y + 0.6, -340], [shoreX, RIVER_Y + 0.6, -340]], [0, 1, 0]);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.7, 1, 5), w.M.bark, 240);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), w.M.leaf, 240);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 240; i++) {
    const x = shoreX + 4 + r() * 60;
    const z = -320 + r() * 700;
    const h = 8 + r() * 10;
    m4.compose(new THREE.Vector3(x, RIVER_Y + 0.6 + h / 2, z), q, new THREE.Vector3(1, h, 1));
    trunk.setMatrixAt(i, m4);
    const c = 4 + r() * 5;
    m4.compose(new THREE.Vector3(x, RIVER_Y + 0.6 + h, z), q, new THREE.Vector3(c, c * 0.7, c));
    crown.setMatrixAt(i, m4);
  }
  isle.add(trunk, crown);
  w.root.add(isle);
  w.root.add(g.build(w.M, { castShadow: false }));
  // el puente Rosario-Victoria: lejos al norte, las torres y los tirantes con luces
  buildPuente(w);
  // el agua (fx/Water): el fondo es el del río; en lo construido, el piso
  const W = w.W;
  const H = w.H;
  const groundAt = (x, z) => {
    if (x >= 113) return riverBed(x);
    if (x >= 0 && z >= 0 && x < W && z < H) return heightAt(w, x, z);
    return 3;
  };
  // (para nadar: arriba del muelle no hay agua, ni en el patio de la 2043, que
  // flota arriba del río; el dibujo del agua sigue por debajo, groundAt)
  w.waterDepth = (x, z, y) => (y > 50 ? 0 : Math.max(0, RIVER_Y - (x >= 113 ? w.floorAt(x, z, y ?? 0) : groundAt(x, z))));
  w.water = new Water(w.g, { level: RIVER_Y, groundAt, bounds: [100, -40, 180, 100], body: 0x0c171c, clear: 1.2, flow: [0.0, 0.05], wind: 0.5, swell: 0.6 });
  w.root.add(w.water.mesh);
}

// El puente: dos torres en H con los tirantes en abanico y las luces rojas arriba.
function buildPuente(w) {
  const g = new GeoBuilder();
  const z0 = -820;
  const x0 = 140;
  const x1 = 470;
  // el tablero, alto sobre el río
  bbox(g, 'revoqueDark', x0, 46, z0 - 6, x1, 48, z0 + 6, { b: 0.2 });
  const towers = [230, 380];
  for (const tx of towers) {
    for (const dz of [-5, 5]) bbox(g, 'revoque', tx - 2, RIVER_Y, z0 + dz - 1.5, tx + 2, 120, z0 + dz + 1.5, { b: 0.3 });
    bbox(g, 'revoque', tx - 2, 100, z0 - 5, tx + 2, 103, z0 + 5, { b: 0.2 });
  }
  w.root.add(g.build(w.M, { castShadow: false }));
  // los tirantes: líneas finas que brillan apenas
  const pts = [];
  for (const tx of towers) {
    for (let k = 1; k <= 12; k++) {
      for (const s of [-1, 1]) {
        pts.push(tx, 118 - k * 1.4, z0, tx + s * k * 6.5, 48, z0);
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  w.root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8a96a8, transparent: true, opacity: 0.55 })));
  // las luces: el tablero (amarillas) y las torres (rojas, titilan)
  const lp = [];
  for (let x = x0; x <= x1; x += 6) lp.push(x, 49, z0 - 6, x, 49, z0 + 6);
  const lights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)), new THREE.PointsMaterial({ color: 0xffd28a, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
  w.root.add(lights);
  const red = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(towers.flatMap((tx) => [tx, 121, z0 - 5, tx, 121, z0 + 5]), 3)), new THREE.PointsMaterial({ color: 0xff2a1a, size: 3.5, sizeAttenuation: false, transparent: true, depthWrite: false }));
  w.root.add(red);
  w.mon.puenteRed = red.material;
}
