// Pagina Classifiche: scelta della stagione, i quattro numeri, schede scorrevoli.
// Fonte: renderClassifiche, renderSeasonDash, CL_TABS in legacy/index.html.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../app/Toast';
import type { LeagueData } from '../../data/queries';
import { seasonDash } from '../../domain/rankings';
import { seasonsList } from '../../domain/seasons';
import { ClEmpty, CoppieList, MediaList, RecordList, ScorersList } from './lists';

const SEASON_ICON: Record<string, string> = { PRI: '🌸', EST: '☀️', AUT: '🍂', INV: '❄️' };

export const CL_TABS = [
  ['marcatori', '⚽ Marcatori'], ['assist', '🅰️ Assist'], ['media', '⭐ Media voto'], ['statistiche', '📈 Statistiche'],
  ['coppie', '🤝 Coppie'], ['confronto', '⚔️ Confronto'], ['albo', "🏆 Albo d'oro"], ['record', '🏅 Record'],
] as const;
type Tab = (typeof CL_TABS)[number][0];

/** Schede non ancora portate (passo 3.3b). */
const SOON: Partial<Record<Tab, string>> = { statistiche: 'Statistiche', confronto: 'Confronto', albo: "Albo d'oro" };

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

export function ClassifichePage({ data, onOpenPlayer }: { data: LeagueData; onOpenPlayer: (playerId: string) => void }) {
  const toast = useToast();
  // stagione scelta (null = la più recente) e scheda: restano come scelti finché l'app è aperta
  const [scopeSel, setScopeSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('marcatori');
  const seasons = useMemo(() => seasonsList(data.dataset.matches, data.albo).slice().reverse(), [data]);
  const scope = scopeSel ?? (seasons.length ? (seasons[0] as { key: string }).key : 'all');
  const openMatch = () => toast('La scheda partita arriva con il passo 3.4');

  // le scelte attive restano visibili nelle righe scorrevoli
  const seasonsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    [seasonsRef.current, tabsRef.current].forEach((row) => {
      const a = row?.querySelector('.chip.active');
      if (a && 'scrollIntoView' in a) (a as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [scope, tab]);

  return (
    <div id="cl-content">
      <div className="chips-row" id="cl-seasons" ref={seasonsRef}>
        {seasons.map((s) => (
          <button key={s.key} className={`chip${s.key === scope ? ' active' : ''}`} onClick={() => setScopeSel(s.key)}>
            {SEASON_ICON[s.key.slice(-3)] ?? ''} {s.label}
          </button>
        ))}
        <button className={`chip${scope === 'all' ? ' active' : ''}`} onClick={() => setScopeSel('all')}>♾️ Sempre</button>
      </div>
      <div id="season-dash"><SeasonDash data={data} scope={scope} /></div>
      <div className="chips-row" id="cl-tabs" ref={tabsRef}>
        {CL_TABS.map(([k, l]) => (
          <button key={k} className={`chip tab${k === tab ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card cl-sec" id="cl-list-card">
        <div id="scorers-list">
          {tab === 'marcatori' ? <ScorersList data={data} scope={scope} field="goals" onOpenPlayer={onOpenPlayer} /> : null}
          {tab === 'assist' ? <ScorersList data={data} scope={scope} field="assist" onOpenPlayer={onOpenPlayer} /> : null}
          {tab === 'media' ? <MediaList data={data} scope={scope} onOpenPlayer={onOpenPlayer} /> : null}
          {tab === 'coppie' ? <CoppieList data={data} scope={scope} onOpenPlayer={onOpenPlayer} /> : null}
          {tab === 'record' ? <RecordList data={data} scope={scope} onOpenPlayer={onOpenPlayer} onOpenMatch={openMatch} /> : null}
          {SOON[tab] ? (
            <>
              <div className="section-header" style={{ margin: '0 0 4px' }}>{SOON[tab]}</div>
              <ClEmpty>In arrivo nella nuova versione</ClEmpty>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
