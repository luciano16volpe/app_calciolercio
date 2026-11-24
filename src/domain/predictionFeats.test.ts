import { describe,expect,it } from 'vitest';
import { PREDICTION_FEATS,predictionFeats,type PredictionFeatData } from './awards';

const base:PredictionFeatData={won:0,lost:0,categories:{},difficulties:{},matches:[]};
describe('prediction feats in the existing awards domain',()=>{
  it('has all 21 celebratory badges without bonus points',()=>{
    expect(PREDICTION_FEATS).toHaveLength(21);
    expect(predictionFeats(base).size).toBe(0);
    expect(predictionFeats({...base,won:1})).toContain('apprendista');
  });
  it('requires enough validated bets for the surgeon badge',()=>{
    expect(predictionFeats({...base,won:8,lost:2})).not.toContain('chirurgo');
    expect(predictionFeats({...base,won:16,lost:4})).toContain('chirurgo');
  });
  it('recomputes streaks and multiplier badges from corrected match summaries',()=>{
    const match={selected:5,won:4,lost:1,final_units:10000,multiplier_basis_points:12500};
    const five=Array.from({length:5},()=>match);
    expect(predictionFeats({...base,matches:five})).toContain('inarrestabile');
    expect(predictionFeats({...base,matches:[...five.slice(0,2),{...match,final_units:-10000},...five.slice(3)]})).not.toContain('inarrestabile');
    expect(predictionFeats({...base,matches:[match]})).toContain('triplettaProfeta');
  });
});
