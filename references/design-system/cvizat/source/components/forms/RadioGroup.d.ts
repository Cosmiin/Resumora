/** Single choice among 2–5 visible options, as cards or plain radios. */
export interface RadioGroupProps {
  label?: string;
  name?: string;
  options: Array<string | { value: string; label: React.ReactNode; description?: React.ReactNode }>;
  value?: string;
  onChange?: (value: string) => void;
  variant?: 'card' | 'plain';
  direction?: 'column' | 'row';
}
