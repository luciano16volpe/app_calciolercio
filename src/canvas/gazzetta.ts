// Gazzetta: compressa sul telefono (lato lungo max 2000 px, JPEG 0,86, come legacy: gazCompress) + miniatura leggera per elenchi.

/** Legge un'immagine e la riduce a `maxSide` px sul lato lungo, in JPEG (sfondo bianco). */
export async function compressImage(file: File, maxSide: number, quality: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error("Seleziona un'immagine");
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.src = url;
  try {
    await im.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('immagine non leggibile');
  }
  const s = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  x.drawImage(im, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Errore immagine'))), 'image/jpeg', quality));
}

export const compressGazzetta = (f: File) => compressImage(f, 2000, 0.86);
export const makeGazzettaThumb = (f: File) => compressImage(f, 500, 0.8);
