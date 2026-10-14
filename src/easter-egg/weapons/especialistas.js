import * as THREE from 'three';
import * as Armas from '../core/armas';
import { KNIFE, BOWIE } from '../config/weapons';

// Los especialistas de la segunda vuelta en la partida (el usuario los aprobó
// el 2026-10-12; los números, core/armas.js ESP; lo fijo sobre las
// estadísticas, core/armas.js especial(), que deja st.esp). Acá lo que pasa
// tirando: el calor del Termo de ruta (Camionero), las ráfagas (Algarrobo),
// la bala cuchilla (Imperial), la salva (Explosivo), la cornada (Asta), las dos
// bombillas (Plástico), los dos mates (Gemelos), el doble sorbo (Palo Santo),
// el rebote (Silicona), la brasa (Llamarada), el chorro a presión (Vidrio), el
// tilo (Cocido), el desgarro (Caótico), la bendición (Caballero), el cerrojo
// (Torpedo), el bombeo (Lata), el rebato (Campanario) y la bombilla a
// voluntad (Bombillazo).
//
// En línea: cada uno calcula el daño de sus tiros (el invitado lo manda al
// anfitrión con el especialista: Session 'hit' es). Lo que les pasa a los
// muertos (adormecer, voltear, prender fuego, el vacío) lo decide el
// anfitrión (golpe, mata) y lo muestra en todas las compus ('oper'). Las bajas
// que le sirven al que tiró (la bendición, el cerrojo) el anfitrión se las
// avisa ('operb'). Los compañeros oyen y ven los tiros dobles, la estela y el
// rebote (Session sendShot: n, tc, rp, rb) y el vapor del Camionero caliente.
//
// __mduSinEspecialistas = true (o __mduSinAccesorios): nada de esto.

const off = () => globalThis.__mduSinAccesorios === true || Armas.sinNuevos();
const N = (id) => Armas.ESP[id];
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = (t) => t * t * (3 - 2 * t);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// los que no se voltean ni se adormecen: jefes y bichos especiales
const especial = (z) => !z || z.boss || z.dog || z.jinete || z.crow || z.pombero || z.yasy || z.stake || z.horse;

// la cornada: cuánto dura el golpe en la mano (s) y cuándo pega
const CORNADA = { dur: 0.6, pega: 0.2, embiste: 0.1 };
// el volteado: cae, queda en el piso ESP.cornada.volteo s y se levanta
export const VOLTEO = { cae: 0.35, sube: 0.65 };

// El vacío del Caótico: el agujero oscuro (opaco al centro, se esfuma al
// borde) y el borde de luz violeta (fresnel), sombreadores chicos propios.
const VACIO_VS = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const HUECO_FS = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float c = abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(uColor, uOpacity * pow(c, 0.8));
}`;
const BORDE_FS = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(uColor * pow(f, 2.2) * uOpacity, 1.0);
}`;
function vacioMats() {
  const hueco = new THREE.ShaderMaterial({ vertexShader: VACIO_VS, fragmentShader: HUECO_FS, uniforms: { uColor: { value: new THREE.Color(0x07000f) }, uOpacity: { value: 0 } }, transparent: true, depthWrite: false });
  const borde = new THREE.ShaderMaterial({ vertexShader: VACIO_VS, fragmentShader: BORDE_FS, uniforms: { uColor: { value: new THREE.Color(0xb070ff).multiplyScalar(2.2) }, uOpacity: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return { hueco, borde };
}

// El indicador de temperatura y las cargas de la salva (HUD).
const CSS = `
.mdu-termo { position: relative; width: 112px; height: 7px; margin: 4px 0 0 auto; border-radius: 4px; background: rgba(10, 8, 6, 0.55); box-shadow: 0 0 0 1px rgba(255, 220, 170, 0.22); overflow: hidden; opacity: 0; transition: opacity 0.25s; }
.mdu-termo.is-on { opacity: 1; }
.mdu-termo i { position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--k, 0) * 100%); border-radius: 4px; background: linear-gradient(90deg, #f0c060, #f07a28 55%, #e2261a); }
.mdu-termo b { position: absolute; left: -15px; top: -5px; width: 9px; height: 15px; }
.mdu-termo.is-hot i { animation: mdu-termo-late 0.5s ease-in-out infinite alternate; }
.mdu-termo.is-lock { box-shadow: 0 0 0 1px #ff5a3a, 0 0 10px rgba(255, 70, 30, 0.7); }
.mdu-termo.is-lock i { background: #ff3a1e; animation: mdu-termo-lock 0.18s steps(2) infinite; }
@keyframes mdu-termo-late { to { filter: brightness(1.35); } }
@keyframes mdu-termo-lock { 50% { opacity: 0.45; } }
.mdu-termo.is-filo i { background: linear-gradient(90deg, #7f93a8, #cfe0f0); }
.mdu-termo.is-filo.is-ready { box-shadow: 0 0 0 1px #e8f4ff, 0 0 10px rgba(170, 210, 255, 0.85); }
.mdu-termo.is-filo.is-ready i { background: #f2f9ff; animation: mdu-termo-late 0.35s ease-in-out infinite alternate; }
.mdu-salva { position: absolute; left: 50%; top: calc(50% + 26px); display: flex; gap: 6px; transform: translateX(-50%); pointer-events: none; opacity: 0; transition: opacity 0.12s; }
.mdu-salva.is-on { opacity: 1; }
.mdu-salva i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 0 1.5px rgba(255, 210, 140, 0.8); }
.mdu-salva i.is-in { background: #ffb040; box-shadow: 0 0 0 1.5px #ffd890, 0 0 8px #ff9a30; animation: mdu-salva-in 0.18s ease-out; }
@keyframes mdu-salva-in { from { transform: scale(1.8); } }
`;

export class Especialistas {
  constructor(W) {
    this.W = W;
    this.g = W.g;
    this.r = { n: 1, kick: 1, dos: false, fan: 0, gap: 0.03 };
    // los muertos con fuego que mostrar (en los invitados: el anfitrión lo
    // dibuja en su Zombies.think), los adormecidos y los vacíos
    this.fuegos = new Map();
    this.dormidos = new Set();
    this.zzz = [];
    this.vacios = [];
    // los volteados que se están mostrando (entities/zombieReel los anota)
    this.volt = new Set();
    this.reset();
  }

  reset() {
    this.heat = 0;
    this.lockT = 0;
    this.lastShot = -9;
    this.cuchN = 0;
    this.burstLeft = 0;
    this.salvaN = 0;
    this.salvaFire = 0;
    this.rb = { desde: -9, last: -9, on: false };
    this.brasaZ = null;
    this.brasaN = 0;
    this.brasaT = -9;
    this.cornCd = 0;
    this.derecho = false;
    this.calorNivel = 0;
    this.fuegos.clear();
    for (const z of this.dormidos) z.tiloT = 0;
    this.dormidos.clear();
    for (const s of this.zzz) s.sp.visible = false;
    for (const v of this.vacios) v.g.visible = false;
    this.hud(null);
  }

  // ---------------- lo que cambia según cómo se tira ----------------
  // Weapons.stats: lo que depende del momento (apuntando o no, tirando seguido).
  vivo(st) {
    if (off()) return;
    const W = this.W;
    if (st.esp === 'bombeo' && W.adsT < 0.5) {
      // de cadera bombea solo: automático, más rápido y más abierto
      st.auto = true;
      st.rpm *= 1 + N('bombeo').cadencia;
      st.spread *= 1 + N('bombeo').dispersion;
    } else if (st.esp === 'rebato' && this.rb.on) st.rpm *= 1 + N('rebato').cadencia;
  }

  // ---------------- cada cuadro ----------------
  update(dt, input) {
    const g = this.g;
    const W = this.W;
    this.cornCd = Math.max(0, this.cornCd - dt);
    this.derecho = !!input?.mouse?.right;
    const st = W.slot ? W.stats : null;
    const esp = !off() && st?.esp;
    // el rebato se corta al soltar
    if (this.rb.on && (!input?.mouse?.left || g.time - this.rb.last > 0.3 || esp !== 'rebato')) this.rb.on = false;
    // la salva se suelta (o se corta si cambió algo)
    if (this.salvaN > 0) {
      if (esp !== 'salva' || W.state !== 'idle') this.salvaN = 0;
      else this.salvaTick(input, st);
    }
    if (esp !== 'rafaga') this.burstLeft = 0;
    // la barra chica debajo de la munición: el calor del Camionero o lo que
    // falta para la bala cuchilla del Imperial
    this.hud(esp === 'termo' ? this.heat / N('termo').tiros : esp === 'cuchilla' ? Math.min(1, this.cuchN / N('cuchilla').cada) : null, esp);
    this.virola(esp === 'cuchilla' && this.cuchN >= N('cuchilla').cada);
    // la cornada: el golpe en su momento y el fin
    if (W.state === 'cornada') {
      if (!this.cornHit && W.stateT >= CORNADA.pega) this.cornadaGolpe();
      if (W.stateT >= CORNADA.dur) W.state = 'idle';
    }
    this.termo(dt, esp === 'termo');
    this.updateZzz(dt);
    this.updateVacios(dt);
    this.updateHojas(dt);
    this.updateCortes(dt);
    this.updateFuegos();
    this.updateVolteados();
    this.vaporCompas(dt);
    // (anfitrión o solo) el sueño del tilo se va
    if (this.dormidos.size) {
      for (const z of this.dormidos) {
        z.tiloT -= dt;
        if (z.tiloT <= 0 || !z.active || z.dead) {
          z.tiloT = 0;
          this.dormidos.delete(z);
        }
      }
    }
    this.hudSalva(esp === 'salva' ? this.salvaN : 0);
  }

  // ---------------- la entrada ----------------
  // Weapons.handleInput, después de la R. true: la usó él.
  input(input, st, p, s) {
    if (off() || s.temp) return false;
    const W = this.W;
    const g = this.g;
    const id = st.esp;
    if (id === 'voluntad') return input.mouse.leftPressed && this.voluntad();
    if (id === 'termo' && this.lockT > 0) {
      if (input.mouse.leftPressed) g.audio.empty();
      return true;
    }
    if (id !== 'rafaga' && id !== 'salva') return false;
    if (W.state !== 'idle' || (p.sprinting && !g.emp?.sprintFire()) || g.ee?.maq?.cranking) {
      this.salvaN = 0;
      return false;
    }
    if (s.mag <= 0) {
      this.burstLeft = 0;
      this.salvaN = 0;
      return false;
    }
    if (id === 'salva') {
      if (this.salvaN > 0) return true;
      if (input.mouse.leftPressed && W.fireCd <= 0) {
        this.salvaN = 1;
        this.salvaT0 = g.time;
        this.click();
      }
      return true;
    }
    // ráfaga de cuatro (Algarrobo): la ráfaga sigue aunque se suelte el
    // gatillo; manteniéndolo, sale otra después de la pausa
    if (this.burstLeft > 0) {
      if (W.fireCd > 0) return true;
      this.burstLeft--;
      W.fire(st);
      if (this.burstLeft <= 0) W.fireCd += N('rafaga').pausa;
      return true;
    }
    const trigger = st.auto ? input.mouse.left : input.mouse.leftPressed;
    if (!trigger || W.fireCd > 0) return true;
    W.fire(st);
    this.burstLeft = N('rafaga').balas - 1;
    return true;
  }

  // La salva: mientras se mantiene, entra una cada `carga` s (hasta las que hay
  // en el cargador); al soltar salen todas en abanico.
  salvaTick(input, st) {
    const W = this.W;
    const g = this.g;
    const S = N('salva');
    const s = W.slot;
    const can = Math.min(S.max, s.mag);
    const n = Math.min(can, 1 + Math.floor((g.time - this.salvaT0) / S.carga));
    if (n > this.salvaN) {
      this.salvaN = n;
      this.click();
      W.recoilKick = Math.min(1.5, W.recoilKick + 0.12);
    }
    if (input.mouse.left) return;
    this.salvaFire = this.salvaN;
    this.salvaN = 0;
    W.fire(st);
  }

  // A voluntad (Bombillazo): la bombilla propia en el aire o clavada revienta ya.
  voluntad() {
    const W = this.W;
    let p = null;
    for (const q of W.projectiles) if (q.kind === 'bolt' && !q.ghost && q.st?.id === 'bombillazo' && (!p || q.t < p.t)) p = q;
    if (!p) return false;
    W.projectiles.splice(W.projectiles.indexOf(p), 1);
    W.boltBoom(p);
    this.g.net?.share('oper', { k: 'bomb', x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) });
    return true;
  }

  // ---------------- el tiro ----------------
  // Weapons.fire, después de gastar la bala: cuántos salen (n), la patada
  // (kick), si tiran los dos mates (dos) y el abanico de la salva (fan).
  alDisparar(st, s) {
    const r = this.r;
    r.n = 1;
    r.kick = 1;
    r.dos = false;
    r.fan = 0;
    r.gap = 0.03;
    r.st = null;
    r.cu = false;
    if (!st.esp || off() || s.temp) return r;
    const g = this.g;
    const W = this.W;
    switch (st.esp) {
      case 'dobleSorbo':
        // (dos balas, una del cargador: el usuario, 2026-10-13)
        r.n = N('dobleSorbo').balas;
        r.gap = 0.028;
        break;
      case 'lasDos':
        // (apuntando: las dos bombillas a la vez, un solo estampido doble)
        if (W.ads && s.mag > 0) {
          s.mag--;
          r.n = 2;
          r.kick = 1 + N('lasDos').retroceso;
          r.gap = 0.012;
          g.fx.addShake(0.12);
        }
        break;
      case 'losDos':
        if (this.derecho && W.model2 && s.mag > 0) {
          s.mag--;
          r.n = 2;
          r.dos = true;
          r.gap = 0.018;
        }
        break;
      case 'salva':
        if (this.salvaFire > 1) {
          const extra = Math.min(this.salvaFire - 1, s.mag);
          s.mag -= extra;
          r.n = 1 + extra;
          r.fan = N('salva').abanico;
          r.kick = 1 + extra * 0.45;
          // (juntas pegan más: cada cohete, el impacto y la explosión)
          const k = 1 + N('salva').danio;
          const P = st.projectile;
          r.st = { ...st, projectile: { ...P, damage: P.damage * k, splash: (P.splash ?? P.damage) * k } };
          r.gap = 0.07;
          if (extra) g.fx.addShake(0.1 + extra * 0.05);
        }
        this.salvaFire = 0;
        break;
      case 'termo':
        // no recarga: la bala sale de la reserva mientras haya
        if (s.reserve > 0) {
          s.reserve--;
          s.mag++;
        }
        this.calentar();
        break;
      case 'cuchilla':
        // cada 15 tiros, el siguiente es la bala cuchilla
        if (this.cuchN >= N('cuchilla').cada) {
          this.cuchN = 0;
          r.cu = true;
          r.kick = 1.6;
          r.st = { ...st, cuchilla: true, pen: 1 + N('cuchilla').atraviesa, penMult: 1 };
          this.filoSonido(null);
          g.fx.addShake(0.08);
        } else this.cuchN++;
        break;
      case 'rebato': {
        const R = this.rb;
        if (g.time - R.last > 0.3) R.desde = g.time;
        R.last = g.time;
        if (!R.on && g.time - R.desde >= N('rebato').espera) {
          R.on = true;
          this.campana();
        }
        break;
      }
      default:
        break;
    }
    // los tiros de más se oyen (un poco corridos: el doble estampido)
    for (let i = 1; i < r.n; i++) g.later(r.gap * i, () => g.audio.shot(st.sound, null, st.upgraded));
    return r;
  }

  // La boca del otro mate (los Gemelos tirando los dos).
  muzzle2(out) {
    const W = this.W;
    const m = W.side ? W.model : W.model2;
    m.muzzle.getWorldPosition(out);
    return this.g.camera.localToWorld(out);
  }

  // La dirección de cada cohete de la salva: abanico parejo de lado a lado.
  abanico(fwd, i, n, fan, out = new THREE.Vector3()) {
    return out.copy(fwd).applyAxisAngle(UP, (i - (n - 1) / 2) * fan);
  }

  // Lo que los compañeros tienen que saber del tiro (Session sendShot).
  red(st, r) {
    if (off() || !st.esp) return undefined;
    const x = {};
    if (r.n > 1 && st.kind === 'hitscan') x.n = r.n;
    if (st.tracer) x.tc = st.tracer;
    if (r.cu) x.cu = 1;
    if (this.rebote) {
      x.rp = this.rebote.a;
      x.rb = this.rebote.b;
      this.rebote = null;
    }
    return Object.keys(x).length ? x : undefined;
  }

  // El tiro de un compañero (Session remoteShot): los de más y el rebote.
  remoteShot(m, vis, to) {
    const g = this.g;
    if (m.n > 1) {
      for (let i = 1; i < Math.min(4, m.n); i++) {
        g.later(0.025 * i, () => g.audio.shot(m.k, vis, !!m.u));
        g.fx.tracer(vis, tmpV.copy(to).add(tmpV2.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), m.tc ?? 0xfff0c8);
      }
    }
    if (Array.isArray(m.rp) && Array.isArray(m.rb)) {
      const a = new THREE.Vector3().fromArray(m.rp);
      const b = new THREE.Vector3().fromArray(m.rb);
      this.reboteFx(a, b);
    }
    if (m.tc === 0xffc640) this.dorado(vis, to);
    if (m.cu) {
      this.filoFx(vis, to);
      this.filoSonido(vis);
    }
  }

  // ---------------- la bala cuchilla (Imperial) ----------------
  // Weapons.hitscan: lo que pega. A los comunes los mata; a los jefes y
  // minijefes, `jefes` veces la bala normal.
  filo(z, st, point) {
    if (point) this.corte(point);
    const jefe = z.boss || z.pombero || z.crow || z.yasy || z.stake;
    return jefe ? st.damage * N('cuchilla').jefes : 1e9;
  }

  // El tajo donde la bala cuchilla corta a uno: un arco de luz de plata de
  // frente a la cámara, que se abre y se apaga (0,25 s).
  corte(at) {
    const g = this.g;
    let c = (this.cortes ||= []).find((x) => !x.m.visible);
    if (!c) {
      if (this.cortes.length >= 6) c = this.cortes.reduce((p, q) => (p.t > q.t ? p : q));
      else {
        this.arcoGeo ||= new THREE.RingGeometry(0.82, 1, 28, 1, 0, 2.3);
        const m = new THREE.Mesh(this.arcoGeo, new THREE.MeshBasicMaterial({ color: 0xe6f2ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        m.frustumCulled = false;
        m.visible = false;
        m.renderOrder = 3;
        g.scene.add(m);
        c = { m, t: 0, rot: 0 };
        this.cortes.push(c);
      }
    }
    c.t = 0;
    c.rot = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7) - 1.15;
    c.m.position.copy(at);
    c.m.visible = true;
    for (let i = 0; i < 10; i++) g.fx.add.spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, { color: [0.85, 0.93, 1], size: 0.03, size1: 0, life: 0.3 + Math.random() * 0.2, gravity: 6 });
  }

  updateCortes(dt) {
    const cam = this.g.camera;
    for (const c of this.cortes || []) {
      if (!c.m.visible) continue;
      c.t += dt;
      const k = c.t / 0.25;
      if (k >= 1) {
        c.m.visible = false;
        continue;
      }
      c.m.quaternion.copy(cam.quaternion);
      c.m.rotateZ(c.rot);
      c.m.scale.setScalar(0.4 + ease(Math.min(1, k * 2)) * 0.25);
      c.m.material.opacity = (1 - k) * (k < 0.15 ? k / 0.15 : 1);
    }
  }

  // La estela: una hoja de plata (dos rombos cruzados, finos en las puntas y
  // anchos al medio) con el filo blanco al centro; se apaga en 0,22 s.
  filoFx(a, b) {
    const g = this.g;
    g.fx.beam(a, b, { color: 0xffffff, width: 0.012, life: 0.12 });
    let h = (this.hojas ||= []).find((x) => !x.m.visible);
    if (!h) {
      if (this.hojas.length >= 4) h = this.hojas.reduce((p, q) => (p.t > q.t ? p : q));
      else {
        if (!this.hojaGeo) {
          // rombo de 0 a 1 en z, ancho 1 en el medio (a 0,35), y otro cruzado
          const v = [0, 0, 0, 0.5, 0, 0.35, 0, 0, 1, -0.5, 0, 0.35, 0, 0.5, 0.35, 0, -0.5, 0.35];
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
          geo.setIndex([0, 1, 2, 0, 2, 3, 0, 4, 2, 0, 2, 5]);
          this.hojaGeo = geo;
        }
        const m = new THREE.Mesh(this.hojaGeo, new THREE.MeshBasicMaterial({ color: 0xe6f2ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        m.frustumCulled = false;
        m.visible = false;
        m.renderOrder = 3;
        g.scene.add(m);
        h = { m, t: 0 };
        this.hojas.push(h);
      }
    }
    const len = a.distanceTo(b);
    h.t = 0;
    h.m.position.copy(a);
    // de frente a la cámara, girando sobre su eje (si no, desde atrás del
    // tiro se ve de canto y no se ve)
    const d = tmpV.subVectors(b, a).normalize();
    const n = tmpV2.subVectors(g.camera.position, a);
    n.addScaledVector(d, -n.dot(d));
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    const x = (this.tmpX ||= new THREE.Vector3()).crossVectors(n, d);
    h.m.quaternion.setFromRotationMatrix((this.tmpM ||= new THREE.Matrix4()).makeBasis(x, n, d));
    h.m.scale.set(0.24, 0.24, len);
    h.m.visible = true;
    // (chispas de plata a lo largo)
    for (let i = 0; i < 8; i++) {
      const k = Math.random();
      g.fx.add.spawn(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, (Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2, { color: [0.8, 0.9, 1], size: 0.035, size1: 0, life: 0.35 + Math.random() * 0.25, gravity: 2 });
    }
  }

  updateHojas(dt) {
    for (const h of this.hojas || []) {
      if (!h.m.visible) continue;
      h.t += dt;
      const k = h.t / 0.22;
      if (k >= 1) {
        h.m.visible = false;
        continue;
      }
      h.m.material.opacity = 0.9 * (1 - k) * (1 - k);
      // (se afina mientras se apaga)
      h.m.scale.x = h.m.scale.y = 0.24 * (1 - k * 0.6);
    }
  }

  // Lista: un aro de luz plateada abraza la virola del Imperial (con la
  // virola de la armería puesta o no) y le salta alguna chispita.
  virola(on) {
    const m = this.W.model;
    const g = this.g;
    if (this.virolaM && this.virolaM !== m && this.virolaM.filo) this.virolaM.filo.aro.visible = false;
    let F = m?.filo;
    if (!F && on && m && this.W.slot?.id === 'imperial') {
      const vi = m.mate?.userData?.virola;
      if (!vi?.geometry) return;
      vi.geometry.computeBoundingBox();
      const b = vi.geometry.boundingBox;
      const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
      const mat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const aro = new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, r * 0.07, 6, 40), mat);
      aro.rotation.x = Math.PI / 2;
      aro.position.copy(vi.position);
      aro.position.y += (b.min.y + b.max.y) / 2;
      aro.renderOrder = 2;
      aro.visible = false;
      vi.parent.add(aro);
      F = m.filo = { mat, aro };
    }
    this.virolaM = F ? m : null;
    if (!F) return;
    const k = on ? 0.5 + Math.sin(g.time * 7) * 0.2 : 0;
    F.mat.color.setRGB(0.55 * k, 0.72 * k, 1.0 * k);
    F.aro.visible = k > 0.01;
    // (cada tanto una chispita sale del aro)
    if (on && Math.random() < 0.08) {
      F.aro.updateWorldMatrix(true, false);
      const p = this.g.camera.localToWorld(F.aro.getWorldPosition(tmpV));
      g.fx.add.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, { color: [0.8, 0.9, 1], size: 0.012, size1: 0, life: 0.5 });
    }
  }

  // ---------------- los golpes ----------------
  // Weapons.hitscan: la Llamarada cuenta los seguidos al mismo muerto. Devuelve
  // el especialista que va en el golpe ('brasa' solo en el que prende).
  brasa(z) {
    const g = this.g;
    const B = N('brasa');
    if (z !== this.brasaZ || g.time - this.brasaT > B.hueco) {
      this.brasaZ = z;
      this.brasaN = 0;
    }
    this.brasaT = g.time;
    this.brasaN++;
    // (las brasas que se le juntan: más a cada tiro)
    const at = tmpV.set(z.pos.x, (z.baseY || 0) + 1.2 * (z.scale || 1), z.pos.z);
    g.fx.sparkle(at, [1, 0.5, 0.12], Math.min(6, this.brasaN + 1), 0.5);
    if (this.brasaN < B.tiros) return undefined;
    this.brasaN = 0;
    this.brasaZ = null;
    return 'brasa';
  }

  // Weapons.hitscan: la bala de goma rebota en la pared o el piso (una vez).
  rebota(st, dir, point, normal, dmgBase) {
    const g = this.g;
    const W = this.W;
    const D = N('deGoma');
    const d = tmpV.copy(dir).reflect(normal).normalize();
    // (un poco afuera, para que el rayo no vuelva a tocar la misma pared)
    const from = tmpV2.copy(point).addScaledVector(normal, 0.03);
    const hitTmp = (this.hitTmp ||= {});
    const wallT = g.world.raycast(from, d, D.metros, hitTmp);
    const maxT = Math.min(wallT, D.metros);
    const hits = g.zombies.raycast(from, d, maxT);
    let endT = maxT;
    const h = hits[0];
    if (h) {
      endT = h.t;
      const at = new THREE.Vector3().copy(from).addScaledVector(d, h.t);
      const mult = h.zone === 'head' ? st.headMult : h.zone === 'neck' ? Math.max(1, st.headMult * 0.5) : 1;
      g.zombies.damage(h.z, dmgBase * D.danio * mult * W.zoneMult(h.zone, h.z), { type: 'bullet', zone: h.zone, arm: h.arm, point: at, dir: d.clone(), elem: st.elem, esp: 'deGoma' });
      g.hud.hitmarker(h.zone === 'head');
    }
    const a = point.clone();
    const b = new THREE.Vector3().copy(from).addScaledVector(d, Math.min(endT, D.metros));
    this.reboteFx(a, b);
    this.rebote = { a: a.toArray().map((x) => +x.toFixed(2)), b: b.toArray().map((x) => +x.toFixed(2)) };
  }

  // Lo que se ve y se oye del rebote (acá y en los compañeros).
  reboteFx(a, b) {
    const g = this.g;
    g.fx.beam(a, b, { color: 0xffd0f0, width: 0.022, life: 0.07 });
    // (chispitas de goma rosada y celeste donde pica)
    for (let i = 0; i < 6; i++) {
      const c = i % 2 ? [1, 0.5, 0.85] : [0.5, 0.9, 1];
      g.fx.add.spawn(a.x, a.y, a.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, { color: c, size: 0.035, size1: 0.01, life: 0.25 + Math.random() * 0.2, gravity: 8, bounce: 1 });
    }
    // el "boing" (de a uno cada tanto: la Silicona tira 16 por segundo)
    if (g.time - (this.boingT || -9) > 0.22) {
      this.boingT = g.time;
      this.boing(a);
    }
  }

  // ---------------- en el anfitrión: lo que les pasa a los muertos ----------------
  // entities/Zombies.damage, con el muerto todavía vivo (info.esp: el especialista del tiro).
  golpe(z, info) {
    const g = this.g;
    if (off() || g.net?.guest) return;
    const id = info.esp;
    if (id === 'tilo') this.adormecer(z);
    else if (id === 'cornada') this.voltear(z, info.dir);
    else if (id === 'brasa' && !z.boss && !(z.burnT > 0)) {
      const B = N('brasa');
      z.burnT = B.segundos;
      z.burnBy = info.by;
      z.burnWp = g.zombies.burnWp(info, 'bullet');
      g.zombies.paint(z, 0x6a3a20);
      this.prendio(z, B.segundos, true);
    }
  }

  // El fuego que prendió la brasa: se ve en todas las compus (fwoosh: el estallido).
  prendio(z, secs, fwoosh = false) {
    const g = this.g;
    const zi = z.id & 0xffff;
    this.fuegoFx(z, fwoosh);
    g.net?.share('oper', { k: 'fuego', zi, sg: +secs.toFixed(1), f: fwoosh ? 1 : 0 });
  }

  // entities/Zombies.damage, cuando el golpe lo mató. dmg: lo que pegó.
  mata(z, info, dmg) {
    const g = this.g;
    if (off() || g.net?.guest) return;
    const id = info.esp;
    if (id === 'desgarro') this.desgarro(z, info, dmg);
    else if (id === 'bendicion' || id === 'cerrojo') {
      if (id === 'bendicion' && info.zone !== 'head') return;
      const mio = info.by == null || info.by === g.net?.id;
      if (mio) this.bajaPropia(id);
      else g.net?.net?.to?.(info.by, { t: 'operb', k: id });
    }
  }

  // Session 'operb': una baja del invitado que le sirve a su especialista.
  bajaRemota(m) {
    if (m?.k === 'bendicion' || m?.k === 'cerrojo') this.bajaPropia(m.k);
  }

  bajaPropia(id) {
    const g = this.g;
    const W = this.W;
    const s = W.slot;
    if (!s || off()) return;
    if (id === 'bendicion') {
      if (s.id !== 'caballero') return;
      const st = W.stats;
      const n = Math.min(N('bendicion').balas, st.mag - s.mag, s.reserve);
      if (n <= 0) return;
      s.mag += n;
      s.reserve -= n;
      W.updateHud();
      this.bendicion();
    } else if (id === 'cerrojo') {
      if (s.id !== 'torpedo' || W.fireCd <= N('cerrojo').espera) return;
      W.fireCd = N('cerrojo').espera;
      this.cerrojoFx();
    }
  }

  // El tilo: el que recibe un saquito camina a la mitad un rato (no los jefes;
  // el mismo, no de nuevo hasta un rato después de despertarse).
  adormecer(z) {
    const g = this.g;
    const T = N('tilo');
    if (especial(z) || z.dead || (z.tiloImm || 0) > g.time) return;
    z.tiloT = T.segundos;
    z.tiloImm = g.time + T.segundos + T.otraVez;
    this.dormidos.add(z);
    this.zzzDe(z, T.segundos);
    g.net?.share('oper', { k: 'tilo', zi: z.id & 0xffff, sg: T.segundos });
  }

  // La cornada voltea: cae, queda en el piso y se levanta (entities/zombieReel
  // 'volteado'; el estado viaja en la foto de la red).
  voltear(z, dir) {
    const g = this.g;
    const C = N('cornada');
    if (especial(z) || z.dead || z.crawler || (z.volteoImm || 0) > g.time) return;
    if (!['chase', 'attack', 'reel'].includes(z.state)) return;
    const total = VOLTEO.cae + C.volteo + VOLTEO.sube;
    g.zombies.setState(z, 'volteado');
    z.reelT = total;
    const l = Math.hypot(dir?.x || 0, dir?.z || 0) || 1;
    z.reelV = { x: ((dir?.x || 0) / l) * 3.2, z: ((dir?.z || 0) / l) * 3.2 };
    z.volteoImm = g.time + total + C.otraVez;
    // de espaldas: el golpe vino de adelante
    z.deathBack = true;
  }

  // El desgarro: la baja revienta en un vacío chico que lastima a los de al lado.
  desgarro(z, info, dmg) {
    const g = this.g;
    const D = N('desgarro');
    const at = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.1 * (z.scale || 1), z.pos.z);
    this.vacioFx(at);
    g.net?.share('oper', { k: 'vacio', x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) });
    const pega = Math.max(1, dmg * D.danio);
    for (const { z: o } of g.zombies.inRadius(at, D.radio, [])) {
      if (o === z || o.dead) continue;
      const p = new THREE.Vector3(o.pos.x, (o.baseY || 0) + 1.1 * (o.scale || 1), o.pos.z);
      // (sin esp: lo que mata el vacío no revienta otra vez)
      g.zombies.damage(o, pega, { type: 'bullet', zone: 'torso', point: p, dir: p.clone().sub(at).setY(0).normalize(), by: info.by, wp: info.wp, noPoints: info.noPoints });
    }
  }

  // ---------------- la cornada (la V con el Asta) ----------------
  // Weapons.handleInput: true si cornea (si no, la V es el cuchillo de siempre).
  cornada(st) {
    const W = this.W;
    const g = this.g;
    if (off() || st?.esp !== 'cornada' || this.cornCd > 0 || W.slot?.temp) return false;
    if (['knife', 'throw', 'drink', 'cornada', 'raise'].includes(W.state)) return false;
    W.pourSnd?.stop();
    W.state = 'cornada';
    W.stateT = 0;
    this.cornHit = false;
    this.cornCd = N('cornada').recarga;
    g.net?.act?.('stab');
    // la embestida: hasta 2 m, sin pasar al primero que tiene adelante
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
    const p = g.player;
    let dist = N('cornada').metros;
    for (const { z, d } of g.zombies.inRadius(p.pos, dist + 1)) {
      const dx = z.pos.x - p.pos.x;
      const dz = z.pos.z - p.pos.z;
      if ((dx * fwd.x + dz * fwd.z) / (d || 1) > 0.6) dist = Math.min(dist, Math.max(0, d - 0.95));
    }
    if (dist > 0.05) g.later(CORNADA.embiste, () => p.alive && p.lunge(tmpV2.copy(p.pos).add(fwd), dist));
    this.cornadaSonido(false);
    return true;
  }

  cornadaGolpe() {
    const g = this.g;
    const W = this.W;
    const p = g.player;
    const C = N('cornada');
    this.cornHit = true;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
    const list = [];
    for (const { z, d } of g.zombies.inRadius(p.pos, C.alcance)) {
      if (z.dead || Math.abs((z.pos.y || 0) - p.pos.y) > 1.6) continue;
      const dx = z.pos.x - p.pos.x;
      const dz = z.pos.z - p.pos.z;
      if ((dx * fwd.x + dz * fwd.z) / (d || 1) < 0.45) continue;
      list.push({ z, d });
    }
    list.sort((a, b) => a.d - b.d);
    // pega como el cuchillo (con el Facón de Plata y las empanadas que lo suben)
    let dmg = KNIFE.damage;
    if (W.bowie) dmg = g.rounds.round <= BOWIE.oneHitUntil ? 1e9 : KNIFE.damage * BOWIE.mult;
    dmg *= g.emp?.knifeMult() ?? 1;
    for (const { z } of list.slice(0, C.max)) {
      const point = new THREE.Vector3(z.pos.x, (z.baseY || 0) + 1.25 * (z.scale || 1), z.pos.z);
      g.zombies.damage(z, dmg, { type: 'knife', zone: 'torso', point, dir: fwd.clone(), esp: 'cornada' });
      g.fx.blood(point, fwd, 10, 1.1);
    }
    if (list.length) {
      g.hud.hitmarker(false);
      g.fx.addShake(0.16);
      p.addRecoil?.(0.02, 0);
      this.cornadaSonido(true);
    }
  }

  // ---------------- la pose de la mano ----------------
  // Weapons.animate, después de armarla (como el Lanzapava).
  pose(holder) {
    const W = this.W;
    if (W.state === 'cornada') {
      // atrás y abajo (la guampa adelante), el tirón para adelante y vuelta
      const k = clamp(W.stateT / CORNADA.dur);
      const pull = ease(clamp(k / 0.25));
      const hit = ease(clamp((k - 0.2) / 0.15));
      const back = ease(clamp((k - 0.5) / 0.5));
      const fwd = hit * (1 - back);
      holder.position.z += pull * 0.05 * (1 - hit) - fwd * 0.16;
      holder.position.y -= pull * 0.03 * (1 - back) + fwd * 0.02;
      holder.position.x -= fwd * 0.05;
      holder.rotation.x -= pull * 0.35 * (1 - back) + fwd * 0.25;
      holder.rotation.y += fwd * 0.5;
      holder.rotation.z += fwd * 0.35;
    }
    // recalentado: el mate baja y se inclina, humeando (la pausa bien marcada)
    if (this.lockK > 0) {
      const e = ease(this.lockK);
      holder.position.y -= e * 0.06;
      holder.position.x += e * 0.015;
      holder.rotation.x -= e * 0.32;
      holder.rotation.z += e * 0.28 + Math.sin(this.g.time * 31) * 0.006 * e;
    }
    // la salva: tiembla un poco más con cada cohete que entra
    if (this.salvaN > 1) {
      const j = (this.salvaN - 1) * 0.0018;
      holder.position.x += (Math.random() - 0.5) * j;
      holder.position.y += (Math.random() - 0.5) * j;
    }
  }

  // ---------------- el Termo de ruta (Camionero) ----------------
  calentar() {
    const T = N('termo');
    this.heat = Math.min(T.tiros, this.heat + 1);
    this.lastShot = this.g.time;
    if (this.heat >= T.tiros && this.lockT <= 0) {
      this.lockT = T.pausa;
      this.recalentado();
    }
  }

  termo(dt, enMano) {
    const g = this.g;
    const T = N('termo');
    if (this.lockT > 0) {
      this.lockT = Math.max(0, this.lockT - dt);
      // (durante la pausa se enfría entero)
      this.heat = T.tiros * (this.lockT / T.pausa);
    } else if (g.time - this.lastShot > T.espera) this.heat = Math.max(0, this.heat - T.enfria * dt);
    // la pose de la pausa: entra rápido y sale al final
    const want = this.lockT > 0.35 ? 1 : this.lockT > 0 ? this.lockT / 0.35 : 0;
    this.lockK = enMano ? (this.lockK || 0) + clamp(want - (this.lockK || 0), -dt * 5, dt * 6) : 0;
    const k = this.heat / T.tiros;
    this.brillo(enMano ? k : 0);
    if (!enMano) return;
    // el vapor por la boca del mate: más cuanto más caliente
    this.vaporT = (this.vaporT || 0) - dt;
    if (k > 0.3 && this.vaporT <= 0) {
      this.vaporT = this.lockT > 0 ? 0.03 : 0.16 - k * 0.12;
      const m = this.W.muzzleWorld(tmpV);
      const big = this.lockT > 0 ? 1.6 : 0.6 + k;
      this.g.fx.alpha?.spawn(m.x, m.y, m.z, (Math.random() - 0.5) * 0.18, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.18, { color: [0.88, 0.89, 0.9], size: 0.02 * big, size1: 0.13 * big, life: 0.7 + Math.random() * 0.5, alpha: 0.18 + k * 0.22, drag: 1.4 });
    }
    // a los compañeros: cuánto humea (0 a 3), solo cuando cambia
    const nivel = this.lockT > 0 ? 3 : k > 0.75 ? 2 : k > 0.4 ? 1 : 0;
    if (nivel !== this.calorNivel) {
      this.calorNivel = nivel;
      g.net?.share('oper', { k: 'calor', id: g.net.id, h: nivel });
    }
  }

  // El rojo que sube: una cáscara del cuerpo del mate, aditiva, que se prende
  // de a poco (con los materiales del mate no se toca nada: son compartidos).
  brillo(k) {
    const m = this.W.model;
    let H = m?.heat;
    if (k > 0.01 && m && !H && this.W.slot?.id === 'camionero') H = this.cascara(m);
    if (this.heatModel && this.heatModel !== m) this.heatModel.heat?.meshes.forEach((x) => (x.visible = false));
    this.heatModel = H ? m : null;
    if (!H) return;
    const on = k > 0.01;
    const late = this.lockT > 0 ? 0.85 + Math.sin(this.g.time * 18) * 0.15 : 1;
    // de rojo oscuro a rojo brasa (sin llegar al amarillo: con el bloom se
    // lavaba a blanco)
    const e = Math.pow(k, 1.5) * late;
    H.mat.color.setRGB(0.5 * e, (0.015 + 0.03 * k) * e, 0.006 * e);
    H.metal.color.setRGB(0.55 * e, (0.08 + 0.08 * k) * e, 0.02 * e);
    for (const x of H.meshes) x.visible = on;
  }

  cascara(m) {
    const mat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const metal = mat.clone();
    const meshes = [];
    m.mate?.traverse((o) => {
      if (!o.isMesh || o.userData.heatShell) return;
      const lathe = o.geometry?.type === 'LatheGeometry';
      const cylinder = o.geometry?.type === 'CylinderGeometry';
      if (!lathe && !cylinder) return;
      const s = new THREE.Mesh(o.geometry, lathe ? mat : metal);
      s.userData.heatShell = true;
      s.scale.setScalar(1.02);
      s.renderOrder = 2;
      s.visible = false;
      o.add(s);
      meshes.push(s);
    });
    m.heat = { mat, metal, meshes };
    return m.heat;
  }

  recalentado() {
    const g = this.g;
    this.siseo(null);
    // la bocanada de vapor
    const m = this.W.muzzleWorld(tmpV);
    for (let i = 0; i < 16; i++) {
      g.fx.alpha?.spawn(m.x, m.y, m.z, (Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.9, (Math.random() - 0.5) * 0.9, { color: [0.9, 0.9, 0.92], size: 0.05, size1: 0.35, life: 0.9 + Math.random() * 0.6, alpha: 0.35, drag: 1.6 });
    }
    g.fx.addShake(0.06);
    this.W.recoilKick = Math.min(1.5, this.W.recoilKick + 0.4);
  }

  // El indicador de temperatura, debajo de la munición (k: 0 a 1; null: no se ve).
  hud(k, esp) {
    const box = this.g.hud?.ammoBox;
    if (!box) return;
    if (!this.hudEl) {
      if (k == null) return;
      css();
      this.hudEl = document.createElement('div');
      this.hudEl.className = 'mdu-termo';
      this.hudEl.innerHTML = '<i></i>';
      this.hudFill = this.hudEl.firstChild;
    }
    if (this.hudEl.parentElement !== box) box.appendChild(this.hudEl);
    const on = k != null;
    const kk = on ? Math.round(k * 100) / 100 : 0;
    if (kk !== this.hudK) {
      this.hudK = kk;
      this.hudEl.style.setProperty('--k', kk);
    }
    const filo = esp === 'cuchilla';
    const cls = `mdu-termo${on ? ' is-on' : ''}${filo ? ` is-filo${k >= 1 ? ' is-ready' : ''}` : on && this.lockT > 0 ? ' is-lock' : on && k > 0.75 ? ' is-hot' : ''}`;
    if (cls !== this.hudCls) {
      this.hudCls = cls;
      this.hudEl.className = cls;
    }
  }

  // Las cargas de la salva, debajo de la mira.
  hudSalva(n) {
    if (!this.salvaEl) {
      if (!n) return;
      const host = this.g.hud?.cross?.parentElement;
      if (!host) return;
      css();
      this.salvaEl = document.createElement('div');
      this.salvaEl.className = 'mdu-salva';
      this.salvaEl.innerHTML = '<i></i><i></i><i></i><i></i>';
      host.appendChild(this.salvaEl);
    }
    if (n === this.salvaShown) return;
    this.salvaShown = n;
    this.salvaEl.classList.toggle('is-on', n > 0);
    [...this.salvaEl.children].forEach((d, i) => d.classList.toggle('is-in', i < n));
  }

  // ---------------- lo que se ve ----------------
  // La estela dorada del Último sorbo: más gruesa que un trazo común y con chispas.
  dorado(a, b) {
    const g = this.g;
    g.fx.beam(a, b, { color: 0xffd060, width: 0.05, life: 0.09 });
    g.fx.sparkle(a, [1, 0.82, 0.3], 3, 0.15);
  }

  // Fuego en un muerto (en los invitados: el anfitrión lo ve en su Zombies.think).
  fuegoFx(z, fwoosh) {
    const g = this.g;
    const at = tmpV.set(z.pos.x, (z.baseY || 0) + 1, z.pos.z);
    if (fwoosh) {
      g.fx.fire(at, 0.7, 10);
      g.fx.flash(at, 0xff7a20, 10, 0.25, 7);
      this.fwoosh(at);
    }
  }

  updateFuegos() {
    if (!this.fuegos.size) return;
    const g = this.g;
    for (const [zi, f] of this.fuegos) {
      const z = f.z?.active && (f.z.id & 0xffff) === zi ? f.z : (f.z = g.net?.findZombie?.(zi));
      if (!z || z.dead || g.time > f.until) {
        this.fuegos.delete(zi);
        continue;
      }
      if (Math.random() < 0.5) g.fx.fire(tmpV.set(z.pos.x, (z.baseY || 0) + 0.8 + Math.random(), z.pos.z), 0.4, 1);
    }
  }

  // Las zetas del tilo: suben de la cabeza del adormecido y se apagan.
  zzzDe(z, secs) {
    const g = this.g;
    const at = tmpV.set(z.pos.x, (z.baseY || 0) + 1.7 * (z.scale || 1), z.pos.z);
    // el polvillo amarillo del saquito
    for (let i = 0; i < 10; i++) {
      g.fx.alpha?.spawn(at.x, at.y - 0.3, at.z, (Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.2, { color: [0.86, 0.8, 0.45], size: 0.05, size1: 0.3, life: 0.9 + Math.random() * 0.5, alpha: 0.3, drag: 2 });
    }
    this.soplo(at);
    (this.zzzSrc ||= []).push({ z, until: g.time + secs, next: 0 });
  }

  updateZzz(dt) {
    const g = this.g;
    const src = this.zzzSrc || [];
    for (let i = src.length - 1; i >= 0; i--) {
      const s = src[i];
      if (!s.z.active || s.z.dead || g.time > s.until) {
        src.splice(i, 1);
        continue;
      }
      if ((s.next -= dt) > 0) continue;
      s.next = 0.55;
      const sp = this.zzzSprite();
      if (!sp) continue;
      sp.z = s.z;
      sp.t = 0;
      sp.side = Math.random() < 0.5 ? -1 : 1;
      sp.sp.visible = true;
    }
    for (const s of this.zzz) {
      if (!s.sp.visible) continue;
      s.t += dt;
      const k = s.t / 1.3;
      if (k >= 1 || !s.z?.active) {
        s.sp.visible = false;
        continue;
      }
      const z = s.z;
      s.sp.position.set(z.pos.x + s.side * (0.12 + k * 0.25), (z.baseY || 0) + (1.85 + k * 0.7) * (z.scale || 1), z.pos.z);
      s.sp.scale.setScalar(0.16 + k * 0.16);
      s.sp.material.opacity = Math.min(1, k * 5) * (1 - k * k) * 0.95;
      s.sp.material.rotation = s.side * (0.25 - k * 0.3);
    }
  }

  zzzSprite() {
    if (!this.zzz.length) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.font = 'bold 54px Georgia, serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 6;
      x.strokeStyle = 'rgba(40, 30, 10, 0.85)';
      x.strokeText('z', 32, 30);
      x.fillStyle = '#f4e7a8';
      x.fillText('z', 32, 30);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      for (let i = 0; i < 12; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        sp.visible = false;
        sp.renderOrder = 3;
        this.g.scene.add(sp);
        this.zzz.push({ sp, t: 0, z: null, side: 1 });
      }
    }
    return this.zzz.find((s) => !s.sp.visible) || null;
  }

  // El vacío del Caótico: una esfera negra que se abre con borde violeta, se
  // chupa las motas y se cierra (0,45 s).
  vacioFx(at) {
    const g = this.g;
    let v = this.vacios.find((x) => !x.g.visible);
    if (!v) {
      if (this.vacios.length >= 6) v = this.vacios.reduce((a, b) => (a.t > b.t ? a : b));
      else {
        const grp = new THREE.Group();
        const M = vacioMats();
        const core = new THREE.Mesh(this.vacioGeo(), M.hueco);
        const halo = new THREE.Mesh(this.vacioGeo(), M.borde);
        core.renderOrder = 3;
        halo.renderOrder = 4;
        const ring = new THREE.Mesh((this.ringGeo ||= new THREE.RingGeometry(0.9, 1, 48)), new THREE.MeshBasicMaterial({ color: 0x6af0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        grp.add(core, halo, ring);
        grp.visible = false;
        g.scene.add(grp);
        v = { g: grp, core, halo, ring, t: 0 };
        this.vacios.push(v);
      }
    }
    v.t = 0;
    v.g.position.copy(at);
    v.g.visible = true;
    const R = N('desgarro').radio;
    // las motas del caos que el vacío se chupa
    for (let i = 0; i < 26; i++) {
      tmpV2.set(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize().multiplyScalar(R * (0.8 + Math.random() * 0.5));
      const c = Math.random() < 0.5 ? [0.6, 0.3, 1] : [0.4, 0.95, 1];
      g.fx.add.spawn(at.x + tmpV2.x, at.y + tmpV2.y, at.z + tmpV2.z, 0, 0, 0, { color: c, size: 0.06, size1: 0.01, life: 0.45 + Math.random() * 0.2, attract: at.clone() });
    }
    g.fx.flash(at, 0xa060ff, 14, 0.3, 6);
    this.vacioSonido(at);
  }

  vacioGeo() {
    return (this.sphGeo ||= new THREE.SphereGeometry(1, 20, 14));
  }

  updateVacios(dt) {
    const R = N('desgarro').radio;
    const cam = this.g.camera;
    for (const v of this.vacios) {
      if (!v.g.visible) continue;
      v.t += dt;
      const k = v.t / 0.45;
      if (k >= 1) {
        v.g.visible = false;
        continue;
      }
      // se abre de golpe (el 30 % primero) y se cierra chupándose
      const open = k < 0.3 ? ease(k / 0.3) : 1 - ease((k - 0.3) / 0.7);
      const r = Math.max(0.02, R * 0.5 * open);
      v.core.scale.setScalar(r * 0.92);
      v.core.material.uniforms.uOpacity.value = 0.96 * Math.min(1, open * 1.5);
      v.halo.scale.setScalar(r);
      v.halo.material.uniforms.uOpacity.value = 1.1 * Math.min(1, open * 1.3);
      // la onda: un anillo fino que sale hasta el radio del daño y se apaga
      v.ring.quaternion.copy(cam.quaternion);
      v.ring.scale.setScalar(R * (0.25 + ease(Math.min(1, k * 1.8)) * 0.75));
      v.ring.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }

  // Los volteados que se levantaron: el cuerpo vuelve derecho (el andar no
  // toca rootPitch: entities/zombieReel). En todas las compus.
  updateVolteados() {
    const list = this.volt;
    for (const z of list) {
      if (z.state === 'volteado') continue;
      list.delete(z);
      if (!z.dead && z.state !== 'dead' && z.P) {
        z.P.rootPitch = 0;
        z.P.rootY = 0;
      }
    }
  }

  // ---------------- la red: lo que muestra cada compu ----------------
  // Session applyEvent 'oper'. (ojo: el mensaje no puede llevar `t`, que es
  // el tipo del mensaje de la red; los segundos van en `sg`)
  evento(m) {
    const g = this.g;
    if (off()) return;
    if (m.k === 'fuego') {
      const z = g.net?.findZombie?.(m.zi);
      if (!z) return;
      if (g.net?.guest) this.fuegos.set(m.zi, { z, until: g.time + (+m.sg || 3) });
      if (m.f) this.fuegoFx(z, true);
    } else if (m.k === 'tilo') {
      const z = g.net?.findZombie?.(m.zi);
      if (z) this.zzzDe(z, +m.sg || 2);
    } else if (m.k === 'vacio') this.vacioFx(new THREE.Vector3(m.x, m.y, m.z));
    else if (m.k === 'bomb') {
      // la bombilla del compañero que reventó a voluntad (su copia, acá)
      const W = this.W;
      let best = null;
      let bd = 9;
      for (const p of W.projectiles) {
        if (p.kind !== 'bolt' || !p.ghost) continue;
        const d = p.pos.distanceToSquared(tmpV.set(m.x, m.y, m.z));
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        W.projectiles.splice(W.projectiles.indexOf(best), 1);
        W.boltBoom(best);
      }
    } else if (m.k === 'calor') {
      (this.calorDe ||= new Map()).set(m.id, m.h | 0);
      if (m.h === 3) this.siseo(g.net?.avatars?.muzzleOf?.(m.id, new THREE.Vector3()) || null);
    }
  }

  // El vapor del Camionero caliente de los compañeros (en su mate).
  vaporCompas(dt) {
    const g = this.g;
    if (!this.calorDe?.size) return;
    this.compaT = (this.compaT || 0) - dt;
    if (this.compaT > 0) return;
    this.compaT = 0.09;
    for (const [id, h] of this.calorDe) {
      if (!h || Math.random() > h / 3 + 0.15) continue;
      const m = g.net?.avatars?.muzzleOf?.(id, tmpV);
      if (!m) continue;
      const big = h === 3 ? 2.2 : 1 + h * 0.4;
      g.fx.alpha?.spawn(m.x, m.y, m.z, (Math.random() - 0.5) * 0.2, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, { color: [0.88, 0.89, 0.9], size: 0.03 * big, size1: 0.18 * big, life: 0.8 + Math.random() * 0.4, alpha: 0.28, drag: 1.4 });
    }
  }

  // ---------------- sonidos (sintetizados: core/audio) ----------------
  snd(fn, pos = null, gain = 0.6) {
    const A = this.g.audio;
    if (!A?.ctx) return;
    try {
      fn(A, A.out({ pos, gain, reverb: 0.08 }), A.now);
    } catch (e) {
      console.error(e);
    }
  }

  // el siseo del Camionero recalentado (y el tin del metal caliente)
  siseo(pos) {
    this.snd(
      (A, o, t) => {
        A.noise(o, { t, dur: 1.5, type: 'highpass', freq: 3800, freqEnd: 2400, q: 0.6, gain: 0.55, attack: 0.02 });
        A.noise(o, { t, dur: 0.9, type: 'bandpass', freq: 900, freqEnd: 500, q: 1.2, gain: 0.3, attack: 0.01 });
        A.tone(o, { t: t + 0.02, dur: 0.35, type: 'triangle', freq: 2650, gain: 0.05 });
      },
      pos,
      pos ? 0.75 : 0.6,
    );
  }

  // la campana del rebato
  campana() {
    this.snd((A, o, t) => {
      for (const [f, gn, d] of [[784, 0.16, 1.6], [784 * 2.76, 0.06, 0.9], [784 * 5.4, 0.03, 0.5], [392, 0.07, 1.8]]) A.tone(o, { t, dur: d, type: 'sine', freq: f, gain: gn, attack: 0.002 });
      A.noise(o, { t, dur: 0.04, type: 'bandpass', freq: 3200, q: 3, gain: 0.3 });
    }, null, 0.55);
  }

  boing(pos) {
    this.snd((A, o, t) => {
      A.tone(o, { t, dur: 0.14, type: 'triangle', freq: 420, freqEnd: 190, gain: 0.12 });
      A.noise(o, { t, dur: 0.025, type: 'bandpass', freq: 1800, q: 2, gain: 0.25 });
    }, pos, 0.5);
  }

  vacioSonido(pos) {
    this.snd((A, o, t) => {
      A.tone(o, { t, dur: 0.5, type: 'sine', freq: 120, freqEnd: 32, gain: 0.45, attack: 0.01 });
      A.noise(o, { t, dur: 0.38, type: 'bandpass', freq: 3200, freqEnd: 260, q: 1.4, gain: 0.5, attack: 0.03 });
      A.tone(o, { t: t + 0.05, dur: 0.3, type: 'sawtooth', freq: 300, freqEnd: 90, gain: 0.05 });
    }, pos, 0.8);
  }

  // el silbido de la cuchilla: un filo que se desenvaina
  filoSonido(pos) {
    this.snd((A, o, t) => {
      A.noise(o, { t, dur: 0.32, type: 'bandpass', freq: 5200, freqEnd: 8200, q: 6, gain: 0.5, attack: 0.01 });
      A.tone(o, { t, dur: 0.4, type: 'sine', freq: 2900, freqEnd: 3500, gain: 0.07 });
      A.tone(o, { t, dur: 0.25, type: 'triangle', freq: 4350, gain: 0.03 });
    }, pos ? pos.clone() : null, pos ? 0.7 : 0.55);
  }

  cerrojoFx() {
    this.W.recoilKick = Math.min(1.5, this.W.recoilKick + 0.25);
    this.snd((A, o, t) => {
      A.noise(o, { t, dur: 0.035, type: 'bandpass', freq: 2600, q: 5, gain: 0.8 });
      A.noise(o, { t: t + 0.07, dur: 0.035, type: 'bandpass', freq: 1900, q: 5, gain: 0.7 });
      A.tone(o, { t: t + 0.07, dur: 0.05, type: 'square', freq: 520, gain: 0.03 });
    }, null, 0.6);
  }

  // la bendición: un brillo dorado en el mate y un tin de campanita
  bendicion() {
    const g = this.g;
    const m = this.W.muzzleWorld(tmpV);
    g.fx.sparkle(m, [1, 0.86, 0.4], 6, 0.12);
    this.snd((A, o, t) => {
      A.tone(o, { t, dur: 0.3, type: 'triangle', freq: 1568, gain: 0.07 });
      A.tone(o, { t: t + 0.06, dur: 0.4, type: 'triangle', freq: 2093, gain: 0.06 });
    }, null, 0.5);
    g.hud?.ammo?.animate?.([{ transform: 'scale(1.25)', color: '#ffe08a' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }

  click() {
    this.snd((A, o, t) => {
      A.noise(o, { t, dur: 0.025, type: 'bandpass', freq: 3400, q: 4, gain: 0.7 });
      A.tone(o, { t, dur: 0.05, type: 'square', freq: 780 + (this.salvaN || 1) * 120, gain: 0.035 });
    }, null, 0.5);
  }

  cornadaSonido(golpe) {
    this.snd((A, o, t) => {
      if (!golpe) A.noise(o, { t, dur: 0.28, type: 'bandpass', freq: 500, freqEnd: 1700, q: 1.3, gain: 0.55, attack: 0.04 });
      else {
        A.tone(o, { t, dur: 0.2, type: 'sine', freq: 95, freqEnd: 45, gain: 0.5 });
        A.noise(o, { t, dur: 0.12, type: 'lowpass', freq: 700, q: 0.8, gain: 0.8 });
      }
    }, null, 0.65);
  }

  fwoosh(pos) {
    this.snd((A, o, t) => {
      A.noise(o, { t, dur: 0.55, type: 'bandpass', freq: 380, freqEnd: 1500, q: 0.9, gain: 0.7, attack: 0.05 });
      A.noise(o, { t, dur: 0.3, type: 'lowpass', freq: 300, q: 0.7, gain: 0.5 });
    }, pos ? pos.clone() : null, 0.7);
  }

  soplo(pos) {
    this.snd((A, o, t) => {
      A.noise(o, { t, dur: 0.35, type: 'lowpass', freq: 900, freqEnd: 400, q: 0.6, gain: 0.35, attack: 0.03 });
      A.tone(o, { t: t + 0.05, dur: 0.6, type: 'sine', freq: 520, freqEnd: 330, gain: 0.03 });
    }, pos ? pos.clone() : null, 0.5);
  }

  // Lo que se compila al cargar el mapa (Weapons.warmFx): el vacío y las zetas.
  warm(grp) {
    if (off()) return;
    const M = vacioMats();
    grp.add(new THREE.Mesh(this.vacioGeo(), M.hueco), new THREE.Mesh(this.vacioGeo(), M.borde));
    const s = this.zzzSprite();
    if (s) grp.add(new THREE.Sprite(s.sp.material));
  }
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}
