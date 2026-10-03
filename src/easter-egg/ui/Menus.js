import Lobby from './Lobby';
import Profile from './Profile';
import LogrosMenu from './Logros';
import Pulperia from './Pulperia';
import Armory from './Armory';
import { decorateOver } from './overCastle';
import PlayMenu from './PlayMenu';
import { mapChip, mapScreen, syncMapUI, wireMapScreen } from './MapSelect';
import { TEXT } from '../config/map';
import { ACTIONS, assign, isReserved, keyLabel } from '../core/controls';
import { SCENES, TRACKS } from '../core/music';
import { eggsDone, eggsTotal, isKnight, eggTest } from '../core/eggs';
import { tiersOf } from '../config/quality';
import './controls.css';
import './menuKit.css';
import './credit.css';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const QUALITY_LABEL = { perf: 'Rendimiento', low: 'Baja', medium: 'Media', high: 'Alta', ultra: 'Ultra', epic: 'Épica' };

// Menús: carga, título, controles, opciones, pausa, sala en línea y fin del juego.

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// Lo que no se cambia (mouse, pausa) y cómo se usan algunas teclas en contexto.
// `use` se reemplaza por la tecla de usar que haya elegido el jugador.
const FIXED = [
  ['Mouse', 'Mirar · clic izquierdo dispara · derecho apunta'],
  ['Rueda', 'Cambiar de mate'],
  ['Clic izq. / der. (con la hoz)', 'Cortar / tirar una medialuna (la Hoz de la Muerte)'],
  ['{use} (en línea)', 'Mantener: levantar a un compañero caído · mirándolo, convidarle 500'],
  ['4', 'Pava silbadora (también)'],
  ['Esc', 'Pausa'],
];

export default class Menus {
  constructor(root, game) {
    this.g = game;
    this.root = root;
    this.loading = h('<div class="mdu-loading"><div><div class="mdu-title" style="font-size:64px">Mate der Untoten</div><p class="mdu-tag" data-l>Preparando el molino…</p><b><i></i></b></div><a class="mdu-credit" href="https://www.instagram.com/nacho_lurati/" target="_blank" rel="noopener noreferrer">Made by <strong>El Luta</strong></a></div>');
    root.appendChild(this.loading);
    this.screens = {};
    // lo que agregan otros archivos: acciones (data-act) y avisos al cambiar
    // de pantalla (ui/Profile, la pulpería, la armería)
    this.acts = {};
    this.showHooks = [];
    this.build();
    this.grain = h('<div class="mdu-grain"></div>');
    root.appendChild(this.grain);
    this.click = h('<div class="mdu-click">Hacé clic para seguir jugando</div>');
    root.appendChild(this.click);
    // la tarjeta del jugador y la pantalla de niveles
    this.profile = new Profile(this);
    // los logros: una tarjeta abajo de la del nivel (no un renglón más) y su pantalla
    this.logros = new LogrosMenu(this);
    // la pulpería: los pesos por empanadas, y la canasta
    this.pulperia = new Pulperia(this);
    // Jugar: Solo o Con amigos
    this.play = new PlayMenu(this);
    // la armería: los camuflajes de los mates (weapons/camos.js)
    this.armory = new Armory(this);
  }

  // Alt+I en el menú del título (Game.onKey): las escenas con música, para ir
  // directo a cada una. Devuelve si la abrió o la cerró.
  toggleMusic() {
    if (this.current !== 'title' && this.current !== 'music') return false;
    this.prev = 'title';
    this.show(this.current === 'music' ? 'title' : 'music');
    return true;
  }

  progress(k, text) {
    this.loading.querySelector('i').style.width = `${Math.round(k * 100)}%`;
    if (text) this.loading.querySelector('[data-l]').textContent = text;
  }

  hideLoading() {
    this.loading.remove();
  }

  screen(name, html) {
    const s = h(`<div class="mdu-menu ${name === 'title' ? '' : name === 'maps' ? 'mdu-menu--maps' : 'mdu-menu--solid'}" data-screen="${name}"><div class="mdu-panel">${html}</div></div>`);
    this.root.appendChild(s);
    this.screens[name] = s;
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        // (el primer clic destraba el audio del navegador; en pausa no: si no,
        // entrar a Opciones volvía a largar los diálogos y los sonidos)
        if (this.g.state !== 'paused') this.g.audio?.resume();
        this.act(b.dataset.act);
      }
      const m = e.target.closest('[data-map]');
      if (m) this.pickMap(m.dataset.map);
      // el modo del mapa elegido (la torre: Historia o Challenge)
      const md = e.target.closest('[data-mode]');
      if (md && !md.disabled) this.pickMode(md.dataset.mode);
    });
    return s;
  }

  build() {
    this.screen(
      'title',
      `<h1 class="mdu-title">Mate der Untoten</h1>
       <p class="mdu-tag">Un juego escondido de Ley Matera · zombies por rondas</p>
       <p class="mdu-small" data-eggs style="margin:4px 0 10px;letter-spacing:.06em"></p>
       ${mapChip()}
       <div class="mdu-list">
         <button class="mdu-btn" data-act="play">Jugar</button>
         <button class="mdu-btn" data-act="armory" hidden>Armería</button>
         <button class="mdu-btn" data-act="pulperia" hidden>Pulpería</button>
         <button class="mdu-btn" data-act="controls">Controles</button>
         <button class="mdu-btn" data-act="options">Opciones</button>
         <a class="mdu-btn" href="/assets/sotano/guia-easter-eggs.pdf" download="Mate der Untoten - Guia de los easter eggs.pdf" style="text-decoration:none">Guía de los easter eggs (PDF)</a>
       </div>
       <p class="mdu-small" data-best></p>
       <div data-gpu></div>`,
    );
    this.screen('maps', mapScreen());
    this.screen(
      'controls',
      `<h2 class="mdu-h2">Controles</h2>
       <p class="mdu-small mdu-binds__help">Hacé clic en una tecla y apretá la nueva (sirven también la rueda y los botones laterales del mouse). Si ya la usaba otra acción, se intercambian. Esc cancela.</p>
       <div class="mdu-keys mdu-binds" data-binds></div>
       <div class="mdu-keys" data-fixed></div>
       <div class="mdu-list mdu-binds__actions">
         <button class="mdu-btn" data-act="resetKeys">Restablecer teclas</button>
         <button class="mdu-btn" data-act="back">Volver</button>
       </div>`,
    );
    this.screen(
      'options',
      `<h2 class="mdu-h2">Opciones</h2>
       <div class="mdu-tabs" role="tablist">
         <button class="mdu-tab is-on" role="tab" aria-selected="true" data-tab="general">Generales</button>
         <button class="mdu-tab" role="tab" aria-selected="false" data-tab="sound">Sonido</button>
         <button class="mdu-tab" role="tab" aria-selected="false" data-tab="gfx">Gráficos</button>
       </div>
       <div class="mdu-pane" data-pane="general">
         <label class="mdu-field">Sensibilidad <input type="range" min="0.2" max="3" step="0.05" data-set="sensitivity"><output></output></label>
         <label class="mdu-field">Sensibilidad apuntando <input type="range" min="0.3" max="1.5" step="0.05" data-set="adsSens"><output></output></label>
         <label class="mdu-field">Invertir mouse <input type="checkbox" data-set="invertY"></label>
         <label class="mdu-field">Apuntar <select data-set="adsMode"><option value="hold">Mantener</option><option value="toggle">Tocar</option></select></label>
         <label class="mdu-field">Agacharse <select data-set="crouchMode"><option value="hold">Mantener</option><option value="toggle">Tocar</option></select></label>
         <label class="mdu-field">Correr <select data-set="sprintMode"><option value="hold">Mantener</option><option value="toggle">Tocar</option></select></label>
         <label class="mdu-field">Campo de visión <input type="range" min="60" max="100" step="1" data-set="fov"><output></output></label>
         <label class="mdu-field">Temblor de cámara <input type="range" min="0" max="1" step="0.05" data-set="shake"><output></output></label>
         <label class="mdu-field">Tamaño de subtítulos <input type="range" min="0.8" max="1.8" step="0.1" data-set="subSize"><output></output></label>
         <label class="mdu-field" data-supremo hidden>Mate Supremo en la caja <input type="checkbox" data-set="supremo"></label>
       </div>
       <div class="mdu-pane mdu-pane--sound" data-pane="sound" hidden>
         <div class="mdu-custom__cols">
         <div class="mdu-custom__col">
         <p class="mdu-small mdu-custom__head">Volumen</p>
         <label class="mdu-field">General <input type="range" min="0" max="1" step="0.05" data-set="master"><output></output></label>
         <label class="mdu-field" title="Las canciones de las entradas, los jefes, las escenas y las rondas">Música <input type="range" min="0" max="1" step="0.05" data-set="music"><output></output></label>
         <label class="mdu-field" title="Todos los efectos juntos (encima, cada tipo tiene el suyo)">Efectos <input type="range" min="0" max="1" step="0.05" data-set="sfx"><output></output></label>
         <label class="mdu-field" title="Lo que dicen los personajes">Voces <input type="range" min="0" max="1" step="0.05" data-set="voice"><output></output></label>
         </div>
         <div class="mdu-custom__col">
         <p class="mdu-small mdu-custom__head">Efectos por tipo</p>
         <label class="mdu-field" title="Disparos, recargas, explosiones y cuerpo a cuerpo">Armas <input type="range" min="0" max="1.5" step="0.05" data-set="volWeapons"><output></output></label>
         <label class="mdu-field" title="Gruñidos, pasos, tablas arrancadas, jefes y los bichos de las rondas especiales">Zombies y jefes <input type="range" min="0" max="1.5" step="0.05" data-set="volZombies"><output></output></label>
         <label class="mdu-field" title="Lluvia, viento, truenos, fuego, agua y los ruidos del mapa">Ambiente <input type="range" min="0" max="1.5" step="0.05" data-set="volWorld"><output></output></label>
         <label class="mdu-field" title="Tus pasos, los golpes que te comés, el corazón y la respiración">Jugador <input type="range" min="0" max="1.5" step="0.05" data-set="volPlayer"><output></output></label>
         <label class="mdu-field" title="El aviso de impacto, las compras, las puertas, la caja, los perks, el Pack-a-Pava y los potenciadores">Interfaz y máquinas <input type="range" min="0" max="1.5" step="0.05" data-set="volUi"><output></output></label>
         </div>
         <div class="mdu-custom__col">
         <p class="mdu-small mdu-custom__head">Salida</p>
         <label class="mdu-field" title="Auriculares: sonido 3D (se oye de dónde viene, también arriba y atrás). Parlantes: izquierda y derecha, más natural en parlantes. Mono: todo por igual en los dos lados">Salida <select data-set="audioOut"><option value="phones">Auriculares (3D)</option><option value="speakers">Parlantes</option><option value="mono">Mono</option></select></label>
         <label class="mdu-field" title="Amplio: los tiros y las explosiones pegan fuerte. Nocturno: todo más parejo, para jugar bajito sin perderse nada">Rango dinámico <select data-set="dynRange"><option value="wide">Amplio</option><option value="normal">Normal</option><option value="night">Nocturno</option></select></label>
         <label class="mdu-field" title="Cuánto retumban los sonidos en el lugar">Eco <input type="range" min="0" max="2" step="0.05" data-set="reverb"><output></output></label>
         <label class="mdu-field" title="Automático: si el juego va trabado, el sonido se aliviana para no cortarse. Liviano: siempre aliviado (compus lentas)">Rendimiento <select data-set="audioPerf"><option value="auto">Automático</option><option value="full">Completo siempre</option><option value="light">Liviano</option></select></label>
         </div>
         <div class="mdu-custom__col">
         <p class="mdu-small mdu-custom__head">Voces y efectos</p>
         <label class="mdu-field">Voces <select data-set="voiceMode"><option value="auto">Automática</option><option value="murmur">Murmullos</option><option value="off">Solo subtítulos</option></select></label>
         <label class="mdu-field" title="Con poca vida se tapan los oídos (la respiración y el corazón suenan igual)">Oídos tapados al caer <input type="checkbox" data-set="muffleLow"></label>
         <label class="mdu-field" title="Abajo del agua todo se oye ahogado (las burbujas suenan igual)">Sonido bajo el agua <input type="checkbox" data-set="muffleWater"></label>
         <label class="mdu-field" title="Si pasás a otra ventana o pestaña, el juego se calla">Silenciar en segundo plano <input type="checkbox" data-set="muteBg"></label>
         </div>
         </div>
         <p class="mdu-small" data-voice-note></p>
         <div class="mdu-list mdu-sound__reset"><button class="mdu-btn mdu-btn--mini" data-act="resetSound">Restablecer el sonido</button></div>
       </div>
       <div class="mdu-pane" data-pane="gfx" hidden>
         <label class="mdu-field">Calidad <select data-set="quality"><option value="auto">Automática</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option><option value="epic">Épica</option><option value="custom">Personalizada</option></select></label>
         <label class="mdu-field">Escalado <select data-set="upscale"><option value="off">Nativo (sin escalar)</option><option value="ultra">AMD FSR 1 · Ultra calidad (77%)</option><option value="quality">AMD FSR 1 · Calidad (67%)</option><option value="balanced">AMD FSR 1 · Equilibrado (59%)</option><option value="perf">AMD FSR 1 · Rendimiento (50%)</option><option value="custom">AMD FSR 1 · Resolución a elección</option></select></label>
         <label class="mdu-field" data-fsrpct title="Qué tan grande se dibuja el juego antes de agrandarlo (100%: sin achicar, solo afila)">Resolución base <input type="range" min="0.5" max="1" step="0.01" data-set="fsrPct"><output></output></label>
         <label class="mdu-field" data-sharp>Nitidez del FSR <input type="range" min="0" max="1" step="0.05" data-set="sharp"><output></output></label>
         <div class="mdu-custom" data-custom hidden>
           <p class="mdu-small mdu-custom__note">Personalizada: cada efecto por separado.</p>
           <div class="mdu-custom__cols">
           <div class="mdu-custom__col">
           <p class="mdu-small mdu-custom__head">Mundo</p>
           <label class="mdu-field" title="Lo que no tiene ajuste propio">Detalle general <select data-gfx="base"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option><option value="epic">Épica</option></select></label>
           <label class="mdu-field" title="Normales, anti-repetición y detalle de cerca; en Ultra, paralaje">Relieve de paredes <select data-gfx="surf"><option value="low">Apagado</option><option value="medium">Normal</option><option value="high">Alto</option><option value="ultra">Con paralaje</option></select></label>
           <label class="mdu-field" title="Halos de las lámparas, polvo y haces de luz por las ventanas">Halos y haces <select data-gfx="amb"><option value="perf">Apagados</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option><option value="epic">Épica</option></select></label>
           <label class="mdu-field" title="La grilla de ondas y el reflejo como espejo">Agua <select data-gfx="water"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="ultra">Ultra</option><option value="epic">Épica</option></select></label>
           <label class="mdu-field" title="Las capas de niebla baja y las luciérnagas">Niebla baja <select data-gfx="night"><option value="perf">Apagada</option><option value="low">Liviana (2 capas)</option><option value="medium">Media (3 capas)</option><option value="high">Completa (4 capas)</option></select></label>
           <label class="mdu-field">Fuego del dragón <select data-gfx="fire"><option value="low">Liviano</option><option value="high">Completo</option></select></label>
           <label class="mdu-field" title="Se aplica al cargar el mapa">Pasto <select data-gfx="grass"><option value="perf">Liviano</option><option value="high">Tupido</option></select></label>
           </div>
           <div class="mdu-custom__col">
           <p class="mdu-small mdu-custom__head">Sombras</p>
           <label class="mdu-field">Sombras de la luna <select data-gfx="shadows"><option value="0">Apagadas</option><option value="1024">Bajas (1024)</option><option value="2048">Medias (2048)</option><option value="4096">Altas (4096)</option></select></label>
           <label class="mdu-field" title="La luna se recalcula cada cuadro: los zombies tiran sombra">Sombras vivas <input type="checkbox" data-gfx="live"></label>
           <label class="mdu-field">Sombras suaves <input type="range" min="1" max="3" step="0.5" data-gfx="soft"><output></output></label>
           <label class="mdu-field" title="Cuántos fuegos y faroles cercanos tiran sombra">Luces con sombra <input type="range" min="0" max="5" step="1" data-gfx="lamps"><output></output></label>
           <label class="mdu-field" title="Qué tan difuso es el borde de la sombra de fuegos y faroles">Sombras suaves de fuegos <input type="range" min="1" max="4" step="0.5" data-gfx="lampSoft"><output></output></label>
           </div>
           <div class="mdu-custom__col">
           <p class="mdu-small mdu-custom__head">Luz</p>
           <label class="mdu-field" title="Rincones y contactos más oscuros (GTAO)">Oclusión ambiental <select data-gfx="ao"><option value="0">Apagada</option><option value="8">Liviana</option><option value="12">Completa</option></select></label>
           <label class="mdu-field" title="Reflejos en pantalla: metal, azulejos, agua, piso mojado">Reflejos <input type="checkbox" data-gfx="light"></label>
           <label class="mdu-field" title="Los haces de la luna en la niebla">Haces de luna <input type="checkbox" data-gfx="vol"></label>
           <label class="mdu-field" title="La luz que rebota en paredes y pisos">Rebote de luz <input type="checkbox" data-gfx="bounce"></label>
           <label class="mdu-field" title="A qué resolución se calculan la oclusión, los reflejos y el rebote. Automática: completa con reflejos, a la mitad sin ellos">Resolución de la luz <select data-gfx="gres"><option value="0">Automática</option><option value="0.5">Mitad</option><option value="1">Completa</option></select></label>
           </div>
           <div class="mdu-custom__col">
           <p class="mdu-small mdu-custom__head">Imagen</p>
           <label class="mdu-field" title="Solo cambia en pantallas con zoom de Windows (125% o más)">Densidad de píxeles <select data-gfx="res"><option value="0.7">70%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
           <label class="mdu-field">Bordes <select data-gfx="aa"><option value="none">Ninguno</option><option value="fxaa">FXAA</option><option value="smaa">SMAA</option><option value="msaa">MSAA x4 + SMAA</option></select></label>
           <label class="mdu-field" title="Filtro temporal solo sobre el pasto de Mate no Numa (menos titileo al moverse)">Pasto sin titileo <input type="checkbox" data-gfx="taa"></label>
           <label class="mdu-field">Resplandor <input type="checkbox" data-gfx="bloom"></label>
           <label class="mdu-field" title="El grano de película encima de todo (100%: el de siempre)">Grano de película <input type="range" min="0" max="1.5" step="0.1" data-gfx="grain"><output></output></label>
           </div>
           </div>
           <p class="mdu-small mdu-custom__note">MSAA y pasto sin titileo solo se usan en Mate no Numa (en los demás mapas, SMAA).</p>
           <p class="mdu-small mdu-custom__note" data-custom-note></p>
         </div>
         <label class="mdu-field" data-vsync title="Ata los cuadros al refresco del monitor"><span data-vsync-txt>Vsync</span> <input type="checkbox" data-set="vsync"></label>
         <label class="mdu-field">Límite de FPS <select data-set="fpsCap"><option value="0">Sin límite</option><option value="60">60</option><option value="90">90</option><option value="120">120</option><option value="144">144</option><option value="165">165</option><option value="175">175</option></select></label>
         <label class="mdu-field">Mostrar FPS <input type="checkbox" data-set="showFps"></label>
         <label class="mdu-field">Menos destellos <input type="checkbox" data-set="calmFx"></label>
         <p class="mdu-small" data-gpu2></p>
       </div>
       <button class="mdu-btn" data-act="back">Volver</button>`,
    );
    this.screen(
      'pause',
      `<h2 class="mdu-h2">Pausa</h2>
       <p class="mdu-small mdu-pause-note" data-pause-note hidden></p>
       <div class="mdu-list">
         <button class="mdu-btn" data-act="resume">Continuar</button>
         <button class="mdu-btn" data-act="options">Opciones</button>
         <button class="mdu-btn" data-act="controls">Controles</button>
         <a class="mdu-btn" href="/assets/sotano/guia-easter-eggs.pdf" download="Mate der Untoten - Guia de los easter eggs.pdf" style="text-decoration:none">Guía de los easter eggs (PDF)</a>
         <button class="mdu-btn" data-act="restart">Fast restart</button>
         <button class="mdu-btn" data-act="toTitle">Volver al menú del juego</button>
         <button class="mdu-btn" data-act="leaveRoom" hidden>Salir de la sala</button>
         <button class="mdu-btn" data-act="exit">Salir a la tienda</button>
       </div>`,
    );
    this.screen(
      'over',
      `<h2 class="mdu-h2">Fin del juego</h2>
       <p class="mdu-survived" data-survived></p>
       <dl class="mdu-stats" data-stats></dl>
       <table class="mdu-board" data-board hidden></table>
       <p class="mdu-small mdu-pause-note" data-wait hidden></p>
       <div class="mdu-list">
         <button class="mdu-btn" data-act="restart">Fast restart</button>
         <button class="mdu-btn" data-act="endMenu" hidden>Volver al menú</button>
         <button class="mdu-btn" data-act="leaveRoom" hidden>Salir de la sala</button>
         <button class="mdu-btn" data-act="exit">Salir a la tienda</button>
       </div>`,
    );
    // (Alt+I) prueba de la música: cada escena, agrupada
    const groups = [...new Set(SCENES.map((x) => x.group))];
    this.screen(
      'music',
      `<h2 class="mdu-h2">Música: ir a cada escena</h2>
       <p class="mdu-small">Modo prueba (Alt+I). Arranca el mapa y salta directo a la escena donde suena cada canción.</p>
       ${groups
         .map(
           (gr) =>
             `<h3 class="mdu-small" style="margin:14px 0 6px;opacity:.8;letter-spacing:.08em;text-transform:uppercase">${esc(gr)}</h3><div class="mdu-list">${SCENES.filter((x) => x.group === gr)
               .map((x) => `<button class="mdu-btn" data-scene="${x.id}" title="${esc(TRACKS[x.track]?.name || '')}">${esc(x.name)}</button>`)
               .join('')}</div>`,
         )
         .join('')}
       <div class="mdu-list" style="margin-top:14px"><button class="mdu-btn" data-act="back">Volver</button></div>`,
    );
    this.screens.music.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scene]');
      if (!b) return;
      this.g.audio?.resume();
      this.g.devMusic(b.dataset.scene);
    });
    this.screens.controls.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bind]');
      if (b) this.listenBind(b.dataset.bind);
    });
    this.renderBinds();
    this.lobby = new Lobby(this.root, this.g, this);
    wireMapScreen(this.screens.maps, this.g);
    this.screens.online = this.lobby.el;
    // opciones en vivo
    const opt = this.screens.options;
    // las pestañas: generales, sonido y gráficos
    opt.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) this.optionsTab(t.dataset.tab);
    });
    opt.querySelectorAll('[data-set]').forEach((input) => {
      input.addEventListener('input', () => {
        const k = input.dataset.set;
        const v = input.type === 'checkbox' ? input.checked : input.tagName === 'SELECT' ? input.value : Number(input.value);
        this.g.setSetting(k, v);
        // (el vsync es de la versión de escritorio: lo toma al arrancar, desktop/main.cjs)
        if (k === 'vsync') window.__mduDesktop?.setVsync?.(v);
        // (la calidad y el escalado muestran u ocultan partes)
        if (k === 'quality' || k === 'upscale') this.syncOptions();
        else this.syncOutputs();
      });
    });
    // Personalizada: cada efecto por separado
    opt.querySelectorAll('[data-gfx]').forEach((input) => {
      input.addEventListener('input', () => {
        const k = input.dataset.gfx;
        const v = input.type === 'checkbox' ? input.checked : ['base', 'aa', 'surf', 'amb', 'water', 'night', 'fire', 'grass'].includes(k) ? input.value : Number(input.value);
        this.g.setSetting('gfx', { [k]: v });
        this.syncOptions();
      });
    });
  }

  // Opciones: muestra una pestaña (general, sound, gfx).
  optionsTab(id) {
    const opt = this.screens.options;
    opt.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.tab === id);
      b.setAttribute('aria-selected', String(b.dataset.tab === id));
    });
    opt.querySelectorAll('[data-pane]').forEach((p) => {
      p.hidden = p.dataset.pane !== id;
    });
  }

  // Teclas: una fila por acción con su tecla actual.
  renderBinds() {
    const s = this.screens.controls;
    s.querySelector('[data-binds]').innerHTML = ACTIONS.map(
      (a) => `<button class="mdu-bind" data-bind="${a.id}" aria-label="${a.label}: ${keyLabel(a.id)}. Cambiar">${keyLabel(a.id)}</button><span>${a.label}</span>`,
    ).join('');
    s.querySelector('[data-fixed]').innerHTML = FIXED.map(([k, v]) => `<kbd>${k.replace('{use}', keyLabel('use'))}</kbd><span>${v}</span>`).join('');
  }

  // Espera la próxima tecla (o botón del mouse) para esa acción.
  listenBind(id) {
    const input = this.g.input;
    if (!input) return;
    this.renderBinds();
    const b = this.screens.controls.querySelector(`[data-bind="${id}"]`);
    b.classList.add('is-listening');
    b.textContent = 'Apretá una tecla…';
    input.capture = (code) => {
      input.capture = null;
      if (code !== 'Escape' && !isReserved(code)) this.g.setSetting('binds', assign(id, code));
      this.renderBinds();
      this.screens.controls.querySelector(`[data-bind="${id}"]`)?.focus({ preventScroll: true });
    };
  }

  // Elegir mapa: en línea solo lo cambia el anfitrión (y se lo pasa a los demás).
  pickMap(id) {
    const g = this.g;
    if (g.net?.guest || g.state !== 'title') return;
    g.setMap(id);
  }

  // Elegir el modo del mapa (se rearma el mundo si cambia).
  pickMode(mode) {
    const g = this.g;
    if (g.net?.guest || g.state !== 'title') return;
    g.setMap(g.mapId, { mode });
  }

  // Marca el mapa elegido en todos los botones.
  syncMap() {
    const g = this.g;
    syncMapUI(this.root, g, this.screens.maps);
    this.lobby?.syncMap();
  }

  syncOptions() {
    const s = this.g.settings;
    const a = this.g.audio;
    const note = this.screens.options.querySelector('[data-voice-note]');
    if (note && a) {
      // la lista de voces del navegador (llega tarde en algunos)
      const sel = this.screens.options.querySelector('[data-set=voiceMode]');
      const list = a.voiceList || [];
      const key = list.map((x) => x.name).join('|');
      if (sel && sel.dataset.voices !== key) {
        sel.dataset.voices = key;
        sel.innerHTML = '';
        const add = (value, label) => {
          const o = document.createElement('option');
          o.value = value;
          o.textContent = label;
          sel.append(o);
        };
        add('auto', 'Automática');
        for (const x of list) add(`v:${x.name}`, x.name.replace(/Microsoft |Online |\(Natural\) ?/g, '').trim());
        add('murmur', 'Murmullos');
        add('off', 'Solo subtítulos');
      }
      const v = a.voiceFor?.('abuelo') || a.maleVoice || a.naturalVoice;
      const name = v?.name.replace(/Microsoft |Online |\(Natural\)| - .*/g, '').trim();
      note.textContent = !v
        ? 'Este navegador no trae voces en castellano: los personajes murmuran. En Edge o Chrome hablan.'
        : /natural|neural|online|google/i.test(v.name)
          ? `Voz: ${name}.`
          : `Voz: ${name}. En Edge o Chrome hay voces que suenan más naturales.`;
    }
    // el Mate Supremo: solo para el Caballero de la Luz (core/eggs)
    const sup = this.screens.options.querySelector('[data-supremo]');
    if (sup) sup.hidden = !isKnight();
    // el vsync: lo cambia la versión de escritorio (al arrancar); en la web lo
    // decide el navegador, así que se ve pero no se toca
    const vs = this.screens.options.querySelector('[data-vsync]');
    if (vs) {
      const app = !!window.__mduDesktop?.setVsync;
      vs.querySelector('[data-vsync-txt]').textContent = app ? 'Vsync (al reiniciar)' : 'Vsync (solo en la app)';
      vs.querySelector('input').disabled = !app;
      vs.classList.toggle('is-off', !app);
    }
    this.screens.options.querySelectorAll('[data-set]').forEach((input) => {
      const v = s[input.dataset.set];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v;
    });
    // calidad automática: muestra en cuál quedó
    const q = this.screens.options.querySelector('[data-set=quality]');
    if (q) {
      q.querySelector('option[value=auto]').textContent = `Automática (${QUALITY_LABEL[s.quality] || s.quality})`;
      if (s.qualityMode === 'auto') q.value = 'auto';
      if (s.qualityMode === 'custom') q.value = 'custom';
    }
    this.syncCustom();
    this.syncOutputs();
  }

  // Personalizada: los valores de cada efecto, qué se muestra y lo que no anda solo.
  syncCustom() {
    const s = this.g.settings;
    const opt = this.screens.options;
    const custom = s.qualityMode === 'custom';
    const box = opt.querySelector('[data-custom]');
    if (box) box.hidden = !custom;
    const sharp = opt.querySelector('[data-sharp]');
    if (sharp) sharp.hidden = (s.upscale || 'off') === 'off';
    const pct = opt.querySelector('[data-fsrpct]');
    if (pct) pct.hidden = s.upscale !== 'custom';
    const c = s.gfx;
    if (!custom || !c) return;
    // (lo que falta en una Personalizada vieja: lo de la base)
    // (y lo que se sumó después: haces con los reflejos, lo de siempre)
    const tierOf = { ...tiersOf(c.base), vol: !!c.light, gres: 0, lampSoft: 3, grain: 1 };
    opt.querySelectorAll('[data-gfx]').forEach((input) => {
      const v = c[input.dataset.gfx] ?? tierOf[input.dataset.gfx];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = String(v ?? '');
    });
    const needs = [];
    if (c.bounce && !c.ao && !c.light) needs.push('el rebote de la luz necesita la oclusión o los reflejos');
    if (c.taa && !c.ao && !c.light) needs.push('el suavizado temporal del pasto necesita la oclusión o los reflejos');
    const note = opt.querySelector('[data-custom-note]');
    if (note) note.textContent = needs.length ? `Ojo: ${needs.join('; ')}.` : '';
  }

  syncOutputs() {
    this.screens.options.querySelectorAll('input[type=range]').forEach((input) => {
      const out = input.nextElementSibling;
      if (input.dataset.gfx) {
        const k = input.dataset.gfx;
        out.textContent = k === 'lamps' ? String(Number(input.value)) : k === 'grain' ? `${Math.round(Number(input.value) * 100)}%` : `${Number(input.value).toFixed(1)}`;
        return;
      }
      const k = input.dataset.set;
      const v = Number(input.value);
      out.textContent = ['master', 'music', 'sfx', 'voice', 'volWeapons', 'volZombies', 'volWorld', 'volPlayer', 'volUi', 'reverb', 'shake', 'subSize', 'adsSens', 'sharp', 'fsrPct'].includes(k) ? `${Math.round(v * 100)}%` : k === 'fov' ? `${v}°` : v.toFixed(2);
    });
  }

  show(name) {
    // saliendo de controles sin elegir tecla: se cancela
    if (name !== 'controls' && this.g.input?.capture) {
      this.g.input.capture = null;
      this.renderBinds();
    }
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('is-on', k === name);
    this.current = name;
    // el grano CSS solo con un menú: jugando ya está el del PostFX, y animado
    // encima del canvas le hacía repintar toda la pantalla al navegador
    this.grain.hidden = !name;
    for (const f of this.showHooks) f(name);
    if (name === 'title') this.syncEggs();
    this.root.scrollTop = 0;
    this.root.scrollLeft = 0;
    if (name === 'options') this.syncOptions();
    if (name === 'controls') this.renderBinds();
    if (name) {
      const first = this.screens[name].querySelector('.mdu-btn:not([hidden])');
      first?.focus({ preventScroll: true });
    }
  }

  act(a) {
    const g = this.g;
    switch (a) {
      // Jugar: Solo o Con amigos (ui/PlayMenu)
      case 'play':
        this.prev = this.current === 'maps' ? this.mapsFrom || 'title' : this.current;
        this.syncMap();
        this.show('play');
        break;
      case 'solo':
        g.startGame();
        break;
      case 'controls':
      case 'options':
        this.prev = this.current;
        this.show(a);
        break;
      case 'online':
        this.prev = this.current;
        this.lobby.show();
        this.show('online');
        break;
      case 'back':
        this.show(this.prev || 'title');
        break;
      // elegir mapa: desde el título o desde la sala (ahí no se juega solo, se vuelve)
      case 'maps':
        this.mapsFrom = this.current;
        this.screens.maps.querySelector('[data-mapsplay]').hidden = this.mapsFrom !== 'title' && this.mapsFrom !== 'play';
        this.syncMap();
        this.show('maps');
        this.screens.maps.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
        break;
      case 'mapsBack':
        this.show(this.mapsFrom || 'title');
        break;
      case 'resume':
        g.resume();
        break;
      case 'resetSound':
        g.resetSound();
        this.syncOptions();
        break;
      case 'resetKeys':
        if (g.input) g.input.capture = null;
        g.setSetting('binds', {});
        this.renderBinds();
        break;
      case 'restart':
        g.restart();
        break;
      // (el final del easter egg: de vuelta al menú, en línea también cierra o deja la sala)
      case 'endMenu':
        g.toTitle();
        break;
      case 'leaveRoom':
        g.leaveRoom(g.net?.host ? 'Cerraste la sala.' : 'Saliste de la sala.');
        break;
      // (se pierde la partida: el primer clic pregunta)
      case 'toTitle': {
        const b = this.screens.pause.querySelector('[data-act="toTitle"]');
        if (!b.dataset.sure) {
          b.dataset.sure = '1';
          b.textContent = '¿Seguro? Se pierde la partida';
          break;
        }
        g.toTitle();
        break;
      }
      case 'exit':
        g.exit();
        break;
      // la versión original del juego, en su página (src/easter-egg-original):
      // recarga entera, así no se mezclan los estilos de los dos
      case 'original':
        window.location.assign(`${import.meta.env.BASE_URL}sotano-original`);
        break;
      default:
        this.acts[a]?.();
        break;
    }
  }

  // Los easter eggs completados y, con todos, el título de Caballero de la Luz
  // (el super easter egg, core/eggs.js).
  syncEggs() {
    const el = this.screens.title?.querySelector('[data-eggs]');
    if (!el) return;
    const n = eggsDone().length;
    el.innerHTML = isKnight()
      ? `<b style="color:#f2c94c;font-size:1.25em;text-shadow:0 0 12px rgba(255,200,80,.55)">✦ Caballero de la Luz ✦</b><br><span style="opacity:.8">Arrancás con el Porongo del Caballero${eggTest() ? ' · prueba (Alt+O)' : ''}</span>`
      : `Easter eggs completados: ${n} de ${eggsTotal()}`;
  }

  setTitleInfo({ gpu = {} }) {
    const t = this.screens.title;
    this.syncMap();
    this.syncEggs();
    t.querySelector('[data-best]').textContent = 'Viste lo que no deberías ver... ahora aguantá.';
    const name = esc(gpu.name || '');
    const shown = gpu.unknown ? `no se sabe, el navegador no la muestra${gpu.brave ? ' (en Brave la ves escribiendo brave://gpu en la barra)' : ''}` : name;
    let warn = '';
    if (gpu.software) {
      warn = `<div class="mdu-warn">El navegador está dibujando sin placa de video (${name}), así que el juego va a andar muy lento. Activá la aceleración por hardware (Configuración › Sistema › Usar aceleración de gráficos cuando esté disponible) y reiniciá el navegador. Si sigue igual, faltan los drivers de la placa de video: bajalos de la página de Intel, AMD o NVIDIA.</div>`;
    } else if (gpu.integrated) {
      warn = `<div class="mdu-warn">Parece que el navegador está usando la placa de video integrada (${name}). Si tenés una dedicada, en Windows: Configuración › Sistema › Pantalla › Gráficos › elegí tu navegador › Alto rendimiento, y reiniciá el navegador.</div>`;
    }
    t.querySelector('[data-gpu]').innerHTML = `${shown ? `<p class="mdu-small" style="margin-top:6px">Placa de video: ${shown}</p>` : ''}${warn}`;
    this.screens.options.querySelector('[data-gpu2]').textContent = shown ? `Placa de video en uso: ${gpu.unknown ? shown : gpu.name}` : '';
  }

  // Qué se puede hacer en la pausa según cómo se esté jugando.
  setPauseMode(mode) {
    const s = this.screens.pause;
    const note = s.querySelector('[data-pause-note]');
    const btn = (a) => s.querySelector(`[data-act="${a}"]`);
    const notes = {
      solo: '',
      host: 'La partida quedó en pausa para todos.',
      guest: 'La partida sigue corriendo: los zombies no esperan.',
      hostPaused: 'El anfitrión pausó la partida. Sigue cuando vuelva.',
    };
    s.querySelector('.mdu-h2').textContent = mode === 'guest' ? 'Menú' : 'Pausa';
    note.textContent = notes[mode] || '';
    note.hidden = !note.textContent;
    btn('resume').hidden = mode === 'hostPaused';
    btn('resume').textContent = mode === 'guest' ? 'Volver al juego' : 'Continuar';
    btn('restart').hidden = mode === 'guest' || mode === 'hostPaused';
    btn('restart').textContent = mode === 'host' ? 'Fast restart (todos)' : 'Fast restart';
    btn('leaveRoom').hidden = mode === 'solo';
    btn('leaveRoom').textContent = mode === 'host' ? 'Cerrar la sala' : 'Salir de la sala';
    // en línea "salir de la sala" ya vuelve al menú
    btn('toTitle').hidden = mode !== 'solo';
    btn('toTitle').textContent = 'Volver al menú del juego';
    delete btn('toTitle').dataset.sure;
  }

  // opts: { won, board (tabla del equipo), role: solo | host | guest, lost }
  gameOver(stats, best, { won = false, board = null, role = 'solo', lost = false } = {}) {
    const s = this.screens.over;
    const r = Math.max(1, stats.round);
    const team = role !== 'solo';
    s.querySelector('.mdu-h2').textContent = won ? '¡Victoria!' : lost ? 'Se cortó la conexión' : 'Fin del juego';
    s.querySelector('[data-survived]').textContent = won
      ? TEXT.won(team, r)
      : lost
        ? `El anfitrión salió de la partida. Llegaste a la ronda ${r}.`
        : `${team ? 'Sobrevivieron' : 'Sobreviviste'} ${r} ${r === 1 ? 'ronda' : 'rondas'}${r >= best && r > 1 ? ' · ¡nuevo récord!' : ''}`;
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);
    const rows = [
      ['Zombies liquidados', stats.kills],
      ['Tiros a la cabeza', stats.headshots],
      ['Con el facón', stats.knifeKills],
      ['Puntos ganados', stats.earned.toLocaleString('es-AR')],
      ['Tiempo', `${mins}:${String(secs).padStart(2, '0')}`],
      [TEXT.egg, stats.easterEgg ? 'Completada' : 'Pendiente'],
    ];
    // con este, los seis: el super easter egg
    if (stats.knight) rows.push(['<b style="color:#f2c94c">✦ Caballero de la Luz ✦</b>', 'Completaste los seis: el Porongo del Caballero, 100 pesos y el Mate Supremo en la caja']);
    s.querySelector('[data-stats]').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    // tabla del equipo
    const table = s.querySelector('[data-board]');
    table.hidden = !board || board.length < 2;
    if (!table.hidden) {
      // puntos: los que ganó cada uno en toda la partida
      table.innerHTML = `<thead><tr><th>Matero</th><th>Puntos</th><th>Bajas</th><th>Cabezas</th><th>Caídas</th><th>Levantó</th></tr></thead><tbody>${board
        .map((b) => `<tr><td>${esc(b.name)}</td><td>${(b.earned | 0).toLocaleString('es-AR')}</td><td>${b.kills}</td><td>${b.heads}</td><td>${b.downs}</td><td>${b.revives}</td></tr>`)
        .join('')}</tbody>`;
      const myId = this.g.net?.id;
      table.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-me', board[i].id === myId));
    }
    // botones: en línea solo el anfitrión arma otra partida (para todos)
    const btn = (a) => s.querySelector(`[data-act="${a}"]`);
    const wait = s.querySelector('[data-wait]');
    // (con el easter egg terminado no hay fast restart: se vuelve al menú;
    // el fast restart queda para cuando te matan)
    btn('restart').hidden = won || role === 'guest' || lost;
    btn('restart').textContent = role === 'host' ? 'Fast restart (todos)' : 'Fast restart';
    btn('endMenu').hidden = !won;
    btn('leaveRoom').hidden = role === 'solo' || won;
    btn('leaveRoom').textContent = role === 'host' ? 'Cerrar la sala' : lost ? 'Volver al título' : 'Salir de la sala';
    wait.hidden = role !== 'guest' || lost || won;
    wait.textContent = 'Esperando que el anfitrión arme otra partida…';
    // la experiencia de la partida (ui/Levels)
    this.g.levels?.summary(s);
    // el castillo (el final del juego): su amanecer y sus animaciones (ui/overCastle.js)
    decorateOver(this.g, s, { won });
    this.show('over');
  }

  // Invitado mirando el final: el anfitrión cerró la sala.
  hostGone() {
    const s = this.screens.over;
    const wait = s.querySelector('[data-wait]');
    wait.hidden = false;
    wait.textContent = 'El anfitrión cerró la sala.';
    s.querySelector('[data-act="leaveRoom"]').textContent = 'Volver al título';
  }

  showClick(on) {
    this.click.classList.toggle('is-on', on);
  }
}
