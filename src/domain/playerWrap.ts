import { alboSeasons, AWARDS, FEATS, type AlboRow } from './awards';
import { hasScore } from './matches';
import { todayRome } from './profile';
import { playerKey, playerSeason, seasonStats, type PlayerSeason } from './stats';
import { seasonOf, type SeasonStatus } from './seasons';
import type { Dataset, Player } from './types';

export interface PlayerWrap {
  season: string;
  status: SeasonStatus;
  stats: PlayerSeason | null;
  awards: Array<{ title: string; description: string; value: string; shame: boolean }>;
  feats: Array<{ title: string; description: string; count: number }>;
}

/** Ultima stagione terminata della lega, con numeri delle sole partite giocate e premi dell'Albo. */
export function playerWrap(data: Dataset, player: Pick<Player, 'id' | 'name'>, albo: AlboRow[] = [], today = todayRome(), aliases: string[] = []): PlayerWrap | null {
  const season = alboSeasons(data, albo, today).find((item) => item.status !== 'in corso' &&
    data.matches.some((match) => seasonOf(match.date)?.key === item.key && hasScore(match)));
  if (!season) return null;
  const names = new Set([playerKey(data.players, player.id, player.name).name, ...aliases]);
  const matches = data.matches.filter((match) => seasonOf(match.date)?.key === season.key && hasScore(match));
  const ids = new Set(matches.map((match) => match.id));
  const completed: Dataset = { ...data, matches, ratings: data.ratings.filter((rating) => ids.has(rating.matchId)) };
  const stats = playerSeason(completed, player, seasonStats(completed));
  return {
    season: season.label,
    status: season.status as SeasonStatus,
    stats,
    awards: season.awards.filter((award) => award.winners.some((winner) => names.has(winner) || winner.split(' & ').some((part) => names.has(part))))
      .map((award) => ({ title: award.t, description: AWARDS.find((def) => def.k === award.k)?.d ?? '', value: award.value, shame: award.shame })),
    feats: FEATS.flatMap((feat) => {
      const count = season.feats[feat.k]?.find((item) => names.has(item.name))?.count ?? 0;
      return count ? [{ title: feat.t, description: feat.d, count }] : [];
    }),
  };
}
