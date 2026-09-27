// Dibujos del HUD para el escudo armable, sus piezas y el gaucho life (SVG en
// línea, así escalan y toman el color del tema). Cada mapa tiene su escudo, el
// mismo que se arma con sus tres piezas (config/maps/*: ACT.shield, ACT.parts).

// ---------------- el escudo de cada mapa (40x46) ----------------
// Todos con el mismo lienzo: la barra de aguante vacía el dibujo de arriba
// hacia abajo y las rajaduras (SHIELD_CRACKS) van encima.
export const SHIELD_ICONS = {
  // El Molino: tapa de olla de hierro forrada en cuero crudo, cosida con tientos
  molino: `
    <circle cx="20" cy="23" r="17.5" fill="#34322e" stroke="#0e0c0a" stroke-width="1.4"/>
    <circle cx="20" cy="23" r="16" fill="none" stroke="#5c5850" stroke-width="0.8"/>
    <path d="M8.5 15.5 Q14 9.5 21 10.5 Q29 9 32 16.5 Q35.5 24 31 31.5 Q26 37.5 19 36.5 Q11 37 8.5 30 Q5 22.5 8.5 15.5Z" fill="#a8743a"/>
    <path d="M12 17 Q17 13 22 14.5 M25 31 Q29 28 30 23" fill="none" stroke="#7a4f22" stroke-width="1" stroke-linecap="round"/>
    <circle cx="20" cy="23" r="14.2" fill="none" stroke="#efd6a2" stroke-width="1.4" stroke-dasharray="2.4 2.2"/>
    <circle cx="20" cy="23" r="3.6" fill="#4a4740" stroke="#0e0c0a" stroke-width="1"/>
    <circle cx="19" cy="22" r="1.1" fill="#8c877c"/>`,
  // La Tapera: paja enrollada en espiral, un parche de arpillera y alambre atado
  granja: `
    <circle cx="20" cy="23" r="17.5" fill="#d6a03c" stroke="#5a3408" stroke-width="1.4"/>
    <circle cx="20" cy="23" r="14" fill="none" stroke="#a86c18" stroke-width="1.3"/>
    <circle cx="20" cy="23" r="10.5" fill="none" stroke="#a86c18" stroke-width="1.3"/>
    <circle cx="20" cy="23" r="7" fill="none" stroke="#a86c18" stroke-width="1.3"/>
    <path d="M6 20 L10 21 M30 18 L34 17 M8 31 L11 29 M29 32 L33 34 M18 7 L19 10 M23 39 L22 36" stroke="#f4d488" stroke-width="1" stroke-linecap="round"/>
    <rect x="12.5" y="16" width="14" height="13" rx="1" fill="#9a7a52" transform="rotate(-8 20 23)"/>
    <path d="M13.5 19 L26 17.3 M14 22.5 L26.5 20.8 M14.4 26 L27 24.3 M16 16.5 L17.6 28.5 M20 16 L21.6 28 M24 15.4 L25.6 27.4" stroke="#6e5232" stroke-width="0.7"/>
    <path d="M4 23 Q12 21 20 23 T36 23 M20 5.5 Q18 14 20 23 T20 40.5" fill="none" stroke="#b8c0c6" stroke-width="1.1"/>
    <circle cx="20" cy="23" r="1.6" fill="#d8dee2"/>`,
  // Mate of the Dead: barrotes de la celda sobre la chapa de un catre, con el grillete colgando
  penal: `
    <rect x="5" y="5" width="30" height="36" rx="2.5" fill="#5a4a3e" stroke="#12100e" stroke-width="1.4"/>
    <path d="M7 9 L12 7 M28 38 L33 35 M8 30 L10 36" stroke="#8a5a34" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="5" y="11" width="30" height="3.4" fill="#7c868c"/>
    <rect x="5" y="31" width="30" height="3.4" fill="#7c868c"/>
    <g fill="#b4bec4" stroke="#2a2e32" stroke-width="0.6"><rect x="8.5" y="5" width="3.2" height="36"/><rect x="15" y="5" width="3.2" height="36"/><rect x="21.6" y="5" width="3.2" height="36"/><rect x="28.2" y="5" width="3.2" height="36"/></g>
    <circle cx="7.5" cy="12.7" r="1" fill="#2a2e32"/><circle cx="32.5" cy="12.7" r="1" fill="#2a2e32"/><circle cx="7.5" cy="32.7" r="1" fill="#2a2e32"/><circle cx="32.5" cy="32.7" r="1" fill="#2a2e32"/>
    <g fill="none" stroke="#d0d6da" stroke-width="1.5"><circle cx="30" cy="40.5" r="3.2"/><ellipse cx="25" cy="42" rx="2" ry="1.4"/></g>`,
  // Revelaciones Materas: la tapa de una pava de bronce, con su perilla y el cuero atrás
  torre: `
    <path d="M3.5 29 Q3 20 8 16 L32 16 Q37 20 36.5 29 Z" fill="#6a4524"/>
    <ellipse cx="20" cy="27" rx="17" ry="12.5" fill="#b8862e" stroke="#4a3208" stroke-width="1.3"/>
    <ellipse cx="20" cy="26" rx="13.5" ry="9.5" fill="#e2b24c"/>
    <ellipse cx="17" cy="23.5" rx="7" ry="3.8" fill="#f8dc8a" opacity="0.7"/>
    <ellipse cx="20" cy="26" rx="13.5" ry="9.5" fill="none" stroke="#8a6014" stroke-width="0.8"/>
    <rect x="17" y="13" width="6" height="11" rx="1.5" fill="#2e2016" stroke="#120a04" stroke-width="0.8"/>
    <ellipse cx="20" cy="13" rx="4.5" ry="2.2" fill="#3e2c1e" stroke="#120a04" stroke-width="0.8"/>
    <path d="M20 31 L21.2 33.6 L24 34 L21.2 34.4 L20 37 L18.8 34.4 L16 34 L18.8 33.6Z" fill="#fff1b8"/>`,
  // Der Mateendrache: escudo de caballero de algarrobo, umbo de bronce y filete de oro, con escarcha
  castillo: `
    <path d="M4 5 H36 V21 Q36 35 20 43 Q4 35 4 21 Z" fill="#6e4628" stroke="#e8c46a" stroke-width="2"/>
    <path d="M12 5.8 V38 M20 5.8 V42.5 M28 5.8 V38" stroke="#4a2c16" stroke-width="1"/>
    <path d="M6 9 Q9 7 13 8 M24 7 Q29 6.5 34 9" stroke="#e6f2ff" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>
    <circle cx="20" cy="21" r="6.4" fill="#9a6a2a" stroke="#e8c46a" stroke-width="1.2"/>
    <circle cx="20" cy="21" r="3.6" fill="#d8a04a"/>
    <circle cx="18.8" cy="19.8" r="1.3" fill="#fff0c0"/>
    <g fill="#e8c46a"><circle cx="8" cy="9" r="1.1"/><circle cx="32" cy="9" r="1.1"/><circle cx="8" cy="24" r="1.1"/><circle cx="32" cy="24" r="1.1"/><circle cx="20" cy="37" r="1.1"/></g>`,
  // Mate no Numa: cuero de yacaré estaqueado sobre una tabla de lapacho, cosido con tientos
  esteros: `
    <path d="M5 6 Q20 1.5 35 6 V29 Q35 39.5 20 44.5 Q5 39.5 5 29 Z" fill="#6a3e22" stroke="#140a04" stroke-width="1.4"/>
    <path d="M7 12 L9 11 M31 34 L33 31 M7 31 L8.5 35" stroke="#9a6440" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M9 9.5 Q20 6.5 31 9.5 V28.5 Q31 36.5 20 40.5 Q9 36.5 9 28.5 Z" fill="#474b2a" stroke="#23250f" stroke-width="0.8"/>
    <g fill="#6c6e3c" stroke="#23250f" stroke-width="0.6">
      <rect x="11.2" y="11.2" width="5.2" height="4.2" rx="1.6"/><rect x="17.4" y="10.6" width="5.2" height="4.2" rx="1.6"/><rect x="23.6" y="11.2" width="5.2" height="4.2" rx="1.6"/>
      <rect x="11.2" y="16.6" width="5.2" height="4.4" rx="1.6"/><rect x="17.4" y="16.4" width="5.2" height="4.4" rx="1.6"/><rect x="23.6" y="16.6" width="5.2" height="4.4" rx="1.6"/>
      <rect x="11.2" y="22.2" width="5.2" height="4.4" rx="1.6"/><rect x="17.4" y="22" width="5.2" height="4.4" rx="1.6"/><rect x="23.6" y="22.2" width="5.2" height="4.4" rx="1.6"/>
      <rect x="11.6" y="27.8" width="5" height="4" rx="1.6"/><rect x="17.4" y="27.6" width="5.2" height="4.2" rx="1.6"/><rect x="23.4" y="27.8" width="5" height="4" rx="1.6"/>
      <rect x="15" y="33" width="4.4" height="3.6" rx="1.4"/><rect x="20.6" y="33" width="4.4" height="3.6" rx="1.4"/>
    </g>
    <path d="M13.8 12 V14.6 M20 11.4 V14 M26.2 12 V14.6 M13.8 17.4 V20.2 M20 17.2 V20 M26.2 17.4 V20.2 M13.8 23 V25.8 M20 22.8 V25.6 M26.2 23 V25.8" stroke="#9a9a5c" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M9 9.5 Q20 6.5 31 9.5 V28.5 Q31 36.5 20 40.5 Q9 36.5 9 28.5 Z" fill="none" stroke="#dcc48e" stroke-width="1.3" stroke-dasharray="1.8 2.2"/>`,
};

// Las rajaduras: la primera a los dos tercios del aguante, la segunda al tercio.
export const SHIELD_CRACKS = `
  <path class="c1" d="M21 4 L18 12 L22.5 16 L17.5 24 L20 28"/>
  <path class="c2" d="M36 17 L29 21.5 L31 26 L24.5 31 M5 28 L11.5 27 L10 33 L15 36"/>`;

// ---------------- las piezas (24x24, de línea: toman el color del tema) ----------------
export const PART_ICONS = {
  // tapa de olla / de pava
  tapa: '<path d="M3 16 Q12 5 21 16 Z"/><path d="M2 16.5 H22"/><rect x="10" y="5" width="4" height="3.2" rx="1"/>',
  // cuero estaqueado
  cuero: '<path d="M5 5 Q9 7 12 5 Q15 7 19 5 Q18 9 20 12 Q18 15 19 19 Q15 17 12 19 Q9 17 5 19 Q6 15 4 12 Q6 9 5 5Z"/><path d="M9 11 Q12 9 15 11"/>',
  // tientos y hebilla
  tientos: '<path d="M4 8 Q12 3 20 8 Q12 13 4 8Z"/><path d="M4 14 Q12 9 20 14 Q12 19 4 14"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M18 16 V21"/>',
  // atado de paja
  paja: '<path d="M6 21 L10 3 M9 21 L11 3 M12 21 L12 3 M15 21 L13 3 M18 21 L14 3"/><path d="M7.5 12 H16.5" stroke-width="2.4"/>',
  // arpillera de bolsa
  arpillera: '<path d="M6 7 Q12 4 18 7 L19 20 Q12 22 5 20 Z"/><path d="M7 11 L18 10 M6.5 15 L18.5 14 M10 6 L10 21 M14 5.8 L14.4 21"/><path d="M9 5.5 Q12 2 15 5.5"/>',
  // rollo de alambre
  alambre: '<ellipse cx="12" cy="12" rx="8" ry="8"/><ellipse cx="12" cy="12" rx="5" ry="5"/><ellipse cx="12" cy="12" rx="2" ry="2"/><path d="M20 12 L23 16"/>',
  // barrote suelto
  barrote: '<path d="M8 2 V22 M16 2 V22"/><path d="M5 7 H19 M5 17 H19"/>',
  // grillete con cadena
  grillete: '<path d="M4 9 Q4 3 10 3 Q16 3 16 9 V13 H4Z"/><ellipse cx="17" cy="17" rx="2.6" ry="2"/><ellipse cx="21" cy="21" rx="2.6" ry="2"/><path d="M12 13 L15 16"/>',
  // chapa de catre
  chapa: '<rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="6" cy="9" r="0.9"/><circle cx="18" cy="9" r="0.9"/><circle cx="6" cy="15" r="0.9"/><circle cx="18" cy="15" r="0.9"/><path d="M9 10 L14 13"/>',
  // correa de rebenque
  correa: '<path d="M3 20 L7 16"/><rect x="5" y="13" width="4" height="4" rx="1" transform="rotate(45 7 15)"/><path d="M9 13 Q13 6 16 10 T21 4"/>',
  // tabla de algarrobo
  tabla: '<rect x="6" y="2.5" width="12" height="19" rx="1"/><path d="M9 5 Q11 10 9 15 T10 20 M14 4 Q12 9 14.5 13"/>',
  // umbo de bronce
  umbo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="10.5" cy="10.5" r="1.2"/><path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21"/>',
  // correas de cuero con hebilla
  correas: '<path d="M3 8 H21 M3 12 H21"/><path d="M3 16 H21 M3 20 H21"/><rect x="9" y="6" width="5" height="8" rx="1"/><rect x="11" y="14" width="5" height="8" rx="1"/>',
};

// Nombre corto de cada pieza, para la tarjeta.
export const PART_SHORT = {
  tapa: 'Tapa',
  cuero: 'Cuero',
  tientos: 'Tientos',
  paja: 'Paja',
  arpillera: 'Arpillera',
  alambre: 'Alambre',
  barrote: 'Barrote',
  grillete: 'Grillete',
  chapa: 'Chapa',
  correa: 'Correa',
  tabla: 'Tabla',
  umbo: 'Umbo',
  correas: 'Correas',
};

export const partIcon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PART_ICONS[id] || '<circle cx="12" cy="12" r="7"/>'}</svg>`;

// ---------------- gaucho life (el penal) ----------------
// El alma: una llama azul con dos ojos.
export const SOUL_ICON = `<svg viewBox="0 0 32 40" aria-hidden="true">
  <path class="mdu-vida__halo" d="M16 2 Q25 12 26 22 Q27 35 16 38 Q5 35 6 22 Q7 12 16 2Z"/>
  <path d="M16 6 Q23 14 23.5 23 Q24 33 16 35 Q8 33 8.5 23 Q9 17 13 12 Q13 18 16 19 Q14 12 16 6Z"/>
  <ellipse class="mdu-vida__eye" cx="13" cy="25" rx="1.4" ry="2"/><ellipse class="mdu-vida__eye" cx="19" cy="25" rx="1.4" ry="2"/>
</svg>`;
// Cada carga es una vela de ánimas: prendida (llama azul) o apagada (con humito).
export const CANDLE_ICON = `<svg viewBox="0 0 16 32" aria-hidden="true">
  <path class="mdu-vida__smoke" d="M8 12 Q6 8 8.5 6 Q10.5 4 8 1"/>
  <path class="mdu-vida__flame" d="M8 3 Q11.5 8 11 11 Q10.5 14 8 14 Q5.5 14 5 11 Q4.5 8 8 3Z"/>
  <path class="mdu-vida__wick" d="M8 14 V16"/>
  <rect class="mdu-vida__wax" x="4" y="16" width="8" height="13" rx="1"/>
  <path class="mdu-vida__drip" d="M5 16 Q5 20 6 19 Q6.5 17 7.5 16"/>
  <rect class="mdu-vida__plate" x="2" y="29" width="12" height="2" rx="1"/>
</svg>`;
