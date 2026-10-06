import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Todo el cuerpo de los zombies en una sola llamada de dibujo por pasada.
// Cada prenda (pelvis, torso, brazos, sombrero, grilletes...) era su propia
// malla instanciada: con los ojos, 13-17 llamadas por pasada, y en Épica los
// zombies van en varias (la de color, el G-buffer, la sombra de la luna, los
// cubos de sombra de los fuegos, el reflejo del agua): con la horda afuera
// eran ~150 llamadas más por cuadro.
// Acá van todas las piezas fundidas en una geometría (cada vértice sabe de
// qué pieza es: zcol) y las texturas en un atlas (zuv). Las matrices y los
// colores siguen escribiéndose en las mallas de siempre (Zombies.meshes: las
// usan también la silueta de los últimos, la horda de las cinemáticas, el
// farol de las ánimas...), que ya no se dibujan: antes de dibujar se copian a
// una textura (una fila por zombie) y el vértice busca ahí su matriz.
// Los ojos siguen aparte (brillan, sin luz ni sombra).
// (globalThis.__mduNoZBatch, al armar el mapa: como antes)

const CELL = 512;
const PAD = 16;
const TEX_PER_COL = 5; // 4 de la matriz + el color

export function zombieBatchOn() {
  return globalThis.__mduNoZBatch !== true;
}

// El código de vértice que pone cada pieza en su lugar (color, G-buffer, sombras).
function patchVertex(s, U) {
  s.uniforms.zTex = U;
  s.vertexShader = s.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
uniform highp sampler2D zTex;
attribute float zcol;
mat4 zMatrix() {
	int c = int(zcol + 0.5) * ${TEX_PER_COL};
	int r = gl_InstanceID;
	return mat4(texelFetch(zTex, ivec2(c, r), 0), texelFetch(zTex, ivec2(c + 1, r), 0), texelFetch(zTex, ivec2(c + 2, r), 0), texelFetch(zTex, ivec2(c + 3, r), 0));
}`,
    )
    .replace('void main() {', 'void main() {\n\tmat4 zM = zMatrix();')
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
	{
		mat3 zm3 = mat3(zM);
		objectNormal = zm3 * (objectNormal / max(vec3(dot(zm3[0], zm3[0]), dot(zm3[1], zm3[1]), dot(zm3[2], zm3[2])), vec3(1e-8)));
	}`,
    )
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = (zM * vec4(transformed, 1.0)).xyz;');
}

// (aparte: un cierre armado en el constructor guardaría también el `this`, y
// fx/Epic lo tiene hasta que cambia el mapa)
const gbufOf = (U) => ({ key: 'zbatch', solid: true, patch: (s) => patchVertex(s, U) });

// El atlas: cada textura en su celda, con un borde de la misma textura dada
// vuelta (son de repetir): así el mipmap de lejos no mezcla una tela con la otra.
function buildAtlas(texs) {
  const n = texs.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const W = cols * CELL;
  const H = rows * CELL;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const S = CELL - PAD * 2;
  const cells = new Map();
  texs.forEach((t, i) => {
    const x0 = (i % cols) * CELL;
    const y0 = Math.floor(i / cols) * CELL;
    const img = t.image;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, CELL, CELL);
    ctx.clip();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      try {
        ctx.drawImage(img, x0 + PAD + dx * S, y0 + PAD + dy * S, S, S);
      } catch {
        /* sin imagen: queda vacía */
      }
    }
    ctx.restore();
    // (la textura va con flipY: v = 1 es el borde de arriba del canvas)
    cells.set(t, [(x0 + PAD) / W, (H - y0 - PAD - S) / H, S / W, S / H]);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, cells };
}

// El brillo propio de una prenda (las grietas de luz de Eclipse:
// material.userData.zGlow, cuánto brilla el color de la pieza).
// (globalThis.__mduNoZGlow, al armar el mapa: sin brillo)
const glowOf = (m) => (globalThis.__mduNoZGlow === true ? 0 : m.userData?.zGlow || 0);

// Un trozo de la geometría con sus atributos de pieza (zcol), atlas (zuv) y
// rugosidad/metal (zmr); gl: su brillo (zgl), solo si alguna prenda brilla.
function piece(geo, col, cell, mat, gl = null) {
  const g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  // (todas con índice: así se funden sin repetir vértices)
  if (!g.index) {
    const ix = new Uint32Array(n);
    for (let i = 0; i < n; i++) ix[i] = i;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
  }
  const zc = new Float32Array(n).fill(col);
  const zu = new Float32Array(n * 4);
  const zm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    zu.set(cell, i * 4);
    zm[i * 2] = mat.roughness ?? 0.9;
    zm[i * 2 + 1] = mat.metalness ?? 0;
  }
  g.setAttribute('zcol', new THREE.BufferAttribute(zc, 1));
  g.setAttribute('zuv', new THREE.BufferAttribute(zu, 4));
  g.setAttribute('zmr', new THREE.BufferAttribute(zm, 2));
  if (gl != null) g.setAttribute('zgl', new THREE.BufferAttribute(new Float32Array(n).fill(gl), 1));
  g.groups = [];
  return g;
}

// Los trozos de una malla con varios materiales (la cabeza: la cara en una sola de sus caras).
function split(geo) {
  if (!geo.groups?.length) return [[geo, 0]];
  const src = geo.index ? geo : null;
  const out = [];
  for (const gr of geo.groups) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    if (src) {
      const idx = src.index.array.slice(gr.start, gr.start + gr.count);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    } else {
      // (sin índice: los vértices del grupo, de corrido)
      for (const [k, a] of Object.entries(geo.attributes)) {
        const s = a.itemSize;
        g.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * s, (gr.start + gr.count) * s), s));
      }
    }
    out.push([g, gr.materialIndex ?? 0]);
  }
  return out;
}

export default class ZombieBatch {
  // meshes: Zombies.meshes (sin los ojos se funden); max: zombies a la vez.
  constructor(Z, meshes, max) {
    this.Z = Z;
    this.list = meshes.filter((M) => M.key !== 'eye');
    // una columna por cada pieza de cada prenda
    let col = 0;
    for (const M of this.list) {
      M.col0 = col;
      col += M.parts.length;
    }
    this.cols = col;
    this.max = max;
    const W = col * TEX_PER_COL;
    this.data = new Float32Array(W * max * 4);
    this.tex = new THREE.DataTexture(this.data, W, max, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.U = { value: this.tex };
    // las texturas que usan (cada material, su mapa)
    const mats = (M) => (Array.isArray(M.im.material) ? M.im.material : [M.im.material]);
    const texs = [];
    for (const M of this.list) for (const m of mats(M)) if (m.map && !texs.includes(m.map)) texs.push(m.map);
    const atlas = buildAtlas(texs);
    this.atlas = atlas.tex;
    const blank = [0, 0, 0, 0];
    // ¿alguna prenda brilla sola? (las grietas de Eclipse; en los demás mapas
    // ninguna: el programa queda como siempre)
    const glow = this.list.some((M) => mats(M).some((m) => glowOf(m) > 0));
    const parts = [];
    for (const M of this.list) {
      const ms = mats(M);
      const chunks = Array.isArray(M.im.material) ? split(M.im.geometry) : [[M.im.geometry, 0]];
      for (let k = 0; k < M.parts.length; k++) {
        for (const [geo, mi] of chunks) {
          const m = ms[mi] || ms[0];
          parts.push(piece(geo, M.col0 + k, atlas.cells.get(m.map) || blank, m, glow ? glowOf(m) : null));
        }
      }
    }
    const geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    const U = this.U;
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas, bumpMap: this.atlas, bumpScale: 1.5, roughness: 1, metalness: 1 });
    mat.onBeforeCompile = (s) => {
      patchVertex(s, U);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 zuv;\nattribute vec2 zmr;\nvarying vec3 vZCol;\nvarying vec2 vZMr;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
	vMapUv = zuv.xy + vMapUv * zuv.zw;
	vBumpMapUv = zuv.xy + vBumpMapUv * zuv.zw;
	vZCol = texelFetch(zTex, ivec2(int(zcol + 0.5) * ${TEX_PER_COL} + 4, gl_InstanceID), 0).rgb;
	vZMr = zmr;`,
        );
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vZCol;\nvarying vec2 vZMr;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= vZCol;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vZMr.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vZMr.y;')
        // el borde de luz fría de siempre (Zombies rim)
        .replace(
          '#include <opaque_fragment>',
          `float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += vec3(0.1, 0.13, 0.18) * rimK * 0.45;
      #include <opaque_fragment>`,
        );
      // las prendas que brillan: su color por su brillo, con luz o sin ella
      if (glow) {
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float zgl;\nvarying float vZGl;').replace('vZMr = zmr;', 'vZMr = zmr;\n\tvZGl = zgl;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vZGl;').replace('#include <opaque_fragment>', 'outgoingLight += vZCol * vZGl;\n      #include <opaque_fragment>');
      }
    };
    mat.customProgramCacheKey = () => (glow ? 'zbatch-glow' : 'zbatch');
    // (core/sceneFlush la suelta con el material al cambiar de mapa)
    mat.zTexture = this.tex;
    // el G-buffer de Épica (fx/Epic.js) arma su material con este mismo vértice
    mat.userData.gbuf = gbufOf(U);
    // (como los de fx/Epic depthVariant)
    const depth = new THREE.MeshDepthMaterial();
    const dist = new THREE.MeshDistanceMaterial();
    for (const m of [depth, dist]) {
      m.onBeforeCompile = (s) => patchVertex(s, U);
      m.customProgramCacheKey = () => 'zbatch';
    }
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    // (las matrices de las instancias quedan en la identidad: lo que mueve es zTex)
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = depth;
    mesh.customDistanceMaterial = dist;
    mesh.count = 0;
    mesh.name = 'zombieBatch';
    this.mesh = mesh;
    this.ver = -1;
    mesh.onBeforeRender = () => this.sync();
    // (las sombras se dibujan antes que el color)
    mesh.onBeforeShadow = () => this.sync();
    // las de siempre ya no se dibujan (siguen guardando las matrices)
    for (const M of this.list) M.im.layers.set(31);
  }

  // Zombies.render: cuántas filas se dibujan. (La sombra la prende fx/Epic
  // shadowCasters, como a las de siempre.)
  frame() {
    // (para comparar en vivo: globalThis.__mduZBatchOff = true dibuja las de siempre)
    const off = globalThis.__mduZBatchOff === true;
    if (off !== !!this.off) {
      this.off = off;
      for (const M of this.list) M.im.layers.set(off ? 0 : 31);
    }
    if (off) {
      this.mesh.visible = false;
      return;
    }
    let rows = 0;
    for (const M of this.list) if (M.im.visible) rows = Math.max(rows, Math.ceil(M.im.count / M.parts.length));
    const m = this.mesh;
    m.count = rows;
    m.visible = rows > 0;
    // (se mueven todo el tiempo: la caché de sombras de fx/Epic lo mira acá)
    if (rows) m.instanceMatrix.needsUpdate = true;
  }

  // Antes de dibujar (la primera pasada del cuadro, o si alguien las tocó
  // después): las matrices y los colores a la textura.
  sync() {
    let v = 0;
    for (const M of this.list) v += M.im.instanceMatrix.version + (M.im.instanceColor?.version || 0) * 7919;
    if (v === this.ver) return;
    this.ver = v;
    const d = this.data;
    const rows = Math.min(this.max, this.mesh.count || this.max);
    const W = this.cols * TEX_PER_COL;
    for (const M of this.list) {
      const np = M.parts.length;
      const A = M.im.instanceMatrix.array;
      const C = M.im.instanceColor?.array;
      const vis = M.im.visible;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < np; k++) {
          const i = r * np + k;
          const o = (r * W + (M.col0 + k) * TEX_PER_COL) * 4;
          if (!vis || i >= M.im.count) {
            d.fill(0, o, o + 16);
          } else {
            for (let q = 0; q < 16; q++) d[o + q] = A[i * 16 + q];
          }
          if (C) {
            d[o + 16] = C[i * 3];
            d[o + 17] = C[i * 3 + 1];
            d[o + 18] = C[i * 3 + 2];
          } else d[o + 16] = d[o + 17] = d[o + 18] = 1;
          d[o + 19] = 1;
        }
      }
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.customDepthMaterial.dispose();
    this.mesh.customDistanceMaterial.dispose();
    this.tex.dispose();
    this.atlas.dispose();
  }
}
