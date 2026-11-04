// Le schede a elenco delle Classifiche: Marcatori, Assist, Media voto, Coppie, Record.
// Fonte: renderScorersList, renderMediaList, renderCoppie, renderRecord in legacy/index.html.
import { Fragment, type ReactNode } from 'react';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { pairsRanking } from '../../domain/pairs';
import { avgColor, mediaRanking, scorersRanking } from '../../domain/rankings';
import { rankingNote } from '../../domain/rankingNotes';
import { computeRecords } from '../../domain/records';

type OpenPlayer = (playerId: string) => void;
type OpenMatch = (matchId: string) => void;

const idOfName = (data: LeagueData, name: string) => data.dataset.players.find((p) => p.name === name)?.id;

/** 🥇🥈🥉 per i primi tre, poi il numero. */
export function Medal({ i }: { i: number }) {
  if (i === 0) return <>🥇</>;
  if (i === 1) return <>🥈</>;
  if (i === 2) return <>🥉</>;
  return <span style={{ display: 'inline-block', width: 20, textAlign: 'center', fontWeight: 800, color: 'var(--text3)', fontSize: 12 }}>{i + 1}</span>;
}

export function ClEmpty({ children }: { children: ReactNode }) {
  return <div style={{ textAlign: 'center', padding: 14, color: 'var(--text3)', fontSize: 13 }}>{children}</div>;
}

/** Riga di classifica: posizione, nome (toccabile se è in rosa), dettaglio e valore. */
function ClRow({ i, name, sub, value, playerId, onOpenPlayer }: {
  i: number; name: string; sub: ReactNode; value: ReactNode; playerId: string | undefined; onOpenPlayer: OpenPlayer;
}) {
  return (
    <div className="cl-row" onClick={playerId ? () => onOpenPlayer(playerId) : undefined} style={playerId ? { cursor: 'pointer' } : undefined}>
      <span className="cl-pos"><Medal i={i} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={`cl-name${playerId ? ' link' : ''}`}>{name}</div>
        <div className="cl-sub">{sub}</div>
      </div>
      <span className="cl-val">{value}</span>
    </div>
  );
}

// ── ⚽ Marcatori · 🅰️ Assist ───────────────────────────────────────────────
export function ScorersList({ data, scope, field, onOpenPlayer }: { data: LeagueData; scope: string; field: 'goals' | 'assist'; onOpenPlayer: OpenPlayer }) {
  const isAst = field === 'assist';
  const ranked = scorersRanking(data.dataset, scope, field);
  const title = <div className="section-header" style={{ margin: '0 0 10px' }}>{isAst ? '🅰️ Classifica assistman' : '⚽ Classifica marcatori'}</div>;
  if (!ranked.length) return <>{title}<ClEmpty>{isAst ? 'Nessun assist registrato ancora' : 'Nessun gol registrato ancora'}</ClEmpty></>;
  return (
    <>
      {title}
      {ranked.map((s, i) => {
        const val = s[field];
        const perMatch = s.pres ? (val / s.pres).toFixed(2) : '0.00';
        const id = idOfName(data, s.name);
        return (
          <div
            key={s.key}
            className={`ranking-row${i < 3 ? ` podium podium-${i + 1}` : ''}`}
            onClick={id ? () => onOpenPlayer(id) : undefined}
            style={{
              ...(id ? { cursor: 'pointer' } : {}),
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              background: i < 3 ? 'var(--green-light)' : 'var(--gray)', marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}><Medal i={i} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: id ? 'var(--green)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
                {id ? <>{' '}<span style={{ fontSize: 9, opacity: 0.6 }}>›</span></> : null}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {s.pres} {s.pres === 1 ? 'presenza' : 'presenze'} · {perMatch} {isAst ? 'assist' : 'gol'}/partita
              </div>
              <div className="ranking-insight">{rankingNote(val, ranked[0]![field], isAst ? 'assist' : 'gol', i === 0)}</div>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--green)' }}>{val} {isAst ? '🅰️' : '⚽'}</span>
          </div>
        );
      })}
    </>
  );
}

// ── ⭐ Media voto ───────────────────────────────────────────────────────────
export function MediaList({ data, scope, onOpenPlayer }: { data: LeagueData; scope: string; onOpenPlayer: OpenPlayer }) {
  const { minPres, regulars, occasionals, below } = mediaRanking(data.dataset, scope);
  const head = (
    <>
      <div className="section-header" style={{ margin: '0 0 4px' }}>⭐ Classifica media voto</div>
      <div className="cl-note">Conta chi ha giocato almeno {minPres} partite{below ? ' · gli Occasionali hanno la loro classifica qui sotto' : ''}.</div>
    </>
  );
  const row = (p: (typeof regulars)[number], i: number) => (
    <ClRow
      key={p.key} i={i} name={p.name} playerId={idOfName(data, p.name)} onOpenPlayer={onOpenPlayer}
      sub={`${p.votes.length} pagelle · ${p.pres} presenze`}
      value={<span style={{ color: avgColor(p.voteAvg as number) }}>{(p.voteAvg as number).toFixed(2)}</span>}
    />
  );
  const occ = occasionals.length ? (
    <>
      <div className="section-header" style={{ margin: '14px 0 4px' }}>🧳 Occasionali</div>
      <div className="cl-note">Chi ha giocato da 2 a {minPres - 1} partite: la loro classifica, a parte.</div>
      {occasionals.map(row)}
    </>
  ) : null;
  return (
    <>
      {head}
      {regulars.length ? regulars.map(row) : <ClEmpty>Nessun voto ancora</ClEmpty>}
      {occ}
    </>
  );
}

// ── 🤝 Coppie ───────────────────────────────────────────────────────────────
function NameLink({ data, name, onOpenPlayer }: { data: LeagueData; name: string; onOpenPlayer: OpenPlayer }) {
  const id = idOfName(data, name);
  if (!id) return <>{name}</>;
  return (
    <span className="cl-name link" style={{ display: 'inline' }} onClick={(e) => { e.stopPropagation(); onOpenPlayer(id); }}>{name}</span>
  );
}

export function CoppieList({ data, scope, onOpenPlayer }: { data: LeagueData; scope: string; onOpenPlayer: OpenPlayer }) {
  const { all, gold, bad } = pairsRanking(data.dataset, scope);
  const head = (
    <>
      <div className="section-header" style={{ margin: '0 0 4px' }}>🤝 Coppie d'oro</div>
      <div className="cl-note">Chi vince di più giocando nella stessa squadra (almeno 3 partite insieme).</div>
    </>
  );
  if (!all.length) return <>{head}<ClEmpty>Servono almeno 3 partite giocate insieme</ClEmpty></>;
  const row = (i: number, c: (typeof all)[number], val: string, good: boolean) => (
    <div className="cl-row" key={`${c.a}|${c.b}`}>
      <span className="cl-pos"><Medal i={i} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cl-name">
          <NameLink data={data} name={c.a} onOpenPlayer={onOpenPlayer} /> <span style={{ color: 'var(--text3)', fontWeight: 600 }}>&amp;</span>{' '}
          <NameLink data={data} name={c.b} onOpenPlayer={onOpenPlayer} />
        </div>
        <div className="cl-sub">{c.w}V · {c.d}N · {c.l}P · {c.gd > 0 ? '+' : ''}{c.gd} gol</div>
      </div>
      <span className="cl-val" style={{ color: good ? 'var(--green)' : 'var(--red)' }}>{val}</span>
    </div>
  );
  return (
    <>
      {head}
      {gold.map((c, i) => row(i, c, `${c.w} ${c.w === 1 ? 'vinta' : 'vinte'}`, true))}
      <div className="section-header" style={{ margin: '14px 0 4px' }}>💔 Coppie maledette</div>
      <div className="cl-note">Chi perde di più insieme.</div>
      {bad.length ? bad.map((c, i) => row(i, c, `${c.l} ${c.l === 1 ? 'persa' : 'perse'}`, false)) : <ClEmpty>Nessuna</ClEmpty>}
    </>
  );
}

// ── 🏅 Record ───────────────────────────────────────────────────────────────
export function RecordList({ data, scope, onOpenPlayer, onOpenMatch }: { data: LeagueData; scope: string; onOpenPlayer: OpenPlayer; onOpenMatch: OpenMatch }) {
  const recs = computeRecords(data.dataset, scope);
  const head = <div className="section-header" style={{ margin: '0 0 8px' }}>🏅 Record{scope === 'all' ? ' di sempre' : ' della stagione'}</div>;
  if (!recs.length) return <>{head}<ClEmpty>Nessuna partita con risultato</ClEmpty></>;
  const mlink = (id: string, date: unknown) => <span className="cl-date" onClick={() => onOpenMatch(id)}>{formatDate(date)}</span>;
  return (
    <>
      {head}
      {recs.map((r) => (
        <div className="rec-row" key={r.title}>
          <span className="rec-ic">{r.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rec-t">{r.title}</div>
            <div className="rec-who">
              {r.kind === 'streak'
                ? r.entries.map((e, k) => (
                    <Fragment key={k}>
                      {k ? ', ' : ''}
                      <NameLink data={data} name={e.name as string} onOpenPlayer={onOpenPlayer} />
                    </Fragment>
                  ))
                : r.entries.map((e, k) => {
                    const m = e.match as NonNullable<typeof e.match>;
                    return (
                      <Fragment key={k}>
                        {k ? <br /> : null}
                        {r.kind === 'match' ? <>{String(m.scoreA)}-{String(m.scoreB)} · </> : <><NameLink data={data} name={e.name as string} onOpenPlayer={onOpenPlayer} /> · </>}
                        {mlink(m.id, m.date)}
                      </Fragment>
                    );
                  })}
            </div>
          </div>
          <span className="rec-v">{r.value}</span>
        </div>
      ))}
    </>
  );
}
