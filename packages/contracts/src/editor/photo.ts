/** Coordinates always refer to the full, orientation-normalized source. */
export type PhotoCrop = { version: 1; centerX: number; centerY: number; zoom: number };
export type CvPhoto = { assetId: string; crop: PhotoCrop; shape: "circle" | "square"; visible: boolean };
export const defaultPhotoCrop: PhotoCrop = { version: 1, centerX: .5, centerY: .5, zoom: 1 };
export const photoUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function isPhoto(value: unknown): value is CvPhoto | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as CvPhoto, c = p.crop;
  return Object.keys(p).length === 4 && photoUuid(p.assetId) && typeof p.visible === 'boolean'
    && ['circle', 'square'].includes(p.shape) && !!c && Object.keys(c).length === 4 && c.version === 1
    && [c.centerX, c.centerY, c.zoom].every(Number.isFinite)
    && c.centerX >= 0 && c.centerX <= 1 && c.centerY >= 0 && c.centerY <= 1 && c.zoom >= 1 && c.zoom <= 3;
}
export function cropRectangle(width: number, height: number, crop: PhotoCrop) {
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0) ||
      !isPhoto({ assetId: '11111111-1111-4111-8111-111111111111', crop, shape: 'square', visible: true }))
    throw new Error('invalidPhotoCrop');
  const size = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom));
  const x = Math.max(0, Math.min(width - size, Math.round(crop.centerX * width - size / 2)));
  const y = Math.max(0, Math.min(height - size, Math.round(crop.centerY * height - size / 2)));
  return { x, y, size, crop: { ...crop, centerX: (x + size / 2) / width, centerY: (y + size / 2) / height } };
}

/** Allowlisted operational metadata; never file names, paths, bytes or credentials. */
export const photoFailurePhases = ["configuration", "input", "normalize", "reserve", "storage_write", "storage_verify", "finalize", "cleanup", "read", "delete"] as const;
export type PhotoFailurePhase = typeof photoFailurePhases[number];
export const isPhotoFailurePhase = (value: unknown): value is PhotoFailurePhase => typeof value === "string" && photoFailurePhases.some(phase => phase === value);
