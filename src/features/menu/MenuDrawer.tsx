import type { ReactNode } from 'react';
import { AdminIcon } from './AdminIcon';
// Menu laterale (☰): intestazione con ruolo, Le mie leghe, Redazione, Gestione, Piattaforma, App.
// Le sezioni dipendono dal ruolo nella lega attiva. Le voci di funzioni non ancora realizzate restano nascoste.
// Si chiude con ✕, toccando la parte scura, trascinando verso sinistra o con Esc. Non si apre dal bordo (gesto di Safari).
import { useEffect, useRef } from 'react';
import { useAuth, useRole } from '../../app/auth';
import { setSelectedLeague } from '../../app/league';
import { useToast } from '../../app/Toast';
import { photoUrl, type LeagueData } from '../../data/queries';
import { useMyPlayer, usePendingClaims } from '../../data/claims';
import { useAdminRequests, useMyLeagues, useIsSuperAdmin } from '../../data/leagues';
import { pendingRatings } from '../../domain/matches';
import { premiumDate, useMyPremium } from '../../data/premium';

export type Panel =
  | 'create-league' | 'join-league' | 'members' | 'invites' | 'claims' | 'merge' | 'league-settings' | 'admin-proposals'
  | 'league-admin-hub' | 'superadmin-hub' | 'players-hub' | 'compare' | 'couples' | 'albo' | 'records' | 'game-settings' | 'bench' | 'pending' | 'audit' | 'platform-leagues' | 'platform-users' | 'premium' | 'privacy' | 'help' | 'account';

const ROLE_LABEL = { admin: 'Admin', redazione: 'Redazione', member: 'Membro' } as const;

const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('') || '?';

function Item({ icon, title, sub, badge, hot, onClick, id }: { icon: ReactNode; title: string; sub?: string; badge?: number | string; hot?: boolean; onClick: () => void; id?: string }) {
  return (
    <button type="button" className="menu-it" onClick={onClick} id={id}>
      <span className="i">{icon}</span>
      <span className="t">{title}{sub ? <div className="s">{sub}</div> : null}</span>
      {badge !== undefined && badge !== 0 ? <span className={`menu-bd${hot ? '' : ' n'}`}>{badge}</span> : null}
      <span style={{ color: 'var(--text3)' }}>›</span>
    </button>
  );
}

export function MenuDrawer({ data, onClose, covered = false, onOpenPanel, onGoSettings }: {
  data: LeagueData | undefined;
  onClose: () => void;
  /** Un pannello è aperto sopra il menu: il menu resta visibile sotto ma non reagisce. */
  covered?: boolean;
  onOpenPanel: (p: Panel) => void;
  onGoSettings: () => void;
}) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const lid = data?.league.id;
  const { role, isAdmin, isPremiumAdmin, canEditText } = useRole(lid);
  const isOwner = !!user && !!data && data.league.owner_id === user.id;
  const leagues = useMyLeagues(user?.id ?? null);
  const superQ = useIsSuperAdmin(user?.id ?? null);
  const premium = useMyPremium(user?.id ?? null);
  const isSuper = superQ.data === true;
  const claims = usePendingClaims(lid, isAdmin);
  const proposals = useAdminRequests(lid, isOwner);
  const startX = useRef<number | null>(null);
  const coveredRef = useRef(covered);
  useEffect(() => {
    coveredRef.current = covered;
  }, [covered]);

  useEffect(() => {
    document.documentElement.classList.add('menu-open');
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !coveredRef.current && onClose();
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
  // il menu resta sotto il pannello: allo swipe indietro si vede subito il menu, non la pagina
  const open = (p: Panel) => onOpenPanel(p);
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
      {premium.data?.active ? <span className="menu-chip gold">{premium.data.lifetime ? 'Premium a vita' : <>{premium.data.trial ? 'Premium in prova' : 'Premium'}{premium.data.expires_at ? ` · fino al ${premiumDate(premium.data.trial && premium.data.trial_expires_at ? premium.data.trial_expires_at : premium.data.expires_at)}` : ''}</>}</span> : null}
      {role && data ? (
        <span className={`menu-chip${role === 'redazione' ? ' green' : ''}`} id="menu-role">
          {role === 'admin' && isOwner ? 'Admin (creatore)' : ROLE_LABEL[role]} · {data.league.name}
        </span>
      ) : null}
    </>
  );

  return (
    <div inert={covered} aria-hidden={covered || undefined}>
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
                <div className="menu-av" id="menu-avatar">{myPhoto ? <img src={myPhoto} alt={name} decoding="async" /> : initials(name || user.email || '')}</div>
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
                {!isSuper && premium.data?.active ? <button type="button" className="menu-lgrow add" id="menu-create" onClick={() => open('create-league')}><span className="menu-lgic">＋</span><span className="menu-lgn">{isSuper ? 'Crea nuova lega' : 'Richiedi nuova lega'}</span></button> : null}
                <button type="button" className="menu-lgrow add" id="menu-join" onClick={() => open('join-league')}><span className="menu-lgic">🔑</span><span className="menu-lgn">Entra con un codice</span></button>
              </>
            ) : null}
          </div>

          {data ? (
            <>
              <div className="menu-sec">Giocatori</div>
              <Item icon="⚽" title="Giocatori" sub="confronto, coppie, albo e record" onClick={() => open('players-hub')} id="menu-players" />
            </>
          ) : null}

          {canEditText && !isAdmin && data ? (
            <>
              <div className="menu-sec">Redazione · {data.league.name}</div>
              <Item icon="📝" title="Da completare" sub={pending.length ? `${pending.length} partite con pagelle da completare` : 'pagelle, importazione e Gazzetta nella scheda partita'} badge={pending.length} hot onClick={() => open('pending')} id="menu-red-pending" />
            </>
          ) : null}

          {isAdmin && data ? (
            <>
              <div className="menu-sec">Gestione · {data.league.name}</div>
              <Item icon={<AdminIcon name="shield" />} title="ADMIN LEGA" sub="inviti, richieste, panchina, membri e giocatori" badge={(claims.data?.length ?? 0) + (proposals.data?.length ?? 0)} hot onClick={() => open('league-admin-hub')} id="menu-league-admin" />
              <Item icon="🗂️" title="Partite senza pagelle" sub={pending.length ? `${pending.length} da scrivere o saltare` : 'tutto scritto'} onClick={() => open('pending')} id="menu-pending" />
              {!isSuper ? <Item icon="🎮" title="Regole di gioco" sub="formazioni, forma, pesi (sola lettura)" onClick={() => open('game-settings')} id="menu-game-settings" /> : null}
              {isPremiumAdmin || isSuper ? <Item icon="⚙️" title="Impostazioni della lega" sub="nome, visibilità, regole" onClick={() => open('league-settings')} id="menu-league-settings" /> : null}
              {cur ? (
                <div className="menu-code">Codice d'invito <b id="menu-code">{cur.inviteCode}</b><button type="button" onClick={() => void copy(cur.inviteCode)}>Copia</button></div>
              ) : null}
            </>
          ) : null}

          {isSuper ? (
            <>
              <div className="menu-sec">Piattaforma</div>
              <Item icon={<AdminIcon name="shield" />} title="SUPERADMIN" sub="regole, audit, leghe, utenti e Premium" onClick={() => open('superadmin-hub')} id="menu-superadmin" />
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
    </div>
  );
}
