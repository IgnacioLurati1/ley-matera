import { ZONES } from '../config/map';

// El tiro según dónde pega (el usuario, 2026-10-16, de la propuesta de
// disparos a lo Left 4 Dead: "5 (buscá sonidos)"). Antes había un solo
// impacto para todo: polvo, chispas al azar (también en la madera) y el mismo
// agujero. Ahora, por lo que hay donde pegó:
//   madera: astillas y polvo marrón, un golpe seco;
//   piedra (revoque, ladrillo, baldosa, hormigón, roca, hielo): polvo gris y
//     cascotitos, alguna chispa, un chasquido;
//   tierra (tierra, pasto, nieve): un terrón que salta y polvo, golpe sordo;
//   metal (chapa): chispas y un "ping";
//   el maizal y el pajonal: hojitas, sin agujero.
// El material sale de la textura de la zona (piso, pared, la de afuera de la
// pared de enfrente) y, en la utilería, del nombre de la malla o del material
// (world/marcas.js le pasa cuál era). Va en lugar de Effects.impact; el agua
// sigue con su salpicón. globalThis.__mduImpactoViejo = true: el de antes.

const CLASE = [
  [/plank|parquet|barn|wood|madera|tabla|tranquer|tronc|cajon|cajón|barril|mesa|silla|banco|puerta|ventan|marco|cerca|carro|carreta|catre|estante|fence|crate|barrel|table|chair|door/i, 'madera'],
  [/corrugat|metal|iron|hierro|chapa|steel|acero|reja|caño|cano|tanque|tank|bell|campana|yunque|anvil|cañón|canon|lata/i, 'metal'],
  [/dirt|grass|snow|tierra|barro|pasto|nieve|sand|arena|mud|cave.?floor|field|explanada/i, 'tierra'],
  [/corn|maiz|maíz|paja|caña|cana|reed|leaf|hoja|bush|arbust|yerbal/i, 'planta'],
];
const COLOR = {
  madera: [0.42, 0.3, 0.17],
  piedra: [0.56, 0.54, 0.5],
  tierra: [0.38, 0.29, 0.19],
  nieve: [0.86, 0.89, 0.93],
  metal: [0.4, 0.4, 0.42],
  planta: [0.3, 0.42, 0.16],
};
// los sonidos (ElevenLabs, 2026-10-16; scratchpad gore/snd) y cada cuánto como mucho (s)
const SND_DIR = '/assets/sotano/sfx/impactos/';
const SONIDOS = { madera: 2, piedra: 3, tierra: 3, metal: 3 };
const SND_GAP = 0.045;
const SND_GAIN = { madera: 0.42, piedra: 0.36, tierra: 0.38, metal: 0.4 };

function porNombre(s) {
  if (!s) return null;
  for (const [re, c] of CLASE) if (re.test(s)) return c;
  return null;
}

export default class Impactos {
  constructor(g) {
    this.g = g;
    this.sndT = 0;
    this.instalar();
  }

  instalar() {
    const g = this.g;
    const fx = g.fx;
    if (fx && !fx.mduImpacto) {
      const viejo = fx.impact.bind(fx);
      fx.mduImpacto = viejo;
      fx.impact = (hit, mark = true, ...rest) => {
        // (Desgarrador: impact(punto, normal, dt, ...) con otra forma; esos, como siempre)
        if (globalThis.__mduImpactoViejo || !hit?.point || !hit.normal || rest.length || typeof mark !== 'boolean') return viejo(hit, mark, ...rest);
        return g.impactos ? g.impactos.impacto(hit, mark) : viejo(hit, mark);
      };
    }
    const a = g.audio;
    if (a?.ctx && !a.mduImp) {
      a.mduImp = { buf: {} };
      for (const [k, n] of Object.entries(SONIDOS)) {
        for (let i = 1; i <= n; i++) {
          const id = `${k}-${i}`;
          fetch(SND_DIR + id + '.mp3')
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
            .then((ab) => a.ctx.decodeAudioData(ab))
            .then((b) => {
              a.mduImp.buf[id] = b;
            })
            .catch(() => {});
        }
      }
    }
  }

  // de qué es lo que recibió el tiro
  clase(hit) {
    const g = this.g;
    const box = hit.box;
    const kind = typeof box === 'object' ? box?.kind : box;
    if (kind === 'door' || kind === 'window' || kind === 'fence' || kind === 'gate' || kind === 'valla') return 'madera';
    if (kind === 'reja' || kind === 'machine') return 'metal';
    if (kind === 'stone' || kind === 'debris') return 'piedra';
    if (kind === 'corn') return 'planta';
    // la utilería: el nombre de la malla, del material o de su textura
    const o = hit.obj;
    if (o) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const c = porNombre(o.name) || porNombre(o.parent?.name) || porNombre(m?.name) || porNombre(m?.map?.name) || porNombre(o.userData?.kind);
      if (c) return c;
      if (m?.metalness > 0.5) return 'metal';
      if (kind === 'prop') return 'madera';
    }
    const n = hit.normal;
    const p = hit.point;
    const w = g.world;
    const k = w?.zoneAt?.(p.x + n.x * 0.3, p.z + n.z * 0.3, p.y);
    const Z = k ? ZONES[k] : null;
    let tex;
    if (n.y > 0.6) tex = Z ? Z.floor : 'dirt';
    else if (n.y < -0.6) tex = Z?.ceil || Z?.wall;
    else {
      // de afuera, la pared es la de afuera de la zona de enfrente
      const k2 = w?.zoneAt?.(p.x - n.x * 0.3, p.z - n.z * 0.3, p.y);
      const Z2 = k2 && k2 !== k ? ZONES[k2] : null;
      tex = Z?.outdoor ? Z2?.ext || Z2?.wall || Z?.cliff : Z?.wall || Z2?.ext || Z?.cliff;
    }
    if (kind === 'prop' && !tex) return 'madera';
    if (/snow/i.test(tex || '')) return 'nieve';
    return porNombre(tex) || 'piedra';
  }

  impacto(hit, mark) {
    const g = this.g;
    const fx = g.fx;
    // abajo del agua no hay polvo (el salpicón lo hace fx/Water)
    if (g.water?.under(hit.point)) return;
    const c = this.clase(hit);
    const p = hit.point;
    const n = hit.normal;
    const col = COLOR[c] || COLOR.piedra;
    if (c === 'planta') {
      for (let i = 0; i < 6; i++) fx.alpha.spawn(p.x, p.y, p.z, n.x * 1.5 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, n.z * 1.5 + (Math.random() - 0.5) * 2, { color: [col[0] * (0.7 + Math.random() * 0.5), col[1], col[2]], size: 0.03, life: 0.9, gravity: 4, drag: 2.5 });
      return;
    }
    // el polvo de siempre, del color de lo que pegó
    fx.dust(p, n, col, c === 'tierra' || c === 'nieve' ? 4 : 2);
    if (c === 'madera') {
      // astillas: claras, saltan y caen
      for (let i = 0; i < 5; i++) fx.alpha.spawn(p.x, p.y, p.z, (n.x + (Math.random() - 0.5) * 1.4) * (2 + Math.random() * 2), (n.y + 0.4 + Math.random()) * 2, (n.z + (Math.random() - 0.5) * 1.4) * (2 + Math.random() * 2), { color: [0.62, 0.48, 0.3], size: 0.022, life: 0.6 + Math.random() * 0.4, gravity: 9, drag: 1, bounce: 0.3 });
    } else if (c === 'piedra') {
      for (let i = 0; i < 4; i++) fx.alpha.spawn(p.x, p.y, p.z, (n.x + (Math.random() - 0.5) * 1.2) * (1.5 + Math.random() * 2), (n.y + 0.5 + Math.random()) * 1.6, (n.z + (Math.random() - 0.5) * 1.2) * (1.5 + Math.random() * 2), { color: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], size: 0.02, life: 0.5 + Math.random() * 0.3, gravity: 9, drag: 1, bounce: 0.4 });
      if (Math.random() < 0.15) fx.sparks(p, 0.3, n);
    } else if (c === 'tierra' || c === 'nieve') {
      // el terrón que salta
      for (let i = 0; i < 4; i++) fx.alpha.spawn(p.x, p.y, p.z, (n.x + (Math.random() - 0.5)) * 1.2, 1.6 + Math.random() * 1.8, (n.z + (Math.random() - 0.5)) * 1.2, { color: [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75], size: 0.03, life: 0.5 + Math.random() * 0.3, gravity: 9, drag: 1 });
    } else if (c === 'metal') {
      fx.sparks(p, 1.1, n);
    }
    // el salpicón de agua/vapor del mate, como antes
    fx.alpha.spawn(p.x, p.y, p.z, n.x * 0.5, 0.4, n.z * 0.5, { color: [0.45, 0.47, 0.5], size: 0.04, size1: 0.18, life: 0.4, alpha: 0.18, drag: 2, gravity: -0.5 });
    if (mark) fx.decal(0, p, n, (c === 'tierra' || c === 'nieve' ? 0.08 : 0.1) + Math.random() * 0.05);
    this.sonar(c === 'nieve' ? 'tierra' : c, p);
  }

  sonar(c, p) {
    const a = this.g.audio;
    const n = SONIDOS[c];
    if (!a?.mduImp || !n || a.now - this.sndT < SND_GAP) return;
    const buf = a.mduImp.buf[`${c}-${1 + Math.floor(Math.random() * n)}`];
    if (!buf) return;
    this.sndT = a.now;
    const was = a.cat;
    a.cat = 'world';
    try {
      a.playBuffer(buf, { pos: p.clone(), gain: SND_GAIN[c] || 0.38, reverb: 0.12, ref: 2.5, rate: 0.9 + Math.random() * 0.2 });
    } finally {
      a.cat = was;
    }
  }
}
