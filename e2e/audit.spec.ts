// Registro attività: schermata dell'amministratore supremo (filtri, gruppi, azioni delicate, dettaglio, pagine, CSV) a 360 px e sui telefoni.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mineAs, noOverflow, openApp, openPanel, setup } from './helpers';

let id = 1000;
const row = (over: Record<string, unknown>) => ({
  id: ++id, at: '2026-10-28T13:32:00Z', actor_id: 'u2', actor_name: 'Marco', action: 'auth.login', entity: 'auth', entity_id: null, entity_label: 'Marco',
  league_id: 'L2', league_name: 'Lega del Mercoledì', grp: 'account', tx: id, changes: null, source: 'app', ip: '203.0.113.7',
  user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', ...over,
});
const pag = (player: string, changes: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  row({ action: 'match_players.update', entity: 'match_players', entity_label: `${player} · partita del 28/10/2026`, grp: 'partite', changes, ...over });

const ROWS = [
  ...Array.from({ length: 10 }, (_, i) => pag(`Giocatore${i}`, { rating: [null, 6] }, { tx: 7777, at: '2026-10-28T13:32:00Z' })),
  pag('Peppe', { rating: [6, 6.5] }, { tx: 7000, at: '2026-10-28T12:00:00Z', actor_name: 'Luciano', actor_id: 'u1' }),
  row({ action: 'league_members.role', entity: 'league_members', entity_label: 'Giulia', grp: 'leghe', changes: { role: ['member', 'admin'] }, tx: 6000, at: '2026-10-27T10:00:00Z', actor_name: 'Luciano', actor_id: 'u1' }),
  row({ action: 'auth.login', tx: 5000, at: '2026-10-26T10:00:00Z', ip: null, user_agent: null }),
];

async function openAudit(page: Page, rows: unknown[], queries?: string[]) {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true }, audit: rows, auditQueries: queries });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openPanel(page, '#menu-audit', '#sheet-audit');
  await page.locator('#audit-search').click();
}

test('Registro: operazioni raggruppate, frasi leggibili e azione delicata evidenziata', async ({ page }) => {
  await openAudit(page, ROWS);
  await expect(page.locator('.audit-op')).toHaveCount(4);
  await expect(page.locator('#audit-count')).toContainText('4 operazioni (13 righe)');
  const first = page.locator('.audit-op').first();
  await expect(first).toContainText('Marco · 28/10 14:32 · Lega del Mercoledì');
  await expect(first).toContainText('Salvataggio partita del 28/10/2026 (10 modifiche)');
  await expect(page.locator('.audit-op').nth(1)).toContainText('ha cambiato il voto di Peppe da 6 a 6,5');
  const delicate = page.locator('.audit-op.delicate');
  await expect(delicate).toHaveCount(1);
  await expect(delicate).toContainText('⚠️');
  await expect(delicate).toContainText('ha cambiato il ruolo di Giulia da membro a amministratore');
  await noOverflow(page);
});

test('Registro: si apre l\'operazione e poi il dettaglio di una riga (prima → dopo, IP, dispositivo)', async ({ page }) => {
  await openAudit(page, ROWS);
  await page.locator('.audit-op').first().locator('.audit-head').click();
  await expect(page.locator('.audit-op').first().locator('.audit-row')).toHaveCount(10);
  await page.locator('.audit-op').first().locator('.audit-row button').first().click();
  const d = page.locator('.audit-detail').first();
  await expect(d).toContainText('voto: — → 6');
  await expect(d).toContainText('IP: 203.0.113.7');
  await expect(d).toContainText('iPhone · Safari');
  // riga senza IP né dispositivo (più vecchia di 60 giorni)
  await page.locator('.audit-op').nth(3).locator('.audit-head').click();
  await page.locator('.audit-op').nth(3).locator('.audit-row button').click();
  await expect(page.locator('.audit-op').nth(3).locator('.audit-detail')).toContainText('non più conservato');
  await noOverflow(page);
});

test('Registro: i filtri arrivano al database (periodo, lega, persona, gruppo, solo delicate)', async ({ page }) => {
  const queries: string[] = [];
  await openAudit(page, ROWS, queries);
  await expect(page.locator('.audit-op').first()).toBeVisible();
  // il periodo predefinito è 7 giorni: c'è un limite inferiore sulla data
  expect(queries.some((q) => /at=gte\./.test(q))).toBe(true);
  await page.locator('#audit-league').focus();
  await page.locator('#audit-league').selectOption({ label: 'Lega del Mercoledì' });
  await page.locator('#audit-search').click();
  await expect.poll(() => queries.some((q) => q.includes('league_id=eq.L2'))).toBe(true);
  await page.locator('#audit-actor').selectOption({ label: 'Luciano' });
  await page.locator('#audit-search').click();
  await expect.poll(() => queries.some((q) => q.includes('actor_id=eq.u1'))).toBe(true);
  await page.locator('#audit-group').selectOption('leghe');
  await page.locator('#audit-search').click();
  await expect.poll(() => queries.some((q) => q.includes('grp=eq.leghe'))).toBe(true);
  await page.locator('#audit-delicate').check();
  await page.locator('#audit-search').click();
  await expect.poll(() => queries.some((q) => q.includes('action=in.(league_members.role') && q.includes('account.delete'))).toBe(true);
  await page.getByRole('button', { name: 'Oggi' }).click();
  await page.getByRole('button', { name: 'Date' }).click();
  await page.locator('#audit-from').fill('2026-10-01');
  await page.locator('#audit-to').fill('2026-10-31');
  await page.locator('#audit-search').click();
  await expect.poll(() => queries.some((q) => /at=lt\./.test(q) && /at=gte\./.test(q))).toBe(true);
  await noOverflow(page);
});

test('Registro: vuoto con i filtri scelti, e caricamento a pagine di 50', async ({ page }) => {
  const many = Array.from({ length: 120 }, (_, i) => row({ action: 'auth.login', tx: 20000 + i, at: new Date(Date.UTC(2026, 9, 28, 12, 0, 0) - i * 60_000).toISOString() }));
  await openAudit(page, many);
  await expect(page.locator('.audit-op')).toHaveCount(50);
  await expect(page.locator('#audit-more')).toBeVisible();
  await page.locator('#audit-more').click();
  await expect(page.locator('.audit-op')).toHaveCount(100);
  await page.locator('#audit-more').click();
  await expect(page.locator('.audit-op')).toHaveCount(120);
  await expect(page.locator('#audit-more')).toHaveCount(0);
});

test('Registro: nessuna azione → messaggio', async ({ page }) => {
  await openAudit(page, []);
  await expect(page.locator('#audit-empty')).toContainText('Nessuna azione in questo periodo');
  await expect(page.locator('#audit-csv')).toBeDisabled();
});

test('Registro: esporta CSV delle righe filtrate', async ({ page }) => {
  await openAudit(page, ROWS);
  await expect(page.locator('.audit-op').first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#audit-csv').click()]);
  expect(dl.suggestedFilename()).toMatch(/^registro-attivita-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await dl.path();
  const text = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split('\r\n');
  expect(lines[0]).toBe('Data e ora;Persona;Lega;Gruppo;Azione;Oggetto;Cosa è successo;Delicata;Prima → dopo;IP;Dispositivo;Origine;Operazione');
  expect(lines).toHaveLength(14); // intestazione + 13 righe
  expect(text).toContain('ha cambiato il ruolo di Giulia da membro a amministratore;sì;');
});

test('Registro: se il database rifiuta (non sei amministratore supremo) si vede il messaggio', async ({ page }) => {
  await setup(page, { mine: mineAs('member', { owner_id: 'altro' }), rpc: { is_super_admin: true } });
  // la lettura del registro fallisce
  await page.route('**/rest/v1/audit_log*', (r) => r.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied for table audit_log' }) }));
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openPanel(page, '#menu-audit', '#sheet-audit');
  await page.locator('#audit-search').click();
  await expect(page.locator('#audit-error')).toContainText('permission denied');
});

 test('Registro: apertura e modifica filtri non avviano ricerche', async ({ page }) => {
  const queries: string[] = [];
  await setup(page, { mine: mineAs('member'), rpc: { is_super_admin: true }, audit: ROWS, auditQueries: queries });
  await openApp(page, '/l/lega-di-prova/rosa', 0);
  await openPanel(page, '#menu-superadmin', '#sheet-superadmin-hub');
  await expect(page.locator('#sheet-superadmin-hub .premium-tile')).toHaveCount(6);
  await noOverflow(page);
  await page.locator('#menu-audit').click();
  await expect(page.locator('#audit-start')).toBeVisible();
  expect(queries).toHaveLength(0);
  await page.locator('#audit-group').selectOption('leghe');
  await page.locator('#audit-delicate').check();
  expect(queries).toHaveLength(0);
  await page.locator('#audit-search').click();
  await expect(page.locator('#audit-count')).toContainText('operazioni');
  expect(queries).toHaveLength(1);
  await page.locator('#audit-group').selectOption('account');
  await expect(page.getByRole('status').filter({ hasText: 'Filtri modificati' })).toBeVisible();
  expect(queries).toHaveLength(1);
 });
