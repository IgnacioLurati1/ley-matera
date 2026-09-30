import * as THREE from 'three';
import { EE } from '../config/map';
import { setSleeveColor } from '../weapons/viewmodels';
import { isHost, announce, glow } from './castle/common';
import Saber from './esteros/Saber';
import Poder from './esteros/Poder';
import Ofrenda from './esteros/Ofrenda';
import EsterosEnding from '../ui/EsterosEnding';
import LuisonArrival, { prefetchSong } from '../ui/LuisonArrival';
import SongEgg from '../world/SongEgg';
import { TRACKS, LUISON_FROM } from '../core/music';
import { LUISON_PREP } from '../core/audio';

// Lo que suena antes que llegue el Luisón, en segundos de canción desde que
// arranca (LUISON_FROM) hasta el golpe en que aparece: [cuándo, cuál lobo
// (audio.wolves; -1: el aullido del Luisón, con su resuello), paneo].
const HOWL_CUES = [
  [0.2, 0, -0.55],
  [2.6, 1, 0.6],
  [4.4, 2, -0.2],
  [6.5, 3, 0.35],
  [TRACKS['jefe-esteros'].boom - LUISON_FROM - LUISON_PREP, -1, 0],
];

// Easter egg de "Mate no Numa": "El Pacto". La voz le habla solo a Gil y le
// pide información y poder para enfrentar "los males del mundo" (nunca dice
// cuáles). Los pasos:
//  0. La voz llama a Gil desde el Algarrobo de los Colgados (solo él la oye).
//  1. El saber: el códice de los padres, los papeles del coronel y las plumas
//     de los urutaú, al hueco del algarrobo (esteros/Saber.js).
//  2. El Liquidificador: la pava de la laguna, brasas, agua de luna y el altar
//     de la iglesia con encierro (esteros/Poder.js).
//  3. La creciente: la voz sube el agua y hay que hervirla (almas).
//  4. La luz de los ahogados: solo Gil la lleva al algarrobo (esteros/Ofrenda.js).
//  5. El Luisón.
//  6. El final: Gil decide (ui/EsterosEnding.js).
//
// Los personajes: los jugadores no son los de siempre. Uno es Antonio Gil (el
// Gauchito, de colorado) y los demás sus compañeros: Anacleto, Cirilo,
// Benito (y Nicasio, si son cinco). Solo, sos Gil. En cooperativo el
// anfitrión sortea quién es Gil al empezar y se lo avisa a todos.
// En línea lo lleva el anfitrión: el estado entero viaja en cada cambio
// (netSync) y los invitados avisan con 'pee'.

export const CAST = {
  gil: { name: 'Antonio Gil', sub: 'el Gauchito', color: 0xb01c14 },
  anacleto: { name: 'Anacleto', sub: 'compañero de Gil', color: 0x3a6a2a },
  cirilo: { name: 'Cirilo', sub: 'compañero de Gil', color: 0x2a3a7a },
  benito: { name: 'Benito', sub: 'compañero de Gil', color: 0x7a5a2a },
  nicasio: { name: 'Nicasio', sub: 'compañero de Gil', color: 0x5a2a6a },
};
const MATES = ['anacleto', 'cirilo', 'benito', 'nicasio'];
// cuánto se lo ve caer al Luisón antes del final (con destello blanco al caer
// y al entrar la escena, como en los otros mapas: saltaba directo al final)
const ENDING_WAIT = 3.8;
const STEPS = ['La voz', 'El saber', 'El Liquidificador', 'La creciente', 'La ofrenda', 'El Luisón'];

// Lo que dice la voz (solo lo oye Gil). Nunca dice quién es ni cuál es "el mal".
const VOZ = {
  llamado: ['Antonio...', 'Antonio Gil. Vení al algarrobo. Sé lo que buscás.', 'Los colgados del algarrobo te esperan, Antonio. Yo también.', 'No les digas nada a los otros. Vení solo... o con ellos, da igual. Pero vení.'],
  pacto: [
    'Antonio Mamerto Gil Núñez. Desertor. Santo de los pobres, dicen. Yo digo: un hombre cansado.',
    'Hay males en este mundo que tu facón no alcanza. Males viejos, que vienen por todos.',
    'Yo puedo darte con qué enfrentarlos. Pero primero necesito saber. Y después, poder.',
    'Traeme lo que saben los muertos de este estero: el libro de los padres de la reducción, los papeles del coronel que te persigue...',
    '...y las plumas de los urutaú, que lloran los nombres de los muertos. Dejalo todo en el hueco de este árbol.',
  ],
  codice: ['Los padres sabían más de lo que rezaban. Bien.'],
  papeles: ['El coronel tiene nombres. Muchos nombres. Me sirven todos.'],
  plumas: ['El urutaú no miente. Ahora sé quiénes murieron acá... y quiénes van a morir.'],
  poder: [
    'Ya sé lo que necesitaba saber. Ahora, el poder.',
    'En el fondo de la laguna duerme una pava que no es de este mundo. Calentala con brasas de quebracho y llenala con agua de luna.',
    'Después, al altar de los padres. Que hierva donde ellos rezaban.',
  ],
  hervir: ['Eso que tienen en la mano hierve lo que toca. Cuando el agua suba... hiérvanla. Que los ahogados me alimenten.', 'La próxima noche el agua va a subir. De eso me encargo yo.'],
  creciente: ['Ahí está el agua, Antonio. Hiervan. Todo.'],
  otra: ['No alcanzó. El agua va a volver a subir. Y ustedes van a volver a hervirla.'],
  orbe: ['Suficiente. En la laguna late lo que juntaron. Traémelo, Antonio. Solo vos podés tocarlo.'],
  luison: ['Sí... Ahora queda una sola cosa. Algo viene a cobrarse lo tuyo. El séptimo hijo.', 'Matalo, y sos mío. Quiero decir... y el poder es tuyo.'],
  hoja: ['...'],
};
// Lo que ven los demás mientras la voz le habla a Gil.
const OTHERS = {
  llamado: 'Gil se da vuelta de golpe, como si alguien lo hubiera llamado.',
  pacto: 'Gil se quedó parado frente al algarrobo, hablando solo en voz baja.',
  poder: 'Gil vuelve del algarrobo pálido. Dice que hay una pava en el fondo de la laguna.',
  hervir: 'Gil dice que esta noche el agua va a subir. No explica cómo lo sabe.',
  orbe: 'Gil mira la laguna. Algo brilla en el medio.',
  luison: 'Gil retrocede del algarrobo. Del oeste viene un aullido.',
};

export default class EsterosEgg {
  constructor(game) {
    this.g = game;
    this.scene = null;
    this.step = 0;
    this.papDone = true;
    // id del jugador que es Gil (null hasta el sorteo) y el personaje de cada uno
    this.gil = null;
    this.roles = new Map();
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.callT = 50;
    this.floodNow = false;
    // la luz del fogón del campamento (con la creciente se apaga)
    this.fireLight = game.world.lights?.find((e) => e.def.kind === 'fire') || null;
    this.saber = new Saber(this);
    this.poder = new Poder(this);
    this.ofrenda = new Ofrenda(this);
    // easter egg musical: tres verduleras (world/SongEgg.js)
    this.song = new SongEgg(game, 'esteros');
    this.buildHueco();
    // (el cartel de qué hacer ya no se muestra: el usuario lo sacó el
    // 2026-09-26; la guía de cada mapa va aparte, en PDF)
    // atajos de prueba (solo): Alt+U un paso más del pacto (era Alt+J, que es
    // saltear la ronda en Game: cinco saltos de ronda llamaban al Luisón)
    this.onKey = (e) => {
      if (!import.meta.env.DEV || !e.altKey || game.state !== 'playing' || game.net || e.code !== 'KeyU') return;
      e.preventDefault();
      this.debugStep(this.step + 1);
    };
    window.addEventListener('keydown', this.onKey);
  }

  myId() {
    return this.g.net ? this.g.net.id : 0;
  }

  players() {
    return this.g.net ? this.g.net.net.count : 1;
  }

  // Los ids de todos los jugadores de la partida (el propio primero).
  ids() {
    const me = this.myId();
    const others = this.g.net ? [...this.g.net.remote.keys()].filter((id) => id !== me) : [];
    return [me, ...others.sort((a, b) => a - b)];
  }

  isGil(id = this.myId()) {
    return this.gil === id;
  }

  roleOf(id = this.myId()) {
    return this.roles.get(id) || null;
  }

  announce(text, secs = 3, sting = false) {
    announce(this.g, text, secs, sting);
  }

  // ---------------- los personajes ----------------
  // El anfitrión sortea a Gil (solo: siempre vos) y reparte los compañeros.
  castRoles() {
    const ids = this.ids();
    const gil = this.g.net ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
    const roles = [];
    let k = 0;
    for (const id of ids) roles.push([id, id === gil ? 'gil' : MATES[k++ % MATES.length]]);
    this.setRoles(roles, true);
  }

  // El anfitrión cuida el reparto: el que entra tarde es un compañero libre y,
  // si Gil se va de la partida, el sorteo pasa a otro.
  keepRoles() {
    const ids = this.ids();
    const now = [...this.roles].filter(([id]) => ids.includes(id));
    let changed = now.length !== this.roles.size;
    if (!now.some(([, r]) => r === 'gil') && now.length) {
      const pick = now[Math.floor(Math.random() * now.length)];
      pick[1] = 'gil';
      changed = true;
      this.announce('Gil se fue del estero... ahora la voz le habla a otro.', 4);
    }
    for (const id of ids) {
      if (now.some(([x]) => x === id)) continue;
      const used = new Set(now.map(([, r]) => r));
      now.push([id, MATES.find((m) => !used.has(m)) || 'nicasio']);
      changed = true;
    }
    if (changed) this.setRoles(now, true);
  }

  setRoles(roles, send = false) {
    const g = this.g;
    const before = this.roleOf();
    this.roles = new Map(roles);
    this.gil = roles.find(([, r]) => r === 'gil')?.[0] ?? null;
    if (send) g.net?.event('ee', { roles });
    this.paintRoles();
    const mine = CAST[this.roleOf()];
    setSleeveColor(mine?.color ?? null);
    if (!mine || before === this.roleOf()) return;
    g.hud.toast(`Sos ${mine.name}, ${mine.sub}`);
    g.hud.subtitle(this.isGil() ? 'Tus compañeros te siguen hasta el fin del estero. Pero esta noche... alguien más te busca a vos.' : 'Seguís a Gil desde la guerra. Esta noche el estero está raro.', 5);
  }

  // Cada uno con su poncho (también los que entraron después del reparto).
  paintRoles() {
    const av = this.g.net?.avatars;
    if (!av) return;
    for (const [id, role] of this.roles) av.restyle(id, CAST[role].color);
    this.painted = av.list.size;
  }

  // ---------------- la voz ----------------
  // (anfitrión) La voz dice algo: solo lo oye Gil; los demás ven lo que hace Gil.
  voice(key) {
    if (!isHost(this.g)) return;
    this.g.net?.event('ee', { vz: key });
    this.playVoice(key);
  }

  // Un aviso solo para Gil, sin la voz (lo que él sabe y los otros no).
  whisperGil(key) {
    if (!isHost(this.g)) return;
    this.g.net?.event('ee', { wg: key });
    this.playWhisper(key);
  }

  playVoice(key, pick = -1) {
    const g = this.g;
    const list = VOZ[key];
    if (!list) return;
    if (!this.isGil()) {
      if (OTHERS[key]) g.hud.subtitle(OTHERS[key], 4.5);
      return;
    }
    // el llamado: una sola línea (la que toque); lo demás, todo seguido
    const lines = key === 'llamado' ? [list[pick >= 0 ? pick : Math.floor(Math.random() * list.length)]] : list;
    let t = 0;
    for (const text of lines) {
      const say = () => g.say('entidad', text, 'entidad', { local: true });
      if (t) g.later(t, say);
      else say();
      t += Math.max(2.8, text.length * 0.068 + 0.8);
    }
  }

  playWhisper(key) {
    if (!this.isGil()) return;
    if (key === 'hoja') this.g.hud.subtitle('(Nadie mira. Podrías arrancarle una hoja al códice antes de dárselo a la voz...)', 5);
  }

  // ---------------- el hueco del algarrobo ----------------
  buildHueco() {
    const g = this.g;
    const [x, z] = EE.hueco;
    const y = g.world.floorAt(x, z);
    // el hueco, en la cara oeste del tronco (el tronco está en 12.6, 10.4)
    this.huecoPos = new THREE.Vector3(x + 0.35, y + 1.25, z);
    const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x030504 }));
    hole.scale.set(0.16, 0.46, 0.26);
    hole.position.set(x + 0.47, y + 1.25, z);
    this.root.add(hole);
    // un brillo frío adentro del hueco (lo ve cualquiera: es el árbol, no la voz)
    this.huecoGlow = glow(g.textures, 0x9ad8c8, 0.9, 0.3);
    this.huecoGlow.position.copy(this.huecoPos).setX(x + 0.28);
    this.root.add(this.huecoGlow);
    // la luz fría del hueco en el final (ui/EsterosEnding.js): existe desde el
    // principio, apagada. Sumarla al matar al Luisón cambiaba la cantidad de
    // luces y se recompilaban todos los shaders (4 s de cuadro trabado).
    this.cineLight = new THREE.PointLight(0x9ad8c8, 0, 9, 1.6);
    this.cineLight.position.copy(this.huecoPos);
    this.root.add(this.cineLight);
    g.interact.add({
      kind: 'ee',
      pos: this.huecoPos.clone(),
      radius: 2.4,
      prompt: () => this.huecoPrompt(),
      cost: () => 0,
      use: () => this.huecoUse(g.net?.useFrom ?? this.myId()),
    });
  }

  huecoPrompt() {
    if (this.scene) return null;
    const gil = this.isGil();
    const info = (text) => ({ text, noCost: true, info: true });
    if (this.step === 0) return gil ? { text: 'escuchar al algarrobo', noCost: true } : info('Un algarrobo viejo. Todavía cuelgan las sogas.');
    if (this.step === 1) {
      const held = this.saber.held();
      if (held.length) return { text: `dejar en el hueco: ${held.map((k) => ({ codice: 'el códice', papeles: 'los papeles', plumas: 'las plumas' })[k]).join(', ')}`, noCost: true };
      return info(gil ? 'La voz espera lo que saben los muertos del estero' : 'Gil dice que el árbol espera algo');
    }
    if (this.step === 4 && this.ofrenda.orb === 'carried') return gil && this.ofrenda.carrier === this.myId() ? { text: 'darle la luz a la voz', noCost: true, hold: true } : info('Gil tiene que dejar la luz');
    return null;
  }

  // (anfitrión; el invitado llega por requestUse)
  huecoUse(from) {
    const g = this.g;
    if (!isHost(g) || this.scene) return false;
    if (this.step === 0) {
      if (!this.isGil(from)) return false;
      this.step = 1;
      this.voice('pacto');
      this.netSync();
      return true;
    }
    if (this.step === 1) {
      const held = this.saber.held();
      if (!held.length) return false;
      this.saber.give(held);
      g.fx.sparkle(this.huecoPos, [0.6, 0.85, 0.8], 24, 1);
      if (this.saber.done()) {
        this.step = 2;
        this.voice('poder');
        this.announce('El saber está en el hueco. Ahora la voz pide poder: una pava en el fondo de la Laguna del Irupé.', 5, true);
      } else for (const k of held) this.voice(k);
      this.netSync();
      return true;
    }
    if (this.step === 4 && this.ofrenda.orb === 'carried' && this.ofrenda.carrier === from) {
      this.ofrenda.give();
      this.startLuison();
      return true;
    }
    return false;
  }

  // ---------------- los pasos ----------------
  // (anfitrión) El Liquidificador está listo: la creciente.
  onLiquid() {
    this.step = 3;
    this.voice('hervir');
    this.netSync();
  }

  // (anfitrión) Rounds pregunta si la ronda que viene es de creciente.
  takeFlood() {
    return isHost(this.g) && this.poder.wantFlood();
  }

  // La creciente empieza o termina (Rounds, en todas las compus).
  onFlood(on) {
    this.floodNow = on;
    if (!isHost(this.g) || this.step !== 3) return;
    if (on) {
      this.voice('creciente');
      this.announce('¡El agua sube! Hiérvanla con los Liquidificadores: cada muerto cocinado es un alma.', 6, true);
    } else if (this.poder.souls < this.poder.need()) {
      this.voice('otra');
      this.announce(`El agua bajó con ${this.poder.souls} de ${this.poder.need()} almas. La voz la va a subir otra vez.`, 5);
    }
  }

  // (anfitrión) Se juntaron las almas.
  onSouls() {
    this.step = 4;
    this.ofrenda.ready();
    this.voice('orbe');
    this.announce('Las almas se juntaron en una luz, en medio de la Laguna del Irupé. Solo Gil puede llevarla.', 5, true);
    this.netSync();
  }

  // (anfitrión) La pelea final: desde que la luz entra en el hueco hasta que
  // cae el Luisón, Rounds no pasa de ronda y los muertos no se acaban. Si el
  // Luisón ya salió y no está (algo lo sacó), vuelven las rondas de siempre.
  // Con la creciente el agua tapa el fogón: sin llamas (Game), sin luz ni crepitar.
  get fireOut() {
    return !!this.g.rounds?.flood;
  }

  get holding() {
    if (this.step !== 5) return false;
    // (cayó el Luisón y viene el final: la ronda queda quieta)
    if (this.endAt != null) return true;
    if (!this.ofrenda.luison) return true;
    const b = this.g.zombies.boss;
    return !!b && b.kind === 'luison' && !b.dead;
  }

  // (anfitrión) Se murió un jefe (Zombies.kill).
  onBossDeath(pos, z) {
    if (!isHost(this.g)) return;
    if (this.step === 1) this.saber.onBossDeath(pos, z);
    if (this.step === 5 && z?.kind === 'luison') this.luisonDown();
  }

  // (anfitrión) Cayó el Luisón: se lo ve caer un rato (los muertos que quedan
  // se deshacen y no salen más) y después el final (update: endAt).
  luisonDown() {
    const g = this.g;
    if (this.endAt != null || this.step >= 6) return;
    this.endAt = g.time + ENDING_WAIT;
    for (const z of g.zombies.pool) if (z.active && !z.dead) g.zombies.kill(z, { type: 'nuke', noPoints: true });
    if (g.rounds) g.rounds.spawnT = ENDING_WAIT + 2;
    g.net?.event('ee', { down: 1 });
    this.downFx();
  }

  // El destello blanco de cuando cae (anfitrión e invitado).
  downFx() {
    const g = this.g;
    g.hud.setBossBar(null);
    g.post?.flash(1.2);
  }

  // ---------------- el final ----------------
  // (anfitrión) La luz entró en el hueco: arranca la canción de la pelea y
  // con ella la llegada del Luisón (ui/LuisonArrival: la horda en el
  // algarrobo y él, detrás del tronco, cuando la canción grita). Para todos.
  startLuison() {
    this.step = 5;
    this.calmFlood();
    this.netSync();
    this.g.net?.event('ee', { cine: 'llegada' });
    this.playArrival();
  }

  // La escena ya armada (y compilada) desde que la luz está en la laguna: al
  // dar la luz no se traba nada (el usuario, 2026-09-29).
  prepArrival() {
    if (this.arrival || this.step >= 6 || this.arrivalSeen) return;
    prefetchSong();
    try {
      this.arrival = new LuisonArrival(this.g, this);
    } catch (err) {
      console.error(err);
      this.arrival = null;
    }
  }

  playArrival() {
    const g = this.g;
    if (this.scene || this.arrivalSeen) return;
    this.prepArrival();
    const cine = this.arrival;
    this.arrival = null;
    if (!cine) {
      // (sin escena: como antes, el Luisón llega con el golpe de la canción)
      this.luisonWait = g.time;
      return;
    }
    this.arrivalSeen = true;
    this.scene = { update: (dt) => cine.update(dt), cine };
    cine.play(() => {
      this.scene = null;
      this.arrivalDone(cine);
    });
  }

  // Terminó la llegada (en cada compu): cada uno queda en el lugar de su
  // personaje y el anfitrión suelta al Luisón de verdad donde quedó.
  arrivalDone(cine) {
    const g = this.g;
    cine.placePlayer();
    // (ya aulló en la escena: no lo repite al aparecer)
    this.howlPre = g.time;
    this.howlCue = HOWL_CUES.length;
    if (isHost(g) && this.step === 5) this.ofrenda.callLuison({ at: cine.luAt.clone(), yaw: cine.luisonYaw, quiet: true, hold: 2.5 });
  }

  // En la pelea del Luisón no se pasa de ronda: si lo llaman en plena
  // creciente, el agua baja sola (si no, quedaba arriba toda la pelea). En el
  // anfitrión al llamarlo y en el invitado cuando le llega el paso 5; y
  // mientras dure no viene otra (Rounds.nextRound mira holding).
  calmFlood() {
    const R = this.g.rounds;
    if (!R?.flood) return;
    R.flood = false;
    R.floodEnd();
  }

  // La canción de la pelea del Luisón (core/music.js). Con el Luisón por
  // llegar arranca pasada su intro larga y él aparece (lo llama el anfitrión)
  // en el golpe; si ya está (los atajos de prueba), arranca desde el golpe.
  luisonMusic() {
    const g = this.g;
    const M = g.music;
    if (this.step !== 5) {
      this.luisonSong = false;
      return;
    }
    // (la llegada pone la canción ella misma y sigue en la pelea)
    if (this.scene) return;
    if (!this.luisonSong && M) {
      this.luisonSong = true;
      const b = g.zombies.boss;
      const there = !!b && b.kind === 'luison' && !b.dead;
      M.play('jefe-esteros', { at: there ? TRACKS['jefe-esteros'].boom : LUISON_FROM, loop: true, while: () => this.step === 5 && !this.scene && (g.state === 'playing' || g.state === 'paused') });
      // (si ya está, la canción arranca en el golpe: ni lobos ni aullido de llegada)
      this.howlCue = there ? HOWL_CUES.length : 0;
      this.howlPre = null;
    }
    // mientras llega (con la canción, en el anfitrión y en el invitado): los
    // lobos del monte aúllan a lo lejos, encimados, y el último antes que él;
    // su propio aullido arranca desde donde sale, con el resuello, para que
    // aúlle justo en el golpe (Zombies.spawnBoss ya no lo repite)
    if (M?.is('jefe-esteros') && this.howlCue < HOWL_CUES.length) {
      const k = M.time() - LUISON_FROM;
      const [at, i, pan] = HOWL_CUES[this.howlCue];
      if (k >= at) {
        this.howlCue++;
        // (un cuadro largo no se come un lobo; el aullido, en cambio, solo si
        // llega antes que él: si no, lo pone Zombies.spawnBoss al aparecer)
        if (k < at + (i < 0 ? 0.5 : 2)) {
          if (i < 0) {
            const [x, z] = EE.luison;
            this.howlPre = g.time;
            g.audio.luisonHowl?.(new THREE.Vector3(x, g.world.floorAt(x, z) + 3, z), { prep: true });
          } else g.audio.wolves?.(i, { pan });
        }
      }
    }
    // (anfitrión) llega con el golpe; sin canción, a los 4 segundos como antes
    if (this.luisonWait != null) {
      const waited = g.time - this.luisonWait;
      const song = !!M?.is('jefe-esteros');
      if (song ? M.time() >= TRACKS['jefe-esteros'].boom - 0.05 || waited > 20 : waited >= 4) {
        this.luisonWait = null;
        this.ofrenda.callLuison();
      }
    }
  }

  // (anfitrión) Cayó el Luisón: la escena del final, para todos.
  startEnding() {
    const g = this.g;
    if (this.step >= 6) return;
    this.endAt = null;
    this.step = 6;
    this.netSync();
    g.net?.event('ee', { cine: 'final', hoja: this.saber.hoja ? 1 : 0 });
    this.playEnding(this.saber.hoja);
  }

  playEnding(hoja) {
    const g = this.g;
    if (this.scene) return;
    // (entra con un destello blanco: tapa el corte de la pelea a la escena)
    g.post?.flash(1.3);
    // (los compañeros de la escena: siempre tres, con el nombre de cada uno)
    const cine = new EsterosEnding(g, this, { hoja });
    this.scene = { update: (dt) => cine.update(dt), cine };
    cine.play((choice) => {
      this.scene = null;
      g.stats.easterEgg = true;
      g.stats.ending = choice;
      if (isHost(g)) g.win();
    });
  }

  // Gil eligió (en su compu); el anfitrión lo reparte.
  choose(choice) {
    const g = this.g;
    if (!isHost(g)) {
      g.net.net.send({ t: 'pee', a: 'fin', c: choice });
      return;
    }
    g.net?.event('ee', { fin: choice });
    this.scene?.cine.choose(choice);
  }

  // ---------------- el cartel ----------------
  buildObjective() {
    const el = document.createElement('div');
    el.className = 'mdu-obj';
    el.hidden = true;
    this.g.hud.root.appendChild(el);
    this.objEl = el;
    this.objKey = '';
  }

  objective() {
    const gil = this.isGil();
    if (this.step === 0) {
      if (this.callT > 40 && this.g.rounds.round < 2) return null;
      return gil ? { main: 'Una voz te llama', sub: 'Desde el Algarrobo de los Colgados, pasando el Obraje hacia el oeste' } : { main: 'Gil anda raro', sub: 'Dice que alguien lo llama desde el Algarrobo de los Colgados, pasando el Obraje' };
    }
    if (this.step === 1) {
      const list = this.saber.lines();
      return { main: 'El saber', sub: gil ? 'Lo que saben los muertos del estero, al hueco del algarrobo' : 'Gil dice que el árbol pide esto (al hueco del algarrobo)', count: `${list.filter((l) => l[2]).length}/3`, list };
    }
    if (this.step === 2) return this.poder.line();
    if (this.step === 3) {
      const P = this.poder;
      return {
        main: 'Hervir la creciente',
        sub: this.floodNow ? 'Hiervan el agua con el Liquidificador: cada muerto cocinado es un alma' : 'La voz va a hacer subir el agua en la próxima ronda. Cada uno con su Liquidificador (del altar de la iglesia)',
        count: `${P.souls}/${P.need()}`,
      };
    }
    if (this.step === 4) return this.ofrenda.line();
    if (this.step === 5) return { main: 'El Luisón', sub: 'El séptimo hijo vino a cobrarse lo de Gil, en el algarrobo' };
    return null;
  }

  setObjective(o) {
    if (!this.objEl) return;
    const stage = Math.min(this.step, STEPS.length);
    const key = o ? `${stage}|${JSON.stringify(o)}` : '';
    if (key === this.objKey) return;
    this.objKey = key;
    this.objEl.hidden = !o;
    if (!o) {
      this.objEl.innerHTML = '';
      return;
    }
    const pips = STEPS.map((_, i) => `<i class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}"></i>`).join('');
    const list = o.list ? `<ul>${o.list.map(([name, where, done]) => `<li class="${done ? 'is-done' : ''}">${name}${where ? ` <span>· ${where}</span>` : ''}</li>`).join('')}</ul>` : '';
    this.objEl.innerHTML =
      `<header><span>El Pacto</span><em class="mdu-obj__pips">${pips}</em></header>` +
      `<p>${o.main}</p>${o.sub ? `<small>${o.sub}</small>` : ''}${o.count ? `<b class="mdu-obj__count">${o.count}</b>` : ''}${list}`;
  }

  // ---------------- ganchos del juego ----------------
  onKill() {}

  // (Game.activateZone avisa cada zona que se abre)
  onZone() {}

  onShot(o, d, maxT) {
    this.saber.onShot(o, d, maxT);
  }

  onExplosion() {}

  onPower() {}

  // El agua empezó a hervir (fx del Liquidificador, anfitrión).
  onBoil() {}

  // (anfitrión) Un muerto se cocinó en el agua hirviendo.
  onBoilKill(z, pos) {
    if (isHost(this.g)) this.poder.onBoilKill(pos || z.pos);
  }

  // La cámara de la escena en curso (el final).
  sceneCam(dt) {
    return this.scene ? this.scene.update(dt) : false;
  }

  startPapRitual() {}

  dropHat() {}

  dropCalabaza() {}

  // ---------------- red ----------------
  netSync() {
    const g = this.g;
    if (!g.net?.host) return;
    g.net.event('ee', this.fullState());
  }

  fullState() {
    return { s: this.step, roles: [...this.roles], sb: this.saber.state(), pd: this.poder.state(), of: this.ofrenda.state() };
  }

  applyRemote(m) {
    if (m.song) return this.song.applyRemote(m.song);
    if (m.vz) return this.playVoice(m.vz);
    if (m.wg) return this.playWhisper(m.wg);
    if (m.wi) return this.poder.apply(m);
    if (m.down) return this.downFx();
    if (m.cine === 'final') return this.playEnding(!!m.hoja);
    if (m.cine === 'llegada') return this.playArrival();
    if (m.arrSkip) return this.scene?.cine?.skip?.(true);
    if (m.fin) return this.scene?.cine.choose(m.fin);
    if (m.s != null) this.step = m.s;
    if (this.step === 5) this.calmFlood();
    if (m.roles) this.setRoles(m.roles);
    if (m.sb) this.saber.apply(m.sb);
    if (m.pd) this.poder.apply(m.pd);
    if (m.of) this.ofrenda.apply(m.of);
  }

  // Lo que manda un invitado.
  onGuest(m, from) {
    if (m.a === 'uru' || m.a === 'hoja') this.saber.onGuest(m, from);
    else if (m.a === 'fin' && this.isGil(from) && this.scene) this.choose(m.c);
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    this.saber.update(dt);
    this.poder.update(dt);
    this.ofrenda.update(dt);
    this.song.update(dt);
    // la llegada del Luisón, armada de antes (con la luz ya en la laguna)
    if (this.step === 4 && !this.arrival && !this.scene) this.prepArrival();
    this.luisonMusic();
    // (anfitrión) se lo vio caer: el final
    if (this.endAt != null && g.time >= this.endAt) this.startEnding();
    // el hueco late (más fuerte mientras la voz espera algo)
    const t = g.time;
    this.huecoGlow.material.opacity = (this.step >= 1 && this.step <= 4 ? 0.35 : 0.15) + Math.sin(t * 1.3) * 0.1;
    this.setObjective(this.scene || g.state !== 'playing' ? null : this.objective());
    const out = this.fireOut;
    if (this.fireLight) this.fireLight.target = out ? 0 : this.fireLight.base;
    g.audio?.fireOn?.(!out);
    if (g.state !== 'playing' || g.intro?.active) return;
    // el sorteo: apenas arranca la partida (el invitado espera el del anfitrión)
    if (!g.net?.guest) {
      if (this.gil === null) this.castRoles();
      else if (g.net) this.keepRoles();
    }
    if (g.net && g.net.avatars.list.size !== this.painted) this.paintRoles();
    if (!isHost(g)) return;
    // (anfitrión) la voz llama a Gil desde la segunda ronda, cada tanto
    if (this.step === 0 && g.rounds.round >= 2) {
      this.callT -= dt;
      if (this.callT <= 0) {
        this.callT = 45 + Math.random() * 25;
        this.g.net?.event('ee', { vz: 'llamado' });
        this.playVoice('llamado');
      }
    }
  }

  // ---------------- atajos de prueba ----------------
  // Salta al comienzo de un paso (con lo anterior hecho).
  debugStep(n) {
    const g = this.g;
    if (!isHost(g)) return;
    const S = this.saber;
    const P = this.poder;
    if (n >= 2) {
      Object.assign(S, { reja: 'open', cofre: true, codice: 'given', caja: 'open', llave: 'used', papeles: 'given', uru: [3, 3, 3], plumas: 'given' });
      S.sync();
    }
    if (n >= 3) {
      P.pava = 'ready';
      P.sync();
    }
    if (n >= 4) {
      P.souls = P.need();
      this.ofrenda.ready();
    }
    if (n >= 5) this.ofrenda.give();
    this.step = Math.min(n, 5);
    if (n >= 5) this.ofrenda.callLuison();
    this.netSync();
    g.hud.subtitle(`Modo prueba: El Pacto, paso ${this.step} (${STEPS[this.step] || 'final'}).`, 3);
  }

  // (Alt+I, la música) Como si recién llevaran la luz al hueco: la voz, la
  // canción y el Luisón que llega en el golpe. Al lado del algarrobo.
  debugLuison() {
    const g = this.g;
    if (!isHost(g) || this.step >= 5) return;
    this.debugStep(4);
    this.ofrenda.give();
    this.startLuison();
    if (!g.weapons.has('liquidificador')) g.weapons.give?.('liquidificador');
    const p = g.player;
    const [x, z] = EE.hueco;
    p.pos.set(x - 1.5, g.world.floorAt(x - 1.5, z), z + 2);
    p.vel?.set(0, 0, 0);
  }

  // Alt+K (Game): el Luisón, al lado del algarrobo.
  debugFinal() {
    const g = this.g;
    if (!isHost(g) || this.step >= 5) return;
    this.debugStep(5);
    if (!g.weapons.has('liquidificador')) g.weapons.give?.('liquidificador');
    const p = g.player;
    const [x, z] = EE.hueco;
    p.pos.set(x - 1.5, g.world.floorAt(x - 1.5, z), z + 2);
    p.vel?.set(0, 0, 0);
  }

  dispose() {
    setSleeveColor(null);
    // (si se sale al menú en pleno final, que no quede su cartel en pantalla)
    this.scene?.cine?.dispose();
    this.scene = null;
    this.arrival?.dispose();
    this.arrival = null;
    window.removeEventListener('keydown', this.onKey);
    this.saber.dispose();
    this.poder.dispose();
    this.ofrenda.dispose();
    this.song.dispose();
    this.objEl?.remove();
    this.root.removeFromParent();
  }
}
