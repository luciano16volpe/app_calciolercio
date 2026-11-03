// WhatsApp: quali forme del messaggio si leggono, e che messaggio chiaro compare per quelle che non si leggono.
import { describe, expect, it } from 'vitest';
import { analyzePagelle, whatsappProblem } from '../src/domain/whatsapp';
import type { Dataset, Match } from '../src/domain/types';

const names = ['Steppata', 'Fabio', 'Nico', 'Peppe'];
const data = { players: names.map((n, i) => ({ id: `p${i}`, name: n, roles: ['MED'], stats: Array(11).fill(5) })), matches: [], ratings: [] } as unknown as Dataset;
const match = { id: 'm1', teamA: names.slice(0, 2).map((n, i) => ({ id: `p${i}`, name: n })), teamB: names.slice(2).map((n, i) => ({ id: `p${i + 2}`, name: n })) } as unknown as Match;
const votes = ['6,5', '6', '5,5', '7'];
const msg = (head: (n: string, v: string) => string) =>
  `*BLU 6* 🔵\n\n${names.map((n, i) => `${head(n, votes[i] as string)} ha giocato bene e ha fatto una partita di sostanza.\n_${n.toUpperCase()} IL GRANDE_ 🔋\n`).join('\n')}`;
const check = (text: string) => {
  const a = analyzePagelle(text, match, data);
  return { a, found: a?.res.blocks.length ?? 0, assigned: a?.res.blocks.filter((b) => b.assign).length ?? 0, problem: whatsappProblem(text, a) };
};

describe('formati che si leggono', () => {
  const ok: Record<string, string> = {
    '*Nome 6,5*': msg((n, v) => `*${n} ${v}*`),
    'Nome - 6,5': msg((n, v) => `${n} - ${v}`),
    'Nome: 6,5': msg((n, v) => `${n}: ${v}`),
    'voto con il punto 6.5': msg((n, v) => `*${n} ${v.replace(',', '.')}*`),
    'voto su 10 (6,5/10)': msg((n, v) => `*${n} ${v}/10*`),
    '**doppi asterischi**': msg((n, v) => `**${n} ${v}**`),
    '_corsivo 6,5_': msg((n, v) => `_${n} ${v}_`),
    'spazio non separabile': msg((n, v) => `*${n}\u00a0${v}*`),
    'a capo di Windows': msg((n, v) => `*${n} ${v}*`).replace(/\n/g, '\r\n'),
    'segno invisibile davanti alla riga (WhatsApp)': msg((n, v) => `\u200e*${n} ${v}*`),
    'segno invisibile in cima al messaggio': '\ufeff' + msg((n, v) => `*${n} ${v}*`),
  };
  for (const [name, text] of Object.entries(ok)) {
    it(name, () => {
      const r = check(text);
      expect(r.found).toBe(4);
      expect(r.assigned).toBe(4);
      expect(r.problem).toBeNull();
    });
  }
  it('il titolo e la descrizione restano quelli del messaggio', () => {
    const a = analyzePagelle(msg((n, v) => `\u200e*${n} ${v}*`), match, data)!;
    expect(a.res.blocks[0]).toMatchObject({ written: 'Steppata', title: 'STEPPATA IL GRANDE 🔋' });
    expect(a.res.blocks[0]!.desc).toBe('ha giocato bene e ha fatto una partita di sostanza.');
  });
});

describe('formati non letti: messaggio che spiega il motivo', () => {
  it('esportazione della chat, con data e ora', () => {
    expect(check(msg((n, v) => `[28/10/26, 21:30:12] Luciano: *${n} ${v}*`)).problem).toMatch(/esportazione della chat/);
    expect(check(msg((n, v) => `28/10/2026, 21:30 - Luciano: *${n} ${v}*`)).problem).toMatch(/esportazione della chat/);
  });
  it('voto fuori dagli asterischi', () => {
    expect(check(msg((n, v) => `*${n}* ${v}`)).problem).toMatch(/fuori dagli asterischi.*\*Peppe 6,5\*/);
    expect(check(msg((n, v) => `*${n}*: ${v}`)).problem).toMatch(/fuori dagli asterischi/);
  });
  it('voto tra parentesi', () => {
    expect(check(msg((n, v) => `*${n} (${v})*`)).problem).toMatch(/parentesi/);
  });
  it('tutto su una sola riga', () => {
    expect(check(msg((n, v) => `*${n} ${v}*`).replace(/\n/g, ' ')).problem).toMatch(/tutto su una riga/);
  });
  it('nessun voto nel testo', () => {
    expect(check('Che partita ragazzi, grande Peppe e grande Nico!').problem).toMatch(/nessun voto/);
  });
  it('testo qualunque con numeri ma senza pagelle: spiega il formato giusto', () => {
    const p = check('Domani si gioca alle 21 al campo di sempre, siamo in 10.\nConfermate!').problem;
    expect(p).toMatch(/Non riesco a trovare le pagelle/);
    expect(p).toMatch(/\*Peppe 6,5\*/);
  });
  it('messaggio vuoto', () => {
    expect(whatsappProblem('   ', null)).toMatch(/Incolla prima/);
  });
  it('pagelle di un\'altra partita: nessun nome corrisponde ai giocatori', () => {
    const altri = ['Pippo', 'Pluto', 'Paperino'];
    const text = altri.map((n, i) => `*${n} ${6 + i}*\ngrande partita.\n_UN BEL TITOLO_ 🔋\n`).join('\n');
    const p = check(text).problem;
    expect(p).toMatch(/Ho letto 3 pagelle/);
    expect(p).toMatch(/«Pippo»/);
    expect(p).toMatch(/partita giusta/);
  });
});
