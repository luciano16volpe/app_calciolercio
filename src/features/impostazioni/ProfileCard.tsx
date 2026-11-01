// Scheda "Il mio profilo" (se sono collegato a un giocatore): riepilogo per lega, ultime partite, storico delle statistiche.
import { useProfile } from '../../data/profile';
import { formatDate } from '../../domain/format';
import { describeChange, outcome, recentMatches, summarizeByLeague } from '../../domain/profile';

const OUTCOME = { V: ['V', 'var(--green)'], P: ['P', 'var(--text3)'], S: ['S', 'var(--red)'] } as const;

export function ProfileCard({ playerId, name }: { playerId: string; name: string }) {
  const q = useProfile(playerId);
  const rows = q.data?.rows ?? [];
  const leagues = summarizeByLeague(rows);
  const last = recentMatches(rows, 8);
  const history = (q.data?.history ?? []).map((h) => ({ at: h.at, by: h.by ?? '', lines: describeChange(h) })).filter((h) => h.lines.length);

  return (
    <div className="card" id="profile-card">
      <div className="section-header">📈 Il mio profilo · {name}</div>
      {q.isLoading ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>⏳ Caricamento…</div> : null}
      {q.isError ? <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{(q.error as Error).message}</div> : null}
      {q.data && !rows.length ? <div id="profile-empty" style={{ fontSize: 13, color: 'var(--text3)' }}>Nessuna partita ancora.</div> : null}

      {leagues.map((l) => (
        <div key={l.leagueId} className="profile-league" style={{ background: 'var(--gray2)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{l.leagueName}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
            {[
              ['Partite', l.played], ['V-P-S', `${l.wins}-${l.draws}-${l.losses}`], ['Gol', l.goals], ['Assist', l.assist],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, textAlign: 'center' }}>Media voto: <b>{l.avgRating == null ? '—' : l.avgRating.toFixed(2)}</b></div>
        </div>
      ))}

      {last.length ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, margin: '10px 0 4px' }}>Ultime partite</div>
          {last.map((r) => {
            const o = outcome(r);
            return (
              <div key={r.matchId} className="profile-match" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--gray2)', fontSize: 12 }}>
                <span style={{ width: 16, fontWeight: 800, color: o ? OUTCOME[o][1] : 'var(--text3)' }}>{o ? OUTCOME[o][0] : '·'}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDate(r.date)} · {r.leagueName}</span>
                <span style={{ color: 'var(--text2)' }}>{r.scoreA ?? '–'}-{r.scoreB ?? '–'}</span>
                <span style={{ width: 34, textAlign: 'right', fontWeight: 700 }}>{r.rating ?? '—'}</span>
              </div>
            );
          })}
        </>
      ) : null}

      {history.length ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, margin: '12px 0 4px' }}>Storico delle statistiche</div>
          {history.map((h) => (
            <div key={h.at} className="profile-history" style={{ padding: '5px 0', borderBottom: '1px solid var(--gray2)', fontSize: 12 }}>
              <div className="profile-history-when" style={{ color: 'var(--text3)', fontSize: 11 }}>{formatDate(h.at.slice(0, 10))}{h.by ? ` · modificato da ${h.by}` : ''}</div>
              {h.lines.join(' · ')}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
