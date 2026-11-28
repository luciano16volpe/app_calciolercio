import { initials } from '../domain/format';
import type { PlayerWrap } from '../domain/playerWrap';
import { fitText, newShareCanvas, roundRect, SHARE_C, SHARE_FONT } from './share';

const plainTitle = (title: string) => title.replace(/^[^\p{L}\p{N}]+/u, '');

/** Immagine verticale condivisibile del riepilogo personale di fine stagione. */
export function drawPlayerWrap(name: string, wrap: PlayerWrap, photo: HTMLImageElement | null): HTMLCanvasElement {
  const W = 720;
  const awardsCount = Math.max(1, wrap.awards.length);
  const featsHeight = wrap.feats.length ? 64 + wrap.feats.length * 48 : 0;
  const H = 678 + awardsCount * 74 + featsHeight + 80;
  const { canvas, ctx } = newShareCanvas(W, H);
  const F = SHARE_FONT;
  const background = ctx.createLinearGradient(0, 0, W, H);
  background.addColorStop(0, '#10182b');
  background.addColorStop(.6, '#182339');
  background.addColorStop(1, '#0f1620');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2c94c';
  ctx.font = F('900 26px');
  ctx.textAlign = 'left';
  ctx.fillText('CALCIO LERCIO', 42, 63);
  ctx.fillStyle = SHARE_C.SUB;
  ctx.font = F('700 18px');
  ctx.fillText('IL TUO WRAP DI STAGIONE', 42, 93);
  ctx.fillStyle = SHARE_C.TXT;
  ctx.font = F('900 49px');
  const oneLine = ctx.measureText(name).width <= 460;
  if (oneLine) ctx.fillText(name, 42, 174);
  else {
    const words = name.trim().split(/\s+/);
    const middle = Math.max(1, Math.ceil(words.length / 2));
    ctx.font = F('900 41px');
    ctx.fillText(fitText(ctx, words.slice(0, middle).join(' '), 460), 42, words.length === 1 ? 174 : 153);
    if (words.length > 1) ctx.fillText(fitText(ctx, words.slice(middle).join(' '), 460), 42, 199);
  }
  ctx.fillStyle = '#f2c94c';
  ctx.font = F('800 29px');
  ctx.fillText(wrap.season, 42, oneLine ? 215 : 241);
  if (wrap.status === 'in chiusura') {
    ctx.fillStyle = SHARE_C.SUB;
    ctx.font = F('600 15px');
    ctx.fillText('Premi provvisori: la stagione è ancora in chiusura', 42, oneLine ? 243 : 262);
  }

  const cx = 592, cy = 158, radius = 82;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#345a81';
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  if (photo) {
    const side = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2,
      side, side, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = F('900 58px');
    ctx.textAlign = 'center';
    ctx.fillText(initials(name), cx, cy + 20);
  }
  ctx.restore();
  ctx.strokeStyle = '#f2c94c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
  ctx.stroke();

  const s = wrap.stats;
  const numbers: Array<[string, string]> = [
    ['PRESENZE', String(s?.pres ?? 0)], ['VITTORIE', String(s?.w ?? 0)], ['GOL', String(s?.goals ?? 0)],
    ['ASSIST', String(s?.assist ?? 0)], ['MEDIA VOTO', s?.voteAvg == null ? '—' : s.voteAvg.toFixed(2).replace('.', ',')], ['METE', String(s?.meta ?? 0)],
  ];
  numbers.forEach(([label, value], index) => {
    const x = 42 + index % 3 * 216;
    const y = 282 + Math.floor(index / 3) * 132;
    ctx.fillStyle = SHARE_C.CARD;
    roundRect(ctx, x, y, 200, 112, 16);
    ctx.fill();
    ctx.fillStyle = SHARE_C.SUB;
    ctx.font = F('800 16px');
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 18, y + 31);
    ctx.fillStyle = '#fff';
    ctx.font = F('900 47px');
    ctx.fillText(value, x + 18, y + 86);
  });
  ctx.fillStyle = SHARE_C.SUB;
  ctx.font = F('600 19px');
  ctx.textAlign = 'center';
  ctx.fillText(`${s?.w ?? 0} vinte  ·  ${s?.d ?? 0} pareggiate  ·  ${s?.l ?? 0} perse  ·  ${s?.votes.length ?? 0} pagelle`, W / 2, 563);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2c94c';
  ctx.font = F('900 27px');
  ctx.fillText('PREMI DI STAGIONE', 42, 637);
  wrap.awards.forEach((award, index) => {
    const y = 655 + index * 74;
    ctx.fillStyle = SHARE_C.CARD;
    roundRect(ctx, 42, y, 636, 65, 12);
    ctx.fill();
    ctx.fillStyle = award.shame ? '#fb7185' : '#f2c94c';
    ctx.font = F('800 20px');
    ctx.fillText(fitText(ctx, plainTitle(award.title), 340), 58, y + 27);
    ctx.textAlign = 'right';
    ctx.font = F('700 16px');
    ctx.fillText(fitText(ctx, award.value, 230), 662, y + 27);
    ctx.textAlign = 'left';
    ctx.fillStyle = SHARE_C.SUB;
    ctx.font = F('500 14px');
    ctx.fillText(fitText(ctx, award.description, 596), 58, y + 50);
  });
  if (!wrap.awards.length) {
    ctx.fillStyle = SHARE_C.SUB;
    ctx.font = F('600 18px');
    ctx.fillText('Nessun premio assegnato in questa stagione.', 42, 705);
  }
  if (wrap.feats.length) {
    const start = 678 + awardsCount * 74;
    ctx.fillStyle = '#f2c94c';
    ctx.font = F('900 27px');
    ctx.fillText('IMPRESE', 42, start + 18);
    wrap.feats.forEach((feat, index) => {
      const y = start + 48 + index * 48;
      ctx.fillStyle = SHARE_C.TXT;
      ctx.font = F('700 19px');
      ctx.fillText(`${plainTitle(feat.title)}  ×${feat.count}`, 42, y);
      ctx.fillStyle = SHARE_C.SUB;
      ctx.font = F('500 14px');
      ctx.fillText(feat.description, 42, y + 20);
    });
  }
  ctx.fillStyle = SHARE_C.SUB;
  ctx.textAlign = 'center';
  ctx.font = F('600 15px');
  ctx.fillText('CalcioLercio  ·  La tua stagione in numeri', W / 2, H - 28);
  return canvas;
}
