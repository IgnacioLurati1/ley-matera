import * as THREE from 'three';
import { buildTextures } from './core/textures';
import GameAudio from './core/audio';
import Input from './core/input';
import World from './world/World';
import Navigation from './world/Navigation';
import Barriers from './world/Barriers';
import Interactables from './world/Interactables';
import Effects from './fx/Effects';
import PostFX from './fx/PostFX';
import { LEVELS } from './fx/Epic';
import { tiersOf } from './config/quality';
import Zombies from './entities/Zombies';
import Player from './entities/Player';
import { submerged } from './entities/swim';
import Rounds from './entities/Rounds';
import LastZombies from './entities/LastZombies';
import Powerups from './entities/Powerups';
import EasterEgg from './entities/EasterEgg';
import Pombero from './entities/Pombero';
import Matorral from './entities/Matorral';
import Yasy from './entities/Yasy';
import LuzMala from './world/LuzMala';
import Curandero from './world/Curandero';
import Ambience from './fx/Ambience';
import { ATTIC_NAME, ATTIC_SUB, STAIR_BOTTOM, inAtticRect, levelOf, setAttic } from './world/Attic';
import Weather from './world/Weather';
import Activities from './world/Activities';
import PapQuest from './world/PapQuest';
import Decor from './world/Decor';
import Arena from './world/Arena';
import Critters from './world/Critters';
import Secrets from './world/Secrets';
import { songOn, silenceSongs } from './world/SongEgg';
import Music, { SCENES, deathTrack } from './core/music';
import { markEgg, isKnight, toggleEggTest, eggsDone, eggsTotal } from './core/eggs';
import { buildHighWindows } from './world/HighWindows';
import MolinoCinematic from './ui/MolinoCinematic';
import FarmCinematic from './ui/FarmCinematic';
import PenalCinematic from './ui/PenalCinematic';
import FarmEgg from './entities/FarmEgg';
import Crow from './entities/Crow';
import Prado from './world/Prado';
import Cerro from './world/Cerro';
import PenalEgg from './entities/PenalEgg';
import GauchoLife from './entities/GauchoLife';
import TowerEgg from './entities/TowerEgg';
import TowerChallenge from './entities/TowerChallenge';
import Infierno from './world/Infierno';
import TowerCinematic from './ui/TowerCinematic';
import CastleEnding from './ui/CastleEnding';
import CastleEgg from './entities/CastleEgg';
import EsterosEgg from './entities/EsterosEgg';
import GranGuerra from './world/GranGuerra';
import CastleWeather from './world/CastleWeather';
import Intro from './ui/Intro';
import Session from './net/Session';
import Avatars from './net/Avatars';
import Weapons from './weapons/Weapons';
import { weaponTour } from './weapons/weaponTour';
import Empanadas from './entities/Empanadas';
import Hud from './ui/Hud';
import { scoreboard } from './ui/Scoreboard';
import Menus from './ui/Menus';
import Levels from './ui/Levels';
import { addPesos } from './core/progress';
import Arrival, { prewarmMaps, compile as rewarmShaders, warmWorld } from './ui/Arrival';
import TitleIntro from './ui/TitleIntro';
import { askSupremo } from './ui/SupremoAsk';
import DeathTour from './ui/DeathTour';
import { setBinds, remapTable } from './core/controls';
import { START_POINTS, ZOMBIE_DAMAGE } from './config/rules';
import { START_ZONE, ZONES, FEATURES, FIRES, TITLE_CAM, TEXT, MAPS, useMap, modeOf } from './config/map';
import { PERKS } from './config/perks';

const SETTINGS_KEY = 'lm-zombies-settings';
const BEST_KEY = 'lm-zombies-best';
// Cada escalón suma un poco sobre el anterior; lo de Media para arriba (sombras
// vivas, oclusión, reflejos, haces de luna) está en fx/Epic.js (LEVELS).
// "Rendimiento" (sin sombras) no está en el menú: es el piso de la automática
// para las máquinas que no dan más.
const QUALITY = {
  perf: { pr: 0.7, shadows: false, shadowSize: 512 },
  low: { pr: 1, shadows: true, shadowSize: 1024 },
  medium: { pr: 1.25, shadows: true, shadowSize: 2048 },
  high: { pr: 2, shadows: true, shadowSize: 4096 },
  ultra: { pr: 2, shadows: true, shadowSize: 4096 },
  epic: { pr: 2, shadows: true, shadowSize: 4096 },
};
const QUALITY_ORDER = ['perf', 'low', 'medium', 'high', 'ultra', 'epic'];
const QUALITY_LABEL = { perf: 'Rendimiento', low: 'Baja', medium: 'Media', high: 'Alta', ultra: 'Ultra', epic: 'Épica' };
// Personalizada (Opciones → Gráficos): arranca igual que un escalón y después
// se toca cada cosa. base: la calidad de lo demás (texturas, relieve, partículas).
export function gfxFrom(tier) {
  const q = QUALITY[tier] || QUALITY.high;
  const L = LEVELS[tier] || {};
  const aa = tier === 'perf' ? 'none' : tier === 'low' || tier === 'medium' ? 'fxaa' : tier === 'high' ? 'smaa' : 'msaa';
  const t = QUALITY[tier] ? tier : 'high';
  return {
    base: t,
    res: q.pr,
    shadows: q.shadows ? q.shadowSize : 0,
    live: !!L.live,
    soft: L.soft || 1,
    ao: L.ao || 0,
    light: !!L.light,
    lamps: L.lamps || 0,
    bounce: !!L.bounce,
    // (lo que las calidades traen fijo: haces con los reflejos, resolución de
    // la luz automática, sombras de fuegos 3, grano de siempre)
    vol: !!L.light,
    gres: 0,
    lampSoft: 3,
    grain: 1,
    aa,
    taa: t === 'epic',
    bloom: t !== 'perf',
    // lo demás que cambia con la calidad, cada uno con su escalón (Game.tier)
    ...tiersOf(t),
  };
}
// Calidad automática: si en partida anda por debajo de esto, baja un escalón.
const MIN_FPS = 40;
// Opciones → Sonido, lo que no es volumen general (core/audio.js setMix): el
// volumen de cada tipo de efecto, la salida, el rango dinámico, el eco, el
// rendimiento, los oídos tapados y el silencio con la ventana atrás.
const SOUND_MIX = { volWeapons: 1, volZombies: 1, volWorld: 1, volPlayer: 1, volUi: 1, audioOut: 'phones', dynRange: 'normal', reverb: 1, audioPerf: 'auto', muffleLow: true, muffleWater: true, muteBg: false };
const SOUND_KEYS = ['master', 'music', 'sfx', 'voice', 'voiceMode', ...Object.keys(SOUND_MIX)];
const DEFAULTS = { sensitivity: 1, fov: 74, master: 0.8, music: 0.75, sfx: 0.9, shake: 1, quality: 'high', qualityMode: 'auto', invertY: false, voiceMode: 'murmur', showFps: false, fpsCap: '0', map: 'molino', v: 6, voice: 0.9, subSize: 1, adsSens: 1, adsMode: 'hold', crouchMode: 'hold', sprintMode: 'hold', calmFx: false, upscale: 'off', sharp: 0.8, fsrPct: 0.77, supremo: true, supremoAsked: false, ...SOUND_MIX };

// Entrada vacía: el jugador sigue con su física pero no toca nada (menú abierto en línea).
const IDLE_INPUT = { mouse: { dx: 0, dy: 0 }, sensitivity: 1, invertY: false, key: () => false, hit: () => false };
const END_SECS = 7.5;
const tmpCam = new THREE.Vector3();
const tmpFire = new THREE.Vector3();

const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  },
};

export default class Game {
  constructor(root, { onExit, signal } = {}) {
    this.root = root;
    this.onExit = onExit;
    // dónde encontrarse para armar salas (lo pone el sitio; puede faltar)
    this.signal = signal || null;
    this.net = null;
    this.state = 'loading';
    this.time = 0;
    this.timers = [];
    this.lures = [];
    const saved = store.get(SETTINGS_KEY) || {};
    // antes era un sí/no de voces
    if (saved.voices === false && !saved.voiceMode) saved.voiceMode = 'off';
    delete saved.voices;
    // la calidad por defecto pasó de Alta a Ultra: el que nunca la tocó, sube
    if (!saved.v && saved.quality === 'high') saved.quality = 'ultra';
    if (saved.voiceMode === 'natural') saved.voiceMode = 'auto';
    // la calidad pasó a ser automática (según la placa y los FPS) salvo que se elija a mano
    if ((saved.v || 0) < 3) saved.qualityMode = 'auto';
    // los murmullos pasaron a ser la voz de todos (se pisa lo que tenía cada uno una vez)
    if ((saved.v || 0) < 4) saved.voiceMode = 'murmur';
    // la música por defecto pasó de 55% a 75%: el que nunca la tocó, sube
    if ((saved.v || 0) < 5 && saved.music === 0.55) saved.music = 0.75;
    // las calidades bajaron un nombre (la vieja Ultra es la Alta de ahora, y así)
    // y arriba hay una Épica nueva; la vieja Baja ya no se elige a mano
    if ((saved.v || 0) < 6 && saved.quality) {
      const was = saved.quality;
      saved.quality = { low: 'perf', medium: 'low', high: 'medium', ultra: 'high', epic: 'ultra' }[was] || 'high';
      if (was === 'low') saved.qualityMode = 'auto';
    }
    saved.v = 6;
    this.settings = { ...DEFAULTS, ...saved };
    // Personalizada: la base de detalle es la calidad que ven todos los demás sistemas
    if (this.settings.qualityMode === 'custom') {
      if (this.settings.gfx?.base && QUALITY[this.settings.gfx.base]) this.settings.quality = this.settings.gfx.base;
      else this.settings.qualityMode = 'manual';
    }
    if (!MAPS[this.settings.map]) this.settings.map = 'molino';
    // en qué mapa se juega (en línea lo decide el anfitrión) y en qué modo
    // (la torre tiene Historia y Challenge; los demás, solo el de siempre)
    this.mapId = this.settings.map;
    this.mode = this.settings.mode || 'story';
    useMap(this.mapId, this.mode);
    this.best = store.get(this.bestKey) || 0;
    this.paused = false;
  }

  async init() {
    const root = this.root;
    this.menus = new Menus(root, this);
    const step = (k, text) =>
      new Promise((r) => {
        this.menus.progress(k, text);
        requestAnimationFrame(() => setTimeout(r, 0));
      });
    await step(0.05, 'Cargando tipografías…');
    try {
      await Promise.race([Promise.all([document.fonts.load('40px "Special Elite"'), document.fonts.load('40px "Creepster"')]), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* se usan las de respaldo */
    }

    // Renderizador: pedimos la placa de video de alto rendimiento (dedicada).
    const canvas = document.createElement('canvas');
    canvas.className = 'mdu-canvas';
    root.prepend(canvas);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    this.gpu = this.detectGpu();
    if (this.settings.qualityMode === 'auto') this.settings.quality = this.autoQuality();
    this.perf = { t: 0, n: 0, warm: false };

    await step(0.08, 'Pintando paredes y calcáreos…');
    this.textures = buildTextures();
    await step(0.22, 'Encendiendo el barbacuá…');
    this.audio = new GameAudio();
    // la música de las escenas (entradas, jefes, cinemáticas, muerte)
    this.music = new Music(this);
    this.audio.setVolumes(this.settings);
    this.audio.setMix(this.settings);
    this.audio.voiceMode = this.settings.voiceMode;
    // las voces del navegador pueden llegar después: se actualizan las opciones
    this.audio.onVoices = () => this.menus?.syncOptions();
    await step(0.26, 'Despertando gargantas…');
    this.audio.buildBank();
    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.input.adsSens = this.settings.adsSens;
    // correr, agacharse y apuntar: mantener o tocar
    this.input.setModes(this.settings);
    // las teclas que cambió el jugador
    setBinds(this.settings.binds);
    this.input.setRemap(remapTable());
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.hud = new Hud(root);
    // la experiencia y los niveles (core/progress: se guardan en el navegador)
    this.levels = new Levels(this);
    this.hud.setSubScale(this.settings.subSize);
    this.hud.show(false);
    // el HUD va debajo de los menús
    root.insertBefore(this.hud.root, this.menus.loading);

    await step(0.3, TEXT.loading);
    this.buildScene();
    await step(0.38, 'Despertando a los peones…');
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.weapons.vmScene, this.weapons.vmCamera, this);
    this.post.setUpscale?.(this.settings.upscale, this.settings.sharp, this.settings.fsrPct);
    this.applyQuality();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    // compilar shaders antes de mostrar el menú (evita tirones al empezar)
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.weapons.vmScene, this.weapons.vmCamera);
    // cada mapa se arma una vez acá (shaders y foto de la postal): tarda más
    // al abrir, pero cambiar de mapa o entrar a jugar después no traba
    this.arrival = new Arrival(this);
    await prewarmMaps(this, step, 0.42, 0.99);
    await step(1, 'Listo.');
    // la entrada del menú principal (ui/TitleIntro): tapa de negro antes del título
    this.titleIntro = new TitleIntro(this);
    await this.titleIntro.cover();
    this.menus.hideLoading();
    this.menus.setTitleInfo({ best: this.best, gpu: this.gpu });
    this.menus.show('title');
    this.state = 'title';
    this.last = performance.now();
    this.frames = 0;
    this.fpsT = 0;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.titleIntro.play();
    // la pulpería se arma y se compila de antemano (cuando el título ya está
    // quieto), así entrar no traba
    setTimeout(() => {
      const pre = () => this.state === 'title' && this.menus?.pulperia?.preload();
      if (window.requestIdleCallback) requestIdleCallback(pre, { timeout: 4000 });
      else pre();
    }, 6500);
    // los atajos de prueba (Alt+…: puntos, modo dios, saltar al final, el
    // premio del super easter egg…) solo en desarrollo: en el sitio publicado no
    const dev = !!import.meta.env.DEV;
    this.onKey = (e) => {
      // (en la cinemática de entrada, Esc la saltea: lo maneja ui/Intro)
      // (y en una escena del easter egg con su Saltar, Esc es de la escena)
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked && !this.intro?.active && !this.ee?.scene?.cine?.skip) this.pause();
      // Alt+I en el menú del título: ir directo a cada escena con música (prueba)
      if (dev && e.altKey && e.code === 'KeyI' && this.state === 'title' && !this.net && this.menus.toggleMusic()) e.preventDefault();
      // Alt+O, en el título o jugando solo: prueba del premio del super easter
      // egg (el Porongo del Caballero y el título), sin tocar lo ganado de verdad
      if (dev && e.altKey && e.code === 'KeyO' && !this.net && (this.state === 'title' || this.state === 'playing')) {
        e.preventDefault();
        toggleEggTest();
        this.menus.syncEggs();
        if (this.state === 'playing') {
          this.weapons.swapStartMate();
          this.hud.subtitle(`Modo prueba: ${isKnight() ? 'Caballero de la Luz, con el Porongo del Caballero en la mano' : 'sin el premio, vuelve el Porongo'}.`, 3);
        }
      }
      // Alt+Y, en cualquier lado: 50 pesos para la pulpería (core/progress)
      if (dev && e.altKey && e.code === 'KeyY') {
        e.preventDefault();
        addPesos(50);
        if (this.state === 'playing') this.hud.subtitle('Modo prueba: +50 pesos para la pulpería.', 2.5);
      }
      // Alt+P, solo jugando solo: 100.000 puntos y nada más
      if (dev && e.altKey && e.code === 'KeyP' && this.state === 'playing' && !this.net) {
        e.preventDefault();
        this.addPoints(100000, null, true);
      }
      // Alt+K, solo jugando solo: 100.000 puntos y el easter egg listo para la pelea final
      if (dev && e.altKey && e.code === 'KeyK' && this.state === 'playing' && !this.net) {
        e.preventDefault();
        this.cheatFinal();
      }
      // Alt+Q, solo jugando solo en el Challenge de la torre: a la casita escondida
      if (dev && e.altKey && e.code === 'KeyQ' && this.state === 'playing' && !this.net && this.ee?.debugHouse) {
        e.preventDefault();
        this.ee.debugHouse();
      }
      // Alt+L, solo jugando solo: el jefe que esté en juego cae al toque
      if (dev && e.altKey && e.code === 'KeyL' && this.state === 'playing' && !this.net) {
        e.preventDefault();
        this.cheatBoss();
      }
      // Alt+G, solo jugando solo: modo dios (nada te hace daño), prende y apaga
      if (dev && e.altKey && e.code === 'KeyG' && this.state === 'playing' && !this.net) {
        e.preventDefault();
        // (la G es la bomba de yerba: el toque no cuenta como tiro)
        const code = this.input.mapCode(e.code);
        this.input.pressed.delete(code);
        this.input.down.delete(code);
        this.godMode = !this.godMode;
        this.hud.subtitle(`Modo prueba: modo dios ${this.godMode ? 'prendido (nada te hace daño)' : 'apagado'}.`, 3);
      }
      // M: silencia la canción de un easter egg musical que esté sonando (solo acá)
      if (this.input.mapCode(e.code) === 'KeyM' && !e.altKey && this.state === 'playing' && songOn()) silenceSongs();
      // X: entrar al gaucho life (el penal)
      if (this.input.mapCode(e.code) === 'KeyX' && !e.altKey && this.state === 'playing' && this.vida && this.input.locked && !this.menuOpen) this.vida.tryEnter();
      // Alt+J, solo jugando solo: se saltea la ronda y arranca la siguiente
      if (dev && e.altKey && e.code === 'KeyJ' && this.state === 'playing' && !this.net) {
        e.preventDefault();
        this.cheatSkipRound();
      }
      // Alt+M, solo jugando solo en el castillo: el siguiente mate de la luz (con
      // Shift, templado)
      if (dev && e.altKey && e.code === 'KeyM' && this.state === 'playing' && !this.net && FEATURES.castle) {
        e.preventDefault();
        this.ee.debugMate?.(e.shiftKey);
      }
      // Alt+M, solo jugando solo en la torre: el Rayo Matero Mark III en la mano
      if (dev && e.altKey && e.code === 'KeyM' && this.state === 'playing' && !this.net && FEATURES.tower) {
        e.preventDefault();
        this.weapons.give('mk3');
        this.hud.subtitle('Modo prueba: el Rayo Matero Mark III, con munición llena.', 3);
      }
      // Alt+. / Alt+, solo jugando solo: la siguiente o la anterior de todas las
      // armas, siempre en el mismo orden (weapons/weaponTour.js: probar los tiros)
      if (dev && e.altKey && (e.code === 'Period' || e.code === 'Comma') && this.state === 'playing' && !this.net) {
        e.preventDefault();
        weaponTour(this, e.code === 'Period' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.onVisibility = () => {
      if (document.hidden && this.state === 'playing') this.pause();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    // un Ctrl+W o F5 sin querer no te saca de la partida sin preguntar
    this.onBeforeUnload = (e) => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', this.onBeforeUnload);
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) {
        this.input.lock();
        this.menus.showClick(false);
      }
    });
  }

  // El modo en que se juega el mapa elegido ('story' si el mapa no tiene otro).
  get modeNow() {
    return modeOf(this.mapId, this.mode);
  }

  // Mapa y modo juntos (lo que hay que rearmar si cambia).
  get mapKey() {
    return `${this.mapId}|${this.modeNow}`;
  }

  // El récord es de cada mapa (y de cada modo).
  get bestKey() {
    return this.keyOf(this.mapId, this.modeNow);
  }

  keyOf(id, mode = 'story') {
    const k = id === 'molino' ? BEST_KEY : `${BEST_KEY}-${id}`;
    return modeOf(id, mode) === 'story' ? k : `${k}-${modeOf(id, mode)}`;
  }

  bestOf(id, mode = 'story') {
    return store.get(this.keyOf(id, mode)) || 0;
  }

  // Cambia de mapa o de modo (desde el menú o porque lo eligió el anfitrión): se rearma el mundo.
  setMap(id, { save = true, mode = this.mode } = {}) {
    if (!MAPS[id]) return false;
    const was = this.mapKey;
    this.mapId = id;
    this.mode = mode || 'story';
    if (this.mapKey === was) return false;
    if (save) {
      this.settings.map = id;
      this.settings.mode = this.mode;
      store.set(SETTINGS_KEY, this.settings);
    }
    this.best = store.get(this.bestKey) || 0;
    // se arma tapado por la postal, sin congelar el menú
    if (this.state === 'title') this.arrival.switchMap();
    this.menus.setTitleInfo({ best: this.best, gpu: this.gpu });
    // en la sala: los invitados arman el mismo mapa (en el mismo modo)
    if (this.net?.host) this.net.event('map', { id, mode: this.mode });
    return true;
  }

  detectGpu() {
    const gl = this.renderer.getContext();
    let name = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch {
      name = '';
    }
    const clean = String(name)
      .replace(/^ANGLE \(/, '')
      .replace(/\)$/, '')
      .replace(/Direct3D.*$/, '')
      .replace(/,\s*$/, '')
      .replace(/\s*\(0x[0-9A-F]+\)/gi, '')
      .trim();
    // sin placa: el navegador dibuja con el procesador (drivers faltantes o aceleración apagada)
    const software = /SwiftShader|llvmpipe|softpipe|Basic Render|Microsoft Basic|Software/i.test(clean);
    const integrated = !software && /Intel|UHD|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics/i.test(clean) && !/NVIDIA|GeForce|RTX|GTX|Arc A\d/i.test(clean);
    // algunos navegadores (Brave) esconden el modelo
    const unknown = !software && !integrated && !/NVIDIA|GeForce|RTX|GTX|Quadro|AMD|Radeon|Intel|Arc|Apple|Mali|Adreno|PowerVR|Qualcomm/i.test(clean);
    return { name: clean, integrated, software, unknown, brave: !!navigator.brave };
  }

  // Calidad de entrada según la placa: Alta para arriba solo si es dedicada.
  autoQuality() {
    const gp = this.gpu || {};
    if (gp.software) return 'perf';
    if (gp.integrated) return 'low';
    if (gp.unknown) return 'medium';
    const name = gp.name || '';
    // las más fuertes: Épica (si no aguanta, watchPerf la va bajando)
    if (/RTX\s*(40[7-9]0|50[7-9]0)|RX\s*(7[89]\d0|9\d{3})/i.test(name)) return 'epic';
    // gama alta: Ultra
    if (/RTX\s*(30[6-9]0|40[6-9]0|50[6-9]0)|RX\s*(6[7-9]\d0|7[7-9]\d0)|Arc.*B[57]\d0/i.test(name)) return 'ultra';
    return 'high';
  }

  // Mide los FPS en partida; en automática, si anda lento baja la calidad un
  // escalón y avisa (nunca la sube sola, para que no ande cambiando).
  watchPerf(ms) {
    const p = this.perf;
    if (!p) return;
    const on = this.settings.qualityMode === 'auto' && this.state === 'playing' && !this.paused && !this.menuOpen;
    if (!on || ms > 250) {
      // pausa, menú o pestaña en segundo plano: se vuelve a medir de cero
      if (!on) p.warm = false;
      p.t = 0;
      p.n = 0;
      return;
    }
    p.t += ms;
    p.n++;
    if (p.t < 4000) return;
    const fps = (p.n * 1000) / p.t;
    p.t = 0;
    p.n = 0;
    // la primera tanda no cuenta (compila, carga texturas)
    if (!p.warm) {
      p.warm = true;
      return;
    }
    const i = QUALITY_ORDER.indexOf(this.settings.quality);
    if (fps >= MIN_FPS || i <= 0) return;
    this.settings.quality = QUALITY_ORDER[i - 1];
    store.set(SETTINGS_KEY, this.settings);
    this.applyQuality();
    this.resize();
    p.warm = false;
    this.hud.toast(`Calidad ${QUALITY_LABEL[this.settings.quality]}: la bajamos para que ande más fluido`);
  }

  // Arma (o rearma) todo el mundo de juego desde cero.
  buildScene() {
    this.clearEnd();
    if (this.scene) this.disposeScene();
    // el mapa elegido: sus datos quedan en config/map para todos los sistemas
    useMap(this.mapId, this.mode);
    this.hud?.setTheme(this.mapId);
    setAttic(FEATURES.attic);
    this.cine?.dispose?.();
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0d14, 0.034);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.activeZones = new Set([START_ZONE]);
    this.lures = [];
    this.timers = [];
    this.world = new World(this);
    this.world.build();
    // el agua del mapa (fx/Water; null donde no hay)
    this.water?.dispose();
    this.water = this.world.water || null;
    if (this.weapons) {
      scene.environment = this.weapons.envMap;
      scene.environmentIntensity = 0.12;
    }
    this.nav = new Navigation(this.world);
    // un campo de flujo por jugador: el que persigue a un compañero va por el
    // camino hacia él, no hacia el anfitrión (en la torre, además, cada uno
    // puede andar en otro piso)
    this.navs = new Map();
    this.navFor = (p) => this.towerNav(p);
    this.fx = new Effects(this);
    this.barriers = new Barriers(this);
    this.player = new Player(this);
    if (!this.weapons) {
      this.weapons = new Weapons(this);
      scene.environment = this.weapons.envMap;
      scene.environmentIntensity = 0.12;
    }
    this.interact = new Interactables(this);
    this.activities = new Activities(this);
    this.luz = new LuzMala(this);
    this.curandero = FEATURES.curandero ? new Curandero(this) : null;
    this.ambience = new Ambience(this);
    this.zombies = new Zombies(this);
    this.rounds = new Rounds(this);
    this.lastZ = new LastZombies(this);
    this.powerups = new Powerups(this);
    // las empanadas: los hornos de barro y lo que hace cada una
    this.emp = new Empanadas(this);
    this.pombero = new Pombero(this);
    // el gaucho life del penal (va antes del easter egg: los dos le suman cosas al rayo)
    this.vida = FEATURES.vida ? new GauchoLife(this) : null;
    // el cuervo es el jefe de la granja (el Capataz, el del molino)
    this.crow = FEATURES.boss === 'crow' || FEATURES.boss === 'mixed' ? new Crow(this) : null;
    this.ee = FEATURES.egg === 'hoz' ? new FarmEgg(this) : FEATURES.egg === 'gauchos' ? new PenalEgg(this) : FEATURES.egg === 'revelaciones' ? new TowerEgg(this) : FEATURES.egg === 'reto' ? new TowerChallenge(this) : FEATURES.egg === 'mateendrache' ? new CastleEgg(this) : FEATURES.egg === 'pacto' ? new EsterosEgg(this) : new EasterEgg(this);
    // La Tapera: el matorral de atrás de la atahona y sus Yasy (después del
    // easter egg: la Yerba Madre es su sexta planta)
    this.matorral = FEATURES.egg === 'hoz' ? new Matorral(this) : null;
    this.yasy = this.matorral ? new Yasy(this) : null;
    // el paso previo del Pack-a-Pava (uno distinto en cada mapa)
    this.papq = new PapQuest(this);
    // la cinemática de entrada (arma sus muñecos ya, para que se compilen en la carga)
    this.intro?.dispose();
    this.intro = new Intro(this);
    this.weather = FEATURES.castle ? new CastleWeather(this) : new Weather(this);
    this.decor = FEATURES.decor ? new Decor(this) : null;
    this.arena = FEATURES.farm ? new Prado(this) : FEATURES.penal ? new Cerro(this) : FEATURES.tower ? new Infierno(this) : FEATURES.castle ? new GranGuerra(this) : new Arena(this);
    this.critters = new Critters(this);
    this.secrets = FEATURES.secrets ? new Secrets(this) : null;
    this.highWindows = FEATURES.highWindows ? buildHighWindows(this) : { list: [] };
    this.world.finalizeStatic();
    this.world.computeNavBlock();
    this.points = START_POINTS;
    this.stats = { kills: 0, headshots: 0, knifeKills: 0, shots: 0, earned: 0, round: 0, time: 0, easterEgg: false };
    this.post?.setScenes(scene, this.camera);
    this.applyQuality();
    if (this.audio) for (const f of FIRES) this.audio.startFire(new THREE.Vector3(...f.sound));
    this.renderer.shadowMap.needsUpdate = true;
    // la cámara y los efectos nuevos nacen sin tamaño: hay que ajustarlos a la ventana
    if (this.post) this.resize();
    // los compañeros pasan al mundo nuevo
    this.net?.avatars.rebuild();
  }

  // Saca lo que quedó de la animación de fin de partida.
  clearEnd() {
    this.tour?.dispose();
    this.tour = null;
    this.endCam = null;
    this.endBody?.dispose();
    this.endBody = null;
    this.endEl?.remove();
    this.endEl = null;
  }

  disposeScene() {
    this.weather?.dispose();
    this.critters?.dispose();
    this.secrets?.dispose();
    this.activities?.dispose();
    this.arena?.dispose();
    this.crow?.dispose();
    this.vida?.dispose();
    this.ee?.dispose?.();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    // todos los fuegos del mapa (el penal tiene dos)
    this.audio?.stopFires();
    this.weapons.clearProjectiles();
  }

  // ---------------- flujo del juego ----------------
  startGame() {
    if (this.state === 'arriving') return;
    // la primera partida con los seis easter eggs: ¿el Mate Supremo en la
    // caja? (ui/SupremoAsk; contestada, arranca)
    if (askSupremo(this, () => this.startGame())) return;
    this.audio.resume();
    // pantalla de carga con la postal; en línea el anfitrión da la orden de
    // arranque y espera a que carguen todos (ui/Arrival)
    this.arrival.start(this.state !== 'title' || this.arrival.switching);
  }

  // Invitado: el anfitrión arrancó la partida. Se carga el mapa y se espera
  // a los demás; la partida empieza cuando el anfitrión dice (Arrival.go).
  arriveAsGuest(map = null, mode) {
    if (this.state === 'arriving') return;
    this.audio.resume();
    const was = this.mapKey;
    if (map && MAPS[map]) {
      this.mapId = map;
      if (mode) this.mode = mode;
    }
    const other = this.mapKey !== was;
    if (this.cine) {
      const c = this.cine;
      this.cine = null;
      c.onDone = null;
      c.finish();
    }
    this.arrival.startGuest(this.state !== 'title' || other || this.arrival.switching);
  }

  // Engancha una sala ya conectada: de acá en más se sincroniza la partida.
  attachNet(net) {
    this.net = new Session(this, net);
    // (el invitado contesta lo del Mate Supremo mientras espera al anfitrión)
    if (this.net.guest) askSupremo(this);
    return this.net;
  }

  // Empieza como invitado: el mundo lo maneja el anfitrión.
  startAsGuest(map = null, mode) {
    this.audio.resume();
    // el anfitrión juega en otro mapa (o en otro modo): se arma ese
    const was = this.mapKey;
    if (map && MAPS[map]) {
      this.mapId = map;
      if (mode) this.mode = mode;
    }
    const other = this.mapKey !== was;
    if (this.cine) {
      // el anfitrión arrancó otra mientras mirabas el final
      const c = this.cine;
      this.cine = null;
      c.onDone = null;
      c.finish();
    }
    if (this.state !== 'title' || other) this.buildScene();
    this.newRun();
    this.rounds.state = 'remote';
    // si arrancó sin un clic tuyo, el mouse se captura con el próximo
    if (!this.input.locked) this.menus.showClick(true);
  }

  // Salir de la sala (o cerrarla, si sos el anfitrión) y volver al título.
  leaveRoom(message) {
    this.arrival?.cancel();
    const net = this.net;
    this.net = null;
    net?.dispose();
    if (this.menus.lobby) this.menus.lobby.net = null;
    if (this.cine) {
      const c = this.cine;
      this.cine = null;
      c.onDone = null;
      c.finish();
    }
    this.audio.ctx.resume?.();
    this.audio.stopAmbience();
    this.audio.setCritical(false);
    this.audio.setUnder(false);
    this.weather?.stopAudio();
    this.buildScene();
    this.state = 'title';
    this.paused = false;
    this.hostPaused = false;
    this.menuOpen = false;
    this.input.unlock();
    this.hud.show(false);
    this.menus.showClick(false);
    this.menus.show('title');
    if (message) this.hud.subtitle(message, 5);
  }

  // Desde la pausa, jugando solo: se deja la partida y se vuelve al menú del
  // juego (la voz quedó en pausa: se corta, así la próxima partida habla).
  toTitle() {
    try {
      speechSynthesis.cancel();
      speechSynthesis.resume();
    } catch {
      /* */
    }
    this.leaveRoom();
  }

  // Invitado: el anfitrión se fue o se cortó la conexión.
  onHostGone() {
    if (!this.net) return;
    // todavía cargando: se vuelve al título
    if (this.state === 'arriving') {
      this.leaveRoom('El anfitrión cerró la sala.');
      return;
    }
    if (this.state === 'title') {
      this.leaveRoom();
      this.menus.lobby?.status('El anfitrión cerró la sala.');
      return;
    }
    if (this.state === 'over' || this.state === 'won') {
      this.menus.hostGone();
      return;
    }
    this.gameOver(true, { lost: true });
  }

  // Jugadores vivos (el local y los remotos), para que los zombies elijan.
  // El jugador de pie más cercano; los tirados no cuentan (null si no queda nadie).
  // Al sumergido no lo buscan (wet: los yacarés, que sí).
  nearestPlayer(x, z, y = 0, wet = false) {
    // Ojos de Vidrio (una empanada): no ven a nadie
    if (this.emp?.blind()) return null;
    // (maizIn: escondido en una mata del Maizaster, entities/maizaster.js)
    if (!this.net) return this.player.canBeHit() && !this.player.maizIn && (wet || !submerged(this.player)) ? this.player : null;
    return this.net.nearest(x, z, y, wet);
  }

  // Le pega a quien corresponda: si es un jugador remoto, se le avisa.
  // (from suele ser z.pos: con eso se sabe qué zombie pegó, para el escudo:
  // world/ShieldUpgrade; al invitado se le manda su número, zi)
  damagePlayer(target, amount, from) {
    if (!target) return;
    const src = this.zombieAt(from);
    if (target === this.player) {
      this.player.damage(amount, from, false, src);
      return;
    }
    this.net?.net.to(target.id, { t: 'hurt', a: amount, x: +from.x.toFixed(2), z: +from.z.toFixed(2), zi: src ? src.id & 0xffff : undefined });
  }

  // El zombie cuya posición es esa (el mismo vector), o null.
  zombieAt(pos) {
    const Z = this.zombies;
    if (!pos || !Z) return null;
    if (Z.boss?.pos === pos) return Z.boss;
    for (const z of Z.pool) if (z.active && z.pos === pos) return z;
    return null;
  }

  // Atajo de prueba (Alt+K): plata, luz, puertas abiertas y el Abuelo esperando
  // el último mate con el sombrero del Capataz ya en la mano.
  cheatFinal() {
    // (con atajos de prueba el easter egg no cuenta para el super easter egg)
    this.cheated = true;
    this.addPoints(100000, null, true);
    if (!this.world.power) this.turnOnPower();
    for (const it of this.interact.list) if (it.kind === 'door' && !it.door.open) this.interact.openDoor(it.door);
    this.ee.debugFinal();
    this.papq?.finish();
    // la granja: la hoz al máximo (de la Muerte y con el bastón de oro del Yasy)
    if (FEATURES.egg === 'hoz') {
      this.player.baston = true;
      if (this.yasy) this.yasy.goldDone = true;
      this.weapons.give('hoz', 1);
    }
    const msg = FEATURES.farm
      ? 'Modo prueba: 100.000 puntos, todo abierto y la Hoz de Oro de la Muerte en la mano. La yerba ya está empaquetada: el prado te espera al fondo del corral.'
      : FEATURES.penal
        ? 'Modo prueba: 100.000 puntos, todo abierto. Los tres gauchos están libres y tenés todo: el espinillo te espera en el cerro.'
        : FEATURES.egg === 'reto'
          ? 'Modo prueba: 100.000 puntos, todo abierto. La Supernova te espera en el altar del piso 15.'
          : FEATURES.tower
          ? 'Modo prueba: 100.000 puntos, todo abierto. El cañón ya disparó: pagá la escalera divina en la pared dorada.'
          : FEATURES.castle
            ? 'Modo prueba: 100.000 puntos, los cuatro mates templados y la vanguardia vencida. El dragón te espera en la cumbre: jurá (mantener F) y a la Gran Guerra.'
            : FEATURES.esteros
              ? 'Modo prueba: 100.000 puntos, todo abierto y el Liquidificador en la mano. El Luisón viene al algarrobo: matalo y Gil decide.'
              : 'Modo prueba: 100.000 puntos, todo abierto. El Abuelo te espera en la capilla con el último mate.';
    this.hud.subtitle(msg, 5);
  }

  // Atajo de prueba (Alt+L): liquida al jefe que haya (Capataz, Mandinga,
  // Espantapájaros o el Cuervo), aunque esté protegido.
  cheatBoss() {
    this.cheated = true;
    let done = false;
    const b = this.zombies.boss;
    if (b && !b.dead) {
      b.hp = 0;
      this.zombies.kill(b, { type: 'bullet', zone: 'torso', point: b.pos.clone().setY(1.5) });
      done = true;
    }
    const c = this.crow?.z;
    if (c?.active && !c.dead) {
      c.hp = 0;
      this.crow.kill({ type: 'bullet' });
      done = true;
    }
    this.hud.subtitle(done ? 'Modo prueba: el jefe cayó.' : 'Modo prueba: no hay ningún jefe en juego.', 3);
  }

  // Atajo de prueba (Alt+J): se van los bichos que queden (sin dar puntos),
  // también el jefe si había, y arranca la ronda siguiente.
  cheatSkipRound() {
    const r = this.rounds;
    if (r.state !== 'active' && r.state !== 'break') {
      this.hud.subtitle('Modo prueba: ahora no se puede saltear la ronda.', 3);
      return;
    }
    if (r.state === 'active') {
      for (const z of this.zombies.pool) if (z.active) this.zombies.free(z);
      if (this.zombies.boss) this.zombies.removeBoss();
      if (this.crow?.z.active) this.crow.remove();
      r.toSpawn = 0;
      r.bossPending = false;
      r.endRound();
    }
    r.nextRound();
    this.hud.subtitle(`Modo prueba: ronda ${r.round}.`, 3);
  }

  // El campo de flujo hacia un jugador: el propio para el local.
  towerNav(p) {
    if (!p || p === this.player) return this.nav;
    let n = this.navs.get(p.id);
    if (!n) {
      n = new Navigation(this.world);
      this.navs.set(p.id, n);
    }
    return n;
  }

  perkColor(id) {
    return PERKS[id]?.color || '#c8202a';
  }

  newRun() {
    this.hostPaused = false;
    this.menuOpen = false;
    this.audio.ctx.resume?.();
    // partida nueva: nadie sigue hablando de la anterior
    this.audio.hush();
    this.audio.setCine(false);
    this.sceneOn = false;
    this.cheated = false;
    this.levels.newGame();
    this.weapons.reset();
    this.player.reset();
    this.emp?.newRun();
    // en línea cada uno arranca al lado del otro, no encimados
    const id = this.net?.id || 0;
    if (id > 0) {
      const a = id * 2.1;
      this.player.pos.x += Math.cos(a) * 0.9;
      this.player.pos.z += Math.sin(a) * 0.9;
    }
    // (el Challenge de la torre arranca con más plata)
    this.points = this.ee?.startPoints ?? START_POINTS;
    // la caja arranca en un lugar al azar cerca del comienzo (la del invitado la manda el anfitrión)
    if (!this.net?.guest) this.interact.newRun();
    this.hud.reset();
    this.hud.setPoints(this.points);
    this.weapons.updateHud();
    this.hud.show(true);
    this.menus.show(null);
    this.state = 'playing';
    this.paused = false;
    this.rounds.start();
    this.vida?.startRun();
    this.audio.startAmbience();
    this.input.lock();
    this.hud.location(ZONES[START_ZONE].name, ZONES[START_ZONE].sub || '');
    this.hud.subtitle('Aguantá lo que puedas.', 4);
  }

  restart() {
    // en línea solo el anfitrión arma otra, y la arma para todos
    if (this.net?.guest) return;
    this.buildScene();
    this.newRun();
    this.net?.restartAll();
  }

  pause() {
    if (this.state !== 'playing') return;
    if (this.net?.guest) {
      // el mundo lo maneja el anfitrión: el menú se abre pero la partida sigue
      if (this.menuOpen) return;
      this.menuOpen = true;
      this.input.unlock();
      this.menus.setPauseMode('guest');
      this.menus.show('pause');
      return;
    }
    this.state = 'paused';
    this.paused = true;
    this.input.unlock();
    this.menus.setPauseMode(this.net?.remote.size ? 'host' : 'solo');
    this.menus.show('pause');
    this.net?.event('pause', { on: 1 });
    this.audio.ctx.suspend?.();
    try {
      speechSynthesis.pause();
    } catch {
      /* */
    }
  }

  resume() {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.menus.show(null);
      this.input.lock();
      return;
    }
    if (this.state !== 'paused' || this.hostPaused) return;
    this.net?.event('pause', { on: 0 });
    this.audio.ctx.resume?.();
    try {
      speechSynthesis.resume();
    } catch {
      /* */
    }
    this.menus.show(null);
    this.state = 'playing';
    this.paused = false;
    this.input.lock();
    this.last = performance.now();
  }

  // Invitado: el anfitrión pausó (o soltó) la partida para todos.
  hostPause(on) {
    if (on) {
      if (this.state !== 'playing') return;
      this.hostPaused = true;
      this.menuOpen = false;
      this.state = 'paused';
      this.paused = true;
      this.input.unlock();
      this.menus.setPauseMode('hostPaused');
      this.menus.show('pause');
      this.audio.ctx.suspend?.();
      return;
    }
    if (!this.hostPaused) return;
    this.hostPaused = false;
    if (this.state !== 'paused') return;
    this.audio.ctx.resume?.();
    this.menus.show(null);
    this.state = 'playing';
    this.paused = false;
    this.last = performance.now();
    // volver a capturar el mouse necesita un clic tuyo
    this.menus.showClick(true);
    this.hud.subtitle('El anfitrión volvió a la partida.', 2.5);
  }

  onLockChange(locked) {
    if (!locked && this.state === 'playing') {
      // Esc sale del pointer lock: pausa como en cualquier FPS (en la
      // cinemática de entrada, en cambio, la saltea)
      if (this.intro?.active) this.intro.skip();
      // (en una escena del easter egg con su propio Saltar, también: el final
      // de los esteros suelta el mouse para elegir y no tiene que pausar)
      else if (this.ee?.scene?.cine?.skip) this.ee.scene.cine.skip();
      else this.pause();
    }
    if (locked) this.menus.showClick(false);
  }

  // Fin de la partida. En línea lo decide el anfitrión (cuando no queda nadie
  // en pie) y les avisa a todos; `info` trae la tabla del equipo.
  gameOver(force = false, info = null) {
    if (this.state === 'over' || this.state === 'won') return;
    // en línea, mientras quede alguien en pie la partida sigue
    if (this.net?.remote.size && !force) {
      this.player.spectate();
      return;
    }
    const lost = !!info?.lost;
    let data = info;
    if (this.net?.host) {
      data = { board: this.net.board(), n: this.rounds.round };
      this.net.event('over', data);
    }
    this.useBoard(data?.board);
    this.state = 'over';
    this.paused = true;
    this.hostPaused = false;
    this.menuOpen = false;
    this.player.alive = false;
    this.stats.round = data?.n ?? this.rounds.round;
    if (this.stats.round > this.best) {
      this.best = this.stats.round;
      store.set(this.bestKey, this.best);
    }
    this.audio.ctx.resume?.();
    this.audio.setCritical(false);
    this.audio.setUnder(false);
    this.audio.stopAmbience();
    this.input.unlock();
    this.menus.showClick(false);
    this.hud.setDowned(null);
    this.hud.setHold(null);
    const showMenu = () => {
      if (this.state !== 'over') return;
      this.endEl?.classList.add('is-gone');
      this.menus.gameOver(this.stats, this.best, { board: data?.board, role: this.netRole(), lost });
    };
    // la canción de la muerte (hasta que se sale de esta pantalla)
    const song = this.music.play(deathTrack(), { while: (g) => g.state === 'over' });
    if (lost) {
      this.hud.show(false);
      showMenu();
      return;
    }
    if (!song) this.audio.gameOver();
    this.post.flash(0.3);
    this.startEnd();
    // después del alma, el paneo por el mapa (ui/DeathTour.js) y recién ahí el menú
    this.later(END_SECS, () => {
      if (this.state !== 'over' || !this.endCam || this.tour) return;
      this.tour = new DeathTour(this, showMenu);
    });
  }

  netRole() {
    if (!this.net) return 'solo';
    return this.net.host ? 'host' : 'guest';
  }

  // Los números de cada uno los lleva el anfitrión: el invitado toma los suyos.
  useBoard(board) {
    if (!board || !this.net?.guest) return;
    const me = board.find((b) => b.id === this.net.id);
    if (!me) return;
    this.stats.kills = me.kills;
    this.stats.headshots = me.heads;
    this.stats.knifeKills = me.knife;
  }

  // Animación del final: te caés, la vista se apaga y el alma sube despacio
  // mirando tu cuerpo tirado mientras los zombies se juntan alrededor.
  startEnd() {
    const p = this.player;
    const zone = this.world.zoneAt(p.pos.x, p.pos.z, p.pos.y);
    const indoor = !this.arena?.active && zone && !ZONES[zone].outdoor;
    // y: el piso donde cayó (en los mapas con pisos no es el suelo)
    const y = p.pos.y || 0;
    this.endCam = { t: 0, x: p.pos.x, y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, eye: p.eye, top: indoor ? 3.15 : 8.5, wide: indoor ? 0.9 : 3.4 };
    this.endBody = new Avatars(this, this.net);
    this.endBody.add({ id: this.net?.id || 0, name: '', noTag: true, corpse: true, shield: !!p.shield, pos: new THREE.Vector3(p.pos.x, y, p.pos.z), yaw: p.yaw, pitch: 0, speed: 0 });
    this.hud.show(false);
    const n = Math.max(0, this.stats.round);
    const many = this.net?.remote.size > 0;
    const verb = many ? 'Sobrevivieron' : 'Sobreviviste';
    const soul = TEXT.soul(many);
    const line = `${verb} ${Math.max(1, n)} ${n <= 1 ? 'ronda' : 'rondas'}.`;
    const el = document.createElement('div');
    el.className = 'mdu-end';
    el.innerHTML = `<i class="mdu-end__black"></i><div class="mdu-end__txt"><h2 class="mdu-title">Fin del juego</h2><p>${line}</p><p class="mdu-end__soul">${soul}</p></div>`;
    this.root.insertBefore(el, this.menus.loading?.isConnected ? this.menus.loading : this.menus.screens.title);
    this.endEl = el;
  }

  updateEnd(dt) {
    const e = this.endCam;
    const cam = this.camera;
    e.t += dt;
    this.endBody?.update(dt);
    if (this.tour) {
      this.tour.update(dt);
      return;
    }
    if (e.t < 1.55) {
      // la caída: la vista se va al piso y se tuerce
      const k = Math.min(1, e.t / 1.1);
      const f = k * k * (3 - 2 * k);
      cam.position.set(e.x, e.y + e.eye + (0.2 - e.eye) * f, e.z);
      cam.rotation.set(e.pitch + (0.45 - e.pitch) * f, e.yaw + f * 0.2, f * 0.7, 'YXZ');
      return;
    }
    // el alma sube (un corte a negro separa las dos tomas)
    const k = Math.min(1, (e.t - 1.55) / (END_SECS - 2));
    const u = 1 - (1 - k) ** 3;
    const a = e.yaw + (e.t - 1.55) * 0.16;
    const h = 0.45 + u * (e.top - 0.45);
    const rad = 0.3 + u * e.wide;
    tmpCam.set(e.x + Math.sin(a) * rad, e.y + h, e.z + Math.cos(a) * rad);
    this.world.collide(tmpCam, 0.3, e.y + h - 0.2, e.y + h + 0.2);
    cam.position.copy(tmpCam);
    cam.lookAt(e.x, e.y + 0.2, e.z);
    if (Math.random() < dt * 3) this.fx.sparkle(new THREE.Vector3(e.x, e.y + 0.3 + u * (e.top - 0.8), e.z), [1, 0.62, 0.3], 1, 0.3);
  }

  // (Alt+I) Prueba de la música: arranca el mapa de la escena y salta a ella
  // (core/music.js SCENES; las entradas son la partida misma).
  devMusic(id) {
    const S = SCENES.find((x) => x.id === id);
    if (!S || this.state !== 'title' || this.net) return;
    this.music.jump = S.intro ? { intro: true } : { go: S.go };
    // (las escenas son de la historia)
    this.setMap(S.map, { mode: 'story' });
    this.startGame();
  }

  // Venciste al Mandinga: cinemática y fin de la partida.
  win(info = null) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    let data = info;
    if (this.net?.host) {
      data = { board: this.net.board() };
      this.net.event('win', data);
    }
    this.useBoard(data?.board);
    this.menuOpen = false;
    this.hostPaused = false;
    this.menus.show(null);
    this.audio.ctx.resume?.();
    this.state = 'won';
    this.paused = true;
    this.stats.round = this.rounds.round;
    this.stats.won = true;
    // ganar es terminar el easter egg del mapa: queda anotado (core/eggs.js);
    // con el sexto, el super easter egg (lo muestra la pantalla del final)
    this.stats.easterEgg = true;
    const was = isKnight();
    // (el Challenge de la torre no cuenta: su final es la escalera al cielo)
    if (!this.cheated && this.modeNow === 'story' && markEgg(this.mapId) && !was && isKnight()) this.stats.knight = true;
    // la experiencia: el easter egg (el Challenge de la torre, menos) y, con
    // los seis, el super easter egg (una sola vez)
    this.levels.egg({ challenge: this.modeNow !== 'story' });
    if (this.modeNow === 'story' && eggsDone().length === eggsTotal()) this.levels.superEgg();
    if (this.stats.round > this.best) {
      this.best = this.stats.round;
      store.set(this.bestKey, this.best);
    }
    this.input.unlock();
    // (el cartel de "hacé clic para seguir jugando" no queda encima del final)
    this.menus.showClick(false);
    this.hud.show(false);
    this.audio.stopAmbience();
    this.weather.stopAudio();
    this.audio.setCritical(false);
    this.audio.setUnder(false);
    const over = () => {
      this.cine = null;
      this.menus.gameOver(this.stats, this.best, { won: true, board: data?.board, role: this.netRole() });
    };
    // (el estero ya pasó su final adentro del juego: EsterosEgg / ui/EsterosEnding;
    // el Challenge de la torre, el Cielo de los Mates: entities/challengeHeaven.js)
    this.ee?.onWin?.();
    if (FEATURES.esteros || FEATURES.egg === 'reto') {
      over();
      return;
    }
    // la escena arranca limpia: los muertos tirados, la sangre, los charcos
    // (ácido de la Bombilla, barro del Liquidificador) y lo que quedaba volando
    // se quedaban congelados adelante de la cinemática (el jefe lo saca cada una)
    for (const z of this.zombies.pool) if (z.active) this.zombies.free(z);
    this.fx.clearAll();
    this.weapons.clearProjectiles();
    this.weapons.clearStuck();
    this.cine = FEATURES.farm ? new FarmCinematic(this.root, this) : FEATURES.penal ? new PenalCinematic(this.root, this) : FEATURES.tower ? new TowerCinematic(this.root, this) : FEATURES.castle ? new CastleEnding(this.root, this) : new MolinoCinematic(this.root, this);
    this.cine.play(over);
  }

  exit() {
    this.cine?.finish();
    this.weather?.stopAudio();
    this.dispose();
    this.onExit?.();
  }

  // ---------------- puntos ----------------
  addPoints(n, _point, raw = false) {
    let v = n;
    if (!raw && this.powerups?.active.double) v *= 2;
    this.points += v;
    this.stats.earned += v;
    this.hud.setPoints(this.points);
    this.hud.addPoints(v);
  }

  // Plata que te pasa un compañero (no cuenta como ganada para los potenciadores).
  receivePoints(n) {
    this.points += n;
    this.hud.setPoints(this.points);
    this.hud.addPoints(n);
    this.audio.purchase();
  }

  spend(n) {
    if (this.points < n) return false;
    this.points -= n;
    this.hud.setPoints(this.points);
    if (n > 0) this.hud.addPoints(-n);
    return true;
  }

  later(sec, fn) {
    this.timers.push({ t: this.time + sec, fn });
  }

  // Un personaje habla: voz (o murmullos) y subtítulo con su nombre.
  // local: solo lo escucha este jugador (el Abuelo cuando te acercás, las radios,
  // que cada compu reproduce por su cuenta).
  say(speaker, text, kind = speaker, { local = false } = {}) {
    if (!local) this.net?.event('say', { s: speaker, x: text, k: kind });
    const dur = this.audio.say(text, speaker);
    // si alguien estaba hablando, la voz espera su turno (y el subtítulo con ella)
    const wait = this.audio.sayWait || 0;
    const label = { fierro: 'Martín Fierro', francisco: 'Francisco', abuelo: 'Abuelo', capataz: 'El Capataz', capatazJoven: 'Anselmo, el capataz (1911)', radio: FEATURES.penal ? 'Radio Nacional' : 'Radio Misiones', taza: 'La taza', anunciador: 'La Voz', entidad: 'La Voz de Arriba', espantapajaros: 'El Espantapájaros', alcaide: 'El Alcaide', gil: 'El Gauchito Gil', anacleto: 'Anacleto', cirilo: 'Cirilo', benito: 'Benito', nicanor: 'Nicanor', sargento: 'El Sargento' }[speaker] || speaker;
    if (wait > 0.1) this.later(wait, () => this.hud.speak(label, text, dur + 1.4, kind));
    else this.hud.speak(label, text, dur + 1.4, kind);
    return wait + dur;
  }

  activateZone(k) {
    if (this.activeZones.has(k)) return;
    this.activeZones.add(k);
    this.net?.event('zone', { z: k });
    // los pisos de arriba sin puerta (el pajar, el barbacuá) se abren con la
    // zona de abajo; su cartel sale cuando alguien sube
    if (!ZONES[k].with) this.hud.location(ZONES[k].name, ZONES[k].sub || '');
    this.ee?.onZone(k);
    for (const [j, Z] of Object.entries(ZONES)) if (Z.with === k) this.activateZone(j);
    // las sombras son estáticas: se recalculan cuando termina de abrirse la puerta
    this.later(1.6, () => {
      this.renderer.shadowMap.needsUpdate = true;
    });
  }

  turnOnPower() {
    if (this.world.power) return;
    this.net?.event('power');
    this.world.setPower(true);
    this.interact.setPowerVisuals(true);
    this.audio.powerOn(this.camera.position.clone());
    this.ee.onPower();
  }

  onPlayerDowned() {
    this.weapons.lastStand = this.weapons.cur;
  }

  onPlayerRevived() {
    this.hud.setDowned(null);
  }

  // ---------------- opciones ----------------
  setSetting(k, v) {
    if (k === 'quality') {
      // "auto" elige según la placa; "custom" (Personalizada) usa settings.gfx;
      // cualquier otra queda fija
      this.settings.qualityMode = v === 'auto' ? 'auto' : v === 'custom' ? 'custom' : 'manual';
      if (v === 'auto') v = this.autoQuality();
      if (v === 'custom') {
        // arranca igual a lo que había (después se toca cada cosa)
        if (!this.settings.gfx) this.settings.gfx = gfxFrom(this.settings.quality);
        v = this.settings.gfx.base;
      }
      if (this.perf) this.perf.warm = false;
    }
    // (Personalizada) un ajuste suelto: { clave: valor } sobre lo que había
    if (k === 'gfx') {
      v = { ...(this.settings.gfx || gfxFrom(this.settings.quality)), ...v };
      this.settings.qualityMode = 'custom';
      this.settings.quality = QUALITY[v.base] ? v.base : this.settings.quality;
    }
    this.settings[k] = v;
    store.set(SETTINGS_KEY, this.settings);
    if (k === 'sensitivity') this.input.sensitivity = v;
    if (k === 'invertY') this.input.invertY = v;
    if (k === 'adsSens') this.input.adsSens = v;
    if (['adsMode', 'crouchMode', 'sprintMode'].includes(k)) this.input.setModes(this.settings);
    if (k === 'subSize') this.hud.setSubScale(v);
    if (['master', 'music', 'sfx', 'voice'].includes(k)) this.audio.setVolumes(this.settings);
    if (k === 'voiceMode') this.audio.voiceMode = v;
    if (k in SOUND_MIX) this.audio.setMix(this.settings);
    if (k === 'fov') this.resize();
    if (k === 'quality' || k === 'gfx') {
      this.applyQuality();
      this.resize();
    }
    if (k === 'upscale' || k === 'sharp' || k === 'fsrPct') {
      this.post?.setUpscale?.(this.settings.upscale, this.settings.sharp, this.settings.fsrPct);
      this.resize();
    }
    if (k === 'showFps' && !v) this.hud.setFps(null);
    if (k === 'binds') {
      setBinds(v);
      this.input.setRemap(remapTable());
    }
  }

  // Opciones → Sonido → Restablecer: todo lo del sonido como viene.
  resetSound() {
    for (const k of SOUND_KEYS) this.setSetting(k, DEFAULTS[k]);
  }

  // La calidad de un sistema: la de la calidad elegida o, en Personalizada, la
  // que eligió para ese (surf relieve, amb halos y haces, water, night niebla y
  // luciérnagas, fire el fuego del dragón, grass el pasto al armar el mapa).
  tier(sys) {
    const c = this.settings.qualityMode === 'custom' ? this.settings.gfx : null;
    return (c && c[sys]) || this.settings.quality;
  }

  // La calidad en uso: la del escalón o, en Personalizada, con lo que eligió
  // el jugador encima (resolución y sombras de la luna).
  qualityCfg() {
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    const c = this.settings.qualityMode === 'custom' ? this.settings.gfx : null;
    if (!c) return q;
    return { pr: c.res ?? q.pr, shadows: (c.shadows ?? q.shadowSize) > 0, shadowSize: c.shadows || q.shadowSize };
  }

  applyQuality() {
    const q = this.qualityCfg();
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.world?.moon) {
      this.world.moon.castShadow = q.shadows;
      this.world.moon.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.world.moon.shadow.map?.dispose();
      this.world.moon.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.post?.setQuality(this.settings.quality, this.settings.qualityMode === 'custom' ? this.settings.gfx : null);
    // en plena partida (a mano o la automática que la baja): lo visible se
    // recompila solo, pero lo escondido no (el mate que muestra el Pack-a-Pava o
    // la caja, los actores de las cinemáticas). Se vuelve a compilar todo de
    // fondo, como en la llegada; si no, el Porongo del Caballero en la máquina
    // congelaba más de un segundo.
    if (this.state === 'playing' || this.state === 'paused') {
      const tok = (this.rewarmTok = (this.rewarmTok || 0) + 1);
      setTimeout(() => {
        if (tok === this.rewarmTok && (this.state === 'playing' || this.state === 'paused'))
          rewarmShaders(this)
            .then(() => {
              // (y el mapa entero, con las variantes de la calidad nueva)
              if (tok === this.rewarmTok && (this.state === 'playing' || this.state === 'paused')) warmWorld(this);
            })
            .catch(() => {});
      }, 250);
    }
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const q = this.qualityCfg();
    const pr = Math.min(window.devicePixelRatio || 1, q.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.baseFov = this.settings.fov;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    const vm = this.weapons.vmCamera;
    vm.aspect = w / h;
    vm.updateProjectionMatrix();
    this.post?.setSize(w, h, pr);
    // (con FSR se dibuja más chico: las partículas miden en píxeles de lo dibujado)
    this.fx.resize(h * pr * (this.post?.scale || 1), this.camera.fov);
  }

  // ---------------- bucle ----------------
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    // el tope de FPS de las opciones: sin tope, con un monitor de 144-180 Hz la
    // placa va siempre al 100%. Se saltean los cuadros que llegan antes de
    // tiempo (a paso fijo, así el promedio da el tope aunque no divida al monitor).
    const cap = +this.settings.fpsCap;
    if (cap > 0) {
      if (now < (this.capNext || 0) - 1) return;
      this.capNext = Math.max((this.capNext || 0) + 1000 / cap, now);
    }
    this.watchPerf(now - this.last);
    // cuánto tarda un cuadro (suavizado): en una compu que no da abasto el
    // audio afloja antes (core/audio.js budget), si no se cortaba el sonido
    // con varios sonando a la vez
    const raw = Math.min(200, Math.max(0, now - this.last));
    this.frameMs = (this.frameMs ?? 16) * 0.96 + raw * 0.04;
    // (en las opciones se puede dejar siempre completo o siempre liviano)
    const perf = this.settings.audioPerf;
    if (this.audio) this.audio.budget = perf === 'full' ? 1 : perf === 'light' ? 0.4 : this.frameMs < 24 ? 1 : this.frameMs < 36 ? 0.65 : 0.4;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.settings.showFps) {
      this.frames++;
      this.fpsT += dt;
      if (this.fpsT >= 0.5) {
        this.hud.setFps(Math.round(this.frames / this.fpsT));
        this.frames = 0;
        this.fpsT = 0;
      }
    }
    this.music?.tick(dt);
    // un menú con escena 3D propia (la pulpería, la armería): se dibuja ella
    // sola, sin el mundo de atrás (menus.stage = { render(renderer, dt) })
    const stage = this.state === 'title' ? this.menus?.stage : null;
    if (stage) stage.render(this.renderer, dt);
    else if (this.state === 'title') this.titleCam(dt);
    else if (this.state === 'playing' || this.state === 'over') this.update(dt);
    // las cinemáticas de la granja y el penal pasan adentro del mundo
    else if (this.state === 'won' && this.cine?.update) this.cine.update(dt);
    if (!stage) this.render(dt);
    this.input.endFrame();
  }

  // Cámara lenta recorriendo el patio detrás del menú.
  titleCam(dt) {
    this.time += dt;
    const t = this.time * 0.05;
    const c = this.camera;
    const C = TITLE_CAM;
    c.position.set(C.at[0] + Math.sin(t) * C.amp[0], C.at[1] + Math.sin(t * 1.7) * 0.1, C.at[2] + Math.cos(t) * C.amp[1]);
    c.lookAt(C.look[0] + Math.sin(t * 0.7) * C.lookAmp, C.look[1], C.look[2]);
    // la entrada del menú: mira al cielo y baja de a poco
    this.titleIntro?.cam(c);
    this.world.update(dt, this.time);
    this.weather.update(dt);
    this.fx.update(dt, c);
    this.weapons.holder.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'playing') this.stats.time += dt;
    // A.cat: de qué tipo es lo que suena en cada parte (el volumen de armas,
    // zombies, ambiente... de las opciones; core/audio.js CAT_OF)
    const A = this.audio || {};
    A.cat = null;
    // temporizadores del juego (respetan la pausa)
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    const input = this.input;
    // la escena de la yerba del penal: la partida queda quieta y la cámara la maneja el easter egg
    // (y la cinemática de entrada del mapa, antes de la primera ronda)
    const scene = !!this.ee?.scene || !!this.intro?.active;
    // una escena del easter egg calla las demás voces (y al terminar las deja hablar)
    if (scene !== !!this.sceneOn) {
      this.sceneOn = scene;
      this.audio.setCine(scene);
    }
    const active = this.state === 'playing' && !this.menuOpen && !scene;
    A.cat = 'player';
    if (active) this.player.update(dt, input);
    else if (this.state === 'playing') this.player.update(dt, IDLE_INPUT);
    else if (this.endCam) this.updateEnd(dt);
    else this.player.updateCamera(this.camera);
    A.cat = null;
    // arriba en el altillo: los de abajo van hacia la escalera
    if (levelOf(this.player.pos.y) === 1) this.nav.update(STAIR_BOTTOM.x, STAIR_BOTTOM.z);
    else this.nav.update(this.player.pos.x, this.player.pos.z, false, this.player.pos.y);
    // el campo de cada compañero (el anfitrión maneja a los zombies); el que
    // está en el altillo del molino, igual que el local: hacia la escalera
    if (this.navFor && this.net?.host) {
      for (const r of this.net.remote.values()) {
        if (r.dead) continue;
        if (levelOf(r.pos.y) === 1) this.towerNav(r).update(STAIR_BOTTOM.x, STAIR_BOTTOM.z);
        else this.towerNav(r).update(r.pos.x, r.pos.z, false, r.pos.y);
      }
    }
    // en gaucho life no hay mates ni se toca nada: solo la electricidad
    const ghost = !!this.vida?.active;
    A.cat = 'weapons';
    if (active && !ghost) this.weapons.update(dt, input);
    A.cat = 'ui';
    if (active && !ghost) this.interact.update(dt, input);
    else if (this.state === 'playing') this.interact.tick(dt);
    A.cat = null;
    this.vida?.update(dt, active ? input : IDLE_INPUT);
    this.barriers.update(dt);
    if (!scene) this.rounds.update(dt);
    A.cat = 'zombies';
    if (!scene || this.net?.guest) this.zombies.update(dt, this.time);
    else this.zombies.render();
    A.cat = null;
    if (this.intro?.active) this.intro.update(dt);
    else if (scene) this.ee.sceneCam(dt);
    this.arena.update(dt);
    A.cat = 'ui';
    this.powerups.update(dt);
    this.emp?.update(dt, active && !ghost ? input : null);
    A.cat = 'zombies';
    this.lastZ?.update(dt);
    this.pombero.update(dt);
    this.matorral?.update(dt);
    this.yasy?.update(dt);
    this.crow?.update(dt);
    A.cat = null;
    this.luz.update(dt);
    this.curandero?.update(dt);
    this.activities.update(dt);
    this.net?.update(dt);
    A.cat = 'world';
    this.decor?.update(dt);
    this.critters.update(dt);
    A.cat = null;
    this.ee.update(dt);
    this.papq?.update(dt);
    A.cat = 'world';
    this.world.update(dt, this.time);
    this.ambience.update(dt);
    this.weather.update(dt);
    // (después del clima: abajo del agua cambia la niebla)
    this.water?.update(dt);
    // los ruidos de la noche del mapa (fx/Night.js)
    this.world.night?.update(dt);
    A.cat = null;
    this.fx.update(dt, this.camera);
    this.hud.update(dt);
    // la tabla de puntos, mientras se mantiene Tab
    this.hud.setBoard(this.state === 'playing' && !this.menuOpen && input.key('Tab') ? scoreboard(this) : null);
    // fuego del barbacuá (o del fogón de la granja)
    // el barbacuá del molino se apaga de un soplido (easter egg)
    if (!this.ee?.fireOut) for (const f of FIRES) if (Math.random() < 0.7) this.fx.fire(tmpFire.set(...f.pos), f.spread, 1);

    // FOV al apuntar (y mira telescópica)
    const w = this.weapons;
    const st = w.stats;
    const adsFov = st?.scope ? st.adsFov || 22 : this.baseFov * 0.8;
    const targetFov = this.intro?.active ? this.intro.fov : this.baseFov + (adsFov - this.baseFov) * w.adsT + (this.player.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
      this.fx.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
    }
    const scoped = st?.scope && w.adsT > 0.85;
    w.vmRoot.visible = !scoped && !this.endCam && this.player.alive && !this.vida?.active && !scene;
    this.hud.setCrosshair(w.crosshair, !w.ads && !this.player.sprinting && this.player.alive, !!scoped);
    if (this.player.downed && !(this.player.bleed > 0)) this.hud.setDowned(this.player.downT / 10);

    // luz del lugar para iluminar el mate en la mano
    const zone = this.world.zoneAt(this.player.pos.x, this.player.pos.z);
    const upstairs = levelOf(this.player.pos.y) === 1 && inAtticRect(this.player.pos.x, this.player.pos.z);
    if (this.arena?.active) this.hud.setRoom(this.arena.name);
    else if (upstairs) this.hud.setRoom(ATTIC_NAME);
    else if (zone) this.hud.setRoom(ZONES[zone].name);
    this.hud.setSong(songOn());
    // la primera vez que sube, el cartel del lugar
    if (upstairs && !this.atticSeen) {
      this.atticSeen = true;
      this.hud.location(ATTIC_NAME, ATTIC_SUB);
    }
    if (zone && ZONES[zone].with && !(this.upSeen ||= new Set()).has(zone)) {
      this.upSeen.add(zone);
      this.hud.location(ZONES[zone].name, ZONES[zone].sub || '');
    }
    this.audio.outdoor = !zone || !!ZONES[zone].outdoor;
    const lit = zone && ZONES[zone].outdoor ? 0.7 : this.world.power ? 1 : 0.6;
    this.lightLevel = (this.lightLevel ?? lit) + (lit - (this.lightLevel ?? lit)) * Math.min(1, dt * 2);

    // a un golpe de caer: latidos, respiración, todo se oye apagado y la pantalla late
    const p = this.player;
    const critical = active && p.alive && !p.downed && p.health <= ZOMBIE_DAMAGE;
    if (critical !== this.critical) {
      this.critical = critical;
      this.audio.setCritical(critical);
      if (critical) this.heartT = 0;
    }
    this.critK = (this.critK || 0) + ((critical ? 1 : 0) - (this.critK || 0)) * Math.min(1, dt * (critical ? 6 : 1.5));
    this.beatT = (this.beatT ?? 9) + dt;
    if (critical) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.72;
        this.beatT = 0;
        this.audio.heartbeat();
      }
    }
    // abajo del agua todo se oye ahogado (con el menú abierto o en una escena, no)
    this.audio.setUnder(active && p.alive && !!p.underwater);
    this.audio.setListener(this.camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion));
    this.audio.updateAmbience(dt);
  }

  render(dt) {
    const p = this.player;
    const hurt = p && this.state !== 'title' ? Math.max(0, 1 - p.health / p.maxHealth) * (p.downed ? 0 : 1) : 0;
    const down = p && (p.downed || !p.alive) && this.state !== 'title' ? 1 : 0;
    // latido: golpe fuerte (lub) y uno más suave (dub)
    const b = this.beatT ?? 9;
    const pulse = Math.exp(-b * 9) + 0.55 * Math.exp(-Math.max(0, b - 0.2) * 10) * (b > 0.2 ? 1 : 0);
    // en las cinemáticas (el final y las escenas del easter egg) la imagen va limpia
    const cine = this.state === 'won' || !!this.ee?.scene || !!this.intro?.active;
    const vida = this.state !== 'title' && !cine && this.vida?.active ? 1 : 0;
    const clean = vida || cine;
    const hit = p && this.state !== 'title' && !clean ? p.hitK : 0;
    this.post.render(dt, this.time, { hurt: clean ? 0 : hurt * 0.9, hit, hitX: p?.hitX || 0, hitY: p?.hitY || 0, down: clean ? 0 : down, crit: this.state === 'title' || clean ? 0 : this.critK || 0, pulse: cine ? 0 : pulse, vida });
  }

  dispose() {
    this.net?.dispose();
    this.net = null;
    cancelAnimationFrame(this.raf);
    this.music?.stop(0);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.input?.dispose();
    this.audio?.stopAmbience();
    this.audio?.dispose();
    if (this.scene) this.disposeScene();
    for (const t of Object.values(this.textures || {})) t.dispose?.();
    this.post?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
  }
}
