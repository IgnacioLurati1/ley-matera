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
import Zombies from './entities/Zombies';
import Player from './entities/Player';
import Rounds from './entities/Rounds';
import Powerups from './entities/Powerups';
import EasterEgg from './entities/EasterEgg';
import Weather from './world/Weather';
import Activities from './world/Activities';
import Decor from './world/Decor';
import Arena from './world/Arena';
import Cinematic from './ui/Cinematic';
import Session from './net/Session';
import Avatars from './net/Avatars';
import Weapons from './weapons/Weapons';
import Hud from './ui/Hud';
import Menus from './ui/Menus';
import { START_POINTS, ZOMBIE_DAMAGE } from './config/rules';
import { START_ZONE, ZONES } from './config/map';
import { PERKS } from './config/perks';

const SETTINGS_KEY = 'lm-zombies-settings';
const BEST_KEY = 'lm-zombies-best';
const QUALITY = {
  low: { pr: 0.7, shadows: false, shadowSize: 512 },
  medium: { pr: 1, shadows: true, shadowSize: 1024 },
  high: { pr: 1.25, shadows: true, shadowSize: 2048 },
  ultra: { pr: 2, shadows: true, shadowSize: 4096 },
};
const DEFAULTS = { sensitivity: 1, fov: 74, master: 0.8, music: 0.55, sfx: 0.9, shake: 1, quality: 'high', invertY: false, voiceMode: 'auto', showFps: false };

// Entrada vacía: el jugador sigue con su física pero no toca nada (menú abierto en línea).
const IDLE_INPUT = { mouse: { dx: 0, dy: 0 }, sensitivity: 1, invertY: false, key: () => false, hit: () => false };
const END_SECS = 7.5;
const tmpCam = new THREE.Vector3();

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
    this.settings = { ...DEFAULTS, ...saved };
    this.best = store.get(BEST_KEY) || 0;
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

    await step(0.15, 'Pintando paredes y calcáreos…');
    this.textures = buildTextures();
    await step(0.55, 'Encendiendo el barbacuá…');
    this.audio = new GameAudio();
    this.audio.setVolumes(this.settings);
    this.audio.voiceMode = this.settings.voiceMode;
    await step(0.6, 'Despertando gargantas…');
    this.audio.buildBank();
    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.hud = new Hud(root);
    this.hud.show(false);
    // el HUD va debajo de los menús
    root.insertBefore(this.hud.root, this.menus.loading);

    await step(0.65, 'Levantando el molino…');
    this.buildScene();
    await step(0.9, 'Despertando a los peones…');
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.weapons.vmScene, this.weapons.vmCamera);
    this.applyQuality();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    // compilar shaders antes de mostrar el menú (evita tirones al empezar)
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.weapons.vmScene, this.weapons.vmCamera);
    await step(1, 'Listo.');
    this.menus.hideLoading();
    this.menus.setTitleInfo({ best: this.best, gpu: this.gpu.name, integrated: this.gpu.integrated });
    this.menus.show('title');
    this.state = 'title';
    this.last = performance.now();
    this.frames = 0;
    this.fpsT = 0;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.onKey = (e) => {
      if (e.code === 'Escape' && this.state === 'playing' && !this.input.locked) this.pause();
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
    const integrated = /Intel|UHD|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|Microsoft Basic|SwiftShader|llvmpipe/i.test(clean) && !/NVIDIA|GeForce|RTX|GTX|Arc A\d/i.test(clean);
    return { name: clean, integrated };
  }

  // Arma (o rearma) todo el mundo de juego desde cero.
  buildScene() {
    this.clearEnd();
    if (this.scene) this.disposeScene();
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
    if (this.weapons) {
      scene.environment = this.weapons.envMap;
      scene.environmentIntensity = 0.12;
    }
    this.nav = new Navigation(this.world);
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
    this.zombies = new Zombies(this);
    this.rounds = new Rounds(this);
    this.powerups = new Powerups(this);
    this.ee = new EasterEgg(this);
    this.weather = new Weather(this);
    this.decor = new Decor(this);
    this.arena = new Arena(this);
    this.world.finalizeStatic();
    this.world.computeNavBlock();
    this.points = START_POINTS;
    this.stats = { kills: 0, headshots: 0, knifeKills: 0, shots: 0, earned: 0, round: 0, time: 0, easterEgg: false };
    this.post?.setScenes(scene, this.camera);
    this.applyQuality();
    if (this.audio) this.audio.startFire(new THREE.Vector3(38.5, 1, 25));
    this.renderer.shadowMap.needsUpdate = true;
    // la cámara y los efectos nuevos nacen sin tamaño: hay que ajustarlos a la ventana
    if (this.post) this.resize();
    // los compañeros pasan al mundo nuevo
    this.net?.avatars.rebuild();
  }

  // Saca lo que quedó de la animación de fin de partida.
  clearEnd() {
    this.endCam = null;
    this.endBody?.dispose();
    this.endBody = null;
    this.endEl?.remove();
    this.endEl = null;
  }

  disposeScene() {
    this.weather?.dispose();
    this.activities?.dispose();
    this.arena?.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    if (this.audio?.fire) {
      clearInterval(this.audio.fire.crackle);
      try {
        this.audio.fire.src.stop();
      } catch {
        /* */
      }
    }
    this.weapons.clearProjectiles();
  }

  // ---------------- flujo del juego ----------------
  startGame() {
    this.audio.resume();
    if (this.state !== 'title') this.buildScene();
    this.newRun();
    // en línea: el anfitrión da la orden de arranque
    if (this.net?.host) this.net.event('start');
  }

  // Engancha una sala ya conectada: de acá en más se sincroniza la partida.
  attachNet(net) {
    this.net = new Session(this, net);
    return this.net;
  }

  // Empieza como invitado: el mundo lo maneja el anfitrión.
  startAsGuest() {
    this.audio.resume();
    if (this.cine) {
      // el anfitrión arrancó otra mientras mirabas el final
      const c = this.cine;
      this.cine = null;
      c.onDone = null;
      c.finish();
    }
    if (this.state !== 'title') this.buildScene();
    this.newRun();
    this.rounds.state = 'remote';
    // si arrancó sin un clic tuyo, el mouse se captura con el próximo
    if (!this.input.locked) this.menus.showClick(true);
  }

  // Salir de la sala (o cerrarla, si sos el anfitrión) y volver al título.
  leaveRoom(message) {
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

  // Invitado: el anfitrión se fue o se cortó la conexión.
  onHostGone() {
    if (!this.net) return;
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
  nearestPlayer(x, z) {
    if (!this.net) return this.player;
    return this.net.nearest(x, z) || this.player;
  }

  // Le pega a quien corresponda: si es un jugador remoto, se le avisa.
  damagePlayer(target, amount, from) {
    if (!target) return;
    if (target === this.player) {
      this.player.damage(amount, from);
      return;
    }
    this.net?.net.to(target.id, { t: 'hurt', a: amount, x: +from.x.toFixed(2), z: +from.z.toFixed(2) });
  }

  perkColor(id) {
    return PERKS[id]?.color || '#c8202a';
  }

  newRun() {
    this.hostPaused = false;
    this.menuOpen = false;
    this.audio.ctx.resume?.();
    try {
      speechSynthesis.cancel();
    } catch {
      /* */
    }
    this.weapons.reset();
    this.player.reset();
    // en línea cada uno arranca al lado del otro, no encimados
    const id = this.net?.id || 0;
    if (id > 0) {
      const a = id * 2.1;
      this.player.pos.x += Math.cos(a) * 0.9;
      this.player.pos.z += Math.sin(a) * 0.9;
    }
    this.points = START_POINTS;
    this.hud.reset();
    this.hud.setPoints(this.points);
    this.weapons.updateHud();
    this.hud.show(true);
    this.menus.show(null);
    this.state = 'playing';
    this.paused = false;
    this.rounds.start();
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
      // Esc sale del pointer lock: pausa como en cualquier FPS
      this.pause();
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
      store.set(BEST_KEY, this.best);
    }
    this.audio.ctx.resume?.();
    this.audio.setCritical(false);
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
    if (lost) {
      this.hud.show(false);
      showMenu();
      return;
    }
    this.audio.gameOver();
    this.post.flash(0.3);
    this.startEnd();
    this.later(END_SECS, showMenu);
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
    const zone = this.world.zoneAt(p.pos.x, p.pos.z);
    const indoor = !this.arena?.active && zone && !ZONES[zone].outdoor;
    this.endCam = { t: 0, x: p.pos.x, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, eye: p.eye, top: indoor ? 3.15 : 8.5, wide: indoor ? 0.9 : 3.4 };
    this.endBody = new Avatars(this, this.net);
    this.endBody.add({ id: this.net?.id || 0, name: '', noTag: true, corpse: true, pos: new THREE.Vector3(p.pos.x, 0, p.pos.z), yaw: p.yaw, pitch: 0, speed: 0 });
    this.hud.show(false);
    const n = Math.max(0, this.stats.round);
    const many = this.net?.remote.size > 0;
    const verb = many ? 'Sobrevivieron' : 'Sobreviviste';
    const line = `${verb} ${Math.max(1, n)} ${n <= 1 ? 'ronda' : 'rondas'}.`;
    const el = document.createElement('div');
    el.className = 'mdu-end';
    el.innerHTML = `<i class="mdu-end__black"></i><div class="mdu-end__txt"><h2 class="mdu-title">Fin del juego</h2><p>${line}</p><p class="mdu-end__soul">El molino se quedó con ${many ? 'sus almas' : 'tu alma'}.</p></div>`;
    this.root.insertBefore(el, this.menus.loading?.isConnected ? this.menus.loading : this.menus.screens.title);
    this.endEl = el;
  }

  updateEnd(dt) {
    const e = this.endCam;
    const cam = this.camera;
    e.t += dt;
    this.endBody?.update(dt);
    if (e.t < 1.55) {
      // la caída: la vista se va al piso y se tuerce
      const k = Math.min(1, e.t / 1.1);
      const f = k * k * (3 - 2 * k);
      cam.position.set(e.x, e.eye + (0.2 - e.eye) * f, e.z);
      cam.rotation.set(e.pitch + (0.45 - e.pitch) * f, e.yaw + f * 0.2, f * 0.7, 'YXZ');
      return;
    }
    // el alma sube (un corte a negro separa las dos tomas)
    const k = Math.min(1, (e.t - 1.55) / (END_SECS - 2));
    const u = 1 - (1 - k) ** 3;
    const a = e.yaw + (e.t - 1.55) * 0.16;
    const h = 0.45 + u * (e.top - 0.45);
    const rad = 0.3 + u * e.wide;
    tmpCam.set(e.x + Math.sin(a) * rad, h, e.z + Math.cos(a) * rad);
    this.world.collide(tmpCam, 0.3, h - 0.2, h + 0.2);
    cam.position.copy(tmpCam);
    cam.lookAt(e.x, 0.2, e.z);
    if (Math.random() < dt * 3) this.fx.sparkle(new THREE.Vector3(e.x, 0.3 + u * (e.top - 0.8), e.z), [1, 0.62, 0.3], 1, 0.3);
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
    if (this.stats.round > this.best) {
      this.best = this.stats.round;
      store.set(BEST_KEY, this.best);
    }
    this.input.unlock();
    this.hud.show(false);
    this.audio.stopAmbience();
    this.weather.stopAudio();
    this.audio.setCritical(false);
    this.cine = new Cinematic(this.root, this);
    this.cine.play(() => {
      this.cine = null;
      this.menus.gameOver(this.stats, this.best, { won: true, board: data?.board, role: this.netRole() });
    });
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
  say(speaker, text, kind = speaker) {
    this.net?.event('say', { s: speaker, x: text, k: kind });
    const dur = this.audio.say(text, speaker);
    const label = { abuelo: 'Abuelo', capataz: 'El Capataz', radio: 'Radio Misiones', taza: 'La taza', anunciador: 'La Voz' }[speaker] || speaker;
    this.hud.speak(label, text, dur + 1.4, kind);
    return dur;
  }

  activateZone(k) {
    if (this.activeZones.has(k)) return;
    this.activeZones.add(k);
    this.net?.event('zone', { z: k });
    this.hud.location(ZONES[k].name, ZONES[k].sub || '');
    this.ee?.onZone(k);
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
    this.hud.toast('¡Volvió la luz!');
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
    this.settings[k] = v;
    store.set(SETTINGS_KEY, this.settings);
    if (k === 'sensitivity') this.input.sensitivity = v;
    if (k === 'invertY') this.input.invertY = v;
    if (['master', 'music', 'sfx'].includes(k)) this.audio.setVolumes(this.settings);
    if (k === 'voiceMode') this.audio.voiceMode = v;
    if (k === 'fov') this.resize();
    if (k === 'quality') {
      this.applyQuality();
      this.resize();
    }
    if (k === 'showFps' && !v) this.hud.setFps(null);
  }

  applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.world?.moon) {
      this.world.moon.castShadow = q.shadows;
      this.world.moon.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.world.moon.shadow.map?.dispose();
      this.world.moon.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.post?.setQuality(this.settings.quality);
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const q = QUALITY[this.settings.quality] || QUALITY.high;
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
    this.fx.resize(h * pr, this.camera.fov);
  }

  // ---------------- bucle ----------------
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
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
    if (this.state === 'title') this.titleCam(dt);
    else if (this.state === 'playing' || this.state === 'over') this.update(dt);
    this.render(dt);
    this.input.endFrame();
  }

  // Cámara lenta recorriendo el patio detrás del menú.
  titleCam(dt) {
    this.time += dt;
    const t = this.time * 0.05;
    const c = this.camera;
    c.position.set(13 + Math.sin(t) * 3, 1.7 + Math.sin(t * 1.7) * 0.1, 28 + Math.cos(t) * 1.2);
    c.lookAt(19 + Math.sin(t * 0.7) * 5, 1.9, 21.5);
    this.world.update(dt, this.time);
    this.weather.update(dt);
    this.fx.update(dt, c);
    this.weapons.holder.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'playing') this.stats.time += dt;
    // temporizadores del juego (respetan la pausa)
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].t) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    const input = this.input;
    const active = this.state === 'playing' && !this.menuOpen;
    if (active) this.player.update(dt, input);
    else if (this.state === 'playing') this.player.update(dt, IDLE_INPUT);
    else if (this.endCam) this.updateEnd(dt);
    else this.player.updateCamera(this.camera);
    this.nav.update(this.player.pos.x, this.player.pos.z);
    if (active) this.weapons.update(dt, input);
    if (active) this.interact.update(dt, input);
    this.barriers.update(dt);
    this.rounds.update(dt);
    this.zombies.update(dt, this.time);
    this.arena.update(dt);
    this.powerups.update(dt);
    this.activities.update(dt);
    this.net?.update(dt);
    this.decor.update(dt);
    this.ee.update(dt);
    this.world.update(dt, this.time);
    this.weather.update(dt);
    this.fx.update(dt, this.camera);
    this.hud.update(dt);
    // fuego del barbacuá
    if (Math.random() < 0.7) this.fx.fire(new THREE.Vector3(38.5, 0.4, 24.4), 0.8, 1);

    // FOV al apuntar (y mira telescópica)
    const w = this.weapons;
    const st = w.stats;
    const adsFov = st?.scope ? st.adsFov || 22 : this.baseFov * 0.8;
    const targetFov = this.baseFov + (adsFov - this.baseFov) * w.adsT + (this.player.sprinting ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
      this.fx.resize(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y, this.camera.fov);
    }
    const scoped = st?.scope && w.adsT > 0.85;
    w.vmRoot.visible = !scoped && !this.endCam;
    this.hud.setCrosshair(w.crosshair, !w.ads && !this.player.sprinting && this.player.alive, !!scoped);
    if (this.player.downed) this.hud.setDowned(this.player.downT / 10);

    // luz del lugar para iluminar el mate en la mano
    const zone = this.world.zoneAt(this.player.pos.x, this.player.pos.z);
    if (this.arena?.active) this.hud.setRoom(this.arena.name);
    else if (zone) this.hud.setRoom(ZONES[zone].name);
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
    this.post.render(dt, this.time, { hurt: hurt * 0.9, down, crit: this.state === 'title' ? 0 : this.critK || 0, pulse });
  }

  dispose() {
    this.net?.dispose();
    this.net = null;
    cancelAnimationFrame(this.raf);
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
