import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';
import './Modal.css';

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Al bloquear el scroll desaparece la barra de scroll: compensamos su ancho
    // (en el body y en lo que está fijo) para que la página no se corra.
    const root = document.documentElement;
    const scrollbar = window.innerWidth - root.clientWidth;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.style.setProperty('--scrollbar-comp', `${scrollbar}px`);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      root.style.removeProperty('--scrollbar-comp');
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
