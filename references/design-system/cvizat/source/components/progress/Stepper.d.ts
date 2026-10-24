/** Guided-flow progress: where am I, what's next. */
export interface StepperProps {
  /** Short step names, 3–5 */
  steps: string[];
  /** 0-indexed current step */
  current: number;
  /** Allows jumping back to completed steps */
  onStepClick?: (index: number) => void;
}
