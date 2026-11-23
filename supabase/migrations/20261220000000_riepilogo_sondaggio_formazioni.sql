-- Il riepilogo dei voti resta accessibile solo agli amministratori della lega.
create or replace function public.formation_poll_votes(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare lid uuid; result jsonb;
begin
  select m.league_id into lid from matches m
    join formation_polls fp on fp.match_id=m.id where m.id=p_match;
  if lid is null or auth.uid() is null or not public.is_league_admin(lid) then
    raise exception 'Permesso negato';
  end if;

  select jsonb_build_object(
    'total', (select count(*) from formation_votes v where v.match_id=p_match),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'option_no',o.option_no,
        'voters',coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id',v.user_id,
            'name',coalesce(nullif(p.display_name,''),u.email::text,'Account'),
            'updated_at',v.updated_at)
            order by coalesce(nullif(p.display_name,''),u.email::text,'Account'),v.user_id)
          from formation_votes v
          join auth.users u on u.id=v.user_id
          left join profiles p on p.id=v.user_id
          where v.match_id=p_match and v.option_no=o.option_no
        ),'[]'::jsonb)
      ) order by o.option_no)
      from formation_options o where o.match_id=p_match
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.formation_poll_votes(uuid) from public,anon;
grant execute on function public.formation_poll_votes(uuid) to authenticated;

create or replace function public.formation_poll_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare poll formation_polls%rowtype; lid uuid; options jsonb; mine smallint; admin boolean;
begin
  select * into poll from formation_polls where match_id=p_match;
  if not found or auth.uid() is null then return null; end if;
  select league_id into lid from matches where id=p_match;
  if not exists(select 1 from league_members where league_id=lid and user_id=auth.uid()) then return null; end if;
  admin := public.is_league_admin(lid);
  select coalesce(jsonb_agg(jsonb_build_object('option_no',o.option_no,'team_a',o.team_a,'team_b',o.team_b,
    'metrics',o.metrics,'stats',o.stats,'module_a',o.module_a,'module_b',o.module_b,'rank',o.pred_rank)
    order by o.option_no),'[]'::jsonb) into options from formation_options o where o.match_id=p_match;
  select option_no into mine from formation_votes where match_id=p_match and user_id=auth.uid();
  return jsonb_build_object('match_id',p_match,'opened_at',poll.opened_at,'closes_at',poll.closes_at,
    'is_open',poll.finalized_at is null and now()<poll.closes_at,
    'is_admin',admin,
    'can_close',admin and poll.finalized_at is null and now()<poll.closes_at,
    'closed_early_at',poll.closed_early_at,
    'closed_early_by_name',case when poll.closed_early_by is null then null else public.audit_user_name(poll.closed_early_by) end,
    'finalized_at',poll.finalized_at,'winning_option',poll.winning_option,
    'has_premium',public.has_premium(auth.uid()),'my_vote',mine,'options',options);
end $$;
