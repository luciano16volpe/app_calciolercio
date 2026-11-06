// Strumenti comuni delle immagini da condividere (figurina, riepilogo, formazioni, foglio, confronto).
// Fonte: SHARE_C, SHARE_FONT, newShareCanvas, fitText, drawShareHeader, drawTeamBlock, roundRect in legacy/index.html.
// Regole imparate a caro prezzo (vedi CLAUDE.md): testo centrato sempre misurato con measureText, niente emoji con U+FE0F
// nei testi centrati, doppia risoluzione.

export type Ctx = CanvasRenderingContext2D;

export const SHARE_C = { BLUE: '#3a8fef', WHITE: '#e9ecf2', BG: '#0f1620', CARD: '#1a2230', TXT: '#eef2f8', SUB: '#8a94a6' };
export const SHARE_FONT = (w: string): string => `${w} system-ui,-apple-system,sans-serif`;

let makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas');
/** Solo per i test: sostituisce il modo di creare la tela (così si può registrare tutto ciò che viene disegnato). */
export function setCanvasFactory(f: () => HTMLCanvasElement): void {
  makeCanvas = f;
}

/** Tela a doppia risoluzione: si disegna in coordinate W×H, esce a (W×2)×(H×2). */
export function newCanvas(W: number, H: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const scale = 2;
  const canvas = makeCanvas();
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

/** Tela con lo sfondo scuro dell'app. */
export function newShareCanvas(W: number, H: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const r = newCanvas(W, H);
  r.ctx.fillStyle = SHARE_C.BG;
  r.ctx.fillRect(0, 0, W, H);
  return r;
}

/** Accorcia il testo con … perché stia in maxW (con il font attuale). */
export function fitText(ctx: Ctx, txt: unknown, maxW: number): string {
  let t = String(txt || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

export function drawShareHeader(ctx: Ctx, W: number, subtitle: string): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = SHARE_C.TXT;
  ctx.font = SHARE_FONT('800 38px');
  ctx.fillText('⚽ CalcioLercio', W / 2, 56);
  ctx.fillStyle = SHARE_C.SUB;
  ctx.font = SHARE_FONT('600 19px');
  ctx.fillText(fitText(ctx, subtitle, W - 60), W / 2, 86); // luogo lungo: accorciato, non esce dall'immagine
}

/** Rettangolo con gli angoli arrotondati (solo il tracciato: poi fill/stroke). */
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Riquadro colorato della squadra (Blu = azzurro e testo bianco, Bianchi = argento e testo scuro). */
export function drawTeamBlock(ctx: Ctx, x: number, y: number, w: number, h: number, isBlue: boolean, line2: string): void {
  ctx.fillStyle = isBlue ? SHARE_C.BLUE : SHARE_C.WHITE;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = isBlue ? '#fff' : '#16202c';
  ctx.textAlign = 'left';
  ctx.font = SHARE_FONT('800 24px');
  ctx.fillText(isBlue ? '🔵 Blu' : '⚪ Bianchi', x + 18, y + 27);
  ctx.font = SHARE_FONT('600 15px');
  ctx.globalAlpha = 0.92;
  ctx.fillText(line2, x + 18, y + 48);
  ctx.globalAlpha = 1;
}

/** Versione dell'app scritta in fondo alle immagini (stessa di legacy: serve a riconoscere le immagini nuove da quelle vecchie). */
export const APP_VERSION = '2026.10.30-l';
