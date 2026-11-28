// Caricamento delle foto e del logo per le immagini da condividere.
// Le foto arrivano da Supabase Storage: serve `crossOrigin` perché la tela non diventi "contaminata" (altrimenti il salvataggio fallisce).
const cache = new Map<string, Promise<HTMLImageElement | null>>();
const embeddedCache = new Map<string, Promise<string | null>>();

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

/** Copia ridotta della foto principale incorporabile in un SVG da esportare come PNG. */
export function embeddedPhoto(url: string | null | undefined): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let pending = embeddedCache.get(url);
  if (!pending) {
    pending = loadImage(url).then((image) => {
      if (!image) return null;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2,
        side, side, 0, 0, 160, 160);
      try { return canvas.toDataURL('image/png'); } catch { return null; }
    });
    embeddedCache.set(url, pending);
  }
  return pending;
}

/** Il logo dell'app (quello nell'intestazione). */
export const loadLogo = (): Promise<HTMLImageElement | null> => loadImage('/logo.png');
