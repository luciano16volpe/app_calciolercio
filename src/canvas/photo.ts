// Foto del giocatore: conserva l'inquadratura originale, fino a 1600 px, JPEG qualità 0,9.

/** Riduce solo le foto grandi, mantenendo proporzioni e risoluzione delle foto piccole. */
export function preparePlayerPhoto(file: File, maxSide = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error("Seleziona un'immagine"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Errore foto'))), 'image/jpeg', 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non valida'));
    };
    img.src = url;
  });
}
