import { supabase, BUCKET } from './supabase';

// Las fotos subidas se guardan en varias medidas con el sufijo en el nombre:
//   products/P12-lx3k2a-800.webp  y  products/P12-lx3k2a-400.webp
// En la base sólo se guarda la URL de la más grande; las demás se deducen.
const VARIANT = /-(\d+)\.(webp|jpg)$/;

// Un año de caché: como cada subida tiene un nombre nuevo, nunca queda una
// versión vieja cacheada, y un visitante que vuelve no descarga de nuevo.
const CACHE_SECONDS = '31536000';

export const uploadVariants = async (folder, baseName, variants) => {
  const stamp = Date.now().toString(36);
  let largest = null;
  for (const { size, blob } of variants) {
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${folder}/${baseName}-${stamp}-${size}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      cacheControl: CACHE_SECONDS,
      contentType: blob.type,
      upsert: false,
    });
    if (error) throw error;
    if (!largest || size > largest.size) largest = { size, path };
  }
  return supabase.storage.from(BUCKET).getPublicUrl(largest.path).data.publicUrl;
};

const storagePath = (url) => {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
};

// Borra todas las medidas de una imagen subida (si es nuestra).
export const removeVariants = async (url, sizes) => {
  const path = storagePath(url);
  if (!path || !supabase) return;
  const m = path.match(VARIANT);
  const paths = m ? sizes.map((s) => path.replace(VARIANT, `-${s}.${m[2]}`)) : [path];
  await supabase.storage.from(BUCKET).remove(paths);
};

// srcset para <img> a partir de la URL guardada (o undefined si no hay variantes).
export const srcSetFor = (url, sizes) => {
  const m = url?.match(VARIANT);
  if (!m) return undefined;
  return sizes.map((s) => `${url.replace(VARIANT, `-${s}.${m[2]}`)} ${s}w`).join(', ');
};

export const PRODUCT_SIZES = [400, 800];
export const BACKGROUND_SIZES = [960, 1920];
export const ABOUT_SIZES = [480, 960];

// Versión chica de una imagen subida (la de celulares), o la misma si no tiene variantes.
export const variantUrl = (url, size) => {
  const m = url?.match(VARIANT);
  return m ? url.replace(VARIANT, `-${size}.${m[2]}`) : url;
};
