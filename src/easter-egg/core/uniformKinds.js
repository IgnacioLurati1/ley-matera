// Los uniforms de three, sin basura por cuadro.
//
// three guarda lo último que subió de cada uniform en un arreglo común (cache)
// y compara y copia contra él con dos funciones compartidas por todos los tipos
// (arraysEqual, copyArray). El motor de JS guarda los decimales de un arreglo
// de dos maneras: sueltos (un arreglo "de decimales") o cada uno en su cajita
// (un arreglo "genérico": cada número que se escribe pide memoria). Y cuando
// por un mismo lugar del código pasan arreglos de las dos clases, el código
// optimizado los pasa todos a genéricos, para siempre.
//
// 1. Por esas dos funciones pasan los arreglos de las matrices (modelViewMatrix,
//    modelMatrix, viewMatrix, normalMatrix, bindMatrix...) junto con arreglos
//    genéricos: al subirse, la matriz quedaba genérica, y de ahí se contagiaba a
//    todas las demás (el padre, la local, la cámara: por multiplyMatrices pasan
//    todas). Medido: 6.500 de 9.100 matrices del mundo genéricas en Eclipse, y
//    cada cuenta de matrices pedía 16 cajitas: ~140 KB por cuadro solo en
//    multiplyMatrices, más compose, makeRotationFromEuler, getNormalMatrix...
//    (105-135 MB por segundo en total: un recolector de basura grande de 60-146
//    ms cada 20-60 s, la traba). Acá las matrices sueltas (mat3, mat4) se suben
//    con una función propia, por la que solo pasan matrices, contra una caché
//    de decimales de verdad.
// 2. La caché de cada uniform nace genérica (las de los bool y las texturas
//    guardan cosas que no son decimales, y three las crea todas en el mismo
//    lugar): cada vec3 que cambiaba (las luces: posición y color de cada una,
//    en cada programa) pedía 3 cajitas, y otras 3 al llamar a gl.uniform3f
//    (cada decimal que se le pasa a una función del navegador va en su cajita):
//    ~160 KB por cuadro en Eclipse, unas 3.000 subidas. Los vec3 sueltos van
//    con una caché de decimales y se suben por uniform3fv desde un arreglo fijo
//    (se pasa el arreglo, no los tres números). El resto es de three.
//
// 3. Matrix4.toArray (lo usan setMatrixAt de las mallas instanciadas y los
//    huesos de los cuerpos con esqueleto: una copia por instancia y por hueso,
//    en cada cuadro) pedía 36 bytes por llamada: por el mismo lugar del código
//    pasan destinos de varias clases (Float32Array, arreglos comunes). Con un
//    Float32Array de destino, que es el caso de todos los cuadros, la copia va
//    por una función propia, por la que solo pasan matrices y Float32Array.
//    Medido en Eclipse con 12 muertos: Zombies.render 52,8 -> 23,2 KB por
//    cuadro, World.update 67 -> 20,7.
//
// globalThis.__mduThreeUniforms: como antes (se mira al estrenar cada programa).
// globalThis.__mduThreeV3: los vec3 con la función de three (y la caché nueva).
// globalThis.__mduThreeToArray: Matrix4.toArray como antes.

const FLOAT_VEC3 = 0x8b51;
const FLOAT_MAT3 = 0x8b5b;
const FLOAT_MAT4 = 0x8b5c;

const m4 = new Float32Array(16);
const m3 = new Float32Array(9);
const v3 = new Float32Array(3);
// las de three (una misma función para todos los uniforms del tipo): para los
// valores que no son una matriz (un arreglo suelto de números)
let threeM4 = null;
let threeM3 = null;
let threeV3 = null;

function setM4(gl, v) {
  const e = v.elements;
  if (e === undefined) {
    threeM4.call(this, gl, v);
    return;
  }
  const c = this.cache;
  if (c[0] === e[0] && c[1] === e[1] && c[2] === e[2] && c[3] === e[3] && c[4] === e[4] && c[5] === e[5] && c[6] === e[6] && c[7] === e[7] && c[8] === e[8] && c[9] === e[9] && c[10] === e[10] && c[11] === e[11] && c[12] === e[12] && c[13] === e[13] && c[14] === e[14] && c[15] === e[15]) return;
  for (let i = 0; i < 16; i++) m4[i] = c[i] = e[i];
  gl.uniformMatrix4fv(this.addr, false, m4);
}

function setM3(gl, v) {
  const e = v.elements;
  if (e === undefined) {
    threeM3.call(this, gl, v);
    return;
  }
  const c = this.cache;
  if (c[0] === e[0] && c[1] === e[1] && c[2] === e[2] && c[3] === e[3] && c[4] === e[4] && c[5] === e[5] && c[6] === e[6] && c[7] === e[7] && c[8] === e[8]) return;
  for (let i = 0; i < 9; i++) m3[i] = c[i] = e[i];
  gl.uniformMatrix3fv(this.addr, false, m3);
}

// un Vector3 o un Color; lo demás (un arreglo de tres números, otra cosa con
// x, y, z) va por la de three. (Se pregunta la clase y no "v.x !== undefined":
// así x se lee siempre del mismo tipo de objeto y no pide cajita.)
function setV3(gl, v) {
  const c = this.cache;
  if (v.isVector3 === true) {
    const x = v.x;
    const y = v.y;
    const z = v.z;
    if (c[0] !== x || c[1] !== y || c[2] !== z) {
      v3[0] = c[0] = x;
      v3[1] = c[1] = y;
      v3[2] = c[2] = z;
      gl.uniform3fv(this.addr, v3);
    }
  } else if (v.isColor === true) {
    const r = v.r;
    const g = v.g;
    const b = v.b;
    if (c[0] !== r || c[1] !== g || c[2] !== b) {
      v3[0] = c[0] = r;
      v3[1] = c[1] = g;
      v3[2] = c[2] = b;
      gl.uniform3fv(this.addr, v3);
    }
  } else threeV3.call(this, gl, v);
}

// (NaN: distinta de todo, la primera vez siempre se sube)
function doubles(n) {
  return new Float64Array(n).fill(NaN);
}

function own(list) {
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.seq !== undefined) {
      // (un struct o una lista de structs: sus campos)
      own(u.seq);
      continue;
    }
    // (un arreglo de three, "vec3 x[4]": lo aplana aparte, sin caché)
    if (u.size !== undefined || typeof u.setValue !== 'function' || !Array.isArray(u.cache)) continue;
    const t = u.type;
    if (t === FLOAT_MAT4) {
      if (threeM4 === null) threeM4 = u.setValue;
      if (u.setValue !== threeM4) continue;
      u.cache = doubles(16);
      u.setValue = setM4;
    } else if (t === FLOAT_MAT3) {
      if (threeM3 === null) threeM3 = u.setValue;
      if (u.setValue !== threeM3) continue;
      u.cache = doubles(9);
      u.setValue = setM3;
    } else if (t === FLOAT_VEC3) {
      if (threeV3 === null) threeV3 = u.setValue;
      if (u.setValue !== threeV3) continue;
      u.cache = doubles(3);
      if (globalThis.__mduThreeV3 !== true) u.setValue = setV3;
    }
  }
}

// U: la clase WebGLUniforms de three (la de un programa ya usado). Cada
// programa se prepara la primera vez que three le pone un valor suelto (lo
// hace al estrenarlo, antes de subirle la lista del material).
export function ownUniforms(U) {
  if (U.__mduOwn) return;
  U.__mduOwn = true;
  const setValue = U.prototype.setValue;
  U.prototype.setValue = function (gl, name, value, textures) {
    if (this.__mduOwn !== true) {
      this.__mduOwn = true;
      if (globalThis.__mduThreeUniforms !== true) own(this.seq);
    }
    return setValue.call(this, gl, name, value, textures);
  };
}

function put16(e, a, i) {
  a[i] = e[0];
  a[i + 1] = e[1];
  a[i + 2] = e[2];
  a[i + 3] = e[3];
  a[i + 4] = e[4];
  a[i + 5] = e[5];
  a[i + 6] = e[6];
  a[i + 7] = e[7];
  a[i + 8] = e[8];
  a[i + 9] = e[9];
  a[i + 10] = e[10];
  a[i + 11] = e[11];
  a[i + 12] = e[12];
  a[i + 13] = e[13];
  a[i + 14] = e[14];
  a[i + 15] = e[15];
}

// M4: la clase Matrix4 de three.
export function ownToArray(M4) {
  const three = M4.prototype.toArray;
  if (three.__mduOwn) return;
  const own = function (array, offset) {
    if (array instanceof Float32Array && globalThis.__mduThreeToArray !== true) {
      put16(this.elements, array, offset === undefined ? 0 : offset);
      return array;
    }
    return three.call(this, array, offset);
  };
  own.__mduOwn = true;
  M4.prototype.toArray = own;
}
