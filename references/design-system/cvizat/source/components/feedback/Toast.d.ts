/** Transient confirmation at the bottom centre, with optional Undo. */
export interface ToastProps {
  children: React.ReactNode;
  icon?: string;
  /** e.g. "Undo" */
  action?: string;
  onAction?: () => void;
  /** false to render inline (docs/cards) */
  floating?: boolean;
}
