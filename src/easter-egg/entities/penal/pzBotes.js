import * as THREE from 'three';
import PenalBoat from '../PenalBoat';
import { PZS } from '../../config/porteno';

// Porteño encubierto: los dos botes del incendio del islote (el usuario,
// 2026-10-13: "Aparecerán 2 barcos en el muelle que llevan hasta 5 personas
// cada uno (reusar barcos, poner otro en otra parte del muelle)").
// El modelo es el del bote del penal (entities/PenalBoat.js build, armado
// entero). Acá no se maneja: cada bote va solo por su recorrido, siempre el
// mismo, así cada compu lo mueve con el tiempo que pasó (lo decide el
// anfitrión: cuándo sale, quién va sentado).
//  · Con el incendio llegan navegando por el río a su amarre: uno al costado
//    del muelle chico (donde está el del modo Historia) y otro en el frente
//    del muelle grande, entre los dos muellecitos.
//  · Se sube con F (5 asientos). Con uno arriba alcanza: sale a los
//    PZS.boatWait s de que subió el primero (o al llenarse).
//  · Llegan al muellecito del islote, cada uno de un lado, y los de arriba
//    bajan al tablado. Vuelven igual; el último bote del islote no sale si
//    queda alguien vivo en la isla sin subir.
//  · Sin incendio no se usan, salvo para volver del islote. Cuando no queda
//    nadie en la isla se van río abajo y desaparecen.
//  · (el usuario, 2026-10-14: "Si 2 impostores se suben al barco y se van, los
//    gauchos pierden al no poder de ninguna forma") Con el incendio, el bote
//    que bajó a su gente en el islote espera PZS.boatWait s en el tablado (el
//    que se sube en ese rato vuelve con él; lleno, sale en 1 s) y vuelve al
//    muelle, vacío si no subió nadie; en el islote no se espera a nadie: así
//    siempre hay con qué cruzar. Al apagarse el fuego, los que están del lado
//    del muelle van al islote a buscar a la gente (hostOut). Nadie traba la
//    vuelta: el último bote espera a todos solo hasta OUT_WAIT s de apagado
//    el fuego (o de amarrado, si llegó después a buscarlos) y después sale
//    con los que están arriba, y mientras haya vivos
//    en la isla siempre hay un bote yendo o amarrado allá.
// Las maniobras: sale derecho hacia afuera, gira, cruza, gira en el agua y
// entra de culata al amarre (así siempre sale de proa).

const WATER = -0.55;
const DECK = -0.4;
const HELM_UP = 0.34;
const SEATS = [[0, -2.05], [-0.5, -0.8], [0.5, -0.8], [-0.5, 0.6], [0.5, 0.6]];
// el casco (medio ancho, popa, proa) para ver si alguien está al lado
const HB = [1.1, -2.9, 3.2];
// velocidades: maniobra, cruce (m/s) y giro (rad/s)
const V_DOCK = 2.1;
const V_CRUISE = 6;
const V_TURN = 1.25;
// apagado el fuego, lo que el último bote del islote espera a que suban todos
// (s, desde que se apagó o desde que amarró, lo que venga después): después sale con los que tiene y otro vuelve a buscar al que quedó (el
// usuario, 2026-10-14: un policía que se queda a propósito no traba la vuelta)
const OUT_WAIT = 15;
// el amarre de cada bote (proa para el río) y su punto de maniobra; los
// asientos bajan al muelle en `pier`
const DK = [
  {
    land: { x: 55.6, z: 86.6, yaw: 0, app: [55.6, 93.5], pier: [[51.6, 85.2], [51.4, 86.4], [51.6, 87.6], [51.4, 88.8], [51.5, 84]] },
    isle: { x: 17.6, z: 115.5, yaw: Math.PI, app: [17.6, 109], pier: [[13.6, 114.1], [13.4, 115.3], [13.6, 116.5], [13.4, 117.7], [13.5, 113]] },
    toIsle: [[46, 101], [30, 105.6]],
    toLand: [[30, 106], [46, 101.6]],
    spawn: [[88, 100.5], [72, 99.5]],
    away: [[72, 99.5], [97, 100]],
  },
  {
    land: { x: 41, z: 86.3, yaw: 0, app: [41, 93.5], pier: [[39.6, 80.6], [40.6, 80.4], [41.6, 80.6], [42.6, 80.4], [41.1, 79.6]] },
    isle: { x: 8.4, z: 115.5, yaw: Math.PI, app: [8.4, 108.6], pier: [[12.4, 114.1], [12.6, 115.3], [12.4, 116.5], [12.6, 117.7], [12.5, 113]] },
    toIsle: [[30, 101.6], [17.6, 103.3], [11.2, 104.6]],
    toLand: [[11.2, 104.6], [17.6, 103.3], [30, 101.6]],
    spawn: [[80, 104.5], [64, 103.5], [50, 99]],
    away: [[50, 99.5], [70, 104], [97, 104.5]],
  },
];
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const yawOf = (dx, dz) => Math.atan2(dx, dz);
const tmpV = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const P_WAKE = { color: [0.62, 0.68, 0.7], size: 0.16, size1: 0.5, life: 1.1, alpha: 0.3, drag: 1.5 };
const P_FOAM = { color: [0.86, 0.9, 0.92], size: 0.06, size1: 0.16, life: 0.5, alpha: 0.55, gravity: 6, drag: 0.6 };

// ---------------- los recorridos ----------------
// Un tramo: 's' derecho (sin girar), 'p' gira en el lugar, 'c' cruza por una curva.
function straight(a, b, yaw) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { k: 's', a, b, yaw, d: Math.max(0.8, d / V_DOCK) };
}
function pivot(at, y0, y1) {
  const dy = wrap(y1 - y0);
  return Math.abs(dy) < 0.04 ? null : { k: 'p', at, y0, dy, d: 0.4 + Math.abs(dy) / V_TURN };
}
function cruise(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const t0 = curve.getTangentAt(0);
  const t1 = curve.getTangentAt(1);
  return { k: 'c', curve, d: Math.max(2, len / V_CRUISE), y0: yawOf(t0.x, t0.z), y1: yawOf(t1.x, t1.z) };
}
// Arma la lista de tramos de un movimiento: 'in' (llega del río al muelle),
// 'trip' (de `from` al otro) o 'away' (del muelle grande río abajo).
export function route(k, kind, from) {
  const D = DK[k];
  const L = D.land;
  const I = D.isle;
  const legs = [];
  const push = (l) => l && legs.push(l);
  if (kind === 'in') {
    const c = cruise([...D.spawn, L.app]);
    push(c);
    push(pivot(L.app, c.y1, L.yaw));
    push(straight(L.app, [L.x, L.z], L.yaw));
  } else if (kind === 'trip') {
    const A = from === 'land' ? L : I;
    const B = from === 'land' ? I : L;
    const c = cruise([A.app, ...(from === 'land' ? D.toIsle : D.toLand), B.app]);
    push(straight([A.x, A.z], A.app, A.yaw));
    push(pivot(A.app, A.yaw, c.y0));
    push(c);
    push(pivot(B.app, c.y1, B.yaw));
    push(straight(B.app, [B.x, B.z], B.yaw));
  } else {
    const c = cruise([L.app, ...D.away]);
    push(straight([L.x, L.z], L.app, L.yaw));
    push(pivot(L.app, L.yaw, c.y0));
    push(c);
  }
  let t = 0;
  for (const l of legs) {
    l.t0 = t;
    t += l.d;
  }
  return { legs, dur: t };
}

// Dónde va el bote a los `t` s del movimiento: { x, z, yaw, v } (v: lo que anda, m/s).
function poseAt(R, t, out) {
  const legs = R.legs;
  let l = legs[legs.length - 1];
  for (const q of legs) {
    if (t < q.t0 + q.d) {
      l = q;
      break;
    }
  }
  const u = clamp01((t - l.t0) / l.d);
  const e = smooth(u);
  // (lo que anda: la derivada de smooth, 6u(1-u))
  const dv = (6 * u * (1 - u)) / l.d;
  if (l.k === 's') {
    out.x = l.a[0] + (l.b[0] - l.a[0]) * e;
    out.z = l.a[1] + (l.b[1] - l.a[1]) * e;
    out.yaw = l.yaw;
    out.v = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) * dv;
  } else if (l.k === 'p') {
    out.x = l.at[0];
    out.z = l.at[1];
    out.yaw = l.y0 + l.dy * e;
    out.v = 0;
  } else {
    l.curve.getPointAt(e, tmpV);
    l.curve.getTangentAt(e, tmpT);
    out.x = tmpV.x;
    out.z = tmpV.z;
    out.yaw = yawOf(tmpT.x, tmpT.z);
    out.v = l.curve.getLength() * dv;
  }
  return out;
}

// Del sistema del bote al mundo (x al costado, z hacia la proa), como PenalBoat.toWorld.
function toWorld(px, pz, yaw, lx, lz, out) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return out.set(px + lx * c + lz * s, 0, pz - lx * s + lz * c);
}

export default class PzBotes {
  constructor(sab) {
    this.sab = sab;
    const g = (this.g = sab.g);
    this.list = DK.map((D, k) => this.make(k, D));
    this.wasSeat = null;
    this.rideK = -1;
    this.outT = -1;
    g.world.recull?.();
  }

  // Un bote: el modelo de PenalBoat (armado entero, sin la damajuana, sin las
  // tablas del muelle ni la columna de luz del cruce).
  make(k, D) {
    const g = this.g;
    const f = Object.create(PenalBoat.prototype);
    f.g = g;
    f.M = g.world.M;
    f.pos = new THREE.Vector3(D.land.x, WATER, D.land.z);
    f.root = new THREE.Group();
    f.build();
    f.showBuilt(true);
    for (const p of f.jugParts) p.visible = false;
    for (const o of [f.pile, f.beacon, f.beaconRing]) o?.removeFromParent();
    // (los halos de las velas del islote que pone build: con los del primero alcanza)
    if (k > 0) for (const o of [...f.root.children]) if (o.isSprite) o.removeFromParent();
    // el farol: una luz de evento (World.adoptLight), apagada mientras el bote no está
    const L = g.world.lights;
    const li = L ? L.indexOf(f.lampEntry) : -1;
    if (li >= 0) L.splice(li, 1);
    // (World.recull ya la había apagado al armarla: la de evento tiene que estar visible)
    f.lampLight.visible = true;
    f.lampLight.intensity = 0;
    g.world.adoptLight?.(f.lampLight, 0.6);
    f.root.visible = false;
    g.scene.add(f.root);
    return { k, D, f, st: 'off', at: 'land', tt: 0, seats: [-1, -1, -1, -1, -1], wait: -1, R: null, Rkey: '', pose: { x: D.land.x, z: D.land.z, yaw: D.land.yaw, v: 0 }, bob: 0, waitShown: -1 };
  }

  // ---------------- el estado ----------------
  pack() {
    return this.list.map((b) => [b.st, b.at, +b.tt.toFixed(2), b.seats, +b.wait.toFixed(1)]);
  }

  apply(list) {
    if (!list) return;
    list.forEach((s, k) => {
      const b = this.list[k];
      if (!b || !s) return;
      const [st, at, tt, seats, wait] = s;
      const same = b.st === st && b.at === at;
      b.st = st;
      b.at = at;
      // (el reloj: corrige de a poco; un salto grande o un movimiento nuevo, de una)
      b.tt = !same || Math.abs(tt - b.tt) > 0.5 ? tt : b.tt + (tt - b.tt) * 0.3;
      b.seats = seats;
      b.wait = wait;
    });
  }

  // ¿Cuál es el recorrido que está haciendo?
  routeOf(b) {
    const key = `${b.st}|${b.at}`;
    if (b.Rkey !== key) {
      b.Rkey = key;
      b.R = b.st === 'in' ? route(b.k, 'in') : b.st === 'trip' ? route(b.k, 'trip', b.at) : b.st === 'away' ? route(b.k, 'away') : null;
    }
    return b.R;
  }

  // (anfitrión) Llegan con el incendio.
  hostIn() {
    this.outT = -1;
    for (const b of this.list) {
      if (b.st !== 'off') continue;
      b.st = 'in';
      b.at = 'land';
      b.tt = 0;
      b.seats = [-1, -1, -1, -1, -1];
      b.wait = -1;
      b.fetch = false;
    }
  }

  // (anfitrión) Todos abajo (un encierro): siguen solos y se van.
  hostClear() {
    this.outT = -1;
    for (const b of this.list) {
      b.seats = [-1, -1, -1, -1, -1];
      b.wait = -1;
      b.fetch = false;
    }
  }

  // (anfitrión) Se apagó el fuego (el usuario, 2026-10-14): el que está del lado
  // del muelle (amarrado, volviendo vacío o recién llegando) va al islote a
  // buscar a la gente, que nadie quede sin bote para volver. Un encierro no
  // pasa por acá: ahí todos vuelven al pabellón y los botes se van como antes.
  hostOut() {
    // (0: se apagó a manguerazos, cuenta OUT_WAIT; -1: no, o vino un encierro)
    this.outT = 0;
    for (const b of this.list) b.lastT = 0;
    for (const b of this.list) b.fetch = b.st === 'in' || (b.st === 'dock' && b.at === 'land') || (b.st === 'trip' && b.at === 'isle');
  }

  riders(b) {
    return b.seats.filter((id) => id >= 0);
  }

  // (anfitrión) Cada cuadro: salidas, llegadas y los que se fueron. Devuelve true si cambió algo.
  hostTick(dt, fireOn) {
    const pz = this.sab.pz;
    let changed = false;
    // ¿quién está vivo en la isla?
    const onIsle = pz.ids().filter((id) => pz.alive(id) && this.sab.inIsle(pz.posOf(id)));
    for (const b of this.list) {
      // fuera los que se fueron o murieron
      for (let i = 0; i < b.seats.length; i++) {
        if (b.seats[i] >= 0 && !pz.alive(b.seats[i])) {
          b.seats[i] = -1;
          changed = true;
        }
      }
      if (b.st === 'in' || b.st === 'trip' || b.st === 'away') {
        b.tt += dt;
        const R = this.routeOf(b);
        if (b.tt >= R.dur) {
          if (b.st === 'away') b.st = 'off';
          else {
            if (b.st === 'trip') b.at = b.at === 'land' ? 'isle' : 'land';
            b.st = 'dock';
            b.lastT = 0;
            // los de arriba bajan al muelle (cada compu baja a su jugador: syncSeat)
            b.seats = [-1, -1, -1, -1, -1];
          }
          b.tt = 0;
          b.wait = -1;
          changed = true;
        }
        continue;
      }
      if (b.st !== 'dock') continue;
      // (lo que lleva amarrado con el fuego apagado: OUT_WAIT)
      if (!fireOn) b.lastT = (b.lastT || 0) + dt;
      const n = this.riders(b).length;
      if (b.at === 'land' && !fireOn) {
        // sin incendio no se sale: los que estaban arriba bajan y el bote se va
        if (n) {
          b.seats = [-1, -1, -1, -1, -1];
          changed = true;
        }
        // (hostOut) estaba de este lado cuando se apagó el fuego, o no hay otro
        // yendo ni amarrado en el islote: va a buscarlos
        const serving = this.list.some((o) => o !== b && ((o.st === 'dock' && o.at === 'isle') || (o.st === 'trip' && o.at === 'land')));
        // (solo si el fuego se apagó a manguerazos, outT >= 0: después de un
        // encierro todos vuelven al pabellón y con la isla quemándose se
        // termina la partida; ahí, como antes)
        if (this.outT >= 0 && onIsle.length > 0 && (b.fetch || !serving) && !this.sab.burning()) {
          b.fetch = false;
          b.st = 'trip';
          b.tt = 0;
          b.wait = -1;
          changed = true;
          continue;
        }
        const back = this.list.some((o) => o !== b && o.at === 'isle' && o.st === 'dock') || onIsle.length > 0;
        if (!back) {
          b.st = 'away';
          b.tt = 0;
          b.wait = -1;
          b.fetch = false;
          changed = true;
        }
        continue;
      }
      if (b.at === 'isle' && !n) {
        // el que quedó en la isla sin nadie: si ya no hay incendio ni gente, vuelve vacío
        if (!fireOn && onIsle.length === 0) {
          b.st = 'trip';
          b.tt = 0;
          changed = true;
        } else if (fireOn) {
          // con el incendio vuelve solo y vacío al muelle (si alguien se sube
          // en este rato, la cuenta sigue y se lo lleva)
          if (b.wait < 0) {
            b.wait = PZS.boatWait;
            changed = true;
          }
          b.wait -= dt;
          if (b.wait <= 0) {
            b.st = 'trip';
            b.tt = 0;
            b.wait = -1;
            changed = true;
          }
        } else if (b.wait !== -1) {
          b.wait = -1;
          changed = true;
        }
        continue;
      }
      if (!n) {
        if (b.wait !== -1) {
          b.wait = -1;
          changed = true;
        }
        continue;
      }
      // el último bote del islote espera a todos los que quedan vivos en la isla
      let go = true;
      // (con el incendio no se espera a nadie: si no, un policía sentado
      // dejaría el bote en el islote; el usuario, 2026-10-14)
      if (b.at === 'isle' && !fireOn) {
        const other = this.list.some((o) => o !== b && o.st === 'dock' && o.at === 'isle');
        go = other || onIsle.every((id) => b.seats.includes(id));
        // (a los OUT_WAIT s de apagado sale con los que tiene: la cuenta de
        // PZS.boatWait empieza antes, así zarpa a esa hora y se ve venir)
        if (!go && this.outT >= 0 && b.lastT >= OUT_WAIT - PZS.boatWait) go = true;
      }
      if (!go) {
        if (b.wait !== -2) {
          b.wait = -2;
          changed = true;
        }
        continue;
      }
      if (b.wait < 0) {
        b.wait = PZS.boatWait;
        changed = true;
      }
      if (n >= PZS.seats) b.wait = Math.min(b.wait, 1);
      b.wait -= dt;
      if (b.wait <= 0) {
        b.st = 'trip';
        b.tt = 0;
        b.wait = -1;
        changed = true;
      }
    }
    return changed;
  }

  // ¿Se puede subir a este bote? (anfitrión y el aviso de F)
  canBoard(b, fireOn) {
    if (b.st !== 'dock') return false;
    if (b.at === 'land' && !fireOn) return false;
    return b.seats.some((id) => id < 0);
  }

  // (anfitrión) Sube `id` al bote k.
  hostBoard(id, k, fireOn) {
    const b = this.list[k];
    const pz = this.sab.pz;
    const p = pz.posOf(id);
    if (!b || !p || !pz.alive(id) || !this.canBoard(b, fireOn) || this.seatOf(id)) return false;
    if (this.hullDist(b, p) > 3.2) return false;
    const i = b.seats.indexOf(-1);
    b.seats[i] = id;
    return true;
  }

  hostUnboard(id) {
    const s = this.seatOf(id);
    if (!s || s.b.st !== 'dock') return false;
    s.b.seats[s.i] = -1;
    return true;
  }

  seatOf(id) {
    for (const b of this.list) {
      const i = b.seats.indexOf(id);
      if (i >= 0) return { b, i };
    }
    return null;
  }

  // Lo que hay de (x, z) al casco del bote (0 adentro).
  hullDist(b, p) {
    const P = b.pose;
    const s = Math.sin(P.yaw);
    const c = Math.cos(P.yaw);
    const dx = p.x - P.x;
    const dz = p.z - P.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ox = Math.max(0, Math.abs(lx) - HB[0]);
    const oz = Math.max(0, lz - HB[2], HB[1] - lz);
    return Math.hypot(ox, oz);
  }

  // El bote más cerca al que se puede subir (para el aviso de F).
  nearBoard(p, fireOn) {
    let best = null;
    let bd = 2.4;
    for (const b of this.list) {
      if (!this.canBoard(b, fireOn)) continue;
      if (Math.abs(p.y - 0) > 1.6) continue;
      const d = this.hullDist(b, p);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // ---------------- cada cuadro (todas las compus) ----------------
  update(dt, host) {
    const g = this.g;
    const t = g.time;
    for (const b of this.list) {
      const R = this.routeOf(b);
      if (!host && R && b.st !== 'dock' && b.st !== 'off') b.tt += dt;
      if (R) poseAt(R, Math.min(b.tt, R.dur), b.pose);
      else if (b.st === 'dock') {
        const A = b.D[b.at];
        b.pose.x = A.x;
        b.pose.z = A.z;
        b.pose.yaw = A.yaw;
        b.pose.v = 0;
      }
      const f = b.f;
      const on = b.st !== 'off';
      f.root.visible = on;
      // (más fuerte que en el modo Historia: de noche, sin esto el bote no se veía llegar)
      f.lampLight.intensity = on ? 6 * (0.9 + Math.sin(t * 7 + b.k) * 0.06) : 0;
      f.lampLight.distance = 15;
      if (!on) continue;
      b.bob = Math.sin(t * 1.3 + b.k * 2) * 0.04;
      f.boat.position.set(b.pose.x, b.bob, b.pose.z);
      f.boat.rotation.y = b.pose.yaw;
      // se mece; andando, cabecea un poco
      f.body.rotation.z = Math.sin(t * 1.1 + b.k) * 0.025;
      f.body.rotation.x = Math.sin(t * 0.9 + b.k) * 0.015 - Math.min(1, b.pose.v / V_CRUISE) * 0.03;
      const lx = b.pose.x + Math.sin(b.pose.yaw) * 1.55;
      const lz = b.pose.z + Math.cos(b.pose.yaw) * 1.55;
      f.lampLight.position.set(lx, DECK + 2.6 + b.bob, lz);
      // la estela y la espuma de la proa, andando
      if (b.pose.v > 0.6) this.wake(b, dt);
    }
    this.fixRiders();
    this.syncSeat();
  }

  wake(b, dt) {
    const fx = this.g.fx;
    const P = b.pose;
    const n = Math.min(3, Math.ceil(b.pose.v * dt * 4));
    for (let i = 0; i < n; i++) {
      toWorld(P.x, P.z, P.yaw, (Math.random() - 0.5) * 1.6, -2.9, tmpV);
      fx.alpha.spawn(tmpV.x, WATER + 0.12, tmpV.z, (Math.random() - 0.5) * 0.5, 0.05, (Math.random() - 0.5) * 0.5, P_WAKE);
      const side = Math.random() < 0.5 ? -1 : 1;
      toWorld(P.x, P.z, P.yaw, side * 0.7, 2.7, tmpV);
      fx.add.spawn(tmpV.x, WATER + 0.15, tmpV.z, side * Math.cos(P.yaw) * 1.4, 0.9 + Math.random() * 0.6, -side * Math.sin(P.yaw) * 1.4, P_FOAM);
    }
  }

  seatWorld(b, i, out) {
    const P = b.pose;
    toWorld(P.x, P.z, P.yaw, SEATS[i][0], SEATS[i][1], out);
    out.y = DECK + b.bob + (i === 0 ? HELM_UP : 0);
    return out;
  }

  // Los compañeros sentados se ven en su asiento (su posición de red llega
  // atrasada: como PenalBoat.fixRiders).
  fixRiders() {
    const g = this.g;
    if (!g.net) return;
    this.riderFix ||= (r) => {
      const s = this.seatOf(r.id);
      if (!s) return;
      this.seatWorld(s.b, s.i, tmpV);
      r.pos.set(tmpV.x, tmpV.y, tmpV.z);
      r.speed = 0;
    };
    for (const r of g.net.remote.values()) {
      const on = !!this.seatOf(r.id);
      if (on && !r.fix) r.fix = this.riderFix;
      else if (!on && r.fix === this.riderFix) r.fix = null;
    }
  }

  // Cambió mi asiento: subo (me siento) o bajo al muelle donde está el bote.
  syncSeat() {
    const g = this.g;
    const pz = this.sab.pz;
    const s = this.seatOf(pz.myId());
    const key = s ? `${s.b.k}|${s.i}` : null;
    if (key === this.wasSeat) return;
    const was = this.wasSeat;
    this.wasSeat = key;
    const p = g.player;
    if (s) {
      this.rideK = s.b.k;
      this.rideI = s.i;
      this.rideYaw = null;
      pz.hookRide();
      g.audio?.land?.();
      if (!was) {
        // mirando para la proa
        p.yaw = s.b.pose.yaw + Math.PI;
        p.pitch = -0.05;
      }
      return;
    }
    const k = this.rideK;
    const i = this.rideI;
    this.rideK = -1;
    p.crouching = false;
    if (k < 0 || !was) return;
    // (un encierro o el final lo llevan a otro lado: no se lo baja al muelle)
    if (pz.scene || pz.frozen || pz.phase !== 'play' || pz.deadMe) return;
    const b = this.list[k];
    const pier = b.D[b.at].pier;
    const [x, z] = pier[i] || pier[0];
    p.pos.set(x, g.world.floorAt(x, z), z);
    p.vel.set(0, 0, 0);
    g.audio?.land?.();
  }

  // (Porteno.ride, desde Player.update) Sentado: el bote lo lleva.
  ride() {
    if (this.rideK < 0) return false;
    const b = this.list[this.rideK];
    const p = this.g.player;
    // (la vista gira con el bote, como en el del modo Historia)
    if (this.rideYaw != null) {
      let dy = b.pose.yaw - this.rideYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy;
    }
    this.rideYaw = b.pose.yaw;
    this.seatWorld(b, this.rideI, tmpV);
    p.pos.copy(tmpV);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.airTop = p.pos.y;
    p.crouching = this.rideI !== 0;
    p.sprinting = false;
    p.lungeT = 0;
    return true;
  }

  // Lo que se muestra al que va sentado: cuánto falta para salir.
  riderText() {
    if (this.rideK < 0) return null;
    const b = this.list[this.rideK];
    if (b.st !== 'dock') return null;
    if (b.wait === -2) return 'Esperando a todos';
    if (b.wait > 0) return `Zarpa en ${Math.ceil(b.wait)}`;
    return null;
  }

  reset() {
    this.outT = -1;
    for (const b of this.list) {
      b.st = 'off';
      b.at = 'land';
      b.tt = 0;
      b.seats = [-1, -1, -1, -1, -1];
      b.wait = -1;
      b.f.root.visible = false;
      b.f.lampLight.intensity = 0;
    }
  }

  dispose() {
    const g = this.g;
    for (const b of this.list) {
      b.f.root.removeFromParent();
      const v = g.world.virt;
      const i = v ? v.indexOf(b.f.lampLight) : -1;
      if (i >= 0) v.splice(i, 1);
    }
    if (g.net) for (const r of g.net.remote.values()) if (r.fix === this.riderFix) r.fix = null;
  }
}
