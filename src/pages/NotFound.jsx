import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container empty-state" style={{ padding: '80px 16px' }}>
      <h3>Esta página no existe</h3>
      <p>Puede que el link esté mal escrito o que la página se haya movido.</p>
      <Link to="/" className="btn">Ir al inicio</Link>
    </div>
  );
}
