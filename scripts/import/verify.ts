// Controllo dopo l'importazione: rilegge il database come lo vedrebbe chi NON ha un account (chiave pubblica)
// e confronta i numeri con quelli dei dati attuali (script Google), usando la stessa logica dell'app.
//
//   npm run import:verify
import { isDeepStrictEqual } from 'node:util';
import { dbToDataset } from '../../src/data/dataset';
import { alboRows, alboSeasons, computeSeasonAwards } from '../../src/domain/awards';
import { computeRecords } from '../../src/domain/records';
import { seasonsList } from '../../src/domain/seasons';
import { seasonStats } from '../../src/domain/stats';
import type { Dataset } from '../../src/domain/types';
import { adminClient, anonClient, fetchFeed, readRosa, SUPABASE_URL, type Admin } from './connect';
import { romeDate } from './map';

const LEAGUE_NAME = 'CalcioLercio';
let failures = 0;
const ok = (cond: boolean, what: string, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${what}${detail ? ' — ' + detail : ''}`);
};

async function all<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const r = await q;
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data ?? [];
}

async function main() {
  const rosa = readRosa();
  const feed = await fetchFeed(rosa.backendUrl);
  const TODAY = new Date().toISOString().slice(0, 10);
  const db: Admin = anonClient();

  console.log('— Come lo vede chi non ha un account (chiave pubblica) —');
  const leagues = await all(db.from('leagues').select('id, name, is_public'), 'leghe');
  const league = leagues.find((l) => l.name === LEAGUE_NAME);
  ok(!!league && league.is_public, `la lega "${LEAGUE_NAME}" c'è ed è pubblica`);
  if (!league) throw new Error('Lega non trovata: hai fatto npm run import -- --apply ?');
  const L = league.id;

  const players = await all(db.from('players').select('id, name, roles, stats, photo_path, legacy_id'), 'giocatori');
  const lp = await all(db.from('league_players').select('player_id, aliases').eq('league_id', L), 'giocatori della lega');
  const matches = await all(db.from('matches').select('id, date, notes, score_a, score_b, pred, pred_rank, legacy_id').eq('league_id', L), 'partite');
  const mIds = matches.map((m) => m.id);
  const mp = await all(
    db.from('match_players').select('match_id, player_id, team, position, rating, goals, assist, autogol, meta, rigori_sbagliati, titolo, descrizione').in('match_id', mIds),
    'squadre e pagelle',
  );
  const albo = await all(db.from('albo').select('season_key, status, rows').eq('league_id', L), 'albo');
  const gaz = await all(db.from('gazzette').select('match_id, file_path').in('match_id', mIds), 'Gazzette');
  const settings = await all(db.from('app_settings').select('key, value'), 'impostazioni');

  console.log('\n— Numeri —');
  ok(players.length === rosa.players.length, 'giocatori', `${players.length} / ${rosa.players.length}`);
  ok(lp.length === rosa.players.length, 'giocatori nella lega', `${lp.length}`);
  ok(matches.length === feed.matches.length, 'partite', `${matches.length} / ${feed.matches.length}`);
  const rated = mp.filter((x) => x.rating != null).length;
  ok(rated === feed.ratings.filter((r) => parseFloat(r.rating as string) >= 1).length, 'pagelle con voto', `${rated}`);
  ok(mp.filter((x) => x.titolo).length === feed.ratings.filter((r) => String(r.titolo ?? '').trim()).length, 'titoli', `${mp.filter((x) => x.titolo).length}`);
  ok(mp.filter((x) => x.descrizione).length === feed.ratings.filter((r) => String(r.notes ?? '').trim()).length, 'descrizioni', `${mp.filter((x) => x.descrizione).length}`);
  ok(albo.reduce((n, a) => n + (a.rows as unknown[]).length, 0) === feed.albo.length, "righe dell'albo", `${albo.reduce((n, a) => n + (a.rows as unknown[]).length, 0)} / ${feed.albo.length}`);
  ok(gaz.length === feed.gazzette.length, 'Gazzette', `${gaz.length} / ${feed.gazzette.length}`);
  const w = settings.find((s) => s.key === 'ovr_weights');
  ok(JSON.stringify(w?.value) === JSON.stringify(rosa.weights), "pesi dell'OVR");
  ok(
    rosa.players.every((p) => {
      const d = players.find((x) => x.legacy_id === p.id);
      return d && JSON.stringify(d.stats) === JSON.stringify(p.stats) && JSON.stringify(d.roles) === JSON.stringify(p.roles ?? []);
    }),
    'statistiche e ruoli di ogni giocatore uguali',
  );

  console.log('\n— File (foto e Gazzette, aperti dall\'indirizzo pubblico) —');
  const withPhoto = players.filter((p) => p.photo_path);
  ok(withPhoto.length === rosa.players.filter((p) => p.photo).length, 'giocatori con foto', `${withPhoto.length}`);
  let bad = 0;
  for (const p of withPhoto) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/photos/${p.photo_path}`, { method: 'HEAD' });
    if (!r.ok) bad++;
  }
  ok(bad === 0, 'tutte le foto si aprono', bad ? `${bad} non si aprono` : '');
  bad = 0;
  for (const g of gaz) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/gazzette/${g.file_path}`, { method: 'HEAD' });
    if (!r.ok || Number(r.headers.get('content-length') ?? 0) < 1000) bad++;
  }
  ok(bad === 0, 'tutte le Gazzette si aprono', bad ? `${bad} non si aprono` : '');

  console.log('\n— Stessi risultati della logica dell\'app (dati nel database contro dati dal foglio) —');
  const fromDb: Dataset = dbToDataset({ players, matches, matchPlayers: mp });
  const direct: Dataset = {
    players: rosa.players as Dataset['players'],
    matches: feed.matches.map((m) => ({ ...m, date: romeDate(m.date) as string })) as Dataset['matches'],
    ratings: feed.ratings as Dataset['ratings'],
  };
  const scopes = ['all', ...seasonsList(direct.matches, [], TODAY).map((s) => s.key)];
  const slim = (d: Dataset, sc: string) =>
    Object.fromEntries(
      Object.values(seasonStats(d, sc)).map((x) => [x.name, { ...x, key: undefined, votes: x.votes.map((v) => ({ v: v.v, date: v.date })) }]),
    );
  ok(scopes.every((sc) => isDeepStrictEqual(slim(fromDb, sc), slim(direct, sc))), 'presenze, V/N/P, voti, gol e assist di ogni giocatore, in ogni stagione e per sempre');
  const storedAlbo = albo.flatMap((a) => a.rows as never[]);
  const awardsOf = (d: Dataset) => alboSeasons(d, storedAlbo, TODAY).map((s) => alboRows(s));
  ok(JSON.stringify(awardsOf(fromDb)) === JSON.stringify(awardsOf(direct)), "albo d'oro (stagioni chiuse dall'albo salvato, stagione in corso calcolata)");
  ok(
    seasonsList(direct.matches, [], TODAY).every((s) => JSON.stringify(alboRows(computeSeasonAwards(fromDb, s))) === JSON.stringify(alboRows(computeSeasonAwards(direct, s)))),
    'premi e imprese calcolati dal vivo, stagione per stagione',
  );
  const rec = (d: Dataset) => computeRecords(d, 'all').map((r) => `${r.title}|${r.value}|${r.entries.map((e) => `${e.name ?? ''}@${e.match?.date}`).sort().join(',')}`);
  ok(JSON.stringify(rec(fromDb)) === JSON.stringify(rec(direct)), 'record di sempre');

  console.log('\n— Permessi —');
  const w1 = await db.from('players').insert({ name: '__prova__' }).select();
  ok(!!w1.error, 'senza account NON si può scrivere (giocatori)', w1.error ? '' : 'ATTENZIONE: la scrittura è riuscita!');
  const w2 = await db.from('matches').insert({ league_id: L, date: '2000-01-01' }).select();
  ok(!!w2.error, 'senza account NON si può scrivere (partite)', w2.error ? '' : 'ATTENZIONE: la scrittura è riuscita!');
  const mem = await db.from('league_members').select('user_id');
  ok((mem.data ?? []).length === 0, 'senza account non si vedono i membri della lega');

  console.log('\n— Amministratore (letto come amministratore del progetto) —');
  const admin = adminClient();
  const members = await all(admin.from('league_members').select('user_id, role').eq('league_id', L), 'membri');
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const names = members.map((m) => `${users.data.users.find((u) => u.id === m.user_id)?.email ?? m.user_id} (${m.role})`);
  ok(members.some((m) => m.role === 'admin'), 'la lega ha almeno un amministratore', names.join(', '));

  console.log(failures ? `\n❌ ${failures} controlli non passati.` : '\n✅ Tutti i controlli passati: i numeri sono gli stessi dell\'app attuale.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('\n❌ ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
