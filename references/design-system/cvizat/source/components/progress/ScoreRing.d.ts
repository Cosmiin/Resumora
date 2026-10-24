/** 0–100 ring for Fit / Match. Secondary to the plain-language verdict; never a hiring probability. */
export interface ScoreRingProps {
  value?: number;
  size?: number;
  label?: React.ReactNode;
  caption?: React.ReactNode;
  /** Shows "was N" for before/after */
  previous?: number;
  /** Dashed empty ring + "Not tested" (e.g. PDF readability before a real test) */
  untested?: boolean;
}
