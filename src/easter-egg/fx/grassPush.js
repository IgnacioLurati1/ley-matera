import * as THREE from 'three';

// El pasto alto que se aparta (el pajonal del estero): cada mata se inclina
// alejándose de lo que pasa por adentro (el Luisón, que aparece de la nada
// entre la paja, y también los jugadores), más en la punta que en la base, y
// vuelve de a poco cuando se fue: cada uno que empuja deja una "estela" que lo
// sigue con atraso (el pasto de atrás todavía está doblado y se endereza).
// Todo en el shader de vértices de las matas (con un uniform compartido): no
// suma programas a mitad de partida (se compila al cargar con el resto) ni
// luces, y en cada cuadro solo se copian unos números.
// En línea cada compu lo calcula con las posiciones que ya le llegan (el
// invitado ve moverse el pasto igual).

const SLOTS = 4;
const N = SLOTS * 2;
// radio de empuje (m) del Luisón (con su tamaño, hasta 1,3) y de un jugador;
// cuánto tarda la estela (con un radio chico se abre solo la paja que toca: el
// resto lo sigue tapando, que es la gracia de que aparezca de la nada)
const R_BOSS = 1.7;
const R_PLAYER = 1.1;
const TRAIL = 2.2;
// cada cuánto suena el roce de la paja mientras algo la atraviesa (s)
const RUSTLE_EVERY = 0.34;

const PUSH = { value: Array.from({ length: N }, () => new THREE.Vector4(0, -1e4, 0, 0)) };
const COUNT = { value: 0 };
const tmpV = new THREE.Vector3();
// (para las pruebas: qué empuja ahora)
export const GRASS_PUSH = { push: PUSH, count: COUNT };
// Lo que empuja en una cinemática (ui/LuisonArrival: los muertos que salen del
// pajonal): { key, x, y, z, r, loud }, antes que los de la partida.
export const EXTRA_PUSH = [];

// Lo que va en el shader: después de armar la posición local ("transformed"),
// cada mata (por su base, así se inclina entera) se corre en el mundo alejándose
// de los que empujan, en proporción a la altura del vértice sobre la base, y
// baja un poco (que la hoja no se estire). El corrimiento vuelve a lo local con
// la inversa de la matriz de la instancia (así siguen bien la sombra, la
// profundidad y el reflejo).
const DECL = 'uniform vec4 uGrassPush[8];\nuniform int uGrassN;\n';
const CODE = `
#ifdef USE_INSTANCING
	mat4 gpM = modelMatrix * instanceMatrix;
#else
	mat4 gpM = modelMatrix;
#endif
	vec3 gpBase = gpM[3].xyz;
	float gpH = max((gpM * vec4(transformed, 1.0)).y - gpBase.y, 0.0);
	if (uGrassN > 0 && gpH > 0.01) {
		vec2 gpO = vec2(0.0);
		for (int i = 0; i < 8; i++) {
			if (i >= uGrassN) break;
			vec4 P = uGrassPush[i];
			if (P.w <= 0.0) continue;
			vec2 d = gpBase.xz - P.xz;
			float dist = length(d);
			float k = (1.0 - smoothstep(P.w * 0.3, P.w, dist)) * (1.0 - smoothstep(1.5, 3.0, abs(gpBase.y - P.y)));
			gpO += (dist > 0.001 ? d / dist : vec2(0.7071)) * k;
		}
		float gpK = length(gpO);
		if (gpK > 0.001) {
			float kk = min(gpK, 1.0);
			gpO *= kk / gpK;
			transformed += inverse(mat3(gpM)) * vec3(gpO.x * gpH * 0.7, -gpH * 0.3 * kk * kk, gpO.y * gpH * 0.7);
		}
	}
`;

// El parche (también lo usa el G-buffer de Épica, fx/Epic.js, con su propio material).
export function grassPushShader(sh) {
  sh.uniforms.uGrassPush = PUSH;
  sh.uniforms.uGrassN = COUNT;
  sh.vertexShader = DECL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${CODE}`);
}

// Le pone el empuje a un material (antes de que se compile por primera vez).
const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
export function addGrassPush(mat) {
  if (!mat || mat.userData.grassPush) return mat;
  mat.userData.grassPush = grassPushShader;
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey;
  const base = key === PROTO_KEY ? () => prev.toString() : () => key.call(mat);
  mat.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    grassPushShader(sh);
  };
  mat.customProgramCacheKey = () => `${base()}|gpush`;
  return mat;
}

// Cada cuadro (world.extraUpdate del estero): junta a los que empujan y mueve
// las estelas. isGrass(x, z): si en ese lugar hay pasto alto (para el roce).
export function makeGrassPush(g, isGrass) {
  const slots = Array.from({ length: SLOTS }, () => ({ key: null, x: 0, y: -1e4, z: 0, r: 0, tx: 0, ty: -1e4, tz: 0, tr: 0, rustle: 0 }));
  const src = [];
  for (let i = 0; i < SLOTS; i++) src.push({ key: null, x: 0, y: 0, z: 0, r: 0, loud: 0 });
  let n = 0;
  const near = (x, z) => isGrass(x, z) || isGrass(x + 1, z) || isGrass(x - 1, z) || isGrass(x, z + 1) || isGrass(x, z - 1);
  const add = (key, x, y, z, r, loud) => {
    if (n >= SLOTS) return;
    const s = src[n++];
    s.key = key;
    s.x = x;
    s.y = y;
    s.z = z;
    s.r = r;
    s.loud = loud;
  };
  return (dt) => {
    n = 0;
    for (const e of EXTRA_PUSH) add(e.key, e.x, e.y, e.z, e.r, e.loud || 0);
    // el Luisón (el jefe del estero), después uno mismo y los compañeros
    const b = g.zombies?.boss;
    if (b && b.active && !b.dead && b.kind === 'luison') add(b, b.pos.x, b.baseY ?? b.pos.y, b.pos.z, R_BOSS * Math.min(1.3, b.scale || 1), 1);
    // (los jugadores, solo pegados al pasto: si no, el shader ni entra al lazo)
    const p = g.player;
    if (p && p.alive && g.state === 'playing' && near(p.pos.x, p.pos.z)) add(p, p.pos.x, p.pos.y, p.pos.z, R_PLAYER, 0.5);
    if (g.net) for (const r of g.net.remote.values()) if (!r.dead && near(r.pos.x, r.pos.z)) add(r, r.pos.x, r.pos.y, r.pos.z, R_PLAYER, 0.4);
    const k = Math.min(1, dt * TRAIL);
    for (const s of slots) {
      let cur = null;
      for (let i = 0; i < n && s.key; i++) if (src[i].key === s.key) cur = src[i];
      if (cur) {
        // se movió: el roce, si va por el pasto
        const moved = Math.hypot(cur.x - s.x, cur.z - s.z);
        s.x = cur.x;
        s.y = cur.y;
        s.z = cur.z;
        s.r = cur.r;
        cur.key = null;
        s.rustle -= dt;
        if (moved > dt * 0.8 && s.rustle <= 0 && isGrass(s.x, s.z)) {
          s.rustle = RUSTLE_EVERY * (0.8 + Math.random() * 0.4);
          rustle(g, s, cur.loud);
        }
      } else if (s.key) {
        // se fue (murió, se desconectó): la estela se desinfla sola
        s.key = null;
        s.r = 0;
      }
      s.tx += (s.x - s.tx) * k;
      s.tz += (s.z - s.tz) * k;
      s.ty = s.y;
      // (la estela vale mientras está lejos del que la deja; si no, sobra)
      const lag = Math.hypot(s.x - s.tx, s.z - s.tz);
      s.tr = s.r > 0 ? s.r * 0.8 * Math.min(1, lag / 0.4) : Math.max(0, s.tr - dt * 1.6);
    }
    // los nuevos (Luisón que aparece, compañero que entra): a un lugar libre, con la estela encima
    for (let i = 0; i < n; i++) {
      const cur = src[i];
      if (!cur.key) continue;
      let s = null;
      for (const q of slots) if (!q.key && (!s || q.tr < s.tr)) s = q;
      if (!s) break;
      s.key = cur.key;
      s.x = s.tx = cur.x;
      s.y = s.ty = cur.y;
      s.z = s.tz = cur.z;
      s.r = cur.r;
      s.tr = 0;
      s.rustle = 0;
      cur.key = null;
    }
    let used = 0;
    for (let i = 0; i < SLOTS; i++) {
      const s = slots[i];
      PUSH.value[i * 2].set(s.x, s.y, s.z, s.r);
      PUSH.value[i * 2 + 1].set(s.tx, s.ty, s.tz, s.tr);
      if (s.r > 0 || s.tr > 0) used = i * 2 + 2;
    }
    COUNT.value = used;
  };
}

// El roce de la paja: un siseo corto y seco, con dónde (el del Luisón se oye de lejos).
function rustle(g, s, loud) {
  const A = g.audio;
  if (!A?.ctx || !loud) return;
  const o = A.out({ pos: tmpV.set(s.x, s.y + 1, s.z), gain: 0.5 * loud, reverb: 0.15, ref: loud >= 1 ? 6 : 2.5 });
  A.noise(o, { dur: 0.22 + Math.random() * 0.12, type: 'bandpass', freq: 2600 + Math.random() * 1400, freqEnd: 1500, q: 0.8, gain: 0.55, attack: 0.03 });
  A.noise(o, { t: A.now + 0.05, dur: 0.16, type: 'highpass', freq: 4200, q: 0.5, gain: 0.25, attack: 0.02 });
}
