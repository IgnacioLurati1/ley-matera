import * as THREE from 'three';
import BlendScene, { loadBlendScene } from './blendScene';
import CineActors from './cineActors';

// El final nuevo de Eclipse Matero, la cinemática armada en Blender y aprobada en gris (v7, el usuario
// 2026-10-13; C:/Users/ignac/Tools/mdu-blender/fin_eclipse.py → public/assets/sotano/cine/fin-eclipse.json):
// el Gil sube lo último de la rampa y salta hacia la cara de El Eclipse; el blanco entra antes del golpe;
// en el mundo blanco lo espera Martín Fierro y hablan; Fierro se va caminando y se funde en el blanco.
// Después sigue el final de hoy (SanLorenzo.finish → ui/EclipseEnding.js).
// Fase 3, primera entrega: los cuerpos, la cámara, las voces y el blanco. Falta el pulido (la luz por
// toma, el eco de las voces, el rayo, los jinetes y los muertos del salto).
// Va con el final nuevo (entities/eclipse/slFinal.js, __mduSlFinal). globalThis.__mduOldFinBlend: sin
// esta cinemática (el blanco y el final de hoy, como antes).
const ID = 'fin-eclipse';
// el centro del mundo blanco (fin_eclipse.py: X0, Z0) y su radio
const W0 = new THREE.Vector3(1500, 0, 186);
const W_R = 70;
// el blanco del fondo (lineal) y el de la pantalla, el mismo para que no salte al pasar de uno al otro
// (224: lo que da el fondo en pantalla, medido, con el color parejo de GRADE_W)
const WHITE = 0.8;
const WHITE_CSS = 'rgb(224,224,224)';
// la luz pareja de los dos en el mundo blanco (el relleno del sombreador del gaucho)
const FILL = +(globalThis.__mduFinFill ?? 0.2);
// el brillo (bloom) en el mundo blanco, por cuánto se multiplica: con el de siempre la cara del Gil se
// prendía como una lámpara en los primeros planos y el blanco lavaba todo (con 0,25 el sombrero negro
// todavía salía marrón). Sin brillo, como la vista previa aprobada. __mduFinBloom = 1: como antes
const BLOOM_W = +(globalThis.__mduFinBloom ?? 0);
// el color de la imagen en el mundo blanco: parejo (el de la isla —world/eclipseMood.js— lo ponía verde
// menta y el blanco de pantalla, que es gris neutro, saltaba de color al irse). __mduFinMapGrade: como antes
const GRADE_W = { sat: 1, con: 1, sh: [0, 0, 0], hi: [0, 0, 0], gain: [1, 1, 1], lift: [0, 0, 0] };
// el eco de las voces en el mundo blanco (el guion: "hablan, sin música, solo el eco de las voces"; el usuario:
// "suave, que se entienda cada palabra"): un rebote bajo que se apaga rápido y un poco de la cola de siempre
// (core/audio reverb). __mduFinSinEco: sin él
const ECO = { delay: 0.26, back: 0.18, wet: 0.16, verb: 0.3, cut: 2400 };

export const finBlendOn = () => globalThis.__mduOldFinBlend !== true;
export function preloadFinEclipse() {
  return loadBlendScene(ID).catch(() => null);
}

// la sombra de contacto: un disco oscuro que se desvanece hacia el borde
let SHADOW_TEX = null;
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  SHADOW_TEX = new THREE.CanvasTexture(c);
  return SHADOW_TEX;
}

const va = new THREE.Vector3();
const mA = new THREE.Matrix4();
const mB = new THREE.Matrix4();

// El puño cerrado con el súper facón (decisión del usuario para la v5, aprobada en la v7): el gaucho no tiene
// dedos, así que la mano se achica (0,25) y un puño de piezas —cuatro dedos, el dorso y el pulgar— cierra el
// mango; la hoja sigue al antebrazo. Las mismas piezas y medidas que la vista previa (fin_eclipse.py _pieza),
// en metros, desde la muñeca (la punta del hueso RightForeArm), en los ejes del hueso (y a lo largo del brazo).
// Del cuadro 1 hasta que entra el mundo blanco. (globalThis.__mduFinSinPuno: la mano abierta y sin facón)
const MANO_ESC = 0.25;
function buildFist() {
  const G = new THREE.Group();
  G.matrixAutoUpdate = false;
  const mat = (r, gg, b, o = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(r, gg, b), roughness: 0.85, ...o });
  const piel = mat(0.62, 0.36, 0.28);
  const box = (m, size, pos) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    o.position.set(pos[0], pos[1], pos[2]);
    o.castShadow = false;
    G.add(o);
    return o;
  };
  for (let i = 0; i < 4; i++) box(piel, [0.026, 0.022, 0.05 - Math.abs(i - 1.5) * 0.004], [0, 0.03 + i * 0.021, -0.028]);
  box(piel, [0.06, 0.09, 0.05], [0, 0.06, 0.006]);
  box(piel, [0.022, 0.05, 0.022], [0.03, 0.05, -0.012]);
  // (la hoja de acero, con el brillo dorado del súper facón —su luz en entities/eclipse/slFinal faconReady—)
  box(mat(0.62, 0.64, 0.68, { metalness: 0.85, roughness: 0.3, emissive: new THREE.Color(0xffd890), emissiveIntensity: 0.35 }), [0.05, 1.0, 0.012], [0, 0.64, -0.01]);
  box(mat(0.07, 0.03, 0.012), [0.03, 0.16, 0.03], [0, 0.07, -0.01]);
  box(mat(0.68, 0.68, 0.64, { metalness: 1, roughness: 0.3 }), [0.11, 0.016, 0.03], [0, 0.145, -0.01]);
  G.visible = false;
  return G;
}

export default class FinEclipseBlend {
  // ee: el easter egg de Eclipse; D: el archivo de la escena (loadBlendScene); done: al terminar
  constructor(ee, D, done) {
    const g = (this.g = ee.g);
    this.ee = ee;
    this.D = D;
    this.done = done;
    this.t = 0;
    this.lastT = 0;
    this.over = false;
    this.wantFov = D.cam.fov[0];
    // las barras y el texto de abajo (como las escenas de la torre)
    const el = document.createElement('div');
    el.className = 'mdu-fcine is-on mdu-fcine--mid';
    el.innerHTML = '<i class="mdu-fcine__bar"></i><i class="mdu-fcine__bar mdu-fcine__bar--b"></i><p class="mdu-fcine__text"></p>';
    g.root.appendChild(el);
    this.el = el;
    this.text = el.querySelector('.mdu-fcine__text');
    // el blanco de pantalla (sube y baja con los eventos de la escena)
    const w = document.createElement('div');
    w.style.cssText = `position:fixed;inset:0;background:${WHITE_CSS};opacity:0;pointer-events:none;z-index:40`;
    (g.root || document.body).appendChild(w);
    this.white = w;
    this.wk = 0;
    this.wTo = 0;
    this.wRate = 1;
    g.hud.setBossBar?.(null);
    g.hud.show(false);
    // (los avisos de nivel esperan a que termine —ui/Levels nextToast— y el que estaba se va)
    this.holdToasts = true;
    if (g.levels?.toastEl) g.levels.toastEl.style.display = 'none';
    // (la Furia que rompió la corona termina acá, como en SanLorenzo.finish: su brillo de oro —eclK, fx/PostFX—
    // quedaba en el medio de la pantalla, encima de la cara del que estuviera ahí)
    const cos = g.weapons?.cosmic;
    if (cos) {
      cos.endFuria?.();
      cos.eclK = 0;
    }
    if (g.net?.avatars) g.net.avatars.root.visible = false;
    // los cuerpos: el Gil (el Valiente, como en ui/EclipseEnding), los tres de abajo y Fierro
    const C = (this.C = new CineActors(g, { floor: (x, z) => (Math.hypot(x - W0.x, z - W0.z) < W_R ? 0 : g.world.floorAt(x, z)) }));
    const fr = { id: 905, name: '', noTag: true, pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, moving: false, persona: 'fierro' };
    C.people.add(fr);
    fr.a = C.people.list.get(fr.id);
    fr.mate = false;
    C.list.push(fr);
    // (Fierro de cuerpo entero, con su ropa oscura: como en el final de hoy; nunca dorado)
    const FM = fr.a.M;
    FM.poncho.color.set(0x4a3a2c);
    FM.hat?.color?.set(0x1c1612);
    FM.band?.color?.set(0x6a4a2a);
    this.fierro = fr;
    const b = C.by;
    this.gil = b.valiente;
    this.B = new BlendScene(g, D, {
      actors: C,
      bind: { GIL: b.valiente, G1: b.viejo, G2: b.miedoso, G3: b.canchero, FIERRO: fr },
      on: { di: (e) => this.say(e), ev: (e) => this.event(e) },
    });
    // el mundo blanco: una esfera blanca alrededor (sin piso ni horizonte) y las sombras de contacto
    // (opaca y escribiendo profundidad: tapa el cielo, las nubes del eclipse y todo lo que queda más allá. Un
    // blanco apenas por debajo del umbral del bloom —0,85, fx/PostFX—: con 1 el brillo lavaba a los dos)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(W_R, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(WHITE, WHITE, WHITE), side: THREE.BackSide, fog: false, toneMapped: false }));
    sky.position.copy(W0);
    sky.visible = false;
    g.scene.add(sky);
    this.sky = sky;
    this.shadows = [this.gil, fr].map((r) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      g.scene.add(m);
      return { r, m };
    });
    this.fist = globalThis.__mduFinSinPuno === true ? null : buildFist();
    if (this.fist) g.scene.add(this.fist);
    // cuándo se va Fierro: el fin de su último tramo visible; se funde en los 4,5 s de antes
    const vis = D.actors.FIERRO?.vis;
    this.fierroEnd = vis?.length ? vis[vis.length - 1][1] / D.fps : D.dur;
    // (2026-10-15, el usuario: "cuando Fierro desaparece no llega a desaparecer del todo y manda pantallazo blanco".
    // Su tramo visible dura la escena entera, así que se fundía de 110,7 a 115,2 s y el blanco final —111,2— lo
    // tapaba a medio irse. Como en la vista previa aprobada (fin_eclipse.py: se funde hasta 1 s antes del blanco
    // final), termina 1 s antes del último 'blanco on'. globalThis.__mduFinFierroTarde: como antes)
    const lastOn = [...(D.events || [])].reverse().find((e) => e.name === 'blanco on')?.t;
    if (globalThis.__mduFinFierroTarde !== true && lastOn != null) this.fierroEnd = Math.min(this.fierroEnd, lastOn - 1);
    this.inWhite = false;
  }

  // Una línea: el texto abajo y la voz (de murmullo).
  say(e) {
    const T = this.text;
    T.textContent = e.text;
    T.classList.remove('is-on');
    void T.offsetWidth;
    T.classList.add('is-on');
    this.g.audio.say(e.text, e.who, { cine: true });
    this.sayEnd = this.t + (e.dur || 3) + 0.6;
  }

  // Los eventos de la escena: el blanco (sube, se pone, se va) y el final.
  event(e) {
    const n = String(e.name || '');
    const m = n.match(/^blanco funde ([\d.]+)/);
    if (m) {
      this.fadeWhite(1, +m[1]);
      // la canción termina con el blanco (como en la vista previa)
      this.g.music?.stop(+m[1]);
      // (y el ambiente con ella: ver quietWorld)
      this.quietWorld(true, +m[1]);
    } else if (n === 'blanco on') {
      this.fadeWhite(1, this.inWhite ? 0.5 : 0.01);
      if (!this.inWhite) this.whiteWorld(true);
    } else if (n === 'blanco off') this.fadeWhite(0, 0.8);
    else if (n.startsWith('sigue ')) this.end();
  }

  // (el que entra tarde en línea, entities/eclipse/slFinal startBlend) La escena desde el segundo t: el blanco
  // de pantalla y el mundo blanco como van en las otras compus (los eventos que quedaron atrás no se disparan).
  seek(t) {
    // (con el reloj del final, la hora ya es esa: no cuenta como un salto de afuera)
    this.t = t;
    this.lastT = t;
    const E = this.D.events || [];
    const at = (re) => E.find((e) => re.test(String(e.name || '')))?.t;
    const fade = at(/^blanco funde/);
    const on = at(/^blanco on$/);
    const off = at(/^blanco off$/);
    if (fade != null && t >= fade) {
      this.g.music?.stop(0.3);
      this.quietWorld(true, 0.3);
    }
    if (on != null && t >= on) {
      if (!this.inWhite) this.whiteWorld(true);
      this.wk = this.wTo = off != null && t >= off ? 0 : 1;
    } else if (fade != null && t >= fade) this.wk = this.wTo = 1;
    this.white.style.opacity = String(this.wk);
  }

  fadeWhite(to, secs) {
    this.wTo = to;
    this.wRate = 1 / Math.max(0.01, secs);
  }

  // El mundo blanco: la esfera, las sombras y la luz pareja en los dos (sin la luz de la noche de San Lorenzo).
  whiteWorld(on) {
    this.inWhite = on;
    this.sky.visible = on;
    // (el coordinador, 2026-10-13: el texto de siempre —lila claro con brillo lila, ui/style.css
    // .mdu-fcine__text— no se leía sobre el blanco. En el mundo blanco va sobre la franja oscura de los otros
    // subtítulos del juego (.mdu-subs), que se lee igual sobre el blanco y sobre el poncho del Gil en los
    // primeros planos; letra oscura sola quedaba borrosa sobre el poncho. __mduFinTextoLila: como antes)
    if (globalThis.__mduFinTextoLila !== true) {
      const st = this.text.style;
      st.color = on ? '#f6efff' : '';
      st.textShadow = on ? '0 2px 0 #000' : '';
      st.background = on ? 'linear-gradient(90deg, rgba(6, 5, 4, 0), rgba(6, 5, 4, 0.62) 14%, rgba(6, 5, 4, 0.62) 86%, rgba(6, 5, 4, 0))' : '';
      st.width = on ? 'max-content' : '';
      st.maxWidth = on ? 'min(900px, 86vw)' : '';
      st.padding = on ? '6px 40px' : '';
    }
    this.echo(on);
    this.quietWorld(on);
    const BL = this.g.post?.bloom;
    if (BL) {
      if (on) {
        this.bloom0 ??= BL.strength;
        BL.strength = this.bloom0 * BLOOM_W;
      } else if (this.bloom0 != null) {
        BL.strength = this.bloom0;
        this.bloom0 = null;
      }
    }
    for (const s of this.shadows) s.m.visible = on;
    for (const r of [this.gil, this.fierro]) {
      const U = r.a?.M?.gaucho?.userData.life;
      // (con 0,55 la cara pasaba el umbral del bloom y brillaba como una lámpara)
      if (U?.uFill) U.uFill.value.setRGB(on ? FILL : 0, on ? FILL : 0, on ? FILL : 0);
    }
  }

  // (2026-10-15, el usuario: "saca el sonido ambiente de la parte blanca de la cinemática". En el mundo blanco suenan
  // solo las voces (con su eco y su cola) y los pasos de la escena. Se apagan: el ambiente del juego —el tipo 'world'
  // de core/audio: el aire de la isla, los truenos del cielo, el clima—, el viento de fondo (startAmbience) y todos
  // los efectos, que traían el campo de San Lorenzo: el panner no baja más allá de 70 m, así que los cascos, los
  // bucles y lo demás, a 1 km, se oían como a 70; y la música —el guion: "sin música, solo el eco de las voces"—,
  // donde quedaban colchones de ronda y el aullido del viento de fondo. La cola de las voces —core/audio reverb— sale derecho y los pasos
  // van por su propio camino (BlendScene foleyBus), con el volumen de los efectos. Vuelve todo al salir.
  // globalThis.__mduFinConAmbiente: como antes)
  quietWorld(on, secs = 0.6) {
    const A = this.g.audio;
    if (!A?.ctx || globalThis.__mduFinConAmbiente === true) return;
    const now = A.ctx.currentTime;
    if (on && !this.quiet) {
      const W = A.cats?.world;
      const ps = [W?.dry.gain, W?.wet.gain, A.amb?.out.gain, A.sfx?.gain, A.hallK?.gain, A.roomK?.gain, A.music?.gain].filter(Boolean);
      const sfxV = A.sfx?.gain.value ?? 1;
      this.quiet = ps.map((p) => [p, p.value]);
      for (const p of ps) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(0, now + secs);
      }
      if (A.reverbGain && A.master) {
        A.reverbGain.connect(A.master);
        this.verbDirect = true;
      }
      if (!this.foley) {
        this.foley = A.ctx.createGain();
        this.foley.connect(A.master);
      }
      this.foley.gain.value = sfxV;
      this.B.foleyBus = this.foley;
    } else if (!on && this.quiet) {
      for (const [p, v] of this.quiet) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(v, now + 1.2);
      }
      this.quiet = null;
      if (this.verbDirect) {
        try {
          A.reverbGain.disconnect(A.master);
        } catch {
          /* ya estaba */
        }
        this.verbDirect = false;
      }
      this.B.foleyBus = null;
    }
  }

  // El eco: lo que sale por el bus de las voces vuelve con retardo (y se realimenta un poco) y entra a la
  // cola de la sala. Se prende con el mundo blanco y se quita al terminar.
  echo(on) {
    const A = this.g.audio;
    const c = A?.ctx;
    if (!c || !A.voice || globalThis.__mduFinSinEco === true) return;
    if (on && !this.eco) {
      const d = c.createDelay(1);
      d.delayTime.value = ECO.delay;
      const fb = c.createGain();
      fb.gain.value = ECO.back;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = ECO.cut;
      const wet = c.createGain();
      wet.gain.value = ECO.wet;
      const verb = c.createGain();
      verb.gain.value = ECO.verb;
      A.voice.connect(d);
      d.connect(lp).connect(fb).connect(d);
      lp.connect(wet).connect(A.master);
      A.voice.connect(verb);
      if (A.reverb) verb.connect(A.reverb);
      this.eco = { d, fb, lp, wet, verb };
    } else if (!on && this.eco) {
      const E = this.eco;
      this.eco = null;
      // (la cola se deja sonar un poco antes de cortar)
      try {
        A.voice.disconnect(E.d);
        A.voice.disconnect(E.verb);
      } catch {
        /* ya estaba */
      }
      setTimeout(() => {
        for (const n of Object.values(E)) n.disconnect();
      }, 3000);
    }
  }

  update(dt) {
    if (this.over) return true;
    // (fase 4, en línea: con clock —el reloj del final, entities/eclipse/slFinal startBlend— la escena va por la
    // hora y no por los cuadros: una compu que se traba un momento salta adelante en vez de quedarse atrás de
    // las otras. Si alguien cambia t de afuera —seek, una prueba—, el reloj se corre con él.
    // globalThis.__mduFinBlendDt: por cuadros, como antes)
    if (this.clock && globalThis.__mduFinBlendDt !== true) {
      if (this.t !== this.lastT) this.tOff = (this.tOff || 0) + (this.t - this.lastT);
      this.t = this.clock() + (this.tOff || 0);
    } else this.t += dt;
    this.lastT = this.t;
    const t = this.t;
    this.C.tick(dt);
    this.B.update(t);
    this.wantFov = this.B.fov;
    this.holdFist();
    // el blanco de pantalla
    const k = this.wk + Math.sign(this.wTo - this.wk) * Math.min(Math.abs(this.wTo - this.wk), dt * this.wRate);
    if (k !== this.wk) {
      this.wk = k;
      this.white.style.opacity = String(k);
    }
    if (this.sayEnd && t > this.sayEnd) {
      this.text.classList.remove('is-on');
      this.sayEnd = 0;
    }
    if (this.inWhite) {
      if (this.g.eclMood && globalThis.__mduFinMapGrade !== true) this.g.eclMood.grade = GRADE_W;
      // las sombras de contacto siguen a la cadera
      for (const { r, m } of this.shadows) {
        const B = r.a?.gs?.bones;
        if (!B || !r.a.group.visible) {
          m.visible = false;
          continue;
        }
        B.Hips.getWorldPosition(va);
        m.position.set(va.x, 0.005, va.z);
        m.visible = true;
      }
      // Fierro se funde en el blanco (nunca dorado: hacia el blanco)
      const f = THREE.MathUtils.clamp((t - (this.fierroEnd - 4.5)) / 4.5, 0, 1);
      if (f > 0) this.fadeFierro(f);
      // (ya ido: fuera del todo, que no quede ni un borde)
      if (f >= 1 && globalThis.__mduFinFierroTarde !== true && this.fierro.a?.group) this.fierro.a.group.visible = false;
    }
    if (t > this.B.dur + 0.5) this.end();
    return true;
  }

  // El puño y el facón siguen al antebrazo del Gil (después de que la escena lo puso en pose).
  holdFist() {
    const F = this.fist;
    if (!F) return;
    const a = this.gil.a;
    const Bn = a?.gs?.bones;
    const on = !this.inWhite && !!Bn?.RightForeArm && a.group.visible;
    if (Bn?.RightHand) Bn.RightHand.scale.setScalar(on ? MANO_ESC : 1);
    F.visible = on;
    if (!on) return;
    const fa = Bn.RightForeArm;
    fa.updateWorldMatrix(true, false);
    // (el hueso está en centímetros —escala 0,01—: las piezas van en metros desde la muñeca)
    const k = 1 / va.setFromMatrixColumn(fa.matrixWorld, 0).length();
    const h = Bn.RightHand.position;
    mA.makeTranslation(h.x, h.y, h.z);
    mB.makeScale(k, k, k);
    F.matrix.copy(fa.matrixWorld).multiply(mA).multiply(mB);
    F.matrixWorldNeedsUpdate = true;
  }

  fadeFierro(f) {
    const M = this.fierro.a?.M;
    if (!M) return;
    for (const m of Object.values(M)) {
      if (!m || m.opacity === undefined) continue;
      if (!m.transparent) {
        m.transparent = true;
        m.needsUpdate = true;
      }
      m.opacity = 1 - f;
      if (m.emissive) m.emissive.setScalar(f * 0.9);
    }
    const s = this.shadows[1]?.m;
    if (s) s.material.opacity = 1 - f;
  }

  skip() {
    this.end();
  }

  end() {
    if (this.over) return;
    this.over = true;
    const g = this.g;
    this.white.style.opacity = '1';
    this.el.remove();
    this.B.dispose?.();
    this.whiteWorld(false);
    this.foley?.disconnect();
    this.foley = null;
    this.C.dispose();
    if (this.fist) {
      const Bn = this.gil.a?.gs?.bones;
      if (Bn?.RightHand) Bn.RightHand.scale.setScalar(1);
      this.fist.removeFromParent();
      this.fist.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.fist = null;
    }
    this.sky.removeFromParent();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const { m } of this.shadows) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    if (g.net?.avatars) g.net.avatars.root.visible = true;
    if (this.ee.scene?.cine === this) this.ee.scene = null;
    // (el blanco se queda hasta que el de SanLorenzo.finish lo tapa, y se va despacio)
    const w = this.white;
    g.later(3.0, () => {
      w.style.transition = 'opacity 1s';
      w.style.opacity = '0';
      g.later(1.2, () => w.remove());
    });
    this.done?.();
  }
}
