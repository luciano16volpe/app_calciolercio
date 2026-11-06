import { useAuth } from './auth';
import { useMyPlayer } from '../data/claims';
import type { LeagueData } from '../data/queries';

export function useMyPlayerIn(data: LeagueData | undefined): { id: string; name: string } | null {
  const { user } = useAuth();
  const mine = useMyPlayer(user?.id ?? null);
  const id = mine.data?.linked?.id;
  const p = id && data ? data.dataset.players.find((x) => x.id === id) : undefined;
  return p ? { id: p.id, name: p.name } : null;
}
