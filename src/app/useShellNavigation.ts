import { useEffect, useState } from 'react';
import type { PageName } from './BottomNav';
import { buildPath, HOME_PAGE, navigate, parsePath, rememberLeague } from './league';
import { rosterView, type LeagueData } from '../data/queries';

/** Pagina e indirizzo della lega, mantenendo il comportamento della navigazione esistente. */
export function useShellNavigation(data: LeagueData | undefined, isAdmin: boolean, ready: boolean, inviteToken: string | null) {
  const [chosen, setChosen] = useState<PageName | null>(() => parsePath(window.location.pathname).page);
  const [autoPage, setAutoPage] = useState<PageName | null>(null);
  if (data && !chosen && autoPage === null) setAutoPage(!rosterView(data).dataset.players.length ? 'rosa' : HOME_PAGE);
  const wanted = chosen ?? autoPage ?? HOME_PAGE;
  const page = wanted === 'partita' && ready && !isAdmin ? HOME_PAGE : wanted;
  const slug = data?.league.slug;
  useEffect(() => {
    if (slug && !inviteToken) {
      navigate(buildPath(slug, page), true);
      rememberLeague(slug);
    }
  }, [slug, page, inviteToken]);
  const go = (p: PageName) => {
    setChosen(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { page, go };
}
