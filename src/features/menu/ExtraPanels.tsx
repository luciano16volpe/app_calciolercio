// Menu laterale → Coppie, Albo d'oro, Record: funzioni extra (non sono classifiche), ognuna con la scelta della stagione.
// Toccando un giocatore o una partita il pannello si chiude e si apre la scheda.
import type { ReactNode } from 'react';
import { Sheet } from '../../app/Sheet';
import type { LeagueData } from '../../data/queries';
import { AlboList } from '../classifiche/Albo';
import { CoppieList, RecordList } from '../classifiche/lists';
import { SeasonChips, useSeasonScope } from './SeasonScope';

type Props = { data: LeagueData; onClose: () => void; onOpenPlayer: (id: string) => void; onOpenMatch: (id: string) => void };

function ExtraSheet({ data, title, id, onClose, children }: { data: LeagueData; title: string; id: string; onClose: () => void; children: (scope: string) => ReactNode }) {
  const { seasons, scope, setScope, canHistory } = useSeasonScope(data);
  return (
    <Sheet title={title} onClose={onClose} id={id}>
      <SeasonChips seasons={seasons} scope={scope} onPick={setScope} canHistory={canHistory} />
      <div className="card" id="extra-list">{children(scope)}</div>
    </Sheet>
  );
}

export function CouplesPanel({ data, onClose, onOpenPlayer }: Props) {
  const open = (id: string) => { onClose(); onOpenPlayer(id); };
  return <ExtraSheet data={data} title="🤝 Coppie" id="sheet-coppie" onClose={onClose}>{(scope) => <CoppieList data={data} scope={scope} onOpenPlayer={open} />}</ExtraSheet>;
}

export function AlboPanel({ data, onClose, onOpenPlayer }: Props) {
  const open = (id: string) => { onClose(); onOpenPlayer(id); };
  return <ExtraSheet data={data} title="🏆 Albo d'oro" id="sheet-albo" onClose={onClose}>{(scope) => <AlboList data={data} scope={scope} onOpenPlayer={open} />}</ExtraSheet>;
}

export function RecordsPanel({ data, onClose, onOpenPlayer, onOpenMatch }: Props) {
  const openP = (id: string) => { onClose(); onOpenPlayer(id); };
  const openM = (id: string) => { onClose(); onOpenMatch(id); };
  return <ExtraSheet data={data} title="🏅 Record" id="sheet-record" onClose={onClose}>{(scope) => <RecordList data={data} scope={scope} onOpenPlayer={openP} onOpenMatch={openM} />}</ExtraSheet>;
}
