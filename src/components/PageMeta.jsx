import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PUBLIC_PAGES, SITE_TITLE } from '../config/seo';

// Al navegar dentro de la app, actualiza lo que leen los buscadores: la
// descripción y la dirección canónica de la página. Todo lo que no es una
// página pública ni una promo (admin, login, carrito, 404) se marca como
// "no indexar".
function setTag(tag, key, keyValue, attr, value) {
  let el = document.head.querySelector(`${tag}[${key}="${keyValue}"]`);
  if (value == null) return el?.remove();
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(key, keyValue);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export default function PageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const path = pathname.replace(/^\/+|\/+$/g, '');
    const page = PUBLIC_PAGES.find((p) => p.path === path);
    const indexable = Boolean(page) || path.startsWith('promo/');
    // Las páginas públicas se publican como carpetas (catalogo/index.html): van con barra final.
    const url = page ? `${__SITE_URL__}/${path ? `${path}/` : ''}` : `${__SITE_URL__}/${path}`;

    document.title = SITE_TITLE;
    if (page) {
      setTag('meta', 'name', 'description', 'content', page.description);
      setTag('meta', 'property', 'og:description', 'content', page.description);
    }
    setTag('link', 'rel', 'canonical', 'href', indexable ? url : null);
    setTag('meta', 'property', 'og:url', 'content', indexable ? url : null);
    setTag('meta', 'name', 'robots', 'content', indexable ? null : 'noindex');
  }, [pathname]);

  return null;
}
