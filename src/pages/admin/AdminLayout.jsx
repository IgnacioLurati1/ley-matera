import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { OrdersProvider } from '../../context/OrdersContext';
import { LogoutIcon } from '../../components/Icons';
import './Admin.css';

const TABS = [
  { to: '/admin', label: 'Ventas', end: true },
  { to: '/admin/productos', label: 'Productos' },
  { to: '/admin/destacados', label: 'Destacados' },
  { to: '/admin/promos', label: 'Promos' },
  { to: '/admin/anuncio', label: 'Barra de anuncios' },
  { to: '/admin/temporadas', label: 'Decoraciones' },
  { to: '/admin/lector', label: 'Lector de pedidos' },
  { to: '/admin/datos', label: 'Editar' },
];

export default function AdminLayout() {
  const { session, logout } = useAuth();
  const { readOnly } = useData();
  const navigate = useNavigate();

  return (
    <div className="admin container">
      <header className="admin__head">
        <div>
          <h1>Panel de administración</h1>
          <p className="muted" style={{ margin: 0 }}>Sesión iniciada como {session?.email}</p>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          <LogoutIcon size={17} /> Cerrar sesión
        </button>
      </header>

      {readOnly && (
        <div className="admin__notice">
          <strong>Modo sólo lectura.</strong> Falta configurar Supabase en el archivo <code>.env</code>, así
          que los cambios no se pueden guardar.
        </div>
      )}

      <nav className="admin__tabs" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="admin__tab">
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="admin__content page-enter">
        <OrdersProvider>
          <Outlet />
        </OrdersProvider>
      </div>
    </div>
  );
}
