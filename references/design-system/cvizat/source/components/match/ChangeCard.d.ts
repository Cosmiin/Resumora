/** One proposed CV change, before/after, individually approvable. */
export interface ChangeCardProps {
  /** e.g. "Summary", "BridgeWorks · new bullet" */
  section: React.ReactNode;
  /** Evidence basis, e.g. "From your Base CV" */
  source?: React.ReactNode;
  before?: React.ReactNode;
  after: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Why this helps for this job */
  why?: React.ReactNode;
}
