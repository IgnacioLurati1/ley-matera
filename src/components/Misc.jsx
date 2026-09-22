import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { CheckIcon } from './Icons';

// Protege las vistas de admin.
export function PrivateRoute({ children }) {
  const { isAdmin, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="container" style={{ padding: 40 }}>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

export function Toasts() {
  const { toasts } = useUI();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.tone !== 'error' && <CheckIcon size={18} />} {t.text}
        </div>
      ))}
    </div>
  );
}
