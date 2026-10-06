import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Las manos del Desgarrador Cósmico en primera persona (weapons/Desgarrador.js):
// un puño de verdad alrededor del asta. La de wrapHand (viewmodels) tenía los
// dedos de palitos rectos y gruesos como el asta: de cerca parecía que la mano
// se quebraba ("las falanges quebradas sobre el asta", foto del usuario). Acá
// cada dedo es un tubo que se afina y sigue la curva del asta (se apoya en el
// cuero, no lo atraviesa), con los nudillos marcados; el pulgar cierra por el
// otro lado, por arriba del índice.
// En el marco de la mano: el asta va por +y (para el lado del pulgar), centrada
// en el origen; el antebrazo sale hacia +x (Desgarrador gira la mano alrededor
// del asta para que el antebrazo apunte siempre al codo: la muñeca nunca se
// dobla). La palma está del lado -z y mira al asta; los dedos dan la vuelta por
// -x hasta el lado +z. La izquierda es la misma, en espejo (z).

const tmpV = new THREE.Vector3();

// Un tubo que se afina, por los puntos dados (radio r0 al principio, r1 al final),
// con las dos puntas cerradas con media esfera.
function finger(points, r0, r1, rs = 10) {
  const crv = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const seg = 18;
  const fr = crv.computeFrenetFrames(seg, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = crv.getPointAt(t);
    // (un poquito más ancho en los nudillos: 1/3 y 2/3 del largo)
    const knuckle = 1 + 0.07 * Math.exp(-(((t - 0.36) / 0.07) ** 2)) + 0.05 * Math.exp(-(((t - 0.68) / 0.07) ** 2));
    const r = (r0 + (r1 - r0) * t) * knuckle;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2;
      tmpV.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(c.x + tmpV.x * r, c.y + tmpV.y * r, c.z + tmpV.z * r);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rs; j++) {
      const a = i * (rs + 1) + j;
      const b = a + rs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (las dos puntas cerradas: media esfera justo en cada punta de la curva)
  const end = crv.getPointAt(1);
  const d = crv.getTangentAt(1);
  const tip = new THREE.SphereGeometry(r1, 10, 8).scale(1, 1, 1).translate(end.x, end.y, end.z);
  const st = crv.getPointAt(0);
  const root = new THREE.SphereGeometry(r0 * 0.98, 10, 8).translate(st.x, st.y, st.z);
  return { geos: [g, tip, root], end, dir: d };
}

// La uña en la punta, mirando para afuera del asta.
function nailGeo(tip, along, out, r) {
  const g = new THREE.SphereGeometry(r * 0.8, 8, 6).scale(1, 0.32, 1.25);
  const side = new THREE.Vector3().crossVectors(along, out).normalize();
  const o2 = new THREE.Vector3().crossVectors(side, along).normalize();
  const m = new THREE.Matrix4().makeBasis(side, o2, along);
  m.setPosition(tip.clone().addScaledVector(o2, r * 0.62).addScaledVector(along, -r * 0.45));
  return g.applyMatrix4(m);
}

const clean = (g) => {
  const o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal'].includes(k)) o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
};

// Un punto sobre el asta: ángulo a (desde +x, girando hacia +z), radio, altura.
const onPole = (a, rad, y) => new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);

// La mano derecha (left: la izquierda, en espejo). r: el radio del asta donde
// agarra (en la escala de la mano); s: el tamaño de la mano. Devuelve { h (el
// grupo, con una malla por material), at (de dónde sale el antebrazo, en el
// marco de la mano) }.
export function gripHand(M, { r = 0.0115, s = 0.85, left = false } = {}) {
  const skin = [];
  const nails = [];
  // los dedos: índice (arriba, del lado del pulgar), medio, anular, meñique
  const F = [
    { y: 0.027, len: 0.064, fr: 0.0082 },
    { y: 0.008, len: 0.07, fr: 0.0085 },
    { y: -0.011, len: 0.066, fr: 0.0081 },
    { y: -0.028, len: 0.054, fr: 0.0071 },
  ];
  for (const f of F) {
    const fr = f.fr * s;
    const rr = r + fr * 0.98;
    const y = f.y * s;
    // el nudillo (atrás del asta, del lado de la palma, un poco afuera) y la
    // vuelta: la falange de abajo baja al asta, las otras dos la siguen
    const a0 = -1.78;
    const A = (f.len * s) / rr;
    const pts = [onPole(a0 + 0.24, rr + 0.0062 * s, y + 0.002 * s), onPole(a0, rr + 0.003 * s, y + 0.001 * s)];
    for (const k of [0.3, 0.55, 0.8, 1]) pts.push(onPole(a0 - A * k, rr + (k < 0.5 ? 0.0012 * s : 0), y - 0.0045 * s * k));
    const fg = finger(pts, fr * 1.08, fr * 0.84);
    skin.push(...fg.geos);
    nails.push(nailGeo(fg.end, fg.dir, tmpV.set(fg.end.x, 0, fg.end.z).normalize().clone(), fr * 0.84));
  }
  // la palma: una placa apoyada en el asta del lado -z, del nudillo a la muñeca
  // (+x), con la base del pulgar arriba
  const palm = new THREE.SphereGeometry(1, 18, 12).scale(0.034 * s, 0.043 * s, 0.0125 * s).translate(0.017 * s, -0.002 * s, -(r + 0.0105 * s));
  skin.push(palm);
  // el dorso sobre los nudillos (si no, los cuatro nudillos parecían bolitas sueltas)
  skin.push(new THREE.SphereGeometry(1, 18, 12).scale(0.027 * s, 0.046 * s, 0.0118 * s).translate(0.004 * s, -0.001 * s, -(r + 0.0128 * s)));
  const heel = new THREE.SphereGeometry(1, 14, 10).scale(0.022 * s, 0.03 * s, 0.014 * s).translate(0.038 * s, -0.012 * s, -(r + 0.008 * s));
  skin.push(heel);
  // la base del pulgar (la eminencia tenar), redonda
  const thenar = new THREE.SphereGeometry(1, 14, 10).scale(0.02 * s, 0.022 * s, 0.016 * s).translate(0.03 * s, 0.022 * s, -(r + 0.004 * s));
  skin.push(thenar);
  // el pulgar: sale de la base, pasa por el lado del antebrazo (+x) y cierra
  // del otro lado (+z), por arriba del índice
  const tr = 0.0098 * s;
  const rt = r + tr * 0.95;
  const ty = 0.038 * s;
  const tp = [new THREE.Vector3(0.036 * s, 0.026 * s, -(r + 0.006 * s)), onPole(-0.42, rt + 0.006 * s, ty - 0.002 * s), onPole(0.25, rt + 0.002 * s, ty), onPole(0.85, rt, ty - 0.001 * s), onPole(1.3, rt, ty - 0.003 * s)];
  const th = finger(tp, tr * 1.15, tr * 0.86);
  skin.push(...th.geos);
  nails.push(nailGeo(th.end, th.dir, tmpV.set(th.end.x, 0.25, th.end.z).normalize().clone(), tr * 0.86));
  // la muñeca (hasta donde arranca el antebrazo de Desgarrador)
  const at = new THREE.Vector3(0.06 * s, -0.008 * s, -(r + 0.009 * s));
  const wrist = new THREE.CapsuleGeometry(0.0205 * s, 0.024 * s, 4, 12).rotateZ(Math.PI / 2).scale(1, 1, 0.82).translate(0.05 * s, -0.008 * s, -(r + 0.009 * s));
  skin.push(wrist);
  const h = new THREE.Group();
  h.add(new THREE.Mesh(mergeGeometries(skin.map(clean)), M.skin));
  h.add(new THREE.Mesh(mergeGeometries(nails.map(clean)), M.nail));
  h.userData.hand = true;
  // (la izquierda: la misma en espejo; three da vuelta las caras solo)
  const g = new THREE.Group();
  g.add(h);
  if (left) {
    h.scale.z = -1;
    at.z = -at.z;
  }
  g.userData.hand = true;
  return { h: g, at };
}
