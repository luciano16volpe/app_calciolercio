// Testo del promemoria push della mattina della partita (supabase/functions/_shared/reminder.ts).
import { describe, expect, it } from 'vitest';
import { buildMessage, buildReminder, ddmm, hhmm, type EventInput } from '../supabase/functions/_shared/reminder';

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

const ev = (over: Partial<EventInput>): EventInput => ({ ...base, kind: 'result', match_date: '2026-10-28', score_a: 5, score_b: 3, ...over });

describe('notifiche degli eventi', () => {
  it('ddmm: aaaa-mm-gg → gg/mm', () => {
    expect(ddmm('2026-10-28')).toBe('28/10');
    expect(ddmm(null)).toBe('');
  });

  it('risultato: chi ha vinto, chi ha perso, pareggio', () => {
    expect(buildMessage(ev({ team: 'A' })).body).toBe('🏁 Blu 5 - 3 Bianchi\nHai vinto 🎉');
    expect(buildMessage(ev({ team: 'B' })).body).toBe('🏁 Blu 5 - 3 Bianchi\nHai perso');
    expect(buildMessage(ev({ team: 'A', score_a: 4, score_b: 4 })).body).toBe('🏁 Blu 4 - 4 Bianchi\nPareggio');
    expect(buildMessage(ev({ team: 'B', score_a: 1, score_b: 2 })).body).toBe('🏁 Blu 1 - 2 Bianchi\nHai vinto 🎉');
  });

  it('risultato: titolo = lega, tocco → Partite, una sola notifica per partita e tipo', () => {
    const m = buildMessage(ev({}));
    expect([m.title, m.url, m.tag]).toEqual(['San Marcello', '/l/san-marcello/partite', 'result-m1']);
  });

  it('pagelle pronte e Gazzetta: parlano della partita del giorno', () => {
    expect(buildMessage(ev({ kind: 'ratings' })).body).toBe('📝 Le pagelle della partita del 28/10 sono pronte');
    expect(buildMessage(ev({ kind: 'gazzetta' })).body).toBe('📰 La Gazzetta della partita del 28/10 è online');
    expect(buildMessage(ev({ kind: 'ratings' })).tag).toBe('ratings-m1');
    expect(buildMessage(ev({ kind: 'gazzetta' })).tag).toBe('gazzetta-m1');
  });

  it('il promemoria passa dallo stesso punto', () => {
    expect(buildMessage(ev({ kind: 'reminder' }))).toEqual(buildReminder(base));
  });
});
