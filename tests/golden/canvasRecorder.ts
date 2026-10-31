// Tela finta che registra tutto ciò che viene disegnato (chiamate e impostazioni, in ordine).
// Lo stesso identico codice gira dentro legacy e per la nuova versione: se i registri sono uguali, le immagini sono uguali.
// È una stringa di codice (non una funzione) perché deve poter essere eseguita anche dentro l'ambiente isolato di legacy.
export const recorderSource = `
function __mkCanvas(){
  var log=[], state={};
  var canvas={width:0,height:0,__log:log};
  var ctx={};
  ['save','restore','translate','rotate','scale','beginPath','closePath','moveTo','lineTo','arc','arcTo','rect',
   'bezierCurveTo','quadraticCurveTo','fill','stroke','clip','fillRect','strokeRect','fillText','drawImage'].forEach(function(n){
    ctx[n]=function(){ log.push([n].concat([].slice.call(arguments))); };
  });
  ctx.measureText=function(t){
    var m=/(\\d+(?:\\.\\d+)?)px/.exec(state.font||''); var s=m?parseFloat(m[1]):10;
    return {width:String(t).length*s*0.55};
  };
  function grad(kind){ return function(){
    return {kind:kind,args:[].slice.call(arguments),stops:[],addColorStop:function(o,c){ this.stops.push([o,c]); }};
  }; }
  ctx.createLinearGradient=grad('linear');
  ctx.createRadialGradient=grad('radial');
  ['font','fillStyle','strokeStyle','textAlign','lineWidth','globalAlpha','globalCompositeOperation','shadowColor','shadowBlur',
   'shadowOffsetY','lineCap'].forEach(function(n){
    Object.defineProperty(ctx,n,{get:function(){return state[n];},set:function(v){ state[n]=v; log.push(['=',n,v]); }});
  });
  canvas.getContext=function(){ return ctx; };
  return canvas;
}
`;

/** Foto finta: serve solo il formato (larghezza e altezza) e un nome per riconoscerla nel registro. */
export const fakeImage = (id: string, w = 200, h = 300) => ({ id, naturalWidth: w, naturalHeight: h, complete: true });

/** Crea una tela registratrice nell'ambiente di Node (per la nuova versione). */
export function makeRecorderCanvas(): HTMLCanvasElement & { __log: unknown[] } {
  return new Function(`${recorderSource}; return __mkCanvas();`)() as HTMLCanvasElement & { __log: unknown[] };
}

/** Il registro in forma di testo, pronto da confrontare. */
export const logOf = (c: unknown): string => JSON.stringify({ w: (c as { width: number }).width, h: (c as { height: number }).height, log: (c as { __log: unknown[] }).__log });
