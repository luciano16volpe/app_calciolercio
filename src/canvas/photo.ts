// Foto del giocatore: ritaglio quadrato al centro, 200 px, JPEG qualità 0,7.

/** Legge un file immagine e lo restituisce ritagliato quadrato 200×200 in JPEG. */
export function resizeSquare(file: File, size = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error("Seleziona un'immagine"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Errore foto'))), 'image/jpeg', 0.7);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non valida'));
    };
    img.src = url;
  });
}
