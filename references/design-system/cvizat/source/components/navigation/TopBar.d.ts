/** Header bar for focused flows: back/exit, title, centred stepper, right actions. */
export interface TopBarProps {
  title?: React.ReactNode;
  /** Back / exit button */
  back?: React.ReactNode;
  right?: React.ReactNode;
  /** Centre slot, usually a Stepper */
  children?: React.ReactNode;
}
