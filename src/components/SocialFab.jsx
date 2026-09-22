import { useEffect, useState } from 'react';
import { SITE, whatsappLink } from '../config/site';
import { local } from '../lib/storage';
import { ChatIcon, CloseIcon, InstagramIcon, WhatsAppIcon } from './Icons';
import './SocialFab.css';

// Una vez que el visitante toca el botón, el globito no vuelve a aparecer.
const HINT_KEY = 'lm-fab-hint-seen';

// Burbuja flotante abajo a la derecha con acceso directo a las redes.
export default function SocialFab() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => Boolean(local.get(HINT_KEY)));
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (dismissed) return undefined;
    const t1 = setTimeout(() => setHint(true), 2500);
    const t2 = setTimeout(() => setHint(false), 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dismissed]);

  const toggle = () => {
    setOpen((o) => !o);
    setHint(false);
    if (!dismissed) {
      setDismissed(true);
      local.set(HINT_KEY, true);
    }
  };

  return (
    <div className={`fab ${open ? 'is-open' : ''}`}>
      {hint && !dismissed && !open && (
        <button type="button" className="fab__hint" onClick={toggle}>
          ¿Tenés dudas? Escribinos
        </button>
      )}
      <div className="fab__menu">
        <a href={whatsappLink('¡Hola Ley Matera!')} target="_blank" rel="noreferrer" className="fab__item fab__item--wa">
          <WhatsAppIcon size={20} /> WhatsApp
        </a>
        <a href={SITE.instagramUrl} target="_blank" rel="noreferrer" className="fab__item fab__item--ig">
          <InstagramIcon size={20} /> Instagram
        </a>
      </div>
      <button className="fab__btn" onClick={toggle} aria-label={open ? 'Cerrar redes' : 'Abrir redes'} aria-expanded={open}>
        {open ? <CloseIcon size={26} /> : <ChatIcon size={26} />}
      </button>
    </div>
  );
}
