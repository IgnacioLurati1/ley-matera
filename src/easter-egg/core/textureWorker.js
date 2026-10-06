import { paintBase, wearField } from './textures';
import { bakeArrays } from '../fx/Surfaces';
import { CASTLE_PAINT } from '../world/castleTextures';

// Pinta texturas de core/textures en otro hilo, al abrir el juego (las pide
// core/texturePool.js). Las que traen relieve salen con su normal map ya
// armado (fx/Surfaces): las funciones de altura no se pueden mandar entre
// hilos, los arreglos sí. Manda cada una apenas está.
// relief: armar ya el normal map (en Baja y Rendimiento no se usa: se arma
// en el hilo principal si después se sube la calidad, fx/Surfaces bake)
const paint = (name, relief) => {
  try {
    const c = paintBase(name) || CASTLE_PAINT[name]?.();
    if (!c) return;
    const tr = [];
    let rel = null;
    if (c.relief) {
      rel = { depth: c.relief.depth };
      if (relief) {
        const b = bakeArrays(c);
        rel.pre = b;
        tr.push(b.data.buffer, b.orm.buffer);
      }
    }
    const bmp = c.transferToImageBitmap();
    tr.push(bmp);
    self.postMessage({ name, bmp, rel }, tr);
  } catch {
    /* esa se pinta en el hilo principal */
  }
};

// names: las que se esperan para seguir; después los desgastes de las
// etiquetas de los perks; later: las de los otros mapas (quedan guardadas
// para cuando se arme cada uno).
self.onmessage = (e) => {
  const relief = e.data.relief !== false;
  for (const name of e.data.names || []) paint(name, relief);
  for (const [key, w, h, seed, amount] of e.data.wear || []) {
    const f = wearField(w, h, seed, amount);
    self.postMessage({ wear: key, f }, [f.buffer]);
  }
  for (const name of e.data.later || []) paint(name, relief);
  self.postMessage({ done: true });
};
