// Carica funzioni dall'app attuale (legacy/index.html) in un ambiente isolato, così i test
// possono confrontare i risultati della versione legacy con quelli della nuova.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(process.cwd(), 'legacy', 'index.html'), 'utf8');

/** Testo di `function nome(...) {...}` (parentesi graffe bilanciate, ignorando stringhe e commenti). */
function extractFunction(name: string): string {
  const start = html.search(new RegExp(`^function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(`Funzione legacy non trovata: ${name}`);
  let i = html.indexOf('{', html.indexOf(')', start));
  let depth = 0;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; html[i] !== c; i++) if (html[i] === '\\') i++;
    } else if (c === '/' && html[i + 1] === '/') {
      i = html.indexOf('\n', i);
    } else if (c === '/' && html[i + 1] === '*') {
      i = html.indexOf('*/', i) + 1;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Parentesi non bilanciate in ${name}`);
}

/** Riga `const NOME = ...;` su una sola riga. */
function extractConst(name: string): string {
  const m = html.match(new RegExp(`^const ${name}\\s*=.*;`, 'm'));
  if (!m) throw new Error(`Costante legacy non trovata: ${name}`);
  return m[0];
}

export interface LegacyData {
  players: unknown[];
  weights: number[];
  matches: unknown[];
  ratings: unknown[];
}

/** Ambiente legacy con le funzioni richieste e i dati caricati. */
export function loadLegacy<T extends Record<string, unknown>>(
  functions: string[],
  consts: string[],
  data: LegacyData,
  today?: string,
): T {
  const prelude = `
    var players=[], weights=[], matches=[], matchesCache={timestamp:0,data:null}, _seasonMemo={}, useFormInBalance=true, _formCache=null;
    function __useForm(b){useFormInBalance=b;}
    function __set(p,w,m,r){players=p;weights=w;matches=m;matchesCache={timestamp:0,data:{ratings:r}};_seasonMemo={};}
  `;
  const src = [prelude, ...consts.map(extractConst), ...functions.map(extractFunction)].join('\n');
  const names = functions.concat(consts).join(',');
  const sandbox: Record<string, unknown> = { localStorage: { getItem: () => null }, console };
  if (today) {
    // data "di oggi" fissa, per seasonStatus
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...a: unknown[]) {
        // @ts-expect-error argomenti variabili
        super(...(a.length ? a : [today + 'T12:00:00']));
      }
      static now() {
        return new RealDate(today + 'T12:00:00').getTime();
      }
    }
    sandbox.Date = FixedDate;
  }
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const api = vm.runInContext(`({__set,__useForm,${names}})`, sandbox) as T & {
    __set: (...a: unknown[]) => void;
    __useForm: (b: boolean) => void;
  };
  api.__set(data.players, data.weights, data.matches, data.ratings);
  return api;
}
