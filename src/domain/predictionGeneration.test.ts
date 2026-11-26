import { describe, expect, it } from 'vitest';
import { PREDICTION_CATALOG, type Performance } from './advancedPredictions';
import { buildCandidates, estimateDifficulty, generateAssignmentDraft } from './predictionGeneration';

const player=(playerId:string,team:'A'|'B',goals=0):Performance=>({playerId,team,goals,assists:0,ownGoals:0,metas:0,rating:null});
const predictor=player('predictor','A');
const teammate=player('teammate','A');
const opponents=Array.from({length:5},(_,i)=>player(`opponent-${i}`,'B'));
const players=[predictor,teammate,...opponents];
const input={predictor,players,ownLeaguePlayerIds:new Set(players.map(x=>x.playerId)),historicalMatches:[],seed:'stable-seed'};
describe('advanced prediction generation',()=>{
  it('assigns six independent, eligible, non-overlapping drafts',()=>{
    const draft=generateAssignmentDraft(input);
    expect(draft).toHaveLength(6);
    expect(draft.every(x=>x.target.team==='B'&&!x.template.ratingDependent)).toBe(true);
    expect(new Set(draft.map(x=>x.canonicalGroup)).size).toBe(draft.length);
    expect(draft.filter(x=>x.target.playerId==='opponent-0').length).toBeLessThanOrEqual(3);
    expect(generateAssignmentDraft(input)).toEqual(draft);
  });
  it('gives someone who does not play three players per team',()=>{
    const blues=Array.from({length:5},(_,i)=>player(`blue-${i}`,'A'));
    const all=[...blues,...opponents];
    const spectator=player('spectator','A');
    const draft=generateAssignmentDraft({predictor:spectator,players:all,ownLeaguePlayerIds:new Set(all.map(x=>x.playerId)),
      historicalMatches:[],seed:'spectator-seed',spectator:true});
    expect(draft).toHaveLength(6);
    expect(draft.filter(x=>x.target.team==='A')).toHaveLength(3);
    expect(draft.filter(x=>x.target.team==='B')).toHaveLength(3);
  });
  it('does not invent targets or templates to fill the quota',()=>{
    expect(generateAssignmentDraft({...input,players:[predictor,teammate],ownLeaguePlayerIds:new Set(players.map(x=>x.playerId))})).toEqual([]);
    expect(buildCandidates({...input,ownLeaguePlayerIds:new Set(['predictor'])})).toEqual([]);
  });
  it('does not reject a future ratio merely because pre-match counters are zero',()=>{
    expect(buildCandidates(input).some(x=>x.template.id===73)).toBe(true);
  });
  it('keeps compatible assignments and does not reuse a replaced condition',()=>{
    const first=generateAssignmentDraft(input);
    const preserved=first.slice(0,8);
    const blocked=new Set(first.map(x=>x.canonicalGroup));
    const replacements=generateAssignmentDraft(input,preserved,blocked);
    expect(replacements.length).toBeLessThanOrEqual(2);
    expect(replacements.every(x=>!blocked.has(x.canonicalGroup))).toBe(true);
    expect(generateAssignmentDraft(input,preserved,blocked)).toEqual(replacements);
  });
  it('uses a smoothed empirical estimate only after a sufficient sample',()=>{
    const template=PREDICTION_CATALOG[0]!;
    const history=Array.from({length:10},(_,i)=>({target:player('opponent-0','B',i<6?1:0),players:[player('opponent-0','B',i<6?1:0)]}));
    const estimate=estimateDifficulty(template,{},history);
    expect(estimate.method).toBe('INDIVIDUAL');
    expect(estimate.sampleSize).toBe(10);
    expect(estimate.probability).toBeGreaterThan(0.5);
    expect(estimate.probability).toBeLessThan(0.65);
    expect(estimate.difficulty).toBe('UNCOMMON');
    expect(estimateDifficulty(template,{},history.slice(0,2)).method).toBe('DEFAULT');
  });
  it('uses five evaluable player matches as the individual frequency threshold',()=>{
    const template=PREDICTION_CATALOG[0]!;
    const history=Array.from({length:5},(_,i)=>({target:player('opponent-0','B',i<3?1:0),players:[player('opponent-0','B',i<3?1:0)]}));
    const five=estimateDifficulty(template,{},history);
    expect(five.method).toBe('INDIVIDUAL');
    expect(five.sampleSize).toBe(5);
    expect(five.probability).not.toBeNull();
    expect(estimateDifficulty(template,{},history.slice(0,4)).method).toBe('DEFAULT');
  });
  it('offers historical rating comparisons only when the target has a prior official vote in that season',()=>{
    const target={...opponents[0]!,rating:7};
    const past={target,players:[target],date:'2026-10-10'};
    const dated={...input,historicalMatches:[past],matchDate:'2026-11-24',allowRatings:true};
    expect(buildCandidates(dated).some(x=>x.template.id===124&&x.target.playerId===target.playerId)).toBe(true);
    expect(buildCandidates({...dated,matchDate:'2027-04-01'}).some(x=>x.template.id===124)).toBe(false);
    expect(buildCandidates({...dated,historicalMatches:[{...past,target:{...target,rating:null}}]}).some(x=>x.template.id===124)).toBe(false);
  });
});
