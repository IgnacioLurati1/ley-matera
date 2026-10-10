import * as THREE from 'three';
import { ZONES } from '../../config/map';
import { isHost, islaAt, myId } from './common';
import { TrapLook, bakeTrapSounds } from './trampaLook';

// Las trampas del desgarro (layout v5; el usuario: "tienen poco que hacer en
// ellos"): una grieta chica en el piso delante de una puerta de cada isla. Se
// activa por puntos y queda abierta un rato: todo muerto que la pisa se lo
// traga el desgarro; después descansa. Lo decide el anfitrión y viaja por
// 'pee' (k 'trap': { i, a: 'on' }); los invitados piden con el uso de siempre.
// Nada se arma en plena partida: las mallas van desde la carga, apagadas.

// (zona de la v4, que no se mueve; x, z finales; delante de una puerta)
// (arte6: con el círculo nuevo de 3,6 m, las de centro, molino, tapera, penal y
// torre corridas 2,5-10 m a lo más llano y libre de su zona: t_llano.mjs.
// Con __mduOldTrampas, donde estaban)
const OLDT = globalThis.__mduOldTrampas === true;
const SPOTS = [
  { isla: 'centro', zone: 'A', pos: OLDT ? [135.5, 167] : [143.5, 166.5] },
  { isla: 'molino', zone: 'C', pos: OLDT ? [40.5, 94.5] : [35.5, 94.5] },
  { isla: 'tapera', zone: 'G', pos: OLDT ? [43.5, 241] : [46, 231.5] },
  { isla: 'penal', zone: 'pA', pos: OLDT ? [142.5, 305] : [143, 300.5] },
  { isla: 'monumento', zone: 'mA', pos: [299.5, 241] },  // (el descanso al pie de las gradas: a 274 caía en la escalinata)
  { isla: 'torre', zone: 'O', pos: OLDT ? [284, 94.5] : [281.5, 94.5] },
  { isla: 'castillo', zone: 'kA', pos: [152.5, 33] },  // (al costado de la escalera al gran salón, no encima)
];
const COST = 1000;
const ON_T = 25;
const CD_T = 60;
const R = 2.4;
// cuánto aguanta un muerto adentro antes de que se lo trague
const SWALLOW_T = 0.35;
// (arte6, 2026-10-06: "son feas, su activación es fea y son bastante débiles")
// Ahora: la costura del desgarro con su ancla (entities/eclipse/trampaLook.js);
// al abrirse, la onda barre y se traga todo lo que hay a R + 2,5 m; abierta,
// chupa hacia el tajo a los que pasan a R + 3,5 m y se traga al instante a los
// que entran en R. Descansa 45 s (las otras trampas: 22 s prendidas, 35 de
// descanso, un rectángulo de ~30 m²; esta: 41 m² + la onda de 113 m²).
// globalThis.__mduOldTrampas al cargar: como era.
const NEW_R = 3.6;
const NEW_CD = 45;
const NEW_SWALLOW = 0.08;
const PULL = 2.6;

const tmpV = new THREE.Vector3();

export default class Trampas {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    const w = g.world;
    this.root = new THREE.Group();
    this.root.name = 'eclipse:trampas';
    this.time = 0;
    this.neu = globalThis.__mduOldTrampas !== true;
    if (this.neu) bakeTrapSounds(g.audio);
    // materiales compartidos (se compilan en la carga con las mallas visibles)
    this.discMat = new THREE.MeshBasicMaterial({ color: 0x050208, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x9a5cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x6a30ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const disc = new THREE.CircleGeometry(R, 40);
    disc.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(R - 0.22, R + 0.1, 48);
    ring.rotateX(-Math.PI / 2);
    // la columna de luz que sube cuando está abierta (un cono invertido y tenue)
    const col = new THREE.CylinderGeometry(R * 0.55, R * 0.15, 3.2, 20, 1, true);
    col.translate(0, 1.6, 0);
    this.list = SPOTS.map((S, i) => {
      const y = w.floorAt(S.pos[0], S.pos[1], (ZONES[S.zone]?.y ?? 0) + 3);
      const pos = new THREE.Vector3(S.pos[0], y, S.pos[1]);
      const grp = new THREE.Group();
      grp.position.copy(pos);
      const T = { i, isla: S.isla, zone: S.zone, pos, grp, ring: null, col: null, on: 0, cd: 0, inside: new Map(), R: this.neu ? NEW_R : R, blastT: -1, look: null };
      if (this.neu) {
        T.look = new TrapLook(g, T, NEW_R, NEW_CD);
        this.root.add(T.look.root);
      } else {
        const d = new THREE.Mesh(disc, this.discMat);
        d.position.y = 0.025;
        T.ring = new THREE.Mesh(ring, this.ringMat.clone());
        T.ring.position.y = 0.035;
        T.col = new THREE.Mesh(col, this.glowMat.clone());
        grp.add(d, T.ring, T.col);
        this.root.add(grp);
      }
      g.interact.add({
        kind: 'eclipse-trampa',
        pos: pos.clone().setY(y + 0.9),
        radius: 2.3,
        prompt: () => {
          if (T.on > 0) return null;
          if (T.cd > 0) return { text: `Trampa del desgarro: ${Math.ceil(T.cd)} s`, noCost: true, info: true };
          return 'activar la trampa del desgarro';
        },
        cost: () => COST,
        use: () => {
          if (T.on > 0 || T.cd > 0) return false;
          if (isHost(g)) this.send({ i, a: 'on' });
          else g.net?.net?.send({ t: 'pee', k: 'trap', i, a: 'on', from: myId(g) });
          return true;
        },
      });
      return T;
    });
    g.scene.add(this.root);
  }

  get host() {
    return isHost(this.g);
  }

  send(m) {
    if (!this.host) return;
    this.apply(m);
    this.g.net?.event('pee', { k: 'trap', ...m });
  }

  apply(m) {
    const T = this.list[m.i];
    if (!T) return;
    if (m.a === 'on') this.open(T);
    else if (m.a === 'off') this.close(T);
    // (el anfitrión se tragó uno: el rayo y el chupón también en los invitados)
    else if (m.a === 'sw' && !this.host && T.look) T.look.swallow({ pos: tmpV.set(m.px, m.py, m.pz).clone() });
  }

  // (un invitado pidió activar: el anfitrión decide)
  onGuest(m) {
    const T = this.list[m.i];
    if (!T || T.on > 0 || T.cd > 0) return;
    this.send({ i: m.i, a: 'on' });
  }

  open(T) {
    const g = this.g;
    T.on = ON_T;
    T.cd = 0;
    T.inside.clear();
    if (T.look) {
      T.blastT = 0;
      T.look.burst();
      return;
    }
    g.fx.flash?.(tmpV.copy(T.pos).setY(T.pos.y + 1.2), 0xc090ff, 6, 0.4, 10);
    g.fx.sparkle?.(tmpV.copy(T.pos).setY(T.pos.y + 0.6), [0.7, 0.35, 1], 30, 1.6);
    g.fx.addShake?.(0.1);
    this.ee.portals?.play?.('ptl-abre', T.pos, 0.9);
    g.hud?.subtitle?.('La trampa del desgarro se abrió.', 2.2);
  }

  close(T) {
    T.on = 0;
    T.cd = T.look ? NEW_CD : CD_T;
    T.inside.clear();
    if (T.look) {
      T.blastT = -1;
      T.look.shut();
      return;
    }
    this.g.fx.sparkle?.(tmpV.copy(T.pos).setY(T.pos.y + 0.4), [0.5, 0.25, 0.9], 12, 1);
  }

  // Alt+I: la trampa de la isla donde está el jugador, abierta ya
  debugOn() {
    const g = this.g;
    const isla = islaAt(g, g.player.pos);
    const T = this.list.find((x) => x.isla === isla) || this.list[0];
    T.cd = 0;
    if (this.host) this.send({ i: T.i, a: 'on' });
    return T.i;
  }

  update(dt) {
    const g = this.g;
    this.time += dt;
    const t = this.time;
    for (const T of this.list) {
      if (T.cd > 0) T.cd = Math.max(0, T.cd - dt);
      if (T.on > 0) {
        T.on -= dt;
        if (T.on <= 0 && this.host) this.send({ i: T.i, a: 'off' });
      }
      if (T.look) {
        this.updateNew(T, dt);
        continue;
      }
      // el aspecto: el anillo late cuando está lista, arde cuando está abierta, dormido en el descanso
      const active = T.on > 0;
      const ready = !active && T.cd <= 0;
      const beat = 0.5 + 0.5 * Math.sin(t * (active ? 9 : 2.2) + T.i);
      T.ring.material.opacity = active ? 0.75 + 0.25 * beat : ready ? 0.28 + 0.2 * beat : 0.08;
      T.ring.scale.setScalar(active ? 1 + 0.08 * beat : 1);
      T.col.material.opacity = active ? 0.12 + 0.08 * beat : 0;
      T.col.visible = active;
      if (!active) continue;
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * R * 0.8;
        g.fx.sparkle?.(tmpV.set(T.pos.x + Math.cos(a) * rr, T.pos.y + 0.2, T.pos.z + Math.sin(a) * rr), [0.75, 0.4, 1], 5, 0.9);
      }
      if (!this.host) continue;
      // los muertos que la pisan: un instante y se los traga
      for (const z of g.zombies.pool) {
        if (!z.active || z.dead || z.boss || z.jinete) continue;
        const d = Math.hypot(z.pos.x - T.pos.x, z.pos.z - T.pos.z);
        if (d > R || Math.abs(z.pos.y - T.pos.y) > 1.6) {
          T.inside.delete(z.id);
          continue;
        }
        const s = (T.inside.get(z.id) || 0) + dt;
        T.inside.set(z.id, s);
        if (s < SWALLOW_T) continue;
        T.inside.delete(z.id);
        g.fx.flash?.(tmpV.copy(z.pos).setY(z.pos.y + 1), 0xd0a0ff, 4, 0.25, 8);
        g.fx.sparkle?.(tmpV.copy(z.pos).setY(z.pos.y + 1), [0.7, 0.35, 1], 16, 1.4);
        this.ee.portals?.play?.('ptl-pasa', z.pos, 0.8);
        g.zombies.kill?.(z, { type: 'blast', point: z.pos.clone() });
      }
    }
  }

  // la nueva: el aspecto (trampaLook) y, en el anfitrión, la onda, el chupón y el trago
  updateNew(T, dt) {
    const g = this.g;
    const active = T.on > 0;
    T.look.update(dt, active, T.cd);
    if (!active) return;
    const host = this.host;
    const L = T.look;
    const blastR = L.blastR();
    let wave = -1;
    if (T.blastT >= 0) {
      T.blastT += dt;
      // (la onda llega a cada uno cuando pasa el anillo: 0,7 s hasta el borde)
      wave = T.blastT < 0.7 ? 0.5 + (T.blastT / 0.7) * (blastR - 0.5) : -1;
      if (T.blastT >= 0.7) T.blastT = -1;
    }
    const w = g.world;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.boss || z.jinete) {
        T.inside.delete(z.id);
        continue;
      }
      const dx = z.pos.x - T.pos.x;
      const dz = z.pos.z - T.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > T.R + PULL + 1 || Math.abs(z.pos.y - T.pos.y) > 1.8) {
        T.inside.delete(z.id);
        continue;
      }
      // (el invitado: el efecto de cada trago le llega del anfitrión, 'sw')
      if (!host) continue;
      // la onda del arranque: todo lo que alcanza el anillo
      if (wave >= 0 && d <= wave && d <= blastR) {
        this.swallow(T, z);
        continue;
      }
      if (d <= T.R) {
        const s = (T.inside.get(z.id) || 0) + dt;
        T.inside.set(z.id, s);
        if (s >= NEW_SWALLOW) this.swallow(T, z);
        continue;
      }
      T.inside.delete(z.id);
      // el chupón: los de alrededor se arrastran hacia el tajo (si no hay pared en el medio)
      if (d < T.R + PULL && d > 0.01) {
        const k = (1.4 + 2.2 * (1 - (d - T.R) / PULL)) * dt;
        const nx = z.pos.x - (dx / d) * k;
        const nz = z.pos.z - (dz / d) * k;
        if (w.sweepFree(z.pos.x, z.pos.z, nx, nz, 0.3, z.pos.y + 0.4, z.pos.y + 1.6)) {
          z.pos.x = nx;
          z.pos.z = nz;
        }
      }
    }
  }

  swallow(T, z) {
    T.inside.delete(z.id);
    T.look.swallow(z);
    this.g.net?.event('pee', { k: 'trap', i: T.i, a: 'sw', px: +z.pos.x.toFixed(2), py: +z.pos.y.toFixed(2), pz: +z.pos.z.toFixed(2) });
    this.g.zombies.kill?.(z, { type: 'blast', point: z.pos.clone() });
  }

  state() {
    return { tr: this.list.map((T) => [+T.on.toFixed(1), +T.cd.toFixed(1)]) };
  }

  applyFull(tr) {
    if (!Array.isArray(tr)) return;
    tr.forEach(([on, cd], i) => {
      const T = this.list[i];
      if (!T) return;
      T.on = on;
      T.cd = cd;
    });
  }

  dispose() {
    for (const T of this.list) T.look?.loop?.stop?.();
    this.g.scene.remove(this.root);
  }
}
