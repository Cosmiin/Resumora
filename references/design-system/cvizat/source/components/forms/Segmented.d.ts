/** Segmented control for switching views of the same content (2–4 options). */
export interface SegmentedProps {
  options: Array<string | { value: string; label: string; icon?: string }>;
  value: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}
