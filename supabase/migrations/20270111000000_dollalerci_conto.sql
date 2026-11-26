-- Dollalerci: la moneta del Bet. Un conto per ogni persona in ogni lega.
--  · Si parte con 50 dollalerci, assegnati al primo accesso.
--  · Ricarica settimanale: chi ha meno di 20 dollalerci, una volta a settimana (settimana italiana, da lunedì), torna a 20.
--  · Il saldo è la somma dei movimenti: niente numero da modificare a mano, ogni cambio lascia traccia.
--  · Passo 1: il conto esiste e si vede. Puntate e montepremi arrivano nei passi successivi.
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  kind text not null check (kind in ('INITIAL','TOPUP','STAKE','PAYOUT','REFUND')),
  match_id uuid references public.matches(id) on delete set null,
  week_start date,
  note text,
  created_at timestamptz not null default now(),
  check (kind<>'TOPUP' or week_start is not null)
);
create index wallet_transactions_user_idx on public.wallet_transactions(league_id,user_id,created_at);
create unique index wallet_initial_once on public.wallet_transactions(league_id,user_id) where kind='INITIAL';
create unique index wallet_topup_once_a_week on public.wallet_transactions(league_id,user_id,week_start) where kind='TOPUP';
alter table public.wallet_transactions enable row level security;
revoke all on public.wallet_transactions from anon,authenticated;

-- Saldo del chiamante nella lega. Al primo accesso assegna i 50 iniziali; poi, se serve, la ricarica della settimana.
create or replace function public.wallet_state(p_league uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); balance integer; week date; topped integer := 0; first_time boolean := false;
begin
  if uid is null or not exists (select 1 from league_members where league_id=p_league and user_id=uid) then
    raise exception 'Permesso negato'; end if;
  insert into wallet_transactions(league_id,user_id,amount,kind,note)
    values(p_league,uid,50,'INITIAL','Credito iniziale') on conflict do nothing;
  get diagnostics first_time = row_count;
  week := date_trunc('week',now() at time zone 'Europe/Rome')::date;
  select coalesce(sum(amount),0) into balance from wallet_transactions where league_id=p_league and user_id=uid;
  if balance<20 and not exists (select 1 from wallet_transactions where league_id=p_league and user_id=uid and kind='TOPUP' and week_start=week) then
    insert into wallet_transactions(league_id,user_id,amount,kind,week_start,note)
      values(p_league,uid,20-balance,'TOPUP',week,'Ricarica settimanale') on conflict do nothing;
    get diagnostics topped = row_count;
    if topped>0 then topped:=20-balance; balance:=20; end if;
  end if;
  return jsonb_build_object('balance',balance,'topped_up',topped,'first_time',first_time,
    'next_topup',(week+7)::timestamp at time zone 'Europe/Rome');
end $$;
revoke all on function public.wallet_state(uuid) from public,anon;
grant execute on function public.wallet_state(uuid) to authenticated;
