// Registro attività: frasi leggibili, raggruppamento per operazione, azioni delicate, CSV.
import { describe, expect, it } from 'vitest';
import { changeLines, deviceName, DELICATE_ACTIONS, describeRow, formatDateTime, groupOperations, isDelicate, mergeRows, toCsv, type AuditRow } from '../src/domain/audit';

let n = 0;
const row = (over: Partial<AuditRow>): AuditRow => ({
  id: ++n, at: '2026-10-28T13:32:00Z', actor_id: 'u1', actor_name: 'Marco', action: 'x', entity: 'x', entity_id: null, entity_label: null,
  league_id: 'L1', league_name: 'Lega del Mercoledì', grp: 'partite', tx: 100, changes: null, source: 'app', ip: null, user_agent: null, ...over,
});
const pag = (player: string, changes: Record<string, unknown>, over: Partial<AuditRow> = {}) =>
  row({ action: 'match_players.update', entity: 'match_players', entity_label: `${player} · partita del 28/10/2026`, changes, ...over });

describe('frasi leggibili', () => {
  it('voto cambiato, messo e tolto', () => {
    expect(describeRow(pag('Peppe', { rating: [6, 6.5] }))).toEqual(['ha cambiato il voto di Peppe da 6 a 6,5']);
    expect(describeRow(pag('Peppe', { rating: [null, 7] }))).toEqual(['ha messo il voto 7 a Peppe']);
    expect(describeRow(pag('Peppe', { rating: [7, null] }))).toEqual(['ha tolto il voto di Peppe (era 7)']);
  });
  it('titolo e descrizione', () => {
    expect(describeRow(pag('Steppata', { titolo: [null, 'LEADER'] }))).toEqual(['ha aggiunto il titolo «LEADER» a Steppata']);
    expect(describeRow(pag('Steppata', { titolo: ['A', 'B'] }))).toEqual(['ha cambiato il titolo di Steppata da «A» a «B»']);
    expect(describeRow(pag('Steppata', { titolo: ['A', null] }))).toEqual(['ha tolto il titolo «A» a Steppata']);
    expect(describeRow(pag('Steppata', { descrizione: [null, 'Bella'] }))).toEqual(['ha scritto la descrizione di Steppata']);
    expect(describeRow(pag('Steppata', { descrizione: ['x', 'y'] }))).toEqual(['ha modificato la descrizione di Steppata']);
  });
  it('più campi nella stessa riga danno più frasi; gol e assist', () => {
    const s = describeRow(pag('Caputo', { goals: [0, 2], assist: [1, 1.0 + 1], rating: [6, 7] }));
    expect(s).toContain('ha cambiato il voto di Caputo da 6 a 7');
    expect(s).toContain('ha cambiato i gol di Caputo da 0 a 2');
    expect(s).toContain('ha cambiato gli assist di Caputo da 1 a 2');
  });
  it('statistiche del giocatore con il nome della statistica', () => {
    const r = row({ action: 'players.update', entity: 'players', entity_label: 'Marco R.', grp: 'giocatori', changes: { stats: [[5, 5, 5, 5, 6, 5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 5]], roles: [['MED'], ['MED', 'ATT']] } });
    expect(describeRow(r)).toEqual(['ha cambiato tiro di Marco R. da 6 a 7', 'ha cambiato i ruoli di Marco R. da MED a MED/ATT']);
  });
  it('ruoli, proposte e cessione della proprietà', () => {
    expect(describeRow(row({ action: 'league_members.role', entity: 'league_members', entity_label: 'Giulia', changes: { role: ['member', 'redazione'] } }))).toEqual(['ha cambiato il ruolo di Giulia da membro a redazione']);
    expect(describeRow(row({ action: 'league_admin_requests.approved', entity_label: 'Giulia' }))).toEqual(['ha approvato Giulia come amministratore']);
    expect(describeRow(row({ action: 'leagues.owner', entity_label: 'Lega X' }))).toEqual(['ha cambiato il creatore della lega «Lega X»']);
  });
  it('chi entra da solo e chi viene aggiunto', () => {
    expect(describeRow(row({ actor_name: 'Marco', action: 'league_members.insert', entity_label: 'Marco' }))).toEqual(['è entrato nella lega']);
    expect(describeRow(row({ actor_name: 'Luciano', action: 'league_members.insert', entity_label: 'Marco' }))).toEqual(['ha aggiunto Marco alla lega']);
    expect(describeRow(row({ actor_name: 'Marco', action: 'league_members.delete', entity_label: 'Marco' }))).toEqual(['è uscito dalla lega']);
    expect(describeRow(row({ actor_name: 'Luciano', action: 'league_members.delete', entity_label: 'Marco' }))).toEqual(['ha tolto Marco dalla lega']);
  });
  it('partita, risultato, Gazzetta, albo, accessi, unione', () => {
    expect(describeRow(row({ action: 'matches.update', entity_label: 'partita del 28/10/2026', changes: { score_a: [null, 5], score_b: [null, 3] } }))).toEqual(['ha cambiato il risultato della partita del 28/10/2026 da ?-? a 5-3'.replace('?-?', '–-–')]);
    expect(describeRow(row({ action: 'matches.delete', entity_label: 'partita del 28/10/2026' }))).toEqual(['ha eliminato la partita del 28/10/2026']);
    expect(describeRow(row({ action: 'gazzette.insert', entity_label: 'Gazzetta · partita del 28/10/2026' }))).toEqual(['ha caricato la Gazzetta della partita del 28/10/2026']);
    expect(describeRow(row({ action: 'albo.update', entity_label: 'stagione 2026-AUT', changes: { status: ['aperta', 'chiusa'] } }))).toEqual(['ha cambiato lo stato della stagione 2026-AUT da aperta a chiusa']);
    expect(describeRow(row({ action: 'auth.login' }))).toEqual(['ha fatto l’accesso']);
    expect(describeRow(row({ action: 'players.merge', entity_label: 'Pino → Giuseppe' }))).toEqual(['ha unito i giocatori Pino → Giuseppe']);
    expect(describeRow(row({ action: 'player_claims.approved', entity_label: 'Marco ← Marchino' }))).toEqual(['ha confermato che Marchino è Marco']);
  });
  it('regole di gioco cambiate dal superadmin', () => {
    expect(describeRow(row({ action: 'app_settings.update', entity_label: 'ovr_weights' }))).toEqual(['ha cambiato le regole di gioco: pesi delle statistiche']);
    expect(describeRow(row({ action: 'app_settings.update', entity_label: 'game_modules' }))).toEqual(['ha cambiato le regole di gioco: formazioni']);
  });
  it('azione sconosciuta: una frase di riserva, mai vuoto', () => {
    expect(describeRow(row({ action: 'cosa.nuova', entity_label: 'boh' }))).toEqual(['cosa.nuova · boh']);
    expect(describeRow(pag('Peppe', {}))[0]).toBeTruthy();
  });
});

describe('azioni delicate', () => {
  it('sono quelle della specifica', () => {
    expect([...DELICATE_ACTIONS].sort()).toEqual(['account.delete', 'league_admin_requests.approved', 'league_members.role', 'leagues.delete', 'leagues.owner', 'matches.delete', 'players.merge', 'players.unlink']);
    expect(isDelicate('league_members.role')).toBe(true);
    expect(isDelicate('match_players.update')).toBe(false);
  });
});

describe('raggruppamento per operazione', () => {
  it('10 pagelle salvate insieme sono un\'operazione sola', () => {
    const rows = Array.from({ length: 10 }, (_, i) => pag(`G${i}`, { rating: [null, 6] }, { tx: 500 }));
    rows.push(row({ action: 'auth.login', tx: 400, grp: 'account' }));
    const g = groupOperations(rows);
    expect(g).toHaveLength(2);
    expect(g[0]?.rows).toHaveLength(10);
    expect(g[0]?.headline).toBe('Salvataggio partita del 28/10/2026 (10 modifiche)');
    expect(g[0]?.actor).toBe('Marco');
    expect(g[0]?.league).toBe('Lega del Mercoledì');
    expect(g[1]?.headline).toBe('ha fatto l’accesso');
  });
  it('un\'operazione con un\'azione delicata è segnata', () => {
    const g = groupOperations([row({ action: 'league_members.role', entity_label: 'Giulia', changes: { role: ['member', 'admin'] }, tx: 9 }), row({ action: 'auth.login', tx: 8 })]);
    expect(g.map((x) => x.delicate)).toEqual([true, false]);
  });
  it('persone diverse nella stessa operazione non si mescolano; sistema e importazione hanno un nome', () => {
    const g = groupOperations([row({ tx: 1, actor_id: null, actor_name: null, source: 'import', action: 'matches.insert', entity_label: 'partita del 01/01/2026' }), row({ tx: 1, actor_id: 'u2', actor_name: 'Giulia', action: 'auth.login' })]);
    expect(g).toHaveLength(2);
    expect(g[0]?.actor).toBe('Importazione');
  });
  it('unire una nuova pagina non ripete le righe e tiene l\'ordine', () => {
    const a = row({ id: 10, at: '2026-10-28T10:00:00Z' });
    const b = row({ id: 11, at: '2026-10-29T10:00:00Z' });
    const c = row({ id: 9, at: '2026-10-27T10:00:00Z' });
    expect(mergeRows([b, a], [a, c]).map((r) => r.id)).toEqual([11, 10, 9]);
  });
});

describe('dettaglio di una riga', () => {
  it('prima → dopo per le modifiche, valori per creazioni e cancellazioni', () => {
    expect(changeLines(pag('Peppe', { rating: [6, 6.5], titolo: [null, 'LEADER'] }))).toEqual(['voto: 6 → 6.5', 'titolo: — → LEADER']);
    expect(changeLines(row({ action: 'matches.insert', changes: { date: '2026-10-28', notes: null } }))).toEqual(['data: 2026-10-28', 'descrizione: —']);
    expect(changeLines(row({ action: 'auth.login', changes: null }))).toEqual([]);
  });
});

describe('esportazione e formato', () => {
  it('CSV con intestazione, separatore «;» e virgolette doppie', () => {
    const csv = toCsv([row({ action: 'league_members.role', entity_label: 'Gi"ulia; X', changes: { role: ['member', 'admin'] }, ip: '1.2.3.4', user_agent: 'iPhone Safari' })]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Data e ora;Persona;Lega;Gruppo;Azione;Oggetto;Cosa è successo;Delicata;Prima → dopo;IP;Dispositivo;Origine;Operazione');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Gi""ulia; X"');
    expect(lines[1]).toContain(';sì;');
    expect(lines[1]).toContain('1.2.3.4');
  });
  it('data e ora all\'italiana, ora di Roma', () => {
    expect(formatDateTime('2026-10-28T13:32:00Z')).toBe('28/10/2026 14:32'); // CET (ora solare dal 25/10)
    expect(formatDateTime('2026-07-28T13:32:00Z')).toBe('28/07/2026 15:32'); // CEST
  });
  it('dispositivo leggibile', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(deviceName(null)).toBe('');
  });
});
