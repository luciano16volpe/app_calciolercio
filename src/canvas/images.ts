// Caricamento delle foto e del logo per le immagini da condividere.
// Le foto arrivano da Supabase Storage: serve `crossOrigin` perché la tela non diventi "contaminata" (altrimenti il salvataggio fallisce).
const cache = new Map<string, Promise<HTMLImageElement | null>>();

/** Foto pronta da disegnare, oppure null se manca o non si carica (allora si disegnano le iniziali). */
export function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im.naturalWidth ? im : null);
      im.onerror = () => resolve(null);
      im.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** Il logo dell'app (quello nell'intestazione). */
export const loadLogo = (): Promise<HTMLImageElement | null> => loadImage('/logo.png');
