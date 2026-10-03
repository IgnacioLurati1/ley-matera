import * as THREE from 'three';
import LoadScreen from './LoadScreen';
import { MAP_LIST, MAP_MODES, FEATURES } from '../config/map';
import { readyBossSkins } from '../entities/bossSkin';
import { keyLabel } from '../core/controls';

// Llegada a un mapa: la carga del principio (arma el mapa elegido), el cambio
// de mapa en el título y la entrada a la partida. En línea, el anfitrión
// espera a que todos carguen; cuando están todos, suena el mate y la partida
// arranca con un fundido desde negro.

// Fotos de cada mapa para la postal: se sacan la primera vez que se arma cada
// mapa y quedan guardadas en el navegador para las próximas veces.
const postcards = new Map();
// (la primera vez que se arma un mapa todavía no hay foto: va la que viene con
// el juego, public/assets/sotano/postales; la de esta compu la reemplaza)
const POSTAL_DIR = '/assets/sotano/postales/';
const postalOf = (id) => postcards.get(id) || `${POSTAL_DIR}${id}.jpg`;
const PC_DB = 'lm-postales';
const pcDb = () =>
  new Promise((res, rej) => {
    const rq = indexedDB.open(PC_DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('p');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
function savePostcard(id, url) {
  try {
    pcDb()
      .then((db) => {
        const tx = db.transaction('p', 'readwrite');
        tx.objectStore('p').put(url, id);
        tx.oncomplete = tx.onerror = () => db.close();
      })
      .catch(() => {});
  } catch {
    /* sin IndexedDB: la postal vale solo esta vez */
  }
}
// (las de esta vez mandan sobre las guardadas)
function loadPostcards() {
  try {
    pcDb()
      .then((db) => {
        const rq = db.transaction('p').objectStore('p').openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (!c) return db.close();
          if (!postcards.has(c.key) && typeof c.value === 'string') postcards.set(c.key, c.value);
          c.continue();
        };
        rq.onerror = () => db.close();
      })
      .catch(() => {});
  } catch {
    /* sin IndexedDB */
  }
}
// Si alguien no termina de cargar, se arranca igual pasado este tiempo.
const WAIT_MAX = 60000;
// Solo o si cargó rápido, la postal se ve al menos esto.
const MIN_SHOW = 2600;
// Del sorbo al fundido: lo que dura el ruido del mate.
const SIP_MS = 1550;

const TIPS = [
  () => `Mantené ${keyLabel('use')} al lado de una ventana rota para volver a clavar las tablas.`,
  () => `Con ${keyLabel('knife')} sacás el facón: en las primeras rondas ahorra yerba.`,
  () => `${keyLabel('grenade')} tira una bomba de yerba y ${keyLabel('tactical')}, la pava silbadora.`,
  () => `${keyLabel('reload')} ceba el mate (recarga). Hacelo antes de quedarte seco.`,
  () => `Con ${keyLabel('shield')} el escudo pasa adelante: cubre de frente y el clic da un escudazo.`,
  () => `En línea, mantené ${keyLabel('use')} sobre un compañero caído para levantarlo.`,
  () => 'Las teclas se cambian en Controles, desde el título o la pausa.',
];

const later = (ms) => new Promise((r) => setTimeout(r, ms));
// Un cuadro pintado (con respaldo por si la pestaña no dibuja).
const frame = () =>
  new Promise((r) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      r();
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 150);
  });

const infoOf = (id) => MAP_LIST.find((m) => m.id === id) || { id, name: id, sub: '' };
// El mapa elegido con su modo (el Challenge de la torre lleva su nombre y su línea).
const labelOf = (g) => {
  const info = infoOf(g.mapId);
  const md = MAP_MODES[g.mapId]?.find((m) => m.id === g.modeNow && m.id !== 'story');
  return md ? { ...info, name: `${info.name} · ${md.name}`, sub: md.sub } : info;
};

// Las prendas de los zombies sin nadie que las use no se dibujan
// (Zombies.render): para compilar y calentar se muestran enteras un momento.
// Devuelve con qué volver a como estaban.
function showZombies(g) {
  const back = [];
  for (const M of g.zombies?.meshes || []) {
    const im = M.im;
    back.push([im, im.visible, im.count]);
    im.visible = true;
    im.count = im.instanceMatrix.count;
  }
  return () => {
    for (const [im, v, n] of back) {
      im.visible = v;
      im.count = n;
    }
  };
}

// Compila los shaders del mapa sin trabar la página (si el navegador puede).
// Contra el buffer del postproceso, que es donde se dibuja de verdad (contra la
// pantalla saldrían otras variantes y se volverían a compilar al aparecer), y
// con lo escondido incluido (los mates de la caja y de las paredes, la Luz Mala).
// También el mate en la mano, que va en su propia escena.
// (Game.applyQuality la vuelve a llamar si cambia la calidad en plena partida.)
export async function compile(g) {
  const R = g.renderer;
  const prev = R.getRenderTarget();
  R.setRenderTarget(g.post?.composer?.renderTarget1 || prev);
  const jobs = [];
  // el jefe vive escondido: se muestra entero un momento para que compile lo suyo
  const hideBoss = g.zombies?.bossRig?.showAll?.();
  const backZ = showZombies(g);
  // los mates armados de la mano (también los mejorados) pasan un momento por
  // el mapa: así el de la pava y los de las paredes salen con sus luces
  const warm = g.weapons?.warm;
  // los mates que pasaron por la mano ya no están en ese grupo (el de la mano
  // está en su escena; los guardados, en ninguna): copias livianas, con las
  // mismas mallas y materiales, para que salgan también sus variantes. Si no,
  // cambiar la calidad en plena partida y llevar el Porongo del Caballero al
  // Pack-a-Pava congelaba un segundo (su nácar se compilaba ahí, con el mapa).
  const extra = new THREE.Group();
  // (y los potenciadores: el Farol de las Ánimas trababa al aparecer)
  const pups = g.powerups?.warmGroup?.();
  if (pups) extra.add(pups);
  // (y lo que algunos mates especiales arman recién al usarse: el charco del
  // Liquidificador trababa ~300 ms, los arcos del Facón ~50 ms)
  const wfx = g.weapons?.warmFx?.();
  if (wfx) extra.add(wfx);
  for (const m of g.weapons?.models?.values?.() || []) {
    if (!m?.root || (warm && m.root.parent === warm)) continue;
    m.root.traverse((o) => {
      if (o.isMesh && o.material) extra.add(new THREE.Mesh(o.geometry, o.material));
    });
  }
  try {
    if (warm) g.scene.add(warm);
    g.scene.add(extra);
    jobs.push(R.compileAsync(g.scene, g.camera));
    if (warm) g.weapons.vmScene.add(warm);
    if (g.weapons) {
      g.weapons.vmScene.add(extra);
      jobs.push(R.compileAsync(g.weapons.vmScene, g.weapons.vmCamera));
      // en el gaucho life (el penal arranca ahí) la mano lleva su luz: otra
      // luz puntual en la escena del mate, y todo lo de la mano se recompilaba
      // al arrancar. Se compila también con esa luz (compile arma los
      // programas en el momento: la luz se saca enseguida).
      if (g.vida) {
        const L = new THREE.PointLight(0xffffff, 0, 1);
        g.weapons.vmScene.add(L);
        try {
          jobs.push(R.compileAsync(g.weapons.vmScene, g.weapons.vmCamera));
        } finally {
          L.removeFromParent();
        }
      }
    }
  } catch {
    R.compile(g.scene, g.camera);
  } finally {
    extra.removeFromParent();
    if (warm) g.weapons.vmScene.add(warm);
    R.setRenderTarget(prev);
    hideBoss?.();
    backZ();
  }
  await Promise.all(jobs).catch(() => {});
  usePrograms(g);
}

// Cada programa compilado, usado una vez acá (en la carga). La primera vez que
// three usa un programa le pregunta a la placa sus uniformes y si enlazó, y esa
// pregunta espera a que la placa termine todo lo que tiene en cola (y a que
// termine de compilarlo, que va en paralelo): en plena partida eran tirones de
// 50-70 ms cuando muchos materiales pasaban a otra variante juntos (en el
// estero, 72 en un cuadro a los 3,5 s). Compilados ya estaban; usados, no.
// (globalThis.__mduNoUseProg: como antes)
export function usePrograms(g) {
  if (globalThis.__mduNoUseProg === true) return;
  for (const p of g.renderer?.info?.programs || []) {
    try {
      p.getUniforms();
      p.getAttributes();
    } catch {
      /* uno que falla se ve al usarlo, como antes */
    }
  }
}

// Todo el mapa de una, sin recorte por cámara: sube a la placa los modelos y
// las texturas y compila cada variante (G-buffer, sombras, reflejo del agua)
// de lo que no se ve desde donde se aparece. Si no, eso se subía al verlo por
// primera vez en plena partida: tirones de 30-50 ms al pasar a otra zona (el
// corral de la granja, el puente del estero). Tarda lo que tarde: es la carga.
export function warmWorld(g) {
  const R = g.renderer;
  if (!R || !g.scene) return;
  // las texturas de todo, también de lo escondido
  const seen = new Set();
  const tex = (t) => {
    if (!t?.isTexture || t.isRenderTargetTexture || seen.has(t)) return;
    seen.add(t);
    try {
      R.initTexture(t);
    } catch {
      /* una que no sube se sube al verla, como antes */
    }
  };
  const mats = (o) => {
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k in m) if (m[k]?.isTexture) tex(m[k]);
      for (const u of Object.values(m.uniforms || {})) {
        const v = u?.value;
        if (v?.isTexture) tex(v);
        else if (Array.isArray(v)) v.forEach(tex);
      }
    }
  };
  g.scene.traverse(mats);
  g.weapons?.vmScene?.traverse(mats);
  // dos cuadros con todo lo visible, cerca o lejos, adelante o atrás (el
  // segundo, para lo que el primero recién armó: los cubos de sombra guardados)
  const culled = [];
  g.scene.traverse((o) => {
    if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) {
      o.frustumCulled = false;
      culled.push(o);
    }
  });
  // el maizal del matorral apaga lo lejano (entities/Matorral.js)
  const far = [];
  for (const ch of g.matorral?.chunks || []) {
    if (ch.im.visible) continue;
    ch.im.visible = true;
    far.push(ch.im);
  }
  // los haces de las ventanas (fx/Shafts) cambian de cara cuando la cámara se
  // mete adentro: esa variante se compilaba al cruzar el primer haz (el puente
  // del estero, 40 ms). En el segundo cuadro van dadas vuelta.
  // (con los pasos de la calidad en uso: si no, los pone Ambience.update recién
  // al jugar y se compilaban igual al ver el primer haz)
  g.ambience?.beams?.setQuality?.(g.tier?.('amb') ?? g.settings.quality);
  const beams = [];
  g.ambience?.beams?.root?.traverse((o) => {
    if (o.isMesh && o.material?.uniforms?.uBoards && o.material.side === THREE.FrontSide) beams.push(o.material);
  });
  const flip = (side) => {
    for (const m of beams) {
      m.side = side;
      m.needsUpdate = true;
    }
  };
  // las luces con sombra de los fuegos (fx/Epic): en la carga todavía no
  // tomaron ningún fuego y no dibujan nada; sin esto, la sombra de cada tipo
  // de cosa (los recortes, lo instanciado) se compilaba al acercarse a un farol
  for (const l of g.post?.epic?.pool || []) if (l.parent) l.shadow.needsUpdate = true;
  // (y las que no tomaron ningún fuego, en la cámara con alcance grande: fx/Epic pickLamps)
  const epic = g.post?.epic;
  if (epic) epic.warmAt = g.camera.position.clone();
  // los potenciadores y lo que arman los mates especiales, dibujados de verdad
  // delante de la cámara (compilarlos no alcanzaba: el Farol de las Ánimas
  // trababa ~70 ms al aparecer, su variante del G-buffer, y otros ~70 al agarrarlo)
  const show = new THREE.Group();
  const pups = g.powerups?.warmGroup?.();
  if (pups) show.add(pups);
  const wfx = g.weapons?.warmFx?.();
  if (wfx) show.add(wfx);
  const cam = g.camera;
  show.position.copy(cam.position).add(new THREE.Vector3(0, 0, -3).applyQuaternion(cam.quaternion));
  g.scene.add(show);
  show.traverse(mats);
  for (const m of g.weapons?.models?.values?.() || []) m?.root?.traverse(mats);
  const backZ = showZombies(g);
  try {
    g.render(0.016);
    flip(THREE.BackSide);
    g.render(0.016);
    // que la placa termine de subir y compilar antes de seguir
    const gl = R.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  } finally {
    if (epic) epic.warmAt = null;
    show.removeFromParent();
    backZ();
    flip(THREE.FrontSide);
    for (const o of culled) o.frustumCulled = true;
    for (const o of far) o.visible = false;
  }
  R.shadowMap.needsUpdate = true;
  usePrograms(g);
}

// Un cuadro desde la cámara del título: sube texturas y sombras a la placa.
function warmTitle(g) {
  g.titleCam(0.016);
  g.render(0.016);
}

// Saca la foto del mapa armado para la postal (tiene que ser justo después de dibujar).
function snapPostcard(g, id) {
  try {
    const src = g.canvas;
    const w = 768;
    const hgt = 432;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    const sw = src.width;
    const sh = src.height;
    // recorte 16:9 del centro
    const cw = Math.min(sw, (sh * 16) / 9);
    const ch = (cw * 9) / 16;
    c.getContext('2d').drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, hgt);
    const url = c.toDataURL('image/jpeg', 0.84);
    postcards.set(id, url);
    savePostcard(id, url);
  } catch {
    /* sin foto: la postal va con un fondo liso */
  }
}

// Carga inicial: el mapa elegido (Game.init ya lo armó) compila sus shaders y
// saca la foto de la postal. Los demás se arman al elegirlos en el título
// (switchMap, detrás de su postal). Antes se armaban los siete acá: 25-30 s
// de carga al abrir el juego.
export async function prewarmMaps(g, step, from, to) {
  loadPostcards();
  const id = g.mapId;
  await step(from, `Preparando ${infoOf(id).name}…`);
  await compile(g);
  warmTitle(g);
  snapPostcard(g, id);
  await step(to, 'Listo.');
}

export default class Arrival {
  constructor(g) {
    this.g = g;
    this.screen = new LoadScreen(g.root);
    this.run = 0;
    this.active = false;
    this.switching = false;
  }

  // ---------------- cambio de mapa en el título ----------------
  // Tapa con la postal, arma el mapa y destapa. Si se eligió otro mientras
  // tanto, arma ese.
  async switchMap() {
    const g = this.g;
    if (this.switching) return;
    this.switching = true;
    let built = null;
    try {
      while (g.state === 'title' && built !== g.mapKey) {
        const id = g.mapId;
        const key = g.mapKey;
        const info = labelOf(g);
        const t0 = performance.now();
        this.screen.open({ name: info.name, sub: info.sub, image: postalOf(id), quick: true });
        this.screen.progress(0.1, `Viajando a ${info.name}…`);
        await frame();
        await frame();
        if (g.state !== 'title') break;
        g.buildScene();
        built = key;
        this.screen.progress(0.7);
        await compile(g);
        if (g.state !== 'title') break;
        warmTitle(g);
        if (!postcards.has(id)) snapPostcard(g, id);
        this.screen.progress(1);
        await later(Math.max(0, 450 - (performance.now() - t0)));
      }
    } catch (err) {
      console.error(err);
    }
    this.switching = false;
    if (!this.active && g.state === 'title') {
      this.screen.fadeOut(450);
      // (el HUD del mapa nuevo dibujado una vez, ya sin la postal: ui/Hud prewarm)
      setTimeout(() => g.state === 'title' && g.hud?.prewarm?.(), 600);
    }
  }

  // ---------------- entrada a la partida ----------------
  // Solo o anfitrión. `build`: hay que rearmar el mapa (no se viene del título).
  // restart: el fast restart (sin la cinemática de entrada).
  async start(build, { restart = false } = {}) {
    const g = this.g;
    const token = this.begin();
    this.noIntro = restart;
    // el clic en "Jugar" sirve para capturar el mouse desde ya
    g.input.lock();
    if (g.net?.host) {
      this.ready = new Set();
      this.t0 = performance.now();
      g.net.event('start', restart ? { map: g.mapId, mode: g.mode, rs: 1 } : { map: g.mapId, mode: g.mode });
      this.timeout = setTimeout(() => this.checkAll(true), WAIT_MAX);
    }
    this.renderPlayers();
    if (!(await this.load(token, build))) return;
    if (g.net?.host) {
      this.shareReady();
      this.checkAll();
      return;
    }
    await later(Math.max(0, MIN_SHOW - (performance.now() - this.opened)));
    if (token === this.run) this.go();
  }

  // Invitado: el anfitrión dio la orden de arrancar.
  async startGuest(build, restart = false) {
    const g = this.g;
    const token = this.begin();
    this.noIntro = restart;
    this.renderPlayers();
    if (!(await this.load(token, build))) return;
    g.net?.net.send({ t: 'loaded' });
    // si el anfitrión ya había arrancado (se cansó de esperar), entra al toque
    if (this.goPending) this.go();
    else this.screen.progress(1, 'Esperando a los demás…');
  }

  begin() {
    const g = this.g;
    const token = ++this.run;
    clearTimeout(this.timeout);
    this.active = true;
    this.selfReady = false;
    this.going = false;
    this.goPending = false;
    this.readyIds = new Set();
    g.state = 'arriving';
    g.menus.show(null);
    g.menus.showClick(false);
    g.hud.show(false);
    const info = labelOf(g);
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)]();
    this.screen.open({ name: info.name, sub: info.sub, image: postalOf(g.mapId), tip });
    this.opened = performance.now();
    return token;
  }

  // Arma el mapa (si hace falta), compila y dibuja un cuadro tapado.
  async load(token, build) {
    const g = this.g;
    this.screen.progress(0.08, 'Llegando…');
    await frame();
    await frame();
    if (token !== this.run) return false;
    if (build) {
      this.screen.progress(0.2, 'Armando el mapa…');
      await frame();
      if (token !== this.run) return false;
      g.buildScene();
    }
    this.screen.progress(0.75, 'Calentando el agua…');
    // el modelo del jefe de ronda: bajado acá y a la vista mientras se compila
    // (antes bajaba al arrancar la partida y se compilaba en el primer segundo)
    const bosses = FEATURES?.boss ? await readyBossSkins(g.zombies, FEATURES.boss === 'mixed' ? ['capataz', 'alcaide'] : FEATURES.boss) : null;
    if (token !== this.run) return false;
    // en línea, un compañero de muestra (su gaucho, la silueta y el mate) a la
    // vista mientras se compila (net/Avatars.warm): si no, se compilaba al
    // llegar el primer estado de cada uno, ya jugando
    const doneAv = await g.net?.avatars?.warm?.();
    if (token !== this.run) {
      doneAv?.();
      return false;
    }
    bosses?.show(true);
    // lo que se apoya en la utilería (las radios, lo de la canción secreta):
    // rayos contra todo el mapa, acá y no en el primer cuadro (~110 ms)
    if (g.activities && !g.activities.radiosSettled) g.activities.settleRadios();
    if (g.ee?.song && !g.ee.song.settled) g.ee.song.settle();
    // los íconos de la canasta de empanadas (cada uno arma y dibuja su
    // empanada: ~170 ms la primera vez, que caían en el arranque)
    try {
      for (const id of g.emp?.loadout?.() || []) g.emp.iconFor(id);
    } catch {
      /* sin íconos: los arma newRun, como antes */
    }
    await compile(g);
    if (token !== this.run) return false;
    // un cuadro desde cada toma de la cinemática de entrada (que no se trabe al pasar)
    g.intro?.warm();
    // un cuadro desde donde se aparece: texturas y sombras ya en la placa
    g.player.updateCamera(g.camera);
    // (antes, todo el mapa: lo que no se ve desde acá tampoco traba después)
    this.screen.progress(0.85, 'Cargando el mapa entero…');
    await frame();
    if (token !== this.run) return false;
    warmWorld(g);
    g.render(0.016);
    bosses?.show(false);
    doneAv?.();
    if (!postcards.has(g.mapId)) {
      warmTitle(g);
      snapPostcard(g, g.mapId);
      this.screen.setImage(postcards.get(g.mapId));
    }
    this.selfReady = true;
    this.screen.progress(1, 'Listo.');
    this.renderPlayers();
    return true;
  }

  // Anfitrión: un invitado terminó de cargar.
  onLoaded(id) {
    if (!this.active || !this.ready) return;
    this.ready.add(id);
    this.shareReady();
    this.renderPlayers();
    this.checkAll();
  }

  // Anfitrión: les cuenta a todos quiénes ya cargaron (él incluido).
  shareReady() {
    const ids = [...this.ready];
    if (this.selfReady) ids.push(this.g.net.id);
    this.g.net?.event('arrive', { ids });
  }

  // Invitado: quiénes ya cargaron (lo manda el anfitrión).
  setReady(ids) {
    this.readyIds = new Set(ids || []);
    this.renderPlayers();
  }

  // Anfitrión: ¿están todos? (o se pasó el tiempo, o se fue el que faltaba)
  checkAll(force = false) {
    const g = this.g;
    if (!this.active || this.going || !this.selfReady || !g.net?.host) return;
    const waiting = [...g.net.net.peers.keys()].filter((id) => !this.ready.has(id));
    if (waiting.length && !force) {
      this.screen.progress(1, waiting.length === 1 ? `Esperando a ${g.net.nameOf(waiting[0])}…` : `Esperando a ${waiting.length} jugadores…`);
      return;
    }
    g.net.event('go');
    this.go();
  }

  // Invitado: el anfitrión dijo que arranca.
  remoteGo() {
    const g = this.g;
    if (this.active) {
      if (this.selfReady) this.go();
      else this.goPending = true;
      return;
    }
    // entró a la sala mientras los demás cargaban: se suma directo
    if (g.state === 'title' && g.net?.guest) g.startAsGuest(g.mapId);
  }

  renderPlayers() {
    const g = this.g;
    const net = g.net;
    if (!net) return this.screen.players(null);
    const me = net.id;
    const list = net.players.map((p) => ({
      name: p.name,
      me: p.id === me,
      ready: p.id === me ? this.selfReady : net.host ? this.ready?.has(p.id) : this.readyIds.has(p.id),
    }));
    this.screen.players(list);
  }

  // Todos listos: negro, el sorbo del mate y adentro.
  async go() {
    const g = this.g;
    if (this.going) return;
    this.going = true;
    const token = this.run;
    clearTimeout(this.timeout);
    this.screen.toBlack();
    g.audio.resume();
    g.audio.sip();
    await later(SIP_MS);
    if (token !== this.run) return;
    this.active = false;
    if (g.net?.guest) {
      g.newRun();
      g.rounds.state = 'remote';
    } else g.newRun();
    // la cinemática de entrada del mapa (ui/Intro); al terminar pide el clic si hace falta
    const intro = !this.noIntro && !!g.intro?.play();
    this.noIntro = false;
    // sin clic reciente el navegador no deja capturar el mouse: se pide uno
    if (!g.input.locked && !intro) g.menus.showClick(true);
    this.screen.reveal(1800);
  }

  // Se cortó todo (salió de la sala, se fue el anfitrión).
  cancel() {
    this.run++;
    clearTimeout(this.timeout);
    this.active = false;
    this.going = false;
    this.screen.close();
  }
}
