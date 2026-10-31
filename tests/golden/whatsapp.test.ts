// Test golden: importazione pagelle da WhatsApp — i 4 messaggi veri della Redazione (40 pagelle su 40),
// catena dei soprannomi ricordati, e confronto con legacy su messaggi "rovinati" a caso.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzePagelle, parseWhatsAppPagelle, waApply, waAssign, waBest, waHTML, waIsTitle, waNameScore, waNorm, waRemember,
  waSlotsOfMatch, waWords, type AliasMap, type WaAnalysis, type WaBlock, type WaPlayer, type WaSlot,
} from '../../src/domain/whatsapp';
import type { Dataset, Match, Player } from '../../src/domain/types';
import { real } from './data';
import { loadLegacy, type LegacyData } from './legacy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => any;
interface L extends Record<string, unknown> {
  __wa: (id: string, txt: string) => { id: string; res: { blocks: unknown[]; score: unknown }; slots: unknown[] };
  __waApply: () => void;
  waNorm: Fn; waWords: Fn; waNameScore: Fn; waBest: Fn; waIsTitle: Fn; parseWhatsAppPagelle: Fn; waAliasMap: () => AliasMap; waHTML: Fn;
}

const FUNCS = [
  'waAliasMap', 'waRemember', 'waNameScore', 'waBest', 'waIsTitle', 'parseWhatsAppPagelle', 'waAnalyze', 'waApply',
  'esc', 'playerKey', 'normalizeTeam',
];
const CONSTS = ['waNorm', 'waWords', 'WA_EMO', 'waHTML'];

const fixDir = join(process.cwd(), 'tests/fixtures/whatsapp');
const files = readdirSync(fixDir).filter((f) => f.endsWith('.txt')).sort(); // in ordine di data
const messages = files.map((f) => ({
  file: f,
  date: f.slice(0, 10),
  text: readFileSync(join(fixDir, f), 'utf8'),
}));

/** Copie separate della rosa: legacy aggiunge soprannomi ai giocatori, non deve sporcare l'altra parte. */
/** `senzaSoprannomi` = come era la rosa PRIMA che l'app imparasse "Gianluca" = Cioccolata (la rosa di prova li ha già). */
const fresh = (senzaSoprannomi = false): LegacyData => {
  const d = structuredClone(real) as unknown as LegacyData;
  if (senzaSoprannomi) (d.players as Array<{ aliases?: string[] }>).forEach((p) => delete p.aliases);
  return d;
};
const asDataset = (d: LegacyData): Dataset => d as unknown as Dataset;
const matchOf = (d: Dataset, date: string) => d.matches.find((m) => m.date === date) as Match;

/** Forma neutra di una pagella per confrontare legacy e nuova versione. */
const plainBlock = (b: WaBlock) => ({
  written: b.written, vote: b.vote, lines: b.lines, title: b.title, desc: b.desc,
  assign: b.assign ?? undefined, guess: b.guess ?? undefined,
  score: b.m.score, slot: b.m.slot ? b.m.slot.pk : null, ambiguous: b.m.ambiguous ? b.m.ambiguous.map((s) => s.pk) : null,
});
const plainSlots = (slots: Array<{ pk: string; name: string; team: string; player: { id: string } | null }>) =>
  slots.map((s) => ({ pk: s.pk, name: s.name, team: s.team, playerId: s.player ? s.player.id : null }));

describe('messaggi veri della Redazione', () => {
  it('ci sono i 4 messaggi attesi e le loro partite', () => {
    expect(messages.map((m) => m.date)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
    for (const m of messages) expect(matchOf(asDataset(fresh()), m.date)).toBeTruthy();
  });

  it.each([['con i soprannomi già nella rosa', false], ['senza soprannomi: li impara strada facendo', true]] as const)('40 pagelle su 40, %s: ogni nome al giocatore giusto, voto uguale a quello registrato, come legacy', (_l, senza) => {
    const legacyData = fresh(senza);
    const legacy = loadLegacy<L>(FUNCS, CONSTS, legacyData, '2026-10-31');
    const data = asDataset(fresh(senza));

    let map: AliasMap = {};
    const aliases: Record<string, string[]> = {};
    let total = 0;
    let recognized = 0;
    const titles = new Set<string>();

    for (const msg of messages) {
      const m = matchOf(data, msg.date);
      const mine = analyzePagelle(msg.text, m, data, map, aliases) as WaAnalysis;
      const theirs = legacy.__wa(m.id, msg.text);

      // 1) uguale a legacy, pagella per pagella
      expect(plainSlots(mine.slots)).toEqual(plainSlots(theirs.slots as never));
      expect(mine.res.score).toEqual(theirs.res.score);
      expect(mine.res.blocks.map(plainBlock)).toEqual((theirs.res.blocks as WaBlock[]).map(plainBlock));

      // 2) giusto davvero: il giocatore abbinato ha preso proprio quel voto in quella partita
      const ratings = real.ratings.filter((r) => r.matchId === m.id);
      for (const b of mine.res.blocks) {
        total++;
        expect(b.assign, `non abbinata: ${b.written} (${msg.file})`).toBeTruthy();
        const slot = mine.slots.find((s) => s.pk === b.assign) as WaSlot;
        const rating = ratings.find((r) => r.playerId === slot.player?.id);
        expect(rating, `nessun voto registrato per ${slot.name}`).toBeTruthy();
        expect(b.vote, `voto di ${slot.name} (${msg.file})`).toBe(Number(rating?.rating));
        recognized++;
        if (b.title) titles.add(b.title);
      }

      // 3) applica come fa la schermata e ricorda i soprannomi (stesso comportamento di legacy)
      legacy.__waApply();
      const applied = waApply(mine, () => true, map);
      for (const r of applied.remember) {
        const upd = waRemember(map, r.written, r.player);
        if (upd) {
          map = upd.map;
          aliases[r.player.id] = upd.aliases;
        }
      }
      expect(map).toEqual(legacy.waAliasMap());
    }

    expect(total).toBe(40);
    expect(recognized).toBe(40);
    // titoli veri citati nel README dei dati di prova
    for (const t of ['RISPARMIO ENERGETICO 🔋', 'MVP 🥇', 'ANTIDOPING 💉', 'TROY MCLURE', 'SI’, CHEF!', 'IN(PS)FERNALE', 'É UN BEL PRODOTTINO']) {
      expect(titles.has(t), 'titolo mancante: ' + t).toBe(true);
    }
  });

  it('"Gianluca" = Cioccolata: la prima volta per esclusione (da controllare), poi ricordato', () => {
    const data = asDataset(fresh(true));
    const cioccolata = data.players.find((p) => p.name === 'Cioccolata') as Player;
    let map: AliasMap = {};
    const aliases: Record<string, string[]> = {};
    let firstGuess: string | null = null;
    let afterwards: { guess: boolean | undefined; score: number } | null = null;
    for (const msg of messages) {
      const a = analyzePagelle(msg.text, matchOf(data, msg.date), data, map, aliases) as WaAnalysis;
      const g = a.res.blocks.find((b) => waNorm(b.written) === 'gianluca');
      if (g && firstGuess === null) {
        firstGuess = (a.slots.find((s) => s.pk === g.assign) as WaSlot).name;
        expect(g.guess).toBe(true); // per esclusione
        expect(g.m.score).toBe(0);
      } else if (g && afterwards === null) {
        afterwards = { guess: g.guess, score: g.m.score };
      }
      const ap = waApply(a, () => true, map);
      for (const r of ap.remember) {
        const upd = waRemember(map, r.written, r.player);
        if (upd) {
          map = upd.map;
          aliases[r.player.id] = upd.aliases;
        }
      }
    }
    expect(firstGuess).toBe('Cioccolata');
    expect(map['gianluca']).toBe(cioccolata.id);
    expect(aliases[cioccolata.id]).toContain('Gianluca');
    expect(afterwards).toEqual({ guess: undefined, score: 100 }); // poi riconosciuto subito, punteggio massimo
  });

  it('i corsivi in mezzo al testo restano nella descrizione', () => {
    const data = asDataset(fresh());
    const all = messages.flatMap((msg) => (analyzePagelle(msg.text, matchOf(data, msg.date), data, {}, {}) as WaAnalysis).res.blocks);
    expect(all.some((b) => b.desc.includes('_non abbiamo ruoli_'))).toBe(true);
    expect(all.some((b) => b.desc.includes('_amaro in bocca_'))).toBe(true);
  });
});

describe('messaggi rovinati a caso: stessi risultati di legacy', () => {
  const legacy = loadLegacy<L>(FUNCS, CONSTS, fresh(), '2026-10-31');
  const data = asDataset(fresh());

  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const NOISE = ['Altri 3 gol per lui', 'BLU 8 🔵', '⚪ *BIANCHI 2*', '', '   ', '*Peppe 6,5* ', 'NICO voto 5,5', 'MVP 🥇', 'boh 7', '_Rella 10_', 'Steppata 6½', 'Luciano 7+', 'Nico 5-', '*ZZ 3*'];
  function mangle(text: string, r: () => number): string {
    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const x = r();
      const line = lines[i] as string;
      if (x < 0.08) continue; // riga persa
      if (x < 0.14) out.push(line, line); // riga doppia
      else if (x < 0.2) out.push(NOISE[Math.floor(r() * NOISE.length)] as string, line);
      else if (x < 0.25) out.push(line.toUpperCase());
      else if (x < 0.29) out.push(line.replace(/\s+/g, ' ').trim());
      else if (x < 0.32 && i + 1 < lines.length) {
        out.push(lines[i + 1] as string, line); // scambio con la riga dopo
        i++;
      }
      else out.push(line);
    }
    return out.join(r() < 0.3 ? '\r\n' : '\n');
  }

  it('parseWhatsAppPagelle: 300 varianti dei messaggi veri', () => {
    let blocksSeen = 0;
    for (const msg of messages) {
      const m = matchOf(data, msg.date);
      const slots = waSlotsOfMatch(data, m);
      for (let seed = 1; seed <= 75; seed++) {
        const text = mangle(msg.text, rng(seed * 7919 + msg.date.length + Number(msg.date.slice(-2))));
        const mine = parseWhatsAppPagelle(text, slots, {});
        const theirs = legacy.parseWhatsAppPagelle(text, slots) as { blocks: WaBlock[]; score: unknown };
        expect(mine.score).toEqual(theirs.score);
        expect(mine.blocks.map(plainBlock)).toEqual(theirs.blocks.map(plainBlock));
        blocksSeen += mine.blocks.length;
      }
    }
    expect(blocksSeen).toBeGreaterThan(1000);
  });

  it('analisi completa (abbinamento + per esclusione) su varianti, uguale a legacy', () => {
    for (const msg of messages) {
      const m = matchOf(data, msg.date);
      for (let seed = 1; seed <= 25; seed++) {
        const text = mangle(msg.text, rng(seed * 104729));
        if (!text.trim()) continue;
        const mine = analyzePagelle(text, m, data, {}, {}) as WaAnalysis;
        const theirs = legacy.__wa(m.id, text);
        expect(mine.res.blocks.map(plainBlock)).toEqual((theirs.res.blocks as WaBlock[]).map(plainBlock));
      }
    }
  });
});

describe('nomi, titoli e formattazione', () => {
  const legacy = loadLegacy<L>(FUNCS, CONSTS, fresh(), '2026-10-31');
  const names = ['Rella', 'MartinoNico', 'Cioccolata', 'Peppe', 'Luciano', 'Steppata', 'Nico', 'André', "D'Angelo", 'Anna Maria', 'x'];

  it('waNorm e waWords come legacy', () => {
    for (const s of [...names, 'Èric', 'SI’, CHEF!', '  doppio   spazio ', '', null, 12]) {
      expect(waNorm(s)).toBe(legacy.waNorm(s));
      expect(waWords(s)).toEqual(legacy.waWords(s));
    }
    expect(waWords('MartinoNico')).toEqual(['martino', 'nico']);
  });

  it('waNameScore: 100 soprannome · 90 intero · 70 primo nome · 60 una parola · 40 inizio · 0', () => {
    const p: WaPlayer = { id: 'p1', name: 'MartinoNico', aliases: ['Il Capo'] };
    const cases: Array<[string, number, AliasMap]> = [
      ['il capo', 100, {}], ['Gianni', 100, { gianni: 'p1' }], ['martinonico', 90, {}], ['Martino', 70, {}], ['NICO', 60, {}],
      ['Mart', 40, {}], ['Ma', 0, {}], ['xyz', 0, {}], ['', 0, {}],
    ];
    for (const [cand, expected, map] of cases) {
      expect(waNameScore(cand, p, map)).toBe(expected);
      expect(waNameScore(cand, p, map)).toBe(legacy.waNameScore(cand, p, map));
    }
    expect(waNameScore('Martino', null, {})).toBe(0);
  });

  it('waBest: unico, ambiguo o nessuno — come legacy', () => {
    const slots: WaSlot[] = [
      { pk: 'bl-0', name: 'Nico Rossi', team: 'A', player: { id: 'a', name: 'Nico Rossi' } },
      { pk: 'bl-1', name: 'Nico Verdi', team: 'A', player: { id: 'b', name: 'Nico Verdi' } },
      { pk: 'bi-2', name: 'Luca', team: 'B', player: null },
    ];
    for (const n of ['Nico', 'Rossi', 'Luca', 'nico rossi', 'zzz', 'Ni']) {
      expect(waBest(n, slots, {})).toEqual(legacy.waBest(n, slots, {}));
    }
    expect(waBest('Nico', slots, {}).ambiguous).toHaveLength(2);
    expect(waBest('Luca', slots, {}).slot?.pk).toBe('bi-2');
  });

  it('waIsTitle come legacy', () => {
    const samples = ['RISPARMIO ENERGETICO 🔋', 'SI’, CHEF!', 'IN(PS)FERNALE', 'É UN BEL PRODOTTINO', 'Titolo normale', 'A', 'ok',
      'UNO DUE TRE QUATTRO CINQUE SEI SETTE OTTO NOVE DIECI', 'X'.repeat(61), '*MVP* 🥇', '_TROY MCLURE_', 'Mezzo MAIUSCOLO ok', '🔋🔋'];
    for (const s of samples) expect(waIsTitle(s)).toBe(legacy.waIsTitle(s));
    expect(waIsTitle('RISPARMIO ENERGETICO 🔋')).toBe(true);
    expect(waIsTitle('Titolo normale')).toBe(false);
  });

  it('waHTML: grassetto, corsivo e protezione dei caratteri speciali come legacy', () => {
    const samples = ['*grassetto* e _corsivo_', 'a _b_, c', '_inizio_ riga', "O'Neil <b>x</b> & \"y\"", '*a*\n_b_', 'snake_case_name', '', null, 'x * y * z'];
    for (const s of samples) expect(waHTML(s)).toBe(legacy.waHTML(s));
    expect(waHTML('<script>')).toBe('&lt;script&gt;');
  });
});

describe('abbinamento manuale', () => {
  const data = asDataset(fresh(true));
  it('waAssign: un giocatore non può ricevere due pagelle, e l\'abbinamento a mano non è più "da controllare"', () => {
    const msg = messages[2] as (typeof messages)[number]; // 21 ottobre: prima volta di "Gianluca"
    const a = analyzePagelle(msg.text, matchOf(data, msg.date), data, {}, {}) as WaAnalysis;
    const g = a.res.blocks.findIndex((b) => b.guess);
    expect(g).toBeGreaterThanOrEqual(0);
    const other = a.res.blocks.findIndex((b, i) => i !== g && b.assign);
    const target = a.res.blocks[other]?.assign as string;
    const b = waAssign(a, g, target);
    expect(b.res.blocks[g]?.assign).toBe(target);
    expect(b.res.blocks[g]?.guess).toBe(false);
    expect(b.res.blocks[other]?.assign).toBe(''); // tolto all'altra
    expect(a.res.blocks[other]?.assign).toBe(target); // l'originale non è stato modificato
    const c = waAssign(b, g, '');
    expect(c.res.blocks[g]?.assign).toBe('');
  });

  it('waApply: solo titolo e descrizione, solo le pagelle spuntate e assegnate', () => {
    const msg = messages[1] as (typeof messages)[number];
    const a = analyzePagelle(msg.text, matchOf(data, msg.date), data, {}, {}) as WaAnalysis;
    const r = waApply(a, (k) => k % 2 === 0, {});
    expect(r.items.length).toBe(a.res.blocks.filter((b, k) => k % 2 === 0 && b.assign).length);
    for (const it of r.items) expect(Object.keys(it).sort()).toEqual(['desc', 'pk', 'slot', 'title', 'written']); // niente voti, gol, risultato
  });

  it('messaggio vuoto: nessuna analisi; waRemember ignora nomi vuoti', () => {
    const m = matchOf(data, '2026-10-28');
    expect(analyzePagelle('   \n ', m, data)).toBeNull();
    expect(waRemember({}, '  ', { id: 'x', name: 'X' })).toBeNull();
    expect(waRemember({}, 'Gianluca', { id: 'x', name: 'X', aliases: ['Gianluca'] })?.aliases).toEqual(['Gianluca']);
  });
});
