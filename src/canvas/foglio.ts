// Foglio partita A4 in bianco e nero, da stampare e compilare in campo con una X per ogni gol, assist o autogol.
import { formatDate } from '../domain/format';
import { normalizeTeam, playerKey } from '../domain/stats';
import type { Dataset, Match } from '../domain/types';

/** Quello che serve del foglio di una partita (anche non ancora salvata). */
export type SheetMatch = Pick<Match, 'date' | 'teamA' | 'teamB'> & { notes?: unknown };
import { fitText, newCanvas, SHARE_FONT, type Ctx } from './share';
import { SHEET_H, SHEET_W, SHEET_KINDS, sheetLayout, type SheetTable } from '../domain/sheetLayout';

export interface SheetInput {
  date: unknown;
  notes: string;
  /** nomi dei giocatori, nell'ordine della partita */
  teamA: string[];
  teamB: string[];
}

/** I nomi nelle squadre di una partita (come li mostra la scheda partita). */
export const sheetInput = (data: Dataset, m: SheetMatch): SheetInput => ({
  date: m.date,
  notes: String(m.notes || '').trim(),
  teamA: normalizeTeam(m.teamA).map((pl) => playerKey(data.players, pl.id, pl.name).name),
  teamB: normalizeTeam(m.teamB).map((pl) => playerKey(data.players, pl.id, pl.name).name),
});

export function drawSheet(m: SheetInput): HTMLCanvasElement {
  const W = SHEET_W, H = SHEET_H; // A4 verticale a 150 dpi (×2 → 300 dpi)
  const { canvas, ctx } = newCanvas(W, H);
  const INK = '#000', MID = '#555', BOX = '#777', F = SHARE_FONT;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const L = sheetLayout(m.teamA.length, m.teamB.length, !!m.notes);
  const M = L.M, CW = L.CW, BAR = L.BAR, COLH = L.COLH, rowH = L.rowH, cols = L.cols;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const teamA = m.teamA, teamB = m.teamB;
  // quadrati neri agli angoli: servono a ritrovare il foglio nella foto (quello in alto a sinistra è più grande)
  ctx.fillStyle = INK;
  for (const r of Object.values(L.markers)) ctx.fillRect(r.x, r.y, r.w, r.h);

  // ── intestazione ──
  let y = M + 40;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = F('900 46px');
  ctx.fillText('CALCIOLERCIO', W / 2, y);
  y += 40;
  ctx.font = F('700 26px');
  ctx.fillText('Foglio partita — ' + formatDate(m.date), W / 2, y);
  const notes = m.notes;
  if (notes) {
    y += 32;
    ctx.fillStyle = MID;
    ctx.font = F('italic 500 22px');
    ctx.fillText(fitText(ctx, notes, CW), W / 2, y);
    ctx.fillStyle = INK;
  }

  // ── caselle del risultato ──
  y += 34;
  const bw = 130, bh = 86;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(W / 2 - bw - 30, y, bw, bh);
  ctx.strokeRect(W / 2 + 30, y, bw, bh);
  ctx.font = F('900 34px');
  ctx.textAlign = 'right';
  ctx.fillText('BLU', W / 2 - bw - 50, y + bh / 2 + 12);
  ctx.textAlign = 'left';
  ctx.fillText('BIANCHI', W / 2 + bw + 50, y + bh / 2 + 12);
  ctx.textAlign = 'center';
  ctx.font = F('900 40px');
  ctx.fillText('–', W / 2, y + bh / 2 + 14);
  y += bh + 38;
  ctx.fillStyle = MID;
  ctx.font = F('600 20px');
  ctx.fillText('Segna una X in una casella per ogni gol, assist o autogol', W / 2, y);
  ctx.fillStyle = INK;

  const drawTable = (ctx2: Ctx, label: string, names: string[], isBlue: boolean, t: SheetTable) => {
    const y0 = t.y0;
    // barra della squadra: Blu = nero pieno, Bianchi = solo contorno (si legge anche in bianco e nero)
    if (isBlue) {
      ctx2.fillStyle = INK;
      ctx2.fillRect(M, y0, CW, BAR);
      ctx2.fillStyle = '#fff';
    } else {
      ctx2.lineWidth = 3;
      ctx2.strokeStyle = INK;
      ctx2.strokeRect(M, y0, CW, BAR);
      ctx2.fillStyle = INK;
    }
    ctx2.textAlign = 'left';
    ctx2.font = F('900 30px');
    ctx2.fillText(label, M + 20, y0 + 37);
    ctx2.textAlign = 'right';
    ctx2.font = F('600 20px');
    ctx2.fillText(names.length + ' giocatori', M + CW - 20, y0 + 35);
    const top = y0 + BAR;
    // intestazioni delle colonne
    ctx2.fillStyle = INK;
    ctx2.font = F('800 19px');
    let x = M;
    cols.forEach((c, i) => {
      ctx2.textAlign = i ? 'center' : 'left';
      ctx2.fillText(c.label, i ? x + c.w / 2 : x + 16, top + 26);
      x += c.w;
    });
    // righe (giocatori + righe vuote per chi arriva dopo)
    const rows = [...names, ...Array<string>(t.rows.length - names.length).fill('')];
    ctx2.lineWidth = 2;
    ctx2.strokeStyle = BOX;
    rows.forEach((nm, k) => {
      const ry = (t.rows[k] as SheetTable['rows'][number]).y;
      if (nm) {
        ctx2.fillStyle = INK;
        ctx2.textAlign = 'left';
        ctx2.font = F('700 ' + Math.min(26, Math.round(rowH * 0.42)) + 'px');
        ctx2.fillText(fitText(ctx2, nm, (cols[0] as { w: number }).w - 28), M + 16, ry + rowH / 2 + 9);
      }
      for (const kind of SHEET_KINDS) for (const r of (t.rows[k] as SheetTable['rows'][number]).boxes[kind]) ctx2.strokeRect(r.x, r.y, r.w, r.h);
    });
    const bottom = t.bottom;
    // griglia
    ctx2.strokeStyle = INK;
    ctx2.lineWidth = 1.5;
    line(M, top + COLH, M + CW, top + COLH);
    for (let k = 1; k < rows.length; k++) line(M, top + COLH + k * rowH, M + CW, top + COLH + k * rowH);
    let vx = M;
    cols.forEach((c, i) => {
      if (i > 0) line(vx, top, vx, bottom);
      vx += c.w;
    });
    ctx2.lineWidth = 3;
    ctx2.strokeRect(M, y0, CW, bottom - y0);
    return bottom;
  };

  drawTable(ctx, 'BLU', teamA, true, L.tables[0]);
  drawTable(ctx, 'BIANCHI', teamB, false, L.tables[1]);

  // ── righe per le note e crediti ──
  const ny = L.notesY;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = F('800 20px');
  ctx.fillText('NOTE', M, ny);
  ctx.strokeStyle = MID;
  ctx.lineWidth = 1.2;
  line(M + 80, ny + 2, M + CW, ny + 2);
  if (ny + 40 < H - M) line(M, ny + 40, M + CW, ny + 40);
  ctx.fillStyle = MID;
  ctx.textAlign = 'center';
  ctx.font = F('italic 500 15px');
  ctx.fillText('CalcioLercio — fotografa il foglio intero (con i 4 quadrati neri) e usa «Leggi il foglio» nella modifica partita', W / 2, H - M + 30);
  return canvas;
}
