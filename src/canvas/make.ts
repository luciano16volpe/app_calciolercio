// Dai dati dell'app alle immagini da condividere: prepara i numeri e chiama il disegno giusto.
// Fonte: shareTeams, shareMatchFormations, shareMatchSummary, shareTeamsSheet, shareMatchSheet, openFutCard, shareCompare in legacy/index.html.
import { photoUrl, type LeagueData } from '../data/queries';
import type { Combo } from '../domain/balancing';
import { balanceScores } from '../domain/balancing';
import { primaryRole, teamPlayers } from '../domain/gioca';
import { formatDate } from '../domain/format';
import { normalizeTeam } from '../domain/stats';
import { profileSeasonData } from '../domain/profile';
import type { Dataset, Match, Player } from '../domain/types';
import { compareInput, drawCompare } from './confronto';
import { drawFutCard, futCardModel } from './figurina';
import { drawFormations, type FormationPlayer } from './formazioni';
import { drawSheet, sheetInput, type SheetMatch } from './foglio';
import { loadImage } from './images';
import { drawSummary, summaryInput } from './riepilogo';

const ROLE_ORDER: Record<string, number> = { ATT: 0, MED: 1, DIF: 2 };

/** Formazioni della proposta mostrata in Gioca. `now` = data di oggi (per il titolo). */
export function combosFormations(ld: LeagueData, scores: number[], c: Combo, now = new Date()): HTMLCanvasElement {
  const players = ld.dataset.players;
  const side = (team: number[]): FormationPlayer[] => teamPlayers(players, scores, team).map((p) => ({ name: p.name, score: p.score, role: p.dispRole }));
  const dstr = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
  return drawFormations({
    tA: side(c.tA), tB: side(c.tB), sA: c.sA, sB: c.sB,
    modA: c.modA ? c.modA.notation : '', modB: c.modB ? c.modB.notation : '',
    diff: c.diff, subtitle: 'Formazioni del ' + dstr,
  });
}

/** Formazioni di una partita salvata (i valori sono quelli di oggi dei giocatori ancora in rosa). */
export function matchFormations(ld: LeagueData, m: Match): HTMLCanvasElement {
  const players = ld.dataset.players;
  const scores = balanceScores(ld.dataset, ld.weights, true);
  const rosterIdx = (pl: { id: string | null; name: string }) => {
    const byId = pl.id ? players.findIndex((p) => p.id === pl.id) : -1;
    return byId >= 0 ? byId : players.findIndex((p) => p.name === pl.name);
  };
  const build = (team: Match['teamA']): FormationPlayer[] =>
    normalizeTeam(team)
      .map((pl) => {
        const i = rosterIdx(pl);
        const p = i >= 0 ? (players[i] as Player) : null;
        return { name: p ? p.name : pl.name, score: p ? (scores[i] as number) : null, role: p ? primaryRole(p) : 'MED' };
      })
      .sort((a, b) => (ROLE_ORDER[a.role] as number) - (ROLE_ORDER[b.role] as number));
  const tA = build(m.teamA), tB = build(m.teamB);
  const avg = (t: FormationPlayer[]) => {
    const v = t.filter((p) => p.score != null);
    return v.length ? v.reduce((s, p) => s + (p.score as number), 0) / v.length : null;
  };
  const sA = avg(tA), sB = avg(tB);
  return drawFormations({ tA, tB, sA, sB, modA: '', modB: '', diff: sA != null && sB != null ? Math.abs(sA - sB) : null, subtitle: 'Formazioni del ' + formatDate(m.date) });
}

export const matchSummary = (ld: LeagueData, m: Match): HTMLCanvasElement => drawSummary(summaryInput(ld.dataset, m, ld.editors?.[m.id]));

export const matchSheet = (ld: LeagueData, m: SheetMatch): HTMLCanvasElement => drawSheet(sheetInput(ld.dataset, m));

/** Foglio della proposta mostrata in Gioca (senza dover creare prima la partita). La data è quella di oggi, come in legacy. */
export function comboSheet(ld: LeagueData, c: Combo, now = new Date()): { canvas: HTMLCanvasElement; date: string } {
  const players = ld.dataset.players;
  const date = now.toISOString().substring(0, 10);
  const ent = (i: number) => ({ id: (players[i] as Player).id, name: (players[i] as Player).name });
  const m = { date, notes: '', teamA: c.tA.map(ent), teamB: c.tB.map(ent) };
  return { canvas: matchSheet(ld, m), date };
}

export async function figurinaCanvas(ld: LeagueData, p: Player, statsDataset?: Dataset): Promise<HTMLCanvasElement> {
  const photo = await loadImage(photoUrl(ld.photos[p.id]));
  return drawFutCard(futCardModel(ld.dataset, ld.weights, ld.albo, p, undefined, statsDataset ?? profileSeasonData(ld.dataset, p.id, p.name).dataset), photo);
}

export async function compareCanvas(ld: LeagueData, pa: Player, pb: Player, scope: string): Promise<HTMLCanvasElement> {
  const [a, b] = await Promise.all([loadImage(photoUrl(ld.photos[pa.id])), loadImage(photoUrl(ld.photos[pb.id]))]);
  return drawCompare(compareInput(ld.dataset, ld.weights, ld.albo, pa, pb, scope), [a, b]);
}
