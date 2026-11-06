// Premi di stagione, imprese, Occasionali e albo d'oro.
import { seasonOf, seasonsList, type Season, type SeasonStatus } from './seasons';
import { mvpPerf, normalizeTeam, playerKey, validVote } from './stats';
import type { Dataset } from './types';

export const ALBO_MIN_MATCHES = 3; // sotto questo numero una stagione assegna solo le imprese
export const ALBO_MIN_MVP = 2; // "Re degli MVP" richiede almeno 2 titoli di MVP

export interface AwardDef {
  k: string;
  t: string;
  shame?: boolean;
  occ?: boolean;
}

export const AWARDS: AwardDef[] = [
  { k: 'goleador', t: '🥇 Goleador' },
  { k: 'assistman', t: '🅰️ Assistman' },
  { k: 'media', t: '⭐ Miglior media' },
  { k: 'mvp', t: '👑 Re degli MVP' },
  { k: 'stelle', t: '🚀 Re delle Stelle' },
  { k: 'stakanov', t: '🏃 Stakanovista' },
  { k: 'coppia', t: "🤝 Coppia d'oro" },
  { k: 'flop', t: '🥴 Peggior media', shame: true },
  { k: 'cucchiaio', t: '🥄 Cucchiaio di legno', shame: true },
  { k: 'rigori', t: '❌ Re dei rigori sbagliati', shame: true },
  { k: 'autogol', t: '🙃 Re degli autogol', shame: true },
  // 🧳 OCCASIONALI: da 2 partite fino a sotto il 40% della stagione (automatici)
  { k: 'occMedia', t: '💎 Miglior Occasionale', occ: true },
  { k: 'occBomber', t: '🎯 Bomber a gettone', occ: true },
  { k: 'occFortuna', t: '🍀 Portafortuna', occ: true },
  { k: 'occPendolare', t: "✈️ Pendolare d'oro", occ: true },
];

/** Categorie aggiunte dopo la chiusura di una stagione: si aggiungono una volta sola alle stagioni già chiuse. */
export const ALBO_NEW_KEYS = ['occMedia', 'occBomber', 'occFortuna', 'occPendolare', 'ritorno', 'botto', 'debutto'];

export type FeatKey = 'tripletta' | 'manita' | 'regista' | 'fuoriclasse' | 'imbattibile' | 'ritorno' | 'botto' | 'debutto';

export const FEATS: Array<{ k: FeatKey; t: string; d: string }> = [
  { k: 'tripletta', t: '🎩 Tripletta', d: '3+ gol in una partita' },
  { k: 'manita', t: '🖐️ Manita', d: '5+ gol in una partita' },
  { k: 'regista', t: '🧠 Regista', d: '3+ assist in una partita' },
  { k: 'fuoriclasse', t: '🌟 Fuoriclasse', d: 'voto 8 o più' },
  { k: 'imbattibile', t: '🧱 Imbattibile', d: '5 partite di fila senza sconfitte' },
  { k: 'ritorno', t: '🏠 Il Ritorno', d: 'torna in campo dopo almeno 4 partite di assenza' },
  { k: 'botto', t: '🎆 Ritorno col botto', d: 'al ritorno vince o segna almeno 2 gol' },
  { k: 'debutto', t: '🎟️ Il Debutto', d: 'la prima partita con CalcioLercio' },
];

const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};
const byDateThenId = (a: { date?: unknown; id: unknown }, b: { date?: unknown; id: unknown }) =>
  String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));

export interface MatchEvent {
  key: string;
  name: string;
  type: 'debutto' | 'ritorno' | 'botto';
}

/**
 * Imprese che richiedono tutta la storia (un'assenza può durare due stagioni):
 * 🎟️ debutto (escluso il primo giorno registrato), 🏠 ritorno (dopo ≥ 4 partite di assenza del gruppo),
 * 🎆 botto (al ritorno vince o segna ≥ 2). Risultato: { idPartita → eventi }.
 */
export function matchEvents(data: Dataset): Record<string, MatchEvent[]> {
  const { players, matches, ratings } = data;
  const sorted = matches.slice().sort(byDateThenId);
  const firstDate = sorted.length ? String((sorted[0] as { date?: unknown }).date) : '';
  const last: Record<string, number> = {};
  const ev: Record<string, MatchEvent[]> = {};
  sorted.forEach((m, k) => {
    const list: MatchEvent[] = (ev[m.id] = []);
    const sa = num(m.scoreA);
    const sb = num(m.scoreB);
    const has = sa != null && sb != null;
    const sides: Array<[typeof m.teamA, number | null]> = [
      [m.teamA, has ? Math.sign((sa as number) - (sb as number)) : null],
      [m.teamB, has ? Math.sign((sb as number) - (sa as number)) : null],
    ];
    sides.forEach(([team, res]) => {
      new Map(
        normalizeTeam(team).map((pl) => {
          const x = playerKey(players, pl.id, pl.name);
          return [x.key, x.name] as const;
        }),
      ).forEach((name, key) => {
        if (!(key in last)) {
          if (String(m.date) !== firstDate) list.push({ key, name, type: 'debutto' });
        } else if (k - (last[key] as number) - 1 >= 4) {
          const r = ratings.find((x) => x.matchId === m.id && playerKey(players, x.playerId, x.player).key === key);
          const g = r ? parseInt(r.goals as string) || 0 : 0;
          list.push({ key, name, type: 'ritorno' });
          if (res === 1 || g >= 2) list.push({ key, name, type: 'botto' });
        }
        last[key] = k;
      });
    });
  });
  return ev;
}

export interface AwardResult {
  k: string;
  t: string;
  shame: boolean;
  /** Assente nel premio "Coppia d'oro". */
  occ?: boolean;
  winners: string[];
  value: string;
}

export interface SeasonAwards extends Season {
  status?: SeasonStatus;
  n: number;
  minPres: number;
  awards: AwardResult[];
  feats: Record<string, Array<{ name: string; count: number }>>;
  frozen?: boolean;
}

interface Acc {
  name: string;
  pres: number;
  w: number;
  d: number;
  l: number;
  goals: number;
  assist: number;
  autogol: number;
  rigori: number;
  meta: number;
  vs: number;
  vn: number;
  mvp: number;
  streak: number;
  feats: Record<FeatKey, number>;
}

interface PairAcc {
  names: string;
  w: number;
  d: number;
  l: number;
  gd: number;
}

const eq = (x: number, y: number) => Math.abs(x - y) < 1e-9;
const pl = (v: number, s: string, p: string) => (v === 1 ? s : p);
const avg = (p: Acc): number | null => (p.vn ? p.vs / p.vn : null);

/** Premi e imprese di una stagione, calcolati dal vivo da squadre e pagelle salvate. */
export function computeSeasonAwards(
  data: Dataset,
  s: Season & { status?: SeasonStatus },
  ev: Record<string, MatchEvent[]> = matchEvents(data),
): SeasonAwards {
  const { players } = data;
  const ms = data.matches.filter((m) => seasonOf(m.date)?.key === s.key).sort(byDateThenId);
  const ids = new Set(ms.map((m) => m.id));
  const rs = data.ratings.filter((r) => ids.has(r.matchId));
  const P: Record<string, Acc> = {};
  const pairs: Record<string, PairAcc> = {};
  const get = (k: string, name: string): Acc =>
    (P[k] ??= {
      name, pres: 0, w: 0, d: 0, l: 0, goals: 0, assist: 0, autogol: 0, rigori: 0, meta: 0, vs: 0, vn: 0, mvp: 0, streak: 0,
      feats: { tripletta: 0, manita: 0, regista: 0, fuoriclasse: 0, imbattibile: 0, ritorno: 0, botto: 0, debutto: 0 },
    });

  ms.forEach((m) => {
    const a = num(m.scoreA);
    const b = num(m.scoreB);
    const has = a != null && b != null;
    const sides: Array<[typeof m.teamA, number | null, number]> = [
      [m.teamA, has ? Math.sign((a as number) - (b as number)) : null, 1],
      [m.teamB, has ? Math.sign((b as number) - (a as number)) : null, -1],
    ];
    sides.forEach(([team, res, sign]) => {
      const keys = [
        ...new Map(
          normalizeTeam(team).map((p) => {
            const k = playerKey(players, p.id, p.name);
            return [k.key, k.name] as const;
          }),
        ).entries(),
      ];
      keys.forEach(([k, name]) => {
        const p = get(k, name);
        p.pres++;
        if (res === 1) p.w++;
        else if (res === 0) p.d++;
        else if (res === -1) p.l++;
        if (res != null) {
          if (res >= 0) {
            p.streak++;
            if (p.streak === 5) p.feats.imbattibile++;
          } else p.streak = 0;
        }
      });
      if (res != null) {
        for (let x = 0; x < keys.length; x++) {
          for (let y = x + 1; y < keys.length; y++) {
            const [p1, p2] = [keys[x], keys[y]].sort((u, v) => ((u as [string, string])[0] < (v as [string, string])[0] ? -1 : 1)) as [
              [string, string],
              [string, string],
            ];
            const id = p1[0] + '|' + p2[0];
            const c = (pairs[id] ??= { names: p1[1] + ' & ' + p2[1], w: 0, d: 0, l: 0, gd: 0 });
            if (res === 1) c.w++;
            else if (res === 0) c.d++;
            else c.l++;
            c.gd += sign * ((a as number) - (b as number));
          }
        }
      }
    });
  });

  const best: Record<string, { pf: number; key: string }> = {};
  rs.forEach((r) => {
    const { key, name } = playerKey(players, r.playerId, r.player);
    const p = get(key, name);
    const g = parseInt(r.goals as string) || 0;
    const as = parseInt(r.assist as string) || 0;
    p.goals += g;
    p.assist += as;
    p.autogol += parseInt(r.autogol as string) || 0;
    p.rigori += parseInt(r.rigoriSbagliati as string) || 0;
    p.meta += parseInt(r.meta as string) || 0;
    if (g >= 3) p.feats.tripletta++;
    if (g >= 5) p.feats.manita++;
    if (as >= 3) p.feats.regista++;
    const v = validVote(r.rating);
    if (v != null) {
      p.vs += v;
      p.vn++;
      if (v >= 8) p.feats.fuoriclasse++;
    }
    const pf = mvpPerf(r);
    const cur = best[r.matchId];
    if (pf != null && (!cur || pf > cur.pf)) best[r.matchId] = { pf, key };
  });
  Object.values(best).forEach((b) => {
    (P[b.key] as Acc).mvp++;
  });
  ms.forEach((m) =>
    (ev[m.id] || []).forEach((e) => {
      get(e.key, e.name).feats[e.type]++;
    }),
  );

  const list = Object.values(P);
  const n = ms.length;
  const minPres = Math.max(2, Math.ceil(n * 0.4));
  const eligible = list.filter((p) => p.pres >= minPres);

  // vincitori: valore migliore; a pari merito → media voto (più alta per i premi, più bassa per la vergogna), poi presenze
  const pick = (cands: Acc[], val: (p: Acc) => number | null, dir: number, shame: boolean): Acc[] => {
    let c = cands.filter((p) => val(p) != null);
    if (!c.length) return [];
    const vals = c.map((p) => val(p) as number);
    const top = dir > 0 ? Math.max(...vals) : Math.min(...vals);
    c = c.filter((p) => eq(val(p) as number, top));
    if (c.length > 1) {
      const tv = (p: Acc) => avg(p) ?? (shame ? 99 : -1);
      const tvs = c.map(tv);
      const bt = shame ? Math.min(...tvs) : Math.max(...tvs);
      c = c.filter((p) => eq(tv(p), bt));
    }
    if (c.length > 1) {
      const bp = Math.max(...c.map((p) => p.pres));
      c = c.filter((p) => p.pres === bp);
    }
    return c;
  };
  const one = (k: string, cands: Acc[], val: (p: Acc) => number | null, dir: number, fmt: (v: number, p: Acc) => string): AwardResult => {
    const def = AWARDS.find((a) => a.k === k) as AwardDef;
    const w = pick(cands, val, dir, !!def.shame);
    return {
      k, t: def.t, shame: !!def.shame, occ: !!def.occ,
      winners: w.map((p) => p.name),
      value: w.length ? fmt(val(w[0] as Acc) as number, w[0] as Acc) : '',
    };
  };

  const awards: AwardResult[] = [
    one('goleador', list.filter((p) => p.goals > 0), (p) => p.goals, 1, (v) => `${v} gol`),
    one('assistman', list.filter((p) => p.assist > 0), (p) => p.assist, 1, (v) => `${v} assist`),
    one('media', eligible.filter((p) => p.vn), avg, 1, (v) => `media ${v.toFixed(2)}`),
    one('mvp', list.filter((p) => p.mvp >= ALBO_MIN_MVP), (p) => p.mvp, 1, (v) => `${v} volte MVP`),
    one('stelle', list.filter((p) => p.meta > 0), (p) => p.meta, 1, (v) => `${v} ${pl(v, 'meta', 'mete')}`),
    one('stakanov', list.filter((p) => p.pres > 0), (p) => p.pres, 1, (v) => `${v} ${pl(v, 'presenza', 'presenze')}`),
  ];

  // Coppia d'oro: più vittorie insieme (min 3 partite insieme); a pari merito % vittorie, meno sconfitte, differenza reti
  const tot = (c: PairAcc) => c.w + c.d + c.l;
  const cp = Object.values(pairs)
    .filter((c) => tot(c) >= 3 && c.w > 0)
    .sort((x, y) => y.w - x.w || y.w / tot(y) - x.w / tot(x) || x.l - y.l || y.gd - x.gd);
  const first = cp[0];
  const cw = first
    ? cp.filter((c) => c.w === first.w && eq(c.w / tot(c), first.w / tot(first)) && c.l === first.l && c.gd === first.gd)
    : [];
  const c0 = cw[0];
  awards.push({
    k: 'coppia', t: "🤝 Coppia d'oro", shame: false,
    winners: cw.map((c) => c.names),
    value: c0 ? `${c0.w} ${pl(c0.w, 'vinta', 'vinte')} su ${tot(c0)}, ${c0.gd > 0 ? '+' : ''}${c0.gd} gol` : '',
  });
  awards.push(
    one('flop', eligible.filter((p) => p.vn), avg, -1, (v) => `media ${v.toFixed(2)}`),
    one(
      'cucchiaio',
      eligible.filter((p) => p.w + p.d + p.l > 0),
      (p) => p.w / (p.w + p.d + p.l),
      -1,
      (_v, p) => `${p.w} ${pl(p.w, 'vinta', 'vinte')} su ${p.w + p.d + p.l}`,
    ),
    one('rigori', list.filter((p) => p.rigori > 0), (p) => p.rigori, 1, (v) => `${v} ${pl(v, 'sbagliato', 'sbagliati')}`),
    one('autogol', list.filter((p) => p.autogol > 0), (p) => p.autogol, 1, (v) => `${v} autogol`),
  );

  // 🧳 Occasionali: da 2 partite fino a sotto minPres. Parità: presenze, poi media.
  const occ = list.filter((p) => p.pres >= 2 && p.pres < minPres);
  const pickOcc = (cands: Acc[], val: (p: Acc) => number | null): Acc[] => {
    let c = cands.filter((p) => val(p) != null);
    if (!c.length) return [];
    const top = Math.max(...c.map((p) => val(p) as number));
    c = c.filter((p) => eq(val(p) as number, top));
    if (c.length > 1) {
      const bp = Math.max(...c.map((p) => p.pres));
      c = c.filter((p) => p.pres === bp);
    }
    if (c.length > 1) {
      const tv = (p: Acc) => avg(p) ?? -1;
      const bt = Math.max(...c.map(tv));
      c = c.filter((p) => eq(tv(p), bt));
    }
    return c;
  };
  const occAward = (k: string, cands: Acc[], val: (p: Acc) => number | null, fmt: (v: number, p: Acc) => string): AwardResult => {
    const def = AWARDS.find((a) => a.k === k) as AwardDef;
    const w = pickOcc(cands, val);
    return {
      k, t: def.t, shame: false, occ: true,
      winners: w.map((p) => p.name),
      value: w.length ? fmt(val(w[0] as Acc) as number, w[0] as Acc) : '',
    };
  };
  awards.push(
    occAward('occMedia', occ.filter((p) => p.vn >= 2), avg, (v) => `media ${v.toFixed(2)}`),
    occAward('occBomber', occ.filter((p) => p.goals > 0), (p) => p.goals / p.pres, (v, p) => `${v.toFixed(1)} gol a partita (${p.goals} in ${p.pres})`),
    occAward(
      'occFortuna',
      occ.filter((p) => p.w > 0 && p.w + p.d + p.l > 0),
      (p) => p.w / (p.w + p.d + p.l),
      (_v, p) => `${p.w} ${pl(p.w, 'vinta', 'vinte')} su ${p.w + p.d + p.l}`,
    ),
    occAward('occPendolare', occ, (p) => p.pres, (v) => `${v} presenze`),
  );
  if (n < ALBO_MIN_MATCHES)
    awards.forEach((a) => {
      a.winners = [];
      a.value = '';
    }); // stagione troppo corta per i premi

  const feats: SeasonAwards['feats'] = {};
  FEATS.forEach((f) => {
    feats[f.k] = list
      .filter((p) => p.feats[f.k] > 0)
      .map((p) => ({ name: p.name, count: p.feats[f.k] }))
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  });
  return { ...s, n, minPres, awards, feats };
}

/** Riga dell'albo salvato (foglio "albo_oro" / tabella `albo`). */
export interface AlboRow {
  stagione?: string;
  chiave?: string;
  dal?: unknown;
  al?: unknown;
  stato?: string;
  premio?: string;
  titolo?: string;
  giocatore?: string;
  valore?: string;
}

/** Righe da salvare nell'albo per una stagione. */
export function alboRows(S: SeasonAwards): AlboRow[] {
  const base = { stagione: S.label, chiave: S.key, dal: S.start, al: S.end, stato: S.status };
  const rows: AlboRow[] = [];
  S.awards.forEach((a) => a.winners.forEach((w) => rows.push({ ...base, premio: a.k, titolo: a.t, giocatore: w, valore: a.value })));
  FEATS.forEach((f) =>
    (S.feats[f.k] || []).forEach((x) => rows.push({ ...base, premio: f.k, titolo: f.t, giocatore: x.name, valore: '×' + x.count })),
  );
  if (!rows.length) rows.push({ ...base, premio: '-', titolo: '(nessun premio)', giocatore: '', valore: '' });
  return rows;
}

/** Albo salvato → stessa forma di computeSeasonAwards (per le stagioni congelate). */
export function seasonFromRows(data: Dataset, s: Season & { status?: SeasonStatus }, rows: AlboRow[]): SeasonAwards {
  const awards = AWARDS.map((a) => {
    const r = rows.filter((x) => x.premio === a.k);
    return {
      k: a.k, t: a.t, shame: !!a.shame, occ: !!a.occ,
      winners: r.map((x) => x.giocatore as string),
      value: r[0] ? (r[0].valore as string) : '',
    };
  });
  const feats: SeasonAwards['feats'] = {};
  FEATS.forEach((f) => {
    feats[f.k] = rows
      .filter((x) => x.premio === f.k)
      .map((x) => ({ name: x.giocatore as string, count: parseInt(String(x.valore).replace('×', '')) || 0 }));
  });
  const n = data.matches.filter((m) => seasonOf(m.date)?.key === s.key).length;
  return { ...s, n, minPres: Math.max(2, Math.ceil(n * 0.4)), awards, feats, frozen: true };
}

/** Una stagione è congelata se è chiusa e tutte le sue righe salvate sono marcate "chiusa". */
export const isFrozen = (s: { status?: SeasonStatus }, stored: AlboRow[]): boolean =>
  s.status === 'chiusa' && stored.length > 0 && stored.every((r) => r.stato === 'chiusa');

/** Tutte le stagioni, dalla più recente: le congelate dall'albo salvato, le altre calcolate dal vivo. */
export function alboSeasons(data: Dataset, albo: AlboRow[] = [], today?: string): SeasonAwards[] {
  const ev = matchEvents(data);
  return seasonsList(data.matches, albo, today)
    .reverse()
    .map((s) => {
      const st = albo.filter((r) => r.chiave === s.key);
      if (!isFrozen(s, st)) return computeSeasonAwards(data, s, ev);
      const S = seasonFromRows(data, s, st);
      const C = computeSeasonAwards(data, s, ev);
      // categorie che non esistevano alla chiusura: prese dal calcolo dal vivo
      ALBO_NEW_KEYS.forEach((k) => {
        if (st.some((r) => r.premio === k)) return;
        const ca = C.awards.find((a) => a.k === k);
        if (ca) {
          const i = S.awards.findIndex((a) => a.k === k);
          if (i >= 0) S.awards[i] = ca;
        }
        if (C.feats[k]) S.feats[k] = C.feats[k] as Array<{ name: string; count: number }>;
      });
      return S;
    });
}