import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/Toast';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { advancedBoardKey, selectAdvancedPrediction, useAdvancedBoard, useAdvancedEnabled, useAdvancedHistory, useAdvancedLeaderboard, useAdvancedStats, type AdvancedAssignment, type AdvancedHistoryFilters } from '../../data/advancedPredictions';
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
    toast(selected?'Giocata rimossa':'Giocata selezionata');
  }catch(error){toast((error as Error).message);}finally{setBusy(false);}};
  const outcome=assignment.result?.outcome;
  const status=outcome==='WON'?'Indovinato':outcome==='LOST'?'Sbagliato':outcome==='VOID'?'Annullato':
    selected?'In attesa di verifica':'Non giocata';
  const name=assignment.target_name??'Avversario';
  const text=assignment.description.startsWith(`${name}: `)?assignment.description.slice(name.length+2):assignment.description;
  const observed=assignment.result?(['goals','assists','ownGoals','metas','rating'] as const).map(key=>`${{goals:'gol',assists:'assist',ownGoals:'autogol',metas:'mete',rating:'voto'}[key]} ${assignment.result?.observed_values?.[key]??'—'}`).join(' · '):'';
  return <article className={`advanced-prediction-card difficulty-${assignment.difficulty.toLowerCase()} outcome-${(outcome??'pending').toLowerCase()}${selected?' is-selected':''}`}>
    <div className="advanced-prediction-person"><PlayerAvatar name={name} photo={photoUrl(assignment.photo_path)} />
      <strong>{name}</strong><span>{categoryLabel[assignment.category]??assignment.category}</span>
      {canSelect&&assignment.status!=='EXPIRED'?<button type="button" role="switch" aria-checked={selected} aria-label={`Gioca la Bet su ${name}`}
        className={`bet-switch${selected?' on':''}`} disabled={busy} onClick={()=>void change()}><span className="bet-switch-knob" /></button>:null}</div>
    <h4>{text}</h4>
    <div className="advanced-prediction-meta"><span className="difficulty-tag">{difficultyLabel[assignment.difficulty]}</span>
      <span><b>+{assignment.weight}</b> / <b>−{assignment.weight}</b> pt</span>
      <span className="advanced-prediction-result">{assignment.result?`${status} · ${points(assignment.result.points_units)} pt`:selected?'Giocata':''}</span></div>
    {assignment.result?<small className="advanced-prediction-detail">{assignment.result.reason} · {observed}</small>:null}
  </article>;
}

/** Punteggio massimo possibile della giocata: 1-X-2 e risultato esatto già salvati + i pronostici sui giocatori scelti. */
export function simulateGiocata(match:BettingMatch,selectedWeights:readonly number[]){
  const mine=match.my_prediction;
  const items=[...(mine?[{result:'WON' as const,weight:3}]:[]),...(mine&&mine.score_a!==null?[{result:'WON' as const,weight:5}]:[]),
    ...selectedWeights.map(weight=>({result:'WON' as const,weight}))];
  return scorePredictions(items);
}

const outcomeShort:Record<'1'|'X'|'2',string>={'1':'Blu',X:'Pari','2':'Bianchi'};
/** Barra fissa in basso: a colpo d'occhio cosa hai già giocato. */
export function GiocataBar({match,outcome,scoreA,scoreB,status}:{match:BettingMatch;outcome:'1'|'X'|'2'|null;scoreA:number|null;scoreB:number|null;status:'idle'|'saving'|'saved'|'error'}){
  const board=useAdvancedBoard(match.match_id);
  const assignments=board.data?.assignments??[];
  const selected=assignments.filter(x=>x.selected_at!==null);
  const max=simulateGiocata(match,selected.map(x=>x.weight)).finalUnits;
  return <div className="giocata-bar" role="status">
    <div className="giocata-bar-items">
      <span className={outcome?'done':''}>{outcome?'✓':'○'} 1-X-2 {outcome?`${outcomeShort[outcome]}${scoreA!==null&&scoreB!==null?` ${scoreA}-${scoreB}`:''}`:'da scegliere'}</span>
      {board.isSuccess&&assignments.length?<span className={selected.length?'done':''}>{selected.length?'✓':'○'} Giocatori {selected.length}/{assignments.length}</span>:null}
    </div>
    <div className="giocata-bar-end"><b>fino a +{points(max)} pt</b>
      <small>{status==='saving'?'Salvo…':status==='saved'?'Salvato ✓':status==='error'?'Non salvato':''}</small></div>
  </div>;
}

export function MatchPredictions({match,embedded=false}:{match:BettingMatch;embedded?:boolean}){
  const board=useAdvancedBoard(match.match_id);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer);},[]);
  const romeNow=now.toLocaleString('sv-SE',{timeZone:'Europe/Rome',hour12:false}).replace(' ','T');
  const kickoff=match.play_time?`${match.date}T${match.play_time.slice(0,8)}`:null;
  const minutesLeft=kickoff?Math.max(0,Math.ceil((new Date(kickoff).getTime()-new Date(romeNow).getTime())/60000)):null;
  const assignments=board.data?.assignments??[];
  const selected=assignments.filter(x=>x.selected_at!==null);
  // la giocata unica: 1-X-2 (3 pt) e risultato esatto (5 pt) contano insieme ai pronostici sui giocatori
  const simulated=simulateGiocata(match,selected.map(x=>x.weight));
  const weight=selected.reduce((s,x)=>s+x.weight,0);
  return <div className="advanced-prediction-match">
    {board.isPending?<div className="card">Caricamento Bet personalizzate…</div>:null}
    {board.isError?<div className="card" role="alert">{embedded?'I pronostici sui giocatori compaiono quando le formazioni sono definitive. ':'Bet non disponibili per questa partita. '}<button type="button" onClick={()=>void board.refetch()}>Riprova</button></div>:null}
    {board.isSuccess?<>
      <div className="card">{embedded?<h3>Pronostici sui giocatori</h3>:<><h3>Partita del {formatDate(match.date)}</h3><p>{match.play_time?`Ore ${match.play_time.slice(0,5)}`:'Orario da definire'} · Blu contro Bianchi</p></>}
        <p><b>{selected.length}/{assignments.length}</b> giocate · fino a <b>+{points(simulated.finalUnits)} pt</b></p>
        {board.data.replacedCount?<p role="status">{board.data.replacedCount} Bet sostituite dopo la modifica delle squadre. Le nuove scelte non sono selezionate automaticamente.</p>:null}
        {board.data.isOpen?<p>Chiusura tra {minutesLeft===null?'—':minutesLeft>=1440?`${Math.floor(minutesLeft/1440)} giorni e ${Math.floor(minutesLeft%1440/60)} ore`:
          `${Math.floor(minutesLeft/60)} ore e ${minutesLeft%60} minuti`}.</p>:<p>Selezioni chiuse. Le Bet giocate sono in sola lettura.</p>}
        <details className="bet-info"><summary>ⓘ Dettagli punti</summary>
          <div className="advanced-prediction-risk"><span>Massimo base: <b>+{weight}</b></span><span>Minimo: <b>−{weight}</b></span>
            <span>Moltiplicatore ideale: <b>×{points(simulated.multiplierBasisPoints)}</b></span>
            <span>Massimo teorico: <b>+{points(simulated.finalUnits)}</b></span></div>
          <p className="betting-hint">Difficoltà scelte: {Object.entries(difficultyLabel).map(([code,label])=>`${label} ${selected.filter(x=>x.difficulty===code).length}`).join(' · ')}</p>
          <small>Il massimo è teorico: condizioni correlate possono renderlo irraggiungibile.</small></details>
      </div>
      {board.data.summary?<div className="card"><h3>Risultato Bet</h3>
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

function LeaderboardView({leagueId,season,photos}:{leagueId:string;season:string;photos:Record<string,string|null>}){
  const board=useAdvancedLeaderboard(leagueId,season,'PROFETA');
  // solo chi ha fatto almeno una giocata (1-X-2, risultato esatto o pronostici sui giocatori)
  const rows=(board.data??[]).filter(standing=>standing.selected_count>0)
    .map(standing=>({player:{id:standing.player_id,name:standing.name},standing}));
  return <div className="card"><h3>Classifica Bet</h3>
    <p className="betting-hint">Punti della stagione. Tocca un giocatore per vedere i dettagli delle sue giocate.</p>
    {board.isPending?<p>Caricamento classifica…</p>:board.isError?<p>Classifica non disponibile per questa lega.</p>:
      rows.length?<div className="bet-standings-list">{rows.map(({player,standing})=><details key={player.id} className={`bet-standing${standing?.position&&standing.position<=3?' bet-standing-podium':''}`}>
        <summary><span className="bet-standing-position" aria-label={standing?`Posizione ${standing.position}`:'Senza posizione'}>{standing?.position===1?'🥇':standing?.position===2?'🥈':standing?.position===3?'🥉':standing?.position??'—'}</span>
          <PlayerAvatar name={player.name} photo={photoUrl(photos[player.id]??standing?.photo_path??null)} />
          <span className="bet-standing-identity"><strong>{player.name}</strong><small>{standing?`${standing.won_count} corrette · ${standing.played_matches} partite Bet`:'Nessuna giocata risolta'}</small></span>
          <span className="bet-standing-score"><b>{standing?points(standing.final_units):'0'}</b><small>punti</small></span>
          <span className="bet-standing-chevron" aria-hidden="true">⌄</span></summary>
        <div className="bet-standing-details">
          <div><span>Partite Bet</span><b>{standing?.played_matches??0}</b></div>
          <div><span>Giocate</span><b>{standing?.selected_count??0}</b></div>
          <div><span>Corrette</span><b>{standing?.won_count??0}</b></div>
          <div><span>Errate</span><b>{standing?.lost_count??0}</b></div>
          <div><span>Annullate</span><b>{standing?.void_count??0}</b></div>
          <div><span>Precisione</span><b>{standing?`${Math.round(standing.accuracy*100)}%`:'—'}</b></div>
          <div><span>Bonus</span><b>{standing?points(standing.bonus_units):'0'} pt</b></div>
        </div>
      </details>)}</div>:<p>Nessuno ha ancora fatto una giocata in questa stagione.</p>}
  </div>;
}
function StatsView({leagueId,season}:{leagueId:string;season:string}){
  const stats=useAdvancedStats(leagueId,season);
  if(stats.isPending)return <div className="card">Caricamento rendimento Bet…</div>;
  if(stats.isError)return <div className="card">Rendimento Bet non disponibile.</div>;
  const value=stats.data;
  const unlocked=predictionFeats(value);
  return <div className="card"><h3>Il mio rendimento Bet</h3>
    <div className="advanced-prediction-risk"><span>Ricevuti <b>{value.received??0}</b></span><span>Scelti <b>{value.selected??0}</b></span>
      <span>Indovinati <b>{value.won??0}</b></span><span>Sbagliati <b>{value.lost??0}</b></span>
      <span>Annullati <b>{value.void??0}</b></span><span>Precisione ponderata <b>{value.weighted_accuracy??'—'}%</b></span></div>
    <h4>Per categoria</h4><ul>{Object.entries(value.categories??{}).map(([category,item])=><li key={category}>
      {categoryLabel[category]??category}: {item.won}/{item.validated} indovinati · {points(item.net_units)} pt</li>)}</ul>
    <h4>Per difficoltà</h4><ul>{Object.entries(value.difficulties??{}).map(([difficulty,item])=><li key={difficulty}>
      {difficultyLabel[difficulty as Difficulty]??difficulty}: {item.won}/{item.validated} indovinati · {points(item.net_units)} pt</li>)}</ul>
    <h4>Badge conquistati</h4>{unlocked.size?<div className="advanced-badges">{PREDICTION_FEATS.filter(x=>unlocked.has(x.k)).map(x=><span key={x.k} title={x.d}>{x.t}</span>)}</div>:
      <p>Il primo badge arriva con una Bet indovinata.</p>}
  </div>;
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
        <span> · {x.outcome??x.status}{x.points_units!==null?` · ${points(x.points_units)} pt`:''}</span></li>)}</ul>:<p>Nessuna Bet per questi filtri.</p>}
    <div className="advanced-history-pages"><button type="button" className="btn" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Precedenti</button>
      <span>Pagina {Math.floor(offset/50)+1}</span><button type="button" className="btn" disabled={!history.data||history.data.length<50} onClick={()=>setOffset(offset+50)}>Successivi</button></div>
  </details>;
}

export function AdvancedPredictionsSection({leagueId,matches,resultMatches,players,photos,fixedView}:{fixedView?:'results'|'leaderboard'|'stats';leagueId:string;matches:BettingMatch[];resultMatches:BettingMatch[];players:readonly {id:string;name:string}[];photos:Record<string,string|null>}){
  const enabled=useAdvancedEnabled(leagueId);
  const [matchId,setMatchId]=useState('');
  const [viewState,setView]=useState<'results'|'leaderboard'|'stats'>('results');
  const view=fixedView??viewState;
  const seasons=[...new Map(matches.map(x=>seasonOf(x.date)).filter(x=>x!==null).map(x=>[x.key,x])).values()];
  const [chosenSeason,setChosenSeason]=useState('');
  const season=seasons.find(x=>x.key===chosenSeason)??seasons[0];
  const visible=resultMatches;
  const current=visible.find(x=>x.match_id===matchId)??visible[0];
  if(!enabled.data)return null;
  return <section className="advanced-predictions-section">{fixedView?null:<h2>Bet sugli avversari</h2>}
    {fixedView?null:<div className="advanced-view-tabs" role="tablist" aria-label="Viste Bet">
      {([['results','Risultati'],['leaderboard','Classifica'],['stats','Il mio Bet']] as const)
        .map(([key,label])=><button type="button" key={key} role="tab" aria-selected={view===key} className={view===key?'selected':''}
          onClick={()=>setView(key)}>{label}</button>)}</div>}
    {view==='results'?<>{visible.length?<><label className="advanced-prediction-picker">Partita <select value={current?.match_id??''} onChange={e=>setMatchId(e.target.value)}>
      {visible.map(x=><option key={x.match_id} value={x.match_id}>{formatDate(x.date)}</option>)}</select></label>
      {current?<MatchPredictions key={current.match_id} match={current}/>:null}</>:<div className="card">Nessuna partita disponibile.</div>}</>:null}
    {view==='results'?<HistoryView leagueId={leagueId} matches={resultMatches} players={players}/>:null}
    {(view==='leaderboard'||view==='stats')&&season?<><label className="advanced-prediction-picker">Stagione <select value={season.key} onChange={e=>setChosenSeason(e.target.value)}>
      {seasons.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
      {view==='leaderboard'?<LeaderboardView leagueId={leagueId} season={season.key} photos={photos}/>:
        <StatsView leagueId={leagueId} season={season.key}/>}</>:null}
  </section>;
}
