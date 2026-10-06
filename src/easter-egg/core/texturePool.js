import { BASE_NAMES, MAP_SETS, paintBase, putPre, putWearField } from './textures';
import { PERKS } from '../config/perks';
import { CASTLE_PAINT } from '../world/castleTextures';

// Las texturas de core/textures pintadas en varios hilos (core/textureWorker.js)
// mientras carga lo demás: en el hilo principal eran ~3 s de pantalla quieta.
// Devuelve { nombre: canvas } con lo que llegó; lo que falte (sin workers, un
// error, se pasó el tiempo) lo pinta buildTextures como siempre.
// Las del mapa elegido (las del penal: también torre, castillo, estero y
// monumento; granja: también torre; las del castillo, world/castleTextures)
// se esperan igual; después siguen el desgaste de las
// etiquetas de los perks (putWearField) y las de los otros mapas (putPre), que
// quedan guardadas para cuando se arme cada uno. Lo que no llegó a tiempo lo
// pinta quien lo pide, como antes.

// costo aproximado de cada una (lo pesado: los revoques, la tierra, los ladrillos)
const HEAVY = ['plasterWhite', 'concreteWall', 'plasterOffice', 'plasterGreen', 'brickSoot', 'plasterBlue', 'dirtDark', 'dirt', 'ground', 'brick', 'concrete', 'stoneWall', 'cellWall', 'whitewash', 'adobe'];
// qué juegos de cada mapa usa cada uno (World.js: penalTextures, farmTextures,
// castleTextures)
const NEEDS = { penal: ['penal'], torre: ['penal', 'farm'], castillo: ['penal', 'castle'], esteros: ['penal'], monumento: ['penal'], granja: ['farm'], eclipse: ['penal', 'farm', 'castle'] };
const SETS = { ...MAP_SETS, castle: Object.keys(CASTLE_PAINT) };

// reparte en ronda, las pesadas primero
function deal(names, lists) {
  const order = [...names.filter((n) => HEAVY.includes(n)), ...names.filter((n) => !HEAVY.includes(n))];
  order.forEach((n, i) => lists[i % lists.length].push(n));
}

// relief: false en Baja/Rendimiento elegidas a mano (sin normal maps): los
// workers no los arman y no quedan ~50 MB de arreglos sin usar; si después se
// sube la calidad, fx/Surfaces repinta esa textura acá y lo arma (repaint).
export function paintInWorkers(mapId, { relief = true, timeout = 12000 } = {}) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
  const k = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const sets = NEEDS[mapId] || [];
  const need = [...BASE_NAMES, ...sets.flatMap((s) => SETS[s])];
  const lists = Array.from({ length: k }, () => []);
  deal(need, lists);
  const later = Array.from({ length: k }, () => []);
  deal(Object.keys(SETS).filter((s) => !sets.includes(s)).flatMap((s) => SETS[s]), later);
  const base = new Set(BASE_NAMES);
  // un desgaste por costo distinto (la semilla es el costo)
  const seeds = [...new Set(Object.values(PERKS).map((p) => p.cost % 97))];
  const wear = Array.from({ length: k }, () => []);
  seeds.forEach((s, i) => wear[(k - 1 - (i % k) + k) % k].push([`512x1024:${s}:0.3`, 512, 1024, s, 0.3]));
  return new Promise((res) => {
    const out = {};
    const workers = [];
    let left = k;
    let got = 0;
    let timer = 0;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      clearTimeout(timer);
      res(out);
    };
    const finish = () => {
      for (const w of workers) w.terminate();
      send();
    };
    timer = setTimeout(finish, timeout);
    const doneOne = (w) => {
      if (w.done) return;
      w.done = true;
      if (--left === 0) finish();
    };
    lists.forEach((names, i) => {
      let w;
      try {
        w = new Worker(new URL('./textureWorker.js', import.meta.url), { type: 'module' });
      } catch {
        doneOne({});
        return;
      }
      workers.push(w);
      w.onmessage = (e) => {
        const m = e.data;
        if (m.done) return doneOne(w);
        if (m.wear) return putWearField(m.wear, m.f);
        if (!m.bmp) return;
        const c = document.createElement('canvas');
        c.width = m.bmp.width;
        c.height = m.bmp.height;
        c.getContext('2d').drawImage(m.bmp, 0, 0);
        m.bmp.close();
        if (m.rel) {
          c.relief = m.rel;
          if (!m.rel.pre) c.relief.repaint = () => paintBase(m.name) || CASTLE_PAINT[m.name]?.();
        }
        if (base.has(m.name)) out[m.name] = c;
        else putPre(m.name, c);
        // las que se esperan, apenas están todas (lo demás sigue llegando)
        if (need.includes(m.name) && ++got === need.length) send();
      };
      w.onerror = () => doneOne(w);
      w.postMessage({ names, wear: wear[i], later: later[i], relief });
    });
  });
}
