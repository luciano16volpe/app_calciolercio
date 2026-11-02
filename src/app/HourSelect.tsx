// Scelta dell'ora della partita: solo ore tonde (18:00, 19:00…), senza minuti.
// Se una partita già salvata ha un'ora non tonda (es. 20:30) resta tra le scelte, così non si perde.
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

export function HourSelect({ value, onChange, id, disabled, style }: { value: string; onChange: (v: string) => void; id: string; disabled?: boolean; style?: React.CSSProperties }) {
  const options = value && !HOURS.includes(value) ? [...HOURS, value].sort() : HOURS;
  return (
    <select id={id} className="dt-inp" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 16, ...style }}>
      <option value="">— scegli l’ora —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
