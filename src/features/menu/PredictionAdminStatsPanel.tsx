import { useState } from 'react';
import { Sheet } from '../../app/Sheet';
import { useRole } from '../../app/auth';
import { useAdvancedAdminResults, useAdvancedBalance, useAdvancedEnabled, useAdvancedParticipation } from '../../data/advancedPredictions';
import { useBettingAdminParticipation, useBettingBoard, type BettingMatch, type Outcome } from '../../data/betting';
import type { LeagueData } from '../../data/queries';
import { formatDate } from '../../domain/format';
import { seasonOf } from '../../domain/seasons';

const outcomeLabel:Record<Outcome,string>={'1':'Blu',X:'Pareggio','2':'Bianchi'};
const difficultyLabel:Record<string,string>={COMMON:'Comune',UNCOMMON:'Non comune',RARE:'Raro',EPIC:'Epico',LEGENDARY:'Leggendario'};
const points=(units:number)=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(units/10000);

function MatchMonitoring({match}:{match:BettingMatch}){
  const advanced=useAdvancedParticipation(match.match_id);
  const simple=useBettingAdminParticipation(match.match_id);
  const finished=match.score_a!==null&&match.score_b!==null;
  const results=useAdvancedAdminResults(match.match_id,finished);
  return <>
    <div className="card"><h3>Partecipazione · {formatDate(match.date)}</h3>
      <p><b>{advanced.data?.count??0}</b> giocatori hanno scelto pronostici sugli avversari.</p>
      {advanced.isError?<p role="alert">Partecipazione ai pronostici non disponibile.</p>:
        advanced.data?.players.length?<p className="betting-hint">{advanced.data.players.map(player=>player.name).join(' · ')}</p>:null}
      <p><b>{simple.data?.length??match.total}</b> giocatori hanno giocato 1/X/2.</p>
      {simple.isError?<p role="alert">Partecipazione 1/X/2 non disponibile.</p>:
        simple.data?.length?<p className="betting-hint">{simple.data.map(player=>player.name).join(' · ')}</p>:null}
      <small>Prima della conclusione sono visibili solo partecipazione e nomi, mai le scelte.</small>
    </div>
    {finished?<div className="card"><h3>Scelte 1/X/2</h3>
      {match.entries?.length?<ul className="prediction-admin-list">{match.entries.map(entry=><li key={entry.user_id}>
        <b>{entry.name}</b><span>{outcomeLabel[entry.outcome]}{entry.score_a!==null&&entry.score_b!==null?` · ${entry.score_a}-${entry.score_b}`:''}</span>
      </li>)}</ul>:<p>Nessuna scelta registrata.</p>}
    </div>:null}
    {finished?<details className="card"><summary>Scelte sugli avversari dopo la chiusura delle pagelle</summary>
      {results.isPending?<p>Caricamento…</p>:results.isError?<p>Scelte non disponibili.</p>:
        results.data.length?<ul className="prediction-admin-list">{results.data.map((item,index)=><li key={index}>
          <b>{item.predictor}</b><span>{item.description} · {item.outcome??'In attesa'}{item.points_units!==null?` · ${points(item.points_units)} pt`:''}</span>
        </li>)}</ul>:<p>Le scelte compariranno quando il sondaggio pagelle sarà chiuso e i dati consolidati, se qualcuno ha giocato.</p>}
    </details>:null}
  </>;
}

function BalanceMonitoring({leagueId,season}:{leagueId:string;season:string}){
  const report=useAdvancedBalance(leagueId,season);
  return <details className="card"><summary>Bilanciamento delle giocate · {season}</summary>
    {report.isPending?<p>Caricamento…</p>:report.isError?<p>Report non disponibile.</p>:<>
      <p>Partite con moltiplicatore: {report.data.multiplied_matches} · Difficoltà iniziale usata: {report.data.default_estimates} · Punteggio medio: {report.data.average_final_units===null?'—':points(report.data.average_final_units)} pt</p>
      <ul>{report.data.by_difficulty.map(item=><li key={item.difficulty}>{difficultyLabel[item.difficulty]}: {item.assigned} assegnati, {item.selected} giocati, {item.won} indovinati, {item.lost} sbagliati, {item.void} annullati</li>)}</ul>
      <details><summary>Condizioni più estratte</summary><ul>{report.data.by_template.slice(0,20).map(item=><li key={item.template_id}>{item.template_code}: {item.assigned} assegnati, {item.selected} giocati, {item.won} indovinati</li>)}</ul></details>
    </>}
  </details>;
}

export function PredictionAdminStatsPanel({data,onClose}:{data:LeagueData;onClose:()=>void}){
  const {isAdmin}=useRole(data.league.id);
  const enabled=useAdvancedEnabled(data.league.id);
  const board=useBettingBoard(data.league.id);
  const [matchId,setMatchId]=useState('');
  const matches=board.data??[];
  const upcoming=matches.filter(match=>match.score_a===null&&match.score_b===null).sort((a,b)=>a.date.localeCompare(b.date));
  const current=matches.find(match=>match.match_id===matchId)??upcoming[0]??matches[0];
  const season=current?seasonOf(current.date)?.key:null;
  if(!isAdmin)return null;
  return <Sheet admin title="Statistiche pronostici" onClose={onClose} id="sheet-prediction-admin-stats">
    <p className="betting-hint">Monitora la partecipazione della lega. Le scelte restano riservate fino alla conclusione della partita o del sondaggio pagelle.</p>
    {board.isPending?<div className="card">Caricamento partite…</div>:board.isError?<div className="card" role="alert">Partite non disponibili.</div>:
      current?<><label className="advanced-prediction-picker">Partita <select value={current.match_id} onChange={event=>setMatchId(event.target.value)}>
        {matches.map(match=><option key={match.match_id} value={match.match_id}>{formatDate(match.date)} · {match.score_a===null?'Da giocare':'Conclusa'}</option>)}</select></label>
        <MatchMonitoring key={current.match_id} match={current}/></>:<div className="card">Nessuna partita disponibile.</div>}
    {enabled.data&&season?<BalanceMonitoring leagueId={data.league.id} season={season}/>:null}
  </Sheet>;
}
