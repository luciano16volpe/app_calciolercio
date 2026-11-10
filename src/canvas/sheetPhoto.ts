// Foto del foglio partita → conteggio delle X (gol, assist, autogol) di ogni giocatore.
import { sheetLayout } from '../domain/sheetLayout';
import { scanSheet, withExtras, type GrayImage, type ScanResult } from '../domain/sheetScan';

const MAX_SIDE = 1600; // oltre non serve: la lettura resta veloce anche su telefoni lenti

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file); // rispetta come era girato il telefono quando ha scattato
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* si riprova con un'immagine normale */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Immagine non valida'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Immagine in toni di grigio, ridotta a MAX_SIDE. */
export async function grayFromFile(file: File): Promise<GrayImage> {
  if (!file.type.startsWith('image/')) throw new Error("Scegli una foto (un'immagine).");
  const d = await decode(file);
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(d.width, d.height));
    const w = Math.max(1, Math.round(d.width * k)), h = Math.max(1, Math.round(d.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(d.source, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = ((px[p] as number) * 299 + (px[p + 1] as number) * 587 + (px[p + 2] as number) * 114) / 1000;
    return { data: gray, width: w, height: h };
  } finally {
    d.close();
  }
}

/** Legge la foto del foglio di una partita con `nA` e `nB` giocatori (con o senza riga di descrizione sotto il titolo). */
export async function readSheetPhoto(file: File, nA: number, nB: number): Promise<ScanResult> {
  const img = await grayFromFile(file);
  return withExtras(scanSheet(img, [sheetLayout(nA, nB, true), sheetLayout(nA, nB, false)]), nA, nB);
}
