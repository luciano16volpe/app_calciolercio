// "📥 Importa pagelle da WhatsApp": si incolla il messaggio, l'app riconosce i giocatori e assegna SOLO titolo e descrizione.
// Voti, gol e risultato restano quelli inseriti a mano.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../app/Toast';
import { saveAliases } from '../../data/mutations';
import { LEAGUE_QUERY_KEY, type LeagueData } from '../../data/queries';
import { analyzePagelle, waApply, waAssign, waRemember, whatsappProblem, type AliasMap, type WaAnalysis } from '../../domain/whatsapp';
import type { Match } from '../../domain/types';
import { normalizeTeam } from '../../domain/stats';

const ALIAS_KEY = 'calcio_alias'; // i soprannomi già imparati restano validi
function readAliasMap(): AliasMap {
  try {
    return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') as AliasMap;
  } catch {
    return {};
  }
}

/** Posto ('bl-3', 'bi-7': numero sul totale dei giocatori) → chiave dei campi della scheda ('A3', 'B2'). */
export function slotKey(pk: string, sizeA: number): string {
  const i = parseInt(pk.split('-')[1] as string);
  return pk.startsWith('bl') ? `A${i}` : `B${i - sizeA}`;
}

export function WhatsAppImport({ data, m, hasRating, onAssign, defaultOpen = false }: {
  data: LeagueData;
  m: Match;
  /** il giocatore (chiave dei campi) ha già un voto nella scheda? */
  hasRating: (key: string) => boolean;
  onAssign: (key: string, title: string, desc: string) => void;
  /** parte aperto (es. quando la redazione sceglie «Importa da WhatsApp» dal menu); di norma è chiuso */
  defaultOpen?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [an, setAn] = useState<WaAnalysis | null>(null);
  const [on, setOn] = useState<Record<number, boolean>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const sizeA = normalizeTeam(m.teamA).length;

  const analyze = () => {
    if (!text.trim()) return toast('Incolla prima il messaggio delle pagelle');
    setOn({});
    const result = analyzePagelle(text, m as Pick<Match, 'id' | 'teamA' | 'teamB'>, data.dataset, readAliasMap(), data.aliases ?? {});
    setAn(result);
    setProblem(whatsappProblem(text, result)); // se il messaggio non è chiaro, spiega perché e come correggerlo
  };
  const apply = () => {
    if (!an) return;
    const map = readAliasMap();
    const { items, remember } = waApply(an, (k) => on[k] ?? !!(an.res.blocks[k] as { assign?: string }).assign, map);
    items.forEach((it) => onAssign(slotKey(it.pk, sizeA), it.title, it.desc));
    // soprannomi imparati a mano ("Gianluca" → Cioccolata): restano sul telefono e nella lega
    let cur = map;
    const learned = new Map<string, string[]>();
    remember.forEach(({ written, player }) => {
      const r = waRemember(cur, written, { ...player, aliases: learned.get(player.id) ?? player.aliases });
      if (!r) return;
      cur = r.map;
      learned.set(player.id, r.aliases);
    });
    if (learned.size) {
      try {
        localStorage.setItem(ALIAS_KEY, JSON.stringify(cur));
      } catch {
        /* memoria piena: il soprannome si perde solo su questo telefono */
      }
      void saveAliases(data.league.id, learned)
        .then(() => qc.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }))
        .catch(() => undefined);
    }
    toast(`📥 Titolo e descrizione assegnati a ${items.length} giocatori: controlla e salva 💾`);
    setAn(null);
  };

  const blocks = an ? an.res.blocks : [];
  const assigned = new Set(blocks.filter((b) => b.assign).map((b) => b.assign));
  const missing = an ? an.slots.filter((s) => !assigned.has(s.pk)).map((s) => s.name) : [];
  return (
    <div id="wa-import" className={`wa-import${open ? ' open' : ''}`} style={{ display: 'block' }}>
      <button type="button" id="wa-toggle" className="wa-h wa-toggle" aria-expanded={open} aria-controls="wa-body" onClick={() => setOpen((o) => !o)}>
        <span>📥 Importa pagelle da WhatsApp</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id="wa-body" hidden={!open}>
      <div className="mb-note" style={{ margin: '8px 0 8px' }}>
        Incolla qui tutto il messaggio delle pagelle: l'app riconosce i giocatori e assegna a ciascuno <b>titolo e descrizione</b>. Voti, gol e risultato restano quelli che inserisci tu. Prima di assegnare ti mostra cosa ha capito.
      </div>
      <textarea id="wa-text" rows={5} placeholder="Incolla il messaggio di WhatsApp…" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" className="btn btn-secondary btn-full" onClick={analyze}>🔍 Analizza il messaggio</button>
      <div id="wa-preview">
        {an && problem ? <div id="wa-problem" className="mb-note" style={{ color: 'var(--red)', fontWeight: 700, lineHeight: 1.45 }}>⚠️ {problem}</div> : null}
        {an && blocks.length ? (
          <>
            <div className="wa-sum">
              Trovate <b>{blocks.length}</b> pagelle · riconosciuti <b>{blocks.filter((b) => b.assign).length}</b> giocatori · verranno assegnati solo <b>titolo e descrizione</b>
            </div>
            {blocks.map((b, k) => {
              const st = !b.assign ? 'miss' : b.guess ? 'guess' : b.m.slot && b.m.slot.pk === b.assign ? 'ok' : 'manual';
              const why = st === 'ok' ? '' : st === 'guess' ? 'abbinato per esclusione: controlla' : st === 'miss' ? (b.m.ambiguous ? 'nome ambiguo: scegli il giocatore' : 'non riconosciuto: scegli il giocatore') : 'abbinato a mano';
              return (
                <div className={`wa-row ${st}`} key={k}>
                  <div className="wa-top">
                    <input type="checkbox" id={`wa-on-${k}`} checked={on[k] ?? !!b.assign} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} />
                    <span className="wa-written">“{b.written}”</span>
                    <span className="wa-arrow">→</span>
                    <select value={b.assign ?? ''} onChange={(e) => { setOn({}); setAn(waAssign(an, k, e.target.value)); }}>
                      <option value="">— ignora —</option>
                      {an.slots.map((s) => <option key={s.pk} value={s.pk}>{s.team === 'A' ? '🔵' : '⚪'} {s.name}</option>)}
                    </select>
                  </div>
                  <div className="wa-det">
                    {b.title ? <i>«{b.title}»</i> : <span style={{ color: 'var(--text3)' }}>senza titolo</span>}
                    {why ? <> · <span className="wa-why">{why}</span></> : null}
                    {b.assign && !hasRating(slotKey(b.assign, sizeA)) ? <> · <span className="wa-why">manca il voto nell'app</span></> : null}
                  </div>
                  {b.desc ? <div className="wa-desc">{b.desc.slice(0, 140)}{b.desc.length > 140 ? '…' : ''}</div> : null}
                </div>
              );
            })}
            {missing.length ? <div className="mb-note">Senza pagella nel messaggio: {missing.join(', ')}</div> : null}
            <button type="button" className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={apply}>✅ Assegna titoli e descrizioni</button>
          </>
        ) : null}
      </div>
      </div>
    </div>
  );
}
