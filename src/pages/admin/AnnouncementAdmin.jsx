import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import AnnouncementBar, { DEFAULT_ANNOUNCEMENT, isAnnouncementLive } from '../../components/AnnouncementBar';

const PRESETS = [
  { bg: '#c9853f', color: '#ffffff' },
  { bg: '#b3412f', color: '#ffffff' },
  { bg: '#1f2616', color: '#f4f2e8' },
  { bg: '#f4f2e8', color: '#34451f' },
  { bg: '#75aadb', color: '#ffffff' },
];

export default function AnnouncementAdmin() {
  const { settings, updateSettings } = useData();
  const { run } = useUI();
  const [a, setA] = useState(DEFAULT_ANNOUNCEMENT);

  useEffect(() => {
    if (settings) setA({ ...DEFAULT_ANNOUNCEMENT, ...settings.announcement });
  }, [settings]);

  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const live = isAnnouncementLive(a);
  const expired = a.enabled && a.until && new Date(a.until) <= new Date();

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Barra de anuncios</h2>
        <span className={`status ${live ? 'status--live' : 'status--off'}`}>
          {live ? 'Visible en el sitio' : 'Oculta'}
        </span>
      </div>
      <p className="hint">
        Aparece debajo de la navbar en todas las páginas y se esconde cuando el visitante baja. Ideal para envíos
        gratis, cuotas o una promo del día.
      </p>

      <div className="preview-frame" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        {a.text.trim() ? (
          <AnnouncementBar config={a} preview />
        ) : (
          <p className="hint" style={{ padding: 14, margin: 0 }}>
            Escribí un texto para ver la vista previa.
          </p>
        )}
      </div>

      <div className="admin-grid-2">
        <div>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={a.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            <span>Mostrar la barra</span>
          </label>
          <label className="field">
            <span>Texto</span>
            <input
              className="input"
              value={a.text}
              maxLength={160}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="Ej: Envío gratis en Rosario comprando 2 mates"
            />
          </label>
          <div className="field">
            <span>Movimiento</span>
            <div className="segmented">
              <button
                type="button"
                className={a.mode === 'marquee' ? 'is-active' : ''}
                onClick={() => set({ mode: 'marquee' })}
              >
                Texto que corre y se repite
              </button>
              <button
                type="button"
                className={a.mode === 'static' ? 'is-active' : ''}
                onClick={() => set({ mode: 'static' })}
              >
                Fijo y centrado
              </button>
            </div>
          </div>
          <label className="field">
            <span>Se oculta sola el</span>
            <input
              className="input"
              type="datetime-local"
              value={a.until}
              onChange={(e) => set({ until: e.target.value })}
            />
            <small>
              Vacío = se muestra hasta que la apagues.{' '}
              {a.until && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => set({ until: '' })}>
                  Quitar fecha
                </button>
              )}
            </small>
            {expired && <small style={{ color: 'var(--danger)' }}>Esa fecha ya pasó: la barra no se muestra.</small>}
          </label>
        </div>

        <div>
          <div className="field">
            <span>Colores</span>
            <div className="swatches">
              {PRESETS.map((p) => (
                <button
                  key={p.bg}
                  type="button"
                  className={`color-chip ${a.bg === p.bg && a.color === p.color ? 'is-active' : ''}`}
                  style={{ background: p.bg, color: p.color }}
                  onClick={() => set(p)}
                  aria-label={`Fondo ${p.bg}, texto ${p.color}`}
                >
                  Aa
                </button>
              ))}
            </div>
          </div>
          <div className="admin-grid-2" style={{ gap: 12 }}>
            <label className="field">
              <span>Fondo</span>
              <input type="color" value={a.bg} onChange={(e) => set({ bg: e.target.value })} />
            </label>
            <label className="field">
              <span>Texto</span>
              <input type="color" value={a.color} onChange={(e) => set({ color: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <button className="btn" onClick={() => run(() => updateSettings({ announcement: a }), 'Barra guardada')}>
        Guardar barra
      </button>
    </div>
  );
}
