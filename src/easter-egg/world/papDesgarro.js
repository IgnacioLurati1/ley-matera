import * as THREE from 'three';
import { EE, ZONES } from '../config/map';
import { ISLANDS, PAP, PORTALS } from '../config/maps/eclipse';
import { assetUrl } from '../../lib/assets';
import PapGrietas from './papGrietas';

// El paso previo del Pack-a-Pava en Eclipse Matero. El Pack-a-Pava está en La
// Disformidad: otra dimensión, oscura y violeta, con susurros y muertos
// deformes, a la que solo se llega por el portal sellado del claro
// (world/eclipsePortals.js, EE.desgarroPortal). Tres actos:
//  I.  "Las cuatro grietas" (2026-10-10, world/papGrietas.js): una grieta en el
//      Molino, otra en La Tapera, otra en el Penal y otra en la Torre. Cada una
//      lleva a un jirón de la dimensión oscura donde se aguanta un encierro de
//      30 s; al salir se cose y suelta un objeto. Los cuatro objetos van a los
//      pilares del Nudo y el portal sellado se abre.
//      (Antes, y con globalThis.__mduOldPapGrietas === true al cargar: "las tres
//      cicatrices" del claro, que se cerraban a tiros con la luz prendida.)
//  II. "Los cuatro ojos" (en la Disformidad): alrededor del Pack-a-Pava hay
//      cuatro ojos cerrados. Cada uno se abre con el caos de los muertos que
//      caen a su lado (bajas a menos de 7 m; escala con los jugadores).
//  III. "El ritual" (mantener F en el Pack-a-Pava con los cuatro ojos abiertos):
//      la dimensión se sacude, la horda aprieta y hay que quedarse adentro de un
//      círculo de luz que se achica alrededor de la máquina durante 60 s. Al
//      final el Pack-a-Pava despierta (q.finish) y funciona como siempre.
// Lo arma world/PapQuest.js (kind 'desgarro') en el lugar de las termas del
// castillo: prompt, use, update, state/apply, onGuest, complete, onShot y
// onExplosion; onKill lo llama entities/EclipseEgg.js. Lo decide el anfitrión;
// los invitados mandan sus impactos por 'papq' ({ sc: i, n }) y el pedido del
// ritual ({ rit: 1 }).

const SCARS = [
  [-11, 2.6, -7],
  [10, 3.1, -5],
  [0, 2.3, 11],
];
const HITS_BASE = 6;
const R = 0.9;
// los ojos: alrededor de la máquina, cuántas bajas abre cada uno (por jugador)
// (adelante de la máquina, que está en el borde norte de la isla: atrás es vacío)
const EYES = [[-7, 0, 2], [7, 0, 2], [-5, 0, 9], [5, 0, 9]];
const EYE_KILLS = 6;
const EYE_R = 7;
// el ritual: segundos y el círculo que se achica
const RIT_SECS = 60;
const RIT_R0 = 9;
const RIT_R1 = 3.6;
// los susurros en un jirón de las grietas: más bajo (world/eclipseAtmos `rift`)
const RIFT_GAIN = 0.45;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const FRAG = /* glsl */ `
  uniform float uTime, uK, uFlash, uSeed;
  varying vec2 vUv;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float beat = 0.5 + 0.5 * sin(uTime * (2.0 + 4.0 * uK) + uSeed * 9.0);
    // una almendra fina que late; se va cerrando con uK
    float jag = (h2(vec2(floor(p.y * 7.0 + uSeed * 3.0), 1.0)) - 0.5) * 0.12;
    float hw = (0.16 + 0.06 * beat) * (1.0 - uK * 0.85) * max(1.0 - p.y * p.y, 0.0);
    float d = abs(p.x - jag) - hw;
    float core = exp(-abs(d) * 22.0);
    float glow = exp(-max(d, 0.0) * 6.0);
    float ins = 1.0 - smoothstep(-0.02, 0.0, d);
    vec3 col = vec3(1.4, 1.0, 2.0) * core + vec3(0.5, 0.15, 1.0) * glow * 0.6 + vec3(0.03, 0.0, 0.06) * ins;
    col *= 1.0 + uFlash * 2.5;
    float a = max(ins, glow * 0.4) * smoothstep(1.15, 0.95, abs(p.y));
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * a, a);
  }
`;
// un ojo en el piso: párpado que se abre con uK, iris violeta, pupila negra
const FRAG_EYE = /* glsl */ `
  uniform float uTime, uK, uFlash, uSeed;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float open = 0.08 + 0.92 * uK;
    // la almendra del ojo
    float lid = 1.0 - p.x * p.x;
    float inside = step(abs(p.y), lid * open);
    float r = length(p * vec2(1.0, 1.0 / max(open, 0.08)));
    float iris = smoothstep(0.62, 0.55, r) * inside;
    float pupil = smoothstep(0.26, 0.2, r) * inside;
    float rim = smoothstep(0.03, 0.0, abs(abs(p.y) - lid * open)) * step(abs(p.x), 1.0);
    float beat = 0.6 + 0.4 * sin(uTime * 1.7 + uSeed * 5.0);
    vec3 col = vec3(0.55, 0.12, 1.0) * iris * (0.8 + 0.6 * beat) * uK + vec3(0.9, 0.3, 1.2) * rim * (0.4 + 0.6 * uK) + vec3(0.02, 0.0, 0.05) * inside;
    col *= 1.0 - pupil;
    col *= 1.0 + uFlash * 2.0;
    float a = max(inside * 0.9, rim) * step(r * 0.0 + length(p), 1.05);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * a, a);
  }
`;
// el círculo del ritual: un anillo que late
const FRAG_RING = /* glsl */ `
  uniform float uTime, uK, uFlash, uSeed;
  varying vec2 vUv;
  void main() {
    float r = length((vUv - 0.5) * 2.0);
    float ring = smoothstep(0.06, 0.0, abs(r - 0.96)) + 0.25 * exp(-abs(r - 0.96) * 10.0);
    float beat = 0.7 + 0.3 * sin(uTime * 6.0 - r * 20.0);
    vec3 col = vec3(0.7, 0.25, 1.3) * ring * beat * (0.5 + uK) + vec3(0.2, 0.05, 0.4) * exp(-r * 3.0) * 0.4;
    float a = ring * 0.8 + exp(-r * 3.0) * 0.15;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * a, a);
  }
`;
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false };

function rayHits(origin, dir, maxT, center, r) {
  const t = tmpV.subVectors(center, origin).dot(dir);
  if (t < 0 || t > maxT + r) return false;
  return tmpV2.copy(origin).addScaledVector(dir, t).distanceTo(center) < r;
}

export default class PapDesgarro {
  constructor(q) {
    this.q = q;
    this.g = q.g;
    const g = this.g;
    const w = g.world;
    const C = ISLANDS.centro.center;
    this.root = new THREE.Group();
    this.root.name = 'papDesgarro';
    g.scene.add(this.root);
    this.time = { value: 0 };
    const mat = (frag, seed) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { uTime: this.time, uK: { value: 0 }, uFlash: { value: 0 }, uSeed: { value: seed } }, side: THREE.DoubleSide, ...PREMUL });
    // I. las cuatro grietas (world/papGrietas.js); con __mduOldPapGrietas, las cicatrices del claro
    this.gr = globalThis.__mduOldPapGrietas === true ? null : new PapGrietas(this);
    this.scars = (this.gr ? [] : SCARS).map(([dx, dy, dz], i) => {
      const x = C[0] + dx;
      const z = C[1] + dz;
      const y = w.floorAt(x, z) + dy;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), mat(FRAG, i * 0.37));
      m.position.set(x, y, z);
      m.rotation.y = i * 2.1;
      this.root.add(m);
      return { i, center: new THREE.Vector3(x, y, z), mesh: m, mat: m.material, hits: 0, closed: false, flash: 0 };
    });
    // II. los ojos alrededor del Pack-a-Pava (en La Disformidad)
    const px = PAP.cell[0] + 0.5 + PAP.face[0] * 1.2;
    const pz = PAP.cell[1] + 0.5 + PAP.face[1] * 1.2;
    this.pap = new THREE.Vector3(px, PAP.y, pz);
    this.eyes = EYES.map(([dx, , dz], i) => {
      const x = px + dx;
      const z = pz + dz;
      const y = w.floorAt(x, z, PAP.y + 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5).rotateX(-Math.PI / 2), mat(FRAG_EYE, 2 + i * 0.41));
      m.position.set(x, y + 0.03, z);
      m.rotation.y = Math.atan2(px - x, pz - z);
      m.material.polygonOffset = true;
      m.material.polygonOffsetFactor = -2;
      this.root.add(m);
      return { i, center: new THREE.Vector3(x, y, z), mesh: m, mat: m.material, kills: 0, open: false, flash: 0 };
    });
    // III. el círculo del ritual
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat(FRAG_RING, 7));
    this.ring.position.set(px, w.floorAt(px, pz, PAP.y + 1) + 0.04, pz);
    this.ring.visible = false;
    this.root.add(this.ring);
    // rit: 0 nada, 1 en curso, 2 hecho; ritT: segundos; ritK: avance 0-1
    this.rit = 0;
    this.ritT = 0;
    this.ritK = 0;
    this.hintT = 0;
    // (qa-flujo) la boca de este lado de la grieta sellada: al acercarse, qué hacer
    const RP = PORTALS.find((x) => x.id === EE.desgarroPortal);
    this.riftAt = RP ? new THREE.Vector3(RP.a.pos[0], 0, RP.a.pos[1]) : null;
    this.nearRift = false;
    this.whisper = null;
    this.bakeWhisper();
    this.loadWhispers();
  }

  // (2026-10-07, ITERACION-6 D1, el usuario: "la dimensión oscura no da
  // prácticamente miedo y los susurros brillan por su ausencia, buscá mejores
  // sonidos". Los de antes eran ruido filtrado. Ahora voces de verdad: dos
  // grabaciones de voz susurrada de dominio público (CC0, Wikimedia Commons:
  // Thorsten Müller y Mx. Granger) armadas en un lazo de 40 s de muchas voces,
  // diez voces sueltas y una al oído (scratchpad gen_susurros/gen.py).
  // globalThis.__mduOldDimWhisper: los sintetizados de antes)
  loadWhispers() {
    const a = this.g.audio;
    if (!a?.ctx || globalThis.__mduOldDimWhisper === true) return;
    this.wbuf = { voz: [] };
    const get = (name) =>
      fetch(assetUrl(`/assets/sotano/sfx/${name}.mp3`))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => a.ctx.decodeAudioData(ab))
        .catch(() => null);
    get('dim-susurros').then((b) => b && (this.wbuf.bed = b));
    get('dim-oido').then((b) => b && (this.wbuf.oido = b));
    for (let k = 1; k <= 10; k++) get(`dim-voz-${k}`).then((b) => b && this.wbuf.voz.push(b));
  }

  // ---------------- lo que se escucha: los susurros de la Disformidad ----------------
  bakeWhisper() {
    const a = this.g.audio;
    if (!a?.ctx || !a.bakeSound) return;
    // un lazo de 6 s: soplidos filtrados que suben y bajan, como voces sin palabras
    a.bakeSound('dim-susurro', 6, function (o, t) {
      for (let i = 0; i < 14; i++) {
        const t0 = t + (i / 14) * 5.6 + Math.random() * 0.2;
        const f = 700 + Math.random() * 1600;
        this.noise(o, { t: t0, dur: 0.35 + Math.random() * 0.5, type: 'bandpass', freq: f, freqEnd: f * (0.6 + Math.random() * 0.9), q: 6 + Math.random() * 6, gain: 0.08 + Math.random() * 0.08, attack: 0.12 });
      }
      this.tone(o, { t, dur: 6, type: 'sine', freq: 46, freqEnd: 52, gain: 0.05, attack: 1 });
    });
  }

  whispers(on) {
    const a = this.g.audio;
    // (al entrar o salir de un jirón de las grietas el lazo vuelve a arrancar con su volumen)
    const rift = on && this.g.weather?.atmos?.rift ? 1 : 0;
    if (on && this.whisper && rift !== (this.whisperRift || 0)) {
      this.whisper.stop?.(1.2);
      this.whisper = null;
    }
    if (on) this.whisperRift = rift;
    if (on && !this.whisper) {
      const ab = this.g.weather?.atmos?.abyss || 0;
      // (2026-10-10, el usuario, de los jirones de las grietas: "sonarán los
      // sonidos de la disformidad pero más bajito")
      const low = this.whisperRift ? RIFT_GAIN : 1;
      // (las voces grabadas, si ya bajaron: el lazo de 40 s, desde un lugar al azar)
      const bed = this.wbuf?.bed;
      if (bed && a.guns?.loopBuf) {
        this.whisper = a.guns.loopBuf(bed, null, { gain: (ab > 0.5 ? 0.6 : 0.38) * low, reverb: 0.25, ref: 4, fadeIn: 2.5, from: 0, to: bed.duration, offset: Math.random() * bed.duration });
        this.watchWhisper();
        return;
      }
      const buf = a?.ctx && a.bakedBuf?.('dim-susurro');
      // (más fuerte en La Disformidad de afuera: mundo, it. 4)
      if (buf && a.guns?.loopBuf) this.whisper = a.guns.loopBuf(buf, null, { gain: (ab > 0.5 ? 1.6 : 0.9) * low, reverb: 0.5, ref: 4, fadeIn: 1.2, from: 0, to: buf.duration });
      this.watchWhisper();
    } else if (!on && this.whisper) {
      this.whisper.stop?.();
      this.whisper = null;
    }
  }

  // (2026-10-09, el usuario: "los susurros están bugueados, volvés al menú y
  // siguen sonando": el lazo se apaga desde update(), y en el menú update ya
  // no corre. Un vigía aparte: fuera de la partida, se calla.
  // globalThis.__mduOldDimWhisper: sin vigía, como antes)
  watchWhisper() {
    if (!this.whisper || this.whisperWatch || globalThis.__mduOldDimWhisper === true) return;
    const g = this.g;
    this.whisperWatch = setInterval(() => {
      if (this.whisper && (g.state === 'playing' || g.state === 'paused')) return;
      clearInterval(this.whisperWatch);
      this.whisperWatch = null;
      if (this.whisper) this.whispers(false);
    }, 400);
  }

  need() {
    const r = this.g.rounds?.round || 1;
    return HITS_BASE + Math.min(10, Math.floor(r / 2));
  }

  nPlayers() {
    return 1 + (this.g.net ? this.g.net.remote.size : 0);
  }

  eyeNeed() {
    return EYE_KILLS * this.nPlayers();
  }

  // (el acto I hecho: las cuatro grietas —o, como antes, las tres cicatrices—)
  allScars() {
    return this.gr ? this.gr.done() : this.scars.every((s) => s.closed);
  }

  // Qué falta del acto I y dónde (lo dice Fierro y el aviso de la guadaña).
  hintI() {
    if (!this.gr) return this.g.world.power ? 'Tres cicatrices flotan en el claro: cerralas a tiros. Abren el portal negro del Nudo.' : 'Para la Disformidad, primero la luz: el tablero del galpón del Molino.';
    return this.gr.hint();
  }

  // (los atajos de prueba, core/music.js) el acto I hecho de una
  skipI() {
    if (this.gr) {
      this.gr.complete();
      if (!this.g.net?.guest) this.g.ee?.portals?.unlock(EE.desgarroPortal);
    } else for (const sc of this.scars) this.applyHit(sc.i, this.need(), true);
  }

  allEyes() {
    return this.eyes.every((e) => e.open);
  }

  // ---------------- el cartel y el uso (en el Pack-a-Pava) ----------------
  prompt() {
    if (this.q.done) return null;
    if (!this.allScars()) return { text: !this.g.world.power ? 'Necesita electricidad' : this.gr ? `Faltan los pilares del Nudo: ${this.gr.placedN()} de 4` : 'Cerrá las tres cicatrices del claro', noCost: true, info: true };
    if (!this.allEyes()) return { text: `Abrí los cuatro ojos: ${this.eyes.filter((e) => e.open).length} de 4`, noCost: true, info: true };
    if (this.rit === 1) return null;
    return { text: 'empezar el ritual', noCost: true, hold: true };
  }

  use() {
    if (this.q.done || !this.allScars() || !this.allEyes() || this.rit) return false;
    if (this.g.net?.guest) {
      this.g.net.net.send({ t: 'papq', rit: 1 });
      return true;
    }
    this.startRitual();
    return true;
  }

  hint(text) {
    if (this.hintT > 0) return;
    this.hintT = 3;
    this.g.hud?.subtitle?.(text, 2.5);
  }

  // ---------------- I. las cicatrices ----------------
  onShot(origin, dir, maxT) {
    for (const s of this.scars) {
      if (s.closed) continue;
      if (rayHits(origin, dir, maxT, s.center, R)) this.hit(s, 1);
    }
  }

  onExplosion(pos, radius) {
    for (const s of this.scars) if (!s.closed && pos.distanceTo(s.center) < radius * 0.8 + R) this.hit(s, 3);
  }

  hit(s, n) {
    const g = this.g;
    s.flash = 1;
    g.fx.sparkle?.(s.center, [0.8, 0.5, 1], 3, 0.35);
    if (!g.world.power) return this.hint('Sin luz, la cicatriz ni se inmuta.');
    if (g.net?.guest) {
      g.net.net.send({ t: 'papq', sc: s.i, n });
      return;
    }
    this.damage(s.i, n);
  }

  // (anfitrión)
  damage(i, n) {
    const s = this.scars[i];
    if (!s || s.closed) return;
    s.hits += n;
    const closed = s.hits >= this.need();
    this.g.net?.event('papq', { sc: i, h: s.hits, c: closed ? 1 : 0 });
    this.applyHit(i, s.hits, closed);
  }

  applyHit(i, hits, closed) {
    const s = this.scars[i];
    if (!s) return;
    s.hits = hits;
    if (closed && !s.closed) {
      s.closed = true;
      this.g.fx.sparkle?.(s.center, [1, 0.8, 1], 14, 0.7);
      this.g.audio?.door?.(s.center, true);
      const left = this.scars.filter((x) => !x.closed).length;
      this.g.hud?.subtitle?.(left ? `Una cicatriz cerrada. Faltan ${left}.` : 'Las tres cicatrices cerradas. El portal negro del Nudo se abre.', 3.5);
      // el portal sellado se abre (lo manda el anfitrión)
      if (!left) this.g.ee?.portals?.unlock(EE.desgarroPortal);
    }
  }

  // ---------------- II. los ojos ----------------
  // (el anfitrión) un muerto cayó: si fue al lado de un ojo cerrado, lo alimenta
  onKill(z) {
    if (this.q.done || !this.allScars() || this.allEyes() || this.g.net?.guest || !z?.pos) return;
    let best = null;
    let bd = EYE_R;
    for (const e of this.eyes) {
      if (e.open) continue;
      const d = Math.hypot(z.pos.x - e.center.x, z.pos.z - e.center.z);
      if (d < bd && Math.abs(z.pos.y - e.center.y) < 4) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    const k = best.kills + 1;
    const open = k >= this.eyeNeed();
    this.g.net?.event('papq', { eye: best.i, k, o: open ? 1 : 0 });
    this.applyEye(best.i, k, open);
  }

  applyEye(i, kills, open) {
    const e = this.eyes[i];
    if (!e) return;
    e.kills = kills;
    e.flash = 1;
    if (open && !e.open) {
      e.open = true;
      this.g.fx.sparkle?.(e.center.clone().add(new THREE.Vector3(0, 0.6, 0)), [0.9, 0.3, 1], 16, 0.8);
      this.g.world.eclipse?.pulse?.();
      const left = this.eyes.filter((x) => !x.open).length;
      this.g.hud?.subtitle?.(left ? `Un ojo se abre. Faltan ${left}.` : 'Los cuatro ojos miran. El Pack-a-Pava espera el ritual.', 3.5);
    }
  }

  // ---------------- III. el ritual ----------------
  startRitual(quiet = false) {
    if (this.rit) return;
    this.rit = 1;
    this.ritT = 0;
    this.ritK = 0;
    this.ring.visible = true;
    const g = this.g;
    if (!g.net?.guest) g.net?.event('papq', { rit: 1 });
    if (quiet) return;
    g.hud?.subtitle?.(`El ritual: quedate adentro del círculo ${RIT_SECS} s.`, 4);
    g.world.eclipse?.pulse?.();
    g.fx.addShake?.(0.4);
    g.ee?.horde?.(RIT_SECS);
  }

  endRitual() {
    this.rit = 2;
    this.ring.visible = false;
    const g = this.g;
    // (mundo, it. 4) el final: seis rayos juntos sobre la máquina y un fogonazo
    if (globalThis.__mduNoRitualBolts !== true) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.fx.lightning?.(new THREE.Vector3(this.pap.x + Math.cos(a) * 7, this.pap.y + 26, this.pap.z + Math.sin(a) * 7), this.pap.clone().setY(this.pap.y + 1.5), 0xd090ff, 0.6);
      }
      g.post?.flash?.(0.35);
    }
    g.fx.sparkle?.(this.pap.clone().add(new THREE.Vector3(0, 1.5, 0)), [1, 0.6, 1], 40, 1.4);
    g.fx.addShake?.(0.6);
    g.world.eclipse?.pulse?.();
    // (qa-flujo) si el filo espera, decir dónde se templa
    const G = g.ee?.steps?.guadana?.st;
    g.hud?.subtitle?.(G && G.hoja && G.asta && !G.forged ? 'El Pack-a-Pava despierta. Templá el filo a su lado.' : 'El Pack-a-Pava despierta.', 4);
    if (!g.net?.guest && !this.q.done) this.q.finish();
    // (mundo, it. 4) el atajo de vuelta del altar al Nudo (lo manda el anfitrión)
    if (!g.net?.guest && EE.atajoPortal) g.ee?.portals?.unlock(EE.atajoPortal);
  }

  update(dt) {
    const g = this.g;
    this.time.value += dt;
    if (this.hintT > 0) this.hintT -= dt;
    const need = this.need();
    this.gr?.update(dt);
    // (qa-flujo) "Sellado" solo no decía nada: al llegar a la grieta, cómo se abre
    if (this.riftAt && g.state === 'playing' && !this.allScars()) {
      const P = g.player.pos;
      const near = Math.hypot(P.x - this.riftAt.x, P.z - this.riftAt.z) < 7;
      if (near && !this.nearRift) g.hud?.subtitle?.(this.gr ? `Sellado. Los pilares piden lo suyo: ${this.gr.placedN()} de 4.` : g.world.power ? 'Sellado. Tres cicatrices flotan en el claro: cerralas a tiros.' : 'Sellado. Primero la luz: el galpón del Molino.', 4);
      this.nearRift = near;
    }
    for (const s of this.scars) {
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 4);
      s.mat.uniforms.uFlash.value = s.flash;
      s.mat.uniforms.uK.value = s.closed ? 1 : Math.min(0.9, s.hits / need);
      s.mesh.visible = !s.closed || s.flash > 0;
    }
    const en = this.eyeNeed();
    for (const e of this.eyes) {
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 3);
      e.mat.uniforms.uFlash.value = e.flash;
      e.mat.uniforms.uK.value = e.open ? 1 : Math.min(0.85, e.kills / en);
    }
    // los susurros, cuando la cámara está en la Disformidad
    const dim = g.weather?.atmos?.dim || 0;
    if (g.state === 'playing') this.whispers(dim > 0.5);
    else this.whispers(false);
    // (mundo, it. 4) en La Disformidad de afuera, además, voces sueltas alrededor:
    // cada 1,2-2,6 s un pedazo del susurro desde un lugar distinto, a 3-9 m
    const ab = g.weather?.atmos?.abyss || 0;
    if (ab > 0.5 && g.state === 'playing' && globalThis.__mduNoAbyssVoices !== true) {
      this.voiceT = (this.voiceT ?? 1) - dt;
      if (this.voiceT <= 0) {
        this.voiceT = 1.2 + Math.random() * 1.4;
        const a = g.audio;
        const P = g.player?.pos;
        const V = this.wbuf?.voz;
        // (una voz grabada, entera, desde un lugar distinto cada vez)
        if (V?.length && P && a?.ctx) {
          const ang = Math.random() * Math.PI * 2;
          const r = 2.5 + Math.random() * 6;
          tmpV.set(P.x + Math.cos(ang) * r, P.y + 0.6 + Math.random() * 2.2, P.z + Math.sin(ang) * r);
          a.playBuffer(V[Math.floor(Math.random() * V.length)], { pos: tmpV.clone(), gain: (0.9 + Math.random() * 0.5) * (g.weather?.atmos?.rift ? RIFT_GAIN : 1), reverb: 0.45, ref: 2.5, rate: 0.85 + Math.random() * 0.25 });
        }
        // y de vez en cuando una al oído: pegada a la cabeza, de un costado
        this.earT = (this.earT ?? 14 + Math.random() * 10) - (1.2 + Math.random() * 1.4);
        if (this.earT <= 0 && this.wbuf?.oido && P && a?.ctx && !g.weather?.atmos?.rift) {
          this.earT = 22 + Math.random() * 20;
          const cam = g.camera;
          const side = Math.random() < 0.5 ? -1 : 1;
          tmpV.set(side, 0, 0.15).applyQuaternion(cam.quaternion).multiplyScalar(0.55).add(cam.position);
          a.playBuffer(this.wbuf.oido, { pos: tmpV.clone(), gain: 0.75, reverb: 0.08, ref: 0.6, rate: 0.9 + Math.random() * 0.12 });
        }
        const buf = !V?.length && a?.ctx && a.bakedBuf?.('dim-susurro');
        if (buf && P) {
          const ang = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 6;
          tmpV.set(P.x + Math.cos(ang) * r, P.y + 0.5 + Math.random() * 2.5, P.z + Math.sin(ang) * r);
          a.playBuffer(buf, { pos: tmpV.clone(), gain: 1.3 + Math.random() * 0.6, reverb: 0.6, ref: 3, offset: Math.random() * 4, rate: 0.85 + Math.random() * 0.3 });
        }
      }
    }
    if (this.rit === 1) {
      this.ritT += dt;
      const r = RIT_R0 + (RIT_R1 - RIT_R0) * Math.min(1, this.ritT / RIT_SECS);
      this.ring.scale.setScalar(r);
      this.ring.material.uniforms.uK.value = this.ritK;
      // avanza mientras hay alguien vivo adentro del círculo (todas las compus lo
      // calculan igual; el anfitrión decide el final)
      const P = g.player;
      let inside = P && !P.downed && Math.hypot(P.pos.x - this.pap.x, P.pos.z - this.pap.z) < r;
      if (g.net?.remote) for (const o of g.net.remote.values()) if (o.pos && !o.downed && Math.hypot(o.pos.x - this.pap.x, o.pos.z - this.pap.z) < r) inside = true;
      this.ritK = Math.max(0, Math.min(1, this.ritK + (inside ? dt : -dt * 0.5) / RIT_SECS));
      if (Math.floor(this.ritT * 2) !== Math.floor((this.ritT - dt) * 2)) g.hud?.setHint?.(inside ? `El ritual: ${Math.ceil((1 - this.ritK) * RIT_SECS)} s` : '¡Adentro del círculo!');
      if (Math.floor(this.ritT / 7) !== Math.floor((this.ritT - dt) / 7)) {
        g.world.eclipse?.pulse?.();
        g.fx.addShake?.(0.2);
      }
      // (mundo, it. 4: el ritual, allá en el altar, con todo: rayos violetas que caen
      // del cielo de la dimensión sobre los ojos y la máquina, cada vez más seguido)
      if (globalThis.__mduNoRitualBolts !== true) {
        this.boltT = (this.boltT ?? 0) - dt;
        if (this.boltT <= 0) {
          this.boltT = 1.6 - 1.1 * this.ritK + Math.random() * 0.5;
          const e = this.eyes[Math.floor(Math.random() * (this.eyes.length + 1))];
          const to = e ? e.center : this.pap;
          tmpV.set(to.x + (Math.random() - 0.5) * 6, to.y + 22, to.z + (Math.random() - 0.5) * 6);
          g.fx.lightning?.(tmpV.clone(), to.clone().setY(to.y + 0.2), 0xb070ff, 0.35);
          g.fx.sparkle?.(to.clone().setY(to.y + 0.5), [0.8, 0.4, 1], 10, 0.8);
        }
      }
      if (this.ritK >= 1 && !g.net?.guest) this.endRitual();
    }
  }

  // (al terminar: ya lo hizo endRitual; para el que entra tarde, deja todo abierto)
  complete() {
    this.gr?.complete();
    for (const s of this.scars) s.closed = true;
    for (const e of this.eyes) e.open = true;
    this.rit = 2;
    this.ring.visible = false;
  }

  state() {
    const s = { sc: this.scars.map((sc) => (sc.closed ? -1 : sc.hits)), ey: this.eyes.map((e) => (e.open ? -1 : e.kills)), rit: this.rit };
    if (this.gr) s.gr = this.gr.state();
    return s;
  }

  apply(m, quiet = false) {
    if (m.gr != null) this.gr?.apply(m, quiet);
    if (m.sc != null && typeof m.sc === 'number') this.applyHit(m.sc, m.h ?? 0, !!m.c);
    if (Array.isArray(m.sc)) m.sc.forEach((h, i) => this.applyHit(i, h < 0 ? this.need() : h, h < 0));
    if (m.eye != null) this.applyEye(m.eye, m.k ?? 0, !!m.o);
    if (Array.isArray(m.ey)) m.ey.forEach((k, i) => this.applyEye(i, k < 0 ? this.eyeNeed() : k, k < 0));
    if (m.rit === 1 && this.rit === 0) this.startRitual(quiet);
    if (m.rit === 2) this.complete();
  }

  onGuest(m) {
    if (m.gr != null) this.gr?.onGuest(m);
    if (m.sc != null && typeof m.sc === 'number' && this.g.world.power) this.damage(m.sc, m.n || 1);
    if (m.rit === 1 && this.allScars() && this.allEyes() && !this.rit) this.startRitual();
  }

  dispose() {
    this.whispers(false);
    this.gr?.dispose();
    this.root.removeFromParent();
  }
}
