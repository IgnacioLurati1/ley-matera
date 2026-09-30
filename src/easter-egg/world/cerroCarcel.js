import * as THREE from 'three';
import { mesh, boxGeo, cylGeo, mergeByMaterial } from './props';
import { soulGeometry, soulMaterial, SOUL_TIME } from './soulLook';

// La Cárcel de las Almas: adonde el Gauchito Gil (el carcelero) arrastra a los
// que le sacaron el 30% de la vida en el cerro (world/Cerro.js). Un redondel de
// piedra colgado de seis cadenas en medio de la tormenta, arriba del río, con
// tres pisos de celdas alrededor (como un panóptico) y en cada celda un alma
// agarrada a los barrotes. Adentro, cinco cruces coloradas del Gauchito que
// tapan y atontan (cols, como las capillitas del cerro). Es más grande que el
// cerro (r 15,5 contra 7,4): acá la pelea llega al final.
//
// No suma luces (sumar una recompila todos los shaders): el cerro le presta
// sus dos coloradas. Lo que brilla es aditivo (almas, velas, el sello del piso).

const BAYS = 24;
const TIERS = 3;
const TIER_H = 3.1;
const BARS = 9;

// UV en metros sobre el plano xz (el piso)
function planarUV(geo, tile) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / tile;
    uv[i * 2 + 1] = p.getZ(i) / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Una caja con las UV en metros (una repetición cada `tile`).
function boxUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * size[f][0]) / tile, (uv.getY(i) * size[f][1]) / tile);
    }
  return g;
}

// El sello del carcelero pintado en el piso (brilla, se suma a la luz): dos
// aros, una cadena alrededor y una cruz con rayos.
function sealTexture(rnd) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const m = S / 2;
  ctx.lineCap = 'round';
  for (const [rad, w, cs] of [[470, 30, 'rgba(150,8,4,0.35)'], [470, 8, 'rgba(255,40,20,0.85)'], [420, 3, 'rgba(255,70,40,0.6)'], [250, 5, 'rgba(255,50,25,0.7)']]) {
    ctx.strokeStyle = cs;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(m, m, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  // la cadena entre los dos aros de afuera
  ctx.strokeStyle = 'rgba(255,60,30,0.75)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ctx.save();
    ctx.translate(m + Math.cos(a) * 445, m + Math.sin(a) * 445);
    ctx.rotate(a + Math.PI / 2 + (i % 2 ? Math.PI / 2 : 0));
    ctx.beginPath();
    ctx.ellipse(0, 0, i % 2 ? 6 : 16, i % 2 ? 16 : 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // la cruz del Gauchito y los rayos que salen
  ctx.strokeStyle = 'rgba(255,50,25,0.8)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(m, m - 190);
  ctx.lineTo(m, m + 190);
  ctx.moveTo(m - 120, m - 70);
  ctx.lineTo(m + 120, m - 70);
  ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.07;
    ctx.strokeStyle = `rgba(255,${(40 + rnd() * 50) | 0},20,${0.25 + rnd() * 0.3})`;
    ctx.lineWidth = 2 + rnd() * 3;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a) * 262, m + Math.sin(a) * 262);
    ctx.lineTo(m + Math.cos(a) * (330 + rnd() * 70), m + Math.sin(a) * (330 + rnd() * 70));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Arma la cárcel (escondida) en A = { x, y, z, r }. Devuelve lo que usa el cerro.
export function buildCarcel(game, A) {
  const g = game;
  const M = g.world.M;
  const { x, z, r } = A;
  const y = A.y;
  let seed = 77;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const root = new THREE.Group();
  root.visible = false;
  g.scene.add(root);
  const R0 = r + 1; // los barrotes
  const R1 = r + 3.6; // el fondo de las celdas
  const top = TIERS * TIER_H;
  const cols = [];
  const keep = [];
  const stone = M.stoneDark || M.stone;
  const wall = M.stoneWall || M.cellWall || stone;

  // ---- el piso y la roca de abajo ----
  const floorGeo = planarUV(new THREE.CircleGeometry(R1 + 0.4, 72).rotateX(-Math.PI / 2), 2.6);
  const floor = new THREE.Mesh(floorGeo, M.stone);
  floor.position.set(x, y, z);
  floor.receiveShadow = true;
  root.add(floor);
  keep.push(floor);
  const under = new THREE.ConeGeometry(R1 + 0.7, 30, 40, 8, true).rotateX(Math.PI);
  const up = under.attributes.position;
  for (let i = 0; i < up.count; i++) {
    const a = Math.atan2(up.getZ(i), up.getX(i));
    const k = 1 + Math.sin(a * 6 + up.getY(i) * 0.4) * 0.08 + Math.sin(a * 15) * 0.04;
    up.setX(i, up.getX(i) * k);
    up.setZ(i, up.getZ(i) * k);
  }
  under.computeVertexNormals();
  root.add(mesh(under, M.rock || stone, x, y - 15.02, z));
  // el borde del redondel: un escalón de piedra antes de las celdas
  root.add(mesh(new THREE.TorusGeometry(R0 - 0.35, 0.18, 6, 72).rotateX(Math.PI / 2), stone, x, y + 0.02, z));

  // ---- las celdas: tres pisos, 24 por piso ----
  const bars = [];
  const posts = [];
  for (let i = 0; i < BAYS; i++) {
    const a = ((i + 0.5) / BAYS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // (mirando al centro)
    const face = Math.atan2(-ca, -sa);
    const chordIn = 2 * R0 * Math.sin(Math.PI / BAYS);
    const chordOut = 2 * R1 * Math.sin(Math.PI / BAYS);
    const at = (d) => [x + ca * d, z + sa * d];
    // el fondo, de arriba abajo
    const [wx, wz] = at(R1 + 0.2);
    root.add(mesh(boxUV(chordOut + 0.3, top + 0.6, 0.4, 2.5), wall, wx, y + (top + 0.6) / 2, wz, 0, face, 0));
    // el pilar entre esta celda y la de al lado (en el borde de la bahía)
    const b = (i / BAYS) * Math.PI * 2;
    const pd = (R0 + R1) / 2;
    root.add(mesh(boxUV(0.55, top + 0.5, R1 - R0 + 0.5, 2.5), wall, x + Math.cos(b) * pd, y + (top + 0.5) / 2, z + Math.sin(b) * pd, 0, Math.atan2(Math.cos(b), Math.sin(b)), 0));
    for (let t = 0; t < TIERS; t++) {
      const y0 = y + t * TIER_H;
      // el piso de la celda (y el balcón de adelante, arriba)
      if (t > 0) {
        const [sx, sz] = at((R0 - 1.05 + R1) / 2);
        root.add(mesh(boxUV(chordOut + 0.1, 0.24, R1 - R0 + 1.05, 2.5), stone, sx, y0 - 0.12, sz, 0, face, 0));
        // la baranda del balcón
        const [rx, rz] = at(R0 - 1);
        root.add(mesh(boxGeo(chordIn - 0.1, 0.06, 0.06), M.iron, rx, y0 + 0.95, rz, 0, face, 0));
        for (let k = 0; k < 4; k++) {
          const u = (k / 4 - 0.375) * (chordIn - 0.2);
          posts.push([rx + Math.cos(face) * u, y0 + 0.47, rz - Math.sin(face) * u]);
        }
      }
      // travesaños de la reja
      const [bx, bz] = at(R0);
      for (const hy of [0.12, TIER_H - 0.32]) root.add(mesh(boxGeo(chordIn - 0.5, 0.08, 0.06), M.iron, bx, y0 + hy, bz, 0, face, 0));
      // los barrotes
      for (let k = 0; k < BARS; k++) {
        const u = ((k + 0.5) / BARS - 0.5) * (chordIn - 0.6);
        bars.push([bx + Math.cos(face) * u, y0 + (TIER_H - 0.2) / 2, bz - Math.sin(face) * u]);
      }
      // un catre al fondo de algunas celdas
      if (rnd() < 0.6) {
        const [cx, cz] = at(R1 - 0.55);
        root.add(mesh(boxUV(1.7, 0.1, 0.7, 1.5), M.woodDark, cx, y0 + 0.45, cz, 0, face + (rnd() - 0.5) * 0.2, 0));
      }
    }
    // la cornisa de arriba
    const [tx, tz] = at((R0 - 1.2 + R1 + 0.6) / 2);
    root.add(mesh(boxUV(chordOut + 0.6, 0.45, R1 - R0 + 1.8, 2.5), stone, tx, y + top + 0.2, tz, 0, face, 0));
    // banderas coloradas colgando del balcón de arriba (las promesas del Gauchito)
    if (i % 2 === 0) {
      const [fx, fz] = at(R0 - 1.08);
      const len = 1.6 + rnd() * 1.2;
      root.add(mesh(new THREE.PlaneGeometry(0.75, len).translate(0, -len / 2, 0), M.redCloth || M.redPaint, fx, y + 2 * TIER_H + 0.9, fz, 0, face, (rnd() - 0.5) * 0.08));
    }
  }
  const barMesh = new THREE.InstancedMesh(cylGeo(0.022, 0.022, TIER_H - 0.2, 5), M.bars || M.iron, bars.length);
  const postMesh = new THREE.InstancedMesh(cylGeo(0.03, 0.03, 0.94, 5), M.iron, posts.length);
  const m4 = new THREE.Matrix4();
  bars.forEach((p, i) => barMesh.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
  posts.forEach((p, i) => postMesh.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
  barMesh.frustumCulled = postMesh.frustumCulled = false;
  root.add(barMesh, postMesh);
  keep.push(barMesh, postMesh);

  // ---- las cruces coloradas de adentro (tapan y atontan) ----
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const cx = x + Math.cos(a) * 8.6;
    const cz = z + Math.sin(a) * 8.6;
    const f = Math.atan2(x - cx, z - cz);
    root.add(mesh(boxUV(1.4, 0.7, 1.4, 1.5), stone, cx, y + 0.35, cz, 0, f, 0));
    root.add(mesh(boxGeo(0.32, 3.4, 0.32), M.redPaint, cx, y + 0.7 + 1.7, cz, 0, f, 0));
    root.add(mesh(boxGeo(1.7, 0.3, 0.3), M.redPaint, cx, y + 3.1, cz, 0, f, 0));
    // las cintas atadas a la cruz
    for (let j = 0; j < 3; j++) {
      const len = 0.6 + rnd() * 0.5;
      root.add(mesh(new THREE.PlaneGeometry(0.08, len).translate(0, -len / 2, 0), M.redCloth || M.redPaint, cx + Math.sin(f) * 0.17 + (j - 1) * 0.25 * Math.cos(f), y + 3.02, cz + Math.cos(f) * 0.17 - (j - 1) * 0.25 * Math.sin(f), (rnd() - 0.5) * 0.3, f, (rnd() - 0.5) * 0.4));
    }
    cols.push({ x: cx, z: cz, r: 0.8, h: 3.8, what: 'la cruz' });
  }

  // ---- las seis cadenas grandes que cuelgan la cárcel de las nubes ----
  const links = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 12;
    const from = new THREE.Vector3(x + Math.cos(a) * (R1 - 0.6), y + top + 0.4, z + Math.sin(a) * (R1 - 0.6));
    const to = new THREE.Vector3(x + Math.cos(a) * (R1 + 9), y + top + 48, z + Math.sin(a) * (R1 + 9));
    const n = 56;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3().lerpVectors(from, to, (i + 0.5) / n);
      links.push({ p, dir: to.clone().sub(from).normalize(), twist: i % 2 ? Math.PI / 2 : 0 });
    }
  }
  const linkMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.1, 5, 12).scale(1, 1.6, 1), M.iron, links.length);
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  links.forEach((L, i) => {
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), L.dir);
    q2.setFromAxisAngle(L.dir, L.twist);
    linkMesh.setMatrixAt(i, m4.compose(L.p, q2.multiply(q), one));
  });
  linkMesh.frustumCulled = false;
  root.add(linkMesh);
  keep.push(linkMesh);

  // ---- las almas en las celdas ----
  const soulData = [];
  for (let i = 0; i < BAYS; i++)
    for (let t = 0; t < TIERS; t++) {
      if (rnd() > 0.5) continue;
      const a = ((i + 0.5 + (rnd() - 0.5) * 0.35) / BAYS) * Math.PI * 2;
      const d = R0 + 0.28;
      soulData.push({ x: x + Math.cos(a) * d, y: y + t * TIER_H, z: z + Math.sin(a) * d, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), s: 0.95 + rnd() * 0.15, ph: rnd() * 6.28, rise: 0.6 + rnd() * 0.8 });
    }
  // (el cuerpo y el brillo de ánima: world/soulLook.js)
  const souls = new THREE.InstancedMesh(soulGeometry('stand'), soulMaterial({ top: 1.78, tail: 0.95 }), soulData.length);
  souls.frustumCulled = false;
  root.add(souls);
  keep.push(souls);

  // ---- el sello del piso y las velas del borde ----
  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(r - 1.5, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: sealTexture(rnd), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(0.95, 0.5, 0.5) }),
  );
  seal.position.set(x, y + 0.03, z);
  root.add(seal);
  keep.push(seal);
  const flames = [];
  const tmp = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rnd() * 0.05;
    const d = R0 - 0.55 + (rnd() - 0.5) * 0.3;
    const h = 0.08 + rnd() * 0.14;
    const cx = x + Math.cos(a) * d;
    const cz = z + Math.sin(a) * d;
    tmp.push(mesh(cylGeo(0.024, 0.026, h, 6), i % 3 ? M.redPaint : M.candle, cx, y + h / 2, cz));
    flames.push(cx, y + h + 0.035, cz);
  }
  for (const o of tmp) root.add(o);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(flames, 3));
  const flameCol = new Float32Array(flames.length);
  fg.setAttribute('color', new THREE.BufferAttribute(flameCol, 3));
  const candles = new THREE.Points(fg, new THREE.PointsMaterial({ map: g.textures.dot, size: 0.32, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  candles.frustumCulled = false;
  root.add(candles);
  keep.push(candles);
  mergeByMaterial(root, keep);

  // ---- lo que se mueve ----
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  let freed = false;
  let freeT = 0;
  // Sueltas (el usuario quiso verlas un rato): se prenden, pasan los barrotes
  // hacia el medio, suben en espiral dejando estela y se apagan arriba (~6 s).
  const FREE_T = 6;
  // Cuando el Gil cae (world/gilHeld.js): se le tiran encima y lo rodean en
  // remolino. grab: dónde está él (los pies); cada una, su vuelta (radio,
  // altura, velocidad; sin rnd, así no cambia el resto de la cárcel). Dónde está
  // cada una y cuánto llegó (0 a 1), para los lazos de luz.
  let grab = null;
  let grabT = 0;
  const GRAB_FLY = 1.15;
  // (afuera del cuerpo del Gil, que con los brazos abiertos ocupa 1,5 m de
  // cada lado: que se lo vea en el medio)
  const orbit = soulData.map((S, i) => {
    const u = (i * 0.618034) % 1;
    const v = (i * 0.414214 + 0.3) % 1;
    return { r: 3 + u * 2.2, h: 0.4 + v * 4.6, w: (0.8 + ((i * 0.29) % 1) * 0.8) * (S.ph > 3.14 ? 1 : -1) };
  });
  const cur = new Float32Array(soulData.length * 3);
  const flyK = new Float32Array(soulData.length);
  // las que lo agarran de las manos y los pies (las pone gilHeld cada cuadro):
  // dónde va su origen
  const pins = new Float32Array(soulData.length * 3);
  const pinOn = new Uint8Array(soulData.length);
  const sm = (x) => x * x * (3 - 2 * x);
  const update = (dt, t) => {
    SOUL_TIME.value = t;
    if (freed) freeT += dt;
    if (grab) grabT += dt;
    for (let i = 0; i < soulData.length; i++) {
      const S = soulData[i];
      if (grab) {
        const O = orbit[i];
        // (salen de a poco: primero las de un lado, después las otras)
        const f = Math.max(0, grabT - (i % 12) * 0.05 - S.ph * 0.03);
        const fly = sm(Math.min(1, f / GRAB_FLY));
        flyK[i] = fly;
        const a0 = Math.atan2(S.z - grab.z, S.x - grab.x);
        const d0 = Math.hypot(S.x - grab.x, S.z - grab.z);
        if (pinOn[i]) {
          // (de la celda a la mano o al pie que agarra, en arco)
          p.set(S.x + (pins[i * 3] - S.x) * fly, S.y + (pins[i * 3 + 1] - S.y) * fly + Math.sin(fly * Math.PI) * 1.4, S.z + (pins[i * 3 + 2] - S.z) * fly);
        } else {
          // (la vuelta se acelera y se va cerrando sobre él)
          const ang = a0 + O.w * (f * 0.55 + f * f * 0.1);
          const rad = d0 + (O.r * (1 - 0.25 * Math.min(1, f / 4.5)) - d0) * fly;
          const hy = S.y + (grab.y + O.h + Math.sin(t * 2.1 + S.ph) * 0.18 - S.y) * fly + Math.sin(fly * Math.PI) * 1.6;
          p.set(grab.x + Math.cos(ang) * rad, hy, grab.z + Math.sin(ang) * rad);
        }
        // miran al Gil (con los brazos para adelante, como en los barrotes)
        e.set((pinOn[i] ? 0.15 : 0.35) * fly + Math.sin(t * 5 + S.ph) * 0.08, Math.atan2(grab.x - p.x, grab.z - p.z), Math.sin(t * 3 + S.ph) * 0.1);
        s3.setScalar(S.s * (1 + fly * 0.15));
        m.compose(p, q.setFromEuler(e), s3);
        souls.setMatrixAt(i, m);
        souls.setColorAt(i, c.setScalar((0.8 + Math.sin(t * 7 + S.ph) * 0.15) * (0.6 + fly * 0.3)));
        cur[i * 3] = p.x;
        cur[i * 3 + 1] = p.y + 1.3 * S.s;
        cur[i * 3 + 2] = p.z;
        if (Math.random() < dt * (fly < 1 ? 14 : 4)) g.fx.add.spawn(p.x, p.y + 1.1, p.z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, { color: [0.4, 0.75, 1], size: 0.24, size1: 0.02, life: 0.9, gravity: 0 });
        continue;
      }
      // (cada una arranca un poquito después que la otra)
      const f = freed ? Math.max(0, freeT - S.ph * 0.12) : 0;
      const lift = f * f * 0.32 * S.rise + f * 0.4;
      const inward = Math.min(1, f / 3) * 0.45;
      const spin = f * 0.35 * (S.ph > 3.14 ? 1 : -1);
      const dx = S.x - x;
      const dz = S.z - z;
      const px = x + (dx * Math.cos(spin) - dz * Math.sin(spin)) * (1 - inward);
      const pz = z + (dx * Math.sin(spin) + dz * Math.cos(spin)) * (1 - inward);
      // se sacuden contra los barrotes; sueltas, suben y se apagan
      const shake = freed ? 0 : Math.max(0, Math.sin(t * 0.7 + S.ph * 3)) * 0.05;
      p.set(px + Math.sin(t * 17 + S.ph) * shake, S.y + Math.sin(t * 1.3 + S.ph) * 0.04 + lift, pz + Math.cos(t * 13 + S.ph) * shake);
      e.set(Math.sin(t * 0.9 + S.ph) * 0.05 - Math.min(1, f) * 0.5, S.yaw + spin, Math.sin(t * 0.7 + S.ph) * 0.05);
      s3.setScalar(S.s * (1 + Math.min(1, f) * 0.25));
      m.compose(p, q.setFromEuler(e), s3);
      souls.setMatrixAt(i, m);
      // (se prenden al soltarse y se apagan en el último tramo)
      const out = freed ? Math.max(0, 1 - Math.max(0, f - FREE_T * 0.55) / (FREE_T * 0.4)) : 1;
      const glow = (0.85 + Math.sin(t * 2.3 + S.ph) * 0.15) * (freed ? out * (1 + Math.min(1, f * 2) * 0.9) : 1);
      souls.setColorAt(i, c.setScalar(glow));
      if (freed && out > 0.05 && Math.random() < dt * 7) g.fx.add.spawn(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.4, (Math.random() - 0.5) * 0.4, { color: [0.35, 0.65, 1], size: 0.2, size1: 0.02, life: 1.4, gravity: 0 });
    }
    souls.instanceMatrix.needsUpdate = true;
    if (souls.instanceColor) souls.instanceColor.needsUpdate = true;
    for (let i = 0; i < flameCol.length; i += 3) {
      const f = 0.7 + Math.sin(t * 13 + i * 1.7) * 0.15 + Math.sin(t * 29 + i) * 0.1;
      flameCol[i] = f;
      flameCol[i + 1] = f * 0.55;
      flameCol[i + 2] = f * 0.18;
    }
    candles.geometry.attributes.color.needsUpdate = true;
    seal.material.opacity = 0.85 + Math.sin(t * 2.1) * 0.15;
  };
  update(0, 0);
  return {
    root,
    cols,
    // dónde van las dos luces coloradas del cerro mientras se pelea acá
    lights: [new THREE.Vector3(x - 6, y + 6.5, z), new THREE.Vector3(x + 6, y + 6.5, z)],
    // ¿(px, pz) está arriba del redondel? (el piso de las celdas incluido)
    over: (px, pz) => Math.hypot(px - x, pz - z) < R1 + 0.4,
    update,
    free() {
      if (freed) return;
      freed = true;
      freeT = 0;
      for (const S of soulData) if (Math.random() < 0.5) g.fx.sparkle(new THREE.Vector3(S.x, S.y + 1.2, S.z), [0.5, 0.8, 1], 4, 0.4);
      g.audio.chain?.(new THREE.Vector3(x, y + 2, z));
    },
    reset() {
      freed = false;
      freeT = 0;
      grab = null;
      grabT = 0;
      pinOn.fill(0);
    },
    // El alma i va a (x, y, z) (su origen: los pies de la cola) en vez de dar vueltas.
    pin(i, x, y, z) {
      pinOn[i] = 1;
      pins[i * 3] = x;
      pins[i * 3 + 1] = y;
      pins[i * 3 + 2] = z;
    },
    // Se le tiran encima al Gil, que está en `at` (los pies).
    grab(at) {
      if (grab) return;
      grab = at.clone();
      grabT = 0;
      for (const S of soulData) g.fx.sparkle(new THREE.Vector3(S.x, S.y + 1.2, S.z), [0.5, 0.8, 1], 5, 0.4);
    },
    souls: soulData.length,
    // dónde está el alma i (el pecho) y cuánto llegó hasta el Gil (0 a 1)
    soulAt(i, out) {
      return out.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    },
    soulK(i) {
      return grab ? flyK[i] : 0;
    },
  };
}
