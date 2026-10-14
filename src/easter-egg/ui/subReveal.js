// El subtítulo que se arma al ritmo de la voz (Hud.speak y las escenas de
// Fierro, la voz, el Alcaide...). Antes se escribía cortando el texto
// (textContent = text.slice(0, n)) y el renglón se corría y crecía con cada
// palabra: "pega saltos" (el usuario, 2026-10-14). Ahora la frase entera ya
// está puesta, invisible, desde el principio, y cada palabra se prende en su
// lugar con un fundido corto (como los carteles de ui/Intro.js card): el
// renglón, el recuadro y los de arriba no se mueven.
// __mduSubSaltos = true: como antes (el texto cortado).

const FADE = 'opacity 0.2s ease-out';

// span: donde va el texto; n: cuántas letras de `text` ya se dijeron.
export function revealSub(span, text, n) {
  if (globalThis.__mduSubSaltos === true) {
    span.textContent = text.slice(0, n);
    return;
  }
  let R = span.mduRv;
  // (otra frase, o alguien vació el span: se arma de nuevo)
  if (!R || R.text !== text || (R.words.length && R.words[0].el.parentNode !== span)) {
    span.textContent = '';
    R = span.mduRv = { text, words: [] };
    const re = /\S+/g;
    let last = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m.index > last) span.appendChild(document.createTextNode(text.slice(last, m.index)));
      // (un elemento sin estilos propios: los `span` de los subtítulos tienen reglas)
      const el = document.createElement('mdu-w');
      el.textContent = m[0];
      // lo que ya se dijo antes de armarla (sayMore, saltear) aparece sin fundido
      const on = m.index < n;
      el.style.opacity = on ? '1' : '0';
      el.style.transition = FADE;
      span.appendChild(el);
      R.words.push({ el, at: m.index, on });
      last = m.index + m[0].length;
    }
    if (last < text.length) span.appendChild(document.createTextNode(text.slice(last)));
    return;
  }
  for (const w of R.words) {
    const on = w.at < n;
    if (on !== w.on) {
      w.on = on;
      w.el.style.opacity = on ? '1' : '0';
    }
  }
}
