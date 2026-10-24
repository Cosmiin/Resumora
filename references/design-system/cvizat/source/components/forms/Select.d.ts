/**
 * Custom dropdown (listbox) in the Field shell: soft trigger, floating 14px-radius menu, icons,
 * descriptions, groups, optional search, full keyboard support (arrows, Home/End, Enter, Esc, type-ahead).
 * @startingPoint section="Forms" subtitle="Custom dropdown with icons, descriptions and search" viewport="700x900"
 */
export interface SelectOption {
  value: string;
  label: string;
  /** One short line under the label */
  description?: string;
  /** Lucide icon in a 32px tinted tile; also shown in the trigger when selected */
  icon?: string;
  /** Group header shown above the first option of each group */
  group?: string;
  disabled?: boolean;
}
export interface SelectProps {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  /** Fixed leading icon in the trigger (overrides the selected option's icon) */
  icon?: string;
  options: Array<string | SelectOption>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** RO: "Alege o opțiune" */
  placeholder?: string;
  /** Adds a filter box (diacritic-insensitive: "brasov" finds "Brașov"). Use for 8+ options. */
  searchable?: boolean;
  /** RO: "Caută…" */
  searchPlaceholder?: string;
  /** RO: "Niciun rezultat" */
  emptyText?: string;
  /** Docs/thumbnails only */
  defaultOpen?: boolean;
}
