import * as THREE from 'three';
import { EE } from '../../config/map';
import Carry from '../../world/monumentoCarry';
import { ghostMaterial, GHOST_TIME } from '../../fx/ghostMat';
import { carvedText, banderaTexture } from '../../world/monumentoTextures';
import { toTexture } from '../../core/textures';
import { players, playerById, myId, isHost, isDown } from '../castle/common';
import Navigation from '../../world/Navigation';
import { SPEEDS } from '../../config/rules';

// "La Primera Bandera" (el easter egg del Monumento, entities/MonumentoEgg.js):
//  1. Con la Llama prendida y el Sable Corvo forjado aparece el ánima de
//     María Catalina Echevarría, la costurera, en el Pasaje (al lado de la
//     estatua de Belgrano y la Bandera). Le faltan las telas.
//  2. La celeste se enganchó afuera de una ventana del Mirador (se sube en
//     ascensor): se corta de un sablazo. La blanca flota en la niebla del río,
//     al lado del muelle: se la baja tirándole el sable.
//  3. Con las dos, cose: un minuto, y mientras cose hay que quedarse cerca
//     (los muertos vienen en manada). Si no queda nadie cerca, se frena.
//  4. La Bandera la lleva uno (no puede tirar; G la deja) hasta el mástil de
//     la barranca, en el Parque. Ahí se ata y se iza: mientras sube, hay que
//     aguantar alrededor. Arriba: la cinemática de Belgrano (MonumentoEgg).
//     Con más presión (el usuario, 2026-10-07): desde que la Bandera sale de
//     la costurera salen más muertos y corren todos; y mientras sube, tres de
//     cada cinco van derecho al mástil a tirar de la driza: cada tirón la baja
//     (hay que voltearlos antes de que lleguen). Zombies los manda por
//     g.defense (entities/monumento/Armada.js active / goal / zombieHit).
//     globalThis.__mduNoBanderaHorda: como antes.
// Lo decide el anfitrión y viaja por 'pee' (k: 'bnd').

const SEW_T = 60;
const SEW_R = 11;
const HOIST_T = 25;
const HOIST_R = 11;
// lo que baja la Bandera con cada tirón de un muerto (con un jugador; con más, menos)
const TUG = 0.025;
// el que va al mástil, a esta distancia de un jugador prefiere al jugador (y lo sigue hasta esta otra)
const AGGRO_IN = 2.6;
const AGGRO_OUT = 4.2;
// a qué distancia del mástil se paran a tirar
const MAST_R = 1.15;
const MAST_H = 9.5;
const CELESTE = 0x74acdf;
// la tela celeste: atada al parante del medio de la cara este del Mirador, afuera
const CEL_AT = new THREE.Vector3(79.75, 46.35, 31.0);
const CEL_FLOOR = new THREE.Vector3(78.35, 44.02, 31.25);
// la blanca: da vueltas sobre el agua, al costado del muelle
const BLA_C = new THREE.Vector3(120.5, -3.3, 35.6);
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

// La tela que flamea (un plano con un vaivén en el vértice).
const CLOTH_T = { value: 0 };
function clothMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, ...opts });
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = CLOTH_T;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      { float u = uv.x; float v = 1.0 - uv.y;
        transformed.z += (sin(u * 7.0 - uT * 5.0 + v * 2.0) * 0.12 + sin(u * 3.1 - uT * 2.3) * 0.08) * u;
        transformed.y -= u * u * 0.06 + v * u * 0.04; }`,
    );
  };
  m.customProgramCacheKey = () => 'monCloth';
  return m;
}
function cloth(w, h, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 6).translate(w / 2, -h / 2, 0), mat);
  m.castShadow = true;
  return m;
}

// La bandera de Belgrano: celeste, blanca y celeste, cosida a mano, con el Sol
// de Mayo (world/monumentoTextures.js; __mduNoSolEE: la de antes, sin el sol).
let flagTex = null;
function banderaTex() {
  if (flagTex) return flagTex;
  if (globalThis.__mduNoSolEE !== true) return (flagTex = banderaTexture({ seams: true }));
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#74acdf';
  x.fillRect(0, 0, 256, 160);
  x.fillStyle = '#f4f2ec';
  x.fillRect(0, 53, 256, 54);
  // las costuras (a mano, apenas)
  x.strokeStyle = 'rgba(80,90,110,0.35)';
  x.setLineDash([3, 4]);
  for (const y of [53, 107]) {
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(256, y);
    x.stroke();
  }
  flagTex = new THREE.CanvasTexture(c);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  return flagTex;
}

// El ánima de la costurera, sentada en su silla con la tela en la falda.
function costureraModel(mat) {
  const g = new THREE.Group();
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const lathe = (pts, n = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
  // la silla
  add(new THREE.BoxGeometry(0.5, 0.05, 0.46), 0, 0.46, 0);
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) add(new THREE.CylinderGeometry(0.02, 0.022, 0.46, 6), x, 0.23, z);
  add(new THREE.BoxGeometry(0.5, 0.6, 0.04), 0, 0.78, -0.22);
  // la falda larga (sentada: cae desde la rodilla) y el corpiño
  add(lathe([[0.0, 0.5], [0.26, 0.52], [0.3, 0.6], [0.28, 0.66], [0.17, 0.72], [0.0, 0.72]]), 0, 0, 0.02);
  add(lathe([[0.0, 0.0], [0.3, 0.02], [0.26, 0.25], [0.22, 0.5], [0.0, 0.5]]), 0, 0, 0.3);
  add(lathe([[0.0, 0.7], [0.17, 0.72], [0.15, 0.86], [0.17, 1.0], [0.12, 1.08], [0.0, 1.1]]), 0, 0, -0.04);
  // el chal sobre los hombros
  add(new THREE.TorusGeometry(0.15, 0.05, 6, 14, Math.PI * 1.3), 0, 1.03, -0.03, Math.PI / 2 - 0.2, 0, Math.PI * 0.85);
  // la cabeza (mirando la costura) y el rodete
  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.0);
  head.rotation.x = 0.45;
  g.add(head);
  add(new THREE.SphereGeometry(0.1, 14, 10), 0, 0, 0, 0, 0, 0, head).scale.set(0.9, 1.1, 0.95);
  add(new THREE.SphereGeometry(0.065, 10, 8), 0, 0.04, -0.09, 0, 0, 0, head);
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), 0, -0.12, 0, 0, 0, 0, head);
  // los brazos: el izquierdo sostiene la tela, el derecho cose (se mueve)
  const armL = new THREE.Group();
  armL.position.set(-0.17, 1.0, -0.02);
  armL.rotation.set(-0.9, 0, 0.25);
  g.add(armL);
  add(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 8).translate(0, -0.14, 0), 0, 0, 0, 0, 0, 0, armL);
  const forL = add(new THREE.CylinderGeometry(0.033, 0.028, 0.26, 8).translate(0, -0.13, 0), 0, -0.28, 0, -0.9, 0, 0, armL);
  void forL;
  const armR = new THREE.Group();
  armR.position.set(0.17, 1.0, -0.02);
  armR.rotation.set(-0.8, 0, -0.25);
  g.add(armR);
  add(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 8).translate(0, -0.14, 0), 0, 0, 0, 0, 0, 0, armR);
  const forR = new THREE.Group();
  forR.position.set(0, -0.28, 0);
  forR.rotation.x = -1.0;
  armR.add(forR);
  add(new THREE.CylinderGeometry(0.033, 0.028, 0.26, 8).translate(0, -0.13, 0), 0, 0, 0, 0, 0, 0, forR);
  // la aguja con el hilo
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), 0, -0.29, 0.02, 0.6, 0, 0, forR);
  // el canasto de costura en el piso
  add(lathe([[0.0, 0.0], [0.16, 0.0], [0.19, 0.16], [0.0, 0.16]], 12), 0.45, 0, 0.3);
  g.userData = { armR, forR, head };
  return g;
}

export default class Bandera {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    const M = g.world.M;
    this.root = new THREE.Group();
    this.root.name = 'bandera';
    g.scene.add(this.root);
    // on: apareció la costurera; cel/bla: 0 en su lugar, 1 cortada, 2 juntada;
    // sew: 0, 1 cosiendo, 2 lista; flag: dónde está la Bandera; hoist: 0..1
    this.st = { on: 0, cel: 0, bla: 0, sew: 0, sp: 0, flag: 'none', carrier: -1, fpos: [0, 0, 0], hoist: 0, raising: 0, done: 0 };
    this.carry = new Carry(g);
    this.carry.onDrop = () => this.ask({ a: 'drop' });
    this.carry.onSwing = () => {};
    this.mat = ghostMaterial({ color: 0x4a9cff, rim: 0xd8f2ff, base: 0.32, rimK: 1.6, far: 70, wave: 0.01, on: 1 });
    this.buildCosturera();
    this.buildTelas(M);
    this.buildMastil(M);
    this.buildFlag();
    this.extraT = 0;
    this.fallC = 0;
    this.fallB = 0;
  }

  // ---------------- la costurera ----------------
  buildCosturera() {
    const g = this.g;
    const [x, z] = EE.costurera;
    const y = g.world.floorAt(x, z, 4);
    const c = costureraModel(this.mat);
    c.position.set(x, y, z);
    // mirando al medio del Pasaje
    c.rotation.y = Math.PI;
    c.visible = false;
    this.root.add(c);
    this.cos = c;
    this.cosY = y;
    // la tela que va cosiendo en la falda (se arma con el avance)
    const lap = new THREE.Group();
    lap.position.set(0, 0.74, 0.32);
    lap.rotation.x = -Math.PI / 2 + 0.2;
    c.add(lap);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.16), new THREE.MeshStandardMaterial({ color: CELESTE, roughness: 0.9, side: THREE.DoubleSide }));
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.16), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9, side: THREE.DoubleSide }));
    const bot = top.clone();
    top.position.y = 0.16;
    bot.position.y = -0.16;
    lap.add(top, mid, bot);
    lap.visible = false;
    this.lap = { grp: lap, parts: [top, mid, bot] };
    g.world.addBox([x - 0.5, y, z - 0.5, x + 0.5, y + 1.4, z + 0.5], { kind: 'prop', solid: false });
    g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(x, y + 1.1, z - 0.9),
      radius: 2.3,
      wide: true,
      prompt: () => {
        const st = this.st;
        if (!st.on || st.done) return null;
        if (st.sew === 0) {
          if (st.cel === 2 && st.bla === 2) return { text: 'darle las telas', noCost: true, hold: true };
          const miss = [st.cel < 2 ? 'la celeste del Mirador' : null, st.bla < 2 ? 'la blanca de la niebla del muelle' : null].filter(Boolean);
          return { text: `Faltan ${miss.join(' y ')}`, noCost: true, info: true };
        }
        if (st.sew === 1) return { text: `Cosiendo ${Math.floor(st.sp * 100)}%`, noCost: true, info: true };
        if (st.sew === 2 && st.flag === 'cos') return { text: 'llevar la Bandera', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        const st = this.st;
        const who = g.net?.useFrom ?? myId(g);
        if (st.sew === 0 && st.cel === 2 && st.bla === 2) {
          if (isHost(g)) this.send({ a: 'sew' });
          return true;
        }
        if (st.sew === 2 && st.flag === 'cos') {
          if (isHost(g)) this.send({ a: 'take', id: who });
          return true;
        }
        return false;
      },
    });
  }

  // ---------------- las telas ----------------
  buildTelas(M) {
    const g = this.g;
    // la celeste, atada al parante y flameando hacia afuera
    const cel = cloth(1.5, 0.85, clothMat(CELESTE));
    cel.position.copy(CEL_AT);
    cel.rotation.y = -Math.PI / 2 + 0.25;
    this.root.add(cel);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 10), M.iron);
    knot.position.copy(CEL_AT);
    knot.rotation.y = Math.PI / 2;
    this.root.add(knot);
    this.cel = { obj: cel, knot };
    g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(78.4, 45.3, 31.0),
      radius: 2.2,
      wide: true,
      prompt: () => {
        const st = this.st;
        if (!st.on) return null;
        // (con el sable, qué hacer: sin cartel nadie sabía que había que pegarle)
        if (st.cel === 0) return g.weapons.has('sable') ? (globalThis.__mduNoTelaHint ? null : { text: 'Cortala con el Sable Corvo (clic)', noCost: true, info: true }) : { text: 'Se corta con el Sable Corvo', noCost: true, info: true };
        if (st.cel === 1 && this.fallC >= 1) return { text: 'agarrar la tela celeste', noCost: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        if (this.st.cel !== 1 || this.fallC < 1) return false;
        if (isHost(g)) this.send({ a: 'got', w: 'cel', id: g.net?.useFrom ?? myId(g) });
        return true;
      },
    });
    // la blanca: un lienzo que flota en la niebla, apenas arriba del agua
    const bla = cloth(1.4, 1.0, clothMat(0xf4f2ec, { emissive: 0x404858, emissiveIntensity: 0.6 }));
    bla.position.copy(BLA_C);
    this.root.add(bla);
    this.bla = { obj: bla, land: new THREE.Vector3(), from: new THREE.Vector3() };
    // el cartel de la punta del muelle: la blanca anda sobre el agua, lejos
    // del sable de la mano: se le tira
    g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(BLA_C.x - 1, -3.3, 31.4),
      radius: 4.2,
      wide: true,
      prompt: () => (!globalThis.__mduNoTelaHint && this.st.on && this.st.bla === 0 ? { text: g.weapons.has('sable') ? 'Tirale el Sable Corvo a la tela (clic derecho)' : 'La tela blanca se baja tirándole el Sable Corvo', noCost: true, info: true } : null),
      cost: () => 0,
      use: () => false,
    });
    this.blaIt = g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(),
      radius: 1.9,
      wide: true,
      prompt: () => (this.st.bla === 1 && this.fallB >= 1 ? { text: 'agarrar la tela blanca', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.st.bla !== 1 || this.fallB < 1) return false;
        if (isHost(g)) this.send({ a: 'got', w: 'bla', id: g.net?.useFrom ?? myId(g) });
        return true;
      },
    });
  }

  // Un tajo del sable (en esta compu): ¿cortó la celeste?
  onSableCut(eye, fwd, range) {
    const st = this.st;
    if (!st.on || st.cel !== 0) return;
    const d = tmpV.subVectors(CEL_AT, eye);
    const len = d.length();
    if (len > range + 0.9 || d.normalize().dot(fwd) < 0.45) return;
    this.ask({ a: 'cut', w: 'cel' });
  }

  // El sable tirado (en esta compu): ¿pasó por la blanca (o la celeste)?
  onSableFly(a, b, r) {
    const st = this.st;
    if (!st.on) return;
    const near = (c, rr) => {
      const ab = tmpV.subVectors(b, a);
      const L2 = ab.lengthSq();
      const k = L2 > 1e-6 ? Math.max(0, Math.min(1, tmpW.subVectors(c, a).dot(ab) / L2)) : 0;
      return tmpW.copy(a).addScaledVector(ab, k).distanceTo(c) < rr;
    };
    if (st.bla === 0 && near(this.bla.obj.position, r + 0.9)) this.ask({ a: 'cut', w: 'bla', x: +this.bla.obj.position.x.toFixed(2), z: +this.bla.obj.position.z.toFixed(2) });
    if (st.cel === 0 && near(CEL_AT, r + 0.7)) this.ask({ a: 'cut', w: 'cel' });
  }

  // ---------------- el mástil de la barranca ----------------
  buildMastil(M) {
    const g = this.g;
    const [x, z] = EE.mastil;
    const y = g.world.floorAt(x, z, -2);
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    // la base de piedra con la placa y el mástil blanco con el remate
    const trav = M.travertino;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.45, 8), trav);
    base.position.y = 0.22;
    grp.add(base);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.6, 8), trav);
    ped.position.y = 0.75;
    grp.add(ped);
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4, metalness: 0.2 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, MAST_H, 10), white);
    pole.position.y = 1.05 + MAST_H / 2;
    grp.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.bronze);
    ball.position.y = 1.05 + MAST_H + 0.1;
    grp.add(ball);
    // la driza (la soga) y la roldana de arriba
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, MAST_H, 4), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 1 }));
    rope.position.set(0.11, 1.05 + MAST_H / 2, 0);
    grp.add(rope);
    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.06), M.bronze);
    cleat.position.set(0.12, 1.6, 0);
    grp.add(cleat);
    // la placa
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.drawImage(carvedText('AQUÍ SE IZÓ LA BANDERA', { w: 1024, h: 128, size: 64, spacing: 0.16 }), 0, 0);
    ctx.drawImage(carvedText('27 DE FEBRERO DE 1812', { w: 1024, h: 128, size: 56, spacing: 0.16 }), 0, 128);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.8 }));
    plaque.position.set(0, 0.23, 0.69);
    plaque.rotation.x = -0.12;
    grp.add(plaque);
    grp.traverse((o) => o.isMesh && (o.castShadow = true));
    // la plaqueta mira al río... mejor al sendero (de donde viene la gente)
    grp.rotation.y = -Math.PI / 2;
    this.root.add(grp);
    this.mast = { grp, y };
    g.world.addBox([x - 0.65, y, z - 0.65, x + 0.65, y + 1.0, z + 0.65], { kind: 'prop' });
    g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(x, y + 1.2, z),
      radius: 2.4,
      wide: true,
      prompt: () => {
        const st = this.st;
        if (st.done || st.flag === 'mast') return st.raising && !st.done ? { text: `Izando ${Math.floor(st.hoist * 100)}%`, noCost: true, info: true } : null;
        if (st.flag === 'held' && st.carrier === myId(this.g)) return { text: 'atar la Bandera al mástil', noCost: true, hold: true };
        return null;
      },
      cost: () => 0,
      use: () => {
        const st = this.st;
        const who = g.net?.useFrom ?? myId(g);
        if (st.flag !== 'held' || st.carrier !== who) return false;
        if (isHost(g)) this.send({ a: 'tie' });
        return true;
      },
    });
  }

  // La Bandera: en las manos de la costurera, en el piso o en el mástil.
  buildFlag() {
    const g = this.g;
    const mat = new THREE.MeshStandardMaterial({ map: banderaTex(), roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = clothMat(0).onBeforeCompile;
    mat.customProgramCacheKey = () => 'monCloth';
    const f = cloth(1.5, 0.95, mat);
    f.visible = false;
    this.root.add(f);
    this.flag = f;
    // la doblada (en el piso)
    const folded = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: CELESTE, roughness: 0.9 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.505, 0.082, 0.12), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.9 }));
    folded.add(band);
    folded.visible = false;
    this.root.add(folded);
    this.folded = folded;
    this.floorIt = g.interact.add({
      kind: 'bandera',
      pos: new THREE.Vector3(),
      radius: 1.8,
      wide: true,
      prompt: () => (this.st.flag === 'floor' && !this.carry.kind ? { text: 'levantar la Bandera', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (this.st.flag !== 'floor') return false;
        if (isHost(g)) this.send({ a: 'take', id: g.net?.useFrom ?? myId(g) });
        return true;
      },
    });
  }

  // ---------------- la red ----------------
  // Un pedido de cualquiera (el anfitrión lo decide).
  ask(m) {
    const g = this.g;
    if (isHost(g)) this.onGuest(m, myId(g));
    else g.net.net.send({ t: 'pee', k: 'bnd', ...m });
  }

  onGuest(m, from) {
    const st = this.st;
    if (m.a === 'cut') {
      if (m.w === 'cel' && st.cel === 0) this.send({ a: 'cutC' });
      if (m.w === 'bla' && st.bla === 0) {
        // cae al muelle, en el tablón más cercano a donde estaba
        const x = Math.max(113.8, Math.min(124.4, m.x ?? BLA_C.x));
        const z = Math.max(28.4, Math.min(32.6, m.z ?? BLA_C.z));
        this.send({ a: 'cutB', x: +x.toFixed(2), z: +z.toFixed(2), fx: m.x ?? BLA_C.x, fz: m.z ?? BLA_C.z });
      }
    } else if (m.a === 'drop' && st.flag === 'held' && st.carrier === from) this.dropFlag(from);
  }

  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'bnd', ...m });
  }

  dropFlag(from) {
    const g = this.g;
    const p = from === myId(g) ? g.player.pos : g.net?.remote.get(from)?.pos;
    const P = p || g.player.pos;
    const y = g.world.floorAt(P.x, P.z, (P.y || 0) + 0.5);
    this.send({ a: 'drop', p: [+P.x.toFixed(2), +y.toFixed(2), +P.z.toFixed(2)] });
  }

  apply(m) {
    const g = this.g;
    const st = this.st;
    const t0 = g.time || 0;
    const say = (t, s = 3.5) => g.hud.subtitle?.(t, s);
    switch (m.a) {
      case 'on':
        if (st.on) return;
        st.on = 1;
        this.cos.visible = true;
        g.fx.flash(tmpV.set(EE.costurera[0], this.cosY + 1.5, EE.costurera[1]), 0x8ac8ff, 30, 0.6, 12);
        g.fx.sparkle(tmpV, [0.6, 0.85, 1], 30, 1);
        break;
      case 'cutC':
        if (st.cel) return;
        st.cel = 1;
        this.fallC = 0.001;
        this.cel.knot.visible = false;
        g.fx.sparks(CEL_AT, 2, { x: 0, y: 1, z: 0 });
        break;
      case 'cutB':
        if (st.bla) return;
        st.bla = 1;
        this.fallB = 0.001;
        this.bla.from.copy(this.bla.obj.position);
        this.bla.land.set(m.x, -4.36, m.z);
        this.blaIt.pos.set(m.x, -4.4 + 1.1, m.z);
        g.fx.sparkle(this.bla.from, [0.9, 0.95, 1], 14, 0.8);
        break;
      case 'got':
        if (m.w === 'cel') {
          st.cel = 2;
          this.cel.obj.visible = false;
        } else {
          st.bla = 2;
          this.bla.obj.visible = false;
        }
        g.audio.powerupGrab?.();
        g.hud.toast?.(m.w === 'cel' ? 'La tela celeste' : 'La tela blanca');
        break;
      case 'sew':
        if (st.sew) return;
        st.sew = 1;
        st.sp = 0;
        this.lap.grp.visible = true;
        if (isHost(g)) {
          // (se viene la manada: si era el descanso, arranca la ronda)
          if (g.rounds.state !== 'active') g.rounds.breakT = Math.min(g.rounds.breakT ?? 0, 0.5);
          g.rounds.requeue?.(8);
        }
        break;
      case 'sp':
        st.sp = m.v;
        break;
      case 'sewn':
        st.sew = 2;
        st.sp = 1;
        st.flag = 'cos';
        g.fx.flash(tmpV.set(EE.costurera[0], this.cosY + 1.5, EE.costurera[1]), 0xcfe6ff, 40, 0.8, 14);
        g.hud.achievement?.('La Primera Bandera', 'Cosida en el Pasaje');
        break;
      case 'take':
        // (la escuadra realista sube sí o sí mientras se la lleva al mástil)
        if (st.flag === 'cos' && isHost(g)) this.ee.armada?.forFlag?.();
        // (y la manada: la primera vez que sale de la costurera)
        if (isHost(g) && this.horda()) this.rush(st.flag === 'cos' ? 8 : 0);
        st.flag = 'held';
        st.carrier = m.id;
        this.carry.set('bandera', m.id);
        if (m.id === myId(g)) say('Con la Bandera no se puede tirar. G la deja.', 3.5);
        break;
      case 'drop':
        st.flag = 'floor';
        st.carrier = -1;
        st.fpos = m.p;
        this.carry.set(null, null);
        break;
      case 'tie':
        st.flag = 'mast';
        st.carrier = -1;
        st.raising = 1;
        st.hoist = 0;
        this.carry.set(null, null);
        if (isHost(g)) {
          if (this.horda()) this.rush(14);
          else {
            if (g.rounds.state !== 'active') g.rounds.breakT = Math.min(g.rounds.breakT ?? 0, 0.5);
            g.rounds.requeue?.(10);
          }
        }
        break;
      case 'hoist':
        st.hoist = m.v;
        break;
      case 'tug':
        // un muerto tiró de la driza: la Bandera baja un poco
        st.hoist = m.v;
        this.tugT = 0.45;
        this.sfxTug();
        if (t0 > (this.tugSay || 0)) {
          this.tugSay = t0 + 7;
          say('¡Tiran de la driza!', 2.2);
        }
        break;
      case 'up':
        st.hoist = 1;
        st.raising = 0;
        st.done = 1;
        this.ee.onBanderaIzada?.();
        break;
      default:
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const st = this.st;
    const t = g.time || 0;
    CLOTH_T.value = t;
    GHOST_TIME.value = t;
    const host = isHost(g);
    // la costurera cose (el brazo de la aguja va y viene) y mira la tela
    if (this.cos.visible) {
      const U = this.cos.userData;
      const k = st.sew === 1 ? 1 : 0.25;
      U.forR.rotation.x = -1.0 + Math.sin(t * 5.5) * 0.35 * k;
      U.armR.rotation.z = -0.25 + Math.sin(t * 5.5 + 0.6) * 0.12 * k;
      U.head.rotation.x = 0.45 + Math.sin(t * 0.7) * 0.05;
      const n = st.sew === 2 ? 3 : Math.floor(st.sp * 3.999);
      this.lap.parts.forEach((p, i) => (p.visible = st.sew > 0 && i < (st.sew === 2 ? 3 : n + 1)));
      this.lap.grp.visible = st.sew === 1 || (st.sew === 2 && st.flag === 'cos');
    }
    // la celeste: flamea; cortada, cae adentro del Mirador
    if (st.cel === 0) this.cel.obj.rotation.y = -Math.PI / 2 + 0.25 + Math.sin(t * 1.3) * 0.15;
    else if (st.cel === 1 && this.fallC < 1) {
      this.fallC = Math.min(1, this.fallC + dt / 1.3);
      const k = this.fallC;
      this.cel.obj.position.lerpVectors(CEL_AT, CEL_FLOOR, k).setY(CEL_AT.y + (CEL_FLOOR.y - CEL_AT.y) * k * k + Math.sin(k * Math.PI) * 0.4);
      this.cel.obj.rotation.set(-k * Math.PI / 2, -Math.PI / 2 + 0.25 + k * 1.2, 0);
    }
    if (st.cel === 1 && this.fallC >= 1 && Math.random() < dt * 2) g.fx.sparkle(tmpV.copy(CEL_FLOOR).setY(CEL_FLOOR.y + 0.2), [0.6, 0.85, 1], 1, 0.4);
    // la blanca: da vueltas en la niebla; cortada, el viento la lleva al muelle
    if (st.bla === 0) {
      const a = t * 0.42;
      this.bla.obj.position.set(BLA_C.x + Math.cos(a) * 2.6, BLA_C.y + Math.sin(t * 0.9) * 0.25, BLA_C.z + Math.sin(a) * 1.3);
      this.bla.obj.rotation.y = -a + Math.PI / 2;
      if (Math.random() < dt * 1.5) g.fx.sparkle(this.bla.obj.position, [0.85, 0.9, 1], 1, 0.6);
    } else if (st.bla === 1 && this.fallB < 1) {
      this.fallB = Math.min(1, this.fallB + dt / 1.6);
      const k = this.fallB;
      this.bla.obj.position.lerpVectors(this.bla.from, this.bla.land, k).setY(this.bla.from.y + (this.bla.land.y - this.bla.from.y) * k + Math.sin(k * Math.PI) * 0.8);
      this.bla.obj.rotation.set(-k * Math.PI / 2, this.bla.obj.rotation.y, 0);
    }
    if (st.bla === 1 && this.fallB >= 1 && Math.random() < dt * 2) g.fx.sparkle(tmpV.copy(this.bla.land).setY(this.bla.land.y + 0.2), [0.85, 0.9, 1], 1, 0.4);
    // la costura (el avance lo lleva el anfitrión; se frena si no hay nadie cerca)
    if (st.sew === 1 && host) {
      const [cx, cz] = EE.costurera;
      const near = players(g).some((p) => !p.downed && Math.hypot(p.pos.x - cx, p.pos.z - cz) < SEW_R && Math.abs((p.pos.y || 0) - this.cosY) < 3);
      if (near) st.sp = Math.min(1, st.sp + dt / SEW_T);
      this.extraT += dt;
      if (this.extraT > 10) {
        this.extraT = 0;
        g.rounds.requeue?.(3);
      }
      this.syncT = (this.syncT || 0) - dt;
      if (this.syncT <= 0) {
        this.syncT = 1;
        g.net?.event('pee', { k: 'bnd', a: 'sp', v: +st.sp.toFixed(3) });
      }
      if (st.sp >= 1) this.send({ a: 'sewn' });
    }
    // la Bandera: en la mano de la costurera, en el piso o subiendo por el mástil
    const F = this.flag;
    F.visible = st.flag === 'cos' || st.flag === 'mast';
    this.folded.visible = st.flag === 'floor';
    if (st.flag === 'cos') {
      F.position.set(EE.costurera[0] + 0.75, this.cosY + 1.45, EE.costurera[1] - 0.35);
      F.rotation.set(0, Math.PI, 0);
      F.scale.setScalar(0.8);
    } else if (st.flag === 'floor') {
      this.folded.position.set(st.fpos[0], st.fpos[1] + 0.04, st.fpos[2]);
      this.floorIt.pos.set(st.fpos[0], st.fpos[1] + 1.1, st.fpos[2]);
      if (Math.random() < dt * 2) g.fx.sparkle(this.folded.position, [0.6, 0.85, 1], 1, 0.4);
    } else if (st.flag === 'mast') {
      const [x, z] = EE.mastil;
      // (en el mástil, grande: se ve desde la costanera y desde el Patio)
      F.scale.setScalar(1.7);
      // (el tirón: un sacudón para abajo)
      this.tugT = Math.max(0, (this.tugT || 0) - dt);
      const tug = this.tugT > 0 ? Math.sin((this.tugT / 0.45) * Math.PI) : 0;
      F.position.set(x + 0.08, this.mast.y + 2.6 + st.hoist * (MAST_H - 1.5) - tug * 0.16, z);
      F.rotation.set(0, Math.PI / 2 + Math.sin(t * 0.6) * 0.3 + tug * Math.sin(t * 40) * 0.12, 0);
    }
    // la manada del paso de la Bandera: salen más seguido y más a la vez
    if (host && this.owed && g.rounds.state === 'active') {
      g.rounds.requeue?.(this.owed);
      this.owed = 0;
    }
    if (host && this.pressing) {
      const R = g.rounds;
      R.capBonus = Math.max(R.capBonus || 0, 6);
      if (R.delay > 0 && R.spawnT > R.delay * 0.5) R.spawnT = R.delay * 0.5;
      if (!st.raising) {
        this.extraT += dt;
        if (this.extraT > 6) {
          this.extraT = 0;
          this.queue(3);
        }
      }
    }
    // el que lleva la Bandera, si cae, la suelta
    if (host && st.flag === 'held') {
      const p = playerById(g, st.carrier);
      if (!p || p.downed || isDown(g, st.carrier)) this.dropFlag(st.carrier);
    }
    // izando: sube si hay alguien cerca
    if (host && st.raising && !st.done) {
      const [x, z] = EE.mastil;
      const near = players(g).some((p) => !p.downed && Math.hypot(p.pos.x - x, p.pos.z - z) < HOIST_R);
      if (near) st.hoist = Math.min(1, st.hoist + dt / HOIST_T);
      this.extraT += dt;
      if (this.extraT > (this.horda() ? 5 : 8)) {
        this.extraT = 0;
        if (this.horda()) this.queue(4);
        else g.rounds.requeue?.(3);
      }
      this.syncT = (this.syncT || 0) - dt;
      if (this.syncT <= 0) {
        this.syncT = 1;
        g.net?.event('pee', { k: 'bnd', a: 'hoist', v: +st.hoist.toFixed(3) });
      }
      if (st.hoist >= 1) this.send({ a: 'up' });
    }
    this.carry.update(dt, t);
    this.syncHud();
  }

  // ---------------- la manada del paso de la Bandera ----------------
  horda() {
    return globalThis.__mduNoBanderaHorda !== true;
  }

  // ¿Está la Bandera en camino al mástil o subiendo? (los que salen, corren:
  // MonumentoEgg.defense; y salen más: update)
  get pressing() {
    const st = this.st;
    return this.horda() && !st.done && (st.flag === 'held' || st.flag === 'floor' || st.flag === 'mast');
  }

  // ¿Sube? (los muertos van al mástil: Armada.active, por g.defense)
  get tugging() {
    return this.horda() && !!this.st.raising && !this.st.done;
  }

  // Se viene la manada (anfitrión): arranca la ronda si era el descanso, suma
  // n a la cola y los que ya andaban caminando se largan a correr.
  rush(n) {
    const g = this.g;
    const R = g.rounds;
    if (R.state !== 'active') R.breakT = Math.min(R.breakT ?? 0, 0.5);
    this.queue(n);
    for (const z of g.zombies.pool) {
      if (!z.active || z.dead || z.dog || z.boss || z.speedType !== 'walk') continue;
      z.speedType = 'run';
      z.speed = SPEEDS.run * (0.92 + Math.random() * 0.16);
      z.runU = null;
    }
  }

  // n muertos más a la cola. En el descanso se guardan para cuando arranque
  // la ronda (nextRound pone la cola de cero y se perdían).
  queue(n) {
    if (!n) return;
    const R = this.g.rounds;
    if (R.state === 'active') R.requeue?.(n);
    else this.owed = (this.owed || 0) + n;
  }

  // Adónde va un muerto mientras la Bandera sube (Zombies.chase, por
  // Armada.goal): tres de cada cinco, al pie del mástil a tirar de la driza,
  // salvo que tengan a un jugador encima. null: a los jugadores, como siempre.
  goal(z, target, distP) {
    if (z.dog || z.boss || z.id % 5 >= 3) return null;
    if (z.bnId !== z.id) {
      z.bnId = z.id;
      z.bnAggro = false;
    }
    const close = !!target && distP < (z.bnAggro ? AGGRO_OUT : AGGRO_IN) && Math.abs((target.pos.y || 0) - (z.baseY || 0)) < 1.6;
    z.bnAggro = close;
    if (close) return null;
    const [mx, mz] = EE.mastil;
    const ap = this.approaches();
    const [ax, az] = ap[z.id % ap.length];
    const G = (this.goalObj ||= {});
    G.x = ax;
    G.z = az;
    // (se paran en su lugar alrededor de la base; el golpe sale a tiro de la driza)
    G.d = Math.min(Math.hypot(ax - z.pos.x, az - z.pos.z) + 0.6, Math.hypot(mx - z.pos.x, mz - z.pos.z) - 0.55);
    G.face = Math.atan2(mx - ax, mz - az);
    this.mastNav ||= new Navigation(this.g.world);
    this.mastNav.update(mx, mz);
    G.nav = this.mastNav;
    return G;
  }

  // Los lugares alrededor de la base del mástil donde se puede parar alguien.
  approaches() {
    if (this.aps) return this.aps;
    const [mx, mz] = EE.mastil;
    const nav = this.g.nav;
    this.aps = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      const x = mx + Math.cos(a) * MAST_R;
      const z = mz + Math.sin(a) * MAST_R;
      if (!nav.blocked(Math.floor(x), Math.floor(z))) this.aps.push([x, z]);
    }
    if (!this.aps.length) this.aps.push([mx - MAST_R, mz]);
    return this.aps;
  }

  // Un manotazo a la driza (anfitrión): la Bandera baja.
  zombieHit() {
    const st = this.st;
    if (!this.tugging) return;
    const n = Math.max(1, players(this.g).length);
    this.send({ a: 'tug', v: +Math.max(0, st.hoist - TUG / (1 + (n - 1) * 0.35)).toFixed(3) });
  }

  // la driza que corre de golpe por la roldana y el paño que chicotea
  sfxTug() {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const [x, z] = EE.mastil;
    const o = A.out({ pos: tmpV.set(x, this.mast.y + 2.5, z), gain: 0.9, reverb: 0.35, ref: 7 });
    A.noise(o, { t: A.now, dur: 0.22, type: 'bandpass', freq: 1300, freqEnd: 600, q: 2.5, gain: 0.3, attack: 0.005 });
    A.noise(o, { t: A.now + 0.05, dur: 0.3, type: 'lowpass', freq: 500, freqEnd: 160, gain: 0.35, attack: 0.01 });
    A.tone(o, { t: A.now, dur: 0.16, type: 'triangle', freq: 150, freqEnd: 80, gain: 0.25 });
  }

  syncHud() {
    const g = this.g;
    const st = this.st;
    let txt = null;
    if (st.sew === 1) txt = `<span>Costura</span><b>${Math.floor(st.sp * 100)}%</b>`;
    else if (st.raising && !st.done) txt = `<span>Izando</span><b>${Math.floor(st.hoist * 100)}%</b>`;
    if (txt !== this.hudTxt) {
      this.hudTxt = txt;
      g.hud.setCraftText?.(txt);
    }
  }

  state() {
    return { ...this.st };
  }

  applyFull(s) {
    if (!s) return;
    Object.assign(this.st, s);
    const st = this.st;
    this.cos.visible = !!st.on;
    if (st.cel >= 1) {
      this.fallC = 1;
      this.cel.knot.visible = false;
      this.cel.obj.position.copy(CEL_FLOOR);
      this.cel.obj.rotation.set(-Math.PI / 2, 0, 0);
    }
    if (st.cel === 2) this.cel.obj.visible = false;
    if (st.bla >= 1) {
      this.fallB = 1;
      this.bla.obj.visible = st.bla === 1;
    }
    this.carry.set(st.flag === 'held' ? 'bandera' : null, st.flag === 'held' ? st.carrier : null);
  }

  dispose() {
    this.carry.dispose();
    this.root.removeFromParent();
    this.g.hud?.setCraftText?.(null);
  }
}
