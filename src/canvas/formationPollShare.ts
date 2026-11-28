import type { FormationOption } from '../data/formationPolls';
import { formatDate } from '../domain/format';
import { drawShareHeader, fitText, newShareCanvas, roundRect, SHARE_C, SHARE_FONT } from './share';

/** Invito WhatsApp con tutte le proposte, leggibile anche fuori dall'app. */
export function drawFormationPollShare(date: string, closesAt: string, options: FormationOption[], names: Map<string, string>): HTMLCanvasElement {
  const W = 900;
  const rowHeight = 31;
  const cardHeight = 86 + Math.max(1, ...options.map((option) => Math.max(option.team_a.length, option.team_b.length))) * rowHeight;
  const H = 280 + options.length * (cardHeight + 20) + 94;
  const { canvas, ctx } = newShareCanvas(W, H);
  drawShareHeader(ctx, W, `Partita del ${formatDate(date)}`);

  ctx.textAlign = 'center';
  ctx.fillStyle = SHARE_C.TXT;
  ctx.font = SHARE_FONT('800 42px');
  ctx.fillText('SCEGLI LE SQUADRE', W / 2, 154);
  ctx.font = SHARE_FONT('600 21px');
  ctx.fillStyle = SHARE_C.SUB;
  ctx.fillText('Tutti i membri della lega possono votare, anche se non giocano', W / 2, 191);
  const closing = new Date(closesAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  ctx.fillStyle = '#f2c94c';
  ctx.font = SHARE_FONT('700 22px');
  ctx.fillText(`Votazione aperta fino al ${closing}`, W / 2, 235);

  options.forEach((option, index) => {
    const y = 280 + index * (cardHeight + 20);
    ctx.fillStyle = SHARE_C.CARD;
    roundRect(ctx, 42, y, W - 84, cardHeight, 20);
    ctx.fill();
    ctx.fillStyle = SHARE_C.TXT;
    ctx.textAlign = 'center';
    ctx.font = SHARE_FONT('800 27px');
    ctx.fillText(option.option_no === 1 ? 'Formazione dell’admin' : `Alternativa ${option.option_no}`, W / 2, y + 38);
    const sides = [
      { label: 'BLU', players: option.team_a, x: 70, color: SHARE_C.BLUE },
      { label: 'BIANCHI', players: option.team_b, x: 465, color: SHARE_C.WHITE },
    ];
    sides.forEach((side) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = side.color;
      ctx.font = SHARE_FONT('800 21px');
      ctx.fillText(side.label, side.x, y + 76);
      ctx.fillStyle = SHARE_C.TXT;
      ctx.font = SHARE_FONT('600 20px');
      side.players.forEach((id, i) => ctx.fillText(fitText(ctx, names.get(id) ?? 'Giocatore', 340), side.x, y + 106 + i * rowHeight));
    });
  });

  ctx.fillStyle = '#f2c94c';
  ctx.textAlign = 'center';
  ctx.font = SHARE_FONT('800 25px');
  ctx.fillText('Apri il link nel messaggio e scegli la tua formazione', W / 2, H - 57);
  return canvas;
}
