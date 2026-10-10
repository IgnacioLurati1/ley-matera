import * as THREE from 'three';
import { buildTextures } from './core/textures';
import { paintInWorkers } from './core/texturePool';
import { setPapMap } from './weapons/camos';
import { eclipseBake } from './fx/eclipseMusic';
import { sizeCull, setFarHook } from './core/sizeCull';
import { eclipseLejos } from './world/eclipseLejos';
import { drawCost } from './core/drawCost';
import { devKeys } from './core/devKeys';
import { retireScene } from './core/sceneFlush';
// las matrices de lo que no se movió no se recalculan (mismo resultado que three)
import './core/matrixCache';
import GameAudio from './core/audio';
import Input from './core/input';
import World from './world/World';
import { ceilAt } from './world/Levels';
import Navigation from './world/Navigation';
import Barriers from './world/Barriers';
import Interactables from './world/Interactables';
import Effects from './fx/Effects';
import PostFX from './fx/PostFX';
import { LEVELS } from './fx/Epic';
import { tiersOf, MAP_GFX } from './config/quality';
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
import MonumentoEgg from './entities/MonumentoEgg';
import EclipseEgg from './entities/EclipseEgg';
import { ECLIPSE_KEY } from './core/eclipseFlag';
import HitchLog from './core/hitchLog';
import GranGuerra from './world/GranGuerra';
import CastleWeather from './world/CastleWeather';
import EclipseWeather from './world/eclipseAtmos';
import Intro from './ui/Intro';
import Session from './net/Session';
import Avatars from './net/Avatars';
import { gilVincha } from './net/gilLook';
import Weapons from './weapons/Weapons';
import { weaponTour } from './weapons/weaponTour';
import Empanadas from './entities/Empanadas';
import Hud from './ui/Hud';
import { scoreboard } from './ui/Scoreboard';
import Menus from './ui/Menus';
import Levels from './ui/Levels';
import LogrosTracker from './entities/logrosTracker';
import Dialogos from './ui/dialogos';
import MenuAmbience from './ui/menuAmbience';
import { addPesos } from './core/progress';
import Arrival, { prewarmMaps, compile as rewarmShaders, warmWorld } from './ui/Arrival';
import TitleIntro from './ui/TitleIntro';
import { askSupremo } from './ui/SupremoAsk';
import DeathTour from './ui/DeathTour';
import { deathPose } from './ui/deathPose';
import { setBinds, remapTable } from './core/controls';
import { START_POINTS, ZOMBIE_DAMAGE } from './config/rules';
import { START_ZONE, ZONES, FEATURES, FIRES, TITLE_CAM, TEXT, MAPS, useMap, modeOf } from './config/map';
import { PERKS } from './config/perks';
import { roomEnvAsync } from './core/roomEnv';

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
  constructor(root, { onExit, signal, logo = null } = {}) {
    this.root = root;
    this.onExit = onExit;
    // el logo de Luta Studios que tapa la carga (ui/StudioLogo; puede faltar)
    this.logo = logo;
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
    // al abrir el juego se carga siempre el molino, el más rápido de armar
    // (el usuario, 2026-10-09): los demás se eligen después en el título.
    // (las pruebas automáticas entran al mapa de sus ajustes, salvo con
    // window.__mduBootMolino = true)
    if (!navigator.webdriver || globalThis.__mduBootMolino) {
      this.settings.map = 'molino';
      this.settings.mode = 'story';
    }
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
    // las texturas se pintan en otros hilos mientras carga lo demás (core/texturePool.js)
    const S = this.settings;
    const painted = paintInWorkers(this.mapId, { relief: !(S.qualityMode === 'manual' && (S.quality === 'low' || S.quality === 'perf')) });
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
    // (con el logo de Luta Studios el lienzo ya viene con su contexto creado:
    // ui/StudioLogo gameCanvas, que pide estos mismos atributos)
    const canvas = this.logo?.canvas || document.createElement('canvas');
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
    // lo que three repite en cada dibujo sin que cambie nada (core/drawCost)
    drawCost(r);
    this.gpu = this.detectGpu();
    if (this.settings.qualityMode === 'auto') this.settings.quality = this.autoTier();
    this.perf = { t: 0, n: 0, warm: false };
    // los reflejos de los mates (core/roomEnv): se compilan en paralelo
    // mientras carga lo demás, así armarlos no traba la placa (ni el logo)
    const roomEnvP = roomEnvAsync(r).catch(() => null);
    // los tirones (core/hitchLog.js; Alt+H los muestra)
    this.hitch = new HitchLog(this);

    await step(0.08, 'Pintando paredes y calcáreos…');
    this.textures = buildTextures(await painted);
    await step(0.22, 'Encendiendo el barbacuá…');
    this.audio = new GameAudio();
    // la música de las escenas (entradas, jefes, cinemáticas, muerte)
    this.music = new Music(this);
    // el ambiente del mapa elegido mientras se está en el menú (ui/menuAmbience.js)
    this.menuAmb = new MenuAmbience(this.audio);
    this.audio.setVolumes(this.settings);
    this.audio.setMix(this.settings);
    this.audio.voiceMode = this.settings.voiceMode;
    // (en línea, las frases de las cinemáticas duran lo mismo en todas las compus: audio.say)
    this.audio.online = () => !!this.net;
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
    // los logros (core/logros.js): se cuelgan de los niveles y del aviso del HUD
    this.logros = new LogrosTracker(this);
    this.hud.setSubScale(this.settings.subSize);
    this.hud.show(false);
    // el HUD va debajo de los menús
    root.insertBefore(this.hud.root, this.menus.loading);

    await step(0.3, TEXT.loading);
    this.roomEnv = await roomEnvP;
    this.buildScene();
    // Lo que sigue (posproceso y compilar los shaders del mapa) ocupa la placa
    // en tandas largas, y el logo de Luta Studios (ui/StudioLogo, un lienzo
    // en otro hilo) espera en la misma fila para mostrar cada cuadro: se
    // quedaba quieto hasta 0,5 s justo al apagarse. Se arranca cuando el logo
    // se apagó; hasta acá todo cargó detrás de él.
    if (this.logo && !this.logo.over && globalThis.__mduLogoNoWait !== true) await this.logo.clear;
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
    // el logo de Luta Studios: la carga corrió detrás. Si terminó antes que
    // el logo, se espera a que se vaya y se ve la barra llena un momento.
    if (this.logo && !this.logo.over) {
      await this.logo.done;
      await new Promise((r) => setTimeout(r, 450));
    }
    this.logo = null;
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
    // el HUD dibujado una vez, casi transparente (ui/Hud prewarm): si no,
    // trababa ~50 ms al terminar la entrada
    setTimeout(() => {
      if (this.state === 'title') this.hud.prewarm();
    }, 1500);
    // la pulpería se arma y se compila de antemano (cuando el título ya está
    // quieto), así entrar no traba
    setTimeout(() => {
      const pre = () => this.state === 'title' && this.menus?.pulperia?.preload();
      if (window.requestIdleCallback) requestIdleCallback(pre, { timeout: 4000 });
      else pre();
    }, 6500);
    // los atajos de prueba (Alt+…: puntos, modo dios, saltar al final, el
    // premio del super easter egg…) solo en desarrollo y en la versión de
    // escritorio (core/devKeys): en el sitio publicado no
    const dev = devKeys();
    this.onKey = (e) => {
      // (en la cinemática de entrada, Esc la saltea: lo maneja ui/Intro)
      // (y en una escena del easter egg con su Saltar, Esc es de la escena)
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked && !this.intro?.active && !this.ee?.scene?.cine?.skip) this.pause();
      // Alt+H, en cualquier lado (también en el sitio publicado): los últimos
      // tirones y qué los causó (core/hitchLog.js)
      if (e.altKey && e.code === 'KeyH') {
        this.hitch?.toggle();
        e.preventDefault();
      }
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
      // Alt+M, solo jugando solo en Eclipse Matero: el Desgarrador Cósmico en la
      // mano (con Shift, el del Eclipse, con la Furia)
      if (dev && e.altKey && e.code === 'KeyM' && this.state === 'playing' && !this.net && FEATURES.eclipse) {
        e.preventDefault();
        this.weapons.cosmic?.give(e.shiftKey ? 1 : 0);
        this.hud.subtitle(e.shiftKey ? 'Modo prueba: el Desgarrador del Eclipse.' : 'Modo prueba: el Desgarrador Cósmico.', 3);
      }
      // Alt+E en el título, solo en el servidor de desarrollo: prende o apaga
      // Eclipse Matero, el mapa en obra, y recarga (core/eclipseFlag.js)
      if (import.meta.env.DEV && e.altKey && e.code === 'KeyE' && this.state === 'title' && !this.net) {
        e.preventDefault();
        try {
          const on = localStorage.getItem(ECLIPSE_KEY) === '1';
          if (on) localStorage.removeItem(ECLIPSE_KEY);
          else localStorage.setItem(ECLIPSE_KEY, '1');
          location.reload();
        } catch {
          // (sin localStorage no hay marca)
        }
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
    // gama media (GTX 9/1050-1070/16, RTX 2050/2060/3050, MX, RX 400/500/5000/6400-6600):
    // Media, y Baja si es de notebook (con Alta a una 1650 y una 2060 les iba mal)
    if (/GTX\s*(9\d0|10[5-7]0|16\d0)|RTX\s*(20[56]0|3050)|\bMX\s*\d|RX\s*(4\d0|5\d0|5[3-7]00|6[45]00|66[05]0)/i.test(name)) return /Laptop|Max-Q|Mobile/i.test(name) ? 'low' : 'medium';
    return 'high';
  }

  // La automática con lo que ya aprendió en esta compu: si en una partida
  // anterior tuvo que bajar (watchPerf), arranca desde ahí y no desde arriba
  // (antes cada partida volvía a Alta y repetía los tirones de bajar).
  autoTier() {
    const q = this.autoQuality();
    const c = this.settings.autoCap;
    if (!c || c.gpu !== (this.gpu?.name || '')) return q;
    const i = QUALITY_ORDER.indexOf(c.q);
    return i >= 0 && i < QUALITY_ORDER.indexOf(q) ? c.q : q;
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
    // (con tope de FPS lo que se espera es el tope: con 30 nunca llegaba a 40
    // y la iba bajando hasta Rendimiento)
    const cap = this.fpsCap();
    const want = cap > 0 ? Math.min(MIN_FPS, cap * 0.8) : MIN_FPS;
    if (fps >= want || i <= 0) return;
    // muy lento: dos escalones de una (cada cambio recompila y traba)
    this.settings.quality = QUALITY_ORDER[Math.max(0, i - (fps < want * 0.6 ? 2 : 1))];
    // y se acuerda para esta placa (Game.autoTier)
    this.settings.autoCap = { gpu: this.gpu?.name || '', q: this.settings.quality };
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
    this.ee = FEATURES.egg === 'hoz' ? new FarmEgg(this) : FEATURES.egg === 'gauchos' ? new PenalEgg(this) : FEATURES.egg === 'revelaciones' ? new TowerEgg(this) : FEATURES.egg === 'reto' ? new TowerChallenge(this) : FEATURES.egg === 'mateendrache' ? new CastleEgg(this) : FEATURES.egg === 'pacto' ? new EsterosEgg(this) : FEATURES.egg === 'bandera' ? new MonumentoEgg(this) : FEATURES.egg === 'primermate' ? new EclipseEgg(this) : new EasterEgg(this);
    // La Tapera: el matorral de atrás de la atahona y sus Yasy (después del
    // easter egg: la Yerba Madre es su sexta planta)
    this.matorral = FEATURES.egg === 'hoz' ? new Matorral(this) : null;
    this.yasy = this.matorral ? new Yasy(this) : null;
    // el paso previo del Pack-a-Pava (uno distinto en cada mapa)
    this.papq = new PapQuest(this);
    // los gauchos que hablan en la partida (ui/dialogos.js)
    this.dlg = new Dialogos(this);
    // la cinemática de entrada (arma sus muñecos ya, para que se compilen en la carga)
    this.intro?.dispose();
    this.intro = new Intro(this);
    // (Eclipse Matero: la atmósfera de cada isla y nada sobre el vacío; world/eclipseAtmos.js)
    this.weather = FEATURES.castle ? new CastleWeather(this) : FEATURES.eclipse && globalThis.__mduNoEclipseWeather !== true ? new EclipseWeather(this) : new Weather(this);
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
    // el camuflaje del Pack-a-Pava de este mapa se pinta con el mapa (~70 ms
    // que caían en el primer cuadro de la partida, en Weapons.reset)
    setPapMap(this.mapId, this.textures);
    // Eclipse: la música de las rondas se hornea ya (fx/eclipseMusic.js)
    if (this.mapId === 'eclipse' && this.audio) eclipseBake(this.audio);
    // las piezas diminutas de lejos no se dibujan (core/sizeCull.js), solo
    // jugando con la cámara en los ojos del jugador: en las cinemáticas, que
    // panean el mapa de lejos, se dibuja todo
    // y lo de adentro de cada zona que no se ve: los cuartos hasta el techo,
    // las zonas abiertas (el patio del penal) y sin techo hasta 4 m (la torre
    // va por world/Tower, sin zonas acá)
    const rooms = [];
    for (const [key, Z] of Object.entries(ZONES)) {
      // (las zonas de un solo rectángulo van con `rect`: el molino entero
      // quedaba sin cuartos y desde el cementerio se dibujaba todo lo de
      // adentro de los galpones; globalThis.__mduNoRectRooms: como antes)
      const RS = Z.rects || (Z.rect && globalThis.__mduNoRectRooms !== true ? [Z.rect] : null);
      if (!RS) continue;
      const open = !!Z.outdoor || !Z.roof;
      const boxes = [];
      for (const r of RS) {
        const y0 = r[4] ?? Z.y ?? 0;
        const y1 = open ? y0 + 4 : (r[5] ?? Z.roof);
        if (y1 - y0 > 1) boxes.push([r[0], y0, r[1], r[2] + 1, y1, r[3] + 1]);
      }
      // (indoor: con techo; ver core/sizeCull, la niebla)
      if (boxes.length) rooms.push({ key, boxes, indoor: !open });
    }
    sizeCull(
      this.renderer,
      this.scene,
      () => {
        const p = this.player;
        const c = this.camera.position;
        return this.state === 'playing' && !this.intro?.active && !this.cine && !!p && Math.abs(c.x - p.pos.x) < 0.5 && Math.abs(c.z - p.pos.z) < 0.5 && Math.abs(c.y - p.pos.y - p.eye) < 1.5;
      },
      { camera: this.camera, rooms: this.world.tower ? [] : rooms },
    );
    // Eclipse: las otras islas, cada una en una o dos mallas juntas (world/eclipseLejos.js)
    setFarHook(null);
    // (las islas dormidas engancharon el dibujo del mapa anterior: se sueltan)
    this.lejos?.unhook?.();
    this.lejos = this.mapId === 'eclipse' ? eclipseLejos(this) : null;
  }

  // Saca lo que quedó de la animación de fin de partida.
  clearEnd() {
    this.tour?.dispose();
    this.tour = null;
    this.endCam = null;
    this.endBody?.dispose();
    this.endBody = null;
    this.endPose = null;
    this.endEl?.remove();
    this.endEl = null;
  }

  disposeScene() {
    // (sus materiales y texturas se liberan cuando el mapa nuevo ya compiló: core/sceneFlush)
    retireScene(this);
    // las sombras de las luces del mapa que se va (la luna: 4096² con su
    // profundidad, ~128 MB de placa de Alta para arriba) quedaban vivas en cada
    // cambio de mapa; las de fx/Epic (epicShadowLight) pasan al mapa nuevo.
    // (globalThis.__mduNoShadowFree: como antes)
    // Y lo que three sube por objeto y no por geometría: las matrices y colores
    // de cada InstancedMesh (pasto, follaje, zombies...) y la textura de huesos
    // de cada esqueleto; geometry.dispose no los suelta y quedaban en la placa
    // en cada partida nueva o cambio de mapa (~157 buffers y ~5 texturas por
    // vez). Si se vuelven a usar, three los sube de nuevo.
    // (globalThis.__mduNoMeshFree: como antes)
    const shadows = globalThis.__mduNoShadowFree !== true;
    const meshes = globalThis.__mduNoMeshFree !== true;
    if (shadows || meshes)
      this.scene.traverse((o) => {
        if (shadows && o.isLight && o.shadow?.map && o.name !== 'epicShadowLight') {
          o.shadow.dispose();
          o.shadow.map = null;
        }
        if (meshes && o.isInstancedMesh) o.dispose();
        if (meshes && o.isSkinnedMesh) o.skeleton?.dispose();
      });
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
    // (en una sala, el invitado no arranca nada: espera la orden del anfitrión)
    if (this.state === 'arriving' || this.net?.guest) return;
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
  arriveAsGuest(map = null, mode, restart = false) {
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
    this.arrival.startGuest(this.state !== 'title' || other || this.arrival.switching, restart);
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
    // (Eclipse: rearmar el mapa son ~4 s; con la pantalla quieta parecía
    // colgado. Se arma tapado por la postal, como al elegirlo en el título:
    // Arrival.switchMap, más abajo. agente rend; __mduNoEclExitCover: como antes)
    const cover = this.mapId === 'eclipse' && globalThis.__mduNoEclExitCover !== true && !!this.arrival;
    if (!cover) this.buildScene();
    this.state = 'title';
    // (el mate en la mano no va en el menú: saliendo a mitad de una recarga
    // quedaba el termo en el medio del título; el usuario 2026-10-05)
    if (this.weapons?.vmRoot) this.weapons.vmRoot.visible = false;
    this.paused = false;
    this.hostPaused = false;
    this.menuOpen = false;
    this.input.unlock();
    this.hud.show(false);
    this.menus.showClick(false);
    this.menus.show('title');
    if (message) this.hud.subtitle(message, 5);
    if (cover) this.arrival.switchMap();
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
    // (ee.noTarget: el que viaja en el ascensor del Monumento, entities/MonumentoEgg.js)
    if (!this.net) return this.player.canBeHit() && !this.player.maizIn && !this.ee?.noTarget?.(this.player, y) && (wet || !submerged(this.player)) ? this.player : null;
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
              : FEATURES.eclipse
                ? 'Modo prueba: 100.000 puntos, todo abierto y el Desgarrador del Eclipse en la mano.'
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
    this.dlg?.reset();
    // en línea cada uno arranca al lado del otro, no encimados
    const id = this.net?.id || 0;
    if (id > 0) this.spawnBeside(id);
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

  // En línea, el jugador `id` (1, 2, 3) arranca a un costado del comienzo
  // (1 a la derecha, 2 a la izquierda, 3 más a la derecha), mirando para el
  // mismo lado: antes iba a 0,9 m en una dirección fija, que en varios mapas
  // caía justo adelante del anfitrión y al terminar la entrada su cuerpo le
  // tapaba la pantalla. Donde haya lugar (sin pared en el medio y el mismo
  // piso); si no, un paso atrás; si nada entra, como antes.
  // (globalThis.__mduNoSpawnSide: como antes)
  spawnBeside(id) {
    const p = this.player;
    const W = this.world;
    const old = () => {
      const a = id * 2.1;
      p.pos.x += Math.cos(a) * 0.9;
      p.pos.z += Math.sin(a) * 0.9;
    };
    if (globalThis.__mduNoSpawnSide === true || !W?.circleFree) return old();
    const ax = p.pos.x;
    const az = p.pos.z;
    // (recién puesto, el jugador está en y = 0: el piso de verdad puede estar
    // más arriba, el patio del penal, la cumbre del castillo)
    const y = Math.max(p.pos.y || 0, W.floorAt(ax, az, p.pos.y || 0));
    // derecha y adelante de la mirada del comienzo (la cámara mira a -z con yaw 0)
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const side = id % 2 ? 1 : -1;
    const lane = Math.ceil(id / 2) * 1.3;
    const r = 0.38;
    const f0 = W.floorAt(ax, az, y);
    // (los de repuesto, distintos para cada uno: dos no caen en el mismo lugar)
    const cands = [[side * lane, 0], [side * lane, -0.9], [-side * lane, -0.9], [side * 0.6, -lane], [0, -lane - 0.4], [side * lane, 1], [-side * lane, 1], [-side * lane, 0]];
    for (const [s, f] of cands) {
      const x = ax + rx * s + fx * f;
      const z = az + rz * s + fz * f;
      if (!W.inside(Math.floor(x), Math.floor(z)) || !W.circleFree(x, z, r, y + 0.05, y + 1.7)) continue;
      if (W.sweepFree && !W.sweepFree(ax, az, x, z, r * 0.8, y + 0.3, y + 1.7)) continue;
      if (Math.abs(W.floorAt(x, z, y) - f0) > 0.3) continue;
      p.pos.x = x;
      p.pos.z = z;
      return;
    }
    old();
  }

  restart() {
    // en línea solo el anfitrión arma otra, y la arma para todos
    if (this.net?.guest) return;
    // con la pantalla de carga, como al arrancar (compila y calienta el mapa
    // nuevo; antes arrancaba al toque y trababa un buen rato) y sin la entrada
    this.net?.clearScores();
    this.audio.resume();
    this.arrival.start(true, { restart: true });
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
    // muerto con el alma afuera (el gaucho life del penal): vuelve al cuerpo
    // antes de caer; si no, quedaban dos cuerpos (el del gaucho life y el del
    // final) y la pantalla azul del alma (globalThis.__mduNoVidaEnd: como antes)
    if (this.vida?.active && globalThis.__mduNoVidaEnd !== true) this.vida.leave(true);
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
    const tour = () => {
      if (this.state !== 'over' || !this.endCam || this.tour) return;
      this.tour = new DeathTour(this, showMenu);
    };
    // (en línea, con el reloj de verdad del alma: updateEnd; solo, como antes)
    if (this.endCam?.w) this.endCam.tour = tour;
    else this.later(END_SECS, tour);
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
    // (w: en línea el alma va con el reloj de verdad, como las escenas: el paseo
    // del final arranca a la vez en todas las compus; updateEnd)
    this.endCam = { t: 0, x: p.pos.x, y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, eye: p.eye, top: indoor ? 3.15 : 8.5, wide: indoor ? 0.9 : 3.4, w: this.net && globalThis.__mduNoCineSync !== true ? performance.now() : 0 };
    this.endBody = new Avatars(this, this.net);
    const body = { id: this.net?.id || 0, name: '', noTag: true, corpse: true, shield: !!p.shield, pos: new THREE.Vector3(p.pos.x, y, p.pos.z), yaw: p.yaw, pitch: 0, speed: 0 };
    this.endBody.add(body);
    // (el que hace de Gil, con su vincha y no la bandana de los compañeros: net/gilLook.js)
    if (this.ee?.isGil?.() && globalThis.__mduNoBandanas !== true) gilVincha(this.endBody.list.get(body.id));
    // tirado a su manera, según su carácter en la cuadrilla (ui/deathPose.js)
    this.endPose = deathPose(this, this.endBody, body.id, body);
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
    if (e.w) {
      const now = performance.now();
      const w = (now - e.w) / 1000;
      e.w = now;
      e.t += w >= 0.002 && w < 30 ? w : dt;
      if (e.tour && e.t >= END_SECS) {
        const f = e.tour;
        e.tour = null;
        f();
      }
    } else e.t += dt;
    this.endBody?.update(dt);
    this.endPose?.(dt);
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
    // con el último, el super easter egg (lo muestra la pantalla del final)
    this.stats.easterEgg = true;
    const was = isKnight();
    // (el Challenge de la torre no cuenta: su final es la escalera al cielo)
    if (!this.cheated && this.modeNow === 'story' && markEgg(this.mapId) && !was && isKnight()) this.stats.knight = true;
    // la experiencia: el easter egg (el Challenge de la torre, menos) y, con
    // todos, el super easter egg (una sola vez)
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
    if (FEATURES.esteros || FEATURES.egg === 'reto' || FEATURES.egg === 'primermate') {
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
    // cuándo habla cada uno (el cuerpo del que habla gesticula: ui/fierroNpc talkingNow);
    // las que esperan su turno se suman a la que está diciendo
    const T = (this.talkT ||= {});
    T[speaker] = [...(T[speaker] || []).filter((x) => x[1] > this.time), [this.time + wait, this.time + wait + dur]];
    const label = { fierro: 'Martín Fierro', francisco: 'Francisco', abuelo: 'Abuelo', capataz: 'El Capataz', capatazJoven: 'Anselmo, el capataz (1911)', radio: FEATURES.penal ? 'Radio Nacional' : 'Radio Misiones', taza: 'La taza', anunciador: 'La Voz', entidad: 'La Voz de Arriba', espantapajaros: 'El Espantapájaros', alcaide: 'El Alcaide', gil: 'El Gauchito Gil', anacleto: 'Anacleto', cirilo: 'Cirilo', benito: 'Benito', nicanor: 'Nicanor', sargento: 'El Sargento', belgrano: 'Manuel Belgrano' }[speaker] || speaker;
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
      if (v === 'auto') v = this.autoTier();
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
    return (c && c[sys]) || this.mapGfx()?.[sys] || this.settings.quality;
  }

  // Lo de este mapa sobre la calidad elegida (config/quality.js MAP_GFX); la
  // Personalizada va tal cual la armó el jugador.
  mapGfx() {
    if (this.settings.qualityMode === 'custom' || globalThis.__mduNoMapGfx === true) return null;
    return MAP_GFX[this.mapId]?.[this.settings.quality] || null;
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
    this.post?.setQuality(this.settings.quality, this.settings.qualityMode === 'custom' ? this.settings.gfx : null, this.mapGfx());
    // en plena partida (a mano o la automática que la baja): lo visible se
    // recompila solo, pero lo escondido no (el mate que muestra el Pack-a-Pava o
    // la caja, los actores de las cinemáticas). Se vuelve a compilar todo de
    // fondo, como en la llegada; si no, el Porongo del Caballero en la máquina
    // congelaba más de un segundo.
    if (this.state === 'playing' || this.state === 'paused') {
      const tok = (this.rewarmTok = (this.rewarmTok || 0) + 1);
      // Y hasta que termine no se dibuja (ni corre la partida, solo): el primer
      // cuadro con la calidad nueva compilaba de a uno, esperando cada uno, los
      // materiales a la vista (en ANGLE ~350 ms cada uno: 19 s en el castillo,
      // 20-56 s en Eclipse, que el usuario vio como "se crashea"). De fondo van
      // todos a la vez: 2-4 s, con un aviso. (globalThis.__mduNoQualityHold: como antes)
      const hold = globalThis.__mduNoQualityHold !== true;
      if (hold) this.qualityHold(true);
      // (las lámparas prendidas, ya con la cantidad de la calidad nueva: si no,
      // se compilaba con la cuenta vieja y el primer cuadro recompilaba igual)
      if (hold && this.world) {
        this.world.lightT = 0;
        this.world.cullLights?.(0);
        this.world.syncLights?.(this.camera);
      }
      setTimeout(
        () => {
          if (tok === this.rewarmTok && (this.state === 'playing' || this.state === 'paused'))
            rewarmShaders(this)
              .then(() => {
                // (y el mapa entero, con las variantes de la calidad nueva)
                if (tok === this.rewarmTok && (this.state === 'playing' || this.state === 'paused')) warmWorld(this);
              })
              .catch(() => {})
              .finally(() => {
                if (tok === this.rewarmTok) this.qualityHold(false);
              });
          else if (tok === this.rewarmTok) this.qualityHold(false);
        },
        hold ? 0 : 250,
      );
    }
  }

  // El aviso mientras se compila la calidad nueva (applyQuality); con él
  // prendido el bucle no dibuja (y solo, tampoco corre la partida).
  qualityHold(on) {
    this.qHold = on;
    if (on && !this.qHoldEl) {
      const el = document.createElement('div');
      el.textContent = 'Aplicando gráficos…';
      el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;padding:10px 18px;border-radius:6px;background:rgba(0,0,0,.72);color:#f2e6c8;font:600 16px/1.2 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none';
      (this.root || document.body).appendChild(el);
      this.qHoldEl = el;
    } else if (!on && this.qHoldEl) {
      this.qHoldEl.remove();
      this.qHoldEl = null;
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
  // (el jugador ya no tiene tope de FPS, el usuario 2026-10-03: vsync siempre)
  fpsCap() {
    return navigator.webdriver ? +this.settings.fpsCap || 0 : 0;
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    // tope de FPS: solo en las pruebas automáticas (fpsCap), para no cargar la
    // PC; jugando manda el vsync. Se saltean los cuadros que llegan antes de
    // tiempo (a paso fijo, así el promedio da el tope aunque no divida al monitor).
    const cap = this.fpsCap();
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
    this.hitch?.begin(now - this.last);
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
    this.menuAmb?.tick(this);
    // (Eclipse Matero: el ambiente de cada isla, fx/eclipseAmbience.js; existe
    // si lo armó entities/EclipseEgg.js, y se calla solo fuera de la partida)
    this.audio?.eclAmb?.tick(dt);
    // un menú con escena 3D propia (la pulpería, la armería): se dibuja ella
    // sola, sin el mundo de atrás (menus.stage = { render(renderer, dt) })
    const stage = this.state === 'title' ? this.menus?.stage : null;
    if (stage) stage.render(this.renderer, dt);
    else if (this.state === 'title') this.titleCam(dt);
    else if ((this.state === 'playing' || this.state === 'over') && !(this.qHold && !this.net)) this.update(dt);
    // las cinemáticas de la granja y el penal pasan adentro del mundo
    else if (this.state === 'won' && this.cine?.update) this.cine.update(dt);
    this.nearPlane();
    if (!stage && !this.qHold && !this.switchHold) this.render(dt);
    this.hitch?.end();
    this.input.endFrame();
  }

  // (2026-10-08, el usuario: "el castillo titila en el menú", "los bordes que
  // tienen barandas siguen titilando cuando se ven de lejos". Eclipse ve islas
  // a 100-150 m y con el plano cercano en 0,05 la profundidad allá distingue
  // ~2 cm: paredes y techos a 3-9 cm (molino: statics contra los techos) se
  // pisaban. En Eclipse: 1 m en el menú (no hay nada cerca de la cámara) y
  // 0,12 jugando (la esquina del plano queda a 0,22 m, adentro del radio del
  // jugador, 0,36: no corta paredes; con un techo a menos de 0,16 m de los
  // ojos —saltando bajo un techo bajo— baja hasta 0,05 para no verlo de
  // adentro: el plano llega 1,25 veces más arriba que su distancia).
  // globalThis.__mduOldEclNear: siempre 0,05)
  nearPlane() {
    const c = this.camera;
    if (!c) return;
    let n = this.mapId !== 'eclipse' || globalThis.__mduOldEclNear === true ? 0.05 : this.state === 'title' ? 1 : 0.12;
    if (n === 0.12 && this.world?.levels) {
      const room = ceilAt(this.world, Math.floor(c.position.x), Math.floor(c.position.z)) - c.position.y;
      if (room < 0.16) n = Math.max(0.05, Math.round((room - 0.01) / 1.25 / 0.01) * 0.01);
    }
    if (c.near === n) return;
    c.near = n;
    c.updateProjectionMatrix();
    if (this.post?.taa) this.post.taa.valid = false;
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
    this.dlg?.update(dt);
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
    // (las cinemáticas del easter egg que piden su lente —ui/EclipseEnding
    // wantFov—: si no, el de la partida les pisaba cada toma a ~74°)
    const cineFov = this.ee?.scene?.cine?.wantFov;
    const targetFov = this.intro?.active ? this.intro.fov : cineFov > 0 ? cineFov : this.baseFov + (adsFov - this.baseFov) * w.adsT + (this.player.sprinting ? 4 : 0);
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
