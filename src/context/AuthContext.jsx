import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Login de admins con Supabase Auth. La sesión queda guardada en el navegador
// y se renueva sola, así que no hace falta volver a entrar.
const AuthContext = createContext(null);

const toSession = (s) =>
  s ? { email: s.user.email, name: s.user.user_metadata?.name || s.user.email.split('@')[0] } : null;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(toSession(data.session));
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(toSession(s)));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      session,
      ready,
      isAdmin: Boolean(session),
      // Devuelve un mensaje de error o null si entró bien.
      login: async (email, password) => {
        if (!supabase) return 'Falta configurar Supabase en el archivo .env.';
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (!error) return null;
        return error.message.includes('Invalid login')
          ? 'El mail o la contraseña no coinciden.'
          : `No se pudo iniciar sesión: ${error.message}`;
      },
      logout: () => supabase?.auth.signOut(),
    }),
    [session, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
