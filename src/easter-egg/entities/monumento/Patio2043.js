import * as THREE from 'three';
import { EE } from '../../config/map';
import { buildPatio, PATIO, PROBADORES, ORDEN, RONDA_R } from '../../world/monumentoPatio';
import { probador } from '../../world/monumentoStatues';
import { carvedText } from '../../world/monumentoTextures';
import { toTexture } from '../../core/textures';
import { players, myId, isHost } from '../castle/common';

// El easter egg secundario del Monumento: el patio de la 2043.
//  1. Seis cuadernos Rivadavia (uno de cada probador) perdidos por el mapa.
//  2. Con los seis se abre un portal en la Sala de las Banderas: lleva al
//     patio de la 2043 del Colegio San José, de día (world/monumentoPatio.js).
//  3. Ahí: las estatuas de piedra de los primeros probadores en ronda
//     alrededor del portal de vuelta, el cartel que les agradece, la pelota,
//     los arcos, el aro y el timbre. Mientras todos están en el patio, las
//     rondas esperan.
//  4. La ronda de mate: se le convida un mate a cada estatua en el orden del
//     cartel; si se le erra, se lava el mate y hay que empezar de nuevo. Con
//     los seis, el que falta: del pedestal vacío sube Fortu.
// Lo decide el anfitrión; viaja por 'pee' (k: 'pat').

const SALA = new THREE.Vector3(12.5, 0, 18.5);
const ARRIVE = new THREE.Vector3(PATIO.cx, PATIO.y, PATIO.cz + 2.6);
const BALL_R = 0.22;
const RISE_T = 7;
const COVERS = ['#b8322c', '#2c6ab8', '#2f8a4a', '#d6a02a', '#7a3ab0', '#d0602a'];
const POSES = { Luta: 'mate', Juli: 'saludo', Jero: 'brazos', Bruno: 'pelota', Mateo: 'pulgar', Eze: 'auris' };
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
// La voz de Fortu (la grabó el usuario; sfx/fortu-voz.mp3, nivelada con los
// otros grabados): una vez cuando termina de subir, en todas las compus, desde
// la estatua; después, saludarlo (F) o pasarle cerca la repite (cada uno la
// suya, con espera). __mduNoFortuVoz: sin la voz.
const FORTU_VOZ = { url: '/assets/sotano/sfx/fortu-voz.mp3', gain: 1.1, reverb: 0.25, ref: 5 };
const VOZ_F = 6;
const VOZ_CERCA = 45;
const CERCA_R = 2.2;

// El remolino del portal (aditivo, gira y late).
const PORTAL_T = { value: 0 };
function portalMat(day) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: PORTAL_T, uDay: { value: day ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uDay; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 9.0 - uT * 3.2) * 0.5 + 0.5;
        float core = smoothstep(1.0, 0.0, r);
        vec3 c1 = mix(vec3(0.45, 0.72, 1.0), vec3(1.0, 0.93, 0.7), uDay);
        vec3 c2 = mix(vec3(1.0, 0.95, 0.75), vec3(0.45, 0.72, 1.0), uDay);
        vec3 col = mix(c1, c2, sw * core);
        float alpha = (0.35 + 0.65 * core) * smoothstep(1.0, 0.85, r) * (0.75 + 0.25 * sin(uT * 2.0));
        gl_FragColor = vec4(col * alpha * 1.6, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// El cuaderno Rivadavia: tapa dura de color, la etiqueta con el nombre.
function cuadernoTex(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 352;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 352);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 0, 22, 352);
  x.fillStyle = '#f4f0e2';
  x.fillRect(48, 120, 176, 104);
  x.strokeStyle = '#1f2a44';
  x.lineWidth = 3;
  x.strokeRect(54, 126, 164, 92);
  x.fillStyle = '#1f2a44';
  x.textAlign = 'center';
  x.font = '700 24px Georgia, serif';
  x.fillText('RIVADAVIA', 136, 34);
  x.font = 'italic 600 40px Georgia, serif';
  x.fillText(name, 136, 186);
  x.font = '16px Georgia, serif';
  x.fillText('2043 · 7° grado', 136, 210);
  return toTexture(c, { repeat: false });
}

export default class Patio2043 {
  constructor(ee) {
    this.ee = ee;
    this.g = ee.g;
    const g = this.g;
    const w = g.world;
    this.root = new THREE.Group();
    this.root.name = 'patio2043';
    g.scene.add(this.root);
    // got: cuadernos juntados (bits); open: el portal; n: la ronda de mate; fortu: 0, 1 subiendo, 2 arriba
    this.st = { got: 0, open: 0, n: 0, fortu: 0 };
    this.P = buildPatio(w);
    this.inside = false;
    this.saved = null;
    this.buildCuadernos();
    this.buildPortals();
    this.buildRonda();
    this.buildSaludo();
    this.buildBall();
    this.buildBell();
    this.fadeEl = null;
    this.birdT = 2;
    this.syncT = 0;
    this.loadVoz();
  }

  // ---------------- la voz de Fortu ----------------
  loadVoz() {
    const A = this.g.audio;
    this.voz = null;
    this.vozT = -99;
    this.cercaT = -99;
    this.cerca = false;
    if (globalThis.__mduNoFortuVoz || !A?.ctx) return;
    fetch(FORTU_VOZ.url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((ab) => A.ctx.decodeAudioData(ab))
      .then((b) => {
        this.voz = b;
      })
      .catch(() => {});
  }

  // Habla desde la estatua (con las voces: su volumen de Opciones). false si no pudo.
  sayVoz() {
    const g = this.g;
    const A = g.audio;
    if (globalThis.__mduNoFortuVoz || !this.voz || !A?.ctx) return false;
    const S = this.statues[0];
    this.vozT = g.time;
    A.playBuffer(this.voz, { pos: tmpV.set(S.x, PATIO.y + 2.7, S.z).clone(), gain: FORTU_VOZ.gain, reverb: FORTU_VOZ.reverb, ref: FORTU_VOZ.ref, bus: A.voice });
    return true;
  }

  // Ya arriba: saludarlo (F) o pasarle cerca (cada compu la suya).
  vozCerca() {
    const g = this.g;
    if (globalThis.__mduNoFortuVoz || this.st.fortu !== 2) return;
    const S = this.statues[0];
    const P = g.player.pos;
    const near = Math.hypot(P.x - S.x, P.z - S.z) < CERCA_R && Math.abs(P.y - PATIO.y) < 3;
    if (near && !this.cerca && g.time - this.cercaT > VOZ_CERCA && g.time - this.vozT > VOZ_F) {
      if (this.sayVoz()) this.cercaT = g.time;
    }
    this.cerca = near;
  }

  get M() {
    return this.g.world.M;
  }

  // ---------------- los cuadernos ----------------
  buildCuadernos() {
    const g = this.g;
    this.cuadernos = EE.cuadernos.map(([x, z], i) => {
      const hint = x > 74 && x < 80 && z > 26 && z < 36 ? 44.5 : 6;
      const y = g.world.floorAt(x, z, hint);
      const name = PROBADORES[i];
      const top = new THREE.MeshStandardMaterial({ map: cuadernoTex(name, COVERS[i]), roughness: 0.6 });
      const side = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 });
      const edge = new THREE.MeshStandardMaterial({ color: COVERS[i], roughness: 0.6 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.026, 0.29), [side, side, top, edge, side, side]);
      m.position.set(x, y + 0.014, z);
      m.rotation.y = i * 1.3;
      m.castShadow = true;
      this.root.add(m);
      const it = g.interact.add({
        kind: 'patio',
        pos: new THREE.Vector3(x, y + 0.9, z),
        radius: 1.6,
        prompt: () => (this.st.got & (1 << i) ? null : { text: `levantar el cuaderno de ${name}`, noCost: true }),
        cost: () => 0,
        use: () => {
          if (this.st.got & (1 << i)) return false;
          if (isHost(g)) this.send({ a: 'cuaderno', i });
          return true;
        },
      });
      return { m, it, name, y };
    });
  }

  // ---------------- los portales ----------------
  buildPortals() {
    const g = this.g;
    const mk = (pos, day) => {
      const grp = new THREE.Group();
      grp.position.copy(pos);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), portalMat(day));
      disc.position.y = 1.3;
      disc.renderOrder = 6;
      grp.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 10, 48), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3, emissive: day ? 0x403010 : 0x203858, emissiveIntensity: 0.8 }));
      ring.position.y = 1.3;
      grp.add(ring);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.18, 24), this.M.travertino);
      base.position.y = 0.09;
      grp.add(base);
      grp.userData = { disc, ring };
      return grp;
    };
    // en la Sala: mira hacia la escalera (el largo de la sala)
    const sp = SALA.clone();
    sp.y = g.world.floorAt(sp.x, sp.z, 1);
    this.salaPortal = mk(sp, false);
    this.salaPortal.rotation.y = Math.PI / 2;
    this.salaPortal.visible = false;
    this.root.add(this.salaPortal);
    // en el patio: en el medio de la ronda de estatuas
    this.patioPortal = mk(new THREE.Vector3(PATIO.cx, PATIO.y, PATIO.cz), true);
    this.P.root.add(this.patioPortal);
    g.interact.add({
      kind: 'patio',
      local: true,
      pos: new THREE.Vector3(sp.x, sp.y + 1.2, sp.z),
      radius: 1.9,
      wide: true,
      prompt: () => (this.st.open && !this.inside ? { text: 'entrar al portal', noCost: true } : null),
      cost: () => 0,
      use: () => this.travel(true),
    });
    g.interact.add({
      kind: 'patio',
      local: true,
      pos: new THREE.Vector3(PATIO.cx, PATIO.y + 1.2, PATIO.cz),
      radius: 1.9,
      wide: true,
      prompt: () => (this.inside ? { text: 'volver al Monumento', noCost: true } : null),
      cost: () => 0,
      use: () => this.travel(false),
    });
  }

  // Cruzar el portal (cada uno el suyo): un fogonazo blanco y del otro lado.
  travel(toPatio) {
    const g = this.g;
    const P = g.player;
    if (!P.alive || P.downed || P.ride) return false;
    this.flashWhite();
    const A = g.audio;
    if (A?.ctx) {
      const o = A.out({ gain: 0.8, reverb: 0.5 });
      A.noise(o, { t: A.now, dur: 0.9, type: 'bandpass', freq: 600, freqEnd: 2400, q: 1.2, gain: 0.5, attack: 0.05 });
      A.tone(o, { t: A.now, dur: 1.2, type: 'sine', freq: 330, freqEnd: 990, gain: 0.08 });
    }
    if (toPatio) {
      P.pos.copy(ARRIVE);
      P.yaw = 0;
    } else {
      P.pos.set(SALA.x - 1.6, this.salaPortal.position.y, SALA.z);
      P.yaw = -Math.PI / 2;
    }
    P.vel.set(0, 0, 0);
    P.pitch = 0;
    P.airTop = P.pos.y;
    return true;
  }

  flashWhite() {
    const g = this.g;
    if (!this.fadeEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .5s ease;z-index:5';
      (g.hud?.root || document.body).appendChild(el);
      this.fadeEl = el;
    }
    const el = this.fadeEl;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.9s ease';
    el.style.opacity = '0';
  }

  // ---------------- la ronda de estatuas ----------------
  buildRonda() {
    const g = this.g;
    const M = this.M;
    this.statues = [];
    const n = PROBADORES.length + 1;
    for (let i = 0; i < n; i++) {
      // la de Fortu, al norte (mirando al que llega); las otras, en ronda
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const x = PATIO.cx + Math.cos(a) * RONDA_R;
      const z = PATIO.cz + Math.sin(a) * RONDA_R;
      const y = PATIO.y;
      const face = Math.atan2(PATIO.cx - x, PATIO.cz - z);
      const name = i === 0 ? 'Fortu' : PROBADORES[i - 1];
      const ped = new THREE.Group();
      ped.position.set(x, y, z);
      ped.rotation.y = face;
      const stone = M.travertino;
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 1.1), stone);
      p1.position.y = 0.09;
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.82, 0.86), stone);
      p2.position.y = 0.59;
      const p3 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 1.0), stone);
      p3.position.y = 1.06;
      ped.add(p1, p2, p3);
      // la placa con el nombre (en el frente, hacia el portal)
      const tex = toTexture(carvedText(name.toUpperCase(), { w: 512, h: 128, size: 78, spacing: 0.25 }), { repeat: false });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      plate.position.set(0, 0.68, 0.432);
      ped.add(plate);
      ped.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
      this.P.root.add(ped);
      // la estatua: piedra gris, cada una con su material (para que brille la que toma)
      const mat = new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.9, emissive: 0xffb050, emissiveIntensity: 0 });
      const st = probador(i === 0 ? 'heroe' : POSES[name], mat, 0, 1.12, 0, 0, 1.12)[0];
      st.castShadow = true;
      ped.add(st);
      if (i === 0) st.position.y = 1.12 - 2.3;
      g.world.addBox([x - 0.55, y, z - 0.55, x + 0.55, y + 1.12 + (i === 0 ? 0 : 2.1), z + 0.55], { kind: 'prop' });
      const S = { i, name, ped, st, mat, glow: 0, x, z };
      this.statues.push(S);
      // convidarle un mate (desde adelante, del lado del portal)
      const fx = x + Math.sin(face) * 1.0;
      const fz = z + Math.cos(face) * 1.0;
      g.interact.add({
        kind: 'patio',
        pos: new THREE.Vector3(fx, y + 1.2, fz),
        radius: 1.3,
        prompt: () => {
          const st = this.st;
          if (st.fortu) return null;
          if (i === 0) return st.n >= 6 ? { text: 'convidarle un mate al que falta', noCost: true, hold: true } : null;
          return { text: `convidarle un mate a ${name}`, noCost: true };
        },
        cost: () => 0,
        use: () => {
          if (this.st.fortu) return false;
          if (isHost(g)) this.mate(i);
          return true;
        },
      });
    }
  }

  // Saludar a Fortu ya arriba (cada compu la suya: local).
  buildSaludo() {
    const g = this.g;
    const S = this.statues[0];
    const face = Math.atan2(PATIO.cx - S.x, PATIO.cz - S.z);
    g.interact.add({
      kind: 'patio',
      local: true,
      pos: new THREE.Vector3(S.x + Math.sin(face) * 1.0, PATIO.y + 1.2, S.z + Math.cos(face) * 1.0),
      radius: 1.3,
      prompt: () => {
        if (globalThis.__mduNoFortuVoz || this.st.fortu !== 2 || !this.voz) return null;
        if (g.time - this.vozT < VOZ_F) return null;
        return { text: 'saludar a Fortu', noCost: true };
      },
      cost: () => 0,
      use: () => {
        if (this.st.fortu !== 2 || g.time - this.vozT < VOZ_F) return false;
        return this.sayVoz();
      },
    });
  }

  // La ronda de mate (en el anfitrión): en el orden del cartel.
  mate(i) {
    const st = this.st;
    if (i === 0) {
      if (st.n >= 6 && !st.fortu) this.send({ a: 'fortu' });
      return;
    }
    const name = PROBADORES[i - 1];
    if (ORDEN[st.n] === name) this.send({ a: 'ok', i, n: st.n + 1 });
    else this.send({ a: 'lavado', i });
  }

  // ---------------- la pelota ----------------
  buildBall() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f4f0';
    x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#1a1a1a';
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      const cx = (i % 5) * 64 + (i > 4 ? 32 : 0);
      const cy = i > 4 ? 96 : 32;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        x.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
      }
      x.fill();
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.55 }));
    mesh.castShadow = true;
    this.P.root.add(mesh);
    this.ball = { mesh, pos: new THREE.Vector3(PATIO.cx - 5, PATIO.y + BALL_R, PATIO.cz + 7), vel: new THREE.Vector3(), goalT: 0, kickT: 0 };
    mesh.position.copy(this.ball.pos);
  }

  // Patear (cualquiera que la toca corriendo; de invitado se le pide al anfitrión).
  kick(dir, power) {
    const g = this.g;
    if (isHost(g)) {
      const B = this.ball;
      B.vel.x += dir.x * power;
      B.vel.z += dir.z * power;
      B.vel.y = Math.max(B.vel.y, power * 0.18);
      this.sfxKick(B.pos, power);
    } else g.net.net.send({ t: 'pee', k: 'pat', a: 'kick', dx: +dir.x.toFixed(3), dz: +dir.z.toFixed(3), p: +power.toFixed(2) });
  }

  // Un tiro (Weapons.onShot): a la pelota también se le tira.
  onShot(o, d, maxT) {
    if (!this.inside) return;
    const B = this.ball;
    const ox = o.x - B.pos.x;
    const oy = o.y - B.pos.y;
    const oz = o.z - B.pos.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const c = ox * ox + oy * oy + oz * oz - (BALL_R + 0.05) ** 2;
    const h = b * b - c;
    if (h < 0) return;
    const t = -b - Math.sqrt(h);
    if (t < 0 || t > maxT) return;
    this.kick(tmpW.set(d.x, 0, d.z).normalize(), 7);
  }

  updateBall(dt) {
    const g = this.g;
    const B = this.ball;
    const P = PATIO;
    const host = isHost(g);
    // patear: el local la toca (cada uno se fija con su jugador)
    B.kickT -= dt;
    if (this.inside && B.kickT <= 0) {
      const pl = g.player;
      const dx = B.pos.x - pl.pos.x;
      const dz = B.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.62 && Math.abs(B.pos.y - pl.pos.y) < 1.2) {
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        const dir = tmpW.set(dx, 0, dz).normalize();
        B.kickT = 0.3;
        this.kick(dir, 2.2 + sp * 1.25);
      }
    }
    if (host) {
      B.vel.y -= 9.8 * dt;
      B.pos.addScaledVector(B.vel, dt);
      if (B.pos.y < P.y + BALL_R) {
        B.pos.y = P.y + BALL_R;
        if (B.vel.y < -1.5) this.sfxBounce(B.pos, -B.vel.y);
        B.vel.y = -B.vel.y * 0.55;
        if (Math.abs(B.vel.y) < 0.4) B.vel.y = 0;
        // el roce del cemento
        const f = Math.max(0, 1 - dt * 0.9);
        B.vel.x *= f;
        B.vel.z *= f;
      }
      // las paredes del patio (los canteros del fondo y el pasillo, de rebote)
      const lo = [P.x0 + BALL_R, P.z0 + 2.2 + BALL_R];
      const hi = [P.x1 - BALL_R, P.z1 - 6.2 - BALL_R];
      if (B.pos.x < lo[0] || B.pos.x > hi[0]) {
        B.pos.x = Math.max(lo[0], Math.min(hi[0], B.pos.x));
        B.vel.x *= -0.7;
        this.sfxBounce(B.pos, Math.abs(B.vel.x));
      }
      if (B.pos.z < lo[1] || B.pos.z > hi[1]) {
        B.pos.z = Math.max(lo[1], Math.min(hi[1], B.pos.z));
        B.vel.z *= -0.7;
        this.sfxBounce(B.pos, Math.abs(B.vel.z));
      }
      // los pedestales de la ronda
      for (const S of this.statues) {
        const dx = B.pos.x - S.x;
        const dz = B.pos.z - S.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.75 + BALL_R && B.pos.y < P.y + 1.2) {
          const nx = dx / (d || 1);
          const nz = dz / (d || 1);
          B.pos.x = S.x + nx * (0.75 + BALL_R);
          B.pos.z = S.z + nz * (0.75 + BALL_R);
          const vn = B.vel.x * nx + B.vel.z * nz;
          if (vn < 0) {
            B.vel.x -= 1.7 * vn * nx;
            B.vel.z -= 1.7 * vn * nz;
          }
        }
      }
      // ¡gol! (entre los palos, debajo del travesaño)
      B.goalT -= dt;
      if (B.goalT <= 0) {
        for (const G of this.P.goals) {
          const inX = G.s < 0 ? B.pos.x < G.x : B.pos.x > G.x;
          if (inX && Math.abs(B.pos.z - G.z) < G.half - BALL_R && B.pos.y < P.y + 2.0) {
            B.goalT = 3;
            this.send({ a: 'gol', s: G.s });
            break;
          }
        }
        if (B.goalT > 0 && B.goalT < 3) {
          /* (esperando para volver al medio) */
        }
      } else if (B.goalT < 1.0 && B.goalT + dt >= 1.0) {
        // la pelota vuelve al medio
        B.pos.set(P.cx - 5, P.y + 1.5, P.cz + 7);
        B.vel.set(0, 0, 0);
      }
      // a los demás, de a ratos
      this.syncT -= dt;
      if (this.syncT <= 0 && g.net) {
        this.syncT = 0.1;
        g.net.event('pee', { k: 'pat', a: 'ball', p: B.pos.toArray().map((v) => +v.toFixed(2)), v: B.vel.toArray().map((v) => +v.toFixed(2)) });
      }
    } else {
      // (el invitado: sigue lo que manda el anfitrión, y entre medio la mueve él)
      B.vel.y -= 9.8 * dt;
      B.pos.addScaledVector(B.vel, dt);
      if (B.pos.y < P.y + BALL_R) {
        B.pos.y = P.y + BALL_R;
        B.vel.y = 0;
      }
    }
    B.mesh.position.copy(B.pos);
    const sp = Math.hypot(B.vel.x, B.vel.z);
    if (sp > 0.01) B.mesh.rotateOnWorldAxis(tmpV.set(B.vel.z, 0, -B.vel.x).normalize(), (sp * dt) / BALL_R);
  }

  // ---------------- el timbre ----------------
  buildBell() {
    const g = this.g;
    const b = this.P.bell.position;
    g.interact.add({
      kind: 'patio',
      pos: new THREE.Vector3(b.x, PATIO.y + 1.3, PATIO.z0 + 1.0),
      radius: 2.2,
      wide: true,
      prompt: () => (this.inside ? { text: 'tocar el timbre', noCost: true } : null),
      cost: () => 0,
      use: () => {
        if (isHost(g)) this.send({ a: 'timbre' });
        else g.net.net.send({ t: 'pee', k: 'pat', a: 'timbre' });
        return true;
      },
    });
  }

  // El timbre eléctrico del recreo (un rato largo).
  sfxTimbre(len = 2.2) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: this.P.bell.getWorldPosition(tmpV), gain: 1, reverb: 0.6, ref: 8 });
    for (let t = 0; t < len; t += 0.034) A.tone(o, { t: A.now + t, dur: 0.03, type: 'square', freq: 880 + Math.sin(t * 40) * 30, gain: 0.05 });
    A.noise(o, { t: A.now, dur: len, type: 'bandpass', freq: 2600, q: 3, gain: 0.08 });
  }

  sfxKick(p, k) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: p, gain: Math.min(1, 0.3 + k * 0.06), reverb: 0.3, ref: 4 });
    A.noise(o, { t: A.now, dur: 0.08, type: 'lowpass', freq: 700, gain: 0.8 });
    A.tone(o, { t: A.now, dur: 0.09, type: 'sine', freq: 140, freqEnd: 70, gain: 0.4 });
  }

  sfxBounce(p, k) {
    if (k < 0.8) return;
    const A = this.g.audio;
    if (!A?.ctx) return;
    const o = A.out({ pos: p, gain: Math.min(0.8, k * 0.12), reverb: 0.4, ref: 4 });
    A.tone(o, { t: A.now, dur: 0.07, type: 'sine', freq: 210, freqEnd: 120, gain: 0.35 });
  }

  // ---------------- la red ----------------
  send(m) {
    const g = this.g;
    if (!isHost(g)) return;
    this.apply(m);
    g.net?.event('pee', { k: 'pat', ...m });
  }

  onGuest(m, from) {
    if (m.a === 'kick') {
      const B = this.ball;
      B.vel.x += m.dx * m.p;
      B.vel.z += m.dz * m.p;
      B.vel.y = Math.max(B.vel.y, m.p * 0.18);
      this.sfxKick(B.pos, m.p);
    } else if (m.a === 'timbre') this.send({ a: 'timbre' });
    void from;
  }

  apply(m) {
    const g = this.g;
    const st = this.st;
    switch (m.a) {
      case 'cuaderno': {
        if (st.got & (1 << m.i)) return;
        st.got |= 1 << m.i;
        this.cuadernos[m.i].m.visible = false;
        const n = this.count();
        g.audio.powerupGrab?.();
        g.hud.toast?.(`El cuaderno de ${PROBADORES[m.i]} (${n}/6)`);
        if (n === 6 && isHost(g)) this.send({ a: 'open' });
        break;
      }
      case 'open':
        if (st.open) return;
        st.open = 1;
        this.salaPortal.visible = true;
        g.fx.flash(this.salaPortal.position.clone().setY(this.salaPortal.position.y + 1.3), 0xfff0c0, 40, 0.8, 12);
        g.hud.subtitle?.('Se abrió algo en la Sala de las Banderas.', 4);
        break;
      case 'ok': {
        st.n = m.n;
        const S = this.statues[m.i];
        S.glow = 1;
        g.fx.steam(tmpV.set(S.x, PATIO.y + 2.6, S.z), 6, 0.2);
        g.audio.pour?.(0.6);
        if (st.n >= 6) g.hud.subtitle?.('Falta uno en la ronda.', 3);
        break;
      }
      case 'lavado':
        st.n = 0;
        for (const S of this.statues) S.glow = 0;
        g.audio.deny?.();
        g.hud.subtitle?.('Se lavó el mate. La ronda va en el orden del cartel.', 3.5);
        break;
      case 'fortu':
        if (st.fortu) return;
        st.fortu = 1;
        this.riseT = 0;
        this.riseDone = false;
        this.sfxTimbre(3.5);
        break;
      case 'fortuUp':
        // (el aviso del anfitrión puede llegar antes de que acá termine de
        // subir: termina ya, con su fogonazo y su voz; antes se los salteaba)
        if (st.fortu === 1 && !globalThis.__mduNoFortuVoz) this.riseEnd();
        st.fortu = 2;
        break;
      case 'gol': {
        const G = this.P.goals.find((x) => x.s === m.s) || this.P.goals[0];
        g.hud.subtitle?.('¡GOOOL!', 2.5);
        this.sfxTimbre(1.2);
        const p = tmpV.set(G.x, PATIO.y + 1.4, G.z);
        for (let k = 0; k < 4; k++) g.fx.sparkle(p, [[1, 0.85, 0.3], [0.45, 0.72, 1], [1, 1, 1], [0.9, 0.3, 0.4]][k], 14, 1.2);
        if (!isHost(g)) this.ball.goalT = 3;
        break;
      }
      case 'ball': {
        const B = this.ball;
        B.pos.set(m.p[0], m.p[1], m.p[2]);
        B.vel.set(m.v[0], m.v[1], m.v[2]);
        break;
      }
      case 'timbre':
        this.sfxTimbre();
        break;
      default:
    }
  }

  count() {
    let n = 0;
    for (let i = 0; i < 6; i++) if (this.st.got & (1 << i)) n++;
    return n;
  }

  // ---------------- el día del patio ----------------
  applyDay() {
    const g = this.g;
    const w = g.world;
    const fog = g.scene.fog;
    if (!this.saved) {
      this.saved = {
        hemi: [w.hemi.intensity, w.hemi.color.getHex(), w.hemi.groundColor.getHex()],
        amb: w.ambient.intensity,
        moon: w.moon ? [w.moon.intensity, w.moon.color.getHex(), w.moon.position.clone(), w.moon.target.position.clone()] : null,
        bg: g.scene.background,
        bloom: g.post?.bloom?.threshold,
      };
      if (w.moon) g.renderer.shadowMap.needsUpdate = true;
    }
    if (fog) {
      fog.color.set(0xc6d8ec);
      if (fog.isFogExp2) fog.density = 0.0042;
    }
    if (w.sky) w.sky.visible = false;
    for (const o of [w.moonSprite, w.moonHalo, w.sunSprite]) if (o) o.visible = false;
    g.scene.background = this.dayBg ||= new THREE.Color(0x8fbbea);
    w.hemi.intensity = 1.35;
    w.hemi.color.set(0xd2e6ff);
    w.hemi.groundColor.set(0x9a8a70);
    w.ambient.intensity = 0.62;
    if (w.moon) {
      w.moon.intensity = 2.5;
      w.moon.color.set(0xfff0d6);
      w.moon.position.set(PATIO.cx + 30, PATIO.y + 60, PATIO.cz - 22);
      w.moon.target.position.set(PATIO.cx, PATIO.y, PATIO.cz);
      w.moon.target.updateMatrixWorld();
    }
    if (g.post?.bloom) g.post.bloom.threshold = 1.6;
    if (w.mon?.fog?.root) w.mon.fog.root.visible = false;
  }

  restoreDay() {
    const g = this.g;
    const w = g.world;
    const S = this.saved;
    if (!S) return;
    this.saved = null;
    w.hemi.intensity = S.hemi[0];
    w.hemi.color.setHex(S.hemi[1]);
    w.hemi.groundColor.setHex(S.hemi[2]);
    w.ambient.intensity = S.amb;
    if (w.moon && S.moon) {
      w.moon.intensity = S.moon[0];
      w.moon.color.setHex(S.moon[1]);
      w.moon.position.copy(S.moon[2]);
      w.moon.target.position.copy(S.moon[3]);
      w.moon.target.updateMatrixWorld();
      g.renderer.shadowMap.needsUpdate = true;
    }
    g.scene.background = S.bg;
    if (g.post?.bloom && S.bloom != null) g.post.bloom.threshold = S.bloom;
    if (w.sky) w.sky.visible = true;
    for (const o of [w.moonSprite, w.moonHalo]) if (o) o.visible = true;
    if (w.mon?.fog?.root) w.mon.fog.root.visible = true;
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const st = this.st;
    const t = g.time || 0;
    PORTAL_T.value = t;
    // (el día del patio va después del clima: Weather pisa la niebla en cada
    // cuadro; el clima se arma después del easter egg, por eso acá)
    const W = g.weather;
    if (W && !this.weatherUpdate) {
      this.weatherUpdate = W.update.bind(W);
      W.update = (d) => {
        this.weatherUpdate(d);
        if (this.inside) this.applyDay();
      };
    }
    const P = g.player.pos;
    const inside = P.y > PATIO.y - 5 && P.x > PATIO.x0 - 1 && P.x < PATIO.x1 + 1 && P.z > PATIO.z0 - 1 && P.z < PATIO.z1 + 1;
    if (inside !== this.inside) {
      this.inside = inside;
      this.P.root.visible = inside;
      if (inside) {
        this.applyDay();
        g.hud.location?.('El patio de la 2043', 'Colegio San José · Rosario');
      } else this.restoreDay();
    }
    // los cuadernos brillan apenas (de a ratos)
    for (const C of this.cuadernos) if (C.m.visible && Math.random() < dt * 0.6) g.fx.sparkle(tmpV.copy(C.m.position).setY(C.y + 0.1), [1, 0.95, 0.75], 1, 0.15);
    // los portales
    for (const Pt of [this.salaPortal, this.patioPortal]) {
      if (!Pt.visible) continue;
      Pt.userData.ring.rotation.z = t * 0.4;
      Pt.userData.disc.scale.setScalar(1 + Math.sin(t * 2.3) * 0.02);
    }
    if (this.salaPortal.visible && Math.random() < dt * 4) g.fx.sparkle(tmpV.copy(this.salaPortal.position).setY(this.salaPortal.position.y + 1.3 + (Math.random() - 0.5) * 2), [1, 0.92, 0.7], 1, 0.6);
    // la pelota la mueve el anfitrión mientras haya alguien en el patio (y el
    // invitado que está adentro la adelanta entre mensaje y mensaje)
    const anyIn = players(g).some((p) => p.pos.y > PATIO.y - 5);
    if ((isHost(g) && anyIn) || (!isHost(g) && inside)) this.updateBall(dt);
    if (!inside && !st.fortu) return this.holdRounds();
    // las estatuas que ya tomaron brillan tibio
    for (const S of this.statues) {
      const want = S.i > 0 && S.i <= 6 && S.glow ? 0.35 + Math.sin(t * 2 + S.i) * 0.08 : 0;
      S.mat.emissiveIntensity += (want - S.mat.emissiveIntensity) * Math.min(1, dt * 3);
    }
    if (inside) {
      // los pájaros del mediodía
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 1.5 + Math.random() * 4;
        const A = g.audio;
        if (A?.ctx) {
          const o = A.out({ pos: tmpV.set(PATIO.x0 + Math.random() * 30, PATIO.y + 8, PATIO.z0 + Math.random() * 26), gain: 0.35, reverb: 0.3, ref: 10 });
          const f = 2600 + Math.random() * 1600;
          for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) A.tone(o, { t: A.now + k * 0.11, dur: 0.07, type: 'sine', freq: f, freqEnd: f * 1.25, gain: 0.05 });
        }
      }
    }
    // Fortu sube del pedestal
    if (st.fortu === 1) this.updateRise(dt);
    else if (inside) this.vozCerca();
    this.holdRounds();
  }

  // Mientras todos están en el patio, las rondas esperan (lo hace el anfitrión).
  holdRounds() {
    const g = this.g;
    if (!isHost(g)) return;
    const list = players(g).filter((p) => !p.downed);
    if (!list.length) return;
    const all = list.every((p) => p.pos.y > PATIO.y - 5);
    if (!all) return;
    const R = g.rounds;
    // (la ronda en juego es 'active': con 'playing' nunca se frenaba y seguían saliendo)
    if (R.state === (globalThis.__mduNoPatioHold ? 'playing' : 'active')) R.spawnT = Math.max(R.spawnT || 0, 2);
    else if (R.breakT != null) R.breakT = Math.max(R.breakT, 2);
  }

  // La subida de Fortu: tiembla, el haz del cielo, se raja el pedestal y sale.
  updateRise(dt) {
    const g = this.g;
    const S = this.statues[0];
    this.riseT += dt;
    const t = this.riseT;
    const k = Math.max(0, Math.min(1, (t - 1.8) / (RISE_T - 2.8)));
    const e = 1 - (1 - k) * (1 - k);
    S.st.position.y = 1.12 - 2.3 * (1 - e);
    S.st.rotation.y = (1 - e) * Math.PI * 2;
    S.mat.emissiveIntensity = t < RISE_T ? 0.9 * Math.min(1, t) : Math.max(0, S.mat.emissiveIntensity - dt * 0.5);
    const top = tmpV.set(S.x, PATIO.y + 1.2, S.z);
    if (t < RISE_T) {
      g.fx.addShake(dt * 0.6);
      if (Math.random() < dt * 25) g.fx.sparks(top, 0.6, { x: (Math.random() - 0.5) * 2, y: 1, z: (Math.random() - 0.5) * 2 }, [1, 0.85, 0.5]);
      if (Math.random() < dt * 10) g.fx.dust?.(top, { x: 0, y: 1, z: 0 }, [0.7, 0.68, 0.6], 6);
    }
    if (t - dt < 0.4 && t >= 0.4) g.fx.beam(tmpW.set(S.x, PATIO.y + 60, S.z), top.clone(), { color: 0xfff2c8, width: 1.4, life: RISE_T - 0.4 });
    if (t - dt < RISE_T && t >= RISE_T) this.riseEnd();
  }

  // Arriba: el fogonazo, el papel picado, el timbre, su voz y el cartel (una vez).
  riseEnd() {
    const g = this.g;
    if (this.riseDone) return;
    this.riseDone = true;
    const S = this.statues[0];
    S.st.position.y = 1.12;
    S.st.rotation.y = 0;
    g.fx.flash(tmpV.set(S.x, PATIO.y + 3, S.z), 0xfff2c8, 60, 0.8, 22);
    for (let n = 0; n < 5; n++) g.fx.sparkle(tmpW.set(S.x + (Math.random() - 0.5) * 3, PATIO.y + 2 + Math.random() * 2, S.z + (Math.random() - 0.5) * 3), [[1, 0.85, 0.3], [0.45, 0.72, 1], [1, 1, 1], [0.9, 0.3, 0.4], [0.5, 1, 0.6]][n], 30, 1.5);
    this.sfxTimbre(1.5);
    // y habla (una vez, en todas las compus)
    this.sayVoz();
    this.cercaT = g.time;
    g.hud.achievement?.('Fortu', 'El que faltaba en la ronda');
    if (isHost(g)) this.send({ a: 'fortuUp' });
  }

  state() {
    return { ...this.st };
  }

  applyFull(s) {
    if (!s) return;
    Object.assign(this.st, s);
    this.cuadernos.forEach((C, i) => (C.m.visible = !(this.st.got & (1 << i))));
    this.salaPortal.visible = !!this.st.open;
    for (const S of this.statues) S.glow = S.i > 0 && ORDEN.indexOf(S.name) < this.st.n ? 1 : 0;
    if (this.st.fortu) {
      this.statues[0].st.position.y = 1.12;
      this.statues[0].st.rotation.y = 0;
      this.st.fortu = 2;
    }
  }

  dispose() {
    if (this.inside) this.restoreDay();
    if (this.weatherUpdate && this.g.weather) this.g.weather.update = this.weatherUpdate;
    this.fadeEl?.remove();
    this.root.removeFromParent();
    this.P.root.removeFromParent();
  }
}
