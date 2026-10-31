// Immagine del riepilogo di una partita: risultato, momenti chiave, pagelle di ogni giocatore con gol e assist.
// Fonte: shareMatchSummary in legacy/index.html.
import { formatDate } from '../domain/format';
import { matchHighlights, type MatchHighlights } from '../domain/matches';
import { normalizeTeam, playerKey } from '../domain/stats';
import type { Dataset, Match } from '../domain/types';
import { drawShareHeader, drawTeamBlock, fitText, newShareCanvas, roundRect, SHARE_C, SHARE_FONT } from './share';

export interface SummaryRow {
  name: string;
  /** voto (1–10) o niente se non votato */
  v: number | null;
  g: number;
  a: number;
  ag: number;
  mt: number;
  rs: number;
  tit: string;
}

export interface SummaryInput {
  date: unknown;
  notes: string;
  scoreA: unknown;
  scoreB: unknown;
  h: MatchHighlights;
  tA: SummaryRow[];
  tB: SummaryRow[];
}

/** Le righe delle pagelle per squadra (migliori voti per primi) e i momenti chiave, pronti da disegnare. */
export function summaryInput(data: Dataset, m: Match): SummaryInput {
  const ratings = data.ratings.filter((r) => r.matchId === m.id);
  const rowsFor = (team: Match['teamA']): SummaryRow[] =>
    normalizeTeam(team)
      .map((pl) => {
        const k = playerKey(data.players, pl.id, pl.name).key;
        const r = ratings.find((x) => playerKey(data.players, x.playerId, x.player).key === k);
        const v = r ? parseFloat(r.rating as string) : NaN;
        return {
          name: playerKey(data.players, pl.id, pl.name).name,
          v: !isNaN(v) && v >= 1 ? v : null,
          g: r ? parseInt(r.goals as string) || 0 : 0,
          a: r ? parseInt(r.assist as string) || 0 : 0,
          ag: r ? parseInt(r.autogol as string) || 0 : 0,
          mt: r ? parseInt(r.meta as string) || 0 : 0,
          rs: r ? parseInt(r.rigoriSbagliati as string) || 0 : 0,
          tit: r && r.titolo ? String(r.titolo).trim() : '',
        };
      })
      .sort((x, y) => (y.v ?? -1) - (x.v ?? -1) || x.name.localeCompare(y.name)); // miglior voto per primo
  return {
    date: m.date,
    notes: String(m.notes || '').trim(),
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    h: matchHighlights(data, m),
    tA: rowsFor(m.teamA),
    tB: rowsFor(m.teamB),
  };
}

export function drawSummary(s: SummaryInput): HTMLCanvasElement {
  const C = SHARE_C;
  const { h, tA, tB, notes } = s;
  // misure
  const W = 900, padX = 50, colGap = 40, colW = (W - 2 * padX - colGap) / 2;
  const sbY = notes ? 130 : 110, sbH = 128; // tabellone
  const hlY = sbY + sbH + 18, hlH = 84; // riquadri dei momenti chiave
  const tbY = hlY + hlH + 22, tbH = 58; // riquadri delle squadre
  const anyTit = [...tA, ...tB].some((p) => p.tit), rowH = anyTit ? 86 : 64, rowsY = tbY + tbH + 10; // righe più alte se ci sono i titoli
  const bodyRows = Math.max(tA.length, tB.length);
  const H = rowsY + bodyRows * rowH + 56;
  const { canvas, ctx } = newShareCanvas(W, H);
  drawShareHeader(ctx, W, 'Partita del ' + formatDate(s.date));
  if (notes) {
    ctx.fillStyle = C.SUB;
    ctx.font = SHARE_FONT('italic 500 17px');
    ctx.fillText(fitText(ctx, notes, W - 2 * padX), W / 2, 112);
  }

  // ── tabellone ──
  ctx.fillStyle = C.CARD;
  roundRect(ctx, padX, sbY, W - 2 * padX, sbH, 16);
  ctx.fill();
  const hasScore = s.scoreA !== '' && s.scoreA != null && s.scoreB !== '' && s.scoreB != null;
  const a = parseInt(s.scoreA as string), b = parseInt(s.scoreB as string);
  ctx.font = SHARE_FONT('800 26px');
  ctx.textAlign = 'left';
  ctx.fillStyle = C.BLUE;
  ctx.fillText('🔵 Blu', padX + 28, sbY + 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.WHITE;
  ctx.fillText('Bianchi ⚪', W - padX - 28, sbY + 56);
  ctx.font = SHARE_FONT('600 15px');
  ctx.fillStyle = C.SUB;
  ctx.textAlign = 'left';
  ctx.fillText('Media voto ' + (h.avgA != null ? h.avgA.toFixed(1) : '—'), padX + 28, sbY + 82);
  ctx.textAlign = 'right';
  ctx.fillText('Media voto ' + (h.avgB != null ? h.avgB.toFixed(1) : '—'), W - padX - 28, sbY + 82);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.TXT;
  ctx.font = SHARE_FONT('800 64px');
  ctx.fillText(hasScore ? `${a} – ${b}` : '– : –', W / 2, sbY + 78);
  let win = 'Risultato non inserito', winCol = C.SUB;
  if (hasScore) {
    if (a > b) {
      win = '🏆 Vince Blu';
      winCol = C.BLUE;
    } else if (b > a) {
      win = '🏆 Vince Bianchi';
      winCol = C.WHITE;
    } else {
      win = '🤝 Pareggio';
      winCol = C.SUB;
    }
  }
  ctx.font = SHARE_FONT('800 18px');
  ctx.fillStyle = winCol;
  ctx.fillText(win, W / 2, sbY + 112);

  // ── momenti chiave ──
  const worstOk = !!h.worst && !(h.mvp && h.worst.name === h.mvp.name);
  const tiles: Array<[string, string | null, string, string]> = [
    ['⭐ MVP', h.mvp ? h.mvp.name : null, h.mvp ? 'voto ' + h.mvp.v.toFixed(1) : '', '#3aad5e'],
    ['⚽ Capocannoniere', h.topScorer ? h.topScorer.name : null, h.topScorer ? h.topScorer.g + ' gol' : '', '#3aad5e'],
    ['🅰️ Assistman', h.topAssist ? h.topAssist.name : null, h.topAssist ? h.topAssist.a + ' assist' : '', '#3aad5e'],
    ['🥴 Peggiore', worstOk && h.worst ? h.worst.name : null, worstOk && h.worst ? 'voto ' + h.worst.v.toFixed(1) : '', '#e05c5c'],
  ];
  const tGap = 12, tW = (W - 2 * padX - 3 * tGap) / 4;
  tiles.forEach(([lbl, name, val, col], i) => {
    const x = padX + i * (tW + tGap);
    ctx.fillStyle = C.CARD;
    roundRect(ctx, x, hlY, tW, hlH, 12);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.SUB;
    ctx.font = SHARE_FONT('600 14px');
    ctx.fillText(fitText(ctx, lbl, tW - 24), x + 12, hlY + 24);
    ctx.fillStyle = name ? C.TXT : C.SUB;
    ctx.font = SHARE_FONT('800 19px');
    ctx.fillText(fitText(ctx, name || '—', tW - 24), x + 12, hlY + 50);
    if (val) {
      ctx.fillStyle = col;
      ctx.font = SHARE_FONT('700 15px');
      ctx.fillText(val, x + 12, hlY + 72);
    }
  });

  // ── pagelle delle squadre ──
  const xA = padX, xB = padX + colW + colGap;
  const cntPlayed = (t: SummaryRow[]) => t.filter((p) => p.v != null).length;
  drawTeamBlock(ctx, xA, tbY, colW, tbH, true, hasScore ? `${a} gol · ${cntPlayed(tA)} votati` : `${cntPlayed(tA)} votati`);
  drawTeamBlock(ctx, xB, tbY, colW, tbH, false, hasScore ? `${b} gol · ${cntPlayed(tB)} votati` : `${cntPlayed(tB)} votati`);
  const voteCol = (v: number | null) => (v == null ? C.SUB : v >= 6.5 ? '#3aad5e' : v < 5.5 ? '#e05c5c' : '#e0a92e');
  const drawRows = (x: number, team: SummaryRow[]) => {
    let y = rowsY;
    team.forEach((p) => {
      ctx.fillStyle = C.CARD;
      roundRect(ctx, x, y, colW, rowH - 8, 10);
      ctx.fill();
      const isMvp = h.mvp && p.name === h.mvp.name;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.TXT;
      ctx.font = SHARE_FONT('700 20px');
      ctx.fillText(fitText(ctx, (isMvp ? '⭐ ' : '') + p.name, colW - 90), x + 16, y + 25);
      if (p.tit) {
        ctx.fillStyle = '#f2c94c';
        ctx.font = SHARE_FONT('italic 700 16px');
        ctx.fillText(fitText(ctx, '«' + p.tit + '»', colW - 90), x + 16, y + 48);
      }
      const chips = [p.g ? `⚽ ${p.g}` : '', p.a ? `🅰️ ${p.a}` : '', p.ag ? `🙃 ${p.ag}` : '', p.rs ? `❌ ${p.rs}` : '', p.mt ? `🚀 ${p.mt}` : '']
        .filter(Boolean)
        .join('   ');
      if (chips) {
        ctx.fillStyle = C.SUB;
        ctx.font = SHARE_FONT('600 15px');
        ctx.fillText(fitText(ctx, chips, colW - 90), x + 16, y + (anyTit ? 70 : 46));
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = voteCol(p.v);
      ctx.font = SHARE_FONT('800 28px');
      ctx.fillText(p.v != null ? (Number.isInteger(p.v) ? String(p.v) : p.v.toFixed(1)) : '—', x + colW - 16, y + (rowH - 8) / 2 + 10);
      y += rowH;
    });
  };
  drawRows(xA, tA);
  drawRows(xB, tB);

  // piè di pagina
  ctx.textAlign = 'center';
  ctx.fillStyle = C.SUB;
  ctx.font = SHARE_FONT('italic 500 14px');
  ctx.fillText('✒️ pagelle a cura della Redazione Avv. Peppe Rella', W / 2, H - 22);
  return canvas;
}
