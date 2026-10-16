import * as THREE from 'three';

// Las luces en bloques de uniforms (2026-10-15, el usuario: "hacé 1 y 2"; el 2: las
// luces en un bloque compartido). three le sube las luces a cada programa por
// separado: en Eclipse, en el mismo cuadro, la posición de cada una de las 17
// puntuales se mandaba ~99 veces (una por programa y por cámara: la de los ojos, el
// espejo del agua, el arma; están en el espacio de la cámara y cambian al moverse) y
// el color ~71 (los fuegos titilan): ~3000 llamadas a la placa de ~9300 por cuadro, y
// el proceso de la placa de Chrome era el cuello. Ahora las puntuales, las
// direccionales y las hemisféricas viven en tres bloques (layout std140) que leen
// todos los programas: se suben una vez por render, con lo mismo que three le habría
// subido al primer programa (los valores del material: values.pointLights.value...),
// y cada programa los ata una sola vez, la primera vez que se usa. Lo que no está en
// los bloques (las sombras, sus matrices, la ambiente, la sonda, los focos) sigue
// como antes. Los uniforms de los bloques no tienen lugar propio en el programa: se
// sacan de la lista que three recorre en cada dibujo (seqWithValue).
// Medido el mismo día (Eclipse, Épica 1440p, 24 zombies, cargas alternadas, 2
// vueltas): las llamadas uniform* bajan a la mitad (1268 → 694 por cuadro) y la
// imagen queda igual en los 8 mapas. Con un solo buffer la placa tardaba 0,43 ms más
// en la pasada del arma (ver el anillo, abajo); con el anillo: la CPU de la pasada
// del mundo -0,3 a -0,4 ms en 3 de 4 puntos, fps iguales o +6-7 %.
// globalThis.__mduLucesSueltas = true (antes de cargar): como antes.
const ON = globalThis.__mduLucesSueltas !== true;

const vec = (f, o, v) => {
  f[o] = v.x;
  f[o + 1] = v.y;
  f[o + 2] = v.z;
};
const col = (f, o, c) => {
  f[o] = c.r;
  f[o + 1] = c.g;
  f[o + 2] = c.b;
};
// (std140: cada vec3 arranca en múltiplo de 16 bytes; un float puede ir en el hueco
// que deja el vec3 de antes; cada luz ocupa un múltiplo de 16 bytes)
const KINDS = [
  {
    id: 'pointLights',
    decl: 'uniform PointLight pointLights[ NUM_POINT_LIGHTS ];',
    block: 'MduLucesP',
    n: 12,
    put(f, o, l) {
      vec(f, o, l.position);
      col(f, o + 4, l.color);
      f[o + 7] = l.distance;
      f[o + 8] = l.decay;
    },
  },
  {
    id: 'directionalLights',
    decl: 'uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];',
    block: 'MduLucesD',
    n: 8,
    put(f, o, l) {
      vec(f, o, l.direction);
      col(f, o + 4, l.color);
    },
  },
  {
    id: 'hemisphereLights',
    decl: 'uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];',
    block: 'MduLucesH',
    n: 12,
    put(f, o, l) {
      vec(f, o, l.direction);
      col(f, o + 4, l.skyColor);
      col(f, o + 8, l.groundColor);
    },
  },
];
const IDS = new Set(KINDS.map((K) => K.id));

// los shaders, antes de que se compile ninguno
let patched = false;
if (ON) {
  let s = THREE.ShaderChunk.lights_pars_begin;
  patched = KINDS.every((K) => s.split(K.decl).length === 2);
  if (patched) {
    for (const K of KINDS) {
      const ty = K.decl.split(' ')[1];
      const arr = K.decl.slice(K.decl.indexOf(K.id), -1);
      s = s.replace(K.decl, `layout(std140) uniform ${K.block} { ${ty} ${arr}; };`);
    }
    THREE.ShaderChunk.lights_pars_begin = s;
  }
}

// ¿todo el uniform está en un bloque? (sin lugar propio en el programa)
const inBlock = (u) => (u.seq ? u.seq.every(inBlock) : u.addr === null);

export function lightBlock(renderer) {
  if (!patched || renderer.__mduLB) return null;
  const gl = renderer.getContext();
  if (typeof gl.getUniformBlockIndex !== 'function') return null;
  renderer.__mduLB = true;
  const top = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS);
  // Un anillo de buffers por bloque: cada subida va a uno que la placa ya no está
  // leyendo. Con un solo buffer, la pasada del arma (otra cámara: otras posiciones)
  // lo reescribía mientras la placa todavía dibujaba el mundo con él, y esperaba:
  // +0,43 ms de placa en esa pasada, en los 4 puntos medidos. 4 renders por cuadro y
  // hasta 2 cuadros en cola (core/frameQueue): 12 alcanzan.
  // (globalThis.__mduLucesUnBuffer = true: uno solo, como la primera versión)
  const RING = 12;
  const alloc = (K) => {
    for (const b of K.ring || []) gl.deleteBuffer(b);
    K.ring = [];
    for (let i = 0; i < RING; i++) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.UNIFORM_BUFFER, b);
      gl.bufferData(gl.UNIFORM_BUFFER, K.data.byteLength, gl.DYNAMIC_DRAW);
      K.ring.push(b);
    }
    K.at = 0;
    gl.bindBufferBase(gl.UNIFORM_BUFFER, K.bind, K.ring[0]);
  };
  KINDS.forEach((K, i) => {
    K.bind = top - 1 - i;
    K.data = new Float32Array(K.n * 8);
    K.last = new Float32Array(K.n * 8);
    K.len = -1;
    alloc(K);
  });
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);

  // cada programa ata sus bloques la primera vez que se usa (ya está enlazado)
  const tied = new WeakSet();
  const use = gl.useProgram;
  gl.useProgram = function (p) {
    if (p !== null && !tied.has(p)) {
      tied.add(p);
      for (const K of KINDS) {
        const i = gl.getUniformBlockIndex(p, K.block);
        if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, i, K.bind);
      }
    }
    return use.call(gl, p);
  };

  const B = { uploads: 0, skipped: 0 };
  let lastPass = -1;
  let lastSrc = null;
  // (desde core/drawCost, en cada subida de uniforms de un material con luces)
  B.sync = (values, pass) => {
    const src = values.pointLights.value;
    if (pass === lastPass && src === lastSrc) return;
    lastPass = pass;
    lastSrc = src;
    for (const K of KINDS) {
      const u = values[K.id];
      if (u === undefined) continue;
      const L = u.value;
      const len = L.length * K.n;
      if (len === 0) continue;
      if (K.data.length < len) {
        // (más luces que lugar: el doble)
        const n2 = Math.max(len, K.data.length * 2);
        K.data = new Float32Array(n2);
        K.last = new Float32Array(n2);
        K.len = -1;
        alloc(K);
      }
      const f = K.data;
      for (let i = 0; i < L.length; i++) K.put(f, i * K.n, L[i]);
      // (igual a lo que ya está en la placa: la cámara quieta y nada titila)
      let same = K.len === len;
      const o = K.last;
      for (let i = 0; same && i < len; i++) if (o[i] !== f[i]) same = false;
      if (same) {
        B.skipped++;
        continue;
      }
      for (let i = 0; i < len; i++) o[i] = f[i];
      K.len = len;
      if (globalThis.__mduLucesUnBuffer !== true) K.at = (K.at + 1) % RING;
      const buf = K.ring[K.at];
      gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, f, 0, len);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, K.bind, buf);
      B.uploads++;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  };
  // la lista de uniforms que three recorre en cada dibujo, sin los de los bloques
  B.gate = (U) => {
    if (U.__mduLB) return;
    U.__mduLB = true;
    const swv = U.seqWithValue;
    U.seqWithValue = function (seq, values) {
      const r = swv.call(this, seq, values);
      for (let i = r.length - 1; i >= 0; i--) if (IDS.has(r[i].id) && inBlock(r[i])) r.splice(i, 1);
      return r;
    };
  };
  return B;
}
