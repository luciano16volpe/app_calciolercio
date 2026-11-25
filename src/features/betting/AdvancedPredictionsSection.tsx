import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useRole } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { advancedBoardKey, selectAdvancedPrediction, useAdvancedAdminResults, useAdvancedParticipation, useAdvancedBalance, useAdvancedBoard, useAdvancedEnabled, useAdvancedHistory, useAdvancedLeaderboard, useAdvancedStats, type AdvancedAssignment, type AdvancedHistoryFilters } from '../../data/advancedPredictions';
import { photoUrl } from '../../data/queries';
import { scorePredictions, type Difficulty } from '../../domain/advancedPredictions';
import { formatDate } from '../../domain/format';
import { seasonOf } from '../../domain/seasons';
import { PREDICTION_FEATS, predictionFeats } from '../../domain/awards';
import type { BettingMatch } from '../../data/betting';

const difficultyLabel:Record<Difficulty,string>={COMMON:'Comune',UNCOMMON:'Non comune',RARE:'Raro',EPIC:'Epico',LEGENDARY:'Leggendario'};
const categoryLabel:Record<string,string>={GOALS:'Gol',ASSISTS:'Assist',OWN_GOALS:'Autogol',METAS:'Mete',COMPARISONS:'Confronti',RANKINGS:'Classifiche',SPECIAL:'Speciali',RATINGS:'Pagelle',RATING_RANKINGS:'Classifiche pagelle',RATING_SPECIAL:'Speciali con voto'};
const points=(units:number)=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(units/10000);

function PredictionCard({assignment,matchId,canSelect}:{assignment:AdvancedAssignment;matchId:string;canSelect:boolean}){
  const {user}=useAuth();const toast=useToast();const qc=useQueryClient();const [busy,setBusy]=useState(false);
  const selected=assignment.selected_at!==null;
  const change=async()=>{if(busy)return;setBusy(true);try{
    await selectAdvancedPrediction(assignment.id,!selected);
    await qc.invalidateQueries({queryKey:advancedBoardKey(user?.id,matchId)});
    toast(selected?'Pronostico rimosso':'Pronostico selezionato');
  }catch(error){toast((error as Error).message);}finally{setBusy(false);}};
  const outcome=assignment.result?.outcome;
  const status=outcome==='WON'?'Indovinato':outcome==='LOST'?'Sbagliato':outcome==='VOID'?'Annullato':
    selected?'In attesa di validazione':'Non selezionato';
  return <article className={`advanced-prediction-card difficulty-${assignment.difficulty.toLowerCase()} outcome-${(outcome??'pending').toLowerCase()}`}>
    <div className="advanced-prediction-person"><PlayerAvatar name={assignment.target_name??'Avversario'} photo={photoUrl(assignment.photo_path)} />
      <div><strong>{assignment.target_name??'Avversario'}</strong><span>{categoryLabel[assignment.category]??assignment.category}</span></div></div>
    <h4>{assignment.description}</h4>
    <div className="advanced-prediction-meta"><span className="difficulty-tag">{difficultyLabel[assignment.difficulty]}</span>
      <span>Se indovini <b>+{assignment.weight}</b> pt</span><span>Se sbagli <b>−{assignment.weight}</b> pt</span></div>
    {assignment.estimation_method==='INDIVIDUAL'&&assignment.historical_sample_size>=5&&assignment.estimated_probability!==null?
      <p className="betting-hint">Frequenza storica stimata: {Math.round(assignment.estimated_probability*100)}% su {assignment.historical_sample_size} partite valutabili. Indicativa, non garantita.</p>:
      null}
    {assignment.result?<p className="advanced-prediction-result"><b>{status} · {points(assignment.result.points_units)} pt</b><br />{assignment.result.reason}<br />
      Risultato: {(['goals','assists','ownGoals','metas','rating'] as const).map(key=>`${{goals:'gol',assists:'assist',ownGoals:'autogol',metas:'mete',rating:'voto'}[key]} ${assignment.result?.observed_values?.[key]??'—'}`).join(' · ')}</p>:
      <p className="advanced-prediction-result">{status}</p>}
    {canSelect&&assignment.status!=='EXPIRED'?<button type="button" className={`btn ${selected?'':'btn-primary'}`} disabled={busy} aria-pressed={selected}
      onClick={()=>void change()}>{busy?'Salvataggio…':selected?'Deseleziona':'Seleziona pronostico'}</button>:null}
  </article>;
}

function MatchPredictions({match}:{match:BettingMatch}){
  const board=useAdvancedBoard(match.match_id);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer);},[]);
  const romeNow=now.toLocaleString('sv-SE',{timeZone:'Europe/Rome',hour12:false}).replace(' ','T');
  const kickoff=match.play_time?`${match.date}T${match.play_time.slice(0,8)}`:null;
  const minutesLeft=kickoff?Math.max(0,Math.ceil((new Date(kickoff).getTime()-new Date(romeNow).getTime())/60000)):null;
  const assignments=board.data?.assignments??[];
  const selected=assignments.filter(x=>x.selected_at!==null);
  const simulated=scorePredictions(selected.map(x=>({result:'WON' as const,weight:x.weight})));
  const weight=selected.reduce((s,x)=>s+x.weight,0);
  return <div className="advanced-prediction-match">
    {board.isPending?<div className="card">Caricamento pronostici personalizzati…</div>:null}
    {board.isError?<div className="card" role="alert">Pronostici non disponibili per questa partita. <button type="button" onClick={()=>void board.refetch()}>Riprova</button></div>:null}
    {board.isSuccess?<>
      <div className="card"><h3>Partita del {formatDate(match.date)}</h3><p>{match.play_time?`Ore ${match.play_time.slice(0,5)}`:'Orario da definire'} · Blu contro Bianchi</p>
        <p><b>{selected.length}/{assignments.length}</b> pronostici selezionati</p>
        {board.data.replacedCount?<p role="status">{board.data.replacedCount} pronostici sostituiti dopo la modifica delle squadre. Le nuove scelte non sono selezionate automaticamente.</p>:null}
        {board.data.isOpen?<p>Chiusura tra {minutesLeft===null?'—':minutesLeft>=1440?`${Math.floor(minutesLeft/1440)} giorni e ${Math.floor(minutesLeft%1440/60)} ore`:
          `${Math.floor(minutesLeft/60)} ore e ${minutesLeft%60} minuti`}.</p>:<p>Selezioni chiuse. I pronostici scelti sono in sola lettura.</p>}
        <div className="advanced-prediction-risk"><span>Massimo base: <b>+{weight}</b></span><span>Minimo: <b>−{weight}</b></span>
          <span>Moltiplicatore ideale: <b>×{points(simulated.multiplierBasisPoints)}</b></span>
          <span>Massimo teorico: <b>+{points(simulated.finalUnits)}</b></span></div>
        <p className="betting-hint">Difficoltà scelte: {Object.entries(difficultyLabel).map(([code,label])=>`${label} ${selected.filter(x=>x.difficulty===code).length}`).join(' · ')}</p>
        <details><summary>Come funzionano i moltiplicatori</summary><p>3 indovinati ×1,25 · 4 ×1,50 · 5 su 5 ×2.</p>
          <p>Servono almeno il 70% di precisione e un saldo base positivo. Il bonus si applica solo al saldo netto.</p></details>
        <small>Il massimo è teorico: condizioni correlate possono renderlo irraggiungibile.</small>
      </div>
      {board.data.summary?<div className="card"><h3>Risultato dei pronostici</h3>
        <p>{board.data.summary.selected_count} giocati · {board.data.summary.won_count} indovinati · {board.data.summary.lost_count} sbagliati · {board.data.summary.void_count} annullati</p>
        <p>Precisione {board.data.summary.won_count+board.data.summary.lost_count?
          Math.round(board.data.summary.won_count*100/(board.data.summary.won_count+board.data.summary.lost_count))+'%':'—'}</p>
        <p>Punti positivi {points(board.data.summary.positive_units)} · Punti persi −{points(board.data.summary.negative_units)} · Saldo base {points(board.data.summary.base_units)}</p>
        <p>Bonus {points(board.data.summary.bonus_units)} · Moltiplicatore ×{points(board.data.summary.multiplier_basis_points)}</p>
        <strong className={board.data.summary.multiplier_basis_points>10000?'advanced-multiplier-activated':''}>Punteggio finale: {points(board.data.summary.final_units)} pt</strong></div>:null}
      <div className="advanced-prediction-grid">{assignments.map(x=><PredictionCard key={x.id} assignment={x} matchId={match.match_id} canSelect={!!board.data.isOpen} />)}</div>
      {!assignments.length?<div className="card">Non ci sono condizioni compatibili per questa partita.</div>:null}
    </>:null}
  </div>;
}

const boards=[['PROFETA','Il Profeta del CalcioLercio'],['CHIRURGO','Il Chirurgo'],['CORAGGIOSO','Il Coraggioso'],
  ['ORACOLO','L’Oracolo'],['COMBO','Il Re delle Combo'],['VEGGENTE','Il Veggente'],['DISASTRO','Il Disastro']] as const;
function LeaderboardView({leagueId,season}:{leagueId:string;season:string}){
  const [kind,setKind]=useState<string>('PROFETA');
  const board=useAdvancedLeaderboard(leagueId,season,kind);
  return <div className="card"><h3>Classifiche</h3><label>Vista <select value={kind} onChange={e=>setKind(e.target.value)}>
    {boards.map(([code,title])=><option key={code} value={code}>{title}</option>)}</select></label>
    {board.isPending?<p>Caricamento classifica…</p>:board.isError?<p>Classifica non disponibile per questa lega.</p>:
      board.data.length?<ol className="advanced-leaderboard">{board.data.map(row=><li key={row.player_id}>
        <span>{row.position}º</span><PlayerAvatar name={row.name} photo={photoUrl(row.photo_path)} />
        <span><b>{row.name}</b><small>{row.won_count} indovinati · {Math.round(row.accuracy*100)}% precisione</small></span>
        <strong>{kind==='CHIRURGO'?`${Math.round(row.accuracy*100)}%`:kind==='CORAGGIOSO'?`★ ${Number(row.average_difficulty??0).toFixed(2)}`:
          kind==='ORACOLO'?`${row.oracle_wins} colpi`:kind==='COMBO'?`${points(row.bonus_units)} bonus`:
          kind==='VEGGENTE'?`${row.strong_matches} partite`:`${points(row.final_units)} pt`}</strong></li>)}</ol>:<p>Nessun giocatore classificato in questa stagione.</p>}
  </div>;
}
function StatsView({leagueId,season}:{leagueId:string;season:string}){
  const stats=useAdvancedStats(leagueId,season);
  if(stats.isPending)return <div className="card">Caricamento statistiche…</div>;
  if(stats.isError)return <div className="card">Statistiche non disponibili.</div>;
  const value=stats.data;
  const unlocked=predictionFeats(value);
  return <div className="card"><h3>Le mie statistiche</h3>
    <div className="advanced-prediction-risk"><span>Ricevuti <b>{value.received??0}</b></span><span>Scelti <b>{value.selected??0}</b></span>
      <span>Indovinati <b>{value.won??0}</b></span><span>Sbagliati <b>{value.lost??0}</b></span>
      <span>Annullati <b>{value.void??0}</b></span><span>Precisione ponderata <b>{value.weighted_accuracy??'—'}%</b></span></div>
    <h4>Per categoria</h4><ul>{Object.entries(value.categories??{}).map(([category,item])=><li key={category}>
      {categoryLabel[category]??category}: {item.won}/{item.validated} indovinati · {points(item.net_units)} pt</li>)}</ul>
    <h4>Per difficoltà</h4><ul>{Object.entries(value.difficulties??{}).map(([difficulty,item])=><li key={difficulty}>
      {difficultyLabel[difficulty as Difficulty]??difficulty}: {item.won}/{item.validated} indovinati · {points(item.net_units)} pt</li>)}</ul>
    <h4>Badge conquistati</h4>{unlocked.size?<div className="advanced-badges">{PREDICTION_FEATS.filter(x=>unlocked.has(x.k)).map(x=><span key={x.k} title={x.d}>{x.t}</span>)}</div>:
      <p>Il primo badge arriva con un pronostico indovinato.</p>}
  </div>;
}
function AdminResults({matchId}:{matchId:string}){
  const results=useAdvancedAdminResults(matchId);
  return <details className="card"><summary>Scelte dei partecipanti dopo la partita</summary>
    {results.isPending?<p>Caricamento…</p>:results.isError?<p>Scelte non disponibili.</p>:
      results.data.length?<ul>{results.data.map((item,index)=><li key={index}><b>{item.predictor}</b>: {item.description} · {item.outcome??'In attesa'}
        {item.points_units!==null?` · ${points(item.points_units)} pt`:''}</li>)}</ul>:<p>Nessuna scelta registrata o statistiche non ancora consolidate.</p>}
  </details>;
}
function AdminParticipation({matchId}:{matchId:string}){
  const participation=useAdvancedParticipation(matchId);
  return <details className="card"><summary>Partecipazione ai pronostici</summary>
    {participation.isPending?<p>Caricamento…</p>:participation.isError?<p>Partecipazione non disponibile.</p>:<>
      <p><b>{participation.data.count}</b> giocatori hanno scelto almeno un pronostico.</p>
      {participation.data.players.length?<ul>{participation.data.players.map(player=><li key={player.player_id}>{player.name}</li>)}</ul>:<p>Nessuna partecipazione registrata.</p>}
      <small>Le scelte restano segrete fino alla chiusura del sondaggio pagelle.</small>
    </>}
  </details>;
}
function AdminBalance({leagueId,season}:{leagueId:string;season:string}){
  const report=useAdvancedBalance(leagueId,season);
  return <details className="card"><summary>Bilanciamento dei pronostici</summary>
    {report.isPending?<p>Caricamento…</p>:report.isError?<p>Report non disponibile.</p>:<>
      <p>Partite con moltiplicatore: {report.data.multiplied_matches} · Stime con difficoltà iniziale: {report.data.default_estimates} · Punteggio medio: {report.data.average_final_units===null?'—':points(report.data.average_final_units)} pt</p>
      <ul>{report.data.by_difficulty.map(x=><li key={x.difficulty}>{difficultyLabel[x.difficulty]}: {x.assigned} assegnati, {x.selected} scelti, {x.won} indovinati, {x.lost} sbagliati, {x.void} annullati</li>)}</ul>
      <details><summary>Tipologie più estratte</summary><ul>{report.data.by_template.slice(0,20).map(x=><li key={x.template_id}>#{x.template_id} {x.template_code}: {x.assigned} assegnati, {x.selected} scelti, {x.won} indovinati</li>)}</ul></details>
    </>}
  </details>;
}
const emptyHistoryFilters:AdvancedHistoryFilters={season:null,match:null,category:null,target:null,difficulty:null,outcome:null};
function HistoryView({leagueId,matches,players}:{leagueId:string;matches:BettingMatch[];players:readonly {id:string;name:string}[]}){
  const [filters,setFilters]=useState<AdvancedHistoryFilters>(emptyHistoryFilters);
  const [offset,setOffset]=useState(0);
  const history=useAdvancedHistory(leagueId,filters,offset);
  const seasons=[...new Set(matches.map(x=>seasonOf(x.date)?.key).filter((x):x is string=>!!x))];
  const change=(key:keyof AdvancedHistoryFilters,value:string)=>{setFilters(current=>({...current,[key]:value||null}));setOffset(0);};
  return <details className="card"><summary>Storico dettagliato e filtri</summary>
    <div className="advanced-history-filters">
      <label>Stagione <select value={filters.season??''} onChange={e=>change('season',e.target.value)}><option value="">Tutte</option>{seasons.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Partita <select value={filters.match??''} onChange={e=>change('match',e.target.value)}><option value="">Tutte</option>{matches.map(x=><option key={x.match_id} value={x.match_id}>{formatDate(x.date)}</option>)}</select></label>
      <label>Categoria <select value={filters.category??''} onChange={e=>change('category',e.target.value)}><option value="">Tutte</option>{Object.entries(categoryLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Avversario <select value={filters.target??''} onChange={e=>change('target',e.target.value)}><option value="">Tutti</option>{players.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Difficoltà <select value={filters.difficulty??''} onChange={e=>change('difficulty',e.target.value)}><option value="">Tutte</option>{Object.entries(difficultyLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Esito <select value={filters.outcome??''} onChange={e=>change('outcome',e.target.value)}><option value="">Tutti</option>{['WON','LOST','VOID','PENDING','EXPIRED'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    </div>
    {history.isPending?<p>Caricamento storico…</p>:history.isError?<p>Storico non disponibile.</p>:
      history.data.length?<ul>{history.data.map(x=><li key={x.assignment_id}><b>{formatDate(x.date)} · {x.target_name}</b>: {x.description}
        <span> · {x.outcome??x.status}{x.points_units!==null?` · ${points(x.points_units)} pt`:''}</span></li>)}</ul>:<p>Nessun pronostico per questi filtri.</p>}
    <div className="advanced-history-pages"><button type="button" className="btn" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Precedenti</button>
      <span>Pagina {Math.floor(offset/50)+1}</span><button type="button" className="btn" disabled={!history.data||history.data.length<50} onClick={()=>setOffset(offset+50)}>Successivi</button></div>
  </details>;
}

export function AdvancedPredictionsSection({leagueId,matches,players}:{leagueId:string;matches:BettingMatch[];players:readonly {id:string;name:string}[]}){
  const {isAdmin}=useRole(leagueId);const enabled=useAdvancedEnabled(leagueId);
  const [matchId,setMatchId]=useState('');
  const [view,setView]=useState<'upcoming'|'results'|'leaderboard'|'stats'>('upcoming');
  const seasons=[...new Map(matches.map(x=>seasonOf(x.date)).filter(x=>x!==null).map(x=>[x.key,x])).values()];
  const [chosenSeason,setChosenSeason]=useState('');
  const season=seasons.find(x=>x.key===chosenSeason)??seasons[0];
  const upcoming=matches.filter(x=>x.score_a===null&&x.score_b===null);
  const finished=matches.filter(x=>x.score_a!==null&&x.score_b!==null);
  const visible=view==='results'?finished:upcoming;
  const current=visible.find(x=>x.match_id===matchId)??visible[0];
  if(!enabled.data)return null;
  return <section className="advanced-predictions-section"><h2>Pronostici sui giocatori avversari</h2>
    <p>Scegli liberamente fino a cinque condizioni. Nessuna puntata in denaro.</p>
    <div className="advanced-view-tabs" role="tablist" aria-label="Viste pronostici">
      {([['upcoming','Prossima partita'],['results','Risultati'],['leaderboard','Classifiche'],['stats','Le mie statistiche']] as const)
        .map(([key,label])=><button type="button" key={key} role="tab" aria-selected={view===key} className={view===key?'selected':''}
          onClick={()=>setView(key)}>{label}</button>)}</div>
    {(view==='upcoming'||view==='results')?<>{visible.length?<><label className="advanced-prediction-picker">Partita <select value={current?.match_id??''} onChange={e=>setMatchId(e.target.value)}>
      {visible.map(x=><option key={x.match_id} value={x.match_id}>{formatDate(x.date)}</option>)}</select></label>
      {current?<MatchPredictions key={current.match_id} match={current}/>:null}</>:<div className="card">Nessuna partita disponibile.</div>}</>:null}
    {(view==='upcoming'||view==='results')&&isAdmin&&current?<AdminParticipation matchId={current.match_id}/>:null}
    {view==='results'&&isAdmin&&current?<AdminResults matchId={current.match_id}/>:null}
    {view==='results'?<HistoryView leagueId={leagueId} matches={matches} players={players}/>:null}
    {(view==='leaderboard'||view==='stats')&&season?<><label className="advanced-prediction-picker">Stagione <select value={season.key} onChange={e=>setChosenSeason(e.target.value)}>
      {seasons.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
      {view==='leaderboard'?<><LeaderboardView leagueId={leagueId} season={season.key}/>{isAdmin?<AdminBalance leagueId={leagueId} season={season.key}/>:null}</>:
        <StatsView leagueId={leagueId} season={season.key}/>}</>:null}
  </section>;
}
