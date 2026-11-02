// Impostazioni (passo 3.8): versione, formazioni, forma recente, pesi in sola lettura, account.
import { expect, test, type Page } from '@playwright/test';
import { lastWrite, openSettings as openSettingsFromMenu, setup } from './helpers';

// l'app si apre solo con l'accesso: la prova entra come membro della lega pubblica vera (accesso simulato, letture vere)
test.beforeEach(async ({ page }) => {
  await setup(page, { publicRole: 'member' });
});

const openSettings = (page: Page) => openSettingsFromMenu(page);
const noOverflow = async (page: Page) =>
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) - (page.viewportSize() as { width: number }).width).toBeLessThanOrEqual(0);

test('Notifiche: su iPhone senza l\u2019app installata si spiega come installarla', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'solo iPhone');
  await openSettings(page);
  await expect(page.locator('#push-state')).toContainText('Aggiungi alla schermata Home');
  await expect(page.locator('#push-enable')).toHaveCount(0);
  await noOverflow(page);
});

test('Notifiche: si attivano e si tolgono da Impostazioni (iscrizione salvata con le funzioni sicure)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'iphone', 'su iPhone servono la schermata Home');
  // telefono finto: permesso, service worker e iscrizione (nel provino il service worker non c\u2019è)
  await page.addInitScript(() => {
    let perm = 'default';
    let current: unknown = null;
    const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'PPP', auth: 'AAA' } }), unsubscribe: async () => { current = null; return true; } };
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = sub) } };
    const sw = navigator.serviceWorker as unknown as Record<string, unknown>;
    Object.defineProperty(sw, 'ready', { get: () => Promise.resolve(reg) });
    sw.getRegistration = async () => reg;
    Object.defineProperty(Notification, 'permission', { get: () => perm });
    (Notification as unknown as { requestPermission: () => Promise<string> }).requestPermission = async () => (perm = 'granted');
  });
  const writes = await setup(page, { rpc: { push_public_key: 'BAECAwQFBgc' } });
  await openSettings(page);
  await expect(page.locator('#push-state')).toContainText('Non sono attive');
  await page.locator('#push-enable').click();
  await expect(page.locator('#toast')).toContainText('Notifiche attivate');
  expect(lastWrite(writes, 'save_push_subscription').body).toMatchObject({ p_endpoint: 'https://push.example/abc', p_p256dh: 'PPP', p_auth: 'AAA' });
  expect(writes.some((w) => w.table === 'push_subscriptions')).toBe(false); // niente scritture dirette nella tabella
  await expect(page.locator('#push-state')).toContainText('Attive su questo telefono');
  await expect(page.locator('#push-test')).toBeVisible();
  await noOverflow(page);
  await page.locator('#push-disable').click();
  await expect(page.locator('#toast')).toContainText('Notifiche disattivate');
  expect(lastWrite(writes, 'remove_push_subscription').body).toEqual({ p_endpoint: 'https://push.example/abc' });
  await expect(page.locator('#push-state')).toContainText('Non sono attive');
});

test('Password: si cambia dalle impostazioni (controlli, poi salva)', async ({ page }) => {
  let sent: unknown = null;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  await page.route('**/auth/v1/user*', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (r.request().method() === 'PUT') sent = r.request().postDataJSON();
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'luciano@example.com' }) });
  });
  await openSettings(page);
  const card = page.locator('#password-card');
  await expect(card).toBeVisible();
  // troppo corta
  await card.locator('#pwd-new').fill('abc');
  await card.locator('#pwd-again').fill('abc');
  await card.locator('#pwd-save').click();
  await expect(card.locator('#pwd-msg')).toContainText('almeno 6 caratteri');
  // due password diverse
  await card.locator('#pwd-new').fill('segreta123');
  await card.locator('#pwd-again').fill('segreta124');
  await card.locator('#pwd-save').click();
  await expect(card.locator('#pwd-msg')).toContainText('non sono uguali');
  expect(sent).toBeNull();
  // giusta
  await card.locator('#pwd-again').fill('segreta123');
  await card.locator('#pwd-save').click();
  await expect(card.locator('#pwd-msg')).toContainText('Password cambiata');
  expect(sent).toMatchObject({ password: 'segreta123' });
  await expect(card.locator('#pwd-new')).toHaveValue('');
  await noOverflow(page);
});

test('Aspetto: chiaro, scuro e come il telefono; la scelta resta dopo il riavvio', async ({ page }) => {
  await openSettings(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--gray').trim());
  const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await expect(page.locator('#theme-auto')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#theme-dark').click();
  expect(await attr()).toBe('dark');
  expect(await bg()).toBe('#181c24');
  await page.locator('#theme-light').click();
  expect(await attr()).toBe('light');
  expect(await bg()).toBe('#f2f4f7');
  await page.reload();
  expect(await attr()).toBe('light'); // ricordato
  await openSettings(page);
  await expect(page.locator('#theme-light')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#theme-auto').click();
  expect(await attr()).toBeNull();
  await noOverflow(page);
});

test('Aspetto: scegliere «Scuro» vale anche se il telefono è in chiaro, e «Chiaro» se è in scuro', async ({ browser }) => {
  for (const [phone, pick, want] of [['light', 'dark', '#181c24'], ['dark', 'light', '#f2f4f7']] as const) {
    const ctx = await browser.newContext({ colorScheme: phone });
    const page = await ctx.newPage();
    await setup(page, { publicRole: 'member' });
    await openSettings(page);
    await page.locator(`#theme-${pick}`).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--gray').trim())).toBe(want);
    await ctx.close();
  }
});

test('Impostazioni: solo versione, aggiornamento e account (le regole di gioco sono nel menu)', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#app-version')).not.toBeEmpty();
  await expect(page.locator('#account-card')).toBeVisible();
  // formazioni, forma recente e pesi non si vedono più qui
  await expect(page.locator('.module-tile')).toHaveCount(0);
  await expect(page.locator('#form-switch')).toHaveCount(0);
  await expect(page.locator('.w-row')).toHaveCount(0);
  await noOverflow(page);
});

