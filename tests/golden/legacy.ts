// Carica funzioni dall'app attuale (legacy/index.html) in un ambiente isolato, così i test
// possono confrontare i risultati della versione legacy con quelli della nuova.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { recorderSource } from './canvasRecorder';

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
  // l'ultima dichiarazione, come a runtime (se una funzione è scritta due volte vale l'ultima)
  const start = [...html.matchAll(new RegExp(`^(?:async )?function ${name}\\(`, 'gm'))].pop()?.index ?? -1;
  if (start < 0) throw new Error(`Funzione legacy non trovata: ${name}`);
  const open = html.indexOf('{', html.indexOf(')', start));
  return html.slice(start, skipCode(html, open + 1));
}

/** `const NOME = ...;` su una riga, oppure su più righe fino alla riga che inizia con `];` o `};`. */
function extractConst(name: string): string {
  const m = html.match(new RegExp(`^const ${name}\\s*=.*`, 'm'));
  if (!m || m.index === undefined) throw new Error(`Costante legacy non trovata: ${name}`);
  if (/;\s*(\/\/.*)?$/.test(m[0])) return m[0];
  // su più righe: fino al primo `;` fuori da parentesi, stringhe e template
  let i = m.index + m[0].indexOf('=') + 1;
  let depth = 0;
  while (i < html.length) {
    const c = html[i];
    if (c === '"' || c === "'") i = skipQuoted(html, i);
    else if (c === '`') i = skipTemplate(html, i);
    else if (c === '/' && html[i + 1] === '/') i = html.indexOf('\n', i) + 1 || html.length;
    else {
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') depth--;
      else if (c === ';' && depth === 0) return html.slice(m.index, i + 1);
      i++;
    }
  }
  throw new Error(`Fine della costante legacy non trovata: ${name}`);
}

export interface LegacyData {
  players: unknown[];
  weights: number[];
  matches: unknown[];
  ratings: unknown[];
  albo?: unknown[];
  gazzette?: unknown[];
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
    var __el={innerHTML:'',textContent:'',style:{},scrollIntoView:function(){},querySelectorAll:function(){return [];}}, __scope='all', document={getElementById:function(id){ if(!__multi) return __el; return __els[id]||(__els[id]={innerHTML:'',textContent:'',style:{},attrs:{},setAttribute:function(k,v){this.attrs[k]=v;},scrollIntoView:function(){},querySelectorAll:function(){return [];}}); },querySelectorAll:function(){return [];}}, __els={}, __multi=false, backendUrl='x';
    function __multiOn(b){__multi=b;__els={};}
    function __getEl(id){return __els[id];}
    function __idx(i){currentIdx=i;renderResult();}
    function __swap(a,b){swapPlayers(a,b);}
    function __combo(){return allCombos[currentIdx];}
    function __sel(arr){selected=new Set(arr);}
    function renderScorers(){}
    var sizeA=5, sizeB=5, selected=new Set(), allCombos=[], currentIdx=0, genBest=null, bachecaOpen=false, clTab='marcatori', statsSort={col:'goals',dir:-1}, statsFilter='regulars', cmpA=null, cmpB=null;
    function futPreload(){}
    var __logo=null, __viewer=null, futPhotoCache={};
    function __setLogo(l){__logo=l;}
    document.createElement=function(){return __mkCanvas();};
    document.querySelector=function(){return __logo;};
    function openImageViewer(t,c,n,x){__viewer={title:t,canvas:c,name:n,text:x};}
    function shareCanvas(c,n,x){__viewer={title:null,canvas:c,name:n,text:x};}
    function __viewerGet(){return __viewer;}
    function __stats(c,d,f){statsSort={col:c,dir:d};statsFilter=f;}
    function __cmp(a,b){cmpA=a;cmpB=b;}
    function __tab(t){clTab=t;}
    var __toasts=[], __calls=[], __confirms=[], __confirmAnswer=true;
    function toast(m){__toasts.push(m);}
    async function backendCall(n,p){__calls.push([n,p]);return {};}
    function confirmModal(o){__confirms.push(o);return Promise.resolve(__confirmAnswer);}
    function closeMatchModal(){}
    async function loadMatches(){}
    function __setVals(o){Object.keys(o).forEach(function(k){document.getElementById(k).value=o[k];});}
    function __cap(){return {toasts:__toasts,calls:__calls,confirms:__confirms};}
    function __answer(b){__confirmAnswer=b;}
    function __reset(){__toasts=[];__calls=[];__confirms=[];}
    function __players(){return players;}
    var rosaCardIdx=null;
    function futMiniHTML(){return '';}
    function fitPhotoBand(){}
    function buildRosa(){}
    function buildConvList(){}
    function openRosaCard(){}
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
    function __set(p,w,m,r,a,g){players=p;weights=w;matches=m;matchesCache={timestamp:0,data:{ratings:r,albo:a||[],gazzette:g||[]}};_seasonMemo={};_evMemo=null;}
  `;
  const src = [recorderSource, prelude, ...consts.map(extractConst), ...functions.map(extractFunction)].join('\n');
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
  const api = vm.runInContext(`({__players,__setVals,__cap,__answer,__reset,__setLogo,__viewerGet,__set,__useForm,__run,__gen,__wa,__waApply,__draw,__tab,__stats,__cmp,__multiOn,__getEl,__idx,__swap,__combo,__sel,${names}})`, sandbox) as T & {
    __set: (...a: unknown[]) => void;
    __setLogo: (l: unknown) => void;
    __players: () => Array<{ stats: number[]; roles: string[] }>;
    __setVals: (o: Record<string, string>) => void;
    __cap: () => { toasts: string[]; calls: Array<[string, Record<string, unknown>]>; confirms: Array<Record<string, unknown>> };
    __answer: (b: boolean) => void;
    __reset: () => void;
    __viewerGet: () => { title: string | null; canvas: unknown; name: string; text: string } | null;
    __useForm: (b: boolean) => void;
    __run: (fn: () => void, scope: string) => string;
    __gen: (sa: number, sb: number, sel: number[]) => { combos: unknown[]; genBest: number | null };
    __wa: (id: string, txt: string) => unknown;
    __waApply: () => void;
    __draw: (i: number) => string;
    __tab: (t: string) => void;
    __multiOn: (b: boolean) => void;
    __getEl: (id: string) => { innerHTML: string; textContent: string; style: Record<string, string>; attrs: Record<string, string> } | undefined;
    __idx: (i: number) => void;
    __swap: (a: number, b: number) => void;
    __combo: () => unknown;
    __sel: (a: number[]) => void;
    __stats: (c: string, d: number, f: string) => void;
    __cmp: (a: string | null, b: string | null) => void;
  };
  api.__set(data.players, data.weights, data.matches, data.ratings, data.albo, data.gazzette);
  return api;
}
