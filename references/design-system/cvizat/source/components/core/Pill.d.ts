/** Small status label. Colour is always paired with words (and ideally an icon). */
export interface PillProps {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  /** Lucide icon name */
  icon?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
  /** tag = 6px corners (default, for statuses); round = full pill (for filters/counts) */
  shape?: 'tag' | 'round';
}
