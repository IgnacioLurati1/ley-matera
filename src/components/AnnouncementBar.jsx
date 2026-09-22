import { useData } from '../context/DataContext';
import './AnnouncementBar.css';

export const DEFAULT_ANNOUNCEMENT = {
  enabled: false,
  text: '',
  mode: 'marquee', // 'marquee' = el texto se repite y corre; 'static' = fijo y centrado
  bg: '#c9853f',
  color: '#ffffff',
  until: '', // fecha y hora (local) en la que deja de mostrarse; vacío = sin fin
};

export const isAnnouncementLive = (a, now = new Date()) =>
  Boolean(a?.enabled && a.text?.trim() && (!a.until || new Date(a.until) > now));

// Barra de anuncios debajo de la navbar. `config` permite mostrar una vista
// previa desde el panel sin guardar.
export default function AnnouncementBar({ config, preview = false }) {
  const { settings } = useData();
  const a = { ...DEFAULT_ANNOUNCEMENT, ...(config ?? settings?.announcement) };
  if (!preview && !isAnnouncementLive(a)) return null;
  if (preview && !a.text?.trim()) return null;

  const style = { background: a.bg, color: a.color };
  if (a.mode === 'static') {
    return (
      <div className="announce announce--static" style={style} role="note">
        <span>{a.text}</span>
      </div>
    );
  }

  // Cinta: el texto se repite para llenar el ancho y el loop es continuo.
  const copies = Math.max(4, Math.ceil(160 / a.text.length));
  const items = Array.from({ length: copies }, (_, i) => <span key={i}>{a.text}</span>);
  return (
    <div className="announce announce--marquee" style={style} role="note" aria-label={a.text}>
      <div
        className="announce__track"
        style={{ animationDuration: `${Math.max(18, a.text.length * copies * 0.18)}s` }}
        aria-hidden
      >
        <div className="announce__group">{items}</div>
        <div className="announce__group">{items}</div>
      </div>
    </div>
  );
}
