import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONES, LIGHTS, PLAYER_START, PROPS } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';
import { EclipseAtmos } from './eclipseAtmos';
import { keepOut, onFloor, zoneAtCell } from './eclipse/centro';
import { upgradeFloors, hiTex } from './eclipseGfxTex';
import { buildMood } from './eclipseMood';

// La pasada gráfica de Eclipse Matero (grafica-v3, 2026-10-06). El usuario:
// "poca iluminación, todo muy plano y sin oclusión", "lo que sostiene las
// cosas se ve espantoso". Comparado con Mate no Numa (que le parece
// magistral) lo que faltaba era contraste: allá todo lo que no toca un fuego
// está casi negro y las lámparas bajas hacen charcos de luz donde se lee el
// relieve y la oclusión; acá la luz del cielo y la del eclipse alumbraban
// todo parejo. Lo de acá:
//  1. la luz: menos cielo y ambiente (el eclipse un poco menos), encima de lo
//     que deja world/eclipseAtmos (switch __mduNoEclLight);
//  2. faroles y braseros con halo en las zonas abiertas, desde la carga (se
//     suman a World.lights antes de buildLights, así entran al recorte de
//     luces, a los halos de fx/Ambience y a las sombras de fuegos de fx/Epic;
//     __mduNoEclLamps);
//  3. la roca de abajo de las islas (world/eclipseRock.js, una malla de caras
//     planas y color por vértice): textura de roca en tres planos (sin
//     estirarse), relieve, vetas por altura y oclusión en la unión con el piso
//     (__mduNoEclRock).
// Todo se lee del config en tiempo de ejecución (zonas, islas, alturas): las
// zonas nuevas del layout entran solas.

const on = (k) => globalThis[k] !== true;

export function buildEclipseGfx(w) {
  const live = [];
  if (on('__mduNoEclLight')) installLight();
  if (on('__mduNoEclLamps')) {
    const L = buildLamps(w);
    if (L) live.push(L);
  }
  // texturas de piso y de roca en alta (world/eclipseGfxTex.js, __mduNoEclTex)
  const hi = upgradeFloors(w);
  if (on('__mduNoEclRock')) rockLook(w, hi);
  if (on('__mduNoEclVitral')) vitrales(w);
  // el aire y el tinte de cada isla (world/eclipseMood.js, sesión 1f)
  if (on('__mduNoEclMood')) live.push(buildMood(w));
  const relief = floorRelief(w);
  return {
    update(dt, t) {
      for (const m of live) m.update(dt, t);
      relief();
    },
  };
}

// ---------------- 1. la luz ----------------
// Cuánto queda de cada luz de la atmósfera (afuera; adentro ya baja sola).
// El estero: cielo 0,9 × un azul oscuro (~0,3 efectivo) y ambiente 0,5; acá el
// cielo daba ~1,0 efectivo y el eclipse 1,7-2,2.
// (sesión 1f, el usuario 2026-10-06: "aumentaría un poco la luz de luna que
// genera el cielo, se ve medio simplón a comparación de Mate no Numa o Mate of
// the Dead": la luna 0,46 → 0,8 y un poco más de cielo; las sombras de la luna
// marcan el relieve. Después: "aumentaría más la luz que se genera en el
// cielo, así parece más la luz de luna de Mate no Numa": cielo y ambiente
// como en el estero (0,9 y 0,5). globalThis.__mduOldEclMoon: la de antes)
export const LIGHT_K = globalThis.__mduOldEclMoon === true ? { hemi: 0.3, amb: 0.45, moon: 0.46 } : { hemi: 0.55, amb: 0.8, moon: 0.95 };
let lightOn = false;
function installLight() {
  if (lightOn) return;
  lightOn = true;
  const apply = EclipseAtmos.prototype.apply;
  EclipseAtmos.prototype.apply = function (dt) {
    apply.call(this, dt);
    if (globalThis.__mduNoEclLight === true) return;
    const w = this.g.world;
    if (!w?.hemi) return;
    // (el clima vuelve a poner las intensidades en cada cuadro: no se acumula)
    w.hemi.intensity *= LIGHT_K.hemi;
    w.ambient.intensity *= LIGHT_K.amb;
    if (w.moon) w.moon.intensity *= LIGHT_K.moon;
  };
}

// ---------------- 1c. los haces de los vitrales ----------------
// La capilla de los caballeros (copiada del castillo): la luz de color que
// entra por los cuatro vitrales y el rosetón. Lo mismo que world/castleRooms
// (buildShafts), solo con los vitrales: fx/Ambience los dibuja (fx/Shafts).
const VITRAL = { fuego: 0xff8a4a, viento: 0x8affc0, rayo: 0xffe070, hielo: 0x9adcff };
// (el castillo usa 1,2 con su noche más cerrada; acá la vista salía lavada en
// blanco y amarillo: menos de la mitad)
const VITRAL_K = 0.45;
function vitrales(w) {
  const items = [];
  const ray = (n, drop) => new THREE.Vector3(n.x, -drop, n.z).normalize();
  for (const p of PROPS || []) {
    if (p.type !== 'vitral' && p.type !== 'roseton') continue;
    const rot = p.rot || 0;
    const n = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
    const [x, z] = p.pos;
    const fy = w.floorAt(x + n.x, z + n.z);
    if (p.type === 'vitral') {
      const h = (p.h || 3.4) * 0.8;
      const c = new THREE.Vector3(x, fy + (p.y0 ?? 1.6) + (p.h || 3.4) * 0.45, z).addScaledVector(n, 0.06);
      items.push({ c, n, w: (p.w || 1.4) * 0.85, h, dir: ray(n, 0.55), fy, tint: new THREE.Color(VITRAL[p.kind] || 0xffffff), k: VITRAL_K, bars: [{ y: 0, roll: Math.PI / 2 }, { y: h * 0.18, roll: 0 }] });
    } else {
      const R = (p.r || 1.5) * 1.6;
      const c = new THREE.Vector3(x, fy + (p.y0 ?? 7), z).addScaledVector(n, 0.08);
      items.push({ c, n, w: R, h: R, dir: ray(n, 0.8), fy, tint: new THREE.Color(0xc8b8ff), k: VITRAL_K * 0.7, round: true, bars: [0, 1, 2, 3].map((i) => ({ y: 0, roll: (i * Math.PI) / 4 })) });
    }
  }
  if (items.length) w.shaftItems = items;
}

// ---------------- 1b. el relieve de los pisos ----------------
// Los pisos de tierra y pasto traen solo el grano del color como relieve
// (core/textures.js: relief { detail }): con el eclipse alto casi no se ve.
// Acá, más fuerte (fx/Surfaces les pone el normal map con escala 1 al
// prenderse o al cambiar la calidad: se vuelve a poner cada cuadro, son
// pocos materiales). __mduNoEclRelief: como antes.
const RELIEF_K = { grass: 2.6, dirt: 2.4, dirtDark: 2.4, ground: 2.4, concrete: 1.6, terracotta: 1.5, stone: 1.6, flagstone: 1.5, calcareo: 1.3, rock: 2.2, caveFloor: 1.8, caveRock: 1.8, snow: 1.6 };
// (y los pisos de afuera más oscuros: el pasto de la textura es claro y, con
// la noche del eclipse, el claro se veía como de día nublado)
const FLOOR_DIM = { grass: 0.72, dirt: 0.8, dirtDark: 0.85, ground: 0.8 };
function floorRelief(w) {
  const list = [];
  for (const [k, v] of Object.entries(RELIEF_K)) if (w.M?.[k]) list.push([w.M[k], v]);
  if (globalThis.__mduNoEclRelief !== true) for (const [k, v] of Object.entries(FLOOR_DIM)) w.M?.[k]?.color.multiplyScalar(v);
  return () => {
    const off = globalThis.__mduNoEclRelief === true;
    for (const [m, v] of list) {
      if (!m.normalMap) continue;
      const want = off ? 1 : v;
      if (m.normalScale.x !== want) m.normalScale.set(want, want);
    }
  };
}

// ---------------- 2. faroles y braseros ----------------
const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
// metros entre faroles, y de un farol a una luz del config
const LAMP_GAP = 10;
const LAMP_CLEAR = 7;
// cuántos por zona (por metros cuadrados) y en todo el mapa
const LAMP_AREA = 85;
const LAMP_MAX = 64;
const POST_H = 2.55;

function zoneArea(k) {
  let a = 0;
  for (const r of ZONES[k].rects || []) a += (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
  return a;
}
const isleOfZone = (k) => Object.keys(ISLANDS).find((id) => ISLANDS[id].zones.includes(k)) || ZONES[k]?.isla || null;

// ¿Está a más de m metros de toda celda de borde (piso con una vecina que no
// es piso: la baranda, el barranco, una puerta)? Los faroles y braseros
// cortaban la baranda del borde de las islas (detector de main, t_rails_ray).
function edgeCell(w, cx, cz) {
  if (!w.inside(cx, cz) || w.grid[w.idx(cx, cz)] !== 1) return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!w.inside(cx + dx, cz + dz) || w.grid[w.idx(cx + dx, cz + dz)] !== 1) return true;
  }
  return false;
}
function clearOfEdge(w, x, z, m) {
  for (let cz = Math.floor(z - m) - 1; cz <= Math.floor(z + m) + 1; cz++) {
    for (let cx = Math.floor(x - m) - 1; cx <= Math.floor(x + m) + 1; cx++) {
      if (!edgeCell(w, cx, cz)) continue;
      const dx = Math.max(cx - x, 0, x - (cx + 1));
      const dz = Math.max(cz - z, 0, z - (cz + 1));
      if (dx * dx + dz * dz < m * m) return false;
    }
  }
  return true;
}

function buildLamps(w) {
  // (lejos del arranque: el primer cuadro de la partida no es un poste en la cara)
  const out = keepOut([[PLAYER_START.x, PLAYER_START.z, 6]]);
  const r = rng(4242);
  const used = LIGHTS.filter((L) => L.pos).map((L) => [L.pos[0], L.pos[2]]);
  const lamps = [];
  const fires = [];
  const keys = Object.keys(ZONES).filter((k) => ZONES[k].outdoor && !ZONES[k].frag && ZONES[k].isla && ZONES[k].isla !== 'desgarro' && ZONES[k].isla !== 'abismo' && ZONES[k].isla !== 'grietas');
  for (const k of keys) {
    const want = Math.max(1, Math.min(5, Math.round(zoneArea(k) / LAMP_AREA)));
    // las celdas del borde de la zona (al lado de una baranda o de otra zona):
    // el farol queda contra el borde y alumbra hacia adentro
    const cand = [];
    for (const R of ZONES[k].rects || []) {
      for (let z = R[1]; z <= R[3]; z++) {
        for (let x = R[0]; x <= R[2]; x++) {
          if (zoneAtCell(w, x + 0.5, z + 0.5) !== k) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (zoneAtCell(w, x + 0.5 + dx, z + 0.5 + dz) === k) continue;
            // (dos celdas adentro del borde: el farol no corta la baranda)
            cand.push([x + 0.5 - dx * 2, z + 0.5 - dz * 2, -dx, -dz]);
            break;
          }
        }
      }
    }
    // en las zonas grandes, también adentro (mezclados con los del borde): el claro
    // es una explanada y con los del borde solo el medio quedaba sin luz
    if (zoneArea(k) > 220) {
      const inner = [];
      for (const R of ZONES[k].rects || []) {
        for (let z = R[1]; z <= R[3]; z += 2) for (let x = R[0]; x <= R[2]; x += 2) inner.push([x + 0.5, z + 0.5, r() - 0.5, r() - 0.5]);
      }
      cand.push(...inner);
    }
    // (en orden al azar, pero siempre el mismo)
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [cand[i], cand[j]] = [cand[j], cand[i]];
    }

    let n = 0;
    for (const [x, z, ix, iz] of cand) {
      if (n >= want || lamps.length >= LAMP_MAX) break;
      if (out(x, z, 0.8) || !clearOfEdge(w, x, z, 0.8)) continue;
      if (!onFloor(w, x, z, 0.3, [k])) continue;
      // (lo que ya tiene algo encima: utilería, barriles, la baranda)
      const fy = w.floorAt(x, z);
      if (!w.circleFree(x, z, 0.16, fy + 0.05, fy + 2.6)) continue;
      if (used.some(([ux, uz]) => Math.hypot(ux - x, uz - z) < LAMP_CLEAR)) continue;
      if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < LAMP_GAP)) continue;
      const y = w.floorAt(x, z);
      lamps.push({ x, y, z, ix, iz, zone: k, isle: isleOfZone(k) });
      n++;
    }
  }
  // un brasero por isla, en su zona abierta más grande, si no hay un fuego cerca
  for (const id of Object.keys(ISLANDS)) {
    if (id === 'desgarro' || id === 'abismo' || id === 'grietas') continue;
    const ks = ISLANDS[id].zones.filter((k) => keys.includes(k));
    if (!ks.length) continue;
    const k = ks.reduce((a, b) => (zoneArea(b) > zoneArea(a) ? b : a));
    const R = ZONES[k].rects;
    let best = null;
    for (let t = 0; t < 200 && !best; t++) {
      const RR = R[Math.floor(r() * R.length)];
      const x = RR[0] + 0.5 + r() * (RR[2] - RR[0]);
      const z = RR[1] + 0.5 + r() * (RR[3] - RR[1]);
      if (out(x, z, 1.2) || !onFloor(w, x, z, 0.7, [k]) || !clearOfEdge(w, x, z, 1.3)) continue;
      const fy = w.floorAt(x, z);
      if (!w.circleFree(x, z, 0.6, fy + 0.05, fy + 1.2)) continue;
      if (LIGHTS.some((L) => L.kind === 'fire' && Math.hypot(L.pos[0] - x, L.pos[2] - z) < 14)) continue;
      if (lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 4)) continue;
      best = { x, y: w.floorAt(x, z), z, zone: k, isle: id };
    }
    if (best) fires.push(best);
  }
  // los techados sin una luz que ande sin la corriente (la barraca: su
  // bombita va al 35% sin luz y la de la estancia quedaba negra): un farol
  // colgado del techo, en el medio del cuarto
  const hang = [];
  for (const [k, Z] of Object.entries(ZONES)) {
    if (!Z.isla || Z.outdoor || !Z.roof || Z.dim) continue;
    if (zoneArea(k) < 12) continue;
    if (LIGHTS.some((L) => L.zone === k && (L.noPower ?? 0) >= 0.5)) continue;
    const R = Z.rects.reduce((a, b) => ((b[2] - b[0] + 1) * (b[3] - b[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? b : a));
    let x = (R[0] + R[2] + 1) / 2;
    let z = (R[1] + R[3] + 1) / 2;
    // (no arriba de lo reservado: corrido medio metro si hace falta)
    if (out(x, z, 0.3)) x += 0.8;
    if (zoneAtCell(w, x, z) !== k) continue;
    const y = w.floorAt(x, z);
    const top = Math.min(Z.roof, y + 3.4);
    if (top - y < 2.3) continue;
    // (mundo, it. 4: en los salones altos -el gran salón del castillo, 10 m- la
    // cadena arrancaba a 3,4 m del piso y el farol quedaba volando: ahora la
    // cadena sale del techo de verdad y el farol queda a la misma altura)
    if (globalThis.__mduNoEclHangRoof !== true && Z.roof - top > 0.05) {
      const lampTop = top - Math.min(1.1, top - y - 2.1);
      hang.push({ x, y: Z.roof, z, zone: k, isle: isleOfZone(k), drop: Z.roof - lampTop });
      continue;
    }
    hang.push({ x, y: top, z, zone: k, isle: isleOfZone(k), drop: Math.min(1.1, top - y - 2.1) });
  }
  if (!lamps.length && !fires.length && !hang.length) return null;

  const M = w.M;
  const wood = M.woodDark || M.planksDark;
  const iron = M.iron;
  const glass = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: true });
  glass.color.multiplyScalar(2.2);
  const coal = new THREE.MeshBasicMaterial({ color: 0xff6a20 });
  coal.color.multiplyScalar(1.8);
  const parts = [
    { geo: new THREE.BoxGeometry(0.11, POST_H, 0.11).translate(0, POST_H / 2, 0), mat: wood, shadow: true },
    { geo: new THREE.BoxGeometry(0.07, 0.07, 0.62).translate(0, POST_H - 0.12, 0.27), mat: wood, shadow: true },
    { geo: new THREE.BoxGeometry(0.24, 0.05, 0.24).translate(0, POST_H - 0.34, 0.5), mat: iron },
    { geo: new THREE.BoxGeometry(0.24, 0.05, 0.24).translate(0, POST_H - 0.66, 0.5), mat: iron },
    { geo: new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4).translate(0, POST_H - 0.24, 0.5), mat: iron },
    { geo: new THREE.BoxGeometry(0.17, 0.27, 0.17).translate(0, POST_H - 0.5, 0.5), mat: glass },
  ];
  const fparts = [
    { geo: new THREE.CylinderGeometry(0.42, 0.26, 0.28, 10, 1, true).translate(0, 0.86, 0), mat: iron, shadow: true },
    { geo: new THREE.CylinderGeometry(0.26, 0.26, 0.03, 10).translate(0, 0.73, 0), mat: iron },
    { geo: new THREE.CylinderGeometry(0.035, 0.05, 0.86, 5).translate(0.2, 0.43, 0).rotateZ(0.12), mat: iron, three: true },
    { geo: new THREE.CylinderGeometry(0.34, 0.34, 0.06, 10).translate(0, 0.95, 0), mat: coal },
  ];
  const root = new THREE.Group();
  root.name = 'eclipseGfx:faroles';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  // todo lo quieto de los faroles, braseros y colgados en una malla por
  // material (eran 14 InstancedMesh, cada una dibujada en la pasada principal,
  // en el G-buffer y en las sombras: ~26 dibujos desde el claro)
  const buckets = new Map();
  const put = (geo, mat, shadow, matrix) => {
    const key = mat.uuid + (shadow ? 's' : '');
    let B = buckets.get(key);
    if (!B) buckets.set(key, (B = { mat, shadow, list: [] }));
    B.list.push(geo.clone().applyMatrix4(matrix));
  };
  const inst = (list, defs, mats) => {
    for (const P of defs) {
      for (const L of list) {
        for (let k = 0; k < (P.three ? 3 : 1); k++) {
          q.setFromAxisAngle(up, mats(L) + (k * Math.PI * 2) / 3);
          put(P.geo, P.mat, !!P.shadow, m4.compose(new THREE.Vector3(L.x, L.y, L.z), q, one));
        }
      }
    }
  };
  // el brazo mira hacia adentro de la zona
  inst(lamps, parts, (L) => Math.atan2(L.ix, L.iz));
  inst(fires, fparts, () => 0);
  // el farol colgado: cadena, la pantalla de chapa y el vidrio (y al techo)
  const hparts = [
    { geo: new THREE.CylinderGeometry(0.01, 0.01, 1, 4).translate(0, -0.5, 0), mat: iron, chain: true },
    { geo: new THREE.ConeGeometry(0.2, 0.12, 8, 1, true).translate(0, -0.06, 0), mat: iron, hood: true },
    { geo: new THREE.BoxGeometry(0.15, 0.22, 0.15).translate(0, -0.2, 0), mat: glass, hood: true },
    { geo: new THREE.BoxGeometry(0.19, 0.03, 0.19).translate(0, -0.32, 0), mat: iron, hood: true },
  ];
  for (const P of hparts) {
    for (const H of hang) {
      const s3 = P.chain ? new THREE.Vector3(1, H.drop, 1) : one;
      const py = P.chain ? H.y : H.y - H.drop;
      put(P.geo, P.mat, false, m4.compose(new THREE.Vector3(H.x, py, H.z), q.identity(), s3));
    }
  }
  for (const B of buckets.values()) {
    const geo = mergeGeometries(B.list.map((gg) => (gg.index ? gg.toNonIndexed() : gg)), false);
    for (const gg of B.list) gg.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, B.mat);
    mesh.castShadow = B.shadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
  // piso mojado: manchas lisas y oscuras donde pega la luz de cada farol y de
  // cada brasero (el brillo del farol se refleja en el barro y la piedra:
  // lo que hace el estero con sus charcos; __mduNoEclWet: sin ellas)
  if (globalThis.__mduNoEclWet !== true) {
    const wet = [];
    const near = [...lamps.map((L) => [L.x + L.ix * 1.6, L.z + L.iz * 1.6, L.zone]), ...fires.map((F) => [F.x + 1.4, F.z + 0.6, F.zone])];
    for (const [cx, cz, k] of near) {
      for (let t = 0; t < 3; t++) {
        const px = cx + (r() - 0.5) * 2.4;
        const pz = cz + (r() - 0.5) * 2.4;
        if (!onFloor(w, px, pz, 0.5, [k])) continue;
        wet.push([px, w.floorAt(px, pz) + 0.012, pz, 0.9 + r() * 1.6, r() * Math.PI]);
        if (wet.length % 2 === 0) break;
      }
    }
    if (wet.length) {
      const tex = wetTex();
      const mat = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.24, metalness: 0, transparent: true, opacity: 0.55, alphaMap: tex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mat.userData.noRelief = true;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, wet.length);
      wet.forEach(([x, y, z, sz, a], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, a), new THREE.Vector3(sz, 1, sz * (0.55 + r() * 0.4)))));
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      im.receiveShadow = true;
      im.name = 'eclipseGfx:mojado';
      root.add(im);
    }
  }
  w.root.add(root);
  // los choques: el poste y el brasero
  for (const L of lamps) w.addBox([L.x - 0.08, L.y, L.z - 0.08, L.x + 0.08, L.y + POST_H, L.z + 0.08], { kind: 'prop' });
  for (const F of fires) w.addBox([F.x - 0.4, F.y, F.z - 0.4, F.x + 0.4, F.y + 1.0, F.z + 0.4], { kind: 'prop' });

  // las luces: entradas como las del config (World.buildLights las suma a las
  // suyas; el recorte de cercanas, los halos y las sombras de fuegos las tratan igual)
  const s = w.scene || w.g.scene;
  const add = (def) => {
    const light = new THREE.PointLight(def.color, def.intensity, 22, 1.7);
    light.position.set(...def.pos);
    s.add(light);
    w.lights.push({ def, light, base: def.intensity, phase: Math.random() * 100, bulb: null });
  };
  for (const L of lamps) {
    const isl = ISLANDS[L.isle];
    const col = new THREE.Color(0xffb468).lerp(new THREE.Color(isl?.lamp ?? 0xffc27a), 0.35).getHex();
    const c = Math.cos(Math.atan2(L.ix, L.iz));
    const sn = Math.sin(Math.atan2(L.ix, L.iz));
    add({ zone: L.zone, pos: [L.x + sn * 0.5, L.y + POST_H - 0.5, L.z + c * 0.5], color: col, intensity: 16, noPower: 1, kind: 'candle', tag: 'eclFarol' });
  }
  for (const H of hang) {
    const isl = ISLANDS[H.isle];
    const col = new THREE.Color(0xffb062).lerp(new THREE.Color(isl?.lamp ?? 0xffc27a), 0.25).getHex();
    // (sesión 1f: pegado a la luz del cuarto, con la corriente las dos juntas
    // quemaban en blanco las duchas del penal: ahí, la mitad. __mduNoEclColgadoK)
    const near = globalThis.__mduNoEclColgadoK !== true && LIGHTS.some((L) => L.zone === H.zone && Math.hypot(L.pos[0] - H.x, L.pos[2] - H.z) < 3);
    add({ zone: H.zone, pos: [H.x, H.y - H.drop - 0.2, H.z], color: col, intensity: near ? 7 : 14, noPower: 1, kind: 'candle', tag: 'eclColgado' });
  }
  for (const F of fires) add({ zone: F.zone, pos: [F.x, F.y + 1.35, F.z], color: 0xff8a3a, intensity: 20, noPower: 1, kind: 'fire', tag: 'eclBrasero' });
  w.eclGfxLamps = { lamps, fires, hang };
  const fp = new THREE.Vector3();
  return {
    update(dt) {
      const g = w.g;
      if (!g?.fx?.fire || g.ee?.fireOut) return;
      const cam = g.camera?.position;
      for (const F of fires) {
        if (cam && (F.x - cam.x) ** 2 + (F.z - cam.z) ** 2 > 3600) continue;
        if (Math.random() < 0.6) g.fx.fire(fp.set(F.x, F.y + 0.98, F.z), 0.28, 1);
      }
    },
  };
}

// la mancha de mojado: borde irregular y blando (alfa)
let WET = null;
function wetTex() {
  if (WET) return WET;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * S * 0.22;
    const px = S / 2 + Math.cos(a) * d;
    const py = S / 2 + Math.sin(a) * d;
    const rad = S * (0.1 + r() * 0.16);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, rad, 0, Math.PI * 2);
    x.fill();
  }
  WET = new THREE.CanvasTexture(c);
  return WET;
}

// ---------------- 3. la roca de abajo de las islas ----------------
// La forma (main, 2026-10-07: "caras grandes y planas" en el Monumento, el
// castillo y el penal): las caras de los costados de world/eclipseRock.js
// bajan de un tirón 10-20 m. Acá, sobre esa misma malla (sigue siendo UNA):
// los triángulos largos se parten hasta ~1,4 m, cada vértice se corre con un
// ruido de varias octavas que es función del lugar (los triángulos vecinos
// siguen pegados), más fuerte cuanto más abajo del piso (el borde con la isla
// no se mueve), con escalones (bloques salientes) y, abajo, colmillos de roca.
// __mduNoEclRockShape: la forma de antes.
const ROCK_EDGE = 2.0;
const fr = (v) => v - Math.floor(v);
const h3 = (x, y, z, s) => fr(Math.sin(x * 127.1 + y * 269.5 + z * 311.7 + s * 74.7) * 43758.5453);
function vn3(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let acc = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    acc += h3(xi + dx, yi + dy, zi + dz, s) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return acc * 2 - 1;
}
const fbm3 = (x, y, z, s) => vn3(x * 0.18, y * 0.18, z * 0.18, s) * 0.55 + vn3(x * 0.45, y * 0.45, z * 0.45, s + 3) * 0.3 + vn3(x * 1.1, y * 1.1, z * 1.1, s + 7) * 0.15;
export const rockStats = {};
function roughenRock(w, mesh) {
  const g = mesh.geometry;
  const P = g.attributes.position.array;
  const Cc = g.attributes.color?.array;
  rockStats.trisAntes = P.length / 9;
  // el piso de arriba (para no mover el borde con la isla)
  const isl = Object.values(ISLANDS);
  const topAt = (x, z, y) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (w.inside(cx, cz) && w.grid[w.idx(cx, cz)] !== 0 && Number.isFinite(w.fy?.[w.idx(cx, cz)])) return w.fy[w.idx(cx, cz)];
    let best = y, bd = Infinity;
    for (const I of isl) {
      const [x0, z0, x1, z1] = I.box;
      const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      if (d < bd) { bd = d; best = I.y; }
    }
    return best;
  };
  // 1. partir lo largo (el lado más largo por la mitad, hasta ROCK_EDGE)
  const out = [];
  const col = [];
  const L2 = ROCK_EDGE * ROCK_EDGE;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (a[3] + b[3]) / 2, (a[4] + b[4]) / 2, (a[5] + b[5]) / 2];
  const emit = (a, b, c, depth) => {
    const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
    const m = Math.max(ab, bc, ca);
    if (m <= L2 || depth > 7) {
      for (const v of [a, b, c]) {
        out.push(v[0], v[1], v[2]);
        col.push(v[3], v[4], v[5]);
      }
      return;
    }
    if (m === ab) { const mm = mid(a, b); emit(a, mm, c, depth + 1); emit(mm, b, c, depth + 1); }
    else if (m === bc) { const mm = mid(b, c); emit(a, b, mm, depth + 1); emit(a, mm, c, depth + 1); }
    else { const mm = mid(c, a); emit(a, b, mm, depth + 1); emit(mm, b, c, depth + 1); }
  };
  const vtx = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], Cc ? Cc[i * 3] : 0.5, Cc ? Cc[i * 3 + 1] : 0.5, Cc ? Cc[i * 3 + 2] : 0.5];
  const n0 = P.length / 3;
  const spikes = [];
  for (let i = 0; i < n0; i += 3) {
    const a = vtx(i), b = vtx(i + 1), c = vtx(i + 2);
    emit(a, b, c, 0);
    // los colmillos: en la panza (la cara mira abajo), uno cada tanto
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const ny = uz * vx - ux * vz;
    const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    if (ny / len < -0.55 && h3(Math.round(cx), Math.round(cy), Math.round(cz), 9) > 0.93) spikes.push([a, b, c, cx, cy, cz]);
  }
  // los colmillos: tres caras de cada triángulo de la panza a una punta abajo
  for (const [a, b, c, cx, cy, cz] of spikes) {
    const L = 1.8 + h3(cx, cy, cz, 11) * 4.2;
    const tip = [cx + (h3(cx, cy, cz, 12) - 0.5) * 0.8, cy - L, cz + (h3(cx, cy, cz, 13) - 0.5) * 0.8, a[3] * 0.6, a[4] * 0.6, a[5] * 0.6];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) emit(p, tip, q, 6);
  }
  // 2. correr cada vértice: ruido con escalones, más fuerte abajo
  // (la malla no es indexada: el mismo vértice aparece en ~6 triángulos y es
  // función del lugar; se calcula una vez por lugar. 1,75 s → ~0,4 s en cada
  // armado; agente rend. globalThis.__mduNoEclRockCache: como antes)
  const memo = globalThis.__mduNoEclRockCache === true ? null : new Map();
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1], z = out[i + 2];
    const key = memo && `${x},${y},${z}`;
    const got = memo && memo.get(key);
    if (got) {
      out[i] = got[0];
      out[i + 1] = got[1];
      out[i + 2] = got[2];
      continue;
    }
    const top = topAt(x, z, y);
    const depthBelow = top - y;
    // lo que está debajo del piso de una isla se mueve según lo hondo; la
    // repisa de afuera (celda de vacío) se mueve entera, pero nunca sube
    // hasta el piso (el borde con la baranda queda limpio)
    const cx = Math.floor(x), cz = Math.floor(z);
    const outside = !w.inside(cx, cz) || w.grid[w.idx(cx, cz)] === 0;
    const k = outside ? Math.min(1, 0.35 + Math.max(0, depthBelow) / 1.5) : Math.max(0, Math.min(1, (depthBelow - 0.4) / 2.2));
    if (k <= 0) continue;
    const n1 = fbm3(x * 2.2, y * 2.2, z * 2.2, 1), n2 = fbm3(x * 2.2, y * 2.2, z * 2.2, 2), n3 = fbm3(x * 2.2, y * 2.2, z * 2.2, 3);
    // bloques: cada pedazo de ~2 m sale o entra entero (aristas rotas entre
    // bloques vecinos) y estratos cuantizados por altura
    const bx = Math.floor(x / 2.1), by = Math.floor(y / 1.5), bz = Math.floor(z / 2.1);
    const b1 = h3(bx, by, bz, 21) - 0.5, b2 = h3(bx, by, bz, 22) - 0.5, b3 = h3(bx, by, bz, 23) - 0.5;
    const step = Math.round(vn3(x * 0.12, y * 0.35, z * 0.12, 5) * 3) / 3;
    const amp = 1.3 * k;
    out[i] = x + (n1 * 0.7 + b1 * 0.9 + step * 0.35) * amp;
    out[i + 1] = Math.min(y + (n2 * 0.5 + b2 * 0.6) * amp, Math.max(y, top - 0.25));
    out[i + 2] = z + (n3 * 0.7 + b3 * 0.9 + step * 0.35) * amp;
    memo?.set(key, [out[i], out[i + 1], out[i + 2]]);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ng.computeVertexNormals();
  ng.computeBoundingSphere();
  g.dispose();
  mesh.geometry = ng;
  rockStats.trisDespues = out.length / 9;
  rockStats.colmillos = spikes.length;
}

const ROCK_GLSL_PARS = /* glsl */ `
  uniform sampler2D uEclRock;
  uniform float uEclBump;
  uniform float uEclMean;
  uniform float uEclLift;
  varying vec3 vEclW;
  varying vec3 vEclN;
  varying float vEclSeam;
  vec3 eclSafeN(vec3 v) { return v / max(length(v), 1e-6); }
  // (perturbNormalArb de three, sin normalizar vectores nulos)
  vec3 eclPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
    vec3 sx = eclSafeN(dFdx(surf_pos));
    vec3 sy = eclSafeN(dFdy(surf_pos));
    vec3 R1 = cross(sy, surf_norm);
    vec3 R2 = cross(surf_norm, sx);
    float det = dot(sx, R1) * faceDir;
    vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
    return eclSafeN(abs(det) * surf_norm - grad);
  }
  float eclLum(vec2 p) { return dot(texture2D(uEclRock, p).rgb, vec3(0.3, 0.59, 0.11)); }
  float eclTri(vec3 p, vec3 bw) { return eclLum(p.zy) * bw.x + eclLum(p.xz) * bw.y + eclLum(p.xy) * bw.z; }
`;

function rockLook(w, hi) {
  const T = (hi && hiTex(w.T?.rock, 'rock')) || w.T?.rock;
  if (!T) return;
  let mesh = null;
  w.root.traverse((o) => {
    if (o.name === 'eclipseRock' && o.isMesh) mesh = o;
  });
  if (!mesh) return;
  if (on('__mduNoEclRockShape')) roughenRock(w, mesh);
  // la unión con el piso: la altura del piso de arriba de cada triángulo
  const pos = mesh.geometry.attributes.position;
  const seam = new Float32Array(pos.count);
  const boxes = Object.values(ISLANDS);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let best = null;
    let bd = Infinity;
    for (const I of boxes) {
      const [x0, z0, x1, z1] = I.box;
      const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      if (d < bd) {
        bd = d;
        best = I;
      }
    }
    // el piso de la celda de arriba, si hay; si no, el de la isla
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    let fy = best ? best.y : y;
    if (w.inside(cx, cz) && w.grid[w.idx(cx, cz)] !== 0 && Number.isFinite(w.fy?.[w.idx(cx, cz)])) fy = w.fy[w.idx(cx, cz)];
    seam[i] = fy;
  }
  // (el piso de arriba, el mismo para los tres vértices de cada triángulo: las
  // caras de los costados miden diez metros y, con la oclusión por vértice,
  // salían rayas verticales; la distancia al piso va por píxel)
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const top = Math.max(seam[i], seam[i + 1], seam[i + 2]);
    seam[i] = seam[i + 1] = seam[i + 2] = top;
  }
  mesh.geometry.setAttribute('aEclSeam', new THREE.BufferAttribute(seam, 1));
  // el brillo medio de la textura de roca (la variación va alrededor de eso:
  // el color de cada isla sigue siendo el de su vértice; uEclLift compensa la
  // noche más oscura de la luz de arriba)
  let mean = 0.4;
  try {
    const img = T.image;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, 64, 64);
    const d = cx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += ((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255) ** 2.2;
    mean = sum / (d.length / 4);
  } catch {}
  const mat = mesh.material;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uEclRock = { value: T };
    sh.uniforms.uEclBump = { value: 1.6 };
    sh.uniforms.uEclMean = { value: mean };
    sh.uniforms.uEclLift = { value: 1.35 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEclSeam;\nvarying vec3 vEclW;\nvarying vec3 vEclN;\nvarying float vEclSeam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEclW = (modelMatrix * vec4(position, 1.0)).xyz;\nvEclN = normal;\nvEclSeam = aEclSeam;');
    // (vEclSeam llega como la altura del piso; acá, cuánto más abajo está el píxel)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ROCK_GLSL_PARS)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 eclB = abs(eclSafeN(vEclN));
        eclB = eclB * eclB * eclB * eclB;
        eclB /= eclB.x + eclB.y + eclB.z + 1e-4;
        // dos escalas (4 m y 1,3 m) y una mancha grande para que no se lea la repetición
        float eclA = eclTri(vEclW * 0.25, eclB);
        float eclD = eclTri(vEclW * 0.77 + 0.37, eclB);
        float eclBig = eclTri(vEclW * 0.035 + 0.11, eclB);
        float eclH = eclA * 0.6 + eclD * 0.4;
        // vetas de estrato que siguen la altura, torcidas por la textura
        float eclStr = 0.86 + 0.14 * sin(vEclW.y * 2.3 + eclA * 5.0 + eclBig * 3.0);
        // la textura de roca es clara y gris: se usa como cuánto (sobre el color de la isla)
        diffuseColor.rgb *= clamp(1.0 + (eclH - uEclMean) * 2.6, 0.35, 1.9) * eclStr * (0.8 + 0.6 * (eclBig - uEclMean)) * uEclLift;
        // la unión con el piso, más oscura (la sombra de contacto del borde)
        float eclSeam = clamp((vEclSeam - vEclW.y) / 1.6, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.0, 1.0, eclSeam));
        // el resplandor violeta del vacío desde abajo (con la luz baja de la
        // noche del eclipse, la panza de las islas quedaba negra)
        vec3 eclGlow = vec3(0.5, 0.36, 0.85) * (0.3 + 0.6 * max(-eclSafeN(vEclN).y, 0.0)) * smoothstep(0.2, 1.0, eclSeam);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n        totalEmissiveRadiance += diffuseColor.rgb * eclGlow;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = eclPerturb(-vViewPosition, normal, vec2(dFdx(eclH), dFdy(eclH)) * uEclBump, faceDirection);`,
      );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + 'eclRock';
  mat.needsUpdate = true;
}
