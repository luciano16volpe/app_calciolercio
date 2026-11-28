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
  /** Se vero, occupa il primo posto davanti alla propria porta per tutta la partita. */
  fixedGoalkeeper?: boolean;
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
  const H = maxN <= 5 ? 270 : maxN <= 6 ? 300 : 330;
  const W = 560;

  const M = 14;
  const fw = W - 2 * M;
  const fh = H - 2 * M;
  const midX = W / 2;
  let s = '';

  // Manto scuro, taglio dell'erba, luce centrale e riflessi delle due squadre.
  s += `<defs>
    <linearGradient id="pitch-turf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b342a"/><stop offset="0.48" stop-color="#176a46"/><stop offset="1" stop-color="#0b392e"/></linearGradient>
    <radialGradient id="pitch-light"><stop offset="0" stop-color="#7fdb95" stop-opacity=".18"/><stop offset="1" stop-color="#7fdb95" stop-opacity="0"/></radialGradient>
    <linearGradient id="pitch-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#69b9ff"/><stop offset="1" stop-color="#1758a8"/></linearGradient>
    <linearGradient id="pitch-white" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#9ba7b5"/></linearGradient>
    <filter id="pitch-shadow" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#061912" flood-opacity=".8"/></filter>
  </defs>`;
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#pitch-turf)"/>`;
  const stripeW = fw / 10;
  for (let i = 0; i < 10; i += 2)
    s += `<rect x="${(M + i * stripeW).toFixed(1)}" y="${M}" width="${stripeW.toFixed(1)}" height="${fh}" fill="#d8ffd5" opacity=".035"/>`;
  s += `<rect x="${M}" y="${M}" width="${fw / 2}" height="${fh}" fill="#2e8dff" opacity=".035"/>`;
  s += `<rect x="${midX}" y="${M}" width="${fw / 2}" height="${fh}" fill="#e4ebff" opacity=".025"/>`;
  s += `<ellipse cx="${midX}" cy="${H / 2}" rx="${fw * .65}" ry="${fh * .82}" fill="url(#pitch-light)"/>`;
  s += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="11" fill="none" stroke="#a4dbb4" stroke-opacity=".22" stroke-width="1.5"/>`;

  // linee del campo
  s += `<rect x="${M}" y="${M}" width="${fw}" height="${fh}" fill="none" stroke="#e9f8e9" stroke-opacity=".75" stroke-width="1.8"/>`;
  s += `<line x1="${midX}" y1="${M}" x2="${midX}" y2="${M + fh}" stroke="#e9f8e9" stroke-opacity=".75" stroke-width="1.8"/>`;
  const cr2 = Math.min(H * 0.12, 28);
  s += `<circle cx="${midX}" cy="${H / 2}" r="${cr2}" fill="none" stroke="#e9f8e9" stroke-opacity=".75" stroke-width="1.8"/>`;
  s += `<circle cx="${midX}" cy="${H / 2}" r="2.5" fill="#e9f8e9"/>`;

  // aree di rigore
  const paH = fh * 0.52;
  const paW = fw * 0.12;
  const paY = M + (fh - paH) / 2;
  s += `<rect x="${M}" y="${paY}" width="${paW}" height="${paH}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>`;
  s += `<rect x="${M + fw - paW}" y="${paY}" width="${paW}" height="${paH}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>`;
  s += `<circle cx="${M + paW * .73}" cy="${H / 2}" r="2" fill="#e9f8e9" fill-opacity=".8"/>`;
  s += `<circle cx="${M + fw - paW * .73}" cy="${H / 2}" r="2" fill="#e9f8e9" fill-opacity=".8"/>`;

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
        if (p.fixedGoalkeeper && si !== 0) return;
        let sc = 0;
        if (si === 0 && p.fixedGoalkeeper) sc += 100;
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

  const PR = 24; // raggio del cerchio del giocatore
  let clipDefs = '';
  let clipSeq = 0;
  function drawPlayer(px: number, py: number, player: PitchPlayer, fill: string, borderCol: string, isGoalkeeper: boolean) {
    const name = player.name;
    const cx = px.toFixed(1);
    const cy = py.toFixed(1);
    const ring = player.fixedGoalkeeper ? '#d8b5ff' : borderCol;
    s += `<circle cx="${cx}" cy="${cy}" r="${PR + 3}" fill="#061c1c" fill-opacity=".55" filter="url(#pitch-shadow)"/>`;
    if (player.fixedGoalkeeper) s += `<circle cx="${cx}" cy="${cy}" r="${PR + 5}" fill="none" stroke="#d8b5ff" stroke-opacity=".55" stroke-width="1.5"/>`;
    if (player.photo) {
      const cid = 'pclip' + clipSeq++;
      clipDefs += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${PR}"/></clipPath>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${PR}" fill="${fill}"/>`;
      s += `<image href="${esc(player.photo)}" x="${(px - PR).toFixed(1)}" y="${(py - PR).toFixed(1)}" width="${PR * 2}" height="${PR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${PR}" fill="none" stroke="${ring}" stroke-width="3"/>`;
    } else {
      const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
      s += `<circle cx="${cx}" cy="${cy}" r="${PR}" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>`;
      s += `<text x="${cx}" y="${(py + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="900" fill="${fill === 'url(#pitch-white)' ? '#16252f' : '#ffffff'}" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(initials)}</text>`;
    }
    const short = name.length > 10 ? name.substring(0, 9) + '…' : name;
    const labelW = Math.min(78, Math.max(42, short.length * 5.2 + 12));
    const labelY = isGoalkeeper ? py - PR - 19 : py + PR + 3;
    s += `<rect x="${(px - labelW / 2).toFixed(1)}" y="${labelY.toFixed(1)}" width="${labelW.toFixed(1)}" height="14" rx="7" fill="#071c1b" fill-opacity=".88" stroke="${ring}" stroke-opacity=".6" stroke-width=".8"/>`;
    s += `<text x="${cx}" y="${(labelY + 10).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#f8fff8" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(short)}</text>`;
  }

  slotsA.forEach((sl, i) => {
    const p = assignedA[i];
    if (!p) return;
    drawPlayer(lxS + sl.x * (lxE - lxS), yS + sl.y * (yE - yS), p, 'url(#pitch-blue)', '#69b9ff', i === 0 && sl.x < .15);
  });
  slotsB.forEach((sl, i) => {
    const p = assignedB[i];
    if (!p) return;
    drawPlayer(rxS + (1 - sl.x) * (rxE - rxS), yS + sl.y * (yE - yS), p, 'url(#pitch-white)', '#ffffff', i === 0 && sl.x < .15);
  });

  return { viewBox: `0 0 ${W} ${H}`, inner: (clipDefs ? `<defs>${clipDefs}</defs>` : '') + s };
}
