import * as THREE from 'three';
import Carne from '../fx/carne';

// Cómo se siente tirar y matar (el usuario aprobó cuatro puntos, 2026-10-12;
// descartó la reacción del muerto al tiro, la pausa al matar, arrancar
// piernas, el aviso de doble baja y las heridas). Nada de esto toca la
// jugabilidad: ni daño, ni puntos, ni tiempos, ni la IA, ni dónde caen los
// potenciadores. Solo cómo se ve y cómo suena.
//
//  2. Baja confirmada: cuando el golpe mata, una marca más grande y roja (la
//     de la cabeza, con borde blanco) y un golpe seco grabado, en lugar de la
//     marca y el tic de siempre. El invitado la recibe del anfitrión ('bj').
//  3. La cabeza revienta con los mates de daño alto (UMBRAL_REVIENTA): sangre,
//     pedazos de carne (fx/carne.js), el chorro del cuello y un crujido. Los
//     pedazos que vuelan, también los de siempre (Effects.gib), son de carne.
//  4. La caída con fuerza: el cuerpo cae alejándose del tiro (gira hasta 90°
//     mientras cae) y la escopeta y las explosiones lo corren un poco (EMPUJE),
//     sin atravesar paredes ni salirse del piso. Lo decide el anfitrión con lo
//     que trae el golpe (sin azar); el invitado lo ve por la foto de la red.
//  6. El peso del tiro: una sacudida chica de cámara (solo en la imagen: la
//     puntería no se mueve), un fogonazo más fuerte con la misma luz de
//     siempre (Effects.flash) y la cola del eco distinta adentro y afuera.

// ---- 3. La cabeza revienta -------------------------------------------------
// Con el daño de un tiro entero a la cabeza, tal como está el mate (mejorado o
// no): daño x perdigones x multiplicador de cabeza. Desde 750 revienta; abajo,
// la cabeza sale volando como siempre. Con 750 (config/weapons.js, 2026-10-12):
//   revientan: las escopetas (Plástico 792, Lata 1224, Labrador 1836), el
//     Torpedo (4000), el Bombillón (1300), el Mate Meme (928) y, mejorados, el
//     Porongo, el Caballero, el Asta, el Mate 47, el Campanario, la Llamarada,
//     el Imperial (768) y los de arriba;
//   no: pistolas, subfusiles y rifles sin mejorar (Madera 367, Imperial 480,
//     Asta 612, Llamarada 592...), y mejorados el Madera (665), el Camionero
//     (678), el Caótico (705), el Algarrobo, el Vidrio y los Gemelos.
export const UMBRAL_REVIENTA = 750;
// cuántos pedazos, de qué tamaño (m) y cuánto dura el chorro del cuello (s)
const PEDAZOS = 6;
const PEDAZO_M = [0.03, 0.07];
const CHORRO_S = 0.9;

// ---- 4. La caída -------------------------------------------------------------
// Cuánto corre el cuerpo (m) en la dirección del tiro. La bala común casi
// nada; la escopeta según la distancia; las explosiones (las que no lo hacen
// volar, que siguen como antes). Nunca más de TOPE.
const EMPUJE = { bala: 0.2, escopetaCerca: 0.8, escopetaLejos: 0.3, cercaM: 3, lejosM: 12, explosion: 0.8, tope: 1 };
// en cuánto gira hacia el lado del tiro y en cuánto termina de correrse (s)
const GIRO_S = 0.3;
const EMPUJE_S = 0.35;
// cuánto ocupa tirado desde z.pos (los pies): para el lado que cae y para el
// otro, por la escala del muerto (medido: de -0,1 a 1,74 m, más el grosor)
const LARGO_CAE = 1.85;
const LARGO_PIES = 0.3;
// si para ese lado hay pared, prueba girando de a 0,4 rad (hasta 1,2)
const GIROS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];

// ---- 6. El peso del tiro -------------------------------------------------------
// Sacudida por mate (el `sound` de config/weapons.js): grados de cabeceo del
// golpe; el giro de costado es un tercio y la cámara va 1 cm atrás por grado.
// Pasa por "Temblor de cámara" (Opciones) y "menos destellos" la baja a 0,4.
const SACUDIDA = {
  pistol: 0.35, smg: 0.22, rifle: 0.35, lmg: 0.3, shotgun: 0.9, pump: 1.0, sniper: 1.1,
  gut: 0.8, gatling: 0.12, labrador: 0.9, cohete: 0.7, caotico: 0.3, llamarada: 0.3, meme: 0.5,
  oro: 0.5, porongo: 0.3, luzmala: 0.3, mk3: 0.4, ray: 0.35, thunder: 1.0, ice: 0.4, tesla: 0.6,
  stream: 0.15, bad: 0.2, bolt: 0.6, launcher: 0.7,
};
const SACUDIDA_OTRO = 0.3;
const SACUDIDA_TOPE = 1.6;
// el resorte: frecuencia (Hz) y amortiguación (vuelve en ~0,15 s, con un rebote chico)
const RESORTE_HZ = 7;
const RESORTE_Z = 0.55;
// El fogonazo (Effects.flash, la misma luz de siempre): intensidad, alcance (m)
// y duración (s). Antes: 8, 7 y 0,06 para todos. Los suaves (la Máquina de
// Muerte y los temporales) quedan como estaban.
const FOGONAZO = {
  pistol: [16, 9, 0.06], smg: [12, 8, 0.05], rifle: [18, 10, 0.06], lmg: [16, 10, 0.05],
  shotgun: [32, 12, 0.08], pump: [34, 12, 0.08], sniper: [30, 12, 0.08], labrador: [32, 12, 0.08],
  gut: [26, 11, 0.07], cohete: [22, 10, 0.07], meme: [20, 10, 0.06],
};
const FOGONAZO_OTRO = [14, 9, 0.06];
// La cola del eco: afuera, el tiro vuelve de lejos (un eco a 0,23 s, apagado y
// que se repite bajando); adentro, más del cuarto chico (core/audio setRoom).
const ECO = { demora: 0.23, grave: 1100, repite: 0.38, afuera: 0.32, adentro: 0.45 };

// ---- 2. La baja confirmada ---------------------------------------------------
// los que no son "el tiro que mata": la bomba, quemarse después, las trampas
const NO_BAJA = new Set(['nuke', 'burn', 'trapfire', 'yerba']);
const BAJA_GAP = 0.05;
const SND_DIR = '/assets/sotano/sfx/sentir/';
// tomas generadas con ElevenLabs (sound-generation, 2026-10-12; scratchpad
// sentir/snd: gen.py, proc.py): "baja" un golpe seco de taco de madera
// apagado; "crujido" un cráneo que se rompe, mojado
const SONIDOS = ['baja', 'crujido-1', 'crujido-2', 'crujido-3'];

const ease = (k) => 1 - (1 - k) * (1 - k);
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const camP = new THREE.Vector3();
const camQ = new THREE.Quaternion();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// daño de un tiro entero a la cabeza, del mate como está
const nominal = (st) => (st?.damage || 0) * (st?.pellets || 1) * (st?.headMult || 1);

const CSS = `
.mdu-baja { position: absolute; left: 50%; top: 50%; opacity: 0; pointer-events: none; }
.mdu-baja.is-on { animation: mdu-baja 0.36s ease-out forwards; }
.mdu-baja i { position: absolute; width: 15px; height: 3px; background: #e3262c; border-radius: 1px; }
.mdu-baja.is-head i { background: #ff2a2a; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9); }
.mdu-baja i:nth-child(1) { transform: translate(-22px, -16px) rotate(45deg); }
.mdu-baja i:nth-child(2) { transform: translate(7px, -16px) rotate(-45deg); }
.mdu-baja i:nth-child(3) { transform: translate(-22px, 13px) rotate(-45deg); }
.mdu-baja i:nth-child(4) { transform: translate(7px, 13px) rotate(45deg); }
@keyframes mdu-baja { 0% { opacity: 1; transform: scale(1.3); } 35% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.05); } }
.mdu-baja.is-head.is-on { animation-name: mdu-baja-cabeza; }
@keyframes mdu-baja-cabeza { 0% { opacity: 1; transform: scale(1.5); } 35% { opacity: 1; transform: scale(1.12); } 100% { opacity: 0; transform: scale(1.15); } }
`;

export default class SentirTiro {
  constructor(g) {
    this.g = g;
    this.carne = new Carne(g);
    this.caidas = [];
    this.fuentes = [];
    // el resorte de la cámara: cabeceo, giro de costado (rad) y atrás (m)
    this.sp = { p: 0, vp: 0, r: 0, vr: 0, b: 0, vb: 0 };
    this.lado = 1;
    this.bajaT = -1;
    this.flags();
    this.instalar();
  }

  // Lo que se engancha una vez: la marca de la baja (el HUD vive entre mapas),
  // el tic de impacto que se calla cuando hay baja, la cola del eco y las tomas.
  // Los pedazos de la cabeza que vuela (Effects.gib) se cambian en cada mapa.
  instalar() {
    const g = this.g;
    const fx = g.fx;
    if (fx && !fx.mduGib) {
      const gib = fx.gib.bind(fx);
      fx.mduGib = gib;
      fx.gib = (p, vel) => g.sentir?.carne?.lanzar(p, vel, 0.065) || gib(p, vel);
    }
    const hud = g.hud;
    if (hud && !hud.mduBaja) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      const el = document.createElement('div');
      el.className = 'mdu-baja';
      el.innerHTML = '<i></i><i></i><i></i><i></i>';
      hud.hit?.parentNode?.appendChild(el);
      hud.mduBaja = el;
      const hm = hud.hitmarker.bind(hud);
      hud.hitmarker = (head) => {
        if (g.sentir?.tapaMarca(head)) return;
        hm(head);
      };
    }
    const a = g.audio;
    if (a && !a.mduSentir) {
      a.mduSentir = { buf: {} };
      const ah = a.hitmarker.bind(a);
      a.hitmarker = (head) => {
        if (g.sentir?.tapaTic()) return;
        ah(head);
      };
      a.colaTiro = (node, pos) => g.sentir?.cola(node, pos);
      for (const id of SONIDOS) {
        fetch(SND_DIR + id + '.mp3')
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((ab) => a.ctx.decodeAudioData(ab))
          .then((b) => {
            a.mduSentir.buf[id] = b;
          })
          .catch(() => {});
      }
    }
  }

  // ---------------- lo que pasa en este tiro ----------------
  // (todo lo de un disparo pasa en el mismo cuadro: tiro, golpes, bajas y
  // marcas; al terminar el cuadro se olvida)
  flags() {
    this.tiro = null;
    this.marcaYa = false;
    this.marcaHead = false;
    this.bajaPend = false;
    this.bajaHead = false;
    this.bajaYa = false;
    this.mq = false;
  }

  olvidar() {
    if (this.mq) return;
    this.mq = true;
    queueMicrotask(() => this.flags());
  }

  // Weapons.fire, cada tiro propio
  disparo(st) {
    this.tiro = st;
    this.olvidar();
    const g = this.g;
    const S = g.settings || {};
    const k = (S.shake ?? 1) * (S.calmFx ? 0.4 : 1) * (g.weapons?.ads ? 0.7 : 1);
    if (k <= 0) return;
    const deg = (SACUDIDA[st.sound] ?? SACUDIDA_OTRO) * k;
    const w = RESORTE_HZ * Math.PI * 2;
    const sp = this.sp;
    // un golpe de velocidad: el resorte lo lleva a ~deg y lo trae de vuelta
    // (x2,4: medido en el juego, con eso el pico llega a deg)
    const K = 2.4;
    const rad = THREE.MathUtils.degToRad(deg);
    sp.vp = Math.min(sp.vp + rad * w * K, THREE.MathUtils.degToRad(SACUDIDA_TOPE) * w * K);
    this.lado = -this.lado;
    sp.vr += this.lado * rad * 0.33 * w * K;
    sp.vb += deg * 0.01 * w * K;
  }

  // Weapons.fire: el fogonazo de este mate (null: el de siempre)
  fogonazo(st, soft) {
    if (soft) return null;
    const F = FOGONAZO[st.sound] || FOGONAZO_OTRO;
    return { i: F[0], d: F[1], t: F[2] };
  }

  // de un invitado: lo que el anfitrión necesita saber de su tiro (Session
  // reportHit): 1 revienta cabezas, 2 escopeta
  marcas(info) {
    if (info.sf != null) return info.sf;
    const st = this.tiro;
    if (!st) return 0;
    return (nominal(st) >= UMBRAL_REVIENTA ? 1 : 0) | ((st.pellets || 1) > 1 ? 2 : 0);
  }

  propio(info) {
    return info.by == null || info.by === this.g.net?.id;
  }

  // ---------------- 2. la baja confirmada ----------------
  // (Hud.hitmarker, envuelto) true: no mostrar la marca común
  tapaMarca(head) {
    this.marcaYa = true;
    this.marcaHead ||= !!head;
    this.olvidar();
    if (this.bajaPend) this.mostrarBaja(this.bajaHead);
    return this.bajaYa;
  }

  // (GameAudio.hitmarker, envuelto) true: no el tic, ya suena la baja
  tapaTic() {
    return this.bajaYa || this.bajaPend;
  }

  // Una baja propia: se confirma si el golpe mostró su marca (los tiros, el
  // facón, las explosiones); las trampas, quemarse o la bomba no la muestran.
  bajaPropia(head) {
    this.bajaPend = true;
    this.bajaHead ||= head;
    this.olvidar();
    if (this.marcaYa) this.mostrarBaja(this.bajaHead);
  }

  // el anfitrión avisa que la baja fue del invitado (Session 'bj')
  bajaRemota(m) {
    this.mostrarBaja(!!m?.c);
  }

  mostrarBaja(head) {
    if (this.bajaYa) return;
    this.bajaYa = true;
    const g = this.g;
    const el = g.hud?.mduBaja;
    if (el) {
      el.classList.toggle('is-head', !!head);
      g.hud.pulse(el);
      // (la marca común que salió antes en este mismo tiro, otro perdigón: se va,
      // queda la de la baja sola)
      g.hud.pulses?.delete(g.hud.hit);
      g.hud.hit?.classList.remove('is-on');
    }
    // (muchas juntas, las de una maravilla: un golpe)
    const a = g.audio;
    if (!a?.ctx || a.now - this.bajaT < BAJA_GAP) return;
    this.bajaT = a.now;
    const buf = a.mduSentir?.buf.baja;
    // (unos 9 dB abajo de un tiro: se nota sin tapar el disparo)
    if (buf) a.playBuffer(buf, { gain: head ? 0.44 : 0.36, reverb: 0, rate: head ? 1.14 : 1 });
    else {
      // (si la toma no bajó: un golpe sordo sintetizado, distinto del tic)
      const o = a.out({ gain: 0.45, reverb: 0 });
      a.tone(o, { dur: 0.09, freq: head ? 260 : 210, freqEnd: 90, gain: 0.8 });
      a.noise(o, { dur: 0.05, type: 'bandpass', freq: 1200, q: 1.5, gain: 0.5 });
    }
  }

  // ---------------- 3. la cabeza revienta ----------------
  // Zombies.kill, el tiro a la cabeza que mata: true si reventó (ya puso la
  // sangre, los pedazos y el ruido; el que llama no pone los suyos)
  reventar(z, info, hp) {
    const g = this.g;
    if (z.boss || z.dog || z.jinete || info.hell || (info.type || 'bullet') !== 'bullet' || z.slowT > 0 || g.zombies?.dry?.(z)) return false;
    const fuerte = info.sf != null ? !!(info.sf & 1) : this.propio(info) && nominal(this.tiro) >= UMBRAL_REVIENTA;
    if (!fuerte) return false;
    z.mduRevId = z.id;
    this.estallido(z, hp, info.dir);
    return true;
  }

  // lo que se ve y se oye (en el anfitrión y, por la foto, en el invitado)
  estallido(z, hp, dir) {
    const g = this.g;
    const fx = g.fx;
    const dx = dir?.x || 0;
    const dz = dir?.z || 0;
    fx.blood(hp, { x: dx * 0.8, y: 1.3, z: dz * 0.8 }, 36, 1.7);
    // la nube roja
    for (let i = 0; i < 4; i++) {
      fx.alpha.spawn(hp.x, hp.y, hp.z, dx * 0.6 + (i - 1.5) * 0.25, 0.3 + i * 0.1, dz * 0.6 - (i - 1.5) * 0.2, { color: [0.26, 0.01, 0.01], size: 0.2, size1: 0.8, life: 0.55, alpha: 0.5, drag: 3 });
    }
    const r = rng((z.id || 1) * 7919 + 3);
    for (let i = 0; i < PEDAZOS; i++) {
      tmpV.set(hp.x + (r() - 0.5) * 0.12, hp.y + (r() - 0.5) * 0.1, hp.z + (r() - 0.5) * 0.12);
      tmpD.set(dx * 2.4 + (r() - 0.5) * 3.4, 1.6 + r() * 3, dz * 2.4 + (r() - 0.5) * 3.4);
      this.carne.lanzar(tmpV, tmpD, PEDAZO_M[0] + r() * (PEDAZO_M[1] - PEDAZO_M[0]), (z.id || 1) * 31 + i);
    }
    z.mduChorro = CHORRO_S;
    z.mduChorroId = z.id;
    if (!this.fuentes.includes(z)) this.fuentes.push(z);
    this.sonar('crujido-' + (1 + ((z.id || 0) % 3)), hp);
  }

  sonar(id, pos) {
    const a = this.g.audio;
    const buf = a?.mduSentir?.buf[id];
    if (!buf) return void a?.squish(pos);
    const was = a.cat;
    a.cat = 'zombies';
    try {
      a.playBuffer(buf, { pos: pos.clone(), gain: 0.85, reverb: 0.12, ref: 3 });
    } finally {
      a.cat = was;
    }
  }

  // ---------------- 4. la caída ----------------
  // Zombies.kill, al final (cualquier muerte): la baja confirmada y, si quedó
  // tirado de la forma común, hacia dónde cae. z.mduCaida va en la foto de la
  // red (Session): 1 cae de espaldas, 2 le reventó la cabeza.
  alMorir(z, info, type) {
    const g = this.g;
    if (!NO_BAJA.has(type)) {
      if (this.propio(info)) this.bajaPropia(info.zone === 'head');
      else if (g.net?.host) g.net.net?.to?.(info.by, { t: 'bj', c: info.zone === 'head' ? 1 : 0 });
    }
    z.mduCaida = null;
    if (z.state === 'dead' && !z.boss && !z.dog && !z.crawler && !z.jinete && info.dir) this.planCaida(z, info, type);
    z.mduCaida = (z.deathBack ? 1 : 0) | (z.mduRevId === z.id ? 2 : 0);
  }

  planCaida(z, info, type) {
    const g = this.g;
    const w = g.world;
    const l = Math.hypot(info.dir.x, info.dir.z);
    if (l < 0.2 || !w?.raycast) return;
    const fx0 = info.dir.x / l;
    const fz0 = info.dir.z / l;
    // cuánto lo corre
    let push = EMPUJE.bala;
    if (type === 'explosive') push = EMPUJE.explosion;
    else if (info.sf != null ? info.sf & 2 : this.propio(info) && (this.tiro?.pellets || 1) > 1) {
      const from = this.propio(info) ? g.player?.pos : g.net?.remote?.get(info.by)?.pos;
      const d = from ? Math.hypot(z.pos.x - from.x, z.pos.z - from.z) : 6;
      const k = Math.min(1, Math.max(0, (d - EMPUJE.cercaM) / (EMPUJE.lejosM - EMPUJE.cercaM)));
      push = EMPUJE.escopetaCerca + (EMPUJE.escopetaLejos - EMPUJE.escopetaCerca) * k;
    }
    push = Math.min(push, EMPUJE.tope);
    const sc = z.scale || 1;
    const by = z.baseY || 0;
    const cae = LARGO_CAE * sc;
    const pies = LARGO_PIES * sc;
    const o = tmpV.set(z.pos.x, by + 0.45, z.pos.z);
    let pick = null;
    let best = null;
    for (const off of GIROS) {
      const c = Math.cos(off);
      const s = Math.sin(off);
      const fx = fx0 * c + fz0 * s;
      const fz = fz0 * c - fx0 * s;
      // para el lado que cae: lo que se corre más el cuerpo; para atrás, las piernas
      const ahead = w.raycast(o, tmpD.set(fx, 0, fz), push + cae + 0.2);
      const behind = w.raycast(o, tmpD.set(-fx, 0, -fz), pies + 0.1);
      if (behind >= pies && (!best || ahead > best.ahead)) best = { fx, fz, push: 0, ahead };
      if (ahead < cae + 0.1 || behind < pies) continue;
      pick = { fx, fz, push: Math.max(0, Math.min(push, ahead - cae - 0.1)) };
      break;
    }
    const fy = Math.sin(z.yaw);
    const fw = Math.cos(z.yaw);
    // sin lugar entero para ningún lado: el que tenga más, si tiene más que
    // para donde caía antes; si no, cae como antes
    if (!pick && best) {
      const s0 = z.deathBack ? -1 : 1;
      const was = w.raycast(o, tmpD.set(fy * s0, 0, fw * s0), cae + 0.2);
      if (best.ahead > was + 0.15) pick = best;
    }
    if (!pick) return;
    const back = pick.fx * fy + pick.fz * fw < 0;
    z.deathBack = back;
    const yawT = back ? Math.atan2(-pick.fx, -pick.fz) : Math.atan2(pick.fx, pick.fz);
    let d = yawT - z.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.caidas.push({ z, id: z.id, t: 0, yaw0: z.yaw, dyaw: d, x0: z.pos.x, z0: z.pos.z, dx: pick.fx * pick.push, dz: pick.fz * pick.push, by });
  }

  // ---------------- en la red (el invitado) ----------------
  // Zombies.applyRemote: cae para el lado que dice el anfitrión y, si le
  // reventó la cabeza, se ve acá también
  remota(z, f, was, state) {
    if (!f.dead || f.caida == null) return;
    z.deathBack = !!(f.caida & 1);
    if (f.caida & 2 && state === 'dead' && was && was !== 'dead' && z.mduRevId !== z.id) {
      z.mduRevId = z.id;
      this.estallido(z, new THREE.Vector3().setFromMatrixPosition(z.mats[2]), null);
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.carne.update(dt);
    // las caídas: gira hacia el lado del tiro y se corre, con las paredes y el piso
    const w = g.world;
    for (let i = this.caidas.length - 1; i >= 0; i--) {
      const C = this.caidas[i];
      const z = C.z;
      if (!z.active || z.id !== C.id || !z.dead || z.state !== 'dead') {
        this.caidas.splice(i, 1);
        continue;
      }
      C.t += dt;
      z.yaw = C.yaw0 + C.dyaw * ease(Math.min(1, C.t / GIRO_S));
      if (C.dx || C.dz) {
        const k = ease(Math.min(1, C.t / EMPUJE_S));
        const nx = C.x0 + C.dx * k;
        const nz = C.z0 + C.dz * k;
        // que no se caiga de un borde ni se meta en un escalón
        const fy = w?.floorAt ? w.floorAt(nx, nz, C.by + 0.3) : C.by;
        if (Math.abs(fy - C.by) > 0.2) C.dx = C.dz = 0;
        else {
          z.pos.x = nx;
          z.pos.z = nz;
          w?.collide?.(z.pos, 0.25, C.by + 0.2, C.by + 0.9);
        }
      }
      if (C.t >= Math.max(GIRO_S, EMPUJE_S)) this.caidas.splice(i, 1);
    }
    // el chorro del cuello de la cabeza que reventó
    for (let i = this.fuentes.length - 1; i >= 0; i--) {
      const z = this.fuentes[i];
      if (!z.active || z.mduChorroId !== z.id || !(z.mduChorro > 0)) {
        this.fuentes.splice(i, 1);
        continue;
      }
      z.mduChorro -= dt;
      // (a 30 gotas por segundo, vaya a los cuadros que vaya)
      z.mduGota = (z.mduGota || 0) - dt;
      if (z.mduGota > 0) continue;
      z.mduGota = 1 / 30;
      const np = tmpV.setFromMatrixPosition(z.mats[1]);
      np.y += 0.3 * (z.scale || 1);
      const k = Math.max(0.3, z.mduChorro / CHORRO_S);
      g.fx.blood(np, { x: (Math.random() - 0.5) * 0.4, y: 2.2 * k, z: (Math.random() - 0.5) * 0.4 }, 2, 0.8);
    }
    // el resorte de la sacudida (en pasos chicos: a 30 cuadros sería inestable)
    const sp = this.sp;
    if (sp.p || sp.vp || sp.r || sp.vr || sp.b || sp.vb) {
      const W = RESORTE_HZ * Math.PI * 2;
      const n = Math.ceil(dt / (1 / 240));
      const h = dt / n;
      for (let s = 0; s < n; s++) {
        sp.vp += (-W * W * sp.p - 2 * RESORTE_Z * W * sp.vp) * h;
        sp.p += sp.vp * h;
        sp.vr += (-W * W * sp.r - 2 * RESORTE_Z * W * sp.vr) * h;
        sp.r += sp.vr * h;
        sp.vb += (-W * W * sp.b - 2 * RESORTE_Z * W * sp.vb) * h;
        sp.b += sp.vb * h;
      }
      if (Math.abs(sp.p) + Math.abs(sp.vp) * 0.01 + Math.abs(sp.r) + Math.abs(sp.b) < 1e-5) sp.p = sp.vp = sp.r = sp.vr = sp.b = sp.vb = 0;
    }
  }

  // Game.render: la sacudida se pone solo para dibujar (la puntería y lo que
  // mira la cámara en el juego quedan como estaban) y se saca después.
  antesDeDibujar(cam) {
    const sp = this.sp;
    const g = this.g;
    if (!(sp.p || sp.r || sp.b) || g.state !== 'playing' || g.ee?.scene || g.intro?.active) return false;
    camP.copy(cam.position);
    camQ.copy(cam.quaternion);
    cam.rotateX(sp.p);
    cam.rotateZ(sp.r);
    cam.translateZ(sp.b);
    cam.updateMatrixWorld();
    return true;
  }

  despuesDeDibujar(cam) {
    cam.position.copy(camP);
    cam.quaternion.copy(camQ);
    cam.updateMatrixWorld();
  }

  // ---------------- la cola del eco (core/weaponSfx shot) ----------------
  cola(node, pos) {
    const a = this.g.audio;
    if (!a?.ctx || !node || !(a.ecoLibre?.() ?? true)) return;
    const c = a.ctx;
    const E = (a.mduEco ||= this.armarEco(a));
    const k = a.roomNow || 0;
    let gk = 1;
    if (pos && a.ear) gk = 0.6 * Math.min(1, 6 / Math.max(6, Math.hypot(pos.x - a.ear.x, pos.y - a.ear.y, pos.z - a.ear.z)));
    if (k < 0.99) {
      const s = c.createGain();
      s.gain.value = ECO.afuera * (1 - k) * gk;
      node.connect(s).connect(E);
    }
    if (k > 0.01 && a.room) {
      const s = c.createGain();
      s.gain.value = ECO.adentro * k * gk;
      node.connect(s).connect(a.room);
    }
  }

  // el eco de afuera: una demora apagada que se repite bajando (se arma una vez)
  armarEco(a) {
    const c = a.ctx;
    const inp = c.createGain();
    const d = c.createDelay(1);
    d.delayTime.value = ECO.demora;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ECO.grave;
    const fb = c.createGain();
    fb.gain.value = ECO.repite;
    inp.connect(d).connect(lp);
    lp.connect(fb).connect(d);
    lp.connect(a.cats?.weapons?.dry || a.sfx);
    return inp;
  }

  dispose() {
    this.carne.dispose();
    this.caidas.length = 0;
    this.fuentes.length = 0;
  }
}
