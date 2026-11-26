import { expect, test } from '@playwright/test';
import { openApp, openMenu, setup } from './helpers';

test('La navigazione resta visibile e non copre l’ultima scheda', async ({ page }) => {
  await setup(page, { publicRole: 'admin' });
  await page.goto('/l/san-marcello/rosa');
  const cards = page.locator('#players-list .card-compact');
  await expect(cards).toHaveCount(22);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const nav = page.locator('.bottom-nav');
  await expect(nav).toBeVisible();
  await expect.poll(async () => {
    const last = await cards.last().boundingBox();
    const footer = await nav.boundingBox();
    return last && footer && last.y + last.height <= footer.y;
  }).toBe(true);
  await nav.getByRole('button', { name: 'Partite' }).click();
  await expect(page.locator('#page-partite')).toHaveClass(/active/);
});

test('Il footer resta visibile sopra i pannelli del menu e porta alla sezione scelta', async ({ page }) => {
  await setup(page, { publicRole: 'admin' });
  await openApp(page, '/l/san-marcello/rosa');
  await openMenu(page);
  await page.locator('#menu-league-admin').click();
  await page.locator('#menu-members').click();
  await expect(page.locator('#sheet-members')).toBeVisible();
  const nav = page.locator('.bottom-nav');
  await expect(nav).toBeVisible();
  // il footer è davvero in cima (nessun pannello lo copre) e non copre l'ultimo contenuto del pannello
  const box = (await nav.boundingBox())!;
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.bottom-nav') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(top).toBe(true);
  await nav.getByRole('button', { name: 'Partite' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  await expect(page.locator('#page-partite')).toHaveClass(/active/);
});

test('Nell’app installata Indietro non cambia le sezioni del footer ma chiude il menu', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(display-mode: standalone)'
      ? { matches: true } as MediaQueryList
      : original(query);
  });
  await openApp(page, '/l/san-marcello/profilo');
  await expect(page.locator('#page-profilo')).toHaveClass(/active/);
  const initialLength = await page.evaluate(() => history.length);
  for (const section of ['Rosa', 'Partite', 'Rosa']) {
    await page.locator('.bottom-nav').getByRole('button', { name: section }).click();
  }
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  expect(await page.evaluate(() => history.length)).toBe(initialLength);
  expect(await page.evaluate(() => history.state?.calciolercioBackGuard)).toBe(true);
  await page.evaluate(() => history.back());
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  await expect(page).toHaveURL(/\/rosa$/);
  await openMenu(page);
  await page.evaluate(() => history.back());
  await expect(page.locator('#menu-drawer')).toHaveCount(0);
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  expect(await page.evaluate(() => history.length)).toBe(initialLength);
});

test('In Safari su iPhone i due bordi non avviano Indietro o Avanti nelle pagine del footer', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  });
  await openApp(page, '/l/san-marcello/rosa');
  await expect(page.locator('#page-rosa')).toHaveClass(/active/);
  const blocked = await page.locator('#page-rosa').evaluate((target) => {
    return [10, window.innerWidth - 10].map((x) => {
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: 200 }] });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(blocked).toEqual([true, true]);
  const menuTapAllowed = await page.locator('#menu-button').evaluate((target) => {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientX: 20, clientY: 20 }] });
    target.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  expect(menuTapAllowed).toBe(true);
  await openMenu(page);
  await page.locator('#menu-players').click();
  await page.locator('#menu-couples').click();
  const sheet = page.locator('#sheet-coppie');
  await expect(sheet).toBeVisible();
  await sheet.evaluate((target) => {
    const touch = (x: number) => ({ identifier: 1, target, clientX: x, clientY: 200 });
    const start = touch(10);
    const end = touch(110);
    const emit = (type: string, touches: object[], changedTouches: object[]) => target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches, changedTouches }));
    emit('touchstart', [start], [start]);
    emit('touchmove', [end], [end]);
    emit('touchend', [], [end]);
  });
  await expect(page.locator('#sheet-players-hub')).toBeVisible();
});
