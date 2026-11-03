import { useCallback, useMemo, useState } from 'react';
import type { MatchActions } from '../features/partite/parts';
import type { Panel } from '../features/menu/MenuDrawer';
import { parsePath } from './league';

type View = { kind: 'player'; id: string; fromRosa?: boolean } | { kind: 'match'; id: string; text?: boolean } | { kind: 'gazArchive' } | null;

/** Stato delle finestre e azioni condivise fra schermate. */
export function useShellWindows() {
  const [view, setView] = useState<View>(null);
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
    openGazzetta: (id, fromArchive) => setGazViewer({ id, fromArchive: !!fromArchive }),
    openPagelleText: setPtDialog,
  }), [openMatch]);
  const closePanel = useCallback(() => setPanel(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return { view, setView, menuOpen, setMenuOpen, panel, setPanel, inviteToken, setInviteToken, inviteKind,
    gazViewer, setGazViewer, ptDialog, setPtDialog, bachecaOpen, setBachecaOpen,
    close, openPlayer, openPlayerFromRosa, openMatch, act, closePanel, closeMenu };
}
