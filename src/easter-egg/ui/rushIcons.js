// Los dibujos de las cartas nuevas del rush de jefes (core/rushCards.js:
// mejoras, prismáticas, habilidades y su recarga) y del medallón de la
// habilidad en el HUD (core/rushBuild.js). Mismo estilo que el chambergo y los
// ponchos de ui/RushCards.js: planos, de trazo oscuro, colores de campo.
const O = 'stroke="#120a04" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
// una mira (para los de puntería)
const mira = (c = '#e8e0cc') => `<circle cx="32" cy="32" r="17" fill="none" stroke="${c}" stroke-width="3.2"/><path d="M32 8 V20 M32 44 V56 M8 32 H20 M44 32 H56" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`;
// el reloj de la recarga de la habilidad (n flechas)
const reloj = (n) =>
  svg(`<circle cx="32" cy="34" r="20" fill="#2a3a4a" ${O}/><circle cx="32" cy="34" r="15" fill="#e8e0cc"/>
  <path d="M32 34 V23 M32 34 L40 38" stroke="#120a04" stroke-width="3" stroke-linecap="round"/>
  ${n > 1 ? '<path d="M8 22 A26 26 0 0 1 22 9" fill="none" stroke="#5fd0ff" stroke-width="4" stroke-linecap="round"/><path d="M19 4 L24 10 L16 13 Z" fill="#5fd0ff"/>' : ''}
  <path d="M56 22 A26 26 0 0 0 42 9" fill="none" stroke="#5fd0ff" stroke-width="4" stroke-linecap="round"/><path d="M45 4 L40 10 L48 13 Z" fill="#5fd0ff"/>`);

export const RUSH_ICONS = {
  // ---- mejoras ----
  // el cuerno de pólvora con su chispa
  polvora: svg(`<g transform="translate(-3 -6) scale(1.2)"><path d="M10 20 C24 18 44 26 52 44 L44 50 C36 36 24 30 12 30 Z" fill="#d8c08a" ${O}/>
    <path d="M20 21 L22 30 M30 23 L31 32 M40 29 L38 37" stroke="#8a6a3a" stroke-width="2"/>
    <rect x="43" y="44" width="12" height="8" rx="2" transform="rotate(-38 49 48)" fill="#6a4a2a" ${O}/>
    <path d="M10 20 L6 17 L8 25 L4 28 L12 30 Z" fill="#ffb030" ${O}/><circle cx="6" cy="14" r="2.4" fill="#ffe070"/></g>`),
  // la cabeza en la mira
  bocho: svg(`<circle cx="32" cy="30" r="13" fill="#9aa58a" ${O}/><circle cx="27" cy="28" r="2.5" fill="#120a04"/><circle cx="37" cy="28" r="2.5" fill="#120a04"/>
    <path d="M26 37 Q32 34 38 37" fill="none" stroke="#120a04" stroke-width="2"/>${mira('#e3262c')}`),
  // la herradura del domador
  domador: svg(`<path d="M16 54 L16 30 C16 14 48 14 48 30 L48 54 L38 54 L38 31 C38 24 26 24 26 31 L26 54 Z" fill="#b0b4bc" ${O}/>
    <circle cx="21" cy="46" r="1.8" fill="#120a04"/><circle cx="21" cy="36" r="1.8" fill="#120a04"/><circle cx="43" cy="46" r="1.8" fill="#120a04"/><circle cx="43" cy="36" r="1.8" fill="#120a04"/>
    <path d="M22 8 L26 15 L32 6 L38 15 L42 8 L41 18 L23 18 Z" fill="#ffc640" ${O}/>`),
  // la pava que ceba ligero
  cebador: svg(`<path d="M18 30 C18 22 46 22 46 30 L48 50 C48 56 16 56 16 50 Z" fill="#9a9ea8" ${O}/>
    <path d="M24 22 C24 14 40 14 40 22" fill="none" stroke="#120a04" stroke-width="3.5"/>
    <path d="M46 34 L58 26 L56 31 L48 40 Z" fill="#9a9ea8" ${O}/><path d="M4 36 H12 M2 44 H11 M5 52 H12" stroke="#5fd0ff" stroke-width="3" stroke-linecap="round"/>`),
  // tres balas apuradas
  dedo: svg(`<g ${O}><path d="M14 18 H34 C40 18 44 22 44 22 C44 22 40 26 34 26 H14 Z" fill="#d8a040"/><path d="M20 30 H40 C46 30 50 34 50 34 C50 34 46 38 40 38 H20 Z" fill="#d8a040"/><path d="M14 42 H34 C40 42 44 46 44 46 C44 46 40 50 34 50 H14 Z" fill="#d8a040"/></g>
    <path d="M4 22 H10 M8 34 H15 M4 46 H10" stroke="#ff8a3a" stroke-width="3" stroke-linecap="round"/>`),
  // la mira quieta con el pulso plano
  pulso: svg(`${mira()}<path d="M12 32 H24 L27 27 L30 37 L33 32 H52" fill="none" stroke="#5fd06a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`),
  // la alpargata
  alpargata: svg(`<path d="M8 46 C8 40 10 33 15 31 C19 35 25 36 30 33 C41 29 53 35 58 45 Z" fill="#2a4a7a" ${O}/>
    <path d="M15 31 C19 35 25 36 30 33" fill="none" stroke="#e8e0cc" stroke-width="2"/>
    <path d="M32 36 C40 34 48 37 54 42" fill="none" stroke="#e8e0cc" stroke-width="1.6" stroke-dasharray="2.5 2.5"/>
    <path d="M6 45 H59 C59 50 56 53 50 53 H13 C8 53 6 50 6 45 Z" fill="#d8c08a" ${O}/>
    <path d="M12 47 L14 51 M18 47 L20 51 M24 47 L26 51 M30 47 L32 51 M36 47 L38 51 M42 47 L44 51 M48 47 L50 51" stroke="#8a6a3a" stroke-width="1.6"/>
    <path d="M2 24 H14 M6 16 H18" stroke="#5fd0ff" stroke-width="3" stroke-linecap="round"/>`),
  // los chorizos y la morcilla
  achuras: svg(`<path d="M4 44 H60 M4 51 H60 M4 58 H60" stroke="#4a4a52" stroke-width="3" stroke-linecap="round"/>
    <rect x="6" y="16" width="44" height="14" rx="7" transform="rotate(-14 28 23)" fill="#b0402a" ${O}/>
    <rect x="12" y="31" width="44" height="14" rx="7" transform="rotate(-14 34 38)" fill="#8a2a1e" ${O}/>
    <path d="M18 22 L22 30 M28 20 L32 28 M38 18 L42 26 M24 37 L28 45 M34 35 L38 43 M44 33 L48 41" stroke="#3a120a" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 21 C14 19 18 18 22 18" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M54 4 V16 M48 10 H60" stroke="#5fd06a" stroke-width="4.5" stroke-linecap="round"/>`),
  // el mate que da otra vuelta (y vuelven balas)
  vuelta: svg(`<path d="M20 30 C14 42 18 54 32 56 C46 54 50 42 44 30 Z" fill="#6a4020" ${O}/><rect x="19" y="25" width="26" height="6" rx="2" fill="#d8d4c4" ${O}/>
    <path d="M12 22 A22 22 0 0 1 48 10" fill="none" stroke="#ffc640" stroke-width="4" stroke-linecap="round"/><path d="M46 3 L54 11 L44 15 Z" fill="#ffc640"/>
    <path d="M26 38 H38 M26 44 H38" stroke="#d8a040" stroke-width="3" stroke-linecap="round"/>`),
  // la cañita voladora
  canita: svg(`<path d="M10 58 L34 26" stroke="#c8a060" stroke-width="3" stroke-linecap="round"/><path d="M30 30 L42 14 L50 20 L38 36 Z" fill="#c8302a" ${O}/>
    <path d="M42 14 L48 6 L50 20 Z" fill="#e8e0cc" ${O}/><path d="M30 30 L24 40 M33 34 L28 44" stroke="#ffb030" stroke-width="3" stroke-linecap="round"/>
    <circle cx="52" cy="40" r="2.5" fill="#ffe070"/><circle cx="56" cy="30" r="2" fill="#ffb030"/><circle cx="46" cy="48" r="1.8" fill="#ffe070"/>`),
  // el paquete de yerba
  bolsa: svg(`<path d="M16 14 H48 L50 56 H14 Z" fill="#e8d8a8" ${O}/><path d="M16 14 L20 8 H44 L48 14" fill="#c8b880" ${O}/>
    <rect x="18" y="26" width="28" height="18" fill="#2a6a2a" ${O}/><path d="M32 30 C26 34 26 40 32 42 C38 40 38 34 32 30 Z" fill="#8ad06a"/><path d="M32 31 V42" stroke="#2a6a2a" stroke-width="1.4"/>
    <path d="M50 6 V16 M45 11 H55" stroke="#ffc640" stroke-width="4" stroke-linecap="round"/>`),
  // el cuero de vaca estaqueado
  cuero: svg(`<path d="M14 12 L24 16 L32 10 L40 16 L50 12 L48 26 L54 34 L48 42 L50 54 L38 50 L32 56 L26 50 L14 54 L16 42 L10 34 L16 26 Z" fill="#e8e0cc" ${O}/>
    <path d="M22 24 C26 20 32 24 28 30 C24 34 18 30 22 24 Z M36 32 C42 30 46 36 42 40 C38 44 32 38 36 32 Z M28 42 C30 40 34 42 32 46 C30 48 26 46 28 42 Z" fill="#3a2614"/>`),
  // el mate cocido humeando, con su cruz verde
  cocido: svg(`<path d="M14 30 H46 V46 C46 54 40 56 30 56 C20 56 14 54 14 46 Z" fill="#c8b8a0" ${O}/><path d="M46 34 C56 34 56 46 46 46" fill="none" stroke="#120a04" stroke-width="3"/>
    <path d="M14 30 H46 V34 H14 Z" fill="#8a5a2a"/><path d="M22 24 C18 18 26 14 22 8 M32 24 C28 18 36 14 32 8" fill="none" stroke="#e8e0cc" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M50 8 V20 M44 14 H56" stroke="#5fd06a" stroke-width="4.5" stroke-linecap="round"/>`),
  // el facón contra la piedra
  afilar: svg(`<rect x="8" y="42" width="48" height="12" rx="3" fill="#7a7e88" ${O}/><path d="M12 42 L52 42" stroke="#9aa0aa" stroke-width="2"/>
    <path d="M14 36 L46 18 L52 16 L48 22 L18 40 Z" fill="#dfe4ea" ${O}/><path d="M46 18 L56 10" stroke="#5a3a1a" stroke-width="6" stroke-linecap="round"/>
    <path d="M20 38 L16 30 M24 40 L24 32 M16 40 L10 36" stroke="#ffd060" stroke-width="2.4" stroke-linecap="round"/>`),
  // ---- las prismáticas ----
  // los cuernos del Mandinga sobre su fuego
  pacto: svg(`<path d="M20 58 C8 48 16 36 22 30 C22 40 28 40 28 34 C28 26 34 22 32 14 C42 22 50 34 46 46 C44 52 40 56 34 58 Z" fill="#ff7a2a" ${O}/>
    <path d="M26 54 C22 48 26 42 30 40 C32 46 36 44 36 40 C42 46 40 52 36 56 Z" fill="#ffd040"/>
    <path d="M10 6 C10 18 16 24 24 24 C18 20 16 14 18 8 Z M54 6 C54 18 48 24 40 24 C46 20 48 14 46 8 Z" fill="#c81a1a" ${O}/>`),
  // el gato negro (siete vidas)
  gato: svg(`<path d="M12 12 L24 22 C28 20 36 20 40 22 L52 12 L50 32 C52 46 44 54 32 54 C20 54 12 46 14 32 Z" fill="#1a1a22" stroke="#e8e0cc" stroke-width="2" stroke-linejoin="round"/>
    <path d="M22 34 C24 30 28 30 30 34 C28 36 24 36 22 34 Z M34 34 C36 30 40 30 42 34 C40 36 36 36 34 34 Z" fill="#ffd040"/><path d="M30 42 L32 44 L34 42" fill="none" stroke="#e8a0a0" stroke-width="2"/>
    <path d="M10 42 H20 M10 46 H20 M44 42 H54 M44 46 H54" stroke="#e8e0cc" stroke-width="1.4"/>`),
  // la gota de sangre que hierve
  sangre: svg(`<path d="M32 6 C40 20 50 30 50 42 C50 52 42 58 32 58 C22 58 14 52 14 42 C14 30 24 20 32 6 Z" fill="#b01818" ${O}/>
    <path d="M24 40 C24 34 28 30 30 26" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 54 C26 50 28 44 32 40 C34 44 38 44 38 48 C38 52 36 54 32 54 Z" fill="#ffb030"/>`),
  // la última bala, dorada
  ultima: svg(`<path d="M24 56 V30 C24 18 32 8 32 8 C32 8 40 18 40 30 V56 Z" fill="#ffc640" ${O}/><rect x="22" y="44" width="20" height="12" rx="1.5" fill="#d8a040" ${O}/>
    <path d="M28 28 C28 22 30 18 32 14" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M8 18 L14 22 M56 18 L50 22 M6 34 H14 M58 34 H50" stroke="#ffe070" stroke-width="3" stroke-linecap="round"/><text x="32" y="54" text-anchor="middle" fill="#120a04" font-size="9" font-weight="700" font-family="system-ui">x4</text>`),
  // el viento zonda
  zonda: svg(`<path d="M6 22 H40 C48 22 50 12 44 10 C40 9 37 12 38 15" fill="none" stroke="#e8d8a8" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M4 34 H50 C58 34 60 46 52 48 C47 49 44 45 46 42" fill="none" stroke="#e8d8a8" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M10 46 H30 C36 46 38 54 32 56" fill="none" stroke="#c8a060" stroke-width="4" stroke-linecap="round"/><circle cx="54" cy="18" r="2" fill="#c8a060"/><circle cx="58" cy="28" r="1.6" fill="#c8a060"/>`),
  // (core/rushPrisma.js) el Heredero del caos: la guadaña de Eclipse delante
  // del rasgón violeta, con sus estrellas
  heredero: svg(`<path d="M44 4 L37 17 L46 25 L33 37 L41 44 L30 60 L22 60 L32 45 L24 37 L37 25 L29 17 L35 4 Z" fill="#1a0b2e" stroke="#b46cff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M38 8 L35 16 L41 23 L32 33" fill="none" stroke="#e0b8ff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
    <path d="M12 60 L44 10" stroke="#120a04" stroke-width="6.5" stroke-linecap="round"/><path d="M12 60 L44 10" stroke="#3a2a52" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M43 11 C30 3 12 7 4 22 C14 15 27 14 38 19 Z" fill="#b46cff" ${O}/><path d="M38 12 C28 8 17 10 10 17" fill="none" stroke="#f0dcff" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="44" cy="10" r="3" fill="#ffc640" ${O}/><circle cx="54" cy="36" r="1.8" fill="#ffe070"/><circle cx="50" cy="50" r="1.4" fill="#e0b8ff"/><circle cx="20" cy="40" r="1.4" fill="#e0b8ff"/>`),
  // el Resurgir del mate: el mate que larga la luz para arriba, con sus hojas
  resurgir: svg(`<path d="M32 4 L36 20 L48 8 L42 24 L58 20 L44 30 H20 L6 20 L22 24 L16 8 L28 20 Z" fill="#ffd040" stroke="#120a04" stroke-width="1.6" stroke-linejoin="round" opacity=".95"/>
    <path d="M20 34 C14 44 18 56 32 58 C46 56 50 44 44 34 Z" fill="#5a8a2a" ${O}/><rect x="19" y="29" width="26" height="6" rx="2" fill="#d8d4c4" ${O}/>
    <path d="M38 30 L46 12" stroke="#c8c8d0" stroke-width="3" stroke-linecap="round"/><path d="M38 30 L46 12" stroke="#120a04" stroke-width="1" stroke-linecap="round" opacity=".5"/>
    <path d="M26 46 L32 40 L38 46 M26 53 L32 47 L38 53" fill="none" stroke="#e8ffb0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 44 C4 38 8 32 14 34 C14 40 12 42 8 44 Z M56 44 C60 38 56 32 50 34 C50 40 52 42 56 44 Z" fill="#8ad06a" stroke="#120a04" stroke-width="1.4"/>`),
  // ---- las habilidades ----
  // el pique: la flecha con su polvareda
  pique: svg(`<path d="M22 22 H40 V12 L58 32 L40 52 V42 H22 Z" fill="#5fd0ff" ${O}/>
    <path d="M4 22 H16 M2 32 H18 M4 42 H16" stroke="#e8e0cc" stroke-width="3.2" stroke-linecap="round"/><circle cx="10" cy="52" r="5" fill="#a89878" opacity=".8"/><circle cx="18" cy="56" r="3.5" fill="#a89878" opacity=".7"/>`),
  // el rebenque y su chasquido
  rebencazo: svg(`<path d="M8 56 L22 42" stroke="#5a3a1a" stroke-width="7" stroke-linecap="round"/><path d="M8 56 L22 42" stroke="#c8a060" stroke-width="2" stroke-dasharray="3 3"/>
    <path d="M22 42 C30 30 26 18 40 14 C48 12 52 18 50 24" fill="none" stroke="#3a2614" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M50 24 L58 20 M50 24 L58 30 M50 24 L54 34 M50 24 L46 34" stroke="#ffe070" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="24" r="3" fill="#fff"/>`),
  // la humareda
  humareda: svg(`<g fill="#9aa0a8" ${O}><circle cx="22" cy="40" r="12"/><circle cx="40" cy="38" r="14"/><circle cx="30" cy="24" r="11"/><circle cx="48" cy="24" r="8"/></g>
    <g fill="#c8ccd2"><circle cx="22" cy="38" r="7"/><circle cx="40" cy="35" r="8"/><circle cx="30" cy="22" r="6"/></g><path d="M10 54 H54" stroke="#120a04" stroke-width="2" stroke-linecap="round"/>`),
  // el payé: la bolsita del amuleto, con su brillo
  paye: svg(`<path d="M22 8 C26 16 38 16 42 8" fill="none" stroke="#3a2614" stroke-width="2.4"/>
    <path d="M24 22 C14 30 14 50 32 56 C50 50 50 30 40 22 Z" fill="#7a3a8a" ${O}/><path d="M24 22 H40 L38 16 H26 Z" fill="#c8a060" ${O}/>
    <path d="M32 30 L35 38 L43 38 L37 43 L39 51 L32 46 L25 51 L27 43 L21 38 L29 38 Z" fill="#ffd040" stroke="#120a04" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8 28 L14 30 M56 28 L50 30 M10 46 L16 44 M54 46 L48 44" stroke="#ffe070" stroke-width="2.6" stroke-linecap="round"/>`),
  // el escudo mejorado (core/rushCards.js RAROS.escudo): de cuero sobre tabla,
  // con remaches, el borde de hierro y la estrella de la mejora
  escudo: svg(`<path d="M32 6 L54 13 C54 34 46 50 32 58 C18 50 10 34 10 13 Z" fill="#7a7e88" ${O}/>
    <path d="M32 12 L48 17 C48 33 42 45 32 51 C22 45 16 33 16 17 Z" fill="#8a5a2e" ${O}/>
    <path d="M32 12 V51 M17 27 H47" stroke="#5a3a1a" stroke-width="2"/>
    <g fill="#d8d4c4" stroke="#120a04" stroke-width="1"><circle cx="20" cy="19" r="1.8"/><circle cx="44" cy="19" r="1.8"/><circle cx="22" cy="38" r="1.8"/><circle cx="42" cy="38" r="1.8"/><circle cx="32" cy="47" r="1.8"/></g>
    <path d="M32 21 L34.6 27.4 L41.4 27.6 L36 31.8 L38 38.4 L32 34.6 L26 38.4 L28 31.8 L22.6 27.6 L29.4 27.4 Z" fill="#ffd040" stroke="#120a04" stroke-width="1.4" stroke-linejoin="round"/>`),
  // la recarga más corta
  resuello: reloj(1),
  aire: reloj(2),
};
