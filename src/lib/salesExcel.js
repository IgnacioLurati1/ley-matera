import { isPaid } from '../context/OrdersContext';
import { todayISO } from './format';

// Exporta las ventas a .xlsx con el formato de la planilla "VENTAS ! :)":
// PRODUCTO | $ PRODUCTO | CLIENTE | SEÑA | $ SEÑA | A PAGAR | ¿PAGÓ? | GANANCIA
// A PAGAR y GANANCIA quedan como fórmulas, así la planilla se puede seguir
// completando a mano. exceljs se carga sólo al exportar.
const GREEN = 'FF93C47D';
const LIGHT = 'FFD9EAD3';
const BORDER = 'FF6AA84F';
const CHIP = 'FF1E7B46';
const MONEY = '"$"#,##0.00';
const EXTRA_ROWS = 15; // filas vacías con fórmulas para seguir cargando a mano

const HEADERS = ['PRODUCTO', '$ PRODUCTO', 'CLIENTE', 'SEÑA', '$ SEÑA', 'A PAGAR', '¿PAGÓ?', 'GANANCIA'];
const WIDTHS = [48, 15, 34, 13, 15, 15, 13, 16];

export async function exportSalesExcel(orders) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ventas', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = WIDTHS.map((width) => ({ width }));

  const border = { style: 'thin', color: { argb: BORDER } };
  const borders = { top: border, left: border, bottom: border, right: border };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = 'VENTAS ! :)';
  title.font = { name: 'Montserrat', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  title.fill = fill(GREEN);
  title.border = borders;
  ws.getRow(1).height = 28;

  const head = ws.getRow(2);
  head.values = HEADERS;
  head.height = 20;
  head.eachCell((c) => {
    c.font = { name: 'Montserrat', size: 10, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = fill(GREEN);
    c.border = borders;
  });

  const rows = [
    ...orders.map((o) => ({
      product: o.description || '',
      price: o.price,
      client: o.client || '',
      sena: o.deposit > 0 ? 'SI' : '',
      deposit: o.deposit > 0 ? o.deposit : null,
      paid: isPaid(o) ? 'SI' : '',
    })),
    ...Array.from({ length: EXTRA_ROWS }, () => ({ product: '', price: null, client: '', sena: '', deposit: null, paid: '' })),
  ];

  rows.forEach((r, i) => {
    const n = i + 3;
    const row = ws.getRow(n);
    const aPagar = (r.price ?? 0) - (r.deposit ?? 0);
    row.values = [
      r.product,
      r.price,
      r.client,
      r.sena,
      r.deposit,
      { formula: `B${n}-E${n}`, result: aPagar },
      r.paid,
      { formula: `IF(G${n}="SI",B${n},"FALTA PAGAR")`, result: r.paid === 'SI' ? r.price : 'FALTA PAGAR' },
    ];
    for (let col = 1; col <= 8; col += 1) {
      const c = row.getCell(col);
      c.font = { name: 'Montserrat', size: 10 };
      c.fill = fill(LIGHT);
      c.border = borders;
      c.alignment = { vertical: 'middle', wrapText: col === 1 || col === 3 };
    }
    [2, 5, 6, 8].forEach((col) => {
      row.getCell(col).numFmt = MONEY;
      row.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    });
    [4, 7].forEach((col) => {
      const c = row.getCell(col);
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"SI,NO"'] };
    });
  });

  // Los "SI" se pintan como los chips verdes de la planilla original.
  const last = rows.length + 2;
  ws.addConditionalFormatting({
    ref: `D3:D${last} G3:G${last}`,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"SI"'],
        style: { fill: fill(CHIP), font: { color: { argb: 'FFFFFFFF' }, bold: true } },
      },
    ],
  });

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `ventas-ley-matera-${todayISO()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
