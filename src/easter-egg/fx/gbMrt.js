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
// Sin OES_draw_buffers_indexed (ANGLE sobre OpenGL) o con
// globalThis.__mduGbAparte = true: la segunda pasada de antes (al cargar: sin
// tocar los shaders; durante el juego: se usa la pasada de antes, para comparar).
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

const CHUNK_DECL = `
#if defined( STANDARD ) || defined( PHONG ) || defined( LAMBERT ) || defined( TOON ) || defined( MATCAP ) || defined( MDU_GB_BASIC )
	#define MDU_GB 1
	layout( location = 1 ) out highp vec4 mduGb;
	uniform float mduGbRefl;
#endif
`;
const CHUNK_WRITE = `
#ifdef MDU_GB
{
	#ifdef MDU_GB_BASIC
		#ifdef FLAT_SHADED
			vec3 gbN = normalize( cross( dFdx( vMduGbV ), dFdy( vMduGbV ) ) );
		#else
			vec3 gbN = normalize( vMduGbN );
			#ifdef DOUBLE_SIDED
				gbN *= gl_FrontFacing ? 1.0 : - 1.0;
			#endif
		#endif
	#elif defined( MDU_GB_GEO )
		// (como la segunda pasada: el relieve del material solo en lo que refleja,
		// b >= 2; en lo mate, la normal de la geometría)
		vec3 gbN = mduGbRefl >= 0.13 ? normal : mduGeoN;
	#else
		vec3 gbN = normal;
	#endif
	// (el pasto, marcado con -7/15: la normal siempre hacia la cámara)
	if ( mduGbRefl < - 0.3 && mduGbRefl > - 0.6 && gbN.z < 0.0 ) gbN = - gbN;
	vec3 gbP = gbN * 0.5 + 0.5;
	// (una normal NaN, de un triángulo roto, queda mirando a la cámara)
	gbP = mix( gbP, vec3( 0.5, 0.5, 1.0 ), greaterThanEqual( floatBitsToUint( gbP ) & 0x7fffffffu, uvec3( 0x7f800000u ) ) );
	mduGb = vec4( gbP, mduGbRefl );
}
#endif
`;

// (apagado por defecto, 2026-10-12: medido en Épica no ganaba (la placa tardaba lo
// mismo, más tirones) y se perdían los haces de luz del penal y el sol entre el
// maíz de La Tapera. Se prende con globalThis.__mduGbMrt = true antes de cargar.)
if (globalThis.__mduGbMrt === true && globalThis.__mduGbAparte !== true) {
  const C = THREE.ShaderChunk;
  C.dithering_pars_fragment += CHUNK_DECL;
  C.dithering_fragment += CHUNK_WRITE;
  // la normal de la geometría, antes de que la toque el relieve del material
  C.normal_fragment_maps = '#define MDU_GB_GEO 1\nvec3 mduGeoN = normal;\n' + C.normal_fragment_maps;
  // el básico no tiene normal en el fragmento: se la pasa el vértice
  const B = THREE.ShaderLib.basic;
  B.vertexShader = B.vertexShader
    .replace('#include <common>', '#include <common>\n#define MDU_GB_BASIC 1\nout vec3 vMduGbN;\nout vec3 vMduGbV;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
	{
		vec3 gbO = normal;
		#ifdef USE_INSTANCING
			gbO = mat3( instanceMatrix ) * gbO;
		#endif
		vMduGbN = normalMatrix * gbO;
		vMduGbV = mvPosition.xyz;
	}`,
    );
  B.fragmentShader = B.fragmentShader.replace('#include <common>', '#define MDU_GB_BASIC 1\nin vec3 vMduGbN;\nin vec3 vMduGbV;\n#include <common>');
  GB.patched = true;
}

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
