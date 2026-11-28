import { useEffect } from 'react';
import { useImageTools } from '../../app/ImageViewer';
import { drawPlayerWrap } from '../../canvas/playerWrap';
import { loadImage } from '../../canvas/images';
import type { PlayerWrap } from '../../domain/playerWrap';

const value = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2).replace('.', ',');

export function PlayerWrapDialog({ name, photo, wrap, onClose }: { name: string; photo: string | null; wrap: PlayerWrap | null; onClose: () => void }) {
  const { showImage } = useImageTools();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const create = () => {
    if (!wrap) return;
    const canvas = loadImage(photo).then((image) => drawPlayerWrap(name, wrap, image));
    showImage(`Wrap ${wrap.season} · ${name}`, canvas, `wrap_${wrap.season.replace(/\s+/g, '_')}_${name.replace(/\s+/g, '_')}.png`,
      `🏆 Il Wrap di ${name} · ${wrap.season}`);
  };
  const stats = wrap?.stats;
  return <div className="player-wrap-overlay" role="dialog" aria-modal="true" aria-label={`Wrap di ${name}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="player-wrap-panel">
      <div className="player-wrap-head"><div><small>CALCIO LERCIO · WRAP</small><h2>{name}</h2><strong>{wrap?.season ?? 'Passata stagione'}</strong></div>
        <button type="button" aria-label="Chiudi Wrap" onClick={onClose}>✕</button></div>
      {!wrap ? <p className="player-wrap-empty">Non c’è ancora una stagione terminata da raccontare.</p> : <>
        {wrap.status === 'in chiusura' ? <p className="player-wrap-note">La stagione è in chiusura: i premi possono ancora cambiare.</p> : null}
        <div className="player-wrap-numbers">
          <div><b>{stats?.pres ?? 0}</b><span>Presenze</span></div><div><b>{stats?.w ?? 0}</b><span>Vittorie</span></div><div><b>{stats?.goals ?? 0}</b><span>Gol</span></div>
          <div><b>{stats?.assist ?? 0}</b><span>Assist</span></div><div><b>{value(stats?.voteAvg)}</b><span>Media voto</span></div><div><b>{stats?.meta ?? 0}</b><span>Mete</span></div>
        </div>
        <div className="player-wrap-record">{stats?.w ?? 0} vinte · {stats?.d ?? 0} pareggiate · {stats?.l ?? 0} perse · {stats?.votes.length ?? 0} pagelle</div>
        <h3>🏆 Premi di stagione</h3>
        {wrap.awards.length ? wrap.awards.map((award) => <div className={`player-wrap-award${award.shame ? ' shame' : ''}`} key={award.title}>
          <div><strong>{award.title}</strong><b>{award.value}</b></div><small>{award.description}</small>
        </div>) : <p className="player-wrap-empty">Nessun premio assegnato in questa stagione.</p>}
        {wrap.feats.length ? <><h3>✨ Imprese</h3>{wrap.feats.map((feat) => <div className="player-wrap-feat" key={feat.title}>
          <strong>{feat.title} ×{feat.count}</strong><small>{feat.description}</small></div>)}</> : null}
        <button type="button" className="btn btn-primary btn-full player-wrap-create" onClick={create}>🖼️ Crea immagine del Wrap</button>
      </>}
    </div>
  </div>;
}
