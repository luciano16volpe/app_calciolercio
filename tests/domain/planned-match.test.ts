import { expect, test } from 'vitest';
import { canPlanMatch, replacePlannedPlayer } from '../../src/domain/plannedMatch';
import type { Dataset } from '../../src/domain/types';

test('sostituzione e scambio rispettano posti e unicità senza mutare i dati originali', () => {
  const teams={teamA:['a','b'],teamB:['c','d']};
  expect(replacePlannedPlayer(teams,'teamA',0,'e')).toEqual({teamA:['e','b'],teamB:['c','d']});
  expect(replacePlannedPlayer(teams,'teamA',0,'c')).toEqual({teamA:['c','b'],teamB:['a','d']});
  expect(teams).toEqual({teamA:['a','b'],teamB:['c','d']});
});
test('risultato zero e pagelle impediscono le modifiche preliminari', () => {
  const match={id:'m',scoreA:null,scoreB:null};
  const data: Dataset={players:[],matches:[match],ratings:[]};
  expect(canPlanMatch(data,match)).toBe(true);
  expect(canPlanMatch(data,{...match,scoreA:0})).toBe(false);
  expect(canPlanMatch({...data,ratings:[{matchId:'m',rating:6}]},match)).toBe(false);
  expect(canPlanMatch({...data,ratings:[{matchId:'m',rating:null,goals:1}]},match)).toBe(false);
});
