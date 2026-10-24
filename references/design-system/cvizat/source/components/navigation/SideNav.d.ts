/** Persistent left navigation — four places max (Home, My CV, Jobs, Account). */
export interface SideNavProps {
  items: Array<{ value: string; label: string; icon: string; badge?: React.ReactNode }>;
  value: string;
  onChange?: (value: string) => void;
  footer?: React.ReactNode;
}
