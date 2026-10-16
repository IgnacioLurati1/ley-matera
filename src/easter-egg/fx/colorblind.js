// El modo para daltónicos (Opciones → Gráficos → Daltonismo; el usuario, 2026-10-15: "hacé el filtro"). Corrige
// los colores para que lo que se distingue por rojo y verde (o azul y amarillo) se distinga igual: se simula cómo
// ve la imagen alguien con ese daltonismo (Machado, Oliveira y Fernandes 2009, severidad completa, en RGB lineal),
// y lo que se pierde se pasa a los colores que sí ve (la corrección de Fidaner: "daltonize").
// Una sola matriz por modo: M = I + E · (I − S). La usa el último pase de color del 3D (fx/PostFX, uCB) y, para
// el HUD y los menús, que son HTML encima del lienzo, un filtro SVG con la misma matriz (ui/style.css .mdu-cb).

const SIM = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
// a dónde va lo que no se ve: rojo-verde, al verde y al azul; azul-amarillo, al rojo y al verde
const SHIFT = {
  protan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deutan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritan: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
};

export const CB_MODES = ['off', 'protan', 'deutan', 'tritan'];

// La matriz de corrección (3×3, por filas) del modo, o null si no hay.
export function cbMatrix(mode) {
  const S = SIM[mode];
  const E = SHIFT[mode];
  if (!S) return null;
  const D = S.map((v, i) => (i % 4 === 0 ? 1 : 0) - v);
  const M = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let v = r === c ? 1 : 0;
      for (let k = 0; k < 3; k++) v += E[r * 3 + k] * D[k * 3 + c];
      M.push(v);
    }
  return M;
}

const SVG_ID = 'mdu-cb-svg';

// El HUD y los menús: el filtro SVG (en RGB lineal, como el del 3D) y la clase en la raíz.
export function applyColorblindDom(root, mode) {
  const M = cbMatrix(mode);
  let svg = document.getElementById(SVG_ID);
  if (M && !svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = SVG_ID;
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="mdu-cb" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values=""/></filter>';
    document.body.appendChild(svg);
  }
  if (M) {
    const v = [...M.slice(0, 3), 0, 0, ...M.slice(3, 6), 0, 0, ...M.slice(6, 9), 0, 0, 0, 0, 0, 1, 0];
    svg.querySelector('feColorMatrix').setAttribute('values', v.map((x) => +x.toFixed(6)).join(' '));
  }
  root?.classList.toggle('mdu-cb', !!M);
}
