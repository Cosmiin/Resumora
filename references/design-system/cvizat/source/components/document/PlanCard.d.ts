/** Selectable subscription term (1/3/6 months). Prices are placeholders until approved. */
export interface PlanCardProps {
  term: React.ReactNode;
  /** Use "— RON" until prices are decided */
  price?: React.ReactNode;
  note?: React.ReactNode;
  features?: React.ReactNode[];
  selected?: boolean;
  badge?: React.ReactNode;
  onSelect?: () => void;
}
