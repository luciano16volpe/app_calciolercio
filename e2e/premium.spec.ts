import { expect, test } from '@playwright/test';
import { openApp, openMenu, setup } from './helpers';

test('admin Standard mantiene la gestione ordinaria senza impostazioni avanzate né pubblicazione Gazzette', async ({page}) => {
  await setup(page,{publicRole:'admin'});
  await openApp(page,'/l/san-marcello/rosa');
  await expect(page.locator('.bottom-nav').getByRole('button',{name:'Gioca',exact:true})).toBeVisible();
  await openMenu(page);
  await expect(page.locator('#menu-members')).toBeVisible();
  await expect(page.locator('#menu-invites')).toBeVisible();
  await expect(page.locator('#menu-league-settings')).toHaveCount(0);
  await page.getByRole('button',{name:'Chiudi il menu'}).click();
  await page.locator('.bottom-nav').getByRole('button',{name:'Partite',exact:true}).click();
  await page.locator('#last-match .card').click();
  await page.locator('#edit-toggle-btn').click();
  await expect(page.getByRole('button',{name:/Salva partita/})).toBeVisible();
  await expect(page.locator('.gaz-edit')).toHaveCount(0);
});

test('durante la prova Premium la nuova lega viene richiesta e non creata direttamente', async ({page}) => {
  const writes=await setup(page,{rpc:{my_premium_status:[{active:true,trial:true,lifetime:false,expires_at:'2026-12-01',trial_expires_at:'2026-12-01'}],request_league:null}});
  await openApp(page);
  await openMenu(page);
  await expect(page.locator('#menu-create')).toContainText('Richiedi nuova lega');
  await page.locator('#menu-create').click();
  await page.locator('#cl-name').fill('Lega della prova');
  await page.locator('#cl-submit').click();
  await expect(page.locator('#toast')).toContainText('Richiesta inviata');
  expect(writes.filter((w)=>w.table==='request_league')).toHaveLength(1);
  expect(writes.some((w)=>w.table==='leagues' && w.method==='POST')).toBe(false);
});

test('funzione Premium: avviso a Standard; Beta assente dai riquadri',async ({page})=>{
  await setup(page,{rpc:{my_feature_modes:[{feature:'compare',mode:'standard',allowed:true},{feature:'couples',mode:'premium',allowed:false}]}});
  await openApp(page);
  await openMenu(page);
  await page.locator('#menu-players').click();
  await expect(page.locator('#menu-compare')).toBeVisible();
  await expect(page.locator('#menu-records')).toHaveCount(0);
  await page.locator('#menu-couples').click();
  await expect(page.getByRole('dialog',{name:'Funzionalità'})).toContainText('riservata agli utenti Premium');
  await expect(page.locator('#sheet-coppie')).toHaveCount(0);
});
