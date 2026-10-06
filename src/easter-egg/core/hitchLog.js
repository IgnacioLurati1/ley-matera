// Registro de tirones: cuánto tardó cada parte del juego en los cuadros lentos,
// para saber qué los causa en la compu de cada uno (2026-10-02, los bajones
// que el usuario veía con una placa de sobra). Mide siempre, barato (un par
// de performance.now() por sistema); Alt+H muestra los últimos en pantalla.
//
// Cada sistema del juego (game.player, game.zombies…) se envuelve una sola vez
// (la instancia: al rearmar el mapa son otras y se vuelven a envolver). Por
// cuadro lento se guarda: el total, las partes más caras, lo que no es de
// ningún sistema (el navegador: basura de memoria, la placa esperando), los
// programas de la placa nuevos (compilar un material traba) y dónde estaba.

// lo que se mide: [nombre, objeto en game, método]
const SYSTEMS = [
  ['jugador', 'player', 'update'],
  ['caminos', 'nav', 'update'],
  ['armas', 'weapons', 'update'],
  ['interacción', 'interact', 'update'],
  ['gaucho life', 'vida', 'update'],
  ['ventanas', 'barriers', 'update'],
  ['rondas', 'rounds', 'update'],
  ['zombies', 'zombies', 'update'],
  ['entrada', 'intro', 'update'],
  ['jefe final', 'arena', 'update'],
  ['potenciadores', 'powerups', 'update'],
  ['empanadas', 'emp', 'update'],
  ['pombero', 'pombero', 'update'],
  ['matorral', 'matorral', 'update'],
  ['yasy', 'yasy', 'update'],
  ['cuervo', 'crow', 'update'],
  ['luz mala', 'luz', 'update'],
  ['actividades', 'activities', 'update'],
  ['red', 'net', 'update'],
  ['bichos', 'critters', 'update'],
  ['easter egg', 'ee', 'update'],
  ['mundo', 'world', 'update'],
  ['ambiente', 'ambience', 'update'],
  ['clima', 'weather', 'update'],
  ['agua', 'water', 'update'],
  ['efectos', 'fx', 'update'],
  ['pantalla', 'hud', 'update'],
  ['sonido', 'audio', 'updateAmbience'],
  ['dibujo', 'post', 'render'],
  ['decorado', 'decor', 'update'],
  ['último zombie', 'lastZ', 'update'],
  ['curandero', 'curandero', 'update'],
  ['pack-a-pava', 'papq', 'update'],
  ['música', 'music', 'tick'],
  // (el cuadro entero de juego: si es mucho más que sus partes, es algo del medio)
  ['cuadro', '', 'update'],
];
// un cuadro es tirón si pasa esto (ms) y el doble de lo normal
const MIN_MS = 45;
const KEEP = 12;

export default class HitchLog {
  constructor(game) {
    this.g = game;
    this.acc = new Map();
    this.list = [];
    this.avg = 16;
    this.el = null;
    this.t0 = 0;
  }

  // Envuelve lo que todavía no está envuelto (barato: una comparación por sistema).
  wrap() {
    const g = this.g;
    for (const [name, key, fn] of SYSTEMS) {
      const o = key ? g[key] : g;
      if (!o || typeof o[fn] !== 'function' || o[`__hl_${fn}`]) continue;
      const orig = o[fn];
      const log = this;
      o[`__hl_${fn}`] = true;
      o[fn] = function (...a) {
        const t = performance.now();
        try {
          return orig.apply(this, a);
        } finally {
          // (el mapa del cuadro en curso: se alternan dos)
          const acc = log.acc;
          acc.set(name, (acc.get(name) || 0) + performance.now() - t);
        }
      };
    }
  }

  // Al empezar cada cuadro, con lo que tardó desde el anterior (lo que siente
  // el jugador): si fue un tirón, se anota con lo que midió el cuadro anterior.
  begin(ms) {
    const g = this.g;
    this.wrap();
    const prev = this.acc;
    this.acc = this.prevAcc || new Map();
    this.prevAcc = prev;
    const slow = ms > MIN_MS && ms > this.avg * 2 && ms < 3000 && (g.state === 'playing' || g.state === 'over');
    this.avg += (Math.min(ms, 100) - this.avg) * 0.05;
    if (slow) this.note(ms, prev);
    this.acc.clear();
    this.t0 = performance.now();
    this.prog0 = g.renderer?.info.programs?.length || 0;
  }

  end() {
    this.work = performance.now() - this.t0;
    this.prog = (this.g.renderer?.info.programs?.length || 0) - this.prog0;
  }

  note(ms, acc) {
    const g = this.g;
    const parts = [...acc].sort((a, b) => b[1] - a[1]);
    const sum = parts.reduce((s, p) => s + p[1], 0);
    const p = g.player?.pos;
    const zone = p && g.world?.zoneAt?.(p.x, p.z);
    this.list.push({
      at: Math.round(g.time),
      ms: Math.round(ms),
      work: Math.round(this.work || 0),
      // lo que no es de ningún sistema: el navegador (basura de memoria, la
      // placa esperando, compilar) y lo que quedó sin medir
      other: Math.round(Math.max(0, ms - sum)),
      top: parts.slice(0, 4).map(([n, v]) => [n, Math.round(v)]),
      prog: this.prog || 0,
      zone: typeof zone === 'string' ? zone : zone?.name || zone?.id || '',
      round: g.rounds?.round || 0,
    });
    if (this.list.length > KEEP) this.list.shift();
    if (this.el) this.draw();
  }

  toggle() {
    if (this.el) {
      this.el.remove();
      this.el = null;
      return;
    }
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;margin:0;padding:8px 10px;max-width:46vw;background:rgba(0,0,0,.78);color:#e8ffe0;font:12px/1.35 Consolas,monospace;white-space:pre-wrap;pointer-events:none;border-radius:6px';
    (this.g.root || document.body).appendChild(el);
    this.el = el;
    this.draw();
  }

  draw() {
    const L = this.list;
    const head = `TIRONES (Alt+H) · normal ${Math.round(this.avg)} ms · ${L.length ? `últimos ${L.length}` : 'ninguno todavía'}\n`;
    this.el.textContent =
      head +
      L.slice()
        .reverse()
        .map((r) => `${r.ms} ms · ronda ${r.round} · ${r.zone}${r.prog ? ` · ${r.prog} programas nuevos` : ''}\n   ${r.top.map(([n, v]) => `${n} ${v}`).join(', ')} · resto ${r.other}`)
        .join('\n');
  }
}
