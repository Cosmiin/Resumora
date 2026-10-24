/** Collapsible group of findings in the gap analysis ("Ready to add", "Already strong"…). */
export interface FindingGroupProps {
  tone?: 'good' | 'info' | 'warn' | 'neutral';
  icon?: string;
  title: React.ReactNode;
  count?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** KeywordRow children */
  children?: React.ReactNode;
  defaultOpen?: boolean;
}
