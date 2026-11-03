// Nella scheda del giocatore (solo amministratore): la rimozione conserva la storia e archivia nella lega.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '../../app/Dialogs';
import { useToast } from '../../app/Toast';
import { PLAYERS_STATUS_KEY } from '../../data/invites';
import { BENCH_KEY, removeFromLeague } from '../../data/panchina';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import type { Player } from '../../domain/types';

export function PlayerBenchRow({ data, player, onRemoved }: { data: LeagueData; player: Player; onRemoved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const ok = await confirm({
      icon: '🪑', title: 'Togliere dalla lega?',
      lines: [
        `${player.name} esce dalla Rosa di ${data.league.name}: non si potrà più convocare.`,
        'Le sue partite, pagelle e statistiche restano nella storia della lega.',
        'Se ha un account collegato, quella persona non vedrà più questa lega.',
        'Finisce nella Panchina di questa lega: un amministratore può riportarlo nella Rosa.',
      ],
      okLabel: 'Togli dalla lega', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const bench = await removeFromLeague(data.league.id, player.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: BENCH_KEY }),
        qc.invalidateQueries({ queryKey: PLAYERS_STATUS_KEY }),
      ]);
      toast(bench ? `${player.name} è in Panchina` : `${player.name} non è più in questa lega`);
      onRemoved();
    } catch (e) {
      toast('Errore: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="player-bench-row" style={{ margin: '8px 0' }}>
      <button type="button" id="player-remove" className="btn btn-secondary btn-full btn-sm" disabled={busy} onClick={() => void go()}>🪑 Togli dalla lega</button>
    </div>
  );
}
