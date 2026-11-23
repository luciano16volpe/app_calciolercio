/** Giorno abituale della partita: 1 = lunedì … 5 = venerdì (come nelle impostazioni della lega). */
const pad = (n: number) => String(n).padStart(2, '0');

/** La prossima data (aaaa-mm-gg) che cade nel giorno scelto, oggi compreso. Senza giorno valido restituisce oggi. */
export function nextLeagueDay(day: number | undefined, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 7) {
    d.setDate(d.getDate() + ((((day as number) % 7) - d.getDay() + 7) % 7));
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
