import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isPromoLive, useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { formatDate, todayISO } from '../../lib/format';
import Modal from '../../components/Modal';
import FramedImage from '../../components/FramedImage';
import { EditIcon, TrashIcon } from '../../components/Icons';

const statusOf = (p) => {
  if (p.active === false) return ['off', 'Pausada'];
  if (p.endDate && p.endDate < todayISO()) return ['ended', 'Finalizada'];
  return ['live', 'Vigente'];
};

export default function PromosAdmin() {
  const { promos, deletePromo, savePromo } = useData();
  const { run } = useUI();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(null);

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Promos</h2>
        <Link to="/admin/promos/nueva" className="btn btn--accent">+ Nueva promo</Link>
      </div>
      <p className="hint">
        Las promos vigentes aparecen en el home debajo de la foto principal, en el orden de esta lista.
        Cuando pasa la fecha de fin dejan de mostrarse solas.
      </p>

      {promos.length === 0 ? (
        <div className="empty-state">
          <h3>No hay promos todavía</h3>
          <Link to="/admin/promos/nueva" className="btn">Crear la primera</Link>
        </div>
      ) : (
        <ul className="alist">
          {promos.map((p) => {
            const [tone, label] = statusOf(p);
            return (
              <li key={p.id} className="alist__item alist__item--wide">
                <div className="alist__banner">
                  <FramedImage frame={p.background} />
                </div>
                <div className="alist__info">
                  <strong>{p.title}</strong>
                  <span>
                    <span className={`status status--${tone}`}>{label}</span> · {p.items.length} productos
                    {p.endDate && ` · hasta el ${formatDate(p.endDate)}`}
                  </span>
                </div>
                <div className="alist__actions">
                  <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 6 }}>
                    <input
                      type="checkbox"
                      checked={p.active !== false}
                      onChange={(e) => {
                        const active = e.target.checked;
                        run(() => savePromo({ ...p, active }), active ? 'Promo activada' : 'Promo pausada');
                      }}
                    />
                    Activa
                  </label>
                  {isPromoLive(p) && (
                    <Link className="btn btn--sm btn--ghost" to={`/promo/${p.id}`}>Ver</Link>
                  )}
                  <button className="icon-btn" title="Editar" onClick={() => navigate(`/admin/promos/${p.id}`)}>
                    <EditIcon size={19} />
                  </button>
                  <button className="icon-btn is-danger" title="Eliminar" onClick={() => setConfirm(p)}>
                    <TrashIcon size={19} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title="¿Eliminar promo?" size="sm">
        <p>Vas a eliminar la promo <strong>{confirm?.title}</strong>. Esta acción no se puede deshacer.</p>
        <div className="toolbar" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button className="btn btn--ghost" onClick={() => setConfirm(null)}>Cancelar</button>
          <button
            className="btn btn--danger"
            onClick={async () => {
              await run(() => deletePromo(confirm.id), 'Promo eliminada');
              setConfirm(null);
            }}
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}
