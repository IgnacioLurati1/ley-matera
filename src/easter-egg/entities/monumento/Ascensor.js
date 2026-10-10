import * as THREE from 'three';
import { players, playerPos } from '../castle/common';
import { ELEV } from '../../world/monumentoTorre';

// El ascensor de la Torre: de la nave de la Cripta (-2,6) al Mirador (44),
// setenta metros adentro del fuste. Las puertas de bronce y el vano de la
// pared las arma world/monumentoTorre.js (w.mon.elevDoors, ELEV); acá va la
// cabina de atrás de cada puerta (madera, pasamanos de bronce, la luz del
// techo, el indicador de piso y la mirilla del pozo), la botonera y el viaje.
// - Se entra caminando. Con la luz prendida, la botonera de adentro manda la
//   cabina a la otra punta (cuesta COST); desde afuera, con la cabina en la
//   otra punta, se la llama (gratis).
// - Se cierran las puertas y viaja el que está adentro (cada compu se lleva a
//   su jugador, que queda quieto en la cabina): el motor, el traqueteo del
//   cable, el indicador que cuenta los pisos, la mirilla con el pozo que pasa
//   y la campanita al llegar. A mitad de camino se pasa a la cabina de la otra
//   punta (las dos son iguales; por afuera nadie ve adentro del fuste).
// - La primera vez que llega arriba se abre la zona del Mirador (I).
// En línea lo decide el anfitrión y viaja por 'pee' (k: 'asc'), como el resto
// del easter egg (entities/MonumentoEgg.js).
// - Los muertos (el usuario, 2026-10-07): con la puerta cerrada no la cruzan
//   (blockDoors), al que viaja no lo buscan ni le pegan (riding; lo miran
//   MonumentoEgg.noTarget y .lift), y los que quedan en el otro nivel sin nadie
//   a quien alcanzar vuelven a la cola de la ronda (strays): antes entraban a
//   la cabina y se quedaban contra las paredes.
// - En línea, a los compañeros que viajan cada compu los lleva (showRider): el
//   que viaja con ellos los ve quietos en su cabina; el de afuera ve la silueta
//   subir o bajar por el fuste. Antes quedaban parados y saltaban a la otra punta.

const COST = 250;
const CLOSE_T = 1.0;
const RIDE_T = 7.5;
const OPEN_T = 1.0;
const COOL = 1.5;
// el recorrido (para la mirilla: cuánto pozo pasa)
const TRAVEL = 46.6;
const FLOORS = ['C', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'M'];
const tmpV = new THREE.Vector3();

const isHost = (g) => !g.net || g.net.host;
// En qué nivel está algo a la altura y: 0, todo lo de abajo; 1, el Mirador
// (solo se llega en ascensor); 2, el patio de la 2043 (por el portal).
export const nivel = (y) => (y > 100 ? 2 : y > 40 ? 1 : 0);
// el avance del viaje: arranca y frena suave
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

// El pozo del ascensor (lo que pasa por la mirilla y detrás de la reja): un
// tramo de 3,2 m de ladrillo oscuro con la losa de un piso y la luz de su
// palier, en una textura que se repite y corre con el viaje (map.offset).
// (con un ShaderMaterial crudo, sin el tono del juego, se veía casi blanco)
let shaftTex = null;
function shaftMaterial(height) {
  if (!shaftTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#120d0a';
    x.fillRect(0, 0, 128, 512);
    // los ladrillos (filas de 18 px, trabados)
    x.fillStyle = '#1d1510';
    for (let r = 0; r < 512 / 18; r++) {
      for (let k = -1; k < 3; k++) x.fillRect(k * 64 + (r % 2) * 32 + 2, r * 18 + 2, 60, 14);
    }
    // la losa del piso y la luz tibia del palier, que se derrama
    const gr = x.createLinearGradient(0, 200, 0, 330);
    gr.addColorStop(0, 'rgba(255,190,110,0)');
    gr.addColorStop(0.5, 'rgba(255,190,110,0.28)');
    gr.addColorStop(1, 'rgba(255,190,110,0)');
    x.fillStyle = gr;
    x.fillRect(0, 200, 128, 130);
    x.fillStyle = '#3a342e';
    x.fillRect(0, 34, 128, 22);
    x.fillStyle = '#4a433b';
    x.fillRect(0, 34, 128, 4);
    shaftTex = new THREE.CanvasTexture(c);
    shaftTex.colorSpace = THREE.SRGBColorSpace;
    shaftTex.wrapS = shaftTex.wrapT = THREE.RepeatWrapping;
  }
  const t = shaftTex.clone();
  t.needsUpdate = true;
  t.repeat.set(1, height / 3.2);
  return new THREE.MeshBasicMaterial({ map: t });
}

// La reja plegadiza de bronce (rombos): un plano con su dibujo recortado.
let gateTex = null;
function gateMaterial(M) {
  if (!gateTex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 256, 256);
    x.strokeStyle = '#c8a050';
    x.lineWidth = 7;
    for (let i = -256; i <= 512; i += 64) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 256, 256);
      x.moveTo(i, 256);
      x.lineTo(i + 256, 0);
      x.stroke();
    }
    x.lineWidth = 10;
    for (const v of [0, 128, 256]) {
      x.beginPath();
      x.moveTo(v, 0);
      x.lineTo(v, 256);
      x.stroke();
    }
    gateTex = new THREE.CanvasTexture(c);
    gateTex.colorSpace = THREE.SRGBColorSpace;
    gateTex.wrapS = gateTex.wrapT = THREE.RepeatWrapping;
    gateTex.repeat.set(2, 3);
    gateTex.anisotropy = 4;
  }
  return new THREE.MeshStandardMaterial({ map: gateTex, transparent: false, alphaTest: 0.5, metalness: 0.7, roughness: 0.35, color: 0xffffff, side: THREE.DoubleSide });
}

// El espejo del fondo de la cabina. Liso (0,08) y metálico: un fuego enfrente
// (en la Cripta, la lámpara votiva de Belgrano está justo en el eje de la
// cabina) daba un reflejo puntual de cientos de veces el blanco y el bloom
// lavaba la pantalla al girar hacia el ascensor. El brillo directo de las luces
// va con tope (queda el redondel tibio del farol); el reflejo de pantalla de
// fx/Epic sigue igual. globalThis.__mduNoMirrorCap: como antes.
function mirrorMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x9fb2c0, metalness: 1, roughness: 0.08 });
  if (globalThis.__mduNoMirrorCap === true) return m;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', 'reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( 1.0 ) );\n#include <aomap_fragment>');
  };
  m.customProgramCacheKey = () => 'mduMirrorCap';
  return m;
}

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
      const into = -face;
      const S = { k, D, y: D.y, face, into, open: k === 'low' ? 1 : 0, front: new THREE.Vector3(D.x + face * 0.85, D.y, D.z) };
      // las puertas cerradas frenan (en el vano)
      // (navFree: no cortan el camino de los muertos. La hoja queda justo en la
      // raya de la celda y, si el camino se rehacía con la puerta cerrada, la
      // cabina quedaba aislada: parado adentro de la del Mirador los muertos
      // salían abajo, por las ventanas del Patio. Cerrada, los frena blockDoors)
      S.doorBox = g.world.addBox([Math.min(D.x, D.x + into * 0.12), D.y, D.z - D.hw, Math.max(D.x, D.x + into * 0.12), D.y + ELEV.top, D.z + D.hw], { kind: 'prop', shoot: true, navFree: globalThis.__mduNoAscZ !== true });
      this.stops[k] = S;
      this.buildCab(S);
    }
    for (const k of ['low', 'high']) if (this.stops[k]) this.buildButton(this.stops[k]);
    // las ventanas del Mirador: el trepador aparece colgado afuera, a la
    // altura del antepecho (el piso de afuera de la grilla es el de la calle)
    for (const W of g.barriers?.windows || []) if (W.zone === 'I') W.ext.y = W.fy;
    this.mirT = new Map();
    this.floor = -1;
  }

  get M() {
    return this.g.world.M;
  }

  // ¿El punto está adentro de la cabina de esa parada?
  inside(S, p) {
    if (!S || !p) return false;
    const u = (p.x - S.D.x) * S.into;
    return u > 0.08 && u < ELEV.dep + 0.05 && Math.abs(p.z - S.D.z) < S.D.hw + 0.05 && Math.abs(p.y - S.y) < 1.2;
  }

  // ---------------- la cabina ----------------
  buildCab(S) {
    const M = this.M;
    const { D } = S;
    const into = S.into;
    const dep = ELEV.dep;
    const grp = new THREE.Group();
    grp.position.set(D.x, D.y, D.z);
    // la madera con la luz tibia del plafón encima (la cabina no lleva luz de verdad)
    const base = M.woodDark || M.wood;
    const wood = (this.cabWood ||= Object.assign(base.clone(), { emissive: new THREE.Color(0x4a3220), emissiveIntensity: 0.55 }));
    if (base.map) wood.emissiveMap = base.map;
    const panel = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      grp.add(m);
      return m;
    };
    const hw = D.hw - 0.01;
    const mid = (into * dep) / 2;
    // piso de goma, techo, fondo y costados de madera con zócalo y friso de bronce
    panel(dep, 0.04, hw * 2, M.iron, mid, 0.0, 0);
    panel(dep, 0.05, hw * 2, wood, mid, 2.42, 0);
    panel(0.05, 2.42, hw * 2, wood, into * (dep - 0.025), 1.21, 0);
    for (const s of [-1, 1]) {
      panel(dep, 2.42, 0.05, wood, mid, 1.21, s * (hw - 0.025));
      panel(dep - 0.04, 0.03, 0.02, M.bronze, mid, 0.95, s * (hw - 0.06));
      panel(dep - 0.04, 0.12, 0.02, M.bronze, mid, 0.08, s * (hw - 0.06));
    }
    // el pasamanos del fondo y el espejo
    panel(0.03, 0.03, hw * 1.6, M.bronze, into * (dep - 0.08), 0.95, 0);
    const mirror = mirrorMaterial();
    panel(0.01, 1.0, hw * 1.2, mirror, into * (dep - 0.055), 1.65, 0);
    // la luz del techo (un plafón que brilla)
    const lamp = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xfff0d0, emissiveIntensity: 1.8 });
    panel(dep * 0.6, 0.02, hw * 1.1, lamp, mid, 2.39, 0);
    // el indicador de piso arriba de la puerta (por dentro)
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    ind.position.set(into * 0.1, 2.08, 0);
    ind.rotation.y = into > 0 ? Math.PI / 2 : -Math.PI / 2;
    grp.add(ind);
    S.ind = { c, tex, last: null };
    // la mirilla del pozo: un vidrio angosto en el costado, con su marco (las
    // dos cabinas son la misma dada vuelta: el costado va con `into`)
    const sz = into;
    const sh = shaftMaterial(1.1);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.1), sh);
    win.position.set(mid, 1.45, -sz * (hw - 0.052));
    win.rotation.y = sz > 0 ? 0 : Math.PI;
    grp.add(win);
    panel(0.4, 0.04, 0.02, M.bronze, mid, 2.02, -sz * (hw - 0.055));
    panel(0.4, 0.04, 0.02, M.bronze, mid, 0.88, -sz * (hw - 0.055));
    // para el que viaja: la reja plegadiza de la cabina y, detrás, el pozo que
    // pasa (en el vano, delante de las hojas del palier, que se quedan)
    const pitM = shaftMaterial(2.3);
    S.shaft = [sh.map, pitM.map];
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2.3), pitM);
    pit.position.set(into * 0.075, 1.15, 0);
    pit.rotation.y = into > 0 ? Math.PI / 2 : -Math.PI / 2;
    pit.visible = false;
    grp.add(pit);
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.98), gateMaterial(M));
    gate.position.set(into * 0.09, 0.99, 0);
    gate.rotation.y = into > 0 ? Math.PI / 2 : -Math.PI / 2;
    gate.visible = false;
    grp.add(gate);
    S.pit = pit;
    S.gate = gate;
    // la botonera (adentro, al lado de la puerta)
    const plate = new THREE.Group();
    plate.position.set(into * 0.22, 1.2, sz * (hw - 0.055));
    plate.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.02), M.bronze));
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x402010, emissive: 0xffa040, emissiveIntensity: 0 });
    for (const dy of [0.07, -0.07]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12).rotateX(Math.PI / 2), btnMat);
      b.position.set(0, dy, -sz * 0.015);
      plate.add(b);
    }
    grp.add(plate);
    S.btnIn = btnMat;
    grp.traverse((o) => o.isMesh && (o.castShadow = false));
    this.root.add(grp);
    S.cab = grp;
    this.setIndicator(S, S.k === 'low' ? 0 : FLOORS.length - 1);
  }

  setIndicator(S, i) {
    if (S.ind.last === i) return;
    S.ind.last = i;
    const x = S.ind.c.getContext('2d');
    x.fillStyle = '#1a0c04';
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#ff9a3a';
    x.font = '700 44px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(FLOORS[i], 64, 34);
    S.ind.tex.needsUpdate = true;
  }

  // El botón de llamar (afuera, al lado de la puerta) y el de la botonera de
  // adentro: un solo punto de uso entre los dos (lo que dice depende de dónde
  // está uno).
  buildButton(S) {
    const g = this.g;
    const { D } = S;
    const plate = new THREE.Group();
    plate.position.set(D.x + S.face * 0.04, D.y + 1.15, D.z + D.hw + 0.32);
    plate.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.12), this.M.bronze));
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x402010, emissive: 0xffa040, emissiveIntensity: 0 });
    for (const dy of [0.05, -0.05]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateZ(Math.PI / 2), btnMat);
      b.position.set(S.face * 0.02, dy, 0);
      plate.add(b);
    }
    this.root.add(plate);
    S.btn = btnMat;
    const label = S.k === 'low' ? 'subir al Mirador' : 'bajar a la Cripta';
    const who = () => (g.net?.useFrom != null ? playerPos(g, g.net.useFrom) : g.player.pos);
    S.item = g.interact.add({
      kind: 'ascensor',
      pos: new THREE.Vector3(D.x + S.into * 0.3, S.y + 1.25, D.z),
      radius: 1.7,
      wide: true,
      prompt: () => {
        const inn = this.inside(S, g.player.pos);
        if (!g.world.power) return inn || this.st.at !== S.k ? { text: 'Necesita electricidad', noCost: true, info: true } : null;
        if (this.ride || this.cool > 0) return null;
        if (this.st.at !== S.k) return inn ? null : { text: 'llamar el ascensor', noCost: true };
        return inn ? label : null;
      },
      cost: () => (g.world.power && !this.ride && this.st.at === S.k && this.inside(S, g.player.pos) ? COST : 0),
      use: () => {
        if (!g.world.power || this.ride || this.cool > 0) return false;
        const inn = this.inside(S, who());
        if (this.st.at === S.k && !inn) return false;
        if (this.st.at !== S.k && inn) return false;
        if (isHost(g)) this.send({ a: 'go', from: this.st.at, to: this.st.at === 'low' ? 'high' : 'low' });
        return true;
      },
    });
  }

  // ---------------- el viaje ----------------
  go(from, to) {
    this.endRiders();
    this.ride = { from, to, t: 0, me: false, co: new Map() };
    this.st.at = to;
    this.sfxDoors(this.stops[from]);
  }

  update(dt) {
    const g = this.g;
    this.cool = Math.max(0, this.cool - dt);
    const R = this.ride;
    for (const S of Object.values(this.stops)) {
      // las hojas: abiertas en la parada donde está la cabina (si no viaja)
      let want = !R && this.st.at === S.k ? 1 : 0;
      if (R && R.t > CLOSE_T + RIDE_T && S.k === R.to) want = 1;
      S.open += Math.sign(want - S.open) * Math.min(Math.abs(want - S.open), dt / (want ? OPEN_T : CLOSE_T));
      const e = S.open * S.open * (3 - 2 * S.open);
      for (const L of S.D.leaves) L.position.z = S.D.z + L.userData.side * (S.D.hw * 0.5 + e * S.D.hw * 0.92);
      S.doorBox.active = S.open < 0.6;
      // la cabina se ve con la puerta abierta, y para el que viaja adentro (con
      // la reja cerrada y el pozo pasando detrás)
      const mine = !!R && R.me && R.cab === S.k;
      S.cab.visible = S.open > 0.01 || mine;
      S.gate.visible = S.pit.visible = mine && R.t > CLOSE_T * 0.7 && R.t < CLOSE_T + RIDE_T + OPEN_T * 0.4;
      const lit = g.world.power ? (R && (R.from === S.k || R.to === S.k) ? 2.2 : 0.6) : 0;
      S.btn.emissiveIntensity = lit;
      S.btnIn.emissiveIntensity = lit;
    }
    if (isHost(g) && globalThis.__mduNoAscZ !== true) this.blockDoors();
    if (isHost(g)) this.strays(dt);
    if (!R) return;
    R.t += dt;
    const P = g.player;
    const A = this.stops[R.from];
    const B = this.stops[R.to];
    // se cerraron: el que quedó adentro viaja
    if (!R.checked && R.t >= CLOSE_T) {
      R.checked = true;
      R.me = A !== B && P.alive && !P.downed && !P.ride && this.inside(A, P.pos);
      if (R.me) {
        // dónde está parado adentro (a lo hondo y de costado) y para dónde mira
        R.u = (P.pos.x - A.D.x) * A.into;
        R.v = (P.pos.z - A.D.z) * A.into;
        R.cab = A.k;
        R.yaw0 = P.yaw;
        P.ride = () => this.hold();
        this.sfxRide(R.to === 'high');
      }
      // los compañeros que quedaron adentro: cada compu los lleva (showRider)
      if (g.net && A !== B && globalThis.__mduNoAscNet !== true) {
        this.fixFn ||= (x) => this.showRider(x);
        for (const r of g.net.remote.values()) {
          if (r.dead || r.downed || !this.inside(A, r.pos)) continue;
          R.co.set(r, { u: (r.pos.x - A.D.x) * A.into, v: (r.pos.z - A.D.z) * A.into, yaw: r.yaw });
          r.fix = this.fixFn;
        }
      }
    }
    // el viaje: el indicador cuenta los pisos y la mirilla corre (todas las cabinas)
    if (R.t >= CLOSE_T) {
      const k = Math.min(1, (R.t - CLOSE_T) / RIDE_T);
      const p = ease(k);
      const f = R.to === 'high' ? p : 1 - p;
      const i = Math.round(f * (FLOORS.length - 1));
      for (const S of Object.values(this.stops)) {
        this.setIndicator(S, i);
        // (subiendo, el pozo pasa para abajo: la textura corre con offset que
        // crece; estaba al revés y parecía que bajaba. __mduNoAscDir: como antes)
        const sgn = globalThis.__mduNoAscDir ? -1 : 1;
        for (const t of S.shaft) t.offset.y = (R.to === 'high' ? p : -p) * sgn * (TRAVEL / 3.2);
      }
      if (R.me && k >= 0.5 && R.cab !== B.k) {
        // a mitad de camino: a la cabina de la otra punta (igual, dada vuelta)
        R.cab = B.k;
        P.yaw += Math.PI;
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
    // con la puerta ya abierta se puede salir
    if (R.me && R.t >= CLOSE_T + RIDE_T + OPEN_T * 0.6 && P.ride) {
      P.ride = null;
      R.me = false;
    }
    if (R.t >= CLOSE_T + RIDE_T + OPEN_T) {
      if (R.me && P.ride) P.ride = null;
      for (const S of Object.values(this.stops)) for (const t of S.shaft) t.offset.y = 0;
      this.endRiders();
      this.ride = null;
      this.cool = COOL;
    }
  }

  // ¿Ese jugador (el local o uno de la red, el objeto) va en el ascensor?
  // Desde que se empiezan a cerrar las puertas (el que está adentro) hasta
  // que se abren en la otra punta.
  riding(p) {
    const R = this.ride;
    if (!R || !p || R.from === R.to) return false;
    if (R.t >= CLOSE_T + RIDE_T + OPEN_T * 0.6) return false;
    if (R.t < CLOSE_T || !R.checked) return this.inside(this.stops[R.from], p.pos);
    return p === this.g.player ? !!R.me : R.co.has(p);
  }

  // Un compañero que viaja, como se ve en esta compu (lo llama net/Session
  // interpolate con lo que mandó la suya ya puesto en r.pos y r.yaw; su compu lo
  // tiene quieto en la cabina de salida y, a la mitad, en la de llegada, dado vuelta).
  showRider(r) {
    const R = this.ride;
    const c = R?.co.get(r);
    if (!c || R.t >= CLOSE_T + RIDE_T + OPEN_T * 0.6) {
      r.fix = null;
      return;
    }
    const A = this.stops[R.from];
    const B = this.stops[R.to];
    const p = ease(Math.min(1, Math.max(0, (R.t - CLOSE_T) / RIDE_T)));
    // (su mirada, sin la media vuelta de la mitad; mientras llega esa foto, la última)
    const f = (r.pos.y - A.y) / (B.y - A.y);
    if (f < 0.02) c.yaw = r.yaw;
    else if (f > 0.98) c.yaw = r.yaw - Math.PI;
    if (R.me) {
      // viajo con él: en mi cabina, en su lugar
      const S = this.stops[R.cab];
      r.pos.set(S.D.x + S.into * c.u, S.y, S.D.z + S.into * c.v);
      r.yaw = c.yaw + (S === B ? Math.PI : 0);
    } else {
      // de afuera: sube (o baja) por adentro del fuste, y se va dando vuelta
      const ax = A.D.x + A.into * c.u;
      const az = A.D.z + A.into * c.v;
      const bx = B.D.x + B.into * c.u;
      const bz = B.D.z + B.into * c.v;
      r.pos.set(ax + (bx - ax) * p, A.y + (B.y - A.y) * p, az + (bz - az) * p);
      const k = Math.min(1, Math.max(0, (p - 0.35) / 0.3));
      r.yaw = c.yaw + Math.PI * k * k * (3 - 2 * k);
    }
    r.speed = 0;
  }

  endRiders() {
    for (const r of this.ride?.co?.keys() || []) if (r.fix === this.fixFn) r.fix = null;
  }

  // Con la puerta cerrada no pasa nadie: al muerto que cruza el vano (las
  // hojas son finas y las atravesaba) se lo deja del lado de afuera.
  blockDoors() {
    const pool = this.g.zombies.pool;
    for (const S of Object.values(this.stops)) {
      if (S.open >= 0.6) continue;
      const D = S.D;
      for (const z of pool) {
        if (!z.active || z.dead) continue;
        if (Math.abs((z.baseY ?? z.pos.y) - S.y) > 1.5 || Math.abs(z.pos.z - D.z) > D.hw + 0.3) continue;
        const u = (z.pos.x - D.x) * S.into;
        if (u > -0.36 && u < ELEV.dep + 0.3) z.pos.x = D.x - S.into * 0.36;
      }
    }
  }

  // El que viaja queda quieto en su lugar de la cabina (Player.ride, después
  // de moverse): en la de la parada de salida o, pasada la mitad, en la de llegada.
  hold() {
    const R = this.ride;
    const P = this.g.player;
    if (!R || !R.me) {
      P.ride = null;
      return;
    }
    const S = this.stops[R.cab];
    const k = Math.min(1, Math.max(0, (R.t - CLOSE_T) / RIDE_T));
    // el traqueteo: más al arrancar y al frenar
    const shake = R.t > CLOSE_T && k < 1 ? (0.004 + 0.01 * Math.sin(k * Math.PI * 2) ** 2) * Math.sin(R.t * 37) : 0;
    P.pos.set(S.D.x + S.into * R.u, S.y + shake, S.D.z + S.into * R.v);
    P.vel?.set(0, 0, 0);
    P.onGround = true;
  }

  // Los muertos que quedaron en el Mirador sin nadie arriba (se bajaron en
  // el ascensor o por la tirolesa): no tienen por dónde bajar, así que a los
  // pocos segundos vuelven a la cola de la ronda. Y al revés: los de abajo
  // con todos arriba (se quedaban contra las paredes del pie de la Torre).
  // El que viaja cuenta en los dos niveles hasta que llega.
  strays(dt) {
    const g = this.g;
    if (globalThis.__mduNoAscZ === true) return this.straysOld(dt);
    // (en qué niveles hay alguien: bits)
    let at = 0;
    const see = (p) => {
      at |= this.riding(p) ? 3 : 1 << nivel(p.pos.y);
    };
    if (g.player.alive) see(g.player);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead) see(r);
    // (sin nadie vivo no se toca nada: la partida se está terminando)
    if (!at) return;
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead) continue;
      const high = (z.baseY ?? z.pos.y) >= 40;
      const t = at & (high ? 2 : 1) ? 0 : (this.mirT.get(z) || 0) + dt;
      this.mirT.set(z, t);
      if (t > (high ? 6 : 3.5)) {
        this.mirT.delete(z);
        g.zombies.free(z);
        g.rounds.requeue?.(1);
      }
    }
  }

  straysOld(dt) {
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
    const t = A.now + 0.05;
    const o = A.out({ gain: 0.8, reverb: 0.15 });
    A.noise(o, { t, dur: RIDE_T, type: 'lowpass', freq: up ? 180 : 260, freqEnd: up ? 260 : 170, gain: 0.5, attack: 0.9, brown: true });
    A.tone(o, { t, dur: RIDE_T, type: 'sawtooth', freq: up ? 46 : 58, freqEnd: up ? 58 : 46, gain: 0.05, attack: 1.0 });
    // el cable que traquetea al pasar cada piso
    for (let i = 0; i < 13; i++) A.noise(o, { t: t + 0.6 + i * ((RIDE_T - 1.2) / 12) + Math.random() * 0.06, dur: 0.05, type: 'bandpass', freq: 1800, q: 4, gain: 0.12 });
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
    this.endRiders();
    if (this.ride?.me && this.g.player.ride) this.g.player.ride = null;
    this.root.removeFromParent();
  }
}
