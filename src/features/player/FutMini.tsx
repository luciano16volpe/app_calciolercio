import { useElementVisibility } from '../../app/visibility';
// Miniatura della figurina (il pulsante della scheda giocatore). Fonte: futMiniHTML in legacy/index.html.
import { useImageTools } from '../../app/ImageViewer';
import { useToast } from '../../app/Toast';
import { figurinaCanvas } from '../../canvas/lazy';
import type { LeagueData } from '../../data/queries';
import { formState, pagInfo, playerRatingAvg } from '../../domain/form';
import { futRating, futTierOfRating } from '../../domain/ovr';
import { playerTrophies } from '../../domain/playerCard';
import { playerSeason, seasonStats } from '../../domain/stats';
import { profileSeasonData } from '../../domain/profile';
import { FORM_STATES, FUT_TIERS } from '../../domain/tiers';
import type { Dataset, Player } from '../../domain/types';

export function FutMini({ data, player, statsDataset }: { data: LeagueData; player: Player; statsDataset?: Dataset }) {
  const { ref, visible } = useElementVisibility<HTMLButtonElement>();
  const toast = useToast();
  const { showImage } = useImageTools();
  const { dataset, weights } = data;
  const statsData = statsDataset ?? profileSeasonData(dataset, player.id, player.name).dataset;
  const all = seasonStats(statsData);
  const t = FUT_TIERS[futTierOfRating(futRating(player.stats, weights))];
  const n = playerTrophies(dataset, player, data.albo).awards.filter((a) => !a.shame).length;
  const state = formState(dataset, player);
  const fire = state === 'up';
  const crisi = state === 'down';
  const pag = pagInfo(playerRatingAvg(playerSeason(statsData, player, all)).avg);
  const fs = state ? FORM_STATES[state] : null;
  return (
    <button ref={ref} data-visual-active={visible}
      className={`fut-mini${t.holo ? ' holo' : ''}${fire ? ' fire' : ''}${crisi ? ' crisi' : ''}`}
      onClick={() => {
        toast('⏳ Preparo la figurina…');
        void figurinaCanvas(data, player, statsData).then((c) => showImage('🃏 La figurina di ' + player.name, c, 'figurina_' + player.name.replace(/\s+/g, '_') + '.png', '🃏 La figurina di ' + player.name)).catch(() => toast('Impossibile preparare la figurina. Riprova.'));
      }}
      title="Apri la figurina"
      style={{ background: `linear-gradient(150deg,${t.metal.join(',')})`, color: t.text }}
    >
      <span className="fut-mini-ovr">{futRating(player.stats, weights)}</span>
      <span className={`fut-mini-pag ${pag.cls}`}>
        {pag.label}
        {fs ? (
          <>
            {' '}
            <b style={{ color: fs.col }} title={fs.label}>{fs.arrow}</b>
          </>
        ) : null}
      </span>
      <span className="fut-mini-tier">{fire ? '🔥 ON FIRE' : crisi ? '🌧️ IN CRISI' : t.label}</span>
      {n ? <span className="fut-mini-cups">🏆×{n}</span> : null}
      <span className="fut-mini-cta">🃏 Figurina</span>
    </button>
  );
}
