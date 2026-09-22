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

export const whatsappLink = (text = '') =>
  `https://wa.me/${SITE.whatsappNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
