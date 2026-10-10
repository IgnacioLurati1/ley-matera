import * as THREE from 'three';
import CastleCine, { smooth } from './castleCine';
import CineActors, { yawTo } from './cineActors';
import { gilVincha } from '../net/gilLook';
import { makeRift } from './eclipseCineSable';
import { warmScene } from './cineWarm';
import { toWorld } from '../world/eclipse/sanlorenzoCampo';
import { eclSfx } from '../fx/eclipseSfx';

// El camino a San Lorenzo (2026-10-08, ITERACION-7 C6). El usuario: "para
// llegar a la pelea final no hay cinemática, cortás donde te dice que cortes
// (y encima eso no tiene sentido) y aparecés instantáneamente ahí, sin aviso";
// "cómo pasamos de llegar a la pelea final en un dragón a literalmente cebar
// un mate y apretar un clic en un lugar". Ahora, como el vuelo de la Gran
// Guerra del castillo (world/GranGuerra.js):
//  · El Primer Mate (PrimerMateCine): el Gil lo ceba en el fogón con los
//    suyos; el vapor sube al cielo y abre un desgarro en el claro. Adentro, San
//    Lorenzo al alba con el eclipse encima. Fierro dice qué es y por qué: El
//    Eclipse va por San Martín; sin él no hay patria, y sin patria no hay mate.
//  · El desgarro queda abierto (lo tiene el easter egg) con el aviso: cruzar es
//    la batalla final y no hay vuelta.
//  · El cruce (CruceCine): los cuatro entran al desgarro, blanco, y del otro
//    lado el vuelo: sobre el Paraná, al lado de El Eclipse y de la escuadra, la
//    barranca, el campo, y bajando detrás del muro del convento, donde San
//    Martín espera. El cartel "San Lorenzo / 3 de febrero de 1813". Negro y a
//    jugar. La arena se arma debajo del blanco (onWhite).
// globalThis.__mduOldCruce: como antes (el mate muestra dónde cortar y el tajo
// de la Furia abre la arena de una).

export const cruceOn = () => globalThis.__mduOldCruce !== true;

const CREW_COLOR = { gil: 0xb01c14, anacleto: 0x3a6a2a, cirilo: 0x2a3a7a, benito: 0x7a5a2a, nicasio: 0x5a2a6a };
const MATES = ['anacleto', 'cirilo', 'benito', 'nicasio'];
const NAME = { gil: 'Antonio Gil', fierro: 'Martín Fierro' };
// el desgarro del claro: más grande que el del Sable (entran los cuatro)
const RIFT_K = 1.7;
const RIFT_MID = 3.4 * RIFT_K * 0.5;
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const win = (t, a, b) => smooth(clamp01((t - a) / (b - a)));

// El desgarro del claro: en ee.cutAt, de frente al fogón. Va en las islas (se
// va con ellas al cruzar). Visible y cerrado: así su programa se compila antes.
export function buildCruceRift(ee) {
  const r = makeRift('sanlorenzo');
  r.root.name = 'eclipseCruce';
  r.root.position.copy(ee.cutAt);
  r.root.rotation.y = Math.atan2(ee.fogon.x - ee.cutAt.x, ee.fogon.z - ee.cutAt.z);
  r.root.scale.setScalar(RIFT_K);
  ee.g.world.root.add(r.root);
  return r;
}

// Los cuatro del estero con sus papeles y colores; siempre hay un Gil.
function makeCrew(ee, parent, base) {
  const C = new CineActors(ee.g, { base, parent, fill: 0x5a4030 });
  const used = new Set();
  for (const r of C.list) {
    r.role = ee.roleOf?.(r.id - base) || null;
    if (r.role) used.add(r.role);
  }
  if (!C.list.some((r) => r.role === 'gil')) {
    const r0 = C.list.find((r) => !r.role) || C.list[0];
    used.delete(r0.role);
    r0.role = 'gil';
    used.add('gil');
  }
  for (const r of C.list) {
    if (!r.role) {
      r.role = MATES.find((m) => !used.has(m)) || 'nicasio';
      used.add(r.role);
    }
    r.a.M.poncho.color.set(CREW_COLOR[r.role] || 0x7a5a2a).multiplyScalar(1.7);
  }
  C.gil = C.list.find((r) => r.role === 'gil');
  C.mates = C.list.filter((r) => r !== C.gil);
  return C;
}

// Lo común de las dos: el campo de juego fuera de cuadro, los cuatro, los nombres.
class CruceBase extends CastleCine {
  constructor(ee, rift) {
    super(ee.g, { drive: false, kind: 'eclipse' });
    this.ee = ee;
    this.rift = rift;
  }

  hideField() {
    const g = this.g;
    const Z = g.zombies;
    this.hidden = [...(Z?.meshes || []).map((M) => M.im), Z?.batch?.mesh, Z?.blobs, g.net?.avatars?.root].filter((o) => o && o.visible);
    for (const o of this.hidden) o.visible = false;
  }

  frame() {
    const F = (this.F = this.ee.fogon.clone());
    const R = (this.R = this.ee.cutAt.clone());
    this.toR = new THREE.Vector3().subVectors(R, F).setY(0).normalize();
    this.sd = new THREE.Vector3(-this.toR.z, 0, this.toR.x);
  }

  // un punto: desde `o`, adelante (hacia el desgarro), al costado y alto (sobre `o`)
  at(o, fwd, side, up = 0) {
    return o.clone().addScaledVector(this.toR, fwd).addScaledVector(this.sd, side).setY(o.y + up);
  }

  // (2026-10-08, el usuario: "los diálogos de la cinemática de cuando abrimos
  // el portal no se completan y los subtítulos muestran otra cosa". Las voces
  // se encolan en core/audio: la segunda línea de Fierro arrancaba 2,5 s
  // después de la primera, que dura ~4: el texto ya decía la segunda mientras
  // sonaba la primera, el atraso se juntaba y al terminar la escena se callaba
  // lo que quedaba en la cola. Ahora la línea espera su turno —texto y voz
  // juntos— y el paso no termina antes de que termine la línea.
  // globalThis.__mduOldCruceDlg: como antes)
  say(who, text) {
    const g = this.g;
    if (globalThis.__mduOldCruceDlg !== true) {
      const A = g.audio;
      const busy = Math.max((this.voiceTill || 0) - this.t, A?.ctx ? (A.voiceEnd || 0) - A.ctx.currentTime : 0);
      if (busy > 0.08) {
        this.later(busy + 0.12, () => this.say(who, text));
        // (que el paso dure lo que falta más la línea)
        this.hold(busy + 0.12 + text.length * 0.065 + 0.6);
        return busy + 0.12 + text.length * 0.065 + 0.5;
      }
    }
    const d = super.say(who, text);
    if (NAME[who]) this.textEl.textContent = `${NAME[who]}: ${text}`;
    if (globalThis.__mduOldCruceDlg !== true) {
      this.voiceTill = this.t + (g.audio?.sayWait || 0) + d - 0.35;
      this.hold(d);
    }
    return d;
  }

  // Que el paso en curso no termine antes de `secs` desde ahora.
  hold(secs) {
    this.next = Math.max(this.next, this.t + secs);
  }

  // fn cuando termine de hablar el que habla (o ya, si nadie habla)
  afterVoice(fn, pad = 0.25) {
    const left = (this.voiceTill || 0) - this.t;
    if (globalThis.__mduOldCruceDlg !== true && left > 0) {
      this.hold(left + pad + 0.8);
      this.later(left + pad, fn);
    } else fn();
  }

  headOf(r, out) {
    const h = r?.a?.gs?.bones?.Head || r?.a?.head;
    if (h?.getWorldPosition) return h.getWorldPosition(out);
    return out.copy(r.pos).setY(r.pos.y + 1.6);
  }

  tick(dt) {
    this.crew?.tick(dt);
    if (this.crew?.gil) gilVincha(this.crew.gil.a);
  }

  cleanup() {
    const g = this.g;
    for (const o of this.hidden || []) o.visible = true;
    this.hidden = null;
    this.crew?.dispose?.();
    this.crew = null;
    g.hud.show(true);
    g.weapons.vmRoot.visible = true;
  }
}

// ---------------- El Primer Mate ----------------
export class PrimerMateCine extends CruceBase {
  build() {
    const g = this.g;
    this.hideField();
    this.frame();
    this.el.querySelector('.mdu-fcine__fade').style.transition = 'opacity 0.8s';
    const { F, R, toR, sd } = this;
    const C = (this.crew = makeCrew(this.ee, this.root, 700));
    const gil = C.gil;
    gil.mate = true;
    // alrededor del fuego, del lado de afuera (el desgarro se abre del otro lado del fuego)
    const a0 = Math.atan2(toR.z, toR.x) + Math.PI;
    const order = [C.mates[0], gil, C.mates[1], C.mates[2]];
    [-1.15, -0.38, 0.38, 1.15].forEach((da, i) => {
      const r = order[i];
      if (!r) return;
      const a = a0 + da;
      r.pos.set(F.x + Math.cos(a) * 1.75, 0, F.z + Math.sin(a) * 1.75);
      r.pos.y = C.floor(r.pos.x, r.pos.z);
      r.yaw = yawTo(r.pos, F);
    });
    const REST = { valiente: 'cool', miedoso: 'chestHand', canchero: 'crossArms', viejo: 'winded' };
    for (const r of C.mates) C.act(r, REST[r.persona] || 'cool', { loop: true });
    C.act(gil, 'cebar', { loop: true });
    // el desgarro, puesto y cerrado (se compila ya)
    const U = this.rift.U;
    this.rift.root.visible = true;
    U.uOpen.value = 0;
    U.uCrack.value = 0;
    U.uFlash.value = 0;
    this.steam = 0.35;
    warmScene(g);
    const gh = () => this.headOf(gil, tmpW);
    return [
      // 1. el Gil ceba, de cerca y del otro lado del fuego
      [
        0,
        () => {
          // (al costado del Gil, entre él y el fuego: de enfrente, un poste del
          // claro tapaba media toma)
          const gF = new THREE.Vector3().subVectors(F, gil.pos).setY(0).normalize();
          const gS = new THREE.Vector3(-gF.z, 0, gF.x);
          const c0 = gil.pos.clone().addScaledVector(gF, 1.25).addScaledVector(gS, 0.95);
          c0.y += 1.15;
          this.shot(5.2, (u, lt, pos, look) => {
            pos.copy(c0).addScaledVector(gF, -0.2 * smooth(u));
            look.copy(gil.pos).setY(gil.pos.y + 1.0);
          });
          this.setFov(42);
          this.later(0.6, () => this.say('fierro', 'El Primer Mate. Con lo que juntaron en las siete islas.'));
          return 5.2;
        },
      ],
      // 2. lo levanta: el vapor sube derecho al cielo
      [
        0,
        () => {
          C.act(gil, 'offer', { fade: 0.5 });
          this.later(0.5, () => (this.steam = 1));
          const c0 = this.at(F, 0.6, -2.5, 0.45);
          const top = this.at(F, 0, 0, 24);
          this.shot(4.8, (u, lt, pos, look) => {
            pos.copy(c0);
            const k = smooth(clamp01((lt - 0.8) / 3.6));
            const h = gh();
            look.lerpVectors(h, top, k);
          });
          this.setFov(56);
          this.later(0.7, () => this.say('fierro', 'El Eclipse se fue al día en que nació la patria.'));
          this.later(3.2, () => {
            g.world.eclipse?.pulse?.(1.2);
            g.audio.thunder?.(top, false);
          });
          return 4.8;
        },
      ],
      // 3. se raja el aire y se abre el desgarro: adentro, San Lorenzo
      [
        0,
        () => {
          this.openT = this.t;
          this.shake = 0.5;
          g.audio.thunder?.(R, true);
          g.fx.addShake?.(0.35);
          const look0 = R.clone().setY(R.y + RIFT_MID);
          for (const r of C.list) {
            C.turnTo(r, R);
          }
          const REACT = { valiente: ['cool', { loop: true }], miedoso: ['duck', {}], canchero: ['crossArms', { loop: true }], viejo: ['santiguar', {}] };
          for (const r of C.mates) {
            const [clip, o] = REACT[r.persona] || ['cool', { loop: true }];
            C.later(0.3 + Math.random() * 0.3, () => C.act(r, clip, { fade: 0.35, ...o }));
          }
          C.later(2.4, () => C.mates.forEach((r) => r.persona !== 'canchero' && C.act(r, r.persona === 'miedoso' ? 'pray' : 'cool', { loop: true, fade: 0.6 })));
          C.later(0.4, () => C.act(gil, 'cool', { loop: true, fade: 0.6 }));
          const c0 = this.at(F, -3.6, 1.1, 1.75);
          this.shot(5.6, (u, lt, pos, look) => {
            pos.copy(c0).addScaledVector(toR, 0.9 * smooth(u));
            look.copy(look0);
          });
          this.setFov(50);
          this.later(1.0, () => this.say('fierro', 'San Lorenzo, 3 de febrero de 1813. El Eclipse va por San Martín.'));
          this.later(3.5, () => this.say('fierro', 'Sin San Martín no hay patria. Y sin patria, no hay mate.'));
          return 5.6;
        },
      ],
      // 4. el Gil a los suyos, y van los cuatro hasta el desgarro (de atrás)
      [
        0,
        () => {
          this.steam = 0.15;
          const mid = tmpV.set(0, 0, 0);
          for (const r of C.mates) mid.add(r.pos);
          mid.multiplyScalar(1 / Math.max(1, C.mates.length));
          C.turnTo(gil, mid.clone());
          this.later(0.2, () => this.say('gil', 'Vamos a buscarlo, muchachos.'));
          this.later(1.4, () => {
            [C.mates[0], gil, C.mates[1], C.mates[2]].forEach((r, i) => r && C.walkTo(r, this.at(R, -3.4 - Math.abs(i - 1.5) * 0.3, (i - 1.5) * 1.15), 2.6, 'cool', { loop: true }));
          });
          C.later(4.2, () => C.list.forEach((r) => C.turnTo(r, R)));
          const c0 = this.at(R, -9.0, -3.2, 1.55);
          const l0 = R.clone().setY(R.y + RIFT_MID * 0.75);
          this.shot(4.4, (u, lt, pos, look) => {
            pos.copy(c0).addScaledVector(toR, 1.2 * smooth(u));
            look.copy(l0);
          });
          this.setFov(50);
          return 4.4;
        },
      ],
      // 5. el Gil de frente, con la luz del desgarro en la cara: el aviso
      [
        0,
        () => {
          const h0 = this.headOf(gil, new THREE.Vector3());
          const c0 = h0.clone().addScaledVector(toR, 1.6).addScaledVector(sd, 0.25);
          c0.y -= 0.1;
          this.shot(4.8, (u, lt, pos, look) => {
            pos.copy(c0).addScaledVector(toR, -0.2 * smooth(u));
            look.copy(this.headOf(gil, tmpW));
            look.y -= 0.12;
          });
          this.setFov(36);
          this.later(0.7, () => {
            const YES = { valiente: 'fistUp', miedoso: 'santiguar', canchero: 'cool', viejo: 'chestHand' };
            for (const r of C.mates) C.act(r, YES[r.persona] || 'cool', { fade: 0.4, loop: r.persona === 'canchero' || r.persona === 'viejo' });
          });
          this.later(0.9, () => this.say('fierro', 'Crucen cuando estén listos. Del otro lado no hay vuelta.'));
          // (el fundido, cuando Fierro terminó el aviso)
          this.later(4.0, () => this.afterVoice(() => this.fade(true)));
          return 4.8;
        },
      ],
    ];
  }

  tick(dt, t) {
    super.tick(dt);
    const U = this.rift.U;
    // el desgarro: la raja, se abre y el destello
    if (this.openT != null) {
      const lt = t - this.openT;
      U.uCrack.value = win(lt, 0, 0.5);
      U.uOpen.value = win(lt, 0.6, 2.2);
      U.uFlash.value = Math.max(0, 1 - Math.abs(lt - 0.7) / 0.9);
    }
    // el vapor del mate (en la mano del Gil): suave al cebar, una columna al levantarlo
    const g = this.g;
    const gil = this.crew?.gil;
    if (gil && this.steam > 0) {
      const h = gil.a?.hand;
      const p = h?.getWorldPosition ? h.getWorldPosition(tmpV) : tmpV.copy(gil.pos).setY(gil.pos.y + 1.2);
      p.y += 0.12;
      const n = Math.floor(dt * 60 * this.steam + Math.random());
      for (let i = 0; i < n; i++) {
        const up = 0.8 + 5.5 * this.steam;
        const sx = (Math.random() - 0.5) * 0.3;
        const sz = (Math.random() - 0.5) * 0.3;
        g.fx.alpha.spawn(p.x + sx * 0.3, p.y, p.z + sz * 0.3, sx, up * (0.8 + Math.random() * 0.4), sz, { color: [0.95, 0.92, 0.86], size: 0.12, size1: 0.6 + 1.6 * this.steam, life: 2.2 + 2.6 * this.steam, alpha: 0.32, drag: 0.15 });
        if (this.steam > 0.5 && Math.random() < 0.35) g.fx.add.spawn(p.x, p.y, p.z, sx * 2, up * (1 + Math.random() * 0.5), sz * 2, { color: [1, 0.78, 0.4], size: 0.09, size1: 0.02, life: 2.6, alpha: 0.9 });
      }
    }
  }

  cleanup() {
    // el desgarro queda abierto (lo sigue teniendo el easter egg)
    const U = this.rift.U;
    U.uOpen.value = 1;
    U.uCrack.value = 0;
    U.uFlash.value = 0;
    this.fade(false);
    super.cleanup();
  }
}

// ---------------- El cruce ----------------
export class CruceCine extends CruceBase {
  constructor(ee, rift, onWhite) {
    super(ee, rift);
    this.onWhite = onWhite;
  }

  build() {
    const g = this.g;
    this.hideField();
    this.frame();
    const { R, toR, sd } = this;
    // (los fundidos de esta escena, cortos)
    this.whiteEl.style.transition = 'opacity 0.55s';
    this.el.querySelector('.mdu-fcine__fade').style.transition = 'opacity 0.9s';
    // el cartel: con letra de libro, como el de la Gran Guerra
    this.titleEl.style.cssText = 'font:700 clamp(36px,6vw,86px)/1 Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#f3e2b0;text-shadow:0 0 30px #ff7a3a,0 0 70px #7a2aff;top:34%';
    this.cardEl.style.top = '50%';
    const C = (this.crew = makeCrew(this.ee, this.root, 720));
    C.gil.mate = true;
    const line = [C.mates[0], C.gil, C.mates[1], C.mates[2]];
    line.forEach((r, i) => {
      if (!r) return;
      const p = this.at(R, -5.4 - Math.abs(i - 1.5) * 0.4, (i - 1.5) * 1.2);
      r.pos.copy(p);
      r.pos.y = C.floor(p.x, p.z);
      r.yaw = yawTo(r.pos, R);
      C.act(r, r === C.gil ? 'cool' : 'chestHand', { loop: true });
    });
    const U = this.rift.U;
    this.rift.root.visible = true;
    U.uOpen.value = 1;
    U.uCrack.value = 0;
    // entran: el Gil primero
    const go = (r, d, side) => C.later(d, () => C.walkTo(r, this.at(R, -0.1, side), 2.5));
    go(C.gil, 0.3, 0);
    line.forEach((r, i) => r && r !== C.gil && go(r, 0.7 + i * 0.25, (i - 1.5) * 0.35));
    this.gone = new Set();
    return [
      // 1. de atrás: los cuatro van hacia el desgarro
      [
        0,
        () => {
          const c0 = this.at(R, -9.4, 1.5, 1.45);
          const l0 = R.clone().setY(R.y + RIFT_MID * 0.8);
          this.shot(3.4, (u, lt, pos, look) => {
            pos.copy(c0).addScaledVector(toR, 1.2 * smooth(u));
            look.copy(l0);
          });
          this.setFov(52);
          this.later(0.4, () => this.say('gil', '¡Vamos!'));
          eclSfx(g).load(['onda-choque']);
          return 3.4;
        },
      ],
      // 2. la cámara entra atrás de ellos: blanco
      [
        0,
        () => {
          const c0 = this.at(R, -5.2, 0.4, 2.2);
          const c1 = this.at(R, -0.3, 0, RIFT_MID);
          const l0 = this.at(R, 6, 0, RIFT_MID);
          this.shot(1.3, (u, lt, pos, look) => {
            pos.lerpVectors(c0, c1, smooth(u));
            look.copy(l0);
            this.setFov(52 + 22 * u);
          });
          this.later(0.55, () => this.white(true));
          // (el cruce: la onda de choque, un poco antes del blanco)
          // (y el cielo espera lo suyo antes de la próxima: world/eclipseSky SHOCK_GAP)
          if (globalThis.__mduOldCruceMus2 !== true) {
            this.later(0.35, () => {
              eclSfx(g).play('onda-choque', { gain: 1.0, reverb: 0.5 });
              if (g.world.eclipse) g.world.eclipse.shockAt = g.time || 0;
            });
          }
          this.later(1.25, () => this.swap());
          return 1.3;
        },
      ],
      // 3. el vuelo en San Lorenzo
      [
        0.1,
        () => {
          this.flyT = this.t;
          // (2026-10-08, el usuario: "llegando a la pelea final, en el paneo que
          // muestra todo el mapa, no hay música". La de la pelea arrancaba recién
          // en la fase 1; ahora entra con el vuelo y la fase 1 la encuentra
          // sonando (SanLorenzo.setPhase: is('jefe-eclipse')). La misma
          // condición que allá, con la fase 0. globalThis.__mduOldCruceMus: muda)
          // (2026-10-09, el usuario: "la música de la pelea final que propuse no
          // me gustó, volvé a la anterior, pero que suene cuando San Martín
          // empieza a liderar el asalto; cuando cruzás, algún sonido especial".
          // La de la pelea ('jefe-eclipse') vuelve a entrar en la fase 1, cuando
          // San Martín ya montó y desembarcan (SanLorenzo.setPhase); el cruce
          // suena con la onda de choque cósmica del usuario, en el blanco.
          // globalThis.__mduOldCruceMus2: la de la pelea desde el vuelo, como ayer)
          if (globalThis.__mduOldCruceMus !== true && globalThis.__mduOldCruceMus2 === true) {
            const A = this.ee.arena;
            const keep = (G) => !!A?.active && [0, 1, 2].includes(A.st.phase) && (G.state === 'playing' || G.state === 'paused');
            if (!g.music?.is('jefe-eclipse')) g.music?.play('jefe-eclipse', { loop: true, fadeIn: 2.5, while: keep });
          }
          this.later(0.25, () => this.white(false));
          this.later(0.4, () => g.audio.thunder?.(g.camera.position.clone(), true));
          this.later(1.4, () => this.title('San Lorenzo'));
          this.later(1.9, () => this.card('3 de febrero de 1813', 4.4));
          this.later(2.1, () => g.audio.bossArrive?.());
          this.later(6.2, () => this.title(null, false));
          this.cam = { t0: this.t, dur: FLY, fn: (u, lt, pos, look) => this.fly(lt, pos, look) };
          this.setFov(62);
          this.later(FLY - 0.9, () => this.fade(true));
          return FLY;
        },
      ],
    ];
  }

  // Debajo del blanco: la arena se arma (EclipseEgg.startArena) y el vuelo.
  swap() {
    if (this.swapped) return;
    this.swapped = true;
    this.crew?.show?.(false);
    if (this.crew?.people?.root) this.crew.people.root.visible = false;
    this.rift.root.visible = false;
    this.quiet();
    this.onWhite?.();
    this.path();
  }

  path() {
    const W = (u, v, y) => toWorld(u, v, y);
    // (a 80 m de El Eclipse —más cerca se pasaba por adentro de él— y alto sobre
    // la huerta: el galpón de tejas y la pérgola de al lado del muro se
    // cruzaban. Termina a 10 m del piso, antes del muro —más bajo, el muro
    // tapaba a San Martín—, mirándolo; el negro tapa el paso a los ojos del
    // jugador)
    this.curve = new THREE.CatmullRomCurve3([W(300, 130, 62), W(240, 124, 52), W(182, 108, 42), W(140, 50, 28), W(95, 12, 23), W(46, 0, 22), W(0, -1, 22.5), W(-24, 1.5, 24.5), W(-38, 4, 24.5)], false, 'centripetal');
    // (San Martín donde está de verdad, esperando su sable)
    const sm = this.ee.arena?.al?.sm?.r?.pos;
    this.endLook = sm ? sm.clone() : toWorld(-47.0, 6.6, null);
    this.endLook.y += 1.2;
    const B = this.ee.arena?.boss;
    this.giant = () => (B?.headAt ? B.headAt(tmpW) : toWorld(190, 30, 60, tmpW));
    this.lk = null;
  }

  fly(lt, pos, look) {
    if (!this.curve) {
      pos.copy(this.g.camera.position);
      look.copy(this.lk || pos);
      return;
    }
    const u = clamp01(lt / FLY);
    // (sale rápido del blanco y frena al llegar)
    const e = 1 - Math.pow(1 - u, 1.7);
    this.curve.getPoint(Math.min(0.999, e), pos);
    const ahead = this.curve.getPoint(Math.min(1, e + 0.05), tmpV);
    ahead.y -= 2;
    const want = ahead.clone();
    // al principio mira a El Eclipse; al final, a San Martín
    const kg = win(lt, 0, 0.8) * (1 - win(lt, 3.6, 4.8));
    if (kg > 0) want.lerp(this.giant(), kg * 0.85);
    want.lerp(this.endLook, win(lt, FLY - 2.4, FLY - 0.9));
    if (!this.lk) this.lk = want.clone();
    else this.lk.lerp(want, Math.min(1, (this.dtLast || 0.016) * 3.2));
    look.copy(this.lk);
  }

  tick(dt, t) {
    super.tick(dt);
    this.dtLast = dt;
    // el que llega al desgarro se va adentro (un destello)
    const C = this.crew;
    if (C && !this.swapped) {
      for (const r of C.list) {
        if (this.gone.has(r) || Math.hypot(r.pos.x - this.R.x, r.pos.z - this.R.z) > 0.7) continue;
        this.gone.add(r);
        r.mv = null;
        r.pos.y -= 400;
        this.rift.U.uFlash.value = 1;
        this.g.fx.sparkle(tmpV.copy(this.R).setY(this.R.y + 1.4), [0.85, 0.5, 1], 24, 1.2);
      }
      this.rift.U.uFlash.value = Math.max(0, this.rift.U.uFlash.value - dt * 2.2);
    }
  }

  skip() {
    // (saltada antes del blanco: la arena igual se arma)
    if (!this.swapped) this.swap();
    super.skip();
  }

  cleanup() {
    this.fade(false);
    this.white(false);
    super.cleanup();
  }
}

const FLY = 10.4;
