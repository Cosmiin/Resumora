/** Makes one encoded copy of the photo at a scale (1 = full size) and a JPEG quality (0–1). */
export type Encode = (scale: number, quality: number) => Promise<Blob>;

const QUALITIES = [0.9, 0.8, 0.7];
const SCALE_STEP = 0.75;
/** After this many size steps (about 7% of the width) the loop ends, so it always finishes. */
const MAX_SIZE_STEPS = 10;

/** Lowers the quality, then the size, until the photo fits under `limit` bytes; null if it never does. */
export async function shrinkToFit(encode: Encode, limit: number): Promise<Blob | null> {
  let scale = 1;
  for (let step = 0; step < MAX_SIZE_STEPS; step++) {
    for (const quality of QUALITIES) {
      const blob = await encode(scale, quality);
      if (blob.size <= limit) return blob;
    }
    scale *= SCALE_STEP;
  }
  return null;
}

/** Shrinks a photo file in the browser into a JPEG under `limit` bytes; null if it can't be read or made to fit. */
export async function shrinkPhoto(file: File, limit: number): Promise<Blob | null> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const encode: Encode = (scale, quality) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return Promise.reject(new Error("no canvas"));
      // JPEG has no transparency: a see-through PNG gets a white background, not black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", quality));
    };
    return await shrinkToFit(encode, limit);
  } catch {
    return null;
  } finally {
    image.close();
  }
}
