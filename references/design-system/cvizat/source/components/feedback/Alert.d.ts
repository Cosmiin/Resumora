/** Inline message box. Used for the persistent "needs checking" eligibility warning. */
export interface AlertProps {
  tone?: 'info' | 'good' | 'warn' | 'bad' | 'neutral';
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** A Button placed at the right */
  action?: React.ReactNode;
  /** Override Lucide icon */
  icon?: string;
}
