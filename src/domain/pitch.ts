// Il campo (SVG) con le due formazioni.
import type { Module, Slot } from './balancing';
import { SLOT_FALLBACK } from './balancing';
import { esc } from './format';

export interface PitchPlayer {
  name: string;
  /** indirizzo della foto (se c'è): appare dentro il cerchio */
  photo?: string | null;
  roles: string[];
  /** ruolo mostrato (il primo, altrimenti centrocampista) */
  dispRole: string;
}

/** Misure e contenuto del campo: viewBox e tutto quello che sta dentro l'SVG. */
export function pitchSvg(
  pA: PitchPlayer[],
  pB: PitchPlayer[],
  modA?: Module | null,
  modB?: Module | null,
): { viewBox: string; inner: string } {
  // l'altezza dipende dal numero di giocatori, così non si sovrappongono
  const maxN = Math.max(pA.length, pB.length);
  const H = maxN <= 5 ? 240 : maxN <= 6 ? 270 : 300;
  const W = 560;

  const M = 14;
  const fw = W - 2 * M;
  const fh = H - 2 * M;
  const midX = W / 2;
  let s = '';

  // sfondo e strisce
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#1b5e2d"/>`;
  const sh = Math.round(fh / 9);
  for (let y = M; y < M + fh; y += sh * 2)
    s += `<rect x="${M}" y="${y}" width="${fw}" height="${Math.min(sh, M + fh - y)}" fill="rgba(255,255,255,0.03)"/>`;

  // linee del campo
  s += `<rect x="${M}" y="${M}" width="${fw}" height="${fh}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.8"/>`;
  s += `<line x1="${midX}" y1="${M}" x2="${midX}" y2="${M + fh}" stroke="rgba(255,255,255,0.7)" stroke-width="1.8"/>`;
  const cr2 = Math.min(H * 0.12, 28);
  s += `<circle cx="${midX}" cy="${H / 2}" r="${cr2}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.8"/>`;
  s += `<circle cx="${midX}" cy="${H / 2}" r="2.5" fill="rgba(255,255,255,0.8)"/>`;

  // aree di rigore
  const paH = fh * 0.52;
  const paW = fw * 0.12;
  const paY = M + (fh - paH) / 2;
  s += `<rect x="${M}" y="${paY}" width="${paW}" height="${paH}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>`;
  s += `<rect x="${M + fw - paW}" y="${paY}" width="${paW}" height="${paH}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>`;

  // porte
  const gH = fh * 0.25;
  const gW = 10;
  const gY = M + (fh - gH) / 2;
  s += `<rect x="${M - gW}" y="${gY}" width="${gW}" height="${gH}" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>`;
  s += `<rect x="${M + fw}" y="${gY}" width="${gW}" height="${gH}" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>`;

  // angoli
  const cr = 8;
  (
    [
      [M, M, '0 0 0'],
      [M + fw, M, '0 0 1'],
      [M, M + fh, '0 0 0'],
      [M + fw, M + fh, '0 0 1'],
    ] as Array<[number, number, string]>
  ).forEach(([x, y, f], i) => {
    const dx = i % 2 === 0 ? cr : -cr;
    const dy = i < 2 ? cr : -cr;
    s += `<path d="M ${x + dx} ${y} A ${cr} ${cr} ${f} ${x} ${y + dy}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.2"/>`;
  });

  // il modulo scelto dal sorteggio; in mancanza, uno di riserva
  const fallbackSlots = (n: number): Slot[] => SLOT_FALLBACK[n] || (SLOT_FALLBACK[5] as Slot[]);
  const slotsA = (modA && modA.slots) || fallbackSlots(pA.length);
  const slotsB = (modB && modB.slots) || fallbackSlots(pB.length);

  const lxS = M + 10;
  const lxE = midX - 8;
  const yS = M + 10;
  const yE = M + fh - 10;
  const rxS = midX + 8;
  const rxE = M + fw - 10;

  /** Un giocatore per posto: prima chi ha il ruolo giusto (+2) e il ruolo mostrato uguale (+1); i rimasti riempiono i buchi. */
  function assignToSlots(playerArr: PitchPlayer[], slots: Slot[]): Array<PitchPlayer | null> {
    const result: Array<PitchPlayer | null> = new Array(slots.length).fill(null);
    const used = new Set<number>();
    slots.forEach((sl, si) => {
      let best: number | null = null;
      let bestScore = -1;
      playerArr.forEach((p, pi) => {
        if (used.has(pi)) return;
        let sc = 0;
        if (p.roles.includes(sl.role)) sc += 2;
        if (p.dispRole === sl.role) sc += 1;
        if (sc > bestScore) {
          bestScore = sc;
          best = pi;
        }
      });
      if (best !== null) {
        result[si] = playerArr[best] as PitchPlayer;
        used.add(best);
      }
    });
    let ri = 0;
    const rem = playerArr.filter((_, pi) => !used.has(pi));
    result.forEach((v, i) => {
      if (v === null && ri < rem.length) result[i] = rem[ri++] as PitchPlayer;
    });
    return result;
  }

  const assignedA = assignToSlots(pA, slotsA);
  const assignedB = assignToSlots(pB, slotsB);

  const PR = 17; // raggio del cerchio del giocatore
  let clipDefs = '';
  let clipSeq = 0;
  function drawPlayer(px: number, py: number, player: PitchPlayer, fill: string, borderCol: string) {
    const name = player.name;
    const cx = px.toFixed(1);
    const cy = py.toFixed(1);
    if (player.photo) {
      const cid = 'pclip' + clipSeq++;
      clipDefs += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${PR}"/></clipPath>`;
      // foto ritagliata nel cerchio, con l'anello del colore della squadra
      s += `<image href="${player.photo}" x="${(px - PR).toFixed(1)}" y="${(py - PR).toFixed(1)}" width="${PR * 2}" height="${PR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${PR}" fill="none" stroke="${borderCol}" stroke-width="3"/>`;
      // il nome sotto la foto, per riconoscerlo
      const short = name.length > 8 ? name.substring(0, 7) + '…' : name;
      s += `<text x="${cx}" y="${(py + PR + 9).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="800" fill="white" stroke="rgba(0,0,0,0.5)" stroke-width="0.4" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(short)}</text>`;
    } else {
      const short = name.length > 7 ? name.substring(0, 6) + '…' : name;
      s += `<circle cx="${cx}" cy="${cy}" r="${PR}" fill="${fill}" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`;
      s += `<text x="${cx}" y="${(py + 4).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="white" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(short)}</text>`;
    }
  }

  slotsA.forEach((sl, i) => {
    const p = assignedA[i];
    if (!p) return;
    drawPlayer(lxS + sl.x * (lxE - lxS), yS + sl.y * (yE - yS), p, '#1e62c2', '#3a8fef');
  });
  slotsB.forEach((sl, i) => {
    const p = assignedB[i];
    if (!p) return;
    drawPlayer(rxS + (1 - sl.x) * (rxE - rxS), yS + sl.y * (yE - yS), p, '#5b6570', '#ffffff');
  });

  return { viewBox: `0 0 ${W} ${H}`, inner: (clipDefs ? `<defs>${clipDefs}</defs>` : '') + s };
}
