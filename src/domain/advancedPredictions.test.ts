import { describe, expect, it } from 'vitest';
import { DIFFICULTY_WEIGHT, PREDICTION_CATALOG, PREDICTION_RULES, evaluatePrediction, scorePredictions, type Performance } from './advancedPredictions';

const target: Performance = { playerId:'target',team:'B',goals:0,assists:0,ownGoals:0,metas:0,rating:6 };
const teammate: Performance = { playerId:'teammate',team:'B',goals:0,assists:0,ownGoals:0,metas:0,rating:7 };
const opponent: Performance = { playerId:'opponent',team:'A',goals:0,assists:0,ownGoals:0,metas:0,rating:5 };
const at = (id:number) => {
  const template=PREDICTION_CATALOG.find(x=>x.id===id);
  if(!template) throw new Error(`Missing template ${id}`);
  return template;
};
const evaluate=(id:number, patch:Partial<Performance>={}, other:Partial<Performance>={}, parameters?:Record<string,number>)=>{
  const player={...target,...patch};
  return evaluatePrediction(at(id),{target:player,players:[player,{...teammate,...other},opponent],parameters});
};
describe('advanced prediction catalogue',()=>{
  it('contains every unique template from 1 to 140',()=>{
    expect(PREDICTION_CATALOG.map(x=>x.id)).toEqual(Array.from({length:140},(_,i)=>i+1));
    expect(new Set(PREDICTION_CATALOG.map(x=>x.code)).size).toBe(140);
    expect(PREDICTION_CATALOG.filter(x=>x.ratingDependent).map(x=>x.id)).toEqual(Array.from({length:40},(_,i)=>i+101));
    expect(PREDICTION_CATALOG.every(x=>x.requiredFields.length>0)).toBe(true);
  });
  it('evaluates every catalogue condition without executing arbitrary code',()=>{
    for(const template of PREDICTION_CATALOG){
      const parameters=Object.fromEntries(Object.entries(template.parameterOptions??{}).map(([key,values])=>[key,values[0]!]));
      const outcome=evaluatePrediction(template,{target,players:[target,teammate,opponent],history:[target],parameters});
      expect(['WON','LOST','PENDING','VOID']).toContain(outcome);
    }
  });
  it('matches the specified result for all 140 IDs on a neutral match',()=>{
    const winning=new Set([2,8,12,18,22,27,32,38,78,108,112,113,115,119,121,130]);
    const voided=new Set([73,74,75]);
    for(const template of PREDICTION_CATALOG){
      const parameters=Object.fromEntries(Object.entries(template.parameterOptions??{}).map(([key,values])=>[key,values[0]!]));
      const outcome=evaluatePrediction(template,{target,players:[target,teammate,opponent],history:[target],parameters});
      expect(outcome,`template #${template.id} ${template.code}`).toBe(voided.has(template.id)?'VOID':winning.has(template.id)?'WON':'LOST');
    }
  });
  it('distinguishes zero from missing data',()=>{
    expect(evaluate(2)).toBe('WON');
    expect(evaluate(2,{goals:null})).toBe('PENDING');
    expect(evaluate(78,{assists:null})).toBe('PENDING');
  });
  it('handles exact thresholds, even zero exclusion and nonzero equality',()=>{
    expect(evaluate(1)).toBe('LOST');
    expect(evaluate(1,{goals:1})).toBe('WON');
    expect(evaluate(9)).toBe('LOST');
    expect(evaluate(9,{goals:2})).toBe('WON');
    expect(evaluate(53)).toBe('LOST');
    expect(evaluate(53,{goals:2,assists:2})).toBe('WON');
    expect(evaluate(7,{goals:3},{},{threshold:2})).toBe('WON');
  });
  it('applies ties and zero maximum rules',()=>{
    expect(evaluate(61)).toBe('LOST');
    expect(evaluate(61,{goals:2},{goals:2})).toBe('WON');
    expect(evaluate(62,{goals:2},{goals:2})).toBe('WON');
    expect(evaluate(73)).toBe('VOID');
    expect(evaluate(73,{goals:1},{goals:1})).toBe('WON');
  });
  it('requires an actual improvement for a historical record',()=>{
    const player={...target,rating:8};
    const context={target:player,players:[player,teammate,opponent],history:[{...target,rating:8}]};
    expect(evaluatePrediction(at(128),context)).toBe('LOST');
    expect(evaluatePrediction(at(128),{...context,target:{...player,rating:9}})).toBe('WON');
    expect(evaluatePrediction(at(128),{...context,history:[]})).toBe('VOID');
  });
  it('scores negative balances and exact quarter multipliers',()=>{
    const good=[3,3,2,2].map(weight=>({result:'WON' as const,weight}));
    expect(scorePredictions([...good,{result:'LOST',weight:2}]).finalUnits).toBe(100000);
    expect(scorePredictions([{result:'WON',weight:1},{result:'LOST',weight:5}]).finalUnits).toBe(-40000);
    expect(scorePredictions([...good,{result:'PENDING',weight:1}]).multiplierBasisPoints).toBe(10000);
    expect(scorePredictions([...good,{result:'VOID',weight:5}]).multiplierBasisPoints).toBe(12500);
    expect(scorePredictions([{result:'WON',weight:1},{result:'WON',weight:2},{result:'WON',weight:4}]).finalUnits).toBe(87500);
    expect(Object.values(DIFFICULTY_WEIGHT)).toEqual([1,2,3,4,5]);
    expect(Object.values(PREDICTION_RULES.desiredDistribution).reduce((a,b)=>a+b,0)).toBe(5);
  });
});
