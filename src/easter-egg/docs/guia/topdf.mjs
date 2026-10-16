import { chromium } from 'playwright';
// La guía de los easter eggs: guia.html → PDF (A4, con número de página). El
// menú del juego (ui/Menus.js) baja public/assets/sotano/guia-easter-eggs.pdf:
// si cambia un easter egg, se corrige guia.html y se vuelve a generar.
// Necesita playwright, que no está en el package.json del sitio: se copian
// guia.html y este script a una carpeta con playwright instalado
// (npm i playwright) y se corre ahí, con la ruta completa del PDF de salida.
// uso: node <esta carpeta>/topdf.mjs <raíz>/public/assets/sotano/guia-easter-eggs.pdf
// --comercial: la de la versión de escritorio (core/edicion.js), sin los nombres de
// Call of Duty: sin la columna "Perk" y cada perk por su paquete de yerba
// (public/assets/sotano/guia-easter-eggs-escritorio.pdf)
const COM = process.argv.includes('--comercial');
const [out, png] = process.argv.slice(2).filter((a) => a !== '--comercial');
const YERBA = { 'Quick Revive': 'Rosamorte', Juggernog: 'Taragüerno', 'Speed Cola': 'Rapidito', 'Double Tap': 'Doble Cruz', 'Mule Kick': 'Mulanda', 'Deadshot Daiquiri': 'Nadarias', 'PhD Flopper': 'Flopa Hermanos', 'Electric Cherry': 'Chisporé', 'Stamin-Up': 'Trotadora', 'Dying Wish': 'Extremaunión' };
const src = new URL('./guia.html', import.meta.url).href;
const b = await chromium.launch({ headless: true });
const kill = setTimeout(async () => { console.log('TIMEOUT'); try { await b.close(); } catch {} process.exit(2); }, 60000);
try {
  const p = await b.newPage();
  await p.goto(src, { waitUntil: 'load' });
  if (COM)
    await p.evaluate((Y) => {
      for (const row of document.querySelectorAll('table.perks tr')) row.children[1]?.remove();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const re = new RegExp(Object.keys(Y).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        let t = n.nodeValue.replace('Flopa Hermanos/PhD', 'Flopa Hermanos').replace(re, (m) => Y[m]);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
    }, YERBA);
  await p.emulateMedia({ media: 'print' });
  await p.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:8px Segoe UI,Arial,sans-serif;color:#8a7e70;padding:0 15mm;display:flex;justify-content:space-between"><span>Mate der Untoten · Guía de los easter eggs</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
  if (png) {
    await p.setViewportSize({ width: 800, height: 1100 });
    await p.screenshot({ path: png, fullPage: false });
  }
  console.log('ok', out);
} finally {
  clearTimeout(kill);
  await b.close();
}
