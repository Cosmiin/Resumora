/** Labelled text input or textarea: soft-filled, 48px, 12px radius, pine focus ring. */
export interface FieldProps {
  id?: string;
  label?: string;
  /** Helper text — explain why we ask */
  hint?: string;
  /** Replaces hint; say how to fix it */
  error?: string;
  /** Replaces hint; confirms something worked ("Looks right") */
  success?: string;
  optional?: boolean;
  /** Leading Lucide icon */
  icon?: string;
  /** Trailing text, e.g. "years", "RON" */
  suffix?: string;
  multiline?: boolean;
  rows?: number;
  /** Shows a live counter (soft limit; turns rose when over) */
  maxLength?: number;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string, e: React.ChangeEvent) => void;
  type?: 'text' | 'email' | 'url' | 'tel' | 'password' | 'number';
  disabled?: boolean;
  size?: 'sm' | 'md';
}
