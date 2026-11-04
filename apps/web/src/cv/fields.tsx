import { MAX_TEXT } from "@resumora/shared";

export function TextField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "url";
  placeholder?: string;
  /** Defaults to the schema's normal text limit. */
  maxLength?: number;
}) {
  const { label, value, onChange, multiline, type = "text", placeholder, maxLength = MAX_TEXT } = props;
  return (
    <label>
      {label}
      {multiline ? (
        <textarea rows={4} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} placeholder={placeholder} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** A YYYY-MM or YYYY date, typed as text so a year on its own is allowed. */
export function DateField(props: { label: string; value: string; onChange(value: string): void }) {
  return <TextField {...props} placeholder="YYYY-MM" maxLength={7} />;
}

/** Returns a copy of `obj` with `key` set — used to update one field of a list item. */
export function set<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

export function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
