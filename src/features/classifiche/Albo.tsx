// "🏆 Albo d'oro": premi, Occasionali, premi della vergogna e imprese di ogni stagione.
import { Fragment, useMemo } from 'react';
import type { LeagueData } from '../../data/queries';
import { ALBO_MIN_MATCHES, alboSeasons, FEATS, type AwardResult } from '../../domain/awards';

const SEASON_ICON: Record<string, string> = { PRI: '🌸', EST: '☀️', AUT: '🍂', INV: '❄️' };

const CHIP = {
  'in corso': <span className="albo-chip live">in corso</span>,
  'in chiusura': <span className="albo-chip soon">in chiusura</span>,
  chiusa: <span className="albo-chip done">🔒 chiusa</span>,
};

/** Nome toccabile se è in rosa. */
function NameLink({ name, idOf, onOpenPlayer }: { name: string; idOf: (n: string) => string | undefined; onOpenPlayer: (id: string) => void }) {
  const id = idOf(name);
  return id ? <span className="albo-name" onClick={() => onOpenPlayer(id)}>{name}</span> : <>{name}</>;
}

/** Vincitori di un premio: separati da virgola (o a capo per la coppia); una coppia è "A & B". */
function Winners({ ws, sep, idOf, onOpenPlayer }: { ws: string[]; sep: 'br' | ','; idOf: (n: string) => string | undefined; onOpenPlayer: (id: string) => void }) {
  return (
    <>
      {ws.map((w, i) => (
        <Fragment key={i}>
          {i ? (sep === 'br' ? <br /> : ', ') : null}
          {w.split(' & ').map((n, j) => (
            <Fragment key={j}>
              {j ? ' & ' : null}
              <NameLink name={n} idOf={idOf} onOpenPlayer={onOpenPlayer} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export function AlboList({ data, scope, onOpenPlayer }: { data: LeagueData; scope: string; onOpenPlayer: (id: string) => void }) {
  const seasons = useMemo(
    () => alboSeasons(data.dataset, data.albo).filter((S) => scope === 'all' || S.key === scope),
    [data, scope],
  );
  const idOf = (name: string) => data.dataset.players.find((p) => p.name === name)?.id;
  const row = (a: AwardResult) => (
    <div className="albo-row" key={a.k}>
      <span className="albo-t">{a.t}</span>
      <span className="albo-w"><Winners ws={a.winners} sep={a.k === 'coppia' ? 'br' : ','} idOf={idOf} onOpenPlayer={onOpenPlayer} /></span>
      <span className="albo-v">{a.value}</span>
    </div>
  );

  if (!seasons.length) {
    return (
      <>
        <div className="section-header" style={{ margin: '0 0 10px' }}>🏆 Albo d'oro</div>
        <div style={{ textAlign: 'center', padding: 14, color: 'var(--text3)', fontSize: 13 }}>Nessuna partita ancora</div>
      </>
    );
  }
  return (
    <>
      <div className="section-header" style={{ margin: '0 0 4px' }}>🏆 Albo d'oro</div>
      <div className="albo-note">
        Premi per stagione. Medie e Cucchiaio contano solo chi ha giocato almeno il 40% delle partite; chi ne ha giocate meno (da 2 in su) concorre ai <b>Premi Occasionali</b>.
      </div>
      {seasons.map((S) => {
        const won = S.awards.filter((a) => a.winners.length);
        const prize = won.filter((a) => !a.shame && !a.occ);
        const occA = won.filter((a) => a.occ);
        const shame = won.filter((a) => a.shame);
        const feats = FEATS.filter((f) => (S.feats[f.k] || []).length);
        return (
          <div className="albo-season" key={S.key}>
            <div className="albo-head">
              <span className="albo-title">{SEASON_ICON[S.key.slice(-3)] ?? '🏆'} {S.label}</span>
              {S.status ? CHIP[S.status] : null}
            </div>
            <div className="albo-sub">
              {S.n} {S.n === 1 ? 'partita' : 'partite'}
              {S.n >= ALBO_MIN_MATCHES ? ` · medie e Cucchiaio da ${S.minPres} presenze` : ''}
            </div>
            {S.n < ALBO_MIN_MATCHES ? (
              <div className="albo-empty">Stagione troppo corta per i premi (servono almeno {ALBO_MIN_MATCHES} partite).</div>
            ) : (
              <>
                {prize.map(row)}
                {occA.length ? <><div className="albo-grp">🧳 Premi Occasionali</div>{occA.map(row)}</> : null}
                {shame.length ? <><div className="albo-grp">Premi della vergogna</div>{shame.map(row)}</> : null}
              </>
            )}
            {feats.length ? (
              <>
                <div className="albo-grp">Imprese</div>
                {feats.map((f) => (
                  <div className="albo-feat" key={f.k}>
                    <span className="albo-t">{f.t}</span>
                    <span>
                      {(S.feats[f.k] ?? []).map((x, i) => (
                        <Fragment key={i}>
                          {i ? ' · ' : null}
                          <NameLink name={x.name} idOf={idOf} onOpenPlayer={onOpenPlayer} /> <b>×{x.count}</b>
                        </Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
