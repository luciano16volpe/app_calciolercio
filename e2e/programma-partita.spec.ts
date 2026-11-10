import { expect, test, type Browser, type TestInfo } from './fixtures';
import { FakeBackend } from './fakeBackend';
import { noOverflow } from './helpers';

async function openPlanned(browser: Browser, info: TestInfo, role='admin') {
  const be=new FakeBackend();
  const user=be.addUser('u-planned','planned@example.invalid','Organizzatore');
  be.leagues.push({id:'SM',name:'San Marcello',slug:'san-marcello',is_public:false,invite_code:'abc12345',owner_id:user,settings:{},created_at:'2026-01-01'});
  be.members.push({league_id:'SM',user_id:user,role,joined_at:'2026-01-01'});
  be.seedFixtures('SM');
  const ids=be.players.slice(0,5).map((p)=>String(p.id));
  be.matches.push({id:'planned',league_id:'SM',date:'2026-11-20',play_time:'21:00:00',place:'Campo Sole',notes:'Partita da organizzare',score_a:null,score_b:null,pred:0,pred_rank:1});
  ids.slice(0,4).forEach((id,i)=>be.mplayers.push({match_id:'planned',player_id:id,team:i<2?'A':'B',position:i%2,rating:null,goals:0,assist:0,autogol:0,meta:0,rigori_sbagliati:0,titolo:null,descrizione:null}));
  const {defaultBrowserType:ignored,...options}=info.project.use;
  void ignored;
  const context=await browser.newContext(options);
  await be.attach(context,user);
  const page=await context.newPage();
  await page.goto('/l/san-marcello/partite');
  await page.locator('#matches-list').getByText('Partita da organizzare',{exact:true}).click();
  return {page,be,ids,context};
}

test('programma: modifica giorno, ora, luogo, scambia squadre e sostituisce dalla Rosa',async ({browser},info)=>{
  const {page,be,ids}=await openPlanned(browser,info);
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Giorno della partita').fill('2026-11-21');
  await editor.locator('#planned-time').selectOption('20:00');
  await editor.getByLabel('Luogo della partita').fill('Campo Luna');
  await editor.getByLabel('Blu posto 1').selectOption(ids[2]!);
  await expect(editor.getByLabel('Bianchi posto 1')).toHaveValue(ids[0]!);
  await editor.getByLabel('Blu posto 2').selectOption(ids[4]!);
  await noOverflow(page);
  await editor.getByRole('button',{name:'Salva programma e squadre',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Programma e squadre aggiornati');
  expect(be.matches.find((m)=>m.id==='planned')).toMatchObject({date:'2026-11-21',play_time:'20:00',place:'Campo Luna'});
  expect(be.mplayers.filter((p)=>p.match_id==='planned').map((p)=>p.player_id)).toEqual([ids[2],ids[4],ids[0],ids[3]]);
});

test('programma: annulla e torna alla scheda senza salvare',async ({browser},info)=>{
  const {page,be}=await openPlanned(browser,info);
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Luogo della partita').fill('Non salvato');
  await editor.getByRole('button',{name:'Annulla',exact:true}).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('#match-modal')).toBeVisible();
  expect(be.matches.find((m)=>m.id==='planned')?.place).toBe('Campo Sole');
});

test('programma: il membro non può cambiare i convocati',async ({browser},info)=>{
  const {page}=await openPlanned(browser,info,'member');
  await expect(page.locator('#match-modal')).toBeVisible();
  await expect(page.getByRole('button',{name:'Modifica programma e squadre'})).toHaveCount(0);
});

test('programma: se il salvataggio fallisce conserva le modifiche per riprovare',async ({browser},info)=>{
  test.setTimeout(60_000);
  const {page,context,be}=await openPlanned(browser,info);
  let submitted: unknown;
  await context.route('**/rest/v1/rpc/update_planned_match',r=>{
    submitted=r.request().postDataJSON();
    return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'La partita è stata modificata',code:'P0001'})});
  });
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Luogo della partita').fill('Campo Luna');
  // Un aggiornamento in background non deve sostituire la copia originaria del modulo aperto.
  be.matches.find((m)=>m.id==='planned')!.place='Altro amministratore';
  // Il controllo «ci sono novità?» si rinnova al ritorno nell'app solo se i dati hanno più di 15 secondi.
  await page.waitForTimeout(15_500);
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#match-when')).toContainText('Altro amministratore');
  await editor.getByRole('button',{name:'Salva programma e squadre',exact:true}).click();
  await expect(editor.getByRole('alert')).toContainText('La partita è stata modificata');
  await expect(editor.getByLabel('Luogo della partita')).toHaveValue('Campo Luna');
  expect(submitted).toMatchObject({p_original:{place:'Campo Sole'}});
});

test('programma: cerca il luogo su mappa, salva la posizione e la condivide',async ({browser},info)=>{
  const {page,context,be}=await openPlanned(browser,info);
  await context.route('https://nominatim.openstreetmap.org/**',(r)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{name:'Campo Luna',display_name:'Campo Luna, Via Roma, Latina',lat:'41.46',lon:'12.9',address:{city:'Latina'}}])}));
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Luogo della partita').fill('Campo Lu');
  await editor.getByRole('button',{name:/Cerca su mappa/}).click();
  await editor.getByRole('option',{name:/Campo Luna, Latina/}).click();
  await expect(editor).toContainText('Posizione salvata');
  await editor.getByRole('button',{name:'Salva programma e squadre',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(be.matches.find((m)=>m.id==='planned')).toMatchObject({place:'Campo Luna, Latina',place_lat:41.46,place_lng:12.9});
  await page.locator('#matches-list').getByText('Partita da organizzare',{exact:true}).click(); // la scheda si riapre con il luogo nuovo
  await expect(page.locator('#share-place')).toBeVisible();
  await page.evaluate(()=>{ Object.defineProperty(navigator,'share',{configurable:true,value:async (d:unknown)=>{ (window as unknown as {__shared:unknown}).__shared=d; }}); });
  await page.locator('#share-place').click();
  const shared=await page.evaluate(()=>(window as unknown as {__shared:{text:string}}).__shared);
  expect(shared.text).toBe('📍 Campo Luna, Latina\nhttps://www.google.com/maps/search/?api=1&query=41.460000,12.900000');
});

test('programma: un luogo scritto a mano resta valido e senza pulsante di condivisione',async ({browser},info)=>{
  const {page,be}=await openPlanned(browser,info);
  await expect(page.locator('#share-place')).toHaveCount(0);
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Luogo della partita').fill('Il campetto');
  await editor.getByRole('button',{name:'Salva programma e squadre',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(be.matches.find((m)=>m.id==='planned')).toMatchObject({place:'Il campetto',place_lat:null,place_lng:null});
  await page.locator('#matches-list').getByText('Partita da organizzare',{exact:true}).click();
  await expect(page.locator('#share-place')).toHaveCount(0);
});

test('programma: incolla il link di Google Maps e lo condivide così com’è',async ({browser},info)=>{
  const {page,be}=await openPlanned(browser,info);
  await page.getByRole('button',{name:'Modifica programma e squadre'}).click();
  const editor=page.locator('#sheet-planned-match');
  await editor.getByLabel('Luogo della partita').fill('Centro Rossi');
  await editor.getByRole('button',{name:/Incolla link di Google Maps/}).click();
  await editor.getByLabel('Link di Google Maps').fill('Prova https://example.com/x');
  await expect(editor).toContainText('Questo non sembra un link di Google Maps');
  await editor.getByLabel('Link di Google Maps').fill('Centro Rossi https://maps.app.goo.gl/AbC123xyz');
  await expect(editor).toContainText('Posizione salvata');
  await editor.getByRole('button',{name:'Salva programma e squadre',exact:true}).click();
  await expect(editor).toHaveCount(0);
  expect(be.matches.find((m)=>m.id==='planned')).toMatchObject({place:'Centro Rossi',place_url:'https://maps.app.goo.gl/AbC123xyz'});
  await page.locator('#matches-list').getByText('Partita da organizzare',{exact:true}).click();
  await page.evaluate(()=>{ Object.defineProperty(navigator,'share',{configurable:true,value:async (d:unknown)=>{ (window as unknown as {__shared:unknown}).__shared=d; }}); });
  await page.locator('#share-place').click();
  const shared=await page.evaluate(()=>(window as unknown as {__shared:{text:string}}).__shared);
  expect(shared.text).toBe('📍 Centro Rossi'+String.fromCharCode(10)+'https://maps.app.goo.gl/AbC123xyz');
});
