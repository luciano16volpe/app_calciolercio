// Il «PAGELLONE» vero in cui ogni pagella inizia con la pallina della squadra attaccata al nome: 🔵*VITO 7,5* … ⚪*FABIO 7,5* …
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzePagelle, whatsappProblem } from '../src/domain/whatsapp';
import type { Dataset, Match } from '../src/domain/types';

const text = readFileSync(join(process.cwd(), 'tests/fixtures/whatsapp-formati/pagellone_pallina_davanti.txt'), 'utf8');
const blu = ['Vito', 'Luciano', 'Rella', 'Peppe', 'Steppata'];
const bianchi = ['Fabio', 'Cioccolata', 'Grosso', 'DavideAddante', 'Nico'];
const all = [...blu, ...bianchi];
const data = { players: all.map((n, i) => ({ id: `p${i}`, name: n, roles: ['MED'], stats: Array(11).fill(5) })), matches: [], ratings: [] } as unknown as Dataset;
const match = {
  id: 'm1',
  teamA: blu.map((n, i) => ({ id: `p${i}`, name: n })),
  teamB: bianchi.map((n, i) => ({ id: `p${i + 5}`, name: n })),
} as unknown as Match;

describe('PAGELLONE con la pallina colorata davanti a ogni pagella', () => {
  const a = analyzePagelle(text, match, data)!;
  it('trova le 10 pagelle e le abbina tutte ai giocatori giusti', () => {
    expect(a.res.blocks.map((b) => b.written)).toEqual(['VITO', 'Luciano', 'RELLA', 'PEPPE', 'STEPPATA', 'FABIO', 'CIOCCOLATA', 'GROSSO', 'DavideAddante', 'NICO']);
    expect(a.res.blocks.every((b) => b.assign)).toBe(true);
    expect(a.res.blocks.map((b) => b.m.slot?.name)).toEqual(all);
    expect(whatsappProblem(text, a)).toBeNull();
  });
  it('legge i voti (anche con la virgola)', () => {
    expect(a.res.blocks.map((b) => b.vote)).toEqual([7.5, 6, 6, 6.5, 7, 7.5, 5.5, 5, 5.5, 5]);
  });
  it('titolo e descrizione di ognuno, senza la pallina né il voto', () => {
    const b = (n: string) => a.res.blocks.find((x) => x.written === n)!;
    expect(b('VITO').title).toBe('SETTIMO CIELO 👼');
    expect(b('VITO').desc.startsWith('sette pizze le trasportava')).toBe(true);
    expect(b('VITO').desc).toContain('Mr. Mancini ha già messo gli occhi');
    expect(b('NICO')).toMatchObject({ title: 'GIÀ IN VACANZA ✈️', desc: 'per lui il solito, grazie!' });
    expect(b('GROSSO').title).toBe('VELLEITARIO');
    expect(b('DavideAddante').title).toBe('VOLENTEROSO');
    expect(b('RELLA').title).toMatch(/^DILIGENTE/);
    expect(b('FABIO').title).toMatch(/^ULISSE/);
  });
  it('la riga del risultato «🔵 *13-9* ⚪» e il titolo «*PAGELLONE*» non diventano pagelle', () => {
    expect(a.res.blocks.some((x) => /PAGELLONE|13/.test(x.written))).toBe(false);
  });
  it('una riga di descrizione che inizia con un\'emoji non diventa una pagella', () => {
    const t = '🔵*VITO 7,5* ha giocato bene.\n⚽ Nico 2 gol e un assist, tutto nel primo tempo.\n_SETTIMO CIELO_ 👼\n';
    const r = analyzePagelle(t, match, data)!;
    expect(r.res.blocks.map((b) => b.written)).toEqual(['VITO']);
    expect(r.res.blocks[0]!.desc).toContain('⚽ Nico 2 gol e un assist');
  });
});
