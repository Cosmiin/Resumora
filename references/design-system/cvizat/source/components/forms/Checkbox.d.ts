/** Custom checkbox (22px, 7px radius, pine fill with tactile under-shadow); plain or card. */
export interface CheckboxProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean, e: React.ChangeEvent) => void;
  disabled?: boolean;
  /** card = bordered row that tints pine when checked */
  variant?: 'plain' | 'card';
}
