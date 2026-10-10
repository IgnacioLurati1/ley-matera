import * as THREE from 'three';
import GeoBuilder from './GeoBuilder';
import { bbox, place } from './monumentoKit';
import { statue } from './monumentoStatues';
import { carvedText } from './monumentoTextures';
import { toTexture } from '../core/textures';

// La mejora del escudo del Monumento (ACT.shield.up.kind 'gorriti'): la
// estatua del canónigo Gorriti, que bendijo la bandera en Jujuy, de pie en el
// espejo del sur del Pasaje Juramento con las manos adelante. Se apoya el
// escudo en sus manos (el que lo apoya se lo queda) y la campana de la
// Catedral empieza a dar las tres campanadas: antes de la tercera tienen que
// caer 8 muertos a escudazos cerca de la estatua. Cada uno le manda un alma
// celeste al escudo de bronce que va tomando forma en sus manos; si suena la
// tercera antes, se apaga todo y hay que volver a empezar. Lo maneja
// world/ShieldUpgrade (este archivo arma la estación y la anima).

const BELL2 = 24; // la segunda campanada (s desde que se apoyó el escudo)
const BELL3 = 48; // la tercera: si no llegaron, se pierde
const CELESTE = new THREE.Color(0x74acdf);
const tmp = new THREE.Vector3();
const S = 1.1; // la escala de la estatua
const HOLD_Y = 1.1 + 1.02 * S; // el centro del escudo en sus manos

function plaque(lines, width) {
  const H = 160;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = H * lines.length;
  const ctx = c.getContext('2d');
  lines.forEach((t, i) => ctx.drawImage(carvedText(t, { w: 2048, h: H, size: 96, spacing: 0.22 }), 0, i * H));
  const mat = new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.9 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, (width * c.height) / c.width), mat);
}

// Una campanada de la Catedral (desde el campanario, se oye en todo el Pasaje).
function campanada(g, k = 1) {
  const A = g.audio;
  if (!A?.ctx || !A.bell) return;
  const C = g.world.mon?.catedral;
  const pos = new THREE.Vector3(C ? C.x - 17 : -5, 25, C ? C.z + 5.4 : 46);
  const o = A.out({ pos, gain: 1, reverb: 1, ref: 30 });
  A.bell(o, A.now + 0.01, 38, { gain: 0.5 * k, dur: 7 });
  A.bell(o, A.now + 0.01, 50, { gain: 0.12 * k, dur: 4 });
}

export function buildGorriti(su) {
  const g = su.g;
  const M = su.M;
  const U = su.U;
  const [x, z] = U.pos;
  const y = su.floorY(x, z, U.y);
  const ry = U.rot ?? Math.PI;
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  su.root.add(grp);
  // el pedestal de travertino (zócalo, dado y cornisa) con la placa al frente
  const gb = new GeoBuilder();
  bbox(gb, 'travertino', -0.72, -0.05, -0.62, 0.72, 0.2, 0.62, { b: 0.05, top: 'travStep' });
  bbox(gb, 'travertino', -0.56, 0.2, -0.46, 0.56, 0.96, 0.46, { b: 0.035 });
  bbox(gb, 'travertino', -0.66, 0.96, -0.56, 0.66, 1.1, 0.56, { b: 0.04, top: 'travStep' });
  grp.add(gb.build(M));
  const pl = plaque(['CANÓNIGO GORRITI', 'JUJUY · 25 DE MAYO DE 1812'], 0.9);
  pl.position.set(0, 0.6, 0.465);
  grp.add(pl);
  // la estatua de bronce
  const fig = statue('gorriti', M.bronze, 0, 1.1, 0, 0, S)[0];
  fig.castShadow = true;
  fig.receiveShadow = true;
  grp.add(fig);
  // la aureola celeste detrás de la cabeza (se prende con el avance)
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x9cd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 40), haloMat);
  halo.position.set(0, 1.1 + 1.7 * S, -0.14);
  grp.add(halo);
  // el escudo que va tomando forma en sus manos
  const holder = new THREE.Group();
  holder.position.set(0, HOLD_Y, 0.6);
  holder.rotation.x = -0.12;
  grp.add(holder);
  su.station = su.stationShield(holder);
  su.station.obj.visible = false;
  const glowMats = su.station.hot.filter((m) => m.emissive);
  grp.updateMatrixWorld(true);
  su.stationPos = holder.getWorldPosition(new THREE.Vector3());
  su.huntPos = new THREE.Vector3(x, y, z);
  su.gorriti = { grp, halo, holder, glowMats, stage: 'idle', c: 0, done: false, t: 0, glow: 0, rise: 0 };
  g.world.addBox([x - 0.72, y - 0.05, z - 0.62, x + 0.72, y + 3.2, z + 0.62], { kind: 'prop' });
  // se usa desde adelante (la vereda del Pasaje)
  const ix = x + Math.sin(ry) * 1.1;
  const iz = z + Math.cos(ry) * 1.1;
  const need = U.need || 8;
  su.stationItem(
    new THREE.Vector3(ix, su.floorY(ix, iz) + 1.3, iz),
    2.4,
    () => {
      const st = su.st;
      if (su.done) return null;
      if (st.stage === 'hunt') return { text: `${st.n}/${need}`, noCost: true, info: true };
      return su.idlePrompt('apoyar el escudo');
    },
    () => {
      if (su.st.stage !== 'idle' || su.done || !g.player.shield) return false;
      su.ask({ k: 'place' });
      return true;
    },
  );
}

// Un muerto a escudazos: el alma celeste vuela del muerto al escudo.
export function gorritiKillFx(su, from) {
  const g = su.g;
  g.fx.soul(from, su.stationPos, [0.55, 0.8, 1]);
  g.fx.sparkle(tmp.copy(from).setY(from.y + 0.4), [0.6, 0.85, 1], 6, 0.5);
  const G = su.gorriti;
  if (G) G.glow = 1;
  g.fx.flash(su.stationPos, 0x9cd0ff, 10, 0.25, 7);
}

export function updateGorriti(su, dt) {
  const g = su.g;
  const G = su.gorriti;
  const st = su.st;
  const need = su.U.need || 8;
  const hunt = st.stage === 'hunt' && !su.done;
  // lo que cambió (en todas las compus): campanadas, se perdió, quedó bendecido
  if (st.stage !== G.stage) {
    if (st.stage === 'hunt' && !su.done) {
      G.t = 0;
      campanada(g, 1);
    } else if (G.stage === 'hunt' && st.stage === 'idle' && !su.done) {
      campanada(g, 1.2);
      su.station.obj.visible = false;
      g.fx.steam(su.stationPos, 10, 0.6);
      if (Math.hypot(g.player.pos.x - su.huntPos.x, g.player.pos.z - su.huntPos.z) < 20) g.hud.subtitle('La tercera campanada. Otra vez.', 3);
    }
    G.stage = st.stage;
  }
  if (hunt && st.c !== G.c && st.c > 0) campanada(g, 1);
  G.c = st.c;
  if (su.done && !G.done) {
    G.done = true;
    G.rise = 0.001;
    su.station.obj.visible = true;
    su.station.show(1);
    g.fx.flash(su.stationPos, 0x9cd0ff, 40, 0.6, 14);
    g.fx.beam(tmp.copy(su.stationPos).setY(su.stationPos.y + 30), su.stationPos, { color: 0xbfe4ff, width: 0.5, life: 1.4 });
    g.fx.sparkle(su.stationPos, [0.7, 0.9, 1], 30, 1.2);
    campanada(g, 0.8);
  }
  // el reloj de las campanadas (lo lleva el anfitrión)
  if (hunt && su.isHost()) {
    G.t += dt;
    if (G.t >= BELL2 && st.c < 1) su.tell({ k: 'st', c: 1 });
    if (G.t >= BELL3) su.tell({ k: 'st', stage: 'idle', n: 0, c: 0 });
  }
  // el escudo en las manos: aparece, se va completando y brilla de celeste
  const k = su.done ? 1 : hunt ? st.n / need : 0;
  if (hunt) {
    su.station.obj.visible = true;
    su.station.show(k);
  }
  G.glow = Math.max(0, G.glow - dt * 1.5);
  const pulse = 0.5 + Math.sin(g.time * 3) * 0.5;
  const e = (hunt ? 0.25 + k * 0.9 + G.glow * 1.5 : 0) + (G.rise ? 1.2 : 0);
  for (const m of G.glowMats) {
    m.emissive.copy(CELESTE);
    m.emissiveIntensity = e * (0.85 + pulse * 0.15);
  }
  G.holder.position.y = HOLD_Y + (hunt ? Math.sin(g.time * 1.6) * 0.03 : 0);
  G.holder.rotation.y = hunt ? Math.sin(g.time * 0.7) * 0.12 : 0;
  // al final sube despacio y se desvanece (el escudo ya lo tiene el que lo ganó)
  if (G.rise) {
    G.rise += dt;
    G.holder.position.y += G.rise * G.rise * 0.6;
    G.holder.rotation.y += G.rise * 2;
    if (Math.random() < dt * 30) g.fx.sparkle(G.holder.getWorldPosition(tmp), [0.7, 0.9, 1], 2, 0.6);
    if (G.rise > 2.2) {
      su.station.obj.visible = false;
      G.rise = 0;
    }
  }
  const haloK = su.done ? 0.55 : hunt ? 0.2 + k * 0.6 + G.glow * 0.3 : 0;
  G.halo.material.opacity += (haloK - G.halo.material.opacity) * Math.min(1, dt * 4);
  G.halo.rotation.z += dt * 0.3;
}
