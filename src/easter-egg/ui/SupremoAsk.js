import { supremoAsk } from '../core/eggs';
import { SIX } from '../weapons/supremoFx';
import './supremo.css';

// La pregunta de la primera partida con los seis easter eggs hechos: ¿que el
// Mate Supremo (weapons/Supremo.js) salga en la caja? La respuesta queda en
// settings.supremo (se cambia en Opciones > Generales) y no se vuelve a preguntar.
// done: lo que sigue después de contestar (arrancar la partida); sin done no
// frena nada (el invitado contesta mientras espera al anfitrión).
// Devuelve true si la pregunta está en pantalla.
// (en las pruebas automáticas no aparece, salvo con window.__mduSupremoAsk)
export function askSupremo(g, done = null) {
  if (!supremoAsk(g.settings) || (navigator.webdriver && !window.__mduSupremoAsk)) return false;
  const root = g.root || document.body;
  if (root.querySelector('.mdu-supremo')) return true;
  const el = document.createElement('div');
  el.className = 'mdu-supremo';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'mdu-supremo-t');
  const gems = SIX.map((c, i) => `<i style="--i:${i};--c:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
  el.innerHTML = `<div class="mdu-supremo__card">
      <div class="mdu-supremo__sun" aria-hidden="true"><b></b><span>${gems}</span></div>
      <h2 id="mdu-supremo-t" class="mdu-supremo__title">Mate Supremo</h2>
      <p class="mdu-supremo__q">¿Que salga en la caja?</p>
      <div class="mdu-supremo__btns">
        <button class="mdu-btn mdu-supremo__yes" data-a="1">Activar</button>
        <button class="mdu-btn" data-a="0">Jugar legal</button>
      </div>
      <p class="mdu-supremo__note">Se cambia en Opciones.</p>
    </div>`;
  const answer = (on) => {
    g.setSetting('supremo', on);
    g.setSetting('supremoAsked', true);
    removeEventListener('keydown', key, true);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
    g.audio?.click?.();
    done?.();
  };
  const key = (e) => {
    if (e.code !== 'Enter' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    answer(e.code === 'Enter');
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (b) answer(b.dataset.a === '1');
  });
  addEventListener('keydown', key, true);
  root.appendChild(el);
  el.querySelector('.mdu-supremo__yes')?.focus();
  return true;
}
