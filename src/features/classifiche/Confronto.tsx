// "⚔️ Confronto testa a testa": due giocatori, sfide dirette, 12 righe con barre, 6 statistiche della figurina.
// Fonte: renderConfronto, pickCmp, setCmp in legacy/index.html. L'immagine da condividere arriva col passo 3.6.
import { useState } from 'react';
import { useToast } from '../../app/Toast';
import type { LeagueData } from '../../data/queries';
import { avatarClass, initials } from '../../domain/format';
import { compareBars, compareLeads, compareRows, cmpLead, headToHead, resolveCompare, scopeLabel } from '../../domain/h2h';
import { calcOvr, FUT_STATS, futStat, rosaOrder } from '../../domain/ovr';
import { seasonsList } from '../../domain/seasons';
import type { Player } from '../../domain/types';
import { FutMini } from '../player/FutMini';

const Avatar = ({ p }: { p: Player }) => <div className={`avatar avatar-ini ${avatarClass(p.roles)}`}>{initials(p.name)}</div>;

function Picker({ data, slot, other, onPick, onClose }: {
  data: LeagueData; slot: 'A' | 'B'; other: number; onPick: (slot: 'A' | 'B', id: string) => void; onClose: () => void;
}) {
  const { players } = data.dataset;
  return (
    <div id="match-modal" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">Scegli il giocatore</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div id="match-modal-body">
          {rosaOrder(players, data.weights).map((i) => {
            const p = players[i] as Player;
            const dis = i === other;
            return (
              <div key={p.id} className={`vs-opt${dis ? ' dis' : ''}`} onClick={dis ? undefined : () => onPick(slot, p.id)}>
                <Avatar p={p} />
                <span className="vs-opt-n">{p.name}</span>
                <span className="ovr-badge">OVR {calcOvr(p.stats, data.weights).toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Confronto({ data, scope, a, b, onChange }: {
  data: LeagueData; scope: string; a: string | null; b: string | null; onChange: (a: string | null, b: string | null) => void;
}) {
  const toast = useToast();
  const [picking, setPicking] = useState<'A' | 'B' | null>(null);
  const { dataset, weights } = data;
  const pair = resolveCompare(dataset.players, weights, a, b);
  if (!pair) return <div style={{ textAlign: 'center', padding: 14, color: 'var(--text3)', fontSize: 13 }}>Servono almeno due giocatori</div>;
  const pa = dataset.players[pair[0]] as Player;
  const pb = dataset.players[pair[1]] as Player;
  const h = headToHead(dataset, pa, pb, scope);
  const rows = compareRows(dataset, pa, pb, scope, data.albo);
  const { leads, la, lb } = compareLeads(rows);
  const seasons = seasonsList(dataset.matches, data.albo);
  const nm = (n: string) => <b>{n}</b>;
  const fut = FUT_STATS.map(([l, idx]) => ({ l, a: futStat(pa.stats, idx), b: futStat(pb.stats, idx) }));
  const sel = (slot: 'A' | 'B', p: Player) => (
    <button className="vs-sel" onClick={() => setPicking(slot)}>
      <Avatar p={p} />
      <span>{p.name}</span>
      <b>▾</b>
    </button>
  );
  const sfide = h.vs.n === 1 ? 'sfida' : 'sfide';

  return (
    <>
      <div className="section-header" style={{ margin: '0 0 8px' }}>⚔️ Confronto testa a testa · {scopeLabel(seasons, scope)}</div>
      <div className="vs-pick">
        {sel('A', pa)}
        <button className="vs-swap" onClick={() => onChange(pb.id, pa.id)} title="Inverti">⇄</button>
        {sel('B', pb)}
      </div>
      <div className="vs-cards">
        <div><FutMini data={data} player={pa} /></div>
        <div className="vs-vs">VS</div>
        <div><FutMini data={data} player={pb} /></div>
      </div>
      <div className="h2h">
        <div className="h2h-t">⚔️ Da avversari</div>
        {h.vs.n ? (
          <>
            <div className="h2h-score"><span className="ha">{h.vs.a}</span><span className="hsep">–</span><span className="hb">{h.vs.b}</span></div>
            <div className="h2h-sub">
              vittorie in {h.vs.n} {sfide}
              {h.vs.d ? ` · ${h.vs.d} ${h.vs.d === 1 ? 'pareggio' : 'pareggi'}` : ''} · differenza reti{' '}
              {h.vs.gd === 0 ? 'pari' : <>{nm(h.vs.gd > 0 ? pa.name : pb.name)} +{Math.abs(h.vs.gd)}</>}
            </div>
          </>
        ) : (
          <div className="h2h-sub">Non si sono mai affrontati{scope === 'all' ? '' : ' in questa stagione'}</div>
        )}
        <div className="h2h-t" style={{ marginTop: 8 }}>🤝 Da compagni</div>
        <div className="h2h-sub">
          {h.tog.n
            ? `insieme ${h.tog.w} ${h.tog.w === 1 ? 'vinta' : 'vinte'} su ${h.tog.n} (${h.tog.w}V · ${h.tog.d}N · ${h.tog.l}P)`
            : `mai nella stessa squadra${scope === 'all' ? '' : ' in questa stagione'}`}
        </div>
      </div>
      <div className="vs-sum">
        📊 {la === lb ? `Parità: ${la} voci a testa` : <>{nm(la > lb ? pa.name : pb.name)} avanti in {Math.max(la, lb)} voci su {rows.length}</>}
      </div>
      {rows.map((r, k) => {
        const L = leads[k];
        const { wa, wb } = compareBars(r.a, r.b);
        return (
          <div className="vs-row" key={r.label}>
            <span className={`vs-v${L === 1 ? ' lead' : ''}`}>{r.text(r.a)}</span>
            <div className="vs-mid">
              <div className="vs-lbl">{r.label}{r.lowerIsBetter ? <>{' '}<small>(meno è meglio)</small></> : null}</div>
              <div className="vs-bars">
                <span><i className={`ba${L === 1 ? ' lead' : ''}`} style={{ width: `${wa}%` }} /></span>
                <span><i className={`bb${L === -1 ? ' lead' : ''}`} style={{ width: `${wb}%` }} /></span>
              </div>
            </div>
            <span className={`vs-v${L === -1 ? ' lead' : ''}`}>{r.text(r.b)}</span>
          </div>
        );
      })}
      <div className="vs-futgrid">
        {fut.map((r) => {
          const L = cmpLead(r.a, r.b);
          return (
            <div className="vs-fut" key={r.l}>
              <span className={L === 1 ? 'lead' : ''}>{r.a}</span>
              <em>{r.l}</em>
              <span className={L === -1 ? 'lead' : ''}>{r.b}</span>
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary btn-full" style={{ marginTop: 12, background: '#25D366', borderColor: '#25D366' }} onClick={() => toast("L'immagine del confronto arriva con il passo 3.6")}>
        📲 Condividi il confronto
      </button>
      {picking ? (
        <Picker
          data={data} slot={picking} other={picking === 'A' ? pair[1] : pair[0]}
          onPick={(slot, id) => {
            setPicking(null);
            if (slot === 'A') onChange(id, pb.id);
            else onChange(pa.id, id);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </>
  );
}
