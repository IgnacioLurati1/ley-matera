import * as THREE from 'three';

// El Chiquitijuein: un duende como los del norte (no llega al metro), casi
// todo sombrero. Poncho oscuro con guarda y flecos, piernitas flacas, brazos
// largos que le llegan a las rodillas y una bombilla de alpaca más alta que él
// que usa de bastón. La cara queda en la sombra del ala: solo se ven dos
// puntitos colorados... y, si se da vuelta, una sonrisa finita de dientitos.
//
// Lo usan la cinemática del final (ui/TowerCinematic.js) y las apariciones en
// la explanada durante la partida (ChiquiSightings, desde world/Tower.js).

// El poncho: lana negra con la guarda colorada y ocre cerca del borde.
function ponchoTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#17110d';
  x.fillRect(0, 0, 64, 128);
  // la trama de la lana
  for (let i = 0; i < 128; i += 2) {
    x.fillStyle = i % 4 ? 'rgba(0,0,0,0.25)' : 'rgba(60,44,32,0.18)';
    x.fillRect(0, i, 64, 1);
  }
  // la guarda: dos bandas coloradas con una de guardas ocres en el medio
  x.fillStyle = '#4a0c08';
  x.fillRect(0, 98, 64, 5);
  x.fillRect(0, 115, 64, 5);
  x.fillStyle = '#6a4a1c';
  for (let i = 0; i < 64; i += 8) {
    x.beginPath();
    x.moveTo(i, 112);
    x.lineTo(i + 4, 105);
    x.lineTo(i + 8, 112);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

// Arma el bicho mirando a +z. `tex` son las texturas del juego (usa `dot`).
export function buildChiqui(tex) {
  const root = new THREE.Group();
  const M = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 1 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x100c0a, roughness: 0.95, side: THREE.DoubleSide });
  const cloth = new THREE.MeshStandardMaterial({ map: ponchoTexture(), roughness: 1, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.45, metalness: 0.9 });
  // las piernitas y las alpargatas
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.3, 6), M);
    leg.position.set(s * 0.07, 0.15, 0);
    root.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.12), M);
    foot.position.set(s * 0.075, 0.018, 0.03);
    root.add(foot);
  }
  // el cuerpo, flaquito, debajo del poncho
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 8), M);
  body.position.y = 0.5;
  root.add(body);
  // el poncho: hombros anchos y cae derecho hasta las rodillas, con las
  // puntas de los costados más largas (por encima de los brazos) y flecos
  const prof = [[0.03, 0.8], [0.15, 0.78], [0.22, 0.72], [0.25, 0.52], [0.28, 0.27]].map(([r, y]) => new THREE.Vector2(r, y));
  const ponchoGeo = new THREE.LatheGeometry(prof, 16);
  const pos = ponchoGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.5) continue;
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    // los costados (x) caen más que adelante y atrás
    pos.setY(i, y - Math.abs(Math.cos(a)) ** 2 * 0.09 * ((0.5 - y) / 0.23));
  }
  ponchoGeo.computeVertexNormals();
  const poncho = new THREE.Mesh(ponchoGeo, cloth);
  root.add(poncho);
  const fringe = new THREE.BoxGeometry(0.008, 0.05, 0.008);
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const drop = Math.abs(Math.cos(a)) ** 2 * 0.09;
    const f = new THREE.Mesh(fringe, cloth);
    f.position.set(Math.cos(a) * 0.285, 0.245 - drop, Math.sin(a) * 0.285);
    poncho.add(f);
  }
  // la cabeza (con el sombrero, los ojos y la sonrisa) gira aparte del cuerpo
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.01);
  root.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), M));
  // el sombrero aludo: ala enorme que se cae en las puntas y copa baja
  const hat = new THREE.Group();
  hat.position.y = 0.075;
  hat.rotation.x = 0.05;
  head.add(hat);
  const brim = new THREE.LatheGeometry([[0.1, 0.012], [0.2, 0.008], [0.3, -0.008], [0.38, -0.04], [0.42, -0.075]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    const r = Math.hypot(bp.getX(i), bp.getZ(i));
    // el ala ondulada, más caída adelante (tapa los ojos)
    bp.setY(i, bp.getY(i) - Math.max(0, r - 0.2) * (0.12 * Math.sin(a * 3) + 0.1 * Math.max(0, Math.sin(a))));
  }
  brim.computeVertexNormals();
  hat.add(new THREE.Mesh(brim, hatMat));
  const crown = new THREE.LatheGeometry([[0.105, 0.005], [0.12, 0.06], [0.115, 0.13], [0.09, 0.165], [0.03, 0.15], [0, 0.155]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  hat.add(new THREE.Mesh(crown, hatMat));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.117, 0.028, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a0806, roughness: 0.9, side: THREE.DoubleSide }));
  band.position.y = 0.03;
  hat.add(band);
  // los ojos: dos chispas coloradas en la sombra del ala (y su resplandor)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3018, toneMapped: false });
  const eyes = [];
  const glows = [];
  for (const [s, r] of [[-1, 0.014], [1, 0.012]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), eyeMat);
    e.position.set(s * 0.042, -0.005, 0.112);
    head.add(e);
    eyes.push(e);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    gl.scale.setScalar(0.06);
    gl.position.copy(e.position).setZ(0.13);
    head.add(gl);
    glows.push(gl);
  }
  // un resplandor colorado debajo del ala: de lejos es lo único que se ve
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0xff2a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  halo.scale.setScalar(0.9);
  halo.position.set(0, 0.02, 0.12);
  head.add(halo);
  // la sonrisa: una raya finita de dientitos, de oreja a oreja
  const smile = new THREE.Group();
  const toothMat = new THREE.MeshBasicMaterial({ color: 0xbfb4a0, transparent: true, opacity: 0, toneMapped: false });
  const tooth = new THREE.BoxGeometry(0.0075, 0.014, 0.004);
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 2.2;
    const t = new THREE.Mesh(tooth, toothMat);
    t.position.set(Math.sin(a) * 0.07, -0.05 + (1 - Math.cos(a)) * 0.028, 0.098 + Math.cos(a) * 0.01);
    t.rotation.set(0, a * 0.6, a * 0.35);
    smile.add(t);
  }
  head.add(smile);
  // los brazos: flacos y largos, con tres dedos cada uno, saliendo del poncho
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.2, 0.56, 0.05);
    arm.rotation.z = s * 0.1;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 6), M);
    bone.position.y = -0.21;
    arm.add(bone);
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.1, 4), M);
      finger.position.set((f - 1) * 0.011, -0.46, 0.01);
      finger.rotation.set(0.25, 0, (f - 1) * 0.35);
      arm.add(finger);
    }
    root.add(arm);
    arms.push(arm);
  }
  // el bastón: una bombilla vieja, más alta que él
  const staff = new THREE.Group();
  staff.position.set(0.27, 0, 0.1);
  staff.rotation.z = -0.06;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.3, 8), metal);
  pipe.position.y = 0.65;
  staff.add(pipe);
  const filter = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), metal);
  filter.scale.set(1, 0.4, 1.3);
  filter.position.y = 0.03;
  staff.add(filter);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.12, 8), metal);
  mouth.position.set(-0.03, 1.33, 0);
  mouth.rotation.z = 0.7;
  staff.add(mouth);
  root.add(staff);
  // la mano derecha va agarrada al bastón
  arms[1].rotation.set(-0.05, 0, -0.3);
  // una calabacita vacía colgando del cinto
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }));
  gourd.scale.set(1, 1.2, 1);
  gourd.position.set(-0.19, 0.3, 0.14);
  root.add(gourd);
  // la sombra
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.dot, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }));
  shadow.position.y = 0.012;
  root.add(shadow);
  // humo oscuro que se le escapa del poncho
  const wisps = [];
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dot, color: 0x0a0605, transparent: true, opacity: 0, depthWrite: false }));
    w.userData.p = Math.random();
    w.userData.a = Math.random() * Math.PI * 2;
    root.add(w);
    wisps.push(w);
  }
  return {
    root,
    head,
    eyes,
    glows,
    smile,
    toothMat,
    halo,
    arms,
    staff,
    wisps,
    eyeK: 1,
    // Cada cuadro: los ojos parpadean, el humo sube y el poncho respira.
    update(dt, t) {
      // parpadea... salvo cuando te mira fijo
      const blink = this.eyeK < 1.05 && (Math.sin(t * 1.7) > 0.985 || Math.sin(t * 2.9 + 1) > 0.992) ? 0 : 1;
      for (const e of this.eyes) e.visible = blink > 0;
      for (const gl of this.glows) gl.material.opacity = blink * Math.min(1, 0.5 + this.eyeK * 0.35) * (0.85 + Math.sin(t * 9) * 0.1);
      poncho.scale.set(1 + Math.sin(t * 2.1) * 0.012, 1, 1 + Math.sin(t * 2.1) * 0.012);
      for (const w of this.wisps) {
        w.userData.p = (w.userData.p + dt * 0.35) % 1;
        const p = w.userData.p;
        const a = w.userData.a + t * 0.4;
        w.position.set(Math.cos(a) * (0.2 + p * 0.25), 0.05 + p * 0.9, Math.sin(a) * (0.2 + p * 0.25));
        w.scale.setScalar(0.25 + p * 0.5);
        w.material.opacity = Math.sin(p * Math.PI) * 0.3;
      }
    },
  };
}

// ---------------- la risa ----------------
// Un ruido para cada contexto de audio (la risa es independiente del motor).
const noiseBufs = new WeakMap();
function noiseBuf(c) {
  let b = noiseBufs.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(c, b);
  }
  return b;
}

// Risita de bicho chiquito: "ji-ji-ji-ji" cada vez más rápida, con la voz
// finita (formantes de i) y un chillido al final; el eco la repite de un lado
// y del otro. `pos` la ubica en el mundo; sin pos suena en la cabeza (con
// `pan` para susurrar al oído). `whisper` la hace de aire, sin voz.
export function chiquiGiggle(A, { pos = null, gain = 1, pan = 0, echo = 0.45, whisper = false, pitch = 1, ref = 7 } = {}) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const t0 = A.now + 0.03;
  let out;
  if (pos) out = A.out({ pos, gain, reverb: 0.55, ref });
  else {
    const o = A.out({ gain, reverb: 0.5 });
    out = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (out.pan) out.pan.value = pan;
    out.connect(o);
  }
  const voice = c.createGain();
  voice.connect(out);
  // el eco: dos rebotes, uno de cada lado, cada vez más apagados
  if (echo > 0) {
    let prev = voice;
    for (let k = 0; k < 3; k++) {
      const d = c.createDelay(1);
      d.delayTime.value = 0.23 + k * 0.05;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600 - k * 600;
      const gn = c.createGain();
      gn.gain.value = echo * (0.8 - k * 0.2);
      prev.connect(d).connect(lp).connect(gn);
      if (c.createStereoPanner && !pos) {
        const p = c.createStereoPanner();
        p.pan.value = k % 2 ? 0.7 : -0.7;
        gn.connect(p).connect(out);
      } else gn.connect(out);
      prev = gn;
    }
  }
  const nb = noiseBuf(c);
  // formantes de una "i" de voz chiquita
  const formant = (src, t, f, q, g) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gn = c.createGain();
    gn.gain.value = g;
    src.connect(bp).connect(gn).connect(voice);
    return gn;
  };
  const gaps = [0, 0.15, 0.28, 0.4, 0.51, 0.61, 0.71];
  gaps.forEach((dt, i) => {
    const t = t0 + dt;
    const len = 0.1;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (!whisper) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      const f = (560 - i * 12) * pitch;
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.03);
      o.frequency.linearRampToValueAtTime(f * 0.88, t + len);
      o.connect(env);
      o.start(t);
      o.stop(t + len + 0.02);
    }
    // la "j": un soplido áspero al empezar cada sílaba (y todo, si susurra)
    const n = c.createBufferSource();
    n.buffer = nb;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(whisper ? 0.9 : 0.5, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + (whisper ? len : 0.045));
    n.connect(ng).connect(env);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.02);
    formant(env, t, 380 * pitch, 3, 0.9);
    formant(env, t, 2500 * pitch, 7, 2.2);
    formant(env, t, 3300 * pitch, 9, 1.2);
    const body = c.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 2400;
    const bg = c.createGain();
    bg.gain.value = 0.22;
    env.connect(body).connect(bg).connect(voice);
  });
  // el chillidito del final
  const t = t0 + 0.86;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.8, t + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  const o = c.createOscillator();
  o.type = whisper ? 'sine' : 'triangle';
  o.frequency.setValueAtTime(820 * pitch, t);
  o.frequency.linearRampToValueAtTime(1350 * pitch, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(640 * pitch, t + 0.42);
  const vib = c.createOscillator();
  vib.frequency.value = 17;
  const vg = c.createGain();
  vg.gain.value = 40 * pitch;
  vib.connect(vg).connect(o.frequency);
  o.connect(env);
  formant(env, t, 2500 * pitch, 5, 1.6);
  const bg = c.createGain();
  bg.gain.value = whisper ? 0.15 : 0.35;
  env.connect(bg).connect(voice);
  for (const x of [o, vib]) {
    x.start(t);
    x.stop(t + 0.45);
  }
}

// Estática cortada y un golpe grave: cada vez que salta de lugar.
export function chiquiGlitch(A, gain = 0.6) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const o = A.out({ gain, reverb: 0 });
  const t = A.now;
  const n = c.createBufferSource();
  n.buffer = noiseBuf(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 6; i++) g.gain.setValueAtTime(i % 2 ? 0.05 : 0.9, t + i * 0.022);
  g.gain.setValueAtTime(0, t + 0.14);
  n.connect(bp).connect(g).connect(o);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.16);
  const s = c.createOscillator();
  s.frequency.setValueAtTime(95, t);
  s.frequency.exponentialRampToValueAtTime(38, t + 0.22);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.9, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  s.connect(sg).connect(o);
  s.start(t);
  s.stop(t + 0.26);
}

// La bombilla-bastón contra el piso: un "tic" de metal.
export function chiquiTap(A, gain = 0.5) {
  const c = A?.ctx;
  if (!c || !A.out) return;
  const o = A.out({ gain, reverb: 0.35 });
  const t = A.now;
  const n = c.createBufferSource();
  n.buffer = noiseBuf(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  n.connect(hp).connect(g).connect(o);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.04);
  for (const [f, v] of [[2650, 0.25], [4120, 0.12]]) {
    const s = c.createOscillator();
    s.frequency.value = f;
    const sg = c.createGain();
    sg.gain.setValueAtTime(v, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(sg).connect(o);
    s.start(t);
    s.stop(t + 0.15);
  }
}

// ---------------- apariciones en la explanada ----------------
// De vez en cuando, desde las arcadas, se lo ve abajo en la explanada: quieto,
// mirándote. Si lo mirás de frente, desaparece (y se ríe). Si no, se va solo.
// No pasa por la red: cada uno ve (o no ve) el suyo.
export class ChiquiSightings {
  constructor(game, tower) {
    this.g = game;
    this.tower = tower;
    this.cd = 100 + Math.random() * 80;
    this.count = 0;
    this.max = 4;
    this.c = null;
    this.t = 0;
    this.look = 0;
  }

  update(dt) {
    const g = this.g;
    const C = this.c;
    if (C?.root.visible) {
      this.t += dt;
      C.update(dt, g.time);
      const cam = g.camera;
      // la cabeza lo sigue a uno
      C.head.lookAt(cam.position);
      // ¿lo estás mirando?
      const to = tmpV.copy(C.root.position).setY(C.root.position.y + 0.8).sub(cam.position);
      const d = to.length();
      cam.getWorldDirection(tmpW);
      const ang = Math.acos(Math.min(1, tmpW.dot(to) / d));
      this.look = ang < 0.16 ? this.look + dt : 0;
      if (this.look > 0.3 || g.state !== 'playing' || !g.player.alive || g.player.downed) this.vanish(this.look > 0.3);
      else if (this.t > 10 && ang > 0.6) this.vanish(false);
      return;
    }
    if (g.state !== 'playing' || this.count >= this.max) return;
    this.cd -= dt;
    if (this.cd > 0) return;
    this.cd = 6;
    if (!this.spawn()) return;
    this.count++;
    this.cd = 150 + Math.random() * 120;
  }

  // Busca un lugar de la explanada que se vea de reojo desde donde estás.
  spawn() {
    const g = this.g;
    const T = this.tower;
    const p = g.player;
    const round = g.rounds?.round || 0;
    if (round < 3 || !p.alive || p.downed || p.pos.y < 3.5 || !T.exposed(p.pos) || T.skyState === 'broken' || g.ee?.fight) return false;
    const S = T.T;
    const cam = g.camera;
    cam.getWorldDirection(tmpW);
    tmpW.y = 0;
    tmpW.normalize();
    const pa = Math.atan2(p.pos.z - S.cz, p.pos.x - S.cx);
    const opts = [];
    for (let k = 0; k < 24; k++) {
      const a = pa + ((k / 23) * 2 - 1) * 0.9;
      const r = 19 + Math.random() * 4;
      const x = S.cx + Math.cos(a) * r;
      const z = S.cz + Math.sin(a) * r;
      tmpV.set(x - cam.position.x, 0, z - cam.position.z).normalize();
      const off = Math.acos(Math.max(-1, Math.min(1, tmpV.dot(tmpW))));
      // de reojo: ni de frente ni fuera de la pantalla
      if (off > 0.35 && off < 0.75) opts.push([x, z]);
    }
    if (!opts.length) return false;
    const [x, z] = opts[Math.floor(Math.random() * opts.length)];
    if (!this.c) {
      this.c = buildChiqui(g.textures);
      g.scene.add(this.c.root);
    }
    const C = this.c;
    C.root.visible = true;
    C.root.position.set(x, 0, z);
    C.root.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z);
    C.eyeK = 1.4;
    for (const gl of C.glows) gl.scale.setScalar(0.3);
    C.halo.material.opacity = 0.35;
    this.t = 0;
    this.look = 0;
    return true;
  }

  vanish(seen) {
    const g = this.g;
    const C = this.c;
    C.root.visible = false;
    if (!seen) return;
    const p = C.root.position;
    g.fx?.dust?.(tmpV.set(p.x, 0.3, p.z), { x: 0, y: 1, z: 0 }, [0.06, 0.04, 0.04], 18);
    chiquiGiggle(g.audio, { pos: tmpV.set(p.x, 1, p.z).clone(), gain: 1.1, ref: 14 });
  }

  dispose() {
    this.c?.root.removeFromParent();
    this.c = null;
  }
}

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
