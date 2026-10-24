/** Resumora logo: an open door with sunrise light (marigold → peach) spilling out, plus the outlined "Resumora" wordmark. */
export interface LogoProps {
  /** full = mark + wordmark lockup; mark = app icon/favicon glyph; wordmark = text only */
  variant?: 'full' | 'mark' | 'wordmark';
  /** default on light; inverse on pine/ink; mono for single-colour print */
  tone?: 'default' | 'inverse' | 'mono';
  /** Height in px (mark is square) */
  size?: number;
  title?: string;
  /** Light rays beside the door. Defaults to on at ≥24px, off below (cleaner at favicon sizes). */
  rays?: boolean;
}
