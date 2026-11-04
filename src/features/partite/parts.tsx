// Pezzi delle Partite: pulsanti della partita, ultima partita, elenco, Gazzette (striscia, archivio, visualizzatore),
// testo delle pagelle. Fonte: matchShareButtons, renderLastMatch, renderMatchesList, renderGazStrip, openGazArchive,
// openGazzetta, openPagelleText in legacy/index.html.
import { Fragment, useState, type ReactNode } from 'react';
import { useImageTools } from '../../app/ImageViewer';
import { useToast } from '../../app/Toast';
import { matchFormations, matchSheet, matchSummary } from '../../canvas/make';
import { gazzettaThumbPath, useGazzettaUrl, type LeagueData } from '../../data/queries';
import { useAuth } from '../../app/auth';
import { Confetti } from '../../app/Confetti';
import { Rain } from '../../app/Rain';
import { useMyPlayer } from '../../data/claims';
import { getPlayerMatchResult } from '../../domain/stats';
import { formatDate, whenWhere } from '../../domain/format';
import {
  gazzetteBySeason, gazzetteByDate, hasScore, lastMatch, matchHasDesc, matchListGroups, pagelleText, type GazItem,
} from '../../domain/matches';
import type { Match } from '../../domain/types';

const SEASON_ICON: Record<string, string> = { PRI: '🌸', EST: '☀️', AUT: '🍂', INV: '❄️' };
const seasonIcon = (key: string, fallback: string) => SEASON_ICON[String(key).slice(-3)] ?? fallback;
const num = (v: unknown): number | null => {
  const n = parseInt(v as string);
  return isNaN(n) ? null : n;
};

export interface MatchActions {
  openMatch: (id: string) => void;
  openGazzetta: (id: string, fromArchive?: boolean) => void;
  openPagelleText: (id: string) => void;
}

// ── pulsanti sotto la partita ──────────────────────────────────────────────
/** Non giocata → Formazioni · Riepilogo · Foglio. Giocata → Riepilogo + 📰 Gazzetta (se c'è) + 📜 Pagelle (se ce ne sono). */
export function MatchButtons({ data, m, act }: { data: LeagueData; m: Match; act: MatchActions }) {
  const { showImage, shareCanvas } = useImageTools();
  const played = num(m.scoreA) != null && num(m.scoreB) != null;
  const fd = formatDate(m.date);
  const day = m.date || 'partita';
  const formations = () => showImage('⚽ Formazioni · ' + fd, matchFormations(data, m), 'formazioni_' + day + '.png', '⚽ Formazioni della partita del ' + fd);
  const summary = () => showImage('🖼️ Riepilogo · ' + fd, matchSummary(data, m), 'riepilogo_' + day + '.png', '⚽ Riepilogo della partita del ' + fd);
  const sheet = () => shareCanvas(matchSheet(data, m), 'foglio_partita_' + day + '.png', '📋 Foglio partita del ' + fd);
  const sum = <button className="btn btn-primary btn-sm mbar-btn" onClick={summary}>🖼️ Riepilogo</button>;
  if (!played) {
    return (
      <>
        <button className="btn btn-primary btn-sm mbar-btn" onClick={formations} style={{ background: '#25D366', borderColor: '#25D366' }}>📲 Formazioni</button>
        {sum}
        <button className="btn btn-secondary btn-sm mbar-btn" onClick={sheet} title="Foglio A4 in bianco e nero da stampare e compilare in campo">🖨️ Foglio</button>
      </>
    );
  }
  return (
    <>
      {sum}
      {data.gazzette[m.id] ? <button className="btn btn-secondary btn-sm mbar-btn" onClick={() => act.openGazzetta(m.id)} title="Apri la Gazzetta">📰 Gazzetta</button> : null}
      {matchHasDesc(data.dataset, m.id) ? (
        <button className="btn btn-primary btn-sm mbar-btn" onClick={() => act.openPagelleText(m.id)} style={{ background: '#25D366', borderColor: '#25D366' }} title="Tutte le pagelle in un testo">📜 Pagelle</button>
      ) : null}
    </>
  );
}

// ── ultima partita ─────────────────────────────────────────────────────────
export function LastMatch({ data, act, mine, active = true }: { data: LeagueData; act: MatchActions; mine?: { id: string; name: string } | null; active?: boolean }) {
  const m = lastMatch(data.dataset);
  if (!m) return null;
  return <LastMatchCard data={data} m={m} act={act} mine={mine} active={active} />;
}

/** Il mio giocatore (se gioca in questa lega): serve a sapere se ho vinto o perso la partita. */
export function useMyPlayerIn(data: LeagueData | undefined): { id: string; name: string } | null {
  const { user } = useAuth();
  const mine = useMyPlayer(user?.id ?? null);
  const id = mine.data?.linked?.id;
  const p = id && data ? data.dataset.players.find((x) => x.id === id) : undefined;
  return p ? { id: p.id, name: p.name } : null;
}

/**
 * Il riquadro di una partita con risultato, pulsanti e tocco per i dettagli: l'ultima della lega (Partite) o la mia ultima (Profilo).
 * Se `mine` ha giocato quella partita: coriandoli sopra se ha vinto, pioggia sullo sfondo se ha perso. Gli effetti partono solo con `active`
 * (la pagina è quella che si sta guardando).
 */
export function LastMatchCard({ data, m, act, title = '🏆 Ultima partita', id, mine, active = true }: {
  data: LeagueData; m: Match; act: MatchActions; title?: string; id?: string; mine?: { id: string; name: string } | null; active?: boolean;
}) {
  const has = hasScore(m);
  const a = parseInt(m.scoreA as string);
  const b = parseInt(m.scoreB as string);
  let win: ReactNode = null;
  if (has) {
    if (a > b) win = <span style={{ color: 'var(--blue)', fontWeight: 800 }}>Vince Blu</span>;
    else if (b > a) win = <span style={{ color: 'var(--teamb)', fontWeight: 800 }}>Vince Bianchi</span>;
    else win = <span style={{ color: 'var(--text2)', fontWeight: 800 }}>Pareggio</span>;
  }
  const res = has && mine ? getPlayerMatchResult(m, mine.id, mine.name) : null; // 'W' vinta · 'D' pareggio · 'L' persa · null non ho giocato
  return (
    <div
      className={`card last-match-card fx-card${res === 'L' ? ' fx-rain' : res === 'W' ? ' fx-win' : ''}`} id={id} data-result={res ?? undefined}
      style={{ cursor: 'pointer', position: 'relative' }} onClick={() => act.openMatch(m.id)}
    >
      {active && res === 'W' ? <Confetti /> : null}
      {active && res === 'L' ? <Rain /> : null}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="section-header" style={{ margin: 0 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDate(m.date)}{whenWhere(m) ? ` · ${whenWhere(m)}` : ''} ›</span>
      </div>
      <div className="last-match-score">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>🔵 Blu</span>
        <span className="last-match-score-value">{has ? `${m.scoreA} - ${m.scoreB}` : '– : –'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teamb)' }}>⚪ Bianchi</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, marginTop: 4 }}>{win}</div>
      {res ? (
        <div id="my-last-result" style={{ textAlign: 'center', fontSize: 13, marginTop: 4, fontWeight: 800, color: res === 'W' ? 'var(--green)' : res === 'L' ? 'var(--red)' : 'var(--text2)' }}>
          {res === 'W' ? 'Hai vinto 🎉' : res === 'L' ? 'Hai perso 🌧️' : 'Hai pareggiato'}
        </div>
      ) : null}
      <div className="lm-actions" onClick={(e) => e.stopPropagation()}><MatchButtons data={data} m={m} act={act} /></div>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>Tocca la partita per i dettagli e le pagelle</div>
    </div>
  );
}

// ── elenco di tutte le partite ─────────────────────────────────────────────
export function MatchesList({ data, act }: { data: LeagueData; act: MatchActions }) {
  const title = <div className="section-header" style={{ margin: '0 0 10px' }}>📋 Tutte le partite</div>;
  if (!data.dataset.matches.length) {
    return <>{title}<div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>Nessuna partita ancora.</div></>;
  }
  const groups = matchListGroups(data.dataset);
  return (
    <>
      {title}
      {groups.map((g) => (
        <Fragment key={g.key}>
          <div className="season-head">{seasonIcon(g.key, '📅')} {g.label} <span>· {g.items.length} {g.items.length === 1 ? 'partita' : 'partite'}</span></div>
          {g.items.map(({ m, ratedCount, descCount, totalPlayers }) => {
            const score = hasScore(m) ? `${m.scoreA} - ${m.scoreB}` : '';
            return (
              <div
                key={m.id} onClick={() => act.openMatch(m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 11, borderRadius: 'var(--radius-sm)', background: 'var(--gray)', marginBottom: 7, cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{formatDate(m.date)}</span>
                    {score ? <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{score}</span> : null}
                    {data.gazzette[m.id] ? <span title="Ha la Gazzetta" style={{ fontSize: 13 }}>📰</span> : null}
                    {descCount ? (
                      <span className={`desc-badge${descCount < ratedCount ? ' part' : ''}`} title={`Pagelle con descrizione: ${descCount} su ${ratedCount}`}>
                        ✍️{descCount < ratedCount ? ` ${descCount}/${ratedCount}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{totalPlayers} giocatori · {ratedCount}/{totalPlayers} pagelle</div>
                  {whenWhere(m) ? <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>⏰ {whenWhere(m)}</div> : null}
                  {m.notes ? <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 2 }}>{String(m.notes)}</div> : null}
                </div>
                {ratedCount > 0 ? <span style={{ fontSize: 18 }}>📊</span> : <span style={{ fontSize: 18, opacity: 0.4 }}>📝</span>}
                <span style={{ color: 'var(--text3)', fontSize: 16 }}>›</span>
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

/** Miniatura leggera; se manca (Gazzetta caricata prima delle miniature) si usa il file completo. */
export function GazThumb({ path, className }: { path: string; className?: string }) {
  const [fallback, setFallback] = useState(false);
  const thumb = useGazzettaUrl(gazzettaThumbPath(path));
  const useFull = fallback || thumb.isError;
  const full = useGazzettaUrl(useFull ? path : undefined);
  const url = useFull ? full.data : thumb.data;
  return url ? <img className={className} src={url} alt="La Gazzetta" loading="lazy" onError={() => setFallback(true)} /> : null;
}

// ── Gazzette ───────────────────────────────────────────────────────────────
/** Le ultime Gazzette in una striscia scorrevole. */
export function GazStrip({ data, act, onArchive }: { data: LeagueData; act: MatchActions; onArchive: () => void }) {
  const items = gazzetteByDate(data.dataset, data.gazzette);
  if (!items.length) return null;
  return (
    <div className="card gaz-strip-card">
      <div className="gaz-strip-h">
        <span className="section-header" style={{ margin: 0 }}>📰 Le Gazzette</span>
        <button type="button" onClick={onArchive}>Vedi tutte ›</button>
      </div>
      <div className="gaz-strip">
        {items.slice(0, 10).map(({ m, path }) => (
          <div className="gaz-tile" key={m.id} onClick={() => act.openGazzetta(m.id, true)}>
            <GazThumb path={path} />
            <span>{formatDate(m.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Contenuto della finestra "📰 Le Gazzette": tutte, divise per stagione. */
export function GazArchiveBody({ data, act }: { data: LeagueData; act: MatchActions }) {
  const groups = gazzetteBySeason(gazzetteByDate(data.dataset, data.gazzette));
  if (!groups.length) return <div className="mb-note" style={{ textAlign: 'center', padding: 20 }}>Ancora nessuna Gazzetta</div>;
  return (
    <>
      {groups.map((gr) => (
        <Fragment key={gr.key}>
          <div className="season-head">{seasonIcon(gr.key, '📅')} {gr.label} <span>· {gr.list.length} {gr.list.length === 1 ? 'Gazzetta' : 'Gazzette'}</span></div>
          <div className="gaz-grid">
            {gr.list.map(({ m, path }: GazItem) => (
              <div className="gaz-tile" key={m.id} onClick={() => act.openGazzetta(m.id, true)}>
                <GazThumb path={path} />
                <span>{formatDate(m.date)}{hasScore(m) ? ` · ${m.scoreA}-${m.scoreB}` : ''}</span>
              </div>
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}

/** Visualizzatore a schermo intero: tocca per ingrandire, condividi o salva il file originale. */
export function GazViewer({ data, matchId, fromArchive, onClose, onGoToMatch }: {
  data: LeagueData; matchId: string; fromArchive: boolean; onClose: () => void; onGoToMatch: (id: string) => void;
}) {
  const toast = useToast();
  const [zoom, setZoom] = useState(false);
  const path = data.gazzette[matchId];
  const m = data.dataset.matches.find((x) => x.id === matchId);
  const signed = useGazzettaUrl(path);
  if (!path) return null;
  const url = signed.data;
  const res = m && num(m.scoreA) != null && num(m.scoreB) != null ? ` · 🔵 ${m.scoreA} – ${m.scoreB} ⚪` : '';
  const share = async () => {
    if (!url) return;
    toast("⏳ Preparo l'immagine…");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const name = `gazzetta_${m?.date ?? matchId}.jpg`;
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'La Gazzetta', text: '📰 La Gazzetta di CalcioLercio' });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 300);
      toast('⬇️ Gazzetta salvata');
    } catch {
      window.open(url, '_blank'); // ripiego: si apre il file
    }
  };
  return (
    <div id="gaz-viewer" style={{ display: 'flex' }}>
      <div className="gv-top">
        <span>📰 {formatDate(m?.date)}{res}</span>
        <button type="button" onClick={onClose} aria-label="Chiudi">✕</button>
      </div>
      <div className={`gv-img${zoom ? ' zoom' : ''}`} onClick={() => setZoom((z) => !z)}>{url ? <img src={url} alt="La Gazzetta" /> : <span>{signed.isError ? 'Impossibile caricare la Gazzetta' : 'Caricamento…'}</span>}</div>
      <div className="gv-btns">
        <button type="button" disabled={!url} onClick={() => void share()}>📲 Condividi o salva</button>
        {fromArchive && m ? <button type="button" onClick={() => onGoToMatch(matchId)}>📋 Vai alla partita</button> : null}
      </div>
    </div>
  );
}

/** Finestra "📜 Tutte le pagelle": il testo in formato WhatsApp, da copiare o condividere. */
export function PagelleTextDialog({ data, matchId, onClose }: { data: LeagueData; matchId: string; onClose: () => void }) {
  const toast = useToast();
  const m = data.dataset.matches.find((x) => x.id === matchId);
  if (!m) return null;
  const txt = pagelleText(data.dataset, m, data.editors?.[m.id]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txt);
      toast('📋 Testo copiato: incollalo su WhatsApp');
    } catch {
      const el = document.getElementById('pt-text');
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      toast('Seleziona e copia il testo');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: txt });
        return;
      } catch (e) {
        if (e && (e as Error).name === 'AbortError') return;
      }
    }
    void copy(); // niente foglio di condivisione (computer): si copia
  };
  return (
    <div id="pt-dialog" style={{ display: 'flex' }}>
      <div className="pgt-box pt-box">
        <div className="pgt-h">📜 Tutte le pagelle</div>
        <div className="pt-text" id="pt-text">{txt}</div>
        <div className="pgt-btns">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Chiudi</button>
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>📋 Copia</button>
          <button type="button" className="btn btn-primary" style={{ background: '#25D366', borderColor: '#25D366' }} onClick={() => void share()}>📲 Condividi</button>
        </div>
        <div className="mb-note" style={{ textAlign: 'center' }}>Il testo usa il formato di WhatsApp: *grassetto* e _corsivo_.</div>
      </div>
    </div>
  );
}

/** Finestra "📰 Le Gazzette" con l'archivio. */
export function GazArchive({ data, act, onClose }: { data: LeagueData; act: MatchActions; onClose: () => void }) {
  return (
    <div id="match-modal" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, padding: 14, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--gray)', borderRadius: 'var(--radius)', padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }} id="match-modal-title">📰 Le Gazzette</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div id="match-modal-body"><GazArchiveBody data={data} act={act} /></div>
      </div>
    </div>
  );
}
