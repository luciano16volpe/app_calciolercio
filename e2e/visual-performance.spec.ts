import { expect, test } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { noOverflow, openMenu } from './helpers';

type FxWindow = Window & { __fxDraws: Record<string, number> };
function world() {
  const be=new FakeBackend(); const user=be.addUser('u-visual','visual@example.com','Visual test');
  be.leagues.push({id:'SM',name:'San Marcello',slug:'san-marcello',is_public:false,invite_code:'test',owner_id:user,settings:{},created_at:'2026-01-01'});
  be.members.push({league_id:'SM',user_id:user,role:'admin',joined_at:'2026-01-01'});
  be.seedFixtures('SM'); return {be,user};
}

test('player photos below the screen wait until scrolled near, keeping initials and layout', async ({ browser }) => {
  const {be,user}=world();
  for (const [i,p] of be.players.entries()) p.photo_path='visual-'+i+'.jpg';
  const ctx=await browser.newContext({viewport:{width:360,height:500},serviceWorkers:'block'});
  await be.attach(ctx,user); const page=await ctx.newPage(); const requested:string[]=[];
  page.on('request',r=>{if(r.url().includes('/public/photos/'))requested.push(r.url());});
  await page.goto('/l/san-marcello/rosa');
  const cards=page.locator('#players-list .card-compact'); await expect(cards).toHaveCount(22);
  const last=cards.last().locator('.avatar');
  await expect(cards.first().locator('.avatar img')).toBeVisible();
  expect((await last.boundingBox())!.y).toBeGreaterThan(660);
  await expect(last.locator('img')).toHaveCount(0);
  const before=await last.textContent(); expect(before?.trim()).not.toBe('');
  expect(requested.length).toBeLessThan(22);
  const size=await last.boundingBox();
  await last.scrollIntoViewIfNeeded(); await expect(last.locator('img')).toBeVisible();
  await expect.poll(()=>last.locator('img').evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBeGreaterThan(0);
  const after=await last.boundingBox(); expect(after!.height).toBe(size!.height); expect(after!.width).toBe(size!.width);
  await noOverflow(page);
});

test('offscreen archive thumbnails request no signed URL until approached', async ({ browser }) => {
  const {be,user}=world();
  be.gaz=be.matches.slice(0,12).map((m,i)=>({match_id:m.id,file_path:'visual-gaz-'+i+'.jpg'}));
  const ordered=[...be.gaz].sort((a,b)=>String(be.matches.find(m=>m.id===b.match_id)!.date).localeCompare(String(be.matches.find(m=>m.id===a.match_id)!.date)));
  const lastPath=String(ordered.at(-1)!.file_path).replace('.jpg','-t.jpg');
  const ctx=await browser.newContext({viewport:{width:360,height:500},serviceWorkers:'block'});
  await be.attach(ctx,user); const page=await ctx.newPage(); const requested:string[]=[];
  page.on('request',r=>{if(r.url().includes('/object/sign/'))requested.push(decodeURIComponent(r.url()));});
  await page.goto('/l/san-marcello/partite');
  await page.getByRole('button',{name:/Vedi tutte/}).click();
  const previews=page.locator('#match-modal .gaz-preview'); await expect(previews).toHaveCount(12);
  await expect(previews.first().locator('img')).toBeVisible();
  expect(requested.some(url=>url.includes(lastPath))).toBe(false);
  await previews.last().scrollIntoViewIfNeeded(); await expect(previews.last().locator('img')).toBeVisible();
  await expect.poll(()=>requested.some(url=>url.includes(lastPath))).toBe(true); await noOverflow(page);
});

test('canvas effects stop outside the viewport and while a menu covers the page', async ({ browser }) => {
  const {be,user}=world();
  const mp=be.mplayers[0]!; be.players.find(p=>p.id===mp.player_id)!.user_id=user;
  const ctx=await browser.newContext({viewport:{width:360,height:500},serviceWorkers:'block',reducedMotion:'no-preference'});
  await be.attach(ctx,user);
  await ctx.addInitScript(()=>{
    (window as unknown as FxWindow).__fxDraws={};
    const clear=CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect=function(...args:Parameters<typeof clear>){
      const id=this.canvas.id;
      if(id){const draws=(window as unknown as FxWindow).__fxDraws;draws[id]=(draws[id]??0)+1;}
      return clear.apply(this,args);
    };
  });
  const page=await ctx.newPage(); await page.goto('/l/san-marcello/profilo');
  const recent=page.locator('#profile-recent-matches'); await expect(recent).toBeAttached();
  await recent.scrollIntoViewIfNeeded();
  const draws=()=>page.evaluate(()=>(window as unknown as FxWindow).__fxDraws['recent-balls-fx']??0);
  await expect.poll(draws).toBeGreaterThan(2);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect.poll(async()=> (await recent.boundingBox())!.y).toBeGreaterThan(500);
  await page.waitForTimeout(100); const paused=await draws(); await page.waitForTimeout(200); expect(await draws()).toBe(paused);
  await recent.scrollIntoViewIfNeeded(); await expect.poll(draws).toBeGreaterThan(paused+1);
  await openMenu(page); await expect(page.locator('#recent-balls-fx')).toHaveCount(0);
  await page.getByRole('button',{name:'Chiudi il menu'}).click(); await expect(page.locator('#recent-balls-fx')).toHaveCount(1);
});
