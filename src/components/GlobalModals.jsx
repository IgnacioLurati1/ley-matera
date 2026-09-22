import Modal from './Modal';
import { useUI } from '../context/UIContext';
import { SITE, whatsappLink } from '../config/site';
import { InstagramIcon, WhatsAppIcon } from './Icons';
import './GlobalModals.css';

const STEPS = [
  { title: 'Elegí tus productos', text: 'Recorré el catálogo y sumá al carrito todo lo que quieras llevarte.' },
  { title: 'Hacé el pedido', text: 'En el carrito, tocá el botón “Solicitar productos”.' },
  { title: 'Mandá el mensaje', text: 'Se abre WhatsApp con el mensaje ya armado: sólo tenés que enviarlo.' },
  { title: 'Esperá nuestra respuesta', text: '¡Te contestamos para coordinar el pago y la entrega y seguir con tu pedido!' },
];

export function ContactLinks() {
  return (
    <div className="contact-links">
      <a className="contact-card contact-card--wa" href={whatsappLink('¡Hola Ley Matera! Tengo una consulta:')} target="_blank" rel="noreferrer">
        <WhatsAppIcon size={30} />
        <div>
          <strong>WhatsApp</strong>
          <span>{SITE.whatsappDisplay}</span>
        </div>
      </a>
      <a className="contact-card contact-card--ig" href={SITE.instagramUrl} target="_blank" rel="noreferrer">
        <InstagramIcon size={30} />
        <div>
          <strong>Instagram</strong>
          <span>{SITE.instagramHandle}</span>
        </div>
      </a>
    </div>
  );
}

export default function GlobalModals() {
  const { modal, closeModal } = useUI();
  return (
    <>
      <Modal open={modal === 'contact'} onClose={closeModal} title="¡Hablemos!" size="sm">
        <p className="modal-lead">Escribinos por donde te quede más cómodo y te respondemos lo antes posible.</p>
        <ContactLinks />
      </Modal>
      <Modal open={modal === 'howto'} onClose={closeModal} title="¿Cómo pedir?">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="steps__n">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
