import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Las estatuas del Monumento (y de Lola Mora en el Pasaje): figuras armadas
// con piezas (túnica con pliegues, torso, cabeza, brazos y piernas puestos en
// pose) y fundidas en una sola malla facetada, de bronce o de mármol. Cada
// tipo es un personaje: la Patria Abanderada con la bandera en la tacuara,
// la Madre Patria con los brazos abiertos, Belgrano de levita, los jinetes
// con lanza, la Pampa y los Andes, los colosos del agua y los grupos del
// Pasaje. statue(kind, mat, x, y, z, ry, s) devuelve mallas para fundir.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Un cuerpo de revolución con radio que varía con el ángulo (los pliegues):
// rings = [[y, r, pliegue]], de abajo hacia arriba.
function folds(rings, { seg = 18, n = 7, phase = 0, sx = 1, sz = 1 } = {}) {
  const pos = [];
  const idx = [];
  rings.forEach(([y, r, f], j) => {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const rr = r * (1 + f * Math.sin(a * n + phase + j * 0.7));
      pos.push(Math.sin(a) * rr * sx, y, Math.cos(a) * rr * sz);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      // (antihorario visto desde afuera: si no, la túnica queda dada vuelta y
      // se ve el adentro, con el bronce hueco)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // tapas: abajo mirando abajo y arriba mirando arriba (que no se vea hueco desde arriba)
  for (const [j, up] of [[0, false], [rings.length - 1, true]]) {
    const c = pos.length / 3;
    pos.push(0, rings[j][0], 0);
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      if (up) idx.push(c, a, a + 1);
      else idx.push(c, a + 1, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Un cilindro de a hacia b (brazos, piernas, la tacuara).
function limb(a, b, r0, r1 = r0, seg = 7) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function ball(p, r, sx = 1, sy = 1, sz = 1, det = 1) {
  const g = new THREE.IcosahedronGeometry(r, det);
  g.scale(sx, sy, sz);
  g.translate(p.x, p.y, p.z);
  return g;
}

// Un brazo que sale del hombro `sh` en la dirección (yaw, pitch) del brazo y
// (yaw2, pitch2) del antebrazo; devuelve las piezas y dónde quedó la mano.
function arm(parts, sh, [y1, p1], [y2, p2], len = 0.3, r = 0.05) {
  const dir = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const el = sh.clone().addScaledVector(dir(y1, p1), len);
  const hd = el.clone().addScaledVector(dir(y2, p2), len * 0.92);
  parts.push(limb(sh, el, r * 1.1, r), limb(el, hd, r, r * 0.8), ball(hd, r * 1.1, 1, 1.2, 0.8));
  return hd;
}

// La bandera de bronce (o de tela): una hoja ondulada que cuelga del asta.
function flag(parts, top, w = 1.4, h = 0.9, dir = V(-1, 0, 0), droop = 0.4) {
  const g = new THREE.PlaneGeometry(w, h, 8, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + w / 2) / w;
    p.setZ(i, Math.sin(u * 5.2) * 0.12 * u);
    p.setY(i, p.getY(i) - u * u * droop);
  }
  g.translate(w / 2, -h / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(top.x, top.y, top.z);
  parts.push(g);
  // la otra cara (la hoja es fina, pero se ve de los dos lados)
  const back = g.clone();
  const ix = back.index.array;
  for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
  parts.push(back);
}

// Una figura de pie (origen en los pies, mirando +z). o: túnica (mujer) o
// levita (hombre), y los ángulos de los brazos.
function figure(parts, o = {}) {
  const robe = o.robe ?? true;
  const h = o.h ?? 1.0;
  const lean = o.lean ?? 0;
  if (robe) {
    // la túnica con pliegues, del ruedo a la cintura, y el manto sobre los hombros
    parts.push(folds([[0, 0.34, 0.1], [0.25, 0.3, 0.09], [0.6, 0.24, 0.07], [0.9, 0.17, 0.05], [1.02, 0.15, 0.03]], { seg: 20, n: 9, phase: o.phase || 0, sz: 0.85 }));
    parts.push(folds([[1.0, 0.16, 0.02], [1.18, 0.19, 0.03], [1.35, 0.2, 0.03], [1.45, 0.17, 0.02], [1.5, 0.08, 0]], { seg: 16, n: 5, sz: 0.75 }));
    // el manto que cae por la espalda
    parts.push(folds([[0.15, 0.32, 0.12], [0.8, 0.26, 0.1], [1.42, 0.22, 0.04]], { seg: 14, n: 6, sz: 0.6, phase: 1.3 }).translate(0, 0, -0.09));
  } else {
    // botas, piernas, la levita con faldones y el torso
    for (const s of [-1, 1]) {
      parts.push(limb(V(s * 0.09, 0, 0.02), V(s * 0.09, 0.45, 0), 0.07, 0.065));
      parts.push(limb(V(s * 0.09, 0.45, 0), V(s * 0.1, 0.88, 0), 0.075, 0.085));
      parts.push(ball(V(s * 0.09, 0.04, 0.06), 0.07, 1, 0.6, 1.6));
    }
    parts.push(folds([[0.5, 0.22, 0.06], [0.8, 0.2, 0.04], [0.98, 0.17, 0.02]], { seg: 16, n: 4, sz: 0.7, phase: 0.5 }));
    parts.push(folds([[0.95, 0.17, 0.02], [1.18, 0.2, 0.02], [1.36, 0.22, 0.02], [1.46, 0.18, 0], [1.5, 0.08, 0]], { seg: 16, n: 3, sz: 0.72 }));
    // las solapas y los botones de la levita
    for (let i = 0; i < 5; i++) parts.push(ball(V(0.05, 1.04 + i * 0.07, 0.15), 0.014));
  }
  // cuello, cabeza y pelo (o sombrero)
  parts.push(limb(V(0, 1.48, 0), V(0, 1.58, 0.01), 0.055, 0.05));
  parts.push(ball(V(0, 1.67, 0.02), 0.105, 0.9, 1.08, 0.98));
  parts.push(ball(V(0, 1.6, 0.1), 0.03, 0.9, 1.2, 0.9));
  if (o.hair === 'bun') parts.push(ball(V(0, 1.72, -0.06), 0.1, 1, 0.9, 1), ball(V(0, 1.7, -0.14), 0.06));
  else if (o.hair === 'helmet') parts.push(ball(V(0, 1.73, 0.0), 0.12, 1, 0.75, 1.05), limb(V(0, 1.8, 0), V(0, 1.86, -0.12), 0.02, 0.05));
  else parts.push(ball(V(0, 1.72, -0.01), 0.106, 1, 0.75, 1.02));
  // los brazos
  const shL = V(0.2, 1.42, 0);
  const shR = V(-0.2, 1.42, 0);
  const hands = {
    l: arm(parts, shL, o.armL?.[0] ?? [0.3, -1.4], o.armL?.[1] ?? [0.2, -1.3]),
    r: arm(parts, shR, o.armR?.[0] ?? [-0.3, -1.4], o.armR?.[1] ?? [-0.2, -1.3]),
  };
  // la escala y la inclinación de todo
  if (h !== 1 || lean) for (const g of parts) {
    if (lean) g.rotateX(lean);
    if (h !== 1) g.scale(h, h, h);
  }
  return hands;
}

// Un caballo (cuerpo, cuello, cabeza, cuatro patas y la cola), mirando +z.
function horse(parts, rear = 0) {
  const B = (a, b, r0, r1) => parts.push(limb(a, b, r0, r1, 8));
  parts.push(ball(V(0, 1.25 + rear * 0.2, 0), 0.32, 0.85, 0.85, 1.9));
  B(V(0, 1.4 + rear * 0.3, 0.5), V(0, 1.85 + rear * 0.45, 0.78), 0.17, 0.12);
  parts.push(ball(V(0, 1.92 + rear * 0.45, 0.95), 0.11, 0.8, 0.9, 2.0));
  for (const [x, z, f] of [[0.15, 0.42, 1], [-0.15, 0.42, 1], [0.15, -0.45, 0], [-0.15, -0.45, 0]]) {
    const up = f && rear ? 0.55 : 0;
    B(V(x, 1.15, z), V(x, 0.62 + up, z + (f ? 0.05 + up * 0.3 : -0.05)), 0.08, 0.06);
    B(V(x, 0.62 + up, z + (f ? 0.05 + up * 0.3 : -0.05)), V(x, 0.02 + up * 1.2, z + (f ? 0.02 + up * 0.5 : -0.02)), 0.055, 0.05);
  }
  B(V(0, 1.3, -0.62), V(0, 0.65, -0.82), 0.07, 0.03);
}

// Fundido: todo en una malla facetada (normales por cara).
function fuse(parts, mat, x, y, z, ry, s) {
  const list = parts.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    for (const nm of Object.keys(q.attributes)) if (nm !== 'position') q.deleteAttribute(nm);
    return q;
  });
  const geo = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  geo.computeVertexNormals();
  // UV de caja (sin estirar mucho la pátina)
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.7;
    uv[i * 2 + 1] = p.getY(i) * 0.7;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.scale.setScalar(s);
  return m;
}

// Los probadores del patio de la 2043 (y Fortu): chicos de ahora, de piedra,
// con zapatillas, jean y buzo con capucha, cada uno en su pose y con lo suyo.
// pose: 'mate' (el mate y el termo), 'pulgar', 'brazos' (cruzados), 'saludo',
// 'pelota' (el pie arriba de la pelota), 'auris' (auriculares, manos en los
// bolsillos), 'heroe' (Fortu: el puño en alto y la capa del buzo al viento).
export function probador(pose, mat, x, y, z, ry = 0, s = 1) {
  const parts = [];
  // zapatillas, piernas de jean y el buzo (más ancho, con la capucha atrás)
  const legOpen = pose === 'heroe' ? 0.16 : 0.1;
  for (const sx of [-1, 1]) {
    const footUp = pose === 'pelota' && sx > 0 ? 0.22 : 0;
    parts.push(ball(V(sx * legOpen, 0.05 + footUp, 0.05), 0.075, 1.1, 0.7, 1.75));
    parts.push(limb(V(sx * legOpen, 0.08 + footUp, 0.02), V(sx * 0.1, 0.48 + footUp * 0.5, 0.02 + footUp * 0.4), 0.07, 0.075));
    parts.push(limb(V(sx * 0.1, 0.48 + footUp * 0.5, 0.02 + footUp * 0.4), V(sx * 0.1, 0.9, 0), 0.08, 0.09));
  }
  parts.push(folds([[0.82, 0.21, 0.04], [0.98, 0.2, 0.03], [1.2, 0.22, 0.02], [1.38, 0.24, 0.02], [1.47, 0.19, 0.01], [1.52, 0.08, 0]], { seg: 16, n: 5, sz: 0.72 }));
  // la capucha caída y el bolsillo canguro
  parts.push(ball(V(0, 1.47, -0.12), 0.13, 1.1, 0.6, 0.8));
  parts.push(ball(V(0, 1.02, 0.15), 0.13, 1.2, 0.55, 0.35));
  // cuello, cabeza y el pelo (o la gorra, o los auriculares)
  parts.push(limb(V(0, 1.5, 0), V(0, 1.6, 0.01), 0.055, 0.05));
  parts.push(ball(V(0, 1.69, 0.02), 0.105, 0.9, 1.08, 0.98));
  parts.push(ball(V(0, 1.62, 0.11), 0.03, 0.9, 1.2, 0.9));
  if (pose === 'saludo' || pose === 'heroe') parts.push(ball(V(0, 1.75, 0), 0.11, 1, 0.75, 1.05));
  else if (pose === 'pulgar') parts.push(ball(V(0, 1.75, -0.01), 0.115, 1, 0.55, 1.05), ball(V(0, 1.75, 0.12), 0.09, 1.1, 0.15, 0.9));
  else parts.push(ball(V(0, 1.75, -0.01), 0.108, 1, 0.8, 1.02));
  if (pose === 'auris') {
    parts.push(limb(V(-0.12, 1.69, 0), V(0, 1.84, 0), 0.015, 0.015, 5), limb(V(0, 1.84, 0), V(0.12, 1.69, 0), 0.015, 0.015, 5));
    for (const sx of [-1, 1]) parts.push(ball(V(sx * 0.12, 1.68, 0.01), 0.05, 0.6, 1, 1));
  }
  // los brazos según la pose (desde los hombros del buzo)
  const shL = V(0.22, 1.42, 0);
  const shR = V(-0.22, 1.42, 0);
  const ARMS = {
    mate: [[[0.4, -0.9], [1.1, 0.2]], [[-0.3, -1.3], [-0.2, -1.2]]],
    pulgar: [[[0.5, -0.3], [0.9, 0.9]], [[-0.3, -1.3], [-0.2, -1.2]]],
    brazos: [[[0.5, -1.0], [-1.2, 0.1]], [[-0.5, -1.0], [1.2, 0.05]]],
    saludo: [[[0.2, -1.3], [0.2, -1.2]], [[-0.9, 0.5], [-0.5, 1.3]]],
    pelota: [[[0.6, -1.0], [0.7, -0.6]], [[-0.6, -1.0], [-0.7, -0.6]]],
    auris: [[[0.15, -1.2], [-0.4, -1.1]], [[-0.15, -1.2], [0.4, -1.1]]],
    heroe: [[[0.15, 1.2], [0.1, 1.45]], [[-0.8, -0.8], [-1.2, -0.4]]],
  }[pose] || [[[0.3, -1.4], [0.2, -1.3]], [[-0.3, -1.4], [-0.2, -1.3]]];
  const hl = arm(parts, shL, ARMS[0][0], ARMS[0][1], 0.29, 0.055);
  const hr = arm(parts, shR, ARMS[1][0], ARMS[1][1], 0.29, 0.055);
  if (pose === 'mate') {
    // el mate en la mano izquierda (con la bombilla) y el termo bajo el brazo derecho
    parts.push(folds([[0, 0.045, 0], [0.05, 0.062, 0], [0.1, 0.058, 0], [0.13, 0.045, 0]], { seg: 12, n: 2 }).translate(hl.x, hl.y + 0.02, hl.z));
    parts.push(limb(V(hl.x, hl.y + 0.1, hl.z), V(hl.x + 0.03, hl.y + 0.24, hl.z + 0.02), 0.008, 0.006, 4));
    parts.push(limb(V(-0.27, 0.95, 0.06), V(-0.27, 1.32, 0.04), 0.06, 0.055, 10));
  } else if (pose === 'pulgar') {
    parts.push(limb(hl, hl.clone().add(V(0, 0.09, 0)), 0.018, 0.015, 5));
  } else if (pose === 'pelota') {
    // la pelota bajo el pie derecho
    parts.push(ball(V(0.12, 0.12, 0.18), 0.12, 1, 1, 1, 2));
  } else if (pose === 'heroe') {
    // el buzo que flamea atrás como capa y el puño cerrado
    parts.push(folds([[0.6, 0.32, 0.12], [1.0, 0.27, 0.08], [1.45, 0.22, 0.03]], { seg: 14, n: 5, sz: 0.5, phase: 0.4 }).translate(0, 0, -0.16));
    parts.push(ball(hl, 0.07, 1, 1.1, 1));
  }
  void hr;
  return [fuse(parts, mat, x, y, z, ry, s)];
}

export function statue(kind, mat, x, y, z, ry = 0, s = 1) {
  const parts = [];
  switch (kind) {
    case 'patria': {
      // la Patria Abanderada: avanza con la bandera en la tacuara, hacia el río
      const h = figure(parts, { robe: true, hair: 'bun', armR: [[-0.1, 0.9], [0.1, 1.2]], armL: [[0.5, -0.2], [0.2, 0.3]], lean: 0.08, phase: 0.6 });
      const base = V(-0.28, 0.2, 0.5);
      const top = V(-0.12, 3.2, 0.9);
      parts.push(limb(base, top, 0.028, 0.022, 6));
      parts.push(ball(top, 0.05, 1, 2.2, 1));
      flag(parts, V(-0.13, 3.05, 0.88), 1.5, 0.95, V(-0.3, -0.15, -1), 0.5);
      void h;
      break;
    }
    case 'madre': {
      // la Madre Patria: los brazos abiertos, abrazando los escudos de las provincias
      figure(parts, { robe: true, hair: 'bun', armL: [[1.0, -0.3], [0.6, 0.1]], armR: [[-1.0, -0.3], [-0.6, 0.1]], phase: 1.7 });
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(ball(V(sx * (0.38 + i * 0.12), 0.75 + i * 0.22, 0.25), 0.12, 1, 1.15, 0.25));
      break;
    }
    case 'belgrano': {
      // Belgrano de levita: la mano derecha al pecho, la izquierda en la empuñadura del sable
      figure(parts, { robe: false, armR: [[0.6, -0.6], [1.6, 0.2]], armL: [[0.25, -1.3], [0.4, -1.1]] });
      parts.push(limb(V(0.3, 0.95, 0.05), V(0.36, 0.12, -0.12), 0.022, 0.018, 5));
      // el cuello alto de la casaca y las charreteras
      parts.push(ball(V(0, 1.5, 0), 0.12, 1.1, 0.4, 0.95));
      for (const sx of [-1, 1]) parts.push(ball(V(sx * 0.21, 1.45, 0), 0.07, 1.2, 0.5, 1.1));
      break;
    }
    case 'pampa':
    case 'andes': {
      // figuras de pie, blancas: la Pampa con la espiga, los Andes con la lanza al costado
      const robe = kind === 'pampa';
      const hands = figure(parts, { robe, hair: robe ? 'bun' : 'short', armR: robe ? [[-0.4, -0.9], [0.4, 0.2]] : [[-0.2, -1.3], [-0.2, -1.4]], armL: [[0.3, -1.3], [0.2, -1.2]] });
      if (robe) parts.push(limb(hands.r, hands.r.clone().add(V(0.05, 0.55, 0.05)), 0.02, 0.012, 5), ball(hands.r.clone().add(V(0.06, 0.62, 0.06)), 0.05, 0.6, 1.8, 0.6));
      else parts.push(limb(V(-0.32, 0, 0.08), V(-0.3, 2.2, 0.1), 0.025, 0.02, 5), ball(V(-0.3, 2.28, 0.1), 0.05, 0.6, 2, 0.4));
      break;
    }
    case 'jinete': {
      // jinete con lanza sobre un caballo que se para de manos
      horse(parts, 1);
      const rider = [];
      figure(rider, { robe: false, armR: [[-0.3, 0.6], [0.1, 1.0]], armL: [[0.4, -0.5], [0.6, -0.2]] });
      for (const g of rider) parts.push(g.scale(0.85, 0.85, 0.85).translate(0, 1.05, -0.05));
      parts.push(limb(V(-0.22, 1.2, -0.4), V(-0.28, 3.6, 0.6), 0.025, 0.02, 5));
      break;
    }
    case 'parana':
    case 'atlantico': {
      // los colosos del agua: sentados, una mano en la rodilla y la otra sobre el ánfora
      const body = [];
      figure(body, { robe: false, armL: [[0.5, -0.8], [0.3, -1.2]], armR: [[-0.6, -0.3], [-0.2, -0.9]] });
      for (const g of body) parts.push(g.translate(0, -0.45, 0));
      parts.push(ball(V(0, 0.45, -0.05), 0.42, 1.1, 0.5, 1.2));
      parts.push(ball(V(-0.55, 0.45, 0.25), 0.22, 1, 1.3, 1));
      parts.push(limb(V(-0.55, 0.75, 0.25), V(-0.55, 0.88, 0.25), 0.08, 0.1, 8));
      break;
    }
    case 'lola': {
      // una figura de Lola Mora: mármol, un brazo en alto
      figure(parts, { robe: true, hair: 'bun', armR: [[-0.2, 1.1], [-0.1, 1.3]], phase: 2.4 });
      break;
    }
    case 'lolaPar': {
      // un par (la Madre y el Hijo, los Gauchos)
      const a = [];
      const b = [];
      figure(a, { robe: true, hair: 'bun', armL: [[0.8, -0.6], [1.2, -0.2]], phase: 0.3 });
      figure(b, { robe: false, h: 0.62, armR: [[-0.6, 0.2], [-0.4, 0.6]] });
      for (const g of a) parts.push(g.translate(-0.2, 0, 0));
      for (const g of b) parts.push(g.translate(0.32, 0, 0.12));
      break;
    }
    case 'granadero': {
      // un granadero a caballo (Los Granaderos de Lola Mora y los fantasmas de la carga)
      horse(parts, 0);
      const rider = [];
      figure(rider, { robe: false, hair: 'helmet', armR: [[-0.2, 0.3], [0.1, 0.8]], armL: [[0.3, -0.6], [0.2, -0.5]] });
      for (const g of rider) parts.push(g.scale(0.85, 0.85, 0.85).translate(0, 1.05, -0.05));
      parts.push(limb(V(-0.28, 2.35, 0.2), V(-0.3, 2.9, 0.75), 0.02, 0.01, 5));
      break;
    }
    case 'gorriti': {
      // el canónigo Gorriti: la sotana, la estola y las manos adelante (para recibir el escudo)
      figure(parts, { robe: true, armL: [[0.2, -0.9], [-0.15, 0.15]], armR: [[-0.2, -0.9], [0.15, 0.15]], phase: 0.9 });
      for (const sx of [-1, 1]) parts.push(limb(V(sx * 0.07, 1.46, 0.12), V(sx * 0.09, 0.5, 0.21), 0.032, 0.04, 4));
      // la cruz del pecho y el bonete
      parts.push(limb(V(0, 1.1, 0.18), V(0, 1.27, 0.18), 0.012, 0.012, 4), limb(V(-0.05, 1.22, 0.18), V(0.05, 1.22, 0.18), 0.012, 0.012, 4));
      parts.push(limb(V(0, 1.73, -0.01), V(0, 1.85, -0.01), 0.112, 0.1, 4), ball(V(0, 1.88, -0.01), 0.028));
      break;
    }
    default:
      figure(parts, {});
  }
  return [fuse(parts, mat, x, y, z, ry, s)];
}
