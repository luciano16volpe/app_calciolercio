// Lettura del foglio partita da una foto: trova i 4 quadrati neri agli angoli, raddrizza il foglio e conta
// le caselle barrate di ogni giocatore (gol, assist, autogol). Solo calcoli sui pixel: niente schermo, niente rete.
import { center, SHEET_KINDS, type Rect, type SheetKind, type SheetLayout } from './sheetLayout';

/** Immagine in toni di grigio (0 = nero, 255 = bianco), riga dopo riga. */
export interface GrayImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ScanRow {
  team: 'A' | 'B';
  /** posizione nella squadra */
  index: number;
  gol: number;
  assist: number;
  autogol: number;
  /** caselle dubbie (segno incerto) per tipo: da far controllare all'utente */
  doubt: SheetKind[];
}

export type ScanResult =
  | { ok: true; rows: ScanRow[]; /** hanno segni le righe vuote in fondo: giocatori non in lista */ extraMarked: boolean; /** quale impaginazione ha funzionato (indice in `layouts`) */ layoutIndex: number }
  | { ok: false; reason: 'markers' | 'alignment' | 'bounds'; message: string };

type Pt = [number, number];

// ── immagine → nero/bianco ─────────────────────────────────────────────────
/** Scurisce solo ciò che è più scuro dei dintorni (regge ombre e luce non uniforme). */
export function darkMask(img: GrayImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const integral = new Uint32Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x] as number;
      integral[(y + 1) * stride + x + 1] = (integral[y * stride + x + 1] as number) + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 16)); // finestra abbastanza larga da non «vuotare» le grandi zone nere
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = (integral[y1 * stride + x1] as number) - (integral[y0 * stride + x1] as number) - (integral[y1 * stride + x0] as number) + (integral[y0 * stride + x0] as number);
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const g = data[y * w + x] as number;
      if (g < mean * 0.82 && mean - g > 14) mask[y * w + x] = 1;
    }
  }
  return mask;
}

// ── i quattro quadrati agli angoli ─────────────────────────────────────────
interface Blob { cx: number; cy: number; size: number }

/** Macchie scure piene e quadrate (candidate a essere un angolo). */
export function findSquares(mask: Uint8Array, w: number, h: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Blob[] = [];
  const maxSize = 0.12 * Math.max(w, h);
  const minSize = Math.max(6, 0.008 * Math.min(w, h));
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = w, maxX = 0, minY = h, maxY = 0, area = 0, sx = 0, sy = 0;
    while (sp > 0) {
      const p = stack[--sp] as number;
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < minSize || bh < minSize || bw > maxSize || bh > maxSize) continue;
    const aspect = bw / bh;
    if (aspect < 0.7 || aspect > 1.43) continue;
    if (area / (bw * bh) < 0.72) continue; // pieno, non una crocetta o una lettera
    out.push({ cx: sx / area, cy: sy / area, size: Math.sqrt(area) });
  }
  return out;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Sceglie i quattro angoli tra le macchie quadrate: quello in alto a sinistra è il più grande, gli altri tre
 * formano (quasi) un rettangolo con le proporzioni del foglio, comunque sia girata o inclinata la foto.
 * Restituisce i centri nell'ordine [alto sx, alto dx, basso dx, basso sx].
 */
export function pickCorners(blobs: Blob[], layout: SheetLayout): [Pt, Pt, Pt, Pt] | null {
  const { tl, tr, bl } = layout.markers;
  const wantRatio = dist(center(tl), center(bl)) / dist(center(tl), center(tr)); // lato lungo / lato corto
  const bigRatio = tl.w / tr.w;
  let best: { score: number; pts: [Pt, Pt, Pt, Pt] } | null = null;
  const bigs = [...blobs].sort((a, b) => b.size - a.size).slice(0, 8);
  for (const t of bigs) {
    const small = blobs.filter((b) => b !== t && Math.abs(b.size / t.size - 1 / bigRatio) < 0.22);
    const T: Pt = [t.cx, t.cy];
    for (const a of small) {
      for (const b of small) {
        if (a === b) continue;
        const A: Pt = [a.cx, a.cy], B: Pt = [b.cx, b.cy];
        const v1: Pt = [A[0] - T[0], A[1] - T[1]], v2: Pt = [B[0] - T[0], B[1] - T[1]];
        const cross = v1[0] * v2[1] - v1[1] * v2[0];
        if (cross <= 0) continue; // stesso verso del foglio (non specchiato)
        const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
        if (l1 < 20 || l2 < 20) continue;
        const ratio = l2 / l1;
        if (Math.abs(ratio - wantRatio) > 0.3 * wantRatio) continue;
        const cos = Math.abs((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2));
        if (cos > 0.4) continue;
        const pred: Pt = [T[0] + v1[0] + v2[0], T[1] + v1[1] + v2[1]];
        for (const c of small) {
          if (c === a || c === b) continue;
          const d = dist([c.cx, c.cy], pred);
          if (d > 0.14 * l2) continue;
          const score = d / l2 + Math.abs(ratio - wantRatio) / wantRatio + cos;
          if (!best || score < best.score) best = { score, pts: [T, A, [c.cx, c.cy], B] };
        }
      }
    }
  }
  return best ? best.pts : null;
}

// ── dal foglio alla foto ───────────────────────────────────────────────────
/** Trasformazione di prospettiva (8 numeri): da coordinate foglio a coordinate foto. */
export function solveHomography(src: Pt[], dst: Pt[]): number[] | null {
  const n = 8;
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i] as Pt, [u, v] = dst[i] as Pt;
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs((m[r] as number[])[c] as number) > Math.abs((m[p] as number[])[c] as number)) p = r;
    if (Math.abs((m[p] as number[])[c] as number) < 1e-9) return null;
    [m[c], m[p]] = [m[p] as number[], m[c] as number[]];
    const piv = (m[c] as number[])[c] as number;
    for (let k = c; k <= n; k++) (m[c] as number[])[k] = ((m[c] as number[])[k] as number) / piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = (m[r] as number[])[c] as number;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) (m[r] as number[])[k] = ((m[r] as number[])[k] as number) - f * ((m[c] as number[])[k] as number);
    }
  }
  return m.map((row) => row[n] as number);
}

const apply = (h: number[], x: number, y: number): Pt => {
  const d = (h[6] as number) * x + (h[7] as number) * y + 1;
  return [((h[0] as number) * x + (h[1] as number) * y + (h[2] as number)) / d, ((h[3] as number) * x + (h[4] as number) * y + (h[5] as number)) / d];
};

/** Quota di pixel scuri nella parte centrale di un rettangolo del foglio (null se esce dalla foto). */
function ink(mask: Uint8Array, w: number, h: number, hm: number[], r: Rect, shrink: number, grid: number): number | null {
  const [cx, cy] = center(r);
  const hw = (r.w * shrink) / 2, hh = (r.h * shrink) / 2;
  let dark = 0, total = 0, outside = 0;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const sx = cx - hw + ((2 * hw) * (i + 0.5)) / grid, sy = cy - hh + ((2 * hh) * (j + 0.5)) / grid;
      const [u, v] = apply(hm, sx, sy);
      const px = Math.round(u), py = Math.round(v);
      total++;
      if (px < 0 || py < 0 || px >= w || py >= h) { outside++; continue; }
      if (mask[py * w + px]) dark++;
    }
  }
  if (outside > total / 3) return null;
  return dark / Math.max(1, total - outside);
}

/** Più alto di questo: casella barrata. Tra DOUBT e MARK: dubbia (non conteggiata, ma segnalata). */
export const MARK_LEVEL = 0.22;
export const DOUBT_LEVEL = 0.1;

/**
 * Legge il foglio. `layouts`: le impaginazioni possibili (con e senza riga della descrizione sotto il titolo);
 * si usa quella che combacia meglio con la foto.
 */
export function scanSheet(img: GrayImage, layouts: SheetLayout[]): ScanResult {
  const { width: w, height: h } = img;
  const first = layouts[0];
  if (!first) return { ok: false, reason: 'markers', message: 'Foglio non valido.' };
  const mask = darkMask(img);
  const corners = pickCorners(findSquares(mask, w, h), first);
  if (!corners) {
    return { ok: false, reason: 'markers', message: 'Non trovo i 4 quadrati neri agli angoli. Inquadra tutto il foglio, ben illuminato e senza tagliare gli angoli.' };
  }
  let bestIndex = -1, bestHm: number[] | null = null, bestBar = 0;
  layouts.forEach((layout, k) => {
    const { tl, tr, bl, br } = layout.markers;
    const hm = solveHomography([center(tl), center(tr), center(br), center(bl)], corners);
    if (!hm) return;
    const t = layout.tables[0];
    const bar = ink(mask, w, h, hm, { x: layout.M + 130, y: t.y0 + 6, w: layout.CW - 400, h: layout.BAR - 12 }, 1, 12);
    if (bar !== null && bar > bestBar) { bestBar = bar; bestIndex = k; bestHm = hm; }
  });
  // la barra nera «BLU» deve cadere dove ce la aspettiamo: altrimenti il foglio non è questo (o è un'altra stampa)
  if (!bestHm || bestBar < 0.5) {
    return { ok: false, reason: 'alignment', message: 'Il foglio nella foto non combacia con questa partita. Usa il foglio stampato per questa partita, con le squadre di adesso.' };
  }
  const layout = layouts[bestIndex] as SheetLayout;
  const hm = bestHm as number[];

  type Cell = { row: ScanRow; kind: SheetKind; level: number };
  const cells: Cell[] = [];
  const rows: ScanRow[] = [];
  let missing = 0, total = 0;
  for (const table of layout.tables) {
    for (const row of table.rows) {
      const out: ScanRow = { team: row.team, index: row.index, gol: 0, assist: 0, autogol: 0, doubt: [] };
      rows.push(out);
      for (const kind of SHEET_KINDS) {
        for (const box of row.boxes[kind]) {
          total++;
          const level = ink(mask, w, h, hm, box, 0.56, 7);
          if (level === null) { missing++; continue; }
          cells.push({ row: out, kind, level });
        }
      }
    }
  }
  if (missing > total * 0.1) {
    return { ok: false, reason: 'bounds', message: 'Una parte del foglio è fuori dalla foto. Inquadra il foglio intero.' };
  }
  // la «base» è il livello di fondo delle caselle vuote (rumore, ombre leggere)
  const sorted = cells.map((c) => c.level).sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length / 2)] ?? 0;
  for (const c of cells) {
    const v = c.level - base;
    if (v >= MARK_LEVEL) c.row[c.kind]++;
    else if (v >= DOUBT_LEVEL && !c.row.doubt.includes(c.kind)) c.row.doubt.push(c.kind);
  }
  return { ok: true, rows, extraMarked: false, layoutIndex: bestIndex };
}

/** Segna se nelle righe vuote in fondo a ogni squadra c'è qualcosa (giocatori non in lista): da far notare all'utente. */
export function withExtras(res: ScanResult, namesA: number, namesB: number): ScanResult {
  if (!res.ok) return res;
  const extra = res.rows.some((r) => r.index >= (r.team === 'A' ? namesA : namesB) && (r.gol || r.assist || r.autogol));
  return { ...res, extraMarked: extra, rows: res.rows.filter((r) => r.index < (r.team === 'A' ? namesA : namesB)) };
}

/** Risultato calcolato dalle X: i gol di una squadra più gli autogol dell'altra. */
export function scoreFromRows(rows: Array<Pick<ScanRow, 'team' | 'gol' | 'autogol'>>): { a: number; b: number } {
  let a = 0, b = 0;
  for (const r of rows) {
    if (r.team === 'A') { a += r.gol; b += r.autogol; } else { b += r.gol; a += r.autogol; }
  }
  return { a, b };
}
