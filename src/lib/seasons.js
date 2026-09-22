// Temporadas decorativas. Cada una tiene un rango por defecto; el admin puede
// forzarla (on/off) o definir un rango propio (custom, formato MM-DD).

// Domingo de Pascua (algoritmo anónimo gregoriano).
export const easterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const md = (date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const SEASONS = {
  navidad: {
    name: 'Navidad y Año Nuevo',
    emoji: '🎄',
    description: 'Nieve suave y guirnalda de luces en la barra superior.',
    defaultRange: () => ({ from: '12-01', to: '01-06' }),
    defaultText: '1 de diciembre → 6 de enero (Reyes)',
  },
  carnaval: {
    name: 'Carnaval',
    emoji: '🎭',
    description: 'Papelitos de colores cayendo y serpentinas.',
    // Desde el viernes previo hasta el miércoles de ceniza.
    defaultRange: (year) => {
      const easter = easterSunday(year);
      return { from: md(addDays(easter, -51)), to: md(addDays(easter, -46)) };
    },
    defaultText: 'Viernes previo → Miércoles de ceniza (se calcula cada año)',
  },
  pascua: {
    name: 'Pascuas',
    emoji: '🐣',
    description: 'Huevitos de pascua y un conejo que se asoma.',
    // Semana Santa: Domingo de Ramos hasta el lunes posterior.
    defaultRange: (year) => {
      const easter = easterSunday(year);
      return { from: md(addDays(easter, -7)), to: md(addDays(easter, 1)) };
    },
    defaultText: 'Domingo de Ramos → Lunes de Pascua (se calcula cada año)',
  },
  patrio: {
    name: 'Fechas patrias',
    emoji: '🇦🇷',
    description: 'Escarapela junto al logo y cinta celeste y blanca.',
    // Día de la Escarapela (18/5) hasta el 25 de Mayo, y el 9 de Julio.
    dates: ['05-18', '05-19', '05-20', '05-21', '05-22', '05-23', '05-24', '05-25', '07-09'],
    defaultRange: () => null,
    defaultText: '18 al 25 de mayo (Escarapela → Revolución de Mayo) y 9 de julio',
  },
};

const inRange = (today, from, to) =>
  from <= to ? today >= from && today <= to : today >= from || today <= to; // cruza año

export const isSeasonActive = (key, config = {}, date = new Date()) => {
  const season = SEASONS[key];
  const mode = config.mode ?? 'auto';
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  const today = md(date);
  if (mode === 'custom' && config.from && config.to) return inRange(today, config.from, config.to);
  if (season.dates) return season.dates.includes(today);
  const range = season.defaultRange(date.getFullYear());
  return range ? inRange(today, range.from, range.to) : false;
};

export const activeSeasons = (seasonsConfig = {}, date = new Date()) =>
  Object.keys(SEASONS).filter((k) => isSeasonActive(k, seasonsConfig[k], date));
