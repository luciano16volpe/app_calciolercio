// Nella scheda del giocatore (solo amministratore): è collegato a un account? Altrimenti si può mandargli il suo link d'invito.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../app/Toast';
import { createInvite, inviteUrl, PLAYERS_STATUS_KEY, usePlayersStatus } from '../../data/invites';
import { formatDate } from '../../domain/format';
import type { Player } from '../../domain/types';
import { shareText } from '../menu/LeagueSheets';

export function PlayerLinkRow({ leagueId, player }: { leagueId: string; player: Player }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = usePlayersStatus(leagueId, true);
  const [busy, setBusy] = useState(false);
  const s = q.data?.find((x) => x.playerId === player.id);
  if (!s) return null; // elenco non ancora arrivato (o non disponibile): niente da mostrare
  const message = (token: string) => `Ciao ${player.name}! Ecco il tuo link per entrare in CalcioLercio: ${inviteUrl(token)}`;
  const invite = async () => {
    setBusy(true);
    try {
      const token = await createInvite(player.id, leagueId);
      await qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY });
      await shareText(message(token), toast, 'Invito a CalcioLercio');
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="player-link-row" className="row-line" style={{ margin: '8px 0', padding: '8px 10px', background: 'var(--gray)', borderRadius: 'var(--radius-sm)', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 140, fontSize: 12, lineHeight: 1.4 }}>
        {s.linked ? (
          <>✅ Collegato a <b>{s.linkedName}</b></>
        ) : s.inviteToken ? (
          <>🔗 Invito inviato · valido fino al {formatDate((s.inviteExpires ?? '').slice(0, 10))}</>
        ) : (
          <>Non ha ancora un account collegato</>
        )}
      </div>
      {s.linked ? null : (
        <button type="button" className="mini-btn" id="player-invite-btn" disabled={busy} onClick={() => void invite()} aria-label={s.inviteToken ? `Rigenera il link di ${player.name}` : `Invita ${player.name}`}>
          {s.inviteToken ? 'Rigenera link' : `🔗 Invita ${player.name}`}
        </button>
      )}
    </div>
  );
}
