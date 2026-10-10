import * as THREE from 'three';
import { ACT } from '../config/map';
import { mesh, boxGeo, cylGeo } from './props';
import { ECL_ORDER, ECL_COLOR } from './eclipseShield';
import { sfxClang } from './shieldSfx';

// La mejora del escudo de Eclipse Matero (ACT.shield.up.kind 'nudo', 2026-10-10):
// el Escudo de la Cúpula, en El Nudo (la isla del medio). El Nudo es la isla
// más grande y la que menos tiene para hacer: se pasa por ahí y se clava la
// guadaña una vez. Ahora: un altar de piedra negra con el nudo tallado, y
// alrededor los cuatro mates de piedra de los caballeros de la luz (los de la
// cúpula del Desgarro Cósmico: el fuego, el viento, el rayo y el hielo).
// Se apoya el escudo en el altar (el que lo apoya se queda sin él) y se prende
// el mate del fuego: una columna de su color. Cada muerto cerca del mate
// encendido le manda el alma; con cinco (dos más por cada jugador de más)
// el mate le tira su rayo al escudo, le aparece la piedra de ese caballero en
// el aro y se prende el siguiente. Con los cuatro, el escudo queda en el altar
// con el anillo de luz: se agarra y ya está (después el banco del Claro da
// los mejorados). El mejorado aguanta mejor las embestidas de los jinetes del
// caos: pegan JINETE_K (Player.damage, con cupulaDmg). Lo maneja
// world/ShieldUpgrade (pedidos y avisos 'sup', decide el anfitrión); este
// archivo arma la estación y la anima.
// globalThis.__mduNoEclCupula: el mejorado no frena a los jinetes.

export const JINETE_K = 0.6;
const D = 4.5; // del altar a cada mate
const TOP = 1.02; // la tapa del altar
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const NOTE = { fuego: 64, viento: 67, rayo: 71, hielo: 76 };

// Lo que pega una embestida de jinete a este jugador (con el Escudo de la Cúpula, menos).
export function cupulaDmg(g, amount, src) {
  if (globalThis.__mduNoEclCupula === true || !src?.jinete) return amount;
  const s = g.player.shield;
  return s?.up && ACT.shield?.up?.prop === 'cupula' ? amount * JINETE_K : amount;
}

// cuántas almas pide cada mate (dos más por cada jugador de más)
export function nudoNeed(su) {
  const n = su.g.net ? su.g.net.net.count : 1;
  return (su.U.need || 5) + 2 * (n - 1);
}

const MAT = new Map();
const mat = (k, make) => {
  if (!MAT.has(k)) MAT.set(k, make());
  return MAT.get(k);
};

// la columna de luz del mate encendido (aditiva, se apaga hacia arriba)
function columnTex() {
  return mat('colTex', () => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.55, 'rgba(90,90,90,1)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// el mate de piedra (calabaza con su boca y la bombilla de hierro)
function mateGeo() {
  return mat('mateGeo', () => {
    const pts = [[0, 0], [0.05, 0.004], [0.09, 0.03], [0.108, 0.075], [0.1, 0.12], [0.078, 0.152], [0.066, 0.17], [0.07, 0.182], [0.064, 0.186], [0.055, 0.17], [0, 0.16]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 18);
  });
}

export function buildNudo(su) {
  const g = su.g;
  const M = su.M;
  const U = su.U;
  const [x, z] = U.pos;
  const y = su.floorY(x, z, U.y);
  const ry = U.rot || 0;
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  su.root.add(grp);
  const stone = mat('stone', () => new THREE.MeshStandardMaterial({ map: M.stone?.map || null, color: 0x8a8498, roughness: 0.88 }));
  const stoneDark = mat('stoneDark', () => new THREE.MeshStandardMaterial({ map: M.stone?.map || null, color: 0x57525f, roughness: 0.92 }));
  // el altar: zócalo, cuerpo y tapa, con el nudo tallado adelante
  grp.add(mesh(boxGeo(1.5, 0.14, 1.06), stoneDark, 0, 0.07, 0));
  grp.add(mesh(boxGeo(1.12, 0.78, 0.72), stone, 0, 0.53, 0));
  grp.add(mesh(boxGeo(1.32, 0.1, 0.9), stoneDark, 0, TOP - 0.05, 0));
  const knotMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.4, emissive: 0xb070ff, emissiveIntensity: 0.25 });
  const knot = mesh(new THREE.TorusKnotGeometry(0.15, 0.03, 80, 8, 2, 3), knotMat, 0, 0.55, 0.37);
  knot.scale.z = 0.35;
  knot.castShadow = false;
  grp.add(knot);
  // el escudo acostado en la tapa, la cara para arriba
  const holder = new THREE.Group();
  holder.position.set(0, TOP, 0.02);
  holder.rotation.x = -Math.PI / 2;
  grp.add(holder);
  su.station = su.stationShield(holder);
  su.station.obj.visible = false;
  // (que la espalda del escudo, con las correas, apoye en la tapa)
  su.station.obj.position.z = su.station.obj.userData.back + 0.004;
  grp.updateMatrixWorld(true);
  su.stationPos = su.station.obj.getWorldPosition(new THREE.Vector3());
  g.world.addBox([x - 0.78, y, z - 0.56, x + 0.78, y + TOP + 0.2, z + 0.56], { kind: 'prop' });
  // los cuatro mates, en diagonal alrededor del altar
  const mates = ECL_ORDER.map((el, i) => {
    const a = ry + Math.PI / 4 + (i * Math.PI) / 2;
    const mx = x + Math.sin(a) * D;
    const mz = z + Math.cos(a) * D;
    const my = su.floorY(mx, mz, U.y);
    const m = new THREE.Group();
    m.position.set(mx, my, mz);
    m.rotation.y = a + Math.PI;
    m.add(mesh(cylGeo(0.36, 0.42, 0.12, 8), stoneDark, 0, 0.06, 0));
    m.add(mesh(cylGeo(0.24, 0.31, 0.84, 8), stone, 0, 0.54, 0));
    m.add(mesh(cylGeo(0.33, 0.3, 0.1, 8), stoneDark, 0, 1.01, 0));
    // la franja de su color (se prende con su turno)
    const color = new THREE.Color(ECL_COLOR[el]);
    const band = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.4, emissive: color, emissiveIntensity: 0.12 });
    const ring = mesh(cylGeo(0.262, 0.27, 0.07, 8), band, 0, 0.86, 0);
    ring.castShadow = false;
    m.add(ring);
    const mm = new THREE.MeshStandardMaterial({ map: M.stone?.map || null, color: 0xc4bccc, roughness: 0.6, emissive: color, emissiveIntensity: 0.08 });
    const mate = mesh(mateGeo(), mm, 0, 1.06, 0);
    m.add(mate);
    m.add(mesh(cylGeo(0.007, 0.007, 0.2, 6), M.iron, 0.025, 1.27, 0, 0, 0, -0.32));
    // la columna de luz, prendida solo en su turno
    // (dos caños, uno adentro del otro: el de afuera más tenue, así no tiene el borde duro)
    const colMat = new THREE.MeshBasicMaterial({ color, map: columnTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 7, 20, 1, true).translate(0, 3.5 + 1.2, 0), colMat);
    col.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 7, 20, 1, true).translate(0, 3.5 + 1.2, 0), colMat));
    col.castShadow = false;
    col.visible = false;
    m.add(col);
    grp.parent.add(m);
    g.world.addBox([mx - 0.42, my, mz - 0.42, mx + 0.42, my + 1.3, mz + 0.42], { kind: 'prop' });
    return { el, grp: m, band, mm, col, colMat, top: new THREE.Vector3(mx, my + 1.15, mz), glow: 0 };
  });
  su.nudo = { grp, knot, knotMat, mates, stage: 'idle', c: 0, done: false, lureOn: false, t: 0 };
  // se usa desde adelante del altar
  const ix = x + Math.sin(ry) * 1.15;
  const iz = z + Math.cos(ry) * 1.15;
  su.stationItem(
    new THREE.Vector3(ix, su.floorY(ix, iz, U.y) + 1.2, iz),
    2.3,
    () => {
      const st = su.st;
      if (st.stage === 'hunt') return { text: `${ELNAME[ECL_ORDER[Math.min(3, st.c)]]}: ${st.n}/${nudoNeed(su)}`, noCost: true, info: true };
      if (st.stage === 'ready') return { text: 'agarrar el escudo', noCost: true };
      return su.idlePrompt('apoyar el escudo en el altar');
    },
    () => su.useStation(),
  );
}

const ELNAME = { fuego: 'Mate del fuego', viento: 'Mate del viento', rayo: 'Mate del rayo', hielo: 'Mate del hielo' };

// El anfitrión: un muerto cerca del mate encendido.
export function nudoKill(su, z) {
  const st = su.st;
  if (st.stage !== 'hunt' || su.done) return;
  const m = su.nudo.mates[Math.min(3, st.c)];
  if (Math.hypot(z.pos.x - m.top.x, z.pos.z - m.top.z) > (su.U.r || 6) || Math.abs((z.pos.y || 0) - m.grp.position.y) > 4) return;
  const n = st.n + 1;
  su.tell({ k: 'kill', n, x: +z.pos.x.toFixed(2), y: +((z.pos.y || 0) + 1).toFixed(2), z: +z.pos.z.toFixed(2) });
  if (n < nudoNeed(su)) {
    su.tell({ k: 'st', n });
    return;
  }
  const c = st.c + 1;
  if (c < 4) su.tell({ k: 'st', n: 0, c });
  else {
    su.tell({ k: 'st', stage: 'ready', n: 0, c });
    su.tell({ k: 'done', by: st.by, give: 0 });
  }
}

// Un muerto cerca del mate (en todas las compus): el alma vuela al mate.
export function nudoKillFx(su, from) {
  const g = su.g;
  const N = su.nudo;
  if (!N) return;
  const m = N.mates[Math.min(3, su.st.c)];
  const rgb = new THREE.Color(ECL_COLOR[m.el]);
  g.fx.soul(from, m.top, [rgb.r, rgb.g, rgb.b]);
  g.fx.sparkle(tmp.copy(from).setY(from.y + 0.3), [rgb.r, rgb.g, rgb.b], 5, 0.4);
  m.glow = 1;
  const A = g.audio;
  if (A?.ctx && A.bell) A.bell(A.out({ pos: m.top, gain: 0.5, reverb: 0.5, ref: 5 }), A.now + 0.35, NOTE[m.el] + (su.st.n % 3) * 2, { gain: 0.16, dur: 1.6 });
}

export function updateNudo(su, dt) {
  const g = su.g;
  const N = su.nudo;
  const st = su.st;
  if (!N) return;
  const hunt = st.stage === 'hunt' && !su.done;
  const c = Math.min(4, st.c || 0);
  // lo que cambió (en todas las compus): se prendió, un mate terminó, quedó listo
  if (st.stage !== N.stage) {
    if (hunt && N.stage === 'idle') {
      N.c = 0;
      const m = N.mates[0];
      g.fx.flash(m.top, ECL_COLOR[m.el], 18, 0.4, 10);
      if (Math.hypot(g.player.pos.x - m.top.x, g.player.pos.z - m.top.z) < 25) g.hud.subtitle('Matá cerca del mate encendido.', 3);
    }
    N.stage = st.stage;
  }
  if (c > N.c) {
    // el mate que terminó le tira su rayo al escudo y aparece su piedra
    const m = N.mates[c - 1];
    g.fx.lightning(m.top.clone(), su.stationPos.clone(), ECL_COLOR[m.el], 0.6);
    g.fx.lightning(m.top.clone().setY(m.top.y + 0.3), su.stationPos.clone(), ECL_COLOR[m.el], 0.45);
    g.fx.flash(su.stationPos, ECL_COLOR[m.el], 26, 0.5, 10);
    g.fx.sparkle(su.stationPos, [1, 1, 1], 12, 0.5);
    sfxClang(g.audio, su.stationPos, 0.9);
    if (c < 4) {
      const nx = N.mates[c];
      g.fx.flash(nx.top, ECL_COLOR[nx.el], 18, 0.4, 10);
    }
    N.c = c;
  } else if (c < N.c) N.c = c;
  // el escudo en el altar: aparece y se van viendo las piedras
  if (hunt || st.stage === 'ready') {
    su.station.obj.visible = true;
    su.station.show(st.stage === 'ready' ? 1 : c / 4);
  }
  // (anfitrión) mientras se prende un mate, los muertos van para ahí si hay alguien cerca
  const lures = g.lures;
  if (lures && su.isHost()) {
    const m = hunt ? N.mates[Math.min(3, c)] : null;
    const near = m && su.players().some((p) => Math.hypot(p.pos.x - m.top.x, p.pos.z - m.top.z) < 30);
    const i = lures.findIndex((l) => l.src === su);
    if (near) {
      if (i < 0) lures.push({ src: su, pos: m.grp.position.clone() });
      else lures[i].pos.copy(m.grp.position);
    } else if (i >= 0) lures.splice(i, 1);
  }
  // los mates: el encendido late y tiene su columna; los terminados quedan prendidos bajito
  const pulse = 0.5 + Math.sin(g.time * 3.2) * 0.5;
  N.mates.forEach((m, i) => {
    m.glow = Math.max(0, m.glow - dt * 1.6);
    const lit = hunt && i === c;
    const done = su.done || i < c;
    m.mm.emissiveIntensity = lit ? 0.5 + pulse * 0.5 + m.glow * 1.5 : done ? 0.45 : 0.08;
    m.band.emissiveIntensity = lit ? 1.2 + pulse * 0.6 : done ? 0.8 : 0.12;
    const want = lit ? 0.13 + pulse * 0.04 + m.glow * 0.12 : 0;
    m.colMat.opacity += (want - m.colMat.opacity) * Math.min(1, dt * 3);
    m.col.visible = m.colMat.opacity > 0.01;
    if (lit && Math.random() < dt * 6) g.fx.sparkle(tmp2.copy(m.top).setY(m.top.y + 0.2), new THREE.Color(ECL_COLOR[m.el]).toArray(), 1, 0.3);
  });
  N.knotMat.emissiveIntensity = su.done ? 1.1 : hunt ? 0.35 + (c / 4) * 0.8 + pulse * 0.15 : 0.25;
  if (st.stage === 'ready' && su.station.obj.visible && Math.random() < dt * 5) g.fx.sparkle(su.stationPos, [0.9, 0.85, 1], 2, 0.4);
}
