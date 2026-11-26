import { expect, test } from '@playwright/test';
import { noOverflow, openApp, setup } from './helpers';

test('classifica Dollalerci leggibile sui telefoni', async ({ page }) => {
  await setup(page, { rpc: {
    advanced_prediction_enabled: true,
    betting_board: [{ match_id: 'm-wallet', date: '2026-11-20', play_time: '21:00:00',
      score_a: 2, score_b: 1, is_open: false, my_prediction: null, total: 0, entries: [] }],
    wallet_state: { balance: 51, topped_up: 0, first_time: false, next_topup: null },
    wallet_leaderboard: [{ position: 1, user_id: 'u1', name: 'Luciano', net: 1, staked: 3, won: 4 }],
    advanced_prediction_leaderboard: [],
  } });
  await openApp(page);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Bet', exact: true }).click();
  await page.getByRole('tab', { name: 'Classifica' }).click();
  await expect(page.getByRole('heading', { name: 'Classifica Dollalerci' })).toBeVisible();
  await expect(page.locator('.wallet-leaderboard li')).toContainText('Luciano');
  await expect(page.locator('.wallet-leaderboard li')).toContainText('+1');
  await noOverflow(page);
});
