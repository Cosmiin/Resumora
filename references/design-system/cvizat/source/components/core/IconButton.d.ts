/** Square icon-only button. Always carries an accessible label (also shown as tooltip). */
export interface IconButtonProps {
  icon: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}
