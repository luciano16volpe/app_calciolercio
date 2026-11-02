-- ═══════════════════════════════════════════════════════════════════════════
--  CalcioLercio · «salta le pagelle»: partite per cui non si vuole scrivere titolo e descrizioni
--  Escono dall'elenco «Pagelle da scrivere» (e dal conteggio nel menu della redazione); si possono rimettere in qualsiasi momento.
--  Lo possono decidere l'amministratore e la redazione della lega (la redazione non può cambiare altro della partita).
--  Applicare con:  npx supabase db push --linked
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.matches add column if not exists ratings_skipped boolean not null default false;

create or replace function public.set_ratings_skipped(p_match uuid, p_skip boolean)
returns void language plpgsql security definer set search_path = public as $$
declare lg uuid := public.match_league(p_match);
begin
  if lg is null then raise exception 'Partita non trovata'; end if;
  if not public.has_league_role(lg, array['admin', 'redazione']::public.league_role[]) then
    raise exception 'Permesso negato: solo l''amministratore o la redazione della lega';
  end if;
  update matches set ratings_skipped = p_skip where id = p_match and ratings_skipped is distinct from p_skip;
end $$;
revoke all on function public.set_ratings_skipped(uuid, boolean) from public, anon;
grant execute on function public.set_ratings_skipped(uuid, boolean) to authenticated;

-- fine ✔
