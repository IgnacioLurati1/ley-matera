const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export const money = (n) => ars.format(Number(n) || 0);

export const todayISO = () => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
};

// Normaliza para búsquedas: minúsculas y sin tildes.
export const normalize = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
