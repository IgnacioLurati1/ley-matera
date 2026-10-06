// La pulpería del menú (el laboratorio de Black Ops 3, pero criollo): el
// mostrador con la reja, del otro lado tres hornitos de barro (los tachos
// del Dr. Monty), los estantes con botellas y yerba, el farol colgado, la
// vela, la canasta con las cinco empanadas que se llevan a la partida y la
// pila de pesos. Todo con geometría simple y las texturas de core/textures.
//
// Se dibuja sola, sin el mundo de atrás (Game.loop: menus.stage).
// La hornada: los pesos pasan por la ventanita, se prenden los hornos que se
// pagaron, la pala saca lo que salió y lo tira por la ventanita a la tabla.

import * as THREE from 'three';
import { toTexture } from '../core/textures';
import Surfaces from '../fx/Surfaces';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// los hornos (x) y la tabla donde caen las cosas (del lado del cliente)
const OVEN_X = [-1.25, 0, 1.25];
const OVEN_Z = -1.4;
// el alto de la base de ladrillo (la boca queda arriba del mostrador)
const BASE = 1.0;
const COUNTER_Y = 1.04;
const TRAY = [V(-0.27, COUNTER_Y + 0.035, 0.26), V(0, COUNTER_Y + 0.035, 0.3), V(0.27, COUNTER_Y + 0.035, 0.26)];
const BASKET = V(-1.2, COUNTER_Y, 0.24);
const COINS = V(0.95, COUNTER_Y, 0.3);
const CUP = V(0.55, 1.12, -0.45);

// Las tomas de la cámara (desde el lado del cliente).
const SHOTS = {
  hornos: { pos: V(0.15, 1.62, 3.4), look: V(0, 1.4, -1.3), fov: 44 },
  canasta: { pos: V(-1.12, 1.86, 1.5), look: V(-1.2, 1.0, 0.18), fov: 40 },
  despensa: { pos: V(0.9, 1.72, 1.9), look: V(0.5, 1.52, -2.4), fov: 44 },
  bake: { pos: V(0, 1.55, 2.5), look: V(0, 1.3, -1.3), fov: 44 },
  tabla: { pos: V(0, 1.74, 1.55), look: V(0, 1.05, 0.1), fov: 40 },
};

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

// El cartel pintado sobre la reja.
function signTexture() {
  return toTexture(
    canvas(1024, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5a3a22');
      g.addColorStop(1, '#3a2414');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      // vetas
      for (let i = 0; i < 70; i++) {
        x.strokeStyle = `rgba(20,10,4,${0.1 + Math.random() * 0.2})`;
        x.lineWidth = 1 + Math.random() * 2;
        x.beginPath();
        const y = Math.random() * h;
        x.moveTo(0, y);
        x.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 20, w * 0.6, y + (Math.random() - 0.5) * 20, w, y + (Math.random() - 0.5) * 10);
        x.stroke();
      }
      x.textAlign = 'center';
      x.fillStyle = '#e8d8b0';
      x.font = 'bold 118px Georgia, serif';
      x.shadowColor = 'rgba(0,0,0,.6)';
      x.shadowBlur = 6;
      x.fillText('PULPERÍA', w / 2, 128);
      x.font = 'italic 64px Georgia, serif';
      x.fillStyle = '#d24a2a';
      x.fillText('— El Finado —', w / 2, 212);
      // pintura saltada
      x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 260; i++) {
        x.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
        x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 1 + Math.random() * 4);
      }
    }),
    { repeat: false },
  );
}

function smallSign(text1, text2) {
  return toTexture(
    canvas(512, 256, (x, w, h) => {
      x.fillStyle = '#d9c9a0';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#5a3a1a';
      x.lineWidth = 10;
      x.strokeRect(8, 8, w - 16, h - 16);
      x.fillStyle = '#2a1a0a';
      x.textAlign = 'center';
      x.font = 'bold 62px Georgia, serif';
      x.fillText(text1, w / 2, 108);
      x.font = 'bold 54px Georgia, serif';
      x.fillStyle = '#8a1a10';
      x.fillText(text2, w / 2, 190);
    }),
    { repeat: false },
  );
}

// El repasador a cuadros de la canasta.
function clothTexture() {
  return toTexture(
    canvas(128, 128, (x, w) => {
      x.fillStyle = '#f0e6d2';
      x.fillRect(0, 0, w, w);
      x.fillStyle = 'rgba(180,30,24,.55)';
      for (let i = 0; i < 8; i += 2) {
        x.fillRect(i * 16, 0, 16, w);
        x.fillRect(0, i * 16, w, 16);
      }
    }),
  );
}

// La llama (para el fuego de los hornos, la vela y el farol).
function flameTexture() {
  return toTexture(
    canvas(64, 128, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.62, h * 0.55);
      g.addColorStop(0, 'rgba(255,255,220,1)');
      g.addColorStop(0.25, 'rgba(255,200,80,.95)');
      g.addColorStop(0.6, 'rgba(255,90,20,.5)');
      g.addColorStop(1, 'rgba(120,20,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(w / 2, 0);
      x.bezierCurveTo(w * 0.95, h * 0.45, w, h * 0.9, w / 2, h);
      x.bezierCurveTo(0, h * 0.9, w * 0.05, h * 0.45, w / 2, 0);
      x.fill();
    }),
    { repeat: false },
  );
}

// Adentro del horno: brasas abajo, el fondo oscuro con humo.
function fireTexture() {
  return toTexture(
    canvas(128, 128, (x, w, h) => {
      x.fillStyle = '#0a0302';
      x.fillRect(0, 0, w, h);
      const g = x.createRadialGradient(w / 2, h, 4, w / 2, h * 0.9, h * 0.85);
      g.addColorStop(0, '#fff2b0');
      g.addColorStop(0.2, '#ffb040');
      g.addColorStop(0.5, '#c83a0a');
      g.addColorStop(1, 'rgba(40,6,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `rgba(255,${120 + Math.random() * 120},40,${0.3 + Math.random() * 0.6})`;
        const r = 2 + Math.random() * 6;
        x.beginPath();
        x.arc(Math.random() * w, h - Math.random() * 26, r, 0, Math.PI * 2);
        x.fill();
      }
    }),
    { repeat: false },
  );
}

function softDot() {
  return toTexture(
    canvas(64, 64, (x, w) => {
      const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, w);
    }),
    { repeat: false },
  );
}

// Arco de la boca del horno (base recta, medio punto arriba).
function arch(r, hs) {
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, hs);
  s.absarc(0, hs, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

// cuántas veces se repite la textura de cada material (se escala el UV de
// cada malla: la textura es la misma del juego, con repeat 1)
const REP = { wall: [3, 1.2], floor: [5, 4], ceil: [3, 2], beam: [1, 4], counter: [2.5, 1], top: [3, 0.5], shelf: [3, 0.3], brick: [1, 0.8], clay: [1.2, 1], chapa: [0.5, 0.5], wood: [0.4, 2], wicker: [3, 1.5] };

export default class PulperiaScene {
  // T: las texturas del juego; build(id): el modelo de una empanada
  // ({ group, dispose }) de weapons/empanadaModels.
  constructor(T, build) {
    this.T = T;
    this.buildEmp = build;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07040a);
    this.scene.fog = new THREE.Fog(0x07040a, 5, 11);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 30);
    this.time = 0;
    this.shot = 'hornos';
    this.cam = { pos: SHOTS.hornos.pos.clone(), look: SHOTS.hornos.look.clone(), fov: SHOTS.hornos.fov };
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.anims = [];
    this.tray = [];
    this.basket = [];
    this.panel = 0.2;
    this.size = new THREE.Vector2();
    this.flames = [];
    this.build();
    this.onMove = (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', this.onMove);
  }

  build() {
    const S = this.scene;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.flameTex = flameTexture();
    this.dotTex = softDot();
    const M = (this.M = {
      wall: std({ map: this.T.plasterWhite, color: 0xb8ac98, roughness: 0.95 }),
      floor: std({ map: this.T.terracotta, color: 0x9a7a66, roughness: 0.9 }),
      ceil: std({ map: this.T.planksDark, color: 0x6a5040, roughness: 1 }),
      beam: std({ map: this.T.planksDark, color: 0x5a4030, roughness: 1 }),
      counter: std({ map: this.T.planksDark, color: 0x8a6a50, roughness: 0.8 }),
      top: std({ map: this.T.planks, color: 0xa88a68, roughness: 0.55 }),
      shelf: std({ map: this.T.planks, color: 0x8a6a4a, roughness: 0.8 }),
      iron: std({ color: 0x1c1a18, metalness: 0.85, roughness: 0.45 }),
      brick: std({ map: this.T.brickSoot, color: 0xb08070, roughness: 0.95 }),
      clay: std({ map: this.T.plasterWhite, color: 0xb8926c, roughness: 0.95 }),
      soot: std({ color: 0x120806, roughness: 1 }),
      chapa: std({ map: this.T.metal, color: 0x5a5048, metalness: 0.7, roughness: 0.55 }),
      wood: std({ map: this.T.planks, color: 0x9a7a52, roughness: 0.7 }),
      coin: std({ color: 0xe8ecf0, metalness: 0.55, roughness: 0.3, emissive: 0x3a3e44 }),
      tin: std({ color: 0x8a8a84, metalness: 0.9, roughness: 0.4 }),
      wicker: std({ map: this.T.burlap, color: 0xc8a060, roughness: 0.9 }),
      cloth: std({ map: clothTexture(), roughness: 0.95, side: THREE.DoubleSide }),
      sign: std({ map: signTexture(), roughness: 0.8 }),
      paper: std({ map: smallSign('HOY NO SE FÍA', 'MAÑANA SÍ'), roughness: 0.9 }),
      moon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a88c8).multiplyScalar(1.4) }),
      glassG: std({ color: 0x2a5a2a, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.82 }),
      glassA: std({ color: 0x7a3a0a, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.85 }),
      glassC: std({ color: 0xc8d8d0, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.5 }),
      label: std({ color: 0xe8dcc0, roughness: 0.9 }),
      bone: std({ color: 0xe0d6bc, roughness: 0.7 }),
      chorizo: std({ color: 0x6a2418, roughness: 0.5 }),
      candle: std({ color: 0xf0e6c8, roughness: 0.6 }),
      gourd: std({ map: this.T.gourd, roughness: 0.6 }),
      silver: std({ color: 0xd8d8d0, metalness: 1, roughness: 0.25 }),
    });

    // ---------- el cuarto ----------
    const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const floor = plane(8, 7, M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 0.4;
    floor.receiveShadow = true;
    S.add(floor);
    const back = plane(7, 3.3, M.wall);
    back.position.set(0, 1.65, -2.75);
    back.receiveShadow = true;
    S.add(back);
    for (const s of [-1, 1]) {
      const side = plane(7, 3.3, M.wall);
      side.rotation.y = (-s * Math.PI) / 2;
      side.position.set(s * 3.3, 1.65, 0.4);
      side.receiveShadow = true;
      S.add(side);
    }
    const ceil = plane(7, 7, M.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3.1, 0.4);
    S.add(ceil);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.16, 0.16), M.beam);
      b.position.set(0, 3.0, -2.2 + i * 1.5);
      S.add(b);
    }
    // la ventana de la izquierda (luz de luna) con su reja
    const win = plane(0.8, 1.0, M.moon);
    win.rotation.y = Math.PI / 2;
    win.position.set(-3.28, 1.9, -1.2);
    S.add(win);
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), M.iron);
      bar.position.set(-3.26, 1.9, -1.5 + i * 0.2);
      S.add(bar);
    }

    // ---------- el mostrador y la reja ----------
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.8, COUNTER_Y - 0.05, 0.7), M.counter);
    counter.position.set(0, (COUNTER_Y - 0.05) / 2, 0);
    counter.castShadow = counter.receiveShadow = true;
    S.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.86), M.top);
    top.position.set(0, COUNTER_Y - 0.03, 0.05);
    top.castShadow = top.receiveShadow = true;
    S.add(top);
    // tablas del frente
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, COUNTER_Y - 0.12, 0.02), M.beam);
      b.position.set(-2.2 + i * 0.4, (COUNTER_Y - 0.12) / 2 + 0.02, 0.36);
      S.add(b);
    }
    // la reja (con la ventanita del medio por donde se pasa la mercadería)
    const barGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 6);
    const bars = [];
    for (let x = -2.34; x <= 2.35; x += 0.156) {
      const inWin = Math.abs(x) < 0.34;
      const y0 = inWin ? 1.5 : COUNTER_Y;
      bars.push([x, y0, 2.36]);
    }
    const im = new THREE.InstancedMesh(barGeo, M.iron, bars.length);
    const m4 = new THREE.Matrix4();
    bars.forEach(([x, y0, y1], i) => {
      m4.compose(V(x, (y0 + y1) / 2, -0.24), new THREE.Quaternion(), V(1, y1 - y0, 1));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    S.add(im);
    for (const [y, w] of [
      [COUNTER_Y + 0.02, 4.8],
      [1.5, 4.8],
      [2.34, 4.8],
      [1.95, 4.8],
    ]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.025), M.iron);
      r.position.set(0, y, -0.24);
      r.castShadow = true;
      S.add(r);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.46, 0.025), M.iron);
      post.position.set(s * 0.345, COUNTER_Y + 0.23, -0.24);
      S.add(post);
    }
    // voluta arriba de la ventanita
    const vol = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24, Math.PI), M.iron);
    vol.position.set(0, 1.5, -0.24);
    S.add(vol);
    // el cartel
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.05), [M.beam, M.beam, M.beam, M.beam, M.sign, M.beam]);
    sign.position.set(0, 2.62, -0.22);
    sign.rotation.x = -0.06;
    S.add(sign);
    const paper = plane(0.3, 0.15, M.paper);
    paper.position.set(-0.95, 1.8, -0.21);
    paper.rotation.z = 0.05;
    S.add(paper);

    // ---------- del otro lado: estantes, botellas, yerba ----------
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, 0.34), M.shelf);
      sh.position.set(0, 1.25 + i * 0.52, -2.56);
      sh.castShadow = sh.receiveShadow = true;
      S.add(sh);
    }
    const bottle = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.036, 0],
        [0.038, 0.01],
        [0.038, 0.2],
        [0.03, 0.235],
        [0.012, 0.26],
        [0.011, 0.31],
        [0.014, 0.32],
        [0, 0.32],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    );
    const jar = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 14);
    const rnd = mulberry(7);
    for (let s = 0; s < 3; s++) {
      const y = 1.27 + s * 0.52;
      for (let x = -2.6; x < 2.6; ) {
        const r = rnd();
        if (r < 0.55) {
          const b = new THREE.Mesh(bottle, [M.glassG, M.glassA, M.glassC][Math.floor(rnd() * 3)]);
          b.position.set(x, y, -2.56 + (rnd() - 0.5) * 0.12);
          b.scale.setScalar(0.85 + rnd() * 0.35);
          b.castShadow = true;
          S.add(b);
          x += 0.09 + rnd() * 0.05;
        } else if (r < 0.8) {
          // paquetes de yerba
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.19, 0.07), rnd() < 0.5 ? M.label : M.wicker);
          p.position.set(x, y + 0.095, -2.54);
          p.rotation.y = (rnd() - 0.5) * 0.3;
          p.castShadow = true;
          S.add(p);
          x += 0.12;
        } else {
          const j = new THREE.Mesh(jar, M.glassC);
          j.position.set(x, y + 0.08, -2.55);
          S.add(j);
          x += 0.13;
        }
        if (rnd() < 0.12) x += 0.2;
      }
    }
    // la calavera del estante (el pulpero tiene sus historias)
    const skull = new THREE.Group();
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), M.bone);
    cr.scale.set(1, 0.95, 1.1);
    skull.add(cr);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.07), M.bone);
    jaw.position.set(0, -0.07, 0.03);
    skull.add(jaw);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M.soot);
      eye.position.set(s * 0.028, 0.0, 0.07);
      skull.add(eye);
    }
    skull.position.set(1.95, 1.83 + 0.1, -2.5);
    skull.rotation.y = -0.4;
    S.add(skull);
    // chorizos colgando de un tirante del lado del pulpero
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.22, 4, 8), M.chorizo);
      c.position.set(1.6 + i * 0.1, 2.55 - (i % 2) * 0.06, -1.9);
      c.rotation.z = (i % 3) * 0.08 - 0.08;
      c.castShadow = true;
      S.add(c);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), M.iron);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(1.9, 2.72, -1.9);
    S.add(rope);

    // ---------- los tres hornitos de barro ----------
    this.ovens = OVEN_X.map((x, i) => this.buildOven(x, i));
    // la lata donde caen los pesos
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 16, 1, true), M.tin);
    cup.position.copy(CUP).setY(CUP.y - 0.06);
    S.add(cup);
    const shelfCup = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), M.shelf);
    shelfCup.position.set(CUP.x, CUP.y - 0.14, CUP.z);
    S.add(shelfCup);
    const cupLeg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), M.beam);
    cupLeg.position.set(CUP.x, 0.5, CUP.z);
    S.add(cupLeg);

    // ---------- sobre el mostrador ----------
    // la tabla donde caen las empanadas
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.025, 0.34), M.wood);
    board.position.set(0, COUNTER_Y + 0.012, 0.27);
    board.castShadow = board.receiveShadow = true;
    S.add(board);
    // la canasta
    const bk = new THREE.LatheGeometry(
      [
        [0.13, 0],
        [0.2, 0.02],
        [0.25, 0.1],
        [0.26, 0.12],
        [0.245, 0.12],
        [0.235, 0.1],
        [0.18, 0.025],
        [0, 0.025],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    );
    const basket = new THREE.Mesh(bk, M.wicker);
    basket.scale.set(1.25, 1, 0.9);
    basket.position.copy(BASKET);
    basket.castShadow = basket.receiveShadow = true;
    S.add(basket);
    const cloth = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), M.cloth);
    cloth.rotation.x = -Math.PI / 2;
    cloth.scale.set(1.15, 0.85, 1);
    cloth.position.copy(BASKET).setY(BASKET.y + 0.03);
    S.add(cloth);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 24, Math.PI), M.wicker);
    handle.position.copy(BASKET).setY(BASKET.y + 0.12);
    handle.scale.set(1.2, 0.9, 1);
    S.add(handle);
    // la pila de pesos
    this.coinGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.007, 20);
    this.coins = new THREE.Group();
    this.coins.position.copy(COINS);
    S.add(this.coins);
    // el mate del pulpero
    const mate = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), M.gourd);
    mate.scale.set(1, 1.1, 1);
    mate.position.set(1.7, COUNTER_Y + 0.055, 0.22);
    S.add(mate);
    const bombilla = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), M.silver);
    bombilla.position.set(1.72, COUNTER_Y + 0.15, 0.22);
    bombilla.rotation.z = -0.3;
    S.add(bombilla);
    // la vela
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.14, 10), M.candle);
    candle.position.set(-1.95, COUNTER_Y + 0.07, 0.2);
    S.add(candle);
    this.candleLight = new THREE.PointLight(0xffa050, 1.4, 3, 2);
    this.candleLight.position.set(-1.95, COUNTER_Y + 0.22, 0.22);
    S.add(this.candleLight);
    this.addFlame(V(-1.95, COUNTER_Y + 0.17, 0.2), 0.045);
    // toneles de este lado
    const barrel = new THREE.CylinderGeometry(0.32, 0.32, 0.8, 18);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(barrel, M.counter);
      b.position.set(s * 2.75, 0.4, 1.2);
      b.castShadow = true;
      S.add(b);
      for (const y of [0.15, 0.65]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.012, 4, 24), M.iron);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(s * 2.75, y, 1.2);
        S.add(hoop);
      }
    }

    // ---------- luces ----------
    S.add(new THREE.HemisphereLight(0x3a4a6a, 0x1a0e08, 0.5));
    const moon = new THREE.DirectionalLight(0x7a98d8, 0.5);
    moon.position.set(-4, 3, -1);
    S.add(moon);
    // el farol colgado del lado del cliente: las sombras de la reja caen adentro
    this.lantern = new THREE.PointLight(0xffb060, 16, 8, 1.8);
    this.lantern.position.set(0.15, 2.5, 0.95);
    this.lantern.castShadow = true;
    this.lantern.shadow.mapSize.set(1024, 1024);
    this.lantern.shadow.bias = -0.002;
    this.lantern.shadow.radius = 3;
    S.add(this.lantern);
    const farol = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 1.6, transparent: true, opacity: 0.55 }));
    farol.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 4), M.iron);
    cap.position.y = 0.16;
    cap.rotation.y = Math.PI / 4;
    farol.add(cap);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.45, 4), M.iron);
    wire.position.y = 0.42;
    farol.add(wire);
    farol.position.set(0.15, 2.58, 0.95);
    this.farol = farol;
    S.add(farol);
    this.addFlame(V(0.15, 2.56, 0.95), 0.07);
    // una lámpara de aceite en el estante (para que se vea el fondo)
    this.shelfLight = new THREE.PointLight(0xffa050, 3, 4.5, 2);
    this.shelfLight.position.set(-1.6, 2.1, -2.2);
    S.add(this.shelfLight);
    this.addFlame(V(-1.6, 1.84, -2.5), 0.035);

    // los UV de cada malla, según cuánto se repite la textura de su material
    const byMat = new Map(Object.entries(REP).map(([k, r]) => [M[k], r]));
    const done = new WeakSet();
    S.traverse((o) => {
      const r = o.isMesh && !Array.isArray(o.material) && byMat.get(o.material);
      const uv = r && o.geometry.attributes.uv;
      if (!uv || done.has(o.geometry)) return;
      done.add(o.geometry);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r[0], uv.getY(i) * r[1]);
      uv.needsUpdate = true;
    });

    // chispas y humo
    this.sparks = this.buildSparks();
    this.smoke = [];
    this.setCoins(0);
  }

  buildOven(x, i) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, 0, OVEN_Z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, BASE, 1.0), M.brick);
    base.position.y = BASE / 2;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.clay);
    dome.scale.set(1, 0.92, 1);
    dome.position.y = BASE;
    dome.castShadow = dome.receiveShadow = true;
    g.add(dome);
    // la boca: el aro de barro y adentro el fuego
    const ring = arch(0.25, 0.1);
    ring.holes.push(arch(0.18, 0.1));
    const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 }), M.clay);
    lip.position.set(0, BASE, 0.4);
    lip.castShadow = true;
    g.add(lip);
    const fireMat = new THREE.MeshBasicMaterial({ map: fireTexture(), color: new THREE.Color(0.12, 0.05, 0.03), toneMapped: false });
    const fire = new THREE.Mesh(new THREE.ShapeGeometry(arch(0.185, 0.1), 16), fireMat);
    fire.position.set(0, BASE, 0.485);
    g.add(fire);
    // la puerta de chapa (bisagra a la izquierda)
    const door = new THREE.Group();
    door.position.set(-0.2, BASE, 0.54);
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(arch(0.2, 0.1), 16), M.chapa);
    plate.position.x = 0.2;
    door.add(plate);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.iron);
    knob.position.set(0.34, 0.12, 0.02);
    door.add(knob);
    g.add(door);
    // la chimenea
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.22, 12), M.clay);
    ch.position.set(0, BASE + 0.48, 0.18);
    g.add(ch);
    const light = new THREE.PointLight(0xff6a20, 0, 3.6, 2);
    light.position.set(0, BASE + 0.17, 0.85);
    g.add(light);
    // llamitas en la boca
    const fl = [];
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
      sp.position.set((k - 1) * 0.08, BASE + 0.08, 0.5);
      sp.scale.set(0.1, 0.2, 1);
      g.add(sp);
      fl.push(sp);
    }
    // la pala (sale de la boca con lo que salió)
    const peel = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.26), M.wood);
    peel.add(blade);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 8), M.wood);
    stick.rotation.x = Math.PI / 2;
    stick.position.z = -0.78;
    peel.add(stick);
    peel.visible = false;
    g.add(peel);
    this.scene.add(g);
    return { g, fire, fireMat, door, light, fl, peel, k: 0.06, want: 0.06, i, x, chimney: V(x, BASE + 0.62, OVEN_Z + 0.18) };
  }

  addFlame(pos, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    sp.position.copy(pos);
    sp.scale.set(size, size * 2, 1);
    sp.userData.s = size;
    this.scene.add(sp);
    this.flames.push(sp);
  }

  buildSparks() {
    const N = 240;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: this.dotTex, color: 0xffa040, size: 0.035, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pts, pos, vel: new Float32Array(N * 3), life: new Float32Array(N), n: N, next: 0 };
  }

  burst(at, n = 40, up = 1.6) {
    const S = this.sparks;
    for (let i = 0; i < n; i++) {
      const k = S.next;
      S.next = (S.next + 1) % S.n;
      S.pos[k * 3] = at.x + (Math.random() - 0.5) * 0.2;
      S.pos[k * 3 + 1] = at.y;
      S.pos[k * 3 + 2] = at.z;
      S.vel[k * 3] = (Math.random() - 0.5) * 1.2;
      S.vel[k * 3 + 1] = up * (0.5 + Math.random());
      S.vel[k * 3 + 2] = Math.random() * 1.2;
      S.life[k] = 0.6 + Math.random() * 0.9;
    }
  }

  puff(at) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color: 0x6a6460, transparent: true, opacity: 0.5, depthWrite: false }));
    sp.position.copy(at);
    sp.scale.setScalar(0.2);
    this.scene.add(sp);
    this.smoke.push({ sp, t: 0, life: 2.6 + Math.random() });
  }

  // La pila de pesos sobre el mostrador (hasta 16 a la vista).
  setCoins(n) {
    if (n === this.coinCount) return;
    const G = this.coins;
    while (G.children.length) G.remove(G.children[0]);
    const show = Math.min(16, n);
    for (let i = 0; i < show; i++) {
      const c = new THREE.Mesh(this.coinGeo, this.M.coin);
      const col = i < 10 ? 0 : 1;
      const k = col ? i - 10 : i;
      c.position.set(col * 0.07 + Math.sin(i * 2.3) * 0.003, 0.0035 + k * 0.0072, col * 0.03 + Math.cos(i * 1.7) * 0.003);
      c.castShadow = true;
      G.add(c);
    }
    this.coinCount = n;
  }

  // Las cinco de la canasta (ids).
  setBasket(ids) {
    const key = (ids || []).join('|');
    if (key === this.basketKey) return;
    this.basketKey = key;
    for (const e of this.basket) {
      this.scene.remove(e.group);
      e.dispose?.();
    }
    this.basket = [];
    const spots = [
      [-0.12, -0.05, 0.3],
      [0.1, -0.06, -0.25],
      [-0.02, 0.07, 0.1],
      [0.15, 0.06, 0.5],
      [-0.16, 0.06, -0.4],
    ];
    (ids || []).forEach((id, i) => {
      if (!id) return;
      const e = this.buildEmp(id);
      const [dx, dz, ry] = spots[i];
      e.group.position.set(BASKET.x + dx, BASKET.y + 0.035 + (i >= 2 ? 0.02 : 0), BASKET.z + dz);
      e.group.rotation.set(0, ry, i >= 2 ? 0.12 : 0);
      e.group.scale.setScalar(0.95);
      e.group.traverse((o) => (o.castShadow = true));
      this.scene.add(e.group);
      this.basket.push(e);
    });
  }

  setShot(name) {
    this.shot = name;
  }

  // Vacía la tabla (lo de la hornada anterior).
  clearTray() {
    for (const t of this.tray) {
      this.scene.remove(t.obj);
      if (t.ring) this.scene.remove(t.ring);
      t.dispose?.();
    }
    this.tray = [];
  }

  // Una animación: fn(k, dt) de 0 a 1 en `dur` segundos, desde `at` (s desde ahora).
  anim(at, dur, fn, done) {
    this.anims.push({ t0: this.time + at, dur, fn, done });
  }

  // La hornada. `res`: por horno (0..2), null o { k: 'emp'|'boost'|'refund'|'doble', id?, color?, rarity?, paid }.
  // `ev(name, data)` avisa los momentos (para los sonidos y los carteles).
  // Devuelve cuántos segundos dura.
  bake(res, paid, ev) {
    this.clearTray();
    let t = 0;
    // los pesos pasan por la ventanita a la lata
    for (let i = 0; i < paid; i++) {
      const coin = new THREE.Mesh(this.coinGeo, this.M.coin);
      const from = COINS.clone().add(V(0, 0.01 + (Math.max(0, this.coinCount - 1 - i) % 10) * 0.0072, 0));
      coin.position.copy(from);
      this.scene.add(coin);
      const at = t + i * 0.28;
      this.anim(
        at,
        0.62,
        (k) => {
          const e = ease(k);
          coin.position.lerpVectors(from, CUP, e);
          coin.position.y += Math.sin(Math.PI * k) * 0.42;
          coin.rotation.set(k * 14, k * 6, 0);
        },
        () => {
          this.scene.remove(coin);
          ev('coin', i);
        },
      );
    }
    this.anim(0.05, 0.1, () => {}, () => this.setCoins(Math.max(0, this.coinCount - paid)));
    t += 0.35 + paid * 0.28;
    // se prenden los que se pagaron
    const lit = [];
    for (let i = 0; i < 3; i++) if (res[i] && res[i].paid) lit.push(i);
    lit.forEach((i, n) => this.anim(t + n * 0.34, 0.01, () => {}, () => this.ignite(i, ev)));
    t += lit.length * 0.34 + 0.9;
    // "a todo horno": se prenden los que faltaban
    const boost = res.findIndex((r) => r?.k === 'boost');
    if (boost >= 0) {
      const O = this.ovens[boost];
      this.anim(t, 0.01, () => {}, () => {
        this.burst(V(O.x, BASE + 0.2, OVEN_Z + 0.6), 90, 2.6);
        O.want = 1.6;
        ev('boost', boost);
      });
      t += 0.6;
      const more = [];
      for (let i = 0; i < 3; i++) if (res[i] && !res[i].paid) more.push(i);
      more.forEach((i, n) => this.anim(t + n * 0.3, 0.01, () => {}, () => this.ignite(i, ev)));
      t += more.length * 0.3 + 0.8;
    }
    // la pala saca lo de cada horno y lo tira por la ventanita
    const order = [0, 1, 2].filter((i) => res[i]);
    order.forEach((i, n) => {
      this.serve(i, res[i], t + n * 1.05, ev);
    });
    t += order.length * 1.05 + 1.1;
    this.anim(t, 0.01, () => {}, () => ev('done'));
    return t;
  }

  ignite(i, ev) {
    const O = this.ovens[i];
    O.want = 1;
    this.burst(V(O.x, BASE + 0.17, OVEN_Z + 0.58), 50, 1.8);
    for (let k = 0; k < 3; k++) this.anim(k * 0.3, 0.01, () => {}, () => this.puff(O.chimney.clone()));
    ev('fire', i);
  }

  serve(i, r, at, ev) {
    const O = this.ovens[i];
    const S = this.scene;
    // lo que sale: la empanada, un peso (el de vuelta) o el cartel del doble
    let obj;
    let dispose = null;
    if (r.k === 'emp') {
      const e = this.buildEmp(r.id);
      obj = e.group;
      dispose = e.dispose;
      obj.scale.setScalar(1.1);
    } else if (r.k === 'refund') {
      obj = new THREE.Mesh(this.coinGeo, this.M.coin);
      obj.scale.setScalar(1.6);
    } else {
      // (la del impulso y el doble: una brasa que brilla)
      obj = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(r.k === 'doble' ? 0x7af0ff : 0xffb040).multiplyScalar(3), toneMapped: false }));
      dispose = () => obj.geometry.dispose();
    }
    obj.visible = false;
    obj.traverse((o) => (o.castShadow = true));
    S.add(obj);
    const mouth = V(O.x, BASE + 0.12, OVEN_Z + 1.05);
    const out = V(O.x * 0.45, 1.2, -0.45);
    const land = TRAY[i].clone();
    // la puerta se abre y la pala sale
    this.anim(at, 0.3, (k) => (O.door.rotation.y = -1.9 * easeOut(k)));
    this.anim(at + 0.15, 0.45, (k) => {
      O.peel.visible = true;
      const e = easeOut(k);
      O.peel.position.set(0, BASE + 0.03 + e * 0.07, 0.25 + e * 0.8);
      O.peel.rotation.x = -0.05 - e * 0.1;
      obj.visible = true;
      obj.position.copy(O.g.position).add(O.peel.position).add(V(0, 0.02, 0));
      if (k < 0.1) this.burst(V(O.x, BASE + 0.1, OVEN_Z + 0.6), 12, 1.2);
    });
    // la pala la tira: vuela por la ventanita a la tabla
    this.anim(
      at + 0.62,
      0.55,
      (k) => {
        const e = ease(k);
        const p = new THREE.Vector3().lerpVectors(mouth, out, Math.min(1, e * 2));
        if (e > 0.5) p.lerpVectors(out, land, (e - 0.5) * 2);
        p.y += Math.sin(Math.PI * e) * 0.18;
        obj.position.copy(p);
        obj.rotation.y = e * Math.PI * 2 + (i - 1) * 0.3;
        obj.rotation.z = Math.sin(e * Math.PI) * 0.4;
      },
      () => {
        obj.position.copy(land);
        obj.rotation.set(0, (i - 1) * 0.35, 0);
        // un salto al caer
        this.anim(0, 0.3, (k) => (obj.position.y = land.y + Math.sin(Math.PI * k) * 0.02 * (1 - k)));
        let ring = null;
        if (r.color) {
          ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(land).setY(COUNTER_Y + 0.03);
          S.add(ring);
        }
        this.burst(land.clone().setY(land.y + 0.05), r.rarity === 'ultra' ? 70 : 24, 1.2);
        this.tray.push({ obj, ring, dispose, r, i, at: land.clone() });
        ev('land', { i, r });
      },
    );
    // la pala vuelve y la puerta se cierra
    this.anim(at + 0.9, 0.4, (k) => {
      const e = 1 - ease(k);
      O.peel.position.set(0, BASE + 0.03 + e * 0.07, 0.25 + e * 0.8);
      if (k >= 1) O.peel.visible = false;
    });
    this.anim(at + 1.2, 0.35, (k) => (O.door.rotation.y = -1.9 * (1 - ease(k))));
    // (se va apagando de a poco)
    this.anim(at + 1.4, 0.01, () => {}, () => (O.want = 0.3));
  }

  // Relieve y parallax como el resto del juego (fx/Surfaces, según la
  // calidad) y los programas compilados de antemano: así entrar no traba.
  prepare(renderer, quality) {
    if (!this.surf) {
      this.surf = new Surfaces();
      this.surf.setScene(this.scene, this.T);
    }
    this.surf.setQuality(quality);
    if (this.compiledFor !== quality) {
      this.compiledFor = quality;
      // y un cuadro de verdad afuera de la pantalla: sube las mallas, las
      // texturas y arma la sombra del farol (lo que compile no hace)
      // (a la pantalla, como se dibuja abierta —con un blanco aparte salían
      // otros programas, compilados de una: ~1 s—, recortado a un píxel: el
      // título lo tapa en el cuadro siguiente)
      const frame = () => {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, 1, 1);
        renderer.shadowMap.needsUpdate = true;
        this.update(0.016);
        renderer.render(this.scene, this.camera);
        renderer.setScissorTest(false);
        renderer.setRenderTarget(prev);
      };
      // (2026-10-05: compilar de una trababa el título 1,2 s, justo cuando uno
      // abría el libro o cualquier cosa; ahora la placa compila de a poco y el
      // cuadro de afuera va cuando terminó. globalThis.__mduNoPulpAsync: como antes)
      if (renderer.compileAsync && globalThis.__mduNoPulpAsync !== true) {
        renderer
          .compileAsync(this.scene, this.camera)
          .then(frame)
          .catch(() => {});
      } else {
        renderer.compile(this.scene, this.camera);
        frame();
      }
    }
  }

  // Para las fotos de los íconos: una escena chica, con fondo de horno y tres luces.
  iconRig() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0c06);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
    cam.position.set(0, 0.13, 0.33);
    cam.lookAt(0, 0.005, 0);
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x302018, 1.3));
    const key = new THREE.DirectionalLight(0xffe0b0, 2.4);
    key.position.set(0.5, 1, 0.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a40, 1.6);
    rim.position.set(-0.6, 0.4, -0.8);
    scene.add(rim);
    const holder = new THREE.Group();
    scene.add(holder);
    return { scene, cam, holder };
  }

  // Dónde cae en pantalla algo de la tabla (para los carteles de la interfaz).
  screenOf(p) {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.size.x, y: (-v.y * 0.5 + 0.5) * this.size.y };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    // animaciones
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      if (t < a.t0) continue;
      const k = clamp((t - a.t0) / a.dur);
      a.fn(k, dt);
      if (k >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    // hornos: el fuego sube y baja, titila
    for (const O of this.ovens) {
      O.k += (O.want - O.k) * Math.min(1, dt * (O.want > O.k ? 5 : 0.5));
      if (O.want > 1 && O.k > 1.4) O.want = 1;
      const fl = 0.85 + Math.sin(t * 17 + O.i * 3) * 0.08 + Math.sin(t * 29 + O.i) * 0.07;
      const k = O.k * fl;
      O.fireMat.color.setRGB(0.12 + k * 2.2, 0.05 + k * 1.1, 0.03 + k * 0.35);
      O.light.intensity = Math.max(0, (O.k - 0.08) * 7 * fl);
      O.fl.forEach((sp, j) => {
        sp.material.opacity = clamp((O.k - 0.12) * 1.2) * (0.7 + Math.sin(t * 13 + j * 2) * 0.3);
        sp.scale.set(0.1, 0.16 + 0.08 * Math.sin(t * 11 + j * 1.7) + O.k * 0.06, 1);
      });
      // humo de la chimenea mientras está prendido
      if (O.k > 0.4 && Math.random() < dt * 2.5) this.puff(O.chimney.clone());
    }
    // velas y farol
    for (const f of this.flames) {
      const s = f.userData.s;
      f.scale.set(s * (0.9 + Math.sin(t * 23 + f.id) * 0.1), s * 2 * (0.9 + Math.sin(t * 17 + f.id * 2) * 0.12), 1);
    }
    this.candleLight.intensity = 1.3 + Math.sin(t * 19) * 0.15 + Math.sin(t * 31) * 0.1;
    this.lantern.intensity = 15 + Math.sin(t * 7) * 0.6;
    this.farol.rotation.z = Math.sin(t * 0.7) * 0.02;
    // chispas
    const S = this.sparks;
    for (let i = 0; i < S.n; i++) {
      if (S.life[i] <= 0) {
        S.pos[i * 3 + 1] = -10;
        continue;
      }
      S.life[i] -= dt;
      S.vel[i * 3 + 1] -= dt * 2.2;
      S.pos[i * 3] += S.vel[i * 3] * dt;
      S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt;
      S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
    // humo
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt;
      const k = s.t / s.life;
      s.sp.position.y += dt * 0.35;
      s.sp.position.x += Math.sin(s.t * 1.3 + i) * dt * 0.05;
      s.sp.scale.setScalar(0.18 + k * 0.6);
      s.sp.material.opacity = 0.35 * (1 - k);
      if (k >= 1) {
        this.scene.remove(s.sp);
        s.sp.material.dispose();
        this.smoke.splice(i, 1);
      }
    }
    // los aros de lo que salió
    for (const it of this.tray) {
      if (it.ring) {
        it.ring.material.opacity = 0.45 + Math.sin(t * 3 + it.i) * 0.2;
        it.ring.rotation.z = t * 0.6;
      }
      if (it.r.k !== 'emp') it.obj.rotation.y += dt * 1.5;
    }
    // la cámara va a la toma elegida (y sigue un poco al mouse)
    const sh = SHOTS[this.shot];
    const c = this.cam;
    const f = Math.min(1, dt * 2.4);
    c.pos.lerp(sh.pos, f);
    c.look.lerp(sh.look, f);
    c.fov += (sh.fov - c.fov) * f;
    const m = this.mouse;
    m.sx += (m.x - m.sx) * Math.min(1, dt * 3);
    m.sy += (m.y - m.sy) * Math.min(1, dt * 3);
    const cam = this.camera;
    cam.position.set(c.pos.x + m.sx * 0.08 + Math.sin(t * 0.3) * 0.02, c.pos.y - m.sy * 0.05 + Math.sin(t * 0.47) * 0.012, c.pos.z);
    cam.lookAt(c.look.x + m.sx * 0.05, c.look.y - m.sy * 0.03, c.look.z);
    if (Math.abs(cam.fov - c.fov) > 0.01) {
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    }
  }

  // `panel`: qué parte de la pantalla tapa el menú (la escena se corre a la derecha).
  render(renderer, dt) {
    renderer.getSize(this.size);
    const w = this.size.x;
    const h = this.size.y;
    const cam = this.camera;
    const off = w > 820 ? -w * this.panel : 0;
    if (cam.aspect !== w / h || this.off !== off) {
      cam.aspect = w / h;
      this.off = off;
      if (off) cam.setViewOffset(w, h, off, 0, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    this.update(dt);
    const auto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(this.scene, cam);
    renderer.autoClear = auto;
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    this.clearTray();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
    });
  }
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
