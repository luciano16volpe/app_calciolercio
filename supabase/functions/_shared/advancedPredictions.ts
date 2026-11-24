/** Declarative, versioned catalogue. This module has no database or UI dependencies. */
export type PredictionCategory = 'GOALS' | 'ASSISTS' | 'OWN_GOALS' | 'METAS' | 'COMPARISONS' | 'RANKINGS' | 'SPECIAL' | 'RATINGS' | 'RATING_RANKINGS' | 'RATING_SPECIAL';
export type Difficulty = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };
export type Stat = 'goals' | 'assists' | 'ownGoals' | 'metas' | 'rating';
export type Value = { field: Stat } | { constant: number } | { parameter: string } | { sum: Value[] } |
  { aggregate: 'MAX' | 'MIN' | 'AVG' | 'SUM'; scope: 'TEAM' | 'MATCH'; value: Value } |
  { historical: 'AVG' | 'MAX' | 'MIN'; value: Value; window?: number };
export type Condition =
  | { op: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE'; left: Value; right: Value; nonZero?: boolean }
  | { op: 'BETWEEN'; value: Value; min: Value; max: Value }
  | { op: 'PARITY'; value: Value; parity: 'EVEN' | 'ODD'; nonZero?: boolean }
  | { op: 'AND' | 'OR'; conditions: Condition[] }
  | { op: 'RANK'; value: Value; scope: 'TEAM' | 'MATCH'; direction: 'HIGH' | 'LOW'; atMost: number; positiveMaximum?: boolean }
  | { op: 'RATIO'; numerator: Value; denominator: Value; scope: 'TEAM' | 'MATCH'; minimum: number }
  | { op: 'HISTORICAL_RECORD'; value: Value; direction: 'HIGH' | 'LOW' };
export interface Template {
  id: number; code: string; category: PredictionCategory; title: string; condition: Condition;
  defaultDifficulty: Difficulty; ratingDependent: boolean; historicalRequired: boolean;
  requiredFields: readonly Stat[]; scope: 'PLAYER' | 'TEAM' | 'MATCH' | 'HISTORICAL';
  parameterOptions?: Record<string, readonly number[]>;
}
export interface Performance { playerId: string; team: 'A' | 'B'; goals: number | null; assists: number | null; ownGoals: number | null; metas: number | null; rating: number | null }
export interface EvaluationContext { target: Performance; players: Performance[]; history?: Performance[]; parameters?: Record<string, number> }
export type Evaluation = 'WON' | 'LOST' | 'PENDING' | 'VOID';
const f = (field: Stat): Value => ({ field });
const n = (constant: number): Value => ({ constant });
const p = (parameter: string): Value => ({ parameter });
const sum = (...values: Value[]): Value => ({ sum: values });
const cmp = (op: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE', left: Value, right: Value, nonZero = false): Condition => ({ op, left, right, nonZero });
const all = (...conditions: Condition[]): Condition => ({ op: 'AND', conditions });
const atLeast = (stat: Stat, amount: number) => cmp('GTE', f(stat), n(amount));
const zero = (stat: Stat) => cmp('EQ', f(stat), n(0));
const templates: Template[] = [];
function add(id: number, code: string, category: PredictionCategory, title: string, condition: Condition, defaultDifficulty: Difficulty = 'UNCOMMON', parameterOptions?: Record<string, readonly number[]>) {
  const ratingDependent = JSON.stringify(condition).includes('rating');
  const historicalRequired = JSON.stringify(condition).includes('historical') || condition.op === 'HISTORICAL_RECORD';
  const requiredFields=[...new Set((JSON.stringify(condition).match(/"field":"[^"]+"/g)??[]).map(x=>x.slice(9,-1) as Stat))];
  const scope=historicalRequired?'HISTORICAL':category==='RANKINGS'||category==='RATING_RANKINGS'?'MATCH':'PLAYER';
  templates.push({ id, code, category, title, condition, defaultDifficulty, ratingDependent, historicalRequired, requiredFields, scope, parameterOptions });
}
const counters: Array<{ category: PredictionCategory; field: Stat; base: number; label: string }> = [
  { category: 'GOALS', field: 'goals', base: 1, label: 'gol' }, { category: 'ASSISTS', field: 'assists', base: 11, label: 'assist' },
  { category: 'OWN_GOALS', field: 'ownGoals', base: 21, label: 'autogol' }, { category: 'METAS', field: 'metas', base: 31, label: 'mete' },
];
const statLabel:Record<Stat,string>={goals:'gol',assists:'assist',ownGoals:'autogol',metas:'mete',rating:'voto'};
for (const { category, field, base, label } of counters) {
  const first = base === 1 ? 'Segna' : 'Fa';
  add(base, `${field}_AT_LEAST_ONE`, category, `${first} almeno un ${label}`, atLeast(field, 1), 'COMMON');
  add(base + 1, `${field}_ZERO`, category, base===1?'Non segna':`Non fa ${label}`, zero(field), 'COMMON');
  if(base===21){
    for(let count=1;count<=3;count++)add(base+count+1,`${field}_EXACT_${count}`,category,`Fa esattamente ${count} ${label}`,cmp('EQ',f(field),n(count)),count===3?'EPIC':'RARE');
    add(26,`${field}_OVER`,category,`Fa più di X ${label}`,cmp('GT',f(field),p('threshold')),'UNCOMMON',{threshold:[1,2,3]});
    add(27,`${field}_UNDER`,category,`Fa meno di X ${label}`,cmp('LT',f(field),p('threshold')),'UNCOMMON',{threshold:[1,2,3]});
    add(28,`${field}_EVEN`,category,`Fa un numero pari di ${label}, escluso zero`,{op:'PARITY',value:f(field),parity:'EVEN',nonZero:true},'RARE');
    add(29,`${field}_ODD`,category,`Fa un numero dispari di ${label}`,{op:'PARITY',value:f(field),parity:'ODD'},'RARE');
    add(30,`${field}_AT_LEAST_FOUR`,category,'Fa almeno quattro autogol',atLeast(field,4),'LEGENDARY');
    continue;
  }
  for (let count = 1; count <= 4; count++) add(base + count + 1, `${field}_EXACT_${count}`, category, `Fa esattamente ${count} ${label}`, cmp('EQ', f(field), n(count)), count >= 3 ? 'EPIC' : 'RARE');
  add(base + 6, `${field}_OVER`, category, `Fa più di X ${label}`, cmp('GT', f(field), p('threshold')), 'UNCOMMON', { threshold: [1, 2, 3] });
  add(base + 7, `${field}_UNDER`, category, `Fa meno di X ${label}`, cmp('LT', f(field), p('threshold')), 'UNCOMMON', { threshold: [1, 2, 3] });
  add(base + 8, `${field}_EVEN`, category, `Fa un numero pari di ${label}, escluso zero`, { op: 'PARITY', value: f(field), parity: 'EVEN', nonZero: true }, 'RARE');
  add(base + 9, `${field}_ODD`, category, `Fa un numero dispari di ${label}`, { op: 'PARITY', value: f(field), parity: 'ODD' }, 'RARE');
}
const pairs: Array<[Stat, Stat]> = [
  ['goals', 'assists'], ['goals', 'metas'], ['ownGoals', 'goals'], ['metas', 'assists'], ['ownGoals', 'metas'], ['ownGoals', 'assists'],
];
pairs.forEach(([a, b], index) => {
  add(41 + index * 2, `${a}_MORE_THAN_${b}`, 'COMPARISONS', `Fa più ${statLabel[a]} che ${statLabel[b]}`, cmp('GT', f(a), f(b)));
  add(42 + index * 2, `${b}_MORE_THAN_${a}`, 'COMPARISONS', `Fa più ${statLabel[b]} che ${statLabel[a]}`, cmp('GT', f(b), f(a)));
});
const equalPairs: Array<[Stat, Stat]> = [['goals','assists'],['goals','metas'],['goals','ownGoals'],['assists','metas'],['assists','ownGoals'],['metas','ownGoals']];
equalPairs.forEach(([a,b], i) => add(53+i, `${a}_EQUAL_${b}`, 'COMPARISONS', `Fa tanti ${statLabel[a]} quanti ${statLabel[b]}, oltre zero`, cmp('EQ', f(a), f(b), true), 'RARE'));
add(59, 'POSITIVE_MORE_THAN_NEGATIVE', 'COMPARISONS', 'Gol e assist superano mete e autogol', cmp('GT', sum(f('goals'),f('assists')), sum(f('metas'),f('ownGoals'))));
add(60, 'NEGATIVE_MORE_THAN_POSITIVE', 'COMPARISONS', 'Mete e autogol superano gol e assist', cmp('GT', sum(f('metas'),f('ownGoals')), sum(f('goals'),f('assists'))));
const rankValues: Array<[number, string, Value]> = [
  [61,'GOALS',f('goals')],[63,'ASSISTS',f('assists')],[65,'METAS',f('metas')],[67,'OWN_GOALS',f('ownGoals')],
  [69,'GOALS_ASSISTS',sum(f('goals'),f('assists'))],[71,'METAS_OWN_GOALS',sum(f('metas'),f('ownGoals'))],
];
for (const [id, code, value] of rankValues) {
  const label=code.replaceAll('_',' + ').toLowerCase().replace('own + goals','autogol').replace('goals','gol').replace('assists','assist').replace('metas','mete');
  add(id, `TOP_TEAM_${code}`, 'RANKINGS', `Primato ${label} della squadra`, { op: 'RANK', value, scope: 'TEAM', direction: 'HIGH', atMost: 1, positiveMaximum: true }, 'RARE');
  add(id+1, `TOP_MATCH_${code}`, 'RANKINGS', `Primato ${label} della partita`, { op: 'RANK', value, scope: 'MATCH', direction: 'HIGH', atMost: 1, positiveMaximum: true }, 'EPIC');
}
(['goals','assists','metas'] as const).forEach((field,i) => add(73+i, `HALF_TEAM_${field}`, 'RANKINGS', `Almeno metà ${statLabel[field]} della squadra`, { op:'RATIO', numerator:f(field), denominator:f(field), scope:'TEAM', minimum:0.5 }, 'RARE'));
const specials: Array<[number,string,string,Condition,Difficulty]> = [
  [76,'DOUBLE_AGENT','Doppio agente',all(atLeast('goals',1),atLeast('ownGoals',1)),'RARE'],
  [77,'RUGBISTA','Rugbista',all(atLeast('metas',3),zero('goals')),'EPIC'],
  [78,'GHOST','Fantasma',all(zero('goals'),zero('assists'),zero('ownGoals'),zero('metas')),'COMMON'],
  [79,'CHAOS_POKER','Poker del caos',all(atLeast('goals',1),atLeast('assists',1),atLeast('ownGoals',1),atLeast('metas',1)),'LEGENDARY'],
  [80,'SABOTEUR','Sabotatore',all(atLeast('ownGoals',1),zero('goals')),'RARE'],
  [81,'SNIPER','Cecchino',all(atLeast('goals',3),zero('metas')),'RARE'],
  [82,'ALTRUIST','Altruista',all(atLeast('assists',3),zero('goals')),'EPIC'],
  [83,'EGOIST','Egoista',all(atLeast('goals',3),zero('assists')),'RARE'],
  [84,'SQUARE_FEET','Piedi quadrati',all(atLeast('metas',2),zero('goals'),zero('assists')),'RARE'],
  [85,'TOTAL_DISASTER','Disastro totale',all(atLeast('ownGoals',1),atLeast('metas',1),zero('goals'),zero('assists')),'EPIC'],
  [86,'REVERSE_MIDAS','Re Mida al contrario',all(atLeast('ownGoals',2),atLeast('metas',2)),'LEGENDARY'],
  [87,'INFALLIBLE','Infallibile',all(atLeast('goals',1),atLeast('assists',1),zero('metas'),zero('ownGoals')),'RARE'],
  [88,'KAMIKAZE','Kamikaze',all(atLeast('goals',2),atLeast('ownGoals',2)),'LEGENDARY'],
  [89,'ROBIN_HOOD','Robin Hood',all(atLeast('assists',2),atLeast('ownGoals',1)),'EPIC'],
  [90,'PILOT','Pilota d’aereo',atLeast('metas',5),'LEGENDARY'],
  [91,'FRIENDLY_FIRE','Fuoco amico',all(atLeast('ownGoals',2),zero('goals')),'EPIC'],
  [92,'HEAVEN_HELL','Paradiso e inferno',all(atLeast('goals',3),atLeast('ownGoals',1)),'EPIC'],
  [93,'GENEROUS_ALL','Generoso con tutti',all(atLeast('assists',1),atLeast('ownGoals',1),zero('goals')),'RARE'],
  [94,'COMPLETE_STRIKER','Bomber completo',all(atLeast('goals',3),atLeast('assists',2)),'EPIC'],
  [95,'DOUBLE_DOUBLE','Doppia doppietta',all(atLeast('goals',2),atLeast('assists',2)),'RARE'],
  [96,'TRIPLE_DOUBLE','Tripla doppietta',all(atLeast('goals',2),atLeast('assists',2),atLeast('metas',2)),'LEGENDARY'],
  [97,'BALANCED','In equilibrio',cmp('EQ',sum(f('goals'),f('assists')),sum(f('metas'),f('ownGoals')),true),'RARE'],
  [98,'THIRD_HALF','Terzo tempo',all(atLeast('goals',1),atLeast('assists',1),atLeast('metas',1),zero('ownGoals')),'EPIC'],
  [99,'NEGATIVE_IMPACT','Impatto negativo',all(cmp('GTE',sum(f('metas'),f('ownGoals')),n(5)),zero('goals'),zero('assists')),'LEGENDARY'],
  [100,'PERFECT_MATCH','Partita perfetta',all(atLeast('goals',3),atLeast('assists',3),zero('metas'),zero('ownGoals')),'LEGENDARY'],
];
specials.forEach(([id,code,title,condition,difficulty])=>add(id,code,'SPECIAL',title,condition,difficulty));
const rating = f('rating');
const ratingSpecs: Array<[number,string,Condition]> = [
  [101,'BELOW_5',cmp('LT',rating,n(5))],[102,'BELOW_6',cmp('LT',rating,n(6))],
  [103,'ABOVE_6',cmp('GT',rating,n(6))],[104,'ABOVE_7',cmp('GT',rating,n(7))],
  [105,'ABOVE_8',cmp('GT',rating,n(8))],[106,'ABOVE_9',cmp('GT',rating,n(9))],
  ...[5,6,7,8,9].map((v,i):[number,string,Condition]=>[107+i,`EXACT_${v}`,cmp('EQ',rating,n(v))]),
  [112,'BETWEEN',{op:'BETWEEN',value:rating,min:p('minimum'),max:p('maximum')}],
  [113,'OVER',cmp('GT',rating,p('threshold'))],[114,'UNDER',cmp('LT',rating,p('threshold'))],
  [115,'PASS',cmp('GTE',rating,n(6))],
];
const ratingTitles:Record<number,string>={101:'Voto inferiore a 5',102:'Voto inferiore a 6',103:'Voto superiore a 6',104:'Voto superiore a 7',105:'Voto superiore a 8',106:'Voto superiore a 9',
  107:'Voto esattamente 5',108:'Voto esattamente 6',109:'Voto esattamente 7',110:'Voto esattamente 8',111:'Voto esattamente 9',
  112:'Voto tra {minimum} e {maximum}',113:'Voto superiore a {threshold}',114:'Voto inferiore a {threshold}',115:'Voto sufficiente, almeno 6'};
ratingSpecs.forEach(([id,code,condition])=>add(id,`RATING_${code}`,'RATINGS',ratingTitles[id]!,condition,'UNCOMMON',id===112?{minimum:[5,6,7],maximum:[7,8,9]}:id===113||id===114?{threshold:[5,6,7,8]}:undefined));
const ratingRanks: Array<[number,string,Condition]> = [
  [116,'TOP_MATCH',{op:'RANK',value:rating,scope:'MATCH',direction:'HIGH',atMost:1}],
  [117,'BOTTOM_MATCH',{op:'RANK',value:rating,scope:'MATCH',direction:'LOW',atMost:1}],
  [118,'TOP_TEAM',{op:'RANK',value:rating,scope:'TEAM',direction:'HIGH',atMost:1}],
  [119,'BOTTOM_TEAM',{op:'RANK',value:rating,scope:'TEAM',direction:'LOW',atMost:1}],
  [120,'ABOVE_TEAM_AVG',cmp('GT',rating,{aggregate:'AVG',scope:'TEAM',value:rating})],
  [121,'BELOW_TEAM_AVG',cmp('LT',rating,{aggregate:'AVG',scope:'TEAM',value:rating})],
  [122,'ABOVE_MATCH_AVG',cmp('GT',rating,{aggregate:'AVG',scope:'MATCH',value:rating})],
  [123,'BELOW_MATCH_AVG',cmp('LT',rating,{aggregate:'AVG',scope:'MATCH',value:rating})],
  [124,'ABOVE_SEASON_AVG',cmp('GT',rating,{historical:'AVG',value:rating})],
  [125,'BELOW_SEASON_AVG',cmp('LT',rating,{historical:'AVG',value:rating})],
  [126,'ABOVE_LAST_FIVE_AVG',cmp('GT',rating,{historical:'AVG',value:rating,window:5})],
  [127,'BELOW_LAST_FIVE_AVG',cmp('LT',rating,{historical:'AVG',value:rating,window:5})],
  [128,'NEW_HIGH',{op:'HISTORICAL_RECORD',value:rating,direction:'HIGH'}],
  [129,'NEW_LOW',{op:'HISTORICAL_RECORD',value:rating,direction:'LOW'}],
  [130,'TOP_THREE',{op:'RANK',value:rating,scope:'MATCH',direction:'HIGH',atMost:3}],
];
const ratingRankTitles=['Voto più alto della partita','Voto più basso della partita','Voto più alto della squadra','Voto più basso della squadra',
  'Voto superiore alla media della squadra','Voto inferiore alla media della squadra','Voto superiore alla media della partita','Voto inferiore alla media della partita',
  'Voto superiore alla propria media stagionale','Voto inferiore alla propria media stagionale','Voto superiore alla media delle precedenti cinque partite','Voto inferiore alla media delle precedenti cinque partite',
  'Nuovo record personale stagionale più alto','Nuovo record personale stagionale più basso','Tra i tre voti più alti della partita'];
ratingRanks.forEach(([id,code,condition])=>add(id,`RATING_${code}`,'RATING_RANKINGS',ratingRankTitles[id-116]!,condition,'RARE'));
const low = (v:number)=>cmp('LT',rating,n(v)); const high=(v:number)=>cmp('GTE',rating,n(v));
const ratedSpecials: Array<[number,string,Condition]> = [
  [131,'MIRACLED',all(atLeast('ownGoals',1),high(7))],
  [132,'MISUNDERSTOOD_STRIKER',all(atLeast('goals',3),low(6))],
  [133,'RECOMMENDED',all(zero('goals'),zero('assists'),high(7))],
  [134,'CERTIFIED_DISASTER',all(atLeast('ownGoals',1),atLeast('metas',1),low(5))],
  [135,'CORPSE',all(zero('goals'),zero('assists'),zero('ownGoals'),zero('metas'),low(5))],
  [136,'SUNDAY_MESSI',all(atLeast('goals',3),atLeast('assists',2),high(9))],
  [137,'AWARDED_RUGBISTA',all(atLeast('metas',3),high(7))],
  [138,'GENIUS_CHAOS',all(atLeast('goals',2),atLeast('ownGoals',1),atLeast('metas',1),high(7))],
  [139,'MISUNDERSTOOD_ASSISTMAN',all(atLeast('assists',3),low(6))],
  [140,'DIVINE_PERFORMANCE',all(atLeast('goals',3),atLeast('assists',3),zero('ownGoals'),zero('metas'),cmp('EQ',rating,n(10)))],
];
const ratedSpecialTitles=['Miracolato','Bomber incompreso','Raccomandato','Disastro certificato','Cadavere','Messi della domenica','Rugbista premiato','Genio e sregolatezza','Assistman incompreso','Prestazione divina'];
ratedSpecials.forEach(([id,code,condition])=>add(id,code,'RATING_SPECIAL',ratedSpecialTitles[id-131]!,condition,'EPIC'));
export const PREDICTION_CATALOG: readonly Template[] = Object.freeze(templates.sort((a,b)=>a.id-b.id));

function valueOf(value: Value, ctx: EvaluationContext, current: Performance): number | null {
  if ('constant' in value) return value.constant;
  if ('parameter' in value) return ctx.parameters?.[value.parameter] ?? null;
  if ('field' in value) return current[value.field];
  if ('sum' in value) { const parts=value.sum.map(v=>valueOf(v,ctx,current)); return parts.some(v=>v===null)?null:parts.reduce<number>((a,b)=>a+(b as number),0); }
  if ('historical' in value) {
    const samples=(value.window?(ctx.history??[]).slice(0,value.window):(ctx.history??[]))
      .map(x=>valueOf(value.value,ctx,x)).filter((v):v is number=>v!==null);
    if (!samples.length) return null;
    return value.historical==='AVG'?samples.reduce((a,b)=>a+b,0)/samples.length:value.historical==='MAX'?Math.max(...samples):Math.min(...samples);
  }
  const scope=ctx.players.filter(x=>value.scope==='MATCH'||x.team===current.team);
  const samples=scope.map(x=>valueOf(value.value,ctx,x));
  if (!samples.length||samples.some(v=>v===null)) return null;
  const nums=samples as number[];
  return value.aggregate==='AVG'?nums.reduce((a,b)=>a+b,0)/nums.length:value.aggregate==='SUM'?nums.reduce((a,b)=>a+b,0):value.aggregate==='MAX'?Math.max(...nums):Math.min(...nums);
}
function evaluateCondition(c: Condition, ctx: EvaluationContext): Evaluation {
  const target=ctx.target;
  if('conditions' in c) {
    const results=c.conditions.map(part=>evaluateCondition(part,ctx));
    if(c.op==='AND') return results.includes('LOST')?'LOST':results.includes('VOID')?'VOID':results.includes('PENDING')?'PENDING':'WON';
    return results.includes('WON')?'WON':results.includes('PENDING')?'PENDING':results.includes('VOID')?'VOID':'LOST';
  }
  if(c.op==='RANK') {
    const group=ctx.players.filter(x=>c.scope==='MATCH'||x.team===target.team);
    const values=group.map(x=>valueOf(c.value,ctx,x)); const own=valueOf(c.value,ctx,target);
    if(own===null||!group.length||values.some(v=>v===null)) return 'PENDING';
    const numbers=values as number[]; const extreme=c.direction==='HIGH'?Math.max(...numbers):Math.min(...numbers);
    if(c.positiveMaximum&&extreme===0) return 'LOST';
    const rank=1+numbers.filter(v=>c.direction==='HIGH'?v>own:v<own).length;
    return rank<=c.atMost?'WON':'LOST';
  }
  if(c.op==='RATIO') {
    const a=valueOf(c.numerator,ctx,target);
    const denominator=valueOf({aggregate:'SUM',scope:c.scope,value:c.denominator},ctx,target);
    if(a===null||denominator===null) return 'PENDING';
    return denominator===0?'VOID':a/denominator>=c.minimum?'WON':'LOST';
  }
  if(c.op==='HISTORICAL_RECORD') {
    const current=valueOf(c.value,ctx,target);
    const previous=valueOf({historical:c.direction==='HIGH'?'MAX':'MIN',value:c.value},ctx,target);
    if(current===null) return 'PENDING'; if(previous===null) return 'VOID';
    return (c.direction==='HIGH'?current>previous:current<previous)?'WON':'LOST';
  }
  if(c.op==='PARITY') {
    const v=valueOf(c.value,ctx,target); if(v===null) return 'PENDING';
    return (!c.nonZero||v!==0) && (c.parity==='EVEN'?v%2===0:Math.abs(v%2)===1)?'WON':'LOST';
  }
  if(c.op==='BETWEEN') {
    const v=valueOf(c.value,ctx,target),min=valueOf(c.min,ctx,target),max=valueOf(c.max,ctx,target);
    if(v===null||min===null||max===null) return 'PENDING';
    return min<=max&&v>=min&&v<=max?'WON':'LOST';
  }
  const a=valueOf(c.left,ctx,target),b=valueOf(c.right,ctx,target);
  if(a===null||b===null) return 'PENDING';
  if(c.nonZero&&a===0&&b===0) return 'LOST';
  const won={EQ:a===b,NE:a!==b,GT:a>b,GTE:a>=b,LT:a<b,LTE:a<=b}[c.op];
  return won?'WON':'LOST';
}
export function evaluatePrediction(template: Template, context: EvaluationContext): Evaluation {
  if(!context.players.some(x=>x.playerId===context.target.playerId)) return 'VOID';
  return evaluateCondition(template.condition,context);
}
export interface PredictionRules {
  version: number; maxAssignments: number; desiredDistribution: Record<Difficulty,number>;
  weights: Record<Difficulty,number>; probabilityThresholds:{common:number;uncommon:number;rare:number;epic:number};
  minIndividualSample: number; historyWindow: number; rotationWindow: number; minAccuracyBasisPoints: number;
  multipliers: readonly { wins: number; basisPoints: number; name: string }[];
}
export const PREDICTION_RULES: Readonly<PredictionRules> = Object.freeze({
  version:2,maxAssignments:5,desiredDistribution:{COMMON:2,UNCOMMON:1,RARE:1,EPIC:1,LEGENDARY:0},
  weights:DIFFICULTY_WEIGHT,probabilityThresholds:{common:0.65,uncommon:0.45,rare:0.25,epic:0.10},
  minIndividualSample:10,historyWindow:20,rotationWindow:3,minAccuracyBasisPoints:7000,
  multipliers:[{wins:5,basisPoints:20000,name:'Nostradamus'},{wins:4,basisPoints:15000,name:'Cinquina del profeta'},
    {wins:3,basisPoints:12500,name:'Tripletta del profeta'}],
});
export function scorePredictions(results: readonly { result: Evaluation; weight: number }[], rules: PredictionRules = PREDICTION_RULES) {
  const won=results.filter(x=>x.result==='WON'),lost=results.filter(x=>x.result==='LOST');
  const positive=won.reduce((s,x)=>s+x.weight,0),negative=lost.reduce((s,x)=>s+x.weight,0);
  const base=positive-negative; const resolved=results.every(x=>x.result!=='PENDING');
  const eligible=resolved&&base>0&&won.length>=3&&won.length*10000>=(won.length+lost.length)*rules.minAccuracyBasisPoints;
  const multiplier=eligible?(rules.multipliers.find(x=>won.length>=x.wins)?.basisPoints??10000):10000;
  // 1/10000 point units: exact for quarter-point multipliers, no binary floating-point arithmetic.
  const finalUnits=base*multiplier;
  return { won:won.length,lost:lost.length,void:results.filter(x=>x.result==='VOID').length,
    positive,negative,base,multiplierBasisPoints:multiplier,bonusUnits:finalUnits-base*10000,finalUnits,
    accuracyBasisPoints:won.length+lost.length?Math.floor(won.length*10000/(won.length+lost.length)):null,resolved };
}
