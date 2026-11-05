import { expect, test, type Page } from './fixtures';
import { lastWrite, noOverflow, openSettings, setup } from './helpers';

async function activePhone(page: Page) {
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
    Object.defineProperty(window,'PushManager',{value:class {},configurable:true});
    Object.defineProperty(window,'Notification',{value:class { static permission='granted'; },configurable:true});
    const reg={pushManager:{getSubscription:async()=>({endpoint:'https://push.example/test',unsubscribe:async()=>true})}};
    Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>reg,configurable:true});
  });
}
const prefs={enabled:true,change:true,reminder:true,result:true,ratings:false,gazzetta:true,reminder_minutes:null};

test('notifiche Standard: interruttore generale gratuito e personalizzazione riservata',async({page})=>{
  await activePhone(page);
  const writes=await setup(page,{rpc:{my_push_prefs:[{...prefs,customizable:false}]}});
  await openSettings(page);
  await expect(page.locator('#push-standard')).toContainText('disattivazioni già scelte');
  await expect(page.locator('#push-enabled')).toBeChecked();
  await expect(page.locator('#push-pref-result')).toHaveCount(0);
  await expect(page.locator('#push-reminder-time')).toHaveCount(0);
  await page.locator('#push-enabled').uncheck();
  await expect.poll(()=>writes.some(w=>w.table==='set_push_enabled')).toBe(true);
  expect(lastWrite(writes,'set_push_enabled').body).toEqual({p_on:false});
  await expect(page.locator('#push-prefs')).toContainText('sospese');
  await expect(page.locator('#push-disable')).toBeEnabled();
  await noOverflow(page);
});

test('notifiche Premium: tipi, anticipo e sospensione senza perdere le preferenze',async({page})=>{
  await activePhone(page);
  const writes=await setup(page,{rpc:{my_premium_status:[{active:true}],my_push_prefs:[{...prefs,customizable:true}]}});
  await openSettings(page);
  await expect(page.locator('#push-pref-ratings')).not.toBeChecked();
  await expect(page.locator('#push-pref-change')).toBeChecked();
  await page.locator('#push-reminder-time').selectOption('120');
  await expect.poll(()=>writes.some(w=>w.table==='set_push_reminder')).toBe(true);
  expect(lastWrite(writes,'set_push_reminder').body).toEqual({p_minutes:120});
  await expect(page.locator('#push-enabled')).toBeEnabled();
  await page.locator('#push-pref-change').uncheck();
  await expect.poll(()=>writes.some(w=>w.table==='set_push_pref')).toBe(true);
  expect(lastWrite(writes,'set_push_pref').body).toEqual({p_kind:'change',p_on:false});
  await expect(page.locator('#push-enabled')).toBeEnabled();
  await page.locator('#push-enabled').uncheck();
  await expect(page.locator('#push-reminder-time')).toBeDisabled();
  await expect(page.locator('#push-enabled')).toBeEnabled();
  await page.locator('#push-enabled').check();
  await expect(page.locator('#push-reminder-time')).toHaveValue('120');
  await expect(page.locator('#push-pref-change')).not.toBeChecked();
  await noOverflow(page);
});

test('notifiche: un errore di salvataggio ripristina la preferenza precedente',async({page})=>{
  await activePhone(page);
  await setup(page,{rpc:{my_premium_status:[{active:true}],my_push_prefs:[{...prefs,customizable:true}]},rpcError:{set_push_reminder:'Premium scaduto'}});
  await openSettings(page);
  await page.locator('#push-reminder-time').selectOption('60');
  await expect(page.locator('#toast')).toContainText('Premium scaduto');
  await expect(page.locator('#push-reminder-time')).toHaveValue('');
});
