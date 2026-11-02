// Testo del promemoria push della mattina della partita (supabase/functions/_shared/reminder.ts).
import { describe, expect, it } from 'vitest';
import { buildReminder, hhmm } from '../supabase/functions/_shared/reminder';

const base = { league_name: 'San Marcello', league_slug: 'san-marcello', play_time: '21:00:00', place: 'Campo Sole', team: 'A', match_id: 'm1' };

describe('promemoria push', () => {
  it('hhmm: hh:mm:ss → hh:mm, con lo zero davanti; vuoto se manca', () => {
    expect(hhmm('21:00:00')).toBe('21:00');
    expect(hhmm('9:05')).toBe('09:05');
    expect(hhmm(null)).toBe('');
    expect(hhmm('boh')).toBe('');
  });

  it('testo completo: ora, luogo e squadra Blu', () => {
    expect(buildReminder(base)).toEqual({
      title: 'San Marcello',
      body: '⚽ Oggi si gioca alle 21:00 · Campo Sole\nSei con i Blu 🔵',
      url: '/l/san-marcello/partite',
      tag: 'reminder-m1',
    });
  });

  it('squadra Bianchi', () => {
    expect(buildReminder({ ...base, team: 'B' }).body).toBe('⚽ Oggi si gioca alle 21:00 · Campo Sole\nSei con i Bianchi ⚪');
  });

  it('senza luogo o senza ora si saltano le parti mancanti', () => {
    expect(buildReminder({ ...base, place: null }).body).toBe('⚽ Oggi si gioca alle 21:00\nSei con i Blu 🔵');
    expect(buildReminder({ ...base, play_time: null }).body).toBe('⚽ Oggi si gioca Campo Sole\nSei con i Blu 🔵');
    expect(buildReminder({ ...base, play_time: null, place: '  ' }).body).toBe('⚽ Oggi si gioca\nSei con i Blu 🔵');
  });

  it('squadra sconosciuta: niente riga della squadra', () => {
    expect(buildReminder({ ...base, team: '?' }).body).toBe('⚽ Oggi si gioca alle 21:00 · Campo Sole');
  });

  it('una sola notifica per partita (tag) e il tocco porta alle Partite della lega', () => {
    const a = buildReminder(base);
    const b = buildReminder({ ...base, team: 'B' });
    expect(a.tag).toBe(b.tag);
    expect(a.url).toBe('/l/san-marcello/partite');
  });
});
