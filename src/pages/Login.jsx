import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import './Login.css';

export default function Login() {
  const { login, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  if (isAdmin) return <Navigate to={location.state?.from ?? '/admin'} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(email, password);
    setBusy(false);
    if (!err) {
      navigate(location.state?.from ?? '/admin', { replace: true });
      return;
    }
    setError(err);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div className="login container">
      <form className={`login__card ${shake ? 'is-shaking' : ''}`} onSubmit={onSubmit}>
        <Logo size={84} />
        <h1>Panel de administración</h1>
        <p>Entrá con tu cuenta para cargar productos y promos.</p>
        <label className="field">
          <span>Mail</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="login__error" role="alert">{error}</p>}
        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
