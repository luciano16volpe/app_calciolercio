// Visualizzatore a schermo intero delle immagini generate (figurina, riepilogo, formazioni…): prima si guarda,
// poi si decide se condividere o salvare.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from './Toast';
import { TiltImage, useGyro } from './TiltImage';

interface Shown {
  title: string;
  url: string;
  blob: Blob;
  name: string;
  text: string;
  /** Figurina: la luce segue il dito o l'inclinazione. `holo` = riflessi arcobaleno (livelli alti). */
  tilt?: { holo: boolean };
}

export interface ShowOptions {
  tilt?: { holo: boolean };
}

interface ImageTools {
  /** Mostra l'immagine a schermo intero, con Condividi e Salva. */
  showImage: (title: string, canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>, name: string, text: string, opts?: ShowOptions) => void;
  /** Condivide subito l'immagine (o la salva, se il telefono non ha la finestra di condivisione). */
  shareCanvas: (canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>, name: string, text: string) => void;
}

const ImageContext = createContext<ImageTools>({ showImage: () => undefined, shareCanvas: () => undefined });
export const useImageTools = () => useContext(ImageContext);

/** Libera la memoria di una tela già convertita in file (le figurine sono 1440×2280). */
function releaseCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}

function download(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 300);
}

/** Prova la finestra di condivisione del telefono; restituisce true se ha gestito lei (condiviso o annullato). */
async function tryShare(blob: Blob, name: string, text: string): Promise<boolean> {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'CalcioLercio', text });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true;
    }
  }
  return false;
}

export function ImageProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [shown, setShown] = useState<Shown | null>(null);
  const [zoom, setZoom] = useState(false);
  const last = useRef<Shown | null>(null);
  const gyro = useGyro(!!shown?.tilt);

  const close = useCallback(() => setShown(null), []);
  // l'indirizzo temporaneo dell'immagine si libera quando se ne apre un'altra o si chiude la finestra
  useEffect(() => {
    const prev = last.current;
    last.current = shown;
    if (prev && prev !== shown) URL.revokeObjectURL(prev.url);
  }, [shown]);

  const showImage = useCallback(function showCanvasImage(title: string, canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>, name: string, text: string, opts?: ShowOptions) {
    if ('then' in canvas) {
      toast('Preparo immagine...');
      void canvas.then((ready) => showCanvasImage(title, ready, name, text, opts)).catch(() => toast('Impossibile preparare l’immagine. Riprova.'));
      return;
    }
    canvas.toBlob((blob) => {
      releaseCanvas(canvas); // su iPhone la memoria delle tele grandi è limitata: si libera subito
      if (!blob) {
        toast('Errore immagine');
        return;
      }
      setZoom(false);
      setShown({ title, blob, url: URL.createObjectURL(blob), name, text, tilt: opts?.tilt });
    }, 'image/png');
  }, [toast]);

  const shareCanvas = useCallback(function shareCanvasImage(canvas: HTMLCanvasElement | Promise<HTMLCanvasElement>, name: string, text: string) {
    toast('⏳ Genero immagine...');
    if ('then' in canvas) {
      toast('Preparo immagine...');
      void canvas.then((ready) => shareCanvasImage(ready, name, text)).catch(() => toast('Impossibile preparare l’immagine. Riprova.'));
      return;
    }
    canvas.toBlob((blob) => {
      releaseCanvas(canvas); // su iPhone la memoria delle tele grandi è limitata: si libera subito
      if (!blob) {
        toast('Errore immagine');
        return;
      }
      void (async () => {
        if (await tryShare(blob, name, text)) return;
        const url = URL.createObjectURL(blob);
        download(url, name);
        window.setTimeout(() => URL.revokeObjectURL(url), 200);
        toast('Immagine salvata');
      })();
    }, 'image/png');
  }, [toast]);

  const tools = useMemo(() => ({ showImage, shareCanvas }), [showImage, shareCanvas]);
  const shareShown = async () => {
    if (!shown) return;
    if (await tryShare(shown.blob, shown.name, shown.text)) return;
    download(shown.url, shown.name); // niente finestra di condivisione (computer): si salva
    toast('⬇️ Immagine salvata');
  };

  return (
    <ImageContext.Provider value={tools}>
      {children}
      {shown ? (
        <div id="img-viewer" style={{ display: 'flex' }}>
          <div className="gv-top">
            <span>{shown.title}</span>
            <button type="button" onClick={close} aria-label="Chiudi">✕</button>
          </div>
          <div className={`gv-img${zoom ? ' zoom' : ''}`} onClick={() => setZoom((z) => !z)}>
            {shown.tilt && !zoom ? <TiltImage url={shown.url} alt={shown.title} holo={shown.tilt.holo} subscribe={gyro.subscribe} /> : <img src={shown.url} alt={shown.title} decoding="async" />}
          </div>
          <div className="gv-note">
            {shown.tilt ? 'Muovi il dito sulla figurina per farla brillare. Tocca per ingrandirla.' : "Tocca l'immagine per ingrandirla."}
            {gyro.needsPermission ? <button type="button" className="gv-tilt-btn" onClick={() => void gyro.enable()}>✨ Fai brillare inclinando il telefono</button> : null}
          </div>
          <div className="gv-btns">
            <button type="button" onClick={() => void shareShown()}>📲 Condividi</button>
            <button type="button" onClick={() => { download(shown.url, shown.name); toast('⬇️ Immagine salvata'); }}>⬇️ Salva</button>
          </div>
        </div>
      ) : null}
    </ImageContext.Provider>
  );
}
