// Foglio partita A4 in bianco e nero, da stampare e compilare in campo con una X per ogni gol, assist o autogol.
// Fonte: drawFieldSheet in legacy/index.html.
import { formatDate } from '../domain/format';
import { normalizeTeam, playerKey } from '../domain/stats';
import type { Dataset, Match } from '../domain/types';

/** Quello che serve del foglio di una partita (anche non ancora salvata). */
export type SheetMatch = Pick<Match, 'date' | 'teamA' | 'teamB'> & { notes?: unknown };
import { fitText, newCanvas, SHARE_FONT, type Ctx } from './share';

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

interface Col {
  label: string;
  w: number;
  fill?: boolean;
  n?: number;
}

export function drawSheet(m: SheetInput): HTMLCanvasElement {
  const W = 1240, H = 1754; // A4 verticale a 150 dpi (×2 → 300 dpi)
  const { canvas, ctx } = newCanvas(W, H);
  const INK = '#000', MID = '#555', BOX = '#777', F = SHARE_FONT;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const M = 70, CW = W - 2 * M, EXTRA = 2; // margini, larghezza utile, righe vuote per squadra
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const teamA = m.teamA, teamB = m.teamB;

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
  y += 26;

  // ── altezza delle righe adattata, perché le due squadre stiano sempre in una pagina ──
  const BAR = 54, COLH = 38, GAP = 34, FOOT = 110;
  const totalRows = teamA.length + teamB.length + 2 * EXTRA;
  const avail = H - M - FOOT - y - (2 * (BAR + COLH) + GAP);
  const rowH = Math.max(44, Math.min(86, Math.floor(avail / totalRows)));
  // GOL e ASSIST riempiono la cella con gruppi di 5 caselle (1 o 2 righe secondo l'altezza); AUTOGOL: 3
  const cols: Col[] = [{ label: 'GIOCATORE', w: 240 }, { label: 'GOL', w: 375, fill: true }, { label: 'ASSIST', w: 375, fill: true }, { label: 'AUTOGOL', w: 110, n: 3 }];
  const twoRows = Math.floor((rowH - 14) / 2) >= 22;
  const bs = twoRows ? Math.min(30, Math.floor((rowH - 14) / 2)) : Math.min(26, Math.floor(rowH * 0.5));
  const gap = 7, grp = 16, rowGap = 5, cellPad = 8;
  // quante caselle stanno su una riga della cella, sempre in gruppi interi da 5
  const perLine = (w: number) => {
    const groupW = 5 * bs + 4 * gap;
    const g = Math.max(1, Math.floor((w - 2 * cellPad + grp) / (groupW + grp)));
    return g * 5;
  };

  // disegna le caselle da barrare di una cella: GOL/ASSIST usano tutte le righe disponibili, le altre un numero fisso
  const drawBoxes = (x0: number, y0: number, w: number, c: Col) => {
    const lines: number[] = c.fill ? Array<number>(twoRows ? 2 : 1).fill(perLine(w)) : [c.n as number];
    const blockH = lines.length * bs + (lines.length - 1) * rowGap;
    let by = y0 + (rowH - blockH) / 2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = BOX;
    lines.forEach((cnt) => {
      const xs: number[] = [];
      let cx = 0;
      for (let k = 0; k < cnt; k++) {
        xs.push(cx);
        cx += bs + gap;
        if ((k + 1) % 5 === 0) cx += grp - gap;
      }
      const off = x0 + (w - ((xs[xs.length - 1] as number) + bs)) / 2;
      xs.forEach((bx) => ctx.strokeRect(off + bx, by, bs, bs));
      by += bs + rowGap;
    });
  };

  const drawTable = (ctx2: Ctx, label: string, names: string[], isBlue: boolean, y0: number) => {
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
    const rows = [...names, ...Array<string>(EXTRA).fill('')];
    let ry = top + COLH;
    rows.forEach((nm) => {
      if (nm) {
        ctx2.fillStyle = INK;
        ctx2.textAlign = 'left';
        ctx2.font = F('700 ' + Math.min(26, Math.round(rowH * 0.42)) + 'px');
        ctx2.fillText(fitText(ctx2, nm, (cols[0] as Col).w - 28), M + 16, ry + rowH / 2 + 9);
      }
      let cx = M + (cols[0] as Col).w;
      cols.slice(1).forEach((c) => {
        drawBoxes(cx, ry, c.w, c);
        cx += c.w;
      });
      ry += rowH;
    });
    const bottom = ry;
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

  const endA = drawTable(ctx, 'BLU', teamA, true, y);
  const endB = drawTable(ctx, 'BIANCHI', teamB, false, endA + GAP);

  // ── righe per le note e crediti ──
  const ny = endB + 46;
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
  ctx.fillText("CalcioLercio — da riportare nell'app con il tasto Edita", W / 2, H - M + 30);
  return canvas;
}
