import * as THREE from 'three';
import { GFX_PLUS, plusOn } from '../config/quality';
import { MAP_ID } from '../config/map';

// Sangre y barro que quedan (2026-10-12, el usuario, mejoras de Ultra y Épica
// #12: "con relieve y brillo"; "ojo con que carguen tarde que queda horrible").
// Los charcos de sangre de fx/Effects (calco 1) y, nuevo, el barro que deja un
// muerto al salir de la tierra:
//  - con relieve (normal map del espesor: el borde del charco se levanta) y
//    brillo de mojado que se seca de a poco (más oscuro y mate en un minuto);
//  - se abren al caer (0,45 s), no aparecen de golpe;
//  - quedan muchos más (480 en vez de 160) y el más viejo se va fundiendo
//    antes de que lo pise uno nuevo (antes desaparecía de golpe).
// Las texturas y el material se arman con el mapa y la malla está en la escena
// desde el principio (con 0 instancias): se compilan y suben en la llegada,
// nunca al primer charco. Lo que va en cada mapa y calidad: config/quality.js
// GFX_PLUS.stains. globalThis.__mduSinManchas: los calcos de siempre.

const CAP = 480;
// cuántos lugares antes del que se va a pisar empieza a fundirse
const AHEAD = 40;
const S = 256;

// Charcos pintados: sangre (izquierda) y barro (derecha), con su espesor.
function stainTextures() {
  const W = S * 2;
  const col = document.createElement('canvas');
  col.width = W;
  col.height = S;
  const cx = col.getContext('2d');
  // el espesor en un canvas aparte (gris), después se lo deriva en normales
  const hc = document.createElement('canvas');
  hc.width = W;
  hc.height = S;
  const hx = hc.getContext('2d');
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, W, S);
  let sd = 77;
  const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const blob = (ox, n, rad, spread, fill, hFill) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 1.6) * spread;
      const x = ox + S / 2 + Math.cos(a) * d;
      const y = S / 2 + Math.sin(a) * d * 0.85;
      const rr = rad * (0.35 + r() * 0.75) * (1 - (d / spread) * 0.55);
      for (const [ctx, f] of [[cx, fill], [hx, hFill]]) {
        ctx.fillStyle = f;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * (0.75 + r() * 0.4), r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // sangre: el charco del medio, gotas y salpicaduras alrededor
  blob(0, 26, 34, 52, 'rgba(92,6,4,0.96)', 'rgba(255,255,255,0.55)');
  blob(0, 60, 7, 108, 'rgba(78,4,3,0.92)', 'rgba(255,255,255,0.5)');
  // barro: terrones y una mancha más ancha y despareja
  blob(S, 30, 40, 58, 'rgba(84,56,30,0.95)', 'rgba(255,255,255,0.45)');
  blob(S, 70, 9, 100, 'rgba(70,46,25,0.93)', 'rgba(255,255,255,0.7)');
  // el espesor se suaviza (el borde del charco sube de a poco) y se deriva
  const src = hx.getImageData(0, 0, W, S).data;
  const h = new Float32Array(W * S);
  for (let i = 0; i < W * S; i++) h[i] = src[i * 4] / 255;
  const tmp = new Float32Array(W * S);
  const box = (a, b, rad) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += a[y * W + Math.min(W - 1, Math.max(0, x + k))];
        tmp[y * W + x] = s / (2 * rad + 1);
      }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += tmp[Math.min(S - 1, Math.max(0, y + k)) * W + x];
        b[y * W + x] = s / (2 * rad + 1);
      }
  };
  const hb = new Float32Array(W * S);
  box(h, hb, 3);
  // grumos del barro (ruido fino)
  for (let y = 0; y < S; y++) for (let x = S; x < W; x++) hb[y * W + x] += (r() - 0.5) * 0.06 * hb[y * W + x];
  const nd = new Uint8Array(W * S * 4);
  const k = 5.5;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = (hb[y * W + Math.min(W - 1, x + 1)] - hb[y * W + Math.max(0, x - 1)]) * k;
      const dy = (hb[Math.min(S - 1, y + 1) * W + x] - hb[Math.max(0, y - 1) * W + x]) * k;
      const l = Math.hypot(dx, dy, 1);
      nd[i * 4] = Math.round((-dx / l) * 127.5 + 127.5);
      nd[i * 4 + 1] = Math.round((dy / l) * 127.5 + 127.5);
      nd[i * 4 + 2] = Math.round((1 / l) * 127.5 + 127.5);
      nd[i * 4 + 3] = 255;
    }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const nmap = new THREE.DataTexture(nd, W, S, THREE.RGBAFormat);
  nmap.generateMipmaps = true;
  nmap.minFilter = THREE.LinearMipmapLinearFilter;
  nmap.magFilter = THREE.LinearFilter;
  nmap.needsUpdate = true;
  return { map, nmap };
}

export default class StainDecals {
  constructor(game, scene) {
    this.g = game;
    this.on = false;
    this.next = 0;
    this.used = 0;
    // (solo en los mapas que la llevan: en los otros no se arma nada)
    if (!GFX_PLUS.stains.maps[MAP_ID]) return;
    const { map, nmap } = stainTextures();
    this.uNow = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap: nmap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.3,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    // (no lo toca el relieve de paredes: ya trae el suyo)
    mat.userData.noRelief = true;
    const uNow = this.uNow;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNow = uNow;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aT;\nuniform float uNow;\nvarying vec3 vSt;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // se abre al caer: del 35 % a su tamaño en 0,45 s (el barro, más rápido)
          float stAge = uNow - aT.x;
          float stK = clamp(stAge / mix(0.45, 0.25, aT.y), 0.0, 1.0);
          stK = 1.0 - pow(1.0 - stK, 3.0);
          transformed.xy *= 0.35 + 0.65 * stK;
          // lo que se va: se funde en 2 s antes de que lo pise uno nuevo
          float stOut = aT.z > 0.0 ? 1.0 - smoothstep(0.0, 2.0, uNow - aT.z) : 1.0;
          // se seca de a poco (un minuto la sangre, medio el barro)
          vSt = vec3(smoothstep(0.0, 0.12, stAge) * stOut, smoothstep(3.0, mix(60.0, 30.0, aT.y), stAge), aT.y);`,
        )
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = vMapUv.x * 0.5 + aT.y * 0.5;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv.x = vNormalMapUv.x * 0.5 + aT.y * 0.5;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSt;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vSt.x;\ndiffuseColor.rgb *= mix(1.0, mix(0.55, 0.8, vSt.z), vSt.y);')
        // (el brillo, sin encandilar: va con la luz que le llega al charco. Con un
        // tope fijo, en Eclipse —oscuro y con la exposición alta— el reflejo del
        // cielo los volvía un disco blanco; quedan los brillos, nunca más que el piso)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nvec3 stIrr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.04));\nfloat stL = dot(stIrr, vec3(0.333)) * 0.22;\nreflectedLight.directSpecular = min(reflectedLight.directSpecular * 0.5, vec3(stL));\nreflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular * 0.3, vec3(stL * 0.4));')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(0.26, 0.6, vSt.z), mix(0.62, 0.9, vSt.z), vSt.y);');
    };
    mat.customProgramCacheKey = () => 'mdu-stain-1';
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aT = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.aT.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aT', this.aT);
    const m = new THREE.InstancedMesh(geo, mat, CAP);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 2;
    m.userData.reflect = false;
    // (sin charcos no se dibuja; escondida igual se compila en la llegada y al
    // cambiar la calidad, con lo escondido del mapa: ui/Arrival.js warmWorld)
    m.visible = false;
    (game.world.warmHidden ||= []).push(m);
    scene.add(m);
    this.mesh = m;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.z = new THREE.Vector3(0, 0, 1);
    this.n = new THREE.Vector3();
  }

  update() {
    if (!this.mesh) return;
    this.on = plusOn(this.g, 'stains');
    this.uNow.value = this.g.time || 0;
  }

  // p: el lugar (ya arriba de lo que tape el piso), n: la normal, kind 0 sangre, 1 barro
  add(kind, p, n, size) {
    if (!this.mesh) return;
    const now = this.g.time || 0;
    const i = this.next;
    this.q.setFromUnitVectors(this.z, this.n.set(n.x, n.y, n.z).normalize());
    this.q.multiply(this.q2.setFromAxisAngle(this.z, Math.random() * Math.PI * 2));
    this.m4.compose(p, this.q, this.s.set(size, size, size));
    this.mesh.setMatrixAt(i, this.m4);
    const a = this.aT.array;
    a[i * 4] = now;
    a[i * 4 + 1] = kind;
    a[i * 4 + 2] = 0;
    a[i * 4 + 3] = Math.random();
    this.next = (i + 1) % CAP;
    this.used = Math.min(CAP, this.used + 1);
    // el que se va a pisar dentro de AHEAD charcos empieza a irse
    if (this.used >= CAP - AHEAD) {
      const j = (i + AHEAD) % CAP;
      if (a[j * 4 + 2] === 0 && j < this.used) a[j * 4 + 2] = now;
    }
    this.mesh.count = this.used;
    this.mesh.visible = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aT.needsUpdate = true;
  }

  clear() {
    if (!this.mesh) return;
    this.next = 0;
    this.used = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}
