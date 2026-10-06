import * as THREE from 'three';

// Lo que three hace en cada dibujo y se puede ahorrar sin cambiar nada de lo
// que se ve. Con zombies, el límite del cuadro es la CPU de dibujar: ~350
// dibujos por cuadro en el muelle del penal, ~9 µs cada uno (cada µs por
// dibujo es ~0,35 ms por cuadro).
// 1. Las matrices de las sombras (sol, direccionales, focos, puntuales) se
//    volvían a armar y comparar en cada cambio de material (flatten + toArray
//    de cada matriz). three ya sube las luces solo al cambiar de programa o de
//    cámara (markUniformsLightsNeedsUpdate): esas matrices son parte de las
//    luces y no cambian entre esos momentos; acá van con la misma marca.
//    globalThis.__mduNoShadowMatGate: como antes.
// 2. Un material compartido entre un InstancedMesh y mallas comunes (los de la
//    biblioteca: hierro, madera, bronce...) hacía que three buscara de nuevo el
//    programa en cada paso de uno al otro (getProgram + getParameters, ~8 por
//    cuadro en el penal). El instanciado se dibuja con un gemelo: un objeto que
//    hereda todo del material (Object.create: color, mapas, versión... del
//    original, en vivo) con su propio número, y three le guarda su programa
//    (el mismo que ya tenía el instanciado: misma clave, no compila nada). Su
//    onBeforeCompile corre con this = gemelo: los de este juego (fx/Surfaces,
//    TAA, ...) arman los uniforms con lo que tiene el material o con objetos
//    compartidos y no se guardan el shader, así que queda igual.
//    globalThis.__mduNoInstTwin: como antes.
// 3. Las luces (~20 puntuales en el penal, con sus sombras) se volvían a subir
//    en cada cambio de programa: con ~130 cambios por cuadro, el mismo programa
//    recibía las mismas luces varias veces. Los uniforms quedan guardados en
//    cada programa, y dentro de un mismo render (misma cámara, mismas luces)
//    no cambian: se suben la primera vez que se usa el programa en ese render.
//    Un render adentro de otro (o el siguiente) cuenta como otro: se vuelven a
//    subir. globalThis.__mduNoLightOnce: como antes.
// 4. Lo transparente de doble cara con mezcla normal (los fantasmas azules del
//    penal, op 0,42) three lo dibuja en dos pasadas, atrás y adelante,
//    cambiándole side y needsUpdate al material: cada pasada volvía a buscar el
//    programa (getProgram + getParameters, 2 por objeto en cada render: ~24 µs
//    por dibujo). Acá se hacen las mismas dos pasadas con dos gemelos fijos
//    (uno de atrás y uno de adelante): mismos programas, mismos uniforms, sin
//    rebuscar. El material queda con forceSinglePass para que three lo mande
//    una vez. Sin los de transmisión (su pasada propia mira forceSinglePass)
//    ni ShaderMaterial (uniformsNeedUpdate se escribe en el material).
//    globalThis.__mduNoTwoPassTwin: como antes.
// 5. Las luces de un render al siguiente: el primer dibujo de cada programa en
//    cada render volvía a subir todas las luces (23 puntuales en el penal, sus
//    sombras, matrices, la sonda...: ~140 uniforms comparados uno por uno, ~30
//    µs por programa, ~30 programas por cuadro). Cada lista de luces de three
//    (lights.state.point, .pointShadow, ...) se resume una vez por render; si no
//    cambió desde la última vez que ese programa la recibió (mismo origen, misma
//    versión), ya tiene esos valores y no se vuelve a subir. Lo que depende de
//    la cámara (posiciones en vista) cambia al moverse y se sube como antes; las
//    sombras, las matrices de sombra, la ambiente y la sonda casi nunca.
//    En las listas de structs (pointLights, sus sombras, ...) va por campo: si
//    solo cambiaron los colores (los fuegos titilan) se suben solo los colores
//    de cada luz, no posición, alcance y caída (antes ~92 uniforms por programa
//    con 23 puntuales, ahora ~23).
//    globalThis.__mduNoLightVer: como antes. (__mduLightVerCheck: compara lo que
//    se saltea con lo último subido; las diferencias en __mduLightVerBad.)

const SHADOW_MATS = ['sunShadowMatrix', 'directionalShadowMatrix', 'spotLightMatrix', 'pointShadowMatrix'];
// las que three marca en markUniformsLightsNeedsUpdate (sin los samplers: sus
// unidades de textura se reparten en cada dibujo)
const LIGHTS = ['ambientLightColor', 'lightProbe', 'sunLights', 'sunLightShadows', 'directionalLights', 'directionalLightShadows', 'pointLights', 'pointLightShadows', 'spotLights', 'spotLightShadows', 'rectAreaLights', 'hemisphereLights', ...SHADOW_MATS];
// cambia al entrar y al salir de cada render
let pass = 0;
const twins = new WeakMap();

function twinOf(m) {
  let t = twins.get(m);
  if (t !== undefined) return t;
  t = Object.create(m);
  Object.defineProperty(t, 'id', { value: new THREE.Material().id });
  t._listeners = undefined;
  twins.set(m, t);
  // (al soltar el original se suelta el programa del gemelo)
  const drop = () => {
    m.removeEventListener('dispose', drop);
    twins.delete(m);
    t.dispatchEvent({ type: 'dispose' });
  };
  m.addEventListener('dispose', drop);
  return t;
}

// los dos gemelos de una cara (atrás, adelante) de un material de doble cara
const sides = new WeakMap();
function sideTwin(m, side) {
  let p = sides.get(m);
  if (p === undefined) {
    p = [];
    sides.set(m, p);
    m.addEventListener('dispose', function drop() {
      m.removeEventListener('dispose', drop);
      sides.delete(m);
      for (const t of p) t?.dispatchEvent({ type: 'dispose' });
    });
  }
  let t = p[side];
  if (t === undefined) {
    t = p[side] = Object.create(m);
    Object.defineProperty(t, 'id', { value: new THREE.Material().id });
    t._listeners = undefined;
    t.side = side;
  }
  return t;
}

// (pruebas) lo que se salta, ¿habría cambiado algo en la placa? Sube solo las
// luces contando las llamadas gl.uniform*: con las mismas luces, ninguna.
// Las que habrían cambiado se suman en globalThis.__mduLightOnceBad.
const LIGHT_SET = new Set(LIGHTS);
const snapOf = (ms) => ms.flatMap((m) => [...m.elements]);
function check(upload, gl, seq, values, textures) {
  const saved = [];
  for (const u of seq) {
    if (LIGHT_SET.has(u.id)) continue;
    const v = values[u.id];
    saved.push(v, v.needsUpdate);
    v.needsUpdate = false;
  }
  let calls = 0;
  const cg = new Proxy(gl, { get: (t, p) => (typeof t[p] === 'function' ? (...a) => (String(p).startsWith('uniform') && calls++, t[p](...a)) : t[p]) });
  const why = (globalThis.__mduLightOnceWhy ||= {});
  for (const u of seq) {
    const v = values[u.id];
    if (!LIGHT_SET.has(u.id) || v.needsUpdate === false) continue;
    // (las listas de matrices three las sube siempre, sin caché: se comparan con las de la primera vez)
    if (SHADOW_MATS.includes(u.id)) {
      if (snapOf(v.value).some((x, i) => x !== u.__mduSnap?.[i])) why[u.id] = (why[u.id] || 0) + 1;
      continue;
    }
    const c0 = calls;
    u.setValue(cg, v.value, textures);
    if (calls > c0) why[u.id] = (why[u.id] || 0) + calls - c0;
  }
  for (let i = 0; i < saved.length; i += 2) saved[i].needsUpdate = saved[i + 1];
  if (calls) globalThis.__mduLightOnceBad = (globalThis.__mduLightOnceBad || 0) + calls;
}

// (5) cada lista de luces, resumida en números una vez por render: su versión
// sube si cambió algo desde el render anterior (NaN o algo raro: siempre cambia)
const lver = new WeakMap();
const tmp = [];
function flat(v) {
  if (typeof v === 'number') {
    tmp.push(v);
    return;
  }
  if (typeof v === 'boolean') {
    tmp.push(v ? 1 : 0);
    return;
  }
  if (v === null || typeof v !== 'object' || v.isTexture === true) {
    tmp.push(NaN);
    return;
  }
  if (v.elements !== undefined) {
    const e = v.elements;
    for (let i = 0; i < e.length; i++) tmp.push(e[i]);
    return;
  }
  if (v.isColor === true) {
    tmp.push(v.r, v.g, v.b);
    return;
  }
  if (v.isVector3 === true) {
    tmp.push(v.x, v.y, v.z);
    return;
  }
  if (v.isVector2 === true) {
    tmp.push(v.x, v.y);
    return;
  }
  if (v.isVector4 === true || v.isQuaternion === true) {
    tmp.push(v.x, v.y, v.z, v.w);
    return;
  }
  if (Array.isArray(v)) {
    tmp.push(v.length);
    for (let i = 0; i < v.length; i++) flat(v[i]);
    return;
  }
  // (los structs de cada luz: siempre armados igual)
  for (const k in v) flat(v[k]);
}
function verOf(val) {
  let d = lver.get(val);
  if (d === undefined) lver.set(val, (d = { pass: -1, ver: 0, snap: null }));
  if (d.pass === pass) return d.ver;
  d.pass = pass;
  tmp.length = 0;
  flat(val);
  const s = d.snap;
  const n = tmp.length;
  let same = s !== null && s.length === n;
  for (let i = 0; same && i < n; i++) if (s[i] !== tmp[i]) same = false;
  if (!same) {
    d.ver++;
    if (s !== null && s.length === n) for (let i = 0; i < n; i++) s[i] = tmp[i];
    else d.snap = Float64Array.from(tmp);
  }
  return d.ver;
}
// las luces que el programa ya tiene con estos valores no se suben (el uniform
// de three es del programa: guarda de qué lista y versión vino lo último)
// (5) en una lista de structs, versión por campo (el mismo campo de todas las
// luces): los nombres salen del primer struct (three los arma todos iguales)
const lfv = new WeakMap();
function fieldsOf(val) {
  let d = lfv.get(val);
  if (d === undefined) lfv.set(val, (d = { pass: -1, keys: [], ver: Object.create(null), snap: Object.create(null) }));
  if (d.pass === pass) return d;
  d.pass = pass;
  const keys = d.keys;
  keys.length = 0;
  const e0 = val[0];
  if (e0 !== undefined && e0 !== null && typeof e0 === 'object') for (const k in e0) keys.push(k);
  for (let q = 0; q < keys.length; q++) {
    const k = keys[q];
    tmp.length = 0;
    tmp.push(val.length);
    for (let i = 0; i < val.length; i++) flat(val[i]?.[k]);
    const s = d.snap[k];
    const n = tmp.length;
    let same = s !== undefined && s.length === n;
    for (let i = 0; same && i < n; i++) if (s[i] !== tmp[i]) same = false;
    if (!same) {
      d.ver[k] = (d.ver[k] || 0) + 1;
      if (s !== undefined && s.length === n) for (let i = 0; i < n; i++) s[i] = tmp[i];
      else d.snap[k] = Float64Array.from(tmp);
    }
  }
  return d;
}
// (pruebas) lo que se saltea, ¿es igual a lo último subido a ese programa?
function chkField(u, k, val, skip) {
  tmp.length = 0;
  tmp.push(val.length);
  for (let i = 0; i < val.length; i++) flat(val[i]?.[k]);
  const C = (u.__mduChkF ||= Object.create(null));
  const c = C[k];
  if (skip && c) {
    let bad = c.length !== tmp.length;
    for (let j = 0; !bad && j < tmp.length; j++) if (c[j] !== tmp[j]) bad = true;
    if (bad) globalThis.__mduLightVerBad = (globalThis.__mduLightVerBad || 0) + 1;
    globalThis.__mduLightVerSkip = (globalThis.__mduLightVerSkip || 0) + 1;
  } else C[k] = Float64Array.from(tmp);
}
// un struct de la lista: todos sus campos tienen que ser uniforms comunes
function structList(u, val) {
  if (u.__mduSL !== undefined) return u.__mduSL;
  let ok = Array.isArray(val) && Array.isArray(u.seq) && u.seq.length > 0;
  if (ok) for (const e of u.seq) if (!Array.isArray(e.seq) || typeof e.id !== 'number') ok = false;
  return (u.__mduSL = ok);
}

function lightVer(seq, values, gl, textures) {
  let L = seq.__mduL;
  if (L === undefined) {
    L = [];
    for (const u of seq) if (LIGHT_SET.has(u.id)) L.push(u);
    seq.__mduL = L;
  }
  const chk = globalThis.__mduLightVerCheck === true;
  for (let i = 0; i < L.length; i++) {
    const u = L[i];
    const v = values[u.id];
    if (v === undefined || v.needsUpdate === false) continue;
    const val = v.value;
    if (globalThis.__mduNoLightField !== true && structList(u, val)) {
      // por campo: los que cambiaron, de todas las luces; los demás ya están
      const d = fieldsOf(val);
      const keys = d.keys;
      if (u.__mduS !== val || u.__mduF === undefined) {
        // (primera vez o de otra lista: three sube todo)
        u.__mduS = val;
        u.__mduV = undefined;
        const F = (u.__mduF = Object.create(null));
        for (let q = 0; q < keys.length; q++) {
          F[keys[q]] = d.ver[keys[q]];
          if (chk) chkField(u, keys[q], val, false);
        }
        continue;
      }
      v.needsUpdate = false;
      const F = u.__mduF;
      const es = u.seq;
      for (let q = 0; q < keys.length; q++) {
        const k = keys[q];
        const kv = d.ver[k];
        if (F[k] === kv) {
          if (chk) chkField(u, k, val, true);
          continue;
        }
        F[k] = kv;
        for (let j = 0; j < es.length; j++) {
          const e = es[j];
          const f = e.map[k];
          const el = val[e.id];
          if (f !== undefined && el !== undefined) f.setValue(gl, el[k], textures);
        }
        if (chk) chkField(u, k, val, false);
      }
      continue;
    }
    const ver = verOf(val);
    if (u.__mduS === val && u.__mduV === ver) {
      if (chk) {
        tmp.length = 0;
        flat(val);
        const c = u.__mduChk;
        if (c) {
          let bad = c.length !== tmp.length;
          for (let j = 0; !bad && j < tmp.length; j++) if (c[j] !== tmp[j]) bad = true;
          if (bad) globalThis.__mduLightVerBad = (globalThis.__mduLightVerBad || 0) + 1;
          globalThis.__mduLightVerSkip = (globalThis.__mduLightVerSkip || 0) + 1;
        } else u.__mduChk = Float64Array.from(tmp);
      }
      v.needsUpdate = false;
    } else {
      u.__mduS = val;
      u.__mduV = ver;
      u.__mduF = undefined;
      if (chk) {
        tmp.length = 0;
        flat(val);
        u.__mduChk = Float64Array.from(tmp);
      }
    }
  }
}

function gateShadowMatrices(U) {
  if (U.__mduGate) return;
  U.__mduGate = true;
  const upload = U.upload;
  U.upload = function (gl, seq, values, textures) {
    const pl = values.pointLights;
    if (pl !== undefined) {
      // (la marca que three acaba de poner a las luces de este material)
      const nu = globalThis.__mduNoShadowMatGate === true ? undefined : pl.needsUpdate;
      for (let i = 0; i < SHADOW_MATS.length; i++) {
        const v = values[SHADOW_MATS[i]];
        if (v !== undefined) v.needsUpdate = nu;
      }
      // (el primer uniform de la lista es del programa: marca que ya tiene las luces de este render)
      if (pl.needsUpdate === true && seq.length > 0) {
        const k = seq[0];
        const once = globalThis.__mduNoLightOnce !== true;
        if (once && k.__mduLit === pass) {
          if (globalThis.__mduLightOnceCheck === true) check(upload, gl, seq, values, textures);
          for (let i = 0; i < LIGHTS.length; i++) {
            const v = values[LIGHTS[i]];
            if (v !== undefined) v.needsUpdate = false;
          }
        } else {
          if (once) {
            k.__mduLit = pass;
            if (globalThis.__mduLightOnceCheck === true) for (const u of seq) if (SHADOW_MATS.includes(u.id)) u.__mduSnap = snapOf(values[u.id].value);
          }
          if (globalThis.__mduNoLightVer !== true) lightVer(seq, values, gl, textures);
        }
      }
    }
    return upload.call(this, gl, seq, values, textures);
  };
}

export function drawCost(renderer) {
  if (renderer.__drawCost) return;
  renderer.__drawCost = true;
  const render = renderer.render;
  renderer.render = function (scene, camera) {
    pass++;
    try {
      return render.call(renderer, scene, camera);
    } finally {
      pass++;
    }
  };
  const rbd = renderer.renderBufferDirect;
  let gated = false;
  const draw = (camera, scene, geometry, material, object, group) => {
    if (object.isInstancedMesh === true && material.isMeshStandardMaterial === true && globalThis.__mduNoInstTwin !== true) material = twinOf(material);
    rbd.call(renderer, camera, scene, geometry, material, object, group);
    if (!gated) {
      // (la clase de los uniforms de three, de un programa que ya se usó)
      const pr = renderer.properties.get(material).currentProgram;
      if (pr) {
        gateShadowMatrices(pr.getUniforms().constructor);
        gated = true;
      }
    }
  };
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (material.transparent === true) {
      if (material.__mdu2p === true) {
        if (material.side === THREE.DoubleSide) {
          if (globalThis.__mduNoTwoPassTwin === true) {
            // (como three: cambiándole la cara y needsUpdate)
            material.side = THREE.BackSide;
            material.needsUpdate = true;
            draw(camera, scene, geometry, material, object, group);
            material.side = THREE.FrontSide;
            material.needsUpdate = true;
            draw(camera, scene, geometry, material, object, group);
            material.side = THREE.DoubleSide;
          } else {
            draw(camera, scene, geometry, sideTwin(material, THREE.BackSide), object, group);
            draw(camera, scene, geometry, sideTwin(material, THREE.FrontSide), object, group);
          }
          return;
        }
      } else if (material.side === THREE.BackSide && material.forceSinglePass === false && !(material.transmission > 0) && material.isShaderMaterial !== true && globalThis.__mduNoTwoPassTwin !== true) {
        // (la primera de las dos pasadas de three, o uno de una sola cara de
        // atrás: a ese forceSinglePass no le cambia nada)
        material.forceSinglePass = true;
        material.__mdu2p = true;
      }
    }
    draw(camera, scene, geometry, material, object, group);
  };
}
