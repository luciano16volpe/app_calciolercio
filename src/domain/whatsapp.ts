// Importazione delle pagelle da WhatsApp: lettura del messaggio e abbinamento dei nomi.
// Assegna SOLO titolo e descrizione: voti, gol e risultato non si toccano.
//
// Stili riconosciuti (da messaggi veri):
//  • "*Peppe 6,5* descrizione…" + ultima riga "_TITOLO_ 🔋" (anche a fine frase, o "TITOLO 🔩")
//  • "_NICO voto 5,5_" / "NICO 6,5" / "FILIPPO voto 5,5" + righe + ultima riga in MAIUSCOLO = titolo
//  • righe squadra "*BLU 8* 🔵" / "⚪ *BIANCHI 2*": separano solo le squadre (i numeri non si usano)
// Il voto serve solo a capire dove inizia la pagella di un giocatore. I corsivi in mezzo al testo restano.
import { esc } from './format';
import { normalizeTeam, playerKey } from './stats';
import type { Dataset, Match, Player } from './types';

/** Soprannomi imparati a mano ("Gianluca" → Cioccolata): nome scritto normalizzato e senza spazi → id giocatore. */
export type AliasMap = Record<string, string>;

/** Giocatore come lo vede l'abbinamento: id, nome e soprannomi già ricordati. */
export type WaPlayer = { id: string; name: string; aliases?: string[] };

/** Un giocatore della partita (un "posto" nella formazione) a cui si può abbinare una pagella. */
export interface WaSlot {
  /** 'bl-N' per i Blu, 'bi-N' per i Bianchi. */
  pk: string;
  name: string;
  team: 'A' | 'B';
  player: WaPlayer | null;
}

export interface WaMatch {
  score: number;
  slot: WaSlot | null;
  ambiguous: WaSlot[] | null;
}

export interface WaBlock {
  written: string;
  vote: number;
  lines: string[];
  m: WaMatch;
  title: string;
  desc: string;
  /** pk del posto assegnato ('' = nessuno). */
  assign?: string;
  /** abbinato per esclusione: da controllare. */
  guess?: boolean;
}

export interface WaParsed {
  blocks: WaBlock[];
  /** Risultato letto dalle righe squadra (non usato per salvare nulla). */
  score: { A?: number; B?: number };
}

/** Testo senza accenti, minuscolo, solo lettere e numeri separati da uno spazio. */
export const waNorm = (s: unknown): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Parole di un nome ("MartinoNico" → martino, nico). */
export const waWords = (name: unknown): string[] =>
  waNorm(String(name).replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2'))
    .split(' ')
    .filter(Boolean);

/**
 * Quanto un nome scritto punta a un giocatore (0 = per niente):
 * soprannome ricordato 100 > nome intero 90 > primo nome 70 > una parola 60 > inizio del nome 40.
 */
export function waNameScore(cand: string, p: WaPlayer | null, map: AliasMap): number {
  const cj = waNorm(cand).replace(/ /g, '');
  if (!cj || !p) return 0;
  const words = waWords(p.name);
  const full = words.join('');
  if (map[cj] === p.id || (p.aliases || []).some((a) => waNorm(a).replace(/ /g, '') === cj)) return 100;
  if (cj === full) return 90;
  if (words[0] === cj) return 70;
  if (words.includes(cj)) return 60;
  if (cj.length >= 3 && full.startsWith(cj)) return 40;
  return 0;
}

/** Miglior posto per un nome scritto: uno solo se il punteggio è netto, altrimenti "ambiguo". */
export function waBest(name: string, slots: WaSlot[], map: AliasMap): WaMatch {
  let best = 0;
  let cands: WaSlot[] = [];
  slots.forEach((s) => {
    const sc = waNameScore(name, s.player || { id: '', name: s.name }, map);
    if (sc > best) {
      best = sc;
      cands = [s];
    } else if (sc && sc === best) cands.push(s);
  });
  return { score: best, slot: cands.length === 1 ? (cands[0] as WaSlot) : null, ambiguous: cands.length > 1 ? cands : null };
}

// Cerca anche i singoli caratteri invisibili di variante (FE0F), unione (200D) e riquadro (20E3).
// eslint-disable-next-line no-misleading-character-class
const WA_EMO = /[\p{Extended_Pictographic}\ufe0f\u200d\u20e3]/gu;

/**
 * Emoji (e spazi) all'inizio della riga, ma SOLO se subito dopo c'è un * o un _ : è la pallina della squadra davanti a «*NOME 7*».
 * Una riga di descrizione che inizia con un'emoji («⚽ Peppe 2 gol») non viene toccata.
 */
const WA_LEAD_EMO = new RegExp('^[\\s\\p{Extended_Pictographic}' + String.fromCharCode(0xfe0f, 0x200d) + ']+(?=[*_])', 'u');

/** Un titolo è corto e (quasi) tutto maiuscolo: "RISPARMIO ENERGETICO", "SI’, CHEF!", "IN(PS)FERNALE". */
export function waIsTitle(s: string): boolean {
  const t = String(s).replace(WA_EMO, '').replace(/[*_~]/g, '').trim();
  const letters = t.match(/\p{L}/gu) || [];
  if (letters.length < 2 || t.length > 60 || t.split(/\s+/).length > 9) return false;
  return letters.filter((c) => c !== c.toLowerCase()).length / letters.length >= 0.85;
}

/** Legge il messaggio della Redazione e lo divide in pagelle (una per giocatore), con titolo e descrizione. */
export function parseWhatsAppPagelle(text: string, slots: WaSlot[], map: AliasMap = {}): WaParsed {
  const out: WaParsed = { blocks: [], score: {} };
  const HEAD =
    /^[\s*_~]*([\p{L}'’.]+(?:\s+[\p{L}'’.]+){0,2}?)\s*[-–:]?\s*(?:voto\s*)?(10|[1-9](?:[.,]\d{1,2})?)\s*(½|\+|-)?(?!\d)[\s*_~]*(?:[-–:]\s*)?(.*)$/iu;
  const TEAM = /^[^\p{L}\d]*(blu|bianchi)\s*(\d{1,2})?[^\p{L}\d]*$/iu;
  let cur: WaBlock | null = null;
  const close = () => {
    if (cur) {
      out.blocks.push(cur);
      cur = null;
    }
  };
  String(text)
    .replace(/\r/g, '')
    // WhatsApp mette a volte segni invisibili (direzione del testo, BOM) davanti alle righe: non sono testo
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')
    .split('\n')
    .forEach((raw) => {
      // «🔵*VITO 7,5* …» / «⚪*FABIO 7,5* …»: la pallina della squadra davanti al nome si ignora
      const line = raw.trim().replace(WA_LEAD_EMO, '');
      const tm = line.match(TEAM);
      if (tm) {
        close();
        if (tm[2] != null) out.score[(tm[1] as string).toLowerCase() === 'blu' ? 'A' : 'B'] = parseInt(tm[2]);
        return;
      }
      const hm = line.match(HEAD);
      if (hm) {
        const name = (hm[1] as string).trim();
        const marked = /^[*_]/.test(line);
        const caps = waIsTitle(name);
        const m = waBest(name, slots, map);
        // "Altri 3 gol per lui" non è un giocatore: nessun abbinamento, nessun grassetto/corsivo, non è in maiuscolo
        if (m.score > 0 || marked || caps) {
          close();
          let v = parseFloat((hm[2] as string).replace(',', '.'));
          if (hm[3] === '½') v += 0.5;
          else if (hm[3] === '+') v += 0.25;
          else if (hm[3] === '-') v -= 0.25;
          cur = { written: name, vote: v, lines: [], m, title: '', desc: '' };
          if (hm[4] && hm[4].trim()) cur.lines.push(hm[4].trim());
          return;
        }
      }
      if (cur) (cur as WaBlock).lines.push(raw.replace(/\s+$/, ''));
    });
  close();
  out.blocks.forEach((b) => {
    const ls = b.lines.map((l) => l.trim());
    while (ls.length && !ls[ls.length - 1]) ls.pop();
    let title = '';
    if (ls.length) {
      const last = ls[ls.length - 1] as string;
      if (waIsTitle(last)) {
        title = last;
        ls.pop();
      } else {
        const mm = last.match(/^(.*?)\s*_([^_]{2,60})_\s*([\p{Extended_Pictographic}\ufe0f\u200d\s]*)$/u);
        if (mm && waIsTitle(mm[2] as string)) {
          title = (mm[2] as string) + ((mm[3] as string).trim() ? ' ' + (mm[3] as string).trim() : '');
          ls[ls.length - 1] = mm[1] as string;
        }
      }
    }
    b.title = title.replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    b.desc = ls.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
  });
  return out;
}

/** I "posti" di una partita: tutti i giocatori delle due squadre, ognuno col suo giocatore in rosa (se c'è). */
export function waSlotsOfMatch(data: Dataset, m: Pick<Match, 'teamA' | 'teamB'>, aliases: Record<string, string[]> = {}): WaSlot[] {
  const A = normalizeTeam(m.teamA);
  const B = normalizeTeam(m.teamB);
  return [...A, ...B].map((pl, i) => {
    const k = playerKey(data.players, pl.id, pl.name);
    const rp = data.players.find((p: Player) => playerKey(data.players, p.id, p.name).key === k.key);
    const player: WaPlayer | null = rp ? { id: rp.id, name: rp.name, aliases: aliases[rp.id] ?? (rp as Player & { aliases?: string[] }).aliases } : null;
    return { pk: (i < A.length ? 'bl' : 'bi') + '-' + i, name: k.name, team: i < A.length ? ('A' as const) : ('B' as const), player };
  });
}

export interface WaAnalysis {
  matchId: string;
  res: WaParsed;
  slots: WaSlot[];
}

/**
 * Analizza il messaggio per una partita: legge le pagelle, abbina ogni nome a un giocatore (uno solo per posto),
 * e se resta una sola pagella e un solo giocatore senza pagella li abbina "per esclusione" (da controllare).
 * Messaggio vuoto → null.
 */
export function analyzePagelle(
  text: string,
  m: Pick<Match, 'id' | 'teamA' | 'teamB'>,
  data: Dataset,
  map: AliasMap = {},
  aliases: Record<string, string[]> = {},
): WaAnalysis | null {
  if (!text.trim()) return null;
  const slots = waSlotsOfMatch(data, m, aliases);
  const res = parseWhatsAppPagelle(text, slots, map);
  const used = new Set<string>();
  res.blocks.forEach((b) => {
    if (b.m.slot && !used.has(b.m.slot.pk)) {
      b.assign = b.m.slot.pk;
      used.add(b.assign);
    } else b.assign = '';
  });
  const freeB = res.blocks.filter((b) => !b.assign);
  const freeS = slots.filter((s) => !used.has(s.pk));
  if (freeB.length === 1 && freeS.length === 1) {
    (freeB[0] as WaBlock).assign = (freeS[0] as WaSlot).pk;
    (freeB[0] as WaBlock).guess = true;
    used.add((freeS[0] as WaSlot).pk);
  }
  return { matchId: m.id, res, slots };
}

/** Assegna a mano la pagella k a un posto ('' = ignora). Lo stesso giocatore non può ricevere due pagelle. */
export function waAssign(a: WaAnalysis, k: number, pk: string): WaAnalysis {
  const blocks = a.res.blocks.map((b, j) => {
    if (j === k) return { ...b, assign: pk, guess: false };
    if (pk && b.assign === pk) return { ...b, assign: '' };
    return b;
  });
  return { ...a, res: { ...a.res, blocks } };
}

export interface WaApplyItem {
  pk: string;
  slot: WaSlot | undefined;
  title: string;
  desc: string;
  written: string;
}

/**
 * Cosa scrivere nelle pagelle: SOLO titolo e descrizione, per le pagelle spuntate (`on`) e assegnate.
 * `remember` = soprannomi da ricordare (abbinati a mano o per esclusione, punteggio sotto 60): "Gianluca" → Cioccolata.
 */
export function waApply(
  a: WaAnalysis,
  on: (k: number) => boolean,
  map: AliasMap = {},
): { items: WaApplyItem[]; remember: Array<{ written: string; player: WaPlayer }> } {
  const items: WaApplyItem[] = [];
  const remember: Array<{ written: string; player: WaPlayer }> = [];
  a.res.blocks.forEach((b, k) => {
    if (!on(k) || !b.assign) return;
    const slot = a.slots.find((s) => s.pk === b.assign);
    items.push({ pk: b.assign, slot, title: b.title, desc: b.desc, written: b.written });
    if (slot && slot.player && waNameScore(b.written, slot.player, map) < 60) remember.push({ written: b.written, player: slot.player });
  });
  return { items, remember };
}

/** Ricorda un soprannome: aggiorna la mappa e l'elenco dei soprannomi del giocatore. Nome vuoto → nessun cambiamento. */
export function waRemember(
  map: AliasMap,
  written: string,
  p: WaPlayer,
): { map: AliasMap; aliases: string[] } | null {
  const k = waNorm(written).replace(/ /g, '');
  if (!k || !p) return null;
  return { map: { ...map, [k]: p.id }, aliases: [...new Set([...(p.aliases || []), written.trim()])] };
}

/** Formato WhatsApp → HTML (dopo aver messo in sicurezza il testo): *grassetto* e _corsivo_. */
export const waHTML = (s: unknown): string =>
  esc(s)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/gm, '$1<i>$2</i>');

// ── Perché il messaggio non è stato capito ─────────────────────────────────

const EXAMPLE = 'Il formato giusto è «*Peppe 6,5*» (nome e voto insieme, dentro gli asterischi) oppure «Peppe 6,5» su una riga sua, poi la descrizione e, a fine pagella, il titolo in MAIUSCOLO.';
const NAME = String.raw`[\p{L}'’.]+(?:\s+[\p{L}'’.]+){0,2}`;
const VOTE = String.raw`(?:10|[1-9](?:[.,]\d{1,2})?)`;
/** "[28/10/26, 21:30] Luciano: …" oppure "28/10/2026, 21:30 - Luciano: …" (esportazione della chat). */
const CHAT_EXPORT = /^[\s[]*\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}[:.]\d{2}/mu;
/** "*Peppe* 6,5" / "*Peppe*: 6,5": il voto è fuori dagli asterischi. */
const VOTE_OUTSIDE = new RegExp(String.raw`^[\s*_~]*${NAME}[*_~]+\s*[-–:]?\s*(?:voto\s*)?${VOTE}(?!\d)`, 'mu');
/** "*Peppe (6,5)*" / "Peppe [6,5]": voto tra parentesi. */
const VOTE_BRACKETS = new RegExp(String.raw`^[\s*_~]*${NAME}\s*[([]\s*${VOTE}\s*[)\]]`, 'mu');
/** Un "nome e voto" (per contare quanti ce ne sono nel testo). */
const VOTE_ANYWHERE = new RegExp(String.raw`(?:^|\s)[*_~]*${NAME}\s*[-–:]?\s*(?:voto\s*)?${VOTE}(?!\d)`, 'gu');

/**
 * Se il messaggio non è stato letto bene, spiega in italiano semplice perché e come correggerlo.
 * Restituisce null se tutto è a posto (pagelle trovate e almeno un giocatore riconosciuto).
 * Non cambia mai il modo in cui il messaggio viene letto: serve solo a spiegare.
 */
export function whatsappProblem(text: string, a: WaAnalysis | null): string | null {
  const t = String(text).replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '');
  if (!t.trim() || !a) return 'Incolla prima il messaggio delle pagelle.';
  const blocks = a.res.blocks;
  if (blocks.some((b) => b.assign)) return null;
  const lines = t.split('\n').filter((l) => l.trim());
  if (lines.length <= 2 && t.length > 200 && (t.match(VOTE_ANYWHERE) ?? []).length >= 2) {
    return 'Il messaggio è tutto su una riga: manca l\'a capo tra una pagella e l\'altra, quindi non so dove inizia ognuna. Incollalo dal messaggio originale mantenendo gli a capo. ' + EXAMPLE;
  }
  if (CHAT_EXPORT.test(t)) {
    return 'Il messaggio sembra copiato dall\'esportazione della chat, con data e ora davanti a ogni riga. Incolla solo il testo delle pagelle, senza data, ora e nome di chi scrive. ' + EXAMPLE;
  }
  if (VOTE_OUTSIDE.test(t)) {
    return 'Ho trovato righe come «*Peppe* 6,5»: il voto è fuori dagli asterischi e non riesco a leggerlo. Scrivilo dentro, come «*Peppe 6,5*». ' + EXAMPLE;
  }
  if (VOTE_BRACKETS.test(t)) {
    return 'Ho trovato voti tra parentesi, come «Peppe (6,5)»: non riesco a leggerli. Scrivili senza parentesi, come «*Peppe 6,5*». ' + EXAMPLE;
  }
  if (blocks.length) {
    const read = blocks.slice(0, 4).map((b) => `«${b.written}»`).join(', ');
    return `Ho letto ${blocks.length} ${blocks.length === 1 ? 'pagella' : 'pagelle'} (${read}) ma nessun nome corrisponde ai giocatori di questa partita. Hai aperto la partita giusta? Altrimenti scegli a mano il giocatore dall'elenco accanto a ogni nome.`;
  }
  if (!/\d/.test(t)) {
    return 'Nel messaggio non c\'è nessun voto (un numero come 6 o 6,5 accanto al nome). ' + EXAMPLE;
  }
  return 'Non riesco a trovare le pagelle: non vedo righe con nome e voto, come «*Peppe 6,5*». Controlla di aver incollato tutto il messaggio. ' + EXAMPLE;
}
