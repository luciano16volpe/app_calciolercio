-- Le modalità sono gestite dalla piattaforma e verificate dal database.
create table public.feature_modes (
  feature text primary key,
  mode text not null check (mode in ('standard', 'premium', 'beta'))
);
alter table public.feature_modes enable row level security;
revoke all on public.feature_modes from public, anon, authenticated;
insert into public.feature_modes(feature, mode) values
  ('compare', 'standard'), ('couples', 'premium'), ('records', 'premium'),
  ('statistics', 'premium'), ('history', 'premium'), ('albo', 'standard');

create function public.feature_allowed(p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case
    when public.is_super_admin() then true
    when f.mode = 'standard' then true
    when f.mode = 'premium' then public.has_premium(auth.uid())
    else false end from public.feature_modes f where f.feature = p_feature), false);
$$;
revoke all on function public.feature_allowed(text) from public, anon;
grant execute on function public.feature_allowed(text) to authenticated;

create function public.my_feature_modes()
returns table(feature text, mode text, allowed boolean)
language sql stable security definer set search_path = public as $$
  select f.feature, f.mode, public.feature_allowed(f.feature) from public.feature_modes f
  where f.mode <> 'beta' or public.is_super_admin();
$$;
revoke all on function public.my_feature_modes() from public, anon;
grant execute on function public.my_feature_modes() to authenticated;

create function public.admin_set_feature_mode(p_feature text, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Permesso negato'; end if;
  if p_mode is null or p_mode not in ('standard', 'premium', 'beta') then raise exception 'Modalità non valida'; end if;
  update public.feature_modes set mode = p_mode where feature = p_feature;
  if not found then raise exception 'Funzione non trovata'; end if;
end $$;
revoke all on function public.admin_set_feature_mode(text, text) from public, anon;
grant execute on function public.admin_set_feature_mode(text, text) to authenticated;
