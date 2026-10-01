import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import Epic, { LEVELS, FOLIAGE_B } from './Epic';
import Surfaces from './Surfaces';
import TAAPass from './TAA';
import FsrPass, { FSR_SCALE } from './Fsr';
import { FEATURES } from '../config/map';

// Lo del pasto alto del estero (Mate no Numa) va solo en ese mapa: el MSAA del
// mundo con recortes suaves, el suavizado temporal y el grano a la mitad. En
// los otros mapas quedaba peor que antes: las luces de Épica (que se calculan
// sin MSAA) dejaban dientes en los bordes, y sin el grano de siempre se veía
// el ruido de las sombras. Ahí sigue todo como era (SMAA, grano 0,06).
const grassy = () => !!FEATURES.esteros;

// muestras por píxel del MSAA del mundo (Ultra y Épica)
const MSAA = 4;

// Postproceso con la estética de BO1: mundo + mate en primera persona,
// brillo en luces, corrección de color desaturada y contrastada, viñeta,
// grano de película, pantalla roja al recibir daño y gris al caer.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    // el golpe recibido (Player.hitFx): cuánto queda y de qué lado vino (x: derecha, y: adelante)
    uHit: { value: 0 },
    uHitDir: { value: new THREE.Vector2() },
    uDown: { value: 0 },
    uFlash: { value: 0 },
    uCrit: { value: 0 },
    uPulse: { value: 0 },
    uVida: { value: 0 },
    uUnder: { value: 0 },
    // Dying Wish (entities/dyingWish.js): la adrenalina y su latido
    uWish: { value: 0 },
    uWishBeat: { value: 0 },
    uUnderCol: { value: new THREE.Color(0.06, 0.07, 0.05) },
    // (a la mitad: con la cámara en movimiento el grano hacía titilar el pasto)
    uGrain: { value: 0.03 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uHurt, uHit, uDown, uFlash, uGrain, uCrit, uPulse, uVida, uUnder, uWish, uWishBeat; uniform vec2 uRes, uHitDir; uniform vec3 uUnderCol;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // aberración cromática sutil en los bordes
      float beat = uCrit * uPulse;
      float wb = uWish * uWishBeat;
      float ca = 0.0018 + uHurt * 0.004 + uHit * 0.01 + beat * 0.007 + uWish * 0.004 + wb * 0.009;
      // el latido "empuja" la imagen hacia afuera
      uv = 0.5 + c * (1.0 - beat * 0.012 - wb * 0.022);
      // gaucho life: la imagen ondula como vista a través del agua
      uv += uVida * vec2(sin(uv.y * 24.0 + uTime * 2.3), cos(uv.x * 20.0 + uTime * 1.9)) * 0.0022;
      // abajo del agua: la imagen ondula despacio
      uv += uUnder * vec2(sin(uv.y * 13.0 + uTime * 1.5), cos(uv.x * 10.0 + uTime * 1.2)) * 0.0045;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // desaturar y contrastar (look BO1)
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.78);
      col = (col - 0.5) * 1.08 + 0.5;
      // sombras frías, luces cálidas
      col += vec3(-0.01, 0.0, 0.02) * (1.0 - l) + vec3(0.02, 0.008, -0.012) * l;
      // caído: gris y oscuro
      float lg = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lg) * vec3(0.9, 0.9, 1.0), uDown * 0.85);
      // daño: bordes rojos pulsando
      float edge = smoothstep(0.08, 0.45, r2);
      col = mix(col, vec3(0.45, 0.0, 0.0), edge * uHurt * (0.75 + 0.25 * sin(uTime * 8.0)));
      // el golpe: un flash rojo, más fuerte del lado de donde vino, y la imagen que se oscurece un instante
      float hitSide = 0.3 + 0.7 * clamp(dot(normalize(c + vec2(1e-4)), uHitDir) * 0.5 + 0.5, 0.0, 1.0);
      col = mix(col, vec3(0.6, 0.02, 0.0), smoothstep(0.02, 0.3, r2) * uHit * hitSide * 0.85);
      col *= 1.0 - uHit * 0.12;
      // a un golpe de caer: casi sin color y con los bordes latiendo en rojo oscuro
      col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uCrit * 0.5);
      col = mix(col, vec3(0.28, 0.0, 0.01), smoothstep(0.04, 0.5, r2) * uCrit * (0.45 + 0.55 * uPulse));
      col *= 1.0 - smoothstep(0.02, 0.6, r2) * uCrit * (0.25 + 0.35 * uPulse);
      // gaucho life: todo frío y azulado, con los bordes brillando
      float lv = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lv * 0.55, lv * 0.85, lv * 1.35 + 0.03), uVida * 0.8);
      col += vec3(0.05, 0.25, 0.6) * smoothstep(0.12, 0.6, r2) * uVida * (0.7 + 0.3 * sin(uTime * 3.0));
      // abajo del agua: turbio, del color del agua y más cerrado
      if (uUnder > 0.001) {
        vec3 bl = (texture2D(tDiffuse, uv + vec2(0.005, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.005, 0.0)).rgb + texture2D(tDiffuse, uv + vec2(0.0, 0.008)).rgb + texture2D(tDiffuse, uv - vec2(0.0, 0.008)).rgb) * 0.25;
        col = mix(col, bl, uUnder * 0.6);
        float lu = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, uUnderCol * (0.5 + lu * 3.0), uUnder * 0.5);
        col *= 1.0 - smoothstep(0.04, 0.5, r2) * 0.55 * uUnder;
      }
      // Dying Wish: un túnel que tira hacia el medio, todo gris menos lo rojo
      // (que se enciende), mucho contraste y los bordes rojos latiendo
      if (uWish > 0.001) {
        vec3 zb = vec3(0.0);
        for (int i = 0; i < 6; i++) zb += texture2D(tDiffuse, 0.5 + c * (1.0 - float(i) * (0.006 + wb * 0.008))).rgb;
        col = mix(col, zb / 6.0, smoothstep(0.02, 0.3, r2) * uWish);
        float lw = dot(col, vec3(0.299, 0.587, 0.114));
        float red = clamp((col.r - max(col.g, col.b)) * 4.0, 0.0, 1.0);
        vec3 wc = mix(vec3(lw) * vec3(1.12, 0.9, 0.88), col * vec3(1.5, 0.55, 0.55), red);
        col = mix(col, wc, uWish * 0.9);
        col = (col - 0.5) * (1.0 + 0.35 * uWish) + 0.5;
        col = mix(col, vec3(0.5, 0.0, 0.03), smoothstep(0.06, 0.45, r2) * uWish * (0.45 + 0.5 * uWishBeat));
        col += vec3(0.16, 0.0, 0.02) * wb;
      }
      // viñeta
      col *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.55;
      // grano: parejo en lo claro y apenas en lo oscuro (lo justo para que la
      // niebla de noche no se vea en escalones; con todo el grano se veía sucia)
      float n = hash(uv * uRes + fract(uTime * 13.0) * 100.0) - 0.5;
      float grainL = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * (0.008 + uGrain * 0.55 * smoothstep(0.04, 0.5, grainL));
      // destello blanco (kaboom / easter egg)
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

// con MSAA (WorldPass), los recortes con alphaTest (pasto, cañas, flecos de
// paja) usan alpha to coverage: el borde del recorte también sale suavizado.
// También la pasada de profundidad del pajonal (fx/prepass, sin color): si
// no, escribía la profundidad en todas las muestras del borde y el color solo
// en algunas, y las otras quedaban sin pintar (puntitos negros en el pajonal).
let a2c = false;

function single(m) {
  if (m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass && m.blending === THREE.AdditiveBlending) m.forceSinglePass = true;
  if (m.alphaTest > 0 && !m.transparent && !!m.alphaToCoverage !== a2c) {
    m.alphaToCoverage = a2c;
    m.needsUpdate = true;
  }
}

// El mundo, con MSAA de Ultra para arriba. El SMAA mira la imagen terminada: con
// el pasto del estero (hojas y cañas más finas que un píxel) no alcanza y los
// bordes titilaban al moverse. Con varias muestras por píxel la placa cubre de
// verdad cada hoja: se dibuja en un blanco multimuestra y se copia al del
// composer (lo que viene después no usa la profundidad del mundo: Épica tiene
// su propio G-buffer).
class WorldPass extends RenderPass {
  constructor(scene, camera) {
    super(scene, camera);
    this.samples = 0;
    this.msaa = null;
    this.w = 1;
    this.h = 1;
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false }));
  }

  setSamples(n) {
    if (n === this.samples) return;
    this.samples = n;
    this.msaa?.dispose();
    this.msaa = null;
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.msaa?.setSize(w, h);
  }

  render(renderer, writeBuffer, readBuffer, dt, mask) {
    if (!this.samples || this.renderToScreen) return super.render(renderer, writeBuffer, readBuffer, dt, mask);
    // (con su profundidad: la usa el suavizado temporal para llevar lo de antes)
    if (!this.msaa) this.msaa = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: this.samples, depthTexture: new THREE.DepthTexture(this.w, this.h) });
    super.render(renderer, writeBuffer, this.msaa, dt, mask);
    const m = this.copy.material;
    m.uniforms.tDiffuse.value = this.msaa.texture;
    renderer.setRenderTarget(readBuffer);
    this.copy.render(renderer);
  }

  dispose() {
    this.msaa?.dispose();
    this.copy.dispose();
    this.copy.material.dispose();
  }
}

function sweepOne(o) {
  const ms = o.material;
  if (!ms) return;
  if (!Array.isArray(ms)) return single(ms);
  for (const m of ms) single(m);
}

export default class PostFX {
  constructor(renderer, scene, camera, vmScene, vmCamera, game) {
    this.renderer = renderer;
    this.game = game;
    this.composer = new EffectComposer(renderer);
    this.world = new WorldPass(scene, camera);
    this.vm = new RenderPass(vmScene, vmCamera);
    this.vm.clear = false;
    this.vm.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.85);
    // un píxel NaN/Inf que entra al bloom se desparrama por todos sus niveles y
    // pone la pantalla entera en negro: se descarta antes de filtrar el brillo.
    // Se mira con los bits porque isnan() no anda en todas las placas (con
    // ANGLE sobre D3D11 una AMD siempre da falso). El tope evita que los
    // brillos extremos (un reflejo muy fino) desborden al sumar los niveles.
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\ttexel = clamp( mix( texel, vec4( 0.0 ), greaterThan( floatBitsToUint( texel ) & 0x7fffffffu, uvec4( 0x7f800000u ) ) ), 0.0, 64.0 );',
    );
    hp.needsUpdate = true;
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new FXAAPass();
    this.smaa = new SMAAPass();
    this.smaa.enabled = false;
    this.epic = new Epic(this, renderer, scene, camera);
    this.surfaces = new Surfaces();
    this.surfaces.setScene(scene, game?.world?.T);
    this.composer.addPass(this.world);
    for (const p of this.epic.passes) this.composer.addPass(p);
    // el suavizado temporal (Épica): después de la luz y antes del mate en la mano
    this.taa = new TAAPass(camera, () => this.world.msaa?.depthTexture || this.epic.gbuffer.depthTexture, () => this.epic.gbuffer.target.texture, FOLIAGE_B / 15);
    this.taa.enabled = false;
    this.composer.addPass(this.taa);
    this.composer.addPass(this.vm);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.fxaa);
    this.composer.addPass(this.smaa);
    // AMD FSR 1 (fx/Fsr.js, Opciones → Gráficos → Escalado): todo lo de arriba
    // corre a la resolución chica y esto lo agranda, último y directo a la
    // pantalla. El resto (partículas que miden en píxeles, el espejo del agua)
    // pregunta el tamaño y recibe el de lo que se dibuja.
    this.scale = 1;
    this.size = null;
    const real = renderer.getDrawingBufferSize.bind(renderer);
    renderer.getDrawingBufferSize = (t) => {
      real(t);
      if (this.scale < 1) t.set(Math.max(1, Math.round(t.x * this.scale)), Math.max(1, Math.round(t.y * this.scale)));
      return t;
    };
    this.fsr = new FsrPass(real);
    this.fsr.enabled = false;
    this.composer.addPass(this.fsr);
    this.flashV = 0;
    this.sweepT = 0;
    this.epic.setScenes(scene, camera);
  }

  setScenes(scene, camera) {
    this.world.scene = scene;
    this.world.camera = camera;
    this.taa.camera = camera;
    this.taa.valid = false;
    this.epic.setScenes(scene, camera);
    this.surfaces.setScene(scene, this.game?.world?.T);
    if (this.epic.on) this.epic.configure(this.epic.cfg, this.game);
    this.sweepT = 0;
  }

  // Lo transparente de doble cara three lo dibuja en dos pasadas (atrás y
  // adelante) y en cada una recalcula el programa del material. Lo que suma luz
  // (brillos, conos, haces, chispas) da igual en qué orden se dibuje: una sola
  // pasada. Se revisa cada tanto porque los efectos se crean durante la partida.
  sweep() {
    const sf = this.surfaces.on && this.surfaces.visit;
    this.world.scene?.traverse(sf ? (o) => (sweepOne(o), sf(o)) : sweepOne);
    this.vm.scene?.traverse(sweepOne);
  }

  // Cada calidad suma un poco sobre la anterior (lo de fx/Epic desde Alta).
  // c: la Personalizada (Game gfxFrom / settings.gfx), cada efecto por separado
  // encima de la base q.
  setQuality(q, c = null) {
    this.bloom.enabled = c ? !!c.bloom : q !== 'perf';
    // bordes: FXAA en baja y media; SMAA (más nítido) de alta para arriba
    const tall = grassy();
    let aa = c ? c.aa : q === 'perf' ? 'none' : q === 'low' || q === 'medium' ? 'fxaa' : q === 'high' ? 'smaa' : 'msaa';
    if (aa === 'msaa' && !tall) aa = 'smaa';
    this.grade.uniforms.uGrain.value = (tall ? 0.03 : 0.06) * (c?.grain ?? 1);
    const smaa = aa === 'smaa' || aa === 'msaa';
    this.fxaa.enabled = aa === 'fxaa';
    this.smaa.enabled = smaa;
    // MSAA del mundo (el pasto que titila): de Ultra para arriba
    const ms = aa === 'msaa' ? MSAA : 0;
    this.world.setSamples(ms);
    // el suavizado temporal: solo Épica (el pasto que titila al moverse). Lee
    // la máscara del pasto del G-buffer de Épica: sin oclusión ni reflejos no hay.
    const taa = tall && (c ? !!c.taa && !!(c.ao || c.light) : q === 'epic');
    if (taa !== this.taa.enabled) {
      this.taa.enabled = taa;
      this.taa.valid = false;
    }
    if (a2c !== ms > 0) {
      a2c = ms > 0;
      this.sweepT = 0;
    }
    // el relieve de paredes y pisos (Personalizada: su propio escalón)
    this.surfaces.setQuality(c?.surf || q);
    // (el rebote lee el G-buffer: sin oclusión ni reflejos no hay)
    // (vol: los haces de luna; gres: la resolución del G-buffer, 0 automática;
    // lampSoft: el borde de las sombras de fuegos)
    const cfg = c ? { live: !!c.live, soft: c.soft || 1, ao: c.ao || 0, light: !!c.light, vol: c.vol ?? !!c.light, gres: Number(c.gres) || 0, lampSoft: c.lampSoft ?? 3, lamps: c.lamps || 0, bounce: !!c.bounce && !!(c.ao || c.light) } : LEVELS[q] || null;
    if (cfg !== this.epic.cfg) this.epic.configure(cfg, this.game);
  }

  // Escalado (Opciones → Gráficos): 'off' (nativo) o un modo de FSR 1; sharp
  // 0..1; pct: la resolución base del modo 'custom' (0,5 a 1; en 1 solo afila).
  setUpscale(mode, sharp = 0.8, pct = 0.77) {
    this.scale = mode === 'custom' ? Math.max(0.5, Math.min(1, pct || 0.77)) : FSR_SCALE[mode] || 1;
    this.fsr.enabled = mode !== 'off' && !!(FSR_SCALE[mode] || mode === 'custom');
    this.fsr.setSharpness(sharp);
    this.taa.valid = false;
    if (this.size) this.setSize(...this.size);
  }

  setSize(w, h, pr) {
    this.size = [w, h, pr];
    // con FSR, todo el composer corre a la resolución chica
    const p = pr * this.scale;
    this.composer.setPixelRatio(p);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.floor((w * p) / 2), Math.floor((h * p) / 2));
    this.grade.uniforms.uRes.value.set(w * p, h * p);
  }

  flash(v) {
    this.flashV = Math.max(this.flashV, v);
  }

  render(dt, t, { hurt = 0, hit = 0, hitX = 0, hitY = 0, down = 0, crit = 0, pulse = 0, vida = 0 } = {}) {
    const u = this.grade.uniforms;
    // (el golpe va derecho, sin suavizar: ya viene con su caída)
    u.uHit.value = Math.min(1, hit) * (this.game?.settings?.calmFx ? 0.4 : 1);
    u.uHitDir.value.set(hitX, hitY);
    u.uVida.value += (vida - u.uVida.value) * Math.min(1, dt * 4);
    // abajo del agua (el nado): el color es el del agua del mapa (fx/Water)
    const under = this.game?.player?.underwater && this.game.state !== 'title' ? 1 : 0;
    u.uUnder.value += (under - u.uUnder.value) * Math.min(1, dt * 8);
    if (under && this.game.water) u.uUnderCol.value.copy(this.game.water.fogUnder || this.game.water.underCol);
    u.uCrit.value = crit;
    u.uPulse.value = pulse;
    const P = this.game?.player;
    u.uWish.value = (this.game?.state !== 'title' && P?.wishFx) || 0;
    u.uWishBeat.value = P?.wishBeat || 0;
    u.uTime.value = t;
    u.uHurt.value += (hurt - u.uHurt.value) * Math.min(1, dt * 6);
    u.uDown.value += (down - u.uDown.value) * Math.min(1, dt * 3);
    this.flashV = Math.max(0, this.flashV - dt * 1.2);
    // opción "menos destellos": la pantalla apenas se aclara
    u.uFlash.value = Math.min(1, this.flashV) * (this.game?.settings?.calmFx ? 0.3 : 1);
    this.sweepT -= dt;
    if (this.sweepT <= 0) {
      this.sweepT = 1;
      this.sweep();
    }
    this.taa.jitter();
    this.epic.before(dt, this.game);
    // las matrices del mundo, una sola vez por cuadro: cada dibujo de la escena
    // (el mundo, el G-buffer de Épica) las recorría enteras otra vez. Y el
    // espejo del agua, antes del mundo (fx/Water.prerender)
    const scene = this.world.scene;
    const cam = this.world.camera;
    scene.updateMatrixWorld();
    if (cam.parent === null) cam.updateMatrixWorld();
    const mwa = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    const water = this.game?.water;
    try {
      water?.prerender?.(this.renderer, scene, cam);
      this.composer.render(dt);
    } finally {
      scene.matrixWorldAutoUpdate = mwa;
      if (water) water.pre = null;
    }
    this.epic.after();
    this.taa.unjitter();
  }

  dispose() {
    this.epic.dispose();
    this.world.dispose();
    this.taa.dispose();
    this.fsr.dispose();
    this.composer.dispose();
  }
}
