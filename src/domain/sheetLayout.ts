// Foglio partita A4: dove stanno tutte le cose (segni agli angoli, tabelle, caselle da barrare).
// Una sola fonte: il disegno del foglio (canvas/foglio.ts) e la lettura della foto (sheetScan.ts) usano gli stessi numeri.
// Coordinate in "unità foglio": A4 verticale a 150 dpi, 1240 × 1754.

export const SHEET_W = 1240;
export const SHEET_H = 1754;
const M = 70; // margini
const CW = SHEET_W - 2 * M; // larghezza utile
export const SHEET_EXTRA_ROWS = 2; // righe vuote per squadra, per chi arriva dopo
const BAR = 54, COLH = 38, GAP = 34, FOOT = 110;

export interface Rect { x: number; y: number; w: number; h: number }
export type SheetKind = 'gol' | 'assist' | 'autogol';
export const SHEET_KINDS: SheetKind[] = ['gol', 'assist', 'autogol'];

export interface SheetColumn { label: string; w: number; x: number; fill?: boolean; n?: number }

export interface SheetRow {
  team: 'A' | 'B';
  /** posizione nella squadra; da `nomi.length` in poi sono le righe vuote */
  index: number;
  y: number;
  boxes: Record<SheetKind, Rect[]>;
}

export interface SheetTable {
  team: 'A' | 'B';
  y0: number;
  top: number;
  bottom: number;
  rows: SheetRow[];
}

export interface SheetLayout {
  W: number;
  H: number;
  M: number;
  CW: number;
  BAR: number;
  COLH: number;
  rowH: number;
  /** y da cui partono le tabelle (dopo l'intestazione) */
  startY: number;
  /** estremi del blocco note sotto le tabelle */
  notesY: number;
  cols: SheetColumn[];
  tables: [SheetTable, SheetTable];
  /** quadrati neri agli angoli: il primo (in alto a sinistra) è più grande, così si capisce come è girato il foglio */
  markers: { tl: Rect; tr: Rect; bl: Rect; br: Rect };
}

const MARK = 40, MARK_BIG = 56, MARK_OFF = 24;

/** Centro di un rettangolo. */
export const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

/**
 * Impaginazione del foglio per due squadre di `nA` e `nB` giocatori. `hasNotes`: sotto il titolo c'è la riga con la
 * descrizione della partita, che sposta tutto in basso.
 */
export function sheetLayout(nA: number, nB: number, hasNotes: boolean): SheetLayout {
  const bh = 86; // altezza delle caselle del risultato
  const startY = M + 40 + 40 + (hasNotes ? 32 : 0) + 34 + bh + 38 + 26;
  const totalRows = nA + nB + 2 * SHEET_EXTRA_ROWS;
  const avail = SHEET_H - M - FOOT - startY - (2 * (BAR + COLH) + GAP);
  const rowH = Math.max(44, Math.min(86, Math.floor(avail / totalRows)));

  const widths = [240, 375, 375, 110];
  const labels = ['GIOCATORE', 'GOL', 'ASSIST', 'AUTOGOL'];
  let cx = M;
  const cols: SheetColumn[] = widths.map((w, i) => {
    const c: SheetColumn = { label: labels[i] as string, w, x: cx, ...(i === 1 || i === 2 ? { fill: true } : {}), ...(i === 3 ? { n: 3 } : {}) };
    cx += w;
    return c;
  });

  // GOL e ASSIST riempiono la cella con gruppi di 5 caselle (1 o 2 righe secondo l'altezza); AUTOGOL: 3
  const twoRows = Math.floor((rowH - 14) / 2) >= 22;
  const bs = twoRows ? Math.min(30, Math.floor((rowH - 14) / 2)) : Math.min(26, Math.floor(rowH * 0.5));
  const gap = 7, grp = 16, rowGap = 5, cellPad = 8;
  const perLine = (w: number) => {
    const groupW = 5 * bs + 4 * gap;
    const g = Math.max(1, Math.floor((w - 2 * cellPad + grp) / (groupW + grp)));
    return g * 5;
  };
  const cellBoxes = (c: SheetColumn, y0: number): Rect[] => {
    const lines: number[] = c.fill ? Array<number>(twoRows ? 2 : 1).fill(perLine(c.w)) : [c.n as number];
    const blockH = lines.length * bs + (lines.length - 1) * rowGap;
    let by = y0 + (rowH - blockH) / 2;
    const out: Rect[] = [];
    for (const cnt of lines) {
      const xs: number[] = [];
      let x = 0;
      for (let k = 0; k < cnt; k++) {
        xs.push(x);
        x += bs + gap;
        if ((k + 1) % 5 === 0) x += grp - gap;
      }
      const off = c.x + (c.w - ((xs[xs.length - 1] as number) + bs)) / 2;
      for (const bx of xs) out.push({ x: off + bx, y: by, w: bs, h: bs });
      by += bs + rowGap;
    }
    return out;
  };

  const table = (team: 'A' | 'B', n: number, y0: number): SheetTable => {
    const top = y0 + BAR;
    const rows: SheetRow[] = [];
    let ry = top + COLH;
    for (let i = 0; i < n + SHEET_EXTRA_ROWS; i++) {
      rows.push({ team, index: i, y: ry, boxes: { gol: cellBoxes(cols[1] as SheetColumn, ry), assist: cellBoxes(cols[2] as SheetColumn, ry), autogol: cellBoxes(cols[3] as SheetColumn, ry) } });
      ry += rowH;
    }
    return { team, y0, top, bottom: ry, rows };
  };
  const tA = table('A', nA, startY);
  const tB = table('B', nB, tA.bottom + GAP);

  return {
    W: SHEET_W, H: SHEET_H, M, CW, BAR, COLH, rowH, startY, notesY: tB.bottom + 46, cols, tables: [tA, tB],
    markers: {
      tl: { x: MARK_OFF, y: MARK_OFF, w: MARK_BIG, h: MARK_BIG },
      tr: { x: SHEET_W - MARK_OFF - MARK, y: MARK_OFF, w: MARK, h: MARK },
      bl: { x: MARK_OFF, y: SHEET_H - MARK_OFF - MARK, w: MARK, h: MARK },
      br: { x: SHEET_W - MARK_OFF - MARK, y: SHEET_H - MARK_OFF - MARK, w: MARK, h: MARK },
    },
  };
}
