import { useEffect, useState } from 'react';
import { local } from '../lib/storage';
import { MoonIcon, SunIcon } from './Icons';

// Tema elegido por el visitante. Sin elección arranca en modo claro.
// index.html aplica el valor guardado antes de pintar, para que no parpadee.
const KEY = 'lm-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => (local.get(KEY) === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        local.set(KEY, next);
        setTheme(next);
      }}
      aria-label={dark ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      <span key={theme} className="theme-toggle__icon">
        {dark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
      </span>
    </button>
  );
}
