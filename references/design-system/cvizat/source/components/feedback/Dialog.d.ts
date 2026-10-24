/** Modal for focused decisions (explain a suggestion, confirm a Base update). */
export interface DialogProps {
  open?: boolean;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, primary last (right) */
  footer?: React.ReactNode;
  onClose?: () => void;
  width?: number;
  /** Render without backdrop (for docs/cards) */
  inline?: boolean;
}
