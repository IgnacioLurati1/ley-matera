import * as THREE from 'three';
import CastleCine, { smooth, lerp } from './castleCine';
import CineActors, { yawTo } from './cineActors';
import { gilVincha } from '../net/gilLook';
import { sableModel } from '../weapons/sableModels';
import { PERSONA_T } from './cineCrew';
import { warmScene } from './cineWarm';
import { makeRift } from './eclipseCineSable';
import { makeDome, setSky } from './eclipseCineSets';
import { SB, sableTwo, mixM, hand, loadSableClips, sableClips } from './monumentoSableBeat';
import { ISLANDS, ZONES, LIGHTS } from '../config/maps/eclipse';
import { ZONES as MON_ZONES, EE as MON_EE } from '../config/maps/monumento';
import { banderaTexture } from '../world/monumentoTextures';
import { belgranoSkin } from '../entities/monumento/belgranoSkin';
import { addPerson } from '../entities/eclipse/montar';

// La escena del Sable de Eclipse Matero, del lado del Gil (sesión 1f,
// 2026-10-07). El usuario: "¿por qué está la cinemática del sable al revés? El
// Gauchito va al Monumento, no los gauchos hacia nosotros". Es la otra mitad
// de la del Monumento (ui/monumentoSableBeat.js): allá el Gil sale de un
// desgarro, los cuatro le alcanzan el sable y se vuelve. Acá se ve el viaje:
//  1. de noche, en Eclipse: la Llama crece, al lado se raja el aire y se abre
//     un desgarro (adentro, el Monumento al alba: ui/eclipseCineSable makeRift);
//  2. el Gil camina hasta el desgarro y entra (blanco);
//  3. del otro lado, el mismo lugar al alba, sin eclipse: los cuatro de
//     siempre en fila, con su mate. Se raja el aire, sale el Gil y pasa lo
//     mismo que en el Monumento, cuadro por cuadro: las mismas reacciones, el
//     mismo pase del sable de las palmas del Valiente a las manos del Gil, la
//     misma frase y las mismas tomas (las del Monumento llevadas a este lugar:
//     M(x, y, z) pasa del lugar de allá —el desgarro en (100,2; 25,9), la fila
//     hacia +z— a este);
//  4. el Gil vuelve a entrar (blanco) y sale en Eclipse con el sable en la mano;
//     el desgarro se cierra. Al terminar, el Sable es del Gil (el 'take' del paso).
// En línea cada compu la ve con el reloj de la escena desde 'lit' (ui/castleCine).
// globalThis.__mduOldEclSable: la escena de antes (los cuatro salen a Eclipse).

const GIL_ID = 901;
const ROW_BACK = 0.6;
const BX = 103.35;
const BZ = 30.5;
const PX = 100.2;
const PZ = 25.9;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothW = (t, a, b) => smooth(clamp01((t - a) / (b - a)));
const hv = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), c: new THREE.Vector3(), n: new THREE.Vector3() });
const HL = hv();
const HR = hv();
const A_ = new THREE.Vector3();
const B_ = new THREE.Vector3();
// la luz del alba del otro lado
const ALBA = { sun: 0xffc890, sunI: 2.1, dir: [-0.62, 0.32, -0.72], hs: 0x9ab0d8, hg: 0x5a4636, hI: 1.15, amb: 0x6a5a50, ambI: 0.35, fog: 0xd9a888, fogD: 0.021 };
const FAR_ALBA = 82;
const GRADE_ALBA = { sat: 1.05, con: 1.04, sh: [0.02, 0.01, 0.03], hi: [0.04, 0.02, -0.02], gain: [1.04, 1.0, 0.95], lift: [0.01, 0.005, 0.0] };
// lo de Eclipse que del otro lado no está (el cielo roto, lo que flota, la niebla violeta)
const ECLIPSE_ONLY = /flotan|eclMood|eclMist|cristal|crystal|eclPools|trampa|grieta|eclipseRock|orbit|portal|abismo|desgarro|jinete/i;

// (2026-10-07, ITERACION-6 G1, el usuario: "la cinemática del Gil cruzando,
// totalmente incorrecta: no sigue la continuidad de la cinemática final del
// Monumento. Era reutilizar la otra parte del Monumento y que vuelva, y me das
// esa rehecha". El otro lado era un lugar libre cualquiera de la isla (caía en
// las gradas del Patio), al alba y sin Belgrano. Ahora es el final del
// Monumento tal cual: de noche, en el mismo camino del Parque de la Bandera
// —la isla del Monumento es el mapa de allá corrido, así que las posiciones y
// las tomas son las mismas, metro por metro—, con la luz de allá (medida en el
// juego durante el paso del sable), el mástil con la Bandera izada, el ánima
// de Belgrano en el borde de la barranca, el Canchero a su lado, y la ciudad y
// el río alrededor (los mismos constructores: world/monumentoCity).
// globalThis.__mduOldTripPlace: el lugar libre al alba, como antes)
const NOCHE = { sun: 0xcedaff, sunI: 0.85, dir: [0.88, 0.406, -0.248], hs: 0x93a0bc, hg: 0x6e5238, hI: 0.9, amb: 0x505060, ambI: 0.5, fog: 0x10161f, fogD: 0.02 };
// (el color del mapa del Monumento: fx/PostFX MAP_GRADE.monumento)
const GRADE_NOCHE = { sat: 0.8, con: 1.1, sh: [-0.016, 0.0, 0.03], hi: [0.032, 0.026, 0.008], gain: [1.0, 1.0, 1.02], lift: [0, 0, 0.003] };
// lo de Eclipse que en el Parque de allá no está
// (los rincones de Eclipse y sus faroles de poste: uno queda en medio del
// camino, a metro y medio del desgarro)
const PARQUE_ONLY = /rincon|eclipseGfx:faroles/i;
const BELGRANO_ID = 467;
const RIVER_Y = -5.2;
const MAST_H = 9.5;
const realOn = () => globalThis.__mduOldTripPlace !== true;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function sableTripOn() {
  return globalThis.__mduOldEclSable !== true;
}

export default class EclipseSableTrip extends CastleCine {
  // base: la escena de siempre (ui/eclipseCineSable: la Llama y el lugar libre)
  constructor(ee, base) {
    super(ee.g, { drive: false, kind: 'eclipse' });
    this.ee = ee;
    this.base = base;
    loadSableClips();
    this.whiteEl.style.transition = 'opacity 0.35s';
  }

  // ---------------- el lugar ----------------
  // De este lado, el desgarro va donde lo pone la escena de siempre (al lado de
  // la Llama: ui/eclipseCineSable place). Del otro, un lugar abierto, parejo y
  // libre para todo lo de la escena del Monumento: el Parque de la Bandera
  // (donde pasa allá) o el Patio Cívico. La fila hasta 6,8 m delante del
  // desgarro, las cámaras hasta 2,4 m a los costados y a 1,5 m de alto.
  place() {
    const g = this.g;
    const w = g.world;
    const S = this.base;
    this.eR = S.R.clone();
    this.en = S.n.clone();
    this.etg = new THREE.Vector3(-this.en.z, 0, this.en.x);
    this.eth = Math.atan2(this.en.x, this.en.z);
    const probe = new THREE.Vector3();
    const free = (x, z, y0, lo = 0.15, hi = 1.8, rad = 0.35) => {
      const y = w.floorAt(x, z);
      if (!(Math.abs(y - y0) < 0.3)) return false;
      probe.set(x, y, z);
      w.collide(probe, rad, y + lo, y + hi);
      return Math.hypot(probe.x - x, probe.z - z) < 1e-3;
    };
    const grid = [];
    for (let a = -2.4; a <= 1.61; a += 0.8) for (let b = -1.2; b <= 6.81; b += 0.8) grid.push([a, b]);
    const cams = [[-2.05, 2.25], [-1.75, 1.9], [1.35, 1.1], [-1.3, 3.55], [0.6, 2.1], [-1.15, 3.6]];
    const tryAt = (R, n) => {
      const tg = tmpW.set(-n.z, 0, n.x);
      for (const [a, b] of grid) if (!free(R.x + tg.x * a + n.x * b, R.z + tg.z * a + n.z * b, R.y)) return false;
      for (const [a, b] of cams) if (!free(R.x + tg.x * a + n.x * b, R.z + tg.z * a + n.z * b, R.y, 1.0, 2.0, 0.3)) return false;
      return true;
    };
    // (G1) el mismo lugar del Monumento: el Parque trasplantado, sin girar
    if (realOn()) {
      const zg = ZONES.mG;
      const mg = MON_ZONES.G;
      if (zg?.tp?.src === 'monumento' && zg.rects?.[0] && mg?.rects?.[0]) {
        const dx = zg.rects[0][0] - mg.rects[0][0];
        const dz = zg.rects[0][1] - mg.rects[0][1];
        const y = w.floorAt(PX + dx, PZ + dz);
        if (Math.abs(y - zg.y) < 0.6) {
          this.real = { dx, dz, dy: zg.y - mg.y };
          return this.setFrame(new THREE.Vector3(PX + dx, y, PZ + dz), new THREE.Vector3(0, 0, 1));
        }
      }
    }
    const ZS = w.zoneKeys;
    for (const want of [['mG'], ['mA'], null]) {
      const cells = [];
      for (let x = 0; x < w.W; x++) for (let z = 0; z < w.H; z++) {
        const i = w.idx(x, z);
        if (w.grid[i] !== 1) continue;
        const k = ZS[w.zone[i]];
        if (want ? !want.includes(k) : !/^m[A-G]$/.test(k || '')) continue;
        cells.push([x + 0.5, z + 0.5]);
      }
      if (!cells.length) continue;
      const cx = cells.reduce((s2, c) => s2 + c[0], 0) / cells.length;
      const cz = cells.reduce((s2, c) => s2 + c[1], 0) / cells.length;
      cells.sort((A, B) => Math.hypot(A[0] - cx, A[1] - cz) - Math.hypot(B[0] - cx, B[1] - cz));
      for (const [x, z] of cells) {
        const R = new THREE.Vector3(x, w.floorAt(x, z), z);
        for (let j = 0; j < 8; j++) {
          const th = (j * Math.PI) / 4;
          const n = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
          if (tryAt(R, n)) return this.setFrame(R, n);
        }
      }
    }
    // (sin lugar: el mismo de este lado)
    return this.setFrame(this.eR.clone(), this.en.clone());
  }

  setFrame(R, n) {
    this.R = R;
    this.n = n;
    this.tg = new THREE.Vector3(-n.z, 0, n.x);
    this.th = Math.atan2(n.x, n.z);
    this.my = R.y;
    return true;
  }

  // Una cámara que vea `at` (y los puntos de `see`) sin quedar adentro de algo
  // ni con algo en el medio: del lado de n, a d m, probando alrededor.
  camFor(at, see, n, d, avoid = []) {
    const w = this.g.world;
    const probe = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const hit = {};
    const base = Math.atan2(n.x, n.z);
    let best = null;
    let bestS = -1e9;
    // (todo alrededor, de 2,5 a 7 m: que se vean todos, separados, del lado de n)
    for (let dd = 2.5; dd <= 7.01; dd += 0.75) {
      for (let k = 0; k < 24; k++) {
        const a = base + (k / 24) * Math.PI * 2;
        const p = new THREE.Vector3(at.x + Math.sin(a) * dd, at.y + 1.75, at.z + Math.cos(a) * dd);
        const y = w.floorAt(p.x, p.z);
        if (!(Math.abs(y - at.y) < 1.2)) continue;
        probe.copy(p);
        w.collide(probe, 0.35, p.y - 0.4, p.y + 0.3);
        if (probe.distanceTo(p) > 1e-3) continue;
        if (avoid.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.6)) continue;
        let clear = true;
        const dirs = [];
        for (const q of see) {
          dir.set(q.x, q.y + 1.3, q.z).sub(p);
          const L = dir.length();
          dir.multiplyScalar(1 / L);
          dirs.push(dir.clone());
          if (w.raycast(p, dir, L, hit) < L - 0.9) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        // separación entre lo que tiene que verse (que no se tapen) y que entren en 60°
        let sep = 3.2;
        for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) sep = Math.min(sep, Math.acos(Math.max(-1, Math.min(1, dirs[i].dot(dirs[j])))));
        if (dirs.length > 1 && sep > 1.05) continue;
        const front = Math.cos(a - base);
        const sc = (dirs.length > 1 ? Math.min(sep, 0.75) * 3 : 0) + front * 1.2 - Math.abs(dd - d) * 0.25;
        if (sc > bestS) {
          bestS = sc;
          best = p;
        }
      }
    }
    return best || new THREE.Vector3(at.x + n.x * d, at.y + 1.75, at.z + n.z * d);
  }

  // Del lugar del Monumento (x, z de allá; y sobre el piso) a este.
  M(x, y, z, out = new THREE.Vector3()) {
    const a = -(x - PX);
    const b = z - PZ;
    out.copy(this.R).addScaledVector(this.tg, a).addScaledVector(this.n, b);
    out.y = this.my + y;
    return out;
  }

  // ...y de este al de allá (x, z)
  back(p) {
    tmpS.subVectors(p, this.R);
    return [PX - tmpS.dot(this.tg), PZ + tmpS.dot(this.n)];
  }

  // un punto en el piso (del lugar de allá)
  F(x, z) {
    const p = this.M(x, 0, z);
    p.y = this.C.floor(p.x, p.z);
    return p;
  }

  // ---------------- armado ----------------
  build() {
    const g = this.g;
    const w = g.world;
    this.place();
    this.L = this.base.L.clone();
    this.f = this.base.f.clone();
    this.events = [];
    this.backs = [];
    this.side = 'noche';
    // lo de la partida, fuera de cuadro
    this.hidden0 = [];
    const hide = (o) => {
      if (o && o.visible) {
        o.visible = false;
        this.hidden0.push(o);
      }
    };
    hide(g.zombies?.root);
    hide(g.net?.avatars?.root);
    // los cuatro y el Gil
    const C = (this.C = new CineActors(g, { base: 560, parent: this.root }));
    const base = C.clipOf.bind(C);
    C.clipOf = (name) => sableClips()?.[name] || base(name);
    const SLOT = { viejo: 0, valiente: 1, canchero: 2, miedoso: 3 };
    this.Bw = this.M(BX, 0, BZ);
    for (const r of C.list) {
      const s = SLOT[r.persona] - 1.5;
      r.pos.copy(this.F(BX - 3.0 - ROW_BACK - Math.abs(s) * 0.35, BZ + s * 1.15));
      r.yaw = yawTo(r.pos, this.Bw) + s * 0.04;
      if (this.real && r.persona === 'canchero') {
        r.pos.copy(this.F(102.45, 31.1));
        r.yaw = yawTo(r.pos, this.Bw);
      }
    }
    const b = C.by;
    b.canchero.mate = true;
    C.act(b.valiente, 'chestHand', { loop: true });
    C.act(b.viejo, 'chestHand', { loop: true });
    C.act(b.miedoso, 'pray', { loop: true, look: 0.15 });
    C.act(b.canchero, 'cebar', { loop: true });
    this.buildGil();
    C.show = C.show || (() => {});
    this.crewOn(false);
    // los dos desgarros: el de Eclipse (adentro, el Monumento al alba) y el del
    // otro lado (el del Monumento: violeta y negro)
    const er = (this.eRift = makeRift(this.real ? 'monumentoNoche' : 'monumento'));
    er.root.position.copy(this.eR).add(tmpV.set(0, 0.01, 0));
    er.root.rotation.y = this.eth;
    this.root.add(er.root);
    this.buildMonRift();
    this.buildSable();
    if (this.real) {
      this.buildMast();
      this.buildBel();
      this.buildCity();
    }
    // el cielo del alba (escondido hasta el otro lado)
    this.dome = makeDome();
    this.dome.visible = false;
    // (más chico: a 75 m tapa las otras islas, que con la niebla del alba
    // quedaban como siluetas claras flotando en el cielo)
    {
      const dm = this.dome;
      // ((G1) de noche, entero: la ciudad y la isla del río van adentro)
      const K = this.real ? 1 : 75 / 280;
      dm.onBeforeRender = (_r, _s, cam) => {
        const e = cam.matrixWorld.elements;
        dm.matrixWorld.makeScale(K, K, K).setPosition(e[12], e[13], e[14]);
      };
    }
    setSky(this.dome, 'alba', new THREE.Vector3(...ALBA.dir).normalize());
    if (this.real) {
      // el cielo del Monumento de noche (world/Sky con SKY de allá: el cenit
      // casi negro, el horizonte violáceo con el resplandor de la ciudad)
      setSky(this.dome, 'noche', null, new THREE.Vector3(0, -1, 0));
      const U = this.dome.userData.U;
      U.uTop.value.setRGB(0.006, 0.009, 0.022);
      U.uMid.value.setRGB(0.02, 0.022, 0.042);
      U.uHor.value.setRGB(0.085, 0.066, 0.088);
      U.uGround.value.setRGB(0.012, 0.014, 0.02);
      U.uMoonK.value = 0;
    }
    this.root.add(this.dome);
    this.base0 = this.saveLook();
    const sc = g.scene;
    this.sceneBR = sc.onBeforeRender;
    sc.onBeforeRender = (...a) => {
      this.sceneBR?.apply(sc, a);
      if (!this.done && this.side === 'alba') this.applyAlba();
    };
    this.llamaK = 0;
    this.llamaV = 0;
    this.schedule();
    warmScene(g);
    return [[0, () => this.total]];
  }

  buildGil() {
    const C = this.C;
    const r = { id: GIL_ID, name: 'Antonio Gil', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'gil', dead: false };
    // donde estaba el que prendió la Llama, mirando al desgarro
    r.pos.copy(this.base.L).addScaledVector(this.base.f, 1.4);
    r.pos.y = C.floor(r.pos.x, r.pos.z);
    r.yaw = yawTo(r.pos, this.eR);
    C.people.add(r);
    const a = C.people.list.get(r.id);
    a.M.poncho.color.set(SB.PONCHO_GIL).multiplyScalar(1.7);
    r.a = a;
    r.mate = false;
    C.list.push(r);
    C.by.gil = r;
    C.act(r, 'gilStand', { loop: true });
    this.gil = r;
  }

  // (G1) El mástil de la barranca con la Bandera ya izada (entities/monumento/
  // Bandera buildMastil: acá no está, lo arma la misión de allá).
  buildMast() {
    const M = this.g.world.M;
    const [mx, mz] = MON_EE.mastil;
    const grp = (this.mast = new THREE.Group());
    grp.name = 'tripMastil';
    grp.position.copy(this.F(mx, mz));
    const trav = M.travertino || new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9 });
    const bronze = M.bronze || new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.5, metalness: 0.7 });
    const own = (this.mastOwn = []);
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      grp.add(m);
      own.push(geo);
      return m;
    };
    add(new THREE.CylinderGeometry(0.62, 0.72, 0.45, 8), trav, 0, 0.22, 0);
    add(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 8), trav, 0, 0.75, 0);
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4, metalness: 0.2 });
    add(new THREE.CylinderGeometry(0.06, 0.1, MAST_H, 10), white, 0, 1.05 + MAST_H / 2, 0);
    add(new THREE.SphereGeometry(0.13, 12, 10), bronze, 0, 1.05 + MAST_H + 0.1, 0);
    const rope = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 1 });
    add(new THREE.CylinderGeometry(0.008, 0.008, MAST_H, 4), rope, 0.11, 1.05 + MAST_H / 2, 0);
    // la Bandera arriba, con sus pliegues (quieta: se ve de lejos, al final)
    const fg = new THREE.PlaneGeometry(1.5, 0.95, 14, 4).translate(0.75 + 0.08, 0, 0);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      fp.setZ(i, 0.07 * Math.sin(x * 4.2) * (x / 1.5));
      fp.setY(i, fp.getY(i) - 0.05 * (x / 1.5) ** 2);
    }
    fg.computeVertexNormals();
    const flag = add(fg, new THREE.MeshStandardMaterial({ map: banderaTexture({ seams: true }), roughness: 0.85, side: THREE.DoubleSide }), 0, 1.05 + MAST_H - 0.62, 0);
    flag.material.userData.own = true;
    this.mastMats = [white, rope, flag.material];
    grp.rotation.y = -Math.PI / 2;
    grp.visible = false;
    this.root.add(grp);
  }

  // (G1) El ánima de Belgrano, donde está en el final del Monumento (ui/
  // MonumentoEnding buildBelgrano): azul y transparente, sin sombrero.
  buildBel() {
    const C = this.C;
    const pos = this.F(BX, BZ);
    const r = { id: BELGRANO_ID, name: '', noTag: true, pos, yaw: 0, pitch: 0, speed: 0, moving: false, ghost: true, dead: true };
    const a = addPerson(C.people, r, (x) => belgranoSkin(x));
    const coat = new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7, transparent: true });
    a.M.coat = coat;
    if (a.M.pants) a.M.pants.color.set(0xe8e4d8);
    a.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === a.M.hat || o.material === a.M.band) o.visible = false;
      if (o.material === a.M.poncho) o.material = coat;
    });
    for (const q of a.parts || []) if (q.material === a.M.poncho) q.material = coat;
    r.yaw = yawTo(pos, this.F(102.45, 31.1));
    r.poseFn = (P) => this.belPose(P);
    this.bel = { r, a, nod: 0, lookAt: null, cur: {} };
  }

  belPose(P) {
    const b = this.bel;
    const t = this.t;
    const T = { headP: 0.05 + (b.nod || 0), torsoP: 0.03 * Math.sin(t * 1.6), torsoR: 0.035 * Math.sin(t * 0.55), headY: 0.07 * Math.sin(t * 0.37 + 1), headR: -0.02 * Math.sin(t * 0.55), shLp: -0.1 + 0.04 * Math.sin(t * 1.6 + 0.4), shLr: 0.12 + 0.03 * Math.sin(t * 0.8), elL: -0.34 + 0.05 * Math.sin(t * 0.8 + 0.6), elR: -0.26 + 0.04 * Math.sin(t * 0.7 + 1.3), shRp: -0.06 };
    for (const key of Object.keys(T)) P[key] = T[key];
  }

  belTick(dt, t) {
    const b = this.bel;
    if (!b) return;
    const on = this.side === 'alba';
    b.r.dead = !on;
    if (!on) return;
    const bm = b.a.M.belgrano;
    if (bm && !b.look) {
      b.look = true;
      bm.transparent = true;
      bm.depthWrite = false;
      bm.emissive.set(0x2a70c8);
      bm.emissiveIntensity = 0.9;
    }
    for (const m of Object.values(b.a.M)) m.opacity = 0.42;
    if (bm) bm.opacity = 0.55;
    // mira al Canchero, que le convidó; al Gil mientras está
    const tgt = b.lookAt && !this.gil.dead ? this.gil.pos : this.C.by.canchero.pos;
    b.r.yaw += wrapA(yawTo(b.r.pos, tgt) - b.r.yaw) * Math.min(1, dt * 3);
    // asiente cuando el Gil alza el sable (ui/monumentoSableBeat nodAt)
    if (this.nodAt === true) this.nodAt = t;
    const k = this.nodAt != null ? clamp01((t - this.nodAt) / 2.1) : 0;
    b.nod = 0.36 * smoothW(k, 0, 0.32) * (1 - smoothW(k, 0.68, 1));
  }

  // (G1) La ciudad y el río de allá, alrededor de la isla: las calles Córdoba
  // y Santa Fe con sus edificios de ventanas prendidas (el mismo constructor,
  // en un mundo prestado que arma en este grupo, corrido como la isla), el
  // Paraná negro, la barranca y la isla de enfrente. Solo se ve del otro lado.
  buildCity() {
    const g = this.g;
    const w = g.world;
    const G = (this.city = new THREE.Group());
    G.name = 'tripCiudad';
    G.position.set(this.real.dx, this.real.dy, this.real.dz);
    G.visible = false;
    this.root.add(G);
    const own = (this.cityOwn = []);
    const flat = (x0, x1, z0, z1, ya, yb, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, ya, z1, x1, yb, z1, x1, yb, z0, x0, ya, z0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4, x0 / 4, z0 / 4], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      G.add(m);
      own.push(geo);
      return m;
    };
    const M = w.M;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c171c, roughness: 0.28, metalness: 0.35 });
    this.cityMats = [dark];
    // el río, hasta la isla; la barranca en pendiente y la Costanera
    flat(107.8, 420, -340, 400, RIVER_Y, RIVER_Y, dark);
    flat(104.6, 108, 4, 57, -2.62, -4.4, M.grass || dark);
    flat(108, 113.2, 4, 57, -4.4, -4.4, M.baldosa || M.grass || dark);
    // la isla de enfrente: una franja baja de monte
    {
      const shoreX = 330;
      flat(shoreX, shoreX + 80, -340, 400, RIVER_Y + 0.6, RIVER_Y + 0.6, M.grass || dark);
      const N = 240;
      const tg = new THREE.CylinderGeometry(0.4, 0.7, 1, 5);
      const cg = new THREE.IcosahedronGeometry(1, 0);
      own.push(tg, cg);
      const leaf = new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 });
      this.cityMats.push(leaf);
      const trunk = new THREE.InstancedMesh(tg, leaf, N);
      const crown = new THREE.InstancedMesh(cg, leaf, N);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let sd = 1812;
      const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < N; i++) {
        const x = shoreX + 4 + r() * 60;
        const z = -320 + r() * 700;
        const h = 8 + r() * 10;
        m4.compose(new THREE.Vector3(x, RIVER_Y + 0.6 + h / 2, z), q, new THREE.Vector3(1, h, 1));
        trunk.setMatrixAt(i, m4);
        const c = 4 + r() * 5;
        m4.compose(new THREE.Vector3(x, RIVER_Y + 0.6 + h, z), q, new THREE.Vector3(c, c * 0.7, c));
        crown.setMatrixAt(i, m4);
      }
      trunk.frustumCulled = crown.frustumCulled = false;
      G.add(trunk, crown);
    }
    // la ciudad (el módulo del Monumento baja aparte: la escena arranca del lado de Eclipse)
    import('../world/monumentoCity')
      .then(({ buildCiudad }) => {
        if (this.done || !this.city) return;
        const before = new Set(G.children);
        const w2 = Object.create(w);
        w2.root = G;
        w2.mon = {};
        try {
          buildCiudad(w2);
        } catch {
          /* sin la ciudad: quedan el río y la noche */
        }
        for (const o of G.children) {
          if (before.has(o)) continue;
          o.traverse((m) => m.geometry && own.push(m.geometry));
        }
        warmScene(g);
      })
      .catch(() => {});
  }

  // (G1) Los faroles de poste de Eclipse en el Parque (world/eclipseGfx: allá
  // no están): apagados y sin halo mientras se ve el otro lado. Los del config
  // —las farolas del Monumento— quedan.
  parqueLamps(on) {
    const g = this.g;
    const w = g.world;
    const R = ZONES.mG?.rects?.[0];
    if (!R || !w.lights) return;
    if (!on && !this.lampsOff) {
      this.lampsOff = [];
      const halos = g.fx?.ambience?.lamps || g.ambience?.lamps || [];
      for (const e of w.lights) {
        const p = e.def?.pos;
        if (!p || LIGHTS.includes(e.def)) continue;
        const x = p[0];
        const z = p.length > 2 ? p[2] : p[1];
        if (x < R[0] - 1.5 || x > R[2] + 2.5 || z < R[1] - 1.5 || z > R[3] + 2.5) continue;
        const h = halos.find((q) => q.e === e);
        this.lampsOff.push({ e, base: e.base, target: e.target, i: e.light.intensity, h, hv: h?.halo?.visible, cv: h?.cone?.visible });
        e.base = 0;
        e.target = 0;
        e.light.intensity = 0;
        if (h?.halo) h.halo.visible = false;
        if (h?.cone) h.cone.visible = false;
      }
    } else if (on && this.lampsOff) {
      for (const o of this.lampsOff) {
        o.e.base = o.base;
        o.e.target = o.target;
        o.e.light.intensity = o.i;
        if (o.h?.halo) o.h.halo.visible = o.hv;
        if (o.h?.cone) o.h.cone.visible = o.cv;
      }
      this.lampsOff = null;
    }
  }

  // (los cuatro: del otro lado nada más)
  crewOn(on) {
    for (const r of this.C.list) if (r !== this.gil) r.dead = !on;
    if (this.bel) this.bel.r.dead = !on;
  }

  buildMonRift() {
    const root = (this.mRift = new THREE.Group());
    root.position.copy(this.R).add(tmpV.set(0, 0.01, 0));
    root.rotation.y = this.th;
    root.visible = false;
    const U = (this.mU = { uT: { value: 0 }, uOpen: { value: 0 }, uCrack: { value: 0 }, uFlash: { value: 0 } });
    const mk = (wd, h, frag, o) => {
      const geo = new THREE.PlaneGeometry(wd, h).translate(0, h / 2, 0);
      const m = new THREE.ShaderMaterial({ uniforms: { ...U, uSize: { value: new THREE.Vector2(wd, h) } }, vertexShader: SB.RIFT_VERT, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...o });
      return new THREE.Mesh(geo, m);
    };
    const glow = mk(3.2, SB.RIFT_H + 0.6, SB.GLOW_FRAG, { blending: THREE.AdditiveBlending });
    const core = mk(1.9, SB.RIFT_H, SB.RIFT_FRAG, {});
    core.renderOrder = 2;
    glow.renderOrder = 1;
    const fg = new THREE.PlaneGeometry(3.6, 2.4).rotateX(-Math.PI / 2).translate(0, 0.012, 0.35);
    const fl = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SB.RIFT_VERT, fragmentShader: SB.FLOOR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    root.add(glow, core, fl);
    this.mParts = [glow, core, fl];
    this.root.add(root);
  }

  buildSable() {
    const s = (this.sable = new THREE.Group());
    s.matrixAutoUpdate = false;
    const m = sableModel(0);
    s.add(m);
    const bb = new THREE.Box3().setFromObject(m);
    this.sableLow = -bb.min.z;
    this.root.add(s);
    this.V = this.F(PX, 29.1);
    this.G = this.F(PX, 29.1 - SB.DIST);
    this.P = this.R.clone();
    const o = SB.V_GROUND;
    this.Sground = this.authorM(this.V, this.th, o, new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1));
    this.Sground.elements[13] = this.V.y + this.sableLow + 0.002;
    this.S = new THREE.Matrix4().copy(this.Sground);
    this.Sfrom = new THREE.Matrix4();
    this.state = 'ground';
    s.visible = false;
    this.place2();
  }

  authorM(pos, yaw, o, ex, ey, ez) {
    const toW = (v, out) => out.set(v.x ?? v[0], v.z ?? v[2], -(v.y ?? v[1])).applyAxisAngle(UP, yaw + Math.PI);
    const X = toW(ex, new THREE.Vector3());
    const Y = toW(ey, new THREE.Vector3());
    const Z = toW(ez, new THREE.Vector3());
    const Mx = new THREE.Matrix4().makeBasis(X, Y, Z);
    const t = toW({ x: o[0], y: o[1], z: o[2] }, new THREE.Vector3()).add(pos);
    return Mx.setPosition(t);
  }

  place2() {
    this.sable.matrix.copy(this.S);
    this.sable.matrixWorldNeedsUpdate = true;
  }

  // ---------------- la luz ----------------
  saveLook() {
    const g = this.g;
    const w = g.world;
    const m = w.moon;
    return {
      moon: m && { c: m.color.clone(), i: m.intensity, p: m.position.clone(), tp: m.target.position.clone() },
      hemi: w.hemi && { c: w.hemi.color.clone(), gc: w.hemi.groundColor.clone(), i: w.hemi.intensity },
      amb: w.ambient && { c: w.ambient.color.clone(), i: w.ambient.intensity },
      fog: g.scene.fog && { c: g.scene.fog.color.clone(), d: g.scene.fog.density },
    };
  }

  applyAlba() {
    const g = this.g;
    const w = g.world;
    const L0 = this.real ? NOCHE : ALBA;
    const m = w.moon;
    if (m) {
      m.color.set(L0.sun);
      m.intensity = L0.sunI;
      m.target.position.copy(this.R);
      m.target.updateMatrixWorld();
      m.position.copy(this.R).addScaledVector(tmpV.set(...L0.dir).normalize(), 120);
    }
    if (w.hemi) {
      w.hemi.color.set(L0.hs);
      w.hemi.groundColor.set(L0.hg);
      w.hemi.intensity = L0.hI;
    }
    if (w.ambient) {
      w.ambient.color.set(L0.amb);
      w.ambient.intensity = L0.ambI;
    }
    const f = g.scene.fog;
    if (f) {
      f.color.set(L0.fog);
      if (f.density != null) f.density = L0.fogD;
    }
    if (g.eclMood) g.eclMood.grade = this.real ? GRADE_NOCHE : GRADE_ALBA;
    // (la cámara no ve más allá del cielo del alba: las otras islas quedaban
    // en la profundidad y los efectos de Épica dibujaban su sombra en el cielo)
    // ((G1) de noche no hace falta: lo de lejos es la ciudad, y el cielo lo tapa)
    const cam = g.camera;
    if (!this.real && cam.far !== FAR_ALBA) {
      if (this.far0 == null) this.far0 = cam.far;
      cam.far = FAR_ALBA;
      cam.updateProjectionMatrix();
    }
  }

  restoreLook() {
    const g = this.g;
    const w = g.world;
    const B0 = this.base0;
    if (!B0) return;
    const m = w.moon;
    if (m && B0.moon) {
      m.color.copy(B0.moon.c);
      m.intensity = B0.moon.i;
      m.position.copy(B0.moon.p);
      m.target.position.copy(B0.moon.tp);
      m.target.updateMatrixWorld();
    }
    if (w.hemi && B0.hemi) {
      w.hemi.color.copy(B0.hemi.c);
      w.hemi.groundColor.copy(B0.hemi.gc);
      w.hemi.intensity = B0.hemi.i;
    }
    if (w.ambient && B0.amb) {
      w.ambient.color.copy(B0.amb.c);
      w.ambient.intensity = B0.amb.i;
    }
    if (g.scene.fog && B0.fog) {
      g.scene.fog.color.copy(B0.fog.c);
      g.scene.fog.density = B0.fog.d;
    }
  }

  // De este lado o del otro: el cielo, lo que es solo de Eclipse, los cuatro.
  setSide(k) {
    const g = this.g;
    const w = g.world;
    this.side = k;
    const alba = k === 'alba';
    this.dome.visible = alba;
    if (alba) {
      this.away = [];
      const add = (o) => {
        if (o && o.visible) {
          o.visible = false;
          this.away.push(o);
        }
      };
      add(w.sky);
      // (las otras islas: lo que no toca la del Monumento, escondido; se ve
      // en blanco, así que la cuenta no se nota)
      const IB = ISLANDS.monumento?.box;
      if (IB) {
        const bb = new THREE.Box3();
        const far = (o) => {
          bb.setFromObject(o);
          if (bb.isEmpty()) return false;
          return bb.max.x < IB[0] - 12 || bb.min.x > IB[2] + 12 || bb.max.z < IB[1] - 12 || bb.min.z > IB[3] + 12;
        };
        for (const o of [...w.root.children, ...g.scene.children]) {
          if (o === this.root || o === w.root || o.isLight || o.isCamera || !o.visible) continue;
          if (far(o)) {
            add(o);
            continue;
          }
          // (un nivel más adentro: los grupos de cada isla)
          if (o.isGroup && o.children.length < 400) for (const c of o.children) if (c.visible && !c.isLight && far(c)) add(c);
        }
      }
      g.scene.traverse((o) => {
        if (o === this.root || !o.name || !(ECLIPSE_ONLY.test(o.name) || (this.real && PARQUE_ONLY.test(o.name)))) return;
        // (solo los de arriba: no lo de adentro de algo ya escondido)
        for (let q = o.parent; q; q = q.parent) if (this.away.includes(q)) return;
        add(o);
      });
      // la Llama del pebetero: del otro lado no está prendida todavía
      const fire = w.eclipseArt?.llamaFire;
      if (fire?.visible) add(fire);
    } else {
      for (const o of this.away || []) o.visible = true;
      this.away = [];
      if (this.far0 != null) {
        g.camera.far = this.far0;
        g.camera.updateProjectionMatrix();
        this.far0 = null;
      }
      this.restoreLook();
      g.renderer.shadowMap.needsUpdate = true;
    }
    this.eRift.root.visible = !alba && this.eOpen != null;
    this.mRift.visible = alba && this.mOpen != null;
    if (this.mast) this.mast.visible = alba;
    if (this.city) this.city.visible = alba;
    if (this.real) this.parqueLamps(!alba);
    this.crewOn(alba);
  }

  // ---------------- el guion ----------------
  ev(t, fn) {
    this.events.push({ t, fn });
  }

  schedule() {
    const g = this.g;
    const C = this.C;
    const b = C.by;
    const gil = this.gil;
    const R = this.R;
    const n = this.n;
    const my = this.my;
    const ev = (t, fn) => this.ev(t, fn);
    const act = (r, clip, o = {}) => () => r && C.act(r, clip, o);
    const pd = (k) => PERSONA_T[k]?.delay || 0;
    const shot = (dur, fn) => this.shot(dur, fn);
    // ---- 1. Eclipse, de noche: la Llama crece y se abre el desgarro ----
    const eR = this.eR;
    const en = this.en;
    const ey = eR.y;
    const mid = this.L.clone().add(eR).multiplyScalar(0.5);
    mid.y = ey;
    // (de costado a la línea Llama-desgarro, del lado al que mira el desgarro:
    // los dos a la vista, uno al lado del otro, sin que la Llama tape la raja)
    const lr = eR.clone().sub(this.L).setY(0).normalize();
    const perp = new THREE.Vector3(-lr.z, 0, lr.x);
    if (perp.dot(en) < 0) perp.negate();
    const camA = this.camFor(mid, [this.L, eR, gil.pos], perp, Math.max(4.2, this.L.distanceTo(eR) * 1.1), [gil.pos]);
    ev(0, () => {
      shot(3.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(camA).lerp(mid, 0.12 * k);
        pos.y = ey + lerp(1.9, 1.75, k);
        look.copy(mid).setY(ey + lerp(1.6, 1.4, k));
      });
      this.llamaK = 1;
      g.fx.flash(tmpV.copy(this.L).setY(this.L.y + 1.8), 0xffb060, 26, 0.7, 10);
      g.fx.sparkle(tmpV.copy(this.L).setY(this.L.y + 1.6), [1, 0.7, 0.35], 24, 0.7);
      this.sfx('llama', this.L);
    });
    ev(0.9, () => {
      this.eOpen = { t: 0.9, d: 99 };
      this.eRift.root.visible = true;
      this.sfx('crack', eR);
    });
    ev(1.5, () => {
      this.eOpen = { t: 1.5, d: 1.7 };
      this.eFlash = 1;
      g.fx.flash(tmpV.copy(eR).setY(ey + 1.6), 0xd070ff, 30, 0.6, 12);
      g.fx.sparkle(tmpV.copy(eR).setY(ey + 1.5), [0.85, 0.45, 1], 30, 1);
      this.sfx('tear', eR);
    });
    // del otro lado, el clarín de los Granaderos
    ev(2.4, () => g.audio.bugle?.(tmpV.copy(eR).addScaledVector(en, -6).setY(ey + 2)));
    // ---- 2. el Gil va hasta el desgarro y entra ----
    const front = eR.clone().addScaledVector(en, 1.0);
    front.y = C.floor(front.x, front.z);
    const inside = eR.clone().addScaledVector(en, -0.15);
    inside.y = ey;
    const walkLen = gil.pos.distanceTo(front) + 1.15;
    const V_IN = 1.1;
    const T_GO = 3.0;
    const T_IN = T_GO + walkLen / V_IN;
    ev(2.2, () => C.turnTo(gil, eR, 0.8));
    ev(T_GO, () => {
      C.walkPath(gil, [front, inside], V_IN, 'gilStand', { loop: true });
    });
    // (por detrás, sobre el hombro: el desgarro adelante)
    // (de tres cuartos, del lado de afuera de la Llama: el Gil de perfil
    // entrando a la raja; por detrás lo tapaba el pebetero)
    const awayL = this.etg.dot(tmpV.subVectors(eR, this.L)) >= 0 ? 1 : -1;
    const sideN = en.clone().multiplyScalar(0.75).addScaledVector(this.etg, awayL * 0.66).normalize();
    const atB = eR.clone().addScaledVector(en, 0.5);
    const camIn = this.camFor(atB, [eR, front], sideN, 3.4, [this.L]);
    ev(3.3, () => {
      shot(T_IN - 3.3 + 0.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(camIn).lerp(atB, 0.08 * k);
        pos.y = ey + lerp(1.65, 1.55, k);
        look.copy(gil.pos).lerp(eR, 0.55).setY(ey + 1.3);
      });
    });
    ev(T_IN - 0.2, () => {
      this.white(true);
      this.sfx('close', eR);
    });
    const O0 = T_IN + 0.35;
    ev(T_IN + 0.15, () => {
      gil.dead = true;
      this.setSide('alba');
    });
    ev(O0 + 0.05, () => this.white(false));
    // ---- 3. del otro lado (la del Monumento, cuadro por cuadro) ----
    const M = (x, y, z) => this.M(x, y, z);
    const P = this.P;
    const V = this.V;
    const G = this.G;
    const o = (t, fn) => ev(O0 + t, fn);
    this.O0 = O0;
    // ((G1) con Belgrano, los tiempos de allá: la pausa con el sable en alto y
    // su saludo. ui/monumentoSableBeat LIFT_X y NOD_X)
    const x1 = this.real ? 0.5 : 0;
    const x2 = this.real ? 0.5 + 1.9 : 0;
    o(0, () => {
      shot(2.4, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(M(lerp(102.25, 101.95, k), lerp(1.5, 1.45, k), lerp(28.15, 27.8, k)));
        look.copy(P).setY(my + 1.35);
      });
      this.mOpen = { t: 0, d: 99 };
      this.mRift.visible = true;
      this.sfx('crack', P);
    });
    o(0.55, () => {
      this.mOpen = { t: 0.55, d: 1.5 };
      this.mFlash = 1;
      g.fx.flash(tmpV.copy(P).setY(my + 1.3), 0xd070ff, 30, 0.6, 12);
      g.fx.sparkle(tmpV.copy(P).setY(my + 1.2), [0.85, 0.45, 1], 30, 0.9);
      this.sfx('tear', P);
    });
    o(0.7 + pd('valiente'), act(b.valiente, 'flinch', { fade: 0.2 }));
    o(0.7 + pd('miedoso'), act(b.miedoso, 'duck', { fade: 0.15 }));
    o(0.7 + pd('canchero'), () => C.turnTo(b.canchero, P));
    o(0.5 + pd('viejo'), () => C.turnTo(b.viejo, P, 0.7));
    o(1.25 + pd('viejo'), act(b.viejo, 'stagger', { fade: 0.3 }));
    o(1.75, () => {
      b.canchero.mate = false;
      C.act(b.canchero, 'dust', { fade: 0.4 });
    });
    o(2.1, () => C.walkTo(b.valiente, V, 1.2, 'fists', { loop: true, fade: 0.4 }));
    o(2.4, () => {
      shot(2.2, (u, lt, pos, look) => {
        pos.copy(M(lerp(100.95, 100.85, u), 1.3, lerp(26.75, 26.6, u)));
        look.copy(M(99.95, 1.05, 30.0));
      });
    });
    o(2.42, act(b.miedoso, 'cower', { loop: true, fade: 0.5 }));
    o(2.75 + pd('viejo'), () => {
      this.settle(b.viejo, 'stagger');
      this.stepBack(b.viejo, 0.7, 1.2);
    });
    o(3.35, () => C.turnTo(b.valiente, this.F(PX, PZ - 1), 0.9));
    o(3.75, () => {
      b.canchero.mate = true;
      C.act(b.canchero, 'cebar', { loop: true, fade: 0.5 });
    });
    // sale el Gil
    o(4.3, () => {
      gil.dead = false;
      gil.pos.copy(this.F(PX, PZ - 0.45));
      gil.yaw = Math.PI + this.th;
      gil.mv = null;
      C.walkTo(gil, G, 2.9, 'gilStand', { loop: true, fade: 0.4 });
    });
    o(4.6, () => {
      shot(2.2, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(M(lerp(101.45, 101.4, k), lerp(1.6, 1.55, k), lerp(29.55, 29.45, k)));
        look.copy(M(PX, 1.15, lerp(26.4, this.back(gil.pos)[1], k)));
      });
    });
    o(4.3, () => this.bel && (this.bel.lookAt = true));
    o(15.15 + 0.5 + 0.45, () => (this.nodAt = true));
    o(4.9, () => g.fx.sparkle(tmpV.copy(gil.pos).setY(my + 1.0), [0.9, 0.5, 1], 14, 0.6));
    o(5.4, act(b.valiente, 'chestHand', { loop: true, fade: 0.6 }));
    o(5.4 + pd('miedoso'), () => C.turnTo(b.miedoso, gil.pos));
    o(5.75, act(b.miedoso, 'santiguar', { fade: 0.5 }));
    o(5.3, () => C.turnTo(b.viejo, gil.pos));
    o(5.9, act(b.viejo, 'kneelDown', { fade: 0.5 }));
    o(6.9, act(b.viejo, 'kneelHold', { loop: true, fade: 0.35 }));
    // el Valiente se arrodilla y levanta el sable
    o(6.1, act(b.valiente, 'sableKneel', { fade: 0.4 }));
    o(6.8, () => {
      shot(2.6, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(M(lerp(98.85, 98.95, k), lerp(1.35, 1.3, k), lerp(27.0, 27.15, k)));
        look.copy(M(100.4, lerp(1.0, 0.95, k), 28.8));
      });
    });
    o(7.75, act(b.miedoso, 'pray', { loop: true, look: 0.15, fade: 0.6 }));
    o(9.1, act(b.valiente, 'sablePresent', { loop: true, fade: 0.15 }));
    // el Gil lo toma
    const TK = 9.25;
    o(TK, () => {
      gil.yaw = Math.PI + this.th;
      gil.pos.x = G.x;
      gil.pos.z = G.z;
      gil.mv = null;
      C.act(gil, 'gilTake', { fade: 0.4 });
    });
    o(9.4, () => {
      shot(1.8, (u, lt, pos, look) => {
        pos.copy(M(lerp(101.6, 101.5, u), lerp(1.3, 1.28, u), lerp(29.45, 29.4, u)));
        look.copy(M(100.22, 0.97, 28.6));
      });
    });
    o(TK + SB.TRANSFER, act(b.valiente, 'sableRise', { fade: 0.15 }));
    o(TK + SB.TRANSFER + 0.05, () => this.sfx('take', V));
    o(11.2, () => {
      shot(2.2, (u, lt, pos, look) => {
        pos.copy(M(lerp(101.3, 101.25, u), lerp(1.45, 1.5, u), lerp(29.45, 29.5, u)));
        look.copy(M(PX, 1.35, 28.15));
      });
    });
    o(TK + 2.6, () => this.say('gil', SB.LINE));
    o(TK + 3.7, () => this.stepBack(b.valiente, 0.6, 1.0, 'fistUp'));
    // lo alza: todos (de atrás de la fila)
    o(13.4, () => {
      shot(1.7 + x1, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(M(lerp(102.3, 102.2, k), lerp(1.45, 1.5, k), lerp(29.6, 29.5, k)));
        look.copy(M(100.35, lerp(1.7, 1.95, k), 28.1));
      });
    });
    o(14.3, () => this.quiet());
    if (this.real) {
      // Belgrano lo saluda: una inclinación de cabeza lenta, con la cámara que
      // se le acerca (la toma de allá)
      o(15.0, () => {
        b.canchero.mate = false;
        C.act(b.canchero, 'cool', { loop: true, fade: 0.5 });
      });
      o(15.1 + x1, () => {
        shot(1.0 + 1.9, (u, lt, pos, look) => {
          const k = smooth(u);
          pos.copy(M(lerp(101.0, 101.3, k), 1.45, lerp(28.7, 29.0, k)));
          look.copy(M(103.0, 1.55, 30.75));
        });
      });
    } else {
      // (allá Belgrano asentía: acá, los de la fila contestan)
      o(14.6, () => {
        b.canchero.mate = false;
        C.act(b.canchero, 'cancheroOk', { fade: 0.4 });
      });
      o(15.1, () => {
        shot(1.0, (u, lt, pos, look) => {
          pos.copy(M(lerp(97.55, 97.6, u), 1.55, lerp(29.9, 30.0, u)));
          look.copy(M(99.7, 1.25, 30.25));
        });
      });
    }
    o(15.2, act(b.viejo, 'brimBow', { fade: 0.5 }));
    // se da vuelta y vuelve por el desgarro
    o(TK + 6.85 + x2, () => {
      const pts = [this.F(PX + 0.48, 28.25 - 0.3), this.F(PX + 0.28, 28.25 - 1.05), this.F(PX + 0.02, PZ + 0.55), this.F(PX, PZ), this.F(PX, PZ - 0.8)];
      C.walkPath(gil, pts, 1.15, 'gilWalkSable', { loop: true });
      C.act(gil, 'gilWalkSable', { loop: true, fade: 0.6, rate: 0 });
    });
    o(16.0 + x2, () => {
      shot(3.9, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(M(lerp(101.35, 101.2, k), lerp(1.55, 1.5, k), lerp(29.45, 29.2, k)));
        look.copy(M(PX, 1.15, lerp(26.6, 26.0, k)));
      });
    });
    o(16.6 + x2, act(b.valiente, 'chestHand', { loop: true, fade: 0.6 }));
    o(17.1 + x2, act(b.miedoso, 'wave', { fade: 0.6 }));
    o(17.3 + x2, () => {
      b.canchero.mate = true;
      C.act(b.canchero, 'cebar', { loop: true, fade: 0.5 });
    });
    // ---- 4. de vuelta en Eclipse, con el Sable ----
    // (cuando entra: del otro lado ya no está; la hora, fija, para que en
    // línea todos cambien a la vez: el camino de vuelta tarda lo mismo siempre)
    const T_BACK = O0 + 18.6 + x2;
    ev(T_BACK - 0.25, () => {
      this.white(true);
      this.mClose = T_BACK - 0.25;
      this.sfx('close', P);
    });
    const camB = this.camFor(eR.clone().addScaledVector(en, 1.0), [eR], en, 3.6);
    ev(T_BACK + 0.15, () => {
      this.setSide('noche');
      gil.mv = null;
      gil.dead = false;
      gil.pos.copy(eR).addScaledVector(en, -0.2);
      gil.pos.y = ey;
      gil.yaw = Math.atan2(-en.x, -en.z);
      const out = eR.clone().addScaledVector(en, 1.6);
      out.y = C.floor(out.x, out.z);
      C.walkPath(gil, [out], 1.0, 'gilStand', { loop: true, fade: 0.5 });
      C.act(gil, 'gilWalkSable', { loop: true, fade: 0.2, rate: 0 });
      this.eOpen = { t: -99, d: 0.1 };
      shot(4.2, (u, lt, pos, look) => {
        const k = smooth(u);
        pos.copy(camB).lerp(gil.pos, 0.1 * k);
        pos.y = ey + lerp(1.55, 1.6, k);
        look.copy(gil.pos).setY(ey + 1.35);
      });
    });
    ev(T_BACK + 0.4, () => this.white(false));
    ev(T_BACK + 2.4, () => {
      this.eClose = T_BACK + 2.4;
      this.sfx('close', eR);
    });
    this.total = T_BACK + 4.4;
    this.events.sort((x, y) => x.t - y.t);
  }

  settle(r, name) {
    const c = this.C.clipOf(name);
    if (!c) return;
    const k = c.n - 1;
    const h = c.hips;
    tmpV.set(h[k * 3] - h[0], 0, h[k * 3 + 2] - h[2]).applyAxisAngle(UP, r.yaw + Math.PI);
    r.pos.add(tmpV);
    r.pos.y = this.C.floor(r.pos.x, r.pos.z);
  }

  stepBack(r, dist, dur, then = 'chestHand') {
    const fw = tmpV.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
    this.backs.push({ r, from: r.pos.clone(), to: r.pos.clone().addScaledVector(fw, -dist), t: 0, dur, then });
    this.C.act(r, 'back', { loop: true, fade: 0.35, rate: 0 });
  }

  // ---------------- cada cuadro ----------------
  tick(dt, t) {
    const g = this.g;
    const C = this.C;
    while (this.events.length && this.events[0].t <= t) this.events.shift().fn();
    gilVincha(this.gil?.a);
    // la Llama: crece y se asienta
    const fire = g.world.eclipseArt?.llamaFire;
    if (fire) {
      this.llamaV += ((this.llamaK * (t < 3 ? 1 : 0.35)) - this.llamaV) * Math.min(1, dt * 2.5);
      fire.scale.set(1 + this.llamaV * 0.35, 1 + this.llamaV * 0.9, 1 + this.llamaV * 0.35);
    }
    // el desgarro de Eclipse
    const eU = this.eRift.U;
    eU.uCrack.value = this.eOpen ? Math.min(1, eU.uCrack.value + dt / 0.5) : 0;
    if (this.eOpen) eU.uOpen.value = 1 - (1 - smoothW(t, this.eOpen.t, this.eOpen.t + this.eOpen.d)) ** 2;
    if (this.eClose != null) {
      const k = (t - this.eClose) / 0.9;
      eU.uOpen.value = Math.max(0, 1 - smooth(clamp01(k)));
      eU.uCrack.value = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      if (k >= 1.05 && this.eRift.root.visible) {
        this.eRift.root.visible = false;
        const p = tmpV.copy(this.eR).setY(this.eR.y + 1.4);
        g.fx.flash(p, 0xff9ce8, 34, 0.45, 12);
        g.fx.sparkle(p, [1, 0.6, 0.95], 24, 0.5);
      }
    }
    this.eFlash = Math.max(0, (this.eFlash || 0) - dt / 0.9);
    eU.uFlash.value = this.eFlash;
    this.eRift.tick(dt, g.camera);
    // el del otro lado
    const mU = this.mU;
    mU.uT.value += dt;
    if (this.mOpen) {
      const bt = t - this.O0;
      mU.uCrack.value = Math.min(1, mU.uCrack.value + dt / 0.5);
      mU.uOpen.value = 1 - (1 - smoothW(bt, this.mOpen.t, this.mOpen.t + this.mOpen.d)) ** 2;
    }
    if (this.mClose != null) mU.uOpen.value = Math.max(0, 1 - smooth(clamp01((t - this.mClose) / 0.5)));
    this.mFlash = Math.max(0, (this.mFlash || 0) - dt / 0.9);
    mU.uFlash.value = this.mFlash;
    // los que dan pasos para atrás
    for (const Bk of this.backs) {
      Bk.t += dt;
      const k = Math.min(1, Bk.t / Bk.dur);
      const prev = tmpW.copy(Bk.r.pos);
      Bk.r.pos.lerpVectors(Bk.from, Bk.to, smooth(k));
      Bk.r.pos.y = C.floor(Bk.r.pos.x, Bk.r.pos.z);
      const c = C.clipOf('back');
      if (c?.speed && Bk.r.cc?.name === 'back' && dt > 0) Bk.r.cc.rate = Math.min(2, prev.distanceTo(Bk.r.pos) / dt / c.speed);
      if (k >= 1) {
        Bk.done = true;
        C.act(Bk.r, Bk.then, { loop: true, fade: 0.5 });
      }
    }
    if (this.backs.some((x) => x.done)) this.backs = this.backs.filter((x) => !x.done);
    // del otro lado: el Gil que entra al desgarro ya no está
    if (this.side === 'alba' && !this.gil.dead && t - this.O0 > 12 && this.back(this.gil.pos)[1] < PZ - 0.45) this.gil.dead = true;
    this.belTick(dt, t);
    C.tick(dt);
    this.fill();
    this.updateSable(dt);
  }

  // la luz del desgarro en las caras (gauchoSkin uFill)
  fill() {
    const alba = this.side === 'alba';
    const U = alba ? this.mU : this.eRift.U;
    const open = U.uOpen.value + U.uFlash.value * 0.5;
    for (const r of this.C.list) {
      const u = r.a?.M?.gaucho?.userData.life?.uFill;
      if (!u) continue;
      const RR = alba ? this.R : this.eR;
      const d = Math.hypot(r.pos.x - RR.x, r.pos.z - RR.z);
      let k = open * 0.16 * (1 - smooth(clamp01((d - 1) / 5)));
      // (de noche, el Gil con algo de luz propia: si no, no se lo ve)
      if (r === this.gil) k = Math.max(k, alba ? 0.04 : 0.12);
      u.value.setRGB(0.55 * k, 0.16 * k, 0.9 * k);
    }
  }

  // El sable: en el piso, en las palmas del Valiente, en las manos del Gil, en su puño.
  updateSable(dt) {
    const v = this.C.by.valiente;
    const gil = this.gil;
    const Sv = this.Sv || (this.Sv = new THREE.Matrix4());
    const Sg = this.Sg || (this.Sg = new THREE.Matrix4());
    const ready = (r) => r?.a?.gs?.on && !r.dead;
    const ruleV = () => {
      if (!ready(v)) return false;
      hand(v.a, 'Left', HL);
      hand(v.a, 'Right', HR);
      A_.copy(HL.c).addScaledVector(HL.n, SB.SUP);
      B_.copy(HR.c).addScaledVector(HR.n, SB.SUP);
      sableTwo(A_, SB.S_VL, B_, SB.S_VR, Sv);
      return true;
    };
    const ruleG = () => {
      if (!ready(gil)) return false;
      hand(gil.a, 'Right', HR);
      hand(gil.a, 'Left', HL);
      A_.copy(HR.c).addScaledVector(HR.n, SB.GRIP_IN);
      B_.copy(HL.c).addScaledVector(HL.n, SB.SUP);
      sableTwo(A_, SB.GRIP_S, B_, SB.S_GL, Sg);
      return true;
    };
    const vc = v?.cc;
    const gc = gil.cc;
    if (this.state === 'ground' && vc?.name === 'sableKneel' && vc.lt >= SB.GR_T - 0.02 && ruleV()) {
      this.state = 'V';
      this.Sfrom.copy(this.S);
      this.blend = 0;
    }
    if (this.state === 'V') {
      if (ruleV()) {
        this.blend = Math.min(1, this.blend + dt / 0.25);
        if (this.blend < 1) mixM(this.Sfrom, Sv, smooth(this.blend), this.S);
        else this.S.copy(Sv);
      }
      if (gc?.name === 'gilTake' && gc.lt >= SB.TRANSFER && ruleG()) {
        this.state = 'G2';
        this.Sfrom.copy(this.S);
        this.blend = 0;
      }
    }
    if (this.state === 'G2') {
      if (ruleG()) {
        this.blend = Math.min(1, this.blend + dt / 0.25);
        if (this.blend < 1 && ruleV()) mixM(Sv, Sg, smooth(this.blend), this.S);
        else this.S.copy(Sg);
      }
      if (gc?.name === 'gilTake' && gc.lt >= SB.REL_T) {
        hand(gil.a, 'Right', HR);
        this.Hf = this.Hf || new THREE.Matrix4();
        this.O = (this.O || new THREE.Matrix4()).copy(this.Hf.compose(HR.c, HR.q, ONE).invert()).multiply(this.S);
        this.state = 'G1';
      }
    }
    if (this.state === 'G1' && gil.a?.gs?.on) {
      hand(gil.a, 'Right', HR);
      this.S.copy(this.Hf.compose(HR.c, HR.q, ONE)).multiply(this.O);
    }
    // (el del piso, solo del otro lado; en la mano del Gil, donde esté él)
    this.sable.visible = this.state === 'G1' ? !gil.dead : this.side === 'alba';
    this.place2();
  }

  sfx(kind, at) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const p = tmpS.copy(at).setY(at.y + 1.4);
    const o = A.out({ pos: p.clone(), gain: 1, reverb: 0.7, ref: 7 });
    const t = A.now;
    if (kind === 'llama') {
      A.noise(o, { t, dur: 1.4, type: 'lowpass', freq: 380, freqEnd: 1200, gain: 0.5, attack: 0.06, brown: true });
      A.tone(o, { t, dur: 1.6, type: 'sine', freq: 70, freqEnd: 110, gain: 0.2, attack: 0.1 });
    } else if (kind === 'crack') {
      for (let i = 0; i < 7; i++) A.noise(o, { t: t + i * 0.07 + Math.random() * 0.03, dur: 0.06, type: 'highpass', freq: 2600 + i * 300, q: 1.2, gain: 0.25, attack: 0.002 });
    } else if (kind === 'tear') {
      A.noise(o, { t, dur: 1.3, type: 'bandpass', freq: 320, freqEnd: 2600, q: 1.6, gain: 0.55, attack: 0.04 });
      A.tone(o, { t, dur: 1.8, type: 'sawtooth', freq: 62, freqEnd: 36, gain: 0.22, attack: 0.05 });
      A.tone(o, { t: t + 0.1, dur: 2.4, type: 'sine', freq: 880, freqEnd: 1320, gain: 0.05, attack: 0.3 });
    } else if (kind === 'take') {
      A.bell?.(o, t, 79, { gain: 0.1, dur: 3 });
      A.tone(o, { t, dur: 1.2, type: 'sine', freq: 1320, freqEnd: 1760, gain: 0.05, attack: 0.05 });
    } else if (kind === 'close') {
      A.noise(o, { t, dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 120, gain: 0.6, attack: 0.01 });
      A.tone(o, { t: t + 0.55, dur: 0.9, type: 'sine', freq: 95, freqEnd: 30, gain: 0.55, attack: 0.004 });
      A.bell?.(o, t + 0.6, 74, { gain: 0.06, dur: 3 });
    }
  }

  cleanup() {
    const g = this.g;
    // (la partida sigue: el HUD y el mate en la mano, de vuelta)
    g.hud?.show?.(true);
    if (g.weapons?.vmRoot) g.weapons.vmRoot.visible = true;
    if (this.side === 'alba') this.setSide('noche');
    else this.restoreLook();
    g.scene.onBeforeRender = this.sceneBR || null;
    for (const o of this.hidden0) o.visible = true;
    this.hidden0 = [];
    const fire = g.world.eclipseArt?.llamaFire;
    if (fire) fire.scale.set(1, 1, 1);
    this.white(false);
    this.eRift.dispose();
    for (const m of this.mParts || []) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    for (const geo of [...(this.mastOwn || []), ...(this.cityOwn || [])]) geo.dispose();
    for (const m of [...(this.mastMats || []), ...(this.cityMats || [])]) m.dispose();
    this.city?.removeFromParent();
    this.city = null;
    this.mast?.removeFromParent();
    this.C.people.root.removeFromParent();
  }
}
