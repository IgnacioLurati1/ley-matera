import * as THREE from 'three';
import { buildSky3d } from './eclipseSky3d';

// La pelea del cielo de Eclipse Matero con cuerpo (grafica-v3, 2026-10-06).
// El usuario: "son dos bolas tapándose entre ellas, no se disparan con nada".
// Alrededor del eclipse (world/eclipseSky.js) andan Francisco (dorado, con su
// aureola y el poncho) y el Chiquitijuein (chico, torcido, negro con los ojos
// rojos), y se tiran cosas: lanzas y bolas de luz de oro de un lado, zarcillos
// y orbes negros del otro. Cruzan el cielo, chocan entre ellos y estallan
// (anillo, chispas que caen y un trueno lejos), le pegan al otro (que
// retrocede y pierde terreno) o fallan y se clavan en el cielo, que se raja
// (grietas nuevas que duran un rato). Quién va ganando (lead) corre el disco
// negro: muerde más o retrocede. El choque grande de siempre (w.eclipse:
// fightT, clashK, clashBig) ahora es los dos lanzándose uno sobre el otro.
//
// Todo es UN dibujo: cuadraditos (billboards) de un atlas pintado al cargar,
// a 250 m de la cámara en la dirección del eclipse (adentro del domo, que
// mide 300; las islas los tapan). Las cuentas van en el plano tangente al
// eclipse, las mismas coordenadas del sombreador del cielo: q = (hacia el
// cenit, de costado), en tangente del ángulo (el sol mide 0,07).
// globalThis.__mduNoSkyFight: nada de esto (como antes de la pelea).

const R = 250;
const MAX = 120;
const RS = 0.07;
// el atlas: 4 x 4 celdas
const CELL = { fran: 0, franCast: 1, chiq: 2, chiqCast: 3, spear: 4, orb: 5, dark: 6, tendril: 7, burst: 8, ring: 9, spark: 10, crack: 11, crack2: 12, gash: 13 };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------- el atlas ----------------
function paintAtlas() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const x = c.getContext('2d');
  const cell = (i, fn) => {
    x.save();
    x.translate((i % 4) * S, Math.floor(i / 4) * S);
    x.beginPath();
    x.rect(0, 0, S, S);
    x.clip();
    fn(x, S);
    x.restore();
  };
  // Francisco: de pie, la aureola atrás de la cabeza, el poncho en campana,
  // el sombrero; en `cast` el brazo derecho arriba con la luz en la mano
  const fran = (cast) => (g, s) => {
    const cx = s / 2;
    g.shadowColor = 'rgba(255,200,90,1)';
    g.shadowBlur = 18;
    // aureola (un anillo partido, como la del sol)
    g.strokeStyle = 'rgba(255,225,140,1)';
    g.lineWidth = 5;
    for (let k = 0; k < 7; k++) {
      if (k === 2 || k === 5) continue;
      g.beginPath();
      g.arc(cx, 58, 30, (k / 7) * Math.PI * 2 + 0.08, ((k + 1) / 7) * Math.PI * 2 - 0.08);
      g.stroke();
    }
    const gr = g.createLinearGradient(0, 40, 0, s - 10);
    gr.addColorStop(0, 'rgba(255,236,180,1)');
    gr.addColorStop(0.5, 'rgba(255,190,80,1)');
    gr.addColorStop(1, 'rgba(200,110,30,1)');
    g.fillStyle = gr;
    // cabeza y sombrero
    g.beginPath();
    g.arc(cx, 60, 13, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 24, 45, 48, 5);
    g.fillRect(cx - 12, 33, 24, 13);
    // el poncho
    g.beginPath();
    g.moveTo(cx - 12, 76);
    g.lineTo(cx + 12, 76);
    g.lineTo(cx + 48, 156);
    g.quadraticCurveTo(cx, 168, cx - 48, 156);
    g.closePath();
    g.fill();
    // las guardas del poncho
    g.strokeStyle = 'rgba(160,60,20,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 44, 150);
    g.quadraticCurveTo(cx, 160, cx + 44, 150);
    g.stroke();
    g.fillStyle = gr;
    // piernas y botas
    g.fillRect(cx - 16, 160, 11, 60);
    g.fillRect(cx + 5, 160, 11, 60);
    g.fillRect(cx - 20, 216, 16, 8);
    g.fillRect(cx + 4, 216, 16, 8);
    // el brazo: abajo con el facón, o arriba con la luz
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,200,100,1)';
    g.beginPath();
    if (cast) {
      g.moveTo(cx + 30, 100);
      g.lineTo(cx + 62, 30);
      g.stroke();
      const o = g.createRadialGradient(cx + 66, 22, 0, cx + 66, 22, 28);
      o.addColorStop(0, 'rgba(255,255,230,1)');
      o.addColorStop(0.4, 'rgba(255,210,110,0.9)');
      o.addColorStop(1, 'rgba(255,160,40,0)');
      g.fillStyle = o;
      g.beginPath();
      g.arc(cx + 66, 22, 28, 0, Math.PI * 2);
      g.fill();
    } else {
      g.moveTo(cx + 34, 110);
      g.lineTo(cx + 54, 150);
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,250,220,1)';
      g.beginPath();
      g.moveTo(cx + 54, 150);
      g.lineTo(cx + 70, 182);
      g.stroke();
    }
  };
  // el Chiquitijuein: chico, encorvado y torcido, la cabeza grande, brazos
  // largos con garras; negro (tapa el cielo) con el borde violeta y los ojos rojos
  const chiq = (cast) => (g, s) => {
    const cx = s / 2 - 8;
    g.shadowColor = 'rgba(170,70,255,1)';
    g.shadowBlur = 16;
    g.fillStyle = 'rgba(4,0,10,1)';
    // cuerpo encorvado
    g.beginPath();
    g.moveTo(cx - 22, 200);
    g.quadraticCurveTo(cx - 40, 140, cx - 6, 112);
    g.quadraticCurveTo(cx + 30, 100, cx + 34, 140);
    g.quadraticCurveTo(cx + 38, 180, cx + 18, 204);
    g.closePath();
    g.fill();
    // la cabeza, grande y ladeada, con orejas en punta
    g.beginPath();
    g.ellipse(cx + 12, 92, 30, 26, -0.35, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 12, 80);
    g.lineTo(cx - 30, 52);
    g.lineTo(cx - 2, 72);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(cx + 28, 70);
    g.lineTo(cx + 46, 44);
    g.lineTo(cx + 40, 78);
    g.closePath();
    g.fill();
    // piernas torcidas
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(4,0,10,1)';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx - 12, 196);
    g.quadraticCurveTo(cx - 30, 220, cx - 14, 238);
    g.moveTo(cx + 12, 198);
    g.quadraticCurveTo(cx + 34, 214, cx + 22, 240);
    g.stroke();
    // brazos largos: uno colgando, el otro tirando (en cast, estirado hacia adelante)
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx - 20, 130);
    g.quadraticCurveTo(cx - 52, 160, cx - 44, 196);
    if (cast) {
      g.moveTo(cx + 28, 124);
      g.quadraticCurveTo(cx + 70, 104, cx + 104, 92);
    } else {
      g.moveTo(cx + 28, 128);
      g.quadraticCurveTo(cx + 56, 160, cx + 48, 192);
    }
    g.stroke();
    if (cast) {
      const o = g.createRadialGradient(cx + 110, 90, 0, cx + 110, 90, 26);
      o.addColorStop(0, 'rgba(230,140,255,1)');
      o.addColorStop(0.5, 'rgba(120,30,200,0.8)');
      o.addColorStop(1, 'rgba(60,0,120,0)');
      g.shadowBlur = 0;
      g.fillStyle = o;
      g.beginPath();
      g.arc(cx + 110, 90, 26, 0, Math.PI * 2);
      g.fill();
    }
    // los ojos
    g.shadowColor = 'rgba(255,40,10,1)';
    g.shadowBlur = 12;
    g.fillStyle = 'rgba(255,60,30,1)';
    g.beginPath();
    g.ellipse(cx + 2, 90, 6, 3.5, -0.3, 0, Math.PI * 2);
    g.ellipse(cx + 24, 84, 6, 3.5, -0.3, 0, Math.PI * 2);
    g.fill();
  };
  cell(CELL.fran, fran(false));
  cell(CELL.franCast, fran(true));
  cell(CELL.chiq, chiq(false));
  cell(CELL.chiqCast, chiq(true));
  // la lanza de luz (horizontal: la punta a la derecha)
  cell(CELL.spear, (g, s) => {
    const gr = g.createLinearGradient(10, 0, s - 10, 0);
    gr.addColorStop(0, 'rgba(255,150,40,0)');
    gr.addColorStop(0.7, 'rgba(255,210,120,0.8)');
    gr.addColorStop(1, 'rgba(255,255,240,1)');
    g.fillStyle = gr;
    g.shadowColor = 'rgba(255,200,90,1)';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(10, s / 2 - 3);
    g.lineTo(s - 40, s / 2 - 6);
    g.lineTo(s - 6, s / 2);
    g.lineTo(s - 40, s / 2 + 6);
    g.lineTo(10, s / 2 + 3);
    g.closePath();
    g.fill();
  });
  const orb = (c0, c1, c2) => (g, s) => {
    const o = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    o.addColorStop(0, c0);
    o.addColorStop(0.25, c1);
    o.addColorStop(1, c2);
    g.fillStyle = o;
    g.fillRect(0, 0, s, s);
  };
  cell(CELL.orb, orb('rgba(255,255,235,1)', 'rgba(255,200,90,0.85)', 'rgba(255,120,20,0)'));
  // el orbe negro: un centro que tapa y un halo violeta
  cell(CELL.dark, (g, s) => {
    const o = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    o.addColorStop(0, 'rgba(2,0,6,1)');
    o.addColorStop(0.32, 'rgba(10,0,24,1)');
    o.addColorStop(0.45, 'rgba(160,60,255,0.9)');
    o.addColorStop(1, 'rgba(80,0,160,0)');
    g.fillStyle = o;
    g.fillRect(0, 0, s, s);
  });
  // el zarcillo: una línea que ondula, más gruesa atrás
  cell(CELL.tendril, (g, s) => {
    g.lineCap = 'round';
    for (const [lw, col] of [[14, 'rgba(130,40,230,0.5)'], [6, 'rgba(10,0,20,1)']]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const px = 8 + u * (s - 16);
        const py = s / 2 + Math.sin(u * 9) * 18 * (1 - u * 0.7);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.stroke();
    }
  });
  // el estallido: rayos
  cell(CELL.burst, (g, s) => {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
      const L = s * (0.25 + Math.random() * 0.24);
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr;
      g.lineWidth = 3 + Math.random() * 4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      g.stroke();
    }
    const o = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.3);
    o.addColorStop(0, 'rgba(255,255,255,1)');
    o.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = o;
    g.fillRect(-s / 2, -s / 2, s, s);
  });
  cell(CELL.ring, (g, s) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 10;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2);
    g.stroke();
  });
  cell(CELL.spark, orb('rgba(255,255,255,1)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)'));
  // las grietas que abre lo que pega en el cielo (blancas: el color va por instancia)
  const crack = (seed) => (g, s) => {
    let r = seed;
    const rr = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 6;
    g.lineCap = 'round';
    const branch = (px, py, a, len, w, depth) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(px, py);
      for (let i = 0; i < 5; i++) {
        a += (rr() - 0.5) * 0.9;
        px += Math.cos(a) * len / 5;
        py += Math.sin(a) * len / 5;
        g.lineTo(px, py);
        if (depth > 0 && rr() < 0.35) {
          g.stroke();
          branch(px, py, a + (rr() - 0.5) * 2, len * 0.5, w * 0.6, depth - 1);
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(px, py);
        }
      }
      g.stroke();
    };
    for (let k = 0; k < 5; k++) branch(s / 2, s / 2, (k / 5) * Math.PI * 2 + rr(), s * (0.3 + rr() * 0.18), 3, 2);
  };
  cell(CELL.crack, crack(77));
  cell(CELL.crack2, crack(913));
  // un tajo: la grieta larga que deja el choque grande
  cell(CELL.gash, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = 4;
    g.shadowColor = 'rgba(255,255,255,1)';
    g.shadowBlur = 8;
    g.beginPath();
    let py = s / 2;
    g.moveTo(4, py);
    for (let i = 1; i <= 12; i++) {
      py = s / 2 + (Math.random() - 0.5) * 30;
      g.lineTo(4 + (i / 12) * (s - 8), py);
    }
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

const VERT = /* glsl */ `
  attribute vec3 iC;
  attribute vec4 iS;
  attribute vec4 iCol;
  attribute float iCell;
  attribute float iOcc;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vOcc;
  void main() {
    vec4 mv = viewMatrix * vec4(iC, 1.0);
    float c = cos(iS.z);
    float s = sin(iS.z);
    vec2 p = position.xy * iS.xy;
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * mv;
    float cx = mod(iCell, 4.0);
    float cy = floor(iCell / 4.0);
    // (el canvas va de arriba hacia abajo y la textura de abajo hacia arriba)
    vUv = vec2((cx + uv.x) * 0.25, 1.0 - (cy + 1.0 - uv.y) * 0.25);
    vCol = iCol;
    vOcc = iOcc;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uFade;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vOcc;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a * uFade;
    // premultiplicado: lo que brilla suma (vOcc 0) y lo negro tapa el cielo (vOcc 1)
    gl_FragColor = vec4(t.rgb * vCol.rgb * a, a * vOcc);
    #include <colorspace_fragment>
  }`;

export function buildSkyFight(w, ecl, frame) {
  const { E, EU, EV, uniforms: U } = frame;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  const aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  const aOcc = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  for (const a of [aC, aS, aCol, aCell, aOcc]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iC', aC);
  geo.setAttribute('iS', aS);
  geo.setAttribute('iCol', aCol);
  geo.setAttribute('iCell', aCell);
  geo.setAttribute('iOcc', aOcc);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: paintAtlas() }, uFade: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'eclipseSkyFight';
  mesh.frustumCulled = false;
  // (después de lo transparente cercano no: antes, así el humo y las llamas de cerca van encima)
  mesh.renderOrder = -0.5;
  mesh.matrixAutoUpdate = false;
  w.root.add(mesh);

  // ---------------- el estado ----------------
  // los dos: dónde andan (q), su lado, el retroceso y el gesto de tirar
  const F = { q: new THREE.Vector2(-0.04, -0.44), home: new THREE.Vector2(-0.04, -0.44), kick: new THREE.Vector2(), cast: 0, fire: 2.5, hit: 0, h: 0.36 };
  const C = { q: new THREE.Vector2(0.03, 0.4), home: new THREE.Vector2(0.03, 0.4), kick: new THREE.Vector2(), cast: 0, fire: 3.5, hit: 0, h: 0.25 };
  const shots = []; // { who, kind, p, v, life, tgt }
  const fx = []; // { cell, q, size, rot, col, occ, life, max, grow, vel, fall }
  const cracks = []; // las del cielo, quietas y que se apagan
  let lead = 0; // >0: va ganando el Chiquitijuein
  let thunderT = 0;
  let bigOn = false;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const camR = new THREE.Matrix4();

  const dirOf = (q, out) => out.copy(E).addScaledVector(EU, q.x).addScaledVector(EV, q.y).normalize();
  const boom = (q, gold, big = false) => {
    const n = big ? 26 : 9;
    fx.push({ cell: CELL.burst, q: q.clone(), size: big ? 0.2 : 0.08, rot: Math.random() * 6, col: gold ? [3, 2.1, 0.9] : [2.2, 1.0, 3.2], occ: 0, life: 0, max: big ? 1.1 : 0.55, grow: 1.6 });
    fx.push({ cell: CELL.ring, q: q.clone(), size: 0.02, rot: 0, col: gold ? [2.4, 1.8, 0.9] : [1.6, 0.8, 2.6], occ: 0, life: 0, max: big ? 1.6 : 0.9, grow: big ? 14 : 7 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.04, big ? 0.22 : 0.12);
      fx.push({ cell: CELL.spark, q: q.clone(), size: rnd(0.006, 0.013), rot: 0, col: Math.random() < 0.5 ? [3, 2.2, 1] : [2.4, 1.2, 3.2], occ: 0, life: 0, max: rnd(1.2, 2.6), grow: 0, vel: new THREE.Vector2(Math.cos(a) * sp, Math.sin(a) * sp), fall: 0.09 });
    }
    // (un trueno lejos, no más de uno cada tantos segundos)
    const g = w.g;
    if (thunderT <= 0 && g?.audio?.thunder && g.camera) {
      thunderT = big ? 3 : 5;
      g.audio.thunder(dirOf(q, tmp2).multiplyScalar(220).add(g.camera.position), big);
    }
  };
  const skyCrack = (q, gold) => {
    if (cracks.length >= 9) cracks.shift();
    cracks.push({ cell: Math.random() < 0.5 ? CELL.crack : CELL.crack2, q: q.clone(), size: rnd(0.07, 0.13), rot: Math.random() * 6, col: gold ? [1.5, 1.0, 0.55] : [1.1, 0.6, 2.0], life: 0, max: rnd(18, 30) });
    fx.push({ cell: CELL.ring, q: q.clone(), size: 0.01, rot: 0, col: [1.4, 0.9, 2.0], occ: 0, life: 0, max: 0.8, grow: 6 });
  };
  const shoot = (who) => {
    const me = who === 'f' ? F : C;
    const op = who === 'f' ? C : F;
    me.cast = 0.45;
    const from = me.q.clone().add(new THREE.Vector2(me.h * 0.3, who === 'f' ? 0.06 : -0.06));
    // a veces erra a propósito (y se clava en el cielo)
    const miss = Math.random() < 0.3;
    const to = op.q.clone().add(new THREE.Vector2(rnd(-0.03, 0.03) + (miss ? rnd(0.12, 0.2) * (Math.random() < 0.5 ? -1 : 1) : 0), rnd(-0.03, 0.03) + (miss ? rnd(0.08, 0.16) : 0)));
    const d = to.clone().sub(from);
    const kind = who === 'f' ? (Math.random() < 0.55 ? 'spear' : 'orb') : Math.random() < 0.5 ? 'tendril' : 'dark';
    const sp = kind === 'spear' ? 0.42 : kind === 'tendril' ? 0.32 : 0.24;
    // (una curva: la velocidad de costado se va enderezando)
    const v = d.clone().normalize().multiplyScalar(sp);
    const side = new THREE.Vector2(-v.y, v.x).multiplyScalar(rnd(-0.6, 0.6));
    shots.push({ who, kind, p: from, v: v.add(side), aim: to, life: 0, max: d.length() / sp + 1.4, miss, sp });
  };

  // (guadana5) los dos de verdad, en 3D (world/eclipseSky3d.js); hasta que
  // están, las figuras planas. globalThis.__mduNoSky3d: siempre las planas
  const sky3d = globalThis.__mduNoSky3d === true ? null : buildSky3d(w);
  // el choque grande (fightT): los dos se lanzan al centro
  let dash = 0;
  // (guadana5) y las acometidas chicas: cada tanto se tiran uno encima del
  // otro, chocan en el medio y rebotan (el cielo se raja apenas)
  let dashBig = true;
  let skirmT = 6;
  const SKIRM = globalThis.__mduNoSkyFight3d !== true && !!sky3d;
  const update = (dt, t) => {
    const g = w.g;
    // (ni en el título, ni en las escenas —la entrada y el final tienen su
    // propia coreografía del sol y la luna—, ni en San Lorenzo)
    const off = globalThis.__mduNoSkyFight === true || g?.state === 'title' || !!g?.intro?.active || !!g?.ee?.scene || !!g?.ee?.arena?.active;
    const dim = U.uDim.value;
    mat.uniforms.uFade.value = Math.max(0, 1 - dim * 1.5) * (off ? 0 : 1);
    mesh.visible = !off && dim < 0.66;
    if (!mesh.visible) {
      geo.instanceCount = 0;
      sky3d?.update(dt, null, F, C, false);
      return;
    }
    thunderT -= dt;
    const k = ecl.k;
    // los dos se mueven: dan vueltas lentas alrededor de su lugar, se acercan
    // cuando la pelea se calienta (la totalidad los junta)
    const near = 1 - 0.45 * k;
    for (const [P, s] of [[F, 1], [C, -1]]) {
      const a = t * (s > 0 ? 0.21 : 0.29) + (s > 0 ? 0 : 2);
      P.q.set(P.home.x * near + Math.sin(a) * 0.035 + Math.sin(t * 1.3 + s) * 0.006, P.home.y * near + Math.cos(a * 0.8) * 0.05);
      P.kick.multiplyScalar(Math.exp(-dt * 2.5));
      P.q.add(P.kick);
      P.cast = Math.max(0, P.cast - dt);
      P.hit = Math.max(0, P.hit - dt);
    }
    // el choque grande: se lanzan uno sobre el otro y estallan en el medio
    if (ecl.clashK > 0.98 && !bigOn) {
      bigOn = true;
      dash = 1;
      dashBig = true;
    }
    if (SKIRM && dash <= 0) {
      skirmT -= dt * (1 + 0.6 * k);
      if (skirmT <= 0) {
        skirmT = rnd(7, 12);
        dash = 1;
        dashBig = false;
      }
    }
    if (ecl.clashK < 0.5) bigOn = false;
    if (dash > 0) {
      dash = Math.max(0, dash - dt / 0.9);
      const u = Math.sin((1 - dash) * Math.PI);
      F.q.lerp(new THREE.Vector2(0, -0.16), u * 0.85);
      C.q.lerp(new THREE.Vector2(0, 0.14), u * 0.85);
      if (dash < 0.5 && dash + dt / 0.9 >= 0.5 && !dashBig) {
        // (la acometida: chocan donde están, más chico; el cielo late apenas)
        boom(F.q.clone().lerp(C.q, 0.5), Math.random() < 0.5, false);
        F.kick.set(-0.03, -0.09);
        C.kick.set(0.03, 0.09);
        F.hit = 0.35;
        C.hit = 0.35;
        lead += (Math.random() - 0.5) * 0.3;
        ecl.pulse?.(0.3);
        skyCrack(F.q.clone().lerp(C.q, 0.5).add(new THREE.Vector2(rnd(-0.08, 0.08), rnd(-0.08, 0.08))), Math.random() < 0.5);
      } else if (dash < 0.5 && dash + dt / 0.9 >= 0.5) {
        const big = ecl.clashBig;
        boom(new THREE.Vector2(0.0, 0.0).addScaledVector(new THREE.Vector2(Math.cos(ecl.clashA), Math.sin(ecl.clashA)), RS * 1.2), true, big);
        F.kick.set(-0.04, -0.12);
        C.kick.set(0.04, 0.12);
        lead += (Math.random() - 0.5) * 0.6;
        if (big) for (let i = 0; i < 3; i++) skyCrack(new THREE.Vector2(rnd(-0.4, 0.4), rnd(-0.4, 0.4)), i % 2 === 0);
      }
    }
    // los tiros (más seguido con la pelea caliente; en la totalidad casi no tira Francisco)
    if (dash <= 0) {
      F.fire -= dt * (1 - 0.6 * k);
      C.fire -= dt * (1 + 0.5 * k);
      if (F.fire <= 0) {
        F.fire = rnd(1.4, 3.6);
        shoot('f');
      }
      if (C.fire <= 0) {
        C.fire = rnd(1.6, 3.8);
        shoot('c');
      }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life += dt;
      // se endereza hacia el blanco (el que erra sigue derecho de largo)
      if (!s.miss || s.life < 0.4) {
        const want = s.aim.clone().sub(s.p).normalize().multiplyScalar(s.sp);
        s.v.lerp(want, Math.min(1, dt * 2.2));
      }
      s.p.addScaledVector(s.v, dt);
      const op = s.who === 'f' ? C : F;
      let gone = false;
      // dos tiros de distinto lado que se cruzan: estallan los dos
      for (let j = 0; j < shots.length && !gone; j++) {
        const o = shots[j];
        if (o === s || o.who === s.who) continue;
        if (o.p.distanceTo(s.p) < 0.03) {
          boom(s.p.clone().lerp(o.p, 0.5), s.who === 'f', false);
          shots.splice(Math.max(i, j), 1);
          shots.splice(Math.min(i, j), 1);
          i = Math.min(i, shots.length);
          gone = true;
        }
      }
      if (gone) continue;
      if (!s.miss && s.p.distanceTo(op.q) < op.h * 0.35) {
        boom(s.p, s.who === 'f');
        op.kick.add(s.v.clone().normalize().multiplyScalar(0.05));
        op.hit = 0.5;
        lead += s.who === 'f' ? -0.12 : 0.12;
        shots.splice(i, 1);
        continue;
      }
      if (s.life > s.max || s.p.length() > 1.0) {
        // se clavó en el cielo: lo raja
        skyCrack(s.p, s.who === 'f');
        shots.splice(i, 1);
      }
    }
    lead = Math.max(-1, Math.min(1, lead * Math.exp(-dt * 0.03)));
    ecl.lead = lead;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life += dt;
      if (f.vel) {
        f.vel.x -= f.fall * dt;
        f.vel.multiplyScalar(Math.exp(-dt * 0.6));
        f.q.addScaledVector(f.vel, dt);
      }
      if (f.life >= f.max) fx.splice(i, 1);
    }
    for (let i = cracks.length - 1; i >= 0; i--) {
      cracks[i].life += dt;
      if (cracks[i].life >= cracks[i].max) cracks.splice(i, 1);
    }
    while (fx.length > MAX - 40) fx.shift();

    // ---------------- a las instancias ----------------
    const cam = g?.camera;
    if (!cam) return;
    camR.copy(cam.matrixWorldInverse);
    let n = 0;
    const put = (q, size, ang, cell, col, a, occ, aspect = 1) => {
      if (n >= MAX) return;
      dirOf(q, tmp);
      const px = cam.position.x + tmp.x * R;
      const py = cam.position.y + tmp.y * R;
      const pz = cam.position.z + tmp.z * R;
      aC.setXYZ(n, px, py, pz);
      // (el tamaño en metros a esa distancia; el giro, en la pantalla)
      aS.setXYZW(n, size * R * aspect, size * R, ang, 0);
      aCol.setXYZW(n, col[0], col[1], col[2], a);
      aCell.setX(n, cell);
      aOcc.setX(n, occ);
      n++;
    };
    // el ángulo en pantalla de una dirección del plano tangente
    const screenAng = (q, v) => {
      dirOf(q, tmp);
      tmp2.copy(tmp).addScaledVector(EU, v.x * 0.01).addScaledVector(EV, v.y * 0.01);
      tmp.transformDirection(camR);
      tmp2.transformDirection(camR);
      return Math.atan2(tmp2.y / -tmp2.z - tmp.y / -tmp.z, tmp2.x / -tmp2.z - tmp.x / -tmp.z);
    };
    // la vertical de la figura: hacia el cenit del plano (q.x)
    const up = (q) => screenAng(q, new THREE.Vector2(1, 0)) - Math.PI / 2;
    for (const c of cracks) {
      const a = Math.min(1, c.life * 4) * Math.min(1, (c.max - c.life) / 4);
      put(c.q, c.size, c.rot, c.cell, c.col, a * 0.9, 0);
    }
    // las figuras (con un brillo atrás para que se lean de día y de noche)
    const flash = (P) => 1 + P.hit * 3;
    // (guadana5: los de verdad, en 3D; las planas solo hasta que llegan)
    const in3d = !!sky3d?.update(dt, { dirOf, R, cam, dash, EU }, F, C, true);
    put(F.q, F.h * 1.3, up(F.q), CELL.orb, [1.0, 0.6, 0.22], in3d ? 0.1 + 0.25 * F.cast : 0.16, 0);
    if (!in3d) put(F.q, F.h, up(F.q), F.cast > 0 ? CELL.franCast : CELL.fran, [0.95 * flash(F), 0.85 * flash(F), 0.7 * flash(F)], 1, 0.85);
    put(C.q, C.h * 1.5, up(C.q), CELL.dark, [0.8, 0.35, 1.3], in3d ? 0.22 + 0.3 * C.cast : 0.35, in3d ? 0.25 : 0.5);
    if (!in3d) put(C.q, C.h, up(C.q), C.cast > 0 ? CELL.chiqCast : CELL.chiq, [1 + C.hit * 2, 1, 1 + C.hit * 2], 1, 1);
    for (const s of shots) {
      const fade = Math.min(1, s.life * 6);
      if (s.kind === 'spear') put(s.p, 0.05, screenAng(s.p, s.v), CELL.spear, [3, 2.2, 1.1], fade, 0, 4);
      else if (s.kind === 'orb') put(s.p, 0.055, 0, CELL.orb, [3, 2.2, 1], fade, 0);
      else if (s.kind === 'tendril') put(s.p, 0.05, screenAng(s.p, s.v), CELL.tendril, [1.2, 0.8, 1.6], fade, 0.8, 4);
      else put(s.p, 0.065, t * 3, CELL.dark, [1.4, 0.8, 2], fade, 1);
    }
    for (const f of fx) {
      const u = f.life / f.max;
      const a = f.cell === CELL.spark ? 1 - u : (1 - u) * (1 - u);
      put(f.q, f.size * (1 + f.grow * u), f.rot, f.cell, f.col, a, f.occ);
    }
    geo.instanceCount = n;
    for (const a of [aC, aS, aCol, aCell, aOcc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  };
  return { update, mesh, sky3d, state: () => ({ shots: shots.length, fx: fx.length, cracks: cracks.length, lead, F: F.q.toArray(), C: C.q.toArray(), in3d: !!sky3d?.ready, dash }) };
}
