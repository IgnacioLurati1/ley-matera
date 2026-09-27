import * as THREE from 'three';
import { dragonHead } from './Mateendrache';

// La fuente del patio de armas: el Mateendrache de piedra, sentado sobre una
// roca en el medio de la pileta congelada. Las alas medio abiertas, la cola
// enroscada en la roca, las manos agarradas al borde y el cuello arqueado con
// la boca abierta al cielo: el chorro de agua se le congeló en el aire y cae
// hecho hielo en la pileta. La piedra junta nieve en todo lo que mira para
// arriba (el material se fija para dónde da cada cara). Mira hacia +z (al
// portón), así es lo primero que se ve al entrar.

const cache = {};
function once(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

// Piedra tallada con nieve arriba (la estatua de la fuente, las tumbas).
export function statueMat(M) {
  return once('stone', () => {
    const map = M.stone?.map || M.castleStone?.map || null;
    const mat = new THREE.MeshStandardMaterial({ map, color: 0xaaa69e, roughness: 0.84, bumpMap: map, bumpScale: 0.5 });
    // la sillería es solo el color de la piedra: tallada no tiene juntas (sin relieve de fx/Surfaces)
    mat.userData.noRelief = true;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSWNor;\nvarying vec3 vSWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSWNor = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWNor;\nvarying vec3 vSWPos;').replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float nz = fract(sin(dot(floor(vSWPos.xz * 11.0) + floor(vSWPos.y * 7.0), vec2(12.9898, 78.233))) * 43758.5453);
        float snowK = smoothstep(0.5, 0.78, vSWNor.y + (nz - 0.5) * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowK);`,
      );
    };
    mat.customProgramCacheKey = () => 'castleStatue';
    return mat;
  });
}

const iceClear = () => once('ice', () => new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.04, metalness: 0.1, emissive: 0x1a4e78, emissiveIntensity: 0.45, transparent: true, opacity: 0.62, depthWrite: false }));
const iceFloor = () => once('iceFloor', () => new THREE.MeshStandardMaterial({ color: 0xbfe2f5, roughness: 0.08, metalness: 0.15, emissive: 0x0e3048, emissiveIntensity: 0.4 }));
const eyeMat = () => once('eye', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.8, 1).multiplyScalar(1.6), toneMapped: false }));
const dark = () => once('dark', () => new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.9 }));

// Un tubo que sigue una curva con el grosor que diga r(t).
function tube(curve, segs, radial, r) {
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const k = r(t);
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(n, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Interpola una tabla de [t, valor] (suave entre puntos).
function table(rows) {
  return (t) => {
    for (let i = 1; i < rows.length; i++) {
      if (t <= rows[i][0]) {
        const [t0, a] = rows[i - 1];
        const [t1, b] = rows[i];
        const u = (t - t0) / (t1 - t0);
        return a + (b - a) * u * u * (3 - 2 * u);
      }
    }
    return rows[rows.length - 1][1];
  };
}

export function buildFountain(M, o) {
  const g = new THREE.Group();
  const st = statueMat(M);
  const rim = M.castleStone || M.stone;
  const R = o.r || 2.2;
  // la pileta octogonal, con el borde de piedra y nieve arriba
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const side = 2 * R * Math.tan(Math.PI / 8);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(side + 0.08, 0.62, 0.36), rim);
    seg.position.set(Math.cos(a) * R, 0.31, Math.sin(a) * R);
    seg.rotation.y = -a + Math.PI / 2;
    g.add(seg);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(side + 0.16, 0.1, 0.48), M.snowCap || rim);
    cap.position.set(Math.cos(a) * R, 0.67, Math.sin(a) * R);
    cap.rotation.y = -a + Math.PI / 2;
    g.add(cap);
  }
  const iceTop = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.12, R - 0.12, 0.05, 8), iceFloor());
  iceTop.rotation.y = Math.PI / 8;
  iceTop.position.y = 0.47;
  g.add(iceTop);
  // la roca del medio
  const rockG = new THREE.DodecahedronGeometry(0.95, 1);
  const rp = rockG.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const y = rp.getY(i);
    const z = rp.getZ(i);
    const k = 1 + Math.sin(x * 5.1 + z * 3.3) * 0.08 + Math.sin(y * 7.7 + x * 2.1) * 0.06;
    rp.setXYZ(i, x * k * 1.1, y * k * 0.72, z * k * 1.05);
  }
  rockG.computeVertexNormals();
  const rock = new THREE.Mesh(rockG, st);
  rock.position.set(0, 0.62, 0.05);
  g.add(rock);
  // el cuerpo: de la punta de la cola (enroscada en la roca) a la nuca
  const pts = [
    [0.95, 0.42, -0.55],
    [0.35, 0.38, -1.08],
    [-0.52, 0.44, -0.98],
    [-1.02, 0.55, -0.25],
    [-0.86, 0.78, 0.48],
    [-0.34, 1.08, 0.5],
    [0, 1.42, 0.16],
    [0, 1.96, 0.02],
    [0, 2.5, 0.22],
    [0, 2.94, 0.52],
    [0, 3.32, 0.92],
    [0, 3.56, 1.26],
  ].map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const radius = table([
    [0, 0.035],
    [0.3, 0.12],
    [0.5, 0.27],
    [0.6, 0.4],
    [0.7, 0.42],
    [0.78, 0.32],
    [0.88, 0.22],
    [1, 0.19],
  ]);
  const body = new THREE.Mesh(tube(curve, 140, 14, radius), st);
  g.add(body);
  // la cresta del lomo: pinchos de piedra a lo largo de la curva
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 4; i < 36; i++) {
    const t = 0.12 + (i / 36) * 0.85;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up);
    const outward = new THREE.Vector3().crossVectors(side, tan).normalize();
    if (outward.y < 0) outward.negate();
    const h = 0.12 + radius(t) * 0.5;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05 + radius(t) * 0.12, h, 4), st);
    sp.position.copy(p).addScaledVector(outward, radius(t) * 0.92 + h * 0.3);
    sp.quaternion.setFromUnitVectors(up, outward.clone().addScaledVector(tan, -0.5).normalize());
    g.add(sp);
  }
  // la cabeza (la misma del Mateendrache, en piedra) mirando al cielo, con la boca abierta
  const H = dragonHead({ scale: st, bone: st, eye: eyeMat(), pupil: dark(), mouth: dark(), silver: M.silver || st, gold: M.brass || st, hair: st });
  H.head.position.set(0, 3.62, 1.36);
  H.head.rotation.x = -0.62;
  H.head.scale.setScalar(0.62);
  H.jaw.rotation.x = 0.52;
  g.add(H.head);
  // las alas medio abiertas
  const wing = new THREE.Shape();
  wing.moveTo(0, 0);
  wing.lineTo(0.5, 0.75);
  wing.lineTo(1.35, 1.25);
  wing.lineTo(1.95, 0.72);
  wing.quadraticCurveTo(1.55, 0.5, 1.72, 0.08);
  wing.quadraticCurveTo(1.35, -0.02, 1.32, -0.48);
  wing.quadraticCurveTo(0.95, -0.35, 0.72, -0.72);
  wing.quadraticCurveTo(0.35, -0.42, 0.05, -0.62);
  wing.closePath();
  const wingG = new THREE.ExtrudeGeometry(wing, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  wingG.translate(0, 0, -0.03);
  for (const s of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(s * 0.26, 2.62, 0.18);
    wg.rotation.set(-0.25, s * -0.55, s * 0.28);
    const m = new THREE.Mesh(wingG, st);
    m.scale.set(s, 1, 1);
    wg.add(m);
    // los dedos del ala (nervaduras)
    for (const [ex, ey] of [[1.95, 0.72], [1.72, 0.08], [1.32, -0.48]]) {
      const len = Math.hypot(ex - 1.35, ey - 1.25);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, len, 5), st);
      f.position.set(s * (1.35 + ex) * 0.5, (1.25 + ey) * 0.5, 0.05);
      f.quaternion.setFromUnitVectors(up, new THREE.Vector3(s * (ex - 1.35), ey - 1.25, 0).normalize());
      wg.add(f);
    }
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.5, 6), st);
    arm.position.set(s * 0.68, 0.62, 0.05);
    arm.quaternion.setFromUnitVectors(up, new THREE.Vector3(s * 1.35, 1.25, 0).normalize());
    wg.add(arm);
    g.add(wg);
  }
  // las manos agarradas al borde de la roca y las patas de atrás
  for (const s of [-1, 1]) {
    const leg = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.22, 2.38, 0.46), new THREE.Vector3(s * 0.42, 1.92, 0.78), new THREE.Vector3(s * 0.44, 1.36, 0.96)]);
    g.add(new THREE.Mesh(tube(leg, 16, 8, (t) => 0.13 - t * 0.05), st));
    for (let k = -1; k <= 1; k++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), st);
      claw.position.set(s * 0.44 + k * 0.07, 1.3, 1.08);
      claw.rotation.x = Math.PI / 2 + 0.6;
      g.add(claw);
    }
    const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), st);
    thigh.scale.set(0.8, 1, 1.25);
    thigh.position.set(s * 0.36, 1.5, 0.18);
    g.add(thigh);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), st);
    foot.scale.set(1, 0.6, 1.6);
    foot.position.set(s * 0.48, 1.18, 0.52);
    g.add(foot);
  }
  // el chorro congelado: sale de la boca, sube un poco y cae en la pileta
  H.head.updateMatrixWorld(true);
  g.updateMatrixWorld(true);
  const mouth = new THREE.Vector3(0, -0.05, 1.45);
  H.head.localToWorld(mouth);
  g.worldToLocal(mouth);
  const land = new THREE.Vector3(0, 0.5, R - 0.45);
  const jet = new THREE.CatmullRomCurve3([mouth, mouth.clone().add(new THREE.Vector3(0, 0.45, 0.32)), mouth.clone().add(new THREE.Vector3(0, 0.3, 0.8)), new THREE.Vector3(0, (mouth.y + land.y) * 0.45, (mouth.z + land.z) * 0.5 + 0.35), land]);
  g.add(new THREE.Mesh(tube(jet, 60, 10, (t) => 0.06 + t * t * 0.1), iceClear()));
  // la salpicadura hecha hielo donde cae
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const d = 0.1 + (k % 3) * 0.12;
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.03 + (k % 2) * 0.02, 0.18 + (k % 4) * 0.1, 5), iceClear());
    drop.position.set(land.x + Math.cos(a) * d, land.y + 0.08, land.z + Math.sin(a) * d * 0.7);
    drop.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(drop);
  }
  // carámbanos colgando de la mandíbula y del filo de las alas
  for (let k = 0; k < 6; k++) {
    const ic = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18 + (k % 3) * 0.1, 5), iceClear());
    ic.position.set((k - 2.5) * 0.06, mouth.y - 0.28, mouth.z - 0.2 - (k % 2) * 0.05);
    ic.rotation.x = Math.PI;
    g.add(ic);
  }
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  return {
    obj: g,
    boxes: [
      [-R - 0.2, 0, -R - 0.2, R + 0.2, 0.7, R + 0.2],
      [-1.05, 0, -1.2, 1.05, 1.3, 1.1],
      [-0.6, 1.3, -0.4, 0.6, 3.9, 1.5],
    ],
  };
}
