import { PREDICTION_CATALOG, PREDICTION_RULES, evaluatePrediction, type Difficulty, type Performance, type PredictionRules, type Template } from './advancedPredictions.ts';
import type { Condition, Value } from './advancedPredictions.ts';

export interface DifficultyEstimate { difficulty: Difficulty; weight: number; probability: number | null; sampleSize: number; method: 'INDIVIDUAL' | 'LEAGUE' | 'DEFAULT' }
export interface Candidate { template: Template; target: Performance; parameters: Record<string,number>; estimate: DifficultyEstimate; recentAssignments: number; canonicalGroup: string; conflictFields: readonly string[] }
export interface AssignmentDraft extends Candidate { description: string }
export interface GenerationInput {
  predictor: Performance; players: Performance[]; ownLeaguePlayerIds: ReadonlySet<string>;
  historicalMatches: readonly { target: Performance; players: Performance[]; date?: string }[];
  leagueHistoricalMatches?: readonly { target: Performance; players: Performance[]; date?: string }[];
  recentAssignments?: readonly { templateCode: string; targetPlayerId: string }[];
  seed: string; matchDate?: string; rules?: PredictionRules; allowRatings?: boolean;
}
const seasonKey=(date:string)=>{const year=Number(date.slice(0,4));const month=Number(date.slice(5,7));
  return month>=3&&month<=5?`${year}-PRI`:month>=6&&month<=8?`${year}-EST`:
    month>=9&&month<=11?`${year}-AUT`:`${month<3?year-1:year}-INV`;};
const seasonHistory=(template:Template)=>[124,125,128,129].includes(template.id);
const familyOf=(template:Template):string=>{
  if(template.category==='GOALS'||template.category==='ASSISTS'||template.category==='OWN_GOALS'||template.category==='METAS') return template.category;
  if(template.category==='RATINGS'||template.category==='RATING_RANKINGS'||template.category==='RATING_SPECIAL') return 'RATINGS';
  if(template.category==='COMPARISONS') {
    const fields=JSON.stringify(template.condition).match(/"field":"[^"]+"/g)??[];
    return `COMPARE:${[...new Set(fields)].sort().join(':')}`;
  }
  if(template.category==='RANKINGS') return `RANK:${JSON.stringify(template.condition).match(/"field":"[^"]+"/g)?.join(':')??template.code}`;
  return `SPECIAL:${template.code}`;
};
export const canonicalGroupFor=(targetPlayerId:string,template:Template)=>`${targetPlayerId}:${familyOf(template)}`;
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;};
function random(seed:string){let state=hash(seed)||1;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function empirical(template:Template, parameters:Record<string,number>, matches:readonly {target:Performance;players:Performance[];date?:string}[]): {wins:number;sample:number} {
  let wins=0,sample=0;
  for(let index=0;index<matches.length;index++){
    const match=matches[index]!;
    const older=matches.slice(index+1).filter(row=>row.target.playerId===match.target.playerId&&
      (!seasonHistory(template)||!match.date||!row.date||seasonKey(row.date)===seasonKey(match.date))).map(row=>row.target);
    const outcome=evaluatePrediction(template,{target:match.target,players:match.players,parameters,history:older});
    if(outcome==='WON'||outcome==='LOST'){sample++;if(outcome==='WON')wins++;}
  }
  return {wins,sample};
}
function classify(probability:number,rules:PredictionRules):Difficulty {
  if(probability>=rules.probabilityThresholds.common)return 'COMMON';
  if(probability>=rules.probabilityThresholds.uncommon)return 'UNCOMMON';
  if(probability>=rules.probabilityThresholds.rare)return 'RARE';
  if(probability>=rules.probabilityThresholds.epic)return 'EPIC';
  return 'LEGENDARY';
}
/** All samples must precede the future match; the caller enforces the chronological filter. */
export function estimateDifficulty(template:Template, parameters:Record<string,number>, playerHistory:GenerationInput['historicalMatches'], leagueHistory:GenerationInput['leagueHistoricalMatches']=[], rules:PredictionRules=PREDICTION_RULES):DifficultyEstimate {
  const own=empirical(template,parameters,playerHistory.slice(0,rules.historyWindow));
  const league=empirical(template,parameters,leagueHistory.slice(0,rules.historyWindow*20));
  let method:DifficultyEstimate['method']='DEFAULT',probability:number|null=null;
  if(own.sample>=rules.minIndividualSample){
    // Beta smoothing with a league prior, or a neutral prior when league data are absent.
    const prior=league.sample>=rules.minIndividualSample?league.wins/league.sample:0.5;
    probability=(own.wins+prior*4)/(own.sample+4);
    method='INDIVIDUAL';
  } else if(league.sample>=rules.minIndividualSample){
    probability=(league.wins+2)/(league.sample+4);
    method='LEAGUE';
  }
  const difficulty=probability===null?(template.defaultDifficulty==='LEGENDARY'?'EPIC':template.defaultDifficulty):classify(probability,rules);
  return {difficulty,weight:rules.weights[difficulty],probability,sampleSize:method==='INDIVIDUAL'?own.sample:method==='LEAGUE'?league.sample:own.sample,method};
}
function parameterSets(template:Template):Record<string,number>[] {
  if(!template.parameterOptions)return [{}];
  const keys=Object.keys(template.parameterOptions);
  return keys.reduce<Record<string,number>[]>((rows,key)=>rows.flatMap(row=>(template.parameterOptions?.[key]??[]).map(value=>({...row,[key]:value}))),[{}]);
}
function usableParameters(template:Template, parameters:Record<string,number>):boolean {
  if(template.id===112) return (parameters.minimum??0)<(parameters.maximum??0);
  return true;
}
export function buildCandidates(input:GenerationInput):Candidate[] {
  const rules=input.rules??PREDICTION_RULES;
  const own=input.predictor;
  const targets=input.players.filter(x=>x.team!==own.team&&x.playerId!==own.playerId&&input.ownLeaguePlayerIds.has(x.playerId));
  const recent=input.recentAssignments??[];
  const output:Candidate[]=[];
  for(const target of targets)for(const template of PREDICTION_CATALOG){
    if(template.ratingDependent&&!input.allowRatings)continue;
    const targetHistory=input.historicalMatches.filter(x=>x.target.playerId===target.playerId);
    if(template.historicalRequired&&!targetHistory.some(row=>row.target.rating!==null&&
      (!seasonHistory(template)||!input.matchDate||!row.date||seasonKey(row.date)===seasonKey(input.matchDate))))continue;
    for(const parameters of parameterSets(template)){
      if(!usableParameters(template,parameters))continue;
      const estimate=estimateDifficulty(template,parameters,targetHistory,input.leagueHistoricalMatches,rules);
      if(estimate.method==='INDIVIDUAL'&&estimate.probability!==null&&(estimate.probability>0.95||estimate.probability<0.02))continue;
      output.push({template,target,parameters,estimate,
        recentAssignments:recent.reduce((score,x)=>score+(x.templateCode===template.code?1:0)+(x.targetPlayerId===target.playerId?0.25:0),0),
        canonicalGroup:canonicalGroupFor(target.playerId,template),
        conflictFields:[...new Set((JSON.stringify(template.condition).match(/"field":"[^"]+"/g)??[]).map(x=>x.slice(9,-1)))]});
    }
  }
  return output;
}
function valueText(value:Value,parameters:Record<string,number>):string {
  if('constant' in value)return String(value.constant);
  if('parameter' in value)return String(parameters[value.parameter]??'?');
  if('field' in value)return {goals:'gol',assists:'assist',ownGoals:'autogol',metas:'mete',rating:'voto'}[value.field];
  if('sum' in value)return value.sum.map(x=>valueText(x,parameters)).join(' + ');
  if('historical' in value)return `${value.historical==='AVG'?'media':value.historical==='MAX'?'massimo':'minimo'} storico di ${valueText(value.value,parameters)}`;
  return `${value.aggregate==='AVG'?'media':value.aggregate==='SUM'?'somma':value.aggregate==='MAX'?'massimo':'minimo'} ${value.scope==='TEAM'?'della squadra':'della partita'} di ${valueText(value.value,parameters)}`;
}
function conditionText(condition:Condition,parameters:Record<string,number>):string {
  if('conditions' in condition)return condition.conditions.map(x=>conditionText(x,parameters)).join(condition.op==='AND'?' e ':' oppure ');
  if(condition.op==='RANK')return `tra i primi ${condition.atMost} per ${valueText(condition.value,parameters)} ${condition.scope==='TEAM'?'della squadra':'della partita'}`;
  if(condition.op==='RATIO')return `${valueText(condition.numerator,parameters)} almeno il ${Math.round(condition.minimum*100)}% della squadra`;
  if(condition.op==='HISTORICAL_RECORD')return `${valueText(condition.value,parameters)} ${condition.direction==='HIGH'?'superiore al massimo':'inferiore al minimo'} storico`;
  if(condition.op==='PARITY')return `${valueText(condition.value,parameters)} ${condition.parity==='EVEN'?'pari':'dispari'}${condition.nonZero?', escluso zero':''}`;
  if(condition.op==='BETWEEN')return `${valueText(condition.value,parameters)} tra ${valueText(condition.min,parameters)} e ${valueText(condition.max,parameters)}`;
  const symbols={EQ:'=',NE:'≠',GT:'>',GTE:'≥',LT:'<',LTE:'≤'};
  return `${valueText(condition.left,parameters)} ${symbols[condition.op]} ${valueText(condition.right,parameters)}${condition.nonZero?', escludendo entrambi zero':''}`;
}
function description(candidate:Candidate):string {
  let text=candidate.template.title;
  for(const [key,value] of Object.entries(candidate.parameters))text=text.replaceAll(`{${key}}`,value.toString()).replaceAll(key==='threshold'?'X':key,value.toString());
  return `${text} · ${conditionText(candidate.template.condition,candidate.parameters)}`;
}
/** Deterministic draft only. The caller must persist the first generation atomically and return it on subsequent calls. */
export function generateAssignmentDraft(input:GenerationInput, preserved:readonly Candidate[]=[], excludedGroups:ReadonlySet<string>=new Set()):AssignmentDraft[] {
  const rules=input.rules??PREDICTION_RULES;
  const pool=buildCandidates(input);
  const rand=random(input.seed);
  const chosen:AssignmentDraft[]=preserved.map(x=>({...x,description:description(x)}));
  const groups=new Set<string>([...excludedGroups,...preserved.map(x=>x.canonicalGroup)]); const perTarget=new Map<string,number>();
  const quotas={...rules.desiredDistribution};
  for(const item of preserved){perTarget.set(item.target.playerId,(perTarget.get(item.target.playerId)??0)+1);quotas[item.estimate.difficulty]--;}
  while(chosen.length<rules.maxAssignments){
    const eligible=pool.filter(c=>!groups.has(c.canonicalGroup)&&!chosen.some(x=>x.target.playerId===c.target.playerId&&x.conflictFields.some(field=>c.conflictFields.includes(field))));
    if(!eligible.length)break;
    const underCap=eligible.filter(c=>(perTarget.get(c.target.playerId)??0)<3);
    const choices=underCap.length?underCap:eligible;
    const wanted=choices.filter(c=>quotas[c.estimate.difficulty]>0);
    const candidates=wanted.length?wanted:choices;
    const maxNeeded=Math.max(...candidates.map(c=>quotas[c.estimate.difficulty]));
    const priority=candidates.filter(c=>quotas[c.estimate.difficulty]===maxNeeded);
    const weighted=priority.map(c=>({candidate:c,weight:1/((1+c.recentAssignments*2)*(1+(perTarget.get(c.target.playerId)??0)))}));
    const total=weighted.reduce((s,x)=>s+x.weight,0);let pick=rand()*total;
    const selected=weighted.find(x=>(pick-=x.weight)<=0)?.candidate??weighted[weighted.length-1]!.candidate;
    chosen.push({...selected,description:description(selected)});
    groups.add(selected.canonicalGroup);
    perTarget.set(selected.target.playerId,(perTarget.get(selected.target.playerId)??0)+1);
    quotas[selected.estimate.difficulty]--;
  }
  return chosen.slice(preserved.length);
}
