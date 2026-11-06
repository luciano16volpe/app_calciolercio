import { expect, test } from '@playwright/test';
import { fixturePlayer, openPanel, setup } from './helpers';

function gate() { let release!: () => void; const promise=new Promise<void>((resolve)=>{release=resolve;}); return {promise,release}; }

test('data, page code and profile data share one central spinner without loading text', async ({page})=>{
  const history=gate(), code=gate(), player=gate(); let codeRequested=false;
  await setup(page,{publicRole:'admin',mePlayer:fixturePlayer()});
  await page.route('**/rest/v1/match_player_summaries*',async r=>{await history.promise;await r.fallback();});
  await page.route('**/assets/ProfiloPage-*.js',async r=>{codeRequested=true;await code.promise;await r.fallback();});
  await page.route('**/rest/v1/players*',async r=>{if(new URL(r.request().url()).searchParams.has('user_id')) await player.promise;await r.fallback();});
  await page.goto('/l/san-marcello/profilo');
  const spinner=page.locator('#app-loading .app-spinner');
  await expect(spinner).toHaveCount(1);
  const box=await spinner.boundingBox();const size=page.viewportSize()!;
  expect(Math.abs(box!.x+box!.width/2-size.width/2)).toBeLessThan(2);
  expect(Math.abs(box!.y+box!.height/2-size.height/2)).toBeLessThan(2);
  expect(await page.locator('body').innerText()).not.toMatch(/Caricamento|⏳/);
  history.release(); await expect.poll(()=>codeRequested).toBe(true);
  await expect(spinner).toHaveCount(1);
  code.release(); await expect(page.locator('#myplayer-card')).toBeVisible();
  await expect(spinner).toHaveCount(1);
  expect(await page.locator('body').innerText()).not.toMatch(/Caricamento|⏳/);
  player.release(); await expect(spinner).toHaveCount(0);
});

test('every new or previously visited tab starts at the top, including clicking the active tab',async({page})=>{
  await page.setViewportSize({width:360,height:500});
  await setup(page,{publicRole:'admin',mePlayer:fixturePlayer()});
  await page.goto('/l/san-marcello/profilo');await expect(page.locator('#myplayer-card')).toBeVisible();
  const nav=page.locator('.bottom-nav');
  const pages=[['Rosa','#players-list'],['Classifiche','#cl-content'],['Partite','#partite-content'],['Gioca','.gioca-intro'],['Il mio profilo','#myplayer-card'],['Rosa','#players-list']];
  for(const [name,marker] of pages){
    await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(50);
    await nav.getByRole('button',{name,exact:true}).click();
    await expect(page.locator(marker!)).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  }
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await nav.getByRole('button',{name:'Rosa',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await nav.getByRole('button',{name:'Classifiche',exact:true}).click();
  await expect(page.locator('#cl-content')).toBeVisible();
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await page.locator('#cl-tabs').getByRole('button',{name:/Assist/}).click();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
});

test('moving between menu pages resets the panel scroll',async({page})=>{
  await page.setViewportSize({width:360,height:500});
  await setup(page);await page.goto('/l/san-marcello/profilo');await expect(page.locator('#myplayer-card')).toBeVisible();
  await openPanel(page,'#menu-couples','#sheet-coppie');
  const body=page.locator('#sheet-coppie .sheet-b');
  await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.locator('#sheet-coppie').getByRole('button',{name:'Indietro',exact:true}).click();
  await expect(page.locator('#sheet-players-hub')).toBeVisible();
  expect(await page.locator('#sheet-players-hub .sheet-b').evaluate(el=>el.scrollTop)).toBe(0);
});
