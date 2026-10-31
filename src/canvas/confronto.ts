// Immagine "manifesto" del confronto testa a testa tra due giocatori (720×1290, a doppia risoluzione).
// Fonte: drawCompareCard in legacy/index.html. Pensata per Safari: niente emoji nei testi centrati, numeri ancorati a destra/sinistra.
import { cmpLead, compareRows, headToHead, scopeLabel, type CompareRow, type HeadToHead } from '../domain/h2h';
import { initials } from '../domain/format';
import { futRating } from '../domain/ovr';
import { seasonsList } from '../domain/seasons';
import { playerSeason } from '../domain/stats';
import type { AlboRow } from '../domain/awards';
import type { Dataset, Player } from '../domain/types';
import { APP_VERSION, fitText, newShareCanvas, roundRect, SHARE_FONT } from './share';

export interface CompareFace {
  name: string;
  ini: string;
  ovr: number;
  /** media voto della stagione (null = nessun voto) */
  pag: number | null;
}

export interface CompareInput {
  a: CompareFace;
  b: CompareFace;
  /** 'all' = di sempre */
  scope: string;
  scopeName: string;
  h: HeadToHead;
  rows: CompareRow[];
}

const face = (data: Dataset, weights: number[], p: Player): CompareFace => ({
  name: p.name,
  ini: initials(p.name),
  ovr: futRating(p.stats, weights),
  pag: playerSeason(data, p)?.voteAvg ?? null,
});

export function compareInput(data: Dataset, weights: number[], albo: AlboRow[], pa: Player, pb: Player, scope: string): CompareInput {
  return {
    a: face(data, weights, pa),
    b: face(data, weights, pb),
    scope,
    scopeName: scopeLabel(seasonsList(data.matches, albo), scope),
    h: headToHead(data, pa, pb, scope),
    rows: compareRows(data, pa, pb, scope, albo),
  };
}

type Img = Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'> & CanvasImageSource;

/** `ims` = le due foto già caricate (o null: si disegnano le iniziali). */
export function drawCompare(c: CompareInput, ims: [Img | null, Img | null]): HTMLCanvasElement {
  const { h, rows } = c;
  const W = 720, H = 1290, { canvas, ctx } = newShareCanvas(W, H), F = SHARE_FONT, CA = '#f2c94c', CB = '#5aa9ff';
  const txt = (t: string, x: number, y: number, font: string, col: string, align?: CanvasTextAlign, shadow?: boolean) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.fillStyle = col;
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }
    ctx.fillText(t, x, y);
    ctx.restore();
  };
  // sfondo: palcoscenico scuro, due aloni colorati, raggi di luce
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#111a2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, 300);
  for (let k = 0; k < 24; k++) {
    ctx.rotate(Math.PI / 12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-40, -1000);
    ctx.lineTo(40, -1000);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.012)';
    ctx.fill();
  }
  ctx.restore();
  ([[200, CA], [520, CB]] as const).forEach(([hx, col]) => {
    const g = ctx.createRadialGradient(hx, 300, 20, hx, 300, 260);
    g.addColorStop(0, col + '55');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 700);
  });
  // titolo
  txt('TESTA A TESTA'.split('').join(' '), W / 2, 64, F('900 26px'), '#ffffff', 'center', true);
  txt(c.scope === 'all' ? 'Di sempre' : c.scopeName, W / 2, 96, F('700 18px'), '#9aa6ba');
  // giocatori
  const drawFace = (p: CompareFace, im: Img | null, cx: number, col: string) => {
    const r = 100, cy = 300;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (im) {
      const s = Math.max((2 * r) / im.naturalWidth, (2 * r) / im.naturalHeight), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
      ctx.drawImage(im, cx - iw / 2, cy - ih / 2, iw, ih);
    } else {
      const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
      g.addColorStop(0, '#2c3550');
      g.addColorStop(1, '#151b2b');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      txt(p.ini, cx, cy + 30, F('900 84px'), '#ffffff');
    }
    ctx.restore();
    // nomi lunghi: prima si rimpicciolisce il carattere, si taglia solo se ancora non basta
    let fs = 34;
    const N = p.name.toUpperCase();
    ctx.font = F('900 ' + fs + 'px');
    while (ctx.measureText(N).width > 300 && fs > 22) {
      fs -= 2;
      ctx.font = F('900 ' + fs + 'px');
    }
    txt(fitText(ctx, N, 300), cx, 448, F('900 ' + fs + 'px'), '#ffffff', 'center', true);
    txt(`OVR ${p.ovr}   ·   PAG ${p.pag != null ? p.pag.toFixed(1) : '—'}`, cx, 484, F('800 19px'), col);
  };
  drawFace(c.a, ims[0], 200, CA);
  drawFace(c.b, ims[1], 520, CB);
  txt('VS', W / 2, 322, F('900 60px'), '#ffffff', 'center', true);
  // testa a testa
  const box = (y: number, hh: number) => {
    roundRect(ctx, 60, y, 600, hh, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  box(520, 200);
  txt('DA AVVERSARI'.split('').join(' '), W / 2, 556, F('800 17px'), '#9aa6ba');
  if (h.vs.n) {
    txt(String(h.vs.a), W / 2 - 34, 640, F('900 86px'), CA, 'right', true);
    txt('–', W / 2, 632, F('900 60px'), '#6b778c');
    txt(String(h.vs.b), W / 2 + 34, 640, F('900 86px'), CB, 'left', true);
    const gd = h.vs.gd === 0 ? 'differenza reti in parità' : `differenza reti +${Math.abs(h.vs.gd)} per ${h.vs.gd > 0 ? c.a.name : c.b.name}`;
    ctx.font = F('600 18px');
    txt(fitText(ctx, `vittorie in ${h.vs.n} ${h.vs.n === 1 ? 'sfida' : 'sfide'}${h.vs.d ? ` · ${h.vs.d} pari` : ''} · ${gd}`, 560), W / 2, 676, F('600 18px'), '#c9d2e3');
  } else txt('mai affrontati', W / 2, 630, F('800 30px'), '#c9d2e3');
  txt(h.tog.n ? `Da compagni: ${h.tog.w} ${h.tog.w === 1 ? 'vinta' : 'vinte'} su ${h.tog.n}` : 'Mai nella stessa squadra', W / 2, 706, F('700 18px'), '#9aa6ba');
  // verdetto
  const leads = rows.map((r) => cmpLead(r.a, r.b, r.lowerIsBetter));
  const la = leads.filter((x) => x === 1).length, lb = leads.filter((x) => x === -1).length;
  const verdict = la === lb ? `Parità: ${la} voci a testa` : `${la > lb ? c.a.name : c.b.name} avanti in ${Math.max(la, lb)} voci su ${rows.length}`;
  ctx.font = F('900 22px');
  const vw = Math.min(600, ctx.measureText(verdict).width + 44);
  roundRect(ctx, W / 2 - vw / 2, 742, vw, 42, 21);
  ctx.fillStyle = la === lb ? 'rgba(255,255,255,0.12)' : (la > lb ? CA : CB) + '33';
  ctx.fill();
  ctx.strokeStyle = la === lb ? 'rgba(255,255,255,0.3)' : la > lb ? CA : CB;
  ctx.lineWidth = 2;
  ctx.stroke();
  txt(verdict, W / 2, 771, F('900 22px'), '#ffffff');
  // righe: etichette semplici (senza emoji), valori ancorati a sinistra/destra
  const plain = (l: string) => l.replace(/^[^\p{L}\p{N}%]+/u, '').trim();
  rows.forEach((r, k) => {
    const L = leads[k], y = 826 + k * 34;
    if (k % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(60, y - 23, 600, 32);
    }
    txt(r.text(r.a), 150, y, F((L === 1 ? '900' : '700') + ' 22px'), L === 1 ? CA : '#c9d2e3', 'right');
    txt(r.text(r.b), 570, y, F((L === -1 ? '900' : '700') + ' 22px'), L === -1 ? CB : '#c9d2e3', 'left');
    txt(plain(r.label) + (r.lowerIsBetter ? ' (meno è meglio)' : ''), W / 2, y, F('700 17px'), '#9aa6ba');
    if (L === 1) {
      ctx.beginPath();
      ctx.arc(170, y - 7, 5, 0, Math.PI * 2);
      ctx.fillStyle = CA;
      ctx.fill();
    }
    if (L === -1) {
      ctx.beginPath();
      ctx.arc(550, y - 7, 5, 0, Math.PI * 2);
      ctx.fillStyle = CB;
      ctx.fill();
    }
  });
  // piè di pagina
  txt('CalcioLercio · confronto ufficiale', W / 2, H - 40, F('italic 500 18px'), '#8a94a6');
  txt('v' + APP_VERSION, W / 2, H - 16, F('500 12px'), '#5d6676');
  return canvas;
}
