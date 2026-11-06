import { expect, test } from '@playwright/test';
import { fixturePlayer, settledText, setup } from './helpers';

test('Profilo e scheda dalla Rosa mostrano gli stessi numeri e la stessa forma', async ({ page }) => {
  test.setTimeout(60_000);
  const player = fixturePlayer();
  await setup(page, { mePlayer: player });
  await page.goto('/l/san-marcello/profilo', { waitUntil: 'domcontentloaded' });
  const profile = page.locator('#profile-player-card');
  await expect(profile.locator('.pg-grid')).toBeVisible();
  const pagelle = await profile.locator('.pg-grid').innerText();
  const figurina = await settledText(profile.locator('.fut-mini'));
  const forma = await profile.locator('.fire-chip').allTextContents();
  const peso = await profile.locator('.stat-row-ro').innerText();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Rosa', exact: true }).click();
  const card = page.locator('#players-list .card-compact').filter({ has: page.getByText(player.name, { exact: true }) });
  const media = await card.locator('.pag-badge').innerText();
  await card.click();
  const detail = page.locator('#match-modal');
  await expect(detail.locator('.pg-grid')).toHaveText(pagelle, { useInnerText: true });
  await expect(detail.locator('.fut-mini')).toHaveText(figurina, { useInnerText: true });
  expect(await detail.locator('.fire-chip').allTextContents()).toEqual(forma);
  await expect(detail.locator('.stat-row-ro')).toHaveText(peso, { useInnerText: true });
  expect((await detail.locator('.fut-mini-pag').innerText()).trim().startsWith(media)).toBe(true);
});
