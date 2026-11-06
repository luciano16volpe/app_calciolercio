import { expect, test } from '@playwright/test';
import { openApp, setup } from './helpers';

test('accesso su telefono condiviso elimina la cache del precedente account', async ({ page }) => {
  await setup(page, { publicRole: 'member' });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cache-test-initialized')) return;
    sessionStorage.setItem('cache-test-initialized', '1');
    localStorage.setItem('calciolercio-cache', 'vecchia cache condivisa');
    localStorage.setItem('calciolercio-cache-owner', 'altro-utente');
    localStorage.setItem('calciolercio-cache-user:altro-utente', 'dati privati');
  });
  await openApp(page);
  await expect.poll(() => page.evaluate(() => ({
    old: localStorage.getItem('calciolercio-cache'),
    other: localStorage.getItem('calciolercio-cache-user:altro-utente'),
    owner: localStorage.getItem('calciolercio-cache-owner'),
  }))).toEqual({ old: null, other: null, owner: 'u1' });
});
