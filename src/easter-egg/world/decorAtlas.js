import * as THREE from 'three';
import { rng } from '../core/noise';

// Atlas de 4x4 carteles, cuadros y pintadas (512 px cada uno), pintados en
// canvas. Un solo material para todos, así se fusionan en una llamada.

const S = 512;
export const ATLAS = {
  tareferos: 0,
  carpincho: 1,
  tranquera: 2,
  nanduti: 3,
  calendario: 4,
  prohibido: 5,
  patron: 6,
  plano: 7,
  nosalgan: 8,
  nolava: 9,
  manos: 10,
  pizarron: 11,
  santo: 12,
  peligro: 13,
  horario: 14,
  telarana: 15,
};
// Los que llevan transparencia (pintadas y telarañas).
export const OVERLAY = new Set([ATLAS.nosalgan, ATLAS.nolava, ATLAS.manos, ATLAS.telarana]);

// UV de la celda k (fila 0 arriba).
export function cellUV(k) {
  const col = k % 4;
  const row = Math.floor(k / 4);
  return { u0: col / 4, u1: (col + 1) / 4, v0: 1 - (row + 1) / 4, v1: 1 - row / 4 };
}

// Papel viejo: color base, manchas de humedad y bordes gastados.
function paper(ctx, base = '#e2d3b0', seed = 1) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 20 + r() * 120);
    g.addColorStop(0, `rgba(120,90,40,${0.05 + r() * 0.12})`);
    g.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const e = ctx.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.75);
  e.addColorStop(0, 'rgba(60,40,20,0)');
  e.addColorStop(1, 'rgba(60,40,20,0.55)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, S, S);
}

function text(ctx, str, x, y, font, color = '#2a1a10', align = 'center') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

// Pintada con sangre: letras irregulares con chorreadas.
function bloodWrite(ctx, lines, seed) {
  const r = rng(seed);
  ctx.clearRect(0, 0, S, S);
  lines.forEach((ln, li) => {
    const y = 150 + li * 150;
    ctx.font = `bold ${78 - ln.length}px "Special Elite", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(95,6,4,0.92)';
    ctx.save();
    ctx.translate(S / 2, y);
    ctx.rotate((r() - 0.5) * 0.12);
    ctx.fillText(ln, 0, 0);
    ctx.restore();
    // chorreadas
    for (let i = 0; i < 9; i++) {
      const x = 60 + r() * (S - 120);
      const len = 20 + r() * 110;
      const w = 2 + r() * 5;
      ctx.fillStyle = 'rgba(85,4,3,0.85)';
      ctx.fillRect(x, y + 20, w, len);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 20 + len, w * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const PAINT = [
  // 0 · se buscan tareferos
  (ctx) => {
    paper(ctx, '#e4d4ae', 2);
    ctx.fillStyle = '#9a1a12';
    ctx.fillRect(30, 40, S - 60, 110);
    text(ctx, '¡SE BUSCAN', S / 2, 75, 'bold 54px Impact, "Arial Black", sans-serif', '#f4e6c6');
    text(ctx, 'TAREFEROS!', S / 2, 125, 'bold 54px Impact, "Arial Black", sans-serif', '#f4e6c6');
    text(ctx, 'Buena paga · Comida · Techo', S / 2, 210, 'italic 30px Georgia, serif');
    text(ctx, 'Cosecha de yerba mate', S / 2, 262, '28px Georgia, serif');
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 300, S - 140, 110);
    text(ctx, 'Presentarse en la', S / 2, 335, '26px Georgia, serif');
    text(ctx, 'Oficina del Patrón', S / 2, 375, 'bold 30px Georgia, serif');
    text(ctx, 'Molino Santa Ana · 1911', S / 2, 460, 'italic 24px Georgia, serif', '#5a3a20');
  },
  // 1 · publicidad yerba El Carpincho
  (ctx) => {
    paper(ctx, '#2f5a36', 3);
    ctx.fillStyle = 'rgba(240,220,160,0.9)';
    ctx.beginPath();
    ctx.ellipse(S / 2, 250, 150, 85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a4424';
    ctx.beginPath();
    ctx.ellipse(S / 2 - 10, 262, 105, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(S / 2 + 95, 232, 48, 36, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0e06';
    ctx.beginPath();
    ctx.arc(S / 2 + 112, 222, 6, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'Yerba', S / 2, 70, 'italic 40px Georgia, serif', '#f4e6c6');
    text(ctx, 'EL CARPINCHO', S / 2, 125, 'bold 62px Impact, "Arial Black", sans-serif', '#f3c233');
    text(ctx, '¡La que no lava!', S / 2, 390, 'italic 40px Georgia, serif', '#f4e6c6');
    text(ctx, 'Con palo · Estacionada 24 meses', S / 2, 450, '24px Georgia, serif', '#e0d2a8');
  },
  // 2 · publicidad yerba La Tranquera
  (ctx) => {
    paper(ctx, '#efe2c4', 4);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#b0201a' : '#efe2c4';
      ctx.fillRect(0, 150 + i * 30, S, 30);
    }
    ctx.fillStyle = '#5a3a20';
    for (let i = 0; i < 5; i++) ctx.fillRect(110 + i * 70, 170, 14, 150);
    ctx.fillRect(100, 200, 320, 12);
    ctx.fillRect(100, 270, 320, 12);
    text(ctx, 'LA TRANQUERA', S / 2, 80, 'bold 64px Impact, "Arial Black", sans-serif', '#b0201a');
    text(ctx, 'Yerba mate elaborada con palo', S / 2, 380, '28px Georgia, serif');
    text(ctx, '"Abrí la tranquera, cebá otro"', S / 2, 440, 'italic 30px Georgia, serif', '#5a3a20');
  },
  // 3 · publicidad yerba Ñandutí
  (ctx) => {
    paper(ctx, '#f0e4cf', 5);
    ctx.strokeStyle = 'rgba(40,60,120,0.75)';
    ctx.lineWidth = 2;
    for (let r = 20; r < 160; r += 18) {
      ctx.beginPath();
      ctx.arc(S / 2, 250, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(S / 2, 250);
      ctx.lineTo(S / 2 + Math.cos(a) * 160, 250 + Math.sin(a) * 160);
      ctx.stroke();
    }
    text(ctx, 'ÑANDUTÍ', S / 2, 60, 'bold 66px Impact, "Arial Black", sans-serif', '#28407a');
    text(ctx, 'suave como el encaje', S / 2, 440, 'italic 32px Georgia, serif', '#28407a');
  },
  // 4 · calendario mayo 1911
  (ctx) => {
    paper(ctx, '#ece0c4', 6);
    ctx.fillStyle = '#7a1a12';
    ctx.fillRect(40, 30, S - 80, 90);
    text(ctx, 'MAYO 1911', S / 2, 76, 'bold 52px Impact, "Arial Black", sans-serif', '#f4e6c6');
    const days = 'DLMMJVS';
    for (let i = 0; i < 7; i++) text(ctx, days[i], 70 + i * 62, 150, 'bold 26px Georgia, serif');
    let d = 1;
    for (let w = 0; w < 5; w++) {
      for (let i = 0; i < 7; i++) {
        if (w === 0 && i < 1) continue;
        if (d > 31) break;
        const x = 70 + i * 62;
        const y = 200 + w * 62;
        text(ctx, String(d), x, y, '26px Georgia, serif');
        if (d < 18) {
          ctx.strokeStyle = 'rgba(40,20,10,0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x - 18, y - 18);
          ctx.lineTo(x + 18, y + 18);
          ctx.moveTo(x + 18, y - 18);
          ctx.lineTo(x - 18, y + 18);
          ctx.stroke();
        }
        if (d === 18) {
          ctx.strokeStyle = '#a01a10';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y, 24, 0, Math.PI * 2);
          ctx.stroke();
        }
        d++;
      }
    }
    text(ctx, 'Almacén de Ramos Generales', S / 2, 490, 'italic 22px Georgia, serif', '#5a3a20');
  },
  // 5 · prohibido el mate frío
  (ctx) => {
    paper(ctx, '#f2ead6', 7);
    ctx.strokeStyle = '#a01a10';
    ctx.lineWidth = 16;
    ctx.strokeRect(30, 30, S - 60, S - 60);
    text(ctx, 'PROHIBIDO', S / 2, 150, 'bold 76px Impact, "Arial Black", sans-serif', '#a01a10');
    text(ctx, 'cebar mate frío', S / 2, 240, 'italic 42px Georgia, serif');
    text(ctx, 'y escupir en el piso', S / 2, 300, 'italic 34px Georgia, serif');
    text(ctx, '— La Administración', S / 2, 410, '28px Georgia, serif', '#5a3a20');
  },
  // 6 · retrato del patrón
  (ctx) => {
    const g = ctx.createRadialGradient(S / 2, 230, 20, S / 2, 250, 280);
    g.addColorStop(0, '#5a4a38');
    g.addColorStop(1, '#1a130c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#12100c';
    ctx.beginPath();
    ctx.moveTo(90, S);
    ctx.quadraticCurveTo(S / 2, 300, S - 90, S);
    ctx.fill();
    ctx.fillStyle = '#b89070';
    ctx.beginPath();
    ctx.ellipse(S / 2, 220, 80, 100, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(S / 2, 140, 86, 36, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // bigotes y ojos
    ctx.beginPath();
    ctx.moveTo(S / 2 - 60, 262);
    ctx.quadraticCurveTo(S / 2, 240, S / 2 + 60, 262);
    ctx.quadraticCurveTo(S / 2, 255, S / 2 - 60, 262);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(S / 2 - 30, 205, 8, 0, Math.PI * 2);
    ctx.arc(S / 2 + 30, 205, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8923a';
    ctx.fillRect(S / 2 - 150, 440, 300, 50);
    text(ctx, 'Don Anselmo Barreto · Fundador', S / 2, 465, 'bold 20px Georgia, serif', '#2a1a10');
  },
  // 7 · plano del molino
  (ctx) => {
    paper(ctx, '#d8d0b8', 8);
    text(ctx, 'PLANO DEL MOLINO SANTA ANA', S / 2, 40, 'bold 28px Georgia, serif', '#1a2a4a');
    ctx.strokeStyle = '#1a2a4a';
    ctx.lineWidth = 3;
    const rects = [[4, 4, 30, 16], [32, 4, 55, 16], [4, 18, 30, 31], [32, 18, 45, 31], [47, 18, 55, 31], [4, 33, 19, 45], [21, 33, 40, 45], [42, 33, 55, 45]];
    for (const [x0, z0, x1, z1] of rects) ctx.strokeRect(20 + x0 * 8, 70 + z0 * 8.5, (x1 - x0 + 1) * 8, (z1 - z0 + 1) * 8.5);
    ctx.fillStyle = '#a01a10';
    ctx.beginPath();
    ctx.arc(20 + 51 * 8, 70 + 20 * 8.5, 7, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '¿?', 20 + 51 * 8 + 22, 70 + 20 * 8.5, 'bold 22px Georgia, serif', '#a01a10');
  },
  // 8 · pintada: no salgan de noche
  (ctx) => bloodWrite(ctx, ['NO SALGAN', 'DE NOCHE'], 9),
  // 9 · pintada: la yerba no se lava
  (ctx) => bloodWrite(ctx, ['LA YERBA', 'NO SE LAVA'], 10),
  // 10 · manos ensangrentadas
  (ctx) => {
    ctx.clearRect(0, 0, S, S);
    const r = rng(11);
    for (let k = 0; k < 4; k++) {
      const cx = 110 + r() * 290;
      const cy = 120 + r() * 280;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((r() - 0.5) * 1.2);
      ctx.fillStyle = `rgba(${80 + r() * 30},4,3,${0.7 + r() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(0, 20, 34, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let f = 0; f < 4; f++) {
        ctx.beginPath();
        ctx.ellipse(-27 + f * 18, -34 - (f === 1 || f === 2 ? 10 : 0), 8, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(40, 10, 9, 22, -0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-4, 50, 6, 30 + r() * 60);
      ctx.restore();
    }
  },
  // 11 · pizarrón del almacén
  (ctx) => {
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1f3228';
    ctx.fillRect(24, 24, S - 48, S - 48);
    const chalk = 'rgba(235,235,225,0.88)';
    text(ctx, 'PRECIOS', S / 2, 80, 'bold 44px "Special Elite", Georgia, serif', chalk);
    const rows = [['Yerba 1 kg', '$ 0,30'], ['Azúcar', '$ 0,12'], ['Grasa', '$ 0,20'], ['Galleta', '$ 0,08'], ['Caña', '$ 0,45']];
    rows.forEach(([a, b], i) => {
      text(ctx, a, 70, 160 + i * 56, '32px "Special Elite", Georgia, serif', chalk, 'left');
      text(ctx, b, S - 70, 160 + i * 56, '32px "Special Elite", Georgia, serif', chalk, 'right');
    });
    text(ctx, 'NO SE FÍA', S / 2, 450, 'bold 40px "Special Elite", Georgia, serif', 'rgba(255,190,170,0.9)');
  },
  // 12 · estampita del santo patrono
  (ctx) => {
    paper(ctx, '#e8dcc0', 12);
    const g = ctx.createRadialGradient(S / 2, 180, 10, S / 2, 180, 140);
    g.addColorStop(0, 'rgba(255,220,120,1)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#3a4a7a';
    ctx.beginPath();
    ctx.moveTo(S / 2, 150);
    ctx.lineTo(S / 2 + 110, 430);
    ctx.lineTo(S / 2 - 110, 430);
    ctx.fill();
    ctx.fillStyle = '#d8b090';
    ctx.beginPath();
    ctx.arc(S / 2, 150, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0b840';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(S / 2, 140, 70, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    text(ctx, 'Santo Patrono de los Tareferos', S / 2, 470, 'italic 24px Georgia, serif');
  },
  // 13 · peligro alta tensión
  (ctx) => {
    ctx.fillStyle = '#e8c020';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(S / 2, 60);
    ctx.lineTo(S - 80, 330);
    ctx.lineTo(80, 330);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8c020';
    ctx.beginPath();
    ctx.moveTo(S / 2 + 20, 130);
    ctx.lineTo(S / 2 - 40, 240);
    ctx.lineTo(S / 2, 240);
    ctx.lineTo(S / 2 - 20, 310);
    ctx.lineTo(S / 2 + 40, 200);
    ctx.lineTo(S / 2, 200);
    ctx.fill();
    text(ctx, 'PELIGRO', S / 2, 390, 'bold 64px Impact, "Arial Black", sans-serif', '#111');
    text(ctx, '380 VOLTIOS', S / 2, 455, 'bold 40px Impact, "Arial Black", sans-serif', '#111');
  },
  // 14 · horario del turno noche
  (ctx) => {
    paper(ctx, '#ede3cc', 14);
    text(ctx, 'TURNO NOCHE', S / 2, 80, 'bold 48px Georgia, serif');
    text(ctx, 'de 20 a 6 hs.', S / 2, 140, '34px Georgia, serif');
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(60, 210 + i * 45);
      ctx.lineTo(S - 60, 210 + i * 45);
      ctx.stroke();
    }
    text(ctx, 'El que se duerme,', S / 2, 250, 'italic 30px Georgia, serif');
    text(ctx, 'se queda.', S / 2, 300, 'italic 30px Georgia, serif');
    text(ctx, 'El Capataz', S - 110, 420, 'italic 28px Georgia, serif', '#5a3a20');
    ctx.fillStyle = '#8a1a10';
    ctx.beginPath();
    ctx.arc(60, 40, 10, 0, Math.PI * 2);
    ctx.arc(S - 60, 40, 10, 0, Math.PI * 2);
    ctx.fill();
  },
  // 15 · telaraña
  (ctx) => {
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(230,230,225,0.7)';
    ctx.lineWidth = 1.6;
    const cx = 0;
    const cy = 0;
    const spokes = 9;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(Math.cos(a) * S * 1.05, Math.sin(a) * S * 1.05);
      ctx.stroke();
    }
    for (let r = 30; r < S; r += 34 + r * 0.05) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI / 2);
        const rr = r * (0.92 + Math.sin(i * 1.7 + r) * 0.05);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(Math.cos(a - 0.08) * rr * 0.93, Math.sin(a - 0.08) * rr * 0.93, x, y);
      }
      ctx.stroke();
    }
  },
];

export function buildAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const ctx = c.getContext('2d');
  PAINT.forEach((fn, k) => {
    const cell = document.createElement('canvas');
    cell.width = cell.height = S;
    fn(cell.getContext('2d'));
    ctx.drawImage(cell, (k % 4) * S, Math.floor(k / 4) * S);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
