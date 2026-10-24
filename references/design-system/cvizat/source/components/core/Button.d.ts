/**
 * The one way to trigger an action. One primary per screen.
 * @startingPoint section="Core" subtitle="Primary, secondary, ghost and danger buttons" viewport="700x260"
 */
export interface ButtonProps {
  /** primary = the screen's single main action; secondary = alternatives; ghost = low-emphasis/inline; danger = destructive */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name shown before the label */
  icon?: string;
  /** Lucide icon name shown after the label (e.g. "arrow-right" for "next step") */
  iconRight?: string;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  href?: string;
  style?: React.CSSProperties;
}
