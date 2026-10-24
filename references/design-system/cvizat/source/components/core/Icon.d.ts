/** Lucide icon (2px stroke) rendered with currentColor via CSS mask. */
export interface IconProps {
  /** Lucide icon name, kebab-case, e.g. "file-text", "sparkles", "check" */
  name: string;
  /** px. 16 inline, 18 default, 20–24 feature */
  size?: number;
  color?: string;
  /** Accessible label; omit for decorative icons */
  label?: string;
  style?: React.CSSProperties;
}
