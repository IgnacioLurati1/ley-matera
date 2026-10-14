import * as Armas from '../core/armas';
import { WEAPONS } from '../config/weapons';
import './armeria-accesorios.css';

// El aviso chico de la partida cuando un mate sube de nivel en la armería
// mejorada (core/armas.js): el mate y el nivel, y lo nuevo si ganó algo. Entra
// de costado arriba de la munición y se va solo (los que llegan juntos, en fila).
// Texto mínimo (regla del usuario).

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function instalarAvisos(g) {
  if (g._armasAviso) return;
  g._armasAviso = true;
  const cola = [];
  let busy = false;
  const next = () => {
    const u = cola.shift();
    const box = g.hud?.ammoBox?.parentElement;
    if (!u || g.state !== 'playing' || !box) {
      cola.length = 0;
      busy = false;
      return;
    }
    busy = true;
    const el = document.createElement('div');
    el.className = 'mdu-armup';
    el.innerHTML = `<b>${esc(WEAPONS[u.id]?.name || u.id)} · Nivel ${u.level}</b>${u.news.length ? `<span>${esc(u.news.join(' · '))}</span>` : ''}`;
    box.appendChild(el);
    try {
      if (g.audio?.ctx?.state === 'running') g.audio.tune([[79, 0.5], [84, 1.2]], { wave: 'triangle', bpm: 260, gain: 0.08, cutoff: 3200 });
    } catch {
      /* sin audio */
    }
    setTimeout(() => el.classList.add('is-out'), 2900);
    setTimeout(() => {
      el.remove();
      next();
    }, 3350);
  };
  Armas.onNivel((u) => {
    if (g.state !== 'playing') return;
    cola.push(u);
    if (!busy) next();
  });
}
