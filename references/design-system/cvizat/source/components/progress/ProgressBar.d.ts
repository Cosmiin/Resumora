/** Horizontal bar for coverage per category or completion. */
export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: React.ReactNode;
  valueLabel?: React.ReactNode;
  tone?: 'primary' | 'warn' | 'muted';
  height?: number;
}
