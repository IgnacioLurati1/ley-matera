import * as THREE from 'three';
import { players } from '../castle/common';

// El ascensor de la Torre: de la nave de la Cripta (-2,6) al Mirador (44),
// setenta metros adentro del fuste. Las puertas de bronce las arma
// world/monumentoTorre.js (w.mon.elevDoors); acá va la cabina de atrás de
// cada puerta (madera, pasamanos de bronce, la luz del techo y el indicador),
// los botones y el viaje.
// - Con la luz prendida, cada viaje cuesta COST. Si la cabina está en la
//   otra punta, el botón la llama (gratis).
// - Al salir se cierran las puertas: el que quedó parado adelante viaja (cada
//   compu se lleva a su jugador). El viaje es a oscuras, con el motor, el
//   traqueteo del cable y la campanita al llegar.
// - La primera vez que llega arriba se abre la zona del Mirador (I).
// En línea lo decide el anfitrión y viaja por 'pee' (k: 'asc'), como el resto
// del easter egg (entities/MonumentoEgg.js).

const COST = 250;
const CLOSE_T = 0.9;
const RIDE_T = 3.4;
const OPEN_T = 0.9;
const COOL = 3;
const RIDE_R = 1.9;
const DEPTH = { low: 1.4, high: 0.92 };
const tmpV = new THREE.Vector3();

const isHost = (g) => !g.net || g.net.host;

export default class Ascensor {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    this.root = new THREE.Group();
    this.root.name = 'ascensor';
    g.scene.add(this.root);
    // at: dónde está la cabina; ride: el viaje en curso (todas las compus)
    this.st = { at: 'low', up: 0 };
    this.ride = null;
    this.cool = 0;
    this.stops = {};
    for (const D of g.world.mon?.elevDoors || []) {
      const k = D.y < 10 ? 'low' : 'high';
      // la cara de la puerta: abajo mira a -x (la nave), arriba a +x (el Mirador)
      const face = k === 'low' ? -1 : 1;
      this.stops[k] = { k, D, y: D.y, face, open: k === 'low' ? 1 : 0, front: new THREE.Vector3(D.x + face * 0.85, D.y, D.z) };
      this.buildCab(this.stops[k]);
    }
    for (const k of ['low', 'high']) if (this.stops[k]) this.buildButton(this.stops[k]);
    this.overlay = null;
    // las ventanas del Mirador: el trepador aparece colgado afuera, a la
    // altura del antepecho (el piso de afuera de la grilla es el de la calle)
    for (const W of g.barriers?.windows || []) if (W.zone === 'I') W.ext.y = W.fy;
    this.mirT = new Map();
  }

  get M() {
    return this.g.world.M;
  }

  // ---------------- la cabina ----------------
  buildCab(S) {
    const M = this.M;
    const { D } = S;
    const into = -S.face;
    const dep = DEPTH[S.k];
    const grp = new THREE.Group();
    grp.position.set(D.x, D.y, D.z);
    const wood = M.woodDark || M.wood;
    const panel = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      grp.add(m);
      return m;
    };
    const hw = D.hw + 0.02;
    const mid = (into * dep) / 2;
    // piso de goma, techo, fondo y costados de madera con zócalo y friso de bronce
    panel(dep, 0.04, hw * 2, M.iron, mid, 0.0, 0);
    panel(dep, 0.05, hw * 2, wood, mid, 2.42, 0);
    panel(0.05, 2.42, hw * 2, wood, into * dep, 1.21, 0);
    for (const s of [-1, 1]) {
      panel(dep, 2.42, 0.05, wood, mid, 1.21, s * hw);
      panel(dep - 0.04, 0.03, 0.02, M.bronze, mid, 0.95, s * (hw - 0.04));
      panel(dep - 0.04, 0.12, 0.02, M.bronze, mid, 0.08, s * (hw - 0.04));
    }
    // el pasamanos del fondo y el espejo
    panel(0.03, 0.03, hw * 1.6, M.bronze, into * (dep - 0.07), 0.95, 0);
    const mirror = new THREE.MeshStandardMaterial({ color: 0x9fb2c0, metalness: 1, roughness: 0.08 });
    panel(0.01, 1.0, hw * 1.2, mirror, into * (dep - 0.03), 1.65, 0);
    // la luz del techo (un plafón que brilla) y el indicador de arriba de la puerta
    const lamp = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xfff0d0, emissiveIntensity: 1.8 });
    panel(dep * 0.6, 0.02, hw * 1.1, lamp, mid, 2.39, 0);
    const ind = new THREE.MeshStandardMaterial({ color: 0x201008, emissive: 0xff7a20, emissiveIntensity: 1.4 });
    panel(0.02, 0.08, 0.3, ind, into * 0.04, 2.3, 0);
    grp.traverse((o) => o.isMesh && (o.castShadow = false));
    this.root.add(grp);
    S.cab = grp;
  }

  // El botón de bronce al costado de la puerta (y lo que se usa con F).
  buildButton(S) {
    const g = this.g;
    const { D } = S;
    const plate = new THREE.Group();
    plate.position.set(D.x + S.face * 0.04, D.y + 1.15, D.z + D.hw + 0.32);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.12), this.M.bronze);
    plate.add(base);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x402010, emissive: 0xffa040, emissiveIntensity: 0 });
    for (const dy of [0.05, -0.05]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateZ(Math.PI / 2), btnMat);
      b.position.set(S.face * 0.02, dy, 0);
      plate.add(b);
    }
    this.root.add(plate);
    S.btn = btnMat;
    const label = S.k === 'low' ? 'subir al Mirador' : 'bajar a la Cripta';
    S.item = g.interact.add({
      kind: 'ascensor',
      pos: new THREE.Vector3(S.front.x, S.y + 1.3, S.front.z),
      radius: 2.2,
      wide: true,
      prompt: () => {
        if (!g.world.power) return { text: 'Necesita electricidad', noCost: true, info: true };
        if (this.ride || this.cool > 0) return null;
        if (this.st.at !== S.k) return { text: 'llamar el ascensor', noCost: true };
        return label;
      },
      cost: () => (g.world.power && !this.ride && this.st.at === S.k ? COST : 0),
      use: () => {
        if (!g.world.power || this.ride || this.cool > 0) return false;
        if (isHost(g)) this.send({ a: 'go', from: this.st.at, to: this.st.at === 'low' ? 'high' : 'low' });
        return true;
      },
    });
  }

  // ---------------- el viaje ----------------
  go(from, to) {
    const g = this.g;
    this.ride = { from, to, t: 0, me: false, moved: false };
    this.st.at = to;
    this.sfxDoors(this.stops[from]);
  }

  update(dt) {
    const g = this.g;
    this.cool = Math.max(0, this.cool - dt);
    if (isHost(g)) this.strays(dt);
    const R = this.ride;
    for (const S of Object.values(this.stops)) {
      // las hojas: abiertas en la parada donde está la cabina (si no viaja)
      let want = !R && this.st.at === S.k ? 1 : 0;
      if (R && R.t > CLOSE_T + RIDE_T && S.k === R.to) want = 1;
      S.open += Math.sign(want - S.open) * Math.min(Math.abs(want - S.open), dt / (want ? OPEN_T : CLOSE_T));
      const e = S.open * S.open * (3 - 2 * S.open);
      for (const L of S.D.leaves) L.position.z = S.D.z + L.userData.side * (S.D.hw * 0.5 + e * S.D.hw * 0.92);
      S.cab.visible = S.open > 0.01;
      S.btn.emissiveIntensity = g.world.power ? (R && (R.from === S.k || R.to === S.k) ? 2.2 : 0.6) : 0;
    }
    if (!R) return;
    R.t += dt;
    const P = g.player;
    const A = this.stops[R.from];
    const B = this.stops[R.to];
    // se cerraron: el que quedó adelante viaja
    if (!R.checked && R.t >= CLOSE_T) {
      R.checked = true;
      const d = Math.hypot(P.pos.x - A.front.x, P.pos.z - A.front.z);
      R.me = P.alive && !P.downed && d < RIDE_R && Math.abs(P.pos.y - A.y) < 1.6;
      if (R.me) {
        this.fade(1);
        this.sfxRide(R.to === 'high');
      }
    }
    if (R.me) {
      // a oscuras: quieto, del otro lado, mirando para afuera de la cabina
      if (R.t >= CLOSE_T + 0.35) {
        P.pos.copy(B.front);
        P.vel?.set(0, 0, 0);
        if (!R.moved) {
          R.moved = true;
          P.yaw = B.face > 0 ? -Math.PI / 2 : Math.PI / 2;
          P.pitch = 0;
        }
      }
      if (R.t >= CLOSE_T + RIDE_T - 0.15 && !R.lit) {
        R.lit = true;
        this.fade(0);
      }
    }
    if (R.t >= CLOSE_T + RIDE_T && !R.dinged) {
      R.dinged = true;
      this.sfxDing(B);
      this.sfxDoors(B);
      // la primera vez arriba: se abre el Mirador
      if (R.to === 'high' && isHost(g) && !this.st.up) {
        this.st.up = 1;
        g.activateZone?.('I');
      }
    }
    if (R.t >= CLOSE_T + RIDE_T + OPEN_T) {
      this.ride = null;
      this.cool = COOL;
    }
  }

  // Los muertos que quedaron en el Mirador sin nadie arriba (se bajaron en
  // el ascensor o por la tirolesa): no tienen por dónde bajar, así que a los
  // pocos segundos vuelven a la cola de la ronda.
  strays(dt) {
    const g = this.g;
    const up = players(g).some((p) => p.pos.y > 40);
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || (z.baseY ?? z.pos.y) < 40) continue;
      const t = up ? 0 : (this.mirT.get(z) || 0) + dt;
      this.mirT.set(z, t);
      if (t > 6) {
        this.mirT.delete(z);
        g.zombies.free(z);
        g.rounds.requeue?.(1);
      }
    }
  }

  // la pantalla negra del viaje (un div propio sobre el juego)
  fade(on) {
    const g = this.g;
    if (!this.overlay) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .3s ease;z-index:5';
      (g.hud?.root || document.body).appendChild(el);
      this.overlay = el;
    }
    this.overlay.style.opacity = on ? '1' : '0';
  }

  // ---------------- los ruidos ----------------
  sfxDoors(S) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.set(S.D.x, S.y + 1.2, S.D.z), gain: 0.7, reverb: 0.4, ref: 3 });
    A.noise(o, { t: A.now, dur: 0.8, type: 'bandpass', freq: 700, freqEnd: 420, q: 2, gain: 0.25, attack: 0.08 });
    A.tone(o, { t: A.now + 0.78, dur: 0.12, type: 'triangle', freq: 120, gain: 0.3 });
  }

  sfxDing(S) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: tmpV.set(S.D.x, S.y + 2.2, S.D.z), gain: 0.8, reverb: 0.5, ref: 4 });
    A.tone(o, { t: A.now, dur: 0.9, type: 'sine', freq: 1318, gain: 0.18 });
    A.tone(o, { t: A.now + 0.22, dur: 1.3, type: 'sine', freq: 1046, gain: 0.18 });
  }

  // el motor y el cable (lo oye solo el que viaja: adentro de la cabina)
  sfxRide(up) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const t = A.now + 0.1;
    const o = A.out({ gain: 0.8, reverb: 0.15 });
    A.noise(o, { t, dur: RIDE_T, type: 'lowpass', freq: up ? 180 : 260, freqEnd: up ? 260 : 170, gain: 0.5, attack: 0.5, brown: true });
    A.tone(o, { t, dur: RIDE_T, type: 'sawtooth', freq: up ? 46 : 58, freqEnd: up ? 58 : 46, gain: 0.05, attack: 0.6 });
    for (let i = 0; i < 9; i++) A.noise(o, { t: t + 0.3 + i * 0.34 + Math.random() * 0.08, dur: 0.05, type: 'bandpass', freq: 1800, q: 4, gain: 0.12 });
  }

  // ---------------- la red ----------------
  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'asc', ...m });
  }

  apply(m) {
    if (m.a === 'go') this.go(m.from, m.to);
  }

  state() {
    return { at: this.st.at, up: this.st.up };
  }

  applyFull(s) {
    if (!s) return;
    this.st.at = s.at || 'low';
    this.st.up = s.up || 0;
    for (const S of Object.values(this.stops)) S.open = this.st.at === S.k ? 1 : 0;
  }

  dispose() {
    this.root.removeFromParent();
    this.overlay?.remove();
  }
}
