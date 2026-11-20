-- Con almeno cinque voti ricevuti, scarta un minimo e un massimo prima della media.
-- Con meno di cinque voti usa tutti i voti: scartare due risposte darebbe troppo peso alle poche rimaste.
-- Le partite già finalizzate conservano il voto pubblicato; la regola vale per le votazioni ancora aperte e future.
create or replace function public.finalize_community_votes(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; completed integer := 0; previous_uid text;
begin
  previous_uid := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub','',true);
  for item in select c.match_id from community_vote_settings c
    where c.finalized_at is null and c.started_at+interval '24 hours'<=p_now
    order by c.started_at for update skip locked loop
    update match_players mp set rating=(
      select round(avg(ballot.rating),1)
        from (
          select cv.rating,
            count(*) over () as votes_received,
            row_number() over (order by cv.rating,cv.voter_user_id) as lowest_rank,
            row_number() over (order by cv.rating desc,cv.voter_user_id desc) as highest_rank
          from community_votes cv
          where cv.match_id=item.match_id and cv.target_player_id=mp.player_id
        ) ballot
        where ballot.votes_received<5 or (ballot.lowest_rank>1 and ballot.highest_rank>1)
    ) where mp.match_id=item.match_id;
    update community_vote_settings set finalized_at=p_now where match_id=item.match_id;
    completed := completed+1;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
  return completed;
end $$;
