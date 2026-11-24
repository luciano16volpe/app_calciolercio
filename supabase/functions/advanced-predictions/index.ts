import { createClient } from 'npm:@supabase/supabase-js@2';
import { canonicalGroupFor, generateAssignmentDraft, type Candidate } from '../_shared/predictionGeneration.ts';
import { PREDICTION_CATALOG, evaluatePrediction, type Performance, type PredictionRules, type Template } from '../_shared/advancedPredictions.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-cron-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
type MatchRow={id:string;league_id:string;date:string;play_time:string|null;score_a:number|null;score_b:number|null};
type RawPerformance={match_id:string;player_id:string;team:'A'|'B';goals:number|null;assist:number|null;autogol:number|null;meta:number|null;rating:number|null};
const convert=(row:RawPerformance):Performance=>({playerId:row.player_id,team:row.team,goals:row.goals,assists:row.assist,ownGoals:row.autogol,metas:row.meta,rating:row.rating});

async function loadHistory(m:MatchRow){
  const {data:older,error:olderError}=await admin.from('matches').select('id,date').eq('league_id',m.league_id)
    .lt('date',m.date).not('score_a','is',null).not('score_b','is',null).order('date',{ascending:false}).limit(100);
  if(olderError)throw olderError;
  const olderIds=(older??[]).map(x=>x.id);
  if(!olderIds.length)return [];
  const [pastRows,polls]=await Promise.all([
    admin.from('match_players').select('match_id,player_id,team,goals,assist,autogol,meta,rating').in('match_id',olderIds),
    admin.from('community_vote_settings').select('match_id,finalized_at').in('match_id',olderIds),
  ]);
  if(pastRows.error||polls.error)throw pastRows.error??polls.error;
  const finalized=new Set((polls.data??[]).filter(x=>x.finalized_at).map(x=>x.match_id));
  const hasPoll=new Set((polls.data??[]).map(x=>x.match_id));
  const historical=((pastRows.data??[]) as RawPerformance[]).filter(x=>!hasPoll.has(x.match_id)||finalized.has(x.match_id));
  const byMatch=new Map<string,Performance[]>();
  for(const row of historical)byMatch.set(row.match_id,[...(byMatch.get(row.match_id)??[]),convert(row)]);
  const order=new Map(olderIds.map((id,index)=>[id,index]));
  const dateById=new Map((older??[]).map(x=>[x.id,x.date]));
  return historical.sort((a,b)=>(order.get(a.match_id)??999)-(order.get(b.match_id)??999))
    .map(row=>({target:convert(row),players:byMatch.get(row.match_id)??[],date:dateById.get(row.match_id)??''}));
}

function seasonKey(date:string){const year=Number(date.slice(0,4));const month=Number(date.slice(5,7));
  return month>=3&&month<=5?`${year}-PRI`:month>=6&&month<=8?`${year}-EST`:
    month>=9&&month<=11?`${year}-AUT`:`${month<3?year-1:year}-INV`;}
function draftPayload(draft:ReturnType<typeof generateAssignmentDraft>,people:{id:string;name:string}[],
  history:Awaited<ReturnType<typeof loadHistory>>,matchDate:string){
  return draft.map(x=>{const past=history.filter(row=>row.target.playerId===x.target.playerId);
    const recent=past.slice(0,20).map(row=>row.target);
    const season=past.filter(row=>seasonKey(row.date)===seasonKey(matchDate)).map(row=>row.target);
    return {target_player_id:x.target.playerId,template_id:x.template.id,
    template_code:x.template.code,category:x.template.category,
    description:`${people.find(p=>p.id===x.target.playerId)?.name??'Avversario'}: ${x.description}`,
    condition:x.template.condition,parameters:x.parameters,difficulty:x.estimate.difficulty,weight:x.estimate.weight,
    estimated_probability:x.estimate.probability,historical_sample_size:x.estimate.sampleSize,
    estimation_method:x.estimate.method,historical_snapshot:{sampleSize:x.estimate.sampleSize,recent,season}};});
}

async function loadRules(matchId:string):Promise<{version:number;rules:PredictionRules}>{
  const frozen=await admin.from('advanced_prediction_match_rules').select('configuration_version,rules_snapshot').eq('match_id',matchId).maybeSingle();
  if(frozen.error)throw frozen.error;
  if(frozen.data)return {version:frozen.data.configuration_version,rules:frozen.data.rules_snapshot as PredictionRules};
  const latest=await admin.from('advanced_prediction_configurations').select('version,rules').order('version',{ascending:false}).limit(1).single();
  if(latest.error)throw latest.error;
  return {version:latest.data.version,rules:latest.data.rules as PredictionRules};
}

async function board(matchId:string,userId:string){
  const {data:match,error:matchError}=await admin.from('matches').select('id,league_id,date,play_time,score_a,score_b').eq('id',matchId).maybeSingle();
  if(matchError)throw matchError;
  if(!match)return reply({error:'Partita non trovata'},404);
  const m=match as MatchRow;
  const localNow=new Date().toLocaleString('sv-SE',{timeZone:'Europe/Rome',hour12:false});
  const kickoff=m.play_time?`${m.date} ${m.play_time.slice(0,8)}`:null;
  const isOpen=!!kickoff&&localNow<kickoff&&m.score_a===null&&m.score_b===null;
  const [{data:member,error:memberError},{data:settings,error:settingsError}]=await Promise.all([
    admin.from('league_members').select('role').eq('league_id',m.league_id).eq('user_id',userId).maybeSingle(),
    admin.from('advanced_prediction_league_settings').select('enabled').eq('league_id',m.league_id).maybeSingle(),
  ]);
  if(memberError||settingsError)throw memberError??settingsError;
  if(!member)return reply({error:'Permesso negato'},403);
  if(!settings?.enabled)return reply({error:'Pronostici avanzati non attivi'},404);
  const {data:raw,error:rowsError}=await admin.from('match_players').select('match_id,player_id,team,goals,assist,autogol,meta,rating').eq('match_id',matchId);
  if(rowsError)throw rowsError;
  const rows=(raw??[]) as RawPerformance[];
  const ids=rows.map(x=>x.player_id);
  if(!ids.length)return reply({error:'Formazioni non definite'},409);
  const [{data:people,error:peopleError},{data:leaguePlayers,error:leagueError},{data:poll,error:pollError}]=await Promise.all([
    admin.from('players').select('id,name,user_id,photo_path').in('id',ids),
    admin.from('league_players').select('player_id').eq('league_id',m.league_id).in('player_id',ids),
    admin.from('formation_polls').select('finalized_at').eq('match_id',matchId).maybeSingle(),
  ]);
  if(peopleError||leagueError||pollError)throw peopleError??leagueError??pollError;
  const predictorRow=rows.find(x=>people?.some(p=>p.id===x.player_id&&p.user_id===userId));
  if(!predictorRow)return reply({error:'Non partecipi alla partita'},403);
  const existing=await admin.from('advanced_prediction_generations').select('match_id').eq('match_id',matchId).eq('predictor_player_id',predictorRow.player_id).maybeSingle();
  if(existing.error)throw existing.error;
  if(!existing.data){
    if(poll&&!poll.finalized_at)return reply({error:'Formazioni ancora in votazione'},409);
    if(!m.play_time||m.score_a!==null||m.score_b!==null)return reply({error:'Selezioni chiuse'},409);
    // The database performs the authoritative Europe/Rome kickoff check while holding the match row lock.
    const {version,rules}=await loadRules(matchId);
    const snapshots=await loadHistory(m);
    const recent=await admin.from('advanced_prediction_assignments').select('template_code,target_player_id')
      .eq('league_id',m.league_id).eq('predictor_player_id',predictorRow.player_id)
      .neq('match_id',matchId).order('assigned_at',{ascending:false}).limit(30);
    if(recent.error)throw recent.error;
    const draft=generateAssignmentDraft({predictor:convert(predictorRow),players:rows.map(convert),
      ownLeaguePlayerIds:new Set((leaguePlayers??[]).map(x=>x.player_id)),historicalMatches:snapshots,
      leagueHistoricalMatches:snapshots,recentAssignments:(recent.data??[]).map(x=>({templateCode:x.template_code,targetPlayerId:x.target_player_id})),
      seed:`${matchId}:${predictorRow.player_id}:v${version}`,matchDate:m.date,rules,allowRatings:true});
    const payload=draftPayload(draft,people??[],snapshots,m.date);
    const stored=await admin.rpc('advanced_prediction_generate',{p_match:matchId,p_predictor:predictorRow.player_id,p_configuration_version:version,p_rows:payload});
    if(stored.error)return reply({error:stored.error.message},409);
  }else if(isOpen){
    const prior=await admin.from('advanced_prediction_assignments')
      .select('template_id,template_code,target_player_id,parameters_snapshot,difficulty,weight,estimated_probability,historical_sample_size,estimation_method,status')
      .eq('match_id',matchId).eq('predictor_player_id',predictorRow.player_id);
    if(prior.error)throw prior.error;
    const byId=new Map(rows.map(x=>[x.player_id,convert(x)]));
    const groups=new Set<string>();const preserved:Candidate[]=[];
    let incompatible=false;
    for(const old of prior.data??[]){
      const template=PREDICTION_CATALOG.find(x=>x.id===old.template_id);
      if(!template)continue;
      const group=canonicalGroupFor(old.target_player_id,template);
      groups.add(group);
      const target=byId.get(old.target_player_id);
      if(old.status==='AVAILABLE'||old.status==='SELECTED'){
        if(!target||target.team===predictorRow.team||!(leaguePlayers??[]).some(x=>x.player_id===target.playerId)){incompatible=true;continue;}
        preserved.push({template,target,parameters:old.parameters_snapshot??{},estimate:{
          difficulty:old.difficulty,weight:old.weight,probability:old.estimated_probability,
          sampleSize:old.historical_sample_size,method:old.estimation_method},recentAssignments:0,
          canonicalGroup:group,conflictFields:template.requiredFields});
      }
    }
    if(incompatible){
      const {version,rules}=await loadRules(matchId);
      const snapshots=await loadHistory(m);
      const draft=generateAssignmentDraft({predictor:convert(predictorRow),players:rows.map(convert),
        ownLeaguePlayerIds:new Set((leaguePlayers??[]).map(x=>x.player_id)),historicalMatches:snapshots,
        leagueHistoricalMatches:snapshots,seed:`${matchId}:${predictorRow.player_id}:v${version}:replace`,matchDate:m.date,rules,allowRatings:true},
        preserved,groups);
      const refreshed=await admin.rpc('advanced_prediction_refresh',{p_match:matchId,p_predictor:predictorRow.player_id,p_rows:draftPayload(draft,people??[],snapshots,m.date)});
      if(refreshed.error)return reply({error:refreshed.error.message},409);
    }
  }
  const {data:assignments,error:assignmentsError}=await admin.from('advanced_prediction_assignments')
    .select('id,template_id,template_code,category,description,difficulty,weight,estimated_probability,historical_sample_size,estimation_method,status,selected_at,target_player_id,parameters_snapshot')
    .eq('match_id',matchId).eq('predictor_player_id',predictorRow.player_id).order('assigned_at');
  if(assignmentsError)throw assignmentsError;
  const assignmentIds=(assignments??[]).map(x=>x.id);
  const [resultRows,summaryRow,readyRow]=await Promise.all([
    assignmentIds.length?admin.from('advanced_prediction_results').select('assignment_id,outcome,points_units,reason,observed_values').in('assignment_id',assignmentIds):Promise.resolve({data:[],error:null}),
    admin.from('advanced_prediction_match_summaries').select('*').eq('match_id',matchId).eq('predictor_player_id',predictorRow.player_id).maybeSingle(),
    admin.rpc('advanced_prediction_ready',{p_match:matchId}),
  ]);
  if(resultRows.error||summaryRow.error||readyRow.error)throw resultRows.error??summaryRow.error??readyRow.error;
  const results=new Map((resultRows.data??[]).map(x=>[x.assignment_id,x]));
  const personById=new Map((people??[]).map(x=>[x.id,x]));
  const replacedCount=(assignments??[]).filter(x=>x.status==='VOID'&&x.selected_at===null).length;
  const decorated=(assignments??[]).filter(x=>!(x.status==='VOID'&&x.selected_at===null))
    .map(x=>({...x,target_name:personById.get(x.target_player_id)?.name,
    photo_path:personById.get(x.target_player_id)?.photo_path,result:results.get(x.id)??null}));
  return reply({matchId,assignments:decorated,replacedCount,summary:summaryRow.data,isOpen,ready:!!readyRow.data});
}

async function reconcileMatch(matchId:string){
  const [{data:match,error:matchError},{data:raw,error:playersError},{data:assignments,error:assignmentsError}]=await Promise.all([
    admin.from('matches').select('id,league_id,score_a,score_b').eq('id',matchId).maybeSingle(),
    admin.from('match_players').select('match_id,player_id,team,goals,assist,autogol,meta,rating').eq('match_id',matchId),
    admin.from('advanced_prediction_assignments').select('id,template_id,template_code,category,condition_snapshot,target_player_id,predictor_player_id,parameters_snapshot,historical_snapshot,selected_at')
      .eq('match_id',matchId).not('selected_at','is',null),
  ]);
  if(matchError||playersError||assignmentsError)throw matchError??playersError??assignmentsError;
  if(!match||match.score_a===null||match.score_b===null)return;
  const rows=(raw??[]) as RawPerformance[];
  const performances=rows.map(convert);
  const outcomes=(assignments??[]).map(a=>{
    const target=performances.find(x=>x.playerId===a.target_player_id);
    const predictor=performances.find(x=>x.playerId===a.predictor_player_id);
    let outcome:'WON'|'LOST'|'VOID'='VOID';
    let reason='Giocatore assente o squadra modificata';
    if(target&&predictor&&target.team!==predictor.team){
      const template={id:a.template_id,code:a.template_code,category:a.category,
        condition:a.condition_snapshot,defaultDifficulty:'COMMON',ratingDependent:false,historicalRequired:false} as Template;
      const snapshot=a.historical_snapshot as {recent?:Performance[];season?:Performance[]}|null;
      const history=[124,125,128,129].includes(a.template_id)?snapshot?.season:snapshot?.recent;
      const evaluated=evaluatePrediction(template,{target,players:performances,parameters:a.parameters_snapshot,history:history??[]});
      outcome=evaluated==='PENDING'?'VOID':evaluated;
      reason=evaluated==='PENDING'?'Dato ufficiale non disponibile':evaluated==='VOID'?'Condizione non valutabile':
        evaluated==='WON'?'Condizione verificata':'Condizione non verificata';
    }
    return {assignment_id:a.id,outcome,reason,observed_values:target?{
      goals:target.goals,assists:target.assists,ownGoals:target.ownGoals,metas:target.metas,rating:target.rating}: {}};
  });
  const result=await admin.rpc('advanced_prediction_reconcile',{p_match:matchId,p_results:outcomes});
  if(result.error)throw result.error;
}

async function reconcileDirty(){
  const {data:dirty,error}=await admin.from('advanced_prediction_dirty_matches').select('match_id').order('changed_at').limit(25);
  if(error)throw error;
  let completed=0;
  for(const row of dirty??[]){
    const {data:ready,error:readyError}=await admin.rpc('advanced_prediction_ready',{p_match:row.match_id});
    if(readyError)throw readyError;
    if(!ready)continue;
    await reconcileMatch(row.match_id);completed++;
  }
  return reply({completed});
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Metodo non valido'},405);
  const cronSecret=req.headers.get('x-cron-secret');
  if(cronSecret){
    if(!Deno.env.get('CRON_SECRET')||cronSecret!==Deno.env.get('CRON_SECRET'))return reply({error:'Non autorizzato'},401);
    try{return await reconcileDirty();}catch(error){console.error('advanced-predictions-reconcile',error);return reply({error:'Ricalcolo non riuscito'},500);}
  }
  const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,'');
  const {data:identity,error:authError}=await admin.auth.getUser(token);
  if(authError||!identity.user)return reply({error:'Devi accedere'},401);
  const body=await req.json().catch(()=>null) as {action?:string;matchId?:string}|null;
  if(!body?.matchId||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(body.matchId))return reply({error:'Partita non valida'},400);
  try{
    if(body.action==='board')return await board(body.matchId,identity.user.id);
    return reply({error:'Azione non valida'},400);
  }catch(error){
    console.error('advanced-predictions',error);
    return reply({error:'Operazione non riuscita'},500);
  }
});
