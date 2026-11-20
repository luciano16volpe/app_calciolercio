// Link «nuova password» creato dall'amministratore per un giocatore che l'ha dimenticata (Supabase Edge Function).
// Chi apre il link arriva nell'app già nella schermata «Scegli la nuova password» (stesso percorso di «Password dimenticata»).
// Regole: lo chiede un amministratore della lega (o l'amministratore supremo) per un giocatore di quella lega collegato a un account.
// Mai per un amministratore supremo né per un altro amministratore di lega (lo farebbe l'amministratore supremo).
// La chiave di servizio è fornita dalla piattaforma (SUPABASE_SERVICE_ROLE_KEY): non sta nel codice.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL') as string;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://calciolercio.vercel.app';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo non valido' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me.user) return json({ error: 'Devi prima accedere' }, 401);
  const caller = me.user.id;

  const body = (await req.json().catch(() => ({}))) as { playerId?: string; leagueId?: string };
  const { playerId, leagueId } = body;
  if (!playerId || !leagueId) return json({ error: 'Richiesta incompleta' }, 400);

  const [{ data: sup }, { data: mem }] = await Promise.all([
    admin.from('platform_admins').select('user_id').eq('user_id', caller).maybeSingle(),
    admin.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', caller).maybeSingle(),
  ]);
  const callerIsSuper = !!sup;
  if (!callerIsSuper && mem?.role !== 'admin') return json({ error: 'Permesso negato: solo l’amministratore della lega' }, 403);

  // il giocatore deve essere in questa lega e avere un account
  const { data: lp } = await admin.from('league_players').select('player_id').eq('league_id', leagueId).eq('player_id', playerId).maybeSingle();
  if (!lp) return json({ error: 'Giocatore non trovato in questa lega' }, 404);
  const { data: pl } = await admin.from('players').select('name, user_id').eq('id', playerId).maybeSingle();
  if (!pl?.user_id) return json({ error: 'Questo giocatore non ha ancora un account: manda il link d’invito' }, 400);
  const target = pl.user_id as string;
  if (target === caller) return json({ error: 'Per la tua password usa «Password dimenticata» o Impostazioni' }, 400);

  if (!callerIsSuper) {
    const [{ data: tSup }, { data: tAdm }] = await Promise.all([
      admin.from('platform_admins').select('user_id').eq('user_id', target).maybeSingle(),
      admin.from('league_members').select('league_id').eq('user_id', target).eq('role', 'admin').limit(1),
    ]);
    if (tSup || (tAdm ?? []).length) return json({ error: 'Per un amministratore la password la reimposta l’amministratore supremo' }, 403);
  }

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(target);
  const email = u?.user?.email;
  if (uErr || !email) return json({ error: 'Account non trovato' }, 404);

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: SITE_URL } });
  const actionLink = link?.properties?.action_link;
  if (lErr || !actionLink) return json({ error: 'Non riesco a creare il link: riprova' }, 500);

  // registro attività: chi ha creato il link e per chi (il link stesso non si scrive mai)
  const [{ data: a }, { data: lg }] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', caller).maybeSingle(),
    admin.from('leagues').select('name').eq('id', leagueId).maybeSingle(),
  ]);
  await admin.from('audit_log').insert({
    actor_id: caller, actor_name: a?.display_name ?? null, action: 'auth.reset_link', entity: 'auth', entity_id: target,
    entity_label: pl.name, league_id: leagueId, league_name: lg?.name ?? null, grp: 'account', source: 'app',
  });

  return json({ link: actionLink, playerName: pl.name });
});
