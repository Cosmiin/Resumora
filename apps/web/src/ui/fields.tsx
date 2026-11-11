import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  /** Shown under the label; read out with the control. */
  hint?: string;
  /** Says what is wrong and what to do; marks the control invalid. */
  error?: string;
  /** Keeps the label for screen readers only (e.g. a search box with a visible button). */
  hideLabel?: boolean;
};

function useField({ label, hint, error, hideLabel }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = {
    id,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? (true as const) : undefined,
  };
  const wrap = (children: ReactNode) => (
    <div className="ui-field">
      <label className={hideLabel ? "ui-sr" : "ui-field-label"} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="ui-field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span className="ui-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
  return { control, wrap };
}

type Native<T> = Omit<T, "className" | "id" | "aria-describedby" | "aria-invalid">;

export function Input({ label, hint, error, hideLabel, ...rest }: FieldProps & Native<InputHTMLAttributes<HTMLInputElement>>) {
  const { control, wrap } = useField({ label, hint, error, hideLabel });
  return wrap(<input {...rest} {...control} className="ui-input" />);
}

export function Textarea({ label, hint, error, hideLabel, rows = 3, ...rest }: FieldProps & Native<TextareaHTMLAttributes<HTMLTextAreaElement>>) {
  const { control, wrap } = useField({ label, hint, error, hideLabel });
  return wrap(<textarea {...rest} {...control} rows={rows} className="ui-input" />);
}

export function Select({ label, hint, error, hideLabel, children, ...rest }: FieldProps & Native<SelectHTMLAttributes<HTMLSelectElement>>) {
  const { control, wrap } = useField({ label, hint, error, hideLabel });
  return wrap(
    <select {...rest} {...control} className="ui-input">
      {children}
    </select>,
  );
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & { label: ReactNode };

export function Checkbox({ label, ...rest }: CheckProps) {
  return (
    <label className="ui-check">
      <input {...rest} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

/** One radio in a group you lay out yourself. For tappable answer options use `ChipGroup`. */
export function Radio({ label, ...rest }: CheckProps) {
  return (
    <label className="ui-check">
      <input {...rest} type="radio" />
      <span>{label}</span>
    </label>
  );
}
