import * as THREE from 'three';

// Los muertos del trailer: se ponen donde hace falta (saliendo de la tierra o
// ya caminando), con la velocidad que pide la toma, y persiguen al "cebo" (el
// jugador de verdad, invisible en las tomas de afuera).

const SPEEDS = { walk: 1.1, run: 3.4, sprint: 5.2 };

export function clearWorld(g) {
  g.zombies.reset();
  g.fx.clearAll?.();
  g.weapons.clearProjectiles?.();
  g.powerups?.clear?.();
  g.crow?.despawn?.();
  g.post && (g.post.flashV = 0);
}

// Un muerto en (x, z). state: 'rise' (sale de la tierra) o 'chase' (ya viene).
// speed: walk / run / sprint (o un número en m/s).
export function zombieAt(g, x, z, { state = 'chase', speed = 'walk', hp = 400, yaw = null, round = 8, y = null } = {}) {
  const Z = g.zombies;
  const at = new THREE.Vector3(x, g.world.levels ? g.world.floorAt(x, z, y ?? undefined) : 0, z);
  if (!Z.spawn(round, hp, at, true)) return null;
  // el último que salió
  let zz = null;
  for (const c of Z.pool) if (c.active && (!zz || c.id > zz.id)) zz = c;
  if (!zz) return null;
  zz.pos.x = x;
  zz.pos.z = z;
  if (g.world.levels) {
    zz.pos.y = zz.baseY = at.y;
    zz.level = at.y > 2 ? 1 : 0;
  }
  if (typeof speed === 'number') {
    zz.speedType = speed > 4.5 ? 'sprint' : speed > 2 ? 'run' : 'walk';
    zz.speed = speed;
  } else {
    zz.speedType = speed;
    zz.speed = SPEEDS[speed] * (0.9 + Math.random() * 0.2);
  }
  zz.runU = null;
  if (yaw != null) zz.yaw = yaw;
  if (state === 'chase') {
    zz.state = 'chase';
    zz.stateT = 5;
    // (rootY es relativo al piso del muerto: en los mapas con alturas sumaba el piso dos veces)
    zz.P.rootY = 0;
  }
  return zz;
}

// Una tanda: n muertos repartidos en un arco (centro, radio, ángulos) o en una franja.
export function ring(g, cx, cz, n, { r0 = 8, r1 = 14, a0 = 0, a1 = Math.PI * 2, ...o } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5 + (Math.random() - 0.5) * 0.8) / n) * (a1 - a0);
    const r = r0 + Math.random() * (r1 - r0);
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    const zz = zombieAt(g, x, z, { ...o, yaw: Math.atan2(cx - x, cz - z) });
    if (zz) out.push(zz);
  }
  return out;
}

// El cebo: los muertos van hacia el jugador de verdad (que en las tomas de afuera no se ve).
export function bait(g, x, z, y = null) {
  const p = g.player;
  p.pos.set(x, y ?? (g.world.levels ? g.world.floorAt(x, z) : 0), z);
  p.vel?.set(0, 0, 0);
}

// Vivos (para apuntar o contar).
export const alive = (g) => g.zombies.pool.filter((z) => z.active && !z.dead);

// El clima de la toma, ya puesto (sin la transición lenta del juego). over:
// valores que se pisan (fog, mist, rain, storm, cloud, wind, blood).
export function weather(g, name, over = {}) {
  const W = g.weather;
  if (!W?.S?.[name]) return;
  W.name = name;
  W.target = { ...W.S[name], ...over };
  Object.assign(W.cur, W.target);
  W.fogColor?.set?.(W.target.fogColor);
  W.timer = 1e9;
  W.nextBolt = 1e9;
}

// Un relámpago (destellos del cielo y del mundo; el trueno lo pone el montaje).
export function bolt(g, k = 1) {
  const W = g.weather;
  if (!W) return;
  W.pulses = [{ t: 0, k }, { t: 0.1, k: k * 0.7 }, { t: 0.32, k: k * 0.5 }];
}

// Un especial (carpincho, caballo, yacaré, puma) en (x, z): cae con su rayo.
export function dogAt(g, x, z, { kind = null, hp = 900 } = {}) {
  const Z = g.zombies;
  const at = new THREE.Vector3(x, g.world.levels ? g.world.floorAt(x, z) : 0, z);
  const rigs = [Z.dogRig, Z.horseRig, Z.yacRig, Z.pumaRig].filter(Boolean);
  const saved = rigs.map((r) => r.spot);
  for (const r of rigs) if (r.spot) r.spot = () => at.clone();
  const d0 = Z.dogSpot;
  Z.dogSpot = () => at.clone();
  let ok = false;
  try {
    ok = Z.spawnDog(hp, kind);
  } finally {
    rigs.forEach((r, i) => (r.spot = saved[i]));
    Z.dogSpot = d0;
  }
  if (!ok) return null;
  let zz = null;
  for (const c of Z.pool) if (c.active && (!zz || c.id > zz.id)) zz = c;
  return zz;
}
