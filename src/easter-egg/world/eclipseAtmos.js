import * as THREE from 'three';
import Weather from './Weather';
import { ZONES, SKY, FEATURES } from '../config/map';
import { ISLANDS } from '../config/maps/eclipse';
import { bossRound } from '../config/rules';
import { ISLE_IDS, SKY_NIGHT } from './eclipseSky';

// La atmósfera de cada isla de Eclipse Matero y el clima sobre el vacío.
//
// Cada isla tiene su aire: el color y lo espeso de la niebla, la luz del cielo
// (hemisférica) y la de abajo (el resplandor del vacío), la ambiente y el color
// y la fuerza de la luz del eclipse. Se mezclan según dónde está la cámara (las
// dos islas más cercanas) y cambian de a poco: al cruzar un portal la isla nueva
// entra en un fundido corto, sin salto. Es de cada compu (nunca weather.set,
// que es de todos y va por la red) y va DESPUÉS del clima, encima de lo que el
// clima dejó: un relámpago, la luna roja o una niebla del clima se siguen
// viendo, teñidos por la isla. Adentro (las zonas techadas) todo un poco más
// oscuro. El eclipse (w.eclipse, world/eclipseSky.js) baja la luz al taparse.
// La misma cuenta le dice al cielo qué isla va en el cenit.
//
// El clima es el de siempre (world/Weather.js), con dos cambios para un mapa
// que flota: las salpicaduras, las hojas y la bruma salen sobre el piso de la
// isla (no a la altura 0, que acá es el vacío) y nunca sobre el vacío; y sin
// jefe de ronda no hay luna roja que lo anuncie.

// Los colores son lineales. fog: niebla (y dens, su densidad con el clima
// despejado); hemi / ground: la luz del cielo y la de abajo; amb: ambiente;
// moon: la luz del eclipse en esa isla.
export const ATMOS = {
  // el estero de noche: luna lavada, verde agua
  centro: { fog: [0.05, 0.11, 0.12], dens: 0.0052, hemi: [0.52, 0.74, 0.8], ground: [0.24, 0.13, 0.34], hemiI: 1.55, amb: [0.36, 0.48, 0.52], ambI: 0.55, moon: [0.85, 0.94, 1.0], moonI: 1.7 },
  // el molino: la tarde sepia
  molino: { fog: [0.2, 0.13, 0.07], dens: 0.0055, hemi: [0.9, 0.68, 0.45], ground: [0.3, 0.15, 0.22], hemiI: 1.45, amb: [0.56, 0.44, 0.32], ambI: 0.5, moon: [1.0, 0.8, 0.52], moonI: 1.9 },
  // La Tapera: el sol que se pone
  tapera: { fog: [0.3, 0.13, 0.1], dens: 0.005, hemi: [1.0, 0.62, 0.55], ground: [0.36, 0.13, 0.27], hemiI: 1.5, amb: [0.6, 0.42, 0.42], ambI: 0.5, moon: [1.0, 0.64, 0.4], moonI: 2.1 },
  // el penal: la tormenta
  penal: { fog: [0.07, 0.1, 0.085], dens: 0.0065, hemi: [0.52, 0.68, 0.6], ground: [0.2, 0.12, 0.26], hemiI: 1.4, amb: [0.4, 0.48, 0.45], ambI: 0.5, moon: [0.78, 0.92, 0.82], moonI: 1.55 },
  // el Monumento: el alba
  monumento: { fog: [0.36, 0.42, 0.48], dens: 0.0048, hemi: [0.82, 0.9, 1.0], ground: [0.36, 0.26, 0.42], hemiI: 1.7, amb: [0.56, 0.6, 0.7], ambI: 0.55, moon: [1.0, 0.93, 0.82], moonI: 2.2 },
  // la torre: el remolino de oro
  torre: { fog: [0.17, 0.16, 0.06], dens: 0.005, hemi: [0.88, 0.82, 0.48], ground: [0.2, 0.3, 0.14], hemiI: 1.5, amb: [0.52, 0.5, 0.34], ambI: 0.5, moon: [1.0, 0.86, 0.48], moonI: 2.0 },
  // el castillo: la noche de hielo
  castillo: { fog: [0.05, 0.08, 0.13], dens: 0.005, hemi: [0.56, 0.72, 0.98], ground: [0.22, 0.15, 0.4], hemiI: 1.5, amb: [0.4, 0.48, 0.64], ambI: 0.55, moon: [0.78, 0.9, 1.0], moonI: 1.85 },
  // El Desgarro: violeta
  // La Disformidad: otra dimensión, niebla violeta espesa y luz de abajo
  desgarro: { fog: [0.1, 0.02, 0.17], dens: 0.011, hemi: [0.62, 0.34, 0.9], ground: [0.36, 0.1, 0.42], hemiI: 1.55, amb: [0.52, 0.36, 0.62], ambI: 0.55, moon: [0.96, 0.76, 1.0], moonI: 1.95 },
};
// cuánto tarda en llegar a la isla nueva (s): al cruzar un portal, un fundido corto
const FADE = 0.7;
// los colores de base del clima despejado (World.setFlash): lo que el clima
// cambie sobre esto (relámpago, luna roja) se aplica como tinte encima
const HEMI0 = [0.29, 0.35, 0.5];
const MOON0 = [0.62, 0.7, 1.0];
// abajo de esto el piso es el vacío (world/Eclipse.js lo baja a VOID_Y)
const VOID_UNDER = -20;

const N = ISLE_IDS.length;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class EclipseAtmos {
  constructor(game, weather = game.weather) {
    this.g = game;
    this.w = new Float32Array(N);
    this.to = new Float32Array(N);
    this.w[0] = 1;
    this.indoor = 0;
    this.first = true;
    this.P = ISLE_IDS.map((id) => {
      const A = ATMOS[id];
      const c = (v) => new THREE.Color().setRGB(v[0], v[1], v[2]);
      // la noche del eclipse (SKY_NIGHT): la niebla de cada isla, un rescoldo de
      // su color sobre el negro violeta del cielo, y más fina (las otras islas
      // están a más de cien metros y se tienen que ver)
      const nk = SKY_NIGHT();
      const fl = A.fog[0] * 0.3 + A.fog[1] * 0.59 + A.fog[2] * 0.11;
      const nf = (v, i) => v + (((fl + v) * 0.5) * 0.3 + [0.014, 0.007, 0.028][i] - v) * nk;
      return { fog: c(A.fog.map(nf)), dens: A.dens * (1 - 0.4 * nk), hemi: c(A.hemi), ground: c(A.ground), hemiI: A.hemiI, amb: c(A.amb), ambI: A.ambI, moon: c(A.moon), moonI: A.moonI };
    });
    this.box = ISLE_IDS.map((id) => ISLANDS[id]?.box || [0, 0, 0, 0]);
    // qué islas son otra dimensión (ZONES[].dim)
    this.dimOf = ISLE_IDS.map((id) => (ISLANDS[id]?.zones || []).some((k) => ZONES[k]?.dim));
    // lo mezclado, sin pedir memoria en cada cuadro
    this.fog = new THREE.Color();
    this.hemi = new THREE.Color();
    this.ground = new THREE.Color();
    this.amb = new THREE.Color();
    this.moon = new THREE.Color();
    this.tint = new THREE.Color();
    this.clearFog = new THREE.Color(weather?.S?.clear?.fogColor ?? SKY.states?.clear?.fogColor ?? 0x1a1030);
    this.violet = new THREE.Color().setRGB(0.62, 0.42, 1.0);
  }

  // Las dos islas más cercanas a (x, z) y cuánto de la segunda (0 adentro de una isla).
  target(x, z) {
    let a = 0, b = 0, da = Infinity, db = Infinity;
    for (let i = 0; i < N; i++) {
      const [x0, z0, x1, z1] = this.box[i];
      const dx = Math.max(x0 - x, 0, x - (x1 + 1));
      const dz = Math.max(z0 - z, 0, z - (z1 + 1));
      const d = Math.hypot(dx, dz);
      if (d < da) {
        b = a;
        db = da;
        a = i;
        da = d;
      } else if (d < db) {
        b = i;
        db = d;
      }
    }
    this.to.fill(0);
    const m = da + db > 0 ? Math.min(0.5, da / (da + db)) : 0;
    this.to[a] += 1 - m;
    this.to[b] += m;
  }

  apply(dt) {
    const g = this.g;
    const w = g.world;
    const W = g.weather;
    const cam = g.camera?.position;
    if (!w || !cam || !w.hemi) return;
    // dónde está la cámara (en la partida es el jugador; en el título y las
    // escenas, lo que se ve)
    this.target(cam.x, cam.z);
    const k = this.first ? 1 : 1 - Math.exp(-dt / (FADE * 0.45));
    this.first = false;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      this.w[i] += (this.to[i] - this.w[i]) * k;
      sum += this.w[i];
    }
    const key = w.zoneAt?.(cam.x, cam.z, cam.y);
    const inside = key && ZONES[key] && !ZONES[key].outdoor ? 1 : 0;
    this.indoor += (inside - this.indoor) * Math.min(1, dt * 2.5);

    // la mezcla de las islas
    const f = this.fog.setRGB(0, 0, 0);
    const hc = this.hemi.setRGB(0, 0, 0);
    const gc = this.ground.setRGB(0, 0, 0);
    const ac = this.amb.setRGB(0, 0, 0);
    const mc = this.moon.setRGB(0, 0, 0);
    let dens = 0, hemiI = 0, ambI = 0, moonI = 0;
    let ia = 0, ib = 0, wa = -1, wb = -1;
    for (let i = 0; i < N; i++) {
      const q = this.w[i] / (sum || 1);
      if (q <= 0) continue;
      const P = this.P[i];
      f.r += P.fog.r * q;
      f.g += P.fog.g * q;
      f.b += P.fog.b * q;
      hc.r += P.hemi.r * q;
      hc.g += P.hemi.g * q;
      hc.b += P.hemi.b * q;
      gc.r += P.ground.r * q;
      gc.g += P.ground.g * q;
      gc.b += P.ground.b * q;
      ac.r += P.amb.r * q;
      ac.g += P.amb.g * q;
      ac.b += P.amb.b * q;
      mc.r += P.moon.r * q;
      mc.g += P.moon.g * q;
      mc.b += P.moon.b * q;
      dens += P.dens * q;
      hemiI += P.hemiI * q;
      ambI += P.ambI * q;
      moonI += P.moonI * q;
      if (q > wa) {
        ib = ia;
        wb = wa;
        ia = i;
        wa = q;
      } else if (q > wb) {
        ib = i;
        wb = q;
      }
    }
    // el cenit: la isla de más peso y, si se están mezclando, la otra
    const U = w.sky?.material?.uniforms;
    if (U?.uCapA) {
      U.uCapA.value = ia;
      U.uCapB.value = wb > 0 ? ib : ia;
      U.uCapMix.value = wb > 0 ? wb / (wa + wb) : 0;
      // las octavas de las nubes según la calidad
      const tier = g.settings?.quality;
      U.uQ.value = tier === 'perf' || tier === 'low' ? 3 : tier === 'ultra' || tier === 'epic' ? 5 : 4;
    }

    // la Disformidad: cuánto de su cielo (la isla dim del config)
    if (U?.uDim) {
      let dim = 0;
      for (let i = 0; i < N; i++) if (this.dimOf[i]) dim += this.w[i] / (sum || 1);
      // (el Desgarro Cósmico: la oscuridad invade la isla que sea)
      U.uDim.value = Math.max(dim, this.dimForce || 0);
    }
    this.dim = U?.uDim ? U.uDim.value : 0;
    // el eclipse: cuánto se tapó (la luz) y la sacudida de un pulso
    const E = w.eclipse;
    const ek = E?.k ?? 0.45;
    const pulse = Math.min(1, E?.pulseK || 0);
    const light = E?.light?.() ?? 1;
    const dark = (1 - 0.35 * smooth(0.45, 1, ek)) * (1 - 0.45 * (this.dimForce || 0));
    const ind = this.indoor;

    // la niebla: la de la isla, teñida por lo que el clima cambió
    const fog = g.scene.fog;
    if (fog) {
      const cf = this.clearFog;
      const tf = this.tint.setRGB(tintOf(W?.fogColor?.r, cf.r), tintOf(W?.fogColor?.g, cf.g), tintOf(W?.fogColor?.b, cf.b));
      fog.color.copy(f).multiply(tf).multiplyScalar(0.85 + 0.15 * dark);
      const d0 = W?.S?.clear?.fog || 0.0055;
      if (fog.isFogExp2) fog.density = dens * Math.max(0.3, Math.min(6, fog.density / d0)) * (1 + 0.3 * ind);
      U?.uFogColor?.value.copy(fog.color);
    }
    // la luz del cielo y la de abajo
    const H = w.hemi;
    const hr = H.intensity / (w.hemiBase ?? 0.9);
    H.color.setRGB(hc.r * tintOf(H.color.r, HEMI0[0]), hc.g * tintOf(H.color.g, HEMI0[1]), hc.b * tintOf(H.color.b, HEMI0[2]));
    H.groundColor.copy(gc);
    H.intensity = hemiI * hr * dark * (1 - 0.35 * ind) + pulse * 0.6;
    // la ambiente (el clima no la toca)
    w.ambient.color.copy(ac);
    w.ambient.intensity = ambI * dark * (1 - 0.2 * ind);
    // la luz del eclipse
    const M = w.moon;
    if (M) {
      const base = 0.9 * (1 - (W?.S?.clear?.cloud ?? 0.15) * 0.45) * (SKY.moon?.light ?? 1);
      const mr = M.intensity / (base || 1);
      M.color.setRGB(mc.r * tintOf(M.color.r, MOON0[0]), mc.g * tintOf(M.color.g, MOON0[1]), mc.b * tintOf(M.color.b, MOON0[2]));
      // en la totalidad, violácea
      M.color.lerp(this.violet, smooth(0.6, 1, ek) * 0.45);
      M.intensity = moonI * mr * light * (1 + 1.2 * pulse);
    }
  }
}

// cuánto se apartó el clima de su color de base (1 = nada), acotado
function tintOf(v, base) {
  if (!(v >= 0) || !(base > 0)) return 1;
  return Math.max(0.25, Math.min(4, v / base));
}

// El clima de Eclipse Matero: el de siempre, con la atmósfera de cada isla
// encima y lo que sale del piso apoyado en el piso de las islas.
export default class EclipseWeather extends Weather {
  constructor(game) {
    super(game);
    this.atmos = new EclipseAtmos(game, this);
  }

  // sin jefe de ronda (EclipseEgg.tuneRound) no hay luna roja que lo anuncie
  onRound(round) {
    if (bossRound(round, FEATURES.bossFrom) && this.g.rounds?.bossPending) {
      this.set('blood');
      return;
    }
    if (this.name === 'blood') {
      this.set('clear', false);
      return;
    }
    if (round < 3 || this.timer > 0) return;
    const pool = (SKY.weathers || [['clear', 1]]).filter(([n]) => n !== this.name && this.S[n]);
    let r = Math.random() * pool.reduce((s, [, v]) => s + v, 0);
    for (const [n, v] of pool) {
      r -= v;
      if (r <= 0) {
        this.set(n);
        break;
      }
    }
  }

  update(dt) {
    super.update(dt);
    if (globalThis.__mduNoEclipseAtmos !== true) this.atmos.apply(dt);
  }

  // el piso de la isla en (x, z), o null si ahí está el vacío
  floorOrNull(x, z) {
    const y = this.g.world.floorAt(x, z);
    return y > VOID_UNDER ? y : null;
  }

  splashes(dt, amount) {
    const g = this.g;
    const cam = g.camera.position;
    const n = Math.floor(amount * 60 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const x = cam.x + (Math.random() - 0.5) * 22;
      const z = cam.z + (Math.random() - 0.5) * 22;
      if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) continue;
      const y = this.floorOrNull(x, z);
      if (y === null) continue;
      g.fx.alpha.spawn(x, y + 0.03, z, 0, 0.8 + Math.random() * 0.6, 0, { color: [0.6, 0.65, 0.72], size: 0.035, size1: 0.01, life: 0.18, alpha: 0.45, gravity: 9 });
    }
  }

  leaves(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 6) return;
    const cam = g.camera.position;
    const wd = this.windDir;
    const x = cam.x - wd.x * 10 + (Math.random() - 0.5) * 14;
    const z = cam.z - wd.y * 10 + (Math.random() - 0.5) * 14;
    if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) return;
    const y = this.floorOrNull(x, z);
    if (y === null) return;
    const s = 3 + Math.random() * 3;
    g.fx.alpha.spawn(x, y + 0.3 + Math.random() * 2.5, z, wd.x * s, 0.3 + Math.random(), wd.y * s, { color: [0.28 + Math.random() * 0.15, 0.2, 0.08], size: 0.06, life: 3, alpha: 0.9, gravity: 0.6, drag: 0.2 });
  }

  mists(dt, amount) {
    const g = this.g;
    if (Math.random() > amount * dt * 5) return;
    const cam = g.camera.position;
    const x = cam.x + (Math.random() - 0.5) * 26;
    const z = cam.z + (Math.random() - 0.5) * 26;
    if (g.world.isIndoorCell(Math.floor(x), Math.floor(z))) return;
    const y = this.floorOrNull(x, z);
    if (y === null) return;
    const blood = this.cur.blood;
    g.fx.alpha.spawn(x, y + 0.25 + Math.random() * 0.4, z, this.windDir.x * 0.3, 0.02, this.windDir.y * 0.3, {
      color: blood > 0.5 ? [0.35, 0.1, 0.08] : [0.42, 0.46, 0.46],
      size: 2.5,
      size1: 4.5,
      life: 7 + Math.random() * 4,
      alpha: 0.07 + amount * 0.05,
      drag: 0.1,
    });
  }
}
