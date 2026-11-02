// Pagina Classifiche: scelta della stagione, i quattro numeri, schede scorrevoli.
// Fonte: renderClassifiche, renderSeasonDash, CL_TABS in legacy/index.html.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueData } from '../../data/queries';
import { nextStatsSort, seasonDash, STATS_SORT_DEFAULT, type StatsCol, type StatsFilter } from '../../domain/rankings';
import { seasonsList } from '../../domain/seasons';
import { AlboList } from './Albo';
import { Confronto } from './Confronto';
import { CoppieList, MediaList, RecordList, ScorersList } from './lists';
import { StatsTable } from './StatsTable';

const SEASON_ICON: Record<string, string> = { PRI: '🌸', EST: '☀️', AUT: '🍂', INV: '❄️' };

export const CL_TABS = [
  ['marcatori', '⚽ Marcatori'], ['assist', '🅰️ Assist'], ['media', '⭐ Media voto'], ['statistiche', '📈 Statistiche'],
  ['coppie', '🤝 Coppie'], ['confronto', '⚔️ Confronto'], ['albo', "🏆 Albo d'oro"], ['record', '🏅 Record'],
] as const;
type Tab = (typeof CL_TABS)[number][0];

export function SeasonDash({ data, scope }: { data: LeagueData; scope: string }) {
  const d = seasonDash(data.dataset, scope);
  if (!d) return null;
  return (
    <div className="dash-grid">
      <div className="dash-cell"><div className="dash-val">{d.matches}</div><div className="dash-lbl">Partite</div></div>
      <div className="dash-cell"><div className="dash-val">{d.goals}</div><div className="dash-lbl">Gol totali</div></div>
      <div className="dash-cell"><div className="dash-val">{d.avgGoals.toFixed(1)}</div><div className="dash-lbl">Gol/partita</div></div>
      <div className="dash-cell">
        <div className="dash-val" style={{ fontSize: 13 }}>{d.top ? `${d.top.name} ${d.top.avg.toFixed(1)}` : '—'}</div>
        <div className="dash-lbl">⭐ Miglior media</div>
      </div>
    </div>
  );
}

export function ClassifichePage({ data, onOpenPlayer, onOpenMatch }: { data: LeagueData; onOpenPlayer: (playerId: string) => void; onOpenMatch: (matchId: string) => void }) {
  // stagione scelta (null = la più recente) e scheda: restano come scelti finché l'app è aperta
  const [scopeSel, setScopeSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('marcatori');
  const [statsFilter, setStatsFilter] = useState<StatsFilter>('regulars');
  const [statsSort, setStatsSort] = useState(STATS_SORT_DEFAULT);
  const [cmp, setCmp] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });
  const seasons = useMemo(() => seasonsList(data.dataset.matches, data.albo).slice().reverse(), [data]);
  const scope = scopeSel ?? (seasons.length ? (seasons[0] as { key: string }).key : 'all');

  // le scelte attive restano visibili nelle righe scorrevoli
  const seasonsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  // la fascia fissa si ferma subito sotto l'intestazione (che è alta in modo diverso su ogni telefono)
  useEffect(() => {
    const set = () => stickyRef.current?.style.setProperty('--hdr-h', `${document.querySelector('header')?.getBoundingClientRect().height ?? 50}px`);
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);
  useEffect(() => {
    [seasonsRef.current, tabsRef.current].forEach((row) => {
      const a = row?.querySelector('.chip.active');
      if (a && 'scrollIntoView' in a) (a as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [scope, tab]);

  return (
    <div id="cl-content">
      {/* stagione e classifica restano fissi sotto l'intestazione: scorre solo la lista */}
      <div className="cl-sticky" ref={stickyRef}>
      <div className="chips-row" id="cl-seasons" ref={seasonsRef}>
        {seasons.map((s) => (
          <button key={s.key} className={`chip${s.key === scope ? ' active' : ''}`} onClick={() => setScopeSel(s.key)}>
            {SEASON_ICON[s.key.slice(-3)] ?? ''} {s.label}
          </button>
        ))}
        <button className={`chip${scope === 'all' ? ' active' : ''}`} onClick={() => setScopeSel('all')}>♾️ Sempre</button>
      </div>
      <div className="chips-row" id="cl-tabs" ref={tabsRef}>
        {CL_TABS.map(([k, l]) => (
          <button key={k} className={`chip tab${k === tab ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      </div>
      <div id="season-dash"><SeasonDash data={data} scope={scope} /></div>
      {/* come in legacy: tre schede (carte) diverse, una sola visibile */}
      {tab !== 'statistiche' && tab !== 'albo' ? (
        <div className="card cl-sec" id="cl-list-card">
          <div id="scorers-list">
            {tab === 'marcatori' ? <ScorersList data={data} scope={scope} field="goals" onOpenPlayer={onOpenPlayer} /> : null}
            {tab === 'assist' ? <ScorersList data={data} scope={scope} field="assist" onOpenPlayer={onOpenPlayer} /> : null}
            {tab === 'media' ? <MediaList data={data} scope={scope} onOpenPlayer={onOpenPlayer} /> : null}
            {tab === 'coppie' ? <CoppieList data={data} scope={scope} onOpenPlayer={onOpenPlayer} /> : null}
            {tab === 'record' ? <RecordList data={data} scope={scope} onOpenPlayer={onOpenPlayer} onOpenMatch={onOpenMatch} /> : null}
            {tab === 'confronto' ? <Confronto data={data} scope={scope} a={cmp.a} b={cmp.b} onChange={(a, b) => setCmp({ a, b })} /> : null}
          </div>
        </div>
      ) : null}
      {tab === 'statistiche' ? (
        <div className="card cl-sec" id="stats-card">
          <div id="stats-table">
            <StatsTable
              data={data} scope={scope} filter={statsFilter} sort={statsSort} onOpenPlayer={onOpenPlayer}
              onFilter={setStatsFilter} onSort={(c: StatsCol) => setStatsSort((s) => nextStatsSort(s, c))}
            />
          </div>
        </div>
      ) : null}
      {tab === 'albo' ? (
        <div className="card cl-sec" id="albo-card">
          <div id="albo-list"><AlboList data={data} scope={scope} onOpenPlayer={onOpenPlayer} /></div>
        </div>
      ) : null}
    </div>
  );
}
