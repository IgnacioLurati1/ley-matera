import * as THREE from 'three';
import { ZONES, TITLE_CAM, MAP_W, MAP_H, SKY } from '../config/map';
import { path, EASE } from './Intro';
import './deathTour.css';

// Al morir, después de la caída y el alma que sube (Game.startEnd), la cámara
// sale a recorrer el mapa como quedó (con la sangre, los muertos que siguen
// deambulando, lo que se rompió): unas tomas de lugares del mapa y, al final,
// un paneo largo del mapa entero. Recién ahí aparece el menú (y la cámara
// sigue flotando despacio detrás).
// Los lugares salen de la cinemática de entrada del mapa (ui/introShots.js:
// las tomas con nombre de lugar, `where`, y recorrido de cámara); si el mapa
// no tiene, se arman con las zonas. El paneo del final: la toma más abierta
// de la entrada si es del mapa entero (la del castillo); si no, una grúa que
// gira alrededor del mapa.
// Se saltea con Espacio, Enter, Escape o un clic (va directo al menú).

const ZONE_SHOTS = 3;
const ZONE_D = 4.6;
const FINAL_D = 10;
const FADE = 0.45;
const tmpP = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const soft = (u) => 0.5 * u + 0.5 * EASE.inout(u);

export default class DeathTour {
  constructor(g, onDone) {
    this.g = g;
    this.onDone = onDone;
    this.t = 0;
    this.i = -1;
    this.done = false;
    this.shots = this.plan();
    this.fog0 = g.weather?.cur?.fog ?? null;
    this.fogK = 1;
    this.total = this.shots.reduce((s, x) => s + x.d, 0);
    let t = 0;
    for (const s of this.shots) {
      s.t0 = t;
      t += s.d;
    }
    this.buildDom();
    g.endEl?.classList.add('is-tour');
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') this.skip();
    };
    this.onClick = () => this.skip();
    window.addEventListener('keydown', this.onKey);
    this.el.addEventListener('pointerdown', this.onClick);
  }

  // ---------------- las tomas ----------------
  plan() {
    const g = this.g;
    const out = [];
    // en una arena aparte (la Gran Guerra, el infierno...) el mapa no está:
    // solo el paneo alrededor de donde cayó
    if (g.arena?.active) {
      out.push(this.orbit(g.endCam ? new THREE.Vector3(g.endCam.x, g.endCam.y, g.endCam.z) : g.player.pos.clone(), 16, 9, FINAL_D + 2));
      return out;
    }
    const intro = g.intro?.S?.shots || [];
    const usable = intro.filter((s) => s.cam && s.look && !s.fn && !s.wake && !s.black);
    const places = usable.filter((s) => s.where);
    // las de la entrada, en otro orden cada vez
    const pick = places.slice().sort(() => Math.random() - 0.5).slice(0, ZONE_SHOTS);
    for (const s of pick) out.push({ d: Math.min(ZONE_D + 0.8, Math.max(ZONE_D, s.d)), camAt: s.camAt || path(s.cam), lookAt: s.lookAt || path(s.look), where: s.where, fog: s.fog ?? 1, fov: s.fov });
    // (sin tomas de lugares: las zonas del mapa)
    if (out.length < 2) for (const s of this.zoneShots(ZONE_SHOTS - out.length)) out.push(s);
    // el final: la más abierta de la entrada, si mira el mapa entero desde lejos
    let wide = null;
    let far = 0;
    for (const s of usable) {
      const d = new THREE.Vector3(...s.cam[0]).distanceTo(new THREE.Vector3(...s.look[0]));
      if (d > far) {
        far = d;
        wide = s;
      }
    }
    if (wide && far > 70) {
      // (la misma toma, más larga y un poco más allá: se va abriendo)
      const c0 = new THREE.Vector3(...wide.cam[0]);
      const c1 = new THREE.Vector3(...wide.cam[wide.cam.length - 1]);
      const c2 = c1.clone().add(c1.clone().sub(c0).multiplyScalar(0.8));
      out.push({ d: FINAL_D, camAt: path([c0.toArray(), c1.toArray(), c2.toArray()]), lookAt: wide.lookAt || path(wide.look), fog: wide.fog ?? 0.5, final: true });
    } else out.push(this.mapOrbit());
    return out;
  }

  // Una grúa que gira alrededor de c (radio r, alto h), mirándolo.
  orbit(c, r, h, d, a0 = Math.random() * Math.PI * 2, sweep = 0.7) {
    return {
      d,
      final: true,
      fog: 0.32,
      camAt: (u, o) => {
        const a = a0 + sweep * u;
        const rr = r * (1.08 - 0.16 * u);
        return o.set(c.x + Math.cos(a) * rr, c.y + h * (1.1 - 0.2 * u), c.z + Math.sin(a) * rr);
      },
      lookAt: (u, o) => o.set(c.x, c.y + h * 0.08, c.z),
    };
  }

  // El mapa entero: alrededor del centro (en la torre, subiendo en espiral).
  mapOrbit() {
    const g = this.g;
    const tower = !!g.world?.tower;
    if (tower) {
      const c = new THREE.Vector3(TITLE_CAM.look[0], 0, TITLE_CAM.look[2]);
      const top = (g.world.tower.top ?? TITLE_CAM.look[1] * 2) || 70;
      const a0 = Math.random() * Math.PI * 2;
      return {
        d: FINAL_D + 2,
        final: true,
        fog: 0.45,
        camAt: (u, o) => {
          const a = a0 + 1.4 * u;
          return o.set(c.x + Math.cos(a) * 44, 6 + (top + 10) * u, c.z + Math.sin(a) * 44);
        },
        lookAt: (u, o) => o.set(c.x, Math.max(4, (top + 10) * u - 4), c.z),
      };
    }
    // (SKY.center: la granja, sin el matorral de abajo)
    const cz = SKY.center?.[1] ?? MAP_H / 2;
    const c = new THREE.Vector3(SKY.center?.[0] ?? MAP_W / 2, TITLE_CAM.look[1] * 0.6, cz);
    const R = Math.max(MAP_W, cz * 2) * 0.6;
    return this.orbit(c, R, R * 0.45, FINAL_D);
  }

  // Tomas armadas con las zonas (las de adentro; cada una, cruzándola en diagonal).
  zoneShots(n) {
    const out = [];
    const list = Object.entries(ZONES).filter(([, z]) => z.rects?.length && !z.with && !z.wild);
    list.sort(() => Math.random() - 0.5);
    for (const [, z] of list.slice(0, n)) {
      let x0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let z1 = -Infinity;
      // el rectángulo más grande de la zona
      let big = null;
      for (const r of z.rects) {
        const a = (r[2] - r[0] + 1) * (r[3] - r[1] + 1);
        if (!big || a > big.a) big = { r, a };
      }
      [x0, z0, x1, z1] = big.r;
      x1 += 1;
      z1 += 1;
      const y = z.y || 0;
      const h = Math.min(3, (z.roof ? z.roof - y : 3.2) - 0.6);
      const w = x1 - x0;
      const dd = z1 - z0;
      out.push({
        d: ZONE_D,
        where: z.name,
        fog: 1,
        camAt: path([[x0 + w * 0.12, y + h, z0 + dd * 0.12], [x0 + w * 0.3, y + h * 0.85, z0 + dd * 0.22]]),
        lookAt: path([[x0 + w * 0.8, y + 0.9, z0 + dd * 0.8], [x0 + w * 0.75, y + 0.9, z0 + dd * 0.85]]),
      });
    }
    return out;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.t += dt;
    const T = Math.min(this.t, this.total + 60);
    let i = this.shots.findIndex((s) => T < s.t0 + s.d);
    if (i < 0) i = this.shots.length - 1;
    const s = this.shots[i];
    if (i !== this.i) {
      this.i = i;
      this.where(s.where || '');
    }
    const lt = T - s.t0;
    // la última sigue girando despacio detrás del menú
    const u = s.final ? lt / s.d : clamp01(lt / s.d);
    const e = s.final ? (u < 1 ? soft(u) : 1 + (u - 1) * 0.35) : soft(u);
    s.camAt(e, tmpP);
    s.lookAt(e, tmpL);
    const cam = g.camera;
    cam.position.copy(tmpP);
    tmpM.lookAt(tmpP, tmpL, UP);
    cam.quaternion.setFromRotationMatrix(tmpM);
    cam.updateMatrixWorld();
    // los fundidos entre toma y toma (el primero entra desde el negro del alma)
    const fin = !s.final || u < 1 ? clamp01(lt / FADE) : 1;
    const fout = s.final ? 1 : clamp01((s.d - lt) / FADE);
    const b = 1 - Math.min(fin, fout);
    if (Math.abs(b - (this.blackV ?? -1)) > 0.004) {
      this.blackV = b;
      this.fadeEl.style.opacity = b.toFixed(3);
    }
    // menos niebla en lo abierto
    const W = g.weather;
    if (W?.cur && this.fog0 != null) {
      this.fogK += ((s.fog ?? 1) - this.fogK) * Math.min(1, dt * 2);
      W.cur.fog = this.fog0 * this.fogK;
    }
    if (!this.done && this.t >= this.total) this.finish();
  }

  where(name) {
    const el = this.whereEl;
    el.classList.remove('is-on');
    if (!name) return;
    el.textContent = name;
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  skip() {
    if (this.done) return;
    // directo a la última, casi terminada (el menú sale ya)
    const last = this.shots[this.shots.length - 1];
    this.t = Math.max(this.t, last.t0 + 0.01);
    this.finish();
  }

  finish() {
    this.done = true;
    this.el.classList.add('is-done');
    this.where('');
    this.onDone?.();
  }

  // ---------------- lo que se ve ----------------
  buildDom() {
    const el = document.createElement('div');
    el.className = 'mdu-tour';
    el.innerHTML = '<i class="mdu-tour__fade"></i><i class="mdu-tour__bar"></i><i class="mdu-tour__bar mdu-tour__bar--b"></i><p class="mdu-tour__where"></p><p class="mdu-tour__skip">Espacio para saltear</p>';
    const g = this.g;
    // (debajo del cartel del fin y del menú)
    if (g.endEl?.parentNode) g.endEl.parentNode.insertBefore(el, g.endEl);
    else g.root.appendChild(el);
    this.el = el;
    this.fadeEl = el.querySelector('.mdu-tour__fade');
    this.whereEl = el.querySelector('.mdu-tour__where');
    requestAnimationFrame(() => el.classList.add('is-on'));
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.el?.remove();
    const W = this.g.weather;
    if (W?.cur && this.fog0 != null) W.cur.fog = this.fog0;
  }
}
