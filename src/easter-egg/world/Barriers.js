import * as THREE from 'three';
import { WINDOWS } from '../config/map';
import { SILL, HEAD } from './World';

// Ventanas con 6 tablas: los zombies las arrancan una por una y el jugador
// las vuelve a clavar (manteniendo F), como en el original.

const BOARDS = 6;
const LAYOUT = [
  [1.12, 0.12],
  [1.38, -0.28],
  [1.62, 0.06],
  [1.86, 0.32],
  [2.12, -0.1],
  [1.5, -0.62],
];

// En el alambrado la tranquera tapiada va más abajo (no hay ventana).
const LAYOUT_LOW = [
  [0.3, 0.1],
  [0.52, -0.22],
  [0.74, 0.06],
  [0.96, 0.24],
  [1.18, -0.08],
  [0.64, -0.55],
];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3(1, 1, 1);
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export default class Barriers {
  constructor(game) {
    this.g = game;
    const T = game.textures;
    const mat = new THREE.MeshStandardMaterial({ map: T.board, roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.18, 0.17, 0.045), mat, WINDOWS.length * BOARDS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // (en las sombras de Épica va siempre con lo que se mueve: fx/Epic keepDyn)
    this.mesh.userData.shadowDyn = true;
    // (sus límites se calculan una vez: el que entra con ventanas rotas los
    // tenía chicos y las tablas que volvían podían no dibujarse)
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
    this.windows = WINDOWS.map((def, i) => {
      const [cx, cz] = def.cell;
      const [ox, oz] = def.out;
      // en los mapas con alturas la ventana está al nivel de su piso (y afuera, del terreno)
      const world = game.world;
      const fy = world.levels ? world.fy[world.idx(cx, cz)] : 0;
      const center = new THREE.Vector3(cx + 0.5, fy, cz + 0.5);
      const w = {
        i,
        def,
        zone: def.zone,
        fy,
        out: new THREE.Vector3(ox, 0, oz),
        center,
        ext: new THREE.Vector3(cx + 0.5 + ox * 0.95, world.levels ? world.floorAt(cx + 0.5 + ox * 1.5, cz + 0.5 + oz * 1.5) : 0, cz + 0.5 + oz * 0.95),
        int: new THREE.Vector3(cx + 0.5 - ox * 1.0, fy, cz + 0.5 - oz * 1.0),
        boards: [],
        tearer: null,
        climber: null,
      };
      const yaw = Math.atan2(ox, oz);
      const low = game.world.edge?.[game.world.idx(cx, cz)] > 0;
      w.low = low;
      for (let b = 0; b < BOARDS; b++) {
        const [y, roll] = (low ? LAYOUT_LOW : LAYOUT)[b];
        const jitter = (Math.random() - 0.5) * 0.1;
        // (la diagonal, 1 cm más adentro: en el mismo plano que las horizontales,
        // donde se cruzaban titilaba. __mduNoTablaZ: como antes)
        const inset = (low ? 0.05 : 0.42) + (b === 5 && globalThis.__mduNoTablaZ !== true ? 0.01 : 0);
        v.set(cx + 0.5 - ox * inset, fy + y + jitter * 0.3, cz + 0.5 - oz * inset);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        qa.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll + jitter);
        q.multiply(qa);
        const rest = new THREE.Matrix4().compose(v.clone(), q.clone(), s);
        w.boards.push({ state: 'on', t: 0, rest, pos: v.clone(), quat: q.clone(), anim: new THREE.Vector3(), spin: 0 });
      }
      return w;
    });
    this.dirty = true;
    this.refresh();
  }

  count(i) {
    let n = 0;
    for (const b of this.windows[i].boards) if (b.state === 'on' || b.state === 'repair') n++;
    return n;
  }

  // Las tablas que manda el anfitrión (modo invitado).
  applyRemote(i, n) {
    const w = this.windows[i];
    if (!w) return;
    const have = this.count(i);
    if (n < have) {
      for (let k = 0; k < have - n; k++) this.tear(i, true);
    } else if (n > have) {
      for (let k = 0; k < n - have; k++) this.repair(i, true);
    }
  }

  // Las tablas de todas las ventanas de una vez, sin animación (el que entra
  // a una partida ya empezada).
  applyAll(counts) {
    counts.forEach((n, i) => {
      const w = this.windows[i];
      if (w) w.boards.forEach((b, k) => (b.state = k < n ? 'on' : 'off'));
    });
    this.dirty = true;
  }

  // Arranca una tabla. Devuelve true si había alguna.
  tear(i, remote = false) {
    const w = this.windows[i];
    let on = w.boards.filter((b) => b.state === 'on');
    // (la del anfitrión: si la tabla todavía estaba volviendo, igual sale)
    if (!on.length && remote) on = w.boards.filter((b) => b.state === 'repair');
    if (!on.length) return false;
    const b = on[Math.floor(Math.random() * on.length)];
    b.state = 'tear';
    b.t = 0;
    b.anim.copy(w.out).multiplyScalar(2.5 + Math.random());
    b.anim.y = 1.5;
    b.spin = (Math.random() - 0.5) * 12;
    this.g.audio.boardTear(w.center.clone().setY(w.fy + 1.5));
    this.g.fx.dust(new THREE.Vector3(w.center.x, w.fy + 1.5, w.center.z), w.out, [0.4, 0.33, 0.25], 4);
    if (!remote) this.g.net?.event('boards', { w: i, n: this.count(i) });
    return true;
  }

  repair(i, remote = false) {
    // la defensa del yerbal: las tranqueras de los tablones quedan abiertas
    if (!remote && this.locked?.has(i)) return false;
    const w = this.windows[i];
    // (la del anfitrión: si la tabla todavía estaba volando, igual vuelve)
    const b = w.boards.find((x) => x.state === 'off') || (remote && w.boards.find((x) => x.state === 'tear'));
    if (!b) return false;
    b.state = 'repair';
    b.t = 0;
    this.g.audio.boardRepair(w.center.clone().setY(w.fy + 1.5));
    if (!remote) this.g.net?.event('boards', { w: i, n: this.count(i) });
    return true;
  }

  repairAll() {
    for (const w of this.windows) {
      if (this.locked?.has(w.i)) continue;
      for (const b of w.boards) {
        if (b.state === 'off' || b.state === 'tear') {
          b.state = 'repair';
          b.t = Math.random() * -0.5;
        }
      }
    }
  }

  update(dt) {
    let changed = this.dirty;
    for (const w of this.windows) {
      for (const b of w.boards) {
        if (b.state === 'tear' || b.state === 'repair') {
          b.t += dt;
          changed = true;
          this.g.post?.epic?.kickShadow?.(w.center, 2);
          if (b.state === 'tear' && b.t > 0.6) b.state = 'off';
          if (b.state === 'repair' && b.t > 0.3) {
            b.state = 'on';
            this.g.fx.dust(new THREE.Vector3(w.center.x - w.out.x * 0.4, w.fy + 1.5, w.center.z - w.out.z * 0.4), w.out.clone().negate(), [0.4, 0.33, 0.25], 2);
          }
        }
      }
    }
    if (this.dirty) this.g.post?.epic?.kickShadow?.(null);
    if (changed) this.refresh();
    this.dirty = false;
  }

  refresh() {
    let k = 0;
    for (const w of this.windows) {
      for (const b of w.boards) {
        if (b.state === 'on') this.mesh.setMatrixAt(k, b.rest);
        else if (b.state === 'off') this.mesh.setMatrixAt(k, zero);
        else if (b.state === 'tear') {
          // sale volando hacia afuera, girando, y cae
          const t = Math.min(0.6, b.t);
          v.copy(b.pos).addScaledVector(b.anim, t);
          v.y = b.pos.y + b.anim.y * t - 6 * t * t;
          qa.setFromAxisAngle(new THREE.Vector3(1, 0.3, 0).normalize(), b.spin * t);
          q.copy(b.quat).multiply(qa);
          m4.compose(v, q, s);
          this.mesh.setMatrixAt(k, m4);
        } else if (b.state === 'repair') {
          // vuelve desde el piso de adentro a su lugar
          const t = Math.max(0, Math.min(1, b.t / 0.3));
          const e = 1 - (1 - t) * (1 - t);
          v.copy(b.pos).addScaledVector(w.out, -(1 - e) * 1.2);
          v.y = w.fy + 0.2 + (b.pos.y - w.fy - 0.2) * e;
          qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (1 - e) * 1.5);
          q.copy(b.quat).multiply(qa);
          m4.compose(v, q, s);
          this.mesh.setMatrixAt(k, m4);
        }
        k++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const w of this.windows) {
      w.tearer = null;
      w.climber = null;
      for (const b of w.boards) b.state = 'on';
    }
    this.dirty = true;
  }
}

export { SILL, HEAD };
