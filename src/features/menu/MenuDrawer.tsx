// Menu laterale (☰): intestazione con ruolo, Le mie leghe, Redazione, Gestione, Piattaforma, App.
// Le sezioni dipendono dal ruolo nella lega attiva. Le voci di funzioni non ancora realizzate restano nascoste.
// Si chiude con ✕, toccando la parte scura, trascinando verso sinistra o con Esc. Non si apre dal bordo (gesto di Safari).
import { useEffect, useRef } from 'react';
import { useAuth, useRole } from '../../app/auth';
import { setSelectedLeague } from '../../app/league';
import { useToast } from '../../app/Toast';
import { photoUrl, type LeagueData } from '../../data/queries';
import { useMyPlayer, usePendingClaims } from '../../data/claims';
import { useAdminRequests, useMembers, useMyLeagues, useIsSuperAdmin } from '../../data/leagues';
import { pendingRatings } from '../../domain/matches';
import { formatDate } from '../../domain/format';

export type Panel =
  | 'create-league' | 'join-league' | 'members' | 'invites' | 'claims' | 'merge' | 'league-settings' | 'admin-proposals'
  | 'compare' | 'couples' | 'albo' | 'records' | 'game-settings' | 'bench' | 'pending' | 'audit' | 'platform-leagues' | 'platform-users' | 'privacy' | 'help' | 'account';

const ROLE_LABEL = { admin: 'Admin', redazione: 'Redazione', member: 'Membro' } as const;

const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('') || '?';

function Item({ icon, title, sub, badge, hot, onClick, id }: { icon: string; title: string; sub?: string; badge?: number | string; hot?: boolean; onClick: () => void; id?: string }) {
  return (
    <button type="button" className="menu-it" onClick={onClick} id={id}>
      <span className="i">{icon}</span>
      <span className="t">{title}{sub ? <div className="s">{sub}</div> : null}</span>
      {badge !== undefined && badge !== 0 ? <span className={`menu-bd${hot ? '' : ' n'}`}>{badge}</span> : null}
      <span style={{ color: 'var(--text3)' }}>›</span>
    </button>
  );
}

export function MenuDrawer({ data, onClose, onOpenPanel, onGoSettings, onOpenMatch }: {
  data: LeagueData | undefined;
  onClose: () => void;
  onOpenPanel: (p: Panel) => void;
  onGoSettings: () => void;
  onOpenMatch: (id: string, text?: boolean) => void;
}) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const lid = data?.league.id;
  const { role, isAdmin, canEditText } = useRole(lid);
  const isOwner = !!user && !!data && data.league.owner_id === user.id;
  const leagues = useMyLeagues(user?.id ?? null);
  const superQ = useIsSuperAdmin(user?.id ?? null);
  const isSuper = superQ.data === true;
  const members = useMembers(lid, isAdmin);
  const claims = usePendingClaims(lid, isAdmin);
  const proposals = useAdminRequests(lid, isOwner);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('menu-open');
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => {
      document.documentElement.classList.remove('menu-open');
      document.removeEventListener('keydown', k);
    };
  }, [onClose]);

  const list = leagues.data ?? [];
  const cur = list.find((l) => l.id === lid);
  const name = (user?.user_metadata?.display_name as string | undefined) || user?.email?.split('@')[0] || '';
  const pending = data ? pendingRatings(data.dataset) : []; // escluse le partite «saltate»
  // la foto del mio giocatore (se ne ho una), per il cerchio in alto nel menu
  const mine = useMyPlayer(user?.id ?? null);
  const myPhoto = data && mine.data?.linked ? photoUrl(data.photos[mine.data.linked.id]) : null;
  const last = data ? [...data.dataset.matches].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1))[0] : undefined;
  const open = (p: Panel) => {
    onClose();
    onOpenPanel(p);
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Codice copiato');
    } catch {
      toast(`Codice: ${code}`);
    }
  };
  const roleChips = (
    <>
      {isSuper ? <span className="menu-chip gold">👑 Amministratore supremo</span> : null}
      {role && data ? (
        <span className={`menu-chip${role === 'redazione' ? ' green' : ''}`} id="menu-role">
          {role === 'admin' && isOwner ? 'Admin (creatore)' : ROLE_LABEL[role]} · {data.league.name}
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <div className="menu-dim" onClick={onClose} aria-hidden="true" />
      <aside
        className="menu-drawer" id="menu-drawer" role="dialog" aria-modal="true" aria-label="Menu"
        onTouchStart={(e) => { startX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const x0 = startX.current;
          startX.current = null;
          const x1 = e.changedTouches[0]?.clientX;
          if (x0 !== null && x1 !== undefined && x0 - x1 > 70) onClose(); // trascinato verso sinistra
        }}
      >
        <div className="menu-dh">
          <button type="button" className="x" onClick={onClose} aria-label="Chiudi il menu">✕</button>
          {user ? (
            <>
              <div className="menu-who">
                <div className="menu-av" id="menu-avatar">{myPhoto ? <img src={myPhoto} alt={name} /> : initials(name || user.email || '')}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="menu-nm">{name}</div>
                  <div className="menu-em">{user.email}</div>
                </div>
              </div>
              <div className="menu-chips">{roleChips}</div>
            </>
          ) : (
            <>
              <div className="menu-who">
                <div className="menu-av">👤</div>
                <div style={{ minWidth: 0 }}>
                  <div className="menu-nm">Visitatore</div>
                  <div className="menu-em">Stai guardando {data?.league.name ?? 'la lega'}</div>
                </div>
              </div>
              <button type="button" className="menu-prof" id="menu-login" onClick={() => { onClose(); onGoSettings(); }}>🔑 Accedi / Registrati <span>›</span></button>
            </>
          )}
        </div>

        <div className="menu-body">
          <div className="menu-sec">Le mie leghe</div>
          <div className="menu-lgbox" id="menu-leagues">
            {list.map((l) => (
              <button
                type="button" key={l.id} className={`menu-lgrow${l.id === lid ? ' act' : ''}`} aria-current={l.id === lid} data-slug={l.slug}
                onClick={() => { setSelectedLeague(l.slug); onClose(); }}
              >
                <span className="menu-lgic">🏢</span>
                <span className="menu-lgn">{l.name}</span>
                <span className={`menu-role${l.role === 'admin' ? ' a' : l.role === 'redazione' ? ' r' : ''}`}>{l.role ? ROLE_LABEL[l.role] : 'Ospite'}</span>
              </button>
            ))}
            {user ? (
              <>
                {isSuper ? <button type="button" className="menu-lgrow add" id="menu-create" onClick={() => open('create-league')}><span className="menu-lgic">＋</span><span className="menu-lgn">Crea nuova lega</span></button> : null}
                <button type="button" className="menu-lgrow add" id="menu-join" onClick={() => open('join-league')}><span className="menu-lgic">🔑</span><span className="menu-lgn">Entra con un codice</span></button>
              </>
            ) : null}
          </div>

          {data ? (
            <>
              <div className="menu-sec">Giocatori</div>
              <Item icon="⚔️" title="Confronto" sub="due giocatori testa a testa" onClick={() => open('compare')} id="menu-compare" />
              <Item icon="🤝" title="Coppie" sub="chi vince (e perde) insieme" onClick={() => open('couples')} id="menu-couples" />
              <Item icon="🏆" title="Albo d'oro" sub="i premi di ogni stagione" onClick={() => open('albo')} id="menu-albo" />
              <Item icon="🏅" title="Record" sub="le imprese più grandi" onClick={() => open('records')} id="menu-records" />
            </>
          ) : null}

          {canEditText && !isAdmin && data ? (
            <>
              <div className="menu-sec">Redazione · {data.league.name}</div>
              <Item icon="📝" title="Pagelle da scrivere" sub={pending.length ? `${pending.length} partite con meno della metà delle descrizioni` : 'tutto scritto'} badge={pending.length} hot onClick={() => { const m = pending[0] ?? last; onClose(); if (m) onOpenMatch(m.id, true); }} id="menu-red-pending" />
              <Item icon="🗂️" title="Partite senza pagelle" sub="scrivi o salta le vecchie" onClick={() => open('pending')} id="menu-red-list" />
              <Item icon="📥" title="Importa da WhatsApp" sub="incolla il messaggio delle pagelle" onClick={() => { const m = pending[0] ?? last; onClose(); if (m) onOpenMatch(m.id, true); }} id="menu-red-import" />
              <Item icon="📰" title="Carica la Gazzetta" sub={last ? `ultima partita: ${formatDate(last.date)}` : undefined} onClick={() => { onClose(); if (last) onOpenMatch(last.id, true); }} id="menu-red-gazzetta" />
            </>
          ) : null}

          {isAdmin && data ? (
            <>
              <div className="menu-sec">Gestione · {data.league.name}</div>
              <Item icon="👥" title="Membri e ruoli" sub={members.data ? `${members.data.length} persone con account` : undefined} badge={members.data?.length} onClick={() => open('members')} id="menu-members" />
              <Item icon="🔗" title="Inviti giocatori" sub="link personale per ogni giocatore" onClick={() => open('invites')} id="menu-invites" />
              <Item icon="✋" title="Richieste «sono io»" badge={claims.data?.length ?? 0} hot onClick={() => open('claims')} id="menu-claims" />
              <Item icon="🗂️" title="Partite senza pagelle" sub={pending.length ? `${pending.length} da scrivere o saltare` : 'tutto scritto'} onClick={() => open('pending')} id="menu-pending" />
              <Item icon="🪑" title="Panchina" sub="giocatori senza lega" onClick={() => open('bench')} id="menu-bench" />
              <Item icon="🔀" title="Unisci giocatori" onClick={() => open('merge')} id="menu-merge" />
              {!isSuper ? <Item icon="🎮" title="Regole di gioco" sub="formazioni, forma, pesi (sola lettura)" onClick={() => open('game-settings')} id="menu-game-settings" /> : null}
              {isOwner ? <Item icon="🛡️" title="Proposte di amministratore" badge={proposals.data?.length ?? 0} hot onClick={() => open('admin-proposals')} id="menu-proposals" /> : null}
              <Item icon="⚙️" title="Impostazioni della lega" sub="nome, visibilità, regole" onClick={() => open('league-settings')} id="menu-league-settings" />
              {cur ? (
                <div className="menu-code">Codice d'invito <b id="menu-code">{cur.inviteCode}</b><button type="button" onClick={() => void copy(cur.inviteCode)}>Copia</button></div>
              ) : null}
            </>
          ) : null}

          {isSuper ? (
            <>
              <div className="menu-sec">Piattaforma</div>
              <Item icon="🎮" title="Regole di gioco" sub="formazioni, forma recente, pesi" onClick={() => open('game-settings')} id="menu-game-settings" />
              <Item icon="🛡️" title="Registro attività" onClick={() => open('audit')} id="menu-audit" />
              <Item icon="🏟️" title="Tutte le leghe" onClick={() => open('platform-leagues')} id="menu-platform-leagues" />
              <Item icon="👤" title="Utenti" onClick={() => open('platform-users')} id="menu-platform-users" />
            </>
          ) : null}

          <div className="menu-sec">App</div>
          <Item icon="⚙️" title="Impostazioni app" sub="versione, aggiornamenti, account" onClick={() => { onClose(); onGoSettings(); }} id="menu-app-settings" />
          <Item icon="🔒" title="Privacy" onClick={() => open('privacy')} id="menu-privacy" />
          <Item icon="❓" title="Aiuto" onClick={() => open('help')} id="menu-help" />
          {user ? <Item icon="🚪" title="Esci" onClick={() => { onClose(); void signOut(); }} id="menu-signout" /> : null}
        </div>
        <div className="menu-foot">v{__APP_VERSION__} · CalcioLercio</div>
      </aside>
    </>
  );
}
