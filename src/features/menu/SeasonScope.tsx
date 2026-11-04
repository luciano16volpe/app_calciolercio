// Scelta della stagione per i pannelli del menu (Confronto, Coppie, Albo d'oro, Record): come nelle Classifiche,
// parte dalla stagione più recente; "Sempre" mostra tutto.
import { useMemo, useState } from 'react';
import type { LeagueData } from '../../data/queries';
import { seasonOf, seasonsList } from '../../domain/seasons';
import { todayRome } from '../../domain/profile';
import { useAuth } from '../../app/auth';
import { useFeatures } from '../../data/features';
import { SEASON_ICON } from '../classifiche/ClassifichePage';

export function useSeasonScope(data: LeagueData) {
  const { user } = useAuth();
  const features = useFeatures(user?.id ?? null);
  const canHistory = features.data?.find((f) => f.feature === 'history')?.allowed === true;
  const today = todayRome();
  const current = useMemo(() => seasonOf(today), [today]);
  const seasons = useMemo(() => {
    const all = seasonsList(data.dataset.matches, data.albo).slice().reverse();
    if (current && !all.some((s) => s.key === current.key)) all.unshift({ ...current, status: 'in corso' });
    return canHistory ? all : all.filter((s) => s.key === current?.key);
  }, [data, canHistory, current]);
  const [sel, setScope] = useState<string | null>(null);
  const scope = canHistory ? (sel ?? current?.key ?? 'all') : (current?.key ?? 'all');
  return { seasons, scope, setScope, canHistory };
}

export function SeasonChips({ seasons, scope, onPick, canHistory }: { seasons: { key: string; label: string }[]; scope: string; onPick: (key: string) => void; canHistory: boolean }) {
  return (
    <div className="chips-row" id="panel-seasons">
      {seasons.map((s) => (
        <button key={s.key} className={`chip${s.key === scope ? ' active' : ''}`} onClick={() => onPick(s.key)}>
          {SEASON_ICON[s.key.slice(-3)] ?? ''} {s.label}
        </button>
      ))}
      {canHistory ? <button className={`chip${scope === 'all' ? ' active' : ''}`} onClick={() => onPick('all')}>♾️ Sempre</button> : null}
    </div>
  );
}
