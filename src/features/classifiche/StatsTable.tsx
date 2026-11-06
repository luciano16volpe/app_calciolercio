// Tabella "📈 Statistiche giocatori": Titolari / Occasionali / Tutti, intestazioni toccabili per riordinare.
import type { LeagueData } from '../../data/queries';
import { avgColor, statsTable, type StatsCol, type StatsFilter } from '../../domain/rankings';

type Sort = { col: StatsCol; dir: 1 | -1 };
const NOTE = { textAlign: 'center' as const, padding: 14, color: 'var(--text3)', fontSize: 13 };

function FilterTabs({ filter, minPres, onFilter }: { filter: StatsFilter; minPres: number; onFilter: (f: StatsFilter) => void }) {
  const t = (id: StatsFilter, label: string) => (
    <button onClick={() => onFilter(id)} className={`sub-tab ${filter === id ? 'active' : ''}`} style={{ fontSize: 11, padding: '6px 4px' }}>{label}</button>
  );
  return (
    <div className="sub-tabs" style={{ marginBottom: 10 }}>
      {t('all', '👥 Tutti')}
      {t('regulars', '⭐ Titolari (≥' + minPres + ')')}
      {t('occ', '🧳 Occasionali')}
    </div>
  );
}

const td = (bold?: boolean): React.CSSProperties => ({ padding: '11px 8px', textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap', ...(bold ? { fontWeight: 800 } : {}) });

export function StatsTable({ data, scope, filter, sort, onFilter, onSort, onOpenPlayer }: {
  data: LeagueData; scope: string; filter: StatsFilter; sort: Sort;
  onFilter: (f: StatsFilter) => void; onSort: (c: StatsCol) => void; onOpenPlayer: (id: string) => void;
}) {
  const { rows, minPres } = statsTable(data.dataset, scope, filter, sort);
  const title = <div className="section-header" style={{ margin: '0 0 10px' }}>📈 Statistiche giocatori</div>;
  if (!rows.length) {
    const msg =
      filter === 'regulars' ? `Nessun giocatore con almeno ${minPres} presenze (40%)`
      : filter === 'occ' ? `Nessun Occasionale: nessuno ha giocato da 2 a ${minPres - 1} partite`
      : 'Nessuna statistica ancora';
    return <>{title}<FilterTabs filter={filter} minPres={minPres} onFilter={onFilter} /><div style={NOTE}>{msg}</div></>;
  }
  const arrow = (c: StatsCol) => (sort.col === c ? (sort.dir < 0 ? ' ▾' : ' ▴') : '');
  const th = (c: StatsCol, label: string, tip: string, left?: boolean) => (
    <th
      onClick={() => onSort(c)} title={tip}
      aria-sort={sort.col === c ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}
      style={{
        padding: '6px 8px', textAlign: left ? 'left' : 'center', cursor: 'pointer', userSelect: 'none',
        ...(left ? { position: 'sticky', left: 0, background: 'var(--gray)' } : {}), ...(sort.col === c ? { color: 'var(--green)' } : {}),
      }}
    >
      {label}{arrow(c)}
    </th>
  );
  return (
    <>
      {title}
      <FilterTabs filter={filter} minPres={minPres} onFilter={onFilter} />
      <div className="stats-table-hint">Scorri la tabella ↔ · tocca una colonna per ordinare</div>
      <div className="stats-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px' }}>
              {th('name', 'Giocatore', 'Nome', true)}
              {th('pres', 'PG', 'Presenze')}
              {th('w', 'V', 'Vittorie')}
              {th('d', 'N', 'Pareggi')}
              {th('l', 'P', 'Sconfitte')}
              {th('winpct', '%', 'Percentuale vittorie')}
              <th style={{ padding: '6px 8px', textAlign: 'center' }} title="Forma ultime 5">Forma</th>
              {th('goals', '⚽', 'Gol')}
              {th('voto', 'Voto', 'Media voto')}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avg = r.ratingCount ? r.ratingSum / r.ratingCount : null;
              const dec = r.w + r.d + r.l;
              const winpct = dec ? Math.round((r.w / dec) * 100) : null;
              const winCol = winpct == null ? 'var(--text3)' : winpct >= 60 ? 'var(--green)' : winpct < 40 ? 'var(--red)' : 'var(--amber)';
              const last = (r.results || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(-5);
              const id = data.dataset.players.find((p) => p.name === r.name)?.id;
              const nameStyle: React.CSSProperties = { padding: '11px 8px', textAlign: 'left', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--gray)' };
              return (
                <tr key={r.key} style={{ borderTop: '1px solid var(--gray2)' }}>
                  {id ? (
                    <td onClick={() => onOpenPlayer(id)} style={{ ...nameStyle, cursor: 'pointer', color: 'var(--green)' }}>
                      {r.name} <span style={{ fontSize: 9, opacity: 0.6 }}>›</span>
                    </td>
                  ) : (
                    <td style={{ ...nameStyle, color: 'var(--text3)' }}>{r.name}</td>
                  )}
                  <td style={td()}>{r.pres}</td>
                  <td style={td()}><span style={{ color: 'var(--green)' }}>{r.w}</span></td>
                  <td style={td()}><span style={{ color: 'var(--amber)' }}>{r.d}</span></td>
                  <td style={td()}><span style={{ color: 'var(--red)' }}>{r.l}</span></td>
                  <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: winCol, whiteSpace: 'nowrap' }}>{winpct == null ? '—' : winpct + '%'}</td>
                  <td style={td()}>
                    {last.length ? (
                      last.map((x, k) => (
                        <span key={k} title={x.res === 'W' ? 'Vittoria' : x.res === 'L' ? 'Sconfitta' : 'Pareggio'} aria-label={x.res === 'W' ? 'Vittoria' : x.res === 'L' ? 'Sconfitta' : 'Pareggio'} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: x.res === 'W' ? '#3aad5e' : x.res === 'L' ? '#e05c5c' : '#e0a92e', margin: '0 1px' }} />
                      ))
                    ) : (
                      <span style={{ color: 'var(--text3)' }}>—</span>
                    )}
                  </td>
                  <td style={td(true)}><span style={{ color: 'var(--green)', fontWeight: 800 }}>{r.goals}</span></td>
                  <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: avg != null ? avgColor(avg) : 'var(--text3)', whiteSpace: 'nowrap' }}>{avg != null ? avg.toFixed(2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stats-table-legend">
        PG presenze · V/N/P vittorie/pareggi/sconfitte · % vittorie<br />Forma: ultime 5 partite · 🟢 vinta · 🟡 pari · 🔴 persa
      </div>
    </>
  );
}
