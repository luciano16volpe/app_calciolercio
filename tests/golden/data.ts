import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const app = JSON.parse(readFileSync(join(root, 'tests/fixtures/app_data.json'), 'utf8'));
const rosa = JSON.parse(readFileSync(join(root, 'legacy/rosa_calcetto.json'), 'utf8'));

/** Dati reali del gruppo: rosa, pesi OVR, partite e pagelle. */
export const real = {
  players: rosa.players as Array<{ id: string; name: string; roles: string[]; stats: number[] }>,
  weights: rosa.weights as number[],
  matches: app.matches as Array<Record<string, unknown>>,
  ratings: app.ratings as Array<Record<string, unknown>>,
};
