// Importazione RIPETIBILE dei dati dell'app attuale in Supabase.
//
//   npm run import                                  → prova a secco: legge tutto, controlla, NON scrive nulla
//   npm run import -- --apply --admin-email=<email> → scrive (aggiorna quello che c'è già, non duplica)
//
// Opzioni:  --prune          toglie dal database le partite che nel foglio Google non ci sono più
//           --refresh-files  ricarica foto e Gazzette anche se sembrano già uguali
//
// Si può rilanciare quando si vuole: giocatori e partite si ritrovano con `legacy_id`, le squadre e le
// pagelle di ogni partita vengono allineate a quelle del foglio (quelle tolte nel foglio si tolgono).
import { adminClient, fetchFeed, fetchGazzettaFile, readRosa, type Admin } from './connect';
import {
  check, mapAlbo, mapMatchPlayers, mapMatches, mapPlayers, parsePhoto, summarize, type LegacyFeed, type LegacyRosa,
} from './map';

const LEAGUE_NAME = 'CalcioLercio';
const args = process.argv.slice(2);
const flag = (n: string) => args.includes('--' + n);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const chunk = <T,>(a: T[], n = 200): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const log = (s: string) => console.log(s);
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

async function main() {
  const apply = flag('apply');
  const rosa = readRosa();
  log('Leggo i dati attuali dallo script Google (sola lettura)…');
  const feed = await fetchFeed(rosa.backendUrl);

  const s = summarize(rosa, feed);
  log('\nDati attuali:');
  for (const [k, v] of Object.entries(s)) log(`  ${k.padEnd(24)} ${v}`);

  const { issues, counts } = check(rosa, feed);
  log('\nDopo la traduzione per il database:');
  for (const [k, v] of Object.entries(counts)) log(`  ${k.padEnd(24)} ${v}`);
  if (issues.length) {
    log(`\n⚠️  ${issues.length} cose che non tornano:`);
    issues.forEach((i) => log('  - ' + i));
  } else log('\n✅ Nessun problema nei dati.');

  if (!apply) {
    log('\nProva a secco: non ho scritto nulla. Per scrivere: npm run import -- --apply --admin-email=<email>');
    return;
  }
  if (issues.length) throw new Error('Mi fermo: sistema prima le cose che non tornano (non scrivo dati incompleti).');
  const adminEmail = opt('admin-email');
  if (!adminEmail) throw new Error('Manca --admin-email=<email>: è chi diventa amministratore della lega.');

  const db = adminClient();
  const refresh = flag('refresh-files');

  // 1) la lega (pubblica: si vede anche senza account, come l'app attuale)
  const leagueId = await ensureLeague(db);
  log(`\nLega "${LEAGUE_NAME}": ${leagueId}`);

  // 2) pesi dell'OVR (uguali per tutte le leghe)
  must(await db.from('app_settings').upsert({ key: 'ovr_weights', value: rosa.weights }), 'pesi OVR');

  // 3) giocatori (+ foto)
  const pRows = must(
    await db.from('players').upsert(mapPlayers(rosa), { onConflict: 'legacy_id' }).select('id, legacy_id'),
    'giocatori',
  );
  const playerIdOf = new Map(pRows.map((r) => [r.legacy_id as string, r.id]));
  log(`Giocatori: ${pRows.length}`);
  await uploadPhotos(db, rosa, playerIdOf, refresh);

  // 4) giocatori della lega (con i soprannomi per l'importazione WhatsApp)
  must(
    await db.from('league_players').upsert(
      rosa.players.map((p) => ({ league_id: leagueId, player_id: playerIdOf.get(p.id) as string, aliases: p.aliases ?? [] })),
      { onConflict: 'league_id,player_id' },
    ),
    'giocatori della lega',
  );

  // 5) partite
  const mapped = mapMatches(feed, leagueId);
  const mRows = must(await db.from('matches').upsert(mapped.rows, { onConflict: 'legacy_id' }).select('id, legacy_id'), 'partite');
  const matchIdOf = new Map(mRows.map((r) => [r.legacy_id as string, r.id]));
  log(`Partite: ${mRows.length}`);

  // 6) squadre e pagelle: allineate al foglio, partita per partita
  const mp = mapMatchPlayers(feed, rosa, (id) => matchIdOf.get(id), (id) => playerIdOf.get(id));
  for (const part of chunk(mp.rows)) must(await db.from('match_players').upsert(part, { onConflict: 'match_id,player_id' }), 'squadre e pagelle');
  const keep = new Set(mp.rows.map((r) => r.match_id + '|' + r.player_id));
  const existing = must(await db.from('match_players').select('match_id, player_id').in('match_id', [...matchIdOf.values()]), 'squadre esistenti');
  let removed = 0;
  for (const e of existing) {
    if (keep.has(e.match_id + '|' + e.player_id)) continue;
    must(await db.from('match_players').delete().eq('match_id', e.match_id).eq('player_id', e.player_id).select(), 'pulizia squadre');
    removed++;
  }
  log(`Squadre e pagelle: ${mp.rows.length}${removed ? ` (tolte ${removed} che nel foglio non ci sono più)` : ''}`);

  // 7) albo d'oro
  const albo = mapAlbo(feed, leagueId);
  must(await db.from('albo').upsert(albo.rows, { onConflict: 'league_id,season_key' }), 'albo');
  log(`Albo d'oro: ${albo.rows.length} stagioni`);

  // 8) Gazzette (immagini da Google Drive → archivio di Supabase)
  await uploadGazzette(db, rosa.backendUrl, feed, leagueId, matchIdOf, refresh);

  // 9) partite del database che nel foglio non ci sono più
  const inDb = must(await db.from('matches').select('id, legacy_id, date').eq('league_id', leagueId).not('legacy_id', 'is', null), 'partite nel database');
  const extra = inDb.filter((m) => !matchIdOf.has(m.legacy_id as string));
  if (extra.length && flag('prune')) {
    must(await db.from('matches').delete().in('id', extra.map((m) => m.id)).select(), 'rimozione partite');
    log(`Partite tolte (non più nel foglio): ${extra.length}`);
  } else if (extra.length) {
    log(`⚠️  ${extra.length} partite nel database non sono più nel foglio (${extra.map((m) => m.date).join(', ')}). Per toglierle: --prune`);
  }

  // 10) l'amministratore
  await ensureAdmin(db, leagueId, adminEmail);

  log('\n✅ Importazione finita. Per controllare i numeri: npm run import:verify');
}

async function ensureLeague(db: Admin): Promise<string> {
  const found = must(await db.from('leagues').select('id').eq('name', LEAGUE_NAME).limit(2), 'ricerca lega');
  if (found.length > 1) throw new Error(`Ci sono ${found.length} leghe chiamate "${LEAGUE_NAME}": non so quale usare.`);
  if (found[0]) {
    must(await db.from('leagues').update({ is_public: true }).eq('id', found[0].id).select(), 'lega pubblica');
    return found[0].id;
  }
  return (must(await db.from('leagues').insert({ name: LEAGUE_NAME, is_public: true }).select('id').single(), 'creazione lega') as { id: string }).id;
}

/** Estensione del file dal tipo dell'immagine. */
const extOf = (mime: string) => (/png/i.test(mime) ? 'png' : /webp/i.test(mime) ? 'webp' : 'jpg');

async function sizesIn(db: Admin, bucket: string, folder: string): Promise<Map<string, number>> {
  const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw new Error(`elenco file di ${bucket}: ${error.message}`);
  return new Map((data ?? []).map((f) => [f.name, Number((f.metadata as { size?: number } | null)?.size ?? -1)]));
}

async function uploadPhotos(db: Admin, rosa: LegacyRosa, playerIdOf: Map<string, string>, refresh: boolean) {
  const have = await sizesIn(db, 'photos', '');
  let up = 0;
  let same = 0;
  for (const p of rosa.players) {
    const ph = parsePhoto(p.photo);
    if (!ph) continue;
    const id = playerIdOf.get(p.id) as string;
    const path = `${id}.${extOf(ph.mime)}`;
    if (!refresh && have.get(path) === ph.bytes.length) same++;
    else {
      const r = await db.storage.from('photos').upload(path, ph.bytes, { contentType: ph.mime, upsert: true });
      if (r.error) throw new Error(`foto di ${p.name}: ${r.error.message}`);
      up++;
    }
    must(await db.from('players').update({ photo_path: path }).eq('id', id).select(), `foto di ${p.name}`);
  }
  log(`Foto: ${up} caricate, ${same} già uguali`);
}

async function uploadGazzette(
  db: Admin, backendUrl: string, feed: LegacyFeed, leagueId: string, matchIdOf: Map<string, string>, refresh: boolean,
) {
  const have = await sizesIn(db, 'gazzette', leagueId);
  let up = 0;
  let same = 0;
  for (const g of feed.gazzette) {
    const matchId = matchIdOf.get(g.matchId);
    if (!matchId) continue;
    const name = `${matchId}.jpg`;
    const path = `${leagueId}/${name}`;
    if (refresh || !have.has(name)) {
      const f = await fetchGazzettaFile(backendUrl, g.fileId);
      if (!f.bytes.length) throw new Error(`Gazzetta della partita ${g.matchId}: il file da Drive è vuoto`);
      const r = await db.storage.from('gazzette').upload(path, f.bytes, { contentType: f.mime, upsert: true });
      if (r.error) throw new Error(`Gazzetta ${g.matchId}: ${r.error.message}`);
      up++;
    } else same++;
    must(await db.from('gazzette').upsert({ match_id: matchId, file_path: path }, { onConflict: 'match_id' }), `Gazzetta ${g.matchId}`);
  }
  log(`Gazzette: ${up} caricate, ${same} già presenti`);
}

/** Crea (se manca) l'account con quell'email e lo rende amministratore della lega. */
async function ensureAdmin(db: Admin, leagueId: string, email: string) {
  const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw new Error(`elenco account: ${list.error.message}`);
  let user = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let created = false;
  if (!user) {
    const r = await db.auth.admin.createUser({ email, email_confirm: true });
    if (r.error || !r.data.user) throw new Error(`creazione account: ${r.error?.message}`);
    user = r.data.user;
    created = true;
  }
  must(await db.from('league_members').upsert({ league_id: leagueId, user_id: user.id, role: 'admin' }, { onConflict: 'league_id,user_id' }), 'amministratore');
  must(await db.from('leagues').update({ created_by: user.id }).eq('id', leagueId).is('created_by', null).select(), 'creatore lega');
  log(`Amministratore: ${email} (${created ? 'account creato' : 'account già esistente'})`);
}

main().catch((e) => {
  console.error('\n❌ ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
