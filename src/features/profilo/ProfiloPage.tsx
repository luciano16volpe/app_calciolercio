// Pagina iniziale: lega selezionata, scheda, partite recenti e gestione del giocatore.
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuth } from '../../app/auth';
import { AdBanner } from '../../app/AdBanner';
import { Palloni } from '../../app/Palloni';
import { useConfirm } from '../../app/Dialogs';
import { setSelectedLeague } from '../../app/league';
import { useToast } from '../../app/Toast';
import { MY_PLAYER_KEY, useMyPlayer } from '../../data/claims';
import { leaveLeague, MY_LEAGUES_KEY, useMyLeagues } from '../../data/leagues';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { formatDate, formatTime } from '../../domain/format';
import { myLastMatch, myNextMatch, myRecentMatches } from '../../domain/profile';
import { getPlayerMatchResult, normalizeTeam } from '../../domain/stats';
import type { Match } from '../../domain/types';
import { MyPlayerCard } from '../impostazioni/MyPlayerCard';
import { MyProfileTools } from '../impostazioni/MyProfileTools';
import { LastMatchCard, type MatchActions } from '../partite/parts';
import { PlayerCard } from '../player/PlayerCard';

const TEAM_NAME = { A: '🔵 Blu', B: '⚪ Bianchi' } as const;

/** «giovedì 5 novembre» da aaaa-mm-gg (in italiano, con l'iniziale maiuscola). */
function dayName(date: unknown): string {
  const d = new Date(`${String(date)}T12:00:00`);
  if (isNaN(d.getTime())) return formatDate(date);
  const s = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** La prossima partita in cui gioco: giorno, ora, luogo, squadra, compagni e avversari. */
function NextMatch({ data, m, team, myId }: { data: LeagueData; m: Match; team: 'A' | 'B'; myId: string }) {
  const names = (side: Match['teamA']) => normalizeTeam(side).filter((p) => p.id !== myId).map((p) => p.name);
  const mates = names(team === 'A' ? m.teamA : m.teamB);
  const rivals = names(team === 'A' ? m.teamB : m.teamA);
  const time = formatTime(m.time);
  const place = String(m.place ?? '').trim();
  void data;
  return (
    <div className="card" id="next-match" style={{ borderLeft: '4px solid var(--amber)' }}>
      <div className="section-header">📅 Prossima partita</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{dayName(m.date)}</div>
      {time || place ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginTop: 2 }}>{time ? `⏰ ${time}` : ''}{time && place ? ' · ' : ''}{place ? `📍 ${place}` : ''}</div> : null}
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, color: team === 'A' ? 'var(--blue)' : 'var(--teamb)' }}>Giochi con i {TEAM_NAME[team]}</div>
      {mates.length ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}><b>Con te:</b> {mates.join(', ')}</div> : null}
      {rivals.length ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}><b>Contro:</b> {rivals.join(', ')}</div> : null}
    </div>
  );
}

/** Ultime partite del giocatore nella lega attiva. */
function RecentMatches({ data, player, onOpen, active }: { data: LeagueData; player: { id: string; name: string }; onOpen: (id: string) => void; active: boolean }) {
  const [visible, setVisible] = useState(5);
  const matches = useMemo(() => myRecentMatches(data.dataset, player.id, player.name, data.dataset.matches.length), [data.dataset, player.id, player.name]);
  const ratings = useMemo(() => {
    const values = new Map<string, number>();
    for (const r of data.dataset.ratings) {
      if (r.playerId !== player.id && (r.playerId || r.player !== player.name)) continue;
      if (r.rating == null || String(r.rating).trim() === '') continue;
      const value = Number(r.rating);
      if (Number.isFinite(value)) values.set(r.matchId, value);
    }
    return values;
  }, [data.dataset.ratings, player.id, player.name]);
  const recent = matches.slice(0, 5);
  const results = recent.map((m) => getPlayerMatchResult(m, player.id, player.name));
  const votes = recent.flatMap((m) => ratings.has(m.id) ? [ratings.get(m.id)!] : []);
  const average = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(2) : '\u2014';
  if (!matches.length) return null;
  return (
    <div className="card fx-card fx-balls" id="profile-recent-matches" style={{ position: 'relative' }}>
      {active ? <Palloni /> : null}
      <div className="section-header">Ultime partite</div>
      <p className="recent-caption">Riepilogo sulle ultime {recent.length} partite nella lega</p>
      <div className="recent-summary">
        <div><b>{results.filter((r) => r === 'W').length}</b><span>Vittorie</span></div>
        <div><b>{results.filter((r) => r === 'D').length}</b><span>Pareggi</span></div>
        <div><b>{results.filter((r) => r === 'L').length}</b><span>Sconfitte</span></div>
        <div><b>{average}</b><span>Media voto</span></div>
      </div>
      {votes.length < recent.length ? <p className="recent-caption">Media su {votes.length} {votes.length === 1 ? 'voto disponibile' : 'voti disponibili'}</p> : null}
      <div className="recent-columns" aria-hidden="true"><span>Esito</span><span>Data</span><span>Blu - Bianchi</span><span>Voto</span></div>
      {matches.slice(0, visible).map((m) => {
        const result = getPlayerMatchResult(m, player.id, player.name);
        const label = result === 'W' ? 'Vinta' : result === 'L' ? 'Persa' : result === 'D' ? 'Pari' : '\u2014';
        const color = result === 'W' ? 'var(--green)' : result === 'L' ? 'var(--red)' : 'var(--text2)';
        const rating = ratings.get(m.id);
        return <button key={m.id} type="button" className="profile-match" onClick={() => onOpen(m.id)}
          aria-label={label + ', ' + formatDate(m.date) + ', Blu ' + m.scoreA + ' - Bianchi ' + m.scoreB + ', voto ' + (rating ?? 'non disponibile')}>
          <span className="recent-outcome" style={{ color }}>{label}</span>
          <span>{formatDate(m.date)}</span>
          <span className="recent-score">{m.scoreA} - {m.scoreB}</span>
          <span className="recent-rating">{rating ?? '\u2014'}</span>
        </button>;
      })}
      <div className="recent-actions">
        {visible < matches.length ? <button type="button" className="btn btn-secondary btn-sm" id="profile-more-matches" onClick={() => setVisible((n) => n + 5)}>Vedi altre</button> : null}
        {visible > 5 ? <button type="button" className="mini-btn" onClick={() => setVisible(5)}>Mostra meno</button> : null}
      </div>
    </div>
  );
}

/** Uscire da una lega (si chiede conferma). */
function LeaveLeague({ currentSlug }: { currentSlug: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const leagues = useMyLeagues(user?.id ?? null);
  const mine = (leagues.data ?? []).filter((l) => l.role);
  if (!user || !mine.length) return null;
  const leave = async (id: string, slug: string, name: string) => {
    const ok = await confirm({ icon: '🚪', title: 'Uscire dalla lega?', lines: [`Non vedrai più "${name}", a meno che ti invitino di nuovo.`], okLabel: 'Esci', danger: true });
    if (!ok) return;
    try {
      await leaveLeague(id, user.id);
      if (slug === currentSlug) setSelectedLeague(null);
      await Promise.all([qc.invalidateQueries({ queryKey: MY_LEAGUES_KEY }), qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }), qc.invalidateQueries({ queryKey: MY_PLAYER_KEY })]);
      toast('Sei uscito dalla lega');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    }
  };
  return (
    <div className="card" id="leave-card">
      <div className="section-header">🚪 Uscire da una lega</div>
      {mine.map((l) => (
        <div key={l.id} className="row-line">
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{l.name}</div>
          <button type="button" className="mini-btn danger" onClick={() => void leave(l.id, l.slug, l.name)} aria-label={`Esci da ${l.name}`}>Esci</button>
        </div>
      ))}
    </div>
  );
}

export function ProfiloPage({ data, active, act }: { data: LeagueData; active: boolean; act: MatchActions }) {
  const { user } = useAuth();
  const mine = useMyPlayer(user?.id ?? null);
  const [bacheca, setBacheca] = useState(false);
  // la scheda che si sta guardando: la mia, o (toccando un compagno) quella di un altro giocatore
  const [viewId, setViewId] = useState<string | null>(null);
  if (!user) return null;

  const linked = mine.data?.linked ?? null;
  // il mio giocatore, se gioca nella lega che sto guardando
  const me = linked ? data.dataset.players.find((p) => p.id === linked.id) : undefined;
  const inRoster = !!me && (!data.rosterIds || data.rosterIds.includes(me.id));
  const next = me && inRoster ? myNextMatch(data.dataset, me.id, me.name) : null;
  const last = me ? myLastMatch(data.dataset, me.id, me.name) : null;

  return (
    <>
      {next && me ? <NextMatch data={data} m={next.m} team={next.team} myId={me.id} /> : null}

      {last && me ? <LastMatchCard data={data} m={last.m} act={act} title="🏆 La mia ultima partita" id="my-last-match" mine={{ id: me.id, name: me.name }} active={active} /> : null}

      <AdBanner placement="profilo-feed" />

      {linked && me && inRoster ? (
        <div id="profilo-scheda" style={{ marginBottom: 12 }}>
          {viewId && viewId !== linked.id ? (
            <button type="button" id="profile-back" className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={() => setViewId(null)}>↩ Torna alla mia scheda</button>
          ) : null}
          <PlayerCard
            key={viewId ?? linked.id} inline data={data} playerId={viewId ?? linked.id}
            onClose={() => setViewId(null)} onOpenPlayer={(id) => setViewId(id)} onOpenMatch={(id) => act.openMatch(id)}
            bachecaOpen={bacheca} onToggleBacheca={() => setBacheca((o) => !o)}
          />
        </div>
      ) : null}

      {me ? <RecentMatches key={data.league.id + me.id} data={data} player={me} onOpen={act.openMatch} active={active} /> : null}

      <MyPlayerCard data={data} />
      {linked ? <MyProfileTools data={data} playerId={linked.id} name={linked.name} /> : null}

      <LeaveLeague currentSlug={data.league.slug} />
    </>
  );
}
