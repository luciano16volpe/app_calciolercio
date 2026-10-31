// Figurina in stile FIFA (720×1140, a doppia risoluzione). Fonte: drawFutCard, FUT_SHORT, seasonShort in legacy/index.html.
// Valutazione = OVR × 10. Il disegno cambia con la fascia (Top, Oro, Argento, Bronzo, Cacca, Marcia) e con lo stato di forma
// (🔥 ON FIRE, 🌧️ IN CRISI). In basso le medaglie dei trofei vinti.
import { FEATS } from '../domain/awards';
import { formState, playerRatingAvg, type FormState } from '../domain/form';
import { initials, noVS } from '../domain/format';
import { FUT_STATS, futRating, futStat, futTierOfRating } from '../domain/ovr';
import { playerTrophies, type PlayerTrophies } from '../domain/playerCard';
import { playerSeason, seasonStats } from '../domain/stats';
import { FORM_STATES, FUT_TIERS } from '../domain/tiers';
import type { AlboRow } from '../domain/awards';
import type { Dataset, Player } from '../domain/types';
import { primaryRole } from '../domain/gioca';
import { APP_VERSION, fitText, newShareCanvas, roundRect, SHARE_FONT } from './share';

/** Didascalie corte delle medaglie. */
export const FUT_SHORT: Record<string, string> = {
  goleador: 'Goleador', assistman: 'Assist', media: 'Top media', mvp: 'Re MVP', stelle: 'Re Stelle', stakanov: 'Presenze',
  coppia: 'Coppia', flop: 'Flop media', cucchiaio: 'Cucchiaio', rigori: 'Rigori', autogol: 'Autogol',
  occMedia: 'Top occas.', occBomber: 'Gettone', occFortuna: 'Portafortuna', occPendolare: 'Pendolare',
};
/** "Estate 2026" → "Est 26". */
export const seasonShort = (label: string): string =>
  label.replace('Primavera', 'Pri').replace('Estate', 'Est').replace('Autunno', 'Aut').replace('Inverno', 'Inv').replace(/ 20(\d\d)/, ' $1').replace(/\/(\d\d)$/, '/$1');

/** Tutto ciò che serve a disegnare la figurina di un giocatore. */
export interface FutCardModel {
  name: string;
  /** iniziali, per quando manca la foto */
  ini: string;
  roles: string[];
  tier: keyof typeof FUT_TIERS;
  rating: number;
  /** media voto della stagione (null = nessun voto) */
  pag: number | null;
  form: FormState | null;
  stats: Array<[string, number]>;
  trophies: PlayerTrophies;
  /** numeri della stagione (null = nessuna partita ancora) */
  season: { pres: number; w: number; goals: number; assist: number } | null;
}

export function futCardModel(data: Dataset, weights: number[], albo: AlboRow[], p: Player, today?: string): FutCardModel {
  const all = seasonStats(data);
  const a = playerSeason(data, p, all);
  const rating = futRating(p.stats, weights);
  return {
    name: p.name,
    ini: initials(p.name),
    roles: p.roles ?? [],
    tier: futTierOfRating(rating),
    rating,
    pag: playerRatingAvg(a).avg,
    form: formState(data, p, all),
    stats: FUT_STATS.map(([l, idx]) => [l, futStat(p.stats, idx)] as [string, number]),
    trophies: playerTrophies(data, p, albo, today),
    season: a && a.pres ? { pres: a.pres, w: a.w, goals: a.goals, assist: a.assist } : null,
  };
}

type Img = Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight' | 'complete'> & CanvasImageSource;

/** `photoImg` = foto già caricata (o null: si disegnano le iniziali); `logo` = logo dell'app in alto (o null). */
export function drawFutCard(p: FutCardModel, photoImg: Img | null, logo: Img | null): HTMLCanvasElement {
  const t = FUT_TIERS[p.tier], tr = p.trophies;
  const fire = p.form === 'up', crisi = p.form === 'down';
  const W = 720, H = 1140, { canvas, ctx } = newShareCanvas(W, H);
  const F = SHARE_FONT, x = 60, y = 48, w = 600, h = 1000, cx = x + w / 2;
  // posizioni delle scintille decise dal nome (stessa figurina → stessa immagine)
  let seed = [...p.name].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // ── sfondo: palcoscenico scuro, raggi di luce, alone, scintille ──
  ctx.fillStyle = '#0a0e16';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.42);
  for (let k = 0; k < 24; k++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-38, -900);
    ctx.lineTo(38, -900);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? t.glow + '0d' : t.glow + '05';
    ctx.fill();
  }
  ctx.restore();
  // una lingua di fuoco: base al centro (fx,fy), larghezza fw, altezza fh, verso l'alto; lean = quanto la punta si piega di lato
  const flame = (fx: number, fy: number, fw: number, fh: number, alpha: number, lean: number) => {
    const g = ctx.createLinearGradient(0, fy, 0, fy - fh);
    g.addColorStop(0, `rgba(255,120,20,0)`);
    g.addColorStop(0.12, `rgba(255,196,70,${alpha})`);
    g.addColorStop(0.45, `rgba(255,128,24,${alpha * 0.9})`);
    g.addColorStop(0.8, `rgba(214,42,8,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(160,10,0,0)');
    const tx = fx + lean, ty = fy - fh;
    ctx.beginPath();
    ctx.moveTo(fx - fw / 2, fy);
    ctx.bezierCurveTo(fx - fw * 0.55, fy - fh * 0.35, tx - fw * 0.35 + lean * 0.2, fy - fh * 0.55, tx - fw * 0.06, fy - fh * 0.86); // lato sinistro, che si piega
    ctx.quadraticCurveTo(tx, ty - fh * 0.04, tx + fw * 0.04, ty); // punta
    ctx.bezierCurveTo(tx + fw * 0.18, fy - fh * 0.7, fx + fw * 0.48, fy - fh * 0.45, fx + fw / 2, fy); // lato destro
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  };
  const fireBand = (front: boolean) => {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let fx = x - 50; fx <= x + w + 50; fx += front ? 38 : 27 + rnd() * 12) {
      const edge = Math.min(1, Math.abs(fx - cx) / (w / 2)), side = fx < cx ? -1 : 1; // più alte ai lati: salgono sui bordi della carta
      const fh = front ? 28 + rnd() * 40 : 70 + edge * 320 + rnd() * 110, fw = front ? 30 + rnd() * 24 : 34 + rnd() * 44;
      const base = front ? y + h + 18 : y + h + 46 - edge * 80;
      flame(fx, base, fw, fh, front ? 0.7 : 0.85, (rnd() - 0.5) * fw * 0.9 + side * edge * (18 + rnd() * 30));
      if (!front && rnd() > 0.45) flame(fx + (rnd() - 0.5) * 16, base, fw * 0.55, fh * (0.55 + rnd() * 0.3), 0.9, (rnd() - 0.5) * fw * 0.7); // lingua interna più luminosa
    }
    ctx.restore();
  };
  // 🌧️ temporale: pioggia obliqua, nuvole scure, fulmine
  const rain = (n: number, alpha: number, y0: number, y1: number) => {
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const rx = rnd() * (W + 80), ry = y0 + rnd() * (y1 - y0), L = 16 + rnd() * 24;
      ctx.strokeStyle = `rgba(180,198,222,${alpha * (0.6 + rnd() * 0.4)})`;
      ctx.lineWidth = 1 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - L * 0.34, ry + L);
      ctx.stroke();
    }
    ctx.restore();
  };
  const cloud = (c0x: number, c0y: number, s: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, c0y - 70 * s, 0, c0y + 45 * s);
    g.addColorStop(0, '#6b7686');
    g.addColorStop(1, '#262c36');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ([[-78, 12, 40], [-38, -12, 52], [16, -24, 60], [66, -4, 48], [104, 16, 34], [-112, 22, 28]] as const).forEach(([dx, dy, r]) => {
      ctx.moveTo(c0x + dx * s + r * s, c0y + dy * s);
      ctx.arc(c0x + dx * s, c0y + dy * s, r * s, 0, Math.PI * 2);
    });
    ctx.moveTo(c0x - 118 * s, c0y + 20 * s);
    ctx.rect(c0x - 118 * s, c0y + 8 * s, 248 * s, 38 * s);
    ctx.fill();
    ctx.restore();
  };
  const bolt = (bx: number, by: number, s: number) => {
    ctx.save();
    ctx.shadowColor = '#ffe680';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - 26 * s, by + 92 * s);
    ctx.lineTo(bx - 6 * s, by + 92 * s);
    ctx.lineTo(bx - 30 * s, by + 200 * s);
    ctx.lineTo(bx + 22 * s, by + 70 * s);
    ctx.lineTo(bx + 2 * s, by + 70 * s);
    ctx.lineTo(bx + 22 * s, by);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  if (crisi) {
    // palcoscenico coperto: luce grigio-azzurra, pioggia dietro la carta, nuvole pesanti e un fulmine a sinistra
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, 'rgba(60,72,90,0.55)');
    sg.addColorStop(1, 'rgba(20,26,36,0.2)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    rain(150, 0.45, -40, H);
    bolt(44, y + 40, 1);
  }
  if (fire) {
    // braci che salgono e bagliore arancione di fornace dietro la carta
    const fg = ctx.createRadialGradient(W / 2, y + h * 0.8, 80, W / 2, y + h * 0.8, 620);
    fg.addColorStop(0, 'rgba(255,110,0,0.45)');
    fg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 46; k++) {
      const ex = 20 + rnd() * (W - 40), ey = H * 0.25 + rnd() * H * 0.72;
      ctx.save();
      ctx.globalAlpha = 0.35 + rnd() * 0.6;
      ctx.shadowColor = '#ff7a00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.2 + rnd() * 3, 0, Math.PI * 2);
      ctx.fillStyle = rnd() > 0.5 ? '#ffd166' : '#ff8a1f';
      ctx.fill();
      ctx.restore();
    }
  }
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, 560);
  glow.addColorStop(0, t.glow + '66');
  glow.addColorStop(0.55, t.glow + '1a');
  glow.addColorStop(1, t.glow + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const star = (sx: number, sy: number, r: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = t.spark;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.quadraticCurveTo(sx, sy, sx + r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy + r);
    ctx.quadraticCurveTo(sx, sy, sx - r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy - r);
    ctx.fill();
    ctx.restore();
  };
  for (let k = 0; k < 16; k++) {
    const side = k % 2, sx = side ? W - 12 - rnd() * 52 : 12 + rnd() * 52, sy = 40 + rnd() * (H - 120);
    if (t.critter) {
      ctx.save();
      ctx.globalAlpha = 0.55 + rnd() * 0.35;
      ctx.textAlign = 'left';
      ctx.font = F('400 ' + Math.round(18 + rnd() * 16) + 'px');
      ctx.fillText(t.critter, side ? W - 50 + rnd() * 8 : 6 + rnd() * 8, sy);
      ctx.restore();
    } else if (!crisi) star(sx, sy, 4 + rnd() * 9, 0.35 + rnd() * 0.5);
  }

  // ── sagoma dello scudo (k = rientro) ──
  const shield = (k: number) => {
    const X = x + k, Y = y + k, Wd = w - 2 * k, Ht = h - 2 * k, c = 46 - k * 0.6;
    ctx.beginPath();
    ctx.moveTo(X + c, Y);
    ctx.lineTo(X + Wd - c, Y);
    ctx.lineTo(X + Wd, Y + c);
    ctx.lineTo(X + Wd, Y + Ht - 140);
    ctx.quadraticCurveTo(X + Wd, Y + Ht - 40, X + Wd / 2, Y + Ht);
    ctx.quadraticCurveTo(X, Y + Ht - 40, X, Y + Ht - 140);
    ctx.lineTo(X, Y + c);
    ctx.closePath();
  };
  // corpo: alone colorato + ombra + metallo a bande
  if (fire) fireBand(false); // fiamme dietro la carta, che salgono sui lati
  if (crisi) {
    cloud(W * 0.27, y + 4, 1.25, 0.97);
    cloud(W * 0.74, y - 8, 1.45, 0.97);
  } // nuvole dietro la carta, che spuntano sopra
  ctx.save();
  ctx.shadowColor = fire ? '#ff6a00' : crisi ? '#56677e' : t.glow + 'aa';
  ctx.shadowBlur = fire ? 90 : 70;
  shield(0);
  ctx.fillStyle = t.metal[1];
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  const g = ctx.createLinearGradient(x, y, x + w * 0.85, y + h);
  [0, 0.28, 0.5, 0.68, 1].forEach((st, k) => g.addColorStop(st, t.metal[k] as string));
  shield(0);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  ctx.save();
  shield(0);
  ctx.clip();
  // righine sottili
  ctx.strokeStyle = t.stripe;
  ctx.lineWidth = 2;
  for (let k = -h; k < w + h; k += 11) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k - h * 0.55, y + h);
    ctx.stroke();
  }
  // schegge geometriche dietro valutazione e foto
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.moveTo(x, y + 70);
  ctx.lineTo(x + 250, y);
  ctx.lineTo(x + 300, y);
  ctx.lineTo(x + 70, y + 520);
  ctx.lineTo(x, y + 560);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.beginPath();
  ctx.moveTo(x + w, y + 300);
  ctx.lineTo(x + w - 260, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  // faro dietro la foto
  const spx = x + 392, spy = y + 228, sp = ctx.createRadialGradient(spx, spy, 20, spx, spy, 250);
  sp.addColorStop(0, t.holo ? 'rgba(247,215,116,0.30)' : 'rgba(255,255,255,0.55)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp;
  ctx.fillRect(x, y, w, h);
  // lucido in alto
  const gl = ctx.createLinearGradient(0, y, 0, y + 260);
  gl.addColorStop(0, 'rgba(255,255,255,0.38)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x, y, w, 260);
  // banda di riflesso diagonale
  const sh = ctx.createLinearGradient(x, y, x + w, y + h * 0.7);
  sh.addColorStop(0.38, 'rgba(255,255,255,0)');
  sh.addColorStop(0.47, 'rgba(255,255,255,0.32)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  sh.addColorStop(0.53, 'rgba(255,255,255,0.22)');
  sh.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, w, h);
  // arcobaleno olografico (Top player)
  if (t.holo) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.32;
    const hg = ctx.createLinearGradient(x, y + h, x + w, y);
    ['#ff4d6d', '#ffb703', '#8ac926', '#00bbf9', '#9b5de5', '#ff4d6d'].forEach((c, k) => hg.addColorStop(k / 5, c));
    ctx.fillStyle = hg;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // vignettatura
  const vg = ctx.createRadialGradient(cx, y + h * 0.45, h * 0.25, cx, y + h * 0.45, h * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // doppio bordo in rilievo
  shield(3);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.stroke();
  shield(16);
  ctx.strokeStyle = t.line;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  shield(20);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (crisi) {
    ctx.save();
    shield(0);
    ctx.clip();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128,128,128,0.55)';
    ctx.fillRect(x, y, w, h); // colori sbiaditi (non troppo scuri)
    ctx.globalCompositeOperation = 'source-over';
    const oc = ctx.createLinearGradient(0, y, 0, y + 340);
    oc.addColorStop(0, 'rgba(18,24,34,0.28)');
    oc.addColorStop(1, 'rgba(18,24,34,0)');
    ctx.fillStyle = oc;
    ctx.fillRect(x, y, w, 340);
    ctx.restore();
  }
  if (fire) {
    ctx.save();
    shield(0);
    ctx.clip(); // calore su tutta la carta
    const hg = ctx.createLinearGradient(0, y + h, 0, y);
    hg.addColorStop(0, 'rgba(255,90,0,0.34)');
    hg.addColorStop(0.55, 'rgba(255,150,0,0.12)');
    hg.addColorStop(1, 'rgba(255,190,60,0.04)');
    ctx.fillStyle = hg;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // testo in rilievo
  const etext = (txt: string, tx: number, ty: number, font: string, col: string, align?: CanvasTextAlign) => {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.save();
    ctx.fillStyle = t.emboss;
    ctx.fillText(txt, tx, ty + 2.5);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = col;
    ctx.fillText(txt, tx, ty);
    ctx.restore();
  };

  // ── foto (o grandi iniziali) in un cerchio; l'anello segue lo stato: 🔥 corona di fiamme · 🌧️ temporale · altrimenti il metallo della fascia ──
  const ps = 320, S = 290, ox = x + 232 + (ps - S) / 2, oy = y + 64 + (ps - S) / 2 - 4, ccx = ox + S / 2, ccy = oy + S / 2, R = S / 2;
  const circ = (r: number) => {
    ctx.beginPath();
    ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
  };
  if (fire) {
    // 🔥 anello incandescente: largo bagliore caldo e scintille sopra la foto
    ctx.save();
    const gl2 = ctx.createRadialGradient(ccx, ccy, R - 10, ccx, ccy, R + 60);
    gl2.addColorStop(0, 'rgba(255,140,0,0.75)');
    gl2.addColorStop(0.5, 'rgba(255,70,0,0.3)');
    gl2.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = gl2;
    ctx.beginPath();
    ctx.arc(ccx, ccy, R + 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (let k = 0; k < 38; k++) {
      const a = Math.PI * 1.05 + rnd() * Math.PI * 0.9, d = R + 6 + rnd() * 70, sx = ccx + Math.cos(a) * d, sy = ccy + Math.sin(a) * d - rnd() * 30;
      ctx.save();
      ctx.globalAlpha = 0.5 + rnd() * 0.5;
      ctx.shadowColor = '#ff7a00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + rnd() * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = rnd() > 0.5 ? '#ffd166' : '#ff8a1f';
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.shadowColor = fire ? '#ff6a00' : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = fire ? 40 : 22;
  ctx.shadowOffsetY = fire ? 0 : 6;
  circ(R);
  ctx.fillStyle = t.metal[3];
  ctx.fill();
  ctx.restore();
  ctx.save();
  circ(R);
  ctx.clip();
  if (photoImg) {
    const sc = Math.max(S / photoImg.naturalWidth, S / photoImg.naturalHeight), iw = photoImg.naturalWidth * sc, ih = photoImg.naturalHeight * sc;
    ctx.drawImage(photoImg, ox + (S - iw) / 2, oy + (S - ih) / 2, iw, ih);
  } else {
    const ig = ctx.createRadialGradient(ccx - 30, ccy - 40, 10, ccx, ccy, R);
    ig.addColorStop(0, 'rgba(255,255,255,0.45)');
    ig.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = ig;
    ctx.fillRect(ox, oy, S, S);
    etext(p.ini, ccx, ccy + 40, F('900 112px'), t.text);
  }
  if (crisi) {
    // 🌧️ la foto resta a colori: luce fredda e pioggia
    ctx.fillStyle = 'rgba(40,70,110,0.14)';
    ctx.fillRect(ox, oy, S, S);
    rain(110, 0.5, oy - 20, oy + S);
  }
  ctx.restore();
  const ringC = fire ? ['#fff1a8', '#ff8a00', '#e0230b'] : crisi ? ['#c3ccd8', '#5d6a7d', '#2c3440'] : [t.line, t.metal[2], t.line];
  const rg = ctx.createLinearGradient(ox, oy, ox + S, oy + S);
  rg.addColorStop(0, ringC[0] as string);
  rg.addColorStop(0.5, ringC[1] as string);
  rg.addColorStop(1, ringC[2] as string);
  ctx.save();
  if (fire) {
    ctx.shadowColor = '#ff8a00';
    ctx.shadowBlur = 18;
  }
  circ(R);
  ctx.lineWidth = fire || crisi ? 11 : 9;
  ctx.strokeStyle = rg;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  circ(R - 6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();
  if (crisi) {
    cloud(ox + S * 0.2, oy + 10, 0.5, 0.97);
    bolt(ox + S * 0.1, oy + 34, 0.5);
  } // un piccolo temporale sull'anello

  // ── fascia in alto, poi valutazione + badge PAGELLE (stessi colori dell'app), ruoli, logo ──
  etext(t.label.split('').join(' '), cx, y + 40, F('800 17px'), t.sub);
  const lx = x + 128;
  etext(String(p.rating), lx, y + 176, F('900 118px'), t.text);
  const pv = p.pag;
  const pc = pv == null ? ['#c9ced6', '#8d95a2', '#2e333b'] : pv >= 6.5 ? ['#5fd184', '#1f7a3a', '#0d3d1c'] : pv < 5.5 ? ['#f07a6c', '#b3261e', '#5c0f0a'] : ['#ffd36b', '#c98b00', '#5e4100'];
  const bw = 150, bh = 50, bx = lx - bw / 2, by = y + 196;
  // pillola scura + valore nel colore della fascia → si legge su ogni fascia (oro, argento, bronzo, in forma)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  const pg = ctx.createLinearGradient(0, by, 0, by + bh);
  pg.addColorStop(0, '#2a3243');
  pg.addColorStop(1, '#0c1018');
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.strokeStyle = pc[0] as string;
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRect(ctx, bx + 4, by + 4, bw - 8, bh - 8, (bh - 8) / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const pTxt = pv == null ? '—' : pv.toFixed(1);
  ctx.font = F('800 15px');
  const wP = ctx.measureText('PAG').width;
  ctx.font = F('900 30px');
  const wV = ctx.measureText(pTxt).width;
  const sx0 = lx - (wP + 10 + wV) / 2; // contenuto centrato nella pillola, con qualunque font
  ctx.textAlign = 'left';
  ctx.font = F('800 15px');
  ctx.fillStyle = '#c9d2e3';
  ctx.fillText('PAG', sx0, by + 32);
  ctx.save();
  ctx.shadowColor = pc[0] as string;
  ctx.shadowBlur = 10;
  ctx.font = F('900 30px');
  ctx.fillStyle = pc[0] as string;
  ctx.fillText(pTxt, sx0 + wP + 10, by + 35);
  ctx.restore();
  // 📈 etichetta dello stato di forma
  const fk = p.form;
  if (fk) {
    const FS = FORM_STATES[fk], lbl = FS.label.toUpperCase();
    ctx.font = F('900 15px');
    const tw = ctx.measureText(lbl).width, aw = 16, gw = aw + 6 + tw + 22, gx = lx - gw / 2, gy = y + 256;
    roundRect(ctx, gx, gy, gw, 28, 14);
    ctx.fillStyle = FS.col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // freccia disegnata come forma (non serve il carattere del font)
    const ax = gx + 11, ay = gy + 14;
    ctx.save();
    ctx.translate(ax + aw / 2, ay);
    ctx.rotate(fk === 'up' ? -Math.PI / 4 : fk === 'down' ? Math.PI / 4 : 0);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(1, -5);
    ctx.lineTo(6, 0);
    ctx.lineTo(1, 5);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(lbl, gx + 11 + aw + 6, gy + 19);
  }
  const main = primaryRole({ roles: p.roles });
  const roles = [main, ...p.roles.filter((r) => r !== main)];
  etext(roles[0] as string, lx, y + 320, F('800 38px'), t.text);
  if (roles.length > 1) etext(roles.slice(1).join(' · '), lx, y + 350, F('700 22px'), t.sub);
  if (logo && logo.complete && logo.naturalWidth) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.drawImage(logo, lx - 28, y + 364, 56, 56);
    ctx.restore();
  }

  // ── nome ──
  ctx.font = F('900 52px');
  const nm = fitText(ctx, p.name.toUpperCase(), w - 90);
  etext(nm, cx, y + 462, F('900 52px'), t.text);
  const sep = (yy: number, x1: number, x2: number) => {
    const lg = ctx.createLinearGradient(x1, 0, x2, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.5, t.sub);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, yy);
    ctx.lineTo(x2, yy);
    ctx.stroke();
    ctx.restore();
  };
  sep(y + 490, x + 60, x + w - 60);

  // ── 6 statistiche in due colonne ──
  // misurate con il font che disegna davvero (iPhone ≠ computer). Ogni colonna ha la SUA larghezza
  // (un "100" allarga solo la sua colonna) ed entrambe stanno alla stessa distanza dalla linea centrale.
  const VF = F('900 48px'), LF = F('700 34px'), inGap = 12, midGap = 56;
  const colOf = (c: number) => p.stats.filter((_, k) => (k < 3 ? 0 : 1) === c);
  const measure = <T,>(items: T[], font: string, f: (it: T) => string) => {
    ctx.font = font;
    return Math.max(...items.map((it) => ctx.measureText(f(it)).width));
  };
  const cols = [0, 1].map((c) => {
    const it = colOf(c);
    const vw = measure(it, VF, ([, v]) => String(v)), lw = measure(it, LF, ([l]) => l);
    return { vw, lw, w: vw + inGap + lw };
  });
  // linea esattamente sotto il nome (centrato); le due colonne alla stessa distanza da essa
  const divX = cx, lefts = [cx - midGap / 2 - (cols[0] as { w: number }).w, cx + midGap / 2];
  p.stats.forEach(([lbl, val], k) => {
    const c = k < 3 ? 0 : 1, row = k % 3, by2 = y + 560 + row * 66, L = lefts[c] as number, C = cols[c] as { vw: number };
    etext(String(val), L + C.vw, by2, VF, t.text, 'right');
    etext(lbl, L + C.vw + inGap, by2, LF, t.sub, 'left');
  });
  ctx.save();
  const vl = ctx.createLinearGradient(0, y + 516, 0, y + 700);
  vl.addColorStop(0, 'rgba(0,0,0,0)');
  vl.addColorStop(0.5, t.sub);
  vl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = vl;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(divX, y + 516);
  ctx.lineTo(divX, y + 700);
  ctx.stroke();
  ctx.restore();
  sep(y + 722, x + 60, x + w - 60);

  // ── trofei: medaglie dei premi (stesso premio in più stagioni → una medaglia ×N), imprese su una riga a parte ──
  interface Medal { k?: string; shame?: boolean; emoji: string; cap: string; sub?: string; count: number; kind: 'gold' | 'shame' | 'feat' | 'more' }
  const grouped: Array<{ k: string; shame: boolean | undefined; emoji: string; cap: string; sub: string; count: number }> = [];
  tr.awards.forEach((m) => {
    const gr = grouped.find((q) => q.k === m.k);
    if (gr) gr.count++;
    else grouped.push({ k: m.k, shame: m.shame, emoji: noVS((m.t.split(' ')[0] as string)), cap: FUT_SHORT[m.k] as string, sub: seasonShort(m.season), count: 1 });
  });
  // come in legacy: senza "shame" il confronto non è un numero e l'ordine resta quello di arrivo (vedi docs/DECISIONI.md)
  grouped.sort((u, v) => Number(u.shame) - Number(v.shame));
  const featItems = tr.feats.map((f) => ({ k: f.k, emoji: noVS(f.t.split(' ')[0] as string), count: f.count }));
  // nessun premio ancora → le imprese diventano le medaglie
  let medals: Medal[] = grouped.map((m) => ({ ...m, kind: m.shame ? 'shame' : 'gold', sub: m.count > 1 ? m.count + ' stagioni' : m.sub }) as Medal);
  let featLine = featItems;
  if (!medals.length && featItems.length) {
    medals = featItems.map((f) => ({ kind: 'feat', emoji: f.emoji, cap: (FEATS.find((q) => q.k === f.k) as { t: string }).t.split(' ').slice(1).join(' '), count: f.count }));
    featLine = [];
  }
  const show: Medal[] = medals.length > 6 ? [...medals.slice(0, 5), { kind: 'more', emoji: '+' + (medals.length - 5), cap: 'altri', count: 0 }] : medals;
  const my = y + 776, mr = 30;
  if (show.length) {
    const gap = 90, sx = cx - ((show.length - 1) * gap) / 2;
    const MED: Record<string, string[]> = {
      gold: ['#fff6c2', '#e9b931', '#9c7415', '#5e440a'],
      shame: ['#e3e6eb', '#8d95a2', '#525965', '#2e333b'],
      feat: ['#a9c6ff', '#3f74e0', '#1d4599', '#0f285c'],
      more: ['#ffffff', '#cdd3dc', '#8c95a3', '#4d5562'],
    };
    show.forEach((m, k) => {
      const mx = sx + k * gap, c = MED[m.kind] as string[];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      const mg = ctx.createRadialGradient(mx - 10, my - 12, 4, mx, my, mr);
      mg.addColorStop(0, c[0] as string);
      mg.addColorStop(0.55, c[1] as string);
      mg.addColorStop(1, c[2] as string);
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fillStyle = mg;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.strokeStyle = c[3] as string;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, mr - 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = m.kind === 'more' ? '#2a2f37' : '#fff';
      ctx.font = m.kind === 'more' ? F('900 22px') : F('400 28px');
      ctx.fillText(m.emoji, mx, my + (m.kind === 'more' ? 8 : 10));
      if (m.count > 1) {
        ctx.beginPath();
        ctx.arc(mx + mr - 4, my - mr + 6, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#c62828';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = F('900 14px');
        ctx.fillText('×' + m.count, mx + mr - 4, my - mr + 11);
      }
      ctx.font = F('800 14px');
      ctx.fillStyle = t.text;
      ctx.fillText(fitText(ctx, m.cap, gap - 4), mx, my + mr + 19);
      if (m.sub) {
        ctx.font = F('700 12px');
        ctx.fillStyle = t.sub;
        ctx.fillText(fitText(ctx, m.sub, gap - 4), mx, my + mr + 34);
      }
    });
  } else {
    ctx.font = F('italic 600 20px');
    ctx.fillStyle = t.sub;
    ctx.textAlign = 'center';
    ctx.fillText('Nessun trofeo… per ora', cx, my + 8);
  }
  if (featLine.length) etext(featLine.map((f) => `${f.emoji} ×${f.count}`).join('    '), cx, y + 870, F('800 24px'), t.text);

  // ── numeri della stagione ──
  // solo testo: Safari misura male (e quindi centra male) il testo canvas con emoji come "🅰️"
  const a = p.season;
  const season = a ? `${a.pres} PG  ·  ${a.w} V  ·  ${a.goals} GOL  ·  ${a.assist} ASSIST` : 'Nessuna partita ancora';
  etext(season, cx, y + 926, F('800 26px'), t.text);

  // nastro diagonale nell'angolo in alto a destra (solo testo, centrato: niente emoji per Safari)
  const ribbon = (label: string, stops: string[], textShadow: string) => {
    ctx.save();
    shield(0);
    ctx.clip();
    ctx.translate(x + w - 64, y + 64);
    ctx.rotate(Math.PI / 4);
    const rg2 = ctx.createLinearGradient(-160, 0, 160, 0);
    stops.forEach((c, k) => rg2.addColorStop(k / (stops.length - 1), c));
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = rg2;
    ctx.fillRect(-160, -23, 320, 46);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-160, -23, 320, 46);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = F('900 21px');
    ctx.shadowColor = textShadow;
    ctx.shadowBlur = 4;
    ctx.fillText(label, 0, 8);
    ctx.restore();
  };
  if (crisi) {
    ctx.save();
    shield(0);
    ctx.clip();
    rain(160, 0.42, y - 20, y + h);
    ctx.restore(); // pioggia anche sulla carta
    cloud(x + 62, y + 8, 0.62, 0.95); // una nuvola sull'angolo in alto a sinistra
    ribbon('IN CRISI', ['#a3b0c2', '#5d6a7d', '#2c3440'], 'rgba(10,14,22,0.9)');
  }
  if (fire) {
    fireBand(true); // piccole fiamme che leccano il fondo della carta
    const fd = ctx.createLinearGradient(0, y + h - 6, 0, y + h + 64);
    fd.addColorStop(0, 'rgba(10,14,22,0)');
    fd.addColorStop(1, 'rgba(10,14,22,0.95)');
    ctx.fillStyle = fd;
    ctx.fillRect(0, y + h - 6, W, 70);
    ribbon('ON FIRE', ['#ffd23f', '#ff7a00', '#e0230b'], 'rgba(120,20,0,0.8)');
  }
  if (fire || crisi) {
    ctx.save();
    shield(0);
    ctx.lineWidth = 7; // tutto il bordo della carta illuminato dallo stato
    ctx.strokeStyle = fire ? '#ff8a1f' : '#7f93ad';
    ctx.shadowColor = fire ? '#ff6a00' : '#4d6585';
    ctx.shadowBlur = 34;
    ctx.stroke();
    ctx.restore();
  }
  // didascalia sotto la carta
  ctx.fillStyle = '#8a94a6';
  ctx.font = F('italic 500 18px');
  ctx.textAlign = 'center';
  ctx.fillText('CalcioLercio · figurina ufficiale', W / 2, H - 38);
  ctx.font = F('500 12px');
  ctx.fillStyle = '#5d6676';
  ctx.fillText('v' + APP_VERSION, W / 2, H - 16);
  return canvas;
}
