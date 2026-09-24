export const SITE = {
  name: 'Ley Matera',
  city: 'Rosario, Santa Fe',
  whatsappDisplay: '341 611 1209',
  // Formato internacional para wa.me: 54 + 9 + código de área sin 0 + número sin 15
  whatsappNumber: '5493416111209',
  instagramUrl: 'https://www.instagram.com/leymatera.rosario',
  instagramHandle: '@leymatera.rosario',
  email: 'leymaterarosario@gmail.com',
};

export const whatsappLink = (text = '', number = SITE.whatsappNumber) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// Número cargado en Admin → Editar (settings.whatsapp = { display }), o el de siempre.
// Se escribe como en Argentina ("341 611 1209"); para wa.me se le saca el 0 del
// código de área y se le agrega el 549 adelante.
export const whatsappNumberFrom = (display) => {
  let d = String(display ?? '').replace(/\D/g, '');
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) return `549${d.slice(2)}`;
  d = d.replace(/^0/, '');
  return d.length === 10 ? `549${d}` : '';
};

export const whatsappFrom = (saved) => {
  const number = whatsappNumberFrom(saved?.display);
  return number
    ? { display: saved.display.trim(), number }
    : { display: SITE.whatsappDisplay, number: SITE.whatsappNumber };
};
