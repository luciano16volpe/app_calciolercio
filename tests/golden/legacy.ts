// Carica funzioni dall'app attuale (legacy/index.html) in un ambiente isolato, così i test
// possono confrontare i risultati della versione legacy con quelli della nuova.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const html = readFileSync(join(process.cwd(), 'legacy', 'index.html'), 'utf8');

/** Salta una stringa tra apici e restituisce l'indice dopo la chiusura. */
function skipQuoted(s: string, i: number): number {
  const q = s[i];
  for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++;
  return i + 1;
}

/** Salta un template tra backtick, compresi quelli annidati dentro ${…}, e restituisce l'indice dopo la chiusura. */
function skipTemplate(s: string, i: number): number {
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '`') return i + 1;
    else if (c === '$' && s[i + 1] === '{') i = skipCode(s, i + 2) - 1;
  }
  return i;
}

/** Scorre codice fino alla `}` che chiude il livello corrente; restituisce l'indice dopo di essa. */
function skipCode(s: string, i: number): number {
  let depth = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") i = skipQuoted(s, i);
    else if (c === '`') i = skipTemplate(s, i);
    else if (c === '/' && s[i + 1] === '/') i = s.indexOf('\n', i) + 1 || s.length;
    else if (c === '/' && s[i + 1] === '*') i = s.indexOf('*/', i) + 2;
    else {
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i + 1;
      i++;
    }
  }
  throw new Error('Parentesi non bilanciate');
}

/** Testo di `function nome(...) {...}` (parentesi graffe bilanciate, ignorando stringhe, template e commenti). */
function extractFunction(name: string): string {
  const start = html.search(new RegExp(`^function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(`Funzione legacy non trovata: ${name}`);
  const open = html.indexOf('{', html.indexOf(')', start));
  return html.slice(start, skipCode(html, open + 1));
}

/** `const NOME = ...;` su una riga, oppure su più righe fino alla riga che inizia con `];` o `};`. */
function extractConst(name: string): string {
  const m = html.match(new RegExp(`^const ${name}\\s*=.*`, 'm'));
  if (!m || m.index === undefined) throw new Error(`Costante legacy non trovata: ${name}`);
  if (/;\s*(\/\/.*)?$/.test(m[0])) return m[0];
  const end = html.slice(m.index).search(/^[\]}];/m);
  return html.slice(m.index, m.index + end + 2);
}

export interface LegacyData {
  players: unknown[];
  weights: number[];
  matches: unknown[];
  ratings: unknown[];
  albo?: unknown[];
}

/** Ambiente legacy con le funzioni richieste e i dati caricati. */
export function loadLegacy<T extends Record<string, unknown>>(
  functions: string[],
  consts: string[],
  data: LegacyData,
  today?: string,
): T {
  const prelude = `
    var players=[], weights=[], matches=[], matchesCache={timestamp:0,data:null}, _seasonMemo={}, useFormInBalance=true, _formCache=null, _evMemo=null;
    function __useForm(b){useFormInBalance=b;}
    var __el={innerHTML:'',textContent:'',style:{},scrollIntoView:function(){}}, __scope='all', document={getElementById:function(){return __el;}};
    var sizeA=5, sizeB=5, selected=new Set(), allCombos=[], currentIdx=0, genBest=null, bachecaOpen=false, clTab='marcatori';
    function __tab(t){clTab=t;}
    function toast(){}
    function save(){}
    function pgtViewHTML(){return '';}
    function waRenderPreview(){}
    var _wa=null;
    function __wa(id,txt){__el.value=txt;__el.checked=true;waAnalyze(id);return _wa;}
    function __waApply(){waApply();}
    function __draw(i){var c={innerHTML:''};drawPagelle(i,players[i],c);return c.innerHTML;}
    function renderResult(){}
    function setTimeout(){}
    function __gen(sa,sb,sel){sizeA=sa;sizeB=sb;selected=new Set(sel);allCombos=[];genBest=null;generateTeams();return {combos:allCombos,genBest:genBest};}
    function clCurrentScope(){return __scope;}
    function __run(fn,scope){__scope=scope;__el.innerHTML='';fn();return __el.innerHTML;}
    function __set(p,w,m,r,a){players=p;weights=w;matches=m;matchesCache={timestamp:0,data:{ratings:r,albo:a||[]}};_seasonMemo={};_evMemo=null;}
  `;
  const src = [prelude, ...consts.map(extractConst), ...functions.map(extractFunction)].join('\n');
  const names = functions.concat(consts).join(',');
  const store = new Map<string, string>(); // memoria del telefono (soprannomi imparati, ecc.)
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: unknown) => void store.set(k, String(v)) };
  const sandbox: Record<string, unknown> = { localStorage, console };
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
  const api = vm.runInContext(`({__set,__useForm,__run,__gen,__wa,__waApply,__draw,__tab,${names}})`, sandbox) as T & {
    __set: (...a: unknown[]) => void;
    __useForm: (b: boolean) => void;
    __run: (fn: () => void, scope: string) => string;
    __gen: (sa: number, sb: number, sel: number[]) => { combos: unknown[]; genBest: number | null };
    __wa: (id: string, txt: string) => unknown;
    __waApply: () => void;
    __draw: (i: number) => string;
    __tab: (t: string) => void;
  };
  api.__set(data.players, data.weights, data.matches, data.ratings, data.albo);
  return api;
}
