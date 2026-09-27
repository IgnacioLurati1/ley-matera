import { PLAYER } from '../config/rules';
import { WATER_Y } from '../config/map';

// El agua (Mate no Numa: los mapas con WATER_Y en config/map.js): cuánta hay en
// un punto, a qué altura está la superficie (con el oleaje y la inundación de
// cada 10 rondas: nada se guarda, se lee en el momento) y qué hace ahí un
// cuerpo: nada (seco), vadea (más lento) o nada. Lo usan el jugador, los
// zombies y lo que venga nadando (los yacarés): todo lo de acá es genérico.

// desde qué profundidad se chapotea y desde cuál ya no se hace pie (un humano)
export const WADE = 0.3;
export const SWIM = 1.3;
// aire abajo del agua (segundos) y con el Acuanauta
const BREATH = 12;
const BREATH_AQUA = 30;

const hit = { depth: 0, surface: 0, floor: 0, mode: 0 };

// ¿Se nada en este mapa? Solo donde el mapa pone WATER_Y (el estero): el río
// del penal tiene agua para verse (world.waterDepth) pero se cruza en bote.
export const hasWater = () => WATER_Y != null;

// ¿Está sumergido? (el local: la cámara abajo del agua; el de la red: buceando,
// swim 3, que llega en la foto). Los muertos no lo buscan (solo los yacarés, que
// igual no lo muerden abajo del agua): el pedido de "inundaciones más suaves".
export const submerged = (p) => !!p && (!!p.underwater || p.swim === 3);

// El agua en (x, z): profundidad, superficie, piso y modo (0 seco, 1 vadea,
// 2 no hace pie). y: la altura de referencia (mapas con pisos). deep: desde
// cuánto no hace pie (un zombie más alto, un yacaré más bajo).
export function waterAt(g, x, z, y, deep = SWIM) {
  const w = g.world;
  const depth = WATER_Y != null && w.waterDepth ? Math.max(0, w.waterDepth(x, z, y) || 0) : 0;
  hit.depth = depth;
  hit.mode = depth < WADE ? 0 : depth < deep ? 1 : 2;
  if (depth <= 0) {
    hit.floor = hit.surface = -Infinity;
    return hit;
  }
  hit.floor = w.floorAt(x, z, y);
  hit.surface = g.water?.heightAt?.(x, z) ?? hit.floor + depth;
  return hit;
}

// Cuánto frena el agua a un cuerpo que camina: 1 seco, ~0.55 con el agua al pecho.
export function wadeSlow(depth, deep = SWIM, aqua = false) {
  if (depth < WADE) return 1;
  const k = Math.min(1, (depth - WADE) / (deep - WADE));
  return 1 - k * (aqua ? 0.22 : 0.45);
}

// Lo que cuesta cruzar una celda con agua para el campo de flujo de los zombies.
export function waterCost(depth) {
  return depth < WADE ? 1 : depth < SWIM ? 1.35 : 1.8;
}

// El costo del agua en cada celda (world.navCost), de nuevo cada vez que el
// nivel se mueve más de 10 cm (la inundación): así rodean lo hondo si pueden.
export function updateNavCost(g) {
  const w = g.world;
  if (WATER_Y == null || !w.waterDepth) return false;
  const lvl = g.water?.level ?? 0;
  if (w.navCost && Math.abs(lvl - (w.navCostLevel ?? -99)) < 0.1) return false;
  if (w.navCostDry && Math.abs(lvl - (w.navCostLevel ?? -99)) < 0.1) return false;
  w.navCostLevel = lvl;
  const n = w.W * w.H;
  const cost = w.navCost || new Float32Array(n);
  let wet = false;
  for (let z = 0; z < w.H; z++) {
    for (let x = 0; x < w.W; x++) {
      const c = waterCost(Math.max(0, w.waterDepth(x + 0.5, z + 0.5) || 0));
      cost[z * w.W + x] = c;
      if (c > 1) wet = true;
    }
  }
  // (los mapas sin agua, o sin agua a este nivel, no cargan el campo de flujo)
  const had = !!w.navCost;
  w.navCost = wet ? cost : null;
  w.navCostDry = !wet;
  if (wet || had) w.navVersion = (w.navVersion || 0) + 1;
  return wet || had;
}

// ---------------- el jugador ----------------
// Cada cuadro, antes de moverse: en qué agua está. Deja en el jugador
// swim (0 seco, 1 vadea, 2 nada en la superficie, 3 bucea), underwater (la
// cámara abajo del agua), swimDepth (cuánto) y breath (0 a 1). Devuelve el agua.
export function playerWater(p, dt) {
  const g = p.g;
  const W = waterAt(g, p.pos.x, p.pos.z, p.pos.y + 0.5);
  const eyeY = p.pos.y + p.eye;
  const was = p.swim || 0;
  const wasUnder = !!p.underwater;
  if (W.mode < 2) p.swim = W.mode;
  else p.swim = eyeY < W.surface - 0.05 ? 3 : 2;
  // parado en lo que ahora es hondo (subió el agua) o bajando al pozo: ya flota
  p.underwater = W.depth > 0 && eyeY < W.surface;
  p.swimDepth = p.underwater ? W.surface - eyeY : 0;
  // el aire: abajo se gasta, arriba se recupera rápido
  const max = p.perks.has('aqua') ? BREATH_AQUA : BREATH;
  if (p.breathS == null) p.breathS = max;
  if (p.underwater && p.alive && !p.downed && !p.ghost) p.breathS = Math.max(0, p.breathS - dt);
  else {
    // sale a respirar: si venía corto de aire, bocanada
    if (wasUnder && p.breathS < max * 0.5) g.audio.gasp?.();
    p.breathS = Math.min(max, p.breathS + dt * max * 0.4);
  }
  p.breath = p.breathS / max;
  if (p.breathS <= 0) drown(p, dt);
  else p.drownT = 0;
  // caer al agua o zambullirse salpica (el sonido lo pone el agua: fx/Water.js)
  if (was < 2 && p.swim >= 2 && p.vel.y < -2) g.water?.splash?.(p.pos.x, p.pos.z, 1);
  else if (was === 2 && p.swim === 3) g.water?.splash?.(p.pos.x, p.pos.z, 0.6);
  g.hud.setBreath?.(p.swim === 3 || p.breath < 1 ? p.breath : null);
  return W;
}

// Sin aire: se ahoga de a poco (sin disparar lo de los golpes seguidos del dragón).
function drown(p, dt) {
  const g = p.g;
  p.drownT = (p.drownT || 0) - dt;
  if (p.drownT > 0 || !p.canBeHit() || g.godMode) return;
  p.drownT = 1;
  p.health -= 22;
  p.lastHit = g.time;
  p.hurtT = 1;
  g.audio.hurt();
  g.hud.hurt(1 - Math.max(0, p.health) / p.maxHealth);
  if (p.health <= 0) p.goDown();
}

// Nadando (en la superficie o buceando): reemplaza el caminar, saltar y caer.
// wx/wz: hacia dónde empuja (ya girado con la mirada); f: adelante/atrás.
export function swimMove(p, dt, input, W, wx, wz, f) {
  const g = p.g;
  const aqua = p.perks.has('aqua');
  const sp = (aqua ? 4.6 : 3.1) * (p.ghost ? 1.2 : 1) * (p.downed ? 0.35 : 1);
  // nadando en la superficie, la cabeza va afuera (caído, flota boca arriba)
  const top = W.surface - (p.eye - 0.3);
  const down = input.key('KeyC') || input.key('ControlLeft');
  const up = input.key('Space');
  let vx = wx * sp;
  let vz = wz * sp;
  let vy = 0;
  // buceando, adelante va hacia donde mira (también para arriba o para abajo)
  if (p.swim === 3 || (f > 0 && p.pitch < -0.35)) {
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * f;
    const fz = -Math.cos(p.yaw) * f;
    vx += fx * sp * (cp - 1);
    vz += fz * sp * (cp - 1);
    vy += Math.sin(p.pitch) * sp * f;
  }
  if (down) vy -= aqua ? 3 : 2.2;
  if (up) vy += 2.6;
  // sin hacer nada, flota hasta la superficie
  if (!down && vy >= -0.05 && p.pos.y < top - 0.02) vy = Math.max(vy, 1.2);
  const k = Math.min(1, dt * 4);
  p.vel.x += (vx - p.vel.x) * k;
  p.vel.z += (vz - p.vel.z) * k;
  p.vel.y += (vy - p.vel.y) * Math.min(1, dt * 3);
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  p.pos.y += p.vel.y * dt;
  // en la superficie se queda flotando con el oleaje (no sale volando del agua)
  if (p.pos.y > top) {
    p.pos.y += (top - p.pos.y) * Math.min(1, dt * 8);
    if (p.vel.y > 0) p.vel.y *= 0.5;
  }
  const floor = g.world.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
  if (p.pos.y < floor) {
    p.pos.y = floor;
    if (p.vel.y < 0) p.vel.y = 0;
  }
  // salir del agua a una orilla alta (muelle, barranca): nadando contra el borde, se trepa
  if (f > 0 && p.swim === 2 && !p.downed) {
    const ax = p.pos.x - Math.sin(p.yaw) * 0.6;
    const az = p.pos.z - Math.cos(p.yaw) * 0.6;
    const fa = g.world.floorAt(ax, az, W.surface + 1.2);
    const dA = g.world.waterDepth(ax, az, fa + 0.5) || 0;
    if (fa > p.pos.y + 0.4 && fa < W.surface + 0.9 && dA < SWIM) {
      p.pos.set(ax, fa, az);
      p.vel.set(0, 0, 0);
      p.onGround = true;
      g.water?.splash?.(p.pos.x, p.pos.z, 0.4);
      g.audio.land();
    }
  }
  g.world.collide(p.pos, PLAYER.radius, p.pos.y + 0.05, p.pos.y + 1.7);
  p.onGround = false;
  p.airTop = p.pos.y;
  p.landKick = Math.max(0, p.landKick - dt * 4);
  // la brazada: un chapoteo cada tanto en la superficie
  const hs = Math.hypot(p.vel.x, p.vel.z);
  p.moving = hs > 0.4;
  if (p.moving) {
    p.bobPhase += hs * dt * 1.4;
    p.stepDist += hs * dt;
    if (p.stepDist > 1.6) {
      p.stepDist = 0;
      if (p.swim === 2) g.water?.splash?.(p.pos.x - Math.sin(p.yaw) * 0.5, p.pos.z - Math.cos(p.yaw) * 0.5, 0.2);
    }
  }
}

// ---------------- los zombies ----------------
// El agua bajo un zombie (o cualquier bicho con pos/baseY/scale): la guarda en
// el cuerpo (wetD, wetY, wetMode) y suaviza swimK (0 camina, 1 nada) en el tiempo.
export function soak(g, z, t, deep = SWIM) {
  if (WATER_Y == null || !g.world.waterDepth) {
    z.wetD = 0;
    z.wetMode = 0;
    z.swimK = 0;
    return;
  }
  const W = waterAt(g, z.pos.x, z.pos.z, (z.baseY || 0) + 0.5, deep * (z.scale || 1));
  const dt = Math.min(0.1, Math.max(0, t - (z.soakT ?? t)));
  z.soakT = t;
  z.wetD = W.depth;
  z.wetY = W.surface;
  z.wetMode = W.mode;
  const target = W.mode === 2 ? 1 : 0;
  z.swimK = (z.swimK || 0) + (target - (z.swimK || 0)) * Math.min(1, dt * 3.5);
}

// Cuánto más lento va un zombie por el agua que tiene debajo.
export function zombieWaterSpeed(z) {
  if (!z.wetD) return 1;
  if (z.wetMode === 2) return 0.62;
  return wadeSlow(z.wetD, SWIM * (z.scale || 1));
}
