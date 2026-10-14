import * as THREE from 'three';

// B (tanda de optimización, 2026-10-12; el usuario: "dale para adelante"): el
// G-buffer de Épica (la normal en vista y cuánto refleja cada material, para la
// oclusión, los reflejos, el rebote y los haces de luna) salía de una segunda
// pasada que dibujaba el mundo otra vez con MeshNormalMaterial (~214 dibujos en
// Eclipse). Medido el techo: sin esa pasada el cuadro bajaba 8-13 %.
// Ahora la pasada principal escribe las dos imágenes a la vez (MRT): el color en
// la salida 0 y la normal + el reflejo en la 1 (fx/PostFX WorldPass). Los
// materiales de three (los de luz y el básico) escriben la 1 desde el final de su
// shader (dithering_fragment); lo que la segunda pasada salteaba (shaders propios,
// transparentes finos, recortes fuera del estero, partículas) no la escribe:
// colorMaski de OES_draw_buffers_indexed, dibujo por dibujo. El reflejo de cada
// material va en un uniform que se pone antes de cada dibujo (el programa de three
// no lo conoce: se lo sube acá, al lado de cada draw).
// Sin OES_draw_buffers_indexed (ANGLE sobre OpenGL): la segunda pasada de antes.
export const GB = {
  // los shaders de three ya escriben la salida 1
  patched: false,
  // se puede (la extensión está y los shaders escriben)
  ok: false,
  // la pasada principal está dibujando al MRT
  active: false,
  // qué escribe la salida 1 y con qué reflejo (los pone Epic: GBufferPass.skip, reflOf)
  writes: () => false,
  refl: () => 0,
  // lo que se pidió para el dibujo de ahora y lo que tiene el contexto
  want: true,
  mask: true,
  val: 0,
  gl: null,
  ext: null,
};

// (apagado por defecto, 2026-10-12: medido en Épica no ganaba (la placa tardaba lo
// mismo, más tirones) y se perdían los haces de luz del penal y el sol entre el
// maíz de La Tapera.)

// Una vez por renderer (lo llama Epic): el uniform del reflejo antes de cada
// draw, la máscara de la salida 1 dibujo por dibujo y que three no la pise.
export function gbInstall(renderer) {
  if (renderer.__gbMrt) return GB.ok;
  renderer.__gbMrt = true;
  const gl = renderer.getContext();
  const ext = GB.patched ? gl.getExtension('OES_draw_buffers_indexed') : null;
  GB.gl = gl;
  GB.ext = ext;
  GB.ok = !!ext;
  if (!ext) return false;
  // el programa en uso y el valor que ya tiene cada uno
  const locs = new WeakMap();
  let cur = null;
  const use = gl.useProgram.bind(gl);
  gl.useProgram = (p) => {
    cur = p;
    use(p);
  };
  const setRefl = () => {
    if (!GB.active || !cur) return;
    let L = locs.get(cur);
    if (!L) locs.set(cur, (L = { loc: gl.getUniformLocation(cur, 'mduGbRefl'), val: NaN }));
    if (L.loc && L.val !== GB.val) {
      gl.uniform1f(L.loc, GB.val);
      L.val = GB.val;
    }
  };
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const f = gl[k].bind(gl);
    gl[k] = (a, b, c, d, e) => {
      setRefl();
      return f(a, b, c, d, e);
    };
  }
  // three cambia la máscara de todas las salidas (colorWrite de cada material):
  // la de la 1 vuelve a lo pedido para este dibujo
  const cm = gl.colorMask.bind(gl);
  gl.colorMask = (r, g, b, a) => {
    cm(r, g, b, a);
    GB.mask = !!r;
    if (GB.active && GB.mask && !GB.want) {
      ext.colorMaskiOES(1, false, false, false, false);
      GB.mask = false;
    }
  };
  // antes de cada dibujo: si escribe la salida 1 y con qué reflejo
  const rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (GB.active) {
      const w = !!GB.writes(object, material);
      GB.want = w;
      GB.val = w ? GB.refl(material) / 15 : 0;
      if (w !== GB.mask) {
        ext.colorMaskiOES(1, w, w, w, w);
        GB.mask = w;
      }
    }
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
  return true;
}

// Al empezar la pasada principal al MRT: la salida 1 en "nada" (normal hacia la
// cámara, sin reflejo), como limpiaba la segunda pasada
const CLEAR_GB = new Float32Array([0.5, 0.5, 1, 0]);
export function gbBeginPass() {
  const { gl, ext } = GB;
  GB.active = true;
  ext.colorMaskiOES(1, true, true, true, true);
  GB.mask = true;
  GB.want = true;
  gl.clearBufferfv(gl.COLOR, 1, CLEAR_GB);
}
export function gbEndPass() {
  GB.active = false;
  if (!GB.mask) {
    GB.ext.colorMaskiOES(1, true, true, true, true);
    GB.mask = true;
  }
}
