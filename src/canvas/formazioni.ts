// Immagine delle formazioni (usata da Gioca e dalle partite salvate).
import { fitText, newShareCanvas, drawShareHeader, drawTeamBlock, roundRect, SHARE_C, SHARE_FONT } from './share';

export interface FormationPlayer {
  name: string;
  score: number | null;
  role: string;
}

export interface FormationsInput {
  tA: FormationPlayer[];
  tB: FormationPlayer[];
  sA: number | null;
  sB: number | null;
  modA: string;
  modB: string;
  diff: number | null;
  subtitle: string;
}

export function drawFormations(o: FormationsInput): HTMLCanvasElement {
  const W = 900, padX = 50, colGap = 40, headerH = 190, rowH = 58, footH = 70;
  const bodyRows = Math.max(o.tA.length, o.tB.length);
  const H = headerH + bodyRows * rowH + (o.diff != null ? footH : 20) + 30;
  const { canvas, ctx } = newShareCanvas(W, H);
  drawShareHeader(ctx, W, o.subtitle);

  const colW = (W - 2 * padX - colGap) / 2, xA = padX, xB = padX + colW + colGap;
  const avgTxt = (v: number | null) => 'Media ' + (v != null ? v.toFixed(1) : '—');
  drawTeamBlock(ctx, xA, 110, colW, 58, true, (o.modA ? o.modA + '  ·  ' : '') + avgTxt(o.sA));
  drawTeamBlock(ctx, xB, 110, colW, 58, false, (o.modB ? o.modB + '  ·  ' : '') + avgTxt(o.sB));

  const drawRows = (x: number, team: FormationPlayer[], accent: string) => {
    let y = headerH - 8;
    team.forEach((p) => {
      ctx.fillStyle = SHARE_C.CARD;
      roundRect(ctx, x, y, colW, rowH - 8, 10);
      ctx.fill();
      ctx.fillStyle = p.role === 'ATT' ? '#ef5350' : p.role === 'DIF' ? '#42a5f5' : '#66bb6a';
      ctx.beginPath();
      ctx.arc(x + 22, y + (rowH - 8) / 2, 7, 0, 7);
      ctx.fill();
      ctx.fillStyle = SHARE_C.TXT;
      ctx.textAlign = 'left';
      ctx.font = SHARE_FONT('700 21px');
      ctx.fillText(fitText(ctx, p.name, colW - 110), x + 40, y + (rowH - 8) / 2 + 7);
      ctx.fillStyle = accent;
      ctx.textAlign = 'right';
      ctx.font = SHARE_FONT('800 20px');
      ctx.fillText(p.score != null ? p.score.toFixed(1) : '—', x + colW - 16, y + (rowH - 8) / 2 + 7);
      y += rowH;
    });
  };
  drawRows(xA, o.tA, SHARE_C.BLUE);
  drawRows(xB, o.tB, SHARE_C.WHITE);

  if (o.diff != null) {
    const fy = H - footH + 10, balOk = o.diff <= 0.5;
    ctx.textAlign = 'center';
    ctx.fillStyle = balOk ? '#2e7d32' : '#b8860b';
    roundRect(ctx, W / 2 - 180, fy, 360, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = SHARE_FONT('700 18px');
    ctx.fillText((balOk ? '✓ Squadre bilanciate' : '⚠ Differenza media') + '  ·  diff ' + o.diff.toFixed(2), W / 2, fy + 26);
  }
  return canvas;
}
