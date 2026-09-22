import { createClient } from '@supabase/supabase-js';

// La publishable key es pública por diseño (los permisos los controla RLS en
// la base). La secret key NUNCA va en el front.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = url && key
  ? createClient(url, key, {
      // Sesión "infinita": queda en localStorage y se renueva sola.
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lm-auth' },
    })
  : null;

export const BUCKET = 'imagenes';
