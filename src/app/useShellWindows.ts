import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatchActions } from '../features/partite/parts';
import type { Panel } from '../features/menu/MenuDrawer';
import { parsePath } from './league';

type View = { kind: 'player'; id: string; fromRosa?: boolean } | { kind: 'match'; id: string; text?: boolean; edit?: boolean } | { kind: 'vote'; id: string } | { kind: 'gazArchive' } | null;

export function notificationMatch(path: string, search: string): View {
  if (parsePath(path).page !== 'partite') return null;
  const id = new URLSearchParams(search).get('match');
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? { kind: 'match', id } : null;
}

/** Stato delle finestre e azioni condivise fra schermate. */
export function useShellWindows() {
  const [view, setView] = useState<View>(() => notificationMatch(window.location.pathname, window.location.search));
  useEffect(() => {
    if (!notificationMatch(window.location.pathname, window.location.search)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('match');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => parsePath(window.location.pathname).invite);
  const [inviteKind] = useState(() => parsePath(window.location.pathname).inviteKind);
  const [gazViewer, setGazViewer] = useState<{ id: string; fromArchive: boolean } | null>(null);
  const [ptDialog, setPtDialog] = useState<string | null>(null);
  const [bachecaOpen, setBachecaOpen] = useState(false);
  const close = useCallback(() => setView(null), []);
  const openPlayer = useCallback((id: string) => setView({ kind: 'player', id }), []);
  const openPlayerFromRosa = useCallback((id: string) => setView({ kind: 'player', id, fromRosa: true }), []);
  const openMatch = useCallback((id: string, text?: boolean) => {
    setGazViewer(null);
    setView({ kind: 'match', id, text });
  }, []);
  const act: MatchActions = useMemo(() => ({
    openMatch,
    openMatchVote: (id) => { setGazViewer(null); setView({ kind: 'vote', id }); },
    openMatchEdit: (id) => { setGazViewer(null); setView({ kind: 'match', id, edit: true }); },
    openGazzetta: (id, fromArchive) => setGazViewer({ id, fromArchive: !!fromArchive }),
    openPagelleText: setPtDialog,
  }), [openMatch]);
  const closePanel = useCallback(() => setPanel(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return { view, setView, menuOpen, setMenuOpen, panel, setPanel, inviteToken, setInviteToken, inviteKind,
    gazViewer, setGazViewer, ptDialog, setPtDialog, bachecaOpen, setBachecaOpen,
    close, openPlayer, openPlayerFromRosa, openMatch, act, closePanel, closeMenu };
}
