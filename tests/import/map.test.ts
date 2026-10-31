// Importazione: traduzione dei dati attuali in righe del database, provata sui dati veri (tests/fixtures/live_feed.json
// = copia di quello che risponde lo script Google, e legacy/rosa_calcetto.json). Nessun accesso alla rete.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dbToDataset } from '../../src/data/dataset';
import { alboRows, alboSeasons, computeSeasonAwards, matchEvents } from '../../src/domain/awards';
import { computeRecords } from '../../src/domain/records';
import { seasonsList } from '../../src/domain/seasons';
import { seasonStats } from '../../src/domain/stats';
import type { Dataset } from '../../src/domain/types';
import {
  check, mapAlbo, mapMatchPlayers, mapMatches, mapPlayers, parsePhoto, playerUuid, romeDate, summarize,
  type LegacyFeed, type LegacyRosa,
} from '../../scripts/import/map';

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), 'utf8'));
const feed: LegacyFeed = read('tests/fixtures/live_feed.json');
const rosa: LegacyRosa = read('legacy/rosa_calcetto.json');
const fixture = read('tests/fixtures/app_data.json') as { matches: Array<{ id: string; date: string }>; ratings: Array<Record<string, unknown>> };

describe('date: dall\'ora di Google al giorno italiano', () => {
  it('estate (UTC+2) e inverno (UTC+1), cambio dell\'ora il 25 ottobre 2026', () => {
    expect(romeDate('2026-06-16T22:00:00.000Z')).toBe('2026-06-17');
    expect(romeDate('2026-10-24T22:00:00.000Z')).toBe('2026-10-25'); // ancora ora legale
    expect(romeDate('2026-10-27T23:00:00.000Z')).toBe('2026-10-28'); // ora solare
    expect(romeDate('2026-12-31T23:00:00.000Z')).toBe('2027-01-01');
    expect(romeDate('2026-08-31T22:00:00.000Z')).toBe('2026-09-01'); // cambio di stagione: Estate → Autunno
  });
  it('una data già "aaaa-mm-gg" resta com\'è; il resto è illeggibile (null)', () => {
    expect(romeDate('2026-06-17')).toBe('2026-06-17');
    for (const bad of ['', null, undefined, 'boh', '31/12/2026']) expect(romeDate(bad)).toBeNull();
  });
  it('tutte le 16 partite vere: stessa data dei dati di prova già normalizzati', () => {
    expect(feed.matches).toHaveLength(16);
    for (const m of feed.matches) {
      const expected = fixture.matches.find((x) => x.id === m.id);
      expect(expected, 'partita assente nei dati di prova: ' + m.id).toBeTruthy();
      expect(romeDate(m.date)).toBe(expected?.date);
    }
  });
});

describe('dati veri: controllo e traduzione', () => {
  it('nessuna cosa che non torna', () => {
    const { issues, counts } = check(rosa, feed);
    expect(issues).toEqual([]);
    expect(counts.partite).toBe(16);
    expect(counts['stagioni albo']).toBe(3);
  });

  it('riepilogo: i numeri attesi', () => {
    expect(summarize(rosa, feed)).toEqual({
      giocatori: 22, conFoto: 17, soprannomi: 3, partite: 16, pagelle: 162, pagelleConTitolo: 40, pagelleConDescrizione: 68,
      righeAlbo: 77, gazzette: 3,
    });
  });

  it('giocatori: 22 righe con id vecchio, ruoli e 11 statistiche valide', () => {
    const rows = mapPlayers(rosa);
    expect(rows).toHaveLength(22);
    expect(new Set(rows.map((r) => r.legacy_id)).size).toBe(22);
    for (const r of rows) {
      expect(r.stats).toHaveLength(11);
      expect((r.stats as number[]).every((v) => Number.isInteger(v) && v >= 0 && v <= 10)).toBe(true);
      expect((r.roles as string[]).every((x) => ['ATT', 'MED', 'DIF'].includes(x))).toBe(true);
    }
  });

  it('foto: 17 immagini lette dal testo base64', () => {
    const photos = rosa.players.map((p) => parsePhoto(p.photo)).filter(Boolean);
    expect(photos).toHaveLength(17);
    expect(photos.every((p) => p?.mime === 'image/jpeg' && (p?.bytes.length ?? 0) > 500)).toBe(true);
    expect(parsePhoto(undefined)).toBeNull();
    expect(parsePhoto('boh')).toBeNull();
  });

  it('partite: risultato, data italiana, nessuna persa', () => {
    const { rows, issues } = mapMatches(feed, 'LEGA');
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(16);
    for (const r of rows) {
      const src = feed.matches.find((m) => m.id === r.legacy_id) as (typeof feed.matches)[number];
      expect(r.league_id).toBe('LEGA');
      expect(r.score_a).toBe(parseInt(src.scoreA as string));
      expect(r.score_b).toBe(parseInt(src.scoreB as string));
    }
    // 6-8 del 28 ottobre
    const last = rows.find((r) => r.date === '2026-10-28');
    expect([last?.score_a, last?.score_b]).toEqual([6, 8]);
  });

  it('squadre e pagelle: ogni pagella al suo posto, con titoli e descrizioni', () => {
    const m = mapMatches(feed, 'L').rows;
    const mid = new Map(m.map((r) => [r.legacy_id as string, 'M:' + r.legacy_id]));
    const pid = new Map(rosa.players.map((p) => [p.id, 'P:' + p.id]));
    const { rows, issues } = mapMatchPlayers(feed, rosa, (i) => mid.get(i), (i) => pid.get(i));
    expect(issues).toEqual([]);
    // una riga per giocatore e partita
    const teamEntries = feed.matches.reduce((n, x) => n + (x.teamA?.length ?? 0) + (x.teamB?.length ?? 0), 0);
    expect(rows).toHaveLength(teamEntries);
    expect(new Set(rows.map((r) => r.match_id + '|' + r.player_id)).size).toBe(rows.length);
    // tutte le 162 pagelle hanno trovato il loro posto: nessun voto perso
    expect(rows.filter((r) => r.rating != null)).toHaveLength(162);
    expect(rows.filter((r) => r.titolo).length).toBe(40);
    expect(rows.filter((r) => r.descrizione).length).toBe(68);
    // stesso voto, gol e assist della pagella originale
    for (const r of feed.ratings) {
      const p = rosa.players.find((x) => x.id === r.playerId) ?? rosa.players.find((x) => x.name === r.player);
      const row = rows.find((x) => x.match_id === 'M:' + r.matchId && x.player_id === 'P:' + p?.id);
      expect(row?.rating).toBe(Number(r.rating));
      expect(row?.goals).toBe(parseInt(r.goals as string) || 0);
      expect(row?.assist).toBe(parseInt(r.assist as string) || 0);
      expect(row?.titolo ?? '').toBe(String(r.titolo ?? '').trim() ? r.titolo : '');
    }
    // squadre: Blu = A, Bianchi = B, posti in ordine
    const first = feed.matches[0] as (typeof feed.matches)[number];
    const rowsOfFirst = rows.filter((x) => x.match_id === 'M:' + first.id);
    expect(rowsOfFirst.filter((x) => x.team === 'A')).toHaveLength(first.teamA?.length ?? 0);
    expect(rowsOfFirst.filter((x) => x.team === 'A').map((x) => x.position)).toEqual((first.teamA ?? []).map((_, i) => i));
  });

  it('albo: una riga per stagione con tutte le righe del foglio; "in corso" diventa "aperta"', () => {
    const { rows, issues } = mapAlbo(feed, 'L');
    expect(issues).toEqual([]);
    expect(rows.map((r) => [r.season_key, r.status]).sort()).toEqual([['2026-AUT', 'aperta'], ['2026-EST', 'chiusa'], ['2026-PRI', 'chiusa']]);
    expect(rows.reduce((n, r) => n + (r.rows as unknown[]).length, 0)).toBe(77);
  });
});

describe('cose che non tornano: vengono segnalate, non nascoste', () => {
  const base = () => structuredClone(feed) as LegacyFeed;
  it('data illeggibile, risultato a metà, partita doppia', () => {
    const f = base();
    (f.matches[0] as { date: unknown }).date = 'boh';
    (f.matches[1] as { scoreB: unknown }).scoreB = '';
    f.matches.push(structuredClone(f.matches[2]) as (typeof f.matches)[number]);
    const { issues } = check(rosa, f);
    expect(issues.some((i) => i.includes('data non leggibile'))).toBe(true);
    expect(issues.some((i) => i.includes('risultato incompleto'))).toBe(true);
    expect(issues.some((i) => i.includes('compare due volte'))).toBe(true);
  });
  it('giocatore fuori rosa, in due squadre, pagella senza squadra o di partita inesistente', () => {
    const f = base();
    const m = f.matches[3] as (typeof f.matches)[number];
    m.teamA = [...(m.teamA ?? []), 'Sconosciuto'];
    m.teamB = [...(m.teamB ?? []), (m.teamA ?? [])[0] as never];
    f.ratings.push({ matchId: 'm_non_esiste', player: 'Rella', rating: 7 });
    const out = f.matches[4] as (typeof f.matches)[number];
    f.ratings.push({ matchId: out.id, player: 'Sconosciuto', rating: 6 });
    const { issues } = check(rosa, f);
    expect(issues.some((i) => i.includes('"Sconosciuto" non è in rosa'))).toBe(true);
    expect(issues.some((i) => i.includes('entrambe le squadre'))).toBe(true);
    expect(issues.some((i) => i.includes('non esiste'))).toBe(true);
    expect(issues.some((i) => i.includes('non è in nessuna squadra'))).toBe(true);
  });
  it('una Gazzetta di una partita inesistente', () => {
    const f = base();
    f.gazzette.push({ matchId: 'm_fantasma', fileId: 'x' });
    expect(check(rosa, f).issues.some((i) => i.includes('Gazzetta') && i.includes('non esiste'))).toBe(true);
  });
  it('voto 0 o vuoto = nessun voto; testo vuoto = niente', () => {
    const f = base();
    const r = f.ratings[0] as (typeof f.ratings)[number];
    r.rating = 0;
    r.titolo = '   ';
    r.notes = '';
    const mid = new Map(mapMatches(f, 'L').rows.map((x) => [x.legacy_id as string, 'M:' + x.legacy_id]));
    const pid = new Map(rosa.players.map((p) => [p.id, 'P:' + p.id]));
    const { rows } = mapMatchPlayers(f, rosa, (i) => mid.get(i), (i) => pid.get(i));
    const row = rows.find((x) => x.match_id === 'M:' + r.matchId && x.player_id === 'P:' + r.playerId);
    expect(row?.rating).toBeNull();
    expect(row?.titolo).toBeNull();
    expect(row?.descrizione).toBeNull();
  });
});

describe('giro completo: dati attuali → righe del database → logica', () => {
  // Righe "come se fossero nel database" (id finti) e di nuovo dati per la logica
  const mrows = mapMatches(feed, 'L').rows;
  const mid = new Map(mrows.map((r, i) => [r.legacy_id as string, `m-${i}`]));
  const pid = new Map(rosa.players.map((p, i) => [p.id, playerUuid(p.id) ?? `p-${i}`]));
  const mp =mapMatchPlayers(feed, rosa, (i) => mid.get(i), (i) => pid.get(i)).rows;
  const fromDb: Dataset = dbToDataset({
    players: rosa.players.map((p) => ({ id: pid.get(p.id) as string, name: p.name, roles: p.roles ?? [], stats: p.stats })),
    matches: mrows.map((r) => ({
      id: mid.get(r.legacy_id as string) as string, date: r.date, notes: r.notes ?? null, score_a: r.score_a ?? null,
      score_b: r.score_b ?? null, pred: r.pred ?? null, pred_rank: r.pred_rank ?? null,
    })),
    matchPlayers: mp.map((r) => ({
      match_id: r.match_id, player_id: r.player_id, team: r.team, position: r.position ?? 0, rating: r.rating ?? null,
      goals: r.goals ?? 0, assist: r.assist ?? 0, autogol: r.autogol ?? 0, meta: r.meta ?? 0,
      rigori_sbagliati: r.rigori_sbagliati ?? 0, titolo: r.titolo ?? null, descrizione: r.descrizione ?? null,
    })),
  });
  // Gli stessi dati letti direttamente dal foglio (con la sola data portata al giorno italiano)
  const direct: Dataset = {
    players: rosa.players as Dataset['players'],
    matches: feed.matches.map((m) => ({ ...m, date: romeDate(m.date) as string })) as Dataset['matches'],
    ratings: feed.ratings as Dataset['ratings'],
  };
  const TODAY = '2026-10-31';
  // gli id di giocatori e partite sono diversi nei due casi: si confronta per nome e per data
  const noKey = <T extends { key?: string; votes: Array<{ v: number; date: string; matchId?: string }> }>(o: T) => {
    const { key, ...rest } = o;
    void key; // l'id cambia: non si confronta
    return { ...rest, votes: o.votes.map((x) => ({ v: x.v, date: x.date })) };
  };
  const byName = (s: ReturnType<typeof seasonStats>) =>
    Object.fromEntries(Object.values(s).map((x) => [x.name, noKey(x)]));

  it('stesse partite, stesse squadre, stesse pagelle', () => {
    expect(fromDb.players).toHaveLength(22);
    expect(fromDb.matches).toHaveLength(16);
    expect(fromDb.ratings).toHaveLength(162);
    expect(fromDb.matches.map((m) => m.date)).toEqual([...direct.matches].map((m) => m.date).sort());
  });

  it('statistiche di ogni giocatore, per ogni stagione e per sempre: identiche', () => {
    const scopes = ['all', ...seasonsList(direct.matches, [], TODAY).map((s) => s.key)];
    expect(scopes.length).toBe(4);
    for (const sc of scopes) {
      const a = byName(seasonStats(fromDb, sc));
      const b = byName(seasonStats(direct, sc));
      expect(Object.keys(a).length).toBeGreaterThan(5);
      expect(a).toEqual(b);
    }
  });

  it('premi, imprese e albo di ogni stagione: identici', () => {
    expect(matchEventsByDate(fromDb)).toEqual(matchEventsByDate(direct));
    for (const s of seasonsList(direct.matches, [], TODAY)) {
      const a = computeSeasonAwards(fromDb, s);
      const b = computeSeasonAwards(direct, s);
      expect(alboRows(a)).toEqual(alboRows(b));
      expect(a.feats).toEqual(b.feats);
    }
  });

  it('albo salvato nel database (stagioni chiuse) + stagione in corso calcolata: identico a leggere dal foglio', () => {
    const stored = feed.albo as never;
    const a = alboSeasons(fromDb, stored, TODAY);
    const b = alboSeasons(direct, stored, TODAY);
    expect(a.map((s) => s.frozen)).toEqual(b.map((s) => s.frozen));
    expect(a.some((s) => s.frozen)).toBe(true);
    expect(a.map((s) => alboRows(s))).toEqual(b.map((s) => alboRows(s)));
  });

  it('record: stessi valori e stesse persone (i pari merito possono comparire in ordine diverso)', () => {
    // Nel foglio Google le pagelle stanno nell'ordine in cui sono state salvate l'ultima volta (salvare di nuovo una
    // partita cancella e riscrive le sue righe in fondo): quell'ordine non esiste nel database. Cambia solo l'ordine
    // in cui si elencano le persone a pari merito, non chi ha il record né il valore.
    for (const sc of ['all', '2026-AUT']) {
      const norm = (d: Dataset) =>
        computeRecords(d, sc).map((r) => ({ t: r.title, v: r.value, e: r.entries.map((e) => `${e.name ?? ''}@${e.match?.date}`).sort() }));
      expect(norm(fromDb)).toEqual(norm(direct));
    }
  });
});

/** Imprese per data e giocatore (gli id delle partite e dei giocatori sono diversi nei due casi). */
function matchEventsByDate(d: Dataset) {
  const ev = matchEvents(d);
  return d.matches
    .map((m) => [m.date, (ev[m.id] ?? []).map((e) => `${e.name}:${e.type}`).sort()] as const)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
