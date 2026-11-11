import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

export type ChipOption = { value: string; label: string };

/**
 * Tappable answer options: a radio group that looks like pills. The question names the group:
 * pass it as `legend` (visible, e.g. a CoachNote) or `label` (screen readers only).
 */
export function ChipGroup(props: {
  options: ChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  legend?: ReactNode;
  label?: string;
}) {
  const { options, value, onChange, legend, label } = props;
  const name = useId();
  return (
    <fieldset className="ui-chips">
      <legend className={legend ? "ui-chips-legend" : "ui-sr"}>{legend ?? label}</legend>
      {options.map((option) => (
        <label className="ui-chip" key={option.value}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span className="ui-chip-mark" aria-hidden="true">
            <Check size={16} strokeWidth={2.6} />
          </span>
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A small dashed label for a fact about an item, e.g. "Inferred from your CV". Not interactive. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="ui-tag">{children}</span>;
}
